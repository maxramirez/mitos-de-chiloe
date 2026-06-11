// ============================================================
// LA SIRENA — El canto · Mitos de Chiloé
// ------------------------------------------------------------
// Melody memory, 2D canvas + procedural WebAudio. La Sirena
// sings a sequence on five mother-of-pearl shells (pentatonic
// D F G A C); repeat it by clicking the shells or pressing 1–5.
// Each completed round guides one drowned soul (lantern) across
// the channel to the Caleuche's light. 6 rounds, sequence
// lengths 3,4,5,6,7,8 — six ánimas guided = win. A wrong note
// churns the water and the sequence replays once, free; three
// mistakes total and the channel forgets a name (lose).
// Audio is the game, but every cue is also visual (shell shimmer
// + per-shell glyph + floating sung glyph), so play — and the
// deterministic tests — work with sound off.
//
// TEST API — window.__game
//   begin()              same as clicking BEGIN (audio unlocks on the
//                        first trusted gesture; no autoplay errors)
//   step(dt=1/60, n=1)   advance the sim deterministically (dt clamped
//                        at 0.05; renders once at the end)
//   getState()           { phase:'title'|'playing'|'won'|'lost',
//                          sub:'intro'|'singing'|'input'|'churn'|'soul'|'done',
//                          round (1-6), souls (0-6), mistakes (0-3),
//                          inputPos, sequenceLength, totalRounds, muted }
//   forceWin()           run the real win handler (sets localStorage
//                        'chiloe-sirena-done' = '1', shows win card)
//   forceLose()          run the real lose handler (shows lose card)
//   getSequence()        copy of the current round's expected shell
//                        indices (0-4)
//   playInput(i)         play shell i as the player; registers while
//                        sub === 'input' (or in the brief tail after her
//                        last sung note, which opens input); returns
//                        true if correct
//   setMistakes(n)       set mistake count 0-3 (n >= 3 while playing
//                        triggers the real lose handler)
//   skipToRound(n)       jump to round n (1-6): souls = n-1, starts the
//                        round; auto-begins if still on the title
//   skipSinging()        jump past her playback to sub === 'input'
//   toggleMute()         same as pressing M; returns muted
//
// Typical fast win:
//   __game.begin();
//   for (let r = 1; r <= 6; r++) {
//     __game.skipSinging();
//     for (const i of __game.getSequence()) __game.playInput(i);
//     __game.step(1/30, 90); // ride out the soul crossing
//   }
// ============================================================

import { createScene } from './scene.js';
import * as audio from './audio.js';

const TOTAL_ROUNDS = 6;
const MAX_MISTAKES = 3;
const NOTE_GAP = 0.6; // s between her notes
const SING_TAIL = 0.2; // s after her last note before input opens
const INTRO_DUR = 1.15;
const CHURN_DUR = 1.6;
const SOUL_DUR = 2.6;
const DT_CLAMP = 0.05;

const canvas = document.getElementById('scene');
const scene = createScene(canvas);

const state = {
  phase: 'title', // 'title' | 'playing' | 'won' | 'lost'
  sub: 'intro', // 'intro' | 'singing' | 'input' | 'churn' | 'soul' | 'done'
  round: 1,
  souls: 0,
  mistakes: 0,
  sequence: [],
  inputPos: 0,
};
let subT = 0; // timer inside the current sub-state
let noteT = 0; // time until her next note
let singIdx = 0; // next note of the sequence she will sing
let soulT = 0; // 0..1 progress of the crossing lantern

// cached HUD strings — nothing is concatenated in the frame loop
const ROUND_LABELS = [];
for (let r = 1; r <= TOTAL_ROUNDS; r++) {
  ROUND_LABELS.push('RONDA ' + r + ' DE 6 · ' + (r + 2) + ' NOTAS');
}
const SOULS_LABELS = [];
for (let s = 0; s <= TOTAL_ROUNDS; s++) SOULS_LABELS.push('ÁNIMAS ✦ ' + s + ' / 6');
const PROMPTS = {
  intro: 'ella canta — escucha',
  singing: 'ella canta — escucha',
  input: 'repite el canto — caracolas o teclas 1-5',
  churn: 'una nota cayó al fondo, como una piedra pequeña — escucha: el canto vuelve',
  soul: 'un ánima cruza el canal',
  done: '',
};

