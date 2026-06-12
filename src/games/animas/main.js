// ============================================================================
// LA BARCA DE LAS ÁNIMAS — El estrecho · Mitos de Chiloé
// Physics-balance ferry, canvas2d side view. Three crossings of the last
// strait: LOAD the dead at the dock (drag each soul onto a deck position —
// the boat tilts live with the center of mass), then ROW — strokes timed to
// the bow lantern's breath glide farther; telegraphed current gusts heel the
// boat and A/D leans the ferryman to counterbalance; one RESTLESS soul per
// later trip drifts toward the rail mid-crossing (a soft wail warns you).
// Past the red arc the boat spills souls into the black water (they sink as
// fading lights); past the far arc she rolls and spills everything. Three
// lost souls end the run — el estrecho cobró su parte. At the far shore the
// Caleuche waits: souls climb a gangplank of pale light, one by one, and each
// turns and bows. Win after 3 crossings with ≤2 lost (seña guardada).
//
// TEST API — window.__game (sim is a pure frame(dt), driven by both rAF and
// manual stepping; rAF throttles in hidden tabs — tests drive step()):
//   begin()                — same as pressing COMENZAR (unlocks audio)
//   step(dt=1/60, steps=1) — advance the sim deterministically, then draw
//                            once. dt clamped to 0.05. Sim only advances
//                            while phase === 'playing'.
//   getState()             — { phase:'title'|'playing'|'won'|'lost',
//                              sub:'loading'|'rowing'|'arriving'|'returning',
//                              trip:1..3, lost, delivered, aboard, queued,
//                              tilt (rad), tiltMax (spill threshold rad),
//                              progress:0..1, vel, strokes, onBeatStrokes,
//                              beatPhase (s into current beat), muted }
//   forceWin()             — runs the real win handler (incl. localStorage
//                            'chiloe-animas-done' = '1')
//   forceLose()            — runs the real lose handler
//   loadSoul(i, x)         — board queued soul #i (order of getState().queued
//                            listing) at deck position x in [-0.92, 0.92]
//   souls()                — [{ kind, state, x, w, restless }] for this trip
//   depart()               — leave the dock now (souls still queued stay
//                            ashore; normally ZARPAR needs an empty queue)
//   tilt()                 — current tilt in radians (+ = bow-down/right)
//   lean(v)                — set ferryman counterweight target -1..1
//   strokeNow()            — pull one oar stroke (timed against the beat)
//   gustNow(dir)           — start a gust immediately (dir -1 | 1)
//   setProgress(p)         — set crossing progress 0..1 (rowing only)
//   capsizeNow()           — force the full roll (spills everything aboard)
//   setTrip(n)             — jump to trip n's loading phase (keeps lost count)
//   lostSouls()            — souls lost so far this run
//   pressKey(code, down)   — drive keyboard input ('Space','KeyA','KeyD','KeyM')
// ============================================================================

import { createRenderer } from './render.js'
import { createAudio } from './audio.js'

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const ease = (t) => t * t * (3 - 2 * t)

const LS_DONE = 'chiloe-animas-done'
const TILT_SPILL = 0.4 // rad — the red arc
const TILT_ROLL = 0.62 // rad — full capsize
const BEAT = 1.2 // s — the lantern's breath
const BEAT_WIN = 0.19 // s — on-beat window each side
const SLOT_XS = [-0.85, -0.607, -0.364, -0.121, 0.121, 0.364, 0.607, 0.85]
const MAX_LOST = 3 // the third light ends the run

const TRIP_CASTS = [
  ['pescador', 'viuda', 'nino', 'pescador'],
  ['pescador', 'viuda', 'inquieta', 'nino', 'viuda'],
  ['pescador', 'nino', 'pescador', 'inquieta', 'viuda', 'nino', 'viuda'],
]
const KIND_W = { pescador: 1.52, viuda: 1.0, nino: 0.55, inquieta: 1.05 }
const KIND_SIZE = { pescador: 1.06, viuda: 1.0, nino: 0.88, inquieta: 1.0 }
const GUST_POWER = [0.6, 0.85, 1.1]
const GUST_GAP = [9.5, 7.5, 6.0]

