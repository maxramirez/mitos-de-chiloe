// ============================================================================
// EL PIUCHÉN — La majada · Mitos de Chiloé
// Fixed-screen arcade shooter, 2D canvas. The winged serpent of the
// archipelago circles the night sky as a near-invisible silhouette, flashes
// its green eyes, and dives to drain the flock huddled in the fold. You are
// the shepherd: mouse to aim, click / SPACE to sling stones (arc + travel
// time, 0.45 s cooldown, max 3 airborne). A hit mid-dive knocks him out of
// the swoop; if he latches, hitting him during the 3 s drain saves the sheep
// 'mareada'. Lose 3 sheep and the night is lost; survive 5 waves (~40 s
// each, dawn meter on top) and la majada amanece completa.
//
// TEST API — window.__game (sim is a pure frame(dt), driven by both rAF and
// manual stepping; rAF is throttled in hidden tabs):
//   begin()                 — same as clicking BEGIN (unlocks audio, starts)
//   step(dt=1/60, steps=1)  — advance the sim deterministically, then draw once
//   getState()              — { phase:'title'|'playing'|'won'|'lost', reason,
//                               wave, elapsed, dawn, score, combo, bestCombo,
//                               shots, hits, accuracy, sheepAlive, sheepGone,
//                               sheepMareada, piuchen, piuchenPos:[x,y],
//                               target, drainT, stonesAir, cooldown, hitStop,
//                               muted }
//   forceWin()              — runs the real win handler (incl. localStorage
//                               'chiloe-piuchen-done' = '1')
//   forceLose()             — runs the real lose handler
//   wave()                  — current wave 1..5
//   setWave(n)              — jump to wave n (sets elapsed to the wave start)
//   diveNow(target?)        — start a real dive immediately at sheep index
//                               `target` (default: a random living sheep);
//                               releases any current latch ('mareada');
//                               returns the target index, or -1
//   latchNow(target?)       — skip straight to the 3 s drain on a sheep;
//                               returns the target index, or -1
//   sheep()                 — { alive, gone, mareada, states:[8 strings] }
//   setSheep(n)             — leave exactly the first n sheep alive, rest
//                               'gone'; the gone>=3 lose-guard fires on the
//                               next step
//   hitNow()                — run the real stone-hit handler at the piuchén
//                               (counts as 1 shot + 1 hit; saves the sheep if
//                               he is latched, else knocks him into retreat)
//   score()                 — current score
//   fireAt(x, y)            — sling a stone at world coords, bypassing the
//                               cooldown and the 3-stone cap (test only)
//   aimAt(x, y)             — move the aim reticle to world coords
//   setElapsed(s)           — set night-elapsed seconds (drives wave + dawn)
//   setCombo(n)             — set the current combo streak
//   pressKey(code, down=true) — drive keyboard input ('Space', 'KeyM')
// ============================================================================

import { createRenderer, W, H, GROUND } from './render.js'
import { createAudio } from './audio.js'

const WAVES = 5
const WAVE_T = 40
const TOTAL = WAVES * WAVE_T // 200 s of night
const COOLDOWN = 0.45
const MAX_STONES = 3
const DRAIN = 3
const HITSTOP = 0.04
const GRAV = 540
const SLING_X = 480
const SLING_Y = 428
const HIT_R = 26 // head
const BODY_R = 19 // body sample points
const NEAR_R = 48

