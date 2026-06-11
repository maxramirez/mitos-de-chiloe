// LA FIURA — El pantanal · Mitos de Chiloé
// 2D side-scrolling platformer (canvas2d). Cross a ~220 m night swamp,
// collect the 5 hierbas del machi on side branches, slip past la Fiura's
// three ambush perches between her charm pulses, and reach the machi's hut.
//
// MECHANICS
//   A/D or ←/→ move · SPACE/W/↑ jump (variable height — release to cut) ·
//   M mute. Coyote time 0.1 s, jump buffering 0.12 s. Tussocks bounce
//   (hold jump to bounce higher). Sinking logs telegraph with bubbles, then
//   go under while stood on. Falling in the black water = lose a luz +
//   respawn at the last checkpoint lantern (3 lanterns). La Fiura inhales
//   (red glow, ~1 s) then emits an expanding charm ring every 2.4 s; being
//   inside the ring as it passes = charmed = lose a luz + knockback.
//   3 luces total; 0 = lost ('el pantanal te quedó'). Reach the hut with all
//   5 hierbas = win; arrive short and the door stays dark + a hint points back.
//   ON WIN ONLY: localStorage.setItem('chiloe-fiura-done', '1').
//   Sim pauses while any overlay is open; dt clamped at 0.05; the loop is a
//   pure frame(dt) driven by BOTH requestAnimationFrame and manual stepping.
//
// TEST API — window.__game
//   begin()                  same as clicking BEGIN (unlocks audio, starts play)
//   step(dt=1/60, steps=1)   advance the sim deterministically (frame(dt) × N)
//   getState()               { phase:'title'|'playing'|'won'|'lost', luces,
//                              herbs, herbTotal, x, y, vx, vy, grounded,
//                              checkpoint, nearestAmbush:{i, dist, inhale,
//                              ringR}, hutOpen, muted }
//   forceWin() / forceLose() jump to the real end handlers (forceWin runs the
//                            same win() that sets localStorage chiloe-fiura-done)
//   setPos(x)                teleport the player to world x, snapped onto the
//                            highest platform under x (vx=vy=0, brief invuln)
//   luces() / herbs()        current luces count / herbs collected
//   setLuces(n)              set luces 0..3 (0 does not lose by itself; the
//                            next charm/drowning event will)
//   grantHerbs(n=1)          collect the next n un-taken herbs via the real
//                            pickup handler (5 total opens the hut door)
//   teleportToAmbush(i)      setPos 8 m before ambush i (0|1|2)
//   pulseNow(i)              make ambush i emit a charm ring immediately and
//                            restart its 2.4 s cycle (works at any distance)
//   audioState()             { unlocked, muted, contextState }
import {
  PLATFORMS,
  HERBS,
  HERB_TOTAL,
  CHECKPOINTS,
  AMBUSHES,
  PULSE_PERIOD,
  PULSE_TELEGRAPH,
  PULSE_SPEED,
  PULSE_MAX_R,
  PULSE_BAND,
  AMBUSH_RANGE,
  WATER_Y,
  DROWN_Y,
  HUT_X,
  HUT_RADIUS,
  SPAWN,
} from './level.js'
import { createAudio } from './audio.js'
import { createRender } from './render.js'
import { ui, HINTS, TOASTS } from './ui.js'

// ---------- physics constants ----------
const MOVE_MAX = 6.3
const ACC = 42
const DEC = 55
const AIR_ACC = 26
const AIR_DEC = 10
const GRAV = 28
const JUMP_V = 9.3
const JUMP_CUT = 3.2
const TERMINAL = -16
const COYOTE = 0.1
const BUFFER = 0.12
const BOUNCE_V = 9.2
const BOUNCE_V_HELD = 12.2
const HALF_W = 0.3

// ---------- state ----------
let phase = 'title' // 'title' | 'playing' | 'won' | 'lost'
let time = 0
let luces = 3
let herbsCount = 0
let checkpointIdx = 0

const player = {
  x: SPAWN.x,
  y: SPAWN.y,
  vx: 0,
  vy: 0,
  face: 1,
  grounded: true,
  groundIdx: 0,
  walkPhase: 0,
  landT: 0,
  stunT: 0,
  invulnT: 0,
}

const cam = { x: SPAWN.x, y: 0.6 }
const fx = { shakeT: 0, shakeAmp: 0, flashT: 0, flashColor: 0, hutOpen: 0 }
const toast = { text: '', t: 0 }

