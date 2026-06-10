// CALEUCHE — Mitos de Chiloé · UI (vanilla DOM into #ui)
import { STRINGS } from './lore.js'

let root = null

// HUD refs + per-frame caches (updateHUD is called every frame — only touch
// the DOM when a value actually changed).
let hudEl = null
let favoresEl = null
let arrowEl = null
let hintEl = null
let hudVisible = false
let lastFound = -1
let lastTotal = -1
let lastDeg = null
let lastHint = null

// Banner
let bannerEl = null
let bannerTimer = 0

// Modal (title or encounter card)
let modalEl = null
let primaryBtn = null

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
  btn.addEventListener('click', () => {
    if (done) return
    done = true
    modalEl = null
    primaryBtn = null
    overlay.classList.add('closing')
    setTimeout(() => overlay.remove(), 700)
    if (onPrimary) onPrimary()
  })
  root.appendChild(overlay)
}

export const ui = {
  init() {
    root = document.getElementById('ui')
    root.innerHTML = ''

    bannerEl = el('div', '')
    bannerEl.id = 'banner'
    root.appendChild(bannerEl)

    hudEl = el('div', '')
    hudEl.id = 'hud'
    const row = el('div', 'hud-row')
    const compass = el('div', '')
    compass.id = 'compass'
    arrowEl = el('div', '')
    arrowEl.id = 'compass-arrow'
    compass.appendChild(arrowEl)
    favoresEl = el('span', '')
    favoresEl.id = 'hud-favores'
    row.appendChild(compass)
    row.appendChild(favoresEl)
    hintEl = el('div', '')
    hintEl.id = 'hud-hint'
    hudEl.appendChild(row)
    hudEl.appendChild(hintEl)
    root.appendChild(hudEl)
  },

  showTitle(onStart) {
    const overlay = el('div', 'overlay title-overlay')
    const card = el('div', 'card title-card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h1', 'game-title', STRINGS.title))
    card.appendChild(el('div', 'game-subtitle', STRINGS.subtitle))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'intro', STRINGS.intro))
    card.appendChild(el('p', 'help', STRINGS.help))
    const btn = el('button', 'btn', STRINGS.beginLabel)
    card.appendChild(btn)
    overlay.appendChild(card)
    openModal(overlay, btn, onStart)
  },

  showEncounter(being, onClose) {
    const overlay = el('div', 'overlay encounter-overlay')
    const card = el('div', 'card encounter-card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h2', 'being-name', being.name))
    card.appendChild(el('div', 'being-title', being.title))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'lore', being.lore))
    card.appendChild(el('p', 'blessing', '✦ ' + being.blessing))
    const btn = el('button', 'btn', STRINGS.continueLabel)
    card.appendChild(btn)
    overlay.appendChild(card)
    openModal(overlay, btn, onClose)
  },

  showBanner(text) {
    bannerEl.textContent = text
    bannerEl.classList.remove('show')
    void bannerEl.offsetWidth // restart the transition
    bannerEl.classList.add('show')
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 6000)
  },

  updateHUD(found, total, compassDeg, hint) {
    if (!hudVisible) {
      hudVisible = true
      hudEl.classList.add('visible')
    }
    if (found !== lastFound || total !== lastTotal) {
      lastFound = found
      lastTotal = total
      favoresEl.textContent = STRINGS.hudLabel + ' ✦ ' + found + '/' + total
    }
    const deg = Math.round(compassDeg / 3) * 3
    if (deg !== lastDeg) {
      lastDeg = deg
      arrowEl.style.transform = 'rotate(' + deg + 'deg)'
    }
    if (hint !== lastHint) {
      lastHint = hint
      hintEl.textContent = hint
      hintEl.classList.toggle('show', hint !== '')
    }
  },

  showWin() {
    const overlay = el('div', 'overlay win-overlay')
    const card = el('div', 'card win-card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h1', 'game-title win-title', STRINGS.winTitle))
    card.appendChild(el('div', 'win-charms', '✦ 6/6'))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'intro', STRINGS.winText))
    overlay.appendChild(card)
    root.appendChild(overlay)
  },

  closeModal() {
    if (primaryBtn) primaryBtn.click()
  },

  isModalOpen() {
    return modalEl !== null
  },
}
