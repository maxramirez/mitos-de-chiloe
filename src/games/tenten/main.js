// ============================================================
// TENTEN Y CAICAI — Las dos serpientes
// Mitos de Chiloé · turn-based grid puzzle · 2D canvas
//
// Turn order: you RAISE up to 3 tiles → the people take 2 steps
// toward Tenten's light → the flood ticks (the sea rises 1 every
// 3 turns). Win a level: 4 of 6 villagers reach the beacon.
// Lose: 3 lost to the water, or the summit floods (water 5).
//
// ------------------- TEST API (window.__game) -------------------
//   begin()                 same as clicking BEGIN on the title card
//                           (starts the currently selected level)
//   step(dt=1/60, steps=1)  advance the sim deterministically by
//                           calling the same frame(dt) the rAF loop uses
//   getState()              { phase:'title'|'playing'|'won'|'lost',
//                             sub:'raise'|'march'|'flood', level, turn,
//                             water, turnsUntilRise, raisesLeft, saved,
//                             lost, alive, needed, unlocked }
//   forceWin()              run the REAL win handler for the current level
//                           (unlocks the next level; if level === 3 it sets
//                           localStorage 'chiloe-tenten-done' = '1' — the
//                           collection flag is ONLY set by a level-3 win)
//   forceLose()             run the real lose handler (phase -> 'lost')
//   setLevel(n)             load level n (1..3) and start playing at once
//                           (works from any phase; ignores the unlock gate)
//   raise(x, y)             raise tile (x, y) as if clicked; returns '' on
//                           success, else 'gente' (a villager stands there),
//                           'cielo' (already height 5), 'sin' (no raises
//                           left), 'fuera' (off board), 'fase' (not your
//                           raise phase)
//   undo()                  undo the last raise of the current raise phase
//   endPhase()              end the raise phase (villagers march, flood ticks)
//   getBoard()              { heights: 13x13 rows of numbers, water,
//                             beacon:{x,y}, villagers:[{x,y,alive,saved}] }
//   autoplaySolve()         play the level's built-in solution from the
//                           current state (best right after setLevel(n));
//                           runs synchronously, returns final getState()
//
// The sim only advances while phase === 'playing' (overlays pause it).
// dt is clamped at 0.05 s. No allocations inside frame(dt).
// ============================================================

import { LEVELS } from './levels.js';
import {
  SIZE, RAISES_PER_TURN, STEPS_PER_TURN, NEED_SAVED, idx,
  createSim, canRaise, doRaise, undoRaise, computeDist, chooseStep,
  commitVillager, floodCommit, evaluate,
} from './sim.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { initAudio, sfx, playVoice, toggleMute, isMuted } from './audio.js';

const STEP_T = 0.26; // s per villager step (render.js mirrors these)
const FLOOD_RISE_T = 1.1;
const FLOOD_CALM_T = 0.3;
const LS_DONE = 'chiloe-tenten-done';
// NOTE: extra key beyond the collection's one-key-per-game convention
// ('chiloe-<id>-done') — any reset-progress feature must clear this too.
const LS_UNLOCKED = 'chiloe-tenten-unlocked';

const REASONS = {
  gente: 'La gente está ahí — no puedes alzar bajo sus pies',
  cielo: 'Esa tierra ya toca el cielo',
  sin: 'Ya no puedes alzar más — termina el turno',
  fuera: 'Solo la isla obedece a Tenten',
  fase: 'Espera — no es la hora de alzar',
  nada: 'Nada que deshacer',
};

let unlocked = 1;
try {
  unlocked = Math.max(1, Math.min(3, parseInt(localStorage.getItem(LS_UNLOCKED), 10) || 1));
} catch (e) { /* storage may be unavailable */ }

const game = {
  phase: 'title', // title | playing | won | lost
  sub: 'raise', // raise | march | flood
  level: 1,
  selected: 1,
  sim: null,
  t: 0, // current sub-phase timer
  anim: 0, // visual clock (always running)
  marchStep: 0,
  floodRising: false,
  endAt: -1, // anim time to show the deferred end overlay (-1 = none)
  voicedTaken: false,
};

// stashed args for the deferred win/lose overlay (no allocs per end)
const pendingEnd = { kind: '', level: 1, saved: 0, lost: 0, isFinal: false, reason: '' };

