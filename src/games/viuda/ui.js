// ui.js — LA VIUDA · overlays + HUD (vanilla DOM into #ui).
// setHUD() runs every frame: every DOM write is cached behind a change check.

export const STRINGS = {
  title: 'LA VIUDA',
  subtitle: 'la enlutada de los recodos',
  // the first two sentences are the narrator's BEGIN line — keep them in
  // sync with assets/voice/viuda/begin.mp3 word for word
  intro:
    'El camino va solo a la aldea, delgado como un hilo negro entre el mar y ' +
    'los cerros. En los recodos más solos espera ella: la Viuda, quieta como ' +
    'una cruz sin nombre. Si la luz la encuentra, pásala al paso — sin ' +
    'detenerte, sin cambiar el tranco — porque quien se detiene la lleva, y ' +
    'quien corre la lleva también. El aceite es poco, el buey se cansa, y la ' +
    'medianoche viene subiendo por el agua.',
  help: '1·2·3 o ↑/↓ — detenido · al paso · al trote — R o clic — aceite en las cruces — M — sonido',
  begin: 'COMENZAR',
  winTitle: 'LAS LUCES DE LA ALDEA',
  // the last sentence is the narrator's WIN line — keep it in sync with
  // assets/voice/viuda/win.mp3 word for word
  winText:
    'Las ventanas se encienden una a una, como brasas que alguien sopla para ' +
    'ti. El buey resopla; la lámpara tiembla y se calma. Atrás queda el ' +
    'camino, negro y largo como un luto que esta noche no fue tuyo.',
  winReplay: 'OTRA NOCHE',
  loseReplay: 'INTENTAR DE NUEVO',
}

// the last two sentences of every lose text are the narrator's LOSE line —
// keep them in sync with assets/voice/viuda/lose.mp3 word for word
export const LOSE = {
  medianoche: {
    title: 'TE ALCANZÓ LA MEDIANOCHE',
    text:
      'La última campanada cruza el agua y apaga los cerros, uno por uno, ' +
      'como velas. La aldea quedó lejos, con las puertas ya cerradas. La ' +
      'noche te guardó para sí. En los recodos del camino, alguien aprende ' +
      'tu nombre.',
  },
  rueda: {
    title: 'LA RUEDA SE QUEBRÓ',
    text:
      'La madera cede como un hueso cansado, y el camino se queda con tu ' +
      'carreta. Los hoyos se ven al farol — al trote no perdonan. La noche ' +
      'te guardó para sí. En los recodos del camino, alguien aprende tu ' +
      'nombre.',
  },
  compania: {
    title: 'LLEGASTE CON COMPAÑÍA',
    text:
      'Tres veces se sentó atrás, liviana como la ceniza, y la carreta ya no ' +
      'es tuya: ahora la guía ella. La noche te guardó para sí. En los ' +
      'recodos del camino, alguien aprende tu nombre.',
  },
}

export const HINTS = {
  start: 'la palanca lleva tres trancos — el trote gana camino y gasta buey',
  // the narrator's PRESENCE line — keep in sync with
  // assets/voice/viuda/presence.mp3 word for word
  viuda: 'ella espera adelante — pásala al paso, sin detenerte, sin cambiar el tranco',
  inZone: 'no cambies el tranco — al paso, como pasa el agua por la piedra',
  oilLow: 'la llama se achica — busca una cruz blanca y detente',
  dark: 'la llama murió — los hoyos esperan a ciegas',
  staminaLow: 'el buey jadea — bájale el tranco antes de que se rinda',
  exhausted: 'el buey no puede más — déjalo respirar',
  cruz: 'una cruz blanca vela el camino — detente (1) y pulsa R',
  pouring: 'el aceite cae despacio — no te muevas',
  village: 'las luces de la aldea — un último tranco',
}

