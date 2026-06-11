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
 * shadow-casting moon key light, visible moon disc with soft halo,
 * twinkling stars, vast slow cloud silhouettes. Horror grade: colder,
 * faintly green, the dark kept readable.
 */
export function createSky(scene) {
  /* ---- fog + matching background ---- */
  const fogColor = new THREE.Color(0x0a161a)
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.0125)
  scene.background = fogColor.clone()

  const group = new THREE.Group()
  scene.add(group)

  /* ---- global lights ---- */
  const hemi = new THREE.HemisphereLight(0x4a6280, 0x1c2620, 2.4)
  group.add(hemi)

  const moonPos = new THREE.Vector3(-400, 350, -300)
  const moonDir = moonPos.clone().normalize() // fixed light direction
  const LIGHT_DIST = 300

  const moonLight = new THREE.DirectionalLight(0xb8c8e8, 2.0)
  moonLight.position.copy(moonDir).multiplyScalar(LIGHT_DIST)
  moonLight.castShadow = true
  moonLight.shadow.mapSize.set(2048, 2048)
  moonLight.shadow.camera.left = -75
  moonLight.shadow.camera.right = 75
  moonLight.shadow.camera.top = 75
  moonLight.shadow.camera.bottom = -75
  moonLight.shadow.camera.near = 50
  moonLight.shadow.camera.far = 600
  moonLight.shadow.bias = -0.0008
  moonLight.shadow.normalBias = 0.6
  group.add(moonLight)
  group.add(moonLight.target)

  /* ---- visible moon disc (overbright so ACES blooms it to white) ---- */
  const moonMat = new THREE.MeshBasicMaterial({ fog: false })
  moonMat.color.setRGB(1.45, 1.62, 1.74)
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
        gl_FragColor = vec4(0.56, 0.70, 0.80, a);
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

  /* ---- vast slow cloud silhouettes: dark transparent planes high up ---- */
  const CLOUD_COUNT = 5
  const cloudGeo = new THREE.PlaneGeometry(1, 1)
  cloudGeo.rotateX(-Math.PI / 2)
  const cloudRng = mulberry32(777001)
  const clouds = []
  const cloudSpeedX = new Float32Array(CLOUD_COUNT)
  const cloudSpeedZ = new Float32Array(CLOUD_COUNT)
  const cloudBaseX = new Float32Array(CLOUD_COUNT)
  const cloudBaseZ = new Float32Array(CLOUD_COUNT)
  const CLOUD_WRAP = 520

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uAlpha: { value: 0.5 + cloudRng() * 0.25 },
        uSeed: { value: cloudRng() * 31.7 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uAlpha;
        uniform float uSeed;
        void main() {
          vec2 c = vUv - 0.5;
          float d = length(c) * 2.0;
          // ragged edge: cheap angular wobble so the silhouette is not a disc
          float ang = atan(c.y, c.x);
          float rag = 0.12 * sin(ang * 3.0 + uSeed) + 0.08 * sin(ang * 7.0 - uSeed * 2.1);
          float a = pow(clamp(1.0 - d + rag, 0.0, 1.0), 1.8) * uAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.012, 0.026, 0.030, a);
        }`,
    })
    const cloud = new THREE.Mesh(cloudGeo, cMat)
    const sx = 260 + cloudRng() * 280
    const sz = 180 + cloudRng() * 220
    cloud.scale.set(sx, 1, sz)
    cloudBaseX[i] = (cloudRng() - 0.5) * 2 * 420
    cloudBaseZ[i] = (cloudRng() - 0.5) * 2 * 420
    cloud.position.set(cloudBaseX[i], 200 + cloudRng() * 70, cloudBaseZ[i])
    cloud.rotation.y = cloudRng() * Math.PI * 2
    cloudSpeedX[i] = (cloudRng() - 0.5) * 2.4 // barely drifting
    cloudSpeedZ[i] = (cloudRng() - 0.5) * 1.6
    cloud.renderOrder = 3
    cloud.frustumCulled = false
    group.add(cloud)
    clouds.push(cloud)
  }

  function wrap(v) {
    // keep within ±CLOUD_WRAP without allocation
    const span = CLOUD_WRAP * 2
    v = (v + CLOUD_WRAP) % span
    if (v < 0) v += span
    return v - CLOUD_WRAP
  }

  function update(t, focus) {
    starMat.uniforms.uTime.value = t
    haloMat.uniforms.uTime.value = t

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cl = clouds[i]
      cl.position.x = wrap(cloudBaseX[i] + cloudSpeedX[i] * t)
      cl.position.z = wrap(cloudBaseZ[i] + cloudSpeedZ[i] * t)
    }

    // keep the shadow frustum centered on the player
    if (focus) {
      moonLight.position.set(
        focus.x + moonDir.x * LIGHT_DIST,
        focus.y + moonDir.y * LIGHT_DIST,
        focus.z + moonDir.z * LIGHT_DIST
      )
      moonLight.target.position.set(focus.x, focus.y, focus.z)
      moonLight.target.updateMatrixWorld()
    }
  }

  return { update }
}
