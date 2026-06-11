// audio.js — EL TRAUCO procedural soundscape + narrator voice clips.
// Night forest wind, player footsteps (sprint is louder + faster), the
// Trauco's heavy little steps and wet breathing when near, a charm drone
// that rises while his gaze holds you, event stingers, ambient forest
// one-shots (creaks, twigs, gusts, a far night bird) on an 8-25 s
// scheduler, and four whispered Spanish voice lines (mp3, fetched lazily
// AFTER the unlock gesture; every failure is a silent no-op).
//
// Graph: layers -> master gain (0.32) -> DynamicsCompressor -> destination.
// Voices go through voiceGain (0.8) -> master, so M mutes them too; while
// a clip plays the wind bed ducks to ~40% (setTargetAtTime) and recovers.
// Lazy AudioContext created in unlock() (called from the BEGIN click, so no
// autoplay-policy errors); everything is a safe no-op before unlock.
// All level changes via setTargetAtTime; update() is allocation-free.
export function createAudio() {
  const AC =
    typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let noiseBuf = null
  let windBus = null
  let stepBP, stepGain
  let droneGain
  let breathBP, breathLow, breathGain
  let thumpOsc, thumpGain
  let hbOsc, hbGain

  let stepPhase = 0
  let breathPhase = 0.6
  let thumpPhase = 0
  let hbPhase = 0
  let lastWind = -1
  let lastDrone = -1

  // narrator voice clips (mp3) — loaded after unlock, silent no-op if absent
  let voiceGain = null
  const voiceBufs = {}
  let voiceSrc = null
  let voicePlaying = false
  let voiceDuck = 1
  let pendingVoice = null
  let pendingUntil = 0

  // ambient one-shot scheduler + interaction edges
  let ambNext = 6
  let lastRun = false
  let highCharm = false

  const MASTER = 0.32

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

  function lfo(freq, depth, param) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = depth
    o.connect(g)
    g.connect(param)
    o.start()
    return g
  }

  function blip(type, freq, t, peak, attack, decay, freqEnd) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (freqEnd !== undefined) o.frequency.setTargetAtTime(freqEnd, t + 0.02, decay * 0.5)
    const g = ctx.createGain()
    g.gain.value = 0
    o.connect(g)
    g.connect(master)
    tap(g, t, peak, attack, decay)
    o.start(t)
    o.stop(t + attack * 3 + decay * 8 + 0.2)
  }

  function hiss(t, peak, attack, decay, fType, fFreq, q, dur) {
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
    g.connect(master)
    tap(g, t, peak, attack, decay)
    s.start(t)
    s.stop(t + (dur || attack * 3 + decay * 8) + 0.2)
  }

  // ---------- new forest one-shots (all quiet — this collection whispers) ---
  function woodCreak(t) {
    // an old cypress leaning in the dark: pitch-dropping saw under grain
    const f0 = 120 + Math.random() * 90
    blip('sawtooth', f0, t, 0.032, 0.07, 0.5, f0 * 0.55)
    hiss(t, 0.022, 0.09, 0.4, 'bandpass', 380 + Math.random() * 320, 6, 2)
  }

  function twigSnap(t) {
    // something small steps on dead wood, somewhere in the fog
    hiss(t, 0.055, 0.002, 0.03, 'bandpass', 1700 + Math.random() * 1000, 1.5, 0.5)
    blip('triangle', 230, t, 0.026, 0.002, 0.05, 130)
  }

  function nightBird(t) {
    // a far-off chucao calling once in the night — thin rising chirps
    const n = 2 + ((Math.random() * 2) | 0)
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.16 + Math.random() * 0.08)
      const f = 1450 + Math.random() * 650
      blip('sine', f, tt, 0.016, 0.012, 0.07, f * 1.35)
    }
  }

  function windGust(t) {
    // a single slow gust pushing through the canopy, then gone
    hiss(t, 0.05, 1.1, 1.5, 'bandpass', 550 + Math.random() * 380, 0.7, 6.5)
  }

  function clothRustle(t) {
    // the woolen poncho shifting as the sprint starts
    hiss(t, 0.05, 0.015, 0.09, 'highpass', 2200, 0.7, 0.9)
  }

  function reliefSigh(t) {
    // the forest breathes again once the gaze lets go of you
    hiss(t, 0.045, 0.5, 0.9, 'bandpass', 470, 1.2, 3.5)
    blip('sine', 196, t + 0.2, 0.018, 0.35, 1.0)
  }

  // ---------- narrator voice (mp3 clips; every failure is a silent no-op) --
  function setDuck(v) {
    voiceDuck = v
    if (ready && lastWind > 0) {
      windBus.gain.setTargetAtTime(lastWind * voiceDuck, ctx.currentTime, 0.35)
    }
  }

  function playVoice(buf) {
    try {
      if (voiceSrc) {
        try {
          voiceSrc.stop()
        } catch {}
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(voiceGain)
      voiceSrc = s
      voicePlaying = true
      setDuck(0.4) // the wind steps back while the old man speaks
      s.onended = function () {
        if (voiceSrc === s) {
          voiceSrc = null
          voicePlaying = false
          setDuck(1)
        }
      }
      s.start()
    } catch {
      voiceSrc = null
      voicePlaying = false
      setDuck(1)
    }
  }

  function loadVoices() {
    const names = ['begin', 'win', 'lose', 'whisper']
    for (let i = 0; i < names.length; i++) {
      const n = names[i]
      try {
        fetch('../assets/voice/trauco/' + n + '.mp3')
          .then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status)
            return r.arrayBuffer()
          })
          .then(function (ab) {
            return new Promise(function (res, rej) {
              ctx.decodeAudioData(ab, res, rej)
            })
          })
          .then(function (buf) {
            voiceBufs[n] = buf
            // the BEGIN line is requested before its fetch settles — honor it
            if (pendingVoice === n && ctx.currentTime < pendingUntil) {
              pendingVoice = null
              playVoice(buf)
            }
          })
          .catch(function () {})
      } catch {}
    }
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

  function build() {
    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 14
    comp.ratio.value = 4
    comp.attack.value = 0.01
    comp.release.value = 0.25
    master.connect(comp)
    comp.connect(ctx.destination)

    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 2) | 0, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    // -- wind through cypress: two wandering bandpassed noise layers ----------
    windBus = ctx.createGain()
    windBus.gain.value = 0
    windBus.connect(master)
    const bp1 = ctx.createBiquadFilter()
    bp1.type = 'bandpass'
    bp1.frequency.value = 300
    bp1.Q.value = 0.9
    const w1 = ctx.createGain()
    w1.gain.value = 0.5
    noiseLoop().connect(bp1)
    bp1.connect(w1)
    w1.connect(windBus)
    lfo(0.057, 100, bp1.frequency)
    lfo(0.047, 0.16, w1.gain)
    const bp2 = ctx.createBiquadFilter()
    bp2.type = 'bandpass'
    bp2.frequency.value = 520
    bp2.Q.value = 0.9
    const w2 = ctx.createGain()
    w2.gain.value = 0.36
    noiseLoop().connect(bp2)
    bp2.connect(w2)
    w2.connect(windBus)
    lfo(0.041, 90, bp2.frequency)
    lfo(0.061, 0.13, w2.gain)

    // -- player footsteps: noise -> bandpass -> tapped gain -------------------
    stepBP = ctx.createBiquadFilter()
    stepBP.type = 'bandpass'
    stepBP.frequency.value = 1000
    stepBP.Q.value = 1.1
    stepGain = ctx.createGain()
    stepGain.gain.value = 0
    noiseLoop().connect(stepBP)
    stepBP.connect(stepGain)
    stepGain.connect(master)

    // -- charm drone: detuned dark cluster under a heavy lowpass --------------
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 150
    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneLP.connect(droneGain)
    droneGain.connect(master)
    const dr1 = ctx.createOscillator()
    dr1.type = 'sawtooth'
    dr1.frequency.value = 49
    const dr2 = ctx.createOscillator()
    dr2.type = 'sawtooth'
    dr2.frequency.value = 49.66
    const dr3 = ctx.createOscillator()
    dr3.type = 'sine'
    dr3.frequency.value = 24.5
    dr1.connect(droneLP)
    dr2.connect(droneLP)
    dr3.connect(droneLP)
    dr1.start()
    dr2.start()
    dr3.start()

    // -- his wet breathing: noise -> two filters -> tapped gain ---------------
    breathGain = ctx.createGain()
    breathGain.gain.value = 0
    breathGain.connect(master)
    breathBP = ctx.createBiquadFilter()
    breathBP.type = 'bandpass'
    breathBP.frequency.value = 480
    breathBP.Q.value = 1.3
    noiseLoop().connect(breathBP)
    breathBP.connect(breathGain)
    breathLow = ctx.createBiquadFilter()
    breathLow.type = 'bandpass'
    breathLow.frequency.value = 160
    breathLow.Q.value = 1.6
    noiseLoop().connect(breathLow)
    breathLow.connect(breathGain)

    // -- his footsteps: persistent sub osc, envelope thumps -------------------
    thumpOsc = ctx.createOscillator()
    thumpOsc.type = 'sine'
    thumpOsc.frequency.value = 55
    thumpGain = ctx.createGain()
    thumpGain.gain.value = 0
    thumpOsc.connect(thumpGain)
    thumpGain.connect(master)
    thumpOsc.start()

    // -- heartbeat under high charm -------------------------------------------
    hbOsc = ctx.createOscillator()
    hbOsc.type = 'sine'
    hbOsc.frequency.value = 52
    hbGain = ctx.createGain()
    hbGain.gain.value = 0
    hbOsc.connect(hbGain)
    hbGain.connect(master)
    hbOsc.start()

    // -- narrator voice bus: clips -> voiceGain -> master (M mutes it too) ----
    voiceGain = ctx.createGain()
    voiceGain.gain.value = 0.8
    voiceGain.connect(master)
  }

  function unlock() {
    if (!AC) return
    if (!ctx) {
      try {
        ctx = new AC()
      } catch {
        ctx = null
        return
      }
      build()
      ready = true
      loadVoices() // only ever after the user gesture — never on page load
    }
    if (ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && p.catch) p.catch(function () {})
    }
  }

  // c: { moving, run, charm, gazed, traucoDist, traucoStepRate }
  function update(dt, c) {
    if (!ready || !c) return
    const step = dt > 0.1 ? 0.1 : dt > 0 ? dt : 0
    const now = ctx.currentTime
    const charm = clamp01(c.charm)

    // wind thins as the charm takes hold (the forest holds its breath);
    // a playing voice clip ducks it to 40% (lastWind stores the unducked bed)
    const windT = 0.2 * (1 - 0.55 * charm)
    if (Math.abs(windT - lastWind) > 0.003) {
      lastWind = windT
      windBus.gain.setTargetAtTime(windT * voiceDuck, now, 0.8)
    }

    // ambient forest one-shots every 8-25 s — never over a voice clip, and
    // the forest goes quiet while the charm runs high
    ambNext -= step
    if (ambNext <= 0) {
      ambNext = 8 + Math.random() * 17
      if (!voicePlaying && charm < 0.5) {
        const r = Math.random()
        const t = now + 0.05 + Math.random() * 0.3
        if (r < 0.32) woodCreak(t)
        else if (r < 0.56) twigSnap(t)
        else if (r < 0.8) windGust(t)
        else nightBird(t)
      }
    }

    // poncho rustle on the first stride of a sprint
    const running = !!(c.moving && c.run)
    if (running && !lastRun) clothRustle(now)
    lastRun = running

    // a long exhale when you slip a heavy gaze (only while the sim runs)
    if (charm > 0.5) highCharm = true
    if (highCharm && charm < 0.05 && c.traucoDist < 9000) {
      highCharm = false
      reliefSigh(now)
    }

    // player footsteps
    if (c.moving) {
      stepPhase += step * (c.run ? 3.1 : 2.0)
      if (stepPhase >= 1) {
        stepPhase -= 1
        stepBP.frequency.setValueAtTime(600 + Math.random() * 700, now)
        tap(stepGain, now, (c.run ? 0.17 : 0.09) + Math.random() * 0.05, 0.004, 0.028)
      }
    } else if (stepPhase > 0.85) {
      stepPhase = 0.85
    }

    // his steps, when near
    if (c.traucoDist < 30 && c.traucoStepRate > 0) {
      thumpPhase += step * c.traucoStepRate
      if (thumpPhase >= 1) {
        thumpPhase -= 1
        const prox = clamp01((30 - c.traucoDist) / 27)
        thumpOsc.frequency.setValueAtTime(62, now)
        thumpOsc.frequency.setTargetAtTime(40, now + 0.01, 0.04)
        tap(thumpGain, now, 0.04 + prox * prox * 0.3, 0.005, 0.06)
      }
    }

    // wet breathing when near (< 22 m)
    if (c.traucoDist < 22) {
      breathPhase += step * 0.5
      if (breathPhase >= 1) {
        breathPhase -= 1
        const prox = clamp01((22 - c.traucoDist) / 17)
        const base = 0.04 + 0.14 * prox
        breathBP.frequency.setValueAtTime(360 + Math.random() * 260, now)
        tap(breathGain, now, base * 0.55, 0.3, 0.22) // inhale
        tap(breathGain, now + 1.0, base, 0.14, 0.45) // wet exhale
      }
    }

    // charm drone
    const droneT = charm * charm * 0.34
    if (Math.abs(droneT - lastDrone) > 0.002) {
      lastDrone = droneT
      droneGain.gain.setTargetAtTime(droneT, now, 0.3)
    }

    // heartbeat above charm 0.55
    if (charm > 0.55) {
      const bpm = 55 + 60 * charm
      hbPhase += step * (bpm / 60)
      if (hbPhase >= 1) {
        hbPhase -= 1
        hbOsc.frequency.setValueAtTime(58, now)
        hbOsc.frequency.setTargetAtTime(46, now + 0.02, 0.05)
        tap(hbGain, now, 0.4, 0.008, 0.055)
        tap(hbGain, now + 0.17, 0.22, 0.008, 0.05)
      }
    } else {
      hbPhase = 0
    }
  }

  function stinger(name) {
    if (!ready) return
    const t = ctx.currentTime + 0.02
    if (name === 'vine') {
      // bright little chime — quilineja cut free
      blip('sine', 659.25, t, 0.11, 0.008, 0.45)
      blip('sine', 987.77, t + 0.07, 0.09, 0.008, 0.5)
      blip('sine', 1318.51, t + 0.15, 0.07, 0.01, 0.6)
      blip('triangle', 164.81, t, 0.07, 0.01, 0.3)
    } else if (name === 'escalate') {
      // somewhere in the fog, something small stamps twice
      blip('sine', 56, t + 0.5, 0.2, 0.01, 0.12, 38)
      blip('sine', 56, t + 0.78, 0.16, 0.01, 0.12, 38)
    } else if (name === 'gate') {
      // the wisp flares — an opening chord
      blip('triangle', 293.66, t, 0.12, 0.3, 1.8)
      blip('triangle', 440.0, t + 0.1, 0.1, 0.3, 1.7)
      blip('triangle', 587.33, t + 0.2, 0.08, 0.35, 1.6)
      hiss(t, 0.05, 0.6, 1.2, 'bandpass', 1800, 2, 4)
    } else if (name === 'alert') {
      // a snort — he heard you
      hiss(t, 0.26, 0.012, 0.14, 'bandpass', 300, 2, 1.5)
      blip('sine', 82, t, 0.22, 0.008, 0.14, 50)
    } else if (name === 'gaze') {
      // his eyes find you — thin cold ping
      blip('sine', 1244.51, t, 0.045, 0.012, 0.8)
      hiss(t, 0.035, 0.3, 0.8, 'highpass', 2600, 0.8, 3)
    } else if (name === 'denied') {
      // the gate refuses — a single low blip
      blip('sine', 58, t, 0.18, 0.01, 0.2, 40)
    } else if (name === 'win') {
      // resolved warm chord — the forest lets you go
      blip('triangle', 146.83, t, 0.13, 0.25, 2.4)
      blip('triangle', 220.0, t + 0.14, 0.11, 0.3, 2.2)
      blip('triangle', 293.66, t + 0.28, 0.1, 0.3, 2.2)
      blip('triangle', 369.99, t + 0.42, 0.07, 0.35, 2.0)
      blip('sine', 1174.66, t + 0.6, 0.04, 0.01, 1.2)
    } else if (name === 'lose') {
      // green wood bending: creak, crack, deep thud
      blip('sawtooth', 170, t, 0.26, 0.01, 0.8, 54)
      blip('sawtooth', 134, t + 0.14, 0.2, 0.01, 0.8, 44)
      hiss(t + 0.45, 0.22, 0.012, 0.25, 'bandpass', 750, 0.8, 2)
      blip('sine', 42, t + 0.6, 0.42, 0.01, 0.5, 30)
    }
  }

  function toggleMute() {
    muted = !muted
    if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05)
    return muted
  }

  return {
    unlock,
    update,
    stinger,
    voice,
    toggleMute,
    get state() {
      return {
        unlocked: ready,
        muted: muted,
        contextState: ctx ? ctx.state : 'unavailable',
      }
    },
  }
}
