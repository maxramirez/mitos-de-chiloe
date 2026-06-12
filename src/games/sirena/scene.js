// ============================================================
// LA SIRENA · El canto — scene.js
// All canvas2d painting: layout, prerendered background (sky,
// moon, sea, shore), the siren on her rock, five mother-of-pearl
// shells, soul lanterns, ripples / sparks / churn / shake, HUD.
// Surfaces are textured procedurally: a small kit of noise /
// strata / wave-streak canvases is generated once at boot and
// baked into the prerendered background and rock sprite on
// resize — the frame loop never generates a texture.
// Cosmetic timers only — game logic lives in main.js.
// scene.update(dt) never touches game state, so it is safe to
// call in any phase. No allocations in update()/render(): pools,
// prerendered sprites and cached strings/gradients only.
// ============================================================

const TAU = Math.PI * 2;
const GLOW = '#9fffd0';
// per-shell glyph + key label: colorblind-safe redundancy for every cue
const GLYPHS = ['✦', '●', '≈', '▲', '◆'];
const LABELS = ['1 · re', '2 · fa', '3 · sol', '4 · la', '5 · do'];
const TINTS = ['#8a6f74', '#6f8a73', '#6f7d8a', '#7d6f8a', '#8a836f'];
// rock silhouette (normalized)
const ROCK = [-1, 0.16, -0.8, -0.1, -0.52, -0.3, -0.2, -0.43, 0.12, -0.4,
  0.45, -0.26, 0.75, -0.1, 1, 0.12, 0.8, 0.3, -0.82, 0.32];
// arrived-lantern offsets around the ship (xU pairs)
const LANT = [-30, -10, 16, -6, -10, -18, 28, -16, -44, -2, 4, 2];

function makeGlowSprite(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.85)');
  gr.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.28)');
  gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return c;
}

// ---------------- procedural texture kit (boot only) ----------------
// Small canvases generated once and reused by every background repaint.
// Nothing here runs in the frame loop.

// soft blotchy value noise: coarse random gray scaled up smooth, two octaves
function makeNoise(size, cells, contrast) {
  const small = document.createElement('canvas');
  small.width = small.height = cells;
  const sx = small.getContext('2d');
  const img = sx.createImageData(cells, cells);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (128 + (Math.random() - 0.5) * contrast) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  sx.putImageData(img, 0, 0);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.drawImage(small, 0, 0, size, size);
  x.globalAlpha = 0.5;
  const half = size / 2;
  x.drawImage(small, 0, 0, half, half);
  x.drawImage(small, half, 0, half, half);
  x.drawImage(small, 0, half, half, half);
  x.drawImage(small, half, half, half, half);
  x.globalAlpha = 1;
  return c;
}

// transparent strata + grime speckle, for wet stone surfaces
function makeStrata(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * size;
    const pale = Math.random() > 0.62;
    x.strokeStyle = pale ? 'rgba(196,214,206,0.06)' : 'rgba(0,0,0,0.16)';
    x.lineWidth = 0.5 + Math.random() * 1.8;
    const x0 = Math.random() * size * 0.5;
    x.beginPath();
    x.moveTo(x0, y);
    x.lineTo(x0 + size * (0.25 + Math.random() * 0.55), y + (Math.random() - 0.5) * size * 0.16);
    x.stroke();
  }
  for (let i = 0; i < 340; i++) {
    x.fillStyle = Math.random() > 0.74 ? 'rgba(200,216,208,0.07)' : 'rgba(0,0,0,0.12)';
    const s = 0.5 + Math.random() * 1.4;
    x.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  return c;
}

// horizontally-tiling water streaks: small tired waves, pale crests + dark troughs
function makeStreaks(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.lineCap = 'round';
  for (let i = 0; i < 230; i++) {
    const y = Math.random() * h;
    const len = 10 + Math.random() * 85;
    const px = Math.random() * w;
    const pale = Math.random() > 0.62;
    x.strokeStyle = pale
      ? 'rgba(168,200,190,' + (0.05 + Math.random() * 0.09).toFixed(3) + ')'
      : 'rgba(4,10,14,' + (0.07 + Math.random() * 0.12).toFixed(3) + ')';
    x.lineWidth = 0.7 + Math.random() * 1.5;
    const dy = (Math.random() - 0.5) * 3;
    for (let k = -1; k <= 1; k++) {
      x.beginPath();
      x.moveTo(px - len / 2 + k * w, y);
      x.quadraticCurveTo(px + k * w, y + dy, px + len / 2 + k * w, y);
      x.stroke();
    }
  }
  return c;
}

const NACRE = ['rgba(159,255,208,0.09)', 'rgba(189,170,217,0.10)', 'rgba(232,214,168,0.10)'];

