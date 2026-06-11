/* ============================================================
   EL VUELO DEL BRUJO — Macuñ · Mitos de Chiloé
   Night flight over a 1.5 km moonlit channel. Thread all 12
   spectral rings before the moon sets (240 s). 3 crashes and
   the macuñ tears.

   Controls: mouse (offset from screen center) OR arrow keys
   steer pitch/yaw · W boost · S brake · M mute.

   ------------------------------------------------------------
   TEST API — window.__game
   ------------------------------------------------------------
   begin()                  same as clicking the BEGIN button
                            (unlocks audio, phase -> 'playing')
   step(dt = 1/60, steps=1) advance the sim deterministically;
                            renders once at the end. Works even
                            in hidden tabs (rAF-independent).
   getState()               { phase: 'title'|'playing'|'won'|'lost',
                              ring (0-based next ring), rings (12),
                              moon (s remaining), crashes, maxCrashes,
                              stamina (0..1), wet (bool), speed,
                              pos: {x, y, z}, muted }
   forceWin()               runs the REAL win handler (sets
                            localStorage 'chiloe-brujo-done' = '1')
   forceLose(reason?)       runs the real lose handler
                            ('torn' | 'moon', default 'torn')
   ringIndex()              0-based index of the NEXT ring to pass
   teleportToRing(n)        place the brujo 40 m before ring n
                            (0-based), facing it, level flight;
                            sets it as the active ring
   setCrashes(n)            set crash count (3+ triggers the real
                            lose handler immediately)
   setMoon(s)               set remaining moonset seconds
   setStamina(f)            set boost stamina 0..1
   triggerGust()            start a wind gust telegraph right now
   ============================================================ */

import * as THREE from 'three'
import { buildWorld, createBrujo, heightAt, RINGS, COLLIDERS } from './world.js'
import { createRings, createBurst, createGustStreak, RING_RADIUS } from './rings.js'
import { createAudio } from './audio.js'
import { createUI } from './ui.js'
import { clamp } from './noise.js'

/* ---------------- constants ---------------- */
const MOON_TOTAL = 240
const MAX_CRASHES = 3
const SPEED_BASE = 16
const SPEED_BOOST = 24
const SPEED_BRAKE = 9
const WET_TIME = 10
const TOTAL_RINGS = RINGS.length

/* ---------------- renderer / scene ---------------- */
const app = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 3200)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const world = buildWorld(scene)
const ringSys = createRings(scene)
const burst = createBurst(scene)
const gustStreak = createGustStreak(scene)
const brujo = createBrujo()
scene.add(brujo.group)
const audio = createAudio()
const ui = createUI()

/* ---------------- game state ---------------- */
const state = {
  phase: 'title', // 'title' | 'playing' | 'won' | 'lost'
  simT: 0,
  moonT: MOON_TOTAL,
  crashes: 0,
  wetT: 0,
  stamina: 1,
  ringIdx: 0,
  speed: SPEED_BASE,
  crashCooldown: 0,
  shakeT: 0,
}

/* flight */
const pos = new THREE.Vector3(0, 30, -740)
let yaw = 0 // facing +z
let pitch = 0
let roll = 0
let clearT = 1 /* seconds genuinely clear of the terrain — re-arms crashes */
let boostArmed = true /* hysteresis: false at 0 stamina until back to 0.25 */
let visT = 0 /* visual clock — keeps running after the sim stops */

/* gusts */
const gust = { phase: 'idle', timer: 16, dir: 1, shove: 0 }

/* input */
const keys = Object.create(null)
let mouseX = 0
let mouseY = 0
let mouseArmed = false /* ignore where the Begin click left the cursor */
window.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1
  mouseY = (e.clientY / window.innerHeight) * 2 - 1
  if (state.phase === 'playing') mouseArmed = true
})
window.addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute()
    document.getElementById('hud-mute').textContent = muted ? 'M · silencio' : 'M · sonido'
  }
})
window.addEventListener('keyup', (e) => {
  keys[e.code] = false
})
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false
})

