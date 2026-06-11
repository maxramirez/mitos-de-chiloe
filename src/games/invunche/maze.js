// EL INVUNCHE · maze.js — seeded 17x17 recursive-backtracker maze.
// Pure data + queries, no three.js. The maze lives on a (2N+1)^2 tile grid:
// odd/odd tiles are rooms, even tiles are walls; carving opens the gap tile.
// All scratch buffers are module-level and reused (path queries are event-time).

export const CELLS = 17
export const TILES = CELLS * 2 + 1 // 35
export const TILE = 3.2 // meters per tile
export const WALL_H = 3.6 // meters

export const DX = [1, -1, 0, 0]
export const DZ = [0, 0, 1, -1]

export const cellIndex = (cx, cz) => cz * CELLS + cx
export const tileIndex = (tx, tz) => tz * TILES + tx
export const cellCenter = (c) => (2 * c + 1.5) * TILE // world coord of cell center

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- generation: iterative recursive backtracker from cell (0,0) -----------
export function buildMaze(seed) {
  const rng = mulberry32(seed)
  const wall = new Uint8Array(TILES * TILES).fill(1)
  const visited = new Uint8Array(CELLS * CELLS)
  const stackX = new Int16Array(CELLS * CELLS)
  const stackZ = new Int16Array(CELLS * CELLS)
  const opts = [0, 0, 0, 0]
  let sp = 1
  visited[0] = 1
  wall[tileIndex(1, 1)] = 0
  while (sp > 0) {
    const cx = stackX[sp - 1]
    const cz = stackZ[sp - 1]
    let n = 0
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]
      const nz = cz + DZ[d]
      if (nx >= 0 && nx < CELLS && nz >= 0 && nz < CELLS && !visited[cellIndex(nx, nz)]) opts[n++] = d
    }
    if (n === 0) {
      sp--
      continue
    }
    const d = opts[(rng() * n) | 0]
    const nx = cx + DX[d]
    const nz = cz + DZ[d]
    visited[cellIndex(nx, nz)] = 1
    wall[tileIndex(2 * cx + 1 + DX[d], 2 * cz + 1 + DZ[d])] = 0
    wall[tileIndex(2 * nx + 1, 2 * nz + 1)] = 0
    stackX[sp] = nx
    stackZ[sp] = nz
    sp++
  }
  return wall
}

// open passage between cell (cx,cz) and its neighbor in direction d?
export function openBetween(wall, cx, cz, d) {
  const nx = cx + DX[d]
  const nz = cz + DZ[d]
  if (nx < 0 || nx >= CELLS || nz < 0 || nz >= CELLS) return false
  return wall[tileIndex(2 * cx + 1 + DX[d], 2 * cz + 1 + DZ[d])] === 0
}

// --- BFS distances from a cell (build-time; allocates its result) ----------
export function bfsDistances(wall, fromCx, fromCz) {
  const dist = new Int16Array(CELLS * CELLS).fill(-1)
  const qx = new Int16Array(CELLS * CELLS)
  const qz = new Int16Array(CELLS * CELLS)
  let head = 0
  let tail = 0
  qx[tail] = fromCx
  qz[tail] = fromCz
  tail++
  dist[cellIndex(fromCx, fromCz)] = 0
  while (head < tail) {
    const cx = qx[head]
    const cz = qz[head]
    head++
    const d0 = dist[cellIndex(cx, cz)]
    for (let d = 0; d < 4; d++) {
      if (!openBetween(wall, cx, cz, d)) continue
      const nx = cx + DX[d]
      const nz = cz + DZ[d]
      if (dist[cellIndex(nx, nz)] !== -1) continue
      dist[cellIndex(nx, nz)] = d0 + 1
      qx[tail] = nx
      qz[tail] = nz
      tail++
    }
  }
  return dist
}

// cells with exactly one open side
export function deadEnds(wall) {
  const out = []
  for (let cz = 0; cz < CELLS; cz++) {
    for (let cx = 0; cx < CELLS; cx++) {
      let n = 0
      for (let d = 0; d < 4; d++) if (openBetween(wall, cx, cz, d)) n++
      if (n === 1) out.push(cellIndex(cx, cz))
    }
  }
  return out
}

// --- path query (event-time; reuses module scratch) ------------------------
const _seen = new Uint8Array(CELLS * CELLS)
const _prev = new Int16Array(CELLS * CELLS)
const _q = new Int16Array(CELLS * CELLS)

// Fills outPath (Int16Array >= CELLS*CELLS) with cell indices from `fromIdx`
// to `toIdx` inclusive. Returns path length (0 if unreachable).
export function pathBetween(wall, fromIdx, toIdx, outPath) {
  if (fromIdx === toIdx) {
    outPath[0] = fromIdx
    return 1
  }
  _seen.fill(0)
  let head = 0
  let tail = 0
  _q[tail++] = fromIdx
  _seen[fromIdx] = 1
  let found = false
  while (head < tail) {
    const c = _q[head++]
    const cx = c % CELLS
    const cz = (c / CELLS) | 0
    for (let d = 0; d < 4; d++) {
      if (!openBetween(wall, cx, cz, d)) continue
      const n = cellIndex(cx + DX[d], cz + DZ[d])
      if (_seen[n]) continue
      _seen[n] = 1
      _prev[n] = c
      if (n === toIdx) {
        found = true
        head = tail // break outer
        break
      }
      _q[tail++] = n
    }
  }
  if (!found) return 0
  // walk back, then reverse into outPath
  let len = 0
  let c = toIdx
  while (c !== fromIdx) {
    _q[len++] = c // reuse _q as the backwards buffer
    c = _prev[c]
  }
  outPath[0] = fromIdx
  for (let i = 0; i < len; i++) outPath[i + 1] = _q[len - 1 - i]
  return len + 1
}

// --- ascii dump (test-time) -------------------------------------------------
// mark(tx, tz) may return a char to override; walls '#', open '.'
export function asciiMaze(wall, mark) {
  let out = ''
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      const m = mark ? mark(tx, tz) : null
      out += m || (wall[tileIndex(tx, tz)] === 1 ? '#' : '.')
    }
    out += '\n'
  }
  return out
}
