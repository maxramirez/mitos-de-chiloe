// LA PINCOYA — audio.js
// Procedural WebAudio + whispered voice clips. Lazy AudioContext created in
// unlock() (first user gesture — the BEGIN click); every method is a safe
// no-op before unlock or without WebAudio. M toggles mute (works pre-unlock
// via the muted flag) and mutes voices too — they feed the same master.
// Voice mp3s under ../assets/voice/pincoya/ are optional: any fetch/decode
// failure is swallowed and the game behaves identically without them.
export function createAudio() {
  let ctx = null
  let master = null
  let ambBus = null // ambience + ambient one-shots; ducked while a voice speaks
  let voiceGain = null
  let noiseBuf = null
  let ready = false
  let muted = false
  const VOL = 0.24
  const VOICES = ['intro', 'win', 'lose-alba', 'lose-redes', 'whisper-sea']
  const voiceBufs = {} // name -> decoded AudioBuffer (only the ones that loaded)
  const voiceWait = {} // name -> settled-safe load promise (never rejects)
  let voicesPlaying = 0

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
      // ambience bus: looped beds + scheduled one-shots live here so a
      // playing voice can duck them as a group (M still mutes via master)
      ambBus = ctx.createGain()
      ambBus.gain.value = 1
      ambBus.connect(master)
      voiceGain = ctx.createGain()
      voiceGain.gain.value = 0.8
      voiceGain.connect(master)
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
      lapSrc.connect(lapBP).connect(lapGain).connect(ambBus)
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
      windSrc.connect(windLP).connect(windGain).connect(ambBus)
      windSrc.start()

      ready = true
      loadVoices() // fire-and-forget; missing files are a silent no-op
      scheduleAmbient()
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
    head.connect(g).connect((opts && opts.out) || master)
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
  function hit(t0, dur, peak, type, f0, f1, q, out, atk) {
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
    g.gain.exponentialRampToValueAtTime(peak, t0 + (atk || 0.02))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f).connect(g).connect(out || master)
    s.start(t0)
    s.stop(t0 + dur + 0.1)
  }

  // ---- voice clips (whispered myth lines) -----------------------------------
  // Loaded lazily after the unlock gesture; every failure path is silent —
  // without the mp3s the game plays identically.
  function loadVoices() {
    for (const name of VOICES) {
      try {
        voiceWait[name] = fetch('../assets/voice/pincoya/' + name + '.mp3')
          .then((r) => {
            if (!r.ok) throw new Error('http ' + r.status)
            return r.arrayBuffer()
          })
          .then((ab) => ctx.decodeAudioData(ab))
          .then((buf) => {
            voiceBufs[name] = buf
          })
          .catch(() => {})
      } catch (e) { /* no fetch: no voices */ }
    }
  }

  function startVoice(name) {
    try {
      const buf = voiceBufs[name]
      if (!ready || !ctx || !buf) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(voiceGain)
      voicesPlaying++
      // duck the ambience under the whisper, ease back when the last clip ends
      ambBus.gain.setTargetAtTime(0.4, ctx.currentTime, 0.15)
      src.onended = () => {
        voicesPlaying = Math.max(0, voicesPlaying - 1)
        if (voicesPlaying === 0 && ambBus) {
          try { ambBus.gain.setTargetAtTime(1, ctx.currentTime, 0.4) } catch (e) { /* ignore */ }
        }
      }
      src.start()
    } catch (e) { /* a voice must never break the game */ }
  }

  function voice(name) {
    if (!ready) return
    const w = voiceWait[name]
    // the title line is requested the same instant loading starts — wait for
    // the (never-rejecting) load promise, then play if the buffer is there
    if (w && w.then) w.then(() => startVoice(name))
    else startVoice(name)
  }

  // ---- new ambient one-shots (all through ambBus so voices duck them) -------
  // hull/wood creak: swept noise + a low pitch-drop groan
  function creak(t) {
    hit(t, 0.34, 0.02, 'bandpass', 1300 + Math.random() * 400, 320, 3.2, ambBus, 0.04)
    tone('sine', 150 + Math.random() * 30, t + 0.02, 0.42, 0.016, { slideTo: 92, slideT: 0.3, a: 0.05, out: ambBus })
    if (Math.random() < 0.4) hit(t + 0.5, 0.22, 0.012, 'bandpass', 900, 420, 3, ambBus, 0.04)
  }

  // distant night bird: two-three soft FM-ish down-chirps, rare and far
  function nightbird(t) {
    const f0 = 1700 + Math.random() * 400
    const n = 2 + (Math.random() < 0.5 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      tone('sine', f0, t + i * 0.16, 0.09, 0.009, { slideTo: f0 * 0.72, slideT: 0.07, a: 0.02, bp: f0, q: 2, out: ambBus })
    }
  }

  // wind gust: a slow lowpassed swell that breathes over the night air bed
  function gust(t) {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    s.playbackRate.value = 0.7
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(280, t)
    f.frequency.exponentialRampToValueAtTime(620, t + 1.1)
    f.frequency.exponentialRampToValueAtTime(220, t + 2.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.03, t + 0.9)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.7)
    s.connect(f).connect(g).connect(ambBus)
    s.start(t)
    s.stop(t + 2.8)
  }

  // far-off buoy bell: two inharmonic partials, long faint decay
  function bell(t) {
    const f0 = 480 + Math.random() * 90
    tone('sine', f0, t, 1.7, 0.012, { a: 0.012, detune: 4, out: ambBus })
    tone('sine', f0 * 1.93, t, 1.1, 0.006, { a: 0.012, detune: -6, out: ambBus })
  }

  let ambTimer = 0
  function scheduleAmbient() {
    ambTimer = setTimeout(() => {
      try {
        if (ready && ctx) {
          const t = ctx.currentTime + 0.05
          const r = Math.random()
          if (r < 0.32) creak(t)
          else if (r < 0.5) nightbird(t)
          else if (r < 0.8) gust(t)
          else bell(t)
        }
      } catch (e) { /* ignore */ }
      scheduleAmbient()
    }, 8000 + Math.random() * 17000)
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
        case 'deny': // cast refused (no buoy / scared spot) — neutral knock,
          // deliberately unlike the shift/landward motifs the player must learn
          tone('sine', 130, t, 0.16, 0.05, { slideTo: 95, slideT: 0.1 })
          hit(t, 0.08, 0.02, 'bandpass', 900, 0, 1.5)
          break
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
        case 'drips': { // the wet net sheds water — sparse plinks into an echo
          const dly = ctx.createDelay(0.5)
          dly.delayTime.value = 0.26
          const fb = ctx.createGain()
          fb.gain.value = 0.32
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 1800
          const wet = ctx.createGain()
          wet.gain.value = 0.5
          dly.connect(lp).connect(fb).connect(dly)
          dly.connect(wet).connect(master)
          const n = 3 + Math.floor(Math.random() * 3)
          for (let i = 0; i < n; i++) {
            const td = t + 0.15 + i * (0.16 + Math.random() * 0.14)
            const f0 = 950 + Math.random() * 450
            tone('sine', f0, td, 0.07, 0.016, { slideTo: f0 * 0.62, slideT: 0.05, a: 0.005, out: dly })
            tone('sine', f0, td, 0.07, 0.014, { slideTo: f0 * 0.62, slideT: 0.05, a: 0.005 })
          }
          break
        }
        case 'lantern': // drifting into a lit buoy's water — the faintest ping
          tone('triangle', 1244, t, 0.09, 0.012, { a: 0.008 })
          tone('sine', 622, t, 0.14, 0.01, { a: 0.01 })
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
    voice,
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'none' }
    },
  }
}
