// CALEUCHE · dread — one scalar (0..1) that drives the lantern, the audio
// layers, and the fx pass. Rises near the unmet and the stalking; decays
// when the night is merely dark.
export function createDread() {
  let value = 0.12

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

  return {
    get value() {
      return value
    },
    set value(v) {
      value = clamp01(v)
    },
    spike(amount) {
      value = clamp01(value + amount)
    },
    relieve(amount) {
      value = clamp01(value - amount)
    },
    // ctx: { stalker: null|'hidden'|'lurk'|'stalk'|'rush', stalkerDist, nearestDist }
    update(dt, ctx) {
      let rate = -0.018 // calm: dread seeps away slowly
      if (ctx.nearestDist < 22) rate += 0.035 // something close, not yet met
      if (ctx.stalker === 'lurk') rate += 0.02
      else if (ctx.stalker === 'stalk') rate += 0.045
      else if (ctx.stalker === 'rush') rate += 0.3
      if (ctx.stalker === 'stalk' || ctx.stalker === 'rush') {
        const d = ctx.stalkerDist == null ? 80 : ctx.stalkerDist
        rate += Math.max(0, (50 - d) / 50) * 0.05
      }
      value = clamp01(value + rate * dt)
    },
  }
}
