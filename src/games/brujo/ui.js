/* ============================================================
   EL VUELO DEL BRUJO — UI: title / win / lose cards + HUD.
   All DOM lives in the existing #ui div. HUD writes are cached —
   only touch the DOM when a value changes.
   ============================================================ */

const S = {
  title: 'EL VUELO DEL BRUJO',
  subtitle: 'Macuñ',
  intro:
    'In Quicaví the brujos keep a vest of human skin — the macuñ — and whoever ' +
    'wears it may ride the night air. Tonight the reunión convenes across the channel, ' +
    'and the door of the cueva opens only while the moon is above the water. ' +
    'Thread the twelve anillos de luz before la luna se hunde — or fall, and the macuñ tears.',
  help: 'mouse or arrows steer · W boost · S brake · M sound',
  begin: 'PONTE EL MACUÑ',
  winTitle: 'LA REUNIÓN',
  winText:
    'The twelfth ring closes behind you like a held breath released. Below, on the black ' +
    'shore of Quicaví, a door that is also a stone swings open — la reunión te espera. ' +
    'You fold the night air and descend. The macuñ, warm against your ribs, has carried you home.',
  loseMoon:
    'La luna se hunde, and the channel goes dark from one end to the other. ' +
    'Without her light the macuñ is only skin, and skin does not fly. ' +
    'Somewhere below, the water accepts you quietly.',
  loseTorn:
    'The third fall is the one the macuñ does not forgive. The seams of skin split ' +
    'mid-air — se rasga el macuñ — and the night lets go of you. ' +
    'The brujos will find another wearer. They always do.',
  replay: 'VOLAR DE NUEVO',
}

export function createUI() {
  const root = document.getElementById('ui')

  /* static layers */
  root.innerHTML =
    '<div id="vignette"></div>' +
    '<div id="wet-tint"></div>' +
    '<div id="flash"></div>' +
    '<div id="hud-top"><div id="hud-ring"></div><div id="hud-moon"></div></div>' +
    '<div id="hud-bottom">' +
    '<div id="stamina-label">aliento</div>' +
    '<div id="stamina-bar"><div id="stamina-fill"></div></div>' +
    '<div id="hud-crashes"></div>' +
    '</div>' +
    '<div id="hud-wet">alas mojadas…</div>' +
    '<div id="hud-mute">m · sound</div>'

  const el = {
    flash: document.getElementById('flash'),
    wetTint: document.getElementById('wet-tint'),
    hudTop: document.getElementById('hud-top'),
    hudBottom: document.getElementById('hud-bottom'),
    ring: document.getElementById('hud-ring'),
    moon: document.getElementById('hud-moon'),
    stamina: document.getElementById('stamina-fill'),
    crashes: document.getElementById('hud-crashes'),
    wet: document.getElementById('hud-wet'),
  }

  let overlay = null

  function card(html) {
    closeOverlay()
    overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = '<div class="card">' + html + '</div>'
    root.appendChild(overlay)
    return overlay
  }

  function closeOverlay() {
    if (!overlay) return
    const o = overlay
    overlay = null
    o.classList.add('closing')
    setTimeout(() => o.remove(), 950)
  }

  function showTitle(onBegin) {
    const o = card(
      '<div class="charm">✦</div>' +
      '<h1 class="game-title">' + S.title + '</h1>' +
      '<div class="game-subtitle">' + S.subtitle + '</div>' +
      '<div class="rule"></div>' +
      '<p class="intro">' + S.intro + '</p>' +
      '<div class="help">' + S.help + '</div>' +
      '<button class="btn" id="begin-btn">' + S.begin + '</button>'
    )
    o.querySelector('#begin-btn').addEventListener('click', () => {
      closeOverlay()
      onBegin()
    })
  }

  function showEnd(won, reason) {
    const text = won ? S.winText : reason === 'torn' ? S.loseTorn : S.loseMoon
    const title = won ? S.winTitle : reason === 'torn' ? 'SE RASGA EL MACUÑ' : 'LUNA HUNDIDA'
    const charms = won ? '✦ 12 / 12 ✦' : '✦'
    const o = card(
      '<div class="charm">' + (won ? '✦' : '◦') + '</div>' +
      '<h1 class="game-title end-title">' + title + '</h1>' +
      '<div class="rule"></div>' +
      '<p class="intro">' + text + '</p>' +
      '<div class="end-charms">' + charms + '</div>' +
      '<div class="rule"></div>' +
      '<button class="btn" id="replay-btn">' + S.replay + '</button>'
    )
    if (!won) o.querySelector('.card').classList.add('lost')
    o.querySelector('#replay-btn').addEventListener('click', () => location.reload())
  }

  function showHUD() {
    el.hudTop.classList.add('visible')
    el.hudBottom.classList.add('visible')
  }

  /* ---- cached HUD writes ---- */
  let cRing = -1
  let cMoon = -1
  let cStam = -1
  let cCrash = -1
  let cWet = null

  function setRing(n, total) {
    if (n === cRing) return
    cRing = n
    el.ring.innerHTML = 'anillo <b>' + Math.min(n + 1, total) + '</b> / ' + total
    el.ring.classList.remove('pulse')
    void el.ring.offsetWidth /* restart animation */
    el.ring.classList.add('pulse')
  }

  function setMoon(seconds) {
    const s = Math.max(0, Math.ceil(seconds))
    if (s === cMoon) return
    cMoon = s
    const mm = Math.floor(s / 60)
    const ss = String(s % 60).padStart(2, '0')
    el.moon.innerHTML = 'la luna se hunde · <b>' + mm + ':' + ss + '</b>'
    el.moon.classList.toggle('late', s <= 45)
  }

  function setStamina(f) {
    const q = Math.round(f * 100)
    if (q === cStam) return
    cStam = q
    el.stamina.style.transform = 'scaleX(' + f + ')'
  }

  function setCrashes(n, max) {
    if (n === cCrash) return
    cCrash = n
    let h = ''
    for (let i = 0; i < max; i++) {
      h += i < max - n ? '<span>✦</span>' : '<span class="torn">✕</span>'
    }
    el.crashes.innerHTML = h
  }

  function setWet(on) {
    if (on === cWet) return
    cWet = on
    el.wet.classList.toggle('show', on)
    el.wetTint.classList.toggle('show', on)
  }

  /* flash: quick full-screen blink (green for rings, red for crashes) */
  let flashT = 0
  function flash(kind) {
    el.flash.className = kind === 'crash' ? 'crash' : ''
    flashT = kind === 'crash' ? 0.5 : 0.35
  }

  function update(dt) {
    if (flashT > 0) {
      flashT -= dt
      el.flash.style.opacity = Math.max(0, flashT * (el.flash.className === 'crash' ? 0.7 : 0.5))
    }
  }

  return { showTitle, showEnd, showHUD, setRing, setMoon, setStamina, setCrashes, setWet, flash, update, closeOverlay }
}