export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const glowG = makeGlowSprite(159, 255, 208); // spectral
  const glowW = makeGlowSprite(232, 214, 168); // lantern warm
  // texture kit — generated once, reused by every repaint
  const noiseTex = makeNoise(256, 26, 130);
  const strataTex = makeStrata(256);
  const streakTex = makeStreaks(512, 256);
  const rockSpr = document.createElement('canvas'); // prerendered rock, repainted on resize
  let rockOx = 0, rockOy = 0, rockSw = 0, rockSh = 0;

  let W = 0, H = 0, dpr = 1, U = 1;
  let horizon = 0, moonX = 0, moonY = 0, moonR = 0;
  let rockX = 0, rockY = 0, rockW = 0, seatX = 0, seatY = 0, su = 1;
  let shipX = 0, shipY = 0;
  let glyphFont = '20px Georgia', bigGlyphFont = '30px Georgia';
  const HUD_FONT = '12px Georgia';
  const LABEL_FONT = '11px Georgia';
  const PROMPT_FONT = 'italic 15px Georgia';

  const shells = [];
  for (let i = 0; i < 5; i++) shells.push({ x: 0, y: 0, r: 0, rot: 0, grad: null });
  const shimmer = new Float32Array(5);
  const deny = new Float32Array(5); // dim pulse when a press is refused
  const dying = new Float32Array(3); // per-candle gutter timers
  const waitPts = new Float32Array(12); // 6 shore lantern spots

  // pools
  const NR = 14;
  const ripples = [];
  for (let i = 0; i < NR; i++) ripples.push({ x: 0, y: 0, w: 0, t: 0, dur: 1, on: false });
  let ri = 0;
  const NS = 48;
  const sparks = [];
  for (let i = 0; i < NS; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, t: 0, on: false });
  let si = 0;

  const NSTAR = 110;
  const stars = new Float32Array(NSTAR * 4);
  for (let i = 0; i < NSTAR; i++) {
    stars[i * 4] = Math.random();
    stars[i * 4 + 1] = Math.random() * 0.92;
    stars[i * 4 + 2] = 0.6 + Math.random() * 1.2;
    stars[i * 4 + 3] = Math.random() * TAU;
  }
  const NGL = 22;
  const glints = new Float32Array(NGL * 2);
  for (let i = 0; i < NGL; i++) {
    glints[i * 2] = Math.random() * TAU;
    glints[i * 2 + 1] = 0.5 + Math.random() * 0.8;
  }
  // stray crests catching the moon far from her column (x frac, y frac, phase, speed)
  // x kept off the left shore so nothing glints on the headland
  const NGW = 16;
  const wglints = new Float32Array(NGW * 4);
  for (let i = 0; i < NGW; i++) {
    wglints[i * 4] = 0.3 + Math.random() * 0.68;
    wglints[i * 4 + 1] = 0.08 + Math.random() * 0.8;
    wglints[i * 4 + 2] = Math.random() * TAU;
    wglints[i * 4 + 3] = 0.25 + Math.random() * 0.6;
  }
  const churnPh = new Float32Array(8);
  for (let i = 0; i < 8; i++) churnPh[i] = Math.random() * TAU;

  let t = 0, shake = 0, churn = 0, glyphA = 0, lastGlyph = 0, singGlow = 0;
  let turn = 0, turnTarget = 0;
  // siren shading — gradients cached in seat-local space, rebuilt on resize
  // (drawSiren allocates nothing; these are the only gradients it touches)
  let tailGrad = null, bodyGrad = null, hairGrad = null;

  // ---------------- layout ----------------

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    U = H / 700;
    horizon = H * 0.40;
    moonX = W * 0.22;
    moonY = H * 0.15;
    moonR = Math.min(W, H) * 0.045;
    rockX = W * 0.38;
    rockY = H * 0.555;
    rockW = H * 0.235; // a little more stone under her
    seatX = rockX - rockW * 0.06;
    seatY = rockY - rockW * 0.21;
    su = rockW * 0.0088; // she reads at gameplay distance now
    shipX = W * 0.80;
    shipY = horizon - 2 * U;
    const sr = Math.min(W * 0.07, H * 0.075);
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      const s = shells[i];
      s.x = W * (0.5 + k * 0.16);
      s.y = H * (0.83 + 0.018 * k * k);
      s.r = sr;
      s.rot = k * 0.10;
      s.grad = makeShellGrad(sr, TINTS[i]);
    }
    for (let i = 0; i < 6; i++) {
      waitPts[i * 2] = W * (0.035 + 0.031 * i);
      waitPts[i * 2 + 1] = H * (0.525 + 0.027 * i) - 6 * U;
    }
    glyphFont = Math.round(sr * 0.5) + 'px Georgia';
    bigGlyphFont = Math.round(su * 16) + 'px Georgia';
    // her shading, lit from the moon side (upper left in seat space)
    tailGrad = ctx.createLinearGradient(-12 * su, -6 * su, 70 * su, 34 * su);
    tailGrad.addColorStop(0, '#0e1b21');
    tailGrad.addColorStop(0.4, '#060d12');
    tailGrad.addColorStop(1, '#02050a');
    bodyGrad = ctx.createLinearGradient(-16 * su, -46 * su, 10 * su, 6 * su);
    bodyGrad.addColorStop(0, '#13222a');
    bodyGrad.addColorStop(0.45, '#070e13');
    bodyGrad.addColorStop(1, '#02050a');
    hairGrad = ctx.createLinearGradient(-20 * su, -46 * su, -6 * su, 4 * su);
    hairGrad.addColorStop(0, '#0b151b');
    hairGrad.addColorStop(1, '#010409');
    paintRock();
    paintBg();
  }

  function makeShellGrad(r, tint) {
    const g = ctx.createRadialGradient(0, -r * 0.15, r * 0.08, 0, -r * 0.05, r * 1.05);
    g.addColorStop(0, 'rgba(222,228,219,0.95)');
    g.addColorStop(0.55, tint);
    g.addColorStop(1, '#1d272b');
    return g;
  }

  function rockPath(q, sx, sy) {
    q.beginPath();
    for (let i = 0; i < ROCK.length; i += 2) {
      const px = ROCK[i] * sx;
      const py = ROCK[i + 1] * sy;
      if (i === 0) q.moveTo(px, py);
      else q.lineTo(px, py);
    }
    q.closePath();
  }

  // prerender the siren's rock once per resize: moonlit base gradient,
  // stone mottle + strata, tide-wet sheen, moon-side rim facets
  function paintRock() {
    const sx = rockW * 0.55;
    const sy = rockW * 0.5;
    rockSw = Math.ceil(sx * 2) + 8;
    rockSh = Math.ceil(sy * 0.75) + 8;
    rockOx = sx + 4;
    rockOy = sy * 0.43 + 4;
    rockSpr.width = Math.max(1, Math.floor(rockSw * dpr));
    rockSpr.height = Math.max(1, Math.floor(rockSh * dpr));
    const r = rockSpr.getContext('2d');
    r.setTransform(dpr, 0, 0, dpr, 0, 0);
    r.translate(rockOx, rockOy);
    rockPath(r, sx, sy);
    let g = r.createLinearGradient(-sx, -sy * 0.4, sx * 0.8, sy * 0.32);
    g.addColorStop(0, '#0e171d');
    g.addColorStop(0.45, '#070d12');
    g.addColorStop(1, '#03060a');
    r.fillStyle = g;
    r.fill();
    r.save();
    r.clip();
    // wet stone mottle, lit from the moon side
    r.globalCompositeOperation = 'screen';
    r.globalAlpha = 0.1;
    r.drawImage(noiseTex, -sx, -sy * 0.5, sx * 2, sy);
    r.globalAlpha = 1;
    r.globalCompositeOperation = 'source-over';
    // strata and barnacle grime
    r.globalAlpha = 0.6;
    r.drawImage(strataTex, -sx, -sy * 0.5, sx * 2, sy);
    r.globalAlpha = 1;
    // form: a moonlit top plane, a lit flank, crevices — the stone gains planes
    r.fillStyle = 'rgba(176,206,190,0.07)';
    r.beginPath();
    r.moveTo(-sx * 0.52, -sy * 0.3);
    r.lineTo(-sx * 0.2, -sy * 0.43);
    r.lineTo(sx * 0.12, -sy * 0.4);
    r.lineTo(sx * 0.45, -sy * 0.26);
    r.lineTo(sx * 0.3, -sy * 0.06);
    r.lineTo(-sx * 0.3, -sy * 0.02);
    r.closePath();
    r.fill();
    r.fillStyle = 'rgba(159,255,208,0.05)';
    r.beginPath();
    r.moveTo(-sx, sy * 0.16);
    r.lineTo(-sx * 0.8, -sy * 0.1);
    r.lineTo(-sx * 0.52, -sy * 0.3);
    r.lineTo(-sx * 0.42, sy * 0.1);
    r.closePath();
    r.fill();
    r.strokeStyle = 'rgba(0,0,0,0.4)';
    r.lineWidth = 1.6;
    r.beginPath();
    r.moveTo(-sx * 0.2, -sy * 0.43);
    r.quadraticCurveTo(-sx * 0.16, -sy * 0.1, -sx * 0.08, sy * 0.24);
    r.moveTo(sx * 0.45, -sy * 0.26);
    r.quadraticCurveTo(sx * 0.42, 0, sx * 0.5, sy * 0.22);
    r.moveTo(-sx * 0.52, -sy * 0.3);
    r.quadraticCurveTo(-sx * 0.5, -sy * 0.05, -sx * 0.42, sy * 0.18);
    r.stroke();
    // the mass shades down toward the waterline
    g = r.createLinearGradient(0, sy * 0.02, 0, sy * 0.32);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    r.fillStyle = g;
    r.fillRect(-sx, sy * 0.02, sx * 2, sy * 0.32);
    // tide-wet sheen near the waterline
    g = r.createLinearGradient(0, 0, 0, sy * 0.34);
    g.addColorStop(0, 'rgba(159,255,208,0)');
    g.addColorStop(1, 'rgba(159,255,208,0.08)');
    r.fillStyle = g;
    r.fillRect(-sx, 0, sx * 2, sy * 0.34);
    r.restore();
    // silhouette edge + moonlit facets on her side
    r.strokeStyle = 'rgba(159,255,208,0.07)';
    r.lineWidth = 1;
    rockPath(r, sx, sy);
    r.stroke();
    r.strokeStyle = 'rgba(196,220,208,0.10)';
    r.beginPath();
    r.moveTo(-sx, sy * 0.16);
    r.lineTo(-sx * 0.8, -sy * 0.1);
    r.lineTo(-sx * 0.52, -sy * 0.3);
    r.lineTo(-sx * 0.2, -sy * 0.43);
    r.stroke();
  }

  function paintBg() {
    bg.width = Math.max(1, Math.floor(W * dpr));
    bg.height = Math.max(1, Math.floor(H * dpr));
    const b = bg.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    function headPath(q) {
      q.moveTo(0, H * 0.50);
      q.bezierCurveTo(W * 0.08, H * 0.53, W * 0.15, H * 0.60, W * 0.21, H * 0.67);
      q.quadraticCurveTo(W * 0.26, H * 0.78, W * 0.28, H);
      q.lineTo(0, H);
    }
    // sky
    let g = b.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#04070c');
    g.addColorStop(0.75, '#0a141b');
    g.addColorStop(1, '#101e26');
    b.fillStyle = g;
    b.fillRect(0, 0, W, horizon + 1);
    // night haze — two octaves of blotch noise breathed over the sky
    b.globalCompositeOperation = 'screen';
    b.globalAlpha = 0.05;
    b.drawImage(noiseTex, 0, 0, W, horizon * 1.04);
    b.globalAlpha = 0.035;
    b.drawImage(noiseTex, -W * 0.35, -horizon * 0.3, W * 1.7, horizon * 1.5);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    // low cloud banks, ink on ink
    b.save();
    b.translate(W * 0.30, horizon * 0.42);
    b.scale(5.2, 1);
    g = b.createRadialGradient(0, 0, 0, 0, 0, horizon * 0.16);
    g.addColorStop(0, 'rgba(6,11,16,0.55)');
    g.addColorStop(1, 'rgba(6,11,16,0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(0, 0, horizon * 0.16, 0, TAU);
    b.fill();
    b.restore();
    b.save();
    b.translate(W * 0.72, horizon * 0.68);
    b.scale(6.5, 1);
    g = b.createRadialGradient(0, 0, 0, 0, 0, horizon * 0.13);
    g.addColorStop(0, 'rgba(8,14,19,0.5)');
    g.addColorStop(1, 'rgba(8,14,19,0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(0, 0, horizon * 0.13, 0, TAU);
    b.fill();
    b.restore();
    // far ridge behind the ship
    b.fillStyle = '#060c11';
    b.beginPath();
    b.moveTo(W * 0.56, horizon + 1);
    b.quadraticCurveTo(W * 0.72, horizon - H * 0.028, W * 0.88, horizon - H * 0.012);
    b.quadraticCurveTo(W * 0.95, horizon - H * 0.005, W, horizon - H * 0.015);
    b.lineTo(W, horizon + 1);
    b.closePath();
    b.fill();
    // moonlight grazing its crest
    b.strokeStyle = 'rgba(159,255,208,0.05)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(W * 0.56, horizon + 0.5);
    b.quadraticCurveTo(W * 0.72, horizon - H * 0.028, W * 0.88, horizon - H * 0.012);
    b.stroke();
    // sea
    g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, '#0c1b22');
    g.addColorStop(0.55, '#04090c');
    g.addColorStop(1, '#020507');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);
    // water of small tired waves — streak texture in perspective bands,
    // scaled up toward the viewer
    b.save();
    b.beginPath();
    b.rect(0, horizon, W, H - horizon);
    b.clip();
    let wy = horizon;
    let ws = 0.45;
    let wrow = 0;
    while (wy < H) {
      const tw = streakTex.width * ws;
      const th = streakTex.height * ws * 0.55;
      b.globalAlpha = Math.min(0.11, 0.05 + ws * 0.025);
      for (let wx = -((wrow * 137) % tw); wx < W; wx += tw) {
        b.drawImage(streakTex, wx, wy, tw, th);
      }
      wy += th * 0.85;
      ws *= 1.55;
      wrow++;
    }
    b.restore();
    b.globalAlpha = 1;
    // horizon breath
    b.fillStyle = 'rgba(159,255,208,0.05)';
    b.fillRect(0, horizon - 1, W, 2);
    // airglow — a spectral breath where sky meets water
    g = b.createLinearGradient(0, horizon - 24, 0, horizon);
    g.addColorStop(0, 'rgba(159,255,208,0)');
    g.addColorStop(1, 'rgba(159,255,208,0.05)');
    b.fillStyle = g;
    b.fillRect(0, horizon - 24, W, 24);
    // moon halo + disc
    g = b.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 5.5);
    g.addColorStop(0, 'rgba(214,226,210,0.20)');
    g.addColorStop(1, 'rgba(214,226,210,0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(moonX, moonY, moonR * 5.5, 0, TAU);
    b.fill();
    b.fillStyle = '#d9e2cf';
    b.beginPath();
    b.arc(moonX, moonY, moonR, 0, TAU);
    b.fill();
    // maria
    b.fillStyle = 'rgba(120,135,125,0.14)';
    b.beginPath();
    b.arc(moonX - moonR * 0.3, moonY - moonR * 0.15, moonR * 0.3, 0, TAU);
    b.arc(moonX + moonR * 0.25, moonY + moonR * 0.3, moonR * 0.2, 0, TAU);
    b.fill();
    b.fillStyle = 'rgba(120,135,125,0.10)';
    b.beginPath();
    b.arc(moonX + moonR * 0.05, moonY - moonR * 0.45, moonR * 0.14, 0, TAU);
    b.arc(moonX - moonR * 0.45, moonY + moonR * 0.32, moonR * 0.17, 0, TAU);
    b.fill();
    // limb shading — the disc becomes a sphere
    g = b.createRadialGradient(
      moonX - moonR * 0.4, moonY - moonR * 0.35, moonR * 0.1, moonX, moonY, moonR * 1.02);
    g.addColorStop(0, 'rgba(248,252,240,0.12)');
    g.addColorStop(0.65, 'rgba(120,135,125,0)');
    g.addColorStop(1, 'rgba(30,46,44,0.30)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(moonX, moonY, moonR, 0, TAU);
    b.fill();
    // moonlight column on the water — soft-edged, fading with distance
    b.save();
    b.beginPath();
    b.rect(0, horizon, W, H - horizon);
    b.clip();
    b.translate(moonX, horizon);
    b.scale(1, 7.5);
    g = b.createRadialGradient(0, 0, 0, 0, 0, moonR * 2.1);
    g.addColorStop(0, 'rgba(214,226,210,0.10)');
    g.addColorStop(0.55, 'rgba(214,226,210,0.04)');
    g.addColorStop(1, 'rgba(214,226,210,0)');
    b.fillStyle = g;
    b.beginPath();
    b.arc(0, 0, moonR * 2.1, 0, TAU);
    b.fill();
    b.restore();
    // shore headland, bottom-left — where the ánimas wait
    b.fillStyle = '#04070a';
    b.beginPath();
    headPath(b);
    b.closePath();
    b.fill();
    b.save();
    b.beginPath();
    headPath(b);
    b.closePath();
    b.clip();
    // stone mottle + strata grime on the slope
    b.globalCompositeOperation = 'screen';
    b.globalAlpha = 0.06;
    b.drawImage(noiseTex, -W * 0.02, H * 0.46, W * 0.34, H * 0.6);
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 0.55;
    b.drawImage(strataTex, 0, H * 0.47, W * 0.32, H * 0.58);
    b.globalAlpha = 1;
    // moon-side wet sheen down the slope
    g = b.createLinearGradient(0, H * 0.5, W * 0.2, H * 0.68);
    g.addColorStop(0, 'rgba(159,255,208,0.05)');
    g.addColorStop(1, 'rgba(159,255,208,0)');
    b.fillStyle = g;
    b.fillRect(0, H * 0.48, W * 0.3, H * 0.55);
    b.restore();
    // ridge light along the crest
    b.strokeStyle = 'rgba(159,255,208,0.05)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(0, H * 0.50);
    b.bezierCurveTo(W * 0.08, H * 0.53, W * 0.15, H * 0.60, W * 0.21, H * 0.67);
    b.stroke();
    // foreground deep
    g = b.createLinearGradient(0, H * 0.86, 0, H);
    g.addColorStop(0, 'rgba(2,4,6,0)');
    g.addColorStop(1, 'rgba(2,4,6,0.55)');
    b.fillStyle = g;
    b.fillRect(0, H * 0.86, W, H * 0.14);
  }

  // ---------------- fx hooks (called by main.js) ----------------

  function spawnRipple(x, y, w, dur) {
    const r = ripples[ri];
    ri = (ri + 1) % NR;
    r.x = x; r.y = y; r.w = w; r.t = 0; r.dur = dur; r.on = true;
  }

  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const s = sparks[si];
      si = (si + 1) % NS;
      const a = Math.random() * TAU;
      const v = (14 + Math.random() * 36) * U;
      s.x = x; s.y = y;
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v - 18 * U;
      s.t = 1;
      s.on = true;
    }
  }

  function drawGlowSpr(spr, cx, cy, r, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(spr, cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ---------------- cosmetic update ----------------

  function update(dt) {
    t += dt;
    for (let i = 0; i < 5; i++) {
      if (shimmer[i] > 0) shimmer[i] = Math.max(0, shimmer[i] - dt * 1.5);
      if (deny[i] > 0) deny[i] = Math.max(0, deny[i] - dt * 2.5);
    }
    for (let i = 0; i < 3; i++) {
      if (dying[i] > 0) dying[i] = Math.max(0, dying[i] - dt);
    }
    singGlow = Math.max(0, singGlow - dt * 1.2);
    glyphA = Math.max(0, glyphA - dt * 0.85);
    churn = Math.max(0, churn - dt * 0.55);
    shake *= Math.exp(-5 * dt);
    if (shake < 0.01) shake = 0;
    turn += (turnTarget - turn) * Math.min(1, dt * 1.5);
    for (let i = 0; i < NR; i++) {
      const r = ripples[i];
      if (!r.on) continue;
      r.t += dt;
      if (r.t >= r.dur) r.on = false;
    }
    for (let i = 0; i < NS; i++) {
      const s = sparks[i];
      if (!s.on) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 50 * U * dt;
      s.t -= dt * 1.4;
      if (s.t <= 0) s.on = false;
    }
  }

  // ---------------- render ----------------

  function render(view) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    if (shake > 0.01) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
    }
    drawStars();
    drawGlint();
    drawShip();
    drawRipples();
    drawRock();
    drawSiren();
    drawChurn();
    drawSouls(view);
    drawShells();
    drawSparks();
    drawSungGlyph();
    drawHud(view);
  }

  function drawStars() {
    ctx.fillStyle = '#dfe2d2';
    for (let i = 0; i < NSTAR; i++) {
      const y = stars[i * 4 + 1] * horizon * 0.95;
      const tw = 0.5 + 0.5 * Math.sin(t * 0.7 + stars[i * 4 + 3]);
      ctx.globalAlpha = 0.15 + 0.45 * tw;
      const s = stars[i * 4 + 2];
      ctx.fillRect(stars[i * 4] * W, y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawGlint() {
    ctx.fillStyle = '#d6e2d2';
    for (let i = 0; i < NGL; i++) {
      const ph = glints[i * 2];
      const sp = glints[i * 2 + 1];
      const y = horizon + 5 + i * 5.2 * U;
      const xo = Math.sin(t * sp + ph) * moonR * (0.35 + i * 0.05);
      const w = moonR * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.8 + ph * 2)));
      ctx.globalAlpha = 0.05 + 0.04 * Math.sin(t * sp * 1.3 + ph);
      ctx.fillRect(moonX + xo - w * 0.5, y, w, 1.5);
    }
    // stray wave-crests catching the moon far from her column
    for (let i = 0; i < NGW; i++) {
      const a = Math.sin(t * wglints[i * 4 + 3] + wglints[i * 4 + 2]);
      if (a <= 0.2) continue;
      const yf = wglints[i * 4 + 1];
      ctx.globalAlpha = (a - 0.2) * 0.055;
      const w = (5 + 14 * yf) * U;
      ctx.fillRect(wglints[i * 4] * W - w * 0.5, horizon + yf * (H - horizon), w, 1.2);
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    const bob = Math.sin(t * 0.5) * 1.5 * U;
    const x = shipX, y = shipY + bob;
    ctx.fillStyle = '#04070a';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(x - 26 * U, y - 4 * U);
    ctx.quadraticCurveTo(x, y + 5 * U, x + 26 * U, y - 5 * U);
    ctx.lineTo(x + 22 * U, y + 2 * U);
    ctx.quadraticCurveTo(x, y + 8 * U, x - 21 * U, y + 2 * U);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 9 * U, y - 30 * U, 1.2 * U, 27 * U);
    ctx.fillRect(x + 7 * U, y - 24 * U, 1.2 * U, 21 * U);
    ctx.fillRect(x - 15 * U, y - 25 * U, 13 * U, 0.9 * U);
    ctx.fillRect(x + 2 * U, y - 19 * U, 11 * U, 0.9 * U);
    ctx.globalAlpha = 1;
    // the ghost light that waits across the water
    const a = 0.5 + 0.22 * Math.sin(t * 1.6) + 0.1 * Math.sin(t * 6.7);
    drawGlowSpr(glowG, x - 8.5 * U, y - 32 * U, 22 * U * (1 + 0.08 * Math.sin(t * 2.3)), a);
    ctx.fillStyle = GLOW;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x - 9.5 * U, y - 33 * U, 2 * U, 2 * U);
    // its reflection, stretched thin on the swell, flickering with the light
    ctx.globalAlpha = a * 0.14;
    ctx.drawImage(glowG, x - 15.5 * U, y + 5 * U, 14 * U, 70 * U);
    ctx.globalAlpha = 1;
  }

  function drawRipples() {
    ctx.strokeStyle = GLOW;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < NR; i++) {
      const r = ripples[i];
      if (!r.on) continue;
      const p = r.t / r.dur;
      ctx.globalAlpha = (1 - p) * 0.4;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, Math.max(1, p * r.w), Math.max(1, p * r.w * 0.3), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawRock() {
    // prerendered: textured stone, wet sheen, moonlit facets (paintRock)
    ctx.drawImage(rockSpr, rockX - rockOx, rockY - rockOy, rockSw, rockSh);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#020405';
    ctx.beginPath();
    ctx.ellipse(rockX, rockY + rockW * 0.24, rockW * 0.62, rockW * 0.12, 0, 0, TAU);
    ctx.fill();
    // the tide breathing against the stone
    ctx.globalAlpha = 0.05 + 0.04 * Math.sin(t * 1.2);
    ctx.fillStyle = '#cfe0d8';
    ctx.fillRect(rockX - rockW * 0.5, rockY + rockW * 0.15, rockW, 1.2);
    ctx.globalAlpha = 1;
  }

  function drawSiren() {
    const u = su;
    const breathe = Math.sin(t * 0.8) * 1.1 * u;
    // comb stroke: crown to shoulder and back, eased so it dwells at the ends
    const cs = 0.5 + 0.5 * Math.sin(t * 1.2);
    const comb = cs * cs * (3 - 2 * cs);
    const fl = Math.sin(t * 0.55) * 3 * u;
    const fin = Math.sin(t * 0.55 + 1.2) * 1.6 * u; // side fin trails the fluke
    const hw = Math.sin(t * 0.9) * 2 * u; // hair mass sway
    const hw2 = Math.sin(t * 0.9 - 0.7) * 2.6 * u; // tips lag like kelp in the tide
    const tn = turn;
    const rimA = 0.15 + singGlow * 0.1; // the moon finds her when she sings
    ctx.save();
    ctx.translate(seatX, seatY);
    // tail — sweeps right along the rock, fluke flicking slowly
    ctx.beginPath();
    ctx.moveTo(-10 * u, 2 * u);
    ctx.bezierCurveTo(6 * u, 9 * u, 30 * u, 4 * u, 44 * u, 13 * u);
    ctx.bezierCurveTo(53 * u, 19 * u, 57 * u, 26 * u, 63 * u, 27 * u + fl);
    ctx.lineTo(73 * u, 18 * u + fl);
    ctx.quadraticCurveTo(70 * u, 27 * u + fl, 77 * u, 33 * u + fl);
    ctx.lineTo(61 * u, 34 * u + fl);
    ctx.bezierCurveTo(47 * u, 32 * u, 28 * u, 20 * u, 12 * u, 15 * u);
    ctx.bezierCurveTo(2 * u, 12 * u, -9 * u, 9 * u, -11 * u, 4 * u);
    ctx.closePath();
    ctx.fillStyle = tailGrad;
    ctx.fill();
    // scale rows + stray moonlit scales, clipped inside the tail
    ctx.save();
    ctx.clip(); // the fill's path is still current
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = NACRE[k % 3];
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 1.3 + k * 1.9); // nacre breathing
      ctx.beginPath();
      ctx.arc((10 + k * 9) * u, (8 + k * 3.4) * u, 4.6 * u, 0.25, Math.PI - 0.45);
      ctx.stroke();
    }
    ctx.fillStyle = '#cfe0d8';
    for (let k = 0; k < 3; k++) {
      const tw = Math.sin(t * 1.7 + k * 2.1);
      if (tw > 0.35) {
        ctx.globalAlpha = (tw - 0.35) * 0.3;
        ctx.fillRect((16 + k * 16) * u, (10 + k * 5.5) * u, 1.4 * u, 1.4 * u);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // small side fin off the tail, on its own beat
    ctx.fillStyle = '#081116';
    ctx.beginPath();
    ctx.moveTo(30 * u, 14 * u);
    ctx.quadraticCurveTo(34 * u, 22 * u + fin, 28 * u, 26 * u + fin);
    ctx.quadraticCurveTo(27 * u, 19 * u, 30 * u, 14 * u);
    ctx.closePath();
    ctx.fill();
    // torso — turns slightly toward you as souls cross
    ctx.beginPath();
    ctx.moveTo(-11 * u, 4 * u);
    ctx.bezierCurveTo(-14 * u, -8 * u, -11 * u, -20 * u, -8 * u + tn * 2 * u, -31 * u + breathe);
    ctx.lineTo(3 * u + tn * 2 * u, -32 * u + breathe);
    ctx.bezierCurveTo(7 * u, -20 * u, 6 * u, -8 * u, 9 * u, 3 * u);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    // head
    const hx = -3 * u + tn * 4 * u;
    const hy = -39 * u + breathe;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 5.6 * u, 6.6 * u, -0.15 + tn * 0.2, 0, TAU);
    ctx.fill();
    // hair — down the back to the rock; mass and tips on separate beats
    ctx.beginPath();
    ctx.moveTo(hx - u, hy - 7 * u);
    ctx.bezierCurveTo(hx - 11 * u, hy - 4 * u, hx - 14 * u + hw, hy + 16 * u, hx - 15 * u + hw2, hy + 36 * u);
    ctx.quadraticCurveTo(hx - 9 * u + hw2, hy + 42 * u, hx - 4 * u, hy + 40 * u);
    ctx.bezierCurveTo(hx - 7 * u, hy + 22 * u, hx - 3 * u, hy + 6 * u, hx + 4 * u, hy - 3 * u);
    ctx.closePath();
    ctx.fillStyle = hairGrad;
    ctx.fill();
    // moonlit edge of the hair mass — the moon rests along her back
    ctx.strokeStyle = 'rgba(200,225,212,0.15)';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.75 + singGlow * 0.4;
    ctx.beginPath();
    ctx.moveTo(hx - u, hy - 7 * u);
    ctx.bezierCurveTo(hx - 11 * u, hy - 4 * u, hx - 14 * u + hw, hy + 16 * u, hx - 15 * u + hw2, hy + 36 * u);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // moonlit strands, freshly combed, trailing the hair mass
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(159,255,208,0.13)';
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const o = k * 1.8 * u;
      ctx.moveTo(hx - 2 * u - o * 0.4, hy - 6 * u + k * u);
      ctx.bezierCurveTo(
        hx - 9 * u - o + hw * 0.5, hy + 6 * u,
        hx - 12 * u - o + hw, hy + 20 * u,
        hx - 11 * u - o + hw2, hy + 34 * u - k * 2 * u);
    }
    ctx.stroke();
    // crown sheen where the moon rests on her hair
    ctx.strokeStyle = 'rgba(200,225,212,0.16)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 5.9 * u, 6.9 * u, -0.15 + tn * 0.2, Math.PI * 0.95, Math.PI * 1.5);
    ctx.stroke();
    // her profile against the moon: brow, nose, lips, chin
    ctx.strokeStyle = 'rgba(214,232,222,0.14)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hx - 5.0 * u, hy - 3.6 * u);
    ctx.quadraticCurveTo(hx - 6.2 * u, hy - 0.8 * u, hx - 5.0 * u, hy + 0.6 * u);
    ctx.quadraticCurveTo(hx - 5.8 * u, hy + 2.2 * u, hx - 4.4 * u, hy + 3.8 * u);
    ctx.stroke();
    // combing arm
    ctx.strokeStyle = '#03060a';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6 * u;
    const ex = 7.5 * u;
    const ey = -36 * u + comb * 4 * u;
    const hdx = hx + 6.5 * u - comb * 3.5 * u;
    const hdy = hy - 9 * u + comb * 13 * u;
    ctx.beginPath();
    ctx.moveTo(u + tn * 2 * u, -29 * u + breathe);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hdx, hdy);
    ctx.stroke();
    // moonlight along the lifted forearm
    ctx.strokeStyle = 'rgba(159,255,208,0.08)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(ex - 0.6 * u, ey - 1.3 * u);
    ctx.lineTo(hdx - 0.6 * u, hdy - 1.3 * u);
    ctx.stroke();
    // comb teeth, faint parchment
    ctx.strokeStyle = 'rgba(232,220,192,0.4)';
    ctx.lineWidth = 0.8 * u;
    ctx.beginPath();
    ctx.moveTo(hdx - 1.5 * u, hdy);
    ctx.lineTo(hdx - 2.5 * u, hdy + 3 * u);
    ctx.moveTo(hdx, hdy + 0.5 * u);
    ctx.lineTo(hdx - u, hdy + 3.5 * u);
    ctx.moveTo(hdx + 1.5 * u, hdy + u);
    ctx.lineTo(hdx + 0.5 * u, hdy + 4 * u);
    ctx.stroke();
    // the section she is combing — strands flex under the teeth as it sweeps
    ctx.strokeStyle = 'rgba(159,255,208,0.10)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      ctx.moveTo(hx + 3 * u + k * 1.4 * u, hy - 5 * u);
      ctx.quadraticCurveTo(
        hdx - 1.5 * u + k * u, hdy + 3.5 * u,
        hx + 4 * u + k * 2 * u, hy + 14 * u);
    }
    ctx.stroke();
    // moon-side rim light — back, then the long line of the tail, then
    // the fluke's edges; all brighten a breath while she sings
    ctx.strokeStyle = GLOW;
    ctx.lineWidth = 1;
    ctx.globalAlpha = rimA;
    ctx.beginPath();
    ctx.moveTo(-12 * u, 2 * u);
    ctx.bezierCurveTo(-15 * u, -9 * u, -12 * u, -20 * u, -9 * u + tn * 2 * u, -31 * u + breathe);
    ctx.stroke();
    ctx.globalAlpha = rimA * 0.55;
    ctx.beginPath();
    ctx.moveTo(-10 * u, 2 * u);
    ctx.bezierCurveTo(6 * u, 9 * u, 30 * u, 4 * u, 44 * u, 13 * u);
    ctx.bezierCurveTo(53 * u, 19 * u, 57 * u, 26 * u, 63 * u, 27 * u + fl);
    ctx.stroke();
    ctx.globalAlpha = rimA * 0.8;
    ctx.beginPath();
    ctx.moveTo(63 * u, 27 * u + fl);
    ctx.lineTo(73 * u, 18 * u + fl);
    ctx.moveTo(70 * u, 27 * u + fl);
    ctx.lineTo(77 * u, 33 * u + fl);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // her song, made visible
    if (singGlow > 0.02) {
      drawGlowSpr(glowG, hx + 2 * u, hy + 2 * u, 11 * u, singGlow * 0.8);
    }
    ctx.restore();
  }

  function drawChurn() {
    if (churn <= 0.01) return;
    const cy = rockY + rockW * 0.28;
    ctx.fillStyle = '#020405';
    ctx.globalAlpha = churn * 0.35;
    ctx.beginPath();
    ctx.ellipse(rockX, cy, rockW * 1.0, rockW * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#cfe0d8';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const rad = rockW * (0.55 + 0.12 * (i & 3)) + Math.sin(t * 5 + churnPh[i]) * 3 * U;
      ctx.globalAlpha = churn * 0.4;
      ctx.beginPath();
      ctx.ellipse(rockX, cy, rad, rad * 0.26, 0, churnPh[i] + t * 0.6, churnPh[i] + t * 0.6 + 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function quadX(e, x0, cx, x1) {
    const m = 1 - e;
    return m * m * x0 + 2 * m * e * cx + e * e * x1;
  }

  function drawSouls(view) {
    const waiting = 6 - view.souls;
    const arrived = view.souls - (view.sub === 'soul' ? 1 : 0);
    // ánimas waiting on your shore — small hooded figures, each holding
    // its farol out toward the water; the shroud sways with the light
    for (let i = 0; i < waiting; i++) {
      const x = waitPts[i * 2];
      const sway = Math.sin(t * 1.1 + i * 1.7) * 1.2 * U;
      const y = waitPts[i * 2 + 1] + sway;
      const fx = x + 4.5 * U; // the figure stands behind its lantern
      const fy = waitPts[i * 2 + 1] + 1.5 * U;
      ctx.fillStyle = '#0a1116';
      ctx.beginPath();
      ctx.moveTo(fx - 3 * U, fy + 6 * U);
      ctx.bezierCurveTo(
        fx - 3.4 * U, fy - 2 * U,
        fx - 2.4 * U + sway * 0.4, fy - 7.5 * U,
        fx + sway * 0.5, fy - 8.5 * U);
      ctx.bezierCurveTo(
        fx + 2.4 * U + sway * 0.4, fy - 7.5 * U,
        fx + 3.4 * U, fy - 2 * U,
        fx + 3 * U, fy + 6 * U);
      ctx.closePath();
      ctx.fill();
      // moonlight down the seaward edge of the shroud
      ctx.strokeStyle = GLOW;
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx - 3 * U, fy + 5.5 * U);
      ctx.quadraticCurveTo(fx - 3.3 * U, fy - 3 * U, fx - 1 * U + sway * 0.5, fy - 8 * U);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawGlowSpr(glowW, x, y, 8 * U, 0.4);
      ctx.fillStyle = '#e9d9a8';
      ctx.fillRect(x - U, y - U, 2 * U, 2 * U);
    }
    ctx.fillStyle = '#e9d9a8';
    // ánimas safe at the Caleuche
    for (let i = 0; i < arrived; i++) {
      const x = shipX + LANT[i * 2] * U;
      const y = shipY + LANT[i * 2 + 1] * U + Math.sin(t * 0.9 + i * 2.1) * 1.5 * U;
      drawGlowSpr(glowW, x, y, 9 * U, 0.5);
      ctx.fillRect(x - U, y - U, 2 * U, 2 * U);
    }
    // one crossing now
    if (view.sub === 'soul') {
      const p = view.soulT;
      const e = p * p * (3 - 2 * p);
      const slot = Math.min(5, waiting);
      const x0 = waitPts[slot * 2];
      const y0 = waitPts[slot * 2 + 1];
      const cx = W * 0.52;
      const cy = horizon + H * 0.05;
      // end at the lantern's destination slot so arrival never teleports
      const di = Math.min(5, Math.max(0, view.souls - 1)) * 2;
      const x1 = shipX + LANT[di] * U;
      const y1 = shipY + LANT[di + 1] * U;
      // brief wake — the water keeps the crossing for a breath, then forgets
      const wIn = Math.min(1, Math.max(0, (e - 0.08) * 6));
      const wOut = e > 0.82 ? (1 - e) / 0.18 : 1;
      const wA = wIn * wOut;
      if (wA > 0.02) {
        ctx.fillStyle = '#e8d6a8';
        for (let k = 1; k <= 5; k++) {
          const ek = e - 0.045 * k;
          if (ek <= 0.02) continue;
          const wx = quadX(ek, x0, cx, x1);
          const wy = quadX(ek, y0, cy, y1);
          const ww = (10 + k * 4) * U;
          ctx.globalAlpha = wA * (0.1 - k * 0.016);
          ctx.fillRect(wx - ww * 0.5, wy + 5 * U, ww, 1.3 * U);
        }
        // its light, stretched thin beneath it on the swell
        const px0 = quadX(e, x0, cx, x1);
        const py0 = quadX(e, y0, cy, y1);
        ctx.globalAlpha = wA * 0.12;
        ctx.drawImage(glowW, px0 - 5 * U, py0 + 4 * U, 10 * U, 30 * U);
        ctx.globalAlpha = 1;
      }
      // trail
      for (let k = 3; k >= 1; k--) {
        const ek = Math.max(0, e - 0.05 * k);
        drawGlowSpr(glowW, quadX(ek, x0, cx, x1), quadX(ek, y0, cy, y1), 7 * U, 0.10 * (4 - k));
      }
      const px = quadX(e, x0, cx, x1);
      const py = quadX(e, y0, cy, y1);
      drawGlowSpr(glowW, px, py, 14 * U, 0.75);
      ctx.fillStyle = '#f0e2b6';
      ctx.fillRect(px - 1.4 * U, py - 2 * U, 2.8 * U, 4 * U);
    }
  }

  function drawShells() {
    for (let i = 0; i < 5; i++) {
      const s = shells[i];
      const sh = shimmer[i];
      const r = s.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (sh > 0.01) {
        drawGlowSpr(glowG, 0, -r * 0.2, r * 2.0, sh * 0.7);
        ctx.strokeStyle = GLOW;
        ctx.globalAlpha = sh * 0.7;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r * (1.05 + (1 - sh) * 0.8), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const dn = deny[i];
      if (dn > 0.01) {
        // refused press — a dim grey ring, no spectral glow, no sparks
        ctx.strokeStyle = 'rgba(154,145,124,0.6)';
        ctx.globalAlpha = dn * 0.5;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r * (1.0 + (1 - dn) * 0.35), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.rotate(s.rot);
      // press / sing bop — a breath of scale that eases back with the shimmer
      const pop = 1 + sh * 0.05 - dn * 0.03;
      ctx.scale(pop, pop);
      // mother-of-pearl fan
      ctx.beginPath();
      ctx.moveTo(0, r * 0.55);
      ctx.quadraticCurveTo(-r * 0.95, r * 0.35, -r * 0.8, -r * 0.22);
      ctx.quadraticCurveTo(-r * 0.45, -r * 0.8, 0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.45, -r * 0.8, r * 0.8, -r * 0.22);
      ctx.quadraticCurveTo(r * 0.95, r * 0.35, 0, r * 0.55);
      ctx.closePath();
      ctx.fillStyle = s.grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,220,192,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // ribs
      ctx.strokeStyle = 'rgba(6,9,12,0.45)';
      ctx.beginPath();
      for (let k = -3; k <= 3; k++) {
        const a = k * 0.33;
        ctx.moveTo(0, r * 0.5);
        ctx.lineTo(Math.sin(a) * r * 0.8, r * 0.5 - Math.cos(a) * r * 1.35);
      }
      ctx.stroke();
      // nacre sheen — faint iridescent bands swept across the fan
      ctx.lineWidth = r * 0.085;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = NACRE[k];
        ctx.beginPath();
        ctx.arc(0, r * 0.5, r * (0.52 + k * 0.24), -Math.PI / 2 - 0.72, -Math.PI / 2 + 0.72);
        ctx.stroke();
      }
      // moonlight catching the lip
      ctx.fillStyle = 'rgba(226,236,228,0.13)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.16, r * 0.07, 0.5, 0, TAU);
      ctx.fill();
      // glyph — lights up with the note (works with sound off)
      ctx.fillStyle = sh > 0.05 ? GLOW : 'rgba(10,15,18,0.8)';
      ctx.font = glyphFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GLYPHS[i], 0, -r * 0.18);
      ctx.restore();
      // key + note label
      ctx.fillStyle = 'rgba(232,220,192,0.5)';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LABELS[i], s.x, s.y + r * 0.85);
    }
  }

  function drawSparks() {
    ctx.fillStyle = GLOW;
    for (let i = 0; i < NS; i++) {
      const s = sparks[i];
      if (!s.on) continue;
      ctx.globalAlpha = Math.max(0, s.t) * 0.8;
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // the glyph of the note she just sang, floating over her — a second
  // colorblind-safe channel for the sequence
  function drawSungGlyph() {
    if (glyphA <= 0.02) return;
    const x = seatX;
    const y = seatY - su * 55;
    drawGlowSpr(glowG, x, y, su * 16, glyphA * 0.5);
    ctx.font = bigGlyphFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GLOW;
    ctx.globalAlpha = glyphA;
    ctx.fillText(GLYPHS[lastGlyph], x, y);
    ctx.globalAlpha = 1;
  }

  function drawCandle(x, y, lit, idx) {
    ctx.fillStyle = '#2c3a3a';
    ctx.fillRect(x - 1.5, y, 3, 11);
    if (lit) {
      drawGlowSpr(glowW, x, y - 4, 9, 0.55);
      ctx.fillStyle = '#efe0ae';
      ctx.beginPath();
      ctx.ellipse(x, y - 4, 2, 3.6, 0, 0, TAU);
      ctx.fill();
    } else if (dying[idx] > 0.01) {
      // guttering — the flame flickers down before the smoke takes over
      const p = dying[idx] / 0.7;
      const a = p * (0.4 + 0.6 * Math.abs(Math.sin(t * 22)));
      drawGlowSpr(glowW, x, y - 4, 9 * p, 0.55 * a);
      ctx.fillStyle = '#efe0ae';
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(x, y - 4, 2 * (0.4 + 0.6 * p), 3.6 * (0.3 + 0.7 * p), 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(154,145,124,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 2);
      ctx.quadraticCurveTo(x + 2, y - 6, x, y - 9);
      ctx.stroke();
    }
  }

  function drawHud(view) {
    if (!view.playing) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = HUD_FONT;
    ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(232,220,192,0.68)';
    if (W >= 640) {
      ctx.fillText(view.roundLabel, W * 0.5 - 130, 30);
      ctx.fillText(view.soulsLabel, W * 0.5 + 130, 30);
    } else {
      ctx.fillText(view.roundLabel, W * 0.5, 24);
      ctx.fillText(view.soulsLabel, W * 0.5, 44);
    }
    // three candles — your remaining mistakes
    for (let i = 0; i < 3; i++) drawCandle(W - 36 - i * 30, 26, i < 3 - view.mistakes, i);
    ctx.letterSpacing = '0px';
    ctx.font = PROMPT_FONT;
    ctx.fillStyle = 'rgba(159,255,208,0.8)';
    ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t * 2.2);
    ctx.fillText(view.prompt, W * 0.5, H * 0.715);
    ctx.globalAlpha = 1;
  }

  // ---------------- public api ----------------

  resize();

  return {
    resize,
    update,
    render,
    // hit-test a pointer position against the five shells — nearest match,
    // so overlapping generous hit circles on narrow viewports can't steal taps
    shellIndexAt(x, y) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < 5; i++) {
        const s = shells[i];
        const dx = x - s.x;
        const dy = y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < s.r * s.r * 1.96 && d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      return best;
    },
    // she sings note i: shell shimmers, glyph floats, ripples spread
    sirenSing(i) {
      shimmer[i] = 1;
      lastGlyph = i;
      glyphA = 1;
      singGlow = 1;
      spawnRipple(rockX, rockY + rockW * 0.28, rockW * 1.5, 2.2);
    },
    // the player strikes shell i
    pulseShell(i) {
      shimmer[i] = 1;
      burst(shells[i].x, shells[i].y - shells[i].r * 0.2, 7);
    },
    // a wrong note — the water churns
    churnWater() {
      churn = 1;
      shake = Math.max(shake, 5);
      spawnRipple(rockX, rockY + rockW * 0.28, rockW * 2.2, 1.4);
      spawnRipple(rockX, rockY + rockW * 0.28, rockW * 1.6, 1.0);
    },
    // a soul sets out: small flare at its shore spot
    soulLaunch(soulsAfter) {
      const slot = Math.min(5, Math.max(0, 6 - soulsAfter));
      burst(waitPts[slot * 2], waitPts[slot * 2 + 1], 6);
    },
    // a soul lands at the Caleuche: flare at its lantern slot
    soulArrive(soulsNow) {
      const di = Math.min(5, Math.max(0, soulsNow - 1)) * 2;
      burst(shipX + LANT[di] * U, shipY + LANT[di + 1] * U, 6);
    },
    // a press while it is not the player's turn — dim grey pulse, no glow
    denyShell(i) {
      if (i >= 0 && i < 5) deny[i] = 1;
    },
    // candle idx gutters out over ~0.7 s instead of snapping to smoke
    snuffCandle(idx) {
      if (idx >= 0 && idx < 3) dying[idx] = 0.7;
    },
    setTurn(v) {
      turnTarget = v;
    },
  };
}
