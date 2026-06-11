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

/* ============================================================
   BRUJO CHARACTER CANVASES — the macuñ is stitched human skin;
   color/bump maps carry the leather mottling and patch seams,
   matching black "glow" canvases carry ONLY the stitch thread
   (used as emissiveMap → faint spectral green seams).
   ============================================================ */

/* whip-stitch dashes along a wavy line; drawn on both canvases */
function stitchSeam(g, gg, rng, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.floor(len / 7)
  const nx = (y1 - y0) / len /* normal */
  const ny = -(x1 - x0) / len
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const wob = Math.sin(t * Math.PI * 3 + x0) * 3
    const x = x0 + (x1 - x0) * t + nx * wob
    const y = y0 + (y1 - y0) * t + ny * wob
    /* seam shadow: a dark gouge under the thread (color canvas only) */
    g.fillStyle = 'rgba(10,7,5,0.5)'
    g.fillRect(x - 1, y - 1, 3, 3)
    if (i % 2 === 0) {
      const a = 0.55 + rng() * 0.35
      /* pale thread tick, slightly angled */
      g.fillStyle = 'rgba(126,110,86,' + a + ')'
      g.fillRect(x - 2 + nx * 2, y - 2 + ny * 2, 4, 2)
      /* same tick on the glow canvas — spectral green */
      gg.fillStyle = 'rgba(150,255,200,' + (0.4 + rng() * 0.4) + ')'
      gg.fillRect(x - 2 + nx * 2, y - 2 + ny * 2, 4, 2)
    }
  }
}

/* ---- macuñ vest: dark human-leather patches + stitched seams ---- */
function macunCanvases() {
  const rng = mulberry32(0xacb1170)
  const { c, g } = canvas2d()
  const { c: gc, g: gg } = canvas2d()
  gg.fillStyle = '#000000'
  gg.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = '#2c2118'
  g.fillRect(0, 0, SIZE, SIZE)
  /* skin mottling: warm and cold patches, like tanned hide */
  for (let i = 0; i < 26; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 18 + rng() * 34,
      rng() > 0.5 ? '74,54,36' : '16,11,8', 0.1 + rng() * 0.12)
  }
  /* pore/grain speckle */
  for (let i = 0; i < 1700; i++) {
    const v = 18 + Math.floor(rng() * 70)
    g.fillStyle = 'rgba(' + (v + 30) + ',' + (v + 14) + ',' + v + ',' + (0.1 + rng() * 0.16) + ')'
    const s = rng() < 0.8 ? 1 : 2
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), s, s)
  }
  /* patch boundaries: 3 vertical + 3 horizontal stitched seams */
  for (let i = 0; i < 3; i++) {
    const x = SIZE * (0.18 + i * 0.3 + rng() * 0.1)
    stitchSeam(g, gg, rng, x, 0, x + (rng() - 0.5) * 40, SIZE)
    const y = SIZE * (0.16 + i * 0.3 + rng() * 0.1)
    stitchSeam(g, gg, rng, 0, y, SIZE, y + (rng() - 0.5) * 40)
  }
  return { color: c, glow: gc }
}

/* ---- macuñ wing: membrane with finger ribs + stitched edge ---- */
function wingCanvases() {
  const rng = mulberry32(0x717c5)
  const { c, g } = canvas2d()
  const { c: gc, g: gg } = canvas2d()
  gg.fillStyle = '#000000'
  gg.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = '#261b12'
  g.fillRect(0, 0, SIZE, SIZE)
  /* stretched-thin translucent patches — lighter where the skin pulls taut */
  for (let i = 0; i < 20; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 16 + rng() * 30,
      rng() > 0.45 ? '88,64,42' : '14,10,7', 0.1 + rng() * 0.12)
  }
  for (let i = 0; i < 1300; i++) {
    const v = 20 + Math.floor(rng() * 64)
    g.fillStyle = 'rgba(' + (v + 26) + ',' + (v + 12) + ',' + v + ',' + (0.1 + rng() * 0.14) + ')'
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 1)
  }
  /* finger ribs: dark bones fanning leading edge (v=0, canvas bottom)
     → trailing scallops (v=1, canvas top); faint green marrow glow */
  for (let i = 0; i < 5; i++) {
    const xb = SIZE * (0.5 + (i - 2) * 0.09) /* converge near the wrist */
    const xt = SIZE * (0.1 + i * 0.2)
    for (let s = 0; s <= 24; s++) {
      const t = s / 24
      const x = xb + (xt - xb) * t + Math.sin(t * Math.PI) * 6
      const y = SIZE - 8 - t * (SIZE - 16)
      const w = 5 - t * 3.4
      g.fillStyle = 'rgba(8,5,4,' + (0.5 - t * 0.2) + ')'
      g.fillRect(x - w / 2, y - 6, w, 12)
      gg.fillStyle = 'rgba(150,255,200,' + (0.12 - t * 0.08) + ')'
      gg.fillRect(x - w / 2, y - 6, w, 12)
    }
  }
  /* stitched hem where the membrane meets the arm (leading edge) */
  stitchSeam(g, gg, rng, 0, SIZE - 12, SIZE, SIZE - 10)
  /* one diagonal repair seam across the membrane */
  stitchSeam(g, gg, rng, SIZE * 0.12, SIZE * 0.7, SIZE * 0.78, SIZE * 0.18)
  return { color: c, glow: gc }
}

/* ---- skin grain: subtle bump for body/head/arms/legs ---- */
function skinCanvas() {
  const rng = mulberry32(0x5c111)
  const { c, g } = canvas2d()
  g.fillStyle = '#8a8a8a'
  g.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 18; i++) {
    blob(g, rng() * SIZE, rng() * SIZE, 20 + rng() * 40, rng() > 0.5 ? '120,120,120' : '96,96,96', 0.12 + rng() * 0.1)
  }
  for (let i = 0; i < 1400; i++) {
    gray(g, 90 + Math.floor(rng() * 90), 0.08 + rng() * 0.1)
    speck(g, Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 1)
  }
  return c
}

/* ---- lazy singleton: world + brujo share one texture set ---- */
let cache = null
export function getTextures() {
  if (cache) return cache
  const macun = macunCanvases()
  const wing = wingCanvases()
  cache = {
    ground: toTexture(groundCanvas(), 0, 0, true) /* UVs scaled per-islet */,
    rock: toTexture(rockCanvas(), 1.6, 1.2, true),
    sparkle: toTexture(sparkleCanvas(), 90, 90, false),
    moon: toTexture(moonCanvas(), 0, 0, true),
    glitter: toTexture(glitterCanvas(), 1, 3, false),
    macun: toTexture(macun.color, 0, 0, true) /* vest hide: map + bump */,
    macunGlow: toTexture(macun.glow, 0, 0, false) /* stitch emissive */,
    wing: toTexture(wing.color, 0, 0, true) /* membrane: map + bump */,
    wingGlow: toTexture(wing.glow, 0, 0, false) /* rib/stitch emissive */,
    skin: toTexture(skinCanvas(), 2, 2, false) /* grayscale bump */,
  }
  return cache
}
