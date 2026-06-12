// LA VIUDA — El camino de la noche · Mitos de Chiloé
// Tension-driving / pacing management (canvas2d side view). Drive an ox-cart
// ~1 km down a coast road and reach the village before medianoche.
//
// MECHANICS
//   The cart auto-advances; you control the PACE with a three-position lever
//   (1/2/3 or ↑/↓ — detenido · al paso · al trote) and the LANTERN (limited
//   oil, ~150 s a full charge; the flame is your only light). R or click
//   refills at one of the 2 cruces shrines — only while detenido, and the
//   pour takes 4.5 s. The clock runs 23:00 → medianoche (340 s); arrive late
//   and you lose. Trote is fast but tires the ox (empty stamina = forced
//   detenido 10 s) and potholes — telegraphed by lantern glints — damage a
//   wheel when hit al trote; 2 damages = lose. LA VIUDA waits 4 times by the
//   roadside (the lantern gutters as you near her): pass her AL PASO, without
//   stopping and without switching pace inside her presence zone
//   [her x − 26, her x + 8]. Violate the rule and she boards the cart behind
//   you; the third boarding = lose ('llegaste con compañía'). Reach the
//   village lights before midnight with fewer than 3 boardings = the seña.
//   ON WIN ONLY: localStorage.setItem('chiloe-viuda-done', '1').
//   Sim pauses while any overlay is open; dt clamped at 0.05; the loop is a
//   pure frame(dt) driven by BOTH requestAnimationFrame and manual stepping.
//
// TEST API — window.__game
//   begin()                  same as clicking COMENZAR (unlocks audio, plays)
//   step(dt=1/60, steps=1)   advance the sim deterministically (frame(dt)×N)
//   getState()               { phase:'title'|'playing'|'won'|'lost', x,
//                              metersLeft, v, pace, oil, stamina, clockMin,
//                              boardings, passed, wheelDamage, exhausted,
//                              pouring, viuda:{active, dist, inZone}, muted }
//   forceWin() / forceLose() jump to the real end handlers (forceWin runs the
//                            same win() that sets chiloe-viuda-done)
//   setOil(v)                set lantern oil 0..1 (0 kills the flame)
//   setClock(min)            set minutes remaining until medianoche (0..60)
//   spawnViuda(dist=45)      put la Viuda at cart.x + dist (appears at once,
//                            real gutter + presence-zone rules apply)
//   pace(n)                  shift the lever through the real handler (0|1|2
//                            — switching inside a presence zone boards her)
//   boardings()              how many times she has boarded
//   wheelDamage(n?)          no arg: current damage. With n: set 0..2 (2 runs
//                            the real lose('rueda') handler)
//   advanceTo(metersLeft)    teleport so the village is metersLeft away
//                            (skips encounters/potholes left behind)
//   setStamina(v)            set ox stamina 0..1
//   pourNow()                same as pressing R at a cruz (needs detenido)
//   audioState()             { unlocked, muted, contextState }
import {
  ROAD_LEN,
  VILLAGE_X,
  PACE_SPEED,
  ACCEL,
  DECEL,
  NIGHT_S,
  OIL_S,
  POUR_S,
  CRUZ_RANGE,
  CRUCES,
  VIUDA_X,
  APPEAR_AHEAD,
  ZONE_BEFORE,
  ZONE_AFTER,
  STAMINA_S,
  REC_PASO,
  REC_STOP,
  EXHAUST_S,
  POTHOLES,
} from './level.js'
import { createAudio } from './audio.js'
import { createRender } from './render.js'
import { ui, HINTS, TOASTS } from './ui.js'

// ---------- state ----------
let phase = 'title' // 'title' | 'playing' | 'won' | 'lost'
let time = 0
let timeLeft = NIGHT_S
let damage = 0
let boardCount = 0
let passCount = 0
let loseCause = 'medianoche'

const cart = { x: 0, v: 0, lever: 0, gait: 0, rock: 0, wheelRot: 0, bump: 0 }
const ox = { stamina: 1, exhaustT: 0 }
const lamp = { oil: 1, flame: 1, gutter: 0, swing: 0, swingV: 0, pour: -1 }
const fx = { shakeT: 0, shakeAmp: 0, flashT: 0, flashColor: 0, dread: 0, pulse: 0 }
const cam = { x: 0 }
const counts = { board: 0 }
const toast = { text: '', t: 0 }
const pour = { active: false, t: 0, cruz: -1, glugT: 0 }

