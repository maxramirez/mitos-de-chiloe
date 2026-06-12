import * as THREE from 'three'
import { createTerrain, terrainHeight } from './world/terrain.js'
import { createWater } from './world/water.js'
import { createSky } from './world/sky.js'
import { BEINGS } from './beings/registry.js'
import { createCaleuche } from './caleuche.js'
import { createPlayer } from './player.js'
import { ui } from './ui.js'
import { STRINGS } from './lore.js'
import { createAudio } from './audio.js'
import { createFX } from './fx.js'
import { createStalker } from './stalker.js'
import { createWisps } from './world/wisps.js'
import { createMist } from './world/mist.js'
import { createDread } from './dread.js'

const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.3
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
}

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1600)

const sky = createSky(scene)
scene.add(createTerrain())
const water = createWater()
scene.add(water.object3d)
const wisps = createWisps()
scene.add(wisps.group)
const mist = createMist()
scene.add(mist.group)

const beings = BEINGS.map((entry) => {
  const inst = entry.factory()
  inst.group.position.copy(entry.position)
  enableShadows(inst.group)
  scene.add(inst.group)
  return { entry, inst, found: false }
})

const stalker = createStalker()
enableShadows(stalker.group)
scene.add(stalker.group)
let lastStalkerState = 'hidden'
let blackoutActive = false

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
  // beacon base 1.9: below every being accent (2.2–3.2) so the beings stay
  // on top of the glow hierarchy until the ship is summoned and the dock
  // becomes the destination — then it swells (see update below).
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x110a00, emissive: 0xffc87a, emissiveIntensity: 1.9,
  })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bulbMat)
  bulb.position.set(x0 + DOCK_LEN - 5, 3.0, 0)
  g.add(bulb)
  const lamp = new THREE.PointLight(0xffc87a, 20, 28, 1.8)
  lamp.position.set(x0 + DOCK_LEN - 5, 3.1, 0)
  g.add(lamp)

  // ceremonial rail lanterns — spectral glass over four post pairs, dark
  // until the Caleuche answers, then kindling shore→sea as it closes.
  // Emissive only, NO new PointLights: the scene's light count stays
  // constant from boot (shader-recompile rule). Materials exist and render
  // (unlit) from frame one, so kindling never compiles anything.
  const railLanterns = []
  const glassGeo = new THREE.OctahedronGeometry(0.11, 0) // echoes the ship's lanterns
  const stalkGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.62, 5)
  for (let p = 0; p < 4; p++) {
    const x = x0 - 4 + (p + 1) * ((DOCK_LEN + 8) / 5) // atop posts 1..4
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(stalkGeo, wood)
      stalk.position.set(x, 1.31, s * 2.0)
      g.add(stalk)
      const m = new THREE.MeshStandardMaterial({
        color: 0x0d1411, emissive: 0x9fffd0, emissiveIntensity: 0.05, roughness: 0.35,
      })
      const glass = new THREE.Mesh(glassGeo, m)
      glass.position.set(x, 1.74, s * 2.0)
      g.add(glass)
      // at: kindle threshold along the sail-in; ph: private gutter phase
      railLanterns.push({ m, at: 0.1 + p * 0.22, ph: p * 2.7 + (s + 1) * 1.9 })
    }
  }

  function update(t, progress) {
    const arriving = progress < 0 ? 0 : progress
    for (let i = 0; i < railLanterns.length; i++) {
      const L = railLanterns[i]
      const k = THREE.MathUtils.smoothstep(arriving, L.at, L.at + 0.1)
      // peak ~2.2: ceremony, but still under the beings' accents (2.2–3.2)
      // and well under the ship's own lanterns (3.0+)
      L.m.emissiveIntensity = 0.05 + k * (1.9 + Math.sin(t * 4.3 + L.ph) * 0.3)
    }
    // the beacon swells to answer the ship, guttering like a live flame
    const kAll = THREE.MathUtils.smoothstep(arriving, 0.1, 0.9)
    bulbMat.emissiveIntensity = 1.9 + kAll * (0.7 + Math.sin(t * 5.3) * 0.15)
    lamp.intensity = 20 + kAll * (5 + Math.sin(t * 6.1) * 1.5)
  }

  return { group: g, update }
}
const dock = buildDock(shoreX)
enableShadows(dock.group)
scene.add(dock.group)
// reference points for the ambient one-shot picker (rigging creaks, cave knocks)
const dockCenter = new THREE.Vector3(shoreX + DOCK_LEN / 2, 0, 0)
const caveBeing = BEINGS.find((b) => b.id === 'invunche')
const cavePos = caveBeing ? caveBeing.position : null