// live platform state (sink offset / tussock squash)
const plats = []
for (let i = 0; i < PLATFORMS.length; i++) plats.push({ off: 0, stand: 0, bounceT: 0, bubbleT: 0 })

const herbs = []
for (let i = 0; i < HERBS.length; i++) herbs.push({ x: HERBS[i].x, y: HERBS[i].y, taken: false })

const cps = []
for (let i = 0; i < CHECKPOINTS.length; i++) cps.push({ lit: i === 0 })

const fiuras = []
for (let i = 0; i < AMBUSHES.length; i++)
  fiuras.push({ timer: AMBUSHES[i].phase % PULSE_PERIOD, inhale: 0, active: false })

// ring pool — at most one live ring per ambush (life 0.94 s < period 2.4 s),
// pool 2 per ambush for safety
const rings = []
for (let i = 0; i < AMBUSHES.length * 2; i++)
  rings.push({ x: 0, y: 0, r: 0, on: false, hit: false, amb: -1 })

// particle pool — fixed, reused, zero allocation in the loop
const particles = []
for (let i = 0; i < 160; i++)
  particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, type: 0, size: 0.06, grav: 0 })
let particleCursor = 0

// timers
let coyoteT = 0
let bufferT = 0
let stepT = 0
let hint = HINTS.start
let hintLockT = 0

// ---------- wiring ----------
const audio = createAudio()
const canvas = document.createElement('canvas')
document.getElementById('app').appendChild(canvas)
const render = createRender(canvas, { cam, fx, player, plats, herbs, cps, fiuras, rings, particles })

// ---------- input ----------
const keys = { left: false, right: false, jump: false }
window.addEventListener('keydown', (e) => {
  const c = e.code
  if (c === 'ArrowLeft' || c === 'KeyA') keys.left = true
  else if (c === 'ArrowRight' || c === 'KeyD') keys.right = true
  else if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') {
    if (!e.repeat && !keys.jump) bufferT = BUFFER
    keys.jump = true
    e.preventDefault()
  } else if (c === 'KeyM') audio.setMuted(!audio.isMuted())
  if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowDown') e.preventDefault()
})
window.addEventListener('keyup', (e) => {
  const c = e.code
  if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false
  else if (c === 'ArrowRight' || c === 'KeyD') keys.right = false
  else if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') {
    keys.jump = false
    if (player.vy > JUMP_CUT) player.vy = JUMP_CUT // variable jump height
  }
})

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

function burstDust(x, y, n) {
  for (let i = 0; i < n; i++)
    spawnParticle(0, x + (Math.random() - 0.5) * 0.5, y + 0.05, (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.2, 0.35 + Math.random() * 0.25, 0.05, 6)
}
function burstSplash(x) {
  for (let i = 0; i < 12; i++)
    spawnParticle(2, x + (Math.random() - 0.5) * 0.7, WATER_Y + 0.05, (Math.random() - 0.5) * 3.2, 2 + Math.random() * 3.5, 0.5 + Math.random() * 0.3, 0.06, 14)
  spawnParticle(3, x, WATER_Y, 0, 0, 0.6, 0.4, 0)
}
function burstHerb(x, y) {
  for (let i = 0; i < 10; i++)
    spawnParticle(4, x, y, (Math.random() - 0.5) * 2.4, Math.random() * 2.4, 0.5 + Math.random() * 0.4, 0.04, 2)
}
function burstCharm(x, y) {
  for (let i = 0; i < 12; i++)
    spawnParticle(5, x, y + 0.6, (Math.random() - 0.5) * 4, Math.random() * 3 - 0.5, 0.4 + Math.random() * 0.3, 0.04, 4)
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

function platTop(i) {
  return PLATFORMS[i].y + plats[i].off
}

// highest platform under world x (for setPos / respawn snapping) — returns
// the platform index, or -1 over open water
function groundIdxAt(x) {
  let best = -999
  let idx = -1
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i]
    if (x >= p.x && x <= p.x + p.w) {
      const t = platTop(i)
      if (t > best) {
        best = t
        idx = i
      }
    }
  }
  return idx
}

function placeAt(x) {
  player.x = x
  const gi = groundIdxAt(x)
  player.groundIdx = gi
  player.grounded = gi >= 0
  player.y = gi >= 0 ? platTop(gi) : 2
  player.vx = 0
  player.vy = 0
  cam.x = x
}

