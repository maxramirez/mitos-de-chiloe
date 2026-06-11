// ============================================================================
// EL INVUNCHE — La cueva de Quicaví · Mitos de Chiloé
// ============================================================================
// First-person maze horror. A seeded 17x17 recursive-backtracker maze of wet
// rock, pitch dark beyond a hand candle (180 s of wax; its light radius
// shrinks as the wax burns). Six faint wall sconces each refill 45 s, once.
// Find the 3 brujo seals (glowing sigil stones in dead ends — each plays a
// low toll) to open the exit door, marked by a cold seam of daylight. The
// Invunche shuffles cell-to-cell toward noise (sprinting is heard), lingers
// near the seals, and presses you once the door is open. You hear him before
// you see him: dragging foot and wet breath scale with proximity, and his red
// eye-glow tints the fog around corners.
//
// WIN  — take all 3 seals, then walk through the opened door.
//        (sets localStorage 'chiloe-invunche-done' = '1' — win only)
// LOSE — he reaches your cell in line of sight (close-up of the backward
//        face, cut to black), or the candle dies (slow dark).
//
// The loop is a pure frame(dt): driven by requestAnimationFrame AND manually
// steppable (rAF is throttled in hidden tabs). dt clamped at 0.05; the sim
// pauses while any overlay (title / win / lose) is open. No allocations in
// the frame path; all sim randomness comes from a seeded rng (deterministic
// stepping). Audio is lazy WebAudio unlocked by BEGIN; M toggles mute.
//
// ============================== TEST API ====================================
// window.__game = {
//   begin()                    — same as clicking BEGIN (unlocks audio too)
//   step(dt = 1/60, steps = 1) — advance the sim deterministically, render once
//   getState()                 — { phase:'title'|'playing'|'won'|'lost',
//                                  wax (s), seals, sealsTotal, doorOpening,
//                                  doorOpen, pos:[x,z] world, cell:[cx,cz],
//                                  invunche:[cx,cz], invuncheMode, elapsed,
//                                  muted }
//   forceWin()                 — runs the real win handler (localStorage flag,
//                                win card); skips nothing that matters
//   forceLose(reason?)         — real lose handler; 'caught' (default) | 'dark'
//   revealMaze()               — ascii tile map: '#' wall · '.' open · S spawn
//                                · E exit door · s seal (uncollected) ·
//                                c sconce (unused) · I invunche · P player
//   teleport(cx, cz)           — move the PLAYER to maze cell (0..16, 0..16)
//   setWax(s)                  — set candle wax seconds (0..180; 0 = slow dark)
//   seals(n)                   — collect seals up to count n (3 opens the door
//                                through the real unlock handler)
//   invunchePos()              — [cx, cz] his current cell
//   moveInvuncheTo(cx, cz)     — snap him to a cell, clearing his path
//   sealCells()                — [[cx,cz] x3] seal locations (routing tests)
//   sconceCells()              — [[cx,cz] x6] sconce locations
//   exitCell()                 — [cx, cz] cell beside the daylight door
// }
// Cell coords are maze cells (17x17); world x/z of a cell center is
// (2*c + 1.5) * TILE  (TILE = 3.2).
// ============================================================================

import * as THREE from 'three'
import {
  CELLS, TILES, TILE, buildMaze, mulberry32, bfsDistances, deadEnds,
  cellIndex, tileIndex, cellCenter, asciiMaze, DX, DZ, openBetween,
} from './maze.js'
import { createWorld } from './world.js'
import { createInvunche } from './invunche.js'
import { createPlayer } from './player.js'
import { createAudio } from './audio.js'
import { createFX } from './fx.js'
import { ui } from './ui.js'

// ---------------- maze + placement (seeded, deterministic) -----------------
const SEED = 20260610
const wall = buildMaze(SEED)
const placeRng = mulberry32(SEED ^ 0x51c4a7)
const simRng = mulberry32(SEED ^ 0x9e3779b9)