function onDock(x, z) {
  // must match the deck mesh footprint: x in [shoreX-6, shoreX+DOCK_LEN+4], |z| <= 2.2
  return Math.abs(z) < 2.2 && x > shoreX - 6 && x < shoreX + DOCK_LEN + 4
}
const groundHeight = (x, z) => (onDock(x, z) ? Math.max(terrainHeight(x, z), 1.0) : terrainHeight(x, z))
const isWalkable = (x, z) => {
  if (onDock(x, z)) return true
  if (terrainHeight(x, z) <= -0.9) return false // swell crests reach ~0.5 m; keep the camera above them
  for (const b of BEINGS) {
    const dx = x - b.position.x
    const dz = z - b.position.z
    if (dx * dx + dz * dz < 1.44) return false // don't walk through the beings themselves
  }
  return true
}

// the fisher's lantern — warm near-field light that follows the camera
scene.add(camera)
const lantern = new THREE.PointLight(0xffd9a0, 26, 20, 1.7)
lantern.position.set(0.4, -0.5, -0.6)
camera.add(lantern)

const player = createPlayer(camera, renderer.domElement, { groundHeight, isWalkable })
player.setPosition(0, -150, Math.PI)
player.enabled = false

const caleuche = createCaleuche()
// Parked beyond the fog instead of visible=false: keeps the scene's point-light
// count constant from boot, so summoning never triggers a shader-recompile hitch.
const caleucheParked = new THREE.Vector3(shoreX + 650, 0, 520)
caleuche.group.position.copy(caleucheParked)
enableShadows(caleuche.group)
scene.add(caleuche.group)
const CALEUCHE_SAIL_SECONDS = 50
const caleucheStart = new THREE.Vector3(shoreX + 330, 0, 190)
const caleucheEnd = new THREE.Vector3(shoreX + DOCK_LEN + 26, 0, 0)
let caleucheProgress = -1 // -1 = not summoned, 0..1 = sailing in

const state = { started: false, won: false, modal: false }
let winCalm = 0 // 0..1 post-grade ease while the win card is up

const fx = createFX(renderer, scene, camera)
const dread = createDread()
const audio = createAudio()

// --- title narration: the intro line plays over the title card itself -------
// Autoplay policy usually blocks sound before a gesture, so this is
// best-effort: try at load (audible where the browser allows it); otherwise
// the first pointer/key/touch unlocks audio AND starts the line — still
// before BEGIN. beginGame() must then not restart it (it finishes over
// gameplay, ducking as usual). Silent no-op without the mp3.
let introVoiced = false // the intro line started (or was queued): never replay it
const NARRATION_GESTURES = ['pointerdown', 'keydown', 'touchstart']
const unlockAudio = () => {
  for (const ev of NARRATION_GESTURES) window.removeEventListener(ev, unlockAudio, true)
  try {
    audio.unlock() // trusted gesture: resume() sticks this time
    if (!introVoiced && !state.started) {
      introVoiced = true
      audio.speak('intro') // narration over the title card, before BEGIN
    }
  } catch {} // narration must never break the game
}
for (const ev of NARRATION_GESTURES) window.addEventListener(ev, unlockAudio, true)
try {
  audio.unlock() // best-effort early start, before any gesture
  if (audio.state.contextState === 'running') {
    introVoiced = true
    audio.speak('intro')
  }
} catch {} // blocked: the gesture listeners above take over

// --- save / continue ---
const SAVE_KEY = 'caleuche-save-v1'
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        found: beings.filter((b) => b.found).map((b) => b.entry.id),
        pos: [player.position.x, player.position.z],
        yaw: player.yaw,
      })
    )
  } catch {}
}
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {}
}

ui.init()
const save0 = loadSave()
ui.showTitle(
  beginGame,
  save0 && Array.isArray(save0.found) && save0.found.length
    ? { label: STRINGS.resumeLabel, onResume: () => resumeGame(save0) }
    : undefined
)

function beginGame() {
  if (state.started) return
  state.started = true
  clearSave()
  audio.unlock()
  if (!introVoiced) {
    introVoiced = true
    audio.speak('intro') // narration never started on the title card: speak on BEGIN
  }
  player.enabled = true
  player.requestLock()
}

