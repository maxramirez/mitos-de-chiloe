// levels.js — LA CIUDAD DE LOS CÉSARES · the three handcrafted levels.
//
// COORDINATES — y up, walk nodes 1 unit apart. The camera is a fixed
// OrthographicCamera looking down the exact (1,1,1) diagonal (azimuth 45°,
// elevation atan(1/√2) ≈ 35.264°), so two points P and Q project to the SAME
// screen pixel iff  Q − P  is parallel to (1,1,1). Every `ill:1` edge below
// exploits that: its endpoints differ by exactly t·(1,1,1) at the required
// rotor index — physically apart, optically touching. That is the Monument
// Valley moment, and it is checked by assertAligned() at module load.
//
// NODES — { id, p:[x,y,z] } static, or { id, r:rotorIdx, l:[x,y,z] } local to
// a rotor (world = pivot + rotY(angle)·local; rotY(+90°): (x,z)→(z,−x)).
// EDGES — { a, b } static · { a, b, r, at } valid only at that rotor index ·
// `ill:1` marks a screen-space illusion edge (crossed along (1,1,1), the
// pilgrim's screen position does not move).
// ROTORS — kind 'bridge' (full 2-arm deck), 'disc' (carousel platform),
// 'arm' (asymmetric half arm, radius 2). All snap to 90°.
// GEO — decorative geometry, built by world.js:
//   ['slab', cx, topY, cz, w, d]      platform under tiles (top at topY−0.14)
//   ['pier', cx, cz, topY, w, d]      floating tower body + pyramid tip
//   ['turret', x, baseY, z, h]        little tower + teal cone roof
//   ['dome', x, baseY, z, r]          gold half dome
//   ['fin', x, topY, z, s]            hanging finial under a floating walk
//   ['box', cx, cy, cz, sx, sy, sz, mat]  raw block ('gold'|'teal'|'stone'…)
//   ['win', x, y, z, face]            emissive window ('x+'|'x-'|'z+'|'z-')
// Stairs are generated automatically for static edges with a height change.

