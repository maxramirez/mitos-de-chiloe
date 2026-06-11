import * as THREE from 'three'
import { terrainHeight } from './terrain.js'

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COUNT = 24
const BOUND_R2 = 230 * 230 // respawn past this radius
const SUNK_H = -3 // respawn when terrain under a wisp is this far below sea
const GUIDE_RADIUS = 55 // only wisps this close to the camera feel the guide
const GUIDE_SPEED = 2.0 // m/s of gentle anchor bias toward guideTarget

/**
 * Luces malas — ~24 faint sickly blue-green motes wandering 0.5–3 m above
 * the terrain. Additive points, no lights. When guideTarget is non-null the
 * few camera-nearest wisps drift gently toward it (a suggestion, never a
 * beeline). Out-of-bounds wisps respawn near the player.
 */
export function createWisps() {
  const group = new THREE.Group()
  const rng = mulberry32(771303)

  /* ---- per-wisp wander state (flat arrays, mutated in place) ---- */
  const anchors = new Float32Array(COUNT * 2) // ax, az
  const hover = new Float32Array(COUNT) // base height above terrain (1.0–2.5)
  const ampX = new Float32Array(COUNT)
  const ampZ = new Float32Array(COUNT)
  const frqX = new Float32Array(COUNT)
  const frqZ = new Float32Array(COUNT)
  const phsX = new Float32Array(COUNT)
  const phsZ = new Float32Array(COUNT)
  const bobF = new Float32Array(COUNT)
  const bobP = new Float32Array(COUNT)

  const positions = new Float32Array(COUNT * 3)
  const aPhase = new Float32Array(COUNT)
  const aSize = new Float32Array(COUNT)

  function seedWisp(i, cx, cz, spread) {
    const th = rng() * Math.PI * 2
    const r = spread * (0.3 + 0.7 * Math.sqrt(rng()))
    anchors[i * 2] = cx + Math.cos(th) * r
    anchors[i * 2 + 1] = cz + Math.sin(th) * r
    hover[i] = 1.0 + rng() * 1.5 // ±0.5 bob keeps the band at 0.5–3
    ampX[i] = 4 + rng() * 9
    ampZ[i] = 4 + rng() * 9
    frqX[i] = 0.03 + rng() * 0.06
    frqZ[i] = 0.03 + rng() * 0.06
    phsX[i] = rng() * Math.PI * 2
    phsZ[i] = rng() * Math.PI * 2
    bobF[i] = 0.25 + rng() * 0.4
    bobP[i] = rng() * Math.PI * 2
  }

  for (let i = 0; i < COUNT; i++) {
    seedWisp(i, 0, 0, 195)
    aPhase[i] = rng()
    aSize[i] = 0.35 + rng() * 0.35
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1))

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        // alpha breathes between 0.15 and 0.45, each mote on its own rhythm
        vA = 0.30 + 0.15 * sin(uTime * (0.4 + aPhase * 0.9) + aPhase * 37.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (240.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.18, d) * vA;
        if (a < 0.01) discard;
        // sickly blue-green, kept dim — never competes with the beings' glows
        gl_FragColor = vec4(0.32, 0.62, 0.52, a);
      }`,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  group.add(points)

  /* camera position captured at render time (player eye ≈ camera) */
  const camPos = new THREE.Vector3(0, 10, 0)
  points.onBeforeRender = function (renderer, scene, camera) {
    camPos.setFromMatrixPosition(camera.matrixWorld)
  }

  let lastT = 0

  function update(t, guideTarget) {
    let dt = t - lastT
    lastT = t
    if (dt < 0) dt = 0
    else if (dt > 0.1) dt = 0.1

    for (let i = 0; i < COUNT; i++) {
      let ax = anchors[i * 2]
      let az = anchors[i * 2 + 1]
      let x = ax + Math.sin(t * frqX[i] + phsX[i]) * ampX[i]
      let z = az + Math.cos(t * frqZ[i] + phsZ[i]) * ampZ[i]
      let h = terrainHeight(x, z)

      /* out of bounds or drifted over deep water → respawn near the player */
      if (x * x + z * z > BOUND_R2 || h < SUNK_H) {
        seedWisp(i, camPos.x, camPos.z, 60)
        ax = anchors[i * 2]
        az = anchors[i * 2 + 1]
        x = ax + Math.sin(t * frqX[i] + phsX[i]) * ampX[i]
        z = az + Math.cos(t * frqZ[i] + phsZ[i]) * ampZ[i]
        h = terrainHeight(x, z)
      }

      /* gentle guide bias for the few wisps nearest the camera */
      if (guideTarget !== null && guideTarget !== undefined) {
        const dcx = x - camPos.x
        const dcz = z - camPos.z
        const dc = Math.sqrt(dcx * dcx + dcz * dcz)
        if (dc < GUIDE_RADIUS) {
          const w = 1 - dc / GUIDE_RADIUS
          const gdx = guideTarget.x - ax
          const gdz = guideTarget.z - az
          const gl = Math.sqrt(gdx * gdx + gdz * gdz)
          if (gl > 2) {
            const k = (GUIDE_SPEED * w * dt) / gl
            anchors[i * 2] = ax + gdx * k
            anchors[i * 2 + 1] = az + gdz * k
          }
        }
      }

      positions[i * 3] = x
      positions[i * 3 + 1] = h + hover[i] + 0.5 * Math.sin(t * bobF[i] + bobP[i])
      positions[i * 3 + 2] = z
    }
    posAttr.needsUpdate = true
    mat.uniforms.uTime.value = t
  }

  return { group, update }
}