function respawn() {
  placeAt(CHECKPOINTS[checkpointIdx].x)
  player.invulnT = 1.5
  player.stunT = 0
}

function win() {
  if (phase !== 'playing' && phase !== 'title') return
  phase = 'won'
  localStorage.setItem('chiloe-fiura-done', '1')
  audio.win()
  ui.showWin()
}
function lose() {
  if (phase !== 'playing' && phase !== 'title') return
  phase = 'lost'
  audio.lose()
  ui.showLose()
}

function loseLuzWater() {
  burstSplash(player.x)
  audio.splash()
  flash(2)
  shake(0.5)
  luces--
  showToast(TOASTS.water)
  if (luces <= 0) lose()
  else respawn()
}

function charm(ai, ox) {
  if (player.invulnT > 0) return
  luces--
  showToast(TOASTS.charm)
  burstCharm(player.x, player.y)
  audio.charm()
  flash(1)
  shake(0.9)
  const dir = player.x < ox ? -1 : 1
  player.vx = dir * 7.5
  player.vy = 5.2
  player.grounded = false
  player.stunT = 0.3
  player.invulnT = 1.3
  if (luces <= 0) lose()
}

function collectHerb(i) {
  const h = herbs[i]
  if (h.taken) return
  h.taken = true
  herbsCount++
  burstHerb(h.x, h.y)
  audio.herb()
  flash(2)
}

function spawnRing(ai) {
  const a = AMBUSHES[ai]
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i]
    if (r.on) continue
    r.on = true
    r.hit = false
    r.amb = ai
    r.x = a.x
    r.y = a.y + a.seat + 0.4
    r.r = 0.2
    return
  }
}

