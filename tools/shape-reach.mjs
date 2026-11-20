// How does September 2019 PM2.5 respond to nearby fire? Three questions:
//  1. Shape: linear, logarithmic, square-root, power law, exponential or saturating?
//  2. Reach: which kernel radius (25–200 km) explains smoke best?
//  3. Timing: do fires in July, August or October add anything beyond September's?
// Comparisons use leave-one-regency-out CV on the PM2.5 scale (26 folds), so spatial
// leakage does not flatter any form. Needs .work/gis-inputs.json and
// .work/dated-points.json (tools/fire-profile.mjs). Writes data/shape.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { densityGrid, quantile, sum, zonalMeans } from './model.mjs';

const app = new URL('../', import.meta.url);
const inputs = JSON.parse(readFileSync(new URL('.work/gis-inputs.json', app)));
const dated = JSON.parse(readFileSync(new URL('.work/dated-points.json', app)));
const overview = JSON.parse(readFileSync(new URL('data/overview.json', app)));
const zones = inputs.zones;
const n = zones.length;
const y = zones.map(z => z.pm25);
const all = zones.map((_, i) => i);
const regencies = [...new Set(zones.map(z => z.regencyId))];
const ids = Object.keys(inputs.provinces);
const zoneIdx = Object.fromEntries(ids.map(id => [id, all.filter(i => zones[i].province === id)]));

function kde(radius, filter = () => true) {
  const out = new Array(n);
  for (const id of ids) {
    const grid = inputs.provinces[id];
    const pts = dated[id]['2019'].filter(filter);
    const flat = new Float64Array(pts.length * 3);
    pts.forEach(([x, yy, frp], k) => { flat[3 * k] = x; flat[3 * k + 1] = yy; flat[3 * k + 2] = frp; });
    const surface = densityGrid(grid, flat, radius).count;
    for (const [i, v] of zonalMeans(grid, surface, zoneIdx[id], zones).entries) out[i] = v;
  }
  return out;
}

// least squares for y = X b (small dense normal equations)
function ols(X, yy, rows) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
  for (const i of rows) for (let p = 0; p < k; p += 1) { b[p] += X[i][p] * yy[i]; for (let q = 0; q < k; q += 1) A[p][q] += X[i][p] * X[i][q]; }
  for (let p = 0; p < k; p += 1) { // Gauss-Jordan
    let m = p; for (let r = p + 1; r < k; r += 1) if (Math.abs(A[r][p]) > Math.abs(A[m][p])) m = r;
    [A[p], A[m]] = [A[m], A[p]]; [b[p], b[m]] = [b[m], b[p]];
    for (let r = 0; r < k; r += 1) if (r !== p) { const f = A[r][p] / A[p][p]; for (let q = p; q < k; q += 1) A[r][q] -= f * A[p][q]; b[r] -= f * b[p]; }
  }
  return Array.from(b, (v, p) => v / A[p][p]);
}
const dot = (row, beta) => row.reduce((s, v, j) => s + v * beta[j], 0);
const r2 = (obs, est) => { const m = sum(obs) / obs.length; return 1 - sum(obs.map((o, i) => (o - est[i]) ** 2)) / sum(obs.map(o => (o - m) ** 2)); };
const rmse = (obs, est) => Math.sqrt(sum(obs.map((o, i) => (o - est[i]) ** 2)) / obs.length);

// A "form" maps density d to design rows; `back` maps the fitted linear predictor to PM.
function evaluate(form, d) {
  const X = d.map(form.x);
  const target = y.map(form.t ?? (v => v));
  const back = form.back ?? (v => v);
  const fit = ols(X, target, all);
  const est = all.map(i => back(dot(X[i], fit)));
  const cv = new Array(n);
  for (const r of regencies) {
    const train = all.filter(i => zones[i].regencyId !== r);
    const beta = ols(X, target, train);
    for (const i of all) if (zones[i].regencyId === r) cv[i] = back(dot(X[i], beta));
  }
  const k = X[0].length;
  const rss = sum(y.map((o, i) => (o - est[i]) ** 2));
  return { coef: fit, r2: r2(y, est), cvR2: r2(y, cv), cvRMSE: rmse(y, cv), aic: n * Math.log(rss / n) + 2 * k };
}

const forms = {
  linear: { x: d => [1, d] },
  log: { x: d => [1, Math.log1p(d)] },
  sqrt: { x: d => [1, Math.sqrt(d)] },
  quadratic: { x: d => [1, d, d * d] },
  power: { x: d => [1, Math.log(d)], t: v => Math.log(v), back: v => Math.exp(v) },
  exponential: { x: d => [1, d], t: v => Math.log(v), back: v => Math.exp(v) },
};

// 1) radius sweep with the log form
const radii = [25, 50, 75, 100, 150, 200];
const reach = {};
const dens = {};
for (const r of radii) {
  dens[r] = kde(r);
  const e = evaluate(forms.log, dens[r]);
  reach[r] = { r2: e.r2, cvR2: e.cvR2, cvRMSE: e.cvRMSE };
  console.log('radius', r, JSON.stringify(reach[r]));
}
const bestR = radii.reduce((a, b) => (reach[b].cvR2 > reach[a].cvR2 ? b : a));

