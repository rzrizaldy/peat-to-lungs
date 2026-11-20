# Island-wide build: sources

The web story covers every province on Sumatra (8) and Kalimantan (5). Riau and Central
Kalimantan are mapped by **kecamatan**, matching the ArcGIS Pro deep dive; the other 11
provinces are mapped by **kabupaten/kota**. Riau Islands and Bangka-Belitung are left out
because they are not on either island.

Large raw files are never committed. Coursework inputs are read in place (read-only) from
`PEAT_PROJECT_DIR/RawData`; the extra downloads go to `raw/` (git-ignored) with
`bash tools/islands/fetch.sh`.

| Input | Where | Notes |
|---|---|---|
| Admin boundaries (HDX COD-AB Indonesia) | `RawData/HDX_COD_AB_IDN/idn_admin_boundaries.gdb.zip` | `idn_admin3` for ID14, ID62; `idn_admin2` for the rest |
| VIIRS S-NPP hotspots 2019 | `RawData/FIRMS_VIIRS_2019/viirs-snpp_2019_Indonesia.csv` | Jul 1–Oct 31, confidence n/h, type 0, exact duplicates removed |
| VIIRS S-NPP hotspots 2026 | `RawData/FIRMS_VIIRS_2026/*SumKal*.csv` | July standard product, Aug–Oct near-real-time |
| WorldPop 2020 (constrained, 100 m) | `RawData/WorldPop_2020/idn_pop_2020_CN_100m_R2025A_v1.tif` | |
| WashU V6GL03 PM2.5, Sept 2019 | `RawData/WashU_PM25_V6GL03/` | sampled at WorldPop pixel centres and 2 km cell centres |
| Hansen GFC v1.12 loss year, 100E and 110E tiles | `RawData/Hansen_GFC_v1_12/` | |
| Hansen GFC v1.12 loss year, 00N_090E and 10N_090E | `raw/hansen/` | sha256 `4ea4073d…`, `e2bdd77a…` |
| MapBiomas Indonesia 2000 | `starting_files/indonesia_coverage_2000.tif` | forest = classes 3–6 |
| GFW Indonesia peat lands (MoA 2011), national | `raw/peat/GFW_Indonesia_peat_lands_national.geojson` | ArcGIS Hub cache of GFW layer `country_data/asia/MapServer/10`; sha256 `3580abed…`. Reproduces the ArcGIS peat areas exactly (Riau 38,637.6 km², Kalteng 28,109.8 km²) |
| Natural Earth 110 m countries | `starting_files/ne_110m_admin_0_countries.zip` | basemap |
| CAMS daily PM2.5 2026 (Open-Meteo) | fetched by `tools/district-exposure.py`, cached in `.work/aq-cache/` | 2019 is not available from this source (values are empty before 2022) |

## Method differences from the ArcGIS workflow

- Forest, loss and peat per area are summed on the MapBiomas 30 m geographic grid with exact
  ellipsoidal cell areas (Hansen sampled nearest-neighbour onto that grid); ArcGIS used one
  projected 30 m grid. Expect differences well under 1%.
- Hotspots are assigned to areas by point-in-polygon in WGS 84.
- Everything else (2 km equal-area model grid in ESRI:102028, 100 km fire buffers, population
  ledger, PM2.5 sampling) follows `tools/export-inputs.py`.
