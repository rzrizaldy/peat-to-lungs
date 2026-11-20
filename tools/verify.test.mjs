import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assemblePolygons, densityGrid, lonLat, MODES, RADII, YEARS, priorityRings, scores, signedArea, sum } from './model.mjs';

const json = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

test('quartic kernel conserves mass and keeps the count and FRP weighting distinct', () => {
  const grid = { width: 151, height: 151, step: 2000, x0: 0, y0: 0 };
  const point = [151000, -151000, 12];
  const density = densityGrid(grid, point, 100);
  assert(Math.abs(sum(density.count) * 4 - 1) < 1e-5);
  assert(Math.abs(sum(density.frp) * 4 - 12) < 1e-4);
  const center = 75 * grid.width + 75;
  assert.equal(density.count[center], 3 / (Math.PI * 10000));
  assert.equal(density.count[center + 50], 0);
  assert.equal(density.frp[center], 12 * density.count[center]);
});

test('priority boundaries preserve a hole and keep diagonal neighbors separate', () => {
  const withHole = new Set([0, 1, 2, 4, 6, 8, 9, 10]);
  const rings = priorityRings(4, 4, withHole);
  assert.equal(sum(rings.map(signedArea)), 8);
  assert.equal(assemblePolygons(rings)[0].length, 2);
  const relative = priorityRings(4, 4, [0, 5]);
  assert.equal(assemblePolygons(relative).length, 2);
  assert.equal(sum(relative.map(signedArea)), 2);
  const touchingHole = priorityRings(3, 3, [1, 2, 3, 5, 6, 7, 8]);
  assert.equal(sum(touchingHole.map(signedArea)), 7);
  assert.equal(assemblePolygons(touchingHole)[0].length, 2);
  for (const ring of touchingHole) assert.equal(new Set(ring.slice(0, -1).map(String)).size, ring.length - 1);
});

test('validation scores handle ties and negative R²', () => {
  const perfect = scores([1, 2, 2, 3], [1, 2, 2, 3]);
  assert.deepEqual(perfect, { r2: 1, rho: 1, mae: 0 });
  const reversed = scores([1, 2, 3], [3, 2, 1]);
  assert.equal(reversed.rho, -1);
  assert(reversed.r2 < 0);
});

test('significance checks are present and the index is not driven by raw density', async () => {
  const stats = await json('stats');
  for (const mode of MODES) {
    for (const radius of RADII) {
      const c = stats.calibration[`${mode}-${radius}`];
      assert.equal(c.n, 305);
      assert(c.p < 1e-6 && c.slope > 0);
      assert(c.bootstrap.lo > 0, 'regency-cluster bootstrap CI must exclude zero');
      assert(c.spatialCV.r2 > 0.2 && c.fixedEffects.withinR2 > 0.2);
      for (const id of ['ID14', 'ID62']) assert(c.withinProvince[id].p < 0.01);
    }
  }
  const best = stats.calibration['count-100'];
  assert(Math.abs(best.r2 - 0.5456) < 1e-3);
  const s = stats.sensitivity.years;
  // Published (log density) must not flag Riau 2026 cells that only have dense population.
  assert.equal(s[2026].published.ID14.people, 0);
  assert(s[2026].rawDensity.ID14.lowFireShare > 0.9);
});

test('all published scenarios preserve GIS totals and have complete valid layers', async () => {
  const [overview, geography, validation] = await Promise.all(['overview', 'geography', 'validation'].map(json));
  assert.equal(overview.zones.length, 305);
  assert.equal(new Set(overview.zones.map(z => z.id)).size, 305);
  assert.equal(geography.shapes.length, 305);
  const expect = { ID14: { n: 169, counts: [22874, 3158], pop: 6474029.153, pm: 101.673528 },
    ID62: { n: 136, counts: [80126, 164333], pop: 2700390.159, pm: 154.869554 } };
  for (const [id, province] of Object.entries(overview.provinces)) {
    assert.equal(province.n, expect[id].n);
    assert(Math.abs(province.population - expect[id].pop) < .001);
    assert(Math.abs(province.pm25 - expect[id].pm) < 1e-5);
    assert.deepEqual(YEARS.map(year => province.seasons[year].total), expect[id].counts);
  }
  for (const zone of overview.zones) {
    assert(lonLat(...zone.center).every((x, i) => Math.abs(x - zone.lonlat[i]) < 1e-7));
  }
  for (const mode of MODES) {
    for (const radius of RADII) {
      const metrics = validation[`${mode}-${radius}`];
      assert.equal(metrics.repetitions, 500);
      assert.equal(metrics.sampleSize, 92);
      assert.equal(metrics.example.length, 92);
      assert.equal(metrics.transfers.length, 2);
      assert(metrics.ranges.r2[1] <= metrics.ranges.r2[0]);
      assert(metrics.ranges.r2[0] <= metrics.ranges.r2[2]);
      for (const year of YEARS) {
        const scenario = await json(`scenario-${year}-${mode}-${radius}`);
        assert.deepEqual([scenario.year, scenario.mode, scenario.radius], [year, mode, radius]);
        assert.equal(scenario.indicators.length, 305);
        assert.equal(scenario.clusters.candidates.length, 4);
        assert.equal(sum(scenario.clusters.profiles.map(p => p.count)), 305);
        for (const [i, z] of scenario.indicators.entries()) {
          assert(Number.isFinite(z.exposure) && z.density >= 0);
          assert(z.priorityPeople <= overview.zones[i].population + 0.1);
          assert(z.cluster >= 0 && z.cluster < scenario.clusters.k);
          if (year === 2019) assert(Math.abs(z.exposure - overview.zones[i].pm25) < .001);
        }
        for (const [id, data] of Object.entries(scenario.provinces)) {
          const grid = geography.grids[id];
          assert.equal(Buffer.from(data.heat, 'base64').length, grid.cells.length);
          const classes = Buffer.from(data.index, 'base64');
          assert.equal(classes.length, grid.cells.length);
          assert(classes.every(x => x <= 7));
          const numCells = classes.filter(x => x === 7).length;
          assert.equal(data.priorityArea, numCells * (grid.step / 1000) ** 2);
          assert.equal(sum(data.priorityShapes.flat().map(signedArea)), numCells);
          const byDistrict = overview.zones.flatMap((z, i) => z.province === id ? [scenario.indicators[i].priorityPeople] : []);
          assert(Math.abs(sum(byDistrict) - data.priorityPeople) < .1);
        }
      }
    }
  }
});
