// ============================================================================
// EL BRUJO DE QUICAVÍ — Las siete páginas · Mitos de Chiloé
// ============================================================================
// First-person slender-like dread piece. A fenced ~260×260 m night forest:
// dense FogExp2 (sight ~45 m), no moon — only your farol. Seven skin-parchment
// pages are nailed at eye height to 7 of 14 candidate landmarks (pale marked
// trees · standing stones · ruined hut walls — which 7 is randomized per run).
// Walk up + E or click to take one; the count is whispered ('una… dos…').
//
// EL BRUJO never walks. While unobserved he relocates on a timer (8–14 s
// early, 3–6 s with seven pages; gentle mercy — his first TWO relocations
// always use the slow band) to a spot 25–50 m away in your periphery or
// behind, standing among the trees, facing you. LOOKING at him within ~40 m
// makes the STATIC rise (noise overlay + crackle + heartbeat), faster the
// closer he is and the more pages you carry; looking away decays it slowly.
// After ~2 s of being watched he vanishes — only ever while OFFSCREEN. From
// page 5 on, some relocations come with a 2 s farol gutter, and closer.
//
// Direction help: a dim HUD compass (next to 'páginas 0/7') seeks the
// nearest remaining page — the rowboat once 7/7 — and each un-taken page
// raises a thin light-seam over the canopy that dissolves as you close in.
//
// WIN  — take 7/7, reach the derelict rowboat at the south fence (the distant
//        shore-light marks the way) and hold E for 3 s to push off.
//        (sets localStorage 'chiloe-quicavi-done' = '1' — win only)
// LOSE — the static reaches full: his face fills the frame for 0.4 s, cut to
//        black. The card tells you why: you looked too long.
//
// The loop is a pure frame(dt): driven by requestAnimationFrame AND manually
// steppable. dt clamped at 0.05; the sim pauses while any overlay (title /
// win / lose) is open. No allocations in the frame path. Audio is lazy
// WebAudio unlocked by BEGIN; M toggles mute.
//
// ============================== TEST API ====================================
// window.__game = {
//   begin()                    — same as clicking BEGIN (unlocks audio too)
//   step(dt = 1/60, steps = 1) — advance the sim deterministically, render once
//   getState()                 — { phase:'title'|'playing'|'won'|'lost',
//                                  pages, pagesTotal, static (0..1),
//                                  brujo:[x,z]|null, brujoPresent,
//                                  brujoObserved, pos:[x,z], yaw, boat:[x,z],
//                                  hold (s of E at the boat), gutter (bool),
//                                  elapsed, muted }
//   forceWin()                 — runs the real win handler (localStorage flag,
//                                win card); skips nothing that matters
//   forceLose()                — real lose path: catch cinema (face → black →
//                                lose card)
//   pages()                    — pages taken so far (number)
//   grantPages(n)              — take pages through the REAL handler until n
//                                are held (whisper, beacon at 7, etc.)
//   pagePositions()            — [[x,z], …] of the remaining (untaken) pages
//   pageSeams()                — light-seams still standing (one per un-taken
//                                page; 0 once all seven are in your coat)
//   brujoPos()                 — [x,z] while present, else null
//   forceRelocate(dist = 18)   — immediate relocation IN FRONT of the player
//                                at `dist` m (visible — stare to raise static)
//   setStatic(v)               — set the static meter 0..1 (1 ⇒ caught on the
//                                next step)
//   boatPos()                  — [x,z] of the rowboat (the exit)
//   teleport(x, z, yaw?)       — move the player (world coords, optional yaw;
//                                yaw 0 faces -z, toward the boat from spawn)
//   setHold(v)                 — simulate holding E (boat push) for stepping
// }
// ============================================================================

import * as THREE from 'three'
import { createWorld, terrainHeight, SPAWN, BOAT, WALK_BOUND } from './world.js'
import { createBrujo } from './brujo.js'
import { createPlayer } from './player.js'
import { createFX } from './fx.js'
import { createAudio } from './audio.js'
import { ui } from './ui.js'

// ---------------- three.js boot ---------------------------------------------
const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x070b0e)
scene.fog = new THREE.FogExp2(0x070b0e, 0.04) // sight ~45 m; sky = fog: the forest drowns in it
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900)
scene.add(camera)

