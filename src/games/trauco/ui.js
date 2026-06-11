// ui.js — EL TRAUCO · overlays + HUD (vanilla DOM into #ui).
// setHUD() runs every frame: every DOM write is cached behind a change check.
export const STRINGS = {
  title: 'EL TRAUCO',
  subtitle: 'No le sostengas la mirada',
  intro:
    'En lo hondo del bosque de Chiloé vive el Trauco, un poder viejo y rechoncho ' +
    'vestido de quilineja trenzada, con un hacha de piedra que voltea el árbol más ' +
    'grueso en tres golpes. No es el hacha lo que debes temer: es su mirada, que ' +
    'dobla a un hombre hecho como vara verde. Junta siete hebras de quilineja ' +
    'encendida y escapa por la puerta vieja, y oigas lo que oigas en la niebla, ' +
    'no le sostengas la mirada.',
  help: 'WASD moverse · mouse mirar · Shift correr (hace ruido) · M sonido',
  begin: 'COMENZAR',
  winTitle: 'EL BOSQUE TE SUELTA',
  winText:
    'Siete hebras de quilineja, cortadas de la misma enredadera que lo viste. Al ' +
    'cruzar entre los troncos inclinados la lumbre tiembla y se apaga como una vela, ' +
    'y a tu espalda algo pequeño zapatea dos veces en la niebla — y te suelta. ' +
    'No mires atrás.',
  winReplay: 'OTRA NOCHE',
  loseTitle: 'TE DOBLÓ LA MIRADA',
  loseText:
    'Le sostuviste la mirada un latido de más, y tu voluntad se dobló como se dobla ' +
    'la quilineja: sin quebrarse, y sin enderezarse nunca. La niebla se queda con lo ' +
    'que encanta. La próxima vez, pon un tronco entre tus ojos y los suyos.',
  loseReplay: 'INTENTAR DE NUEVO',
  hudVines: 'quilineja',
  charmLabel: 'la mirada',
}

let root = null
let modalEl = null
let primaryBtn = null

// painted overlay backdrop (gpt-image-1, /assets/trauco/title.png).
// The 'art' class is ONLY added once the image has actually loaded — if the
// file is missing or fails, no class is added and the overlays keep their
// original pure-gradient look (exact pre-art behavior).
let artOk = false
const artImg = new Image()
artImg.onload = () => {
  artOk = true
  if (modalEl) modalEl.classList.add('art')
}
artImg.src = '/assets/trauco/title.png'

let vinesEl, hintEl, charmWrap, charmFill, gazeVig, flashEl, muteEl
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
  if (artOk) overlay.classList.add('art')
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
    muteEl = el('div', '', 'M · sonido')
    muteEl.id = 'mute-tag'
    root.appendChild(muteEl)
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
    card.appendChild(btn)
    overlay.appendChild(card)
    openModal(overlay, btn, () => window.location.reload())
  },

  setHUD(vines, total, charm, hint) {
    if (!hudShown) {
      hudShown = true
      vinesEl.classList.add('visible')
    }
    if (vines !== lastVines) {
      const wasCollect = lastVines !== -1 // not the initial HUD reveal
      lastVines = vines
      vinesEl.textContent = vineTexts[vines] || STRINGS.hudVines + ' ✦ ' + vines + '/' + total
      if (wasCollect) {
        vinesEl.classList.remove('pop')
        void vinesEl.offsetWidth // restart the pop animation
        vinesEl.classList.add('pop')
      }
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

  setMuted(m) {
    muteEl.textContent = m ? 'M · silencio' : 'M · sonido'
    muteEl.classList.toggle('off', m)
  },

  closeModal() {
    if (primaryBtn) primaryBtn.click()
  },

  isOpen() {
    return modalEl !== null
  },
}
