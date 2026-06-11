// EL CUCHIVILU — render.js
// All 2D-canvas drawing for the moonlit tidal flats. Allocation-free in
// draw(): gradients are cached on first call, dash arrays, decor tables
// (stones, rubble, sand speckles, water shimmer, mouth stakes) and the
// character sprites (3-frame scaled serpent hide, planked chalupa hull) are
// built once at module load from seeded PRNGs so the flats look the same
// every night. Moonlight is fixed up-left; the bow lantern rims the rower.

import { TAU, WORLD, CX, CY, R, SEGN, MOUTH_HALF, A0, SEG_W, TELE_T } from './geom.js'

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

// ---- procedural textures (built once at boot, cached canvases) ---------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// wet-mud tile: tide-ripple striations (groove + moonlit crest) over fine grain.
// Ripple frequencies are whole multiples of TAU/256 so the tile wraps seamlessly.
const MUD_TILE = (() => {
  const c = makeCanvas(256, 256)
  const g = c.getContext('2d')
  // fine grain
  for (let i = 0; i < 1100; i++) {
    const dark = rnd() > 0.45
    g.fillStyle = dark ? '#050403' : '#2a2218'
    g.globalAlpha = (dark ? 0.2 : 0.13) + rnd() * 0.12
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.6, 1 + rnd() * 1.3)
  }
  // ripple striations
  for (let y = 6; y < 246; y += 8 + rnd() * 8) {
    const amp = 1.2 + rnd() * 2.4
    const ph = rnd() * TAU
    const k = 2 + ((rnd() * 3) | 0) // 2..4 whole waves per tile
    const freq = (TAU * k) / 256
    g.lineWidth = 1.3
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass === 0 ? '#000000' : '#d6c4a0'
      g.globalAlpha = pass === 0 ? 0.13 + rnd() * 0.09 : 0.04 + rnd() * 0.035
      const oy = pass === 0 ? 0 : -1.2
      g.beginPath()
      for (let x = -8; x <= 264; x += 8) {
        const yy = y + oy + Math.sin(x * freq + ph) * amp
        if (x === -8) g.moveTo(x, yy)
        else g.lineTo(x, yy)
      }
      g.stroke()
    }
  }
  g.globalAlpha = 1
  return c
})()

// water tile: moon-grey slivers and ink counter-streaks (drawn twice for wrap)
const WATER_TILE = (() => {
  const c = makeCanvas(256, 256)
  const g = c.getContext('2d')
  g.lineCap = 'round'
  for (let i = 0; i < 64; i++) {
    const x = rnd() * 256
    const y = rnd() * 256
    const len = 14 + rnd() * 56
    const light = rnd() > 0.38
    g.strokeStyle = light ? '#9fc8bc' : '#04141a'
    g.globalAlpha = light ? 0.05 + rnd() * 0.07 : 0.09 + rnd() * 0.1
    g.lineWidth = light ? 1 : 1.6 + rnd() * 1.2
    for (let wrap = 0; wrap < 2; wrap++) {
      const wx = x - wrap * 256
      g.beginPath()
      g.moveTo(wx - len * 0.5, y)
      g.lineTo(wx + len * 0.5, y)
      g.stroke()
    }
  }
  g.fillStyle = '#bcd8d2'
  for (let i = 0; i < 130; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.06
    g.fillRect(rnd() * 256, rnd() * 256, 1, 1)
  }
  g.globalAlpha = 1
  return c
})()