const TEXTS = {
  // card bodies match the voice clips (assets/voice/animas/*.mp3) word for
  // word, in the collection's register.
  intro: 'Hay un agua que no devuelve a nadie. El remero la cruza de noche, llevando a los ahogados como quien lleva una brazada de trigo oscuro, y al otro lado espera el Caleuche con las luces encendidas. <i>Carga bien la barca, remero:</i> el estrecho pesa cada alma, y cobra las que se inclinan.',
  win: 'Tres veces cruzaste el agua negra, y el agua no te quiso. Las ánimas suben una a una por la pasarela de luz, y cada una se vuelve a mirarte, como se vuelve la ola a mirar la orilla. El Caleuche enciende sus fiestas: ya tienen barco los que no tenían orilla.',
  lose: 'El estrecho cobró su parte. La barca se acostó en el agua como se acuesta el cansancio, y las ánimas bajaron solas, alumbrando, hacia un puerto que no está en ninguna carta. Vuelve al muelle, remero: los muertos saben esperar.',
  controls: 'ARRASTRA las ánimas a la cubierta · ESPACIO / TOQUE: remar al compás del farol · A / D: contrapeso · M: sonido',
}
const TRIP_TOASTS = [
  'viaje i — acomoda el peso de los muertos',
  'viaje ii — hay una que no sabe quedarse quieta',
  'viaje iii — el viento también quiere subir a bordo',
]
const ROMAN = ['i', 'ii', 'iii']

// --- dom -----------------------------------------------------------------------
const canvas = document.getElementById('game')
const ui = document.getElementById('ui')

function el(tag, cls, html, parent) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  ;(parent || ui).appendChild(e)
  return e
}

const hud = el('div', '', '', ui)
hud.id = 'hud'
const tripSpan = el('span', '', '', hud)
const candles = el('div', '', '', hud)
candles.id = 'candles'
candles.style.position = 'static'
const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', '', ui)
hint.id = 'hint'
el('div', '', 'M · sonido', ui).id = 'mute-hint'
const zarparBtn = el('button', '', 'ZARPAR', ui)
zarparBtn.id = 'zarpar'
const leanL = el('div', 'lean-btn', '◀', ui)
leanL.id = 'lean-l'
const leanR = el('div', 'lean-btn', '▶', ui)
leanR.id = 'lean-r'

let toastTimer = null
function toast(msg, long) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), long ? 4200 : 2400)
}

function card(title, epithet, body, controls, btnLabel, onClick) {
  const ov = el('div', 'overlay', '', ui)
  const c = el('div', 'card', '', ov)
  el('div', 'charm', '✦', c)
  el('h1', '', title, c)
  el('div', 'epithet', epithet, c)
  el('p', 'myth', body, c)
  if (controls) el('div', 'controls', controls, c)
  const b = el('button', '', btnLabel, c)
  b.addEventListener('click', onClick)
  return ov
}

const titleCard = card(
  'LA BARCA DE LAS ÁNIMAS', 'El estrecho', TEXTS.intro,
  TEXTS.controls, 'COMENZAR', () => begin()
)
let endCard = null
function showEnd(title, epithet, body, btn, action) {
  if (endCard) endCard.remove()
  endCard = card(title, epithet, body, '', btn, action)
}

// --- state -----------------------------------------------------------------------
const renderer = createRenderer(canvas)
const audio = createAudio()

// seeded rng so each trip's queue is the same little crowd every run
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const game = {
  phase: 'title', // title | playing | won | lost
  sub: 'loading', // loading | rowing | arriving | returning
  trip: 1,
  lost: 0,
  delivered: 0,
  souls: [],
  tilt: 0,
  tiltV: 0,
  tiltMax: TILT_SPILL,
  rollVis: 0,
  prog: 0,
  vel: 0,
  lean: 0,
  strokeT: 0,
  beatK: 0,
  drag: { soul: null, px: 0, py: 0, slotX: -2, from: '' },
  simT: 0,
  rowT: 0,
}
const stats = { strokes: 0, onBeat: 0, totalT: 0 }
const lean = { key: 0, btn: 0 }
const gust = { phase: 'idle', t: 0, dir: 1, power: 0, next: 5 }
const roll = { on: false, t: 0, dir: 1 }
const cere = { idx: -1, wait: 0, order: [] }
let spillGrace = 0
let returnT = 0
let lastBeatIdx = -1
let lastStrokeAt = -10
let holdRow = false