const hover = { i: -1, x: -1, y: -1, why: 'fuera' };

// ---------- DOM / modules ----------
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const renderer = createRenderer(canvas);

const ui = createUI(document.getElementById('ui'), {
  onBegin: () => begin(),
  onUndo: () => undo(),
  onEndPhase: () => endPhase(),
  onNext: () => setLevel(Math.min(3, game.level + 1)),
  onReplay: () => startLevel(game.level),
  onSelectLevel: (n) => { game.selected = n; sfx('select'); },
});

// ---------- core flow ----------
function startLevel(n) {
  game.level = Math.max(1, Math.min(3, n));
  game.selected = game.level;
  game.sim = createSim(LEVELS[game.level - 1]);
  game.phase = 'playing';
  game.sub = 'raise';
  game.t = 0;
  game.marchStep = 0;
  game.floodRising = false;
  game.endAt = -1;
  game.voicedTaken = false; // the 'taken' whisper speaks at most once per level
  renderer.setLevel(game.sim);
  ui.hideOverlays();
  ui.updateHUD(game);
  ui.banner('NIVEL ' + ['I', 'II', 'III'][game.level - 1] + ' · ' + LEVELS[game.level - 1].name);
  refreshHover();
}

function begin() {
  if (game.phase !== 'title') return;
  startLevel(game.selected);
  playVoice('intro'); // BEGIN is a real click — audio is already unlocked
}

function setLevel(n) {
  startLevel(n);
  return getState();
}

function tryRaise(x, y) {
  if (game.phase !== 'playing' || game.sub !== 'raise') return 'fase';
  const why = doRaise(game.sim, x, y);
  if (!why) {
    renderer.onHeightChanged(x, y);
    renderer.dust(x, y);
    sfx('raise');
    ui.updateHUD(game);
  } else {
    sfx('deny');
    ui.flash(REASONS[why] || why);
  }
  refreshHover();
  return why;
}

function undo() {
  if (game.phase !== 'playing' || game.sub !== 'raise') return false;
  const i = undoRaise(game.sim);
  if (i < 0) {
    ui.flash(REASONS.nada);
    return false;
  }
  renderer.onHeightChanged(i % SIZE, (i / SIZE) | 0);
  sfx('undo');
  ui.updateHUD(game);
  refreshHover();
  return true;
}

function endPhase() {
  if (game.phase !== 'playing' || game.sub !== 'raise') return;
  computeDist(game.sim);
  game.sub = 'march';
  game.marchStep = 0;
  game.t = 0;
  planStep();
  sfx('march');
  ui.updateHUD(game);
}

function planStep() {
  const sim = game.sim;
  for (let i = 0; i < sim.villagers.length; i++) {
    const v = sim.villagers[i];
    v.fx = v.x;
    v.fy = v.y;
    v.tx = v.x;
    v.ty = v.y;
    if (!v.alive) continue;
    const n = chooseStep(sim, v);
    if (n >= 0) {
      v.tx = n % SIZE;
      v.ty = (n / SIZE) | 0;
    }
  }
}

function commitMarchStep() {
  const sim = game.sim;
  let moved = false;
  for (let i = 0; i < sim.villagers.length; i++) {
    const v = sim.villagers[i];
    if (!v.alive) continue;
    if (v.tx === v.x && v.ty === v.y) continue;
    moved = true;
    const arrived = commitVillager(sim, v, idx(v.tx, v.ty));
    if (arrived) {
      v.savedAt = game.anim;
      renderer.sparkle(sim.beaconX, sim.beaconY);
      sfx('save');
    }
  }
  if (moved) sfx('step');
  const verdict = evaluate(sim);
  if (verdict === 'won') return doWin();
  if (verdict === 'lost') return doLose(sim.loseReason);
  game.marchStep += 1;
  if (game.marchStep < STEPS_PER_TURN) {
    planStep();
  } else {
    game.sub = 'flood';
    game.t = 0;
    game.floodRising = sim.turnsUntilRise === 1;
    if (game.floodRising) {
      sfx('rise');
      renderer.surge();
    }
    ui.updateHUD(game);
  }
  return undefined;
}

