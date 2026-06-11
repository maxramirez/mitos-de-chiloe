// El Brujo — the stalker. A gaunt ~2.6 m pitch-dark warlock of Chiloé that
// rises out of the ground at the edge of sight, watches, glides closer when
// you look away, and takes you if it reaches you. Dread over gore.
//
// Contract (INTERFACES.md "src/stalker.js — El Brujo"):
//   createStalker(): { group, update(dt, ctx), get state(), get position(),
//                      set active(v), reset(), forceSpawn(distance?),
//                      consumeStrike(): boolean }
//   ctx = { playerPos: Vector3, playerForward: Vector3 (unit, XZ) }
//
// NO PointLights (scene light count must stay constant). Rising/sinking is
// done by animating group y from/to 4 m below the terrain — never by
// visibility toggles or opacity. Math.random() is called ONLY at state
// transitions; the per-frame path is allocation-free and uses precomputed
// phases.
import * as THREE from 'three';
import { terrainHeight } from './world/terrain.js';
import { makeTexture, applyWeave, paintFibers } from './beings/textures.js';

// ---------- tuning ----------
const PARK_Y = -60;          // hidden: parked under the island center
const RISE_DEPTH = 4;        // rises/sinks through 4 m of ground
const RISE_TIME = 1.2;       // seconds for rise/sink
const COOLDOWN_MIN = 25, COOLDOWN_MAX = 50;
const LURK_DIST_MIN = 55, LURK_DIST_MAX = 85;
const LURK_WAIT_MIN = 6, LURK_WAIT_MAX = 10;
const OBS_DOT = Math.cos((18 * Math.PI) / 180); // ~18° half-angle cone
const OBS_NEED = 1.4;        // cumulative seconds of being watched in lurk
const FREEZE_MIN = 3, FREEZE_MAX = 4;
const STALK_SPEED = 2.3;
const RUSH_SPEED = 6.5;
const RUSH_DIST = 11;        // stalk → rush
const STRIKE_DIST = 1.8;     // rush → strike

function rand(min, max) { return min + Math.random() * (max - min); }

