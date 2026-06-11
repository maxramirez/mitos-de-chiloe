// ============================================================================
// EL BASILISCO — La noche del huevo · Mitos de Chiloé
// Top-down defense, 2D canvas. You are the eldest child awake in a palafito;
// the basilisco under the floor surfaces from cracks to drink sleepers'
// breath. Shoo it, board cracks, feed the braziers, follow its squeals to the
// egg tile and crush the egg before dawn (150 s) — lose 2 sleepers and the
// house is lost.
//
// TEST API — window.__game (the sim is a pure frame(dt), driven by both rAF
// and manual stepping; rAF is throttled in hidden tabs):
//   begin()                  — same as clicking BEGIN (unlocks audio, starts)
//   step(dt=1/60, steps=1)   — advance the sim deterministically, then draw once
//   getState()               — { phase:'title'|'playing'|'won'|'lost', timeLeft,
//                               sleepersLost, planks, wood, braziers:[f0,f1],
//                               dark, bas, telegraphCrack, eggRevealed,
//                               tilesOpened, player:[x,y], stun, muted, reason }
//   forceWin()               — runs the real win handler (incl. localStorage
//                               'chiloe-basilisco-done' = '1')
//   forceLose()              — runs the real lose handler
//   eggTile()                — index 0..5 of the tile hiding the egg
//   surfaceNow(at?)          — basilisco surfaces immediately at crack index
//                               `at` (default: random unboarded crack)
//   shooNow()                — force the flee+squeal handler (as if shooed)
//   setPlanks(n), setWood(n) — set inventory
//   setBraziers(f0, f1)      — set brazier fuel 0..1 (0,0 → dark house)
//   sleepersLost()           — count of sleepers fully drained
//   setTimer(s)              — set remaining night seconds
//   pos() / setPos(x, y)     — player position (collision still applies)
//   teleportTile(i)          — stand the player on suspect tile i
//   holdSpace(v) / pressKey(code, down) — drive input for pry/crush tests
// ============================================================================

import {
  W, H, MIDX, CRACKS, TILES, SLEEPERS, BRAZIERS,
  collidePlayer, nextWaypoint, tileAt,
} from './world.js'
import { createRenderer } from './render.js'
import { createAudio } from './audio.js'

const NIGHT = 150
const BRAZIER_BURN = 1 / 65 // full brazier burns out in ~65 s
const DRINK_TIME = 8
const PRY_TIME = 3
const STUN_TIME = 4
const SHOO_RANGE = 56

// --- dom -------------------------------------------------------------------
const canvas = document.getElementById('game')
const ui = document.getElementById('ui')
const vignette = document.createElement('div')
vignette.className = 'vignette'
document.body.appendChild(vignette)

function el(tag, cls, html, parent) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  ;(parent || ui).appendChild(e)
  return e
}

const hud = el('div', '', '', ui)
hud.id = 'hud'
hud.innerHTML =
  '<span>noche <b id="h-time">2:30</b></span>' +
  '<span>tablas <b id="h-planks">5</b></span>' +
  '<span>leña <b id="h-wood">6</b></span>' +
  '<span>braseros <b id="h-fire" class="lit">✶ ✶</b></span>' +
  '<span>alientos <b id="h-breath">✦ ✦ ✦</b></span>'
const hTime = hud.querySelector('#h-time')
const hPlanks = hud.querySelector('#h-planks')
const hWood = hud.querySelector('#h-wood')
const hFire = hud.querySelector('#h-fire')
const hBreath = hud.querySelector('#h-breath')
const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', 'wasd mover · space espantar / abrir tabla · e clavar · r leña · m silencio', ui)
hint.id = 'hint'

let toastTimer = null
function toast(msg, long) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), long ? 4200 : 2400)
}

// --- overlays ----------------------------------------------------------------
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
  'EL BASILISCO',
  'La noche del huevo',
  'When a hen grows old and crows like a rooster, she lays one misshapen egg — and something coils inside it. Hatched in secret beneath the floorboards of the palafito, <i>el basilisco</i> climbs up through the cracks at night to drink the breath of the sleeping, <i>el aliento</i>, until the house goes thin and quiet. You are the eldest child, the only one awake: keep the braziers fed, board the cracks, and listen when it squeals — it always cries toward its egg.',
  'WASD move &nbsp;·&nbsp; SPACE shoo / hold 3&thinsp;s on a loose tile to pry &nbsp;·&nbsp; E board a crack &nbsp;·&nbsp; R feed a brazier &nbsp;·&nbsp; M mute',
  'BEGIN',
  () => begin()
)