// ---------- simulation ----------
function simulate(dt) {
  time += dt

  // timer decay
  if (player.landT > 0) player.landT = Math.max(0, player.landT - dt * 5)
  if (player.stunT > 0) player.stunT -= dt
  if (player.invulnT > 0) player.invulnT -= dt
  if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dt * 2.4)
  if (fx.flashT > 0) fx.flashT = Math.max(0, fx.flashT - dt * 2.8)
  if (toast.t > 0) toast.t -= dt
  if (hintLockT > 0) hintLockT -= dt
  if (coyoteT > 0) coyoteT -= dt
  if (bufferT > 0) bufferT -= dt

  // --- la Fiura's pulse rhythm ---
  let inhaleMax = 0
  let inhaleProx = 0
  for (let i = 0; i < fiuras.length; i++) {
    const f = fiuras[i]
    const a = AMBUSHES[i]
    const dist = Math.abs(player.x - a.x)
    f.active = dist < AMBUSH_RANGE
    f.timer += dt
    if (f.timer >= PULSE_PERIOD) {
      f.timer -= PULSE_PERIOD
      if (f.active) {
        spawnRing(i)
        if (dist < 14) audio.pulse()
      }
    }
    const tele = f.timer - (PULSE_PERIOD - PULSE_TELEGRAPH)
    f.inhale = f.active && tele > 0 ? tele / PULSE_TELEGRAPH : 0
    if (f.inhale > inhaleMax && dist < 16) {
      inhaleMax = f.inhale
      inhaleProx = 1 - dist / 16
    }
  }

  // --- rings ---
  const pcx = player.x
  const pcy = player.y + 0.6
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i]
    if (!r.on) continue
    r.r += PULSE_SPEED * dt
    if (r.r >= PULSE_MAX_R) {
      r.on = false
      continue
    }
    if (!r.hit && phase === 'playing') {
      const dx = pcx - r.x
      const dy = pcy - r.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (Math.abs(d - r.r) < PULSE_BAND) {
        r.hit = true
        charm(r.amb, r.x)
      }
    }
  }

  // --- player physics ---
  const canControl = player.stunT <= 0
  const axis = canControl ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0
  if (axis !== 0) player.face = axis
  const acc = player.grounded ? ACC : AIR_ACC
  const dec = player.grounded ? DEC : AIR_DEC
  const target = axis * MOVE_MAX
  if (axis !== 0) {
    if (player.vx < target) player.vx = Math.min(target, player.vx + acc * dt)
    else if (player.vx > target) player.vx = Math.max(target, player.vx - acc * dt)
  } else {
    if (player.vx > 0) player.vx = Math.max(0, player.vx - dec * dt)
    else if (player.vx < 0) player.vx = Math.min(0, player.vx + dec * dt)
  }

  // jump (coyote + buffer)
  if (bufferT > 0 && canControl && (player.grounded || coyoteT > 0)) {
    bufferT = 0
    coyoteT = 0
    player.grounded = false
    player.groundIdx = -1
    player.vy = JUMP_V
    audio.jump()
    burstDust(player.x, player.y, 3)
  }

  if (!player.grounded) {
    player.vy -= GRAV * dt
    if (player.vy < TERMINAL) player.vy = TERMINAL
  }

  // horizontal move + ground-island side collision
  const prevY = player.y
  player.x += player.vx * dt
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i]
    if (p.t !== 'ground') continue
    const top = platTop(i)
    if (player.y < top - 0.02 && player.y + 1.2 > top - 3) {
      if (player.x + HALF_W > p.x && player.x - HALF_W < p.x + p.w) {
        if (player.x < p.x + p.w / 2) player.x = p.x - HALF_W
        else player.x = p.x + p.w + HALF_W
        player.vx = 0
      }
    }
  }

  // vertical move + one-way landing
  if (!player.grounded) {
    player.y += player.vy * dt
    if (player.vy <= 0) {
      let landIdx = -1
      let landTop = -999
      for (let i = 0; i < PLATFORMS.length; i++) {
        const p = PLATFORMS[i]
        const top = platTop(i)
        if (prevY >= top - 0.001 && player.y <= top && player.x > p.x - 0.15 && player.x < p.x + p.w + 0.15) {
          if (top > landTop) {
            landTop = top
            landIdx = i
          }
        }
      }
      if (landIdx >= 0) {
        const p = PLATFORMS[landIdx]
        if (p.t === 'tussock') {
          // bouncy tussock — hold jump to bounce higher
          player.y = landTop
          player.vy = keys.jump || bufferT > 0 ? BOUNCE_V_HELD : BOUNCE_V
          bufferT = 0
          plats[landIdx].bounceT = 1
          audio.bounce()
          burstDust(player.x, landTop, 4)
        } else {
          const hard = player.vy < -9
          player.y = landTop
          player.vy = 0
          player.grounded = true
          player.groundIdx = landIdx
          player.landT = 1
          audio.land(hard)
          burstDust(player.x, landTop, hard ? 7 : 4)
          spawnParticle(3, player.x, landTop, 0, 0, 0.5, 0.3, 0)
        }
      }
    }
  } else {
    // grounded — follow the platform (sinking logs carry you down)
    const gi = player.groundIdx
    if (gi < 0) {
      // no known support (shouldn't happen) — hand back to gravity
      player.grounded = false
      coyoteT = COYOTE
    } else {
      const p = PLATFORMS[gi]
      if (player.x < p.x - 0.12 || player.x > p.x + p.w + 0.12) {
        player.grounded = false
        player.groundIdx = -1
        coyoteT = COYOTE
      } else {
        player.y = platTop(gi)
      }
    }
  }

  // tussock squash recovery + sinking logs
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i]
    const live = plats[i]
    if (live.bounceT > 0) live.bounceT = Math.max(0, live.bounceT - dt * 4)
    if (p.t !== 'sink') continue
    const stood = player.grounded && player.groundIdx === i
    if (stood) {
      live.stand += dt
      live.bubbleT -= dt
      if (live.bubbleT <= 0) {
        // bubbles telegraph the sink before and during
        live.bubbleT = live.stand > 0.5 ? 0.07 : 0.14
        spawnParticle(1, p.x + Math.random() * p.w, platTop(i) - 0.1, 0, 0.7 + Math.random() * 0.5, 0.5, 0.04 + Math.random() * 0.05, -1)
      }
      if (live.stand > 0.5) {
        live.off = Math.max(-2.2, live.off - 0.6 * dt)
      }
    } else {
      live.stand = Math.max(0, live.stand - dt * 2)
      if (live.off < 0) live.off = Math.min(0, live.off + 0.8 * dt)
    }
  }

  // footsteps — squelch + ripples on the wet ground
  if (player.grounded && Math.abs(player.vx) > 1) {
    player.walkPhase += dt * Math.abs(player.vx) * 2.0
    stepT -= dt * Math.abs(player.vx)
    if (stepT <= 0) {
      stepT = 2.1
      audio.step(true)
      spawnParticle(3, player.x, player.y, 0, 0, 0.45, 0.3, 0)
    }
  } else if (player.grounded) {
    player.walkPhase = 0
  }

  // herbs
  for (let i = 0; i < herbs.length; i++) {
    const h = herbs[i]
    if (h.taken) continue
    const dx = h.x - pcx
    const dy = h.y - pcy
    if (dx * dx + dy * dy < 0.7 * 0.7) collectHerb(i)
  }
  fx.hutOpen += ((herbsCount >= HERB_TOTAL ? 1 : 0) - fx.hutOpen) * Math.min(1, dt * 3)

  // checkpoints
  for (let i = checkpointIdx + 1; i < CHECKPOINTS.length; i++) {
    if (player.grounded && Math.abs(player.x - CHECKPOINTS[i].x) < 1.2) {
      checkpointIdx = i
      cps[i].lit = true
      audio.checkpoint()
      showToast(TOASTS.checkpoint)
    }
  }

  // black water
  if (player.y < DROWN_Y) loseLuzWater()

  // the machi's hut
  if (phase === 'playing' && player.grounded && Math.abs(player.x - HUT_X) < HUT_RADIUS) {
    if (herbsCount >= HERB_TOTAL) win()
    else hintLockT = 2.5
  }

  // particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    if (p.life <= 0) continue
    p.life -= dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy -= p.grav * dt
  }

  // camera — leads in facing direction, gentle smoothing
  const lead = player.face * 2.2
  cam.x += (player.x + lead - cam.x) * Math.min(1, dt * 3.2)
  const cyT = Math.max(0, Math.min(2.6, player.y * 0.5)) + 0.6
  cam.y += (cyT - cam.y) * Math.min(1, dt * 2.4)

  // contextual hint
  if (hintLockT > 0) hint = HINTS.locked[herbsCount]
  else if (inhaleMax > 0 && inhaleProx > 0.35) hint = HINTS.inhale
  else if (player.grounded && player.groundIdx >= 0 && PLATFORMS[player.groundIdx].t === 'sink' && plats[player.groundIdx].stand > 0.3) hint = HINTS.sink
  else if (herbsCount >= HERB_TOTAL) hint = HINTS.allHerbs
  else if (time < 14) hint = HINTS.start
  else hint = null

  audio.update(dt, Math.abs(player.vx) / MOVE_MAX, inhaleMax, inhaleProx)
}

