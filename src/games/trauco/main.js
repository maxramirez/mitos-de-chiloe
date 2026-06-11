// EL TRAUCO — No le sostengas la mirada · Mitos de Chiloé
// Stealth in a foggy forest clearing-ring (~120 m across): gather the 7
// glowing quilineja vines, stay out of the dwarf's visible gaze cone
// (25 m / 35°), then leave by the gate (two leaning trunks under a wisp).
//
// MECHANICS
//   WASD walk · SHIFT sprint (loud: sprinting within 18 m of him makes him
//   turn toward the noise) · mouse look (pointer lock) · M mute.
//   While the gaze cone touches you with a clear line of sight, the charm
//   meter fills (vignette closes in, drone rises) — faster if you meet his
//   eyes, slower with your back turned; break line of sight behind
//   trunks to drain it. Charm full -> lost ("bent like green wood").
//   Each vine collected: he walks 8% faster and pauses less at waypoints.
//   Win: 7 vines + stand at the gate (radius 3.5 m).
//   ON WIN ONLY: localStorage.setItem('chiloe-trauco-done', '1').
//   Sim pauses while any overlay is open or pointer lock is lost (Esc);
//   dt clamped at 0.05; the loop is a pure frame(dt) driven by BOTH
//   requestAnimationFrame and manual stepping.
//
// TEST API — window.__game
//   begin()                  same as clicking BEGIN (unlocks audio, starts play)
//   step(dt=1/60, steps=1)   advance the sim deterministically (frame(dt) × N)
//   getState()               { phase:'title'|'playing'|'won'|'lost', vines, total,
//                              charm, gazed, gazeBlocked, traucoDist, traucoState,
//                              traucoSpeed, pauseDur, pos:[x,y,z], gate:[x,z], muted }
//   forceWin() / forceLose() jump to the real end handlers (forceWin runs the
//                            same win() that sets localStorage chiloe-trauco-done)
//   collect(n=1)             collect the next n un-taken vines via the real
//                            handler (Trauco speed-up + shorter pauses apply)
//   teleportTrauco(dist=10)  put the Trauco `dist` m in front of the player,
//                            facing the player in alert (he holds the stare
//                            ~2.6 s; gaze engages when dist < 25 and no trunk
//                            blocks line of sight)
//   setCharm(v)              set the charm meter 0..1 (>= 1 loses on next step)
//   setPos(x, z, yaw)        teleport the player (yaw optional)
//   pos()                    [x, y, z] player position
//   vines()                  [{ x, z, taken }] the seven quilineja
//   gatePos()                [x, z] gate center (win radius 3.5 m)
//   trauco()                 { x, z, yaw, state:'walk'|'pause'|'alert', speed, pauseDur }
//   audioState()             { unlocked, muted, contextState }
import * as THREE from 'three'
import { terrainHeight, buildWorld } from './world.js'
import { createTrauco } from './trauco.js'
import { createPlayer } from './player.js'
import { createAudio } from './audio.js'
import { createFX } from './fx.js'
import { ui, STRINGS } from './ui.js'

// deterministic sim RNG — same forest, same patrol decisions, every load
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(40712)

const VINE_TOTAL = 7
const GAZE_LEN = 25
const COS_HALF = Math.cos((17.5 * Math.PI) / 180)

// ---------- renderer / scene ----------
const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400)
scene.add(camera)

const world = buildWorld(scene, rng)

// the dim hand-lantern — warm near-field light following the camera
const lantern = new THREE.PointLight(0xffd9a0, 24, 18, 1.8)
lantern.position.set(0.35, -0.45, -0.5)
camera.add(lantern)

const player = createPlayer(camera, renderer.domElement, {
  terrainHeight,
  collide: world.collide,
})
// spawn at the clearing's heart, facing the gate
player.setPosition(0, 0, Math.atan2(-world.gate.x, -world.gate.z))

const trauco = createTrauco({
  terrainHeight,
  collide: world.collide,
  waypoints: world.waypoints,
  rng,
})
trauco.teleportTo(-world.gate.x * 0.55, -world.gate.z * 0.55, 0)
scene.add(trauco.group)

const fx = createFX(scene)
const audio = createAudio()

// ---------- state ----------
let phase = 'title' // 'title' | 'playing' | 'won' | 'lost'
let charm = 0
let vinesTaken = 0
let lastGazed = false
let lastBlocked = false
let lastTraucoDist = 9999
let gazeStingT = 0
let gateDenyT = 0
let tAmb = 0

