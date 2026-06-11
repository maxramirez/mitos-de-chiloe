/* ============================================================
   EL VUELO DEL BRUJO — procedural WebAudio.
   Lazy AudioContext: created only inside unlock() (Begin click),
   so there are zero autoplay-policy errors. Every method is a
   safe no-op before unlock. M toggles mute.
   Layers: wind (pitches with speed) · ring chime · gust whoosh ·
   crash thud/splash · heartbeat near moonset · win/lose stingers.
   ============================================================ */

export function createAudio() {
  let ctx = null
  let master = null
  let muted = false
  let noiseBuf = null

  /* persistent wind nodes */
  let windSrc = null
  let windFilter = null
  let windGain = null

  /* heartbeat state */
  let hbTimer = 0

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
      windGain.connect(master)
      windSrc.start()
    } catch (e) {
      ctx = null
    }
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

  /* win: warm resolved chord; lose: hollow falling cluster */
  function ending(won) {
    if (!ctx) return
    const t = ctx.currentTime
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
    get state() {
      return { unlocked: !!ctx, muted, contextState: ctx ? ctx.state : 'none' }
    },
  }
}
