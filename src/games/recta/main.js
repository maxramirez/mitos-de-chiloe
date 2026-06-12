// ============================================================================
// LA RECTA PROVINCIA — El tribunal de los brujos · Mitos de Chiloé
// Deduction puzzle, canvas2d. In a cave below Quicaví the secret warlock
// government holds court: n islanders stand at a candlelit table and exactly
// ONE is a brujo of the Recta Provincia. Every islander speaks two
// testimonies; innocents only tell the truth, the brujo lies in EXACTLY ONE
// of his two. Statements are location alibis ("the brujo spent dusk alone in
// the cave", so being elsewhere — or with someone — clears people), dusk
// sightings, and attribute clues tied to VISIBLE traits (wet/dry boots, a
// floor shadow or none, salt on the wool — readable on each figure and in
// the notebook glyphs). Click a figure to read its parchment testimony, mark
// ✗/○ in the judge's notebook, then ACUSAR and pick one. Three escalating
// cases (5, 6, 7 souls); one perdón (wrong accusation forgiven) per run.
// Every case is generated from a seed and brute-force verified to have a
// UNIQUE consistent culprit (see case.js).
//
// TEST API — window.__game (sim is a pure frame(dt), driven by both rAF and
// manual stepping; rAF is throttled in hidden tabs — tests drive step()):
//   begin()                — same as clicking COMENZAR (unlocks audio)
//   step(dt=1/60, steps=1) — advance the sim deterministically, then draw
//                            once. dt clamped to 0.05.
//   getState()             — { phase:'title'|'playing'|'won'|'lost',
//                              case:1..3, caseSeed, n, selected, accuseMode,
//                              marks:[0|1|2…], pardonLeft, accusations,
//                              casesSolved, heard, anim, totalT, muted }
//   forceWin()             — runs the real win handler (incl. localStorage
//                            'chiloe-recta-done' = '1')
//   forceLose()            — runs the real lose handler (candles go out)
//   caseSeed()             — seed of the current case (deterministic regen)
//   brujoIndex()           — index of the actual brujo in the current case
//   testimonies()          — [{ speaker, name, traits, lines:[t1,t2] }, …]
//   accuse(i)              — accuse islander i (the real flow: correct ⇒
//                            shadow flees ⇒ next case / win; wrong ⇒ perdón
//                            once, then lose). Returns true if accepted.
//   markSuspect(i, v)      — notebook mark: 2|true|'sospechoso' ⇒ ✗,
//                            1|'inocente' ⇒ ○, 0|false ⇒ blank
//   select(i)              — open islander i's testimony (i = -1 closes)
//   nextCase()             — solve-skip: advance to the next case (or win)
//   setCase(n)             — load case n (1..3) and play it at once
//   pressKey(code, down)   — drive keys ('Digit1'..'Digit7' select, 'KeyA'
//                            arm accusation, 'Escape' cancel, 'KeyM' mute)
// ============================================================================

import { genCase, hashSeed, testimonyList, traitWords } from './case.js'
import { createRenderer } from './render.js'
import { createAudio } from './audio.js'

const LS_DONE = 'chiloe-recta-done'
const FLEE_T = 2.3
const ROMAN = ['i', 'ii', 'iii']

const TEXTS = {
  // card bodies match the voice clips (assets/voice/recta/*.mp3) word for
  // word, in the collection's Neruda register.
  intro: 'Bajo Quicaví, la Recta Provincia abre su tribunal en una cueva sin nombre. A la mesa se sientan los llamados, y uno solo le pertenece a la noche: estuvo en la cueva al anochecer, y miente <i>una sola vez</i>. Los demás dicen la verdad entera — escucha sus palabras, y deja que hablen las botas, la sal y las sombras.',
  win: 'El último brujo está nombrado: su sombra lo suelta como el agua suelta a un ahogado, y huye a contarlo cueva adentro. La Recta Provincia cierra su libro de actas. Esta noche las islas duermen con la puerta sin tranca.',
  lose: 'Acusaste mal, y las velas lo saben: se apagan una a una, como se apagan los nombres bajo la lluvia. La Recta Provincia agradece tu silencio.',
  controls: 'TOCA una figura: su testimonio &nbsp;·&nbsp; CUADERNO: ✗ sospecha / ○ inocente &nbsp;·&nbsp; ACUSAR: señala al brujo &nbsp;·&nbsp; 1–7 teclas &nbsp;·&nbsp; M sonido',
}