// 2) shape at 100 km (the published setting) and at the best radius
const shape = {};
for (const r of [100, bestR]) {
  shape[r] = {};
  // saturating: PM = a + b * (1 - exp(-d / s)), grid search on s
  let best = null;
  for (let s = 0.05; s <= 5; s *= 1.08) {
    const e = evaluate({ x: d => [1, 1 - Math.exp(-d / s)] }, dens[r]);
    if (!best || e.aic < best.aic) best = { ...e, scale: s };
  }
  shape[r].saturating = best;
  for (const [name, f] of Object.entries(forms)) shape[r][name] = evaluate(f, dens[r]);
  console.log('shape @', r, Object.entries(shape[r]).map(([k, v]) => `${k}: cvR2 ${v.cvR2.toFixed(3)} AIC ${v.aic.toFixed(1)}`).join(' | '));
}
// binned means (deciles of density) for the visual check of the curve
const d100 = dens[100];
const order = all.slice().sort((a, b) => d100[a] - d100[b]);
const bins = Array.from({ length: 10 }, (_, k) => {
  const part = order.slice(Math.floor(k * n / 10), Math.floor((k + 1) * n / 10));
  const pm = part.map(i => y[i]).sort((a, b) => a - b);
  return { density: sum(part.map(i => d100[i])) / part.length, pm: sum(pm) / pm.length, p25: quantile(pm, 0.25), p75: quantile(pm, 0.75), n: part.length };
});
const elasticity = shape[100].power.coef[1];
// marginal effect from the log model: dPM per +0.1 detections/km² at low vs high density
const b = shape[100].log.coef[1];
const marginal = [0.05, 0.5, 2].map(d => ({ density: d, perTenth: b * (Math.log1p(d + 0.1) - Math.log1p(d)) }));

// 3) timing: Sept PM on monthly fire (100 km kernel)
const monthly = Object.fromEntries([7, 8, 9, 10].map(m => [m, kde(100, p => p[3] === m)]));
const L = v => Math.log1p(v);
const single = Object.fromEntries([7, 8, 9, 10].map(m => [m, evaluate(forms.log, monthly[m])]));
const joint = evaluate({ x: (_, i) => [1, L(monthly[7][i]), L(monthly[8][i]), L(monthly[9][i]), L(monthly[10][i])] }, all.map((_, i) => i));
const sepOnly = single[9];
const sepAug = evaluate({ x: (_, i) => [1, L(monthly[8][i]), L(monthly[9][i])] }, all.map((_, i) => i));
// October fire, given September fire: does the "future" add anything? (placebo)
const sepOct = evaluate({ x: (_, i) => [1, L(monthly[9][i]), L(monthly[10][i])] }, all.map((_, i) => i));
// weekly windows inside September: does smoke track the most recent week?
const week = (a, z) => kde(100, p => p[4] >= a && p[4] <= z);
const sepWeeks = [[62, 68], [69, 75], [76, 82], [83, 91]].map(([a, z]) => ({ days: [a, z], ...(({ r2: rr, cvR2 }) => ({ r2: rr, cvR2 }))(evaluate(forms.log, week(a, z))) }));
console.log('single months', Object.fromEntries(Object.entries(single).map(([m, e]) => [m, e.cvR2.toFixed(3)])), 'Aug+Sep', sepAug.cvR2.toFixed(3), 'Sep+Oct', sepOct.cvR2.toFixed(3), 'all', joint.cvR2.toFixed(3));
console.log('Sept weeks', sepWeeks.map(w => w.cvR2.toFixed(3)).join(' '));

const strip = e => ({ coef: e.coef.map(v => Number(v.toFixed(4))), r2: +e.r2.toFixed(4), cvR2: +e.cvR2.toFixed(4), cvRMSE: +e.cvRMSE.toFixed(2), aic: +e.aic.toFixed(1), ...(e.scale ? { scale: +e.scale.toFixed(3) } : {}) });
writeFileSync(new URL('data/shape.json', app), JSON.stringify({
  note: 'Sept 2019 population-weighted PM2.5 vs count KDE; CV = leave-one-regency-out (26 folds).',
  reach: Object.fromEntries(Object.entries(reach).map(([r, v]) => [r, { r2: +v.r2.toFixed(4), cvR2: +v.cvR2.toFixed(4), cvRMSE: +v.cvRMSE.toFixed(2) }])),
  bestRadius: bestR,
  shape: Object.fromEntries(Object.entries(shape).map(([r, s]) => [r, Object.fromEntries(Object.entries(s).map(([k, e]) => [k, strip(e)]))])),
  bins: bins.map(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, +x.toFixed(3)]))),
  elasticity: +elasticity.toFixed(4), marginal: marginal.map(m => ({ density: m.density, perTenth: +m.perTenth.toFixed(2) })),
  timing: { single: Object.fromEntries(Object.entries(single).map(([m, e]) => [m, strip(e)])), sepAug: strip(sepAug), sepOct: strip(sepOct), all: strip(joint), sepWeeks },
}));
console.log('elasticity', elasticity.toFixed(3), 'marginal', JSON.stringify(marginal));