// reused view object passed to the renderer (no per-frame allocation)
const view = {
  playing: false,
  sub: 'intro',
  soulT: 0,
  souls: 0,
  mistakes: 0,
  roundLabel: ROUND_LABELS[0],
  soulsLabel: SOULS_LABELS[0],
  prompt: '',
};

// ---------------- overlays ----------------

const titleOv = document.getElementById('title-overlay');
const winOv = document.getElementById('win-overlay');
const loseOv = document.getElementById('lose-overlay');
const muteHint = document.getElementById('mute-hint');

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

// ---------------- rounds ----------------

function genSequence(len) {
  const seq = [];
  for (let i = 0; i < len; i++) {
    let n;
    do {
      n = (Math.random() * 5) | 0;
    } while (i >= 2 && seq[i - 1] === n && seq[i - 2] === n); // never 3 alike in a row
    seq.push(n);
  }
  return seq;
}

function startRound(n) {
  state.round = n;
  state.sequence = genSequence(n + 2); // rounds 1..6 -> lengths 3..8
  state.inputPos = 0;
  state.sub = 'intro';
  subT = 0;
  noteT = 0;
  singIdx = 0;
}

function begin() {
  if (state.phase !== 'title') return;
  audio.armUnlock(); // first trusted gesture unlocks audio
  hide(titleOv);
  state.phase = 'playing';
  startRound(1);
}

function win() {
  if (state.phase === 'won' || state.phase === 'lost') return;
  state.phase = 'won';
  state.sub = 'done';
  try {
    localStorage.setItem('chiloe-sirena-done', '1');
  } catch (e) {
    /* storage may be unavailable; the night forgives it */
  }
  audio.winSong();
  audio.playVoice('win');
  hide(titleOv);
  hide(loseOv);
  show(winOv);
}

function lose() {
  if (state.phase === 'lost' || state.phase === 'won') return;
  state.phase = 'lost';
  state.sub = 'done';
  audio.loseFade();
  audio.playVoice('lose');
  hide(titleOv);
  hide(winOv);
  show(loseOv);
}

function wrong() {
  state.mistakes++;
  audio.churnSplash();
  scene.churnWater();
  scene.snuffCandle(3 - state.mistakes); // the candle gutters before the smoke
  if (state.mistakes >= MAX_MISTAKES) {
    lose();
    return;
  }
  if (state.mistakes === 1) audio.playVoice('churn'); // one whispered warning, once
  state.sub = 'churn'; // the water settles, then she sings it again — free
  subT = 0;
}

function roundComplete() {
  state.souls++;
  scene.setTurn(state.souls / TOTAL_ROUNDS); // she turns slightly toward you
  scene.soulLaunch(state.souls);
  audio.soulChime();
  state.sub = 'soul';
  soulT = 0;
}

// input is open once her last note has sounded — an eager echo must never be eaten
function inputOpen() {
  return (
    state.sub === 'input' ||
    (state.sub === 'singing' && singIdx >= state.sequence.length)
  );
}

function playInput(i) {
  if (state.phase !== 'playing' || !inputOpen()) return false;
  if (state.sub !== 'input') {
    state.sub = 'input';
    state.inputPos = 0;
  }
  i |= 0;
  if (i < 0 || i > 4) return false;
  audio.shellTone(i, false);
  scene.pulseShell(i);
  const ok = i === state.sequence[state.inputPos];
  if (ok) {
    state.inputPos++;
    if (state.inputPos >= state.sequence.length) roundComplete();
  } else {
    wrong();
  }
  return ok;
}

// ---------------- simulation ----------------

function update(dt) {
  scene.update(dt); // cosmetic only — safe in every phase
  if (state.phase !== 'playing') return; // sim pauses under any overlay
  switch (state.sub) {
    case 'intro':
      subT += dt;
      if (subT >= INTRO_DUR) {
        state.sub = 'singing';
        singIdx = 0;
        noteT = NOTE_GAP - 0.15; // first note lands a beat after the intro
        audio.combShimmer(); // she lifts the comb from her hair
      }
      break;
    case 'singing':
      noteT += dt;
      if (singIdx >= state.sequence.length) {
        // her last note has sounded — open input after a short tail
        if (noteT >= SING_TAIL) {
          state.sub = 'input';
          state.inputPos = 0;
        }
      } else if (noteT >= NOTE_GAP) {
        noteT -= NOTE_GAP;
        const n = state.sequence[singIdx++];
        audio.shellTone(n, true);
        scene.sirenSing(n);
      }
      break;
    case 'churn':
      subT += dt;
      if (subT >= CHURN_DUR) {
        state.sub = 'singing'; // the free replay
        state.inputPos = 0;
        singIdx = 0;
        noteT = NOTE_GAP - 0.3;
      }
      break;
    case 'soul':
      soulT += dt / SOUL_DUR;
      if (soulT >= 1) {
        soulT = 1;
        scene.soulArrive(state.souls); // flare where the lantern settles
        audio.rockCreak(); // the Caleuche's deck takes the farol's weight
        if (state.souls >= TOTAL_ROUNDS) win();
        else startRound(state.round + 1);
      }
      break;
  }
}

