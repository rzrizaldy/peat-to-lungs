// Significance and robustness checks for the 2019 calibration and the
// preparedness index. Reads the checked-in scenario snapshots (and, for the
// index sensitivity, the ignored .work/ inputs) and writes data/stats.json.
//
//   node tools/stats.mjs
//
// Why these tests: the 305 districts are spatially clustered, so an ordinary
// p-value overstates certainty. We therefore report (1) the plain OLS test,
// (2) a regency-cluster bootstrap for the slope, (3) Moran's I of the
// residuals, (4) leave-one-regency-out cross-validation, and (5) a
// province fixed-effects fit that removes the between-province gap.
import { readFile, writeFile } from 'node:fs/promises';
import {
  INDEX_WEIGHTS, MODES, PRIORITY_THRESHOLD, RADII, densityGrid, fitLine, normalizer, popScale,
  predict, quantile, scores, seedRandom, sum,
} from './model.mjs';

const data = new URL('../data/', import.meta.url);
const work = new URL('../.work/', import.meta.url);
const read = async (url) => JSON.parse(await readFile(url, 'utf8'));
const overview = await read(new URL('overview.json', data));
const zones = overview.zones;
const n = zones.length;
const y = zones.map(z => z.pm25);
const all = zones.map((_, i) => i);
const round = (v, p = 4) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(p)));

// Two-sided p-value for a t statistic. With df ≈ 300 the normal tail is
// accurate to well below the reporting precision; keep the exact form for
// small samples (within-province fits) via a continued-fraction beta.
function betacf(a, b, x) {
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
    c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const c of g) s += c / ++x;
  return -t + Math.log(2.5066282746310005 * s / z);
}
function tPValue(t, df) {
  const x = df / (df + t * t);
  const bt = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - lgamma(0.5) + (df / 2) * Math.log(x) + 0.5 * Math.log(1 - x));
  const ib = x < (df / 2 + 1) / (df / 2 + 0.5 + 1) ? bt * betacf(df / 2, 0.5, x) / (df / 2) : 1 - bt * betacf(0.5, df / 2, 1 - x) / 0.5;
  return Math.min(1, Math.max(0, ib));
}

function ols(indices, x) {
  const fit = fitLine(indices, x, y);
  const mx = sum(indices.map(i => x[i])) / indices.length;
  const sxx = sum(indices.map(i => (x[i] - mx) ** 2));
  const resid = indices.map(i => y[i] - (fit.intercept + fit.slope * x[i]));
  const df = indices.length - 2;
  const sigma2 = sum(resid.map(e => e * e)) / df;
  const se = Math.sqrt(sigma2 / sxx);
  const t = fit.slope / se;
  const my = sum(indices.map(i => y[i])) / indices.length;
  const sst = sum(indices.map(i => (y[i] - my) ** 2));
  return { ...fit, se, t, df, p: tPValue(Math.abs(t), df), r2: 1 - sum(resid.map(e => e * e)) / sst, resid };
}

// k-nearest-neighbour weights on projected district centres (row-standardized).
const K = 8;
const neighbours = zones.map((a, i) => zones.map((b, j) => [j, Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1])])
  .filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, K).map(([j]) => j));
function moransI(values) {
  const m = sum(values) / values.length;
  const dev = values.map(v => v - m);
  const denom = sum(dev.map(d => d * d));
  let num = 0;
  for (let i = 0; i < values.length; i += 1) for (const j of neighbours[i]) num += dev[i] * dev[j] / K;
  return num / denom;          // S0 = n with row-standardized weights
}
function moranTest(values, reps = 999, seed = 7) {
  const observed = moransI(values);
  const rng = seedRandom(seed);
  let extreme = 0;
  const copy = [...values];
  for (let r = 0; r < reps; r += 1) {
    for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    if (moransI(copy) >= observed) extreme += 1;
  }
  return { I: observed, expected: -1 / (values.length - 1), p: (extreme + 1) / (reps + 1), k: K, permutations: reps };
}

const regencies = [...new Set(zones.map(z => z.regencyId))];
const byRegency = Object.fromEntries(regencies.map(r => [r, all.filter(i => zones[i].regencyId === r)]));

function leaveOneRegencyOut(density) {
  const x = density.map(Math.log1p);
  const est = new Array(n);
  for (const r of regencies) {
    const train = all.filter(i => zones[i].regencyId !== r);
    const fit = fitLine(train, x, y);
    for (const i of byRegency[r]) est[i] = predict(fit, density[i]);
  }
  return scores(y, est);
}

