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
const attrMap = { 'aria-label': 'aria-label', alt: 'alt', content: 'content', label: 'data-label' };
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

/* ================================================================ mode & theme */
function setMode(mode) {
  const next = mode === 'advanced' ? 'advanced' : 'story';
  root.dataset.mode = next;
  $$('[data-mode]').forEach(b => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.dataset.mode === next); });
  store.set('peat-mode', next);
  if (next === 'story' && ready) {
    // Story mode always tells the best-validated setting.
    el('mode').value = 'count'; el('radius').value = '100'; el('region').value = 'all';
    refresh();
  }
  if (ready) requestAnimationFrame(() => { drawScatter(); map?.update({ ...state, selected, language, provinceName }); });
}
$$('button[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setTheme(theme) {
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  if (ready) { drawScatter(); process.redraw(); terrain.redraw(); map.update({ ...state, selected, language, provinceName }); }
}
el('theme').addEventListener('click', () => {
  const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  store.set('peat-theme', next); setTheme(next);
});

/* ================================================================ data */
const cache = new Map();
const readJSON = async path => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
const scenarioFile = key => {
  if (!cache.has(key)) cache.set(key, readJSON(`data/scenario-${key}.json`).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
};
let overview, geography, tests, stats, story, map, process, terrain, state, ready = false;
let selected = null, requestId = 0, modelKey = 'count-100', terrainYear = 2019, landYear = 2019;
let statusText = ['Loading 305 districts…', 'Memuat 305 kecamatan…'], statusError = false;
function renderStatus() { const s = el('app-status'); s.textContent = statusText[0] ? t(...statusText) : ''; s.classList.toggle('error', statusError); }
function setStatus(en = '', id = '', error = false) { statusText = [en, id]; statusError = error; renderStatus(); }

const provinceIds = region => (region === 'all' ? ['ID14', 'ID62'] : [region]);
const provinceName = id => (id === 'ID62' ? t('Central Kalimantan', PROVINCE_NAMES[id]) : PROVINCE_NAMES[id]);
const scopeName = region => (region === 'all' ? t('both provinces', 'kedua provinsi') : provinceName(region));
const densityUnit = mode => (mode === 'frp' ? 'MW/km²' : t('detections/km²', 'deteksi/km²'));
const modelLabel = key => { const [m, r] = key.split('-'); return `${m === 'frp' ? 'FRP' : t('Count', 'Jumlah')} · ${r} km`; };
const currentIds = () => overview.zones.flatMap((z, i) => (provinceIds(state.region).includes(z.province) ? [i] : []));
const seasonTotal = (id, y) => overview.provinces[id].seasons[y].total;
const change = id => 100 * (seasonTotal(id, 2026) / seasonTotal(id, 2019) - 1);
const priorityPeople = (scenario, ids = ['ID14', 'ID62']) => total(ids.map(id => scenario.provinces[id].priorityPeople));
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

/* ================================================================ intro */
function renderFindings() {
  const p26 = story[2026];
  const cal = stats.calibration['count-100'];
  const kShare = p26.provinces.ID62.priorityPeople / priorityPeople(p26);
  el('findings').innerHTML = [
    t(`<b>The fire moved.</b> From 2019 to 2026, detections fell ${fmt(Math.abs(change('ID14')))}% in Riau and rose ${fmt(change('ID62'))}% in Central Kalimantan.`,
      `<b>Api berpindah.</b> Dari 2019 ke 2026, deteksi api turun ${fmt(Math.abs(change('ID14')))}% di Riau dan naik ${fmt(change('ID62'))}% di Kalimantan Tengah.`),
    t(`<b>Fire nearby predicts smoke.</b> Fire within 100 km explains about ${fmt(cal.r2 * 100)}% of the differences in September 2019 PM₂.₅ between districts.`,
      `<b>Api di sekitar memprediksi asap.</b> Api dalam radius 100 km menjelaskan sekitar ${fmt(cal.r2 * 100)}% perbedaan PM₂.₅ September 2019 antar-kecamatan.`),
    t(`<b>Who to prepare.</b> In 2026, about ${millions(priorityPeople(p26))} people live in priority zones, ${fmt(kShare * 100)}% of them in Central Kalimantan.`,
      `<b>Siapa yang disiapkan.</b> Pada 2026, sekitar ${millions(priorityPeople(p26))} orang tinggal di zona prioritas, ${fmt(kShare * 100)}% di Kalimantan Tengah.`),
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
  el('iso-caption').innerHTML = `<h3>${step + 1}. ${t(...s.name)}</h3><p>${t(...s.story)}</p>
    <div class="arcgis adv"><b>${t('In ArcGIS Pro', 'Di ArcGIS Pro')}</b>${t(...s.arc)}</div>`;
  el('iso-play').textContent = process?.playing ? t('Pause', 'Jeda') : t('Play', 'Putar');
}

/* ================================================================ seasons */
function renderSeasons() {
  const r = overview.provinces.ID14.seasons, k = overview.provinces.ID62.seasons;
  el('season-insight').innerHTML = t(
    `Riau fell from <strong>${fmt(r[2019].total)}</strong> detections in 2019 to <strong>${fmt(r[2026].total)}</strong> in 2026 (${pct(change('ID14'))}). Central Kalimantan doubled, from <strong>${fmt(k[2019].total)}</strong> to <strong>${fmt(k[2026].total)}</strong> (${pct(change('ID62'))}).`,
    `Riau turun dari <strong>${fmt(r[2019].total)}</strong> deteksi pada 2019 menjadi <strong>${fmt(r[2026].total)}</strong> pada 2026 (${pct(change('ID14'))}). Kalimantan Tengah berlipat dua, dari <strong>${fmt(k[2019].total)}</strong> menjadi <strong>${fmt(k[2026].total)}</strong> (${pct(change('ID62'))}).`);
  const limit = Math.max(...Object.values(overview.provinces).flatMap(p => [2019, 2026].flatMap(y => p.seasons[y].months)));
  const months = t(['Jul', 'Aug', 'Sep', 'Oct'], ['Jul', 'Agu', 'Sep', 'Okt']);
  el('months').innerHTML = ['ID14', 'ID62'].map(id => {
    const s = overview.provinces[id].seasons;
    return `<div class="month-chart"><h4>${provinceName(id)}</h4><div class="month-bars">${months.map((m, i) => {
      const a = s[2019].months[i], b = s[2026].months[i];
      return `<div class="pair" title="${m} · 2019: ${fmt(a)} · 2026: ${fmt(b)}" role="img" aria-label="${m}: 2019 ${fmt(a)}, 2026 ${fmt(b)}"><i style="height:${100 * a / limit}%;background:var(--y2019)"></i><i style="height:${100 * b / limit}%;background:var(--y2026)"></i></div>`;
    }).join('')}</div><div class="month-axis">${months.map(m => `<span>${m}</span>`).join('')}</div></div>`;
  }).join('');
  $$('#terrain-year button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.year) === terrainYear));
  showTerrain();
}
function showTerrain() {
  terrain.show(story[terrainYear], {
    names: { ID14: 'Riau', ID62: provinceName('ID62') }, peak: t('Highest', 'Tertinggi'),
    totals: Object.fromEntries(['ID14', 'ID62'].map(id => [id, `${fmt(seasonTotal(id, terrainYear))} ${t('detections', 'deteksi')}`])),
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
  const max = Math.max(...Object.values(overview.provinces).flatMap(p => p.seasons[landYear].rates));
  el('land').innerHTML = ['ID14', 'ID62'].map(id => {
    const rates = overview.provinces[id].seasons[landYear].rates;
    return `<div class="land-group"><h4><span>${provinceName(id)}</span><span class="muted small">${t('per 100 km²', 'per 100 km²')}</span></h4>
      ${rates.map((v, j) => `<div class="land-row"><span>${labels[j]}</span><span class="track"><i style="width:${100 * v / max}%;background:${risky[j] ? 'var(--ember)' : 'var(--faint)'}"></i></span><strong>${fmt(v, 1)}</strong></div>`).join('')}</div>`;
  }).join('');
  const ratio = (id, a, b) => overview.provinces[id].seasons[landYear].rates[a] / overview.provinces[id].seasons[landYear].rates[b];
  el('peat-insight').innerHTML = t(
    `In ${landYear}, peat had <strong>${fmt(ratio('ID14', 0, 1), 1)}×</strong> (Riau) and <strong>${fmt(ratio('ID62', 0, 1), 1)}×</strong> (Central Kalimantan) the fire density of other land. Forest cleared since 2001 had <strong>${fmt(ratio('ID14', 2, 3), 1)}×</strong> and <strong>${fmt(ratio('ID62', 2, 3), 1)}×</strong> that of standing forest.`,
    `Pada ${landYear}, gambut memiliki kepadatan api <strong>${fmt(ratio('ID14', 0, 1), 1)}×</strong> (Riau) dan <strong>${fmt(ratio('ID62', 0, 1), 1)}×</strong> (Kalimantan Tengah) dibanding lahan lain. Hutan yang dibuka sejak 2001 <strong>${fmt(ratio('ID14', 2, 3), 1)}×</strong> dan <strong>${fmt(ratio('ID62', 2, 3), 1)}×</strong> hutan yang masih berdiri.`);
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
    `Districts with more fire within ${r} km had dirtier air in September 2019. A high-fire district (top quarter) averaged about <strong>${fmt(effect)} µg/m³</strong> more PM₂.₅ than a low-fire one (bottom quarter). The WHO 24-hour guideline is 15.`,
    `Kecamatan dengan lebih banyak api dalam ${r} km punya udara lebih kotor pada September 2019. Kecamatan api tinggi (kuartil atas) rata-rata sekitar <strong>${fmt(effect)} µg/m³</strong> PM₂.₅ lebih tinggi daripada kecamatan api rendah (kuartil bawah). Pedoman WHO 24 jam adalah 15.`);
  const w = cal.withinProvince;
  el('smoke-tiles').innerHTML = [
    [`${fmt(cal.r2 * 100)}%`, t('of the differences between districts explained by nearby fire', 'perbedaan antar-kecamatan dijelaskan oleh api di sekitar')],
    [`${fmt(cal.spatialCV.r2 * 100)}%`, t('still explained when whole regencies are hidden from the model', 'tetap terjelaskan saat seluruh kabupaten disembunyikan dari model')],
    [`ρ ${fmt(w.ID14.rho, 2)} / ${fmt(w.ID62.rho, 2)}`, t('rank link inside Riau / Central Kalimantan, both p < 0.001', 'hubungan peringkat di dalam Riau / Kalimantan Tengah, keduanya p < 0,001')],
  ].map(([a, b]) => `<div><strong>${a}</strong><small>${b}</small></div>`).join('');
  el('smoke-caveat').textContent = t(
    'This is an association. Wind and weather also move smoke, and the model does not include them yet.',
    'Ini asosiasi. Angin dan cuaca juga menggerakkan asap, dan model belum memasukkannya.');
  // advanced: comparison table
  const keys = ['count-25', 'count-50', 'count-100', 'frp-25', 'frp-50', 'frp-100'];
  const best = keys.reduce((a, b) => (stats.calibration[b].spatialCV.r2 > stats.calibration[a].spatialCV.r2 ? b : a));
  el('model-pick').innerHTML = keys.map(k => `<button type="button" data-key="${k}" aria-pressed="${k === modelKey}">${modelLabel(k)}</button>`).join('');
  el('stat-table').innerHTML = `<thead><tr><th>${t('Setting', 'Pengaturan')}</th><th>R²</th><th>${t('Hold-out R²', 'R² uji acak')}</th><th>${t('Regency-out R²', 'R² tanpa kabupaten')}</th><th>${t('Within-prov. R²', 'R² dalam prov.')}</th><th>${t('Resid. Moran\'s I', 'Moran\'s I residual')}</th></tr></thead><tbody>${keys.map(k => {
    const c = stats.calibration[k];
    return `<tr class="${k === best ? 'best' : ''}"><td>${modelLabel(k)}${k === best ? ' ★' : ''}</td><td>${fmt(c.r2, 2)}</td><td>${fmt(tests[k].ranges.r2[0], 2)}</td><td>${fmt(c.spatialCV.r2, 2)}</td><td>${fmt(c.fixedEffects.withinR2, 2)}</td><td>${fmt(c.moranResiduals.I, 2)}</td></tr>`;
  }).join('')}</tbody>`;
  const [tr1, tr2] = v.transfers;
  const kal = provinceName('ID62');
  el('read-list').innerHTML = [
    t(`<b>Slope</b> ${fmt(cal.slope)} µg/m³ per unit of Ln(1 + density), 95% CI ${fmt(cal.ci95[0])}–${fmt(cal.ci95[1])}, t = ${fmt(cal.t, 1)}, ${pLabel(cal.p)}, n = ${cal.n}.`,
      `<b>Kemiringan</b> ${fmt(cal.slope)} µg/m³ per satuan Ln(1 + kepadatan), IK 95% ${fmt(cal.ci95[0])}–${fmt(cal.ci95[1])}, t = ${fmt(cal.t, 1)}, ${pLabel(cal.p)}, n = ${cal.n}.`),
    t(`<b>Cluster bootstrap</b> by ${cal.bootstrap.clusters} regencies (${fmt(cal.bootstrap.reps)} draws): 95% CI ${fmt(cal.bootstrap.lo)}–${fmt(cal.bootstrap.hi)}. It never crosses zero, so the link survives spatial clustering.`,
      `<b>Bootstrap klaster</b> per ${cal.bootstrap.clusters} kabupaten (${fmt(cal.bootstrap.reps)} ulangan): IK 95% ${fmt(cal.bootstrap.lo)}–${fmt(cal.bootstrap.hi)}. Tidak pernah melewati nol, jadi hubungan bertahan meski data mengelompok secara spasial.`),
    t(`<b>Province fixed effects</b> keep within-province R² ${fmt(cal.fixedEffects.withinR2, 2)}. The link is not just “Central Kalimantan is hazier”.`,
      `<b>Efek tetap provinsi</b> menyisakan R² dalam provinsi ${fmt(cal.fixedEffects.withinR2, 2)}. Hubungan ini bukan sekadar “Kalimantan Tengah lebih berasap”.`),
    t(`<b>Residual Moran's I</b> ${fmt(cal.moranResiduals.I, 2)} (permutation ${pLabel(cal.moranResiduals.p)}, 8 nearest neighbours). Errors cluster in space, so ordinary p-values are too optimistic; rely on the bootstrap and regency hold-out. Wind direction is the missing variable.`,
      `<b>Moran's I residual</b> ${fmt(cal.moranResiduals.I, 2)} (permutasi ${pLabel(cal.moranResiduals.p)}, 8 tetangga terdekat). Galat mengelompok di ruang, jadi p-value biasa terlalu optimis; andalkan bootstrap dan uji tanpa kabupaten. Arah angin adalah variabel yang hilang.`),
    t(`<b>Transfer</b> Riau → ${kal}: R² ${fmt(tr1.r2, 2)}, ρ ${fmt(tr1.rho, 2)}. ${kal} → Riau: R² ${fmt(tr2.r2, 2)}, ρ ${fmt(tr2.rho, 2)}. Rankings travel better than absolute levels.`,
      `<b>Transfer</b> Riau → ${kal}: R² ${fmt(tr1.r2, 2)}, ρ ${fmt(tr1.rho, 2)}. ${kal} → Riau: R² ${fmt(tr2.r2, 2)}, ρ ${fmt(tr2.rho, 2)}. Peringkat lebih mudah dipindahkan daripada nilai absolut.`),
    t('<b>Why count at 100 km wins:</b> smoke travels far, so wider kernels fit better; FRP lets a few very hot detections dominate.',
      '<b>Mengapa jumlah pada 100 km terbaik:</b> asap menempuh jarak jauh, jadi kernel lebar lebih cocok; FRP membuat beberapa deteksi sangat panas mendominasi.'),
  ].map(x => `<li>${x}</li>`).join('');
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
  const colors = { ID14: cssVar('--riau'), ID62: cssVar('--kalteng') }, surface = cssVar('--paper');
  scatterPts = [];
  overview.zones.forEach((z, i) => {
    const px = X(x[i]), py = Y(y[i]);
    scatterPts.push([px, py, i]);
    ctx.beginPath();
    if (z.province === 'ID14') ctx.rect(px - 3.5, py - 3.5, 7, 7); else ctx.arc(px, py, 4, 0, 7);
    ctx.fillStyle = colors[z.province]; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = surface; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(X(0), Y(cal.intercept)); ctx.lineTo(X(xmax), Y(cal.intercept + cal.slope * xmax)); ctx.stroke();
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
el('model-pick').addEventListener('click', e => { const b = e.target.closest('button[data-key]'); if (b) { modelKey = b.dataset.key; renderSmoke(); } });

/* ================================================================ map explorer */
const layerTitles = {
  heat: ['Where is fire concentrated?', 'Di mana api terkonsentrasi?'],
  exposure: ['Where is smoke exposure higher?', 'Di mana paparan asap lebih tinggi?'],
  index: ['Where are the priority zones?', 'Di mana zona prioritas?'],
  cluster: ['Which districts look alike?', 'Kecamatan mana yang mirip?'],
};
function getFilters() {
  return { year: Number(document.querySelector('input[name="year"]:checked').value), region: el('region').value,
    layer: el('layer').value, mode: el('mode').value, radius: Number(el('radius').value) };
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
    caption = t('Red outlines mark priority zones (index ≥ +1.5 SD). Each season is standardised separately.', 'Garis merah menandai zona prioritas (indeks ≥ +1,5 SD). Tiap musim dibakukan terpisah.');
    legend = legendRamp(INDEX_COLORS, '−1.5 SD', '+1.5 SD', t('0.5 SD per class', '0,5 SD per kelas'));
  } else {
    caption = t(`K-means groups all 305 districts into ${scenario.clusters.k} profiles for ${year}.`, `K-means mengelompokkan 305 kecamatan menjadi ${scenario.clusters.k} profil untuk ${year}.`);
    legend = `<div class="range">${scenario.clusters.profiles.map(p => `<span><i class="swatch" style="background:${TYPE_COLORS[p.type]}"></i>${clusterLabel(p)[0]}</span>`).join(' ')}</div>`;
  }
  el('map-title').textContent = t(...layerTitles[layer]);
  el('map-caption').textContent = caption;
  el('legend').innerHTML = legend;
  const list = currentIds().sort((a, b) => overview.zones[a].name.localeCompare(overview.zones[b].name, 'id'));
  el('district').innerHTML = list.map(i => `<option value="${i}">${esc(overview.zones[i].name)} · ${esc(overview.zones[i].regency)}</option>`).join('');
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
    <p class="district-meta">${esc(d.regency)} · ${provinceName(d.province)}</p>
    <dl class="district-metrics">${metrics.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <p class="district-note">${r.priorityPeople >= 1 ? t(`<strong>${fmt(r.priorityPeople)}</strong> people live in priority cells.`, `<strong>${fmt(r.priorityPeople)}</strong> orang tinggal di sel prioritas.`) : t('No priority cells in this district.', 'Tidak ada sel prioritas di kecamatan ini.')}</p>
    <p class="district-note"><i class="swatch" style="background:${TYPE_COLORS[profile.type]}"></i>${clusterLabel(profile)[0]}</p>
    ${r.extrapolated ? `<p class="district-note small muted">${t('2026 fire level is outside the 2019 training range; read this estimate with care.', 'Tingkat api 2026 di luar rentang data latih 2019; baca perkiraan ini dengan hati-hati.')}</p>` : ''}
    <p class="small muted adv">${t('Density unit', 'Satuan kepadatan')}: ${densityUnit(mode)}</p>`;
  map.update({ ...state, selected, language, provinceName });
}
function selectDistrict(i) { if (currentIds().includes(i)) { selected = i; renderDistrict(); } }

/* ================================================================ priority */
function renderPriority() {
  const { scenario, year, region } = state;
  // fixed story comparison (count, 100 km, both provinces)
  const people = y => priorityPeople(story[y]);
  const maxPeople = Math.max(people(2019), people(2026));
  el('versus').innerHTML = [2019, 2026].map(y => {
    const p = story[y].provinces;
    const bar = ['ID14', 'ID62'].map(id => `<i style="width:${100 * p[id].priorityPeople / maxPeople}%;background:var(--${id === 'ID14' ? 'riau' : 'kalteng'})" title="${provinceName(id)} ${fmt(p[id].priorityPeople)}"></i>`).join('');
    return `<div><span class="year">${y}</span><strong>${millions(people(y))}</strong><div class="bar">${bar}</div>
      <small><i class="swatch" style="background:var(--riau)"></i>Riau ${fmt(p.ID14.priorityPeople / 1e6, 2)}M &nbsp; <i class="swatch" style="background:var(--kalteng)"></i>${provinceName('ID62')} ${fmt(p.ID62.priorityPeople / 1e6, 2)}M</small></div>`;
  }).join('');
  el('priority-insight').innerHTML = t(
    `The risk moved with the fire. In 2019 priority zones held <strong>${millions(people(2019))}</strong> people across both provinces. In 2026 they hold <strong>${millions(people(2026))}</strong>, all in Central Kalimantan.`,
    `Risiko berpindah bersama api. Pada 2019 zona prioritas mencakup <strong>${millions(people(2019))}</strong> orang di kedua provinsi. Pada 2026 mencakup <strong>${millions(people(2026))}</strong>, seluruhnya di Kalimantan Tengah.`);
  // sensitivity
  const sens = stats.sensitivity;
  if (sens) {
    const names = { published: t('Published (Ln density)', 'Dipakai (Ln kepadatan)'), rawDensity: t('Raw density', 'Kepadatan mentah'),
      equalWeights: t('Equal weights ⅓', 'Bobot sama ⅓'), noPopulation: t('No population term', 'Tanpa penduduk') };
    const sumP = (y, v) => sens.years[y][v].ID14.people + sens.years[y][v].ID62.people;
    el('sensitivity').innerHTML = `<thead><tr><th>${t('Index version', 'Versi indeks')}</th><th>2019</th><th>2026</th><th>${t('Riau 2026', 'Riau 2026')}</th></tr></thead><tbody>${
      Object.keys(names).map(v => `<tr class="${v === 'published' ? 'best' : ''}"><td>${names[v]}</td><td>${fmt(sumP(2019, v) / 1e6, 2)}M</td><td>${fmt(sumP(2026, v) / 1e6, 2)}M</td><td>${fmt(sens.years[2026][v].ID14.people / 1e6, 2)}M</td></tr>`).join('')}</tbody>`;
    const raw = sens.years[2026].rawDensity.ID14;
    el('sensitivity-note').textContent = t(
      `Lesson learned: with raw density, ${fmt(raw.people / 1e6, 2)} million Riau residents (Pekanbaru) were flagged in 2026 even though ${fmt(raw.lowFireShare * 100)}% of those cells had below-average fire. Ln(1 + density) removes that artefact. Weights barely matter; dropping population removes most towns.`,
      `Pelajaran: dengan kepadatan mentah, ${fmt(raw.people / 1e6, 2)} juta warga Riau (Pekanbaru) ditandai pada 2026 padahal ${fmt(raw.lowFireShare * 100)}% sel itu apinya di bawah rata-rata. Ln(1 + kepadatan) menghapus artefak itu. Bobot hampir tidak berpengaruh; tanpa penduduk, sebagian besar kota hilang.`);
  }
  // ranking follows the map filters
  const districts = el('ranking-grain').value === 'district';
  const groups = new Map();
  for (const i of currentIds()) {
    const z = overview.zones[i];
    const id = districts ? z.id : z.regencyId;
    const g = groups.get(id) ?? { name: districts ? z.name : z.regency, province: z.province, people: 0, priority: 0, index: i };
    g.people += z.population; g.priority += scenario.indicators[i].priorityPeople; groups.set(id, g);
  }
  el('ranking-area').textContent = districts ? t('District', 'Kecamatan') : t('Regency / city', 'Kabupaten/kota');
  const rows = [...groups.values()].filter(g => g.priority >= 1).sort((a, b) => b.priority - a.priority).slice(0, 7);
  el('priority-caption').textContent = `${year} · ${scopeName(region)} · ${modelLabel(`${state.mode}-${state.radius}`)} · ${t('follows the map filters', 'mengikuti filter peta')}`;
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
      <p>${members.length} ${t('districts', 'kecamatan')} · ${fmt(total(members.map(i => overview.zones[i].population)) / 1e6, 2)}M ${t('people', 'jiwa')}. ${action}</p></div></div>`;
  }).join('');
  const cands = scenario.clusters.candidates;
  el('cluster-scores').textContent = t(
    `Silhouette by k: ${cands.map(c => `k=${c.k} ${fmt(c.silhouette, 2)}`).join(', ')}. The web picks the highest. ArcGIS Multivariate Clustering picks k by pseudo-F instead, so compare both. Silhouette around 0.4 means the groups overlap: treat them as profiles, not hard types.`,
    `Silhouette per k: ${cands.map(c => `k=${c.k} ${fmt(c.silhouette, 2)}`).join(', ')}. Web memilih yang tertinggi. Multivariate Clustering ArcGIS memilih k dengan pseudo-F, jadi bandingkan keduanya. Silhouette sekitar 0,4 berarti kelompok saling tumpang tindih: anggap sebagai profil, bukan tipe kaku.`);
}

/* ================================================================ recipe */
function renderRecipe() {
  const c = stats.calibration['count-100'];
  const v = tests['count-100'];
  const p19 = priorityPeople(story[2019]), p26 = priorityPeople(story[2026]);
  const fallback = v.fallbackZones.map(id => overview.zones.find(z => z.id === id)?.name ?? id).join(', ');
  const steps = [
    [true, ['Project everything to one equal-area system', 'Proyeksikan semua ke satu sistem setara luas'], ['<code>Project</code> / <code>Project Raster</code> to Asia South Albers Equal Area Conic (WKID 102028); nearest neighbour for class rasters.', '<code>Project</code> / <code>Project Raster</code> ke Asia South Albers Equal Area Conic (WKID 102028); nearest neighbour untuk raster kelas.'], ['305 valid districts', '305 kecamatan valid']],
    [true, ['Peat and forest loss per district', 'Gambut dan kehilangan hutan per kecamatan'], ['<code>Pairwise Intersect</code> + <code>Summary Statistics</code> (Tabulate Intersection failed with error 160196); <code>Zonal Statistics as Table</code> SUM on 30 m loss.', '<code>Pairwise Intersect</code> + <code>Summary Statistics</code> (Tabulate Intersection gagal, galat 160196); <code>Zonal Statistics as Table</code> SUM pada kehilangan hutan 30 m.'], ['Peat 38,637.6 / 28,109.8 km²', 'Gambut 38.637,6 / 28.109,8 km²']],
    [true, ['Hotspots per district', 'Hotspot per kecamatan'], ['<code>Summarize Within</code>, checked with an independent <code>Spatial Join</code>.', '<code>Summarize Within</code>, dicek dengan <code>Spatial Join</code> terpisah.'], ['Riau 22,874 / 3,158 · Kalteng 80,126 / 164,333', 'Riau 22.874 / 3.158 · Kalteng 80.126 / 164.333']],
    [true, ['Population-weighted PM₂.₅', 'PM₂.₅ berbobot penduduk'], ['Sample PM₂.₅ at WorldPop cell centres, then SUM(PM × pop) / SUM(pop) by district.', 'Ambil PM₂.₅ di pusat sel WorldPop, lalu SUM(PM × penduduk) / SUM(penduduk) per kecamatan.'], ['101.67 / 154.87 µg/m³', '101,67 / 154,87 µg/m³']],
    [false, ['Kernel density surfaces', 'Permukaan kepadatan kernel'], ['<code>Kernel Density</code>: buffered hotspots, population field NONE and FRP, cell 2,000 m, radius 25,000 / 50,000 / 100,000 m, km², planar.', '<code>Kernel Density</code>: hotspot ber-buffer, population field NONE dan FRP, sel 2.000 m, radius 25.000 / 50.000 / 100.000 m, km², planar.'], ['Shape matches the fire terrain slide', 'Bentuk sama dengan slide terrain api']],
    [false, ['District mean of each surface', 'Rerata permukaan per kecamatan'], [`<code>Zonal Statistics as Table</code> MEAN by adm3_pcode → <code>Join Field</code>. Two small districts hold no cell centre (${esc(fallback)}): use the cell under their label point.`, `<code>Zonal Statistics as Table</code> MEAN per adm3_pcode → <code>Join Field</code>. Dua kecamatan kecil tidak memuat pusat sel (${esc(fallback)}): pakai sel di bawah titik labelnya.`], ['12 fields (2 seasons × 2 weights × 3 radii)', '12 kolom (2 musim × 2 bobot × 3 radius)']],
    [false, ['Calibrate smoke on fire', 'Kalibrasi asap terhadap api'], ['<code>Calculate Field</code> Ln(1 + KDE) → <code>Ordinary Least Squares</code> with PM25_pw as the dependent variable. Read the coefficient table and Koenker test.', '<code>Calculate Field</code> Ln(1 + KDE) → <code>Ordinary Least Squares</code> dengan PM25_pw sebagai variabel terikat. Baca tabel koefisien dan uji Koenker.'], [`R² ${fmt(c.r2, 2)} · slope ${fmt(c.slope)}`, `R² ${fmt(c.r2, 2)} · kemiringan ${fmt(c.slope)}`]],
    [false, ['Test the residuals for clustering', 'Uji pengelompokan residual'], ['<code>Spatial Autocorrelation (Global Moran\'s I)</code> on residuals, K nearest neighbors 8, row standardization.', '<code>Spatial Autocorrelation (Global Moran\'s I)</code> pada residual, K nearest neighbors 8, row standardization.'], [`I ≈ ${fmt(c.moranResiduals.I, 2)}`, `I ≈ ${fmt(c.moranResiduals.I, 2)}`]],
    [false, ['Validate on unseen districts', 'Validasi pada kecamatan yang tidak dilihat'], ['Random 30% hold-out (<code>Subset Features</code>, repeat) and leave-one-regency-out in ModelBuilder (<code>Iterate Field Values</code> on the regency code).', 'Hold-out acak 30% (<code>Subset Features</code>, ulangi) dan tanpa-satu-kabupaten di ModelBuilder (<code>Iterate Field Values</code> pada kode kabupaten).'], [`hold-out ${fmt(v.ranges.r2[0], 2)} · regency-out ${fmt(c.spatialCV.r2, 2)}`, `hold-out ${fmt(v.ranges.r2[0], 2)} · tanpa kabupaten ${fmt(c.spatialCV.r2, 2)}`]],
    [false, ['Estimate 2026 smoke ranks', 'Perkirakan peringkat asap 2026'], ['Apply the 2019 coefficients with <code>Calculate Field</code>; flag districts whose 2026 fire density lies outside the 2019 range.', 'Terapkan koefisien 2019 dengan <code>Calculate Field</code>; tandai kecamatan dengan kepadatan api 2026 di luar rentang 2019.'], [`${stats.extrapolation['count-100']} districts flagged`, `${stats.extrapolation['count-100']} kecamatan ditandai`]],
    [false, ['Build the priority index', 'Bangun indeks prioritas'], ['ModelBuilder: <code>Raster Calculator</code> z-scores with Ln(1 + people/km²), weights 0.3 / 0.3 / 0.4, <code>Reclassify</code> in 0.5 SD classes, priority ≥ +1.5 SD.', 'ModelBuilder: z-score dengan <code>Raster Calculator</code> memakai Ln(1 + jiwa/km²), bobot 0,3 / 0,3 / 0,4, <code>Reclassify</code> per 0,5 SD, prioritas ≥ +1,5 SD.'], [`${fmt(p19 / 1e6, 2)}M (2019) · ${fmt(p26 / 1e6, 2)}M (2026)`, `${fmt(p19 / 1e6, 2)} jt (2019) · ${fmt(p26 / 1e6, 2)} jt (2026)`]],
    [false, ['Group similar districts', 'Kelompokkan kecamatan serupa'], ['<code>Multivariate Clustering</code> (K-means): fire density, % forest loss on peat, PM₂.₅, Ln population density; evaluate 3–6 groups.', '<code>Multivariate Clustering</code> (K-means): kepadatan api, % kehilangan hutan di gambut, PM₂.₅, Ln kepadatan penduduk; uji 3–6 kelompok.'], ['web: k = 3 (silhouette)', 'web: k = 3 (silhouette)']],
    [false, ['Map the results', 'Petakan hasilnya'], ['Classify with ½ SD steps or quantiles rather than Natural Breaks, so maps compare across seasons.', 'Klasifikasi dengan kelas ½ SD atau kuantil, bukan Natural Breaks, agar peta bisa dibandingkan antar-musim.'], ['Same classes in both seasons', 'Kelas sama untuk kedua musim']],
  ];
  el('recipe').innerHTML = steps.map(([, title, how, check]) =>
    `<li><div><b>${t(...title)}</b><p>${t(...how)}</p><span class="check">${t('Check', 'Cek')}: ${t(...check)}</span></div></li>`).join('');
  el('limit-2026').textContent = t(
    `No 2026 PM₂.₅ map exists yet. 2026 values are ranks from the 2019 model, and ${stats.extrapolation['count-100']} of 305 districts fall outside its training range.`,
    `Belum ada peta PM₂.₅ 2026. Nilai 2026 adalah peringkat dari model 2019, dan ${stats.extrapolation['count-100']} dari 305 kecamatan berada di luar rentang data latihnya.`);
}

/* ================================================================ downloads */
function download(name, contents, mime) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv() {
  const { year, scenario, mode, radius, region, percentiles } = state;
  const rows = [['adm3_pcode', 'kecamatan', 'kabupaten', 'province', 'year', 'kernel_mode', 'radius_km', 'local_hotspots',
    'kernel_density_per_km2', 'population_2020', 'pm25_2019_historical_ug_m3', 'pm25_2026_model_ug_m3', 'pm25_2026_percentile',
    'model_extrapolation', 'priority_population', 'mean_index_z', 'cluster']];
  for (const i of currentIds()) {
    const z = overview.zones[i], r = scenario.indicators[i];
    rows.push([z.id, z.name, z.regency, PROVINCE_NAMES[z.province], year, mode, radius, z.counts[year === 2019 ? 0 : 1],
      r.density, Math.round(z.population), year === 2019 ? z.pm25.toFixed(3) : '', year === 2026 ? r.exposure : '',
      year === 2026 ? percentiles[i].toFixed(2) : '', year === 2026 ? r.extrapolated : '', r.priorityPeople, r.index ?? '', String.fromCharCode(65 + r.cluster)]);
  }
  const quote = v => { const s = String(v); const safe = typeof v === 'string' && /^[=+@\t\r-]/.test(s) ? `'${s}` : s; return `"${safe.replaceAll('"', '""')}"`; };
  download(`kecamatan-${year}-${mode}-${radius}-${region}.csv`, '﻿' + rows.map(r => r.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function geojson() {
  const { year, scenario, mode, radius, region } = state;
  const features = provinceIds(region).map(id => {
    const grid = geography.grids[id], data = scenario.provinces[id];
    const convert = ([x, y]) => lonLat(grid.x0 + x * grid.step, grid.y0 - y * grid.step).map(v => Number(v.toFixed(7)));
    return { type: 'Feature', id, properties: { province: PROVINCE_NAMES[id], year, kernel: mode, radius_km: radius,
      threshold_z: overview.config.threshold, cell_km: overview.config.cellKm, grid_area_km2: data.priorityArea, estimated_people_2020: data.priorityPeople },
    geometry: { type: 'MultiPolygon', coordinates: data.priorityShapes.map(poly => poly.map(ring => ring.map(convert).reverse())) } };
  });
  download(`zona-prioritas-${year}-${mode}-${radius}-${region}.geojson`, JSON.stringify({ type: 'FeatureCollection', features }), 'application/geo+json');
}

/* ================================================================ boot */
function renderAll() {
  renderStatus();
  renderFindings();
  renderStepper(process.step);
  renderSeasons();
  renderPeat();
  renderSmoke();
  renderRecipe();
  if (state) { renderMapPanel(); renderPriority(); }
}
async function start() {
  try {
    const [o, g, v, s, s19, s26, basemap] = await Promise.all(['data/overview.json', 'data/geography.json', 'data/validation.json', 'data/stats.json',
      'data/scenario-2019-count-100.json', 'data/scenario-2026-count-100.json', 'data/basemap.json'].map(readJSON));
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

setTheme(store.get('peat-theme', ''));
setMode(store.get('peat-mode', 'story'));
applyLanguage(store.get('peat-dashboard-language', 'en'));
el('language').addEventListener('change', e => { applyLanguage(e.target.value); store.set('peat-dashboard-language', language); });
if (location.hash) { const i = slides.findIndex(s => `#${s.id}` === location.hash); if (i > 0) requestAnimationFrame(() => slides[i].scrollIntoView()); }
setCurrent(Math.max(0, slides.findIndex(s => `#${s.id}` === location.hash)));
start();
