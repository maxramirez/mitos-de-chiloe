// ============================================================================
// EL CUCHIVILU — El corral roto · Mitos de Chiloé
// ----------------------------------------------------------------------------
// Top-down 2D-canvas arcade on the moonlit tidal flats of Quetalco. WASD (or
// arrows) rows the chalupa — slidey boat physics with a gentle drift. Schools
// of silver fish (8–12, flocking) ride in with each tide pulse and FLEE the
// boat: herd them through the corral mouth while la marea runs high (the
// stake line across the mouth submerges; at marea baja the mouth seals and
// whatever is penned stays penned). El Cuchivilu — pig-snouted, snake-bodied —
// surfaces on an accelerating clock (mud-bubble + snout-wake telegraph, and
// the threatened wall segment smoulders), charges that wall segment, breaks
// it, then eats penned fish through the gap (1 per 2 s) until RAMMED by the
// boat at speed (> 150 u/s — he dives squealing, the boat recoils). Repair a
// gap: hold E adjacent for 2.5 s per segment (progress decays if you let go;
// you cannot repair the gap he is in). His surfacing rate accelerates as the
// night wears on. One night = 180 s.
// WIN  — 25+ fish penned at the dawn tally. ONLY then:
//        localStorage.setItem('chiloe-cuchivilu-done', '1')
// LOSE — the corral falls below 5 standing segments ('corral'), or fewer
//        than 25 penned at dawn ('alba') — la familia pasa hambre.
//
// TEST API — window.__game. frame(dt) is a pure step driven BOTH by
// requestAnimationFrame and by manual stepping (rAF throttling in hidden tabs
// does not stall tests). dt is clamped at 0.05. The sim is fully paused
// whenever any overlay is open (phase !== 'playing').
//   begin()                — same as clicking BEGIN (closes title, unlocks audio)
//   step(dt=1/60, steps=1) — advance sim + render deterministically
//   getState()             — { phase:'title'|'playing'|'won'|'lost', timer,
//                              penned, goal, fishAlive, standing,
//                              segments:[12 booleans, true = standing], tide,
//                              mouthOpen, serpent:{ state:'down'|'telegraph'|
//                              'charge'|'feed'|'dive', target, x, y, nextIn },
//                              boat:{x,y,speed}, repair:{near,k}, muted }
//   forceWin()             — real win handler (overlay + localStorage flag)
//   forceLose(reason?)     — real lose handler: 'alba' (dawn tally, default)
//                            or 'corral' (corral destroyed)
//   setFish(n)             — make the penned count exactly n (spawns fish into
//                            / removes fish from the pen); the win is still
//                            checked at the dawn tally (setTime(0) + step)
//   penned()               — recount and return the penned-fish total
//   setTime(s)             — set remaining night seconds (0 ⇒ dawn check on
//                            the next playing frame)
//   surfaceNow(segment?)   — El Cuchivilu telegraphs immediately, targeting
//                            wall segment 0..11 (default: a random standing
//                            segment); works from any serpent state
//   breakSegment(i)        — break wall segment i via the real handler
//                            (debris, shake, crunch, lose check next frame)
//   repairSegment(i)       — instantly restore wall segment i
//   setBoat(x, y)          — teleport the boat (world is 1000×1000), vel = 0
//   setKeys({w,a,s,d,e})   — hold/release virtual inputs for manual stepping
//   ramNow()               — run the real ram handler if he is surfaced
//                            (charge/feed); returns true if it connected
//   audioState()           — { unlocked, muted, contextState }
// ============================================================================
import { TAU, WORLD, CX, CY, R, SEGN, A0, SEG_W, TELE_T, segAt, clamp } from './geom.js'
import { createAudio } from './audio.js'
import { ui } from './ui.js'
import { draw } from './render.js'

const GOAL = 25
const NIGHT = 180
const SEG_MIN = 5 // lose when standing < 5
const TIDE_T = 26 // s per full tide cycle
const TIDE_OPEN = 0.45 // mouth open above this tide level
const MAX_FISH = 80
const PEN_R2 = (R - 12) * (R - 12)
const FLEE_R = 150
const REPAIR_T = 2.5
const REPAIR_R = 80
const EAT_T = 2
const RAM_SPEED = 150

