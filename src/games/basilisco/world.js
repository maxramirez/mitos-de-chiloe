// world.js — EL BASILISCO · static layout of the palafito + geometry helpers.
// Logical canvas is 960×600. The house interior is HOUSE; 4 rooms in a 2×2
// grid split at MIDX/MIDY with 4 door gaps. All helpers are allocation-free
// where they run per-frame (collideCircle writes into a shared out object).

export const W = 960
export const H = 600

// shared gameplay timings (sim drives them; renderer scales meters by them)
export const DRINK_TIME = 8
export const PRY_TIME = 3
export const STUN_TIME = 4
export const HOUSE = { x0: 140, y0: 80, x1: 820, y1: 520 }
export const MIDX = 480
export const MIDY = 300

// inner wall pieces (the gaps between them are the doorways)
export const WALLS = [
  { x: 476, y: 80, w: 8, h: 80 },   // vertical, above door A-B
  { x: 476, y: 220, w: 8, h: 160 }, // vertical, between doors
  { x: 476, y: 440, w: 8, h: 80 },  // vertical, below door C-D
  { x: 140, y: 296, w: 110, h: 8 }, // horizontal, left of door A-C
  { x: 310, y: 296, w: 340, h: 8 }, // horizontal, middle
  { x: 710, y: 296, w: 110, h: 8 }, // horizontal, right of door B-D
]

// doorway waypoints. rooms: 0=NW kitchen, 1=NE, 2=SW, 3=SE
export const DOORS = {
  '0-1': { x: 480, y: 190 },
  '2-3': { x: 480, y: 410 },
  '0-2': { x: 280, y: 300 },
  '1-3': { x: 680, y: 300 },
}

// sleepers: head position + bed rect (solid for the player)
export const SLEEPERS = [
  { x: 700, y: 150, bed: { x: 660, y: 110, w: 130, h: 78 }, name: 'la madre' },
  { x: 220, y: 440, bed: { x: 180, y: 400, w: 130, h: 78 }, name: 'el padre' },
  { x: 745, y: 455, bed: { x: 705, y: 418, w: 105, h: 70 }, name: 'la guagua' },
]

export const BRAZIERS = [
  { x: 300, y: 160 },
  { x: 560, y: 430 },
]
export const BRAZIER_RADIUS = 16

// floor cracks the basilisco uses (jag seeds are fixed for stable drawing)
export const CRACKS = [
  { x: 220, y: 250, seed: 3 },
  { x: 400, y: 130, seed: 7 },
  { x: 560, y: 180, seed: 11 },
  { x: 770, y: 250, seed: 5 },
  { x: 180, y: 370, seed: 13 },
  { x: 390, y: 460, seed: 2 },
  { x: 610, y: 340, seed: 9 },
  { x: 780, y: 390, seed: 6 },
]

// the 6 suspect floor tiles — one hides the egg
export const TILE_SIZE = 48
export const TILES = [
  { x: 200, y: 140 },
  { x: 330, y: 240 },
  { x: 640, y: 230 },
  { x: 240, y: 360 },
  { x: 420, y: 400 },
  { x: 700, y: 330 },
]

export function roomOf(x, y) {
  return (x < MIDX ? 0 : 1) + (y < MIDY ? 0 : 2)
}

function doorBetween(a, b) {
  return DOORS[a < b ? a + '-' + b : b + '-' + a] || null
}

const ADJ = { 0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2] }

// next point to walk toward to get from (fx,fy) to (tx,ty) through doorways.
// Returns a {x,y} from the static DOORS table or the target itself — never allocates.
const TARGET_PT = { x: 0, y: 0 }
export function nextWaypoint(fx, fy, tx, ty) {
  const a = roomOf(fx, fy)
  const b = roomOf(tx, ty)
  if (a === b) {
    TARGET_PT.x = tx
    TARGET_PT.y = ty
    return TARGET_PT
  }
  const direct = doorBetween(a, b)
  if (direct) return direct
  // diagonal rooms: pick the cheaper of the two intermediate rooms
  let best = null
  let bestCost = Infinity
  const ns = ADJ[a]
  for (let i = 0; i < ns.length; i++) {
    const d1 = doorBetween(a, ns[i])
    const d2 = doorBetween(ns[i], b)
    if (!d1 || !d2) continue
    const c =
      Math.hypot(d1.x - fx, d1.y - fy) +
      Math.hypot(d2.x - d1.x, d2.y - d1.y) +
      Math.hypot(tx - d2.x, ty - d2.y)
    if (c < bestCost) {
      bestCost = c
      best = d1
    }
  }
  return best || direct
}

// --- circle vs rect pushout, writes into `out` {x,y} ---
export function pushOutRect(out, r, rect) {
  const cx = Math.max(rect.x, Math.min(out.x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(out.y, rect.y + rect.h))
  let dx = out.x - cx
  let dy = out.y - cy
  const d2 = dx * dx + dy * dy
  if (d2 >= r * r) return
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2)
    out.x = cx + (dx / d) * r
    out.y = cy + (dy / d) * r
  } else {
    // center inside the rect: push out along the shallowest axis
    const left = out.x - rect.x
    const right = rect.x + rect.w - out.x
    const top = out.y - rect.y
    const bottom = rect.y + rect.h - out.y
    const m = Math.min(left, right, top, bottom)
    if (m === left) out.x = rect.x - r
    else if (m === right) out.x = rect.x + rect.w + r
    else if (m === top) out.y = rect.y - r
    else out.y = rect.y + rect.h + r
  }
}

// full player collision: house bounds + inner walls + beds + braziers
export function collidePlayer(out, r) {
  out.x = Math.max(HOUSE.x0 + r, Math.min(HOUSE.x1 - r, out.x))
  out.y = Math.max(HOUSE.y0 + r, Math.min(HOUSE.y1 - r, out.y))
  for (let i = 0; i < WALLS.length; i++) pushOutRect(out, r, WALLS[i])
  for (let i = 0; i < SLEEPERS.length; i++) pushOutRect(out, r, SLEEPERS[i].bed)
  for (let i = 0; i < BRAZIERS.length; i++) {
    const b = BRAZIERS[i]
    let dx = out.x - b.x
    let dy = out.y - b.y
    const min = r + BRAZIER_RADIUS
    const d2 = dx * dx + dy * dy
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2)
      out.x = b.x + (dx / d) * min
      out.y = b.y + (dy / d) * min
    }
  }
}

export function tileAt(x, y) {
  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i]
    if (Math.abs(x - t.x) <= TILE_SIZE / 2 && Math.abs(y - t.y) <= TILE_SIZE / 2) return i
  }
  return -1
}
