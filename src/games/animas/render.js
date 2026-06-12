// render.js — LA BARCA DE LAS ÁNIMAS · canvas2d renderer.
// Side view of the last strait: dithered night sky, low moon with a shimmer
// path, black water with current streaks, the wooden dock, the long ferry
// (pre-rendered hull sprite rotated by the live tilt), faintly luminous soul
// figures (each a small character: hat, shawl, a child holding a little
// boat), the Caleuche growing out of the fog across trips, a gangplank of
// pale light at arrival, and a clear tilt gauge with red arcs.
// All sprites/textures are built ONCE per resize (buildAssets); particles
// live in fixed pools; draw() allocates nothing per frame.

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, k) => a + (b - a) * k

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

  // --- layout (recomputed in place each frame) -----------------------------
  const L = {
    w: 0, h: 0, s: 1, horizon: 0, waterY: 0, dockEdge: 0, dockY: 0,
    half: 0, bx0: 0, bx1: 0, bx: 0, by: 0, ang: 0,
    shipX: 0, shipWY: 0, shipScale: 1, railX: 0, railY: 0,
    moonX: 0, moonY: 0, moonR: 0, gaugeX: 0, gaugeY: 0, gaugeR: 0,
  }

  // --- prebuilt assets ------------------------------------------------------
  let lastW = -1
  let lastH = -1
  let sky = null
  let moonSpr = null
  let hullSpr = null
  let hullW = 0
  let hullH = 0
  let hullAnchorY = 0 // waterline y inside hull sprite
  let dockSpr = null
  let shipSpr = null
  let shipW = 0
  let shipH = 0
  const shipLights = [] // [x, y, phase] sprite-local, reused
  let ferrySpr = null
  let ferryH = 0
  const soulSpr = {} // kind -> {c, w, h, base}
  let glowG = null
  let glowW = null
  let glowF = null
  let noisePat = null
  let waterGrad = null
  let stripGrad = null

  let visT = 0
  let shakeP = 0
  let flashA = 0
  let flashCol = '#ffffff'

  // --- pools ---------------------------------------------------------------
  function pool(n, init) {
    const a = []
    for (let i = 0; i < n; i++) {
      const o = init()
      o.on = false
      a.push(o)
    }
    return a
  }
  const drops = pool(140, () => ({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1 }))
  const sinks = pool(10, () => ({ x: 0, y: 0, t: 0, life: 3.6 }))
  const motes = pool(50, () => ({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, warm: false }))
  const wakes = pool(36, () => ({ x: 0, y: 0, t: 0, life: 1, r: 2 }))
  const pops = pool(6, () => ({ x: 0, y: 0, t: 0, text: '', color: '#fff' }))
  const gustStreaks = pool(20, () => ({ x: 0, y: 0, t: 0, life: 1, spd: 0, len: 0 }))
  // ambient current streaks + drifting wisps: always-on, wrap around
  const streaks = []
  for (let i = 0; i < 26; i++) {
    streaks.push({ u: Math.random(), v: Math.random(), len: 0.4 + Math.random() * 0.8, spd: 0.5 + Math.random() * 0.9, ph: Math.random() * TAU })
  }
  const wisps = []
  for (let i = 0; i < 6; i++) {
    wisps.push({ u: Math.random(), v: Math.random(), ph: Math.random() * TAU, sp: 0.15 + Math.random() * 0.25 })
  }

  function spawn(arr) {
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i].on) {
        arr[i].on = true
        return arr[i]
      }
    }
    return null
  }

  // --- asset builders --------------------------------------------------------
  function offc(w, h) {
    const c = document.createElement('canvas')
    c.width = Math.max(2, Math.ceil(w))
    c.height = Math.max(2, Math.ceil(h))
    return c
  }

  function makeGlow(color) {
    const c = offc(96, 96)
    const g = c.getContext('2d')
    const gr = g.createRadialGradient(48, 48, 2, 48, 48, 46)
    gr.addColorStop(0, color)
    gr.addColorStop(0.45, color.replace('1)', '0.28)'))
    gr.addColorStop(1, color.replace('1)', '0)'))
    g.fillStyle = gr
    g.fillRect(0, 0, 96, 96)
    return c
  }

  function makeNoise() {
    const c = offc(96, 96)
    const g = c.getContext('2d')
    const img = g.createImageData(96, 96)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 26
    }
    g.putImageData(img, 0, 0)
    return ctx.createPattern(c, 'repeat')
  }

  function buildSky(w, h) {
    sky = offc(w, h)
    const g = sky.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, h * 0.42)
    grad.addColorStop(0, '#020409')
    grad.addColorStop(0.55, '#060b13')
    grad.addColorStop(0.9, '#0b141d')
    grad.addColorStop(1, '#0e1822')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h * 0.42)
    g.fillStyle = '#02040a'
    g.fillRect(0, h * 0.42, w, h)
    // stars (dither the sky too)
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * w
      const y = Math.pow(Math.random(), 1.4) * h * 0.34
      const r = Math.random() < 0.12 ? 1.3 : 0.7
      g.globalAlpha = 0.25 + Math.random() * 0.55
      g.fillStyle = Math.random() < 0.2 ? '#cfe5ff' : '#e8eef5'
      g.beginPath()
      g.arc(x, y, r, 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1
    // far ridges of the archipelago, layered
    const hor = h * 0.40
    g.fillStyle = 'rgba(10,18,24,0.9)'
    ridge(g, w, hor, 0.030 * h, 0.13, 3)
    g.fillStyle = 'rgba(6,12,17,0.95)'
    ridge(g, w, hor, 0.018 * h, 0.31, 5)
  }

  function ridge(g, w, hor, amp, seed, det) {
    g.beginPath()
    g.moveTo(0, hor)
    for (let x = 0; x <= w; x += w / 90) {
      const t = x / w
      let y = 0
      for (let o = 1; o <= det; o++) y += Math.sin(t * o * 7 + seed * 40 + o * 13.7) / o
      g.lineTo(x, hor - Math.max(0, y) * amp - amp * 0.2)
    }
    g.lineTo(w, hor + 4)
    g.lineTo(0, hor + 4)
    g.fill()
  }

  function buildMoon(s) {
    const r = 34 * s
    moonSpr = offc(r * 7, r * 7)
    const g = moonSpr.getContext('2d')
    const c = r * 3.5
    let gr = g.createRadialGradient(c, c, r * 0.4, c, c, r * 3.4)
    gr.addColorStop(0, 'rgba(214,226,224,0.34)')
    gr.addColorStop(0.3, 'rgba(190,210,205,0.1)')
    gr.addColorStop(1, 'rgba(180,205,200,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, r * 7, r * 7)
    gr = g.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r)
    gr.addColorStop(0, '#e6ece4')
    gr.addColorStop(0.75, '#c8d4cc')
    gr.addColorStop(1, '#9fb1ac')
    g.fillStyle = gr
    g.beginPath()
    g.arc(c, c, r, 0, TAU)
    g.fill()
    // maria — the moon's worn face
    g.fillStyle = 'rgba(140,160,155,0.5)'
    const spots = [[-0.3, -0.25, 0.3], [0.25, 0.05, 0.22], [-0.05, 0.32, 0.18], [0.4, -0.32, 0.12]]
    for (const sp of spots) {
      g.beginPath()
      g.arc(c + sp[0] * r, c + sp[1] * r, sp[2] * r, 0, TAU)
      g.fill()
    }
  }

  function buildHull(s, half) {
    hullW = half * 2 + 90 * s
    hullH = 130 * s
    hullAnchorY = 74 * s // waterline inside sprite
    hullSpr = offc(hullW, hullH)
    const g = hullSpr.getContext('2d')
    const cx = hullW / 2
    const wl = hullAnchorY
    const deck = wl - 13 * s // freeboard
    // hull body — long chalupa, curved sheer, raised stem and stern
    const grad = g.createLinearGradient(0, deck - 8 * s, 0, wl + 30 * s)
    grad.addColorStop(0, '#3a2815')
    grad.addColorStop(0.45, '#241708')
    grad.addColorStop(1, '#120a04')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(cx - half, deck - 16 * s) // stern sheer
    g.quadraticCurveTo(cx - half * 0.5, deck + 2 * s, cx, deck + 3 * s)
    g.quadraticCurveTo(cx + half * 0.5, deck + 2 * s, cx + half, deck - 19 * s) // bow sheer
    g.quadraticCurveTo(cx + half * 0.86, wl + 16 * s, cx + half * 0.55, wl + 24 * s)
    g.quadraticCurveTo(cx, wl + 30 * s, cx - half * 0.55, wl + 24 * s)
    g.quadraticCurveTo(cx - half * 0.86, wl + 14 * s, cx - half, deck - 16 * s)
    g.closePath()
    g.fill()
    // plank seams
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 1
    for (let i = 1; i <= 3; i++) {
      const yy = deck + 3 * s + i * 6.4 * s
      g.beginPath()
      g.moveTo(cx - half * (1 - i * 0.06), yy - 8 * s * (i * 0.3))
      g.quadraticCurveTo(cx, yy + 4 * s, cx + half * (1 - i * 0.06), yy - 9 * s * (i * 0.3))
      g.stroke()
    }
    // wood grain flecks
    g.strokeStyle = 'rgba(90,62,30,0.35)'
    for (let i = 0; i < 26; i++) {
      const gx = cx - half * 0.9 + Math.random() * half * 1.8
      const gy = deck + 4 * s + Math.random() * 18 * s
      g.beginPath()
      g.moveTo(gx, gy)
      g.lineTo(gx + (6 + Math.random() * 14) * s, gy + (Math.random() - 0.5) * 2 * s)
      g.stroke()
    }
    // gunwale moonlit rim
    g.strokeStyle = 'rgba(150,170,185,0.5)'
    g.lineWidth = 1.4 * s
    g.beginPath()
    g.moveTo(cx - half, deck - 16 * s)
    g.quadraticCurveTo(cx, deck + 3.5 * s, cx + half, deck - 19 * s)
    g.stroke()
    // painted waterline stripe (so the dip is readable against the water)
    g.strokeStyle = 'rgba(159,255,208,0.22)'
    g.lineWidth = 1.6 * s
    g.beginPath()
    g.moveTo(cx - half * 0.92, wl + 2 * s)
    g.quadraticCurveTo(cx, wl + 9 * s, cx + half * 0.92, wl + 1 * s)
    g.stroke()
    // stern post + bow post with lantern arm
    g.strokeStyle = '#2c1d0d'
    g.lineWidth = 4.4 * s
    g.beginPath()
    g.moveTo(cx - half + 2 * s, deck - 14 * s)
    g.lineTo(cx - half - 4 * s, deck - 34 * s)
    g.stroke()
    g.beginPath()
    g.moveTo(cx + half - 2 * s, deck - 17 * s)
    g.lineTo(cx + half + 4 * s, deck - 46 * s)
    g.stroke()
    g.lineWidth = 2.2 * s
    g.beginPath()
    g.moveTo(cx + half + 4 * s, deck - 46 * s)
    g.lineTo(cx + half - 4 * s, deck - 52 * s)
    g.stroke()
    // the lantern cage
    g.fillStyle = '#1a1208'
    g.fillRect(cx + half - 8.4 * s, deck - 58 * s, 8.8 * s, 9.6 * s)
    g.fillStyle = '#ffd9a0'
    g.fillRect(cx + half - 6.8 * s, deck - 56.4 * s, 5.6 * s, 6.4 * s)
    // ribs above deck (thwarts)
    g.strokeStyle = 'rgba(58,40,21,0.9)'
    g.lineWidth = 2 * s
    for (let i = -3; i <= 3; i++) {
      const rx = cx + i * half * 0.27
      g.beginPath()
      g.moveTo(rx, deck + 2 * s)
      g.lineTo(rx, deck - 4 * s)
      g.stroke()
    }
  }

  function buildDock(w, h, s) {
    const dw = L.dockEdge + 8 * s
    dockSpr = offc(dw, h * 0.42)
    const g = dockSpr.getContext('2d')
    const top = 0 // sprite y0 maps to dockY - 8*s
    const deckY = 8 * s
    // planks
    const grad = g.createLinearGradient(0, top, 0, deckY + 7 * s)
    grad.addColorStop(0, '#33240f')
    grad.addColorStop(1, '#1a1106')
    g.fillStyle = grad
    g.fillRect(0, top, dw, deckY + 7 * s)
    g.strokeStyle = 'rgba(0,0,0,0.55)'
    g.lineWidth = 1
    for (let x = 10 * s; x < dw; x += 17 * s) {
      g.beginPath()
      g.moveTo(x, top)
      g.lineTo(x - 3 * s, deckY + 7 * s)
      g.stroke()
    }
    g.strokeStyle = 'rgba(150,170,185,0.35)'
    g.lineWidth = 1.2 * s
    g.beginPath()
    g.moveTo(0, top + 1)
    g.lineTo(dw, top + 1)
    g.stroke()
    // posts down into the water, mussel-dark at the foot
    g.fillStyle = '#150d05'
    const posts = [dw * 0.16, dw * 0.52, dw * 0.88]
    for (const px of posts) {
      g.fillRect(px - 3.6 * s, deckY, 7.2 * s, 86 * s)
      g.fillStyle = 'rgba(20,30,28,0.8)'
      g.fillRect(px - 4.2 * s, deckY + 58 * s, 8.4 * s, 28 * s)
      g.fillStyle = '#150d05'
    }
    // lantern post at the edge
    g.strokeStyle = '#1d1308'
    g.lineWidth = 3.6 * s
    g.beginPath()
    g.moveTo(dw - 14 * s, top)
    g.lineTo(dw - 14 * s, top - 0) // drawn upward in main blit via lantern glow
    g.stroke()
  }

  function buildShip(w, h, s) {
    shipW = w * 0.40
    shipH = h * 0.56
    shipSpr = offc(shipW, shipH)
    const g = shipSpr.getContext('2d')
    const wl = shipH - 12 * s // waterline inside sprite
    const x0 = shipW * 0.06
    const x1 = shipW * 0.98
    const hullTop = wl - 56 * s
    // hull — high curved prow toward the strait (left)
    g.fillStyle = '#101c26'
    g.beginPath()
    g.moveTo(x0, hullTop - 26 * s)
    g.quadraticCurveTo(x0 + shipW * 0.05, hullTop + 8 * s, x0 + shipW * 0.16, hullTop + 12 * s)
    g.lineTo(x1, hullTop + 6 * s)
    g.lineTo(x1, wl + 8 * s)
    g.quadraticCurveTo(shipW * 0.4, wl + 14 * s, x0 + shipW * 0.10, wl)
    g.quadraticCurveTo(x0 - 4 * s, hullTop + 20 * s, x0, hullTop - 26 * s)
    g.closePath()
    g.fill()
    // stern castle
    g.fillRect(x1 - shipW * 0.16, hullTop - 22 * s, shipW * 0.16, 28 * s)
    // rails
    g.strokeStyle = 'rgba(110,150,150,0.4)'
    g.lineWidth = 1.3 * s
    g.beginPath()
    g.moveTo(x0 + shipW * 0.14, hullTop + 10 * s)
    g.lineTo(x1, hullTop + 4 * s)
    g.stroke()
    // masts + yards + a ghost of sail
    const masts = [0.3, 0.55, 0.8]
    shipLights.length = 0
    g.strokeStyle = '#0e1822'
    for (let i = 0; i < masts.length; i++) {
      const mx = shipW * masts[i]
      const mh = shipH * (0.78 - i * 0.08)
      g.lineWidth = 3.4 * s
      g.beginPath()
      g.moveTo(mx, hullTop + 10 * s)
      g.lineTo(mx + 6 * s, hullTop + 10 * s - mh)
      g.stroke()
      g.lineWidth = 2 * s
      for (let yy = 1; yy <= 2; yy++) {
        const my = hullTop + 6 * s - mh * yy * 0.38
        const yw = shipW * (0.14 - yy * 0.03)
        g.beginPath()
        g.moveTo(mx + 6 * s * yy * 0.38 - yw, my)
        g.lineTo(mx + 6 * s * yy * 0.38 + yw, my)
        g.stroke()
        // furled spectral sail
        g.fillStyle = 'rgba(159,255,208,0.10)'
        g.beginPath()
        g.moveTo(mx + 6 * s * yy * 0.38 - yw, my)
        g.quadraticCurveTo(mx, my + 26 * s, mx + 6 * s * yy * 0.38 + yw, my)
        g.closePath()
        g.fill()
        g.fillStyle = '#0e1822'
      }
    }
    // rigging
    g.strokeStyle = 'rgba(100,130,135,0.25)'
    g.lineWidth = 0.8 * s
    const rig = [[0.3, 0.06], [0.3, 0.5], [0.55, 0.32], [0.55, 0.95], [0.8, 0.6], [0.8, 0.98]]
    for (const r of rig) {
      const mx = shipW * r[0]
      const mh = shipH * (0.78 - (r[0] - 0.3) * 0.32)
      g.beginPath()
      g.moveTo(mx + 5 * s, hullTop + 10 * s - mh)
      g.lineTo(shipW * r[1], hullTop + 8 * s)
      g.stroke()
    }
    // light positions: along the rail + up the masts + portholes
    for (let i = 0; i < 9; i++) shipLights.push([x0 + shipW * (0.16 + i * 0.094), hullTop + (9 - i * 0.5) * s, Math.random() * TAU])
    for (let i = 0; i < 6; i++) shipLights.push([shipW * (0.34 + i * 0.1), hullTop + 22 * s, Math.random() * TAU])
    for (let i = 0; i < 6; i++) {
      const m = masts[i % 3]
      shipLights.push([shipW * m + 6 * s, hullTop - shipH * (0.18 + 0.16 * (i / 5)), Math.random() * TAU])
    }
    for (let i = 0; i < 5; i++) shipLights.push([x1 - shipW * 0.14 + i * shipW * 0.03, hullTop - 8 * s, Math.random() * TAU])
  }

  // --- soul figures (pre-rendered characters) -------------------------------
  // Anchor: base (feet/hem) at bottom-center of sprite. Faintly luminous,
  // fading to wisp at the hem; hollow dark eyes. Each silhouette distinct.
  function bodyGrad(g, hgt, a) {
    const gr = g.createLinearGradient(0, -hgt, 0, 2)
    gr.addColorStop(0, 'rgba(226,246,232,' + 0.95 * a + ')')
    gr.addColorStop(0.55, 'rgba(168,222,192,' + 0.78 * a + ')')
    gr.addColorStop(0.9, 'rgba(140,200,172,' + 0.18 * a + ')')
    gr.addColorStop(1, 'rgba(140,200,172,0)')
    return gr
  }

  function makeSoul(kind, s) {
    const hgt = (kind === 'nino' ? 21 : kind === 'inquieta' ? 33 : kind === 'pescador' ? 30 : 28) * s
    const W = hgt * 1.5
    const H = hgt * 1.25
    const c = offc(W, H)
    const g = c.getContext('2d')
    g.translate(W / 2, H - 2)
    g.fillStyle = bodyGrad(g, hgt, 1)
    if (kind === 'pescador') {
      // heavy old fisherman: wide hat, hunched shoulders, clasped hands
      g.beginPath()
      g.moveTo(-hgt * 0.30, 0)
      g.quadraticCurveTo(-hgt * 0.34, -hgt * 0.42, -hgt * 0.26, -hgt * 0.62)
      g.quadraticCurveTo(-hgt * 0.1, -hgt * 0.76, hgt * 0.1, -hgt * 0.74)
      g.quadraticCurveTo(hgt * 0.3, -hgt * 0.66, hgt * 0.32, -hgt * 0.4)
      g.quadraticCurveTo(hgt * 0.34, -hgt * 0.16, hgt * 0.28, 0)
      g.closePath()
      g.fill()
      // head under the brim
      g.beginPath()
      g.arc(hgt * 0.02, -hgt * 0.78, hgt * 0.15, 0, TAU)
      g.fill()
      // clasped hands
      g.beginPath()
      g.arc(hgt * 0.16, -hgt * 0.4, hgt * 0.08, 0, TAU)
      g.fill()
      // hat: brim + low dome, slightly darker (worn wool)
      g.fillStyle = 'rgba(150,205,180,0.85)'
      g.beginPath()
      g.ellipse(hgt * 0.02, -hgt * 0.87, hgt * 0.30, hgt * 0.06, -0.06, 0, TAU)
      g.fill()
      g.beginPath()
      g.arc(hgt * 0.02, -hgt * 0.89, hgt * 0.13, Math.PI, 0)
      g.fill()
      g.fillStyle = 'rgba(8,20,16,0.85)'
      g.beginPath()
      g.arc(-hgt * 0.035, -hgt * 0.79, hgt * 0.022, 0, TAU)
      g.arc(hgt * 0.075, -hgt * 0.79, hgt * 0.022, 0, TAU)
      g.fill()
    } else if (kind === 'viuda') {
      // widow: shawl over the head, bowed, long skirt
      g.beginPath()
      g.moveTo(-hgt * 0.27, 0)
      g.quadraticCurveTo(-hgt * 0.24, -hgt * 0.5, -hgt * 0.17, -hgt * 0.72)
      g.quadraticCurveTo(-hgt * 0.05, -hgt * 1.0, hgt * 0.1, -hgt * 0.92)
      g.quadraticCurveTo(hgt * 0.21, -hgt * 0.8, hgt * 0.18, -hgt * 0.55)
      g.quadraticCurveTo(hgt * 0.26, -hgt * 0.2, hgt * 0.24, 0)
      g.closePath()
      g.fill()
      // hood void + pale face looking down
      g.fillStyle = 'rgba(8,18,16,0.6)'
      g.beginPath()
      g.ellipse(hgt * 0.03, -hgt * 0.78, hgt * 0.11, hgt * 0.13, 0.18, 0, TAU)
      g.fill()
      g.fillStyle = 'rgba(225,245,230,0.9)'
      g.beginPath()
      g.ellipse(hgt * 0.05, -hgt * 0.76, hgt * 0.075, hgt * 0.095, 0.22, 0, TAU)
      g.fill()
      g.fillStyle = 'rgba(8,20,16,0.9)'
      g.beginPath()
      g.arc(hgt * 0.025, -hgt * 0.77, hgt * 0.018, 0, TAU)
      g.arc(hgt * 0.085, -hgt * 0.76, hgt * 0.018, 0, TAU)
      g.fill()
      // shawl folds
      g.strokeStyle = 'rgba(120,180,155,0.5)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(-hgt * 0.1, -hgt * 0.62)
      g.quadraticCurveTo(-hgt * 0.04, -hgt * 0.3, -hgt * 0.08, 0)
      g.stroke()
    } else if (kind === 'nino') {
      // child: round bare head, small body, holding a little wooden boat
      g.beginPath()
      g.moveTo(-hgt * 0.22, 0)
      g.quadraticCurveTo(-hgt * 0.26, -hgt * 0.38, -hgt * 0.14, -hgt * 0.55)
      g.quadraticCurveTo(0, -hgt * 0.62, hgt * 0.14, -hgt * 0.55)
      g.quadraticCurveTo(hgt * 0.26, -hgt * 0.36, hgt * 0.22, 0)
      g.closePath()
      g.fill()
      g.beginPath()
      g.arc(0, -hgt * 0.72, hgt * 0.20, 0, TAU)
      g.fill()
      // tuft
      g.strokeStyle = 'rgba(210,240,220,0.8)'
      g.lineWidth = 1.2
      g.beginPath()
      g.moveTo(0, -hgt * 0.9)
      g.quadraticCurveTo(hgt * 0.06, -hgt * 0.98, hgt * 0.1, -hgt * 0.93)
      g.stroke()
      g.fillStyle = 'rgba(8,20,16,0.9)'
      g.beginPath()
      g.arc(-hgt * 0.065, -hgt * 0.72, hgt * 0.026, 0, TAU)
      g.arc(hgt * 0.065, -hgt * 0.72, hgt * 0.026, 0, TAU)
      g.fill()
      // the little boat, held tight — a warm fleck in a cold hand
      g.fillStyle = 'rgba(40,26,12,0.95)'
      g.beginPath()
      g.moveTo(hgt * 0.08, -hgt * 0.34)
      g.lineTo(hgt * 0.32, -hgt * 0.34)
      g.lineTo(hgt * 0.26, -hgt * 0.26)
      g.lineTo(hgt * 0.13, -hgt * 0.26)
      g.closePath()
      g.fill()
      g.fillStyle = '#ffd9a0'
      g.beginPath()
      g.moveTo(hgt * 0.195, -hgt * 0.35)
      g.lineTo(hgt * 0.195, -hgt * 0.47)
      g.lineTo(hgt * 0.27, -hgt * 0.36)
      g.closePath()
      g.fill()
    } else {
      // inquieta: thin, tall, upright — hair like kelp in a slow current
      g.beginPath()
      g.moveTo(-hgt * 0.16, 0)
      g.quadraticCurveTo(-hgt * 0.17, -hgt * 0.52, -hgt * 0.12, -hgt * 0.72)
      g.quadraticCurveTo(-hgt * 0.04, -hgt * 0.8, hgt * 0.05, -hgt * 0.79)
      g.quadraticCurveTo(hgt * 0.14, -hgt * 0.72, hgt * 0.13, -hgt * 0.5)
      g.quadraticCurveTo(hgt * 0.17, -hgt * 0.2, hgt * 0.14, 0)
      g.closePath()
      g.fill()
      g.beginPath()
      g.arc(0, -hgt * 0.88, hgt * 0.13, 0, TAU)
      g.fill()
      g.fillStyle = 'rgba(8,20,16,0.95)'
      g.beginPath()
      g.arc(-hgt * 0.045, -hgt * 0.89, hgt * 0.022, 0, TAU)
      g.arc(hgt * 0.05, -hgt * 0.89, hgt * 0.022, 0, TAU)
      g.fill()
    }
    soulSpr[kind] = { c, w: W, h: H, hgt }
  }

  function buildFerry(s) {
    ferryH = 48 * s
    const W = ferryH * 1.2
    const c = offc(W, ferryH * 1.1)
    const g = c.getContext('2d')
    g.translate(W / 2, ferryH * 1.06)
    const hgt = ferryH
    // long oilskin coat — a dark, living silhouette among the dead
    const gr = g.createLinearGradient(0, -hgt, 0, 0)
    gr.addColorStop(0, '#222b36')
    gr.addColorStop(1, '#0b0f15')
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(-hgt * 0.2, 0)
    g.quadraticCurveTo(-hgt * 0.22, -hgt * 0.5, -hgt * 0.15, -hgt * 0.68)
    g.quadraticCurveTo(-hgt * 0.02, -hgt * 0.78, hgt * 0.1, -hgt * 0.72)
    g.quadraticCurveTo(hgt * 0.18, -hgt * 0.6, hgt * 0.16, -hgt * 0.42)
    g.quadraticCurveTo(hgt * 0.2, -hgt * 0.16, hgt * 0.17, 0)
    g.closePath()
    g.fill()
    // head + wide hat
    g.fillStyle = '#1a222c'
    g.beginPath()
    g.arc(hgt * 0.01, -hgt * 0.82, hgt * 0.11, 0, TAU)
    g.fill()
    g.fillStyle = '#06090c'
    g.beginPath()
    g.ellipse(hgt * 0.01, -hgt * 0.88, hgt * 0.24, hgt * 0.05, -0.08, 0, TAU)
    g.fill()
    g.beginPath()
    g.arc(hgt * 0.01, -hgt * 0.9, hgt * 0.11, Math.PI, 0)
    g.fill()
    // moonlit rim on hat + shoulder
    g.strokeStyle = 'rgba(150,175,190,0.5)'
    g.lineWidth = 1.1 * s
    g.beginPath()
    g.moveTo(-hgt * 0.22, -hgt * 0.875)
    g.quadraticCurveTo(hgt * 0.01, -hgt * 0.95, hgt * 0.24, -hgt * 0.885)
    g.stroke()
    ferrySpr = c
  }

  function buildAssets(w, h) {
    lastW = w
    lastH = h
    const s = (L.s = h / 540)
    L.w = w
    L.h = h
    L.horizon = h * 0.40
    L.waterY = h * 0.635
    L.dockEdge = Math.max(w * 0.145, 90 * s)
    L.dockY = L.waterY - 24 * s
    L.half = clamp(w * 0.16, 110 * s, 175 * s)
    L.bx0 = L.dockEdge + L.half + 26 * s
    L.shipX = w * 0.79
    L.shipWY = L.waterY - 34 * s
    L.bx1 = L.shipX - L.half - 38 * s
    L.moonX = w * 0.40
    L.moonY = h * 0.155
    L.moonR = 34 * s
    L.gaugeX = w / 2
    L.gaugeY = 74 * s
    L.gaugeR = 44 * s
    buildSky(w, h)
    buildMoon(s)
    buildHull(s, L.half)
    buildDock(w, h, s)
    buildShip(w, h, s)
    for (const k of ['pescador', 'viuda', 'nino', 'inquieta']) makeSoul(k, s)
    buildFerry(s)
    if (!glowG) {
      glowG = makeGlow('rgba(159,255,208,1)')
      glowW = makeGlow('rgba(255,217,160,1)')
      glowF = makeGlow('rgba(225,240,245,1)')
      noisePat = makeNoise()
    }
    waterGrad = ctx.createLinearGradient(0, L.horizon, 0, h)
    waterGrad.addColorStop(0, '#101e28')
    waterGrad.addColorStop(0.18, '#081019')
    waterGrad.addColorStop(0.6, '#04070d')
    waterGrad.addColorStop(1, '#020409')
    stripGrad = ctx.createLinearGradient(0, 0, 0, h * 0.12)
    stripGrad.addColorStop(0, 'rgba(6,12,18,0.0)')
    stripGrad.addColorStop(0.25, 'rgba(4,8,13,0.72)')
    stripGrad.addColorStop(1, 'rgba(2,4,9,0.9)')
  }

  // --- fx api ----------------------------------------------------------------
  function splash(x, y, n, big) {
    const s = L.s
    for (let i = 0; i < n; i++) {
      const d = spawn(drops)
      if (!d) return
      d.x = x + (Math.random() - 0.5) * 10 * s
      d.y = y
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const sp = (big ? 90 : 50) * s * (0.4 + Math.random())
      d.vx = Math.cos(a) * sp
      d.vy = Math.sin(a) * sp
      d.t = 0
      d.life = 0.45 + Math.random() * 0.35
    }
  }
  function sinkLight(x, y) {
    const k = spawn(sinks)
    if (!k) return
    k.x = x
    k.y = y
    k.t = 0
    k.life = 3.8
  }
  function mote(x, y, warm) {
    const m = spawn(motes)
    if (!m) return
    m.x = x
    m.y = y
    m.vx = (Math.random() - 0.5) * 14 * L.s
    m.vy = (-16 - Math.random() * 20) * L.s
    m.t = 0
    m.life = 1.1 + Math.random() * 0.9
    m.warm = !!warm
  }
  function popup(x, y, text, color) {
    const p = spawn(pops)
    if (!p) return
    p.x = x
    p.y = y
    p.text = text
    p.color = color || '#e8dcc0'
    p.t = 0
  }
  function shake(p) { shakeP = Math.max(shakeP, p) }
  function flash(color, a) {
    flashCol = color
    flashA = Math.max(flashA, a)
  }
  function clearFx() {
    for (const a of [drops, sinks, motes, wakes, pops, gustStreaks]) {
      for (let i = 0; i < a.length; i++) a[i].on = false
    }
    shakeP = 0
    flashA = 0
  }

  // --- per-frame drawing pieces ------------------------------------------------
  function drawWater(g) {
    ctx.fillStyle = waterGrad
    ctx.fillRect(0, L.horizon, L.w, L.h - L.horizon)
    // the moon path — slivers swaying like a ladder of cold light
    const mx = L.moonX
    ctx.fillStyle = 'rgba(190,215,205,1)'
    for (let i = 0; i < 16; i++) {
      const k = i / 16
      const y = L.horizon + 6 * L.s + k * (L.h - L.horizon) * 0.72
      const wdt = (10 + k * 60) * L.s
      const off = Math.sin(visT * (0.7 + k * 0.6) + i * 2.1) * (6 + k * 26) * L.s
      ctx.globalAlpha = 0.085 * (1 - k * 0.55) * (0.7 + 0.3 * Math.sin(visT * 1.3 + i))
      ctx.fillRect(mx + off - wdt / 2, y, wdt, (1.1 + k * 1.6) * L.s)
    }
    ctx.globalAlpha = 1
  }

  function drawStreaks(g) {
    // ambient current, always sliding through the strait
    ctx.strokeStyle = 'rgba(140,180,175,1)'
    ctx.lineWidth = 1 * L.s
    for (let i = 0; i < streaks.length; i++) {
      const st = streaks[i]
      st.u -= st.spd * 0.014 * lastDt
      if (st.u < -0.1) {
        st.u = 1.1
        st.v = Math.random()
      }
      const y = L.horizon + 14 * L.s + st.v * (L.h - L.horizon - 40 * L.s)
      const depth = st.v
      const x = st.u * L.w
      const len = st.len * (18 + depth * 70) * L.s
      ctx.globalAlpha = (0.05 + depth * 0.09) * (0.6 + 0.4 * Math.sin(visT + st.ph))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y + Math.sin(st.ph) * 1.5 * L.s)
      ctx.stroke()
    }
    // gust streaks — the warning written on the water
    ctx.strokeStyle = 'rgba(175,225,210,1)'
    ctx.lineWidth = 1.5 * L.s
    for (let i = 0; i < gustStreaks.length; i++) {
      const st = gustStreaks[i]
      if (!st.on) continue
      st.t += lastDt
      if (st.t >= st.life) {
        st.on = false
        continue
      }
      st.x += st.spd * lastDt
      const k = st.t / st.life
      ctx.globalAlpha = 0.30 * Math.sin(k * Math.PI)
      ctx.beginPath()
      ctx.moveTo(st.x, st.y)
      ctx.lineTo(st.x + st.len, st.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // drifting wisps over the water
    for (let i = 0; i < wisps.length; i++) {
      const wsp = wisps[i]
      wsp.u += wsp.sp * 0.01 * lastDt * (i % 2 ? 1 : -1)
      if (wsp.u > 1.05) wsp.u = -0.05
      if (wsp.u < -0.06) wsp.u = 1.04
      const x = wsp.u * L.w
      const y = L.horizon + 30 * L.s + wsp.v * (L.h - L.horizon) * 0.5 + Math.sin(visT * 0.6 + wsp.ph) * 8 * L.s
      const a = 0.05 + 0.04 * Math.sin(visT * 0.8 + wsp.ph * 3)
      ctx.globalAlpha = a
      ctx.drawImage(glowG, x - 14 * L.s, y - 14 * L.s, 28 * L.s, 28 * L.s)
    }
    ctx.globalAlpha = 1
  }

  function shipAlphaOf(game) {
    const base = [0.34, 0.55, 0.8][clamp(game.trip - 1, 0, 2)]
    const near = game.sub === 'arriving' ? 0.22 : game.sub === 'rowing' ? game.prog * 0.14 : 0
    return clamp(base + near, 0, 0.97)
  }

  function drawShip(game) {
    const a = shipAlphaOf(game)
    const sc = (L.shipScale = 0.82 + 0.09 * clamp(game.trip - 1, 0, 2) + (game.sub === 'arriving' ? 0.04 : 0))
    const bobb = Math.sin(visT * 0.45) * 2.4 * L.s
    const x = L.shipX - shipW * 0.10 * sc
    const y = L.shipWY + bobb + 12 * L.s * sc - shipH * sc
    ctx.globalAlpha = a
    ctx.drawImage(shipSpr, x, y, shipW * sc, shipH * sc)
    // her lights — more of them as the souls come home
    const count = clamp(7 + game.trip * 2 + game.delivered * 2, 0, shipLights.length)
    for (let i = 0; i < count; i++) {
      const lt = shipLights[i]
      const lx = x + lt[0] * sc
      const ly = y + lt[1] * sc
      const tw = 0.55 + 0.45 * Math.sin(visT * 2.1 + lt[2])
      const warm = i % 3 === 0
      ctx.globalAlpha = a * (0.5 + 0.5 * tw)
      ctx.drawImage(warm ? glowW : glowG, lx - 7 * L.s, ly - 7 * L.s, 14 * L.s, 14 * L.s)
      ctx.fillStyle = warm ? '#ffe9c4' : '#d9ffe9'
      ctx.beginPath()
      ctx.arc(lx, ly, 1.1 * L.s, 0, TAU)
      ctx.fill()
    }
    // fog bands across her — she is made half of weather
    ctx.globalAlpha = 1
    const fog = 1 - a * 0.55
    ctx.fillStyle = 'rgba(8,14,19,' + (0.28 * fog + 0.08) + ')'
    ctx.fillRect(L.shipX - shipW * 0.16, L.shipWY - shipH * 0.62, shipW * 1.1, shipH * 0.2)
    ctx.fillStyle = 'rgba(8,14,19,' + (0.22 * fog + 0.05) + ')'
    ctx.fillRect(L.shipX - shipW * 0.2, L.shipWY - shipH * 0.3 + Math.sin(visT * 0.3) * 6 * L.s, shipW * 1.2, shipH * 0.13)
    // rail anchor for the gangplank
    L.railX = x + shipW * 0.135 * sc
    L.railY = y + (shipH - 12 * L.s - 46 * L.s) * sc
  }

  function soulAlpha(soul) {
    let a = 0.92
    if (soul.kind === 'inquieta') a *= 0.72 + 0.22 * Math.sin(visT * 11 + soul.ph * 7) + (soul.wailK > 0 ? 0.2 * Math.sin(visT * 30) : 0)
    return a
  }

  function drawSoulAt(soul, x, y, ang, sit, scale) {
    const spr = soulSpr[soul.kind]
    if (!spr) return
    const sc = scale * (soul.size || 1)
    const a = soulAlpha(soul)
    // halo beneath
    const halo = spr.hgt * 1.5 * sc * (1 + (soul.wailK || 0) * 0.5)
    ctx.globalAlpha = a * 0.34 * (1 + (soul.wailK || 0))
    ctx.drawImage(glowG, x - halo / 2, y - spr.hgt * 0.5 * sc - halo / 2, halo, halo)
    ctx.globalAlpha = a
    ctx.save()
    ctx.translate(x, y)
    if (ang) ctx.rotate(ang)
    const fd = soul.face || 1
    ctx.scale(fd * sc, sc * (sit ? 0.84 : 1))
    ctx.drawImage(spr.c, -spr.w / 2, -spr.h + 2)
    ctx.restore()
    // restless hair — kelp in the night wind, drawn live
    if (soul.kind === 'inquieta') {
      ctx.strokeStyle = 'rgba(190,235,210,' + 0.5 * a + ')'
      ctx.lineWidth = 1.1 * L.s
      const hy = y - spr.hgt * (sit ? 0.84 : 1) * sc * 0.95
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(visT * (1.3 + i * 0.4) + soul.ph + i) * 6 * L.s
        ctx.beginPath()
        ctx.moveTo(x + (i - 1) * 2 * L.s, hy + i * 1.5 * L.s)
        ctx.quadraticCurveTo(x - 8 * L.s + sway, hy + 6 * L.s, x - 14 * L.s + sway * 1.6, hy + (12 + i * 3) * L.s)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    soul.sx = x
    soul.sy = y - spr.hgt * 0.5 * sc
    soul.sr = Math.max(spr.hgt * 0.85 * sc, 26 * L.s)
  }

  function drawDock(game) {
    const s = L.s
    ctx.drawImage(dockSpr, 0, L.dockY - 8 * s)
    // dock lantern on its post
    const lx = L.dockEdge - 12 * s
    const ly = L.dockY - 42 * s
    ctx.strokeStyle = '#1d1308'
    ctx.lineWidth = 3.4 * s
    ctx.beginPath()
    ctx.moveTo(lx, L.dockY - 6 * s)
    ctx.lineTo(lx, ly)
    ctx.stroke()
    const lf = 0.8 + 0.2 * Math.sin(visT * 7.3) * Math.sin(visT * 3.1)
    ctx.globalAlpha = 0.5 * lf
    ctx.drawImage(glowW, lx - 22 * s, ly - 22 * s, 44 * s, 44 * s)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#1a1208'
    ctx.fillRect(lx - 4 * s, ly - 6 * s, 8 * s, 9 * s)
    ctx.fillStyle = '#ffd9a0'
    ctx.fillRect(lx - 2.4 * s, ly - 4.4 * s, 4.8 * s, 5.6 * s)
    // lantern shimmer on the water
    ctx.globalAlpha = 0.07 * lf
    ctx.fillStyle = '#ffd9a0'
    for (let i = 0; i < 5; i++) {
      const yy = L.waterY + (6 + i * 9) * s
      const off = Math.sin(visT * 1.1 + i * 1.7) * 4 * s
      ctx.fillRect(lx + off - (8 - i) * s, yy, (16 - i * 2) * s, 1.4 * s)
    }
    ctx.globalAlpha = 1
    // queued souls standing on the planks
    const step = Math.min(34 * s, (L.dockEdge - 52 * s) / 6)
    for (let i = 0; i < game.souls.length; i++) {
      const so = game.souls[i]
      if (so.state !== 'queue') continue
      const qx = 20 * s + so.qi * step
      const bob = Math.sin(visT * 1.4 + so.ph) * 1.6 * s
      so.face = 1
      drawSoulAt(so, qx, L.dockY - 6 * s + bob, 0, false, 1)
    }
  }

  function drawBoat(game, dt) {
    const s = L.s
    const bob = Math.sin(visT * 0.9) * 3.0 * s + Math.sin(visT * 1.7 + 1) * 1.3 * s
    const prog = game.prog
    L.bx = lerp(L.bx0, L.bx1, prog)
    L.by = L.waterY + bob
    const ang = (L.ang = game.tilt + (game.rollVis || 0) - clamp(game.vel, 0, 0.12) * 0.5)
    const cs = Math.cos(ang)
    const sn = Math.sin(ang)
    const lx2sx = (lx, ly) => L.bx + lx * cs - ly * sn
    const ly2sy = (lx, ly) => L.by + lx * sn + ly * cs
    // wake while gliding
    if (game.vel > 0.015 && Math.random() < dt * 30) {
      const wk = spawn(wakes)
      if (wk) {
        wk.x = lx2sx(-L.half * 0.95, 6 * s)
        wk.y = L.waterY + 4 * s
        wk.t = 0
        wk.life = 0.9 + Math.random() * 0.5
        wk.r = (1.5 + Math.random() * 2.5) * s
      }
    }
    ctx.save()
    ctx.translate(L.bx, L.by)
    ctx.rotate(ang)
    ctx.drawImage(hullSpr, -hullW / 2, -hullAnchorY)
    const deck = -13 * s
    // the ferryman at the stern, leaning to counterbalance
    ctx.save()
    ctx.translate(-L.half * 0.66, deck + 1 * s)
    ctx.rotate((game.lean || 0) * 0.3)
    // the oar — pulls with each stroke
    const stK = game.strokeT || 0
    const oarA = 0.92 - stK * 0.65
    ctx.strokeStyle = '#241a0e'
    ctx.lineWidth = 2.6 * s
    ctx.beginPath()
    ctx.moveTo(6 * s, -22 * s)
    ctx.lineTo(6 * s + Math.cos(oarA) * 52 * s, -22 * s + Math.sin(oarA) * 52 * s)
    ctx.stroke()
    ctx.lineWidth = 5 * s
    ctx.beginPath()
    const obx = 6 * s + Math.cos(oarA) * 52 * s
    const oby = -22 * s + Math.sin(oarA) * 52 * s
    ctx.moveTo(obx, oby)
    ctx.lineTo(obx + Math.cos(oarA) * 10 * s, oby + Math.sin(oarA) * 10 * s)
    ctx.stroke()
    ctx.drawImage(ferrySpr, -ferrySpr.width / 2, -ferrySpr.height + 2 * s)
    ctx.restore()
    ctx.restore()
    // souls aboard (board / slide / ceremony walk) — drawn unrotated-from-screen
    for (let i = 0; i < game.souls.length; i++) {
      const so = game.souls[i]
      if (so.state !== 'board' && so.state !== 'slide' && so.state !== 'walk') continue
      const lx = so.x * L.half * 0.9
      const bobi = Math.sin(visT * 1.6 + so.ph) * 1.2 * s
      const sx = lx2sx(lx, deck + bobi)
      const sy = ly2sy(lx, deck + bobi)
      const tum = so.state === 'slide' ? so.slideT * 2.2 * Math.sign(so.x || 1) : 0
      const standK = so.standK || 0
      so.face = so.state === 'walk' ? 1 : so.face || 1
      drawSoulAt(so, sx, sy, ang + tum, so.state === 'board' && standK < 0.5, 1)
    }
    // bow lantern — the metronome of the crossing
    const lxp = L.half * 0.985
    const lyp = -62 * s
    const gx = lx2sx(lxp, lyp)
    const gy = ly2sy(lxp, lyp)
    const beatK = game.beatK || 0
    const halo = (26 + beatK * 30) * s
    ctx.globalAlpha = 0.55 + beatK * 0.45
    ctx.drawImage(glowW, gx - halo, gy - halo, halo * 2, halo * 2)
    ctx.globalAlpha = 1
    // waterline foam at the dipped end
    const dipL = ly2sy(-L.half, 0) - L.waterY
    const dipR = ly2sy(L.half, 0) - L.waterY
    ctx.fillStyle = 'rgba(200,225,225,0.2)'
    if (dipL > 0) {
      ctx.beginPath()
      ctx.ellipse(lx2sx(-L.half, 0), L.waterY + 3 * s, (14 + dipL * 0.7) * s, 2.6 * s, 0, 0, TAU)
      ctx.fill()
    }
    if (dipR > 0) {
      ctx.beginPath()
      ctx.ellipse(lx2sx(L.half, 0), L.waterY + 3 * s, (14 + dipR * 0.7) * s, 2.6 * s, 0, 0, TAU)
      ctx.fill()
    }
  }

  function drawFrontWater() {
    const y = L.waterY + 7 * L.s + Math.sin(visT * 0.9 + 0.6) * 2 * L.s
    ctx.save()
    ctx.translate(0, y)
    ctx.fillStyle = stripGrad
    ctx.fillRect(0, 0, L.w, L.h * 0.12)
    ctx.restore()
    ctx.fillStyle = 'rgba(2,4,9,0.92)'
    ctx.fillRect(0, y + L.h * 0.115, L.w, L.h - y)
  }

  function drawPlank(game) {
    if (game.sub !== 'arriving') return
    const s = L.s
    const x0 = L.bx + Math.cos(L.ang) * L.half * 0.95
    const y0 = L.by + Math.sin(L.ang) * L.half * 0.95 - 18 * s
    const x1 = L.railX
    const y1 = L.railY
    // pale beam of light
    const grad = ctx.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, 'rgba(159,255,208,0.04)')
    grad.addColorStop(0.5, 'rgba(190,255,225,0.16)')
    grad.addColorStop(1, 'rgba(225,255,240,0.26)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x0, y0 + 7 * s)
    ctx.lineTo(x1, y1 + 4 * s)
    ctx.lineTo(x1, y1 - 4 * s)
    ctx.lineTo(x0, y0 - 7 * s)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(210,255,230,0.30)'
    ctx.lineWidth = 1.1 * s
    ctx.beginPath()
    ctx.moveTo(x0, y0 + 7 * s)
    ctx.lineTo(x1, y1 + 4 * s)
    ctx.stroke()
    // step glints
    for (let i = 1; i < 7; i++) {
      const k = i / 7
      const gx = lerp(x0, x1, k)
      const gy = lerp(y0, y1, k) + 4 * s
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(visT * 2 + i * 1.3)
      ctx.fillStyle = '#d9ffe9'
      ctx.fillRect(gx - 4 * s, gy, 8 * s, 1.2 * s)
    }
    ctx.globalAlpha = 1
    if (Math.random() < lastDt * 6) mote(lerp(x0, x1, Math.random()), lerp(y0, y1, Math.random()), false)
    // ceremony souls on the plank
    for (let i = 0; i < game.souls.length; i++) {
      const so = game.souls[i]
      if (so.state === 'plank' || so.state === 'turn' || so.state === 'bow' || so.state === 'fade') {
        const k = so.cereK
        const px = lerp(x0, x1, k)
        const py = lerp(y0, y1, k) + Math.sin(k * 22) * 1.2 * s
        let angB = 0
        let alpha = 1
        if (so.state === 'bow') angB = Math.sin(so.cereT * Math.PI) * 0.55 * so.face
        if (so.state === 'fade') alpha = 1 - so.cereT
        ctx.globalAlpha = alpha
        drawSoulAt(so, px, py - so.cereT * (so.state === 'fade' ? 14 * s : 0), angB, false, 1 - k * 0.22)
        ctx.globalAlpha = 1
        if (so.state === 'fade' && Math.random() < lastDt * 18) mote(px, py - 16 * s, i % 3 === 0)
      }
    }
  }

  function drawDrag(game) {
    const d = game.drag
    if (!d.soul) {
      return
    }
    // ghost marker on the nearest free slot
    if (d.slotX > -1.5) {
      const lx = d.slotX * L.half * 0.9
      const sx = L.bx + Math.cos(L.ang) * lx + Math.sin(L.ang) * 13 * L.s
      const sy = L.by + Math.sin(L.ang) * lx - Math.cos(L.ang) * 13 * L.s
      const pu = 0.5 + 0.5 * Math.sin(visT * 6)
      ctx.strokeStyle = 'rgba(159,255,208,' + (0.3 + pu * 0.4) + ')'
      ctx.lineWidth = 1.4 * L.s
      ctx.beginPath()
      ctx.ellipse(sx, sy + 4 * L.s, 13 * L.s, 4 * L.s, L.ang, 0, TAU)
      ctx.stroke()
    }
    drawSoulAt(d.soul, d.px, d.py - 8 * L.s, 0, false, 1.06)
  }

  function drawParticles(dt) {
    const s = L.s
    // wake foam
    ctx.fillStyle = 'rgba(195,220,220,1)'
    for (let i = 0; i < wakes.length; i++) {
      const wk = wakes[i]
      if (!wk.on) continue
      wk.t += dt
      if (wk.t >= wk.life) {
        wk.on = false
        continue
      }
      const k = wk.t / wk.life
      wk.x -= 26 * s * dt
      ctx.globalAlpha = 0.22 * (1 - k)
      ctx.beginPath()
      ctx.arc(wk.x, wk.y, wk.r * (1 + k * 1.6), 0, TAU)
      ctx.fill()
    }
    // spray
    ctx.fillStyle = 'rgba(210,235,235,1)'
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]
      if (!d.on) continue
      d.t += dt
      if (d.t >= d.life) {
        d.on = false
        continue
      }
      d.vy += 620 * s * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      ctx.globalAlpha = 0.7 * (1 - d.t / d.life)
      ctx.fillRect(d.x, d.y, 2 * s, 2 * s)
    }
    // souls lost — lights sinking into the black
    for (let i = 0; i < sinks.length; i++) {
      const k = sinks[i]
      if (!k.on) continue
      k.t += dt
      if (k.t >= k.life) {
        k.on = false
        continue
      }
      const f = k.t / k.life
      const y = k.y + f * 64 * s
      const x = k.x + Math.sin(k.t * 2.2) * 5 * s * f
      const halo = (22 - f * 12) * s
      ctx.globalAlpha = 0.75 * (1 - f) * (1 - f)
      ctx.drawImage(glowG, x - halo, y - halo, halo * 2, halo * 2)
      ctx.fillStyle = '#d9ffe9'
      ctx.globalAlpha = (1 - f) * 0.9
      ctx.beginPath()
      ctx.arc(x, y, 1.6 * s * (1 - f * 0.5), 0, TAU)
      ctx.fill()
    }
    // motes
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i]
      if (!m.on) continue
      m.t += dt
      if (m.t >= m.life) {
        m.on = false
        continue
      }
      m.x += m.vx * dt
      m.y += m.vy * dt
      const f = 1 - m.t / m.life
      ctx.globalAlpha = 0.6 * f
      ctx.drawImage(m.warm ? glowW : glowG, m.x - 5 * s, m.y - 5 * s, 10 * s, 10 * s)
    }
    ctx.globalAlpha = 1
  }

  function drawPopups(dt) {
    ctx.textAlign = 'center'
    ctx.font = 'italic ' + Math.round(13 * L.s) + 'px Georgia, serif'
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i]
      if (!p.on) continue
      p.t += dt
      if (p.t >= 2.2) {
        p.on = false
        continue
      }
      const k = p.t / 2.2
      ctx.globalAlpha = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y - k * 30 * L.s)
    }
    ctx.globalAlpha = 1
  }

  function drawGauge(game) {
    if (game.phase !== 'playing' || (game.sub !== 'loading' && game.sub !== 'rowing')) return
    const s = L.s
    const cx = L.gaugeX
    const cy = L.gaugeY
    const R = L.gaugeR
    const MAXA = 0.62 // rad of tilt at gauge edge
    const SPILL = game.tiltMax
    const map = (t) => -Math.PI / 2 + (clamp(t, -MAXA, MAXA) / MAXA) * 0.96
    const danger = clamp((Math.abs(game.tilt) - SPILL * 0.72) / (SPILL * 0.28), 0, 1)
    // back plate
    ctx.globalAlpha = 0.8
    ctx.fillStyle = 'rgba(6,9,12,0.55)'
    ctx.beginPath()
    ctx.arc(cx, cy, R + 10 * s, -Math.PI / 2 - 1.12, -Math.PI / 2 + 1.12)
    ctx.arc(cx, cy, R * 0.28, -Math.PI / 2 + 1.12, -Math.PI / 2 - 1.12, true)
    ctx.fill()
    // safe arc
    ctx.strokeStyle = 'rgba(232,220,192,0.4)'
    ctx.lineWidth = 2 * s
    ctx.beginPath()
    ctx.arc(cx, cy, R, map(-SPILL), map(SPILL))
    ctx.stroke()
    // red arcs — the part of the circle that drinks
    ctx.strokeStyle = 'rgba(255,110,80,' + (0.65 + danger * 0.35 * Math.sin(visT * 9)) + ')'
    ctx.lineWidth = 3 * s
    ctx.beginPath()
    ctx.arc(cx, cy, R, map(-MAXA), map(-SPILL))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, R, map(SPILL), map(MAXA))
    ctx.stroke()
    // ticks
    ctx.strokeStyle = 'rgba(232,220,192,0.7)'
    ctx.lineWidth = 1.4 * s
    for (const t of [0, -SPILL, SPILL]) {
      const a = map(t)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (R - 5 * s), cy + Math.sin(a) * (R - 5 * s))
      ctx.lineTo(cx + Math.cos(a) * (R + 5 * s), cy + Math.sin(a) * (R + 5 * s))
      ctx.stroke()
    }
    // needle
    const na = map(game.tilt)
    ctx.strokeStyle = danger > 0.4 ? '#ff8a64' : '#e8dcc0'
    ctx.lineWidth = 2.2 * s
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(na) * (R - 9 * s), cy + Math.sin(na) * (R - 9 * s))
    ctx.stroke()
    // little hull glyph at the pivot, heeling with the needle
    ctx.save()
    ctx.translate(cx, cy + 6 * s)
    ctx.rotate(game.tilt)
    ctx.strokeStyle = 'rgba(232,220,192,0.85)'
    ctx.lineWidth = 1.6 * s
    ctx.beginPath()
    ctx.moveTo(-9 * s, 0)
    ctx.quadraticCurveTo(0, 5 * s, 9 * s, 0)
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 1
  }

  // --- main draw ------------------------------------------------------------------
  let lastDt = 1 / 60
  function draw(game, dt) {
    const w = canvas.width
    const h = canvas.height
    if (w < 2 || h < 2) return // minimized/zero-size canvas: skip painting
    if (w !== lastW || h !== lastH) buildAssets(w, h)
    lastDt = dt = clamp(dt, 0.0001, 0.05)
    visT += dt
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (shakeP > 0.1) {
      ctx.translate((Math.random() - 0.5) * shakeP * 2 * L.s, (Math.random() - 0.5) * shakeP * 1.4 * L.s)
      shakeP *= Math.pow(0.004, dt)
    } else shakeP = 0
    ctx.drawImage(sky, 0, 0)
    // moon
    ctx.drawImage(moonSpr, L.moonX - L.moonR * 3.5, L.moonY - L.moonR * 3.5)
    drawShip(game)
    drawWater()
    // dither everything so the gradients never band
    ctx.globalAlpha = 0.05
    ctx.fillStyle = noisePat
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    drawStreaks()
    drawDock(game)
    drawBoat(game, dt)
    drawFrontWater()
    drawPlank(game)
    drawDrag(game)
    drawParticles(dt)
    drawPopups(dt)
    drawGauge(game)
    if (flashA > 0.004) {
      ctx.globalAlpha = flashA
      ctx.fillStyle = flashCol
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      flashA *= Math.pow(0.01, dt)
    } else flashA = 0
  }

  function spawnGustStreak(dir, power) {
    const st = spawn(gustStreaks)
    if (!st) return
    const s = L.s
    st.y = L.horizon + 20 * s + Math.random() * (L.h - L.horizon - 60 * s)
    st.len = (40 + Math.random() * 70) * s * (dir > 0 ? 1 : -1)
    st.spd = dir * (160 + power * 120) * s
    st.x = dir > 0 ? -80 * s : L.w + 80 * s
    st.t = 0
    st.life = 1.4 + Math.random() * 0.8
  }

  return {
    draw,
    getLayout: () => L,
    splash,
    sinkLight,
    mote,
    popup,
    shake,
    flash,
    clearFx,
    spawnGustStreak,
  }
}
