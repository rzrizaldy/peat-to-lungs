export const YEARS = [2019, 2026];
export const RADII = [25, 50, 100];
export const MODES = ['count', 'frp'];
export const INDEX_WEIGHTS = [0.3, 0.3, 0.4]; // Fire, population density, exposure.
export const PRIORITY_THRESHOLD = 1.5;
// Population density is extremely right-skewed on a 2 km grid (city cells reach
// tens of thousands per km²). A raw z-score lets density alone push a cell past
// +1.5 SD even with below-average fire, so both the index and the clustering
// use log(1 + people/km²). See tools/stats.mjs for the sensitivity check.
export const popScale = density => Math.log1p(density);

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function normalizer(values) {
  const mean = sum(values) / values.length;
  const sd = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
  return value => sd > 0 ? (value - mean) / sd : 0;
}

export function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const left = Math.floor(position);
  return sorted[left] + (sorted[Math.ceil(position)] - sorted[left]) * (position - left);
}

export function seedRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ArcGIS's planar quartic kernel, evaluated on the equal-area lattice.
// Points in the same cell share the center coordinate before convolution.
export function densityGrid(grid, points, radiusKm) {
  const { width, height, step, x0, y0 } = grid;
  const radius = radiusKm * 1000;
  const reach = Math.floor(radius / step);
  const halo = reach + 1;
  const inputWidth = width + 2 * halo;
  const inputHeight = height + 2 * halo;
  const count = new Uint32Array(inputWidth * inputHeight);
  const frp = new Float64Array(count.length);
  for (let i = 0; i < points.length; i += 3) {
    const x = Math.floor((points[i] - x0) / step) + halo;
    const y = Math.floor((y0 - points[i + 1]) / step) + halo;
    if (x < 0 || x >= inputWidth || y < 0 || y >= inputHeight) continue;
    const index = y * inputWidth + x;
    count[index] += 1;
    frp[index] += points[i + 2];
  }

  const countOut = new Float64Array(width * height);
  const frpOut = new Float64Array(countOut.length);
  const offsets = [];
  const scale = 3 / (Math.PI * radiusKm ** 2);
  for (let dy = -reach; dy <= reach; dy += 1) {
    const row = [];
    for (let dx = -reach; dx <= reach; dx += 1) {
      const u = (dx ** 2 + dy ** 2) * step ** 2 / radius ** 2;
      if (u < 1) row.push([dx, scale * (1 - u) ** 2]);
    }
    if (row.length) offsets.push({ dy, left: row[0][0], weights: row.map(([, w]) => w) });
  }
  for (let i = 0; i < count.length; i += 1) {
    if (!count[i]) continue;
    const x = i % inputWidth - halo;
    const y = Math.floor(i / inputWidth) - halo;
    for (const { dy, left, weights } of offsets) {
      const outY = y + dy;
      if (outY < 0 || outY >= height) continue;
      const row = outY * width;
      const outX = x + left;
      const lo = Math.max(0, -outX);
      const hi = Math.min(weights.length, width - outX);
      const v = count[i];
      const w = frp[i];
      for (let j = lo; j < hi; j += 1) {
        const index = row + outX + j;
        countOut[index] += v * weights[j];
        frpOut[index] += w * weights[j];
      }
    }
  }
  return { count: countOut, frp: frpOut };
}

export function zonalMeans(grid, surface, zoneIndices, zones) {
  const sums = new Float64Array(zones.length);
  const counts = new Uint32Array(zones.length);
  for (const [i, cell] of grid.cells.entries()) {
    const index = grid.zone[i];
    sums[index] += surface[cell];
    counts[index] += 1;
  }
  const fallback = [];
  const entries = zoneIndices.map(index => {
    if (counts[index]) return [index, sums[index] / counts[index]];
    const [x, y] = zones[index].center;
    const col = Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.x0) / grid.step)));
    const row = Math.max(0, Math.min(grid.height - 1, Math.floor((grid.y0 - y) / grid.step)));
    fallback.push(zones[index].id);
    return [index, surface[row * grid.width + col]];
  });
  return { entries, fallback };
}