let endCard = null
function showEnd(title, epithet, body, btn) {
  if (endCard) endCard.remove()
  endCard = card(title, epithet, body, '', btn, () => location.reload())
}

// --- state -------------------------------------------------------------------
const renderer = createRenderer(canvas)
const audio = createAudio()

const player = { x: 380, y: 240, stun: 0, holdT: 0, holdKind: null, holdTile: -1 }
const POS = { x: 0, y: 0 } // shared collision scratch

const TRAIL_N = 14
const bas = {
  state: 'hidden', // hidden | telegraph | surfaced | drinking | fleeing
  visible: false,
  x: 0, y: 0, heading: 0,
  trail: new Float32Array(TRAIL_N * 2),
  trailN: TRAIL_N,
  targetSleeper: -1,
  fleeCrack: -1,
  cooldown: 8,
}
const telegraph = { active: false, crack: -1, t: 0 }

const game = {
  phase: 'title', // title | playing | won | lost
  reason: '',
  timeLeft: NIGHT,
  planks: 5,
  wood: 6,
  braziers: [1, 1],
  dark: false,
  eggTile: Math.floor(Math.random() * TILES.length),
  eggRevealed: false,
  cracks: CRACKS.map(() => ({ boarded: false })),
  tiles: TILES.map(() => ({ opened: false, empty: false })),
  sleepers: SLEEPERS.map(() => ({ drain: 0, lost: false })),
  player,
  bas,
  telegraph,
}

const input = { up: 0, down: 0, left: 0, right: 0, space: false }
let dustAcc = 0
let hissAcc = 0
let pryAcc = 0
let firstSurface = true

function sleepersLostCount() {
  let n = 0
  for (let i = 0; i < game.sleepers.length; i++) if (game.sleepers[i].lost) n++
  return n
}

function surfaceInterval() {
  const p = 1 - game.timeLeft / NIGHT
  const base = 10 - 5 * p // 10 s → 5 s across the night
  const jitter = (Math.random() * 2 - 1) * (2 - 1.5 * p)
  return Math.max(4.5, base + jitter)
}

function livingSleeperNearest(x, y) {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < SLEEPERS.length; i++) {
    if (game.sleepers[i].lost) continue
    const d = Math.hypot(SLEEPERS[i].x - x, SLEEPERS[i].y - y)
    if (d < bd) { bd = d; best = i }
  }
  return best
}

function nearestCrack(x, y, needOpen) {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < CRACKS.length; i++) {
    if (needOpen && game.cracks[i].boarded) continue
    const d = Math.hypot(CRACKS[i].x - x, CRACKS[i].y - y)
    if (d < bd) { bd = d; best = i }
  }
  return best
}

function resetTrail(x, y) {
  for (let i = 0; i < TRAIL_N; i++) {
    bas.trail[i * 2] = x
    bas.trail[i * 2 + 1] = y
  }
}

function startTelegraph(crackIdx) {
  telegraph.active = true
  telegraph.crack = crackIdx
  telegraph.t = 1.2
  audio.sfx.rattle()
}

function surfaceAt(crackIdx) {
  telegraph.active = false
  bas.state = 'surfaced'
  bas.visible = true
  bas.x = CRACKS[crackIdx].x
  bas.y = CRACKS[crackIdx].y
  resetTrail(bas.x, bas.y)
  bas.targetSleeper = livingSleeperNearest(bas.x, bas.y)
  audio.sfx.surface()
  renderer.burst(bas.x, bas.y, '#8a7350', 14, 70, 0.7, 2)
  renderer.shake(2)
}

function flee(squeal) {
  if (bas.state !== 'surfaced' && bas.state !== 'drinking') return
  bas.state = 'fleeing'
  bas.fleeCrack = nearestCrack(bas.x, bas.y, true)
  bas.willSqueal = squeal
}

