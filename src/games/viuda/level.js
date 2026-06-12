// level.js — LA VIUDA · constants of the night road (positions in meters).
// The road runs west→east along the coast: the sea far behind, fence posts
// near, the village lights at the end. Everything here is deterministic.

export const ROAD_LEN = 1000
export const VILLAGE_X = ROAD_LEN
export const PACE_SPEED = [0, 2.7, 5.6] // detenido · al paso · al trote (m/s)
export const ACCEL = 2.2 // ox-cart, not a horse — everything takes a moment
export const DECEL = 3.0

export const NIGHT_S = 340 // real seconds from 23:00 to medianoche
export const OIL_S = 150 // a full lantern burns this long
export const POUR_S = 4.5 // refilling at a cruz, stopped, takes this long
export const CRUZ_RANGE = 7
export const CRUCES = [{ x: 360 }, { x: 680 }]

export const VIUDA_X = [220, 450, 670, 860] // where she waits
export const APPEAR_AHEAD = 48 // the lantern gutters this far before her
export const ZONE_BEFORE = 14 // her presence zone starts here, before her
export const ZONE_AFTER = 8 // …and releases a few steps past her

export const STAMINA_S = 28 // continuous trote on a fresh ox
export const REC_PASO = 1 / 80 // stamina regained per second al paso
export const REC_STOP = 1 / 20 // …and detenido
export const EXHAUST_S = 10 // forced stop when the ox gives out

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// potholes — seeded and deterministic; kept clear of the start, the village,
// the cruces and every presence zone so the rules never collide
export const POTHOLES = (() => {
  const rng = mulberry32(4242)
  const out = []
  let guard = 0
  while (out.length < 13 && guard++ < 4000) {
    const x = 70 + rng() * (ROAD_LEN - 160)
    let ok = true
    for (let i = 0; i < out.length && ok; i++) if (Math.abs(out[i] - x) < 26) ok = false
    for (let i = 0; i < CRUCES.length && ok; i++) if (Math.abs(CRUCES[i].x - x) < 18) ok = false
    for (let i = 0; i < VIUDA_X.length && ok; i++)
      if (x > VIUDA_X[i] - ZONE_BEFORE - 12 && x < VIUDA_X[i] + ZONE_AFTER + 8) ok = false
    if (ok) out.push(x)
  }
  out.sort((a, b) => a - b)
  return out
})()
