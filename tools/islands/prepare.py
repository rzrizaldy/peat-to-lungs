"""Island-wide inputs for the web story: every kecamatan on Sumatra and Kalimantan.

Open-source replacement for tools/export-inputs.py (which reads the ArcGIS project
geodatabase for Riau and Central Kalimantan only). Same output contract:
.work/gis-inputs.json plus .work/fire-<province>-<year>.f32, so tools/build-data.mjs
runs unchanged in spirit. The ArcGIS coursework stays focused on the two provinces;
this script only feeds the web companion.

Inputs (read-only):
  PEAT_PROJECT_DIR/RawData/...   FIRMS 2019/2026, HDX admin, WorldPop 2020, WashU PM2.5
                                 Sept 2019, Hansen loss year tiles (100E, 110E)
  starting_files/                MapBiomas Indonesia 2000, Natural Earth countries
  raw/hansen/                    Hansen loss year tiles 00N_090E and 10N_090E (western Sumatra)
  raw/peat/                      GFW Indonesia peat lands, national (same layer as the
                                 Riau/Kalteng extracts; areas reproduce ArcGIS exactly)
See tools/islands/SOURCES.md and tools/islands/fetch.sh.

Stages cache to .work/islands/ so a rerun skips finished work:
  zones -> hotspots -> land (forest, loss, peat per zone at 30 m) -> people (WorldPop, PM)
  -> assemble.
Run:  .venv/Scripts/python tools/islands/prepare.py [--stage all|zones|hotspots|land|people|assemble]
"""
import argparse
import csv
import json
import math
import os
import pickle
import time
import zipfile
from pathlib import Path

import numpy as np
import rasterio
import shapely
from netCDF4 import Dataset
from pyogrio.raw import read
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.windows import Window, from_bounds

APP = Path(__file__).resolve().parents[2]
ROOT = Path(os.environ.get("PEAT_PROJECT_DIR", APP.parent)).resolve()
RAW = ROOT / "RawData"
STARTING = ROOT.parent / "Past Rizaldy GIS/#8 - Indonesia Deforestation/starting_files"
LOCAL = APP / "raw"
WORK = APP / ".work"
CACHE = WORK / "islands"
CACHE.mkdir(parents=True, exist_ok=True)

ISLANDS = {
    "Sumatra": ["ID11", "ID12", "ID13", "ID14", "ID15", "ID16", "ID17", "ID18"],
    "Kalimantan": ["ID61", "ID62", "ID63", "ID64", "ID65"],
}
ISLAND_OF = {p: i for i, ps in ISLANDS.items() for p in ps}
SHORT = {"ID11": "Aceh", "ID12": "N. Sumatra", "ID13": "W. Sumatra", "ID14": "Riau", "ID15": "Jambi",
         "ID16": "S. Sumatra", "ID17": "Bengkulu", "ID18": "Lampung", "ID61": "W. Kalimantan",
         "ID62": "C. Kalimantan", "ID63": "S. Kalimantan", "ID64": "E. Kalimantan", "ID65": "N. Kalimantan"}
YEARS = (2019, 2026)
CELL = 2000          # model grid, metres (equal area)
BUFFER = 100_000     # fire points kept around each province for the kernel edge
EA = "ESRI:102028"   # Asia South Albers Equal Area Conic, as in the ArcGIS project
TO_EA = Transformer.from_crs(4326, EA, always_xy=True)
TO_WGS = Transformer.from_crs(EA, 4326, always_xy=True)
R_KM = 6371.0072     # authalic radius for geographic cell areas
FOREST_CLASSES = (3, 4, 5, 6)  # MapBiomas Indonesia forest classes
LOSS_LAST = 19       # Hansen loss years 1..19 = 2001..2019


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def cached(name, build):
    path = CACHE / f"{name}.pkl"
    if path.exists():
        return pickle.loads(path.read_bytes())
    value = build()
    path.write_bytes(pickle.dumps(value, protocol=5))
    return value


def ea_geom(g):
    return shapely.transform(g, lambda xy: np.column_stack(TO_EA.transform(xy[:, 0], xy[:, 1])))


