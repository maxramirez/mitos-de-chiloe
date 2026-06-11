// EL CAMAHUETO — ui.js
// Overlay cards (title / win / lose) and the in-game HUD, in the collection's
// dark-storybook style. DOM is built once; per-frame HUD updates only touch
// the DOM when a displayed value actually changes.

export function createUI(root) {
  root.innerHTML = `
    <div class="vignette"></div>
    <div id="flash"></div>
    <div id="hud">
      <div class="hud-right">
        <div id="hud-dist">EL MAR · 1900 M</div>
        <div id="hud-shv"><b>✦ 0</b> virutas</div>
        <div id="hud-lives">⟡ ⟡ ⟡</div>
      </div>
      <div id="hud-mute">M · sonido</div>
    </div>
    <div id="overlay" class="overlay">
      <div class="card" id="card"></div>
    </div>`;

  const overlay = root.querySelector('#overlay');
  const card = root.querySelector('#card');
  const hud = root.querySelector('#hud');
  const flash = root.querySelector('#flash');
  const elDist = root.querySelector('#hud-dist');
  const elShv = root.querySelector('#hud-shv');
  const elLives = root.querySelector('#hud-lives');
  const elMute = root.querySelector('#hud-mute');

  let lastDist = -1;
  let lastShv = -1;
  let lastLives = -1;
  let flashTO = 0;
  let closeTO = 0;

  const LIVES = ['◇ ◇ ◇', '⟡ ◇ ◇', '⟡ ⟡ ◇', '⟡ ⟡ ⟡']; // index = lives remaining

  // painted card art; if the PNG is missing or fails to decode, the inline
  // onerror removes the <img> and the card renders in its text-only form.
  const art = (name, cls) =>
    `<img class="card-art${cls ? ' ' + cls : ''}" alt="" src="../assets/camahueto/${name}.png" onerror="this.remove()">`;

  function openOverlay() {
    clearTimeout(closeTO);
    overlay.classList.remove('closing');
    overlay.classList.add('open');
    hud.classList.remove('on');
  }

  function showTitle(onBegin) {
    card.innerHTML = `
      ${art('card-title')}
      <div class="charm">✦</div>
      <h1 class="game-title">EL CAMAHUETO</h1>
      <div class="game-subtitle">La bajada</div>
      <div class="rule"></div>
      <p class="intro">Veinticinco años creció bajo el cerro el ternero de un solo cuerno, y esta
      noche rompe hacia el mar, abriendo <i>la quebrada</i> entre tierra y piedra.
      Donde el cuerno de oro raspa la roca quedan <i>virutas</i>, que las machis muelen
      en remedios que valen el sueldo de un invierno. Baja por la tierra rota tras él,
      junta el oro que puedas, y no dejes que la quebrada te bote.</p>
      <div class="help">A / D&nbsp;o&nbsp;← → moverse &nbsp;·&nbsp; espacio saltar &nbsp;·&nbsp; M sonido</div>
      <button id="begin-btn" class="btn">COMENZAR LA BAJADA</button>`;
    openOverlay();
    card.querySelector('#begin-btn').addEventListener('click', onBegin);
  }

  function showWin(shavingCount) {
    card.innerHTML = `
      ${art('card-sea')}
      <div class="charm">✦</div>
      <h1 class="game-title">EL MAR</h1>
      <div class="game-subtitle">Seña reunida</div>
      <div class="rule"></div>
      <p class="intro">La quebrada se abre y el ternero entra a la rompiente en una lámina de
      plata — se pierde más allá de los huiros, hacia los rebaños del Millalobo. Quedas
      de pie en la espuma fría, con <b class="gold">✦ ${shavingCount} virutas de cuerno</b>
      envueltas en el poncho. Las machis pagarán bien.</p>
      <button id="again-btn" class="btn">OTRA VEZ</button>
      <a class="back" href="../">⌂ volver a los mitos</a>`;
    openOverlay();
    card.querySelector('#again-btn').addEventListener('click', () => location.reload());
  }

  function showLose(shavingCount) {
    card.innerHTML = `
      ${art('card-title', 'grim')}
      <div class="charm">✦</div>
      <h1 class="game-title">LA QUEBRADA</h1>
      <div class="game-subtitle">No perdona</div>
      <div class="rule"></div>
      <p class="intro">Tres golpes, y la tierra rota te escupió contra las piedras. Allá abajo,
      el ternero de plata llegó al mar sin testigos, y la marea ya se lleva
      ${shavingCount > 0 ? `las <b class="gold">${shavingCount} virutas</b> de tus manos abiertas` : 'el oro que nunca juntaste'}.
      <i>La quebrada no perdona.</i></p>
      <button id="again-btn" class="btn">OTRA VEZ</button>
      <a class="back" href="../">⌂ volver a los mitos</a>`;
    openOverlay();
    card.querySelector('#again-btn').addEventListener('click', () => location.reload());
  }

  function hideOverlay() {
    overlay.classList.remove('open');
    overlay.classList.add('closing'); // brief fade out instead of a hard cut
    clearTimeout(closeTO);
    closeTO = setTimeout(() => overlay.classList.remove('closing'), 480);
    hud.classList.add('on');
  }

  function setDistance(m) {
    const v = Math.max(0, Math.ceil(m / 10) * 10);
    if (v === lastDist) return;
    lastDist = v;
    elDist.textContent = 'EL MAR · ' + v + ' M';
  }

  function setShavings(n) {
    if (n === lastShv) return;
    lastShv = n;
    elShv.innerHTML = '<b>✦ ' + n + '</b> virutas';
    elShv.classList.remove('pop');
    void elShv.offsetWidth; // restart the pop animation
    elShv.classList.add('pop');
  }

  function setLives(remaining) {
    const r = Math.max(0, Math.min(3, remaining));
    if (r === lastLives) return;
    lastLives = r;
    elLives.textContent = LIVES[r];
    elLives.classList.toggle('hurt', r < 3);
  }

  function flashHit() {
    flash.className = 'hit';
    clearTimeout(flashTO);
    flashTO = setTimeout(() => { flash.className = ''; }, 60);
  }

  function setMuted(m) {
    elMute.textContent = m ? 'M · silencio' : 'M · sonido';
    elMute.classList.toggle('off', m);
  }

  return { showTitle, showWin, showLose, hideOverlay, setDistance, setShavings, setLives, flashHit, setMuted };
}
