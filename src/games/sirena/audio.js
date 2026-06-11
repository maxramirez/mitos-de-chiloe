// ============================================================
// LA SIRENA · El canto — audio.js
// Procedural WebAudio. Lazy: nothing is created until initAudio()
// runs inside a user gesture (the BEGIN click), or until the
// one-shot listeners armed by armUnlock() catch the first trusted
// gesture (covers programmatic __game.begin() in tests — zero
// autoplay-policy errors either way).
// Every public function no-ops when audio is unavailable, so the
// game and its deterministic test API never depend on sound.
// ============================================================

// Pentatonic shells: D4 F4 G4 A4 C5
const FREQS = [293.66, 349.23, 392.0, 440.0, 523.25];

let ctx = null;
let master = null;
let delaySend = null; // watery feedback delay input
let noiseBuf = null;
let muted = false;
let armed = false;

export function initAudio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);

    // watery delay: delay -> lowpass -> feedback -> delay; wet tap to master
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    delay.connect(wet);
    wet.connect(master);
    delaySend = delay;

    noiseBuf = makeNoise(2.0);
    startSea();

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  } catch (e) {
    ctx = null;
    return false;
  }
}

// Arm one-shot listeners so the first trusted gesture unlocks audio
// even when begin() was called programmatically.
export function armUnlock() {
  if (ctx || armed) return;
  armed = true;
  const unlock = () => {
    initAudio();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}

export function isMuted() {
  return muted;
}

function makeNoise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// faint looping sea-wash under everything
function startSea() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.value = 0.045;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 0.02;
  lfo.connect(lg);
  lg.connect(g.gain);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
  lfo.start();
}

// One shell note. voice=true is HER singing: longer, with a slow
// vibrato; voice=false is the player's struck shell, drier and shorter.
export function shellTone(i, voice) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const f = FREQS[i];
  const dur = voice ? 0.55 : 0.42;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(voice ? 0.32 : 0.28, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  g.connect(delaySend);
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = f;
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = f * 2; // soft harmonic
  const g2 = ctx.createGain();
  g2.gain.value = 0.16;
  o1.connect(g);
  o2.connect(g2);
  g2.connect(g);
  if (voice) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 4;
    lfo.connect(lg);
    lg.connect(o1.detune);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.2);
  }
  o1.start(t0);
  o2.start(t0);
  o1.stop(t0 + dur + 0.2);
  o2.stop(t0 + dur + 0.2);
}

function pluck(f, at, vol, dur) {
  const t0 = ctx.currentTime + at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  g.connect(delaySend);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur + 0.1);
}

// wrong note: churned water + a low dissonant knot
export function churnSplash() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 260;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + 1.0);
  // minor-second growl
  pluck(110, 0, 0.12, 0.6);
  pluck(116.5, 0.02, 0.1, 0.55);
}

// a soul sets out across the channel
export function soulChime() {
  if (!ctx) return;
  pluck(587.33, 0, 0.2, 0.7); // D5
  pluck(880.0, 0.12, 0.16, 0.8); // A5
}

export function winSong() {
  if (!ctx) return;
  pluck(73.42, 0, 0.16, 3.5); // D2 drone
  pluck(293.66, 0.0, 0.22, 1.0);
  pluck(349.23, 0.16, 0.22, 1.0);
  pluck(440.0, 0.32, 0.22, 1.1);
  pluck(523.25, 0.48, 0.22, 1.2);
  pluck(587.33, 0.64, 0.24, 1.6);
}

export function loseFade() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  pluck(73.42, 0, 0.24, 4.0); // D2 dying
  pluck(69.3, 0.5, 0.14, 3.5); // a half-step under it
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.18, t0 + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.0);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + 4.2);
}