function syncView() {
  view.playing = state.phase === 'playing';
  view.sub = state.sub;
  view.soulT = soulT;
  view.souls = state.souls;
  view.mistakes = state.mistakes;
  view.roundLabel = ROUND_LABELS[state.round - 1];
  view.soulsLabel = SOULS_LABELS[state.souls];
  view.prompt = view.playing ? PROMPTS[state.sub] : '';
}

// pure frame: advance then draw — driven by rAF AND by __game.step
function frame(dt) {
  update(Math.min(dt, DT_CLAMP));
  syncView();
  scene.render(view);
}

let last = performance.now();
requestAnimationFrame(function loop(now) {
  if (resizeDirty) {
    resizeDirty = false;
    scene.resize();
  }
  frame(Math.min((now - last) / 1000, DT_CLAMP));
  last = now;
  requestAnimationFrame(loop);
});

// ---------------- input ----------------

document.getElementById('begin-btn').addEventListener('click', () => {
  audio.initAudio(); // inside the gesture — autoplay-safe
  audio.playVoice('intro'); // the old man whispers the opening line
  begin();
});
document.getElementById('replay-win').addEventListener('click', () => location.reload());
document.getElementById('replay-lose').addEventListener('click', () => location.reload());

canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'playing') return;
  const i = scene.shellIndexAt(e.clientX, e.clientY);
  if (i < 0) return;
  if (inputOpen()) playInput(i);
  else {
    scene.denyShell(i); // not your turn yet — dim pulse
    audio.denyLap(); // only low water under your hand
  }
});

canvas.addEventListener('pointermove', (e) => {
  const want =
    state.phase === 'playing' &&
    state.sub === 'input' &&
    scene.shellIndexAt(e.clientX, e.clientY) >= 0
      ? 'pointer'
      : 'default';
  if (canvas.style.cursor !== want) canvas.style.cursor = want;
});

function toggleMute() {
  const m = audio.toggleMute();
  muteHint.textContent = m ? 'M · silencio' : '1–5 · M · sonido';
  muteHint.classList.toggle('muted', m);
  return m;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key >= '1' && e.key <= '5') playInput(e.key.charCodeAt(0) - 49);
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});

// coalesce resize storms to one relayout per frame (resize() repaints the bg)
let resizeDirty = false;
window.addEventListener('resize', () => {
  resizeDirty = true;
});

// ---------------- test api ----------------

window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    const d = Math.min(dt, DT_CLAMP);
    for (let i = 0; i < steps; i++) update(d);
    syncView();
    scene.render(view);
  },
  getState() {
    return {
      phase: state.phase,
      sub: state.sub,
      round: state.round,
      souls: state.souls,
      mistakes: state.mistakes,
      inputPos: state.inputPos,
      sequenceLength: state.sequence.length,
      totalRounds: TOTAL_ROUNDS,
      muted: audio.isMuted(),
    };
  },
  forceWin() {
    win();
  },
  forceLose() {
    lose();
  },
  getSequence() {
    return state.sequence.slice();
  },
  playInput,
  setMistakes(n) {
    n = Math.max(0, Math.min(MAX_MISTAKES, n | 0));
    state.mistakes = n;
    if (n >= MAX_MISTAKES && state.phase === 'playing') lose();
  },
  skipToRound(n) {
    n = Math.max(1, Math.min(TOTAL_ROUNDS, n | 0));
    if (state.phase === 'title') {
      audio.armUnlock();
      hide(titleOv);
      state.phase = 'playing';
    }
    if (state.phase !== 'playing') return;
    state.souls = n - 1;
    scene.setTurn(state.souls / TOTAL_ROUNDS);
    startRound(n);
  },
  skipSinging() {
    if (state.phase !== 'playing') return;
    if (state.sub === 'intro' || state.sub === 'singing') {
      state.sub = 'input';
      state.inputPos = 0;
    }
  },
  toggleMute,
};