def parts(geometry):
    """Polygon rings as rounded integer metre coordinates, as the old exporter wrote them."""
    out = []
    for poly in getattr(geometry, "geoms", [geometry]):
        if poly.is_empty or poly.geom_type != "Polygon":
            continue
        rings = [poly.exterior, *poly.interiors]
        out.append([[[round(x), round(y)] for x, y in ring.coords] for ring in rings])
    return out


# ------------------------------------------------------------------ zones
FOCUS = ("ID14", "ID62")   # kecamatan, as in the ArcGIS deep dive; the other provinces use kabupaten


def admin_rows(level, keep):
    path = "zip://" + (RAW / "HDX_COD_AB_IDN/idn_admin_boundaries.gdb.zip").as_posix()
    cols = [f"adm{k}_{f}" for k in range(level, 0, -1) for f in ("pcode", "name")]
    meta, _, geoms, fields = read(path, layer=f"idn_admin{level}", columns=cols)
    names = list(meta["fields"])   # pyogrio keeps the layer's field order, not the requested one
    rows = [dict(zip(names, values)) | {"geom": g} for *values, g in zip(*fields, geoms)]
    return [r for r in rows if r["adm1_pcode"] in keep]


def build_zones():
    rows = [r | {"level": "kecamatan", "id": r["adm3_pcode"], "name": r["adm3_name"]}
            for r in admin_rows(3, FOCUS)]
    rows += [r | {"level": "kabupaten", "id": r["adm2_pcode"], "name": r["adm2_name"]}
             for r in admin_rows(2, [p for p in ISLAND_OF if p not in FOCUS])]
    rows.sort(key=lambda r: r["id"])
    zones, wgs, ea = [], [], []
    for r in rows:
        g = shapely.make_valid(shapely.from_wkb(r["geom"]))
        g = shapely.union_all([p for p in getattr(g, "geoms", [g]) if p.geom_type in ("Polygon", "MultiPolygon")])
        e = ea_geom(g)
        marker = e.point_on_surface()
        lon, lat = TO_WGS.transform(marker.x, marker.y)
        zones.append({
            "id": r["id"], "name": r["name"], "level": r["level"], "regency": r["adm2_name"], "regencyId": r["adm2_pcode"],
            "province": r["adm1_pcode"], "provinceName": r["adm1_name"], "island": ISLAND_OF[r["adm1_pcode"]],
            "area": e.area / 1e6, "center": [marker.x, marker.y], "lonlat": [lon, lat],
            "shape": parts(e.simplify(250, preserve_topology=True)),
        })
        wgs.append(g)
        ea.append(e)
    assert len({z["id"] for z in zones}) == len(zones)
    provinces = {}
    for p in ISLAND_OF:
        members = [e for z, e in zip(zones, ea) if z["province"] == p]
        provinces[p] = shapely.union_all(members)
    log("zones", len(zones), {i: sum(z["island"] == i for z in zones) for i in ISLANDS})
    return {"zones": zones, "wgs": wgs, "ea": ea, "provinces": provinces}


