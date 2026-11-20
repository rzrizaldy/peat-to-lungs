import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  INDEX_WEIGHTS, MODES, PRIORITY_THRESHOLD, RADII, YEARS, assemblePolygons, cluster,
  densityGrid, lonLat, normalizer, popScale, predict, priorityRings, quantile, signedArea, sum,
  validate, zonalMeans,
} from './model.mjs';

const work = new URL('../.work/', import.meta.url);
const out = new URL('../data/', import.meta.url);
await mkdir(out, { recursive: true });
const inputs = JSON.parse(await readFile(new URL('gis-inputs.json', work), 'utf8'));
const { zones, provinces } = inputs;
assert.equal(new Set(zones.map(z => z.id)).size, zones.length);
const round = (value, places = 5) => Number(value.toFixed(places));
const snapshots = new Map();
const stage = (name, value) => snapshots.set(name, JSON.stringify(value));
// regression check: the two ArcGIS focus provinces must keep their validated season totals
const expected = { ID14: [22874, 3158], ID62: [80126, 164333] };
const provinceEntries = Object.entries(provinces);
const compactGrids = {};
const metadata = {};
const zoneIndices = {};

for (const [id, grid] of provinceEntries) {
  const indices = zones.flatMap((zone, i) => zone.province === id ? [i] : []);
  zoneIndices[id] = indices;
  assert.equal(grid.cells.length, new Set(grid.cells).size);
  assert.equal(grid.cells.length, grid.zone.length);
  assert(grid.pm.every(Number.isFinite));
  assert(Math.abs(sum(grid.pop) - sum(indices.map(i => zones[i].population))) < 0.2);
  const { width, height, step, x0, y0, cells, outline } = grid;
  compactGrids[id] = { width, height, step, x0, y0, cells, outline, island: grid.island, name: grid.name, short: grid.short };
  const area = sum(indices.map(i => zones[i].area));
  const population = sum(indices.map(i => zones[i].population));
  const peat = sum(indices.map(i => zones[i].peat));
  const forest = sum(indices.map(i => zones[i].forest));
  const loss = sum(indices.map(i => zones[i].loss));
  const pm25 = sum(indices.map(i => zones[i].population * zones[i].pm25)) / population;
  metadata[id] = { name: grid.name, short: grid.short, island: grid.island, area, population, peat, forest, loss, pm25, n: indices.length,
    pmFallbackCells: grid.pmFallbackCells, nativeSeamPixels: grid.nativeSeamPixels, seasons: {} };
  for (const [i, year] of YEARS.entries()) {
    const counts = grid.seasons[year];
    assert.equal(sum(counts.months), counts.total);
    assert.equal(sum(indices.map(j => zones[j].counts[i])), counts.total);
    if (expected[id]) assert.equal(counts.total, expected[id][i], `${id} ${year} hotspot total`);
    metadata[id].seasons[year] = {
      ...counts,
      // Hotspots per 100 km² of each land stratum.
      rates: [
        100 * counts.peat / peat, 100 * (counts.total - counts.peat) / (area - peat),
        100 * counts.cleared / loss, 100 * counts.remaining / (forest - loss),
      ],
    };
  }
}
for (const z of zones) {
  assert(z.population >= 0 && z.area > 0 && z.pm25 > 0 && z.peatLoss >= 0);
  const transform = lonLat(...z.center);
  assert(Math.abs(transform[0] - z.lonlat[0]) < 1e-7 && Math.abs(transform[1] - z.lonlat[1]) < 1e-7);
}
stage('geography.json', {
  base: inputs.base, grids: compactGrids, shapes: zones.map(z => z.shape),
});
stage('overview.json', { zones: zones.map(({ shape, ...other }) => other), provinces: metadata, islands: inputs.islands,
  config: { radii: RADII, years: YEARS, weights: INDEX_WEIGHTS, threshold: PRIORITY_THRESHOLD,
    cellKm: provinces.ID14.step / 1000 } });

