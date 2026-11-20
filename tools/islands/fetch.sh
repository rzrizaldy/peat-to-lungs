#!/usr/bin/env bash
# Download the extra raw inputs for the island-wide build into raw/ (git-ignored).
# Everything else comes read-only from the coursework RawData/ folder (PEAT_PROJECT_DIR).
# Usage: bash tools/islands/fetch.sh     (skips files that already exist)
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p raw/hansen raw/peat

get() {  # url, destination
  if [ -s "$2" ]; then echo "have $2"; return; fi
  echo "get  $2"
  curl -sS -f -L --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}

# Hansen Global Forest Change v1.12 loss year, the two tiles west of 100°E (Aceh to West Sumatra).
for t in 00N_090E 10N_090E; do
  get "https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/Hansen_GFC-2024-v1.12_lossyear_$t.tif" \
      "raw/hansen/Hansen_GFC-2024-v1.12_lossyear_$t.tif"
done

# GFW "Indonesia peat lands" (Ministry of Agriculture 2011), national. The GFW map service
# (gis-gfw.wri.org/.../country_data/asia/MapServer/10) timed out on 2026-11-20; ArcGIS Hub serves
# the same layer as a cached GeoJSON.
get "https://hub.arcgis.com/api/v3/datasets/d52e0e67ad21401cbf3a2c002599cf58_10/downloads/data?format=geojson&spatialRefId=4326" \
    "raw/peat/GFW_Indonesia_peat_lands_national.geojson"

sha256sum raw/hansen/*.tif raw/peat/*.geojson
