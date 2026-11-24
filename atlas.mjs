// Opening slide: full-bleed spike map of VIIRS fire detections on a 0.05° grid over Indonesia
// (data/atlas.json, data/atlas-bounds.json from tools/export-atlas.py), with a region picker,
// share-of-land / share-of-people bars and a strip that places every province or regency.
// Web Mercator over Esri Light Gray Canvas, the same basemap as the story's explorer.
// Plain scrolling passes through to the story deck; zoom needs pinch, Ctrl/⌘ + wheel or the buttons.
import { resizeCanvas } from './map.mjs';
import { lonLat } from './tools/model.mjs';

const root = document.documentElement;
const $ = id => document.getElementById(id);
const section = $('atlas');
const readJSON = async name => { const r = await fetch(new URL(`data/${name}`, import.meta.url)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); };

/* ================================================================ language (follows the deck's #language) */
let lang = root.lang === 'id' ? 'id' : 'en';
const T = {
  kicker: ['Where the fires burn, and who breathes the smoke', 'Di mana api menyala, dan siapa yang menghirup asapnya'],
  reset: ['Back to Indonesia', 'Kembali ke Indonesia'],
  share: ['Share of', 'Bagian'],
  area: ['Land area', 'Luas daratan'],
  equal: ['Equal', 'Sama besar'],
  more: ['The story ↓', 'Ceritanya ↓'],
  search: ['Search province or regency', 'Cari provinsi atau kabupaten/kota'],
  sub: ['of the land had heavy fire: 10+ detections in its 5 km cell, Jul–Oct {y}', 'daratan mengalami api berat: 10+ titik api di sel 5 km-nya, Jul–Okt {y}'],
  noData: ['No 2026 fire data here', 'Belum ada data api 2026 di sini'],
  noDataSub: ['The 2026 FIRMS download covers Sumatra and Kalimantan only.', 'Unduhan FIRMS 2026 hanya mencakup Sumatra dan Kalimantan.'],
  landFire: ['Land with heavy fire', 'Daratan dengan api berat'],
  landAny: ['Land with any fire', 'Daratan dengan api apa pun'],
  peopleFire: ['People in a heavy-fire cell', 'Warga di sel api berat'],
  pm35: ['PM₂.₅ above 35 µg/m³', 'PM₂.₅ di atas 35 µg/m³'],
  pm55: ['PM₂.₅ above 55 (unhealthy)', 'PM₂.₅ di atas 55 (tidak sehat)'],
  pm150: ['PM₂.₅ above 150 (very)', 'PM₂.₅ di atas 150 (sangat)'],
  note: ['Heavy fire = 10+ VIIRS detections in a 5 km cell over the season. People rows are shares of people. PM₂.₅ is the Sept 2019 monthly mean (WashU); 35/55/150 are US EPA 24-hour breakpoints, used as a guide. Tick = Indonesia.',
    'Api berat = 10+ titik api VIIRS di sel 5 km selama musim. Baris warga adalah bagian warga. PM₂.₅ adalah rata-rata bulanan Sept 2019 (WashU); 35/55/150 ambang 24 jam US EPA, sebagai panduan. Garis = Indonesia.'],
  note26: ['Heavy fire = 10+ VIIRS detections in a 5 km cell over the season. No PM₂.₅ estimate exists for 2026 at this resolution, so the smoke rows stay on 2019. Tick = Indonesia.',
    'Api berat = 10+ titik api VIIRS di sel 5 km selama musim. Belum ada estimasi PM₂.₅ 2026 pada resolusi ini, jadi baris asap tetap 2019. Garis = Indonesia.'],
  partial: ['2026 covers only the part of this region inside Sumatra and Kalimantan ({c} of its land).', '2026 hanya mencakup bagian wilayah ini di Sumatra dan Kalimantan ({c} daratannya).'],
  compare: ['Compare with {y}', 'Bandingkan dengan {y}'],
  detections: ['{n} fire detections', '{n} titik api'],
  fewer: ['{p} fewer than 2019', '{p} lebih sedikit dari 2019'],
  more2: ['{p} more than 2019', '{p} lebih banyak dari 2019'],
  ofPeople: ['Of {n} people,', 'Dari {n} warga,'],
  breathed: ['{p} breathed unhealthy air', '{p} menghirup udara tidak sehat'],
  inSept: ['in Sept 2019 and', 'pada Sept 2019 dan'],
  lived: ['{p} lived in a heavy-fire cell.', '{p} tinggal di sel api berat.'],
  metricFire: ['land with heavy fire', 'daratan dengan api berat'],
  metricPeople: ['people in a heavy-fire cell', 'warga di sel api berat'],
  metricSmoke: ['people in PM₂.₅ above 55 (2019)', 'warga di PM₂.₅ di atas 55 (2019)'],
  provinces: ['All provinces', 'Semua provinsi'],
  regencies: ['All regencies', 'Semua kabupaten/kota'],
  gCountry: ['Country', 'Negara'],
  gFire: ['Fire areas', 'Area kebakaran'],
  gIslands: ['Islands', 'Pulau'],
  gProvinces: ['Provinces', 'Provinsi'],
  gIn: ['Regencies in {n}', 'Kabupaten/kota di {n}'],
  gResults: ['Matches', 'Hasil'],
  belt: ['Peat fire belt (Sumatra + Kalimantan)', 'Sabuk api gambut (Sumatra + Kalimantan)'],
  deep: ['ArcGIS deep dive by kecamatan', 'Analisis rinci ArcGIS per kecamatan'],
  legendTitle: ['Fire detections per 100 km²', 'Titik api per 100 km²'],
  legendGhost: ['Outline: {y}', 'Garis: {y}'],
  legendSmoke: ['Sept 2019 PM₂.₅ above {t} µg/m³', 'PM₂.₅ Sept 2019 di atas {t} µg/m³'],
  legendPeople: ['People in heavy-fire cells', 'Warga di sel api berat'],
  legendPriority: ['Priority zone (index ≥ +1.5 SD)', 'Zona prioritas (indeks ≥ +1,5 SD)'],
  tipCell: ['5 km cell', 'Sel 5 km'],
  tipFire: ['{n} detections', '{n} titik api'],
  tipPeople: ['{n} people', '{n} warga'],
  tipPm: ['Sept 2019 PM₂.₅ {n} µg/m³', 'PM₂.₅ Sept 2019 {n} µg/m³'],
  study: ['<p><b>{people} people</b> in {name} live in priority zones in {y}, where fire, smoke and people overlap most (index ≥ +1.5 SD on the 2019 yardstick). They are outlined on the map.</p><a href="#priority">Who to prepare first ↓</a>',
    '<p><b>{people} warga</b> di {name} tinggal di zona prioritas pada {y}, tempat api, asap, dan penduduk paling bertumpuk (indeks ≥ +1,5 SD dengan tolok ukur 2019). Zona digaris di peta.</p><a href="#priority">Siapa yang disiapkan lebih dulu ↓</a>'],
  studyNone: ['<p>No part of {name} reaches the priority threshold in {y}.</p><a href="#priority">Who to prepare first ↓</a>',
    '<p>Tidak ada bagian {name} yang mencapai ambang prioritas pada {y}.</p><a href="#priority">Siapa yang disiapkan lebih dulu ↓</a>'],
  hint: ['Pinch, or hold Ctrl / ⌘ and scroll, to zoom. Scroll on for the story.', 'Cubit, atau tahan Ctrl / ⌘ sambil gulir, untuk zoom. Gulir terus untuk ceritanya.'],
  loading: ['Loading the fire grid…', 'Memuat grid api…'],
  failed: ['Could not load the map data. Reload the page.', 'Data peta tidak bisa dimuat. Muat ulang halaman.'],
  million: ['million', 'juta'],
  aria: ['Map of fire detections across Indonesia', 'Peta titik api di Indonesia'],
};
const t = (key, vars = {}) => T[key][lang === 'id' ? 1 : 0].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const nf = (v, d = 0) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pct = v => (v == null || Number.isNaN(v) ? '—' : v > 0 && v < 0.001 ? '<0.1%' : `${nf(v * 100, v < 0.1 ? 1 : 0)}%`);
const people = v => (v >= 1e6 ? `${nf(v / 1e6, v >= 1e8 ? 0 : 2)} ${t('million')}` : nf(Math.round(v / (v >= 1e4 ? 100 : 1)) * (v >= 1e4 ? 100 : 1)));

