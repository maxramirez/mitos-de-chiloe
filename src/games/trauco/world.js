// world.js — EL TRAUCO · the foggy clearing-ring (~120 m across).
// Deterministic value-noise heightfield, instanced cypress + dead trees,
// 7 quilineja vines, the exit gate (two leaning trunks under a wisp),
// moon + fog + environment lights. Also owns the 2D collision / line-of-sight
// queries against tree trunks (allocation-free: shared result object).
import * as THREE from 'three'

// ---------- deterministic value noise ----------
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function smooth(t) {
  return t * t * (3 - 2 * t)
}
function vnoise(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

// pure & shared by visuals, walking and AI
export function terrainHeight(x, z) {
  return (
    vnoise(x * 0.024 + 13.7, z * 0.024 + 7.3) * 3.0 +
    vnoise(x * 0.085 + 91.2, z * 0.085 + 45.8) * 0.8 -
    1.9
  )
}

function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export function buildWorld(scene, rng) {
  const PLAY_R = 60.5
  const GATE_R = 58

  scene.background = new THREE.Color(0x050a10)
  scene.fog = new THREE.FogExp2(0x050a10, 0.034)

  // ---------- environment light ----------
  const hemi = new THREE.HemisphereLight(0x2a3a46, 0x04060a, 0.3)
  scene.add(hemi)
  const moonDir = new THREE.DirectionalLight(0x93b8d8, 0.38)
  moonDir.position.set(60, 90, -40)
  scene.add(moonDir)

  // ---------- the moon ----------
  const glowTex = makeGlowTexture()
  const moonMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xdce8f5, fog: false, transparent: true, opacity: 0.9, depthWrite: false,
  })
  const moon = new THREE.Sprite(moonMat)
  moon.position.set(120, 100, -80)
  moon.scale.set(22, 22, 1)
  scene.add(moon)
  const haloMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9db8d0, fog: false, transparent: true, opacity: 0.1, depthWrite: false,
  })
  const halo = new THREE.Sprite(haloMat)
  halo.position.copy(moon.position)
  halo.scale.set(85, 85, 1)
  scene.add(halo)

  // ---------- layout: gate, vines, waypoints ----------
  const gateAng = rng() * Math.PI * 2
  const gate = { x: Math.sin(gateAng) * GATE_R, z: Math.cos(gateAng) * GATE_R }

  const vines = []
  for (let i = 0; i < 7; i++) {
    const a = gateAng + 0.55 + ((i + 0.5) * (Math.PI * 2 - 1.1)) / 7 + (rng() - 0.5) * 0.3
    const r = 21 + rng() * 33
    vines.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, taken: false })
  }

  const waypoints = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const r = 15 + rng() * 36
    waypoints.push({ x: Math.sin(a) * r, z: Math.cos(a) * r })
  }

  // ---------- tree placement ----------
  const treeX = []
  const treeZ = []
  const treeR = []
  const treeDead = []
  const treeH = []
  let guard = 0
  while (treeX.length < 200 && guard++ < 8000) {
    const a = rng() * Math.PI * 2
    const r = 14 + rng() * 47
    const x = Math.sin(a) * r
    const z = Math.cos(a) * r
    const dxg = x - gate.x
    const dzg = z - gate.z
    if (dxg * dxg + dzg * dzg < 56) continue // gate corridor stays clear
    let ok = true
    for (let i = 0; i < vines.length && ok; i++) {
      const dx = x - vines[i].x
      const dz = z - vines[i].z
      if (dx * dx + dz * dz < 6.8) ok = false
    }
    for (let i = 0; i < treeX.length && ok; i++) {
      const dx = x - treeX[i]
      const dz = z - treeZ[i]
      if (dx * dx + dz * dz < 7.3) ok = false
    }
    if (!ok) continue
    const dead = rng() < 0.27
    treeX.push(x)
    treeZ.push(z)
    treeR.push(dead ? 0.26 + rng() * 0.1 : 0.3 + rng() * 0.14)
    treeDead.push(dead)
    treeH.push(dead ? 7.5 + rng() * 3.5 : 6.5 + rng() * 3.5)
  }

  // visual-only wall of forest closing the ring
  const wallX = []
  const wallZ = []
  const wallH = []
  const wallDead = []
  guard = 0
  while (wallX.length < 150 && guard++ < 3000) {
    const a = rng() * Math.PI * 2
    const r = 62 + rng() * 15
    const x = Math.sin(a) * r
    const z = Math.cos(a) * r
    const dxg = x - gate.x
    const dzg = z - gate.z
    if (dxg * dxg + dzg * dzg < 30) continue // the gate mouth stays open
    wallX.push(x)
    wallZ.push(z)
    wallH.push(8 + rng() * 4)
    wallDead.push(rng() < 0.15)
  }

  // ---------- ground ----------
  const groundGeo = new THREE.PlaneGeometry(260, 260, 100, 100)
  groundGeo.rotateX(-Math.PI / 2)
  const gPos = groundGeo.attributes.position
  const gCol = new Float32Array(gPos.count * 3)
  for (let i = 0; i < gPos.count; i++) {
    const x = gPos.getX(i)
    const z = gPos.getZ(i)
    gPos.setY(i, terrainHeight(x, z))
    const m = vnoise(x * 0.11 + 31.7, z * 0.11 + 8.2)
    const p = vnoise(x * 0.045 + 77.7, z * 0.045 + 21.2)
    gCol[i * 3] = 0.03 + 0.03 * p + 0.012 * m
    gCol[i * 3 + 1] = 0.045 + 0.038 * (1 - p) + 0.015 * m
    gCol[i * 3 + 2] = 0.03 + 0.02 * (1 - p)
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3))
  groundGeo.computeVertexNormals()
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  )
  scene.add(ground)

  // ---------- instanced forest ----------
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()

  const nPlay = treeX.length
  const nWall = wallX.length
  let cypCount = 0
  let deadCount = 0
  for (let i = 0; i < nPlay; i++) (treeDead[i] ? deadCount++ : cypCount++)
  for (let i = 0; i < nWall; i++) (wallDead[i] ? deadCount++ : cypCount++)

  const trunkGeo = new THREE.CylinderGeometry(0.55, 0.75, 1, 7)
  trunkGeo.translate(0, 0.5, 0)
  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, nPlay + nWall)
  trunks.frustumCulled = false

  const folGeo = new THREE.ConeGeometry(1, 1, 7)
  folGeo.translate(0, 0.5, 0)
  const folMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const foliage = new THREE.InstancedMesh(folGeo, folMat, cypCount * 2)
  foliage.frustumCulled = false

  const brGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 5)
  brGeo.translate(0, 0.5, 0)
  const branches = new THREE.InstancedMesh(brGeo, barkMat, deadCount * 3)
  branches.frustumCulled = false

  let ti = 0
  let fi = 0
  let bi = 0
  function addTree(x, z, h, dead, rTrunk) {
    const gy = terrainHeight(x, z)
    const s = rTrunk / 0.65
    dummy.position.set(x, gy - 0.3, z)
    dummy.rotation.set(0, rng() * Math.PI * 2, dead ? (rng() - 0.5) * 0.16 : (rng() - 0.5) * 0.05)
    dummy.scale.set(s, h, s)
    dummy.updateMatrix()
    trunks.setMatrixAt(ti, dummy.matrix)
    tint.setHex(dead ? 0x4d4842 : 0x3c2f23)
    tint.multiplyScalar(0.8 + rng() * 0.4)
    trunks.setColorAt(ti, tint)
    ti++
    if (!dead) {
      // two stacked cones of dark cypress foliage
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.position.set(x, gy + h * 0.18, z)
      dummy.scale.set(h * 0.3, h * 0.78, h * 0.3)
      dummy.updateMatrix()
      foliage.setMatrixAt(fi, dummy.matrix)
      tint.setHex(0x14241c).multiplyScalar(0.7 + rng() * 0.55)
      foliage.setColorAt(fi, tint)
      fi++
      dummy.position.set(x, gy + h * 0.62, z)
      dummy.scale.set(h * 0.17, h * 0.46, h * 0.17)
      dummy.updateMatrix()
      foliage.setMatrixAt(fi, dummy.matrix)
      tint.setHex(0x18291f).multiplyScalar(0.7 + rng() * 0.55)
      foliage.setColorAt(fi, tint)
      fi++
    } else {
      for (let k = 0; k < 3; k++) {
        dummy.position.set(x, gy + h * (0.45 + 0.16 * k), z)
        dummy.rotation.set(0, rng() * Math.PI * 2, 0.95 + rng() * 0.45)
        const len = 1.1 + rng() * 1.3
        dummy.scale.set(1, len, 1)
        dummy.updateMatrix()
        branches.setMatrixAt(bi, dummy.matrix)
        tint.setHex(0x47423c).multiplyScalar(0.8 + rng() * 0.3)
        branches.setColorAt(bi, tint)
        bi++
      }
    }
  }
  for (let i = 0; i < nPlay; i++) addTree(treeX[i], treeZ[i], treeH[i], treeDead[i], treeR[i])
  for (let i = 0; i < nWall; i++) addTree(wallX[i], wallZ[i], wallH[i], wallDead[i], 0.34)
  scene.add(trunks)
  scene.add(foliage)
  scene.add(branches)

  // ---------- the gate: two leaning trunks + wisp ----------
  const gateGrp = new THREE.Group()
  gateGrp.position.set(gate.x, terrainHeight(gate.x, gate.z), gate.z)
  gateGrp.rotation.y = gateAng
  const gateWood = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1, flatShading: true })
  const gateTrunkGeo = new THREE.CylinderGeometry(0.26, 0.4, 9, 7)
  gateTrunkGeo.translate(0, 4.5, 0)
  const gtL = new THREE.Mesh(gateTrunkGeo, gateWood)
  gtL.position.set(-1.9, -0.2, 0)
  gtL.rotation.z = -0.32
  gateGrp.add(gtL)
  const gtR = new THREE.Mesh(gateTrunkGeo, gateWood)
  gtR.position.set(1.9, -0.2, 0)
  gtR.rotation.z = 0.32
  gateGrp.add(gtR)

  const wispGrp = new THREE.Group()
  wispGrp.position.set(0, 5.2, 0)
  const wispMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xcfffe4, fog: false, transparent: true, opacity: 0.75, depthWrite: false,
  })
  const wispSprite = new THREE.Sprite(wispMat)
  wispSprite.scale.set(3.2, 3.2, 1)
  wispGrp.add(wispSprite)
  const wispLight = new THREE.PointLight(0xbfffd9, 13, 30, 1.8)
  wispGrp.add(wispLight)
  gateGrp.add(wispGrp)
  scene.add(gateGrp)

  // ---------- the quilineja ----------
  const vinePts = []
  for (let k = 0; k <= 40; k++) {
    const u = k / 40
    const a = u * Math.PI * 2 * 2.6
    vinePts.push(new THREE.Vector3(Math.cos(a) * 0.34, 0.12 + u * 1.25, Math.sin(a) * 0.34))
  }
  const vineCurve = new THREE.CatmullRomCurve3(vinePts)
  const vineGeo = new THREE.TubeGeometry(vineCurve, 64, 0.035, 5, false)
  const vineMat = new THREE.MeshStandardMaterial({
    color: 0x254434, emissive: 0x9fffd0, emissiveIntensity: 1.6, roughness: 0.6,
  })
  const stumpGeo = new THREE.CylinderGeometry(0.2, 0.27, 1.4, 7)
  stumpGeo.translate(0, 0.7, 0)
  const stumpMat = new THREE.MeshStandardMaterial({ color: 0x3a332a, roughness: 1, flatShading: true })
  const vineSpriteMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fffd0, transparent: true, opacity: 0.45, depthWrite: false,
  })
  const vineGroups = []
  for (let i = 0; i < vines.length; i++) {
    const v = vines[i]
    const g = new THREE.Group()
    g.position.set(v.x, terrainHeight(v.x, v.z), v.z)
    g.rotation.y = rng() * Math.PI * 2
    g.add(new THREE.Mesh(stumpGeo, stumpMat))
    g.add(new THREE.Mesh(vineGeo, vineMat))
    const spr = new THREE.Sprite(vineSpriteMat)
    spr.position.y = 0.85
    spr.scale.set(1.8, 1.8, 1)
    g.add(spr)
    scene.add(g)
    vineGroups.push(g)
  }

  // ---------- collision + line of sight (play trees only) ----------
  const nCol = treeX.length
  const _cc = { x: 0, z: 0 }
  function collide(x, z, rad) {
    _cc.x = x
    _cc.z = z
    for (let i = 0; i < nCol; i++) {
      const dx = _cc.x - treeX[i]
      if (dx > 2.5 || dx < -2.5) continue
      const dz = _cc.z - treeZ[i]
      if (dz > 2.5 || dz < -2.5) continue
      const rr = treeR[i] + rad
      const d2 = dx * dx + dz * dz
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2)
        const k = (rr - d) / d
        _cc.x += dx * k
        _cc.z += dz * k
      }
    }
    return _cc
  }

  function losBlocked(x0, z0, x1, z1) {
    const dx = x1 - x0
    const dz = z1 - z0
    const len2 = dx * dx + dz * dz
    if (len2 < 1e-6) return false
    const eps = 0.6 / Math.sqrt(len2) // absolute 0.6 m end clip — a hugged trunk blocks at all ranges
    for (let i = 0; i < nCol; i++) {
      const cx = treeX[i] - x0
      const cz = treeZ[i] - z0
      let t = (cx * dx + cz * dz) / len2
      if (t < eps || t > 1 - eps) continue
      const ox = cx - dx * t
      const oz = cz - dz * t
      const r = treeR[i] + 0.33
      if (ox * ox + oz * oz < r * r) return true
    }
    return false
  }

  function collectVine(i) {
    if (vineGroups[i]) vineGroups[i].visible = false
  }

  let denyT = 0
  let lastT = 0
  function denyFlicker() {
    denyT = 0.6
  }

  function update(t, gateExcited) {
    const dtW = t - lastT > 0 ? t - lastT : 0
    lastT = t
    vineMat.emissiveIntensity = 1.5 + Math.sin(t * 2.3) * 0.5
    vineSpriteMat.opacity = 0.4 + 0.15 * Math.sin(t * 2.3 + 1)
    const base = gateExcited ? 30 : 13
    let wi = base + Math.sin(t * 8.7) * 2.5 + Math.sin(t * 23.7 + 1) * (gateExcited ? 4 : 1.2)
    if (denyT > 0) {
      denyT -= dtW
      wi *= 0.2 + 0.5 * Math.abs(Math.sin(t * 42)) // the wisp gutters — denied
    }
    wispLight.intensity = wi
    const s = (gateExcited ? 5.4 : 3.2) + Math.sin(t * 3.1) * 0.3
    wispSprite.scale.set(s, s, 1)
    wispGrp.position.y = 5.2 + Math.sin(t * 1.3) * 0.25
  }

  return {
    PLAY_R,
    gate,
    gateAng,
    vines,
    waypoints,
    collide,
    losBlocked,
    collectVine,
    denyFlicker,
    update,
  }
}