function dive() {
  const c = CRACKS[bas.fleeCrack]
  renderer.burst(c.x, c.y, '#8a7350', 12, 60, 0.6, 2)
  if (bas.willSqueal !== false) {
    const egg = TILES[game.eggTile]
    const dir = Math.atan2(egg.y - c.y, egg.x - c.x) + (Math.random() * 0.24 - 0.12)
    renderer.ripple(c.x, c.y, dir)
    audio.sfx.squeal()
    audio.sfx.warble()
  }
  bas.state = 'hidden'
  bas.visible = false
  bas.targetSleeper = -1
  bas.cooldown = surfaceInterval()
}

function loseSleeper(i) {
  game.sleepers[i].lost = true
  audio.sfx.breathLost()
  renderer.shake(7)
  renderer.pulse('#c05540')
  toast(SLEEPERS[i].name + ' ya no respira — su aliento se fue', true)
  if (sleepersLostCount() >= 2) {
    lose('sleepers')
  } else {
    flee(true)
  }
}

function win() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'won'
  game.reason = 'egg'
  titleCard.remove()
  localStorage.setItem('chiloe-basilisco-done', '1')
  audio.sfx.crush()
  audio.sfx.win()
  renderer.shake(8)
  renderer.pulse('#9fffd0')
  const egg = TILES[game.eggTile]
  renderer.burst(egg.x, egg.y, '#ded8c2', 26, 120, 1.1, 2.5)
  renderer.burst(egg.x, egg.y, '#9fffd0', 16, 80, 1.4, 2)
  setTimeout(() => {
    showEnd(
      'EL HUEVO ROTO',
      'Amaneció',
      'The shell bursts like wet ash under your heel. Beneath the boards something thrashes once, twice — and then the sea under the stilts is only the sea. At dawn the braziers gutter out on their own, and the family wakes, breathing. <i>Seña</i> earned: the island remembers who kept the fire.',
      'OTRA NOCHE'
    )
  }, 1100)
}

function lose(reason) {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'lost'
  game.reason = reason
  titleCard.remove()
  audio.sfx.lose()
  renderer.shake(5)
  const texts = {
    sleepers: [
      'LA CASA CALLA',
      'Dos alientos perdidos',
      'Two breaths taken, and the silence under the floor is fatter now. The basilisco drank deep while the braziers hissed in the rain. In Chiloé there is only one cure left for a house like this: they will burn it down to the stilts.',
    ],
    dawn: [
      'EL ALBA',
      'La noche no alcanzó',
      'Dawn comes grey through the rain and the egg still lies warm beneath the boards. Tonight it learned the shape of every room — tomorrow it will be faster. Find the egg next time: its squeal always points home.',
    ],
  }
  const t = texts[reason] || texts.dawn
  setTimeout(() => showEnd(t[0], t[1], t[2], 'OTRA NOCHE'), 900)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  titleCard.remove()
  game.phase = 'playing'
  bas.cooldown = firstSurface ? 6 : surfaceInterval()
  toast('la marea sube — no despiertes a nadie')
}

// --- actions -------------------------------------------------------------------
function tryShoo() {
  if (bas.state !== 'surfaced' && bas.state !== 'drinking') return false
  const d = Math.hypot(player.x - bas.x, player.y - bas.y)
  if (d > SHOO_RANGE) return false
  audio.sfx.shoo()
  renderer.burst(bas.x, bas.y, '#e8dcc0', 8, 90, 0.5, 1.5)
  renderer.shake(1.5)
  flee(true)
  return true
}

function startHold() {
  const i = tileAt(player.x, player.y)
  if (i < 0) return
  const st = game.tiles[i]
  if (!st.opened) {
    player.holdKind = 'pry'
    player.holdTile = i
    player.holdT = 0.0001
  } else if (!st.empty && i === game.eggTile && game.eggRevealed) {
    player.holdKind = 'crush'
    player.holdTile = i
    player.holdT = 0.0001
  }
}

function resolveHold() {
  const i = player.holdTile
  player.holdT = 0
  const kind = player.holdKind
  player.holdKind = null
  if (kind === 'pry') {
    game.tiles[i].opened = true
    if (i === game.eggTile) {
      game.eggRevealed = true
      audio.sfx.eggReveal()
      renderer.pulse('#9fffd0')
      renderer.burst(TILES[i].x, TILES[i].y, '#9fffd0', 12, 60, 1, 2)
      toast('¡el huevo! — hold SPACE on it to crush it', true)
    } else {
      game.tiles[i].empty = true
      audio.sfx.splinter()
      renderer.burst(TILES[i].x, TILES[i].y, '#8a7350', 16, 110, 0.8, 2)
      player.stun = STUN_TIME
      toast('astillas — nothing under this one')
    }
  } else if (kind === 'crush') {
    win()
  }
}

