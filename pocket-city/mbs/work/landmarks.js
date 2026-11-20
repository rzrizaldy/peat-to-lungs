// Marina Bay Sands landmarks for the Peat to Lungs opening scene.
// Facts (Wikipedia, Marina Bay Sands; ArtScience Museum): three 55-storey towers, broader at the base and narrowing
// as they rise, each with two asymmetric legs, a curved eastern leg leaning against the other; a 340 m SkyPark with
// a 146 m vanishing-edge pool, gardens and a 66.5 m cantilever over the north tower; the ArtScience Museum, a lotus
// form of a round base and ten "fingers", the tallest 60 m above ground. Footprints and heights from OpenStreetMap
// (towers 193 m, SkyPark 193–207 m). Massing is simplified: no balconies, louvres or facade fins.
const MBS_U = [0.397, 0.918];                 // SkyPark long axis (north-ish), from its OSM outline
const MBS_V = [MBS_U[1], -MBS_U[0]];          // across the towers, pointing east
const MBS_TOWERS = [
  { id: 'w116801004', c: [63.05, -165.88] },   // Tower 1 (south)
  { id: 'w172307472', c: [116.02, -62.49] },   // Tower 2
  { id: 'w172307471', c: [143.9, 38.33] },     // Tower 3 (north)
];
const MBS_TOP = 193, MBS_DECK = 200;
const mbsPt = (c, s, v) => [c[0] + MBS_U[0] * s + MBS_V[0] * v, c[1] + MBS_U[1] * s + MBS_V[1] * v];
const mbsRect = (c, hl, v0, v1, z) => [[-hl, v0], [hl, v0], [hl, v1], [-hl, v1]].map(([s, v]) => [...mbsPt(c, s, v), z]);
const mbsSoft = col => n => tone(n, soft(col));
const ART = { x: -52.5, y: 199.5 };