// wave ramp: dive duration, telegraph time, gap between dives, feint chance,
// chain = double-dip after a feint, quick = two consecutive fast dives (w4-5)
const WAVE_CFG = [
  { dive: 1.65, tele: 0.95, gapMin: 4.2, gapMax: 6.0, feint: 0.0, chain: 0.0, quick: 0.0 },
  { dive: 1.45, tele: 0.85, gapMin: 3.8, gapMax: 5.2, feint: 0.15, chain: 0.0, quick: 0.0 },
  { dive: 1.3, tele: 0.75, gapMin: 3.2, gapMax: 4.6, feint: 0.25, chain: 0.25, quick: 0.0 },
  { dive: 1.15, tele: 0.65, gapMin: 2.8, gapMax: 4.2, feint: 0.3, chain: 0.4, quick: 0.3 },
  { dive: 1.0, tele: 0.55, gapMin: 2.4, gapMax: 3.6, feint: 0.35, chain: 0.5, quick: 0.45 },
]
const HIT_POP = ['+100', '+200', '+300', '+400', '+500']
const SAVE_POP = ['+250 ¡salvada!', '+350 ¡salvada!', '+450 ¡salvada!', '+550 ¡salvada!', '+650 ¡salvada!']
const WAVE_MSG = [
  'oleada ii — vuela más bajo, más rápido',
  'oleada iii — a veces finge el picado',
  'oleada iv — dos picados seguidos',
  'oleada v — la última oscuridad antes del alba',
]

// --- dom -----------------------------------------------------------------------
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

const dawnBar = el('div', '', '', ui)
dawnBar.id = 'dawn'
const dawnFill = el('div', '', '', dawnBar)
dawnFill.id = 'dawn-fill'
for (let i = 1; i < WAVES; i++) {
  const t = el('div', 'dawn-tick', '', dawnBar)
  t.style.left = i * 20 + '%'
}

const hud = el('div', '', '', ui)
hud.id = 'hud'
hud.innerHTML =
  '<span>oleada <b id="h-wave">1/5</b></span>' +
  '<span>puntos <b id="h-score">0</b></span>' +
  '<span>racha <b id="h-combo">—</b></span>' +
  '<span>majada <b id="h-sheep">● ● ● ● ● ● ● ●</b></span>'
const hWave = hud.querySelector('#h-wave')
const hScore = hud.querySelector('#h-score')
const hCombo = hud.querySelector('#h-combo')
const hSheep = hud.querySelector('#h-sheep')

const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', 'MOUSE apuntar · CLIC / ESPACIO lanzar la piedra · M sonido', ui)
hint.id = 'hint'

let toastTimer = null
function toast(msg, long) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), long ? 4200 : 2400)
}

// --- overlays ---------------------------------------------------------------------
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
  'EL PIUCHÉN',
  'La majada',
  'En las noches quietas del archipiélago un silbido seco cruza las estrellas: es <i>el Piuchén</i>, la serpiente alada que nadie ve dos veces, rondando hambrienta sobre los corrales. Donde se posa, al alba aparece una oveja pálida y vacía, <i>sin una gota de sangre</i>. Esta noche el pastor del cerro eres tú — solo tu ojo y tu honda se interponen entre la serpiente y <i>la majada</i> apretada contra las piedras. Vigila lo oscuro: sus ojos relampaguean en verde un instante antes del picado.',
  'MOUSE apuntar &nbsp;·&nbsp; CLIC / ESPACIO lanzar la piedra (máx. 3 en el aire) &nbsp;·&nbsp; M sonido',
  'COMENZAR',
  () => begin()
)

let endCard = null
function showEnd(title, epithet, body, btn) {
  if (endCard) endCard.remove()
  endCard = card(title, epithet, body, '', btn, () => location.reload())
}

// --- state ------------------------------------------------------------------------
const renderer = createRenderer(canvas)
const audio = createAudio()

const SHEEP_SPOTS = [
  [398, 512], [448, 503], [502, 505], [552, 513],
  [420, 535], [472, 541], [524, 537], [572, 529],
]
const sheep = []
for (let i = 0; i < SHEEP_SPOTS.length; i++) {
  sheep.push({
    x: SHEEP_SPOTS[i][0], y: SHEEP_SPOTS[i][1],
    baseX: SHEEP_SPOTS[i][0], baseY: SHEEP_SPOTS[i][1],
    tx: SHEEP_SPOTS[i][0], ty: SHEEP_SPOTS[i][1],
    ph: Math.random() * 6.283,
    shuffleT: 1 + Math.random() * 4,
    state: 'ok', // ok | mareada | draining | gone
  })
}