// ---- shared sim/visual state (one object, mutated in place) ----------------
const S = {
  phase: 'title', // 'title' | 'playing' | 'won' | 'lost'
  simT: 0,
  timer: NIGHT,
  timerK: 0,
  nightK: 0,
  dawnK: 0,
  tide: 0,
  tideRising: true,
  mouthOpen: false,
  shoreY: 790,
  penned: 0,
  fishAlive: 0,
  standing: SEGN,
  shake: 0,
  rowPh: 0,
  boat: { x: 500, y: 300, vx: 0, vy: 0, h: Math.PI / 2, speed: 0 },
  segs: [],
  fish: [],
  serp: {
    state: 'down', // 'down' | 'telegraph' | 'charge' | 'feed' | 'dive'
    t: 0,
    next: 13,
    target: -1,
    x: 0,
    y: 0,
    dx: 0,
    dy: 1,
    ex: 0,
    ey: 0,
    eatT: 0,
    ate: 0,
    noFood: 0,
    bubT: 0,
    sx: new Float64Array(10),
    sy: new Float64Array(10),
  },
  repair: { near: -1, k: -1, active: false },
  particles: [],
}

for (let i = 0; i < SEGN; i++) {
  const a0 = A0 + i * SEG_W
  const mid = a0 + SEG_W / 2
  S.segs.push({
    a0,
    a1: a0 + SEG_W,
    mid,
    mx: CX + Math.cos(mid) * R,
    my: CY + Math.sin(mid) * R,
    broken: false,
    fix: 0,
  })
}
for (let i = 0; i < MAX_FISH; i++) {
  S.fish.push({ x: 0, y: 0, vx: 0, vy: 0, alive: false, pen: false, ph: i * 0.73 })
}
for (let i = 0; i < 260; i++) {
  S.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 2, t: 'foam', alive: false })
}

const SCRATCH = new Int8Array(SEGN)
const audio = createAudio()
ui.init()

// ---- canvas -----------------------------------------------------------------
const canvas = document.createElement('canvas')
document.getElementById('app').appendChild(canvas)
const ctx = canvas.getContext('2d')
const view = { w: 1, h: 1, scale: 1, ox: 0, oy: 0 }

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  view.w = canvas.width
  view.h = canvas.height
  view.scale = Math.min(view.w / WORLD, view.h / WORLD)
  view.ox = (view.w - WORLD * view.scale) / 2
  view.oy = (view.h - WORLD * view.scale) / 2
}
window.addEventListener('resize', resize)
resize()

// ---- input -------------------------------------------------------------------
const keys = { w: false, a: false, s: false, d: false, e: false }

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    ui.setMuted(audio.toggleMute())
    return
  }
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true
  else if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true
  else if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true
  else if (e.code === 'KeyE') keys.e = true
  else return
  e.preventDefault()
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false
  else if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false
  else if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false
  else if (e.code === 'KeyE') keys.e = false
})
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false
})

// ---- toasts that only teach once or twice -----------------------------------
const seen = {}
function toastFirst(key, msg, mood, times, dur) {
  seen[key] = (seen[key] || 0) + 1
  if (seen[key] <= (times || 1)) ui.toast(msg, mood, dur)
}

// ---- particles ----------------------------------------------------------------
let pIdx = 0
function spawnP(type, x, y, vx, vy, life, size) {
  const p = S.particles[pIdx]
  pIdx = (pIdx + 1) % S.particles.length
  p.alive = true
  p.t = type
  p.x = x
  p.y = y
  p.vx = vx
  p.vy = vy
  p.life = life
  p.max = life
  p.s = size
}
function burst(type, x, y, n, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU
    const v = (0.3 + Math.random() * 0.7) * spd
    spawnP(
      type,
      x + (Math.random() - 0.5) * 6,
      y + (Math.random() - 0.5) * 6,
      Math.cos(a) * v,
      Math.sin(a) * v,
      life * (0.6 + Math.random() * 0.6),
      size * (0.7 + Math.random() * 0.6)
    )
  }
}

// ---- fish ---------------------------------------------------------------------
function spawnSchool(n, x, y) {
  let made = 0
  for (let i = 0; i < S.fish.length && made < n; i++) {
    const f = S.fish[i]
    if (f.alive) continue
    f.alive = true
    f.pen = false
    f.x = clamp(x + (Math.random() - 0.5) * 70, 20, 980)
    f.y = clamp(y + (Math.random() - 0.5) * 40, 20, 700)
    f.vx = (Math.random() - 0.5) * 30
    f.vy = 35 + Math.random() * 20
    made++
  }
  return made
}

function countPenned() {
  let pen = 0
  let alive = 0
  for (let i = 0; i < S.fish.length; i++) {
    const f = S.fish[i]
    if (!f.alive) continue
    alive++
    const dx = f.x - CX
    const dy = f.y - CY
    f.pen = dx * dx + dy * dy < PEN_R2
    if (f.pen) pen++
  }
  S.penned = pen
  S.fishAlive = alive
  return pen
}

