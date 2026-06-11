// ============================================================================
// LA PINCOYA — Marea alta · Mitos de Chiloé
// ----------------------------------------------------------------------------
// Fishing / timing, three.js. Slide the lancha (A/D or arrows) along a mooring
// arc of 5 lantern-buoy spots (2 are deep — richer, but they drift). SPACE
// casts the net (3 s). A cast that LANDS while La Pincoya faces the SEA hauls
// 3–6 fish (deep: 5–8); while she faces LAND it hauls nothing and scares the
// spot dark for 15 s. Her facing flips on a randomized 6–10 s cycle (shrinking
// as the night wears on) with a 1.5 s telegraph: she slows and her glow shifts.
// WIN: 30 fish before the 180 s dawn timer. LOSE: dawn, or 3 land-casts in a
// row (nets torn). On win only: localStorage 'chiloe-pincoya-done' = '1'.
//
// TEST API — window.__game (the loop is a pure frame(dt), driven by BOTH
// requestAnimationFrame and manual stepping; sim pauses while an overlay is
// open, i.e. whenever phase !== 'playing'):
//   begin()                 — same as clicking BEGIN (closes title, unlocks audio)
//   step(dt=1/60, steps=1)  — advance sim + render deterministically
//   getState()              — { phase:'title'|'playing'|'won'|'lost', fish, goal,
//                              timer, streak, facing:'sea'|'land', telegraph,
//                              casting, castT, boatU (-1..1), inRange (spot idx
//                              or -1), spots:[{u,deep,scared}], muted }
//   forceWin()              — real win handler (overlay + localStorage flag)
//   forceLose(reason?)      — real lose handler; reason 'alba' (dawn, default)
//                             or 'redes' (nets torn)
//   setFacing('sea'|'land') — set her facing now (fresh full window, no telegraph)
//   setFish(n)              — set hold count (≥ goal wins on the next playing frame)
//   setTimer(s)             — set the dawn timer in seconds (≤ 0 loses next frame)
//   cast()                  — same as pressing SPACE
//   setBoat(u)              — teleport the boat along the arc, u in [-1, 1]
//   setStreak(n)            — set the consecutive land-cast count (0–3); the
//                             tear/lose only fires when a land-cast resolves
//   scareSpot(i, t=15)      — darken spot i for t seconds
//   audioState()            — { unlocked, muted, contextState }
// ============================================================================
import * as THREE from 'three'
import { createWorld, A_MAX } from './scene.js'
import { createAudio } from './audio.js'
import { ui } from './ui.js'

const GOAL = 30
const TIME_MAX = 180
const TELEGRAPH = 1.5
const CAST_TIME = 3
const SCARE_TIME = 15
const CATCH_RANGE = 0.09 // radians along the arc

// ---- shared sim/visual state (one object, mutated in place) ----------------
const S = {
  phase: 'title', // 'title' | 'playing' | 'won' | 'lost'
  fish: 0,
  timer: TIME_MAX,
  timerK: 0,
  streak: 0,
  simT: 0,
  tVis: 0,
  boatA: 0,
  boatV: 0,
  facing: 'sea',
  faceT: 7,
  telegraph: false,
  casting: false,
  castT: 0,
  castSpot: -1,
  inRange: -1,
  shake: 0,
  spots: [
    { base: -0.5, a: -0.5, deep: false, scaredT: 0, ph: 0 },
    { base: -0.25, a: -0.25, deep: true, scaredT: 0, ph: 2.1 },
    { base: 0, a: 0, deep: false, scaredT: 0, ph: 0 },
    { base: 0.25, a: 0.25, deep: true, scaredT: 0, ph: 4.4 },
    { base: 0.5, a: 0.5, deep: false, scaredT: 0, ph: 0 },
  ],
}

const audio = createAudio()
ui.init()

// ---- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
document.getElementById('app').appendChild(renderer.domElement)

const world = createWorld(S)

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  const aspect = w / h
  world.camera.aspect = aspect
  world.camera.fov = aspect > 1.4 ? 54 : aspect > 1 ? 62 : 70
  world.camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
window.addEventListener('resize', resize)
resize()

// ---- input -------------------------------------------------------------------
const keys = { left: false, right: false }
let hintSea = 0 // show the "she turned" coaching toast only twice

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const m = audio.toggleMute()
    ui.setMuted(m)
    return
  }
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true
  else if (e.code === 'Space') {
    if (!e.repeat) castAttempt()
  } else return
  e.preventDefault()
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false
})

