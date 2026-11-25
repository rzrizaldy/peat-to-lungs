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

# GFW "Indonesia peat lands" (Ministry of Agriculture 2011), national, 1,524 polygons. The GFW map service
# (gis-gfw.wri.org/.../country_data/asia/MapServer/10) is down and the ArcGIS Hub export returns HTTP 500
# (checked 2026-11-25), so this pages through an Esri Deutschland copy of the same layer. Check: Riau 38,637.6 km²
# and Central Kalimantan 28,109.8 km² (ESRI:102028), identical to the GFW extracts in RawData/GFW_Peat.
PEAT=https://services4.arcgis.com/9hSTcaT2vUglUGs4/arcgis/rest/services/Torfgebiete_Indonesien/FeatureServer/0/query
if [ ! -s raw/peat/GFW_Indonesia_peat_lands_national.geojson ]; then
  mkdir -p raw/peat/pages
  for off in 0 300 600 900 1200 1500; do
    get "$PEAT?where=1%3D1&outFields=objectid&outSR=4326&f=geojson&orderByFields=FID&resultOffset=$off&resultRecordCount=300" \
        "raw/peat/pages/p$off.geojson"
  done
  python3 -c "import glob, geopandas as gpd, pandas as pd; g = pd.concat([gpd.read_file(f) for f in sorted(glob.glob('raw/peat/pages/*.geojson'))]).drop_duplicates('objectid'); g['geometry'] = g.geometry.make_valid(); g.to_file('raw/peat/GFW_Indonesia_peat_lands_national.geojson', driver='GeoJSON'); print(len(g), 'peat polygons')"
fi

sha256sum raw/hansen/*.tif raw/peat/*.geojson
