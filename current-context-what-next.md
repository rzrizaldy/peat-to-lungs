# Handoff

Last updated 2026-11-20 (America/New_York), after the island-wide rebuild (coursework log W17).

## Where things live

- **This repository** (`D:\CodeFolder\peat-to-lungs`, GitHub `rzrizaldy/peat-to-lungs`, served by GitHub Pages from `main` /) is the canonical home of the site and its data snapshots.
- The ArcGIS Pro project and raw coursework data stay in `...\Rizaldy Project` (read-only from here, via `PEAT_PROJECT_DIR`). ArcGIS Pro is not installed on this Windows PC; the island build is open source (`.venv/`: numpy, scipy, rasterio, pyogrio, shapely, pyproj, netCDF4).
- Extra raw downloads (two Hansen tiles, national GFW peat) live in git-ignored `raw/`; `npm run fetch:islands` recreates them. Sources and checksums: `tools/islands/SOURCES.md`.

## Current state

- Slides 4–12 cover **all 13 provinces of Sumatra (8) and Kalimantan (5)**: 479 areas. Riau and Central Kalimantan are mapped by kecamatan (the ArcGIS Pro deep dive); the other 11 by kabupaten. Riau Islands and Bangka-Belitung are excluded (not on either island).
- The open-source pipeline reproduces the ArcGIS focus-province results: hotspots exact, forest/loss/peat within 0.03% (after switching to ellipsoidal cell areas), population within 0.06%, PM₂.₅ within 0.04 µg/m³.
- Headline numbers (count kernel, 100 km): hotspots 251,986 → 365,181 (+45%); Kalimantan +98%, Sumatra −33% (South Sumatra rose). Priority-zone population on the fixed 2019 yardstick: 12.93M → 14.22M (Kalimantan 6.05M → 8.26M). Fire→PM R² 0.57 across 479 areas, regency-out 0.56, cross-island transfer 0.43–0.44, bootstrap slope CI 174–241, residual Moran's I 0.62. The curve flattens (sqrt/log beat linear); marginal +18 µg/m³ per 0.1 detections/km² at light fire, +7 at heavy fire.
- **Method change:** the priority index is now standardised on 2019 for both seasons, so 2026 is comparable (before, each season was standardised on its own, which hid the worse 2026).
- 2×2 matrix: BCG layout, colour = quadrant (Protect / Prevent + protect / Prevent for downwind / Monitor), Matrix ↔ Map switch. CAMS daily PM₂.₅ for 479 label points in `data/exposure2026.json` (now with daily values).
- Light theme only. Opening slide has the Pocket City dioramas with worst-day panels.
- `npm test` passes 5/5 (Riau/Kalteng regression checks kept).
- **Not committed yet** (the matrix redesign and the island rebuild).

## Next actions

1. Commit and push after the user has reviewed the local page (`node serve.mjs 4174`).
2. ArcGIS Phase 4 stays focused on Riau and Central Kalimantan; the web numbers for those two provinces are the check values.
3. When the ArcGIS StoryMap and Dashboard exist, add their links to the credits on the last slide.
