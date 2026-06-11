// EL BRUJO DE QUICAVÍ · ui.js — title / win / lose cards, HUD (páginas 0/7),
// hint + whisper lines, contextual prompt, boat-push hold bar, flash,
// blackout, and the full-screen STATIC overlay (a low-res noise canvas,
// redrawn ≤ 24 fps into a reused ImageData — no per-frame allocations).
// Same dark-storybook card grammar as the rest of the collection.

const STRINGS = {
  title: 'EL BRUJO DE QUICAVÍ',
  epithet: 'Las siete páginas',
  intro:
    'En Quicaví los brujos guardan su pacto escrito en siete páginas de ' +
    'pergamino de piel — esta noche están clavadas a los árboles del bosque ' +
    'negro. Arranca las siete y el bote junto al cerco te sacará de aquí, ' +
    'hacia la luz de la costa. Pero algo cuida las páginas: no camina, ' +
    'simplemente está ahí cuando te das vuelta — y mirarlo demasiado lo deja entrar.',
  controls: 'WASD moverse · mouse o flechas mirar · Shift correr · E o clic tomar · M sonido',
  begin: 'COMENZAR',
  won: {
    charm: '✦',
    title: 'EL CANAL TE SUELTA',
    sub: 'siete de siete',
    body:
      'El casco raspa el pedregal y el agua negra del canal te recibe, fría y ' +
      'segura. A tu espalda el bosque se queda muy quieto — cada árbol ' +
      'sosteniendo su forma con demasiado cuidado. Las siete páginas no pesan ' +
      'nada en tu abrigo, y el brujo de Quicaví se queda sin su pacto. ' +
      'Esta noche, el canal te deja ir.',
    charms: '✦ ✦ ✦ ✦ ✦ ✦ ✦',
    btn: 'VOLVER A LA ISLA',
  },
  caught: {
    charm: '◦',
    title: 'LA MIRADA',
    sub: 'lo miraste demasiado',
    body:
      'La estática era él, entrando por tus ojos — el que mira al brujo le ' +
      'abre la puerta. El farol rueda entre las hojas mojadas y se apaga, y ' +
      'siete páginas vuelven volando a sus árboles como pájaros. Quien ' +
      'encuentre el farol no te encontrará a ti. No lo mires: cuenta las ' +
      'páginas, y sigue caminando.',
    charms: '',
    btn: 'OTRA NOCHE',
  },
}

export const ui = {
  root: null,
  hud: null,
  pipsEl: null,
  countEl: null,
  hintEl: null,
  whisperEl: null,
  promptEl: null,
  holdWrap: null,
  holdFill: null,
  toastEl: null,
  flashEl: null,
  blackoutEl: null,
  staticEl: null,
  titleEl: null,
  endEl: null,
  _hintTimer: 0,
  _whisperTimer: 0,
  _toastTimer: 0,
  _sctx: null,
  _img: null,
  _u32: null,
  _noiseSeed: 77,
  _lastDraw: -1,
  _lastOp: -1,
  _lastPrompt: '',
  _lastHold: -1,

  init() {
    const root = document.getElementById('ui')
    this.root = root
    root.innerHTML =
      '<canvas id="static" width="160" height="90"></canvas>' +
      '<div class="vignette"></div>' +
      '<div id="flash"></div>' +
      '<div id="blackout"></div>' +
      '<div id="hud"><span class="hud-label">páginas</span> <span id="page-count">0 / 7</span> <span id="page-pips">✧ ✧ ✧ ✧ ✧ ✧ ✧</span></div>' +
      '<div id="whisper"></div>' +
      '<div id="hint"></div>' +
      '<div id="prompt-block"><div id="prompt"></div><div id="hold-bar"><div id="hold-fill"></div></div></div>' +
      '<div id="toast"></div>'
    this.hud = document.getElementById('hud')
    this.pipsEl = document.getElementById('page-pips')
    this.countEl = document.getElementById('page-count')
    this.hintEl = document.getElementById('hint')
    this.whisperEl = document.getElementById('whisper')
    this.promptEl = document.getElementById('prompt')
    this.holdWrap = document.getElementById('hold-bar')
    this.holdFill = document.getElementById('hold-fill')
    this.toastEl = document.getElementById('toast')
    this.flashEl = document.getElementById('flash')
    this.blackoutEl = document.getElementById('blackout')
    this.staticEl = document.getElementById('static')
    try {
      this._sctx = this.staticEl.getContext('2d')
      this._img = this._sctx.createImageData(160, 90)
      this._u32 = new Uint32Array(this._img.data.buffer)
    } catch (e) {
      this._sctx = null
    }
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
  },

  // kind: 'won' | 'caught'
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
    document.getElementById('replay-btn').addEventListener('click', () => location.reload())
  },

  isOverlayOpen() {
    return !!(this.titleEl || this.endEl)
  },

  setPages(n) {
    this.countEl.textContent = n + ' / 7'
    let s = ''
    for (let i = 0; i < 7; i++) s += (i < n ? '✦' : '✧') + (i < 6 ? ' ' : '')
    this.pipsEl.textContent = s
    if (n > 0) this.pipsEl.classList.add('lit')
  },

  // the static overlay — opacity write gated, noise redrawn ≤ 24 fps by main.
  // progressive curve: grain at low values, a wall of snow only near full.
  setStatic(v) {
    const op = v <= 0.004 ? 0 : Math.min(0.92, Math.pow(v, 1.7) * 0.95 + v * 0.06)
    const q = Math.round(op * 100)
    if (q !== this._lastOp) {
      this._lastOp = q
      this.staticEl.style.opacity = String(q / 100)
    }
  },

  drawStatic(simT) {
    if (!this._sctx || this._lastOp <= 0) return
    if (simT - this._lastDraw < 1 / 24) return
    this._lastDraw = simT
    const u = this._u32
    let s = this._noiseSeed
    for (let i = 0; i < u.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0
      const v = s >>> 24
      u[i] = 0xff000000 | (v << 16) | (v << 8) | v
    }
    this._noiseSeed = s
    this._sctx.putImageData(this._img, 0, 0)
  },

  hint(text, holdMs) {
    clearTimeout(this._hintTimer)
    this.hintEl.textContent = text
    this.hintEl.classList.add('show')
    this._hintTimer = setTimeout(() => this.hintEl.classList.remove('show'), holdMs || 5200)
  },

  whisper(text, holdMs) {
    clearTimeout(this._whisperTimer)
    this.whisperEl.textContent = text
    this.whisperEl.classList.add('show')
    this._whisperTimer = setTimeout(() => this.whisperEl.classList.remove('show'), holdMs || 2600)
  },

  prompt(text) {
    const t = text || ''
    if (t === this._lastPrompt) return
    this._lastPrompt = t
    this.promptEl.textContent = t
    if (t) this.promptEl.classList.add('show')
    else this.promptEl.classList.remove('show')
  },

  hold(p) {
    const q = p <= 0 ? -1 : Math.round(Math.min(1, p) * 100)
    if (q === this._lastHold) return
    this._lastHold = q
    if (q < 0) {
      this.holdWrap.classList.remove('show')
    } else {
      this.holdWrap.classList.add('show')
      this.holdFill.style.width = q + '%'
    }
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
    void el.offsetWidth // restart the fade cleanly
    el.style.transition = 'opacity ' + (ms || 600) + 'ms ease-out'
    el.style.opacity = '0'
  },

  blackout(on) {
    if (on) this.blackoutEl.classList.add('show')
    else this.blackoutEl.classList.remove('show')
  },
}