function boardCrack() {
  if (game.planks <= 0) { toast('no quedan tablas'); return }
  const i = nearestCrack(player.x, player.y, true)
  if (i < 0) return
  const c = CRACKS[i]
  if (Math.hypot(c.x - player.x, c.y - player.y) > 44) return
  game.cracks[i].boarded = true
  game.planks--
  audio.sfx.hammer()
  renderer.burst(c.x, c.y, '#e8dcc0', 10, 80, 0.5, 1.5)
  if (telegraph.active && telegraph.crack === i) telegraph.active = false
  if (bas.state === 'fleeing' && bas.fleeCrack === i) bas.fleeCrack = nearestCrack(bas.x, bas.y, true)
}

function feedBrazier() {
  if (game.wood <= 0) { toast('no queda leña'); return }
  for (let i = 0; i < BRAZIERS.length; i++) {
    const b = BRAZIERS[i]
    if (Math.hypot(b.x - player.x, b.y - player.y) < 52) {
      if (game.braziers[i] > 0.9) return
      game.braziers[i] = 1
      game.wood--
      audio.sfx.feed()
      renderer.burst(b.x, b.y - 4, '#ffb070', 12, 60, 0.8, 2)
      return
    }
  }
}

// --- sim: pure frame(dt) ----------------------------------------------------------
function frame(dt) {
  if (game.phase !== 'playing') {
    renderer.update(dt * 0.5) // let fx settle behind end cards; sim itself is paused
    return
  }

  game.timeLeft -= dt
  if (game.timeLeft <= 0) { game.timeLeft = 0; lose('dawn'); return }

  // braziers
  for (let i = 0; i < 2; i++) {
    if (game.braziers[i] > 0) {
      game.braziers[i] -= BRAZIER_BURN * dt
      if (game.braziers[i] <= 0) {
        game.braziers[i] = 0
        toast(i === 0 ? 'el brasero de la cocina se apaga' : 'el brasero del fondo se apaga')
      }
    }
  }
  const wasDark = game.dark
  game.dark = game.braziers[0] <= 0 && game.braziers[1] <= 0
  if (game.dark && !wasDark) toast('oscuridad — you can no longer see the cracks rattle', true)

  // player
  if (player.stun > 0) player.stun = Math.max(0, player.stun - dt)
  const holding = player.holdKind !== null && input.space
  if (player.stun <= 0 && !holding) {
    const mx = input.right - input.left
    const my = input.down - input.up
    if (mx !== 0 || my !== 0) {
      const inv = 175 / Math.hypot(mx, my)
      POS.x = player.x + mx * inv * dt
      POS.y = player.y + my * inv * dt
      collidePlayer(POS, 11)
      player.x = POS.x
      player.y = POS.y
      if (player.holdT > 0) { player.holdT = 0; player.holdKind = null } // moving abandons a pry
    }
  }

  // hold-to-pry / crush
  if (player.holdKind && input.space && player.stun <= 0) {
    player.holdT += dt
    pryAcc += dt
    if (pryAcc > 0.35) { pryAcc = 0; audio.sfx.pryTick() }
    if (player.holdT >= PRY_TIME) resolveHold()
  } else if (player.holdT > 0 && !input.space) {
    player.holdT = 0
    player.holdKind = null
  }

  // basilisco state machine
  if (bas.state === 'hidden') {
    bas.cooldown -= dt
    if (bas.cooldown <= 0) {
      // random unboarded crack (5 planks vs 8 cracks: one always remains)
      let i = Math.floor(Math.random() * CRACKS.length)
      for (let k = 0; k < CRACKS.length; k++) {
        const j = (i + k) % CRACKS.length
        if (!game.cracks[j].boarded) { i = j; break }
      }
      if (!game.cracks[i].boarded) startTelegraph(i)
      else bas.cooldown = 2
      firstSurface = false
    }
  } else if (bas.state === 'fleeing') {
    if (bas.fleeCrack < 0) bas.fleeCrack = nearestCrack(bas.x, bas.y, true)
    const c = CRACKS[bas.fleeCrack]
    const wp = nextWaypoint(bas.x, bas.y, c.x, c.y)
    moveBas(wp.x, wp.y, 235, dt)
    if (Math.hypot(bas.x - c.x, bas.y - c.y) < 10) dive()
  } else if (bas.state === 'surfaced') {
    if (bas.targetSleeper < 0 || game.sleepers[bas.targetSleeper].lost) {
      bas.targetSleeper = livingSleeperNearest(bas.x, bas.y)
    }
    if (bas.targetSleeper >= 0) {
      const sl = SLEEPERS[bas.targetSleeper]
      const wp = nextWaypoint(bas.x, bas.y, sl.x, sl.y)
      const p = 1 - game.timeLeft / NIGHT
      moveBas(wp.x, wp.y, 130 + 55 * p, dt)
      if (Math.hypot(bas.x - sl.x, bas.y - sl.y) < 26) bas.state = 'drinking'
    }
  } else if (bas.state === 'drinking') {
    const si = bas.targetSleeper
    if (si < 0 || game.sleepers[si].lost) {
      bas.state = 'surfaced'
    } else {
      const st = game.sleepers[si]
      st.drain += dt
      hissAcc += dt
      if (hissAcc > 0.4) { hissAcc = 0; audio.sfx.hissLoopTick() }
      shiftTrail(dt) // body keeps settling
      if (st.drain >= DRINK_TIME) loseSleeper(si)
    }
  }

  // telegraph
  if (telegraph.active) {
    telegraph.t -= dt
    dustAcc += dt
    if (dustAcc > 0.2) {
      dustAcc = 0
      const c = CRACKS[telegraph.crack]
      const show = !game.dark || Math.hypot(c.x - player.x, c.y - player.y) < 95
      if (show) renderer.burst(c.x, c.y - 2, '#6a5a40', 3, 30, 0.6, 1.5)
    }
    if (telegraph.t <= 0) {
      if (game.cracks[telegraph.crack].boarded) {
        telegraph.active = false
        bas.state = 'hidden'
        bas.cooldown = 1.5 // thwarted — it tries again soon
      } else {
        surfaceAt(telegraph.crack)
      }
    }
  }

  // sleeper recovery while not being drunk
  for (let i = 0; i < game.sleepers.length; i++) {
    const st = game.sleepers[i]
    if (!st.lost && st.drain > 0 && !(bas.state === 'drinking' && bas.targetSleeper === i)) {
      st.drain = Math.max(0, st.drain - 0.2 * dt)
    }
  }

  // audio beds
  const tension =
    bas.state === 'drinking' ? 1 : bas.state === 'surfaced' || bas.state === 'fleeing' ? 0.7 : telegraph.active ? 0.4 : 0
  audio.update(dt, 1, tension, Math.max(game.braziers[0], game.braziers[1]))

  renderer.update(dt)
  updateHud()
}

