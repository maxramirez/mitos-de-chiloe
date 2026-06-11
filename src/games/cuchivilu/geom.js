// EL CUCHIVILU — geom.js
// Shared world geometry: a 1000x1000 world, sea at the top, tidal flats below,
// and the semicircular stone corral (12 wall segments) whose mouth opens
// toward the sea (angle -PI/2 in canvas coords, y down).

export const TAU = Math.PI * 2
export const WORLD = 1000

// corral
export const CX = 500
export const CY = 640
export const R = 225
export const SEGN = 12
export const MOUTH_HALF = 0.85 // rad — the mouth gap, centered on -PI/2 (top)
export const A0 = -Math.PI / 2 + MOUTH_HALF // wall starts here…
export const SPAN = TAU - MOUTH_HALF * 2 // …and runs this far (12 segments)
export const SEG_W = SPAN / SEGN

// which wall segment covers angle `a` (radians, from corral center)?
// returns 0..11, or -1 if `a` falls in the mouth.
export function segAt(a) {
  let rel = (a - A0) % TAU
  if (rel < 0) rel += TAU
  if (rel >= SPAN) return -1
  const i = Math.floor(rel / SEG_W)
  return i < SEGN ? i : SEGN - 1
}

// El Cuchivilu's telegraph duration (s) — shared by the sim and the renderer
export const TELE_T = 2.2

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
