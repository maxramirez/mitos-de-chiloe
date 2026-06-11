// fx.js — EL TRAUCO · one reusable particle burst (vine collect).
// Single preallocated Points cloud; burst() rewinds it, update() is
// allocation-free. Only one burst lives at a time (pickups are spaced out).
import * as THREE from 'three'

export function createFX(scene) {
  const N = 80
  const pos = new Float32Array(N * 3)
  const vel = new Float32Array(N * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: 0x9fffd0,
    size: 0.14,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.visible = false
  pts.frustumCulled = false
  scene.add(pts)

  let life = 0

  function burst(x, y, z) {
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      const a = Math.random() * Math.PI * 2
      const u = Math.random() * 2 - 1
      const s = 1.2 + Math.random() * 2.6
      const rxy = Math.sqrt(1 - u * u)
      vel[i * 3] = Math.cos(a) * rxy * s
      vel[i * 3 + 1] = (u * 0.6 + 0.85) * s
      vel[i * 3 + 2] = Math.sin(a) * rxy * s
    }
    life = 1
    mat.opacity = 1
    pts.visible = true
    geo.attributes.position.needsUpdate = true
  }

  function update(dt) {
    if (life <= 0) return
    life -= dt * 0.85
    if (life <= 0) {
      life = 0
      pts.visible = false
      mat.opacity = 0
      return
    }
    for (let i = 0; i < N; i++) {
      pos[i * 3] += vel[i * 3] * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      vel[i * 3 + 1] -= 2.2 * dt
    }
    mat.opacity = life
    geo.attributes.position.needsUpdate = true
  }

  return { burst, update }
}
