// EL INVUNCHE · ui.js — title / win / lose cards, HUD (wax bar, seal count,
// hints), flash + blackout layers. Same dark-storybook card grammar as the
// flagship: serif, letter-spaced small caps, thin double borders, vignette.
// All DOM writes are event-time; per-frame HUD updates are gated by main.

const STRINGS = {
  title: 'EL INVUNCHE',
  epithet: 'La cueva de Quicaví',
  intro:
    'In the cave at Quicaví the brujos keep their guardián: a firstborn remade ' +
    '— la cabeza vuelta hacia atrás, one leg folded against the spine — so that ' +
    'nothing enters and nothing leaves. Your candle holds three minutes of wax; ' +
    'the cold seam of daylight will not open without los tres sellos. He cannot ' +
    'see far, but he listens — y la cueva escucha con él.',
  controls: 'wasd — walk · mouse / arrows — look · shift — run, he hears it · m — sonido',
  begin: 'BEGIN',
  won: {
    charm: '✦',
    title: 'EL AMANECER',
    sub: 'la puerta del día',
    body:
      'You put your shoulder to the stone and the day comes in cold and gray, ' +
      'smelling of rain and seaweed. Behind you the shuffling stops at the edge ' +
      'of the light — lo que los brujos hicieron no puede seguirte aquí. The ' +
      'seals crumble to ash in your pocket; Quicaví keeps its cave, but not you.',
    charms: '✦ ✦ ✦',
    btn: 'VOLVER A LA ISLA',
  },
  caught: {
    charm: '◦',
    title: 'LA CARA VUELTA',
    sub: 'te encontró',
    body:
      'The last thing the candle finds is a face turned the wrong way on its ' +
      'shoulders, close enough to share your breath. The brujos will have use ' +
      'for you — en la cueva siempre falta quien sirva. La cueva no devuelve lo que toma.',
    charms: '',
    btn: 'OTRA VELA',
  },
  dark: {
    charm: '◦',
    title: 'LA VELA MUERTA',
    sub: 'a oscuras',
    body:
      'The wick drowns in its own wax and the dark of Quicaví settles on you ' +
      'like wet wool. Somewhere near, something drags itself closer without ' +
      'hurry — ya no necesita correr. Nadie encuentra la puerta a oscuras.',
    charms: '',
    btn: 'OTRA VELA',
  },
}