// la Viuda — 4 fixed apparitions + spare slots for spawnViuda()
// state: 'off' | 'armed' | 'visible' | 'boarded' | 'passed' | 'skipped'
const enc = []
for (let i = 0; i < 8; i++) enc.push({ x: 0, state: 'off', entered: false })
for (let i = 0; i < VIUDA_X.length; i++) {
  enc[i].x = VIUDA_X[i]
  enc[i].state = 'armed'
}

const cruces = []
for (let i = 0; i < CRUCES.length; i++) cruces.push({ x: CRUCES[i].x, used: false })

const holes = []
for (let i = 0; i < POTHOLES.length; i++) holes.push({ x: POTHOLES[i], hit: false, cued: false })

// particle pool — fixed, reused, zero allocation in the loop
const particles = []
for (let i = 0; i < 130; i++)
  particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, type: 0, size: 0.06, grav: 0 })
let particleCursor = 0

// timers
let hint = HINTS.start
let hintLockT = 0
let look = 0 // camera lookahead while she waits ahead
let clopPrev = 0
let creakT = 2.5
let dustT = 0.4
let emberT = 2
let breathT = 1.5
let presenceSpoken = false // the narrator's warning line plays once per night

// ---------- wiring ----------
const audio = createAudio()
const canvas = document.createElement('canvas')
document.getElementById('app').appendChild(canvas)
const render = createRender(canvas, { cam, cart, ox, lamp, fx, enc, cruces, holes, particles, counts })

// ---------- helpers ----------
function spawnParticle(type, x, y, vx, vy, life, size, grav) {
  const p = particles[particleCursor]
  particleCursor = (particleCursor + 1) % particles.length
  p.type = type
  p.x = x
  p.y = y
  p.vx = vx
  p.vy = vy
  p.life = life
  p.max = life
  p.size = size
  p.grav = grav
}

function showToast(text) {
  toast.text = text
  toast.t = 2.2
}
function shake(amp) {
  fx.shakeT = 1
  fx.shakeAmp = amp
}
function flash(color) {
  fx.flashT = 1
  fx.flashColor = color
}
function lockHint(h, s) {
  hint = h
  hintLockT = s
}

function win() {
  if (phase !== 'playing' && phase !== 'title') return
  phase = 'won'
  localStorage.setItem('chiloe-viuda-done', '1')
  audio.win()
  audio.voice('win') // "Atrás queda el camino, negro y largo..."
  ui.showWin()
}
function lose(cause) {
  if (phase !== 'playing' && phase !== 'title') return
  phase = 'lost'
  loseCause = cause
  if (cause === 'medianoche') audio.midnight()
  audio.lose()
  audio.voice('lose') // "La noche te guardó para sí..."
  ui.showLose(cause)
}

// the presence zone the cart is currently inside (slot index, or -1)
function zoneOf(x) {
  for (let i = 0; i < enc.length; i++) {
    const s = enc[i]
    if (s.state !== 'visible') continue
    if (x >= s.x - ZONE_BEFORE && x <= s.x + ZONE_AFTER) return i
  }
  return -1
}

function board(i) {
  const s = enc[i]
  if (s.state !== 'visible') return
  s.state = 'boarded'
  boardCount++
  counts.board = boardCount
  fx.pulse = 1
  audio.boardThud()
  showToast(TOASTS.board)
  shake(0.5)
  flash(2)
  if (boardCount >= 3) lose('compania')
}

function pass(i) {
  enc[i].state = 'passed'
  passCount++
  audio.passRelief()
  showToast(TOASTS.pass)
}

function setLever(n) {
  n = n < 0 ? 0 : n > 2 ? 2 : n | 0
  if (phase !== 'playing') return
  if (n === cart.lever) return
  if (ox.exhaustT > 0) {
    audio.snort() // the ox refuses — it cannot
    return
  }
  if (pour.active) cancelPour()
  const z = zoneOf(cart.x)
  cart.lever = n
  audio.lever(n)
  if (z >= 0) board(z) // switching pace inside her presence = she boards
}