// --- souls ----------------------------------------------------------------------
function makeSouls(trip) {
  const rng = mulberry32(trip * 7919 + 13)
  const cast = TRIP_CASTS[trip - 1]
  const souls = []
  for (let i = 0; i < cast.length; i++) {
    const kind = cast[i]
    souls.push({
      kind,
      w: KIND_W[kind] * (0.92 + rng() * 0.16),
      size: KIND_SIZE[kind] * (0.95 + rng() * 0.1),
      restless: kind === 'inquieta',
      state: 'queue',
      qi: i,
      x: 0,
      ph: rng() * TAU,
      face: 1,
      wailK: 0,
      standK: 0,
      slideT: 0,
      restT: 4.5 + rng() * 2.5,
      driftT: -1,
      driftFrom: 0,
      driftTo: 0,
      cereT: 0,
      cereK: 0,
      sx: 0,
      sy: 0,
      sr: 0,
    })
  }
  return souls
}

function queued() {
  let n = 0
  for (const s of game.souls) if (s.state === 'queue') n++
  return n
}
function aboard() {
  let n = 0
  for (const s of game.souls) if (s.state === 'board' || s.state === 'walk') n++
  return n
}
function packQueue() {
  let qi = 0
  for (const s of game.souls) if (s.state === 'queue') s.qi = qi++
}

function freeSlot(x) {
  // nearest slot not taken by a boarded soul
  let best = -2
  let bestD = Infinity
  for (const sx of SLOT_XS) {
    let taken = false
    for (const s of game.souls) {
      if ((s.state === 'board' || s.state === 'slide') && Math.abs(s.x - sx) < 0.12) taken = true
    }
    if (taken) continue
    const d = Math.abs(sx - x)
    if (d < bestD) {
      bestD = d
      best = sx
    }
  }
  return bestD < 0.45 ? best : -2
}

// --- trip flow -------------------------------------------------------------------
function setupTrip(n) {
  game.trip = clamp(n, 1, 3)
  game.sub = 'loading'
  game.souls = makeSouls(game.trip)
  game.tilt = 0
  game.tiltV = 0
  game.rollVis = 0
  game.prog = 0
  game.vel = 0
  game.lean = 0
  game.strokeT = 0
  game.rowT = 0
  game.drag.soul = null
  game.drag.slotX = -2
  gust.phase = 'idle'
  gust.next = 4 + Math.random() * 2
  roll.on = false
  cere.idx = -1
  cere.order.length = 0
  spillGrace = 0
  lastBeatIdx = -1
  lastStrokeAt = -10
  zarparBtn.classList.remove('show')
  leanL.classList.remove('show')
  leanR.classList.remove('show')
  updateHud()
  if (game.phase === 'playing') {
    toast(TRIP_TOASTS[game.trip - 1], true)
    hint.textContent = 'arrastra cada ánima a la cubierta — reparte el peso'
  }
}

function depart() {
  if (game.phase !== 'playing' || game.sub !== 'loading') return
  if (game.drag.soul) dropSoul(true)
  game.sub = 'rowing'
  game.rowT = 0
  lastBeatIdx = -1
  lastStrokeAt = -10
  gust.phase = 'idle'
  gust.next = 3.5 + Math.random() * 2.5
  audio.sfx.zarpar()
  renderer.shake(1.2)
  hint.textContent = 'ESPACIO al brillo del farol · A / D contrapeso'
  toast('rema cuando respire el farol')
  zarparBtn.classList.remove('show')
  leanL.classList.add('show')
  leanR.classList.add('show')
}

function stroke(auto) {
  if (game.phase !== 'playing' || game.sub !== 'rowing' || roll.on) return
  if (game.rowT - lastStrokeAt < 0.45) return
  lastStrokeAt = game.rowT
  const ph = game.rowT % BEAT
  const dist = Math.min(ph, BEAT - ph)
  const onBeat = !auto && dist < BEAT_WIN
  const power = auto ? 1.0 : onBeat ? 1.7 : 0.85
  game.vel += 0.052 * power
  game.strokeT = 1
  stats.strokes++
  if (onBeat) stats.onBeat++
  audio.sfx.stroke(onBeat)
  const L = renderer.getLayout()
  renderer.splash(L.bx - L.half * 0.5, L.waterY + 4 * L.s, onBeat ? 10 : 6, false)
  if (onBeat) renderer.popup(L.bx + L.half, L.by - 86 * L.s, '✦', '#ffd9a0')
}

