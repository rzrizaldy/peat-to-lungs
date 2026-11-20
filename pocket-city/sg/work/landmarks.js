// Marina Bay landmarks for the Peat to Lungs opening scene.
// The Merlion: 8.6 m tall, lion head on a fish body, spouts water into the bay (Wikipedia, Merlion Park).
// It stands on the pier mapped as "Merlion Fountain" (OSM way 182819157), centre at scene (-12.9, -3.5),
// facing east over Marina Bay. Simplified massing: proportions follow photographs at the pier; no fins or scales.
const MER = { x: -12.9, y: -3.5 };
const EAST = (() => { const N = SCENE.meta.north; return [N[1], -N[0]]; })();   // scene direction of true east
const merAt = (off, side = 0) => [MER.x + EAST[0] * off - EAST[1] * side, MER.y + EAST[1] * off + EAST[0] * side];
const ringAt = (z, r, off, sq = 1, n = 18) => {
  const [cx, cy] = merAt(off);
  return Array.from({ length: n }, (_, i) => {
    const a = i * 2 * Math.PI / n, u = Math.cos(a) * r, v = Math.sin(a) * r * sq;   // u along the facing, v across
    return [cx + EAST[0] * u - EAST[1] * v, cy + EAST[1] * u + EAST[0] * v, z];
  });
};
const STONE = '#ece8de', ROCK = '#bdb5a5', JET = '#e3f1f4';

const LANDMARKS = [
  {
    name: 'Merlion',
    ids: [],
    build() {
      const fp = ccw(polygon(MER.x, MER.y, 1.9, 14));
      const statue = obj(fp, 8.8, () => {
        const body = (c) => n => tone(n, soft(c));
        // rock plinth, fish body tapering up to the neck, then the maned lion head
        const prof = [[0.0, 1.75, 0, .95], [0.85, 1.55, -.05, .9], [2.4, 1.2, -.12, .78], [4.1, 1.02, -.05, .72],
          [5.4, 0.95, .12, .72], [5.75, 1.42, .2, .9], [7.2, 1.5, .25, .92], [8.15, 1.1, .2, .85], [8.6, 0.35, .15, .8]];
        let s = '';
        for (let i = 0; i + 1 < prof.length; i++) {
          const [z0, r0, o0, q0] = prof[i], [z1, r1, o1, q1] = prof[i + 1];
          s += loft(ringAt(z0, r0, o0, q0), ringAt(z1, r1, o1, q1), body(i === 0 ? ROCK : STONE));
        }
        // tail curling up behind the body
        s += loft(ringAt(0.85, .55, -1.35, 1, 10), ringAt(2.3, .35, -1.65, 1, 10), body(STONE));
        s += loft(ringAt(2.3, .35, -1.65, 1, 10), ringAt(3.0, .12, -1.45, 1, 10), body(STONE));
        // the mouth, facing the bay
        const [mx, my] = merAt(1.55);
        s += ball([mx, my, 6.85], .26, soft('#6d6a62'), .5);
        return s;
      });
      // the water jet: an arc from the mouth out over the bay (drawn as droplets)
      const jet = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, d = 1.8 + 9.5 * t, z = 6.85 + 1.4 * t - 8.25 * t * t;
        if (z < .1) break;
        jet.push([...merAt(d), z, .2 + .22 * t]);
      }
      const [j0x, j0y] = merAt(1.8), [j1x, j1y] = merAt(11.3);
      const jetFp = [[j0x - EAST[1] * .5, j0y + EAST[0] * .5], [j1x - EAST[1] * .5, j1y + EAST[0] * .5],
        [j1x + EAST[1] * .5, j1y - EAST[0] * .5], [j0x + EAST[1] * .5, j0y - EAST[0] * .5]];
      const water = obj(ccw(jetFp), 8.4, () => jet.map(([x, y, z, r]) => ball([x, y, z], r, soft(JET), .35)).join(''));
      return [statue, water];
    },
  },
];
