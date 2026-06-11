// EL CUCHIVILU — ui.js
// Title / win / lose cards in the collection's storybook style, plus the HUD:
// moon-to-horizon timer, penned-fish tally, corral integrity, tide chip and
// the repair bar. HUD updates only touch the DOM when a displayed value moves.

const STR = {
  title: 'EL CUCHIVILU',
  subtitle: 'El corral roto',
  intro:
    'For three generations your family’s corral de pesca has drunk the tide at ' +
    'Quetalco — a half-moon of grey stones that keeps whatever silver the sea ' +
    'forgets. Tonight something is wallowing out in the shallows: El Cuchivilu, ' +
    'the serpent with a pig’s snout, who roots corrales open stone by stone and ' +
    'leaves hunger in the mud where he rolls. Herd the schools in while la marea ' +
    'runs high, mend what he breaks, and meet him bow-first at full stroke — if ' +
    'fewer than twenty-five fish see the dawn behind stone, la familia pasa hambre.',
  help: 'w a s d · remar — e · reparar la brecha (mantén) — embístelo a todo remo — m · sonido',
  begin: 'Begin',
  replay: 'Otra noche',
  toHub: '⌂ volver al archipiélago',
}

let overlayEl = null
let primaryBtn = null
let hudEl, moonEl, dawnEl, penLine, penN, segLine, segN, tideChip, repairBar, repairFill, toastEl, muteChip
let toastTimer = 0

function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}

function init() {
  const ui = document.getElementById('ui')

  const vig = el('div', '')
  vig.id = 'vignette'
  ui.appendChild(vig)

  hudEl = el('div', '')
  hudEl.id = 'hud'
  const track = el('div', '')
  track.id = 'moontrack'
  dawnEl = el('div', '')
  dawnEl.id = 'dawnglow'
  moonEl = el('div', '')
  moonEl.id = 'moon'
  track.appendChild(dawnEl)
  track.appendChild(moonEl)
  penLine = el('div', '')
  penLine.id = 'penline'
  penLine.innerHTML = '✦ <b id="pennedn">0</b> / 25 · encerrados'
  segLine = el('div', '')
  segLine.id = 'segline'
  segLine.innerHTML = 'corral <b id="segn">12</b> / 12 &ensp;·&ensp; <span id="tidechip">marea baja</span>'
  repairBar = el('div', '')
  repairBar.id = 'repairbar'
  repairFill = el('div', '')
  repairFill.id = 'repairfill'
  repairBar.appendChild(repairFill)
  hudEl.appendChild(track)
  hudEl.appendChild(penLine)
  hudEl.appendChild(segLine)
  hudEl.appendChild(repairBar)
  ui.appendChild(hudEl)
  penN = penLine.querySelector('#pennedn')
  segN = segLine.querySelector('#segn')
  tideChip = segLine.querySelector('#tidechip')

  toastEl = el('div', '')
  toastEl.id = 'toast'
  ui.appendChild(toastEl)

  muteChip = el('div', '', 'm · sonido')
  muteChip.id = 'mute-chip'
  ui.appendChild(muteChip)
}

function removeOverlay() {
  if (!overlayEl) return
  const o = overlayEl
  overlayEl = null
  primaryBtn = null
  o.classList.add('closing')
  setTimeout(() => o.remove(), 950)
}

function showTitle(onBegin) {
  const ui = document.getElementById('ui')
  overlayEl = el('div', 'overlay')
  const card = el('div', 'card')
  card.appendChild(el('div', 'charm', '✦'))
  card.appendChild(el('h1', 'game-title', STR.title))
  card.appendChild(el('div', 'game-subtitle', STR.subtitle))
  card.appendChild(el('div', 'rule'))
  card.appendChild(el('p', 'intro', STR.intro))
  card.appendChild(el('p', 'help', STR.help))
  const btn = el('button', 'btn', STR.begin)
  let used = false
  btn.addEventListener('click', () => {
    if (used) return
    used = true
    removeOverlay()
    onBegin()
  })
  card.appendChild(btn)
  overlayEl.appendChild(card)
  ui.appendChild(overlayEl)
  primaryBtn = btn
  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      window.removeEventListener('keydown', onKey)
      btn.click()
    }
  }
  window.addEventListener('keydown', onKey)
}

function showEnd({ won, title, charms, body }) {
  if (overlayEl) {
    overlayEl.remove() // hard-replace whatever card is up
    overlayEl = null
    primaryBtn = null
  }
  const ui = document.getElementById('ui')
  overlayEl = el('div', 'overlay')
  const card = el('div', 'card' + (won ? '' : ' lost'))
  card.appendChild(el('div', 'charm', won ? '✦' : '✕'))
  card.appendChild(el('h1', 'game-title end-title', title))
  if (charms) card.appendChild(el('div', 'end-charms', charms))
  card.appendChild(el('div', 'rule'))
  card.appendChild(el('p', 'intro', body))
  const stack = el('div', 'btn-stack')
  const btn = el('button', 'btn', STR.replay)
  btn.addEventListener('click', () => location.reload())
  const hub = el('a', 'btn btn-quiet', STR.toHub)
  hub.href = '/'
  stack.appendChild(btn)
  stack.appendChild(hub)
  card.appendChild(stack)
  overlayEl.appendChild(card)
  ui.appendChild(overlayEl)
  primaryBtn = btn
}

function isOverlayOpen() {
  return overlayEl !== null
}

function closeOverlay() {
  if (primaryBtn) primaryBtn.click()
}

function setHUDVisible(v) {
  hudEl.classList.toggle('visible', v)
}

// ---- per-frame HUD (cheap: caches, writes only on change) -----------------
let _moonPx = -1
let _pen = -1
let _stand = -1
let _alta = null
let _repPct = -1
let _dawnOn = false

function hud(penned, goal, timerK, standing, alta, repairK) {
  const px = Math.round(timerK * 277)
  if (px !== _moonPx) {
    _moonPx = px
    moonEl.style.transform = 'translateX(' + px + 'px)'
  }
  const dawnOn = timerK > 0.72
  if (dawnOn !== _dawnOn) {
    _dawnOn = dawnOn
    dawnEl.style.opacity = dawnOn ? '1' : '0'
  }
  if (penned !== _pen) {
    _pen = penned
    penN.textContent = String(penned)
    penLine.classList.add('pop')
    setTimeout(() => penLine.classList.remove('pop'), 400)
  }
  if (standing !== _stand) {
    _stand = standing
    segN.textContent = String(standing)
    segLine.classList.toggle('warn', standing <= 7 && standing > 5)
    segLine.classList.toggle('danger', standing <= 5)
  }
  if (alta !== _alta) {
    _alta = alta
    tideChip.textContent = alta ? 'marea alta' : 'marea baja'
    tideChip.classList.toggle('alta', alta)
  }
  const pct = repairK < 0 ? -1 : Math.round(repairK * 100)
  if (pct !== _repPct) {
    _repPct = pct
    if (pct < 0) {
      repairBar.classList.remove('show')
    } else {
      repairBar.classList.add('show')
      repairFill.style.width = pct + '%'
    }
  }
}

function toast(text, mood, dur) {
  toastEl.textContent = text
  toastEl.className = 'show' + (mood ? ' ' + mood : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastEl.className = ''
  }, dur || 2300)
}

function setMuted(m) {
  muteChip.textContent = m ? 'm · sonido apagado' : 'm · sonido'
}

export const ui = {
  init,
  showTitle,
  showEnd,
  isOverlayOpen,
  closeOverlay,
  setHUDVisible,
  hud,
  toast,
  setMuted,
}
