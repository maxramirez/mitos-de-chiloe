// EL CAMAHUETO — course.js
// Deterministic course generation (seeded RNG): boulders, fallen logs, water
// gushes, and floating golden horn shavings. Builds all meshes up front;
// per-frame visual update is allocation-free (visibility windows, telegraph
// glints, bobbing shavings, animated gushes).

import * as THREE from 'three';
import { TRACK_LEN, SLOPE, BANK_X, groundY, mulberry32, clamp01 } from './consts.js';

export const T_BOULDER = 0;
export const T_LOG = 1;
export const T_GUSH = 2;

export function buildCourse(scene, seed = 20260610) {
  const rng = mulberry32(seed);
  const obstacles = []; // { type, x, z, r|halfW, top, root, glint, ... }
  const shavings = [];  // { x, z, baseY, mesh, collected, phase }
  const gushes = [];    // also pushed into obstacles for telegraphs/visibility

  // ---------- shared geometry & materials ----------
  const boulderGeo = new THREE.IcosahedronGeometry(1, 0);
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x756a5e, roughness: 0.85, flatShading: true });
  const logMat = new THREE.MeshStandardMaterial({ color: 0x6b5234, roughness: 0.95, flatShading: true });
  const glintGeo = new THREE.OctahedronGeometry(0.3, 0);
  const glintMat = new THREE.MeshBasicMaterial({
    color: 0xdff4ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const shavingGeo = new THREE.TorusGeometry(0.24, 0.075, 6, 10);
  const shavingMat = new THREE.MeshStandardMaterial({
    color: 0xffd97a, emissive: 0xffb52e, emissiveIntensity: 1.8, roughness: 0.35,
  });
  const jetGeo = new THREE.ConeGeometry(0.55, 4.6, 7, 1, true);
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0x86c4dd, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const wetMat = new THREE.MeshBasicMaterial({
    color: 0x27506a, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  function addGlint(root, y) {
    const g = new THREE.Mesh(glintGeo, glintMat);
    g.position.y = y;
    g.visible = false;
    root.add(g);
    return g;
  }

  function makeBoulder(x, z, r) {
    const root = new THREE.Group();
    const m = new THREE.Mesh(boulderGeo, boulderMat);
    m.scale.set(r * (0.9 + rng() * 0.3), r * (0.85 + rng() * 0.3), r * (0.9 + rng() * 0.3));
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    m.position.y = r * 0.55;
    root.add(m);
    root.position.set(x, groundY(x, z), z);
    scene.add(root);
    obstacles.push({ type: T_BOULDER, x, z, r, top: r * 1.4, root, glint: addGlint(root, r * 1.3 + 0.4) });
  }

  function makeLog(cx, z, halfW) {
    const root = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, halfW * 2, 7), logMat);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = (rng() - 0.5) * 0.18;
    m.position.y = 0.42;
    root.add(m);
    for (let b = 0; b < 2; b++) { // stub branches
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 5), logMat);
      br.position.set((rng() - 0.5) * halfW * 1.4, 0.7, (rng() - 0.5) * 0.4);
      br.rotation.z = (rng() - 0.5) * 1.8;
      root.add(br);
    }
    root.position.set(cx, groundY(cx, z), z);
    scene.add(root);
    obstacles.push({ type: T_LOG, x: cx, z, halfW, top: 0.85, root, glint: addGlint(root, 1.35) });
  }

  function makeGush(side, z) {
    // water bursts from the `side` wall and washes toward the other side.
    const srcX = side * (BANK_X + 0.3);
    const width = 6.3;            // wet region extends from the wall inward
    const len = 12;               // along z
    const root = new THREE.Group();
    // apex points into the channel, slightly downhill; base sits at the wall
    const jet = new THREE.Mesh(jetGeo, jetMat);
    jet.position.set(-side * 2.0, 1.15, 0);
    jet.rotation.z = side * (Math.PI / 2 + 0.2);
    root.add(jet);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(width, len), wetMat);
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(-side * width * 0.5, 0.12, 0);
    root.add(wet);
    // foam points along the wash
    const N_F = 26;
    const fArr = new Float32Array(N_F * 3);
    for (let i = 0; i < N_F; i++) {
      fArr[i * 3] = -side * rng() * width;
      fArr[i * 3 + 1] = 0.25 + rng() * 1.1;
      fArr[i * 3 + 2] = (rng() - 0.5) * len * 0.9;
    }
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.BufferAttribute(fArr, 3));
    const foam = new THREE.Points(fGeo, new THREE.PointsMaterial({
      color: 0xbfe2f2, size: 0.11, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(foam);
    root.position.set(srcX, groundY(srcX, z) - 0.4, z);
    scene.add(root);
    const o = {
      type: T_GUSH, x: srcX, z, side, width, halfL: len / 2,
      root, jet, foam, glint: addGlint(root, 3.2),
    };
    obstacles.push(o);
    gushes.push(o);
  }

  function makeShaving(x, z, baseY) {
    const m = new THREE.Mesh(shavingGeo, shavingMat);
    m.position.set(x, baseY, z);
    scene.add(m);
    shavings.push({ x, z, baseY, mesh: m, collected: false, phase: rng() * 6.28 });
  }

  function shavingLine(zFrom, zTo, lane, n, arcPeak) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const z = zFrom + (zTo - zFrom) * t;
      const x = Math.max(-4.6, Math.min(4.6, lane + Math.sin(t * 3.1) * 0.7));
      const arc = arcPeak ? Math.sin(t * Math.PI) * arcPeak : 0;
      makeShaving(x, z, groundY(x, z) + 1.05 + arc);
    }
  }

  // ---------- generate the run ----------
  let z = -65;
  const Z_END = -(TRACK_LEN - 85); // leave the last stretch clear for the run-out
  let lastSafeLane = 0;

  while (z > Z_END) {
    const p = clamp01(-z / TRACK_LEN);
    const r = rng();
    let safeLane = 0;
    if (r < 0.30) {
      const bx = (rng() - 0.5) * 8.4;
      makeBoulder(bx, z, 1.0 + rng() * 0.7);
      safeLane = bx > 0 ? bx - 3.4 : bx + 3.4;
    } else if (r < 0.52) {
      const side = rng() < 0.5 ? -1 : 1;
      const cx = side * (1.9 + rng() * 1.5);
      makeLog(cx, z, 3.4);
      safeLane = -side * 3.6; // or jump it
    } else if (r < 0.68) {
      makeLog(0, z, 6.2); // full span — must jump
      safeLane = lastSafeLane;
    } else if (r < 0.84 && p > 0.18) {
      const side = rng() < 0.5 ? -1 : 1;
      makeGush(side, z);
      safeLane = -side * 3.6; // the dry side
    } else if (p > 0.3) {
      // boulder pair with one gap lane
      const gapC = (rng() - 0.5) * 5;
      makeBoulder(gapC - 3.1, z - 0.6, 1.1 + rng() * 0.5);
      makeBoulder(gapC + 3.1, z + 0.6, 1.1 + rng() * 0.5);
      safeLane = gapC;
    } else {
      const bx = (rng() - 0.5) * 7;
      makeBoulder(bx, z, 1.1 + rng() * 0.6);
      safeLane = bx > 0 ? bx - 3.4 : bx + 3.4;
    }
    safeLane = Math.max(-4.4, Math.min(4.4, safeLane));

    const gap = (34 - 17 * p) * (0.82 + rng() * 0.36);
    const zNext = z - gap;
    // golden shavings between events, teaching the safe lane (or arcing a jump)
    if (rng() < 0.8) {
      const wasFullLog = r >= 0.52 && r < 0.68;
      if (wasFullLog) shavingLine(z + 5, z - 7, lastSafeLane, 4, 1.3);
      else shavingLine(z - gap * 0.3, z - gap * 0.75, safeLane, 3 + (rng() * 3 | 0), 0);
    }
    lastSafeLane = safeLane;
    z = zNext;
  }
  // a last golden trail down to the surf
  shavingLine(Z_END - 12, Z_END - 50, 0, 5, 0);

  // ---------- per-frame visuals (allocation-free) ----------
  function updateVisuals(playerZ, speed, tVis, playing) {
    glintMat.opacity = 0.45 + 0.45 * Math.sin(tVis * 7);
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const dz = playerZ - o.z; // >0 when the obstacle is ahead
      const vis = dz > -12 && dz < 170;
      if (o.root.visible !== vis) o.root.visible = vis;
      if (!vis) continue;
      // telegraph: moon-glint when ~2.2 s from impact
      const tta = dz / (speed > 1 ? speed : 1);
      const tg = playing && dz > 6 && tta < 2.2;
      if (o.glint.visible !== tg) o.glint.visible = tg;
      if (tg) {
        const s = 1 + 0.5 * Math.sin(tVis * 9 + o.z);
        o.glint.scale.set(s, s, s);
        o.glint.rotation.y = tVis * 3;
      }
      if (o.type === T_GUSH) {
        o.jet.scale.y = 0.92 + 0.14 * Math.sin(tVis * 11 + o.z * 0.7);
        o.jet.scale.x = o.jet.scale.z = 1 + 0.18 * Math.sin(tVis * 17 + o.z);
        o.foam.position.y = 0.05 * Math.sin(tVis * 13 + o.z);
        o.foam.rotation.y = Math.sin(tVis * 5.1 + o.z) * 0.08;
      }
    }
    for (let i = 0; i < shavings.length; i++) {
      const s = shavings[i];
      if (s.collected) continue;
      const dz = playerZ - s.z;
      const vis = dz > -8 && dz < 150;
      if (s.mesh.visible !== vis) s.mesh.visible = vis;
      if (!vis) continue;
      s.mesh.position.y = s.baseY + Math.sin(tVis * 2.2 + s.phase) * 0.16;
      s.mesh.rotation.y = tVis * 2.4 + s.phase;
      s.mesh.rotation.x = 0.6;
    }
  }

  return { obstacles, shavings, gushes, updateVisuals };
}
