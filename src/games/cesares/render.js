// render.js — LA CIUDAD DE LOS CÉSARES · canvas2d isometric renderer.
// Diamond tiles (72×36 world units at scale 1) floating in night fog, painter's
// order by (x+y); ROTOR discs drawn as stone ellipses under their carried
// tiles; the CITY fades in on the horizon with alpha = connected fraction.
// One transform per frame (setTransform with the fit scale), no offscreen
// buffers, no shadowBlur in the per-tile loop; pooled particles / popups /
// ripples (zero allocations per frame in the hot paths).

export const HW = 36 // tile half-width  (world px)
export const HH = 18 // tile half-height (world px)
export const ELEV = 26 // world px per z level
const LIP = 12 // stone thickness under every tile

export const E = 1
export const S = 2
export const W = 4
export const N = 8
const DIRS = [
  [1, 0], [0, 1], [-1, 0], [0, -1], // E S W N (bit order 0..3)
]

export function isoX(gx, gy) { return (gx - gy) * HW }
export function isoY(gx, gy, z) { return (gx + gy) * HH - (z || 0) * ELEV }

// rotate a grid offset by `ang` radians, CW in grid space (y-down)
export function rotOff(dx, dy, ang, out) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  out[0] = dx * c - dy * s
  out[1] = dx * s + dy * c
  return out
}

