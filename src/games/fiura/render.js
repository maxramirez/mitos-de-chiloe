// render.js — LA FIURA · canvas2d painter.
// Painted parallax: tries /assets/fiura/bg0..3.png (1536x1024, sky -> reeds);
// every layer has a procedural fallback generated at init so the game looks
// complete with zero assets. Layers scroll at factors 0.05/0.2/0.5/1.15 and
// repeat by MIRROR tiling (every odd tile flipped) so seams never show.
// draw() is allocation-free: glow sprites, gradients, decor and color strings
// are all prebuilt at init.
import { PLATFORMS, HERBS, CHECKPOINTS, AMBUSHES, WATER_Y, HUT_X } from './level.js'

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
    img.src = '/assets/fiura/bg' + i + '.png'
  }

  const glowWarm = makeGlow(255, 205, 140)
  const glowCool = makeGlow(159, 255, 208)
  const glowRed = makeGlow(255, 90, 60)

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
      ctx.fillStyle = '#020509'
      ctx.fillRect(0, wy, W, H - wy)
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
      ctx.fillStyle = '#0c1410'
      ctx.fillRect(x0, yT, x1 - x0, H - yT)
      ctx.fillStyle = '#16241a' // mossy rim
      ctx.fillRect(x0, yT, x1 - x0, 4)
      ctx.fillStyle = 'rgba(2,5,9,0.5)' // waterline stain
      const wl = sy(WATER_Y + 0.18)
      if (wl > yT) ctx.fillRect(x0, wl, x1 - x0, 3)
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
      ctx.fillStyle = 'rgba(232,220,192,0.10)' // top sheen
      ctx.fillRect(x0 + 4, yT, x1 - x0 - 8, 2)
      // end rings
      ctx.strokeStyle = 'rgba(232,220,192,0.09)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(x1 - 4, yT + hPix / 2, 4, hPix / 2 - 2, 0, 0, Math.PI * 2)
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
    // chimney + smoke hint when ready
    ctx.fillStyle = '#0d0a08'
    ctx.fillRect(x + w * 0.22, base - hh - 1.2 * ppm, 0.3 * ppm, 0.7 * ppm)
    // window (always a faint ember)
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
    // red cloak — seated triangle blob
    ctx.fillStyle = '#7e2418'
    ctx.beginPath()
    ctx.moveTo(-0.42 * ppm, 0)
    ctx.quadraticCurveTo(-0.3 * ppm, -0.62 * ppm, 0, -0.7 * ppm)
    ctx.quadraticCurveTo(0.3 * ppm, -0.62 * ppm, 0.42 * ppm, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#a93620' // cloak highlight
    ctx.beginPath()
    ctx.moveTo(-0.2 * ppm, 0)
    ctx.quadraticCurveTo(-0.12 * ppm, -0.5 * ppm, 0.05 * ppm, -0.62 * ppm)
    ctx.quadraticCurveTo(0.02 * ppm, -0.3 * ppm, 0.08 * ppm, 0)
    ctx.closePath()
    ctx.fill()
    // tiny dangling feet
    ctx.strokeStyle = '#3a1610'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-0.1 * ppm, 0)
    ctx.lineTo(-0.12 * ppm, 0.18 * ppm)
    ctx.moveTo(0.1 * ppm, 0)
    ctx.lineTo(0.13 * ppm, 0.17 * ppm)
    ctx.stroke()
    // wild hair
    ctx.fillStyle = '#120d0b'
    ctx.beginPath()
    ctx.arc(0, -0.78 * ppm, 0.26 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#120d0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 7; k++) {
      const ang = -Math.PI * 0.9 + k * 0.28 + 0.1 * Math.sin(t * 2 + k)
      ctx.moveTo(Math.cos(ang) * 0.2 * ppm, -0.78 * ppm + Math.sin(ang) * 0.2 * ppm)
      ctx.lineTo(Math.cos(ang) * 0.42 * ppm, -0.78 * ppm + Math.sin(ang) * 0.42 * ppm)
    }
    ctx.stroke()
    // pale little face + eyes (spectral when inhaling)
    ctx.fillStyle = '#d8c4a8'
    ctx.beginPath()
    ctx.arc(0, -0.74 * ppm, 0.13 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = inh > 0.05 ? '#9fffd0' : '#1a0d08'
    ctx.fillRect(-0.07 * ppm, -0.78 * ppm, 3, 3)
    ctx.fillRect(0.03 * ppm, -0.78 * ppm, 3, 3)
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
    if (blink) ctx.globalAlpha = 0.45
    // hand lantern glow — the traveler carries a small light
    const gs = 2.4 * ppm * (0.9 + 0.1 * Math.sin(t * 7.3))
    ctx.drawImage(glowWarm, x + p.face * 0.3 * ppm - gs / 2, y - 0.55 * ppm - gs / 2, gs, gs)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(p.face, 1 - 0.18 * p.landT)
    const lean = Math.max(-0.18, Math.min(0.18, p.vx * 0.022))
    ctx.rotate(lean * p.face)
    // legs (walk cycle)
    const lp = Math.sin(p.walkPhase)
    ctx.strokeStyle = '#11160f'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, -0.36 * ppm)
    ctx.lineTo(lp * 0.16 * ppm, 0)
    ctx.moveTo(0, -0.36 * ppm)
    ctx.lineTo(-lp * 0.16 * ppm, 0)
    ctx.stroke()
    // cloak body
    ctx.fillStyle = '#1a2018'
    ctx.beginPath()
    ctx.moveTo(-0.24 * ppm, -0.05 * ppm)
    ctx.quadraticCurveTo(-0.26 * ppm, -0.8 * ppm, 0, -0.95 * ppm)
    ctx.quadraticCurveTo(0.24 * ppm, -0.8 * ppm, 0.2 * ppm, -0.05 * ppm)
    ctx.closePath()
    ctx.fill()
    // parchment trim
    ctx.strokeStyle = 'rgba(232,220,192,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-0.2 * ppm, -0.12 * ppm)
    ctx.quadraticCurveTo(-0.21 * ppm, -0.7 * ppm, 0, -0.86 * ppm)
    ctx.stroke()
    // hood + shadowed face
    ctx.fillStyle = '#242c24'
    ctx.beginPath()
    ctx.arc(0.02 * ppm, -1.0 * ppm, 0.17 * ppm, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a0d0a'
    ctx.beginPath()
    ctx.arc(0.07 * ppm, -0.99 * ppm, 0.1 * ppm, 0, Math.PI * 2)
    ctx.fill()
    // lantern arm + lantern
    ctx.strokeStyle = '#1a2018'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0.05 * ppm, -0.6 * ppm)
    ctx.lineTo(0.3 * ppm, -0.5 * ppm)
    ctx.stroke()
    ctx.fillStyle = '#0e0c08'
    ctx.fillRect(0.26 * ppm, -0.52 * ppm, 6, 8)
    ctx.fillStyle = '#ffd9a0'
    ctx.fillRect(0.27 * ppm + 1, -0.5 * ppm, 4, 5)
    ctx.restore()
    if (blink) ctx.globalAlpha = 1
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
    for (let i = 0; i < PLATFORMS.length; i++) drawPlatform(i, t)
    for (let i = 1; i < CHECKPOINTS.length; i++) drawLantern(i, t)
    drawHut(t)
    for (let i = 0; i < HERBS.length; i++) drawHerb(i, t)
    for (let i = 0; i < AMBUSHES.length; i++) drawFiura(i, t)
    drawRings()
    drawPlayer(t)
    drawParticles()
    drawLayer(3) // foreground reeds in front of everything
    if (fx.flashT > 0) {
      const q = Math.min(20, (fx.flashT * 20) | 0)
      ctx.fillStyle = FLASH_STRS[fx.flashColor][q]
      ctx.fillRect(0, 0, W, H)
    }
  }

  return { draw, resize }
}