const CASE_TOAST = [
  'primer expediente: cinco almas — una miente una sola vez',
  'segundo expediente: seis almas, la misma mentira',
  'último expediente: siete almas — mira las botas, la sal, las sombras',
]

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
const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', 'toca una figura: testimonio · marca el cuaderno · acusa una sola vez', ui)
hint.id = 'hint'
const notebook = el('div', '', '', ui)
notebook.id = 'notebook'
const testimonyEl = el('div', '', '', ui)
testimonyEl.id = 'testimony'
const accuseBtn = el('button', '', 'ACUSAR', ui)
accuseBtn.id = 'accuse'

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
  'LA RECTA PROVINCIA', 'El tribunal de los brujos', TEXTS.intro,
  TEXTS.controls, 'COMENZAR', () => begin()
)
let endCard = null
function showEnd(title, epithet, body, btn, action) {
  if (endCard) endCard.remove()
  endCard = card(title, epithet, body, '', btn, action)
}

// --- state -----------------------------------------------------------------
const renderer = createRenderer(canvas)
const audio = createAudio()

let runSeed = 0
{
  const m = /[?&]seed=(\d+)/.exec(location.search)
  runSeed = m ? (+m[1] >>> 0) : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)
}
const seedPinned = /[?&]seed=\d+/.test(location.search)

const game = {
  phase: 'title', // title | playing | won | lost
  caseN: 1,
  data: null,
  selected: -1,
  accuseMode: false,
  marks: [],
  pardonLeft: 1,
  accusations: 0,
  casesSolved: 0,
  anim: null, // 'flee' | 'candles' | 'winfade'
  animT: 0,
  totalT: 0,
  visT: 0,
}
let heard = new Set()
let loseLit = 5
let loseKilled = 0

const caseSeedFor = (n) => hashSeed(runSeed, n)
const litCount = () => 5 - (1 - game.pardonLeft)

// --- notebook / testimony panels ---------------------------------------------
const MARK_GLYPH = ['·', '○', '✗']
function buildNotebook() {
  notebook.innerHTML = ''
  el('div', 'nb-title', 'cuaderno del juez', notebook)
  game.data.chars.forEach((c, i) => {
    const row = el('div', 'nb-row', '', notebook)
    row.dataset.i = i
    el('span', 'nb-heard', '·', row)
    el('span', 'nb-name', c.name, row)
    const mk = el('button', 'nb-mark', MARK_GLYPH[0], row)
    mk.addEventListener('click', (e) => {
      e.stopPropagation()
      cycleMark(i)
    })
    row.addEventListener('click', () => select(i))
  })
  el('div', 'nb-legend', 'el inocente no miente.<br>el brujo miente una sola vez.<br>una gracia perdona una acusación.', notebook)
  refreshNotebook()
}

function refreshNotebook() {
  const rows = notebook.querySelectorAll('.nb-row')
  rows.forEach((row) => {
    const i = +row.dataset.i
    row.classList.toggle('sel', game.selected === i)
    row.classList.toggle('heard', heard.has(i))
    row.querySelector('.nb-heard').textContent = heard.has(i) ? '✓' : '·'
    const mk = row.querySelector('.nb-mark')
    mk.textContent = MARK_GLYPH[game.marks[i]]
    mk.className = 'nb-mark m' + game.marks[i]
  })
}

function cycleMark(i) {
  if (game.phase !== 'playing') return
  game.marks[i] = (game.marks[i] + 2) % 3 // blank → ✗ sospechoso → ○ inocente
  audio.sfx.mark()
  refreshNotebook()
}

function select(i) {
  if (game.phase !== 'playing' || game.anim) return
  if (i < 0 || i >= game.data.chars.length) {
    game.selected = -1
    testimonyEl.classList.remove('show')
    refreshNotebook()
    return
  }
  const first = game.selected !== i
  game.selected = i
  heard.add(i)
  const c = game.data.chars[i]
  const lines = []
  for (const s of game.data.stmts) if (s.sp === i) lines.push(s.text)
  testimonyEl.innerHTML =
    '<button class="t-close">✕</button>' +
    '<div class="t-name"><span class="t-charm">✦</span>' + c.name + '</div>' +
    '<div class="t-traits">se ve: ' + traitWords(c) + '</div>' +
    lines.map((t) => '<div class="t-line">' + t + '</div>').join('') +
    '<div class="t-rule">el inocente no miente · el brujo miente una sola vez</div>'
  testimonyEl.querySelector('.t-close').addEventListener('click', () => select(-1))
  testimonyEl.classList.add('show')
  if (first) {
    audio.sfx.page()
    audio.sfx.murmur(i)
  }
  refreshNotebook()
}

