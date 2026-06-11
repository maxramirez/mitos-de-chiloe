// textures.js — EL TRAUCO · procedural CanvasTextures, generated ONCE at boot.
// All color maps are centered near white (they MODULATE vertex/instance colors
// and material tints, never replace them); bump maps carry the real detail and
// read under the hand-lantern. Deliberately low contrast — this forest whispers.
import * as THREE from 'three'

// tiny deterministic rng so the forest floor is the same every load
function texRng(seed) {
  let s = seed | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function colorTex(c, repeat) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.repeat.set(repeat, repeat)
  return t
}

function dataTex(c, repeat) {
  const t = new THREE.CanvasTexture(c) // bump: linear, no color space
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (repeat) t.repeat.set(repeat, repeat)
  return t
}

// ---------- forest floor: moss mottle, leaf litter, faint root streaks ----------
// map modulates the existing dark green/brown vertex colors; bump gives the
// lantern something to rake across.
export function makeGroundTextures(repeat) {
  const rng = texRng(7331)
  const size = 512
  const c = canvas(size)
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(224, 222, 214)'
  g.fillRect(0, 0, size, size)

  // large soft moss/dirt mottle (toroidal: draw 9 wrapped copies of each blob)
  for (let i = 0; i < 130; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = 18 + rng() * 52
    const dark = rng() < 0.55
    const a = 0.05 + rng() * 0.07
    g.fillStyle = dark ? `rgba(96, 104, 88, ${a})` : `rgba(244, 240, 224, ${a})`
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        g.beginPath()
        g.arc(x + ox * size, y + oy * size, r, 0, Math.PI * 2)
        g.fill()
      }
  }
  // leaf-litter speckle
  for (let i = 0; i < 1500; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = 0.6 + rng() * 2.2
    const dark = rng() < 0.6
    g.fillStyle = dark
      ? `rgba(70, 78, 64, ${0.10 + rng() * 0.12})`
      : `rgba(238, 232, 210, ${0.07 + rng() * 0.09})`
    g.beginPath()
    g.ellipse((x + size) % size, (y + size) % size, r * (1 + rng()), r, rng() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  // faint root/runner streaks
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    let x = rng() * size
    let y = rng() * size
    let ang = rng() * Math.PI * 2
    g.strokeStyle = `rgba(88, 92, 76, ${0.06 + rng() * 0.06})`
    g.lineWidth = 1 + rng() * 2.4
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      ang += (rng() - 0.5) * 0.9
      x += Math.cos(ang) * (10 + rng() * 16)
      y += Math.sin(ang) * (10 + rng() * 16)
      g.lineTo(x, y)
    }
    g.stroke()
  }

  // bump: same language in grayscale, higher contrast
  const bc = canvas(256)
  const bg = bc.getContext('2d')
  bg.fillStyle = 'rgb(128,128,128)'
  bg.fillRect(0, 0, 256, 256)
  const brng = texRng(9182)
  for (let i = 0; i < 90; i++) {
    const x = brng() * 256
    const y = brng() * 256
    const r = 8 + brng() * 30
    const v = brng() < 0.5 ? 80 : 175
    bg.fillStyle = `rgba(${v},${v},${v},${0.10 + brng() * 0.12})`
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        bg.beginPath()
        bg.arc(x + ox * 256, y + oy * 256, r, 0, Math.PI * 2)
        bg.fill()
      }
  }
  for (let i = 0; i < 900; i++) {
    const v = brng() < 0.5 ? 60 : 195
    bg.fillStyle = `rgba(${v},${v},${v},${0.16 + brng() * 0.2})`
    bg.beginPath()
    bg.arc(brng() * 256, brng() * 256, 0.6 + brng() * 1.8, 0, Math.PI * 2)
    bg.fill()
  }
  return { map: colorTex(c, repeat), bumpMap: dataTex(bc, repeat) }
}

