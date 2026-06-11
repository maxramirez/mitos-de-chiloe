/* ============================================================
   EL VUELO DEL BRUJO — boot-time procedural CanvasTextures.
   Every canvas is 256 px, seeded, and drawn with wrap-around
   copies so it tiles seam-free. Built ONCE (lazy singleton);
   grayscale tiles double as map + bumpMap. No per-frame work
   happens here — callers may scroll .offset, nothing more.
   ============================================================ */

import * as THREE from 'three'
import { mulberry32 } from './noise.js'

const SIZE = 256
const MARGIN = 42

function canvas2d() {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  return { c, g: c.getContext('2d') }
}

/* coordinates duplicated across the tile edge so patterns wrap clean */
function wraps(v) {
  return v < MARGIN ? [v, v + SIZE] : v > SIZE - MARGIN ? [v, v - SIZE] : [v]
}

function speck(g, x, y, w, h) {
  for (const xx of wraps(x)) for (const yy of wraps(y)) g.fillRect(xx, yy, w, h)
}

function blob(g, x, y, r, rgb, a) {
  for (const xx of wraps(x)) {
    for (const yy of wraps(y)) {
      const grad = g.createRadialGradient(xx, yy, 0, xx, yy, r)
      grad.addColorStop(0, 'rgba(' + rgb + ',' + a + ')')
      grad.addColorStop(1, 'rgba(' + rgb + ',0)')
      g.fillStyle = grad
      g.fillRect(xx - r, yy - r, r * 2, r * 2)
    }
  }
}

function gray(g, v, a) {
  g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'
}

function toTexture(c, repeatX, repeatY, srgb) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (repeatX) t.repeat.set(repeatX, repeatY)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ---- ground: lichen-blotched turf/rock grain for the islets ---- */
function groundCanvas() {
  const rng = mulberry32(0x9d2f01)
  const { c, g } = canvas2d()
  g.fillStyle = '#d8d8d8'
  g.fillRect(0, 0, SIZE, SIZE)
  /* large soft tonal blotches — ground unevenness, lichen patches */
  for (let i = 0; i < 24; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 14 + rng() * 30, rng() > 0.5 ? '92,92,92' : '244,244,244', 0.05 + rng() * 0.05)
  }
  /* fine speckle grain */
  for (let i = 0; i < 2600; i++) {
    gray(g, 110 + Math.floor(rng() * 160), 0.05 + rng() * 0.09)
    const s = rng() < 0.8 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  /* wind-combed streaks */
  for (let i = 0; i < 90; i++) {
    gray(g, rng() > 0.5 ? 100 : 235, 0.05 + rng() * 0.05)
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 5 + Math.floor(rng() * 14), 1)
  }
  return c
}

/* ---- rock: banded strata + cracks for the sea arches ---- */
function rockCanvas() {
  const rng = mulberry32(0x51a7e3)
  const { c, g } = canvas2d()
  g.fillStyle = '#d4d4d4'
  g.fillRect(0, 0, SIZE, SIZE)
  /* strata bands (canvas-horizontal = around the arch cylinders) */
  for (let i = 0; i < 16; i++) {
    gray(g, rng() > 0.45 ? 96 : 232, 0.04 + rng() * 0.06)
    speck(g, 0, Math.floor(rng() * SIZE), SIZE, 3 + Math.floor(rng() * 14))
  }
  /* grit */
  for (let i = 0; i < 2000; i++) {
    gray(g, 90 + Math.floor(rng() * 170), 0.06 + rng() * 0.08)
    const s = rng() < 0.75 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  /* vertical cracks */
  for (let i = 0; i < 26; i++) {
    gray(g, 70, 0.08 + rng() * 0.08)
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 6 + Math.floor(rng() * 22))
  }
  return c
}