const world = createWorld(scene)
const brujo = createBrujo((x, z) => world.isWalkable(x, z, 0.7))
scene.add(brujo.group)
brujo.scareFace.position.set(0, 0, -0.7)
brujo.scareFace.scale.setScalar(0.3)
camera.add(brujo.scareFace)

// EL FAROL — always on: warm point + a subtle forward boost
const farolPoint = new THREE.PointLight(0xffc379, 60, 34, 1.6)
farolPoint.position.set(0.3, -0.35, 0.12)
camera.add(farolPoint)
const farolSpot = new THREE.SpotLight(0xffd9a0, 90, 55, 0.6, 0.6, 1.4)
farolSpot.position.set(0, -0.1, 0.2)
camera.add(farolSpot)
farolSpot.target.position.set(0, -0.18, -1)
camera.add(farolSpot.target)

const fx = createFX(scene, camera)
const audio = createAudio()

// ---------------- player ----------------------------------------------------
const player = createPlayer(camera, renderer.domElement, {
  isWalkable: (x, z) => world.isWalkable(x, z),
  groundHeight: terrainHeight,
})
player.setPosition(SPAWN.x, SPAWN.z, 0) // facing -z: the shore-light

// ---------------- pages: 7 of the 14 candidates, randomized per run ---------
{
  const idx = []
  for (let i = 0; i < world.candidates.length; i++) idx.push(i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  world.spawnPages(idx.slice(0, 7))
}

// ---------------- game state -------------------------------------------------
const PAGES_TOTAL = 7
const NUMS = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']
const HOLD_SECONDS = 3
const SEE_RANGE = 42 // m: on screen inside this = the static rises

let phase = 'title' // 'title' | 'playing' | 'won' | 'lost'
let simT = 0
let elapsed = 0
let pagesTaken = 0
let staticV = 0
let holdT = 0
let gutterT = 0
let eHeld = false
let simHold = false // __game.setHold

// brujo direction
let relocTimer = 0
let mercyRelocs = 2 // gentle early mercy: his first two waits keep the slow band
let appearCooldown = 6 // he gives you a few first seconds
let lookT = 0
let burned = false
let wasObserved = false
let observedNow = false
let onScreenAny = false
let brujoDist = 1e9
let stingCooldown = 0
let holdStarted = false

// one-time teach hints
let sightHintShown = false
let lockedHintShown = false
let slowHintShown = false

const cinema = { active: false, t: 0, dark: false }

// reused per-frame scratch (no frame-loop allocations)
const _proj = new THREE.Vector3()
const audioState = { active: false, moving: false, sprint: false, static01: 0, pages01: 0, hold01: 0 }

// gated HUD strings
const PROMPT_TAKE = 'e — tomar la página'
const PROMPT_PUSH = 'mantén e — empuja el bote'
let lockedPrompt = ''
let lockedPromptFor = -1
let wasNearPage = false // edge-detect: parchment flutter on first approach

// ---------------- title narration --------------------------------------------
// The 'begin' line ("Siete páginas cuelgan del bosque…") belongs over the
// title card, not behind BEGIN. Autoplay policies usually keep a no-gesture
// AudioContext 'suspended', so this is best-effort: try at load (below, after
// setup); if blocked, the first pointer/key/touch starts it — before BEGIN.
// BEGIN never restarts a line already out, and still speaks it the old way if
// nothing managed to start it earlier. Silent no-op without WebAudio/the clip.
let introSpoken = false
function speakIntro() {
  if (introSpoken) return
  introSpoken = true
  untapIntro()
  audio.voice('begin')
}
function untapIntro() {
  window.removeEventListener('pointerdown', introTap, true)
  window.removeEventListener('keydown', introTap, true)
  window.removeEventListener('touchstart', introTap, true)
}
function introTap() {
  untapIntro() // one-time: whatever happens, these taps never fire twice
  if (introSpoken || phase !== 'title') return
  try {
    audio.unlock() // a real gesture — creates or resumes the context
    speakIntro()
  } catch (e) { /* narration is flavor — never an error */ }
}
try {
  audio.unlock() // load-time attempt; the policy may keep it suspended
  if (audio.state.contextState === 'running') speakIntro()
} catch (e) { /* silent — the gesture taps below cover it */ }
if (!introSpoken) {
  window.addEventListener('pointerdown', introTap, true)
  window.addEventListener('keydown', introTap, true)
  window.addEventListener('touchstart', introTap, true)
}

// ---------------- handlers (real win/lose/begin paths) -----------------------
function begin() {
  if (phase !== 'title') return
  phase = 'playing'
  audio.unlock()
  speakIntro() // no-op if the title narration already started; else the old path
  ui.closeTitle()
  ui.setPages(0)
  player.enabled = true
  player.requestLock()
  ui.hint('siete páginas cuelgan del bosque, pálidas como la espuma — no lo mires: mirar es abrir una puerta', 7000)
}

function winGame() {
  if (phase === 'won' || phase === 'lost') return
  phase = 'won'
  player.enabled = false
  cinema.active = false
  try {
    localStorage.setItem('chiloe-quicavi-done', '1') // hub badge — WIN ONLY
  } catch (e) {}
  audio.stinger('win')
  audio.voice('win') // "El agua negra te abre su mano fría… esta noche el canal te suelta, como la marea suelta a la luna."
  fx.burst(BOAT.x, terrainHeight(BOAT.x, BOAT.z) + 1, BOAT.z, 0.62, 1.0, 0.82, 30, 1.6, 1.2)
  ui.flash('rgba(159,255,208,1)', 0.3, 1600)
  ui.hold(-1)
  ui.prompt('')
  try {
    document.exitPointerLock?.()
  } catch (e) {}
  ui.showEnd('won')
}

function catchPlayer() {
  if (phase !== 'playing') return
  phase = 'lost'
  player.enabled = false
  audio.stinger('caught')
  fx.shake(1)
  ui.prompt('')
  ui.hold(-1)
  brujo.scareFace.visible = true
  brujo.scareFace.scale.setScalar(0.3)
  cinema.active = true
  cinema.t = 0
  cinema.dark = false
}

function updateCinema(dt) {
  cinema.t += dt
  const k = Math.min(1, cinema.t / 0.4) // his face fills the frame for 0.4 s
  brujo.scareFace.scale.setScalar(0.3 + 1.5 * k * k)
  camera.rotation.z = Math.sin(simT * 83) * 0.05 * (1.1 - k)
  if (cinema.t > 0.4 && !cinema.dark) {
    cinema.dark = true // cut to black
    ui.blackout(true)
    brujo.scareFace.visible = false
    camera.rotation.z = 0
  }
  if (cinema.t > 1.35) {
    cinema.active = false
    try {
      document.exitPointerLock?.()
    } catch (e) {}
    audio.voice('lose') // "Lo miraste, y entró por tus ojos como entra el mar en la barca rota… no lo mires: cuenta las páginas, y camina."
    ui.showEnd('caught')
  }
}

function takePage(i) {
  const p = world.pages[i]
  if (!p || p.taken || pagesTaken >= PAGES_TOTAL) return
  world.collectPage(i)
  pagesTaken++
  audio.stinger('rip')
  audio.whisper(pagesTaken)
  ui.setPages(pagesTaken)
  fx.burst(p.x, p.y, p.z, 0.91, 0.86, 0.72, 20, 1.1, 0.9)
  fx.shake(0.12)
  ui.flash('rgba(232,220,192,1)', 0.09, 600)
  // he answers every taken page
  relocTimer = Math.min(relocTimer, 1.2 + Math.random() * 1.2)
  if (pagesTaken >= PAGES_TOTAL) {
    world.setBeacon(true)
    audio.stinger('beacon')
    ui.whisper('siete…', 3000)
    ui.hint('el bote, al sur — hacia la luz de la costa', 8000)
  } else {
    ui.whisper(NUMS[pagesTaken - 1] + '…')
  }
}

function tryTake() {
  if (phase !== 'playing' || cinema.active || ui.isOverlayOpen()) return
  const px = player.position.x
  const pz = player.position.z
  const fxd = -Math.sin(player.yaw)
  const fzd = -Math.cos(player.yaw)
  for (let i = 0; i < world.pages.length; i++) {
    const p = world.pages[i]
    if (p.taken) continue
    const dx = p.x - px
    const dz = p.z - pz
    const d2 = dx * dx + dz * dz
    if (d2 > 2.4 * 2.4) continue
    const d = Math.sqrt(d2) || 1
    if ((dx / d) * fxd + (dz / d) * fzd < 0.3) continue // must be looking at it
    takePage(i)
    return
  }
}

// ---------------- el brujo: relocation + static -------------------------------
function progress() {
  return pagesTaken / PAGES_TOTAL
}

function resetRelocTimer() {
  let base = 11 - 6.4 * progress() // 11 s → 4.6 s
  if (mercyRelocs > 0) {
    mercyRelocs--
    base = 11 // first two relocations: the slow band, however fast you read
  }
  relocTimer = base * (0.72 + Math.random() * 0.55) // ≈ 8–14 s early, 3.3–6.3 late
}

function doRelocate() {
  const prog = progress()
  let dist = (42 - 16 * prog) * (0.85 + Math.random() * 0.35) // ≈ 36–50 m → 22–35 m
  let gutter = false
  if (pagesTaken >= 5 && Math.random() < 0.55) {
    gutter = true
    dist *= 0.72 // pressure: closer, with the farol guttering
  }
  const viewAngle = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw))
  const ok = brujo.relocate(player.position.x, player.position.z, viewAngle + Math.PI, 1.9, dist)
  if (ok) {
    lookT = 0
    burned = false
    audio.stinger('relocate')
    if (gutter) {
      gutterT = 2
      audio.stinger('gutter')
    }
  }
  resetRelocTimer()
}

