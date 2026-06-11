// ============================================================
// TENTEN Y CAICAI — audio.js
// 100% procedural WebAudio. The AudioContext is created lazily,
// ONLY inside initAudio(), which is only ever called from real
// user-gesture handlers — zero autoplay-policy errors.
// Every function is a safe no-op before init or if WebAudio is
// unavailable. M toggles mute (handled by main).
// ============================================================

let ctx = null;
let master = null;
let amb = null; // ambience bus (sea + drone) — ducked while a voice speaks
let voiceGain = null;
let noiseBuf = null;
let muted = false;

const MASTER_LEVEL = 0.3;
const VOICE_LEVEL = 0.8;
const DUCK_LEVEL = 0.4;

// --- voice clips (optional flavor — the game is identical without them) ---
const VOICE_FILES = {
  intro: '../assets/voice/tenten/intro.mp3',
  win: '../assets/voice/tenten/win.mp3',
  lose: '../assets/voice/tenten/lose.mp3',
  taken: '../assets/voice/tenten/taken.mp3',
};
const voiceBufs = {}; // name -> AudioBuffer (only set on successful decode)
const voiceLoads = {}; // name -> Promise<void> (always resolves; never throws)
let voicesPlaying = 0;

function loadVoices() {
  for (const name of Object.keys(VOICE_FILES)) {
    voiceLoads[name] = fetch(VOICE_FILES[name])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http'))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { voiceBufs[name] = buf; })
      .catch(() => {}); // missing/undecodable files: silent no-op
  }
}

function duckAmbience(on) {
  if (!amb) return;
  amb.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ctx.currentTime, 0.15);
}

export function playVoice(name) {
  if (!ctx || muted || !voiceLoads[name]) return;
  const askedAt = ctx.currentTime;
  voiceLoads[name].then(() => {
    try {
      const buf = voiceBufs[name];
      // skip if the moment passed while still decoding (slow network)
      if (!buf || muted || ctx.currentTime - askedAt > 4) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(voiceGain);
      voicesPlaying += 1;
      duckAmbience(true);
      src.onended = () => {
        voicesPlaying -= 1;
        if (voicesPlaying <= 0) {
          voicesPlaying = 0;
          duckAmbience(false);
        }
      };
      src.start();
    } catch (e) { /* never let audio break the game */ }
  });
}

function buildNoise() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function startAmbient() {
  // the sea, far below: looped noise through a heavy lowpass, slow swells
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 280;
  lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.028;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  src.connect(lp);
  lp.connect(g);
  g.connect(amb);
  src.start();
  lfo.start();
  // a cold drone underneath
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 49;
  const dg = ctx.createGain();
  dg.gain.value = 0.014;
  drone.connect(dg);
  dg.connect(amb);
  drone.start();
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
  } catch (e) {
    ctx = null;
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_LEVEL;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  master.connect(comp);
  comp.connect(ctx.destination);
  amb = ctx.createGain(); // ambience bus, ducked under voices
  amb.gain.value = 1;
  amb.connect(master);
  voiceGain = ctx.createGain();
  voiceGain.gain.value = VOICE_LEVEL;
  voiceGain.connect(master); // through master so M mutes voices too
  noiseBuf = buildNoise();
  startAmbient();
  loadVoices(); // gesture-gated: initAudio only runs from user input
  scheduleAmbientOneShot();
  return true;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.05);
  return muted;
}

export function isMuted() {
  return muted;
}

// --- tiny synth helpers (event-driven only; never in the frame loop) ---

function tone(type, f0, f1, dur, peak, when = 0, dest = null) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function whoosh(dur, f0, f1, peak, q = 1.2, when = 0, dest = null) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest || master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// --- ambient one-shots (the night around the rising island) ---
// All routed through the amb bus so they duck under voices.

function nightBird() {
  // a far FM chirp, 2-3 notes — something awake in the dark trees
  const base = 1700 + Math.random() * 800;
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const when = i * (0.22 + Math.random() * 0.1);
    tone('sine', base * (1 + Math.random() * 0.12), base * 0.82, 0.12, 0.022, when, amb);
  }
}

