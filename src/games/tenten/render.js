// ============================================================
// TENTEN Y CAICAI — render.js
// 2D canvas, isometric stacked diamonds.
// All per-frame work is allocation-free: every texture is baked
// once at boot — backdrop (painted PNG with a full procedural
// fallback), 30 land-tile sprites (6 heights × 5 grain variants),
// a tiling water-sparkle pattern and the serpent's head glow.
// ============================================================

import { SIZE, idx, inBounds } from './sim.js';

const VW = 860; // virtual canvas size (scaled to fit window)
const VH = 600;
const CX = VW / 2;
const CY = 296;
const HW = 23; // half tile width
const HH = 11.5; // half tile height
const TZ = 11; // pixels per height level

const STEP_T = 0.26; // must match main.js
const FLOOD_RISE_T = 1.1;

// land palette, low marsh to pale summit (h 0..5)
const TOPS = ['#23291f', '#33402c', '#415138', '#566346', '#6e7a52', '#8d9465'];
// per-variant whisper tints so no two neighbouring faces read flat-identical:
// mossy, neutral, dry straw, cool damp, peaty
const FACE_TINT = [
  'rgba(124, 152, 96, 0.09)',
  'rgba(0, 0, 0, 0)',
  'rgba(196, 178, 110, 0.08)',
  'rgba(110, 150, 150, 0.075)',
  'rgba(96, 78, 58, 0.09)',
];
const DIGIT_COLOR = 'rgba(232, 220, 192, 0.34)';
const WATER_FILL = '#0e2c38';
const WATER_LINE = 'rgba(159, 255, 208, 0.16)';
const FOAM = 'rgba(214, 255, 236, 0.85)';
const GLOW = '#9fffd0';
const BAD = '#c96a5a';

