/* ============================================================
   EL VUELO DEL BRUJO — spectral rings + light pillars + burst FX.
   Ring radius 8 m (generous coyote room). The next ring glows
   bright with a tall pillar; passed rings fade; future rings dim.
   ============================================================ */

import * as THREE from 'three'
import { RINGS, glowTexture } from './world.js'

export const RING_RADIUS = 8

export function createRings(scene) {
  const torusGeo = new THREE.TorusGeometry(RING_RADIUS, 0.55, 8, 36)
  const pillarGeo = new THREE.CylinderGeometry(1.6, 2.6, 300, 10, 1, true)
  pillarGeo.translate(0, 150, 0)

  /* glow hierarchy: the ACTIVE ring is the brightest thing in the scene.
     Its torus gets an HDR-hot color (ACES tames it into a mint-white core)
     and one shared additive halo torus rides whichever ring is active —
     built once at boot, only ever repositioned. */
  const COL_BASE = new THREE.Color(0x9fffd0)
  const COL_HOT = new THREE.Color(0x9fffd0).multiplyScalar(1.7)
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 1.25, 8, 36),
    new THREE.MeshBasicMaterial({
      color: 0x9fffd0,
      transparent: true,
      opacity: 0.16,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  scene.add(halo)

  const rings = RINGS.map((r, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fffd0,
      transparent: true,
      opacity: 0.16,
      fog: false,
    })
    const torus = new THREE.Mesh(torusGeo, mat)
    torus.position.set(r.x, r.y, r.z)
    torus.rotation.y = Math.atan2(r.dirx, r.dirz)

    const pmat = new THREE.MeshBasicMaterial({
      color: 0x9fffd0,
      transparent: true,
      opacity: 0,
      fog: false,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pillar = new THREE.Mesh(pillarGeo, pmat)
    pillar.position.set(r.x, r.y - 6, r.z)

    scene.add(torus, pillar)
    return { def: r, torus, pillar, mat, pmat, index: i, passed: false }
  })

  let active = 0
  /* one-shot bloom on the ring just threaded: quick scale-out + fade */
  let bloom = null
  let bloomT = 0
  let lastT = 0

  function setActive(n) {
    if (n === active + 1 && n > 0) {
      bloom = rings[n - 1]
      bloomT = 0.7
    }
    active = n
    for (let i = 0; i < rings.length; i++) {
      const rg = rings[i]
      rg.passed = i < n
      rg.mat.color.copy(i === n ? COL_HOT : COL_BASE)
      if (i < n) {
        rg.mat.opacity = 0.05
        rg.pmat.opacity = 0
      } else if (i === n) {
        rg.mat.opacity = 0.95
        rg.pmat.opacity = 0.2
      } else if (i === n + 1) {
        rg.mat.opacity = 0.3
        rg.pmat.opacity = 0.05
      } else {
        rg.mat.opacity = 0.12
        rg.pmat.opacity = 0
      }
    }
    const act = rings[n]
    halo.visible = !!act
    if (act) {
      halo.position.copy(act.torus.position)
      halo.rotation.copy(act.torus.rotation)
    }
  }
  setActive(0)

  function update(t) {
    const dt = Math.min(Math.max(t - lastT, 0), 0.1)
    lastT = t
    if (bloom) {
      bloomT -= dt
      if (bloomT <= 0) {
        bloom.torus.scale.setScalar(1)
        bloom.mat.opacity = 0.05 /* settle into the passed-ring look */
        bloom = null
      } else {
        const k = 1 - bloomT / 0.7
        bloom.torus.scale.setScalar(1 + k * 1.1)
        bloom.mat.opacity = 0.9 * (1 - k) * (1 - k) + 0.05
      }
    }
    const rg = rings[active]
    if (rg) {
      const pulse = 0.82 + Math.sin(t * 3.1) * 0.18
      rg.mat.opacity = pulse
      rg.pmat.opacity = 0.18 + Math.sin(t * 2.2) * 0.06
      rg.torus.scale.setScalar(1 + Math.sin(t * 3.1) * 0.025)
      halo.scale.setScalar(1 + Math.sin(t * 3.1) * 0.04)
      halo.material.opacity = 0.14 + (Math.sin(t * 3.1) * 0.5 + 0.5) * 0.12
    }
  }

  return { rings, setActive, update, get active() { return active } }
}

/* ============================================================
   One reusable particle burst (ring pass / crash splash).
   Pre-allocated; zero allocations when fired.
   ============================================================ */
export function createBurst(scene) {
  const N = 70
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 3)
  const vel = new Float32Array(N * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: 0x9fffd0,
    size: 0.55,
    map: glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  let life = 0
  let seed = 1

  function rnd() {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  function fire(x, y, z, color) {
    mat.color.set(color)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      const a = rnd() * Math.PI * 2
      const b = (rnd() - 0.5) * Math.PI
      const s = 6 + rnd() * 14
      vel[i * 3] = Math.cos(a) * Math.cos(b) * s
      vel[i * 3 + 1] = Math.sin(b) * s
      vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s
    }
    life = 1
    mat.opacity = 1
    geo.attributes.position.needsUpdate = true
  }

  function update(dt) {
    if (life <= 0) return
    life -= dt * 1.1
    if (life <= 0) {
      mat.opacity = 0
      return
    }
    mat.opacity = life
    for (let i = 0; i < N; i++) {
      pos[i * 3] += vel[i * 3] * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      vel[i * 3 + 1] -= 9 * dt
    }
    geo.attributes.position.needsUpdate = true
  }

  return { fire, update }
}

/* ============================================================
   Gust mist streak — telegraphs the wind shove.
   ============================================================ */
export function createGustStreak(scene) {
  const geo = new THREE.PlaneGeometry(90, 7, 8, 1)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xbfd8e0,
    transparent: true,
    opacity: 0,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  scene.add(mesh)

  /* show(x,y,z, yaw, dir): streak ahead of player, sliding sideways */
  let activeT = 0
  let slideDir = 1
  function show(x, y, z, yaw, dir) {
    /* forward = (sin yaw, 0, cos yaw); place the streak 60 m ahead */
    mesh.position.set(x + Math.sin(yaw) * 60, y, z + Math.cos(yaw) * 60)
    mesh.rotation.set(0, yaw, 0)
    slideDir = dir
    activeT = 1.6
  }

  function update(dt, yaw) {
    if (activeT <= 0) {
      mat.opacity = 0
      return
    }
    activeT -= dt
    mat.opacity = Math.min(0.5, activeT * 0.7)
    /* slide across the flight path along the right vector, in the shove direction */
    mesh.position.x += Math.cos(yaw) * slideDir * 38 * dt
    mesh.position.z -= Math.sin(yaw) * slideDir * 38 * dt
  }

  return { show, update }
}
