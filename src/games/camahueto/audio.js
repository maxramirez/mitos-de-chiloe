// EL CAMAHUETO — audio.js
// Mostly procedural WebAudio. Lazy AudioContext created in unlock() (called
// from the BEGIN click — a user gesture — so no autoplay-policy errors).
// Everything is a safe no-op before unlock. M toggles mute via the master gain.
// Layers: gully rumble (noise+sub, pitches with speed), wind, and one-shot
// stingers: shaving chime, hit thud, gush splash, jump whoosh, win/lose.
// Night-ambience one-shots (pebble tumbles, wind gusts, horn shimmer, a rare
// night bird) fire on a randomized 8-25 s scheduler; all ambience runs through
// bedBus so it ducks under the narrator. Voice clips (title/win/lose/whisper)
// are fetched + decoded after unlock; if missing the game is identical.
// update() is allocation-free; levels move via setTargetAtTime (click-free).

export function createAudio() {
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  let ctx = null;
  let ready = false;
  let muted = false;

  const MASTER = 0.3;
  let master, noiseBuf;
  let bedBus, voiceGain;
  let rumbleLP, rumbleGain, subOsc, subGain, windBP, windGain;
  let lastSpd = -1;
  let nextAmb = 0;

  // narrator clips — short lines from the game's own cards
  const VOICE_FILES = ['title', 'win', 'lose', 'whisper'];
  const voiceBufs = {};
  let voicesLoading = false;
  let pendingVoice = null; // requested before its decode finished
  let activeVoices = 0;

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

    // bedBus: every ambience layer runs through this, so a playing voice
    // can duck the whole bed with one gain
    bedBus = ctx.createGain();
    bedBus.gain.value = 1;
    bedBus.connect(master);

    // voices: dedicated gain into the master/mute chain (M mutes voices too)
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.8;
    voiceGain.connect(master);
    loadVoices();

    nextAmb = ctx.currentTime + 7 + Math.random() * 10;

    // rumble: earth tearing downhill
    rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 220;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    noiseLoop().connect(rumbleLP);
    rumbleLP.connect(rumbleGain);
    rumbleGain.connect(bedBus);

    subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.value = 38;
    subGain = ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subGain);
    subGain.connect(bedBus);
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
    windGain.connect(bedBus);

    ready = true;
  }

  // ---- narrator voices ------------------------------------------------------
  // Fetch + decode only after the gesture unlock. Any failure (offline, file
  // missing, decode error) is swallowed: the game behaves identically.
  function loadVoices() {
    if (voicesLoading) return;
    voicesLoading = true;
    for (let i = 0; i < VOICE_FILES.length; i++) {
      const name = VOICE_FILES[i];
      try {
        fetch('../assets/voice/camahueto/' + name + '.mp3')
          .then((r) => { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); })
          .then((ab) => ctx.decodeAudioData(ab))
          .then((buf) => {
            voiceBufs[name] = buf;
            // the title line is requested on BEGIN, before its decode lands
            if (pendingVoice && pendingVoice.name === name &&
                performance.now() - pendingVoice.at < 8000) {
              pendingVoice = null;
              playVoice(name);
            }
          })
          .catch(() => {});
      } catch (e) { /* silent no-op */ }
    }
  }

  function playVoice(name) {
    if (!ready) return;
    try {
      const buf = voiceBufs[name];
      if (!buf) { pendingVoice = { name, at: performance.now() }; return; }
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(voiceGain);
      activeVoices++;
      bedBus.gain.setTargetAtTime(0.4, t, 0.2); // duck the bed under the voice
      s.onended = () => {
        activeVoices = Math.max(0, activeVoices - 1);
        if (activeVoices === 0) bedBus.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
      };
      s.start(t);
    } catch (e) { /* silent no-op */ }
  }

  // one-shot tone (event-time only, never per-frame); `at` = start offset (s)
  function blip(type, f0, peak, attack, decay, f1, at) {
    if (!ready) return;
    const t = ctx.currentTime + (at || 0);
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

  function hiss(peak, attack, decay, fType, fFreq, q, at) {
    if (!ready) return;
    const t = ctx.currentTime + (at || 0);
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

  // ---- night-ambience one-shots (all into bedBus, so voices duck them) ------

  // loose stones tumbling down the torn banks: a few filtered ticks, pitch dropping
  function pebbleTumble() {
    const n = 4 + ((Math.random() * 4) | 0);
    let at = 0;
    for (let i = 0; i < n; i++) {
      at += 0.05 + Math.random() * 0.11;
      const t = ctx.currentTime + at;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1250 - i * 110 + Math.random() * 220;
      f.Q.value = 2.4;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.02 + Math.random() * 0.018, t, 0.004);
      g.gain.setTargetAtTime(0, t + 0.014, 0.03);
      s.connect(f); f.connect(g); g.connect(bedBus);
      s.start(t);
      s.stop(t + 0.4);
    }
  }

  // a gust funneling through the gully: bandpass noise swell, sweeping up then down
  function windGust() {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(450, t);
    f.frequency.linearRampToValueAtTime(900 + Math.random() * 350, t + 1.2);
    f.frequency.linearRampToValueAtTime(480, t + 2.6);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.028 + Math.random() * 0.014, t, 0.5);
    g.gain.setTargetAtTime(0, t + 1.4, 0.55);
    s.connect(f); f.connect(g); g.connect(bedBus);
    s.start(t);
    s.stop(t + 4.5);
  }

  // faint golden ring drifting back from the calf's horn: detuned high sines
  function hornShimmer() {
    const t = ctx.currentTime;
    const base = 1567.98 * (Math.random() < 0.5 ? 1 : 1.1892); // G6 / Bb6
    const ratios = [1, 1.0035, 1.498];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratios[i];
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.011 - i * 0.0025, t + i * 0.06, 0.3);
      g.gain.setTargetAtTime(0, t + 0.9, 0.5);
      o.connect(g); g.connect(bedBus);
      o.start(t);
      o.stop(t + 3.2);
    }
  }

  // rare distant night bird (queltehue): two quick FM-ish "tu-wee" chirps
  function nightBird() {
    const t = ctx.currentTime;
    const peak = 0.011 + Math.random() * 0.007; // far away
    const f0 = 1500 + Math.random() * 350;
    for (let c = 0; c < 2; c++) {
      const t0 = t + c * (0.34 + Math.random() * 0.12);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t0 + 0.09);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t0 + 0.18);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(peak, t0, 0.015);
      g.gain.setTargetAtTime(0, t0 + 0.14, 0.04);
      o.connect(g); g.connect(bedBus);
      o.start(t0);
      o.stop(t0 + 0.55);
    }
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
      // ambient one-shot scheduler (only ticks while the sim runs)
      const tNow = ctx.currentTime;
      if (tNow >= nextAmb) {
        nextAmb = tNow + 8 + Math.random() * 17;
        const r = Math.random();
        if (r < 0.34) pebbleTumble();
        else if (r < 0.62) windGust();
        else if (r < 0.85) hornShimmer();
        else nightBird(); // rare
      }
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
    // fade the speed bed out (win/lose — update() stops being called)
    bedOff() {
      if (!ready) return;
      const t = ctx.currentTime;
      rumbleGain.gain.setTargetAtTime(0, t, 0.25);
      subGain.gain.setTargetAtTime(0, t, 0.25);
      windGain.gain.setTargetAtTime(0, t, 0.25);
      lastSpd = -1; // a future update() re-applies levels
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
    // narrator clip (title/win/lose/whisper); silent no-op if not loaded
    voice(name) { playVoice(name); },
    // soft dirt scrape — first press of a steer key while grounded
    scrape() { hiss(0.035, 0.012, 0.07, 'lowpass', 420, 0.8); },
    // stones settling after an impact — delayed scatter of ticks behind the thud
    debris() {
      if (!ready) return;
      for (let i = 0; i < 4; i++) {
        const at = 0.1 + i * 0.07 + Math.random() * 0.05;
        hiss(0.05 - i * 0.009, 0.004, 0.03, 'bandpass', 900 - i * 130, 2.0, at);
        if (i < 2) blip('triangle', 240 - i * 60, 0.028, 0.004, 0.05, 110, at);
      }
    },
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
