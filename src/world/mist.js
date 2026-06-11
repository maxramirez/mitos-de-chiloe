import * as THREE from 'three'

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COUNT = 12

/**
 * Coastal mist — a dozen vast, near-invisible additive quads lying just above
 * the shoreline ring, each drifting and rotating very slowly. Subtle by
 * design: opacities 0.03–0.08, dark teal, never a white-out.
 */
export function createMist() {
  const group = new THREE.Group()
  const rng = mulberry32(902113)

  const geo = new THREE.PlaneGeometry(1, 1)

  const meshes = []
  const baseX = new Float32Array(COUNT)
  const baseZ = new Float32Array(COUNT)
  const drift = new Float32Array(COUNT)
  const dFrqX = new Float32Array(COUNT)
  const dFrqZ = new Float32Array(COUNT)
  const dPhsX = new Float32Array(COUNT)
  const dPhsZ = new Float32Array(COUNT)
  const spin0 = new Float32Array(COUNT)
  const spinV = new Float32Array(COUNT)

  for (let i = 0; i < COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x141e22,
      transparent: true,
      opacity: 0.03 + rng() * 0.05,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const m = new THREE.Mesh(geo, mat)
    m.scale.set(30 + rng() * 50, 30 + rng() * 50, 1)

    // seeded position on the coast ring
    const th = rng() * Math.PI * 2
    const r = 150 + rng() * 80
    baseX[i] = Math.cos(th) * r
    baseZ[i] = Math.sin(th) * r
    m.position.set(baseX[i], 1 + rng() * 3, baseZ[i])

    // mostly flat, slight tilt; in-plane spin animated in update
    m.rotation.x = -Math.PI / 2 + (rng() - 0.5) * 0.22
    spin0[i] = rng() * Math.PI * 2
    spinV[i] = (rng() - 0.5) * 0.03 // rad/s — barely turning
    m.rotation.z = spin0[i]

    drift[i] = 5 + rng() * 10
    dFrqX[i] = 0.01 + rng() * 0.02
    dFrqZ[i] = 0.01 + rng() * 0.02
    dPhsX[i] = rng() * Math.PI * 2
    dPhsZ[i] = rng() * Math.PI * 2

    meshes.push(m)
    group.add(m)
  }

  function update(t) {
    for (let i = 0; i < COUNT; i++) {
      const m = meshes[i]
      m.position.x = baseX[i] + Math.sin(t * dFrqX[i] + dPhsX[i]) * drift[i]
      m.position.z = baseZ[i] + Math.cos(t * dFrqZ[i] + dPhsZ[i]) * drift[i]
      m.rotation.z = spin0[i] + t * spinV[i]
    }
  }

  return { group, update }
}