function clusterBootstrap(density, reps = 2000, seed = 11) {
  const x = density.map(Math.log1p);
  const rng = seedRandom(seed);
  const slopes = [];
  for (let r = 0; r < reps; r += 1) {
    const sample = [];
    for (let k = 0; k < regencies.length; k += 1) sample.push(...byRegency[regencies[Math.floor(rng() * regencies.length)]]);
    slopes.push(fitLine(sample, x, y).slope);
  }
  slopes.sort((a, b) => a - b);
  return { lo: quantile(slopes, 0.025), hi: quantile(slopes, 0.975), share_positive: slopes.filter(s => s > 0).length / reps, reps, clusters: regencies.length };
}

// Province fixed effects: demean x and y within each of the 13 provinces; slope is the
// within-province association once province level gaps are removed.
function fixedEffects(density) {
  const x = density.map(Math.log1p);
  const groups = [...new Set(zones.map(z => z.province))].map(id => all.filter(i => zones[i].province === id));
  const xd = new Array(n), yd = new Array(n);
  for (const g of groups) {
    const mx = sum(g.map(i => x[i])) / g.length, my = sum(g.map(i => y[i])) / g.length;
    for (const i of g) { xd[i] = x[i] - mx; yd[i] = y[i] - my; }
  }
  const sxy = sum(all.map(i => xd[i] * yd[i])), sxx = sum(all.map(i => xd[i] ** 2)), syy = sum(all.map(i => yd[i] ** 2));
  const slope = sxy / sxx;
  const sse = sum(all.map(i => (yd[i] - slope * xd[i]) ** 2));
  const df = n - 1 - groups.length;
  const se = Math.sqrt(sse / df / sxx);
  return { slope, se, t: slope / se, p: tPValue(Math.abs(slope / se), df), withinR2: 1 - sse / syy };
}

function spearmanTest(indices, a, b, reps = 4999, seed = 3) {
  const obs = scores(indices.map(i => a[i]), indices.map(i => b[i])).rho;
  // rho computed via scores(observed, estimated) is symmetric in rank terms.
  const rng = seedRandom(seed);
  const shuffled = indices.map(i => b[i]);
  let extreme = 0;
  for (let r = 0; r < reps; r += 1) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if (Math.abs(scores(indices.map(i => a[i]), shuffled).rho) >= Math.abs(obs)) extreme += 1;
  }
  return { rho: obs, p: (extreme + 1) / (reps + 1), n: indices.length };
}

const calibration = {};
for (const mode of MODES) for (const radius of RADII) {
  const key = `${mode}-${radius}`;
  const scenario = await read(new URL(`scenario-2019-${key}.json`, data));
  const density = scenario.indicators.map(r => r.density);
  const x = density.map(Math.log1p);
  const fit = ols(all, x);
  const ci = [fit.slope - 1.968 * fit.se, fit.slope + 1.968 * fit.se];
  calibration[key] = {
    n, slope: round(fit.slope, 3), intercept: round(fit.intercept, 3), se: round(fit.se, 3),
    ci95: ci.map(v => round(v, 3)), t: round(fit.t, 2), p: fit.p, r2: round(fit.r2), pearson: round(Math.sign(fit.slope) * Math.sqrt(fit.r2)),
    bootstrap: Object.fromEntries(Object.entries(clusterBootstrap(density)).map(([k, v]) => [k, round(v, 3)])),
    moranResiduals: Object.fromEntries(Object.entries(moranTest(fit.resid)).map(([k, v]) => [k, round(v, 4)])),
    moranPM25: round(moransI(y)),
    spatialCV: Object.fromEntries(Object.entries(leaveOneRegencyOut(density)).map(([k, v]) => [k, round(v, 3)])),
    fixedEffects: Object.fromEntries(Object.entries(fixedEffects(density)).map(([k, v]) => [k, k === 'p' ? v : round(v, 4)])),
    // rank link inside each island, and inside the two ArcGIS focus provinces
    withinProvince: Object.fromEntries(['Sumatra', 'Kalimantan', 'ID14', 'ID62'].map(id => {
      const idx = all.filter(i => zones[i].island === id || zones[i].province === id);
      const s = spearmanTest(idx, y, x);
      return [id, { rho: round(s.rho, 3), p: round(s.p, 4), n: s.n }];
    })),
  };
  console.log(key, 'R2', calibration[key].r2, 'p', fit.p.toExponential(2), 'Moran resid', calibration[key].moranResiduals.I,
    'LORO R2', calibration[key].spatialCV.r2, 'FE within R2', calibration[key].fixedEffects.withinR2);
}