function updateBrujo(dt) {
  const px = player.position.x
  const pz = player.position.z

  observedNow = false
  onScreenAny = false
  brujoDist = 1e9

  if (brujo.present) {
    const dx = brujo.x - px
    const dz = brujo.z - pz
    brujoDist = Math.sqrt(dx * dx + dz * dz)
    // keep the frustum honest under manual stepping (render only refreshes
    // matrices once per step() batch) — in-place, allocation-free
    camera.updateMatrixWorld()
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    _proj.set(brujo.x, terrainHeight(brujo.x, brujo.z) + 1.7, brujo.z).project(camera)
    if (_proj.z < 1) {
      onScreenAny = Math.abs(_proj.x) < 1.18 && Math.abs(_proj.y) < 1.3
      observedNow = Math.abs(_proj.x) < 1.0 && Math.abs(_proj.y) < 1.05 && brujoDist < SEE_RANGE
    }

    if (observedNow) {
      lookT += dt
      if (lookT > 2) burned = true // he will leave — but never in view
      let rise = (0.05 + 0.6 * Math.pow(Math.max(0, 1 - brujoDist / SEE_RANGE), 1.3)) * (1 + 0.13 * pagesTaken)
      if (brujoDist < 9) rise += 0.35
      staticV += rise * dt
      if (!wasObserved && stingCooldown <= 0) {
        audio.stinger('sting')
        stingCooldown = 7
      }
      if (!sightHintShown && staticV > 0.3) {
        sightHintShown = true
        ui.hint('no lo mires — aparta la vista', 4500)
      }
    } else {
      staticV -= 0.1 * dt // looking away decays it slowly
    }

    if (burned && !onScreenAny) {
      brujo.vanish()
      audio.stinger('vanish')
      appearCooldown = 2.2 + 3 * (1 - progress()) + Math.random() * 1.6
      lookT = 0
      burned = false
    } else {
      relocTimer -= dt
      if (brujoDist > 62) relocTimer = Math.min(relocTimer, 1.2) // stay relevant
      if (relocTimer <= 0) {
        if (!onScreenAny) doRelocate()
        else relocTimer = 0.6 // retry the moment you look away
      }
    }

    // walking into him is also looking at him, terminally
    if (brujo.present && brujoDist < 2.3) staticV = 1
  } else {
    staticV -= 0.1 * dt
    appearCooldown -= dt
    if (appearCooldown <= 0) doRelocate()
  }

  if (staticV < 0) staticV = 0
  if (staticV > 1) staticV = 1
  if (stingCooldown > 0) stingCooldown -= dt
  wasObserved = observedNow

  if (staticV >= 1) catchPlayer()
}

