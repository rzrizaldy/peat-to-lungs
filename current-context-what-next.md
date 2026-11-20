# Handoff

Last updated 2026-11-20 (America/New_York).

## Where things live

- **This repository** (`D:\CodeFolder\peat-to-lungs`, GitHub `rzrizaldy/peat-to-lungs`, served by GitHub Pages from `main` /) is the canonical home of the site and its data snapshots.
- The ArcGIS Pro project and raw data stay in the coursework folder (`...\Rizaldy Project`). The two export scripts read it read-only: set `PEAT_PROJECT_DIR` to that folder before running `tools/export-inputs.py` or `tools/export-basemap.py` from here.
- The older copy in `Rizaldy Project\webapp\` was the build folder. Make new changes here.

## Current state

- An eight-slide scroll-snap story with Story and Advanced modes, EN/ID and light/dark, styled as a news graphic. The explorer map uses Esri Light/Dark Gray Canvas tiles on Web Mercator. The 3D fire terrain uses GADM province outlines.
- The index and K-means use Ln(1 + people/km²). Priority people: 2.23M in 2019 (both provinces), 1.65M in 2026 (all Central Kalimantan).
- `data/stats.json` holds the significance checks. Count / 100 km is the best setting (R² 0.55, regency-out 0.52, bootstrap CI 116–210, residual Moran's I 0.61).
- `node --test tools/verify.test.mjs` passes 5/5.

## Next actions

1. When the ArcGIS StoryMap and Dashboard exist, add their links to the credits block on the last slide.
2. If the ArcGIS Phase 4 results differ from the web model, update the recipe "Check" numbers in `app.mjs`.
