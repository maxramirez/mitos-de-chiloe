// EL BRUJO DE QUICAVÍ · audio.js — 100% procedural WebAudio forest dread.
// Lazy AudioContext created in unlock() (the BEGIN click) — zero autoplay
// errors; every call is a safe no-op before unlock. M toggles mute via
// toggleMute(). All level moves use setTargetAtTime (click-free); update()
// is allocation-free; one shared 2 s noise buffer feeds every layer.
//
// Layers: night wind + high leaf rustle · static crackle (gain = the static
// meter — the danger is audible) · low forest drone (rises with pages taken)
// · heartbeat (static or the final push) · footsteps · lapping water during
// the boat push. One-shots: rip (page torn free), whisper(n) (the count,
// 'una… dos…' as breath, not speech), sting (first sight of him), relocate
// (sub thump when he moves), gutter (the farol sputters), beacon (7th page),
// caught, win, flutter (parchment stirs as you near a page), vanish (a long
// exhale when he leaves). Ambient one-shots every 8–25 s: tree creaks,
// distant night birds, wind gusts, insect shimmer — never over a voice clip.
//
// Narrator voice (mp3 clips under ../assets/voice/quicavi/) — fetched lazily
// AFTER unlock, decoded into buffers; every failure is a silent no-op. Clips
// play through voiceGain (0.8) -> master so M mutes them too; while a clip
// plays the ambience bus (wind/rustle/drone/water) ducks to ~40%
// (setTargetAtTime) and recovers when it ends.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let ambBus = null
  let noiseBuf = null
  let windLP = null
  let windGain = null
  let rustleGain = null
  let crackleGain = null
  let droneGain = null
  let stepBP = null
  let stepGain = null
  let hbOsc = null
  let hbGain = null
  let waterGain = null

  let t0 = 0
  let stepPhase = 0
  let hbPhase = 0
  let creakNext = -1e9
  let lastWind = -1
  let lastCrackle = -1
  let lastDrone = -1
  let lastWater = -1
  let ambNext = -1e9 // ambient one-shot scheduler (8–25 s)

  // narrator voice clips — loaded after unlock, silent no-op if absent
  let voiceGain = null
  const voiceBufs = {}
  let voiceSrc = null
  let voicePlaying = false
  let pendingVoice = null // BEGIN line is requested before its fetch settles
  let pendingUntil = 0

  const MASTER_LEVEL = 0.32
  const VOICE_NAMES = ['begin', 'win', 'lose', 'push']

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  function tap(g, t, peak, attack, decay) {
    g.gain.setTargetAtTime(peak, t, attack)
    g.gain.setTargetAtTime(0, t + attack * 3, decay)
  }

  function noiseLoop() {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    s.start()
    return s
  }

  function blip(type, freq, t, peak, attack, decay, freqEnd, dest) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (freqEnd !== undefined && freqEnd !== null) {
      o.frequency.setTargetAtTime(freqEnd, t + 0.02, decay * 0.5)
    }
    const g = ctx.createGain()
    g.gain.value = 0
    o.connect(g)
    g.connect(dest || master)
    tap(g, t, peak, attack, decay)
    o.start(t)
    o.stop(t + attack * 3 + decay * 8 + 0.3)
  }

  function hiss(t, peak, attack, decay, fType, fFreq, q, dur, dest) {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = fType
    f.frequency.value = fFreq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    s.connect(f)
    f.connect(g)
    g.connect(dest || master)
    tap(g, t, peak, attack, decay)
    s.start(t)
    s.stop(t + (dur || attack * 3 + decay * 8) + 0.3)
    return { filter: f, gain: g, src: s }
  }

  function build() {
    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER_LEVEL
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 14
    comp.ratio.value = 4
    comp.attack.value = 0.01
    comp.release.value = 0.25
    master.connect(comp)
    comp.connect(ctx.destination)

    // ambience bus (wind/rustle/drone/water) — voice clips duck this to ~40%
    ambBus = ctx.createGain()
    ambBus.gain.value = 1
    ambBus.connect(master)

    // narrator voice bus: clips -> voiceGain -> master (M mutes it too)
    voiceGain = ctx.createGain()
    voiceGain.gain.value = 0.8
    voiceGain.connect(master)

    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 2) | 0, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    // wind through black trees
    windLP = ctx.createBiquadFilter()
    windLP.type = 'lowpass'
    windLP.frequency.value = 210
    windLP.Q.value = 0.4
    windGain = ctx.createGain()
    windGain.gain.value = 0
    noiseLoop().connect(windLP)
    windLP.connect(windGain)
    windGain.connect(ambBus)

    // high leaf rustle, barely there
    const rustleBP = ctx.createBiquadFilter()
    rustleBP.type = 'bandpass'
    rustleBP.frequency.value = 3100
    rustleBP.Q.value = 0.6
    rustleGain = ctx.createGain()
    rustleGain.gain.value = 0
    noiseLoop().connect(rustleBP)
    rustleBP.connect(rustleGain)
    rustleGain.connect(ambBus)

    // the static — highpassed crackle, gain follows the meter
    const crackleHP = ctx.createBiquadFilter()
    crackleHP.type = 'highpass'
    crackleHP.frequency.value = 2300
    crackleGain = ctx.createGain()
    crackleGain.gain.value = 0
    noiseLoop().connect(crackleHP)
    crackleHP.connect(crackleGain)
    crackleGain.connect(master)

    // forest drone — detuned saws under heavy lowpass; rises with the pages
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 115
    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneLP.connect(droneGain)
    droneGain.connect(ambBus)
    const dr1 = ctx.createOscillator()
    dr1.type = 'sawtooth'
    dr1.frequency.value = 41
    const dr2 = ctx.createOscillator()
    dr2.type = 'sawtooth'
    dr2.frequency.value = 41.5
    const dr3 = ctx.createOscillator()
    dr3.type = 'sine'
    dr3.frequency.value = 27.5
    dr1.connect(droneLP)
    dr2.connect(droneLP)
    dr3.connect(droneLP)
    dr1.start()
    dr2.start()
    dr3.start()

    // footsteps on wet leaf-litter
    stepBP = ctx.createBiquadFilter()
    stepBP.type = 'bandpass'
    stepBP.frequency.value = 260
    stepBP.Q.value = 0.9
    stepGain = ctx.createGain()
    stepGain.gain.value = 0
    noiseLoop().connect(stepBP)
    stepBP.connect(stepGain)
    stepGain.connect(master)

    // heartbeat
    hbOsc = ctx.createOscillator()
    hbOsc.type = 'sine'
    hbOsc.frequency.value = 52
    hbGain = ctx.createGain()
    hbGain.gain.value = 0
    hbOsc.connect(hbGain)
    hbGain.connect(master)
    hbOsc.start()

    // channel water (the boat push)
    const waterLP = ctx.createBiquadFilter()
    waterLP.type = 'lowpass'
    waterLP.frequency.value = 360
    waterGain = ctx.createGain()
    waterGain.gain.value = 0
    noiseLoop().connect(waterLP)
    waterLP.connect(waterGain)
    waterGain.connect(ambBus)

    t0 = ctx.currentTime
    ambNext = t0 + 9 + Math.random() * 12 // first ambient one-shot, unhurried
  }

  // ---------- narrator voice (mp3 clips; every failure is a silent no-op) ---
  function loadVoices() {
    for (let i = 0; i < VOICE_NAMES.length; i++) {
      const n = VOICE_NAMES[i]
      try {
        fetch('../assets/voice/quicavi/' + n + '.mp3')
          .then(function (r) {
            if (!r.ok) throw new Error('http')
            return r.arrayBuffer()
          })
          .then(function (ab) {
            return new Promise(function (res, rej) {
              ctx.decodeAudioData(ab, res, rej)
            })
          })
          .then(function (buf) {
            voiceBufs[n] = buf
            // honor a line requested before its fetch settled (the BEGIN click)
            if (pendingVoice === n && ctx.currentTime < pendingUntil) {
              pendingVoice = null
              playVoice(buf)
            }
          })
          .catch(function () {})
      } catch (e) {}
    }
  }

  function setDuck(v) {
    if (ambBus) ambBus.gain.setTargetAtTime(v, ctx.currentTime, 0.35)
  }

  function voice(name) {
    if (!ready) return
    const buf = voiceBufs[name]
    if (!buf) {
      pendingVoice = name
      pendingUntil = ctx.currentTime + 4
      return
    }
    playVoice(buf)
  }

  function playVoice(buf) {
    try {
      if (voiceSrc) {
        try {
          voiceSrc.stop()
        } catch (e) {}
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(voiceGain)
      voiceSrc = s
      voicePlaying = true
      setDuck(0.4) // the forest steps back while the old man speaks
      s.onended = function () {
        if (voiceSrc === s) {
          voiceSrc = null
          voicePlaying = false
          setDuck(1)
        }
      }
      s.start()
    } catch (e) {
      voiceSrc = null
      voicePlaying = false
      setDuck(1)
    }
  }

  function unlock() {
    if (!AC) return
    if (!ctx) {
      try {
        ctx = new AC()
      } catch (e) {
        ctx = null
        return
      }
      build()
      ready = true
      loadVoices()
    }
    if (ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && p.catch) p.catch(function () {})
    }
  }

  // c: { active, moving, sprint, static01, pages01, hold01 }
  function update(dt, c) {
    if (!ready || !c) return
    const step = dt > 0.05 ? 0.05 : dt > 0 ? dt : 0
    const now = ctx.currentTime
    const st = clamp01(c.static01)
    const t = now - t0

    // wind breathes on a slow cycle
    const windTarget = (c.active ? 0.052 : 0.034) + 0.024 * Math.sin(t * 0.13) + 0.012 * Math.sin(t * 0.041 + 2)
    if (Math.abs(windTarget - lastWind) > 0.002) {
      lastWind = windTarget
      windGain.gain.setTargetAtTime(windTarget, now, 0.8)
      windLP.frequency.setTargetAtTime(180 + 90 * (0.5 + 0.5 * Math.sin(t * 0.09)), now, 1.2)
      rustleGain.gain.setTargetAtTime(0.0045 + 0.0035 * Math.sin(t * 0.21 + 1), now, 1.0)
    }

    // static crackle — the danger is audible
    const crackleTarget = c.active ? Math.pow(st, 1.6) * 0.5 + clamp01(c.hold01) * 0.14 : 0
    if (Math.abs(crackleTarget - lastCrackle) > 0.0015) {
      lastCrackle = crackleTarget
      crackleGain.gain.setTargetAtTime(crackleTarget, now, 0.06)
    }

    // drone rises with the pages and with the static
    const droneTarget = c.active ? 0.018 + clamp01(c.pages01) * 0.055 + st * 0.1 : 0.012
    if (Math.abs(droneTarget - lastDrone) > 0.0015) {
      lastDrone = droneTarget
      droneGain.gain.setTargetAtTime(droneTarget, now, 0.9)
    }

    // water + hull creaks while pushing off
    const waterTarget = clamp01(c.hold01) * 0.2
    if (Math.abs(waterTarget - lastWater) > 0.0015) {
      lastWater = waterTarget
      waterGain.gain.setTargetAtTime(waterTarget, now, 0.25)
    }
    if (c.hold01 > 0.02 && now > creakNext) {
      creakNext = now + 0.55 + Math.random() * 0.5
      blip('sawtooth', 74 + Math.random() * 18, now + 0.02, 0.05, 0.03, 0.18, 52)
    }

    // ambient forest one-shots every 8–25 s — never over a voice clip
    if (c.active && now > ambNext) {
      ambNext = now + 8 + Math.random() * 17
      if (!voicePlaying) {
        const r = Math.random()
        if (r < 0.34) ambient('treecreak')
        else if (r < 0.58) ambient('bird')
        else if (r < 0.84) ambient('gust')
        else ambient('insect')
      }
    }

    // footsteps
    if (c.active && c.moving) {
      stepPhase += step * (c.sprint ? 2.9 : 1.9)
      if (stepPhase >= 1) {
        stepPhase -= 1
        stepBP.frequency.setValueAtTime(200 + Math.random() * 240, now)
        tap(stepGain, now, (c.sprint ? 0.11 : 0.06) + Math.random() * 0.025, 0.004, 0.035)
      }
    } else if (stepPhase > 0.85) {
      stepPhase = 0.85
    }

    // heartbeat — the static is climbing, or the push is nearly done
    const dread = Math.max(st > 0.4 ? st : 0, clamp01(c.hold01) * 0.9)
    if (c.active && dread > 0) {
      const bpm = 56 + 58 * clamp01(dread)
      hbPhase += step * (bpm / 60)
      if (hbPhase >= 1) {
        hbPhase -= 1
        hbOsc.frequency.setValueAtTime(58, now)
        hbOsc.frequency.setTargetAtTime(45, now + 0.02, 0.05)
        tap(hbGain, now, 0.38, 0.008, 0.055)
        tap(hbGain, now + 0.17, 0.2, 0.008, 0.05)
      }
    } else {
      hbPhase = 0
    }
  }

  // the count, whispered: breathy formant taps, slightly different per number
  function whisper(n) {
    if (!ready) return
    const t = ctx.currentTime + 0.03
    const f1 = 760 + (n % 4) * 110
    const f2 = 520 + (n % 3) * 90
    hiss(t, 0.055, 0.03, 0.1, 'bandpass', f1, 5, 0.5)
    hiss(t + 0.14, 0.045, 0.035, 0.13, 'bandpass', f2, 5, 0.55)
    if (n >= 5) hiss(t + 0.3, 0.03, 0.03, 0.12, 'bandpass', f1 * 0.8, 6, 0.5)
  }

  // ---------- ambient one-shots (the forest lives, barely) -------------------
  function ambient(name) {
    if (!ready) return
    const t = ctx.currentTime + 0.02
    if (name === 'treecreak') {
      // an old trunk leans — filtered noise groan with a pitch-dropping saw
      const f0 = 92 + Math.random() * 30
      blip('sawtooth', f0, t, 0.022, 0.09, 0.5, f0 * 0.62, ambBus)
      hiss(t + 0.04, 0.018, 0.1, 0.4, 'bandpass', 240 + Math.random() * 120, 4, 1.6, ambBus)
      if (Math.random() < 0.5) blip('sawtooth', f0 * 1.18, t + 0.55, 0.013, 0.06, 0.35, f0 * 0.8, ambBus)
    } else if (name === 'bird') {
      // a far night bird — two or three small FM-ish chirps, very distant
      const base = 1450 + Math.random() * 600
      const n = 2 + (Math.random() < 0.4 ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.17 + Math.random() * 0.09)
        blip('sine', base * (1 + 0.06 * Math.random()), tt, 0.012, 0.012, 0.07, base * 0.82, ambBus)
      }
    } else if (name === 'gust') {
      // a wind gust pushes through the canopy and lets go
      const h = hiss(t, 0.045, 0.7, 1.4, 'bandpass', 480 + Math.random() * 260, 0.7, 4.5, ambBus)
      h.filter.frequency.setTargetAtTime(900 + Math.random() * 500, t + 0.5, 0.9)
      hiss(t + 0.3, 0.012, 0.6, 1.2, 'bandpass', 2900, 0.8, 3.6, ambBus)
    } else if (name === 'insect') {
      // insect shimmer at the edge of hearing — rare, brief, uneasy
      const f = 4200 + Math.random() * 1400
      blip('triangle', f, t, 0.006, 0.15, 0.5, f * 1.04, ambBus)
      blip('triangle', f * 1.013, t + 0.05, 0.005, 0.18, 0.55, f * 0.97, ambBus)
    }
  }

  function stinger(name) {
    if (!ready) return
    const t = ctx.currentTime + 0.02
    if (name === 'rip') {
      // paper torn off a nail
      const h = hiss(t, 0.2, 0.004, 0.07, 'highpass', 900, 0.7, 0.45)
      h.filter.frequency.setTargetAtTime(3800, t, 0.05)
      blip('sine', 90, t + 0.01, 0.07, 0.005, 0.07, 60)
    } else if (name === 'sting') {
      // first sight of him — a quiet dissonant pull
      blip('sawtooth', 196, t, 0.045, 0.015, 0.8, 188)
      blip('sawtooth', 207.6, t + 0.01, 0.04, 0.015, 0.85, 197)
      hiss(t, 0.03, 0.1, 0.5, 'bandpass', 900, 1.2, 2.2)
    } else if (name === 'relocate') {
      // he is somewhere else now — a thump under the ground
      blip('sine', 36, t, 0.05, 0.01, 0.18, 27)
    } else if (name === 'flutter') {
      // parchment stirs on its nail as you come close
      hiss(t, 0.035, 0.008, 0.05, 'highpass', 1600, 0.8, 0.3)
      hiss(t + 0.09, 0.028, 0.008, 0.06, 'highpass', 2100, 0.8, 0.3)
      hiss(t + 0.19, 0.02, 0.01, 0.08, 'highpass', 1800, 0.8, 0.35)
    } else if (name === 'vanish') {
      // he leaves — a long exhale folding back into the trees
      const h = hiss(t, 0.04, 0.12, 0.45, 'lowpass', 700, 0.6, 1.6)
      h.filter.frequency.setTargetAtTime(260, t + 0.15, 0.4)
      blip('sine', 44, t + 0.05, 0.03, 0.05, 0.4, 30)
    } else if (name === 'gutter') {
      // the farol sputters
      hiss(t, 0.07, 0.01, 0.06, 'bandpass', 1700, 2, 0.4)
      hiss(t + 0.12, 0.05, 0.01, 0.07, 'bandpass', 1400, 2, 0.4)
      hiss(t + 0.3, 0.06, 0.01, 0.1, 'bandpass', 1900, 2, 0.5)
      blip('sine', 120, t + 0.05, 0.03, 0.02, 0.2, 70)
    } else if (name === 'beacon') {
      // the seventh page — a cold far bell toward the water
      blip('sine', 65.4, t, 0.3, 0.008, 1.5)
      blip('sine', 98, t + 0.03, 0.14, 0.01, 1.1)
      blip('sine', 196, t + 0.06, 0.05, 0.01, 0.8)
    } else if (name === 'caught') {
      // the face — static blast + scream cluster + sub drop
      hiss(t, 0.42, 0.004, 0.5, 'highpass', 400, 0.7, 2.0)
      blip('sawtooth', 620, t, 0.2, 0.004, 0.5, 880)
      blip('sawtooth', 633, t, 0.18, 0.004, 0.55, 905)
      blip('sawtooth', 790, t + 0.03, 0.14, 0.004, 0.45, 1180)
      blip('sine', 70, t, 0.5, 0.005, 0.7, 24)
    } else if (name === 'win') {
      // el canal te suelta — water takes the hull, a hollow open chord
      const h = hiss(t, 0.16, 0.5, 1.6, 'lowpass', 420, 0.5, 5)
      h.filter.frequency.setTargetAtTime(180, t + 1.2, 1.0)
      hiss(t + 0.15, 0.1, 0.05, 0.5, 'bandpass', 800, 1.2, 2.0)
      blip('triangle', 110, t + 0.3, 0.09, 0.3, 2.4)
      blip('triangle', 164.8, t + 0.5, 0.07, 0.35, 2.3)
      blip('triangle', 220, t + 0.7, 0.06, 0.4, 2.2)
      blip('sine', 55, t + 0.3, 0.12, 0.3, 1.8)
    }
  }

  function toggleMute() {
    muted = !muted
    if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.05)
    return muted
  }

  return {
    unlock,
    update,
    whisper,
    stinger,
    voice,
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'unavailable' }
    },
  }
}
