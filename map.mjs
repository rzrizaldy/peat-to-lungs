// Explorer map on Web Mercator over Esri Light/Dark Gray Canvas tiles (the same
// basemap family as the ArcGIS Pro project). Vector data is reprojected from
// ESRI:102028 on load; the 2 km analysis grids are warped pixel-by-pixel through
// the exact inverse projection, so cells land where ArcGIS puts them.
import { albers, lonLat } from './tools/model.mjs';

export const PROVINCE_NAMES = { ID14: 'Riau', ID62: 'Kalimantan Tengah' };
// Sequential ember ramp (fire), smoke-violet ramp (PM2.5), diverging forest→ember (index).
export const HEAT_COLORS = ['#f4ead2', '#eed39c', '#e6b464', '#d68f33', '#b8691d', '#8c4615', '#5e2b10'];
export const INDEX_COLORS = ['#2e6b4a', '#5e8f6c', '#98b69c', '#d6dbd0', '#ead6ac', '#dcab66', '#c4762b', '#9a3b12'];
export const EXPOSURE_COLORS = ['#ecebf3', '#d1cce1', '#b0a8ca', '#8d82b0', '#6b5e95', '#4a3e70'];
// Cluster colours follow the profile type, not the cluster id (validated categorical set).
export const TYPE_COLORS = { both: '#c2410c', fire: '#8e5bb5', monitor: '#2e8540', exposure: '#5b5bb0', dense: '#8a8f86' };
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

export const exposureClass = (value, year) => {
  const breaks = year === 2019 ? [50, 80, 110, 150, 200] : [100 / 6, 200 / 6, 50, 400 / 6, 500 / 6];
  return breaks.filter(threshold => value >= threshold).length;
};

export function resizeCanvas(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  const pw = Math.round(width * ratio);
  const ph = Math.round(height * ratio);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height, ratio };
}

/* ---------- Web Mercator in "world" units (256 px tile at zoom 0) ---------- */
const TILE = 256;
const toWorld = (lon, lat) => [(lon + 180) / 360 * TILE,
  (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * TILE];
const fromWorld = (x, y) => [x / TILE * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / TILE))) * 180 / Math.PI];
const albersToWorld = ([x, y]) => toWorld(...lonLat(x, y));

function pathOf(polygons, project) {
  const path = new Path2D();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach((pt, i) => {
        const [x, y] = project(pt);
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
      path.closePath();
    }
  }
  return { path, minX, maxX, minY, maxY };
}

// Warp a per-cell byte layer from the Albers grid onto a Mercator canvas.
function warpTile(grid, bytes, palette, heat, bounds) {
  const px = TILE / 40075;                        // 1 km output pixels at the equator (cells are 2 km)
  const w = Math.ceil((bounds.maxX - bounds.minX) / px), h = Math.ceil((bounds.maxY - bounds.minY) / px);
  const tile = document.createElement('canvas');
  tile.width = w; tile.height = h;
  const ctx = tile.getContext('2d');
  const image = ctx.createImageData(w, h);
  const owner = grid.owner;
  const unpack = palette.map(hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)));
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const [lon, lat] = fromWorld(bounds.minX + (c + 0.5) * px, bounds.minY + (r + 0.5) * px);
      const [ax, ay] = albers(lon, lat);
      const col = Math.floor((ax - grid.x0) / grid.step), row = Math.floor((grid.y0 - ay) / grid.step);
      if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) continue;
      const k = owner[row * grid.width + col];
      if (k < 0) continue;
      const v = bytes[k];
      const colour = unpack[heat ? Math.min(unpack.length - 1, Math.floor(v / 256 * unpack.length)) : v];
      const o = 4 * (r * w + c);
      image.data[o] = colour[0]; image.data[o + 1] = colour[1]; image.data[o + 2] = colour[2]; image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas: tile, x: bounds.minX, y: bounds.minY, w: w * px, h: h * px };
}

/* ---------- basemap tiles ---------- */
const tileCache = new Map();
function basemapURL(layer, z, x, y) {
  const name = isDark() ? `World_Dark_Gray_${layer}` : `World_Light_Gray_${layer}`;
  return `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/${z}/${y}/${x}`;
}
function getTile(url, onload) {
  let entry = tileCache.get(url);
  if (!entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    entry = { img, ok: false };
    img.onload = () => { entry.ok = true; onload(); };
    img.src = url;
    tileCache.set(url, entry);
  }
  return entry;
}

