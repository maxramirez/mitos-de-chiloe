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
let amb = null; // ambience bus (sea + ambient one-shots + music bed) — ducks under voice
let voiceGain = null; // narrator clips; through master so M mutes them too
let delaySend = null; // watery feedback delay input
let noiseBuf = null;
let musicGain = null; // looping mp3 bed; lives on amb so it ducks with the sea
let muted = false;
let armed = false;

const AMB_LEVEL = 1.0;
const MUSIC_LEVEL = 0.22; // quiet on purpose: the five shells ARE this game's melody

export function initAudio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);

    amb = ctx.createGain();
    amb.gain.value = AMB_LEVEL;
    amb.connect(master);

    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.8;
    voiceGain.connect(master);

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
    startMusicBed();
    loadVoices();
    scheduleAmbient();

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
  g.connect(amb);
  src.start();
  lfo.start();
}

// ---------------- looping music bed ----------------
// ../assets/music/sirena.mp3 — ~50 s seam-crossfaded loop (loop=true,
// no gap math needed). Routed lowpass -> musicGain -> amb, so it ducks
// under the narrator together with the sea, and M mutes it with the
// rest. Filtered dark at 750 Hz and kept at 0.22: the pentatonic
// shells are the playable melody and nothing may blur their register.
// Any fetch/decode failure leaves the night exactly as it was.

function startMusicBed() {
  fetch('../assets/music/sirena.mp3')
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => {
      if (!ctx || !amb) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true; // the seam is pre-crossfaded
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 750; // a dark wash under the shell tones
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 3);
      src.connect(lp);
      lp.connect(g);
      g.connect(amb);
      src.start();
      musicGain = g;
    })
    .catch(() => {}); // no bed — the sea alone carries the night
}

// the bed eases out under the end stingers (win/lose stay on top)
function fadeMusicBed() {
  if (!ctx || !musicGain) return;
  musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.7);
}

// ---------------- narrator voice clips ----------------
// Fetched lazily after the gesture unlock; every failure is a silent
// no-op — the game must behave identically without the files.

const VOICE_FILES = {
  intro: '../assets/voice/sirena/intro.mp3',
  churn: '../assets/voice/sirena/churn.mp3',
  win: '../assets/voice/sirena/win.mp3',
  lose: '../assets/voice/sirena/lose.mp3',
};
const voiceBufs = {}; // name -> AudioBuffer
const voiceWanted = {}; // name -> true if requested before decode finished
let voiceSrc = null; // currently playing clip, so a new line cuts the old

function loadVoices() {
  for (const name of Object.keys(VOICE_FILES)) {
    fetch(VOICE_FILES[name])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        voiceBufs[name] = buf;
        if (voiceWanted[name]) {
          voiceWanted[name] = false;
          playVoice(name);
        }
      })
      .catch(() => {}); // missing/undecodable -> the night stays quiet
  }
}

// duck the ambience while a clip whispers, then ease back
function duckAmbience(dur) {
  const t0 = ctx.currentTime;
  amb.gain.setTargetAtTime(AMB_LEVEL * 0.4, t0, 0.15);
  amb.gain.setTargetAtTime(AMB_LEVEL, t0 + dur, 0.5);
}

export function playVoice(name) {
  if (!ctx || !voiceGain) return;
  try {
    const buf = voiceBufs[name];
    if (!buf) {
      if (VOICE_FILES[name]) voiceWanted[name] = true; // play once decoded
      return;
    }
    if (voiceSrc) {
      try {
        voiceSrc.stop();
      } catch (e) {
        /* already ended */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceGain);
    src.onended = () => {
      if (voiceSrc === src) voiceSrc = null;
    };
    src.start();
    voiceSrc = src;
    duckAmbience(buf.duration);
  } catch (e) {
    /* silent no-op */
  }
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
  fadeMusicBed(); // the bed recedes; the stinger stands alone
  pluck(73.42, 0, 0.16, 3.5); // D2 drone
  pluck(293.66, 0.0, 0.22, 1.0);
  pluck(349.23, 0.16, 0.22, 1.0);
  pluck(440.0, 0.32, 0.22, 1.1);
  pluck(523.25, 0.48, 0.22, 1.2);
  pluck(587.33, 0.64, 0.24, 1.6);
}

export function loseFade() {
  if (!ctx) return;
  fadeMusicBed(); // the bed recedes; the stinger stands alone
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

// ============================================================
// Night-world one-shots — all whisper-level, all enveloped from
// 0.0001 so nothing clicks. Ambient ones live on the amb bus so
// they duck under the narrator with the sea.
// ============================================================

// a single drip off her rock, echoing in the watery delay
export function waterDrip() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1900 + Math.random() * 700, t0);
  o.frequency.exponentialRampToValueAtTime(420, t0 + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  o.connect(g);
  g.connect(amb);
  g.connect(delaySend); // the cave answers
  o.start(t0);
  o.stop(t0 + 0.25);
}

// distant night bird over the channel: two soft FM chirps, rare
export function nightBird() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let k = 0; k < 2; k++) {
    const at = t0 + k * (0.22 + Math.random() * 0.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 1150 + Math.random() * 250;
    o.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = 24 + Math.random() * 14;
    const mg = ctx.createGain();
    mg.gain.value = 90;
    mod.connect(mg);
    mg.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800; // far away, softened
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.022, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    o.connect(lp);
    lp.connect(g);
    g.connect(amb);
    o.start(at);
    mod.start(at);
    o.stop(at + 0.25);
    mod.stop(at + 0.25);
  }
}

// wind gust crossing the water: bandpass-swept noise swell
export function windGust() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = 2.2 + Math.random() * 1.2;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(220, t0);
  bp.frequency.exponentialRampToValueAtTime(700 + Math.random() * 300, t0 + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05, t0 + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(amb);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

// kelp-slick wood groan: narrow resonant noise with a pitch drop —
// ambient on the scheduler, and the deck answers when a farol lands
export function rockCreak() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 14; // narrow -> groany resonance
  bp.frequency.setValueAtTime(300 + Math.random() * 120, t0);
  bp.frequency.exponentialRampToValueAtTime(120, t0 + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  src.connect(bp);
  bp.connect(g);
  g.connect(amb);
  src.start(t0);
  src.stop(t0 + 0.7);
}

// not your turn: the shell only laps low water under your hand
export function denyLap() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.025);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + 0.4);
}

// she lifts the comb before each round: faint high sparkle ticks
export function combShimmer() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let k = 0; k < 5; k++) {
    const at = t0 + k * 0.07 + Math.random() * 0.03;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2400 + Math.random() * 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.02, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    o.connect(g);
    g.connect(master);
    g.connect(delaySend);
    o.start(at);
    o.stop(at + 0.15);
  }
}

// ---------------- ambient scheduler ----------------
// every 8–25 s one quiet thing happens out in the night

function scheduleAmbient() {
  const tick = () => {
    if (!ctx) return;
    const r = Math.random();
    if (r < 0.34) waterDrip();
    else if (r < 0.58) windGust();
    else if (r < 0.82) rockCreak();
    else nightBird(); // the rarest visitor
    setTimeout(tick, 8000 + Math.random() * 17000);
  };
  setTimeout(tick, 6000 + Math.random() * 8000);
}