let lastPenCue = -10
function fishUpdate(dt) {
  const F = S.fish
  const b = S.boat
  const sp = S.serp
  const serpHunts = sp.state === 'charge' || sp.state === 'feed'
  let pen = 0
  let alive = 0
  for (let i = 0; i < F.length; i++) {
    const f = F[i]
    if (!f.alive) continue
    alive++
    // -- flocking (neighbors within 80, separation within 24)
    let nN = 0
    let sx = 0
    let sy = 0
    let svx = 0
    let svy = 0
    let sepx = 0
    let sepy = 0
    for (let j = 0; j < F.length; j++) {
      if (j === i) continue
      const o = F[j]
      if (!o.alive) continue
      const dx = f.x - o.x
      const dy = f.y - o.y
      const d2 = dx * dx + dy * dy
      if (d2 < 6400) {
        nN++
        sx += o.x
        sy += o.y
        svx += o.vx
        svy += o.vy
        if (d2 < 576 && d2 > 0.01) {
          sepx += dx / d2
          sepy += dy / d2
        }
      }
    }
    let ax = 0
    let ay = 0
    if (nN > 0) {
      const inv = 1 / nN
      ax += (sx * inv - f.x) * 1.3
      ay += (sy * inv - f.y) * 1.3
      ax += (svx * inv - f.vx) * 1.6
      ay += (svy * inv - f.vy) * 1.6
    }
    ax += sepx * 260
    ay += sepy * 260
    // -- flee the boat (this is how you herd)
    let fleeing = false
    {
      const dx = f.x - b.x
      const dy = f.y - b.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < FLEE_R && d > 0.01) {
        const k = 1 - d / FLEE_R
        ax += (dx / d) * k * 460
        ay += (dy / d) * k * 460
        fleeing = true
      }
    }
    // -- flee the serpent
    if (serpHunts) {
      const dx = f.x - sp.x
      const dy = f.y - sp.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 130 && d > 0.01) {
        const k = 1 - d / 130
        ax += (dx / d) * k * 340
        ay += (dy / d) * k * 340
        fleeing = true
      }
    }
    if (f.pen) {
      // the deep pool holds them loosely at the corral's heart
      ax += (CX - f.x) * 0.55
      ay += (CY - f.y) * 0.55
    } else {
      // ride the tide in, retreat with it going out
      ay += S.tideRising ? 26 : -30
    }
    // wander
    ax += Math.sin(S.simT * 1.7 + f.ph) * 24
    ay += Math.cos(S.simT * 1.3 + f.ph * 1.7) * 24

    f.vx += ax * dt
    f.vy += ay * dt
    const dragK = 1 / (1 + 1.4 * dt)
    f.vx *= dragK
    f.vy *= dragK
    const maxSp = fleeing ? 215 : 105
    const sp2 = f.vx * f.vx + f.vy * f.vy
    if (sp2 > maxSp * maxSp) {
      const k = maxSp / Math.sqrt(sp2)
      f.vx *= k
      f.vy *= k
    }
    f.x += f.vx * dt
    f.y += f.vy * dt

    // world bounds
    if (f.x < 14) {
      f.x = 14
      f.vx = Math.abs(f.vx)
    } else if (f.x > 986) {
      f.x = 986
      f.vx = -Math.abs(f.vx)
    }
    if (f.y < 12) {
      f.y = 12
      f.vy = Math.abs(f.vy)
    }
    // unpenned fish stay in the water above the tide line
    if (!f.pen && f.y > S.shoreY - 12) {
      f.y = S.shoreY - 12
      f.vy = -Math.abs(f.vy) * 0.6
    }
    // corral ring: standing walls always block; the mouth blocks at marea baja
    const dxc = f.x - CX
    const dyc = f.y - CY
    const d = Math.sqrt(dxc * dxc + dyc * dyc) || 0.001
    if (Math.abs(d - R) < 13) {
      const si = segAt(Math.atan2(dyc, dxc))
      const passable = si >= 0 ? S.segs[si].broken : S.mouthOpen
      if (!passable) {
        const nx = dxc / d
        const ny = dyc / d
        const tr = f.pen ? R - 13 : R + 13
        f.x = CX + nx * tr
        f.y = CY + ny * tr
        const vr = f.vx * nx + f.vy * ny
        f.vx -= vr * nx * 1.7
        f.vy -= vr * ny * 1.7
      }
    }
    const dx2 = f.x - CX
    const dy2 = f.y - CY
    f.pen = dx2 * dx2 + dy2 * dy2 < PEN_R2
    if (f.pen) pen++
  }
  if (pen > S.penned && S.simT - lastPenCue > 0.35) {
    lastPenCue = S.simT
    audio.cue('penned')
  }
  S.penned = pen
  S.fishAlive = alive
}