const TRAIL_N = 12
const pu = {
  state: 'circling', // circling | telegraph | diving | pullup | latched | retreat
  x: W / 2, y: 150, heading: 0,
  trail: new Float32Array(TRAIL_N * 2), trailN: TRAIL_N,
  nextDive: 3.2, teleT: 0, target: -1,
  p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 0, p2y: 0, side: 1,
  diveT: 0, diveDur: 1.5, feintAt: 0,
  drainT: 0, drainMax: DRAIN,
  rx: 0, ry: -90,
}

const stones = []
for (let i = 0; i < MAX_STONES; i++) {
  stones.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, near: false })
}

const input = { mx: 480, my: 220 }

const game = {
  phase: 'title', // title | playing | won | lost
  reason: '',
  elapsed: 0, wave: 1, dawn: 0,
  score: 0, combo: 0, bestCombo: 0, shots: 0, hits: 0,
  cooldown: 0, hitStop: 0,
  sheep, pu, stones, input,
}

let simTime = 0
let drainAcc = 0
let firstLatch = true
let firstFeint = true
let firstSave = true

function resetTrail(x, y) {
  for (let i = 0; i < TRAIL_N; i++) {
    pu.trail[i * 2] = x
    pu.trail[i * 2 + 1] = y
  }
}
resetTrail(pu.x, pu.y)

function shiftTrail(dt) {
  const tr = pu.trail
  tr[0] = pu.x
  tr[1] = pu.y
  const k = Math.min(1, 16 * dt)
  for (let i = 1; i < TRAIL_N; i++) {
    const wob = Math.sin(simTime * 8 + i * 1.3) * 1.2
    tr[i * 2] += (tr[(i - 1) * 2] - tr[i * 2]) * k
    tr[i * 2 + 1] += (tr[(i - 1) * 2 + 1] - tr[i * 2 + 1]) * k + wob * dt * 12
  }
}

function goneCount() {
  let n = 0
  for (let i = 0; i < sheep.length; i++) if (sheep[i].state === 'gone') n++
  return n
}
function mareadaCount() {
  let n = 0
  for (let i = 0; i < sheep.length; i++) if (sheep[i].state === 'mareada') n++
  return n
}
function pickSheep() {
  let n = 0
  for (let i = 0; i < sheep.length; i++) {
    const st = sheep[i].state
    if (st === 'ok' || st === 'mareada') n++
  }
  if (n === 0) return -1
  let k = Math.floor(Math.random() * n)
  for (let i = 0; i < sheep.length; i++) {
    const st = sheep[i].state
    if (st === 'ok' || st === 'mareada') {
      if (k === 0) return i
      k--
    }
  }
  return -1
}

// --- win / lose / begin --------------------------------------------------------------
function win() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'won'
  game.reason = 'dawn'
  titleCard.remove()
  localStorage.setItem('chiloe-piuchen-done', '1')
  audio.sfx.win()
  renderer.pulse('#ffd9a0')
  renderer.shake(2)
  const acc = game.shots > 0 ? Math.round((100 * game.hits) / game.shots) : 100
  const alive = sheep.length - goneCount()
  const tally =
    'puntos ' + game.score +
    ' · precisión ' + acc + '%' +
    ' · mejor racha ×' + Math.max(1, game.bestCombo) +
    ' · ovejas ' + alive + ' de 8'
  setTimeout(() => {
    audio.voice('win')
    showEnd(
      'EL ALBA',
      alive === 8 ? 'La majada amanece completa' : 'La majada amanece',
      'La primera luz sube por el canal y el silbido seco se adelgaza, titubea y se apaga — <i>el Piuchén</i> no caza bajo el sol. Las vas contando en voz baja, como te enseñó tu abuelo, y la majada responde con balidos dormidos' +
        (alive === 8 ? ': <i>la majada amanece completa</i>.' : ', aunque algunas andan todavía <i>mareadas</i>, con el recuerdo de las alas encima.') +
        ' La isla sabrá quién veló esta noche.<span class="tally">' + tally + '</span>',
      'OTRA NOCHE'
    )
  }, 1000)
}

