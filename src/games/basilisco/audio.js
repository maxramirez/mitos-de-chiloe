// audio.js — EL BASILISCO · 100% procedural WebAudio, no assets.
// Lazy AudioContext created on unlock() (the BEGIN click) so there are zero
// autoplay-policy errors. Every call is a safe no-op before unlock. M mutes.
// Beds: rain noise + dark sea swell + a tension drone that rises while the
// basilisco is above the floor. One-shot sfx for every interaction.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false
  let master = null
  let noiseBuf = null
  let rainGain = null
  let seaGain = null
  let seaOsc = null
  let tensionOsc = null
  let tensionGain = null
  let crackleGain = null
  let crackleTimer = 0
  let lastRain = -1
  let lastTension = -1
  let lastCrackle = -1

  function makeNoise() {
    const len = ctx.sampleRate * 2
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  function loopNoise(filterType, freq, q, gain) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(f).connect(g).connect(master)
    src.start()
    return g
  }

  function unlock() {
    if (ready || !AC) return
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.32
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp).connect(ctx.destination)
      makeNoise()
      rainGain = loopNoise('bandpass', 2600, 0.6, 0.05) // rain hiss on the roof
      crackleGain = loopNoise('highpass', 3500, 1.2, 0) // brazier crackle bed (popped via timer)
      // sea under the stilts: slow detuned low sines
      seaOsc = ctx.createOscillator()
      seaOsc.type = 'sine'
      seaOsc.frequency.value = 48
      const sea2 = ctx.createOscillator()
      sea2.type = 'sine'
      sea2.frequency.value = 52.3
      seaGain = ctx.createGain()
      seaGain.gain.value = 0.035
      seaOsc.connect(seaGain)
      sea2.connect(seaGain)
      seaGain.connect(master)
      seaOsc.start()
      sea2.start()
      // tension drone — minor second shimmer, silent until the thing surfaces
      tensionOsc = ctx.createOscillator()
      tensionOsc.type = 'sawtooth'
      tensionOsc.frequency.value = 73.4
      const tf = ctx.createBiquadFilter()
      tf.type = 'lowpass'
      tf.frequency.value = 320
      tensionGain = ctx.createGain()
      tensionGain.gain.value = 0
      tensionOsc.connect(tf).connect(tensionGain).connect(master)
      tensionOsc.start()
      if (ctx.state === 'suspended') ctx.resume()
      ready = true
    } catch (e) {
      ctx = null
      ready = false
    }
  }

  function toggleMute() {
    muted = !muted
    if (ready) master.gain.setTargetAtTime(muted ? 0 : 0.32, ctx.currentTime, 0.05)
    return muted
  }

  // smooth bed levels; called from the frame loop (allocation-free)
  function update(dt, rain, tension, brazier) {
    if (!ready) return
    const t = ctx.currentTime
    if (Math.abs(rain - lastRain) > 0.02) {
      rainGain.gain.setTargetAtTime(0.03 + rain * 0.05, t, 0.4)
      lastRain = rain
    }
    if (Math.abs(tension - lastTension) > 0.02) {
      tensionGain.gain.setTargetAtTime(tension * 0.05, t, 0.25)
      lastTension = tension
    }
    if (Math.abs(brazier - lastCrackle) > 0.02) {
      crackleGain.gain.setTargetAtTime(brazier * 0.012, t, 0.5)
      lastCrackle = brazier
    }
    // sparse brazier pops
    crackleTimer -= dt
    if (crackleTimer <= 0 && brazier > 0.05) {
      crackleTimer = 0.15 + Math.random() * 0.6
      blip(2400 + Math.random() * 2000, 0.012 * brazier, 0.02, 'square')
    }
  }

  // --- one-shots ----------------------------------------------------------
  function blip(freq, vol, dur, type = 'sine', slideTo = 0) {
    if (!ready) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function noiseHit(freq, q, vol, dur) {
    if (!ready) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(master)
    src.start(t, Math.random() * 1.5, dur + 0.05)
  }

  const sfx = {
    rattle() { noiseHit(900, 2, 0.10, 0.5); blip(60, 0.10, 0.5, 'triangle') }, // crack telegraph
    surface() { noiseHit(400, 1.5, 0.14, 0.35); blip(160, 0.08, 0.3, 'sawtooth', 70) },
    hissLoopTick() { noiseHit(1800, 4, 0.04, 0.18) }, // drinking
    shoo() { noiseHit(2500, 1, 0.12, 0.12); blip(700, 0.08, 0.1, 'square', 1400) },
    // the squeal toward the egg: rooster-ish falling warble
    squeal() {
      blip(1900, 0.14, 0.55, 'sawtooth', 600)
      blip(2350, 0.08, 0.4, 'square', 800)
    },
    warble() { blip(880, 0.05, 0.8, 'sine', 760) }, // faint egg-direction hint tail
    hammer() { noiseHit(300, 1, 0.22, 0.1); blip(110, 0.14, 0.1, 'square') },
    pryTick() { noiseHit(700, 6, 0.05, 0.07) },
    splinter() { noiseHit(1400, 1.5, 0.2, 0.25); blip(220, 0.1, 0.2, 'sawtooth', 90) },
    feed() { noiseHit(2200, 1, 0.1, 0.4); blip(330, 0.06, 0.3, 'triangle', 520) },
    breathLost() { blip(440, 0.12, 1.6, 'sine', 110); noiseHit(600, 2, 0.08, 1.2) },
    eggReveal() { blip(520, 0.1, 0.7, 'triangle', 980) },
    crush() {
      noiseHit(250, 1, 0.3, 0.5)
      blip(90, 0.2, 0.6, 'sawtooth', 40)
      blip(1568, 0.07, 1.4, 'sine')
      blip(2093, 0.05, 1.8, 'sine')
    },
    win() {
      blip(523.25, 0.08, 1.2, 'sine')
      blip(659.25, 0.07, 1.6, 'sine')
      blip(784, 0.06, 2.2, 'sine')
    },
    lose() {
      blip(196, 0.12, 2.4, 'sawtooth', 49)
      blip(207.65, 0.08, 2.4, 'sawtooth', 52)
    },
  }

  return {
    unlock,
    toggleMute,
    update,
    sfx,
    get state() { return { ready, muted } },
  }
}
