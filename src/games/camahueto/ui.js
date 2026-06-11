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

  const LIVES = ['◇ ◇ ◇', '⟡ ◇ ◇', '⟡ ⟡ ◇', '⟡ ⟡ ⟡']; // index = lives remaining

  function showTitle(onBegin) {
    card.innerHTML = `
      <div class="charm">✦</div>
      <h1 class="game-title">EL CAMAHUETO</h1>
      <div class="game-subtitle">La bajada</div>
      <div class="rule"></div>
      <p class="intro">For twenty-five years the one-horned calf grew under the hill, and tonight
      it breaks for the sea, tearing a gully — <i>la quebrada</i> — through soil and stone.
      Where its golden horn scrapes rock it leaves <i>virutas</i>, shavings the machis grind
      into remedies worth a winter's wages. Ride the torn earth behind it, gather what
      gold you can, and do not let the gully throw you.</p>
      <div class="help">A / D&nbsp;o&nbsp;← → — moverse &nbsp;·&nbsp; espacio — saltar &nbsp;·&nbsp; M — sonido</div>
      <button id="begin-btn" class="btn">COMENZAR LA BAJADA</button>`;
    overlay.classList.add('open');
    hud.classList.remove('on');
    card.querySelector('#begin-btn').addEventListener('click', onBegin);
  }

  function showWin(shavingCount) {
    card.innerHTML = `
      <div class="charm">✦</div>
      <h1 class="game-title">EL MAR</h1>
      <div class="game-subtitle">Seña reunida</div>
      <div class="rule"></div>
      <p class="intro">The gully opens and the calf hits the surf in a sheet of silver — gone,
      out past the kelp to the herds of Millalobo. You stand in the cold foam with
      <b class="gold">✦ ${shavingCount} virutas de cuerno</b> wrapped in your poncho.
      Las machis will pay well.</p>
      <button id="again-btn" class="btn">OTRA VEZ</button>
      <a class="back" href="/">⌂ volver a los mitos</a>`;
    overlay.classList.add('open');
    hud.classList.remove('on');
    card.querySelector('#again-btn').addEventListener('click', () => location.reload());
  }

  function showLose(shavingCount) {
    card.innerHTML = `
      <div class="charm">✦</div>
      <h1 class="game-title">LA QUEBRADA</h1>
      <div class="game-subtitle">No perdona</div>
      <div class="rule"></div>
      <p class="intro">Three blows, and the torn earth spat you onto the rocks. Far below, the
      silver calf met the sea without witnesses, and the tide is already taking the
      ${shavingCount > 0 ? `<b class="gold">${shavingCount} virutas</b> from your open hands` : 'gold you never gathered'}.
      <i>La quebrada no perdona.</i></p>
      <button id="again-btn" class="btn">OTRA VEZ</button>
      <a class="back" href="/">⌂ volver a los mitos</a>`;
    overlay.classList.add('open');
    hud.classList.remove('on');
    card.querySelector('#again-btn').addEventListener('click', () => location.reload());
  }

  function hideOverlay() {
    overlay.classList.remove('open');
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
