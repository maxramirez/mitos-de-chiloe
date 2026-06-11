// ui.js — LA FIURA · overlays + HUD (vanilla DOM into #ui).
// setHUD() runs every frame: every DOM write is cached behind a change check.
import { HERB_TOTAL } from './level.js'

export const STRINGS = {
  title: 'LA FIURA',
  subtitle: 'la señora feroz del pantano',
  // the first two sentences are the narrator's BEGIN line — keep them in
  // sync with assets/voice/fiura/begin.mp3 word for word
  intro:
    'El pantano calla como un ahogado. Y en la orilla espera ella: la Fiura, ' +
    'pequeña y roja como una brasa que el agua no pudo apagar. El machi ' +
    'necesita cinco hierbas que brillan por las sendas anegadas del ' +
    'pantanal; llévale las cinco a su cabaña antes de que se apaguen tus ' +
    'tres luces. Cuando ella toma aire está por encantar: cruza su terreno ' +
    'entre pulso y pulso, nunca durante.',
  help: 'A/D o ←/→ moverse · espacio/W/↑ saltar (suelta para cortar) · M sonido',
  begin: 'COMENZAR',
  winTitle: 'EL MACHI ENCIENDE SU PUERTA',
  // the last two sentences are the narrator's WIN line — keep them in sync
  // with assets/voice/fiura/win.mp3 word for word
  winText:
    'Cinco hierbas, todavía encendidas con la luz fría del pantano, y la puerta ' +
    'se abre a humo de leña y abrigo. Allá atrás, algo pequeño y de rojo ' +
    'patalea entre los juncos y le grita a la luna. Cruzaste el agua negra ' +
    'como la cruza la luna: sin pertenecerle. Esta noche el pantano te deja ir.',
  winReplay: 'OTRA NOCHE',
  loseTitle: 'EL PANTANAL TE QUEDÓ',
  // the middle two sentences are the narrator's LOSE line — keep them in
  // sync with assets/voice/fiura/lose.mp3 word for word
  loseText:
    'Tu última luz se apagó entre los juncos. La Fiura peina su cabellera con ' +
    'las voces de los ahogados. Esta noche, entre sus dedos, va la tuya. ' +
    'Mide su aliento — cruza entre pulso y pulso, y confía en los faroles: ' +
    'ellos guardan tu paso.',
  loseReplay: 'INTENTAR DE NUEVO',
}

// precomputed HUD strings (no per-frame string building)
const HERB_STR = []
for (let i = 0; i <= HERB_TOTAL; i++) HERB_STR.push('hierbas ' + i + ' / ' + HERB_TOTAL)
export const HINTS = {
  start: 'las hierbas brillan en las ramas — cinco antes de la cabaña',
  // the narrator's WHISPER line — keep in sync with
  // assets/voice/fiura/whisper.mp3 word for word
  inhale: 'ella toma aire como la ola antes de romper — no estés cerca cuando caiga',
  sink: 'el tronco se hunde — no te detengas',
  allHerbs: 'cinco hierbas — la cabaña del machi espera al final',
  locked: [],
}
for (let i = 0; i <= HERB_TOTAL; i++)
  HINTS.locked.push('la puerta sigue oscura — hierbas ' + i + ' / ' + HERB_TOTAL + ', vuelve atrás')

export const TOASTS = {
  charm: 'su encanto te alcanzó — una luz perdida',
  water: 'el agua negra te tragó — una luz perdida',
  checkpoint: 'el farol guarda tu paso',
}

let root = null
let modalEl = null

let hudEl, lucesEls, herbsEl, hintEl, toastEl, muteEl
let hudShown = false
let lastLuces = -1
let lastHerbs = -1
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
  // matches the BEGIN click exactly)
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

  showLose() {
    card('✦', STRINGS.loseTitle, null, STRINGS.loseText, STRINGS.loseReplay, () =>
      location.reload()
    )
  },

  buildHUD() {
    if (hudShown) return
    hudShown = true
    const r = ensureRoot()
    hudEl = el('div', 'hud')
    const luces = el('div', 'hud-luces')
    lucesEls = []
    for (let i = 0; i < 3; i++) {
      const s = el('span', 'luz', '✦')
      lucesEls.push(s)
      luces.appendChild(s)
    }
    herbsEl = el('div', 'hud-herbs', HERB_STR[0])
    hudEl.appendChild(luces)
    hudEl.appendChild(herbsEl)
    r.appendChild(hudEl)
    hintEl = el('div', 'hud-hint', HINTS.start)
    r.appendChild(hintEl)
    toastEl = el('div', 'hud-toast', '')
    r.appendChild(toastEl)
    muteEl = el('div', 'hud-mute', 'm — sonido')
    r.appendChild(muteEl)
  },

  // called every frame — all writes cached
  setHUD(luces, herbs, hint, toastText, toastOpacity, muted) {
    if (!hudShown) return
    if (luces !== lastLuces) {
      lastLuces = luces
      for (let i = 0; i < 3; i++) lucesEls[i].className = i < luces ? 'luz' : 'luz luz-lost'
    }
    if (herbs !== lastHerbs) {
      const wasInit = lastHerbs === -1
      lastHerbs = herbs
      herbsEl.textContent = HERB_STR[herbs]
      if (!wasInit && herbs > 0) {
        // retrigger the pickup pop (pickup-only; never runs per frame)
        herbsEl.classList.remove('herbs-pop')
        void herbsEl.offsetWidth
        herbsEl.classList.add('herbs-pop')
      }
      if (herbs === HERB_TOTAL) herbsEl.classList.add('herbs-done')
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
