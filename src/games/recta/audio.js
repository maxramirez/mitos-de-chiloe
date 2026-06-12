// audio.js — LA RECTA PROVINCIA · WebAudio, all procedural except the looping
// music bed (../assets/music/recta.mp3) and the voice clips
// (../assets/voice/recta/{title,win,lose}.mp3) — every fetch failure is a
// silent no-op. Lazy AudioContext created in unlock() (the COMENZAR gesture);
// every call is a safe no-op before unlock or without WebAudio. The
// procedural layer rides an `amb` bus that DUCKS to ~40% under a voice clip.
// M toggles mute. Ambient layers: a deep cave drone (detuned low sines under
// a slow tremolo) + faint cold air noise; scheduled one-shots: water drips
// from the cave roof, a far rumble of the sea inside the rock, and candle
// sputters. SFX (all enveloped, no clicks): testimony murmur (per-character
// pitch), notebook scratch marks, parchment rustle, the accusation drum, the
// shadow-flee whoosh, candles puffing out, the pardon's dissonant bell, win
// bells, the lose toll.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false
  let master = null
  let amb = null
  let voiceGain = null
  let voiceLoads = null
  let voiceSeq = 0
  let voiceSrc = null
  let noiseBuf = null
  let airGain = null
  let droneGain = null
  let musicGain = null
  let musicDone = false
  let wobT = 0
  let dripT = 3.5
  let rumbleT = 14
  let sputterT = 6

  function makeNoise() {
    const len = ctx.sampleRate * 2
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  function unlock() {
    if (!AC) return
    if (ready) {
      try {
        if (ctx && ctx.state === 'suspended') {
          const p = ctx.resume()
          if (p && p.catch) p.catch(() => {})
        }
      } catch (e) { /* ignore */ }
      return
    }
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.34
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp).connect(ctx.destination)
      amb = ctx.createGain()
      amb.gain.value = 1
      amb.connect(master)
      voiceGain = ctx.createGain()
      voiceGain.gain.value = 0.9
      voiceGain.connect(master)
      makeNoise()
      // cold air through the cave — barely-there filtered noise
      const aSrc = ctx.createBufferSource()
      aSrc.buffer = noiseBuf
      aSrc.loop = true
      const aF = ctx.createBiquadFilter()
      aF.type = 'bandpass'
      aF.frequency.value = 420
      aF.Q.value = 0.5
      airGain = ctx.createGain()
      airGain.gain.value = 0.012
      aSrc.connect(aF).connect(airGain).connect(amb)
      aSrc.start()
      // the cave's drone — low detuned sines, slow tremolo, fúnebre
      droneGain = ctx.createGain()
      droneGain.gain.value = 0.05
      const trem = ctx.createGain()
      trem.gain.value = 1
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.31
      const lfoG = ctx.createGain()
      lfoG.gain.value = 0.22
      lfo.connect(lfoG).connect(trem.gain)
      lfo.start()
      for (const f of [54.8, 55.3, 82.6, 110.4]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const g = ctx.createGain()
        g.gain.value = f > 100 ? 0.22 : f > 80 ? 0.4 : 1
        o.connect(g).connect(trem)
        o.start()
      }
      trem.connect(droneGain).connect(amb)
      if (ctx.state === 'suspended') ctx.resume()
      ready = true
      loadVoices()
      loadMusic()
    } catch (e) {
      ctx = null
      ready = false
    }
  }

  function loadVoices() {
    if (voiceLoads) return
    voiceLoads = {}
    for (const name of ['title', 'win', 'lose']) {
      try {
        voiceLoads[name] = fetch('../assets/voice/recta/' + name + '.mp3')
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

  // looping bed at ~0.25, eased out at end states; absence is silent
  function loadMusic() {
    fetch('../assets/music/recta.mp3')
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status)
        return r.arrayBuffer()
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        if (!buf || !ready || musicDone) return
        musicGain = ctx.createGain()
        musicGain.gain.value = 0.25
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.connect(musicGain).connect(amb)
        src.start()
      })
      .catch(() => {})
  }

  function musicOut() {
    musicDone = true
    if (ready && musicGain) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.9)
  }

  function voice(name) {
    if (!ready || !voiceLoads || !voiceLoads[name]) return
    const seq = ++voiceSeq
    voiceLoads[name].then((buf) => {
      if (!buf || seq !== voiceSeq || !ready) return
      try {
        if (voiceSrc) {
          try { voiceSrc.stop() } catch (e) { /* already done */ }
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
      } catch (e) { /* narration is flavor */ }
    })
  }

  function toggleMute() {
    muted = !muted
    if (ready) master.gain.setTargetAtTime(muted ? 0 : 0.34, ctx.currentTime, 0.05)
    return muted
  }

  // scheduled ambient one-shots, re-armed with jitter
  function update(dt) {
    if (!ready) return
    wobT += dt
    const t = ctx.currentTime
    airGain.gain.setTargetAtTime(
      0.009 + 0.005 * Math.sin(wobT * 0.27) + 0.003 * Math.sin(wobT * 1.13), t, 0.6
    )
    dripT -= dt
    if (dripT <= 0) {
      dripT = 4 + Math.random() * 7
      const f = 1500 + Math.random() * 900
      blip(f, 0.045, 0.05, 'sine', f * 0.42)
      noiseHit(f * 0.8, 8, 0.018, 0.1, 0.012)
    }
    rumbleT -= dt
    if (rumbleT <= 0) {
      rumbleT = 18 + Math.random() * 16
      swell(60, 0.05, 3.2)
    }
    sputterT -= dt
    if (sputterT <= 0) {
      sputterT = 7 + Math.random() * 9
      for (let i = 0; i < 4; i++) noiseHit(2400 + Math.random() * 1400, 5, 0.012, 0.03, i * 0.045)
    }
  }

  // --- one-shot helpers ----------------------------------------------------
  function blip(freq, vol, dur, type = 'sine', slideTo = 0, delay = 0) {
    if (!ready) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(amb)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  function noiseHit(freq, q, vol, dur, delay = 0) {
    if (!ready) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(amb)
    src.start(t, Math.random() * 1.5, dur + 0.06)
  }

  // slow lowpassed noise swell — the sea inside the rock
  function swell(freq, vol, dur) {
    if (!ready) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = freq * 2.4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(amb)
    src.start(t, Math.random())
    src.stop(t + dur + 0.1)
  }

  // dark bell — fundamental + inharmonic partials
  function bell(freq, vol, dur, delay = 0) {
    if (!ready) return
    const t = ctx.currentTime + delay
    const partials = [1, 2.0, 2.92, 4.18]
    const amps = [1, 0.45, 0.25, 0.1]
    for (let i = 0; i < partials.length; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * partials[i]
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol * amps[i], t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.16))
      o.connect(g).connect(amb)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  const sfx = {
    // a low muttered phrase — pitch varies per islander
    murmur(i) {
      const base = 86 + (i % 7) * 14
      for (let k = 0; k < 4; k++) {
        blip(base * (1 + Math.random() * 0.22), 0.05, 0.1, 'triangle', base * 0.7, k * 0.11)
      }
      noiseHit(900, 1.6, 0.022, 0.42)
    },
    mark() { noiseHit(2600, 3, 0.04, 0.07); noiseHit(1900, 4, 0.03, 0.05, 0.05) },
    page() { noiseHit(1400, 1.2, 0.05, 0.16); noiseHit(2600, 2, 0.025, 0.1, 0.04) },
    arm() { blip(220, 0.06, 0.22, 'triangle', 150); noiseHit(500, 4, 0.03, 0.1) },
    disarm() { blip(150, 0.04, 0.16, 'triangle', 200) },
    accuse() {
      blip(95, 0.16, 0.4, 'sine', 38)
      noiseHit(220, 1.5, 0.08, 0.22, 0.01)
      bell(311, 0.05, 1.2, 0.1)
    },
    flee() {
      // the shadow tears loose and runs
      noiseHit(300, 0.8, 0.09, 0.9)
      blip(70, 0.08, 0.9, 'sawtooth', 240)
      bell(415.3, 0.05, 1.6, 0.35)
      bell(523.3, 0.045, 1.8, 0.7)
    },
    candleOut() { noiseHit(700, 0.9, 0.07, 0.18); blip(900, 0.025, 0.12, 'sine', 220, 0.02) },
    pardon() {
      bell(233, 0.08, 1.6)
      bell(246.9, 0.07, 1.6, 0.06) // a semitone's grief
      noiseHit(420, 2, 0.05, 0.3, 0.02)
    },
    caseBell() { bell(392, 0.07, 1.8); bell(311, 0.06, 2.2, 0.5) },
    win() {
      const notes = [311, 415.3, 523.3, 622.3, 830.6, 523.3]
      for (let i = 0; i < notes.length; i++) bell(notes[i], 0.07, 2.2, i * 0.45)
      bell(155.6, 0.1, 4.5, 0.2)
      blip(77.8, 0.05, 4, 'sine')
    },
    lose() {
      bell(155.6, 0.1, 2.8)
      bell(146.8, 0.09, 3.0, 0.9)
      bell(138.6, 0.09, 3.4, 1.8)
      blip(55, 0.07, 3.5, 'sine', 38)
    },
  }

  return {
    unlock,
    toggleMute,
    update,
    voice,
    musicOut,
    sfx,
    get state() { return { ready, muted, running: !!(ctx && ctx.state === 'running') } },
  }
}
