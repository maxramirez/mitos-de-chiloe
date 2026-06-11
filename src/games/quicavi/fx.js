// EL BRUJO DE QUICAVÍ · fx.js — preallocated particle bursts + deterministic
// camera shake (same pooled design as the sibling games). No allocations
// after construction; bursts are event-time writes into fixed typed arrays.

import * as THREE from 'three'

const MAX = 128

export function createFX(scene, camera) {
  const pos = new Float32Array(MAX * 3)
  const col = new Float32Array(MAX * 3)
  const baseCol = new Float32Array(MAX * 3)
  const vel = new Float32Array(MAX * 3)
  const life = new Float32Array(MAX)
  const lifeMax = new Float32Array(MAX)
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -999

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(pos, 3)
  const colAttr = new THREE.BufferAttribute(col, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  colAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', colAttr)
  const mat = new THREE.PointsMaterial({
    size: 0.085,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  let cursor = 0
  let active = 0
  let trauma = 0

  // tiny deterministic hash for burst scatter (visual only, never sim-read)
  let scatterState = 911207
  function scatter() {
    scatterState = (scatterState * 1664525 + 1013904223) >>> 0
    return scatterState / 4294967296 - 0.5
  }

  function burst(x, y, z, r, g, b, n, speed, up) {
    const spd = speed || 1.6
    const lift = up === undefined ? 1.1 : up
    for (let k = 0; k < n; k++) {
      const i = cursor
      cursor = (cursor + 1) % MAX
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      vel[i * 3] = scatter() * 2 * spd
      vel[i * 3 + 1] = (scatter() + 0.6) * lift
      vel[i * 3 + 2] = scatter() * 2 * spd
      baseCol[i * 3] = r
      baseCol[i * 3 + 1] = g
      baseCol[i * 3 + 2] = b
      const L = 0.6 + (scatter() + 0.5) * 0.7
      life[i] = L
      lifeMax[i] = L
    }
    active = MAX // conservatively mark pool hot; decays back to 0
  }

  function shake(amount) {
    trauma = Math.min(1, trauma + amount)
  }

  function update(dt, simT, applyCameraShake) {
    if (active > 0) {
      let alive = 0
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue
        life[i] -= dt
        if (life[i] <= 0) {
          pos[i * 3 + 1] = -999
          col[i * 3] = 0
          col[i * 3 + 1] = 0
          col[i * 3 + 2] = 0
          continue
        }
        alive++
        vel[i * 3 + 1] -= 1.4 * dt // soft gravity — paper drifts
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        const f = life[i] / lifeMax[i]
        col[i * 3] = baseCol[i * 3] * f
        col[i * 3 + 1] = baseCol[i * 3 + 1] * f
        col[i * 3 + 2] = baseCol[i * 3 + 2] * f
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
      if (alive === 0) active = 0
    }

    if (trauma > 0) {
      trauma = Math.max(0, trauma - dt * 1.4)
      if (applyCameraShake) {
        const a = trauma * trauma
        // absolute set (player rewrites rotation every update, so no drift)
        camera.rotation.z = (Math.sin(simT * 71.3) * 0.6 + Math.sin(simT * 127.7) * 0.4) * a * 0.045
      }
    }
  }

  return { burst, shake, update, get trauma() { return trauma } }
}
