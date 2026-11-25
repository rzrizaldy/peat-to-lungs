// Opening slide: full-bleed spike map of VIIRS fire detections on a 0.05° grid over Indonesia,
// with Sept 2019 PM2.5 smoke over Indonesia and its neighbours (data/atlas*.json, data/atlas-smoke.png from tools/export-atlas.py), a region picker,
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
  more: ['The story ↓', 'Ceritanya ↓'],
  search: ['Search province or regency', 'Cari provinsi atau kabupaten/kota'],
  sub: ['of the land had heavy fire: 10+ detections in its 5 km cell, Jul–Oct {y}', 'daratan mengalami api berat: 10+ titik api di sel 5 km-nya, Jul–Okt {y}'],
  subChange: ['fire detections, Jul–Oct 2026 vs 2019 (same satellite)', 'titik api, Jul–Okt 2026 vs 2019 (satelit sama)'],
  subFew: ['too few fires to compare', 'api terlalu sedikit untuk dibandingkan'],
  lead: ['{b} fire detections in Jul–Oct 2026, against {a} in 2019.', '{b} titik api pada Jul–Okt 2026, dibanding {a} pada 2019.'],
  rise: ['Biggest rise: {list}.', 'Kenaikan terbesar: {list}.'],
  fall: ['Fell: {list}.', 'Turun: {list}.'],
  smoke19: ['In Sept 2019, {p} of people breathed unhealthy air.', 'Pada Sept 2019, {p} warga menghirup udara tidak sehat.'],
  smoke26: ['At the October 2026 peak, {p} of people breathed unhealthy air (model).', 'Pada puncak Oktober 2026, {p} warga menghirup udara tidak sehat (model).'],
  changeHead: ['Where fire changed, 2019 → 2026', 'Di mana api berubah, 2019 → 2026'],
  noData: ['No 2026 fire data here', 'Belum ada data api 2026 di sini'],
  noDataSub: ['The 2026 FIRMS download covers Sumatra and Kalimantan only.', 'Unduhan FIRMS 2026 hanya mencakup Sumatra dan Kalimantan.'],
  landFire: ['Land with heavy fire', 'Daratan dengan api berat'],
  landAny: ['Land with any fire', 'Daratan dengan api apa pun'],
  peopleFire: ['People in a heavy-fire cell', 'Warga di sel api berat'],
  pm35: ['PM₂.₅ above 35 µg/m³', 'PM₂.₅ di atas 35 µg/m³'],
  pm55: ['PM₂.₅ above 55 (unhealthy)', 'PM₂.₅ di atas 55 (tidak sehat)'],
  pm150: ['PM₂.₅ above 150', 'PM₂.₅ di atas 150'],
  noteShort: ['Heavy fire: 10+ detections per 5 km cell. | = Indonesia. ⓘ', 'Api berat: 10+ titik api per sel 5 km. | = Indonesia. ⓘ'],
  note: ['Heavy fire = 10+ VIIRS detections in a 5 km cell over the season. People rows are shares of people. PM₂.₅ is the Sept 2019 monthly mean (WashU); 55.5 is the US EPA (2024) “unhealthy” 24-hour lower bound, used as a guide. Tick = Indonesia.',
    'Api berat = 10+ titik api VIIRS di sel 5 km selama musim. Baris warga adalah bagian warga. PM₂.₅ adalah rata-rata bulanan Sept 2019 (WashU); 55,5 adalah batas bawah “tidak sehat” 24 jam US EPA (2024), sebagai panduan. Garis = Indonesia.'],
  note26: ['Heavy fire = 10+ VIIRS detections in a 5 km cell over the season. 2026 detections: Sumatra and Kalimantan from the file the story uses (near-real-time from August), other provinces from a later FIRMS archive request (standard data for July–August). 2026 PM₂.₅ is the CAMS model mean for the October peak on a 0.5° grid (≈ 55 km; no satellite map exists yet), so it is coarser than 2019. Tick = Indonesia.',
    'Api berat = 10+ titik api VIIRS di sel 5 km selama musim. Titik api 2026: Sumatra dan Kalimantan dari berkas yang dipakai cerita (near-real-time sejak Agustus), provinsi lain dari permintaan arsip FIRMS berikutnya (data standar Juli–Agustus). PM₂.₅ 2026 adalah rerata model CAMS untuk puncak Oktober pada grid 0,5° (≈ 55 km; belum ada peta satelit), jadi lebih kasar dari 2019. Garis = Indonesia.'],
  partial: ['2026 covers only the part of this region inside Sumatra and Kalimantan ({c} of its land).', '2026 hanya mencakup bagian wilayah ini di Sumatra dan Kalimantan ({c} daratannya).'],
  compare: ['Change 2019 → 2026', 'Perubahan 2019 → 2026'],
  layers: ['Show', 'Tampilkan'],
  layerPlan: ['Prevention plan', 'Rencana pencegahan'],
  planHead: ['Prevention plan, 20% budget (wind-aware MILP)', 'Rencana pencegahan, anggaran 20% (MILP dengan angin)'],
  planHealth: ['Health first', 'Kesehatan dulu'],
  planBalanced: ['Balanced', 'Seimbang'],
  planBody: ['{n} regencies. Avoids {a} µg/m³ of population-weighted PM₂.₅ and {e}% of fire emissions. Funding the regencies with the most fire would avoid only {f} µg/m³.',
    '{n} kabupaten/kota. Menghindari {a} µg/m³ PM₂.₅ berbobot penduduk dan {e}% emisi api. Mendanai daerah dengan api terbanyak hanya menghindari {f} µg/m³.'],
  planNote: ['ERA5 wind decides whose air each fire reaches. Sumatra and Kalimantan only, where the model was calibrated.', 'Angin ERA5 menentukan udara siapa yang terkena tiap api. Hanya Sumatra dan Kalimantan, tempat model dikalibrasi.'],
  planTip: ['In the prevention plan: rank {r} of {n}, {s} of the benefit', 'Dalam rencana pencegahan: peringkat {r} dari {n}, {s} manfaat'],
  peatTests: ['Peat test: in a difference-in-differences, a fully peat cell changed by {did} detections per 100 km² more than non-peat land from 2019 to 2026. At the peat edge, fire density jumps from {o} to {i} per 100 km² (2026).',
    'Uji gambut: dalam difference-in-differences, sel yang seluruhnya gambut berubah {did} titik api per 100 km² lebih banyak daripada lahan non-gambut dari 2019 ke 2026. Di tepi gambut, kepadatan api melonjak dari {o} ke {i} per 100 km² (2026).'],
  compareShort: ['Change', 'Perubahan'],
  details: ['Details ▾', 'Detail ▾'],
  detailsHide: ['Less ▴', 'Ringkas ▴'],
  changeEnds: ['worse ×2 ← same → better', 'memburuk ×2 ← sama → membaik'],
  layerFire: ['Fire', 'Api'],
  layerSmoke: ['Smoke', 'Asap'],
  change: ['Fire detections, 2026 vs 2019 (per regency)', 'Titik api, 2026 vs 2019 (per kabupaten/kota)'],
  changeTip: ['Fire 2019 → 2026: {a} → {b}', 'Api 2019 → 2026: {a} → {b}'],
  changeFew: ['too few fires to compare', 'api terlalu sedikit untuk dibandingkan'],
  detections: ['{n} fire detections', '{n} titik api'],
  fewer: ['{p} fewer than 2019', '{p} lebih sedikit dari 2019'],
  more2: ['{p} more than 2019', '{p} lebih banyak dari 2019'],
  ofPeople: ['Of {n} people,', 'Dari {n} warga,'],
  breathed: ['{p} breathed unhealthy air', '{p} menghirup udara tidak sehat'],
  inSept: ['in Sept 2019 and', 'pada Sept 2019 dan'],
  lived: ['{p} lived in a heavy-fire cell.', '{p} tinggal di sel api berat.'],
  chainTitle: ['1 figure = {p}% of the people in {name}', '1 orang = {p}% warga {name}'],
  chainPeople: ['{n} people above 55 µg/m³', '{n} warga di atas 55 µg/m³'],
  chainNone: ['no full smoke estimate here', 'belum ada estimasi asap penuh'],
  chainTip: ['{n} of {total} figures · {p} people', '{n} dari {total} orang · {p} warga'],
  noEstimate: ['no estimate', 'tanpa estimasi'],
  withinWho: ['within WHO guideline', 'di bawah pedoman WHO'],
  aboveWho: ['above WHO guideline', 'di atas pedoman WHO'],
  unhealthy: ['unhealthy', 'tidak sehat'],
  veryUnhealthy: ['150 µg/m³ or more', '150 µg/m³ atau lebih'],
  srcShort19: ['WashU satellite', 'satelit WashU'],
  srcShort26: ['CAMS model', 'model CAMS'],
  gCountry: ['Country', 'Negara'],
  gFire: ['Fire areas', 'Area kebakaran'],
  gIslands: ['Islands', 'Pulau'],
  gProvinces: ['Provinces', 'Provinsi'],
  gIn: ['Regencies in {n}', 'Kabupaten/kota di {n}'],
  gResults: ['Matches', 'Hasil'],
  belt: ['Sumatra + Kalimantan (peat fire belt)', 'Sumatra + Kalimantan (sabuk api gambut)'],
  smoke: ['Smoke over Indonesia and its neighbours', 'Asap di Indonesia dan negara tetangga'],
  borders: ['The smoke crossed borders: {m} mean PM₂.₅ was {list}.', 'Asap melintasi perbatasan: rerata PM₂.₅ {m} di {list}.'],
  tipOutside: ['Outside Indonesia', 'Di luar Indonesia'],
  tipSmoke: ['{m} PM₂.₅ {r} µg/m³', 'PM₂.₅ {m} {r} µg/m³'],
  month: ['{m} {y}', '{m} {y}'],
  sep: ['Sept', 'Sept'], oct: ['Oct', 'Okt'],
  breathed26: ['{p} breathed unhealthy air in {m} (CAMS model) and', '{p} menghirup udara tidak sehat pada {m} (model CAMS) dan'],
  src19: ['WashU satellite estimate, 1 km', 'estimasi satelit WashU, 1 km'],
  src26: ['CAMS model, 0.5° (≈ 55 km)', 'model CAMS, 0,5° (≈ 55 km)'],
  deep: ['ArcGIS deep dive by kecamatan', 'Analisis rinci ArcGIS per kecamatan'],
  legendTitle: ['Fire detections per 100 km² (cells with 10+)', 'Titik api per 100 km² (sel dengan 10+)'],
  changeLabels: [['×2 or more', 'worse', 'about the same', 'better', 'half or less'], ['×2 atau lebih', 'memburuk', 'hampir sama', 'membaik', 'separuh atau kurang']],
  legendSmoke: ['{m} PM₂.₅, µg/m³ · {src}', 'PM₂.₅ {m}, µg/m³ · {src}'],
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
  aria: ['Map of fire detections across Indonesia and smoke across the region', 'Peta titik api di Indonesia dan asap di kawasan'],
};
const t = (key, vars = {}) => T[key][lang === 'id' ? 1 : 0].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const nf = (v, d = 0) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pct = v => (v == null || Number.isNaN(v) ? '—' : v > 0 && v < 0.001 ? '<0.1%' : `${nf(v * 100, v < 0.1 ? 1 : 0)}%`);
const people = v => (v >= 1e6 ? `${nf(v / 1e6, v >= 1e8 ? 0 : 2)} ${t('million')}` : nf(Math.round(v / (v >= 1e4 ? 100 : 1)) * (v >= 1e4 ? 100 : 1)));

