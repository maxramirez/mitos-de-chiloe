/* ============================================================
   EL VUELO DEL BRUJO — world: islets, water, sky, moon, brujo.
   heightAt(x, z) is PURE and deterministic — collision + visuals
   both sample it. Sea level y = 0. Units ≈ meters.
   ============================================================ */

import * as THREE from 'three'
import { fbm, mulberry32, smooth01, clamp } from './noise.js'

/* ---- the channel: ~12 islets across ~1.5 km ---- */
export const ISLETS = [
  { x: -45, z: -635, r: 55, h: 15 },
  { x: 110, z: -500, r: 60, h: 13 },
  { x: -45, z: -355, r: 58, h: 18 },
  { x: -135, z: -260, r: 65, h: 14 }, // arch islet A (ring 4)
  { x: 90, z: -185, r: 50, h: 12 },
  { x: -10, z: -45, r: 62, h: 16 },
  { x: 190, z: 30, r: 48, h: 11 },
  { x: 45, z: 125, r: 56, h: 17 },
  { x: -65, z: 245, r: 60, h: 12 }, // tree-thread islet (ring 8)
  { x: -150, z: 370, r: 70, h: 15 }, // arch islet B (ring 9)
  { x: 60, z: 520, r: 52, h: 13 },
  { x: -40, z: 640, r: 58, h: 14 },
]

export function heightAt(x, z) {
  let best = -3 // sea floor offshore
  for (let i = 0; i < ISLETS.length; i++) {
    const isl = ISLETS[i]
    const d = Math.hypot(x - isl.x, z - isl.z)
    if (d >= isl.r) continue
    const t = smooth01(1 - d / isl.r)
    const nm = 0.78 + fbm(x * 0.045 + i * 7.1, z * 0.045 - i * 3.3, 3) * 0.5
    const h = isl.h * Math.pow(t, 1.5) * nm - 0.6
    if (h > best) best = h
  }
  return best
}

/* ---- ring definitions: alternate high / low; 2 thread rock arches ----
   y < 0 means "terrain-relative": final y = heightAt(x,z) + |y| */
export const RING_DEFS = [
  { x: 0, z: -600, y: 36, high: true },
  { x: 70, z: -480, y: 12, high: false },
  { x: -40, z: -360, y: 44, high: true },
  { x: -115, z: -240, y: -7, high: false, arch: true },
  { x: 40, z: -120, y: 40, high: true },
  { x: 140, z: 0, y: 11, high: false },
  { x: 60, z: 120, y: 46, high: true },
  { x: -60, z: 240, y: -8, high: false, trees: true },
  { x: -140, z: 360, y: -7, high: false, arch: true },
  { x: 0, z: 470, y: 42, high: true },
  { x: 105, z: 575, y: 11, high: false },
  { x: 0, z: 690, y: 38, high: true },
]

/* resolved ring data: world-space positions + facing dir (toward next) */
export const RINGS = RING_DEFS.map((d) => ({
  x: d.x,
  y: d.y < 0 ? heightAt(d.x, d.z) - d.y : d.y,
  z: d.z,
  dirx: 0,
  dirz: 1,
  arch: !!d.arch,
  trees: !!d.trees,
  high: !!d.high,
}))
for (let i = 0; i < RINGS.length; i++) {
  const a = RINGS[Math.max(0, i - 1)]
  const b = RINGS[Math.min(RINGS.length - 1, i + 1)]
  const dx = b.x - a.x
  const dz = b.z - a.z
  const l = Math.hypot(dx, dz) || 1
  RINGS[i].dirx = dx / l
  RINGS[i].dirz = dz / l
}

