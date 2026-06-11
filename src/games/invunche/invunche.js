// EL INVUNCHE · invunche.js — the guardian. A hunched shape that shuffles
// cell-to-cell; the body is built facing AWAY from where it walks, with the
// twisted-backward face (canvas-painted, stitched mouth, red eyes) looking
// along its direction of travel. AI: lurks near uncollected seals, hunts the
// last noise it heard (your sprint), and presses the player once the door is
// open. Pathing is BFS over maze cells; all decisions use the seeded sim rng
// so manual stepping stays deterministic. No allocations in update().

import * as THREE from 'three'
import { CELLS, cellIndex, cellCenter, pathBetween } from './maze.js'

function faceTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.clearRect(0, 0, 512, 512)

  // skin — a pale oval sinking into dark
  g.save()
  g.translate(256, 268)
  g.scale(1, 1.22)
  const skin = g.createRadialGradient(0, -10, 10, 0, 0, 178)
  skin.addColorStop(0, '#8f7c66')
  skin.addColorStop(0.5, '#6e5b48')
  skin.addColorStop(0.8, '#3a2e24')
  skin.addColorStop(1, 'rgba(26,20,15,0)')
  g.fillStyle = skin
  g.beginPath()
  g.arc(0, 0, 178, 0, 6.3)
  g.fill()
  g.restore()

  // mottled blotches
  for (let i = 0; i < 46; i++) {
    g.fillStyle = 'rgba(40,30,22,' + (0.06 + Math.random() * 0.12).toFixed(2) + ')'
    g.save()
    g.translate(110 + Math.random() * 290, 120 + Math.random() * 300)
    g.scale(1, 0.5 + Math.random())
    g.beginPath()
    g.arc(0, 0, 6 + Math.random() * 22, 0, 6.3)
    g.fill()
    g.restore()
  }

  // brow shadow
  g.save()
  g.translate(256, 196)
  g.scale(1.5, 0.5)
  const brow = g.createRadialGradient(0, 0, 5, 0, 0, 95)
  brow.addColorStop(0, 'rgba(18,12,8,0.55)')
  brow.addColorStop(1, 'rgba(18,12,8,0)')
  g.fillStyle = brow
  g.beginPath()
  g.arc(0, 0, 95, 0, 6.3)
  g.fill()
  g.restore()

  // eye sockets + red irises
  for (const ex of [184, 328]) {
    const sock = g.createRadialGradient(ex, 240, 4, ex, 240, 44)
    sock.addColorStop(0, 'rgba(8,5,4,0.96)')
    sock.addColorStop(0.7, 'rgba(14,9,7,0.8)')
    sock.addColorStop(1, 'rgba(20,14,10,0)')
    g.fillStyle = sock
    g.beginPath()
    g.arc(ex, 240, 44, 0, 6.3)
    g.fill()
    g.shadowColor = '#ff2412'
    g.shadowBlur = 26
    g.fillStyle = '#e0220e'
    g.beginPath()
    g.arc(ex + 4, 244, 7.5, 0, 6.3)
    g.fill()
    g.shadowBlur = 0
    g.fillStyle = 'rgba(255,235,220,0.8)'
    g.beginPath()
    g.arc(ex + 1, 241, 1.8, 0, 6.3)
    g.fill()
  }

  // nose shadow
  g.strokeStyle = 'rgba(24,16,11,0.5)'
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(252, 268)
  g.quadraticCurveTo(244, 308, 252, 326)
  g.stroke()

  // the sewn mouth — crooked seam with rough stitches
  g.strokeStyle = 'rgba(16,10,7,0.92)'
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(168, 372)
  g.quadraticCurveTo(238, 392, 256, 384)
  g.quadraticCurveTo(296, 370, 348, 382)
  g.stroke()
  g.lineWidth = 4
  for (let i = 0; i < 8; i++) {
    const t = i / 7
    const x = 176 + t * 164
    const y = 374 + Math.sin(t * Math.PI) * 12 + (i % 2) * 3
    g.strokeStyle = 'rgba(20,13,9,0.9)'
    g.beginPath()
    g.moveTo(x - 4, y - 13)
    g.lineTo(x + 5, y + 13)
    g.stroke()
    g.strokeStyle = 'rgba(150,125,100,0.4)' // puckered scar skin
    g.beginPath()
    g.moveTo(x - 8, y + 2)
    g.lineTo(x + 8, y - 2)
    g.stroke()
  }

  // wrinkles
  g.strokeStyle = 'rgba(30,22,16,0.3)'
  g.lineWidth = 2.5
  for (let i = 0; i < 7; i++) {
    const y = 150 + i * 9
    g.beginPath()
    g.moveTo(200 + i * 4, y)
    g.quadraticCurveTo(256, y - 8, 312 - i * 4, y)
    g.stroke()
  }
  for (const [x0, y0, x1, y1] of [[160, 300, 178, 350], [352, 300, 334, 350], [216, 412, 240, 432], [296, 412, 272, 432]]) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.quadraticCurveTo((x0 + x1) / 2 + 6, (y0 + y1) / 2, x1, y1)
    g.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createInvunche(wall, rng, startCx, startCz) {
  // ---------- body (faces +z; +z is its direction of travel) ----------
  const group = new THREE.Group()
  const hide = new THREE.MeshStandardMaterial({ color: 0x271d16, roughness: 0.95 })
  const skin = new THREE.MeshStandardMaterial({ color: 0x71604d, roughness: 0.9 })

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), hide)
  torso.scale.set(0.92, 1.3, 0.72)
  torso.position.set(0, 0.82, -0.06)
  torso.rotation.x = -0.32 // hunched away from the face
  group.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin)
  head.scale.set(0.92, 1.05, 0.95)
  head.position.set(0, 1.46, 0.08)
  group.add(head)

  const faceTex = faceTexture()
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.56),
    new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.85 })
  )
  face.position.set(0, 1.45, 0.31)
  group.add(face)

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0503,
    emissive: 0xff2412,
    emissiveIntensity: 2.5,
  })
  const eyeGeo = new THREE.SphereGeometry(0.032, 6, 6)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.085, 1.49, 0.32)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeR.position.set(0.085, 1.49, 0.32)
  group.add(eyeR)

  // the eye-glow that tints the fog around corners
  const eyeLight = new THREE.PointLight(0xff2412, 0, 11, 1.8)
  eyeLight.position.set(0, 1.5, 0.3)
  group.add(eyeLight)

  // arms — one long, knuckles dragging
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.92, 6), hide)
  armL.position.set(-0.36, 0.62, 0)
  armL.rotation.z = 0.28
  group.add(armL)
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.6, 6), hide)
  armR.position.set(0.34, 0.78, 0.04)
  armR.rotation.z = -0.5
  group.add(armR)

  // the standing leg
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.78, 7), hide)
  leg.position.set(-0.06, 0.36, -0.02)
  group.add(leg)

  // the other leg, folded against the spine
  const folded1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6), hide)
  folded1.position.set(0.1, 1.0, -0.42)
  folded1.rotation.x = 1.9
  group.add(folded1)
  const folded2 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.42, 6), hide)
  folded2.position.set(0.1, 1.32, -0.5)
  folded2.rotation.x = 0.5
  group.add(folded2)

  // ---------- the close-up for the catch (parented to camera by main) ------
  const scareFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 2.05),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, fog: false })
  )
  scareFace.visible = false

  // ---------- AI state ----------
  let cx = startCx
  let cz = startCz
  let nextCx = startCx
  let nextCz = startCz
  let fromX = cellCenter(cx)
  let fromZ = cellCenter(cz)
  let toX = fromX
  let toZ = fromZ
  let moveT = 1
  let yaw = 0
  let yawTarget = 0
  let t = 0 // own clock (deterministic with stepped dt)

  const path = new Int16Array(CELLS * CELLS)
  let pathLen = 0
  let pathPos = 0
  let targetIdx = -1
  let mode = 'lurk'
  let dwell = 2.5
  let heardIdx = -1
  let heardTimer = 0

  let onStep = null
  let onMode = null

  group.position.set(fromX, 0, fromZ)

  function hear(cellIdx, urgent) {
    heardIdx = cellIdx
    heardTimer = urgent ? 5 : 2.5
  }

  function plan(toIdx) {
    targetIdx = toIdx
    pathLen = pathBetween(wall, cellIndex(cx, cz), toIdx, path)
    pathPos = 1 // path[0] is the cell he stands in
  }

  function beginStep() {
    const n = path[pathPos]
    pathPos++
    nextCx = n % CELLS
    nextCz = (n / CELLS) | 0
    fromX = cellCenter(cx)
    fromZ = cellCenter(cz)
    toX = cellCenter(nextCx)
    toZ = cellCenter(nextCz)
    yawTarget = Math.atan2(toX - fromX, toZ - fromZ)
    moveT = 0
    if (onStep) onStep()
  }

  function pickLurkTarget(env) {
    if (env.sealCount > 0) {
      // linger near the seals the player still needs
      if (rng() < 0.7) return env.sealIdx[(rng() * env.sealCount) | 0]
      return cellIndex((rng() * CELLS) | 0, (rng() * CELLS) | 0)
    }
    // every seal taken: he presses toward the player
    if (rng() < 0.7) return env.playerCellIdx
    return cellIndex((rng() * CELLS) | 0, (rng() * CELLS) | 0)
  }

  // env: { elapsed, doorOpen, playerCellIdx, sealIdx, sealCount }
  function update(dt, env) {
    t += dt
    if (heardTimer > 0) heardTimer -= dt

    const ramp = env.elapsed / 300 > 1 ? 1 : env.elapsed / 300
    let interval = 1.7 + (0.95 - 1.7) * ramp
    if (mode === 'hunt') interval *= 0.72
    if (env.doorOpen) interval *= 0.82

    if (moveT < 1) {
      moveT += dt / interval
      if (moveT >= 1) {
        moveT = 1
        cx = nextCx
        cz = nextCz
      }
    }

    if (moveT >= 1) {
      // settled in a cell — decide
      if (heardTimer > 0 && (mode !== 'hunt' || targetIdx !== heardIdx)) {
        const was = mode
        mode = 'hunt'
        plan(heardIdx)
        if (was !== 'hunt' && onMode) onMode('hunt')
      }
      if (pathPos < pathLen) {
        beginStep()
      } else {
        if (mode === 'hunt') {
          mode = 'lurk'
          dwell = 2 + rng() * 2.5
        }
        dwell -= dt
        if (dwell <= 0) {
          plan(pickLurkTarget(env))
          dwell = 1.5 + rng() * 3
        }
      }
    }

    // world transform — shuffle, drag, sway
    const e = moveT >= 1 ? 1 : moveT * moveT * (3 - 2 * moveT)
    const wx = fromX + (toX - fromX) * e
    const wz = fromZ + (toZ - fromZ) * e
    const hop = moveT < 1 ? Math.abs(Math.sin(e * Math.PI)) * 0.13 : 0
    const idle = Math.sin(t * 1.7) * 0.02
    group.position.set(wx, hop + idle, wz)
    let dy = yawTarget - yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    yaw += dy * (dt * 6 > 1 ? 1 : dt * 6)
    group.rotation.y = yaw
    group.rotation.z = moveT < 1 ? Math.sin(e * Math.PI * 2) * 0.09 : Math.sin(t * 1.3) * 0.02
  }

  // proximity drives the red glow (and eye heat)
  function setProximity(p) {
    const k = p < 0 ? 0 : p > 1 ? 1 : p
    eyeLight.intensity = k * k * 6 + (k > 0.02 ? Math.sin(t * 7.3) * 0.4 * k : 0)
    eyeMat.emissiveIntensity = 2 + 4 * k
  }

  function moveTo(ncx, ncz) {
    cx = nextCx = ncx
    cz = nextCz = ncz
    fromX = toX = cellCenter(ncx)
    fromZ = toZ = cellCenter(ncz)
    moveT = 1
    pathLen = 0
    pathPos = 0
    mode = 'lurk'
    dwell = 1.5
    group.position.set(fromX, 0, fromZ)
  }

  return {
    group,
    scareFace,
    update,
    hear,
    setProximity,
    moveTo,
    get cellX() { return cx },
    get cellZ() { return cz },
    get worldX() { return group.position.x },
    get worldZ() { return group.position.z },
    get mode() { return mode },
    set onStep(fn) { onStep = fn },
    set onMode(fn) { onMode = fn },
  }
}