// ---- boat ----------------------------------------------------------------------
let wakeT = 0
let creakT = 2
function boatUpdate(dt) {
  const b = S.boat
  let ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0)
  let iy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
  if (ix !== 0 && iy !== 0) {
    ix *= 0.7071
    iy *= 0.7071
  }
  const acc = S.repair.active ? 150 : 330
  b.vx += ix * acc * dt
  b.vy += iy * acc * dt
  // hard rowing makes the old wood complain (rate-limited)
  if (b.speed > 225 && (ix !== 0 || iy !== 0)) {
    creakT -= dt
    if (creakT <= 0) {
      creakT = 4.5 + Math.random() * 4.5
      audio.cue('creak')
    }
  }
  // gentle tidal drift on the hull
  b.vy += (S.tideRising ? 6 : -6) * dt
  const dragK = 1 / (1 + 1.05 * dt)
  b.vx *= dragK
  b.vy *= dragK
  let sp2 = b.vx * b.vx + b.vy * b.vy
  if (sp2 > 270 * 270) {
    const k = 270 / Math.sqrt(sp2)
    b.vx *= k
    b.vy *= k
    sp2 = 270 * 270
  }
  b.speed = Math.sqrt(sp2)
  if (b.speed > 18) {
    const want = Math.atan2(b.vy, b.vx)
    let dh = want - b.h
    while (dh > Math.PI) dh -= TAU
    while (dh < -Math.PI) dh += TAU
    b.h += dh * Math.min(1, 8 * dt)
  }
  S.rowPh += dt * (1.4 + b.speed * 0.045)
  b.x += b.vx * dt
  b.y += b.vy * dt
  if (b.x < 26) {
    b.x = 26
    b.vx = 0
  } else if (b.x > 974) {
    b.x = 974
    b.vx = 0
  }
  if (b.y < 26) {
    b.y = 26
    b.vy = 0
  } else if (b.y > 974) {
    b.y = 974
    b.vy = 0
  }
  // standing wall segments stop the hull (the mouth never does)
  const dxc = b.x - CX
  const dyc = b.y - CY
  const d = Math.sqrt(dxc * dxc + dyc * dyc) || 0.001
  if (Math.abs(d - R) < 26) {
    const si = segAt(Math.atan2(dyc, dxc))
    if (si >= 0 && !S.segs[si].broken) {
      const nx = dxc / d
      const ny = dyc / d
      const side = d >= R ? 1 : -1
      b.x = CX + nx * (R + side * 26)
      b.y = CY + ny * (R + side * 26)
      const vr = b.vx * nx + b.vy * ny
      if ((side === 1 && vr < 0) || (side === -1 && vr > 0)) {
        b.vx -= vr * nx
        b.vy -= vr * ny
      }
    }
  }
  // wake
  if (b.speed > 70) {
    wakeT -= dt
    if (wakeT <= 0) {
      wakeT = 0.07
      const cx = Math.cos(b.h)
      const cy = Math.sin(b.h)
      spawnP(
        'foam',
        b.x - cx * 18,
        b.y - cy * 18,
        -cx * 26 + (Math.random() - 0.5) * 22,
        -cy * 26 + (Math.random() - 0.5) * 22,
        0.65,
        2
      )
    }
  }
}

// ---- corral repair ---------------------------------------------------------------
let tickT = 0
let lastBlockT = -10
function repairUpdate(dt) {
  const sp = S.serp
  const b = S.boat
  let near = -1
  let blocked = false
  let nd = REPAIR_R
  for (let i = 0; i < SEGN; i++) {
    const sg = S.segs[i]
    if (!sg.broken) continue
    const dx = b.x - sg.mx
    const dy = b.y - sg.my
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < nd) {
      if ((sp.state === 'feed' || sp.state === 'charge') && sp.target === i) {
        blocked = true
        continue
      }
      nd = d
      near = i
    }
  }
  S.repair.near = near
  let active = false
  if (near >= 0 && keys.e) {
    const sg = S.segs[near]
    sg.fix += dt / REPAIR_T
    active = true
    S.repair.k = Math.min(1, sg.fix)
    tickT -= dt
    if (tickT <= 0) {
      tickT = 0.3
      audio.cue('tick')
      const dx = sg.mx - b.x
      const dy = sg.my - b.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      spawnP('stone', b.x + (Math.random() - 0.5) * 8, b.y + (Math.random() - 0.5) * 8, (dx / d) * 110, (dy / d) * 110, d / 115, 2.4)
    }
    if (sg.fix >= 1) {
      sg.broken = false
      sg.fix = 0
      audio.cue('repaired')
      spawnP('ring', sg.mx, sg.my, 0, 0, 0.6, 4)
      burst('stone', sg.mx, sg.my, 8, 60, 0.7, 2.6)
      burst('glow', sg.mx, sg.my, 5, 50, 0.6, 2)
      toastFirst('fixed', 'Muro en pie otra vez — el corral respira', 'good', 2)
      S.repair.near = -1
      S.repair.k = -1
      active = false
    }
  } else {
    S.repair.k = -1
    if (keys.e && blocked && near < 0 && S.simT - lastBlockT > 2.5) {
      lastBlockT = S.simT
      ui.toast('El Cuchivilu está en la brecha — ¡embístelo primero!', 'bad')
    }
  }
  S.repair.active = active
  // unattended repairs slump back into the mud
  for (let i = 0; i < SEGN; i++) {
    const sg = S.segs[i]
    if (sg.broken && sg.fix > 0 && !(active && i === S.repair.near)) {
      sg.fix = Math.max(0, sg.fix - 0.6 * dt)
    }
  }
}

