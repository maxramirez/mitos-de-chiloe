// EL BRUJO DE QUICAVÍ · audio.js — 100% procedural WebAudio forest dread.
// Lazy AudioContext created in unlock() (the BEGIN click) — zero autoplay
// errors; every call is a safe no-op before unlock. M toggles mute via
// toggleMute(). All level moves use setTargetAtTime (click-free); update()
// is allocation-free; one shared 2 s noise buffer feeds every layer.
//
// Layers: night wind + high leaf rustle · static crackle (gain = the static
// meter — the danger is audible) · low forest drone (rises with pages taken)
// · heartbeat (static or the final push) · footsteps · lapping water during
// the boat push. One-shots: rip (page torn free), whisper(n) (the count,
// 'una… dos…' as breath, not speech), sting (first sight of him), relocate
// (sub thump when he moves), gutter (the farol sputters), beacon (7th page),
// caught, win.

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let noiseBuf = null
  let windLP = null
  let windGain = null
  let rustleGain = null
  let crackleGain = null
  let droneGain = null
  let stepBP = null
  let stepGain = null
  let hbOsc = null
  let hbGain = null
  let waterGain = null

  let t0 = 0
  let stepPhase = 0
  let hbPhase = 0
  let creakNext = -1e9
  let lastWind = -1
  let lastCrackle = -1
  let lastDrone = -1
  let lastWater = -1

  const MASTER_LEVEL = 0.32

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

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

    // wind through black trees
    windLP = ctx.createBiquadFilter()
    windLP.type = 'lowpass'
    windLP.frequency.value = 210
    windLP.Q.value = 0.4
    windGain = ctx.createGain()
    windGain.gain.value = 0
    noiseLoop().connect(windLP)
    windLP.connect(windGain)
    windGain.connect(master)

    // high leaf rustle, barely there
    const rustleBP = ctx.createBiquadFilter()
    rustleBP.type = 'bandpass'
    rustleBP.frequency.value = 3100
    rustleBP.Q.value = 0.6
    rustleGain = ctx.createGain()
    rustleGain.gain.value = 0
    noiseLoop().connect(rustleBP)
    rustleBP.connect(rustleGain)
    rustleGain.connect(master)

    // the static — highpassed crackle, gain follows the meter
    const crackleHP = ctx.createBiquadFilter()
    crackleHP.type = 'highpass'
    crackleHP.frequency.value = 2300
    crackleGain = ctx.createGain()
    crackleGain.gain.value = 0
    noiseLoop().connect(crackleHP)
    crackleHP.connect(crackleGain)
    crackleGain.connect(master)

    // forest drone — detuned saws under heavy lowpass; rises with the pages
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 115
    droneGain = ctx.createGain()
    droneGain.gain.value = 0
    droneLP.connect(droneGain)
    droneGain.connect(master)
    const dr1 = ctx.createOscillator()
    dr1.type = 'sawtooth'
    dr1.frequency.value = 41
    const dr2 = ctx.createOscillator()
    dr2.type = 'sawtooth'
    dr2.frequency.value = 41.5
    const dr3 = ctx.createOscillator()
    dr3.type = 'sine'
    dr3.frequency.value = 27.5
    dr1.connect(droneLP)
    dr2.connect(droneLP)
    dr3.connect(droneLP)
    dr1.start()
    dr2.start()
    dr3.start()

    // footsteps on wet leaf-litter
    stepBP = ctx.createBiquadFilter()
    stepBP.type = 'bandpass'
    stepBP.frequency.value = 260
    stepBP.Q.value = 0.9
    stepGain = ctx.createGain()
    stepGain.gain.value = 0
    noiseLoop().connect(stepBP)
    stepBP.connect(stepGain)
    stepGain.connect(master)

    // heartbeat
    hbOsc = ctx.createOscillator()
    hbOsc.type = 'sine'
    hbOsc.frequency.value = 52
    hbGain = ctx.createGain()
    hbGain.gain.value = 0
    hbOsc.connect(hbGain)
    hbGain.connect(master)
    hbOsc.start()

    // channel water (the boat push)
    const waterLP = ctx.createBiquadFilter()
    waterLP.type = 'lowpass'
    waterLP.frequency.value = 360
    waterGain = ctx.createGain()
    waterGain.gain.value = 0
    noiseLoop().connect(waterLP)
    waterLP.connect(waterGain)
    waterGain.connect(master)

    t0 = ctx.currentTime
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

  // c: { active, moving, sprint, static01, pages01, hold01 }
  function update(dt, c) {
    if (!ready || !c) return
    const step = dt > 0.05 ? 0.05 : dt > 0 ? dt : 0
    const now = ctx.currentTime
    const st = clamp01(c.static01)
    const t = now - t0

    // wind breathes on a slow cycle
    const windTarget = (c.active ? 0.052 : 0.034) + 0.024 * Math.sin(t * 0.13) + 0.012 * Math.sin(t * 0.041 + 2)
    if (Math.abs(windTarget - lastWind) > 0.002) {
      lastWind = windTarget
      windGain.gain.setTargetAtTime(windTarget, now, 0.8)
      windLP.frequency.setTargetAtTime(180 + 90 * (0.5 + 0.5 * Math.sin(t * 0.09)), now, 1.2)
      rustleGain.gain.setTargetAtTime(0.0045 + 0.0035 * Math.sin(t * 0.21 + 1), now, 1.0)
    }

    // static crackle — the danger is audible
    const crackleTarget = c.active ? Math.pow(st, 1.6) * 0.5 + clamp01(c.hold01) * 0.14 : 0
    if (Math.abs(crackleTarget - lastCrackle) > 0.0015) {
      lastCrackle = crackleTarget
      crackleGain.gain.setTargetAtTime(crackleTarget, now, 0.06)
    }

    // drone rises with the pages and with the static
    const droneTarget = c.active ? 0.018 + clamp01(c.pages01) * 0.055 + st * 0.1 : 0.012
    if (Math.abs(droneTarget - lastDrone) > 0.0015) {
      lastDrone = droneTarget
      droneGain.gain.setTargetAtTime(droneTarget, now, 0.9)
    }

    // water + hull creaks while pushing off
    const waterTarget = clamp01(c.hold01) * 0.2
    if (Math.abs(waterTarget - lastWater) > 0.0015) {
      lastWater = waterTarget
      waterGain.gain.setTargetAtTime(waterTarget, now, 0.25)
    }
    if (c.hold01 > 0.02 && now > creakNext) {
      creakNext = now + 0.55 + Math.random() * 0.5
      blip('sawtooth', 74 + Math.random() * 18, now + 0.02, 0.05, 0.03, 0.18, 52)
    }

    // footsteps
    if (c.active && c.moving) {
      stepPhase += step * (c.sprint ? 2.9 : 1.9)
      if (stepPhase >= 1) {
        stepPhase -= 1
        stepBP.frequency.setValueAtTime(200 + Math.random() * 240, now)
        tap(stepGain, now, (c.sprint ? 0.11 : 0.06) + Math.random() * 0.025, 0.004, 0.035)
      }
    } else if (stepPhase > 0.85) {
      stepPhase = 0.85
    }

    // heartbeat — the static is climbing, or the push is nearly done
    const dread = Math.max(st > 0.4 ? st : 0, clamp01(c.hold01) * 0.9)
    if (c.active && dread > 0) {
      const bpm = 56 + 58 * clamp01(dread)
      hbPhase += step * (bpm / 60)
      if (hbPhase >= 1) {
        hbPhase -= 1
        hbOsc.frequency.setValueAtTime(58, now)
        hbOsc.frequency.setTargetAtTime(45, now + 0.02, 0.05)
        tap(hbGain, now, 0.38, 0.008, 0.055)
        tap(hbGain, now + 0.17, 0.2, 0.008, 0.05)
      }
    } else {
      hbPhase = 0
    }
  }

  // the count, whispered: breathy formant taps, slightly different per number
  function whisper(n) {
    if (!ready) return
    const t = ctx.currentTime + 0.03
    const f1 = 760 + (n % 4) * 110
    const f2 = 520 + (n % 3) * 90
    hiss(t, 0.055, 0.03, 0.1, 'bandpass', f1, 5, 0.5)
    hiss(t + 0.14, 0.045, 0.035, 0.13, 'bandpass', f2, 5, 0.55)
    if (n >= 5) hiss(t + 0.3, 0.03, 0.03, 0.12, 'bandpass', f1 * 0.8, 6, 0.5)
  }

  function stinger(name) {
    if (!ready) return
    const t = ctx.currentTime + 0.02
    if (name === 'rip') {
      // paper torn off a nail
      const h = hiss(t, 0.2, 0.004, 0.07, 'highpass', 900, 0.7, 0.45)
      h.filter.frequency.setTargetAtTime(3800, t, 0.05)
      blip('sine', 90, t + 0.01, 0.07, 0.005, 0.07, 60)
    } else if (name === 'sting') {
      // first sight of him — a quiet dissonant pull
      blip('sawtooth', 196, t, 0.045, 0.015, 0.8, 188)
      blip('sawtooth', 207.6, t + 0.01, 0.04, 0.015, 0.85, 197)
      hiss(t, 0.03, 0.1, 0.5, 'bandpass', 900, 1.2, 2.2)
    } else if (name === 'relocate') {
      // he is somewhere else now — a thump under the ground
      blip('sine', 36, t, 0.05, 0.01, 0.18, 27)
    } else if (name === 'gutter') {
      // the farol sputters
      hiss(t, 0.07, 0.01, 0.06, 'bandpass', 1700, 2, 0.4)
      hiss(t + 0.12, 0.05, 0.01, 0.07, 'bandpass', 1400, 2, 0.4)
      hiss(t + 0.3, 0.06, 0.01, 0.1, 'bandpass', 1900, 2, 0.5)
      blip('sine', 120, t + 0.05, 0.03, 0.02, 0.2, 70)
    } else if (name === 'beacon') {
      // the seventh page — a cold far bell toward the water
      blip('sine', 65.4, t, 0.3, 0.008, 1.5)
      blip('sine', 98, t + 0.03, 0.14, 0.01, 1.1)
      blip('sine', 196, t + 0.06, 0.05, 0.01, 0.8)
    } else if (name === 'caught') {
      // the face — static blast + scream cluster + sub drop
      hiss(t, 0.42, 0.004, 0.5, 'highpass', 400, 0.7, 2.0)
      blip('sawtooth', 620, t, 0.2, 0.004, 0.5, 880)
      blip('sawtooth', 633, t, 0.18, 0.004, 0.55, 905)
      blip('sawtooth', 790, t + 0.03, 0.14, 0.004, 0.45, 1180)
      blip('sine', 70, t, 0.5, 0.005, 0.7, 24)
    } else if (name === 'win') {
      // el canal te suelta — water takes the hull, a hollow open chord
      const h = hiss(t, 0.16, 0.5, 1.6, 'lowpass', 420, 0.5, 5)
      h.filter.frequency.setTargetAtTime(180, t + 1.2, 1.0)
      hiss(t + 0.15, 0.1, 0.05, 0.5, 'bandpass', 800, 1.2, 2.0)
      blip('triangle', 110, t + 0.3, 0.09, 0.3, 2.4)
      blip('triangle', 164.8, t + 0.5, 0.07, 0.35, 2.3)
      blip('triangle', 220, t + 0.7, 0.06, 0.4, 2.2)
      blip('sine', 55, t + 0.3, 0.12, 0.3, 1.8)
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
    whisper,
    stinger,
    toggleMute,
    get state() {
      return { unlocked: ready, muted, contextState: ctx ? ctx.state : 'unavailable' }
    },
  }
}
