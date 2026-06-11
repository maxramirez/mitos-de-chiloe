// LA PINCOYA — scene.js
// Three.js night bay: moonlit swell, the lancha on its mooring arc, five
// lantern buoys, the pale beach where La Pincoya dances, moon + dawn cycle,
// shared particle pool. All procedural, allocation-free in update().
import * as THREE from 'three'

export const BOAT_R = 20
export const SPOT_R = 27.5
export const ARC_Z = 26
export const A_MAX = 0.62 // boat angle range [-A_MAX, A_MAX]

// gentle swell — pure, deterministic, shared by water verts / boat / buoys
const W1A = 0.16, W1K = 0.28, W1W = 0.8
const W2A = 0.11, W2K = 0.4, W2W = 0.55
const W3A = 0.07, W3K = 0.16, W3W = 1.0
export function waveHeight(x, z, t) {
  return (
    W1A * Math.sin(W1K * x + W1W * t) +
    W2A * Math.sin(W2K * z - W2W * t) +
    W3A * Math.sin(W3K * (x + z) + W3W * t)
  )
}

function arcPos(a, r, out) {
  out.set(Math.sin(a) * r, 0, ARC_Z - Math.cos(a) * r)
  return out
}

// soft radial glow texture (procedural, shared)
function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// ---- procedural surface textures (built once at boot, cached) ---------------
// low-contrast streak noise for the water: bumpMap + roughnessMap. Streaks are
// drawn wrapped at ±size so the canvas tiles without seams.
function makeWaterTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#7f8488'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 760; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    const w = 8 + Math.random() * 34
    const h = 1 + Math.random() * 1.4
    const a = (0.035 + Math.random() * 0.075).toFixed(3)
    g.fillStyle = Math.random() > 0.5 ? 'rgba(226,233,238,' + a + ')' : 'rgba(18,28,36,' + a + ')'
    for (let ox = -s; ox <= s; ox += s)
      for (let oy = -s; oy <= s; oy += s) g.fillRect(x - w / 2 + ox, y - h / 2 + oy, w, h)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// near-white speckled grain for the sand — multiplies the beach vertex colors
function makeSandTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#e2ddd1'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    const r = 0.5 + Math.random() * 1.1
    const a = (0.05 + Math.random() * 0.1).toFixed(3)
    g.fillStyle = Math.random() > 0.42 ? 'rgba(92,78,56,' + a + ')' : 'rgba(255,252,240,' + a + ')'
    g.fillRect(x, y, r, r)
  }
  // broad tonal smudges, drawn wrapped
  for (let i = 0; i < 36; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    const r = 12 + Math.random() * 26
    g.fillStyle = Math.random() > 0.5 ? 'rgba(110,96,72,0.045)' : 'rgba(240,236,224,0.05)'
    for (let ox = -s; ox <= s; ox += s)
      for (let oy = -s; oy <= s; oy += s) {
        g.beginPath()
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2)
        g.fill()
      }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// near-white vertical grain for the lancha and buoy wood — multiplies material color
function makeWoodTexture() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#ded3c1'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 30; i++) {
    const x0 = Math.random() * s
    const dark = Math.random() > 0.3
    g.strokeStyle = dark
      ? 'rgba(44,28,14,' + (0.07 + Math.random() * 0.13).toFixed(3) + ')'
      : 'rgba(252,246,232,' + (0.06 + Math.random() * 0.1).toFixed(3) + ')'
    g.lineWidth = 0.8 + Math.random() * 1.7
    const ph = Math.random() * 6.28
    const amp = 1.5 + Math.random() * 2.5
    for (let ox = -s; ox <= s; ox += s) {
      g.beginPath()
      for (let y = -8; y <= s + 8; y += 6) {
        const x = x0 + ox + Math.sin(y * 0.05 + ph) * amp
        if (y === -8) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// near-white woven cloth — warp/weft lines + slubs; multiplies into the dress
// and poncho colors the way the wood grain multiplies into the planks
function makeClothTexture() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#d6d2c4'
  g.fillRect(0, 0, s, s)
  // weft (horizontal) and warp (vertical) threads, slightly jittered
  for (let y = 0; y < s; y += 3) {
    g.fillStyle = 'rgba(34,40,32,' + (0.05 + Math.random() * 0.09).toFixed(3) + ')'
    g.fillRect(0, y + Math.random(), s, 1)
  }
  for (let x = 0; x < s; x += 3) {
    g.fillStyle = 'rgba(255,252,240,' + (0.04 + Math.random() * 0.07).toFixed(3) + ')'
    g.fillRect(x + Math.random(), 0, 1, s)
  }
  // slubs — the little knots hand-spun wool keeps
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    g.fillStyle = Math.random() > 0.5 ? 'rgba(28,32,26,0.14)' : 'rgba(255,250,236,0.16)'
    for (let ox = -s; ox <= s; ox += s)
      for (let oy = -s; oy <= s; oy += s) g.fillRect(x + ox, y + oy, 1.5 + Math.random() * 2, 1.5)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// near-white skin map: soft top-lit vertical gradient, faint blush, speckle
function makeSkinTexture() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, s)
  grad.addColorStop(0, '#ece0cd') // moonlit brow
  grad.addColorStop(0.55, '#e0d2bd')
  grad.addColorStop(1, '#cdbda6') // shadow under the jaw
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  g.fillStyle = 'rgba(206,128,96,0.10)' // cheeks
  g.beginPath()
  g.arc(s * 0.3, s * 0.52, 9, 0, Math.PI * 2)
  g.arc(s * 0.72, s * 0.52, 9, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 110; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(120,86,58,0.07)' : 'rgba(255,248,234,0.07)'
    g.fillRect(Math.random() * s, Math.random() * s, 1, 1)
  }
  return new THREE.CanvasTexture(c)
}