function cancelPour() {
  if (!pour.active) return
  pour.active = false
  lamp.pour = -1
  audio.pourSet(false)
}

function tryPour() {
  if (phase !== 'playing' || pour.active) return
  let ci = -1
  for (let i = 0; i < cruces.length; i++) {
    if (!cruces[i].used && Math.abs(cart.x - cruces[i].x) <= CRUZ_RANGE) {
      ci = i
      break
    }
  }
  if (ci < 0) return
  if (cart.lever !== 0 || cart.v > 0.05) {
    lockHint(HINTS.cruz, 2.5) // remind the rule: stopped, then pour
    return
  }
  pour.active = true
  pour.t = 0
  pour.glugT = 0
  pour.cruz = ci
  lamp.pour = 0
  audio.pourSet(true)
}

function spawnViudaAt(x) {
  // recycle a finished slot, or take a spare
  let si = -1
  for (let i = 0; i < enc.length; i++) {
    const st = enc[i].state
    if (st === 'off' || st === 'passed' || st === 'boarded' || st === 'skipped') {
      si = i
      break
    }
  }
  if (si < 0) return
  const s = enc[si]
  s.x = x
  s.state = 'visible'
  s.entered = false
  if (!presenceSpoken) {
    presenceSpoken = true
    audio.voice('presence') // "No la mires más de lo justo..."
  }
  lockHint(HINTS.viuda, 4)
  // already inside the zone? the entry rules apply immediately
  if (cart.x >= s.x - ZONE_BEFORE && cart.x <= s.x + ZONE_AFTER) {
    s.entered = true
    if (cart.lever !== 1) board(si)
  }
}