function commitFlood() {
  const sim = game.sim;
  sim.turnsUntilRise -= 1;
  if (sim.turnsUntilRise <= 0) {
    const n = floodCommit(sim);
    for (let i = 0; i < n; i++) {
      const v = sim.villagers[sim.drowned[i]];
      v.lostAt = game.anim;
      renderer.splash(v.x, v.y);
    }
    if (n > 0) {
      sfx('splash');
      renderer.shake(3);
      ui.flash(n === 1 ? 'El agua tomó a uno — ya no camina con la gente' : 'El agua tomó a ' + n);
      if (!game.voicedTaken) {
        game.voicedTaken = true;
        playVoice('taken');
      }
    }
  }
  const verdict = evaluate(sim);
  if (verdict === 'won') return doWin();
  if (verdict === 'lost') return doLose(sim.loseReason);
  sim.turn += 1;
  sim.raisesLeft = RAISES_PER_TURN;
  sim.undoStack.length = 0;
  game.sub = 'raise';
  game.t = 0;
  if (sim.turnsUntilRise === 1) sfx('warn'); // Caicai rises this coming turn
  ui.updateHUD(game);
  refreshHover();
  return undefined;
}

function doWin() {
  if (game.phase !== 'playing' && game.phase !== 'title') return;
  game.phase = 'won';
  const isFinal = game.level === 3;
  unlocked = Math.max(unlocked, Math.min(3, game.level + 1));
  try {
    localStorage.setItem(LS_UNLOCKED, String(unlocked));
    if (isFinal) localStorage.setItem(LS_DONE, '1'); // collection flag — ONLY on win
  } catch (e) { /* storage may be unavailable */ }
  sfx('win');
  ui.updateHUD(game);
  // defer the overlay so the final save sparkle plays out (anim-clock driven
  // so __game.step()/autoplaySolve stay deterministic)
  pendingEnd.kind = 'win';
  pendingEnd.level = game.level;
  pendingEnd.saved = game.sim.saved;
  pendingEnd.lost = game.sim.lost;
  pendingEnd.isFinal = isFinal;
  game.endAt = game.anim + 1.2;
}

function doLose(reason) {
  if (game.phase !== 'playing' && game.phase !== 'title') return;
  game.phase = 'lost';
  sfx('lose');
  renderer.shake(5);
  ui.updateHUD(game);
  // defer the overlay so the seal transformation plays out
  pendingEnd.kind = 'lose';
  pendingEnd.reason = reason || 'gente';
  game.endAt = game.anim + 1.2;
}

// ---------- frame loop (pure, driven by rAF AND by __game.step) ----------
function frame(dt = 1 / 60) {
  if (!(dt > 0)) return;
  if (dt > 0.05) dt = 0.05;
  game.anim += dt;
  if (game.endAt >= 0 && game.anim >= game.endAt) {
    game.endAt = -1;
    if (pendingEnd.kind === 'win') {
      ui.showWin(pendingEnd.level, pendingEnd.saved, pendingEnd.lost, pendingEnd.isFinal);
      playVoice('win');
    } else {
      ui.showLose(pendingEnd.reason);
      playVoice('lose');
    }
  }
  if (game.phase === 'playing') {
    if (game.sub === 'march') {
      game.t += dt;
      while (game.sub === 'march' && game.phase === 'playing' && game.t >= STEP_T) {
        game.t -= STEP_T;
        commitMarchStep();
      }
    } else if (game.sub === 'flood') {
      game.t += dt;
      const T = game.floodRising ? FLOOD_RISE_T : FLOOD_CALM_T;
      if (game.t >= T) commitFlood();
    }
    // 'raise' waits on the player
  }
  renderer.update(dt);
}

let lastNow = performance.now();
function tick(now) {
  const dt = (now - lastNow) / 1000;
  lastNow = now;
  frame(dt);
  renderer.draw(game, hover);
  requestAnimationFrame(tick);
}

// ---------- input ----------
// like canRaise, but also honest about the raise budget (doRaise checks it)
function hoverWhy(x, y) {
  const why = canRaise(game.sim, x, y);
  return !why && game.sim.raisesLeft <= 0 ? 'sin' : why;
}

function refreshHover() {
  if (hover.i >= 0 && game.sim) {
    hover.why = hoverWhy(hover.x, hover.y);
  }
}