function moveBas(tx, ty, speed, dt) {
  const dx = tx - bas.x
  const dy = ty - bas.y
  const d = Math.hypot(dx, dy)
  if (d > 0.001) {
    const step = Math.min(speed * dt, d)
    bas.x += (dx / d) * step
    bas.y += (dy / d) * step
    bas.heading = Math.atan2(dy, dx)
  }
  shiftTrail(dt)
}

function shiftTrail(dt) {
  const tr = bas.trail
  tr[0] = bas.x
  tr[1] = bas.y
  const k = Math.min(1, 14 * dt)
  for (let i = 1; i < TRAIL_N; i++) {
    // each segment eases toward the one ahead, with a slither wave
    const wob = Math.sin(perfTime * 9 + i * 1.2) * 1.1
    tr[i * 2] += (tr[(i - 1) * 2] - tr[i * 2]) * k
    tr[i * 2 + 1] += (tr[(i - 1) * 2 + 1] - tr[i * 2 + 1]) * k + wob * dt * 10
  }
}

// --- hud -----------------------------------------------------------------------
let lastSec = -1
let lastPlanks = -1
let lastWood = -1
let lastFire = ''
let lastBreath = -1
const BREATH_STR = ['', '✦', '✦ ✦', '✦ ✦ ✦']
function updateHud() {
  const sec = Math.ceil(game.timeLeft)
  if (sec !== lastSec) {
    lastSec = sec
    const m = Math.floor(sec / 60)
    const s = sec % 60
    hTime.textContent = m + ':' + (s < 10 ? '0' : '') + s
  }
  if (game.planks !== lastPlanks) { lastPlanks = game.planks; hPlanks.textContent = String(game.planks) }
  if (game.wood !== lastWood) { lastWood = game.wood; hWood.textContent = String(game.wood) }
  const fire = (game.braziers[0] > 0 ? '✶' : '·') + ' ' + (game.braziers[1] > 0 ? '✶' : '·')
  if (fire !== lastFire) {
    lastFire = fire
    hFire.textContent = fire
    hFire.className = game.dark ? 'dead' : 'lit'
  }
  const alive = 3 - sleepersLostCount()
  if (alive !== lastBreath) { lastBreath = alive; hBreath.textContent = BREATH_STR[alive] }
}

