// Two animated method explainers for a general audience.
//   #did  — difference-in-differences: did peat change more than other land? Every region with a lot of peat,
//           with an all-regions chart (estimate and 95% range) and a one-line answer per island.
//   #wind — how the smoke model uses ERA5 wind: nearby spread, wind drift, then which fires reach cities.
// Reads data/methods.json (tools/export-methods.py), data/atlas-bounds.json and data/plan.json.
const $ = id => document.getElementById(id);
const root = document.documentElement;
const readJSON = async name => { const r = await fetch(new URL(`data/${name}`, import.meta.url)); if (!r.ok) throw new Error(name); return r.json(); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = {
  // DiD
  d1: ['Other land', 'Lahan lain'],
  d1b: ['Fire on land without peat went from {a} to {b} per 100 km².', 'Api di lahan tanpa gambut berubah dari {a} ke {b} per 100 km².'],
  d2: ['Peat', 'Gambut'],
  d2b: ['On peat it went from {a} to {b}.', 'Di gambut berubah dari {a} ke {b}.'],
  d3: ['If peat had changed like other land', 'Jika gambut berubah seperti lahan lain'],
  d3b: ['If peat had only followed the same trend, it would have reached {c}.', 'Kalau gambut hanya mengikuti tren yang sama, angkanya {c}.'],
  d4: ['The gap is the peat effect', 'Selisihnya adalah efek gambut'],
  d4up: ['Peat gained <b>{g} more</b> fire detections per 100 km² than other land.', 'Gambut mendapat <b>{g} lebih banyak</b> titik api per 100 km² dibanding lahan lain.'],
  d4down: ['Peat lost <b>{g} more</b> fire detections per 100 km² than other land.', 'Gambut kehilangan <b>{g} lebih banyak</b> titik api per 100 km² dibanding lahan lain.'],
  d4none: ['The gap is small ({g}) and could be chance: here peat behaved like other land.', 'Selisihnya kecil ({g}) dan bisa kebetulan: di sini gambut berperilaku seperti lahan lain.'],
  dNote: ['Averages of 5 km cells (peat ≥ 50% vs < 5%). The full model on all {n} cells gives {b} per 100 km² (95% range {l} to {h}). It shows how peat behaved, not which policy caused it.',
    'Rata-rata sel 5 km (gambut ≥ 50% vs < 5%). Model lengkap dengan {n} sel memberi {b} per 100 km² (rentang 95% {l} sampai {h}). Ini menunjukkan perilaku gambut, bukan kebijakan mana penyebabnya.'],
  ansHead: ['Answer: it depends on the island.', 'Jawabannya: tergantung pulaunya.'],
  ansAll: ['On Kalimantan, peat made 2026 <b>worse</b>. On Sumatra, peat fire fell <b>the most</b>. In Papua, peat made <b>no clear difference</b>.',
    'Di Kalimantan, gambut membuat 2026 <b>lebih buruk</b>. Di Sumatra, api di gambut <b>paling banyak turun</b>. Di Papua, gambut <b>tidak membuat beda yang jelas</b>.'],
  ansUp: ['{p}: <b>yes, it was the peat</b>, +{g} per 100 km² beyond the bad year.', '{p}: <b>ya, karena gambut</b>, +{g} per 100 km² di luar tahun yang buruk.'],
  ansDown: ['{p}: <b>peat improved the most</b>, −{g} per 100 km² compared with other land.', '{p}: <b>gambut paling membaik</b>, −{g} per 100 km² dibanding lahan lain.'],
  ansNone: ['{p}: <b>no clear peat effect</b>. Fire changed about as much on peat as on other land.', '{p}: <b>tidak ada efek gambut yang jelas</b>. Api berubah kurang lebih sama di gambut dan lahan lain.'],
  pick: ['Region', 'Wilayah'],
  fTitle: ['Every peat region: extra change on peat, per 100 km²', 'Semua wilayah gambut: perubahan tambahan di gambut, per 100 km²'],
  fWorse: ['peat worse', 'gambut memburuk'], fBetter: ['peat better', 'gambut membaik'], fNone: ['no clear difference', 'tidak jelas'],
  fIsland: ['Whole island', 'Seluruh pulau'],
  fNote: ['Dots: estimate; lines: 95% range. Lines crossing 0 mean no clear difference. Island rows compare peat and other land inside the same regency. Checks: the effect grows with the share of peat in Kalimantan (+{k0} → +{k1}) and Sumatra ({s0} → {s1}); land just outside peat moved far less ({kp} in Kalimantan, about 0 in Sumatra).',
    'Titik: perkiraan; garis: rentang 95%. Garis yang melewati 0 berarti tidak ada beda yang jelas. Baris pulau membandingkan gambut dan lahan lain di kabupaten yang sama. Cek: efeknya membesar seiring porsi gambut di Kalimantan (+{k0} → +{k1}) dan Sumatra ({s0} → {s1}); lahan tepat di luar gambut bergerak jauh lebih kecil ({kp} di Kalimantan, sekitar 0 di Sumatra).'],
  'Central Kalimantan': ['Central Kalimantan', 'Kalimantan Tengah'], 'West Kalimantan': ['West Kalimantan', 'Kalimantan Barat'],
  Riau: ['Riau', 'Riau'], Jambi: ['Jambi', 'Jambi'], 'South Sumatra': ['South Sumatra', 'Sumatera Selatan'],
  'Ogan Komering Ilir': ['Ogan Komering Ilir (regency)', 'Ogan Komering Ilir (kabupaten)'], Papua: ['Papua', 'Papua'], 'West Papua': ['West Papua', 'Papua Barat'],
  Kalimantan: ['Kalimantan', 'Kalimantan'], Sumatra: ['Sumatra', 'Sumatera'],
  dAxis: ['Fire detections per 100 km²', 'Titik api per 100 km²'],
  dWould: ['expected', 'perkiraan'],
  // wind
  w1: ['Nearby, smoke spreads every way', 'Di dekat api, asap menyebar ke segala arah'],
  w1b: ['Within about 100 km, smoke drifts in all directions with shifting land and sea breezes.', 'Dalam sekitar 100 km, asap bergerak ke segala arah mengikuti angin darat dan laut.'],
  w2: ['Further out, the wind carries it', 'Lebih jauh, angin yang membawanya'],
  w2b: ['ERA5 wind for Aug–Oct 2026 blew from the south-east, then turned north-east past the equator. Smoke rides it for about 300 km.', 'Angin ERA5 Agustus–Oktober 2026 bertiup dari tenggara, lalu berbelok ke timur laut setelah khatulistiwa. Asap terbawa sekitar 300 km.'],
  w3: ['Which fires reach cities?', 'Api mana yang sampai ke kota?'],
  w3b: ['Fires upwind of big cities matter most. The shaded areas are where the prevention plan at the end of this story starts.', 'Api di hulu angin kota besar paling penting. Area berarsir adalah titik awal rencana pencegahan di akhir cerita ini.'],
  wNote: ['Adding wind made the model a little better at places it had never seen ({a} → {b}). Rain and how high the smoke rises are not included yet.',
    'Menambah angin membuat model sedikit lebih baik di tempat yang belum pernah dilihatnya ({a} → {b}). Hujan dan ketinggian asap belum dimasukkan.'],
  play: ['Play', 'Putar'], replay: ['Replay', 'Ulangi'], pause: ['Pause', 'Jeda'],
};
let lang = root.lang === 'id' ? 'id' : 'en';
const t = (k, v = {}) => (T[k]?.[lang === 'id' ? 1 : 0] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const nf = (v, d = 0) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const css = n => getComputedStyle(root).getPropertyValue(n).trim();

// Step player shared by both slides: numbered steps, autoplay once when the slide is in view.
function player(stepsEl, playEl, n, onStep, ms) {
  let step = 0, timer = null;
  const set = i => { step = i; for (const b of stepsEl.querySelectorAll('button')) b.setAttribute('aria-current', String(Number(b.dataset.i) === i)); onStep(i); };
  const stop = () => { clearInterval(timer); timer = null; playEl.textContent = t(step === n - 1 ? 'replay' : 'play'); };
  const play = () => {
    if (step === n - 1) set(0);
    playEl.textContent = t('pause');
    timer = setInterval(() => { if (step < n - 1) set(step + 1); if (step === n - 1) stop(); }, ms);
  };
  stepsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { stop(); set(Number(b.dataset.i)); } });
  playEl.addEventListener('click', () => (timer ? stop() : play()));
  return { set, play, stop, get step() { return step; }, label: () => { if (!timer) playEl.textContent = t(step === n - 1 ? 'replay' : 'play'); } };
}
function onceVisible(el, fn) {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold: 0.25 });
  io.observe(el);
}