// hint strings precomputed (no per-frame string building)
const HINT_CLICK = 'click para mirar · wasd to walk'
const HINT_BREAK = 'rompe su línea de visión — put a trunk between you'
const HINT_GATE = 'la puerta — two leaning trunks, a wisp burning above'
const HINT_SEEK = 'la quilineja glows pale among the trunks'
const HINT_LOCKED = []
for (let i = 0; i <= VINE_TOTAL; i++) {
  HINT_LOCKED.push('la puerta no cede — quilineja ' + i + '/' + VINE_TOTAL)
}

ui.init()
ui.showTitle(beginGame)

function beginGame() {
  if (phase !== 'title') return
  phase = 'playing'
  audio.unlock()
  player.enabled = true
  player.requestLock()
}

function collectVine(i) {
  const v = world.vines[i]
  if (!v || v.taken) return
  v.taken = true
  world.collectVine(i)
  vinesTaken++
  trauco.onVine() // +8% speed, shorter pauses — he knows
  fx.burst(v.x, terrainHeight(v.x, v.z) + 0.9, v.z)
  ui.flash()
  audio.stinger('vine')
  if (vinesTaken >= VINE_TOTAL) audio.stinger('gate')
  else audio.stinger('escalate')
}

function win() {
  if (phase === 'won' || phase === 'lost') return
  phase = 'won'
  charm = 0 // the gaze lets go
  player.enabled = false
  try {
    localStorage.setItem('chiloe-trauco-done', '1') // hub completion badge — win only
  } catch {}
  try {
    if (document.exitPointerLock) document.exitPointerLock()
  } catch {}
  audio.stinger('win')
  ui.showEnd(true)
}

function lose() {
  if (phase === 'won' || phase === 'lost') return
  phase = 'lost'
  player.enabled = false
  // bent like green wood: your eyes are turned to him, and held
  player.setPosition(player.x, player.z, Math.atan2(-(trauco.x - player.x), -(trauco.z - player.z)))
  try {
    if (document.exitPointerLock) document.exitPointerLock()
  } catch {}
  audio.stinger('lose')
  ui.showEnd(false)
}

function currentHint() {
  if (phase !== 'playing') return ''
  if (charm > 0.45) return HINT_BREAK
  if (!player.locked) return HINT_CLICK
  if (vinesTaken >= VINE_TOTAL) return HINT_GATE
  const dx = world.gate.x - player.x
  const dz = world.gate.z - player.z
  if (dx * dx + dz * dz < 100) return HINT_LOCKED[vinesTaken]
  if (vinesTaken === 0) return HINT_SEEK
  return ''
}

// reused audio-update params object (no per-frame allocation)
const AP = { moving: false, run: false, charm: 0, gazed: false, traucoDist: 9999, traucoStepRate: 0 }

