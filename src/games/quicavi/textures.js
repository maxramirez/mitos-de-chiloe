// EL BRUJO DE QUICAVÍ · textures.js — boot-time procedural CanvasTextures.
// Same grammar as the sibling games: 256 px seeded tiles drawn with
// wrap-around copies so they repeat seam-free. The grayscale tiles are
// MULTIPLIER maps (near-white base, darker features) so `material.color *
// map` keeps the established palette exactly while adding grain; each one
// doubles as its own bumpMap — the farol's close-range light is what sells
// the relief. The one color canvas is the skin-parchment page (also the
// fallback when the painted /assets/quicavi/page.png never arrives).
// Everything is built ONCE (lazy singleton); no per-frame work, and a null
// bundle is returned if canvas 2d is unavailable (callers must guard).

import * as THREE from 'three'

const SIZE = 256
const MARGIN = 42

// local boot-only PRNG (kept here to avoid a module cycle with world.js)
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas2d(w, h) {
  const c = document.createElement('canvas')
  c.width = w || SIZE
  c.height = h || SIZE
  return { c, g: c.getContext('2d') }
}

/* coordinates duplicated across the tile edge so patterns wrap clean */
function wraps(v) {
  return v < MARGIN ? [v, v + SIZE] : v > SIZE - MARGIN ? [v, v - SIZE] : [v]
}

function speck(g, x, y, w, h) {
  const xs = wraps(x)
  const ys = wraps(y)
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) g.fillRect(xs[i], ys[j], w, h)
  }
}

function blob(g, x, y, r, rgb, a) {
  const xs = wraps(x)
  const ys = wraps(y)
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) {
      const grad = g.createRadialGradient(xs[i], ys[j], 0, xs[i], ys[j], r)
      grad.addColorStop(0, 'rgba(' + rgb + ',' + a + ')')
      grad.addColorStop(1, 'rgba(' + rgb + ',0)')
      g.fillStyle = grad
      g.fillRect(xs[i] - r, ys[j] - r, r * 2, r * 2)
    }
  }
}

function gray(g, v, a) {
  g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'
}

function toTexture(c, srgb) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ---- ground: damp leaf-litter and dirt of the black forest floor ---- */
function groundCanvas() {
  const rng = mulberry32(0x51c4a8)
  const { c, g } = canvas2d()
  g.fillStyle = '#cfcfcf'
  g.fillRect(0, 0, SIZE, SIZE)
  /* soft tonal blotches — damp patches, humus unevenness */
  for (let i = 0; i < 30; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 16 + rng() * 34, rng() > 0.45 ? '74,74,74' : '240,240,240', 0.08 + rng() * 0.09)
  }
  /* fallen-leaf speckle */
  for (let i = 0; i < 2600; i++) {
    gray(g, 78 + Math.floor(rng() * 172), 0.09 + rng() * 0.11)
    const s = rng() < 0.78 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  /* twigs — short thin sticks both ways */
  for (let i = 0; i < 130; i++) {
    gray(g, rng() > 0.6 ? 58 : 212, 0.1 + rng() * 0.09)
    const len = 4 + Math.floor(rng() * 13)
    if (rng() < 0.5) speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), len, 1)
    else speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, len)
  }
  return c
}

/* ---- bark: vertical streak grain (stretches gracefully on tall trunks) ---- */
function barkCanvas() {
  const rng = mulberry32(0xba2c01)
  const { c, g } = canvas2d()
  g.fillStyle = '#c9c9c9'
  g.fillRect(0, 0, SIZE, SIZE)
  /* long vertical fissures and ridges */
  for (let i = 0; i < 150; i++) {
    gray(g, rng() > 0.55 ? 64 + Math.floor(rng() * 60) : 190 + Math.floor(rng() * 50), 0.08 + rng() * 0.13)
    const w = rng() < 0.7 ? 1 : 2
    const h = 26 + Math.floor(rng() * 120)
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), w, h)
  }
  /* knots */
  for (let i = 0; i < 7; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 5 + rng() * 9, '52,52,52', 0.2 + rng() * 0.15)
  }
  /* fine speckle */
  for (let i = 0; i < 500; i++) {
    gray(g, 90 + Math.floor(rng() * 140), 0.05 + rng() * 0.08)
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 1 + Math.floor(rng() * 3))
  }
  return c
}