function lose(reason) {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'lost'
  game.reason = reason
  titleCard.remove()
  audio.sfx.lose()
  renderer.shake(5)
  setTimeout(() => {
    audio.voice('lose')
    showEnd(
      'LA MAJADA SANGRADA',
      'Tres ovejas vacías',
      'Tres ovejas yacen pálidas contra las piedras, <i>sin una gota de sangre</i>, y el silbido se aleja satisfecho en lo oscuro. La serpiente solo cae cuando una piedra la encuentra en el picado: espera el destello verde de sus ojos, adelanta el tiro al vuelo — y si se prende a una oveja, te quedan tres respiros para arrancarla a pedradas.',
      'OTRA NOCHE'
    )
  }, 900)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  audio.voice('title')
  titleCard.remove()
  game.phase = 'playing'
  pu.nextDive = 3.2
  toast('sus ojos brillan en verde antes del picado — ¡apunta ahí!', true)
}

// --- sling -----------------------------------------------------------------------
function fire(tx, ty, force) {
  if (game.phase !== 'playing') return false
  if (!force && game.cooldown > 0) return false
  let slot = -1
  for (let i = 0; i < stones.length; i++) {
    if (!stones[i].active) { slot = i; break }
  }
  if (slot < 0) {
    if (!force) return false
    slot = 0 // tests may recycle the oldest stone
  }
  const st = stones[slot]
  const dx = tx - SLING_X
  const dy = ty - SLING_Y
  const d = Math.hypot(dx, dy) || 1
  const T = Math.min(0.62, Math.max(0.26, d / 950)) // arc + travel time
  st.x = SLING_X
  st.y = SLING_Y
  st.vx = dx / T
  st.vy = dy / T - 0.5 * GRAV * T
  st.active = true
  st.near = false
  game.cooldown = COOLDOWN
  game.shots++
  audio.sfx.slingStrain()
  audio.sfx.whip()
  renderer.burst(SLING_X, SLING_Y, '#9a917c', 3, 50, 0.3, 1.2)
  return true
}

function registerHit() {
  game.hits++
  game.combo++
  if (game.combo > game.bestCombo) game.bestCombo = game.combo
  const mult = Math.min(game.combo, 5)
  const saved = pu.state === 'latched' && pu.target >= 0
  let gain = 100 * mult
  if (saved) {
    gain += 150
    const s = sheep[pu.target]
    if (s.state === 'draining') s.state = 'mareada'
    renderer.popup(s.x, s.y - 34, SAVE_POP[mult - 1], '#9fffd0')
    renderer.pulse('#9fffd0')
    audio.sfx.relief()
    if (firstSave) {
      firstSave = false
      toast('¡salvada! queda mareada, pero respira', true)
    }
  } else {
    renderer.popup(pu.x, pu.y - 18, HIT_POP[mult - 1], '#e8dcc0')
  }
  game.score += gain
  game.hitStop = HITSTOP // crunchy
  renderer.shake(5)
  renderer.burst(pu.x, pu.y, '#1d2a30', 16, 130, 0.8, 2.2) // dark feathers
  renderer.burst(pu.x, pu.y, '#9fffd0', 5, 90, 0.4, 1.5)
  audio.sfx.thud()
  audio.sfx.screamHit()
  audio.sfx.feathers()
  if (mult >= 2) audio.sfx.comboChime(mult)
  // knocked out of the sky — he retreats screaming
  pu.state = 'retreat'
  pu.rx = pu.x + (pu.x < W / 2 ? -220 : 220)
  pu.ry = -90
  pu.target = -1
}

// --- piuchén ---------------------------------------------------------------------
function cfg() { return WAVE_CFG[game.wave - 1] }

function startTelegraph(quick) {
  const t = pickSheep()
  if (t < 0) { pu.nextDive = 2; return }
  pu.target = t
  pu.state = 'telegraph'
  pu.teleT = cfg().tele * (quick ? 0.55 : 1)
  audio.sfx.scream()
  renderer.shake(1)
}

