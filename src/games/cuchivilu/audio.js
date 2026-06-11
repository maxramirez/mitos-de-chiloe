// EL CUCHIVILU — audio.js
// 100% procedural WebAudio. Lazy AudioContext created in unlock() (first user
// gesture — the BEGIN click); every method is a safe no-op before unlock or
// without WebAudio, so there are zero autoplay-policy errors. M toggles mute
// (works pre-unlock via the muted flag).
export function createAudio() {
  let ctx = null
  let master = null
  let noiseBuf = null
  let ready = false
  let muted = false
  const VOL = 0.24

  function makeNoise() {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  function unlock() {
    if (ready) {
      try { if (ctx.state === 'suspended') ctx.resume() } catch (e) { /* ignore */ }
      return
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      const p = ctx.resume()
      if (p && p.catch) p.catch(() => {})
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -22
      comp.ratio.value = 5
      comp.connect(ctx.destination)
      master = ctx.createGain()
      master.gain.value = muted ? 0 : VOL
      master.connect(comp)
      noiseBuf = makeNoise()

      // --- water lap over the flats: looped noise, bandpassed, slow LFOs
      const lapSrc = ctx.createBufferSource()
      lapSrc.buffer = noiseBuf
      lapSrc.loop = true
      const lapBP = ctx.createBiquadFilter()
      lapBP.type = 'bandpass'
      lapBP.frequency.value = 380
      lapBP.Q.value = 0.7
      const lapGain = ctx.createGain()
      lapGain.gain.value = 0.05
      const lfo1 = ctx.createOscillator()
      lfo1.frequency.value = 0.11
      const lfo1g = ctx.createGain()
      lfo1g.gain.value = 0.027
      lfo1.connect(lfo1g).connect(lapGain.gain)
      const lfo2 = ctx.createOscillator()
      lfo2.frequency.value = 0.047
      const lfo2g = ctx.createGain()
      lfo2g.gain.value = 0.016
      lfo2.connect(lfo2g).connect(lapGain.gain)
      lapSrc.connect(lapBP).connect(lapGain).connect(master)
      lapSrc.start()
      lfo1.start()
      lfo2.start()

      // --- low night air over the mud
      const windSrc = ctx.createBufferSource()
      windSrc.buffer = noiseBuf
      windSrc.loop = true
      windSrc.playbackRate.value = 0.5
      const windLP = ctx.createBiquadFilter()
      windLP.type = 'lowpass'
      windLP.frequency.value = 220
      const windGain = ctx.createGain()
      windGain.gain.value = 0.024
      windSrc.connect(windLP).connect(windGain).connect(master)
      windSrc.start()

      ready = true
    } catch (e) {
      ctx = null
      ready = false
    }
  }

  // one decaying tone
  function tone(type, f0, t0, dur, peak, opts) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t0)
    if (opts && opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + (opts.slideT || dur))
    if (opts && opts.detune) o.detune.value = opts.detune
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    const atk = (opts && opts.a) || 0.012
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk)
    if (opts && opts.hold) g.gain.setValueAtTime(peak, t0 + atk + opts.hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    let head = o
    if (opts && opts.bp) {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = opts.bp
      f.Q.value = opts.q || 1
      o.connect(f)
      head = f
    }
    head.connect(g).connect(master)
    if (opts && opts.vib) {
      const v = ctx.createOscillator()
      v.frequency.value = opts.vib
      const vg = ctx.createGain()
      vg.gain.value = opts.vibD || 5
      v.connect(vg).connect(o.detune)
      v.start(t0)
      v.stop(t0 + dur + 0.1)
    }
    o.start(t0)
    o.stop(t0 + dur + 0.1)
  }

  // one noise hit through a filter (optionally swept)
  function hit(t0, dur, peak, type, f0, f1, q) {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(f0, t0)
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    f.Q.value = q || 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f).connect(g).connect(master)
    s.start(t0)
    s.stop(t0 + dur + 0.1)
  }

  // soft chilote accordion voice: two detuned saws, shared vibrato, bandpassed
  function accordion(freq, t0, dur, peak) {
    tone('sawtooth', freq, t0, dur, peak, { a: 0.1, hold: dur * 0.45, bp: 850, q: 0.9, detune: 5, vib: 5.2, vibD: 4 })
    tone('sawtooth', freq, t0, dur, peak * 0.85, { a: 0.12, hold: dur * 0.45, bp: 850, q: 0.9, detune: -5, vib: 5.2, vibD: 4 })
  }

  function cue(name) {
    if (!ready) return
    try {
      const t = ctx.currentTime + 0.01
      switch (name) {
        case 'tideIn': // the sea breathes in — airy rising wash
          hit(t, 1.5, 0.035, 'bandpass', 420, 1500, 0.8)
          tone('triangle', 196, t + 0.1, 1.1, 0.022, { slideTo: 294, slideT: 0.9, a: 0.2 })
          break
        case 'tideOut': // …and out
          hit(t, 1.5, 0.03, 'bandpass', 1300, 360, 0.8)
          tone('triangle', 261, t + 0.1, 1.1, 0.018, { slideTo: 174, slideT: 0.9, a: 0.25 })
          break
        case 'bubble': // mud gloop — the telegraph
          tone('sine', 120, t, 0.13, 0.08, { slideTo: 330, slideT: 0.1 })
          tone('sine', 100, t + 0.17, 0.12, 0.06, { slideTo: 260, slideT: 0.09 })
          tone('sine', 145, t + 0.36, 0.1, 0.06, { slideTo: 370, slideT: 0.08 })
          hit(t, 0.5, 0.015, 'lowpass', 400, 150, 0.8)
          break
        case 'splash': // he breaks the surface
          hit(t, 0.45, 0.06, 'bandpass', 1500, 420, 1)
          tone('sine', 200, t, 0.3, 0.04, { slideTo: 90, slideT: 0.2 })
          break
        case 'crunch': // a wall segment goes down
          hit(t, 0.32, 0.16, 'lowpass', 900, 110, 0.8)
          hit(t, 0.12, 0.07, 'bandpass', 2600, 1300, 2)
          tone('sine', 70, t, 0.5, 0.18, { slideTo: 40, slideT: 0.25 })
          break
        case 'eat': // a penned fish, gone — wet gulp
          tone('sine', 280, t, 0.22, 0.1, { slideTo: 70, slideT: 0.16 })
          hit(t + 0.05, 0.12, 0.03, 'bandpass', 700, 350, 1.5)
          break
        case 'squeal': // pig-snake squeal as the bow lands
          tone('sawtooth', 540, t, 0.5, 0.06, { slideTo: 1150, slideT: 0.1, vib: 13, vibD: 90, bp: 1600, q: 1.6 })
          tone('sawtooth', 880, t + 0.16, 0.42, 0.05, { slideTo: 380, slideT: 0.3, vib: 11, vibD: 70, bp: 1300, q: 1.6 })
          break
        case 'ram': // the hull thud
          tone('sine', 95, t, 0.4, 0.2, { slideTo: 50, slideT: 0.15 })
          hit(t, 0.45, 0.07, 'bandpass', 900, 300, 1)
          break
        case 'shove': // too slow — he shoulders the hull aside
          tone('sine', 70, t, 0.25, 0.09, { slideTo: 45, slideT: 0.12 })
          hit(t, 0.2, 0.03, 'lowpass', 500, 150, 1)
          break
        case 'dive': // he sinks
          hit(t, 0.5, 0.08, 'bandpass', 1600, 350, 1)
          tone('sine', 180, t, 0.8, 0.05, { slideTo: 60, slideT: 0.6 })
          break
        case 'tick': // a stone set in the wall
          tone('triangle', 290 + Math.random() * 60, t, 0.06, 0.05)
          hit(t, 0.04, 0.03, 'highpass', 2200, 0, 1)
          break
        case 'repaired': // the wall stands again
          tone('triangle', 523.25, t, 0.22, 0.05)
          tone('triangle', 659.26, t + 0.12, 0.3, 0.045)
          break
        case 'penned': // one more fish behind stone
          tone('triangle', 1046.5, t, 0.12, 0.022)
          break
        case 'warn': // the corral is failing — two low pulses
          tone('triangle', 98, t, 0.16, 0.08)
          tone('triangle', 92.5, t + 0.2, 0.22, 0.08)
          break
        case 'win': // dawn over a full corral — warm slow chord + sparkle
          accordion(220, t, 3.2, 0.03)
          accordion(261.63, t + 0.15, 3.0, 0.026)
          accordion(329.63, t + 0.3, 2.8, 0.026)
          accordion(440, t + 0.45, 2.6, 0.02)
          tone('triangle', 1318.5, t + 0.6, 0.6, 0.025)
          tone('triangle', 1567.98, t + 0.8, 0.8, 0.022)
          break
        case 'lose': // a minor-second beating fades into the mud
          tone('sine', 110, t, 3.0, 0.05, { a: 0.4 })
          tone('sine', 116.54, t, 3.0, 0.045, { a: 0.5 })
          hit(t + 0.3, 1.6, 0.02, 'lowpass', 300, 90, 0.8)
          break
      }
    } catch (e) { /* never let a cue break the frame */ }
  }

  function toggleMute() {
    muted = !muted
    if (ready && master) {
      try { master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.04) } catch (e) { /* ignore */ }
    }
    return muted
  }

  return {
    unlock,
    cue,
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'none' }
    },
  }
}
