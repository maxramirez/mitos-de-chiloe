// audio.js — LA FIURA procedural soundscape + narrator voice clips.
// Swamp night: low wind through reeds, water lap, frog croaks; squelchy
// footsteps, jump/land taps, herb chimes, checkpoint bells, the Fiura's
// rising inhale drone while she telegraphs, the charm pulse whoosh, splash,
// win/lose stingers; ambient swamp one-shots (echoing drips, reed creaks,
// insect shimmer, ground rumbles, a far night bird) on an 8-25 s scheduler;
// sink-log bubble pops and a herb proximity glint; whispered Spanish
// voice lines (mp3, fetched lazily AFTER the unlock gesture — every fetch
// or decode failure is a silent no-op, the game is identical without them);
// and a looping music bed (../assets/music/fiura.mp3, seam pre-crossfaded)
// that sits under the procedural ambience on the same ducking bus.
//
// Graph: ambience layers -> ambBus -> master gain (0.3) ->
// DynamicsCompressor -> destination. Voices go through voiceGain (0.8) ->
// master so M mutes them too; while a clip plays ambBus ducks to ~40%
// (setTargetAtTime) and recovers.
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
  let ambBus = null
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

  // new swamp one-shots
  let dripOsc, dripGain
  let creakOsc, creakBP, creakGain
  let insectGain
  let rumbleOsc, rumbleGain
  let birdOsc, birdGain
  let bubbleOsc, bubbleGain
  let glintOsc, glintGain

  let croakT = 2.5
  let lastWind = -1
  let lastInhale = -1
  let ambNext = 7 // first ambient one-shot a beat after BEGIN
  let bubbleHold = 0
  let glintHold = 0

  // narrator voice clips (mp3) — loaded after unlock, silent no-op if absent
  let voiceGain = null
  const voiceBufs = {}
  let voiceSrc = null
  let pendingVoice = null
  let pendingUntil = 0

  // looping music bed — loaded after unlock, silent no-op if absent
  let musicGain = null
  let musicSrc = null

  const MASTER = 0.3
  const MUSIC = 0.22 // bed level under the swamp; ambience is non-melodic so no clash

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

    // ambience bus — beds + ambient one-shots; ducks under the narrator
    ambBus = ctx.createGain()
    ambBus.gain.value = 1
    ambBus.connect(master)

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
    windGain.connect(ambBus)
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
    lapGain.connect(ambBus)
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
    croakGain.connect(ambBus)
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

    // --- water drip with echo (sine blip -> feedback delay) ---
    dripOsc = ctx.createOscillator()
    dripOsc.type = 'sine'
    dripOsc.frequency.value = 1050
    dripGain = ctx.createGain()
    dripGain.gain.value = 0
    dripOsc.connect(dripGain)
    const dripDelay = ctx.createDelay(1)
    dripDelay.delayTime.value = 0.31
    const dripFb = ctx.createGain()
    dripFb.gain.value = 0.34
    const dripWet = ctx.createGain()
    dripWet.gain.value = 0.5
    dripGain.connect(ambBus)
    dripGain.connect(dripDelay)
    dripDelay.connect(dripFb)
    dripFb.connect(dripDelay)
    dripDelay.connect(dripWet)
    dripWet.connect(ambBus)
    dripOsc.start()

    // --- reed / dead-wood creak (sawtooth groan through a narrow bandpass) --
    creakOsc = ctx.createOscillator()
    creakOsc.type = 'sawtooth'
    creakOsc.frequency.value = 130
    creakBP = ctx.createBiquadFilter()
    creakBP.type = 'bandpass'
    creakBP.frequency.value = 420
    creakBP.Q.value = 7
    creakGain = ctx.createGain()
    creakGain.gain.value = 0
    creakOsc.connect(creakBP)
    creakBP.connect(creakGain)
    creakGain.connect(ambBus)
    creakOsc.start()

    // --- insect shimmer (high narrow noise, micro-taps make the tremolo) ---
    const insectBP = ctx.createBiquadFilter()
    insectBP.type = 'bandpass'
    insectBP.frequency.value = 5200
    insectBP.Q.value = 6
    insectGain = ctx.createGain()
    insectGain.gain.value = 0
    noiseLoop().connect(insectBP)
    insectBP.connect(insectGain)
    insectGain.connect(ambBus)

    // --- low ground rumble (deep sine swell) ---
    rumbleOsc = ctx.createOscillator()
    rumbleOsc.type = 'sine'
    rumbleOsc.frequency.value = 31
    rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 0
    rumbleOsc.connect(rumbleGain)
    rumbleGain.connect(ambBus)
    rumbleOsc.start()

    // --- distant night bird (FM chirp, rare) ---
    birdOsc = ctx.createOscillator()
    birdOsc.type = 'sine'
    birdOsc.frequency.value = 1500
    const birdMod = ctx.createOscillator()
    birdMod.type = 'sine'
    birdMod.frequency.value = 22
    const birdModG = ctx.createGain()
    birdModG.gain.value = 110
    birdMod.connect(birdModG)
    birdModG.connect(birdOsc.frequency)
    const birdLP = ctx.createBiquadFilter()
    birdLP.type = 'lowpass'
    birdLP.frequency.value = 2400
    birdGain = ctx.createGain()
    birdGain.gain.value = 0
    birdOsc.connect(birdLP)
    birdLP.connect(birdGain)
    birdGain.connect(ambBus)
    birdOsc.start()
    birdMod.start()

    // --- sink-log bubble pop (rising sine blip) ---
    bubbleOsc = ctx.createOscillator()
    bubbleOsc.type = 'sine'
    bubbleOsc.frequency.value = 320
    bubbleGain = ctx.createGain()
    bubbleGain.gain.value = 0
    bubbleOsc.connect(bubbleGain)
    bubbleGain.connect(ambBus)
    bubbleOsc.start()

    // --- herb proximity glint (tiny high sine tick) ---
    glintOsc = ctx.createOscillator()
    glintOsc.type = 'sine'
    glintOsc.frequency.value = 1760
    glintGain = ctx.createGain()
    glintGain.gain.value = 0
    glintOsc.connect(glintGain)
    glintGain.connect(ambBus)
    glintOsc.start()

    // --- narrator voice bus: clips -> voiceGain -> master (M mutes it too) --
    voiceGain = ctx.createGain()
    voiceGain.gain.value = 0.8
    voiceGain.connect(master)

    // --- music bed bus: rides the ambience bus so it ducks under the voice
    // and mutes with M; faded in once the loop decodes, eased out on win/lose
    musicGain = ctx.createGain()
    musicGain.gain.value = 0
    musicGain.connect(ambBus)

    ready = true
    loadVoices() // only ever after the user gesture — never on page load
    loadMusic() // ditto — and every failure path is a silent no-op
  }

  // ---------- looping music bed (seam pre-crossfaded mp3) ----------
  function loadMusic() {
    try {
      fetch('../assets/music/fiura.mp3')
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status)
          return r.arrayBuffer()
        })
        .then(function (ab) {
          return new Promise(function (res, rej) {
            ctx.decodeAudioData(ab, res, rej)
          })
        })
        .then(function (buf) {
          if (musicSrc) return // never double-start
          const s = ctx.createBufferSource()
          s.buffer = buf
          s.loop = true // the seam is pre-crossfaded — no gap, no click
          s.connect(musicGain)
          s.start()
          musicSrc = s
          musicGain.gain.setTargetAtTime(MUSIC, ctx.currentTime, 1.2)
        })
        .catch(function () {})
    } catch {}
  }

  // ease the bed out under the end stingers (they run on master, on top)
  function musicOut() {
    if (ready && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.9)
  }

  // ---------- narrator voice (mp3 clips; every failure is a silent no-op) --
  function setDuck(v) {
    if (ready) ambBus.gain.setTargetAtTime(v, ctx.currentTime, 0.35)
  }

  function playVoice(buf) {
    try {
      if (voiceSrc) {
        try {
          voiceSrc.stop()
        } catch {}
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(voiceGain)
      voiceSrc = s
      setDuck(0.4) // the swamp steps back while the old man speaks
      s.onended = function () {
        if (voiceSrc === s) {
          voiceSrc = null
          setDuck(1)
        }
      }
      s.start()
    } catch {
      voiceSrc = null
      setDuck(1)
    }
  }

  function loadVoices() {
    const names = ['begin', 'win', 'lose', 'whisper']
    for (let i = 0; i < names.length; i++) {
      const n = names[i]
      try {
        fetch('../assets/voice/fiura/' + n + '.mp3')
          .then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status)
            return r.arrayBuffer()
          })
          .then(function (ab) {
            return new Promise(function (res, rej) {
              ctx.decodeAudioData(ab, res, rej)
            })
          })
          .then(function (buf) {
            voiceBufs[n] = buf
            // the BEGIN line is requested before its fetch settles — honor it
            if (pendingVoice === n && ctx.currentTime < pendingUntil) {
              pendingVoice = null
              playVoice(buf)
            }
          })
          .catch(function () {})
      } catch {}
    }
  }

  function voice(name) {
    if (!ready) return
    const buf = voiceBufs[name]
    if (!buf) {
      pendingVoice = name
      pendingUntil = ctx.currentTime + 4
      return
    }
    playVoice(buf)
  }

  // ---------- ambient swamp one-shots (scheduler-driven) ----------
  function drip() {
    const t = ctx.currentTime
    dripOsc.frequency.setValueAtTime(900 + Math.random() * 400, t)
    dripOsc.frequency.exponentialRampToValueAtTime(420, t + 0.07)
    tap(dripGain, t, 0.028, 0.004, 0.03)
  }
  function creak() {
    const t = ctx.currentTime
    creakOsc.frequency.setValueAtTime(120 + Math.random() * 60, t)
    creakOsc.frequency.linearRampToValueAtTime(65 + Math.random() * 25, t + 0.7)
    creakBP.frequency.setValueAtTime(380 + Math.random() * 180, t)
    creakBP.frequency.linearRampToValueAtTime(220, t + 0.7)
    tap(creakGain, t, 0.018, 0.12, 0.22)
  }
  function insects() {
    const t = ctx.currentTime
    let at = 0
    const n = 3 + ((Math.random() * 3) | 0)
    for (let i = 0; i < n; i++) {
      tap(insectGain, t + at, 0.01, 0.012, 0.04)
      at += 0.09 + Math.random() * 0.12
    }
  }
  function rumble() {
    const t = ctx.currentTime
    rumbleOsc.frequency.setValueAtTime(28 + Math.random() * 8, t)
    tap(rumbleGain, t, 0.05, 0.45, 0.6)
  }
  function bird() {
    const t = ctx.currentTime
    birdOsc.frequency.setValueAtTime(1350 + Math.random() * 350, t)
    tap(birdGain, t, 0.012, 0.02, 0.06)
    tap(birdGain, t + 0.28, 0.009, 0.02, 0.08)
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
    // interaction rate limits
    if (bubbleHold > 0) bubbleHold -= dt
    if (glintHold > 0) glintHold -= dt
    // ambient one-shot scheduler — a stray swamp sound every 8-25 s
    ambNext -= dt
    if (ambNext <= 0) {
      ambNext = 8 + Math.random() * 17
      const r = Math.random()
      if (r < 0.3) drip()
      else if (r < 0.55) creak()
      else if (r < 0.75) insects()
      else if (r < 0.92) rumble()
      else bird()
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
  // sink-log bubble pop — called while a log goes under; self rate-limited
  function bubble() {
    if (!ready || bubbleHold > 0) return
    bubbleHold = 0.28 + Math.random() * 0.2
    const t = ctx.currentTime
    bubbleOsc.frequency.setValueAtTime(260 + Math.random() * 120, t)
    bubbleOsc.frequency.exponentialRampToValueAtTime(640 + Math.random() * 200, t + 0.06)
    tap(bubbleGain, t, 0.022, 0.006, 0.025)
  }
  // herb proximity glint — soft tick when a hierba is close; self rate-limited
  function herbNear() {
    if (!ready || glintHold > 0) return
    glintHold = 1.1 + Math.random() * 0.5
    const t = ctx.currentTime
    glintOsc.frequency.setValueAtTime(1680 + Math.random() * 220, t)
    tap(glintGain, t, 0.012, 0.01, 0.09)
  }
  function win() {
    if (!ready) return
    musicOut()
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
    musicOut()
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
    bubble,
    herbNear,
    voice,
    win,
    lose,
    state: () => ({ unlocked: ready, muted, contextState: ctx ? ctx.state : 'none' }),
  }
}