function startDive() {
  const s = sheep[pu.target]
  if (!s || s.state === 'gone') { endCycle(); return }
  pu.p0x = pu.x
  pu.p0y = pu.y
  pu.p2x = s.x
  pu.p2y = s.y - 6
  pu.side = pu.x < s.x ? -1 : 1
  pu.p1x = pu.p0x + (pu.p2x - pu.p0x) * 0.25 + pu.side * (120 + Math.random() * 80)
  pu.p1y = pu.p0y + (pu.p2y - pu.p0y) * 0.55
  pu.diveT = 0
  pu.diveDur = cfg().dive * (0.92 + Math.random() * 0.16)
  pu.feintAt = Math.random() < cfg().feint ? 0.42 + Math.random() * 0.16 : 0
  pu.state = 'diving'
  audio.sfx.diveWind()
}

function startPullup() {
  pu.p0x = pu.x
  pu.p0y = pu.y
  pu.p1x = pu.x + pu.side * 60
  pu.p1y = pu.y - 30
  pu.p2x = Math.min(W - 60, Math.max(60, pu.x + pu.side * 240))
  pu.p2y = 70 + Math.random() * 60
  pu.diveT = 0
  pu.diveDur = 0.65
  pu.feintAt = 0
  pu.state = 'pullup'
  audio.sfx.whoosh()
  if (firstFeint) {
    firstFeint = false
    toast('una finta — no gastes piedras en el aire')
  }
}

function latch() {
  const s = sheep[pu.target]
  if (!s || s.state === 'gone') { endCycle(); return }
  pu.state = 'latched'
  pu.drainT = DRAIN
  s.state = 'draining'
  audio.sfx.latchBite()
  audio.sfx.bleat(1.6)
  renderer.shake(3.5)
  renderer.burst(s.x, s.y - 6, '#cfc4a4', 10, 80, 0.6, 2)
  if (firstLatch) {
    firstLatch = false
    toast('¡la tiene! pégale antes de que la seque', true)
    audio.voice('latch')
  }
}

function drainComplete() {
  const s = sheep[pu.target]
  if (s && s.state === 'draining') {
    s.state = 'gone'
    audio.sfx.sheepGone()
    renderer.shake(6)
    renderer.pulse('#c05540')
    renderer.burst(s.x, s.y, '#cfc4a4', 22, 110, 1, 2.2)
    toast('una oveja seca — ' + goneCount() + ' de 3', true)
  }
  pu.target = -1
  if (goneCount() >= 3) { lose('sheep'); return }
  // sated, he climbs away slow
  pu.state = 'retreat'
  pu.rx = pu.x + (pu.x < W / 2 ? -200 : 200)
  pu.ry = -90
}

function endCycle() {
  pu.state = 'circling'
  pu.target = -1
  const c = cfg()
  let gap = c.gapMin + Math.random() * (c.gapMax - c.gapMin)
  if (game.wave >= 4 && Math.random() < c.quick) gap = 0.8 // two quick dives in a row
  pu.nextDive = gap
}

function releaseLatch() {
  if (pu.state === 'latched' && pu.target >= 0) {
    const s = sheep[pu.target]
    if (s.state === 'draining') s.state = 'mareada'
  }
}

// --- updates ---------------------------------------------------------------------
function updateSheep(dt) {
  for (let i = 0; i < sheep.length; i++) {
    const s = sheep[i]
    if (s.state === 'gone' || s.state === 'draining') continue
    s.shuffleT -= dt
    if (s.shuffleT <= 0) {
      s.shuffleT = 2.5 + Math.random() * 4
      s.tx = s.baseX + (Math.random() * 2 - 1) * 7
      s.ty = s.baseY + (Math.random() * 2 - 1) * 3
      if (Math.random() < 0.3) audio.sfx.bleat(0.4 + Math.random() * 0.4)
    }
    s.x += (s.tx - s.x) * Math.min(1, 2 * dt)
    s.y += (s.ty - s.y) * Math.min(1, 2 * dt)
  }
}