const spawnIdx = cellIndex(0, 0)
const dist = bfsDistances(wall, 0, 0)

// exit: the border cell farthest (by walk) from spawn
let exitIdx = spawnIdx
for (let c = 0; c < CELLS * CELLS; c++) {
  const x = c % CELLS
  const z = (c / CELLS) | 0
  if (x === 0 || z === 0 || x === CELLS - 1 || z === CELLS - 1) {
    if (dist[c] > dist[exitIdx]) exitIdx = c
  }
}
const exitCx = exitIdx % CELLS
const exitCz = (exitIdx / CELLS) | 0
const doorDir = exitCx === CELLS - 1 ? 0 : exitCx === 0 ? 1 : exitCz === CELLS - 1 ? 2 : 3
const doorTile = [2 * exitCx + 1 + DX[doorDir], 2 * exitCz + 1 + DZ[doorDir]]

// seals: 3 far-flung dead ends
let ends = deadEnds(wall).filter((c) => c !== spawnIdx && c !== exitIdx && dist[c] >= 8)
if (ends.length < 3) ends = deadEnds(wall).filter((c) => c !== spawnIdx && c !== exitIdx)
ends.sort((a, b) => dist[b] - dist[a])
const sealIdxs = [ends[0]]
while (sealIdxs.length < 3) {
  let best = -1
  let bestScore = -1
  for (const c of ends) {
    if (sealIdxs.indexOf(c) !== -1) continue
    let minM = Infinity
    for (const s of sealIdxs) {
      const m = Math.abs((c % CELLS) - (s % CELLS)) + Math.abs(((c / CELLS) | 0) - ((s / CELLS) | 0))
      if (m < minM) minM = m
    }
    const score = minM * 3 + dist[c]
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  sealIdxs.push(best)
}

// sconces: 6 cells spread across the walk-depth range
const openCells = []
for (let c = 0; c < CELLS * CELLS; c++) {
  if (c !== spawnIdx && c !== exitIdx && sealIdxs.indexOf(c) === -1 && dist[c] > 3) openCells.push(c)
}
openCells.sort((a, b) => dist[a] - dist[b])
const sconceIdxs = [0.12, 0.27, 0.42, 0.57, 0.72, 0.87].map((f) => openCells[(f * openCells.length) | 0])

const toCell = (c) => [c % CELLS, (c / CELLS) | 0]
const layout = {
  spawn: [0, 0],
  exitCell: [exitCx, exitCz],
  doorTile,
  doorDir,
  sealCells: sealIdxs.map(toCell),
  sconceCells: sconceIdxs.map(toCell),
}

// ---------------- three.js boot ---------------------------------------------
const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.25
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x010202)
scene.fog = new THREE.FogExp2(0x010202, 0.06)
const camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.05, 140)
scene.add(camera)

const world = createWorld(scene, wall, layout, placeRng)
camera.add(world.candleGroup)
camera.add(world.candleLight)

const inv = createInvunche(wall, simRng, exitCx, exitCz)
scene.add(inv.group)
inv.scareFace.position.set(0, -0.05, -0.85)
inv.scareFace.scale.setScalar(0.12)
camera.add(inv.scareFace)

const fx = createFX(scene, camera)
const audio = createAudio()

// ---------------- collision -------------------------------------------------
function isWallAt(x, z) {
  const tx = Math.floor(x / TILE)
  const tz = Math.floor(z / TILE)
  if (tx < 0 || tz < 0 || tx >= TILES || tz >= TILES) return true
  if (world.door.openT > 0.9 && tx === doorTile[0] && tz === doorTile[1]) return false
  return wall[tileIndex(tx, tz)] === 1
}

const PLAYER_R = 0.42
function isWalkable(x, z) {
  const x0 = Math.floor((x - PLAYER_R) / TILE)
  const x1 = Math.floor((x + PLAYER_R) / TILE)
  const z0 = Math.floor((z - PLAYER_R) / TILE)
  const z1 = Math.floor((z + PLAYER_R) / TILE)
  for (let tz = z0; tz <= z1; tz++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tz < 0 || tx >= TILES || tz >= TILES) return false
      if (wall[tileIndex(tx, tz)] === 1) {
        if (world.door.openT > 0.9 && tx === doorTile[0] && tz === doorTile[1]) continue
        return false
      }
    }
  }
  return true
}

