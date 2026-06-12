// world.js — LA CIUDAD DE LOS CÉSARES · scene building.
// OrthographicCamera down the exact (1,1,1) diagonal; pale parchment-gold and
// teal geometry, flat-lit (hemisphere + one directional), gentle distance
// dimming via a soft Fog toward the ink-blue background. All geometry is
// three.js primitives — no external assets.

import * as THREE from 'three'

export const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize()
export const CAM_DIST = 34
export const TILE_H = 0.14

// ---------------------------------------------------------------- renderer
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  return renderer
}

export function createCamera() {
  return new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120)
}

// position the iso camera so `center` is mid-frame at half-height `view`
export function applyFrame(camera, center, view, aspect) {
  camera.position.copy(ISO_DIR).multiplyScalar(CAM_DIST).add(center)
  camera.lookAt(center)
  camera.left = -view * aspect
  camera.right = view * aspect
  camera.top = view
  camera.bottom = -view
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x33414f, 1.05)
  scene.add(hemi)
  const dir = new THREE.DirectionalLight(0xfff1d4, 1.7)
  scene.add(dir)
  scene.add(dir.target)
  return {
    hemi,
    dir,
    center(c) {
      dir.position.set(c.x + 6, c.y + 10, c.z + 4)
      dir.target.position.copy(c)
    },
  }
}

// ---------------------------------------------------------------- pilgrim
export function createPilgrim() {
  const g = new THREE.Group()
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xe3dac2, roughness: 0.8 })
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x2c5f63, roughness: 0.85 })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xcdb288, roughness: 0.7 })
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.44, 10), robeMat)
  robe.position.y = 0.22
  g.add(robe)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skinMat)
  head.position.y = 0.47
  g.add(head)
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), hoodMat)
  hood.position.y = 0.54
  g.add(hood)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), robeMat)
  arm.position.set(0.13, 0.3, 0.05)
  g.add(arm)
  const lantMat = new THREE.MeshStandardMaterial({
    color: 0x6b5128, emissive: 0xffd9a0, emissiveIntensity: 1.7, roughness: 0.5,
  })
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), lantMat)
  lantern.position.set(0.13, 0.245, 0.11)
  g.add(lantern)
  const light = new THREE.PointLight(0xffc985, 0.85, 2.6, 1.8)
  light.position.set(0.13, 0.3, 0.11)
  g.add(light)
  return { group: g, lanternMat: lantMat, light }
}

// ---------------------------------------------------------------- level
function pyramidTip(w, d, h, mat) {
  const geo = new THREE.CylinderGeometry(0.707, 0.02, 1, 4, 1)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.y = Math.PI / 4
  m.scale.set(w, h, d)
  return m
}

