// Season profile of the raw VIIRS S-NPP detections, both provinces, 2019 vs 2026.
// Reads the coursework RawData folder read-only (PEAT_PROJECT_DIR) and writes
// .work/dated-points.json (for the lag test) and data/fire-profile.json.
//
//   PEAT_PROJECT_DIR=".../Rizaldy Project" node tools/fire-profile.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { albers } from './model.mjs';

const project = process.env.PEAT_PROJECT_DIR;
if (!project) throw new Error('Set PEAT_PROJECT_DIR to the "Rizaldy Project" folder.');
const app = new URL('../', import.meta.url);
const geography = JSON.parse(readFileSync(new URL('data/geography.json', app)));
const files = {
  2019: ['RawData/FIRMS_VIIRS_2019/viirs-snpp_2019_Indonesia.csv'],
  2026: ['RawData/FIRMS_VIIRS_2026/VIIRS_SNPP_SP_SumKal_2026-07.csv', 'RawData/FIRMS_VIIRS_2026/VIIRS_SNPP_NRT_SumKal_2026-08_10.csv'],
};
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};
const provinces = Object.fromEntries(Object.entries(geography.grids).map(([id, g]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of g.outline) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [id, { g, box: [x0, x1, y0, y1] }];
}));
const inside = (id, x, y) => {
  const { g, box } = provinces[id];
  if (x < box[0] || x > box[1] || y < box[2] || y > box[3]) return false;
  return g.outline.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));
};
const halo = 210e3; // dated points kept for kernels up to 200 km
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };

const dated = {};       // id -> year -> [[x, y, frp, month, dayOfSeason]]
const profile = {};
for (const [year, list] of Object.entries(files)) {
  for (const rel of list) {
    const text = readFileSync(join(project, rel), 'utf8');
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(',');
    const col = name => head.indexOf(name);
    const [iLat, iLon, iDate, iConf, iFrp, iDn, iType] = ['latitude', 'longitude', 'acq_date', 'confidence', 'frp', 'daynight', 'type'].map(col);
    for (let k = 1; k < lines.length; k += 1) {
      const f = lines[k].split(',');
      if (f.length < 5) continue;
      const date = f[iDate];
      if (date < `${year}-07-01` || date > `${year}-10-31`) continue;
      if (!['n', 'h'].includes(f[iConf])) continue;
      const frp = Number(f[iFrp]);
      if (!Number.isFinite(frp)) continue;
      const [x, y] = albers(Number(f[iLon]), Number(f[iLat]));
      const month = Number(date.slice(5, 7));
      const day = Math.round((Date.parse(date) - Date.parse(`${year}-07-01`)) / 864e5);
      for (const id of Object.keys(provinces)) {
        const b = provinces[id].box;
        if (x < b[0] - halo || x > b[1] + halo || y < b[2] - halo || y > b[3] + halo) continue;
        ((dated[id] ??= {})[year] ??= []).push([Math.round(x), Math.round(y), frp, month, day]);
        if (!inside(id, x, y)) continue;
        const p = ((profile[id] ??= {})[year] ??= { n: 0, months: [0, 0, 0, 0], night: 0, high: 0, frp: [], daily: new Array(123).fill(0), cells: new Map(), typeNot0: 0 });
        p.n += 1; p.months[month - 7] += 1; p.daily[day] += 1; p.frp.push(frp);
        if (f[iDn] === 'N') p.night += 1;
        if (f[iConf] === 'h') p.high += 1;
        if (iType >= 0 && f[iType] !== '0') p.typeNot0 += 1;
        const cell = `${Math.floor(x / 2000)},${Math.floor(y / 2000)}`;
        const days = p.cells.get(cell) ?? new Set();
        days.add(day); p.cells.set(cell, days);
      }
    }
  }
}
const out = {};
for (const [id, years] of Object.entries(profile)) {
  out[id] = {};
  for (const [year, p] of Object.entries(years)) {
    const fireDays = [...p.cells.values()].map(s => s.size);
    const busy = p.daily.map((v, d) => [v, d]).filter(([v]) => v >= Math.max(50, 0.01 * p.n));
    // longest run of consecutive days with at least 1% of the season's detections
    let run = 0, best = 0, prev = -2;
    for (const [, d] of busy) { run = d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const peakDay = p.daily.indexOf(Math.max(...p.daily));
    out[id][year] = {
      detections: p.n, months: p.months,
      nightShare: p.night / p.n, highConfShare: p.high / p.n, typeNot0: p.typeNot0,
      frpMedian: median(p.frp), frpTotalMW: p.frp.reduce((a, b) => a + b, 0),
      burningCells: p.cells.size,
      daysPerCellMedian: median(fireDays), cellsBurning5PlusDays: fireDays.filter(v => v >= 5).length,
      detectionsOnRepeatCells: [...p.cells.values()].filter(s => s.size >= 5).reduce((a, s) => a + 0, 0),
      busyDays: busy.length, longestBusyRun: best,
      peakDate: new Date(Date.parse(`${year}-07-01`) + peakDay * 864e5).toISOString().slice(0, 10), peakDetections: p.daily[peakDay],
      daily: p.daily,
    };
  }
}
mkdirSync(new URL('.work/', app), { recursive: true });
writeFileSync(new URL('.work/dated-points.json', app), JSON.stringify(dated));
writeFileSync(new URL('data/fire-profile.json', app), JSON.stringify(out));
for (const [id, years] of Object.entries(out)) for (const [y, p] of Object.entries(years)) {
  const { daily, ...rest } = p;
  console.log(id, y, JSON.stringify(rest, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
}
console.log('dated points (with 100 km halo):', Object.fromEntries(Object.entries(dated).map(([id, ys]) => [id, Object.fromEntries(Object.entries(ys).map(([y, a]) => [y, a.length]))])));