function hasLOS(x0, z0, x1, z1) {
  const dx = x1 - x0
  const dz = z1 - z0
  const d = Math.sqrt(dx * dx + dz * dz)
  const steps = d / 0.45 + 1
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (isWallAt(x0 + dx * t, z0 + dz * t)) return false
  }
  return true
}

// ---------------- player ----------------------------------------------------
const player = createPlayer(camera, renderer.domElement, isWalkable)
let spawnDir = 0
for (let d = 0; d < 4; d++) {
  if (openBetween(wall, 0, 0, d)) {
    spawnDir = d
    break
  }
}
player.setPosition(cellCenter(0), cellCenter(0), Math.atan2(-DX[spawnDir], -DZ[spawnDir]))

const clampCell = (v) => Math.max(0, Math.min(CELLS - 1, v | 0))
const playerCellX = () => clampCell(Math.round((player.position.x / TILE - 1.5) / 2))
const playerCellZ = () => clampCell(Math.round((player.position.z / TILE - 1.5) / 2))

// ---------------- game state -------------------------------------------------
const WAX_MAX = 180
const SCONCE_WAX = 45
const DARK_SECONDS = 3.6

let phase = 'title' // 'title' | 'playing' | 'won' | 'lost'
let wax = WAX_MAX
let elapsed = 0
let simT = 0
let sealsCollected = 0
let dying = 0
let flare = 0
let proxLast = 0
let lowWaxWarned = false
let sconceFullHinted = false
let heardVoiced = false // the 'te ha oído' whisper speaks once per run
const cinema = { active: false, t: 0, blackout: false }
const winCinema = { active: false, t: 0, fromX: 0, fromZ: 0, dirX: 0, dirZ: 0 }
const FOG_NIGHT = new THREE.Color(0x010202)
const FOG_DAY = new THREE.Color(0xdfeefc)

// reused per-frame context objects (no frame-loop allocations)
const env = { elapsed: 0, doorOpen: false, playerCellIdx: 0, sealIdx: new Int16Array(3), sealCount: 3 }
for (let i = 0; i < 3; i++) env.sealIdx[i] = sealIdxs[i]
const candleState = { wax01: 1, dieFactor: 1, flare: 0 }
const audioState = { active: false, moving: false, sprint: false, prox: 0, wax01: 1 }

function rebuildSealEnv() {
  let n = 0
  for (let i = 0; i < 3; i++) {
    if (!world.seals[i].collected) env.sealIdx[n++] = sealIdxs[i]
  }
  env.sealCount = n
}

inv.onStep = () => audio.dragStep(proxLast)
inv.onMode = (m) => {
  if (m === 'hunt' && phase === 'playing') {
    audio.stinger('snarl')
    if (!heardVoiced) {
      heardVoiced = true
      audio.voice('heard')
    }
    ui.hint('te ha oído', 2400)
  }
}

// ---------------- handlers (real win/lose/begin paths) -----------------------
function begin() {
  if (phase !== 'title') return
  phase = 'playing'
  audio.unlock()
  audio.voice('intro') // the title line, only on the BEGIN gesture
  ui.closeTitle()
  ui.setSeals(0)
  player.enabled = true
  player.requestLock()
  ui.hint('tres sellos abren la puerta — camina despacio', 6500)
}

// the short walk into the daylight before the win card (mirrors updateCinema)
function startWinCinema() {
  if (winCinema.active || phase !== 'playing') return
  winCinema.active = true
  winCinema.t = 0
  player.enabled = false
  winCinema.fromX = player.position.x
  winCinema.fromZ = player.position.z
  const dx = world.door.x - winCinema.fromX
  const dz = world.door.z - winCinema.fromZ
  const d = Math.sqrt(dx * dx + dz * dz) || 1
  winCinema.dirX = dx / d
  winCinema.dirZ = dz / d
}

