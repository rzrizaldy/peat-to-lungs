# From Peat to Lungs

**Live: https://rzrizaldy.github.io/peat-to-lungs/**

A scroll-snap data story about peat fires, smoke and people in Riau and Central Kalimantan (305 districts, 2019 and 2026). It is the web companion to a CMU 94-802A GIS project, whose official deliverables are being built in ArcGIS Pro.

- One story, in plain language, with the key numbers and how sure we are about each.
- Opens on two hand-drawn isometric dioramas (Pocket City): Dermaga Rambang in Palangka Raya and Marina Bay Sands in Singapore, switched together between a clear day and the October 2026 haze.
- English by default, Indonesian (`ID`) in the header. Light and dark themes.

## Run locally

```sh
node serve.mjs          # http://127.0.0.1:4173
```

The site is static: `index.html`, `styles.css`, `app.mjs`, `map.mjs`, `iso.mjs`, `tools/model.mjs`, `assets/` and `data/`. Any static host (GitHub Pages included) can serve it with no build step. The explorer map loads Esri Light/Dark Gray Canvas tiles from services.arcgisonline.com (attribution: Esri, HERE, Garmin, © OpenStreetMap contributors).

## What the analysis says

| Finding | Evidence (count kernel, 100 km) |
| --- | --- |
| Fire moved provinces | Detections fell 86% in Riau (22,874 → 3,158) and rose 105% in Central Kalimantan (80,126 → 164,333). |
| Fire nearby predicts smoke | Sept 2019 PM₂.₅ ~ Ln(1 + KDE): R² 0.55, slope 167 (95% CI 150–184), p < 0.001. Regency-cluster bootstrap CI 116–210. Leave-one-regency-out R² 0.52. Province fixed effects keep within-province R² 0.49. Spearman inside Riau 0.41 and Central Kalimantan 0.75 (both p < 0.001). |
| What is missing | Residual Moran's I 0.61 (p = 0.001): errors cluster in space, so wind and smoke transport is the next variable. Ordinary p-values are optimistic; the bootstrap and blocked CV are the honest checks. |
| Shape, reach, timing | Close to linear: about +10 µg/m³ per extra 0.1 detections/km² (linear has the best regency-out R², 0.54; exponential and power fit worse). Fire up to ~100 km matters most (25 km 0.35, 100 km 0.52, 200 km 0.44). September fire explains September smoke; adding August does not help, and October (placebo) adds nothing. |
| Why 2026 was worse | Not a hotter September (Central Kalimantan 66,213 vs 60,750 detections) but a season that did not stop: October 64,807 vs 6,696, 68 days with 500+ detections vs 39, and 2.5× more spots burning on 5+ days. A strong El Niño and positive IOD kept it dry. |
| Across borders | Singapore (NEA stations, same source both years): 39 days ≥ 37.5 µg/m³ in Jul–Oct 2026 vs 13 in 2019, longest episode 20 vs 7 days, dose above the WHO guideline 2.9×. |
| Exposure matrix (2026) | 6.85M people (75%) lived through 30+ unhealthy days (daily mean ≥ 55.5 µg/m³); 3.58M of them had little fire nearby. Spearman across 305 districts: fire–PM₂.₅ 0.82, PM₂.₅–unhealthy days 0.97, population–fire −0.27. Daily CAMS values track Singapore's NEA monitors (r 0.88) but read low, so day counts are conservative. |
| Who to prepare | Priority zones (index ≥ +1.5 SD) hold 2.23M people in 2019 (both provinces) and 1.65M in 2026 (all Central Kalimantan). |

## Methods