function resumeGame(save) {
  if (state.started) return
  state.started = true
  for (const id of save.found) {
    const b = beings.find((v) => v.entry.id === id)
    if (b) b.found = true
  }
  if (Array.isArray(save.pos) && save.pos.length === 2) {
    player.setPosition(save.pos[0], save.pos[1], typeof save.yaw === 'number' ? save.yaw : Math.PI)
  }
  audio.unlock()
  ui.setBestiaryHint(foundCount() > 0)
  stalker.active = foundCount() >= 2
  player.enabled = true
  player.requestLock()
  if (foundCount() === beings.length && caleucheProgress < 0) summonCaleuche()
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
      try {
        document.exitPointerLock?.() // otherwise the locked pointer can't click Continue
      } catch {}
      audio.stinger('encounter')
      audio.speak('lore-' + b.entry.id) // narrated lore while the card is open
      ui.showEncounter(b.entry, () => {
        audio.stopSpeech() // card closed early: cut the narration cleanly
        audio.stinger('charm')
        state.modal = false
        saveGame()
        ui.setBestiaryHint(true)
        dread.relieve(0.3) // the mark protects, for a while
        if (foundCount() >= 2) stalker.active = true
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
  caleuche.group.position.copy(caleucheStart)
  audio.stinger('summon')
  audio.speak('banner')
  ui.showBanner(STRINGS.banner)
}

function triggerBlackout() {
  blackoutActive = true
  state.modal = true
  player.enabled = false
  audio.stinger('blackout')
  audio.speak('blackout')
  dread.value = 1
  // teleport while the screen is fully black, not after the fade-out
  setTimeout(() => player.setPosition(0, -150, Math.PI), 350)
  ui.showBlackout(STRINGS.blackoutText, () => {
    dread.value = 0.55
    stalker.reset()
    blackoutActive = false
    state.modal = false
    if (!state.won) player.enabled = true
  })
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
    clearSave()
    try {
      localStorage.setItem('chiloe-caleuche-done', '1') // hub completion badge
    } catch {}
    ui.setBestiaryHint(false)
    audio.stinger('win')
    audio.speak('win')
    try {
      document.exitPointerLock?.()
    } catch {}
    ui.showWin()
  }
}

let guideTarget = boardPoint
let guideDist = Infinity
function computeGuide() {
  const p = player.position
  guideTarget = boardPoint
  let bestD2 = Infinity
  for (const b of beings) {
    if (b.found) continue
    const dx = b.entry.position.x - p.x
    const dz = b.entry.position.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 < bestD2) {
      bestD2 = d2
      guideTarget = b.entry.position
    }
  }
  guideDist = bestD2 === Infinity ? Infinity : Math.sqrt(bestD2)
}

const _fwd = new THREE.Vector3()
function updateHUD() {
  const p = player.position
  camera.getWorldDirection(_fwd)
  const dx = guideTarget.x - p.x
  const dz = guideTarget.z - p.z
  // signed angle (around +Y) from camera forward to target; positive = left
  const ang = Math.atan2(_fwd.z * dx - _fwd.x * dz, _fwd.x * dx + _fwd.z * dz)
  const compassDeg = -THREE.MathUtils.radToDeg(ang)
  let hint = ''
  if (caleucheProgress >= 0 && !state.won) {
    hint = caleucheProgress >= 0.95 ? STRINGS.boardHint : STRINGS.sailHint
  } else if (guideDist < 28) {
    hint = STRINGS.hint
  }
  ui.updateHUD(foundCount(), beings.length, compassDeg, hint)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)) // DPR changes when dragged across displays
  renderer.setSize(window.innerWidth, window.innerHeight)
  fx.resize(window.innerWidth, window.innerHeight)
})

// --- bestiary (Tab) + mute (M) ---
let bestiaryOpen = false
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    audio.toggleMute()
    return
  }
  if (e.code !== 'Tab') return
  e.preventDefault()
  if (!state.started || state.won || blackoutActive) return
  if (bestiaryOpen) {
    ui.closeModal()
    return
  }
  if (state.modal) return
  bestiaryOpen = true
  state.modal = true
  player.enabled = false
  audio.stinger('tick') // parchment tick on opening the bestiary
  try {
    document.exitPointerLock?.()
  } catch {}
  ui.showBestiary(
    beings.map((b) => ({
      name: b.entry.name,
      title: b.entry.title,
      lore: b.entry.lore,
      blessing: b.entry.blessing,
      found: b.found,
    })),
    () => {
      audio.stinger('tick')
      bestiaryOpen = false
      state.modal = false
      if (!state.won) {
        player.enabled = true
        player.requestLock()
      }
    }
  )
})

