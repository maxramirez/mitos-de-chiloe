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

/**
 * All global lighting + atmosphere: fog, background, hemisphere fill,
 * bluish moon key light, visible moon disc with soft halo, twinkling stars.
 */
export function createSky(scene) {
  /* ---- fog + matching background ---- */
  const fogColor = new THREE.Color(0x0d1b26)
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.011)
  scene.background = fogColor.clone()

  const group = new THREE.Group()
  scene.add(group)

  /* ---- global lights ---- */
  const hemi = new THREE.HemisphereLight(0x5a73a0, 0x232e25, 2.8)
  group.add(hemi)

  const moonPos = new THREE.Vector3(-400, 350, -300)

  const moonLight = new THREE.DirectionalLight(0xa9c0ff, 2.2)
  moonLight.position.copy(moonPos).normalize().multiplyScalar(300)
  group.add(moonLight) // default target = origin

  /* ---- visible moon disc (overbright so ACES blooms it to white) ---- */
  const moonMat = new THREE.MeshBasicMaterial({ fog: false })
  moonMat.color.setRGB(1.55, 1.65, 1.85)
  const moon = new THREE.Mesh(new THREE.CircleGeometry(30, 40), moonMat)
  moon.position.copy(moonPos)
  moon.lookAt(0, 0, 0)
  moon.renderOrder = 1
  group.add(moon)

  /* ---- soft procedural halo around the moon ---- */
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.6) * (0.30 + 0.04 * sin(uTime * 0.7));
        gl_FragColor = vec4(0.62, 0.72, 0.92, a);
      }`,
  })
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), haloMat)
  halo.position.copy(moonPos).multiplyScalar(0.96)
  halo.lookAt(0, 0, 0)
  halo.renderOrder = 2
  group.add(halo)

  /* ---- ~1500 twinkling stars on a 900-radius dome ---- */
  const STAR_COUNT = 1500
  const rng = mulberry32(421421)
  const positions = new Float32Array(STAR_COUNT * 3)
  const phases = new Float32Array(STAR_COUNT)
  const sizes = new Float32Array(STAR_COUNT)
  for (let i = 0; i < STAR_COUNT; i++) {
    const yf = 0.03 + rng() * 0.97 // hemisphere, just above horizon and up
    const th = rng() * Math.PI * 2
    const rxz = Math.sqrt(Math.max(0, 1 - yf * yf))
    const R = 880 + rng() * 50
    positions[i * 3] = Math.cos(th) * rxz * R
    positions[i * 3 + 1] = yf * R
    positions[i * 3 + 2] = Math.sin(th) * rxz * R
    phases[i] = rng()
    sizes[i] = rng() < 0.06 ? 2.6 + rng() * 1.6 : 1.1 + rng() * 1.3
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      // gl_PointSize is in device pixels — match the renderer's pixel ratio
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vA = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 43.0));
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(0.78, 0.85, 1.0, a);
      }`,
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  group.add(stars)

  function update(t) {
    starMat.uniforms.uTime.value = t
    haloMat.uniforms.uTime.value = t
  }

  return { update }
}