// ---------- simulation ----------
function simulate(dt) {
  time += dt

  // timer decay
  if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dt * 2.4)
  if (fx.flashT > 0) fx.flashT = Math.max(0, fx.flashT - dt * 2.8)
  if (fx.pulse > 0) fx.pulse = Math.max(0, fx.pulse - dt * 0.18)
  if (toast.t > 0) toast.t -= dt
  if (hintLockT > 0) hintLockT -= dt
  if (cart.bump > 0) cart.bump = Math.max(0, cart.bump - dt * 4)

  // the clock
  timeLeft -= dt
  if (timeLeft <= 0) {
    timeLeft = 0
    lose('medianoche')
    return
  }

  // ox stamina + exhaustion
  if (ox.exhaustT > 0) {
    ox.exhaustT -= dt
    if (ox.exhaustT <= 0) {
      ox.exhaustT = 0
      ox.stamina = 0.4
    }
  } else if (cart.lever === 2 && cart.v > 0.5) {
    ox.stamina -= dt / STAMINA_S
    if (ox.stamina <= 0) {
      ox.stamina = 0
      ox.exhaustT = EXHAUST_S
      cart.lever = 0
      audio.exhausted()
      showToast(TOASTS.exhausted)
      const z = zoneOf(cart.x)
      if (z >= 0) board(z) // the ox quits inside her presence — she boards
    }
  } else if (cart.lever === 1) {
    ox.stamina = Math.min(1, ox.stamina + dt * REC_PASO)
  } else if (cart.lever === 0) {
    ox.stamina = Math.min(1, ox.stamina + dt * REC_STOP)
  }

  // speed eases toward the lever; an ox-cart takes a moment for everything
  const target = ox.exhaustT > 0 ? 0 : PACE_SPEED[cart.lever]
  if (cart.v < target) cart.v = Math.min(target, cart.v + ACCEL * dt)
  else if (cart.v > target) cart.v = Math.max(target, cart.v - DECEL * dt)
  cart.x += cart.v * dt
  cart.wheelRot += (cart.v * dt) / 0.58
  cart.gait += cart.v * dt * 0.55
  const spd01 = Math.min(1, cart.v / 5.6)
  cart.rock = Math.sin(cart.gait * Math.PI * 2) * 0.014 * spd01 + cart.bump * 0.025

  // lantern swing — a damped pendulum pushed by the road
  const swingAcc = -22 * lamp.swing - 2.4 * lamp.swingV + cart.rock * 38 + cart.bump * 2
  lamp.swingV += swingAcc * dt
  lamp.swing += lamp.swingV * dt

  // hoof clops, timed by the gait (two per stride)
  const stepNow = Math.floor(cart.gait * 2)
  if (stepNow !== clopPrev) {
    clopPrev = stepNow
    if (cart.v > 0.7) audio.clop(cart.lever === 2)
  }

  // cart-wood creaks while rolling
  if (cart.v > 0.4) {
    creakT -= dt * (cart.v / 2.7)
    if (creakT <= 0) {
      creakT = 2.2 + Math.random() * 1.8
      audio.creak()
    }
  }

  // oil + flame
  if (!pour.active && lamp.oil > 0) lamp.oil = Math.max(0, lamp.oil - dt / OIL_S)
  const flameT = lamp.oil > 0 ? 1 : 0
  lamp.flame += (flameT - lamp.flame) * Math.min(1, dt * (flameT > lamp.flame ? 2.5 : 0.8))

  // pour
  if (pour.active) {
    if (cart.v > 0.1) cancelPour()
    else {
      pour.t += dt
      lamp.pour = pour.t / POUR_S
      pour.glugT -= dt
      if (pour.glugT <= 0) {
        pour.glugT = 0.35 + Math.random() * 0.2
        audio.pourGlug()
        spawnParticle(1, cart.x + 1.7, 2.0, (Math.random() - 0.5) * 0.3, -0.4, 0.5, 0.04, 2)
      }
      if (pour.t >= POUR_S) {
        pour.active = false
        lamp.pour = -1
        lamp.oil = 1
        cruces[pour.cruz].used = true
        audio.pourSet(false)
        audio.refillDone()
        showToast(TOASTS.refill)
        flash(0)
      }
    }
  }

  // la Viuda — apparitions, the zone, the rule
  let gutterTarget = 0
  let presence = 0
  let lookTarget = 0
  for (let i = 0; i < enc.length; i++) {
    const s = enc[i]
    if (s.state === 'armed' && cart.x > s.x - APPEAR_AHEAD) {
      s.state = 'visible'
      s.entered = false
      if (!presenceSpoken) {
        presenceSpoken = true
        audio.voice('presence')
      }
      lockHint(HINTS.viuda, 4)
    }
    if (s.state !== 'visible') continue
    const d = s.x - cart.x
    // the lantern knows before you do
    if (d > -12 && d < APPEAR_AHEAD + 12) {
      const g = d > 0 ? 1 - (d - 6) / 42 : 1 + d / 12
      const gc = g < 0 ? 0 : g > 1 ? 1 : g
      if (gc > gutterTarget) gutterTarget = gc
    }
    // …and the eye follows the guttering light up the road, toward her
    if (d > 0 && d < 60) {
      const lk = Math.min(4.5, d - 5)
      if (lk > lookTarget) lookTarget = lk
    }
    const prox = 1 - Math.abs(d) / 45
    if (prox > presence) presence = prox
    // zone entry
    if (!s.entered && cart.x >= s.x - ZONE_BEFORE && cart.x <= s.x + ZONE_AFTER) {
      s.entered = true
      if (cart.lever !== 1) {
        board(i) // entered al trote (or rolled in stopped) — she boards
        continue
      }
    }
    // stalled inside the zone (decelerating into it, exhaustion, any stop)
    if (s.entered && cart.v < 0.05 && cart.x <= s.x + ZONE_AFTER) {
      board(i)
      continue
    }
    // passed her — the light swings back and she is gone
    if (s.entered && cart.x > s.x + ZONE_AFTER) pass(i)
  }
  lamp.gutter += (gutterTarget - lamp.gutter) * Math.min(1, dt * 2.2)
  if (presence < 0) presence = 0

  // potholes
  for (let i = 0; i < holes.length; i++) {
    const ho = holes[i]
    if (ho.hit) continue
    const d = ho.x - cart.x
    // audible glint as a hole first enters the light
    if (!ho.cued && d > 0 && d < 40 && lamp.flame > 0.3) {
      ho.cued = true
      audio.glint()
    }
    if (Math.abs(d) < 1.0 && cart.v > 0.5) {
      ho.hit = true
      if (cart.lever === 2 && cart.v > 3.5) {
        damage++
        cart.bump = 1
        shake(0.8)
        flash(1)
        audio.pothole(true)
        showToast(TOASTS.wheel)
        for (let k = 0; k < 6; k++)
          spawnParticle(3, cart.x, 0.4, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, 0.5 + Math.random() * 0.3, 0.05, 9)
        if (damage >= 2) lose('rueda')
      } else {
        cart.bump = 0.5
        shake(0.25)
        audio.pothole(false)
        showToast(TOASTS.jolt)
      }
    }
  }

  // the village
  if (phase === 'playing' && cart.x >= VILLAGE_X) {
    win()
    return
  }

  // particles
  if (cart.v > 0.7) {
    dustT -= dt * cart.v
    if (dustT <= 0) {
      dustT = 1.6
      spawnParticle(0, cart.x + 2.6 + Math.random() * 0.8, 0.06, -0.5 - Math.random(), 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.05 + Math.random() * 0.05, 1.2)
    }
  }
  emberT -= dt
  if (emberT <= 0) {
    emberT = 1.8 + Math.random() * 2.6
    if (lamp.flame > 0.3)
      spawnParticle(1, cart.x + 1.7, 1.95, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, 0.6, 0.04, 1.5)
  }
  if (cart.v < 0.5) {
    breathT -= dt * (ox.exhaustT > 0 ? 2.4 : 1)
    if (breathT <= 0) {
      breathT = 2.2 + Math.random() * 1.6
      spawnParticle(2, cart.x + 4.1, 0.95, 0.5 + Math.random() * 0.3, 0.1, 0.9 + Math.random() * 0.4, 0.07, -0.3)
    }
  }
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    if (p.life <= 0) continue
    p.life -= dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy -= p.grav * dt
  }

  // dread eases toward how much company you carry
  fx.dread += (boardCount / 3 - fx.dread) * Math.min(1, dt * 1.2)

  // camera — gentle; drifts up the road while she waits in the dark ahead
  look += (lookTarget - look) * Math.min(1, dt * 1.4)
  cam.x += (cart.x + look - cam.x) * Math.min(1, dt * 3)

  // contextual hint
  const z = zoneOf(cart.x)
  if (hintLockT > 0) {
    // keep the locked hint
  } else if (ox.exhaustT > 0) hint = HINTS.exhausted
  else if (pour.active) hint = HINTS.pouring
  else if (z >= 0) hint = HINTS.inZone
  else if (lamp.oil <= 0) hint = HINTS.dark
  else if (nearUnusedCruz()) hint = HINTS.cruz
  else if (lamp.oil < 0.25) hint = HINTS.oilLow
  else if (ox.stamina < 0.28 && cart.lever === 2) hint = HINTS.staminaLow
  else if (VILLAGE_X - cart.x < 90) hint = HINTS.village
  else if (time < 12) hint = HINTS.start
  else hint = null

  audio.update(dt, spd01, lamp.gutter * lamp.flame, presence, boardCount / 3, fx.pulse)
}

