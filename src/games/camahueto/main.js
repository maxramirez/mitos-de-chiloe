// =============================================================================
// EL CAMAHUETO — La bajada · Mitos de Chiloé
// -----------------------------------------------------------------------------
// Downhill runner. The one-horned silver calf tears a gully down to the sea;
// you ride the torn earth behind it. Auto-run 12 -> 26 m/s over ~1900 m
// (~100 s). A/D or arrows steer (continuous); SPACE jumps (0.6 s air);
// M toggles sound. Boulders: steer around. Fallen logs: jump. Water gushes:
// keep to the dry side — the wash shoves you, the jet itself counts as a hit.
// Collect golden horn shavings (virutas) for the tally. 3 hits = thrown from
// the gully (lose). Reach the sea = win; sets localStorage
// 'chiloe-camahueto-done' = '1'.
//
// MANDATORY TEST API — window.__game:
//   begin()                  same as clicking COMENZAR on the title card
//   step(dt = 1/60, steps=1) advance the sim deterministically (works with rAF
//                            throttled, e.g. hidden tabs); renders once after
//   getState()               { phase: 'title'|'playing'|'won'|'lost',
//                              shavings, hits, livesLeft, speed, distance,
//                              remaining, x, airHeight, grounded, invuln,
//                              timescale, muted }
//   forceWin()               run the real win handler (overlay + localStorage)
//   forceLose()              run the real lose handler (overlay)
//   setSpeed(v)              pin the forward speed to v m/s; setSpeed(null)
//                            returns control to the distance ramp
//   setHits(n)               set collision count (0..3); 3 while playing
//                            triggers the real lose path
//   advanceTo(metersFromEnd) teleport so `remaining` === metersFromEnd
//                            (e.g. advanceTo(0.5) + step(1/60, 2) reaches the
//                            win; one default step covers ~0.43 m)
//
// Sim pauses whenever an overlay is open (phase !== 'playing'). dt clamped at
// 0.05. No allocations in the frame loop (pools, cached strings, reused state).
// =============================================================================

import { createWorld } from './world.js';
import { buildCourse, T_BOULDER, T_LOG } from './course.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import {
  TRACK_LEN, HALF_W, SPEED_MIN, SPEED_MAX, JUMP_V0, GRAV,
  MAX_HITS, INVULN_T, groundY, clamp01,
} from './consts.js';

const world = createWorld(document.getElementById('app'));
// per-run random course; ?seed=<n> pins the layout (e2e passes ?seed=20260610)
const seedParam = new URLSearchParams(location.search).get('seed');
const course = buildCourse(world.scene, seedParam !== null ? +seedParam : (Math.random() * 2 ** 31) | 0);
const audio = createAudio();
const ui = createUI(document.getElementById('ui'));
world.ponchoMat.emissive.setHex(0x88ffcc); // intensity drives the invuln flicker

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let phase = 'title'; // 'title' | 'playing' | 'won' | 'lost'
let pz = 0;          // player z (forward is -z)
let px = 0;          // lateral position
let vx = 0;
let airY = 0;        // height above ground
let vy = 0;
let grounded = true;
let coyote = 0;
let jumpBuf = 0;
let hits = 0;
let shavingCount = 0;
let invuln = 0;
let timescale = 1;   // slow-mo after a hit
let speedMul = 1;    // speed dip after a hit
let speedOverride = null;
let speed = SPEED_MIN;
let shake = 0;
let simT = 0;
let tVis = 0;
let splashT = 0;
let wasAirborne = false;
let camX = 0;
let lastFov = 0;
const keys = { left: false, right: false };

// ---------------------------------------------------------------------------
// end states (real handlers — also used by forceWin / forceLose)
// ---------------------------------------------------------------------------
function winGame() {
  if (phase === 'won' || phase === 'lost') return;
  phase = 'won';
  localStorage.setItem('chiloe-camahueto-done', '1');
  audio.bedOff();
  audio.win();
  audio.voice('win'); // narrator over the win card; no-op if clip missing
  ui.showWin(shavingCount);
}

function loseGame() {
  if (phase === 'won' || phase === 'lost') return;
  phase = 'lost';
  audio.bedOff();
  audio.lose();
  audio.voice('lose'); // narrator over the lose card; no-op if clip missing
  ui.showLose(shavingCount);
}

function begin() {
  if (phase !== 'title') return;
  audio.unlock(); // user gesture — no autoplay-policy errors
  audio.voice('title'); // title-card line, only on BEGIN (plays once decoded)
  ui.hideOverlay();
  ui.setLives(MAX_HITS - hits);
  ui.setMuted(audio.muted);
  phase = 'playing';
}

