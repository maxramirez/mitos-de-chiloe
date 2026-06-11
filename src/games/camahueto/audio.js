// EL CAMAHUETO — audio.js
// 100% procedural WebAudio. Lazy AudioContext created in unlock() (called from
// the BEGIN click — a user gesture — so no autoplay-policy errors). Everything
// is a safe no-op before unlock. M toggles mute via the master gain.
// Layers: gully rumble (noise+sub, pitches with speed), wind, and one-shot
// stingers: shaving chime, hit thud, gush splash, jump whoosh, win/lose.
// update() is allocation-free; levels move via setTargetAtTime (click-free).

export function createAudio() {
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  let ctx = null;
  let ready = false;
  let muted = false;

  const MASTER = 0.3;
  let master, noiseBuf;
  let rumbleLP, rumbleGain, subOsc, subGain, windBP, windGain;
  let lastSpd = -1;

  const CHIME = [1174.66, 1318.51, 1479.98, 1760.0, 1975.53]; // D6 pentatonic sparkle

  function noiseLoop() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }

  function unlock() {
    if (ready || !AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // rumble: earth tearing downhill
    rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 220;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    noiseLoop().connect(rumbleLP);
    rumbleLP.connect(rumbleGain);
    rumbleGain.connect(master);

    subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.value = 38;
    subGain = ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start();

    // wind past the ears
    windBP = ctx.createBiquadFilter();
    windBP.type = 'bandpass';
    windBP.frequency.value = 800;
    windBP.Q.value = 0.9;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noiseLoop().connect(windBP);
    windBP.connect(windGain);
    windGain.connect(master);

    ready = true;
  }

  // one-shot tone (event-time only, never per-frame)
  function blip(type, f0, peak, attack, decay, f1) {
    if (!ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay * 2);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(peak, t, attack);
    g.gain.setTargetAtTime(0, t + attack * 3, decay);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + attack * 3 + decay * 8 + 0.2);
  }

  function hiss(peak, attack, decay, fType, fFreq, q) {
    if (!ready) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = fType;
    f.frequency.value = fFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(peak, t, attack);
    g.gain.setTargetAtTime(0, t + attack * 3, decay);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + attack * 3 + decay * 8 + 0.2);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.03);
      return muted;
    },
    // speedNorm 0..1, airborne bool — called every sim frame, allocation-free
    update(speedNorm, airborne) {
      if (!ready) return;
      const s = Math.round(speedNorm * 64) + (airborne ? 100 : 0);
      if (s === lastSpd) return; // only touch params when audibly different
      lastSpd = s;
      const t = ctx.currentTime;
      const ground = airborne ? 0.25 : 1;
      rumbleGain.gain.setTargetAtTime((0.05 + speedNorm * 0.13) * ground, t, 0.08);
      rumbleLP.frequency.setTargetAtTime(180 + speedNorm * 340, t, 0.1);
      subGain.gain.setTargetAtTime((0.05 + speedNorm * 0.07) * ground, t, 0.08);
      subOsc.frequency.setTargetAtTime(36 + speedNorm * 18, t, 0.1);
      windGain.gain.setTargetAtTime(0.012 + speedNorm * 0.055 + (airborne ? 0.025 : 0), t, 0.08);
      windBP.frequency.setTargetAtTime(650 + speedNorm * 700, t, 0.1);
    },
    chime(n) {
      const f = CHIME[n % CHIME.length];
      blip('sine', f, 0.16, 0.004, 0.12);
      blip('sine', f * 2.01, 0.05, 0.004, 0.09);
    },
    thud() {
      blip('sine', 105, 0.55, 0.005, 0.16, 36);
      hiss(0.3, 0.006, 0.1, 'lowpass', 260, 0.7);
    },
    splash() { hiss(0.16, 0.01, 0.12, 'bandpass', 1500, 0.8); },
    jump() { hiss(0.06, 0.008, 0.05, 'highpass', 1800, 0.6); },
    land() { blip('sine', 70, 0.1, 0.004, 0.05, 45); },
    win() {
      blip('sine', 587.33, 0.14, 0.01, 0.4);
      blip('sine', 880.0, 0.12, 0.01, 0.5);
      blip('sine', 1174.66, 0.1, 0.01, 0.7);
      hiss(0.08, 0.4, 1.2, 'lowpass', 700, 0.5); // surf
    },
    lose() {
      blip('sawtooth', 180, 0.12, 0.02, 0.5, 48);
      blip('sine', 90, 0.2, 0.02, 0.6, 30);
      hiss(0.18, 0.01, 0.35, 'lowpass', 220, 0.7);
    },
  };
}