// each standing wall segment pre-rendered: shaded stones with contact shadow,
// moonlit gradient, algae kiss and grain — one drawImage per segment per frame.
const WALL_SPR = []
for (let i = 0; i < SEGN; i++) {
  const stones = STONES[i]
  let minX = 1e9
  let minY = 1e9
  let maxX = -1e9
  let maxY = -1e9
  for (let k = 0; k < stones.length; k++) {
    const st = stones[k]
    const x = CX + Math.cos(st.a) * st.r
    const y = CY + Math.sin(st.a) * st.r
    if (x - st.s - 6 < minX) minX = x - st.s - 6
    if (y - st.s - 6 < minY) minY = y - st.s - 6
    if (x + st.s + 6 > maxX) maxX = x + st.s + 6
    if (y + st.s + 6 > maxY) maxY = y + st.s + 6
  }
  minX = Math.floor(minX)
  minY = Math.floor(minY)
  const c = makeCanvas(Math.ceil(maxX - minX), Math.ceil(maxY - minY))
  const g = c.getContext('2d')
  for (let k = 0; k < stones.length; k++) {
    const st = stones[k]
    const lx = CX + Math.cos(st.a) * st.r - minX
    const ly = CY + Math.sin(st.a) * st.r - minY
    // contact shadow pooling in the wet mud
    g.globalAlpha = 0.5
    g.fillStyle = '#000000'
    g.beginPath()
    g.ellipse(lx + 0.7, ly + st.s * 0.42, st.s * 1.08, st.s * 0.82, 0, 0, TAU)
    g.fill()
    // body, lit from the moon side (up-left)
    g.globalAlpha = 1
    const gr = g.createRadialGradient(lx - st.s * 0.42, ly - st.s * 0.5, st.s * 0.12, lx, ly, st.s * 1.14)
    gr.addColorStop(0, '#4d565b')
    gr.addColorStop(0.45, st.c > 0.5 ? '#262b2e' : '#202527')
    gr.addColorStop(1, '#0f1315')
    g.fillStyle = gr
    g.beginPath()
    g.arc(lx, ly, st.s, 0, TAU)
    g.fill()
    // algae kiss on some seaward faces
    if (st.c > 0.6) {
      g.globalAlpha = 0.2
      g.fillStyle = '#3f5a4e'
      g.beginPath()
      g.arc(lx - st.s * 0.18, ly - st.s * 0.5, st.s * 0.52, 0, TAU)
      g.fill()
    }
    // moon glint
    g.globalAlpha = 0.4
    g.fillStyle = '#79848a'
    g.beginPath()
    g.arc(lx - st.s * 0.38, ly - st.s * 0.46, st.s * 0.2, 0, TAU)
    g.fill()
    // grain specks
    g.fillStyle = '#0a0d0e'
    for (let n = 0; n < 3; n++) {
      g.globalAlpha = 0.18 + rnd() * 0.14
      g.fillRect(lx + (rnd() - 0.5) * st.s * 1.1, ly + (rnd() - 0.5) * st.s * 1.1, 1, 1)
    }
  }
  g.globalAlpha = 1
  WALL_SPR.push({ c, x: minX, y: minY })
}