export function fitLine(indices, x, y) {
  const mx = sum(indices.map(i => x[i])) / indices.length;
  const my = sum(indices.map(i => y[i])) / indices.length;
  let covariance = 0;
  let variance = 0;
  for (const i of indices) {
    covariance += (x[i] - mx) * (y[i] - my);
    variance += (x[i] - mx) ** 2;
  }
  const slope = variance === 0 ? 0 : covariance / variance;
  return { slope, intercept: my - slope * mx };
}

export function predict(model, value) {
  return model.intercept + model.slope * Math.log1p(value);
}

function ranks(values) {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const output = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let end = i + 1;
    while (end < order.length && order[end].value === order[i].value) end += 1;
    for (let j = i; j < end; j += 1) output[order[j].i] = (i + end - 1) / 2;
    i = end;
  }
  return output;
}

export function scores(observed, estimated) {
  const mean = sum(observed) / observed.length;
  const residuals = observed.map((value, i) => value - estimated[i]);
  const total = sum(observed.map(value => (value - mean) ** 2));
  const r2 = total === 0 ? null : 1 - sum(residuals.map(e => e ** 2)) / total;
  const a = ranks(observed);
  const b = ranks(estimated);
  const ma = sum(a) / a.length;
  const mb = sum(b) / b.length;
  const denominator = Math.sqrt(sum(a.map(r => (r - ma) ** 2)) * sum(b.map(r => (r - mb) ** 2)));
  const rho = denominator === 0 ? null : sum(a.map((r, i) => (r - ma) * (b[i] - mb))) / denominator;
  return { r2, rho, mae: sum(residuals.map(Math.abs)) / observed.length };
}

export function validate(densities, zones, repetitions = 500) {
  const x = densities.map(Math.log1p);
  const y = zones.map(z => z.pm25);
  const all = zones.map((_, i) => i);
  const fitted = fitLine(all, x, y);
  const evaluate = (model, indices) => {
    const estimated = indices.map(i => predict(model, densities[i]));
    return scores(indices.map(i => y[i]), estimated);
  };
  const byProvince = Object.fromEntries(['ID14', 'ID62'].map(
    id => [id, all.filter(i => zones[i].province === id)]
  ));
  const transfers = [
    evaluate(fitLine(byProvince.ID14, x, y), byProvince.ID62),
    evaluate(fitLine(byProvince.ID62, x, y), byProvince.ID14),
  ];
  const rng = seedRandom(42);
  const holdout = [];
  let example;
  const sampleSize = Math.round(all.length * 0.30);
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const test = shuffled.slice(0, sampleSize);
    const fit = fitLine(shuffled.slice(sampleSize), x, y);
    holdout.push(evaluate(fit, test));
    if (iteration === 0) {
      example = test.map(i => [i, y[i], predict(fit, densities[i])]);
    }
  }
  const ranges = Object.fromEntries(['r2', 'rho', 'mae'].map(metric => {
    const sorted = holdout.map(score => score[metric]).filter(Number.isFinite).sort((a, b) => a - b);
    return [metric, [0.5, 0.05, 0.95].map(fraction => quantile(sorted, fraction))];
  }));
  return { fitted, pooled: evaluate(fitted, all), transfers, ranges, example, repetitions, sampleSize };
}

const distance2 = (a, b) => sum(a.map((x, j) => (x - b[j]) ** 2));

function nearest(value, centers) {
  let closest = 0;
  let minimum = Infinity;
  for (const [i, center] of centers.entries()) {
    const distance = distance2(value, center);
    if (distance < minimum) {
      minimum = distance;
      closest = i;
    }
  }
  return closest;
}

