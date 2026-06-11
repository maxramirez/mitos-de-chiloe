// EL CAMAHUETO — textures.js
// Procedural CanvasTextures, generated once at module load and cached.
// All near-white grayscale so they modulate (never crush) the existing
// material colours; each doubles as its own bumpMap. Sine terms are periodic
// over the canvas so every texture tiles seamlessly; the per-pixel grain is
// uncorrelated noise, which is seam-free by nature. Zero per-frame cost.

import * as THREE from 'three';

function makeTex(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const k = (Math.PI * 2) / size; // one full period across the canvas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = fill(x, y, k, size);
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4; // three clamps to the device max
  return tex;
}

// ---------- gouged soil: mottle + drag-scratches running along z (canvas y) ----
const SCRATCHES = [ // x-centre, half-width, wiggle amp, wiggle freq, phase
  [31, 7, 10, 3, 0.4], [96, 5, 14, 2, 2.1], [150, 9, 8, 4, 4.4], [211, 6, 12, 3, 1.3],
];
export const soilTex = makeTex(256, (x, y, k, S) => {
  let v = 216
    + 13 * Math.sin(x * k * 5 + 2.0 * Math.sin(y * k * 2))
    + 9 * Math.sin(y * k * 11 + 1.6 * Math.sin(x * k * 3) + 1.2)
    + (Math.random() - 0.5) * 28;
  for (let s = 0; s < SCRATCHES.length; s++) {
    const sc = SCRATCHES[s];
    let dx = x - (sc[0] + sc[2] * Math.sin(y * k * sc[3] + sc[4]));
    dx = ((dx % S) + S * 1.5) % S - S / 2; // wrapped distance
    const a = Math.abs(dx);
    if (a < sc[1]) v -= 30 * (1 - a / sc[1]);
  }
  return v;
});
soilTex.repeat.set(3, 4); // integer v-repeat => chunk seams stay invisible

// ---------- weathered rock: broad mottle + pale lichen flecks ----------------
export const rockTex = makeTex(256, (x, y, k) => {
  const m = Math.sin(x * k * 3 + 2.4 * Math.sin(y * k * 2 + 0.8))
          * Math.sin(y * k * 4 + 2.0 * Math.sin(x * k * 3 + 2.2));
  let v = 212 + 15 * m + (Math.random() - 0.5) * 26;
  if (Math.sin(x * k * 13 + 5 * Math.sin(y * k * 7)) > 0.965) v += 15; // lichen
  return v;
});
rockTex.repeat.set(2, 2);

// ---------- wood grain: streaks along the trunk (cylinder v = canvas y) ------
export const woodTex = makeTex(256, (x, y, k) => {
  const wob = 2.2 * Math.sin(y * k * 2 + 1.4 * Math.sin(x * k));
  return 211
    + 16 * Math.sin(x * k * 14 + wob)
    + 7 * Math.sin(x * k * 31 + wob * 1.7 + 2.1)
    + (Math.random() - 0.5) * 16;
});
woodTex.repeat.set(1, 2);

// ---------- cloth weave for the poncho (fine diagonal cross-hatch) -----------
export const clothTex = makeTex(128, (x, y, k) => {
  return 214
    + 9 * Math.sin((x + y) * k * 18)
    + 9 * Math.sin((x - y) * k * 18 + 1.1)
    + (Math.random() - 0.5) * 14;
});
clothTex.repeat.set(2, 2);

// ---------- sea: long horizontal swell streaks (vary along v = canvas y) -----
export const seaTex = makeTex(128, (x, y, k) => {
  return 212
    + 18 * Math.sin(y * k * 6 + 2.6 * Math.sin(x * k * 2))
    + 8 * Math.sin(y * k * 13 + 1.8 * Math.sin(x * k * 3) + 2.4)
    + (Math.random() - 0.5) * 12;
});
seaTex.repeat.set(8, 4);