// ---------------------------------------------------------------------------
// a hit: shake + flash + slow-mo + 1.5 s invulnerable; 3rd throws you out
// ---------------------------------------------------------------------------
function hit() {
  if (invuln > 0 || phase !== 'playing') return;
  hits++;
  invuln = INVULN_T;
  timescale = 0.35;
  speedMul = 0.55;
  shake = 1;
  ui.setLives(MAX_HITS - hits);
  ui.flashHit();
  audio.thud();
  audio.debris(); // stones settling behind the impact
  world.burst(px, groundY(px, pz) + 0.9, pz, 22, 0.55, 0.38, 0.22, 5, 4, 0.7);
  if (hits >= MAX_HITS) loseGame();
  else if (hits === MAX_HITS - 1) audio.voice('whisper'); // last life: "La quebrada no perdona."
}

// ---------------------------------------------------------------------------
// simulate(dt) — pure sim step; only runs while phase === 'playing'
// ---------------------------------------------------------------------------
function simulate(dt) {
  // hit slow-mo recovers on real time; world advances on scaled time
  timescale += (1 - timescale) * Math.min(1, 2.0 * dt);
  speedMul += (1 - speedMul) * Math.min(1, 0.9 * dt);
  invuln = invuln > 0 ? invuln - dt : 0;
  shake = shake > 0 ? Math.max(0, shake - 1.6 * dt) : 0;
  const d = dt * timescale;
  simT += d;

  // forward speed: ramps 12 -> 26 m/s across the run
  const dist = -pz;
  const ramp = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * clamp01(dist / TRACK_LEN);
  speed = speedOverride !== null ? speedOverride : ramp * speedMul;
  pz -= speed * d;

  // lateral steering (continuous, damped; weaker mid-air)
  const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const target = ix * 8.6 * (grounded ? 1 : 0.6);
  vx += (target - vx) * Math.min(1, 12 * d);

  // water gushes: wash shoves toward the dry side; the jet core is a hit
  let inWet = false;
  for (let i = 0; i < course.gushes.length; i++) {
    const g = course.gushes[i];
    const gdz = pz - g.z;
    if (gdz > g.halfL || -gdz > g.halfL) continue;
    const dWall = g.side * (g.x - px); // distance inward from the source wall
    if (dWall < -0.3 || dWall > g.width) continue;
    inWet = true;
    vx += -g.side * 16 * (grounded ? 1 : 0.4) * d;
    // lethal core only near the visible jet cone; the shove spans the wash
    if (dWall < 2.0 && gdz > -2 && gdz < 2 && airY < 1.2) hit();
  }
  if (inWet) {
    splashT -= dt;
    if (splashT <= 0) {
      splashT = 0.14;
      world.burst(px, groundY(px, pz) + 0.5, pz, 4, 0.5, 0.75, 0.85, 3.5, 3, 0.4);
      audio.splash();
    }
  } else splashT = 0;

  px += vx * d;
  if (px > HALF_W) { px = HALF_W; vx = vx > 0 ? 0 : vx; }
  else if (px < -HALF_W) { px = -HALF_W; vx = vx < 0 ? 0 : vx; }

  // jump (0.6 s of air), with a short input buffer + coyote time
  jumpBuf = jumpBuf > 0 ? jumpBuf - dt : 0;
  coyote = grounded ? 0.08 : (coyote > 0 ? coyote - dt : 0);
  if (jumpBuf > 0 && (grounded || coyote > 0) && vy <= 0.01) {
    vy = JUMP_V0;
    grounded = false;
    coyote = 0;
    jumpBuf = 0;
    audio.jump();
  }
  if (!grounded) {
    airY += vy * d;
    vy -= GRAV * d;
    if (airY <= 0) {
      airY = 0; vy = 0; grounded = true;
      if (wasAirborne) {
        world.burst(px, groundY(px, pz) + 0.2, pz, 8, 0.4, 0.3, 0.18, 3, 2, 0.45);
        audio.land();
      }
    }
  }
  wasAirborne = !grounded;

  // obstacle collisions (boulders + logs; gush jets handled above)
  const obs = course.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const dz = pz - o.z;
    if (dz < -2.5 || dz > 2.5) continue;
    if (o.type === T_BOULDER) {
      const dx = px - o.x;
      const rr = o.r + 0.55;
      if (dx * dx + dz * dz < rr * rr && airY < o.top) hit(); // radial — matches the round rock
    } else if (o.type === T_LOG) {
      if (dz < 0.75 && dz > -0.75 && px > o.x - o.halfW - 0.3 && px < o.x + o.halfW + 0.3 && airY < o.top) hit();
    }
  }

  // golden shavings
  const shv = course.shavings;
  for (let i = 0; i < shv.length; i++) {
    const s = shv[i];
    if (s.collected) continue;
    const dz = pz - s.z;
    if (dz < -1.4 || dz > 1.4) continue;
    const dx = px - s.x;
    // height gate: arc shavings over full-span logs require the jump
    if (dx < 1.35 && dx > -1.35 && Math.abs(airY + 0.9 - s.relH) <= 1.0) {
      s.collected = true;
      s.mesh.visible = false;
      shavingCount++;
      ui.setShavings(shavingCount);
      audio.chime(shavingCount);
      world.burst(s.x, s.baseY, s.z, 10, 1.0, 0.75, 0.3, 3, 2.5, 0.5);
    }
  }

  ui.setDistance(TRACK_LEN + pz);
  audio.update(clamp01((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)), !grounded);

  if (pz <= -TRACK_LEN) winGame();
}

