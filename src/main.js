import * as THREE from 'three'
import { createTerrain, terrainHeight } from './world/terrain.js'
import { createWater } from './world/water.js'
import { createSky } from './world/sky.js'
import { BEINGS } from './beings/registry.js'
import { createCaleuche } from './caleuche.js'
import { createPlayer } from './player.js'
import { ui } from './ui.js'

const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.3
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1600)

const sky = createSky(scene)
scene.add(createTerrain())
const water = createWater()
scene.add(water.object3d)

const beings = BEINGS.map((entry) => {
  const inst = entry.factory()
  inst.group.position.copy(entry.position)
  scene.add(inst.group)
  return { entry, inst, found: false }
})

// --- old dock on the eastern shore ---
let shoreX = 150
for (let x = 60; x < 280; x += 2) {
  if (terrainHeight(x, 0) < 0.4) {
    shoreX = x
    break
  }
}
const DOCK_LEN = 30
const boardPoint = new THREE.Vector3(shoreX + DOCK_LEN - 4, 1.0, 0)

function buildDock(x0) {
  const g = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 })
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DOCK_LEN + 10, 0.3, 4.4), wood)
  deck.position.set(x0 + (DOCK_LEN + 10) / 2 - 6, 0.85, 0)
  g.add(deck)
  for (let i = 0; i <= 5; i++) {
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 6), wood)
      post.position.set(x0 - 4 + i * ((DOCK_LEN + 8) / 5), -0.4, s * 2.0)
      g.add(post)
    }
  }
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), wood)
  lampPost.position.set(x0 + DOCK_LEN - 5, 2.1, 0)
  g.add(lampPost)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x110a00, emissive: 0xffc87a, emissiveIntensity: 2.5 })
  )
  bulb.position.set(x0 + DOCK_LEN - 5, 3.0, 0)
  g.add(bulb)
  const lamp = new THREE.PointLight(0xffc87a, 20, 28, 1.8)
  lamp.position.set(x0 + DOCK_LEN - 5, 3.1, 0)
  g.add(lamp)
  return g
}
scene.add(buildDock(shoreX))

function onDock(x, z) {
  return Math.abs(z) < 2.4 && x > shoreX - 8 && x < shoreX + DOCK_LEN + 2
}
const groundHeight = (x, z) => (onDock(x, z) ? Math.max(terrainHeight(x, z), 1.0) : terrainHeight(x, z))
const isWalkable = (x, z) => onDock(x, z) || terrainHeight(x, z) > -1.1

// the fisher's lantern — warm near-field light that follows the camera
scene.add(camera)
const lantern = new THREE.PointLight(0xffd9a0, 26, 20, 1.7)
lantern.position.set(0.4, -0.5, -0.6)
camera.add(lantern)

const player = createPlayer(camera, renderer.domElement, { groundHeight, isWalkable })
player.setPosition(0, -150, Math.PI)
player.enabled = false

const caleuche = createCaleuche()
caleuche.group.visible = false
scene.add(caleuche.group)
const CALEUCHE_SAIL_SECONDS = 50
const caleucheStart = new THREE.Vector3(shoreX + 330, 0, 190)
const caleucheEnd = new THREE.Vector3(shoreX + DOCK_LEN + 26, 0, 0)
let caleucheProgress = -1 // -1 = not summoned, 0..1 = sailing in

const state = { started: false, won: false, modal: false }

ui.init()
ui.showTitle(beginGame)

function beginGame() {
  if (state.started) return
  state.started = true
  player.enabled = true
  player.requestLock()
}

const foundCount = () => beings.reduce((n, b) => n + (b.found ? 1 : 0), 0)

function checkEncounters() {
  const p = player.position
  for (const b of beings) {
    if (b.found) continue
    const dx = b.entry.position.x - p.x
    const dz = b.entry.position.z - p.z
    if (dx * dx + dz * dz < b.entry.radius * b.entry.radius) {
      b.found = true
      state.modal = true
      player.enabled = false
      ui.showEncounter(b.entry, () => {
        state.modal = false
        if (!state.won) {
          player.enabled = true
          player.requestLock()
        }
        if (foundCount() === beings.length && caleucheProgress < 0) summonCaleuche()
      })
      break
    }
  }
}