function updateWinCinema(dt) {
  winCinema.t += dt
  const k = Math.min(1, winCinema.t / 1.2)
  const e = k * k * (3 - 2 * k)
  player.position.x = winCinema.fromX + winCinema.dirX * 2 * e
  player.position.z = winCinema.fromZ + winCinema.dirZ * 2 * e
  scene.fog.color.lerpColors(FOG_NIGHT, FOG_DAY, e)
  scene.fog.density = 0.06 + (0.01 - 0.06) * e
  scene.background.copy(scene.fog.color)
  if (winCinema.t > 1.2) {
    winCinema.active = false
    winGame()
  }
}

function winGame() {
  if (phase === 'won' || phase === 'lost') return
  phase = 'won'
  player.enabled = false
  try {
    localStorage.setItem('chiloe-invunche-done', '1') // hub completion badge — win only
  } catch (e) {}
  audio.stinger('win')
  audio.voice('win')
  ui.flash('rgba(223,238,252,1)', 0.85, 1900)
  try {
    document.exitPointerLock?.()
  } catch (e) {}
  ui.showEnd('won')
}

function finishLose(kind) {
  if (phase === 'won') return
  phase = 'lost'
  cinema.active = false
  player.enabled = false
  try {
    document.exitPointerLock?.()
  } catch (e) {}
  audio.voice(kind) // 'caught' | 'dark' — speaks with the lose card
  ui.showEnd(kind)
}

function catchPlayer() {
  if (phase !== 'playing') return
  phase = 'lost'
  player.enabled = false
  audio.stinger('caught')
  ui.flash('rgba(120,8,4,1)', 0.55, 1000)
  fx.shake(1)
  inv.scareFace.visible = true
  inv.scareFace.scale.setScalar(0.12)
  cinema.active = true
  cinema.t = 0
  cinema.blackout = false
}

function updateCinema(dt) {
  cinema.t += dt
  const k = Math.min(1, cinema.t / 0.38)
  inv.scareFace.scale.setScalar(0.12 + 0.95 * k * k)
  camera.rotation.z = Math.sin(simT * 83) * 0.05 * (1.15 - k)
  if (cinema.t > 0.85 && !cinema.blackout) {
    cinema.blackout = true
    ui.blackout(true)
    inv.scareFace.visible = false
    camera.rotation.z = 0
  }
  if (cinema.t > 1.4) {
    cinema.active = false
    finishLose('caught')
  }
}

function unlockDoor() {
  if (world.door.opening) return
  world.openDoor()
  audio.stinger('unlock')
  fx.shake(0.55)
  ui.hint('la puerta del día está abierta — sigue la luz fría', 8000)
}

function collectSealAt(i) {
  const s = world.seals[i]
  if (s.collected) return
  world.collectSeal(i)
  sealsCollected++
  rebuildSealEnv()
  audio.stinger('toll')
  fx.burst(s.x, 1.1, s.z, 0.62, 1.0, 0.82, 26, 1.4, 1.3)
  fx.shake(0.18)
  ui.flash('rgba(159,255,208,1)', 0.12, 800)
  ui.setSeals(sealsCollected)
  if (sealsCollected === 1) ui.hint('un sello — quedan dos', 4200)
  else if (sealsCollected === 2) ui.hint('dos sellos — queda uno', 4200)
  else if (sealsCollected >= 3) unlockDoor()
}

// ---------------- per-frame checks -------------------------------------------
function checkSeals() {
  const px = player.position.x
  const pz = player.position.z
  for (let i = 0; i < world.seals.length; i++) {
    const s = world.seals[i]
    if (s.collected) continue
    const dx = s.x - px
    const dz = s.z - pz
    if (dx * dx + dz * dz < 1.75 * 1.75) collectSealAt(i)
  }
}