export function buildLevel(def) {
  const group = new THREE.Group()
  const mats = {
    gold: new THREE.MeshStandardMaterial({ color: 0xe7d6a6, roughness: 0.88 }),
    goldHi: new THREE.MeshStandardMaterial({ color: 0xf4e6bc, roughness: 0.8 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x3e8d84, roughness: 0.8 }),
    tealDeep: new THREE.MeshStandardMaterial({ color: 0x2b5f5b, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8fa0b3, roughness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0x3a2c12, emissive: 0xffd9a0, emissiveIntensity: 0.55, roughness: 0.6,
    }),
  }
  const matList = Object.values(mats)
  const windows = [] // emissive window meshes — they flare on the final win
  const assemble = [] // top-level pieces, animated in by the level transition

  function add(mesh, parent) {
    ;(parent || group).add(mesh)
    return mesh
  }
  function box(cx, cy, cz, sx, sy, sz, mat, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
    m.position.set(cx, cy, cz)
    return add(m, parent)
  }

  // --- decorative geometry ------------------------------------------------
  for (const it of def.geo) {
    const t = it[0]
    if (t === 'slab') {
      box(it[1], it[2] - TILE_H - 0.19, it[3], it[4], 0.38, it[5], mats.gold)
    } else if (t === 'pier') {
      const cx = it[1]
      const cz = it[2]
      const topY = it[3]
      const w = it[4]
      const d = it[5]
      const bottom = -2.4
      const h = topY - bottom
      const piece = new THREE.Group()
      piece.position.set(cx, 0, cz)
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.gold)
      body.position.y = bottom + h / 2
      piece.add(body)
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.16, d + 0.06), mats.teal)
      band.position.y = topY - 0.34
      piece.add(band)
      const tip = pyramidTip(w, d, 1.15, mats.tealDeep)
      tip.position.y = bottom - 0.55
      piece.add(tip)
      add(piece)
    } else if (t === 'turret') {
      const piece = new THREE.Group()
      piece.position.set(it[1], it[2], it[3])
      const h = it[4]
      const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, h, 8), mats.gold)
      bodyM.position.y = h / 2
      piece.add(bodyM)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 8), mats.tealDeep)
      roof.position.y = h + 0.24
      piece.add(roof)
      add(piece)
    } else if (t === 'dome') {
      const r = it[4]
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.goldHi
      )
      m.position.set(it[1], it[2], it[3])
      add(m)
    } else if (t === 'fin') {
      const s = it[4]
      const tip = pyramidTip(s, s, 0.55, mats.teal)
      tip.position.set(it[1], it[2] - TILE_H - 0.38 - 0.28, it[3])
      add(tip)
    } else if (t === 'box') {
      box(it[1], it[2], it[3], it[4], it[5], it[6], mats[it[7]] || mats.gold)
    } else if (t === 'win') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), mats.glow.clone())
      m.material.emissiveIntensity = 0.5
      matList.push(m.material)
      m.position.set(it[1], it[2], it[3])
      const f = it[4]
      if (f === 'x+') m.rotation.y = Math.PI / 2
      else if (f === 'x-') m.rotation.y = -Math.PI / 2
      else if (f === 'z-') m.rotation.y = Math.PI
      add(m)
      windows.push(m.material)
    }
  }

  // --- rotors ---------------------------------------------------------------
  const rotorBuilds = []
  for (const rd of def.rotors) {
    const rg = new THREE.Group()
    rg.position.set(rd.pivot[0], rd.pivot[1], rd.pivot[2])
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.3, 12), mats.stone)
    hub.position.y = -TILE_H - 0.29
    rg.add(hub)
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.045, 8, 24), mats.glow.clone())
    ringM.material.emissiveIntensity = 0.22
    matList.push(ringM.material)
    ringM.rotation.x = Math.PI / 2
    ringM.position.y = -TILE_H - 0.18
    rg.add(ringM)
    if (rd.kind === 'bridge') {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.9, TILE_H, 0.86), mats.teal)
      deck.position.y = -TILE_H - TILE_H / 2
      if (rd.along === 'z') deck.rotation.y = Math.PI / 2
      rg.add(deck)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.glow.clone())
      matList.push(knob.material)
      knob.position.set(rd.along === 'z' ? 0.55 : 0, -0.05, rd.along === 'z' ? 0 : 0.55)
      rg.add(knob)
    } else if (rd.kind === 'disc') {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, TILE_H, 24), mats.teal)
      deck.position.y = -TILE_H - TILE_H / 2
      rg.add(deck)
      const path = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.02, 2.9), mats.tealDeep)
      path.position.y = -TILE_H + 0.01
      rg.add(path)
      for (const sx of [-1.15, 1.15]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 6), mats.stone)
        post.position.set(sx, 0.03, 0)
        rg.add(post)
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mats.glow.clone())
        matList.push(knob.material)
        knob.position.set(sx, 0.24, 0)
        rg.add(knob)
      }
    } else { // 'arm' — asymmetric half arm reaching to local z = −2
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.86, TILE_H, 2.0), mats.teal)
      deck.position.set(0, -TILE_H - TILE_H / 2, -1.45)
      rg.add(deck)
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), mats.stone)
      counter.position.set(0, -TILE_H - 0.1, 0.62)
      rg.add(counter)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mats.glow.clone())
      matList.push(knob.material)
      knob.position.set(0, 0.12, 0.62)
      rg.add(knob)
    }
    add(rg)
    rotorBuilds.push({ group: rg, ringMat: ringM.material })
  }

  // --- nodes: walk tiles + markers (and auto stairs for sloped edges) -----
  const tileGeo = new THREE.BoxGeometry(0.92, TILE_H, 0.92)
  const markGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.028, 10)
  const markers = {}
  for (const n of def.nodes) {
    const parent = n.l ? rotorBuilds[n.r].group : group
    const px = n.l ? n.l[0] : n.p[0]
    const py = n.l ? n.l[1] : n.p[1]
    const pz = n.l ? n.l[2] : n.p[2]
    const tile = new THREE.Mesh(tileGeo, mats.goldHi)
    tile.position.set(px, py - TILE_H / 2 + (n.l ? 0.012 : 0), pz)
    parent.add(tile)
    const mm = new THREE.MeshStandardMaterial({
      color: 0x5a4a28, emissive: 0xffe2b0, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.9, roughness: 0.6,
    })
    matList.push(mm)
    const mark = new THREE.Mesh(markGeo, mm)
    mark.position.set(px, py + 0.03, pz)
    parent.add(mark)
    markers[n.id] = mm
  }
  // stairs for static edges with a height difference
  const byId = {}
  for (const n of def.nodes) byId[n.id] = n
  for (const e of def.edges) {
    if (e.r !== undefined) continue
    const a = byId[e.a]
    const b = byId[e.b]
    if (a.l || b.l) continue
    const dy = b.p[1] - a.p[1]
    if (Math.abs(dy) < 0.01) continue
    const lo = dy > 0 ? a.p : b.p
    const hi = dy > 0 ? b.p : a.p
    const steps = Math.max(2, Math.round(Math.abs(dy) / 0.25))
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps
      const topT = (k + 1) / steps
      const sx = lo[0] + (hi[0] - lo[0]) * t
      const sz = lo[2] + (hi[2] - lo[2]) * t
      const topY = lo[1] + (hi[1] - lo[1]) * topT
      box(sx, topY - 0.11, sz, Math.abs(hi[0] - lo[0]) > 0 ? 1 / steps : 0.86,
        0.22, Math.abs(hi[2] - lo[2]) > 0 ? 1 / steps : 0.86, mats.goldHi)
    }
  }

  // --- the puerta — a glowing arch at the door node -----------------------
  const dn = byId[def.door]
  const doorG = new THREE.Group()
  doorG.position.set(dn.p[0], dn.p[1], dn.p[2])
  const alongX = def.doorAxis === 'x'
  for (const s of [-0.43, 0.43]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), mats.goldHi)
    pil.position.set(alongX ? 0 : s, 0.6, alongX ? s : 0)
    doorG.add(pil)
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.26 : 1.3, 0.24, alongX ? 1.3 : 0.26), mats.teal
  )
  lintel.position.y = 1.3
  doorG.add(lintel)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.42, 4), mats.tealDeep)
  cap.rotation.y = Math.PI / 4
  cap.scale.set(alongX ? 0.45 : 1.3, 1, alongX ? 1.3 : 0.45)
  cap.position.y = 1.63
  doorG.add(cap)
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x241a0c, emissive: 0xffd9a0, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  })
  matList.push(glowMat)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.14), glowMat)
  glow.position.y = 0.6
  if (alongX) glow.rotation.y = Math.PI / 2
  doorG.add(glow)
  const doorLight = new THREE.PointLight(0xffc585, 0.5, 5, 1.8)
  doorLight.position.y = 0.85
  doorG.add(doorLight)
  add(doorG)

  // pieces that assemble out of the fog between levels
  for (const child of group.children) assemble.push({ obj: child, y0: child.position.y })

  return { group, rotors: rotorBuilds, markers, windows, doorGlow: glowMat, doorLight, mats: matList, assemble }
}