export const ui = {
  root: null,
  hud: null,
  waxFill: null,
  waxWrap: null,
  sealsEl: null,
  hintEl: null,
  toastEl: null,
  muteEl: null,
  flashEl: null,
  blackoutEl: null,
  titleEl: null,
  endEl: null,
  _hintTimer: 0,
  _toastTimer: 0,

  init() {
    const root = document.getElementById('ui')
    this.root = root
    root.innerHTML =
      '<div class="vignette"></div>' +
      '<div id="flash"></div>' +
      '<div id="blackout"></div>' +
      '<div id="hud">' +
      '  <div id="wax-block">' +
      '    <div class="hud-label">cera</div>' +
      '    <div id="wax-bar"><div id="wax-fill"></div></div>' +
      '  </div>' +
      '</div>' +
      '<div id="hud-seals"><span class="hud-label">sellos</span> <span id="seal-pips">✧ ✧ ✧</span></div>' +
      '<div id="hint"></div>' +
      '<div id="toast"></div>' +
      '<div id="hud-mute">M · sonido</div>'
    this.hud = document.getElementById('hud')
    this.muteEl = document.getElementById('hud-mute')
    this.waxFill = document.getElementById('wax-fill')
    this.waxWrap = document.getElementById('wax-bar')
    this.sealsEl = document.getElementById('seal-pips')
    this.hintEl = document.getElementById('hint')
    this.toastEl = document.getElementById('toast')
    this.flashEl = document.getElementById('flash')
    this.blackoutEl = document.getElementById('blackout')
  },

  showTitle(onBegin) {
    const el = document.createElement('div')
    el.className = 'overlay title-overlay'
    el.innerHTML =
      '<div class="card">' +
      '  <div class="charm">✦</div>' +
      '  <h1 class="game-title">' + STRINGS.title + '</h1>' +
      '  <div class="game-subtitle">' + STRINGS.epithet + '</div>' +
      '  <div class="rule"></div>' +
      '  <p class="intro">' + STRINGS.intro + '</p>' +
      '  <p class="help">' + STRINGS.controls + '</p>' +
      '  <button class="btn" id="begin-btn">' + STRINGS.begin + '</button>' +
      '</div>'
    this.root.appendChild(el)
    this.titleEl = el
    document.getElementById('begin-btn').addEventListener('click', onBegin)
  },

  closeTitle() {
    const el = this.titleEl
    if (!el) return
    this.titleEl = null
    el.classList.add('closing')
    setTimeout(() => el.remove(), 1100)
    this.hud.classList.add('visible')
    document.getElementById('hud-seals').classList.add('visible')
    this.muteEl.classList.add('visible')
  },

  // kind: 'won' | 'caught' | 'dark'
  showEnd(kind) {
    if (this.endEl) return
    const s = STRINGS[kind]
    const el = document.createElement('div')
    el.className = 'overlay'
    el.innerHTML =
      '<div class="card">' +
      '  <div class="charm' + (kind === 'won' ? '' : ' charm-dead') + '">' + s.charm + '</div>' +
      '  <h1 class="game-title end-title">' + s.title + '</h1>' +
      '  <div class="game-subtitle">' + s.sub + '</div>' +
      '  <div class="rule"></div>' +
      '  <p class="intro">' + s.body + '</p>' +
      (s.charms ? '<div class="win-charms">' + s.charms + '</div>' : '') +
      '  <button class="btn" id="replay-btn">' + s.btn + '</button>' +
      '</div>'
    this.root.appendChild(el)
    this.endEl = el
    // 'VOLVER A LA ISLA' honors its label — the win returns to the hub
    document.getElementById('replay-btn').addEventListener('click', () => {
      if (kind === 'won') location.href = '/'
      else location.reload()
    })
  },

  isOverlayOpen() {
    return !!(this.titleEl || this.endEl)
  },

  setWax(pct, low) {
    this.waxFill.style.width = (pct < 0 ? 0 : pct > 100 ? 100 : pct) + '%'
    if (low) this.waxWrap.classList.add('low')
    else this.waxWrap.classList.remove('low')
  },

  setMuted(m) {
    this.muteEl.textContent = m ? 'M · silencio' : 'M · sonido'
    if (m) this.muteEl.classList.add('off')
    else this.muteEl.classList.remove('off')
  },

  setSeals(n) {
    let s = ''
    for (let i = 0; i < 3; i++) s += (i < n ? '✦' : '✧') + (i < 2 ? ' ' : '')
    this.sealsEl.textContent = s
    if (n > 0) this.sealsEl.classList.add('lit')
  },

  hint(text, holdMs) {
    clearTimeout(this._hintTimer)
    this.hintEl.textContent = text
    this.hintEl.classList.add('show')
    this._hintTimer = setTimeout(() => this.hintEl.classList.remove('show'), holdMs || 5200)
  },

  toast(text) {
    clearTimeout(this._toastTimer)
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1500)
  },

  flash(color, peak, ms) {
    const el = this.flashEl
    el.style.transition = 'none'
    el.style.background = color
    el.style.opacity = String(peak)
    // force reflow so the fade transition restarts cleanly
    void el.offsetWidth
    el.style.transition = 'opacity ' + (ms || 600) + 'ms ease-out'
    el.style.opacity = '0'
  },

  blackout(on) {
    if (on) this.blackoutEl.classList.add('show')
    else this.blackoutEl.classList.remove('show')
  },
}