const ISLANDS = ['Sumatra', 'Java', 'Kalimantan', 'Bali & Nusa Tenggara', 'Sulawesi', 'Maluku', 'Papua'];
const ISLAND_ID = { Sumatra: 'Sumatera', Java: 'Jawa', Kalimantan: 'Kalimantan', 'Bali & Nusa Tenggara': 'Bali & Nusa Tenggara', Sulawesi: 'Sulawesi', Maluku: 'Maluku', Papua: 'Papua' };
// Sumatra and Kalimantan use the story's island colours; the rest are muted so the fire islands lead.
const ISLAND_COLOR = { Sumatra: '#3c8a3a', Kalimantan: '#6e5ac8', Java: '#5b86b0', 'Bali & Nusa Tenggara': '#a8954a', Sulawesi: '#b07090', Maluku: '#4f9c9a', Papua: '#8a7560' };
const DEEP_DIVE = { ID14: true, ID62: true };
const CITIES = [
  ['Jakarta', 106.85, -6.21, 1], ['Surabaya', 112.75, -7.25, 1], ['Medan', 98.67, 3.59, 1], ['Palembang', 104.76, -2.99, 1],
  ['Makassar', 119.43, -5.15, 1], ['Pekanbaru', 101.45, 0.51, 1], ['Pontianak', 109.34, -0.03, 1], ['Banjarmasin', 114.59, -3.32, 1],
  ['Palangka Raya', 113.92, -2.21, 1], ['Jambi', 103.61, -1.61, 1], ['Jayapura', 140.72, -2.53, 2], ['Padang', 100.36, -0.95, 2],
  ['Samarinda', 117.15, -0.5, 2], ['Balikpapan', 116.83, -1.24, 2], ['Denpasar', 115.22, -8.65, 2], ['Semarang', 110.42, -6.97, 2],
  ['Bandung', 107.61, -6.91, 2], ['Yogyakarta', 110.37, -7.8, 2], ['Bandar Lampung', 105.26, -5.43, 2], ['Bengkulu', 102.26, -3.8, 2],
  ['Banda Aceh', 95.32, 5.55, 2], ['Manado', 124.84, 1.47, 2], ['Kupang', 123.59, -10.17, 2], ['Ambon', 128.18, -3.7, 2],
  ['Mataram', 116.12, -8.58, 3], ['Palu', 119.87, -0.9, 3], ['Kendari', 122.51, -3.97, 3], ['Sorong', 131.25, -0.88, 3],
  ['Merauke', 140.4, -8.49, 3], ['Tanjung Pinang', 104.45, 0.92, 3], ['Batam', 104.03, 1.13, 3], ['Pangkal Pinang', 106.11, -2.13, 3],
  ['Dumai', 101.45, 1.67, 3], ['Sampit', 112.95, -2.53, 3], ['Pangkalan Bun', 111.62, -2.68, 3], ['Ketapang', 109.98, -1.85, 3],
  ['Tarakan', 117.59, 3.3, 3], ['Gorontalo', 123.06, 0.54, 3], ['Ternate', 127.38, 0.79, 3], ['Manokwari', 134.06, -0.86, 3],
  ['Kuala Kapuas', 114.39, -3.0, 3], ['Siak', 102.05, 0.8, 4], ['Bengkalis', 102.11, 1.47, 4], ['Pangkalan Kerinci', 101.86, 0.4, 4],
  ['Rengat', 102.55, -0.38, 4], ['Tembilahan', 103.15, -0.32, 4], ['Kayu Agung', 104.83, -3.39, 4], ['Muara Teweh', 114.89, -0.95, 4],
  ['Pulang Pisau', 114.25, -2.75, 4], ['Buntok', 114.84, -1.71, 4], ['Kasongan', 113.4, -1.89, 4], ['Mamuju', 118.89, -2.68, 4],
  ['Serang', 106.15, -6.12, 4], ['Sintang', 111.5, 0.07, 4], ['Muara Bungo', 102.12, -1.47, 4], ['Sekayu', 103.85, -2.88, 4],
];
const CITY_ZOOM = [0, 4.2, 5.4, 6.6, 7.4];

/* ================================================================ projection */
const TILE = 256;
const toWorld = (lon, lat) => [(lon + 180) / 360 * TILE, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * TILE];
const fromWorld = (x, y) => [x / TILE * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / TILE))) * 180 / Math.PI];

/* ================================================================ state */
const state = { region: 'ID', year: 2019, compare: false, people: false, smoke: 0, metric: 'fire', level: 'province', size: 'area' };
let cell, regions, boundsData, view = { cx: 0, cy: 0, z: 5 }, dirty = true, anim = null, visible = true;
const canvas = $('at-map'), ctx = canvas.getContext('2d');
const size = () => { const r = canvas.getBoundingClientRect(); return { W: r.width, H: r.height, r }; };

function decode(b64, Type) {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i);
  return new Type(u.buffer);
}
function ringsPath(list) {
  const path = new Path2D();
  for (const rings of list) for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = toWorld(ring[i] / 1000, ring[i + 1] / 1000);
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    path.closePath();
  }
  return path;
}