export function disposeLevel(handle) {
  handle.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material && !Array.isArray(o.material)) o.material.dispose()
  })
}

// ---------------------------------------------------------------- fog puffs
export function createPuffs(n) {
  const cnv = document.createElement('canvas')
  cnv.width = cnv.height = 64
  const c = cnv.getContext('2d')
  const grad = c.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(220,230,245,0.55)')
  grad.addColorStop(1, 'rgba(220,230,245,0)')
  c.fillStyle = grad
  c.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(cnv)
  const group = new THREE.Group()
  const pool = []
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    sp.visible = false
    group.add(sp)
    pool.push({ sp, t: 1, dur: 1, scale: 1 })
  }
  let next = 0
  return {
    group,
    spawn(x, y, z, scale) {
      const p = pool[next]
      next = (next + 1) % pool.length
      p.sp.position.set(x, y, z)
      p.t = 0
      p.dur = 0.9 + Math.random() * 0.7
      p.scale = scale
      p.sp.visible = true
    },
    update(dt) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]
        if (!p.sp.visible) continue
        p.t += dt / p.dur
        if (p.t >= 1) {
          p.sp.visible = false
          continue
        }
        const a = Math.sin(p.t * Math.PI)
        p.sp.material.opacity = a * 0.5
        const s = p.scale * (0.6 + p.t * 0.9)
        p.sp.scale.set(s, s, 1)
      }
    },
  }
}