const ISLANDS = ['Sumatra', 'Java', 'Kalimantan', 'Bali & Nusa Tenggara', 'Sulawesi', 'Maluku', 'Papua'];
const BELT = ['Sumatra', 'Kalimantan'];
const ROOT = 'ID';
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
let NEIGHBOURS = [];                                           // filled from atlas.smoke.cities
const CITY_ZOOM = [0, 4.2, 5.4, 6.6, 7.4];

/* ================================================================ projection */
const TILE = 256;
const MIN_Z = 3;                                               // low enough for all of Indonesia on a phone
const toWorld = (lon, lat) => [(lon + 180) / 360 * TILE, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * TILE];
const fromWorld = (x, y) => [x / TILE * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / TILE))) * 180 / Math.PI];

/* ================================================================ state */
// Layers: fire spikes per year (both may be on), smoke for one year at a time (0 = off), change fill.
const state = { region: ROOT, year: 2026, fire19: false, fire26: true, smoke: 0, compare: true, plan: false, planMode: 'health', people: false, smokeMonth: 'oct' };
let plan = null;                                               // MILP prevention plan + peat tests (data/plan.json)   // 2026 smoke is always the October peak
let cell, regions, boundsData, smoke = null, cams = null, allPath = null, view = { cx: 0, cy: 0, z: 5 }, dirty = true, anim = null, visible = true;
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
    add(`is:${island}`, { kind: 'island', name: () => (lang === 'id' ? ISLAND_ID[island] : island), parent: ROOT, island, bbox: bbox(ps),
      fires: sumFires(ps.map(p => R.get(p.id))), cells: cellsOf(ps), rings: ps.map(p => p.rings) });
  }
  const belt = provsOf(BELT);
  add('belt', { kind: 'group', name: () => t('belt'), parent: ROOT, bbox: bbox(belt), fires: sumFires(belt.map(p => R.get(p.id))),
    cells: cellsOf(belt), rings: belt.map(p => p.rings) });
  add(ROOT, { kind: 'root', name: () => 'Indonesia', parent: null, bbox: [95, -11, 141, 6], fires: sumFires(bounds.provinces.map(p => R.get(p.id))),
    cells: Array.from({ length: n }, (_, i) => i), rings: bounds.provinces.map(p => p.rings) });
  return { c, R };
}

