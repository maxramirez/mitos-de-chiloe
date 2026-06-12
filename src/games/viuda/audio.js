// audio.js — LA VIUDA procedural soundscape + narrator voice clips.
// Coastal night: sea wash far below, wind in the fence wires, crickets;
// ox-hoof clops timed by the sim's gait, cart-wood creaks, wheel rumble that
// rides the speed; lever clunks, oil pour gurgle + finish chime, pothole
// thump/crack, glints; the lantern's gutter-flutter when SHE is near, her
// presence drone + heartbeat, the settle-thud and cloth swish when she
// boards (each boarding leaves a persistent dread drone layer); midnight
// bells, win/lose stingers; ambient one-shots (far dog, owl, seabird, wave
// crash, wood groan) on a 9-24 s scheduler; whispered Spanish voice lines
// (mp3, fetched lazily AFTER the unlock gesture — every fetch or decode
// failure is a silent no-op, the game is identical without them); and a
// looping music bed (../assets/music/viuda.mp3) under everything.
//
// Graph: beds -> ambBus -> master gain (0.3) -> DynamicsCompressor ->
// destination. Voices go through voiceGain (0.85) -> master so M mutes them
// too; while a clip plays ambBus ducks to ~40% (setTargetAtTime) and
// recovers. Lazy AudioContext created in unlock(); every call is a safe
// no-op before unlock. All level changes via setTargetAtTime; update() is
// allocation-free.
export function createAudio() {
  const AC =
    typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false

  let master = null
  let ambBus = null
  let noiseBuf = null

  // beds
  let seaGain, seaLP
  let windGain, windBP
  let cricketGain
  let rumbleGain

  // her
  let gutterGain, gutterMod
  let presOscA, presOscB, presGain
  let dreadGain
  let heartOsc, heartGain

  // cart + interactions
  let clopBP, clopGain
  let levOsc, levGain, levNoiseGain
  let creakOsc, creakBP, creakGain
  let pourGain, glugOsc, glugGain
  let chimeA, chimeB, chimeGain
  let thumpOsc, thumpGain
  let crackGain
  let clothGain
  let glintOsc, glintGain
  let snortGain
  let groanOsc, groanGain

  // ambient one-shots
  let bellA, bellB, bellGain
  let dogOsc, dogGain
  let owlOsc, owlGain
  let birdOsc, birdGain
  let waveGain

  // timers / caches
  let cricketT = 2
  let ambNext = 8
  let heartT = 0
  let glintHold = 0
  let clopAlt = false
  let lastRumble = -1
  let lastGutter = -1
  let lastPres = -1
  let lastDread = -1

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
  const MUSIC = 0.24 // bed level under the night; eased out at end states

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
    if (!AC) return
    if (ready) {
      // re-entrant: a load-time attempt may have left the context suspended;
      // a later real gesture (any tap, or COMENZAR) lands here and resumes it
      try { if (ctx && ctx.state === 'suspended') ctx.resume() } catch (e) { /* ignore */ }
      return
    }
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

    // --- the sea, far below the road ---
    seaLP = ctx.createBiquadFilter()
    seaLP.type = 'lowpass'
    seaLP.frequency.value = 240
    seaGain = ctx.createGain()
    seaGain.gain.value = 0.05
    noiseLoop().connect(seaLP)
    seaLP.connect(seaGain)
    seaGain.connect(ambBus)
    const seaLFO = ctx.createOscillator()
    seaLFO.type = 'sine'
    seaLFO.frequency.value = 0.07
    const seaLFOg = ctx.createGain()
    seaLFOg.gain.value = 0.02
    seaLFO.connect(seaLFOg)
    seaLFOg.connect(seaGain.gain)
    seaLFO.start()

    // --- wind in the fence wires ---
    windBP = ctx.createBiquadFilter()
    windBP.type = 'bandpass'
    windBP.frequency.value = 480
    windBP.Q.value = 0.9
    windGain = ctx.createGain()
    windGain.gain.value = 0.022
    noiseLoop().connect(windBP)
    windBP.connect(windGain)
    windGain.connect(ambBus)
    const windLFO = ctx.createOscillator()
    windLFO.type = 'sine'
    windLFO.frequency.value = 0.13
    const windLFOg = ctx.createGain()
    windLFOg.gain.value = 160
    windLFO.connect(windLFOg)
    windLFOg.connect(windBP.frequency)
    windLFO.start()

    // --- crickets (high narrow noise, micro-taps make the chirps) ---
    const criBP = ctx.createBiquadFilter()
    criBP.type = 'bandpass'
    criBP.frequency.value = 4300
    criBP.Q.value = 8
    cricketGain = ctx.createGain()
    cricketGain.gain.value = 0
    noiseLoop().connect(criBP)
    criBP.connect(cricketGain)
    cricketGain.connect(ambBus)

    // --- wheel rumble (rides the speed) ---
    const rumLP = ctx.createBiquadFilter()
    rumLP.type = 'lowpass'
    rumLP.frequency.value = 110
    rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 0
    noiseLoop().connect(rumLP)
    rumLP.connect(rumbleGain)
    rumbleGain.connect(ambBus)

    // --- lantern gutter-flutter (when she is near) ---
    const gutBP = ctx.createBiquadFilter()
    gutBP.type = 'bandpass'
    gutBP.frequency.value = 2400
    gutBP.Q.value = 3
    gutterGain = ctx.createGain()
    gutterGain.gain.value = 0
    noiseLoop().connect(gutBP)
    gutBP.connect(gutterGain)
    gutterGain.connect(ambBus)
    const gutLFO = ctx.createOscillator()
    gutLFO.type = 'sine'
    gutLFO.frequency.value = 7.3
    gutterMod = ctx.createGain()
    gutterMod.gain.value = 0
    gutLFO.connect(gutterMod)
    gutterMod.connect(gutterGain.gain)
    gutLFO.start()

    // --- her presence (two barely-detuned sines, a held breath) ---
    presOscA = ctx.createOscillator()
    presOscA.type = 'sine'
    presOscA.frequency.value = 106
    presOscB = ctx.createOscillator()
    presOscB.type = 'sine'
    presOscB.frequency.value = 107.6
    presGain = ctx.createGain()
    presGain.gain.value = 0
    presOscA.connect(presGain)
    presOscB.connect(presGain)
    presGain.connect(master)
    presOscA.start()
    presOscB.start()

    // --- dread drone (persists once she has boarded) ---
    const drA = ctx.createOscillator()
    drA.type = 'sine'
    drA.frequency.value = 38
    const drB = ctx.createOscillator()
    drB.type = 'sine'
    drB.frequency.value = 57.3
    dreadGain = ctx.createGain()
    dreadGain.gain.value = 0
    drA.connect(dreadGain)
    drB.connect(dreadGain)
    dreadGain.connect(master)
    drA.start()
    drB.start()

    // --- heartbeat ---
    heartOsc = ctx.createOscillator()
    heartOsc.type = 'sine'
    heartOsc.frequency.value = 50
    heartGain = ctx.createGain()
    heartGain.gain.value = 0
    heartOsc.connect(heartGain)
    heartGain.connect(master)
    heartOsc.start()

    // --- ox-hoof clops ---
    clopBP = ctx.createBiquadFilter()
    clopBP.type = 'bandpass'
    clopBP.frequency.value = 800
    clopBP.Q.value = 1.4
    clopGain = ctx.createGain()
    clopGain.gain.value = 0
    noiseLoop().connect(clopBP)
    clopBP.connect(clopGain)
    clopGain.connect(master)

    // --- lever clunk (wood knock + low blip) ---
    const levLP = ctx.createBiquadFilter()
    levLP.type = 'lowpass'
    levLP.frequency.value = 320
    levNoiseGain = ctx.createGain()
    levNoiseGain.gain.value = 0
    noiseLoop().connect(levLP)
    levLP.connect(levNoiseGain)
    levNoiseGain.connect(master)
    levOsc = ctx.createOscillator()
    levOsc.type = 'triangle'
    levOsc.frequency.value = 120
    levGain = ctx.createGain()
    levGain.gain.value = 0
    levOsc.connect(levGain)
    levGain.connect(master)
    levOsc.start()

    // --- cart-wood creak (sawtooth groan through a narrow bandpass) ---
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

    // --- oil pour (steady gurgle while pouring + glug blips) ---
    const pourBP = ctx.createBiquadFilter()
    pourBP.type = 'bandpass'
    pourBP.frequency.value = 900
    pourBP.Q.value = 1.5
    pourGain = ctx.createGain()
    pourGain.gain.value = 0
    noiseLoop().connect(pourBP)
    pourBP.connect(pourGain)
    pourGain.connect(master)
    glugOsc = ctx.createOscillator()
    glugOsc.type = 'sine'
    glugOsc.frequency.value = 300
    glugGain = ctx.createGain()
    glugGain.gain.value = 0
    glugOsc.connect(glugGain)
    glugGain.connect(master)
    glugOsc.start()

    // --- chimes (two sines — refill, the pass relief, win) ---
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

    // --- low thump (potholes, her settle, lose) ---
    thumpOsc = ctx.createOscillator()
    thumpOsc.type = 'sine'
    thumpOsc.frequency.value = 55
    thumpGain = ctx.createGain()
    thumpGain.gain.value = 0
    thumpOsc.connect(thumpGain)
    thumpGain.connect(master)
    thumpOsc.start()

    // --- wood crack (wheel damage snap) ---
    const crackHP = ctx.createBiquadFilter()
    crackHP.type = 'highpass'
    crackHP.frequency.value = 1100
    crackGain = ctx.createGain()
    crackGain.gain.value = 0
    noiseLoop().connect(crackHP)
    crackHP.connect(crackGain)
    crackGain.connect(master)

    // --- cloth swish (she settles among the sacks) ---
    const clothBP = ctx.createBiquadFilter()
    clothBP.type = 'bandpass'
    clothBP.frequency.value = 1700
    clothBP.Q.value = 1
    clothGain = ctx.createGain()
    clothGain.gain.value = 0
    noiseLoop().connect(clothBP)
    clothBP.connect(clothGain)
    clothGain.connect(master)

    // --- pothole glint tick (a hole enters the light) ---
    glintOsc = ctx.createOscillator()
    glintOsc.type = 'sine'
    glintOsc.frequency.value = 1750
    glintGain = ctx.createGain()
    glintGain.gain.value = 0
    glintOsc.connect(glintGain)
    glintGain.connect(ambBus)
    glintOsc.start()

    // --- ox snort ---
    const snortBP = ctx.createBiquadFilter()
    snortBP.type = 'bandpass'
    snortBP.frequency.value = 290
    snortBP.Q.value = 1.6
    snortGain = ctx.createGain()
    snortGain.gain.value = 0
    noiseLoop().connect(snortBP)
    snortBP.connect(snortGain)
    snortGain.connect(master)

    // --- ox groan (exhaustion) ---
    groanOsc = ctx.createOscillator()
    groanOsc.type = 'sawtooth'
    groanOsc.frequency.value = 95
    const groanLP = ctx.createBiquadFilter()
    groanLP.type = 'lowpass'
    groanLP.frequency.value = 260
    groanGain = ctx.createGain()
    groanGain.gain.value = 0
    groanOsc.connect(groanLP)
    groanLP.connect(groanGain)
    groanGain.connect(master)
    groanOsc.start()

    // --- distant bell (midnight) ---
    bellA = ctx.createOscillator()
    bellA.type = 'sine'
    bellA.frequency.value = 196
    bellB = ctx.createOscillator()
    bellB.type = 'sine'
    bellB.frequency.value = 529 // inharmonic partial — reads as bronze
    bellGain = ctx.createGain()
    bellGain.gain.value = 0
    const bellLP = ctx.createBiquadFilter()
    bellLP.type = 'lowpass'
    bellLP.frequency.value = 1200
    bellA.connect(bellGain)
    bellB.connect(bellGain)
    bellGain.connect(bellLP)
    bellLP.connect(ambBus)
    bellA.start()
    bellB.start()

    // --- far dog ---
    dogOsc = ctx.createOscillator()
    dogOsc.type = 'sawtooth'
    dogOsc.frequency.value = 480
    const dogLP = ctx.createBiquadFilter()
    dogLP.type = 'lowpass'
    dogLP.frequency.value = 700
    dogGain = ctx.createGain()
    dogGain.gain.value = 0
    dogOsc.connect(dogLP)
    dogLP.connect(dogGain)
    dogGain.connect(ambBus)
    dogOsc.start()

    // --- owl (concón — soft double hoot) ---
    owlOsc = ctx.createOscillator()
    owlOsc.type = 'sine'
    owlOsc.frequency.value = 360
    owlGain = ctx.createGain()
    owlGain.gain.value = 0
    owlOsc.connect(owlGain)
    owlGain.connect(ambBus)
    owlOsc.start()

    // --- night seabird (FM chirp, rare) ---
    birdOsc = ctx.createOscillator()
    birdOsc.type = 'sine'
    birdOsc.frequency.value = 1400
    const birdMod = ctx.createOscillator()
    birdMod.type = 'sine'
    birdMod.frequency.value = 24
    const birdModG = ctx.createGain()
    birdModG.gain.value = 120
    birdMod.connect(birdModG)
    birdModG.connect(birdOsc.frequency)
    birdGain = ctx.createGain()
    birdGain.gain.value = 0
    birdOsc.connect(birdGain)
    birdGain.connect(ambBus)
    birdOsc.start()
    birdMod.start()

    // --- a bigger wave breaking below ---
    const waveLP = ctx.createBiquadFilter()
    waveLP.type = 'lowpass'
    waveLP.frequency.value = 300
    waveGain = ctx.createGain()
    waveGain.gain.value = 0
    noiseLoop().connect(waveLP)
    waveLP.connect(waveGain)
    waveGain.connect(ambBus)

    // --- narrator voice bus: clips -> voiceGain -> master (M mutes it) ---
    voiceGain = ctx.createGain()
    voiceGain.gain.value = 0.85
    voiceGain.connect(master)

    // --- music bed bus: rides the ambience bus so it ducks under the voice
    // and mutes with M; faded in once the loop decodes, eased out at the end
    musicGain = ctx.createGain()
    musicGain.gain.value = 0
    musicGain.connect(ambBus)

    ready = true
    loadVoices() // only ever after the user gesture — never on page load
    loadMusic() // ditto — and every failure path is a silent no-op
  }

  // ---------- looping music bed ----------
  function loadMusic() {
    try {
      fetch('../assets/music/viuda.mp3')
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
          s.loop = true
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

  // ---------- narrator voice (every failure is a silent no-op) ----------
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
      setDuck(0.4) // the night steps back while the old man speaks
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
    const names = ['begin', 'win', 'lose', 'presence']
    for (let i = 0; i < names.length; i++) {
      const n = names[i]
      try {
        fetch('../assets/voice/viuda/' + n + '.mp3')
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
            // a line requested before its fetch settled — honor it
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

  // ---------- ambient one-shots (scheduler-driven) ----------
  function dog() {
    const t = ctx.currentTime
    dogOsc.frequency.setValueAtTime(430 + Math.random() * 120, t)
    tap(dogGain, t, 0.012, 0.015, 0.05)
    tap(dogGain, t + 0.32, 0.01, 0.015, 0.06)
  }
  function owl() {
    const t = ctx.currentTime
    owlOsc.frequency.setValueAtTime(330 + Math.random() * 60, t)
    owlOsc.frequency.linearRampToValueAtTime(300, t + 0.35)
    tap(owlGain, t, 0.016, 0.06, 0.12)
    tap(owlGain, t + 0.55, 0.013, 0.06, 0.16)
  }
  function seabird() {
    const t = ctx.currentTime
    birdOsc.frequency.setValueAtTime(1250 + Math.random() * 400, t)
    tap(birdGain, t, 0.01, 0.02, 0.06)
    tap(birdGain, t + 0.24, 0.008, 0.02, 0.07)
  }
  function wave() {
    const t = ctx.currentTime
    tap(waveGain, t, 0.05, 0.5, 0.8)
  }
  function woodGroan() {
    const t = ctx.currentTime
    creakOsc.frequency.setValueAtTime(90 + Math.random() * 40, t)
    creakOsc.frequency.linearRampToValueAtTime(55 + Math.random() * 20, t + 0.9)
    creakBP.frequency.setValueAtTime(300 + Math.random() * 120, t)
    tap(creakGain, t, 0.014, 0.16, 0.3)
  }

  function setMuted(m) {
    muted = m
    if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05)
  }

  // dt-driven beds: speed 0..1, gutter 0..1 (her flicker × flame), pres 0..1
  // (her closeness), dread 0..1 (boardings), pulse 0..1 (fresh boarding)
  function update(dt, speed, gutter, pres, dread, pulse) {
    if (!ready) return
    const t = ctx.currentTime
    // crickets
    cricketT -= dt
    if (cricketT <= 0) {
      cricketT = 1.6 + Math.random() * 3.4
      let at = 0
      const n = 3 + ((Math.random() * 3) | 0)
      for (let i = 0; i < n; i++) {
        tap(cricketGain, t + at, 0.008, 0.012, 0.04)
        at += 0.08 + Math.random() * 0.1
      }
    }
    // wheel rumble follows the speed
    const rum = speed * 0.055
    if (Math.abs(rum - lastRumble) > 0.003) {
      lastRumble = rum
      rumbleGain.gain.setTargetAtTime(rum, t, 0.25)
    }
    // lantern gutter-flutter
    const gut = clamp01(gutter)
    if (Math.abs(gut - lastGutter) > 0.02) {
      lastGutter = gut
      gutterGain.gain.setTargetAtTime(gut * 0.007, t, 0.1)
      gutterMod.gain.setTargetAtTime(gut * 0.005, t, 0.1)
    }
    // her presence drone
    const pr = clamp01(pres)
    if (Math.abs(pr - lastPres) > 0.02) {
      lastPres = pr
      presGain.gain.setTargetAtTime(pr * 0.04, t, 0.25)
      presOscA.frequency.setTargetAtTime(106 - pr * 14, t, 0.4)
      presOscB.frequency.setTargetAtTime(107.6 - pr * 13, t, 0.4)
    }
    // dread layer (persists per boarding)
    const dr = clamp01(dread)
    if (Math.abs(dr - lastDread) > 0.01) {
      lastDread = dr
      dreadGain.gain.setTargetAtTime(dr * 0.05, t, 0.6)
    }
    // heartbeat — while she watches, or just after she sat down
    const hb = Math.max(pr, clamp01(pulse))
    if (hb > 0.15) {
      heartT -= dt
      if (heartT <= 0) {
        heartT = 1.25 - 0.55 * hb
        tap(heartGain, t, 0.05 + hb * 0.06, 0.012, 0.05)
        tap(heartGain, t + 0.16, 0.03 + hb * 0.04, 0.012, 0.06)
      }
    } else {
      heartT = 0
    }
    // glint rate limit
    if (glintHold > 0) glintHold -= dt
    // ambient one-shot scheduler — a stray night sound every 9-24 s
    ambNext -= dt
    if (ambNext <= 0) {
      ambNext = 9 + Math.random() * 15
      const r = Math.random()
      if (r < 0.28) wave()
      else if (r < 0.46) dog()
      else if (r < 0.68) owl()
      else if (r < 0.86) woodGroan()
      else seabird()
    }
  }

  // ---------- interactions ----------
  function clop(trot) {
    if (!ready) return
    const t = ctx.currentTime
    clopAlt = !clopAlt
    clopBP.frequency.setValueAtTime((clopAlt ? 680 : 840) + Math.random() * 120, t)
    tap(clopGain, t, trot ? 0.05 : 0.034, 0.006, 0.028)
    tap(thumpGain, t, trot ? 0.03 : 0.018, 0.008, 0.03)
  }
  function lever(n) {
    if (!ready) return
    const t = ctx.currentTime
    tap(levNoiseGain, t, 0.05, 0.008, 0.04)
    levOsc.frequency.setValueAtTime(110 + n * 45, t)
    tap(levGain, t, 0.04, 0.01, 0.06)
  }
  function creak() {
    if (!ready) return
    const t = ctx.currentTime
    creakOsc.frequency.setValueAtTime(120 + Math.random() * 60, t)
    creakOsc.frequency.linearRampToValueAtTime(70 + Math.random() * 25, t + 0.5)
    creakBP.frequency.setValueAtTime(380 + Math.random() * 180, t)
    creakBP.frequency.linearRampToValueAtTime(240, t + 0.5)
    tap(creakGain, t, 0.014, 0.09, 0.18)
  }
  function pourSet(on) {
    if (!ready) return
    pourGain.gain.setTargetAtTime(on ? 0.022 : 0, ctx.currentTime, on ? 0.15 : 0.08)
  }
  function pourGlug() {
    if (!ready) return
    const t = ctx.currentTime
    glugOsc.frequency.setValueAtTime(240 + Math.random() * 100, t)
    glugOsc.frequency.exponentialRampToValueAtTime(420 + Math.random() * 160, t + 0.07)
    tap(glugGain, t, 0.025, 0.008, 0.03)
  }
  function refillDone() {
    if (!ready) return
    const t = ctx.currentTime
    chimeA.frequency.setValueAtTime(659, t)
    chimeB.frequency.setValueAtTime(988, t)
    tap(chimeGain, t, 0.045, 0.012, 0.25)
    tap(chimeGain, t + 0.14, 0.03, 0.012, 0.3)
  }
  function glint() {
    if (!ready || glintHold > 0) return
    glintHold = 0.9 + Math.random() * 0.4
    const t = ctx.currentTime
    glintOsc.frequency.setValueAtTime(1650 + Math.random() * 250, t)
    tap(glintGain, t, 0.011, 0.01, 0.08)
  }
  function pothole(hard) {
    if (!ready) return
    const t = ctx.currentTime
    thumpOsc.frequency.setValueAtTime(hard ? 64 : 52, t)
    thumpOsc.frequency.exponentialRampToValueAtTime(36, t + 0.3)
    tap(thumpGain, t, hard ? 0.16 : 0.08, 0.01, 0.12)
    if (hard) {
      tap(crackGain, t, 0.12, 0.004, 0.05)
      tap(crackGain, t + 0.07, 0.06, 0.004, 0.07)
    }
  }
  function boardThud() {
    if (!ready) return
    const t = ctx.currentTime
    thumpOsc.frequency.setValueAtTime(52, t)
    thumpOsc.frequency.exponentialRampToValueAtTime(28, t + 0.6)
    tap(thumpGain, t, 0.15, 0.015, 0.25)
    tap(clothGain, t + 0.05, 0.04, 0.04, 0.12)
    // a sour minor-second shimmer, very quiet — wrongness made audible
    chimeA.frequency.setValueAtTime(622, t + 0.1)
    chimeB.frequency.setValueAtTime(587, t + 0.1)
    tap(chimeGain, t + 0.1, 0.022, 0.02, 0.3)
  }
  function passRelief() {
    if (!ready) return
    const t = ctx.currentTime
    chimeA.frequency.setValueAtTime(784, t)
    chimeB.frequency.setValueAtTime(0.0001 + 784, t) // unison, soft
    tap(chimeGain, t, 0.02, 0.03, 0.3)
    chimeA.frequency.setValueAtTime(659, t + 0.3)
    chimeB.frequency.setValueAtTime(659, t + 0.3)
    tap(chimeGain, t + 0.3, 0.016, 0.03, 0.4)
  }
  function exhausted() {
    if (!ready) return
    const t = ctx.currentTime
    groanOsc.frequency.setValueAtTime(95, t)
    groanOsc.frequency.linearRampToValueAtTime(58, t + 0.8)
    tap(groanGain, t, 0.05, 0.08, 0.3)
    tap(snortGain, t + 0.9, 0.05, 0.03, 0.1)
  }
  function snort() {
    if (!ready) return
    const t = ctx.currentTime
    tap(snortGain, t, 0.045, 0.02, 0.07)
    tap(snortGain, t + 0.18, 0.03, 0.02, 0.08)
  }
  function midnight() {
    if (!ready) return
    const t = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      tap(bellGain, t + i * 1.7, 0.07, 0.01, 0.55)
    }
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
    thumpOsc.frequency.exponentialRampToValueAtTime(28, t + 1.2)
    tap(thumpGain, t, 0.18, 0.02, 0.45)
  }

  return {
    unlock,
    setMuted,
    isMuted: () => muted,
    update,
    clop,
    lever,
    creak,
    pourSet,
    pourGlug,
    refillDone,
    glint,
    pothole,
    boardThud,
    passRelief,
    exhausted,
    snort,
    midnight,
    voice,
    win,
    lose,
    state: () => ({ unlocked: ready, muted, contextState: ctx ? ctx.state : 'none' }),
  }
}
