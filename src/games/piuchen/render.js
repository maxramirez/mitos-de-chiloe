// render.js — EL PIUCHÉN · all 2D canvas drawing + visual fx pools.
// Static scenery (sky, stars, moon, islands, canal, meadow, fold fence, hut)
// is pre-rendered once to an offscreen canvas; the dawn warmth is a second
// pre-built layer faded in by the dawn meter. A painted sky plate
// (/assets/piuchen/sky.png) is swapped in under the procedural foreground if
// it loads — if it fails, the procedural sky below is the permanent fallback.
// Mist / cloud / ground-noise textures are generated once at boot. Particle
// and score-popup pools are fixed-size and recycled so the frame loop
// allocates nothing.

export const W = 960
export const H = 600
export const GROUND = 556

const TAU = Math.PI * 2
const INK = '#e8dcc0'
const GLOW = '#9fffd0'

// --- boot-time procedural textures -----------------------------------------
function makeNoiseTex() {
  // ground mottle: moss / shadow / pale flecks, tiled over the meadow
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 192
  const g = c.getContext('2d')
  for (let i = 0; i < 2600; i++) {
    const v = Math.random()
    g.fillStyle = v < 0.5 ? 'rgba(22,38,20,0.30)' : v < 0.85 ? 'rgba(5,8,6,0.32)' : 'rgba(196,188,158,0.09)'
    const s = v > 0.96 ? 2 : 1
    g.fillRect(Math.random() * 192, Math.random() * 192, s + Math.random() * 1.4, s)
  }
  return c
}

function makeMistTex() {
  // a soft fog bank, drawn drifting at 2-3 depths over the fold;
  // many large overlapping flattened blobs so it reads as one continuous veil
  const c = document.createElement('canvas')
  c.width = 440
  c.height = 90
  const g = c.getContext('2d')
  for (let i = 0; i < 56; i++) {
    const x = Math.random() * 440
    const y = 36 + Math.random() * 26
    const r = 40 + Math.random() * 42
    g.save()
    g.translate(x, y)
    g.scale(1.8, 0.55)
    const rg = g.createRadialGradient(0, 0, 2, 0, 0, r)
    rg.addColorStop(0, 'rgba(172,194,176,0.05)')
    rg.addColorStop(0.6, 'rgba(172,194,176,0.025)')
    rg.addColorStop(1, 'rgba(172,194,176,0)')
    g.fillStyle = rg
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }
  return c
}

function makeCloudTex() {
  // one ragged moonlit wisp, reused at two drift speeds across the sky
  const c = document.createElement('canvas')
  c.width = 560
  c.height = 130
  const g = c.getContext('2d')
  for (let i = 0; i < 20; i++) {
    const x = 60 + Math.random() * 440
    const y = 40 + Math.sin(i * 1.7) * 22 + Math.random() * 18
    const r = 14 + Math.random() * 26
    g.save()
    g.translate(x, y)
    g.scale(2.6, 1)
    const rg = g.createRadialGradient(0, 0, 1, 0, 0, r)
    rg.addColorStop(0, 'rgba(188,198,188,0.09)')
    rg.addColorStop(1, 'rgba(188,198,188,0)')
    g.fillStyle = rg
    g.fillRect(-r, -r, r * 2, r * 2)
    g.restore()
  }
  return c
}

function makeWoolTex(seed) {
  // one moonlit wool body, prebaked at 2x (drawn 44x32 in-game): lobed
  // fleece silhouette, belly shadow falling away from the moon, rim light
  // from the moon side (upper-right), and wool-curl speckles. Three seeds
  // give the flock individual fleeces for free.
  const c = document.createElement('canvas')
  c.width = 88
  c.height = 64
  const g = c.getContext('2d')
  const cx = 44
  const cy = 30
  g.fillStyle = '#7f7760'
  g.beginPath()
  g.ellipse(cx, cy, 29, 19, 0, 0, TAU)
  g.fill()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + seed * 1.7
    const rr = 5.5 + ((i * 7 + seed * 5) % 4)
    g.beginPath()
    g.arc(cx + Math.cos(a) * 26, cy + Math.sin(a) * 16.5, rr, 0, TAU)
    g.fill()
  }
  // every layer below lands only on the fleece
  g.globalCompositeOperation = 'source-atop'
  // belly shadow, away from the moon (lower-left)
  const sh = g.createRadialGradient(cx - 10, cy + 16, 4, cx - 4, cy + 8, 36)
  sh.addColorStop(0, 'rgba(18,15,10,0.6)')
  sh.addColorStop(1, 'rgba(18,15,10,0)')
  g.fillStyle = sh
  g.fillRect(0, 0, 88, 64)
  // moon rim along the upper-right shoulder
  const rim = g.createRadialGradient(cx + 20, cy - 18, 2, cx + 12, cy - 8, 34)
  rim.addColorStop(0, 'rgba(226,216,188,0.5)')
  rim.addColorStop(0.55, 'rgba(226,216,188,0.16)')
  rim.addColorStop(1, 'rgba(226,216,188,0)')
  g.fillStyle = rim
  g.fillRect(0, 0, 88, 64)
  // wool curls: short arc strokes, dark in the shade, pale where the moon combs
  for (let i = 0; i < 46; i++) {
    const a = ((i * 137 + seed * 61) % 360) * (Math.PI / 180)
    const rd = ((i * 53 + seed * 29) % 100) / 100
    const px = cx + Math.cos(a) * 26 * rd
    const py = cy + Math.sin(a) * 17 * rd
    const lit = (px - cx) * 0.6 - (py - cy)
    g.strokeStyle = lit > 4 ? 'rgba(226,216,188,0.22)' : 'rgba(20,17,12,0.30)'
    g.lineWidth = 1.2
    g.beginPath()
    g.arc(px, py, 2 + ((i * 11 + seed * 7) % 3), a, a + 2.4)
    g.stroke()
  }
  return c
}