// ---- game flow -----------------------------------------------------------------
function startGame() {
  if (S.phase !== 'title') return
  audio.unlock()
  S.phase = 'playing'
  ui.setHUDVisible(true)
  ui.toast('Cuando ella mire al mar, echa la red — espacio', 'good', 4200)
}

function win() {
  if (S.phase === 'won' || S.phase === 'lost') return
  S.phase = 'won'
  try {
    localStorage.setItem('chiloe-pincoya-done', '1')
  } catch (e) { /* storage may be unavailable */ }
  audio.cue('win')
  world.burstAtPincoya('gold', 26)
  ui.setHUDVisible(false)
  ui.showEnd({
    won: true,
    title: 'Marea alta',
    charms: '✦ ' + GOAL + ' / ' + GOAL + ' ✦',
    body:
      'The hold is heavy with silver and the rope bites your palms like a blessing. ' +
      'On the beach La Pincoya is still dancing, arms high, face to the water — ' +
      'la abundancia, freely given and easily lost. Row home before she remembers ' +
      'you, fisher: the sea was generous tonight because she willed it so.',
  })
}

function lose(reason) {
  if (S.phase === 'won' || S.phase === 'lost') return
  S.phase = 'lost'
  audio.cue('lose')
  ui.setHUDVisible(false)
  if (reason === 'redes') {
    ui.showEnd({
      won: false,
      title: 'Redes rotas',
      charms: '✕ ✕ ✕',
      body:
        'Three casts against her back, and the third came up in ribbons. ' +
        'La Pincoya has turned her face from you, and the bay closes like a fist. ' +
        'Row home with empty hands and mend what the sea has unmade — ' +
        'she does not forgive a greedy net, esta noche no.',
    })
  } else {
    ui.showEnd({
      won: false,
      title: 'El alba',
      charms: '✦ ' + S.fish + ' / ' + GOAL,
      body:
        'The moon touched the horizon and the dance ended mid-turn. ' +
        S.fish + ' fish shine in the hold — not enough, and the buyers at Castro ' +
        'count what the sea would not give. La Pincoya walks into the foam without ' +
        'looking back, and the marea baja carries off everything you still needed.',
    })
  }
}

function updateInRange() {
  S.inRange = -1
  let best = CATCH_RANGE
  for (let i = 0; i < S.spots.length; i++) {
    const d = Math.abs(S.boatA - S.spots[i].a)
    if (d < best) {
      best = d
      S.inRange = i
    }
  }
}

function castAttempt() {
  if (S.phase !== 'playing' || S.casting) return
  updateInRange() // fresh — SPACE and the cast() hook can fire between frames
  if (S.inRange < 0) {
    ui.toast('Ningún farol marca esta agua — acércate a una boya', 'bad')
    audio.cue('shift')
    return
  }
  const spot = S.spots[S.inRange]
  if (spot.scaredT > 0) {
    ui.toast('Aguas espantadas — el farol volverá a encenderse', 'bad')
    audio.cue('landward')
    return
  }
  S.casting = true
  S.castT = 0
  S.castSpot = S.inRange
  audio.cue('cast')
}

function resolveCast() {
  S.casting = false
  const spot = S.spots[S.castSpot]
  if (S.facing === 'sea') {
    const n = spot.deep ? 5 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 4)
    S.fish += n
    S.streak = 0
    audio.cue('haul')
    world.burstAtSpot(S.castSpot, 'fish', 10 + n)
    world.burstAtSpot(S.castSpot, 'splash', 10)
    ui.toast('+' + n + ' pescados — ella mira al mar', 'good')
  } else {
    S.streak += 1
    spot.scaredT = SCARE_TIME
    S.shake = 0.6
    audio.cue('thud')
    world.burstAtSpot(S.castSpot, 'dark', 14)
    if (S.streak >= 3) {
      audio.cue('tear')
      lose('redes')
    } else if (S.streak === 2) {
      audio.cue('warn')
      ui.toast('¡Una red más contra su espalda y se rompen!', 'bad', 3000)
    } else {
      ui.toast('Nada. Ella miraba a la tierra…', 'bad')
    }
  }
  S.castSpot = -1
}

function flipFacing() {
  S.facing = S.facing === 'sea' ? 'land' : 'sea'
  // the night quickens: windows shrink up to ~28% by the late game
  const ramp = 1 - 0.28 * Math.min(1, S.simT / 150)
  S.faceT = (6 + Math.random() * 4) * ramp
  S.telegraph = false
  if (S.facing === 'sea') {
    audio.cue('seaward')
    world.burstAtPincoya('gold', 8)
    if (hintSea < 2) {
      hintSea++
      ui.toast('Ella se vuelve al mar — ¡ahora!', 'good', 1800)
    }
  } else {
    audio.cue('landward')
  }
}