export function createMap(canvas, geography, zones, onSelection) {
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('map-tooltip');
  const geometry = geography.shapes.map(shape => pathOf(shape, albersToWorld));
  const grids = Object.fromEntries(Object.entries(geography.grids).map(([id, g]) => {
    const owner = new Int32Array(g.width * g.height).fill(-1);
    g.cells.forEach((cell, k) => { owner[cell] = k; });
    return [id, { ...g, owner }];
  }));
  const provinceGeometry = Object.fromEntries(Object.entries(grids).map(([id, g]) => [id, pathOf(g.outline, albersToWorld)]));
  const surfaceCache = new WeakMap();
  const decode = b64 => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) a[i] = s.charCodeAt(i); return a; };
  let display, transform, zoom = 1, panX = 0, panY = 0, press, pending = 0;

  function surfaces(id) {
    const scenario = display.scenario;
    let byId = surfaceCache.get(scenario);
    if (!byId) { byId = {}; surfaceCache.set(scenario, byId); }
    if (!byId[id]) {
      const g = grids[id], info = scenario.provinces[id], b = provinceGeometry[id];
      const toW = ([x, y]) => albersToWorld([g.x0 + x * g.step, g.y0 - y * g.step]);
      byId[id] = {
        heat: warpTile(g, decode(info.heat), HEAT_COLORS, true, b),
        index: warpTile(g, decode(info.index), INDEX_COLORS, false, b),
        priority: pathOf(info.priorityShapes, toW).path,
      };
    }
    return byId[id];
  }
  const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; paint(); }); };

  function drawTiles(layer, scale, tx, ty, width, height) {
    const z = Math.max(3, Math.min(13, Math.round(Math.log2(scale))));
    const n = 2 ** z, size = TILE / n;
    const x0 = Math.floor((-tx / scale) / size), x1 = Math.floor(((width - tx) / scale) / size);
    const y0 = Math.floor((-ty / scale) / size), y1 = Math.floor(((height - ty) / scale) / size);
    for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const t = getTile(basemapURL(layer, z, ((x % n) + n) % n, y), schedule);
        if (t.ok) ctx.drawImage(t.img, x * size * scale + tx, y * size * scale + ty, size * scale + 0.5, size * scale + 0.5);
      }
    }
  }

  function paint() {
    if (!display) return;
    const { width, height, ratio } = resizeCanvas(canvas);
    if (!width || !height) return;
    const { region, layer, scenario, selected, percentiles } = display;
    const visible = display.visible ?? Object.keys(grids);
    const areas = visible.map(id => provinceGeometry[id]);
    const left = Math.min(...areas.map(b => b.minX)), right = Math.max(...areas.map(b => b.maxX));
    const top = Math.min(...areas.map(b => b.minY)), bottom = Math.max(...areas.map(b => b.maxY));
    const multiplier = visible.length > 1 ? 1.08 : 1.2;
    const scale = zoom * Math.min(width / ((right - left) * multiplier), height / ((bottom - top) * multiplier));
    const tx = width / 2 - (left + right) / 2 * scale + panX;
    const ty = height / 2 - (top + bottom) / 2 * scale + panY;
    transform = { scale, tx, ty, ids: visible };
    ctx.fillStyle = cssVar('--map-sea');
    ctx.fillRect(0, 0, width, height);
    drawTiles('Base', scale, tx, ty, width, height);

    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * tx, ratio * ty);
    ctx.globalAlpha = 0.86;
    if (layer === 'heat' || layer === 'index') {
      ctx.imageSmoothingEnabled = false;
      for (const id of visible) {
        const t = surfaces(id)[layer];
        ctx.save(); ctx.clip(provinceGeometry[id].path, 'evenodd');
        ctx.drawImage(t.canvas, t.x, t.y, t.w, t.h);
        ctx.restore();
      }
    }
    for (const [i, shape] of geometry.entries()) {
      if (!visible.includes(zones[i].province)) continue;
      if (layer === 'exposure') {
        const value = scenario.year === 2019 ? zones[i].pm25 : percentiles[i];
        ctx.fillStyle = EXPOSURE_COLORS[exposureClass(value, scenario.year)];
        ctx.fill(shape.path, 'evenodd');
      } else if (layer === 'cluster') {
        ctx.fillStyle = TYPE_COLORS[scenario.clusters.profiles[scenario.indicators[i].cluster].type];
        ctx.fill(shape.path, 'evenodd');
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isDark() ? 'rgba(230,236,230,.18)' : 'rgba(30,45,38,.22)';
    ctx.lineWidth = Math.max(0.35, Math.min(0.9, zoom * 0.5)) / scale;
    for (const [i, shape] of geometry.entries()) if (visible.includes(zones[i].province)) ctx.stroke(shape.path);
    for (const id of visible) {
      ctx.strokeStyle = cssVar('--ink');
      ctx.lineWidth = 1.2 / scale;
      ctx.stroke(provinceGeometry[id].path);
      if (layer === 'index') {
        ctx.strokeStyle = cssVar('--alarm');
        ctx.lineWidth = 1.6 / scale;
        ctx.stroke(surfaces(id).priority);
      }
    }
    if (selected !== null && visible.includes(zones[selected].province)) {
      ctx.strokeStyle = cssVar('--bg');
      ctx.lineWidth = 3.4 / scale;
      ctx.stroke(geometry[selected].path);
      ctx.strokeStyle = cssVar('--ink');
      ctx.lineWidth = 1.6 / scale;
      ctx.stroke(geometry[selected].path);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTiles('Reference', scale, tx, ty, width, height);

    // scale bar at the map-centre latitude
    const [, lat] = fromWorld((width / 2 - tx) / scale, (height / 2 - ty) / scale);
    const kmPerPx = 40075 * Math.cos(lat * Math.PI / 180) / TILE / scale;
    const km = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1].find(value => value / kmPerPx < 110) ?? 1;
    const marker = document.getElementById('map-scale');
    marker.dataset.label = `${km} km`;
    marker.style.width = `${km / kmPerPx}px`;
  }

  function hit(clientX, clientY) {
    if (!transform) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, tx, ty, ids } = transform;
    const x = (clientX - rect.left - tx) / scale;
    const y = (clientY - rect.top - ty) / scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const result = geometry.findIndex((box, index) => ids.includes(zones[index].province)
      && x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY
      && ctx.isPointInPath(box.path, x, y, 'evenodd'));
    ctx.restore();
    return result < 0 ? null : result;
  }

  canvas.addEventListener('pointerdown', event => {
    if (!display || event.button !== 0) return;
    press = { x: event.clientX, y: event.clientY, panX, panY, panning: event.pointerType === 'mouse' };
    if (press.panning) canvas.setPointerCapture(event.pointerId);
    tooltip.hidden = true;
  });
  canvas.addEventListener('pointermove', event => {
    if (press?.panning && (press.dragged || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4)) {
      press.dragged = true;
      panX = press.panX + event.clientX - press.x;
      panY = press.panY + event.clientY - press.y;
      canvas.style.cursor = 'grabbing';
      schedule();
      return;
    }
    if (press || event.pointerType !== 'mouse') return;
    const index = hit(event.clientX, event.clientY);
    canvas.style.cursor = index === null ? 'crosshair' : 'pointer';
    tooltip.hidden = index === null;
    if (index !== null) {
      const rect = canvas.getBoundingClientRect();
      tooltip.textContent = zones[index].name;
      tooltip.style.left = `${Math.min(rect.width - 145, event.clientX - rect.left + 11)}px`;
      tooltip.style.top = `${event.clientY - rect.top + 11}px`;
    }
  });
  canvas.addEventListener('pointerup', event => {
    if (press && !press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 7) {
      const id = hit(event.clientX, event.clientY);
      if (id !== null) onSelection(id);
    }
    press = null;
    canvas.style.cursor = 'crosshair';
  });
  canvas.addEventListener('pointercancel', () => { press = null; });
  canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; });
  new ResizeObserver(schedule).observe(canvas);
  function reset() { zoom = 1; panX = 0; panY = 0; schedule(); }
  function zoomBy(factor) {
    const next = Math.max(1, Math.min(24, zoom * factor));
    panX *= next / zoom; panY *= next / zoom; zoom = next; // keep the view centre fixed
    schedule();
  }
  return {
    update(next) {
      const newRegion = display?.region !== next.region;
      display = next;
      if (newRegion) reset();
      else schedule();
    },
    reset,
    zoomBy,
  };
}