const points = {};
for (const [id] of provinceEntries) {
  points[id] = {};
  for (const year of YEARS) {
    const bin = await readFile(new URL(`fire-${id}-${year}.f32`, work));
    const vector = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
    assert.equal(vector.length / 3, provinces[id].seasons[year].buffer);
    assert(vector.every(Number.isFinite));
    points[id][year] = vector;
  }
}
const analysis = {};
for (const radius of RADII) {
  const raw = Object.fromEntries(YEARS.map(year => [year, Object.fromEntries(
    provinceEntries.map(([id, grid]) => [id, densityGrid(grid, points[id][year], radius)]),
  )]));
  for (const mode of MODES) {
    const key = `${mode}-${radius}`;
    const surfaces = Object.fromEntries(YEARS.map(year => [year, {}]));
    const localDensity = {};
    const fallback = new Set();
    for (const year of YEARS) {
      localDensity[year] = new Array(zones.length);
      for (const [id, grid] of provinceEntries) {
        const surface = raw[year][id][mode];
        const summary = zonalMeans(grid, surface, zoneIndices[id], zones);
        for (const [i, avg] of summary.entries) localDensity[year][i] = avg;
        summary.fallback.forEach(value => fallback.add(value));
        surfaces[year][id] = grid.cells.map(cell => surface[cell]);
      }
      assert(localDensity[year].every(Number.isFinite));
      assert.equal(localDensity[year].filter(Number.isFinite).length, zones.length);
    }
    const commonFireScale = YEARS.flatMap(year => Object.values(surfaces[year]).flat())
      .sort((a, b) => a - b);
    const cap = quantile(commonFireScale, 0.98);
    const fit = validate(localDensity[2019], zones);
    const training = { min: Math.min(...localDensity[2019]), max: Math.max(...localDensity[2019]) };
    analysis[key] = { ...fit, training, fireScaleMax: cap, fallbackZones: [...fallback] };

    // One yardstick for both seasons: z-scores and the +1.5 SD priority cut are fixed on the
    // 2019 distribution, so a worse 2026 shows up as more priority area instead of being
    // re-standardised away. YEARS runs 2019 first.
    let reference = null;
    for (const year of YEARS) {
      const density = localDensity[year];
      const exposure = year === 2019 ? zones.map(z => z.pm25) : density.map(d => predict(fit.fitted, d));
      const clustering = cluster(zones.map((z, i) => [density[i], 100 * z.peatLoss / z.area,
        exposure[i], popScale(z.popDensity)]), zones.map(z => z.population));
      assert.equal(sum(clustering.profiles.map(p => p.count)), zones.length);
      assert.equal(clustering.candidates.length, 4);
      const gridColumns = Object.fromEntries(provinceEntries.map(([id, grid]) => [
        id, [surfaces[year][id], grid.pop.map(pop => popScale(pop / (grid.step / 1000) ** 2)),
          year === 2019 ? grid.pm : grid.zone.map(i => exposure[i])],
      ]));
      const toZ = reference?.toZ ?? INDEX_WEIGHTS.map((_, j) => normalizer(Object.values(gridColumns).flatMap(cols => cols[j])));
      const indices = Object.fromEntries(provinceEntries.map(([id, grid]) => [
        id, grid.cells.map((_, i) => sum(INDEX_WEIGHTS.map((weight, j) => weight * toZ[j](gridColumns[id][j][i])))),
      ]));
      const toIndexZ = reference?.toIndexZ ?? normalizer(Object.values(indices).flat());
      reference ??= { toZ, toIndexZ };
      const zoneMeans = new Float64Array(zones.length);
      const zoneCells = new Uint32Array(zones.length);
      const priorityPopulation = new Float64Array(zones.length);
      const provinceResults = {};
      for (const [id, grid] of provinceEntries) {
        const zScores = indices[id].map(toIndexZ);
        const priority = new Set();
        const classes = zScores.map((z, i) => {
          const zone = grid.zone[i];
          zoneMeans[zone] += z;
          zoneCells[zone] += 1;
          if (z >= PRIORITY_THRESHOLD) priority.add(grid.cells[i]);
          return Math.max(0, Math.min(7, Math.floor((z + 1.5) * 2) + 1));
        });
        const [ids, cells, people] = grid.populationLedger;
        for (const [j, cell] of cells.entries()) {
          if (priority.has(cell)) priorityPopulation[ids[j]] += people[j];
        }
        // A province can legitimately have no cell at +1.5 SD (Riau 2026 with few fires).
        assert(priority.size < grid.cells.length, `${id} ${year} ${key}: degenerate priority mask`);
        const rings = priorityRings(grid.width, grid.height, priority);
        assert.equal(sum(rings.map(signedArea)), priority.size, 'Polygon area differs from raster mask');
        const polygon = assemblePolygons(rings);
        provinceResults[id] = {
          heat: Buffer.from(surfaces[year][id].map(value => Math.round(255 * Math.min(1, value / cap))))
            .toString('base64'),
          index: Buffer.from(classes).toString('base64'),
          priorityShapes: polygon,
          priorityArea: priority.size * (grid.step / 1000) ** 2,
          priorityPeople: round(sum(zoneIndices[id].map(i => priorityPopulation[i])), 2),
        };
      }
      const indicators = zones.map((zone, i) => ({
        density: round(density[i]),
        exposure: round(exposure[i], 3),
        extrapolated: year === 2026 && (density[i] < training.min || density[i] > training.max),
        index: zoneCells[i] ? round(zoneMeans[i] / zoneCells[i]) : null,
        priorityPeople: round(priorityPopulation[i], 3),
        cluster: clustering.labels[i],
      }));
      for (const [i, record] of indicators.entries()) {
        assert(record.priorityPeople >= 0 && record.priorityPeople <= zones[i].population + 0.1,
          `Priority population exceeds zone population for ${zones[i].id}`);
        assert(Number.isFinite(record.exposure));
      }
      const { labels, ...groupSummary } = clustering;
      stage(`scenario-${year}-${key}.json`, { year, mode, radius, provinces: provinceResults,
        indicators, clusters: groupSummary });
      console.log(year, key, 'k =', clustering.k, 'population in priority grid',
        provinceResults.ID14.priorityPeople, provinceResults.ID62.priorityPeople);
    }
  }
}
stage('validation.json', analysis);
await Promise.all([...snapshots.entries()].map(([name, body]) => writeFile(new URL(name, out), body)));
console.log(`Verified 12 web scenarios and ${zones.length} areas.`);
