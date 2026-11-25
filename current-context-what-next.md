# Handoff

Last updated 2026-11-25 (America/New_York), after coursework log W36. W34–W36 pushed to `main` (see `git log`): plan off the main map, animated DiD and wind explainers, national DiD for every peat region, plain-language copy.

## Where things live

- **This repository** (`D:\CodeFolder\peat-to-lungs` on Windows, `~/CodeFolder/peat-to-lungs` on the Mac, GitHub `rzrizaldy/peat-to-lungs`, served by GitHub Pages from `main` /) is the canonical home of the site and its data snapshots.
- The ArcGIS Pro project and raw coursework data stay in `...\Rizaldy Project` (read-only from here, via `PEAT_PROJECT_DIR`). ArcGIS Pro is not installed on this Windows PC; the island build is open source (`.venv/`: numpy, scipy, rasterio, pyogrio, shapely, pyproj, netCDF4).
- Extra raw downloads (two Hansen tiles, national GFW peat) live in git-ignored `raw/`; `npm run fetch:islands` recreates them. Sources and checksums: `tools/islands/SOURCES.md`.

## Current state

- **W34–W36:** the prevention plan is off the opening map; it lives only on `#budget`, where the context sits with it (the "See on the main map" button is gone too). `plan.json` still feeds the peat checks in the Riau/Kalteng cards. Two animated explainers from `methods.mjs`: `#did` after `#peat` (4 steps; region picker for 8 peat regions incl. Ogan Komering Ilir and Papua; an always-visible answer "it depends on the island"; an all-regions chart with 95% ranges; data from coursework `analysis.py` part N with the national peat map in git-ignored `raw/peat/`) and `#wind` after `#borders` (canvas: fires from the top 32 regencies, ERA5 Aug–Oct 2026 mean wind streaks, smoke puffs; 3 steps). Data: `data/methods.json` from `tools/export-methods.py "<Paper folder>"`. Copy in `app.mjs`, `plan.mjs`, `atlas.mjs` and the Limits slide rewritten in plain language. 16 slides. Cache-bust: atlas.mjs v7, atlas.css v9, app v13, plan v2, methods v3. The DiD slide shows a highlighted answer box (`#did-answer`).

- **Opening map leads with fire (live, `f436204`):** it opens on Jul–Oct 2026 with the change layer on. The big number is +68% detections vs 2019, followed by "where fire changed" bars (Papua ×9.0, Maluku ×4.7, Sulawesi +99%, Kalimantan +98%, Java −14%, Sumatra −29%, Bali–NT −30%). A layer bar toggles Fire 2019/2026 (side-by-side spikes), Smoke 2019/2026 (one at a time) and Change on their own. Smoke is supporting context (one sentence, off by default). The panel note is now one line, with the full note in a tooltip.

- **Opening slide `#atlas` (live; first version `72cc5ea`, current `f436204`):** a full-screen spike map of VIIRS fire detections across Indonesia in both seasons, plus a PM₂.₅ smoke layer that reaches Malaysia, Singapore and Brunei: WashU for Sept 2019, and CAMS from `data/regional.json` for Sept/Oct 2026 at 0.5°. The October 2026 peak is the default. The bottom strip is a chain of 100 people (Sept 2019 vs the 2026 month) coloured by smoke class. Spikes are drawn only for cells with 10+ detections. In Sumatra + Kalimantan, 41% of people (31.4M) were above 55 µg/m³ in Sept 2019, 23% in Sept 2026 and 28% (21.0M) in Oct 2026; Indonesia-wide 2026 shares show "—" because CAMS stops at 7° S and 120° E. For 2026, Sumatra + Kalimantan use the story's file (Riau 3,158, Kalteng 164,333) and the other provinces use FIRMS archive request 855893 (SP Jul–Aug, NRT Sep–Oct), stored in `RawData/FIRMS_VIIRS_2026/Indonesia_DL_855893/`. Indonesia: 328,676 → 553,581 detections (+68%). Heavy fire covered 9.6% → 15% of land. The new file alone would give Riau 3,068 and Kalteng 163,743 (August SP replaces NRT), so it is not used for those islands, which keeps them in line with ArcGIS. `npm test` 6/6.

- Slides 4–12 cover **all 13 provinces of Sumatra (8) and Kalimantan (5)** at **kabupaten/kota level: 200 areas** (Sumatra 144, Kalimantan 56), so every area compares evenly. Riau and Central Kalimantan (★) are analysed by kecamatan in ArcGIS Pro only. `prepare.py --level hybrid` rebuilds the W17 kecamatan/kabupaten mix. Riau Islands and Bangka-Belitung are excluded (not on either island).
- The open-source pipeline reproduces the ArcGIS focus-province results: hotspots exact, forest/loss/peat within 0.03% (after switching to ellipsoidal cell areas), population within 0.06%, PM₂.₅ within 0.04 µg/m³.
- Headline numbers (count kernel, 100 km): hotspots 251,986 → 365,181 (+45%); Kalimantan +98%, Sumatra −33% (South Sumatra rose). Priority-zone population on the fixed 2019 yardstick: 12.93M → 14.46M (Kalimantan 6.05M → 8.31M). Fire→PM R² 0.60 across 200 regencies, regency-out 0.585, within-island ρ 0.51 / 0.71, cross-island transfer 0.32–0.55. The curve flattens (log beats linear); marginal +24 µg/m³ per 0.1 detections/km² at light fire, +9 at heavy fire. Within-Riau tests need kecamatan (only 12 kabupaten), so they live in ArcGIS.
- **Method change:** the priority index is now standardised on 2019 for both seasons, so 2026 is comparable (before, each season was standardised on its own, which hid the worse 2026).
- 2×2 matrix: BCG layout, colour = quadrant (Protect / Prevent + protect / Prevent for downwind / Monitor), Matrix ↔ Map switch. CAMS daily PM₂.₅ for 200 label points in `data/exposure2026.json` (now with daily values).
- Light theme only. Opening slide has the Pocket City dioramas with worst-day panels.
- Header switch "3D animation: on/off" (W19). Off shows still images of the dioramas (`assets/pocket/*.webp`, captured from their canvases at 1120×940; recapture if a diorama changes) and draws the process cutaway and fire terrain once. Defaults to off for reduced motion, data saver, ≤ 2 GB memory or ≤ 2 cores; choice stored as `peat-still`.
- `npm test` passes 6/6 (Riau/Kalteng regression checks kept; atlas totals added).
- W18 (kabupaten everywhere, island shapes in the 2×2 and scatter, plainer downwind quadrant wording) is committed and pushed; W17 hybrid was `ed9ad93`.

## Next actions

1. Check the live opening map on a phone.
2. Review the live page on a phone.
2. ArcGIS Phase 4 stays focused on Riau and Central Kalimantan; the web numbers for those two provinces are the check values.
3. When the ArcGIS StoryMap and Dashboard exist, add their links to the credits on the last slide.
