// LA PINCOYA — ui.js
// Title / win / lose cards in the collection's storybook style, plus the HUD:
// moon-to-horizon timer, fish count, net-streak markers, cast bar, toast line.
// HUD updates only touch the DOM when a displayed value changes.

const STR = {
  title: 'LA PINCOYA',
  subtitle: 'Marea alta',
  intro:
    'Dicen que la hija del Millalobo danza sobre la arena fría con la marea alta, ' +
    'y que el mar la mira como un perro mira a su amo. Cuando La Pincoya mira hacia ' +
    'el agua, los peces llegan en cardúmenes de plata; cuando le da la espalda, las ' +
    'redes suben vacías y la bahía queda callada como un aliento contenido. Llena la ' +
    'bodega antes de que la luna toque el horizonte — y no eches la red contra su ' +
    'espalda, que la tercera siempre se rompe.',
  help: 'A/D o flechas deslizar la lancha · Espacio echar la red · M sonido',
  begin: 'Comenzar',
  replay: 'Otra marea',
  toHub: '⌂ volver al archipiélago',
}

let overlayEl = null
let primaryBtn = null
let hudEl, moonEl, dawnEl, fishLine, fishN, netLine, netMarks, castBar, castFill, toastEl, muteChip
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
  fishLine = el('div', '')
  fishLine.id = 'fishline'
  fishLine.innerHTML = '✦ <b id="fishn">0</b> / 30 · pescados'
  netLine = el('div', '')
  netLine.id = 'netline'
  netLine.innerHTML = 'redes&ensp;<span>◆</span><span>◆</span><span>◆</span>'
  castBar = el('div', '')
  castBar.id = 'castbar'
  castFill = el('div', '')
  castFill.id = 'castfill'
  castBar.appendChild(castFill)
  hudEl.appendChild(track)
  hudEl.appendChild(fishLine)
  hudEl.appendChild(netLine)
  hudEl.appendChild(castBar)
  ui.appendChild(hudEl)
  fishN = fishLine.querySelector('#fishn')
  netMarks = netLine.querySelectorAll('span')

  toastEl = el('div', '')
  toastEl.id = 'toast'
  ui.appendChild(toastEl)

  muteChip = el('div', '', 'M · sonido')
  muteChip.id = 'mute-chip'
  ui.appendChild(muteChip)

  // Enter activates whichever card is up (title BEGIN, end-card replay)
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && primaryBtn) primaryBtn.click()
  })
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
let _fish = -1
let _streak = -1
let _castPct = -1
let _dawnOn = false
let popTimer = 0

function hud(fish, goal, timerK, streak, castK) {
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
  if (fish !== _fish) {
    _fish = fish
    fishN.textContent = String(fish)
    clearTimeout(popTimer)
    fishLine.classList.remove('pop')
    void fishLine.offsetWidth // restart the animation even on back-to-back hauls
    fishLine.classList.add('pop')
    popTimer = setTimeout(() => fishLine.classList.remove('pop'), 400)
  }
  if (streak !== _streak) {
    _streak = streak
    for (let i = 0; i < 3; i++) netMarks[i].classList.toggle('torn', i < streak)
    netLine.classList.toggle('warn', streak >= 2)
  }
  const pct = castK < 0 ? -1 : Math.round(castK * 100)
  if (pct !== _castPct) {
    _castPct = pct
    if (pct < 0) {
      castBar.classList.remove('show')
    } else {
      castBar.classList.add('show')
      castFill.style.width = pct + '%'
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
  muteChip.textContent = m ? 'M · silencio' : 'M · sonido'
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
