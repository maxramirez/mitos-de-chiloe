// level.js — LA FIURA · El pantanal
// One handcrafted ~220 m left-to-right swamp gauntlet. All coordinates in
// meters, y-up, water surface at WATER_Y. Platform types:
//   'ground'  solid island (full AABB: top + sides), body extends to y -3
//   'log'     thin fallen log, one-way landing from above
//   'sink'    log that slowly sinks while stood on (bubbles telegraph)
//   'tussock' small bouncy grass mound, one-way, bounces on landing

export const LEVEL_END = 224
export const WATER_Y = -0.45
export const DROWN_Y = -0.85

// { x: left edge, w: width, y: top surface, t: type }
export const PLATFORMS = [
  { x: 0.0, w: 14.0, y: 0.0, t: 'ground' }, // spawn island
  { x: 16.5, w: 9.5, y: 0.0, t: 'ground' },
  { x: 17.3, w: 1.1, y: 0.45, t: 'tussock' }, // boost to herb 1 branch
  { x: 19.4, w: 2.4, y: 2.2, t: 'log' }, // herb 1 branch
  { x: 29.0, w: 2.5, y: 0.2, t: 'log' },
  { x: 34.0, w: 2.5, y: 0.2, t: 'sink' }, // first sinking log
  { x: 39.0, w: 9.0, y: 0.0, t: 'ground' }, // lantern 1 island
  { x: 50.0, w: 6.0, y: 0.0, t: 'ground' }, // AMBUSH 1 island
  { x: 58.5, w: 7.5, y: 0.0, t: 'ground' },
  { x: 59.4, w: 1.1, y: 0.4, t: 'tussock' },
  { x: 61.0, w: 2.6, y: 2.0, t: 'log' }, // herb 2 branch
  { x: 68.5, w: 2.5, y: 0.15, t: 'sink' },
  { x: 73.5, w: 2.5, y: 0.3, t: 'sink' },
  { x: 78.3, w: 1.3, y: 0.2, t: 'tussock' }, // bounce the wide gap
  { x: 83.0, w: 9.0, y: 0.0, t: 'ground' }, // lantern 2 island
  { x: 84.0, w: 1.1, y: 0.4, t: 'tussock' },
  { x: 86.2, w: 2.4, y: 1.8, t: 'log' },
  { x: 89.4, w: 2.4, y: 3.0, t: 'log' }, // herb 3 high branch
  { x: 95.0, w: 2.2, y: 0.2, t: 'log' },
  { x: 100.0, w: 2.2, y: 0.45, t: 'log' },
  { x: 105.2, w: 6.8, y: 0.0, t: 'ground' },
  { x: 113.5, w: 5.5, y: 0.3, t: 'log' }, // AMBUSH 2 — her log, gaps both sides
  { x: 121.5, w: 7.5, y: 0.0, t: 'ground' },
  { x: 122.6, w: 1.1, y: 0.35, t: 'tussock' },
  { x: 124.6, w: 2.4, y: 1.9, t: 'log' }, // herb 4 branch
  { x: 131.5, w: 2.5, y: 0.2, t: 'sink' },
  { x: 136.5, w: 2.5, y: 0.2, t: 'sink' },
  { x: 141.3, w: 1.3, y: 0.2, t: 'tussock' },
  { x: 145.0, w: 7.0, y: 0.0, t: 'ground' }, // lantern 3 island
  { x: 154.5, w: 2.5, y: 0.2, t: 'sink' }, // AMBUSH 3 — sink logs under her stump
  { x: 157.4, w: 1.2, y: 0.8, t: 'ground' }, // her stump pillar
  { x: 159.6, w: 2.5, y: 0.2, t: 'sink' },
  { x: 164.0, w: 6.5, y: 0.0, t: 'ground' },
  { x: 164.8, w: 1.1, y: 0.4, t: 'tussock' },
  { x: 166.6, w: 2.3, y: 2.1, t: 'log' },
  { x: 169.4, w: 2.3, y: 3.2, t: 'log' }, // herb 5 highest branch
  { x: 173.5, w: 2.5, y: 0.3, t: 'log' },
  { x: 178.7, w: 1.3, y: 0.25, t: 'tussock' }, // bounce the widest gap
  { x: 184.0, w: 11.0, y: 0.0, t: 'ground' },
  { x: 198.0, w: 26.0, y: 0.0, t: 'ground' }, // final island — the machi's hut
]

// hierbas del machi — glowing herbs on the side branches
export const HERBS = [
  { x: 20.6, y: 2.7 },
  { x: 62.3, y: 2.5 },
  { x: 90.6, y: 3.5 },
  { x: 125.8, y: 2.4 },
  { x: 170.5, y: 3.7 },
]
export const HERB_TOTAL = 5

// checkpoint lanterns (spawn point is checkpoint 0 at x=2)
export const CHECKPOINTS = [
  { x: 2.0, y: 0.0 }, // spawn
  { x: 41.0, y: 0.0 },
  { x: 85.0, y: 0.0 },
  { x: 147.0, y: 0.0 },
]

// la Fiura's three fixed ambush perches. y = surface she sits on, seat =
// height of her stump/log seat above that surface (pulse origin = y + seat
// + 0.4, her chest). phase offsets desync the three pulse rhythms.
export const AMBUSHES = [
  { x: 52.6, y: 0.0, seat: 0.55, phase: 0.0 },
  { x: 116.2, y: 0.3, seat: 0.12, phase: 0.9 },
  { x: 158.0, y: 0.8, seat: 0.12, phase: 1.7 },
]

export const PULSE_PERIOD = 2.4 // s between charm pulses
export const PULSE_TELEGRAPH = 1.0 // s of inhaling glow before each pulse
export const PULSE_SPEED = 7.0 // m/s ring expansion
export const PULSE_MAX_R = 6.6 // m ring dies here
export const PULSE_BAND = 0.5 // m — inside the passing ring = charmed
export const AMBUSH_RANGE = 22 // m — she only pulses when you are this close

export const HUT_X = 212 // the machi's hut door
export const HUT_RADIUS = 1.5

export const SPAWN = { x: 2.0, y: 0.0 }