function nearUnusedCruz() {
  for (let i = 0; i < cruces.length; i++)
    if (!cruces[i].used && Math.abs(cart.x - cruces[i].x) < 16) return true
  return false
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  const c = e.code
  if (c === 'Digit1' || c === 'Numpad1') setLever(0)
  else if (c === 'Digit2' || c === 'Numpad2') setLever(1)
  else if (c === 'Digit3' || c === 'Numpad3') setLever(2)
  else if (c === 'ArrowUp' || c === 'KeyW') {
    setLever(cart.lever + 1)
    e.preventDefault()
  } else if (c === 'ArrowDown' || c === 'KeyS') {
    setLever(cart.lever - 1)
    e.preventDefault()
  } else if (c === 'KeyR') tryPour()
  else if (c === 'KeyM') audio.setMuted(!audio.isMuted())
})
canvas.addEventListener('pointerdown', () => {
  if (phase === 'playing') tryPour()
})

// ---------- pure frame ----------
function frame(dt) {
  if (dt > 0.05) dt = 0.05
  if (dt < 0) dt = 0
  if (phase === 'playing') simulate(dt)
  render.draw(time)
  const toastOp = toast.t > 0 ? Math.min(1, toast.t / 0.6) : 0
  const minLeft = Math.max(0, Math.ceil(timeLeft / (NIGHT_S / 60)))
  ui.setHUD(
    minLeft,
    Math.round(lamp.oil * 50),
    Math.round(ox.stamina * 50),
    damage,
    boardCount,
    cart.lever,
    ox.exhaustT > 0,
    hint,
    toast.text,
    toastOp,
    audio.isMuted()
  )
}