// ---------- the frame: pure, driven by rAF AND __game.step ----------
function frame(rawDt) {
  const dt = rawDt > 0.05 ? 0.05 : rawDt > 0 ? rawDt : 0
  tAmb += dt
  // Esc (pointer-lock loss) pauses the sim like any overlay; headless tests
  // never acquire lock (everLocked stays false) so __game.step() keeps working
  const playing = phase === 'playing' && (player.locked || !player.everLocked)

  if (playing) {
    player.update(dt)

    const dxT = player.x - trauco.x
    const dzT = player.z - trauco.z
    const traucoDist = Math.sqrt(dxT * dxT + dzT * dzT)
    lastTraucoDist = traucoDist

    // sprint is LOUD: within 18 m he turns toward the noise
    if (player.sprinting && traucoDist < 18) {
      if (trauco.hear(player.x, player.z)) audio.stinger('alert')
    }

    trauco.update(dt, true, tAmb)

    // gaze test: inside the cone + clear line of sight (2D vs trunks)
    let gazed = false
    let blocked = false
    if (traucoDist < GAZE_LEN && traucoDist > 0.001) {
      const fwdX = Math.sin(trauco.yaw)
      const fwdZ = Math.cos(trauco.yaw)
      if ((dxT * fwdX + dzT * fwdZ) / traucoDist > COS_HALF) {
        blocked = world.losBlocked(trauco.x, trauco.z, player.x, player.z)
        gazed = !blocked
      }
    }
    gazeStingT -= dt
    if (gazed && !lastGazed && gazeStingT <= 0) {
      audio.stinger('gaze')
      gazeStingT = 2.5
    }
    lastGazed = gazed
    lastBlocked = blocked
    trauco.setGazeHot(gazed)

    if (gazed) {
      // meeting his eyes feeds the charm; averting them buys time (trunks remain the true answer)
      const face = (Math.sin(player.yaw) * dxT + Math.cos(player.yaw) * dzT) / traucoDist
      charm += dt * (face > 0.25 ? 1 : 0.55) * (0.3 + 0.34 * (1 - traucoDist / GAZE_LEN))
    } else charm -= dt * 0.3
    if (charm < 0) charm = 0
    if (charm >= 1) {
      charm = 1
      lose() // bent like green wood
    }

    if (phase === 'playing') {
      // vines (pickup radius 2.4 m)
      const vs = world.vines
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i]
        if (v.taken) continue
        const dx = v.x - player.x
        const dz = v.z - player.z
        if (dx * dx + dz * dz < 5.76) collectVine(i)
      }
      // gate (only opens with all 7)
      const dxg = world.gate.x - player.x
      const dzg = world.gate.z - player.z
      const dg2 = dxg * dxg + dzg * dzg
      gateDenyT -= dt
      if (vinesTaken >= VINE_TOTAL) {
        if (dg2 < 12.25) win()
      } else if (dg2 < 12.25 && gateDenyT <= 0) {
        gateDenyT = 4 // the gate refuses: low blip + the wisp gutters
        audio.stinger('denied')
        world.denyFlicker()
      }
    }
    fx.update(dt)
  } else {
    trauco.update(dt, false, tAmb) // idle visuals only — sim is paused
    if (phase === 'lost' && charm > 0) {
      // the gaze lets go over ~4 s — drone, heartbeat and vignette settle under the end card
      charm -= dt * 0.25
      if (charm < 0) charm = 0
    }
  }

  world.update(tAmb, vinesTaken >= VINE_TOTAL)

  // the lantern gutters as the charm takes hold
  lantern.intensity =
    24 +
    Math.sin(tAmb * 7.3) * 1.6 +
    Math.sin(tAmb * 13.1) * 1.0 -
    charm * (11 + Math.sin(tAmb * 29.7) * 4)

  // small screen shake under a heavy gaze
  if (playing && charm > 0.35) {
    const sh = (charm - 0.35) * 0.09
    camera.position.x += Math.sin(tAmb * 43.7) * sh
    camera.position.y += Math.sin(tAmb * 36.1 + 1.3) * sh * 0.6
  }

  if (phase !== 'title') ui.setHUD(vinesTaken, VINE_TOTAL, charm, currentHint())

  AP.moving = playing && player.moving
  AP.run = player.sprinting
  AP.charm = charm
  AP.gazed = lastGazed
  AP.traucoDist = playing ? lastTraucoDist : 9999
  AP.traucoStepRate = trauco.stepRate
  audio.update(dt, AP)

  renderer.render(scene, camera)
}

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  frame(Math.min(clock.getDelta(), 0.05))
})

// ---------- global keys / resize ----------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'KeyM') ui.setMuted(audio.toggleMute())
})
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------- test / debug API (documented in the header) ----------
window.__game = {
  begin() {
    if (phase === 'title') ui.closeModal()
  },
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
  },
  getState() {
    const dx = trauco.x - player.x
    const dz = trauco.z - player.z
    return {
      phase,
      vines: vinesTaken,
      total: VINE_TOTAL,
      charm,
      gazed: lastGazed,
      gazeBlocked: lastBlocked,
      traucoDist: Math.sqrt(dx * dx + dz * dz),
      traucoState: trauco.state,
      traucoSpeed: trauco.speed,
      pauseDur: trauco.pauseDur,
      pos: [player.x, camera.position.y, player.z],
      gate: [world.gate.x, world.gate.z],
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  collect(n = 1) {
    for (let k = 0; k < n; k++) {
      const i = world.vines.findIndex((v) => !v.taken)
      if (i === -1) break
      collectVine(i)
    }
  },
  teleportTrauco(dist = 10) {
    const fx_ = -Math.sin(player.yaw)
    const fz_ = -Math.cos(player.yaw)
    const tx = player.x + fx_ * dist
    const tz = player.z + fz_ * dist
    trauco.teleportTo(tx, tz, Math.atan2(player.x - tx, player.z - tz))
    trauco.hear(player.x, player.z) // hold the stare (alert) instead of strolling off
  },
  setCharm(v) {
    charm = v < 0 ? 0 : v > 1 ? 1 : v
  },
  setPos(x, z, yaw) {
    player.setPosition(x, z, yaw)
  },
  pos: () => [player.x, camera.position.y, player.z],
  vines: () => world.vines.map((v) => ({ x: v.x, z: v.z, taken: v.taken })),
  gatePos: () => [world.gate.x, world.gate.z],
  trauco: () => ({
    x: trauco.x,
    z: trauco.z,
    yaw: trauco.yaw,
    state: trauco.state,
    speed: trauco.speed,
    pauseDur: trauco.pauseDur,
  }),
  audioState: () => audio.state,
}
