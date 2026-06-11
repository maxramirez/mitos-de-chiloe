// render.js — EL PIUCHÉN · all 2D canvas drawing + visual fx pools.
// Static scenery (sky, stars, moon, hills, meadow, fold fence, hut) is
// pre-rendered once to an offscreen canvas; the dawn warmth is a second
// pre-built layer faded in by the dawn meter. Particle and score-popup pools
// are fixed-size and recycled so the frame loop allocates nothing.

export const W = 960
export const H = 600
export const GROUND = 556

const TAU = Math.PI * 2
const INK = '#e8dcc0'
const GLOW = '#9fffd0'

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

  // --- offscreen layers -----------------------------------------------------
  const base = document.createElement('canvas')
  base.width = W
  base.height = H
  paintBase(base.getContext('2d'))

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
  function paintBase(c) {
    // night sky into moonlit meadow
    const sky = c.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#04060a')
    sky.addColorStop(0.55, '#091018')
    sky.addColorStop(0.7, '#0c161c')
    sky.addColorStop(0.78, '#0b1410')
    sky.addColorStop(1, '#06090c')
    c.fillStyle = sky
    c.fillRect(0, 0, W, H)

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

    // far hills across the canal
    c.fillStyle = '#081009'
    c.beginPath()
    c.moveTo(0, 446)
    c.quadraticCurveTo(150, 412, 320, 438)
    c.quadraticCurveTo(470, 458, 640, 428)
    c.quadraticCurveTo(820, 402, W, 440)
    c.lineTo(W, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()

    // near meadow
    const mdw = c.createLinearGradient(0, 430, 0, H)
    mdw.addColorStop(0, 'rgba(13,24,16,0)')
    mdw.addColorStop(0.35, '#0d1811')
    mdw.addColorStop(1, '#070b08')
    c.fillStyle = mdw
    c.beginPath()
    c.moveTo(0, 470)
    c.quadraticCurveTo(240, 444, 480, 452)
    c.quadraticCurveTo(720, 460, W, 446)
    c.lineTo(W, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()

    // moonlit patch around the fold
    const patch = c.createRadialGradient(480, 522, 20, 480, 522, 210)
    patch.addColorStop(0, 'rgba(40,56,40,0.5)')
    patch.addColorStop(1, 'rgba(40,56,40,0)')
    c.fillStyle = patch
    c.fillRect(250, 430, 460, 170)

    // shepherd's hut, one warm window
    c.fillStyle = '#0a0f0c'
    c.fillRect(96, 470, 56, 36)
    c.beginPath()
    c.moveTo(88, 472)
    c.lineTo(124, 450)
    c.lineTo(160, 472)
    c.closePath()
    c.fill()
    c.fillStyle = 'rgba(202,160,90,0.8)'
    c.fillRect(116, 482, 5, 7)

    // grass strokes
    c.strokeStyle = 'rgba(26,44,22,0.6)'
    c.lineWidth = 1
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W
      const y = 472 + Math.random() * 118
      const h2 = 3 + Math.random() * 5
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + (Math.random() * 4 - 2), y - h2)
      c.stroke()
    }

    // stone fence arcing around the fold (open toward the sky)
    for (let a = 0.16, i = 0; a <= 2.99; a += 0.15, i++) {
      const sx = 480 + Math.cos(a) * 158
      const sy = 521 + Math.sin(a) * 46
      const r = 5 + ((i * 7) % 4)
      c.fillStyle = '#2c322c'
      c.beginPath()
      c.arc(sx, sy, r, 0, TAU)
      c.fill()
      c.fillStyle = 'rgba(232,220,192,0.10)'
      c.beginPath()
      c.arc(sx - 1, sy - r * 0.45, r * 0.55, 0, TAU)
      c.fill()
    }
    // short fence wings
    for (let k = 0; k < 5; k++) {
      c.fillStyle = '#283028'
      c.beginPath(); c.arc(310 - k * 14, 528 + k * 2, 4.5, 0, TAU); c.fill()
      c.beginPath(); c.arc(650 + k * 14, 528 + k * 2, 4.5, 0, TAU); c.fill()
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
    c.fillRect(0, 240, 480, 230)
  }

  // --- creatures --------------------------------------------------------------------
  function drawWings(x, y, heading, f, size, color) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(heading)
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(159,255,208,0.07)'
    ctx.lineWidth = 1
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      ctx.save()
      ctx.scale(1, s2)
      ctx.beginPath()
      ctx.moveTo(3, 2)
      ctx.quadraticCurveTo(-size * 0.3, -size * 0.95 * f, -size * 0.95, -size * 1.12 * f)
      ctx.quadraticCurveTo(-size * 0.92, -size * 0.42 * f, -size * 0.4, -size * 0.14 * f - 2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }

  function drawPiuchen(g) {
    const pu = g.pu
    const st = pu.state
    let body, flapSpd, flapAmp, eye
    if (st === 'circling') {
      body = '#0a0f13'; flapSpd = 4.2; flapAmp = 0.8
      eye = 0.1 + 0.07 * Math.sin(time * 2.1)
    } else if (st === 'telegraph') {
      body = '#0d141a'; flapSpd = 7; flapAmp = 0.9
      eye = 0.55 + 0.45 * Math.sin(time * 22) // the green flash
    } else if (st === 'diving' || st === 'pullup') {
      body = '#121c24'; flapSpd = 2.2; flapAmp = 0.3; eye = 0.9
    } else if (st === 'latched') {
      body = '#121c24'; flapSpd = 2.6; flapAmp = 1.05
      eye = 0.7 + 0.3 * Math.sin(time * 10)
    } else { // retreat
      body = '#0e161c'; flapSpd = 12; flapAmp = 0.8; eye = 0.2
    }

    const tr = pu.trail
    // tapering serpent body, tail to head
    ctx.fillStyle = body
    for (let i = pu.trailN - 1; i >= 1; i--) {
      const r = 2 + 7.5 * (1 - i / pu.trailN)
      ctx.beginPath()
      ctx.arc(tr[i * 2], tr[i * 2 + 1], r, 0, TAU)
      ctx.fill()
    }
    // bat wings near the shoulders
    const f = flapAmp * (0.5 + 0.5 * Math.sin(time * flapSpd))
    drawWings(tr[4], tr[5], pu.heading, Math.max(0.12, f), 34, body)
    // head
    ctx.save()
    ctx.translate(tr[0], tr[1])
    ctx.rotate(pu.heading)
    ctx.fillStyle = '#18222a'
    ctx.beginPath()
    ctx.moveTo(13, 0)
    ctx.lineTo(-2, -5.5)
    ctx.lineTo(-6, 0)
    ctx.lineTo(-2, 5.5)
    ctx.closePath()
    ctx.fill()
    const e = Math.min(1, Math.max(0, eye))
    ctx.fillStyle = GLOW
    ctx.globalAlpha = e
    ctx.beginPath(); ctx.arc(5, -2.8, 1.5, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(5, 2.8, 1.5, 0, TAU); ctx.fill()
    ctx.globalAlpha = e * 0.3
    ctx.beginPath(); ctx.arc(5, -2.8, 5, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(5, 2.8, 5, 0, TAU); ctx.fill()
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
        ctx.globalAlpha = 0.16
        ctx.fillStyle = '#857d66'
        ctx.beginPath()
        ctx.ellipse(s.baseX, s.baseY + 5, 9, 3.5, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
        continue
      }
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
      // wool
      ctx.fillStyle = s.state === 'mareada' ? '#6f6a58' : '#857d66'
      ctx.beginPath()
      ctx.ellipse(0, 0, 15, 10 * breathe, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(217,208,180,0.28)'
      ctx.beginPath()
      ctx.ellipse(-2, -4, 11, 5 * breathe, 0, 0, TAU)
      ctx.fill()
      // head + ear
      ctx.fillStyle = '#241f17'
      ctx.beginPath()
      ctx.arc(13 * dir, -4, 4.8, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(13 * dir - 3 * dir, -8, 3, 1.4, dir * 0.5, 0, TAU)
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
    // cloak
    ctx.fillStyle = '#15130d'
    ctx.strokeStyle = 'rgba(232,220,192,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - 10, y)
    ctx.quadraticCurveTo(x - 8, y - 20, x, y - 27)
    ctx.quadraticCurveTo(x + 8, y - 20, x + 10, y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // head + chupalla
    ctx.fillStyle = '#1c150e'
    ctx.beginPath()
    ctx.arc(x, y - 31, 4.5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#0f0d08'
    ctx.beginPath()
    ctx.ellipse(x, y - 34, 9, 2.2, 0, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y - 35, 4, Math.PI, 0)
    ctx.fill()
    // staff
    ctx.strokeStyle = '#2c2418'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 12, y)
    ctx.lineTo(x - 15, y - 34)
    ctx.stroke()
    // sling arm toward the aim
    const hx = x + 3 + Math.cos(aimA) * 13
    const hy = y - 22 + Math.sin(aimA) * 13
    ctx.strokeStyle = '#15130d'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x + 3, y - 22)
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

    // dawn creeping in (warms late in the night)
    const dawnA = g.dawn * g.dawn * 0.85
    if (dawnA > 0.01) {
      ctx.globalAlpha = dawnA
      ctx.drawImage(dawnL, 0, 0)
      ctx.globalAlpha = 1
    }

    drawSheep(g)
    drawShepherd(g)
    drawPiuchen(g)

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
      ctx.globalAlpha = ready ? 0.9 : 0.45
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
