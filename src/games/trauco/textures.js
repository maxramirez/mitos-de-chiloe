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
    const a = 0.07 + rng() * 0.09
    g.fillStyle = dark ? `rgba(96, 104, 88, ${a})` : `rgba(244, 240, 224, ${a})`
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        g.beginPath()
        g.arc(x + ox * size, y + oy * size, r, 0, Math.PI * 2)
        g.fill()
      }
  }
  // leaf-litter speckle — denser and a touch harder so the lantern pool
  // shows real litter at the player's feet instead of a flat wash
  for (let i = 0; i < 2600; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = 0.6 + rng() * 2.2
    const dark = rng() < 0.6
    g.fillStyle = dark
      ? `rgba(70, 78, 64, ${0.16 + rng() * 0.17})`
      : `rgba(238, 232, 210, ${0.12 + rng() * 0.12})`
    g.beginPath()
    g.ellipse((x + size) % size, (y + size) % size, r * (1 + rng()), r, rng() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  // fallen twigs — short hard strokes the bump map echoes
  g.lineCap = 'round'
  for (let i = 0; i < 70; i++) {
    const x = rng() * size
    const y = rng() * size
    const ang = rng() * Math.PI
    const len = 5 + rng() * 14
    g.strokeStyle = rng() < 0.7
      ? `rgba(74, 66, 52, ${0.16 + rng() * 0.14})`
      : `rgba(230, 222, 198, ${0.11 + rng() * 0.09})`
    g.lineWidth = 0.8 + rng() * 1.1
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    g.stroke()
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
  for (let i = 0; i < 1400; i++) {
    const v = brng() < 0.5 ? 60 : 195
    bg.fillStyle = `rgba(${v},${v},${v},${0.18 + brng() * 0.22})`
    bg.beginPath()
    bg.arc(brng() * 256, brng() * 256, 0.6 + brng() * 1.8, 0, Math.PI * 2)
    bg.fill()
  }
  // twig relief matching the color map's strokes in spirit
  bg.lineCap = 'round'
  for (let i = 0; i < 50; i++) {
    const x = brng() * 256
    const y = brng() * 256
    const ang = brng() * Math.PI
    const len = 5 + brng() * 14
    const v = brng() < 0.5 ? 55 : 200
    bg.strokeStyle = `rgba(${v},${v},${v},${0.20 + brng() * 0.18})`
    bg.lineWidth = 0.8 + brng() * 1.2
    bg.beginPath()
    bg.moveTo(x, y)
    bg.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    bg.stroke()
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

// ---------- the Trauco: woven quilineja cloth + weathered skin ----------
// Same rules as everything else here: near-white color maps that MODULATE
// the material tints (never replace them); bump maps carry the twill weave
// and the old-man pores so the lantern and his own green light can rake
// across him. One-time boot cost, shared by every cloth/skin material.
export function makeTraucoTextures() {
  // -- woven fiber (poncho, hat, beard): diagonal twill + stray strands ----
  const rng = texRng(8821)
  const size = 256
  const c = canvas(size)
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(216, 210, 196)'
  g.fillRect(0, 0, size, size)
  // two diagonal thread passes — coarse homespun twill
  for (const dir of [1, -1]) {
    for (let i = -size; i < size * 2; i += 7) {
      const a = 0.09 + rng() * 0.11
      const dark = rng() < 0.55
      g.strokeStyle = dark ? `rgba(92, 80, 58, ${a})` : `rgba(238, 232, 212, ${a})`
      g.lineWidth = 2.2 + rng() * 1.8
      g.beginPath()
      g.moveTo(i, dir > 0 ? 0 : size)
      g.lineTo(i + size, dir > 0 ? size : 0)
      g.stroke()
    }
  }
  // weft hint: rows of short horizontal dashes
  for (let y = 3; y < size; y += 6) {
    for (let x = rng() * 8; x < size; x += 9 + rng() * 6) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '96, 84, 62' : '236, 230, 210'}, ${0.06 + rng() * 0.08})`
      g.fillRect(x, y + (rng() - 0.5) * 2, 4 + rng() * 4, 1.4)
    }
  }
  // stray fibers escaping the weave
  g.lineCap = 'round'
  for (let i = 0; i < 70; i++) {
    let x = rng() * size
    let y = rng() * size
    let ang = rng() * Math.PI * 2
    g.strokeStyle = `rgba(${rng() < 0.6 ? '88, 76, 54' : '232, 226, 204'}, ${0.10 + rng() * 0.10})`
    g.lineWidth = 0.7 + rng() * 0.9
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 3; k++) {
      ang += (rng() - 0.5) * 1.2
      x += Math.cos(ang) * (4 + rng() * 7)
      y += Math.sin(ang) * (4 + rng() * 7)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // weave bump: the twill again, grayscale and harder
  const bc = canvas(256)
  const bg = bc.getContext('2d')
  bg.fillStyle = 'rgb(128,128,128)'
  bg.fillRect(0, 0, 256, 256)
  const brng = texRng(3307)
  for (const dir of [1, -1]) {
    for (let i = -256; i < 512; i += 7) {
      const v = brng() < 0.5 ? 70 : 185
      bg.strokeStyle = `rgba(${v},${v},${v},${0.20 + brng() * 0.18})`
      bg.lineWidth = 2 + brng() * 2
      bg.beginPath()
      bg.moveTo(i, dir > 0 ? 0 : 256)
      bg.lineTo(i + 256, dir > 0 ? 256 : 0)
      bg.stroke()
    }
  }
  for (let i = 0; i < 320; i++) {
    const v = brng() < 0.5 ? 60 : 195
    bg.fillStyle = `rgba(${v},${v},${v},${0.14 + brng() * 0.18})`
    bg.beginPath()
    bg.arc(brng() * 256, brng() * 256, 0.6 + brng() * 1.6, 0, Math.PI * 2)
    bg.fill()
  }

  // -- weathered skin: tone gradient, mottle, warts, shallow wrinkles ------
  const srng = texRng(6619)
  const cs = canvas(256)
  const gs = cs.getContext('2d')
  gs.fillStyle = 'rgb(214, 206, 192)'
  gs.fillRect(0, 0, 256, 256)
  // vertical tone gradient — pale crown, earth-dark extremities
  const grad = gs.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, 'rgba(248, 242, 226, 0.12)')
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(64, 54, 40, 0.18)')
  gs.fillStyle = grad
  gs.fillRect(0, 0, 256, 256)
  // mossy liver mottle (toroidal copies so limbs tile cleanly)
  for (let i = 0; i < 70; i++) {
    const x = srng() * 256
    const y = srng() * 256
    const r = 6 + srng() * 22
    const dark = srng() < 0.6
    const a = 0.05 + srng() * 0.07
    gs.fillStyle = dark ? `rgba(108, 96, 70, ${a})` : `rgba(242, 236, 218, ${a})`
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        gs.beginPath()
        gs.arc(x + ox * 256, y + oy * 256, r, 0, Math.PI * 2)
        gs.fill()
      }
  }
  // warts and pores
  for (let i = 0; i < 260; i++) {
    const dark = srng() < 0.7
    gs.fillStyle = dark
      ? `rgba(86, 72, 54, ${0.10 + srng() * 0.12})`
      : `rgba(240, 234, 214, ${0.08 + srng() * 0.08})`
    gs.beginPath()
    gs.arc(srng() * 256, srng() * 256, 0.7 + srng() * 2.0, 0, Math.PI * 2)
    gs.fill()
  }
  // shallow wrinkle arcs
  for (let i = 0; i < 26; i++) {
    const x = srng() * 256
    const y = srng() * 256
    const w = 14 + srng() * 26
    gs.strokeStyle = `rgba(90, 76, 58, ${0.08 + srng() * 0.08})`
    gs.lineWidth = 0.8 + srng() * 1.1
    gs.beginPath()
    gs.arc(x, y + w * 1.6, w * 1.8, Math.PI * 1.28, Math.PI * 1.72)
    gs.stroke()
  }
  // skin bump: pores + wrinkles, grayscale
  const bs = canvas(256)
  const gb = bs.getContext('2d')
  gb.fillStyle = 'rgb(128,128,128)'
  gb.fillRect(0, 0, 256, 256)
  const wrng = texRng(9743)
  for (let i = 0; i < 480; i++) {
    const v = wrng() < 0.6 ? 70 : 190
    gb.fillStyle = `rgba(${v},${v},${v},${0.16 + wrng() * 0.2})`
    gb.beginPath()
    gb.arc(wrng() * 256, wrng() * 256, 0.7 + wrng() * 2.4, 0, Math.PI * 2)
    gb.fill()
  }
  for (let i = 0; i < 30; i++) {
    const x = wrng() * 256
    const y = wrng() * 256
    const w = 14 + wrng() * 26
    gb.strokeStyle = `rgba(60,60,60,${0.16 + wrng() * 0.14})`
    gb.lineWidth = 1 + wrng() * 1.4
    gb.beginPath()
    gb.arc(x, y + w * 1.6, w * 1.8, Math.PI * 1.28, Math.PI * 1.72)
    gb.stroke()
  }

  return {
    weave: { map: colorTex(c), bumpMap: dataTex(bc) },
    skin: { map: colorTex(cs), bumpMap: dataTex(bs) },
  }
}

// ---------- night sky: faint moonlit gradient behind the trunk line ----------
// Mapped onto a tall open cylinder (fog: false) so the wall-forest crowns
// read as silhouettes against a band of sky that is *slightly* brighter than
// they are. Dithered speckle breaks banding on the large gradient.
export function makeSkyTexture() {
  const rng = texRng(1409)
  const W = 256
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  // top of canvas = top of sky. The cylinder now spans world y -40..180
  // (220 m tall), so the brightest band — just above the wall-forest canopy
  // at world y ~8..22 — lives at canvas y ~0.72–0.78. Extremes match
  // scene.background (0x060d16) so the cylinder edges dissolve invisibly.
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgb(6, 13, 22)')
  grad.addColorStop(0.5, 'rgb(11, 20, 32)')
  grad.addColorStop(0.68, 'rgb(20, 34, 52)')
  grad.addColorStop(0.76, 'rgb(27, 45, 67)')
  grad.addColorStop(0.85, 'rgb(12, 21, 32)')
  grad.addColorStop(1, 'rgb(5, 9, 14)')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  // soft brightening toward the moon azimuth (cylinder u ≈ 0.34, world y ≈ 118)
  const mg = g.createRadialGradient(0.34 * W, 0.28 * H, 0, 0.34 * W, 0.28 * H, 0.6 * W)
  mg.addColorStop(0, 'rgba(150, 180, 210, 0.14)')
  mg.addColorStop(0.5, 'rgba(150, 180, 210, 0.05)')
  mg.addColorStop(1, 'rgba(150, 180, 210, 0)')
  g.fillStyle = mg
  g.fillRect(0, 0, W, H)
  // dither: low-alpha speckle kills gradient banding at this scale
  for (let i = 0; i < 1600; i++) {
    const v = rng() < 0.5 ? 0 : 255
    g.fillStyle = `rgba(${v},${v},${v},${0.015 + rng() * 0.03})`
    g.fillRect(rng() * W, rng() * H, 1, 1)
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
