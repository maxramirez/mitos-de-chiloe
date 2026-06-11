// audio.js — LA FIURA procedural soundscape. 100% WebAudio, no assets.
// Swamp night: low wind through reeds, water lap, frog croaks; squelchy
// footsteps, jump/land taps, herb chimes, checkpoint bells, the Fiura's
// rising inhale drone while she telegraphs, the charm pulse whoosh, splash,
// and win/lose stingers.
//
// Graph: layers -> master gain (0.3) -> DynamicsCompressor -> destination.
// Lazy AudioContext created in unlock() (called from the BEGIN click, so no
// autoplay-policy errors); every call is a safe no-op before unlock.
// All level changes via setTargetAtTime; update() is allocation-free.
export function createAudio() {
  const AC =
    typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let noiseBuf = null
  let windGain = null
  let lapGain = null
  let croakOsc, croakGain
  let stepGain, stepBP
  let jumpOsc, jumpGain
  let landGain
  let chimeA, chimeB, chimeGain
  let inhaleOsc, inhaleGain
  let pulseGain, pulseBP
  let thumpOsc, thumpGain
  let splashGain

  let croakT = 2.5
  let lastWind = -1
  let lastInhale = -1

  const MASTER = 0.3

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

  function unlock() {
    if (ready || !AC) return
    ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume()

    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 6
    master.connect(comp)
    comp.connect(ctx.destination)

    // shared noise buffer (2 s white)
    const len = ctx.sampleRate * 2
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    // --- wind through the reeds ---
    const windLP = ctx.createBiquadFilter()
    windLP.type = 'lowpass'
    windLP.frequency.value = 340
    windGain = ctx.createGain()
    windGain.gain.value = 0.05
    noiseLoop().connect(windLP)
    windLP.connect(windGain)
    windGain.connect(master)
    const windLFO = ctx.createOscillator()
    windLFO.type = 'sine'
    windLFO.frequency.value = 0.11
    const windLFOg = ctx.createGain()
    windLFOg.gain.value = 90
    windLFO.connect(windLFOg)
    windLFOg.connect(windLP.frequency)
    windLFO.start()

    // --- black water lapping ---
    const lapBP = ctx.createBiquadFilter()
    lapBP.type = 'bandpass'
    lapBP.frequency.value = 150
    lapBP.Q.value = 1.6
    lapGain = ctx.createGain()
    lapGain.gain.value = 0.022
    noiseLoop().connect(lapBP)
    lapBP.connect(lapGain)
    lapGain.connect(master)
    const lapLFO = ctx.createOscillator()
    lapLFO.type = 'sine'
    lapLFO.frequency.value = 0.23
    const lapLFOg = ctx.createGain()
    lapLFOg.gain.value = 0.012
    lapLFO.connect(lapLFOg)
    lapLFOg.connect(lapGain.gain)
    lapLFO.start()

    // --- frogs ---
    croakOsc = ctx.createOscillator()
    croakOsc.type = 'sawtooth'
    croakOsc.frequency.value = 82
    croakGain = ctx.createGain()
    croakGain.gain.value = 0
    const croakLP = ctx.createBiquadFilter()
    croakLP.type = 'lowpass'
    croakLP.frequency.value = 500
    croakOsc.connect(croakLP)
    croakLP.connect(croakGain)
    croakGain.connect(master)
    croakOsc.start()

    // --- squelchy footsteps ---
    stepBP = ctx.createBiquadFilter()
    stepBP.type = 'bandpass'
    stepBP.frequency.value = 700
    stepBP.Q.value = 1.1
    stepGain = ctx.createGain()
    stepGain.gain.value = 0
    noiseLoop().connect(stepBP)
    stepBP.connect(stepGain)
    stepGain.connect(master)

    // --- jump chirp ---
    jumpOsc = ctx.createOscillator()
    jumpOsc.type = 'triangle'
    jumpOsc.frequency.value = 220
    jumpGain = ctx.createGain()
    jumpGain.gain.value = 0
    jumpOsc.connect(jumpGain)
    jumpGain.connect(master)
    jumpOsc.start()

    // --- landing thud ---
    const landLP = ctx.createBiquadFilter()
    landLP.type = 'lowpass'
    landLP.frequency.value = 240
    landGain = ctx.createGain()
    landGain.gain.value = 0
    noiseLoop().connect(landLP)
    landLP.connect(landGain)
    landGain.connect(master)

    // --- herb / checkpoint chimes (two sines) ---
    chimeA = ctx.createOscillator()
    chimeA.type = 'sine'
    chimeA.frequency.value = 880
    chimeB = ctx.createOscillator()
    chimeB.type = 'sine'
    chimeB.frequency.value = 1318
    chimeGain = ctx.createGain()
    chimeGain.gain.value = 0
    chimeA.connect(chimeGain)
    chimeB.connect(chimeGain)
    chimeGain.connect(master)
    chimeA.start()
    chimeB.start()

    // --- her inhale (rising drone while telegraphing) ---
    inhaleOsc = ctx.createOscillator()
    inhaleOsc.type = 'sine'
    inhaleOsc.frequency.value = 160
    inhaleGain = ctx.createGain()
    inhaleGain.gain.value = 0
    inhaleOsc.connect(inhaleGain)
    inhaleGain.connect(master)
    inhaleOsc.start()

    // --- charm pulse whoosh ---
    pulseBP = ctx.createBiquadFilter()
    pulseBP.type = 'bandpass'
    pulseBP.frequency.value = 900
    pulseBP.Q.value = 2.2
    pulseGain = ctx.createGain()
    pulseGain.gain.value = 0
    noiseLoop().connect(pulseBP)
    pulseBP.connect(pulseGain)
    pulseGain.connect(master)

    // --- low thump (charm hit / lose) ---
    thumpOsc = ctx.createOscillator()
    thumpOsc.type = 'sine'
    thumpOsc.frequency.value = 55
    thumpGain = ctx.createGain()
    thumpGain.gain.value = 0
    thumpOsc.connect(thumpGain)
    thumpGain.connect(master)
    thumpOsc.start()

    // --- splash ---
    const splashLP = ctx.createBiquadFilter()
    splashLP.type = 'lowpass'
    splashLP.frequency.value = 900
    splashGain = ctx.createGain()
    splashGain.gain.value = 0
    noiseLoop().connect(splashLP)
    splashLP.connect(splashGain)
    splashGain.connect(master)

    ready = true
  }

  function setMuted(m) {
    muted = m
    if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05)
  }

  // dt-driven ambience + her inhale level (0..1) scaled by proximity (0..1)
  function update(dt, moveAmt, inhale, proximity) {
    if (!ready) return
    const t = ctx.currentTime
    croakT -= dt
    if (croakT <= 0) {
      croakT = 2 + Math.random() * 4.5
      croakOsc.frequency.setValueAtTime(70 + Math.random() * 45, t)
      tap(croakGain, t, 0.028, 0.015, 0.07)
      tap(croakGain, t + 0.16, 0.02, 0.012, 0.06)
    }
    const wind = 0.045 + 0.025 * clamp01(moveAmt)
    if (Math.abs(wind - lastWind) > 0.004) {
      lastWind = wind
      windGain.gain.setTargetAtTime(wind, t, 0.4)
    }
    const inh = clamp01(inhale) * clamp01(proximity)
    if (Math.abs(inh - lastInhale) > 0.02) {
      lastInhale = inh
      inhaleGain.gain.setTargetAtTime(inh * 0.05, t, 0.06)
      inhaleOsc.frequency.setTargetAtTime(150 + inh * 240, t, 0.08)
    }
  }

  function step(onWet) {
    if (!ready) return
    const t = ctx.currentTime
    stepBP.frequency.setValueAtTime(onWet ? 520 + Math.random() * 200 : 800 + Math.random() * 300, t)
    tap(stepGain, t, onWet ? 0.05 : 0.035, 0.008, 0.035)
  }
  function jump() {
    if (!ready) return
    const t = ctx.currentTime
    jumpOsc.frequency.setValueAtTime(190, t)
    jumpOsc.frequency.linearRampToValueAtTime(330, t + 0.12)
    tap(jumpGain, t, 0.035, 0.01, 0.05)
  }
  function bounce() {
    if (!ready) return
    const t = ctx.currentTime
    jumpOsc.frequency.setValueAtTime(150, t)
    jumpOsc.frequency.linearRampToValueAtTime(430, t + 0.16)
    tap(jumpGain, t, 0.05, 0.012, 0.07)
  }
  function land(hard) {
    if (!ready) return
    tap(landGain, ctx.currentTime, hard ? 0.09 : 0.05, 0.008, 0.05)
  }
  function herb() {
    if (!ready) return
    const t = ctx.currentTime
    chimeA.frequency.setValueAtTime(880, t)
    chimeB.frequency.setValueAtTime(1318, t)
    tap(chimeGain, t, 0.05, 0.012, 0.25)
    tap(chimeGain, t + 0.13, 0.035, 0.012, 0.3)
  }
  function checkpoint() {
    if (!ready) return
    const t = ctx.currentTime
    chimeA.frequency.setValueAtTime(523, t)
    chimeB.frequency.setValueAtTime(784, t)
    tap(chimeGain, t, 0.045, 0.015, 0.35)
  }
  function pulse() {
    if (!ready) return
    const t = ctx.currentTime
    pulseBP.frequency.setValueAtTime(1400, t)
    pulseBP.frequency.exponentialRampToValueAtTime(280, t + 0.5)
    tap(pulseGain, t, 0.08, 0.015, 0.16)
  }
  function charm() {
    if (!ready) return
    const t = ctx.currentTime
    thumpOsc.frequency.setValueAtTime(70, t)
    thumpOsc.frequency.exponentialRampToValueAtTime(38, t + 0.4)
    tap(thumpGain, t, 0.16, 0.01, 0.16)
    chimeA.frequency.setValueAtTime(622, t)
    chimeB.frequency.setValueAtTime(587, t) // sour minor-second shimmer
    tap(chimeGain, t, 0.04, 0.01, 0.2)
  }
  function splash() {
    if (!ready) return
    const t = ctx.currentTime
    tap(splashGain, t, 0.14, 0.012, 0.12)
    tap(thumpGain, t, 0.1, 0.01, 0.1)
  }
  function win() {
    if (!ready) return
    const t = ctx.currentTime
    chimeA.frequency.setValueAtTime(659, t)
    chimeB.frequency.setValueAtTime(988, t)
    tap(chimeGain, t, 0.05, 0.02, 0.3)
    chimeA.frequency.setValueAtTime(784, t + 0.35)
    chimeB.frequency.setValueAtTime(1175, t + 0.35)
    tap(chimeGain, t + 0.35, 0.055, 0.02, 0.5)
  }
  function lose() {
    if (!ready) return
    const t = ctx.currentTime
    thumpOsc.frequency.setValueAtTime(60, t)
    thumpOsc.frequency.exponentialRampToValueAtTime(30, t + 1.1)
    tap(thumpGain, t, 0.18, 0.02, 0.4)
  }

  return {
    unlock,
    setMuted,
    isMuted: () => muted,
    update,
    step,
    jump,
    bounce,
    land,
    herb,
    checkpoint,
    pulse,
    charm,
    splash,
    win,
    lose,
    state: () => ({ unlocked: ready, muted, contextState: ctx ? ctx.state : 'none' }),
  }
}