/* ---- rock: grimy mottle + hairline cracks for the standing stones ---- */
function rockCanvas() {
  const rng = mulberry32(0x77e019)
  const { c, g } = canvas2d()
  g.fillStyle = '#d4d4d4'
  g.fillRect(0, 0, SIZE, SIZE)
  /* lichen / grime patches */
  for (let i = 0; i < 22; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 12 + rng() * 30, rng() > 0.4 ? '92,92,92' : '240,240,240', 0.05 + rng() * 0.07)
  }
  /* mineral speckle */
  for (let i = 0; i < 1600; i++) {
    gray(g, 100 + Math.floor(rng() * 150), 0.05 + rng() * 0.09)
    const s = rng() < 0.85 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  /* hairline cracks — wandering polylines, kept off the seams */
  g.lineWidth = 1
  for (let i = 0; i < 11; i++) {
    let x = MARGIN + rng() * (SIZE - MARGIN * 2)
    let y = MARGIN + rng() * (SIZE - MARGIN * 2)
    let a = rng() * Math.PI * 2
    g.strokeStyle = 'rgba(60,60,60,' + (0.18 + rng() * 0.14) + ')'
    g.beginPath()
    g.moveTo(x, y)
    const segs = 3 + Math.floor(rng() * 5)
    for (let s = 0; s < segs; s++) {
      a += (rng() - 0.5) * 1.1
      x = Math.max(8, Math.min(SIZE - 8, x + Math.cos(a) * (7 + rng() * 16)))
      y = Math.max(8, Math.min(SIZE - 8, y + Math.sin(a) * (7 + rng() * 16)))
      g.lineTo(x, y)
    }
    g.stroke()
  }
  return c
}

/* ---- plank: weathered boards for hut walls, rails and the rowboat ---- */
function plankCanvas() {
  const rng = mulberry32(0x0c3afe)
  const { c, g } = canvas2d()
  g.fillStyle = '#cdcdcd'
  g.fillRect(0, 0, SIZE, SIZE)
  const BOARD = 64 // 4 boards per tile
  for (let b = 0; b < 4; b++) {
    const y0 = b * BOARD
    /* board-to-board tone shift */
    gray(g, rng() > 0.5 ? 110 : 230, 0.05 + rng() * 0.05)
    g.fillRect(0, y0, SIZE, BOARD)
    /* gap line between boards */
    gray(g, 48, 0.5)
    g.fillRect(0, y0, SIZE, 2)
    /* grain streaks within the board */
    for (let i = 0; i < 46; i++) {
      gray(g, rng() > 0.55 ? 80 + Math.floor(rng() * 60) : 200 + Math.floor(rng() * 50), 0.06 + rng() * 0.1)
      const w = 10 + Math.floor(rng() * 50)
      const x = Math.floor(rng() * SIZE)
      const y = y0 + 4 + Math.floor(rng() * (BOARD - 7))
      // horizontal grain wraps in x only (board edges hide the y seam)
      g.fillRect(x, y, w, 1)
      if (x + w > SIZE) g.fillRect(x - SIZE, y, w, 1)
    }
    /* the odd nail head */
    if (rng() < 0.8) {
      gray(g, 40, 0.55)
      g.fillRect(10 + Math.floor(rng() * 30), y0 + 10 + Math.floor(rng() * (BOARD - 20)), 2, 2)
      g.fillRect(SIZE - 40 + Math.floor(rng() * 28), y0 + 10 + Math.floor(rng() * (BOARD - 20)), 2, 2)
    }
  }
  return c
}

/* ---- the page: skin-parchment with scrawled pact sigils (COLOR; the
        procedural stand-in for — and fallback behind — the painted PNG) ---- */
