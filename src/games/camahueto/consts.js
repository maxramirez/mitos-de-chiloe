// EL CAMAHUETO — shared constants and terrain math (pure, allocation-free).

export const TRACK_LEN = 1900;   // meters from start to the sea
export const SLOPE = 0.12;       // constant downhill gradient (y = z * SLOPE; forward is -z)
export const HALF_W = 5.2;       // player lateral clamp (half playable channel width)
export const BANK_X = 5.5;       // where the earthen banks begin to rise
export const CHUNK = 60;         // terrain chunk length (m)
export const N_CHUNKS = 7;       // recycled chunks
export const SPEED_MIN = 12;     // m/s at the top of the gully
export const SPEED_MAX = 26;     // m/s at the sea
export const JUMP_V0 = 9.0;      // -> 0.6 s of air with G below
export const GRAV = 30;
export const MAX_HITS = 3;
export const INVULN_T = 1.5;

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Cross-section of the gully: shallow dish in the channel, banks rising outside.
export function bankY(x) {
  const a = Math.abs(x);
  const t = a / BANK_X;
  const dish = 0.6 * (t > 1 ? 1 : t * t);
  const w = a - BANK_X;
  const wall = w > 0 ? Math.min(9, (w * 0.95) * (w * 0.95)) : 0;
  return dish + wall;
}

// World ground height (ignoring cosmetic micro-noise).
export function groundY(x, z) { return z * SLOPE + bankY(x); }

// Cosmetic micro-noise, periodic in z over CHUNK so recycled chunks tile seamlessly.
export function microNoise(x, zLocal) {
  const k = (Math.PI * 2) / CHUNK;
  return (
    Math.sin(zLocal * k * 3 + x * 0.9) * 0.085 +
    Math.sin(zLocal * k * 7 + x * 1.7 + 2.1) * 0.045 +
    Math.sin(x * 2.3 + 0.5) * 0.05
  );
}

// Deterministic seeded RNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
