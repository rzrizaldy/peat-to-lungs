"""Read existing GIS outputs with GDAL and export interchange inputs for the JS model."""

import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr


gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()
APP = Path(__file__).resolve().parents[1]
# The ArcGIS project stays in the coursework folder. When this site lives in its
# own repository (e.g. D:\CodeFolder\...), point PEAT_PROJECT_DIR at the
# "Rizaldy Project" folder; by default the site sits inside it.
ROOT = Path(os.environ.get("PEAT_PROJECT_DIR", APP.parent)).resolve()
GDB = ROOT / "GISProjectRizaldyUtomo/GISProjectRizaldyUtomo.gdb"
PREPARED = ROOT / "PreparedData"
OUT = APP / ".work"
PROVINCES = {"ID14": "Riau", "ID62": "Kalteng"}
FIELDS = {
    "id": "adm3_pcode", "name": "adm3_name", "regency": "adm2_name",
    "regencyId": "adm2_pcode", "province": "adm1_pcode", "area": "Area_km2",
    "peat": "PeatKm2", "forest": "Forest2000Km2", "loss": "LossKm2",
    "peatLoss": "PeatLossKm2", "popDensity": "PopDens", "pm25": "PM25_pw",
}


def reference(code, authority="EPSG"):
    result = osr.SpatialReference()
    result.SetFromUserInput(f"{authority}:{code}")
    result.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return result


def parts(geometry):
    if geometry.GetGeometryName() == "POLYGON":
        return [[[round(x), round(y)] for x, y, *_ in ring.GetPoints()] for ring in geometry],
    return tuple(poly for element in geometry for poly in parts(element))


def rasterize(vector, grid, ref, native=False):
    nx, ny = grid["width"], grid["height"]
    target = gdal.GetDriverByName("MEM").Create("", nx, ny, 1, gdal.GDT_Int16)
    target.SetGeoTransform(grid["transform"])
    target.SetProjection(ref.ExportToWkt())
    options = ["ATTRIBUTE=zone"] if native else []
    gdal.RasterizeLayer(target, [1], vector, burn_values=[] if native else [1], options=options)
    return target.ReadAsArray()


def grid_bounds(envelope, cell):
    west, east, south, north = envelope
    x0 = math.floor(west / cell) * cell
    y0 = math.ceil(north / cell) * cell
    width = math.ceil((east - x0) / cell)
    height = math.ceil((y0 - south) / cell)
    return {"width": width, "height": height, "transform": (x0, cell, 0, y0, 0, -cell)}


def xy_index(xs, ys, transform):
    west, dx, _, north, _, dy = transform
    return np.floor((xs - west) / dx).astype(np.int64), np.floor((ys - north) / dy).astype(np.int64)


def sample_arrays(data, transform, xs, ys, fill):
    col, row = xy_index(xs, ys, transform)
    result = np.full(len(xs), fill, dtype=np.float32)
    ok = (row >= 0) & (row < data.shape[0]) & (col >= 0) & (col < data.shape[1])
    result[ok] = data[row[ok], col[ok]]
    return result


