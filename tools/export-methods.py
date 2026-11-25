"""Export the small data behind the two method explainers (#wind, #did) to data/methods.json.

Inputs come from the coursework analysis folder (Paper/): ERA5 100 m daily wind (wind.py, .cache/wind_2026.npz)
and results.json (part N difference-in-differences for every peat region, wind model scores, plume parameters).

    python3 tools/export-methods.py "<path to Paper folder>"
"""
import json
import sys
from pathlib import Path

import numpy as np

paper = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'data' / 'methods.json'
res = json.loads((paper / 'results.json').read_text())

w = np.load(paper / '.cache' / 'wind_2026.npz')
days = [str(d) for d in w['days']]
k = days.index('2026-08-01')                       # Aug–Oct 2026, the main burning season
u = np.nanmean(w['u'][k:], axis=0); v = np.nanmean(w['v'][k:], axis=0)

# difference-in-differences for every region with ≥ 5,000 km² of peat, plus Ogan Komering Ilir (analysis.py part N,
# national MoA 2011 peat map); island estimates compare peat and non-peat cells within the same regency
N = res['N']
ISLAND = {'Riau': 'Sumatra', 'Jambi': 'Sumatra', 'South Sumatra': 'Sumatra', 'Ogan Komering Ilir': 'Sumatra',
          'West Kalimantan': 'Kalimantan', 'Central Kalimantan': 'Kalimantan', 'Papua': 'Papua', 'West Papua': 'Papua'}
ORDER = ['Central Kalimantan', 'West Kalimantan', 'Riau', 'Jambi', 'South Sumatra', 'Ogan Komering Ilir', 'Papua', 'West Papua']
did = {}
for name in ORDER:
    r = N['regions'][name]; t = r['means_2x2']
    did[name] = {
        'island': ISLAND[name], 'unit': 'regency' if name == 'Ogan Komering Ilir' else 'province',
        'peat': [round(x, 1) for x in t['peat']], 'nonpeat': [round(x, 1) for x in t['nonpeat']], 'gap': round(t['gap'], 1),
        'beta': round(r['beta'], 1), 'ci95': [round(x, 1) for x in r['ci95']], 'p_wild': round(r['p_wild'], 3),
        'cells': r['cells'], 'peat_km2': round(r['peat_km2']),
    }
islands = {k: {'beta': round(v['beta'], 1), 'ci95': [round(x, 1) for x in v['ci95']], 'p_wild': round(v['p_wild'], 3),
               'placebo': round(N['placebo_near'][k]['beta'], 1), 'placebo_p': round(N['placebo_near'][k]['p_wild'], 3),
               'dose': [round(x['beta'], 1) for x in N['dose'][k]]} for k, v in N['by_island'].items()}

W = res['W']
data = {
    'source': 'ERA5 100 m wind via Open-Meteo (mean Aug–Oct 2026, 1° grid); difference-in-differences on 5 km cells; see Paper/analysis.py',
    'wind': {'lons': [float(x) for x in w['lons']], 'lats': [float(x) for x in w['lats']],
             'u': np.round(u, 2).tolist(), 'v': np.round(v, 2).tolist(), 'months': 'Aug–Oct 2026'},
    'windModel': {
        'local_r2_out': round(W['M0 iso, Jul-Oct, 100 km']['r2_regency_out'], 2),
        'combined_r2_out': 0.50, 'placebo_r2_out': 0.47,   # recomputed at label points; Paper Table 1 note a
        'plume': res['P']['model']['plume'],
    },
    'did': did,
    'islands': islands,
}
out.write_text(json.dumps(data, separators=(',', ':')))
print('wrote', out, out.stat().st_size, 'bytes')