const LANDMARKS = [
  {
    name: 'Marina Bay Sands towers',
    ids: MBS_TOWERS.map(t => t.id),
    build() {
      return MBS_TOWERS.map(({ c }) => {
        const hl = 21;                                     // half depth along the SkyPark axis
        // west leg: a straight slab, slightly thinner at the top
        const west = z => mbsRect(c, hl, -25 + 3 * z / MBS_TOP, -9, z);
        // east leg: starts 16 m east of the west leg and curves in to meet it near the top
        const east = z => { const k = 1 - Math.pow(1 - z / MBS_TOP, 1.6), v0 = 9 - 16 * k, v1 = 26 - 22 * k;
          return mbsRect(c, hl - 1, v0, v1, z); };
        const fp = ccw([mbsPt(c, -hl, -26), mbsPt(c, hl, -26), mbsPt(c, hl, 27), mbsPt(c, -hl, 27)]);
        return obj(fp, MBS_TOP + 1, () => {
          let s = '';
          const zs = [0, 24, 48, 72, 96, 120, 144, 168, MBS_TOP];
          // east leg first (it sits behind the west leg for most views from the bay), then the west leg
          for (let i = 0; i + 1 < zs.length; i++) s += loft(east(zs[i]), east(zs[i + 1]), mbsSoft('#cdd3d3'));
          for (let i = 0; i + 1 < zs.length; i++) s += loft(west(zs[i]), west(zs[i + 1]), mbsSoft('#dde1df'));
          // floor bands every 10 storeys on the west face
          for (let k = 1; k < 6; k++) {
            const z = k * 35; const [a, b] = [mbsPt(c, -hl, -25 + 3 * z / MBS_TOP), mbsPt(c, hl, -25 + 3 * z / MBS_TOP)];
            s += edge([...a, z], [...b, z], '#9aa6a6', .35);
          }
          s += shape(west(MBS_TOP), '#e8eae6', .5);
          return s;
        });
      });
    },
  },
  {
    name: 'SkyPark',
    ids: ['w116800998'],
    build() {
      const b = findBuilding('w116800998'), ring = ccw(b.ring);
      const deck = block(ring, MBS_TOP, MBS_DECK, { facade: 'plain', wall: '#efece4', trim: '#f7f5ee', floor: 7 });
      const c = [116.02, -62.49];
      const pool = [[-70, -16], [76, -16], [76, -10], [-70, -10]].map(([s, v]) => [...mbsPt(c, s, v), MBS_DECK + .08]);
      const trees = [];
      for (let s = -150; s <= 150; s += 14) trees.push([...mbsPt(c, s, 8 + 4 * Math.sin(s)), MBS_DECK]);
      return obj(ring, MBS_DECK + 4, () => {
        let svg = deck.draw();
        svg += shape(atZ(ring, MBS_DECK + .05), '#a9c48e', .5);
        svg += shape(pool, '#7fc3cf', .4);
        for (const [x, y, z] of trees) if (b.ring && ring.length) svg += ball([x, y, z + 1.6], 1.5, soft('#6f9a54'), .35);
        return svg;
      });
    },
  },
  {
    name: 'ArtScience Museum',
    ids: [],                                            // its many OSM parts are replaced in city.json (they stop at 26 m)
    build() {
      const models = [];
      const base = ccw(polygon(ART.x, ART.y, 24, 20));
      models.push(obj(base, 12, () => {
        const ring = (z, r) => polygon(ART.x, ART.y, r, 20).map(p => [...p, z]);
        return loft(ring(0, 18), ring(6, 22), mbsSoft('#e9e6de')) + loft(ring(6, 22), ring(11, 25), mbsSoft('#f1eee7'))
          + shape(ring(11, 25), '#ecd9a8', .5);
      }));
      // ten fingers: lengths and heights vary, the tallest reaching 60 m
      const H = [60, 52, 45, 38, 32, 28, 30, 36, 44, 54], R = [44, 42, 40, 37, 34, 32, 33, 36, 39, 43];
      for (let k = 0; k < 10; k++) {
        const a = Math.PI * 0.75 + k * 2 * Math.PI / 10, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
        const path = t => { const r = 10 + (R[k] - 10) * t, z = 9 + (H[k] - 9) * Math.pow(t, 1.25);
          return [ART.x + d[0] * r, ART.y + d[1] * r, z]; };
        const section = t => { const p = path(t), w = 8.5 * (1 - t) + 1.2 * t, h = w * .55;
          return Array.from({ length: 10 }, (_, i) => { const q = i * 2 * Math.PI / 10;
            return [p[0] + n[0] * w * Math.cos(q), p[1] + n[1] * w * Math.cos(q), p[2] + h * Math.sin(q)]; }); };
        const tip = path(1), root = path(0);
        const fp = ccw([[root[0] + n[0] * 8, root[1] + n[1] * 8], [tip[0] + n[0] * 1.5, tip[1] + n[1] * 1.5],
          [tip[0] - n[0] * 1.5, tip[1] - n[1] * 1.5], [root[0] - n[0] * 8, root[1] - n[1] * 8]]);
        models.push(obj(fp, H[k] + 2, () => {
          let s = '';
          for (let i = 0; i < 8; i++) s += loft(section(i / 8), section((i + 1) / 8), mbsSoft('#f3f1ec'));
          return s;
        }));
      }
      return models;
    },
  },
  {
    name: 'Apple Marina Bay Sands',
    ids: ['w821764692'],
    build() {
      const c = [-230.02, -103.15], r = 16;
      const fp = ccw(polygon(c[0], c[1], r, 18));
      return obj(fp, r, () => {
        let s = '';
        for (let i = 0; i < 6; i++) {
          const a0 = i * Math.PI / 12, a1 = (i + 1) * Math.PI / 12;
          const ring = a => polygon(c[0], c[1], r * Math.cos(a), 18).map(p => [...p, r * Math.sin(a)]);
          s += loft(ring(a0), ring(a1), mbsSoft('#cfe3e6'));
        }
        return s;
      });
    },
  },
];