# ------------------------------------------------------------------ hotspots
def read_firms():
    files = {2019: [RAW / "FIRMS_VIIRS_2019/viirs-snpp_2019_Indonesia.csv"],
             2026: [RAW / "FIRMS_VIIRS_2026/VIIRS_SNPP_SP_SumKal_2026-07.csv",
                    RAW / "FIRMS_VIIRS_2026/VIIRS_SNPP_NRT_SumKal_2026-08_10.csv"]}
    out = {}
    for year, paths in files.items():
        seen, lat, lon, frp, month = set(), [], [], [], []
        for path in paths:
            with path.open(newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    d = row["acq_date"]
                    if not (f"{year}-07-01" <= d <= f"{year}-10-31"):
                        continue
                    if row["confidence"] not in ("n", "h"):
                        continue
                    if row.get("type") not in (None, "", "0"):
                        continue
                    key = tuple(row.values())
                    if key in seen:
                        continue
                    seen.add(key)
                    lat.append(float(row["latitude"])); lon.append(float(row["longitude"]))
                    frp.append(float(row["frp"])); month.append(int(d[5:7]))
        out[year] = {"lon": np.array(lon), "lat": np.array(lat), "frp": np.array(frp), "month": np.array(month, np.int8)}
        log("firms", year, len(lon))
    return out


class Hansen:
    """Loss year mosaic over the six 10-degree tiles, read by window."""
    def __init__(self):
        self.tiles = {}
        for top in (10, 0):
            for left in (90, 100, 110):
                name = f"Hansen_GFC-2024-v1.12_lossyear_{top:02d}N_{left:03d}E.tif"
                path = LOCAL / "hansen" / name if left == 90 else RAW / "Hansen_GFC_v1_12" / name
                self.tiles[(top, left)] = rasterio.open(path)
        self.res = 0.00025

    def sample(self, lon, lat):
        out = np.zeros(len(lon), np.uint8)
        for (top, left), src in self.tiles.items():
            m = (lon >= left) & (lon < left + 10) & (lat <= top) & (lat > top - 10)
            if not m.any():
                continue
            col = np.floor((lon[m] - left) / self.res).astype(int)
            row = np.floor((top - lat[m]) / self.res).astype(int)
            r0, r1, c0, c1 = row.min(), row.max() + 1, col.min(), col.max() + 1
            # read in strips so one sample never loads a whole tile
            vals = np.zeros(m.sum(), np.uint8)
            for s in range(r0, r1, 4000):
                sel = (row >= s) & (row < min(s + 4000, r1))
                if not sel.any():
                    continue
                win = src.read(1, window=Window(c0, s, c1 - c0, min(4000, r1 - s)))
                vals[sel] = win[row[sel] - s, col[sel] - c0]
            out[m] = vals
        return out

    def block(self, west, north, width, height, res):
        """Nearest-neighbour loss year on a destination grid (west, north, res)."""
        lon = west + (np.arange(width) + 0.5) * res
        lat = north - (np.arange(height) + 0.5) * res
        out = np.zeros((height, width), np.uint8)
        for (top, left), src in self.tiles.items():
            cm = (lon >= left) & (lon < left + 10)
            rm = (lat <= top) & (lat > top - 10)
            if not cm.any() or not rm.any():
                continue
            cols = np.floor((lon[cm] - left) / self.res).astype(int)
            rows = np.floor((top - lat[rm]) / self.res).astype(int)
            win = src.read(1, window=Window(cols.min(), rows.min(), cols.max() - cols.min() + 1, rows.max() - rows.min() + 1))
            sub = win[np.ix_(rows - rows.min(), cols - cols.min())]
            out[np.ix_(np.flatnonzero(rm), np.flatnonzero(cm))] = sub
        return out


def mapbiomas():
    return rasterio.open(STARTING / "indonesia_coverage_2000.tif")


def sample_raster(src, lon, lat):
    out = np.zeros(len(lon), src.dtypes[0])
    west, north, res = src.bounds.left, src.bounds.top, src.res[0]
    col = np.floor((lon - west) / res).astype(int)
    row = np.floor((north - lat) / res).astype(int)
    ok = (col >= 0) & (col < src.width) & (row >= 0) & (row < src.height)
    idx = np.flatnonzero(ok)
    order = idx[np.argsort(row[idx])]
    for s in range(0, len(order), 20000):
        chunk = order[s:s + 20000]
        r, c = row[chunk], col[chunk]
        # one point at a time would be slow; read per 512-row strip
        for rs in np.unique(r // 512):
            sel = chunk[(r // 512) == rs]
            rr, cc = row[sel], col[sel]
            win = src.read(1, window=Window(cc.min(), rr.min(), cc.max() - cc.min() + 1, rr.max() - rr.min() + 1))
            out[sel] = win[rr - rr.min(), cc - cc.min()]
    return out


def peat_polygons():
    _, _, geoms, _ = read((LOCAL / "peat/GFW_Indonesia_peat_lands_national.geojson").as_posix(), columns=[])
    polys = [shapely.make_valid(shapely.force_2d(shapely.from_wkb(g))) for g in geoms]
    return [p for p in polys if not p.is_empty]


def build_hotspots(Z):
    firms = read_firms()
    tree = shapely.STRtree(Z["wgs"])
    peat = peat_polygons()
    peat_tree = shapely.STRtree(peat)
    hansen, mb = Hansen(), mapbiomas()
    buffers = {p: g.buffer(BUFFER) for p, g in Z["provinces"].items()}
    for b in buffers.values():
        shapely.prepare(b)
    out = {}
    for year, f in firms.items():
        pts = shapely.points(f["lon"], f["lat"])
        zone = np.full(len(pts), -1)
        pi, zi = tree.query(pts, predicate="within")
        zone[pi] = zi
        on_peat = np.zeros(len(pts), bool)
        on_peat[np.unique(peat_tree.query(pts, predicate="within")[0])] = True
        loss = hansen.sample(f["lon"], f["lat"])
        forest = np.isin(sample_raster(mb, f["lon"], f["lat"]), FOREST_CLASSES)
        x, y = TO_EA.transform(f["lon"], f["lat"])
        near = {p: shapely.contains_xy(b, x, y) for p, b in buffers.items()}
        out[year] = {"x": x, "y": y, "frp": f["frp"], "month": f["month"], "zone": zone, "peat": on_peat,
                     "cleared": forest & (loss >= 1) & (loss <= LOSS_LAST),
                     "remaining": forest & ~((loss >= 1) & (loss <= LOSS_LAST)), "near": near}
        log("hotspots", year, "in zones", int((zone >= 0).sum()), "on peat", int(on_peat[zone >= 0].sum()))
    return out


# ------------------------------------------------------------------ land: forest, loss, peat per zone
A_KM, E2 = 6378.137, 6.69437999014e-3   # WGS 84


def _q(phi):
    """Snyder's q(φ): area on the ellipsoid between the equator and φ is a²·q/2 per radian of longitude."""
    e = math.sqrt(E2)
    s = np.sin(phi)
    return (1 - E2) * (s / (1 - E2 * s * s) - np.log((1 - e * s) / (1 + e * s)) / (2 * e))


def cell_area_rows(north, height, res):
    """Exact ellipsoidal area (km²) of one geographic cell in each row. A sphere is off by ~0.45% near the equator."""
    top = np.radians(north - np.arange(height) * res)
    bottom = np.radians(north - (np.arange(height) + 1) * res)
    return A_KM ** 2 / 2 * math.radians(res) * (_q(top) - _q(bottom))


def build_land(Z):
    n = len(Z["zones"])
    acc = {k: np.zeros(n + 1) for k in ("forest", "loss", "peat", "peatLoss")}
    tree = shapely.STRtree(Z["wgs"])
    peat = peat_polygons()
    peat_tree = shapely.STRtree(peat)
    hansen, mb = Hansen(), mapbiomas()
    res, size = mb.res[0], 4096
    for island, codes in ISLANDS.items():
        bounds = shapely.union_all([Z["wgs"][i] for i, z in enumerate(Z["zones"]) if z["island"] == island]).bounds
        win = from_bounds(*bounds, transform=mb.transform).round_offsets().round_lengths()
        blocks = [(r, c) for r in range(int(win.row_off), int(win.row_off + win.height), size)
                  for c in range(int(win.col_off), int(win.col_off + win.width), size)]
        log("land", island, len(blocks), "blocks")
        for k, (r, c) in enumerate(blocks):
            h = min(size, int(win.row_off + win.height) - r)
            w = min(size, int(win.col_off + win.width) - c)
            west, north = mb.transform * (c, r)
            box = shapely.box(west, north - h * res, west + w * res, north)
            ids = tree.query(box, predicate="intersects")
            if not len(ids):
                continue
            t = from_origin(west, north, res, res)
            zone = rasterize(((Z["wgs"][i], i + 1) for i in ids), out_shape=(h, w), transform=t, fill=0, dtype="int32")
            if not zone.any():
                continue
            cover = mb.read(1, window=Window(c, r, w, h))
            forest = np.isin(cover, FOREST_CLASSES)
            loss_year = hansen.block(west, north, w, h, res)
            lost = forest & (loss_year >= 1) & (loss_year <= LOSS_LAST)
            pids = peat_tree.query(box, predicate="intersects")
            on_peat = rasterize(((peat[i], 1) for i in pids), out_shape=(h, w), transform=t, fill=0, dtype="uint8").astype(bool) if len(pids) else np.zeros((h, w), bool)
            area = np.broadcast_to(cell_area_rows(north, h, res)[:, None], (h, w))
            zf = zone.ravel()
            for key, mask in (("forest", forest), ("loss", lost), ("peat", on_peat), ("peatLoss", lost & on_peat)):
                acc[key] += np.bincount(zf, weights=(area * mask).ravel(), minlength=n + 1)
            if k % 10 == 0:
                log("land", island, f"{k + 1}/{len(blocks)}")
    return {k: v[1:] for k, v in acc.items()}


# ------------------------------------------------------------------ people and Sept 2019 PM2.5
class WashU:
    def __init__(self):
        nc = Dataset(RAW / "WashU_PM25_V6GL03/V6GL03.CNNPM25.AS.201909-201909.nc")
        lat, lon = nc["lat"][:].data, nc["lon"][:].data
        li = np.flatnonzero((lat > -9) & (lat < 9)); lj = np.flatnonzero((lon > 93) & (lon < 122))
        v = nc["PM25"][li.min():li.max() + 1, lj.min():lj.max() + 1]
        self.pm = np.where(np.ma.getmaskarray(v) | (np.ma.getdata(v) > 1e30) | (np.ma.getdata(v) < 0), np.nan, np.ma.getdata(v)).astype(np.float32)
        self.lat, self.lon = lat[li.min():li.max() + 1], lon[lj.min():lj.max() + 1]
        self.dlat, self.dlon = self.lat[1] - self.lat[0], self.lon[1] - self.lon[0]
        nc.close()

    def sample(self, lon, lat):
        i = np.rint((lat - self.lat[0]) / self.dlat).astype(int)
        j = np.rint((lon - self.lon[0]) / self.dlon).astype(int)
        ok = (i >= 0) & (i < len(self.lat)) & (j >= 0) & (j < len(self.lon))
        out = np.full(len(lon), np.nan, np.float32)
        out[ok] = self.pm[i[ok], j[ok]]
        return out


def grid_bounds(envelope, cell):
    west, south, east, north = envelope
    x0 = math.floor(west / cell) * cell
    y0 = math.ceil(north / cell) * cell
    return {"width": math.ceil((east - x0) / cell), "height": math.ceil((y0 - south) / cell), "x0": x0, "y0": y0}


def build_people(Z):
    zones = Z["zones"]
    n = len(zones)
    washu = WashU()
    grids = {}
    for p, outline in Z["provinces"].items():
        g = grid_bounds(outline.bounds, CELL)
        members = [i for i, z in enumerate(zones) if z["province"] == p]
        zi = rasterize(((Z["ea"][i], i + 1) for i in members), out_shape=(g["height"], g["width"]),
                       transform=from_origin(g["x0"], g["y0"], CELL, CELL), fill=0, dtype="int32").ravel() - 1
        grids[p] = g | {"zone_index": zi, "ledger": {}, "pm_sum": np.zeros(zi.size), "pm_w": np.zeros(zi.size)}
    zone_pop, zone_pm, zone_pmw = np.zeros(n), np.zeros(n), np.zeros(n)
    tree_ea = shapely.STRtree(Z["ea"])
    tree = shapely.STRtree(Z["wgs"])
    seam_people = dropped = 0.0
    with rasterio.open(RAW / "WorldPop_2020/idn_pop_2020_CN_100m_R2025A_v1.tif") as src:
        res, size = src.res[0], 4096
        for island in ISLANDS:
            bounds = shapely.union_all([Z["wgs"][i] for i, z in enumerate(zones) if z["island"] == island]).bounds
            win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
            r_end, c_end = int(win.row_off + win.height), int(win.col_off + win.width)
            for r in range(max(0, int(win.row_off)), min(r_end, src.height), size):
                for c in range(max(0, int(win.col_off)), min(c_end, src.width), size):
                    h, w = min(size, r_end - r, src.height - r), min(size, c_end - c, src.width - c)
                    pop = src.read(1, window=Window(c, r, w, h))
                    pop = np.where((pop > 0) & np.isfinite(pop) & (pop != src.nodata), pop, 0).astype(np.float64)
                    if not pop.any():
                        continue
                    west, north = src.transform * (c, r)
                    box = shapely.box(west, north - h * res, west + w * res, north)
                    ids = tree.query(box, predicate="intersects")
                    t = from_origin(west, north, res, res)
                    zone = rasterize(((Z["wgs"][i], i + 1) for i in ids), out_shape=(h, w), transform=t, fill=0, dtype="int32") - 1 if len(ids) else np.full((h, w), -1, np.int32)
                    rr, cc = np.nonzero(pop)
                    people = pop[rr, cc]
                    zz = zone[rr, cc].astype(np.int64)
                    lon, lat = west + (cc + 0.5) * res, north - (rr + 0.5) * res
                    x, y = TO_EA.transform(lon, lat)
                    seam = zz < 0
                    if seam.any():
                        # pixels on a boundary seam or a coastline sliver: nearest zone within 1 km
                        pts = shapely.points(x[seam], y[seam])
                        (src_i, zone_i), dist = tree_ea.query_nearest(pts, max_distance=1000, return_distance=True, all_matches=False)
                        fill = np.full(seam.sum(), -1); fill[src_i] = zone_i
                        zz[np.flatnonzero(seam)] = fill
                        seam_people += people[np.flatnonzero(seam)][fill >= 0].sum()
                    keep = zz >= 0
                    dropped += people[~keep].sum()
                    people, zz, lon, lat, x, y = people[keep], zz[keep], lon[keep], lat[keep], x[keep], y[keep]
                    pm = washu.sample(lon, lat)
                    np.add.at(zone_pop, zz, people)
                    ok = np.isfinite(pm)
                    np.add.at(zone_pm, zz[ok], pm[ok] * people[ok]); np.add.at(zone_pmw, zz[ok], people[ok])
                    prov = np.array([zones[i]["province"] for i in range(n)])[zz]
                    for p in np.unique(prov):
                        m = prov == p
                        g = grids[p]
                        gx = np.floor((x[m] - g["x0"]) / CELL).astype(np.int64)
                        gy = np.floor((g["y0"] - y[m]) / CELL).astype(np.int64)
                        assert np.all((gx >= 0) & (gx < g["width"]) & (gy >= 0) & (gy < g["height"])), p
                        cell = gy * g["width"] + gx
                        key = zz[m] * 10_000_000 + cell
                        uk, inv = np.unique(key, return_inverse=True)
                        sums = np.bincount(inv, weights=people[m])
                        led = g["ledger"]
                        for k_, s_ in zip(uk.tolist(), sums.tolist()):
                            led[k_] = led.get(k_, 0.0) + s_
                        okm = ok[m]
                        np.add.at(g["pm_sum"], cell[okm], pm[m][okm] * people[m][okm])
                        np.add.at(g["pm_w"], cell[okm], people[m][okm])
                    log("people", island, r, c, f"{zone_pop.sum() / 1e6:.2f}M")
    log("seam people reassigned", round(seam_people), "people outside all zones (Kepri, Babel, sea)", round(dropped))
    zone_pm25 = np.divide(zone_pm, zone_pmw, out=np.full(n, np.nan), where=zone_pmw > 0)
    centre = washu.sample(np.array([z["lonlat"][0] for z in zones]), np.array([z["lonlat"][1] for z in zones]))
    zone_pm25 = np.where(np.isfinite(zone_pm25), zone_pm25, centre)
    # last resort for an uninhabited coastal zone whose centre sits on a sea pixel: regency mean
    for i in np.flatnonzero(~np.isfinite(zone_pm25)):
        same = [j for j, z in enumerate(zones) if z["regencyId"] == zones[i]["regencyId"] and np.isfinite(zone_pm25[j])]
        zone_pm25[i] = np.mean(zone_pm25[same])
    out = {}
    for p, g in grids.items():
        nx, ny = g["width"], g["height"]
        keys = np.fromiter(g["ledger"].keys(), np.int64)
        vals = np.fromiter(g["ledger"].values(), np.float64)
        lz, lc = keys // 10_000_000, keys % 10_000_000
        cell_pop = np.bincount(lc, weights=vals, minlength=nx * ny)
        zi = g["zone_index"].copy()
        # populated cells outside the rasterised zones take the zone holding most of their people
        orphan = np.flatnonzero((zi < 0) & (cell_pop > 0))
        for cell in orphan:
            m = lc == cell
            zi[cell] = lz[m][np.argmax(vals[m])]
        cells = np.flatnonzero(zi >= 0)
        rows, cols = np.divmod(cells, nx)
        lon, lat = TO_WGS.transform(g["x0"] + (cols + 0.5) * CELL, g["y0"] - (rows + 0.5) * CELL)
        pm = washu.sample(lon, lat).astype(np.float64)
        missing = ~np.isfinite(pm)
        fb = np.divide(g["pm_sum"][cells], g["pm_w"][cells], out=np.full(len(cells), np.nan), where=g["pm_w"][cells] > 0)
        pm[missing] = np.where(np.isfinite(fb[missing]), fb[missing], zone_pm25[zi[cells][missing]])
        out[p] = {"width": nx, "height": ny, "x0": g["x0"], "y0": g["y0"], "step": CELL,
                  "cells": cells.tolist(), "zone": zi[cells].tolist(), "pop": np.round(cell_pop[cells], 6).tolist(),
                  "pm": np.round(pm, 4).tolist(), "populationLedger": [lz.tolist(), lc.tolist(), np.round(vals, 6).tolist()],
                  "pmFallbackCells": int(missing.sum()), "nativeSeamPixels": int(len(orphan))}
        assert set(lc.tolist()) <= set(cells.tolist()), p
        log("grid", p, "cells", len(cells), "people", round(cell_pop.sum()), "PM fallback", int(missing.sum()))
    return {"zone_pop": zone_pop, "zone_pm25": zone_pm25, "grids": out}


# ------------------------------------------------------------------ assemble
def natural_earth_base():
    path = "zip://" + (STARTING / "ne_110m_admin_0_countries.zip").as_posix()
    _, _, geoms, _ = read(path, columns=[], bbox=(94, -9, 123, 9))
    base = []
    for g in geoms:
        base += parts(ea_geom(shapely.from_wkb(g)))
    return base


def assemble(Z, H, L, P):
    zones = Z["zones"]
    pcode = [z["province"] for z in zones]
    for i, z in enumerate(zones):
        z["population"] = float(P["zone_pop"][i])
        z["popDensity"] = z["population"] / z["area"]
        z["pm25"] = float(P["zone_pm25"][i])
        z["peat"], z["forest"] = float(L["peat"][i]), float(L["forest"][i])
        z["loss"], z["peatLoss"] = float(L["loss"][i]), float(L["peatLoss"][i])
        z["counts"] = [int((H[y]["zone"] == i).sum()) for y in YEARS]
        z["frp"] = [float(H[y]["frp"][H[y]["zone"] == i].sum()) for y in YEARS]
    provinces = {}
    for p, outline in Z["provinces"].items():
        grid = P["grids"][p]
        grid["outline"] = parts(outline.simplify(300, preserve_topology=True))
        grid["name"], grid["short"], grid["island"] = next(z["provinceName"] for z in zones if z["province"] == p), SHORT[p], ISLAND_OF[p]
        grid["seasons"] = {}
        members = np.array([pc == p for pc in pcode])
        for y in YEARS:
            h = H[y]
            inside = (h["zone"] >= 0) & members[np.maximum(h["zone"], 0)]
            near = h["near"][p]
            np.column_stack([h["x"][near], h["y"][near], h["frp"][near]]).astype("<f4").tofile(WORK / f"fire-{p}-{y}.f32")
            grid["seasons"][str(y)] = {
                "months": [int(((h["month"] == m) & inside).sum()) for m in range(7, 11)],
                "total": int(inside.sum()), "buffer": int(near.sum()), "peat": int((h["peat"] & inside).sum()),
                "cleared": int((h["cleared"] & inside).sum()), "remaining": int((h["remaining"] & inside).sum()),
            }
        provinces[p] = grid
        log(p, SHORT[p], {y: grid["seasons"][str(y)]["total"] for y in YEARS})
    with (WORK / "gis-inputs.json").open("w", encoding="utf-8") as fh:
        json.dump({"zones": zones, "base": natural_earth_base(), "provinces": provinces, "islands": ISLANDS},
                  fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    log("wrote .work/gis-inputs.json", len(zones), "zones")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all")
    args = ap.parse_args()
    Z = cached("zones", build_zones)
    if args.stage == "zones":
        return
    H = cached("hotspots", lambda: build_hotspots(Z))
    if args.stage == "hotspots":
        return
    L = cached("land", lambda: build_land(Z))
    if args.stage == "land":
        return
    P = cached("people", lambda: build_people(Z))
    if args.stage == "people":
        return
    assemble(Z, H, L, P)


if __name__ == "__main__":
    main()