// ---------------- the boat (EXIT) ---------------------------------------------
function updateBoat(dt) {
  const dx = BOAT.x - player.position.x
  const dz = BOAT.z - player.position.z
  const nearBoat = dx * dx + dz * dz < 4.6 * 4.6

  if (nearBoat && pagesTaken >= PAGES_TOTAL && phase === 'playing') {
    ui.prompt(PROMPT_PUSH)
    if (eHeld || simHold) {
      if (!holdStarted) {
        holdStarted = true
        // the whole forest rises behind you
        const viewAngle = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw))
        brujo.relocate(player.position.x, player.position.z, viewAngle + Math.PI, 0.7, 14)
        lookT = 0
        burned = false
        audio.stinger('relocate')
        audio.voice('push') // "No te des vuelta… el bosque entero sube a tu espalda, como una ola que no rompe."
        ui.hint('no te des vuelta — el bosque sube a tu espalda, como una ola que no rompe', 4500)
      }
      holdT += dt
      if (holdT >= HOLD_SECONDS) {
        winGame()
        return
      }
    } else {
      holdT = Math.max(0, holdT - dt * 2)
    }
    ui.hold(holdT > 0 ? holdT / HOLD_SECONDS : -1)
  } else {
    if (nearBoat && pagesTaken < PAGES_TOTAL) {
      if (lockedPromptFor !== pagesTaken) {
        lockedPromptFor = pagesTaken
        const left = PAGES_TOTAL - pagesTaken
        lockedPrompt = left === 1 ? 'el bote está cerrado — falta una página' : 'el bote está cerrado — faltan ' + left + ' páginas'
      }
      ui.prompt(lockedPrompt)
      if (!lockedHintShown) {
        lockedHintShown = true
        ui.hint('las páginas primero — el canal no suelta a un deudor', 5200)
      }
    }
    holdT = Math.max(0, holdT - dt * 2)
    ui.hold(holdT > 0 ? holdT / HOLD_SECONDS : -1)
    if (holdStarted && holdT <= 0) holdStarted = false
  }
  return nearBoat
}