// ---- El Cuchivilu -----------------------------------------------------------------
let whispered = false
function nextInterval() {
  return 16 - 6.5 * S.nightK + Math.random() * 3
}

function beginSurface(idx) {
  const sp = S.serp
  let t = -1
  if (typeof idx === 'number' && idx >= 0 && idx < SEGN) {
    t = idx | 0
  } else {
    let n = 0
    for (let i = 0; i < SEGN; i++) if (!S.segs[i].broken) SCRATCH[n++] = i
    if (n === 0) for (let i = 0; i < SEGN; i++) SCRATCH[n++] = i
    t = SCRATCH[(Math.random() * n) | 0]
  }
  const seg = S.segs[t]
  sp.target = t
  sp.ex = clamp(CX + Math.cos(seg.mid) * (R + 145), 40, 960)
  sp.ey = clamp(CY + Math.sin(seg.mid) * (R + 145), 40, 960)
  sp.state = 'telegraph'
  sp.t = 0
  sp.bubT = 0
  audio.cue('bubble')
  if (!whispered) {
    whispered = true
    audio.voice('whisper') // once a night: the old voice names what is coming
  }
  toastFirst('tele', 'El fango hierve — el Cuchivilu viene por el corral', 'bad', 2, 3000)
}

function doBreak(i) {
  if (i < 0 || i >= SEGN) return
  const seg = S.segs[i]
  if (seg.broken) return
  seg.broken = true
  seg.fix = 0
  S.shake = 0.85
  audio.cue('crunch')
  spawnP('ring', seg.mx, seg.my, 0, 0, 0.55, 8)
  burst('debris', seg.mx, seg.my, 12, 90, 0.9, 3)
  burst('splash', seg.mx, seg.my, 8, 70, 0.6, 2.4)
  toastFirst('break', '¡Rompió el muro! Embístelo a todo remo, repara con E', 'bad', 2, 3500)
}

function ramHit(nx, ny) {
  const sp = S.serp
  sp.state = 'dive'
  sp.t = 0
  audio.cue('ram')
  audio.cue('squeal')
  S.shake = 0.8
  spawnP('ring', sp.x, sp.y, 0, 0, 0.6, 6)
  burst('splash', sp.x, sp.y, 16, 140, 0.8, 2.6)
  burst('glow', sp.x, sp.y, 6, 70, 0.6, 2.2)
  const b = S.boat
  b.vx = nx * 230
  b.vy = ny * 230
  toastFirst('ram', 'Se hunde, chillando — vuelve al fango', 'good', 2)
}

let lastShoveT = -10
function checkRam() {
  const sp = S.serp
  const b = S.boat
  const dx = b.x - sp.x
  const dy = b.y - sp.y
  const d = Math.sqrt(dx * dx + dy * dy) || 0.001
  if (d > 36) return
  const nx = dx / d
  const ny = dy / d
  if (b.speed > RAM_SPEED) {
    ramHit(nx, ny)
  } else {
    // too slow: he shoulders the hull aside
    b.x = sp.x + nx * 36
    b.y = sp.y + ny * 36
    const vr = b.vx * nx + b.vy * ny
    if (vr < 0) {
      b.vx -= vr * nx
      b.vy -= vr * ny
    }
    if (S.simT - lastShoveT > 2.5) {
      lastShoveT = S.simT
      burst('splash', sp.x, sp.y, 4, 50, 0.4, 2)
      audio.cue('shove')
      toastFirst('slow', 'Te aparta de un empujón — embístelo a todo remo', 'bad', 2)
    }
  }
}

function eatOne() {
  const sp = S.serp
  let best = -1
  let bd = Infinity
  for (let i = 0; i < S.fish.length; i++) {
    const f = S.fish[i]
    if (!f.alive || !f.pen) continue
    const dx = f.x - sp.x
    const dy = f.y - sp.y
    const d2 = dx * dx + dy * dy
    if (d2 < bd) {
      bd = d2
      best = i
    }
  }
  if (best < 0 || bd > 150 * 150) return false // out of snout's reach
  const f = S.fish[best]
  f.alive = false
  burst('scale', f.x, f.y, 7, 80, 0.7, 2)
  audio.cue('eat')
  sp.ate++
  toastFirst('eat', 'Se come los peces por la brecha — ¡sácalo de ahí!', 'bad', 2, 3000)
  return true
}

