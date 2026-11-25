"""Fire / smoke / people data for the opening map slide (#atlas).

Reads RawData read-only and writes:
  data/atlas.json         0.05° land grid for Indonesia (aligned to WorldPop 2020, 60 × 60 native cells per
                          atlas cell) plus the smoke-layer metadata
  data/atlas-bounds.json  simplified province and regency outlines with exact fire counts
  data/atlas-smoke.png    Sept 2019 PM2.5 over Indonesia and its neighbours (92–142° E, 11° S–8° N), Web Mercator,
                          in the classes of SMOKE_BREAKS

2026 fire combines two FIRMS downloads: the Sumatra + Kalimantan file used by ArcGIS and the story (SP July, NRT
Aug–Oct) for those islands, so their totals stay identical, and archive request 855893 for every other province
(SP Jul–Aug, NRT Sep–Oct). Smoke is shown for Indonesia and its neighbours.

Grid fields per land cell: land km² (boundary polygons at 0.005°), people (WorldPop sum),
Sept 2019 mean PM2.5 (WashU V6.GL.03, area mean), VIIRS S-NPP detections Jul–Oct 2019 and 2026
(same filters as notebooks/01_preprocess_data.ipynb), and the regency (HDX COD-AB, BPS 2020) it falls in.
Region fire totals use point-in-polygon, not cells.

Needs numpy, pandas, geopandas, shapely, rasterio (bundled GDAL ≥ 3.12) and Pillow. Point PEAT_PROJECT_DIR at the
coursework "Rizaldy Project" folder:
    PEAT_PROJECT_DIR=".../Rizaldy Project" python tools/export-atlas.py
"""
from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio import features
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from PIL import Image
from pyproj import Transformer

HERE = Path(__file__).resolve().parent.parent
PROJECT = Path(os.environ.get('PEAT_PROJECT_DIR', HERE.parent))
RAW = PROJECT / 'RawData'
OUT = HERE / 'data'

GDB = f"/vsizip/{RAW / 'HDX_COD_AB_IDN/idn_admin_boundaries.gdb.zip'}/idn_admin_boundaries.gdb"
WORLDPOP = RAW / 'WorldPop_2020/idn_pop_2020_CN_100m_R2025A_v1.tif'
PM25 = RAW / 'WashU_PM25_V6GL03/V6GL03.CNNPM25.AS.201909-201909.nc'
# (path, product, provinces it is used for: 'belt' = Sumatra + Kalimantan, 'rest' = all others, None = all)
FIRE = [(RAW / 'FIRMS_VIIRS_2019/viirs-snpp_2019_Indonesia.csv', 'SP', None),
        (RAW / 'FIRMS_VIIRS_2026/VIIRS_SNPP_SP_SumKal_2026-07.csv', 'SP', 'belt'),
        (RAW / 'FIRMS_VIIRS_2026/VIIRS_SNPP_NRT_SumKal_2026-08_10.csv', 'NRT', 'belt'),
        (RAW / 'FIRMS_VIIRS_2026/Indonesia_DL_855893/fire_archive_SV-C2_855893.csv', 'SP', 'rest'),
        (RAW / 'FIRMS_VIIRS_2026/Indonesia_DL_855893/fire_nrt_SV-C2_855893.csv', 'NRT', 'rest')]
SEASONS = {2019: ('2019-07-01', '2019-10-31'), 2026: ('2026-07-01', '2026-10-31')}
BLOCK = 60                                  # WorldPop pixels per atlas cell side (0.05°)
ISLANDS = {'1': 'Sumatra', '2': 'Sumatra', '3': 'Java', '5': 'Bali & Nusa Tenggara', '6': 'Kalimantan',
           '7': 'Sulawesi', '8': 'Maluku', '9': 'Papua'}
BELT = ('Sumatra', 'Kalimantan')
SMOKE_BOUNDS = (92.0, -11.0, 142.0, 8.0)   # lon/lat box for the regional smoke image
SMOKE_PX = 1000                            # image width (0.05° at the equator)
SMOKE_BREAKS = [15.0, 35.5, 55.5, 150.5, 250.5]   # WHO 24 h guideline, then US EPA 24 h AQI breakpoints
SMOKE_RGBA = [(0, 0, 0, 0), (196, 190, 220, 70), (166, 154, 204, 120), (128, 110, 178, 160), (92, 70, 150, 195), (58, 36, 110, 225)]
NEIGHBOURS = [('Singapore', 103.85, 1.29), ('Kuala Lumpur', 101.69, 3.14), ('Johor Bahru', 103.76, 1.49),
              ('Kuching', 110.35, 1.55), ('Kota Kinabalu', 116.07, 5.98), ('Bandar Seri Begawan', 114.94, 4.89),
              ('Penang', 100.33, 5.41), ('Hat Yai', 100.47, 7.01), ('Dili', 125.57, -8.56)]