// ---------------- prompts -------------------------------------------------------
function updatePrompt(nearBoat) {
  if (nearBoat) return // boat owns the prompt while close
  const px = player.position.x
  const pz = player.position.z
  let near = false
  for (let i = 0; i < world.pages.length; i++) {
    const p = world.pages[i]
    if (p.taken) continue
    const dx = p.x - px
    const dz = p.z - pz
    if (dx * dx + dz * dz < 2.4 * 2.4) {
      near = true
      break
    }
  }
  if (near && !wasNearPage) audio.stinger('flutter') // it stirs on its nail
  wasNearPage = near
  ui.prompt(near ? PROMPT_TAKE : '')
}

// ---------------- the compass (direction help) --------------------------------
const RAD2DEG = 180 / Math.PI
function updateCompass() {
  const px = player.position.x
  const pz = player.position.z
  let tx = BOAT.x // 7/7 — the needle turns to the rowboat
  let tz = BOAT.z
  if (pagesTaken < PAGES_TOTAL) {
    let best = Infinity
    for (let i = 0; i < world.pages.length; i++) {
      const p = world.pages[i]
      if (p.taken) continue
      const dx = p.x - px
      const dz = p.z - pz
      const d2 = dx * dx + dz * dz
      if (d2 < best) {
        best = d2
        tx = p.x
        tz = p.z
      }
    }
  }
  // signed bearing from facing to target (yaw 0 faces -z) → CSS deg, cw +
  let rel = Math.atan2(px - tx, pz - tz) - player.yaw
  rel -= Math.PI * 2 * Math.floor((rel + Math.PI) / (Math.PI * 2)) // wrap [-π, π)
  ui.compass(-rel * RAD2DEG)
}

