/* ============================================================
   EL VUELO DEL BRUJO — world: islets, water, sky, moon, brujo.
   heightAt(x, z) is PURE and deterministic — collision + visuals
   both sample it. Sea level y = 0. Units ≈ meters.
   ============================================================ */

import * as THREE from 'three'
import { fbm, mulberry32, smooth01, clamp } from './noise.js'
import { getTextures } from './textures.js'

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

/* ---- analytic crash capsules: arch legs + lintels (rings 4 & 9)
   and the two ring-8 flank trees. Segment (ax,ay,az)→(bx,by,bz),
   radius r — matches the meshes buildWorld places. ---- */
export const COLLIDERS = []
for (const r of RINGS) {
  if (!r.arch) continue
  const yawA = Math.atan2(r.dirx, r.dirz)
  const cy = Math.cos(yawA)
  const sy = Math.sin(yawA)
  /* local (lx, ly, 0) → world, matching grp.rotation.y = yawA */
  const add = (lx1, ly1, lx2, ly2, rad) =>
    COLLIDERS.push({
      ax: r.x + lx1 * cy, ay: r.y + ly1, az: r.z - lx1 * sy,
      bx: r.x + lx2 * cy, by: r.y + ly2, bz: r.z - lx2 * sy,
      r: rad,
    })
  for (const side of [-1, 1]) {
    /* leg: center (side*13, 1), half-height 12, tilted z by side*0.1 */
    const tx = 12 * Math.sin(side * 0.1)
    const ty = 12 * Math.cos(side * 0.1)
    add(side * 13 + tx, 1 - ty, side * 13 - tx, 1 + ty, 3.0)
  }
  add(-15.5, 12.5, 15.5, 12.5, 2.65) /* lintel */
}
{
  /* ring-8 flank trees — same spots buildWorld plants them at */
  const r8 = RINGS[7]
  for (const side of [-1, 1]) {
    const fx = r8.x - r8.dirz * side * 13
    const fz = r8.z + r8.dirx * side * 13
    const fy = heightAt(fx, fz) - 0.3
    COLLIDERS.push({ ax: fx, ay: fy + 1, az: fz, bx: fx, by: fy + 13, bz: fz, r: 2.4 })
  }
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
  const T = getTextures() /* all procedural canvases, generated once */
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
  const cMoss = new THREE.Color(0x1c2f33) /* cold blue-teal moss patches */
  const cRock = new THREE.Color(0x3c4046)
  const tmpC = new THREE.Color()
  /* grain canvas as map+bump; vertex colors brightened ~1.4x to repay
     the mid-gray map multiply, so overall value stays where it was */
  const isletMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
    map: T.ground,
    bumpMap: T.ground,
    bumpScale: 0.5,
  })
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
      else if (t < 0.65) tmpC.copy(cGrass).lerp(cMoss, clamp(fbm(wx * 0.026 + 11.3, wz * 0.026 - 5.1, 2) * 1.5 - 0.3, 0, 1))
      else tmpC.copy(cRock)
      tmpC.multiplyScalar(1.2 + fbm(wx * 0.1, wz * 0.1, 2) * 0.42)
      colors[i * 3] = tmpC.r
      colors[i * 3 + 1] = tmpC.g
      colors[i * 3 + 2] = tmpC.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    /* world-scale UVs: one grain tile every ~30 m */
    const uv = geo.attributes.uv
    const uvScale = size / 30
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale)
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
  /* white base — each crown gets its own color via instanceColor */
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length)
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length)
  const cCrownA = new THREE.Color(0x101f15) /* deep forest green */
  const cCrownB = new THREE.Color(0x1e3326) /* mossier, lighter */
  const cCrownC = new THREE.Color(0x16313a) /* cold moonlit teal */
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
    tmpC.copy(cCrownA).lerp(rng() < 0.3 ? cCrownC : cCrownB, rng())
    crowns.setColorAt(i, tmpC)
  }
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true
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
  /* base lifted ~1.4x to repay the mid-gray strata map multiply */
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x4a4f57,
    roughness: 1,
    flatShading: true,
    map: T.rock,
    bumpMap: T.rock,
    bumpScale: 0.6,
  })
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
  waterGeo.attributes.position.setUsage(THREE.DynamicDrawUsage)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0a2226,
    roughness: 0.5,
    metalness: 0.25,
    transparent: true,
    opacity: 0.92,
    emissive: 0x041014,
    bumpMap: T.sparkle /* pinprick glints under the moonlight */,
    bumpScale: 0.6,
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
    new THREE.MeshBasicMaterial({ map: T.moon, fog: false })
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

  /* ---- moonglade: glitter lane on the water toward the moon.
     Vertex colors fade it in toward the horizon; opacity follows
     the moon's progress, so the lane itself reads as the timer. ---- */
  const glitGeo = new THREE.PlaneGeometry(54, 1250, 1, 12)
  glitGeo.rotateX(-Math.PI / 2)
  {
    const gp = glitGeo.attributes.position
    const gc = new Float32Array(gp.count * 3)
    for (let i = 0; i < gp.count; i++) {
      const t = clamp(gp.getZ(i) / 1250 + 0.5, 0, 1) /* local +z → toward moon */
      const b = 0.1 + 0.9 * Math.pow(t, 1.5)
      gc[i * 3] = b
      gc[i * 3 + 1] = b
      gc[i * 3 + 2] = b * 0.93 /* a hair warm, like the disc */
    }
    glitGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3))
  }
  const glitMat = new THREE.MeshBasicMaterial({
    map: T.glitter,
    transparent: true,
    opacity: 0.3,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const glitter = new THREE.Mesh(glitGeo, glitMat)
  glitter.position.set(moonAz.x * 320, 0.75, moonAz.z * 320) /* above ripple peaks */
  glitter.rotation.y = Math.atan2(moonAz.x, moonAz.z)
  glitter.renderOrder = 2 /* always composited after the water plane */
  scene.add(glitter)

  /* p = fraction of night remaining (1 → 0). Elevation 13° → -2.5°. */
  function setMoonProgress(p) {
    const elev = (-2.5 + 15.5 * p) * (Math.PI / 180)
    const dist = 1350
    const y = Math.sin(elev) * dist
    moonGroup.position.set(moonAz.x * dist * Math.cos(elev), y, moonAz.z * dist * Math.cos(elev))
    moonDisc.lookAt(0, 0, 0)
    moonLight.position.set(moonAz.x * 300, Math.max(20, y * 0.25 + 40), moonAz.z * 300)
    moonLight.intensity = 0.5 + clamp(p, 0, 1) * 1.1
    glitMat.opacity = 0.34 * Math.pow(clamp(p, 0, 1), 0.8) /* lane dies with the moon */
    return moonGroup.position
  }
  setMoonProgress(1)

  let waterAcc = 1 /* force a first ripple pass */
  function update(t, dt) {
    stars.rotation.y = t * 0.0024
    /* live micro-shimmer: scroll the bump/glint tiles (uniform-only, free) */
    T.sparkle.offset.set(t * 0.012, t * 0.009)
    T.glitter.offset.y = t * -0.05
    /* throttle the CPU ripple pass — the slow shimmer reads the same at ~25 Hz */
    waterAcc += dt
    if (waterAcc < 0.04) return
    waterAcc = 0
    /* cheap shimmer: scroll a couple of low rows — touch few verts */
    for (let i = 0; i < wPos.count; i += 7) {
      const x = wPos.getX(i)
      const z = wPos.getZ(i)
      wPos.setY(i, Math.sin(x * 0.02 + t * 0.7) * Math.cos(z * 0.017 + t * 0.5) * 0.55)
    }
    wPos.needsUpdate = true
  }

  return { update, setMoonProgress, moonPos: moonGroup.position }
}

/* ============================================================
   The brujo in flight — dark figure wearing the macuñ.
   Seen mostly from behind/above, so the back carries the detail:
   stitched-hide vest with glowing seams, bat-membrane wings with
   bone ribs, arms reaching into the wings, legs trailing, and
   tattered hem strips that sway off the body's own rhythm.
   ============================================================ */
export function createBrujo() {
  const T = getTextures()
  const group = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({
    color: 0x1a1612,
    roughness: 0.9,
    bumpMap: T.skin,
    bumpScale: 0.035,
  })
  /* the flayed-skin vest: stitched hide patches, seams that glow
     the macuñ's faint spectral green (emissiveMap = stitches only) */
  const macun = new THREE.MeshStandardMaterial({
    color: 0xffffff /* the map carries the dark leather tones */,
    map: T.macun,
    bumpMap: T.macun,
    bumpScale: 0.08,
    roughness: 0.85,
    side: THREE.DoubleSide,
    emissive: 0x9fffd0,
    emissiveIntensity: 0.55,
    emissiveMap: T.macunGlow,
  })
  /* wing membrane: same hide stretched thin, finger ribs showing */
  const membrane = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: T.wing,
    bumpMap: T.wing,
    bumpScale: 0.06,
    roughness: 0.8,
    side: THREE.DoubleSide,
    emissive: 0x9fffd0,
    emissiveIntensity: 0.5,
    emissiveMap: T.wingGlow,
  })

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1, 7), skin)
  body.rotation.x = Math.PI / 2 /* cone tip points +z = direction of flight */
  body.position.z = -0.2

  /* head + hat in one group so the whole head can bob */
  const headGrp = new THREE.Group()
  headGrp.position.set(0, 0, 1.0)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin)
  head.position.y = 0.18
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 9), skin)
  brim.position.y = 0.4
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 9), skin)
  crown.position.y = 0.62
  /* wind-thrown hair under the hat brim */
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 5), skin)
  hair.position.set(0, 0.2, -0.28)
  hair.rotation.x = -Math.PI / 2 - 0.35 /* streams back and slightly down */
  headGrp.add(head, brim, crown, hair)
  group.add(body, headGrp)

  /* the vest itself: a flared hide sleeve draped over the shoulders */
  const vest = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.3, 0.55),
        new THREE.Vector2(0.44, 0.18),
        new THREE.Vector2(0.5, -0.18),
        new THREE.Vector2(0.58, -0.55),
      ],
      10
    ),
    macun
  )
  vest.rotation.x = Math.PI / 2 /* axis along the prone body */
  vest.position.set(0, 0.04, 0.25)
  group.add(vest)

  /* arms stretched into the wings — a man pinned on the night air */
  const armGeo = new THREE.CylinderGeometry(0.06, 0.085, 1.15, 5)
  armGeo.translate(0, 0.575, 0) /* pivot at the shoulder */
  const handGeo = new THREE.SphereGeometry(0.075, 6, 5)
  const armL = new THREE.Mesh(armGeo, skin)
  const armR = new THREE.Mesh(armGeo, skin)
  armL.position.set(-0.28, 0.06, 0.45)
  armR.position.set(0.28, 0.06, 0.45)
  armL.rotation.z = 1.45
  armR.rotation.z = -1.45
  const handL = new THREE.Mesh(handGeo, skin)
  const handR = new THREE.Mesh(handGeo, skin)
  handL.position.set(-1.42, 0.2, 0.45)
  handR.position.set(1.42, 0.2, 0.45)
  group.add(armL, armR, handL, handR)

  /* legs trailing behind, scissoring slowly against the wind */
  const legGeo = new THREE.ConeGeometry(0.09, 1.0, 5)
  legGeo.translate(0, 0.5, 0) /* pivot at the hip, tip trailing */
  const legL = new THREE.Mesh(legGeo, skin)
  const legR = new THREE.Mesh(legGeo, skin)
  legL.position.set(-0.13, 0.02, -1.0)
  legR.position.set(0.13, 0.02, -1.0)
  legL.rotation.z = 0.1
  legR.rotation.z = -0.1
  group.add(legL, legR)

  /* macuñ wings — the flayed vest stretched on night air.
     Scalloped trailing edge between the finger ribs, tips drooping. */
  const wingGeo = new THREE.PlaneGeometry(2.6, 1.3, 8, 3)
  const wpos = wingGeo.attributes.position
  for (let i = 0; i < wpos.count; i++) {
    const x = wpos.getX(i)
    const y = wpos.getY(i)
    const nx = Math.abs(x) / 1.3
    let ny = y * (1 - nx * 0.22)
    if (y > 0) {
      /* three scallop bites along the trailing edge */
      const s = Math.pow(0.5 - 0.5 * Math.cos(nx * Math.PI * 6), 1.5)
      ny -= (y / 0.65) * 0.2 * s
    }
    wpos.setY(i, ny)
    wpos.setZ(i, -nx * nx * 0.16) /* camber: tips droop after rotation */
  }
  wingGeo.computeVertexNormals()
  const wingL = new THREE.Mesh(wingGeo, membrane)
  const wingR = new THREE.Mesh(wingGeo, membrane)
  wingL.position.set(-1.45, 0.12, 0.15)
  wingR.position.set(1.45, 0.12, 0.15)
  wingL.rotation.x = -Math.PI / 2
  wingR.rotation.x = -Math.PI / 2
  group.add(wingL, wingR)

  /* tattered hem strips around the vest's rear edge */
  const stripGeo = new THREE.PlaneGeometry(0.12, 0.5, 1, 3)
  stripGeo.translate(0, -0.25, 0) /* pivot at the hem */
  const strips = []
  const stripAngles = [0.4, 1.3, 2.4, -2.5, -1.2]
  for (let i = 0; i < stripAngles.length; i++) {
    const a = stripAngles[i]
    const strip = new THREE.Mesh(stripGeo, macun)
    strip.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, -0.28)
    strip.rotation.z = a + Math.PI / 2 /* width tangent to the hem */
    strip.rotation.x = Math.PI / 2 /* hang rearward */
    strips.push(strip)
    group.add(strip)
  }

  function update(t, speedNorm) {
    const flapFreq = 3 + speedNorm * 4
    const flap = Math.sin(t * flapFreq) * (0.12 + speedNorm * 0.16)
    wingL.rotation.z = flap
    wingR.rotation.z = -flap
    wingL.position.y = 0.12 + Math.sin(t * 2.1) * 0.04
    wingR.position.y = 0.12 + Math.sin(t * 2.1 + 0.4) * 0.04
    /* membrane feathering lags the flap — secondary motion */
    const feather = Math.sin(t * flapFreq - 0.7) * 0.06
    wingL.rotation.x = -Math.PI / 2 + feather
    wingR.rotation.x = -Math.PI / 2 + feather
    /* hem rags flutter off the body's own rhythm */
    for (let i = 0; i < strips.length; i++) {
      strips[i].rotation.x = Math.PI / 2 + Math.sin(t * 2.7 + i * 1.7) * 0.3
    }
    /* legs scissor slowly against the wind */
    const kick = Math.sin(t * 1.9) * 0.08
    legL.rotation.x = -Math.PI / 2 + 0.1 + kick
    legR.rotation.x = -Math.PI / 2 + 0.1 - kick
    /* head bob and vest sway, phase-offset from the wing bob */
    headGrp.position.y = Math.sin(t * 2.1 + 1.1) * 0.025
    vest.rotation.z = Math.sin(t * 2.1 + 1.6) * 0.05
  }

  return { group, update }
}
