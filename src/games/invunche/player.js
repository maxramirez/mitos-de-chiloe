// EL INVUNCHE · player.js — first-person cave walker.
// Adapted from the flagship controller (src/player.js): WASD + Shift sprint,
// pointer-lock mouse look with arrow-key fallback, axis-separated collision
// slide, flat floor, subtle walk bob. Speeds tuned for 3.2 m corridors.

import * as THREE from 'three'

const WALK_SPEED = 4.0
const RUN_SPEED = 7.4
const MOUSE_SENS = 0.0023
const ARROW_RATE = 2.2 // rad/s
const PITCH_LIMIT = 1.35 // rad
const EYE_HEIGHT = 1.62
const ACCEL_RATE = 12
const BOB_FREQ = 1.9 // phase advance per meter walked
const BOB_AMP = 0.05

export function createPlayer(camera, domElement, isWalkable) {
  camera.rotation.order = 'YXZ'

  let yaw = camera.rotation.y
  let pitch = THREE.MathUtils.clamp(camera.rotation.x, -PITCH_LIMIT, PITCH_LIMIT)
  let enabled = false
  let locked = false
  let speed = 0 // measured, m/s (read by main for noise/footsteps)

  const keys = {
    fwd: false, back: false, left: false, right: false, run: false,
    lookL: false, lookR: false, lookU: false, lookD: false,
  }

  let vx = 0
  let vz = 0
  let bobPhase = 0
  let bobAmp = 0

  const position = camera.position // live Vector3

  const doc = typeof document !== 'undefined' ? document : null
  const win = typeof window !== 'undefined' ? window : null

  function applyRotation() {
    camera.rotation.set(pitch, yaw, 0)
  }

  function clearKeys() {
    keys.fwd = keys.back = keys.left = keys.right = keys.run = false
    keys.lookL = keys.lookR = keys.lookU = keys.lookD = false
  }

  function mapKey(e) {
    switch (e.code) {
      case 'KeyW': return 'fwd'
      case 'KeyS': return 'back'
      case 'KeyA': return 'left'
      case 'KeyD': return 'right'
      case 'ShiftLeft':
      case 'ShiftRight': return 'run'
      case 'ArrowLeft': return 'lookL'
      case 'ArrowRight': return 'lookR'
      case 'ArrowUp': return 'lookU'
      case 'ArrowDown': return 'lookD'
      default: break
    }
    switch (e.key) {
      case 'w': case 'W': return 'fwd'
      case 's': case 'S': return 'back'
      case 'a': case 'A': return 'left'
      case 'd': case 'D': return 'right'
      case 'Shift': return 'run'
      case 'ArrowLeft': return 'lookL'
      case 'ArrowRight': return 'lookR'
      case 'ArrowUp': return 'lookU'
      case 'ArrowDown': return 'lookD'
      default: return null
    }
  }

  function onKeyDown(e) {
    if (!enabled) return
    const k = mapKey(e)
    if (!k) return
    keys[k] = true
    if (k.indexOf('look') === 0 && typeof e.preventDefault === 'function') e.preventDefault()
  }

  function onKeyUp(e) {
    const k = mapKey(e) // always release, even when disabled
    if (k) keys[k] = false
  }

  function onMouseMove(e) {
    if (!enabled || !locked) return
    yaw -= (e.movementX || 0) * MOUSE_SENS
    pitch -= (e.movementY || 0) * MOUSE_SENS
    if (pitch > PITCH_LIMIT) pitch = PITCH_LIMIT
    else if (pitch < -PITCH_LIMIT) pitch = -PITCH_LIMIT
    applyRotation()
  }

  function requestLock() {
    try {
      if (domElement && typeof domElement.requestPointerLock === 'function') {
        const p = domElement.requestPointerLock()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
    } catch (_) {
      /* pointer lock unavailable — arrow keys still work */
    }
  }

  function onClick() {
    if (!enabled) return
    requestLock()
  }

  function onLockChange() {
    try {
      locked = !!doc && doc.pointerLockElement === domElement
    } catch (_) {
      locked = false
    }
  }

  function onLockError() {
    locked = false
  }

  function onBlur() {
    clearKeys()
  }

  if (win) {
    win.addEventListener('keydown', onKeyDown)
    win.addEventListener('keyup', onKeyUp)
    win.addEventListener('blur', onBlur)
  }
  if (doc) {
    doc.addEventListener('mousemove', onMouseMove)
    doc.addEventListener('pointerlockchange', onLockChange)
    doc.addEventListener('pointerlockerror', onLockError)
  }
  if (domElement && typeof domElement.addEventListener === 'function') {
    domElement.addEventListener('click', onClick)
  }

  applyRotation()

  function update(dt) {
    if (!enabled) {
      speed = 0
      return
    }
    if (!(dt > 0)) return
    if (dt > 0.05) dt = 0.05

    if (keys.lookL) yaw += ARROW_RATE * dt
    if (keys.lookR) yaw -= ARROW_RATE * dt
    if (keys.lookU) pitch += ARROW_RATE * dt
    if (keys.lookD) pitch -= ARROW_RATE * dt
    if (pitch > PITCH_LIMIT) pitch = PITCH_LIMIT
    else if (pitch < -PITCH_LIMIT) pitch = -PITCH_LIMIT

    const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const iz = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0)
    let tvx = 0
    let tvz = 0
    if (ix !== 0 || iz !== 0) {
      const inv = 1 / Math.sqrt(ix * ix + iz * iz)
      const nx = ix * inv
      const nz = iz * inv
      const sinY = Math.sin(yaw)
      const cosY = Math.cos(yaw)
      const sp = keys.run ? RUN_SPEED : WALK_SPEED
      tvx = (cosY * nx - sinY * nz) * sp
      tvz = (-sinY * nx - cosY * nz) * sp
    }

    const blend = 1 - Math.exp(-ACCEL_RATE * dt)
    vx += (tvx - vx) * blend
    vz += (tvz - vz) * blend

    let x = position.x
    let z = position.z
    const nxPos = x + vx * dt
    const nzPos = z + vz * dt
    if (isWalkable(nxPos, nzPos)) {
      x = nxPos
      z = nzPos
    } else if (isWalkable(nxPos, z)) {
      x = nxPos
      vz = 0
    } else if (isWalkable(x, nzPos)) {
      z = nzPos
      vx = 0
    } else {
      vx = 0
      vz = 0
    }

    speed = Math.sqrt(vx * vx + vz * vz)
    bobPhase += speed * dt * BOB_FREQ
    const targetAmp = speed > 0.4 ? BOB_AMP * Math.min(speed / WALK_SPEED, 1.4) : 0
    bobAmp += (targetAmp - bobAmp) * blend
    const bob = Math.sin(bobPhase * Math.PI * 2 * 0.28) * bobAmp

    position.set(x, EYE_HEIGHT + bob, z)
    applyRotation()
  }

  function setPosition(x, z, newYaw) {
    if (typeof newYaw === 'number') yaw = newYaw
    vx = 0
    vz = 0
    bobPhase = 0
    bobAmp = 0
    speed = 0
    position.set(x, EYE_HEIGHT, z)
    applyRotation()
  }

  return {
    update,
    position,
    setPosition,
    requestLock,
    get yaw() { return yaw },
    get speed() { return speed },
    get sprinting() { return keys.run && speed > RUN_SPEED * 0.6 },
    get enabled() { return enabled },
    set enabled(v) {
      enabled = !!v
      if (!enabled) {
        clearKeys()
        vx = 0
        vz = 0
        speed = 0
      }
    },
  }
}