// near-white vertical strand map for her hair — denser, wavier than the wood
function makeHairTexture() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#dccfae'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 64; i++) {
    const x0 = Math.random() * s
    const dark = Math.random() > 0.42
    g.strokeStyle = dark
      ? 'rgba(64,42,12,' + (0.08 + Math.random() * 0.14).toFixed(3) + ')'
      : 'rgba(255,238,196,' + (0.07 + Math.random() * 0.12).toFixed(3) + ')'
    g.lineWidth = 0.7 + Math.random() * 1.2
    const ph = Math.random() * 6.28
    const amp = 1.2 + Math.random() * 2.6
    for (let ox = -s; ox <= s; ox += s) {
      g.beginPath()
      for (let y = -8; y <= s + 8; y += 5) {
        const x = x0 + ox + Math.sin(y * 0.07 + ph) * amp
        if (y === -8) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// sparse vertical glints, bright at center column, for the moon's glitter path
function makeGlitterTexture() {
  const w = 128
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const edge = Math.abs(x - w / 2) / (w / 2)
    const fall = Math.pow(Math.max(0, 1 - edge), 2.2)
    if (fall < 0.05) continue
    const a = (fall * (0.22 + Math.random() * 0.5)).toFixed(3)
    const len = 2 + Math.random() * 7
    g.fillStyle = 'rgba(206,226,243,' + a + ')'
    const ww = 1 + Math.random() * 1.2
    g.fillRect(x, y - len / 2, ww, len)
    g.fillRect(x, y - len / 2 - h, ww, len)
    g.fillRect(x, y - len / 2 + h, ww, len)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.RepeatWrapping
  return t
}

// pale wisps along the shoreline foam band
function makeFoamTexture() {
  const w = 64
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const edge = Math.abs(x - w / 2) / (w / 2)
    const fall = Math.max(0, 1 - edge * edge * 1.5)
    const a = (fall * (0.1 + Math.random() * 0.28)).toFixed(3)
    const len = 4 + Math.random() * 14
    g.fillStyle = 'rgba(226,236,231,' + a + ')'
    g.fillRect(x, y, 1.4, len)
    g.fillRect(x, y - h, 1.4, len)
    g.fillRect(x, y + h, 1.4, len)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.RepeatWrapping
  return t
}

export function createWorld(S) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05080b)
  scene.fog = new THREE.FogExp2(0x070d13, 0.006)
  const BG_NIGHT = new THREE.Color(0x05080b)
  const BG_DAWN = new THREE.Color(0x0c1219)

  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 500)
  camera.position.set(0, 6.2, 23.5)

  const glowTex = makeGlowTexture()

  // ---- lights (count constant from boot) ---------------------------------
  scene.add(new THREE.HemisphereLight(0x3d4d5c, 0x101a16, 0.85))
  const moonLight = new THREE.DirectionalLight(0xb9c8e0, 1.45)
  moonLight.position.set(-60, 70, -90)
  scene.add(moonLight)

  // ---- water --------------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(260, 170, 64, 40)
  waterGeo.rotateX(-Math.PI / 2)
  // streak noise drifts slowly as micro-chop: bump for moonlit glints,
  // roughness variation for gloss lanes (mid-gray base ≈ original 0.5 gloss)
  const waterTex = makeWaterTexture()
  waterTex.repeat.set(7, 4)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0e2a36,
    emissive: 0x041318,
    roughness: 0.85,
    metalness: 0.35,
    bumpMap: waterTex,
    bumpScale: 0.045,
    roughnessMap: waterTex,
    transparent: true,
    opacity: 0.94,
  })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.position.set(0, 0, -40)
  scene.add(water)
  const wPos = waterGeo.attributes.position
  const wNor = waterGeo.attributes.normal
  const wArr = wPos.array
  const nArr = wNor.array

  // moon glitter path — a long additive plane of vertical glints laid on the
  // swell, following the moon as it slides to the horizon. Vertex colors fade
  // both ends so the band dissolves into the bay.
  const glitterTex = makeGlitterTexture()
  glitterTex.repeat.set(1, 2)
  const moonPathGeo = new THREE.PlaneGeometry(8.5, 95, 1, 12)
  moonPathGeo.rotateX(-Math.PI / 2)
  {
    const p = moonPathGeo.attributes.position
    const col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      const v = p.getZ(i) / 95 + 0.5 // 0 horizon end … 1 near end
      const k = Math.pow(Math.sin(Math.min(1, Math.max(0, v)) * Math.PI), 0.85)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k
    }
    moonPathGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  const moonPathMat = new THREE.MeshBasicMaterial({
    map: glitterTex,
    color: 0xaac6de,
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const moonPath = new THREE.Mesh(moonPathGeo, moonPathMat)
  // slanted from under the moon (x≈-40 at the horizon) toward the camera
  moonPath.position.set(-28, 0.45, -72)
  moonPath.rotation.y = 0.247
  moonPath.renderOrder = 1
  scene.add(moonPath)

  // ---- beach (left, diagonal shoreline) -----------------------------------
  // waterline: x = -20 - 0.25*(z+30); sand rises where x < waterline
  const beachGeo = new THREE.PlaneGeometry(95, 120, 28, 34)
  beachGeo.rotateX(-Math.PI / 2)
  {
    const p = beachGeo.attributes.position
    // vertex colors carry the sand hue (near-white grain map multiplies it):
    // dry warm sand high up, darker cool wet band hugging the waterline
    const col = new Float32Array(p.count * 3)
    const cDry = new THREE.Color(0xbdae8e)
    const cWet = new THREE.Color(0x59594f)
    for (let i = 0; i < p.count; i++) {
      const wx = p.getX(i) - 48
      const wz = p.getZ(i) - 30
      const waterline = -20 - 0.25 * (wz + 30)
      let h = (waterline - wx) * 0.13
      h += Math.sin(wx * 0.35) * 0.12 + Math.sin(wz * 0.22 + 1.7) * 0.1
      p.setY(i, Math.max(-2.5, Math.min(8, h)))
      const d = waterline - wx // distance onshore from the waterline
      let wet = d < 1.2 ? 1 : d > 5.5 ? 0 : 1 - (d - 1.2) / 4.3
      wet = wet * wet * (3 - 2 * wet) // smoothstep
      const tone = 1 + (Math.random() - 0.5) * 0.12
      col[i * 3] = (cDry.r + (cWet.r - cDry.r) * wet) * tone
      col[i * 3 + 1] = (cDry.g + (cWet.g - cDry.g) * wet) * tone
      col[i * 3 + 2] = (cDry.b + (cWet.b - cDry.b) * wet) * tone
    }
    beachGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    beachGeo.computeVertexNormals()
  }
  const sandTex = makeSandTexture()
  sandTex.repeat.set(6, 8)
  const beach = new THREE.Mesh(
    beachGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: sandTex,
      bumpMap: sandTex,
      bumpScale: 0.18,
      roughness: 0.96,
      metalness: 0,
    })
  )
  beach.position.set(-48, 0, -30)
  scene.add(beach)

  // foam band breathing along the waterline (x = -20 - 0.25*(z+30))
  const foamTex = makeFoamTexture()
  foamTex.repeat.set(1, 8)
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex,
    color: 0xd4e2da,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 110).rotateX(-Math.PI / 2), foamMat)
  foam.rotation.y = Math.atan2(-0.25, 1) // align with the diagonal shoreline
  foam.position.set(-20, 0.3, -30)
  foam.renderOrder = 2
  scene.add(foam)

  // headland / island silhouettes
  const silMat = new THREE.MeshStandardMaterial({ color: 0x0a1116, roughness: 1 })
  const sil1 = new THREE.Mesh(new THREE.ConeGeometry(34, 22, 7), silMat)
  sil1.position.set(-68, -2, -78)
  const sil2 = new THREE.Mesh(new THREE.ConeGeometry(26, 15, 6), silMat)
  sil2.position.set(-26, -2, -100)
  const sil3 = new THREE.Mesh(new THREE.ConeGeometry(40, 17, 7), silMat)
  sil3.position.set(72, -2, -105)
  scene.add(sil1, sil2, sil3)

  // ---- stars ----------------------------------------------------------------
  const starGeo = new THREE.BufferGeometry()
  {
    const n = 320
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(1 - Math.random() * 0.82) // bias high
      const r = 150
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = Math.max(6, r * Math.cos(ph) * 0.8)
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 30
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }
  const starMat = new THREE.PointsMaterial({
    color: 0xcfd8e2, size: 0.7, sizeAttenuation: true,
    transparent: true, opacity: 0.85, fog: false, depthWrite: false,
  })
  scene.add(new THREE.Points(starGeo, starMat))

  // ---- moon (slides to the horizon with the timer) -------------------------
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(7, 28),
    new THREE.MeshBasicMaterial({ color: 0xe8edf2, fog: false })
  )
  moon.position.set(-42, 42, -130)
  scene.add(moon)
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xbcccdc, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }))
  moonGlow.scale.set(34, 34, 1)
  scene.add(moonGlow)

  // dawn glow on the eastern horizon — ramps in as the timer dies
  const dawn = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xc98f5e, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }))
  dawn.position.set(34, 5, -118)
  dawn.scale.set(110, 30, 1)
  scene.add(dawn)

  // ---- la lancha ------------------------------------------------------------
  // grain map is near-white so it multiplies into the plank colors
  // (base colors brightened to compensate for the ~0.7 map average)
  const woodTex = makeWoodTexture()
  const clothTex = makeClothTexture()
  clothTex.repeat.set(2, 2)
  const skinTex = makeSkinTexture()
  const hairTex = makeHairTexture()
  hairTex.repeat.set(2, 1)
  const boat = new THREE.Group()
  let fisher // the pescador sways on his own phase, offset from the hull's roll
  {
    const wood = new THREE.MeshStandardMaterial({
      color: 0x52402e, map: woodTex, bumpMap: woodTex, bumpScale: 0.03, roughness: 0.9,
    })
    const woodDark = new THREE.MeshStandardMaterial({
      color: 0x3d2e21, map: woodTex, bumpMap: woodTex, bumpScale: 0.03, roughness: 0.95,
    })
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 3.2), wood)
    hull.position.y = 0.24
    const flare = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 3.35), wood)
    flare.position.y = 0.52
    const bowGeo = new THREE.ConeGeometry(0.66, 1.35, 4)
    bowGeo.rotateX(Math.PI / 2)
    bowGeo.rotateZ(Math.PI / 4)
    const bow = new THREE.Mesh(bowGeo, wood)
    bow.position.set(0, 0.42, 2.2)
    bow.scale.set(1, 0.6, 1)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.32), woodDark)
    bench.position.y = 0.6
    const netPile = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c3a32, roughness: 1 })
    )
    netPile.position.set(0, 0.56, 1.1)
    netPile.scale.set(1.25, 0.5, 1)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 6), woodDark)
    post.position.set(0, 1.0, -1.25)
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x885022, emissive: 0xffb070, emissiveIntensity: 2 })
    )
    lamp.position.set(0, 1.52, -1.25)
    const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa868, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    lampGlow.scale.set(1.6, 1.6, 1)
    lampGlow.position.set(0, 1.52, -1.25)
    const lampLight = new THREE.PointLight(0xffa868, 3.2, 9, 1.8)
    lampLight.position.set(0, 1.55, -1.25)

    // --- el pescador: woven poncho, weathered face, chupalla; he sits on the
    // bench facing the bow, lit warm from the stern lamp behind him
    fisher = new THREE.Group()
    const ponchoMat = new THREE.MeshStandardMaterial({
      color: 0x6b5238, map: clothTex, bumpMap: clothTex, bumpScale: 0.02, roughness: 0.95,
    })
    const fisherSkin = new THREE.MeshStandardMaterial({
      color: 0xc9a07c, map: skinTex, emissive: 0x3a2618, emissiveIntensity: 0.35, roughness: 0.75,
    })
    const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 8), ponchoMat)
    poncho.position.y = 0.42
    // a second, shorter cone breaks the silhouette into shoulder-cape + skirt
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 8), ponchoMat)
    cape.position.y = 0.7
    const fHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fisherSkin)
    fHead.position.y = 0.96
    const strawMat = new THREE.MeshStandardMaterial({
      color: 0x7d6a3e, map: woodTex, roughness: 1,
    })
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.025, 10), strawMat)
    brim.position.y = 1.05
    const crownHat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 8), strawMat)
    crownHat.position.y = 1.1
    fisher.add(poncho, cape, fHead, brim, crownHat)
    fisher.position.set(0, 0.58, -0.35)

    boat.add(hull, flare, bow, bench, netPile, post, lamp, lampGlow, lampLight, fisher)
  }
  scene.add(boat)

  // ---- lantern buoys ----------------------------------------------------------
  const NORMAL_C = new THREE.Color(0xffb86b)
  const DEEP_C = new THREE.Color(0x9fffd0)
  const buoys = []
  for (let i = 0; i < S.spots.length; i++) {
    const deep = S.spots[i].deep
    const g = new THREE.Group()
    const float = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.42, 0.3, 10),
      new THREE.MeshStandardMaterial({
        color: 0x3b2d22, map: woodTex, bumpMap: woodTex, bumpScale: 0.03, roughness: 0.95,
      })
    )
    float.position.y = 0.12
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x342919, map: woodTex, roughness: 1 })
    )
    post.position.y = 0.65
    const lant = new THREE.Mesh(
      new THREE.SphereGeometry(deep ? 0.23 : 0.19, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: deep ? DEEP_C : NORMAL_C,
        emissiveIntensity: 1.6,
      })
    )
    lant.position.y = 1.22
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: deep ? DEEP_C : NORMAL_C, transparent: true,
      opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    glow.position.y = 1.22
    g.add(float, post, lant, glow)
    scene.add(g)
    buoys.push({ g, lant, glow, baseScale: deep ? 2.7 : 2.1 })
  }

  // in-range ring under the nearest buoy
  const rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.6, 40),
    new THREE.MeshBasicMaterial({
      color: 0x9fffd0, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    })
  )
  rangeRing.rotation.x = -Math.PI / 2
  rangeRing.visible = false
  scene.add(rangeRing)
  const RING_OK = new THREE.Color(0x9fffd0)
  const RING_SCARED = new THREE.Color(0x6b4438)

  // cast splash ring + rope
  const castRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.84, 32),
    new THREE.MeshBasicMaterial({
      color: 0xbfe8ff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  )
  castRing.rotation.x = -Math.PI / 2
  castRing.visible = false
  scene.add(castRing)

  const ROPE_N = 12
  const ropeGeo = new THREE.BufferGeometry()
  ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_N * 3), 3))
  const rope = new THREE.Line(
    ropeGeo,
    new THREE.LineBasicMaterial({ color: 0xd8cdb4, transparent: true, opacity: 0.45 })
  )
  rope.visible = false
  rope.frustumCulled = false
  scene.add(rope)

  // ---- La Pincoya -------------------------------------------------------------
  const PIN_X = -25, PIN_Z = -20
  const PIN_BASE_Y = 0.33
  const SEA_YAW = Math.atan2(0 - PIN_X, 4 - PIN_Z) // faces the bay
  const LAND_YAW = SEA_YAW + Math.PI
  const pin = new THREE.Group()
  let armL, armR, pinDress, pinHairBack, pinStrandL, pinStrandR, pinHairMat, crownMat
  {
    // woven dress, gradient skin, stranded hair — base colors brightened a
    // touch since the near-white maps multiply in at ~0.85 average
    const dressMat = new THREE.MeshStandardMaterial({
      color: 0x1b4136, map: clothTex, bumpMap: clothTex, bumpScale: 0.02,
      emissive: 0x0c241e, emissiveIntensity: 0.5, roughness: 0.85,
    })
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe4bd9c, map: skinTex, emissive: 0x4a3624, emissiveIntensity: 0.4, roughness: 0.7,
    })
    pinHairMat = new THREE.MeshStandardMaterial({
      color: 0xc69b45, map: hairTex, bumpMap: hairTex, bumpScale: 0.015,
      emissive: 0xc89a40, emissiveIntensity: 0.7, roughness: 0.6,
    })
    const hairMat = pinHairMat
    // dress as a lathe: cinched waist, soft S-flare to the hem — a dancing
    // silhouette instead of the old straight cone (pivot at the hem, so the
    // sway below swings her shoulders while her feet stay on the sand)
    const dressPts = [
      new THREE.Vector2(0.62, 0),
      new THREE.Vector2(0.54, 0.1),
      new THREE.Vector2(0.4, 0.38),
      new THREE.Vector2(0.3, 0.72),
      new THREE.Vector2(0.24, 1.05),
      new THREE.Vector2(0.23, 1.3),
      new THREE.Vector2(0.27, 1.46),
    ]
    pinDress = new THREE.Mesh(new THREE.LatheGeometry(dressPts, 10), dressMat)
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), dressMat)
    torso.position.y = 1.5
    torso.scale.set(1, 1.25, 0.8)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMat)
    head.position.y = 1.95
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), hairMat)
    hair.position.set(0, 2.0, -0.08)
    hair.scale.set(1, 1.25, 1)
    // long fall of hair down the back + a loose strand over each shoulder
    pinHairBack = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 7), hairMat)
    pinHairBack.position.set(0, 1.45, -0.26)
    pinHairBack.rotation.x = 0.32
    pinHairBack.scale.set(1, 1, 0.7)
    pinStrandL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.72, 5), hairMat)
    pinStrandL.position.set(-0.19, 1.6, 0.02)
    pinStrandL.rotation.z = -0.18
    pinStrandR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.72, 5), hairMat)
    pinStrandR.position.set(0.19, 1.6, 0.02)
    pinStrandR.rotation.z = 0.18
    // her crown of sargazo — sea-green glow that echoes the deep buoys
    crownMat = new THREE.MeshStandardMaterial({
      color: 0x1e5c40, emissive: 0x6fd9a0, emissiveIntensity: 0.8, roughness: 0.6,
    })
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.038, 6, 12), crownMat)
    crown.position.set(0, 2.12, -0.02)
    crown.rotation.x = Math.PI / 2 - 0.28 // tilted back into her hair
    armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.85, 6), skinMat)
    armL.position.set(-0.3, 1.85, 0)
    armL.rotation.z = -2.45
    armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.85, 6), skinMat)
    armR.position.set(0.3, 1.85, 0)
    armR.rotation.z = 2.45
    // hands close the raised-arm silhouette (the -Y cylinder end is the high one)
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat)
    handL.position.set(0, -0.46, 0)
    armL.add(handL)
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat)
    handR.position.set(0, -0.46, 0)
    armR.add(handR)
    pin.add(pinDress, torso, head, hair, pinHairBack, pinStrandL, pinStrandR, crown, armL, armR)
  }
  pin.position.set(PIN_X, PIN_BASE_Y, PIN_Z)
  pin.rotation.y = SEA_YAW
  scene.add(pin)

  const GOLD = new THREE.Color(0xffc87a)
  const COLD = new THREE.Color(0x6e8fa8)
  const pinLight = new THREE.PointLight(0xffc87a, 55, 30, 1.8)
  pinLight.position.set(PIN_X, PIN_BASE_Y + 1.6, PIN_Z)
  scene.add(pinLight)
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc87a, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  aura.position.set(PIN_X, PIN_BASE_Y + 1.5, PIN_Z)
  aura.scale.set(7, 7, 1)
  scene.add(aura)
  const auraColor = new THREE.Color(0xffc87a)
  let auraScale = 7
  let pinYaw = SEA_YAW

  // her swirl of sparkles
  const SPARK_N = 36
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_N * 3), 3))
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffd9a0, size: 0.22, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  sparks.frustumCulled = false
  scene.add(sparks)
  const GOLD_SPARK = new THREE.Color(0xffd9a0)
  const COLD_SPARK = new THREE.Color(0x7e98aa)

  // ---- particle pool ------------------------------------------------------------
  const P_N = 160
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(P_N * 3)
  const pCol = new Float32Array(P_N * 3)
  const pVel = new Float32Array(P_N * 3)
  const pBase = new Float32Array(P_N * 3)
  const pLife = new Float32Array(P_N)
  const pMax = new Float32Array(P_N)
  const pGrav = new Float32Array(P_N)
  for (let i = 0; i < P_N; i++) pPos[i * 3 + 1] = -999
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }))
  particles.frustumCulled = false
  scene.add(particles)
  let pNext = 0

  const KINDS = {
    splash: { r: 0.74, g: 0.85, b: 0.88, grav: -5, life: 0.7, spread: 1.4, up: 2.6 },
    fish: { r: 0.85, g: 0.89, b: 0.93, grav: -4.5, life: 1.1, spread: 0.8, up: 3.6 },
    dark: { r: 0.24, g: 0.31, b: 0.28, grav: -0.4, life: 1.3, spread: 0.7, up: 0.7 },
    gold: { r: 1.0, g: 0.85, b: 0.63, grav: -0.3, life: 1.4, spread: 0.9, up: 1.2 },
    wake: { r: 0.42, g: 0.55, b: 0.6, grav: -3.2, life: 0.55, spread: 0.5, up: 1.1 },
  }
  let wakeT = 0 // throttle for the lancha's stern wake
  function spawn(x, y, z, dx, dz, kind, count) {
    const k = KINDS[kind]
    for (let n = 0; n < count; n++) {
      const i = pNext
      pNext = (pNext + 1) % P_N
      const i3 = i * 3
      pPos[i3] = x; pPos[i3 + 1] = y; pPos[i3 + 2] = z
      pVel[i3] = dx * 2.6 + (Math.random() - 0.5) * k.spread * 2
      pVel[i3 + 1] = k.up * (0.6 + Math.random() * 0.8)
      pVel[i3 + 2] = dz * 2.6 + (Math.random() - 0.5) * k.spread * 2
      pBase[i3] = k.r; pBase[i3 + 1] = k.g; pBase[i3 + 2] = k.b
      pLife[i3 / 3] = pMax[i3 / 3] = k.life * (0.7 + Math.random() * 0.6)
      pGrav[i3 / 3] = k.grav
    }
  }

  // ---- preallocated temps ---------------------------------------------------------
  const _v1 = new THREE.Vector3()
  const _v2 = new THREE.Vector3()
  const _v3 = new THREE.Vector3()
  const _look = new THREE.Vector3()

  function spotPos(i, out) {
    arcPos(S.spots[i].a, SPOT_R, out)
    out.y = waveHeight(out.x, out.z, S.tVis) * 0.8 + 0.05
    return out
  }

  function burstAtSpot(i, kind, count) {
    spotPos(i, _v3)
    arcPos(S.boatA, BOAT_R, _v2)
    _v2.sub(_v3)
    _v2.y = 0
    _v2.normalize()
    spawn(_v3.x, _v3.y + 0.2, _v3.z, _v2.x * (kind === 'fish' ? 1 : 0.1), _v2.z * (kind === 'fish' ? 1 : 0.1), kind, count)
  }
  function burstAtPincoya(kind, count) {
    spawn(PIN_X, PIN_BASE_Y + 1.2, PIN_Z, 0, 0, kind, count)
  }

  // ---- per-frame update --------------------------------------------------------
  function update(tVis, dt) {
    S.tVis = tVis
    const damp = 1 - Math.exp(-3.5 * dt)

    // water verts + analytic normals
    for (let i = 0; i < wPos.count; i++) {
      const i3 = i * 3
      const x = wArr[i3]
      const z = wArr[i3 + 2]
      wArr[i3 + 1] = waveHeight(x, z - 40, tVis)
      const dydx =
        W1A * W1K * Math.cos(W1K * x + W1W * tVis) +
        W3A * W3K * Math.cos(W3K * (x + z - 40) + W3W * tVis)
      const dydz =
        W2A * W2K * Math.cos(W2K * (z - 40) - W2W * tVis) +
        W3A * W3K * Math.cos(W3K * (x + z - 40) + W3W * tVis)
      const inv = 1 / Math.sqrt(dydx * dydx + 1 + dydz * dydz)
      nArr[i3] = -dydx * inv
      nArr[i3 + 1] = inv
      nArr[i3 + 2] = -dydz * inv
    }
    wPos.needsUpdate = true
    wNor.needsUpdate = true

    // boat
    arcPos(S.boatA, BOAT_R, _v1)
    boat.position.set(_v1.x, waveHeight(_v1.x, _v1.z, tVis) + 0.02, _v1.z)
    boat.rotation.y = Math.atan2(Math.sin(S.boatA), -Math.cos(S.boatA))
    boat.rotation.z = -S.boatV * 0.55 + Math.sin(tVis * 1.7) * 0.035
    boat.rotation.x = Math.sin(tVis * 1.3 + 1) * 0.028
    // the pescador rides the roll on his own beat, half a wave behind the hull,
    // and leans into the slide the way a body braces against a moving deck
    fisher.rotation.z = Math.sin(tVis * 1.7 - 0.6) * 0.05 + S.boatV * 0.18
    fisher.rotation.x = Math.sin(tVis * 1.3 + 2.2) * 0.035

    // stern wake while the lancha slides (throttled, pooled)
    wakeT -= dt
    if (wakeT <= 0 && Math.abs(S.boatV) > 0.22) {
      wakeT = 0.11
      const ry = boat.rotation.y
      spawn(
        boat.position.x - Math.sin(ry) * 1.7,
        boat.position.y + 0.05,
        boat.position.z - Math.cos(ry) * 1.7,
        -Math.sin(ry) * 0.12,
        -Math.cos(ry) * 0.12,
        'wake',
        1
      )
    }

    // drifting micro-chop + shoreline foam breathing with the swell
    waterTex.offset.set(tVis * 0.006, tVis * -0.004)
    const fw = waveHeight(-20, -30, tVis)
    foam.position.set(-20 - 0.97 * fw * 0.9, 0.3 + fw * 0.25, -30 - 0.24 * fw * 0.9)
    foamMat.opacity = 0.13 + 0.09 * (fw / 0.34 + 1) * 0.5
    foamTex.offset.y = tVis * 0.01

    // camera follows gently; small shake
    const shx = S.shake * (Math.sin(tVis * 47) * 0.6 + Math.sin(tVis * 31) * 0.4) * 0.3
    const shy = S.shake * Math.sin(tVis * 39 + 2) * 0.22
    camera.position.set(boat.position.x * 0.2 + shx, 6.2 + shy, 23.5)
    _look.set(boat.position.x * 0.45 - 1.5, 0.5 + shy * 0.5, -8)
    camera.lookAt(_look)

    // buoys
    for (let i = 0; i < buoys.length; i++) {
      const b = buoys[i]
      const s = S.spots[i]
      arcPos(s.a, SPOT_R, _v1)
      b.g.position.set(_v1.x, waveHeight(_v1.x, _v1.z, tVis) * 0.8 - 0.06, _v1.z)
      b.g.rotation.z = Math.sin(tVis * 1.1 + i * 2.1) * 0.07
      b.g.rotation.x = Math.sin(tVis * 0.9 + i * 1.3) * 0.06
      const flick = 0.85 + 0.15 * Math.sin(tVis * 9 + i * 7)
      const sc = s.scaredT > 0 ? (s.scaredT > 2 ? 0.06 : 1 - (s.scaredT / 2) * 0.94) : 1
      b.lant.material.emissiveIntensity = 2.3 * flick * Math.max(0.05, sc)
      const inR = S.inRange === i
      b.glow.material.opacity = (0.3 + 0.6 * sc) * (inR ? 1.0 : 0.8)
      const pulse = inR ? 1.3 + Math.sin(tVis * 5) * 0.12 : 1
      const gs = b.baseScale * (0.35 + 0.65 * sc) * pulse
      b.glow.scale.set(gs, gs, 1)
    }

    // in-range ring
    if (S.inRange >= 0) {
      rangeRing.visible = true
      spotPos(S.inRange, _v1)
      rangeRing.position.set(_v1.x, _v1.y + 0.08, _v1.z)
      const scared = S.spots[S.inRange].scaredT > 0
      rangeRing.material.color.copy(scared ? RING_SCARED : RING_OK)
      rangeRing.material.opacity = (scared ? 0.3 : 0.42) + Math.sin(tVis * 4) * 0.1
    } else {
      rangeRing.visible = false
    }

    // cast visuals: rope arc 0–0.5 s, then sag + splash ring until 3 s
    if (S.casting && S.castSpot >= 0) {
      rope.visible = true
      arcPos(S.boatA, BOAT_R, _v1)
      _v1.y = boat.position.y + 0.7
      spotPos(S.castSpot, _v2)
      const throwK = Math.min(1, S.castT / 0.5)
      const arr = ropeGeo.attributes.position.array
      for (let i = 0; i < ROPE_N; i++) {
        const f = (i / (ROPE_N - 1)) * throwK
        const x = _v1.x + (_v2.x - _v1.x) * f
        const z = _v1.z + (_v2.z - _v1.z) * f
        let y = _v1.y + (_v2.y - _v1.y) * f
        y += throwK < 1 ? Math.sin(f * Math.PI) * 1.9 : Math.sin(f * Math.PI) * -0.35
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z
      }
      ropeGeo.attributes.position.needsUpdate = true
      if (S.castT >= 0.5) {
        castRing.visible = true
        const k2 = (S.castT - 0.5) / 2.5
        castRing.position.set(_v2.x, _v2.y + 0.06, _v2.z)
        const rs = 1 + k2 * 1.9
        castRing.scale.set(rs, rs, 1)
        castRing.material.opacity = 0.5 * (1 - k2)
      }
    } else {
      rope.visible = false
      castRing.visible = false
    }

    // La Pincoya — mood (facing + telegraph) and dance
    const facingSea = S.facing === 'sea'
    const showSea = S.telegraph ? !facingSea : facingSea // telegraph previews the turn
    const amp = S.telegraph ? 0.22 : 1 // she slows before turning
    auraColor.lerp(showSea ? GOLD : COLD, damp)
    pinLight.color.copy(auraColor)
    aura.material.color.copy(auraColor)
    pinLight.intensity += ((showSea ? 75 : 10) - pinLight.intensity) * damp
    auraScale += ((showSea ? 7.4 : 3.4) - auraScale) * damp
    aura.scale.set(auraScale, auraScale, 1)
    aura.material.opacity = showSea ? 0.55 + Math.sin(tVis * 2.2) * 0.08 : 0.3
    sparkMat.color.lerp(showSea ? GOLD_SPARK : COLD_SPARK, damp)
    sparkMat.opacity = showSea ? 0.85 : 0.3

    const targetYaw = facingSea ? SEA_YAW : LAND_YAW
    pinYaw += (targetYaw - pinYaw) * Math.min(1, 4 * dt)
    pin.rotation.y = pinYaw + Math.sin(tVis * 1.3) * 0.3 * amp
    pin.position.y = PIN_BASE_Y + Math.abs(Math.sin(tVis * 2.6)) * 0.17 * amp
    armL.rotation.z = -2.45 + Math.sin(tVis * 2.6) * 0.2 * amp
    armR.rotation.z = 2.45 - Math.sin(tVis * 2.6 + 0.7) * 0.2 * amp
    // secondary motion: cloth and hair trail the body by a phase, like water
    // does — dress pivots at the hem so the sway reads as hips, not sliding
    pinDress.rotation.z = Math.sin(tVis * 1.3 - 0.55) * 0.07 * amp
    pinDress.rotation.x = Math.sin(tVis * 2.6 - 0.8) * 0.045 * amp
    pinHairBack.rotation.x = 0.32 + Math.sin(tVis * 2.6 - 1.1) * 0.1 * amp
    pinHairBack.rotation.z = Math.sin(tVis * 1.3 - 0.9) * 0.09 * amp
    pinStrandL.rotation.z = -0.18 + Math.sin(tVis * 2.6 - 1.4) * 0.09 * amp
    pinStrandR.rotation.z = 0.18 - Math.sin(tVis * 2.6 - 0.9) * 0.09 * amp
    // her hair burns gold when she gives herself to the sea, dims with her back
    pinHairMat.emissiveIntensity += ((showSea ? 0.85 : 0.4) - pinHairMat.emissiveIntensity) * damp
    // the sargazo crown breathes with the same pulse as her aura
    crownMat.emissiveIntensity = (showSea ? 0.95 : 0.55) + Math.sin(tVis * 2.2) * 0.18 * amp

    // sparkle swirl
    {
      const arr = sparkGeo.attributes.position.array
      for (let i = 0; i < SPARK_N; i++) {
        const ph = i * 1.7
        const r = 0.9 + 0.4 * Math.sin(tVis * 0.9 + ph)
        const an = tVis * (0.55 + (i % 5) * 0.06) + ph
        arr[i * 3] = PIN_X + Math.cos(an) * r
        arr[i * 3 + 1] = PIN_BASE_Y + 0.3 + (Math.sin(tVis * 0.8 + ph * 2) + 1) * 0.95
        arr[i * 3 + 2] = PIN_Z + Math.sin(an) * r
      }
      sparkGeo.attributes.position.needsUpdate = true
    }

    // moon slides to the horizon; dawn bleeds in
    const k = S.timerK // 0 fresh night → 1 dawn
    moon.position.y = 42 - 37 * k
    moonGlow.position.copy(moon.position)
    // keep the billboard in front of the disc plane — their intersection used
    // to depth-clip the additive glow into a hard diagonal seam across the moon
    moonGlow.position.z += 6
    moonLight.intensity = 1.15 - 0.5 * k
    const dawnK = Math.max(0, (k - 0.7) / 0.3)
    dawn.material.opacity = dawnK * 0.55
    scene.background.copy(BG_NIGHT).lerp(BG_DAWN, dawnK)
    starMat.opacity = (0.85 - 0.45 * dawnK) * (0.85 + 0.15 * Math.sin(tVis * 0.7))
    // glitter path strengthens as the moon drops to a low angle, dies at dawn
    moonPathMat.opacity = (0.3 + 0.32 * k) * (1 - dawnK * 0.8) + Math.sin(tVis * 2.3) * 0.03
    glitterTex.offset.y = tVis * 0.02

    // particles
    for (let i = 0; i < P_N; i++) {
      if (pLife[i] <= 0) continue
      pLife[i] -= dt
      const i3 = i * 3
      if (pLife[i] <= 0) {
        pPos[i3 + 1] = -999
        continue
      }
      pVel[i3 + 1] += pGrav[i] * dt
      pPos[i3] += pVel[i3] * dt
      pPos[i3 + 1] += pVel[i3 + 1] * dt
      pPos[i3 + 2] += pVel[i3 + 2] * dt
      if (pPos[i3 + 1] < -0.3) pPos[i3 + 1] = -999, pLife[i] = 0
      const f = pLife[i] / pMax[i]
      pCol[i3] = pBase[i3] * f
      pCol[i3 + 1] = pBase[i3 + 1] * f
      pCol[i3 + 2] = pBase[i3 + 2] * f
    }
    pGeo.attributes.position.needsUpdate = true
    pGeo.attributes.color.needsUpdate = true
  }

  return { scene, camera, update, burstAtSpot, burstAtPincoya, spotPos }
}