export const LEVELS = [
  // ------------------------------------------------------------------ L1
  {
    name: 'I · EL UMBRAL',
    toast: 'haz girar el puente — la ciudad obedece al ángulo',
    center: [4.5, 2.3, 0.4],
    view: 4.7,
    rotors: [
      { pivot: [4, 2, 0], kind: 'bridge', along: 'x', start: 1 },
    ],
    nodes: [
      { id: 'a0', p: [0, 2, 1] },
      { id: 'a1', p: [0, 2, 0] },
      { id: 'a2', p: [1, 2, 0] },
      { id: 'a3', p: [2, 2, 0] },
      { id: 'rW', r: 0, l: [-1, 0, 0] },
      { id: 'rC', r: 0, l: [0, 0, 0] },
      { id: 'rE', r: 0, l: [1, 0, 0] },
      { id: 'b0', p: [6, 2, 0] },
      { id: 'b1', p: [7, 2.5, 0] },
      { id: 'b2', p: [8, 3, 0] },
      { id: 'door', p: [9, 3, 0] },
    ],
    edges: [
      { a: 'a0', b: 'a1' }, { a: 'a1', b: 'a2' }, { a: 'a2', b: 'a3' },
      { a: 'rW', b: 'rC' }, { a: 'rC', b: 'rE' },
      { a: 'b0', b: 'b1' }, { a: 'b1', b: 'b2' }, { a: 'b2', b: 'door' },
      // the rotor bridge spans the gap in either of its two flat orientations
      { a: 'a3', b: 'rW', r: 0, at: 0 }, { a: 'a3', b: 'rE', r: 0, at: 2 },
      { a: 'rE', b: 'b0', r: 0, at: 0 }, { a: 'rW', b: 'b0', r: 0, at: 2 },
    ],
    start: 'a0',
    door: 'door',
    doorAxis: 'x',
    geo: [
      ['slab', 0, 2, 1.0, 1.18, 3.4],
      ['slab', 1, 2, 0, 3.2, 1.18],
      ['pier', 0, 0.9, 1.62, 1.5, 2.6],
      ['pier', 1.9, 0, 1.62, 1.6, 1.4],
      ['turret', 0, 2, 2.3, 0.9],
      ['win', 0.77, 1.0, 0.9, 'x+'],
      ['slab', 6, 2, 0, 1.18, 1.18],
      ['pier', 6, 0, 1.62, 1.1, 1.1],
      ['slab', 8.5, 3, 0, 2.2, 1.18],
      ['pier', 8.5, 0, 2.62, 1.7, 1.2],
      ['win', 9.36, 1.8, 0, 'x+'],
      ['win', 8.5, 1.3, 0.61, 'z+'],
      ['box', 8.5, 2.66, -0.78, 0.7, 0.16, 0.5, 'gold'],
      ['dome', 8.5, 2.74, -0.78, 0.28],
      ['pier', 4, -2.6, 0.6, 0.9, 0.9],
      ['turret', 4, 0.6, -2.6, 1.0],
    ],
    solve: [['rotate', 0, 1], ['walk', 'door']],
  },

  // ------------------------------------------------------------------ L2
  {
    name: 'II · LAS DOS TORRES',
    toast: 'dos mecanismos — y un puente que solo el ojo construye',
    center: [2.9, 2.5, -0.8],
    view: 5.9,
    rotors: [
      { pivot: [0, 1, 0], kind: 'bridge', along: 'z', start: 1 },
      { pivot: [2, 2, -5], kind: 'bridge', along: 'z', start: 1 },
    ],
    nodes: [
      { id: 's0', p: [0, 1, 4] },
      { id: 's1', p: [0, 1, 3] },
      { id: 's2', p: [0, 1, 2] },
      { id: 'aP', r: 0, l: [0, 0, 1] },
      { id: 'aC', r: 0, l: [0, 0, 0] },
      { id: 'aM', r: 0, l: [0, 0, -1] },
      { id: 'm0', p: [0, 1, -2] },
      { id: 'm1', p: [1, 1.5, -2] },
      { id: 'm2', p: [2, 2, -2] },
      { id: 'm3', p: [2, 2, -3] },
      { id: 'bP', r: 1, l: [0, 0, 1] },
      { id: 'bC', r: 1, l: [0, 0, 0] },
      { id: 'bM', r: 1, l: [0, 0, -1] },
      { id: 'g0', p: [4, 4, -4] },
      { id: 'g1', p: [5, 4, -4] },
      { id: 'door', p: [6, 4, -4] },
    ],
    edges: [
      { a: 's0', b: 's1' }, { a: 's1', b: 's2' },
      { a: 'aP', b: 'aC' }, { a: 'aC', b: 'aM' },
      { a: 'm0', b: 'm1' }, { a: 'm1', b: 'm2' }, { a: 'm2', b: 'm3' },
      { a: 'bP', b: 'bC' }, { a: 'bC', b: 'bM' },
      { a: 'g0', b: 'g1' }, { a: 'g1', b: 'door' },
      { a: 's2', b: 'aP', r: 0, at: 0 }, { a: 's2', b: 'aM', r: 0, at: 2 },
      { a: 'aM', b: 'm0', r: 0, at: 0 }, { a: 'aP', b: 'm0', r: 0, at: 2 },
      { a: 'm3', b: 'bP', r: 1, at: 0 }, { a: 'm3', b: 'bM', r: 1, at: 2 },
      // THE ILLUSION — rotor B's far arm tip rests at (2,2,−6); the door
      // tower's landing g0 is at (4,4,−4): exactly +2·(1,1,1) away. At index
      // 0 (or flipped, index 2) they share one pixel and the pilgrim steps
      // across two towers' worth of empty air without moving on screen.
      { a: 'bM', b: 'g0', r: 1, at: 0, ill: 1 },
      { a: 'bP', b: 'g0', r: 1, at: 2, ill: 1 },
    ],
    start: 's0',
    door: 'door',
    doorAxis: 'x',
    geo: [
      ['slab', 0, 1, 3.2, 1.18, 3.8],
      ['pier', 0, 3.2, 0.62, 1.5, 2.4],
      ['turret', 0, 1, 4.75, 0.8],
      ['slab', 0, 1, -2, 1.18, 1.18],
      ['pier', 0, -2, 0.62, 1.1, 1.1],
      ['slab', 2, 2, -2.5, 1.18, 2.2],
      ['pier', 2, -2.5, 1.62, 1.4, 1.8],
      ['win', 2.71, 1.2, -2.5, 'x+'],
      ['pier', 2, -5, 1.55, 1.0, 1.0],
      ['slab', 5, 4, -4, 3.2, 1.18],
      ['pier', 5, -4, 3.62, 1.8, 1.3],
      ['win', 5.91, 2.8, -4, 'x+'],
      ['win', 5.4, 1.9, -3.34, 'z+'],
      ['box', 5, 3.94, -4.92, 0.9, 0.16, 0.55, 'gold'],
      ['dome', 5, 4.02, -4.92, 0.3],
      ['pier', -2, -4.5, 0.4, 0.9, 0.9],
      ['dome', -2, 0.4, -4.5, 0.34],
      ['pier', 5.5, 0.8, 0.5, 0.9, 0.9],
      ['turret', 5.5, 0.5, 0.8, 1.0],
    ],
    solve: [['rotate', 0, 1], ['walk', 'm3'], ['rotate', 1, 1], ['walk', 'door']],
  },

  // ------------------------------------------------------------------ L3
  {
    name: 'III · LA CIUDAD',
    toast: 'súbete al disco — la ciudad puede girar contigo dentro',
    center: [3.5, 1.9, -2.6],
    view: 6.6,
    rotors: [
      { pivot: [0, 0, -2], kind: 'disc', along: 'z', start: 0 },
      { pivot: [5, 2, -5], kind: 'arm', along: 'z', start: 0 },
    ],
    nodes: [
      { id: 'p0', p: [0, 0, 2] },
      { id: 'p1', p: [0, 0, 1] },
      { id: 'p2', p: [0, 0, 0] },
      { id: 'cP', r: 0, l: [0, 0, 1] },
      { id: 'cC', r: 0, l: [0, 0, 0] },
      { id: 'cM', r: 0, l: [0, 0, -1] },
      { id: 'w0', p: [-2, 0, -2] },
      { id: 'q0', p: [2, 0, -2] },
      { id: 'q1', p: [3, 1, -2] },
      { id: 'q2', p: [4, 2, -2] },
      { id: 'q3', p: [5, 2, -2] },
      { id: 'dI', r: 1, l: [0, 0, -1] },
      { id: 'dT', r: 1, l: [0, 0, -2] },
      { id: 'h0', p: [7, 4, -5] },
      { id: 'h1', p: [6, 4, -5] },
      { id: 'h2', p: [6, 4, -4] },
      { id: 'h3', p: [5, 4, -4] },
      { id: 'h4', p: [5, 4, -3] },
      { id: 'k0', p: [8, 2, -5] },
      { id: 'door', p: [9, 2, -5] },
    ],
    edges: [
      { a: 'p0', b: 'p1' }, { a: 'p1', b: 'p2' },
      { a: 'cP', b: 'cC' }, { a: 'cC', b: 'cM' },
      { a: 'q0', b: 'q1' }, { a: 'q1', b: 'q2' }, { a: 'q2', b: 'q3' },
      { a: 'dI', b: 'dT' },
      { a: 'h0', b: 'h1' }, { a: 'h1', b: 'h2' }, { a: 'h2', b: 'h3' }, { a: 'h3', b: 'h4' },
      { a: 'k0', b: 'door' },
      // the carousel disc — board it, spin it under your own feet
      { a: 'p2', b: 'cP', r: 0, at: 0 }, { a: 'p2', b: 'cM', r: 0, at: 2 },
      { a: 'q0', b: 'cP', r: 0, at: 1 }, { a: 'q0', b: 'cM', r: 0, at: 3 },
      { a: 'w0', b: 'cM', r: 0, at: 1 }, { a: 'w0', b: 'cP', r: 0, at: 3 },
      // board the half-arm when it points back at the stair tower
      { a: 'q3', b: 'dT', r: 1, at: 2 },
      // ILLUSION 1 — arm tip at index 0 sits at (5,2,−7); the rampart's h0 is
      // (7,4,−5) = tip + 2·(1,1,1). One pixel, two heights.
      { a: 'dT', b: 'h0', r: 1, at: 0, ill: 1 },
      // ILLUSION 2 — at index 1 the tip swings to (3,2,−5); the far rampart
      // end h4 (5,4,−3) = tip + 2·(1,1,1). The pilgrim steps DOWN out of the
      // sky back onto the machine — then rides it to the gate.
      { a: 'h4', b: 'dT', r: 1, at: 1, ill: 1 },
      { a: 'dT', b: 'k0', r: 1, at: 3 },
    ],
    start: 'p0',
    door: 'door',
    doorAxis: 'x',
    geo: [
      ['slab', 0, 0, 1, 1.18, 3.2],
      ['pier', 0, 1, -0.38, 1.5, 2.2],
      ['slab', -2, 0, -2.3, 1.18, 1.9],
      ['pier', -2, -2.3, -0.38, 1.0, 1.0],
      ['dome', -2, 0, -3.0, 0.3],
      ['pier', 0, -2, -0.45, 1.2, 1.2],
      ['slab', 2, 0, -2, 1.18, 1.18],
      ['pier', 2, -2, -0.38, 1.0, 1.0],
      ['slab', 3, 1, -2, 1.18, 1.18],
      ['pier', 3, -2, 0.62, 1.0, 1.0],
      ['slab', 4.5, 2, -2, 2.2, 1.18],
      ['pier', 4.5, -2, 1.62, 1.6, 1.2],
      ['win', 4.5, 1.0, -1.39, 'z+'],
      ['pier', 5, -5, 1.55, 1.0, 1.0],
      ['slab', 6.5, 4, -5, 2.2, 1.18],
      ['slab', 6, 4, -4.5, 1.18, 2.2],
      ['slab', 5.5, 4, -4, 2.2, 1.18],
      ['slab', 5, 4, -3.5, 1.18, 2.2],
      ['fin', 7, 4, -5, 0.5],
      ['fin', 6, 4, -4.5, 0.4],
      ['fin', 5, 4, -3, 0.5],
      ['slab', 8.5, 2, -5, 2.2, 1.18],
      ['pier', 8.5, -5, 1.62, 1.7, 1.2],
      ['win', 9.36, 1.1, -5, 'x+'],
      ['win', 8.5, 0.8, -4.39, 'z+'],
      ['box', 8.5, 1.66, -5.74, 0.7, 0.16, 0.5, 'gold'],
      ['dome', 8.5, 1.74, -5.74, 0.28],
      ['pier', 1, -6, 1.0, 0.9, 0.9],
      ['turret', 1, 1.0, -6, 1.1],
      ['pier', -1.5, -5, 0.5, 0.8, 0.8],
      ['dome', -1.5, 0.5, -5, 0.33],
      ['pier', 10, -7.5, 1.2, 0.9, 0.9],
      ['turret', 10, 1.2, -7.5, 1.0],
    ],
    solve: [
      ['walk', 'cC'], ['rotate', 0, 1], ['walk', 'q3'],
      ['rotate', 1, 2], ['walk', 'dI'], ['rotate', 1, 2], ['walk', 'h4'],
      ['rotate', 1, 1], ['walk', 'dT'], ['rotate', 1, 2], ['walk', 'door'],
    ],
  },
]

// ---------------------------------------------------------------------------
// Sanity: every illusion edge's endpoints must differ by t·(1,1,1) at its
// rotor index (the screen-space alignment the whole game stands on).
function rotL(l, k) {
  let x = l[0]
  let z = l[2]
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const nx = z
    z = -x
    x = nx
  }
  return [x, l[1], z]
}
export function nodeWorldAt(def, node, k) {
  if (!node.l) return node.p
  const r = def.rotors[node.r]
  const l = rotL(node.l, k)
  return [r.pivot[0] + l[0], r.pivot[1] + l[1], r.pivot[2] + l[2]]
}
;(function assertAligned() {
  for (const def of LEVELS) {
    const byId = {}
    for (const n of def.nodes) byId[n.id] = n
    for (const e of def.edges) {
      if (!e.ill) continue
      const a = nodeWorldAt(def, byId[e.a], e.at)
      const b = nodeWorldAt(def, byId[e.b], e.at)
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      if (Math.abs(d[0] - d[1]) > 1e-9 || Math.abs(d[1] - d[2]) > 1e-9) {
        throw new Error('cesares: illusion edge misaligned ' + e.a + '-' + e.b)
      }
    }
  }
})()