/* ---- sparkle: bump grain for the water — pinprick glints ---- */
function sparkleCanvas() {
  const rng = mulberry32(0x77c0de)
  const { c, g } = canvas2d()
  g.fillStyle = '#808080'
  g.fillRect(0, 0, SIZE, SIZE)
  /* gentle swell variation */
  for (let i = 0; i < 30; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 16 + rng() * 30, rng() > 0.5 ? '96,96,96' : '208,208,208', 0.09 + rng() * 0.08)
  }
  /* bright facets + dark troughs */
  for (let i = 0; i < 1500; i++) {
    gray(g, 190 + Math.floor(rng() * 65), 0.16 + rng() * 0.4)
    const s = rng() < 0.7 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  for (let i = 0; i < 1500; i++) {
    gray(g, 15 + Math.floor(rng() * 70), 0.14 + rng() * 0.3)
    const s = rng() < 0.7 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  return c
}

/* ---- the moon's face: maria, craters, limb darkening ---- */
function moonCanvas() {
  const rng = mulberry32(0x10a)
  const { c, g } = canvas2d()
  g.fillStyle = '#f6efdc'
  g.fillRect(0, 0, SIZE, SIZE)
  /* maria — soft gray seas, biased up-left so the disc reads asymmetric */
  for (let i = 0; i < 15; i++) {
    const a = rng() * Math.PI * 2
    const d = rng() * 68
    const x = 106 + Math.cos(a) * d
    const y = 100 + Math.sin(a) * d * 0.8
    const r = 12 + rng() * 26
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r)
    grad.addColorStop(0, 'rgba(168,158,134,' + (0.11 + rng() * 0.09) + ')')
    grad.addColorStop(1, 'rgba(168,158,134,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  /* pinprick craters */
  for (let i = 0; i < 60; i++) {
    const x = 24 + rng() * 208
    const y = 24 + rng() * 208
    if (Math.hypot(x - 128, y - 128) > 116) continue
    g.fillStyle = 'rgba(150,140,118,' + (0.1 + rng() * 0.12) + ')'
    g.beginPath()
    g.arc(x, y, 0.8 + rng() * 2.6, 0, Math.PI * 2)
    g.fill()
  }
  /* limb darkening toward the disc edge */
  const limb = g.createRadialGradient(128, 128, 60, 128, 128, 130)
  limb.addColorStop(0, 'rgba(120,110,92,0)')
  limb.addColorStop(0.82, 'rgba(120,110,92,0.04)')
  limb.addColorStop(1, 'rgba(120,110,92,0.3)')
  g.fillStyle = limb
  g.fillRect(0, 0, SIZE, SIZE)
  return c
}

/* ---- moonglade streaks: vertical glints, bright center lane ---- */
function glitterCanvas() {
  const rng = mulberry32(0xfacade)
  const { c, g } = canvas2d()
  g.clearRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 540; i++) {
    g.fillStyle = 'rgba(255,250,235,' + (0.05 + rng() * 0.25) + ')'
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 5 + Math.floor(rng() * 22))
  }
  /* confine the path: bright center lane, fading flanks */
  g.globalCompositeOperation = 'destination-in'
  const lane = g.createLinearGradient(0, 0, SIZE, 0)
  lane.addColorStop(0, 'rgba(0,0,0,0)')
  lane.addColorStop(0.28, 'rgba(0,0,0,0.25)')
  lane.addColorStop(0.5, 'rgba(0,0,0,1)')
  lane.addColorStop(0.72, 'rgba(0,0,0,0.25)')
  lane.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = lane
  g.fillRect(0, 0, SIZE, SIZE)
  g.globalCompositeOperation = 'source-over'
  return c
}

/* ---- lazy singleton: world + brujo share one texture set ---- */
let cache = null
export function getTextures() {
  if (cache) return cache
  const ground = groundCanvas()
  cache = {
    ground: toTexture(ground, 0, 0, true) /* UVs scaled per-islet */,
    rock: toTexture(rockCanvas(), 1.6, 1.2, true),
    sparkle: toTexture(sparkleCanvas(), 90, 90, false),
    moon: toTexture(moonCanvas(), 0, 0, true),
    glitter: toTexture(glitterCanvas(), 1, 3, false),
    leather: toTexture(ground, 3, 2, false) /* macuñ bump reuses grain */,
  }
  return cache
}
