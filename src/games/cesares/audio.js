// audio.js — LA CIUDAD DE LOS CÉSARES · WebAudio, all procedural except the
// optional looping music bed (../assets/music/cesares.mp3) and the whispered
// voice clips (../assets/voice/cesares/{title,win,lose}.mp3) — every fetch
// failure is a silent no-op. Lazy AudioContext created in unlock() (the
// COMENZAR gesture); every call is a safe no-op before unlock or without
// WebAudio. The procedural layer rides an `amb` bus that DUCKS to ~40% under
// a voice clip. M toggles mute. Layers: thin high wind, the puerta's hum
// (setHum(k) swells while the path connects), and one-shots: rotor
// stone-grind (continuous while turning) + 90° ticks + snap chime, footsteps,
// denied dull tap, illusion shimmer (boarding / the impossible link), level
// bells, win peal.

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
  let windGain = null
  let humGain = null
  let grindGain = null
  let musicGain = null
  let musicDone = false
  let humLevel = 0
  let lastHum = -1
  let wobT = 0

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
      voiceGain.gain.value = 0.85
      voiceGain.connect(master)
      makeNoise()
      // thin wind, high and far — the city floats
      const wSrc = ctx.createBufferSource()
      wSrc.buffer = noiseBuf
      wSrc.loop = true
      const wF = ctx.createBiquadFilter()
      wF.type = 'bandpass'
      wF.frequency.value = 700
      wF.Q.value = 0.6
      windGain = ctx.createGain()
      windGain.gain.value = 0.018
      wSrc.connect(wF).connect(windGain).connect(amb)
      wSrc.start()
      // the puerta's hum — detuned pair + slow tremolo, swells with pathExists
      humGain = ctx.createGain()
      humGain.gain.value = 0
      const trem = ctx.createGain()
      trem.gain.value = 1
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.7
      const lfoG = ctx.createGain()
      lfoG.gain.value = 0.25
      lfo.connect(lfoG).connect(trem.gain)
      lfo.start()
      for (const f of [110, 165.3, 220.7]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const g = ctx.createGain()
        g.gain.value = f > 200 ? 0.35 : 1
        o.connect(g).connect(trem)
        o.start()
      }
      trem.connect(humGain).connect(amb)
      // rotor stone-grind — filtered noise, gated by grindGain
      const gSrc = ctx.createBufferSource()
      gSrc.buffer = noiseBuf
      gSrc.loop = true
      const gF = ctx.createBiquadFilter()
      gF.type = 'lowpass'
      gF.frequency.value = 240
      const gF2 = ctx.createBiquadFilter()
      gF2.type = 'peaking'
      gF2.frequency.value = 90
      gF2.gain.value = 8
      grindGain = ctx.createGain()
      grindGain.gain.value = 0
      gSrc.connect(gF).connect(gF2).connect(grindGain).connect(amb)
      gSrc.start()
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
        voiceLoads[name] = fetch('../assets/voice/cesares/' + name + '.mp3')
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

  // looping bed at ~0.3 — louder than the rest of the collection on purpose
  function loadMusic() {
    fetch('../assets/music/cesares.mp3')
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status)
        return r.arrayBuffer()
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        if (!buf || !ready || musicDone) return
        musicGain = ctx.createGain()
        musicGain.gain.value = 0.3
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

  function setHum(v) { humLevel = v }

  function update(dt) {
    if (!ready) return
    wobT += dt
    const t = ctx.currentTime
    const w = 0.014 + 0.008 * Math.sin(wobT * 0.43) + 0.004 * Math.sin(wobT * 1.31)
    windGain.gain.setTargetAtTime(w, t, 0.5)
    const h = humLevel * (0.028 + 0.006 * Math.sin(wobT * 2.1))
    if (Math.abs(h - lastHum) > 0.001) {
      humGain.gain.setTargetAtTime(h, t, 0.35)
      lastHum = h
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
    g.gain.setValueAtTime(vol, t)
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
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(amb)
    src.start(t, Math.random() * 1.5, dur + 0.05)
  }

  // struck bell — fundamental + inharmonic partials, long gold decay
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
      g.gain.setValueAtTime(vol * amps[i], t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.16))
      o.connect(g).connect(amb)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  const sfx = {
    grindStart() {
      if (!ready) return
      grindGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.08)
    },
    grindStop() {
      if (!ready) return
      grindGain.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
    },
    tick() { noiseHit(1400, 6, 0.06, 0.06); blip(520, 0.04, 0.07, 'triangle') },
    snap() {
      noiseHit(420, 2, 0.14, 0.1)
      blip(150, 0.12, 0.16, 'sine', 70)
      bell(1046.5, 0.05, 0.7, 0.03)
    },
    step() { noiseHit(900 + Math.random() * 500, 5, 0.035, 0.05); blip(220, 0.018, 0.05, 'sine', 150) },
    denied() { blip(140, 0.08, 0.14, 'sine', 90); noiseHit(300, 3, 0.04, 0.08) },
    illusion() {
      bell(1318.5, 0.04, 0.8)
      bell(1568, 0.035, 0.8, 0.09)
      bell(2093, 0.03, 0.9, 0.18)
      noiseHit(2400, 4, 0.025, 0.5)
    },
    levelBell() {
      bell(659.3, 0.09, 1.6)
      bell(523.3, 0.08, 1.8, 0.45)
      bell(392, 0.09, 2.4, 0.95)
    },
    winBells() {
      const notes = [392, 523.3, 659.3, 784, 1046.5, 659.3, 523.3]
      for (let i = 0; i < notes.length; i++) bell(notes[i], 0.075, 2.2, i * 0.42 + Math.random() * 0.05)
      bell(196, 0.1, 4.5, 0.2)
      blip(98, 0.06, 4, 'sine')
    },
    lose() {
      // the bed keeps playing — losing here only re-hides the city
      blip(196, 0.1, 2.2, 'sine', 60)
      bell(311, 0.06, 2.0, 0.3)
    },
  }

  return {
    unlock,
    toggleMute,
    update,
    setHum,
    voice,
    musicOut,
    sfx,
    get state() { return { ready, muted, running: !!(ctx && ctx.state === 'running') } },
  }
}