export const TOASTS = {
  board: 'se sentó atrás — no mires',
  pass: 'la luz vuelve — el recodo queda vacío',
  jolt: 'la rueda cruje en el hoyo',
  wheel: 'una rueda menos — el trote no perdona',
  refill: 'la llama bebe y se levanta',
  exhausted: 'el buey se rinde — diez latidos de descanso',
}

// precomputed strings (no per-frame string building)
const CLOCK_STR = []
for (let m = 0; m <= 60; m++) {
  const past = 60 - m
  CLOCK_STR.push(m === 0 ? 'medianoche' : past < 10 ? '23:0' + past : '23:' + past)
}
const WHEEL_STR = ['○ ○', '✕ ○', '✕ ✕']
const COMP_STR = ['', '◆', '◆ ◆', '◆ ◆ ◆']
const SCALE_STR = []
for (let i = 0; i <= 50; i++) SCALE_STR.push('scaleX(' + (i / 50).toFixed(2) + ')')

let root = null
let modalEl = null

let hudEl, clockEl, oilFill, oxFill, wheelsMarks, compEl, compMarks
let leverEls, hintEl, toastEl, muteEl
let hudShown = false
let lastClock = -1
let lastOil = -1
let lastOx = -1
let lastDamage = -1
let lastComp = -1
let lastLever = -1
let lastLocked = null
let lastHint = null
let lastToastOp = -1
let lastMuted = null

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function ensureRoot() {
  if (!root) root = document.getElementById('ui')
  return root
}

function closeModal() {
  if (!modalEl) return
  const m = modalEl
  modalEl = null
  m.classList.add('closing')
  setTimeout(() => m.remove(), 1000)
}

function card(charm, title, sub, body, btnLabel, onClick, extraClass) {
  const overlay = el('div', 'overlay' + (extraClass ? ' ' + extraClass : ''))
  const c = el('div', 'card')
  c.appendChild(el('div', 'card-charm', charm))
  c.appendChild(el('h1', 'card-title', title))
  if (sub) c.appendChild(el('div', 'card-sub', sub))
  c.appendChild(el('p', 'card-body', body))
  if (extraClass === 'title-overlay') c.appendChild(el('div', 'card-help', STRINGS.help))
  const btn = el('button', 'card-btn', btnLabel)
  btn.addEventListener('click', onClick)
  c.appendChild(btn)
  overlay.appendChild(c)
  overlay.style.pointerEvents = 'auto'
  ensureRoot().appendChild(overlay)
  modalEl = overlay
  return btn
}