let lastT = 0
function raf(t) {
  const dt = lastT === 0 ? 1 / 60 : (t - lastT) / 1000
  lastT = t
  frame(dt)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)

// ---------- begin ----------
function begin() {
  if (phase !== 'title') return
  ui.closeOverlay() // no-op when begun via the COMENZAR click (already closing)
  audio.unlock()
  speakIntro() // no-op if the title narration already started
  ui.buildHUD()
  phase = 'playing'
}

ui.showTitle(begin)

// ---------- title narration ----------
// The 'begin' line ("El camino va solo a la aldea...") belongs over the title
// card, not behind COMENZAR. Autoplay policies usually keep a no-gesture
// AudioContext 'suspended', so this is best-effort: try at load; if blocked,
// the first pointer/key/touch starts it — before COMENZAR. COMENZAR never
// restarts a line already out, and still speaks it the old way if nothing
// managed to start it earlier. Silent no-op without WebAudio or the clip.
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
  if (audio.state().contextState === 'running') speakIntro()
} catch (e) { /* silent — the gesture taps below cover it */ }
if (!introSpoken) {
  window.addEventListener('pointerdown', introTap, true)
  window.addEventListener('keydown', introTap, true)
  window.addEventListener('touchstart', introTap, true)
}

// ---------- TEST API ----------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
  },
  getState() {
    // nearest active apparition
    let vd = Infinity
    let active = false
    for (let i = 0; i < enc.length; i++) {
      if (enc[i].state !== 'visible') continue
      active = true
      const d = enc[i].x - cart.x
      if (Math.abs(d) < Math.abs(vd)) vd = d
    }
    return {
      phase,
      x: cart.x,
      metersLeft: Math.max(0, VILLAGE_X - cart.x),
      v: cart.v,
      pace: cart.lever,
      oil: lamp.oil,
      stamina: ox.stamina,
      clockMin: timeLeft / (NIGHT_S / 60),
      boardings: boardCount,
      passed: passCount,
      wheelDamage: damage,
      exhausted: ox.exhaustT > 0,
      pouring: pour.active,
      viuda: { active, dist: active ? vd : -1, inZone: zoneOf(cart.x) >= 0 },
      muted: audio.isMuted(),
    }
  },
  forceWin: () => win(),
  forceLose: () => lose('medianoche'),
  setOil(v) {
    lamp.oil = v < 0 ? 0 : v > 1 ? 1 : v
  },
  setClock(min) {
    const m = min < 0 ? 0 : min > 60 ? 60 : min
    timeLeft = m * (NIGHT_S / 60)
  },
  spawnViuda(dist = 45) {
    spawnViudaAt(cart.x + dist)
  },
  pace(n) {
    setLever(n)
  },
  boardings: () => boardCount,
  wheelDamage(n) {
    if (n === undefined) return damage
    damage = n < 0 ? 0 : n > 2 ? 2 : n | 0
    if (damage >= 2) lose('rueda')
    return damage
  },
  advanceTo(metersLeft) {
    const x = Math.max(0, VILLAGE_X - metersLeft)
    cart.x = x
    cam.x = x
    cart.v = 0
    // whatever was left behind no longer happens
    for (let i = 0; i < enc.length; i++) {
      const s = enc[i]
      if ((s.state === 'armed' || s.state === 'visible') && s.x + ZONE_AFTER < x) s.state = 'skipped'
    }
    for (let i = 0; i < holes.length; i++) if (holes[i].x < x - 1) holes[i].hit = true
  },
  setStamina(v) {
    ox.stamina = v < 0 ? 0 : v > 1 ? 1 : v
  },
  pourNow: () => tryPour(),
  audioState: () => audio.state(),
}
