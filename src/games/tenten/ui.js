// ============================================================
// TENTEN Y CAICAI — ui.js
// All DOM: title / win / lose overlays, HUD, flash messages.
// HUD writes only happen on state-change events, never per frame.
// ============================================================

import { LEVELS } from './levels.js';
import { NEED_SAVED, LOSE_LOST } from './sim.js';

const ROMAN = ['I', 'II', 'III'];

const INTRO =
  'When the world was young, <em>Caicai Vilu</em>, serpent of the sea, rose in fury to drown ' +
  'the land and everyone who walked it. Against her climbed <em>Tenten Vilu</em>, serpent of ' +
  'the earth, lifting the hills tile by tile so la gente could reach her light. Those the ' +
  'water touched were not drowned — they were changed, into lobos marinos and fish, and they ' +
  'forgot their names.';

const HELP = 'click · raise the land (3 per turn) — then the people walk · U undo · enter end turn · M silence';

const LOSE_TEXT = {
  gente: 'Too many names were taken. The ones who reached the water’s edge are seals now — they watch the island from the swells, and they do not remember why.',
  cumbre: 'The sea closed over the summit and Tenten’s light went out beneath it. Caicai keeps what she covers.',
};

export function createUI(root, handlers) {
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  // ---------- HUD ----------
  const hud = el('div', 'hud');
  hud.style.display = 'none';

  const hudTop = el('div', 'hud-top');
  const hLevel = el('div', 'hud-block hud-left');
  const hTide = el('div', 'hud-block hud-mid');
  const hPeople = el('div', 'hud-block hud-right');
  hudTop.append(hLevel, hTide, hPeople);

  const hudBottom = el('div', 'hud-bottom');
  const btnUndo = el('button', 'btn btn-small', '↶ deshacer');
  const hRaises = el('div', 'raise-pips');
  const btnEnd = el('button', 'btn btn-small btn-end', 'la marcha →');
  btnUndo.addEventListener('click', () => handlers.onUndo());
  btnEnd.addEventListener('click', () => handlers.onEndPhase());
  hudBottom.append(btnUndo, hRaises, btnEnd);

  const flashEl = el('div', 'flash');
  const bannerEl = el('div', 'level-banner');
  const muteEl = el('div', 'mute-tag', 'M · sonido');

  hud.append(hudTop, hudBottom, flashEl, bannerEl, muteEl);
  root.appendChild(hud);

  let flashTimer = 0;
  let bannerTimer = 0;

  // cache to avoid useless DOM writes
  const last = { level: '', tide: '', people: '', raises: '', undo: null, end: null };

  function updateHUD(game) {
    const sim = game.sim;
    if (!sim) return;
    const lvl = LEVELS[game.level - 1];
    const a = 'nivel ' + ROMAN[game.level - 1] + ' · ' + lvl.name.toLowerCase() + ' &nbsp;—&nbsp; turno ' + sim.turn;
    if (a !== last.level) { hLevel.innerHTML = a; last.level = a; }

    const riseIn = sim.turnsUntilRise;
    const b = 'marea <b>' + sim.water + '</b>/5 &nbsp;·&nbsp; caicai sube en <b>' +
      riseIn + '</b>' + (riseIn === 1 ? ' <span class="urgent">¡este turno!</span>' : '');
    if (b !== last.tide) { hTide.innerHTML = b; last.tide = b; }

    const c = '✦ salvados <b>' + sim.saved + '</b>/' + NEED_SAVED +
      ' &nbsp;·&nbsp; perdidos <b class="' + (sim.lost > 0 ? 'urgent' : '') + '">' + sim.lost + '</b> (' + LOSE_LOST + ' = derrota)';
    if (c !== last.people) { hPeople.innerHTML = c; last.people = c; }

    let pips = '';
    for (let i = 0; i < 3; i++) pips += i < sim.raisesLeft ? '✦ ' : '· ';
    const inRaise = game.phase === 'playing' && game.sub === 'raise';
    const d = inRaise ? 'alza la tierra &nbsp;' + pips : game.sub === 'march' ? 'la gente camina…' : 'la marea…';
    if (d !== last.raises) { hRaises.innerHTML = d; last.raises = d; }

    const undoOn = inRaise && sim.undoStack.length > 0;
    if (undoOn !== last.undo) { btnUndo.disabled = !undoOn; last.undo = undoOn; }
    const endOn = inRaise;
    if (endOn !== last.end) {
      btnEnd.disabled = !endOn;
      last.end = endOn;
    }
    btnEnd.classList.toggle('glow', inRaise && sim.raisesLeft === 0);
  }

  function flash(msg) {
    flashEl.textContent = msg;
    flashEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('show'), 1700);
  }

  function banner(text) {
    bannerEl.textContent = text;
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 2600);
  }

  function setMuted(m) {
    muteEl.textContent = m ? 'M · silencio' : 'M · sonido';
    muteEl.classList.toggle('off', m);
  }

  // ---------- overlays ----------
  function card() {
    const ov = el('div', 'overlay');
    const c = el('div', 'card');
    ov.appendChild(c);
    ov.style.display = 'none';
    root.appendChild(ov);
    return [ov, c];
  }

  const [titleOv, titleCard] = card();
  titleOv.classList.add('title-overlay');
  const [endOv, endCard] = card();

  let selected = 1;

  function showTitle(unlocked, sel) {
    selected = sel;
    titleCard.innerHTML = '';
    titleCard.append(
      el('div', 'charm', '✦'),
      el('h1', 'game-title', 'TENTEN&nbsp;Y&nbsp;CAICAI'),
      el('div', 'game-subtitle', 'Las dos serpientes'),
      el('div', 'rule'),
      el('p', 'intro', INTRO),
    );
    const lvlRow = el('div', 'level-row');
    for (let i = 1; i <= 3; i++) {
      const lv = LEVELS[i - 1];
      const locked = i > unlocked;
      const b = el('button', 'level-btn' + (locked ? ' locked' : '') + (i === selected ? ' sel' : ''));
      b.innerHTML = locked
        ? '<b>' + ROMAN[i - 1] + '</b><span>— sellado —</span>'
        : '<b>' + ROMAN[i - 1] + ' · ' + lv.name + '</b><span class="ep">' + lv.epithet + '</span>';
      if (!locked) {
        b.addEventListener('click', () => {
          selected = i;
          handlers.onSelectLevel(i);
          const all = lvlRow.querySelectorAll('.level-btn');
          all.forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          noteEl.textContent = lv.note;
        });
      }
      lvlRow.appendChild(b);
    }
    const noteEl = el('p', 'level-note', LEVELS[selected - 1].note);
    const help = el('p', 'help', HELP);
    const begin = el('button', 'btn', 'BEGIN');
    begin.addEventListener('click', () => handlers.onBegin());
    titleCard.append(lvlRow, noteEl, help, begin);
    titleOv.style.display = 'flex';
  }

  function showWin(level, saved, lost, isFinal) {
    endCard.innerHTML = '';
    const title = isFinal ? 'TENTEN&nbsp;VENCE' : 'LA TIERRA CRECIÓ';
    const sub = isFinal ? 'la serpiente del mar se repliega' : LEVELS[level - 1].epithet;
    let body;
    if (isFinal) {
      body = 'Three islands held. The water fell back grumbling into the channels, and on every ' +
        'summit a light kept burning. The people came down slowly, counting each other, ' +
        'saying their own names out loud — <em>' + saved + ' reached the light</em>' +
        (lost ? ', and ' + lost + ' watch from the sea, sleek and changed, not unhappy' : '') + '.';
    } else {
      body = '<em>' + saved + '</em> of six reached Tenten’s light before Caicai could close her coil' +
        (lost ? ' — ' + lost + ' now swim the channels as lobos marinos, and the old people leave fish for them on the rocks' : '') + '.';
    }
    endCard.append(
      el('div', 'charm', '✦'),
      el('h1', 'game-title win-title', title),
      el('div', 'game-subtitle', sub),
      el('div', 'rule'),
      el('p', 'intro', body),
    );
    if (isFinal) endCard.append(el('div', 'win-charms', '✦ seña reunida ✦'));
    const row = el('div', 'btn-stack');
    if (!isFinal) {
      const next = el('button', 'btn', 'SIGUIENTE NIVEL →');
      next.addEventListener('click', () => handlers.onNext());
      row.appendChild(next);
    }
    const replay = el('button', 'btn' + (isFinal ? '' : ' btn-resume'), isFinal ? 'JUGAR DE NUEVO' : 'repetir');
    replay.addEventListener('click', () => location.reload());
    row.appendChild(replay);
    endCard.append(row);
    endOv.style.display = 'flex';
  }

  function showLose(reason) {
    endCard.innerHTML = '';
    endCard.append(
      el('div', 'charm lose-charm', '≈'),
      el('h1', 'game-title win-title', 'EL MAR NO PERDONA'),
      el('div', 'game-subtitle', reason === 'cumbre' ? 'la cumbre se ahogó' : 'la gente fue tomada'),
      el('div', 'rule'),
      el('p', 'intro', LOSE_TEXT[reason] || LOSE_TEXT.gente),
    );
    const replay = el('button', 'btn', 'REINTENTAR');
    replay.addEventListener('click', () => location.reload());
    endCard.append(replay);
    endOv.style.display = 'flex';
  }

  function hideOverlays() {
    titleOv.style.display = 'none';
    endOv.style.display = 'none';
    hud.style.display = 'block';
  }

  return {
    showTitle,
    showWin,
    showLose,
    hideOverlays,
    updateHUD,
    flash,
    banner,
    setMuted,
  };
}
