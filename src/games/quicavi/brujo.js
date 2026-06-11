// EL BRUJO DE QUICAVÍ · brujo.js — the keeper of the pages.
// A gaunt 2.6 m pitch-dark figure: long ragged coat, sloped shoulder mantle,
// lank hair under a wide-brim hat, too-long arms ending in pale gaunt hands,
// a pale mottled face and two faint spectral eyes. He NEVER walks — main
// teleports him with relocate() while he is unobserved, and vanish() parks
// him under the world. No lights on him (the farol finds him).
//
// Detail is procedural CanvasTexture (boot-time, try/catch guarded — plain
// materials if canvas 2d is unavailable): a vertical-drape wool weave on the
// coat (map + bumpMap; the farol's close light sells the relief), a ragged
// alphaTest hem that tatters the silhouette's bottom edge, and a skin canvas
// (sunken temples, cheek hollows, mottling) shared by face and hands as both
// map and emissiveMap so the pallor itself is uneven. Also builds the scare
// face used for the catch close-up (canvas-mottled skull, cracked skin,
// a row of teeth). update() is allocation-free: body sway plus offset cloth
// lag (coat / hem / mantle / arms), a slow creeping head tilt the hat
// follows late, eye flicker, haze pulse, and a pupil shiver on the scare
// face while it is visible.

import * as THREE from 'three'
import { terrainHeight } from './world.js'

// boot-only PRNG (same grammar as textures.js, kept local to avoid cycles)
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

/* coat wool: grayscale MULTIPLIER tile — vertical drape streaks + fine weave.
   Near-white base so `color * map` keeps the almost-shadow palette. */