/* preallocated temps — no allocations in the frame loop */
const FWD = new THREE.Vector3()
const TMP = new THREE.Vector3()

/* ---------------- handlers ---------------- */
function begin() {
  if (state.phase !== 'title') return
  audio.unlock()
  mouseArmed = false
  mouseX = 0
  mouseY = 0
  state.phase = 'playing'
  ui.closeOverlay() /* no-op if the Begin button already closed it */
  ui.showHUD()
}

function win() {
  if (state.phase !== 'playing' && state.phase !== 'title') return
  state.phase = 'won'
  try {
    localStorage.setItem('chiloe-brujo-done', '1')
  } catch (e) { /* private mode */ }
  audio.ending(true)
  ui.showEnd(true)
}

function lose(reason) {
  if (state.phase === 'won' || state.phase === 'lost') return
  state.phase = 'lost'
  audio.ending(false)
  ui.showEnd(false, reason)
}

function doCrash() {
  audio.crash()
  ui.flash('crash')
  state.shakeT = 0.6
  burst.fire(pos.x, Math.max(pos.y, 1), pos.z, 0x9fc4ff)
  state.crashes++
  ui.setCrashes(state.crashes, MAX_CRASHES)
  if (state.crashes >= MAX_CRASHES) {
    lose('torn')
    return
  }
  /* hard bounce: nose up, lifted clear, wet wings */
  state.wetT = WET_TIME
  state.crashCooldown = 2
  pitch = 0.5
  const floor = Math.max(heightAt(pos.x, pos.z) + 1.2, 0.9)
  pos.y = floor + 3
}

function passRing(i) {
  const r = RINGS[i]
  audio.chime(i)
  ui.flash('ring')
  burst.fire(r.x, r.y, r.z, 0x9fffd0)
  state.ringIdx++
  ui.setRing(state.ringIdx, TOTAL_RINGS)
  if (state.ringIdx >= TOTAL_RINGS) {
    win()
  } else {
    ringSys.setActive(state.ringIdx)
  }
}

function startGustTelegraph() {
  gust.phase = 'telegraph'
  gust.timer = 1.6
  gust.dir = (state.simT * 7919) % 2 > 1 ? 1 : -1
  gustStreak.show(pos.x, pos.y, pos.z, yaw, gust.dir)
  audio.whoosh()
}

