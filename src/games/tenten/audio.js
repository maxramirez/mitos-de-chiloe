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
let noiseBuf = null;
let muted = false;

const MASTER_LEVEL = 0.3;

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
  g.connect(master);
  src.start();
  lfo.start();
  // a cold drone underneath
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 49;
  const dg = ctx.createGain();
  dg.gain.value = 0.014;
  drone.connect(dg);
  dg.connect(master);
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
  noiseBuf = buildNoise();
  startAmbient();
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

function tone(type, f0, f1, dur, peak, when = 0) {
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
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function whoosh(dur, f0, f1, peak, q = 1.2, when = 0) {
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
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
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
    default:
      break;
  }
}