function selfDive() {
  const sp = S.serp
  sp.state = 'dive'
  sp.t = 0
  audio.cue('dive')
  burst('splash', sp.x, sp.y, 8, 90, 0.7, 2.4)
}

function trail() {
  const sp = S.serp
  let px = sp.x
  let py = sp.y
  for (let i = 0; i < 10; i++) {
    const dx = px - sp.sx[i]
    const dy = py - sp.sy[i]
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > 13) {
      const k = (d - 13) / d
      sp.sx[i] += dx * k
      sp.sy[i] += dy * k
    }
    px = sp.sx[i]
    py = sp.sy[i]
  }
}

function serpentUpdate(dt) {
  const sp = S.serp
  switch (sp.state) {
    case 'down':
      sp.next -= dt
      if (sp.next <= 0) beginSurface(-1)
      break
    case 'telegraph': {
      sp.t += dt
      sp.bubT -= dt
      if (sp.bubT <= 0) {
        sp.bubT = 0.12
        spawnP(
          'bubble',
          sp.ex + (Math.random() - 0.5) * 26,
          sp.ey + (Math.random() - 0.5) * 26,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          0.9,
          2.2
        )
      }
      if (sp.t >= TELE_T) {
        const seg = S.segs[sp.target]
        sp.state = 'charge'
        sp.t = 0
        sp.x = sp.ex
        sp.y = sp.ey
        const wx = CX + Math.cos(seg.mid) * R
        const wy = CY + Math.sin(seg.mid) * R
        let dx = wx - sp.x
        let dy = wy - sp.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        dx /= d
        dy /= d
        sp.dx = dx
        sp.dy = dy
        for (let i = 0; i < 10; i++) {
          sp.sx[i] = sp.x - dx * 13 * (i + 1)
          sp.sy[i] = sp.y - dy * 13 * (i + 1)
        }
        audio.cue('splash')
      }
      break
    }
    case 'charge': {
      sp.t += dt
      const seg = S.segs[sp.target]
      const wx = CX + Math.cos(seg.mid) * R
      const wy = CY + Math.sin(seg.mid) * R
      let dx = wx - sp.x
      let dy = wy - sp.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001
      const v = 195 + 85 * S.nightK
      sp.x += (dx / d) * v * dt
      sp.y += (dy / d) * v * dt
      sp.dx += (dx / d - sp.dx) * Math.min(1, 10 * dt)
      sp.dy += (dy / d - sp.dy) * Math.min(1, 10 * dt)
      trail()
      if (d < 22) {
        doBreak(sp.target)
        sp.state = 'feed'
        sp.t = 0
        sp.eatT = 0
        sp.ate = 0
        sp.noFood = 0
      }
      checkRam()
      break
    }
    case 'feed': {
      sp.t += dt
      const seg = S.segs[sp.target]
      const gx = CX + Math.cos(seg.mid) * (R - 34)
      const gy = CY + Math.sin(seg.mid) * (R - 34)
      const tx = gx + Math.cos(sp.t * 2.3) * 7
      const ty = gy + Math.sin(sp.t * 1.9) * 7
      sp.x += (tx - sp.x) * Math.min(1, 4 * dt)
      sp.y += (ty - sp.y) * Math.min(1, 4 * dt)
      // face the pool he is robbing
      let dx = CX - sp.x
      let dy = CY - sp.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      sp.dx += (dx / d - sp.dx) * Math.min(1, 6 * dt)
      sp.dy += (dy / d - sp.dy) * Math.min(1, 6 * dt)
      trail()
      sp.eatT += dt
      if (sp.eatT >= EAT_T) {
        sp.eatT = 0
        // a failed bite (no fish in reach) counts toward giving up
        if (eatOne()) sp.noFood = 0
        else sp.noFood += EAT_T
      }
      if (sp.ate >= 6 || sp.t > 16 || sp.noFood > 3.5) selfDive()
      else checkRam()
      break
    }
    case 'dive':
      sp.t += dt
      trail()
      if (sp.t > 1.1) {
        sp.state = 'down'
        sp.next = nextInterval()
      }
      break
  }
}

