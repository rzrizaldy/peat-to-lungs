"""Export a light Indonesia province basemap for the 3D fire terrain.

Reads GADM 4.1 level-1 (provinces) straight from the read-only starting-files
zip with the standard library only (no GDAL needed), projects to ESRI:102028,
simplifies with Douglas-Peucker and clips to the Sumatra-Borneo frame.

    python tools/export-basemap.py            # writes data/basemap.json

PEAT_PROJECT_DIR points at the "Rizaldy Project" folder when the site lives
elsewhere; the GADM zip sits in its sibling "Past Rizaldy GIS" folder.
"""
import json
import math
import os
import struct
import zipfile
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("PEAT_PROJECT_DIR", APP.parent)).resolve()
ZIP = ROOT.parent / "Past Rizaldy GIS/#8 - Indonesia Deforestation/starting_files/gadm41_IDN_shp.zip"
OUT = APP / "data/basemap.json"
BOX = (-3_150_000, 850_000, -450_000, 2_450_000)   # xmin, ymin, xmax, ymax in metres
TOL = 1_500                                          # simplification tolerance, metres

# ESRI:102028 Asia South Albers Equal Area Conic (WGS84)
A, E2 = 6378137.0, 6.6943799901413165e-3
E = math.sqrt(E2)
R = math.pi / 180


def q(phi):
    s = math.sin(phi)
    return (1 - E2) * (s / (1 - E2 * s * s) - math.log((1 - E * s) / (1 + E * s)) / (2 * E))


def m2(phi):
    return math.cos(phi) ** 2 / (1 - E2 * math.sin(phi) ** 2)


P1, P2 = 7 * R, -32 * R
N = (m2(P1) - m2(P2)) / (q(P2) - q(P1))
C = m2(P1) + N * q(P1)
RHO0 = A * math.sqrt(C - N * q(-15 * R)) / N


def albers(lon, lat):
    rho = A * math.sqrt(C - N * q(lat * R)) / N
    th = N * (lon - 125) * R
    return rho * math.sin(th), RHO0 - rho * math.cos(th)


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        den = math.hypot(dx, dy) or 1e-9
        best, at = -1.0, -1
        for i in range(a + 1, b):
            d = abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / den
            if d > best:
                best, at = d, i
        if best > tol:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]


def records(shp):
    pos = 100
    while pos < len(shp):
        _, length = struct.unpack(">ii", shp[pos:pos + 8])
        body = shp[pos + 8:pos + 8 + 2 * length]
        pos += 8 + 2 * length
        if struct.unpack("<i", body[:4])[0] != 5:
            yield []
            continue
        nparts, npts = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{nparts}i", body[44:44 + 4 * nparts])) + [npts]
        xy = struct.unpack(f"<{2 * npts}d", body[44 + 4 * nparts:44 + 4 * nparts + 16 * npts])
        yield [[(xy[2 * j], xy[2 * j + 1]) for j in range(parts[k], parts[k + 1])] for k in range(nparts)]


def names(dbf):
    count, header, size = struct.unpack("<IHH", dbf[4:12])
    fields, off = [], 32
    while dbf[off] != 0x0D:
        fields.append((dbf[off:off + 11].split(b"\0")[0].decode(), dbf[off + 16]))
        off += 32
    out = []
    for r in range(count):
        rec, cur, row = dbf[header + r * size + 1:header + (r + 1) * size], 0, {}
        for name, width in fields:
            row[name] = rec[cur:cur + width].decode("utf8", "ignore").strip()
            cur += width
        out.append(row)
    return out


def main():
    with zipfile.ZipFile(ZIP) as z:
        shp = z.read("gadm41_IDN_1.shp")
        rows = names(z.read("gadm41_IDN_1.dbf"))
    xmin, ymin, xmax, ymax = BOX
    provinces = []
    for row, rings in zip(rows, records(shp)):
        kept = []
        for ring in rings:
            pts = [albers(lon, lat) for lon, lat in ring]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if max(xs) < xmin or min(xs) > xmax or max(ys) < ymin or min(ys) > ymax:
                continue
            if (max(xs) - min(xs)) * (max(ys) - min(ys)) < (3 * TOL) ** 2:
                continue  # drop islets smaller than the display resolution
            # closed ring: split at the vertex farthest from the start, simplify both halves
            far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
            s = simplify(pts[:far + 1], TOL) + simplify(pts[far:], TOL)[1:]
            if len(s) >= 4:
                kept.append([[round(x / 100) * 100, round(y / 100) * 100] for x, y in s])
        if kept:
            provinces.append({"name": row.get("NAME_1", ""), "rings": kept})
    OUT.write_text(json.dumps({"source": "GADM 4.1 level 1, ESRI:102028, simplified 1.5 km", "provinces": provinces}, separators=(",", ":")))
    print(f"{len(provinces)} provinces, {sum(len(r) for p in provinces for r in p['rings'])} vertices -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