canvas.addEventListener('pointermove', (e) => {
  const i = renderer.pick(e.clientX, e.clientY);
  hover.i = i;
  if (i >= 0) {
    hover.x = i % SIZE;
    hover.y = (i / SIZE) | 0;
    hover.why = hoverWhy(hover.x, hover.y);
  }
});
canvas.addEventListener('pointerleave', (e) => {
  // touch lifts fire pointerleave too — keep the tap-preview visible
  if (e.pointerType === 'touch') return;
  hover.i = -1;
});
canvas.addEventListener('pointerdown', (e) => {
  initAudio(); // a real gesture — safe place to unlock audio
  if (game.phase !== 'playing' || game.sub !== 'raise') return;
  const i = renderer.pick(e.clientX, e.clientY);
  if (i < 0) return;
  if (e.pointerType === 'touch' && i !== hover.i) {
    // no hover on touch: first tap previews, second tap on the same tile commits
    hover.i = i;
    hover.x = i % SIZE;
    hover.y = (i / SIZE) | 0;
    hover.why = hoverWhy(hover.x, hover.y);
    return;
  }
  tryRaise(i % SIZE, (i / SIZE) | 0);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    initAudio();
    ui.setMuted(toggleMute());
  } else if (e.key === 'u' || e.key === 'U') {
    undo();
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (game.phase === 'playing' && game.sub === 'raise') {
      e.preventDefault();
      endPhase();
    }
  }
});

window.addEventListener('resize', () => renderer.resize());

// unlock audio on the BEGIN click too (it's inside #ui, not the canvas)
document.getElementById('ui').addEventListener('pointerdown', () => initAudio());

// ---------- test API ----------
function getState() {
  const sim = game.sim;
  let alive = 0;
  if (sim) {
    for (let i = 0; i < sim.villagers.length; i++) if (sim.villagers[i].alive) alive += 1;
  }
  return {
    phase: game.phase,
    sub: game.sub,
    level: game.level,
    turn: sim ? sim.turn : 0,
    water: sim ? sim.water : 0,
    turnsUntilRise: sim ? sim.turnsUntilRise : 0,
    raisesLeft: sim ? sim.raisesLeft : 0,
    saved: sim ? sim.saved : 0,
    lost: sim ? sim.lost : 0,
    alive,
    needed: NEED_SAVED,
    unlocked,
  };
}

function getBoard() {
  const sim = game.sim;
  if (!sim) return null;
  const heights = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    for (let x = 0; x < SIZE; x++) row.push(sim.heights[idx(x, y)]);
    heights.push(row);
  }
  return {
    heights,
    water: sim.water,
    beacon: { x: sim.beaconX, y: sim.beaconY },
    villagers: sim.villagers.map((v) => ({ x: v.x, y: v.y, alive: v.alive, saved: v.saved })),
  };
}

function step(dt = 1 / 60, steps = 1) {
  for (let i = 0; i < steps; i++) frame(dt);
  renderer.draw(game, hover);
  return getState();
}

function forceWin() {
  if (!game.sim) startLevel(game.selected);
  doWin();
  return getState();
}

function forceLose() {
  if (!game.sim) startLevel(game.selected);
  doLose(game.sim.loseReason || 'gente');
  return getState();
}

function autoplaySolve() {
  if (game.phase === 'title') startLevel(game.selected);
  const script = LEVELS[game.level - 1].solution;
  let guard = 0;
  while (game.phase === 'playing' && guard++ < 64) {
    if (game.sub === 'raise') {
      const raises = script[game.sim.turn - 1] || [];
      for (let i = 0; i < raises.length; i++) tryRaise(raises[i][0], raises[i][1]);
      endPhase();
    }
    let g = 0;
    while (game.phase === 'playing' && game.sub !== 'raise' && g++ < 4000) frame(1 / 30);
  }
  renderer.draw(game, hover);
  return getState();
}

window.__game = {
  begin,
  step,
  getState,
  forceWin,
  forceLose,
  setLevel,
  raise: tryRaise,
  undo,
  endPhase,
  getBoard,
  autoplaySolve,
  toggleMute: () => {
    const m = toggleMute();
    ui.setMuted(m);
    return m;
  },
};

// ---------- go ----------
ui.showTitle(unlocked, game.selected);
ui.setMuted(isMuted());
requestAnimationFrame((t) => {
  lastNow = t;
  requestAnimationFrame(tick);
});
