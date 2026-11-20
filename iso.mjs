// Isometric visuals: (1) a schematic cutaway that animates the analysis
// process, (2) a real-data "fire terrain" built from the kernel density grids.
import { resizeCanvas } from './map.mjs';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = () => {
  const s = getComputedStyle(document.documentElement);
  const v = name => s.getPropertyValue(name).trim();
  return { bg: v('--bg'), paper: v('--paper'), sunk: v('--sunk'), ink: v('--ink'), muted: v('--muted'), line: v('--line'), forest: v('--forest'),
    moss: v('--moss'), peat: v('--peat'), peat2: v('--peat-2'), mineral: v('--mineral'), canal: v('--canal'),
    ember: v('--ember'), hot: v('--ember-hot'), smoke: v('--smoke'), alarm: v('--alarm'), land: v('--map-land'),
    dark: document.documentElement.dataset.theme === 'dark'
      || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) };
};
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const shade = (h, f) => { const x = hex(h); return `rgb(${x.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`; };
const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) ** 3;

function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/* ================================================================ process */
export const PROCESS_STEPS = 7;

export function createProcess(canvas, { onStep } = {}) {
  const ctx = canvas.getContext('2d');
  const N = 24;
  const rand = rng(20190915);
  const wind = [0.82, -0.57];                       // toward the town (high i, low j)
  const dome = (i, j) => 1.15 * Math.exp(-((i - 9) ** 2 + (j - 17) ** 2) / 52);   // cut by the front-left face
  const isTown = (i, j) => i >= 17 && i <= 22 && j >= 2 && j <= 8;
  const isVillage = (i, j) => i >= 15 && i <= 17 && j >= 11 && j <= 13;
  const isCanal = (i, j) => (j === 17 && i >= 1 && i <= 16) || (i === 9 && j >= 9 && j <= 23);
  const peat = (i, j) => dome(i, j) > 0.22;
  const H = [];                                      // vertex heights (N+1)^2
  for (let i = 0; i <= N; i += 1) { H[i] = []; for (let j = 0; j <= N; j += 1) H[i][j] = 0.25 + dome(i, j) + 0.06 * Math.sin(i * 0.7) * Math.cos(j * 0.5); }
  const cells = [];
  for (let s = 0; s <= 2 * (N - 1); s += 1) for (let i = 0; i < N; i += 1) { const j = s - i; if (j >= 0 && j < N) cells.push([i, j]); }
  const info = {};
  for (const [i, j] of cells) {
    const key = i * N + j;
    const p = peat(i, j);
    info[key] = {
      peat: p, town: isTown(i, j), village: isVillage(i, j), canal: isCanal(i, j),
      tree: !isTown(i, j) && !isCanal(i, j) && !isVillage(i, j) && rand() < (p ? 0.92 : 0.55),
      cleared: p && !isCanal(i, j) && rand() < 0.58,
      bld: isTown(i, j) ? 0.25 + rand() * (0.9 - 0.08 * Math.hypot(i - 19.5, j - 5)) : isVillage(i, j) ? 0.14 + rand() * 0.08 : 0,
      jitter: rand(),
    };
  }
  const fires = cells.filter(([i, j]) => info[i * N + j].cleared && rand() < 0.42).map(([i, j]) => [i + 0.2 + rand() * 0.6, j + 0.2 + rand() * 0.6, rand()]);
  // Quartic kernel of the fire points on cell centres.
  const kde = {};
  let kmax = 0;
  for (const [i, j] of cells) {
    let v = 0;
    for (const [fx, fy] of fires) { const u = ((i + 0.5 - fx) ** 2 + (j + 0.5 - fy) ** 2) / 36; if (u < 1) v += (1 - u) ** 2; }
    kde[i * N + j] = v; kmax = Math.max(kmax, v);
  }
  const plume = {};
  let pmax = 0;
  for (const [i, j] of cells) {
    let v = 0;
    for (const [fx, fy] of fires) {
      const dx = i + 0.5 - fx, dy = j + 0.5 - fy;
      const along = dx * wind[0] + dy * wind[1];
      const across = -dx * wind[1] + dy * wind[0];
      if (along > -1.5) v += Math.exp(-(across ** 2) / (2 * (1.2 + 0.32 * Math.max(0, along)) ** 2)) * Math.exp(-Math.max(0, along) / 22);
    }
    plume[i * N + j] = v; pmax = Math.max(pmax, v);
  }
  // Schematic priority: same recipe as the analysis (z-scores, 0.3/0.3/0.4).
  const pop = key => info[key].town ? 3 + info[key].bld * 4 : info[key].village ? 2.2 : 0.2;
  const zf = values => { const m = values.reduce((a, b) => a + b) / values.length; const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) || 1; return v => (v - m) / sd; };
  const keys = cells.map(([i, j]) => i * N + j);
  const zk = zf(keys.map(k => kde[k])), zp = zf(keys.map(k => Math.log1p(pop(k)))), zs = zf(keys.map(k => plume[k]));
  const raw = keys.map(k => 0.3 * zk(kde[k]) + 0.3 * zp(Math.log1p(pop(k))) + 0.4 * zs(plume[k]));
  const zi = zf(raw);
  const priority = new Set(keys.filter((k, n) => zi(raw[n]) >= 1.5));

  let step = 0, from = 0, changed = 0, playing = false, timer = 0, visible = false, raf = 0;
  const particles = Array.from({ length: 90 }, () => ({ life: rand(), f: fires[Math.floor(rand() * fires.length)], s: rand() }));
  let geo;

  function layout() {
    const { width, height } = resizeCanvas(canvas);
    const a = Math.min(width / (2 * N + 2), height / (N + 6));
    geo = { width, height, a, b: a / 2, hz: a * 1.9, ox: width / 2, oy: height * 0.2 };
  }
  const P = (x, y, z) => [geo.ox + (x - y) * geo.a, geo.oy + (x + y) * geo.b - z * geo.hz];
  const vh = (x, y) => { const i = Math.max(0, Math.min(N, x)), j = Math.max(0, Math.min(N, y)); const i0 = Math.floor(i), j0 = Math.floor(j);
    const i1 = Math.min(N, i0 + 1), j1 = Math.min(N, j0 + 1), u = i - i0, w = j - j0;
    return H[i0][j0] * (1 - u) * (1 - w) + H[i1][j0] * u * (1 - w) + H[i0][j1] * (1 - u) * w + H[i1][j1] * u * w; };
  // Visibility of a layer introduced at step s: eases in when we move past s,
  // eases out when we move back before it, otherwise fully on/off.
  const at = (s, now) => {
    if (s <= step) return s > from ? ease((now - changed) / 900) : 1;
    return s <= from ? 1 - ease((now - changed) / 600) : 0;
  };

  function quad(pts, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(...pts[0]); for (let k = 1; k < pts.length; k += 1) ctx.lineTo(...pts[k]); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
  }

  function draw(now) {
    if (!geo) layout();
    const c = css();
    const { width, height } = geo;
    ctx.clearRect(0, 0, width, height);
    const sDrain = at(1, now), sFire = at(2, now), sKde = at(3, now), sSmoke = at(4, now), sPeople = at(5, now), sPri = at(6, now);
    const depth = 1.25;
    // side faces (cross-section) — front-right (i = N) and front-left (j = N)
    const strata = (x0, y0, x1, y1) => {
      const t0 = vh(x0, y0), t1 = vh(x1, y1);
      const pb0 = Math.min(t0, 0.25) - 0.05 - 0.55 * dome(Math.min(x0, N - 1), Math.min(y0, N - 1)) / 1.15, pb1 = Math.min(t1, 0.25) - 0.05 - 0.55 * dome(Math.min(x1, N - 1), Math.min(y1, N - 1)) / 1.15;
      quad([P(x0, y0, t0), P(x1, y1, t1), P(x1, y1, pb1), P(x0, y0, pb0)], c.peat);
      quad([P(x0, y0, pb0), P(x1, y1, pb1), P(x1, y1, -depth), P(x0, y0, -depth)], c.mineral);
      const drop = 0.08 + 0.42 * sDrain;
      const w0 = Math.max(pb0, t0 - drop * (dome(Math.min(x0, N - 1), Math.min(y0, N - 1)) > 0.22 ? 1 : 0.3)), w1 = Math.max(pb1, t1 - drop * (dome(Math.min(x1, N - 1), Math.min(y1, N - 1)) > 0.22 ? 1 : 0.3));
      ctx.beginPath(); ctx.moveTo(...P(x0, y0, w0)); ctx.lineTo(...P(x1, y1, w1)); ctx.strokeStyle = c.canal; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    };
    for (let i = 0; i < N; i += 1) strata(i, N, i + 1, N);
    for (let j = 0; j < N; j += 1) strata(N, j, N, j + 1);

    for (const [i, j] of cells) {
      const key = i * N + j, d = info[key];
      const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([x, y]) => P(x, y, H[x][y]));
      const slope = (H[i][j] + H[i][j + 1] - H[i + 1][j] - H[i + 1][j + 1]) * 1.6;
      let col;
      if (d.canal) col = mix(c.forest, c.canal, sDrain);
      else if (d.town) col = c.mineral;
      else if (d.village) col = mix(c.moss, c.mineral, 0.5);
      else if (d.peat) col = d.cleared ? mix(d.tree ? c.forest : c.moss, c.peat2, sDrain) : (d.tree ? c.forest : c.moss);
      else col = c.moss;
      quad(corners, shade(col.startsWith('#') ? col : rgbToHex(col), 1 + slope * 0.25), c.dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.22)');
      const [cx, cy] = P(i + 0.5, j + 0.5, vh(i + 0.5, j + 0.5));
      if (d.tree) {
        const scale = d.cleared ? 1 - sDrain : 1;
        if (scale > 0.02) {
          const h = geo.a * (0.95 + d.jitter * 0.5) * scale, w = geo.a * 0.42 * scale;
          ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy - h * 0.15); ctx.lineTo(cx - w, cy - h * 0.15); ctx.closePath();
          ctx.fillStyle = shade(c.forest, c.dark ? 1.05 : 0.82 + d.jitter * 0.2); ctx.fill();
        }
      }
      if (d.bld && sPeople > 0) {
        const h = d.bld * sPeople * geo.hz * 1.15, s = 0.34;
        const z0 = vh(i + 0.5, j + 0.5);
        const b = [[i + 0.5 - s, j + 0.5 - s], [i + 0.5 + s, j + 0.5 - s], [i + 0.5 + s, j + 0.5 + s], [i + 0.5 - s, j + 0.5 + s]].map(([x, y]) => P(x, y, z0));
        const t = b.map(([x, y]) => [x, y - h]);
        quad([b[1], b[2], t[2], t[1]], shade(c.paper, c.dark ? 0.9 : 0.86));
        quad([b[2], b[3], t[3], t[2]], shade(c.paper, c.dark ? 0.75 : 0.72));
        quad(t, c.paper, c.muted);
      }
    }
    // fires
    if (sFire > 0) for (const [fx, fy, ph] of fires) {
      const [x, y] = P(fx, fy, vh(fx, fy));
      const flick = REDUCE ? 1 : 0.75 + 0.25 * Math.sin(now / 120 + ph * 9);
      const r = geo.a * 0.55 * sFire * flick;
      const g = ctx.createRadialGradient(x, y - r * 0.4, 0, x, y - r * 0.4, r * 2.2);
      g.addColorStop(0, c.hot); g.addColorStop(0.35, c.ember); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - r * 0.4, r * 2.2, 0, 7); ctx.fill();
    }
    // kernel density surface (wire mesh)
    if (sKde > 0) {
      ctx.save(); ctx.globalAlpha = sKde * (0.9 - 0.62 * Math.max(sPeople, sSmoke * 0.5)); ctx.lineWidth = 1;
      const zAt = (x, y) => { const k = Math.min(N - 1, Math.max(0, Math.floor(x))) * N + Math.min(N - 1, Math.max(0, Math.floor(y))); return vh(x, y) + 0.35 + 1.6 * (kde[k] / kmax) * sKde; };
      for (let i = 0; i <= N; i += 1) { ctx.beginPath(); for (let j = 0; j <= N; j += 1) { const p = P(i, j, zAt(i - 0.5, j - 0.5)); j ? ctx.lineTo(...p) : ctx.moveTo(...p); } ctx.strokeStyle = c.ember; ctx.stroke(); }
      for (let j = 0; j <= N; j += 1) { ctx.beginPath(); for (let i = 0; i <= N; i += 1) { const p = P(i, j, zAt(i - 0.5, j - 0.5)); i ? ctx.lineTo(...p) : ctx.moveTo(...p); } ctx.strokeStyle = c.ember; ctx.stroke(); }
      ctx.restore();
    }
    // smoke
    if (sSmoke > 0) {
      ctx.save();
      for (const [i, j] of cells) {
        const v = plume[i * N + j] / pmax;
        if (v < 0.08 || (info[i * N + j].bld && sPeople > 0.5)) continue;
        const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([x, y]) => P(x, y, H[x][y] + 0.02));
        ctx.globalAlpha = sSmoke * Math.min(0.32, v * 0.4) * (1 - 0.4 * sPeople); quad(corners, c.smoke);
      }
      for (const p of particles) {
        if (!REDUCE) p.life = (p.life + 0.0035 * (0.6 + p.s)) % 1;
        const along = p.life * 17, drift = Math.sin(p.life * 6 + p.s * 9) * 0.9;
        const x = p.f[0] + wind[0] * along - wind[1] * drift, y = p.f[1] + wind[1] * along + wind[0] * drift;
        const [sx, sy] = P(x, y, vh(x, y) + 0.4 + p.life * 1.6);
        ctx.globalAlpha = sSmoke * (0.4 - 0.22 * sPri) * Math.sin(Math.PI * p.life);
        ctx.fillStyle = c.smoke; ctx.beginPath(); ctx.arc(sx, sy, geo.a * (0.35 + p.life * 1.1), 0, 7); ctx.fill();
      }
      ctx.restore();
      // wind arrow
      const [ax, ay] = P(3, 2, 2.6), [bx, by] = P(3 + wind[0] * 4, 2 + wind[1] * 4, 2.6);
      ctx.save(); ctx.globalAlpha = sSmoke; ctx.strokeStyle = c.muted; ctx.fillStyle = c.muted; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * Math.cos(ang - 0.4), by - 9 * Math.sin(ang - 0.4)); ctx.lineTo(bx - 9 * Math.cos(ang + 0.4), by - 9 * Math.sin(ang + 0.4)); ctx.fill();
      ctx.font = '600 12px "Public Sans", sans-serif'; ctx.fillText(document.documentElement.lang === 'id' ? 'angin' : 'wind', ax - 6, ay - 8); ctx.restore();
    }
    // priority zones last, so they read above smoke and mesh
    if (sPri > 0) for (const [i, j] of cells) {
      if (!priority.has(i * N + j)) continue;
      const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([x, y]) => P(x, y, H[x][y] + 0.03));
      ctx.save(); ctx.globalAlpha = sPri * (0.3 + 0.1 * Math.sin(now / 320)); quad(corners, c.alarm);
      ctx.globalAlpha = sPri; ctx.strokeStyle = c.alarm; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
  }
  function rgbToHex(rgb) { const m = rgb.match(/\d+/g).map(Number); return '#' + m.map(v => v.toString(16).padStart(2, '0')).join(''); }

  function loop(now) { draw(now); raf = visible && (!REDUCE || now - changed < 1000) ? requestAnimationFrame(loop) : 0; }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  function go(next) {
    from = step; step = (next + PROCESS_STEPS) % PROCESS_STEPS; changed = performance.now();
    onStep?.(step); kick();
  }
  function play() {
    playing = true; clearInterval(timer);
    if (step === PROCESS_STEPS - 1) go(0);
    timer = setInterval(() => { if (step === PROCESS_STEPS - 1) { pause(); return; } go(step + 1); }, 3400);
    onStep?.(step);
  }
  function pause() { playing = false; clearInterval(timer); onStep?.(step); }
  new ResizeObserver(() => { layout(); kick(); }).observe(canvas);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); else pause(); }, { threshold: 0.2 }).observe(canvas);
  return { go: n => { pause(); go(n); }, next: () => { pause(); go(step + 1); }, prev: () => { pause(); go(step - 1); },
    toggle: () => (playing ? pause() : play()), get step() { return step; }, get playing() { return playing; }, redraw: kick, play };
}