function checkSconces() {
  const px = player.position.x
  const pz = player.position.z
  for (let i = 0; i < world.sconces.length; i++) {
    const s = world.sconces[i]
    if (s.used) continue
    const dx = s.x - px
    const dz = s.z - pz
    if (dx * dx + dz * dz < 1.8 * 1.8) {
      // a once-only refill is too precious to burn at near-full wax
      if (wax >= WAX_MAX - SCONCE_WAX * 0.6) {
        if (!sconceFullHinted) {
          sconceFullHinted = true
          ui.hint('la vela aún está entera — el candil puede esperar', 3800)
        }
        continue
      }
      world.useSconce(i)
      wax = Math.min(WAX_MAX, wax + SCONCE_WAX)
      if (wax >= 30) lowWaxWarned = false // re-arm the low-wax coaching
      dying = 0
      flare = 1
      audio.stinger('sconce')
      fx.burst(s.x, 1.9, s.z, 1.0, 0.7, 0.35, 16, 0.9, 0.8)
      ui.flash('rgba(255,179,92,1)', 0.1, 700)
      ui.hint('cera robada de los brujos — la llama respira', 3800)
    }
  }
}

function checkWin() {
  if (!world.door.isOpen()) return
  const dx = world.door.x - player.position.x
  const dz = world.door.z - player.position.z
  if (dx * dx + dz * dz < (TILE * 0.6) * (TILE * 0.6)) startWinCinema()
}

function updateWax(dt) {
  if (wax > 0) {
    wax -= dt
    if (wax <= 0) {
      wax = 0
      audio.stinger('dark')
      ui.hint('la vela ha muerto', 3000)
    } else if (!lowWaxWarned && wax < 30) {
      lowWaxWarned = true
      audio.stinger('lowwax')
      ui.hint('la vela se muere — busca un candil en la pared', 5200)
    }
  }
  if (wax <= 0) {
    dying += dt
    if (dying >= DARK_SECONDS) {
      ui.blackout(true)
      finishLose('dark')
    }
  }
  flare = Math.max(0, flare - dt * 1.1)
}

// ---------------- HUD (DOM writes gated on change) ----------------------------
let hudWaxPct = -1
let hudLow = false
let hudSeals = -1
function updateHUD() {
  const pct = Math.round((wax / WAX_MAX) * 100)
  const low = wax < 30
  if (pct !== hudWaxPct || low !== hudLow) {
    hudWaxPct = pct
    hudLow = low
    ui.setWax(pct, low)
  }
  if (sealsCollected !== hudSeals) {
    hudSeals = sealsCollected
    ui.setSeals(sealsCollected)
  }
}

// ---------------- the frame --------------------------------------------------
function frame(dt) {
  if (dt > 0.05) dt = 0.05
  if (!(dt > 0)) return
  simT += dt

  if (phase === 'playing' && winCinema.active) {
    updateWinCinema(dt)
    fx.update(dt, simT, false)
  } else if (phase === 'playing') {
    elapsed += dt
    player.update(dt)
    updateWax(dt)
    checkSconces()
    checkSeals()
    checkWin()

    // invunche
    env.elapsed = elapsed
    env.doorOpen = world.door.opening
    env.playerCellIdx = cellIndex(playerCellX(), playerCellZ())
    inv.update(dt, env)

    const ix = inv.worldX - player.position.x
    const iz = inv.worldZ - player.position.z
    const d = Math.sqrt(ix * ix + iz * iz)
    proxLast = Math.max(0, Math.min(1, 1 - d / 30))
    inv.setProximity(proxLast)

    // he hears sprinting from afar, soft steps only up close
    if (player.sprinting && d < 34) inv.hear(env.playerCellIdx, true)
    else if (player.speed > 0.6 && d < 9) inv.hear(env.playerCellIdx, false)

    // caught: your cell, his sight — wider reach mid-hunt, slippable in lurk
    const catchR = 1.5 + (inv.mode === 'hunt' ? 0.5 : 0)
    if (phase === 'playing' && d < catchR && hasLOS(player.position.x, player.position.z, inv.worldX, inv.worldZ)) {
      catchPlayer()
    }

    fx.update(dt, simT, true)
  } else if (cinema.active) {
    updateCinema(dt)
    fx.update(dt, simT, false)
  } else {
    fx.update(dt, simT, false)
  }

  // visuals that breathe even under overlays (cheap, deterministic)
  candleState.wax01 = wax / WAX_MAX
  candleState.dieFactor = wax > 0 ? 1 : Math.max(0, 1 - dying / (DARK_SECONDS - 0.2))
  candleState.flare = flare
  world.update(dt, simT, candleState)

  updateHUD()

  audioState.active = phase === 'playing'
  audioState.moving = player.speed > 0.6
  audioState.sprint = player.sprinting
  audioState.prox = phase === 'playing' ? proxLast : 0
  audioState.wax01 = candleState.wax01
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
    ui.setMuted(m)
    ui.toast(m ? 'silencio' : 'sonido')
  }
})