| Step | Implementation |
| --- | --- |
| Inputs | 305 districts from `Kecamatan_Indicators` (ArcGIS project). VIIRS S-NPP detections July–October within a 100 km buffer, ESRI:102028, 2 km lattice. |
| Kernel | Planar quartic KDE weighted by count or FRP, radius 25/50/100 km; district mean of cell centres (two small districts use the cell under their label point). |
| Calibration | OLS of population-weighted Sept 2019 PM₂.₅ on Ln(1 + KDE). 500 seeded 30% hold-outs, leave-one-regency-out CV, both cross-province transfers. 2026 values are model ranks; districts outside the 2019 range are flagged. |
| Significance | `tools/stats.mjs`: t-test, regency-cluster bootstrap, residual Moran's I (8 NN, 999 permutations), province fixed effects, within-province Spearman permutation tests. |
| Index | 0.3·z(fire) + 0.3·z(Ln(1 + people/km²)) + 0.4·z(PM₂.₅), re-standardised per season; classes of 0.5 SD; priority ≥ +1.5 SD. Population is summed from native WorldPop cells. Raw density was replaced by its log after a sensitivity check showed dense Pekanbaru cells qualifying with below-average fire. |
| Clusters | K-means++ on fire density, % forest loss on peat, PM₂.₅ and Ln population density, standardised; k = 3–6 by silhouette. |

Limits: no wind or weather term; WorldPop 2020 for both seasons; 2026 has no PM₂.₅ observations yet; the index is relative within each season.

## Rebuild the data

The export step reads the ArcGIS project read-only and needs Python with NumPy and GDAL ≥ 3.12 (OpenFileGDB raster support). If the site lives outside the coursework folder, point `PEAT_PROJECT_DIR` at the `Rizaldy Project` folder.

```sh
python tools/export-inputs.py        # writes .work/ (ignored)
node tools/build-data.mjs            # 12 scenarios + validation
node tools/stats.mjs                 # significance + sensitivity → data/stats.json
python tools/export-basemap.py       # GADM province outlines for the 3D terrain (stdlib only)
node tools/fire-profile.mjs          # daily season profile from raw FIRMS CSVs → data/fire-profile.json
node tools/shape-reach.mjs           # curve shape, radius and timing tests → data/shape.json
python tools/regional-aq.py          # WashU 2019, CAMS 2026 (Open-Meteo), Singapore NEA → data/regional.json (needs h5py)
python tools/district-exposure.py    # daily CAMS PM2.5 per district, Jul–Oct 2026 → data/exposure2026.json
node --test tools/verify.test.mjs
```

## Opening dioramas

Built with the Pocket City skill by April Zhu (MIT, copy in `pocket-city/skill/`, credited on the slide). Sources per city live in `pocket-city/<city>/work/city.json`; built pages are `pocket/*.html`.

```sh
python pocket-city/skill/scripts/fetch_osm.py --lat -2.2038 --lon 113.9399 --size 220 --out pocket-city/pky/work/osm.json
python pocket-city/skill/scripts/plot.py --osm pocket-city/pky/work/osm.json --out pocket-city/pky/work/plot.json
python pocket-city/skill/scripts/prep.py --osm ... --plot ... --drive left --out pocket-city/pky/work/scene.json
python pocket-city/skill/scripts/build.py --scene ... --city pocket-city/pky/work/city.json --out pocket/palangka-raya.html
```

Singapore (`pocket-city/mbs/`) is a 600 m square on Marina Bay Sands (`--lat 1.2842 --lon 103.8594 --size 600`). The towers (each a straight west leg and a curved east leg leaning in), the SkyPark deck with its pool, the ArtScience Museum (round base and ten fingers up to 60 m; the mapped parts stop at 26 m and were removed) and the Apple dome are hand-built in `mbs/work/landmarks.js`; The Shoppes' wave roof uses the mapped roof strips. The kit's 600 m size cap was raised in our copy. An earlier Merlion Park version is kept in `pocket-city/sg/`. Illustrative boats were thinned to what the places show. The kit's haze tint takes a strength per scene (`haze: 0.66` Palangka Raya, `0.42` Singapore).

## Sources

NASA FIRMS VIIRS S-NPP · CAMS via Open-Meteo · Singapore NEA via data.gov.sg · BPS/OCHA HDX boundaries · Global Forest Watch peat · Hansen Global Forest Change v1.12 · MapBiomas Indonesia 2000 · WorldPop R2025A 2020 · WashU ACAG V6.GL.03 (Sept 2019) · Natural Earth 1:110m. The opening illustration (`assets/peat-to-lungs.png`) was made with ImageGen; its prompt is in [AGENTS.md](AGENTS.md).

Rizaldy Utomo · Carnegie Mellon University · Fall 2026
