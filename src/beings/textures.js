// Procedural CanvasTexture helpers for the beings (and the stalker).
// Each texture is drawn ONCE at factory time on a small offscreen canvas —
// nothing here runs per frame. Patterns are drawn in near-white grayscale so
// the existing material colors keep tinting them (palette and fog readability
// unchanged); the same canvas doubles as a subtle bumpMap for fiber/hide feel.
// Deterministic: a seeded hash, never Math.random(). No DOM -> null (no-op).
import * as THREE from 'three';

// deterministic per-index hash, same recipe the beings already use
function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Make a repeating CanvasTexture. draw(g, size, rnd) paints the pattern.
// Returns null when no DOM/2d context (tests, SSR): callers skip assignment.
export function makeTexture(size, repeat, draw, seed) {
  if (typeof document === 'undefined') return null;
  let canvas, g;
  try {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    g = canvas.getContext('2d');
  } catch (e) {
    return null;
  }
  if (!g) return null;
  let n = (seed || 0) | 0;
  const rnd = () => hash(++n);
  draw(g, size, rnd);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Apply a texture as color map + bump to one or more materials. Safe no-op
// when tex is null. bumpScale stays tiny: detail, not lumps.
export function applyWeave(tex, materials, bumpScale) {
  if (!tex) return;
  for (const m of materials) {
    m.map = tex;
    m.bumpMap = tex;
    m.bumpScale = bumpScale === undefined ? 0.02 : bumpScale;
    m.needsUpdate = true;
  }
}

// ---- shared pattern painters (each character picks + tunes its own) -------

// Vertical fiber striation: woven dress, poncho weave, fur, ragged coat.
// jitter bends the strands; light/dark are 0..255 grayscale bounds.
export function paintFibers(g, size, rnd, opts) {
  const o = opts || {};
  const count = o.count || 26;
  const base = o.base === undefined ? 232 : o.base;
  const range = o.range === undefined ? 46 : o.range;
  const jitter = o.jitter === undefined ? 2.5 : o.jitter;
  const wave = o.wave === undefined ? 3 : o.wave;
  g.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = (base - range + rnd() * range * 2) | 0;
    g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.85)';
    g.lineWidth = 0.6 + rnd() * 1.6;
    const x0 = rnd() * size;
    const ph = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x0, -2);
    for (let y = 0; y <= size; y += 4) {
      g.lineTo(x0 + Math.sin(ph + (y / size) * Math.PI * wave) * jitter + (rnd() - 0.5), y);
    }
    g.stroke();
  }
  // faint cross-weft so it reads as weave, not just streaks
  for (let i = 0; i < count * 0.4; i++) {
    const v = (base - range * 0.6 + rnd() * range) | 0;
    g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)';
    g.lineWidth = 0.5 + rnd();
    const y0 = rnd() * size;
    g.beginPath();
    g.moveTo(-2, y0);
    g.lineTo(size + 2, y0 + (rnd() - 0.5) * 4);
    g.stroke();
  }
}

// Mottled hide / blotches: camahueto hide, rock-wet patina.
export function paintHide(g, size, rnd, opts) {
  const o = opts || {};
  const base = o.base === undefined ? 235 : o.base;
  const range = o.range === undefined ? 40 : o.range;
  const blotches = o.blotches || 34;
  g.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < blotches; i++) {
    const v = (base - range + rnd() * range * 2) | 0;
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + rnd() * 0.3) + ')';
    const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * (size / 7);
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

// Scar lines over mottled skin: the invunche.
export function paintScars(g, size, rnd, opts) {
  const o = opts || {};
  paintHide(g, size, rnd, { base: o.base === undefined ? 228 : o.base, range: 26, blotches: 24 });
  const scars = o.scars || 12;
  for (let i = 0; i < scars; i++) {
    const long = rnd() < 0.5;
    const v = long ? 150 + (rnd() * 30) | 0 : 252; // dark gashes, pale keloids
    g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.5 + rnd() * 0.35) + ')';
    g.lineWidth = long ? 1.2 + rnd() * 1.6 : 0.8 + rnd();
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI;
    const len = size * (0.15 + rnd() * 0.3);
    const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    g.beginPath();
    g.moveTo(x - dx / 2, y - dy / 2);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 8, x + dx / 2, y + dy / 2);
    g.stroke();
    // stitch ticks across the long gashes
    if (long && rnd() < 0.7) {
      g.lineWidth = 0.7;
      const ticks = 2 + (rnd() * 3) | 0;
      for (let k = 1; k <= ticks; k++) {
        const tx = x - dx / 2 + (dx * k) / (ticks + 1);
        const ty = y - dy / 2 + (dy * k) / (ticks + 1);
        g.beginPath();
        g.moveTo(tx + dy * 0.04, ty - dx * 0.04);
        g.lineTo(tx - dy * 0.04, ty + dx * 0.04);
        g.stroke();
      }
    }
  }
}

// Pearl iridescence: soft overlapping pastel discs on a bright ground.
// Pale hues survive the material tint as a nacre shimmer.
export function paintPearl(g, size, rnd, opts) {
  const o = opts || {};
  g.fillStyle = 'rgb(238,242,243)';
  g.fillRect(0, 0, size, size);
  const discs = o.discs || 30;
  const HUES = [
    [255, 226, 235], // rose
    [222, 236, 255], // ice blue
    [226, 255, 240], // seafoam
    [244, 234, 255], // lilac
    [255, 246, 220], // warm shell
  ];
  for (let i = 0; i < discs; i++) {
    const h = HUES[(rnd() * HUES.length) | 0];
    const x = rnd() * size, y = rnd() * size, r = size * (0.08 + rnd() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',0.5)');
    grad.addColorStop(1, 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // crescent highlights — the wet gleam of nacre
  for (let i = 0; i < discs * 0.4; i++) {
    g.strokeStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.3) + ')';
    g.lineWidth = 0.8 + rnd() * 1.4;
    const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * (size / 9);
    const a = rnd() * Math.PI * 2;
    g.beginPath();
    g.arc(x, y, r, a, a + 1.1 + rnd());
    g.stroke();
  }
}