// ---------- bark: vertical grain, knots, horizontal cracks ----------
// shared by play trunks, dead branches, gate trunks and vine stumps.
export function makeBarkTextures() {
  const rng = texRng(4117)
  const size = 256
  const c = canvas(size)
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(218, 212, 202)'
  g.fillRect(0, 0, size, size)

  // wavy vertical grain strokes (wrap horizontally)
  for (let i = 0; i < 64; i++) {
    const x0 = rng() * size
    const w = 1.5 + rng() * 4
    const dark = rng() < 0.62
    const a = 0.08 + rng() * 0.12
    g.strokeStyle = dark ? `rgba(96, 84, 70, ${a})` : `rgba(240, 234, 218, ${a})`
    g.lineWidth = w
    const amp = 2 + rng() * 5
    const ph = rng() * Math.PI * 2
    for (let wrap = -1; wrap <= 1; wrap++) {
      g.beginPath()
      for (let y = -8; y <= size + 8; y += 8) {
        const x = x0 + wrap * size + Math.sin(y * 0.045 + ph) * amp
        if (y === -8) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
  }
  // knots
  for (let i = 0; i < 7; i++) {
    const x = rng() * size
    const y = rng() * size
    for (let k = 3; k >= 1; k--) {
      g.strokeStyle = `rgba(90, 78, 66, ${0.10 + 0.05 * k})`
      g.lineWidth = 1.5
      g.beginPath()
      g.ellipse(x, y, 2.5 * k, 4.5 * k, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }
  // short horizontal cracks
  for (let i = 0; i < 40; i++) {
    const x = rng() * size
    const y = rng() * size
    g.strokeStyle = `rgba(80, 70, 58, ${0.12 + rng() * 0.14})`
    g.lineWidth = 0.8 + rng() * 1.2
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 4 + rng() * 12, y + (rng() - 0.5) * 4)
    g.stroke()
  }

  // bump from the same idea, grayscale
  const bc = canvas(256)
  const bg = bc.getContext('2d')
  bg.fillStyle = 'rgb(128,128,128)'
  bg.fillRect(0, 0, 256, 256)
  const brng = texRng(5519)
  for (let i = 0; i < 70; i++) {
    const x0 = brng() * 256
    const v = brng() < 0.55 ? 70 : 185
    bg.strokeStyle = `rgba(${v},${v},${v},${0.18 + brng() * 0.2})`
    bg.lineWidth = 1.5 + brng() * 3.5
    const amp = 2 + brng() * 5
    const ph = brng() * Math.PI * 2
    for (let wrap = -1; wrap <= 1; wrap++) {
      bg.beginPath()
      for (let y = -8; y <= 264; y += 8) {
        const x = x0 + wrap * 256 + Math.sin(y * 0.05 + ph) * amp
        if (y === -8) bg.moveTo(x, y)
        else bg.lineTo(x, y)
      }
      bg.stroke()
    }
  }
  return { map: colorTex(c), bumpMap: dataTex(bc) }
}

// ---------- cypress foliage: needle-clump mottle, breaks the flat cone ----------
export function makeFoliageTexture() {
  const rng = texRng(2741)
  const size = 256
  const c = canvas(size)
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(212, 218, 210)'
  g.fillRect(0, 0, size, size)
  // layered dabs — darker pockets and pale moonlit tips
  for (let i = 0; i < 950; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = 2 + rng() * 7
    const dark = rng() < 0.58
    const a = 0.08 + rng() * 0.10
    g.fillStyle = dark ? `rgba(78, 96, 84, ${a})` : `rgba(236, 244, 232, ${a})`
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        g.beginPath()
        g.ellipse(x + ox * size, y + oy * size, r, r * 0.45, rng() * Math.PI, 0, Math.PI * 2)
        g.fill()
      }
  }
  return colorTex(c)
}

// ---------- mist puff: soft irregular blob for the drifting ground-fog ----------
export function makeMistTexture() {
  const rng = texRng(6203)
  const size = 128
  const c = canvas(size)
  const g = c.getContext('2d')
  // several overlapping soft radial blobs => irregular cloudlet
  for (let i = 0; i < 7; i++) {
    const x = 34 + rng() * 60
    const y = 48 + rng() * 36
    const r = 22 + rng() * 26
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.32)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.13)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