// serpent body/head sprites: rim-lit scaled hide, ventral shadow, mottling,
// and a wet sheen band that drifts across 3 frames (micro-animation). Each
// variant keeps one seed so scales/blotches stay put — only the sheen moves.
function serpSprite(litTop, base, deep, rim, seed, sheenK) {
  const c = makeCanvas(64, 64)
  const g = c.getContext('2d')
  const r = mulberry32(seed)
  // base disc, lit from the moon side (up-left)
  const gr = g.createRadialGradient(25, 21, 3, 32, 32, 31)
  gr.addColorStop(0, litTop)
  gr.addColorStop(0.55, base)
  gr.addColorStop(1, deep)
  g.fillStyle = gr
  g.beginPath()
  g.arc(32, 32, 30, 0, TAU)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(32, 32, 30, 0, TAU)
  g.clip()
  // ventral shadow pooling away from the moon
  g.globalAlpha = 0.32
  g.fillStyle = '#020806'
  g.beginPath()
  g.ellipse(41, 43, 26, 20, 0.5, 0, TAU)
  g.fill()
  // staggered rows of scale crescents, each with a moonlit upper edge
  for (let y = 10; y < 58; y += 6.5) {
    const off = ((y / 6.5) | 0) % 2 ? 3.5 : 0
    for (let x = 6 + off; x < 60; x += 7) {
      const jx = x + (r() - 0.5) * 1.6
      const jy = y + (r() - 0.5) * 1.4
      const sr = 2.6 + r() * 0.9
      g.lineWidth = 1.1
      g.strokeStyle = '#03120b'
      g.globalAlpha = 0.16 + r() * 0.12
      g.beginPath()
      g.arc(jx, jy, sr, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
      g.strokeStyle = litTop
      g.globalAlpha = 0.1 + r() * 0.08
      g.beginPath()
      g.arc(jx - 0.7, jy - 0.9, sr, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    }
  }
  // mottled blotches under the scale rhythm
  g.fillStyle = '#060d09'
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU
    const rr = r() * 24
    g.globalAlpha = 0.1 + r() * 0.12
    g.beginPath()
    g.arc(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr, 2 + r() * 3.6, 0, TAU)
    g.fill()
  }
  // wet sheen band — its offset is the only thing that changes per frame
  const so = -26 + 26 * sheenK
  g.lineCap = 'round'
  g.strokeStyle = '#9fffd0'
  g.globalAlpha = 0.05
  g.lineWidth = 9
  g.beginPath()
  g.moveTo(2 + so, 58)
  g.lineTo(40 + so, 4)
  g.stroke()
  g.strokeStyle = '#cfeee0'
  g.globalAlpha = 0.045
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(6 + so, 58)
  g.lineTo(44 + so, 4)
  g.stroke()
  g.restore()
  // spectral rim along the moon side
  g.globalAlpha = rim
  g.strokeStyle = '#9fffd0'
  g.lineWidth = 2.4
  g.beginPath()
  g.arc(32, 32, 28.2, -2.6, -0.55)
  g.stroke()
  g.globalAlpha = rim * 0.45
  g.lineWidth = 4.6
  g.beginPath()
  g.arc(32, 32, 27, -2.45, -0.7)
  g.stroke()
  g.globalAlpha = 1
  return c
}
// 3 sheen frames per variant (same seed per variant: only the sheen drifts)
const SERP_BODY_A = [0, 1, 2].map((f) => serpSprite('#234034', '#13231d', '#070d0a', 0.2, 9101, f / 2))
const SERP_BODY_B = [0, 1, 2].map((f) => serpSprite('#1d382d', '#102019', '#060b08', 0.16, 9202, f / 2))
const SERP_HEAD = [0, 1, 2].map((f) => serpSprite('#2a4a3b', '#16271f', '#08100c', 0.3, 9303, f / 2))

// the chalupa hull, pre-rendered at 3x: planked strakes, floor ribs, wood
// grain, a moonlit gunwale on the up-left rim and the rowing bench baked in.
// Local boat coords (+x = bow), origin at canvas (22, 12).
const BOAT_SPR = (() => {
  const SC = 3
  const c = makeCanvas(46 * SC, 24 * SC)
  const g = c.getContext('2d')
  g.scale(SC, SC)
  g.translate(22, 12)
  const hull = () => {
    g.beginPath()
    g.moveTo(20, 0)
    g.quadraticCurveTo(10, -8, -10, -6.5)
    g.quadraticCurveTo(-17, -5.5, -17, 0)
    g.quadraticCurveTo(-17, 5.5, -10, 6.5)
    g.quadraticCurveTo(10, 8, 20, 0)
    g.closePath()
  }
  const gr = g.createLinearGradient(-6, -9, 4, 9)
  gr.addColorStop(0, '#4a3a22')
  gr.addColorStop(0.55, '#332618')
  gr.addColorStop(1, '#20170d')
  g.fillStyle = gr
  hull()
  g.fill()
  g.save()
  hull()
  g.clip()
  // inner floor, darker, with frame ribs
  g.fillStyle = '#1b1309'
  g.beginPath()
  g.moveTo(15, 0)
  g.quadraticCurveTo(8, -5.6, -9, -4.4)
  g.quadraticCurveTo(-14, -3.6, -14, 0)
  g.quadraticCurveTo(-14, 3.6, -9, 4.4)
  g.quadraticCurveTo(8, 5.6, 15, 0)
  g.closePath()
  g.fill()
  g.strokeStyle = '#0e0a05'
  g.lineWidth = 0.7
  g.globalAlpha = 0.6
  for (let x = -12; x <= 12; x += 4) {
    const k = 1 - Math.abs(x) / 20
    g.beginPath()
    g.moveTo(x, -5.2 * k - 0.6)
    g.lineTo(x, 5.2 * k + 0.6)
    g.stroke()
  }
  // strake seams following the gunwale curve
  g.globalAlpha = 0.55
  g.strokeStyle = '#120d07'
  g.lineWidth = 0.6
  for (let s = -1; s <= 1; s += 2) {
    for (let n = 1; n <= 2; n++) {
      const k = n / 3
      g.beginPath()
      g.moveTo(17 + k * 2.4, s * 0.4)
      g.quadraticCurveTo(9, s * (8 - k * 2.6) * 0.92, -10, s * (6.5 - k * 2.1))
      g.stroke()
    }
  }
  // wood grain flecks
  g.strokeStyle = '#5d4a2c'
  g.lineWidth = 0.4
  for (let i = 0; i < 26; i++) {
    const x = -15 + rnd() * 32
    const y = (rnd() - 0.5) * 13
    g.globalAlpha = 0.12 + rnd() * 0.12
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 1.5 + rnd() * 2.5, y + (rnd() - 0.5))
    g.stroke()
  }
  g.restore()
  // outline + gunwale: the moon catches the up-left rim hardest
  g.globalAlpha = 1
  g.strokeStyle = '#120d07'
  g.lineWidth = 1.6
  hull()
  g.stroke()
  g.strokeStyle = '#8a7350'
  g.lineWidth = 0.9
  g.globalAlpha = 0.55
  g.beginPath()
  g.moveTo(20, -0.3)
  g.quadraticCurveTo(10, -8, -10, -6.5)
  g.quadraticCurveTo(-17, -5.5, -17, 0)
  g.stroke()
  g.globalAlpha = 0.18
  g.beginPath()
  g.moveTo(-17, 0)
  g.quadraticCurveTo(-17, 5.5, -10, 6.5)
  g.quadraticCurveTo(10, 8, 20, 0)
  g.stroke()
  // bow stem cap
  g.globalAlpha = 0.9
  g.fillStyle = '#5d4a2c'
  g.beginPath()
  g.moveTo(20.5, 0)
  g.lineTo(16.5, -1.6)
  g.lineTo(16.5, 1.6)
  g.closePath()
  g.fill()
  // rowing bench with a lit leading edge
  g.globalAlpha = 1
  g.fillStyle = '#3d2f1c'
  g.fillRect(-4.2, -6, 2.6, 12)
  g.fillStyle = '#67522f'
  g.globalAlpha = 0.5
  g.fillRect(-4.2, -6, 0.7, 12)
  g.globalAlpha = 1
  return c
})()

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
  G.mud = ctx.createPattern(MUD_TILE, 'repeat')
  G.waterPat = ctx.createPattern(WATER_TILE, 'repeat')
}