export const ui = {
  // close whatever overlay is open (used by __game.begin() so the test API
  // matches the COMENZAR click exactly)
  closeOverlay() {
    closeModal()
  },

  showTitle(onBegin) {
    card(
      '✦',
      STRINGS.title,
      STRINGS.subtitle,
      STRINGS.intro,
      STRINGS.begin,
      () => {
        closeModal()
        onBegin()
      },
      'title-overlay'
    )
  },

  showWin() {
    card('✦', STRINGS.winTitle, null, STRINGS.winText, STRINGS.winReplay, () => location.reload())
  },

  showLose(cause) {
    const c = LOSE[cause] || LOSE.medianoche
    card('✦', c.title, null, c.text, STRINGS.loseReplay, () => location.reload())
  },

  buildHUD() {
    if (hudShown) return
    hudShown = true
    const r = ensureRoot()
    hudEl = el('div', 'hud')
    clockEl = el('div', 'hud-clock', CLOCK_STR[60])
    hudEl.appendChild(clockEl)

    const g1 = el('div', 'gauge')
    g1.appendChild(el('span', 'gauge-label', 'aceite'))
    const b1 = el('div', 'gauge-bar')
    oilFill = el('div', 'gauge-fill')
    b1.appendChild(oilFill)
    g1.appendChild(b1)
    hudEl.appendChild(g1)

    const g2 = el('div', 'gauge')
    g2.appendChild(el('span', 'gauge-label', 'buey'))
    const b2 = el('div', 'gauge-bar')
    oxFill = el('div', 'gauge-fill ox')
    b2.appendChild(oxFill)
    g2.appendChild(b2)
    hudEl.appendChild(g2)

    const wheels = el('div', 'hud-wheels')
    wheels.appendChild(el('span', '', 'ruedas '))
    wheelsMarks = el('span', 'marks', WHEEL_STR[0])
    wheels.appendChild(wheelsMarks)
    hudEl.appendChild(wheels)

    compEl = el('div', 'hud-comp')
    compEl.appendChild(el('span', '', 'compañía '))
    compMarks = el('span', 'marks', '')
    compEl.appendChild(compMarks)
    hudEl.appendChild(compEl)

    r.appendChild(hudEl)

    const lever = el('div', 'hud-lever')
    leverEls = []
    const words = ['detenido', 'al paso', 'al trote']
    for (let i = 0; i < 3; i++) {
      const s = el('span', i === 0 ? 'on' : '', words[i])
      leverEls.push(s)
      lever.appendChild(s)
      if (i < 2) lever.appendChild(el('span', 'sep', '·'))
    }
    r.appendChild(lever)

    hintEl = el('div', 'hud-hint', HINTS.start)
    r.appendChild(hintEl)
    toastEl = el('div', 'hud-toast', '')
    r.appendChild(toastEl)
    muteEl = el('div', 'hud-mute', 'm — sonido')
    r.appendChild(muteEl)
  },

  // called every frame — all writes cached. oil/ox arrive quantized 0..50.
  setHUD(minLeft, oilQ, oxQ, damage, boardings, lever, locked, hint, toastText, toastOpacity, muted) {
    if (!hudShown) return
    if (minLeft !== lastClock) {
      lastClock = minLeft
      clockEl.textContent = CLOCK_STR[minLeft < 0 ? 0 : minLeft > 60 ? 60 : minLeft]
      clockEl.className = minLeft <= 6 ? 'hud-clock late' : 'hud-clock'
    }
    if (oilQ !== lastOil) {
      lastOil = oilQ
      oilFill.style.transform = SCALE_STR[oilQ]
      oilFill.className = oilQ <= 12 ? 'gauge-fill low' : 'gauge-fill'
    }
    if (oxQ !== lastOx) {
      lastOx = oxQ
      oxFill.style.transform = SCALE_STR[oxQ]
      oxFill.className = oxQ <= 12 ? 'gauge-fill ox low' : 'gauge-fill ox'
    }
    if (damage !== lastDamage) {
      lastDamage = damage
      wheelsMarks.textContent = WHEEL_STR[damage < 0 ? 0 : damage > 2 ? 2 : damage]
      wheelsMarks.className = damage > 0 ? 'marks bad' : 'marks'
    }
    if (boardings !== lastComp) {
      lastComp = boardings
      compMarks.textContent = COMP_STR[boardings < 0 ? 0 : boardings > 3 ? 3 : boardings]
      compEl.className = boardings > 0 ? 'hud-comp on' : 'hud-comp'
    }
    if (lever !== lastLever || locked !== lastLocked) {
      lastLever = lever
      lastLocked = locked
      for (let i = 0; i < 3; i++)
        leverEls[i].className = i === lever ? (locked ? 'on locked' : 'on') : ''
    }
    if (hint !== lastHint) {
      lastHint = hint
      hintEl.textContent = hint || ''
      hintEl.style.opacity = hint ? '1' : '0'
    }
    const op = Math.round(toastOpacity * 20) / 20
    if (op !== lastToastOp) {
      lastToastOp = op
      toastEl.style.opacity = String(op)
      if (op > 0 && toastEl.textContent !== toastText) toastEl.textContent = toastText
    }
    if (muted !== lastMuted) {
      lastMuted = muted
      muteEl.textContent = muted ? 'm — silencio' : 'm — sonido'
      muteEl.style.opacity = muted ? '0.9' : '0.45'
    }
  },
}
