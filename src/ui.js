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

// Modal (title, encounter card or bestiary)
let modalEl = null
let primaryBtn = null

// Bestiary hint (bottom-right, toggled by setBestiaryHint)
let bestiaryHintEl = null
let bestiaryHintVisible = false

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Returns a `close(callback)` function so secondary buttons (e.g. Resume)
// can dismiss the same modal with their own callback.
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
  btn.focus() // Enter/Space can dismiss even without a working pointer
  return close
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

    bestiaryHintEl = el('div', '', STRINGS.bestiaryHint)
    bestiaryHintEl.id = 'bestiary-hint'
    bestiaryHintVisible = false
    root.appendChild(bestiaryHintEl)
  },

  showTitle(onStart, resume) {
    const overlay = el('div', 'overlay title-overlay')
    const card = el('div', 'card title-card')
    card.appendChild(el('div', 'charm', '✦'))
    card.appendChild(el('h1', 'game-title', STRINGS.title))
    card.appendChild(el('div', 'game-subtitle', STRINGS.subtitle))
    card.appendChild(el('div', 'rule'))
    card.appendChild(el('p', 'intro', STRINGS.intro))
    card.appendChild(el('p', 'help', STRINGS.help))
    const stack = el('div', 'btn-stack')
    const btn = el('button', 'btn', STRINGS.beginLabel)
    stack.appendChild(btn)
    let resumeBtn = null
    if (resume) {
      resumeBtn = el('button', 'btn btn-resume', resume.label)
      stack.appendChild(resumeBtn)
    }
    card.appendChild(stack)
    overlay.appendChild(card)
    const close = openModal(overlay, btn, onStart)
    if (resume) {
      resumeBtn.addEventListener('click', () => close(resume.onResume))
    }
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

  showBestiary(entries, onClose) {
    const overlay = el('div', 'overlay bestiary-overlay')
    const card = el('div', 'card bestiary-card')
    card.appendChild(el('h2', 'bestiary-title', STRINGS.bestiaryTitle))
    card.appendChild(el('div', 'rule'))
    const list = el('div', 'bestiary-list')
    for (const e of entries) {
      const item = el(
        'div',
        e.found ? 'bestiary-entry' : 'bestiary-entry locked'
      )
      if (e.found) {
        item.appendChild(el('div', 'bestiary-name', e.name))
        item.appendChild(el('div', 'bestiary-epithet', e.title))
        item.appendChild(el('p', 'bestiary-lore', e.lore))
        item.appendChild(el('p', 'bestiary-mark', '✦ ' + e.blessing))
      } else {
        item.appendChild(
          el('div', 'bestiary-name locked-name', STRINGS.bestiaryLockedName)
        )
        item.appendChild(
          el('p', 'bestiary-lore locked-text', STRINGS.bestiaryLockedText)
        )
      }
      list.appendChild(item)
    }
    card.appendChild(list)
    const btn = el('button', 'btn', STRINGS.closeLabel)
    card.appendChild(btn)
    overlay.appendChild(card)
    openModal(overlay, btn, onClose)
  },

  setBestiaryHint(visible) {
    if (visible === bestiaryHintVisible) return
    bestiaryHintVisible = visible
    bestiaryHintEl.classList.toggle('show', visible)
  },

  showBlackout(text, onDone) {
    // NOT a modal: never touches modalEl/primaryBtn, so closeModal() ignores
    // it and isModalOpen() stays false. Sits above every other overlay.
    const overlay = el('div', 'blackout')
    overlay.appendChild(el('div', 'blackout-text', text))
    root.appendChild(overlay)
    void overlay.offsetWidth // commit opacity:0 so the cut-in transition runs
    overlay.classList.add('show')
    setTimeout(() => {
      overlay.classList.add('fading')
      setTimeout(() => {
        overlay.remove()
        if (onDone) onDone()
      }, 1000)
    }, 1750) // ~0.15 s cut-in + ~1.6 s hold
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
    const btn = el('button', 'btn', STRINGS.replayLabel)
    btn.addEventListener('click', () => window.location.reload())
    card.appendChild(btn)
    overlay.appendChild(card)
    root.appendChild(overlay)
    btn.focus()
  },

  closeModal() {
    if (primaryBtn) primaryBtn.click()
  },

  isModalOpen() {
    return modalEl !== null
  },
}
