// audio.js — LA BARCA DE LAS ÁNIMAS · WebAudio, all procedural except the
// optional looping music bed (../assets/music/animas.mp3) and the voice clips
// (../assets/voice/animas/{title,win,lose}.mp3) — every fetch failure is a
// silent no-op. Lazy AudioContext created in unlock() (first gesture / the
// COMENZAR press); every call is a safe no-op before unlock or without
// WebAudio. The procedural layer + music ride an `amb` bus that DUCKS to ~40%
// under a voice clip. M toggles mute (master to 0).
//
// Beds: low ocean swell (lowpass noise, slow LFO), thin high wind (bandpass),
// hull creak gated by setCreak(k) (tilt rate). Scheduled ambient one-shots:
// water lap against the hull, a distant bell buoy, a far night bird.
// One-shots: soul pick/place (wood + chime), oar stroke (dip + whoosh, bright
// glint when on the beat), soft beat tick (the lantern's metronome), gust
// swell, the restless soul's wail, spill splash + sinking tone, gangplank
// bells (ascending per delivered soul), bow chime, win peal, lose drone.

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
  let seaGain = null
  let windGain = null
  let creakGain = null
  let musicGain = null
  let musicDone = false
  let creakLevel = 0
  let wobT = 0
  let lapT = 5
  let buoyT = 14
  let birdT = 24

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
      // low ocean swell — the strait breathing
      const sSrc = ctx.createBufferSource()
      sSrc.buffer = noiseBuf
      sSrc.loop = true
      const sF = ctx.createBiquadFilter()
      sF.type = 'lowpass'
      sF.frequency.value = 190
      seaGain = ctx.createGain()
      seaGain.gain.value = 0.05
      sSrc.connect(sF).connect(seaGain).connect(amb)
      sSrc.start()
      // thin high wind, far away
      const wSrc = ctx.createBufferSource()
      wSrc.buffer = noiseBuf
      wSrc.loop = true
      const wF = ctx.createBiquadFilter()
      wF.type = 'bandpass'
      wF.frequency.value = 640
      wF.Q.value = 0.7
      windGain = ctx.createGain()
      windGain.gain.value = 0.014
      wSrc.connect(wF).connect(windGain).connect(amb)
      wSrc.start()
      // hull creak — gated noise, driven by tilt rate via setCreak
      const cSrc = ctx.createBufferSource()
      cSrc.buffer = noiseBuf
      cSrc.loop = true
      cSrc.playbackRate.value = 0.32
      const cF = ctx.createBiquadFilter()
      cF.type = 'bandpass'
      cF.frequency.value = 130
      cF.Q.value = 4
      const cF2 = ctx.createBiquadFilter()
      cF2.type = 'peaking'
      cF2.frequency.value = 310
      cF2.gain.value = 9
      creakGain = ctx.createGain()
      creakGain.gain.value = 0
      cSrc.connect(cF).connect(cF2).connect(creakGain).connect(amb)
      cSrc.start()
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
        voiceLoads[name] = fetch('../assets/voice/animas/' + name + '.mp3')
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

  // looping bed at ~0.26 — rides the amb bus so voices duck it too
  function loadMusic() {
    fetch('../assets/music/animas.mp3')
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status)
        return r.arrayBuffer()
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        if (!buf || !ready || musicDone) return
        musicGain = ctx.createGain()
        musicGain.gain.value = 0.26
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
    if (ready && musicGain) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.1)
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
        amb.gain.setTargetAtTime(0.4, t, 0.2) // duck ambience under the voice
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

  function setCreak(v) { creakLevel = Math.max(0, Math.min(1, v)) }

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
    o.stop(t + dur + 0.02)
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
    src.start(t, Math.random() * 1.5, dur + 0.05)
  }

  // struck bell — fundamental + inharmonic partials, long decay
  function bell(freq, vol, dur, delay = 0) {
    if (!ready) return
    const t = ctx.currentTime + delay
    const partials = [1, 2.0, 2.92, 4.18]
    const amps = [1, 0.5, 0.3, 0.12]
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

  function update(dt) {
    if (!ready) return
    wobT += dt
    const t = ctx.currentTime
    const sea = 0.042 + 0.02 * Math.sin(wobT * 0.31) + 0.008 * Math.sin(wobT * 0.93)
    seaGain.gain.setTargetAtTime(sea, t, 0.6)
    const w = 0.011 + 0.007 * Math.sin(wobT * 0.43 + 1) + 0.003 * Math.sin(wobT * 1.31)
    windGain.gain.setTargetAtTime(w, t, 0.5)
    creakGain.gain.setTargetAtTime(creakLevel * 0.12, t, 0.1)
    // scheduled ambient one-shots
    lapT -= dt
    if (lapT <= 0) {
      lapT = 3.5 + Math.random() * 5.5
      noiseHit(420 + Math.random() * 300, 2.5, 0.028, 0.4)
    }
    buoyT -= dt
    if (buoyT <= 0) {
      buoyT = 12 + Math.random() * 12
      bell(155.6, 0.022, 2.6)
    }
    birdT -= dt
    if (birdT <= 0) {
      birdT = 18 + Math.random() * 16
      blip(1180, 0.014, 0.5, 'sine', 760)
      blip(1180, 0.01, 0.4, 'sine', 820, 0.7)
    }
  }

  const sfx = {
    pick() { noiseHit(900, 5, 0.04, 0.06); blip(523.3, 0.03, 0.12, 'triangle') },
    place() {
      noiseHit(260, 2.5, 0.1, 0.12) // wood thud
      blip(120, 0.07, 0.14, 'sine', 70)
      bell(784, 0.025, 0.5, 0.02)
    },
    invalid() { blip(150, 0.06, 0.13, 'sine', 95) },
    stroke(onBeat) {
      noiseHit(360, 1.8, 0.11, 0.22) // oar dip
      noiseHit(1300, 1.2, 0.05, 0.3, 0.05) // whoosh
      blip(90, 0.06, 0.25, 'sine', 55)
      if (onBeat) {
        bell(1046.5, 0.045, 0.8, 0.03)
        bell(1568, 0.025, 0.7, 0.1)
      }
    },
    beatTick() { blip(1660, 0.012, 0.045, 'triangle') },
    gust() {
      noiseHit(520, 0.9, 0.08, 1.5)
      noiseHit(900, 1.2, 0.04, 1.2, 0.15)
    },
    wail() {
      // the restless soul — two detuned voices sliding down, very quiet
      blip(660, 0.028, 1.4, 'sine', 392)
      blip(668, 0.02, 1.5, 'sine', 399, 0.05)
      noiseHit(2300, 6, 0.012, 0.9, 0.1)
    },
    spill() {
      noiseHit(300, 1.2, 0.16, 0.5) // heavy splash
      noiseHit(900, 2, 0.07, 0.35, 0.04)
      blip(330, 0.06, 1.8, 'sine', 60) // the sinking tone
      bell(415.3, 0.03, 1.6, 0.2)
    },
    roll() {
      noiseHit(180, 1, 0.2, 0.9)
      noiseHit(500, 1.5, 0.12, 0.7, 0.1)
      blip(70, 0.12, 1.2, 'sine', 40)
    },
    zarpar() {
      noiseHit(220, 2, 0.09, 0.4) // rope + push off
      blip(98, 0.06, 0.6, 'sine', 65)
      bell(523.3, 0.03, 1.0, 0.15)
    },
    plankStep(i) {
      bell(659.3 * Math.pow(1.122, i % 5), 0.035, 0.9)
    },
    bow(i) {
      bell(1046.5 * Math.pow(1.122, i % 5), 0.04, 1.3)
      noiseHit(2600, 5, 0.015, 0.5)
    },
    arrive() {
      bell(392, 0.06, 2.0)
      bell(523.3, 0.05, 2.0, 0.5)
    },
    winPeal() {
      const notes = [392, 523.3, 659.3, 784, 1046.5, 784, 659.3, 1046.5]
      for (let i = 0; i < notes.length; i++) bell(notes[i], 0.07, 2.2, i * 0.45 + Math.random() * 0.05)
      bell(196, 0.1, 4.5, 0.2)
      blip(98, 0.05, 4, 'sine')
    },
    lose() {
      blip(110, 0.1, 3.0, 'sine', 48)
      bell(233.1, 0.06, 2.6, 0.4)
      noiseHit(160, 1, 0.08, 1.6, 0.1)
    },
  }

  return {
    unlock,
    toggleMute,
    update,
    setCreak,
    voice,
    musicOut,
    sfx,
    get state() { return { ready, muted, running: !!(ctx && ctx.state === 'running') } },
  }
}
