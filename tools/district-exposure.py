"""Daily PM2.5 exposure per area, July-October 2026 (CAMS via Open-Meteo).

For each area in data/overview.json (label point), fetch hourly CAMS PM2.5, take daily
means and summarise exposure length:
  mean      season mean PM2.5 (µg/m³)
  unhealthy days with a daily mean >= 55.5 µg/m³ (ISPU "unhealthy" band)
  over15    days above the WHO 24-hour guideline (15 µg/m³)
  longest   longest run of unhealthy days
No 2019 daily product is available without an account, so this covers 2026.
Responses are cached in .work/aq-cache/.  Writes data/exposure2026.json.
"""
import hashlib
import json
import time
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
CACHE = APP / ".work/aq-cache"
CACHE.mkdir(parents=True, exist_ok=True)
zones = json.loads((APP / "data/overview.json").read_text())["zones"]


def get_json(url, name):
    path = CACHE / name
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "peat-to-lungs-research"})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read())
            path.write_text(json.dumps(data))
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 + 4 * attempt)


rows = []
for k in range(0, len(zones), 100):
    chunk = zones[k:k + 100]
    lat = ",".join(f"{z['lonlat'][1]:.3f}" for z in chunk)
    lon = ",".join(f"{z['lonlat'][0]:.3f}" for z in chunk)
    url = ("https://air-quality-api.open-meteo.com/v1/air-quality?hourly=pm2_5&start_date=2026-07-01&end_date=2026-10-31"
           f"&timezone=Asia%2FJakarta&latitude={lat}&longitude={lon}")
    # cache key from the coordinates, so a new set of areas never reuses stale responses
    data = get_json(url, f"area-{hashlib.sha1((lat + lon).encode()).hexdigest()[:12]}.json")
    data = data if isinstance(data, list) else [data]
    for z, d in zip(chunk, data):
        h = d["hourly"]["pm2_5"]
        daily = []
        for i in range(0, len(h), 24):
            v = [x for x in h[i:i + 24] if x is not None]
            daily.append(sum(v) / len(v) if v else None)
        ok = [v for v in daily if v is not None]
        run = best = 0
        for v in daily:
            run = run + 1 if v is not None and v >= 55.5 else 0
            best = max(best, run)
        rows.append({
            "daily": [None if v is None else round(v, 1) for v in daily],
            "mean": round(sum(ok) / len(ok), 1),
            "unhealthy": sum(v >= 55.5 for v in ok),
            "over15": sum(v > 15 for v in ok),
            "longest": best,
        })
    print("areas", k + len(chunk))

(APP / "data/exposure2026.json").write_text(json.dumps({
    "source": "CAMS global atmospheric composition forecasts via Open-Meteo; daily means of hourly PM2.5 at area label points, Jul 1 - Oct 31 2026 (WIB days)",
    "thresholds": {"unhealthy": 55.5, "who": 15},
    "districts": rows,
}, separators=(",", ":")))
u = sorted(r["unhealthy"] for r in rows)
print("unhealthy days: min", u[0], "median", u[len(u) // 2], "max", u[-1])
