import * as THREE from 'three'

/* ------------------------------------------------------------------ */
/*  Deterministic seeded value noise + fBm (pure, no Math.random)      */
/* ------------------------------------------------------------------ */

const SEED = 0x5eedc1e

function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ SEED) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth01(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}

function vnoise(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, z, octaves) {
  let sum = 0
  let amp = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x, z)
    norm += amp
    amp *= 0.5
    const nx = x * 2.03 + 19.19
    z = z * 2.03 - 7.77
    x = nx
  }
  return sum / norm
}

/* ------------------------------------------------------------------ */
/*  terrainHeight — single source of truth for physics AND visuals     */
/* ------------------------------------------------------------------ */

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z)
  // Irregular coastline: base radius modulated by very low-frequency noise
  const coastR = 182 + (fbm(x * 0.004 + 31.7, z * 0.004 - 17.3, 3) - 0.5) * 18
  const d = coastR - r // signed distance inland (m)
  const s = smooth01((d + 60) / 180) // 0 offshore -> 1 deep inland
  const seaFloor = -6 + (fbm(x * 0.02 + 5.3, z * 0.02 + 8.9, 2) - 0.5) * 2.4
  const hills = (fbm(x * 0.012 + 2.1, z * 0.012 - 4.6, 4) - 0.5) * 8
  const ridges = (fbm(x * 0.035 - 9.4, z * 0.035 + 3.2, 3) - 0.5) * 4
  const land = 34 + hills + ridges
  return seaFloor + (land - seaFloor) * s
}

function slopeAt(x, z) {
  const e = 2
  const h0 = terrainHeight(x, z)
  const dx = terrainHeight(x + e, z) - h0
  const dz = terrainHeight(x, z + e) - h0
  return Math.hypot(dx, dz) / e
}

/* ------------------------------------------------------------------ */
/*  Seeded RNG for scatter placement                                   */
/* ------------------------------------------------------------------ */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/*  createTerrain                                                      */
/* ------------------------------------------------------------------ */

const C_SILT = new THREE.Color(0x21201c) // deep underwater silt
const C_WETSAND = new THREE.Color(0x423f36) // wet sand at the waterline — greyed
const C_SAND = new THREE.Color(0x5e5a4e) // dry sand — slightly grey
const C_GRASS = new THREE.Color(0x28342a) // coastal grass — desaturated, colder
const C_MOSS = new THREE.Color(0x1a2621) // wetter moss — desaturated, colder
const C_ROCK = new THREE.Color(0x575b60) // grey rock, high ground
const C_ROCKDK = new THREE.Color(0x383d44) // dark rock on steep faces

