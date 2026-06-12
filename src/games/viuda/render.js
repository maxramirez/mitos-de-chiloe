// render.js — LA VIUDA · canvas2d painter.
// A side-view coast road at night, painted in layers: dithered sky tile with
// moon (parallax 0.04), far headlands on the sea (0.08) over a drifting
// moon-glint strip, mid pasture silhouettes (0.4), the world-space road with
// wheel ruts + procedural dirt grain, fence posts and stones hashed from
// world position, and a fast foreground grass fringe (1.5). The ox-cart is
// the actor: gait cycles per pace, rocking bed with wood grain, swinging
// lantern. The lantern light is the visual core — a warm pool with soft
// penumbra painted in a 'screen' composite pass, guttering when SHE is near;
// la Viuda herself is a held-breath silhouette visible only inside the light.
// draw() is allocation-free: tiles, patterns, glow sprites and gradients are
// built once (gradients rebuilt on resize); dynamic alphas go through
// ctx.globalAlpha against constant color strings.
import { ROAD_LEN, VILLAGE_X, CRUCES } from './level.js'

const VIEW_H = 11 // meters of world visible vertically
const GROUND_F = 0.74 // ground line as a fraction of screen height
const ANCHOR_F = 0.38 // the cart sits at this fraction from the left
const LAYER_W = 1536
const LAYER_H = 1024
const WHEEL_R = 0.58

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// deterministic hash -> 0..1 for world-indexed decor (posts, stones, tufts)
function h1(i) {
  i |= 0
  i = Math.imul(i ^ (i >>> 15), 2246822519)
  i = Math.imul(i ^ (i >>> 13), 3266489917)
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296
}

// ---------- prebuilt tiles ----------
function makeSky() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = LAYER_H
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, LAYER_H)
  grad.addColorStop(0, '#04070f')
  grad.addColorStop(0.5, '#081120')
  grad.addColorStop(0.82, '#0b1623')
  grad.addColorStop(1, '#0c1824')
  g.fillStyle = grad
  g.fillRect(0, 0, LAYER_W, LAYER_H)
  const rng = mulberry32(19)
  // dither — fine speckle so the gradient never bands
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.015 + rng() * 0.03
    g.fillStyle = rng() < 0.5 ? '#000000' : '#21303f'
    g.fillRect(rng() * LAYER_W, rng() * LAYER_H, 1, 1)
  }
  // stars
  for (let i = 0; i < 120; i++) {
    const x = rng() * LAYER_W
    const y = rng() * LAYER_H * 0.6
    g.globalAlpha = 0.1 + rng() * 0.38
    g.fillStyle = '#cdd6c8'
    g.fillRect(x, y, rng() < 0.18 ? 2 : 1, 1)
  }
  g.globalAlpha = 1
  // thin slate cloud bands
  g.fillStyle = 'rgba(8,15,24,0.6)'
  for (let i = 0; i < 6; i++) {
    const y = 110 + rng() * 420
    const w = 320 + rng() * 620
    const x = rng() * LAYER_W
    g.beginPath()
    g.ellipse(x, y, w / 2, 8 + rng() * 13, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

// far headlands sitting on the horizon (transparent above)
function makeFar() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = 200
  const g = c.getContext('2d')
  const rng = mulberry32(31)
  g.fillStyle = '#0a1119'
  g.beginPath()
  g.moveTo(0, 200)
  let y = 120 + rng() * 40
  for (let x = 0; x <= LAYER_W; x += 96) {
    y += (rng() - 0.5) * 50
    if (y < 70) y = 70
    if (y > 170) y = 170
    g.quadraticCurveTo(x - 48, y + (rng() - 0.5) * 24, x, y)
  }
  g.lineTo(LAYER_W, 200)
  g.closePath()
  g.fill()
  // a couple of pinprick farm lights on the headlands
  for (let i = 0; i < 2; i++) {
    g.globalAlpha = 0.18 + rng() * 0.18
    g.fillStyle = '#ffd9a0'
    g.fillRect(rng() * LAYER_W, 130 + rng() * 40, 1.5, 1.5)
  }
  g.globalAlpha = 1
  return c
}

// the moon — drawn once, in screen space (it is at infinity)
function makeMoon() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')
  const halo = g.createRadialGradient(256, 256, 8, 256, 256, 250)
  halo.addColorStop(0, 'rgba(208,222,200,0.30)')
  halo.addColorStop(0.4, 'rgba(178,205,188,0.10)')
  halo.addColorStop(1, 'rgba(178,205,188,0)')
  g.fillStyle = halo
  g.fillRect(0, 0, 512, 512)
  g.fillStyle = '#d3ddc6'
  g.beginPath()
  g.arc(256, 256, 44, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(140,158,138,0.35)' // craters
  g.beginPath()
  g.arc(243, 249, 8, 0, Math.PI * 2)
  g.arc(267, 269, 6, 0, Math.PI * 2)
  g.arc(271, 239, 4, 0, Math.PI * 2)
  g.fill()
  return c
}

// mid pasture band — rolling dark fields with shrub silhouettes
function makeMid() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = 420
  const g = c.getContext('2d')
  const rng = mulberry32(47)
  g.fillStyle = '#091018'
  g.beginPath()
  g.moveTo(0, 420)
  let y = 130 + rng() * 60
  for (let x = 0; x <= LAYER_W; x += 64) {
    y += (rng() - 0.5) * 44
    if (y < 60) y = 60
    if (y > 220) y = 220
    g.quadraticCurveTo(x - 32, y + (rng() - 0.5) * 18, x, y)
  }
  g.lineTo(LAYER_W, 420)
  g.closePath()
  g.fill()
  // shrubs and wind-bent trees on the crest
  g.fillStyle = '#04080c'
  for (let i = 0; i < 26; i++) {
    const x = rng() * LAYER_W
    const base = 110 + rng() * 120
    const h = 26 + rng() * 60
    const w = 22 + rng() * 46
    g.beginPath()
    g.ellipse(x, base - h * 0.55, w / 2, h * 0.42, (rng() - 0.5) * 0.4, 0, Math.PI * 2)
    g.fill()
    g.fillRect(x - 2, base - h * 0.5, 4, h * 0.5)
  }
  return c
}

