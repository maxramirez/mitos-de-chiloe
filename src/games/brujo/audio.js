/* ============================================================
   EL VUELO DEL BRUJO — procedural WebAudio.
   Lazy AudioContext: created only inside unlock() (Begin click),
   so there are zero autoplay-policy errors. Every method is a
   safe no-op before unlock. M toggles mute.
   Layers: wind (pitches with speed) · ring chime · gust whoosh ·
   crash thud/splash · heartbeat near moonset · win/lose stingers ·
   night ambience one-shots (birds, water laps, far rumbles) ·
   macuñ wing-strain on boost · dry-flutter when wings dry ·
   whispered narrator clips (fetched after unlock, duck the bed) ·
   looping mp3 music bed (lowpassed, on bedBus: ducks with the
   ambience under voices, eases out under the end stingers).
   ============================================================ */

const VOICE_FILES = ['title', 'win', 'lose-torn', 'lose-moon', 'luna']
const MUSIC_VOL = 0.22

export function createAudio() {
  let ctx = null
  let master = null
  let muted = false
  let noiseBuf = null

  /* bed bus: ambience (wind + night one-shots) — voices duck this */
  let bedBus = null

  /* voices */
  let voiceGain = null
  const voiceBufs = {}
  let voicesLoading = false
  let pendingVoice = null
  let activeVoice = null

  /* music bed: looping mp3 on bedBus (ducks under voices with the wind) */
  let musicGain = null

  /* persistent wind nodes */
  let windSrc = null
  let windFilter = null
  let windGain = null

  /* heartbeat state */
  let hbTimer = 0

  /* ambient one-shot scheduler */
  let ambTimer = 9

  function unlock() {
    if (ctx) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.32
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp)
      comp.connect(ctx.destination)

      /* every ambience layer runs through bedBus so voices can duck it */
      bedBus = ctx.createGain()
      bedBus.gain.value = 1
      bedBus.connect(master)

      /* voices: dedicated gain into the master/mute chain (M mutes voices too) */
      voiceGain = ctx.createGain()
      voiceGain.gain.value = 0.8
      voiceGain.connect(master)

      /* one shared noise buffer */
      const len = ctx.sampleRate * 2
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

      /* wind: looped noise through a wandering bandpass */
      windSrc = ctx.createBufferSource()
      windSrc.buffer = noiseBuf
      windSrc.loop = true
      windFilter = ctx.createBiquadFilter()
      windFilter.type = 'bandpass'
      windFilter.frequency.value = 320
      windFilter.Q.value = 0.9
      windGain = ctx.createGain()
      windGain.gain.value = 0
      windSrc.connect(windFilter)
      windFilter.connect(windGain)
      windGain.connect(bedBus)
      windSrc.start()

      loadVoices()
      loadMusic()
    } catch (e) {
      ctx = null
    }
  }

  /* ---- music bed: ~50 s seam-crossfaded loop, fetched after the
     gesture unlock. Feeds bedBus so it ducks under the whispers with
     the rest of the night and obeys M/mute via master. Gently
     lowpassed so the ring chimes, wing sounds and end stingers
     (routed straight to master) always sit on top. Silent no-op on
     any fetch/decode failure. ---- */
  function loadMusic() {
    try {
      fetch('../assets/music/brujo.mp3')
        .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer() })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          if (!ctx || musicGain) return
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.loop = true /* seam is pre-crossfaded */
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 2600
          musicGain = ctx.createGain()
          musicGain.gain.value = 0.0001
          src.connect(lp).connect(musicGain).connect(bedBus)
          src.start()
          musicGain.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, 1.4) /* ease in with the night */
        })
        .catch(() => {})
    } catch (e) { /* no fetch: no bed */ }
  }

  /* ---- narrator voices: fetch + decode only after the gesture unlock.
     Any failure (offline, missing file, decode error) is swallowed —
     the game behaves identically without the clips. ---- */
  function loadVoices() {
    if (voicesLoading) return
    voicesLoading = true
    for (let i = 0; i < VOICE_FILES.length; i++) {
      const name = VOICE_FILES[i]
      try {
        fetch('../assets/voice/brujo/' + name + '.mp3')
          .then((r) => { if (!r.ok) throw new Error('http'); return r.arrayBuffer() })
          .then((ab) => ctx.decodeAudioData(ab))
          .then((buf) => {
            voiceBufs[name] = buf
            /* the title line is requested on BEGIN, before its decode lands */
            if (pendingVoice && pendingVoice.name === name &&
                performance.now() - pendingVoice.at < 8000) {
              pendingVoice = null
              voice(name)
            }
          })
          .catch(() => {})
      } catch (e) { /* silent no-op */ }
    }
  }

  function voice(name) {
    if (!ctx) return
    try {
      const buf = voiceBufs[name]
      if (!buf) {
        pendingVoice = { name, at: performance.now() }
        return
      }
      const t = ctx.currentTime
      if (activeVoice) {
        try { activeVoice.onended = null; activeVoice.stop() } catch (e) { /* already done */ }
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(voiceGain)
      activeVoice = s
      /* duck the ambience bed under the whisper, ease back after */
      bedBus.gain.setTargetAtTime(0.4, t, 0.2)
      s.onended = () => {
        if (activeVoice === s) {
          activeVoice = null
          bedBus.gain.setTargetAtTime(1, ctx.currentTime, 0.5)
        }
      }
      s.start(t)
    } catch (e) { /* silent no-op */ }
  }

  function toggleMute() {
    muted = !muted
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.32, ctx.currentTime, 0.05)
    return muted
  }

  /* speedNorm 0..1, wet: wings soaked, moonFrac: remaining night 0..1 */
  function update(dt, speedNorm, wet, moonFrac, playing) {
    if (!ctx) return
    const t = ctx.currentTime
    const target = playing ? 0.05 + speedNorm * 0.16 : 0
    windGain.gain.setTargetAtTime(target * (wet ? 0.55 : 1), t, 0.2)
    windFilter.frequency.setTargetAtTime(220 + speedNorm * 760 + (wet ? -80 : 0), t, 0.25)

    /* heartbeat as the moon nears the horizon */
    if (playing && moonFrac < 0.2 && moonFrac > 0) {
      hbTimer -= dt
      if (hbTimer <= 0) {
        const urgency = 1 - moonFrac / 0.2
        hbTimer = 60 / (52 + urgency * 58)
        thump(0.1 + urgency * 0.12)
      }
    }

    /* night ambience one-shots on a randomized 8-25 s scheduler */
    if (playing) {
      ambTimer -= dt
      if (ambTimer <= 0) {
        ambTimer = 8 + Math.random() * 17
        const roll = Math.random()
        if (roll < 0.4) waterLap()
        else if (roll < 0.75) nightBird()
        else distantRumble()
      }
    }
  }

  /* ---- night ambience one-shots (all into bedBus, so voices duck them) ---- */

  /* distant night bird: 2-3 tiny FM down-chirps, lowpassed far away */
  function nightBird() {
    if (!ctx) return
    const t0 = ctx.currentTime
    const n = 2 + (Math.random() * 2 | 0)
    const base = 1350 + Math.random() * 500
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2400
    lp.connect(bedBus)
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.22 + Math.random() * 0.08)
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.08), t)
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.14)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.028, t + 0.025)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
      o.connect(g)
      g.connect(lp)
      o.start(t)
      o.stop(t + 0.2)
    }
  }

  /* water lap from the channel below: soft low noise swell */
  function waterLap() {
    if (!ctx || !noiseBuf) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 0.8
    f.frequency.setValueAtTime(520, t)
    f.frequency.exponentialRampToValueAtTime(240, t + 1.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    src.connect(f)
    f.connect(g)
    g.connect(bedBus)
    src.start(t)
    src.stop(t + 1.8)
  }

  /* far ground rumble rolling across the channel: sub sine + dark noise */
  function distantRumble() {
    if (!ctx || !noiseBuf) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(46 + Math.random() * 10, t)
    o.frequency.exponentialRampToValueAtTime(33, t + 2.4)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.055, t + 0.45)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
    o.connect(og)
    og.connect(bedBus)
    o.start(t)
    o.stop(t + 2.8)
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 130
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    src.connect(f)
    f.connect(g)
    g.connect(bedBus)
    src.start(t)
    src.stop(t + 2.6)
  }

  /* macuñ wing-strain when boost engages: leather creak, pitch dropping */
  function wingStrain() {
    if (!ctx || !noiseBuf) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 5
    f.frequency.setValueAtTime(880, t)
    f.frequency.exponentialRampToValueAtTime(290, t + 0.28)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + 0.4)
  }

  /* wings shake dry: 3-4 quick high noise flutters */
  function dryFlutter() {
    if (!ctx || !noiseBuf) return
    const t0 = ctx.currentTime
    const n = 3 + (Math.random() * 2 | 0)
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 1200
    f.connect(master)
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.07
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      src.loop = true
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
      src.connect(g)
      g.connect(f)
      src.start(t)
      src.stop(t + 0.08)
    }
  }

  function thump(vol) {
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(58, t)
    o.frequency.exponentialRampToValueAtTime(34, t + 0.16)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    o.connect(g)
    g.connect(master)
    o.start(t)
    o.stop(t + 0.25)
  }

  /* deep chime per ring — two detuned sines + soft partial */
  function chime(n) {
    if (!ctx) return
    const t = ctx.currentTime
    const base = 196 * Math.pow(2, (n % 4) * 3 / 12) /* G3, rising motif */
    for (const [mult, vol, dur] of [[1, 0.22, 2.6], [2.01, 0.08, 1.8], [2.99, 0.04, 1.2]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = base * mult
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(master)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }

  /* rising whoosh — gust telegraph */
  function whoosh() {
    if (!ctx || !noiseBuf) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.6
    f.frequency.setValueAtTime(180, t)
    f.frequency.exponentialRampToValueAtTime(1400, t + 1.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.26, t + 1.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + 3.4)
  }

  /* crash: thud + watery noise splash */
  function crash() {
    if (!ctx || !noiseBuf) return
    const t = ctx.currentTime
    thump(0.4)
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(2200, t)
    f.frequency.exponentialRampToValueAtTime(220, t + 0.7)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
    src.connect(f)
    f.connect(g)
    g.connect(master)
    src.start(t)
    src.stop(t + 0.9)
  }

  /* win: warm resolved chord; lose: hollow falling cluster.
     The music bed eases out underneath — the stingers stay on top. */
  function ending(won) {
    if (!ctx) return
    const t = ctx.currentTime
    if (musicGain) {
      try { musicGain.gain.setTargetAtTime(0.0001, t, 0.7) } catch (e) { /* ignore */ }
    }
    const freqs = won ? [196, 247, 294, 392] : [196, 233, 277, 185]
    freqs.forEach((fq, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = fq
      if (!won) o.frequency.exponentialRampToValueAtTime(fq * 0.94, t + 3)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.1)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4)
      o.connect(g)
      g.connect(master)
      o.start(t + i * 0.18)
      o.stop(t + 4.2)
    })
  }

  return {
    unlock,
    toggleMute,
    update,
    chime,
    whoosh,
    crash,
    ending,
    voice,
    wingStrain,
    dryFlutter,
    get state() {
      return { unlocked: !!ctx, muted, contextState: ctx ? ctx.state : 'none' }
    },
  }
}