function coatCanvas() {
  const rng = mulberry32(0x9b1c7e)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#c4c4c4'
  g.fillRect(0, 0, 128, 128)
  // long vertical drape streaks (wrap in x via double draw)
  for (let i = 0; i < 70; i++) {
    const v = rng() > 0.55 ? 70 + Math.floor(rng() * 60) : 190 + Math.floor(rng() * 50)
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.07 + rng() * 0.1) + ')'
    const x = Math.floor(rng() * 128)
    const w = rng() < 0.75 ? 1 : 2
    const h = 30 + Math.floor(rng() * 90)
    const y = Math.floor(rng() * 128)
    g.fillRect(x, y, w, h)
    if (y + h > 128) g.fillRect(x, y - 128, w, h)
  }
  // fine weave cross-hatch
  for (let y = 0; y < 128; y += 3) {
    g.fillStyle = 'rgba(60,60,60,' + (0.04 + rng() * 0.04) + ')'
    g.fillRect(0, y, 128, 1)
  }
  // worn patches
  for (let i = 0; i < 9; i++) {
    const x = rng() * 128
    const y = rng() * 128
    const r = 8 + rng() * 18
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const tone = rng() > 0.5 ? '52,52,52' : '224,224,224'
    grad.addColorStop(0, 'rgba(' + tone + ',' + (0.1 + rng() * 0.1) + ')')
    grad.addColorStop(1, 'rgba(' + tone + ',0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return c
}

/* skin: COLOR canvas — pale gray-green pallor, sunken temples, cheek
   hollows, mottling. Shared as map + emissiveMap by face and hands. */
function skinCanvas() {
  const rng = mulberry32(0x4ed30a)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#9aa394'
  g.fillRect(0, 0, 128, 128)
  // edge darkening — the pallor sinks toward shadow at the rim
  let grad = g.createRadialGradient(64, 58, 18, 64, 64, 86)
  grad.addColorStop(0, 'rgba(178,188,172,0.5)')
  grad.addColorStop(0.62, 'rgba(120,128,114,0.18)')
  grad.addColorStop(1, 'rgba(64,72,62,0.6)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  // cheek hollows — two gaunt vertical shadows
  for (let s = -1; s <= 1; s += 2) {
    grad = g.createRadialGradient(64 + s * 26, 80, 2, 64 + s * 26, 80, 24)
    grad.addColorStop(0, 'rgba(70,78,66,0.4)')
    grad.addColorStop(1, 'rgba(70,78,66,0)')
    g.fillStyle = grad
    g.fillRect(64 + s * 26 - 24, 56, 48, 48)
  }
  // brow shadow
  grad = g.createLinearGradient(0, 30, 0, 52)
  grad.addColorStop(0, 'rgba(72,80,68,0.32)')
  grad.addColorStop(1, 'rgba(72,80,68,0)')
  g.fillStyle = grad
  g.fillRect(0, 30, 128, 22)
  // mottling — drowned-skin specks and faint veins
  for (let i = 0; i < 360; i++) {
    const dark = rng() > 0.45
    g.fillStyle = dark
      ? 'rgba(86,96,82,' + (0.08 + rng() * 0.12) + ')'
      : 'rgba(214,222,204,' + (0.06 + rng() * 0.1) + ')'
    const s = rng() < 0.8 ? 1 : 2
    g.fillRect(Math.floor(rng() * 128), Math.floor(rng() * 128), s, s)
  }
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = 'rgba(96,108,96,' + (0.1 + rng() * 0.08) + ')'
    g.lineWidth = 1
    let x = rng() * 128
    let y = rng() * 128
    let a = rng() * Math.PI * 2
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 4; s++) {
      a += (rng() - 0.5) * 1.2
      x += Math.cos(a) * (5 + rng() * 9)
      y += Math.sin(a) * (5 + rng() * 9)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  return c
}

/* hem tatter: alphaMap strip — opaque above, ragged torn teeth at the
   bottom edge (uv v=0), with a few long slits. */
function hemCanvas() {
  const rng = mulberry32(0x33d1b2)
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 64)
  g.fillStyle = '#000000'
  // jagged teeth carved up from the bottom (canvas bottom = uv bottom)
  let x = 0
  while (x < 256) {
    const w = 7 + rng() * 16
    const h = 6 + rng() * 26
    g.beginPath()
    g.moveTo(x, 64)
    g.lineTo(x + w * 0.5, 64 - h)
    g.lineTo(x + w, 64)
    g.closePath()
    g.fill()
    x += w * (0.55 + rng() * 0.5)
  }
  // long slits
  for (let i = 0; i < 5; i++) {
    g.fillRect(Math.floor(rng() * 250), 26 + Math.floor(rng() * 12), 1 + (rng() < 0.4 ? 1 : 0), 64)
  }
  return c
}

/* scare-face skull: COLOR canvas — mottled pale skin, radial shading,
   hairline cracks. The geometry overlays (sockets/pupils/mouth) stay. */
function skullCanvas() {
  const rng = mulberry32(0x6f00d4)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#b7c0ae'
  g.fillRect(0, 0, 256, 256)
  let grad = g.createRadialGradient(128, 112, 30, 128, 128, 170)
  grad.addColorStop(0, 'rgba(216,224,204,0.55)')
  grad.addColorStop(0.6, 'rgba(150,160,140,0.2)')
  grad.addColorStop(1, 'rgba(54,64,52,0.78)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  // gaunt cheek shadows
  for (let s = -1; s <= 1; s += 2) {
    grad = g.createRadialGradient(128 + s * 58, 168, 4, 128 + s * 58, 168, 52)
    grad.addColorStop(0, 'rgba(58,68,56,0.45)')
    grad.addColorStop(1, 'rgba(58,68,56,0)')
    g.fillStyle = grad
    g.fillRect(128 + s * 58 - 52, 116, 104, 104)
  }
  // mottling
  for (let i = 0; i < 900; i++) {
    const dark = rng() > 0.45
    g.fillStyle = dark
      ? 'rgba(84,94,78,' + (0.07 + rng() * 0.12) + ')'
      : 'rgba(226,234,212,' + (0.05 + rng() * 0.1) + ')'
    const s = rng() < 0.8 ? 1 : 2
    g.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), s, s)
  }
  // hairline cracks wandering down from the brow
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = 'rgba(46,54,44,' + (0.25 + rng() * 0.25) + ')'
    g.lineWidth = 1
    let x = 50 + rng() * 156
    let y = 24 + rng() * 60
    let a = Math.PI / 2 + (rng() - 0.5) * 0.8
    g.beginPath()
    g.moveTo(x, y)
    const segs = 4 + Math.floor(rng() * 5)
    for (let s = 0; s < segs; s++) {
      a += (rng() - 0.5) * 0.9
      x += Math.cos(a) * (8 + rng() * 14)
      y += Math.sin(a) * (8 + rng() * 14)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  return c
}

/* teeth: small strip — dark gum line, uneven pale teeth */
function teethCanvas() {
  const rng = mulberry32(0x15ca77)
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const g = c.getContext('2d')
  g.fillStyle = '#0a0c0a'
  g.fillRect(0, 0, 128, 32)
  let x = 6
  while (x < 120) {
    const w = 6 + rng() * 5
    const h = 12 + rng() * 12
    const v = 150 + Math.floor(rng() * 60)
    g.fillStyle = 'rgb(' + v + ',' + (v + 6) + ',' + (v - 10) + ')'
    g.fillRect(x, 2 + rng() * 4, w, h)
    x += w + 2 + rng() * 3
  }
  return c
}

export function createBrujo(isOpen) {
  const group = new THREE.Group()

  // ---- procedural detail textures (null-safe: plain materials without them)
  let coatTex = null
  let skinTex = null
  let hemTex = null
  let skullTex = null
  let teethTex = null
  try {
    coatTex = new THREE.CanvasTexture(coatCanvas())
    coatTex.wrapS = coatTex.wrapT = THREE.RepeatWrapping
    coatTex.repeat.set(2, 2)
    skinTex = new THREE.CanvasTexture(skinCanvas())
    skinTex.colorSpace = THREE.SRGBColorSpace
    hemTex = new THREE.CanvasTexture(hemCanvas())
    hemTex.wrapS = THREE.RepeatWrapping
    skullTex = new THREE.CanvasTexture(skullCanvas())
    skullTex.colorSpace = THREE.SRGBColorSpace
    teethTex = new THREE.CanvasTexture(teethCanvas())
    teethTex.colorSpace = THREE.SRGBColorSpace
  } catch (e) {
    coatTex = skinTex = hemTex = skullTex = teethTex = null
  }

  // near-black wool; the multiplier map (avg ≈ 0.77) lands it on the old
  // 0x0d1014 exactly (pixel-verified against the flat color at 7 m). The
  // shared bumpMap is invisible at relocation distance and only surfaces as
  // weave relief when the farol is right on him — the catch range.
  const coatMat = new THREE.MeshStandardMaterial(
    coatTex
      ? { color: 0x111519, roughness: 1, map: coatTex, bumpMap: coatTex, bumpScale: 0.02 }
      : { color: 0x0d1014, roughness: 1 }
  )
  // the face is the only thing the forest lets you see of him — self-lit pale,
  // and the pallor itself is uneven (the skin canvas drives the emission too)
  const faceMat = new THREE.MeshStandardMaterial(
    skinTex
      ? {
          color: 0xffffff,
          roughness: 0.85,
          map: skinTex,
          emissive: 0x8d9784,
          emissiveMap: skinTex,
          emissiveIntensity: 1.7,
        }
      : { color: 0x9aa394, roughness: 0.85, emissive: 0x8d9784, emissiveIntensity: 1.05 }
  )
  const handMat = new THREE.MeshStandardMaterial(
    skinTex
      ? {
          color: 0xe8eee2,
          roughness: 0.9,
          map: skinTex,
          emissive: 0x8d9784,
          emissiveMap: skinTex,
          emissiveIntensity: 0.7,
        }
      : { color: 0x8a9486, roughness: 0.9, emissive: 0x8d9784, emissiveIntensity: 0.45 }
  )
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f0c,
    emissive: 0x9fffd0,
    emissiveIntensity: 1.4,
    roughness: 0.6,
  })

  // long coat — tapered, almost a shadow
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.52, 1.78, 7), coatMat)
  coat.position.y = 0.89
  group.add(coat)
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.5, 7), coatMat)
  chest.position.y = 1.95
  group.add(chest)
  // sloped shoulder mantle — the cape-like drape that rounds his silhouette
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.33, 0.45, 7), coatMat)
  mantle.position.y = 2.12
  mantle.rotation.z = 0.04 // hangs a little heavier on one side
  group.add(mantle)
  // ragged hem — alphaTest tatter breaks the cone's clean bottom edge
  let hem = null
  if (hemTex && coatTex) {
    const hemMat = new THREE.MeshStandardMaterial({
      color: 0x111519,
      roughness: 1,
      map: coatTex,
      alphaMap: hemTex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })
    hem = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.63, 0.44, 9, 1, true), hemMat)
    hem.position.y = 0.25
    group.add(hem)
  }
  // arms — too long, hanging; pale gaunt hands at the sleeve ends
  const armGeo = new THREE.CylinderGeometry(0.05, 0.04, 1.25, 5)
  const handGeo = new THREE.SphereGeometry(0.05, 7, 6)
  const armL = new THREE.Mesh(armGeo, coatMat)
  armL.position.set(-0.3, 1.45, 0)
  armL.rotation.z = 0.07
  group.add(armL)
  const handL = new THREE.Mesh(handGeo, handMat)
  handL.position.set(0, -0.66, 0.01)
  handL.scale.set(0.78, 1.55, 0.55) // long fingers, read as one gaunt shape
  armL.add(handL)
  const armR = new THREE.Mesh(armGeo, coatMat)
  armR.position.set(0.3, 1.45, 0)
  armR.rotation.z = -0.07
  group.add(armR)
  const handR = new THREE.Mesh(handGeo, handMat)
  handR.position.set(0, -0.66, 0.01)
  handR.scale.set(0.78, 1.55, 0.55)
  armR.add(handR)
  // pale head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), faceMat)
  head.position.y = 2.32
  head.scale.set(0.86, 1.18, 0.9)
  group.add(head)
  // lank hair — an open ring under the brim, the face left clear
  const hair = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.175, 0.34, 8, 1, true, Math.PI * 0.25, Math.PI * 1.5),
    coatMat
  )
  hair.position.y = 2.26
  hair.position.z = -0.015
  group.add(hair)
  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.022, 6, 5)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.05, 2.35, 0.115)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeR.position.set(0.05, 2.35, 0.115)
  group.add(eyeR)
  // wide-brim hat — its own pivot so it can lag behind the head's slow tilt
  const hatG = new THREE.Group()
  hatG.position.y = 2.44
  group.add(hatG)
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.035, 9), coatMat)
  hatG.add(brim)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8), coatMat)
  crown.position.y = 0.16
  hatG.add(crown)
  hatG.rotation.x = 0.045 // worn a touch forward — shadows the brow
  hatG.rotation.z = 0.03

  // a faint cold haze behind him — the black figure silhouettes against it
  let hazeMat = null
  try {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const c2 = cv.getContext('2d')
    const grad = c2.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    c2.fillStyle = grad
    c2.fillRect(0, 0, 64, 64)
    hazeMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      color: 0x42585f,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const haze = new THREE.Sprite(hazeMat)
    haze.position.set(0, 1.55, -0.4)
    haze.scale.set(6, 7.5, 1)
    group.add(haze)
  } catch (e) {
    hazeMat = null
  }

  group.position.set(0, -80, 0)
  let present = false
  let x = 0
  let z = 0

  // ---------------- the catch close-up (attached to camera by main) ----------
  const scareFace = new THREE.Group()
  let pupilL = null
  let pupilR = null
  {
    const flat = (color) =>
      new THREE.MeshBasicMaterial({ color, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    const skullMat = skullTex
      ? new THREE.MeshBasicMaterial({ map: skullTex, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
      : flat(0xb7c0ae)
    const skull = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), skullMat)
    skull.scale.set(0.78, 1.06, 1)
    skull.rotation.z = 0.02 // nothing about the face is quite level
    scareFace.add(skull)
    const shadeL = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), flat(0x05322a))
    shadeL.position.set(-0.16, 0.1, 0.002)
    scareFace.add(shadeL)
    const shadeR = shadeL.clone()
    shadeR.position.x = 0.16
    shadeR.scale.setScalar(1.12) // one socket has sunk deeper than the other
    scareFace.add(shadeR)
    pupilL = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), flat(0x9fffd0))
    pupilL.position.set(-0.16, 0.1, 0.004)
    scareFace.add(pupilL)
    pupilR = pupilL.clone()
    pupilR.position.x = 0.165
    pupilR.position.y = 0.094 // the gaze does not line up
    scareFace.add(pupilR)
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), flat(0x0a0c0a))
    mouth.position.set(0, -0.26, 0.002)
    mouth.rotation.z = -0.04
    scareFace.add(mouth)
    if (teethTex) {
      const teeth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.055),
        new THREE.MeshBasicMaterial({ map: teethTex, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
      )
      teeth.position.set(0, -0.255, 0.003)
      teeth.rotation.z = -0.04
      scareFace.add(teeth)
    }
    const brimS = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.34), flat(0x040605))
    brimS.position.set(0, 0.5, 0.001)
    brimS.rotation.z = 0.025
    scareFace.add(brimS)
    scareFace.traverse((o) => {
      o.renderOrder = 999
    })
    scareFace.visible = false
  }

  // ---------------- relocation (event-time; tiny bounded search) -------------
  // centerAngle: world XZ angle (atan2(dirX, dirZ)) at the middle of the arc;
  // spread: half-arc in radians; dist: meters from (px, pz).
  function relocate(px, pz, centerAngle, spread, dist) {
    for (let tries = 0; tries < 12; tries++) {
      const a = centerAngle + (Math.random() - 0.5) * 2 * spread
      const d = dist * (tries < 8 ? 1 : 0.8)
      let nx = px + Math.sin(a) * d
      let nz = pz + Math.cos(a) * d
      if (nx < -122 || nx > 122 || nz < -122 || nz > 122) {
        nx = Math.max(-122, Math.min(122, nx))
        nz = Math.max(-122, Math.min(122, nz))
      }
      if (!isOpen(nx, nz) && tries < 11) continue
      x = nx
      z = nz
      group.position.set(x, terrainHeight(x, z), z)
      group.rotation.y = Math.atan2(px - x, pz - z) // always facing you
      present = true
      return true
    }
    return false
  }

  function vanish() {
    present = false
    group.position.y = -80
  }

  function update(dt, t) {
    // the catch close-up shivers while it fills the frame (cheap, in-place)
    if (scareFace.visible && pupilL) {
      const p = 1 + 0.22 * Math.sin(t * 37)
      pupilL.scale.setScalar(p)
      pupilR.scale.setScalar(1 + 0.22 * Math.sin(t * 41 + 1.3))
    }
    if (!present) return
    // body sway, with the cloth lagging behind it (secondary motion)
    const sway = Math.sin(t * 0.7)
    group.rotation.z = sway * 0.012
    coat.rotation.z = Math.sin(t * 0.7 + 2.1) * 0.008
    if (hem) hem.rotation.z = Math.sin(t * 0.7 + 2.8) * 0.015
    mantle.rotation.z = 0.04 + Math.sin(t * 0.7 + 2.3) * 0.007
    armL.rotation.z = 0.07 + Math.sin(t * 0.7 + 2.4) * 0.013
    armR.rotation.z = -0.07 - Math.sin(t * 0.7 + 2.7) * 0.013
    // the head tilts, very slowly, as if considering — the hat follows late
    head.rotation.z = 0.055 * Math.sin(t * 0.23) + 0.015 * sway
    hatG.rotation.z = 0.03 + 0.04 * Math.sin(t * 0.23 - 0.5)
    eyeMat.emissiveIntensity = 1.1 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.9))
    if (hazeMat) hazeMat.opacity = 0.075 + 0.03 * (0.5 + 0.5 * Math.sin(t * 1.3))
  }

  return {
    group,
    scareFace,
    relocate,
    vanish,
    update,
    get present() {
      return present
    },
    get x() {
      return x
    },
    get z() {
      return z
    },
  }
}
