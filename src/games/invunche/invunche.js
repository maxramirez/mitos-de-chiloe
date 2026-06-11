// EL INVUNCHE · invunche.js — the guardian. A hunched shape that shuffles
// cell-to-cell; the body is built facing AWAY from where it walks, with the
// twisted-backward face (canvas-painted, stitched mouth, red eyes) looking
// along its direction of travel. Silhouette: hump, shoulder knots, pale
// vertebrae down the bent spine, twisted neck, dragging clawed hand, bare
// feet (one bound sole pressed against the back). Hide/skin canvases carry
// the brujos' suture seams, doubling as bumpMaps. Secondary motion: breathing
// that quickens with proximity, a searching head off-beat from the body sway,
// arm pendulum, a rare spasm in the folded leg. AI: lurks near uncollected
// seals, hunts the last noise it heard (your sprint), and presses the player
// once the door is open. Pathing is BFS over maze cells; all decisions use
// the seeded sim rng so manual stepping stays deterministic. No allocations
// in update().

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

  // hollowed cheeks — hunger carved under the bone
  for (const sx of [-1, 1]) {
    g.save()
    g.translate(256 + sx * 92, 318)
    g.scale(0.55, 1)
    const hol = g.createRadialGradient(0, 0, 4, 0, 0, 54)
    hol.addColorStop(0, 'rgba(20,13,9,0.3)')
    hol.addColorStop(1, 'rgba(20,13,9,0)')
    g.fillStyle = hol
    g.beginPath()
    g.arc(0, 0, 54, 0, 6.3)
    g.fill()
    g.restore()
  }

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

  // candle under-light — the warm sheen that climbs the jaw from below
  g.save()
  g.translate(256, 396)
  g.scale(1.35, 0.8)
  const under = g.createRadialGradient(0, 0, 8, 0, 0, 130)
  under.addColorStop(0, 'rgba(255,186,118,0.14)')
  under.addColorStop(0.6, 'rgba(255,160,90,0.06)')
  under.addColorStop(1, 'rgba(255,150,80,0)')
  g.fillStyle = under
  g.beginPath()
  g.arc(0, 0, 130, 0, 6.3)
  g.fill()
  g.restore()

  // wet glints on brow and cheekbones — cave damp catching the flame
  for (const [gx, gy, gr] of [[176, 196, 2.2], [330, 192, 2.0], [150, 290, 1.6], [362, 288, 1.8], [240, 160, 1.4]]) {
    g.fillStyle = 'rgba(235,225,205,0.5)'
    g.beginPath()
    g.arc(gx + Math.random() * 4, gy + Math.random() * 4, gr, 0, 6.3)
    g.fill()
  }

  // a thin wet streak escaping the sewn mouth corner
  const dro = g.createLinearGradient(348, 384, 356, 446)
  dro.addColorStop(0, 'rgba(190,200,190,0.4)')
  dro.addColorStop(1, 'rgba(190,200,190,0)')
  g.strokeStyle = dro
  g.lineWidth = 2.2
  g.beginPath()
  g.moveTo(348, 384)
  g.quadraticCurveTo(354, 414, 352, 446)
  g.stroke()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// matted wet hide — dark base with directional clumped strokes and a few
