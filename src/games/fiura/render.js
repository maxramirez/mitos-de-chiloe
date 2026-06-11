// render.js — LA FIURA · canvas2d painter.
// Painted parallax: tries /assets/fiura/bg0..3.png (1536x1024, sky -> reeds);
// every layer has a procedural fallback generated at init so the game looks
// complete with zero assets. Layers scroll at factors 0.05/0.2/0.5/1.15 and
// repeat by MIRROR tiling (every odd tile flipped) so seams never show.
// draw() is allocation-free: glow sprites, gradients, decor, color strings,
// surface textures (mud/wood-grain patterns, garment weaves, water sparkle
// strip, mist sprite) and the mote/mist atmosphere fields are all prebuilt
// at init; screen-space gradients rebuild only on resize. Dynamic alphas go
// through ctx.globalAlpha against constant color strings — never built.
import { PLATFORMS, HERBS, CHECKPOINTS, AMBUSHES, WATER_Y, HUT_X, LEVEL_END } from './level.js'

const VIEW_H = 11.5 // meters of world visible vertically
const LAYER_W = 1536
const LAYER_H = 1024
const PARALLAX = [0.05, 0.2, 0.5, 1.15]

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- procedural fallback layers ----------
function makeLayer0() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = LAYER_H
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, LAYER_H)
  grad.addColorStop(0, '#0a131c')
  grad.addColorStop(0.55, '#081019')
  grad.addColorStop(1, '#06090c')
  g.fillStyle = grad
  g.fillRect(0, 0, LAYER_W, LAYER_H)
  const rng = mulberry32(11)
  // stars
  for (let i = 0; i < 90; i++) {
    const x = rng() * LAYER_W
    const y = rng() * LAYER_H * 0.55
    g.globalAlpha = 0.12 + rng() * 0.35
    g.fillStyle = '#cfd8c8'
    g.fillRect(x, y, rng() < 0.2 ? 2 : 1, 1)
  }
  g.globalAlpha = 1
  // moon + halo (placed so mirror tiling keeps it believable)
  const mx = 1100
  const my = 240
  const halo = g.createRadialGradient(mx, my, 10, mx, my, 220)
  halo.addColorStop(0, 'rgba(210,225,200,0.30)')
  halo.addColorStop(0.4, 'rgba(180,210,190,0.10)')
  halo.addColorStop(1, 'rgba(180,210,190,0)')
  g.fillStyle = halo
  g.fillRect(mx - 220, my - 220, 440, 440)
  g.fillStyle = '#cfd8c4'
  g.beginPath()
  g.arc(mx, my, 46, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(140,160,140,0.35)' // craters
  g.beginPath()
  g.arc(mx - 14, my - 8, 9, 0, Math.PI * 2)
  g.arc(mx + 12, my + 14, 6, 0, Math.PI * 2)
  g.arc(mx + 16, my - 18, 4, 0, Math.PI * 2)
  g.fill()
  // thin cloud bands
  g.fillStyle = 'rgba(10,18,24,0.55)'
  for (let i = 0; i < 5; i++) {
    const y = 120 + rng() * 380
    const w = 300 + rng() * 600
    const x = rng() * LAYER_W
    g.beginPath()
    g.ellipse(x, y, w / 2, 9 + rng() * 14, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

function treeSilhouette(g, x, baseY, h, w, rng, color) {
  g.fillStyle = color
  g.beginPath() // twisted trunk
  g.moveTo(x - w * 0.12, baseY)
  g.quadraticCurveTo(x + (rng() - 0.5) * w * 0.6, baseY - h * 0.5, x - w * 0.05, baseY - h)
  g.lineTo(x + w * 0.05, baseY - h)
  g.quadraticCurveTo(x + (rng() - 0.5) * w * 0.6, baseY - h * 0.5, x + w * 0.12, baseY)
  g.closePath()
  g.fill()
  // canopy blobs
  for (let i = 0; i < 4; i++) {
    const cy = baseY - h * (0.6 + rng() * 0.45)
    const cx = x + (rng() - 0.5) * w
    g.beginPath()
    g.ellipse(cx, cy, w * (0.3 + rng() * 0.4), h * 0.1 * (0.6 + rng()), 0, 0, Math.PI * 2)
    g.fill()
  }
}

function makeTreeLayer(seed, color, minH, maxH, count, baseY, mossy) {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = LAYER_H
  const g = c.getContext('2d')
  const rng = mulberry32(seed)
  // ground band
  const grad = g.createLinearGradient(0, baseY - 60, 0, LAYER_H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.25, color)
  grad.addColorStop(1, color)
  g.fillStyle = grad
  g.fillRect(0, baseY - 60, LAYER_W, LAYER_H - baseY + 60)
  for (let i = 0; i < count; i++) {
    const x = (i + 0.2 + rng() * 0.6) * (LAYER_W / count)
    const h = minH + rng() * (maxH - minH)
    treeSilhouette(g, x, baseY + 30, h, 50 + rng() * 70, rng, color)
    if (mossy && rng() < 0.7) {
      // hanging moss strands
      g.strokeStyle = color
      g.lineWidth = 3
      for (let m = 0; m < 3; m++) {
        const mx2 = x + (rng() - 0.5) * 90
        const my2 = baseY + 30 - h * (0.55 + rng() * 0.35)
        g.beginPath()
        g.moveTo(mx2, my2)
        g.quadraticCurveTo(mx2 + (rng() - 0.5) * 10, my2 + 40 + rng() * 70, mx2 + (rng() - 0.5) * 16, my2 + 70 + rng() * 110)
        g.stroke()
      }
    }
  }
  return c
}

function makeReedLayer() {
  const c = document.createElement('canvas')
  c.width = LAYER_W
  c.height = LAYER_H
  const g = c.getContext('2d')
  const rng = mulberry32(77)
  const ink = '#030608'
  // low mud band at the very bottom
  g.fillStyle = ink
  g.beginPath()
  g.moveTo(0, LAYER_H)
  g.lineTo(0, LAYER_H - 70)
  for (let x = 0; x <= LAYER_W; x += 64) {
    g.lineTo(x, LAYER_H - 60 - rng() * 50)
  }
  g.lineTo(LAYER_W, LAYER_H)
  g.closePath()
  g.fill()
  // reed clumps with gaps so gameplay stays readable
  for (let clump = 0; clump < 7; clump++) {
    const cx = (clump + 0.15 + rng() * 0.7) * (LAYER_W / 7)
    const n = 6 + Math.floor(rng() * 8)
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 110
      const h = 180 + rng() * 320
      const lean = (rng() - 0.5) * 60
      g.strokeStyle = ink
      g.lineWidth = 4 + rng() * 4
      g.beginPath()
      g.moveTo(x, LAYER_H)
      g.quadraticCurveTo(x + lean * 0.3, LAYER_H - h * 0.6, x + lean, LAYER_H - h)
      g.stroke()
      if (rng() < 0.5) {
        // cattail head
        g.fillStyle = ink
        g.beginPath()
        g.ellipse(x + lean, LAYER_H - h - 14, 7, 22, lean * 0.004, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  return c
}

// ---------- procedural surface textures (built once at boot) ----------
// mud + moss speckle for the ground islands — low-contrast overlay pattern
function makeMudPattern() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  const rng = mulberry32(3301)
  // faint sediment streaks (endpoints share y so the tile wraps clean)
  g.lineWidth = 1
  for (let i = 0; i < 26; i++) {
    const y = rng() * 256
    g.strokeStyle = 'rgba(0,0,0,' + (0.06 + rng() * 0.08).toFixed(3) + ')'
    g.beginPath()
    g.moveTo(0, y)
    g.quadraticCurveTo(128, y + (rng() - 0.5) * 9, 256, y)
    g.stroke()
  }
  // dark mud speckle
  for (let i = 0; i < 420; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (0.06 + rng() * 0.14).toFixed(3) + ')'
    g.fillRect(rng() * 254, rng() * 254, 1 + rng() * 2, 1 + rng() * 2)
  }
  // moss flecks
  for (let i = 0; i < 150; i++) {
    g.fillStyle = 'rgba(70,110,75,' + (0.05 + rng() * 0.09).toFixed(3) + ')'
    g.fillRect(rng() * 254, rng() * 254, 1 + rng() * 2, 1 + rng() * 2)
  }
  // sparse pale grit catching the moon
  for (let i = 0; i < 70; i++) {
    g.fillStyle = 'rgba(232,220,192,' + (0.03 + rng() * 0.05).toFixed(3) + ')'
    g.fillRect(rng() * 254, rng() * 254, 1, 1)
  }
  return c
}

// horizontal wood grain for logs and the hut's planks
function makeGrainPattern() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  const rng = mulberry32(7717)
  for (let y = 2; y < 62; y += 3 + rng() * 5) {
    const a = 0.05 + rng() * 0.12
    g.strokeStyle = rng() < 0.22 ? 'rgba(232,220,192,' + (a * 0.5).toFixed(3) + ')' : 'rgba(0,0,0,' + a.toFixed(3) + ')'
    g.lineWidth = 0.7 + rng() * 1.1
    g.beginPath()
    g.moveTo(0, y)
    g.quadraticCurveTo(64 + rng() * 128, y + (rng() - 0.5) * 4, 256, y)
    g.stroke()
  }
  // a few knots
  g.strokeStyle = 'rgba(0,0,0,0.18)'
  g.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const kx = 30 + rng() * 200
    const ky = 10 + rng() * 44
    for (let r = 2; r < 7; r += 2) {
      g.beginPath()
      g.ellipse(kx, ky, r * 1.6, r, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }
  return c
}

// thin strip of moon-glints for the water surface (drawn drifting, tiled)
function makeSparkleStrip() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 48
  const g = c.getContext('2d')
  const rng = mulberry32(2024)
  for (let i = 0; i < 90; i++) {
    const y = Math.pow(rng(), 1.7) * 46 // denser near the surface
    const w = 2 + rng() * 9
    const a = (0.04 + rng() * 0.12) * (1 - y / 60)
    g.fillStyle = rng() < 0.4 ? 'rgba(159,255,208,' + a.toFixed(3) + ')' : 'rgba(205,222,205,' + a.toFixed(3) + ')'
    const x = rng() * 512
    g.fillRect(x, y, w, 1)
    if (x + w > 512) g.fillRect(x - 512, y, w, 1) // wrap the tile seam
  }
  return c
}

// soft mist blob, drawn very faint and wide over the waterline
function makeMistSprite() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(128, 48, 4, 128, 48, 120)
  grad.addColorStop(0, 'rgba(170,200,185,0.55)')
  grad.addColorStop(0.5, 'rgba(150,180,170,0.22)')
  grad.addColorStop(1, 'rgba(150,180,170,0)')
  g.translate(128, 48)
  g.scale(1, 0.38)
  g.translate(-128, -48)
  g.fillStyle = grad
  g.fillRect(-120, -240, 500, 580)
  return c
}

// fine cloth weave for the characters' garments — filled INSIDE their
// transformed space so the weave sticks to (and swells/rocks with) the body
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
  // irregular slubs so the weave reads hand-loomed, not printed
  for (let i = 0; i < 26; i++) {
    g.fillStyle = rng() < 0.5 ? dark : light
    g.fillRect((rng() * 31) | 0, (rng() * 31) | 0, 2, 1)
  }
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

// ---------- renderer ----------
export function createRender(canvas, refs) {
  const ctx = canvas.getContext('2d')
  let W = 0
  let H = 0
  let ppm = 50
  let horizonY = 0

  // layers: procedural first, swapped for PNGs if they load.
  // The painted PNGs are opaque full scenes (each with its own sky), so
  // layers 1-3 are luminance-keyed at load: dark silhouettes stay, the sky
  // and moon fade to transparent. One-time cost; nothing per-frame.
  const layers = [makeLayer0(), makeTreeLayer(23, '#0a1316', 280, 520, 9, 760, false), makeTreeLayer(57, '#070d10', 420, 740, 6, 820, true), makeReedLayer()]
  const KEY_T = [0, 42, 36, 22] // luminance threshold per layer
  const KEY_S = [0, 24, 20, 10] // softness band — front layer keeps only true silhouettes
  // layer 3 (foreground reeds) draws as a bottom-aligned fringe, not full
  // height, so it never swallows the gameplay band
  const LAYER_H_FRAC = [1, 1, 1, 0.38]
  const LAYER_ALPHA = [1, 1, 1, 0.85]

  function keyLayer(img, t, s) {
    const c = document.createElement('canvas')
    c.width = LAYER_W
    c.height = LAYER_H
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0, LAYER_W, LAYER_H)
    const id = g.getImageData(0, 0, LAYER_W, LAYER_H)
    const d = id.data
    for (let p = 0; p < d.length; p += 4) {
      const lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114
      const a = (t + s - lum) / s
      d[p + 3] = a >= 1 ? 255 : a <= 0 ? 0 : (a * 255) | 0
    }
    g.putImageData(id, 0, 0)
    return c
  }

  for (let i = 0; i < 4; i++) {
    const img = new Image()
    const idx = i
    img.onload = () => {
      try {
        layers[idx] = idx === 0 ? img : keyLayer(img, KEY_T[idx], KEY_S[idx])
      } catch (e) {
        layers[idx] = img // tainted canvas etc. — use the raw image
      }
    }
    img.onerror = () => {} // keep procedural fallback
    img.src = '../assets/fiura/bg' + i + '.png'
  }

  const glowWarm = makeGlow(255, 205, 140)
  const glowCool = makeGlow(159, 255, 208)
  const glowRed = makeGlow(255, 90, 60)

  // surface textures — generated once; patterns are anchored per surface at
  // draw time (translate before fill) so they never swim against the camera
  const mudPat = ctx.createPattern(makeMudPattern(), 'repeat')
  const grainPat = ctx.createPattern(makeGrainPattern(), 'repeat')
  const sparkle = makeSparkleStrip()
  const mistSprite = makeMistSprite()
  // garment weaves — traveler's mended poncho, la Fiura's red rag dress
  const ponchoWeave = ctx.createPattern(makeWeave(515, 'rgba(0,0,0,0.30)', 'rgba(190,210,180,0.10)'), 'repeat')
  const ragWeave = ctx.createPattern(makeWeave(929, 'rgba(40,4,2,0.38)', 'rgba(255,150,110,0.12)'), 'repeat')

  // swamp atmosphere — fixed mote/mist fields, drifted by pure functions of t
  // (zero allocation per frame; positions are world-space so parallax is real)
  const motes = []
  const mists = []
  {
    const rng = mulberry32(909)
    for (let i = 0; i < 42; i++)
      motes.push({
        x: 4 + rng() * (LEVEL_END - 8),
        y: 0.3 + rng() * 2.8,
        r: 0.5 + rng() * 0.9,
        p1: rng() * 6.283,
        p2: rng() * 6.283,
        s1: 0.1 + rng() * 0.3,
        s2: 0.12 + rng() * 0.25,
        amp: 0.5 + rng() * 1.0,
      })
    for (let i = 0; i < 10; i++)
      mists.push({
        x: 6 + rng() * (LEVEL_END - 12),
        y: -0.15 + rng() * 0.8,
        w: 5 + rng() * 7,
        sp: 0.04 + rng() * 0.1,
        ph: rng() * 6.283,
        layer: rng() < 0.3 ? 1 : 0, // 1 = in front of the action, fainter
      })
  }

  // screen-space gradients, rebuilt only on resize and translated into place
  let waterGrad = null
  let depthGrad = null

  // pregenerated decor (grass tufts on grounds, blades on tussocks)
  const decor = []
  {
    const rng = mulberry32(4071)
    for (let i = 0; i < PLATFORMS.length; i++) {
      const p = PLATFORMS[i]
      const tufts = []
      if (p.t === 'ground') {
        const n = Math.max(3, Math.floor(p.w * 1.6))
        for (let k = 0; k < n; k++) {
          tufts.push({ dx: 0.2 + rng() * (p.w - 0.4), h: 0.12 + rng() * 0.22, lean: (rng() - 0.5) * 0.16, glow: rng() < 0.16 })
        }
      } else if (p.t === 'tussock') {
        const n = 7
        for (let k = 0; k < n; k++) {
          tufts.push({ dx: (k / (n - 1)) * p.w, h: 0.2 + rng() * 0.25, lean: (rng() - 0.5) * 0.3, glow: rng() < 0.3 })
        }
      }
      decor.push(tufts)
    }
  }

  function resize() {
    W = canvas.width = window.innerWidth
    H = canvas.height = window.innerHeight
    ppm = H / VIEW_H
    horizonY = H * 0.55 // play line sits above the foreground reed fringe
    waterGrad = ctx.createLinearGradient(0, 0, 0, H * 0.4)
    waterGrad.addColorStop(0, '#08141a') // cold teal cast at the surface
    waterGrad.addColorStop(0.25, '#040b10')
    waterGrad.addColorStop(1, '#010304') // true black down deep
    depthGrad = ctx.createLinearGradient(0, 0, 0, 5 * ppm)
    depthGrad.addColorStop(0, 'rgba(0,0,0,0)')
    depthGrad.addColorStop(0.4, 'rgba(0,0,0,0.18)')
    depthGrad.addColorStop(1, 'rgba(0,0,0,0.55)')
  }
  window.addEventListener('resize', resize)
  resize()

  // world -> screen (camera applied by caller via cx, cy each frame)
  let cx = 0
  let cy = 0
  let shx = 0
  let shy = 0
  function sx(wx) {
    return (wx - cx) * ppm + W * 0.5 + shx
  }
  function sy(wy) {
    return horizonY - (wy - cy) * ppm + shy
  }

  function drawLayer(i) {
    const img = layers[i]
    const lh = H * LAYER_H_FRAC[i]
    const yTop = H - lh
    const scale = lh / LAYER_H
    const tw = LAYER_W * scale
    const worldPx = cx * ppm * PARALLAX[i] + (i === 3 ? shx * -1 : 0)
    const k0 = Math.floor((worldPx - W * 0.5) / tw)
    const kEnd = Math.floor((worldPx + W * 0.5) / tw) + 1
    if (LAYER_ALPHA[i] !== 1) ctx.globalAlpha = LAYER_ALPHA[i]
    for (let k = k0; k <= kEnd; k++) {
      const x = k * tw - worldPx + W * 0.5
      if (k & 1) {
        ctx.save()
        ctx.translate(x + tw, yTop)
        ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0, tw, lh)
        ctx.restore()
      } else {
        ctx.drawImage(img, x, yTop, tw, lh)
      }
    }
    if (LAYER_ALPHA[i] !== 1) ctx.globalAlpha = 1
  }

  function drawWater(t) {
    const wy = sy(WATER_Y)
    if (wy < H) {
      // depth gradient — cold teal cast at the surface, true black below
      ctx.save()
      ctx.translate(0, wy)
      ctx.fillStyle = waterGrad
      ctx.fillRect(0, 0, W, H - wy)
      ctx.restore()
      // pale surface line
      ctx.fillStyle = 'rgba(150,195,175,0.12)'
      ctx.fillRect(0, wy, W, 1)
      // drifting moon-glint bands (prebuilt strip, two counter-drifting tiles)
      const base = cx * ppm
      let xd = -((((base - t * 12) % 512) + 512) % 512)
      ctx.globalAlpha = 0.55
      for (let x = xd; x < W; x += 512) ctx.drawImage(sparkle, x, wy + 1)
      xd = -((((base + t * 8) % 512) + 512) % 512)
      ctx.globalAlpha = 0.3
      for (let x = xd; x < W; x += 512) ctx.drawImage(sparkle, x, wy + 10, 512, 30)
      ctx.globalAlpha = 1
      // moving shimmer lines
      ctx.strokeStyle = 'rgba(120,170,150,0.07)'
      ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const ly = wy + 8 + i * 14
        if (ly > H) break
        ctx.beginPath()
        const phase = t * (0.4 + i * 0.13) + i * 2.1
        const xoff = ((phase * 30) % 80) - 80
        for (let x = xoff; x < W; x += 80) {
          ctx.moveTo(x, ly)
          ctx.lineTo(x + 34 + 12 * Math.sin(phase + x * 0.01), ly)
        }
        ctx.stroke()
      }
    }
  }

  function drawPlatform(i, t) {
    const p = PLATFORMS[i]
    const live = refs.plats[i]
    const top = p.y + live.off
    const x0 = sx(p.x)
    const x1 = sx(p.x + p.w)
    if (x1 < -40 || x0 > W + 40) return
    const yT = sy(top)
    if (p.t === 'ground') {
      const pw = x1 - x0
      ctx.fillStyle = '#0c1410'
      ctx.fillRect(x0, yT, pw, H - yT)
      // mud + moss grain, anchored to the island so it never swims
      ctx.save()
      ctx.translate(x0, yT)
      ctx.fillStyle = mudPat
      ctx.fillRect(0, 0, pw, H - yT)
      ctx.fillStyle = depthGrad // body fades to black underwater
      ctx.fillRect(0, 0, pw, H - yT)
      ctx.restore()
      // side shading so islands read as rounded masses
      ctx.fillStyle = 'rgba(0,0,0,0.32)'
      ctx.fillRect(x0, yT, 3, H - yT)
      ctx.fillRect(x1 - 3, yT, 3, H - yT)
      // mossy rim: moonlit top edge + soil shadow beneath
      ctx.fillStyle = '#1c3022'
      ctx.fillRect(x0, yT, pw, 3)
      ctx.fillStyle = 'rgba(159,255,208,0.10)'
      ctx.fillRect(x0, yT, pw, 1)
      ctx.fillStyle = 'rgba(0,0,0,0.30)'
      ctx.fillRect(x0, yT + 3, pw, 2)
      ctx.fillStyle = 'rgba(2,5,9,0.5)' // waterline stain
      const wl = sy(WATER_Y + 0.18)
      if (wl > yT) ctx.fillRect(x0, wl, pw, 3)
    } else if (p.t === 'tussock') {
      const cxm = (x0 + x1) / 2
      const squash = 1 - 0.45 * live.bounceT
      ctx.fillStyle = '#16281c'
      ctx.beginPath()
      ctx.ellipse(cxm, sy(top - 0.4 * squash + 0.4 * (1 - squash)) + (p.w * ppm) * 0.0, (p.w * ppm) / 2, 0.55 * ppm * squash, 0, Math.PI, 0, true)
      ctx.fill()
      // blades
      const tufts = decor[i]
      ctx.lineWidth = 2
      for (let k = 0; k < tufts.length; k++) {
        const tf = tufts[k]
        const bx = sx(p.x + tf.dx)
        const by = sy(top - (1 - squash) * 0.2)
        ctx.strokeStyle = tf.glow ? 'rgba(159,255,208,0.4)' : '#234430'
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + tf.lean * ppm, by - tf.h * ppm * squash)
        ctx.stroke()
      }
    } else {
      // log / sink log
      const hPix = 0.32 * ppm
      ctx.fillStyle = p.t === 'sink' ? '#1f1a10' : '#241812'
      ctx.beginPath()
      ctx.moveTo(x0 + 4, yT)
      ctx.lineTo(x1 - 4, yT)
      ctx.quadraticCurveTo(x1 + 5, yT + hPix / 2, x1 - 4, yT + hPix)
      ctx.lineTo(x0 + 4, yT + hPix)
      ctx.quadraticCurveTo(x0 - 5, yT + hPix / 2, x0 + 4, yT)
      ctx.fill()
      // wood grain overlay, clipped to the log silhouette, anchored to the log
      ctx.save()
      ctx.clip()
      ctx.translate(x0, yT)
      ctx.fillStyle = grainPat
      ctx.fillRect(-10, -4, x1 - x0 + 20, hPix + 8)
      ctx.restore()
      ctx.fillStyle = 'rgba(232,220,192,0.10)' // top sheen
      ctx.fillRect(x0 + 4, yT, x1 - x0 - 8, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.30)' // waterlogged belly
      ctx.fillRect(x0 + 5, yT + hPix - 3, x1 - x0 - 10, 3)
      // end rings
      ctx.strokeStyle = 'rgba(232,220,192,0.09)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(x1 - 4, yT + hPix / 2, 4, Math.max(0.5, hPix / 2 - 2), 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x1 - 4, yT + hPix / 2, 1.8, Math.max(0.4, hPix / 4 - 1), 0, 0, Math.PI * 2)
      ctx.stroke()
      if (p.t === 'sink' && live.off < -0.02) {
        // waterline lapping over a sinking log
        ctx.fillStyle = 'rgba(120,170,150,0.12)'
        ctx.fillRect(x0, yT - 2, x1 - x0, 2)
      }
    }
    // grass tufts on grounds
    if (p.t === 'ground') {
      const tufts = decor[i]
      ctx.lineWidth = 2
      for (let k = 0; k < tufts.length; k++) {
        const tf = tufts[k]
        const bx = sx(p.x + tf.dx)
        ctx.strokeStyle = tf.glow ? 'rgba(159,255,208,0.35)' : '#1d2c1f'
        ctx.beginPath()
        ctx.moveTo(bx, yT)
        ctx.lineTo(bx + tf.lean * ppm, yT - tf.h * ppm)
        ctx.stroke()
      }
    }
  }

  function drawLantern(i, t) {
    const cp = CHECKPOINTS[i]
    if (i === 0) return // spawn point has no lantern
    const x = sx(cp.x)
    if (x < -60 || x > W + 60) return
    const base = sy(cp.y)
    const top = base - 2.1 * ppm
    const lit = refs.cps[i].lit
    ctx.strokeStyle = '#120e0a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x, base)
    ctx.lineTo(x, top)
    ctx.moveTo(x, top)
    ctx.lineTo(x + 0.34 * ppm, top + 0.1 * ppm)
    ctx.stroke()
    const lx = x + 0.34 * ppm
    const ly = top + 0.22 * ppm
    const flick = 0.85 + 0.15 * Math.sin(t * 9 + i * 5) * Math.sin(t * 4.7 + i)
    const glow = lit ? glowCool : glowWarm
    const gs = (lit ? 2.6 : 1.7) * ppm * flick
    ctx.drawImage(glow, lx - gs / 2, ly - gs / 2, gs, gs)
    ctx.fillStyle = '#0e0c08' // little lantern house
    ctx.fillRect(lx - 5, ly - 8, 10, 14)
    ctx.fillStyle = lit ? '#9fffd0' : '#ffd9a0'
    ctx.fillRect(lx - 3, ly - 5, 6, 8)
    // faint reflection on the water
    ctx.globalAlpha = 0.1
    ctx.drawImage(glow, lx - gs / 2, sy(WATER_Y) - gs * 0.15, gs, gs * 0.3)
    ctx.globalAlpha = 1
  }

  function drawHut(t) {
    const x = sx(HUT_X)
    if (x < -400 || x > W + 400) return
    const base = sy(0)
    const w = 6 * ppm
    const hh = 2.6 * ppm
    // stilts
    ctx.fillStyle = '#0d0a08'
    ctx.fillRect(x - w * 0.4, base - 6, 8, 6)
    ctx.fillRect(x + w * 0.4 - 8, base - 6, 8, 6)
    // body
    ctx.fillStyle = '#100d0a'
    ctx.fillRect(x - w / 2, base - hh, w, hh)
    // weathered plank grain
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - w / 2, base - hh, w, hh)
    ctx.clip()
    ctx.translate(x - w / 2, base - hh)
    ctx.globalAlpha = 0.8
    ctx.fillStyle = grainPat
    ctx.fillRect(0, 0, w, hh)
    ctx.globalAlpha = 1
    ctx.restore()
    // shingle lines
    ctx.strokeStyle = 'rgba(232,220,192,0.05)'
    ctx.lineWidth = 1
    for (let k = 1; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(x - w / 2, base - (hh * k) / 5)
      ctx.lineTo(x + w / 2, base - (hh * k) / 5)
      ctx.stroke()
    }
    // steep roof
    ctx.fillStyle = '#0a0806'
    ctx.beginPath()
    ctx.moveTo(x - w * 0.62, base - hh)
    ctx.lineTo(x, base - hh - 1.7 * ppm)
    ctx.lineTo(x + w * 0.62, base - hh)
    ctx.closePath()
    ctx.fill()
    // moonlit ridge line on the roof
    ctx.strokeStyle = 'rgba(232,220,192,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - w * 0.62, base - hh)
    ctx.lineTo(x, base - hh - 1.7 * ppm)
    ctx.stroke()
    // chimney + smoke hint when ready
    ctx.fillStyle = '#0d0a08'
    ctx.fillRect(x + w * 0.22, base - hh - 1.2 * ppm, 0.3 * ppm, 0.7 * ppm)
    // window (always a faint ember, breathing warm light onto the wall)
    const wgs = 2.0 * ppm
    ctx.globalAlpha = 0.35 + 0.06 * Math.sin(t * 1.7)
    ctx.drawImage(glowWarm, x - w * 0.3 + 0.25 * ppm - wgs / 2, base - hh * 0.62 + 0.25 * ppm - wgs / 2, wgs, wgs)
    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(255,180,110,0.25)'
    ctx.fillRect(x - w * 0.3, base - hh * 0.62, 0.5 * ppm, 0.5 * ppm)
    // the door — dark until all herbs are carried
    const doorW = 0.95 * ppm
    const doorH = 1.6 * ppm
    const ready = refs.fx.hutOpen
    if (ready > 0.01) {
      const gs = 4.2 * ppm * ready * (0.9 + 0.1 * Math.sin(t * 3))
      ctx.drawImage(glowWarm, x - gs / 2, base - doorH * 0.5 - gs / 2, gs, gs)
    }
    ctx.fillStyle = ready > 0.5 ? '#ffd9a0' : '#07070a'
    ctx.fillRect(x - doorW / 2, base - doorH, doorW, doorH)
    ctx.strokeStyle = 'rgba(232,220,192,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(x - doorW / 2, base - doorH, doorW, doorH)
  }

  function drawHerb(i, t) {
    const h = refs.herbs[i]
    if (h.taken) return
    const x = sx(h.x)
    if (x < -80 || x > W + 80) return
    const bob = 0.08 * Math.sin(t * 2.2 + i * 1.7)
    const y = sy(h.y + bob)
    const pulse = 0.8 + 0.2 * Math.sin(t * 3.1 + i)
    const gs = 1.9 * ppm * pulse
    ctx.drawImage(glowCool, x - gs / 2, y - gs / 2, gs, gs)
    // little fern sprig
    ctx.strokeStyle = '#9fffd0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y + 0.18 * ppm)
    ctx.quadraticCurveTo(x + 3, y, x, y - 0.22 * ppm)
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let k = 0; k < 4; k++) {
      const fy = y + 0.12 * ppm - k * 0.09 * ppm
      ctx.moveTo(x, fy)
      ctx.lineTo(x - (5 - k), fy - 3)
      ctx.moveTo(x, fy)
      ctx.lineTo(x + (5 - k), fy - 3)
    }
    ctx.stroke()
  }

  function drawFiura(i, t) {
    const a = AMBUSHES[i]
    const live = refs.fiuras[i]
    const x = sx(a.x)
    if (x < -120 || x > W + 120) return
    const seatY = a.y + a.seat
    const by = sy(seatY)
    // stump seat for ambush 0 (others sit on existing log / pillar)
    if (a.seat > 0.3) {
      ctx.fillStyle = '#191209'
      ctx.fillRect(x - 0.32 * ppm, sy(a.y) - a.seat * ppm, 0.64 * ppm, a.seat * ppm)
      ctx.strokeStyle = 'rgba(232,220,192,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(x, sy(a.y) - a.seat * ppm, 0.3 * ppm, 3, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    const inh = live.inhale // 0..1 telegraph
    // inhale glow — her breath gathering, ~1 s warning
    if (inh > 0.01) {
      const gs = (1.5 + 2.6 * inh) * ppm
      ctx.globalAlpha = 0.5 + 0.5 * inh
      ctx.drawImage(glowRed, x - gs / 2, by - 0.55 * ppm - gs / 2, gs, gs)
      ctx.globalAlpha = 1
    }
    const swell = 1 + 0.18 * inh // her chest swells as she inhales
    const rock = Math.sin(t * 1.3 + i * 2) * 0.03
    ctx.save()
    ctx.translate(x, by)
    ctx.rotate(rock)
    ctx.scale(swell, swell)
    // tiny dangling feet — they kick idly under the hem (behind the cloak)
    const kick = Math.sin(t * 2.3 + i)
    ctx.strokeStyle = '#3a1610'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-0.1 * ppm, -0.04 * ppm)
    ctx.lineTo(-0.13 * ppm + kick * 2, 0.18 * ppm)
    ctx.moveTo(0.1 * ppm, -0.04 * ppm)
    ctx.lineTo(0.14 * ppm - kick * 2, 0.17 * ppm)
    ctx.stroke()
    ctx.fillStyle = '#241008'
    ctx.fillRect(-0.16 * ppm + kick * 2, 0.16 * ppm, 4, 3)
    ctx.fillRect(0.11 * ppm - kick * 2, 0.15 * ppm, 4, 3)
    // red dress — seated mass with a ragged hem, flutter offset from the rock
    ctx.fillStyle = '#6e1f14'
    ctx.beginPath()
    ctx.moveTo(-0.44 * ppm, 0)
    ctx.quadraticCurveTo(-0.34 * ppm, -0.6 * ppm, 0, -0.72 * ppm)
    ctx.quadraticCurveTo(0.34 * ppm, -0.6 * ppm, 0.44 * ppm, 0)
    for (let k = 0; k <= 5; k++) {
      const hx = 0.44 - (k * 0.88) / 5
      const dip = (k & 1 ? 0.07 : 0.018) * ppm + Math.sin(t * 1.9 + k * 1.7 + i) * 0.018 * ppm
      ctx.lineTo(hx * ppm, dip)
    }
    ctx.closePath()
    ctx.fill()
    // hand-loomed weave, anchored to her body (same path, second fill)
    ctx.globalAlpha = 0.5
    ctx.fillStyle = ragWeave
    ctx.fill()
    ctx.globalAlpha = 1
    // shadow side — the moon hangs high and left, so her right falls dark
    ctx.fillStyle = 'rgba(20,4,2,0.38)'
    ctx.beginPath()
    ctx.moveTo(0.1 * ppm, -0.7 * ppm)
    ctx.quadraticCurveTo(0.34 * ppm, -0.6 * ppm, 0.44 * ppm, 0)
    ctx.lineTo(0.12 * ppm, 0)
    ctx.quadraticCurveTo(0.2 * ppm, -0.4 * ppm, 0.1 * ppm, -0.7 * ppm)
    ctx.closePath()
    ctx.fill()
    // warm fold highlight down the front
    ctx.fillStyle = '#a93620'
    ctx.beginPath()
    ctx.moveTo(-0.2 * ppm, 0)
    ctx.quadraticCurveTo(-0.12 * ppm, -0.5 * ppm, 0.04 * ppm, -0.64 * ppm)
    ctx.quadraticCurveTo(0, -0.3 * ppm, 0.06 * ppm, 0)
    ctx.closePath()
    ctx.fill()
    // cold moon rim along her left shoulder line
    ctx.strokeStyle = 'rgba(207,232,210,0.30)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-0.4 * ppm, -0.08 * ppm)
    ctx.quadraticCurveTo(-0.32 * ppm, -0.56 * ppm, -0.02 * ppm, -0.7 * ppm)
    ctx.stroke()
    // her gathering breath underlights the chest while she inhales
    if (inh > 0.02) {
      ctx.globalAlpha = inh * 0.4
      ctx.fillStyle = '#ff5a3c'
      ctx.beginPath()
      ctx.ellipse(0, -0.52 * ppm, 0.16 * ppm, 0.12 * ppm, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // wild hair — the mane sways a beat BEHIND the body rock (secondary motion)
    const hsw = Math.sin(t * 1.3 + i * 2 - 0.7) * 0.04
    ctx.fillStyle = '#120d0b'
    ctx.beginPath()
    ctx.arc(0, -0.78 * ppm, 0.27 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#120d0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 9; k++) {
      const ang = -Math.PI * 1.05 + k * 0.26 + 0.12 * Math.sin(t * 2 + k * 1.3) + hsw
      const r1 = (0.4 + 0.07 * Math.sin(t * 1.7 + k * 2.1)) * ppm
      ctx.moveTo(Math.cos(ang) * 0.18 * ppm, -0.78 * ppm + Math.sin(ang) * 0.18 * ppm)
      ctx.lineTo(Math.cos(ang) * r1, -0.78 * ppm + Math.sin(ang) * r1)
    }
    ctx.stroke()
    // a few strands catch the moon
    ctx.strokeStyle = 'rgba(170,150,130,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const ang = -Math.PI * 0.95 + k * 0.2 + 0.12 * Math.sin(t * 2 + k) + hsw
      ctx.moveTo(Math.cos(ang) * 0.2 * ppm, -0.78 * ppm + Math.sin(ang) * 0.2 * ppm)
      ctx.lineTo(Math.cos(ang) * 0.4 * ppm, -0.78 * ppm + Math.sin(ang) * 0.4 * ppm)
    }
    ctx.stroke()
    // she combs that mane with a glint of gold — the stroke pauses to inhale
    if (inh < 0.95) {
      const strokePos = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1)
      const cAng = -Math.PI * 0.62
      const cr = (0.24 + 0.18 * strokePos) * ppm
      const cxp = Math.cos(cAng) * cr
      const cyp = -0.78 * ppm + Math.sin(cAng) * cr
      ctx.globalAlpha = 1 - inh
      ctx.strokeStyle = '#5a1810' // her sleeve, raised through the hair
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-0.3 * ppm, -0.42 * ppm)
      ctx.quadraticCurveTo(-0.38 * ppm, -0.6 * ppm, cxp, cyp)
      ctx.stroke()
      ctx.fillStyle = '#e8c060' // the little golden comb of the drowned
      ctx.fillRect(cxp - 4, cyp - 2, 8, 3)
      ctx.strokeStyle = '#e8c060'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(cxp + k * 3, cyp + 1)
        ctx.lineTo(cxp + k * 3, cyp + 5)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // pale little hag face — brow shadow, hooked nose, crooked grin
    ctx.fillStyle = '#d8c4a8'
    ctx.beginPath()
    ctx.arc(0, -0.74 * ppm, 0.13 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(70,40,28,0.35)'
    ctx.beginPath()
    ctx.ellipse(0, -0.8 * ppm, 0.115 * ppm, 0.05 * ppm, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c4ad8e'
    ctx.beginPath()
    ctx.moveTo(-0.005 * ppm, -0.77 * ppm)
    ctx.lineTo(-0.045 * ppm, -0.7 * ppm)
    ctx.lineTo(0.015 * ppm, -0.715 * ppm)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(60,25,18,0.8)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-0.05 * ppm, -0.675 * ppm)
    ctx.quadraticCurveTo(0, -0.655 * ppm, 0.06 * ppm, -0.675 * ppm)
    ctx.stroke()
    // eyes — ember-dim at rest, spectral green as the charm gathers
    ctx.fillStyle = inh > 0.05 ? '#9fffd0' : '#c75a32'
    ctx.fillRect(-0.07 * ppm, -0.79 * ppm, 3, 3)
    ctx.fillRect(0.035 * ppm, -0.785 * ppm, 3, 2) // one eye narrower — feroz
    if (inh > 0.05) {
      const egs = 0.3 * ppm
      ctx.globalAlpha = inh * 0.8
      ctx.drawImage(glowCool, -0.07 * ppm + 1.5 - egs / 2, -0.78 * ppm + 1.5 - egs / 2, egs, egs)
      ctx.drawImage(glowCool, 0.035 * ppm + 1.5 - egs / 2, -0.78 * ppm + 1.5 - egs / 2, egs, egs)
      ctx.globalAlpha = 1
      // breath wisps — the air itself bending toward her mouth
      ctx.strokeStyle = '#ff7a50'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.35 * inh
      for (let k = 0; k < 3; k++) {
        const wr = (0.55 - 0.3 * inh) * ppm * (1 + k * 0.25)
        const wo = 0.2 * Math.sin(t * 4 + k * 2)
        ctx.beginPath()
        ctx.arc(0, -0.7 * ppm, wr, -0.5 + wo, 0.6 + wo)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  function drawRings() {
    const rings = refs.rings
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i]
      if (!r.on) continue
      const x = sx(r.x)
      const y = sy(r.y)
      const rp = r.r * ppm
      const fade = 1 - r.r / 6.6
      ctx.strokeStyle = '#ff7a50'
      ctx.globalAlpha = 0.5 * fade + 0.15
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, rp, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#9fffd0'
      ctx.globalAlpha = 0.22 * fade
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.arc(x, y, rp, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  function drawPlayer(t) {
    const p = refs.player
    const x = sx(p.x)
    const y = sy(p.y)
    const blink = p.invulnT > 0 && Math.sin(t * 30) > 0
    const baseA = blink ? 0.45 : 1
    if (blink) ctx.globalAlpha = 0.45
    // lantern pendulum — swings with the stride, breathes at idle; the glow
    // outside the body transform follows the same swing
    const speed = Math.min(1, Math.abs(p.vx) / 4)
    const sway = Math.sin(p.walkPhase * 0.5) * 0.06 * speed + Math.sin(t * 1.6) * 0.018
    const lanX = 0.3 + sway
    const lanY = -0.5 + Math.abs(sway) * 0.3
    const gs = 2.4 * ppm * (0.9 + 0.1 * Math.sin(t * 7.3))
    ctx.drawImage(glowWarm, x + p.face * lanX * ppm - gs / 2, y + (lanY - 0.05) * ppm - gs / 2, gs, gs)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(p.face, 1 - 0.18 * p.landT)
    const lean = Math.max(-0.18, Math.min(0.18, p.vx * 0.022))
    ctx.rotate(lean * p.face)
    // legs — two segments with a knee bend; tucked stride in the air
    const lp = p.grounded ? Math.sin(p.walkPhase) : 0.45
    ctx.strokeStyle = '#11160f'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, -0.36 * ppm)
    ctx.quadraticCurveTo((lp * 0.16 + 0.07) * ppm, -0.18 * ppm, lp * 0.16 * ppm, 0)
    ctx.moveTo(0, -0.36 * ppm)
    ctx.quadraticCurveTo((-lp * 0.16 + 0.07) * ppm, -0.18 * ppm, -lp * 0.16 * ppm, 0)
    ctx.stroke()
    ctx.fillStyle = '#0c100c' // boots
    ctx.fillRect(lp * 0.16 * ppm - 2, -3, 7, 3)
    ctx.fillRect(-lp * 0.16 * ppm - 2, -3, 7, 3)
    // scarf tail — flutters a beat behind the body (secondary motion)
    const flut = Math.sin(t * 3.1 + p.walkPhase * 1.7)
    ctx.strokeStyle = '#8e7f5e'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-0.06 * ppm, -0.86 * ppm)
    ctx.quadraticCurveTo(-0.28 * ppm, (-0.82 + 0.05 * flut) * ppm, (-0.42 - speed * 0.1) * ppm, (-0.74 + 0.08 * flut) * ppm)
    ctx.stroke()
    // poncho body — ragged hem swings opposite the stride
    const hemSw = -lp * 0.03 - lean * 0.2
    ctx.fillStyle = '#1a2018'
    ctx.beginPath()
    ctx.moveTo(-0.24 * ppm, -0.05 * ppm)
    ctx.quadraticCurveTo(-0.26 * ppm, -0.8 * ppm, 0, -0.95 * ppm)
    ctx.quadraticCurveTo(0.24 * ppm, -0.8 * ppm, 0.2 * ppm, -0.05 * ppm)
    ctx.lineTo((0.13 + hemSw) * ppm, -0.02 * ppm)
    ctx.lineTo((0.04 + hemSw) * ppm, (-0.06 + 0.012 * flut) * ppm)
    ctx.lineTo((-0.06 + hemSw) * ppm, -0.015 * ppm)
    ctx.lineTo((-0.16 + hemSw) * ppm, (-0.055 - 0.012 * flut) * ppm)
    ctx.closePath()
    ctx.fill()
    // hand-loomed weave, anchored to the poncho (same path, second fill)
    ctx.globalAlpha = baseA * 0.55
    ctx.fillStyle = ponchoWeave
    ctx.fill()
    ctx.globalAlpha = baseA
    // back-edge shadow — he walks with the moon behind his shoulder
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.beginPath()
    ctx.moveTo(-0.24 * ppm, -0.05 * ppm)
    ctx.quadraticCurveTo(-0.26 * ppm, -0.8 * ppm, 0, -0.95 * ppm)
    ctx.quadraticCurveTo(-0.12 * ppm, -0.7 * ppm, -0.1 * ppm, -0.05 * ppm)
    ctx.closePath()
    ctx.fill()
    // cold moon rim down the back edge
    ctx.strokeStyle = 'rgba(190,220,200,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-0.235 * ppm, -0.1 * ppm)
    ctx.quadraticCurveTo(-0.255 * ppm, -0.78 * ppm, -0.01 * ppm, -0.94 * ppm)
    ctx.stroke()
    // warm lantern light kissing the front fold
    ctx.strokeStyle = 'rgba(255,200,130,0.30)'
    ctx.beginPath()
    ctx.moveTo(0.2 * ppm, -0.1 * ppm)
    ctx.quadraticCurveTo(0.235 * ppm, -0.75 * ppm, 0.02 * ppm, -0.93 * ppm)
    ctx.stroke()
    // parchment trim + a patch mended many winters ago
    ctx.strokeStyle = 'rgba(232,220,192,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-0.2 * ppm, -0.12 * ppm)
    ctx.quadraticCurveTo(-0.21 * ppm, -0.7 * ppm, 0, -0.86 * ppm)
    ctx.stroke()
    ctx.fillStyle = '#222a20'
    ctx.fillRect(0.02 * ppm, -0.5 * ppm, 0.11 * ppm, 0.13 * ppm)
    ctx.strokeStyle = 'rgba(232,220,192,0.20)'
    ctx.beginPath()
    ctx.moveTo(0.03 * ppm, -0.5 * ppm)
    ctx.lineTo(0.03 * ppm + 3, -0.5 * ppm - 2)
    ctx.moveTo(0.08 * ppm, -0.5 * ppm)
    ctx.lineTo(0.08 * ppm + 3, -0.5 * ppm - 2)
    ctx.moveTo(0.13 * ppm, -0.44 * ppm)
    ctx.lineTo(0.13 * ppm + 3, -0.44 * ppm - 2)
    ctx.stroke()
    // hood — moonlit rim behind, shadowed cavity within
    ctx.fillStyle = '#242c24'
    ctx.beginPath()
    ctx.arc(0.02 * ppm, -1.0 * ppm, 0.17 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(190,220,200,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0.02 * ppm, -1.0 * ppm, 0.165 * ppm, Math.PI * 0.85, Math.PI * 1.6)
    ctx.stroke()
    ctx.fillStyle = '#0a0d0a'
    ctx.beginPath()
    ctx.arc(0.07 * ppm, -0.99 * ppm, 0.1 * ppm, 0, Math.PI * 2)
    ctx.fill()
    // the lantern finds a sliver of face — nose and chin in warm light
    ctx.fillStyle = 'rgba(255,200,140,0.45)'
    ctx.beginPath()
    ctx.moveTo(0.145 * ppm, -1.03 * ppm)
    ctx.quadraticCurveTo(0.165 * ppm, -0.99 * ppm, 0.145 * ppm, -0.975 * ppm)
    ctx.quadraticCurveTo(0.135 * ppm, -0.955 * ppm, 0.12 * ppm, -0.95 * ppm)
    ctx.quadraticCurveTo(0.14 * ppm, -0.98 * ppm, 0.145 * ppm, -1.03 * ppm)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,220,170,0.8)' // a glint of eye in the dark
    ctx.fillRect(0.085 * ppm, -1.01 * ppm, 2, 2)
    // lantern arm — follows the pendulum swing
    ctx.strokeStyle = '#1a2018'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0.05 * ppm, -0.6 * ppm)
    ctx.quadraticCurveTo(0.18 * ppm, (-0.56 + sway * 0.2) * ppm, lanX * ppm, (lanY + 0.04) * ppm)
    ctx.stroke()
    // the lantern itself — a little tin house with a breathing ember
    ctx.save()
    ctx.translate(lanX * ppm, lanY * ppm)
    ctx.rotate(-sway * 2)
    ctx.fillStyle = '#0e0c08'
    ctx.fillRect(-4.5, -3, 9, 2) // roof
    ctx.fillRect(-3.5, -2, 7, 10)
    ctx.globalAlpha = baseA * (0.85 + 0.15 * Math.sin(t * 7.3))
    ctx.fillStyle = '#ffd9a0'
    ctx.fillRect(-2.5, 0, 5, 6)
    ctx.globalAlpha = baseA
    ctx.strokeStyle = 'rgba(20,16,10,0.8)' // glass bar
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 6)
    ctx.stroke()
    ctx.restore()
    ctx.restore()
    if (blink) ctx.globalAlpha = 1
  }

  // drifting spirit motes — world-anchored fireflies of the pantanal
  function drawMotes(t) {
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i]
      const x = sx(m.x + Math.sin(t * m.s1 + m.p1) * m.amp)
      if (x < -24 || x > W + 24) continue
      const y = sy(m.y + Math.sin(t * m.s2 + m.p2) * 0.45)
      const a = 0.09 + 0.09 * Math.sin(t * (0.6 + m.s2) + m.p1)
      if (a < 0.02) continue
      ctx.globalAlpha = a
      const gs = 0.55 * ppm * m.r
      ctx.drawImage(glowCool, x - gs / 2, y - gs / 2, gs, gs)
    }
    ctx.globalAlpha = 1
  }

  // low mist banks crawling over the waterline (layer 0 behind, 1 in front)
  function drawMist(t, layer) {
    for (let i = 0; i < mists.length; i++) {
      const m = mists[i]
      if (m.layer !== layer) continue
      const mw = m.w * ppm
      const x = sx(m.x + Math.sin(t * m.sp + m.ph) * 1.8)
      if (x < -mw || x > W + mw) continue
      const y = sy(m.y)
      ctx.globalAlpha = (layer === 1 ? 0.045 : 0.07) + 0.02 * Math.sin(t * 0.23 + m.ph)
      ctx.drawImage(mistSprite, x - mw / 2, y - mw * 0.17, mw, mw * 0.34)
    }
    ctx.globalAlpha = 1
  }

  function drawParticles() {
    const pool = refs.particles
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]
      if (p.life <= 0) continue
      const a = p.life / p.max
      const x = sx(p.x)
      const y = sy(p.y)
      if (p.type === 0) {
        // dust
        ctx.globalAlpha = a * 0.5
        ctx.fillStyle = '#c8b996'
        ctx.fillRect(x - 2, y - 2, 4, 4)
      } else if (p.type === 1) {
        // bubble
        ctx.globalAlpha = a * 0.7
        ctx.strokeStyle = '#9fffd0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, p.size * ppm, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.type === 2) {
        // splash droplet
        ctx.globalAlpha = a * 0.8
        ctx.fillStyle = '#8cb4c8'
        ctx.fillRect(x - 1, y - 3, 3, 6)
      } else if (p.type === 3) {
        // footstep ripple on wet ground
        ctx.globalAlpha = a * 0.35
        ctx.strokeStyle = '#9fffd0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(x, y, (1 - a + 0.2) * 0.4 * ppm, (1 - a + 0.2) * 0.1 * ppm, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.type === 4) {
        // herb spark
        ctx.globalAlpha = a
        ctx.fillStyle = '#9fffd0'
        ctx.fillRect(x - 1, y - 1, 3, 3)
      } else {
        // charm spark
        ctx.globalAlpha = a
        ctx.fillStyle = '#ff7a50'
        ctx.fillRect(x - 1, y - 1, 3, 3)
      }
    }
    ctx.globalAlpha = 1
  }

  // quantized flash fills, precomputed — no string building in draw()
  const FLASH_STRS = []
  {
    const bases = ['rgba(232,220,192,', 'rgba(200,60,40,', 'rgba(159,255,208,']
    for (let c = 0; c < 3; c++) {
      const row = []
      for (let q = 0; q <= 20; q++) row.push(bases[c] + ((q / 20) * 0.35).toFixed(3) + ')')
      FLASH_STRS.push(row)
    }
  }

  function draw(t) {
    const fx = refs.fx
    cx = refs.cam.x
    cy = refs.cam.y
    if (fx.shakeT > 0) {
      const s = fx.shakeT * fx.shakeAmp * ppm * 0.04
      shx = Math.sin(t * 47.3) * s
      shy = Math.cos(t * 39.1) * s * 0.7
    } else {
      shx = 0
      shy = 0
    }
    ctx.clearRect(0, 0, W, H)
    drawLayer(0)
    drawLayer(1)
    drawLayer(2)
    drawWater(t)
    drawMist(t, 0)
    for (let i = 0; i < PLATFORMS.length; i++) drawPlatform(i, t)
    drawMotes(t)
    for (let i = 1; i < CHECKPOINTS.length; i++) drawLantern(i, t)
    drawHut(t)
    for (let i = 0; i < HERBS.length; i++) drawHerb(i, t)
    for (let i = 0; i < AMBUSHES.length; i++) drawFiura(i, t)
    drawRings()
    drawPlayer(t)
    drawParticles()
    drawMist(t, 1)
    drawLayer(3) // foreground reeds in front of everything
    if (fx.flashT > 0) {
      const q = Math.min(20, (fx.flashT * 20) | 0)
      ctx.fillStyle = FLASH_STRS[fx.flashColor][q]
      ctx.fillRect(0, 0, W, H)
    }
  }

  return { draw, resize }
}
