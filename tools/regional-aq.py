"""Regional air quality for the transboundary-haze slide.

* 2019: WashU ACAG V6.GL.03 satellite-derived monthly PM2.5, September 2019
  (Asia file from the coursework RawData, read-only), averaged to 0.1 degree.
* 2026: CAMS global atmospheric-composition model PM2.5 via the Open-Meteo
  air-quality API (no key; only coordinates are sent), monthly means for
  September and October 2026 on a 0.5 degree grid. No satellite PM2.5 product
  exists for 2026 yet, so the two maps are different sources.
* Both years, same source: Singapore NEA hourly PM2.5 (data.gov.sg), daily
  national mean, July-October.

Needs Python with numpy and h5py. Responses are cached in .work/aq-cache/.

    set PEAT_PROJECT_DIR=...\\Rizaldy Project
    python tools/regional-aq.py      # writes data/regional.json
"""
import base64
import json
import os
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import h5py
import numpy as np

APP = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ["PEAT_PROJECT_DIR"]).resolve()
NC = ROOT / "RawData/WashU_PM25_V6GL03/V6GL03.CNNPM25.AS.201909-201909.nc"
CACHE = APP / ".work/aq-cache"
CACHE.mkdir(parents=True, exist_ok=True)
LON0, LON1, LAT0, LAT1 = 95.0, 120.0, -7.0, 7.0
CITIES = {
    "Pekanbaru": (101.45, 0.51), "Palangka Raya": (113.92, -2.21), "Pontianak": (109.34, -0.03),
    "Jambi": (103.61, -1.61), "Palembang": (104.76, -2.98), "Banjarmasin": (114.59, -3.32),
    "Singapore": (103.82, 1.35), "Kuala Lumpur": (101.69, 3.14), "Kuching": (110.36, 1.55), "Jakarta": (106.85, -6.21),
}


def get_json(url, name):
    path = CACHE / name
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "peat-to-lungs-research"}), timeout=60) as r:
                data = json.loads(r.read())
            path.write_text(json.dumps(data))
            return data
        except Exception as exc:  # retry transient failures
            if attempt == 3:
                raise
            time.sleep(2 + 3 * attempt)


def pack(grid):
    """uint8 µg/m³ (1-255, 255 = 255+), 0 = no data."""
    g = np.where(np.isfinite(grid), np.clip(np.round(grid), 1, 255), 0).astype(np.uint8)
    return base64.b64encode(g.tobytes()).decode()


# ---------- 2019 WashU ----------
with h5py.File(NC, "r") as f:
    lat, lon = f["lat"][:], f["lon"][:]
    i0, i1 = np.searchsorted(lat, LAT0), np.searchsorted(lat, LAT1)
    j0, j1 = np.searchsorted(lon, LON0), np.searchsorted(lon, LON1)
    pm = f["PM25"][i0:i1, j0:j1].astype("float64")
fill = pm > 1e4
pm[fill | (pm < 0)] = np.nan
h, w = pm.shape[0] // 10, pm.shape[1] // 10
blocks = pm[: h * 10, : w * 10].reshape(h, 10, w, 10)
with np.errstate(all="ignore"):
    washu = np.nanmean(blocks, axis=(1, 3))
    land = np.isfinite(blocks).mean(axis=(1, 3))
washu[land < 0.3] = np.nan
washu = washu[::-1]  # north-up rows
print("WashU 0.1 deg grid", washu.shape, "max", np.nanmax(washu).round(1))


def washu_at(lon_, lat_):
    r = int((LAT1 - lat_) / 0.1)
    c = int((lon_ - LON0) / 0.1)
    win = washu[max(0, r - 1): r + 2, max(0, c - 1): c + 2]
    return float(np.nanmean(win)) if np.isfinite(win).any() else None


# ---------- 2026 CAMS via Open-Meteo ----------
step = 0.5
lats = np.arange(LAT1, LAT0 - 1e-9, -step)
lons = np.arange(LON0, LON1 + 1e-9, step)
pts = [(la, lo) for la in lats for lo in lons]
sep, octo = np.full(len(pts), np.nan), np.full(len(pts), np.nan)
for k in range(0, len(pts), 100):
    chunk = pts[k:k + 100]
    url = ("https://air-quality-api.open-meteo.com/v1/air-quality?hourly=pm2_5&start_date=2026-09-01&end_date=2026-10-31"
           f"&timezone=UTC&latitude={','.join(f'{a:.2f}' for a, _ in chunk)}&longitude={','.join(f'{b:.2f}' for _, b in chunk)}")
    data = get_json(url, f"cams-grid-{k}.json")
    data = data if isinstance(data, list) else [data]
    for m, d in enumerate(data):
        t = d["hourly"]["time"]
        v = np.array([np.nan if x is None else x for x in d["hourly"]["pm2_5"]], dtype=float)
        is_sep = np.array([s.startswith("2026-09") for s in t])
        sep[k + m] = np.nanmean(v[is_sep])
        octo[k + m] = np.nanmean(v[~is_sep])
    print("CAMS grid", k + len(chunk), "/", len(pts))