function parchmentCanvas() {
  const rng = mulberry32(0x7a9e55)
  const W = 256
  const H = 352
  const { c, g } = canvas2d(W, H)
  g.fillStyle = '#e2d2ae'
  g.fillRect(0, 0, W, H)
  /* mottled staining */
  for (let i = 0; i < 26; i++) {
    const r = 12 + rng() * 52
    const x = rng() * W
    const y = rng() * H
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const tone = rng() > 0.5 ? '150,118,72' : '96,72,42'
    grad.addColorStop(0, 'rgba(' + tone + ',' + (0.05 + rng() * 0.09) + ')')
    grad.addColorStop(1, 'rgba(' + tone + ',0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  /* fibers */
  for (let i = 0; i < 520; i++) {
    const dark = rng() > 0.5
    g.fillStyle = dark ? 'rgba(118,94,58,' + (0.05 + rng() * 0.05) + ')' : 'rgba(246,238,212,' + (0.05 + rng() * 0.06) + ')'
    g.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 1, 2 + Math.floor(rng() * 9))
  }
  /* ink: one wobbly ritual double-circle with radial ticks */
  const ink = (a) => 'rgba(44,30,16,' + a + ')'
  g.strokeStyle = ink(0.5)
  g.lineWidth = 2
  const cx = 128
  const cy = 168
  for (let ring = 0; ring < 2; ring++) {
    const R = ring === 0 ? 64 : 47
    g.beginPath()
    for (let s = 0; s <= 40; s++) {
      const a = (s / 40) * Math.PI * 2
      const r = R + (rng() - 0.5) * 3.4
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (s === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  g.lineWidth = 1
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (rng() - 0.5) * 0.1
    g.strokeStyle = ink(0.35 + rng() * 0.25)
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * 47, cy + Math.sin(a) * 47)
    g.lineTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64)
    g.stroke()
  }
  /* a small spiral in the circle's heart */
  g.strokeStyle = ink(0.5)
  g.beginPath()
  for (let s = 0; s <= 60; s++) {
    const a = s * 0.42
    const r = s * 0.55
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (s === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  /* rows of glyph-scratches — writing that is not writing */
  const rows = [44, 70, 286, 312]
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r]
    let x = 26 + rng() * 10
    while (x < 226) {
      const n = 1 + Math.floor(rng() * 3)
      for (let k = 0; k < n; k++) {
        g.strokeStyle = ink(0.3 + rng() * 0.3)
        g.beginPath()
        const x0 = x + k * 3
        g.moveTo(x0 + (rng() - 0.5) * 2, y - 3 - rng() * 5)
        g.lineTo(x0 + (rng() - 0.5) * 4, y + 3 + rng() * 5)
        g.stroke()
      }
      x += 7 + rng() * 9
    }
  }
  /* scattered marks: small crosses */
  for (let i = 0; i < 5; i++) {
    const x = 30 + rng() * 196
    const y = 96 + rng() * 36
    g.strokeStyle = ink(0.35 + rng() * 0.2)
    g.beginPath()
    g.moveTo(x - 4, y)
    g.lineTo(x + 4, y)
    g.moveTo(x, y - 4)
    g.lineTo(x, y + 4)
    g.stroke()
  }
  /* darkened, torn edges */
  const edge = (x0, y0, x1, y1) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, 'rgba(28,20,10,0.7)')
    grad.addColorStop(1, 'rgba(28,20,10,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  edge(0, 0, 22, 0)
  edge(W, 0, W - 22, 0)
  edge(0, 0, 0, 20)
  edge(0, H, 0, H - 26)
  /* tear notches */
  g.fillStyle = 'rgba(24,17,9,0.55)'
  for (let i = 0; i < 9; i++) {
    const onX = rng() < 0.5
    const x = onX ? rng() * W : rng() < 0.5 ? 0 : W - 5
    const y = onX ? (rng() < 0.5 ? 0 : H - 5) : rng() * H
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 3 + rng() * 7, y + (rng() - 0.5) * 8)
    g.lineTo(x + (rng() - 0.5) * 8, y + 3 + rng() * 7)
    g.closePath()
    g.fill()
  }
  return c
}

let T = null
export function getTextures() {
  if (T) return T
  try {
    T = {
      ground: toTexture(groundCanvas()),
      bark: toTexture(barkCanvas()),
      rock: toTexture(rockCanvas()),
      plank: toTexture(plankCanvas()),
      parchment: toTexture(parchmentCanvas(), true),
    }
    T.ground.repeat.set(54, 54) // 290 m plane → ~5.4 m tiles
    T.parchment.wrapS = T.parchment.wrapT = THREE.ClampToEdgeWrapping
  } catch (e) {
    T = { ground: null, bark: null, rock: null, plank: null, parchment: null }
  }
  return T
}