/* ================================================================ data model */
function build(atlas, bounds) {
  const g = atlas.grid, n = atlas.n, idx = decode(atlas.idx, Uint32Array);
  const c = {
    n, g, reg: decode(atlas.region, Uint16Array), area: decode(atlas.area, Uint16Array), pop: decode(atlas.pop, Uint32Array),
    pm: decode(atlas.pm25, Uint16Array), f: { 2019: decode(atlas.fire2019, Uint16Array), 2026: decode(atlas.fire2026, Uint16Array) },
    cover: decode(atlas.cover, Uint8Array), col: new Uint16Array(n), row: new Uint16Array(n), wx: new Float64Array(n), wy: new Float64Array(n),
    at: new Int32Array(g.cols * g.rows).fill(-1),
  };
  const provIndex = new Map(bounds.provinces.map((p, i) => [p.id, i]));
  const regProv = bounds.regencies.map(r => provIndex.get(r.province));
  const regCells = bounds.regencies.map(() => []);
  for (let i = 0; i < n; i += 1) {
    const k = idx[i]; c.col[i] = k % g.cols; c.row[i] = Math.floor(k / g.cols); c.at[k] = i;
    [c.wx[i], c.wy[i]] = toWorld(g.x0 + (c.col[i] + 0.5) * g.cell, g.y0 - (c.row[i] + 0.5) * g.cell);
    regCells[c.reg[i]].push(i);
  }
  const R = new Map();
  const add = (key, o) => R.set(key, { key, ...o, cells: Uint32Array.from(o.cells) });
  const cellsOf = list => list.flatMap(x => Array.from(R.get(x.id ?? x.key).cells));
  const sumFires = list => [0, 1].map(y => list.reduce((s, r) => s + r.fires[y], 0));
  const bbox = list => list.reduce((b, x) => [Math.min(b[0], x.bbox[0]), Math.min(b[1], x.bbox[1]), Math.max(b[2], x.bbox[2]), Math.max(b[3], x.bbox[3])], [999, 999, -999, -999]);
  bounds.regencies.forEach((r, j) => add(r.id, { kind: 'regency', name: () => r.name, parent: r.province, island: bounds.provinces[regProv[j]].island,
    bbox: r.bbox, fires: r.fires, cells: regCells[j], rings: [r.rings] }));
  bounds.provinces.forEach((p, i) => {
    const regs = bounds.regencies.filter((r, j) => regProv[j] === i);
    add(p.id, { kind: 'province', name: () => p.name, parent: `is:${p.island}`, island: p.island, bbox: p.bbox,
      fires: sumFires(regs), cells: cellsOf(regs), rings: [p.rings], deep: DEEP_DIVE[p.id] });
  });
  const provsOf = names => bounds.provinces.filter(p => names.includes(p.island));
  for (const island of ISLANDS) {
    const ps = provsOf([island]);
    add(`is:${island}`, { kind: 'island', name: () => (lang === 'id' ? ISLAND_ID[island] : island), parent: 'ID', island, bbox: bbox(ps),
      fires: sumFires(ps.map(p => R.get(p.id))), cells: cellsOf(ps), rings: ps.map(p => p.rings) });
  }
  const belt = provsOf(['Sumatra', 'Kalimantan']);
  add('belt', { kind: 'group', name: () => t('belt'), parent: 'ID', bbox: bbox(belt), fires: sumFires(belt.map(p => R.get(p.id))),
    cells: cellsOf(belt), rings: belt.map(p => p.rings) });
  add('ID', { kind: 'country', name: () => 'Indonesia', parent: null, bbox: [95, -11, 141, 6], fires: sumFires(bounds.provinces.map(p => R.get(p.id))),
    cells: Array.from({ length: n }, (_, i) => i), rings: bounds.provinces.map(p => p.rings) });
  return { c, R };
}

const FIRE_MIN = 10;                       // detections per 5 km cell and season that count as heavy fire
const statCache = new Map();
function stats(key, year) {
  const id = `${key}|${year}`;
  if (statCache.has(id)) return statCache.get(id);
  const r = regions.get(key), f = cell.f[year];
  let land = 0, landCov = 0, landFire = 0, landAny = 0, pop = 0, popCov = 0, popFire = 0, pmPop = 0;
  const over = { 35: 0, 55: 0, 150: 0 };
  for (const i of r.cells) {
    const a = cell.area[i] / 100, p = cell.pop[i];
    land += a; pop += p;
    if (year === 2019 || cell.cover[i]) {
      landCov += a; popCov += p;
      if (f[i]) landAny += a;
      if (f[i] >= FIRE_MIN) { landFire += a; popFire += p; }
    }
    if (cell.pm[i]) {
      const v = cell.pm[i] / 10; pmPop += p;
      if (v > 35.4) over[35] += p; if (v > 55.4) over[55] += p; if (v > 150.4) over[150] += p;
    }
  }
  const coverage = land ? landCov / land : 0;
  const s = {
    land, pop, coverage, fires: r.fires[year === 2019 ? 0 : 1],
    fireShare: landCov ? landFire / landCov : null, anyShare: landCov ? landAny / landCov : null, peopleFire: popCov ? popFire / popCov : null,
    over: Object.fromEntries(Object.entries(over).map(([k, v]) => [k, pmPop ? v / pmPop : null])),
  };
  if (year === 2026 && coverage < 0.02) Object.assign(s, { fireShare: null, anyShare: null, peopleFire: null, fires: null });
  statCache.set(id, s);
  return s;
}

/* ================================================================ spike bins */
const DMAX = 1600;                         // detections per 100 km² at full spike height (≈ p99.9 of 5 km cells)
const landBins = new Map(), binCache = new Map();
let selMask = null, selKey = null;
function mask() {
  if (selKey !== state.region) {
    selMask = new Uint8Array(cell.n);
    for (const i of regions.get(state.region).cells) selMask[i] = 1;
    selKey = state.region;
  }
  return selMask;
}
function landFor(k) {
  if (!landBins.has(k)) {
    const bc = Math.ceil(cell.g.cols / k), m = new Map();
    for (let i = 0; i < cell.n; i += 1) {
      const b = Math.floor(cell.row[i] / k) * bc + Math.floor(cell.col[i] / k);
      m.set(b, (m.get(b) ?? 0) + cell.area[i] / 100);
    }
    landBins.set(k, m);
  }
  return landBins.get(k);
}
function bins(k, year) {
  const key = `${k}|${year}|${state.region}`;
  if (binCache.has(key)) return binCache.get(key);
  if (binCache.size > 24) binCache.clear();
  const f = cell.f[year], sel = mask(), lands = landFor(k), bc = Math.ceil(cell.g.cols / k), m = new Map();
  for (let i = 0; i < cell.n; i += 1) {
    const v = f[i];
    if (!v) continue;
    const b = Math.floor(cell.row[i] / k) * bc + Math.floor(cell.col[i] / k), id = b * 2 + sel[i];
    let o = m.get(id);
    if (!o) { o = { b, f: 0, x: 0, y: 0, row: cell.row[i], in: sel[i] }; m.set(id, o); }
    o.f += v; o.x += cell.wx[i] * v; o.y += cell.wy[i] * v;
  }
  const cellKm2 = (cell.g.cell * 111.32) ** 2, out = [];
  for (const o of m.values()) {
    const lat = cell.g.y0 - (o.row + 0.5) * cell.g.cell;
    const floor = 0.35 * cellKm2 * k * k * Math.cos(lat * Math.PI / 180);   // keep coastal slivers from spiking
    out.push({ x: o.x / o.f, y: o.y / o.f, d: o.f / Math.max(lands.get(o.b) ?? 0, floor) * 100, in: o.in });
  }
  out.sort((a, b) => a.y - b.y);
  binCache.set(key, out);
  return out;
}

