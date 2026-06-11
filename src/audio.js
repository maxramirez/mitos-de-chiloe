// src/audio.js — CALEUCHE horror soundscape. Procedural WebAudio plus optional
// voice clips (fetched after the user gesture; missing files are silent no-ops).
// Patagonian night: wool wind that holds its breath near the beings, ink-dark
// surf, a dread drone, a heartbeat, and the Caleuche's waltz — festive music
// that is always slightly wrong.
//
// Graph: ambient layers -> ambDuck -> master gain (0.3) -> compressor -> out.
//        voices -> per-clip envelope -> voiceGain (0.8) -> master (M mutes all).
// While a voice plays, ambDuck eases to ~40% and back (setTargetAtTime).
// Lazy AudioContext created in unlock() (autoplay policy); everything is a
// safe no-op before unlock or without WebAudio. One shared 2 s noise buffer.
// All level changes via setTargetAtTime (no clicks). update() is allocation-free
// except rare scheduled one-shots (every 8-25 s).

export function createAudio() {
  const AC =
    typeof window !== 'undefined'
      ? window.AudioContext || window.webkitAudioContext
      : null;

  let ctx = null;
  let ready = false;
  let muted = false;

  // ---- persistent nodes -------------------------------------------------
  let master = null;
  let ambDuck = null; // ambient layers route through this; speech ducks it
  let voiceGain = null; // voices -> voiceGain -> master (so M mutes voices too)
  let noiseBuf = null;
  let windBus, windHP;
  let surfHeightGain;
  let stepBP, stepGain;
  let droneGain;
  let hbOsc, hbGain;
  let waltzMel, waltzMelGain, waltzBass, waltzBassGain, waltzBus, waltzDetGain;

  // ---- voice clips ---------------------------------------------------------
  const VOICE_BASE = '../assets/voice/caleuche/';
  const VOICE_NAMES = [
    'intro',
    'win',
    'blackout',
    'banner',
    'lore-pincoya',
    'lore-trauco',
    'lore-camahueto',
    'lore-invunche',
    'lore-millalobo',
    'lore-sirena',
  ];
  const voiceBuffers = Object.create(null);
  const voiceLoaded = []; // names, in decode-completion order
  let voicesRequested = false;
  let voiceSrc = null; // currently playing BufferSource (the handle)
  let voiceEnv = null; // its envelope gain
  let voicePlaying = null; // name of the playing clip, or null
  let pendingSpeak = null; // speak() requested before its buffer decoded

  // ---- scheduler / cadence state (scalars only) --------------------------
  let stepPhase = 0;
  let hbPhase = 0;
  let waltzNext = -1e9;
  let waltzBeat = 0;
  let lastWind = -1;
  let lastHP = -1;
  let lastSurf = -1;
  let lastDrone = -1;
  let lastWaltz = -1;
  let lastDet = -1;
  let ambNext = -1; // next ambient one-shot (ctx time); -1 = not scheduled yet

  const MASTER_LEVEL = 0.3;
  const VOICE_LEVEL = 0.8;
  const DUCK_LEVEL = 0.4; // ambience while a voice speaks
  const BPM = 96;
  const BEAT = 60 / BPM; // one beat of the 3/4 waltz
  const LOOKAHEAD = 0.35; // seconds of currentTime lookahead (no setInterval)

  // D minor. 16 bars x 3 beats = 48 slots; 0 = rest (previous note rings out).
  const D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0;
  const A4 = 440.0, Bb4 = 466.16, C5 = 523.25, D5 = 587.33;
  const MELODY = [
    D4, 0, F4,   A4, 0, 0,    G4, F4, E4,  F4, 0, D4,
    F4, 0, A4,   C5, 0, 0,    Bb4, A4, G4, A4, 0, 0,
    D5, 0, C5,   Bb4, 0, A4,  G4, 0, Bb4,  A4, 0, F4,
    E4, 0, G4,   F4, 0, E4,   D4, E4, 0,   D4, 0, 0,
  ];
  // One chord root per bar (D2 / G2 / F2 / A2). Beat 1 = root, beats 2-3 = fifth.
  const BASS = [
    73.42, 73.42, 98.0, 73.42,
    73.42, 87.31, 98.0, 110.0,
    73.42, 98.0, 98.0, 73.42,
    110.0, 73.42, 110.0, 73.42,
  ];

  // ---- small helpers ------------------------------------------------------
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Percussive envelope on a persistent gain node, click-free.
  function tap(g, t, peak, attack, decay) {
    g.gain.setTargetAtTime(peak, t, attack);
    g.gain.setTargetAtTime(0, t + attack * 3, decay);
  }

  function noiseLoop() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }

  function lfo(freq, depth, param) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    return g;
  }

  // One-shot tone for stingers (event-time only, never per-frame).
  function blip(type, freq, t, peak, attack, decay, freqEnd, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined && freqEnd !== null)
      o.frequency.setTargetAtTime(freqEnd, t + 0.02, decay * 0.5);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(dest || master);
    tap(g, t, peak, attack, decay);
    o.start(t);
    o.stop(t + attack * 3 + decay * 8 + 0.2);
  }

  // One-shot filtered noise for stingers (reuses the shared buffer).
  function hiss(t, peak, attack, decay, fType, fFreq, q, dur, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = fType;
    f.frequency.value = fFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(dest || master);
    tap(g, t, peak, attack, decay);
    s.start(t);
    s.stop(t + (dur || attack * 3 + decay * 8) + 0.2);
    return { filter: f, gain: g, src: s };
  }

  // ---- graph construction (once, inside unlock) ---------------------------
  function build() {
    // master -> compressor -> destination
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ctx.destination);

    // ambient layers -> ambDuck -> master (speech ducks ambDuck to ~40%)
    ambDuck = ctx.createGain();
    ambDuck.gain.value = 1;
    ambDuck.connect(master);

    // voices -> voiceGain -> master (inside the mute chain: M silences voices)
    voiceGain = ctx.createGain();
    voiceGain.gain.value = VOICE_LEVEL;
    voiceGain.connect(master);

    // shared 2-second noise buffer
    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 2) | 0, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // -- wind: two detuned bandpassed noise layers, slow LFO wander ---------
    windBus = ctx.createGain();
    windBus.gain.value = 0;
    windHP = ctx.createBiquadFilter();
    windHP.type = 'highpass';
    windHP.frequency.value = 10; // rises as the island holds its breath
    windBus.connect(windHP);
    windHP.connect(ambDuck);

    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 320;
    bp1.Q.value = 0.9;
    const w1 = ctx.createGain();
    w1.gain.value = 0.5;
    noiseLoop().connect(bp1);
    bp1.connect(w1);
    w1.connect(windBus);
    lfo(0.061, 110, bp1.frequency); // freq wander, stays ~250-700
    lfo(0.047, 0.16, w1.gain); // slow gain breathing

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 560;
    bp2.Q.value = 0.9;
    const w2 = ctx.createGain();
    w2.gain.value = 0.38;
    noiseLoop().connect(bp2);
    bp2.connect(w2);
    w2.connect(windBus);
    lfo(0.043, 95, bp2.frequency);
    lfo(0.057, 0.13, w2.gain);

    // -- surf: deep slow swells, scaled by player height --------------------
    const surfLP = ctx.createBiquadFilter();
    surfLP.type = 'lowpass';
    surfLP.frequency.value = 160;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.55; // LFO swings this 0.15..0.95 over ~9.5 s
    surfHeightGain = ctx.createGain();
    surfHeightGain.gain.value = 0;
    noiseLoop().connect(surfLP);
    surfLP.connect(swellGain);
    swellGain.connect(surfHeightGain);
    surfHeightGain.connect(ambDuck);
    lfo(0.105, 0.4, swellGain.gain); // 8-12 s swell period

    // -- footsteps: persistent noise -> bandpass -> tapped gain -------------
    stepBP = ctx.createBiquadFilter();
    stepBP.type = 'bandpass';
    stepBP.frequency.value = 1000;
    stepBP.Q.value = 1.1;
    stepGain = ctx.createGain();
    stepGain.gain.value = 0;
    noiseLoop().connect(stepBP);
    stepBP.connect(stepGain);
    stepGain.connect(ambDuck);

    // -- dread drone: detuned dark cluster under a heavy lowpass ------------
    const droneLP = ctx.createBiquadFilter();
    droneLP.type = 'lowpass';
    droneLP.frequency.value = 170;
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneLP.connect(droneGain);
    droneGain.connect(ambDuck);
    const dr1 = ctx.createOscillator();
    dr1.type = 'sawtooth';
    dr1.frequency.value = 55;
    const dr2 = ctx.createOscillator();
    dr2.type = 'sawtooth';
    dr2.frequency.value = 55.7; // detuned beat against dr1
    const dr3 = ctx.createOscillator();
    dr3.type = 'sine';
    dr3.frequency.value = 27.5; // sub root
    dr1.connect(droneLP);
    dr2.connect(droneLP);
    dr3.connect(droneLP);
    dr1.start();
    dr2.start();
    dr3.start();

    // -- heartbeat: persistent sub osc, envelope thumps ----------------------
    hbOsc = ctx.createOscillator();
    hbOsc.type = 'sine';
    hbOsc.frequency.value = 52;
    hbGain = ctx.createGain();
    hbGain.gain.value = 0;
    hbOsc.connect(hbGain);
    hbGain.connect(ambDuck);
    hbOsc.start();

    // -- the Caleuche's ghost waltz ------------------------------------------
    // melody + bass -> waltzBus (distance volume) -> lowpass -> dry + feedback delay
    waltzBus = ctx.createGain();
    waltzBus.gain.value = 0;
    const waltzLP = ctx.createBiquadFilter();
    waltzLP.type = 'lowpass';
    waltzLP.frequency.value = 1050;
    waltzBus.connect(waltzLP);
    waltzLP.connect(ambDuck); // dry
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    waltzLP.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(ambDuck);

    waltzMel = ctx.createOscillator();
    waltzMel.type = 'triangle';
    waltzMel.frequency.value = D4;
    waltzMelGain = ctx.createGain();
    waltzMelGain.gain.value = 0;
    waltzMel.connect(waltzMelGain);
    waltzMelGain.connect(waltzBus);
    waltzMel.start();

    waltzBass = ctx.createOscillator();
    waltzBass.type = 'triangle';
    waltzBass.frequency.value = BASS[0];
    waltzBassGain = ctx.createGain();
    waltzBassGain.gain.value = 0;
    waltzBass.connect(waltzBassGain);
    waltzBassGain.connect(waltzBus);
    waltzBass.start();

    // +/- 8 cent warble so the tune is always slightly wrong (more after won)
    waltzDetGain = lfo(0.11, 8, waltzMel.detune);
    const detOut = ctx.createGain();
    detOut.gain.value = 1;
    waltzDetGain.connect(detOut);
    detOut.connect(waltzBass.detune);
  }

  // ---- voice clips (fetch -> decode after user gesture; silent on failure) --
  function loadVoices() {
    if (voicesRequested || typeof fetch !== 'function') return;
    voicesRequested = true;
    for (let i = 0; i < VOICE_NAMES.length; i++) {
      const name = VOICE_NAMES[i];
      try {
        fetch(VOICE_BASE + name + '.mp3')
          .then(function (r) {
            if (!r.ok) throw new Error('missing');
            return r.arrayBuffer();
          })
          .then(function (ab) {
            return ctx.decodeAudioData(ab);
          })
          .then(function (buf) {
            voiceBuffers[name] = buf;
            voiceLoaded.push(name);
            // a speak() arrived before this clip finished decoding: play it now
            if (pendingSpeak === name) {
              pendingSpeak = null;
              speak(name);
            }
          })
          .catch(function () {}); // missing/undecodable file: game runs identically
      } catch (e) {}
    }
  }

  function speak(name) {
    if (!ready) return;
    const buf = voiceBuffers[name];
    if (!buf) {
      // remember the most recent request; plays when (if) its decode lands
      if (VOICE_NAMES.indexOf(name) !== -1) pendingSpeak = name;
      return;
    }
    stopSpeech(); // one voice at a time
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(1, t, 0.03); // click-free fade-in
    src.connect(env);
    env.connect(voiceGain);
    voiceSrc = src;
    voiceEnv = env;
    voicePlaying = name;
    ambDuck.gain.setTargetAtTime(DUCK_LEVEL, t, 0.25); // duck wind/drone/waltz
    src.onended = function () {
      if (voiceSrc !== src) return; // superseded by a newer clip or stopSpeech
      voiceSrc = null;
      voiceEnv = null;
      voicePlaying = null;
      ambDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    };
    try {
      src.start(t);
    } catch (e) {}
  }

  function stopSpeech() {
    pendingSpeak = null;
    if (!ready || !voiceSrc) return;
    const t = ctx.currentTime;
    const src = voiceSrc;
    const env = voiceEnv;
    voiceSrc = null;
    voiceEnv = null;
    voicePlaying = null;
    env.gain.setTargetAtTime(0, t, 0.04); // fade, no click
    try {
      src.stop(t + 0.3);
    } catch (e) {}
    ambDuck.gain.setTargetAtTime(1, t, 0.5);
  }

  function voiceState() {
    return { loaded: voiceLoaded.slice(), playing: voicePlaying };
  }

  // ---- ambient one-shots (context-aware, every 8-25 s, whisper-quiet) -------
  // Rigging/wood creak near the dock or the ship: high-Q noise band, pitch drop.
  function fxCreak(t) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 11;
    const f0 = 320 + Math.random() * 260;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.setTargetAtTime(f0 * 0.45, t + 0.05, 0.28); // wood under strain
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(ambDuck);
    tap(g, t, 0.05, 0.09, 0.3);
    let end = t + 1.4;
    if (Math.random() < 0.5) {
      const t2 = t + 0.6 + Math.random() * 0.5; // smaller answering creak
      f.frequency.setValueAtTime(f0 * 0.8, t2);
      f.frequency.setTargetAtTime(f0 * 0.4, t2 + 0.04, 0.22);
      tap(g, t2, 0.032, 0.07, 0.24);
      end = t2 + 1.4;
    }
    s.start(t);
    s.stop(end);
  }

  // Distant lobo-marino calls off the water: raspy falling barks, far away.
  function fxLobo(t) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f);
    f.connect(g);
    g.connect(ambDuck);
    let bt = t;
    const barks = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < barks; i++) {
      const fr = 96 + Math.random() * 30;
      o.frequency.setValueAtTime(fr * 1.3, bt);
      o.frequency.setTargetAtTime(fr, bt + 0.02, 0.08);
      tap(g, bt, 0.022, 0.02, 0.09);
      bt += 0.28 + Math.random() * 0.2;
    }
    o.start(t);
    o.stop(bt + 1.0);
  }

  // Leaf rustle in the forest band: fluttering highpassed noise.
  function fxRustle(t) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(ambDuck);
    let bt = t;
    const flutters = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < flutters; i++) {
      tap(g, bt, 0.016 + Math.random() * 0.014, 0.02, 0.05);
      bt += 0.06 + Math.random() * 0.11;
    }
    s.start(t);
    s.stop(bt + 0.6);
  }

  // Stone knocks near the cave: two-three dull falling taps.
  function fxKnock(t) {
    const knocks = 2 + (Math.random() < 0.3 ? 1 : 0);
    let bt = t;
    for (let i = 0; i < knocks; i++) {
      const fr = 150 + Math.random() * 70;
      blip('triangle', fr, bt, i === 0 ? 0.06 : 0.04, 0.003, 0.06, fr * 0.55, ambDuck);
      bt += 0.2 + Math.random() * 0.3;
    }
  }

  // Distant night bird: rare gentle FM chirps.
  function fxBird(t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const g = ctx.createGain();
    g.gain.value = 0;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 38 + Math.random() * 20;
    const mg = ctx.createGain();
    mg.gain.value = 120;
    mod.connect(mg);
    mg.connect(o.frequency);
    o.connect(g);
    g.connect(ambDuck);
    const base = 1250 + Math.random() * 500;
    let bt = t;
    const chirps = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < chirps; i++) {
      o.frequency.setValueAtTime(base + Math.random() * 150, bt);
      o.frequency.setTargetAtTime(base * 0.82, bt + 0.02, 0.07);
      tap(g, bt, 0.014, 0.012, 0.06);
      bt += 0.14 + Math.random() * 0.12;
    }
    mod.start(t);
    o.start(t);
    mod.stop(bt + 0.8);
    o.stop(bt + 0.8);
  }

  // Wind gust variant: one slow extra swell over the steady wind bed.
  function fxGust(t) {
    hiss(t, 0.045, 0.45, 0.9, 'bandpass', 620 + Math.random() * 320, 0.7, 5, ambDuck);
  }

  // Pick a one-shot that fits where the player is standing right now.
  function ambientOneShot(c) {
    const t = ctx.currentTime + 0.05;
    const r = Math.random();
    const dockDist = c.dockDist !== undefined && c.dockDist !== null ? c.dockDist : 1e9;
    const shipDist = c.caleucheDist !== undefined && c.caleucheDist !== null ? c.caleucheDist : 1e9;
    const caveDist = c.caveDist !== undefined && c.caveDist !== null ? c.caveDist : 1e9;
    const ty = c.terrainY !== undefined && c.terrainY !== null ? c.terrainY : 0;
    if ((dockDist < 45 || shipDist < 60) && r < 0.65) return fxCreak(t);
    if (caveDist < 55 && r < 0.7) return fxKnock(t);
    if (ty > 2 && ty < 22 && r < 0.6) return fxRustle(t);
    if (c.playerHeight < 4 && r < 0.45) return fxLobo(t);
    return r < 0.5 ? fxBird(t) : fxGust(t);
  }

  // ---- public API ----------------------------------------------------------
  function unlock() {
    if (!AC) return; // WebAudio unavailable: permanent no-op
    if (!ctx) {
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
        return;
      }
      build();
      ready = true;
      loadVoices(); // only ever after the user gesture, never on page load
    }
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function update(dt, c) {
    if (!ready || !c) return;
    const step = dt > 0.1 ? 0.1 : dt > 0 ? dt : 0;
    const now = ctx.currentTime;

    // -- wind thins near a being (the island holds its breath) --------------
    const near = clamp01((25 - c.nearestDist) / 25);
    const windTarget = 0.26 * (1 - 0.78 * near);
    if (Math.abs(windTarget - lastWind) > 0.002) {
      lastWind = windTarget;
      windBus.gain.setTargetAtTime(windTarget, now, 0.6);
    }
    const hpTarget = 10 + 720 * near;
    if (Math.abs(hpTarget - lastHP) > 2) {
      lastHP = hpTarget;
      windHP.frequency.setTargetAtTime(hpTarget, now, 0.6);
    }

    // -- surf vs player height (full < 2 m, gone > 10 m) ---------------------
    const surfTarget = clamp01((10 - c.playerHeight) / 8) * 0.3;
    if (Math.abs(surfTarget - lastSurf) > 0.002) {
      lastSurf = surfTarget;
      surfHeightGain.gain.setTargetAtTime(surfTarget, now, 0.8);
    }

    // -- footsteps ------------------------------------------------------------
    if (c.moving) {
      stepPhase += step * (c.run ? 3.2 : 2.2);
      if (stepPhase >= 1) {
        stepPhase -= 1;
        stepBP.frequency.setValueAtTime(700 + Math.random() * 700, now);
        tap(stepGain, now, 0.1 + Math.random() * 0.08, 0.004, 0.028);
      }
    } else if (stepPhase > 0.85) {
      stepPhase = 0.85; // next step lands promptly when moving resumes
    }

    // -- dread drone: gain ~ dread^2 * 0.22 ----------------------------------
    const dread = clamp01(c.dread);
    const droneTarget = dread * dread * 0.22;
    if (Math.abs(droneTarget - lastDrone) > 0.0015) {
      lastDrone = droneTarget;
      droneGain.gain.setTargetAtTime(droneTarget, now, 0.9);
    }

    // -- heartbeat: dread > 0.55 or stalker rush, 60 -> 110 bpm ---------------
    const rushing = c.stalker === 'rush';
    if (dread > 0.55 || rushing) {
      const drive = rushing && dread < 0.8 ? 0.8 : dread;
      const bpm = 60 + 50 * drive;
      hbPhase += step * (bpm / 60);
      if (hbPhase >= 1) {
        hbPhase -= 1;
        hbOsc.frequency.setValueAtTime(58, now);
        hbOsc.frequency.setTargetAtTime(46, now + 0.02, 0.05);
        tap(hbGain, now, 0.42, 0.008, 0.055); // lub
        tap(hbGain, now + 0.17, 0.24, 0.008, 0.05); // dub
      }
    } else {
      hbPhase = 0;
    }

    // -- the ghost waltz (currentTime lookahead scheduler, no setInterval) ----
    if (c.caleucheDist !== null && c.caleucheDist !== undefined) {
      if (waltzNext < now - 0.5) {
        waltzNext = now + 0.08; // (re)join cleanly, keep beat index
      }
      while (waltzNext < now + LOOKAHEAD) {
        const f = MELODY[waltzBeat];
        if (f > 0) {
          waltzMel.frequency.setValueAtTime(f, waltzNext);
          tap(waltzMelGain, waltzNext, 0.16, 0.01, 0.16);
        }
        const beat = waltzBeat % 3;
        const root = BASS[(waltzBeat - beat) / 3];
        waltzBass.frequency.setValueAtTime(beat === 0 ? root : root * 1.5, waltzNext);
        tap(waltzBassGain, waltzNext, beat === 0 ? 0.22 : 0.12, 0.008, 0.09);
        waltzBeat = (waltzBeat + 1) % MELODY.length;
        waltzNext += BEAT;
      }
      const prox = clamp01(1 - c.caleucheDist / 250); // audible under ~250 m
      const waltzTarget = prox * prox * (c.won ? 0.6 : 0.34);
      if (Math.abs(waltzTarget - lastWaltz) > 0.002) {
        lastWaltz = waltzTarget;
        waltzBus.gain.setTargetAtTime(waltzTarget, now, 0.7);
      }
    } else {
      waltzNext = -1e9;
      if (lastWaltz !== 0) {
        lastWaltz = 0;
        waltzBus.gain.setTargetAtTime(0, now, 0.4);
      }
    }
    // after won: louder handled above, MORE detuned here (8 -> 21 cents)
    const detTarget = c.won ? 21 : 8;
    if (detTarget !== lastDet) {
      lastDet = detTarget;
      waltzDetGain.gain.setTargetAtTime(detTarget, now, 2.0);
    }

    // -- ambient one-shots: randomized 8-25 s scheduler, context-aware --------
    if (c.started) {
      if (ambNext < 0) {
        ambNext = now + 8 + Math.random() * 17; // first one only after a beat
      } else if (now >= ambNext) {
        ambNext = now + 8 + Math.random() * 17;
        ambientOneShot(c);
      }
    }
  }

  function stinger(name) {
    if (!ready) return;
    const t = ctx.currentTime + 0.02;
    if (name === 'encounter') {
      // low bell toll + airy whisper-noise swell
      blip('sine', 98, t, 0.34, 0.008, 0.9);
      blip('sine', 271, t, 0.1, 0.008, 0.5); // inharmonic partial
      hiss(t + 0.12, 0.07, 0.5, 0.9, 'bandpass', 2100, 2.5, 4);
    } else if (name === 'summon') {
      // deep horn + distant bell
      blip('triangle', 58, t, 0.4, 0.25, 1.3);
      blip('triangle', 87.3, t + 0.05, 0.26, 0.3, 1.2);
      blip('sine', 587.33, t + 0.9, 0.07, 0.004, 0.8);
      blip('sine', 1409, t + 0.9, 0.025, 0.004, 0.45);
    } else if (name === 'stalker') {
      // sub thump + close breath
      blip('sine', 46, t, 0.5, 0.006, 0.18, 34);
      hiss(t + 0.05, 0.12, 0.09, 0.32, 'bandpass', 850, 0.7, 2.2);
    } else if (name === 'blackout') {
      // reversed-cymbal swell into silence
      const h = hiss(t, 0.38, 0.55, 0.018, 'highpass', 900, 0.8, 2.4);
      h.filter.frequency.setValueAtTime(900, t);
      h.filter.frequency.setTargetAtTime(4200, t, 0.6);
      h.gain.gain.setTargetAtTime(0, t + 1.45, 0.018); // fast cut
    } else if (name === 'win') {
      // hollow unresolved chord (Dsus-ish), long decay into the waltz
      blip('triangle', 146.83, t, 0.13, 0.4, 2.6);
      blip('triangle', 220.0, t + 0.08, 0.11, 0.45, 2.5);
      blip('triangle', 329.63, t + 0.16, 0.09, 0.5, 2.4);
      blip('sine', 392.0, t + 0.24, 0.05, 0.55, 2.2);
    } else if (name === 'tick') {
      // soft UI tick: parchment turn for the bestiary
      blip('sine', 1320, t, 0.045, 0.003, 0.035);
      blip('sine', 880, t + 0.025, 0.028, 0.003, 0.05);
    } else if (name === 'charm') {
      // a mark is granted: two quiet hollow notes
      blip('sine', 587.33, t, 0.055, 0.01, 0.5);
      blip('sine', 880.0, t + 0.12, 0.04, 0.012, 0.6);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (ready) {
      master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.05);
    }
    return muted;
  }

  return {
    unlock,
    update,
    stinger,
    toggleMute,
    speak,
    stopSpeech,
    voiceState,
    get state() {
      return {
        unlocked: ready,
        muted: muted,
        contextState: ctx ? ctx.state : 'unavailable',
      };
    },
  };
}