cams_sep = sep.reshape(len(lats), len(lons))
cams_oct = octo.reshape(len(lats), len(lons))
# land mask from WashU at 0.5 degree so both maps show land only
with np.errstate(all="ignore"):
    land05 = np.isfinite(washu[: (len(lats) - 1) * 5, : (len(lons) - 1) * 5]).reshape(len(lats) - 1, 5, len(lons) - 1, 5).mean(axis=(1, 3))
mask = np.zeros_like(cams_sep, dtype=bool)
for r in range(len(lats)):
    for c in range(len(lons)):
        rr, cc = min(r, land05.shape[0] - 1), min(c, land05.shape[1] - 1)
        mask[r, c] = land05[rr, cc] < 0.15 and land05[max(rr - 1, 0), cc] < 0.15 and land05[rr, max(cc - 1, 0)] < 0.15
cams_sep[mask], cams_oct[mask] = np.nan, np.nan

city_rows = {}
for name, (lo, la) in CITIES.items():
    d = get_json(f"https://air-quality-api.open-meteo.com/v1/air-quality?hourly=pm2_5&start_date=2026-07-01&end_date=2026-10-31&timezone=UTC&latitude={la}&longitude={lo}",
                 f"cams-city-{name.replace(' ', '_')}.json")
    t = d["hourly"]["time"]
    v = np.array([np.nan if x is None else x for x in d["hourly"]["pm2_5"]], dtype=float)
    daily = [round(float(np.nanmean(v[i:i + 24])), 1) for i in range(0, len(v), 24)]
    city_rows[name] = {
        "lon": lo, "lat": la, "washuSep2019": None if washu_at(lo, la) is None else round(washu_at(lo, la), 1),
        "camsSep2026": round(float(np.nanmean(v[[s.startswith("2026-09") for s in t]])), 1),
        "camsOct2026": round(float(np.nanmean(v[[s.startswith("2026-10") for s in t]])), 1),
        "camsDaily2026": daily,
    }
    print(name, city_rows[name]["washuSep2019"], city_rows[name]["camsSep2026"], city_rows[name]["camsOct2026"])

# ---------- Singapore NEA, both years ----------
singapore = {}
for year in (2019, 2026):
    d0, rows = date(year, 7, 1), []
    while d0 <= date(year, 10, 31):
        js = get_json(f"https://api.data.gov.sg/v1/environment/pm25?date={d0.isoformat()}", f"sg-{d0.isoformat()}.json")
        vals = [sum(i["readings"]["pm25_one_hourly"].values()) / len(i["readings"]["pm25_one_hourly"]) for i in js.get("items", []) if i.get("readings")]
        rows.append(round(sum(vals) / len(vals), 1) if vals else None)
        d0 += timedelta(days=1)
    singapore[year] = rows
    ok = [v for v in rows if v is not None]
    print("Singapore", year, len(ok), "days, max", max(ok), "days >= 37.5:", sum(v >= 37.5 for v in ok))

OUT = APP / "data/regional.json"
OUT.write_text(json.dumps({
    "box": [LON0, LON1, LAT0, LAT1],
    "washu2019": {"step": 0.1, "w": washu.shape[1], "h": washu.shape[0], "pm": pack(washu)},
    "cams2026": {"step": step, "w": len(lons), "h": len(lats), "sep": pack(cams_sep), "oct": pack(cams_oct)},
    "cities": city_rows,
    "singapore": {"start": "07-01", "daily": singapore},
    "sources": {
        "washu": "WashU ACAG V6.GL.03 CNN PM2.5, monthly, Sept 2019",
        "cams": "CAMS global atmospheric composition forecasts via Open-Meteo, 2026",
        "nea": "Singapore NEA hourly PM2.5, data.gov.sg (Singapore Open Data Licence)",
    },
}, separators=(",", ":")))
print("wrote", OUT, OUT.stat().st_size // 1024, "KB")
