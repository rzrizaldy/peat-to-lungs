import { EXPOSURE_COLORS, HEAT_COLORS, INDEX_COLORS, PROVINCE_NAMES, TYPE_COLORS, createMap, resizeCanvas } from './map.mjs';
import { PROCESS_STEPS, createProcess, createTerrain } from './iso.mjs';
import { lonLat } from './tools/model.mjs';

const el = id => document.getElementById(id);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const root = document.documentElement;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage disabled */ } },
};
let language = 'en';
const t = (english, indonesian) => (language === 'id' ? indonesian : english);
const fmt = (value, digits = 0) => (value === null || value === undefined || Number.isNaN(value) ? '—'
  : Number(value).toLocaleString(t('en-US', 'id-ID'), { maximumFractionDigits: digits, minimumFractionDigits: digits }));
const millions = v => `${fmt(v / 1e6, 2)} ${t('million', 'juta')}`;
const pct = v => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 0)}%`;
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const total = list => list.reduce((s, v) => s + v, 0);
const cssVar = name => getComputedStyle(root).getPropertyValue(name).trim();

/* ================================================================ language */
const staticText = $$('[data-id]').map(n => [n, n.textContent, n.dataset.id]);
const staticHTML = $$('[data-idh]').map(n => [n, n.innerHTML, n.dataset.idh]);
const attrMap = { 'aria-label': 'aria-label', alt: 'alt', content: 'content', label: 'data-label', title: 'title' };
const staticAttr = Object.entries(attrMap).flatMap(([key, attr]) =>
  $$(`[data-id-${key}]`).map(n => [n, attr, n.getAttribute(attr), n.getAttribute(`data-id-${key}`)]));

function applyLanguage(value) {
  language = value === 'id' ? 'id' : 'en';
  root.lang = language;
  el('language').value = language;
  for (const [n, en, id] of staticText) n.textContent = t(en, id);
  for (const [n, en, id] of staticHTML) n.innerHTML = t(en, id);
  for (const [n, attr, en, id] of staticAttr) n.setAttribute(attr, t(en, id));
  buildDots();
  if (ready) renderAll();
}

/* ================================================================ deck (hw02-style scroll focus) */
const deck = el('deck');
const slides = $$('.slide');
const dots = el('dots');
let current = 0;
const seen = new Set();
function buildDots() {
  dots.innerHTML = '';
  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.label = s.dataset.label;
    b.setAttribute('aria-label', `${i + 1}: ${s.dataset.label}`);
    b.addEventListener('click', () => go(i));
    dots.appendChild(b);
  });
  paintDots();
}
function paintDots() {
  $$('button', dots).forEach((b, j) => { b.setAttribute('aria-current', j === current); b.classList.toggle('seen', seen.has(j)); });
}
function go(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  slides[i].scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' });
}
function setCurrent(i) {
  if (i < 0) return;
  current = i; seen.add(i); slides[i].classList.add('seen');
  paintDots();
  el('counter').textContent = `${i + 1} / ${slides.length}`;
  for (const part of ['A', 'B', 'C', 'D']) {
    const idx = slides.map((s, j) => (s.dataset.part === part ? j : -1)).filter(j => j >= 0);
    const seg = document.querySelector(`.chapter-seg[data-part="${part}"]`);
    seg.style.setProperty('--fill', `${100 * idx.filter(j => seen.has(j)).length / idx.length}%`);
    seg.classList.toggle('on', slides[i].dataset.part === part);
  }
  if (slides[i].id && location.hash !== `#${slides[i].id}`) history.replaceState(null, '', `#${slides[i].id}`);
  if (slides[i].id === 'process' && process && !process.playing && !autoplayed) { autoplayed = true; process.play(); }
  if (slides[i].id === 'cities' && typeof cityIntro === 'function') cityIntro();
}
let autoplayed = false;
const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) setCurrent(slides.indexOf(e.target));
}, { root: deck, threshold: 0.45 });
slides.forEach(s => io.observe(s));
deck.addEventListener('scroll', () => { // tall slides on phones never reach 45% visibility
  const y = deck.scrollTop + 80;
  for (let i = slides.length - 1; i >= 0; i -= 1) {
    if (slides[i].offsetTop <= y) { if (i !== current && slides[i].offsetHeight > innerHeight * 1.6) setCurrent(i); break; }
  }
}, { passive: true });
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  const s = slides[current];
  const tall = s.offsetHeight > innerHeight + 40;
  if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) {
    if (tall && deck.scrollTop + innerHeight < s.offsetTop + s.offsetHeight - 20) return;
    e.preventDefault(); go(current + 1);
  } else if (['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) {
    if (tall && deck.scrollTop > s.offsetTop + 20) return;
    e.preventDefault(); go(current - 1);
  } else if (e.key === 'Home') { e.preventDefault(); go(0); } else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); }
});

/* ================================================================ theme: light only */
root.dataset.theme = 'light';

