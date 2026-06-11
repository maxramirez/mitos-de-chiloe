// EL INVUNCHE · ui.js — title / win / lose cards, HUD (wax bar, seal count,
// hints), flash + blackout layers. Same dark-storybook card grammar as the
// flagship: serif, letter-spaced small caps, thin double borders, vignette.
// All DOM writes are event-time; per-frame HUD updates are gated by main.

const STRINGS = {
  title: 'EL INVUNCHE',
  epithet: 'La cueva de Quicaví',
  intro:
    'En la cueva de Quicaví los brujos guardan a su guardián: un primogénito ' +
    'rehecho — la cabeza vuelta hacia atrás, una pierna doblada contra el ' +
    'espinazo — para que nada entre y nada salga. Tu vela guarda tres minutos ' +
    'de cera; la rendija fría del día no se abrirá sin los tres sellos. Él no ' +
    've lejos, pero escucha — y la cueva escucha con él.',
  controls: 'WASD moverse · mouse o flechas mirar · Shift correr, él lo oye · M sonido',
  begin: 'COMENZAR',
  won: {
    charm: '✦',
    title: 'EL AMANECER',
    sub: 'la puerta del día',
    body:
      'Empujas la piedra con el hombro y el día entra frío y gris, oliendo a ' +
      'lluvia y a algas. A tu espalda, el arrastre se detiene en el borde de ' +
      'la luz — lo que los brujos hicieron no puede seguirte aquí. Los sellos ' +
      'se deshacen en ceniza dentro de tu bolsillo; Quicaví se queda con su ' +
      'cueva, pero no contigo.',
    charms: '✦ ✦ ✦',
    btn: 'VOLVER A LA ISLA',
  },
  caught: {
    charm: '◦',
    title: 'LA CARA VUELTA',
    sub: 'te encontró',
    body:
      'Lo último que encuentra la vela es una cara vuelta al revés sobre sus ' +
      'hombros, tan cerca que comparte tu aliento. Los brujos sabrán darte ' +
      'uso — en la cueva siempre falta quien sirva. La cueva no devuelve lo que toma.',
    charms: '',
    btn: 'OTRA VELA',
  },
  dark: {
    charm: '◦',
    title: 'LA VELA MUERTA',
    sub: 'a oscuras',
    body:
      'El pabilo se ahoga en su propia cera y la oscuridad de Quicaví se posa ' +
      'sobre ti como lana mojada. Cerca, algo se arrastra hacia ti sin apuro ' +
      '— ya no necesita correr. Nadie encuentra la puerta a oscuras.',
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
    // painted cave backdrop — applied only once the PNG actually arrives, so a
    // missing/failed asset leaves the plain gradient overlay untouched.
    const art = new Image()
    art.onload = () => {
      if (this.titleEl === el) el.classList.add('has-art')
    }
    art.src = '/assets/invunche/title.png'
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
