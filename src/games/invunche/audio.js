// EL INVUNCHE · audio.js — 100% procedural WebAudio cave soundscape.
// Lazy AudioContext created in unlock() (called from the BEGIN click), so no
// autoplay-policy errors; every call is a safe no-op before unlock. M toggles
// mute via toggleMute(). All level moves use setTargetAtTime (click-free) and
// update() is allocation-free; one shared 2 s noise buffer feeds everything.
//
// Layers: cave drone (grows as the candle dies) · wet breath + low growl
// (gain = Invunche proximity) · echoing drips (lookahead scheduler) · player
// footsteps · heartbeat (close danger / dying candle). One-shots: dragStep
// (his shuffle, volume = proximity) and stingers — toll, sconce, unlock,
// snarl, caught, dark, win, lowwax. Rare cave life on an 8-25 s scheduler:
// pebble falls, wind moans, bat flutters, ground rumbles; the candle itself
// sputters when the wax runs low.
//
// Voice: whispered Spanish clips (assets/voice/invunche/*.mp3) fetched lazily
// after the BEGIN gesture, decoded into buffers, played through voiceGain
// (0.8) into master so M mutes them too. While a clip speaks, the whole
// procedural bed (amb bus) ducks to ~40% and eases back. Any fetch/decode
// failure is a silent no-op — the game is identical without the files.
//
// Music: a pre-looped ~50 s bed (assets/music/invunche.mp3) fetched after the
// same BEGIN gesture, looped (the seam is pre-crossfaded) through a lowpass
// (2400 Hz, keeps it cavern-dark under the procedural drone) into musicGain
// (0.22) on the amb bus — so it ducks under voice and obeys M with everything
// else. It eases out on the win/caught/dark stingers (end stingers stay on
// top) and breathes back in if a sconce relights the candle mid-dark. Any
// fetch/decode failure is a silent no-op.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let amb = null // duckable ambience bus — everything procedural lives here
  let voiceGain = null
  let noiseBuf = null
  let echoBus = null // shared cave-echo send (delay + feedback)
  let droneGain = null
  let breathBP = null
  let breathGain = null
  let growlOsc = null
  let growlGain = null
  let stepBP = null
  let stepGain = null
  let dragLP = null
  let dragGain = null
  let hbOsc = null
  let hbGain = null

  let stepPhase = 0
  let breathPhase = 0
  let hbPhase = 0
  let dripNext = -1e9
  let ambNext = -1 // randomized 8-25 s cave-life scheduler
  let sputNext = 0 // low-wax candle sputter
  let lastDrone = -1
  let lastGrowl = -1

  let voiceLoads = null // name -> Promise<AudioBuffer|null>
  let voiceSeq = 0
  let voiceSrc = null

  let musicGain = null
  let musicLP = null
  let musicLoadStarted = false
  let musicStopped = false // win/caught: the bed never comes back

  const MASTER_LEVEL = 0.32
  const MUSIC_LEVEL = 0.22

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  // percussive envelope on a persistent gain node, click-free
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

  // one-shot tone (event-time only, never per-frame)
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
    g.connect(dest || amb)
    tap(g, t, peak, attack, decay)
    o.start(t)
    o.stop(t + attack * 3 + decay * 8 + 0.3)
  }

  // one-shot filtered noise (reuses the shared buffer)
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
    g.connect(dest || amb)
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

    // ambience bus: the whole procedural bed, duckable under voice clips
    amb = ctx.createGain()
    amb.gain.value = 1
    amb.connect(master)

    // voice clips bypass the duck but sit inside the mute chain
    voiceGain = ctx.createGain()
    voiceGain.gain.value = 0.8
    voiceGain.connect(master)

    // music bed: lowpassed loop on the amb bus — ducks under voice, mutes with M
    musicLP = ctx.createBiquadFilter()
    musicLP.type = 'lowpass'
    musicLP.frequency.value = 2400
    musicGain = ctx.createGain()
    musicGain.gain.value = 0
    musicLP.connect(musicGain)
    musicGain.connect(amb)

    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 2) | 0, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    // cave echo send: anything connected to echoBus rings back wet
    echoBus = ctx.createGain()
    echoBus.gain.value = 1
    const delay = ctx.createDelay(1.0)
    delay.delayTime.value = 0.31
    const fb = ctx.createGain()
    fb.gain.value = 0.42
    const wet = ctx.createGain()
    wet.gain.value = 0.4
    const wetLP = ctx.createBiquadFilter()
    wetLP.type = 'lowpass'
    wetLP.frequency.value = 1400
    echoBus.connect(delay)
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(wetLP)
    wetLP.connect(wet)
    wet.connect(amb)

    // drone: two detuned saws + sub sine under a heavy lowpass
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 150
    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneLP.connect(droneGain)
    droneGain.connect(amb)
    const dr1 = ctx.createOscillator()
    dr1.type = 'sawtooth'
    dr1.frequency.value = 48
    const dr2 = ctx.createOscillator()
    dr2.type = 'sawtooth'
    dr2.frequency.value = 48.6
    const dr3 = ctx.createOscillator()
    dr3.type = 'sine'
    dr3.frequency.value = 24
    dr1.connect(droneLP)
    dr2.connect(droneLP)
    dr3.connect(droneLP)
    dr1.start()
    dr2.start()
    dr3.start()

    // his wet breath: bandpassed noise, tapped on a slow cadence
    breathBP = ctx.createBiquadFilter()
    breathBP.type = 'bandpass'
    breathBP.frequency.value = 430
    breathBP.Q.value = 1.4
    breathGain = ctx.createGain()
    breathGain.gain.value = 0
    noiseLoop().connect(breathBP)
    breathBP.connect(breathGain)
    breathGain.connect(amb)

    // his low growl under the breath
    growlOsc = ctx.createOscillator()
    growlOsc.type = 'sawtooth'
    growlOsc.frequency.value = 58
    const growlLP = ctx.createBiquadFilter()
    growlLP.type = 'lowpass'
    growlLP.frequency.value = 130
    growlGain = ctx.createGain()
    growlGain.gain.value = 0
    growlOsc.connect(growlLP)
    growlLP.connect(growlGain)
    growlGain.connect(amb)
    growlOsc.start()

    // player footsteps on wet stone
    stepBP = ctx.createBiquadFilter()
    stepBP.type = 'bandpass'
    stepBP.frequency.value = 520
    stepBP.Q.value = 1.0
    stepGain = ctx.createGain()
    stepGain.gain.value = 0
    noiseLoop().connect(stepBP)
    stepBP.connect(stepGain)
    stepGain.connect(amb)

    // his dragging foot (one-shot taps through a persistent lowpass)
    dragLP = ctx.createBiquadFilter()
    dragLP.type = 'lowpass'
    dragLP.frequency.value = 260
    dragGain = ctx.createGain()
    dragGain.gain.value = 0
    noiseLoop().connect(dragLP)
    dragLP.connect(dragGain)
    dragGain.connect(amb)
    dragGain.connect(echoBus)

    // heartbeat
    hbOsc = ctx.createOscillator()
    hbOsc.type = 'sine'
    hbOsc.frequency.value = 52
    hbGain = ctx.createGain()
    hbGain.gain.value = 0
    hbOsc.connect(hbGain)
    hbGain.connect(amb)
    hbOsc.start()
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
      loadMusic()
    }
    if (ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && p.catch) p.catch(function () {})
    }
  }

  // ---------------- looping music bed ---------------------------------------
  // Fetched once after the BEGIN gesture; the file's loop seam is pre-
  // crossfaded so source.loop is gapless. Every failure path is a silent
  // no-op — the procedural cave carries the game alone.
  function loadMusic() {
    if (musicLoadStarted) return
    musicLoadStarted = true
    try {
      fetch('../assets/music/invunche.mp3')
        .then((r) => {
          if (!r.ok) throw new Error('http ' + r.status)
          return r.arrayBuffer()
        })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          if (!buf || !ready || musicStopped) return
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.loop = true
          src.connect(musicLP)
          src.start()
          musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 1.2)
        })
        .catch(() => {})
    } catch (e) {}
  }

  // ---------------- whispered voice clips ----------------------------------
  // Fetched only after the BEGIN gesture (unlock). Every failure path is a
  // silent no-op: a missing file resolves to null and voice() does nothing.
  function loadVoices() {
    if (voiceLoads) return
    voiceLoads = {}
    const names = ['intro', 'win', 'caught', 'dark', 'heard']
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      try {
        voiceLoads[name] = fetch('../assets/voice/invunche/' + name + '.mp3')
          .then((r) => {
            if (!r.ok) throw new Error('http ' + r.status)
            return r.arrayBuffer()
          })
          .then((ab) => ctx.decodeAudioData(ab))
          .catch(() => null)
      } catch (e) {
        voiceLoads[name] = Promise.resolve(null)
      }
    }
  }

  // play a clip (latest call wins); ambience ducks to ~40% while it speaks
  function voice(name) {
    if (!ready || !voiceLoads || !voiceLoads[name]) return
    const seq = ++voiceSeq
    voiceLoads[name].then((buf) => {
      if (!buf || seq !== voiceSeq || !ready) return
      try {
        if (voiceSrc) {
          try {
            voiceSrc.stop()
          } catch (e) {}
          voiceSrc = null
        }
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(voiceGain)
        const t = ctx.currentTime + 0.04
        amb.gain.setTargetAtTime(0.4, t, 0.2)
        src.onended = () => {
          if (voiceSrc !== src) return
          voiceSrc = null
          amb.gain.setTargetAtTime(1, ctx.currentTime, 0.55)
        }
        voiceSrc = src
        src.start(t)
      } catch (e) {}
    })
  }

  // ---------------- rare cave life (ambient one-shots) ----------------------
  // small stones tumbling somewhere off in the dark, ringing down the echo
  function pebbleFall(t) {
    let tt = t
    const n = 2 + ((Math.random() * 3) | 0)
    for (let i = 0; i < n; i++) {
      const f = 2400 - i * 360 + Math.random() * 500
      hiss(tt, 0.034 * (1 - i * 0.16), 0.002, 0.025, 'bandpass', f, 6, 0.3, echoBus)
      tt += 0.07 + Math.random() * 0.16
    }
    blip('sine', 130 + Math.random() * 60, tt, 0.018, 0.004, 0.07, 70, echoBus)
  }

  // a slow gust breathing through the tunnels
  function windMoan(t) {
    const h = hiss(t, 0.045 + Math.random() * 0.025, 1.1, 1.5, 'bandpass', 220 + Math.random() * 160, 2.2, 5)
    h.filter.frequency.setTargetAtTime(120 + Math.random() * 80, t + 0.8, 1.2)
  }

  // leathery wings skittering past, high and faint
  function batFlutter(t) {
    let tt = t
    const n = 5 + ((Math.random() * 4) | 0)
    for (let i = 0; i < n; i++) {
      hiss(tt, 0.016 + Math.random() * 0.01, 0.004, 0.018, 'bandpass', 3400 + Math.random() * 1800, 3, 0.12, echoBus)
      tt += 0.045 + Math.random() * 0.05
    }
  }

  // the cave shifting its weight, far below
  function groundRumble(t) {
    blip('sine', 30 + Math.random() * 8, t, 0.085, 0.9, 1.8, 24)
    hiss(t + 0.2, 0.028, 0.8, 1.4, 'lowpass', 90, 0.7, 4)
  }

  function ambientOneShot() {
    const t = ctx.currentTime + 0.05
    const r = Math.random()
    if (r < 0.34) pebbleFall(t)
    else if (r < 0.58) windMoan(t)
    else if (r < 0.8) batFlutter(t)
    else groundRumble(t)
  }

  // the flame fighting the dark — tiny dry crackles right at your hand (no echo)
  function sputter(now) {
    const t = now + 0.01
    hiss(t, 0.018 + Math.random() * 0.014, 0.003, 0.03, 'bandpass', 3000 + Math.random() * 2500, 2.5, 0.2)
    if (Math.random() < 0.4) hiss(t + 0.05, 0.012, 0.003, 0.02, 'bandpass', 4200, 3, 0.15)
    if (Math.random() < 0.25) blip('triangle', 900 + Math.random() * 500, t + 0.03, 0.007, 0.004, 0.05, 600)
  }

  // c: { active, moving, sprint, prox (0..1), wax01 }
  function update(dt, c) {
    if (!ready || !c) return
    const step = dt > 0.05 ? 0.05 : dt > 0 ? dt : 0
    const now = ctx.currentTime
    const prox = clamp01(c.prox)

    // drone rises as the wax falls and as he closes in
    const droneTarget = c.active ? 0.045 + 0.12 * (1 - clamp01(c.wax01)) + 0.1 * prox : 0.025
    if (Math.abs(droneTarget - lastDrone) > 0.0015) {
      lastDrone = droneTarget
      droneGain.gain.setTargetAtTime(droneTarget, now, 0.9)
    }

    // wet breath cadence — louder and faster as he nears
    if (c.active && prox > 0.02) {
      breathPhase += step * (0.42 + prox * 0.5)
      if (breathPhase >= 1) {
        breathPhase -= 1
        const level = prox * prox * 0.5
        breathBP.frequency.setValueAtTime(330 + Math.random() * 260, now)
        tap(breathGain, now, level * (0.7 + Math.random() * 0.5), 0.16, 0.4)
      }
    } else {
      breathPhase = 0
    }
    const growlTarget = c.active ? prox * prox * 0.07 : 0
    if (Math.abs(growlTarget - lastGrowl) > 0.0015) {
      lastGrowl = growlTarget
      growlGain.gain.setTargetAtTime(growlTarget, now, 0.7)
    }

    // drips — echoing, sparse
    if (now > dripNext) {
      dripNext = now + 1.4 + Math.random() * 4.6
      const f = 1300 + Math.random() * 1700
      blip('sine', f, now + 0.05, 0.022 + Math.random() * 0.02, 0.003, 0.06, f * 0.55, echoBus)
    }

    // rare cave life — pebbles, wind, wings, the ground itself (8-25 s apart)
    if (c.active) {
      if (ambNext < 0) ambNext = now + 8 + Math.random() * 17
      else if (now >= ambNext) {
        ambNext = now + 8 + Math.random() * 17
        ambientOneShot()
      }
    }

    // the candle sputters as the wax runs low
    if (c.active && c.wax01 > 0 && c.wax01 < 0.22 && now >= sputNext) {
      sputNext = now + 0.7 + Math.random() * 2.6
      sputter(now)
    }

    // player footsteps
    if (c.active && c.moving) {
      stepPhase += step * (c.sprint ? 3.0 : 1.9)
      if (stepPhase >= 1) {
        stepPhase -= 1
        stepBP.frequency.setValueAtTime(380 + Math.random() * 420, now)
        tap(stepGain, now, (c.sprint ? 0.14 : 0.07) + Math.random() * 0.03, 0.004, 0.03)
      }
    } else if (stepPhase > 0.85) {
      stepPhase = 0.85
    }

    // heartbeat — he is close, or the candle is nearly gone
    const dread = Math.max(prox > 0.55 ? prox : 0, c.wax01 < 0.1 && c.active ? 1 - c.wax01 * 6 : 0)
    if (c.active && dread > 0) {
      const bpm = 58 + 54 * clamp01(dread)
      hbPhase += step * (bpm / 60)
      if (hbPhase >= 1) {
        hbPhase -= 1
        hbOsc.frequency.setValueAtTime(58, now)
        hbOsc.frequency.setTargetAtTime(45, now + 0.02, 0.05)
        tap(hbGain, now, 0.4, 0.008, 0.055)
        tap(hbGain, now + 0.17, 0.22, 0.008, 0.05)
      }
    } else {
      hbPhase = 0
    }
  }

  // his shuffle-step: dragging sole + wet thud, volume = proximity
  function dragStep(prox) {
    if (!ready) return
    const p = clamp01(prox)
    if (p < 0.02) return
    const t = ctx.currentTime + 0.01
    dragLP.frequency.setValueAtTime(180 + Math.random() * 140, t)
    tap(dragGain, t, 0.4 * p, 0.05, 0.16)
    blip('sine', 40 + Math.random() * 7, t + 0.16, 0.3 * p, 0.006, 0.1, 31)
  }

  function stinger(name) {
    if (!ready) return
    const t = ctx.currentTime + 0.02
    // the bed eases out under the end stingers (they stay on top); a sconce
    // relighting the candle mid-dark breathes it back in
    if (name === 'win' || name === 'caught') {
      musicStopped = true
      musicGain.gain.setTargetAtTime(0, t, 0.5)
    } else if (name === 'dark') {
      musicGain.gain.setTargetAtTime(0, t, 0.7) // not final: 3.6 s of dying dark remain
    } else if (name === 'sconce' && !musicStopped) {
      musicGain.gain.setTargetAtTime(MUSIC_LEVEL, t, 1.4)
    }
    if (name === 'toll') {
      // low brujo bell for a taken seal — long, inharmonic, echoing
      blip('sine', 65.4, t, 0.4, 0.008, 1.6, undefined, echoBus)
      blip('sine', 130.8, t, 0.16, 0.008, 1.1, undefined, echoBus)
      blip('sine', 196.2, t + 0.02, 0.07, 0.01, 0.8, undefined, echoBus)
      blip('sine', 48, t, 0.2, 0.01, 0.5)
    } else if (name === 'sconce') {
      // stolen wax: soft crackle + a small warm chime
      hiss(t, 0.1, 0.05, 0.25, 'bandpass', 2400, 1.5, 1.6)
      blip('triangle', 523.25, t + 0.06, 0.06, 0.01, 0.5, undefined, echoBus)
      blip('triangle', 784, t + 0.1, 0.035, 0.01, 0.4, undefined, echoBus)
    } else if (name === 'unlock') {
      // stone grinding open, then a deep thunk
      const h = hiss(t, 0.3, 0.5, 0.5, 'lowpass', 140, 0.6, 3.2)
      h.filter.frequency.setTargetAtTime(420, t, 0.9)
      blip('sine', 30, t, 0.3, 0.4, 1.2)
      blip('sine', 55, t + 1.7, 0.34, 0.006, 0.5, 38)
      blip('sine', 82, t + 1.74, 0.12, 0.006, 0.3)
    } else if (name === 'snarl') {
      // he heard you
      blip('sawtooth', 92, t, 0.2, 0.03, 0.4, 58)
      blip('sawtooth', 97, t + 0.02, 0.14, 0.03, 0.35, 61)
      hiss(t + 0.04, 0.09, 0.06, 0.3, 'bandpass', 700, 0.8, 1.6)
    } else if (name === 'caught') {
      // the backward face — scream cluster + noise blast + sub drop
      blip('sawtooth', 620, t, 0.22, 0.004, 0.5, 880)
      blip('sawtooth', 633, t, 0.2, 0.004, 0.55, 905)
      blip('sawtooth', 790, t + 0.03, 0.16, 0.004, 0.45, 1180)
      hiss(t, 0.34, 0.006, 0.5, 'highpass', 700, 0.7, 2.0)
      blip('sine', 70, t, 0.5, 0.005, 0.7, 24)
    } else if (name === 'lowwax') {
      // the wax bar turns red — two faint cold ticks, close and dry
      blip('triangle', 1180, t, 0.032, 0.003, 0.07, 880)
      blip('triangle', 932, t + 0.16, 0.026, 0.003, 0.09, 700)
    } else if (name === 'dark') {
      // the candle dies — a long falling sigh
      blip('sine', 150, t, 0.16, 0.3, 2.2, 33)
      hiss(t + 0.4, 0.06, 1.2, 1.4, 'lowpass', 300, 0.6, 5)
    } else if (name === 'win') {
      // cold daylight: bright open chord + rising air
      blip('triangle', 440, t, 0.1, 0.3, 2.4, undefined, echoBus)
      blip('triangle', 554.37, t + 0.12, 0.09, 0.35, 2.3, undefined, echoBus)
      blip('triangle', 659.25, t + 0.24, 0.08, 0.4, 2.2, undefined, echoBus)
      blip('sine', 1108.7, t + 0.4, 0.04, 0.5, 2.0, undefined, echoBus)
      const h = hiss(t, 0.12, 1.4, 1.6, 'highpass', 1200, 0.5, 6)
      h.filter.frequency.setTargetAtTime(3200, t, 1.2)
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
    dragStep,
    stinger,
    voice,
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'unavailable' }
    },
  }
}