/* ================================================================ basemap tiles */
const tiles = new Map();
function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  let e = tiles.get(key);
  if (!e) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    e = { img, ok: false };
    img.onload = () => { e.ok = true; dirty = true; };
    img.src = `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
    tiles.set(key, e);
    if (tiles.size > 600) tiles.delete(tiles.keys().next().value);
  }
  return e;
}
function drawTiles(W, H, s) {
  const tz = Math.max(3, Math.min(16, Math.round(view.z + 0.25))), n = 2 ** tz, ts = TILE / n;
  const x0 = view.cx - W / 2 / s, y0 = view.cy - H / 2 / s;
  const c0 = Math.floor(x0 / ts), c1 = Math.floor((x0 + W / s) / ts), r0 = Math.max(0, Math.floor(y0 / ts)), r1 = Math.min(n - 1, Math.floor((y0 + H / s) / ts));
  for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) {
    const sx = (c * ts - x0) * s, sy = (r * ts - y0) * s, px = ts * s;
    const e = tile(tz, ((c % n) + n) % n, r);
    if (e.ok) { ctx.drawImage(e.img, sx, sy, px + 0.5, px + 0.5); continue; }
    for (let up = 1; up <= 4; up += 1) {                     // parent tile as placeholder while loading
      const pz = tz - up; if (pz < 0) break;
      const pc = Math.floor(c / 2 ** up), pr = Math.floor(r / 2 ** up);
      const p = tiles.get(`${pz}/${((pc % 2 ** pz) + 2 ** pz) % 2 ** pz}/${pr}`);
      if (p?.ok) {
        const sub = TILE / 2 ** up;
        ctx.drawImage(p.img, (c - pc * 2 ** up) * sub, (r - pr * 2 ** up) * sub, sub, sub, sx, sy, px + 0.5, px + 0.5);
        break;
      }
    }
  }
}

/* ================================================================ map drawing */
const SPIKE_L = ['#f3c47c', '#eeab58', '#e28c36', '#cc6c22', '#a84e16', '#7e3610'];
const SPIKE_R = ['#dba45f', '#d08a3e', '#bf6d23', '#a45217', '#823a10', '#5c260b'];
let priority = null;                                           // { key, path }
const paths = new Map();
const pathOf = key => { if (!paths.has(key)) paths.set(key, ringsPath(regions.get(key).rings)); return paths.get(key); };

function obstacles() {                                        // panel and strip rectangles in canvas pixels
  const c = canvas.getBoundingClientRect();
  return [section.querySelector('.at-panel'), section.querySelector('.at-strip'), section.querySelector('.at-legend')]
    .map(el => el?.getBoundingClientRect()).filter(r => r && r.width)
    .map(r => [r.left - c.left, r.top - c.top, r.width, r.height]);
}
function layout(W, H) {
  const narrow = W < 760, [panel, strip] = obstacles();
  return {
    left: narrow || !panel ? 12 : panel[0] + panel[2] + 24, right: narrow ? 12 : 110,
    top: narrow && panel ? panel[1] + panel[3] + 10 : 24, bottom: strip ? H - strip[1] + 16 : 180,
  };
}
function fit(key, animate = true) {
  const { W, H } = size();
  if (!W || !H) return;
  const b = regions.get(key).bbox, [x0, y1] = toWorld(b[0], b[1]), [x1, y0] = toWorld(b[2], b[3]), L = layout(W, H);
  const aw = Math.max(120, W - L.left - L.right), ah = Math.max(100, H - L.top - L.bottom);
  const z = Math.max(4, Math.min(11, Math.log2(Math.min(aw / (x1 - x0), ah / (y1 - y0)) * 0.92)));
  const s = 2 ** z;
  const target = { z, cx: (x0 + x1) / 2 - (L.left + aw / 2 - W / 2) / s, cy: (y0 + y1) / 2 - (L.top + ah / 2 - H / 2) / s };
  if (!animate) { view = target; dirty = true; return; }
  anim = { from: { ...view }, to: target, t0: performance.now(), ms: 750 };
  dirty = true;
}
function step(now) {
  if (anim) {
    const p = Math.min(1, (now - anim.t0) / anim.ms), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    const { from: a, to: b } = anim;
    view = { z: a.z + (b.z - a.z) * e, cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e };
    if (p >= 1) anim = null;
    dirty = true;
  }
  if (dirty && visible) { dirty = false; draw(); }
  requestAnimationFrame(step);
}

function draw() {
  const { width: W, height: H, ratio } = resizeCanvas(canvas);
  if (!W || !H) return;
  const s = 2 ** view.z;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#dfe6e2';
  ctx.fillRect(0, 0, W, H);
  drawTiles(W, H, s);
  ctx.fillStyle = 'rgba(238,241,234,.28)';
  ctx.fillRect(0, 0, W, H);

  ctx.setTransform(ratio * s, 0, 0, ratio * s, ratio * (W / 2 - view.cx * s), ratio * (H / 2 - view.cy * s));
  const px = 1 / s, sel = regions.get(state.region);
  if (state.region !== 'ID') {
    const veil = new Path2D();
    veil.rect(view.cx - W / 2 / s - 1, view.cy - H / 2 / s - 1, W / s + 2, H / s + 2);
    veil.addPath(pathOf(state.region));
    ctx.fillStyle = 'rgba(232,236,229,.6)';
    ctx.fill(veil, 'evenodd');
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(75,90,81,.32)';
  ctx.lineWidth = 0.7 * px;
  ctx.stroke(pathOf('ID'));
  if (view.z >= 6.4) {
    const provKey = sel.kind === 'regency' ? sel.parent : sel.kind === 'province' ? sel.key : null;
    if (provKey) {
      ctx.strokeStyle = 'rgba(75,90,81,.22)';
      ctx.lineWidth = 0.5 * px;
      for (const r of regions.values()) if (r.kind === 'regency' && r.parent === provKey) ctx.stroke(pathOf(r.key));
    }
  }
  drawCellLayers(W, H, s);
  if (priority?.path) {
    ctx.fillStyle = 'rgba(138,74,16,.12)';
    ctx.fill(priority.path);
    ctx.strokeStyle = '#6b3410';
    ctx.lineWidth = 1.1 * px;
    ctx.stroke(priority.path);
  }
  if (state.region !== 'ID') {
    ctx.strokeStyle = 'rgba(22,33,27,.7)';
    ctx.lineWidth = 1.2 * px;
    ctx.stroke(pathOf(state.region));
  }

  // screen-space spikes, north to south so nearer ones overlap
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const cellPx = cell.g.cell / 360 * TILE * s;
  let k = 1; while (k < 16 && cellPx * k < 4.2) k *= 2;
  const hw = Math.max(1.1, Math.min(4.6, cellPx * k * 0.42));
  const HMAX = Math.min(170, H * 0.26) * (0.82 + 0.18 * Math.min(1, (view.z - 4) / 4));
  const toS = (x, y) => [(x - view.cx) * s + W / 2, (y - view.cy) * s + H / 2];
  const height = d => HMAX * Math.sqrt(Math.min(d, DMAX) / DMAX);
  const cull = (sx, sy, h) => sx < -10 || sx > W + 10 || sy < -4 || sy - h > H + 4;
  for (const b of bins(k, state.year)) {
    const [sx, sy] = toS(b.x, b.y), h = height(b.d) * (b.in ? 1 : 0.6);
    if (h < 0.6 || cull(sx, sy, h)) continue;
    const ci = Math.min(5, Math.floor(h / HMAX * 6));
    ctx.fillStyle = b.in ? SPIKE_L[ci] : 'rgba(150,158,152,.4)';
    ctx.beginPath(); ctx.moveTo(sx - hw, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx, sy + 0.4); ctx.fill();
    ctx.fillStyle = b.in ? SPIKE_R[ci] : 'rgba(122,130,124,.4)';
    ctx.beginPath(); ctx.moveTo(sx + hw, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx, sy + 0.4); ctx.fill();
  }
  if (state.compare) {
    ctx.strokeStyle = 'rgba(22,33,27,.75)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const b of bins(k, state.year === 2019 ? 2026 : 2019)) {
      if (!b.in) continue;
      const [sx, sy] = toS(b.x, b.y), h = height(b.d);
      if (h < 1.5 || cull(sx, sy, h)) continue;
      ctx.moveTo(sx - hw, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx + hw, sy);
    }
    ctx.stroke();
  }
  drawLabels(W, H, toS);
  updateScale(s);
}

function drawCellLayers(W, H, s) {
  if (!state.people && !state.smoke) return;
  const sel = mask(), f = cell.f[state.year];
  const step = toWorld(cell.g.x0 + cell.g.cell, 0)[0] - toWorld(cell.g.x0, 0)[0];
  const x0 = view.cx - W / 2 / s, x1 = view.cx + W / 2 / s, y0 = view.cy - H / 2 / s, y1 = view.cy + H / 2 / s;
  const groups = new Map();
  const put = (style, i) => { let p = groups.get(style); if (!p) { p = new Path2D(); groups.set(style, p); } p.rect(cell.wx[i] - step / 2, cell.wy[i] - step / 2, step * 1.02, step * 1.02); };
  for (let i = 0; i < cell.n; i += 1) {
    if (!sel[i]) continue;
    const x = cell.wx[i], y = cell.wy[i];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const v = cell.pm[i] / 10;
    if (state.smoke && v > state.smoke + 0.4) put(v > 150.4 ? 'rgba(84,70,140,.5)' : 'rgba(108,95,150,.32)', i);
    if (state.people && f[i] >= FIRE_MIN && cell.pop[i] > 0 && (state.year === 2019 || cell.cover[i])) {
      put(`rgba(43,92,170,${Math.min(0.85, 0.22 + Math.log10(cell.pop[i] + 1) / 7).toFixed(2)})`, i);
    }
  }
  for (const [style, p] of groups) { ctx.fillStyle = style; ctx.fill(p); }
}

const centres = new Map();
function centreOf(key) {
  if (!centres.has(key)) {
    let x = 0, y = 0, w = 0;
    for (const i of regions.get(key).cells) { const a = cell.area[i]; x += cell.wx[i] * a; y += cell.wy[i] * a; w += a; }
    centres.set(key, [x / w, y / w]);
  }
  return centres.get(key);
}
function drawLabels(W, H, toS) {
  const placed = obstacles();
  const free = (x, y, w, h) => {
    if (x < 4 || y < 4 || x + w > W - 4 || y + h > H - 4) return false;
    if (placed.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1])) return false;
    placed.push([x, y, w, h]); return true;
  };
  const ink = '#16211b', halo = 'rgba(248,249,245,.95)';
  ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const sel = regions.get(state.region);
  if (sel.kind === 'province' || sel.kind === 'regency') {
    const name = sel.name().toUpperCase(), [sx, sy] = toS(...centreOf(sel.key));
    ctx.font = '600 12px "Public Sans", sans-serif'; ctx.letterSpacing = '3px';
    const w = ctx.measureText(name).width;
    if (free(sx - w / 2, sy + 8, w, 16)) {
      ctx.strokeStyle = halo; ctx.lineWidth = 4; ctx.strokeText(name, sx - w / 2, sy + 16);
      ctx.fillStyle = ink; ctx.fillText(name, sx - w / 2, sy + 16);
    }
    ctx.letterSpacing = '0px';
  }
  for (const [name, lon, lat, rank] of CITIES) {
    if (view.z < CITY_ZOOM[rank]) continue;
    const [sx, sy] = toS(...toWorld(lon, lat));
    ctx.font = `${rank <= 1 ? 700 : 600} ${rank <= 2 ? 13 : 12}px "Public Sans", sans-serif`;
    const w = ctx.measureText(name).width, tx = sx + w + 12 < W - 100 ? sx + 6 : sx - 6 - w;
    if (!free(Math.min(tx, sx - 3), sy - 8, w + 9, 16)) continue;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, 7); ctx.fill();
    ctx.strokeStyle = halo; ctx.lineWidth = 3.5; ctx.strokeText(name, tx, sy);
    ctx.fillStyle = ink; ctx.fillText(name, tx, sy);
  }
}
function updateScale(s) {
  const lat = fromWorld(view.cx, view.cy)[1];
  const mPerPx = 40075016.7 * Math.cos(lat * Math.PI / 180) / TILE / s;
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(v => v >= 90 * mPerPx / 1000 * 0.6) ?? 1000;
  const el = $('at-scale');
  el.querySelector('span').textContent = `${nice} km`;
  el.querySelector('i').style.width = `${nice * 1000 / mPerPx}px`;
}

/* ================================================================ legend */
function drawLegend() {
  const el = $('at-legend'), H = 64, Wc = 150;
  let html = `<h6>${t('legendTitle')}</h6><canvas width="${Wc * 2}" height="${(H + 16) * 2}" style="width:${Wc}px;height:${H + 16}px"></canvas>`;
  if (state.compare) html += `<div>${t('legendGhost', { y: state.year === 2019 ? 2026 : 2019 })} △</div>`;
  if (state.smoke) html += `<div><span class="key" style="background:rgba(108,95,150,.45)"></span>${t('legendSmoke', { t: state.smoke })}</div>`;
  if (state.people) html += `<div><span class="key" style="background:#2b5caa"></span>${t('legendPeople')}</div>`;
  if (priority?.path) html += `<div><span class="key" style="border:1.5px solid #6b3410"></span>${t('legendPriority')}</div>`;
  el.innerHTML = html;
  const c = el.querySelector('canvas').getContext('2d');
  c.scale(2, 2); c.font = '11px "Public Sans", sans-serif'; c.textAlign = 'center';
  [10, 100, 400, 1600].forEach((d, j) => {
    const h = H * Math.sqrt(d / DMAX), x = 22 + j * 36, ci = Math.min(5, Math.floor(h / H * 6));
    c.fillStyle = SPIKE_L[ci]; c.beginPath(); c.moveTo(x - 5, H); c.lineTo(x, H - h); c.lineTo(x, H); c.fill();
    c.fillStyle = SPIKE_R[ci]; c.beginPath(); c.moveTo(x + 5, H); c.lineTo(x, H - h); c.lineTo(x, H); c.fill();
    c.fillStyle = '#4b5a51'; c.fillText(nf(d), x, H + 11);
  });
}

/* ================================================================ panel */
function renderPanel() {
  const r = regions.get(state.region), s = stats(state.region, state.year), nat = stats('ID', state.year), s19 = stats(state.region, 2019), n19 = stats('ID', 2019);
  $('at-pick-name').textContent = r.name();
  $('at-pick').classList.toggle('long', r.name().length > 15);
  $('at-reset').hidden = state.region === 'ID';
  const big = $('at-big');
  big.textContent = s.fireShare == null ? '—' : pct(s.fireShare);
  big.classList.toggle('na', s.fireShare == null);
  $('at-sub').textContent = s.fireShare == null ? t('noData') : t('sub', { y: state.year });
  let html;
  if (s.fires != null) {
    html = `<u class="f">${t('detections', { n: nf(s.fires) })}</u>`;
    if (state.year === 2026 && s19.fires) { const ch = s.fires / s19.fires - 1; html += ` (${t(ch < 0 ? 'fewer' : 'more2', { p: pct(Math.abs(ch)) })})`; }
    html += `. ${t('ofPeople', { n: people(s.pop) })} `;
    html += state.year === 2019 && s.over[55] != null
      ? `<u class="s">${t('breathed', { p: pct(s.over[55]) })}</u> ${t('inSept')} <u class="p">${t('lived', { p: pct(s.peopleFire) })}</u>`
      : `<u class="p">${t('lived', { p: pct(s.peopleFire) })}</u>`;
  } else html = t('noDataSub');
  if (state.year === 2026 && s.coverage >= 0.02 && s.coverage < 0.98) html += ` <span class="muted">${t('partial', { c: pct(s.coverage) })}</span>`;
  $('at-statement').innerHTML = html;
  const rows = [
    { id: 'fire', label: t('landFire'), v: s.fireShare, n: nat.fireShare, color: 'var(--ember)', lead: true },
    { id: 'any', label: t('landAny'), v: s.anyShare, n: nat.anyShare, color: 'var(--ember-hot)', lead: true },
    { id: 'people', label: t('peopleFire'), v: s.peopleFire, n: nat.peopleFire, color: 'var(--at-people)', on: state.people },
    { id: 35, label: t('pm35'), v: s19.over[35], n: n19.over[35], color: 'var(--smoke)', on: state.smoke === 35 },
    { id: 55, label: t('pm55'), v: s19.over[55], n: n19.over[55], color: 'var(--smoke)', on: state.smoke === 55 },
    { id: 150, label: t('pm150'), v: s19.over[150], n: n19.over[150], color: 'var(--smoke)', on: state.smoke === 150 },
  ];
  $('at-bars').innerHTML = rows.map(row => {
    const control = row.lead ? `<span style="width:11px;height:11px;background:${row.color};display:block"></span>`
      : `<input type="checkbox" id="at-bar-${row.id}" data-layer="${row.id}" ${row.on ? 'checked' : ''}>`;
    const w = row.v == null ? 0 : Math.max(row.v > 0 ? 1.5 : 0, row.v * 100);
    const tick = row.n == null || state.region === 'ID' ? '' : `<b style="left:${row.n * 100}%"></b>`;
    return `<li class="${row.id === 'fire' ? 'lead' : ''} ${typeof row.id === 'number' && state.year === 2026 ? 'off' : ''}">${control}
      <label ${row.lead ? '' : `for="at-bar-${row.id}"`} title="${row.label}">${row.label}</label>
      <span class="at-bar" style="color:${row.color}"><i style="width:${w}%"></i>${tick}</span><span class="v">${pct(row.v)}</span></li>`;
  }).join('');
  $('at-note').textContent = t(state.year === 2026 ? 'note26' : 'note');
  $('at-compare-label').textContent = t('compare', { y: state.year === 2019 ? 2026 : 2019 });
  for (const b of section.querySelectorAll('.at-years button')) b.setAttribute('aria-pressed', String(Number(b.dataset.year) === state.year));
  renderStudy();
}
$('at-bars').addEventListener('change', e => {
  const layer = e.target.dataset.layer;
  if (!layer) return;
  if (layer === 'people') state.people = e.target.checked;
  else state.smoke = e.target.checked ? Number(layer) : 0;
  renderPanel(); drawLegend(); dirty = true;
});

// Priority zones from the story's island scenarios (13 provinces of Sumatra and Kalimantan, 2019 yardstick).
let geography = null;
const scenarios = new Map();
async function renderStudy() {
  const r = regions.get(state.region);
  const pKey = r.kind === 'province' ? r.key : r.kind === 'regency' ? r.parent : null;
  const card = $('at-study'), want = `${pKey}|${state.year}`;
  const clear = () => { card.hidden = true; if (priority) { priority = null; dirty = true; drawLegend(); } };
  if (!pKey) return clear();
  try {
    geography ??= await readJSON('geography.json');
    if (!scenarios.has(state.year)) scenarios.set(state.year, await readJSON(`scenario-${state.year}-count-100.json`));
  } catch { return clear(); }
  const now = regions.get(state.region), nowKey = now.kind === 'province' ? now.key : now.parent;
  if (`${nowKey}|${state.year}` !== want) return;                       // selection moved on while loading
  const sc = scenarios.get(state.year).provinces[pKey], grid = geography.grids?.[pKey];
  if (!sc || !grid) return clear();
  const name = regions.get(pKey).name();
  card.innerHTML = sc.priorityPeople > 0 ? t('study', { name, people: people(sc.priorityPeople), y: state.year }) : t('studyNone', { name, y: state.year });
  card.hidden = false;
  if (priority?.key !== want) {
    const path = new Path2D();
    for (const poly of sc.priorityShapes) for (const ring of poly) {
      ring.forEach(([col, row], i) => {
        const [x, y] = toWorld(...lonLat(grid.x0 + col * grid.step, grid.y0 - row * grid.step));
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
      });
      path.closePath();
    }
    priority = { key: want, path: sc.priorityShapes.length ? path : null };
    dirty = true; drawLegend();
  }
}

/* ================================================================ picker */
const picker = { open: false, active: 0, items: [] };
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function pickGroups(query) {
  const q = fold(query.trim()), yi = state.year === 2019 ? 0 : 1, all = [...regions.values()];
  if (q) {
    const hits = all.filter(r => fold(r.name()).includes(q))
      .sort((a, b) => (a.kind === 'regency') - (b.kind === 'regency') || b.fires[yi] - a.fires[yi]).slice(0, 60);
    return [[t('gResults'), hits.map(r => ({ key: r.key, hint: r.kind === 'regency' ? regions.get(r.parent).name() : '' }))]];
  }
  const regs = all.filter(r => r.kind === 'regency').sort((a, b) => b.fires[yi] - a.fires[yi]);
  const groups = [[t('gCountry'), [{ key: 'ID' }]],
    [t('gFire'), [{ key: 'belt' }, { key: 'ID14', star: true }, { key: 'ID62', star: true },
      ...regs.slice(0, 6).map(r => ({ key: r.key, hint: regions.get(r.parent).name(), indent: true }))]]];
  const cur = regions.get(state.region), pKey = cur.kind === 'province' ? cur.key : cur.kind === 'regency' ? cur.parent : null;
  if (pKey) groups.push([t('gIn', { n: regions.get(pKey).name() }), regs.filter(r => r.parent === pKey).map(r => ({ key: r.key }))]);
  groups.push([t('gIslands'), ISLANDS.map(i => ({ key: `is:${i}` }))]);
  groups.push([t('gProvinces'), all.filter(r => r.kind === 'province')
    .sort((a, b) => ISLANDS.indexOf(a.island) - ISLANDS.indexOf(b.island) || a.name().localeCompare(b.name()))
    .map(r => ({ key: r.key, star: r.deep }))]);
  return groups;
}
function renderPicker() {
  const yi = state.year === 2019 ? 0 : 1, groups = pickGroups($('at-search').value);
  picker.items = groups.flatMap(([, items]) => items);
  picker.active = Math.min(picker.active, Math.max(0, picker.items.length - 1));
  let k = 0;
  $('at-items').innerHTML = groups.map(([title, items]) => `<h6>${title}</h6>${items.map(o => {
    const r = regions.get(o.key), n = r.fires[yi], i = k++;
    return `<button type="button" role="option" class="at-opt ${o.indent ? 'indent' : ''} ${i === picker.active ? 'active' : ''}" data-key="${o.key}" aria-selected="${o.key === state.region}">
      ${r.name()}${o.star ? ` <span class="at-star" title="${t('deep')}">★</span>` : ''}${o.hint ? ` <em>${o.hint}</em>` : ''}<small>${n ? nf(n) : ''}</small></button>`;
  }).join('')}`).join('');
}
function openPicker(open) {
  picker.open = open;
  $('at-picklist').hidden = !open;
  $('at-pick').setAttribute('aria-expanded', String(open));
  if (!open) return;
  const b = $('at-pick').getBoundingClientRect(), s = section.getBoundingClientRect();
  $('at-picklist').style.top = `${b.bottom - s.top + 6}px`;
  $('at-picklist').style.left = `${b.left - s.left - 8}px`;
  $('at-search').value = ''; $('at-search').placeholder = t('search');
  picker.active = 0; renderPicker(); $('at-search').focus({ preventScroll: true });
}
$('at-pick').addEventListener('click', e => { e.stopPropagation(); openPicker(!picker.open); });
$('at-search').addEventListener('input', () => { picker.active = 0; renderPicker(); });
$('at-search').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopPropagation();
    picker.active = (picker.active + (e.key === 'ArrowDown' ? 1 : -1) + picker.items.length) % picker.items.length;
    renderPicker();
    $('at-items').querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && picker.items[picker.active]) { select(picker.items[picker.active].key); openPicker(false); }
  else if (e.key === 'Escape') { openPicker(false); $('at-pick').focus(); }
});
$('at-items').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) { select(b.dataset.key); openPicker(false); } });
document.addEventListener('click', e => { if (picker.open && !$('at-picklist').contains(e.target)) openPicker(false); });

/* ================================================================ strip */
const strip = { canvas: $('at-strip'), items: [], hover: null };
const METRICS = { fire: 'metricFire', people: 'metricPeople', smoke: 'metricSmoke' };
function metricValue(key) {
  const year = state.metric === 'smoke' ? 2019 : state.year, s = stats(key, year);
  if (year === 2026 && s.coverage < 0.5) return null;
  return state.metric === 'fire' ? s.fireShare : state.metric === 'people' ? s.peopleFire : s.over[55];
}
function inSelection(r) {
  const sel = regions.get(state.region);
  if (sel.kind === 'country') return true;
  if (sel.kind === 'island') return r.island === sel.island;
  if (sel.kind === 'group') return r.island === 'Sumatra' || r.island === 'Kalimantan';
  if (sel.kind === 'province') return r.key === sel.key || r.parent === sel.key;
  return r.key === sel.key || r.key === sel.parent;
}
function renderStrip() {
  if (!regions) return;
  const { width: W, height: H } = resizeCanvas(strip.canvas);
  if (!W) return;
  const c = strip.canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  const kind = state.level;
  const list = [...regions.values()].filter(r => r.kind === kind).map(r => ({ r, v: metricValue(r.key), area: stats(r.key, 2019).land })).filter(o => o.v != null);
  const top = Math.max(0.01, ...list.map(o => o.v), metricValue(state.region) ?? 0);
  const vmax = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1].find(v => v >= top * 1.04) ?? 1;
  const padL = 10, padR = 24, axisY = H - 18, x = v => padL + v / vmax * (W - padL - padR);
  const maxArea = Math.max(...list.map(o => o.area)), base = kind === 'province' ? 22 : 11;
  for (const o of list) o.size = state.size === 'equal' ? base * 0.62 : Math.max(kind === 'province' ? 6 : 3.2, base * Math.sqrt(o.area / maxArea));
  const mid = (axisY - 22) / 2 + 14, placed = [];
  list.sort((a, b) => b.size - a.size);
  for (const o of list) {                                       // beeswarm: larger first, nudge vertically
    o.x = x(o.v);
    let best = mid;
    for (let k = 0; k < 40; k += 1) {
      const y = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3;
      if (y - o.size / 2 < 14 || y + o.size / 2 > axisY - 4) continue;
      best = y;
      if (!placed.some(p => Math.abs(p.x - o.x) < (p.size + o.size) / 2 + 0.6 && Math.abs(p.y - y) < (p.size + o.size) / 2 + 0.6)) break;
    }
    o.y = best; placed.push(o);
  }
  const ink = '#16211b', halo = 'rgba(248,249,245,.95)';
  c.strokeStyle = 'rgba(22,33,27,.55)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(padL, axisY); c.lineTo(W - padR, axisY); c.stroke();
  c.font = '12px "Public Sans", sans-serif'; c.fillStyle = '#4b5a51'; c.textBaseline = 'top';
  const stepV = vmax <= 0.2 ? 0.05 : vmax <= 0.5 ? 0.1 : 0.25;
  for (let v = 0; v <= vmax + 1e-9; v += stepV) {
    const last = v + stepV > vmax + 1e-9;
    c.beginPath(); c.moveTo(x(v), axisY); c.lineTo(x(v), axisY + 4); c.stroke();
    c.textAlign = v === 0 ? 'left' : last ? 'right' : 'center';
    c.fillText(`${nf(v * 100)}%`, last ? x(v) + padR - 2 : x(v), axisY + 5);
  }
  c.textAlign = 'left';
  const refV = metricValue(state.region);
  if (refV != null) {
    c.setLineDash([2, 3]); c.strokeStyle = 'rgba(22,33,27,.6)';
    c.beginPath(); c.moveTo(x(refV), 12); c.lineTo(x(refV), axisY); c.stroke(); c.setLineDash([]);
  }
  for (const o of [...list].sort((a, b) => a.size - b.size)) {
    c.globalAlpha = inSelection(o.r) ? 0.92 : 0.2;
    c.fillStyle = ISLAND_COLOR[o.r.island] ?? '#888';
    c.fillRect(o.x - o.size / 2, o.y - o.size / 2, o.size, o.size);
    if (o.r.key === state.region || o.r.key === strip.hover) {
      c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = 1.6;
      c.strokeRect(o.x - o.size / 2 - 1.5, o.y - o.size / 2 - 1.5, o.size + 3, o.size + 3);
    }
  }
  c.globalAlpha = 1;
  const labels = [], used = [];
  const label = (text, lx, bold = false) => {
    c.font = `${bold ? 700 : 600} 12.5px "Public Sans", sans-serif`;
    const w = c.measureText(text).width, tx = Math.max(2, Math.min(W - w - 2, lx - w / 2));
    if (used.some(u => tx < u[1] + 16 && tx + w > u[0] - 16)) return;
    used.push([tx, tx + w]); labels.push([text, tx, bold]);
  };
  const hovered = strip.hover && list.find(o => o.r.key === strip.hover);
  if (hovered) label(`${hovered.r.name()} ${pct(hovered.v)}`, hovered.x, true);
  if (refV != null) label(`${regions.get(state.region).name()} ${pct(refV)}`, x(refV), true);
  const sorted = [...list].sort((a, b) => a.v - b.v);
  if (sorted.length) {
    label(`${sorted[0].r.name()} ${pct(sorted[0].v)}`, Math.max(sorted[0].x, 40));
    const hi = sorted.at(-1); label(`${hi.r.name()} ${pct(hi.v)}`, Math.min(hi.x, W - 60));
  }
  for (const o of [...list].sort((a, b) => b.area - a.area).slice(0, kind === 'province' ? 6 : 4)) label(o.r.name(), o.x);
  c.textBaseline = 'alphabetic';
  for (const [text, tx, bold] of labels) {
    c.font = `${bold ? 700 : 600} 12.5px "Public Sans", sans-serif`;
    c.strokeStyle = halo; c.lineWidth = 3; c.strokeText(text, tx, 11);
    c.fillStyle = ink; c.fillText(text, tx, 11);
  }
  strip.items = list;
}
strip.canvas.addEventListener('pointermove', e => {
  const rect = strip.canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  let best = null, bd = 12;
  for (const o of strip.items) { const d = Math.hypot(o.x - mx, o.y - my) - o.size / 2; if (d < bd) { bd = d; best = o; } }
  const key = best?.r.key ?? null;
  if (key !== strip.hover) { strip.hover = key; renderStrip(); }
});
strip.canvas.addEventListener('pointerleave', () => { strip.hover = null; renderStrip(); });
strip.canvas.addEventListener('click', () => { if (strip.hover) select(strip.hover); });
function fillStripControls() {
  $('at-metric').innerHTML = Object.entries(METRICS).map(([k, key]) => `<option value="${k}" ${k === state.metric ? 'selected' : ''}>${t(key)}</option>`).join('');
  $('at-level').innerHTML = ['province', 'regency'].map(v => `<option value="${v}" ${state.level === v ? 'selected' : ''}>${t(v === 'province' ? 'provinces' : 'regencies')}</option>`).join('');
}
$('at-metric').addEventListener('change', e => { state.metric = e.target.value; renderStrip(); });
$('at-level').addEventListener('change', e => { state.level = e.target.value; renderStrip(); });
for (const b of section.querySelectorAll('.at-sizes button')) b.addEventListener('click', () => {
  state.size = b.dataset.size;
  for (const x of section.querySelectorAll('.at-sizes button')) x.setAttribute('aria-pressed', String(x === b));
  renderStrip();
});

/* ================================================================ interaction */
function select(key, animate = true) {
  if (!regions.has(key)) key = 'ID';
  state.region = key;
  const kind = regions.get(key).kind;
  const level = kind === 'province' || kind === 'regency' ? 'regency' : 'province';
  if (level !== state.level) { state.level = level; fillStripControls(); }
  fit(key, animate);
  renderPanel(); renderStrip(); writeURL();
  dirty = true;
}
// Region and year live in the query string; the deck owns the #slide hash.
function writeURL() {
  const p = new URLSearchParams(location.search);
  if (state.region === 'ID') p.delete('r'); else p.set('r', state.region);
  if (state.year === 2019) p.delete('y'); else p.set('y', state.year);
  const q = p.toString(), url = `${location.pathname}${q ? `?${q}` : ''}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url);
}
function readURL() {
  const p = new URLSearchParams(location.search), y = Number(p.get('y'));
  if (y === 2019 || y === 2026) state.year = y;
  return p.get('r') ?? 'ID';
}
for (const b of section.querySelectorAll('.at-years button')) b.addEventListener('click', () => {
  state.year = Number(b.dataset.year);
  renderPanel(); renderStrip(); drawLegend(); writeURL(); dirty = true;
});
$('at-reset').addEventListener('click', () => select('ID'));
$('at-compare').addEventListener('change', e => { state.compare = e.target.checked; drawLegend(); dirty = true; });

