// EL CUCHIVILU — render.js
// All 2D-canvas drawing for the moonlit tidal flats. Allocation-free in
// draw(): gradients are cached on first call, dash arrays and decor tables
// (stones, rubble, sand speckles, water shimmer, mouth stakes) are built once
// at module load from a seeded PRNG so the flats look the same every night.

import { TAU, WORLD, CX, CY, R, SEGN, MOUTH_HALF, A0, SEG_W } from './geom.js'

// ---- deterministic decor ----------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(771230)

// stones along each standing wall segment
const STONES = []
for (let i = 0; i < SEGN; i++) {
  const arr = []
  for (let k = 0; k < 6; k++) {
    arr.push({
      a: A0 + i * SEG_W + SEG_W * (0.1 + 0.8 * (k / 5)) + (rnd() - 0.5) * 0.018,
      r: R + (rnd() - 0.5) * 11,
      s: 5.5 + rnd() * 4,
      c: rnd(),
    })
  }
  STONES.push(arr)
}
// scattered rubble where a segment has been broken
const RUBBLE = []
for (let i = 0; i < SEGN; i++) {
  const arr = []
  for (let k = 0; k < 7; k++) {
    arr.push({
      dx: (rnd() - 0.5) * 52,
      dy: (rnd() - 0.5) * 52,
      s: 2 + rnd() * 3.2,
    })
  }
  RUBBLE.push(arr)
}
// wet-sand speckle
const SPECK = []
for (let i = 0; i < 150; i++) {
  SPECK.push({ x: 20 + rnd() * 960, y: 650 + rnd() * 340, a: 0.06 + rnd() * 0.11, s: 1 + rnd() * 1.6 })
}
// moonlight shimmer slivers on the water
const SHIM = []
for (let i = 0; i < 70; i++) {
  SHIM.push({ x: 30 + rnd() * 940, y: 30 + rnd() * 640, ph: rnd() * TAU, len: 6 + rnd() * 14 })
}
// the stake line (varas) across the corral mouth
const STAKES = []
{
  const aL = -Math.PI / 2 - (MOUTH_HALF - 0.09)
  const aR = -Math.PI / 2 + (MOUTH_HALF - 0.09)
  for (let k = 0; k < 9; k++) {
    const a = aL + ((aR - aL) * k) / 8
    STAKES.push({ x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R })
  }
}

const DASH_FOAM = [16, 10]
const DASH_FOAM2 = [7, 13]
const DASH_NONE = []

// ---- cached gradients -------------------------------------------------------
let G = null
function ensureGradients(ctx) {
  if (G) return
  G = {}
  const water = ctx.createLinearGradient(0, -300, 0, 1000)
  water.addColorStop(0, '#07141c')
  water.addColorStop(0.45, '#0a1c22')
  water.addColorStop(1, '#0f2426')
  G.water = water
  const sand = ctx.createLinearGradient(0, 600, 0, 1020)
  sand.addColorStop(0, '#171310')
  sand.addColorStop(1, '#0d0b08')
  G.sand = sand
  const pool = ctx.createRadialGradient(CX, CY, 20, CX, CY, R - 12)
  pool.addColorStop(0, 'rgba(3,10,14,0.85)')
  pool.addColorStop(0.75, 'rgba(5,14,18,0.45)')
  pool.addColorStop(1, 'rgba(8,18,22,0)')
  G.pool = pool
  const glint = ctx.createRadialGradient(660, 220, 10, 660, 220, 330)
  glint.addColorStop(0, 'rgba(190,225,210,0.07)')
  glint.addColorStop(1, 'rgba(190,225,210,0)')
  G.glint = glint
  const dawn = ctx.createLinearGradient(0, -300, 0, 560)
  dawn.addColorStop(0, 'rgba(255,196,130,0.16)')
  dawn.addColorStop(1, 'rgba(255,196,130,0)')
  G.dawn = dawn
  const lantern = ctx.createRadialGradient(0, 0, 1, 0, 0, 30)
  lantern.addColorStop(0, 'rgba(255,200,122,0.3)')
  lantern.addColorStop(1, 'rgba(255,200,122,0)')
  G.lantern = lantern
}