function updatePiuchen(dt) {
  const c = cfg()
  if (pu.state === 'circling') {
    const px = W / 2 + Math.sin(simTime * 0.33) * 330
    const py = 140 + Math.sin(simTime * 0.57 + 1.7) * 65
    const k = Math.min(1, 1.8 * dt)
    const nx = pu.x + (px - pu.x) * k
    const ny = pu.y + (py - pu.y) * k
    if (Math.abs(nx - pu.x) + Math.abs(ny - pu.y) > 0.01) pu.heading = Math.atan2(ny - pu.y, nx - pu.x)
    pu.x = nx
    pu.y = ny
    shiftTrail(dt)
    pu.nextDive -= dt
    if (pu.nextDive <= 0) startTelegraph(false)
  } else if (pu.state === 'telegraph') {
    const s = sheep[pu.target]
    if (!s || s.state === 'gone') { endCycle(); return }
    const hx = s.x + (pu.x < s.x ? -40 : 40)
    pu.x += (hx - pu.x) * Math.min(1, 0.8 * dt)
    pu.heading = Math.atan2(s.y - pu.y, s.x - pu.x)
    shiftTrail(dt)
    pu.teleT -= dt
    if (pu.teleT <= 0) startDive()
  } else if (pu.state === 'diving' || pu.state === 'pullup') {
    pu.diveT += dt / pu.diveDur
    const t = Math.min(1, pu.diveT)
    const u = pu.state === 'diving' ? Math.pow(t, 1.55) : t // dives accelerate
    const a = 1 - u
    const nx = a * a * pu.p0x + 2 * a * u * pu.p1x + u * u * pu.p2x
    const ny = a * a * pu.p0y + 2 * a * u * pu.p1y + u * u * pu.p2y
    if (Math.abs(nx - pu.x) + Math.abs(ny - pu.y) > 0.01) pu.heading = Math.atan2(ny - pu.y, nx - pu.x)
    pu.x = nx
    pu.y = ny
    shiftTrail(dt)
    if (pu.state === 'diving') {
      if (pu.feintAt > 0 && u >= pu.feintAt) startPullup()
      else if (t >= 1) latch()
    } else if (t >= 1) {
      if (Math.random() < c.chain) startTelegraph(true) // double-dip
      else endCycle()
    }
  } else if (pu.state === 'latched') {
    const s = sheep[pu.target]
    if (!s || s.state !== 'draining') { endCycle(); return }
    pu.x = s.x
    pu.y = s.y - 8 + Math.sin(simTime * 8) * 1.5
    pu.heading = Math.sin(simTime * 2) * 0.3 - Math.PI / 2
    shiftTrail(dt)
    pu.drainT -= dt
    drainAcc += dt
    if (drainAcc > 0.32) {
      drainAcc = 0
      audio.sfx.drainTick()
      renderer.burst(s.x, s.y - 2, '#b04a3a', 2, 30, 0.5, 1.5)
    }
    if (pu.drainT <= 0) drainComplete()
  } else if (pu.state === 'retreat') {
    const dx = pu.rx - pu.x
    const dy = pu.ry - pu.y
    const d = Math.hypot(dx, dy)
    if (d > 1) {
      const step = Math.min(430 * dt, d)
      pu.x += (dx / d) * step
      pu.y += (dy / d) * step
      pu.heading = Math.atan2(dy, dx)
    }
    shiftTrail(dt)
    if (pu.y < -70 || d <= 1) endCycle()
  }
}

function updateStones(dt) {
  for (let i = 0; i < stones.length; i++) {
    const s = stones[i]
    if (!s.active) continue
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vy += GRAV * dt
    if (pu.state !== 'retreat') { // he is only untouchable while fleeing
      const dh = Math.hypot(s.x - pu.x, s.y - pu.y)
      let hit = dh < HIT_R
      if (!hit) {
        hit =
          Math.hypot(s.x - pu.trail[6], s.y - pu.trail[7]) < BODY_R ||
          Math.hypot(s.x - pu.trail[12], s.y - pu.trail[13]) < BODY_R
      }
      if (hit) {
        s.active = false
        registerHit()
        continue
      }
      if (!s.near && dh < NEAR_R) {
        s.near = true
        audio.sfx.whoosh() // shaved past him
      }
    }
    if (s.y > GROUND || s.x < -60 || s.x > W + 60 || s.y < -900) {
      s.active = false
      if (s.y > GROUND) {
        renderer.burst(s.x, GROUND, '#202b1c', 4, 45, 0.4, 1.5)
        audio.sfx.dirt()
      }
      if (game.combo > 0) game.combo = 0 // a spent stone breaks the streak
    }
  }
}

