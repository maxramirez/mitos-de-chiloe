// audio.js — EL BASILISCO · procedural WebAudio beds + optional voice clips.
// Lazy AudioContext created on unlock() (the BEGIN click) so there are zero
// autoplay-policy errors. Every call is a safe no-op before unlock. M mutes.
// Beds: rain noise + dark sea swell + a tension drone that rises while the
// basilisco is above the floor. One-shot sfx for every interaction.
// Voice clips (public/assets/voice/basilisco/) are fetched after unlock and
// decoded into buffers; missing files are a silent no-op. While a voice line
// plays, the ambience bus ducks to ~40% and eases back.

const VOICE_FILES = {
  intro: 'intro.mp3',
  win: 'win.mp3',
  'lose-sleepers': 'lose-sleepers.mp3',
  'lose-dawn': 'lose-dawn.mp3',
  dark: 'dark.mp3',
}

export function createAudio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null

  let ctx = null
  let ready = false
  let muted = false
  let master = null
  let ambBus = null // beds + ambient one-shots; ducked under voice clips
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
  let voiceGain = null
  let dripEcho = null
  const voiceBufs = {}
  let voicePending = null
  let voicesFetched = false
  let ambShotTimer = 6 // first ambient one-shot a few seconds in
  let musicGain = null
  let musicFetched = false
  let musicEnded = false
  let lastMusic = -1
  const MUSIC_LVL = 0.22 // sits under the rain/sea beds; lowpassed so the drone keeps the top

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
    src.connect(f).connect(g).connect(ambBus)
    src.start()
    return g
  }

  function unlock() {
    if (!AC) return
    if (ready) {
      // re-entrant: a load-time attempt may have left the context suspended;
      // a later real gesture (any tap, or BEGIN) lands here and resumes it
      try {
        if (ctx && ctx.state === 'suspended') {
          const p = ctx.resume()
          if (p && p.catch) p.catch(() => {})
        }
      } catch (e) { /* ignore */ }
      return
    }
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.32
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp).connect(ctx.destination)
      ambBus = ctx.createGain()
      ambBus.gain.value = 1
      ambBus.connect(master)
      voiceGain = ctx.createGain()
      voiceGain.gain.value = 0.8
      voiceGain.connect(master)
      // music bed: pre-rendered seam-crossfaded loop, lowpassed at 2.4 kHz so
      // the rain hiss and brazier crackle keep the air; it lives on ambBus so
      // it ducks under voice clips along with the rest of the ambience
      musicGain = ctx.createGain()
      musicGain.gain.value = 0
      const mlp = ctx.createBiquadFilter()
      mlp.type = 'lowpass'
      mlp.frequency.value = 2400
      musicGain.connect(mlp).connect(ambBus)
      // shared echo tail for water drips under the stilts
      dripEcho = ctx.createGain()
      dripEcho.gain.value = 1
      const dly = ctx.createDelay(0.6)
      dly.delayTime.value = 0.26
      const fb = ctx.createGain()
      fb.gain.value = 0.32
      const dlp = ctx.createBiquadFilter()
      dlp.type = 'lowpass'
      dlp.frequency.value = 1600
      dripEcho.connect(ambBus)
      dripEcho.connect(dly)
      dly.connect(dlp).connect(fb).connect(dly)
      fb.connect(ambBus)
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
      seaGain.connect(ambBus)
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
      tensionOsc.connect(tf).connect(tensionGain).connect(ambBus)
      tensionOsc.start()
      if (ctx.state === 'suspended') ctx.resume()
      ready = true
      loadVoices()
      loadMusic()
    } catch (e) {
      ctx = null
      ready = false
    }
  }

  // --- voices ---------------------------------------------------------------
  function loadVoices() {
    if (voicesFetched || !ready) return
    voicesFetched = true
    for (const name of Object.keys(VOICE_FILES)) {
      try {
        fetch('../assets/voice/basilisco/' + VOICE_FILES[name])
          .then((r) => { if (!r.ok) throw new Error('http'); return r.arrayBuffer() })
          .then((ab) => ctx.decodeAudioData(ab))
          .then((buf) => {
            voiceBufs[name] = buf
            if (voicePending === name) { voicePending = null; startVoice(name) }
          })
          .catch(() => {})
      } catch (e) { /* silent — game is identical without voices */ }
    }
  }

  // --- music bed -------------------------------------------------------------
  function loadMusic() {
    if (musicFetched || !ready) return
    musicFetched = true
    try {
      fetch('../assets/music/basilisco.mp3')
        .then((r) => { if (!r.ok) throw new Error('http'); return r.arrayBuffer() })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          if (musicEnded) return // night already over before the decode landed
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.loop = true // the seam is pre-crossfaded
          src.connect(musicGain)
          src.start()
          musicGain.gain.setTargetAtTime(MUSIC_LVL, ctx.currentTime, 1.2)
        })
        .catch(() => {})
    } catch (e) { /* silent — game is identical without the bed */ }
  }

  // win/lose: ease the bed out so the end stingers and the voice sit on top
  function endNight() {
    musicEnded = true
    if (ready && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.7)
  }

  function startVoice(name) {
    try {
      const buf = voiceBufs[name]
      if (!buf) return
      const t = ctx.currentTime
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(voiceGain)
      // duck ambience to ~40% under the voice, ease back after it ends
      ambBus.gain.setTargetAtTime(0.4, t, 0.18)
      ambBus.gain.setTargetAtTime(1, t + buf.duration + 0.2, 0.6)
      src.start(t)
    } catch (e) { /* no-op */ }
  }

  function playVoice(name) {
    if (!ready || !VOICE_FILES[name]) return
    if (voiceBufs[name]) startVoice(name)
    else voicePending = name // plays the moment its decode lands (or never — fine)
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
    // the bed leans back when the basilisco is up so the tension drone reads
    if (!musicEnded) {
      const mt = MUSIC_LVL * (1 - tension * 0.35)
      if (Math.abs(mt - lastMusic) > 0.004) {
        musicGain.gain.setTargetAtTime(mt, t, 0.8)
        lastMusic = mt
      }
    }
    // sparse brazier pops
    crackleTimer -= dt
    if (crackleTimer <= 0 && brazier > 0.05) {
      crackleTimer = 0.15 + Math.random() * 0.6
      blip(2400 + Math.random() * 2000, 0.012 * brazier, 0.02, 'square')
    }
    // ambient one-shots: the palafito lives — creaks, drips, gusts, a far bird
    ambShotTimer -= dt
    if (ambShotTimer <= 0) {
      ambShotTimer = 8 + Math.random() * 17
      const r = Math.random()
      if (r < 0.34) sfx.creakWood()
      else if (r < 0.62) sfx.drip()
      else if (r < 0.88) sfx.gust()
      else sfx.nightBird() // rare
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

  // --- new ambient one-shots (all into ambBus so voices duck them) ----------
  // filtered noise with a falling bandpass — old timber giving a little
  function creakBurst(f0, f1, vol, dur) {
    if (!ready) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 9
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(ambBus)
    src.start(t, Math.random() * 1.5, dur + 0.05)
  }

  // single sine drop into the shared echo — water under the stilts
  function dripBlip(vol) {
    if (!ready) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1250 + Math.random() * 350, t)
    o.frequency.exponentialRampToValueAtTime(420, t + 0.06)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(g).connect(dripEcho)
    o.start(t)
    o.stop(t + 0.15)
  }

  // FM chirp — a far-off night bird out in the rain
  function birdChirp(at, base) {
    const t = ctx.currentTime + at
    const car = ctx.createOscillator()
    car.type = 'sine'
    car.frequency.value = base
    const mod = ctx.createOscillator()
    mod.type = 'sine'
    mod.frequency.value = 28 + Math.random() * 14
    const modG = ctx.createGain()
    modG.gain.value = base * 0.22
    mod.connect(modG).connect(car.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.016, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    car.connect(g).connect(ambBus)
    car.start(t)
    mod.start(t)
    car.stop(t + 0.26)
    mod.stop(t + 0.26)
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
    // --- new world sounds ---------------------------------------------------
    creakWood() {
      // old palafito timbers: slow falling groan + a low settle underneath
      creakBurst(700 + Math.random() * 300, 160, 0.035, 0.7 + Math.random() * 0.5)
      blip(70 + Math.random() * 20, 0.025, 0.6, 'triangle', 48)
    },
    drip() {
      dripBlip(0.028)
      if (Math.random() < 0.4) setTimeout(() => dripBlip(0.018), 300 + Math.random() * 400)
    },
    gust() {
      if (!ready) return
      // wind leaning on the shingles: a noise swell that breathes in and out
      const t = ctx.currentTime
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.Q.value = 0.7
      f.frequency.setValueAtTime(380, t)
      f.frequency.linearRampToValueAtTime(700 + Math.random() * 300, t + 1.1)
      f.frequency.linearRampToValueAtTime(320, t + 2.4)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.015, t + 1.0)
      g.gain.linearRampToValueAtTime(0.0001, t + 2.5)
      src.connect(f).connect(g).connect(ambBus)
      src.start(t, Math.random() * 1.5)
      src.stop(t + 2.6)
    },
    nightBird() {
      if (!ready) return
      const base = 1500 + Math.random() * 500
      birdChirp(0, base)
      birdChirp(0.3 + Math.random() * 0.15, base * 1.12)
      if (Math.random() < 0.5) birdChirp(0.7 + Math.random() * 0.2, base * 0.94)
    },
    stepCreak() {
      // a floorboard answering a footstep — short, quiet, varied
      creakBurst(500 + Math.random() * 500, 220, 0.018, 0.16 + Math.random() * 0.1)
    },
    hudTick() { blip(1300, 0.015, 0.03, 'triangle', 900) }, // inventory count change
  }

  return {
    unlock,
    toggleMute,
    update,
    sfx,
    playVoice,
    endNight,
    get state() { return { ready, muted, running: !!(ctx && ctx.state === 'running') } },
  }
}