// mange-pale patches. Visual only (Math.random, never the sim rng). The same
// canvas doubles as bumpMap: three samples the red channel, and the stroke
// value variation gives the clumps real relief under the candle.
function hideTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#2b211a'
  g.fillRect(0, 0, 256, 256)
  // mange patches (worn skin showing through)
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 14 + Math.random() * 26
    const grad = g.createRadialGradient(x, y, 2, x, y, r)
    grad.addColorStop(0, 'rgba(92,74,56,0.5)')
    grad.addColorStop(1, 'rgba(92,74,56,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, 6.3)
    g.fill()
  }
  // clumped strokes, loosely vertical — wet fur drag
  for (let i = 0; i < 540; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const len = 6 + Math.random() * 18
    const lean = (Math.random() - 0.5) * 0.7
    const v = 18 + Math.random() * 48
    g.strokeStyle = 'rgba(' + (v + 14) + ',' + (v + 4) + ',' + v + ',' + (0.25 + Math.random() * 0.4).toFixed(2) + ')'
    g.lineWidth = 0.8 + Math.random() * 1.6
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + lean * len * 0.6, y + len * 0.5, x + lean * len, y + len)
    g.stroke()
  }
  // dark spine band — a shadowed groove down the hide
  const band = g.createLinearGradient(96, 0, 168, 0)
  band.addColorStop(0, 'rgba(16,11,8,0)')
  band.addColorStop(0.5, 'rgba(16,11,8,0.3)')
  band.addColorStop(1, 'rgba(16,11,8,0)')
  g.fillStyle = band
  g.fillRect(96, 0, 72, 256)
  // the brujos' stitching — crooked suture seams: dark groove, puckered pale
  // edge, rough cross-ticks. They double as bump grooves under the candle.
  for (let s = 0; s < 3; s++) {
    let x = 30 + Math.random() * 180
    let y = 6 + Math.random() * 40
    const px = [x]
    const py = [y]
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.45) * 24
      y += 26 + Math.random() * 16
      px.push(x)
      py.push(y)
    }
    g.strokeStyle = 'rgba(12,8,5,0.85)'
    g.lineWidth = 2.6
    g.beginPath()
    g.moveTo(px[0], py[0])
    for (let k = 1; k < px.length; k++) g.lineTo(px[k], py[k])
    g.stroke()
    g.strokeStyle = 'rgba(132,108,84,0.35)'
    g.lineWidth = 1.2
    g.beginPath()
    g.moveTo(px[0] + 2, py[0])
    for (let k = 1; k < px.length; k++) g.lineTo(px[k] + 2, py[k])
    g.stroke()
    g.strokeStyle = 'rgba(18,12,8,0.8)'
    g.lineWidth = 1.6
    for (let k = 0; k < px.length - 1; k++) {
      const mx = (px[k] + px[k + 1]) / 2
      const my = (py[k] + py[k + 1]) / 2
      g.beginPath()
      g.moveTo(mx - 7, my - 3)
      g.lineTo(mx + 7, my + 3)
      g.stroke()
    }
  }
  // sparse wet glints
  for (let i = 0; i < 50; i++) {
    g.fillStyle = 'rgba(120,110,95,' + (0.12 + Math.random() * 0.2).toFixed(2) + ')'
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 2.6)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// sickly mottled skin for the head — pale blotches, faint veins.
function skinTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#6e5c49'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 70; i++) {
    const warm = Math.random() > 0.5
    g.fillStyle = warm
      ? 'rgba(130,108,84,' + (0.1 + Math.random() * 0.2).toFixed(2) + ')'
      : 'rgba(52,42,33,' + (0.1 + Math.random() * 0.22).toFixed(2) + ')'
    g.save()
    g.translate(Math.random() * 128, Math.random() * 128)
    g.scale(1, 0.5 + Math.random())
    g.beginPath()
    g.arc(0, 0, 3 + Math.random() * 11, 0, 6.3)
    g.fill()
    g.restore()
  }
  // faint veins
  g.strokeStyle = 'rgba(58,52,58,0.35)'
  g.lineWidth = 1
  for (let i = 0; i < 9; i++) {
    let x = Math.random() * 128
    let y = Math.random() * 128
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 26
      y += (Math.random() - 0.5) * 26
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // the healed seam where the head was turned — groove, scar edge, ticks
  g.strokeStyle = 'rgba(46,34,26,0.7)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(4, 92)
  g.quadraticCurveTo(64, 86 + Math.random() * 8, 124, 94)
  g.stroke()
  g.strokeStyle = 'rgba(150,124,96,0.4)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(4, 95)
  g.quadraticCurveTo(64, 90 + Math.random() * 8, 124, 97)
  g.stroke()
  g.strokeStyle = 'rgba(40,30,22,0.65)'
  for (let i = 0; i < 9; i++) {
    const x = 10 + i * 13
    g.beginPath()
    g.moveTo(x, 85)
    g.lineTo(x + 3, 101)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createInvunche(wall, rng, startCx, startCz) {
  // ---------- body (faces +z; +z is its direction of travel) ----------
  const group = new THREE.Group()
  const hideTex = hideTexture()
  const skinTex = skinTexture()
  const hide = new THREE.MeshStandardMaterial({
    map: hideTex,
    bumpMap: hideTex,
    bumpScale: 0.5,
    color: 0xc9bcae, // multiplies the dark map back toward its old key
    roughness: 0.82,
    metalness: 0.04,
  })
  const skin = new THREE.MeshStandardMaterial({
    map: skinTex,
    bumpMap: skinTex,
    bumpScale: 0.25,
    color: 0xfff6ea,
    roughness: 0.74,
  })

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), hide)
  torso.scale.set(0.92, 1.3, 0.72)
  torso.position.set(0, 0.82, -0.06)
  torso.rotation.x = -0.32 // hunched away from the face
  group.add(torso)

  // hunch hump — the spine's wave breaking over the shoulders
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 7), hide)
  hump.scale.set(0.8, 0.6, 0.72)
  hump.position.set(0, 1.12, -0.3)
  group.add(hump)

  // shoulder knots
  const shoulderGeo = new THREE.SphereGeometry(0.13, 7, 6)
  const shoulderL = new THREE.Mesh(shoulderGeo, hide)
  shoulderL.scale.set(1, 0.85, 1.1)
  shoulderL.position.set(-0.33, 1.05, -0.06)
  group.add(shoulderL)
  const shoulderR = new THREE.Mesh(shoulderGeo, hide)
  shoulderR.scale.set(0.92, 0.8, 1.05)
  shoulderR.position.set(0.33, 1.08, -0.02)
  group.add(shoulderR)

  // vertebrae — pale knobs surfacing along the bent spine
  const vertGeo = new THREE.SphereGeometry(0.038, 6, 5)
  const vertPos = [[0, 0.98, -0.4], [0, 1.12, -0.42], [0, 1.27, -0.36], [0, 1.38, -0.24], [0, 1.44, -0.1]]
  for (let i = 0; i < vertPos.length; i++) {
    const v = new THREE.Mesh(vertGeo, skin)
    v.position.set(vertPos[i][0], vertPos[i][1], vertPos[i][2])
    v.scale.setScalar(1 - i * 0.08)
    group.add(v)
  }

  // twisted neck — sinew holding the turned head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.2, 7), skin)
  neck.position.set(0, 1.34, 0.05)
  neck.rotation.x = 0.28
  neck.rotation.z = 0.14
  group.add(neck)

  // head group — head, face, eyes and eye-light move as one searching unit
  const headGrp = new THREE.Group()
  headGrp.position.set(0, 1.46, 0.08)
  group.add(headGrp)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin)
  head.scale.set(0.92, 1.05, 0.95)
  headGrp.add(head)

  const faceTex = faceTexture()
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.56),
    new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.85 })
  )
  face.position.set(0, -0.01, 0.23)
  headGrp.add(face)

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0503,
    emissive: 0xff2412,
    emissiveIntensity: 2.5,
  })
  const eyeGeo = new THREE.SphereGeometry(0.032, 6, 6)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.085, 0.03, 0.24)
  headGrp.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeR.position.set(0.085, 0.03, 0.24)
  headGrp.add(eyeR)

  // the eye-glow that tints the fog around corners (rides the searching head)
  const eyeLight = new THREE.PointLight(0xff2412, 0, 11, 1.8)
  eyeLight.position.set(0, 0.04, 0.22)
  headGrp.add(eyeLight)

  // arms — one long, knuckles dragging; hands parented so they ride the swing
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.92, 6), hide)
  armL.position.set(-0.36, 0.62, 0)
  armL.rotation.z = 0.28
  group.add(armL)
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 6), skin)
  handL.scale.set(1, 0.7, 1.2)
  handL.position.set(0, -0.5, 0.02)
  armL.add(handL)
  const fingerGeo = new THREE.ConeGeometry(0.022, 0.17, 5)
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(fingerGeo, skin)
    f.position.set(-0.045 + i * 0.045, -0.56, 0.06)
    f.rotation.x = 2.5 + i * 0.12 // curled down-forward, scraping the stone
    f.rotation.z = (i - 1) * 0.18
    armL.add(f)
  }
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.6, 6), hide)
  armR.position.set(0.34, 0.78, 0.04)
  armR.rotation.z = -0.5
  group.add(armR)
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), skin)
  handR.scale.set(1, 0.8, 1.1)
  handR.position.set(0, -0.34, 0)
  armR.add(handR)

  // the standing leg, with a splayed bare foot
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.78, 7), hide)
  leg.position.set(-0.06, 0.36, -0.02)
  group.add(leg)
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), skin)
  foot.scale.set(1, 0.45, 1.7)
  foot.position.set(0, -0.38, 0.07)
  leg.add(foot)

  // the other leg, folded against the spine — sole pressed to the back
  const folded1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 6), hide)
  folded1.position.set(0.1, 1.0, -0.42)
  folded1.rotation.x = 1.9
  group.add(folded1)
  const folded2 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.42, 6), hide)
  folded2.position.set(0.1, 1.32, -0.5)
  folded2.rotation.x = 0.5
  group.add(folded2)
  const foldedFoot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), skin)
  foldedFoot.scale.set(0.9, 0.5, 1.5)
  foldedFoot.position.set(0, 0.24, -0.02)
  folded2.add(foldedFoot)

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
  let proxK = 0 // cached proximity — drives the breathing rate

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
    if (interval < 0.9) interval = 0.9 // floor: a full sprint must stay barely winnable

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
      } else if (mode === 'hunt') {
        // arrived where he heard you — keep hunting while the noise persists,
        // so onMode('hunt') only fires on genuine lurk→hunt transitions
        if (heardTimer > 0) {
          plan(heardIdx)
        } else {
          mode = 'lurk'
          dwell = 2 + rng() * 2.5
        }
      } else {
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

    // secondary motion (allocation-free) — breath that quickens as he nears,
    // a head that searches off-beat from the body sway, the long arm swinging
    // behind the shuffle, the bound leg spasming every dozen seconds
    const br = Math.sin(t * (1.8 + proxK * 2.6))
    torso.scale.set(0.92, 1.3 + 0.028 * br, 0.72 + 0.03 * br)
    hump.position.y = 1.12 + 0.012 * br
    headGrp.rotation.y = Math.sin(t * 0.6) * 0.16
    headGrp.rotation.z = Math.sin(t * 1.3 + 1.7) * 0.05
    headGrp.rotation.x = moveT < 1 ? Math.sin(e * Math.PI * 2) * 0.07 : Math.sin(t * 0.9 + 0.4) * 0.03
    armL.rotation.x = (moveT < 1 ? Math.sin(e * Math.PI * 2 + 0.9) * 0.16 : 0) + Math.sin(t * 1.1 + 0.8) * 0.05
    armR.rotation.z = -0.5 + Math.sin(t * 2.3 + 3) * 0.05
    const sp = Math.sin(t * 0.53 + 1.2)
    folded2.rotation.x = 0.5 + (sp > 0 ? Math.pow(sp, 14) * 0.42 : 0)
  }

  // proximity drives the red glow (and eye heat, and how hard he breathes)
  function setProximity(p) {
    const k = p < 0 ? 0 : p > 1 ? 1 : p
    proxK = k
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