// foreground grass fringe — blades passing fast, bottom strip
function makeFg() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = 220
  const g = c.getContext('2d')
  const rng = mulberry32(83)
  g.strokeStyle = '#020507'
  for (let i = 0; i < 420; i++) {
    const x = rng() * LAYER_W
    const h = 40 + rng() * 150
    const lean = (rng() - 0.5) * 50
    g.lineWidth = 2 + rng() * 3.5
    g.beginPath()
    g.moveTo(x, 220)
    g.quadraticCurveTo(x + lean * 0.3, 220 - h * 0.6, x + lean, 220 - h)
    g.stroke()
  }
  return c
}

// dirt grain for the road surface — speckle, grit, faint long streaks
function makeRoadPattern() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  const rng = mulberry32(7411)
  g.lineWidth = 1
  for (let i = 0; i < 22; i++) {
    const y = rng() * 256
    g.strokeStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.08).toFixed(3) + ')'
    g.beginPath()
    g.moveTo(0, y)
    g.quadraticCurveTo(128, y + (rng() - 0.5) * 7, 256, y)
    g.stroke()
  }
  for (let i = 0; i < 380; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (0.06 + rng() * 0.13).toFixed(3) + ')'
    g.fillRect(rng() * 254, rng() * 254, 1 + rng() * 2, 1 + rng() * 1.5)
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = 'rgba(214,200,170,' + (0.025 + rng() * 0.045).toFixed(3) + ')'
    g.fillRect(rng() * 254, rng() * 254, 1, 1)
  }
  return c
}

// horizontal wood grain for the cart's planks
function makeGrainPattern() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  const rng = mulberry32(7717)
  for (let y = 2; y < 62; y += 3 + rng() * 5) {
    const a = 0.05 + rng() * 0.12
    g.strokeStyle =
      rng() < 0.22
        ? 'rgba(232,220,192,' + (a * 0.5).toFixed(3) + ')'
        : 'rgba(0,0,0,' + a.toFixed(3) + ')'
    g.lineWidth = 0.7 + rng() * 1.1
    g.beginPath()
    g.moveTo(0, y)
    g.quadraticCurveTo(64 + rng() * 128, y + (rng() - 0.5) * 4, 256, y)
    g.stroke()
  }
  return c
}

// fine cloth weave for the driver's poncho
function makeWeave(seed, dark, light) {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const g = c.getContext('2d')
  const rng = mulberry32(seed)
  g.lineWidth = 1
  g.strokeStyle = dark
  for (let y = 0; y < 32; y += 3) {
    g.beginPath()
    g.moveTo(0, y + 0.5)
    g.lineTo(32, y + 0.5)
    g.stroke()
  }
  g.strokeStyle = light
  for (let x = 0; x < 32; x += 4) {
    g.beginPath()
    g.moveTo(x + 0.5, 0)
    g.lineTo(x + 0.5, 32)
    g.stroke()
  }
  for (let i = 0; i < 24; i++) {
    g.fillStyle = rng() < 0.5 ? dark : light
    g.fillRect((rng() * 31) | 0, (rng() * 31) | 0, 2, 1)
  }
  return c
}

// strip of moon-glints for the sea (drawn drifting, tiled)
function makeSparkleStrip() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 44
  const g = c.getContext('2d')
  const rng = mulberry32(2024)
  for (let i = 0; i < 80; i++) {
    const y = Math.pow(rng(), 1.6) * 42
    const w = 2 + rng() * 9
    const a = (0.05 + rng() * 0.12) * (1 - y / 56)
    g.fillStyle =
      rng() < 0.35
        ? 'rgba(159,255,208,' + a.toFixed(3) + ')'
        : 'rgba(205,218,200,' + a.toFixed(3) + ')'
    const x = rng() * 512
    g.fillRect(x, y, w, 1)
    if (x + w > 512) g.fillRect(x - 512, y, w, 1)
  }
  return c
}

function makeMistSprite() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(128, 48, 4, 128, 48, 120)
  grad.addColorStop(0, 'rgba(168,196,188,0.5)')
  grad.addColorStop(0.5, 'rgba(150,178,172,0.2)')
  grad.addColorStop(1, 'rgba(150,178,172,0)')
  g.translate(128, 48)
  g.scale(1, 0.36)
  g.translate(-128, -48)
  g.fillStyle = grad
  g.fillRect(-120, -240, 500, 580)
  return c
}

function makeGlow(r, gC, b) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64)
  grad.addColorStop(0, 'rgba(' + r + ',' + gC + ',' + b + ',0.55)')
  grad.addColorStop(0.35, 'rgba(' + r + ',' + gC + ',' + b + ',0.18)')
  grad.addColorStop(1, 'rgba(' + r + ',' + gC + ',' + b + ',0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return c
}

// the village at the road's end — house silhouettes with warm windows
const HOUSES = [
  { dx: 3, w: 4.6, h: 2.8, church: false, wins: [[1.1, 1.1], [3.2, 1.0]] },
  { dx: 9.5, w: 3.8, h: 2.4, church: false, wins: [[1.6, 0.95]] },
  { dx: 15.5, w: 5.4, h: 3.1, church: false, wins: [[1.3, 1.2], [3.9, 1.05]] },
  { dx: 22.5, w: 4.2, h: 2.6, church: false, wins: [[2.0, 1.0]] },
  { dx: 29, w: 4.6, h: 4.8, church: true, wins: [[2.3, 1.5]] },
]

// twinkling stars drawn live (screen fractions, above the horizon)
const TWINK = []
{
  const rng = mulberry32(606)
  for (let i = 0; i < 10; i++)
    TWINK.push({ fx: rng(), fy: rng() * 0.3, f: 0.6 + rng() * 1.4, p: rng() * 6.283 })
}

// gait phase offsets per leg (back-far, front-far, back-near, front-near)
const WALK_OFF = [0, 0.5, 0.75, 0.25]
const TROT_OFF = [0, 0.5, 0.5, 0]

const FLASH = ['rgba(255,214,150,1)', 'rgba(255,120,80,1)', 'rgba(186,212,255,1)']