function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')

  // --- fit (recomputed every frame from canvas + level bounds) -------------
  const fit = { sc: 1, ox: 0, oy: 0, dpr: 1 }
  function computeFit(bounds) {
    const cw = canvas.width
    const ch = canvas.height
    fit.dpr = cw / Math.max(1, window.innerWidth)
    const bw = Math.max(60, bounds.x1 - bounds.x0)
    const bh = Math.max(60, bounds.y1 - bounds.y0)
    const landscape = cw > ch * 1.25
    const availW = cw * 0.94
    const availH = ch * (landscape ? 0.66 : 0.56)
    fit.sc = Math.min(availW / bw, availH / bh, 2.4 * fit.dpr)
    const cx = (bounds.x0 + bounds.x1) / 2
    const cy = (bounds.y0 + bounds.y1) / 2
    fit.ox = cw / 2 - cx * fit.sc
    fit.oy = ch * (landscape ? 0.55 : 0.58) - cy * fit.sc
  }
  const _pj = { x: 0, y: 0 }
  function project(gx, gy, z) {
    _pj.x = (fit.ox + isoX(gx, gy) * fit.sc) / fit.dpr
    _pj.y = (fit.oy + isoY(gx, gy, z) * fit.sc) / fit.dpr
    return _pj
  }

  // --- stars / city / fog (built once, deterministic) ----------------------
  const rng = lcg(20260611)
  const stars = []
  for (let i = 0; i < 130; i++) {
    stars.push({ x: rng(), y: rng() * 0.55, r: 0.6 + rng() * 1.3, ph: rng() * 6.28, sp: 0.4 + rng() * 1.4 })
  }
  // the city: towers, domes, spires — silhouettes that only exist at the
  // right angle. dx in world px around the board's horizontal center.
  const city = []
  for (let i = 0; i < 17; i++) {
    const dx = -300 + i * 37.5 + (rng() - 0.5) * 16
    const type = i % 4 === 1 ? 1 : i % 5 === 3 ? 2 : 0 // tower / dome / spire
    city.push({
      dx, w: 16 + rng() * 22, h: 38 + rng() * 64 + (type === 2 ? 30 : 0),
      type, ph: rng() * 6.28, win: 2 + ((rng() * 3) | 0),
    })
  }
  const fogs = []
  for (let i = 0; i < 5; i++) {
    fogs.push({ x: rng() * 2 - 1, y: (i < 3 ? 0.1 : 0.65) + rng() * 0.25, r: 0.28 + rng() * 0.3, sp: 4 + rng() * 7, ph: rng() * 6.28, a: i < 3 ? 0.10 : 0.16 })
  }

  // --- pools ----------------------------------------------------------------
  const parts = []
  for (let i = 0; i < 140; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, r: 2, c: '#ffd9a0', g: 0 })
  let partN = 0
  function burst(gx, gy, z, color, n, spd, up, life) {
    const x = isoX(gx, gy)
    const y = isoY(gx, gy, z)
    for (let i = 0; i < n; i++) {
      const p = parts[partN]
      partN = (partN + 1) % parts.length
      const a = Math.random() * 6.283
      const v = spd * (0.4 + Math.random() * 0.6)
      p.on = true
      p.x = x + (Math.random() - 0.5) * 18
      p.y = y + (Math.random() - 0.5) * 9
      p.vx = Math.cos(a) * v
      p.vy = Math.sin(a) * v * 0.5 - (up || 0)
      p.t = 0
      p.life = (life || 0.7) * (0.6 + Math.random() * 0.7)
      p.r = 1.4 + Math.random() * 2.2
      p.c = color
      p.g = up ? -14 : 26
    }
  }

  const pops = []
  for (let i = 0; i < 8; i++) pops.push({ on: false, x: 0, y: 0, t: 0, text: '', c: '#ffd9a0' })
  let popN = 0
  function popup(gx, gy, z, text, color) {
    const p = pops[popN]
    popN = (popN + 1) % pops.length
    p.on = true
    p.x = isoX(gx, gy)
    p.y = isoY(gx, gy, z) - HH * 2
    p.t = 0
    p.text = text
    p.c = color || '#ffd9a0'
  }

  const rips = []
  for (let i = 0; i < 5; i++) rips.push({ on: false, x: 0, y: 0, t: 0 })
  let ripN = 0
  function ripple(cssX, cssY) {
    const r = rips[ripN]
    ripN = (ripN + 1) % rips.length
    r.on = true
    r.x = cssX * fit.dpr
    r.y = cssY * fit.dpr
    r.t = 0
  }

  function clearFx() {
    for (let i = 0; i < parts.length; i++) parts[i].on = false
    for (let i = 0; i < pops.length; i++) pops[i].on = false
    for (let i = 0; i < rips.length; i++) rips[i].on = false
  }

  let shakeT = 1
  let shakeMag = 0
  function shake(mag) {
    shakeMag = Math.max(shakeMag, mag)
    shakeT = 0
  }
  let pulseT = 1
  let pulseC = '#ffd9a0'
  function pulse(color) {
    pulseC = color || '#ffd9a0'
    pulseT = 0
  }

  let cityAlpha = 0
  let skyGrad = null
  let skyH = -1

  // --- level reveal: the path assembles out of the fog, stone by stone ------
  // anchored to the sim clock (g.visT) so manual step() drives it like rAF does
  let revAt = -2 // -2 = re-anchor to the sim clock on the next draw
  let revT = 9 // seconds since reveal() — 9 = settled
  function reveal(at) { revAt = at === undefined ? -2 : at }
  function revK(s) {
    const k = (revT - 0.1 - s * 0.09) / 0.45
    return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k)
  }

  // --- tile -----------------------------------------------------------------
  // draws one tile (top + stone pillar + path strips). ang = extra rotation
  // (radians) applied to the path directions while a rotor grinds.
  function tile(gx, gy, z, mask, ang, conn, glowK, shade, t) {
    const cx = isoX(gx, gy)
    const cy = isoY(gx, gy, z)
    const drop = z * ELEV + LIP
    // pillar — left face then right face, fading into the fog below
    let gr = ctx.createLinearGradient(0, cy, 0, cy + HH + drop)
    gr.addColorStop(0, shade > 0.5 ? '#131e2a' : '#111c27')
    gr.addColorStop(1, 'rgba(10,16,20,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.moveTo(cx - HW, cy)
    ctx.lineTo(cx, cy + HH)
    ctx.lineTo(cx, cy + HH + drop)
    ctx.lineTo(cx - HW, cy + drop)
    ctx.closePath()
    ctx.fill()
    gr = ctx.createLinearGradient(0, cy, 0, cy + HH + drop)
    gr.addColorStop(0, shade > 0.5 ? '#1a2837' : '#182532')
    gr.addColorStop(1, 'rgba(10,16,20,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.moveTo(cx + HW, cy)
    ctx.lineTo(cx, cy + HH)
    ctx.lineTo(cx, cy + HH + drop)
    ctx.lineTo(cx + HW, cy + drop)
    ctx.closePath()
    ctx.fill()
    // contact occlusion — a soft dark band just under the top edge seats the
    // slab on its pillar (wide faint pass, then a tight crease)
    ctx.lineCap = 'butt'
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(cx - HW, cy + 3)
    ctx.lineTo(cx, cy + HH + 3)
    ctx.lineTo(cx + HW, cy + 3)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - HW, cy + 1)
    ctx.lineTo(cx, cy + HH + 1)
    ctx.lineTo(cx + HW, cy + 1)
    ctx.stroke()
    // top diamond
    ctx.fillStyle = shade > 0.5 ? '#243446' : '#21303f'
    ctx.beginPath()
    ctx.moveTo(cx, cy - HH)
    ctx.lineTo(cx + HW, cy)
    ctx.lineTo(cx, cy + HH)
    ctx.lineTo(cx - HW, cy)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(232,220,192,0.10)'
    ctx.lineWidth = 1.4
    ctx.stroke()
    // path strips toward each open edge
    ctx.lineCap = 'round'
    for (let d = 0; d < 4; d++) {
      if (!(mask & (1 << d))) continue
      let dx = DIRS[d][0]
      let dy = DIRS[d][1]
      if (ang !== 0) {
        const c = Math.cos(ang)
        const s = Math.sin(ang)
        const rx = dx * c - dy * s
        dy = dx * s + dy * c
        dx = rx
      }
      const ex = cx + (dx - dy) * HW * 0.5
      const ey = cy + (dx + dy) * HH * 0.5
      ctx.strokeStyle = '#33424f'
      ctx.lineWidth = 13
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      if (conn) {
        ctx.strokeStyle = 'rgba(255,217,160,' + (0.22 + glowK * 0.2 + 0.07 * Math.sin(t * 2.6 + gx + gy)).toFixed(3) + ')'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }
    // worn center pad
    ctx.fillStyle = conn ? 'rgba(255,224,176,0.5)' : '#3b4c5a'
    ctx.beginPath()
    ctx.ellipse(cx, cy, 7, 3.5, 0, 0, 6.283)
    ctx.fill()
  }

  function gateArch(gx, gy, z, k, t) {
    const cx = isoX(gx, gy)
    const cy = isoY(gx, gy, z)
    // the puerta breathes while a path to it exists — slow, alive, inviting
    const breath = k < 0.03 ? 1 : 0.74 + 0.26 * Math.sin(t * 2.0)
    const bk = k * breath
    // inner glow on the tile
    const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, HW * (0.82 + 0.12 * bk))
    gr.addColorStop(0, 'rgba(255,224,176,' + (0.16 + 0.46 * bk).toFixed(3) + ')')
    gr.addColorStop(1, 'rgba(255,217,160,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.ellipse(cx, cy, HW * 0.9, HH * 0.9, 0, 0, 6.283)
    ctx.fill()
    // contact shadows seat the pillars on the stone
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.beginPath()
    ctx.ellipse(cx - 14, cy - 3, 5.5, 2.5, 0, 0, 6.283)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + 14, cy - 3, 5.5, 2.5, 0, 0, 6.283)
    ctx.fill()
    // two pillars + lintel arc, the puerta on the back corner
    ctx.strokeStyle = '#2c3d4e'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    const h = 40 + 4 * k
    ctx.beginPath()
    ctx.moveTo(cx - 14, cy - 4)
    ctx.lineTo(cx - 14, cy - h)
    ctx.moveTo(cx + 14, cy - 4)
    ctx.lineTo(cx + 14, cy - h)
    ctx.stroke()
    // warm rim light on the inner pillar edges while the light breathes
    if (k > 0.03) {
      ctx.strokeStyle = 'rgba(255,217,160,' + (0.32 * bk).toFixed(3) + ')'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(cx - 11.5, cy - 5)
      ctx.lineTo(cx - 11.5, cy - h + 2)
      ctx.moveTo(cx + 11.5, cy - 5)
      ctx.lineTo(cx + 11.5, cy - h + 2)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,217,160,' + (0.35 + 0.55 * bk).toFixed(3) + ')'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(cx - 14, cy - h)
    ctx.quadraticCurveTo(cx, cy - h - 18, cx + 14, cy - h)
    ctx.stroke()
    // light inside the arch
    if (k > 0.02) {
      const g2 = ctx.createLinearGradient(0, cy - h, 0, cy)
      g2.addColorStop(0, 'rgba(255,228,180,' + (0.34 * bk).toFixed(3) + ')')
      g2.addColorStop(1, 'rgba(255,228,180,' + (0.07 * bk).toFixed(3) + ')')
      ctx.fillStyle = g2
      ctx.fillRect(cx - 12, cy - h, 24, h - 3)
      // beam to the sky, swelling with the same breath
      const g3 = ctx.createLinearGradient(0, cy - h - 150, 0, cy - h)
      g3.addColorStop(0, 'rgba(255,228,180,0)')
      g3.addColorStop(1, 'rgba(255,228,180,' + (0.20 * bk).toFixed(3) + ')')
      ctx.fillStyle = g3
      ctx.fillRect(cx - 10, cy - h - 150, 20, 150)
    }
  }

  function disc(r, t) {
    const cx = isoX(r.cx, r.cy)
    const cy = isoY(r.cx, r.cy, r.dz) + HH * 0.9
    const R = (r.maxd + 0.95) * HW
    const ry = R * HH / HW
    const busy = r.anim
    // stone disc
    const gr = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
    gr.addColorStop(0, '#15222e')
    gr.addColorStop(1, '#0c141d')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.ellipse(cx, cy, R, ry, 0, 0, 6.283)
    ctx.fill()
    // rim — gold breath while idle, bright while grinding
    const breathe = 0.20 + 0.10 * Math.sin(t * 2.2 + r.cx * 2.1 + r.cy)
    ctx.strokeStyle = 'rgba(255,217,160,' + (busy ? 0.75 : breathe).toFixed(3) + ')'
    ctx.lineWidth = busy ? 3 : 2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(232,220,192,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, cy, R * 0.62, ry * 0.62, 0, 0, 6.283)
    ctx.stroke()
    // engraved quarter grooves + pip glyphs (1..4 pips) telegraphing the four
    // positions — read them against the fixed keystone at the top of the rim
    for (let i = 0; i < 4; i++) {
      const a = r.angVis + i * 1.5708
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      ctx.strokeStyle = 'rgba(4,7,10,0.55)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(cx + ca * R * 0.30, cy + sa * ry * 0.30)
      ctx.lineTo(cx + ca * R * 0.52, cy + sa * ry * 0.52)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(232,220,192,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + ca * R * 0.30, cy + 1.1 + sa * ry * 0.30)
      ctx.lineTo(cx + ca * R * 0.52, cy + 1.1 + sa * ry * 0.52)
      ctx.stroke()
      const px = cx + ca * R * 0.68
      const py = cy + sa * ry * 0.68
      const tx = -sa * 5.4
      const ty = ca * 5.4 * ry / R
      for (let p = 0; p <= i; p++) {
        const o = p - i / 2
        ctx.fillStyle = 'rgba(4,7,10,0.5)'
        ctx.beginPath()
        ctx.ellipse(px + tx * o, py + ty * o + 0.9, 2.2, 1.4, 0, 0, 6.283)
        ctx.fill()
        ctx.fillStyle = busy ? 'rgba(255,217,160,0.6)' : 'rgba(232,220,192,0.26)'
        ctx.beginPath()
        ctx.ellipse(px + tx * o, py + ty * o, 2.0, 1.3, 0, 0, 6.283)
        ctx.fill()
      }
    }
    // fixed keystone — the still point the engravings turn beneath
    ctx.fillStyle = 'rgba(232,220,192,' + (busy ? 0.5 : 0.3).toFixed(2) + ')'
    ctx.beginPath()
    ctx.moveTo(cx - 3.6, cy - ry - 7)
    ctx.lineTo(cx + 3.6, cy - ry - 7)
    ctx.lineTo(cx, cy - ry + 0.5)
    ctx.closePath()
    ctx.fill()
    // notches rotating with the disc
    ctx.strokeStyle = busy ? 'rgba(255,217,160,0.5)' : 'rgba(232,220,192,0.22)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = r.angVis + i * 0.7854
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      ctx.moveTo(cx + ca * R * 0.82, cy + sa * ry * 0.82)
      ctx.lineTo(cx + ca * R * 0.94, cy + sa * ry * 0.94)
    }
    ctx.stroke()
    // CW hint arrow on the rim
    ctx.strokeStyle = 'rgba(255,217,160,' + (busy ? 0.0 : breathe + 0.10).toFixed(3) + ')'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.ellipse(cx, cy, R * 0.74, ry * 0.74, 0, -0.6, 0.5)
    ctx.stroke()
    const ax = cx + Math.cos(0.5) * R * 0.74
    const ay = cy + Math.sin(0.5) * ry * 0.74
    ctx.beginPath()
    ctx.moveTo(ax - 7, ay - 5)
    ctx.lineTo(ax + 2, ay + 1)
    ctx.lineTo(ax - 9, ay + 5)
    ctx.stroke()
  }

  function drawPilgrim(p, t) {
    const cx = isoX(p.gx, p.gy)
    const cy = isoY(p.gx, p.gy, p.gz)
    const bob = p.walking ? Math.sin(p.bobT * 13) * 1.8 : Math.sin(t * 1.7) * 0.8
    const y = cy + bob - 1
    const f = p.face // -1 | 1, which way the staff side points
    const flick = 0.8 + 0.2 * Math.sin(t * 7.1) * Math.sin(t * 3.3 + 1.7)
    const lx = cx + 8 * f
    const ly = y - 25
    // shadow on the tile
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 1, 10, 4.4, 0, 0, 6.283)
    ctx.fill()
    // warm pool the lantern casts on the stone — the path walks inside it
    const lp = ctx.createRadialGradient(lx, cy + 1, 1, lx, cy + 1, 24)
    lp.addColorStop(0, 'rgba(255,190,120,' + (0.15 * flick).toFixed(3) + ')')
    lp.addColorStop(1, 'rgba(255,190,120,0)')
    ctx.fillStyle = lp
    ctx.beginPath()
    ctx.ellipse(lx, cy + 1, 24, 10, 0, 0, 6.283)
    ctx.fill()
    // staff + lantern — the warmest point on the board
    ctx.strokeStyle = '#574734'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lx, y - 27)
    ctx.lineTo(cx + 6 * f, y + 1)
    ctx.stroke()
    const lg = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, 15)
    lg.addColorStop(0, 'rgba(255,238,200,' + (0.95 * flick).toFixed(3) + ')')
    lg.addColorStop(0.35, 'rgba(255,196,120,' + (0.45 * flick).toFixed(3) + ')')
    lg.addColorStop(1, 'rgba(255,170,90,0)')
    ctx.fillStyle = lg
    ctx.beginPath()
    ctx.arc(lx, ly, 15, 0, 6.283)
    ctx.fill()
    ctx.fillStyle = '#ffc878'
    ctx.beginPath()
    ctx.arc(lx, ly, 2.6, 0, 6.283)
    ctx.fill()
    ctx.fillStyle = '#fff3d8'
    ctx.beginPath()
    ctx.arc(lx, ly, 1.4, 0, 6.283)
    ctx.fill()
    // cloak
    ctx.fillStyle = '#2a2233'
    ctx.beginPath()
    ctx.moveTo(cx, y - 26)
    ctx.quadraticCurveTo(cx - 8, y - 14, cx - 6.5, y + 1)
    ctx.lineTo(cx + 6.5, y + 1)
    ctx.quadraticCurveTo(cx + 8, y - 14, cx, y - 26)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(232,220,192,0.22)'
    ctx.lineWidth = 1
    ctx.stroke()
    // head inside the hood
    ctx.fillStyle = '#cdbb96'
    ctx.beginPath()
    ctx.arc(cx + 1.5 * f, y - 19.5, 2.6, 0, 6.283)
    ctx.fill()
    ctx.fillStyle = '#1d1726'
    ctx.beginPath()
    ctx.arc(cx - 0.8 * f, y - 21, 3.4, 0, 6.283)
    ctx.fill()
  }

  function drawCity(bounds, alpha, t, won) {
    if (alpha < 0.01) return
    const cw = canvas.width
    const baseX = fit.ox + ((bounds.x0 + bounds.x1) / 2) * fit.sc
    const baseY = Math.max(canvas.height * 0.16, fit.oy + bounds.y0 * fit.sc - 26 * fit.sc)
    const s = Math.max(0.8, fit.sc * 0.9)
    // golden haze behind the skyline
    const hz = ctx.createRadialGradient(baseX, baseY, 10, baseX, baseY, 330 * s)
    hz.addColorStop(0, 'rgba(255,210,150,' + (0.16 * alpha).toFixed(3) + ')')
    hz.addColorStop(1, 'rgba(255,210,150,0)')
    ctx.fillStyle = hz
    ctx.fillRect(0, 0, cw, baseY + 60 * s)
    for (let i = 0; i < city.length; i++) {
      const b = city[i]
      const shimmer = 0.75 + 0.25 * Math.sin(t * 0.7 + b.ph)
      const a = alpha * shimmer * (won ? 1 : 0.85)
      const x = baseX + b.dx * s
      const w = b.w * s
      const h = b.h * s
      ctx.fillStyle = 'rgba(34,44,58,' + (a * 0.9).toFixed(3) + ')'
      ctx.fillRect(x - w / 2, baseY - h, w, h)
      // darken the base so the towers sit in the mist instead of on it
      ctx.fillStyle = 'rgba(6,9,12,' + (a * 0.5).toFixed(3) + ')'
      ctx.fillRect(x - w / 2, baseY - h * 0.18, w, h * 0.18)
      if (b.type === 1) {
        ctx.beginPath()
        ctx.arc(x, baseY - h, w * 0.62, Math.PI, 0)
        ctx.fill()
      } else if (b.type === 2) {
        ctx.beginPath()
        ctx.moveTo(x - w * 0.3, baseY - h)
        ctx.lineTo(x, baseY - h - 24 * s)
        ctx.lineTo(x + w * 0.3, baseY - h)
        ctx.closePath()
        ctx.fill()
      }
      // golden windows wake one by one
      ctx.fillStyle = 'rgba(255,217,160,' + (a * 0.85).toFixed(3) + ')'
      for (let wi = 0; wi < b.win; wi++) {
        const wy = baseY - h + (wi + 0.6) * (h / (b.win + 1))
        const tw = 0.5 + 0.5 * Math.sin(t * 1.9 + b.ph + wi * 2.4)
        if (alpha * tw > 0.18) ctx.fillRect(x - 1.4 * s, wy, 2.8 * s, 3.6 * s)
      }
    }
    // ground line of mist under the city (fades back out — no hard seam)
    const ma = 0.7 * Math.min(1, alpha + 0.3)
    const ml = ctx.createLinearGradient(0, baseY - 8 * s, 0, baseY + 54 * s)
    ml.addColorStop(0, 'rgba(10,16,20,0)')
    ml.addColorStop(0.4, 'rgba(8,13,18,' + ma.toFixed(3) + ')')
    ml.addColorStop(1, 'rgba(8,13,18,0)')
    ctx.fillStyle = ml
    ctx.fillRect(0, baseY - 8 * s, cw, 62 * s)
  }

  // --- main draw -------------------------------------------------------------
  function draw(g, dt) {
    const cw = canvas.width
    const ch = canvas.height
    computeFit(g.lvl.bounds)
    const t = g.visT

    // sky
    if (skyH !== ch) {
      skyH = ch
      skyGrad = ctx.createLinearGradient(0, 0, 0, ch)
      skyGrad.addColorStop(0, '#06090c')
      skyGrad.addColorStop(0.45, '#0a1320')
      skyGrad.addColorStop(0.75, '#0c1826')
      skyGrad.addColorStop(1, '#06090c')
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, cw, ch)

    // stars
    ctx.fillStyle = '#e8dcc0'
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i]
      const a = 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph))
      ctx.globalAlpha = a
      ctx.fillRect(st.x * cw, st.y * ch, st.r, st.r)
    }
    ctx.globalAlpha = 1

    // city on the horizon — alpha follows the connected fraction
    const target = g.phase === 'won' ? 1 : Math.max(g.connFrac, g.cityFloor)
    cityAlpha += (target - cityAlpha) * Math.min(1, dt * 1.6)
    drawCity(g.lvl.bounds, cityAlpha, t, g.phase === 'won')

    // back fog
    for (let i = 0; i < 3; i++) {
      const f = fogs[i]
      const fx = (0.5 + f.x * 0.4 + 0.04 * Math.sin(t / f.sp + f.ph)) * cw
      const fy = (f.y + 0.35) * ch
      const fr = f.r * cw
      const gr = ctx.createRadialGradient(fx, fy, fr * 0.2, fx, fy, fr)
      gr.addColorStop(0, 'rgba(40,58,76,' + f.a + ')')
      gr.addColorStop(1, 'rgba(40,58,76,0)')
      ctx.fillStyle = gr
      ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
    }

    // world transform (+ shake)
    let sx = 0
    let sy = 0
    if (shakeT < 1) {
      shakeT = Math.min(1, shakeT + dt * 3.2)
      const m = shakeMag * (1 - shakeT) * fit.sc
      sx = (Math.random() - 0.5) * m * 2
      sy = (Math.random() - 0.5) * m * 2
      if (shakeT >= 1) shakeMag = 0
    }
    ctx.setTransform(fit.sc, 0, 0, fit.sc, fit.ox + sx, fit.oy + sy)

    // level reveal clock, driven by the sim time
    if (revAt === -2) revAt = t
    revT = Math.max(0, Math.min(9, t - revAt))

    // rotor discs (below everything on the board)
    for (let i = 0; i < g.rotors.length; i++) {
      const dk = revK(g.rotors[i].cx + g.rotors[i].cy)
      if (dk <= 0) continue
      ctx.globalAlpha = dk
      disc(g.rotors[i], t)
    }
    ctx.globalAlpha = 1

    // tiles + pilgrim, painter's order
    const items = g.drawList
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 2) it.sort = g.pil.gx + g.pil.gy + 0.45
      else it.sort = it.gx + it.gy + it.gz * 0.001 + (it.kind === 1 ? 0.02 : 0)
    }
    // insertion sort — the list is small and almost sorted every frame
    for (let i = 1; i < items.length; i++) {
      const it = items[i]
      let j = i - 1
      while (j >= 0 && items[j].sort > it.sort) {
        items[j + 1] = items[j]
        j--
      }
      items[j + 1] = it
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 2) {
        const pk = revK(g.pil.gx + g.pil.gy)
        if (pk > 0) {
          ctx.globalAlpha = pk
          drawPilgrim(g.pil, t)
          ctx.globalAlpha = 1
        }
        continue
      }
      // each stone condenses out of the fog: fades in while rising into place
      const rk = revK(it.gx + it.gy)
      if (it.revP !== undefined && it.revP < 1 && rk >= 1) {
        burst(it.gx, it.gy, it.gz, '#8fa3b5', 2, 26, 10, 0.4)
      }
      it.revP = rk
      if (rk <= 0) continue
      const gz = it.gz - (1 - rk) * 0.55
      ctx.globalAlpha = rk
      tile(it.gx, it.gy, gz, it.mask, it.ang, it.conn, g.pathK, it.shade, t)
      if (it.gate) gateArch(it.gx, it.gy, gz, g.pathK, t)
      if (it.start) {
        ctx.strokeStyle = 'rgba(159,255,208,0.30)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.ellipse(isoX(it.gx, it.gy), isoY(it.gx, it.gy, gz), HW * 0.55, HH * 0.55, 0, 0, 6.283)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // particles (world space)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (!p.on) continue
      p.t += dt
      if (p.t >= p.life) {
        p.on = false
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.g * dt
      const k = 1 - p.t / p.life
      ctx.globalAlpha = k * 0.9
      ctx.fillStyle = p.c
      ctx.fillRect(p.x, p.y, p.r, p.r)
    }
    ctx.globalAlpha = 1

    // front fog + popups + ripples + pulse (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.textAlign = 'center'
    ctx.font = 'italic ' + Math.round(15 * fit.dpr) + 'px Georgia, serif'
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i]
      if (!p.on) continue
      p.t += dt
      if (p.t > 1.4) {
        p.on = false
        continue
      }
      const k = Math.min(1, p.t / 0.18)
      const px = Math.max(95 * fit.dpr, Math.min(cw - 95 * fit.dpr, fit.ox + p.x * fit.sc))
      const py = fit.oy + p.y * fit.sc - p.t * 30 * fit.dpr
      ctx.globalAlpha = k * (p.t > 0.9 ? 1 - (p.t - 0.9) / 0.5 : 1)
      ctx.fillStyle = p.c
      ctx.fillText(p.text, px, py)
    }
    ctx.globalAlpha = 1
    for (let i = 3; i < 5; i++) {
      const f = fogs[i]
      const fx = (0.5 + f.x * 0.45 + 0.05 * Math.sin(t / f.sp + f.ph)) * cw
      const fy = f.y * ch + ch * 0.28
      const fr = f.r * cw * 1.2
      const gr = ctx.createRadialGradient(fx, fy, fr * 0.25, fx, fy, fr)
      gr.addColorStop(0, 'rgba(30,46,62,' + f.a + ')')
      gr.addColorStop(1, 'rgba(30,46,62,0)')
      ctx.fillStyle = gr
      ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
    }
    // reveal choreography: two fog banks part sideways as the stones assemble
    if (revT < 1.5) {
      const vk = 1 - revT / 1.5
      const vy = fit.oy + ((g.lvl.bounds.y0 + g.lvl.bounds.y1) / 2) * fit.sc
      for (let i = 0; i < 2; i++) {
        const dir = i === 0 ? -1 : 1
        const fx = cw / 2 + dir * (0.14 + (1 - vk) * 0.5) * cw
        const fr = cw * (0.30 + 0.22 * vk)
        const gr = ctx.createRadialGradient(fx, vy, fr * 0.1, fx, vy, fr)
        gr.addColorStop(0, 'rgba(26,40,54,' + (0.5 * vk).toFixed(3) + ')')
        gr.addColorStop(1, 'rgba(26,40,54,0)')
        ctx.fillStyle = gr
        ctx.fillRect(fx - fr, vy - fr, fr * 2, fr * 2)
      }
    }
    for (let i = 0; i < rips.length; i++) {
      const r = rips[i]
      if (!r.on) continue
      r.t += dt
      if (r.t > 0.5) {
        r.on = false
        continue
      }
      const k = r.t / 0.5
      ctx.strokeStyle = 'rgba(232,220,192,' + (0.5 * (1 - k)).toFixed(3) + ')'
      ctx.lineWidth = 2 * fit.dpr
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, 30 * k * fit.dpr, 20 * k * fit.dpr, 0, 0, 6.283)
      ctx.stroke()
    }
    if (pulseT < 1) {
      pulseT = Math.min(1, pulseT + dt * 1.8)
      ctx.globalAlpha = (1 - pulseT) * 0.18
      ctx.fillStyle = pulseC
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
    }
  }

  return { draw, project, burst, popup, ripple, shake, pulse, clearFx, reveal, get scale() { return fit.sc } }
}