/* ---------------- simulation ---------------- */
function sim(dt) {
  state.simT += dt

  /* --- moon timer --- */
  state.moonT -= dt
  world.setMoonProgress(state.moonT / MOON_TOTAL)
  ui.setMoon(state.moonT)
  if (state.moonT <= 0) {
    lose('moon')
    return
  }

  /* --- input: arrows take precedence over mouse --- */
  let steerX = 0
  let steerY = 0
  if (keys.ArrowLeft) steerX -= 1
  if (keys.ArrowRight) steerX += 1
  if (keys.ArrowUp) steerY -= 1
  if (keys.ArrowDown) steerY += 1
  if (steerX === 0 && steerY === 0 && mouseArmed) {
    steerX = Math.abs(mouseX) > 0.06 ? clamp(mouseX * 1.4, -1, 1) : 0
    steerY = Math.abs(mouseY) > 0.06 ? clamp(mouseY * 1.4, -1, 1) : 0
  }

  const wet = state.wetT > 0
  const turnMul = wet ? 0.7 : 1
  yaw += steerX * 1.15 * turnMul * dt
  pitch = clamp(pitch - steerY * 1.0 * turnMul * dt, -0.62, 0.62)
  /* gentle auto-level of pitch when no input */
  if (steerY === 0) pitch += (0 - pitch) * 0.5 * dt
  /* banking roll follows yaw input */
  roll += (steerX * -0.55 - roll) * 4 * dt

  /* --- speed: W boost (stamina, with hysteresis) / S brake --- */
  let target = SPEED_BASE
  if (keys.KeyS) target = SPEED_BRAKE
  else if (keys.KeyW && boostArmed && state.stamina > 0) {
    target = SPEED_BOOST
    state.stamina = Math.max(0, state.stamina - 0.22 * dt)
    if (state.stamina <= 0) boostArmed = false
  }
  /* regen whenever not actually boosting; re-arm at a quarter bar */
  if (target !== SPEED_BOOST) {
    state.stamina = Math.min(1, state.stamina + 0.09 * dt)
    if (state.stamina >= 0.25) boostArmed = true
  }
  if (wet) target *= 0.62
  state.speed += (target - state.speed) * 2.2 * dt
  ui.setStamina(state.stamina, !!keys.KeyW && !boostArmed)

  /* --- wet wings tick --- */
  if (state.wetT > 0) state.wetT = Math.max(0, state.wetT - dt)
  ui.setWet(state.wetT > 0)
  if (state.crashCooldown > 0) state.crashCooldown -= dt

  /* --- gusts: telegraph then a 2 s sideways shove; ramp with progress --- */
  if (state.ringIdx >= 2 && gust.phase === 'idle') {
    gust.timer -= dt
    if (gust.timer <= 0) startGustTelegraph()
  } else if (gust.phase === 'telegraph') {
    gust.timer -= dt
    if (gust.timer <= 0) {
      gust.phase = 'shove'
      gust.timer = 2
      gust.shove = 11 + state.ringIdx * 0.7
    }
  } else if (gust.phase === 'shove') {
    gust.timer -= dt
    if (gust.timer <= 0) {
      gust.phase = 'idle'
      gust.timer = Math.max(11, 22 - state.ringIdx * 0.9)
    }
  }

  /* --- integrate position --- */
  FWD.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  pos.addScaledVector(FWD, state.speed * dt)
  if (gust.phase === 'shove') {
    /* right vector = (cos yaw, 0, -sin yaw) */
    const fall = gust.timer / 2
    pos.x += Math.cos(yaw) * gust.dir * gust.shove * fall * dt
    pos.z += -Math.sin(yaw) * gust.dir * gust.shove * fall * dt
  }

  /* soft world bounds */
  pos.x = clamp(pos.x, -460, 460)
  pos.z = clamp(pos.z, -790, 790)
  pos.y = Math.min(pos.y, 130)

  /* --- terrain / water collision --- */
  const floor = Math.max(heightAt(pos.x, pos.z) + 1.2, 0.9)
  if (pos.y < floor) {
    if (state.crashCooldown <= 0 && clearT > 0.35) {
      doCrash()
      if (state.phase !== 'playing') return
    } else {
      pos.y = floor /* invulnerable skim until genuinely clear again */
      clearT = 0 /* re-arm only after 0.35 s back in clear air */
    }
  } else if (pos.y > floor + 0.5) {
    clearT += dt /* hugging within 0.5 m of the surface does not re-arm */
  }

  /* --- arch legs / lintels + ring-8 flank trees: analytic capsules --- */
  if (state.crashCooldown <= 0) {
    for (let i = 0; i < COLLIDERS.length; i++) {
      const c = COLLIDERS[i]
      const dx = c.bx - c.ax
      const dy = c.by - c.ay
      const dz = c.bz - c.az
      const tt = clamp(
        ((pos.x - c.ax) * dx + (pos.y - c.ay) * dy + (pos.z - c.az) * dz) / (dx * dx + dy * dy + dz * dz),
        0, 1
      )
      const qx = pos.x - (c.ax + dx * tt)
      const qy = pos.y - (c.ay + dy * tt)
      const qz = pos.z - (c.az + dz * tt)
      if (qx * qx + qy * qy + qz * qz < c.r * c.r) {
        doCrash()
        if (state.phase !== 'playing') return
        break
      }
    }
  }

  /* --- ring pass: generous 8 m sphere --- */
  if (state.ringIdx < TOTAL_RINGS) {
    const r = RINGS[state.ringIdx]
    TMP.set(r.x, r.y, r.z)
    if (pos.distanceToSquared(TMP) < RING_RADIUS * RING_RADIUS) passRing(state.ringIdx)
  }
}