/* ================================================================ terrain */
// Real fire-density grids (count kernel, 100 km) raised as an oblique
// heightfield over a Natural Earth basemap, both provinces in their true
// positions. One colour/height scale for both seasons. Peaks are annotated
// with the district underneath (newsroom-style direct labels).
export function createTerrain(canvas, labelsEl, geography, zones, basemap) {
  const ctx = canvas.getContext('2d');
  const order = ['ID14', 'ID62'];
  const B = 8000; // block size in metres (4 x 2 km cells)
  const blocks = {};
  for (const id of order) {
    const g = geography.grids[id];
    const f = B / g.step;
    const w = Math.ceil(g.width / f), h = Math.ceil(g.height / f);
    const owner = new Int32Array(g.width * g.height).fill(-1);
    g.cells.forEach((cell, k) => { owner[cell] = k; });
    const members = Array.from({ length: w * h }, () => []);
    for (let cell = 0; cell < owner.length; cell += 1) if (owner[cell] >= 0) {
      const x = cell % g.width, y = Math.floor(cell / g.width);
      members[Math.floor(y / f) * w + Math.floor(x / f)].push(owner[cell]);
    }
    blocks[id] = { w, h, members: members.map(m => (m.length >= f * f * 0.3 ? m : null)), x0: g.x0, y0: g.y0 };
  }
  // common frame in block units (x east, y south), with context margins
  const pad = { w: 110e3, e: 130e3, n: 40e3, s: 90e3 };
  const WX0 = Math.min(...order.map(id => blocks[id].x0)) - pad.w;
  const WX1 = Math.max(...order.map(id => blocks[id].x0 + blocks[id].w * B)) + pad.e;
  const WY0 = Math.max(...order.map(id => blocks[id].y0)) + pad.n;
  const WY1 = Math.min(...order.map(id => blocks[id].y0 - blocks[id].h * B)) - pad.s;
  const W = (WX1 - WX0) / B, Hh = (WY0 - WY1) / B;
  for (const id of order) { blocks[id].ox = (blocks[id].x0 - WX0) / B; blocks[id].oy = (WY0 - blocks[id].y0) / B; }
  const toFrame = ([x, y]) => [(x - WX0) / B, (WY0 - y) / B];
  const pip = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  };
  const gadm = basemap?.provinces ?? [];
  const provincesMap = gadm.map(p => ({ study: p.name === 'Riau' || p.name === 'Kalimantan Tengah', rings: p.rings.map(r => r.map(toFrame)) }));
  // keep only Natural Earth shapes outside Indonesia (Malaysia, Brunei, Singapore) as context
  const neighbours = geography.base.filter(poly => {
    if (!gadm.length) return true;
    const ring = poly[0];
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return !gadm.some(p => p.rings.some(r => pip(cx, cy, r)));
  }).map(poly => poly.map(ring => ring.map(toFrame)));
  // context place names, positioned in ESRI:102028 metres
  const places = [
    { en: 'Sumatra', id: 'Sumatra', at: [-2640e3, 1330e3] },
    { en: 'Borneo', id: 'Kalimantan', at: [-1000e3, 1790e3] },
    { en: 'Java Sea', id: 'Laut Jawa', at: [-1700e3, 1260e3], sea: true },
    { en: 'Bangka', id: 'Bangka', at: [-2080e3, 1330e3], sea: true },
  ];
  const shapeBoxes = geography.shapes.map(shape => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const poly of shape) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1 };
  });
  const inRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  };
  const districtAt = (x, y) => {
    const i = shapeBoxes.findIndex((b, k) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
      && geography.shapes[k].some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(hole => inRing(x, y, hole))));
    return i < 0 ? null : zones[i];
  };

  let values = {}, target = {}, start = {}, t0 = 0, raf = 0, labels = {}, angle = -0.18, tilt = 0.56, year = 2019;
  const peaks = {};
  const decode = b64 => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) a[i] = s.charCodeAt(i); return a; };
  function aggregate(scenario) {
    const out = {};
    for (const id of order) {
      const heat = decode(scenario.provinces[id].heat);
      out[id] = Float32Array.from(blocks[id].members, m => (m ? m.reduce((s, k) => s + heat[k], 0) / m.length / 255 : -1));
      let best = -1, at = 0;
      out[id].forEach((v, i) => { if (v > best) { best = v; at = i; } });
      const b = blocks[id], bx = at % b.w, by = Math.floor(at / b.w);
      const zone = districtAt(b.x0 + (bx + 0.5) * B, b.y0 - (by + 0.5) * B);
      peaks[id] = { x: b.ox + bx + 0.5, y: b.oy + by + 0.5, name: zone ? zone.name : '' };
    }
    return out;
  }
  const zOf = v => Math.pow(Math.max(0, v), 0.7) * 0.62;
  function frameGeo(width, height) {
    const corners = [[0, 0], [W, 0], [W, Hh], [0, Hh]].map(([x, y]) => {
      const cx = x - W / 2, cy = y - Hh / 2;
      return [cx * Math.cos(angle) - cy * Math.sin(angle), (cx * Math.sin(angle) + cy * Math.cos(angle)) * tilt];
    });
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    const top = height * 0.26; // headroom for the tallest peak and labels
    const s = Math.min(width / (Math.max(...xs) - Math.min(...xs)), (height - top - 8) / (Math.max(...ys) - Math.min(...ys)));
    return { s, ox: width / 2 - (Math.max(...xs) + Math.min(...xs)) / 2 * s,
      oy: top + (height - top) / 2 - (Math.max(...ys) + Math.min(...ys)) / 2 * s, zs: height * 0.5 };
  }
  function project(geo, x, y, z) {
    const cx = x - W / 2, cy = y - Hh / 2;
    const rx = cx * Math.cos(angle) - cy * Math.sin(angle), ry = cx * Math.sin(angle) + cy * Math.cos(angle);
    return [geo.ox + rx * geo.s, geo.oy + ry * geo.s * tilt - z * geo.zs];
  }
  function rgbish(col) { if (col.startsWith('#')) return col; const m = col.match(/\d+/g).map(Number); return '#' + m.map(v => v.toString(16).padStart(2, '0')).join(''); }
  function draw(now) {
    const { width, height } = resizeCanvas(canvas);
    if (!width) { raf = 0; return; }
    const c = css();
    const k = ease((now - t0) / 1300);
    const geo = frameGeo(width, height);
    ctx.clearRect(0, 0, width, height);
    // basemap: GADM Indonesian provinces (1.5 km detail) over Natural Earth neighbours
    const trace = rings => {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach((p, i) => { const q = project(geo, p[0], p[1], 0); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath();
      }
    };
    trace(neighbours.flat());
    ctx.fillStyle = c.paper; ctx.fill('evenodd');
    ctx.strokeStyle = c.line; ctx.lineWidth = 0.8; ctx.stroke();
    for (const p of provincesMap) {
      trace(p.rings);
      ctx.fillStyle = p.study ? c.sunk : c.paper; ctx.fill('nonzero');
      ctx.strokeStyle = c.line; ctx.lineWidth = 0.7; ctx.stroke();
    }
    ctx.font = 'italic 500 12px "Public Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = c.muted;
    const lang = document.documentElement.lang === 'id' ? 'id' : 'en';
    for (const p of places) {
      const [fx, fy] = toFrame(p.at);
      const [x, y] = project(geo, fx, fy, 0);
      if (x > 40 && x < width - 40 && y > 12 && y < height - 4) ctx.fillText(p[lang], x, y);
    }
    // heightfield
    const ramp = [c.land, '#efd7a0', '#e4ad55', c.ember, '#a8501a', '#6e2c10'];
    const color = v => {
      if (v <= 0.002) return c.land;
      const p = Math.min(0.999, Math.pow(v, 0.6)) * (ramp.length - 1);
      const i = Math.floor(p);
      return mix(rgbish(ramp[i]), rgbish(ramp[i + 1]), p - i);
    };
    const items = [];
    for (const id of order) {
      const b = blocks[id], a = start[id], z = target[id];
      if (!z) continue;
      values[id] = z.map((v, i) => (v < 0 ? -1 : a ? a[i] + (v - a[i]) * k : v));
      for (let y = 0; y < b.h; y += 1) for (let x = 0; x < b.w; x += 1) {
        const v = values[id][y * b.w + x];
        if (v < 0) continue;
        const X = b.ox + x, Y = b.oy + y;
        items.push([(X - W / 2) * Math.sin(angle) + (Y - Hh / 2) * Math.cos(angle), X, Y, v]);
      }
    }
    items.sort((p, q) => p[0] - q[0]);
    for (const [, X, Y, v] of items) {
      const z = zOf(v);
      const top = [[X, Y], [X + 1, Y], [X + 1, Y + 1], [X, Y + 1]].map(([x, y]) => project(geo, x, y, z));
      if (z > 0.002) {
        const bottom = [[X, Y], [X + 1, Y], [X + 1, Y + 1], [X, Y + 1]].map(([x, y]) => project(geo, x, y, 0));
        const mid = project(geo, X + 0.5, Y + 0.5, 0)[1];
        for (let e = 0; e < 4; e += 1) {
          const n = (e + 1) % 4;
          if ((bottom[e][1] + bottom[n][1]) / 2 > mid) {
            ctx.beginPath(); ctx.moveTo(...top[e]); ctx.lineTo(...top[n]); ctx.lineTo(...bottom[n]); ctx.lineTo(...bottom[e]); ctx.closePath();
            ctx.fillStyle = shade(rgbish(color(v)), e % 2 ? 0.74 : 0.86); ctx.fill();
          }
        }
      }
      ctx.beginPath(); ctx.moveTo(...top[0]); for (let e = 1; e < 4; e += 1) ctx.lineTo(...top[e]); ctx.closePath();
      ctx.fillStyle = color(v); ctx.fill();
    }
    // direct labels: province name + total, leader line to the highest block
    const html = [];
    for (const id of order) {
      const b = blocks[id], pk = peaks[id];
      if (!pk || !values[id]) continue;
      const pv = Math.max(...values[id]);
      const [px, py] = project(geo, pk.x, pk.y, zOf(pv));
      const outline = [[0, 0], [b.w, 0], [0, b.h], [b.w, b.h]].map(([dx, dy]) => project(geo, b.ox + dx, b.oy + dy, 0));
      const ly = Math.max(16, Math.min(py, ...outline.map(p => p[1])) - 40);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py - 2); ctx.lineTo(px, ly + 34); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py - 2, 2.2, 0, 7); ctx.fillStyle = c.ink; ctx.fill();
      const name = labels.names?.[id] ?? id;
      const peak = pk.name && pv > 0.08 ? `<em>${labels.peak ?? 'Peak'}: ${pk.name}</em>` : '';
      html.push(`<span style="left:${Math.min(width - 100, Math.max(100, px))}px;top:${ly - 12}px"><b>${name}</b> ${labels.totals?.[id] ?? ''}${peak}</span>`);
    }
    labelsEl.innerHTML = html.join('');
    if (k < 1) raf = requestAnimationFrame(draw); else raf = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(draw); }
  // drag to rotate / tilt
  let press = null;
  canvas.addEventListener('pointerdown', e => { press = { x: e.clientX, y: e.clientY, angle, tilt }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!press) return;
    angle = press.angle + (e.clientX - press.x) / 300;
    tilt = Math.max(0.3, Math.min(0.9, press.tilt + (e.clientY - press.y) / 400));
    t0 = 0; kick();
  });
  canvas.addEventListener('pointerup', () => { press = null; });
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  new ResizeObserver(() => kick()).observe(canvas);
  return {
    show(scenario, next) {
      const agg = aggregate(scenario);
      start = Object.keys(target).length ? Object.fromEntries(order.map(id => [id, values[id] ?? target[id]])) : {};
      target = agg; labels = next; year = scenario.year;
      t0 = REDUCE || !Object.keys(start).length ? -1e9 : performance.now();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      kick();
    },
    redraw: () => kick(),
    get year() { return year; },
  };
}
