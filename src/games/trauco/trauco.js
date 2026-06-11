// trauco.js — El Trauco: squat hatted dwarf with a stone hatchet.
// Procedural model (adapted from the collection's bestiary silhouette),
// waypoint patrol AI, and the visible translucent gaze cone (25 m / 35°).
// update(dt, active, t) is allocation-free; sim decisions use the seeded rng
// passed in, so manual stepping stays deterministic.
import * as THREE from 'three'

const BASE_SPEED = 2.4
const CONE_LEN = 25
const CONE_HALF = (17.5 * Math.PI) / 180

export function createTrauco({ terrainHeight, collide, waypoints, rng }) {
  const group = new THREE.Group()
  const root = new THREE.Group() // animated inner root
  root.scale.setScalar(1.3)
  group.add(root)

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a7355, roughness: 0.95, flatShading: true })
  const ponchoMat = new THREE.MeshStandardMaterial({ color: 0x46381f, roughness: 1, flatShading: true })
  const ponchoMat2 = new THREE.MeshStandardMaterial({ color: 0x59472a, roughness: 1, flatShading: true })
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x33402a, roughness: 1, flatShading: true })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 0.9, flatShading: true })
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x68707a, roughness: 0.7, flatShading: true })
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xa8ff7e, emissive: 0x71ff4d, emissiveIntensity: 2.2, roughness: 0.4,
  })
  const glintMat = new THREE.MeshStandardMaterial({
    color: 0xc9ffd2, emissive: 0x9dffb0, emissiveIntensity: 0.4, roughness: 0.3,
  })

  // ---------- stump legs ----------
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.26, 6), skinMat)
    leg.position.set(side * 0.1, 0.13, 0)
    root.add(leg)
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 6), woodMat)
    stump.position.set(side * 0.1, 0.035, 0)
    root.add(stump)
  }

  // ---------- squat body under a ragged poncho ----------
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), ponchoMat2)
  torso.position.y = 0.45
  torso.scale.set(1.0, 0.95, 0.85)
  root.add(torso)
  const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.46, 9), ponchoMat)
  poncho.position.y = 0.5
  root.add(poncho)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const len = 0.12 + 0.1 * (((i * 53) % 7) / 7)
    const flap = new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 4), i % 2 ? ponchoMat : ponchoMat2)
    flap.position.set(Math.cos(a) * 0.3, 0.3 - len * 0.4, Math.sin(a) * 0.3)
    flap.rotation.z = Math.cos(a) * 0.3
    flap.rotation.x = -Math.sin(a) * 0.3
    root.add(flap)
  }

  // ---------- head ----------
  const headGrp = new THREE.Group()
  headGrp.position.set(0, 0.74, 0.02)
  root.add(headGrp)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6), skinMat)
  head.position.y = 0.08
  head.scale.set(1.05, 0.92, 1.0)
  headGrp.add(head)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.15, 5), skinMat)
  nose.position.set(0, 0.05, 0.15)
  nose.rotation.x = Math.PI / 2 + 0.25
  headGrp.add(nose)
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.05), skinMat)
  brow.position.set(0, 0.12, 0.1)
  brow.rotation.x = 0.3
  headGrp.add(brow)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 4), skinMat)
    ear.position.set(side * 0.13, 0.1, -0.01)
    ear.rotation.z = side * -1.9
    headGrp.add(ear)
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), glowMat)
    eye.position.set(side * 0.052, 0.085, 0.115)
    headGrp.add(eye)
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.4, 8), hatMat)
  hat.position.set(0.015, 0.32, -0.01)
  hat.rotation.z = -0.1
  headGrp.add(hat)
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.025, 9), hatMat)
  brim.position.set(0.01, 0.135, -0.01)
  brim.rotation.z = -0.1
  headGrp.add(brim)

  // ---------- arms + stone hatchet ----------
  function limbDown(len, rTop, rBot, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 6)
    g.translate(0, -len / 2, 0)
    return new THREE.Mesh(g, mat)
  }
  const armL = new THREE.Group()
  armL.position.set(-0.22, 0.58, 0.02)
  armL.add(limbDown(0.34, 0.045, 0.05, skinMat))
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), skinMat)
  handL.position.y = -0.36
  armL.add(handL)
  armL.rotation.z = -0.18
  root.add(armL)

  const armR = new THREE.Group()
  armR.position.set(0.22, 0.58, 0.02)
  armR.add(limbDown(0.24, 0.045, 0.05, skinMat))
  const foreR = new THREE.Group()
  foreR.position.y = -0.24
  foreR.add(limbDown(0.22, 0.038, 0.045, skinMat))
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat)
  handR.position.y = -0.23
  foreR.add(handR)
  armR.add(foreR)
  root.add(armR)

  const hatchet = new THREE.Group()
  hatchet.position.y = -0.23
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 5), woodMat)
  handle.position.y = 0.1
  hatchet.add(handle)
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), stoneMat)
  stone.position.set(0, 0.26, 0.05)
  hatchet.add(stone)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.075, 0.025), glintMat)
  edge.position.set(0, 0.26, 0.135)
  hatchet.add(edge)
  hatchet.rotation.x = 0.35
  foreR.add(hatchet)
  armR.rotation.x = 0.55
  armR.rotation.z = 0.25
  foreR.rotation.x = 1.5

  // ---------- sickly green light + drifting spores ----------
  const light = new THREE.PointLight(0x76ff55, 13, 22, 1.8)
  light.position.set(0, 1.2, 0.25)
  group.add(light)

  const SPORES = 28
  const sporeArr = new Float32Array(SPORES * 3)
  for (let i = 0; i < SPORES; i++) {
    const s1 = Math.sin(i * 157.3 + 113.1) * 43758.5453
    const s2 = Math.sin(i * 311.7 + 271.9) * 43758.5453
    const s3 = Math.sin(i * 433.1 + 97.7) * 43758.5453
    const f1 = s1 - Math.floor(s1)
    const f2 = s2 - Math.floor(s2)
    const f3 = s3 - Math.floor(s3)
    const ang = f1 * Math.PI * 2
    const rad = 0.3 + f2 * 0.8
    sporeArr[i * 3] = Math.cos(ang) * rad
    sporeArr[i * 3 + 1] = 0.1 + f3 * 1.1
    sporeArr[i * 3 + 2] = Math.sin(ang) * rad
  }
  const sporeGeo = new THREE.BufferGeometry()
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporeArr, 3))
  const sporeMat = new THREE.PointsMaterial({
    color: 0x9aff70, size: 0.045, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const spores = new THREE.Points(sporeGeo, sporeMat)
  group.add(spores)

  // ---------- the gaze cone (apex at his eyes, opens forward +Z) ----------
  const coneR = Math.tan(CONE_HALF) * CONE_LEN
  function gazeConeGeo(scaleR, len) {
    const g = new THREE.ConeGeometry(coneR * scaleR, len, 26, 1, true)
    g.translate(0, -len / 2, 0)
    g.rotateX(-Math.PI / 2)
    return g
  }
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x8cffb4, transparent: true, opacity: 0.05,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, // fogged additive ≈ invisible at 25 m
  })
  const cone = new THREE.Mesh(gazeConeGeo(1, CONE_LEN), coneMat)
  cone.position.y = 1.02
  cone.rotation.x = 0.045
  cone.renderOrder = 4
  group.add(cone)
  const coneInMat = new THREE.MeshBasicMaterial({
    color: 0xb6ffd2, transparent: true, opacity: 0.09,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  })
  const coneIn = new THREE.Mesh(gazeConeGeo(0.45, CONE_LEN * 0.99), coneInMat)
  coneIn.position.y = 1.02
  coneIn.rotation.x = 0.045
  coneIn.renderOrder = 5
  group.add(coneIn)

  // ---------- patrol AI ----------
  let x = waypoints[0].x
  let z = waypoints[0].z
  let yaw = 0
  let state = 'walk' // 'walk' | 'pause' | 'alert'
  let wpIdx = 1
  let pauseT = 0
  let pauseClock = 0
  let pauseBaseYaw = 0
  let alertT = 0
  let alertYaw = 0
  let speedMul = 1
  let pauseDur = 2.5
  let walkPhase = 0
  let animT = 0
  let moving = false
  let alertFlare = 0
  let gazeHot = false

  function turnToward(target, maxStep) {
    let d = target - yaw
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    if (d > maxStep) d = maxStep
    else if (d < -maxStep) d = -maxStep
    yaw += d
  }

  function pickNext() {
    wpIdx = (wpIdx + 1 + Math.floor(rng() * (waypoints.length - 1))) % waypoints.length
  }

  function update(dt, active, t) {
    animT += dt
    moving = false
    if (active) {
      const speed = BASE_SPEED * speedMul
      if (state === 'alert') {
        alertT -= dt
        turnToward(alertYaw, 4.5 * dt)
        if (alertT <= 0) state = 'walk'
      } else if (state === 'pause') {
        pauseT -= dt
        pauseClock += dt
        yaw = pauseBaseYaw + Math.sin(pauseClock * 0.85) * 0.8
        if (pauseT <= 0) {
          pickNext()
          state = 'walk'
        }
      } else {
        const w = waypoints[wpIdx]
        const dx = w.x - x
        const dz = w.z - z
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d < 1.6) {
          state = 'pause'
          pauseT = pauseDur
          pauseClock = 0
          pauseBaseYaw = yaw
        } else {
          turnToward(Math.atan2(dx, dz), 2.4 * dt)
          x += Math.sin(yaw) * speed * dt
          z += Math.cos(yaw) * speed * dt
          const cc = collide(x, z, 0.5)
          x = cc.x
          z = cc.z
          moving = true
          walkPhase += dt * speed * 2.4
        }
      }
    }
    alertFlare = alertFlare > 0 ? alertFlare - dt * 1.4 : 0

    // ---------- visuals ----------
    const sw = moving ? Math.sin(walkPhase) : Math.sin(animT * 0.85)
    root.rotation.z = sw * (moving ? 0.13 : 0.07)
    root.position.x = sw * 0.03
    root.position.y = moving
      ? Math.abs(Math.sin(walkPhase)) * 0.06
      : 0.018 * Math.abs(Math.sin(animT * 1.7))
    headGrp.rotation.y =
      state === 'pause' ? Math.sin(animT * 0.6) * 0.4 : Math.sin(animT * 0.53) * 0.25
    headGrp.rotation.z = -sw * 0.06
    armL.rotation.x = moving ? Math.sin(walkPhase) * 0.4 : Math.sin(animT * 0.85 + 0.6) * 0.12
    armR.rotation.x =
      0.55 + (moving ? Math.sin(walkPhase + Math.PI) * 0.25 : Math.sin(animT * 0.85 + 2.1) * 0.1)
    foreR.rotation.x = 1.5 + Math.sin(animT * 1.3) * 0.09

    const g = Math.max(0, Math.sin(t * 1.45 + 0.4))
    glintMat.emissiveIntensity = 0.35 + 3.4 * g * g * g * g * g * g * g * g
    light.intensity = 13 + Math.sin(t * 3.3) * 2.2 + Math.sin(t * 8.1) * 1.3 + alertFlare * 26
    glowMat.emissiveIntensity = 2.2 + Math.sin(t * 3.3 + 0.5) * 0.45 + alertFlare * 1.5
    spores.rotation.y = -t * 0.21
    spores.position.y = Math.sin(t * 0.6) * 0.05
    sporeMat.opacity = 0.42 + 0.18 * Math.sin(t * 2.2 + 2.0)

    // gaze cone brightens while it actually holds you
    const target = gazeHot ? 0.18 : 0.05
    const tIn = gazeHot ? 0.3 : 0.09
    const k = dt * 6 > 1 ? 1 : dt * 6
    coneMat.opacity += (target - coneMat.opacity) * k
    coneInMat.opacity += (tIn - coneInMat.opacity) * k

    group.position.set(x, terrainHeight(x, z), z)
    group.rotation.y = yaw
  }

  // a loud noise at (nx, nz): turn toward it. Returns true when newly alerted.
  function hear(nx, nz) {
    alertYaw = Math.atan2(nx - x, nz - z)
    if (state === 'alert') {
      alertT = alertT > 1.8 ? alertT : 1.8
      return false
    }
    state = 'alert'
    alertT = 2.6
    alertFlare = 1
    return true
  }

  // each vine stolen: +8% walk speed, shorter pauses
  function onVine() {
    speedMul *= 1.08
    pauseDur = pauseDur - 0.3 > 0.4 ? pauseDur - 0.3 : 0.4
  }

  function teleportTo(nx, nz, nyaw) {
    x = nx
    z = nz
    if (typeof nyaw === 'number') yaw = nyaw
    state = 'walk'
    group.position.set(x, terrainHeight(x, z), z)
    group.rotation.y = yaw
  }

  return {
    group,
    update,
    hear,
    onVine,
    teleportTo,
    setGazeHot(v) {
      gazeHot = !!v
    },
    get x() {
      return x
    },
    get z() {
      return z
    },
    get yaw() {
      return yaw
    },
    get state() {
      return state
    },
    get speed() {
      return BASE_SPEED * speedMul
    },
    get pauseDur() {
      return pauseDur
    },
    get stepRate() {
      return moving ? (BASE_SPEED * speedMul) / 0.8 : 0
    },
  }
}
