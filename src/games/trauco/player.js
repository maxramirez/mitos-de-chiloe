// player.js — EL TRAUCO · first-person controller.
// WASD/arrows walk, Shift sprint (loud), pointer-lock mouse look.
// update(dt) is allocation-free (scalar math, shared collide() result).
export function createPlayer(camera, dom, { terrainHeight, collide }) {
  const EYE = 1.66
  const WALK = 4.3
  const SPRINT = 7.2
  const BOUND = 60.5

  let x = 0
  let z = 0
  let yaw = 0
  let pitch = 0
  let y = terrainHeight(0, 0) + EYE
  let bobPhase = 0
  let moving = false
  let sprintKey = false
  let locked = false
  let speed = 0

  const keys = Object.create(null)
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true
  })
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false
  })
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false
  })

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === dom
  })
  document.addEventListener('mousemove', (e) => {
    if (!locked) return
    yaw -= e.movementX * 0.0022
    pitch -= e.movementY * 0.0022
    if (pitch > 1.35) pitch = 1.35
    if (pitch < -1.35) pitch = -1.35
  })
  dom.addEventListener('click', () => {
    if (api.enabled && !locked) requestLock()
  })

  function requestLock() {
    try {
      const p = dom.requestPointerLock()
      if (p && p.catch) p.catch(() => {})
    } catch {
      /* pointer lock unavailable (tests / odd browsers) — keys still work */
    }
  }

  function apply() {
    camera.position.set(x, y, z)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch
    camera.rotation.z = 0
  }

  function update(dt) {
    let mx = 0
    let mz = 0
    if (keys.KeyW || keys.ArrowUp) mz -= 1
    if (keys.KeyS || keys.ArrowDown) mz += 1
    if (keys.KeyA || keys.ArrowLeft) mx -= 1
    if (keys.KeyD || keys.ArrowRight) mx += 1
    sprintKey = !!(keys.ShiftLeft || keys.ShiftRight)
    moving = mx !== 0 || mz !== 0
    speed = moving ? (sprintKey ? SPRINT : WALK) : 0
    if (moving) {
      const il = 1 / Math.sqrt(mx * mx + mz * mz)
      mx *= il
      mz *= il
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      x += (mx * c + mz * s) * speed * dt
      z += (-mx * s + mz * c) * speed * dt
      const r = Math.sqrt(x * x + z * z)
      if (r > BOUND) {
        const k = BOUND / r
        x *= k
        z *= k
      }
      const cc = collide(x, z, 0.45)
      x = cc.x
      z = cc.z
      bobPhase += dt * speed * 1.55
    }
    const gy = terrainHeight(x, z) + EYE
    const k = dt * 12 > 1 ? 1 : dt * 12
    y += (gy - y) * k
    apply()
    if (moving) camera.position.y += Math.sin(bobPhase) * 0.05
  }

  function setPosition(nx, nz, nyaw) {
    x = nx
    z = nz
    if (typeof nyaw === 'number') yaw = nyaw
    pitch = 0
    y = terrainHeight(x, z) + EYE
    apply()
  }

  const api = {
    enabled: false,
    update,
    requestLock,
    setPosition,
    get x() {
      return x
    },
    get z() {
      return z
    },
    get yaw() {
      return yaw
    },
    get moving() {
      return moving
    },
    get sprinting() {
      return sprintKey && moving
    },
    get locked() {
      return locked
    },
    get speed() {
      return speed
    },
  }
  return api
}
