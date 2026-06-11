// LA PINCOYA — audio.js
// 100% procedural WebAudio. Lazy AudioContext created in unlock() (first user
// gesture — the BEGIN click); every method is a safe no-op before unlock or
// without WebAudio. M toggles mute (works pre-unlock via the muted flag).
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

      // --- water lap: looped noise, bandpassed, breathing with two slow LFOs
      const lapSrc = ctx.createBufferSource()
      lapSrc.buffer = noiseBuf
      lapSrc.loop = true
      const lapBP = ctx.createBiquadFilter()
      lapBP.type = 'bandpass'
      lapBP.frequency.value = 420
      lapBP.Q.value = 0.7
      const lapGain = ctx.createGain()
      lapGain.gain.value = 0.05
      const lfo1 = ctx.createOscillator()
      lfo1.frequency.value = 0.13
      const lfo1g = ctx.createGain()
      lfo1g.gain.value = 0.028
      lfo1.connect(lfo1g).connect(lapGain.gain)
      const lfo2 = ctx.createOscillator()
      lfo2.frequency.value = 0.043
      const lfo2g = ctx.createGain()
      lfo2g.gain.value = 0.016
      lfo2.connect(lfo2g).connect(lapGain.gain)
      lapSrc.connect(lapBP).connect(lapGain).connect(master)
      lapSrc.start()
      lfo1.start()
      lfo2.start()

      // --- low night air
      const windSrc = ctx.createBufferSource()
      windSrc.buffer = noiseBuf
      windSrc.loop = true
      windSrc.playbackRate.value = 0.55
      const windLP = ctx.createBiquadFilter()
      windLP.type = 'lowpass'
      windLP.frequency.value = 240
      const windGain = ctx.createGain()
      windGain.gain.value = 0.022
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

  // soft accordion voice: two detuned saws + shared vibrato, bandpassed
  function accordion(freq, t0, dur, peak) {
    tone('sawtooth', freq, t0, dur, peak, { a: 0.1, hold: dur * 0.45, bp: 850, q: 0.9, detune: 5, vib: 5.2, vibD: 4 })
    tone('sawtooth', freq, t0, dur, peak * 0.85, { a: 0.12, hold: dur * 0.45, bp: 850, q: 0.9, detune: -5, vib: 5.2, vibD: 4 })
  }

  function cue(name) {
    if (!ready) return
    try {
      const t = ctx.currentTime + 0.01
      switch (name) {
        case 'seaward': // she turns to the sea — a soft accordion chord
          accordion(220, t, 1.3, 0.035)
          accordion(277.18, t + 0.06, 1.25, 0.028)
          accordion(329.63, t + 0.12, 1.2, 0.026)
          break
        case 'landward': // cold low turn
          tone('sine', 138.6, t, 1.0, 0.06, { slideTo: 104, slideT: 0.5, a: 0.05 })
          hit(t, 0.5, 0.018, 'lowpass', 500, 180, 0.8)
          break
        case 'shift': // telegraph — airy shimmer, she is slowing
          hit(t, 0.55, 0.02, 'bandpass', 3800, 5200, 2.5)
          break
        case 'cast': // whoosh + plop
          hit(t, 0.3, 0.045, 'highpass', 1400, 400, 0.8)
          tone('sine', 300, t + 0.42, 0.2, 0.1, { slideTo: 85, slideT: 0.12 })
          hit(t + 0.45, 0.18, 0.04, 'bandpass', 2400, 1200, 1.4)
          break
        case 'haul': { // silver in the net — quick pentatonic plucks + splash
          tone('triangle', 659.26, t, 0.32, 0.05)
          tone('triangle', 783.99, t + 0.07, 0.32, 0.05)
          tone('triangle', 987.77, t + 0.14, 0.4, 0.045)
          hit(t, 0.45, 0.035, 'bandpass', 1900, 900, 1.2)
          break
        }
        case 'thud': // the net comes up empty — dull thud
          tone('sine', 88, t, 0.5, 0.22, { slideTo: 52, slideT: 0.18 })
          hit(t, 0.14, 0.09, 'lowpass', 220, 120, 0.8)
          break
        case 'warn': // two low pulses — the nets are fraying
          tone('triangle', 98, t, 0.16, 0.08)
          tone('triangle', 92.5, t + 0.2, 0.22, 0.08)
          break
        case 'tear': // ripping nets
          hit(t, 0.5, 0.12, 'bandpass', 3000, 280, 1.8)
          tone('sine', 70, t + 0.28, 0.7, 0.16, { slideTo: 42, slideT: 0.4 })
          break
        case 'win': // the hold is full — warm slow chord + sparkle
          accordion(220, t, 3.2, 0.03)
          accordion(261.63, t + 0.15, 3.0, 0.026)
          accordion(329.63, t + 0.3, 2.8, 0.026)
          accordion(440, t + 0.45, 2.6, 0.02)
          tone('triangle', 1318.5, t + 0.6, 0.6, 0.025)
          tone('triangle', 1567.98, t + 0.8, 0.8, 0.022)
          break
        case 'lose': // a minor-second beating fades with the tide
          tone('sine', 110, t, 3.0, 0.05, { a: 0.4 })
          tone('sine', 116.54, t, 3.0, 0.045, { a: 0.5 })
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