const SMOKE_BREAKS = [15, 35.5, 55.5, 150.5, 250.5];           // WHO 24 h guideline, then US EPA 24 h AQI breakpoints
const FIRE_MIN = 10;
// Change layer: regency fire detections 2026 / 2019 (same VIIRS sensor both years), +5 smoothing so tiny counts don't swing.
const CHANGE = ['#7a1212', '#c8503e', '#c4c8bf', '#8dbb86', '#2f7a43'];   // ×2+, worse, same, better, half or less
const CHANGE_MIN = 20;                                         // regencies with fewer detections in both years stay blank
function changeClass(fires) {
  const [a, b] = fires;
  if (a + b < CHANGE_MIN) return -1;
  const ratio = (b + 5) / (a + 5);
  return ratio >= 2 ? 0 : ratio >= 1.25 ? 1 : ratio > 0.8 ? 2 : ratio > 0.5 ? 3 : 4;
}
const ratioOf = ([a, b]) => (b + 5) / (a + 5);
function fmtChange(fires) {                                    // ×9.0 for big rises, otherwise +68% / −29%
  const r = fires[1] / Math.max(1, fires[0]);
  if (r >= 2) return `×${nf(r, 1)}`;
  const d = r - 1;
  return `${d >= 0 ? '+' : '−'}${nf(Math.abs(d) * 100)}%`;
}
function childRegions(key) {                                   // islands → provinces → the busiest regencies
  const r = regions.get(key), all = [...regions.values()];
  if (r.kind === 'root') return all.filter(x => x.kind === 'island');
  if (r.kind === 'group') return all.filter(x => x.kind === 'island' && BELT.includes(x.island));
  if (r.kind === 'island') return all.filter(x => x.kind === 'province' && x.island === r.island);
  if (r.kind === 'province') return all.filter(x => x.kind === 'regency' && x.parent === r.key).sort((a, b) => b.fires[0] + b.fires[1] - a.fires[0] - a.fires[1]).slice(0, 8);
  return [];
}
function renderChange(kids) {                                  // diverging bars on a log scale centred on "no change"
  const el = $('at-change');
  if (!kids.length) { el.innerHTML = ''; return; }
  const rows = [...kids].sort((a, b) => ratioOf(b.fires) - ratioOf(a.fires));
  const pos = f => Math.max(-2, Math.min(3.4, Math.log2(f[1] / Math.max(1, f[0])))) ;
  el.innerHTML = `<h4>${t('changeHead')}</h4>` + rows.map(k => {
    const v = pos(k.fires), c = CHANGE[changeClass(k.fires)], w = Math.abs(v) / 5.4 * 100, x = 2 / 5.4 * 100;
    return `<button type="button" data-key="${k.key}" title="${nf(k.fires[0])} → ${nf(k.fires[1])}"><span>${k.name()}</span>
      <i class="track"><b class="mid" style="left:${x}%"></b><b class="bar" style="background:${c};left:${v < 0 ? x - w : x}%;width:${w}%"></b></i>
      <em style="color:${changeClass(k.fires) === 2 ? 'var(--muted)' : c}">${fmtChange(k.fires)}</em></button>`;
  }).join('');
}                       // detections per 5 km cell and season that count as heavy fire
const statCache = new Map();
function stats(key, year) {
  const id = `${key}|${year}|${year === 2026 ? state.smokeMonth : ''}`;
  if (statCache.has(id)) return statCache.get(id);
  const pmOf = year === 2019 ? i => cell.pm[i] / 10 : i => camsAt(i);
  const r = regions.get(key), f = cell.f[year];
  let land = 0, landCov = 0, landFire = 0, landAny = 0, pop = 0, popCov = 0, popFire = 0, pmPop = 0;
  const classes = [0, 0, 0, 0, 0, 0];                           // people per smoke class (SMOKE_BREAKS)
  for (const i of r.cells) {
    const a = cell.area[i] / 100, p = cell.pop[i];
    land += a; pop += p;
    if (year === 2019 || cell.cover[i]) {
      landCov += a; popCov += p;
      if (f[i]) landAny += a;
      if (f[i] >= FIRE_MIN) { landFire += a; popFire += p; }
    }
    const v = pmOf(i);
    if (v > 0) { pmPop += p; classes[SMOKE_BREAKS.filter(b => v >= b).length] += p; }
  }
  const coverage = land ? landCov / land : 0;
  const s = {
    land, pop, coverage, fires: r.fires[year === 2019 ? 0 : 1],
    fireShare: landCov ? landFire / landCov : null, anyShare: landCov ? landAny / landCov : null, peopleFire: popCov ? popFire / popCov : null,
    classes, noSmoke: pop - pmPop,
    over: Object.fromEntries([[35, 2], [55, 3], [150, 4]].map(([k, from]) => [k, pmPop >= pop * 0.9 ? classes.slice(from).reduce((a, b) => a + b, 0) / pmPop : null])),
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
    if (v < FIRE_MIN) continue;                                  // spikes only for heavy-fire cells (10+ detections)
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
const SPIKE19_L = ['#cdcdef', '#ababe1', '#8b8bd2', '#6d6dc1', '#5252a6', '#3a3a86'];   // 2019 in the story's indigo
const SPIKE19_R = ['#b5b5e3', '#9494d4', '#7676c4', '#5a5aad', '#434391', '#2d2d70'];
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
  const z = Math.max(MIN_Z, Math.min(11, Math.log2(Math.min(aw / (x1 - x0), ah / (y1 - y0)) * 0.92)));
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
  const layer = smokeLayer();
  if (layer) {
    const [ax, ay] = toWorld(layer.bounds[0], layer.bounds[3]), [bx, by] = toWorld(layer.bounds[2], layer.bounds[1]);
    ctx.imageSmoothingEnabled = layer.smooth;
    ctx.drawImage(layer.img, ax, ay, bx - ax, by - ay);
    ctx.imageSmoothingEnabled = true;
  }
  if (state.region !== ROOT) {
    const veil = new Path2D();
    veil.rect(view.cx - W / 2 / s - 1, view.cy - H / 2 / s - 1, W / s + 2, H / s + 2);
    veil.addPath(pathOf(state.region));
    ctx.fillStyle = 'rgba(232,236,229,.6)';
    ctx.fill(veil, 'evenodd');
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(75,90,81,.32)';
  ctx.lineWidth = 0.7 * px;
  ctx.stroke(allPath);
  if (view.z >= 6.4) {
    const provKey = sel.kind === 'regency' ? sel.parent : sel.kind === 'province' ? sel.key : null;
    if (provKey) {
      ctx.strokeStyle = 'rgba(75,90,81,.22)';
      ctx.lineWidth = 0.5 * px;
      for (const r of regions.values()) if (r.kind === 'regency' && r.parent === provKey) ctx.stroke(pathOf(r.key));
    }
  }
  if (state.compare) {
    ctx.globalAlpha = 0.62;
    for (const r of regions.values()) {
      if (r.kind !== 'regency') continue;
      const k = changeClass(r.fires);
      if (k < 0) continue;
      ctx.fillStyle = CHANGE[k];
      ctx.fill(pathOf(r.key));
    }
    ctx.globalAlpha = 1;
  }
  if (state.plan && plan) {
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#0f766e';
    for (const p of planList()) if (regions.has(p.id)) ctx.fill(pathOf(p.id));
    ctx.globalAlpha = 1; ctx.strokeStyle = '#063f3a'; ctx.lineWidth = 0.9 / s;
    for (const p of planList()) if (regions.has(p.id)) ctx.stroke(pathOf(p.id));
  }
  drawCellLayers(W, H, s);
  if (priority?.path) {
    ctx.fillStyle = 'rgba(138,74,16,.12)';
    ctx.fill(priority.path);
    ctx.strokeStyle = '#6b3410';
    ctx.lineWidth = 1.1 * px;
    ctx.stroke(priority.path);
  }
  if (state.region !== ROOT) {
    ctx.strokeStyle = 'rgba(22,33,27,.7)';
    ctx.lineWidth = 1.2 * px;
    ctx.stroke(pathOf(state.region));
  }

  // screen-space spikes, north to south so nearer ones overlap
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const cellPx = cell.g.cell / 360 * TILE * s;
  const minPx = W < 760 ? 6 : 4.2;                              // phones: coarser bins, fewer triangles
  let k = 1; while (k < 16 && cellPx * k < minPx) k *= 2;
  const hw = Math.max(1.1, Math.min(4.6, cellPx * k * 0.42));
  const HMAX = Math.min(170, H * 0.26) * (0.82 + 0.18 * Math.min(1, (view.z - 4) / 4));
  const toS = (x, y) => [(x - view.cx) * s + W / 2, (y - view.cy) * s + H / 2];
  const height = d => HMAX * Math.sqrt(Math.min(d, DMAX) / DMAX);
  const cull = (sx, sy, h) => sx < -10 || sx > W + 10 || sy < -4 || sy - h > H + 4;
  const years = [state.fire19 && 2019, state.fire26 && 2026].filter(Boolean);
  for (const year of years) {
    const dx = years.length === 2 ? (year === 2019 ? -hw * 0.95 : hw * 0.95) : 0;
    const L = year === 2019 ? SPIKE19_L : SPIKE_L, R = year === 2019 ? SPIKE19_R : SPIKE_R;
    for (const b of bins(k, year)) {
      const [x0, sy] = toS(b.x, b.y), sx = x0 + dx, h = height(b.d) * (b.in ? 1 : 0.6);
      if (h < 0.6 || cull(sx, sy, h)) continue;
      const ci = Math.min(5, Math.floor(h / HMAX * 6));
      ctx.globalAlpha = state.compare ? 0.55 : 1;
      ctx.fillStyle = b.in ? L[ci] : 'rgba(150,158,152,.4)';
      ctx.beginPath(); ctx.moveTo(sx - hw, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx, sy + 0.4); ctx.fill();
      ctx.fillStyle = b.in ? R[ci] : 'rgba(122,130,124,.4)';
      ctx.beginPath(); ctx.moveTo(sx + hw, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(sx, sy + 0.4); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  drawLabels(W, H, toS);
  updateScale(s);
}

function drawCellLayers(W, H, s) {
  if (!state.people) return;
  const sel = mask(), f = cell.f[state.year];
  const step = toWorld(cell.g.x0 + cell.g.cell, 0)[0] - toWorld(cell.g.x0, 0)[0];
  const x0 = view.cx - W / 2 / s, x1 = view.cx + W / 2 / s, y0 = view.cy - H / 2 / s, y1 = view.cy + H / 2 / s;
  const groups = new Map();
  const put = (style, i) => { let p = groups.get(style); if (!p) { p = new Path2D(); groups.set(style, p); } p.rect(cell.wx[i] - step / 2, cell.wy[i] - step / 2, step * 1.02, step * 1.02); };
  for (let i = 0; i < cell.n; i += 1) {
    if (!sel[i]) continue;
    const x = cell.wx[i], y = cell.wy[i];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
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
  const showPm = !!smokeLayer();
  for (const [city, lon, lat, rank, pm] of [...NEIGHBOURS.map(c => [c.name, c.lon, c.lat, ['Singapore', 'Kuala Lumpur', 'Kuching'].includes(c.name) ? 1 : 3, cityPm(c.name)]), ...CITIES]) {
    if (view.z < CITY_ZOOM[rank]) continue;
    const name = showPm && pm != null ? `${city} · ${nf(pm)} µg/m³` : city;
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
  const fireOn = state.fire19 || state.fire26;
  let html = fireOn ? `<h6>${t('legendTitle')}</h6><canvas width="${Wc * 2}" height="${(H + 16) * 2}" style="width:${Wc}px;height:${H + 16}px"></canvas>` : '';
  if (state.compare) {
    const names = T.changeLabels[lang === 'id' ? 1 : 0];
    html += `<div style="margin-top:6px;color:var(--ink);font-weight:600">${t('change')}</div><div>${CHANGE.map((c, k) => `<span class="key" title="${names[k]}" style="width:24px;margin:0;background:${c};opacity:.8"></span>`).join('')}</div><div style="font-size:11px">${t('changeEnds')}</div>`;
  }
  if (smokeLayer()) {
    const labels = ['15–35', '35–55', '55–150', '150–250', '250+'];
    html += `<div style="margin-top:4px">${t('legendSmoke', { m: monthName(state.smoke), src: t(state.smoke === 2019 ? 'src19' : 'src26') })}</div><div>${smoke.rgba.slice(1).map((c, i) => `<span class="key" title="${labels[i]}" style="width:22px;margin:0;background:rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})"></span>`).join('')}</div><div style="font-size:11px">15 · 35 · 55 · 150 · 250</div>`;
  }
  if (state.fire19 && state.fire26) html = html.replace('</h6>', `</h6><div><span class="key" style="background:#6d6dc1"></span>2019 <span class="key" style="background:#cc6c22;margin-left:8px"></span>2026</div>`);
  if (state.plan && plan) {
    const pt = planPoint(), mf = plan.simple?.['Most fire']?.health_ugm3 ?? plan.avoided_ugm3['Most fire'];
    html += `<div class="at-plan" style="margin-top:6px;max-width:240px;text-align:left"><span class="key" style="background:#0f766e"></span><b style="color:var(--ink)">${t('planHead')}</b>
      <div class="seg at-planmode">${['health', 'balanced'].map(m => `<button type="button" data-mode="${m}" aria-pressed="${state.planMode === m}">${t(m === 'health' ? 'planHealth' : 'planBalanced')}</button>`).join('')}</div>
      ${t('planBody', { n: planList().length, a: nf(pt.health_ugm3, 1), e: nf(pt.emissions_cut_pct, 1), f: nf(mf, 1) })}<br><span style="font-size:11px">${t('planNote')}</span></div>`;
  }
  if (state.people) html += `<div><span class="key" style="background:#2b5caa"></span>${t('legendPeople')}</div>`;
  if (priority?.path) html += `<div><span class="key" style="border:1.5px solid #6b3410"></span>${t('legendPriority')}</div>`;
  el.innerHTML = html;
  if (!fireOn) return;
  const c = el.querySelector('canvas').getContext('2d');
  c.scale(2, 2); c.font = '11px "Public Sans", sans-serif'; c.textAlign = 'center';
  [50, 200, 800, 1600].forEach((d, j) => {
    const h = H * Math.sqrt(d / DMAX), x = 22 + j * 36, ci = Math.min(5, Math.floor(h / H * 6));
    const only19 = state.fire19 && !state.fire26, L = only19 ? SPIKE19_L : SPIKE_L, R = only19 ? SPIKE19_R : SPIKE_R;
    c.fillStyle = L[ci]; c.beginPath(); c.moveTo(x - 5, H); c.lineTo(x, H - h); c.lineTo(x, H); c.fill();
    c.fillStyle = R[ci]; c.beginPath(); c.moveTo(x + 5, H); c.lineTo(x, H - h); c.lineTo(x, H); c.fill();
    c.fillStyle = '#4b5a51'; c.fillText(nf(d), x, H + 11);
  });
}

/* ================================================================ panel */
function renderPanel() {
  const r = regions.get(state.region), s = stats(state.region, state.year), nat = stats(ROOT, state.year);
  $('at-pick-name').textContent = r.name();
  $('at-pick').classList.toggle('long', r.name().length > 15);
  $('at-reset').hidden = state.region === ROOT;
  const big = $('at-big'), ck = changeClass(r.fires);
  big.textContent = ck < 0 ? '—' : fmtChange(r.fires);
  big.classList.toggle('na', ck < 0);
  big.style.color = ck < 0 || ck === 2 ? '' : CHANGE[ck];
  big.style.borderColor = ck < 0 ? '' : CHANGE[ck];
  $('at-sub').textContent = t(ck < 0 ? 'subFew' : 'subChange');
  const kids = childRegions(state.region).filter(k => changeClass(k.fires) >= 0);
  const up = kids.filter(k => changeClass(k.fires) <= 1).sort((a, b) => ratioOf(b.fires) - ratioOf(a.fires)).slice(0, 3);
  const down = kids.filter(k => changeClass(k.fires) >= 3).sort((a, b) => ratioOf(a.fires) - ratioOf(b.fires)).slice(0, 2);
  let html = `<u class="f">${t('lead', { a: nf(r.fires[0]), b: nf(r.fires[1]) })}</u>`;
  if (up.length) html += ` ${t('rise', { list: up.map(k => `${k.name()} ${fmtChange(k.fires)}`).join(', ') })}`;
  if (down.length) html += ` ${t('fall', { list: down.map(k => `${k.name()} ${fmtChange(k.fires)}`).join(', ') })}`;
  if (s.over[55] != null) html += ` <span class="muted">${t(state.year === 2019 ? 'smoke19' : 'smoke26', { p: pct(s.over[55]) })}</span>`;
  $('at-statement').innerHTML = html;
  renderChange(kids);
  const rows = [
    { id: 'fire', label: t('landFire'), v: s.fireShare, n: nat.fireShare, color: 'var(--ember)', lead: true },
    { id: 'any', label: t('landAny'), v: s.anyShare, n: nat.anyShare, color: 'var(--ember-hot)', lead: true },
    { id: 'people', label: t('peopleFire'), v: s.peopleFire, n: nat.peopleFire, color: 'var(--at-people)', on: state.people },
    { id: 35, label: t('pm35'), v: s.over[35], n: nat.over[35], color: 'rgb(166,154,204)', mark: true },
    { id: 55, label: t('pm55'), v: s.over[55], n: nat.over[55], color: 'rgb(128,110,178)', mark: true },
    { id: 150, label: t('pm150'), v: s.over[150], n: nat.over[150], color: 'rgb(92,70,150)', mark: true },
  ];
  $('at-bars').innerHTML = rows.map(row => {
    const control = row.lead || row.mark ? `<span class="mark" style="background:${row.color}"></span>`
      : `<input type="checkbox" id="at-bar-${row.id}" data-layer="${row.id}" ${row.on ? 'checked' : ''}>`;
    const w = row.v == null ? 0 : Math.max(row.v > 0 ? 1.5 : 0, row.v * 100);
    const tick = row.n == null || state.region === ROOT ? '' : `<b style="left:${row.n * 100}%"></b>`;
    return `<li class="${row.id === 'fire' ? 'lead' : ''} ${row.mark && row.v == null ? 'off' : ''}">${control}
      <label ${row.lead || row.mark ? '' : `for="at-bar-${row.id}"`} title="${row.label}">${row.label}</label>
      <span class="at-bar" style="color:${row.color}"><i style="width:${w}%"></i>${tick}</span><span class="v">${pct(row.v)}</span></li>`;
  }).join('');
  $('at-note').textContent = t('noteShort');
  $('at-note').title = t(state.year === 2026 ? 'note26' : 'note');
  paintLayers();

  for (const b of section.querySelectorAll('.at-years button')) b.setAttribute('aria-pressed', String(Number(b.dataset.year) === state.year));
  renderStudy();
}
$('at-change').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) select(b.dataset.key); });
$('at-bars').addEventListener('change', e => {
  const layer = e.target.dataset.layer;
  if (!layer) return;
  if (layer === 'people') state.people = e.target.checked;
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
  const pkName = { ID14: 'Riau', ID62: 'Central Kalimantan' }[pKey];
  if (plan && pkName && plan.did[pkName]) {
    const d = plan.did[pkName], r = plan.rd[pkName]['2026'];
    card.innerHTML += `<p style="margin-top:6px">${t('peatTests', { did: `${d.beta > 0 ? '+' : ''}${nf(d.beta)}`, o: nf(r.outside), i: nf(r.inside) })}</p>`;
  }
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
  const groups = [[t('gCountry'), [{ key: ROOT }]],
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

/* ================================================================ people chain */
// Isotype-style row per season: solid figures holding hands like a paper-doll chain, each 2% of the people
// in the selection (4% on phones), coloured by the smoke they breathed, worst first. Dashed = no estimate.
const CHAIN = ['#c3cabe', '#b3a7d6', '#6f58a8', '#2c1c58'];          // <15, 15–55, 55–150, ≥150 µg/m³
const CHAIN_LABEL = ['<15', '15–55', '55–150', '150+'];
const CHAIN_NAME = ['withinWho', 'aboveWho', 'unhealthy', 'veryUnhealthy'];
const toGroup = k => (k >= 4 ? 3 : k === 3 ? 2 : k >= 1 ? 1 : 0);    // six smoke classes → four groups
const strip = { canvas: $('at-strip'), rows: [], geom: null };
function chainParts(s, n) {                                    // largest-remainder rounding of people to n figures
  const pops = [0, 0, 0, 0];
  s.classes.forEach((p, k) => { pops[toGroup(k)] += p; });
  const groups = [3, 2, 1, 0].map(g => ({ g, pop: pops[g] })).concat([{ g: -1, pop: Math.max(0, s.noSmoke) }]);
  const total = groups.reduce((a, x) => a + x.pop, 0) || 1;
  for (const x of groups) { x.exact = x.pop / total * n; x.count = Math.floor(x.exact); }
  let left = n - groups.reduce((a, x) => a + x.count, 0);
  [...groups].sort((a, b) => (b.exact - b.count) - (a.exact - a.count)).forEach(x => { if (left > 0) { x.count += 1; left -= 1; } });
  return groups.flatMap(x => Array(x.count).fill(x.g));
}
function figure(c, x, top, u, h, g) {                          // one paper-doll figure; hands reach the cell edges
  const head = h * 0.11, neck = top + head * 2 + h * 0.03, hip = top + h * 0.6, foot = top + h;
  const body = Math.min(u * 0.5, h * 0.24), leg = body * 0.42;
  const col = g < 0 ? '#9aa395' : CHAIN[g];
  c.fillStyle = col; c.strokeStyle = col;
  const shape = new Path2D();
  shape.arc(x, top + head, head, 0, Math.PI * 2);
  shape.roundRect(x - body / 2, neck, body, hip - neck + body * 0.2, [body * 0.35, body * 0.35, body * 0.15, body * 0.15]);
  shape.roundRect(x - body / 2, hip, leg, foot - hip, [0, 0, leg / 2, leg / 2]);
  shape.roundRect(x + body / 2 - leg, hip, leg, foot - hip, [0, 0, leg / 2, leg / 2]);
  c.lineCap = 'round'; c.lineWidth = Math.max(1.6, body * 0.3);
  const arms = new Path2D();
  arms.moveTo(x - body / 2 + 1, neck + c.lineWidth / 2); arms.lineTo(x - u / 2, top + h * 0.52);
  arms.moveTo(x + body / 2 - 1, neck + c.lineWidth / 2); arms.lineTo(x + u / 2, top + h * 0.52);
  if (g < 0) {
    c.setLineDash([2, 2]); c.lineWidth = 1; c.stroke(shape);
    c.lineWidth = Math.max(1.6, body * 0.3); c.stroke(arms); c.setLineDash([]);
  } else { c.fill(shape); c.stroke(arms); }
}
function renderStrip() {
  if (!regions) return;
  const { width: W, height: H } = resizeCanvas(strip.canvas);
  if (!W) return;
  const c = strip.canvas.getContext('2d'), narrow = W < 700, n = narrow ? 25 : 50;
  c.clearRect(0, 0, W, H);
  $('at-chain-title').textContent = t('chainTitle', { p: 100 / n, name: regions.get(state.region).name() });
  const left = narrow ? 62 : 100, right = narrow ? 6 : 260, rowH = H / 2, ink = '#16211b';
  const u = Math.min(26, (W - left - right) / n), h = Math.min(rowH - 14, u * 2.3);
  strip.rows = [];
  [[2019, 'sep'], [2026, state.smokeMonth]].forEach(([year, month], row) => {
    const s = stats(state.region, year), label = t('month', { m: t(month), y: year });
    const parts = chainParts(s, n), y0 = row * rowH, known = s.over[55] != null, top = y0 + rowH - h - 3;
    c.globalAlpha = year === state.year ? 1 : 0.5;
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = ink; c.font = `700 ${narrow ? 12 : 13.5}px "Public Sans", sans-serif`;
    c.fillText(label, 0, narrow ? top + 4 : top + h * 0.38);
    if (narrow) {                                               // phones: the share replaces the source line
      c.fillStyle = known ? '#2c1c58' : '#76837a'; c.font = '800 15px "Public Sans", sans-serif';
      c.fillText(known ? pct(s.over[55]) : '—', 0, top + 21);
    } else {
      c.fillStyle = '#76837a'; c.font = '500 11.5px "Public Sans", sans-serif';
      c.fillText(t(year === 2019 ? 'srcShort19' : 'srcShort26'), 0, top + h * 0.38 + 15);
    }
    parts.forEach((g, i) => figure(c, left + (i + 0.5) * u, top, u, h, g));
    const bad = parts.filter(g => g >= 2).length;               // bracket over everyone above 55 µg/m³
    if (bad && known) {
      const x1 = left + bad * u;
      c.strokeStyle = '#2c1c58'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(left + 2, top - 2); c.lineTo(left + 2, top - 7); c.lineTo(x1 - 2, top - 7); c.lineTo(x1 - 2, top - 2); c.stroke();
    }
    if (!narrow) {
      const x = left + n * u + 18;
      c.fillStyle = known ? '#2c1c58' : '#76837a'; c.font = '800 26px "Public Sans", sans-serif';
      c.fillText(known ? pct(s.over[55]) : '—', x, top + h * 0.38);
      c.fillStyle = '#4b5a51'; c.font = '600 12px "Public Sans", sans-serif';
      c.fillText(known ? t('chainPeople', { n: people(s.pop * s.over[55]) }) : t('chainNone'), x, top + h * 0.38 + 20);
    }
    strip.rows.push({ y0, y1: y0 + rowH, parts, s, label });
  });
  c.globalAlpha = 1;
  strip.geom = { left, u, n };
  $('at-chain-key').innerHTML = `<span>PM₂.₅ µg/m³</span>${[3, 2, 1, 0].map(g => `<i style="background:${CHAIN[g]}" title="${t(CHAIN_NAME[g])}"></i>${CHAIN_LABEL[g]}`).join('')}<i class="none"></i>${t('noEstimate')}`;
}
strip.canvas.addEventListener('pointermove', e => {
  const rect = strip.canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const row = strip.rows.find(r => my >= r.y0 && my < r.y1), geo = strip.geom, tip = $('at-tip');
  const i = geo ? Math.floor((mx - geo.left) / geo.u) : -1;
  if (!row || i < 0 || i >= geo.n) { tip.hidden = true; return; }
  const g = row.parts[i], same = row.parts.filter(x => x === g).length;
  tip.innerHTML = `<b>${row.label}</b>${g < 0 ? t('noEstimate') : `PM₂.₅ ${CHAIN_LABEL[g]} µg/m³ · ${t(CHAIN_NAME[g])}`}<br>${t('chainTip', { n: same, total: geo.n, p: people(row.s.pop * same / geo.n) })}`;
  tip.hidden = false;
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14)}px`;
  tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - 10)}px`;
});
strip.canvas.addEventListener('pointerleave', () => { $('at-tip').hidden = true; });

/* ================================================================ interaction */
function select(key, animate = true) {
  if (!regions.has(key)) key = ROOT;
  state.region = key;
  fit(key, animate);
  renderPanel(); renderStrip(); writeURL();
  dirty = true;
}
// Region and year live in the query string; the deck owns the #slide hash.
function writeURL() {
  const p = new URLSearchParams(location.search);
  if (state.region === ROOT) p.delete('r'); else p.set('r', state.region);
  if (state.year === 2026) p.delete('y'); else p.set('y', state.year);
  const q = p.toString(), url = `${location.pathname}${q ? `?${q}` : ''}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url);
}
function readURL() {
  const p = new URLSearchParams(location.search), y = Number(p.get('y'));
  if (y === 2019 || y === 2026) state.year = y;
  return p.get('r') ?? ROOT;
}
for (const b of section.querySelectorAll('.at-years button')) b.addEventListener('click', () => {
  state.year = Number(b.dataset.year);
  state.fire19 = state.year === 2019; state.fire26 = state.year === 2026;
  if (state.smoke) state.smoke = state.year;
  renderPanel(); renderStrip(); drawLegend(); writeURL(); dirty = true;
});
$('at-reset').addEventListener('click', () => select(ROOT));
// Phones: the panel starts collapsed to the region and the headline number.
const panel = section.querySelector('.at-panel');
if (innerWidth < 760) panel.classList.add('collapsed');
$('at-details').addEventListener('click', () => {
  const open = panel.classList.toggle('collapsed') === false;
  $('at-details').setAttribute('aria-expanded', String(open));
  $('at-details').textContent = t(open ? 'detailsHide' : 'details');
});

// Layer bar: fire spikes, smoke and the 2019 → 2026 change fill switch on and off independently.
// Prevention plan: two points on the Pareto frontier (health first, or the balanced knee).
const planList = () => (state.planMode === 'balanced' && plan?.balanced ? plan.balanced : plan?.health_first ?? plan?.selected ?? []);
function planPoint() {
  const f = plan?.frontier ?? [];
  if (!f.length) return { health_ugm3: plan?.avoided_ugm3?.MILP ?? 0, emissions_cut_pct: 0 };
  if (state.planMode === 'health') return f[0];
  return f.reduce((best, z) => (z.health_ugm3 / f[0].health_ugm3 + z.emissions_cut_pct / f.at(-1).emissions_cut_pct > best.health_ugm3 / f[0].health_ugm3 + best.emissions_cut_pct / f.at(-1).emissions_cut_pct ? z : best), f[0]);
}
$('at-legend').addEventListener('click', e => {
  const b = e.target.closest('.at-planmode button');
  if (!b) return;
  state.planMode = b.dataset.mode; drawLegend(); dirty = true;
});
const layerOn = key => ({ fire19: state.fire19, fire26: state.fire26, smoke19: state.smoke === 2019, smoke26: state.smoke === 2026, change: state.compare, plan: state.plan })[key];
function paintLayers() {
  for (const b of section.querySelectorAll('.at-layers button')) b.setAttribute('aria-pressed', String(layerOn(b.dataset.layer)));
}
for (const b of section.querySelectorAll('.at-layers button')) b.addEventListener('click', () => {
  const key = b.dataset.layer;
  if (key === 'fire19') state.fire19 = !state.fire19;
  else if (key === 'fire26') state.fire26 = !state.fire26;
  else if (key === 'smoke19') state.smoke = state.smoke === 2019 ? 0 : 2019;   // one smoke year at a time
  else if (key === 'smoke26') state.smoke = state.smoke === 2026 ? 0 : 2026;
  else if (key === 'plan') state.plan = !state.plan;
  else state.compare = !state.compare;
  paintLayers(); drawLegend(); dirty = true;
});

function zoomAt(mx, my, dz) {
  const { W, H } = size(), s0 = 2 ** view.z, z = Math.max(MIN_Z, Math.min(12, view.z + dz)), s1 = 2 ** z;
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
    view = { ...view, z: Math.max(MIN_Z, Math.min(12, press.z + Math.log2(pinchDist() / press.pinch))) };
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
  if (i < 0) {
    const v = smokeValueAt(mx, my);
    if (v == null) { tip.hidden = true; return; }
    tip.innerHTML = `<b>${t('tipOutside')}</b>${t('tipSmoke', { m: monthName(state.smoke), r: v })}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, mx + 14)}px`;
    tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, my + 14)}px`;
    return;
  }
  const reg = boundsData.regencies[cell.reg[i]], f = cell.f[state.year][i], covered = state.year === 2019 || cell.cover[i];
  const pmYear = state.smoke || state.year, pmv = pmYear === 2019 ? cell.pm[i] / 10 : camsAt(i);
  tip.innerHTML = `<b>${reg.name}</b><span>${regions.get(reg.province).name()}</span><br>${t('tipCell')} · ${covered ? t('tipFire', { n: nf(f) }) : t('noData')}<br>${t('tipPeople', { n: nf(cell.pop[i]) })}${pmv > 0 ? `<br>${t('tipSmoke', { m: monthName(pmYear), r: nf(pmv) })}` : ''}${state.plan && plan && planList().some(p => p.id === reg.id) ? `<br><b style="display:inline;color:#0f766e">${t('planTip', { r: planList().findIndex(p => p.id === reg.id) + 1, n: planList().length, s: pct(planList().find(p => p.id === reg.id).share) })}</b>` : ''}${state.compare ? `<br><b style="display:inline">${changeClass(reg.fires) < 0 ? t('changeFew') : t('changeTip', { a: nf(reg.fires[0]), b: nf(reg.fires[1]) })}</b>` : ''}`;
  tip.hidden = false;
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, mx + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, my + 14)}px`;
}
section.addEventListener('keydown', e => {                      // arrows stay with the deck; +/− zoom when focus is in the map slide
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === '+' || e.key === '=') zoomAt(...centre(), 0.5);
  else if (e.key === '-') zoomAt(...centre(), -0.5);
  else if (e.key === 'Escape' && state.region !== ROOT) select(regions.get(state.region).parent ?? ROOT);
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
  if (regions) { renderPanel(); renderStrip(); drawLegend(); if (picker.open) renderPicker(); dirty = true; }
}
new MutationObserver(applyLanguage).observe(root, { attributes: true, attributeFilter: ['lang'] });

/* ================================================================ smoke layer helpers */
// 2019: WashU satellite image (data/atlas-smoke.png). 2026: CAMS model monthly means on the story's 0.5° grid
// (data/regional.json), drawn as blocks so the coarser source shows.
const monthName = (year = state.year) => (year === 2019 ? t('month', { m: t('sep'), y: 2019 }) : t('month', { m: t(state.smokeMonth), y: 2026 }));
function smokeLayer() {
  if (!state.smoke) return null;
  if (state.smoke === 2019) return smoke?.ok ? { img: smoke.img, bounds: smoke.bounds, smooth: true } : null;
  if (!cams) return null;
  const h = cams.g.step / 2;
  return { img: cams.tiles[state.smokeMonth], bounds: [cams.lon0 - h, cams.lat0 - h, cams.lon1 + h, cams.lat1 + h], smooth: false };
}
function camsValue(lon, lat) {
  if (!cams) return 0;
  const c = Math.round((lon - cams.lon0) / cams.g.step), r = Math.round((cams.lat1 - lat) / cams.g.step);
  if (c < 0 || r < 0 || c >= cams.g.w || r >= cams.g.h) return 0;
  return cams.values[state.smokeMonth][r * cams.g.w + c];
}
function camsAt(i) {
  const lon = cell.g.x0 + (cell.col[i] + 0.5) * cell.g.cell, lat = cell.g.y0 - (cell.row[i] + 0.5) * cell.g.cell;
  return camsValue(lon, lat);
}
function cityPm(name) {
  if ((state.smoke || state.year) === 2026) { const c = cams?.cities[name]; return c ? c[state.smokeMonth === 'sep' ? 'camsSep2026' : 'camsOct2026'] : null; }
  return cams?.cities[name]?.washuSep2019 ?? NEIGHBOURS.find(c => c.name === name)?.pm25 ?? null;
}
function smokeValueAt(clientX, clientY) {                      // PM2.5 under the pointer outside Indonesia
  if (!smokeLayer()) return null;
  const { W, H, r } = size(), s = 2 ** view.z;
  const [lon, lat] = fromWorld(view.cx + (clientX - r.left - W / 2) / s, view.cy + (clientY - r.top - H / 2) / s);
  if (state.smoke === 2026) { const v = camsValue(lon, lat); return v > 0 ? `≈ ${nf(v)}` : null; }
  if (!smoke.pixels) return null;
  const [ax, ay] = toWorld(smoke.bounds[0], smoke.bounds[3]), [bx, by] = toWorld(smoke.bounds[2], smoke.bounds[1]), [wx, wy] = toWorld(lon, lat);
  const x = Math.floor((wx - ax) / (bx - ax) * smoke.img.width), y = Math.floor((wy - ay) / (by - ay) * smoke.img.height);
  if (x < 0 || y < 0 || x >= smoke.img.width || y >= smoke.img.height) return null;
  const k = smoke.rgba.findIndex(c => c[3] === smoke.pixels[4 * (y * smoke.img.width + x) + 3]);
  return k > 0 ? ['15–35', '35–55', '55–150', '150–250', '250+'][k - 1] : null;
}
function loadCams(regional, full) {                            // October 2026 CAMS for all Indonesian land (0.5°)
  const g = full, lon0 = full.lon0, lat1 = full.lat1, lon1 = lon0 + (g.w - 1) * g.step, lat0 = lat1 - (g.h - 1) * g.step;
  const values = { oct: decode(g.oct, Uint8Array) }, tiles = {};
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  const x = c.getContext('2d'), img = x.createImageData(g.w, g.h);
  values.oct.forEach((v, i) => {
    if (v >= smoke.breaks[0]) img.data.set(smoke.rgba[Math.min(smoke.rgba.length - 1, smoke.breaks.filter(b => v >= b).length)], 4 * i);
  });
  x.putImageData(img, 0, 0); tiles.oct = c;
  cams = { g, lon0, lon1, lat0, lat1, values, tiles, cities: regional.cities };
  statCache.clear(); dirty = true;
}

/* ================================================================ boot */
applyLanguage();
$('at-status').textContent = t('loading');
try {
  const [atlas, bounds] = await Promise.all([readJSON('atlas.json'), readJSON('atlas-bounds.json')]);
  boundsData = bounds;
  ({ c: cell, R: regions } = build(atlas, bounds));
  allPath = ringsPath(bounds.provinces.map(p => p.rings));
  NEIGHBOURS = atlas.smoke.cities.filter(c => c.pm25 != null);
  smoke = { ...atlas.smoke, img: new Image(), ok: false };
  smoke.img.onload = () => {
    const c = document.createElement('canvas');
    c.width = smoke.img.width; c.height = smoke.img.height;
    const g = c.getContext('2d'); g.drawImage(smoke.img, 0, 0);
    smoke.pixels = g.getImageData(0, 0, c.width, c.height).data;
    smoke.ok = true; dirty = true; drawLegend();
  };
  smoke.img.src = new URL(`data/${atlas.smoke.file}`, import.meta.url);
  readJSON('plan.json').then(p => { plan = p; drawLegend(); renderStudy(); dirty = true; }).catch(() => {});
  Promise.all([readJSON('regional.json'), readJSON('cams-indonesia.json')])
    .then(([reg, full]) => { loadCams(reg, full); renderPanel(); renderStrip(); drawLegend(); }).catch(() => {});
  $('at-status').textContent = '';
  const key = readURL();
  select(regions.has(key) ? key : ROOT, false);
  lastW = size().W;
  drawLegend();
  requestAnimationFrame(step);
} catch (error) {
  console.error(error);
  $('at-status').textContent = t('failed');
}