// ---- sim ------------------------------------------------------------------------
function simUpdate(dt) {
  S.simT += dt

  // La Pincoya's facing cycle + telegraph
  S.faceT -= dt
  const tele = S.faceT <= TELEGRAPH && S.faceT > 0
  if (tele && !S.telegraph) audio.cue('shift')
  S.telegraph = tele
  if (S.faceT <= 0) flipFacing()

  // spots: deep ones drift, scared ones recover
  for (let i = 0; i < S.spots.length; i++) {
    const s = S.spots[i]
    if (s.deep) s.a = s.base + Math.sin(S.simT * 0.11 + s.ph) * 0.12
    if (s.scaredT > 0) s.scaredT = Math.max(0, s.scaredT - dt)
  }

  // boat: smooth slide, locked while the net is in the water
  const want = S.casting ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const target = want * 0.42
  S.boatV += (target - S.boatV) * Math.min(1, 6 * dt)
  S.boatA += S.boatV * dt
  if (S.boatA > A_MAX) {
    S.boatA = A_MAX
    S.boatV = 0
  } else if (S.boatA < -A_MAX) {
    S.boatA = -A_MAX
    S.boatV = 0
  }

  // nearest spot in catch range
  updateInRange()

  // the cast
  if (S.casting) {
    S.castT += dt
    if (S.castT >= CAST_TIME) resolveCast()
  }

  // dawn timer + end states (win outranks the same-frame dawn)
  S.timer -= dt
  if (S.fish >= GOAL) {
    win()
  } else if (S.timer <= 0) {
    S.timer = 0
    lose('alba')
  }

  S.shake = Math.max(0, S.shake - dt * 1.4)
  S.timerK = Math.min(1, Math.max(0, 1 - S.timer / TIME_MAX))
}

// ---- frame: pure, driven by rAF AND by manual stepping ---------------------------
let tVis = 0
function frame(dt) {
  dt = Math.min(dt, 0.05)
  tVis += dt
  if (S.phase === 'playing') {
    simUpdate(dt)
    ui.hud(S.fish, GOAL, S.timerK, S.streak, S.casting ? S.castT / CAST_TIME : -1)
  }
  world.update(tVis, dt)
  renderer.render(world.scene, world.camera)
}

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  frame(Math.min(clock.getDelta(), 0.05))
})

ui.showTitle(startGame)

// ---- test/debug API ----------------------------------------------------------------
window.__game = {
  begin: () => {
    if (S.phase === 'title' && ui.isOverlayOpen()) ui.closeOverlay()
    else startGame()
  },
  step: (dt = 1 / 60, steps = 1) => {
    for (let i = 0; i < steps; i++) frame(dt)
  },
  getState: () => ({
    phase: S.phase,
    fish: S.fish,
    goal: GOAL,
    timer: S.timer,
    streak: S.streak,
    facing: S.facing,
    telegraph: S.telegraph,
    casting: S.casting,
    castT: S.castT,
    boatU: S.boatA / A_MAX,
    inRange: S.inRange,
    spots: S.spots.map((s) => ({ u: s.a / A_MAX, deep: s.deep, scared: s.scaredT > 0 })),
    muted: audio.state.muted,
  }),
  forceWin: () => win(),
  forceLose: (reason = 'alba') => lose(reason),
  setFacing: (f) => {
    if (f !== 'sea' && f !== 'land') return
    S.facing = f
    S.faceT = 8
    S.telegraph = false
  },
  setFish: (n) => {
    S.fish = Math.max(0, n | 0)
  },
  setTimer: (s) => {
    S.timer = Math.max(0, +s || 0)
    S.timerK = Math.min(1, Math.max(0, 1 - S.timer / TIME_MAX))
  },
  cast: () => castAttempt(),
  setBoat: (u) => {
    S.boatA = Math.max(-1, Math.min(1, +u || 0)) * A_MAX
    S.boatV = 0
  },
  setStreak: (n) => {
    S.streak = Math.max(0, Math.min(3, n | 0))
  },
  scareSpot: (i, t = SCARE_TIME) => {
    if (S.spots[i]) S.spots[i].scaredT = t
  },
  audioState: () => audio.state,
}