// ---------- renderer ----------
export function createRender(canvas, refs) {
  const ctx = canvas.getContext('2d')
  let W = 0
  let H = 0
  let ppm = 50
  let groundY = 0
  let horizonY = 0

  const skyT = makeSky()
  const moonT = makeMoon()
  const farT = makeFar()
  const midT = makeMid()
  const fgT = makeFg()
  const sparkle = makeSparkleStrip()
  const mistSprite = makeMistSprite()
  const glowWarm = makeGlow(255, 198, 130)
  const glowCool = makeGlow(159, 255, 208)
  const glowWindow = makeGlow(255, 176, 92)
  const roadPat = ctx.createPattern(makeRoadPattern(), 'repeat')
  const grainPat = ctx.createPattern(makeGrainPattern(), 'repeat')
  const ponchoWeave = ctx.createPattern(
    makeWeave(515, 'rgba(0,0,0,0.32)', 'rgba(186,200,176,0.10)'),
    'repeat'
  )

  // drifting mists along the road (world-space, pure function of t)
  const mists = []
  {
    const rng = mulberry32(909)
    for (let i = 0; i < 9; i++)
      mists.push({
        x: 60 + rng() * (ROAD_LEN - 60),
        y: 0.5 + rng() * 1.2,
        w: 9 + rng() * 10,
        sp: 0.05 + rng() * 0.12,
        ph: rng() * 6.283,
      })
  }

  // screen-space gradients, rebuilt only on resize
  let seaGrad = null
  let roadGrad = null
  let vergeGrad = null
  let dreadGrad = null

  function resize() {
    W = canvas.width = window.innerWidth
    H = canvas.height = window.innerHeight
    ppm = H / VIEW_H
    groundY = H * GROUND_F
    horizonY = H * 0.36
    seaGrad = ctx.createLinearGradient(0, horizonY, 0, groundY - 2.0 * ppm)
    seaGrad.addColorStop(0, '#0d1c26')
    seaGrad.addColorStop(0.35, '#091420')
    seaGrad.addColorStop(1, '#060d16')
    roadGrad = ctx.createLinearGradient(0, groundY - 0.55 * ppm, 0, groundY + 1.2 * ppm)
    roadGrad.addColorStop(0, '#161a21')
    roadGrad.addColorStop(0.4, '#10141a')
    roadGrad.addColorStop(1, '#0a0d12')
    vergeGrad = ctx.createLinearGradient(0, groundY + 1.2 * ppm, 0, H)
    vergeGrad.addColorStop(0, '#05070b')
    vergeGrad.addColorStop(1, '#020304')
    dreadGrad = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.95)
    dreadGrad.addColorStop(0, 'rgba(6,3,10,0)')
    dreadGrad.addColorStop(0.55, 'rgba(6,3,10,0.25)')
    dreadGrad.addColorStop(1, 'rgba(4,2,8,0.9)')
  }
  window.addEventListener('resize', resize)
  resize()

  // world -> screen (camera + shake applied per frame)
  let cx0 = 0
  let shx = 0
  let shy = 0
  let flameNow = 1
  let lampWX = 0
  let lampSX = 0
  let lampSY = 0

  function sx(wx) {
    return (wx - cx0) * ppm + W * ANCHOR_F + shx
  }
  function sy(wy) {
    return groundY - wy * ppm + shy
  }

  // how lit a world x is by the lantern (0..1) — warm pool + long penumbra
  function lightAt(wx) {
    const d = wx - lampWX
    let v = 0
    if (d >= -7 && d <= 46) v = d < 0 ? 1 + d / 7 : 1 - d / 46
    if (v < 0) v = 0
    return v * v * flameNow
  }

  function drawTile(img, yTop, hPix, par, alpha) {
    const scale = hPix / img.height
    const tw = img.width * scale
    const worldPx = cx0 * ppm * par
    const k0 = Math.floor((worldPx - W * ANCHOR_F) / tw)
    const kEnd = Math.floor((worldPx + W * (1 - ANCHOR_F)) / tw) + 1
    if (alpha !== 1) ctx.globalAlpha = alpha
    for (let k = k0; k <= kEnd; k++) {
      const x = k * tw - worldPx + W * ANCHOR_F
      if (k & 1) {
        ctx.save()
        ctx.translate(x + tw, yTop)
        ctx.scale(-1, 1)
        ctx.drawImage(img, -0.75, 0, tw + 1.5, hPix) // overlap hides the seam
        ctx.restore()
      } else {
        ctx.drawImage(img, x - 0.75, yTop, tw + 1.5, hPix)
      }
    }
    if (alpha !== 1) ctx.globalAlpha = 1
  }

  function drawSea(t) {
    const yTop = horizonY
    const yBot = groundY - 2.0 * ppm
    ctx.fillStyle = seaGrad
    ctx.fillRect(0, yTop, W, yBot - yTop)
    // pale horizon line
    ctx.fillStyle = 'rgba(150,190,175,0.10)'
    ctx.fillRect(0, yTop, W, 1)
    // drifting moon-glint bands (two counter-drifting tiles)
    const base = cx0 * ppm * 0.08
    let xd = -((((base - t * 10) % 512) + 512) % 512)
    ctx.globalAlpha = 0.5
    for (let x = xd; x < W; x += 512) ctx.drawImage(sparkle, x, yTop + 2)
    xd = -((((base + t * 6) % 512) + 512) % 512)
    ctx.globalAlpha = 0.26
    for (let x = xd; x < W; x += 512) ctx.drawImage(sparkle, x, yTop + 14, 512, 30)
    ctx.globalAlpha = 1
  }

  function drawFence() {
    // far-side fence posts with sagging wire, hashed lean per post
    const left = cx0 - (W * ANCHOR_F) / ppm - 2
    const right = cx0 + (W * (1 - ANCHOR_F)) / ppm + 2
    const i0 = Math.floor(left / 13)
    const i1 = Math.ceil(right / 13)
    const baseY = sy(0.62)
    let prevX = 0
    let prevY = 0
    ctx.strokeStyle = '#0c0f12'
    ctx.lineWidth = Math.max(2, ppm * 0.055)
    for (let i = i0; i <= i1; i++) {
      const wx = i * 13 + (h1(i * 7) - 0.5) * 3
      const px = sx(wx)
      const lean = (h1(i) - 0.5) * 0.18
      const topX = px + lean * ppm
      const topY = baseY - (0.95 + h1(i * 3 + 1) * 0.25) * ppm
      ctx.beginPath()
      ctx.moveTo(px, baseY)
      ctx.lineTo(topX, topY)
      ctx.stroke()
      if (i > i0) {
        ctx.save()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(120,130,125,0.16)'
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.quadraticCurveTo((prevX + topX) / 2, Math.max(prevY, topY) + 0.16 * ppm, topX, topY)
        ctx.stroke()
        ctx.restore()
        ctx.strokeStyle = '#0c0f12'
      }
      prevX = topX
      prevY = topY
    }
    // near-side stones + tufts on the verge, hashed from 5 m slots
    const j0 = Math.floor(left / 5)
    const j1 = Math.ceil(right / 5)
    for (let j = j0; j <= j1; j++) {
      const r = h1(j * 13 + 5)
      if (r < 0.62) continue
      const wx = j * 5 + (h1(j + 2) - 0.5) * 3
      const px = sx(wx)
      const vy = sy(-1.1 - h1(j + 4) * 0.5)
      if (r < 0.8) {
        ctx.fillStyle = '#0b0e11'
        ctx.beginPath()
        ctx.ellipse(px, vy, (0.16 + h1(j + 6) * 0.2) * ppm, (0.1 + h1(j + 7) * 0.1) * ppm, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.strokeStyle = '#070a0c'
        ctx.lineWidth = 2
        const hgt = (0.2 + h1(j + 8) * 0.3) * ppm
        ctx.beginPath()
        ctx.moveTo(px, vy)
        ctx.lineTo(px + (h1(j + 9) - 0.5) * 0.3 * ppm, vy - hgt)
        ctx.moveTo(px + 3, vy)
        ctx.lineTo(px + 3 + (h1(j + 10) - 0.5) * 0.3 * ppm, vy - hgt * 0.8)
        ctx.stroke()
      }
    }
  }

  function drawRoad() {
    const yTop = sy(0.55)
    const yBot = sy(-1.2)
    ctx.fillStyle = roadGrad
    ctx.fillRect(0, yTop - shy, W, yBot - yTop)
    // dirt grain anchored to the world so it never swims
    const off = (((cx0 * ppm) % 256) + 256) % 256
    ctx.save()
    ctx.translate(-off + shx, shy)
    ctx.fillStyle = roadPat
    ctx.fillRect(off - shx - 256, yTop - shy, W + 512, yBot - yTop)
    ctx.restore()
    // wheel ruts — the far one and the near one the cart actually rides
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.fillRect(0, sy(0.3), W, Math.max(2, ppm * 0.09))
    ctx.fillRect(0, sy(-0.12), W, Math.max(2, ppm * 0.13))
    ctx.fillStyle = 'rgba(206,196,168,0.05)' // moonlit crown between ruts
    ctx.fillRect(0, sy(0.12), W, Math.max(1, ppm * 0.05))
    // edges
    ctx.fillStyle = 'rgba(206,196,168,0.07)'
    ctx.fillRect(0, yTop, W, 1)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, yBot - 2, W, 2)
    // verge below
    ctx.fillStyle = vergeGrad
    ctx.fillRect(0, yBot, W, H - yBot)
  }

  function drawPotholes(t) {
    const holes = refs.holes
    for (let i = 0; i < holes.length; i++) {
      const px = sx(holes[i].x)
      if (px < -60 || px > W + 60) continue
      const py = sy(-0.05)
      ctx.fillStyle = '#020304'
      ctx.beginPath()
      ctx.ellipse(px, py, 0.48 * ppm, 0.13 * ppm, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(206,196,168,0.06)' // chipped lip catching the moon
      ctx.fillRect(px - 0.4 * ppm, py - 0.13 * ppm, 0.8 * ppm, 1)
    }
  }

  function drawCruces(t) {
    const cruces = refs.cruces
    for (let i = 0; i < cruces.length; i++) {
      const wx = cruces[i].x
      const px = sx(wx)
      if (px < -80 || px > W + 80) continue
      const baseY = sy(0.6)
      const lean = (h1(i + 40) - 0.5) * 0.1
      // stones
      ctx.fillStyle = '#0d1013'
      ctx.beginPath()
      ctx.ellipse(px, baseY, 0.34 * ppm, 0.12 * ppm, 0, 0, Math.PI * 2)
      ctx.fill()
      // the white cross
      ctx.save()
      ctx.translate(px, baseY)
      ctx.rotate(lean)
      ctx.fillStyle = '#b3aa90'
      ctx.fillRect(-0.035 * ppm, -1.15 * ppm, 0.07 * ppm, 1.15 * ppm)
      ctx.fillRect(-0.28 * ppm, -0.92 * ppm, 0.56 * ppm, 0.07 * ppm)
      ctx.restore()
      // tiny candle at the base (dimmer once used)
      const used = cruces[i].used
      const fl = used ? 0.12 : 0.5 + 0.18 * Math.sin(t * 9 + i * 2.1)
      ctx.globalAlpha = fl
      ctx.fillStyle = '#ffd9a0'
      ctx.fillRect(px + 0.12 * ppm, baseY - 0.16 * ppm, 2, 3)
      ctx.globalAlpha = 1
    }
  }

  function drawVillage() {
    if (sx(VILLAGE_X) > W + 100) return
    const baseY = sy(0.6)
    for (let i = 0; i < HOUSES.length; i++) {
      const hse = HOUSES[i]
      const px = sx(VILLAGE_X + hse.dx)
      if (px < -200 || px > W + 200) continue
      const wPix = hse.w * ppm
      const hPix = hse.h * ppm
      ctx.fillStyle = '#070a0e'
      ctx.fillRect(px - wPix / 2, baseY - hPix, wPix, hPix)
      // roof
      ctx.beginPath()
      ctx.moveTo(px - wPix / 2 - 4, baseY - hPix)
      ctx.lineTo(px, baseY - hPix - 0.8 * ppm * (hse.church ? 1.6 : 1))
      ctx.lineTo(px + wPix / 2 + 4, baseY - hPix)
      ctx.closePath()
      ctx.fill()
      if (hse.church) {
        ctx.fillStyle = '#b3aa90'
        ctx.fillRect(px - 1, baseY - hPix - 1.4 * ppm, 2, 0.34 * ppm)
        ctx.fillRect(px - 0.1 * ppm, baseY - hPix - 1.3 * ppm, 0.2 * ppm, 2)
      }
      // warm windows
      ctx.fillStyle = '#ffbe78'
      for (let k = 0; k < hse.wins.length; k++) {
        const wn = hse.wins[k]
        ctx.fillRect(px - wPix / 2 + wn[0] * ppm, baseY - wn[1] * ppm - 0.32 * ppm, 0.2 * ppm, 0.32 * ppm)
      }
    }
  }

  // la Viuda at the roadside — a held breath, visible only inside the light
  function drawViudaStanding(wx, t) {
    const a = lightAt(wx)
    if (a < 0.015) return
    const px = sx(wx)
    if (px < -60 || px > W + 60) return
    const d = wx - refs.cart.x
    const persp = d > 8 ? Math.max(0.78, 1.04 - d * 0.006) : 1 // small, far ahead
    const baseY = sy(0.6 + (1 - persp) * 0.5)
    const hPix = 1.62 * ppm * persp
    ctx.globalAlpha = Math.min(1, a * 1.4)
    ctx.fillStyle = '#010205'
    // veil + dress, one unbroken mourning silhouette
    ctx.beginPath()
    ctx.moveTo(px, baseY - hPix)
    ctx.quadraticCurveTo(px + 0.13 * ppm, baseY - hPix + 0.1 * ppm, px + 0.14 * ppm, baseY - hPix * 0.72)
    ctx.quadraticCurveTo(px + 0.2 * ppm, baseY - hPix * 0.4, px + 0.26 * ppm, baseY)
    ctx.lineTo(px - 0.24 * ppm, baseY)
    ctx.quadraticCurveTo(px - 0.18 * ppm, baseY - hPix * 0.45, px - 0.13 * ppm, baseY - hPix * 0.74)
    ctx.quadraticCurveTo(px - 0.12 * ppm, baseY - hPix + 0.12 * ppm, px, baseY - hPix)
    ctx.closePath()
    ctx.fill()
    // the faintest cold edge, so the black reads against the black
    ctx.globalAlpha = Math.min(1, a) * 0.22
    ctx.strokeStyle = '#2a3b4a'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // a boarded Viuda seated among the sacks — she does not move at all
  function drawViudaSeated(dx, dy, s) {
    const cart = refs.cart
    const px = sx(cart.x + dx)
    const py = sy(dy)
    const hPix = 0.78 * ppm * s
    ctx.fillStyle = '#010205'
    ctx.beginPath()
    ctx.moveTo(px, py - hPix)
    ctx.quadraticCurveTo(px + 0.12 * ppm, py - hPix + 0.08 * ppm, px + 0.15 * ppm, py - hPix * 0.5)
    ctx.quadraticCurveTo(px + 0.22 * ppm, py - hPix * 0.2, px + 0.24 * ppm, py)
    ctx.lineTo(px - 0.22 * ppm, py)
    ctx.quadraticCurveTo(px - 0.16 * ppm, py - hPix * 0.3, px - 0.11 * ppm, py - hPix * 0.55)
    ctx.quadraticCurveTo(px - 0.1 * ppm, py - hPix + 0.1 * ppm, px, py - hPix)
    ctx.closePath()
    ctx.fill()
  }

  function drawWheel(px, py, rot) {
    const r = WHEEL_R * ppm
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rot)
    ctx.strokeStyle = '#241a10'
    ctx.lineWidth = Math.max(3, r * 0.16)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = Math.max(2, r * 0.08)
    ctx.strokeStyle = '#1c130b'
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92)
      ctx.stroke()
    }
    ctx.fillStyle = '#2a1d11'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
    // moon catch on the upper rim
    ctx.strokeStyle = 'rgba(206,196,168,0.10)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, r, -2.4, -0.8)
    ctx.stroke()
    ctx.restore()
  }

  function drawOx(t) {
    const cart = refs.cart
    const ox = refs.ox
    const spd = Math.min(1, cart.v / 2.7)
    const trot = cart.lever === 2 && cart.v > 3.4
    const off = trot ? TROT_OFF : WALK_OFF
    const g2 = cart.gait * Math.PI * 2
    const bob = Math.abs(Math.sin(g2)) * 0.05 * spd * (trot ? 1.7 : 1)
    const breath = spd < 0.2 ? Math.sin(t * 1.5) * 0.018 : 0
    const droop = ox.exhaustT > 0 ? Math.min(1, ox.exhaustT > 8 ? (10 - ox.exhaustT) / 2 : 1) : 0
    const bx = cart.x + 2.95
    const by = 1.12 + bob + breath
    const ampX = (0.16 + cart.v * 0.035) * ppm
    const lift = (0.05 + cart.v * 0.022) * ppm
    const groundPy = sy(0)
    // legs — far pair first, darker
    for (let i = 0; i < 4; i++) {
      const far = i < 2
      const hipWX = bx + (i % 2 === 0 ? -0.52 : 0.62)
      const hipPx = sx(hipWX)
      const hipPy = sy(by - 0.28)
      const ph = g2 + off[i] * Math.PI * 2
      const sw = Math.sin(ph) * spd
      const lf = Math.max(0, Math.sin(ph + 1.1)) * spd
      const hoofPx = hipPx + sw * ampX
      const hoofPy = groundPy - lf * lift
      ctx.strokeStyle = far ? '#0a0907' : '#13110d'
      ctx.lineWidth = Math.max(3, ppm * 0.1)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(hipPx, hipPy)
      ctx.quadraticCurveTo((hipPx + hoofPx) / 2 + ppm * 0.05, (hipPy + hoofPy) / 2, hoofPx, hoofPy)
      ctx.stroke()
    }
    // body
    const bPx = sx(bx)
    const bPy = sy(by)
    ctx.fillStyle = '#13110d'
    ctx.beginPath()
    ctx.ellipse(bPx, bPy, 0.92 * ppm, 0.5 * ppm, 0, 0, Math.PI * 2)
    ctx.fill()
    // shoulder hump
    ctx.beginPath()
    ctx.ellipse(bPx + 0.45 * ppm, bPy - 0.32 * ppm, 0.34 * ppm, 0.24 * ppm, -0.2, 0, Math.PI * 2)
    ctx.fill()
    // head — lowered, more so when exhausted
    const hdWX = bx + 1.18
    const hdY = by - 0.16 - droop * 0.3 + Math.sin(g2 * 0.5) * 0.02 * spd
    const hdPx = sx(hdWX)
    const hdPy = sy(hdY)
    ctx.beginPath()
    ctx.ellipse(hdPx, hdPy, 0.3 * ppm, 0.21 * ppm, 0.35 + droop * 0.25, 0, Math.PI * 2)
    ctx.fill()
    // muzzle
    ctx.beginPath()
    ctx.ellipse(hdPx + 0.22 * ppm, hdPy + 0.12 * ppm, 0.14 * ppm, 0.1 * ppm, 0.3, 0, Math.PI * 2)
    ctx.fill()
    // horns — the lyre curve that reads OX in silhouette
    ctx.strokeStyle = '#1d1a14'
    ctx.lineWidth = Math.max(2, ppm * 0.05)
    ctx.beginPath()
    ctx.moveTo(hdPx - 0.04 * ppm, hdPy - 0.12 * ppm)
    ctx.quadraticCurveTo(hdPx - 0.16 * ppm, hdPy - 0.4 * ppm, hdPx + 0.0 * ppm, hdPy - 0.46 * ppm)
    ctx.moveTo(hdPx + 0.08 * ppm, hdPy - 0.1 * ppm)
    ctx.quadraticCurveTo(hdPx + 0.2 * ppm, hdPy - 0.36 * ppm, hdPx + 0.34 * ppm, hdPy - 0.4 * ppm)
    ctx.stroke()
    // ear flick now and then
    if (Math.sin(t * 0.7 + 1) > 0.93) {
      ctx.beginPath()
      ctx.moveTo(hdPx - 0.1 * ppm, hdPy - 0.1 * ppm)
      ctx.lineTo(hdPx - 0.26 * ppm, hdPy - 0.22 * ppm)
      ctx.stroke()
    }
    // tail — swings slow, flicks at rest
    const tailPh = spd > 0.2 ? Math.sin(g2 * 0.5) * 0.12 : Math.sin(t * 2.3) * 0.2
    ctx.strokeStyle = '#0e0c09'
    ctx.lineWidth = Math.max(2, ppm * 0.04)
    ctx.beginPath()
    ctx.moveTo(sx(bx - 0.88), sy(by + 0.1))
    ctx.quadraticCurveTo(sx(bx - 1.06 + tailPh * 0.3), sy(by - 0.35), sx(bx - 1.0 + tailPh), sy(by - 0.72))
    ctx.stroke()
    // moon rim along the back
    ctx.strokeStyle = 'rgba(206,196,168,0.10)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(bPx, bPy, 0.92 * ppm, 0.5 * ppm, 0, -2.6, -0.6)
    ctx.stroke()
    // yoke — a short beam laid over the neck — and the pole back to the cart
    ctx.strokeStyle = '#1c130b'
    ctx.lineWidth = Math.max(4, ppm * 0.09)
    ctx.beginPath()
    ctx.moveTo(sx(bx + 0.62), sy(by + 0.46))
    ctx.quadraticCurveTo(sx(bx + 0.78), sy(by + 0.3), sx(bx + 0.72), sy(by + 0.1))
    ctx.stroke()
    ctx.lineWidth = Math.max(3, ppm * 0.06)
    ctx.beginPath()
    ctx.moveTo(sx(bx + 0.68), sy(by + 0.16))
    ctx.lineTo(sx(cart.x + 1.3), sy(0.95))
    ctx.stroke()
  }

  function drawCart(t) {
    const cart = refs.cart
    const lamp = refs.lamp
    const axPx = sx(cart.x)
    const axPy = sy(WHEEL_R)
    // far wheel, slightly up-left and darker
    ctx.globalAlpha = 0.55
    drawWheel(axPx - 0.16 * ppm, axPy - 0.07 * ppm, cart.wheelRot * 0.98)
    ctx.globalAlpha = 1
    // rocking bed (pivot at the axle)
    const dip = cart.bump * 0.07
    ctx.save()
    ctx.translate(axPx, axPy)
    ctx.rotate(-cart.rock)
    const m = ppm
    // bed box
    ctx.fillStyle = '#171008'
    ctx.fillRect(-1.45 * m, -(1.18 - dip) * m + WHEEL_R * m, 2.7 * m, 0.5 * m)
    ctx.save()
    ctx.translate(-1.45 * m, -(1.18 - dip) * m + WHEEL_R * m)
    ctx.fillStyle = grainPat
    ctx.fillRect(0, 0, 2.7 * m, 0.5 * m)
    ctx.restore()
    // side rail slats
    ctx.strokeStyle = '#22180c'
    ctx.lineWidth = Math.max(2, m * 0.06)
    for (let i = 0; i < 4; i++) {
      const rx = (-1.35 + i * 0.84) * m
      ctx.beginPath()
      ctx.moveTo(rx, -(0.68 - dip) * m)
      ctx.lineTo(rx, -(1.34 - dip) * m)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(-1.45 * m, -(1.3 - dip) * m)
    ctx.lineTo(1.25 * m, -(1.3 - dip) * m)
    ctx.stroke()
    // cargo — sacks under a tied cloth
    ctx.fillStyle = '#100d0a'
    ctx.beginPath()
    ctx.ellipse(-0.75 * m, -(1.32 - dip) * m, 0.42 * m, 0.26 * m, 0.1, 0, Math.PI * 2)
    ctx.ellipse(-0.15 * m, -(1.38 - dip) * m, 0.36 * m, 0.3 * m, -0.15, 0, Math.PI * 2)
    ctx.fill()
    // moon edge on the rail
    ctx.strokeStyle = 'rgba(206,196,168,0.09)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-1.45 * m, -(1.34 - dip) * m)
    ctx.lineTo(1.25 * m, -(1.34 - dip) * m)
    ctx.stroke()
    // driver — seated on the bed's front plank; poncho, chupalla, faint sway
    const sway = Math.sin(cart.gait * Math.PI * 2 * 0.5) * 0.02 + cart.rock * 0.6
    ctx.save()
    ctx.translate(0.72 * m, -(0.62 - dip) * m)
    ctx.rotate(sway)
    ctx.fillStyle = '#15120d'
    ctx.beginPath() // poncho — a soft triangle, shoulders rounded
    ctx.moveTo(0, -0.72 * m)
    ctx.quadraticCurveTo(0.36 * m, -0.62 * m, 0.4 * m, -0.04 * m)
    ctx.lineTo(-0.4 * m, -0.04 * m)
    ctx.quadraticCurveTo(-0.36 * m, -0.62 * m, 0, -0.72 * m)
    ctx.closePath()
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = ponchoWeave
    ctx.fillRect(-0.45 * m, -0.8 * m, 0.9 * m, 0.8 * m)
    ctx.restore()
    // head + chupalla (wide brim)
    ctx.fillStyle = '#100d09'
    ctx.beginPath()
    ctx.arc(0, -0.82 * m, 0.12 * m, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(-0.26 * m, -0.93 * m, 0.52 * m, 0.04 * m)
    ctx.beginPath()
    ctx.ellipse(0, -0.94 * m, 0.12 * m, 0.08 * m, 0, Math.PI, 0)
    ctx.fill()
    // rein line out toward the ox's head
    ctx.strokeStyle = 'rgba(60,50,38,0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0.12 * m, -0.42 * m)
    ctx.quadraticCurveTo(1.4 * m, -0.1 * m, 3.2 * m, 0.28 * m)
    ctx.stroke()
    ctx.restore()
    // lantern pole + arm
    ctx.strokeStyle = '#1c130b'
    ctx.lineWidth = Math.max(2, m * 0.05)
    ctx.beginPath()
    ctx.moveTo(1.18 * m, -(0.7 - dip) * m)
    ctx.lineTo(1.18 * m, -(1.95 - dip) * m)
    ctx.quadraticCurveTo(1.2 * m, -(2.12 - dip) * m, 1.52 * m, -(2.08 - dip) * m)
    ctx.stroke()
    ctx.restore()
    // the lantern itself — hangs from the arm tip, swings free of the rock
    const tipPx = axPx + Math.cos(-cart.rock) * 1.52 * ppm - Math.sin(-cart.rock) * -(2.08 - dip) * ppm
    const tipPy = axPy + Math.sin(-cart.rock) * 1.52 * ppm + Math.cos(-cart.rock) * -(2.08 - dip) * ppm
    const swing = lamp.swing
    const lPx = tipPx + Math.sin(swing) * 0.34 * ppm
    const lPy = tipPy + Math.cos(swing) * 0.34 * ppm
    lampSX = lPx
    lampSY = lPy
    ctx.strokeStyle = '#231a10'
    ctx.lineWidth = Math.max(1.5, ppm * 0.03)
    ctx.beginPath()
    ctx.moveTo(tipPx, tipPy)
    ctx.lineTo(lPx, lPy)
    ctx.stroke()
    // frame
    ctx.fillStyle = '#0e0a06'
    ctx.fillRect(lPx - 0.09 * ppm, lPy, 0.18 * ppm, 0.26 * ppm)
    // flame core (drawn bright here; the glow pass does the rest)
    const fl = flameNow
    if (fl > 0.02) {
      ctx.globalAlpha = 0.65 + 0.35 * fl
      ctx.fillStyle = '#ffe7bd'
      const fh = (0.1 + 0.1 * fl) * ppm
      ctx.fillRect(lPx - 0.03 * ppm, lPy + 0.22 * ppm - fh, 0.06 * ppm, fh)
      ctx.globalAlpha = 1
    }
    // near wheel over everything
    drawWheel(axPx, axPy, cart.wheelRot)
    // pour progress — a thin amber arc around the lantern
    if (refs.lamp.pour >= 0) {
      ctx.strokeStyle = '#ffcf8e'
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(lPx, lPy + 0.12 * ppm, 0.3 * ppm, -Math.PI / 2, -Math.PI / 2 + refs.lamp.pour * Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // seated company, blackest things on the cart
    const n = refs.counts.board
    if (n >= 1) drawViudaSeated(-0.5, 1.62, 1)
    if (n >= 2) drawViudaSeated(-1.05, 1.56, 0.92)
  }

  function drawMists(t) {
    for (let i = 0; i < mists.length; i++) {
      const ms = mists[i]
      const wx = ms.x + Math.sin(t * ms.sp + ms.ph) * 2.2
      const px = sx(wx)
      const wPix = ms.w * ppm
      if (px + wPix < -50 || px - wPix > W + 50) continue
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.23 + ms.ph * 2)
      ctx.drawImage(mistSprite, px - wPix / 2, sy(ms.y) - 0.18 * wPix, wPix, 0.36 * wPix)
    }
    ctx.globalAlpha = 1
  }

  function drawParticles() {
    const parts = refs.particles
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (p.life <= 0) continue
      const a = p.life / p.max
      const px = sx(p.x)
      const py = sy(p.y)
      if (p.type === 0) {
        // hoof dust
        ctx.globalAlpha = a * 0.22
        ctx.fillStyle = '#9a8a72'
        ctx.beginPath()
        ctx.arc(px, py, (p.size + (1 - a) * 0.1) * ppm, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.type === 1) {
        // lantern ember
        ctx.globalAlpha = a * 0.8
        ctx.fillStyle = '#ffcf8e'
        ctx.fillRect(px, py, 2, 2)
      } else if (p.type === 2) {
        // ox breath
        ctx.globalAlpha = a * 0.14
        ctx.fillStyle = '#b8c4c0'
        ctx.beginPath()
        ctx.arc(px, py, (p.size + (1 - a) * 0.16) * ppm, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // wood splinter
        ctx.globalAlpha = a * 0.85
        ctx.fillStyle = '#6b4a2a'
        ctx.fillRect(px, py, 3, 2)
      }
    }
    ctx.globalAlpha = 1
  }

  // the light pass — everything warm happens here, in 'screen'
  function drawLight(t) {
    const lamp = refs.lamp
    const cart = refs.cart
    ctx.globalCompositeOperation = 'screen'
    const fl = flameNow
    if (fl > 0.01) {
      // lamp core glow
      let r = 2.8 * ppm * (0.9 + 0.1 * Math.sin(t * 13.1))
      ctx.globalAlpha = 0.85 * fl
      ctx.drawImage(glowWarm, lampSX - r, lampSY - r, r * 2, r * 2)
      // halo around the cart
      r = 5.6 * ppm
      ctx.globalAlpha = 0.22 * fl
      ctx.drawImage(glowWarm, lampSX - r, lampSY - r, r * 2, r * 2)
      // warm pool on the road, thrown forward
      const poolY = sy(-0.1)
      ctx.globalAlpha = 0.42 * fl
      ctx.drawImage(glowWarm, lampSX - 3.5 * ppm, poolY - 1.9 * ppm, 11.5 * ppm, 3.7 * ppm)
      // long soft penumbra reaching up the road
      ctx.globalAlpha = 0.1 * fl
      ctx.drawImage(glowWarm, lampSX - 2 * ppm, poolY - 2.6 * ppm, 24 * ppm, 5.1 * ppm)
    }
    // pothole glints inside the light
    const holes = refs.holes
    for (let i = 0; i < holes.length; i++) {
      const hx = holes[i].x
      const la = lightAt(hx)
      if (la < 0.03 || holes[i].hit) continue
      const px = sx(hx)
      const py = sy(-0.02)
      const tw = 0.55 + 0.45 * Math.sin(t * 6 + hx)
      ctx.globalAlpha = la * tw * 0.9
      const r = 0.9 * ppm
      ctx.drawImage(glowCool, px - r / 2, py - r / 2, r, r)
      ctx.strokeStyle = '#cfeede'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px - 4, py)
      ctx.lineTo(px + 4, py)
      ctx.moveTo(px, py - 4)
      ctx.lineTo(px, py + 4)
      ctx.stroke()
    }
    // the light finds HER — a faint warm spill she stands against
    const enc = refs.enc
    for (let i = 0; i < enc.length; i++) {
      if (enc[i].state !== 'visible') continue
      const ex = enc[i].x
      const la = lightAt(ex)
      if (la < 0.02) continue
      const px = sx(ex)
      if (px < -120 || px > W + 160) continue
      let r = 2.6 * ppm
      ctx.globalAlpha = la * 0.55
      ctx.drawImage(glowWarm, px - r, sy(1.0) - r, r * 2, r * 2)
      r = 4.2 * ppm
      ctx.globalAlpha = la * 0.3
      ctx.drawImage(glowWarm, px - r, sy(0.4) - r * 0.35, r * 2, r * 0.7)
    }
    // cruz candles
    const cruces = refs.cruces
    for (let i = 0; i < cruces.length; i++) {
      const px = sx(cruces[i].x)
      if (px < -80 || px > W + 80) continue
      const a = cruces[i].used ? 0.1 : 0.4 + 0.15 * Math.sin(t * 9 + i * 2.1)
      ctx.globalAlpha = a
      const r = 1.5 * ppm
      ctx.drawImage(glowWarm, px + 0.12 * ppm - r / 2, sy(0.45) - r / 2, r, r)
    }
    // village windows + sky glow as it nears
    const villPx = sx(VILLAGE_X)
    if (villPx < W + 400) {
      for (let i = 0; i < HOUSES.length; i++) {
        const hse = HOUSES[i]
        const px = sx(VILLAGE_X + hse.dx)
        if (px < -200 || px > W + 240) continue
        for (let k = 0; k < hse.wins.length; k++) {
          const wn = hse.wins[k]
          const wx = px - (hse.w * ppm) / 2 + wn[0] * ppm + 0.1 * ppm
          const wy = sy(0.6) - wn[1] * ppm - 0.16 * ppm
          const r = 1.7 * ppm
          ctx.globalAlpha = 0.5
          ctx.drawImage(glowWindow, wx - r / 2, wy - r / 2, r, r)
        }
      }
    }
    const prox = 1 - (VILLAGE_X - cart.x) / 160
    if (prox > 0 && cart.x < VILLAGE_X + 5) {
      const r = 30 * ppm * Math.min(1, prox + 0.3)
      const gx = Math.min(villPx + 14 * ppm, W - r * 0.18) // hugs the screen edge while far
      ctx.globalAlpha = 0.16 * Math.min(1, prox * 1.4)
      ctx.drawImage(glowWindow, gx - r / 2, groundY - 1.4 * ppm - r * 0.3, r, r * 0.6)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  function draw(t) {
    const cam = refs.cam
    const fx = refs.fx
    const lamp = refs.lamp
    cx0 = cam.x
    // micro-shake — deterministic jitter from t
    const sh = fx.shakeT * fx.shakeAmp
    shx = sh > 0.001 ? Math.sin(t * 91.3) * sh * ppm * 0.06 : 0
    shy = sh > 0.001 ? Math.cos(t * 113.7) * sh * ppm * 0.05 : 0
    // the flame this frame: oil state × gutter flicker × small natural waver
    const gut = lamp.gutter
    const flick = 0.5 + 0.5 * Math.sin(t * 11.7 + 2.3 * Math.sin(t * 5.1))
    flameNow = lamp.flame * (1 - gut * (0.32 + 0.45 * flick)) * (0.94 + 0.06 * Math.sin(t * 8.3))
    if (flameNow < 0) flameNow = 0
    lampWX = refs.cart.x + 1.7

    // base clear — no pixel survives a frame (the light pass is additive)
    ctx.fillStyle = '#04070c'
    ctx.fillRect(0, 0, W, H)
    // sky
    drawTile(skyT, 0, horizonY + 2, 0.04, 1)
    // the moon, once, fixed — it is at infinity
    const mr = H * 0.34
    ctx.drawImage(moonT, W * 0.64 - mr / 2, H * 0.1 - mr / 2, mr, mr)
    // twinkling stars
    for (let i = 0; i < TWINK.length; i++) {
      const s = TWINK[i]
      ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * s.f + s.p)
      ctx.fillStyle = '#cdd6c8'
      ctx.fillRect(s.fx * W, s.fy * H + 2, 1, 1)
    }
    ctx.globalAlpha = 1
    // sea + headlands
    drawSea(t)
    drawTile(farT, horizonY - H * 0.015, H * 0.1, 0.08, 1)
    // mid pasture
    drawTile(midT, groundY - 0.55 * ppm - H * 0.21, H * 0.22, 0.4, 1)
    // road + world decor
    drawRoad()
    drawFence()
    drawPotholes(t)
    drawCruces(t)
    drawVillage()
    // the cart and its ox
    drawOx(t)
    drawCart(t)
    drawParticles()
    drawMists(t)
    // foreground fringe
    drawTile(fgT, H - H * 0.13, H * 0.13, 1.5, 0.9)
    // light
    drawLight(t)
    // her — after the light, so no warmth ever touches the black
    const enc2 = refs.enc
    for (let i = 0; i < enc2.length; i++)
      if (enc2[i].state === 'visible') drawViudaStanding(enc2[i].x, t)
    // darkness when the flame dies
    const dark = 0.34 * (1 - lamp.flame)
    if (dark > 0.01) {
      ctx.globalAlpha = dark
      ctx.fillStyle = '#000409'
      ctx.fillRect(0, 0, W, H)
    }
    // dread — vignette + cold tint, breathing with the pulse
    const dr = fx.dread
    const pl = fx.pulse
    if (dr > 0.01 || pl > 0.01) {
      ctx.globalAlpha = Math.min(1, dr * 0.75 + pl * 0.3 * (0.6 + 0.4 * Math.sin(t * 4.2)))
      ctx.fillStyle = dreadGrad
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 0.07 * dr + 0.05 * pl
      ctx.fillStyle = '#283a50'
      ctx.fillRect(0, 0, W, H)
    }
    // event flash
    if (fx.flashT > 0.01) {
      ctx.globalAlpha = fx.flashT * 0.16
      ctx.fillStyle = FLASH[fx.flashColor]
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalAlpha = 1
  }

  return { draw }
}