// --- hud / accuse button ------------------------------------------------------
function updateHud() {
  hud.innerHTML =
    'expediente <b>' + ROMAN[game.caseN - 1] + '/iii</b> · ' +
    game.data.chars.length + ' almas · ' +
    (game.pardonLeft > 0 ? 'gracia <span class="gracia">✦</span>' : 'sin gracia')
}

function setAccuseMode(on) {
  if (on && (game.phase !== 'playing' || game.anim)) return
  game.accuseMode = on
  accuseBtn.classList.toggle('armed', on)
  accuseBtn.textContent = on ? '¿A QUIÉN? — toca una figura' : 'ACUSAR'
  if (on) {
    audio.sfx.arm()
    toast('señala al brujo — el tribunal no pregunta dos veces')
  } else audio.sfx.disarm()
}
accuseBtn.addEventListener('click', () => {
  if (game.phase !== 'playing' || game.anim) return
  setAccuseMode(!game.accuseMode)
})

// --- case flow -----------------------------------------------------------------
function loadCase(n) {
  game.caseN = n
  game.data = genCase(caseSeedFor(n), 4 + n)
  game.marks = new Array(game.data.chars.length).fill(0)
  game.selected = -1
  game.accuseMode = false
  accuseBtn.classList.remove('armed')
  accuseBtn.textContent = 'ACUSAR'
  heard = new Set()
  testimonyEl.classList.remove('show')
  renderer.setCase(game.data.chars)
  renderer.relight(litCount())
  buildNotebook()
  updateHud()
  if (game.phase === 'playing') {
    toast(CASE_TOAST[n - 1], true)
    audio.sfx.caseBell()
  }
}

function accuse(i) {
  if (game.phase !== 'playing' || game.anim || !game.data) return false
  i |= 0
  if (i < 0 || i >= game.data.chars.length) return false
  game.accusations++
  setAccuseMode(false)
  select(-1)
  audio.sfx.accuse()
  if (i === game.data.brujo) {
    game.casesSolved++
    game.anim = 'flee'
    game.animT = 0
    renderer.startFlee(i)
    audio.sfx.flee()
    renderer.pulse('#9fffd0')
    toast('la sombra lo confiesa: se suelta y huye cueva adentro', true)
  } else if (game.pardonLeft > 0) {
    game.pardonLeft--
    game.marks[i] = 1 // revealed innocent
    renderer.relight(litCount())
    renderer.shake(8)
    renderer.pulse('#d96a55')
    audio.sfx.pardon()
    audio.sfx.candleOut()
    toast('no era — una vela paga tu error. el tribunal no perdona dos veces.', true)
    refreshNotebook()
    updateHud()
  } else {
    lose()
  }
  return true
}

function win() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'won'
  titleCard.remove()
  try { localStorage.setItem(LS_DONE, '1') } catch (e) { /* storage may be off */ }
  audio.sfx.win()
  audio.musicOut()
  renderer.pulse('#9fffd0')
  game.anim = 'winfade'
  game.animT = 0
}

function lose() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'lost'
  titleCard.remove()
  setAccuseMode(false)
  testimonyEl.classList.remove('show')
  audio.sfx.lose()
  audio.musicOut()
  loseLit = litCount()
  loseKilled = 0
  game.anim = 'candles'
  game.animT = 0
}

function endTally() {
  const m = Math.floor(game.totalT / 60)
  const s = Math.floor(game.totalT % 60)
  return 'expedientes ' + ['—', 'i', 'ii', 'iii'][game.casesSolved] + '/iii · acusaciones ' + game.accusations +
    ' · gracia ' + (game.pardonLeft > 0 ? 'intacta' : 'gastada') +
    ' · ' + m + ':' + (s < 10 ? '0' : '') + s
}

function showWinCard() {
  audio.voice('win')
  showEnd(
    'EL TRIBUNAL HA HABLADO', 'La seña queda contigo',
    TEXTS.win + '<span class="tally">' + endTally() + ' · ✦ seña guardada</span>',
    'REINTENTAR', () => restartAll()
  )
}

function showLoseCard() {
  audio.voice('lose')
  showEnd(
    'LAS VELAS SE APAGAN', 'La Recta Provincia agradece tu silencio',
    TEXTS.lose + '<span class="tally">' + endTally() + '</span>',
    'REINTENTAR', () => restartAll()
  )
}

function restartAll() {
  if (endCard) {
    endCard.remove()
    endCard = null
  }
  if (!seedPinned) runSeed = ((runSeed * 1664525 + 1013904223) ^ Date.now()) >>> 0
  game.phase = 'playing'
  game.pardonLeft = 1
  game.accusations = 0
  game.casesSolved = 0
  game.totalT = 0
  game.anim = null
  renderer.setGloom(0)
  loadCase(1)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  speakIntro()
  titleCard.remove()
  game.phase = 'playing'
  toast(CASE_TOAST[0], true)
}