// --- input -----------------------------------------------------------------------
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
}
function keyEvent(code, down, repeat) {
  const dir = KEYMAP[code]
  if (dir) { input[dir] = down ? 1 : 0; return }
  if (code === 'Space') {
    if (down && !repeat && game.phase === 'playing' && player.stun <= 0) {
      if (!tryShoo()) startHold()
    }
    input.space = down
    if (!down && player.holdT > 0 && player.holdT < PRY_TIME) { player.holdT = 0; player.holdKind = null }
  } else if (code === 'KeyE' && down && game.phase === 'playing' && player.stun <= 0) {
    boardCrack()
  } else if (code === 'KeyR' && down && game.phase === 'playing' && player.stun <= 0) {
    feedBrazier()
  } else if (code === 'KeyM' && down) {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  keyEvent(e.code, true, e.repeat)
})
window.addEventListener('keyup', (e) => keyEvent(e.code, false, false))

// --- loop ------------------------------------------------------------------------
function resize() {
  canvas.width = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2)
  canvas.height = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)
}
window.addEventListener('resize', resize)
resize()

let perfTime = 0
let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  perfTime += dt
  frame(dt)
  renderer.draw(game)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api ----------------------------------------------------------------------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) {
      perfTime += dt
      frame(Math.min(dt, 0.05))
    }
    renderer.draw(game)
  },
  getState() {
    return {
      phase: game.phase,
      reason: game.reason,
      timeLeft: game.timeLeft,
      sleepersLost: sleepersLostCount(),
      planks: game.planks,
      wood: game.wood,
      braziers: [game.braziers[0], game.braziers[1]],
      dark: game.dark,
      bas: bas.state,
      basPos: [bas.x, bas.y],
      telegraphCrack: telegraph.active ? telegraph.crack : -1,
      eggRevealed: game.eggRevealed,
      tilesOpened: game.tiles.filter((t) => t.opened).length,
      player: [player.x, player.y],
      stun: player.stun,
      holdT: player.holdT,
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose('sleepers'),
  eggTile: () => game.eggTile,
  surfaceNow(at) {
    let i = typeof at === 'number' && at >= 0 && at < CRACKS.length ? at : nearestCrack(Math.random() * W, Math.random() * H, true)
    if (i < 0 || game.cracks[i].boarded) i = nearestCrack(MIDX, 300, true)
    if (i >= 0) surfaceAt(i)
    return i
  },
  shooNow: () => flee(true),
  setPlanks(n) { game.planks = n },
  setWood(n) { game.wood = n },
  setBraziers(f0, f1) { game.braziers[0] = f0; game.braziers[1] = f1 },
  sleepersLost: sleepersLostCount,
  setTimer(s) { game.timeLeft = s },
  pos: () => [player.x, player.y],
  setPos(x, y) {
    POS.x = x
    POS.y = y
    collidePlayer(POS, 11)
    player.x = POS.x
    player.y = POS.y
  },
  teleportTile(i) {
    const t = TILES[i]
    if (t) { player.x = t.x; player.y = t.y }
  },
  holdSpace(v = true) { keyEvent('Space', v, false) },
  pressKey(code, down = true) { keyEvent(code, down, false) },
}
