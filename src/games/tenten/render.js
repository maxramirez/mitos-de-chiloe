// ============================================================
// TENTEN Y CAICAI — render.js
// 2D canvas, isometric stacked diamonds. Everything procedural.
// All per-frame work is allocation-free: colors, strings,
// gradients, orders and pools are cached up front.
// ============================================================

import { SIZE, idx } from './sim.js';

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
const DIGIT_COLOR = 'rgba(232, 220, 192, 0.34)';
const WATER_FILL = '#0e2c38';
const WATER_LINE = 'rgba(159, 255, 208, 0.16)';
const GLOW = '#9fffd0';
const BAD = '#c96a5a';
const VILLAGER_INK = '#e0d6c2';

function shade(hex, f) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * f);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * f);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
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
      }
    }
  }

  // --- cached per-tile colors (rebuilt on level load / single raise) ---
  const topC = new Array(N).fill(TOPS[0]);
  const leftC = new Array(N).fill(TOPS[0]);
  const rightC = new Array(N).fill(TOPS[0]);
  const DIGITS = ['0', '1', '2', '3', '4', '5'];
  const PREVIEW = ['0→1', '1→2', '2→3', '3→4', '4→5', '—'];

  let simRef = null;

  function cacheTile(i) {
    const h = simRef ? simRef.heights[i] : 0;
    // tiny deterministic per-tile variation so the land reads as land
    const x = i % SIZE;
    const y = (i / SIZE) | 0;
    const v = 1 + (((x * 7 + y * 13) % 5) - 2) * 0.022;
    const base = TOPS[h < 0 ? 0 : h > 5 ? 5 : h];
    topC[i] = shade(base, v);
    leftC[i] = shade(base, 0.52 * v);
    rightC[i] = shade(base, 0.7 * v);
  }

  function setLevel(sim) {
    simRef = sim;
    for (let i = 0; i < N; i++) cacheTile(i);
    // a restart starts visually clean
    shakeAmp = 0;
    surgeT = 0;
    for (let i = 0; i < PN; i++) parts[i].on = false;
  }

  function onHeightChanged(x, y) {
    cacheTile(idx(x, y));
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

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    offX = (window.innerWidth - VW * scale) / 2;
    offY = (window.innerHeight - VH * scale) / 2;
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

  function drawVillagerFigure(sx, sy, bob, alpha) {
    ctx.globalAlpha = alpha;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1, 4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // cloak
    ctx.fillStyle = VILLAGER_INK;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 11 - bob);
    ctx.lineTo(sx + 3.4, sy - bob * 0.4);
    ctx.lineTo(sx - 3.4, sy - bob * 0.4);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(sx, sy - 12.4 - bob, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSeal(sx, sy, t) {
    // t: 0..1.6 transformation clock
    const sink = Math.min(1, t / 0.5);
    if (sink < 1) drawVillagerFigure(sx, sy + sink * 6, 0, 1 - sink);
    const st = (t - 0.35) / 1.25;
    if (st > 0 && st < 1) {
      ctx.globalAlpha = (1 - st) * 0.9;
      ctx.fillStyle = '#39505a';
      const dx = sx + st * 16;
      const dy = sy + 3 + Math.sin(st * Math.PI) * -5;
      ctx.beginPath();
      ctx.ellipse(dx, dy, 7, 3.1, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx + 6, dy - 2.4, 2.2, 0, Math.PI * 2);
      ctx.fill();
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

  function draw(game, hover) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // night
    ctx.fillStyle = '#06090c';
    ctx.fillRect(0, 0, w, h);
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
        if (hh > 0) {
          // faces
          ctx.fillStyle = leftC[i];
          ctx.beginPath();
          ctx.moveTo(bx - HW, ty);
          ctx.lineTo(bx, ty + HH);
          ctx.lineTo(bx, by + HH);
          ctx.lineTo(bx - HW, by);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = rightC[i];
          ctx.beginPath();
          ctx.moveTo(bx + HW, ty);
          ctx.lineTo(bx, ty + HH);
          ctx.lineTo(bx, by + HH);
          ctx.lineTo(bx + HW, by);
          ctx.closePath();
          ctx.fill();
        }
        // top
        ctx.fillStyle = topC[i];
        diamond(bx, ty);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.stroke();
        // water over flooded tiles
        if (hh <= wl) {
          const wy = by - (wl + 0.42) * TZ;
          ctx.globalAlpha = 0.66 + 0.07 * Math.sin(animT * 1.4 + x * 0.9 + y * 0.7);
          ctx.fillStyle = WATER_FILL;
          diamond(bx, wy);
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
        // light pillar
        ctx.globalAlpha = 0.1 + pulse * 0.08;
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
              drawSeal(BX[i] + off[0] * 0.5, py + off[1] * 0.5, t);
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
        drawVillagerFigure(px, py, bob, 1);
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
      ctx.globalAlpha = (urgent || rising ? 0.75 + 0.25 * Math.sin(animT * 7) : 0.62) * (1 - i / (SEGS * 1.6));
      ctx.fillStyle = i % 4 === 2 ? '#16343b' : '#112730';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) {
        // head: eyes + crest
        ctx.globalAlpha = 1;
        ctx.fillStyle = urgent || rising ? '#d8fff0' : GLOW;
        const la = a + 0.16;
        const lb = a - 0.16;
        ctx.fillRect(CX + Math.cos(la) * (rx + wob) - 1.4, cy + Math.sin(la) * (ry + wob * 0.6) - 1.4, 2.8, 2.8);
        ctx.fillRect(CX + Math.cos(lb) * (rx + wob) - 1.4, cy + Math.sin(lb) * (ry + wob * 0.6) - 1.4, 2.8, 2.8);
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