// --- title narration (best-effort before BEGIN; every path silent-safe) ------
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

// --- input ---------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'playing' || game.anim) return
  e.preventDefault()
  const i = renderer.figureAt(e.clientX, e.clientY)
  if (game.accuseMode) {
    if (i >= 0) accuse(i)
    else setAccuseMode(false)
  } else {
    select(i) // -1 closes the parchment
  }
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })

function keyEvent(code, down) {
  if (!down) return
  if (code === 'KeyM') {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  } else if ((code === 'Enter' || code === 'Space') && game.phase === 'title') {
    begin()
  } else if (code === 'KeyA' && game.phase === 'playing' && !game.anim) {
    setAccuseMode(!game.accuseMode)
  } else if (code === 'Escape') {
    if (game.accuseMode) setAccuseMode(false)
    else select(-1)
  } else if (code.indexOf('Digit') === 0 && game.phase === 'playing' && !game.anim) {
    const i = +code.slice(5) - 1
    if (game.data && i >= 0 && i < game.data.chars.length) {
      if (game.accuseMode) accuse(i)
      else select(i)
    }
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  keyEvent(e.code, true)
})

// --- frame (pure sim step; visuals live in renderer.draw) -----------------------
function frame(dt) {
  game.visT += dt
  if (game.anim === 'flee') {
    game.animT += dt
    if (game.animT >= FLEE_T) {
      game.anim = null
      if (game.phase === 'playing') {
        if (game.caseN < 3) loadCase(game.caseN + 1)
        else win()
      }
    }
  } else if (game.anim === 'candles') {
    game.animT += dt
    while (loseKilled < loseLit && game.animT >= 0.5 + loseKilled * 0.55) {
      loseKilled++
      renderer.relight(loseLit - loseKilled)
      renderer.setGloom((loseKilled / Math.max(1, loseLit)) * 0.8)
      audio.sfx.candleOut()
    }
    const total = 0.5 + loseLit * 0.55 + 1.3
    if (game.animT >= total - 1.3) {
      renderer.setGloom(0.8 + 0.2 * Math.min(1, (game.animT - (total - 1.3)) / 1.3))
    }
    if (game.animT >= total) {
      game.anim = null
      showLoseCard()
    }
  } else if (game.anim === 'winfade') {
    game.animT += dt
    if (game.animT >= 1.5) {
      game.anim = null
      showWinCard()
    }
  } else if (game.phase === 'playing' && !endCard && (game.phase !== 'title')) {
    game.totalT += dt
  }
  audio.update(dt)
}

// --- loop ------------------------------------------------------------------------
loadCase(1) // the tribunal is visible behind the title card

let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  frame(dt)
  renderer.draw(game, dt)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api ----------------------------------------------------------------------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(Math.min(dt, 0.05))
    renderer.draw(game, Math.min(dt, 0.05))
  },
  getState() {
    return {
      phase: game.phase,
      case: game.caseN,
      caseSeed: caseSeedFor(game.caseN),
      n: game.data ? game.data.chars.length : 0,
      selected: game.selected,
      accuseMode: game.accuseMode,
      marks: game.marks.slice(),
      pardonLeft: game.pardonLeft,
      accusations: game.accusations,
      casesSolved: game.casesSolved,
      heard: heard.size,
      anim: game.anim,
      totalT: game.totalT,
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  caseSeed: () => caseSeedFor(game.caseN),
  brujoIndex: () => (game.data ? game.data.brujo : -1),
  testimonies: () => (game.data ? testimonyList(game.data) : []),
  accuse: (i) => accuse(i),
  markSuspect(i, v) {
    i |= 0
    if (!game.data || i < 0 || i >= game.data.chars.length) return false
    const m = v === 2 || v === true || v === 'sospechoso' ? 2
      : v === 1 || v === 'inocente' ? 1 : 0
    game.marks[i] = m
    refreshNotebook()
    return true
  },
  select: (i) => select(i),
  nextCase() {
    if (game.phase === 'title') begin()
    if (game.phase !== 'playing') return
    game.anim = null
    if (game.caseN < 3) loadCase(game.caseN + 1)
    else win()
  },
  setCase(n) {
    if (endCard) {
      endCard.remove()
      endCard = null
    }
    if (game.phase === 'title') titleCard.remove()
    game.phase = 'playing'
    game.anim = null
    renderer.setGloom(0)
    loadCase(Math.max(1, Math.min(3, n | 0)))
  },
  pressKey(code, down = true) { keyEvent(code, down) },
}