function summonCaleuche() {
  caleucheProgress = 0
  caleuche.group.visible = true
  caleuche.group.position.copy(caleucheStart)
  ui.showBanner('El Caleuche ha aparecido… The ghost ship makes for the old dock on the eastern shore. Board it!')
}

const _dir = new THREE.Vector3()
function updateCaleuche(dt, t) {
  if (caleucheProgress < 0) return
  caleucheProgress = Math.min(caleucheProgress + dt / CALEUCHE_SAIL_SECONDS, 1)
  const e = caleucheProgress * caleucheProgress * (3 - 2 * caleucheProgress)
  caleuche.group.position.lerpVectors(caleucheStart, caleucheEnd, e)
  _dir.subVectors(caleucheEnd, caleucheStart)
  caleuche.group.rotation.y = Math.atan2(_dir.x, _dir.z)
  caleuche.update(t)
}

function checkWin() {
  if (state.won || caleucheProgress < 0.95) return
  const p = player.position
  if (p.distanceTo(boardPoint) < 12 || p.distanceTo(caleuche.group.position) < 18) {
    state.won = true
    state.modal = true
    player.enabled = false
    try {
      document.exitPointerLock?.()
    } catch {}
    ui.showWin()
  }
}

const _fwd = new THREE.Vector3()
function updateHUD() {
  const p = player.position
  let target = boardPoint
  let bestD2 = Infinity
  for (const b of beings) {
    if (b.found) continue
    const dx = b.entry.position.x - p.x
    const dz = b.entry.position.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 < bestD2) {
      bestD2 = d2
      target = b.entry.position
    }
  }
  camera.getWorldDirection(_fwd)
  const dx = target.x - p.x
  const dz = target.z - p.z
  // signed angle (around +Y) from camera forward to target; positive = left
  const ang = Math.atan2(_fwd.z * dx - _fwd.x * dz, _fwd.x * dx + _fwd.z * dz)
  const compassDeg = -THREE.MathUtils.radToDeg(ang)
  const hint = bestD2 < 28 * 28 && bestD2 !== Infinity ? '✦ Algo se mueve cerca… something stirs nearby' : ''
  ui.updateHUD(foundCount(), beings.length, compassDeg, hint)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

let simT = 0
function frame(dt) {
  simT += dt
  const t = simT
  if (state.started && !state.modal && !state.won) {
    player.update(dt)
    checkEncounters()
    checkWin()
  }
  lantern.intensity = 26 + Math.sin(t * 7.3) * 1.6 + Math.sin(t * 13.1) * 1.1
  water.update(t)
  sky.update(t)
  for (const b of beings) b.inst.update(t)
  updateCaleuche(dt, t)
  if (state.started) updateHUD()
  renderer.render(scene, camera)
}

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  frame(Math.min(clock.getDelta(), 0.05))
})

// --- test/debug API ---
window.__game = {
  get started() { return state.started },
  get won() { return state.won },
  get modalOpen() { return state.modal },
  get found() { return foundCount() },
  get total() { return beings.length },
  get caleucheProgress() { return caleucheProgress },
  beings: () =>
    beings.map((b) => ({
      id: b.entry.id,
      found: b.found,
      x: b.entry.position.x,
      y: b.entry.position.y,
      z: b.entry.position.z,
      radius: b.entry.radius,
    })),
  pos: () => [player.position.x, player.position.y, player.position.z],
  setPos: (x, z, yaw) => player.setPosition(x, z, yaw),
  teleport: (id) => {
    const b = beings.find((v) => v.entry.id === id)
    if (b) player.setPosition(b.entry.position.x + b.entry.radius * 0.5, b.entry.position.z, 0)
  },
  begin: () => ui.closeModal(),
  closeModal: () => ui.closeModal(),
  boardPoint: () => boardPoint.toArray(),
  shoreX,
  fastCaleuche: () => {
    if (caleucheProgress >= 0) caleucheProgress = Math.max(caleucheProgress, 0.949)
  },
  // deterministic sim advance for tests (rAF is throttled in hidden tabs)
  step: (dt = 1 / 60, steps = 1) => {
    for (let i = 0; i < steps; i++) frame(dt)
  },
}
