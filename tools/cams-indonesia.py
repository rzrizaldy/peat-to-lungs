"""October 2026 CAMS PM2.5 for all of Indonesia, for the opening map (#atlas).

The story's grid (tools/regional-aq.py → data/regional.json) covers 95–120° E, 7° S–7° N. This script widens it to
95–141° E, 11° S–7° N with the same source and method: CAMS global atmospheric-composition model via the Open-Meteo
air-quality API (no key; only coordinates are sent), hourly PM2.5 in UTC, monthly mean on a 0.5° grid. Values inside
the old box are copied from regional.json; new points are fetched only where a 0.5° cell touches Indonesian land
(data/atlas.json). October 2026 is the season peak, so only that month is kept.

    python tools/cams-indonesia.py      # writes data/cams-indonesia.json (responses cached in .work/aq-cache/)
"""
import base64
import json
import time
import urllib.request
from pathlib import Path

import numpy as np

APP = Path(__file__).resolve().parents[1]
CACHE = APP / '.work/aq-cache'
CACHE.mkdir(parents=True, exist_ok=True)
STEP, LON0, LON1, LAT0, LAT1 = 0.5, 95.0, 141.0, -11.0, 7.0


def get_json(url, name):
    path = CACHE / name
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'peat-to-lungs-research'}), timeout=90) as r:
                data = json.loads(r.read())
            path.write_text(json.dumps(data))
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 + 5 * attempt)


def unpack(b64, n):
    return np.frombuffer(base64.b64decode(b64), np.uint8)[:n].astype(float)


lats = np.round(np.arange(LAT1, LAT0 - 1e-9, -STEP), 2)
lons = np.round(np.arange(LON0, LON1 + 1e-9, STEP), 2)
grid = np.full((lats.size, lons.size), np.nan)

# 1. copy the story's October values (same source, same method)
reg = json.loads((APP / 'data/regional.json').read_text())
g = reg['cams2026']
o_lon0, o_lon1, o_lat0, o_lat1 = reg['box']
old = unpack(g['oct'], g['w'] * g['h']).reshape(g['h'], g['w'])
for r in range(g['h']):
    for c in range(g['w']):
        la, lo = o_lat1 - r * STEP, o_lon0 + c * STEP
        if old[r, c] > 0:
            grid[np.searchsorted(-lats, -la), np.searchsorted(lons, lo)] = old[r, c]
in_old = lambda la, lo: o_lat0 - 1e-9 <= la <= o_lat1 + 1e-9 and o_lon0 - 1e-9 <= lo <= o_lon1 + 1e-9

# 2. which 0.5° points touch Indonesian land (atlas cells within ±0.25°)
atlas = json.loads((APP / 'data/atlas.json').read_text())
ag = atlas['grid']
idx = np.frombuffer(base64.b64decode(atlas['idx']), '<u4')
clon = ag['x0'] + (idx % ag['cols'] + 0.5) * ag['cell']
clat = ag['y0'] - (idx // ag['cols'] + 0.5) * ag['cell']
need = np.zeros(grid.shape, bool)
need[np.clip(np.round((LAT1 - clat) / STEP).astype(int), 0, lats.size - 1),
     np.clip(np.round((clon - LON0) / STEP).astype(int), 0, lons.size - 1)] = True
pts = [(r, c) for r, c in zip(*np.nonzero(need)) if not in_old(lats[r], lons[c])]
print('new points to fetch:', len(pts))

# 3. fetch October 2026 hourly PM2.5, 100 points per request, monthly mean
for k in range(0, len(pts), 100):
    chunk = pts[k:k + 100]
    url = ('https://air-quality-api.open-meteo.com/v1/air-quality?hourly=pm2_5&start_date=2026-10-01&end_date=2026-10-31'
           f"&timezone=UTC&latitude={','.join(f'{lats[r]:.2f}' for r, _ in chunk)}"
           f"&longitude={','.join(f'{lons[c]:.2f}' for _, c in chunk)}")
    data = get_json(url, f'cams-idn-oct-{k}.json')
    data = data if isinstance(data, list) else [data]
    for (r, c), d in zip(chunk, data):
        v = np.array([np.nan if x is None else x for x in d['hourly']['pm2_5']], float)
        if np.isfinite(v).any():
            grid[r, c] = np.nanmean(v)
    print('fetched', min(k + 100, len(pts)), '/', len(pts))
    time.sleep(1)

packed = np.where(np.isfinite(grid), np.clip(np.round(grid), 1, 255), 0).astype(np.uint8)
out = {
    'source': 'CAMS global atmospheric composition forecasts via Open-Meteo; October 2026 monthly mean of hourly PM2.5 (UTC); '
              'inside 95–120° E, 7° S–7° N copied from data/regional.json, elsewhere fetched by tools/cams-indonesia.py',
    'step': STEP, 'lon0': LON0, 'lat1': LAT1, 'w': int(lons.size), 'h': int(lats.size),
    'oct': base64.b64encode(packed.tobytes()).decode(),
}
(APP / 'data/cams-indonesia.json').write_text(json.dumps(out, separators=(',', ':')))
print('points with data:', int((packed > 0).sum()), '· new:', len(pts),
      '· mean of new points:', round(float(np.nanmean([grid[r, c] for r, c in pts])), 1))