function startGust(dir) {
  gust.phase = 'tele'
  gust.t = 0
  gust.dir = dir
  gust.power = GUST_POWER[game.trip - 1] * (0.85 + Math.random() * 0.3)
  audio.sfx.gust()
}

function spillSoul(dirSign) {
  let pick = null
  let best = -Infinity
  for (const s of game.souls) {
    if (s.state !== 'board') continue
    const v = s.x * dirSign
    if (v > best) {
      best = v
      pick = s
    }
  }
  if (!pick) return false
  pick.state = 'slide'
  pick.slideT = 0
  pick.slideDir = dirSign
  spillGrace = 1.0
  return true
}

function soulLost(s) {
  s.state = 'lost'
  game.lost++
  const L = renderer.getLayout()
  const sx = s.sx || L.bx
  renderer.splash(sx, L.waterY + 4 * L.s, 16, true)
  renderer.sinkLight(sx, L.waterY + 10 * L.s)
  renderer.popup(sx + (Math.random() - 0.5) * 60 * L.s, L.waterY - (30 + (game.lost % 4) * 22) * L.s, 'el agua tomó una', '#ff8a64')
  renderer.shake(3)
  renderer.flash('#0a1418', 0.18)
  audio.sfx.spill()
  updateHud()
  if (game.lost >= MAX_LOST) lose()
}

function startRoll(dir) {
  if (roll.on) return
  roll.on = true
  roll.t = 0
  roll.dir = dir || (game.tilt >= 0 ? 1 : -1)
  let d = 0
  for (const s of game.souls) {
    if (s.state === 'board') {
      s.state = 'slide'
      s.slideT = -d // stagger
      s.slideDir = roll.dir
      d += 0.12
    }
  }
  audio.sfx.roll()
  renderer.shake(5)
  renderer.flash('#0c161a', 0.25)
}

function startArrival() {
  game.sub = 'arriving'
  game.prog = 1
  game.vel = 0
  game.lean = 0
  cere.order.length = 0
  for (const s of game.souls) if (s.state === 'board') cere.order.push(s)
  cere.order.sort((a, b) => b.x - a.x) // bow first
  cere.idx = -1
  cere.wait = cere.order.length ? 0.9 : 0.6
  audio.sfx.arrive()
  hint.textContent = ''
  leanL.classList.remove('show')
  leanR.classList.remove('show')
  if (cere.order.length) toast('déjalas subir: una por una')
}

function win() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'won'
  titleCard.remove()
  try { localStorage.setItem(LS_DONE, '1') } catch (e) { /* storage may be off */ }
  audio.sfx.winPeal()
  audio.musicOut()
  renderer.flash('#9fffd0', 0.12)
  zarparBtn.classList.remove('show')
  leanL.classList.remove('show')
  leanR.classList.remove('show')
  const pct = stats.strokes ? Math.round((stats.onBeat / stats.strokes) * 100) : 0
  const tally = 'ánimas llevadas ' + game.delivered + ' · perdidas ' + game.lost +
    ' · remadas ' + stats.strokes + ' · al compás ' + pct + '% · ✦ seña guardada'
  setTimeout(() => {
    audio.voice('win')
    showEnd(
      'LA ÚLTIMA ORILLA', 'Seña del Caleuche',
      TEXTS.win + '<span class="tally">' + tally + '</span>',
      'REINTENTAR', () => restartAll()
    )
  }, 1700)
}

function lose() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'lost'
  titleCard.remove()
  audio.sfx.lose()
  audio.musicOut()
  zarparBtn.classList.remove('show')
  leanL.classList.remove('show')
  leanR.classList.remove('show')
  setTimeout(() => {
    audio.voice('lose')
    showEnd('EL ESTRECHO COBRÓ SU PARTE', 'Tres luces se apagaron', TEXTS.lose, 'REINTENTAR', () => restartAll())
  }, 900)
}

function restartAll() {
  if (endCard) {
    endCard.remove()
    endCard = null
  }
  game.phase = 'playing'
  game.lost = 0
  game.delivered = 0
  stats.strokes = 0
  stats.onBeat = 0
  stats.totalT = 0
  renderer.clearFx()
  setupTrip(1)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  speakIntro()
  titleCard.remove()
  game.phase = 'playing'
  toast(TRIP_TOASTS[0], true)
  hint.textContent = 'arrastra cada ánima a la cubierta — reparte el peso'
}