def sample_gdb_mask(name, xs, ys):
    raster = gdal.Open(f'OpenFileGDB:"{GDB}":{name}')
    band = raster.GetRasterBand(1)
    col, row = xy_index(xs, ys, raster.GetGeoTransform())
    valid = (row >= 0) & (row < raster.RasterYSize) & (col >= 0) & (col < raster.RasterXSize)
    output = np.zeros(len(xs), dtype=bool)
    size = 256
    points = np.flatnonzero(valid)
    tile_width = math.ceil(raster.RasterXSize / size)
    tile_ids = (row[points] // size) * tile_width + col[points] // size
    ordering = np.argsort(tile_ids)
    points, tile_ids = points[ordering], tile_ids[ordering]
    breaks = np.r_[0, np.flatnonzero(np.diff(tile_ids)) + 1, len(tile_ids)]
    for start, end in zip(breaks[:-1], breaks[1:]):
        p = points[start:end]
        x0 = int(col[p[0]] // size * size)
        y0 = int(row[p[0]] // size * size)
        values = band.ReadAsArray(x0, y0, min(size, raster.RasterXSize - x0),
                                  min(size, raster.RasterYSize - y0))
        output[p] = values[row[p] - y0, col[p] - x0] == 1
    return output


def points(layer):
    names = {field.GetName().lower(): field.GetName() for field in layer.schema}
    month = names.get("month")
    power = names["frp"]
    xy = np.empty((layer.GetFeatureCount(), 3), dtype="<f4")
    months = Counter()
    for i, feature in enumerate(layer):
        geom = feature.GetGeometryRef()
        xy[i] = (geom.GetX(), geom.GetY(), feature[power])
        if month:
            months[int(feature[month])] += 1
    return xy, [months[m] for m in range(7, 11)]


def zone_layer(geometries, ref, coordinate_transform=None):
    ds = ogr.GetDriverByName("MEM").CreateDataSource("")
    layer = ds.CreateLayer("zones", ref)
    layer.CreateField(ogr.FieldDefn("zone", ogr.OFTInteger))
    for index, geometry in geometries:
        if coordinate_transform:
            geometry = geometry.Clone()
            geometry.Transform(coordinate_transform)
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetField("zone", index + 1)
        feature.SetGeometry(geometry)
        layer.CreateFeature(feature)
    return ds, layer


def province_grid(province_id, short, grid, geometries, ea, wgs, zones):
    nx, ny = grid["width"], grid["height"]
    zone_ds, zone_features = zone_layer(geometries, ea)
    zone_index = rasterize(zone_features, grid, ea, native=True).ravel().astype(np.int32) - 1
    pop_file = gdal.Open(f'OpenFileGDB:"{GDB}":Pop2020_{short}')
    pop_band = pop_file.GetRasterBand(1)
    pop = pop_band.ReadAsArray()
    valid = np.isfinite(pop) & (pop > 0) & (pop != pop_band.GetNoDataValue())
    native_grid = {
        "width": pop_file.RasterXSize, "height": pop_file.RasterYSize,
        "transform": pop_file.GetGeoTransform(),
    }
    to_wgs = osr.CoordinateTransformation(ea, wgs)
    from_wgs = osr.CoordinateTransformation(wgs, ea)
    native_ds, native_zones = zone_layer(geometries, wgs, to_wgs)
    ids = rasterize(native_zones, native_grid, wgs, native=True)
    rr, cc = np.nonzero(valid)
    weights = pop[rr, cc].astype(np.float64)
    source_zones = ids[rr, cc].astype(np.int64) - 1
    del ids, pop, valid
    west, dx, _, north, _, dy = native_grid["transform"]
    lon, lat = west + (cc + 0.5) * dx, north + (rr + 0.5) * dy
    dense = np.zeros((len(zones), nx * ny), dtype=np.float64)
    pm_sum, pm_weight = np.zeros(nx * ny), np.zeros(nx * ny)
    pm_file = gdal.Open(str(PREPARED / "rasters" / f"pm25_sep2019_{short.lower()}.tif"))
    pm_band = pm_file.GetRasterBand(1)
    pm_native = pm_band.ReadAsArray()
    pm_native[pm_native == pm_band.GetNoDataValue()] = np.nan
    pm_transform = pm_file.GetGeoTransform()
    for start in range(0, len(weights), 100_000):
        span = slice(start, start + 100_000)
        coords = np.asarray(from_wgs.TransformPoints(list(zip(lon[span], lat[span]))))
        x, y = xy_index(coords[:, 0], coords[:, 1], grid["transform"])
        if not np.all((x >= 0) & (x < nx) & (y >= 0) & (y < ny)):
            raise RuntimeError(f"{short}: populated cells outside the model grid")
        cell_ids = y * nx + x
        geo_ids = source_zones[span].copy()
        lost = geo_ids < 0
        geo_ids[lost] = zone_index[cell_ids[lost]]
        if np.any(geo_ids < 0):
            # Source pixels on a sub-pixel administrative seam inherit the nearest
            # surrounding occupied model cell, while preserving their population.
            for i in np.flatnonzero(geo_ids < 0):
                surrounding = zone_index.reshape(ny, nx)[max(0, y[i]-1):y[i]+2, max(0, x[i]-1):x[i]+2]
                near = surrounding[surrounding >= 0]
                if not near.size:
                    raise RuntimeError(f"{short}: could not assign populated seam pixel")
                geo_ids[i] = near[0]
        np.add.at(dense, (geo_ids, cell_ids), weights[span])
        pm_at_pop = sample_arrays(pm_native, pm_transform, lon[span], lat[span], np.nan)
        matched = np.isfinite(pm_at_pop)
        np.add.at(pm_sum, cell_ids[matched], pm_at_pop[matched] * weights[span][matched])
        np.add.at(pm_weight, cell_ids[matched], weights[span][matched])
    cell_pop = dense.sum(axis=0)
    boundary = (zone_index < 0) & (cell_pop > 0)
    zone_index[boundary] = np.argmax(dense[:, boundary], axis=0)
    if not np.isclose(weights.sum(), cell_pop.sum(), atol=0.01, rtol=0):
        raise RuntimeError(f"{short}: population was not conserved")
    assert np.isclose(cell_pop.sum(), sum(z["population"] for z in zones if z["province"] == province_id),
                      rtol=0.00001, atol=0.1)
    x0, cell, _, y0, _, _ = grid["transform"]
    rows, cols = np.divmod(np.flatnonzero(zone_index >= 0), nx)
    geographic = np.asarray(to_wgs.TransformPoints(list(zip(x0 + (cols + 0.5) * cell, y0 - (rows + 0.5) * cell))))
    pixel_ids = rows * nx + cols
    pm_grid = sample_arrays(pm_native, pm_transform, geographic[:, 0], geographic[:, 1], np.nan)
    missing = ~np.isfinite(pm_grid)
    if np.any(missing):
        i = pixel_ids[missing]
        fallback = np.divide(pm_sum[i], pm_weight[i], out=np.full(i.size, np.nan), where=pm_weight[i] > 0)
        pm_grid[missing] = np.where(np.isfinite(fallback), fallback, [zones[k]["pm25"] for k in zone_index[i]])
    pop_zones, pop_cells = np.nonzero(dense)
    print(short, "cells", len(pixel_ids), "population", round(cell_pop.sum(), 3),
          "PM fallback", int(missing.sum()), flush=True)
    return {
        "width": nx, "height": ny, "x0": x0, "y0": y0, "step": cell,
        "cells": pixel_ids.tolist(), "zone": zone_index[pixel_ids].tolist(),
        "pop": np.round(cell_pop[pixel_ids], 6).tolist(), "pm": np.round(pm_grid, 4).tolist(),
        "populationLedger": [pop_zones.tolist(), pop_cells.tolist(), np.round(dense[pop_zones, pop_cells], 6).tolist()],
        "pmFallbackCells": int(missing.sum()), "nativeSeamPixels": int(np.count_nonzero(source_zones < 0)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cell", type=int, default=2000, help="Equal-area cell size in meters")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    ea, wgs = reference(102028, "ESRI"), reference(4326)
    to_wgs = osr.CoordinateTransformation(ea, wgs)
    from_wgs = osr.CoordinateTransformation(wgs, ea)
    store = ogr.Open(str(GDB), 0)
    source = store.GetLayerByName("Kecamatan_Indicators")
    geoms, zones = [], []
    for feature in sorted(source, key=lambda f: f["adm3_pcode"]):
        geom = feature.GetGeometryRef().Clone()
        marker = geom.PointOnSurface()
        zone = {key: feature[field] for key, field in FIELDS.items()}
        zone["population"] = zone["popDensity"] * zone["area"]
        zone["counts"] = [feature["Hotspots"], feature["Hotspots_2026"]]
        zone["frp"] = [feature["FRP_2019"], feature["FRP_2026"]]
        zone["center"] = [marker.GetX(), marker.GetY()]
        zone["lonlat"] = list(to_wgs.TransformPoint(*zone["center"])[:2])
        zone["shape"] = parts(geom.SimplifyPreserveTopology(160))
        geoms.append(geom)
        zones.append(zone)
    assert len(zones) == len({z["id"] for z in zones}) == 305
    world_path = ROOT.parent / "Past Rizaldy GIS/#8 - Indonesia Deforestation/starting_files/ne_110m_admin_0_countries.zip"
    world = ogr.Open("/vsizip/" + world_path.as_posix(), 0)
    world_layer = world.GetLayer(0)
    world_layer.SetSpatialFilterRect(94, -9, 123, 9)
    base = []
    for feature in world_layer:
        geometry = feature.GetGeometryRef().Clone()
        geometry.Transform(from_wgs)
        base += parts(geometry)
    provinces = {}
    for province_id, short in PROVINCES.items():
        outline_layer = store.GetLayerByName(f"{short}_Province")
        outline_feature = outline_layer.GetNextFeature()
        outline = outline_feature.GetGeometryRef().Clone()
        grid = grid_bounds(outline.GetEnvelope(), args.cell)
        geometry_set = [(i, g) for i, g in enumerate(geoms) if zones[i]["province"] == province_id]
        features = province_grid(province_id, short, grid, geometry_set, ea, wgs, zones)
        features["outline"] = parts(outline.SimplifyPreserveTopology(200))
        peat_layer = store.GetLayerByName(f"Peat_{short}")
        peat_grid = grid_bounds(outline.GetEnvelope(), 200)
        peat_mask = rasterize(peat_layer, peat_grid, ea)
        features["seasons"] = {}
        for year in (2019, 2026):
            buffer, _ = points(store.GetLayerByName(f"Hotspots_{short}_{year}_Buffer100km"))
            buffer.tofile(OUT / f"fire-{province_id}-{year}.f32")
            local, months = points(store.GetLayerByName(f"Hotspots_{short}_{year}"))
            xs, ys = local[:, 0], local[:, 1]
            on_peat = sample_arrays(peat_mask, peat_grid["transform"], xs, ys, 0) == 1
            forest = sample_gdb_mask(f"Forest2000_{short}", xs, ys)
            lost = sample_gdb_mask(f"ForestLoss_2001_2019_{short}", xs, ys)
            assert not np.any(lost & ~forest)
            features["seasons"][str(year)] = {
                "months": months, "total": int(len(local)), "buffer": int(len(buffer)),
                "peat": int(on_peat.sum()), "cleared": int(lost.sum()),
                "remaining": int((forest & ~lost).sum()),
            }
            print(province_id, year, features["seasons"][str(year)], flush=True)
        provinces[province_id] = features
    with (OUT / "gis-inputs.json").open("w", encoding="utf-8") as file:
        json.dump({"zones": zones, "base": base, "provinces": provinces}, file, ensure_ascii=False,
                  separators=(",", ":"), allow_nan=False)


if __name__ == "__main__":
    main()