// ---------------- the frame --------------------------------------------------
function frame(dt) {
  if (dt > 0.05) dt = 0.05
  if (!(dt > 0)) return
  simT += dt

  const overlay = ui.isOverlayOpen()

  if (cinema.active) {
    updateCinema(dt)
  } else if (phase === 'playing' && !overlay) {
    elapsed += dt
    player.update(dt)
    updateBrujo(dt)
    if (phase === 'playing') {
      const nearBoat = updateBoat(dt)
      if (phase === 'playing') updatePrompt(nearBoat)
    }
    updateCompass()
    if (gutterT > 0) gutterT -= dt
    if (!slowHintShown && elapsed > 50 && pagesTaken === 0) {
      slowHintShown = true
      ui.hint('busca los árboles pálidos, las piedras alzadas, las ruinas', 6500)
    }
    fx.update(dt, simT, true)
  } else {
    fx.update(dt, simT, false)
  }

  // visuals that breathe even under overlays (cheap, deterministic)
  world.update(dt, simT, player.position.x, player.position.z)
  brujo.update(dt, simT)

  // farol flicker (+ gutter)
  let f = 0.9 + 0.06 * Math.sin(simT * 11.7) + 0.04 * Math.sin(simT * 23.1 + 1.7)
  if (gutterT > 0 && phase === 'playing') f *= 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(simT * 43))
  farolPoint.intensity = 60 * f
  farolSpot.intensity = 90 * f

  // static overlay (visual = meter, the push-off swell, or the catch flicker)
  let vis = staticV
  if (holdT > 0) {
    const hv = (holdT / HOLD_SECONDS) * 0.5
    if (hv > vis) vis = hv
  }
  if (cinema.active && !cinema.dark) vis = 0.5 + 0.35 * Math.sin(simT * 57)
  else if (cinema.dark) vis = 0
  ui.setStatic(phase === 'won' ? 0 : vis)
  ui.drawStatic(simT)

  audioState.active = phase === 'playing' && !overlay
  audioState.moving = player.speed > 0.6
  audioState.sprint = player.sprinting
  audioState.static01 = phase === 'won' ? 0 : vis
  audioState.pages01 = pagesTaken / PAGES_TOTAL
  audioState.hold01 = holdT / HOLD_SECONDS
  audio.update(dt, audioState)
}

function render() {
  renderer.render(scene, camera)
}

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  frame(Math.min(clock.getDelta(), 0.05))
  render()
})

// ---------------- chrome ------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const m = audio.toggleMute()
    ui.toast(m ? 'silencio' : 'sonido')
  } else if (e.code === 'KeyE') {
    if (!eHeld) tryTake()
    eHeld = true
  }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') eHeld = false
})
window.addEventListener('blur', () => {
  eHeld = false
})
renderer.domElement.addEventListener('click', () => {
  tryTake()
})

ui.init()
ui.showTitle(begin)

// ---------------- TEST API (documented in the header) -------------------------
const clampWalk = (v) => Math.max(-WALK_BOUND, Math.min(WALK_BOUND, Number(v) || 0))

window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
    render()
  },
  getState() {
    return {
      phase,
      pages: pagesTaken,
      pagesTotal: PAGES_TOTAL,
      static: Math.round(staticV * 1000) / 1000,
      brujo: brujo.present ? [Math.round(brujo.x * 10) / 10, Math.round(brujo.z * 10) / 10] : null,
      brujoPresent: brujo.present,
      brujoObserved: observedNow,
      pos: [player.position.x, player.position.z],
      yaw: player.yaw,
      boat: [BOAT.x, BOAT.z],
      hold: Math.round(holdT * 100) / 100,
      gutter: gutterT > 0,
      elapsed: Math.round(elapsed * 10) / 10,
      muted: audio.state.muted,
    }
  },
  forceWin() {
    winGame()
  },
  forceLose() {
    catchPlayer()
  },
  pages() {
    return pagesTaken
  },
  grantPages(n) {
    const target = Math.max(0, Math.min(PAGES_TOTAL, n | 0))
    for (let i = 0; i < world.pages.length && pagesTaken < target; i++) {
      if (!world.pages[i].taken) takePage(i)
    }
    return pagesTaken
  },
  pagePositions() {
    const out = []
    for (let i = 0; i < world.pages.length; i++) {
      if (!world.pages[i].taken) out.push([world.pages[i].x, world.pages[i].z])
    }
    return out
  },
  pageSeams() {
    return world.seamCount()
  },
  brujoPos() {
    return brujo.present ? [brujo.x, brujo.z] : null
  },
  forceRelocate(dist = 18) {
    const viewAngle = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw))
    brujo.relocate(player.position.x, player.position.z, viewAngle, 0.12, Math.max(3, Number(dist) || 18))
    lookT = 0
    burned = false
    audio.stinger('relocate')
    resetRelocTimer()
    return [brujo.x, brujo.z]
  },
  setStatic(v) {
    staticV = Math.max(0, Math.min(1, Number(v) || 0))
  },
  boatPos() {
    return [BOAT.x, BOAT.z]
  },
  teleport(x, z, yaw) {
    player.setPosition(clampWalk(x), clampWalk(z), typeof yaw === 'number' ? yaw : undefined)
  },
  setHold(v) {
    simHold = !!v
  },
}
