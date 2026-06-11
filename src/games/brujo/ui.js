/* ============================================================
   EL VUELO DEL BRUJO — UI: title / win / lose cards + HUD.
   All DOM lives in the existing #ui div. HUD writes are cached —
   only touch the DOM when a value changes.
   ============================================================ */

const S = {
  title: 'EL VUELO DEL BRUJO',
  subtitle: 'Macuñ',
  intro:
    'En Quicaví los brujos guardan un chaleco de piel humana —el macuñ— y quien ' +
    'lo viste puede andar el aire de la noche. Esta noche la reunión se junta al otro ' +
    'lado del canal, y la puerta de la cueva se abre solo mientras la luna sigue sobre el agua. ' +
    'Atraviesa los doce anillos de luz antes de que la luna se hunda; si caes, el macuñ se rasga.',
  help: 'mouse o flechas volar · W impulso · S frenar · M sonido',
  begin: 'PONTE EL MACUÑ',
  winTitle: 'LA REUNIÓN',
  winText:
    'El duodécimo anillo se cierra a tu espalda como un aliento contenido que al fin se suelta. ' +
    'Abajo, en la orilla negra de Quicaví, se abre una puerta que también es piedra: la reunión te espera. ' +
    'Pliegas el aire de la noche y desciendes. El macuñ, tibio contra tus costillas, te ha traído a casa.',
  loseMoon:
    'La luna se hunde y el canal se apaga de punta a punta. ' +
    'Sin su luz el macuñ es solo piel, y la piel no vuela. ' +
    'En alguna parte, abajo, el agua te recibe sin ruido.',
  loseTorn:
    'La tercera caída es la que el macuñ no perdona. Las costuras de piel se abren ' +
    'en pleno vuelo —se rasga el macuñ— y la noche te suelta. ' +
    'Los brujos encontrarán a otro que lo vista. Siempre lo hacen.',
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
    '<div id="hud-mute">M · sonido</div>'

  const el = {
    flash: document.getElementById('flash'),
    wetTint: document.getElementById('wet-tint'),
    hudTop: document.getElementById('hud-top'),
    hudBottom: document.getElementById('hud-bottom'),
    ring: document.getElementById('hud-ring'),
    moon: document.getElementById('hud-moon'),
    stamina: document.getElementById('stamina-fill'),
    staminaLabel: document.getElementById('stamina-label'),
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
  let cDepleted = false

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

  function setStamina(f, depleted) {
    const q = Math.round(f * 100)
    if (q !== cStam) {
      cStam = q
      el.stamina.style.transform = 'scaleX(' + f + ')'
    }
    const d = !!depleted
    if (d !== cDepleted) {
      cDepleted = d
      el.staminaLabel.classList.toggle('depleted', d)
    }
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