export function createStalker() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // sway/bob applied here; group y owns rise/sink
  group.add(root);

  // ---------- materials (near-black; the figure is a silhouette) ----------
  const coatMat = new THREE.MeshStandardMaterial({
    color: 0x060708, roughness: 1.0, flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x08090c, roughness: 1.0, flatShading: true,
  });
  // two small pale-green eyes — the only thing you ever really see of him
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x16241c, emissive: 0x9fffc8, emissiveIntensity: 3.0, roughness: 0.4,
  });
  // and, when he is close, a brujo amulet smoldering at his throat
  const amuletMat = new THREE.MeshStandardMaterial({
    color: 0x101713, emissive: 0x7fdc9e, emissiveIntensity: 0.9, roughness: 0.5,
  });

  // ragged coat: the tatter pattern is drawn in near-black tones (base ~13)
  // so the silhouette stays pitch dark; only the lantern's grazing light finds
  // the fibers (bump). When no DOM (tests), coatMat keeps its flat color.
  const coatTex = makeTexture(96, 3, (g, s, r) =>
    paintFibers(g, s, r, { count: 30, jitter: 3, wave: 3, base: 13, range: 9 }), 97);
  if (coatTex) {
    applyWeave(coatTex, [coatMat], 0.015);
    coatMat.color.setHex(0xffffff); // the darkness lives in the map now
  }

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  // ---------- long ragged coat: stacked tapered cylinders/cones ----------
  root.add(mesh(new THREE.CylinderGeometry(0.27, 0.5, 1.5, 7), coatMat, 0, 0.75, 0));
  const coat2 = mesh(new THREE.CylinderGeometry(0.24, 0.45, 1.35, 5), coatMat, 0, 0.82, 0);
  coat2.rotation.y = 0.45; // offset facets read as a ragged hem
  root.add(coat2);
  root.add(mesh(new THREE.CylinderGeometry(0.15, 0.27, 0.85, 6), coatMat, 0, 1.85, 0));
  // narrow hunched shoulders
  const shoulders = mesh(new THREE.SphereGeometry(0.24, 6, 5), coatMat, 0, 2.2, 0);
  shoulders.scale.set(1.45, 0.55, 0.8);
  root.add(shoulders);

  // ---------- head (slightly tilted) + wide-brim hat ----------
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.33, 0);
  headGroup.rotation.z = 0.13; // the tilt — like he is listening to you
  root.add(headGroup);
  const head = mesh(new THREE.SphereGeometry(0.11, 7, 6), darkMat, 0, 0, 0.02);
  head.scale.set(0.85, 1.3, 0.9);
  headGroup.add(head);
  headGroup.add(mesh(new THREE.SphereGeometry(0.026, 6, 5), eyeMat, -0.045, 0.02, 0.1));
  headGroup.add(mesh(new THREE.SphereGeometry(0.026, 6, 5), eyeMat, 0.045, 0.02, 0.1));
  headGroup.add(mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.025, 9), darkMat, 0, 0.13, 0));
  headGroup.add(mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.34, 8), darkMat, 0, 0.3, 0));

  // the amulet, hung where a throat should be
  root.add(mesh(new THREE.SphereGeometry(0.028, 6, 5), amuletMat, 0, 2.13, 0.16));

  // ---------- too-long arms, hanging past the coat ----------
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.31, 2.18, 0);
    arm.rotation.z = -side * 0.16; // hang slightly out from the body
    arm.rotation.x = 0.07;         // and slightly forward
    arm.add(mesh(new THREE.CylinderGeometry(0.032, 0.05, 1.5, 5), darkMat, 0, -0.75, 0));
    const claw = mesh(new THREE.ConeGeometry(0.045, 0.24, 5), darkMat, 0, -1.58, 0);
    claw.rotation.x = Math.PI; // points down
    arm.add(claw);
    root.add(arm);
    arms.push(arm);
  }

  // ---------- state ----------
  let state = 'hidden';        // 'hidden' | 'lurk' | 'stalk' | 'rush'
  let phase = 'idle';          // 'rise' | 'idle' | 'freeze' | 'sink' (sub-phase)
  let active = false;
  let pendingStrike = false;
  let time = 0;
  let cooldown = rand(COOLDOWN_MIN, COOLDOWN_MAX);
  let lurkT = 0;               // lurk: time left before it starts stalking
  let obsT = 0;                // lurk: cumulative seconds observed
  let freezeT = 0;             // lurk: frozen-while-seen hold
  let transT = 0;              // rise/sink progress (seconds)
  let bobPhase = 0;            // glide bob accumulator (advances only when moving)
  // precomputed animation phases — no RNG in the per-frame path
  const swayPhase = rand(0, Math.PI * 2);
  const eyePhaseA = rand(0, Math.PI * 2);
  const eyePhaseB = rand(0, Math.PI * 2);
  // last known player state (scalars; lets forceSpawn work without ctx)
  let lpX = 0, lpZ = 0, lfX = 0, lfZ = 1;

  group.position.set(0, PARK_Y, 0);

  function park() {
    group.position.set(0, PARK_Y, 0);
    root.rotation.set(0, 0, 0);
  }

  function goHidden() {
    state = 'hidden';
    phase = 'idle';
    cooldown = rand(COOLDOWN_MIN, COOLDOWN_MAX);
    park();
  }

  function startRise(x, z) {
    group.position.set(x, terrainHeight(x, z) - RISE_DEPTH, z);
    state = 'lurk';
    phase = 'rise';
    transT = 0;
    lurkT = rand(LURK_WAIT_MIN, LURK_WAIT_MAX);
    obsT = 0;
  }

  function startSink() {
    phase = 'sink';
    transT = 0;
  }

  function spawnLurk() {
    // biased to the side or behind: 100°–180° away from the player's forward
    const back = Math.atan2(-lfX, -lfZ);
    let x = lpX, z = lpZ - 60, ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      const a = back + rand(-1.4, 1.4);
      const d = rand(LURK_DIST_MIN, LURK_DIST_MAX);
      x = lpX + Math.sin(a) * d;
      z = lpZ + Math.cos(a) * d;
      ok = terrainHeight(x, z) > 0.5; // must come up out of land, not the sea
    }
    if (ok) startRise(x, z);
    else cooldown = rand(4, 8); // bad ground everywhere around — retry soon
  }

  function facePlayer() {
    group.rotation.y = Math.atan2(lpX - group.position.x, lpZ - group.position.z);
  }

  // smoothstep eased rise/sink offset; returns true while still transitioning
  function transitionY(rising, dt) {
    transT += dt;
    let k = transT / RISE_TIME;
    if (k > 1) k = 1;
    k = k * k * (3 - 2 * k);
    const off = rising ? -RISE_DEPTH * (1 - k) : -RISE_DEPTH * k;
    group.position.y = terrainHeight(group.position.x, group.position.z) + off;
    return transT < RISE_TIME;
  }

  function update(dt, ctx) {
    time += dt;
    // eyes never quite hold steady — precomputed phases, no RNG here
    eyeMat.emissiveIntensity =
      3.0 * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 11 + eyePhaseA)) *
                          (0.5 + 0.5 * Math.sin(time * 5.7 + eyePhaseB)));
    // the amulet smolders on its own slower beat
    amuletMat.emissiveIntensity =
      0.9 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2.3 + eyePhaseB)));
    // the ragged coat and the too-long arms trail the body sway — even when
    // he freezes, the cloth keeps settling around him (tiny, no RNG)
    coat2.rotation.z = Math.sin(time * 0.7 + swayPhase + 2.1) * 0.05;
    coat2.rotation.x = Math.sin(time * 0.55 + swayPhase + 1.4) * 0.035;
    arms[0].rotation.x = 0.07 + Math.sin(time * 0.8 + swayPhase + 2.6) * 0.045;
    arms[1].rotation.x = 0.07 + Math.sin(time * 0.8 + swayPhase + 4.2) * 0.045;

    if (!ctx || !ctx.playerPos || !ctx.playerForward) return;
    lpX = ctx.playerPos.x; lpZ = ctx.playerPos.z;
    lfX = ctx.playerForward.x; lfZ = ctx.playerForward.z;

    if (state === 'hidden') {
      if (active) {
        cooldown -= dt;
        if (cooldown <= 0) spawnLurk();
      }
      return;
    }

    // shared scalars (allocation-free): player → stalker
    const dx = group.position.x - lpX;
    const dz = group.position.z - lpZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const inv = dist > 1e-6 ? 1 / dist : 0;
    const observed = (lfX * dx + lfZ * dz) * inv > OBS_DOT;

    if (state === 'lurk') {
      if (phase === 'rise') {
        facePlayer();
        if (!transitionY(true, dt)) phase = 'idle';
      } else if (phase === 'idle') {
        facePlayer();
        // stands swaying — a man-shape where no man should be
        root.rotation.z = Math.sin(time * 0.6 + swayPhase) * 0.045;
        root.rotation.x = Math.sin(time * 0.43 + swayPhase) * 0.025;
        group.position.y = terrainHeight(group.position.x, group.position.z);
        if (observed) {
          obsT += dt;
          if (obsT >= OBS_NEED) {
            phase = 'freeze';
            freezeT = rand(FREEZE_MIN, FREEZE_MAX);
            root.rotation.z = 0;
            root.rotation.x = 0;
          }
        } else {
          lurkT -= dt;
          if (lurkT <= 0) {
            state = 'stalk';
            phase = 'idle';
          }
        }
      } else if (phase === 'freeze') {
        // seen too long: it stops dead, then lets the ground take it back
        freezeT -= dt;
        if (freezeT <= 0) startSink();
      } else { // sink
        if (!transitionY(false, dt)) goHidden();
      }
      return;
    }

    if (state === 'stalk') {
      if (!observed) {
        // glides closer only while you are not looking
        const step = STALK_SPEED * dt;
        group.position.x -= dx * inv * step;
        group.position.z -= dz * inv * step;
        bobPhase += dt;
        facePlayer();
      }
      root.rotation.z = Math.sin(bobPhase * 2.1 + swayPhase) * 0.03;
      group.position.y =
        terrainHeight(group.position.x, group.position.z) +
        Math.sin(bobPhase * 3.2 + swayPhase) * 0.07;
      if (dist - STALK_SPEED * dt < RUSH_DIST) {
        state = 'rush';
        phase = 'idle';
      }
      return;
    }

    // state === 'rush'
    if (phase === 'idle') {
      // straight in; being watched no longer matters
      const step = RUSH_SPEED * dt;
      group.position.x -= dx * inv * step;
      group.position.z -= dz * inv * step;
      bobPhase += dt * 2;
      facePlayer();
      root.rotation.z = Math.sin(bobPhase * 2.1 + swayPhase) * 0.05;
      group.position.y =
        terrainHeight(group.position.x, group.position.z) +
        Math.sin(bobPhase * 3.2 + swayPhase) * 0.09;
      if (dist - step <= STRIKE_DIST) {
        pendingStrike = true; // main.js consumes this via consumeStrike()
        startSink();
      }
    } else { // sink (post-strike)
      if (!transitionY(false, dt)) goHidden();
    }
  }

  return {
    group,
    update,
    get state() { return state; },
    get position() { return group.position; },
    get active() { return active; },
    set active(v) { active = !!v; },
    reset() {
      pendingStrike = false;
      obsT = 0;
      bobPhase = 0;
      goHidden();
    },
    forceSpawn(distance = 60) {
      // immediate lurk straight ahead of the player (tests)
      startRise(lpX + lfX * distance, lpZ + lfZ * distance);
    },
    consumeStrike() {
      const s = pendingStrike;
      pendingStrike = false;
      return s;
    },
  };
}