// ---- pieces -----------------------------------------------------------------
function drawWalls(ctx, S, tVis) {
  const sp = S.serp
  for (let i = 0; i < SEGN; i++) {
    const seg = S.segs[i]
    if (!seg.broken) {
      const stones = STONES[i]
      for (let k = 0; k < stones.length; k++) {
        const st = stones[k]
        const x = CX + Math.cos(st.a) * st.r
        const y = CY + Math.sin(st.a) * st.r
        // moonlit edge, then the stone
        ctx.fillStyle = '#454d51'
        ctx.beginPath()
        ctx.arc(x - 1.1, y - 1.5, st.s, 0, TAU)
        ctx.fill()
        ctx.fillStyle = st.c > 0.5 ? '#262b2e' : '#202527'
        ctx.beginPath()
        ctx.arc(x, y, st.s, 0, TAU)
        ctx.fill()
      }
    } else {
      // rubble in the breach
      const rub = RUBBLE[i]
      ctx.fillStyle = '#181d1f'
      ctx.globalAlpha = 0.9
      for (let k = 0; k < rub.length; k++) {
        const rb = rub[k]
        ctx.beginPath()
        ctx.arc(seg.mx + rb.dx, seg.my + rb.dy, rb.s, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // repair progress creeping along the arc
      if (seg.fix > 0) {
        const a1 = seg.a0 + (seg.a1 - seg.a0) * Math.min(1, seg.fix)
        ctx.strokeStyle = '#9fffd0'
        ctx.lineWidth = 7
        ctx.globalAlpha = 0.14
        ctx.beginPath()
        ctx.arc(CX, CY, R, seg.a0, a1)
        ctx.stroke()
        ctx.lineWidth = 2.5
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        ctx.arc(CX, CY, R, seg.a0, a1)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    // telegraph: the threatened segment smoulders before he hits it
    if ((sp.state === 'telegraph' || sp.state === 'charge') && sp.target === i) {
      ctx.strokeStyle = '#d98a72'
      ctx.lineWidth = 4
      ctx.globalAlpha = 0.24 + 0.18 * Math.sin(tVis * 8)
      ctx.beginPath()
      ctx.arc(CX, CY, R, seg.a0 + 0.015, seg.a1 - 0.015)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
}

function drawStakes(ctx, S, tVis) {
  // submerged at marea alta (fish pass over), sealing the mouth at marea baja
  if (S.mouthOpen) {
    ctx.fillStyle = '#3a3226'
    for (let k = 0; k < STAKES.length; k++) {
      const st = STAKES[k]
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(st.x, st.y, 2, 0, TAU)
      ctx.fill()
      // ripple ring where the water works over the drowned stake
      const rr = (tVis * 9 + k * 4.1) % 13
      ctx.globalAlpha = (1 - rr / 13) * 0.12
      ctx.strokeStyle = '#9fd4c4'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(st.x, st.y, 2.5 + rr, 0, TAU)
      ctx.stroke()
    }
  } else {
    // exposed: a dark fence with a faint connecting line
    ctx.strokeStyle = '#4a4032'
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 1.4
    ctx.setLineDash(DASH_FOAM2)
    ctx.beginPath()
    ctx.arc(CX, CY, R, -Math.PI / 2 - (MOUTH_HALF - 0.09), -Math.PI / 2 + (MOUTH_HALF - 0.09))
    ctx.stroke()
    ctx.setLineDash(DASH_NONE)
    ctx.globalAlpha = 1
    for (let k = 0; k < STAKES.length; k++) {
      const st = STAKES[k]
      ctx.fillStyle = '#241e15'
      ctx.beginPath()
      ctx.arc(st.x + 0.8, st.y + 1, 2.4, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#5a4d38'
      ctx.beginPath()
      ctx.arc(st.x, st.y, 2.1, 0, TAU)
      ctx.fill()
    }
  }
}

function drawFish(ctx, S, tVis) {
  ctx.lineWidth = 2
  const F = S.fish
  for (let i = 0; i < F.length; i++) {
    const f = F[i]
    if (!f.alive) continue
    const sp2 = f.vx * f.vx + f.vy * f.vy
    let dx = 1
    let dy = 0
    if (sp2 > 1) {
      const inv = 1 / Math.sqrt(sp2)
      dx = f.vx * inv
      dy = f.vy * inv
    }
    ctx.globalAlpha = 0.42 + 0.34 * (0.5 + 0.5 * Math.sin(tVis * 3.1 + f.ph))
    ctx.strokeStyle = f.pen ? '#b9e2c8' : '#c6d3d6'
    ctx.beginPath()
    ctx.moveTo(f.x - dx * 3.4, f.y - dy * 3.4)
    ctx.lineTo(f.x + dx * 3.4, f.y + dy * 3.4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawSerpent(ctx, S, tVis) {
  const sp = S.serp
  if (sp.state === 'down') return
  if (sp.state === 'telegraph') {
    const k = sp.t / 2.2
    // widening snout-wake rings in the boiling mud
    ctx.strokeStyle = '#9fd4c4'
    ctx.lineWidth = 1.4
    for (let r = 0; r < 3; r++) {
      const rr = ((tVis * 22 + r * 13) % 40) + 4
      ctx.globalAlpha = (1 - rr / 44) * 0.28 * Math.min(1, k * 2.5)
      ctx.beginPath()
      ctx.arc(sp.ex, sp.ey, rr, 0, TAU)
      ctx.stroke()
    }
    // the snout breaks the surface late in the telegraph
    if (k > 0.55) {
      ctx.globalAlpha = Math.min(1, (k - 0.55) * 2.4)
      ctx.fillStyle = '#b27d70'
      ctx.beginPath()
      ctx.arc(sp.ex, sp.ey, 6, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#2e1815'
      ctx.beginPath()
      ctx.arc(sp.ex - 2, sp.ey - 1, 1.1, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(sp.ex + 2, sp.ey - 1, 1.1, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    return
  }
  const fade = sp.state === 'dive' ? Math.max(0, 1 - sp.t / 1.1) : 1
  const px = -sp.dy
  const py = sp.dx
  // segmented body, tail to head
  ctx.strokeStyle = '#9fffd0'
  ctx.lineWidth = 1
  for (let i = 9; i >= 0; i--) {
    const wob = Math.sin(tVis * 5 + i * 0.9) * 2
    const x = sp.sx[i] + px * wob
    const y = sp.sy[i] + py * wob
    const rr = 12.5 - i * 0.75
    ctx.globalAlpha = fade
    ctx.fillStyle = (i & 1) === 1 ? '#13231d' : '#102019'
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = fade * 0.13
    ctx.stroke()
  }
  // head
  const ga = sp.state === 'feed' ? 1 + 0.08 * Math.sin(sp.t * 8) : 1
  ctx.globalAlpha = fade
  ctx.fillStyle = '#16271f'
  ctx.beginPath()
  ctx.arc(sp.x, sp.y, 15 * ga, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = fade * 0.22
  ctx.strokeStyle = '#9fffd0'
  ctx.lineWidth = 1.2
  ctx.stroke()
  // little tusks
  ctx.globalAlpha = fade * 0.85
  ctx.strokeStyle = '#d8d3c2'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sp.x + sp.dx * 10 - px * 9, sp.y + sp.dy * 10 - py * 9)
  ctx.lineTo(sp.x + sp.dx * 15 - px * 11, sp.y + sp.dy * 15 - py * 11)
  ctx.moveTo(sp.x + sp.dx * 10 + px * 9, sp.y + sp.dy * 10 + py * 9)
  ctx.lineTo(sp.x + sp.dx * 15 + px * 11, sp.y + sp.dy * 15 + py * 11)
  ctx.stroke()
  // pig snout
  const snx = sp.x + sp.dx * 16
  const sny = sp.y + sp.dy * 16
  const ang = Math.atan2(sp.dy, sp.dx)
  ctx.globalAlpha = fade
  ctx.fillStyle = '#b27d70'
  ctx.beginPath()
  ctx.ellipse(snx, sny, 8, 6, ang, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#2e1815'
  ctx.beginPath()
  ctx.arc(snx + sp.dx * 2.5 - px * 2.6, sny + sp.dy * 2.5 - py * 2.6, 1.5, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(snx + sp.dx * 2.5 + px * 2.6, sny + sp.dy * 2.5 + py * 2.6, 1.5, 0, TAU)
  ctx.fill()
  // spectral eyes
  for (let s = -1; s <= 1; s += 2) {
    const ex = sp.x + sp.dx * 5 + px * s * 8
    const ey = sp.y + sp.dy * 5 + py * s * 8
    ctx.fillStyle = '#9fffd0'
    ctx.globalAlpha = fade * 0.3
    ctx.beginPath()
    ctx.arc(ex, ey, 3.6, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = fade
    ctx.beginPath()
    ctx.arc(ex, ey, 1.6, 0, TAU)
    ctx.fill()
  }
  // charge wake
  if (sp.state === 'charge') {
    ctx.strokeStyle = '#9fd4c4'
    ctx.lineWidth = 1.4
    ctx.globalAlpha = fade * 0.2
    ctx.beginPath()
    ctx.moveTo(sp.x, sp.y)
    ctx.lineTo(sp.x - sp.dx * 26 - px * 14, sp.y - sp.dy * 26 - py * 14)
    ctx.moveTo(sp.x, sp.y)
    ctx.lineTo(sp.x - sp.dx * 26 + px * 14, sp.y - sp.dy * 26 + py * 14)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawBoat(ctx, S, tVis) {
  const b = S.boat
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.h)
  // hull
  ctx.fillStyle = '#36291a'
  ctx.strokeStyle = '#120d07'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(20, 0)
  ctx.quadraticCurveTo(10, -8, -10, -6.5)
  ctx.quadraticCurveTo(-17, -5.5, -17, 0)
  ctx.quadraticCurveTo(-17, 5.5, -10, 6.5)
  ctx.quadraticCurveTo(10, 8, 20, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // keel line + bench
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#1d1610'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-14, 0)
  ctx.lineTo(15, 0)
  ctx.moveTo(-2, -5.8)
  ctx.lineTo(-2, 5.8)
  ctx.stroke()
  ctx.globalAlpha = 1
  // oars (stroke speed follows the rowing)
  const ph = S.rowPh
  ctx.strokeStyle = '#4f3d26'
  ctx.lineWidth = 2
  for (let s = -1; s <= 1; s += 2) {
    const tipx = -7 + Math.sin(ph) * 6
    const tipy = s * (15 + Math.cos(ph) * 2)
    ctx.beginPath()
    ctx.moveTo(1, s * 6.5)
    ctx.lineTo(tipx, tipy)
    ctx.stroke()
    ctx.fillStyle = '#4f3d26'
    ctx.beginPath()
    ctx.ellipse(tipx, tipy, 2.6, 1.6, s * 0.5, 0, TAU)
    ctx.fill()
    if (Math.sin(ph) < 0 && b.speed > 40) {
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#cfe2da'
      ctx.beginPath()
      ctx.arc(tipx, tipy, 3.4, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  // bow lantern
  ctx.translate(15, 0)
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tVis * 9)
  ctx.fillStyle = G.lantern
  ctx.beginPath()
  ctx.arc(0, 0, 30, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffd9a0'
  ctx.beginPath()
  ctx.arc(0, 0, 1.8, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawParticles(ctx, S) {
  const P = S.particles
  for (let i = 0; i < P.length; i++) {
    const p = P[i]
    if (!p.alive) continue
    const a = p.life / p.max
    if (p.t === 'foam') {
      ctx.globalAlpha = a * 0.45
      ctx.fillStyle = '#cfe2da'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s, 0, TAU)
      ctx.fill()
    } else if (p.t === 'bubble') {
      ctx.globalAlpha = a * 0.65
      ctx.strokeStyle = '#9fd4c4'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s + (1 - a) * 3, 0, TAU)
      ctx.stroke()
    } else if (p.t === 'debris') {
      ctx.globalAlpha = a * 0.95
      ctx.fillStyle = '#454c50'
      ctx.fillRect(p.x - p.s * 0.5, p.y - p.s * 0.5, p.s, p.s)
    } else if (p.t === 'scale') {
      ctx.globalAlpha = a * 0.9
      ctx.fillStyle = '#dce8ea'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s * (0.4 + 0.6 * a), 0, TAU)
      ctx.fill()
    } else if (p.t === 'stone') {
      ctx.globalAlpha = a * 0.9
      ctx.fillStyle = '#8f8576'
      ctx.fillRect(p.x - p.s * 0.5, p.y - p.s * 0.5, p.s, p.s)
    } else if (p.t === 'glow') {
      ctx.globalAlpha = a * 0.6
      ctx.fillStyle = '#9fffd0'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s, 0, TAU)
      ctx.fill()
    } else {
      // splash
      ctx.globalAlpha = a * 0.55
      ctx.fillStyle = '#bcd8d2'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s, 0, TAU)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawRepairHint(ctx, S, tVis) {
  if (S.phase !== 'playing' || S.repair.near < 0) return
  const seg = S.segs[S.repair.near]
  const pulse = 0.4 + 0.18 * Math.sin(tVis * 4)
  ctx.globalAlpha = pulse
  ctx.strokeStyle = '#e8dcc0'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(seg.mx, seg.my, 11, 0, TAU)
  ctx.stroke()
  ctx.fillStyle = '#e8dcc0'
  ctx.font = '12px Georgia'
  ctx.textAlign = 'center'
  ctx.fillText('E', seg.mx, seg.my + 4)
  if (S.repair.active && seg.fix > 0) {
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = '#9fffd0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(seg.mx, seg.my, 15, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, seg.fix))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ---- the frame --------------------------------------------------------------
export function draw(ctx, view, S, tVis) {
  ensureGradients(ctx)
  const w = view.w
  const h = view.h
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#06090c'
  ctx.fillRect(0, 0, w, h)
  const sh = S.shake
  const shx = sh > 0 ? Math.sin(tVis * 61) * sh * 7 : 0
  const shy = sh > 0 ? Math.cos(tVis * 47) * sh * 5 : 0
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox + shx * view.scale, view.oy + shy * view.scale)

  // wet flats
  ctx.fillStyle = G.sand
  ctx.fillRect(-900, -900, 2800, 2800)
  ctx.fillStyle = '#241d15'
  for (let i = 0; i < SPECK.length; i++) {
    const p = SPECK[i]
    ctx.globalAlpha = p.a
    ctx.fillRect(p.x, p.y, p.s, p.s)
  }
  ctx.globalAlpha = 1

  // the sea, breathing with the tide
  ctx.fillStyle = G.water
  ctx.fillRect(-900, -900, 2800, S.shoreY + 900)
  ctx.fillStyle = G.glint
  ctx.fillRect(-900, -900, 2800, S.shoreY + 900)
  ctx.strokeStyle = '#9fc8bc'
  ctx.lineWidth = 1
  for (let i = 0; i < SHIM.length; i++) {
    const s = SHIM[i]
    if (s.y > S.shoreY - 24) continue
    ctx.globalAlpha = 0.035 + 0.04 * (1 + Math.sin(tVis * 0.8 + s.ph))
    ctx.beginPath()
    ctx.moveTo(s.x - s.len * 0.5, s.y)
    ctx.lineTo(s.x + s.len * 0.5, s.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // tide line foam
  ctx.strokeStyle = '#b8cfc6'
  ctx.lineWidth = 1.6
  ctx.globalAlpha = 0.22
  ctx.setLineDash(DASH_FOAM)
  ctx.lineDashOffset = -((tVis * 22) % 52)
  ctx.beginPath()
  ctx.moveTo(-900, S.shoreY)
  ctx.lineTo(1900, S.shoreY)
  ctx.stroke()
  ctx.globalAlpha = 0.1
  ctx.setLineDash(DASH_FOAM2)
  ctx.lineDashOffset = (tVis * 13) % 40
  ctx.beginPath()
  ctx.moveTo(-900, S.shoreY + 8)
  ctx.lineTo(1900, S.shoreY + 8)
  ctx.stroke()
  ctx.setLineDash(DASH_NONE)
  // wet sheen just below the waterline
  ctx.globalAlpha = 0.07
  ctx.fillStyle = '#3d5a55'
  ctx.fillRect(-900, S.shoreY, 2800, 26)
  ctx.globalAlpha = 1

  // dawn creeping in from the sea
  if (S.dawnK > 0) {
    ctx.globalAlpha = S.dawnK
    ctx.fillStyle = G.dawn
    ctx.fillRect(-900, -900, 2800, S.shoreY + 900)
    ctx.globalAlpha = 1
  }

  // the deep pool the corral keeps
  ctx.fillStyle = G.pool
  ctx.beginPath()
  ctx.arc(CX, CY, R - 10, 0, TAU)
  ctx.fill()

  drawStakes(ctx, S, tVis)
  drawWalls(ctx, S, tVis)
  drawFish(ctx, S, tVis)
  drawSerpent(ctx, S, tVis)
  drawBoat(ctx, S, tVis)
  drawParticles(ctx, S)
  drawRepairHint(ctx, S, tVis)

  // thin double frame around the night
  ctx.strokeStyle = '#e8dcc0'
  ctx.globalAlpha = 0.08
  ctx.lineWidth = 1.4
  ctx.strokeRect(3, 3, WORLD - 6, WORLD - 6)
  ctx.globalAlpha = 0.04
  ctx.strokeRect(11, 11, WORLD - 22, WORLD - 22)
  ctx.globalAlpha = 1
}
