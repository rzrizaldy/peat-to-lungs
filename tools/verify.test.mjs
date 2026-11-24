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
  const [stats, overview] = await Promise.all([json('stats'), json('overview')]);
  for (const mode of MODES) {
    for (const radius of RADII) {
      const c = stats.calibration[`${mode}-${radius}`];
      assert.equal(c.n, overview.zones.length);
      assert(c.p < 1e-6 && c.slope > 0);
      assert(c.bootstrap.lo > 0, 'regency-cluster bootstrap CI must exclude zero');
      assert(c.spatialCV.r2 > 0.2 && c.fixedEffects.withinR2 > 0.2);
      // within each island; Riau has only 12 kabupaten, too few for a within-province test (that runs by kecamatan in ArcGIS)
      for (const id of ['Sumatra', 'Kalimantan']) assert(c.withinProvince[id].p < 0.01, id);
    }
  }
  const best = stats.calibration['count-100'];
  assert(Math.abs(best.r2 - 0.5972) < 1e-3);
  const s = stats.sensitivity.years;
  // Published (log density) must not flag Riau 2026 cells that only have dense population.
  assert.equal(s[2026].published.ID14.people, 0);
  assert(s[2026].rawDensity.ID14.lowFireShare > 0.9);
});

test('all published scenarios preserve GIS totals and have complete valid layers', async () => {
  const [overview, geography, validation] = await Promise.all(['overview', 'geography', 'validation'].map(json));
  const n = overview.zones.length;
  // 13 provinces, every area a kabupaten/kota
  assert(overview.zones.every(z => z.level === 'kabupaten'));
  assert.equal(Object.keys(overview.provinces).length, 13);
  assert.equal(new Set(overview.zones.map(z => z.id)).size, n);
  assert.equal(geography.shapes.length, n);
  // the ArcGIS deep-dive provinces must match the validated ArcGIS totals
  // (hotspots exactly; population within 0.1% and PM2.5 within 0.1 µg/m³, since seam pixels are assigned differently)
  const expect = { ID14: { n: 12, counts: [22874, 3158], pop: 6474029.153, pm: 101.673528 },
    ID62: { n: 14, counts: [80126, 164333], pop: 2700390.159, pm: 154.869554 } };
  for (const [id, province] of Object.entries(overview.provinces)) {
    const zones = overview.zones.filter(z => z.province === id);
    assert.equal(province.n, zones.length);
    assert.deepEqual(YEARS.map(year => province.seasons[year].total), YEARS.map((_, i) => sum(zones.map(z => z.counts[i]))));
    if (!expect[id]) continue;
    assert.equal(province.n, expect[id].n);
    assert(Math.abs(province.population / expect[id].pop - 1) < 1e-3);
    assert(Math.abs(province.pm25 - expect[id].pm) < 0.1);
    assert.deepEqual(YEARS.map(year => province.seasons[year].total), expect[id].counts);
  }
  for (const zone of overview.zones) {
    assert(lonLat(...zone.center).every((x, i) => Math.abs(x - zone.lonlat[i]) < 1e-7));
  }
  for (const mode of MODES) {
    for (const radius of RADII) {
      const metrics = validation[`${mode}-${radius}`];
      assert.equal(metrics.repetitions, 500);
      assert.equal(metrics.sampleSize, Math.round(n * 0.3));
      assert.equal(metrics.example.length, Math.round(n * 0.3));
      assert.equal(metrics.transfers.length, 2);
      assert(metrics.ranges.r2[1] <= metrics.ranges.r2[0]);
      assert(metrics.ranges.r2[0] <= metrics.ranges.r2[2]);
      for (const year of YEARS) {
        const scenario = await json(`scenario-${year}-${mode}-${radius}`);
        assert.deepEqual([scenario.year, scenario.mode, scenario.radius], [year, mode, radius]);
        assert.equal(scenario.indicators.length, n);
        assert.equal(scenario.clusters.candidates.length, 4);
        assert.equal(sum(scenario.clusters.profiles.map(p => p.count)), n);
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

test('opening map grid keeps national population, land area and the study-province fire totals', async () => {
  const [atlas, bounds] = await Promise.all([json('atlas'), json('atlas-bounds')]);
  const decode = (b64, Type) => new Type(new Uint8Array(Buffer.from(b64, 'base64')).buffer);
  const region = decode(atlas.region, Uint16Array), pop = decode(atlas.pop, Uint32Array), area = decode(atlas.area, Uint16Array);
  const idx = decode(atlas.idx, Uint32Array), f26 = decode(atlas.fire2026, Uint16Array), cover = decode(atlas.cover, Uint8Array);
  assert.equal(idx.length, atlas.n);
  assert.equal(new Set(idx).size, atlas.n, 'cells are unique');
  assert.equal(bounds.regencies.length, 522);
  assert.equal(bounds.provinces.length, 34);
  const total = Array.from(pop).reduce((a, b) => a + b, 0);
  assert(Math.abs(total - 273748190) / 273748190 < 1e-4, `WorldPop total ${total}`);
  const land = Array.from(area).reduce((a, b) => a + b, 0) / 100;
  assert(land > 1.88e6 && land < 1.93e6, `land ${land}`);
  const fires = code => [0, 1].map(y => bounds.regencies.filter(r => r.province === code).reduce((s, r) => s + r.fires[y], 0));
  assert.deepEqual(fires('ID14'), [22874, 3158]);
  assert.deepEqual(fires('ID62'), [80126, 164333]);
  const riauPop = Array.from(pop).reduce((s, p, i) => s + (bounds.regencies[region[i]].province === 'ID14' ? p : 0), 0);
  assert(Math.abs(riauPop - 6474029) / 6474029 < 0.01, `Riau population ${riauPop}`);
  for (let i = 0; i < atlas.n; i += 1) if (!cover[i]) assert.equal(f26[i], 0, '2026 fires only inside the download extent');
});