/* ================================================================ data */
const cache = new Map();
const readJSON = async path => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
const scenarioFile = key => {
  if (!cache.has(key)) cache.set(key, readJSON(`data/scenario-${key}.json`).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
};
let overview, geography, tests, stats, story, map, process, terrain, state, ready = false;
let profile, shape, regional, basemapData, exposure;
let selected = null, requestId = 0, modelKey = 'count-100', terrainYear = 2019, landYear = 2019;
let statusText = ['Loading Sumatra and Kalimantan…', 'Memuat Sumatera dan Kalimantan…'], statusError = false;
function renderStatus() { const s = el('app-status'); s.textContent = statusText[0] ? t(...statusText) : ''; s.classList.toggle('error', statusError); }
function setStatus(en = '', id = '', error = false) { statusText = [en, id]; statusError = error; renderStatus(); }

/* Regions: two islands, 13 provinces. Riau (ID14) and Central Kalimantan (ID62) are mapped by
   kecamatan, as in the ArcGIS Pro deep dive; the other provinces by kabupaten. */
const ISLANDS = ['Sumatra', 'Kalimantan'];
const FOCUS = ['ID14', 'ID62'];
const PROVINCE_EN = { ID11: 'Aceh', ID12: 'North Sumatra', ID13: 'West Sumatra', ID14: 'Riau', ID15: 'Jambi', ID16: 'South Sumatra',
  ID17: 'Bengkulu', ID18: 'Lampung', ID61: 'West Kalimantan', ID62: 'Central Kalimantan', ID63: 'South Kalimantan',
  ID64: 'East Kalimantan', ID65: 'North Kalimantan' };
const PROVINCE_ID = { ID11: 'Aceh', ID12: 'Sumatera Utara', ID13: 'Sumatera Barat', ID14: 'Riau', ID15: 'Jambi', ID16: 'Sumatera Selatan',
  ID17: 'Bengkulu', ID18: 'Lampung', ID61: 'Kalimantan Barat', ID62: 'Kalimantan Tengah', ID63: 'Kalimantan Selatan',
  ID64: 'Kalimantan Timur', ID65: 'Kalimantan Utara' };
const allProvinces = () => Object.keys(overview.provinces);
const islandOf = id => overview.provinces[id].island;
const islandIds = island => allProvinces().filter(id => islandOf(id) === island);
const islandName = island => (island === 'Sumatra' ? t('Sumatra', 'Sumatera') : 'Kalimantan');
const islandColour = island => cssVar(island === 'Sumatra' ? '--sumatra' : '--kalimantan');
const provinceIds = region => (region === 'all' ? allProvinces() : ISLANDS.includes(region) ? islandIds(region) : [region]);
const provinceName = id => t(PROVINCE_EN[id] ?? id, PROVINCE_ID[id] ?? id);
const scopeName = region => (region === 'all' ? t('Sumatra and Kalimantan', 'Sumatera dan Kalimantan') : ISLANDS.includes(region) ? islandName(region) : provinceName(region));
const areaWord = (n = 2) => (n === 1 ? t('area', 'wilayah') : t('areas', 'wilayah'));
const islandSeason = (island, y) => {
  const out = { total: 0, peat: 0, cleared: 0, remaining: 0, area: 0, peatArea: 0, forest: 0, loss: 0 };
  for (const id of islandIds(island)) {
    const p = overview.provinces[id], s = p.seasons[y];
    out.total += s.total; out.peat += s.peat; out.cleared += s.cleared; out.remaining += s.remaining;
    out.area += p.area; out.peatArea += p.peat; out.forest += p.forest; out.loss += p.loss;
  }
  // hotspots per 100 km² of each land stratum, as build-data.mjs computes per province
  out.rates = [100 * out.peat / out.peatArea, 100 * (out.total - out.peat) / (out.area - out.peatArea),
    100 * out.cleared / out.loss, 100 * out.remaining / (out.forest - out.loss)];
  return out;
};
const densityUnit = mode => (mode === 'frp' ? 'MW/km²' : t('detections/km²', 'deteksi/km²'));
const modelLabel = key => { const [m, r] = key.split('-'); return `${m === 'frp' ? 'FRP' : t('Count', 'Jumlah')} · ${r} km`; };
const currentIds = () => overview.zones.flatMap((z, i) => (provinceIds(state.region).includes(z.province) ? [i] : []));
const seasonTotal = (id, y) => (ISLANDS.includes(id) ? islandSeason(id, y).total : id === 'all' ? total(allProvinces().map(p => seasonTotal(p, y))) : overview.provinces[id].seasons[y].total);
const change = id => 100 * (seasonTotal(id, 2026) / seasonTotal(id, 2019) - 1);
const priorityPeople = (scenario, ids = allProvinces()) => total(ids.map(id => scenario.provinces[id].priorityPeople));
const pLabel = p => (p < 0.001 ? 'p < 0.001' : `p = ${fmt(p, 3)}`);

function clusterLabel(profile) {
  const [fire, loss, pm, pop] = profile.center;
  if (profile.type === 'both') return [t('Fire and smoke hotspots', 'Pusat api dan asap'), t('Patrol hotspots, prepare clinics and clean-air shelters.', 'Patroli titik api, siapkan puskesmas dan ruang udara bersih.')];
  if (profile.type === 'fire') return fire > 0.35
    ? [t('High fire activity', 'Aktivitas api tinggi'), t('Prioritise ground checks and peat rewetting.', 'Prioritaskan pengecekan lapangan dan pembasahan gambut.')]
    : [t('Degraded peat, little fire now', 'Gambut rusak, api kini sedikit'), t('Past forest loss on peat: rewet and patrol before the next dry season.', 'Bekas kehilangan hutan di gambut: basahi ulang dan patroli sebelum kemarau.')];
  if (profile.type === 'exposure') return [t('Smoke without much local fire', 'Asap tanpa banyak api lokal'), t('Monitor air quality; smoke arrives from elsewhere.', 'Pantau kualitas udara; asap datang dari wilayah lain.')];
  if (profile.type === 'dense') return [t('Dense towns', 'Kota padat'), t('Check health service and alert coverage.', 'Periksa layanan kesehatan dan jangkauan peringatan.')];
  void loss; void pm; void pop;
  return [t('Lower pressure', 'Tekanan rendah'), t('Routine monitoring.', 'Pemantauan rutin.')];
}

/* ================================================================ two cities (Pocket City dioramas) */
// The dioramas are Pocket City pages (April Zhu, MIT) served from the same site, so this page can hide their
// panels and drive their "Special scenes" control: one switch moves both cities between a clear day and the haze.
const EMBED_CSS = 'html,body{background:transparent!important}.top,.rail,.foot,.control-area,.tools,.loading{display:none!important}'
  + '.workspace{height:100%!important;background:none!important}.stage{left:0!important;right:0!important;top:0!important;bottom:0!important}';
const CITY_TEXT = {
  pky: {
    clear: ['Late afternoon on the Kahayan. From about 4 pm the food stalls at Dermaga Rambang open, and they stay busy into the night.',
      'Sore di tepi Kahayan. Sekitar pukul 4 sore warung-warung di Dermaga Rambang buka, dan ramai sampai malam.'],
    haze: ['From 19 October 2026 the city\'s kindergarten, primary and junior-high pupils learned from home, after four days of dangerous air.',
      'Mulai 19 Oktober 2026 siswa PAUD, SD, dan SMP kota ini belajar dari rumah, setelah empat hari udara berbahaya.'],
  },
  sg: {
    clear: ['Marina Bay Sands: three 55-storey towers carry a 340 m SkyPark, and the ArtScience Museum’s ten white fingers open beside the bay.',
      'Marina Bay Sands: tiga menara 55 lantai menyangga SkyPark sepanjang 340 m, dan sepuluh "jari" putih ArtScience Museum mekar di tepi teluk.'],
    haze: ['On 14 October 2026 smoke from fires in Kalimantan drifted in on southeasterly winds. Children and the elderly were asked to minimise outdoor activity.',
      'Pada 14 Oktober 2026 asap dari kebakaran di Kalimantan terbawa angin tenggara. Anak-anak dan lansia diminta mengurangi aktivitas di luar ruangan.'],
  },
};
let cityDay = 'clear', cityTouched = false, cityAuto = false;
function applyDay(frame) {
  let d;
  try { d = frame.contentDocument; } catch { return; }
  const sel = d && d.getElementById('event');
  if (!sel) return;
  if (!d.getElementById('embed-css')) {
    const st = d.createElement('style'); st.id = 'embed-css'; st.textContent = EMBED_CSS; d.head.appendChild(st);
  }
  if (cityDay === 'haze') { sel.value = 'haze'; sel.dispatchEvent(new Event('change')); }
  else { sel.value = ''; d.querySelector(`[data-s="${frame.dataset.clear}"]`)?.click(); }
}
// US EPA AQI for 24-hour PM2.5 (2024 breakpoints) and its category colours
const AQI_BANDS = [[0, 9, 0, 50, 'Good', 'Baik', '#00e400'], [9.1, 35.4, 51, 100, 'Moderate', 'Sedang', '#ffff00'],
  [35.5, 55.4, 101, 150, 'Unhealthy for sensitive groups', 'Tidak sehat bagi kelompok sensitif', '#ff7e00'],
  [55.5, 125.4, 151, 200, 'Unhealthy', 'Tidak sehat', '#ff0000'], [125.5, 225.4, 201, 300, 'Very unhealthy', 'Sangat tidak sehat', '#8f3f97'],
  [225.5, Infinity, 301, null, 'Hazardous', 'Berbahaya', '#7e0023']];
function aqiOf(pm) {
  const c = Math.round(pm * 10) / 10;
  const [lo, hi, a0, a1, en, id, colour] = AQI_BANDS.find(b => c <= b[1]);
  const value = a1 === null ? null : Math.round(a0 + (c - lo) * (a1 - a0) / (hi - lo));
  return { value, label: t(en, id), colour };
}
let PEAKS = null;
function peaks() {
  if (PEAKS || !regional) return PEAKS;
  const top = arr => arr.reduce((b, v, i) => (v != null && v > b[0] ? [v, i] : b), [-1, -1]);
  const day = i => new Date(Date.UTC(2026, 6, 1) + i * 864e5);
  const [pv, pi] = top(regional.cities['Palangka Raya'].camsDaily2026), [sv, si] = top(regional.singapore.daily[2026]);
  PEAKS = { pky: { pm: pv, date: day(pi), src: ['model estimate (CAMS)', 'estimasi model (CAMS)'] },
            sg: { pm: sv, date: day(si), src: ['measured (NEA stations)', 'terukur (stasiun NEA)'] } };
  return PEAKS;
}
function renderPeak(key) {
  const box = el(`peak-${key}`), p = peaks()?.[key];
  if (!box || !p) return;
  const a = aqiOf(p.pm), cigs = Math.round(p.pm / 22), on = cityDay === 'haze';
  const date = p.date.toLocaleDateString(t('en-GB', 'id-ID'), { day: 'numeric', month: 'long', timeZone: 'UTC' });
  box.className = `peak ${on ? '' : 'off'}`;
  box.innerHTML = `<div class="peak-num">${fmt(p.pm)}<small>µg/m³</small></div>
    <div class="peak-meta">${t(`Worst day: PM₂.₅ daily average, ${date} 2026, ${p.src[0]}`, `Hari terburuk: rerata harian PM₂.₅, ${date} 2026, ${p.src[1]}`)}
      <div class="peak-tags"><span class="aqi" style="background:${a.colour}">${t('US AQI', 'AQI AS')}: ${a.label}${a.value ? ` · ${a.value}` : ` · ${t('above the scale', 'melampaui skala')}`}</span>
      <span class="who">${fmt(p.pm / 15)}× ${t('WHO daily guideline', 'pedoman harian WHO')}</span></div></div>
    <div class="cigs"><p class="cigs-label">${t(`Breathing it for one day ≈ ${cigs} cigarettes`, `Menghirupnya seharian ≈ ${cigs} batang rokok`)}</p>
      <div class="cig-row" aria-hidden="true">${Array.from({ length: cigs }, (_, i) => `<svg style="transition-delay:${on ? i * 35 : 0}ms"><use href="#i-cig"/></svg>`).join('')}</div></div>
    ${on ? '' : `<p class="peak-hint">${t('Switch to the haze to see the worst day.', 'Pilih kabut asap untuk melihat hari terburuk.')}</p>`}`;
  if (on) requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('on')));   // let the cigarettes appear one by one
}
function renderCities() {
  el('city-pky').textContent = t(...CITY_TEXT.pky[cityDay]);
  el('city-sg').textContent = t(...CITY_TEXT.sg[cityDay]);
  renderPeak('pky'); renderPeak('sg');
  $$('#day-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.day === cityDay));
  $$('#cities iframe').forEach(applyDay);
}
$$('#cities iframe').forEach(f => f.addEventListener('load', () => applyDay(f)));
el('day-switch').addEventListener('click', e => {
  const b = e.target.closest('button[data-day]');
  if (b) { cityTouched = true; cityDay = b.dataset.day; renderCities(); }
});
// the one orchestrated moment: on first view, the haze rolls in over both cities
function cityIntro() {
  if (cityAuto || REDUCE) return;
  cityAuto = true;
  setTimeout(() => { if (!cityTouched) { cityDay = 'haze'; renderCities(); } }, 5500);
}

/* ================================================================ intro */
function renderFindings() {
  const p19 = story[2019], p26 = story[2026];
  const cal = stats.calibration['count-100'];
  const pr19 = priorityPeople(p19), pr26 = priorityPeople(p26);
  const kShare = priorityPeople(p26, islandIds('Kalimantan')) / pr26;
  const sg = regional.singapore.daily;
  const d19 = dose(sg[2019], 15), d26 = dose(sg[2026], 15);
  const up = (a, b) => (b >= a ? t('rose', 'naik') : t('fell', 'turun'));
  el('findings').innerHTML = [
    t(`<b>2026 was worse.</b> Across Sumatra and Kalimantan, fire detections ${up(seasonTotal('all', 2019), seasonTotal('all', 2026))} ${fmt(Math.abs(change('all')))}%, from ${fmt(seasonTotal('all', 2019))} to ${fmt(seasonTotal('all', 2026))} (July–October). Kalimantan ${up(seasonTotal('Kalimantan', 2019), seasonTotal('Kalimantan', 2026))} ${fmt(Math.abs(change('Kalimantan')))}%; Sumatra ${up(seasonTotal('Sumatra', 2019), seasonTotal('Sumatra', 2026))} ${fmt(Math.abs(change('Sumatra')))}%.`,
      `<b>2026 lebih buruk.</b> Di Sumatera dan Kalimantan, deteksi api ${up(seasonTotal('all', 2019), seasonTotal('all', 2026))} ${fmt(Math.abs(change('all')))}%, dari ${fmt(seasonTotal('all', 2019))} menjadi ${fmt(seasonTotal('all', 2026))} (Juli–Oktober). Kalimantan ${up(seasonTotal('Kalimantan', 2019), seasonTotal('Kalimantan', 2026))} ${fmt(Math.abs(change('Kalimantan')))}%; Sumatera ${up(seasonTotal('Sumatra', 2019), seasonTotal('Sumatra', 2026))} ${fmt(Math.abs(change('Sumatra')))}%.`),
    t(`<b>More people in the smoke.</b> Measured against 2019, priority zones held ${millions(pr19)} people in 2019 and <strong>${millions(pr26)}</strong> in 2026, ${fmt(kShare * 100)}% of them in Kalimantan. Singapore's haze dose was ${fmt(d26 / d19, 1)}× that of 2019.`,
      `<b>Lebih banyak warga di dalam asap.</b> Dengan tolok ukur 2019, zona prioritas dihuni ${millions(pr19)} orang pada 2019 dan <strong>${millions(pr26)}</strong> pada 2026, ${fmt(kShare * 100)}% di Kalimantan. Dosis kabut asap Singapura ${fmt(d26 / d19, 1)}× lipat 2019.`),
    t(`<b>Fire nearby predicts smoke.</b> Fire within 100 km explains about ${fmt(cal.r2 * 100)}% of the differences in September 2019 PM₂.₅ between ${overview.zones.length} areas.`,
      `<b>Api di sekitar memprediksi asap.</b> Api dalam radius 100 km menjelaskan sekitar ${fmt(cal.r2 * 100)}% perbedaan PM₂.₅ September 2019 antar ${overview.zones.length} wilayah.`),
  ].map(s => `<li><span>${s}</span></li>`).join('');
}

/* ================================================================ process captions */
const STEPS = [
  { name: ['Peat', 'Gambut'],
    story: ['Peat is waterlogged soil built from plant matter, often metres deep. While it stays wet, it barely burns.', 'Gambut adalah tanah basah dari sisa tumbuhan, sering bermeter-meter dalamnya. Selama basah, gambut sulit terbakar.'],
    arc: ['Global Forest Watch peat extent → <code>Project</code> to WKID 102028 → <code>Pairwise Intersect</code> with districts → <code>Summary Statistics</code> by adm3_pcode. Riau 38,638 km², Central Kalimantan 28,110 km².', 'Sebaran gambut Global Forest Watch → <code>Project</code> ke WKID 102028 → <code>Pairwise Intersect</code> dengan kecamatan → <code>Summary Statistics</code> per adm3_pcode. Riau 38.638 km², Kalimantan Tengah 28.110 km².'] },
  { name: ['Drain & clear', 'Kanal & pembukaan'],
    story: ['Canals drain the peat and forests are cleared. The water table drops and the dry peat becomes fuel.', 'Kanal mengeringkan gambut dan hutan dibuka. Muka air turun dan gambut kering menjadi bahan bakar.'],
    arc: ['Hansen forest loss 2001–2019 inside MapBiomas 2000 forest, 30 m grid, nearest-neighbour resampling → <code>Zonal Statistics as Table</code> (SUM) of loss on peat per district.', 'Kehilangan hutan Hansen 2001–2019 di dalam hutan MapBiomas 2000, grid 30 m, resampling nearest → <code>Zonal Statistics as Table</code> (SUM) kehilangan hutan di gambut per kecamatan.'] },
  { name: ['Fire', 'Api'],
    story: ['Satellites spot the heat. Each glow is one VIIRS fire detection between July and October.', 'Satelit menangkap panasnya. Setiap titik adalah satu deteksi api VIIRS antara Juli dan Oktober.'],
    arc: ['NASA FIRMS VIIRS S-NPP (375 m). Keep points within a 100 km buffer so fires just across a border still count: <code>Pairwise Buffer</code> + <code>Select Layer By Location</code>; local counts with <code>Summarize Within</code>.', 'NASA FIRMS VIIRS S-NPP (375 m). Simpan titik dalam buffer 100 km agar api di seberang batas tetap dihitung: <code>Pairwise Buffer</code> + <code>Select Layer By Location</code>; jumlah lokal dengan <code>Summarize Within</code>.'] },
  { name: ['Fire density', 'Kepadatan api'],
    story: ['The dots become a surface: how much fire lies within reach of each place. Taller mesh, more fire nearby.', 'Titik-titik menjadi permukaan: seberapa banyak api dalam jangkauan setiap tempat. Jaring makin tinggi, api di sekitar makin banyak.'],
    arc: ['<code>Kernel Density</code> (Spatial Analyst): planar quartic kernel, cell size 2,000 m, search radius 25/50/100 km, population field NONE (count) or FRP, area units km². Then <code>Zonal Statistics as Table</code> MEAN by adm3_pcode.', '<code>Kernel Density</code> (Spatial Analyst): kernel kuartik planar, sel 2.000 m, radius 25/50/100 km, population field NONE (jumlah) atau FRP, satuan km². Lalu <code>Zonal Statistics as Table</code> MEAN per adm3_pcode.'] },
  { name: ['Smoke', 'Asap'],
    story: ['Smoke drifts with the wind. Satellite-based PM₂.₅ for September 2019 shows where it settled.', 'Asap terbawa angin. PM₂.₅ berbasis satelit untuk September 2019 menunjukkan di mana asap mengendap.'],
    arc: ['WashU ACAG V6.GL.03 monthly PM₂.₅ (~1 km). Population-weighted district mean = SUM(PM × pop) / SUM(pop), sampling PM at WorldPop cell centres. Calibrate with <code>Ordinary Least Squares</code>: PM₂.₅ ~ Ln(1 + KDE).', 'PM₂.₅ bulanan WashU ACAG V6.GL.03 (~1 km). Rerata berbobot penduduk = SUM(PM × penduduk) / SUM(penduduk), PM diambil di pusat sel WorldPop. Kalibrasi dengan <code>Ordinary Least Squares</code>: PM₂.₅ ~ Ln(1 + KDE).'] },
  { name: ['People', 'Penduduk'],
    story: ['Where people live decides who breathes it. Towns downwind matter as much as the fire itself.', 'Tempat tinggal penduduk menentukan siapa yang menghirupnya. Kota di arah angin sama pentingnya dengan apinya.'],
    arc: ['WorldPop 2020 counts stay on their native grid so totals are preserved. The index uses Ln(1 + people/km²): raw density is so skewed that city cells would dominate on their own.', 'Jumlah WorldPop 2020 tetap di grid aslinya agar total terjaga. Indeks memakai Ln(1 + jiwa/km²): kepadatan mentah sangat menceng sehingga sel kota akan mendominasi sendiri.'] },
  { name: ['Priority', 'Prioritas'],
    story: ['Where fire, smoke and people overlap most, the cells are flagged as priority zones for preparation.', 'Sel tempat api, asap, dan penduduk paling bertumpuk ditandai sebagai zona prioritas kesiapsiagaan.'],
    arc: ['<code>Raster Calculator</code>: 0.3·z(fire) + 0.3·z(Ln pop density) + 0.4·z(PM₂.₅), re-standardised; priority = index ≥ +1.5 SD → <code>Raster to Polygon</code> → <code>Zonal Statistics as Table</code> SUM of people.', '<code>Raster Calculator</code>: 0,3·z(api) + 0,3·z(Ln kepadatan) + 0,4·z(PM₂.₅), dibakukan ulang; prioritas = indeks ≥ +1,5 SD → <code>Raster to Polygon</code> → <code>Zonal Statistics as Table</code> SUM penduduk.'] },
];
function renderStepper(step) {
  el('iso-steps').innerHTML = STEPS.map((s, i) =>
    `<button type="button" data-step="${i}" aria-current="${i === step}" class="${i < step ? 'done' : ''}">${i + 1} ${t(...s.name)}</button>`).join('');
  const s = STEPS[step];
  el('iso-caption').innerHTML = `<h3>${step + 1}. ${t(...s.name)}</h3><p>${t(...s.story)}</p>`;
  el('iso-play').textContent = process?.playing ? t('Pause', 'Jeda') : t('Play', 'Putar');
}

/* ================================================================ seasons */
function renderSeasons() {
  const k19 = profile.Kalimantan[2019], k26 = profile.Kalimantan[2026];
  const s19 = profile.Sumatra[2019], s26 = profile.Sumatra[2026];
  const busy = (isl, y) => profile[isl][y].daily.filter(v => v >= 1000).length;
  el('season-insight').innerHTML = t(
    `Both islands together had <strong>${fmt(change('all'))}% more</strong> fire in 2026. Kalimantan ${change('Kalimantan') >= 0 ? 'rose' : 'fell'} ${fmt(Math.abs(change('Kalimantan')))}% while Sumatra ${change('Sumatra') >= 0 ? 'rose' : 'fell'} ${fmt(Math.abs(change('Sumatra')))}%. In Kalimantan, September 2026 was close to 2019 (${fmt(k26.months[2])} detections against ${fmt(k19.months[2])}), but October kept burning: <strong>${fmt(k26.months[3])}</strong> against ${fmt(k19.months[3])}. Kalimantan had <strong>${busy('Kalimantan', 2026)} days</strong> with 1,000+ detections, against ${busy('Kalimantan', 2019)} in 2019.`,
    `Kedua pulau bersama-sama punya <strong>${fmt(change('all'))}% lebih banyak</strong> api pada 2026. Kalimantan ${change('Kalimantan') >= 0 ? 'naik' : 'turun'} ${fmt(Math.abs(change('Kalimantan')))}% sementara Sumatera ${change('Sumatra') >= 0 ? 'naik' : 'turun'} ${fmt(Math.abs(change('Sumatra')))}%. Di Kalimantan, September 2026 mendekati 2019 (${fmt(k26.months[2])} deteksi dibanding ${fmt(k19.months[2])}), tetapi Oktober terus terbakar: <strong>${fmt(k26.months[3])}</strong> dibanding ${fmt(k19.months[3])}. Kalimantan mengalami <strong>${busy('Kalimantan', 2026)} hari</strong> dengan 1.000+ deteksi, dibanding ${busy('Kalimantan', 2019)} pada 2019.`);
  el('season-why').textContent = t(
    `Why: a strong El Niño and a positive Indian Ocean Dipole kept 2026 dry into October. In Kalimantan, night-time detections rose to ${fmt(k26.nightShare * 100)}% from ${fmt(k19.nightShare * 100)}%, and ${fmt(k26.cellsBurning5PlusDays)} two-kilometre squares burned on five or more days, ${fmt(k26.cellsBurning5PlusDays / k19.cellsBurning5PlusDays, 1)}× as many as 2019: signs of peat smouldering for days. Sumatra had ${fmt(s26.cellsBurning5PlusDays)} such squares, against ${fmt(s19.cellsBurning5PlusDays)}.`,
    `Penyebabnya: El Niño kuat dan Indian Ocean Dipole positif membuat 2026 tetap kering hingga Oktober. Di Kalimantan, deteksi malam naik menjadi ${fmt(k26.nightShare * 100)}% dari ${fmt(k19.nightShare * 100)}%, dan ${fmt(k26.cellsBurning5PlusDays)} kotak dua kilometer terbakar lima hari atau lebih, ${fmt(k26.cellsBurning5PlusDays / k19.cellsBurning5PlusDays, 1)}× lipat 2019: tanda gambut membara berhari-hari. Sumatera punya ${fmt(s26.cellsBurning5PlusDays)} kotak seperti itu, dibanding ${fmt(s19.cellsBurning5PlusDays)}.`);
  drawDaily();
  $$('#terrain-year button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.year) === terrainYear));
  showTerrain();
}
function showTerrain() {
  terrain.show(story[terrainYear], {
    names: Object.fromEntries(ISLANDS.map(i => [i, islandName(i)])), peak: t('Highest', 'Tertinggi'),
    totals: Object.fromEntries(ISLANDS.map(i => [i, `${fmt(seasonTotal(i, terrainYear))} ${t('detections', 'deteksi')}`])),
  });
}
let terrainTimer = 0;
function autoTerrain() {
  clearInterval(terrainTimer);
  if (REDUCE) return;
  terrainTimer = setInterval(() => {
    if (slides[current]?.id !== 'seasons') return;
    terrainYear = terrainYear === 2019 ? 2026 : 2019;
    $$('#terrain-year button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.year) === terrainYear));
    showTerrain();
  }, 4200);
}

/* ================================================================ peat */
function renderPeat() {
  const labels = t(['Peat', 'Non-peat', 'Forest lost 2001–19', 'Remaining forest'], ['Gambut', 'Non-gambut', 'Hutan hilang 2001–19', 'Hutan tersisa']);
  const risky = [true, false, true, false];
  const rates = Object.fromEntries(ISLANDS.map(i => [i, islandSeason(i, landYear).rates]));
  const max = Math.max(...ISLANDS.flatMap(i => [2019, 2026].flatMap(y => islandSeason(i, y).rates)));
  el('land').innerHTML = ISLANDS.map(i => `<div class="land-group"><h4><span>${islandName(i)}</span><span class="muted small">${t('per 100 km²', 'per 100 km²')}</span></h4>
      ${rates[i].map((v, j) => `<div class="land-row"><span>${labels[j]}</span><span class="track"><i style="width:${100 * v / max}%;background:${risky[j] ? 'var(--ember)' : 'var(--faint)'}"></i></span><strong>${fmt(v, 1)}</strong></div>`).join('')}</div>`).join('');
  const ratio = (i, a, b) => rates[i][a] / rates[i][b];
  const peatShare = y => { const all = ISLANDS.map(i => islandSeason(i, y)); return total(all.map(s => s.peat)) / total(all.map(s => s.total)); };
  const landShare = total(ISLANDS.map(i => islandSeason(i, landYear).peatArea)) / total(ISLANDS.map(i => islandSeason(i, landYear).area));
  el('peat-insight').innerHTML = t(
    `In ${landYear}, peat had <strong>${fmt(ratio('Sumatra', 0, 1), 1)}×</strong> (Sumatra) and <strong>${fmt(ratio('Kalimantan', 0, 1), 1)}×</strong> (Kalimantan) the fire density of other land. Peat covers ${fmt(landShare * 100)}% of the 13 provinces but held ${fmt(peatShare(landYear) * 100)}% of the fires. Forest cleared since 2001 burned at <strong>${fmt(ratio('Sumatra', 2, 3), 1)}×</strong> and <strong>${fmt(ratio('Kalimantan', 2, 3), 1)}×</strong> the rate of standing forest.`,
    `Pada ${landYear}, gambut memiliki kepadatan api <strong>${fmt(ratio('Sumatra', 0, 1), 1)}×</strong> (Sumatera) dan <strong>${fmt(ratio('Kalimantan', 0, 1), 1)}×</strong> (Kalimantan) dibanding lahan lain. Gambut menutupi ${fmt(landShare * 100)}% dari 13 provinsi, tetapi menampung ${fmt(peatShare(landYear) * 100)}% api. Hutan yang dibuka sejak 2001 terbakar <strong>${fmt(ratio('Sumatra', 2, 3), 1)}×</strong> dan <strong>${fmt(ratio('Kalimantan', 2, 3), 1)}×</strong> laju hutan yang masih berdiri.`);
  $$('#land-year button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.year) === landYear));
}

/* ================================================================ smoke / statistics */
let scatterData = null;
async function renderSmoke() {
  const cal = stats.calibration[modelKey];
  const v = tests[modelKey];
  const s19 = await scenarioFile(`2019-${modelKey}`);
  const dens = s19.indicators.map(r => r.density);
  const sorted = [...dens].sort((a, b) => a - b);
  const q = f => sorted[Math.round((sorted.length - 1) * f)];
  const effect = cal.slope * (Math.log1p(q(0.75)) - Math.log1p(q(0.25)));
  const [, r] = modelKey.split('-');
  el('smoke-insight').innerHTML = t(
    `Across both islands, areas with more fire within ${r} km had dirtier air in September 2019. A high-fire area (top quarter) averaged about <strong>${fmt(effect)} µg/m³</strong> more PM₂.₅ than a low-fire one (bottom quarter). The WHO 24-hour guideline is 15.`,
    `Di kedua pulau, wilayah dengan lebih banyak api dalam ${r} km punya udara lebih kotor pada September 2019. Wilayah api tinggi (kuartil atas) rata-rata sekitar <strong>${fmt(effect)} µg/m³</strong> PM₂.₅ lebih tinggi daripada wilayah api rendah (kuartil bawah). Pedoman WHO 24 jam adalah 15.`);
  // marginal effect of 0.1 more detections/km² at light, medium and heavy fire (best-fitting curve)
  const [mLow, , mHigh] = shape.marginal;
  const forms = Object.entries(shape.shape['100']).sort((p, q) => q[1].cvR2 - p[1].cvR2);
  const bent = forms[0][0] !== 'linear';
  el('smoke-insight').innerHTML += ' ' + (bent ? t(
    `The curve flattens as fire grows: 0.1 more detections per km² within 100 km adds about <strong>${fmt(mLow.perTenth)} µg/m³</strong> where fire is light, but about ${fmt(mHigh.perTenth)} where it is already heavy. Even a little fire nearby matters.`,
    `Kurvanya melandai saat api bertambah: tambahan 0,1 deteksi per km² dalam 100 km menambah sekitar <strong>${fmt(mLow.perTenth)} µg/m³</strong> di tempat apinya sedikit, tetapi sekitar ${fmt(mHigh.perTenth)} di tempat apinya sudah banyak. Sedikit api di sekitar pun berpengaruh.`) : t(
    `The relationship is close to a straight line: each extra 0.1 detections per km² within 100 km adds about <strong>${fmt(shape.shape['100'].linear.coef[1] / 10)} µg/m³</strong>, from the cleanest area to the smokiest.`,
    `Hubungannya mendekati garis lurus: setiap tambahan 0,1 deteksi per km² dalam 100 km menambah sekitar <strong>${fmt(shape.shape['100'].linear.coef[1] / 10)} µg/m³</strong>, dari wilayah terbersih sampai yang paling berasap.`));
  const w = cal.withinProvince;
  const pAll = Math.max(w.Sumatra.p, w.Kalimantan.p);
  el('smoke-tiles').innerHTML = [
    [`${fmt(cal.r2 * 100)}%`, t(`of the differences between ${overview.zones.length} areas explained by nearby fire`, `perbedaan antar ${overview.zones.length} wilayah dijelaskan oleh api di sekitar`)],
    [`${fmt(cal.spatialCV.r2 * 100)}%`, t('still explained when whole regencies are hidden from the model', 'tetap terjelaskan saat seluruh kabupaten disembunyikan dari model')],
    [`ρ ${fmt(w.Sumatra.rho, 2)} / ${fmt(w.Kalimantan.rho, 2)}`, t(`rank link inside Sumatra / Kalimantan, ${pLabel(pAll)}`, `hubungan peringkat di dalam Sumatera / Kalimantan, ${pLabel(pAll)}`)],
  ].map(([a, b]) => `<div><strong>${a}</strong><small>${b}</small></div>`).join('');
  el('smoke-caveat').textContent = t(
    `The link holds when whole regencies are left out of the model and inside each island. It is an association: wind and weather also move smoke, and the model leaves them out.`,
    `Hubungan ini bertahan saat seluruh kabupaten dikeluarkan dari model dan di dalam tiap pulau. Ini asosiasi: angin dan cuaca juga menggerakkan asap, dan model belum memasukkannya.`);
  scatterData = { x: dens.map(Math.log1p), y: overview.zones.map(z => z.pm25), cal, mode: modelKey.split('-')[0] };
  drawScatter();
}
let scatterPts = [];
function drawScatter() {
  if (!scatterData) return;
  const canvas = el('scatter');
  const { width, height } = resizeCanvas(canvas);
  if (!width) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const { x, y, cal, mode } = scatterData;
  const m = { l: 44, r: 12, t: 12, b: 40 };
  const xmax = Math.max(...x) * 1.04, ymax = Math.ceil(Math.max(...y) / 50) * 50;
  const X = v => m.l + (width - m.l - m.r) * v / xmax, Y = v => height - m.b - (height - m.t - m.b) * v / ymax;
  const ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line');
  ctx.font = '12px "Public Sans", sans-serif';
  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
  for (let v = 0; v <= ymax; v += 50) { ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(width - m.r, Y(v)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(v, m.l - 6, Y(v) + 4); }
  const ticks = mode === 'frp' ? [0, 1, 5, 20, 60] : [0, 0.25, 0.5, 1, 2, 4];
  ctx.textAlign = 'center';
  for (const v of ticks) { const px = X(Math.log1p(v)); if (px > width - m.r) continue; ctx.fillText(fmt(v, v < 1 && v > 0 ? 2 : 0), px, height - m.b + 16); }
  ctx.fillText(t(`Fire density within the kernel (${densityUnit(mode)}, log scale)`, `Kepadatan api dalam kernel (${densityUnit(mode)}, skala log)`), m.l + (width - m.l - m.r) / 2, height - 6);
  ctx.save(); ctx.translate(12, m.t + (height - m.t - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t('PM₂.₅ Sept 2019 (µg/m³)', 'PM₂.₅ Sept 2019 (µg/m³)'), 0, 0); ctx.restore();
  // WHO reference
  ctx.setLineDash([3, 4]); ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(m.l, Y(15)); ctx.lineTo(width - m.r, Y(15)); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.fillText(t('WHO 24-h guideline 15', 'Pedoman WHO 24 jam 15'), width - m.r - 150, Y(15) - 5);
  const surface = cssVar('--paper');
  scatterPts = [];
  overview.zones.forEach((z, i) => {
    const px = X(x[i]), py = Y(y[i]);
    scatterPts.push([px, py, i]);
    ctx.beginPath();
    if (z.island === 'Sumatra') ctx.rect(px - 3.5, py - 3.5, 7, 7); else ctx.arc(px, py, 4, 0, 7);
    ctx.fillStyle = islandColour(z.island); ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = surface; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(X(0), Y(cal.intercept)); ctx.lineTo(X(xmax), Y(cal.intercept + cal.slope * xmax)); ctx.stroke();
  // decile means (count, 100 km) show the curve's shape without assuming a model
  if (modelKey === 'count-100') {
    ctx.fillStyle = ink;
    for (const b of shape.bins) { const px = X(Math.log1p(b.density)), py = Y(b.pm); ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 5, py); ctx.closePath(); ctx.fill(); }
  }
}
el('scatter').addEventListener('pointermove', e => {
  const r = el('scatter').getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 144;
  for (const [px, py, i] of scatterPts) { const d = (px - mx) ** 2 + (py - my) ** 2; if (d < bd) { bd = d; best = [px, py, i]; } }
  const tip = el('scatter-tip');
  if (!best) { tip.hidden = true; return; }
  const z = overview.zones[best[2]];
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(z.name)}</b> · ${provinceName(z.province)}<br>PM₂.₅ ${fmt(z.pm25, 1)} µg/m³ · ${t('fire', 'api')} ${fmt(Math.expm1(scatterData.x[best[2]]), 2)}`;
  tip.style.left = `${Math.min(r.width - 200, best[0] + 30)}px`; tip.style.top = `${best[1] + 6}px`;
});
el('scatter').addEventListener('pointerleave', () => { el('scatter-tip').hidden = true; });

/* ================================================================ map explorer */
const layerTitles = {
  heat: ['Where is fire concentrated?', 'Di mana api terkonsentrasi?'],
  exposure: ['Where is smoke exposure higher?', 'Di mana paparan asap lebih tinggi?'],
  index: ['Where are the priority zones?', 'Di mana zona prioritas?'],
  cluster: ['Which areas look alike?', 'Wilayah mana yang mirip?'],
};
function renderRegionOptions() {
  const sel = el('region'), keep = sel.value || 'all';
  const opt = (v, label) => `<option value="${v}">${label}</option>`;
  sel.innerHTML = opt('all', t('Both islands', 'Kedua pulau'))
    + ISLANDS.map(i => `<optgroup label="${islandName(i)}">${opt(i, t(`All of ${islandName(i)}`, `Seluruh ${islandName(i)}`))}${islandIds(i).map(id => opt(id, provinceName(id) + (FOCUS.includes(id) ? ' ★' : ''))).join('')}</optgroup>`).join('');
  sel.value = keep;
}
function getFilters() {
  return { year: Number(document.querySelector('input[name="year"]:checked').value), region: el('region').value,
    layer: el('layer').value, mode: 'count', radius: 100 };  // the best-validated setting
}
function pctRank(rows) {
  const sorted = rows.map(({ exposure }, i) => [exposure, i]).sort(([a], [b]) => a - b);
  const out = new Array(rows.length);
  for (let i = 0; i < sorted.length;) {
    let last = i + 1;
    while (last < sorted.length && sorted[last][0] === sorted[i][0]) last += 1;
    for (let j = i; j < last; j += 1) out[sorted[j][1]] = 100 * (i + last - 1) / (2 * (rows.length - 1));
    i = last;
  }
  return out;
}
async function refresh() {
  const next = getFilters();
  const key = `${next.year}-${next.mode}-${next.radius}`;
  const version = ++requestId;
  try {
    const scenario = await scenarioFile(key);
    if (version !== requestId) return;
    state = { ...next, scenario, percentiles: pctRank(scenario.indicators) };
    const ids = currentIds();
    if (!ids.includes(selected)) {
      selected = ids.reduce((b, i) => (scenario.indicators[i].priorityPeople > scenario.indicators[b].priorityPeople ? i : b), ids[0]);
    }
    renderMapPanel();
    renderPriority();
    setStatus();
  } catch (error) {
    console.error(error);
    setStatus('Could not load this scenario. Choose the filter again or reload the page.', 'Skenario tidak bisa dimuat. Pilih ulang filter atau muat ulang halaman.', true);
  }
}
function legendRamp(palette, left, right, caption) {
  return `<div class="range"><span>${left}</span><span class="ramp" aria-hidden="true">${palette.map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${right}</span></div><span>${caption}</span>`;
}
function renderMapPanel() {
  const { layer, scenario, mode, radius, year } = state;
  let caption, legend;
  if (layer === 'heat') {
    caption = t(`Kernel density of fire detections (${radius} km radius). Both seasons share one colour scale.`, `Kepadatan kernel deteksi api (radius ${radius} km). Kedua musim memakai skala warna yang sama.`);
    legend = legendRamp(HEAT_COLORS, '0', `≥ ${fmt(tests[`${mode}-${radius}`].fireScaleMax, 2)}`, densityUnit(mode));
  } else if (layer === 'exposure') {
    caption = year === 2019
      ? t('Population-weighted September 2019 PM₂.₅ (WashU satellite estimate).', 'PM₂.₅ September 2019 berbobot penduduk (estimasi satelit WashU).')
      : t('2026 has no PM₂.₅ map yet: colours are percentile ranks from the 2019 model.', '2026 belum punya peta PM₂.₅: warna adalah peringkat persentil dari model 2019.');
    const breaks = year === 2019 ? ['<50', '50', '80', '110', '150', '≥200'] : ['P0', 'P17', 'P33', 'P50', 'P67', 'P83+'];
    legend = `<div class="range">${breaks.map((b, i) => `<span><i class="swatch" style="background:${EXPOSURE_COLORS[i]}"></i>${b}</span>`).join(' ')}</div><span>${year === 2019 ? 'µg/m³' : t('model percentile', 'persentil model')}</span>`;
  } else if (layer === 'index') {
    caption = t('Red outlines mark priority zones (index ≥ +1.5 SD). Both seasons use the 2019 yardstick, so they compare directly.', 'Garis merah menandai zona prioritas (indeks ≥ +1,5 SD). Kedua musim memakai tolok ukur 2019, jadi bisa dibandingkan langsung.');
    legend = legendRamp(INDEX_COLORS, '−1.5 SD', '+1.5 SD', t('0.5 SD per class', '0,5 SD per kelas'));
  } else {
    caption = t(`K-means groups all ${overview.zones.length} areas into ${scenario.clusters.k} profiles for ${year}.`, `K-means mengelompokkan ${overview.zones.length} wilayah menjadi ${scenario.clusters.k} profil untuk ${year}.`);
    legend = `<div class="range">${scenario.clusters.profiles.map(p => `<span><i class="swatch" style="background:${TYPE_COLORS[p.type]}"></i>${clusterLabel(p)[0]}</span>`).join(' ')}</div>`;
  }
  el('map-title').textContent = t(...layerTitles[layer]);
  el('map-caption').textContent = caption;
  el('legend').innerHTML = legend;
  const list = currentIds().sort((a, b) => overview.zones[a].name.localeCompare(overview.zones[b].name, 'id'));
  el('district').innerHTML = list.map(i => { const z = overview.zones[i]; return `<option value="${i}">${esc(z.name)} · ${z.level === 'kabupaten' ? provinceName(z.province) : esc(z.regency)}</option>`; }).join('');
  renderDistrict();
}
function renderDistrict() {
  const { scenario, year, mode, percentiles } = state;
  const d = overview.zones[selected], r = scenario.indicators[selected];
  const profile = scenario.clusters.profiles[r.cluster];
  el('district').value = selected;
  const metrics = [
    [t('Fire detections', 'Deteksi api'), fmt(d.counts[year === 2019 ? 0 : 1])],
    [t('People (2020)', 'Penduduk (2020)'), fmt(d.population)],
    [`${t('Fire density', 'Kepadatan api')}`, `${fmt(r.density, 2)}`],
    [year === 2019 ? 'PM₂.₅' : t('Smoke rank', 'Peringkat asap'), year === 2019 ? `${fmt(r.exposure, 0)} µg/m³` : `P${fmt(percentiles[selected])}`],
    [t('Peat share', 'Porsi gambut'), `${fmt(100 * d.peat / d.area, 0)}%`],
    [t('Forest lost on peat', 'Hutan hilang di gambut'), `${fmt(d.peatLoss, 1)} km²`],
  ];
  el('district-detail').innerHTML = `<h3 id="district-title">${esc(d.name)}</h3>
    <p class="district-meta">${d.level === 'kabupaten' ? t('Regency / city', 'Kabupaten/kota') : `${t('Sub-district', 'Kecamatan')} · ${esc(d.regency)}`} · ${provinceName(d.province)}</p>
    <dl class="district-metrics">${metrics.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <p class="district-note">${r.priorityPeople >= 1 ? t(`<strong>${fmt(r.priorityPeople)}</strong> people live in priority cells.`, `<strong>${fmt(r.priorityPeople)}</strong> orang tinggal di sel prioritas.`) : t('No priority cells in this area.', 'Tidak ada sel prioritas di wilayah ini.')}</p>
    <p class="district-note"><i class="swatch" style="background:${TYPE_COLORS[profile.type]}"></i>${clusterLabel(profile)[0]}</p>
    ${r.extrapolated ? `<p class="district-note small muted">${t('2026 fire level is outside the 2019 training range; read this estimate with care.', 'Tingkat api 2026 di luar rentang data latih 2019; baca perkiraan ini dengan hati-hati.')}</p>` : ''}`;
  map.update({ ...state, selected, language, provinceName, visible: provinceIds(state.region) });
}
function selectDistrict(i) { if (currentIds().includes(i)) { selected = i; renderDistrict(); } }

/* ================================================================ priority */
function renderPriority() {
  const { scenario, year, region } = state;
  // fixed story comparison (count, 100 km, both provinces)
  const people = y => priorityPeople(story[y]);
  const maxPeople = Math.max(people(2019), people(2026));
  const byIsland = (y, i) => priorityPeople(story[y], islandIds(i));
  el('versus').innerHTML = [2019, 2026].map(y => {
    const bar = ISLANDS.map(i => `<i style="width:${100 * byIsland(y, i) / maxPeople}%;background:${islandColour(i)}" title="${islandName(i)} ${fmt(byIsland(y, i))}"></i>`).join('');
    return `<div><span class="year">${y}</span><strong>${millions(people(y))}</strong><div class="bar">${bar}</div>
      <small>${ISLANDS.map(i => `<i class="swatch" style="background:${islandColour(i)}"></i>${islandName(i)} ${fmt(byIsland(y, i) / 1e6, 2)}M`).join(' &nbsp; ')}</small></div>`;
  }).join('');
  const ratio = people(2026) / people(2019);
  const topProv = y => allProvinces().map(id => [id, story[y].provinces[id].priorityPeople]).sort((a, b) => b[1] - a[1])[0];
  const [lead26, lead26n] = topProv(2026);
  el('priority-insight').innerHTML = ratio >= 1 ? t(
    `Measured against the 2019 season, <strong>${fmt(ratio, 1)}×</strong> as many people lived in priority zones in 2026: <strong>${millions(people(2026))}</strong> against ${millions(people(2019))}. The risk moved with the fire, and ${provinceName(lead26)} alone held ${millions(lead26n)}.`,
    `Diukur dengan musim 2019, <strong>${fmt(ratio, 1)}×</strong> lebih banyak orang tinggal di zona prioritas pada 2026: <strong>${millions(people(2026))}</strong> dibanding ${millions(people(2019))}. Risiko berpindah bersama api, dan ${provinceName(lead26)} sendiri dihuni ${millions(lead26n)}.`) : t(
    `Measured against the 2019 season, priority zones held <strong>${millions(people(2026))}</strong> people in 2026 against ${millions(people(2019))} in 2019. The risk moved with the fire, and ${provinceName(lead26)} alone held ${millions(lead26n)}.`,
    `Diukur dengan musim 2019, zona prioritas dihuni <strong>${millions(people(2026))}</strong> orang pada 2026 dibanding ${millions(people(2019))} pada 2019. Risiko berpindah bersama api, dan ${provinceName(lead26)} sendiri dihuni ${millions(lead26n)}.`);
  // ranking follows the map filters
  const districts = el('ranking-grain').value === 'district';
  const groups = new Map();
  for (const i of currentIds()) {
    const z = overview.zones[i];
    const id = districts ? z.id : z.regencyId;
    const g = groups.get(id) ?? { name: districts ? z.name : z.regency, province: z.province, people: 0, priority: 0, index: i };
    g.people += z.population; g.priority += scenario.indicators[i].priorityPeople; groups.set(id, g);
  }
  el('ranking-area').textContent = districts ? t('Area', 'Wilayah') : t('Regency / city', 'Kabupaten/kota');
  const rows = [...groups.values()].filter(g => g.priority >= 1).sort((a, b) => b.priority - a.priority).slice(0, 7);
  el('priority-caption').textContent = `${year} · ${scopeName(region)} · ${t('follows the map filters', 'mengikuti filter peta')}`;
  el('ranking').querySelector('tbody').innerHTML = rows.length ? rows.map(row => {
    const name = districts ? `<button type="button" class="row-link" data-district="${row.index}">${esc(row.name)}</button>` : esc(row.name);
    return `<tr><td>${name} <span class="small muted">${provinceName(row.province)}</span></td><td>${fmt(row.priority)}</td><td>${fmt(100 * row.priority / row.people, 0)}%</td></tr>`;
  }).join('') : `<tr><td colspan="3" class="muted">${t('No priority zones for this selection.', 'Tidak ada zona prioritas untuk pilihan ini.')}</td></tr>`;
  // clusters
  const ids = currentIds();
  el('cluster-caption').textContent = t(`${scenario.clusters.k} groups from fire density, forest loss on peat, smoke and Ln population density (${year}).`,
    `${scenario.clusters.k} kelompok dari kepadatan api, kehilangan hutan di gambut, asap, dan Ln kepadatan penduduk (${year}).`);
  el('clusters').innerHTML = scenario.clusters.profiles.flatMap(p => {
    const members = ids.filter(i => scenario.indicators[i].cluster === p.id);
    if (!members.length) return [];
    const [label, action] = clusterLabel(p);
    return `<div class="cluster-row"><span class="swatch" style="background:${TYPE_COLORS[p.type]}"></span><div><h4>${label}</h4>
      <p>${members.length} ${areaWord(members.length)} · ${fmt(total(members.map(i => overview.zones[i].population)) / 1e6, 2)}M ${t('people', 'jiwa')}. ${action}</p></div></div>`;
  }).join('');
}

/* ================================================================ limits */
function renderLimits() {
  el('limit-2026').textContent = t(
    `No 2026 satellite PM₂.₅ map exists yet. 2026 values come from the 2019 model, and ${stats.extrapolation['count-100']} of ${overview.zones.length} areas fall outside its training range. The 2×2 uses CAMS daily model values instead.`,
    `Belum ada peta PM₂.₅ satelit 2026. Nilai 2026 berasal dari model 2019, dan ${stats.extrapolation['count-100']} dari ${overview.zones.length} wilayah berada di luar rentang data latihnya. Matriks 2×2 memakai nilai harian model CAMS.`);
}

/* ================================================================ daily fire chart */
const dayDate = (year, d) => new Date(Date.UTC(year, 6, 1) + d * 864e5);
const dayLabel = (year, d) => dayDate(year, d).toLocaleDateString(t('en-US', 'id-ID'), { month: 'short', day: 'numeric', timeZone: 'UTC' });
function drawDaily() {
  const canvas = el('daily');
  const { width, height } = resizeCanvas(canvas);
  if (!width || !profile) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line');
  const colors = { 2019: cssVar('--y2019'), 2026: cssVar('--y2026') };
  const panels = [['Kalimantan', 0.6], ['Sumatra', 0.4]];
  let top = 0;
  ctx.font = '12px "Public Sans", sans-serif';
  for (const [id, share] of panels) {
    const h = height * share, m = { l: 40, r: 8, t: 18, b: id === 'Sumatra' ? 20 : 8 };
    const max = Math.max(...[2019, 2026].flatMap(y => profile[id][y].daily));
    const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000].find(v => v >= max) ?? max;
    const X = d => m.l + (width - m.l - m.r) * d / 122, Y = v => top + h - m.b - (h - m.t - m.b) * v / nice;
    ctx.fillStyle = ink; ctx.font = '700 12.5px "Public Sans", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(islandName(id), m.l, top + 12);
    ctx.font = '12px "Public Sans", sans-serif';
    ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.textAlign = 'right';
    for (const v of [0, nice / 2, nice]) { ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(width - m.r, Y(v)); ctx.stroke(); ctx.fillText(fmt(v), m.l - 5, Y(v) + 4); }
    for (const year of [2019, 2026]) {
      ctx.beginPath(); ctx.strokeStyle = colors[year]; ctx.lineWidth = 2;
      profile[id][year].daily.forEach((v, d) => (d ? ctx.lineTo(X(d), Y(v)) : ctx.moveTo(X(d), Y(v))));
      ctx.stroke();
    }
    if (id === 'Sumatra') {
      ctx.textAlign = 'center'; ctx.fillStyle = muted;
      [0, 31, 62, 92].forEach((d, i) => ctx.fillText(t(['Jul', 'Aug', 'Sep', 'Oct'], ['Jul', 'Agu', 'Sep', 'Okt'])[i], X(d + 15), height - 4));
    }
    // annotate the 2026 Kalimantan October tail
    if (id === 'Kalimantan') {
      const d = profile.Kalimantan[2026].daily.indexOf(Math.max(...profile.Kalimantan[2026].daily));
      ctx.fillStyle = ink; ctx.textAlign = 'right';
      ctx.fillText(t(`2026 peak ${dayLabel(2026, d)}`, `Puncak 2026 ${dayLabel(2026, d)}`), X(d) - 6, Y(profile.Kalimantan[2026].daily[d]) + 4);
    }
    top += h;
  }
}

/* ================================================================ borders */
const PM_BREAKS = [15, 35, 55, 100, 150, 250];
const PM_COLORS = ['#efedf5', '#d9d4e8', '#bfb6d9', '#a194c6', '#8473b0', '#665494', '#463870'];
let regionKey = 'w19', regionCache = {}, sgPts = [];
const decodeBytes = b64 => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) a[i] = s.charCodeAt(i); return a; };
function regionTile(key) {
  if (regionCache[key]) return regionCache[key];
  const g = key === 'w19' ? regional.washu2019 : regional.cams2026;
  const bytes = decodeBytes(key === 'w19' ? g.pm : key === 'c26s' ? g.sep : g.oct);
  const tile = document.createElement('canvas');
  tile.width = g.w; tile.height = g.h;
  const c = tile.getContext('2d'), img = c.createImageData(g.w, g.h);
  const rgb = PM_COLORS.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  bytes.forEach((v, i) => {
    if (!v) return;
    const col = rgb[PM_BREAKS.filter(b => v >= b).length];
    img.data.set([...col, 255], 4 * i);
  });
  c.putImageData(img, 0, 0);
  regionCache[key] = { tile, g };
  return regionCache[key];
}
let outlines = null;
function regionOutlines() {
  if (outlines) return outlines;
  const toLL = rings => rings.map(r => r.map(([x, y]) => lonLat(x, y)));
  outlines = [...geography.base.flatMap(poly => toLL(poly)), ...basemapData.provinces.flatMap(p => toLL(p.rings))];
  return outlines;
}
function drawRegion() {
  const canvas = el('region-map');
  const { width, height } = resizeCanvas(canvas);
  if (!width || !regional) return;
  const ctx = canvas.getContext('2d');
  const [lon0, lon1, lat0, lat1] = regional.box;
  const X = lon => width * (lon - lon0) / (lon1 - lon0), Y = lat => height * (lat1 - lat) / (lat1 - lat0);
  ctx.fillStyle = cssVar('--map-sea'); ctx.fillRect(0, 0, width, height);
  const { tile, g } = regionTile(regionKey);
  ctx.imageSmoothingEnabled = regionKey === 'w19';
  // WashU cell centres start at the box edge; CAMS 0.5° points are centres of cells
  const half = regionKey === 'w19' ? 0 : g.step / 2;
  ctx.drawImage(tile, X(lon0 - half), Y(lat1 + half), X(lon0 - half + g.w * g.step) - X(lon0 - half), Y(lat1 + half - g.h * g.step) - Y(lat1 + half));
  ctx.strokeStyle = cssVar('--ink'); ctx.globalAlpha = 0.55; ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const ring of regionOutlines()) { ring.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la)))); ctx.closePath(); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = '600 12px "Public Sans", sans-serif';
  const field = regionKey === 'w19' ? 'washuSep2019' : regionKey === 'c26s' ? 'camsSep2026' : 'camsOct2026';
  for (const [name, c] of Object.entries(regional.cities)) {
    if (!['Singapore', 'Kuala Lumpur', 'Pekanbaru', 'Palangka Raya', 'Pontianak', 'Jambi', 'Kuching'].includes(name)) continue;
    const x = X(c.lon), y = Y(c.lat);
    ctx.fillStyle = cssVar('--ink'); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    const label = `${name} ${c[field] == null ? '' : fmt(c[field])}`;
    ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--bg'); ctx.textAlign = name === 'Kuala Lumpur' || name === 'Pekanbaru' || name === 'Jambi' ? 'right' : 'left';
    const dx = ctx.textAlign === 'right' ? -6 : 6;
    ctx.strokeText(label, x + dx, y - 5); ctx.fillText(label, x + dx, y - 5);
  }
  el('region-legend').innerHTML = `<span class="small muted">PM₂.₅ µg/m³</span>${PM_COLORS.map((c, i) => `<span class="small"><i class="swatch" style="background:${c}"></i>${i === 0 ? `<${PM_BREAKS[0]}` : i === PM_COLORS.length - 1 ? `≥${PM_BREAKS.at(-1)}` : `${PM_BREAKS[i - 1]}–${PM_BREAKS[i]}`}</span>`).join('')}`;
  el('region-source').textContent = regionKey === 'w19'
    ? t('Source: WashU ACAG V6.GL.03 satellite-derived PM₂.₅, September 2019 mean.', 'Sumber: PM₂.₅ turunan satelit WashU ACAG V6.GL.03, rerata September 2019.')
    : t('Source: CAMS global atmospheric-composition model (Copernicus) via Open-Meteo, 2026 monthly mean. 2026 has no satellite PM₂.₅ map yet, so this map uses a different source from 2019.',
      'Sumber: model komposisi atmosfer global CAMS (Copernicus) lewat Open-Meteo, rerata bulanan 2026. Belum ada peta PM₂.₅ satelit untuk 2026, jadi peta ini memakai sumber yang berbeda dari 2019.');
  $$('#region-pick button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === regionKey));
}
const runs = (a, th) => { let best = 0, cur = 0, days = 0; for (const v of a) { if (v != null && v >= th) { cur += 1; days += 1; best = Math.max(best, cur); } else cur = 0; } return { days, longest: best }; };
const dose = (a, th) => a.reduce((s, v) => s + (v != null && v > th ? v - th : 0), 0);
function renderBorders() {
  const sg = regional.singapore.daily;
  const r19 = runs(sg[2019], 37.5), r26 = runs(sg[2026], 37.5);
  const d19 = dose(sg[2019], 15), d26 = dose(sg[2026], 15);
  const pk = y => { const v = Math.max(...sg[y].filter(x => x != null)); return [v, sg[y].indexOf(v)]; };
  const [p19] = pk(2019), [p26, i26] = pk(2026);
  el('border-insight').innerHTML = t(
    `Singapore has no peat fires of its own and lies about 1,000 km from Central Kalimantan. In 2026 its official monitors recorded <strong>${r26.days}</strong> days above 37.5 µg/m³, against ${r19.days} in 2019, with one episode lasting <strong>${r26.longest} days</strong>; in October its environment agency traced the smoke to Kalimantan. The peak was ${fmt(p26 / p19, 1)}× higher and the total dose <strong>${fmt(d26 / d19, 1)}×</strong> larger, because the haze lasted longer.`,
    `Singapura tidak punya kebakaran gambut sendiri dan berjarak sekitar 1.000 km dari Kalimantan Tengah. Pada 2026 alat pemantau resminya mencatat <strong>${r26.days}</strong> hari di atas 37,5 µg/m³, dibanding ${r19.days} pada 2019, dengan satu episode selama <strong>${r26.longest} hari</strong>; pada Oktober badan lingkungannya menelusuri asap itu ke Kalimantan. Puncaknya ${fmt(p26 / p19, 1)}× lebih tinggi dan dosis totalnya <strong>${fmt(d26 / d19, 1)}×</strong> lebih besar, karena kabut asap bertahan lebih lama.`);
  el('sg-numbers').innerHTML = [
    [`${r19.days} → ${r26.days}`, t('days above 37.5 µg/m³', 'hari di atas 37,5 µg/m³')],
    [`${r19.longest} → ${r26.longest}`, t('days in the longest episode', 'hari pada episode terpanjang')],
    [`${fmt(d26 / d19, 1)}×`, t('dose above the WHO guideline (level × days), 2026 vs 2019', 'dosis di atas pedoman WHO (kadar × hari), 2026 vs 2019')],
  ].map(([a, b]) => `<div><strong>${a}</strong><small>${b}</small></div>`).join('');
  void i26;
  drawSingapore();
  drawRegion();
}
function drawSingapore() {
  const canvas = el('sg-chart');
  const { width, height } = resizeCanvas(canvas);
  if (!width || !regional) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const sg = regional.singapore.daily;
  const m = { l: 36, r: 8, t: 8, b: 20 };
  const max = 150;
  const X = d => m.l + (width - m.l - m.r) * d / 122, Y = v => height - m.b - (height - m.t - m.b) * Math.min(v, max) / max;
  ctx.font = '12px "Public Sans", sans-serif';
  ctx.strokeStyle = cssVar('--line'); ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'right';
  for (const v of [0, 50, 100, 150]) { ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(width - m.r, Y(v)); ctx.stroke(); ctx.fillText(v, m.l - 5, Y(v) + 4); }
  ctx.setLineDash([3, 4]); ctx.strokeStyle = cssVar('--muted');
  for (const v of [15, 37.5]) { ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(width - m.r, Y(v)); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  [0, 31, 62, 92].forEach((d, i) => ctx.fillText(t(['Jul', 'Aug', 'Sep', 'Oct'], ['Jul', 'Agu', 'Sep', 'Okt'])[i], X(d + 15), height - 4));
  sgPts = [];
  for (const year of [2019, 2026]) {
    ctx.beginPath(); ctx.strokeStyle = cssVar(year === 2019 ? '--y2019' : '--y2026'); ctx.lineWidth = 2;
    let pen = false;
    sg[year].forEach((v, d) => { if (v == null) { pen = false; return; } if (pen) ctx.lineTo(X(d), Y(v)); else { ctx.moveTo(X(d), Y(v)); pen = true; } });
    ctx.stroke();
  }
  for (let d = 0; d < 123; d += 1) sgPts.push([X(d), d]);
}
el('sg-chart').addEventListener('pointermove', e => {
  if (!regional) return;
  const r = el('sg-chart').getBoundingClientRect();
  const mx = e.clientX - r.left;
  const hit = sgPts.reduce((b, p) => (Math.abs(p[0] - mx) < Math.abs(b[0] - mx) ? p : b), sgPts[0] ?? [0, 0]);
  const d = hit[1], sg = regional.singapore.daily, tip = el('sg-tip');
  tip.hidden = false;
  tip.innerHTML = `${dayLabel(2019, d)}<br>2019: ${fmt(sg[2019][d], 0)} · 2026: ${fmt(sg[2026][d], 0)} µg/m³`;
  tip.style.left = `${Math.min(r.width - 150, hit[0] + 10)}px`; tip.style.top = '10px';
});
el('sg-chart').addEventListener('pointerleave', () => { el('sg-tip').hidden = true; });
el('region-pick').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) { regionKey = b.dataset.k; drawRegion(); } });

/* ================================================================ exposure matrix (2×2) */
const DAY_CUT = 30;
let quadPts = [];
const spearman = (a, b) => {
  const rank = v => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rank(a), rb = rank(b), m = (a.length - 1) / 2;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i += 1) { s += (ra[i] - m) * (rb[i] - m); sa += (ra[i] - m) ** 2; sb += (rb[i] - m) ** 2; }
  return s / Math.sqrt(sa * sb);
};
// BCG-style 2×2: each quadrant has one colour, used for the bubbles, the tints, the cards and the map.
const QUADS = ['ll', 'hl', 'hs', 'ls'];
const QUAD_NAME = {
  ll: ['Protect people', 'Lindungi warga'], hl: ['Prevent fires, protect people', 'Cegah api, lindungi warga'],
  hs: ['Prevent for those downwind', 'Cegah demi warga di arah angin'], ls: ['Monitor', 'Pantau'],
};
const QUAD_WHAT = {
  ll: ['Little fire nearby, yet 30+ unhealthy days: the smoke comes from elsewhere. Early warnings, masks and clean-air rooms.', 'Sedikit api di sekitar, tetapi 30+ hari tidak sehat: asap datang dari tempat lain. Peringatan dini, masker, dan ruang udara bersih.'],
  hl: ['Next to the fire and 30+ unhealthy days. Stop peat fires at the source and protect the people living beside them.', 'Dekat api dan 30+ hari tidak sehat. Hentikan kebakaran gambut di sumbernya dan lindungi warga di sekitarnya.'],
  hs: ['Much fire, but the smoke moved on. Prevention here protects the neighbours downwind.', 'Banyak api, tetapi asapnya berpindah. Pencegahan di sini melindungi tetangga di arah angin.'],
  ls: ['Little fire and short exposure. Routine monitoring.', 'Sedikit api dan paparan singkat. Pemantauan rutin.'],
};
const quadColour = k => cssVar(`--q-${k}`);
let quadView = 'matrix', quadShapes = null;
function matrixData() {
  const fire = story[2026].indicators.map(r => r.density);
  const ex = exposure.districts;
  const fireCut = [...fire].sort((a, b) => a - b)[Math.floor(fire.length / 2)];
  const quad = { hl: [], ll: [], hs: [], ls: [] };
  const of = new Array(fire.length);
  overview.zones.forEach((z, i) => { const k = (fire[i] >= fireCut ? 'h' : 'l') + (ex[i].unhealthy >= DAY_CUT ? 'l' : 's'); quad[k].push(i); of[i] = k; });
  const sum = ids => ({ n: ids.length, people: total(ids.map(i => overview.zones[i].population)), personDays: total(ids.map(i => overview.zones[i].population * ex[i].unhealthy)),
    island: Object.fromEntries(ISLANDS.map(isl => { const s = ids.filter(i => overview.zones[i].island === isl); return [isl, { n: s.length, people: total(s.map(i => overview.zones[i].population)) }]; })) });
  return { fire, ex, fireCut, quad, of, stats: Object.fromEntries(Object.entries(quad).map(([k, v]) => [k, sum(v)])) };
}
function renderMatrix() {
  const { fire, ex, stats: q } = matrixData();
  const pop = overview.zones.map(z => z.population);
  const allPeople = total(pop);
  const longPeople = q.hl.people + q.ll.people;
  const personDays = total(overview.zones.map((z, i) => z.population * ex[i].unhealthy));
  const lead = k => ISLANDS.reduce((a, b) => (q[k].island[a].people >= q[k].island[b].people ? a : b));
  el('matrix-insight').innerHTML = t(
    `In 2026, <strong>${millions(longPeople)}</strong> people (${fmt(100 * longPeople / allPeople)}%) on the two islands lived through ${DAY_CUT} or more days of unhealthy air, about <strong>${fmt(personDays / 1e6)} million person-days</strong> in all. They split into two groups that need different help: smoke from elsewhere (mostly ${islandName(lead('ll'))}) and smoke from fires next door (mostly ${islandName(lead('hl'))}).`,
    `Pada 2026, <strong>${millions(longPeople)}</strong> orang (${fmt(100 * longPeople / allPeople)}%) di kedua pulau mengalami ${DAY_CUT} hari atau lebih udara tidak sehat, sekitar <strong>${fmt(personDays / 1e6)} juta orang-hari</strong>. Mereka terbagi dalam dua kelompok yang butuh bantuan berbeda: asap dari tempat lain (terutama ${islandName(lead('ll'))}) dan asap dari api di dekatnya (terutama ${islandName(lead('hl'))}).`);
  el('quad-key').innerHTML = QUADS.map(k => {
    const s = q[k], split = ISLANDS.map(isl => `${islandName(isl)} ${s.island[isl].n}`).join(' · ');
    return `<div class="${k === 'ls' || k === 'hs' ? 'minor' : ''}"><b><i class="dot" style="background:${quadColour(k)}"></i>${t(...QUAD_NAME[k])}</b>`
      + `<span class="num">${s.n} ${areaWord(s.n)} · ${millions(s.people)} ${t('people', 'jiwa')}</span><small>${split}</small><small>${t(...QUAD_WHAT[k])}</small></div>`;
  }).join('');
  const rFirePm = spearman(fire, ex.map(r => r.mean)), rPopFire = spearman(pop, fire);
  el('matrix-corr').textContent = t(
    `Across all ${overview.zones.length} areas, fire nearby and mean PM₂.₅ rise together (rank correlation ${fmt(rFirePm, 2)}). More populous areas had ${rPopFire < 0 ? 'slightly less' : 'slightly more'} fire nearby (${fmt(rPopFire, 2)}).`,
    `Di ${overview.zones.length} wilayah, api di sekitar dan rerata PM₂.₅ naik bersama (korelasi peringkat ${fmt(rFirePm, 2)}). Wilayah yang lebih padat penduduk ${rPopFire < 0 ? 'sedikit lebih jauh dari' : 'sedikit lebih dekat ke'} api (${fmt(rPopFire, 2)}).`);
  const sg = regional.singapore.daily[2026], cams = regional.cities.Singapore.camsDaily2026;
  const pairs = sg.map((v, i) => [v, cams[i]]).filter(([a, b]) => a != null && b != null);
  const pr = (() => { const ma = total(pairs.map(p => p[0])) / pairs.length, mb = total(pairs.map(p => p[1])) / pairs.length; let s = 0, sa = 0, sb = 0; for (const [a, b] of pairs) { s += (a - ma) * (b - mb); sa += (a - ma) ** 2; sb += (b - mb) ** 2; } return s / Math.sqrt(sa * sb); })();
  const obs = pairs.filter(p => p[0] >= 55.5).length, mod = pairs.filter(p => p[1] >= 55.5).length;
  el('matrix-note').textContent = t(
    `The CAMS model tracked Singapore's official monitors closely (r = ${fmt(pr, 2)}) but read lower (${mod} unhealthy days vs ${obs}), so day counts here are conservative. No clinic records were available; person-days (people × days) stand in for the health burden.`,
    `Model CAMS mengikuti alat pemantau resmi Singapura dengan erat (r = ${fmt(pr, 2)}) tetapi lebih rendah (${mod} hari tidak sehat vs ${obs}), jadi jumlah hari di sini konservatif. Tidak ada data puskesmas; orang-hari (penduduk × hari) dipakai untuk menggambarkan beban kesehatan.`);
  drawQuad();
}
function drawQuad() {
  const canvas = el('quad');
  const { width, height } = resizeCanvas(canvas);
  if (!width || !exposure) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  $$('#quad-view button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === quadView));
  el('quad-sub').textContent = quadView === 'matrix'
    ? t('One circle per area. Size = population; colour = quadrant. Lines split at the median fire level and 30 unhealthy days.', 'Satu lingkaran = satu wilayah. Ukuran = penduduk; warna = kuadran. Garis membagi di median api dan 30 hari tidak sehat.')
    : t('Each area in its quadrant colour. Riau and Central Kalimantan by kecamatan; the other provinces by kabupaten.', 'Setiap wilayah diwarnai menurut kuadrannya. Riau dan Kalimantan Tengah per kecamatan; provinsi lain per kabupaten.');
  el('quad-legend').innerHTML = QUADS.map(k => `<span class="small"><i class="legend-dot" style="background:${quadColour(k)}"></i>${t(...QUAD_NAME[k])}</span>`).join('')
    + (quadView === 'matrix' ? `<span class="small muted">${t('Circle size = population', 'Ukuran lingkaran = penduduk')}</span>` : '');
  if (quadView === 'map') { drawQuadMap(ctx, width, height); return; }
  const { fire, ex, fireCut, of, stats: q } = matrixData();
  const m = { l: 44, r: 10, t: 8, b: 40 };
  const lx = d => Math.log10(d + 0.01), x0 = lx(Math.min(...fire)), x1 = lx(Math.max(...fire) * 1.15);
  const X = d => m.l + (width - m.l - m.r) * (lx(d) - x0) / (x1 - x0);
  const Y = v => height - m.b - (height - m.t - m.b) * v / 105;   // headroom above the maximum for the quadrant names
  const ink = cssVar('--ink'), muted = cssVar('--muted'), faint = cssVar('--faint'), line = cssVar('--line'), surface = cssVar('--bg');
  const xc = X(fireCut), yc = Y(DAY_CUT), L = m.l, R = width - m.r, T = m.t, B = height - m.b;
  // quadrant tints in their own colour; the two long-exposure quadrants a little stronger
  const tint = (k, x, y, w, h, pct) => { ctx.fillStyle = `color-mix(in srgb, ${quadColour(k)} ${pct}%, transparent)`; ctx.fillRect(x, y, w, h); };
  tint('ll', L, T, xc - L, yc - T, 11); tint('hl', xc, T, R - xc, yc - T, 11);
  tint('ls', L, yc, xc - L, B - yc, 6); tint('hs', xc, yc, R - xc, B - yc, 6);
  ctx.font = '12px "Public Sans", sans-serif';
  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (const v of [0, 30, 60, 90]) { if (v !== DAY_CUT) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke(); } ctx.fillText(v, L - 6, Y(v) + 4); }
  ctx.textAlign = 'center';
  for (const v of [0.01, 0.03, 0.1, 0.3, 1, 3]) { if (X(v) <= R && X(v) >= L) ctx.fillText(fmt(v, v < 0.1 ? 2 : v < 1 ? 1 : 0), X(v), B + 15); }
  ctx.fillStyle = ink; ctx.font = '600 12px "Public Sans", sans-serif';
  ctx.fillText(width < 520 ? t('Fire nearby → (per km², log)', 'Api di sekitar → (per km², log)') : t('Fire nearby →  (detections per km², 100 km kernel, log scale)', 'Api di sekitar →  (deteksi per km², kernel 100 km, skala log)'), L + (R - L) / 2, height - 4);
  ctx.save(); ctx.translate(12, T + (B - T) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t('Days of unhealthy air, Jul–Oct →', 'Hari udara tidak sehat, Jul–Okt →'), 0, 0); ctx.restore();
  // bubbles: largest first so small areas stay visible
  const maxPop = Math.max(...overview.zones.map(z => z.population));
  const order = overview.zones.map((z, i) => i).sort((a, b) => overview.zones[b].population - overview.zones[a].population);
  quadPts = [];
  for (const i of order) {
    const z = overview.zones[i], c = quadColour(of[i]);
    const px = X(fire[i]), py = Y(ex[i].unhealthy), r = 2.5 + 16 * Math.sqrt(z.population / maxPop);
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7);
    ctx.fillStyle = c; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = surface; ctx.lineWidth = 0.8; ctx.stroke();
    quadPts.push([px, py, r, i]);
  }
  // quadrant cross: solid, labelled where it cuts
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(xc, T); ctx.lineTo(xc, B); ctx.moveTo(L, yc); ctx.lineTo(R, yc); ctx.stroke();
  const halo = (s, x, y, align, font, colour) => { ctx.font = font; ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = surface; ctx.strokeText(s, x, y); ctx.fillStyle = colour; ctx.fillText(s, x, y); };
  halo(t(`${DAY_CUT} days`, `${DAY_CUT} hari`), R - 4, yc - 5, 'right', '600 11.5px "Public Sans", sans-serif', ink);
  halo(`median ${fmt(fireCut, 2)}`, xc + 5, B - 6, 'left', '600 11.5px "Public Sans", sans-serif', ink);
  // quadrant names in their colour, BCG style: response in bold, group size underneath
  // narrow screens: short names only (the cards beside the chart carry the counts)
  const narrow = width < 520;
  const SHORT = { ll: ['Protect', 'Lindungi'], hl: ['Prevent + protect', 'Cegah + lindungi'], hs: ['Downwind', 'Arah angin'], ls: ['Monitor', 'Pantau'] };
  const corner = (k, x, y, align, strong) => {
    halo(t(...(narrow ? SHORT : QUAD_NAME)[k]), x, y, align, `${strong ? 800 : 700} ${narrow ? 12 : strong ? 14 : 12.5}px "Public Sans", sans-serif`, `color-mix(in srgb, ${quadColour(k)} 72%, #000)`);
    if (!narrow) halo(`${q[k].n} ${areaWord(q[k].n)} · ${millions(q[k].people)}`, x, y + 15, align, '500 12px "Public Sans", sans-serif', strong ? ink : faint);
  };
  corner('ll', L + 8, T + 16, 'left', true); corner('hl', R - 8, T + 16, 'right', true);
  corner('ls', L + 8, B - 26, 'left', false); corner('hs', R - 8, B - 26, 'right', false);
}
// map view: every area filled with its quadrant colour, in ESRI:102028 (equal area) with north up
function drawQuadMap(ctx, width, height) {
  const { of } = matrixData();
  if (!quadShapes) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const boxes = geography.shapes.map(shape => {
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const poly of shape) for (const [x, y] of poly[0]) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
      x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, c); y1 = Math.max(y1, d);
      return [a, b, c, d];
    });
    quadShapes = { boxes, bounds: [x0, x1, y0, y1] };
  }
  const [x0, x1, y0, y1] = quadShapes.bounds, pad = 10;
  const s = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
  const ox = (width - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2;
  const P = ([x, y]) => [ox + (x - x0) * s, oy + (y1 - y) * s];
  quadShapes.P = P; quadShapes.s = s; quadShapes.ox = ox; quadShapes.oy = oy;
  ctx.fillStyle = cssVar('--map-sea'); ctx.fillRect(0, 0, width, height);
  // neighbouring land (Natural Earth) for context
  ctx.beginPath();
  for (const poly of geography.base) for (const ring of poly) ring.forEach((p, k) => { const [a, b] = P(p); if (k) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
  ctx.fillStyle = cssVar('--map-land'); ctx.fill('evenodd');
  const trace = shape => { ctx.beginPath(); for (const poly of shape) for (const ring of poly) { ring.forEach((p, k) => { const [a, b] = P(p); if (k) ctx.lineTo(a, b); else ctx.moveTo(a, b); }); ctx.closePath(); } };
  geography.shapes.forEach((shape, i) => {
    trace(shape); ctx.fillStyle = quadColour(of[i]); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.4; ctx.stroke();
  });
  ctx.strokeStyle = cssVar('--ink'); ctx.lineWidth = 0.9;
  for (const g of Object.values(geography.grids)) { trace(g.outline); ctx.stroke(); }
  // island and focus-province labels
  const halo = (txt, x, y, font) => { ctx.font = font; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = cssVar('--bg'); ctx.strokeText(txt, x, y); ctx.fillStyle = cssVar('--ink'); ctx.fillText(txt, x, y); };
  for (const isl of ISLANDS) {
    const ids = islandIds(isl).map(id => geography.grids[id]);
    const cx = total(ids.map(g => g.x0 + g.width * g.step / 2)) / ids.length, cy = total(ids.map(g => g.y0 - g.height * g.step / 2)) / ids.length;
    const [a, b] = P([cx, cy + (isl === 'Sumatra' ? 380e3 : 330e3)]);
    halo(islandName(isl), a, b, 'italic 700 13px "Public Sans", sans-serif');
  }
  for (const id of FOCUS) {
    const g = geography.grids[id];
    const [a, b] = P([g.x0 + g.width * g.step / 2, g.y0 - g.height * g.step / 2]);
    halo(`${provinceName(id)} ★`, a, b, '700 11.5px "Public Sans", sans-serif');
  }
  quadPts = [];
}
function quadMapHit(mx, my) {
  if (!quadShapes?.P) return null;
  const { s, ox, oy, bounds: [x0, , , y1] } = quadShapes;
  const x = x0 + (mx - ox) / s, y = y1 - (my - oy) / s;
  const inRing = (ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, ay] = ring[i], [bx, by] = ring[j]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside; } return inside; };
  const i = quadShapes.boxes.findIndex(([a, b, c, d], k) => x >= a && x <= b && y >= c && y <= d
    && geography.shapes[k].some(poly => inRing(poly[0]) && !poly.slice(1).some(inRing)));
  return i < 0 ? null : i;
}
el('quad-view').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) { quadView = b.dataset.v; el('quad-tip').hidden = true; drawQuad(); } });
el('quad').addEventListener('pointermove', e => {
  if (!exposure) return;
  const r = el('quad').getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null;
  if (quadView === 'map') { const i = quadMapHit(mx, my); if (i !== null) best = [mx, my, i]; }
  else { let bd = Infinity; for (const [px, py, rad, i] of quadPts) { const d = Math.hypot(px - mx, py - my); if (d < Math.max(rad, 6) && d < bd) { bd = d; best = [px, py, i]; } } }
  const tip = el('quad-tip');
  if (!best) { tip.hidden = true; return; }
  const i = best[2], z = overview.zones[i], x = exposure.districts[i], k = matrixData().of[i];
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(z.name)}</b> · ${provinceName(z.province)}<br><i class="legend-dot" style="background:${quadColour(k)}"></i>${t(...QUAD_NAME[k])}<br>${fmt(x.unhealthy)} ${t('unhealthy days', 'hari tidak sehat')} · PM₂.₅ ${fmt(x.mean)} µg/m³<br>${fmt(z.population)} ${t('people', 'jiwa')}`;
  tip.style.left = `${Math.min(r.width - 220, best[0] + 12)}px`; tip.style.top = `${Math.max(0, best[1] - 20)}px`;
});
el('quad').addEventListener('pointerleave', () => { el('quad-tip').hidden = true; });

/* ================================================================ actions */
function renderActions() {
  const k19 = profile.Kalimantan[2019], k26 = profile.Kalimantan[2026];
  const sg = regional.singapore.daily;
  const lin = shape.marginal[1].perTenth * 10;   // per detection/km² at a middle fire level
  const low = shape.bins[0].pm;
  // top regencies in 2026 priority zones
  const groups = new Map();
  overview.zones.forEach((z, i) => { const v = story[2026].indicators[i].priorityPeople; if (v > 0) groups.set(z.regency, (groups.get(z.regency) ?? 0) + v); });
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n).join(', ');
  el('actions-lede').textContent = t(
    'The fires are predictable: dry peat burns, smoke travels about 100 km, and a long season multiplies the harm. Four actions follow from the numbers.',
    'Kebakaran ini bisa diperkirakan: gambut kering terbakar, asap menempuh sekitar 100 km, dan musim yang panjang melipatgandakan dampaknya. Empat langkah berikut lahir dari angka-angka itu.');
  const items = [
    [t('Plan for the full length of the season', 'Rencanakan untuk sepanjang musim'),
      t(`September 2026 in Kalimantan looked like 2019 (${fmt(k26.months[2])} vs ${fmt(k19.months[2])} detections). October kept burning: ${fmt(k26.months[3])} vs ${fmt(k19.months[3])}. Keep fire crews, emergency status and health alerts running until the rain returns.`,
        `September 2026 di Kalimantan mirip 2019 (${fmt(k26.months[2])} vs ${fmt(k19.months[2])} deteksi). Oktober terus terbakar: ${fmt(k26.months[3])} vs ${fmt(k19.months[3])}. Pertahankan regu pemadam, status darurat, dan peringatan kesehatan sampai hujan kembali.`)],
    [t('Rewet the peat that keeps burning', 'Basahi ulang gambut yang terus terbakar'),
      t(`${fmt(k26.cellsBurning5PlusDays)} two-kilometre squares in Kalimantan burned on five or more days in 2026, ${fmt(k26.cellsBurning5PlusDays / k19.cellsBurning5PlusDays, 1)}× as many as in 2019. Smouldering peat is what makes smoke last. Canal blocking and rewetting there cut the longest exposure.`,
        `${fmt(k26.cellsBurning5PlusDays)} kotak dua kilometer di Kalimantan terbakar lima hari atau lebih pada 2026, ${fmt(k26.cellsBurning5PlusDays / k19.cellsBurning5PlusDays, 1)}× lipat dibanding 2019. Gambut yang membara inilah yang membuat asap bertahan. Penyekatan kanal dan pembasahan di sana memangkas paparan terpanjang.`)],
    [t('Protect people within 100 km of fire clusters', 'Lindungi warga dalam radius 100 km dari klaster api'),
      t(`Fire up to about 100 km away explains local air best, and each extra 0.1 detections per km² adds roughly ${fmt(lin / 10)} µg/m³ at a middle fire level. In 2026 the priority zones held ${millions(priorityPeople(story[2026]))} people, led by ${top}. Clean-air rooms, masks and school schedules belong there first.`,
        `Api hingga sekitar 100 km paling menjelaskan kualitas udara setempat, dan setiap tambahan 0,1 deteksi per km² menambah sekitar ${fmt(lin / 10)} µg/m³ pada tingkat api menengah. Pada 2026 zona prioritas dihuni ${millions(priorityPeople(story[2026]))} orang, terbanyak di ${top}. Ruang udara bersih, masker, dan jadwal sekolah perlu disiapkan di sana lebih dulu.`)],
    [t('Treat haze as a regional problem', 'Perlakukan kabut asap sebagai masalah kawasan'),
      t(`Even the areas with the least fire nearby averaged ${fmt(low)} µg/m³ in September 2019, ${fmt(low / 15, 1)}× the WHO daily guideline, and Singapore logged ${runs(sg[2026], 37.5).days} haze days in 2026. Shared early warning under the ASEAN haze agreement belongs alongside local firefighting.`,
        `Bahkan wilayah dengan api paling sedikit di sekitarnya rata-rata ${fmt(low)} µg/m³ pada September 2019, ${fmt(low / 15, 1)}× pedoman harian WHO, dan Singapura mencatat ${runs(sg[2026], 37.5).days} hari berasap pada 2026. Peringatan dini bersama dalam kerangka perjanjian kabut asap ASEAN perlu berjalan bersama pemadaman lokal.`)],
  ];
  el('actions-list').innerHTML = items.map(([h, p]) => `<li><h3>${h}</h3><p>${p}</p></li>`).join('');
}

/* ================================================================ downloads */
function download(name, contents, mime) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv() {
  const { year, scenario, mode, radius, region, percentiles } = state;
  const rows = [['pcode', 'name', 'level', 'kabupaten', 'province', 'year', 'kernel_mode', 'radius_km', 'local_hotspots',
    'kernel_density_per_km2', 'population_2020', 'pm25_2019_historical_ug_m3', 'pm25_2026_model_ug_m3', 'pm25_2026_percentile',
    'model_extrapolation', 'priority_population', 'mean_index_z', 'cluster']];
  for (const i of currentIds()) {
    const z = overview.zones[i], r = scenario.indicators[i];
    rows.push([z.id, z.name, z.level, z.regency, PROVINCE_ID[z.province], year, mode, radius, z.counts[year === 2019 ? 0 : 1],
      r.density, Math.round(z.population), year === 2019 ? z.pm25.toFixed(3) : '', year === 2026 ? r.exposure : '',
      year === 2026 ? percentiles[i].toFixed(2) : '', year === 2026 ? r.extrapolated : '', r.priorityPeople, r.index ?? '', String.fromCharCode(65 + r.cluster)]);
  }
  const quote = v => { const s = String(v); const safe = typeof v === 'string' && /^[=+@\t\r-]/.test(s) ? `'${s}` : s; return `"${safe.replaceAll('"', '""')}"`; };
  download(`wilayah-${year}-${mode}-${radius}-${region}.csv`, '﻿' + rows.map(r => r.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function geojson() {
  const { year, scenario, mode, radius, region } = state;
  const features = provinceIds(region).map(id => {
    const grid = geography.grids[id], data = scenario.provinces[id];
    const convert = ([x, y]) => lonLat(grid.x0 + x * grid.step, grid.y0 - y * grid.step).map(v => Number(v.toFixed(7)));
    return { type: 'Feature', id, properties: { province: PROVINCE_ID[id], year, kernel: mode, radius_km: radius,
      threshold_z: overview.config.threshold, cell_km: overview.config.cellKm, grid_area_km2: data.priorityArea, estimated_people_2020: data.priorityPeople },
    geometry: { type: 'MultiPolygon', coordinates: data.priorityShapes.map(poly => poly.map(ring => ring.map(convert).reverse())) } };
  });
  download(`zona-prioritas-${year}-${mode}-${radius}-${region}.geojson`, JSON.stringify({ type: 'FeatureCollection', features }), 'application/geo+json');
}

/* ================================================================ boot */
function renderAll() {
  renderStatus();
  renderRegionOptions();
  renderCities();
  renderFindings();
  renderStepper(process.step);
  renderSeasons();
  renderPeat();
  renderSmoke();
  renderLimits();
  renderBorders();
  renderMatrix();
  renderActions();
  if (state) { renderMapPanel(); renderPriority(); }
}
async function start() {
  try {
    const [o, g, v, s, s19, s26, basemap, fp, sh, rg, ex] = await Promise.all(['data/overview.json', 'data/geography.json', 'data/validation.json', 'data/stats.json',
      'data/scenario-2019-count-100.json', 'data/scenario-2026-count-100.json', 'data/basemap.json', 'data/fire-profile.json', 'data/shape.json', 'data/regional.json', 'data/exposure2026.json'].map(readJSON));
    profile = fp; shape = sh; regional = rg; basemapData = basemap; exposure = ex;
    overview = o; geography = g; tests = v; stats = s; story = { 2019: s19, 2026: s26 };
    cache.set('2019-count-100', Promise.resolve(s19)); cache.set('2026-count-100', Promise.resolve(s26));
    map = createMap(el('study-map'), geography, overview.zones, selectDistrict);
    process = createProcess(el('iso'), { onStep: step => renderStepper(step) });
    terrain = createTerrain(el('terrain'), el('terrain-labels'), geography, overview.zones, basemap);
    el('iso-steps').addEventListener('click', e => { const b = e.target.closest('button[data-step]'); if (b) process.go(Number(b.dataset.step)); });
    el('iso-play').addEventListener('click', () => process.toggle());
    el('iso-prev').addEventListener('click', () => process.prev());
    el('iso-next').addEventListener('click', () => process.next());
    el('terrain-year').addEventListener('click', e => { const b = e.target.closest('button[data-year]'); if (!b) return; clearInterval(terrainTimer); terrainYear = Number(b.dataset.year); renderSeasons(); });
    el('land-year').addEventListener('click', e => { const b = e.target.closest('button[data-year]'); if (b) { landYear = Number(b.dataset.year); renderPeat(); } });
    new ResizeObserver(drawScatter).observe(el('scatter'));
    new ResizeObserver(drawDaily).observe(el('daily'));
    new ResizeObserver(drawSingapore).observe(el('sg-chart'));
    new ResizeObserver(drawRegion).observe(el('region-map'));
    new ResizeObserver(drawQuad).observe(el('quad'));
    el('filters').addEventListener('change', refresh);
    el('district').addEventListener('change', e => selectDistrict(Number(e.target.value)));
    el('ranking-grain').addEventListener('change', () => state && renderPriority());
    el('ranking').addEventListener('click', e => {
      const row = e.target.closest('button[data-district]');
      if (row) { selectDistrict(Number(row.dataset.district)); go(slides.findIndex(s => s.id === 'explore')); }
    });
    el('zoom-in').addEventListener('click', () => map.zoomBy(1.4));
    el('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.4));
    el('map-reset').addEventListener('click', map.reset);
    el('priority-map').addEventListener('click', () => { el('layer').value = 'index'; refresh(); go(slides.findIndex(s => s.id === 'explore')); });
    el('export-csv').addEventListener('click', () => state && csv());
    el('export-geojson').addEventListener('click', () => state && geojson());
    ready = true;
    renderAll();
    autoTerrain();
    await refresh();
  } catch (error) {
    console.error(error);
    setStatus('Could not load the data. Serve this folder over HTTP (node serve.mjs) and reload.', 'Data tidak bisa dimuat. Jalankan folder ini lewat HTTP (node serve.mjs) lalu muat ulang.', true);
  }
}

applyLanguage(store.get('peat-dashboard-language', 'en'));
el('language').addEventListener('change', e => { applyLanguage(e.target.value); store.set('peat-dashboard-language', language); });
if (location.hash) { const i = slides.findIndex(s => `#${s.id}` === location.hash); if (i > 0) requestAnimationFrame(() => slides[i].scrollIntoView()); }
setCurrent(Math.max(0, slides.findIndex(s => `#${s.id}` === location.hash)));
start();
