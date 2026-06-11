// audio.js — EL PIUCHÉN · 100% procedural WebAudio, no assets.
// Lazy AudioContext created on unlock() (the BEGIN click) so there are zero
// autoplay-policy errors. Every call is a safe no-op before unlock. M mutes.
// Beds: hillside wind (filtered noise with a slow wobble) + a thin high
// whistle + a tension drone that rises while the piuchén threatens.
// One-shot sfx for every interaction: scream telegraph, sling whip, stone
// whoosh, impact thud, sheep bleats, drain ticks, win/lose.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false
  let master = null
  let noiseBuf = null
  let windGain = null
  let whistleGain = null
  let tensionGain = null
  let lastWind = -1
  let lastTension = -1
  let wobT = 0

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
      windGain = loopNoise('lowpass', 420, 0.5, 0.05) // wind over the hill
      whistleGain = loopNoise('bandpass', 1150, 9, 0.004) // thin whistle in the fence stones
      // tension drone — low sawtooth behind the dark, silent while he circles far
      const tOsc = ctx.createOscillator()
      tOsc.type = 'sawtooth'
      tOsc.frequency.value = 65.4
      const tf = ctx.createBiquadFilter()
      tf.type = 'lowpass'
      tf.frequency.value = 300
      tensionGain = ctx.createGain()
      tensionGain.gain.value = 0
      tOsc.connect(tf).connect(tensionGain).connect(master)
      tOsc.start()
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
  function update(dt, wind, tension) {
    if (!ready) return
    const t = ctx.currentTime
    wobT += dt
    const w = wind * (0.85 + 0.15 * Math.sin(wobT * 0.7) + 0.07 * Math.sin(wobT * 1.9))
    if (Math.abs(w - lastWind) > 0.02) {
      windGain.gain.setTargetAtTime(0.025 + w * 0.05, t, 0.4)
      whistleGain.gain.setTargetAtTime(0.002 + w * 0.005, t, 0.6)
      lastWind = w
    }
    if (Math.abs(tension - lastTension) > 0.02) {
      tensionGain.gain.setTargetAtTime(tension * 0.045, t, 0.25)
      lastTension = tension
    }
  }

  // --- one-shots ----------------------------------------------------------
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
    o.connect(g).connect(master)
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
    src.connect(f).connect(g).connect(master)
    src.start(t, Math.random() * 1.5, dur + 0.05)
  }

  // wobbly sawtooth for sheep voices
  function vibBlip(freq, vol, dur, vibHz, vibAmt, delay = 0) {
    if (!ready) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const lfo = ctx.createOscillator()
    lfo.frequency.value = vibHz
    const lg = ctx.createGain()
    lg.gain.value = vibAmt
    lfo.connect(lg).connect(o.frequency)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f).connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.05)
    lfo.start(t)
    lfo.stop(t + dur + 0.05)
  }

  const sfx = {
    // the telegraph: thin scream high in the dark
    scream() {
      blip(2600, 0.055, 0.5, 'sawtooth', 760)
      blip(3900, 0.022, 0.36, 'square', 1200)
      noiseHit(2600, 9, 0.045, 0.4)
    },
    diveWind() { noiseHit(700, 1.2, 0.09, 0.5) }, // air torn by the swoop
    whip() { noiseHit(2800, 1, 0.14, 0.09); blip(420, 0.05, 0.1, 'square', 1900) }, // sling release
    whoosh() { noiseHit(1300, 2.5, 0.08, 0.22) }, // stone shaving past him
    thud() { blip(150, 0.22, 0.22, 'sine', 55); noiseHit(340, 1, 0.18, 0.12) }, // stone meets serpent
    screamHit() { blip(1900, 0.1, 0.55, 'sawtooth', 320); blip(2500, 0.05, 0.4, 'square', 500) },
    feathers() { noiseHit(900, 1.5, 0.09, 0.3) },
    comboChime(m) { blip(520 + m * 110, 0.05, 0.3, 'triangle') },
    latchBite() { blip(240, 0.12, 0.25, 'sawtooth', 80); noiseHit(500, 1.5, 0.12, 0.2) },
    drainTick() { noiseHit(750, 6, 0.05, 0.1); blip(190, 0.04, 0.12, 'sine', 120) },
    bleat(vol = 1) { vibBlip(540 + Math.random() * 140, 0.035 * vol, 0.26, 16, 30) },
    relief() { vibBlip(600, 0.05, 0.22, 14, 26, 0); vibBlip(730, 0.05, 0.3, 14, 26, 0.22) }, // mareada but alive
    sheepGone() { vibBlip(520, 0.06, 0.9, 7, 60, 0); blip(180, 0.1, 1.2, 'sine', 70) },
    dirt() { noiseHit(420, 1, 0.05, 0.1) }, // stone in the meadow
    waveCry() { blip(2200, 0.04, 0.9, 'sawtooth', 500); blip(3300, 0.018, 0.7, 'square', 800) },
    win() {
      blip(523.25, 0.08, 1.2, 'sine')
      blip(659.25, 0.07, 1.6, 'sine')
      blip(784, 0.06, 2.2, 'sine')
      vibBlip(620, 0.04, 0.25, 14, 24, 0.5)
      vibBlip(700, 0.04, 0.3, 14, 24, 0.8)
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