// --- sim: pure frame(dt) --------------------------------------------------------------
function frame(dt) {
  if (game.phase !== 'playing') {
    renderer.update(dt * 0.5) // fx settle behind cards; sim itself is paused
    return
  }
  if (game.hitStop > 0) { // 40 ms crunch
    game.hitStop -= dt
    renderer.update(dt * 0.25)
    return
  }
  simTime += dt
  game.elapsed += dt
  game.dawn = Math.min(1, game.elapsed / TOTAL)
  const w = Math.min(WAVES, Math.floor(game.elapsed / WAVE_T) + 1)
  if (w !== game.wave) {
    game.wave = w
    toast(WAVE_MSG[w - 2], true)
    audio.sfx.waveCry()
  }
  if (game.elapsed >= TOTAL) { win(); return }

  if (game.cooldown > 0) {
    game.cooldown = Math.max(0, game.cooldown - dt)
    if (game.cooldown === 0) audio.sfx.readyTick() // sling ready again
  }

  updateSheep(dt)
  if (goneCount() >= 3) { lose('sheep'); return } // guard (covers setSheep too)
  updatePiuchen(dt)
  updateStones(dt)

  const tension =
    pu.state === 'latched' ? 1
      : pu.state === 'diving' || pu.state === 'pullup' ? 0.8
        : pu.state === 'telegraph' ? 0.55
          : pu.state === 'retreat' ? 0.3 : 0.12
  audio.update(dt, 0.7 + game.wave * 0.06, tension)

  renderer.update(dt)
  updateHud()
}

// --- hud ------------------------------------------------------------------------------
let lastWave = 0
let lastScore = -1
let lastCombo = -1
let lastSheepSig = -1
let lastDawnPct = -1
function updateHud() {
  if (game.wave !== lastWave) {
    lastWave = game.wave
    hWave.textContent = game.wave + '/5'
  }
  if (game.score !== lastScore) {
    lastScore = game.score
    hScore.textContent = String(game.score)
  }
  if (game.combo !== lastCombo) {
    lastCombo = game.combo
    hCombo.textContent = game.combo > 0 ? '×' + game.combo : '—'
    hCombo.className = game.combo >= 2 ? 'hot' : ''
  }
  const sig = goneCount() * 16 + mareadaCount()
  if (sig !== lastSheepSig) {
    lastSheepSig = sig
    let str = ''
    for (let i = 0; i < sheep.length; i++) {
      const st = sheep[i].state
      str += (st === 'gone' ? '·' : st === 'mareada' ? '◐' : '●') + (i < sheep.length - 1 ? ' ' : '')
    }
    hSheep.textContent = str
  }
  const pct = Math.floor(game.dawn * 200) / 2 // 0.5% steps
  if (pct !== lastDawnPct) {
    lastDawnPct = pct
    dawnFill.style.width = pct + '%'
  }
}

// --- input -----------------------------------------------------------------------------
function toWorld(e) {
  const dpr = canvas.width / window.innerWidth
  const cw = canvas.width
  const ch = canvas.height
  const sc = Math.min(cw / W, ch / H)
  input.mx = (e.clientX * dpr - (cw - W * sc) / 2) / sc
  input.my = (e.clientY * dpr - (ch - H * sc) / 2) / sc
}
window.addEventListener('mousemove', toWorld)
window.addEventListener('mousedown', (e) => {
  toWorld(e)
  if (game.phase === 'playing' && e.target === canvas) fire(input.mx, input.my, false)
})

