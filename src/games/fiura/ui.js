// ui.js — LA FIURA · overlays + HUD (vanilla DOM into #ui).
// setHUD() runs every frame: every DOM write is cached behind a change check.
import { HERB_TOTAL } from './level.js'

export const STRINGS = {
  title: 'LA FIURA',
  subtitle: 'la señora feroz del pantano',
  intro:
    'In the black marshes of Chiloé waits la Fiura, the Trauco’s tiny and ' +
    'ferocious mate — a wild hag in red whose aliento twists bodies and whose ' +
    'encanto bends minds. The machi needs five hierbas that glow along the ' +
    'drowned paths of el pantanal; carry all five to his hut before your three ' +
    'luces gutter out. When she draws breath she is about to charm — cross ' +
    'her ground between the pulses, never during.',
  help: 'a/d or ←/→ move · space/w/↑ jump (release to cut) · m mute',
  begin: 'BEGIN',
  winTitle: 'EL MACHI ENCIENDE SU PUERTA',
  winText:
    'Five hierbas, still glowing with the cold light of the swamp, and the door ' +
    'opens on woodsmoke and warmth. Far behind you something small in red stamps ' +
    'her feet in the reeds and screams at the moon — but the charm cannot cross ' +
    'a machi’s threshold. Esta noche, el pantanal no te quedó.',
  winReplay: 'OTRA NOCHE',
  loseTitle: 'EL PANTANAL TE QUEDÓ',
  loseText:
    'Your last luz guttered out among the reeds, and the black water settled as if ' +
    'no one had ever passed. They say la Fiura combs her hair with the charm of ' +
    'the drowned. Time her breath — cross between the pulses, and trust the ' +
    'lantern checkpoints to hold your place.',
  loseReplay: 'INTENTAR DE NUEVO',
}

// precomputed HUD strings (no per-frame string building)
const HERB_STR = []
for (let i = 0; i <= HERB_TOTAL; i++) HERB_STR.push('hierbas ' + i + ' / ' + HERB_TOTAL)
export const HINTS = {
  start: 'las hierbas brillan en las ramas — five before the hut',
  inhale: 'ella inhala — el encanto viene, do not be near',
  sink: 'el tronco se hunde — keep moving',
  allHerbs: 'cinco hierbas — la cabaña del machi waits at the end',
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
      lastHerbs = herbs
      herbsEl.textContent = HERB_STR[herbs]
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