// ---------- pure frame ----------
function frame(dt) {
  if (dt > 0.05) dt = 0.05
  if (dt < 0) dt = 0
  if (phase === 'playing') simulate(dt)
  render.draw(time)
  const toastOp = toast.t > 0 ? Math.min(1, toast.t / 0.6) : 0
  ui.setHUD(luces, herbsCount, hint, toast.text, toastOp, audio.isMuted())
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
  ui.closeOverlay() // no-op when begun via the BEGIN click (already closing)
  audio.unlock()
  ui.buildHUD()
  phase = 'playing'
}

ui.showTitle(begin)

// ---------- TEST API ----------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(dt)
  },
  getState() {
    let ni = 0
    let nd = Infinity
    for (let i = 0; i < AMBUSHES.length; i++) {
      const d = Math.abs(player.x - AMBUSHES[i].x)
      if (d < nd) {
        nd = d
        ni = i
      }
    }
    let ringR = -1
    for (let i = 0; i < rings.length; i++)
      if (rings[i].on && rings[i].amb === ni && rings[i].r > ringR) ringR = rings[i].r
    return {
      phase,
      luces,
      herbs: herbsCount,
      herbTotal: HERB_TOTAL,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      grounded: player.grounded,
      checkpoint: checkpointIdx,
      nearestAmbush: { i: ni, dist: nd, inhale: fiuras[ni].inhale, ringR },
      hutOpen: fx.hutOpen,
      muted: audio.isMuted(),
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  setPos(x) {
    placeAt(x)
    player.invulnT = 0.5
  },
  luces: () => luces,
  herbs: () => herbsCount,
  setLuces(n) {
    luces = Math.max(0, Math.min(3, n | 0))
  },
  grantHerbs(n = 1) {
    for (let i = 0; i < herbs.length && n > 0; i++) {
      if (!herbs[i].taken) {
        collectHerb(i)
        n--
      }
    }
  },
  teleportToAmbush(i) {
    const a = AMBUSHES[Math.max(0, Math.min(2, i | 0))]
    window.__game.setPos(a.x - 8)
  },
  pulseNow(i) {
    const ai = Math.max(0, Math.min(2, i | 0))
    fiuras[ai].timer = 0
    spawnRing(ai)
  },
  audioState: () => audio.state(),
}