def b64(array: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(array).astype(array.dtype.newbyteorder('<')).tobytes()).decode()


def rings(geom, tol: float):
    """Simplified polygon rings as flat [lon, lat] integer lists (1e-3°), tiny parts dropped."""
    geom = geom.simplify(tol, preserve_topology=True)
    polys = [geom] if geom.geom_type == 'Polygon' else list(getattr(geom, 'geoms', []))
    out = []
    for p in polys:
        if p.is_empty or p.area < (tol * 3) ** 2:
            continue
        coords = np.round(np.asarray(p.exterior.coords) * 1000).astype(int)
        if len(coords) >= 4:
            out.append(coords.ravel().tolist())
    return out


def main() -> None:
    # ---------------- grid aligned to WorldPop ----------------
    with rasterio.open(WORLDPOP) as src:
        wp_t, W, H, nodata = src.transform, src.width, src.height, src.nodata
        cols, rows = math.ceil(W / BLOCK), math.ceil(H / BLOCK)
        cell = wp_t.a * BLOCK
        grid_t = Affine(cell, 0, wp_t.c, 0, -cell, wp_t.f)
        pop = np.zeros((rows, cols), np.float64)
        for r in range(rows):
            h = min(BLOCK, H - r * BLOCK)
            a = src.read(1, window=((r * BLOCK, r * BLOCK + h), (0, W)))
            a = np.where(a != nodata, a, 0).astype(np.float64)
            pad = cols * BLOCK - W
            if pad:
                a = np.pad(a, ((0, 0), (0, pad)))
            pop[r] = a.reshape(h, cols, BLOCK).sum(axis=(0, 2))
        wp_total = float(pop.sum())
    lat_c = grid_t.f - (np.arange(rows) + 0.5) * cell

    # ---------------- PM2.5 Sept 2019, area mean on the atlas grid ----------------
    with rasterio.open(PM25) as src:
        pm_src = src.read(1).astype(np.float32)
        pm_src[(pm_src < 0) | (pm_src > 1e30)] = np.nan
        pm_t = src.transform
        pm = np.full((rows, cols), np.nan, np.float32)
        reproject(pm_src, pm, src_transform=pm_t, src_crs='EPSG:4326', dst_transform=grid_t,
                  dst_crs='EPSG:4326', resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    # regional smoke image in Web Mercator, so the page can draw it straight onto the basemap
    to_merc = Transformer.from_crs(4326, 3857, always_xy=True)
    mx0, my0 = to_merc.transform(SMOKE_BOUNDS[0], SMOKE_BOUNDS[1])
    mx1, my1 = to_merc.transform(SMOKE_BOUNDS[2], SMOKE_BOUNDS[3])
    px = (mx1 - mx0) / SMOKE_PX
    sh = int(round((my1 - my0) / px))
    smoke = np.full((sh, SMOKE_PX), np.nan, np.float32)
    reproject(pm_src, smoke, src_transform=pm_t, src_crs='EPSG:4326', dst_transform=Affine(px, 0, mx0, 0, -px, my1),
              dst_crs='EPSG:3857', resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    klass = np.where(np.isnan(smoke), 0, 1 + np.digitize(np.nan_to_num(smoke), SMOKE_BREAKS))
    klass = np.where(np.isnan(smoke), 0, np.minimum(klass - 1, len(SMOKE_RGBA) - 1))
    rgba = np.array(SMOKE_RGBA, np.uint8)[klass]
    OUT.mkdir(exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(OUT / 'atlas-smoke.png', optimize=True)
    def pm_at(lon, lat):
        r, c = ~pm_t * (lon, lat)
        r, c = int(c), int(r)
        win = pm_src[max(0, r - 2):r + 3, max(0, c - 2):c + 3]      # 5 × 5 (≈ 5 km) mean around the point
        return None if np.isnan(win).all() else round(float(np.nanmean(win)), 1)
    neighbours = [{'name': n, 'lon': lon, 'lat': lat, 'pm25': pm_at(lon, lat)} for n, lon, lat in NEIGHBOURS]

    # ---------------- admin units ----------------
    adm1 = gpd.read_file(GDB, layer='idn_admin1', columns=['adm1_name', 'adm1_pcode']).to_crs(4326)
    adm2 = gpd.read_file(GDB, layer='idn_admin2', columns=['adm2_name', 'adm2_pcode', 'adm1_pcode']).to_crs(4326)
    adm2 = adm2.sort_values('adm2_pcode').reset_index(drop=True)
    shapes = [(g, i + 1) for i, g in enumerate(adm2.geometry)]
    reg = features.rasterize(shapes, out_shape=(rows, cols), transform=grid_t, all_touched=True, dtype='uint16')
    centre = features.rasterize(shapes, out_shape=(rows, cols), transform=grid_t, all_touched=False, dtype='uint16')
    reg = np.where(centre > 0, centre, reg)                         # centre rule, edge cells as fallback
    # land km² per cell: boundary polygons rasterised at 1/10 cell, then block-summed
    # (WorldPop "CN" is settlement-constrained, so its NoData cannot stand in for sea)
    fine_t = Affine(cell / 10, 0, grid_t.c, 0, -cell / 10, grid_t.f)
    fine = features.rasterize([(g, 1) for g in adm2.geometry], out_shape=(rows * 10, cols * 10),
                              transform=fine_t, dtype='uint8')
    frac = fine.reshape(rows, 10, cols, 10).sum(axis=(1, 3)) / 100.0
    del fine
    land_km2 = frac * (cell * 111.32) ** 2 * np.cos(np.radians(lat_c))[:, None]

    # ---------------- fires ----------------
    frames = []
    for path, product, scope in FIRE:
        d = pd.read_csv(path)
        d['product'] = product
        d['scope'] = scope
        frames.append(d)
    fire = pd.concat(frames, ignore_index=True)
    fire['acq_date'] = pd.to_datetime(fire.acq_date)
    fire['year'] = fire.acq_date.dt.year
    season = pd.Series(False, index=fire.index)
    for y, (a, b) in SEASONS.items():
        season |= (fire.year == y) & fire.acq_date.between(a, b)
    fire = fire[season & fire.confidence.isin(['n', 'h']) & (fire['type'].isna() | (fire['type'] == 0))]
    fire = fire.assign(acq_time=fire.acq_time.astype(int)).drop_duplicates(
        subset=['latitude', 'longitude', 'acq_date', 'acq_time', 'scope'])
    pts = gpd.GeoDataFrame(fire[['year']], geometry=gpd.points_from_xy(fire.longitude, fire.latitude), crs=4326)
    joined = gpd.sjoin(pts, adm2[['adm2_pcode', 'geometry']], predicate='within')
    joined = joined[~joined.index.duplicated()]
    belt_point = joined.adm2_pcode.str[2].map(lambda k: ISLANDS[k] in BELT)
    scope = fire.scope.reindex(joined.index)
    joined = joined[scope.isna() | ((scope == 'belt') & belt_point) | ((scope == 'rest') & ~belt_point)]
    exact = joined.groupby(['adm2_pcode', 'year']).size().unstack(fill_value=0)
    # cell counts use only detections inside Indonesia (the 2026 box also holds Malaysian fires)
    c = np.floor((fire.longitude.to_numpy() - grid_t.c) / cell).astype(int)
    r = np.floor((grid_t.f - fire.latitude.to_numpy()) / cell).astype(int)
    inside = (c >= 0) & (c < cols) & (r >= 0) & (r < rows) & fire.index.isin(joined.index)
    counts = {}
    for y in SEASONS:
        m = inside & (fire.year.to_numpy() == y)
        grid = np.zeros((rows, cols), np.int64)
        np.add.at(grid, (r[m], c[m]), 1)
        counts[y] = grid

    # ---------------- keep land cells ----------------
    land = (reg > 0) & ((land_km2 > 0) | (pop > 0))
    unassigned_fire = {y: int(counts[y][(reg == 0)].sum()) for y in SEASONS}
    idx = np.flatnonzero(land)
    cov = np.ones(idx.size, bool)                                   # both seasons now cover every province
    pm_flat = pm.ravel()[idx]
    atlas = {
        'source': 'tools/export-atlas.py · WorldPop R2025A 2020 · WashU ACAG V6.GL.03 Sept 2019 · NASA FIRMS VIIRS S-NPP Jul–Oct · HDX COD-AB (BPS 2020)',
        'grid': {'x0': grid_t.c, 'y0': grid_t.f, 'cell': cell, 'cols': cols, 'rows': rows},
        'n': int(idx.size),
        'idx': b64(idx.astype(np.uint32)),
        'region': b64((reg.ravel()[idx] - 1).astype(np.uint16)),
        'area': b64(np.round(land_km2.ravel()[idx] * 100).astype(np.uint16)),         # 0.01 km²
        'pop': b64(np.round(pop.ravel()[idx]).astype(np.uint32)),
        'pm25': b64(np.where(np.isnan(pm_flat), 0, np.round(pm_flat * 10)).astype(np.uint16)),   # 0.1 µg/m³, 0 = none
        'fire2019': b64(counts[2019].ravel()[idx].astype(np.uint16)),
        'fire2026': b64(np.where(cov, counts[2026].ravel()[idx], 0).astype(np.uint16)),
        'cover': b64(cov.astype(np.uint8)),
        'smoke': {'file': 'atlas-smoke.png', 'bounds': SMOKE_BOUNDS, 'breaks': SMOKE_BREAKS, 'rgba': SMOKE_RGBA,
                  'month': '2019-09', 'cities': neighbours},
    }
    (OUT / 'atlas.json').write_text(json.dumps(atlas, separators=(',', ':')))

    # ---------------- outlines + exact counts ----------------
    prov = adm1.sort_values('adm1_pcode').reset_index(drop=True)
    provinces = [{'id': row.adm1_pcode, 'name': row.adm1_name, 'island': ISLANDS[row.adm1_pcode[2]],
                  'belt': ISLANDS[row.adm1_pcode[2]] in BELT,
                  'bbox': [round(v, 3) for v in row.geometry.bounds], 'rings': rings(row.geometry, 0.01)}
                 for row in prov.itertuples()]
    regencies = []
    for row in adm2.itertuples():
        e = exact.loc[row.adm2_pcode] if row.adm2_pcode in exact.index else {}
        regencies.append({'id': row.adm2_pcode, 'name': row.adm2_name, 'province': row.adm1_pcode,
                          'bbox': [round(v, 3) for v in row.geometry.bounds],
                          'fires': [int(e.get(2019, 0)), int(e.get(2026, 0))],
                          'rings': rings(row.geometry, 0.006)})
    (OUT / 'atlas-bounds.json').write_text(json.dumps(
        {'source': 'HDX COD-AB Indonesia (BPS 2020), simplified; coordinates in 1e-3 degrees',
         'provinces': provinces, 'regencies': regencies}, separators=(',', ':')))

    # ---------------- QA ----------------
    region = reg.ravel()[idx] - 1
    pcode = adm2.adm1_pcode.to_numpy()[region]
    def tot(code, arr):
        return float(arr.ravel()[idx][pcode == code].sum())
    qa = {
        'cells': int(idx.size), 'cols': cols, 'rows': rows, 'cell_deg': cell,
        'worldpop_total': round(wp_total), 'grid_pop_kept': round(float(pop.ravel()[idx].sum())),
        'land_km2': round(float(land_km2.ravel()[idx].sum())),
        'riau_km2': round(tot('ID14', land_km2)), 'kalteng_km2': round(tot('ID62', land_km2)),
        'riau_pop': round(tot('ID14', pop)), 'kalteng_pop': round(tot('ID62', pop)),
        'fires_in_season': {y: int((fire.year == y).sum()) for y in SEASONS},
        'fires_on_land_cells': {y: int(counts[y].ravel()[idx].sum()) for y in SEASONS},
        'fires_unassigned_cells': unassigned_fire,
        'riau_exact': [int(exact.loc[exact.index.str.startswith('ID14')].get(y, pd.Series(dtype=int)).sum()) for y in SEASONS],
        'kalteng_exact': [int(exact.loc[exact.index.str.startswith('ID62')].get(y, pd.Series(dtype=int)).sum()) for y in SEASONS],
        'pm_missing_land_cells': int(np.isnan(pm_flat).sum()),
        'exact_2026_belt_rest': [int(exact.loc[exact.index.str[2].isin(['1', '2', '6'])].get(2026, pd.Series(dtype=int)).sum()),
                                 int(exact.loc[~exact.index.str[2].isin(['1', '2', '6'])].get(2026, pd.Series(dtype=int)).sum())],
        'neighbours': {n['name']: n['pm25'] for n in neighbours},
        'sizes_kb': {f: round((OUT / f).stat().st_size / 1024) for f in ('atlas.json', 'atlas-bounds.json', 'atlas-smoke.png')},
    }
    print(json.dumps(qa, indent=1))


if __name__ == '__main__':
    main()