function makeAuraTex() {
  // spectral backlight for the piuchén: a soft 9fffd0 disc drawn once; the
  // dark winged-serpent silhouette reads against it instead of vanishing
  // into the night sky
  const c = document.createElement('canvas')
  c.width = 200
  c.height = 200
  const g = c.getContext('2d')
  const rg = g.createRadialGradient(100, 100, 6, 100, 100, 98)
  rg.addColorStop(0, 'rgba(159,255,208,0.16)')
  rg.addColorStop(0.5, 'rgba(159,255,208,0.07)')
  rg.addColorStop(1, 'rgba(159,255,208,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, 200, 200)
  return c
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

  const noiseTex = makeNoiseTex()
  const mistTex = makeMistTex()
  const cloudTex = makeCloudTex()
  const woolTex = [makeWoolTex(0), makeWoolTex(1), makeWoolTex(2)]
  const auraTex = makeAuraTex()

  // --- offscreen layers -----------------------------------------------------
  const base = document.createElement('canvas')
  base.width = W
  base.height = H
  const baseCtx = base.getContext('2d')
  paintBase(baseCtx, null)

  // painted sky plate; on any failure the procedural base above stays as-is
  const skyImg = new Image()
  skyImg.onload = () => {
    if (skyImg.naturalWidth > 0) paintBase(baseCtx, skyImg)
  }
  skyImg.src = '../assets/piuchen/sky.png'

  const dawnL = document.createElement('canvas')
  dawnL.width = W
  dawnL.height = H
  paintDawn(dawnL.getContext('2d'))

  // twinkling stars (positions fixed, alpha animated)
  const TW_N = 26
  const tw = new Float32Array(TW_N * 3)
  for (let i = 0; i < TW_N; i++) {
    tw[i * 3] = 20 + Math.random() * (W - 40)
    tw[i * 3 + 1] = 14 + Math.random() * 330
    tw[i * 3 + 2] = Math.random() * TAU
  }

  // --- pools ------------------------------------------------------------------
  const P_N = 200
  const parts = []
  for (let i = 0; i < P_N; i++) {
    parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: INK })
  }
  let pCursor = 0

  const POP_N = 10
  const pops = []
  for (let i = 0; i < POP_N; i++) pops.push({ x: 0, y: 0, life: 0, max: 1, text: '', color: INK })
  let popCursor = 0

  let shakeMag = 0
  let time = 0
  let flash = 0
  let flashColor = GLOW

  // --- fx api -------------------------------------------------------------------
  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i++) {
      const p = parts[pCursor]
      pCursor = (pCursor + 1) % P_N
      const a = Math.random() * TAU
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

  function popup(x, y, text, color) {
    const p = pops[popCursor]
    popCursor = (popCursor + 1) % POP_N
    p.x = x
    p.y = y
    p.text = text
    p.color = color || INK
    p.max = 1.15
    p.life = 1.15
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
      p.vy += 70 * dt
      p.vx *= 1 - 1.6 * dt
    }
    for (let i = 0; i < POP_N; i++) {
      const p = pops[i]
      if (p.life <= 0) continue
      p.life -= dt
      p.y -= 28 * dt
    }
    shakeMag = Math.max(0, shakeMag - 6 * shakeMag * dt - 0.4 * dt)
    flash = Math.max(0, flash - 2.2 * dt)
  }

  // --- static scenery -------------------------------------------------------------
  function paintBase(c, img) {
    if (img) {
      // painted plate, center-cropped 1536x1024 -> 960x600, then an ink glaze
      // to seat it in the collection's palette and bury the horizon seam
      c.drawImage(img, 0, 32, 1536, 960, 0, 0, W, H)
      const glaze = c.createLinearGradient(0, 0, 0, H)
      glaze.addColorStop(0, 'rgba(4,6,10,0.30)')
      glaze.addColorStop(0.55, 'rgba(9,16,24,0.16)')
      glaze.addColorStop(0.74, 'rgba(6,9,12,0.5)')
      glaze.addColorStop(1, 'rgba(6,9,12,0.88)')
      c.fillStyle = glaze
      c.fillRect(0, 0, W, H)
    } else {
      // night sky into moonlit meadow (procedural fallback)
      const sky = c.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#04060a')
      sky.addColorStop(0.55, '#091018')
      sky.addColorStop(0.7, '#0c161c')
      sky.addColorStop(0.78, '#0b1410')
      sky.addColorStop(1, '#06090c')
      c.fillStyle = sky
      c.fillRect(0, 0, W, H)

      // fine grain breaks banding on the tall sky gradient (boot-time only)
      for (let i = 0; i < 1500; i++) {
        c.globalAlpha = 0.015 + Math.random() * 0.025
        c.fillStyle = Math.random() < 0.5 ? '#000000' : '#1a2630'
        c.fillRect(Math.random() * W, Math.random() * 470, 1, 1)
      }
      c.globalAlpha = 1

      // faint milky-way band, low and slanted like a winter sky
      c.save()
      c.translate(330, 210)
      c.rotate(-0.5)
      for (let i = 0; i < 170; i++) {
        const xx = (Math.random() - 0.5) * 760
        const yy = (Math.random() - 0.5) * (40 + Math.random() * 50)
        c.globalAlpha = 0.03 + Math.random() * 0.07
        c.fillStyle = Math.random() < 0.2 ? '#cfe8d8' : INK
        c.fillRect(xx, yy, 1, 1)
      }
      c.restore()
      c.globalAlpha = 1

      // stars
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * W
        const y = Math.random() * 400
        c.globalAlpha = 0.1 + Math.random() * 0.5
        c.fillStyle = Math.random() < 0.12 ? '#cfe8d8' : INK
        const r = Math.random() < 0.08 ? 1.5 : 0.9
        c.fillRect(x, y, r, r)
      }
      c.globalAlpha = 1

      // moon + halo
      const mg = c.createRadialGradient(770, 104, 10, 770, 104, 130)
      mg.addColorStop(0, 'rgba(222,216,196,0.28)')
      mg.addColorStop(0.4, 'rgba(222,216,196,0.08)')
      mg.addColorStop(1, 'rgba(222,216,196,0)')
      c.fillStyle = mg
      c.fillRect(620, -30, 300, 280)
      c.fillStyle = '#d8d2bc'
      c.beginPath()
      c.arc(770, 104, 33, 0, TAU)
      c.fill()
      c.fillStyle = 'rgba(150,145,125,0.45)'
      c.beginPath(); c.arc(760, 94, 6, 0, TAU); c.fill()
      c.beginPath(); c.arc(782, 114, 4.5, 0, TAU); c.fill()
      c.beginPath(); c.arc(763, 118, 3, 0, TAU); c.fill()
    }

    // farthest ridge across the canal (bluer, dimmer)
    c.fillStyle = '#070d12'
    c.beginPath()
    c.moveTo(0, 428)
    c.quadraticCurveTo(180, 408, 360, 424)
    c.quadraticCurveTo(560, 438, 720, 416)
    c.quadraticCurveTo(840, 402, W, 420)
    c.lineTo(W, 462)
    c.lineTo(0, 462)
    c.closePath()
    c.fill()

    // near islands
    c.fillStyle = '#081009'
    c.beginPath()
    c.moveTo(0, 446)
    c.quadraticCurveTo(150, 412, 320, 438)
    c.quadraticCurveTo(470, 458, 640, 428)
    c.quadraticCurveTo(820, 402, W, 440)
    c.lineTo(W, 486)
    c.lineTo(0, 486)
    c.closePath()
    c.fill()

    // a few far-shore lanterns on the dark slopes
    const lights = [[128, 432], [646, 424], [868, 412]]
    for (let i = 0; i < lights.length; i++) {
      const lx = lights[i][0]
      const ly = lights[i][1]
      const lg = c.createRadialGradient(lx, ly, 0.5, lx, ly, 6)
      lg.addColorStop(0, 'rgba(202,160,90,0.30)')
      lg.addColorStop(1, 'rgba(202,160,90,0)')
      c.fillStyle = lg
      c.fillRect(lx - 6, ly - 6, 12, 12)
      c.fillStyle = 'rgba(222,178,104,0.75)'
      c.fillRect(lx - 0.6, ly - 0.6, 1.2, 1.2)
    }

    // the canal: flat waterline cutting the island bases
    const wat = c.createLinearGradient(0, 440, 0, 486)
    wat.addColorStop(0, '#0a1318')
    wat.addColorStop(1, '#060a0d')
    c.fillStyle = wat
    c.fillRect(0, 440, W, 46)

    // moon lane shimmering on the water
    c.fillStyle = '#d8d2bc'
    for (let i = 0; i < 16; i++) {
      const yy = 441 + i * 2.6
      const w2 = 10 + i * 5 + Math.random() * 18
      const xx = 770 + (Math.random() * 2 - 1) * (8 + i * 5)
      c.globalAlpha = (0.05 + Math.random() * 0.09) * (1 - i / 20)
      c.fillRect(xx - w2 / 2, yy, w2, 1)
    }
    // stray spectral glints + lantern reflections
    c.fillStyle = GLOW
    for (let i = 0; i < 5; i++) {
      c.globalAlpha = 0.04 + Math.random() * 0.05
      c.fillRect(60 + Math.random() * 480, 442 + Math.random() * 26, 6 + Math.random() * 14, 1)
    }
    c.fillStyle = 'rgba(202,160,90,0.4)'
    for (let i = 0; i < lights.length; i++) {
      c.globalAlpha = 0.18
      c.fillRect(lights[i][0] - 3, 443 + i * 2, 6, 1)
    }
    c.globalAlpha = 1

    // near meadow
    const mdw = c.createLinearGradient(0, 430, 0, H)
    mdw.addColorStop(0, 'rgba(13,24,16,0)')
    mdw.addColorStop(0.35, '#0d1811')
    mdw.addColorStop(1, '#070b08')
    c.fillStyle = mdw
    c.beginPath()
    c.moveTo(0, 472)
    c.quadraticCurveTo(240, 448, 480, 456)
    c.quadraticCurveTo(720, 464, W, 452)
    c.lineTo(W, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()

    // ground mottle clipped to the meadow
    c.save()
    c.beginPath()
    c.moveTo(0, 472)
    c.quadraticCurveTo(240, 448, 480, 456)
    c.quadraticCurveTo(720, 464, W, 452)
    c.lineTo(W, H)
    c.lineTo(0, H)
    c.closePath()
    c.clip()
    c.globalAlpha = 0.5
    c.fillStyle = c.createPattern(noiseTex, 'repeat')
    c.fillRect(0, 440, W, H - 440)
    c.globalAlpha = 1
    c.restore()

    // moonlit patch around the fold
    const patch = c.createRadialGradient(480, 522, 20, 480, 522, 210)
    patch.addColorStop(0, 'rgba(40,56,40,0.5)')
    patch.addColorStop(1, 'rgba(40,56,40,0)')
    c.fillStyle = patch
    c.fillRect(250, 430, 460, 170)

    // shepherd's hut: planked wall, shingled roof, one warm window, low smoke
    const wg = c.createRadialGradient(118, 486, 2, 118, 486, 20)
    wg.addColorStop(0, 'rgba(202,160,90,0.22)')
    wg.addColorStop(1, 'rgba(202,160,90,0)')
    c.fillStyle = wg
    c.fillRect(98, 466, 40, 40)
    c.fillStyle = '#0a0f0c'
    c.fillRect(96, 470, 56, 36)
    c.strokeStyle = 'rgba(0,0,0,0.4)'
    c.lineWidth = 1
    for (let x = 103; x < 150; x += 7) {
      c.beginPath()
      c.moveTo(x, 472)
      c.lineTo(x, 505)
      c.stroke()
    }
    c.strokeStyle = 'rgba(232,220,192,0.05)'
    c.beginPath(); c.moveTo(99, 478); c.lineTo(150, 478); c.stroke()
    c.beginPath(); c.moveTo(99, 494); c.lineTo(150, 494); c.stroke()
    // chimney + smoke curl
    c.fillStyle = '#0a0f0c'
    c.fillRect(141, 452, 6, 12)
    c.fillStyle = 'rgba(180,180,170,0.05)'
    c.beginPath(); c.arc(146, 446, 2, 0, TAU); c.fill()
    c.beginPath(); c.arc(150, 439, 2.8, 0, TAU); c.fill()
    c.beginPath(); c.arc(156, 431, 3.6, 0, TAU); c.fill()
    // roof
    c.fillStyle = '#0c1009'
    c.beginPath()
    c.moveTo(88, 472)
    c.lineTo(124, 450)
    c.lineTo(160, 472)
    c.closePath()
    c.fill()
    c.strokeStyle = 'rgba(0,0,0,0.45)'
    c.beginPath(); c.moveTo(97, 467); c.lineTo(151, 467); c.stroke()
    c.beginPath(); c.moveTo(106, 461); c.lineTo(142, 461); c.stroke()
    c.strokeStyle = 'rgba(216,210,188,0.10)'
    c.beginPath(); c.moveTo(124, 450); c.lineTo(160, 472); c.stroke()
    // window
    c.fillStyle = 'rgba(202,160,90,0.85)'
    c.fillRect(115, 482, 6, 8)
    c.strokeStyle = 'rgba(10,15,12,0.9)'
    c.beginPath(); c.moveTo(118, 482); c.lineTo(118, 490); c.stroke()
    // door
    c.fillStyle = '#070b08'
    c.fillRect(130, 490, 10, 16)

    // grass strokes — dark tufts everywhere, moonlit pale tips near the fold
    c.lineWidth = 1
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * W
      const y = 472 + Math.random() * 118
      const h2 = 3 + Math.random() * 6
      const lit = Math.max(0, 1 - Math.hypot(x - 480, (y - 522) * 3) / 290)
      c.strokeStyle = Math.random() < lit * 0.6 ? 'rgba(148,160,118,0.22)' : 'rgba(26,44,22,0.6)'
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + (Math.random() * 4 - 2), y - h2)
      c.stroke()
    }
    // scattered pebbles
    for (let i = 0; i < 14; i++) {
      const x = 60 + Math.random() * (W - 120)
      const y = 490 + Math.random() * 95
      c.fillStyle = '#1b211b'
      c.beginPath(); c.arc(x, y, 1.4 + Math.random() * 1.2, 0, TAU); c.fill()
      c.fillStyle = 'rgba(232,220,192,0.10)'
      c.fillRect(x - 0.5, y - 1.5, 1, 1)
    }

    // stone fence arcing around the fold (open toward the sky)
    const tones = ['#2c322c', '#2a3030', '#303430', '#293228', '#2e3231']
    for (let a = 0.16, i = 0; a <= 2.99; a += 0.15, i++) {
      const sx = 480 + Math.cos(a) * 158
      const sy = 521 + Math.sin(a) * 46
      const r = 5 + ((i * 7) % 4)
      // seat shadow
      c.fillStyle = 'rgba(0,0,0,0.35)'
      c.beginPath()
      c.ellipse(sx, sy + r * 0.62, r * 1.15, r * 0.42, 0, 0, TAU)
      c.fill()
      // companion pebble knits the arc into a dry-stone wall
      c.fillStyle = '#252b25'
      c.beginPath()
      c.arc(sx + r * 0.95, sy + 1.5, r * 0.55, 0, TAU)
      c.fill()
      c.fillStyle = tones[(i * 13) % 5]
      c.beginPath()
      c.arc(sx, sy, r, 0, TAU)
      c.fill()
      // moonlit stone top — a pale cap so the fence arc reads at distance
      c.fillStyle = 'rgba(226,218,190,0.30)'
      c.beginPath()
      c.ellipse(sx + r * 0.15, sy - r * 0.58, r * 0.62, r * 0.30, -0.2, 0, TAU)
      c.fill()
      // softer moon-side falloff under the cap
      c.fillStyle = 'rgba(232,220,192,0.10)'
      c.beginPath()
      c.arc(sx + r * 0.2, sy - r * 0.3, r * 0.55, 0, TAU)
      c.fill()
      // grime specks + moss at the base
      c.fillStyle = 'rgba(8,12,8,0.5)'
      c.fillRect(sx - r * 0.5 + ((i * 7) % 6), sy - r * 0.2 + ((i * 5) % 4), 1, 1)
      c.fillRect(sx - r * 0.2 + ((i * 11) % 5), sy + r * 0.1, 1, 1)
      c.fillStyle = 'rgba(44,68,38,0.4)'
      c.beginPath()
      c.arc(sx - r * 0.3, sy + r * 0.55, r * 0.38, 0, TAU)
      c.fill()
    }
    // short fence wings
    for (let k = 0; k < 5; k++) {
      c.fillStyle = 'rgba(0,0,0,0.3)'
      c.beginPath(); c.ellipse(310 - k * 14, 531 + k * 2, 5.2, 2, 0, 0, TAU); c.fill()
      c.beginPath(); c.ellipse(650 + k * 14, 531 + k * 2, 5.2, 2, 0, 0, TAU); c.fill()
      c.fillStyle = tones[(k * 3) % 5]
      c.beginPath(); c.arc(310 - k * 14, 528 + k * 2, 4.5, 0, TAU); c.fill()
      c.beginPath(); c.arc(650 + k * 14, 528 + k * 2, 4.5, 0, TAU); c.fill()
      c.fillStyle = 'rgba(226,218,190,0.26)'
      c.beginPath(); c.ellipse(310 - k * 14 + 0.6, 525.6 + k * 2, 2.6, 1.2, -0.2, 0, TAU); c.fill()
      c.beginPath(); c.ellipse(650 + k * 14 + 0.6, 525.6 + k * 2, 2.6, 1.2, -0.2, 0, TAU); c.fill()
    }
    // fold lanterns: two spectral lamps hung at the fence-wing posts, and a
    // slight blue-green lift over the fold ground where their light pools
    const fl = c.createRadialGradient(480, 524, 16, 480, 524, 195)
    fl.addColorStop(0, 'rgba(126,210,176,0.07)')
    fl.addColorStop(1, 'rgba(126,210,176,0)')
    c.fillStyle = fl
    c.fillRect(280, 436, 400, 164)
    const lamps = [[254, 514], [706, 514]]
    for (let i = 0; i < lamps.length; i++) {
      const lx = lamps[i][0]
      const ly = lamps[i][1]
      // post
      c.strokeStyle = '#161a14'
      c.lineWidth = 2
      c.beginPath(); c.moveTo(lx, ly + 14); c.lineTo(lx, ly - 2); c.stroke()
      c.strokeStyle = 'rgba(216,210,188,0.14)'
      c.lineWidth = 1
      c.beginPath(); c.moveTo(lx + 1, ly + 12); c.lineTo(lx + 1, ly); c.stroke()
      // glow + flame pip, dimmer than the piuchén's green
      const lg = c.createRadialGradient(lx, ly - 4, 0.5, lx, ly - 4, 16)
      lg.addColorStop(0, 'rgba(140,220,184,0.22)')
      lg.addColorStop(1, 'rgba(140,220,184,0)')
      c.fillStyle = lg
      c.fillRect(lx - 16, ly - 20, 32, 32)
      c.fillStyle = '#0c100c'
      c.fillRect(lx - 2.4, ly - 8, 4.8, 6)
      c.fillStyle = 'rgba(178,240,206,0.85)'
      c.fillRect(lx - 0.8, ly - 6.4, 1.6, 2.6)
      // light pooling on the grass below
      c.fillStyle = 'rgba(126,210,176,0.10)'
      c.beginPath(); c.ellipse(lx, ly + 15, 13, 3.4, 0, 0, TAU); c.fill()
    }
  }

  function paintDawn(c) {
    const g2 = c.createLinearGradient(0, 120, 0, 470)
    g2.addColorStop(0, 'rgba(255,190,120,0)')
    g2.addColorStop(0.72, 'rgba(255,170,100,0.20)')
    g2.addColorStop(1, 'rgba(255,150,80,0.34)')
    c.fillStyle = g2
    c.fillRect(0, 0, W, 470)
    const east = c.createRadialGradient(190, 438, 8, 190, 438, 260)
    east.addColorStop(0, 'rgba(255,196,128,0.5)')
    east.addColorStop(1, 'rgba(255,196,128,0)')
    c.fillStyle = east
    c.fillRect(0, 178, 480, 292)
  }

  // --- creatures --------------------------------------------------------------------
  function drawWings(x, y, heading, f, size, color, glowA) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(heading)
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      // each wing leads/lags a hair off the shared flap — secondary motion
      const fw = Math.max(0.1, f * (1 + s2 * 0.08 * Math.sin(time * 3.3)))
      ctx.save()
      ctx.scale(1, s2)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(3, 2)
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.95 * fw, -size * 0.95, -size * 1.12 * fw)
      // torn trailing edge: the membrane sags between the finger bones
      ctx.quadraticCurveTo(-size * 0.86, -size * 0.86 * fw, -size * 0.8, -size * 0.73 * fw)
      ctx.quadraticCurveTo(-size * 0.86, -size * 0.58 * fw, -size * 0.66, -size * 0.4 * fw)
      ctx.quadraticCurveTo(-size * 0.52, -size * 0.25 * fw, -size * 0.4, -size * 0.14 * fw - 2)
      ctx.closePath()
      ctx.fill()
      // faint membrane sheen — moonlight caught in the stretched skin
      ctx.fillStyle = '#a8c8b8'
      ctx.globalAlpha = 0.06 + glowA * 0.10
      ctx.fill()
      ctx.globalAlpha = 1
      // membrane edge catches the eye-flash green during the telegraph
      ctx.strokeStyle = GLOW
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.07 + glowA * 0.3
      ctx.stroke()
      // finger bones ribbing the membrane
      ctx.globalAlpha = 0.06 + glowA * 0.18
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.quadraticCurveTo(-size * 0.42, -size * 0.62 * fw, -size * 0.78, -size * 0.96 * fw)
      ctx.moveTo(1, 0)
      ctx.quadraticCurveTo(-size * 0.48, -size * 0.36 * fw, -size * 0.88, -size * 0.58 * fw)
      ctx.stroke()
      // moonlight along the leading edge
      ctx.strokeStyle = '#d8d2bc'
      ctx.globalAlpha = 0.20
      ctx.beginPath()
      ctx.moveTo(2, 1)
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.95 * fw, -size * 0.92, -size * 1.1 * fw)
      ctx.stroke()
      // the wrist claw, a pale hook at mid-wing
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(-size * 0.36, -size * 0.72 * fw)
      ctx.lineTo(-size * 0.31, -size * 0.72 * fw - 3)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.restore()
    }
    ctx.restore()
  }

  function drawPiuchen(g) {
    const pu = g.pu
    const st = pu.state
    let body, flapSpd, flapAmp, eye
    if (st === 'circling') {
      body = '#0e151c'; flapSpd = 4.2; flapAmp = 0.8
      eye = 0.32 + 0.12 * Math.sin(time * 2.1)
    } else if (st === 'telegraph') {
      body = '#111a22'; flapSpd = 7; flapAmp = 0.9
      eye = 0.55 + 0.45 * Math.sin(time * 22) // the green flash
    } else if (st === 'diving' || st === 'pullup') {
      body = '#16222c'; flapSpd = 2.2; flapAmp = 0.3; eye = 0.9
    } else if (st === 'latched') {
      body = '#16222c'; flapSpd = 2.6; flapAmp = 1.05
      eye = 0.7 + 0.3 * Math.sin(time * 10)
    } else { // retreat
      body = '#121b22'; flapSpd = 12; flapAmp = 0.8; eye = 0.3
    }

    const tr = pu.trail
    // spectral backlight — he is the star of the night, the brightest thing
    // after the moon; the silhouette cuts dark against this soft disc
    let aura
    if (st === 'circling') aura = 0.34 + 0.10 * Math.sin(time * 1.6)
    else if (st === 'telegraph') aura = 0.50 + 0.20 * Math.sin(time * 22)
    else if (st === 'diving' || st === 'pullup') aura = 0.60
    else if (st === 'latched') aura = 0.40
    else aura = 0.20
    ctx.globalAlpha = aura
    ctx.drawImage(auraTex, tr[0] - 100, tr[1] - 100)
    ctx.globalAlpha = 1
    // dive trail: a spectral ribbon the swoop tears across the sky
    if (st === 'diving' || st === 'pullup') {
      ctx.strokeStyle = GLOW
      ctx.lineWidth = 3.5
      ctx.globalAlpha = st === 'diving' ? 0.10 : 0.05
      ctx.beginPath()
      ctx.moveTo(tr[0], tr[1])
      for (let i = 1; i < pu.trailN; i++) ctx.lineTo(tr[i * 2], tr[i * 2 + 1])
      ctx.stroke()
      ctx.lineWidth = 1.4 // brighter core along the same path
      ctx.globalAlpha = st === 'diving' ? 0.22 : 0.10
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // dive wind: speed streaks shed behind the head
    if (st === 'diving' || st === 'pullup') {
      const hx2 = Math.cos(pu.heading)
      const hy2 = Math.sin(pu.heading)
      ctx.strokeStyle = '#d8d2bc'
      ctx.globalAlpha = st === 'diving' ? 0.18 : 0.09
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = 0; k < 3; k++) {
        const ox = -hy2 * (k - 1) * 7
        const oy = hx2 * (k - 1) * 7
        ctx.moveTo(tr[0] + ox - hx2 * 18, tr[1] + oy - hy2 * 18)
        ctx.lineTo(tr[0] + ox - hx2 * 46, tr[1] + oy - hy2 * 46)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // tail fluke at the last coil, its flick lagging the wingbeat
    {
      const ti = pu.trailN - 1
      const tx2 = tr[ti * 2]
      const ty2 = tr[ti * 2 + 1]
      const ta = Math.atan2(ty2 - tr[(ti - 1) * 2 + 1], tx2 - tr[(ti - 1) * 2])
      ctx.save()
      ctx.translate(tx2, ty2)
      ctx.rotate(ta + Math.sin(time * flapSpd * 0.8 + 1.9) * 0.35)
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(7.5, -3.8)
      ctx.lineTo(4.6, 0)
      ctx.lineTo(7.5, 3.8)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(206,200,180,0.14)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0.5, -0.4)
      ctx.lineTo(6.8, -3.2)
      ctx.stroke()
      ctx.restore()
    }
    // tapering serpent body, tail to head — belly shaded away from the moon,
    // a moonlit dorsal ridge, stray scale glints, spines down the back
    for (let i = pu.trailN - 1; i >= 1; i--) {
      const r = 2 + 7.5 * (1 - i / pu.trailN)
      const x2 = tr[i * 2]
      const y2 = tr[i * 2 + 1]
      // dorsal spine leaning back along the travel direction
      if (r > 3.4 && (i & 1) === 0) {
        const ddx = tr[(i - 1) * 2] - x2
        const ddy = tr[(i - 1) * 2 + 1] - y2
        const dl = Math.hypot(ddx, ddy) || 1
        const up = ddx >= 0 ? 1 : -1 // pick the normal that points skyward
        ctx.strokeStyle = body
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 + (ddy / dl) * up * (r + 3) - (ddx / dl) * 2, y2 + (-ddx / dl) * up * (r + 3) - (ddy / dl) * 2)
        ctx.stroke()
      }
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(x2, y2, r, 0, TAU)
      ctx.fill()
      if (r > 3.2) {
        // belly falls into shadow
        ctx.fillStyle = 'rgba(0,0,0,0.26)'
        ctx.beginPath()
        ctx.arc(x2 - r * 0.22, y2 + r * 0.42, r * 0.58, 0, TAU)
        ctx.fill()
        // moonlit dorsal ridge
        ctx.fillStyle = 'rgba(206,200,180,0.17)'
        ctx.beginPath()
        ctx.arc(x2 + r * 0.2, y2 - r * 0.45, r * 0.5, 0, TAU)
        ctx.fill()
        // one scale catching the moon (deterministic per coil)
        ctx.fillStyle = 'rgba(206,200,180,0.22)'
        ctx.fillRect(x2 + ((i * 13) % 5) - 2.5, y2 - ((i * 7) % 4) + 0.5, 1, 1)
      }
    }
    // bat wings near the shoulders
    const f = flapAmp * (0.5 + 0.5 * Math.sin(time * flapSpd))
    drawWings(tr[4], tr[5], pu.heading, Math.max(0.12, f), 34, body, st === 'telegraph' ? eye : 0)
    // head — long snout, undercut jaw, swept horns
    ctx.save()
    ctx.translate(tr[0], tr[1])
    ctx.rotate(pu.heading)
    ctx.fillStyle = '#1c2832'
    ctx.beginPath()
    ctx.moveTo(15, 0) // snout tip
    ctx.quadraticCurveTo(8, -4.6, 0, -5.8)
    ctx.lineTo(-4, -4.4) // crest
    ctx.lineTo(-6.5, 0)
    ctx.lineTo(-3, 5.2)
    ctx.quadraticCurveTo(5, 4.6, 12, 1.6) // jaw line up to the snout
    ctx.closePath()
    ctx.fill()
    // swept horns, one edge in the moon
    ctx.strokeStyle = '#141d24'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-1, -4.8)
    ctx.quadraticCurveTo(-7, -8.5, -11.5, -7.4)
    ctx.moveTo(-3.5, -3.4)
    ctx.quadraticCurveTo(-8.5, -5.8, -12, -4.2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(206,200,180,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-1.4, -5.4)
    ctx.quadraticCurveTo(-7, -9, -11.5, -7.9)
    ctx.stroke()
    // moonlit brow ridge
    ctx.strokeStyle = 'rgba(206,200,180,0.26)'
    ctx.beginPath()
    ctx.moveTo(12, -1.4)
    ctx.quadraticCurveTo(6, -4.4, -1, -5)
    ctx.stroke()
    // fangs bared in the dive and over the wound
    if (st === 'diving' || st === 'pullup' || st === 'latched') {
      ctx.fillStyle = 'rgba(216,210,188,0.85)'
      ctx.beginPath()
      ctx.moveTo(10.5, 1.8)
      ctx.lineTo(9.5, 4.6)
      ctx.lineTo(8.4, 2.2)
      ctx.moveTo(7, 2.6)
      ctx.lineTo(6.1, 5)
      ctx.lineTo(5, 2.9)
      ctx.closePath()
      ctx.fill()
    }
    // latched: the throat works as it drinks
    if (st === 'latched') {
      ctx.fillStyle = '#c84632'
      ctx.globalAlpha = 0.28 + 0.2 * Math.sin(time * 9)
      ctx.beginPath()
      ctx.ellipse(-1.5, 3.4, 3.4, 2, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    const e = Math.min(1, Math.max(0, eye))
    ctx.fillStyle = GLOW
    ctx.globalAlpha = e
    ctx.beginPath(); ctx.arc(5, -2.8, 1.6, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(5, 2.8, 1.6, 0, TAU); ctx.fill()
    ctx.globalAlpha = e * 0.45 // inner halo
    ctx.beginPath(); ctx.arc(5, -2.8, 5, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(5, 2.8, 5, 0, TAU); ctx.fill()
    ctx.globalAlpha = e * 0.14 // wide bloom — the eye pair carries at distance
    ctx.beginPath(); ctx.arc(5, -2.8, 9.5, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(5, 2.8, 9.5, 0, TAU); ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()

    // drain progress ring — "hit him NOW"
    if (st === 'latched') {
      const prog = 1 - pu.drainT / pu.drainMax
      ctx.strokeStyle = '#e06a50'
      ctx.globalAlpha = 0.85
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(pu.x, pu.y + 6, 27, -Math.PI / 2, -Math.PI / 2 + prog * TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  function drawSheep(g) {
    const pu = g.pu
    // telegraph marker under the threatened sheep
    if (pu.state === 'telegraph' && pu.target >= 0) {
      const s = g.sheep[pu.target]
      ctx.strokeStyle = GLOW
      ctx.globalAlpha = 0.18 + 0.14 * Math.sin(time * 14)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(s.x, s.y + 6, 21, 11, 0, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    for (let i = 0; i < g.sheep.length; i++) {
      const s = g.sheep[i]
      if (s.state === 'gone') {
        ctx.globalAlpha = 0.2
        ctx.fillStyle = '#857d66'
        ctx.beginPath()
        ctx.ellipse(s.baseX, s.baseY + 5, 9, 3.5, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.12
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.ellipse(s.baseX - 2, s.baseY + 3.5, 5, 1.6, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
        continue
      }
      // contact shadow grounds the flock in the meadow
      ctx.fillStyle = 'rgba(0,0,0,0.32)'
      ctx.beginPath()
      ctx.ellipse(s.x, s.y + 12, 14, 4, 0, 0, TAU)
      ctx.fill()
      const breathe = 1 + 0.05 * Math.sin(time * 1.8 + s.ph)
      const dir = i % 2 === 0 ? 1 : -1
      ctx.save()
      ctx.translate(s.x, s.y)
      if (s.state === 'mareada') ctx.rotate(Math.sin(time * 5.2 + s.ph) * 0.09)
      if (s.state === 'draining') {
        const k = 1 - 0.18 * (1 - pu.drainT / pu.drainMax)
        ctx.scale(k, k)
      }
      // legs
      ctx.fillStyle = '#1c1812'
      ctx.fillRect(-8, 6, 2.5, 7)
      ctx.fillRect(4, 6, 2.5, 7)
      // prebaked moonlit wool (3 fleece variants), breathing on the Y axis
      ctx.save()
      ctx.scale(1, breathe)
      ctx.drawImage(woolTex[i % 3], -22, -16, 44, 32)
      ctx.restore()
      if (s.state === 'mareada') {
        // drained pallor — the wool loses its moon
        ctx.globalAlpha = 0.38
        ctx.fillStyle = '#39341f'
        ctx.beginPath()
        ctx.ellipse(0, 0, 16, 11 * breathe, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // head: stepped 2-frame grazing nod, ear flicking up a frame at a time
      const nod = (Math.floor(time * 1.3 + s.ph) % 2) * 1.6
      const flick = ((time * 0.43 + s.ph * 0.9) % 4) < 0.16 ? 1 : 0
      ctx.fillStyle = '#241f17'
      ctx.beginPath()
      ctx.arc(13 * dir, -4 + nod, 4.8, 0, TAU)
      ctx.fill()
      // muzzle wedge refines the profile
      ctx.beginPath()
      ctx.ellipse(16.5 * dir, -2.4 + nod, 3.1, 2, dir * 0.35, 0, TAU)
      ctx.fill()
      // ear
      ctx.beginPath()
      ctx.ellipse(13 * dir - 3 * dir, -8 + nod - flick * 1.8, 3, 1.4, dir * (0.5 - flick * 0.45), 0, TAU)
      ctx.fill()
      // moon on the brow
      ctx.fillStyle = 'rgba(217,208,180,0.30)'
      ctx.beginPath()
      ctx.arc(13 * dir + 1.4 * dir, -6.4 + nod, 1.5, 0, TAU)
      ctx.fill()
      // being drunk: red pulse over the wool
      if (s.state === 'draining') {
        ctx.globalAlpha = 0.16 + 0.13 * Math.sin(time * 16)
        ctx.fillStyle = '#c84632'
        ctx.beginPath()
        ctx.ellipse(0, 0, 15, 10, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // mareada: dizzy motes
      if (s.state === 'mareada') {
        ctx.fillStyle = GLOW
        ctx.globalAlpha = 0.5
        for (let k = 0; k < 3; k++) {
          const a = time * 3.5 + k * 2.09 + s.ph
          ctx.beginPath()
          ctx.arc(Math.cos(a) * 9, -16 + Math.sin(a) * 2.5, 1.1, 0, TAU)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }
  }

  function drawShepherd(g) {
    const x = 480
    const y = 452
    const aimA = Math.atan2(g.input.my - (y - 22), g.input.mx - x)
    const sway = Math.sin(time * 0.8) * 0.7 // weight shifting, slow
    const hem = Math.sin(time * 1.7 + 1.3) * 1.3 // hem flutter lags the sway
    const br = Math.sin(time * 1.2 + 0.5) * 0.45 // breath lifts the shoulders
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(x, y + 1, 12, 3.2, 0, 0, TAU)
    ctx.fill()
    // manta: the hem swings on its own beat under the shoulders' sway
    ctx.fillStyle = '#15130d'
    ctx.strokeStyle = 'rgba(232,220,192,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - 10 - hem * 0.7, y)
    ctx.quadraticCurveTo(x - 8 + sway * 0.4, y - 20, x + sway, y - 27 - br)
    ctx.quadraticCurveTo(x + 8 + sway * 0.4, y - 20, x + 10 + hem, y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // the weave of the manta, clipped to the cloth: two pale woven bands
    // chest-high and the warp threads falling to the hem
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = 'rgba(216,210,188,0.09)'
    ctx.beginPath()
    ctx.moveTo(x - 10, y - 9)
    ctx.quadraticCurveTo(x, y - 12, x + 11, y - 9)
    ctx.moveTo(x - 10, y - 6)
    ctx.quadraticCurveTo(x, y - 9, x + 11, y - 6)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.32)'
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath()
      ctx.moveTo(x + k * 3.6 + sway * 0.6, y - 26)
      ctx.lineTo(x + k * 4.4 + hem * 0.5, y)
      ctx.stroke()
    }
    ctx.restore()
    // moon rim down the right of the manta
    ctx.strokeStyle = 'rgba(216,210,188,0.20)'
    ctx.beginPath()
    ctx.moveTo(x + 9 + hem * 0.8, y - 2)
    ctx.quadraticCurveTo(x + 7, y - 19, x + 1 + sway, y - 26 - br)
    ctx.stroke()
    // head, a sliver of moonlit cheek, the scarf knot at the throat
    ctx.fillStyle = '#1c150e'
    ctx.beginPath()
    ctx.arc(x + sway, y - 31 - br, 4.5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(196,164,124,0.45)'
    ctx.beginPath()
    ctx.arc(x + sway + 1.8, y - 30 - br, 1.7, -0.6, 1.4)
    ctx.fill()
    ctx.fillStyle = '#332618'
    ctx.beginPath()
    ctx.arc(x + sway + 1, y - 26.4 - br, 1.6, 0, TAU)
    ctx.fill()
    // chupalla
    ctx.fillStyle = '#0f0d08'
    ctx.beginPath()
    ctx.ellipse(x + sway, y - 34 - br, 9, 2.2, sway * 0.03, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + sway, y - 35 - br, 4, Math.PI, 0)
    ctx.fill()
    ctx.strokeStyle = 'rgba(216,210,188,0.16)'
    ctx.beginPath()
    ctx.moveTo(x + sway + 3, y - 36 - br)
    ctx.lineTo(x + sway + 8.4, y - 34 - br)
    ctx.stroke()
    // staff planted, crook at the top, one moonlit edge
    ctx.strokeStyle = '#2c2418'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 12, y)
    ctx.lineTo(x - 15 + sway * 0.3, y - 34)
    ctx.quadraticCurveTo(x - 16 + sway * 0.3, y - 40, x - 11 + sway * 0.3, y - 39)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(216,210,188,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - 13, y - 6)
    ctx.lineTo(x - 14.6 + sway * 0.3, y - 32)
    ctx.stroke()
    // sling arm toward the aim
    const hx = x + 3 + sway + Math.cos(aimA) * 13
    const hy = y - 22 + Math.sin(aimA) * 13
    ctx.strokeStyle = '#15130d'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x + 3 + sway, y - 22)
    ctx.lineTo(hx, hy)
    ctx.stroke()
    if (g.cooldown > 0.18) {
      // the sling still whirling from the last shot
      ctx.strokeStyle = 'rgba(232,220,192,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(hx, hy, 6, time * 30, time * 30 + 4)
      ctx.stroke()
    } else {
      ctx.fillStyle = '#cfc4a4'
      ctx.beginPath()
      ctx.arc(hx, hy, 2, 0, TAU)
      ctx.fill()
    }
  }

  // --- main draw -------------------------------------------------------------------
  function draw(g) {
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

    // twinkles
    ctx.fillStyle = INK
    for (let i = 0; i < TW_N; i++) {
      ctx.globalAlpha = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.3 + tw[i * 3 + 2]))
      ctx.fillRect(tw[i * 3], tw[i * 3 + 1], 1.2, 1.2)
    }
    ctx.globalAlpha = 1

    // thin cloud wisps drifting under the stars
    const cx1 = ((time * 7) % (W + 560)) - 560
    const cx2 = ((time * 4 + 300) % (W + 560)) - 560
    ctx.globalAlpha = 0.10
    ctx.drawImage(cloudTex, cx1, 48)
    ctx.globalAlpha = 0.07
    ctx.drawImage(cloudTex, cx2, 148)
    ctx.globalAlpha = 1

    // dawn creeping in (warms late in the night)
    const dawnA = g.dawn * g.dawn * 0.85
    if (dawnA > 0.01) {
      ctx.globalAlpha = dawnA
      ctx.drawImage(dawnL, 0, 0)
      ctx.globalAlpha = 1
    }

    // ground mist banks rolling behind the flock
    const mx1 = ((time * 9) % (W + 440)) - 440
    const mx2 = W - ((time * 6) % (W + 440))
    ctx.globalAlpha = 0.22
    ctx.drawImage(mistTex, mx1, 440)
    ctx.globalAlpha = 0.16
    ctx.drawImage(mistTex, mx2, 502)
    ctx.globalAlpha = 1

    drawSheep(g)
    drawShepherd(g)
    drawPiuchen(g)

    // a low veil of mist in front of everything ground-level
    const mx3 = ((time * 12 + 600) % (W + 440)) - 440
    ctx.globalAlpha = 0.10
    ctx.drawImage(mistTex, mx3, 528)
    ctx.globalAlpha = 1

    // stones in flight
    ctx.strokeStyle = 'rgba(207,196,164,0.4)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < g.stones.length; i++) {
      const s = g.stones[i]
      if (!s.active) continue
      ctx.beginPath()
      ctx.moveTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045)
      ctx.lineTo(s.x, s.y)
      ctx.stroke()
      ctx.fillStyle = '#cfc4a4'
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2.6, 0, TAU)
      ctx.fill()
    }

    // particles
    for (let i = 0; i < P_N; i++) {
      const p = parts[i]
      if (p.life <= 0) continue
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.9
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1

    // score popups
    ctx.font = 'italic 15px Georgia, serif'
    ctx.textAlign = 'center'
    for (let i = 0; i < POP_N; i++) {
      const p = pops[i]
      if (p.life <= 0) continue
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y)
    }
    ctx.globalAlpha = 1

    // aim reticle + stone pips
    if (g.phase === 'playing') {
      const mx = g.input.mx
      const my = g.input.my
      let free = 0
      for (let i = 0; i < g.stones.length; i++) if (!g.stones[i].active) free++
      const ready = g.cooldown <= 0 && free > 0
      ctx.strokeStyle = ready ? GLOW : 'rgba(232,220,192,0.4)'
      ctx.globalAlpha = ready ? 0.8 : 0.45 // UI sits under the piuchén's glow
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(mx, my, 8, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(mx - 12, my); ctx.lineTo(mx - 5, my)
      ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 12, my)
      ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my - 5)
      ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 12)
      ctx.stroke()
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.arc(mx - 8 + k * 8, my + 16, 1.6, 0, TAU)
        if (k < free) { ctx.fillStyle = ready ? GLOW : INK; ctx.fill() }
        else ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // impact flash
    if (flash > 0.01) {
      ctx.globalAlpha = flash * 0.16
      ctx.fillStyle = flashColor
      ctx.fillRect(-30, -30, W + 60, H + 60)
      ctx.globalAlpha = 1
    }
  }

  return { draw, update, burst, popup, shake, pulse }
}
