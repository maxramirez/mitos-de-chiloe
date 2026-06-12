// EL BRUJO DE QUICAVÍ · world.js — the black forest of Quicaví.
// A fenced ~260×260 m night wood: noise ground, ~600 instanced trees, 14
// candidate page landmarks (6 pale marked trees · 4 standing stones · 4 ruined
// hut walls), a derelict rowboat at the south fence (the exit) and a distant
// shore-light beyond it. Each un-taken page also raises a thin vertical
// light-seam (additive plane, unfogged) readable over the canopy from afar
// but faded out within ~12 m — direction help that leaves close-up dread
// alone. Deterministic seeded layout (teleport coords are stable across
// runs); only WHICH 7 candidates carry pages varies per run (chosen by
// main). Collision is a static circle-obstacle grid; all queries are
// allocation-free.

import * as THREE from 'three'
import { getTextures } from './textures.js'

export const BOUND = 130 // fence half-size
export const WALK_BOUND = 126.5 // player clamp
export const SPAWN = { x: 0, z: 80 }
export const BOAT = { x: 0, z: -124 }

// ---------------- deterministic noise ---------------------------------------
function ihash(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h ^= h >> 16
  return (h >>> 0) / 4294967296
}

function vnoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const tx = x - xi
  const tz = z - zi
  const sx = tx * tx * (3 - 2 * tx)
  const sz = tz * tz * (3 - 2 * tz)
  const a = ihash(xi, zi)
  const b = ihash(xi + 1, zi)
  const c = ihash(xi, zi + 1)
  const d = ihash(xi + 1, zi + 1)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}

