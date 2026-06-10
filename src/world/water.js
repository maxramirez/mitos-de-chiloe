import * as THREE from 'three'

/**
 * Dark green-blue night sea. Subtle moving swell via vertex displacement,
 * flat-shaded so the moonlight catches individual facets.
 */
export function createWater() {
  const SIZE = 2000
  const SEG = 96
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  pos.setUsage(THREE.DynamicDrawUsage) // re-uploaded every frame by update()
  const count = pos.count
  const arr = pos.array
  // cache base coordinates once — zero allocations in update()
  const baseX = new Float32Array(count)
  const baseZ = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    baseX[i] = arr[i * 3]
    baseZ[i] = arr[i * 3 + 2]
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0x0d2f38,
    roughness: 0.32,
    metalness: 0.55,
    transparent: true,
    opacity: 0.85,
    flatShading: true,
    depthWrite: false,
    emissive: 0x04161c,
    emissiveIntensity: 0.5,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = 0

  function update(t) {
    for (let i = 0; i < count; i++) {
      const x = baseX[i]
      const z = baseZ[i]
      arr[i * 3 + 1] =
        0.22 * Math.sin(x * 0.04 + t * 0.8) +
        0.17 * Math.sin(z * 0.033 - t * 0.55 + x * 0.011) +
        0.11 * Math.sin((x + z) * 0.021 + t * 1.1)
    }
    pos.needsUpdate = true
  }

  return { object3d: mesh, update }
}