// ---------------------------------------------------------------------------
// render(dtVis) — cosmetic only; runs every frame regardless of phase
// ---------------------------------------------------------------------------
function render(dtVis) {
  tVis += dtVis;
  world.updateChunks(pz);
  world.updateCalf(pz, tVis);
  course.updateVisuals(pz, speed, tVis, phase === 'playing');
  world.updateParticles(dtVis);

  // player rig
  const gy = groundY(px, pz);
  const spdN = clamp01((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  const bob = grounded ? Math.abs(Math.sin(simT * 9.5)) * (0.03 + 0.05 * spdN) : 0;
  world.player.position.set(px, gy + airY + bob, pz);
  world.player.rotation.z = -vx * 0.045;
  world.player.rotation.x = -0.119 + (grounded ? 0 : vy * 0.014);
  world.player.rotation.y = -vx * 0.02;
  world.ponchoMat.emissiveIntensity =
    invuln > 0 ? (Math.sin(tVis * 32) > 0 ? 0.9 : 0) : 0;

  // camera: behind and above, lagging laterally, shaking when struck
  camX += (px * 0.9 - camX) * Math.min(1, 6 * dtVis);
  const sx = Math.sin(tVis * 47.3) * 0.22 * shake;
  const sy = Math.sin(tVis * 39.1 + 1.3) * 0.17 * shake;
  const camZ = pz + 5.6;
  world.camera.position.set(camX + sx, groundY(camX, camZ) + 2.25 + airY * 0.35 + sy, camZ);
  world.camera.lookAt(px * 0.7, gy + 1.15 + airY * 0.5, pz - 12);
  const fov = 62 + 17 * spdN - (1 - timescale) * 7;
  if (fov > lastFov + 0.05 || fov < lastFov - 0.05) {
    lastFov = fov;
    world.camera.fov = fov;
    world.camera.updateProjectionMatrix();
  }
  world.render();
}

// ---------------------------------------------------------------------------
// drivers: rAF + manual stepping share the same simulate/render pair
// ---------------------------------------------------------------------------
let lastNow = -1;
function rafLoop(now) {
  requestAnimationFrame(rafLoop);
  const dt = lastNow < 0 ? 0 : Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  if (phase === 'playing') simulate(dt);
  render(dt);
}
requestAnimationFrame(rafLoop);

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') {
    if (!keys.left && phase === 'playing' && grounded) audio.scrape(); // dirt bites on the cut
    keys.left = true; e.preventDefault();
  } else if (k === 'd' || k === 'arrowright') {
    if (!keys.right && phase === 'playing' && grounded) audio.scrape();
    keys.right = true; e.preventDefault();
  }
  else if (k === ' ' || k === 'arrowup' || k === 'w') {
    e.preventDefault();
    if (phase === 'title') begin();
    else if (!e.repeat) jumpBuf = 0.12;
  } else if (k === 'm') {
    ui.setMuted(audio.toggleMute());
  } else if (k === 'enter' && phase === 'title') begin();
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  else if (k === 'd' || k === 'arrowright') keys.right = false;
});
addEventListener('blur', () => { // keys latch if focus leaves mid-hold
  keys.left = false;
  keys.right = false;
  jumpBuf = 0;
});

ui.showTitle(begin);

// ---------------------------------------------------------------------------
// MANDATORY TEST API
// ---------------------------------------------------------------------------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) {
      if (phase === 'playing') simulate(Math.min(0.05, dt));
    }
    render(0);
  },
  getState() {
    return {
      phase,
      shavings: shavingCount,
      hits,
      livesLeft: Math.max(0, MAX_HITS - hits),
      speed,
      distance: -pz,
      remaining: Math.max(0, TRACK_LEN + pz),
      x: px,
      airHeight: airY,
      grounded,
      invuln: invuln > 0,
      timescale,
      muted: audio.muted,
    };
  },
  forceWin: winGame,
  forceLose: loseGame,
  setSpeed(v) {
    speedOverride = typeof v === 'number' && isFinite(v) ? v : null;
    if (speedOverride !== null) speed = speedOverride;
  },
  setHits(n) {
    hits = Math.max(0, Math.min(MAX_HITS, n | 0));
    ui.setLives(MAX_HITS - hits);
    if (hits >= MAX_HITS && phase === 'playing') loseGame();
  },
  advanceTo(metersFromEnd) {
    const m = Math.max(0, Math.min(TRACK_LEN, metersFromEnd));
    pz = -(TRACK_LEN - m);
    world.updateChunks(pz);
    render(0);
  },
};
