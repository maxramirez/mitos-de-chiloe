// ============================================================
// TENTEN Y CAICAI — sim.js
// Pure game rules. No DOM, no canvas, no audio — node-safe,
// fully deterministic (no randomness anywhere in here).
// ============================================================

export const SIZE = 13; // board is SIZE x SIZE
export const MAXH = 5; // tallest a tile can be
export const RISE_EVERY = 3; // the sea rises 1 every N turns
export const RAISES_PER_TURN = 3;
export const STEPS_PER_TURN = 2; // villager steps per turn
export const NEED_SAVED = 4; // win: at least this many reach the beacon
export const LOSE_LOST = 3; // lose: this many taken by the water

// fixed neighbor order (N, E, S, W) — part of determinism
export const NDX = [0, 1, 0, -1];
export const NDY = [-1, 0, 1, 0];

export const idx = (x, y) => y * SIZE + x;
export const inBounds = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

export function createSim(level) {
  const heights = new Int8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = level.map[y];
    for (let x = 0; x < SIZE; x++) heights[idx(x, y)] = row.charCodeAt(x) - 48;
  }
  return {
    heights,
    water: 0,
    turn: 1,
    turnsUntilRise: RISE_EVERY,
    beaconX: level.beacon[0],
    beaconY: level.beacon[1],
    villagers: level.villagers.map(([x, y], i) => ({
      id: i,
      x, y, // logical tile
      px: x, py: y, // render position (lerped by main, unused here)
      fx: x, fy: y, tx: x, ty: y, // step-from / step-to for animation
      alive: true,
      saved: false,
      lostAt: -1, // visual clock stamp when transformed (set by main)
      savedAt: -1,
    })),
    raisesLeft: RAISES_PER_TURN,
    undoStack: [],
    saved: 0,
    lost: 0,
    over: false,
    won: false,
    loseReason: '', // 'gente' (too many taken) | 'cumbre' (summit flooded)
    // preallocated scratch for BFS (no allocs during play)
    dist: new Int16Array(SIZE * SIZE),
    queue: new Int16Array(SIZE * SIZE),
    drowned: new Int8Array(8), // villager ids transformed on the last rise
    drownedCount: 0,
  };
}

export function villagerAt(sim, x, y) {
  const vs = sim.villagers;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    if (v.alive && v.x === x && v.y === y) return v;
  }
  return null;
}

// '' means the raise is legal; otherwise a reason key
export function canRaise(sim, x, y) {
  if (!inBounds(x, y)) return 'fuera';
  if (sim.heights[idx(x, y)] >= MAXH) return 'cielo';
  if (villagerAt(sim, x, y)) return 'gente';
  return '';
}

export function doRaise(sim, x, y) {
  if (sim.raisesLeft <= 0) return 'sin';
  const why = canRaise(sim, x, y);
  if (why) return why;
  sim.heights[idx(x, y)] += 1;
  sim.raisesLeft -= 1;
  sim.undoStack.push(idx(x, y));
  return '';
}

// returns the index of the lowered tile, or -1 if nothing to undo
export function undoRaise(sim) {
  if (!sim.undoStack.length) return -1;
  const i = sim.undoStack.pop();
  sim.heights[i] -= 1;
  sim.raisesLeft += 1;
  return i;
}

// BFS from the beacon over reversed walk edges. dist[i] = steps a villager
// standing on i needs to reach the beacon (-1 = unreachable).
// Walk rule: from A to B requires height(B) > water  (never step into the sea)
//            and height(B) <= height(A) + 1          (climb at most +1; any drop ok)
export function computeDist(sim) {
  const { dist, queue, heights, water } = sim;
  dist.fill(-1);
  let head = 0;
  let tail = 0;
  const b = idx(sim.beaconX, sim.beaconY);
  if (heights[b] > water) {
    dist[b] = 0;
    queue[tail++] = b;
  }
  while (head < tail) {
    const t = queue[head++];
    const tx = t % SIZE;
    const ty = (t / SIZE) | 0;
    const ht = heights[t];
    const dt = dist[t];
    for (let k = 0; k < 4; k++) {
      const nx = tx + NDX[k];
      const ny = ty + NDY[k];
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (dist[n] !== -1) continue;
      const hn = heights[n];
      if (hn <= water) continue; // can't stand below the waterline
      if (ht > hn + 1) continue; // edge n -> t needs climb <= +1
      dist[n] = dt + 1;
      queue[tail++] = n;
    }
  }
}