function kmeans(matrix, k, random) {
  let centers = [matrix[Math.floor(random() * matrix.length)]];
  while (centers.length < k) {
    const weights = matrix.map(row => distance2(row, centers[nearest(row, centers)]));
    let selection = random() * sum(weights);
    let index = 0;
    while (index < weights.length - 1 && (selection -= weights[index]) > 0) index += 1;
    centers.push(matrix[index]);
  }
  let previous = [];
  let labels;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    labels = matrix.map(row => nearest(row, centers));
    if (labels.every((label, i) => label === previous[i])) break;
    previous = labels;
    const groups = Array.from({ length: k }, () => []);
    labels.forEach((label, i) => groups[label].push(matrix[i]));
    centers = groups.map((group, i) => group.length
      ? centers[i].map((_, column) => sum(group.map(row => row[column])) / group.length)
      : matrix[Math.floor(random() * matrix.length)]);
  }
  labels = matrix.map(row => nearest(row, centers));
  return { centers, labels, inertia: sum(matrix.map((row, i) => distance2(row, centers[labels[i]]))) };
}

function silhouette(distances, labels, k) {
  const groups = new Uint32Array(k);
  labels.forEach(label => { groups[label] += 1; });
  return sum(labels.map((own, i) => {
    if (groups[own] < 2) return 0;
    const totals = new Float64Array(k);
    labels.forEach((label, j) => { totals[label] += distances[i][j]; });
    const inside = totals[own] / (groups[own] - 1);
    let outside = Infinity;
    groups.forEach((size, group) => {
      if (group !== own && size) outside = Math.min(outside, totals[group] / size);
    });
    return Number.isFinite(outside) && Math.max(inside, outside) > 0
      ? (outside - inside) / Math.max(inside, outside)
      : 0;
  })) / labels.length;
}

export function cluster(rows, populations) {
  const columns = rows[0].map((_, j) => normalizer(rows.map(row => row[j])));
  const matrix = rows.map(row => row.map((x, j) => columns[j](x)));
  const distances = matrix.map(a => matrix.map(b => Math.sqrt(distance2(a, b))));
  const random = seedRandom(1607);
  const candidates = [];
  for (let k = 3; k <= 6; k += 1) {
    let best;
    for (let run = 0; run < 12; run += 1) {
      const candidate = kmeans(matrix, k, random);
      if (new Set(candidate.labels).size === k && (!best || candidate.inertia < best.inertia)) best = candidate;
    }
    if (best) candidates.push({ k, ...best, silhouette: silhouette(distances, best.labels, k) });
  }
  const chosen = [...candidates].sort((a, b) => b.silhouette - a.silhouette || a.k - b.k)[0];
  const ordered = chosen.centers.map((center, id) => ({ center, id }))
    .sort((a, b) => (b.center[0] + b.center[2]) - (a.center[0] + a.center[2]));
  const remap = new Map(ordered.map(({ id }, i) => [id, i]));
  const labels = chosen.labels.map(id => remap.get(id));
  const profiles = ordered.map(({ center }, id) => {
    const ids = labels.flatMap((label, i) => label === id ? [i] : []);
    const fire = Math.max(center[0], center[1]) > 0.35;
    const exposure = center[2] > 0.35;
    const type = fire && exposure ? 'both'
      : fire ? 'fire'
        : exposure ? 'exposure'
          : center[3] > 0.6 ? 'dense' : 'monitor';
    return { id, type, center, count: ids.length, population: sum(ids.map(i => populations[i])),
      means: rows[0].map((_, col) => sum(ids.map(i => rows[i][col])) / ids.length) };
  });
  return { k: chosen.k, labels, profiles, candidates: candidates.map(({ k, silhouette }) => ({ k, silhouette })) };
}

