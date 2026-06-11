// render.js — EL BASILISCO · all 2D canvas drawing + visual fx pools.
// Static scenery is pre-rendered once to an offscreen canvas; the darkness
// layer is composed per frame on a second offscreen canvas with pre-built
// radial gradients (translated into place, so nothing is allocated per frame).
// Particle / ripple / rain pools are fixed-size and recycled.

import {
  W, H, HOUSE, WALLS, SLEEPERS, BRAZIERS, BRAZIER_RADIUS, CRACKS, TILES, TILE_SIZE,
  DRINK_TIME, PRY_TIME, STUN_TIME,
} from './world.js'

const INK = '#e8dcc0'
const GLOW = '#9fffd0'

// --- procedural textures (built once at boot, deterministic, low contrast) --
function mulberry(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// plank floor: per-board tone drift, wobbly grain streaks, occasional knots
function makeWoodCanvas(w, h, boardW, seed) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const rnd = mulberry(seed)
  g.fillStyle = '#171008'
  g.fillRect(0, 0, w, h)
  for (let x = 0; x < w; x += boardW) {
    g.fillStyle = rnd() > 0.5
      ? 'rgba(96,66,34,' + (0.05 + rnd() * 0.09).toFixed(3) + ')'
      : 'rgba(0,0,0,' + (0.04 + rnd() * 0.1).toFixed(3) + ')'
    g.fillRect(x, 0, boardW, h)
    const n = 5 + ((rnd() * 4) | 0)
    for (let i = 0; i < n; i++) {
      const gx = x + 2 + rnd() * (boardW - 4)
      const amp = 0.6 + rnd() * 1.4
      const ph = rnd() * 7
      g.strokeStyle = rnd() > 0.32
        ? 'rgba(8,5,2,' + (0.14 + rnd() * 0.16).toFixed(2) + ')'
        : 'rgba(140,104,60,' + (0.05 + rnd() * 0.06).toFixed(2) + ')'
      g.lineWidth = 0.8 + rnd() * 0.8
      g.beginPath()
      g.moveTo(gx, 0)
      for (let y = 14; y <= h + 14; y += 14) g.lineTo(gx + Math.sin(y * 0.04 + ph) * amp, y)
      g.stroke()
    }
    if (rnd() > 0.62) {
      const kx = x + boardW * (0.3 + rnd() * 0.4)
      const ky = rnd() * h
      g.strokeStyle = 'rgba(10,6,3,0.45)'
      g.lineWidth = 1
      for (let r = 1.5; r < 6; r += 1.6) {
        g.beginPath()
        g.ellipse(kx, ky, r, r * 1.6, 0, 0, Math.PI * 2)
        g.stroke()
      }
      g.fillStyle = 'rgba(8,5,2,0.5)'
      g.beginPath()
      g.ellipse(kx, ky, 1.4, 2.2, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  // edge wear: corners of boards darken faintly
  g.fillStyle = 'rgba(0,0,0,0.10)'
  for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1)
  return c
}

// tiling night-sea texture: tonal blotches + thin wave streaks
function makeWaterCanvas(seed) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const rnd = mulberry(seed)
  g.fillStyle = '#071a20'
  g.fillRect(0, 0, S, S)
  const OFF = [-S, 0, S]
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const r = 24 + rnd() * 52
    g.fillStyle = rnd() > 0.5
      ? 'rgba(4,10,14,' + (0.1 + rnd() * 0.13).toFixed(2) + ')'
      : 'rgba(20,52,56,' + (0.05 + rnd() * 0.07).toFixed(2) + ')'
    for (const ox of OFF) {
      for (const oy of OFF) {
        g.beginPath()
        g.ellipse(x + ox, y + oy, r, r * 0.45, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  for (let i = 0; i < 64; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const len = 12 + rnd() * 36
    const dip = 2 + rnd() * 2
    g.strokeStyle = 'rgba(120,190,180,' + (0.03 + rnd() * 0.045).toFixed(3) + ')'
    g.lineWidth = 0.8 + rnd()
    for (const ox of OFF) {
      for (const oy of OFF) {
        g.beginPath()
        g.moveTo(x + ox - len / 2, y + oy)
        g.quadraticCurveTo(x + ox, y + oy - dip, x + ox + len / 2, y + oy)
        g.stroke()
      }
    }
  }
  return c
}

// tiling blanket weave
function makeWeaveCanvas(seed) {
  const S = 32
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const rnd = mulberry(seed)
  g.fillStyle = '#232b26'
  g.fillRect(0, 0, S, S)
  g.lineWidth = 1
  for (let i = 0; i < S; i += 4) {
    g.strokeStyle = 'rgba(12,16,13,' + (0.28 + rnd() * 0.18).toFixed(2) + ')'
    g.beginPath()
    g.moveTo(0, i + 0.5)
    g.lineTo(S, i + 0.5)
    g.stroke()
    g.strokeStyle = 'rgba(120,134,116,' + (0.05 + rnd() * 0.05).toFixed(2) + ')'
    g.beginPath()
    g.moveTo(i + 0.5, 0)
    g.lineTo(i + 0.5, S)
    g.stroke()
  }
  g.fillStyle = 'rgba(140,150,128,0.10)'
  for (let i = 0; i < 10; i++) g.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 2, 1)
  return c
}

// tiling poncho wool: dark sea-green weave with two chilote stripes
function makePonchoCanvas(seed) {
  const S = 24
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const rnd = mulberry(seed)
  g.fillStyle = '#37463e'
  g.fillRect(0, 0, S, S)
  // fine weave rows + warp threads
  for (let y = 0; y < S; y += 2) {
    g.fillStyle = 'rgba(14,20,16,' + (0.18 + rnd() * 0.12).toFixed(2) + ')'
    g.fillRect(0, y, S, 1)
  }
  for (let x = 0; x < S; x += 3) {
    g.fillStyle = 'rgba(122,140,120,' + (0.05 + rnd() * 0.05).toFixed(2) + ')'
    g.fillRect(x, 0, 1, S)
  }
  // woven-in stripes: undyed cream and ruddy madder
  g.fillStyle = 'rgba(214,196,160,0.45)'
  g.fillRect(0, 8, S, 2)
  g.fillStyle = 'rgba(160,68,56,0.5)'
  g.fillRect(0, 12, S, 1.5)
  // stray tufts of wool
  g.fillStyle = 'rgba(150,164,142,0.12)'
  for (let i = 0; i < 8; i++) g.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1)
  return c
}

// soft amber radial used to warm-tint the lit zones over the darkness layer
function makeWarmGlowCanvas() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,176,96,0.55)')
  grad.addColorStop(0.5, 'rgba(255,150,70,0.20)')
  grad.addColorStop(1, 'rgba(255,140,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return c
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

  // texture canvases — generated once, before the static base is painted
  const woodFloor = makeWoodCanvas(HOUSE.x1 - HOUSE.x0, HOUSE.y1 - HOUSE.y0, 24, 11)
  const waterTex = makeWaterCanvas(29)
  const weaveTex = makeWeaveCanvas(5)
  const warmGlow = makeWarmGlowCanvas()
  const ponchoPat = ctx.createPattern(makePonchoCanvas(17), 'repeat')

  // player walk-cycle state, derived from drawn positions (allocation-free)
  let pPrevX = -1
  let pPrevY = 0
  let walkPhase = 0
  let pMoving = 0

  // --- offscreen layers ---------------------------------------------------
  const base = document.createElement('canvas')
  base.width = W
  base.height = H
  paintBase(base.getContext('2d'))

  const dark = document.createElement('canvas')
  dark.width = W
  dark.height = H
  const dctx = dark.getContext('2d')
  // light-hole gradients built once, centered at origin
  const brazierLight = dctx.createRadialGradient(0, 0, 10, 0, 0, 250)
  brazierLight.addColorStop(0, 'rgba(0,0,0,1)')
  brazierLight.addColorStop(0.55, 'rgba(0,0,0,0.75)')
  brazierLight.addColorStop(1, 'rgba(0,0,0,0)')
  const candleLight = dctx.createRadialGradient(0, 0, 6, 0, 0, 105)
  candleLight.addColorStop(0, 'rgba(0,0,0,0.96)')
  candleLight.addColorStop(0.6, 'rgba(0,0,0,0.6)')
  candleLight.addColorStop(1, 'rgba(0,0,0,0)')

  // iron bowl shading per brazier, built once (absolute coords)
  const bowlGrads = BRAZIERS.map((br) => {
    const g2 = ctx.createRadialGradient(br.x - 5, br.y - 6, 2, br.x, br.y, BRAZIER_RADIUS)
    g2.addColorStop(0, '#40362a')
    g2.addColorStop(0.55, '#241c12')
    g2.addColorStop(1, '#120d07')
    return g2
  })

  // --- pools ---------------------------------------------------------------
  const RAIN_N = 90
  const rain = new Float32Array(RAIN_N * 3) // x, y, speed
  for (let i = 0; i < RAIN_N; i++) {
    rain[i * 3] = Math.random() * W
    rain[i * 3 + 1] = Math.random() * H
    // first 60 fall far/slow, last 30 near/fast (drawn as two depth layers)
    rain[i * 3 + 2] = i < 60 ? 380 + Math.random() * 220 : 600 + Math.random() * 260
  }

  const P_N = 220
  const parts = []
  for (let i = 0; i < P_N; i++) {
    parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: INK })
  }
  let pCursor = 0

  const RIP_N = 4
  const ripples = []
  for (let i = 0; i < RIP_N; i++) ripples.push({ x: 0, y: 0, dir: 0, age: 99, active: false })

  let shakeMag = 0
  let time = 0
  let flash = 0 // brief whole-screen glow pulse 0..1
  let flashColor = GLOW
  let emberT = 0 // last sim-time an ember rose from the braziers

  // --- fx api --------------------------------------------------------------
  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i++) {
      const p = parts[pCursor]
      pCursor = (pCursor + 1) % P_N
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.3 + Math.random() * 0.7)
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s - speed * 0.2
      p.max = life * (0.5 + Math.random() * 0.5)
      p.life = p.max
      p.size = size
      p.color = color
    }
  }

  // single rising ember (recycles the particle pool; gravity arcs it back down)
  function ember(x, y) {
    const p = parts[pCursor]
    pCursor = (pCursor + 1) % P_N
    p.x = x + (Math.random() * 10 - 5)
    p.y = y - 4
    p.vx = Math.random() * 12 - 6
    p.vy = -26 - Math.random() * 26
    p.max = 0.7 + Math.random() * 0.5
    p.life = p.max
    p.size = 1.5
    p.color = Math.random() > 0.5 ? '#ffb070' : '#e8843c'
  }

  function ripple(x, y, dir) {
    let r = ripples[0]
    for (let i = 0; i < RIP_N; i++) if (!ripples[i].active) { r = ripples[i]; break }
    r.x = x
    r.y = y
    r.dir = dir
    r.age = 0
    r.active = true
  }

  function shake(m) { shakeMag = Math.max(shakeMag, m) }
  function pulse(color) { flash = 1; flashColor = color }

  // advanced from the sim frame() so manual stepping moves fx too
  function update(dt) {
    time += dt
    for (let i = 0; i < P_N; i++) {
      const p = parts[i]
      if (p.life <= 0) continue
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 60 * dt
      p.vx *= 1 - 1.6 * dt
    }
    for (let i = 0; i < RIP_N; i++) {
      const r = ripples[i]
      if (!r.active) continue
      r.age += dt
      if (r.age > 2.2) r.active = false
    }
    for (let i = 0; i < RAIN_N; i++) {
      rain[i * 3 + 1] += rain[i * 3 + 2] * dt
      rain[i * 3] -= rain[i * 3 + 2] * 0.18 * dt
      if (rain[i * 3 + 1] > H) {
        rain[i * 3 + 1] -= H + 14
        rain[i * 3] = Math.random() * (W + 120)
      }
    }
    shakeMag = Math.max(0, shakeMag - 6 * shakeMag * dt - 0.4 * dt)
    flash = Math.max(0, flash - 2.2 * dt)
  }

  // --- static scenery -------------------------------------------------------
  function stilt(b, x, y) {
    // water contact rings
    b.lineWidth = 1
    b.strokeStyle = 'rgba(140,200,190,0.10)'
    b.beginPath()
    b.ellipse(x, y + 5, 11, 4, 0, 0, Math.PI * 2)
    b.stroke()
    b.strokeStyle = 'rgba(140,200,190,0.05)'
    b.beginPath()
    b.ellipse(x, y + 6, 16, 6, 0, 0, Math.PI * 2)
    b.stroke()
    // faint reflection streak in the water below
    b.strokeStyle = 'rgba(60,52,38,0.22)'
    b.beginPath()
    b.moveTo(x, y + 9)
    b.lineTo(x - 1, y + 24)
    b.stroke()
    // post head, cylinder-shaded
    const grad = b.createLinearGradient(x - 7, 0, x + 7, 0)
    grad.addColorStop(0, '#080706')
    grad.addColorStop(0.38, '#1c140a')
    grad.addColorStop(1, '#050404')
    b.fillStyle = grad
    b.beginPath()
    b.arc(x, y, 7, 0, Math.PI * 2)
    b.fill()
    b.strokeStyle = 'rgba(232,220,192,0.18)'
    b.stroke()
    // sawn-top highlight
    b.fillStyle = 'rgba(120,96,58,0.30)'
    b.beginPath()
    b.ellipse(x - 1.5, y - 1.5, 3.4, 2.6, -0.5, 0, Math.PI * 2)
    b.fill()
  }

  function paintBase(b) {
    // the sea — depth gradient + tiling night-water texture
    const sea = b.createLinearGradient(0, 0, 0, H)
    sea.addColorStop(0, '#08161c')
    sea.addColorStop(0.55, '#071a20')
    sea.addColorStop(1, '#040d12')
    b.fillStyle = sea
    b.fillRect(0, 0, W, H)
    b.globalAlpha = 0.9
    b.fillStyle = b.createPattern(waterTex, 'repeat')
    b.fillRect(0, 0, W, H)
    b.globalAlpha = 1
    // faint moon glint across the upper water
    const glint = b.createLinearGradient(120, 0, W, 200)
    glint.addColorStop(0, 'rgba(159,255,208,0)')
    glint.addColorStop(0.5, 'rgba(159,255,208,0.03)')
    glint.addColorStop(1, 'rgba(159,255,208,0)')
    b.fillStyle = glint
    b.fillRect(0, 0, W, 250)
    // the house casts onto the water
    b.save()
    b.shadowColor = 'rgba(0,0,0,0.85)'
    b.shadowBlur = 46
    b.fillStyle = '#0a0a08'
    b.fillRect(HOUSE.x0 - 10, HOUSE.y0 - 10, HOUSE.x1 - HOUSE.x0 + 20, HOUSE.y1 - HOUSE.y0 + 20)
    b.restore()
    // stilts (pilotis) around the house
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      const xs = HOUSE.x0 - 22 + t * (HOUSE.x1 - HOUSE.x0 + 44)
      stilt(b, xs, HOUSE.y0 - 26)
      stilt(b, xs, HOUSE.y1 + 26)
    }
    for (let i = 1; i < 6; i++) {
      const ys = HOUSE.y0 + (i / 6) * (HOUSE.y1 - HOUSE.y0)
      stilt(b, HOUSE.x0 - 30, ys)
      stilt(b, HOUSE.x1 + 30, ys)
    }
    // floor — grained plank texture
    b.drawImage(woodFloor, HOUSE.x0, HOUSE.y0)
    // board edges + joints over the grain
    b.strokeStyle = 'rgba(12,8,5,0.85)'
    b.lineWidth = 1.5
    for (let x = HOUSE.x0 + 24; x < HOUSE.x1; x += 24) {
      b.beginPath()
      b.moveTo(x + 0.5, HOUSE.y0)
      b.lineTo(x + 0.5, HOUSE.y1)
      b.stroke()
    }
    b.lineWidth = 1
    for (let x = HOUSE.x0; x < HOUSE.x1; x += 24) {
      const yj = HOUSE.y0 + 40 + ((x * 13) % 360)
      b.beginPath()
      b.moveTo(x, yj + 0.5)
      b.lineTo(x + 24, yj + 0.5)
      b.stroke()
      // nail dots at the joint
      b.fillStyle = 'rgba(180,160,120,0.18)'
      b.fillRect(x + 5, yj - 2, 1.5, 1.5)
      b.fillRect(x + 17, yj - 2, 1.5, 1.5)
    }
    // ambient occlusion: the room falls into shadow at its edges
    const AO = 20
    const x0 = HOUSE.x0
    const y0 = HOUSE.y0
    const x1 = HOUSE.x1
    const y1 = HOUSE.y1
    let ao = b.createLinearGradient(0, y0, 0, y0 + AO)
    ao.addColorStop(0, 'rgba(0,0,0,0.38)')
    ao.addColorStop(1, 'rgba(0,0,0,0)')
    b.fillStyle = ao
    b.fillRect(x0, y0, x1 - x0, AO)
    ao = b.createLinearGradient(0, y1, 0, y1 - AO)
    ao.addColorStop(0, 'rgba(0,0,0,0.38)')
    ao.addColorStop(1, 'rgba(0,0,0,0)')
    b.fillStyle = ao
    b.fillRect(x0, y1 - AO, x1 - x0, AO)
    ao = b.createLinearGradient(x0, 0, x0 + AO, 0)
    ao.addColorStop(0, 'rgba(0,0,0,0.38)')
    ao.addColorStop(1, 'rgba(0,0,0,0)')
    b.fillStyle = ao
    b.fillRect(x0, y0, AO, y1 - y0)
    ao = b.createLinearGradient(x1, 0, x1 - AO, 0)
    ao.addColorStop(0, 'rgba(0,0,0,0.38)')
    ao.addColorStop(1, 'rgba(0,0,0,0)')
    b.fillStyle = ao
    b.fillRect(x1 - AO, y0, AO, y1 - y0)
    // outer wall — thin double border
    b.strokeStyle = 'rgba(232,220,192,0.55)'
    b.lineWidth = 2
    b.strokeRect(HOUSE.x0 - 4, HOUSE.y0 - 4, HOUSE.x1 - HOUSE.x0 + 8, HOUSE.y1 - HOUSE.y0 + 8)
    b.lineWidth = 1
    b.strokeStyle = 'rgba(232,220,192,0.3)'
    b.strokeRect(HOUSE.x0 - 9, HOUSE.y0 - 9, HOUSE.x1 - HOUSE.x0 + 18, HOUSE.y1 - HOUSE.y0 + 18)
    // inner walls — drop shadow, plank lines, bevel highlight
    for (const wll of WALLS) {
      b.fillStyle = 'rgba(0,0,0,0.35)'
      b.fillRect(wll.x + 3, wll.y + 4, wll.w, wll.h)
      b.fillStyle = '#241a10'
      b.fillRect(wll.x, wll.y, wll.w, wll.h)
      // planks run along the long axis
      b.strokeStyle = 'rgba(10,7,4,0.6)'
      b.lineWidth = 1
      if (wll.w > wll.h) {
        for (let yy = wll.y + 3; yy < wll.y + wll.h - 1; yy += 3) {
          b.beginPath()
          b.moveTo(wll.x + 1, yy + 0.5)
          b.lineTo(wll.x + wll.w - 1, yy + 0.5)
          b.stroke()
        }
      } else {
        for (let xx = wll.x + 3; xx < wll.x + wll.w - 1; xx += 3) {
          b.beginPath()
          b.moveTo(xx + 0.5, wll.y + 1)
          b.lineTo(xx + 0.5, wll.y + wll.h - 1)
          b.stroke()
        }
      }
      // top-left bevel light
      b.strokeStyle = 'rgba(170,140,90,0.22)'
      b.beginPath()
      b.moveTo(wll.x + 0.5, wll.y + wll.h - 1)
      b.lineTo(wll.x + 0.5, wll.y + 0.5)
      b.lineTo(wll.x + wll.w - 1, wll.y + 0.5)
      b.stroke()
      b.strokeStyle = 'rgba(232,220,192,0.4)'
      b.strokeRect(wll.x + 0.5, wll.y + 0.5, wll.w - 1, wll.h - 1)
    }
    // beds — shadow, frame, headboard, woven blanket, pillow
    for (const s of SLEEPERS) {
      const bd = s.bed
      b.fillStyle = 'rgba(0,0,0,0.4)'
      b.fillRect(bd.x + 3, bd.y + 4, bd.w, bd.h)
      b.fillStyle = '#1c1209'
      b.fillRect(bd.x, bd.y, bd.w, bd.h)
      b.strokeStyle = 'rgba(232,220,192,0.35)'
      b.lineWidth = 1
      b.strokeRect(bd.x + 0.5, bd.y + 0.5, bd.w - 1, bd.h - 1)
      b.strokeStyle = 'rgba(110,80,44,0.3)'
      b.strokeRect(bd.x + 2.5, bd.y + 2.5, bd.w - 5, bd.h - 5)
      // headboard at the head end
      b.fillStyle = '#2a1c0c'
      b.fillRect(bd.x + bd.w - 7, bd.y - 3, 7, bd.h + 6)
      b.strokeStyle = 'rgba(232,220,192,0.4)'
      b.strokeRect(bd.x + bd.w - 6.5, bd.y - 2.5, 6, bd.h + 5)
      // woven blanket with top light and folds
      b.fillStyle = b.createPattern(weaveTex, 'repeat')
      b.fillRect(bd.x + 6, bd.y + 6, bd.w - 13, bd.h - 12)
      const fg = b.createLinearGradient(0, bd.y, 0, bd.y + bd.h)
      fg.addColorStop(0, 'rgba(190,210,190,0.07)')
      fg.addColorStop(1, 'rgba(0,0,0,0.22)')
      b.fillStyle = fg
      b.fillRect(bd.x + 6, bd.y + 6, bd.w - 13, bd.h - 12)
      b.strokeStyle = 'rgba(10,14,11,0.55)'
      for (let k = 1; k <= 2; k++) {
        const fy = bd.y + 6 + ((bd.h - 12) * k) / 3
        b.beginPath()
        b.moveTo(bd.x + 7, fy)
        b.quadraticCurveTo(bd.x + bd.w / 2, fy + 2.5, bd.x + bd.w - 8, fy)
        b.stroke()
      }
      // pillow under where the head rests
      b.fillStyle = '#4a443a'
      b.beginPath()
      b.ellipse(s.x + 14, s.y, 14, 10, 0, 0, Math.PI * 2)
      b.fill()
      b.strokeStyle = 'rgba(232,220,192,0.18)'
      b.stroke()
    }
  }

  function circle(c, x, y, r, fill) {
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    if (fill) c.fill()
    c.stroke()
  }

  // --- per-frame drawing -----------------------------------------------------
  function drawCrack(c, crk, jitter) {
    const s = crk.seed
    c.beginPath()
    c.moveTo(crk.x - 22 + jitter * Math.sin(time * 53 + s), crk.y + ((s * 7) % 9) - 4)
    c.lineTo(crk.x - 9, crk.y + ((s * 3) % 7) - 3 + jitter * Math.sin(time * 47))
    c.lineTo(crk.x + 2, crk.y - ((s * 5) % 8) + 2)
    c.lineTo(crk.x + 12, crk.y + ((s * 11) % 6) - 2 + jitter * Math.cos(time * 60 + s))
    c.lineTo(crk.x + 23, crk.y - ((s * 13) % 9) + 4)
    c.stroke()
  }

  function draw(g) {
    // letterbox fit
    const cw = canvas.width
    const ch = canvas.height
    const sc = Math.min(cw / W, ch / H)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#06090c'
    ctx.fillRect(0, 0, cw, ch)
    const sx = (Math.random() * 2 - 1) * shakeMag
    const sy = (Math.random() * 2 - 1) * shakeMag
    ctx.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2 + sx * sc, (ch - H * sc) / 2 + sy * sc)

    ctx.drawImage(base, 0, 0)

    // sea shimmer outside the house
    ctx.strokeStyle = 'rgba(159,255,208,0.07)'
    ctx.lineWidth = 1
    for (let i = 0; i < 10; i++) {
      const yy = 18 + i * 60 + Math.sin(time * 0.7 + i * 1.7) * 6
      const xx = ((i * 173 + time * 14) % (W + 160)) - 80
      if (yy > HOUSE.y0 - 34 && yy < HOUSE.y1 + 34 && xx > HOUSE.x0 - 60 && xx < HOUSE.x1 + 60) continue
      ctx.beginPath()
      ctx.moveTo(xx, yy)
      ctx.lineTo(xx + 46, yy)
      ctx.stroke()
    }

    // suspect tiles
    for (let i = 0; i < TILES.length; i++) {
      const t = TILES[i]
      const tx = t.x - TILE_SIZE / 2
      const ty = t.y - TILE_SIZE / 2
      const st = g.tiles[i]
      ctx.fillStyle = st.opened ? '#050302' : '#1d1509'
      ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE)
      if (st.opened) {
        // hole below the floor — black water glints faintly down there
        ctx.fillStyle = '#020405'
        ctx.fillRect(tx + 4, ty + 5, TILE_SIZE - 8, TILE_SIZE - 9)
        ctx.strokeStyle = 'rgba(120,190,180,' + (0.05 + Math.sin(time * 1.3 + i * 2) * 0.03).toFixed(3) + ')'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(tx + 9, ty + TILE_SIZE - 11)
        ctx.lineTo(tx + TILE_SIZE - 9, ty + TILE_SIZE - 11)
        ctx.stroke()
      }
      ctx.strokeStyle = st.opened ? 'rgba(232,220,192,0.18)' : 'rgba(232,220,192,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
      if (!st.opened) {
        // raised lip: light catches the top edge, shadow pools below
        ctx.fillStyle = 'rgba(190,160,110,0.10)'
        ctx.fillRect(tx + 1, ty + 1, TILE_SIZE - 2, 1.5)
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(tx + 1, ty + TILE_SIZE - 2.5, TILE_SIZE - 2, 1.5)
        // nail heads — marks it as a loose, pry-able tile
        ctx.fillStyle = 'rgba(232,220,192,0.4)'
        ctx.fillRect(tx + 4, ty + 4, 2, 2)
        ctx.fillRect(tx + TILE_SIZE - 6, ty + 4, 2, 2)
        ctx.fillRect(tx + 4, ty + TILE_SIZE - 6, 2, 2)
        ctx.fillRect(tx + TILE_SIZE - 6, ty + TILE_SIZE - 6, 2, 2)
      } else if (st.empty) {
        ctx.strokeStyle = 'rgba(154,145,124,0.5)'
        ctx.beginPath()
        ctx.moveTo(tx + 10, ty + 10)
        ctx.lineTo(tx + TILE_SIZE - 10, ty + TILE_SIZE - 10)
        ctx.moveTo(tx + TILE_SIZE - 10, ty + 10)
        ctx.lineTo(tx + 10, ty + TILE_SIZE - 10)
        ctx.stroke()
      } else if (g.eggRevealed && i === g.eggTile) {
        // the huevo — pale, speckled, faintly pulsing
        const pul = 0.75 + Math.sin(time * 5) * 0.18
        ctx.fillStyle = 'rgba(159,255,208,0.12)'
        ctx.beginPath()
        ctx.arc(t.x, t.y, 22 * pul, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ded8c2'
        ctx.beginPath()
        ctx.ellipse(t.x, t.y, 11, 14, 0.3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(120,110,90,0.6)'
        ctx.fillRect(t.x - 4, t.y - 6, 2, 2)
        ctx.fillRect(t.x + 3, t.y - 1, 2, 2)
        ctx.fillRect(t.x - 1, t.y + 6, 2, 2)
      }
    }

    // cracks (+ telegraph rattle, hidden if the house has gone dark and far from the candle)
    for (let i = 0; i < CRACKS.length; i++) {
      const crk = CRACKS[i]
      const tele = g.telegraph.active && g.telegraph.crack === i
      let showTele = tele
      if (tele && g.dark) {
        const dx = crk.x - g.player.x
        const dy = crk.y - g.player.y
        showTele = dx * dx + dy * dy < 95 * 95
      }
      ctx.lineWidth = 3
      ctx.strokeStyle = '#030202'
      drawCrack(ctx, crk, showTele ? 1.6 : 0)
      ctx.lineWidth = 1
      ctx.strokeStyle = showTele
        ? 'rgba(159,255,208,' + (0.25 + Math.sin(time * 22) * 0.15).toFixed(2) + ')'
        : 'rgba(60,46,28,0.8)'
      drawCrack(ctx, crk, showTele ? 1.6 : 0)
      if (g.cracks[i].boarded) {
        ctx.save()
        ctx.translate(crk.x, crk.y)
        ctx.rotate(0.16)
        ctx.fillStyle = '#3a2c18'
        ctx.fillRect(-26, -7, 52, 14)
        ctx.strokeStyle = 'rgba(232,220,192,0.45)'
        ctx.strokeRect(-25.5, -6.5, 51, 13)
        ctx.fillStyle = 'rgba(232,220,192,0.55)'
        ctx.fillRect(-20, -1, 2, 2)
        ctx.fillRect(18, -1, 2, 2)
        ctx.restore()
      }
    }

    // embers rise from lit braziers (only when sim time has advanced)
    if (time - emberT >= 0.24) {
      emberT = time
      for (let i = 0; i < BRAZIERS.length; i++) {
        if (g.braziers[i] > 0 && Math.random() < 0.8) ember(BRAZIERS[i].x, BRAZIERS[i].y)
      }
    }

    // braziers — shaded iron bowls on three legs, glowing coal beds
    for (let i = 0; i < BRAZIERS.length; i++) {
      const br = BRAZIERS[i]
      const fuel = g.braziers[i]
      // ground shadow + legs
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(br.x + 2, br.y + 4, BRAZIER_RADIUS + 2, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#0d0a06'
      ctx.lineWidth = 2.5
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3 + 0.5
        ctx.beginPath()
        ctx.moveTo(br.x + Math.cos(a) * (BRAZIER_RADIUS - 2), br.y + Math.sin(a) * (BRAZIER_RADIUS - 2))
        ctx.lineTo(br.x + Math.cos(a) * (BRAZIER_RADIUS + 3), br.y + Math.sin(a) * (BRAZIER_RADIUS + 3) + 4)
        ctx.stroke()
      }
      // bowl
      ctx.fillStyle = bowlGrads[i]
      ctx.strokeStyle = 'rgba(232,220,192,0.5)'
      ctx.lineWidth = 1.5
      circle(ctx, br.x, br.y, BRAZIER_RADIUS, true)
      ctx.lineWidth = 1
      circle(ctx, br.x, br.y, BRAZIER_RADIUS - 4, false)
      if (fuel > 0) {
        const f = 0.4 + fuel * 0.6
        const flick = 1 + Math.sin(time * 13 + i * 9) * 0.18
        // coal bed under the flame
        ctx.fillStyle = 'rgba(160,50,20,' + (0.5 * f).toFixed(2) + ')'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y + 2, 9, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,120,50,' + (0.30 + Math.sin(time * 7 + i * 3) * 0.12).toFixed(2) + ')'
        ctx.fillRect(br.x - 5, br.y + 1, 2.5, 2)
        ctx.fillRect(br.x + 3, br.y + 3, 2.5, 2)
        ctx.fillRect(br.x - 1, br.y + 4, 2, 1.5)
        ctx.fillStyle = 'rgba(255,150,60,' + (0.55 * f).toFixed(2) + ')'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y - 3, 7 * f * flick, 11 * f * flick, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,230,160,' + (0.7 * f).toFixed(2) + ')'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y - 1, 3.4 * f, 5.5 * f * flick, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // cold ash mound
        ctx.fillStyle = 'rgba(110,104,96,0.30)'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y + 1, 7, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(140,134,124,0.22)'
        circle2(ctx, br.x - 2, br.y - 1, 2.4)
        circle2(ctx, br.x + 3, br.y, 1.8)
      }
      // fuel ring
      if (fuel > 0 && fuel < 0.999) {
        ctx.strokeStyle = fuel < 0.25 ? 'rgba(220,90,60,0.8)' : 'rgba(232,220,192,0.45)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(br.x, br.y, BRAZIER_RADIUS + 5, -Math.PI / 2, -Math.PI / 2 + fuel * Math.PI * 2)
        ctx.stroke()
      }
    }

    // sleepers — wool mounds breathing under the blankets
    for (let i = 0; i < SLEEPERS.length; i++) {
      const s = SLEEPERS[i]
      const st = g.sleepers[i]
      const baby = i === 2 // la guagua sleeps small and quick
      const hr = baby ? 6.5 : 9
      const breath = st.lost ? 0 : Math.sin(time * (baby ? 2.3 : 1.4) + i * 2.1) * 0.5 + 0.5
      ctx.save()
      ctx.translate(s.x, s.y)
      if (st.lost) ctx.globalAlpha = 0.35
      // body under blanket (chest rises with breath) + knees bump
      ctx.fillStyle = st.lost ? '#262b28' : '#2e3a33'
      ctx.beginPath()
      ctx.ellipse(-26, 8, baby ? 24 : 34, (baby ? 11 : 15) + breath * 1.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(baby ? -34 : -42, 5, baby ? 9 : 12, baby ? 7 : 9, 0, 0, Math.PI * 2)
      ctx.fill()
      // moonlit crest of the mound + heavy shadow where it meets the bed
      ctx.fillStyle = st.lost ? 'rgba(160,170,160,0.05)' : 'rgba(190,210,190,0.10)'
      ctx.beginPath()
      ctx.ellipse(-26, 1.5 - breath, baby ? 17 : 24, 5 + breath, -0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.26)'
      ctx.beginPath()
      ctx.ellipse(-26, (baby ? 14 : 18) + breath * 0.6, baby ? 20 : 28, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      // blanket folds: one sliding with the breath, one tucked at the chin
      ctx.strokeStyle = 'rgba(10,14,11,0.5)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(-6, -1 - breath * 1.4)
      ctx.quadraticCurveTo(-14, 5, -10, 13)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(214,196,160,0.20)'
      ctx.beginPath()
      ctx.moveTo(3, -4 - breath)
      ctx.quadraticCurveTo(5, 2, 2, 9)
      ctx.stroke()
      // head on the pillow — shaded skin, brazier warmth grazing the brow
      ctx.fillStyle = st.lost ? '#8a8474' : '#cdbf9d'
      ctx.beginPath()
      ctx.arc(14, 0, hr, 0, Math.PI * 2)
      ctx.fill()
      if (!st.lost) {
        ctx.fillStyle = 'rgba(70,50,30,0.26)' // cheek turned from the light
        ctx.beginPath()
        ctx.arc(14, 0, hr, Math.PI * 0.55, Math.PI * 1.5)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,190,120,0.12)'
        ctx.beginPath()
        ctx.arc(15.5, -1.5, hr * 0.66, -Math.PI * 0.6, Math.PI * 0.3)
        ctx.fill()
      }
      // hair against the pillow — each sleeper their own
      ctx.fillStyle = st.lost ? '#3c382e' : i === 1 ? '#1c130a' : i === 0 ? '#332412' : '#4a3520'
      ctx.beginPath()
      if (baby) ctx.arc(14, -hr * 0.5, hr * 0.62, Math.PI * 0.85, Math.PI * 2.1)
      else ctx.arc(13, -hr * 0.28, hr * 0.92, Math.PI * 0.7, Math.PI * 1.96)
      ctx.fill()
      // closed eye — barely there
      ctx.strokeStyle = 'rgba(60,44,26,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(15.5, -1.2)
      ctx.lineTo(15.5 + hr * 0.32, -1)
      ctx.stroke()
      ctx.restore()
      // breath wisp
      if (!st.lost && breath > 0.82) {
        ctx.fillStyle = 'rgba(232,220,192,0.18)'
        circle2(ctx, s.x + 22, s.y - 8 - breath * 4, 2.4)
      }
      // drain meter
      if (!st.lost && st.drain > 0.02) {
        ctx.strokeStyle = 'rgba(220,90,60,0.85)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(s.x, s.y - 24, 11, -Math.PI / 2, -Math.PI / 2 + (st.drain / DRINK_TIME) * Math.PI * 2)
        ctx.stroke()
      }
    }

    // the basilisco — half culebra, half rooster, the color of drowned bone
    if (g.bas.visible) {
      const tr = g.bas.trail
      const N = g.bas.trailN
      const hd = g.bas.heading
      // ground shadow under head and mid-body
      ctx.fillStyle = 'rgba(0,0,0,0.30)'
      ctx.beginPath()
      ctx.ellipse(tr[0], tr[1] + 7, 9, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
      const mid = (N >> 1) * 2
      ctx.beginPath()
      ctx.ellipse(tr[mid], tr[mid + 1] + 5, 7, 2.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineCap = 'round'
      // tail tapers to a whip past the last joint
      const lx = tr[(N - 1) * 2]
      const ly = tr[(N - 1) * 2 + 1]
      let tdx = lx - tr[(N - 2) * 2]
      let tdy = ly - tr[(N - 2) * 2 + 1]
      const td = Math.hypot(tdx, tdy) || 1
      ctx.strokeStyle = '#9a9078'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx + (tdx / td) * 6, ly + (tdy / td) * 6)
      ctx.stroke()
      // body: contact dark beneath, bone-pale base, firelit rim on the spine,
      // and a dark scale band at every other joint
      for (let i = N - 1; i > 0; i--) {
        const w = 3 + (1 - i / N) * 7
        const x0 = tr[i * 2]
        const y0 = tr[i * 2 + 1]
        const x1 = tr[(i - 1) * 2]
        const y1 = tr[(i - 1) * 2 + 1]
        ctx.lineWidth = w + 2.2
        ctx.strokeStyle = 'rgba(8,6,3,0.5)'
        ctx.beginPath()
        ctx.moveTo(x0, y0 + 1.2)
        ctx.lineTo(x1, y1 + 1.2)
        ctx.stroke()
        ctx.lineWidth = w
        ctx.strokeStyle = i % 2 ? '#cfc8b0' : '#b6ae96'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
        ctx.lineWidth = Math.max(1, w * 0.34)
        ctx.strokeStyle = 'rgba(255,231,185,0.32)'
        ctx.beginPath()
        ctx.moveTo(x0, y0 - w * 0.32)
        ctx.lineTo(x1, y1 - w * 0.32)
        ctx.stroke()
        if (!(i % 2)) {
          let bdx = x1 - x0
          let bdy = y1 - y0
          const bl = Math.hypot(bdx, bdy) || 1
          bdx /= bl
          bdy /= bl
          ctx.lineWidth = 1.2
          ctx.strokeStyle = 'rgba(74,62,40,0.55)'
          ctx.beginPath()
          ctx.moveTo(x0 - bdy * w * 0.42, y0 + bdx * w * 0.42)
          ctx.lineTo(x0 + bdy * w * 0.42, y0 - bdx * w * 0.42)
          ctx.stroke()
        }
      }
      ctx.lineCap = 'butt'
      const hx = tr[0]
      const hy = tr[1]
      // hackle feathers where the culebra becomes gallo, ruffling as it moves
      ctx.fillStyle = '#a89f86'
      for (let k = -1; k <= 1; k++) {
        const a = hd + Math.PI + k * 0.55
        const wob = Math.sin(time * 7 + k * 2) * 0.7
        ctx.beginPath()
        ctx.moveTo(hx + Math.cos(hd + Math.PI / 2) * 2 * k, hy + Math.sin(hd + Math.PI / 2) * 2 * k)
        ctx.lineTo(hx + Math.cos(a + 0.2) * 9, hy + Math.sin(a + 0.2) * 9 + wob)
        ctx.lineTo(hx + Math.cos(a - 0.2) * 11.5, hy + Math.sin(a - 0.2) * 11.5 + wob)
        ctx.closePath()
        ctx.fill()
      }
      // skull, shaded like wet bone, turned along its heading
      ctx.save()
      ctx.translate(hx, hy)
      ctx.rotate(hd)
      ctx.fillStyle = '#0c0a06'
      ctx.beginPath()
      ctx.ellipse(0.4, 1, 8.2, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ded6bc'
      ctx.beginPath()
      ctx.ellipse(0, 0, 8, 6.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(70,56,34,0.30)' // jaw in shadow
      ctx.beginPath()
      ctx.ellipse(1, 2.4, 6.2, 3, 0, 0, Math.PI)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,238,200,0.40)' // brow catch-light
      ctx.beginPath()
      ctx.ellipse(-1, -3, 4.6, 1.7, -0.2, 0, Math.PI * 2)
      ctx.fill()
      // beak: two horn mandibles, parted while it drinks
      const gape = g.bas.state === 'drinking' ? 0.16 + Math.sin(time * 10) * 0.05 : 0.05
      ctx.fillStyle = '#c8b070'
      ctx.beginPath()
      ctx.moveTo(6, -2.6)
      ctx.lineTo(15, -gape * 14)
      ctx.lineTo(6.5, 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#94804a'
      ctx.beginPath()
      ctx.moveTo(6, 2.8)
      ctx.lineTo(13.5, gape * 14 + 1.5)
      ctx.lineTo(6.5, 0.8)
      ctx.closePath()
      ctx.fill()
      // forked tongue flicks out between gulps — 3-frame micro-animation
      const tf = (time * 1.4) % 1
      if (tf < 0.16 && g.bas.state !== 'drinking') {
        const ext = tf < 0.06 ? 6 : tf < 0.11 ? 10 : 5
        ctx.strokeStyle = '#7e2c22'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(12, 0.4)
        ctx.lineTo(12 + ext, 0.2)
        ctx.moveTo(12 + ext, 0.2)
        ctx.lineTo(12 + ext + 2.4, -1.4)
        ctx.moveTo(12 + ext, 0.2)
        ctx.lineTo(12 + ext + 2.2, 1.8)
        ctx.stroke()
      }
      ctx.restore()
      // cresta de gallo — sickly comb jiggling in 3 frames, blood at the tips
      const cf = ((time * 6) | 0) % 3
      const cj = cf === 0 ? 0 : cf === 1 ? 0.8 : -0.6
      ctx.fillStyle = '#7e3028'
      ctx.beginPath()
      ctx.moveTo(hx - 5, hy - 4.5)
      ctx.lineTo(hx - 3, hy - 11 + cj)
      ctx.lineTo(hx - 0.5, hy - 5.5)
      ctx.lineTo(hx + 1, hy - 12 - cj)
      ctx.lineTo(hx + 3.5, hy - 5.5)
      ctx.lineTo(hx + 5, hy - 10 + cj)
      ctx.lineTo(hx + 6, hy - 4.5)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#c05540'
      circle2(ctx, hx - 3, hy - 10.4 + cj, 1.1)
      circle2(ctx, hx + 1, hy - 11.4 - cj, 1.2)
      circle2(ctx, hx + 5, hy - 9.4 + cj, 1)
      // wattle swinging under the beak
      ctx.fillStyle = '#8e342a'
      ctx.beginPath()
      ctx.ellipse(
        hx + Math.cos(hd) * 5 + Math.sin(time * 9) * 0.5,
        hy + Math.sin(hd) * 5 + 5,
        1.6, 2.6, 0, 0, Math.PI * 2
      )
      ctx.fill()
      // drinking: breath thread from sleeper to mouth
      if (g.bas.state === 'drinking' && g.bas.targetSleeper >= 0) {
        const sl = SLEEPERS[g.bas.targetSleeper]
        ctx.strokeStyle = 'rgba(232,220,192,' + (0.25 + Math.sin(time * 9) * 0.12).toFixed(2) + ')'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(sl.x + 14, sl.y)
        ctx.quadraticCurveTo((sl.x + hx) / 2, Math.min(sl.y, hy) - 18, hx, hy)
        ctx.stroke()
      }
    }

    // player — the eldest child: woven poncho, candle held out to the right
    const pl = g.player
    const pdist = pPrevX < 0 ? 0 : Math.hypot(pl.x - pPrevX, pl.y - pPrevY)
    pPrevX = pl.x
    pPrevY = pl.y
    walkPhase += Math.min(pdist, 6) * 0.22
    pMoving += ((pdist > 0.05 ? 1 : 0) - pMoving) * 0.18
    const bobY = Math.sin(walkPhase) * 1.1 * pMoving
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.beginPath()
    ctx.ellipse(pl.x, pl.y + 13, 9.5, 3.6, 0, 0, Math.PI * 2)
    ctx.fill()
    // feet peek under the hem, alternating while walking
    const stepO = Math.sin(walkPhase) * 1.2 * pMoving
    ctx.fillStyle = '#17120c'
    ctx.beginPath()
    ctx.ellipse(pl.x - 3.4, pl.y + 11.6 + stepO, 2.2, 1.5, 0, 0, Math.PI * 2)
    ctx.ellipse(pl.x + 3.4, pl.y + 11.6 - stepO, 2.2, 1.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(pl.x, pl.y + bobY)
    ctx.rotate(Math.sin(walkPhase * 0.5) * 0.05 * pMoving + (pl.stun > 0 ? Math.sin(time * 30) * 0.08 : 0))
    // poncho: woven wool, hem swaying a half-beat behind the step
    const hem = Math.sin(walkPhase - 1.2) * 0.9 * pMoving
    ctx.beginPath()
    ctx.moveTo(-9, -3)
    ctx.quadraticCurveTo(-10.5, 6, -7 + hem, 12)
    ctx.quadraticCurveTo(0, 14.5, 7 + hem, 12)
    ctx.quadraticCurveTo(10.5, 6, 9, -3)
    ctx.quadraticCurveTo(0, -9, -9, -3)
    ctx.closePath()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = ponchoPat
    ctx.fillRect(-12, -10, 24, 26)
    ctx.fillStyle = 'rgba(255,180,100,0.14)' // candle side of the wool
    ctx.fillRect(2, -10, 10, 26)
    ctx.fillStyle = 'rgba(0,0,0,0.22)' // far side falls away
    ctx.fillRect(-12, -10, 5, 26)
    ctx.restore()
    ctx.strokeStyle = 'rgba(10,12,9,0.7)'
    ctx.lineWidth = 1
    ctx.stroke()
    // fringe at the hem
    ctx.strokeStyle = 'rgba(214,196,160,0.30)'
    for (let k = -3; k <= 3; k++) {
      const fx = k * 2.4 + hem
      ctx.beginPath()
      ctx.moveTo(fx, 12.4 - Math.abs(k) * 0.55)
      ctx.lineTo(fx + hem * 0.5, 14.6 - Math.abs(k) * 0.55)
      ctx.stroke()
    }
    // right arm holds the candle out
    ctx.strokeStyle = '#37463e'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(4.5, -2)
    ctx.lineTo(8.5, -3.6)
    ctx.stroke()
    // head: skin lit from the candle side, dark bowl of hair
    ctx.fillStyle = '#cdbf9d'
    circle2(ctx, 0, -8, 6)
    ctx.fillStyle = 'rgba(70,50,30,0.28)'
    ctx.beginPath()
    ctx.arc(0, -8, 6, Math.PI * 0.55, Math.PI * 1.45)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,200,130,0.28)'
    ctx.beginPath()
    ctx.arc(1.6, -8.4, 4.4, -Math.PI * 0.45, Math.PI * 0.45)
    ctx.fill()
    ctx.fillStyle = '#241a10'
    ctx.beginPath()
    ctx.arc(0, -9.2, 6.1, Math.PI * 0.92, Math.PI * 2.08)
    ctx.fill()
    // candle: brass dish, tallow stick, breathing flame with a hot core
    ctx.fillStyle = 'rgba(120,96,50,0.9)'
    ctx.beginPath()
    ctx.ellipse(9.5, 3, 3.2, 1.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8dcc0'
    ctx.fillRect(8.2, -4, 2.6, 7)
    ctx.fillStyle = 'rgba(180,150,110,0.5)'
    ctx.fillRect(10, -4, 0.8, 7)
    const fl = 0.8 + Math.sin(time * 17) * 0.2
    ctx.fillStyle = 'rgba(255,160,70,' + (fl * 0.5).toFixed(2) + ')'
    circle2(ctx, 9.5, -7, 3.6)
    ctx.fillStyle = 'rgba(255,210,120,' + fl.toFixed(2) + ')'
    ctx.beginPath()
    ctx.ellipse(9.5, -7, 1.7, 2.6 * fl, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,250,220,0.9)'
    circle2(ctx, 9.5, -6.4, 0.8)
    ctx.restore()
    // pry / crush progress ring
    if (pl.holdT > 0) {
      ctx.strokeStyle = pl.holdKind === 'crush' ? GLOW : 'rgba(232,220,192,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(pl.x, pl.y, 18, -Math.PI / 2, -Math.PI / 2 + (pl.holdT / PRY_TIME) * Math.PI * 2)
      ctx.stroke()
    }
    if (pl.stun > 0) {
      ctx.strokeStyle = 'rgba(220,90,60,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pl.x, pl.y, 16, -Math.PI / 2, -Math.PI / 2 + (pl.stun / STUN_TIME) * Math.PI * 2)
      ctx.stroke()
    }

    // particles
    for (let i = 0; i < P_N; i++) {
      const p = parts[i]
      if (p.life <= 0) continue
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.85
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1

    // darkness layer
    const ambient = g.dark ? 0.92 : 0.66 - 0.06 * (g.braziers[0] > 0 ? 1 : 0) - 0.06 * (g.braziers[1] > 0 ? 1 : 0)
    dctx.setTransform(1, 0, 0, 1, 0, 0)
    dctx.globalCompositeOperation = 'source-over'
    dctx.clearRect(0, 0, W, H)
    dctx.fillStyle = 'rgba(2,5,9,' + ambient.toFixed(2) + ')'
    dctx.fillRect(0, 0, W, H)
    dctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < BRAZIERS.length; i++) {
      if (g.braziers[i] <= 0) continue
      const br = BRAZIERS[i]
      const f = 0.55 + g.braziers[i] * 0.45 + Math.sin(time * 11 + i * 7) * 0.04
      dctx.setTransform(f, 0, 0, f, br.x, br.y)
      dctx.fillStyle = brazierLight
      dctx.fillRect(-250, -250, 500, 500)
    }
    const cf = 1 + Math.sin(time * 15) * 0.05
    dctx.setTransform(cf, 0, 0, cf, pl.x, pl.y)
    dctx.fillStyle = candleLight
    dctx.fillRect(-110, -110, 220, 220)
    dctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(dark, 0, 0)

    // warm firelight tint inside the lit pools (overlay keeps it restrained)
    ctx.globalCompositeOperation = 'overlay'
    for (let i = 0; i < BRAZIERS.length; i++) {
      if (g.braziers[i] <= 0) continue
      const br = BRAZIERS[i]
      const f = 0.55 + g.braziers[i] * 0.45 + Math.sin(time * 11 + i * 7) * 0.04
      const r = 185 * f
      ctx.globalAlpha = 0.5
      ctx.drawImage(warmGlow, br.x - r, br.y - r, r * 2, r * 2)
    }
    const cr = 72 * (1 + Math.sin(time * 15) * 0.05)
    ctx.globalAlpha = 0.4
    ctx.drawImage(warmGlow, pl.x - cr, pl.y - cr, cr * 2, cr * 2)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // eyes glow — drawn over the darkness so they read even with both braziers out
    if (g.bas.visible) {
      const hx = g.bas.trail[0]
      const hy = g.bas.trail[1]
      const e1x = hx + Math.cos(g.bas.heading - 0.6) * 4.5
      const e1y = hy + Math.sin(g.bas.heading - 0.6) * 4.5
      const e2x = hx + Math.cos(g.bas.heading + 0.6) * 4.5
      const e2y = hy + Math.sin(g.bas.heading + 0.6) * 4.5
      ctx.fillStyle = GLOW
      circle2(ctx, e1x, e1y, 1.6)
      circle2(ctx, e2x, e2y, 1.6)
      // serpent slit pupils across the glow
      const sx2 = Math.cos(g.bas.heading + Math.PI / 2) * 1.3
      const sy2 = Math.sin(g.bas.heading + Math.PI / 2) * 1.3
      ctx.strokeStyle = 'rgba(10,8,4,0.85)'
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(e1x - sx2, e1y - sy2)
      ctx.lineTo(e1x + sx2, e1y + sy2)
      ctx.moveTo(e2x - sx2, e2y - sy2)
      ctx.lineTo(e2x + sx2, e2y + sy2)
      ctx.stroke()
    }

    // squeal ripples — arcs aimed toward the egg, over the darkness (the core win hint)
    for (let i = 0; i < RIP_N; i++) {
      const r = ripples[i]
      if (!r.active) continue
      const a = 1 - r.age / 2.2
      ctx.strokeStyle = 'rgba(159,255,208,' + (a * 0.55).toFixed(2) + ')'
      for (let k = 0; k < 3; k++) {
        const rad = 18 + r.age * 90 + k * 16
        ctx.lineWidth = 2 - k * 0.5
        ctx.beginPath()
        ctx.arc(r.x, r.y, rad, r.dir - 0.45, r.dir + 0.45)
        ctx.stroke()
      }
    }

    // rain over everything — two depths for parallax
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(170,200,210,0.11)'
    ctx.beginPath()
    for (let i = 0; i < 60; i++) {
      const rx = rain[i * 3]
      const ry = rain[i * 3 + 1]
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx - 2.2, ry + 10)
    }
    ctx.stroke()
    ctx.lineWidth = 1.3
    ctx.strokeStyle = 'rgba(180,210,218,0.20)'
    ctx.beginPath()
    for (let i = 60; i < RAIN_N; i++) {
      const rx = rain[i * 3]
      const ry = rain[i * 3 + 1]
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx - 3.4, ry + 16)
    }
    ctx.stroke()

    // restrained full-screen pulse (win sting / sleeper lost)
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.16
      ctx.fillStyle = flashColor
      ctx.fillRect(-40, -40, W + 80, H + 80)
      ctx.globalAlpha = 1
    }
  }

  function circle2(c, x, y, r) {
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }

  return { draw, update, burst, ripple, shake, pulse }
}
