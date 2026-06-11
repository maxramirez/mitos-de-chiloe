// EL BRUJO DE QUICAVÍ · brujo.js — the keeper of the pages.
// A gaunt 2.6 m pitch-dark figure: long coat, wide-brim hat, a pale face and
// two faint spectral eyes. He NEVER walks — main teleports him with
// relocate() while he is unobserved, and vanish() parks him under the world.
// No lights on him (the farol finds him). Also builds the scare face used for
// the catch close-up. update() is allocation-free (sway + eye flicker only).

import * as THREE from 'three'
import { terrainHeight } from './world.js'

export function createBrujo(isOpen) {
  const group = new THREE.Group()

  const coatMat = new THREE.MeshStandardMaterial({ color: 0x0d1014, roughness: 1 })
  // the face is the only thing the forest lets you see of him — self-lit pale
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x9aa394,
    roughness: 0.85,
    emissive: 0x8d9784,
    emissiveIntensity: 1.05,
  })
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
  // arms — too long, hanging
  const armGeo = new THREE.CylinderGeometry(0.05, 0.04, 1.25, 5)
  const armL = new THREE.Mesh(armGeo, coatMat)
  armL.position.set(-0.3, 1.45, 0)
  armL.rotation.z = 0.07
  group.add(armL)
  const armR = new THREE.Mesh(armGeo, coatMat)
  armR.position.set(0.3, 1.45, 0)
  armR.rotation.z = -0.07
  group.add(armR)
  // pale head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 7), faceMat)
  head.position.y = 2.32
  head.scale.set(0.86, 1.18, 0.9)
  group.add(head)
  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.022, 6, 5)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.05, 2.35, 0.115)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeR.position.set(0.05, 2.35, 0.115)
  group.add(eyeR)
  // wide-brim hat
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.035, 9), coatMat)
  brim.position.y = 2.44
  group.add(brim)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8), coatMat)
  crown.position.y = 2.6
  group.add(crown)

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
  {
    const flat = (color) =>
      new THREE.MeshBasicMaterial({ color, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    const skull = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), flat(0xb7c0ae))
    skull.scale.set(0.78, 1.06, 1)
    scareFace.add(skull)
    const shadeL = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), flat(0x05322a))
    shadeL.position.set(-0.16, 0.1, 0.002)
    scareFace.add(shadeL)
    const shadeR = shadeL.clone()
    shadeR.position.x = 0.16
    scareFace.add(shadeR)
    const pupilL = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), flat(0x9fffd0))
    pupilL.position.set(-0.16, 0.1, 0.004)
    scareFace.add(pupilL)
    const pupilR = pupilL.clone()
    pupilR.position.x = 0.16
    scareFace.add(pupilR)
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.05), flat(0x0a0c0a))
    mouth.position.set(0, -0.26, 0.002)
    scareFace.add(mouth)
    const brimS = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.34), flat(0x040605))
    brimS.position.set(0, 0.5, 0.001)
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
    if (!present) return
    group.rotation.z = Math.sin(t * 0.7) * 0.012
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