// --- title narration (plays on the FIRST gesture while the title card shows;
// every path is silent-safe when audio or files are missing) -------------------
let introSpoken = false
function speakIntro() {
  if (introSpoken) return
  introSpoken = true
  untapIntro()
  audio.voice('title')
}
function untapIntro() {
  window.removeEventListener('pointerdown', introTap, true)
  window.removeEventListener('keydown', introTap, true)
  window.removeEventListener('touchstart', introTap, true)
}
function introTap() {
  untapIntro()
  if (introSpoken || game.phase !== 'title') return
  try {
    audio.unlock()
    speakIntro()
  } catch (e) { /* narration is flavor */ }
}
try {
  audio.unlock()
  if (audio.state.running) speakIntro()
} catch (e) { /* the gesture taps cover it */ }
if (!introSpoken) {
  window.addEventListener('pointerdown', introTap, true)
  window.addEventListener('keydown', introTap, true)
  window.addEventListener('touchstart', introTap, true)
}

// --- hud ---------------------------------------------------------------------------
function updateHud() {
  tripSpan.innerHTML = 'viaje <b>' + ROMAN[game.trip - 1] + '</b>/iii — ánimas'
  let row = ''
  for (let i = 0; i < MAX_LOST; i++) {
    row += '<span class="candle' + (i < game.lost ? ' out' : '') + '">✦</span>'
  }
  candles.innerHTML = row
}

// --- input -------------------------------------------------------------------------
function canvasPos(e) {
  const k = canvas.width / window.innerWidth
  return [e.clientX * k, e.clientY * k]
}

function soulAt(px, py) {
  let pick = null
  let bestD = Infinity
  for (const s of game.souls) {
    if (s.state !== 'queue' && s.state !== 'board') continue
    const d = Math.hypot(px - s.sx, py - s.sy)
    if (d < s.sr * 1.4 && d < bestD) {
      bestD = d
      pick = s
    }
  }
  return pick
}

function deckXAt(px, py) {
  const L = renderer.getLayout()
  const dx = px - L.bx
  const dy = py - L.by
  const cs = Math.cos(L.ang)
  const sn = Math.sin(L.ang)
  const lx = dx * cs + dy * sn
  const ly = -dx * sn + dy * cs
  if (Math.abs(ly) > 110 * L.s || Math.abs(lx) > L.half * 1.2) return null
  return clamp(lx / (L.half * 0.9), -1.05, 1.05)
}

function dropSoul(cancel) {
  const d = game.drag
  const s = d.soul
  if (!s) return
  d.soul = null
  if (!cancel && d.slotX > -1.5) {
    s.state = 'board'
    s.x = d.slotX
    packQueue()
    audio.sfx.place()
    renderer.shake(0.8 + s.w * 0.5)
    const L = renderer.getLayout()
    renderer.splash(s.sx, L.waterY + 6 * L.s, 3, false)
  } else {
    const L = renderer.getLayout()
    const overDock = !cancel && d.px < L.dockEdge + 30 * L.s
    if (d.from === 'board' && !overDock) {
      s.state = 'board' // back to its old place
      audio.sfx.invalid()
    } else {
      s.state = 'queue'
      s.qi = 99
      packQueue()
      if (!cancel) audio.sfx.invalid()
    }
  }
  zarparCheck()
}

function zarparCheck() {
  const ok = game.phase === 'playing' && game.sub === 'loading' && queued() === 0 && !game.drag.soul
  zarparBtn.classList.toggle('show', ok)
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'playing') return
  e.preventDefault()
  const [px, py] = canvasPos(e)
  if (game.sub === 'loading' && !roll.on) {
    const s = soulAt(px, py)
    if (s) {
      game.drag.soul = s
      game.drag.from = s.state
      game.drag.px = px
      game.drag.py = py
      game.drag.slotX = -2
      s.state = 'drag'
      audio.sfx.pick()
      zarparCheck()
      return
    }
  }
  if (game.sub === 'rowing') {
    holdRow = true
    stroke(false)
  }
})
window.addEventListener('pointermove', (e) => {
  if (!game.drag.soul) return
  const [px, py] = canvasPos(e)
  game.drag.px = px
  game.drag.py = py
  const dx = deckXAt(px, py)
  game.drag.slotX = dx === null ? -2 : freeSlot(dx)
})
window.addEventListener('pointerup', () => {
  holdRow = false
  if (game.drag.soul) dropSoul(false)
})
window.addEventListener('pointercancel', () => {
  holdRow = false
  if (game.drag.soul) dropSoul(true)
})
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