export function createTerrain() {
  const group = new THREE.Group()

  /* ---- island mesh, sampled straight from terrainHeight ---- */
  const SIZE = 1000
  const SEG = 200
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const col = new THREE.Color()
  const grassMix = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)

    const sl = slopeAt(x, z)
    const n = fbm(x * 0.03 + 53.1, z * 0.03 - 41.7, 2) // moss/grass patchiness

    if (h < 1.6) {
      if (h < 0.45) {
        col.lerpColors(C_SILT, C_WETSAND, clamp((h + 5.5) / 5.95, 0, 1))
      } else {
        col.lerpColors(C_WETSAND, C_SAND, clamp((h - 0.45) / 1.15, 0, 1))
      }
    } else {
      grassMix.lerpColors(C_GRASS, C_MOSS, smooth01(n * 1.4 - 0.2))
      if (h < 3.6) {
        col.lerpColors(C_SAND, grassMix, smooth01((h - 1.6) / 2.0))
      } else {
        col.copy(grassMix).lerp(C_ROCK, smooth01((h - 15) / 11))
      }
    }
    // steep faces read as bare dark rock
    col.lerp(C_ROCKDK, smooth01((sl - 0.5) / 0.55) * 0.85)
    // tiny per-vertex dither so big facets never band
    const dth = 0.93 + 0.14 * hash2(i, 1 + ((i * 7) | 0))
    colors[i * 3] = col.r * dth
    colors[i * 3 + 1] = col.g * dth
    colors[i * 3 + 2] = col.b * dth
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.96,
      metalness: 0.0,
    })
  )
  ground.receiveShadow = true
  group.add(ground)

  /* ---- cypress-like trees: tall narrow cones + trunks ---- */
  const MAX_TREES = 500
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.17, 1, 5)
  trunkGeo.translate(0, 0.5, 0)
  const crownGeo = new THREE.ConeGeometry(1, 1, 6)
  crownGeo.translate(0, 0.5, 0)

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x241b14,
    flatShading: true,
    roughness: 1,
  })
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // tinted per-instance
    flatShading: true,
    roughness: 0.95,
  })

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREES)
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, MAX_TREES)
  trunks.castShadow = true
  crowns.castShadow = true

  const rng = mulberry32(987654321)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const eul = new THREE.Euler()
  const p = new THREE.Vector3()
  const sc = new THREE.Vector3()
  const tint = new THREE.Color()

  // keep sightlines open at the player spawn and at each being's clearing
  const CLEARINGS = [
    [0, -150, 16],
    [30, -170, 12],
    [120, 60, 10],
    [-40, 115, 12],
    [-30, -35, 14],
    [140, 140, 12],
    [-180, 20, 12],
  ]

  let placed = 0
  for (let i = 0; i < 9000 && placed < MAX_TREES; i++) {
    const a = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * 200
    const x = Math.cos(a) * rad
    const z = Math.sin(a) * rad
    const h = terrainHeight(x, z)
    if (h <= 2 || h >= 22) continue
    if (slopeAt(x, z) > 0.42) continue
    let inClearing = false
    for (let c = 0; c < CLEARINGS.length; c++) {
      const dx = x - CLEARINGS[c][0]
      const dz = z - CLEARINGS[c][1]
      if (dx * dx + dz * dz < CLEARINGS[c][2] * CLEARINGS[c][2]) {
        inClearing = true
        break
      }
    }
    if (inClearing) continue
    // clump into groves rather than even sprinkle
    const grove = fbm(x * 0.01 + 77.7, z * 0.01 - 33.3, 2)
    if (rng() > grove * 1.45) continue

    const yaw = rng() * Math.PI * 2
    const tiltX = (rng() - 0.5) * 0.09
    const tiltZ = (rng() - 0.5) * 0.09
    const s = 0.7 + rng() * 0.8
    const trunkH = (1.1 + rng() * 0.7) * s
    const crownH = (5.2 + rng() * 4.2) * s
    const crownW = crownH * (0.15 + rng() * 0.07)

    eul.set(tiltX, yaw, tiltZ)
    q.setFromEuler(eul)

    p.set(x, h - 0.15, z)
    sc.set(s, trunkH, s)
    m.compose(p, q, sc)
    trunks.setMatrixAt(placed, m)

    p.set(x, h + trunkH - 0.3, z)
    sc.set(crownW, crownH, crownW)
    m.compose(p, q, sc)
    crowns.setMatrixAt(placed, m)

    tint.setHSL(0.38 + rng() * 0.06, 0.2 + rng() * 0.11, 0.08 + rng() * 0.06)
    crowns.setColorAt(placed, tint)
    placed++
  }
  trunks.count = placed
  crowns.count = placed
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true
  group.add(trunks)
  group.add(crowns)

  /* ---- scattered boulders ---- */
  const MAX_ROCKS = 26
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x474b52,
    flatShading: true,
    roughness: 0.9,
  })
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, MAX_ROCKS)
  rocks.castShadow = true
  let rPlaced = 0
  for (let i = 0; i < 600 && rPlaced < MAX_ROCKS; i++) {
    const a = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * 205
    const x = Math.cos(a) * rad
    const z = Math.sin(a) * rad
    const h = terrainHeight(x, z)
    if (h < -0.6 || h > 26) continue
    const s = 0.6 + rng() * 2.0
    eul.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI)
    q.setFromEuler(eul)
    p.set(x, h + s * 0.18, z)
    sc.set(s * (0.8 + rng() * 0.5), s * (0.55 + rng() * 0.45), s * (0.8 + rng() * 0.5))
    m.compose(p, q, sc)
    rocks.setMatrixAt(rPlaced, m)
    rPlaced++
  }
  rocks.count = rPlaced
  rocks.instanceMatrix.needsUpdate = true
  group.add(rocks)

  /* ---- ~18 seeded dead trees: bare leaning trunks + skeletal branches ---- */
  const DEAD_TREES = 18
  const deadTrunkGeo = new THREE.CylinderGeometry(0.08, 0.26, 1, 5)
  deadTrunkGeo.translate(0, 0.5, 0)
  const deadBranchGeo = new THREE.CylinderGeometry(0.025, 0.08, 1, 4)
  deadBranchGeo.translate(0, 0.5, 0)
  const deadMat = new THREE.MeshStandardMaterial({
    color: 0x0d0c0b, // near-black bark
    flatShading: true,
    roughness: 1,
  })
  const deadTrunks = new THREE.InstancedMesh(deadTrunkGeo, deadMat, DEAD_TREES)
  const deadBranches = new THREE.InstancedMesh(deadBranchGeo, deadMat, DEAD_TREES * 3)
  deadTrunks.castShadow = true
  deadBranches.castShadow = true

  const dRng = mulberry32(246813579)
  const up = new THREE.Vector3()
  const bp = new THREE.Vector3()
  let dPlaced = 0
  let bPlaced = 0
  for (let i = 0; i < 4000 && dPlaced < DEAD_TREES; i++) {
    const a = dRng() * Math.PI * 2
    const rad = Math.sqrt(dRng()) * 200
    const x = Math.cos(a) * rad
    const z = Math.sin(a) * rad
    const h = terrainHeight(x, z)
    if (h <= 2 || h >= 24) continue
    if (slopeAt(x, z) > 0.45) continue
    let inClearing = false
    for (let c = 0; c < CLEARINGS.length; c++) {
      const dx = x - CLEARINGS[c][0]
      const dz = z - CLEARINGS[c][1]
      if (dx * dx + dz * dz < CLEARINGS[c][2] * CLEARINGS[c][2]) {
        inClearing = true
        break
      }
    }
    if (inClearing) continue

    const yaw = dRng() * Math.PI * 2
    const leanX = (dRng() - 0.5) * 0.3 // slight lean
    const leanZ = (dRng() - 0.5) * 0.3
    const s = 0.8 + dRng() * 0.6
    const trunkH = 3.5 + dRng() * 3.0

    eul.set(leanX, yaw, leanZ, 'XYZ')
    q.setFromEuler(eul)
    p.set(x, h - 0.15, z)
    sc.set(s, trunkH, s)
    m.compose(p, q, sc)
    deadTrunks.setMatrixAt(dPlaced, m)

    // 2–3 bare branches along the leaned trunk axis
    up.set(0, 1, 0).applyQuaternion(q)
    const nb = 2 + (dRng() < 0.5 ? 0 : 1)
    for (let b = 0; b < nb; b++) {
      const frac = 0.45 + dRng() * 0.4
      bp.copy(p).addScaledVector(up, frac * trunkH)
      eul.set(0.9 + dRng() * 0.6, dRng() * Math.PI * 2, 0, 'YXZ')
      q.setFromEuler(eul)
      const bl = 1.0 + dRng() * 1.3
      const bs = 0.7 + dRng() * 0.5
      sc.set(bs, bl, bs)
      m.compose(bp, q, sc)
      deadBranches.setMatrixAt(bPlaced, m)
      bPlaced++
    }
    dPlaced++
  }
  deadTrunks.count = dPlaced
  deadBranches.count = bPlaced
  deadTrunks.instanceMatrix.needsUpdate = true
  deadBranches.instanceMatrix.needsUpdate = true
  group.add(deadTrunks)
  group.add(deadBranches)

  return group
}
