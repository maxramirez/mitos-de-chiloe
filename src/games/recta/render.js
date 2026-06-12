// render.js — LA RECTA PROVINCIA · canvas2d. Dark storybook cave under
// Quicaví: dithered gradient walls, stalactites, faint carved signs, a long
// candlelit table, and n islanders standing behind it whose VISIBLE
// attributes are the puzzle surface — wet/dry boots, a shadow (or none) on
// the floor, salt crusted on the wool. Everything heavy (background, one
// sprite + name label per figure, glow/flame sprites, noise tile) is built
// ONCE per case/resize; the frame loop only blits and draws paths — no
// per-frame allocations (particle pools, cached arrays).

const TAU = Math.PI * 2

// muted wool palette per archetype silhouette
const GARB = {
  shawl: { body: '#4a3a44', trim: '#6a5360', head: '#2e2430' },
  cap: { body: '#39434e', trim: '#52616e', head: '#39434e' },
  hat: { body: '#4e4434', trim: '#6e6048', head: '#5a4c34' },
  scarf: { body: '#54383a', trim: '#75504f', head: '#82595c' },
  fisher: { body: '#2f4546', trim: '#476362', head: '#3c5354' },
  veil: { body: '#26242e', trim: '#3a3748', head: '#1d1b24' },
  beard: { body: '#46412f', trim: '#635c42', head: '#46412f' },
  bun: { body: '#503f4a', trim: '#705a66', head: '#3a2c34' },
  coat: { body: '#33393f', trim: '#4d555c', head: '#23282d' },
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')
  let W = 0
  let H = 0
  let dpr = 1
  let bg = null
  let noiseTile = null
  let glowWarm = null // big soft candle halo sprite
  let glowCore = null // small bright core
  let chars = null
  const figs = [] // { x, yFeet, w, h, img, label, lw, lh, bob }
  const candles = [] // { x, yTop, h, on, die }
  const motes = []
  for (let i = 0; i < 46; i++) motes.push({ x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * TAU, a: 0 })
  const sparks = []
  for (let i = 0; i < 90; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, dur: 1, size: 2, col: '#fff', grav: 0 })
  let shakeA = 0
  let pulseA = 0
  let pulseCol = '#9fffd0'
  let gloom = 0
  let visT = 0
  let flicker = 1
  const flee = { on: false, i: -1, t: 0, dir: 1, img: null }

  // -------------------------------------------------------------- helpers --
  function makeNoiseTile() {
    const s = 96
    const c = document.createElement('canvas')
    c.width = s
    c.height = s
    const g = c.getContext('2d')
    const img = g.createImageData(s, s)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 145
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 14 + Math.random() * 12 // dither veil
    }
    g.putImageData(img, 0, 0)
    return c
  }

  function makeGlow(size, inner, mid) {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    const r = size / 2
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    grad.addColorStop(0, inner)
    grad.addColorStop(0.35, mid)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  }

  // ------------------------------------------------------------ background --
  function buildBg() {
    bg = document.createElement('canvas')
    bg.width = Math.max(2, W * dpr)
    bg.height = Math.max(2, H * dpr)
    const g = bg.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    // night rock, top to floor
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#04060a')
    sky.addColorStop(0.45, '#080d13')
    sky.addColorStop(0.62, '#0a1016')
    sky.addColorStop(1, '#05080b')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    // dither veil kills the banding
    g.globalAlpha = 0.5
    for (let y = 0; y < H; y += 96) for (let x = 0; x < W; x += 96) g.drawImage(noiseTile, x, y)
    g.globalAlpha = 1
    // wall blotches — wet rock catching stray light
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W
      const y = Math.random() * H * 0.5
      const r = 30 + Math.random() * 110
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      const cold = Math.random() < 0.22
      grad.addColorStop(0, cold ? 'rgba(159,255,208,0.025)' : 'rgba(40,56,66,0.10)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.beginPath()
      g.arc(x, y, r, 0, TAU)
      g.fill()
    }
    // carved signs of the Recta Provincia, almost invisible
    g.strokeStyle = 'rgba(159,255,208,0.05)'
    g.lineWidth = 1
    for (let i = 0; i < 14; i++) {
      const x = W * (0.06 + Math.random() * 0.88)
      const y = H * (0.06 + Math.random() * 0.3)
      g.beginPath()
      const seg = 2 + ((Math.random() * 3) | 0)
      let px = x
      let py = y
      g.moveTo(px, py)
      for (let s = 0; s < seg; s++) {
        px += (Math.random() - 0.5) * 16
        py += Math.random() * 9
        g.lineTo(px, py)
      }
      if (Math.random() < 0.5) {
        g.moveTo(x - 4, y + 5)
        g.lineTo(x + 6, y + 5)
      }
      g.stroke()
    }
    // stalactites — two parallax fringes
    stalactites(g, '#030508', H * 0.16, 26)
    stalactites(g, '#070b10', H * 0.10, 34)
    // floor
    const fy = H * 0.52
    const fl = g.createLinearGradient(0, fy, 0, H)
    fl.addColorStop(0, 'rgba(7,10,14,0)')
    fl.addColorStop(0.35, 'rgba(9,12,15,0.9)')
    fl.addColorStop(1, '#060809')
    g.fillStyle = fl
    g.fillRect(0, fy, W, H - fy)
    // warm pool of light where the table stands (base; flicker added live)
    const pool = g.createRadialGradient(W / 2, H * 0.8, 10, W / 2, H * 0.8, W * 0.5)
    pool.addColorStop(0, 'rgba(255,166,80,0.07)')
    pool.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = pool
    g.fillRect(0, fy, W, H - fy)
    // side dark
    const sideL = g.createLinearGradient(0, 0, W * 0.2, 0)
    sideL.addColorStop(0, 'rgba(0,0,0,0.5)')
    sideL.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sideL
    g.fillRect(0, 0, W * 0.2, H)
    const sideR = g.createLinearGradient(W, 0, W * 0.8, 0)
    sideR.addColorStop(0, 'rgba(0,0,0,0.5)')
    sideR.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sideR
    g.fillRect(W * 0.8, 0, W * 0.2, H)
    // the table — top strip + front planks
    const ty = H * 0.785
    const tw = Math.min(W * 0.86, figsSpanWidth() + 120)
    const tx = (W - tw) / 2
    const top = g.createLinearGradient(0, ty, 0, ty + H * 0.03)
    top.addColorStop(0, '#5a3d20')
    top.addColorStop(1, '#3a2812')
    g.fillStyle = top
    g.beginPath()
    g.ellipse(W / 2, ty + H * 0.015, tw / 2, H * 0.018, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#2a1c10'
    g.fillRect(tx, ty + H * 0.015, tw, H - ty)
    // plank grain
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    for (let i = 1; i < 9; i++) {
      const px = tx + (tw * i) / 9 + Math.random() * 8 - 4
      g.beginPath()
      g.moveTo(px, ty + H * 0.02)
      g.lineTo(px + (Math.random() - 0.5) * 10, H)
      g.stroke()
    }
    g.strokeStyle = 'rgba(255,190,120,0.18)'
    g.beginPath()
    g.ellipse(W / 2, ty + H * 0.015, tw / 2, H * 0.018, 0, Math.PI, TAU)
    g.stroke()
    // candle bodies on the table
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]
      g.fillStyle = '#8a6a3a'
      g.beginPath()
      g.ellipse(c.x, c.yTop + c.h + 3, 9, 3.2, 0, 0, TAU)
      g.fill()
      const wax = g.createLinearGradient(c.x - 5, 0, c.x + 5, 0)
      wax.addColorStop(0, '#b8ab8c')
      wax.addColorStop(0.5, '#e2d6b6')
      wax.addColorStop(1, '#9a8e72')
      g.fillStyle = wax
      g.fillRect(c.x - 4.5, c.yTop, 9, c.h)
      g.beginPath() // a drip
      g.ellipse(c.x - 3, c.yTop + c.h * 0.45, 1.6, 4, 0, 0, TAU)
      g.fillStyle = '#efe5c8'
      g.fill()
    }
  }

  function stalactites(g, col, maxLen, n) {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 0)
    let x = 0
    while (x < W) {
      const w = 14 + Math.random() * (W / n)
      const len = maxLen * (0.25 + Math.random() * 0.75)
      g.lineTo(x + w * 0.5, len)
      g.lineTo(x + w, len * 0.22)
      x += w
    }
    g.lineTo(W, 0)
    g.closePath()
    g.fill()
  }

  // ------------------------------------------------------------- figures --
  function figsSpanWidth() {
    if (!chars) return W * 0.6
    const n = chars.length
    const gap = Math.min(W * 0.88 / n, 168)
    return gap * (n - 1)
  }

  function layout() {
    figs.length = 0
    candles.length = 0
    if (!chars) return
    const n = chars.length
    const gap = Math.min(W * 0.88 / n, 168)
    const fh = Math.min(H * 0.34, 290, gap * 2.35)
    const fw = fh * 0.56
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1)
      const x = W / 2 + (i - (n - 1) / 2) * gap
      const yFeet = H * 0.715 - Math.sin(t * Math.PI) * H * 0.022
      figs.push({
        x, yFeet, w: fw, h: fh,
        img: buildFigSprite(chars[i], fw, fh),
        label: buildLabel(chars[i], gap * 0.96),
        bob: Math.random() * TAU,
      })
    }
    // five candles spread along the table
    const ty = H * 0.785
    for (let i = 0; i < 5; i++) {
      const cx = W / 2 + (i - 2) * Math.min(W * 0.16, 190) + (Math.random() - 0.5) * 14
      candles.push({ x: cx, yTop: ty - (16 + Math.random() * 12), h: 16 + Math.random() * 12, on: true, die: 0 })
    }
  }

  // one offscreen sprite per islander; silhouette first, attributes readable
  function buildFigSprite(c, fw, fh) {
    const s = document.createElement('canvas')
    const pad = 8
    s.width = Math.ceil((fw + pad * 2) * dpr)
    s.height = Math.ceil((fh + pad * 2) * dpr)
    const g = s.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, pad, pad)
    const cx = fw / 2
    const garb = GARB[c.kind] || GARB.coat
    const headR = fh * 0.085
    const headY = fh * 0.16
    const shW = fw * (c.kind === 'beard' ? 0.46 : c.kind === 'cap' ? 0.34 : 0.4)
    const hemY = fh * 0.9
    const bootH = fh * 0.1

    // --- boots first (under the hem) — the wet/dry tell
    const bootW = fw * 0.115
    for (const side of [-1, 1]) {
      const bx = cx + side * fw * 0.1 - bootW / 2
      const by = hemY - bootH * 0.18
      g.fillStyle = c.attrs.wet ? '#141f2a' : '#5d4a30'
      g.beginPath()
      g.roundRect(bx, by, bootW, bootH, 3)
      g.fill()
      g.beginPath() // toe
      g.ellipse(bx + bootW / 2 + side * 2.5, by + bootH - 2.5, bootW * 0.68, bootH * 0.3, 0, 0, TAU)
      g.fill()
      if (c.attrs.wet) {
        // glisten: cold sheen band + droplet glints
        g.fillStyle = 'rgba(140,200,235,0.5)'
        g.fillRect(bx + 1.5, by + bootH * 0.32, bootW - 3, 1.4)
        for (let k = 0; k < 4; k++) {
          g.fillRect(bx + 1 + Math.random() * (bootW - 2), by + Math.random() * bootH, 1.3, 1.3)
        }
      } else {
        g.fillStyle = 'rgba(220,200,160,0.3)' // dry dust
        for (let k = 0; k < 3; k++) {
          g.fillRect(bx + 1 + Math.random() * (bootW - 2), by + bootH * 0.5 + Math.random() * bootH * 0.4, 1.6, 1)
        }
      }
    }

    // --- body silhouettes per archetype
    g.fillStyle = garb.body
    g.beginPath()
    if (c.kind === 'shawl' || c.kind === 'bun' || c.kind === 'veil' || c.kind === 'scarf') {
      // bell dress
      g.moveTo(cx - shW * 0.5, headY + headR * 1.1)
      g.quadraticCurveTo(cx - fw * 0.46, fh * 0.62, cx - fw * 0.4, hemY)
      g.lineTo(cx + fw * 0.4, hemY)
      g.quadraticCurveTo(cx + fw * 0.46, fh * 0.62, cx + shW * 0.5, headY + headR * 1.1)
    } else if (c.kind === 'hat' || c.kind === 'fisher' || c.kind === 'beard') {
      // poncho — wide shoulders, straight fall
      g.moveTo(cx - shW * 0.62, headY + headR * 1.25)
      g.lineTo(cx - fw * 0.44, fh * 0.55)
      g.lineTo(cx - fw * 0.3, fh * 0.58)
      g.lineTo(cx - fw * 0.26, hemY)
      g.lineTo(cx + fw * 0.26, hemY)
      g.lineTo(cx + fw * 0.3, fh * 0.58)
      g.lineTo(cx + fw * 0.44, fh * 0.55)
      g.lineTo(cx + shW * 0.62, headY + headR * 1.25)
    } else {
      // narrow coat / boy
      g.moveTo(cx - shW * 0.55, headY + headR * 1.2)
      g.quadraticCurveTo(cx - fw * 0.3, fh * 0.5, cx - fw * 0.22, hemY)
      g.lineTo(cx + fw * 0.22, hemY)
      g.quadraticCurveTo(cx + fw * 0.3, fh * 0.5, cx + shW * 0.55, headY + headR * 1.2)
    }
    g.closePath()
    g.fill()
    // wool weave — faint horizontal striae
    g.strokeStyle = 'rgba(0,0,0,0.22)'
    g.lineWidth = 1
    for (let y = headY + headR * 2.2; y < hemY - 2; y += 5 + Math.random() * 4) {
      g.beginPath()
      g.moveTo(cx - fw * 0.42, y)
      g.quadraticCurveTo(cx, y + 2.5, cx + fw * 0.42, y)
      g.stroke()
    }
    // trim detail per garb
    g.strokeStyle = garb.trim
    g.lineWidth = 1.6
    if (c.kind === 'hat' || c.kind === 'fisher' || c.kind === 'beard') {
      g.beginPath() // poncho stripe
      g.moveTo(cx - fw * 0.4, fh * 0.46)
      g.quadraticCurveTo(cx, fh * 0.49, cx + fw * 0.4, fh * 0.46)
      g.stroke()
    } else if (c.kind === 'coat' || c.kind === 'cap') {
      g.beginPath() // coat seam + buttons
      g.moveTo(cx, headY + headR * 1.6)
      g.lineTo(cx, hemY * 0.92)
      g.stroke()
      g.fillStyle = garb.trim
      for (let k = 0; k < 3; k++) {
        g.beginPath()
        g.arc(cx, fh * (0.36 + k * 0.11), 1.6, 0, TAU)
        g.fill()
      }
    } else {
      g.beginPath() // shawl fringe
      g.moveTo(cx - shW * 0.5, fh * 0.36)
      g.quadraticCurveTo(cx, fh * 0.44, cx + shW * 0.5, fh * 0.36)
      g.stroke()
    }
    // arms hinted as darker folds
    g.strokeStyle = 'rgba(0,0,0,0.3)'
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(cx - shW * 0.42, headY + headR * 2)
    g.quadraticCurveTo(cx - fw * 0.34, fh * 0.5, cx - fw * 0.2, fh * 0.62)
    g.moveTo(cx + shW * 0.42, headY + headR * 2)
    g.quadraticCurveTo(cx + fw * 0.34, fh * 0.5, cx + fw * 0.2, fh * 0.62)
    g.stroke()

    // --- salt crust on the hem — the salt tell
    if (c.attrs.salt) {
      g.fillStyle = 'rgba(238,238,228,0.85)'
      for (let k = 0; k < 26; k++) {
        const sx = cx + (Math.random() - 0.5) * fw * 0.62
        const sy = hemY - 2 - Math.random() * fh * 0.13
        g.fillRect(sx, sy, 1.4 + Math.random(), 1.2)
      }
      g.fillStyle = 'rgba(238,238,228,0.4)'
      for (let k = 0; k < 16; k++) {
        const sx = cx + (Math.random() - 0.5) * fw * 0.55
        g.fillRect(sx, fh * (0.5 + Math.random() * 0.25), 1.2, 1)
      }
    }

    // --- head, lit from below by the candles
    const skin = g.createLinearGradient(0, headY + headR, 0, headY - headR)
    skin.addColorStop(0, '#cfa57d')
    skin.addColorStop(1, '#6e5640')
    g.fillStyle = skin
    g.beginPath()
    g.ellipse(cx, headY, headR * 0.82, headR, 0, 0, TAU)
    g.fill()
    // eyes — two dark hollows
    g.fillStyle = 'rgba(20,14,10,0.85)'
    g.beginPath()
    g.ellipse(cx - headR * 0.34, headY - headR * 0.08, 1.7, 2.1, 0, 0, TAU)
    g.ellipse(cx + headR * 0.34, headY - headR * 0.08, 1.7, 2.1, 0, 0, TAU)
    g.fill()
    // headgear
    g.fillStyle = garb.head
    if (c.kind === 'hat') {
      g.beginPath()
      g.ellipse(cx, headY - headR * 0.72, headR * 1.7, headR * 0.42, 0, 0, TAU)
      g.fill()
      g.beginPath()
      g.ellipse(cx, headY - headR * 0.95, headR * 0.78, headR * 0.62, 0, Math.PI, 0)
      g.fill()
    } else if (c.kind === 'cap' || c.kind === 'fisher') {
      g.beginPath()
      g.ellipse(cx, headY - headR * 0.62, headR * 0.95, headR * 0.6, 0, Math.PI, 0)
      g.fill()
      if (c.kind === 'cap') g.fillRect(cx - headR * 0.95, headY - headR * 0.52, headR * 1.3, headR * 0.22)
    } else if (c.kind === 'scarf' || c.kind === 'shawl' || c.kind === 'veil') {
      g.beginPath() // wrap over the head, knot or drape at the side
      g.ellipse(cx, headY - headR * 0.25, headR * 1.05, headR * 0.95, 0, Math.PI * 0.95, Math.PI * 0.05)
      g.fill()
      g.beginPath()
      g.moveTo(cx + headR * 0.85, headY)
      g.quadraticCurveTo(cx + headR * 1.5, headY + headR * (c.kind === 'veil' ? 2.6 : 1.2), cx + headR * 0.6, headY + headR * (c.kind === 'veil' ? 3 : 1.5))
      g.quadraticCurveTo(cx + headR * 0.5, headY + headR * 0.8, cx + headR * 0.55, headY + headR * 0.3)
      g.fill()
    } else if (c.kind === 'bun') {
      g.beginPath()
      g.ellipse(cx, headY - headR * 0.55, headR * 0.9, headR * 0.6, 0, Math.PI, 0)
      g.fill()
      g.beginPath()
      g.arc(cx, headY - headR * 1.25, headR * 0.4, 0, TAU)
      g.fill()
    } else if (c.kind === 'beard') {
      g.fillStyle = '#9a9080'
      g.beginPath() // a tide of grey beard
      g.moveTo(cx - headR * 0.7, headY + headR * 0.1)
      g.quadraticCurveTo(cx, headY + headR * 2.3, cx + headR * 0.7, headY + headR * 0.1)
      g.closePath()
      g.fill()
      g.fillStyle = garb.head
      g.beginPath() // bald crown shadow
      g.ellipse(cx, headY - headR * 0.7, headR * 0.7, headR * 0.35, 0, Math.PI, 0)
      g.fill()
    }
    // under-light: warm wash rising from the table
    g.globalCompositeOperation = 'source-atop'
    const warm = g.createLinearGradient(0, hemY, 0, headY - headR)
    warm.addColorStop(0, 'rgba(255,170,90,0.30)')
    warm.addColorStop(0.45, 'rgba(255,150,70,0.10)')
    warm.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = warm
    g.fillRect(-pad, -pad, fw + pad * 2, fh + pad * 2)
    // cold rim from the cave depths
    const cold = g.createLinearGradient(0, 0, 0, fh * 0.5)
    cold.addColorStop(0, 'rgba(159,255,208,0.07)')
    cold.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = cold
    g.fillRect(-pad, -pad, fw + pad * 2, fh + pad * 2)
    g.globalCompositeOperation = 'source-over'
    return s
  }

  // nameplate + the three trait glyphs, baked once
  function buildLabel(c, maxW) {
    const lw = Math.max(90, Math.min(maxW, 150))
    const lh = 30
    const s = document.createElement('canvas')
    s.width = Math.ceil(lw * dpr)
    s.height = Math.ceil(lh * dpr)
    const g = s.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.textAlign = 'center'
    g.fillStyle = 'rgba(232,220,192,0.62)'
    let fs = 10
    g.font = fs + 'px Georgia, serif'
    const nm = c.name.toUpperCase()
    while (g.measureText(nm).width > lw - 6 && fs > 7) {
      fs--
      g.font = fs + 'px Georgia, serif'
    }
    g.fillText(nm, lw / 2, 10)
    // trait glyph row: water · shadow · salt
    const cy = 21
    let gx = lw / 2 - 22
    // wet/dry — a droplet or a dry dash
    if (c.attrs.wet) {
      g.fillStyle = 'rgba(140,200,235,0.8)'
      g.beginPath()
      g.moveTo(gx, cy - 5)
      g.quadraticCurveTo(gx + 4, cy + 1, gx, cy + 3.4)
      g.quadraticCurveTo(gx - 4, cy + 1, gx, cy - 5)
      g.fill()
    } else {
      g.fillStyle = 'rgba(232,220,192,0.3)'
      g.fillRect(gx - 3.5, cy, 7, 1.4)
    }
    gx += 22
    // shadow — filled vs hollow ellipse
    if (c.attrs.shadow) {
      g.fillStyle = 'rgba(10,12,16,0.95)'
      g.strokeStyle = 'rgba(232,220,192,0.45)'
      g.beginPath()
      g.ellipse(gx, cy, 6, 2.8, 0, 0, TAU)
      g.fill()
      g.stroke()
    } else {
      g.strokeStyle = 'rgba(232,220,192,0.3)'
      g.setLineDash([2, 2])
      g.beginPath()
      g.ellipse(gx, cy, 6, 2.8, 0, 0, TAU)
      g.stroke()
      g.setLineDash([])
    }
    gx += 22
    // salt — three grains or a faint dash
    if (c.attrs.salt) {
      g.fillStyle = 'rgba(238,238,228,0.9)'
      g.fillRect(gx - 4, cy - 1, 2, 2)
      g.fillRect(gx, cy - 3.4, 2, 2)
      g.fillRect(gx + 3, cy, 2, 2)
    } else {
      g.fillStyle = 'rgba(232,220,192,0.3)'
      g.fillRect(gx - 3.5, cy, 7, 1.4)
    }
    return { img: s, w: lw, h: lh }
  }

  // --------------------------------------------------------------- public --
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    if (!noiseTile) noiseTile = makeNoiseTile()
    glowWarm = makeGlow(256, 'rgba(255,178,96,0.55)', 'rgba(255,150,70,0.18)')
    glowCore = makeGlow(64, 'rgba(255,240,200,0.95)', 'rgba(255,190,110,0.4)')
    if (chars) {
      layout()
      buildBg()
    }
  }

  function setCase(caseChars) {
    chars = caseChars
    gloom = 0
    flee.on = false
    flee.img = null
    for (let i = 0; i < sparks.length; i++) sparks[i].life = 0
    layout()
    buildBg()
    for (let i = 0; i < motes.length; i++) {
      motes[i].x = Math.random() * W
      motes[i].y = Math.random() * H * 0.75
      motes[i].vx = (Math.random() - 0.5) * 4
      motes[i].vy = -2 - Math.random() * 4
      motes[i].a = 0.05 + Math.random() * 0.2
    }
  }

  function relight(litCount) {
    let on = 0
    for (let i = 0; i < candles.length; i++) {
      const order = [0, 4, 1, 3, 2] // outermost die first
      const c = candles[order[i]]
      const want = on < litCount
      if (c.on && !want) {
        c.on = false
        c.die = 0.28
        puff(c.x, c.yTop - 4)
      }
      if (want) on++
    }
  }

  function puff(x, y) {
    for (let k = 0; k < 7; k++) {
      spawnSpark(x, y, (Math.random() - 0.5) * 14, -12 - Math.random() * 16, 0.9 + Math.random() * 0.5, 2.5 + Math.random() * 2, 'rgba(150,150,150,0.4)', -8)
    }
  }

  function spawnSpark(x, y, vx, vy, dur, size, col, grav) {
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i]
      if (p.life > 0) continue
      p.x = x
      p.y = y
      p.vx = vx
      p.vy = vy
      p.life = dur
      p.dur = dur
      p.size = size
      p.col = col
      p.grav = grav
      return
    }
  }

  function burst(i, col, n) {
    const f = figs[i]
    if (!f) return
    for (let k = 0; k < n; k++) {
      spawnSpark(
        f.x + (Math.random() - 0.5) * f.w * 0.7,
        f.yFeet - Math.random() * f.h * 0.8,
        (Math.random() - 0.5) * 60,
        -10 - Math.random() * 50,
        0.5 + Math.random() * 0.7,
        1.5 + Math.random() * 2,
        col, 30
      )
    }
  }

  function startFlee(i) {
    flee.on = true
    flee.i = i
    flee.t = 0
    flee.dir = figs[i] && figs[i].x > W / 2 ? 1 : -1
    // black-tinted copy of the sprite (event-time allocation, not per-frame)
    const src = figs[i].img
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const g = c.getContext('2d')
    g.drawImage(src, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = '#03050a'
    g.fillRect(0, 0, c.width, c.height)
    flee.img = c
    burst(i, 'rgba(159,255,208,0.8)', 26)
  }

  function figureAt(x, y) {
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i]
      if (x > f.x - f.w * 0.55 && x < f.x + f.w * 0.55 && y > f.yFeet - f.h * 1.04 && y < f.yFeet + 26) return i
    }
    return -1
  }

  function shake(a) { shakeA = Math.max(shakeA, a) }
  function pulse(col) {
    pulseA = 0.5
    pulseCol = col
  }
  function setGloom(g) { gloom = Math.max(0, Math.min(1, g)) }

  // ----------------------------------------------------------------- draw --
  function draw(game, dt) {
    if (!chars) return
    visT += dt
    flicker = 0.84 + 0.1 * Math.sin(visT * 9.1) + 0.06 * Math.sin(visT * 23.7 + 1.4)
    const light = (1 - gloom * 0.92) * flicker
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (shakeA > 0.05) {
      ctx.translate((Math.random() - 0.5) * shakeA * 2, (Math.random() - 0.5) * shakeA * 2)
      shakeA *= Math.pow(0.0015, dt) // fast decay
    } else shakeA = 0
    ctx.drawImage(bg, 0, 0, W, H)

    // candle halos behind the figures
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]
      if (!c.on && c.die <= 0) continue
      const k = c.on ? 1 : c.die / 0.28
      const r = H * 0.34 * (0.9 + 0.1 * Math.sin(visT * 7 + i * 1.7))
      ctx.globalAlpha = 0.5 * light * k
      ctx.drawImage(glowWarm, c.x - r, c.yTop - 6 - r, r * 2, r * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // figures: shadow, sprite, selection, marks
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i]
      const c = chars[i]
      const fleeing = flee.on && flee.i === i
      const bobY = Math.sin(visT * 1.1 + f.bob) * 1.6
      // the shadow on the floor — or its absence
      if (c.attrs.shadow && !(fleeing && flee.t > 0.35)) {
        ctx.fillStyle = 'rgba(2,4,7,0.62)'
        ctx.beginPath()
        ctx.ellipse(f.x, f.yFeet + 7, f.w * 0.52, f.h * 0.045, 0, 0, TAU)
        ctx.fill()
      }
      const selected = game.selected === i && game.phase === 'playing'
      if (selected || (game.accuseMode && game.phase === 'playing')) {
        ctx.save()
        ctx.shadowColor = selected ? 'rgba(159,255,208,0.85)' : 'rgba(217,106,85,0.7)'
        ctx.shadowBlur = selected ? 22 : 14
        ctx.drawImage(f.img, f.x - f.w / 2 - 8, f.yFeet - f.h - 8 + bobY, f.w + 16, f.h + 16)
        ctx.restore()
      } else {
        ctx.drawImage(f.img, f.x - f.w / 2 - 8, f.yFeet - f.h - 8 + bobY, f.w + 16, f.h + 16)
      }
      // notebook mark floating above the head
      const mark = game.marks[i]
      if (mark) {
        ctx.font = '15px Georgia, serif'
        ctx.textAlign = 'center'
        if (mark === 2) {
          ctx.fillStyle = 'rgba(217,106,85,0.9)'
          ctx.fillText('✗', f.x, f.yFeet - f.h - 12 + bobY)
        } else {
          ctx.fillStyle = 'rgba(159,255,208,0.75)'
          ctx.fillText('○', f.x, f.yFeet - f.h - 12 + bobY)
        }
      }
      ctx.globalAlpha = Math.max(0.25, light)
      ctx.drawImage(f.label.img, f.x - f.label.w / 2, f.yFeet + 12, f.label.w, f.label.h)
      ctx.globalAlpha = 1
    }

    // the fleeing shadow tears away and runs for the cave mouth
    if (flee.on) {
      flee.t += dt
      const t = Math.min(1, flee.t / 2.0)
      const f = figs[flee.i]
      if (f && flee.img) {
        const ease = t * t * (3 - 2 * t)
        const dx = flee.dir * ease * W * 0.65
        const stretch = 1 + ease * 1.6
        const a = t < 0.15 ? t / 0.15 : 1 - ease * 0.9
        ctx.globalAlpha = Math.max(0, a * 0.9)
        const wob = Math.sin(flee.t * 13) * 6 * (1 - t)
        ctx.drawImage(
          flee.img,
          f.x - (f.w * stretch) / 2 + dx,
          f.yFeet - f.h * (1 - ease * 0.45) + wob,
          f.w * stretch,
          f.h * (1 - ease * 0.45)
        )
        ctx.globalAlpha = 1
        if (Math.random() < dt * 30) {
          spawnSpark(f.x + dx, f.yFeet - f.h * 0.4, flee.dir * 30, (Math.random() - 0.5) * 30, 0.5, 2, 'rgba(159,255,208,0.6)', 0)
        }
      }
      if (flee.t > 2.4) flee.on = false
    }

    // flames + cores
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]
      if (!c.on && c.die <= 0) continue
      let k = 1
      if (!c.on) {
        c.die -= dt
        k = Math.max(0, c.die / 0.28)
      }
      const fx = c.x + Math.sin(visT * 11 + i * 2.3) * 1.2
      const fh = (9 + Math.sin(visT * 8.7 + i) * 2.2) * k
      const fy = c.yTop - 2
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.9 * k * (gloom < 1 ? 1 : 0)
      ctx.drawImage(glowCore, fx - 9, fy - fh - 9, 18, 18)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      // teardrop flame
      ctx.fillStyle = 'rgba(255,205,120,0.95)'
      ctx.beginPath()
      ctx.moveTo(fx, fy - fh)
      ctx.quadraticCurveTo(fx + 3.4 * k, fy - fh * 0.35, fx, fy)
      ctx.quadraticCurveTo(fx - 3.4 * k, fy - fh * 0.35, fx, fy - fh)
      ctx.fill()
      ctx.fillStyle = 'rgba(120,170,255,0.5)'
      ctx.beginPath()
      ctx.ellipse(fx, fy - 1.5, 1.6 * k, 2.6 * k, 0, 0, TAU)
      ctx.fill()
    }

    // dust motes in the candlelight
    ctx.fillStyle = 'rgba(232,214,170,0.5)'
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i]
      m.x += (m.vx + Math.sin(visT * 0.7 + m.ph) * 3) * dt
      m.y += m.vy * dt
      if (m.y < H * 0.1 || m.x < -5 || m.x > W + 5) {
        m.x = Math.random() * W
        m.y = H * (0.5 + Math.random() * 0.3)
      }
      ctx.globalAlpha = m.a * light * (0.6 + 0.4 * Math.sin(visT * 2 + m.ph))
      ctx.fillRect(m.x, m.y, 1.4, 1.4)
    }
    ctx.globalAlpha = 1

    // event sparks / smoke
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i]
      if (p.life <= 0) continue
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.grav * dt
      ctx.globalAlpha = Math.max(0, p.life / p.dur)
      ctx.fillStyle = p.col
      ctx.fillRect(p.x, p.y, p.size, p.size)
    }
    ctx.globalAlpha = 1

    // gloom (the candles going out) + pulse flash
    if (gloom > 0.01) {
      ctx.fillStyle = 'rgba(1,2,4,' + (gloom * 0.72).toFixed(3) + ')'
      ctx.fillRect(0, 0, W, H)
    }
    if (pulseA > 0.01) {
      pulseA *= Math.pow(0.01, dt)
      ctx.globalAlpha = pulseA
      ctx.fillStyle = pulseCol
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }

  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)
  resize()

  return { resize, setCase, draw, figureAt, shake, pulse, burst, startFlee, relight, setGloom, get fleeing() { return flee.on } }
}