// PURE + deterministic: gentle rolling forest floor, ~ -1.4 … +1.9 m
export function terrainHeight(x, z) {
  return vnoise(x * 0.022 + 31.7, z * 0.022 + 11.3) * 2.6 + vnoise(x * 0.09 + 7.1, z * 0.09 + 3.3) * 0.7 - 1.4
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------- the 14 page candidates -------------------------------------
// kind: 'tree' | 'stone' | 'hut' — (nx, nz) is the outward page normal.
function normToOrigin(x, z) {
  const d = Math.sqrt(x * x + z * z) || 1
  return [-x / d, -z / d]
}

function buildCandidates() {
  const c = []
  const trees = [
    [-92, -58], [44, -92], [96, -18], [-34, -6], [-98, 52], [18, 58],
  ]
  for (let i = 0; i < trees.length; i++) {
    const [x, z] = trees[i]
    const [nx, nz] = normToOrigin(x, z)
    c.push({ x, z, nx, nz, kind: 'tree' })
  }
  const stones = [
    [94, 72], [-44, 96], [4, -58], [66, -64],
  ]
  for (let i = 0; i < stones.length; i++) {
    const [x, z] = stones[i]
    const [nx, nz] = normToOrigin(x, z)
    c.push({ x, z, nx, nz, kind: 'stone' })
  }
  // hut wall spots are filled in by addHut() so they match the geometry
  return c
}

export function createWorld(scene) {
  const rng = mulberry32(0x51c4a7)
  const group = new THREE.Group()
  scene.add(group)

  // boot-time procedural texture bundle (null members if canvas2d failed —
  // every use below is guarded, so the look degrades to flat colors)
  const T = getTextures()

  const candidates = buildCandidates()

  // ---------------- obstacles (static circle grid) --------------------------
  const obX = []
  const obZ = []
  const obR = []
  function addObstacle(x, z, r) {
    obX.push(x)
    obZ.push(z)
    obR.push(r)
  }

  // ---------------- lighting (the forest itself) ----------------------------
  const hemi = new THREE.HemisphereLight(0x1b2630, 0x05080a, 0.55)
  group.add(hemi)

  // ---------------- ground ---------------------------------------------------
  {
    const geo = new THREE.PlaneGeometry(290, 290, 96, 96)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    // the litter map averages ~0.81 of white — lift the vertex tones to keep
    // the established overall value (no lift when the texture is absent)
    const lift = T.ground ? 1.22 : 1
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = terrainHeight(x, z)
      pos.setY(i, h)
      const n = vnoise(x * 0.13 + 51, z * 0.13 + 17)
      const wet = Math.max(0, -h) * 0.18
      colors[i * 3] = (0.05 + n * 0.025 - wet * 0.4) * lift
      colors[i * 3 + 1] = (0.068 + n * 0.034 - wet * 0.3) * lift
      colors[i * 3 + 2] = (0.046 + n * 0.02) * lift
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
    if (T.ground) {
      mat.map = T.ground
      mat.bumpMap = T.ground // litter grain doubles as relief under the farol
      mat.bumpScale = 0.9
    }
    const ground = new THREE.Mesh(geo, mat)
    group.add(ground)
  }

  // ---------------- ruined huts (fill hut candidates) ------------------------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241e16, roughness: 1 })
  if (T.plank) {
    wallMat.map = T.plank
    wallMat.bumpMap = T.plank
    wallMat.bumpScale = 0.35
  }
  function addWall(x, z, len, alongX, h) {
    const geo = alongX ? new THREE.BoxGeometry(len, h, 0.32) : new THREE.BoxGeometry(0.32, h, len)
    const m = new THREE.Mesh(geo, wallMat)
    m.position.set(x, terrainHeight(x, z) + h / 2 - 0.15, z)
    m.rotation.y = (rng() - 0.5) * 0.04
    group.add(m)
    const steps = Math.ceil(len / 1.1)
    for (let i = 0; i <= steps; i++) {
      const t = -len / 2 + (len * i) / steps
      addObstacle(alongX ? x + t : x, alongX ? z : z + t, 0.75)
    }
  }
  function addHut(cx, cz, openSouth) {
    // back wall (full width) + two side walls; one long side open
    const backZ = openSouth ? cz - 2.6 : cz + 2.6
    addWall(cx, backZ, 6.6, true, 2.5)
    addWall(cx - 3.2, cz, 5.2, false, 2.2)
    addWall(cx + 3.2, cz, 5.2, false, 2.2)
    // two candidate page spots (wall centers; spawnPages offsets to the face)
    const bn = openSouth ? -1 : 1
    candidates.push({ x: cx, z: backZ, nx: 0, nz: bn, kind: 'hut' })
    candidates.push({ x: cx + 3.2, z: cz, nx: 1, nz: 0, kind: 'hut' })
  }
  addHut(-64, -42, false) // open to the south, back wall faces north
  addHut(52, 34, true) // open to the north, back wall faces south

  // ---------------- standing stones (4 candidates + 9 scatter) ---------------
  {
    const scatter = [
      [-12, 24], [78, 8], [-80, -8], [30, -30], [-58, 60], [108, -88], [-104, -96], [12, 104], [60, 88],
    ]
    const stoneGeo = new THREE.BoxGeometry(1.15, 2.7, 0.6)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.95 })
    if (T.rock) {
      stoneMat.map = T.rock
      stoneMat.bumpMap = T.rock
      stoneMat.bumpScale = 0.5
    }
    const all = []
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].kind === 'stone') all.push([candidates[i].x, candidates[i].z, Math.atan2(candidates[i].nx, candidates[i].nz)])
    }
    for (let i = 0; i < scatter.length; i++) all.push([scatter[i][0], scatter[i][1], rng() * Math.PI * 2])
    const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, all.length)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < all.length; i++) {
      const [x, z, ry] = all[i]
      dummy.position.set(x, terrainHeight(x, z) + 1.15, z)
      dummy.rotation.set((rng() - 0.5) * 0.1, ry, (rng() - 0.5) * 0.1)
      dummy.scale.set(0.9 + rng() * 0.4, 0.85 + rng() * 0.45, 1)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      addObstacle(x, z, 0.85)
    }
    group.add(inst)
  }

  // ---------------- marked trees (the 6 pale tree candidates) ----------------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.36, 0.52, 7.6, 7)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x57493a, roughness: 1 })
    if (T.bark) {
      trunkMat.map = T.bark
      trunkMat.bumpMap = T.bark // vertical fissures stretch gracefully
      trunkMat.bumpScale = 0.45
    }
    const crownGeo = new THREE.ConeGeometry(2.7, 7.2, 7)
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 1, flatShading: true })
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      if (c.kind !== 'tree') continue
      const h = terrainHeight(c.x, c.z)
      const trunk = new THREE.Mesh(trunkGeo, trunkMat)
      trunk.position.set(c.x, h + 3.6, c.z)
      trunk.rotation.y = rng() * Math.PI
      group.add(trunk)
      const crown = new THREE.Mesh(crownGeo, crownMat)
      crown.position.set(c.x, h + 9.6, c.z)
      crown.rotation.y = rng() * Math.PI
      group.add(crown)
      addObstacle(c.x, c.z, 0.6)
    }
  }

  // ---------------- the forest (instanced) -----------------------------------
  {
    const N = 600
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.3, 4.2, 5)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x17120d, roughness: 1 })
    if (T.bark) {
      trunkMat.map = T.bark
      trunkMat.bumpMap = T.bark // near-black tint; the bump is what the farol reads
      trunkMat.bumpScale = 0.4
    }
    const crownGeo = new THREE.ConeGeometry(2.1, 6.6, 6)
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x0b110d, roughness: 1, flatShading: true })
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N)
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, N)
    const dummy = new THREE.Object3D()
    let placed = 0
    let guard = 0
    while (placed < N && guard < N * 30) {
      guard++
      const x = (rng() * 2 - 1) * 123
      const z = (rng() * 2 - 1) * 123
      // keep clearings: spawn, boat lane, candidates, hut interiors
      const dsx = x - SPAWN.x
      const dsz = z - SPAWN.z
      if (dsx * dsx + dsz * dsz < 64) continue
      const dbx = x - BOAT.x
      const dbz = z - BOAT.z
      if (dbx * dbx + dbz * dbz < 100) continue
      let near = false
      for (let i = 0; i < candidates.length; i++) {
        const dx = x - candidates[i].x
        const dz = z - candidates[i].z
        if (dx * dx + dz * dz < 16) {
          near = true
          break
        }
      }
      if (near) continue
      if (Math.abs(x - -64) < 5.5 && Math.abs(z - -42) < 5) continue
      if (Math.abs(x - 52) < 5.5 && Math.abs(z - 34) < 5) continue
      const h = terrainHeight(x, z)
      const s = 0.8 + rng() * 0.7
      dummy.position.set(x, h + 2.1 * s, z)
      dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.05)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      trunks.setMatrixAt(placed, dummy.matrix)
      dummy.position.y = h + (4.2 * s - 1) + 3.3 * s
      dummy.updateMatrix()
      crowns.setMatrixAt(placed, dummy.matrix)
      addObstacle(x, z, 0.42 * s)
      placed++
    }
    trunks.count = placed
    crowns.count = placed
    group.add(trunks)
    group.add(crowns)
  }

  // ---------------- fence ----------------------------------------------------
  {
    const postGeo = new THREE.BoxGeometry(0.16, 1.8, 0.16)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a150e, roughness: 1 })
    if (T.bark) {
      postMat.map = T.bark
      postMat.bumpMap = T.bark
      postMat.bumpScale = 0.3
    }
    const per = []
    for (let v = -BOUND; v <= BOUND; v += 6) {
      per.push([v, -BOUND], [v, BOUND], [-BOUND, v], [BOUND, v])
    }
    const posts = new THREE.InstancedMesh(postGeo, postMat, per.length)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < per.length; i++) {
      const [x, z] = per[i]
      dummy.position.set(x, terrainHeight(x, z) + 0.8, z)
      dummy.rotation.set((ihash(i, 7) - 0.5) * 0.12, 0, (ihash(i, 13) - 0.5) * 0.12)
      dummy.updateMatrix()
      posts.setMatrixAt(i, dummy.matrix)
    }
    group.add(posts)
    const railGeo = new THREE.BoxGeometry(2 * BOUND, 0.07, 0.07)
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 2; r++) {
        const rail = new THREE.Mesh(railGeo, postMat)
        const y = 0.55 + r * 0.6
        if (s === 0) rail.position.set(0, y, -BOUND)
        else if (s === 1) rail.position.set(0, y, BOUND)
        else {
          rail.rotation.y = Math.PI / 2
          rail.position.set(s === 2 ? -BOUND : BOUND, y, 0)
        }
        group.add(rail)
      }
    }
  }

  // ---------------- the rowboat (EXIT) ---------------------------------------
  const boatGroup = new THREE.Group()
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x1f1812, roughness: 1 })
    if (T.plank) {
      wood.map = T.plank
      wood.bumpMap = T.plank
      wood.bumpScale = 0.3
    }
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 4.4), wood)
    hull.position.y = 0.3
    boatGroup.add(hull)
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 4.4), wood)
    rimL.position.set(-0.78, 0.62, 0)
    boatGroup.add(rimL)
    const rimR = rimL.clone()
    rimR.position.x = 0.78
    boatGroup.add(rimR)
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 0.16), wood)
    bow.position.set(0, 0.62, -2.12)
    boatGroup.add(bow)
    const stern = bow.clone()
    stern.position.z = 2.12
    boatGroup.add(stern)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.42), wood)
    bench.position.set(0, 0.5, 0.6)
    boatGroup.add(bench)
    boatGroup.position.set(BOAT.x, terrainHeight(BOAT.x, BOAT.z) + 0.05, BOAT.z)
    boatGroup.rotation.set(0.04, 0.12, 0.05)
    group.add(boatGroup)
    addObstacle(BOAT.x, BOAT.z - 1.4, 1.0)
    addObstacle(BOAT.x, BOAT.z, 1.0)
    addObstacle(BOAT.x, BOAT.z + 1.4, 1.0)
  }
  // boat beacon (lit at 7/7)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x32352c, roughness: 0.8, emissive: 0x000000 })
  const beaconLight = new THREE.PointLight(0x9fffd0, 0, 11, 1.8)
  {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 5), wallMat)
    post.position.set(0.6, 1.1, 1.9)
    boatGroup.add(post)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lampMat)
    lamp.position.set(0.6, 1.74, 1.9)
    boatGroup.add(lamp)
    beaconLight.position.set(0.6, 1.8, 1.9)
    boatGroup.add(beaconLight)
  }
  let beaconOn = false
  function setBeacon(on) {
    beaconOn = !!on
    lampMat.emissive.setHex(beaconOn ? 0x9fffd0 : 0x000000)
    lampMat.emissiveIntensity = beaconOn ? 1.6 : 0
    beaconLight.intensity = beaconOn ? 13 : 0
  }

  // ---------------- the distant shore-light ----------------------------------
  const shoreCore = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd8ecff, fog: false })
  )
  shoreCore.position.set(0, 26, -560)
  group.add(shoreCore)
  const shoreHaloMat = new THREE.MeshBasicMaterial({
    color: 0x9fc8e8,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const shoreHalo = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 8), shoreHaloMat)
  shoreHalo.position.copy(shoreCore.position)
  group.add(shoreHalo)

  // ---------------- glow texture (shared, procedural) ------------------------
  let glowTex = null
  try {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const c2 = cv.getContext('2d')
    const grad = c2.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    c2.fillStyle = grad
    c2.fillRect(0, 0, 64, 64)
    glowTex = new THREE.CanvasTexture(cv)
  } catch (e) {
    glowTex = null
  }

  // ---------------- ground fog sprites ---------------------------------------
  const fogSprites = []
  if (glowTex) {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x16242a,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const s = new THREE.Sprite(m)
      const x = (rng() * 2 - 1) * 110
      const z = (rng() * 2 - 1) * 110
      s.position.set(x, terrainHeight(x, z) + 2.6, z)
      s.scale.set(34 + rng() * 30, 9 + rng() * 5, 1)
      group.add(s)
      fogSprites.push({ s, bx: x, ph: rng() * Math.PI * 2, sp: 0.05 + rng() * 0.05 })
    }
  }

  // ---------------- pages -----------------------------------------------------
  const pageGeo = new THREE.PlaneGeometry(0.3, 0.42)
  const pages = []
  // one shared skin-parchment material: procedural sigil canvas immediately,
  // silently upgraded by the painted /assets/quicavi/page.png if it loads.
  // emissiveMap = the same parchment, so the ink markings stay legible in the
  // page's faint self-glow (and the dark torn edges do not glow).
  const pageEmissive = T.parchment ? 0.52 : 0.42 // pulse base — see update()
  const pageMat = new THREE.MeshStandardMaterial({
    color: T.parchment ? 0xffffff : 0xe8dcc0,
    emissive: 0x9a8c60,
    emissiveIntensity: pageEmissive,
    roughness: 0.9,
    side: THREE.DoubleSide,
  })
  if (T.parchment) {
    pageMat.map = T.parchment
    pageMat.emissiveMap = T.parchment
  }
  try {
    new THREE.TextureLoader().load('../assets/quicavi/page.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      pageMat.map = t
      pageMat.emissiveMap = t
      pageMat.needsUpdate = true
    })
  } catch (e) {
    /* keep the procedural parchment */
  }
  // light-seams — one thin vertical additive plane (NOT a light) standing
  // over each un-taken page: tall enough to read over the canopy from ~70 m
  // (fog: false), faded out by update() within ~12 m so the close-up dread
  // is untouched. Yaw-billboarded toward the player each frame.
  const seamGeo = new THREE.PlaneGeometry(0.85, 46)
  let seamsLive = 0
  function spawnPages(indices) {
    for (let k = 0; k < indices.length; k++) {
      const c = candidates[indices[k]]
      const off = c.kind === 'tree' ? 0.56 : c.kind === 'stone' ? 0.36 : 0.2
      const px = c.x + c.nx * off
      const pz = c.z + c.nz * off
      const py = terrainHeight(c.x, c.z) + 1.5
      const mesh = new THREE.Mesh(pageGeo, pageMat)
      mesh.position.set(px, py, pz)
      mesh.rotation.y = Math.atan2(c.nx, c.nz)
      mesh.rotation.z = (Math.random() - 0.5) * 0.16
      group.add(mesh)
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 4), wallMat)
      nail.position.set(px + c.nx * 0.01, py + 0.17, pz + c.nz * 0.01)
      nail.rotation.x = Math.PI / 2
      nail.rotation.z = Math.atan2(c.nx, c.nz)
      group.add(nail)
      let glow = null
      if (glowTex) {
        const gm = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xfff2c8,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        glow = new THREE.Sprite(gm)
        glow.position.set(px + c.nx * 0.2, py, pz + c.nz * 0.2)
        glow.scale.set(2.4, 2.4, 1)
        group.add(glow)
      }
      const seamMat = new THREE.MeshBasicMaterial({
        color: 0xfff2c8,
        transparent: true,
        opacity: 0, // distance-driven — see update()
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false, // the whole point: it must carry past the fog wall
        side: THREE.DoubleSide,
      })
      if (glowTex) seamMat.map = glowTex // soft vertical streak, not a hard bar
      const seam = new THREE.Mesh(seamGeo, seamMat)
      seam.position.set(px, py + 21, pz)
      group.add(seam)
      seamsLive++
      pages.push({ x: px, z: pz, y: py, taken: false, mesh, nail, glow, seam, seamMat, tilt: mesh.rotation.z, cand: indices[k] })
    }
  }
  function collectPage(i) {
    const p = pages[i]
    if (p.taken) return
    p.taken = true
    p.mesh.visible = false
    p.nail.visible = false
    if (p.glow) p.glow.visible = false
    if (p.seam) {
      p.seam.visible = false
      seamsLive--
    }
  }
  function seamCount() {
    return seamsLive
  }

  // ---------------- obstacle grid ---------------------------------------------
  const CELL = 8
  const GN = Math.ceil((2 * BOUND) / CELL) + 1
  const cells = new Array(GN * GN)
  for (let i = 0; i < obX.length; i++) {
    const gx = Math.floor((obX[i] + BOUND) / CELL)
    const gz = Math.floor((obZ[i] + BOUND) / CELL)
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let az = gz - 1; az <= gz + 1; az++) {
        if (ax < 0 || az < 0 || ax >= GN || az >= GN) continue
        const ci = ax * GN + az
        if (!cells[ci]) cells[ci] = []
        cells[ci].push(i)
      }
    }
  }
  function isWalkable(x, z, r) {
    const rad = r === undefined ? 0.35 : r
    if (x < -WALK_BOUND || x > WALK_BOUND || z < -WALK_BOUND || z > WALK_BOUND) return false
    const gx = Math.floor((x + BOUND) / CELL)
    const gz = Math.floor((z + BOUND) / CELL)
    if (gx < 0 || gz < 0 || gx >= GN || gz >= GN) return false
    const list = cells[gx * GN + gz]
    if (!list) return true
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      const dx = x - obX[o]
      const dz = z - obZ[o]
      const rr = obR[o] + rad
      if (dx * dx + dz * dz < rr * rr) return false
    }
    return true
  }

  // ---------------- per-frame breathing (allocation-free) ---------------------
  // (px, pz) — player position, drives the seam distance fade + billboard
  function update(dt, t, px, pz) {
    if (px === undefined) {
      px = SPAWN.x
      pz = SPAWN.z
    }
    for (let i = 0; i < fogSprites.length; i++) {
      const f = fogSprites[i]
      f.s.position.x = f.bx + Math.sin(t * f.sp + f.ph) * 7
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      if (p.taken) continue
      // paper breathing on its nail — a faint flutter, never a flap
      p.mesh.rotation.z = p.tilt + Math.sin(t * 1.6 + i * 2.3) * 0.05
      if (p.glow) p.glow.material.opacity = 0.18 + 0.07 * Math.sin(t * 1.9 + i * 1.7)
      if (p.seam) {
        const dx = px - p.x
        const dz = pz - p.z
        const d = Math.sqrt(dx * dx + dz * dz)
        let k = (d - 4) / 9 // gone by ~4 m, full strength from ~13 m out
        if (k < 0) k = 0
        else if (k > 1) k = 1
        p.seam.rotation.y = Math.atan2(dx, dz) // face the player, edge never seen
        p.seamMat.opacity = k * (0.24 + 0.05 * Math.sin(t * 1.3 + i * 1.7))
      }
    }
    // the parchment pulse — brighter breathing so un-taken pages read farther
    pageMat.emissiveIntensity = pageEmissive + 0.3 + 0.24 * Math.sin(t * 2.1)
    shoreHaloMat.opacity = (beaconOn ? 0.3 : 0.18) + 0.05 * Math.sin(t * 0.8)
    if (beaconOn) beaconLight.intensity = 12 + Math.sin(t * 7.3) * 2.5
  }

  return {
    group,
    candidates,
    pages,
    spawnPages,
    collectPage,
    seamCount,
    setBeacon,
    isWalkable,
    update,
  }
}