zarparBtn.addEventListener('click', () => depart())
for (const [btn, v] of [[leanL, -1], [leanR, 1]]) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    lean.btn = v
    btn.classList.add('held')
  })
  const off = () => {
    if (lean.btn === v) lean.btn = 0
    btn.classList.remove('held')
  }
  btn.addEventListener('pointerup', off)
  btn.addEventListener('pointerleave', off)
  btn.addEventListener('pointercancel', off)
}

function keyEvent(code, down) {
  if (code === 'KeyA' || code === 'ArrowLeft') {
    lean.key = down ? -1 : lean.key === -1 ? 0 : lean.key
    leanL.classList.toggle('held', down && lean.key === -1)
  } else if (code === 'KeyD' || code === 'ArrowRight') {
    lean.key = down ? 1 : lean.key === 1 ? 0 : lean.key
    leanR.classList.toggle('held', down && lean.key === 1)
  } else if (code === 'KeyM' && down) {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  } else if ((code === 'Space' || code === 'Enter') && down) {
    if (game.phase === 'title') begin()
    else if (game.sub === 'loading' && queued() === 0 && !game.drag.soul) depart()
    else if (game.sub === 'rowing') {
      holdRow = true
      stroke(false)
    }
  } else if (code === 'Space' && !down) {
    holdRow = false
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  if (e.repeat) return
  keyEvent(e.code, true)
})
window.addEventListener('keyup', (e) => keyEvent(e.code, false))

// --- sim ---------------------------------------------------------------------------
function tiltPhysics(dt) {
  let tau = 0
  for (const s of game.souls) {
    if (s.state === 'board' || s.state === 'slide' || s.state === 'walk') tau += s.w * s.x
  }
  tau *= 1.05
  tau += game.lean * 1.5
  if (gust.phase === 'blow') {
    const env = Math.sin(Math.PI * clamp(gust.t / 1.9, 0, 1))
    tau += gust.dir * gust.power * 1.15 * env
  }
  const waveK = game.sub === 'rowing' ? 1 : 0.3
  tau += (0.05 * Math.sin(game.simT * 0.53) + 0.035 * Math.sin(game.simT * 1.27)) * waveK
  const acc = tau - 6.0 * game.tilt - 2.6 * game.tiltV
  game.tiltV += acc * dt
  game.tilt += game.tiltV * dt
}

function updateGust(dt) {
  if (game.sub !== 'rowing' || roll.on) return
  gust.t += dt
  if (gust.phase === 'idle') {
    gust.next -= dt
    if (gust.next <= 0) startGust(Math.random() < 0.5 ? -1 : 1)
  } else if (gust.phase === 'tele') {
    // the warning written on the water
    if (Math.random() < dt * 14) renderer.spawnGustStreak(gust.dir, gust.power)
    if (gust.t >= 1.4) {
      gust.phase = 'blow'
      gust.t = 0
      renderer.shake(1.0)
    }
  } else if (gust.phase === 'blow') {
    if (Math.random() < dt * 8) renderer.spawnGustStreak(gust.dir, gust.power)
    if (gust.t >= 1.9) {
      gust.phase = 'idle'
      gust.t = 0
      gust.next = GUST_GAP[game.trip - 1] * (0.7 + Math.random() * 0.6)
    }
  }
}

function updateRestless(dt) {
  if (game.sub !== 'rowing' || roll.on) return
  for (const s of game.souls) {
    if (!s.restless || s.state !== 'board') continue
    if (s.driftT >= 0) {
      // drifting toward the rail
      s.driftT += dt
      const k = ease(clamp(s.driftT / 1.6, 0, 1))
      s.x = s.driftFrom + (s.driftTo - s.driftFrom) * k
      s.standK = 1 - k * 0.4
      s.wailK = Math.max(0, s.wailK - dt * 1.2)
      if (s.driftT >= 1.6) {
        s.driftT = -1
        s.standK = 0
        s.restT = 6 + Math.random() * 3
      }
    } else {
      s.restT -= dt
      if (s.restT <= 1.2 && s.restT > 0 && s.wailK === 0) {
        s.wailK = 1
        audio.sfx.wail()
        renderer.popup(s.sx, s.sy - 26, 'se inquieta…', '#9fffd0')
      }
      if (s.restT <= 0) {
        s.driftT = 0
        s.driftFrom = s.x
        const dir = Math.abs(s.x) < 0.1 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(s.x)
        s.driftTo = clamp(s.x + dir * (0.28 + Math.random() * 0.12), -0.95, 0.95)
        s.standK = 0.2
      }
      if (s.wailK > 0 && s.driftT < 0) s.wailK = Math.min(1, s.wailK + dt)
    }
  }
}