/* ---- procedural radial-glow texture (shared by sprites/particles) ---- */
export function glowTexture(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ============================================================ */
export function buildWorld(scene) {
  scene.background = new THREE.Color(0x06090c)
  scene.fog = new THREE.FogExp2(0x0a141a, 0.0019)

  /* lights */
  scene.add(new THREE.HemisphereLight(0x32405a, 0x0e1614, 0.68))
  const moonLight = new THREE.DirectionalLight(0xa8c0dc, 1.5)
  scene.add(moonLight)
  scene.add(moonLight.target)

  /* ---- islets: per-islet displaced planes, vertex colored ---- */
  const cSand = new THREE.Color(0x4c483c)
  const cGrass = new THREE.Color(0x202c24)
  const cRock = new THREE.Color(0x3c4046)
  const tmpC = new THREE.Color()
  const isletMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })
  for (const isl of ISLETS) {
    const size = isl.r * 2.3
    const geo = new THREE.PlaneGeometry(size, size, 26, 26)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + isl.x
      const wz = pos.getZ(i) + isl.z
      const h = heightAt(wx, wz)
      pos.setY(i, h)
      const t = clamp(h / isl.h, 0, 1)
      if (h < 1.2) tmpC.copy(cSand)
      else if (t < 0.65) tmpC.copy(cGrass)
      else tmpC.copy(cRock)
      tmpC.multiplyScalar(0.85 + fbm(wx * 0.1, wz * 0.1, 2) * 0.3)
      colors[i * 3] = tmpC.r
      colors[i * 3 + 1] = tmpC.g
      colors[i * 3 + 2] = tmpC.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, isletMat)
    mesh.position.set(isl.x, 0, isl.z)
    scene.add(mesh)
  }

  /* ---- trees: instanced trunk + crown ---- */
  const rng = mulberry32(0xc41e)
  const treeSpots = []
  for (let ii = 0; ii < ISLETS.length; ii++) {
    const isl = ISLETS[ii]
    for (let k = 0; k < 16; k++) {
      const a = rng() * Math.PI * 2
      const rr = Math.sqrt(rng()) * isl.r * 0.62
      const x = isl.x + Math.cos(a) * rr
      const z = isl.z + Math.sin(a) * rr
      const h = heightAt(x, z)
      if (h > 1.6 && h < isl.h * 0.92) treeSpots.push({ x, y: h, z, s: 0.7 + rng() * 0.8 })
    }
  }
  /* ring 8 threads between trees: flank it deliberately */
  const r8 = RINGS[7]
  for (const side of [-1, 1]) {
    const fx = r8.x - r8.dirz * side * 13
    const fz = r8.z + r8.dirx * side * 13
    treeSpots.push({ x: fx, y: heightAt(fx, fz), z: fz, s: 1.35 })
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5)
  trunkGeo.translate(0, 1.6, 0)
  const crownGeo = new THREE.ConeGeometry(2.1, 7.5, 6)
  crownGeo.translate(0, 6.4, 0)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x191410, roughness: 1 })
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x131e16, roughness: 1, flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length)
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const eul = new THREE.Euler()
  const vS = new THREE.Vector3()
  const vP = new THREE.Vector3()
  for (let i = 0; i < treeSpots.length; i++) {
    const t = treeSpots[i]
    eul.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.08)
    q.setFromEuler(eul)
    vS.setScalar(t.s)
    vP.set(t.x, t.y - 0.3, t.z)
    m4.compose(vP, q, vS)
    trunks.setMatrixAt(i, m4)
    crowns.setMatrixAt(i, m4)
  }
  scene.add(trunks, crowns)

  /* ---- one hut + warm window light per islet ---- */
  const hutMat = new THREE.MeshStandardMaterial({ color: 0x14110d, roughness: 1 })
  const winMat = new THREE.MeshStandardMaterial({ color: 0x100c08, roughness: 1, emissive: 0xffb860, emissiveIntensity: 2.2 })
  const winTex = glowTexture('rgba(255,190,110,0.85)', 'rgba(255,190,110,0)')
  for (let i = 0; i < ISLETS.length; i++) {
    const isl = ISLETS[i]
    const a = (i * 2.39996) % (Math.PI * 2)
    const x = isl.x + Math.cos(a) * isl.r * 0.34
    const z = isl.z + Math.sin(a) * isl.r * 0.34
    const y = heightAt(x, z)
    if (y < 1) continue
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3, 3.6), hutMat)
    hut.position.set(x, y + 1.2, z)
    hut.rotation.y = a
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 4), hutMat)
    roof.position.set(x, y + 3.7, z)
    roof.rotation.y = a + Math.PI / 4
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), winMat)
    win.position.set(x + Math.cos(a) * 2.26, y + 1.4, z + Math.sin(a) * 2.26)
    win.rotation.y = a + Math.PI / 2
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: winTex, transparent: true, opacity: 0.55, depthWrite: false }))
    spr.scale.setScalar(6)
    spr.position.set(win.position.x, y + 1.6, win.position.z)
    scene.add(hut, roof, win, spr)
  }

  /* ---- rock arches over rings 4 and 9 ---- */
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 1, flatShading: true })
  for (const r of RINGS) {
    if (!r.arch) continue
    const grp = new THREE.Group()
    const span = 13
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.8, 24, 7), rockMat)
      leg.position.set(side * span, 1, 0)
      leg.rotation.z = side * 0.1
      grp.add(leg)
    }
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.9, span * 2 + 5, 7), rockMat)
    lintel.rotation.z = Math.PI / 2
    lintel.position.set(0, 12.5, 0)
    grp.add(lintel)
    grp.position.set(r.x, r.y, r.z)
    grp.rotation.y = Math.atan2(r.dirx, r.dirz)
    scene.add(grp)
  }

  /* ---- water ---- */
  const waterGeo = new THREE.PlaneGeometry(2400, 2400, 48, 48)
  waterGeo.rotateX(-Math.PI / 2)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0a2226,
    roughness: 0.55,
    metalness: 0.25,
    transparent: true,
    opacity: 0.92,
    emissive: 0x041014,
  })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.position.y = 0
  scene.add(water)
  const wPos = waterGeo.attributes.position

  /* ---- star dome ---- */
  const starN = 1400
  const starPos = new Float32Array(starN * 3)
  const sRng = mulberry32(0x57a125)
  for (let i = 0; i < starN; i++) {
    const t = sRng() * Math.PI * 2
    const p = Math.acos(1 - sRng() * 0.96)
    const rr = 1450
    starPos[i * 3] = Math.sin(p) * Math.cos(t) * rr
    starPos[i * 3 + 1] = Math.cos(p) * rr * 0.62 + 30
    starPos[i * 3 + 2] = Math.sin(p) * Math.sin(t) * rr
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0e8, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }))
  scene.add(stars)

  /* ---- the moon: low, and sinking — the visible timer ---- */
  const moonGroup = new THREE.Group()
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(66, 40),
    new THREE.MeshBasicMaterial({ color: 0xf4ecd8, fog: false })
  )
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(244,236,216,0.5)', 'rgba(244,236,216,0)'), transparent: true, opacity: 0.85, fog: false, depthWrite: false }))
  moonHalo.scale.setScalar(340)
  moonGroup.add(moonDisc, moonHalo)
  scene.add(moonGroup)

  /* moon azimuth: down-channel, sinking ahead of the flight path */
  const moonAz = { x: 0.22, z: 1 }
  const azl = Math.hypot(moonAz.x, moonAz.z)
  moonAz.x /= azl
  moonAz.z /= azl

  /* p = fraction of night remaining (1 → 0). Elevation 13° → -2.5°. */
  function setMoonProgress(p) {
    const elev = (-2.5 + 15.5 * p) * (Math.PI / 180)
    const dist = 1350
    const y = Math.sin(elev) * dist
    moonGroup.position.set(moonAz.x * dist * Math.cos(elev), y, moonAz.z * dist * Math.cos(elev))
    moonDisc.lookAt(0, 0, 0)
    moonLight.position.set(moonAz.x * 300, Math.max(20, y * 0.25 + 40), moonAz.z * 300)
    moonLight.intensity = 0.5 + clamp(p, 0, 1) * 1.1
    return moonGroup.position
  }
  setMoonProgress(1)

  let waterT = 0
  function update(t, dt) {
    waterT = t
    /* cheap shimmer: scroll a couple of low rows — touch few verts */
    for (let i = 0; i < wPos.count; i += 7) {
      const x = wPos.getX(i)
      const z = wPos.getZ(i)
      wPos.setY(i, Math.sin(x * 0.02 + t * 0.7) * Math.cos(z * 0.017 + t * 0.5) * 0.55)
    }
    wPos.needsUpdate = true
    stars.rotation.y = t * 0.0024
  }

  return { update, setMoonProgress, moonPos: moonGroup.position }
}