function zoomAt(mx, my, dz) {
  const { W, H } = size(), s0 = 2 ** view.z, z = Math.max(4, Math.min(12, view.z + dz)), s1 = 2 ** z;
  const wx = view.cx + (mx - W / 2) / s0, wy = view.cy + (my - H / 2) / s0;
  view = { z, cx: wx - (mx - W / 2) / s1, cy: wy - (my - H / 2) / s1 };
  anim = null; dirty = true;
}
const centre = () => { const { W, H } = size(); return [W / 2, H / 2]; };
$('at-zoom-in').addEventListener('click', () => zoomAt(...centre(), 1));
$('at-zoom-out').addEventListener('click', () => zoomAt(...centre(), -1));
let hintTimer = 0;
function hint() {
  $('at-hint').textContent = t('hint'); $('at-hint').hidden = false;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => { $('at-hint').hidden = true; }, 1600);
}
canvas.addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) { hint(); return; }              // plain scroll belongs to the story deck
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, -e.deltaY * (e.deltaMode ? 0.05 : 0.01));
}, { passive: false });
canvas.addEventListener('dblclick', e => { const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? -1 : 1); });

let press = null;
const pointers = new Map();
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (e.pointerType !== 'touch') canvas.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false, pinch: pointers.size === 2 ? pinchDist() : 0, z: view.z };
  anim = null;
});
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (press && pointers.size === 2 && press.pinch) {
    view = { ...view, z: Math.max(4, Math.min(12, press.z + Math.log2(pinchDist() / press.pinch))) };
    press.moved = true; dirty = true; return;
  }
  if (press) {
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) > 4) { press.moved = true; canvas.classList.add('dragging'); }
    if (press.moved) { const s = 2 ** view.z; view = { ...view, cx: press.cx - dx / s, cy: press.cy - dy / s }; dirty = true; }
    $('at-tip').hidden = true;
    return;
  }
  showTip(e.clientX, e.clientY);
});
const release = e => {
  pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (e.type === 'pointerup' && press && !press.moved) {
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0) {                                               // click a regency; click it again for its province
      const regencyKey = boundsData.regencies[cell.reg[i]].id;
      select(state.region === regencyKey ? regions.get(regencyKey).parent : regencyKey);
    }
  }
  if (!pointers.size) press = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { $('at-tip').hidden = true; });