/* ---------------- difference-in-differences ---------------- */
let methods, didProv = 'Central Kalimantan', didPlayer;
const sgn = v => `${v < 0 ? '−' : v > 0 ? '+' : ''}${nf(Math.abs(v))}`;
const verdict = r => (r.p_wild < 0.05 ? (r.beta > 0 ? 'up' : 'down') : 'none');   // wild cluster bootstrap, 5%
function didSteps() {
  const d = methods.did[didProv], [n0, n1] = d.nonpeat, [p0, p1] = d.peat, c = p0 + (n1 - n0), v = verdict(d);
  const last = v === 'none' ? t('d4none', { g: sgn(d.gap) }) : t(d.gap >= 0 ? 'd4up' : 'd4down', { g: nf(Math.abs(d.gap)) });
  return [[t('d1'), t('d1b', { a: nf(n0), b: nf(n1) })], [t('d2'), t('d2b', { a: nf(p0), b: nf(p1) })],
    [t('d3'), t('d3b', { c: nf(c) })], [t('d4'), last]];
}
function renderDidSteps() {
  $('did-steps').innerHTML = didSteps().map(([h], i) => `<button type="button" data-i="${i}"><span>${i + 1}</span>${h}</button>`).join('');
}
function renderPicker() {
  const groups = ['Kalimantan', 'Sumatra', 'Papua'];
  $('did-prov').innerHTML = groups.map(g => `<optgroup label="${t(g)}">${Object.entries(methods.did).filter(([, r]) => r.island === g)
    .map(([k]) => `<option value="${k}" ${k === didProv ? 'selected' : ''}>${t(k)}</option>`).join('')}</optgroup>`).join('');
  $('did-pick-label').textContent = t('pick');
}
function renderAnswer() {
  const d = methods.did[didProv], v = verdict(d);
  const line = t(v === 'up' ? 'ansUp' : v === 'down' ? 'ansDown' : 'ansNone', { p: t(didProv), g: nf(Math.abs(d.gap)) });
  $('did-answer').innerHTML = `<b>${t('ansHead')}</b>${t('ansAll')}<span class="mx-answer-region">${line}</span>`;
}
function drawDid(step) {
  const d = methods.did[didProv], [n0, n1] = d.nonpeat, [p0, p1] = d.peat, c = p0 + (n1 - n0);
  const W = 460, H = 250, L = 50, R = 120, Tp = 14, B = 30;
  const top = Math.max(10, Math.ceil(Math.max(p0, p1, c, n0, n1) * 1.1 / 10) * 10);
  const X = i => L + i * (W - L - R), Y = v => Tp + (1 - v / top) * (H - Tp - B);
  const muted = css('--muted'), line = css('--line'), peat = css('--peat-2'), other = css('--moss'), ember = css('--ember-ink');
  let s = '';
  const tick = top <= 30 ? 5 : top <= 60 ? 10 : top <= 200 ? 50 : 100;
  for (let v = 0; v <= top; v += tick) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${line}" stroke-width=".6"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="mx-tick">${nf(v)}</text>`;
  s += `<text x="${X(0)}" y="${H - 8}" text-anchor="middle" class="mx-axis">2019</text><text x="${X(1)}" y="${H - 8}" text-anchor="middle" class="mx-axis">2026</text>`;
  s += `<text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" text-anchor="middle" class="mx-tick">${t('dAxis')}</text>`;
  const st = k => (step >= k ? 'on' : '') + (step === k ? ' new' : '');      // only the newest piece animates
  const seg = (a, b, col, k, dash = '') => `<g class="mx-line ${st(k)} ${dash ? 'dashed' : ''}"><line x1="${X(0)}" y1="${Y(a)}" x2="${X(1)}" y2="${Y(b)}" stroke="${col}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : 'pathLength="1"'}/><circle cx="${X(0)}" cy="${Y(a)}" r="5" fill="${col}"/><circle cx="${X(1)}" cy="${Y(b)}" r="5" fill="${col}"/></g>`;
  // end labels, nudged apart when they would overlap
  const labs = [[Y(n1), other, `${t('d1')} ${nf(n1)}`, 0], [Y(p1), peat, `${t('d2')} ${nf(p1)}`, 1], [Y(c), muted, `${t('dWould')} ${nf(c)}`, 2]].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < labs.length; i++) if (labs[i][0] - labs[i - 1][0] < 14) labs[i][0] = labs[i - 1][0] + 14;
  s += seg(n0, n1, other, 0) + seg(p0, p1, peat, 1) + seg(p0, c, muted, 2, '6 5');
  for (const [y, col, txt, k] of labs) s += `<text x="${X(1) + 10}" y="${y + 4}" class="mx-lab mx-fade ${st(k)}" fill="${col}">${txt}</text>`;
  const y1 = Y(p1), y2 = Y(c), xb = X(1) - 14;
  s += `<g class="mx-fade ${st(3)}"><path d="M${xb + 6} ${y1}H${xb}V${y2}H${xb + 6}" fill="none" stroke="${ember}" stroke-width="2"/>
    <text x="${xb - 8}" y="${Math.abs(y1 - y2) < 16 ? Math.min(y1, y2) - 10 : (y1 + y2) / 2 + 5}" text-anchor="end" class="mx-gap" fill="${ember}">${sgn(d.gap)}</text></g>`;
  $('did-chart').innerHTML = s;
  $('did-text').innerHTML = didSteps()[step][1];
  $('did-note').textContent = t('dNote', { n: nf(d.cells), b: sgn(d.beta), l: sgn(d.ci95[0]), h: sgn(d.ci95[1]) });
}
// all regions at once: estimate and 95% range; the island rows use the within-regency comparison
function drawForest() {
  const rows = [...Object.entries(methods.did).map(([k, r]) => ({ k, r, label: t(k), island: false })),
    ...['Kalimantan', 'Sumatra', 'Papua'].map(k => ({ k, r: methods.islands[k], label: `${t('fIsland')}: ${t(k)}`, island: true }))];
  const W = 460, rowH = 18, Tp = 6, L = 168, R = 14, H = Tp + rows.length * rowH + 30, lo = -200, hi = 250;
  const X = v => L + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - L - R);
  const col = r => (verdict(r) === 'up' ? css('--alarm') : verdict(r) === 'down' ? css('--forest') : css('--faint'));
  let s = '';
  for (const v of [-200, -100, 0, 100, 200]) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${Tp}" y2="${H - 26}" stroke="${v ? css('--line') : css('--ink')}" stroke-width="${v ? .6 : 1}"/><text x="${X(v)}" y="${H - 14}" text-anchor="middle" class="mx-tick">${sgn(v)}</text>`;
  s += `<text x="${X(-100)}" y="${H - 2}" text-anchor="middle" class="mx-tick" fill="${css('--forest')}">← ${t('fBetter')}</text><text x="${X(150)}" y="${H - 2}" text-anchor="middle" class="mx-tick" fill="${css('--alarm')}">${t('fWorse')} →</text>`;
  rows.forEach(({ k, r, label, island }, i) => {
    const y = Tp + i * rowH + rowH / 2 + (island ? 8 : 0), c = col(r), [a, b] = r.ci95;
    const sel = !island && k === didProv;
    if (island && i === rows.length - 3) s += `<line x1="8" x2="${W - R}" y1="${y - rowH / 2 - 2}" y2="${y - rowH / 2 - 2}" stroke="${css('--line')}"/>`;
    s += `<g class="mx-row ${island ? '' : 'pick'}" data-k="${island ? '' : k}" ${island ? '' : 'tabindex="0" role="button"'}>
      ${sel ? `<rect x="2" y="${y - rowH / 2}" width="${W - 4}" height="${rowH}" fill="${css('--sunk')}"/>` : ''}
      <text x="${L - 10}" y="${y + 4}" text-anchor="end" class="mx-flab" font-weight="${island || sel ? 700 : 500}">${label}</text>
      <line x1="${X(a)}" x2="${X(b)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2"/>
      ${a < lo ? `<path d="M${X(lo)} ${y}l6 -4v8z" fill="${c}"/>` : ''}${b > hi ? `<path d="M${X(hi)} ${y}l-6 -4v8z" fill="${c}"/>` : ''}
      <circle cx="${X(r.beta)}" cy="${y}" r="${island ? 5.5 : 4.5}" fill="${c}"/></g>`;
  });
  const svg = $('did-forest'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = s;
  $('did-forest-title').textContent = t('fTitle');
  const K = methods.islands.Kalimantan, S = methods.islands.Sumatra;
  $('did-forest-note').textContent = t('fNote', { k0: nf(K.dose[0]), k1: nf(K.dose[3]), s0: sgn(S.dose[0]), s1: sgn(S.dose[3]), kp: sgn(K.placebo) });
}
function choose(k) {
  didProv = k; renderPicker(); renderAnswer(); renderDidSteps(); drawForest();
  didPlayer.stop(); didPlayer.set(0); if (!reduced) didPlayer.play();
}
function initDid() {
  renderPicker(); renderAnswer(); renderDidSteps(); drawForest();
  didPlayer = player($('did-steps'), $('did-play'), 4, drawDid, 2200);
  didPlayer.set(reduced ? 3 : 0);
  $('did-prov').addEventListener('change', e => choose(e.target.value));
  $('did-forest').addEventListener('click', e => { const g = e.target.closest('.mx-row.pick'); if (g) choose(g.dataset.k); });
  $('did-forest').addEventListener('keydown', e => { const g = e.target.closest('.mx-row.pick'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(g.dataset.k); } });
  if (!reduced) onceVisible($('did'), () => { didPlayer.set(0); didPlayer.play(); });
}

