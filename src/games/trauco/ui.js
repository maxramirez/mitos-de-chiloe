// ui.js — EL TRAUCO · overlays + HUD (vanilla DOM into #ui).
// setHUD() runs every frame: every DOM write is cached behind a change check.
export const STRINGS = {
  title: 'EL TRAUCO',
  subtitle: 'No le sostengas la mirada',
  intro:
    'In the deep woods of Chiloé lives el Trauco, a squat old power dressed in ' +
    'woven quilineja vine, with a stone hatchet that fells a tree in a single blow. ' +
    'It is not the hatchet you should fear — it is his mirada, which bends a grown ' +
    'man like green wood. Gather seven strands of glowing quilineja and slip out ' +
    'through the old gate, and whatever you hear in the fog, do not hold his gaze.',
  help: 'wasd walk · shift sprint (loud) · mouse look · m mute',
  begin: 'BEGIN',
  winTitle: 'EL BOSQUE TE SUELTA',
  winText:
    'Seven strands of quilineja, cut from the very vine that dresses him. As you ' +
    'pass between the leaning trunks the wisp gutters out like a candle, and behind ' +
    'you something small stamps twice in the fog — and lets you go. No mires atrás.',
  winReplay: 'OTRA NOCHE',
  loseTitle: 'TE DOBLÓ LA MIRADA',
  loseText:
    'You held his gaze a heartbeat too long, and your will bent the way quilineja ' +
    'bends — without breaking, and without ever springing back. The fog keeps what ' +
    'it charms. Next time, put a trunk between your eyes and his.',
  loseReplay: 'INTENTAR DE NUEVO',
  hudVines: 'quilineja',
  charmLabel: 'la mirada',
}

let root = null
let modalEl = null
let primaryBtn = null

let vinesEl, hintEl, charmWrap, charmFill, gazeVig, flashEl
let hudShown = false
let charmShown = false
let lastVines = -1
let lastHint = null
let lastCharm = -1
let lastVig = -1
let vineTexts = []

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function openModal(overlay, btn, onPrimary) {
  modalEl = overlay
  primaryBtn = btn
  let done = false
  const close = (cb) => {
    if (done) return
    done = true
    modalEl = null
    primaryBtn = null
    overlay.classList.add('closing')
    setTimeout(() => overlay.remove(), 1100)
    if (cb) cb()
  }
  btn.addEventListener('click', () => close(onPrimary))
  root.appendChild(overlay)
  btn.focus()
  return close
}

export const ui = {
  init() {
    root = document.getElementById('ui')
    root.innerHTML = ''
    gazeVig = el('div')
    gazeVig.id = 'gaze-vig'
    root.appendChild(gazeVig)
    flashEl = el('div')
    flashEl.id = 'flash'
    root.appendChild(flashEl)
    vinesEl = el('div')
    vinesEl.id = 'vines-hud'
    root.appendChild(vinesEl)
    hintEl = el('div')
    hintEl.id = 'hint-hud'
    root.appendChild(hintEl)
    charmWrap = el('div')
    charmWrap.id = 'charm-wrap'
    const lbl = el('div', '', STRINGS.charmLabel)
    lbl.id = 'charm-label'
    const track = el('div')
    track.id = 'charm-track'
    charmFill = el('div')
    charmFill.id = 'charm-fill'
    track.appendChild(charmFill)
    charmWrap.appendChild(lbl)
    charmWrap.appendChild(track)
    root.appendChild(charmWrap)
    vineTexts = []
    for (let i = 0; i <= 7; i++) vineTexts.push(STRINGS.hudVines + ' ✦ ' + i + '/7')
  },

  showTitle(onBegin) {
    const overlay = el('div', 'overlay title-overlay')
    const card = el('div', 'card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h1', 'game-title', STRINGS.title))
    card.appendChild(el('div', 'game-subtitle', STRINGS.subtitle))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'intro', STRINGS.intro))
    card.appendChild(el('p', 'help', STRINGS.help))
    const btn = el('button', 'btn', STRINGS.begin)
    card.appendChild(btn)
    overlay.appendChild(card)
    openModal(overlay, btn, onBegin)
  },

  showEnd(won) {
    const overlay = el('div', 'overlay end-overlay')
    const card = el('div', 'card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h1', 'game-title end-title', won ? STRINGS.winTitle : STRINGS.loseTitle))
    if (won) card.appendChild(el('div', 'win-charms', '✦ 7/7'))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'intro', won ? STRINGS.winText : STRINGS.loseText))
    const btn = el('button', 'btn', won ? STRINGS.winReplay : STRINGS.loseReplay)
    btn.addEventListener('click', () => window.location.reload())
    card.appendChild(btn)
    overlay.appendChild(card)
    root.appendChild(overlay)
    btn.focus()
  },

  setHUD(vines, total, charm, hint) {
    if (!hudShown) {
      hudShown = true
      vinesEl.classList.add('visible')
    }
    if (vines !== lastVines) {
      lastVines = vines
      vinesEl.textContent = vineTexts[vines] || STRINGS.hudVines + ' ✦ ' + vines + '/' + total
    }
    const c = Math.round(charm * 100) / 100
    if (c !== lastCharm) {
      lastCharm = c
      charmFill.style.transform = 'scaleX(' + c + ')'
    }
    const show = charm > 0.02
    if (show !== charmShown) {
      charmShown = show
      charmWrap.classList.toggle('show', show)
    }
    const vig = Math.round(charm * 50) / 50
    if (vig !== lastVig) {
      lastVig = vig
      gazeVig.style.opacity = vig
    }
    if (hint !== lastHint) {
      lastHint = hint
      hintEl.textContent = hint
      hintEl.classList.toggle('show', hint !== '')
    }
  },

  flash() {
    flashEl.classList.add('pop')
    setTimeout(() => flashEl.classList.remove('pop'), 90)
  },

  closeModal() {
    if (primaryBtn) primaryBtn.click()
  },

  isOpen() {
    return modalEl !== null
  },
}