let simT = 0
let _lastX = 0
let _lastZ = 0
const _fwdFlat = new THREE.Vector3()
function frame(dt) {
  simT += dt
  const t = simT
  computeGuide()
  if (state.started && !state.modal && !state.won) {
    player.update(dt)
    camera.getWorldDirection(_fwdFlat)
    _fwdFlat.y = 0
    _fwdFlat.normalize()
    stalker.update(dt, { playerPos: player.position, playerForward: _fwdFlat })
    if (stalker.state === 'rush' && lastStalkerState !== 'rush') audio.stinger('stalker')
    lastStalkerState = stalker.state
    if (stalker.consumeStrike()) triggerBlackout()
    checkEncounters()
    checkWin()
  }

  const mvx = player.position.x - _lastX
  const mvz = player.position.z - _lastZ
  _lastX = player.position.x
  _lastZ = player.position.z
  const speed = Math.sqrt(mvx * mvx + mvz * mvz) / Math.max(dt, 1e-4)

  const stalkerDist = stalker.state === 'hidden' ? null : player.position.distanceTo(stalker.position)
  if (state.started && !state.won && !blackoutActive) {
    dread.update(dt, { stalker: stalker.state, stalkerDist, nearestDist: guideDist })
  } else if (state.won) {
    dread.relieve(dt * 0.06)
    // ease the post grade under the win card: grain settles to a faint
    // whisper, aberration/pulse fade — the card is read in still water
    winCalm = Math.min(1, winCalm + dt * 0.4)
    fx.calm = winCalm
  }

  // the lantern gutters as dread rises
  lantern.intensity =
    26 +
    Math.sin(t * 7.3) * 1.6 +
    Math.sin(t * 13.1) * 1.1 -
    dread.value * (8 + Math.sin(t * 23.7) * 4)

  water.update(t)
  sky.update(t, player.position)
  wisps.update(t, state.started && !state.won ? guideTarget : null)
  mist.update(t)
  for (const b of beings) {
    // fog hides everything past ~350 m; skip idle animation for far-off beings
    const dx = b.entry.position.x - player.position.x
    const dz = b.entry.position.z - player.position.z
    if (dx * dx + dz * dz < 300 * 300) b.inst.update(t)
  }
  updateCaleuche(dt, t)
  dock.update(t, caleucheProgress)
  if (state.started) updateHUD()

  audio.update(dt, {
    moving: speed > 0.5,
    run: speed > 14,
    playerHeight: player.position.y - 1.7,
    nearestDist: guideDist === Infinity ? 9999 : guideDist,
    caleucheDist: caleucheProgress >= 0 ? player.position.distanceTo(caleuche.group.position) : null,
    dread: dread.value,
    stalker: stalker.state === 'hidden' ? null : stalker.state,
    stalkerDist,
    won: state.won,
    started: state.started,
    dockDist: Math.hypot(player.position.x - dockCenter.x, player.position.z - dockCenter.z),
    caveDist: cavePos ? Math.hypot(player.position.x - cavePos.x, player.position.z - cavePos.z) : 9999,
    terrainY: terrainHeight(player.position.x, player.position.z),
  })
  fx.dread = dread.value
  fx.render(dt)
}

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  frame(Math.min(clock.getDelta(), 0.05))
})

// --- test/debug API ---
window.__game = {
  get started() { return state.started },
  get won() { return state.won },
  get modalOpen() { return state.modal || ui.isModalOpen() },
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
  stalker: () => ({
    state: stalker.state,
    active: true,
    pos: [stalker.position.x, stalker.position.y, stalker.position.z],
  }),
  forceStalker: (d) => {
    stalker.active = true
    stalker.forceSpawn(d)
  },
  get dread() {
    return dread.value
  },
  setDread: (v) => {
    dread.value = v
  },
  audioState: () => audio.state,
  voiceState: () => audio.voiceState(),
  get bestiaryOpen() {
    return bestiaryOpen
  },
  get blackout() {
    return blackoutActive
  },
  saveData: () => loadSave(),
  // deterministic sim advance for tests (rAF is throttled in hidden tabs)
  step: (dt = 1 / 60, steps = 1) => {
    for (let i = 0; i < steps; i++) frame(dt)
  },
}