function updateSlides(dt) {
  const L = renderer.getLayout()
  for (const s of game.souls) {
    if (s.state !== 'slide') continue
    s.slideT += dt
    if (s.slideT < 0) continue // staggered (roll)
    const dir = s.slideDir || 1
    s.x += dir * dt * (1.6 + s.slideT * 2)
    if (Math.abs(s.x) > 1.12) soulLost(s)
  }
  // spill check
  if (roll.on) return
  spillGrace -= dt
  const a = Math.abs(game.tilt)
  if (a > TILT_ROLL) startRoll(Math.sign(game.tilt))
  else if (a > TILT_SPILL && spillGrace <= 0) {
    if (!spillSoul(Math.sign(game.tilt))) spillGrace = 0.5
    else renderer.shake(2)
  }
}

function updateRoll(dt) {
  if (!roll.on) return
  roll.t += dt
  const t = roll.t
  if (t < 0.5) game.rollVis = roll.dir * 1.05 * ease(t / 0.5)
  else if (t < 1.0) game.rollVis = roll.dir * 1.05
  else if (t < 1.9) {
    const k = ease((t - 1.0) / 0.9)
    game.rollVis = roll.dir * 1.05 * (1 - k)
    game.tilt *= Math.max(0, 1 - dt * 6)
    game.tiltV = 0
  } else {
    roll.on = false
    game.rollVis = 0
    game.tilt = 0
    game.tiltV = 0
    gust.phase = 'idle'
    gust.next = 4 + Math.random() * 3
  }
}

function updateCeremony(dt) {
  if (game.sub !== 'arriving') return
  game.tilt *= Math.max(0, 1 - dt * 3)
  game.tiltV = 0
  let active = false
  const L = renderer.getLayout()
  for (const s of cere.order) {
    if (s.state === 'walk') {
      active = true
      s.cereT += dt
      const k = ease(clamp(s.cereT / 0.7, 0, 1))
      s.x = s.walkFrom + (1.0 - s.walkFrom) * k
      if (s.cereT >= 0.7) {
        s.state = 'plank'
        s.cereT = 0
        s.cereK = 0
      }
    } else if (s.state === 'plank') {
      active = true
      s.cereT += dt
      const prevK = s.cereK
      s.cereK = 0.82 * ease(clamp(s.cereT / 1.3, 0, 1))
      if (Math.floor(prevK / 0.14) !== Math.floor(s.cereK / 0.14)) audio.sfx.plankStep(game.delivered)
      if (s.cereT >= 1.3) {
        s.state = 'turn'
        s.cereT = 0
        s.face = -1 // looks back across the water
      }
    } else if (s.state === 'turn') {
      active = true
      s.cereT += dt
      if (s.cereT >= 0.35) {
        s.state = 'bow'
        s.cereT = 0
        audio.sfx.bow(game.delivered)
      }
    } else if (s.state === 'bow') {
      active = true
      s.cereT += dt / 0.8
      if (s.cereT >= 1) {
        s.state = 'fade'
        s.cereT = 0
        game.delivered++
        renderer.popup(s.sx, s.sy - 20 * L.s, '✦', '#9fffd0')
      }
    } else if (s.state === 'fade') {
      s.cereT += dt / 0.6
      if (s.cereT >= 1) s.state = 'gone'
      else active = true
    }
  }
  // launch the next soul when none is mid-walk/plank/turn/bow
  let pending = false
  for (const s of cere.order) if (s.state === 'board') pending = true
  let busy = false
  for (const s of cere.order) {
    if (s.state === 'walk' || s.state === 'plank' || s.state === 'turn' || s.state === 'bow') busy = true
  }
  if (!busy && pending) {
    cere.wait -= dt
    if (cere.wait <= 0) {
      for (const s of cere.order) {
        if (s.state === 'board') {
          s.state = 'walk'
          s.cereT = 0
          s.walkFrom = s.x
          cere.wait = 0.25
          break
        }
      }
    }
  } else if (!busy && !pending && !active) {
    cere.wait -= dt
    if (cere.wait <= -1.2) {
      if (game.trip >= 3) win()
      else {
        game.sub = 'returning'
        returnT = 0
        toast('la barca vuelve por los que faltan')
      }
    }
  }
}

