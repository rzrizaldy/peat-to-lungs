"""Marina Bay is mapped as the Marina Reservoir relation, and prep.py's coastline fill
picked the wrong side. Rebuild the water as the plot square minus the land bounded by the
two mapped shore lines (Singapore River south bank, then the bay edge round the Merlion pier),
and put the six illustrative bumboats back on the bay."""
import json
from shapely.geometry import Polygon, box, mapping

p = 'sg/work/scene.json'
s = json.load(open(p, encoding='utf-8'))
H = s['meta']['half']
s0, s1 = s['shore']                      # s0: south bank of the river mouth; s1: bay edge, north to south
# land: bottom-left corner, up the west edge to the river's south bank, along it to the bay, round the
# Merlion pier along s1 to the bottom edge, and back along the bottom
# s0 = bottom edge -> bend (-69, 4.6) -> west edge; its lower leg has land on both sides, so only the
# bend and the westward leg (the river's south bank) bound the land. s1[0] is the reservoir edge along
# the Esplanade Bridge (water on both sides), so the bay edge starts at s1[1].
land = Polygon([(-H, -H), (-H, s0[-1][1]), tuple(s0[-1]), tuple(s0[1]),
                *[tuple(q) for q in s1[1:]], (s1[-1][0], -H)])
land = land.buffer(0)
water = box(-H, -H, H, H).difference(land)
geoms = getattr(water, 'geoms', [water])
s['water'] = [[[list(map(lambda v: round(v, 2), c)) for c in g.exterior.coords]] +
              [[list(map(lambda v: round(v, 2), c)) for c in r.coords] for r in g.interiors] for g in geoms]
s['boats'] = [{'x': 62, 'y': 48, 'a': 20, 'l': 8.5, 'k': 0}, {'x': 78, 'y': -18, 'a': 95, 'l': 7, 'k': 2},
              {'x': 40, 'y': -72, 'a': 140, 'l': 8.5, 'k': 4}, {'x': 88, 'y': 76, 'a': 60, 'l': 6, 'k': 1},
              {'x': 30, 'y': 78, 'a': 170, 'l': 7, 'k': 3}, {'x': 92, 'y': 18, 'a': 10, 'l': 6, 'k': 5}]
json.dump(s, open(p, 'w', encoding='utf-8'), separators=(',', ':'))
print('land area', round(land.area), 'water parts', len(geoms), [round(g.area) for g in geoms])