// ---- pieces -----------------------------------------------------------------
function drawWalls(ctx, S, tVis) {
  const sp = S.serp
  for (let i = 0; i < SEGN; i++) {
    const seg = S.segs[i]
    if (!seg.broken) {
      // pre-shaded stones: contact shadow, moonlit gradient, algae, grain
      const spr = WALL_SPR[i]
      ctx.drawImage(spr.c, spr.x, spr.y)
    } else {
      // scoured wet stain where the wall used to stand
      ctx.globalAlpha = 0.3
      ctx.fillStyle = '#04080a'
      ctx.beginPath()
      ctx.ellipse(seg.mx, seg.my, 32, 23, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
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
  ctx.lineCap = 'round'
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
    const px = -dy
    const py = dx
    const flick = Math.sin(tVis * 9 + f.ph * 3.1) * 2.1 // the tail sculls
    const a = 0.42 + 0.34 * (0.5 + 0.5 * Math.sin(tVis * 3.1 + f.ph))
    ctx.globalAlpha = a
    ctx.strokeStyle = f.pen ? '#b9e2c8' : '#c6d3d6'
    ctx.beginPath()
    ctx.moveTo(f.x - dx * 2.6, f.y - dy * 2.6)
    ctx.lineTo(f.x + dx * 3.4, f.y + dy * 3.4)
    ctx.moveTo(f.x - dx * 2.2, f.y - dy * 2.2)
    ctx.lineTo(f.x - dx * 5 + px * flick, f.y - dy * 5 + py * flick)
    ctx.stroke()
    // a moonlit glint at the head
    ctx.globalAlpha = a * 0.9
    ctx.fillStyle = '#eef7f2'
    ctx.fillRect(f.x + dx * 3 - 0.6, f.y + dy * 3 - 0.6, 1.2, 1.2)
  }
  ctx.globalAlpha = 1
}

function drawSerpent(ctx, S, tVis) {
  const sp = S.serp
  if (sp.state === 'down') return
  if (sp.state === 'telegraph') {
    const k = sp.t / TELE_T
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
    // the snout breaks the surface late in the telegraph, sniffing
    if (k > 0.55) {
      const vis = Math.min(1, (k - 0.55) * 2.4)
      const sniff = 1 + 0.22 * Math.sin(tVis * 7.3)
      ctx.globalAlpha = vis
      ctx.fillStyle = '#71443c'
      ctx.beginPath()
      ctx.arc(sp.ex + 0.9, sp.ey + 1.1, 6.1, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#b27d70'
      ctx.beginPath()
      ctx.arc(sp.ex, sp.ey, 6, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = vis * 0.6
      ctx.fillStyle = '#d4a195' // the moon finds the wet snout
      ctx.beginPath()
      ctx.arc(sp.ex - 1.5, sp.ey - 1.7, 3.6, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = vis
      ctx.fillStyle = '#2e1815'
      ctx.beginPath()
      ctx.arc(sp.ex - 2, sp.ey - 1, 1.1 * sniff, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(sp.ex + 2, sp.ey - 1, 1.1 * sniff, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    return
  }
  const fade = sp.state === 'dive' ? Math.max(0, 1 - sp.t / 1.1) : 1
  const px = -sp.dy
  const py = sp.dx
  const sf = ((tVis * 4) | 0) % 3 // sheen micro-frames drifting over the hide
  // segmented body, tail to head — rim-lit scaled hide
  for (let i = 9; i >= 0; i--) {
    const wob = Math.sin(tVis * 5 + i * 0.9) * 2
    const x = sp.sx[i] + px * wob
    const y = sp.sy[i] + py * wob
    const rr = 12.5 - i * 0.75
    ctx.globalAlpha = fade
    ctx.drawImage((i & 1) === 1 ? SERP_BODY_A[sf] : SERP_BODY_B[sf], x - rr, y - rr, rr * 2, rr * 2)
  }
  // bristle mane along the spine — pig hair, swaying a beat behind the body
  ctx.lineCap = 'round'
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? '#0d1812' : '#4e7a5c'
    ctx.lineWidth = pass === 0 ? 2 : 1
    ctx.globalAlpha = fade * (pass === 0 ? 0.7 : 0.45)
    ctx.beginPath()
    for (let i = 8; i >= 0; i--) {
      const wob = Math.sin(tVis * 5 + i * 0.9) * 2
      const sway = Math.sin(tVis * 5 + i * 0.9 - 0.8) * 2 // lags the wobble
      const x = sp.sx[i] + px * wob
      const y = sp.sy[i] + py * wob
      const rr = 12.5 - i * 0.75
      ctx.moveTo(x, y - rr * 0.25)
      ctx.lineTo(x + px * sway - 1.2, y - rr * 0.25 - rr * 0.5)
    }
    ctx.stroke()
  }
  // head — pulses while he feeds
  const ga = sp.state === 'feed' ? 1 + 0.08 * Math.sin(sp.t * 8) : 1
  const hr = 15 * ga
  // floppy pig ears behind the skull, flapping a beat behind the swim
  const earFl = Math.sin(tVis * 4.2 - 0.6) * 1.5
  ctx.fillStyle = '#142b20'
  ctx.globalAlpha = fade * 0.95
  for (let s = -1; s <= 1; s += 2) {
    const ex = sp.x - sp.dx * 3 + px * s * hr * 0.7
    const ey = sp.y - sp.dy * 3 + py * s * hr * 0.7
    ctx.beginPath()
    ctx.moveTo(ex + sp.dx * 3, ey + sp.dy * 3)
    ctx.lineTo(ex - sp.dx * 8 + px * s * (4.5 + earFl), ey - sp.dy * 8 + py * s * (4.5 + earFl))
    ctx.lineTo(ex - sp.dx * 2 + px * s * 5.5, ey - sp.dy * 2 + py * s * 5.5)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#3f5f4c' // moonlit ear edges
  ctx.lineWidth = 1
  ctx.globalAlpha = fade * 0.5
  for (let s = -1; s <= 1; s += 2) {
    const ex = sp.x - sp.dx * 3 + px * s * hr * 0.7
    const ey = sp.y - sp.dy * 3 + py * s * hr * 0.7
    ctx.beginPath()
    ctx.moveTo(ex + sp.dx * 3, ey + sp.dy * 3)
    ctx.lineTo(ex - sp.dx * 8 + px * s * (4.5 + earFl), ey - sp.dy * 8 + py * s * (4.5 + earFl))
    ctx.stroke()
  }
  ctx.globalAlpha = fade
  ctx.drawImage(SERP_HEAD[sf], sp.x - hr, sp.y - hr, hr * 2, hr * 2)
  ctx.globalAlpha = fade * (0.18 + 0.1 * Math.sin(tVis * 3.3))
  ctx.strokeStyle = '#9fffd0'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(sp.x, sp.y, hr, 0, TAU)
  ctx.stroke()
  // boar tusks: curved ivory blades, tips catching the moon
  for (let s = -1; s <= 1; s += 2) {
    const rx = sp.x + sp.dx * 9 + px * s * 9
    const ry = sp.y + sp.dy * 9 + py * s * 9
    const tx = sp.x + sp.dx * 16 + px * s * 12.5
    const ty = sp.y + sp.dy * 16 + py * s * 12.5
    const cx2 = sp.x + sp.dx * 14 + px * s * 8
    const cy2 = sp.y + sp.dy * 14 + py * s * 8
    ctx.globalAlpha = fade * 0.92
    ctx.fillStyle = '#d8d3c2'
    ctx.beginPath()
    ctx.moveTo(rx + px * s * 1.6, ry + py * s * 1.6)
    ctx.quadraticCurveTo(cx2 + px * s * 3, cy2 + py * s * 3, tx, ty)
    ctx.quadraticCurveTo(cx2, cy2, rx - px * s * 0.6, ry - py * s * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f4f1e4'
    ctx.globalAlpha = fade * 0.8
    ctx.beginPath()
    ctx.arc(tx, ty, 0.9, 0, TAU)
    ctx.fill()
  }
  // pig snout, lit from the moon side: shadowed lip, disc, lit crescent
  const snx = sp.x + sp.dx * 16
  const sny = sp.y + sp.dy * 16
  const ang = Math.atan2(sp.dy, sp.dx)
  const sniff = 1 + 0.22 * Math.sin(tVis * 7.3)
  ctx.globalAlpha = fade
  ctx.fillStyle = '#71443c'
  ctx.beginPath()
  ctx.ellipse(snx + 1, sny + 1.2, 8.2, 6.1, ang, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#b27d70'
  ctx.beginPath()
  ctx.ellipse(snx, sny, 8, 6, ang, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = fade * 0.65
  ctx.fillStyle = '#d4a195'
  ctx.beginPath()
  ctx.ellipse(snx - 1.4, sny - 1.7, 5.6, 3.9, ang, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = fade
  ctx.fillStyle = '#2e1815'
  ctx.beginPath()
  ctx.arc(snx + sp.dx * 2.5 - px * 2.6, sny + sp.dy * 2.5 - py * 2.6, 1.5 * sniff, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(snx + sp.dx * 2.5 + px * 2.6, sny + sp.dy * 2.5 + py * 2.6, 1.5 * sniff, 0, TAU)
  ctx.fill()
  // spectral eyes — the glow breathes, and now and then he blinks
  const blink = Math.min(1, Math.abs(Math.sin(tVis * 0.7 + 0.4)) * 5)
  for (let s = -1; s <= 1; s += 2) {
    const ex = sp.x + sp.dx * 5 + px * s * 8
    const ey = sp.y + sp.dy * 5 + py * s * 8
    ctx.fillStyle = '#9fffd0'
    ctx.globalAlpha = fade * (0.14 + 0.2 * blink)
    ctx.beginPath()
    ctx.arc(ex, ey, 3.6, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = fade * (0.25 + 0.75 * blink)
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
  // hull shadow pooling in the water
  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(-0.5, 1.6, 19, 8.5, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  // pre-rendered planked hull: strakes, ribs, grain, moonlit gunwale, bench
  ctx.drawImage(BOAT_SPR, -22, -12, 46, 24)
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
  // --- the rower: a hooded fisher on the bench, leaning into each stroke
  const lean = Math.sin(ph) * 1.9 // the body drives the stroke…
  const hem = Math.sin(ph - 0.9) * 1.1 // …and the wool swings a beat behind
  const bx = -2.6 + lean
  // arms reach for the oar handles
  ctx.strokeStyle = '#241c12'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  const hx = 0.4 + Math.sin(ph) * 1.8
  ctx.beginPath()
  ctx.moveTo(bx + 1, -2.6)
  ctx.lineTo(hx, -5.4)
  ctx.moveTo(bx + 1, 2.6)
  ctx.lineTo(hx, 5.4)
  ctx.stroke()
  // poncho: dark wool with a pale woven stripe
  ctx.save()
  ctx.translate(bx, 0)
  ctx.rotate(hem * 0.07)
  ctx.fillStyle = '#3a3026'
  ctx.beginPath()
  ctx.ellipse(0, 0, 4.5, 5.3, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#6e5b40'
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(-3.4, -2.1)
  ctx.quadraticCurveTo(0, -2.9, 3.4, -2.1)
  ctx.moveTo(-3.7, 1.6)
  ctx.quadraticCurveTo(0, 2.4, 3.7, 1.6)
  ctx.stroke()
  // the bow lantern kisses the shoulders with warm rim light
  ctx.strokeStyle = '#ffce8e'
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(0, 0, 4.2, 5, 0, -0.55, 0.55)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.restore()
  // head: wool cap nodding with the stroke, pompom catching the light
  const hdx = bx + 1.6 + Math.sin(ph) * 0.5
  ctx.fillStyle = '#1d150e'
  ctx.beginPath()
  ctx.arc(hdx + 0.4, 0.4, 2.3, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#5c3b2e'
  ctx.beginPath()
  ctx.arc(hdx, 0, 2.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#c9b08a'
  ctx.beginPath()
  ctx.arc(hdx, 0, 0.75, 0, TAU)
  ctx.fill()
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
    } else if (p.t === 'ring') {
      // expanding impact ring: radius grows as life burns down
      ctx.globalAlpha = a * 0.5
      ctx.strokeStyle = '#cfe2da'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.s + (1 - a) * 52, 0, TAU)
      ctx.stroke()
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

  // wet flats: gradient, then tide-rippled mud grain, then speckle
  ctx.fillStyle = G.sand
  ctx.fillRect(-900, -900, 2800, 2800)
  ctx.fillStyle = G.mud
  ctx.globalAlpha = 0.6
  ctx.fillRect(-900, -900, 2800, 2800)
  ctx.globalAlpha = 1
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
  // two counter-drifting sheets of water grain (cheap current)
  ctx.fillStyle = G.waterPat
  const w1 = (tVis * 7) % 256
  ctx.save()
  ctx.translate(w1, 0)
  ctx.globalAlpha = 0.5
  ctx.fillRect(-900 - w1, -900, 2800, S.shoreY + 900)
  ctx.restore()
  const w2 = (tVis * -4.3) % 256
  ctx.save()
  ctx.translate(w2, 7)
  ctx.globalAlpha = 0.28
  ctx.fillRect(-900 - w2, -907, 2800, S.shoreY + 900)
  ctx.restore()
  // shimmer slivers, brightening into a glitter path under the moon glint
  ctx.strokeStyle = '#9fc8bc'
  ctx.lineWidth = 1
  for (let i = 0; i < SHIM.length; i++) {
    const s = SHIM[i]
    if (s.y > S.shoreY - 24) continue
    const moonK = 1 + Math.max(0, 1 - Math.abs(s.x - 660) / 140) * 1.7
    ctx.globalAlpha = (0.035 + 0.04 * (1 + Math.sin(tVis * 0.8 + s.ph))) * moonK
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
