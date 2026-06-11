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
// snarl, caught, dark, win.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
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
  let lastDrone = -1
  let lastGrowl = -1

  const MASTER_LEVEL = 0.32

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
    g.connect(dest || master)
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
    g.connect(dest || master)
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
    wet.connect(master)

    // drone: two detuned saws + sub sine under a heavy lowpass
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 150
    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneLP.connect(droneGain)
    droneGain.connect(master)
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
    breathGain.connect(master)

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
    growlGain.connect(master)
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
    stepGain.connect(master)

    // his dragging foot (one-shot taps through a persistent lowpass)
    dragLP = ctx.createBiquadFilter()
    dragLP.type = 'lowpass'
    dragLP.frequency.value = 260
    dragGain = ctx.createGain()
    dragGain.gain.value = 0
    noiseLoop().connect(dragLP)
    dragLP.connect(dragGain)
    dragGain.connect(master)
    dragGain.connect(echoBus)

    // heartbeat
    hbOsc = ctx.createOscillator()
    hbOsc.type = 'sine'
    hbOsc.frequency.value = 52
    hbGain = ctx.createGain()
    hbGain.gain.value = 0
    hbOsc.connect(hbGain)
    hbGain.connect(master)
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
    }
    if (ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && p.catch) p.catch(function () {})
    }
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
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'unavailable' }
    },
  }
}