/* ---------------- wind ---------------- */
const LON0 = 94.8, LON1 = 119.6, LAT0 = -6.4, LAT1 = 6.6;
const CITIES = [['Palembang', 104.76, -2.99], ['Pekanbaru', 101.45, 0.51], ['Jambi', 103.61, -1.61], ['Pontianak', 109.34, -0.03], ['Palangka Raya', 113.92, -2.21], ['Banjarmasin', 114.59, -3.32], ['Singapore', 103.82, 1.35], ['Kuala Lumpur', 101.69, 3.14], ['Kuching', 110.34, 1.55]];
let bounds, plan, windStep = 0, windPlayer, fires = [], upwind = new Set();
let base, over, geo, running = false, puffs = [], parts = [], last = 0, sprite;

function windAt(lo, la) {        // bilinear on the 1° ERA5 grid (lats run north → south)
  const w = methods.wind, i = (lo - w.lons[0]), j = (w.lats[0] - la);
  const i0 = Math.max(0, Math.min(w.lons.length - 2, Math.floor(i))), j0 = Math.max(0, Math.min(w.lats.length - 2, Math.floor(j)));
  const fx = Math.max(0, Math.min(1, i - i0)), fy = Math.max(0, Math.min(1, j - j0));
  const g = (a) => a[j0][i0] * (1 - fx) * (1 - fy) + a[j0][i0 + 1] * fx * (1 - fy) + a[j0 + 1][i0] * (1 - fx) * fy + a[j0 + 1][i0 + 1] * fx * fy;
  return [g(w.u), g(w.v)];
}
function sizeWind() {
  const box = base.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const W = box.width, H = box.height;
  if (!W) return false;
  for (const c of [base, over]) { c.width = W * dpr; c.height = H * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
  const k = Math.min(W / (LON1 - LON0), H / (LAT1 - LAT0));
  geo = { W, H, k, ox: (W - (LON1 - LON0) * k) / 2, oy: (H - (LAT1 - LAT0) * k) / 2 };
  return true;
}
const P = (lo, la) => [geo.ox + (lo - LON0) * geo.k, geo.oy + (LAT1 - la) * geo.k];
function drawBase() {
  const g = base.getContext('2d'), { W, H } = geo;
  g.clearRect(0, 0, W, H);
  for (const r of bounds.regencies) {
    if (!['1', '2', '6'].includes(r.province[2])) continue;
    g.beginPath();
    for (const ring of r.rings) for (let i = 0; i < ring.length; i += 2) { const [x, y] = P(ring[i] / 1000, ring[i + 1] / 1000); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.fillStyle = windStep === 2 && upwind.has(r.id) ? 'rgba(15,118,110,.55)' : css('--map-land'); g.fill();
    g.strokeStyle = css('--map-line'); g.lineWidth = 0.4; g.stroke();
  }
}

function makeSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(78,66,58,.42)'); gr.addColorStop(.5, 'rgba(78,66,58,.18)'); gr.addColorStop(1, 'rgba(78,66,58,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function resetParticles() {
  const n = innerWidth < 760 ? 350 : 900;
  parts = Array.from({ length: n }, () => ({ lo: LON0 + Math.random() * (LON1 - LON0), la: LAT0 + Math.random() * (LAT1 - LAT0), age: Math.random() * 80 }));
}
function emit(dt) {
  const maxP = innerWidth < 760 ? 320 : 900;
  for (const f of fires) {
    f.acc += f.rate * dt;
    while (f.acc > 1 && puffs.length < maxP) {
      f.acc -= 1;
      const a = Math.random() * Math.PI * 2;
      puffs.push({ lo: f.lo, la: f.la, d: 0, a, src: f });
    }
  }
}
// One animation step. In step 0 puffs move outward in every direction and die at ~100 km;
// from step 1 they ride the wind (plus a little spread) and fade over ~300 km.
const DEG_KM = 111;
function step(dt) {
  const wind = windStep >= 1, life = wind ? 300 : 100, speed = 0.28, flow = 0.3;   // ° per (m/s) per second: smoke, wind streaks (visual time scale)
  emit(dt);
  for (const p of puffs) {
    if (wind) {
      const [u, v] = windAt(p.lo, p.la), spread = 0.35;
      p.lo += (u * speed + Math.cos(p.a) * spread * 0.25) * dt; p.la += (v * speed + Math.sin(p.a) * spread * 0.25) * dt;   // a little crosswind spread
    } else { p.lo += Math.cos(p.a) * 0.18 * dt; p.la += Math.sin(p.a) * 0.18 * dt; }
    p.d = Math.hypot(p.lo - p.src.lo, p.la - p.src.la) * DEG_KM;
    p.dead = p.d > life;
  }
  puffs = puffs.filter(p => !p.dead);
  if (wind) for (const q of parts) {
    const [u, v] = windAt(q.lo, q.la);
    q.plo = q.lo; q.pla = q.la; q.lo += u * flow * dt; q.la += v * flow * dt; q.age += 1;
    if (q.age > 90 || q.lo < LON0 || q.lo > LON1 || q.la < LAT0 || q.la > LAT1) { q.lo = LON0 + Math.random() * (LON1 - LON0); q.la = LAT0 + Math.random() * (LAT1 - LAT0); q.plo = q.lo; q.pla = q.la; q.age = 0; }
  }
}
function drawCities(g) {            // on top of the smoke, with a paper halo so names stay readable
  g.font = `${windStep === 2 ? 700 : 600} 11.5px "Public Sans", sans-serif`; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const small = geo.W < 500, minor = new Set(['Jambi', 'Kuching', 'Pekanbaru', 'Banjarmasin']);
  for (const [n, lo, la] of CITIES) {
    if (small && minor.has(n)) continue;          // phones: fewer labels
    const [x, y] = P(lo, la), right = x > geo.W - 90, tx = x + (right ? -7 : 7);
    g.fillStyle = css('--ink'); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x - 3, y - 3, 6, 6); g.fillRect(x - 3, y - 3, 6, 6);
    g.textAlign = right ? 'right' : 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(248,249,245,.9)'; g.strokeText(n, tx, y - 8); g.fillStyle = css('--ink'); g.fillText(n, tx, y - 8);
  }
}
let trail;           // offscreen layer for wind streaks so they can fade without erasing the smoke
function drawOver() {
  const g = over.getContext('2d'), { W, H } = geo;
  g.clearRect(0, 0, W, H);
  if (windStep >= 1) {
    const tg = trail.getContext('2d');
    tg.globalCompositeOperation = 'destination-out'; tg.fillStyle = 'rgba(0,0,0,.06)'; tg.fillRect(0, 0, W, H);
    tg.globalCompositeOperation = 'source-over'; tg.strokeStyle = 'rgba(47,111,115,.7)'; tg.lineWidth = 1.2; tg.beginPath();
    for (const q of parts) { if (q.plo == null) continue; const [a, b] = P(q.plo, q.pla), [c, d] = P(q.lo, q.la); tg.moveTo(a, b); tg.lineTo(c, d); }
    tg.stroke();
    g.drawImage(trail, 0, 0, W, H);
  }
  const life = windStep >= 1 ? 300 : 100, px = geo.k / DEG_KM;
  for (const p of puffs) {
    const [x, y] = P(p.lo, p.la), r = (14 + p.d * 0.35) * px + (geo.W < 500 ? 8 : 5);
    g.globalAlpha = Math.min(1, 1 - (p.d / life) ** 2);   // fade late so the plume reads as a trail
    g.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  for (const f of fires) {
    const [x, y] = P(f.lo, f.la);
    g.fillStyle = css('--ember'); g.beginPath(); g.arc(x, y, 2 + f.size * (0.8 + pulse * 0.4), 0, 7); g.fill();
  }
  if (windStep === 0) {          // the 100 km "nearby" ring around the biggest fire
    const f = fires[0], [x, y] = P(f.lo, f.la);
    g.strokeStyle = css('--ember-ink'); g.setLineDash([4, 4]); g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 100 / DEG_KM * geo.k, 0, 7); g.stroke(); g.setLineDash([]);
    g.font = '600 11px "Public Sans", sans-serif'; g.fillStyle = css('--ember-ink'); g.textAlign = 'center'; g.fillText('100 km', x, y - 100 / DEG_KM * geo.k - 6);
  }
  drawCities(g);
}
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  step(dt); drawOver();
  requestAnimationFrame(loop);
}
function setWindStep(i) {
  windStep = i; puffs = [];
  if (trail) trail.getContext('2d').clearRect(0, 0, trail.width, trail.height);
  $('wind-text').textContent = [t('w1b'), t('w2b'), t('w3b')][i];
  if (geo) drawBase();
  if (reduced && geo) { for (let k = 0; k < 160; k++) step(0.05); drawOver(); }
}
function renderWindSteps() {
  $('wind-steps').innerHTML = [t('w1'), t('w2'), t('w3')].map((h, i) => `<button type="button" data-i="${i}"><span>${i + 1}</span>${h}</button>`).join('');
  $('wind-note').textContent = t('wNote', { a: nf(methods.windModel.local_r2_out, 2), b: nf(methods.windModel.combined_r2_out, 2) });
}
function initWind() {
  base = $('wind-base'); over = $('wind-over'); sprite = makeSprite();
  const regs = bounds.regencies.filter(r => ['1', '2', '6'].includes(r.province[2]) && r.fires[1] > 0).sort((a, b) => b.fires[1] - a.fires[1]).slice(0, innerWidth < 760 ? 18 : 32);
  const fmax = regs[0].fires[1];
  fires = regs.map(r => ({ id: r.id, lo: (r.bbox[0] + r.bbox[2]) / 2, la: (r.bbox[1] + r.bbox[3]) / 2, size: Math.sqrt(r.fires[1] / fmax) * 3, rate: 0.6 + 4 * Math.sqrt(r.fires[1] / fmax), acc: Math.random() }));
  const knee = plan.frontier_plans[plan.knee_index];
  upwind = new Set(knee.ids.slice(0, 12));
  renderWindSteps();
  const fit = () => { if (sizeWind()) { trail = document.createElement('canvas'); trail.width = geo.W; trail.height = geo.H; resetParticles(); drawBase(); if (reduced) setWindStep(windStep); } };
  fit();
  new ResizeObserver(fit).observe(base);
  windPlayer = player($('wind-steps'), $('wind-play'), 3, setWindStep, 5200);
  windPlayer.set(reduced ? 1 : 0);
  if (reduced) return;
  new IntersectionObserver(es => {
    const vis = es.some(e => e.isIntersecting);
    if (vis && !running) { running = true; last = 0; requestAnimationFrame(loop); }
    if (!vis) running = false;
  }, { threshold: 0.15 }).observe($('wind'));
  onceVisible($('wind'), () => { windPlayer.set(0); windPlayer.play(); });
}

new MutationObserver(() => {
  lang = root.lang === 'id' ? 'id' : 'en';
  if (!methods) return;
  renderPicker(); renderAnswer(); renderDidSteps(); drawForest(); drawDid(didPlayer.step); didPlayer.label();
  if (bounds) { renderWindSteps(); windPlayer.set(windPlayer.step); windPlayer.label(); }
}).observe(root, { attributes: true, attributeFilter: ['lang'] });

try {
  methods = await readJSON('methods.json');
  initDid();
  [bounds, plan] = await Promise.all([readJSON('atlas-bounds.json'), readJSON('plan.json')]);
  initWind();
} catch (e) {
  console.warn('methods explainers unavailable', e);
}
