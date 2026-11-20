# Handoff

Last updated 2026-11-20 (America/New_York), after the switch to kabupaten everywhere (coursework log W18).

## Where things live

- **This repository** (`D:\CodeFolder\peat-to-lungs`, GitHub `rzrizaldy/peat-to-lungs`, served by GitHub Pages from `main` /) is the canonical home of the site and its data snapshots.
- The ArcGIS Pro project and raw coursework data stay in `...\Rizaldy Project` (read-only from here, via `PEAT_PROJECT_DIR`). ArcGIS Pro is not installed on this Windows PC; the island build is open source (`.venv/`: numpy, scipy, rasterio, pyogrio, shapely, pyproj, netCDF4).
- Extra raw downloads (two Hansen tiles, national GFW peat) live in git-ignored `raw/`; `npm run fetch:islands` recreates them. Sources and checksums: `tools/islands/SOURCES.md`.

## Current state

- Slides 4–12 cover **all 13 provinces of Sumatra (8) and Kalimantan (5)** at **kabupaten/kota level: 200 areas** (Sumatra 144, Kalimantan 56), so every area compares evenly. Riau and Central Kalimantan (★) are analysed by kecamatan in ArcGIS Pro only. `prepare.py --level hybrid` rebuilds the W17 kecamatan/kabupaten mix. Riau Islands and Bangka-Belitung are excluded (not on either island).
- The open-source pipeline reproduces the ArcGIS focus-province results: hotspots exact, forest/loss/peat within 0.03% (after switching to ellipsoidal cell areas), population within 0.06%, PM₂.₅ within 0.04 µg/m³.
- Headline numbers (count kernel, 100 km): hotspots 251,986 → 365,181 (+45%); Kalimantan +98%, Sumatra −33% (South Sumatra rose). Priority-zone population on the fixed 2019 yardstick: 12.93M → 14.46M (Kalimantan 6.05M → 8.31M). Fire→PM R² 0.60 across 200 regencies, regency-out 0.585, within-island ρ 0.51 / 0.71, cross-island transfer 0.32–0.55. The curve flattens (log beats linear); marginal +24 µg/m³ per 0.1 detections/km² at light fire, +9 at heavy fire. Within-Riau tests need kecamatan (only 12 kabupaten), so they live in ArcGIS.
- **Method change:** the priority index is now standardised on 2019 for both seasons, so 2026 is comparable (before, each season was standardised on its own, which hid the worse 2026).
- 2×2 matrix: BCG layout, colour = quadrant (Protect / Prevent + protect / Prevent for downwind / Monitor), Matrix ↔ Map switch. CAMS daily PM₂.₅ for 200 label points in `data/exposure2026.json` (now with daily values).
- Light theme only. Opening slide has the Pocket City dioramas with worst-day panels.
- Header switch "3D animation: on/off" (W19). Off shows still images of the dioramas (`assets/pocket/*.webp`, captured from their canvases at 1120×940; recapture if a diorama changes) and draws the process cutaway and fire terrain once. Defaults to off for reduced motion, data saver, ≤ 2 GB memory or ≤ 2 cores; choice stored as `peat-still`.
- `npm test` passes 5/5 (Riau/Kalteng regression checks kept).
- W18 (kabupaten everywhere, island shapes in the 2×2 and scatter, plainer downwind quadrant wording) is committed and pushed; W17 hybrid was `ed9ad93`.

## Next actions

1. Review the live page on a phone.
2. ArcGIS Phase 4 stays focused on Riau and Central Kalimantan; the web numbers for those two provinces are the check values.
3. When the ArcGIS StoryMap and Dashboard exist, add their links to the credits on the last slide.
