// EL INVUNCHE · world.js — builds the cave from maze data: instanced wet-rock
// walls (vertex-color grime + per-instance tint), floor/ceiling, six faintly
// lit sconces, three sigil seal-stones in dead ends, the daylight door with
// its cold seam, the map fragment near spawn, and the hand candle. Every
// texture is painted on a canvas at boot; every light exists from boot and is
// only intensity-managed (constant light count = no shader recompiles).

import * as THREE from 'three'
import { CELLS, TILES, TILE, WALL_H, DX, DZ, tileIndex, cellCenter, openBetween } from './maze.js'

// ---------- procedural textures --------------------------------------------
function grimeTexture(rng) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#8b8b86'
  g.fillRect(0, 0, 256, 256)
  // mottle
  for (let i = 0; i < 900; i++) {
    const v = 95 + (rng() * 80) | 0
    g.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + v + ',' + (0.1 + rng() * 0.25).toFixed(2) + ')'
    const r = 2 + rng() * 14
    g.beginPath()
    g.arc(rng() * 256, rng() * 256, r, 0, 6.3)
    g.fill()
  }
  // wet drip streaks
  for (let i = 0; i < 60; i++) {
    const x = rng() * 256
    const y = rng() * 120
    const len = 30 + rng() * 120
    const grad = g.createLinearGradient(x, y, x, y + len)
    grad.addColorStop(0, 'rgba(38,52,46,0.0)')
    grad.addColorStop(0.4, 'rgba(38,52,46,' + (0.12 + rng() * 0.2).toFixed(2) + ')')
    grad.addColorStop(1, 'rgba(30,40,36,0.0)')
    g.fillStyle = grad
    g.fillRect(x, y, 1 + rng() * 2.5, len)
  }
  // pale mineral specks
  for (let i = 0; i < 160; i++) {
    g.fillStyle = 'rgba(205,210,200,' + (0.05 + rng() * 0.12).toFixed(2) + ')'
    g.fillRect(rng() * 256, rng() * 256, 1.5, 1.5)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// grayscale relief for bumpMap use (linear space, red channel sampled):
// soft lumps up and down plus a few hairline cracks — quiet, never noisy.
function reliefTexture(rng) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#808080'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 380; i++) {
    const x = rng() * 256
    const y = rng() * 256
    const r = 3 + rng() * 17
    const v = rng() > 0.5 ? 255 : 0
    const grad = g.createRadialGradient(x, y, 1, x, y, r)
    grad.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',' + (0.09 + rng() * 0.15).toFixed(2) + ')')
    grad.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, 6.3)
    g.fill()
  }
  // hairline cracks (shallow dark grooves)
  g.strokeStyle = 'rgba(40,40,40,0.5)'
  g.lineWidth = 1.2
  for (let i = 0; i < 14; i++) {
    let x = rng() * 256
    let y = rng() * 256
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 5; s++) {
      x += (rng() - 0.5) * 46
      y += (rng() - 0.3) * 40
      g.lineTo(x, y)
    }
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// roughness map for the floor: dry rock stays matte, puddle blobs go glassy —
// the candle sparkles in them as you walk. Linear space, red channel.
function puddleRoughnessTexture(rng) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#c2c2c2' // dry rock ≈ 0.76 roughness
  g.fillRect(0, 0, 256, 256)
  // broad damp patches
  for (let i = 0; i < 26; i++) {
    const x = rng() * 256
    const y = rng() * 256
    const r = 18 + rng() * 44
    const grad = g.createRadialGradient(x, y, 2, x, y, r)
    grad.addColorStop(0, 'rgba(110,110,110,0.55)')
    grad.addColorStop(1, 'rgba(110,110,110,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, 6.3)
    g.fill()
  }
  // standing puddles — small, sharp, near-mirror
  for (let i = 0; i < 15; i++) {
    const x = rng() * 256
    const y = rng() * 256
    const r = 7 + rng() * 17
    const grad = g.createRadialGradient(x, y, 1, x, y, r)
    grad.addColorStop(0, 'rgba(22,22,22,0.95)')
    grad.addColorStop(0.72, 'rgba(30,30,30,0.85)')
    grad.addColorStop(1, 'rgba(60,60,60,0)')
    g.fillStyle = grad
    g.save()
    g.translate(x, y)
    g.scale(1, 0.55 + rng() * 0.7)
    g.beginPath()
    g.arc(0, 0, r, 0, 6.3)
    g.fill()
    g.restore()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// soft daylight gradient for the door glow plane — misty cold light, not a
// flat quad: near-white low center sinking to a deep grey-blue at the edges.
function daylightTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#8fa9bf'
  g.fillRect(0, 0, 128, 128)
  const grad = g.createRadialGradient(64, 86, 4, 64, 80, 95)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, '#e9f3fb')
  grad.addColorStop(0.7, '#bdd3e4')
  grad.addColorStop(1, '#8fa9bf')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function flameTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 36, 1, 32, 34, 30)
  grad.addColorStop(0, 'rgba(255,250,230,1)')
  grad.addColorStop(0.25, 'rgba(255,205,120,0.9)')
  grad.addColorStop(0.55, 'rgba(255,140,50,0.42)')
  grad.addColorStop(1, 'rgba(120,40,10,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function sigilTexture(rng, variant) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.clearRect(0, 0, 128, 128)
  g.strokeStyle = '#9fffd0'
  g.fillStyle = '#9fffd0'
  g.shadowColor = '#9fffd0'
  g.shadowBlur = 9
  g.lineWidth = 2.4
  g.translate(64, 64)
  g.beginPath()
  g.arc(0, 0, 46, 0, 6.3)
  g.stroke()
  // inner polygon
  const sides = 3 + variant
  g.beginPath()
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + variant * 0.7
    const x = Math.cos(a) * 30
    const y = Math.sin(a) * 30
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  // radial ticks
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng()
    g.beginPath()
    g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40)
    g.lineTo(Math.cos(a) * (48 + rng() * 4), Math.sin(a) * (48 + rng() * 4))
    g.stroke()
  }
  // center eye / glyph
  g.beginPath()
  g.arc(0, 0, 6 + variant * 2, 0, 6.3)
  g.fill()
  for (let i = 0; i < 3 + variant; i++) {
    const a = rng() * Math.PI * 2
    g.beginPath()
    g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10)
    g.lineTo(Math.cos(a) * (18 + rng() * 8), Math.sin(a) * (18 + rng() * 8))
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function mapTexture(wall) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  // aged parchment
  g.fillStyle = '#b9a87f'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(90,70,40,' + (0.03 + Math.random() * 0.07).toFixed(2) + ')'
    g.beginPath()
    g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 16, 0, 6.3)
    g.fill()
  }
  // ink maze — shape only, no markers (the fragment does not know you)
  const s = 216 / TILES
  const off = 20
  g.fillStyle = 'rgba(43,34,22,0.88)'
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      if (wall[tileIndex(tx, tz)] === 1) g.fillRect(off + tx * s, off + tz * s, s + 0.5, s + 0.5)
    }
  }
  // scorched, torn edges
  const grad = g.createRadialGradient(128, 128, 95, 128, 128, 185)
  grad.addColorStop(0, 'rgba(40,28,14,0)')
  grad.addColorStop(1, 'rgba(24,16,8,0.9)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(60,45,25,0.85)'
  g.font = 'italic 17px Georgia'
  g.textAlign = 'center'
  g.fillText('Q u i c a v í', 128, 247)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---------- world ------------------------------------------------------------
export function createWorld(scene, wall, layout, rng) {
  const grime = grimeTexture(rng)
  grime.repeat.set(1, 1)
  const relief = reliefTexture(rng)
  relief.repeat.set(1, 1)
  const flameTex = flameTexture()

  // --- instanced walls with vertex-color grime ---
  const doorT = layout.doorTile
  let wallCount = 0
  for (let i = 0; i < TILES * TILES; i++) {
    if (wall[i] === 1) wallCount++
  }
  wallCount-- // door tile gets a real door instead

  const boxGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE)
  const vCount = boxGeo.attributes.position.count
  const vcol = new Float32Array(vCount * 3)
  for (let i = 0; i < vCount; i++) {
    const y = boxGeo.attributes.position.getY(i)
    const t = y / WALL_H + 0.5 // 0 bottom, 1 top
    const k = t * t * (3 - 2 * t)
    vcol[i * 3] = 0.4 + 0.55 * k
    vcol[i * 3 + 1] = 0.48 + 0.48 * k
    vcol[i * 3 + 2] = 0.43 + 0.5 * k
  }
  boxGeo.setAttribute('color', new THREE.BufferAttribute(vcol, 3))

  const wallMat = new THREE.MeshStandardMaterial({
    map: grime,
    bumpMap: relief,
    bumpScale: 0.6,
    color: 0x97a39a,
    roughness: 0.72,
    metalness: 0.04,
    vertexColors: true,
  })
  const walls = new THREE.InstancedMesh(boxGeo, wallMat, wallCount)
  const _m = new THREE.Matrix4()
  const _c = new THREE.Color()
  let wi = 0
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      if (wall[tileIndex(tx, tz)] !== 1) continue
      if (tx === doorT[0] && tz === doorT[1]) continue
      _m.makeTranslation((tx + 0.5) * TILE, WALL_H / 2, (tz + 0.5) * TILE)
      walls.setMatrixAt(wi, _m)
      const shade = 0.74 + rng() * 0.32
      _c.setRGB(shade * 0.93, shade, shade * 0.95)
      walls.setColorAt(wi, _c)
      wi++
    }
  }
  walls.instanceMatrix.needsUpdate = true
  if (walls.instanceColor) walls.instanceColor.needsUpdate = true
  scene.add(walls)

  // --- floor (puddle-mapped wet sheen) + ceiling ---
  const SIZE = TILES * TILE
  const floorTex = grime.clone()
  floorTex.needsUpdate = true
  floorTex.repeat.set(22, 22)
  const floorBump = relief.clone()
  floorBump.needsUpdate = true
  floorBump.repeat.set(22, 22)
  const puddles = puddleRoughnessTexture(rng)
  puddles.repeat.set(9, 9) // off-step with the grime so repeats never lock
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      bumpMap: floorBump,
      bumpScale: 0.4,
      roughnessMap: puddles,
      color: 0x47544e,
      roughness: 1.0, // texel-driven: dry rock matte, puddles near-mirror
      metalness: 0.14,
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(SIZE / 2, 0, SIZE / 2)
  scene.add(floor)

  const ceilTex = grime.clone()
  ceilTex.needsUpdate = true
  ceilTex.repeat.set(18, 18)
  const ceilBump = relief.clone()
  ceilBump.needsUpdate = true
  ceilBump.repeat.set(18, 18)
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ map: ceilTex, bumpMap: ceilBump, bumpScale: 0.5, color: 0x39433e, roughness: 0.95 })
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(SIZE / 2, WALL_H - 0.02, SIZE / 2)
  scene.add(ceiling)

  // --- stalactites: one instanced mesh, open tiles only, tips ≥ 2.6 m so the
  // player never clips them. Built once at boot; zero per-frame cost.
  const stalSpots = []
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      if (wall[tileIndex(tx, tz)] !== 0) continue
      if (rng() > 0.34) continue
      stalSpots.push(
        (tx + 0.22 + rng() * 0.56) * TILE, // jittered, kept off wall faces
        (tz + 0.22 + rng() * 0.56) * TILE,
        0.3 + rng() * 0.65, // length
        0.6 + rng() * 0.9, // girth scale
        rng() * 0.4 + 0.72 // shade
      )
    }
  }
  const stalGeo = new THREE.ConeGeometry(0.13, 1, 7)
  stalGeo.rotateX(Math.PI) // point down
  stalGeo.translate(0, -0.5, 0) // base (ceiling attachment) at y = 0
  const stalMat = new THREE.MeshStandardMaterial({
    map: grime,
    bumpMap: relief,
    bumpScale: 0.4,
    color: 0x717d76,
    roughness: 0.62,
    metalness: 0.05,
  })
  const stalCount = stalSpots.length / 5
  const stalactites = new THREE.InstancedMesh(stalGeo, stalMat, stalCount)
  const _sm = new THREE.Matrix4()
  const _sq = new THREE.Quaternion()
  const _sv = new THREE.Vector3()
  const _ss = new THREE.Vector3()
  const _se = new THREE.Euler()
  for (let i = 0; i < stalCount; i++) {
    const sx = stalSpots[i * 5]
    const sz = stalSpots[i * 5 + 1]
    const h = stalSpots[i * 5 + 2]
    const w = stalSpots[i * 5 + 3]
    _se.set((rng() - 0.5) * 0.12, rng() * Math.PI * 2, (rng() - 0.5) * 0.12)
    _sq.setFromEuler(_se)
    _sv.set(sx, WALL_H - 0.01, sz)
    _ss.set(w, h, w)
    _sm.compose(_sv, _sq, _ss)
    stalactites.setMatrixAt(i, _sm)
    const sh = stalSpots[i * 5 + 4]
    _c.setRGB(sh * 0.92, sh, sh * 0.96)
    stalactites.setColorAt(i, _c)
  }
  stalactites.instanceMatrix.needsUpdate = true
  if (stalactites.instanceColor) stalactites.instanceColor.needsUpdate = true
  scene.add(stalactites)

  // --- map fragment on the wall near spawn (maze shape only) ---
  const mapMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshStandardMaterial({ map: mapTexture(wall), roughness: 0.92 })
  )
  mapMesh.position.set(cellCenter(layout.spawn[0]), 1.62, (2 * layout.spawn[1]) * TILE + TILE + 0.02)
  scene.add(mapMesh)

  // --- sconces (6) ---
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.55, metalness: 0.75 })
  const stubMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb2, roughness: 0.85 })
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    color: 0xffc070,
  })
  const sconces = []
  for (let i = 0; i < layout.sconceCells.length; i++) {
    const [cx, cz] = layout.sconceCells[i]
    // pick a closed wall of this cell to hang the sconce on
    let d = -1
    const r0 = (rng() * 4) | 0
    for (let k = 0; k < 4; k++) {
      const dd = (r0 + k) % 4
      if (!openBetween(wall, cx, cz, dd)) {
        d = dd
        break
      }
    }
    const px = cellCenter(cx) + (d >= 0 ? DX[d] : 0) * (TILE / 2 - 0.17)
    const pz = cellCenter(cz) + (d >= 0 ? DZ[d] : 0) * (TILE / 2 - 0.17)
    const grp = new THREE.Group()
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.07), ironMat)
    bracket.position.y = 1.52
    grp.add(bracket)
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.05, 8), ironMat)
    pan.position.y = 1.71
    grp.add(pan)
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 8), stubMat)
    stub.position.y = 1.8
    grp.add(stub)
    const flame = new THREE.Sprite(flameMat)
    flame.scale.set(0.17, 0.26, 1)
    flame.position.y = 1.98
    grp.add(flame)
    const light = new THREE.PointLight(0xff9a40, 3, 8, 1.9)
    light.position.y = 1.95
    grp.add(light)
    grp.position.set(px, 0, pz)
    scene.add(grp)
    sconces.push({ x: px, z: pz, cell: [cx, cz], used: false, light, flame, stub })
  }

  // --- seals (3 sigil stones in dead ends) ---
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a3330, roughness: 0.8, metalness: 0.05 })
  const seals = []
  for (let i = 0; i < layout.sealCells.length; i++) {
    const [cx, cz] = layout.sealCells[i]
    let dOpen = 0
    for (let d = 0; d < 4; d++) {
      if (openBetween(wall, cx, cz, d)) {
        dOpen = d
        break
      }
    }
    const bx = -DX[dOpen]
    const bz = -DZ[dOpen]
    const px = cellCenter(cx) + bx * (TILE / 2 - 0.55)
    const pz = cellCenter(cz) + bz * (TILE / 2 - 0.55)
    const grp = new THREE.Group()
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.52, 0.22), stoneMat)
    slab.position.y = 0.78
    slab.rotation.z = 0.05
    grp.add(slab)
    const sigilMat = new THREE.MeshBasicMaterial({
      map: sigilTexture(rng, i),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), sigilMat)
    sigil.position.set(0, 0.86, 0.13)
    grp.add(sigil)
    const light = new THREE.PointLight(0x9fffd0, 2.2, 7, 2.0)
    light.position.y = 1.2
    grp.add(light)
    grp.position.set(px, 0, pz)
    grp.rotation.y = Math.atan2(DX[dOpen], DZ[dOpen])
    scene.add(grp)
    seals.push({ x: px, z: pz, cell: [cx, cz], collected: false, fade: 1, light, sigilMat, grp })
  }

  // --- the daylight door ---
  const dDir = layout.doorDir
  const dirX = DX[dDir]
  const dirZ = DZ[dDir]
  const doorCx = (doorT[0] + 0.5) * TILE
  const doorCz = (doorT[1] + 0.5) * TILE
  const yawForDir = dDir === 0 ? -Math.PI / 2 : dDir === 1 ? Math.PI / 2 : dDir === 2 ? Math.PI : 0

  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE - 0.14, WALL_H - 0.12, 0.7),
    new THREE.MeshStandardMaterial({ map: grime, color: 0x3a322a, roughness: 0.85 })
  )
  doorMesh.position.set(doorCx, (WALL_H - 0.12) / 2, doorCz)
  doorMesh.rotation.y = yawForDir
  scene.add(doorMesh)

  // glow plane sits just OUTSIDE the slab: only its rim shows while closed —
  // the cold seam of daylight — and the whole plane when the door sinks.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE - 0.02, WALL_H),
    new THREE.MeshBasicMaterial({ map: daylightTexture(), fog: false, side: THREE.DoubleSide })
  )
  glow.position.set(doorCx + dirX * 0.42, WALL_H / 2, doorCz + dirZ * 0.42)
  glow.rotation.y = yawForDir
  scene.add(glow)

  // explicit seam strips on the maze side of the slab: two jambs + a sill,
  // cold daylight cracking around the door. Hidden once the door sinks.
  const seamMat = new THREE.MeshBasicMaterial({
    color: 0xcfe6f8,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  })
  const seams = new THREE.Group()
  const perpX = dirZ
  const perpZ = dirX
  const sfx = doorCx - dirX * 0.37
  const sfz = doorCz - dirZ * 0.37
  const jambGeo = new THREE.PlaneGeometry(0.028, WALL_H - 0.2)
  const jambL = new THREE.Mesh(jambGeo, seamMat)
  jambL.position.set(sfx + perpX * (TILE / 2 - 0.12), (WALL_H - 0.2) / 2, sfz + perpZ * (TILE / 2 - 0.12))
  jambL.rotation.y = yawForDir
  seams.add(jambL)
  const jambR = new THREE.Mesh(jambGeo, seamMat)
  jambR.position.set(sfx - perpX * (TILE / 2 - 0.12), (WALL_H - 0.2) / 2, sfz - perpZ * (TILE / 2 - 0.12))
  jambR.rotation.y = yawForDir
  seams.add(jambR)
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 0.24, 0.045), seamMat)
  sill.position.set(sfx, 0.09, sfz)
  sill.rotation.y = yawForDir
  seams.add(sill)
  scene.add(seams)

  const daylight = new THREE.PointLight(0xbfe2ff, 0.8, 30, 1.6)
  daylight.position.set(doorCx + dirX * 1.1, 2.0, doorCz + dirZ * 1.1)
  scene.add(daylight)

  const door = {
    x: doorCx,
    z: doorCz,
    tile: doorT,
    opening: false,
    openT: 0,
    isOpen() {
      return this.openT >= 0.95
    },
  }

  // --- the hand candle (light is created here; main parents it to camera) ---
  const candleGroup = new THREE.Group()
  const waxMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.021, 0.13, 8), stubMat)
  candleGroup.add(waxMesh)
  const handFlame = new THREE.Sprite(flameMat.clone())
  handFlame.scale.set(0.07, 0.11, 1)
  handFlame.position.y = 0.115
  candleGroup.add(handFlame)
  candleGroup.position.set(0.3, -0.33, -0.52)
  candleGroup.rotation.z = 0.06
  const candleLight = new THREE.PointLight(0xffb35c, 15, 15.6, 1.6)
  candleLight.position.set(0.05, -0.05, -0.25)

  // very faint ambient so near rock never collapses to pure void
  scene.add(new THREE.AmbientLight(0x16201e, 0.22))

  // --- per-frame visual update (allocation-free) ---
  // candle: { wax01, dieFactor, flare }
  function update(dt, simT, candle) {
    // hand candle
    const flick = Math.sin(simT * 11.7) * 0.9 + Math.sin(simT * 23.3) * 0.6 + Math.sin(simT * 5.1) * 0.5
    const gutter = (1 - candle.wax01) * Math.sin(simT * 31.7) * 1.6
    candleLight.intensity = Math.max(0, (15 + flick * 1.8 + gutter * 2) * candle.dieFactor * (1 + candle.flare * 0.9))
    candleLight.distance = 2.6 + 13.4 * Math.sqrt(candle.wax01 > 0 ? candle.wax01 : 0) * candle.dieFactor + 0.6
    waxMesh.scale.y = 0.22 + 0.78 * candle.wax01
    waxMesh.position.y = -0.08 * (1 - waxMesh.scale.y)
    const fs = (1 + 0.16 * Math.sin(simT * 13.1) + 0.1 * Math.sin(simT * 29.7)) * candle.dieFactor
    handFlame.scale.set(0.07 * fs, 0.11 * fs, 1)
    handFlame.material.opacity = Math.min(1, candle.dieFactor * 1.2)

    // sconces
    for (let i = 0; i < sconces.length; i++) {
      const s = sconces[i]
      if (s.used) continue
      s.light.intensity = 3 + Math.sin(simT * 8.7 + i * 1.71) * 0.7
      const fsc = 1 + 0.14 * Math.sin(simT * 12.3 + i * 2.3)
      s.flame.scale.set(0.17 * fsc, 0.26 * fsc, 1)
    }

    // seals
    for (let i = 0; i < seals.length; i++) {
      const s = seals[i]
      if (s.collected && s.fade > 0) {
        s.fade = Math.max(0, s.fade - dt / 1.2)
      }
      const pulse = 0.72 + 0.28 * Math.sin(simT * 2.1 + i * 2.1)
      s.sigilMat.opacity = pulse * s.fade
      s.light.intensity = (2.0 + 0.7 * Math.sin(simT * 2.1 + i * 2.1)) * s.fade
    }

    // door + seam breathing
    seamMat.opacity = 0.55 + 0.18 * Math.sin(simT * 1.3)
    if (door.opening && door.openT < 1) {
      door.openT = Math.min(1, door.openT + dt / 2.4)
      doorMesh.position.y = (WALL_H - 0.12) / 2 - door.openT * WALL_H
      daylight.intensity = 0.8 + door.openT * 9
      if (door.openT > 0.06) seams.visible = false
    }
  }

  function collectSeal(i) {
    seals[i].collected = true
  }

  function useSconce(i) {
    const s = sconces[i]
    s.used = true
    s.flame.visible = false
    s.light.intensity = 0.04
    s.stub.scale.y = 0.3
    s.stub.position.y = 1.75
  }

  function openDoor() {
    door.opening = true
  }

  return {
    sconces,
    seals,
    door,
    candleGroup,
    candleLight,
    update,
    collectSeal,
    useSconce,
    openDoor,
  }
}