/* ============================================================
   The brujo in flight — dark figure wearing the macuñ
   ============================================================ */
export function createBrujo() {
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 })
  const macun = new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x9fffd0, emissiveIntensity: 0.018 })

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1, 7), skin)
  body.rotation.x = Math.PI / 2 /* cone tip points +z = direction of flight */
  body.position.z = -0.2
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin)
  head.position.set(0, 0.18, 1.0)
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 9), skin)
  brim.position.set(0, 0.4, 1.0)
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 9), skin)
  crown.position.set(0, 0.62, 1.0)
  group.add(body, head, brim, crown)

  /* macuñ wings — the flayed vest stretched on night air */
  const wingGeo = new THREE.PlaneGeometry(2.6, 1.3, 5, 2)
  const wpos = wingGeo.attributes.position
  for (let i = 0; i < wpos.count; i++) {
    const x = wpos.getX(i)
    wpos.setY(i, wpos.getY(i) * (1 - Math.abs(x) * 0.18))
  }
  wingGeo.computeVertexNormals()
  const wingL = new THREE.Mesh(wingGeo, macun)
  const wingR = new THREE.Mesh(wingGeo, macun)
  wingL.position.set(-1.45, 0.12, 0.15)
  wingR.position.set(1.45, 0.12, 0.15)
  wingL.rotation.x = -Math.PI / 2
  wingR.rotation.x = -Math.PI / 2
  group.add(wingL, wingR)

  function update(t, speedNorm) {
    const flap = Math.sin(t * (3 + speedNorm * 4)) * (0.12 + speedNorm * 0.16)
    wingL.rotation.z = flap
    wingR.rotation.z = -flap
    wingL.position.y = 0.12 + Math.sin(t * 2.1) * 0.04
    wingR.position.y = 0.12 + Math.sin(t * 2.1 + 0.4) * 0.04
  }

  return { group, update }
}