ui.init()
ui.showTitle(begin)

// ---------------- TEST API (documented in the header) -------------------------
function revealMaze() {
  const ptx = Math.floor(player.position.x / TILE)
  const ptz = Math.floor(player.position.z / TILE)
  return asciiMaze(wall, (tx, tz) => {
    if (tx === doorTile[0] && tz === doorTile[1]) return 'E'
    if (tx === ptx && tz === ptz) return 'P'
    if (tx === 2 * inv.cellX + 1 && tz === 2 * inv.cellZ + 1) return 'I'
    for (let i = 0; i < 3; i++) {
      if (!world.seals[i].collected && tx === 2 * layout.sealCells[i][0] + 1 && tz === 2 * layout.sealCells[i][1] + 1) return 's'
    }
    for (let i = 0; i < 6; i++) {
      if (!world.sconces[i].used && tx === 2 * layout.sconceCells[i][0] + 1 && tz === 2 * layout.sconceCells[i][1] + 1) return 'c'
    }
    if (tx === 1 && tz === 1) return 'S'
    return null
  })
}

window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
    render()
  },
  getState() {
    return {
      phase,
      wax: Math.round(wax * 10) / 10,
      seals: sealsCollected,
      sealsTotal: 3,
      doorOpening: world.door.opening,
      doorOpen: world.door.isOpen(),
      pos: [player.position.x, player.position.z],
      cell: [playerCellX(), playerCellZ()],
      invunche: [inv.cellX, inv.cellZ],
      invuncheMode: inv.mode,
      elapsed: Math.round(elapsed * 10) / 10,
      muted: audio.state.muted,
    }
  },
  forceWin() {
    winGame()
  },
  forceLose(reason = 'caught') {
    const kind = reason === 'dark' ? 'dark' : 'caught'
    audio.stinger(kind)
    ui.blackout(true)
    finishLose(kind)
  },
  revealMaze,
  teleport(cx, cz) {
    player.setPosition(cellCenter(clampCell(cx)), cellCenter(clampCell(cz)))
  },
  setWax(s) {
    wax = Math.max(0, Math.min(WAX_MAX, Number(s) || 0))
    if (wax > 0) {
      dying = 0
      lowWaxWarned = wax < 30
    }
  },
  seals(n) {
    const target = Math.max(0, Math.min(3, n | 0))
    for (let i = 0; i < 3 && sealsCollected < target; i++) {
      if (!world.seals[i].collected) collectSealAt(i)
    }
    return sealsCollected
  },
  invunchePos() {
    return [inv.cellX, inv.cellZ]
  },
  moveInvuncheTo(cx, cz) {
    inv.moveTo(clampCell(cx), clampCell(cz))
  },
  sealCells() {
    return layout.sealCells.map((c) => [c[0], c[1]])
  },
  sconceCells() {
    return layout.sconceCells.map((c) => [c[0], c[1]])
  },
  exitCell() {
    return [exitCx, exitCz]
  },
}