// Cell boundaries run clockwise in screen coordinates. Right turns keep
// diagonal neighbors separate and preserve holes in four-connected regions.
export function priorityRings(width, height, cells) {
  const active = new Set(cells);
  const stride = width + 1;
  const edges = new Map();
  const directions = [1, stride, -1, -stride];
  function add(vertex, direction) {
    edges.set(vertex, (edges.get(vertex) ?? 0) | (1 << direction));
  }
  for (const cell of active) {
    const col = cell % width;
    const row = Math.floor(cell / width);
    const vertex = row * stride + col;
    if (row === 0 || !active.has(cell - width)) add(vertex, 0);
    if (col === width - 1 || !active.has(cell + 1)) add(vertex + 1, 1);
    if (row === height - 1 || !active.has(cell + width)) add(vertex + stride + 1, 2);
    if (col === 0 || !active.has(cell - 1)) add(vertex + stride, 3);
  }
  const rings = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    let direction = directions.findIndex((_, i) => edges.get(start) & (1 << i));
    const trail = [start];
    const visited = new Map([[start, 0]]);
    do {
      const remainder = edges.get(current) & ~(1 << direction);
      if (remainder) edges.set(current, remainder);
      else edges.delete(current);
      const next = current + directions[direction];
      if (visited.has(next)) {
        // A hole can meet the exterior at one corner. Split repeated
        // vertices into simple rings instead of exporting a pinched ring.
        const offset = visited.get(next);
        const points = trail.slice(offset).map(vertex => [vertex % stride, Math.floor(vertex / stride)]);
        const corners = points.filter(([x, y], i) => {
          const [px, py] = points[(i + points.length - 1) % points.length];
          const [nx, ny] = points[(i + 1) % points.length];
          return !((px === x && nx === x) || (py === y && ny === y));
        });
        rings.push([...corners, corners[0]]);
        for (const vertex of trail.slice(offset + 1)) visited.delete(vertex);
        trail.length = offset + 1;
      } else {
        visited.set(next, trail.length);
        trail.push(next);
      }
      if (next === start) break;
      const turn = [1, 0, 3, 2].map(t => (direction + t) % 4)
        .find(i => edges.get(next) & (1 << i));
      if (turn === undefined) throw new Error('Open priority boundary');
      current = next;
      direction = turn;
    } while (true);
  }
  return rings;
}

export function signedArea(ring) {
  let area = 0;
  for (let i = 1; i < ring.length; i += 1) {
    area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  }
  return area / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i += 1) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function assemblePolygons(rings) {
  const polygons = rings.filter(ring => signedArea(ring) > 0).map(ring => [ring]);
  for (const hole of rings.filter(ring => signedArea(ring) < 0)) {
    const [[a, b], [x, y]] = hole;
    const length = Math.hypot(x - a, y - b);
    const interior = [(a + x) / 2 + (y - b) / length / 8, (b + y) / 2 - (x - a) / length / 8];
    const holder = polygons.filter(([outer]) => pointInRing(interior, outer))
      .sort(([a], [b]) => signedArea(a) - signedArea(b))[0];
    if (!holder) throw new Error('Priority hole has no exterior');
    holder.push(hole);
  }
  return polygons;
}

// Inverse of ESRI:102028 (WGS84 ellipsoidal Albers), for RFC 7946 export.
const radians = Math.PI / 180;
const semiMajor = 6378137;
const e2 = 6.6943799901413165e-3;
const eccentricity = Math.sqrt(e2);
function q(phi) {
  const s = Math.sin(phi);
  return (1 - e2) * (s / (1 - e2 * s * s)
    - Math.log((1 - eccentricity * s) / (1 + eccentricity * s)) / (2 * eccentricity));
}
const squareM = phi => Math.cos(phi) ** 2 / (1 - e2 * Math.sin(phi) ** 2);
const phi1 = 7 * radians;
const phi2 = -32 * radians;
const n = (squareM(phi1) - squareM(phi2)) / (q(phi2) - q(phi1));
const c = squareM(phi1) + n * q(phi1);
const rho0 = semiMajor * Math.sqrt(c - n * q(-15 * radians)) / n;
// Forward ESRI:102028 (lon/lat degrees → metres), used to warp grids onto Web Mercator.
export function albers(lon, lat) {
  const rho = semiMajor * Math.sqrt(c - n * q(lat * radians)) / n;
  const theta = n * (lon - 125) * radians;
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}
export function lonLat(x, y) {
  const sign = Math.sign(n);
  const delta = rho0 - y;
  const rho = sign * Math.hypot(x, delta);
  const theta = Math.atan2(sign * x, sign * delta);
  const target = (c - (rho * n / semiMajor) ** 2) / n;
  let lower = -Math.PI / 2;
  let upper = Math.PI / 2;
  for (let i = 0; i < 39; i += 1) {
    const middle = (lower + upper) / 2;
    if (q(middle) < target) lower = middle;
    else upper = middle;
  }
  return [125 + theta / (n * radians), (lower + upper) / (2 * radians)];
}
