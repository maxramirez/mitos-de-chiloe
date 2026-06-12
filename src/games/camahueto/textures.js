// EL CAMAHUETO — textures.js
// Procedural CanvasTextures, generated once at module load and cached.
// All near-white grayscale so they modulate (never crush) the existing
// material colours; each doubles as its own bumpMap. Sine terms are periodic
// over the canvas so every texture tiles seamlessly; the per-pixel grain is
// uncorrelated noise, which is seam-free by nature. Zero per-frame cost.

import * as THREE from 'three';

// ---------- soft round mote: shared sprite map for every Points cloud --------
// Without a map, gl_POINTS rasterize as hard squares — near the camera the
// burst debris and gold dust read as confetti cubes. One tiny radial-gradient
// canvas turns them all into soft round motes. Made once; alpha matters here,
// so it bypasses makeTex.
export const moteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

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

// ---------- colour textures (characters) -------------------------------------
// Same idea as makeTex but RGB: fill writes into out[0..2]. sRGB so the baked
// colours read true under ACES tone mapping (matches the other games).
function makeColorTex(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const k = (Math.PI * 2) / size;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fill(x, y, k, size, out);
      const i = (y * size + x) * 4;
      d[i] = out[0] < 0 ? 0 : out[0] > 255 ? 255 : out[0];
      d[i + 1] = out[1] < 0 ? 0 : out[1] > 255 ? 255 : out[1];
      d[i + 2] = out[2] < 0 ? 0 : out[2] > 255 ? 255 : out[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Chilote woven poncho: umber ground with cream / madder / charcoal bands
// toward the hem. Cone v=1 at the tip and flipY put canvas y=0 at the
// shoulders, so band positions are t = y/size (0 shoulders -> 1 hem).
// Baked around the old colour * map average so scene brightness is unchanged;
// the diagonal weave hatch and thread noise live in every band.
export const ponchoTex = makeColorTex(128, (x, y, k, S, out) => {
  const t = y / S + 0.01 * Math.sin(x * k * 3); // slightly wavy hand-loomed bands
  let r = 92, g = 75, b = 52; // umber ground
  if ((t > 0.50 && t < 0.545) || (t > 0.70 && t < 0.725) || (t > 0.86 && t < 0.885)) {
    r = 205; g = 188; b = 150; // undyed cream wool (bright: bands must read at 6 m)
  } else if (t > 0.55 && t < 0.645) {
    r = 140; g = 48; b = 32; // madder red, widened
  } else if ((t > 0.645 && t < 0.675) || (t > 0.93 && t < 0.96)) {
    r = 36; g = 28; b = 20; // charcoal, deepened
  }
  const weave = 5 * Math.sin((x + y) * k * 18) + 5 * Math.sin((x - y) * k * 18 + 1.1);
  const n = (Math.random() - 0.5) * 14;
  out[0] = r + weave + n;
  out[1] = g + weave + n;
  out[2] = b + weave * 0.8 + n;
});
ponchoTex.repeat.set(2, 1); // 2 wraps around the body; bands run once tip->hem

// Rider's head: dark hair cap with a ragged fringe, then a warm skin gradient
// that darkens toward the jaw (cheap baked shading). Sphere v=1 at the crown
// and flipY put canvas y=0 at the crown.
export const faceTex = makeColorTex(64, (x, y, k, S, out) => {
  const t = y / S;
  const fringe = 0.34 + 0.05 * Math.sin(x * k * 7 + 1.2) + 0.025 * Math.sin(x * k * 17);
  const n = (Math.random() - 0.5) * 10;
  if (t < fringe) {
    const strand = 9 * Math.sin(x * k * 40); // strands along the wrap
    out[0] = 48 + strand + n;
    out[1] = 34 + strand * 0.8 + n;
    out[2] = 24 + strand * 0.6 + n;
  } else {
    const s = (t - fringe) / (1 - fringe); // 0 brow -> 1 jaw/neck
    out[0] = 168 - 44 * s + n;
    out[1] = 132 - 38 * s + n;
    out[2] = 98 - 30 * s + n;
  }
});

// ---------- calf hide: silvery dapple + short fur streaks (map + bump) -------
export const hideTex = makeTex(128, (x, y, k) => {
  let v = 222
    + 7 * Math.sin(y * k * 22 + 2.2 * Math.sin(x * k * 5)) // fur direction
    + (Math.random() - 0.5) * 22;
  const blob = Math.sin(x * k * 6 + 2.6 * Math.sin(y * k * 3 + 0.7))
             * Math.sin(y * k * 5 + 2.1 * Math.sin(x * k * 4 + 1.9));
  if (blob > 0.45) v -= 24 * (blob - 0.45) / 0.55; // soft dapple spots
  return v;
});
hideTex.repeat.set(2, 2);

// ---------- sea: long horizontal swell streaks (vary along v = canvas y) -----
export const seaTex = makeTex(128, (x, y, k) => {
  return 212
    + 18 * Math.sin(y * k * 6 + 2.6 * Math.sin(x * k * 2))
    + 8 * Math.sin(y * k * 13 + 1.8 * Math.sin(x * k * 3) + 2.4)
    + (Math.random() - 0.5) * 12;
});
seaTex.repeat.set(8, 4);
