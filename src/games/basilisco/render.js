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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

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

  // --- pools ---------------------------------------------------------------
  const RAIN_N = 90
  const rain = new Float32Array(RAIN_N * 3) // x, y, speed
  for (let i = 0; i < RAIN_N; i++) {
    rain[i * 3] = Math.random() * W
    rain[i * 3 + 1] = Math.random() * H
    rain[i * 3 + 2] = 420 + Math.random() * 320
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
  function paintBase(b) {
    b.fillStyle = '#06090c'
    b.fillRect(0, 0, W, H)
    // the sea under the stilts
    b.fillStyle = '#07181d'
    b.fillRect(0, 0, W, H)
    // stilts (pilotis) around the house
    b.fillStyle = '#0b0a08'
    b.strokeStyle = 'rgba(232,220,192,0.16)'
    b.lineWidth = 1
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      const xs = HOUSE.x0 - 22 + t * (HOUSE.x1 - HOUSE.x0 + 44)
      circle(b, xs, HOUSE.y0 - 26, 7, true)
      circle(b, xs, HOUSE.y1 + 26, 7, true)
    }
    for (let i = 1; i < 6; i++) {
      const ys = HOUSE.y0 + (i / 6) * (HOUSE.y1 - HOUSE.y0)
      circle(b, HOUSE.x0 - 30, ys, 7, true)
      circle(b, HOUSE.x1 + 30, ys, 7, true)
    }
    // floor
    b.fillStyle = '#171008'
    b.fillRect(HOUSE.x0, HOUSE.y0, HOUSE.x1 - HOUSE.x0, HOUSE.y1 - HOUSE.y0)
    // floorboards with grain
    b.strokeStyle = '#0c0805'
    b.lineWidth = 2
    for (let x = HOUSE.x0 + 24; x < HOUSE.x1; x += 24) {
      b.beginPath()
      b.moveTo(x, HOUSE.y0)
      b.lineTo(x, HOUSE.y1)
      b.stroke()
    }
    b.strokeStyle = 'rgba(70,52,30,0.35)'
    b.lineWidth = 1
    for (let x = HOUSE.x0 + 9; x < HOUSE.x1; x += 24) {
      b.beginPath()
      b.moveTo(x, HOUSE.y0 + ((x * 7) % 60))
      b.lineTo(x, HOUSE.y1 - ((x * 11) % 80))
      b.stroke()
    }
    // board joints
    b.strokeStyle = '#0c0805'
    for (let x = HOUSE.x0; x < HOUSE.x1; x += 24) {
      const yj = HOUSE.y0 + 40 + ((x * 13) % 360)
      b.beginPath()
      b.moveTo(x, yj)
      b.lineTo(x + 24, yj)
      b.stroke()
    }
    // outer wall — thin double border
    b.strokeStyle = 'rgba(232,220,192,0.55)'
    b.lineWidth = 2
    b.strokeRect(HOUSE.x0 - 4, HOUSE.y0 - 4, HOUSE.x1 - HOUSE.x0 + 8, HOUSE.y1 - HOUSE.y0 + 8)
    b.lineWidth = 1
    b.strokeStyle = 'rgba(232,220,192,0.3)'
    b.strokeRect(HOUSE.x0 - 9, HOUSE.y0 - 9, HOUSE.x1 - HOUSE.x0 + 18, HOUSE.y1 - HOUSE.y0 + 18)
    // inner walls
    for (const wll of WALLS) {
      b.fillStyle = '#241a10'
      b.fillRect(wll.x, wll.y, wll.w, wll.h)
      b.strokeStyle = 'rgba(232,220,192,0.4)'
      b.strokeRect(wll.x + 0.5, wll.y + 0.5, wll.w - 1, wll.h - 1)
    }
    // beds
    for (const s of SLEEPERS) {
      const bd = s.bed
      b.fillStyle = '#1c1209'
      b.fillRect(bd.x, bd.y, bd.w, bd.h)
      b.strokeStyle = 'rgba(232,220,192,0.35)'
      b.lineWidth = 1
      b.strokeRect(bd.x + 0.5, bd.y + 0.5, bd.w - 1, bd.h - 1)
      b.strokeRect(bd.x + 3.5, bd.y + 3.5, bd.w - 7, bd.h - 7)
      // blanket
      b.fillStyle = '#232b26'
      b.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12)
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
      ctx.fillStyle = st.opened ? '#0a0603' : '#1d1509'
      ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE)
      ctx.strokeStyle = st.opened ? 'rgba(232,220,192,0.18)' : 'rgba(232,220,192,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
      if (!st.opened) {
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

    // braziers
    for (let i = 0; i < BRAZIERS.length; i++) {
      const br = BRAZIERS[i]
      const fuel = g.braziers[i]
      ctx.fillStyle = '#241c12'
      ctx.strokeStyle = 'rgba(232,220,192,0.5)'
      ctx.lineWidth = 1.5
      circle(ctx, br.x, br.y, BRAZIER_RADIUS, true)
      ctx.lineWidth = 1
      circle(ctx, br.x, br.y, BRAZIER_RADIUS - 4, false)
      if (fuel > 0) {
        const f = 0.4 + fuel * 0.6
        const flick = 1 + Math.sin(time * 13 + i * 9) * 0.18
        ctx.fillStyle = 'rgba(255,150,60,' + (0.55 * f).toFixed(2) + ')'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y - 3, 7 * f * flick, 11 * f * flick, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,230,160,' + (0.7 * f).toFixed(2) + ')'
        ctx.beginPath()
        ctx.ellipse(br.x, br.y - 1, 3.4 * f, 5.5 * f * flick, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(120,120,120,0.25)'
        circle(ctx, br.x, br.y - 2, 4, true)
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

    // sleepers
    for (let i = 0; i < SLEEPERS.length; i++) {
      const s = SLEEPERS[i]
      const st = g.sleepers[i]
      const breath = st.lost ? 0 : Math.sin(time * 1.4 + i * 2.1) * 0.5 + 0.5
      ctx.save()
      ctx.translate(s.x, s.y)
      if (st.lost) ctx.globalAlpha = 0.35
      // body under blanket (chest rises with breath)
      ctx.fillStyle = st.lost ? '#2a2f2c' : '#2e3a33'
      ctx.beginPath()
      ctx.ellipse(-26, 8, 34, 15 + breath * 1.8, 0, 0, Math.PI * 2)
      ctx.fill()
      // head
      ctx.fillStyle = st.lost ? '#8a8474' : '#cdbF9d'
      ctx.beginPath()
      ctx.arc(14, 0, 9, 0, Math.PI * 2)
      ctx.fill()
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

    // the basilisco
    if (g.bas.visible) {
      const tr = g.bas.trail
      ctx.lineCap = 'round'
      for (let i = g.bas.trailN - 1; i > 0; i--) {
        const w = 3 + (1 - i / g.bas.trailN) * 7
        ctx.lineWidth = w
        ctx.strokeStyle = i % 2 ? '#cfc8b0' : '#b8b098'
        ctx.beginPath()
        ctx.moveTo(tr[i * 2], tr[i * 2 + 1])
        ctx.lineTo(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1])
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
      const hx = tr[0]
      const hy = tr[1]
      // head
      ctx.fillStyle = '#ded6bc'
      circle2(ctx, hx, hy, 7)
      // comb (cresta de gallo)
      ctx.fillStyle = '#a04438'
      ctx.beginPath()
      ctx.moveTo(hx - 4, hy - 5)
      ctx.lineTo(hx - 1, hy - 11)
      ctx.lineTo(hx + 1, hy - 6)
      ctx.lineTo(hx + 4, hy - 11)
      ctx.lineTo(hx + 5, hy - 5)
      ctx.closePath()
      ctx.fill()
      // beak toward movement
      ctx.fillStyle = '#c8b070'
      ctx.beginPath()
      ctx.moveTo(hx + Math.cos(g.bas.heading) * 7, hy + Math.sin(g.bas.heading) * 7)
      ctx.lineTo(hx + Math.cos(g.bas.heading) * 14, hy + Math.sin(g.bas.heading) * 14)
      ctx.lineTo(hx + Math.cos(g.bas.heading + 0.7) * 7, hy + Math.sin(g.bas.heading + 0.7) * 7)
      ctx.closePath()
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

    // player — the eldest child with a candle
    const pl = g.player
    ctx.save()
    ctx.translate(pl.x, pl.y)
    if (pl.stun > 0) ctx.rotate(Math.sin(time * 30) * 0.08)
    ctx.fillStyle = '#3a4a42'
    ctx.beginPath()
    ctx.ellipse(0, 2, 9, 11, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#cdbf9d'
    circle2(ctx, 0, -8, 6)
    // candle
    ctx.fillStyle = '#e8dcc0'
    ctx.fillRect(8, -4, 3, 7)
    ctx.fillStyle = 'rgba(255,210,120,' + (0.8 + Math.sin(time * 17) * 0.2).toFixed(2) + ')'
    circle2(ctx, 9.5, -7, 2.6)
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

    // eyes glow — drawn over the darkness so they read even with both braziers out
    if (g.bas.visible) {
      const hx = g.bas.trail[0]
      const hy = g.bas.trail[1]
      ctx.fillStyle = GLOW
      circle2(ctx, hx + Math.cos(g.bas.heading - 0.6) * 4.5, hy + Math.sin(g.bas.heading - 0.6) * 4.5, 1.6)
      circle2(ctx, hx + Math.cos(g.bas.heading + 0.6) * 4.5, hy + Math.sin(g.bas.heading + 0.6) * 4.5, 1.6)
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

    // rain over everything
    ctx.strokeStyle = 'rgba(170,200,210,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < RAIN_N; i++) {
      const rx = rain[i * 3]
      const ry = rain[i * 3 + 1]
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx - 3, ry + 13)
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