function windGust() {
  // a slow gust crossing the summit
  const dur = 2 + Math.random() * 2;
  whoosh(dur, 350 + Math.random() * 200, 900 + Math.random() * 500, 0.045, 0.9, 0, amb);
  whoosh(dur * 0.8, 1100, 400, 0.02, 0.7, dur * 0.3, amb);
}

function earthGroan() {
  // the raised land settling — Tenten holding her breath
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(58, t);
  o.frequency.exponentialRampToValueAtTime(41, t + 1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.9); // slow swell, no click
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(g);
  g.connect(amb);
  o.start(t);
  o.stop(t + 2.3);
  whoosh(1.6, 140, 70, 0.035, 0.5, 0.2, amb); // gravel under it
}

function waveWash() {
  // a distant wave breaking far below
  const dur = 2.6 + Math.random() * 1.2;
  whoosh(dur, 700 + Math.random() * 300, 140, 0.05, 0.8, 0, amb);
}

function insectShimmer() {
  // tremolo'd high sine — night insects, barely there
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = 4200 + Math.random() * 1400;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  const trem = ctx.createOscillator();
  trem.frequency.value = 24 + Math.random() * 14;
  const tremG = ctx.createGain();
  tremG.gain.value = 0.006;
  trem.connect(tremG);
  tremG.connect(g.gain);
  const dur = 1.6 + Math.random() * 1.2;
  g.gain.setTargetAtTime(0.009, t, 0.4);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.3);
  o.connect(g);
  g.connect(amb);
  o.start(t);
  o.stop(t + dur + 1.2);
  trem.start(t);
  trem.stop(t + dur + 1.2);
}

const ONE_SHOTS = [nightBird, windGust, earthGroan, waveWash, insectShimmer];
let ambientTimer = 0;

function scheduleAmbientOneShot() {
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(() => {
    try {
      if (ctx && !muted && ctx.state === 'running' && !document.hidden && voicesPlaying === 0) {
        ONE_SHOTS[(Math.random() * ONE_SHOTS.length) | 0]();
      }
    } catch (e) { /* keep the night going regardless */ }
    scheduleAmbientOneShot();
  }, 8000 + Math.random() * 17000); // 8–25 s
}

export function sfx(name) {
  if (!ctx || muted) return;
  switch (name) {
    case 'raise': // earth shoulders upward — low thump + gravel
      tone('sine', 95, 38, 0.3, 0.5);
      whoosh(0.22, 900, 220, 0.18, 0.8);
      break;
    case 'undo':
      tone('sine', 60, 110, 0.14, 0.18);
      break;
    case 'deny':
      tone('square', 110, 80, 0.07, 0.08);
      break;
    case 'march': // the people set out
      whoosh(0.3, 500, 900, 0.07, 2);
      break;
    case 'step':
      whoosh(0.05, 700, 500, 0.05, 3);
      break;
    case 'rise': // Caicai pulls the sea up
      tone('sine', 36, 30, 1.4, 0.55);
      whoosh(1.3, 120, 480, 0.3, 0.7);
      break;
    case 'splash': // a name is taken
      whoosh(0.5, 1400, 300, 0.3, 1.2);
      tone('sine', 520, 140, 0.5, 0.16);
      break;
    case 'save': // a soul reaches the light
      tone('triangle', 587, 587, 0.22, 0.16);
      tone('triangle', 880, 880, 0.3, 0.12, 0.1);
      break;
    case 'win':
      tone('triangle', 392, 392, 0.4, 0.2);
      tone('triangle', 523, 523, 0.4, 0.2, 0.18);
      tone('triangle', 659, 659, 0.7, 0.2, 0.36);
      tone('sine', 98, 98, 1.4, 0.2, 0.36);
      break;
    case 'lose': // a bell under water
      tone('sine', 196, 194, 2.2, 0.4);
      tone('sine', 294, 290, 1.6, 0.14, 0.05);
      whoosh(2, 400, 90, 0.2, 0.8);
      break;
    case 'warn': // Caicai rises THIS turn — two low heartbeats
      tone('sine', 70, 52, 0.22, 0.22);
      tone('sine', 70, 52, 0.22, 0.28, 0.32);
      break;
    case 'select': // soft UI tick on level choice
      tone('triangle', 740, 740, 0.05, 0.05);
      whoosh(0.05, 2000, 1400, 0.02, 3);
      break;
    default:
      break;
  }
}
