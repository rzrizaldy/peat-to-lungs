// Recommendation slide (#budget): where next season's prevention budget should go.
// Reads data/plan.json (wind-aware MILP + Pareto frontier from the coursework analysis) and data/atlas-bounds.json.
// Pick a point on the frontier; the map, ranked list and numbers follow.
const $ = id => document.getElementById(id);
const root = document.documentElement;
const readJSON = async name => { const r = await fetch(new URL(`data/${name}`, import.meta.url)); if (!r.ok) throw new Error(name); return r.json(); };
const T = {
  lede: ['Say there is money to protect 20% of the land that burns most. An optimiser searched every combination for the regencies whose fires, carried by the 2026 wind, send the most smoke into people’s lungs. The health-first plan cuts the smoke people breathe by {h} µg/m³, {x}× more than simply funding the places with the most fire. <b>I recommend the balanced plan</b>: it keeps {k}% of that health benefit and also cuts {e}% of fire emissions.',
    'Misalkan ada dana untuk melindungi 20% lahan yang paling sering terbakar. Optimasi mencari semua kombinasi untuk kabupaten/kota yang apinya, terbawa angin 2026, paling banyak mengirim asap ke paru-paru warga. Rencana kesehatan-dulu mengurangi asap yang dihirup warga {h} µg/m³, {x}× lebih banyak daripada sekadar mendanai daerah dengan api terbanyak. <b>Saya merekomendasikan rencana seimbang</b>: mempertahankan {k}% manfaat kesehatan itu sekaligus memangkas {e}% emisi api.'],
  pick: ['Choose a plan', 'Pilih rencana'],
  pickNote: ['Each dot on the line is the best possible plan for a given emissions target. Dots off the line are simple rules.', 'Setiap titik di garis adalah rencana terbaik untuk target emisi tertentu. Titik di luar garis adalah aturan sederhana.'],
  x: ['Fire emissions avoided (% of FRP)', 'Emisi api dihindari (% FRP)'],
  y: ['Smoke avoided (µg/m³)', 'Asap dihindari (µg/m³)'],
  health: ['Health first', 'Kesehatan dulu'], balanced: ['Balanced (recommended)', 'Seimbang (disarankan)'], carbon: ['Emissions first', 'Emisi dulu'],
  'Most fire': ['Most fire', 'Api terbanyak'], 'Largest area': ['Largest area', 'Area terluas'], 'Most emissions (FRP)': ['Most emissions', 'Emisi terbanyak'],
  regencies: ['regencies to fund', 'kabupaten/kota didanai'],
  smoke: ['µg/m³ smoke avoided', 'µg/m³ asap dihindari'],
  emis: ['of fire emissions avoided', 'emisi api dihindari'],
  vsFire: ['vs {v} if the money followed the most fire', 'vs {v} bila uang mengikuti api terbanyak'],
  top: ['Fund first', 'Danai lebih dulu'],
  protects: ['protects {c}', 'melindungi {c}'],
  benefit: ['{p} of the benefit', '{p} manfaat'],
  compare: ['Smoke avoided by each way of spending the same budget', 'Asap dihindari untuk tiap cara membelanjakan anggaran yang sama'],
  plan: ['This plan', 'Rencana ini'],
  source: ['Method: wind-aware smoke model (local 100 km kernel + ERA5 plume, calibrated on Sept 2019 PM₂.₅); prevention assumed to halve a regency’s fire; budget = 20% of heavy-fire land; no province above 35%. Solved with HiGHS; Pareto frontier by the ε-constraint method. Sumatra and Kalimantan only, where the model was calibrated.',
    'Metode: model asap dengan angin (kernel lokal 100 km + plume ERA5, dikalibrasi pada PM₂.₅ Sept 2019); pencegahan diasumsikan memotong separuh api kabupaten; anggaran = 20% lahan api berat; tak ada provinsi di atas 35%. Diselesaikan dengan HiGHS; frontier Pareto dengan metode ε-constraint. Hanya Sumatra dan Kalimantan, tempat model dikalibrasi.'],
};
let lang = root.lang === 'id' ? 'id' : 'en';
const t = (k, v = {}) => (T[k]?.[lang === 'id' ? 1 : 0] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const nf = (v, d = 0) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const TEAL = '#0f766e', INK = '#16211b', MUTED = '#4b5a51', LINE = '#c9d1c5';
let plan, bounds, regs, sel = 0;

function label(i) {
  const n = plan.frontier_plans.length;
  return i === 0 ? t('health') : i === plan.knee_index ? t('balanced') : i === n - 1 ? t('carbon') : '';
}

function renderLede() {
  const f = plan.frontier_plans, h = f[0], k = f[plan.knee_index], mf = plan.simple['Most fire'].health_ugm3;
  $('pb-lede').innerHTML = t('lede', { h: nf(h.health_ugm3, 1), x: nf(h.health_ugm3 / mf, 1), k: nf(k.health_ugm3 / h.health_ugm3 * 100), e: nf(k.emissions_cut_pct, 0) });
}

function renderPareto() {
  const svg = $('pb-pareto'), W = 420, H = 260, L = 46, R = 14, Tp = 14, B = 38;
  const f = plan.frontier_plans, simple = Object.entries(plan.simple);
  const xs = [...f.map(z => z.emissions_cut_pct), ...simple.map(([, v]) => v.emissions_cut_pct)];
  const x0 = Math.floor(Math.min(...xs) - 1), x1 = Math.ceil(Math.max(...xs) + 1), y1 = Math.ceil(Math.max(...f.map(z => z.health_ugm3)) + 0.6);
  const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => Tp + (1 - v / y1) * (H - Tp - B);
  let s = `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${INK}" stroke-width=".8"/><line x1="${L}" y1="${Tp}" x2="${L}" y2="${H - B}" stroke="${INK}" stroke-width=".8"/>`;
  for (let v = 0; v <= y1; v += 2) s += `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="pb-tick">${nf(v)}</text><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${LINE}" stroke-width=".5"/>`;
  for (let v = x0; v <= x1; v += 2) s += `<text x="${X(v)}" y="${H - B + 15}" text-anchor="middle" class="pb-tick">${nf(v)}%</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="pb-axis">${t('x')}</text>`;
  s += `<text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" text-anchor="middle" class="pb-axis">${t('y')}</text>`;
  s += `<polyline fill="none" stroke="${INK}" stroke-width="1.6" points="${f.map(z => `${X(z.emissions_cut_pct)},${Y(z.health_ugm3)}`).join(' ')}"/>`;
  const marks = { 'Most fire': ['#c8503e', 's'], 'Largest area': ['#d69e2e', 't'], 'Most emissions (FRP)': ['#6f58a8', 'd'] };
  for (const [name, v] of simple) {
    const cx = X(v.emissions_cut_pct), cy = Y(v.health_ugm3), [c, m] = marks[name];
    s += m === 's' ? `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="${c}"/>` : m === 't' ? `<path d="M${cx} ${cy - 6}l6 10h-12z" fill="${c}"/>` : `<path d="M${cx} ${cy - 6}l6 6-6 6-6-6z" fill="${c}"/>`;
    const right = cx > W - 110;
    s += `<text x="${right ? cx - 9 : cx + 9}" y="${cy + 4}" text-anchor="${right ? 'end' : 'start'}" class="pb-lab" fill="${c}">${t(name)}</text>`;
  }
  f.forEach((z, i) => {
    const cx = X(z.emissions_cut_pct), cy = Y(z.health_ugm3), on = i === sel, lab = label(i);
    s += `<g class="pb-pt" data-i="${i}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${lab || `Plan ${i + 1}`}: ${nf(z.health_ugm3, 1)} µg/m³, ${nf(z.emissions_cut_pct, 1)}%">`
      + `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${on ? 7.5 : 5}" fill="${on ? TEAL : '#fff'}" stroke="${on ? TEAL : INK}" stroke-width="1.8"/></g>`;
    if (lab) s += `<text x="${cx}" y="${cy - 13}" text-anchor="${i === 0 ? 'start' : i === f.length - 1 ? 'end' : 'middle'}" class="pb-lab" fill="${i === plan.knee_index ? TEAL : INK}" font-weight="700">${lab}</text>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = s;
}

function renderBars() {
  const z = plan.frontier_plans[sel];
  const rows = [[t('plan'), z.health_ugm3, TEAL], ...Object.entries(plan.simple).map(([k, v]) => [t(k), v.health_ugm3, '#a8b0a4'])];
  const max = Math.max(...rows.map(r => r[1]));
  $('pb-bars').innerHTML = `<p class="pb-cap">${t('compare')}</p>` + rows.map(([n, v, c]) => `<div class="pb-bar"><span>${n}</span><i><b style="width:${v / max * 100}%;background:${c}"></b></i><em>${nf(v, 1)}</em></div>`).join('');
}

function renderHead() {
  const z = plan.frontier_plans[sel], mf = plan.simple['Most fire'].health_ugm3;
  $('pb-head').innerHTML = `<div><strong>${z.n}</strong><small>${t('regencies')}</small></div>`
    + `<div><strong style="color:${TEAL}">${nf(z.health_ugm3, 1)}</strong><small>${t('smoke')}<br>${t('vsFire', { v: nf(mf, 1) })}</small></div>`
    + `<div><strong>${nf(z.emissions_cut_pct, 1)}%</strong><small>${t('emis')}</small></div>`;
}

function renderList() {
  const z = plan.frontier_plans[sel];
  $('pb-list-title').textContent = t('top');
  $('pb-list').innerHTML = z.ids.slice(0, 8).map((id, i) => {
    const r = regs.get(id), pv = provName.get(r.province);
    return `<li><b>${r.name}</b> <span>${pv}</span><em>${t('protects', { c: plan.protects[id] ?? '—' })} · ${t('benefit', { p: `${nf(z.share[i] * 100, 0)}%` })}</em><i style="width:${z.share[i] / z.share[0] * 100}%"></i></li>`;
  }).join('');
}

const provName = new Map();
function renderMap() {
  const c = $('pb-map'), box = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const W = box.width, H = box.height;
  if (!W) return;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const lon0 = 94.8, lon1 = 119.6, lat0 = -6.4, lat1 = 6.2, k = Math.min(W / (lon1 - lon0), H / (lat1 - lat0));
  const ox = (W - (lon1 - lon0) * k) / 2, oy = (H - (lat1 - lat0) * k) / 2;
  const P = (lo, la) => [ox + (lo - lon0) * k, oy + (lat1 - la) * k];
  const chosen = new Map(plan.frontier_plans[sel].ids.map((id, i) => [id, i]));
  for (const r of bounds.regencies) {
    const isl = r.province[2];
    if (!['1', '2', '6'].includes(isl)) continue;
    g.beginPath();
    for (const ring of r.rings) ring.forEach((v, i) => { if (i % 2) return; const [x, y] = P(ring[i] / 1000, ring[i + 1] / 1000); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.fillStyle = chosen.has(r.id) ? TEAL : '#e6eae3'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 0.5; g.stroke();
  }
  g.font = '700 11px "Public Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  plan.frontier_plans[sel].ids.slice(0, 8).forEach((id, i) => {
    const r = regs.get(id), [x, y] = P((r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2);
    g.fillStyle = INK; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 0.5);
  });
  g.font = '600 11px "Public Sans", sans-serif'; g.fillStyle = MUTED;
  for (const [n, lo, la] of [['Palembang', 104.76, -2.99], ['Pontianak', 109.34, -0.03], ['Banjarmasin', 114.59, -3.32], ['Pekanbaru', 101.45, 0.51], ['Bandar Lampung', 105.26, -5.43]]) {
    const [x, y] = P(lo, la); g.fillStyle = INK; g.fillRect(x - 2, y - 2, 4, 4); g.fillStyle = MUTED; g.textAlign = 'left'; g.fillText(n, x + 5, y - 7);
  }
}

function render() { renderLede(); renderPareto(); renderBars(); renderHead(); renderList(); renderMap(); $('pb-source').textContent = t('source'); $('pb-pick').textContent = t('pick'); $('pb-pick-note').textContent = t('pickNote'); }

function choose(i) { sel = i; renderPareto(); renderBars(); renderHead(); renderList(); renderMap(); }

$('pb-pareto').addEventListener('click', e => { const p = e.target.closest('.pb-pt'); if (p) choose(Number(p.dataset.i)); });
$('pb-pareto').addEventListener('keydown', e => { const p = e.target.closest('.pb-pt'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(Number(p.dataset.i)); } });
new MutationObserver(() => { lang = root.lang === 'id' ? 'id' : 'en'; if (plan) render(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });
new ResizeObserver(() => { if (plan) renderMap(); }).observe($('pb-map'));

try {
  [plan, bounds] = await Promise.all([readJSON('plan.json'), readJSON('atlas-bounds.json')]);
  regs = new Map(bounds.regencies.map(r => [r.id, r]));
  bounds.provinces.forEach(p => provName.set(p.id, p.name));
  sel = plan.knee_index ?? 0;
  render();
} catch (err) {
  console.error(err);
  $('budget').querySelector('.pb-grid').hidden = true;
}