// ---- tide -----------------------------------------------------------------------
function tideUpdate() {
  const ph = (S.simT * TAU) / TIDE_T - Math.PI / 2
  S.tide = 0.5 + 0.5 * Math.sin(ph)
  S.tideRising = Math.cos(ph) > 0
  S.shoreY = 790 + 180 * S.tide
  const open = S.tide > TIDE_OPEN
  if (open !== S.mouthOpen) {
    S.mouthOpen = open
    if (open) {
      audio.cue('tideIn')
      toastFirst('tideIn', 'Marea alta — la boca del corral está abierta', 'good', 2, 2800)
      if (S.fishAlive < MAX_FISH - 12) {
        spawnSchool(8 + ((Math.random() * 5) | 0), 140 + Math.random() * 720, 60 + Math.random() * 70)
        audio.cue('school')
      }
    } else {
      audio.cue('tideOut')
      toastFirst('tideOut', 'Marea baja — lo encerrado, encerrado queda', 'good', 2, 2800)
    }
  }
}

// ---- particles update --------------------------------------------------------------
function particlesUpdate(dt) {
  const P = S.particles
  const dragK = 1 / (1 + 2.4 * dt)
  for (let i = 0; i < P.length; i++) {
    const p = P[i]
    if (!p.alive) continue
    p.life -= dt
    if (p.life <= 0) {
      p.alive = false
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= dragK
    p.vy *= dragK
  }
}

// ---- game flow -----------------------------------------------------------------
function startGame() {
  if (S.phase !== 'title') return
  audio.unlock()
  audio.voice('intro') // after the BEGIN gesture, never on page load
  S.phase = 'playing'
  spawnSchool(10, 360, 170)
  spawnSchool(9, 660, 230)
  countPenned()
  ui.setHUDVisible(true)
  ui.toast('Arrea los cardúmenes hacia la boca del corral — la marea alta la abre', 'good', 4500)
}

function win() {
  if (S.phase === 'won' || S.phase === 'lost') return
  S.phase = 'won'
  S.shake = 0
  try {
    localStorage.setItem('chiloe-cuchivilu-done', '1')
  } catch (e) { /* storage may be unavailable */ }
  audio.cue('win')
  audio.voice('win')
  ui.setHUDVisible(false)
  const walls =
    S.standing === SEGN
      ? 'cada muro en pie o remendado por tus propias manos frías'
      : 'los muros que aún quedan en pie remendados por tus propias manos frías; el resto, entregado a la marea'
  ui.showEnd({
    won: true,
    title: 'El corral lleno',
    charms: '✦ ' + S.penned + ' / ' + GOAL + ' ✦',
    body:
      'El alba llega gris y piadosa, y el corral tirita de plata: ' +
      S.penned +
      ' peces tras las piedras de tus abuelos, ' +
      walls +
      '. Lejos, pasada la boca, el Cuchivilu arrastra el hocico bajo la marea ' +
      'baja, vencido, y su chillido se adelgaza sobre el bajío. Este invierno ' +
      'nadie en tu mesa mira un plato vacío: donde el corral se cuida, el hambre no entra.',
  })
}

function lose(reason) {
  if (S.phase === 'won' || S.phase === 'lost') return
  S.phase = 'lost'
  S.shake = 0
  audio.cue('lose')
  audio.voice(reason === 'corral' ? 'lose-corral' : 'lose-alba')
  ui.setHUDVisible(false)
  if (reason === 'corral') {
    ui.showEnd({
      won: false,
      title: 'El corral roto',
      charms: '✕ ' + S.standing + ' / ' + SEGN,
      body:
        'El muro que tus abuelos levantaron piedra por piedra es escombro bajo ' +
        'la marea, y el mar lo cruza como una puerta sin casa. El Cuchivilu se ' +
        'revuelca en la brecha, hocico a la luna, devolviendo la plata al canal — ' +
        'donde se revuelca el chancho-serpiente, no entra más pez. Esta noche ' +
        'ya no queda nada que remendar.',
    })
  } else {
    ui.showEnd({
      won: false,
      title: 'El alba',
      charms: '✦ ' + S.penned + ' / ' + GOAL,
      body:
        'La luz encuentra apenas ' +
        S.penned +
        ' peces girando en la poza — el resto se lo quedó el mar, o se lo llevó ' +
        'el hocico por la piedra rota. Tu familia medirá este invierno en sopa ' +
        'aguada y harina prestada, mientras allá en el bajío el Cuchivilu se ' +
        'revuelca, lento y harto. La familia pasa hambre, y el corral recuerda ' +
        'quién no supo cuidarlo.',
    })
  }
}

// ---- sim ------------------------------------------------------------------------
let prevStanding = SEGN
function simUpdate(dt) {
  S.simT += dt
  tideUpdate()
  boatUpdate(dt)
  repairUpdate(dt)
  fishUpdate(dt)
  serpentUpdate(dt)
  particlesUpdate(dt)
  S.shake = Math.max(0, S.shake - dt * 1.5)

  // corral integrity
  let standing = 0
  for (let i = 0; i < SEGN; i++) if (!S.segs[i].broken) standing++
  S.standing = standing
  if (standing < prevStanding && standing <= 6) {
    audio.cue('warn')
    if (standing === SEG_MIN) toastFirst('edge', '¡Una piedra más y el corral cae!', 'bad', 2, 3000)
  }
  prevStanding = standing
  if (standing < SEG_MIN) {
    lose('corral')
    return
  }

  // the night burns down
  S.timer -= dt
  S.nightK = clamp(1 - S.timer / NIGHT, 0, 1)
  S.timerK = S.nightK
  S.dawnK = S.timer < 30 ? 1 - S.timer / 30 : 0
  if (S.timer < 30) toastFirst('clarea', 'El cielo clarea — aguanta hasta el alba', '', 1, 3000)
  if (S.timer <= 0) {
    S.timer = 0
    if (S.penned >= GOAL) win()
    else lose('alba')
  }
}

// ---- frame: pure, driven by rAF AND by manual stepping ---------------------------
let tVis = 0
function frame(dt) {
  dt = Math.min(dt, 0.05)
  tVis += dt
  if (S.phase === 'playing') {
    simUpdate(dt)
    if (S.phase === 'playing') {
      ui.hud(S.penned, GOAL, S.timerK, S.standing, S.mouthOpen, S.repair.k)
    }
  }
  draw(ctx, view, S, tVis)
}

let last = performance.now()
requestAnimationFrame(function loop(now) {
  requestAnimationFrame(loop)
  const dt = (now - last) / 1000
  last = now
  if (dt > 0) frame(dt)
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
    timer: S.timer,
    penned: S.penned,
    goal: GOAL,
    fishAlive: S.fishAlive,
    standing: S.segs.reduce((n, s) => n + (s.broken ? 0 : 1), 0),
    segments: S.segs.map((s) => !s.broken),
    tide: S.tide,
    mouthOpen: S.mouthOpen,
    serpent: {
      state: S.serp.state,
      target: S.serp.target,
      x: S.serp.x,
      y: S.serp.y,
      nextIn: Math.max(0, S.serp.next),
    },
    boat: { x: S.boat.x, y: S.boat.y, speed: S.boat.speed },
    repair: { near: S.repair.near, k: S.repair.k },
    muted: audio.state.muted,
  }),
  forceWin: () => win(),
  forceLose: (reason = 'alba') => lose(reason === 'corral' ? 'corral' : 'alba'),
  setFish: (n) => {
    n = Math.max(0, n | 0)
    let pen = countPenned()
    // remove surplus penned fish
    for (let i = 0; i < S.fish.length && pen > n; i++) {
      const f = S.fish[i]
      if (f.alive && f.pen) {
        f.alive = false
        pen--
      }
    }
    // add fish into the pool: dead slots first, then steal loose fish
    let k = 0
    while (pen < n) {
      let f = null
      for (let i = 0; i < S.fish.length; i++) {
        if (!S.fish[i].alive) {
          f = S.fish[i]
          break
        }
      }
      if (!f) {
        for (let i = 0; i < S.fish.length; i++) {
          if (S.fish[i].alive && !S.fish[i].pen) {
            f = S.fish[i]
            break
          }
        }
      }
      if (!f) break // pool exhausted (n > MAX_FISH)
      const ang = k * 2.39996
      const rad = 30 + ((k * 37) % 130)
      f.alive = true
      f.x = CX + Math.cos(ang) * rad
      f.y = CY + Math.sin(ang) * rad
      f.vx = 0
      f.vy = 0
      f.pen = true
      k++
      pen++
    }
    return countPenned()
  },
  penned: () => countPenned(),
  setTime: (s) => {
    S.timer = Math.max(0, +s || 0)
    S.nightK = clamp(1 - S.timer / NIGHT, 0, 1)
    S.timerK = S.nightK
  },
  surfaceNow: (segment) => {
    beginSurface(typeof segment === 'number' && isFinite(segment) ? segment | 0 : -1)
  },
  breakSegment: (i) => doBreak(i | 0),
  repairSegment: (i) => {
    i = i | 0
    if (i >= 0 && i < SEGN) {
      S.segs[i].broken = false
      S.segs[i].fix = 0
    }
  },
  setBoat: (x, y) => {
    S.boat.x = clamp(+x || 0, 26, 974)
    S.boat.y = clamp(+y || 0, 26, 974)
    S.boat.vx = 0
    S.boat.vy = 0
    S.boat.speed = 0
  },
  setKeys: (o) => {
    if (!o) return
    for (const k in keys) {
      if (o[k] !== undefined) keys[k] = !!o[k]
    }
  },
  ramNow: () => {
    const sp = S.serp
    if (sp.state !== 'charge' && sp.state !== 'feed') return false
    const dx = S.boat.x - sp.x
    const dy = S.boat.y - sp.y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    ramHit(dx / d, dy / d)
    return true
  },
  audioState: () => audio.state,
}