// Pick the next tile for villager v (or -1 to stay). Deterministic:
// strictly-closer neighbors only; ties broken by higher ground, then N,E,S,W.
// Cut off from the beacon entirely, a villager climbs for its life instead
// (any walkable neighbor exactly +1 up; first in N,E,S,W order).
export function chooseStep(sim, v) {
  const { dist, heights, water } = sim;
  const cur = idx(v.x, v.y);
  const d0 = dist[cur];
  const hc = heights[cur];
  if (d0 < 0) {
    for (let k = 0; k < 4; k++) {
      const nx = v.x + NDX[k];
      const ny = v.y + NDY[k];
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      const hn = heights[n];
      if (hn <= water || hn !== hc + 1) continue;
      return n;
    }
    return -1;
  }
  if (d0 === 0) return -1; // already on the beacon tile
  let best = -1;
  let bestH = -127;
  for (let k = 0; k < 4; k++) {
    const nx = v.x + NDX[k];
    const ny = v.y + NDY[k];
    if (!inBounds(nx, ny)) continue;
    const n = idx(nx, ny);
    if (dist[n] !== d0 - 1) continue;
    const hn = heights[n];
    if (hn <= water) continue;
    if (hn > hc + 1) continue;
    if (hn > bestH) {
      bestH = hn;
      best = n;
    }
  }
  return best;
}

// Move villager onto tile n. Returns true if they reached the beacon.
export function commitVillager(sim, v, n) {
  v.x = n % SIZE;
  v.y = (n / SIZE) | 0;
  if (v.x === sim.beaconX && v.y === sim.beaconY) {
    v.alive = false;
    v.saved = true;
    sim.saved += 1;
    return true;
  }
  return false;
}

// The sea rises one level. Villagers standing at or below it transform.
// Returns how many were taken (their ids land in sim.drowned[0..count-1]).
export function floodCommit(sim) {
  sim.water += 1;
  sim.turnsUntilRise = RISE_EVERY;
  sim.drownedCount = 0;
  const vs = sim.villagers;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    if (v.alive && sim.heights[idx(v.x, v.y)] <= sim.water) {
      v.alive = false;
      sim.lost += 1;
      sim.drowned[sim.drownedCount++] = v.id;
    }
  }
  return sim.drownedCount;
}

// Win/lose checks. Win is checked first (arrivals precede the flood).
export function evaluate(sim) {
  if (sim.over) return '';
  if (sim.saved >= NEED_SAVED) {
    sim.over = true;
    sim.won = true;
    return 'won';
  }
  if (sim.lost >= LOSE_LOST) {
    sim.over = true;
    sim.loseReason = 'gente';
    return 'lost';
  }
  if (sim.heights[idx(sim.beaconX, sim.beaconY)] <= sim.water) {
    sim.over = true;
    sim.loseReason = 'cumbre';
    return 'lost';
  }
  return '';
}

// One full logical turn AFTER the raise phase (march x2, then flood tick).
// Used by the test harness and autoplay; the animated game performs exactly
// these operations in exactly this order, spread over time.
export function runTurnLogic(sim) {
  if (sim.over) return;
  computeDist(sim);
  for (let s = 0; s < STEPS_PER_TURN && !sim.over; s++) {
    const vs = sim.villagers;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v.alive) continue;
      const n = chooseStep(sim, v);
      if (n >= 0) commitVillager(sim, v, n);
    }
    evaluate(sim);
  }
  if (sim.over) return;
  sim.turnsUntilRise -= 1;
  if (sim.turnsUntilRise <= 0) floodCommit(sim);
  evaluate(sim);
  if (!sim.over) {
    sim.turn += 1;
    sim.raisesLeft = RAISES_PER_TURN;
    sim.undoStack.length = 0;
  }
}