/* ---------------- camera + render ---------------- */
function placeCamera() {
  brujo.group.position.copy(pos)
  brujo.group.rotation.order = 'YXZ'
  brujo.group.rotation.set(-pitch, yaw, roll)

  FWD.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  TMP.copy(pos).addScaledVector(FWD, -7.5)
  TMP.y += 2.4
  camera.position.copy(TMP)
  TMP.copy(pos).addScaledVector(FWD, 14)
  camera.lookAt(TMP)
  camera.rotateZ(roll * 0.45)
  if (state.shakeT > 0) {
    const s = state.shakeT * 0.5
    camera.position.x += (Math.random() - 0.5) * s
    camera.position.y += (Math.random() - 0.5) * s
    camera.rotateZ((Math.random() - 0.5) * s * 0.08)
  }
}

function render() {
  placeCamera()
  renderer.render(scene, camera)
}

/* ---------------- frame: pure, drives rAF AND manual steps ---------------- */
function frame(dt) {
  if (state.phase === 'playing') sim(dt)
  /* visuals run every frame — the world keeps breathing behind cards */
  visT += dt
  world.update(visT, dt)
  ringSys.update(visT)
  burst.update(dt)
  gustStreak.update(dt, yaw)
  brujo.update(visT, (state.speed - SPEED_BRAKE) / (SPEED_BOOST - SPEED_BRAKE))
  if (state.shakeT > 0) state.shakeT = Math.max(0, state.shakeT - dt)
  audio.update(
    dt,
    (state.speed - SPEED_BRAKE) / (SPEED_BOOST - SPEED_BRAKE),
    state.wetT > 0,
    state.moonT / MOON_TOTAL,
    state.phase === 'playing'
  )
  ui.update(dt)
}

let last = performance.now()
function raf(now) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  frame(dt)
  render()
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)

/* ---------------- boot ---------------- */
ui.setRing(0, TOTAL_RINGS)
ui.setCrashes(0, MAX_CRASHES)
ui.setMoon(MOON_TOTAL)
ui.showTitle(begin)

/* ---------------- TEST API ---------------- */
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
    render()
  },
  getState() {
    return {
      phase: state.phase,
      ring: state.ringIdx,
      rings: TOTAL_RINGS,
      moon: Math.round(state.moonT * 100) / 100,
      crashes: state.crashes,
      maxCrashes: MAX_CRASHES,
      stamina: Math.round(state.stamina * 1000) / 1000,
      wet: state.wetT > 0,
      speed: Math.round(state.speed * 100) / 100,
      pos: { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, z: Math.round(pos.z * 10) / 10 },
      muted: audio.state.muted,
    }
  },
  forceWin() {
    if (state.phase === 'title') begin()
    win()
  },
  forceLose(reason = 'torn') {
    if (state.phase === 'title') begin()
    lose(reason)
  },
  ringIndex() {
    return state.ringIdx
  },
  teleportToRing(n) {
    const i = clamp(n | 0, 0, TOTAL_RINGS - 1)
    const r = RINGS[i]
    state.ringIdx = i
    ringSys.setActive(i)
    ui.setRing(i, TOTAL_RINGS)
    pos.set(r.x - r.dirx * 40, r.y, r.z - r.dirz * 40)
    yaw = Math.atan2(r.dirx, r.dirz)
    pitch = 0
    roll = 0
    state.crashCooldown = 1
    render()
  },
  setCrashes(n) {
    state.crashes = clamp(n | 0, 0, MAX_CRASHES)
    ui.setCrashes(state.crashes, MAX_CRASHES)
    if (state.crashes >= MAX_CRASHES && state.phase === 'playing') lose('torn')
  },
  setMoon(s) {
    state.moonT = clamp(+s, 0, MOON_TOTAL)
    world.setMoonProgress(state.moonT / MOON_TOTAL)
    ui.setMoon(state.moonT)
  },
  setStamina(f) {
    state.stamina = clamp(+f, 0, 1)
    ui.setStamina(state.stamina)
  },
  triggerGust() {
    startGustTelegraph()
  },
}