// Index sensitivity, count weighting at 100 km (the best-validated setting).
// Population density on a 2 km grid is extremely skewed (city cells reach
// tens of thousands per km²), so a raw z-score can let density alone push a
// cell over +1.5 SD. Compare the published index
// (log density) with the raw-density version, equal weights and no population term.
let sensitivity = null;
try {
  const inputs = await read(new URL('gis-inputs.json', work));
  const validation = await read(new URL('validation.json', data));
  const provinces = Object.entries(inputs.provinces);
  const cellKm2 = (inputs.provinces.ID14.step / 1000) ** 2;
  const variants = {
    published: { weights: INDEX_WEIGHTS, pop: popScale },
    rawDensity: { weights: INDEX_WEIGHTS, pop: v => v },
    equalWeights: { weights: [1 / 3, 1 / 3, 1 / 3], pop: popScale },
    noPopulation: { weights: [0.43, 0, 0.57], pop: popScale },
  };
  sensitivity = { setting: 'count-100', threshold: PRIORITY_THRESHOLD, baseline: 2019, years: {} };
  const ref = {};   // per variant: z-score yardsticks fixed on 2019, as in build-data.mjs
  for (const year of [2019, 2026]) {
    const surfaces = {};
    for (const [id, grid] of provinces) {
      const bin = await readFile(new URL(`fire-${id}-${year}.f32`, work));
      const pts = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
      const surface = densityGrid(grid, pts, 100).count;
      surfaces[id] = grid.cells.map(c => surface[c]);
    }
    const scenario = await read(new URL(`scenario-${year}-count-100.json`, data));
    const exposureZone = scenario.indicators.map(r => r.exposure);
    const out = {};
    for (const [name, v] of Object.entries(variants)) {
      const cols = Object.fromEntries(provinces.map(([id, grid]) => [id, [
        surfaces[id], grid.pop.map(p => v.pop(p / cellKm2)), year === 2019 ? grid.pm : grid.zone.map(i => exposureZone[i]),
      ]]));
      const toZ = ref[name]?.toZ ?? v.weights.map((_, j) => normalizer(Object.values(cols).flatMap(c => c[j])));
      const idx = Object.fromEntries(provinces.map(([id, grid]) => [id, grid.cells.map((_, i) => sum(v.weights.map((w, j) => w * toZ[j](cols[id][j][i]))))]));
      const toIdx = ref[name]?.toIdx ?? normalizer(Object.values(idx).flat());
      ref[name] ??= { toZ, toIdx };
      const res = {};
      for (const [id, grid] of provinces) {
        const pri = new Set();
        idx[id].forEach((s, i) => { if (toIdx(s) >= PRIORITY_THRESHOLD) pri.add(grid.cells[i]); });
        const [, cells, people] = grid.populationLedger;
        let ppl = 0;
        cells.forEach((c, j) => { if (pri.has(c)) ppl += people[j]; });
        // share of priority cells whose fire z-score is below the mean
        let lowFire = 0;
        grid.cells.forEach((c, i) => { if (pri.has(c) && toZ[0](cols[id][0][i]) < 0) lowFire += 1; });
        res[id] = { areaKm2: pri.size * cellKm2, people: Math.round(ppl), lowFireShare: round(pri.size ? lowFire / pri.size : 0, 3) };
      }
      out[name] = res;
    }
    sensitivity.years[year] = out;
  }
  void validation;
  console.log(JSON.stringify(sensitivity, null, 1));
} catch (error) {
  console.warn('Index sensitivity skipped (needs .work/ inputs):', error.message);
}

// Exposure predictions outside the 2019 training range (2026 scenarios).
const extrapolation = {};
for (const mode of MODES) for (const radius of RADII) {
  const s = await read(new URL(`scenario-2026-${mode}-${radius}.json`, data));
  extrapolation[`${mode}-${radius}`] = s.indicators.filter(r => r.extrapolated).length;
}

const previous = await read(new URL('stats.json', data)).catch(() => null);
const result = { generated: 'tools/stats.mjs', calibration, extrapolation, sensitivity: sensitivity ?? previous?.sensitivity ?? null };
await writeFile(new URL('stats.json', data), JSON.stringify(result));
console.log('Wrote data/stats.json');