function cellAt(clientX, clientY) {
  if (!cell) return -1;                                         // pointer moved before the grid loaded
  const { W, H, r } = size(), s = 2 ** view.z;
  const [lon, lat] = fromWorld(view.cx + (clientX - r.left - W / 2) / s, view.cy + (clientY - r.top - H / 2) / s);
  const col = Math.floor((lon - cell.g.x0) / cell.g.cell), row = Math.floor((cell.g.y0 - lat) / cell.g.cell);
  if (col < 0 || row < 0 || col >= cell.g.cols || row >= cell.g.rows) return -1;
  return cell.at[row * cell.g.cols + col];
}
function showTip(mx, my) {
  const tip = $('at-tip'), i = cellAt(mx, my);
  if (i < 0) { tip.hidden = true; return; }
  const reg = boundsData.regencies[cell.reg[i]], f = cell.f[state.year][i], covered = state.year === 2019 || cell.cover[i];
  tip.innerHTML = `<b>${reg.name}</b><span>${regions.get(reg.province).name()}</span><br>${t('tipCell')} · ${covered ? t('tipFire', { n: nf(f) }) : t('noData')}<br>${t('tipPeople', { n: nf(cell.pop[i]) })}${cell.pm[i] ? `<br>${t('tipPm', { n: nf(cell.pm[i] / 10) })}` : ''}`;
  tip.hidden = false;
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, mx + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, my + 14)}px`;
}
section.addEventListener('keydown', e => {                      // arrows stay with the deck; +/− zoom when focus is in the map slide
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === '+' || e.key === '=') zoomAt(...centre(), 0.5);
  else if (e.key === '-') zoomAt(...centre(), -0.5);
  else if (e.key === 'Escape' && state.region !== 'ID') select(regions.get(state.region).parent ?? 'ID');
});
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) dirty = true; }, { root: $('deck') }).observe(section);
let lastW = 0;
new ResizeObserver(() => {
  const { W } = size();
  if (regions && W && Math.abs(W - lastW) > 1) { if (!lastW) fit(state.region, false); lastW = W; renderStrip(); }
  dirty = true;
}).observe(canvas);

/* ================================================================ language */
function applyLanguage() {
  lang = root.lang === 'id' ? 'id' : 'en';
  for (const el of section.querySelectorAll('[data-at]')) el.textContent = t(el.dataset.at);
  canvas.setAttribute('aria-label', t('aria'));
  if (regions) { fillStripControls(); renderPanel(); renderStrip(); drawLegend(); if (picker.open) renderPicker(); dirty = true; }
}
new MutationObserver(applyLanguage).observe(root, { attributes: true, attributeFilter: ['lang'] });

/* ================================================================ boot */
applyLanguage();
$('at-status').textContent = t('loading');
try {
  const [atlas, bounds] = await Promise.all([readJSON('atlas.json'), readJSON('atlas-bounds.json')]);
  boundsData = bounds;
  ({ c: cell, R: regions } = build(atlas, bounds));
  $('at-status').textContent = '';
  fillStripControls();
  const key = readURL();
  select(regions.has(key) ? key : 'ID', false);
  lastW = size().W;
  drawLegend();
  requestAnimationFrame(step);
} catch (error) {
  console.error(error);
  $('at-status').textContent = t('failed');
}