function keyEvent(code, down) {
  if (code === 'Space') {
    if (down && game.phase === 'playing') fire(input.mx, input.my, false)
  } else if (code === 'KeyM' && down) {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  keyEvent(e.code, true)
})
window.addEventListener('keyup', (e) => keyEvent(e.code, false))

// --- loop ---------------------------------------------------------------------------------
function resize() {
  canvas.width = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2)
  canvas.height = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)
}
window.addEventListener('resize', resize)
resize()

let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  frame(dt)
  renderer.draw(game)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api -------------------------------------------------------------------------------
function stonesAir() {
  let n = 0
  for (let i = 0; i < stones.length; i++) if (stones[i].active) n++
  return n
}

window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(Math.min(dt, 0.05))
    renderer.draw(game)
  },
  getState() {
    return {
      phase: game.phase,
      reason: game.reason,
      wave: game.wave,
      elapsed: game.elapsed,
      dawn: game.dawn,
      score: game.score,
      combo: game.combo,
      bestCombo: game.bestCombo,
      shots: game.shots,
      hits: game.hits,
      accuracy: game.shots > 0 ? game.hits / game.shots : 1,
      sheepAlive: sheep.length - goneCount(),
      sheepGone: goneCount(),
      sheepMareada: mareadaCount(),
      piuchen: pu.state,
      piuchenPos: [pu.x, pu.y],
      target: pu.target,
      drainT: pu.state === 'latched' ? pu.drainT : 0,
      stonesAir: stonesAir(),
      cooldown: game.cooldown,
      hitStop: game.hitStop,
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose('sheep'),
  wave: () => game.wave,
  setWave(n) {
    const w = Math.max(1, Math.min(WAVES, n | 0))
    game.elapsed = (w - 1) * WAVE_T
    game.wave = w
  },
  diveNow(target) {
    if (game.phase !== 'playing') return -1
    releaseLatch()
    let t = typeof target === 'number' && target >= 0 && target < sheep.length && sheep[target].state !== 'gone'
      ? target
      : pickSheep()
    if (t < 0) return -1
    pu.target = t
    startDive()
    return pu.state === 'diving' ? t : -1
  },
  latchNow(target) {
    if (game.phase !== 'playing') return -1
    releaseLatch()
    let t = typeof target === 'number' && target >= 0 && target < sheep.length && sheep[target].state !== 'gone'
      ? target
      : pickSheep()
    if (t < 0) return -1
    pu.target = t
    pu.x = sheep[t].x
    pu.y = sheep[t].y - 8
    resetTrail(pu.x, pu.y)
    latch()
    return pu.state === 'latched' ? t : -1
  },
  sheep() {
    const states = []
    let alive = 0
    let mare = 0
    let gone = 0
    for (let i = 0; i < sheep.length; i++) {
      states.push(sheep[i].state)
      if (sheep[i].state === 'gone') gone++
      else {
        alive++
        if (sheep[i].state === 'mareada') mare++
      }
    }
    return { alive, gone, mareada: mare, states }
  },
  setSheep(n) {
    const keep = Math.max(0, Math.min(sheep.length, n | 0))
    for (let i = 0; i < sheep.length; i++) sheep[i].state = i < keep ? 'ok' : 'gone'
    if (pu.target >= 0 && sheep[pu.target].state === 'gone') {
      pu.target = -1
      pu.state = 'circling'
      pu.nextDive = 1.5
    }
  },
  hitNow() {
    if (game.phase !== 'playing') return false
    game.shots++ // keeps accuracy <= 100%
    registerHit()
    return true
  },
  score: () => game.score,
  fireAt: (x, y) => fire(x, y, true),
  aimAt(x, y) { input.mx = x; input.my = y },
  setElapsed(s) { game.elapsed = Math.max(0, s) },
  setCombo(n) {
    game.combo = Math.max(0, n | 0)
    if (game.combo > game.bestCombo) game.bestCombo = game.combo
  },
  pressKey(code, down = true) { keyEvent(code, down) },
}