function shade(hex, f) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * f);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * f);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// deterministic boot-time rand for all baked textures
let seed = 7;
function srand(s) {
  seed = s | 0;
}
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let scale = 1;
  let offX = 0;
  let offY = 0;

  // --- static board geometry ---
  const N = SIZE * SIZE;
  const BX = new Float32Array(N);
  const BY = new Float32Array(N);
  const ORDER = new Int16Array(N);
  const VARI = new Uint8Array(N); // per-tile grain variant (deterministic)
  {
    let o = 0;
    for (let s = 0; s <= (SIZE - 1) * 2; s++) {
      for (let x = 0; x < SIZE; x++) {
        const y = s - x;
        if (y < 0 || y >= SIZE) continue;
        ORDER[o++] = idx(x, y);
      }
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        BX[idx(x, y)] = CX + (x - y) * HW;
        BY[idx(x, y)] = CY + (x + y - 12) * HH;
        VARI[idx(x, y)] = (x * 7 + y * 13) % 5;
      }
    }
  }

  const DIGITS = ['0', '1', '2', '3', '4', '5'];
  const PREVIEW = ['0→1', '1→2', '2→3', '3→4', '4→5', '—'];

  let simRef = null;

  // ============================================================
  // BAKED TEXTURES (all generated once, here, at boot)
  // ============================================================

  // --- backdrop: procedural night sea painted first; the gpt-image-1
  //     painting at /assets/tenten/backdrop.png replaces it when (if)
  //     it loads. Both go through the same readability veil so the
  //     board always pops. Draw cost per frame: one drawImage.
  const BWD = 1024;
  const BHD = 640;
  const HORIZON = 268;
  const back = document.createElement('canvas');
  back.width = BWD;
  back.height = BHD;

  function paintReadabilityVeil(b) {
    // dark pool where the island sits + an overall veil
    const g = b.createRadialGradient(BWD / 2, BHD * 0.6, 70, BWD / 2, BHD * 0.6, 430);
    g.addColorStop(0, 'rgba(3, 6, 9, 0.5)');
    g.addColorStop(1, 'rgba(3, 6, 9, 0)');
    b.fillStyle = g;
    b.fillRect(0, 0, BWD, BHD);
    b.fillStyle = 'rgba(4, 7, 10, 0.28)';
    b.fillRect(0, 0, BWD, BHD);
  }

  function paintProceduralBackdrop() {
    const b = back.getContext('2d');
    srand(99173);
    // sky
    let g = b.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, '#04070d');
    g.addColorStop(0.72, '#081424');
    g.addColorStop(1, '#0d1e2a');
    b.fillStyle = g;
    b.fillRect(0, 0, BWD, HORIZON);
    // sea
    g = b.createLinearGradient(0, HORIZON, 0, BHD);
    g.addColorStop(0, '#0c1f2b');
    g.addColorStop(0.35, '#081421');
    g.addColorStop(1, '#04080d');
    b.fillStyle = g;
    b.fillRect(0, HORIZON, BWD, BHD - HORIZON);
    // moon + halo (upper right — the tile rim-light agrees with this)
    const mx = 792;
    const my = 104;
    g = b.createRadialGradient(mx, my, 8, mx, my, 170);
    g.addColorStop(0, 'rgba(232, 220, 192, 0.32)');
    g.addColorStop(0.28, 'rgba(214, 216, 188, 0.1)');
    g.addColorStop(1, 'rgba(214, 216, 188, 0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(mx, my, 170, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = '#ddd3b4';
    b.beginPath();
    b.arc(mx, my, 33, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = 'rgba(168, 162, 138, 0.55)';
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 24;
      b.beginPath();
      b.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, 1.5 + rnd() * 4, 0, Math.PI * 2);
      b.fill();
    }
    // faint baked stars (the live twinkling ones layer on top)
    b.fillStyle = 'rgba(190, 205, 198, 0.5)';
    for (let i = 0; i < 110; i++) {
      b.globalAlpha = 0.08 + rnd() * 0.3;
      b.fillRect(rnd() * BWD, rnd() * (HORIZON - 30), rnd() < 0.12 ? 2 : 1, 1);
    }
    b.globalAlpha = 1;
    // distant island silhouettes resting on the horizon
    b.fillStyle = '#0a161e';
    b.beginPath();
    b.moveTo(40, HORIZON);
    b.quadraticCurveTo(150, HORIZON - 26, 300, HORIZON);
    b.closePath();
    b.fill();
    b.beginPath();
    b.moveTo(540, HORIZON);
    b.quadraticCurveTo(640, HORIZON - 16, 760, HORIZON);
    b.closePath();
    b.fill();
    b.fillStyle = '#0c1a23';
    b.beginPath();
    b.moveTo(860, HORIZON);
    b.quadraticCurveTo(950, HORIZON - 20, 1050, HORIZON);
    b.closePath();
    b.fill();
    // moon glint column on the water
    for (let y = HORIZON + 6; y < BHD - 40; y += 5 + rnd() * 9) {
      const sp = ((y - HORIZON) / (BHD - HORIZON)) * 130;
      const wdt = 4 + rnd() * (10 + sp * 0.45);
      b.globalAlpha = (0.26 - (y - HORIZON) / (BHD - HORIZON) * 0.22) * (0.5 + rnd() * 0.5);
      b.fillStyle = rnd() < 0.25 ? '#cfe7d2' : '#b9c8ae';
      b.fillRect(mx - sp / 2 + (rnd() - 0.5) * sp, y, wdt, 1 + (rnd() < 0.2 ? 1 : 0));
    }
    b.globalAlpha = 1;
    // sparse wave hairlines elsewhere
    b.fillStyle = 'rgba(140, 190, 180, 0.1)';
    for (let i = 0; i < 60; i++) {
      const y = HORIZON + 8 + rnd() * (BHD - HORIZON - 30);
      b.fillRect(rnd() * BWD, y, 8 + rnd() * 36, 1);
    }
    // spectral mist hugging the horizon
    g = b.createLinearGradient(0, HORIZON - 22, 0, HORIZON + 30);
    g.addColorStop(0, 'rgba(120, 200, 175, 0)');
    g.addColorStop(0.5, 'rgba(120, 200, 175, 0.07)');
    g.addColorStop(1, 'rgba(120, 200, 175, 0)');
    b.fillStyle = g;
    b.fillRect(0, HORIZON - 22, BWD, 52);
    paintReadabilityVeil(b);
  }
  paintProceduralBackdrop();

  {
    // painted backdrop: swap in over the procedural one if it loads.
    // On any failure (404, decode error) the procedural sky simply stays.
    const img = new Image();
    img.onload = () => {
      const b = back.getContext('2d');
      const s = Math.max(BWD / img.width, BHD / img.height);
      b.drawImage(img, (BWD - img.width * s) / 2, (BHD - img.height * s) / 2, img.width * s, img.height * s);
      paintReadabilityVeil(b);
    };
    img.src = '../assets/tenten/backdrop.jpg';
  }

  // --- land tile sprites: 6 heights × 5 variants, grain + strata baked.
  //     Anchor: (HW+PAD, HH+PAD) is the centre of the TOP diamond.
  const PAD = 2;
  const SPR = [];
  function bakeTile(h, v) {
    const W = HW * 2 + PAD * 2;
    const H = HH * 2 + h * TZ + PAD * 2;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const b = c.getContext('2d');
    const cx = HW + PAD;
    const cy = HH + PAD; // top diamond centre
    const by = cy + h * TZ; // base diamond centre
    const f = 1 + (v - 2) * 0.045;
    const base = TOPS[h];
    srand(h * 733 + v * 131 + 17);
    if (h > 0) {
      // cliff faces
      b.fillStyle = shade(base, 0.52 * f);
      b.beginPath();
      b.moveTo(cx - HW, cy);
      b.lineTo(cx, cy + HH);
      b.lineTo(cx, by + HH);
      b.lineTo(cx - HW, by);
      b.closePath();
      b.fill();
      b.fillStyle = shade(base, 0.7 * f);
      b.beginPath();
      b.moveTo(cx + HW, cy);
      b.lineTo(cx, cy + HH);
      b.lineTo(cx, by + HH);
      b.lineTo(cx + HW, by);
      b.closePath();
      b.fill();
      // everything below lands only on already-painted face pixels
      b.globalCompositeOperation = 'source-atop';
      // variant tint + one broad damp patch — cliff walls stop reading flat
      b.fillStyle = FACE_TINT[v];
      b.fillRect(0, cy, W, h * TZ + HH + PAD);
      {
        const dmx = cx - HW + rnd() * HW * 2;
        const dmy = cy + rnd() * (h * TZ);
        const dmr = 8 + rnd() * 10;
        const dg = b.createRadialGradient(dmx, dmy, 0, dmx, dmy, dmr);
        dg.addColorStop(0, 'rgba(0, 0, 0, 0.11)');
        dg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        b.fillStyle = dg;
        b.fillRect(dmx - dmr, dmy - dmr, dmr * 2, dmr * 2);
      }
      // sediment strata: one dark seam per raised level, following the slope
      b.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      b.lineWidth = 1;
      for (let k = 1; k < h + 1; k++) {
        const yy = cy + k * TZ - 2 + rnd() * 2;
        b.beginPath();
        b.moveTo(cx - HW, yy);
        b.lineTo(cx, yy + HH);
        b.lineTo(cx + HW, yy);
        b.stroke();
      }
      // vertical rain-streaks and pale mineral flecks
      for (let s = 0; s < 8; s++) {
        const sx = cx - HW + rnd() * HW * 2;
        const sy = cy + rnd() * (h * TZ);
        const ln = 3 + rnd() * (TZ * 0.9);
        b.fillStyle = rnd() < 0.6 ? 'rgba(0, 0, 0, 0.13)' : 'rgba(220, 224, 196, 0.07)';
        b.fillRect(sx, sy, 1, ln);
      }
      // ambient occlusion pooling at the foot of the cliff
      const ao = b.createLinearGradient(0, by - TZ * 0.8, 0, by + HH);
      ao.addColorStop(0, 'rgba(0, 0, 0, 0)');
      ao.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
      b.fillStyle = ao;
      b.fillRect(0, by - TZ, W, HH + TZ + PAD);
      // cool moonlight kiss down the right face edge
      b.fillStyle = 'rgba(159, 255, 208, 0.05)';
      b.fillRect(cx + HW - 3, cy, 3, h * TZ);
      b.globalCompositeOperation = 'source-over';
    }
    // top diamond
    b.fillStyle = shade(base, f);
    b.beginPath();
    b.moveTo(cx, cy - HH);
    b.lineTo(cx + HW, cy);
    b.lineTo(cx, cy + HH);
    b.lineTo(cx - HW, cy);
    b.closePath();
    b.fill();
    b.save();
    b.clip();
    // variant tint wash + broad soft mottle: big tonal patches under the
    // grain so each top face carries its own quiet weather
    b.fillStyle = FACE_TINT[v];
    b.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
    for (let i = 0; i < 3; i++) {
      const mx2 = cx - HW + rnd() * HW * 2;
      const my2 = cy - HH + rnd() * HH * 2;
      const mr = 7 + rnd() * 9;
      const mg = b.createRadialGradient(mx2, my2, 0, mx2, my2, mr);
      mg.addColorStop(0, rnd() < 0.5 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(236, 240, 208, 0.09)');
      mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      b.fillStyle = mg;
      b.fillRect(mx2 - mr, my2 - mr, mr * 2, mr * 2);
    }
    // grain: speckles + short wind-combed strokes along the iso axes
    for (let i = 0; i < 30; i++) {
      const px = cx - HW + rnd() * HW * 2;
      const py = cy - HH + rnd() * HH * 2;
      b.fillStyle = rnd() < 0.5 ? 'rgba(0, 0, 0, 0.1)' : 'rgba(236, 240, 208, 0.07)';
      b.fillRect(px, py, 1 + rnd() * 1.5, 1);
    }
    for (let i = 0; i < 7; i++) {
      const px = cx - HW + rnd() * HW * 2;
      const py = cy - HH + rnd() * HH * 2;
      const ln = 3 + rnd() * 6;
      const dir = rnd() < 0.5 ? 1 : -1;
      b.strokeStyle = rnd() < 0.5 ? 'rgba(0, 0, 0, 0.09)' : 'rgba(232, 238, 200, 0.07)';
      b.beginPath();
      b.moveTo(px, py);
      b.lineTo(px + ln, py + dir * ln * (HH / HW));
      b.stroke();
    }
    // soft self-shadow toward the lower-left of the top face
    const ts = b.createLinearGradient(cx + HW * 0.6, cy - HH * 0.6, cx - HW * 0.7, cy + HH * 0.7);
    ts.addColorStop(0, 'rgba(255, 248, 220, 0.05)');
    ts.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    ts.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    b.fillStyle = ts;
    b.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
    b.restore();
    // grid stroke (kept — puzzle readability) + moonlit rim on the NE edge
    b.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(cx, cy - HH);
    b.lineTo(cx + HW, cy);
    b.lineTo(cx, cy + HH);
    b.lineTo(cx - HW, cy);
    b.closePath();
    b.stroke();
    b.strokeStyle = h > 0 ? 'rgba(232, 220, 192, 0.2)' : 'rgba(232, 220, 192, 0.08)';
    b.beginPath();
    b.moveTo(cx, cy - HH);
    b.lineTo(cx + HW, cy);
    b.stroke();
    return c;
  }
  for (let h = 0; h <= 5; h++) {
    SPR[h] = [];
    for (let v = 0; v < 5; v++) SPR[h][v] = bakeTile(h, v);
  }

  // --- water sparkle: one tiling canvas, drifted per frame via a
  //     single cached DOMMatrix (no per-frame allocations)
  const WPS = 192;
  const wpc = document.createElement('canvas');
  wpc.width = WPS;
  wpc.height = WPS;
  {
    const b = wpc.getContext('2d');
    srand(421);
    for (let i = 0; i < 150; i++) {
      b.globalAlpha = 0.05 + rnd() * 0.2;
      b.fillStyle = rnd() < 0.3 ? '#cfe9da' : '#7fd4cf';
      b.fillRect(rnd() * WPS, rnd() * WPS, 1 + (rnd() < 0.4 ? rnd() * 2 : 0), 1);
    }
    for (let i = 0; i < 22; i++) {
      b.globalAlpha = 0.06 + rnd() * 0.09;
      b.fillStyle = '#9fffd0';
      b.fillRect(rnd() * WPS, rnd() * WPS, 4 + rnd() * 8, 1);
    }
    b.globalAlpha = 1;
  }
  const waterPat = ctx.createPattern(wpc, 'repeat');
  const patM = new DOMMatrix();

  // --- serpent head glow sprite ---
  const headGlow = document.createElement('canvas');
  headGlow.width = 64;
  headGlow.height = 64;
  {
    const b = headGlow.getContext('2d');
    const g = b.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(159, 255, 208, 0.5)');
    g.addColorStop(0.45, 'rgba(159, 255, 208, 0.14)');
    g.addColorStop(1, 'rgba(159, 255, 208, 0)');
    b.fillStyle = g;
    b.fillRect(0, 0, 64, 64);
  }

  // --- Caicai segment sprites: wet sphere shading + combed scale seams.
  //     Variant 0 = body, 1 = the darker band every 4th segment.
  //     Baked once; per frame each segment is one scaled drawImage.
  const SEGD = 48;
  const SEG_SPR = [];
  function bakeSegment(variant) {
    const c = document.createElement('canvas');
    c.width = SEGD;
    c.height = SEGD;
    const b = c.getContext('2d');
    const cx = SEGD / 2;
    const r = SEGD / 2 - 2;
    srand(variant * 977 + 31);
    // sphere lit from the upper right (the moon's side of the sky)
    const g = b.createRadialGradient(cx + 7, cx - 8, 2, cx, cx, r);
    if (variant === 1) {
      g.addColorStop(0, '#3c6a68');
      g.addColorStop(0.45, '#16343b');
      g.addColorStop(1, '#071219');
    } else {
      g.addColorStop(0, '#32585e');
      g.addColorStop(0.45, '#112730');
      g.addColorStop(1, '#060e13');
    }
    b.fillStyle = g;
    b.beginPath();
    b.arc(cx, cx, r, 0, Math.PI * 2);
    b.fill();
    b.save();
    b.beginPath();
    b.arc(cx, cx, r, 0, Math.PI * 2);
    b.clip();
    // scale rows: dark seam under each scale, pale moon-glint above it
    for (let row = -2; row <= 4; row++) {
      const ry = cx - 14 + row * 7;
      for (let k = -2; k <= 2; k++) {
        const sx = cx + k * 9 + (row % 2 ? 4.5 : 0) + (rnd() - 0.5) * 2;
        b.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        b.lineWidth = 1.2;
        b.beginPath();
        b.arc(sx, ry, 5.5, Math.PI * 0.15, Math.PI * 0.85);
        b.stroke();
        b.strokeStyle = 'rgba(159, 255, 208, 0.07)';
        b.lineWidth = 1;
        b.beginPath();
        b.arc(sx, ry - 1, 5.5, Math.PI * 0.18, Math.PI * 0.82);
        b.stroke();
      }
    }
    // bioluminescent flecks ride the banded segments
    if (variant === 1) {
      b.fillStyle = 'rgba(127, 212, 207, 0.55)';
      b.fillRect(cx + 6, cx - 4, 1.6, 1.6);
      b.fillRect(cx - 5, cx + 5, 1.3, 1.3);
    }
    b.restore();
    // moonlit rim along the upper-right edge
    b.strokeStyle = 'rgba(190, 255, 226, 0.3)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.arc(cx, cx, r - 1, -Math.PI * 0.42, Math.PI * 0.12);
    b.stroke();
    return c;
  }
  SEG_SPR[0] = bakeSegment(0);
  SEG_SPR[1] = bakeSegment(1);

  // --- Caicai's skull: top-down spade head pointing +x, baked once and
  //     drawn rotated to the path tangent (the eyes stay live to pulse).
  const headSpr = document.createElement('canvas');
  headSpr.width = 64;
  headSpr.height = 40;
  {
    const b = headSpr.getContext('2d');
    const my = 20;
    b.beginPath();
    b.moveTo(6, my);
    b.quadraticCurveTo(7, 9, 20, 7);
    b.quadraticCurveTo(34, 5.5, 44, 11);
    b.quadraticCurveTo(56, 16, 59, my);
    b.quadraticCurveTo(56, 24, 44, 29);
    b.quadraticCurveTo(34, 34.5, 20, 33);
    b.quadraticCurveTo(7, 31, 6, my);
    b.closePath();
    const g = b.createRadialGradient(34, my - 2, 2, 32, my, 30);
    g.addColorStop(0, '#3a686c');
    g.addColorStop(0.5, '#143038');
    g.addColorStop(1, '#06121a');
    b.fillStyle = g;
    b.fill();
    b.save();
    b.clip();
    // brow ridges shadowing the eye pits
    b.fillStyle = 'rgba(0, 0, 0, 0.4)';
    b.beginPath();
    b.ellipse(40, my - 7, 6, 2.6, -0.18, 0, Math.PI * 2);
    b.fill();
    b.beginPath();
    b.ellipse(40, my + 7, 6, 2.6, 0.18, 0, Math.PI * 2);
    b.fill();
    // gill slashes at the back of the jaw
    b.strokeStyle = 'rgba(0, 0, 0, 0.38)';
    b.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      b.beginPath();
      b.moveTo(13 + k * 4, my - 8 + k);
      b.quadraticCurveTo(11 + k * 4, my, 13 + k * 4, my + 8 - k);
      b.stroke();
    }
    // wet sheen down the spine
    b.strokeStyle = 'rgba(190, 255, 226, 0.22)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(10, my);
    b.quadraticCurveTo(36, my - 1.5, 56, my);
    b.stroke();
    // nostrils
    b.fillStyle = 'rgba(0, 0, 0, 0.6)';
    b.beginPath();
    b.arc(53, my - 2.2, 1.1, 0, Math.PI * 2);
    b.fill();
    b.beginPath();
    b.arc(53, my + 2.2, 1.1, 0, Math.PI * 2);
    b.fill();
    b.restore();
    // dorsal crest: spectral diamonds along the spine, glow-edged
    b.fillStyle = '#1d4a4a';
    b.strokeStyle = 'rgba(159, 255, 208, 0.3)';
    b.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) {
      const dx = 12 + k * 8;
      b.beginPath();
      b.moveTo(dx, my - 3.2);
      b.lineTo(dx + 3.4, my);
      b.lineTo(dx, my + 3.2);
      b.lineTo(dx - 3.4, my);
      b.closePath();
      b.fill();
      b.stroke();
    }
    // dark eye pits — the live glow eyes land exactly on these
    b.fillStyle = '#051014';
    b.beginPath();
    b.ellipse(41, my - 6, 3.4, 2.4, -0.15, 0, Math.PI * 2);
    b.fill();
    b.beginPath();
    b.ellipse(41, my + 6, 3.4, 2.4, 0.15, 0, Math.PI * 2);
    b.fill();
  }

  // --- the lost-villager seal, baked (drawSeal rotates + scales it) ---
  const sealSpr = document.createElement('canvas');
  sealSpr.width = 44;
  sealSpr.height = 24;
  {
    const b = sealSpr.getContext('2d');
    // plump teardrop body: tail left, muzzle right
    b.beginPath();
    b.moveTo(3, 12);
    b.quadraticCurveTo(8, 4, 22, 4.5);
    b.quadraticCurveTo(32, 5, 36, 9);
    b.quadraticCurveTo(41, 10.5, 41.5, 13);
    b.quadraticCurveTo(38, 17, 30, 18);
    b.quadraticCurveTo(14, 20, 3, 12);
    b.closePath();
    const g = b.createLinearGradient(0, 0, 0, 24);
    g.addColorStop(0, '#5d7e86'); // moonlit wet back
    g.addColorStop(0.55, '#39505a');
    g.addColorStop(1, '#1d2c33');
    b.fillStyle = g;
    b.fill();
    b.save();
    b.clip();
    // mottled hide
    srand(2027);
    b.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let i = 0; i < 14; i++) {
      b.beginPath();
      b.ellipse(6 + rnd() * 30, 6 + rnd() * 12, 1 + rnd() * 1.8, 0.7 + rnd() * 1, rnd(), 0, Math.PI * 2);
      b.fill();
    }
    // wet sheen along the back
    b.strokeStyle = 'rgba(214, 255, 236, 0.4)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(8, 7.5);
    b.quadraticCurveTo(22, 4.5, 34, 8);
    b.stroke();
    b.restore();
    // fore-flipper
    b.fillStyle = '#26383f';
    b.beginPath();
    b.moveTo(22, 15);
    b.quadraticCurveTo(20, 21, 14, 22);
    b.quadraticCurveTo(19, 16.5, 18, 14.5);
    b.closePath();
    b.fill();
    // tail flukes
    b.beginPath();
    b.moveTo(4, 11);
    b.lineTo(0, 6);
    b.lineTo(2, 12);
    b.lineTo(0, 18);
    b.closePath();
    b.fill();
    // eye, with a small sorrowful glint
    b.fillStyle = '#0a1216';
    b.beginPath();
    b.arc(35.5, 10.5, 1.5, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = 'rgba(214, 255, 236, 0.8)';
    b.fillRect(35.9, 9.8, 0.7, 0.7);
    // whisker dots
    b.fillStyle = 'rgba(0, 0, 0, 0.45)';
    b.fillRect(39.2, 12.2, 0.8, 0.8);
    b.fillRect(38.2, 13.4, 0.8, 0.8);
  }

  // --- freshly-raised flash stamps (interaction juice) ---
  const flashT = new Float32Array(N).fill(-9);

  function setLevel(sim) {
    simRef = sim;
    // a restart starts visually clean
    shakeAmp = 0;
    surgeT = 0;
    flashT.fill(-9);
    for (let i = 0; i < PN; i++) parts[i].on = false;
  }

  function onHeightChanged(x, y) {
    // heights live in the sim; sprites index off them directly.
    // Stamp the tile so the change confirms itself with a brief glow.
    flashT[idx(x, y)] = animT;
  }

  // --- stars (built once, twinkle in place) ---
  const STARS = [];
  for (let i = 0; i < 80; i++) {
    STARS.push({
      x: Math.random() * VW,
      y: Math.random() * VH * 0.5,
      r: 0.4 + Math.random() * 0.9,
      ph: Math.random() * Math.PI * 2,
    });
  }

  // --- particle pool ---
  const PN = 220;
  const parts = [];
  for (let i = 0; i < PN; i++) {
    parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 2, kind: 0 });
  }
  let pCursor = 0;
  function spawn(kind, x, y, vx, vy, g, life, size) {
    const p = parts[pCursor];
    pCursor = (pCursor + 1) % PN;
    p.on = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.g = g;
    p.life = life;
    p.max = life;
    p.size = size;
  }
  // 0 = dust (earth), 1 = splash (water), 2 = spark (glow)
  function tileTopXY(x, y, out) {
    const i = idx(x, y);
    out[0] = BX[i];
    out[1] = BY[i] - (simRef ? simRef.heights[i] : 0) * TZ - HH * 0.4;
  }
  const TT = [0, 0];

  function dust(x, y) {
    tileTopXY(x, y, TT);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 14 + Math.random() * 30;
      spawn(0, TT[0], TT[1] + 4, Math.cos(a) * sp, -Math.abs(Math.sin(a)) * sp - 18, 90, 0.5 + Math.random() * 0.35, 1.5 + Math.random() * 1.8);
    }
  }
  function splash(x, y) {
    tileTopXY(x, y, TT);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 38;
      spawn(1, TT[0], TT[1], Math.cos(a) * sp, -Math.abs(Math.sin(a)) * sp - 26, 130, 0.6 + Math.random() * 0.4, 1.2 + Math.random() * 1.6);
    }
  }
  function sparkle(x, y) {
    tileTopXY(x, y, TT);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 22;
      spawn(2, TT[0], TT[1] - 8, Math.cos(a) * sp, Math.sin(a) * sp - 22, -16, 0.7 + Math.random() * 0.5, 1 + Math.random() * 1.4);
    }
  }

  // --- screen shake / serpent surge ---
  let shakeAmp = 0;
  let surgeT = 0;
  function shake(a) {
    shakeAmp = Math.min(7, shakeAmp + a);
  }
  function surge() {
    surgeT = 1.6;
    shake(4);
  }

  // --- Caicai, coiled around the island ---
  const SEGS = 44;
  const segX = new Float32Array(SEGS);
  const segY = new Float32Array(SEGS);
  let headA = Math.PI * 0.75;
  let animT = 0;

  function update(dt) {
    animT += dt;
    headA += dt * (surgeT > 0 ? 0.85 : 0.1);
    if (surgeT > 0) surgeT -= dt;
    if (shakeAmp > 0) shakeAmp = Math.max(0, shakeAmp - dt * 9);
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // backdrop cover-fit (cached on resize — fills the whole window,
  // so the letterbox bands around the virtual area are gone)
  let bkS = 1;
  let bkX = 0;
  let bkY = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    offX = (window.innerWidth - VW * scale) / 2;
    offY = (window.innerHeight - VH * scale) / 2;
    bkS = Math.max(window.innerWidth / BWD, window.innerHeight / BHD);
    bkX = (window.innerWidth - BWD * bkS) / 2;
    bkY = (window.innerHeight - BHD * bkS) / 2;
  }

  // virtual coords from a pointer event
  function pick(clientX, clientY) {
    if (!simRef) return -1;
    const vx = (clientX - offX) / scale;
    const vy = (clientY - offY) / scale;
    for (let o = N - 1; o >= 0; o--) {
      const i = ORDER[o];
      const ty = BY[i] - simRef.heights[i] * TZ;
      const dx = Math.abs(vx - BX[i]) / HW;
      const dy = Math.abs(vy - ty) / HH;
      if (dx + dy <= 1) return i;
      // wall silhouette: between the top diamond's lower edge and the base
      // diamond's lower edge — so clicking a tall tile's visible side never
      // falls through to the occluded tile behind it
      if (simRef.heights[i] > 0 && dx <= 1 && vy > ty && vy <= BY[i] + HH * (1 - dx)) return i;
    }
    return -1;
  }

  function diamond(x, y) {
    ctx.beginPath();
    ctx.moveTo(x, y - HH);
    ctx.lineTo(x + HW, y);
    ctx.lineTo(x, y + HH);
    ctx.lineTo(x - HW, y);
    ctx.closePath();
  }

  function easeWater(p) {
    return p * p * (3 - 2 * p);
  }

  // per-villager poncho tints (deterministic by id) — undyed island wools,
  // all light enough that the silhouette still reads against the dark land
  const PONCHO = ['#e0d6c2', '#d8d2c6', '#e4d6b4', '#cfc9bd', '#e0ccae', '#d9d3b8'];
  const PONCHO_DK = ['#9b8f74', '#948e80', '#a39271', '#8d887c', '#9c8a6e', '#959070'];
  // one dyed accent per villager — madder, indigo, moss, ochre, mauve, alerce —
  // small enough to whisper, saturated enough to tell figures apart at distance
  const BAND = ['#8f4634', '#46618c', '#6f7c3e', '#9a6630', '#7c4a70', '#3c7060'];
  // the same dyes lifted toward the moon — for the wool cap, where a saturated
  // accent against dark hair finally reads at gameplay distance
  const BAND_LIT = ['#c06a50', '#6d88b8', '#97a45c', '#c08a4a', '#a8709a', '#5c9c86'];

  function drawVillagerFigure(sx, sy, bob, alpha, id = 0, walkP = -1, lean = 0) {
    ctx.globalAlpha = alpha;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1, 4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    const lit = PONCHO[id % PONCHO.length];
    const dk = PONCHO_DK[id % PONCHO_DK.length];
    // feet: two alternating steps while marching
    if (walkP >= 0) {
      const ph = Math.sin(walkP * Math.PI * 2);
      ctx.fillStyle = dk;
      ctx.fillRect(sx - 1.7 + ph * 1.4, sy - 1.6, 1.3, 1.8);
      ctx.fillRect(sx + 0.4 - ph * 1.4, sy - 1.6, 1.3, 1.8);
    }
    const hx = sx + lean; // shoulders lean into the walk
    // the hem lags the body sway — cloth living half a beat behind
    const hem = Math.sin(animT * 3.1 + id * 2.3) * 0.7;
    const top = sy - 11 - bob;
    const base = sy - bob * 0.4;
    // poncho, shadow side (away from the moon)
    ctx.fillStyle = dk;
    ctx.beginPath();
    ctx.moveTo(hx, top);
    ctx.quadraticCurveTo(sx - 3.6, sy - 5 - bob * 0.6, sx - 3.4 + hem * 0.5, base);
    ctx.lineTo(sx + 0.5, base);
    ctx.closePath();
    ctx.fill();
    // poncho, moonlit panel
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.moveTo(hx, top);
    ctx.quadraticCurveTo(sx + 3.7, sy - 5 - bob * 0.6, sx + 3.4 + hem, base);
    ctx.lineTo(sx - 0.6, base);
    ctx.closePath();
    ctx.fill();
    // woven stripe — a dyed chilote manta band across the chest
    ctx.strokeStyle = BAND[id % BAND.length];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 2.1, sy - 7.5 - bob * 0.85);
    ctx.lineTo(hx + 2.3, sy - 7.1 - bob * 0.85);
    ctx.stroke();
    // matching dyed hem edging where the poncho meets the ground
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx - 2.9 + hem * 0.5, base - 0.5);
    ctx.lineTo(sx + 2.9 + hem, base - 0.5);
    ctx.stroke();
    // rim light down the moonward edge
    ctx.strokeStyle = 'rgba(244, 248, 216, 0.6)';
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, top + 0.6);
    ctx.quadraticCurveTo(sx + 3.5, sy - 5 - bob * 0.6, sx + 3.2 + hem, base);
    ctx.stroke();
    // a bundle on some backs — what they could carry, they carried
    if (id % 3 === 0) {
      ctx.fillStyle = '#6b5a42';
      ctx.beginPath();
      ctx.arc(hx - 2.2, sy - 9.6 - bob, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // head: dark hair over a moonlit face, one glint of moon on the crown
    ctx.fillStyle = '#352c22';
    ctx.beginPath();
    ctx.arc(hx, sy - 12.4 - bob, 2.1, 0, Math.PI * 2);
    ctx.fill();
    // gorro chilote — a dyed wool cap, each villager their own colour
    ctx.fillStyle = BAND_LIT[id % BAND_LIT.length];
    ctx.beginPath();
    ctx.arc(hx, sy - 12.6 - bob, 2.0, Math.PI * 0.98, Math.PI * 2.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.arc(hx + 0.5, sy - 12 - bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(252, 252, 230, 0.85)';
    ctx.fillRect(hx + 1, sy - 13.6 - bob, 0.7, 0.7);
    ctx.globalAlpha = 1;
  }

  function drawSeal(sx, sy, t, id = 0) {
    // t: 0..1.6 transformation clock — the person sinks, the seal slips out
    const sink = Math.min(1, t / 0.5);
    if (sink < 1) drawVillagerFigure(sx, sy + sink * 6, 0, 1 - sink, id);
    // splash flourish at the breach: a fan of foam droplets on small
    // ballistic arcs, a quick bright crown ring, two spectral flecks
    // rising — all stateless from t, so it replays identically
    const sp = (t - 0.3) / 0.6;
    if (sp > 0 && sp < 1) {
      const fade = 1 - sp;
      srand(617 + id * 131);
      // thin central plume, the first water thrown upward
      ctx.fillStyle = FOAM;
      ctx.globalAlpha = fade * 0.7;
      ctx.fillRect(sx - 0.6, sy + 2 - sp * 17, 1.2, 3.5 + sp * 3);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI + (rnd() - 0.5) * 0.35;
        const v0 = 16 + rnd() * 18;
        const px = sx + Math.cos(a) * v0 * sp;
        const py = sy + 3 - Math.sin(a) * v0 * sp + 30 * sp * sp;
        const dsz = 0.9 + rnd() * 1.2;
        ctx.globalAlpha = fade * (0.45 + rnd() * 0.4);
        ctx.fillRect(px - dsz / 2, py - dsz / 2, dsz, dsz);
      }
      // the myth leaving the body: two glow motes drift up
      ctx.fillStyle = GLOW;
      ctx.globalAlpha = fade * 0.65;
      ctx.fillRect(sx - 4 + rnd() * 2, sy - 2 - sp * 14, 1.2, 1.2);
      ctx.fillRect(sx + 3 + rnd() * 2, sy - 4 - sp * 19, 1.1, 1.1);
      // foam crown — brighter and quicker than the travel ripple below
      ctx.strokeStyle = FOAM;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = fade * 0.62;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 4, 3 + sp * 13, 1.3 + sp * 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
    const st = (t - 0.35) / 1.25;
    if (st > 0 && st < 1) {
      const dx = sx + st * 16;
      const dy = sy + 3 + Math.sin(st * Math.PI) * -5;
      const dive = Math.cos(st * Math.PI) * -0.35; // breaches up, noses down
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(dive);
      ctx.globalAlpha = (1 - st) * 0.92;
      ctx.drawImage(sealSpr, -10, -5.5, 20, 11);
      ctx.restore();
      // ripple
      ctx.strokeStyle = WATER_LINE;
      ctx.lineWidth = 1;
      ctx.globalAlpha = (1 - st) * 0.7;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 4, 8 + st * 22, 3 + st * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const OFFS = [
    [0, 0], [-6, -2], [6, -2], [-6, 3], [6, 3], [0, -6],
  ];

  // true when (x, y) stands dry above the rendered water level
  function dryAt(x, y, wl) {
    return inBounds(x, y) && simRef.heights[idx(x, y)] > wl;
  }

  function draw(game, hover) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // night sea backdrop, cover-fit to the whole window
    ctx.fillStyle = '#06090c';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(back, bkX, bkY, BWD * bkS, BHD * bkS);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    // stars
    ctx.fillStyle = '#aebdb4';
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      ctx.globalAlpha = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(animT * 0.7 + s.ph));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    const sim = game.sim;
    let sx = 0;
    let sy = 0;
    if (shakeAmp > 0.01) {
      sx = Math.sin(animT * 61) * shakeAmp;
      sy = Math.cos(animT * 53) * shakeAmp * 0.6;
    }
    ctx.translate(sx, sy);

    // drift the water sparkle (one mutation of a cached matrix)
    patM.e = (animT * 6) % WPS;
    patM.f = (animT * 2.2) % WPS;
    waterPat.setTransform(patM);

    // Caicai behind the island
    if (sim) drawSerpent(game, true);

    if (sim) {
      const heights = sim.heights;
      // render water level (floats up during the rise animation)
      let wl = sim.water;
      if (game.phase === 'playing' && game.sub === 'flood' && game.floodRising) {
        wl = sim.water + easeWater(Math.min(1, game.t / FLOOD_RISE_T));
      }
      const marchP = game.sub === 'march' ? Math.min(1, game.t / STEP_T) : 0;

      ctx.lineWidth = 1;
      ctx.font = '8px Georgia'; // set once — per-tile font sets are expensive
      ctx.textAlign = 'center';
      const warn = game.phase === 'playing' && game.sub === 'raise' && sim.turnsUntilRise === 1;
      for (let o = 0; o < N; o++) {
        const i = ORDER[o];
        const x = i % SIZE;
        const y = (i / SIZE) | 0;
        const bx = BX[i];
        const by = BY[i];
        const hh = heights[i];
        const ty = by - hh * TZ;
        // baked sprite: textured top + cliff faces + grid stroke in one blit
        ctx.drawImage(SPR[hh][VARI[i]], bx - HW - PAD, ty - HH - PAD);
        // freshly-raised confirmation glow
        const ft = animT - flashT[i];
        if (ft >= 0 && ft < 0.45) {
          ctx.globalAlpha = (1 - ft / 0.45) * 0.3;
          ctx.fillStyle = GLOW;
          diamond(bx, ty);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // water over flooded tiles
        if (hh <= wl) {
          const wy = by - (wl + 0.42) * TZ;
          ctx.globalAlpha = 0.66 + 0.07 * Math.sin(animT * 1.4 + x * 0.9 + y * 0.7);
          ctx.fillStyle = WATER_FILL;
          diamond(bx, wy);
          ctx.fill();
          // drifting moon-sparkle on the same path
          ctx.globalAlpha = 0.11 + 0.05 * Math.sin(animT * 1.1 + x * 1.3 - y * 0.8);
          ctx.fillStyle = waterPat;
          ctx.fill();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = WATER_LINE;
          ctx.stroke();
          ctx.globalAlpha = 1;
          // water side curtain so deep edges read as sea, not floating glass
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = WATER_FILL;
          ctx.beginPath();
          ctx.moveTo(bx - HW, wy);
          ctx.lineTo(bx, wy + HH);
          ctx.lineTo(bx + HW, wy);
          ctx.lineTo(bx + HW, by);
          ctx.lineTo(bx, by + HH);
          ctx.lineTo(bx - HW, by);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          // foam lapping where the water meets dry land (slightly inset so
          // the neighbour's cliff, drawn later, doesn't swallow the line)
          const fE = dryAt(x + 1, y, wl);
          const fS = dryAt(x, y + 1, wl);
          const fW = dryAt(x - 1, y, wl);
          const fN = dryAt(x, y - 1, wl);
          if (fE || fS || fW || fN) {
            ctx.strokeStyle = FOAM;
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.14 + 0.09 * Math.sin(animT * 1.9 + x + y * 1.4);
            ctx.beginPath();
            if (fE) {
              ctx.moveTo(bx + HW * 0.92, wy);
              ctx.lineTo(bx, wy + HH * 0.92);
            }
            if (fS) {
              ctx.moveTo(bx, wy + HH * 0.92);
              ctx.lineTo(bx - HW * 0.92, wy);
            }
            if (fW) {
              ctx.moveTo(bx - HW * 0.92, wy);
              ctx.lineTo(bx, wy - HH * 0.92);
            }
            if (fN) {
              ctx.moveTo(bx, wy - HH * 0.92);
              ctx.lineTo(bx + HW * 0.92, wy);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
          }
        } else if (hh > 0) {
          // height digit, very faint — puzzle readability
          ctx.fillStyle = DIGIT_COLOR;
          ctx.fillText(DIGITS[hh], bx, ty + 2.6);
          // flood telegraph: this tile goes under when Caicai rises this turn
          if (warn && hh === sim.water + 1) {
            ctx.strokeStyle = BAD;
            ctx.globalAlpha = 0.25 + 0.2 * Math.sin(animT * 4);
            diamond(bx, ty);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // hover preview (raise phase only)
      if (hover.i >= 0 && game.phase === 'playing' && game.sub === 'raise') {
        const i = hover.i;
        const bx = BX[i];
        const by = BY[i];
        const hh = heights[i];
        const ty = by - hh * TZ;
        const ok = !hover.why;
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = ok ? GLOW : BAD;
        ctx.globalAlpha = 0.85;
        diamond(bx, ty);
        ctx.stroke();
        if (ok) {
          // ghost of the raised tile
          const gy = by - (hh + 1) * TZ;
          ctx.globalAlpha = 0.38 + 0.12 * Math.sin(animT * 5);
          ctx.fillStyle = GLOW;
          diamond(bx, gy);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = GLOW;
          ctx.font = '10px Georgia';
          ctx.textAlign = 'center';
          ctx.fillText(PREVIEW[hh], bx, gy - HH - 4);
        } else {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = BAD;
          ctx.font = '10px Georgia';
          ctx.textAlign = 'center';
          ctx.fillText('✕', bx, ty - HH - 4);
        }
        ctx.globalAlpha = 1;
      }

      // Tenten's beacon
      {
        const bI = idx(sim.beaconX, sim.beaconY);
        const bx = BX[bI];
        const ty = BY[bI] - sim.heights[bI] * TZ;
        const pulse = 0.5 + 0.5 * Math.sin(animT * 2.2);
        // pool of light where the pillar meets the land — anchors the eye
        ctx.globalAlpha = 0.16 + pulse * 0.08;
        ctx.drawImage(headGlow, bx - 26, ty - 13, 52, 26);
        // light pillar
        ctx.globalAlpha = 0.12 + pulse * 0.09;
        ctx.fillStyle = GLOW;
        ctx.fillRect(bx - 5, ty - 92, 10, 88);
        ctx.globalAlpha = 1;
        // pole
        ctx.strokeStyle = '#cfc4a4';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx, ty - 30);
        ctx.stroke();
        // star
        ctx.strokeStyle = GLOW;
        ctx.lineWidth = 1.2;
        const r = 5 + pulse * 1.6;
        ctx.beginPath();
        ctx.moveTo(bx - r, ty - 30);
        ctx.lineTo(bx + r, ty - 30);
        ctx.moveTo(bx, ty - 30 - r);
        ctx.lineTo(bx, ty - 30 + r);
        ctx.moveTo(bx - r * 0.6, ty - 30 - r * 0.6);
        ctx.lineTo(bx + r * 0.6, ty - 30 + r * 0.6);
        ctx.moveTo(bx + r * 0.6, ty - 30 - r * 0.6);
        ctx.lineTo(bx - r * 0.6, ty - 30 + r * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 0.12 + pulse * 0.1;
        ctx.fillStyle = GLOW;
        ctx.beginPath();
        ctx.arc(bx, ty - 30, 14 + pulse * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // saved souls circling the light
        for (let s = 0; s < sim.saved; s++) {
          const a = animT * 0.9 + (s * Math.PI * 2) / 6;
          const ox = Math.cos(a) * 16;
          const oy = Math.sin(a) * 5;
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(animT * 3 + s);
          ctx.fillStyle = GLOW;
          ctx.fillRect(bx + ox - 1, ty - 46 + oy - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }

      // villagers
      for (let vi = 0; vi < sim.villagers.length; vi++) {
        const v = sim.villagers[vi];
        const off = OFFS[v.id % OFFS.length];
        if (v.saved) continue;
        if (!v.alive) {
          if (v.lostAt >= 0) {
            const t = game.anim - v.lostAt;
            if (t < 1.6) {
              const i = idx(v.x, v.y);
              const py = BY[i] - (sim.water + 0.42) * TZ;
              drawSeal(BX[i] + off[0] * 0.5, py + off[1] * 0.5, t, v.id);
            }
          }
          continue;
        }
        let fx = v.x;
        let fy = v.y;
        let fh = sim.heights[idx(v.x, v.y)];
        if (game.sub === 'march' && (v.tx !== v.fx || v.ty !== v.fy)) {
          fx = v.fx + (v.tx - v.fx) * marchP;
          fy = v.fy + (v.ty - v.fy) * marchP;
          fh = sim.heights[idx(v.fx, v.fy)] * (1 - marchP) + sim.heights[idx(v.tx, v.ty)] * marchP;
        }
        const px = CX + (fx - fy) * HW + off[0];
        const py = CY + (fx + fy - 12) * HH - fh * TZ + off[1] * 0.5;
        const moving = game.sub === 'march' && (v.tx !== v.fx || v.ty !== v.fy);
        const bob = moving ? Math.abs(Math.sin(marchP * Math.PI * 2)) * 2.2 : (0.5 + 0.5 * Math.sin(animT * 2.4 + v.id * 1.7)) * 0.8;
        // lean into the screen-space walk direction; shuffle feet mid-step
        const lean = moving ? ((v.tx - v.fx) - (v.ty - v.fy)) * 0.55 : 0;
        drawVillagerFigure(px, py, bob, 1, v.id, moving ? marchP : -1, lean);
      }

      // particles
      for (let i = 0; i < PN; i++) {
        const p = parts[i];
        if (!p.on) continue;
        const a = p.life / p.max;
        ctx.globalAlpha = a * (p.kind === 2 ? 0.95 : 0.8);
        ctx.fillStyle = p.kind === 0 ? '#7a6f54' : p.kind === 1 ? '#7fd4cf' : GLOW;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Caicai in front (lower arc)
      drawSerpent(game, false);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSerpent(game, behind) {
    const sim = game.sim;
    const urgent = sim && !sim.over && sim.turnsUntilRise === 1;
    const rising = game.sub === 'flood' && game.floodRising;
    const rx = 372 - (urgent ? 14 : 0) - (rising ? 26 : 0);
    const ry = 252 - (urgent ? 10 : 0) - (rising ? 18 : 0);
    const cy = CY + 8;
    for (let i = SEGS - 1; i >= 0; i--) {
      const a = headA - i * 0.026;
      const wob = Math.sin(a * 7 + animT * 1.8) * 7;
      const ex = CX + Math.cos(a) * (rx + wob);
      const ey = cy + Math.sin(a) * (ry + wob * 0.6);
      const isBehind = ey < cy;
      if (isBehind !== behind) continue;
      const r = i === 0 ? 9 : 8 - (i / SEGS) * 5.5;
      const segA = (urgent || rising ? 0.75 + 0.25 * Math.sin(animT * 7) : 0.62) * (1 - i / (SEGS * 1.6));
      ctx.globalAlpha = segA;
      // sphere-shaded, scale-combed segment (one scaled blit)
      ctx.drawImage(SEG_SPR[i % 4 === 2 ? 1 : 0], ex - r, ey - r, r * 2, r * 2);
      // dorsal crest: a small spectral fin on every third segment
      if (i % 3 === 1 && i < SEGS - 4) {
        let nx = ex - CX;
        let ny = ey - cy;
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= nl;
        ny /= nl;
        ctx.globalAlpha = segA * 0.55;
        ctx.fillStyle = '#1d4a4a';
        ctx.beginPath();
        ctx.moveTo(ex + nx * (r - 1) - ny * 2.4, ey + ny * (r - 1) + nx * 2.4);
        ctx.lineTo(ex + nx * (r + 5), ey + ny * (r + 5));
        ctx.lineTo(ex + nx * (r - 1) + ny * 2.4, ey + ny * (r - 1) - nx * 2.4);
        ctx.closePath();
        ctx.fill();
        // moonlight catches the fin's leading edge
        ctx.strokeStyle = 'rgba(159, 255, 208, 0.22)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(ex + nx * (r - 1) - ny * 2.4, ey + ny * (r - 1) + nx * 2.4);
        ctx.lineTo(ex + nx * (r + 5), ey + ny * (r + 5));
        ctx.stroke();
      }
      if (i === 0) {
        // spectral halo under the skull
        ctx.globalAlpha = urgent || rising ? 0.42 + 0.16 * Math.sin(animT * 7) : 0.2;
        ctx.drawImage(headGlow, ex - 32, ey - 32);
        // skull, rotated to the direction of travel (path tangent)
        const ang = Math.atan2(Math.cos(a) * (ry + wob * 0.6), -Math.sin(a) * (rx + wob));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.globalAlpha = Math.min(1, segA + 0.3);
        ctx.drawImage(headSpr, -13, -10, 32, 20);
        // live eyes in the baked pits — they pulse with the tide warning
        ctx.fillStyle = urgent || rising ? '#d8fff0' : GLOW;
        ctx.fillRect(6.3, -4.2, 2.4, 2.4);
        ctx.fillRect(6.3, 1.8, 2.4, 2.4);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  resize();
  return {
    resize,
    pick,
    setLevel,
    onHeightChanged,
    update,
    draw,
    dust,
    splash,
    sparkle,
    shake,
    surge,
  };
}