function frame(dt) {
  dt = clamp(dt, 0.0001, 0.05)
  if (game.phase === 'playing') {
    game.simT += dt
    stats.totalT += dt
    game.strokeT = Math.max(0, game.strokeT - dt * 2.4)
    // ferryman lean (keys + buttons), eased
    const target = game.sub === 'rowing' ? clamp(lean.key + lean.btn, -1, 1) : 0
    game.lean += (target - game.lean) * Math.min(1, dt * 6)
    if (game.sub === 'loading' || game.sub === 'rowing') {
      if (!roll.on) tiltPhysics(dt)
      updateGust(dt)
      updateRestless(dt)
      updateSlides(dt)
      updateRoll(dt)
      audio.setCreak(clamp(Math.abs(game.tiltV) * 1.3 + (roll.on ? 0.5 : 0), 0, 1))
      if (game.sub === 'rowing' && !roll.on) {
        game.rowT += dt
        // the lantern breathes on the beat
        const ph = game.rowT % BEAT
        game.beatK = Math.pow(Math.max(0, Math.cos((ph / BEAT) * TAU)), 4)
        const bi = Math.floor(game.rowT / BEAT)
        if (bi !== lastBeatIdx) {
          lastBeatIdx = bi
          audio.sfx.beatTick()
          if (holdRow && game.rowT - lastStrokeAt > 0.6) stroke(true)
        }
        game.vel *= Math.exp(-1.05 * dt)
        game.prog += game.vel * dt
        if (game.prog >= 1) startArrival()
      } else if (game.sub === 'loading') {
        game.beatK = 0
        zarparCheck()
      }
    } else {
      audio.setCreak(0)
      game.beatK = 0
      if (game.sub === 'arriving') updateCeremony(dt)
      else if (game.sub === 'returning') {
        returnT += dt
        game.prog = 1 - ease(clamp(returnT / 2.2, 0, 1))
        if (returnT >= 2.4) setupTrip(game.trip + 1)
      }
    }
  } else {
    audio.setCreak(0)
  }
  audio.update(dt)
}

// --- loop -------------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
resize()
setupTrip(1)

let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  frame(dt)
  renderer.draw(game, dt)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api --------------------------------------------------------------------------------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(Math.min(dt, 0.05))
    renderer.draw(game, Math.min(dt, 0.05))
  },
  getState() {
    return {
      phase: game.phase,
      sub: game.sub,
      trip: game.trip,
      lost: game.lost,
      delivered: game.delivered,
      aboard: aboard(),
      queued: queued(),
      tilt: game.tilt,
      tiltMax: TILT_SPILL,
      progress: game.prog,
      vel: game.vel,
      strokes: stats.strokes,
      onBeatStrokes: stats.onBeat,
      beatPhase: game.rowT % BEAT,
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  loadSoul(i, x) {
    if (game.sub !== 'loading') return false
    const q = game.souls.filter((s) => s.state === 'queue')
    const s = q[i | 0]
    if (!s) return false
    s.state = 'board'
    s.x = clamp(typeof x === 'number' ? x : 0, -0.92, 0.92)
    packQueue()
    zarparCheck()
    return true
  },
  souls: () => game.souls.map((s) => ({ kind: s.kind, state: s.state, x: s.x, w: s.w, restless: s.restless })),
  depart,
  tilt: () => game.tilt,
  lean(v) {
    lean.key = clamp(v, -1, 1)
  },
  strokeNow: () => stroke(false),
  gustNow(dir) {
    if (game.sub === 'rowing') startGust(dir < 0 ? -1 : 1)
  },
  setProgress(p) {
    if (game.sub === 'rowing') game.prog = clamp(p, 0, 1)
  },
  capsizeNow: () => startRoll(game.tilt >= 0 ? 1 : -1),
  setTrip(n) {
    if (endCard) {
      endCard.remove()
      endCard = null
    }
    if (game.phase === 'title') titleCard.remove()
    game.phase = 'playing'
    setupTrip(n)
  },
  lostSouls: () => game.lost,
  pressKey(code, down = true) { keyEvent(code, down) },
}
