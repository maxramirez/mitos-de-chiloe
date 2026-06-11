// EL CAMAHUETO — world.js
// Scene, renderer, recycled gully terrain, sky/moon/sea, the silver calf ahead,
// the player rig, and a fixed-size particle pool. Everything procedural.
// All per-frame work here is allocation-free.

import * as THREE from 'three';
import {
  TRACK_LEN, SLOPE, BANK_X, CHUNK, N_CHUNKS,
  bankY, groundY, microNoise, mulberry32,
} from './consts.js';

export function createWorld(container) {
  const scene = new THREE.Scene();
  const FOG_COL = 0x07090d;
  scene.background = new THREE.Color(FOG_COL);
  scene.fog = new THREE.Fog(FOG_COL, 18, 150);

  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // DPR can change across monitors
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------- lights (kept to 3: hemisphere + moon directional + lantern) ----------
  scene.add(new THREE.HemisphereLight(0x35506a, 0x191008, 1.15));
  const moonLight = new THREE.DirectionalLight(0xc8dcec, 1.8);
  moonLight.position.set(26, 60, -80);
  scene.add(moonLight);

  // ---------- recycled terrain chunks ----------
  const chunks = [];
  const shrubGeo = new THREE.ConeGeometry(1, 1, 5); // unit cone, scaled per shrub
  const soilA = new THREE.Color(0x332312);   // gouged dark soil
  const soilB = new THREE.Color(0x23301f);   // mossy banks
  const gougeC = new THREE.Color(0x140c06);  // torn streaks
  const tmpC = new THREE.Color();

  for (let ci = 0; ci < N_CHUNKS; ci++) {
    const geo = new THREE.PlaneGeometry(38, CHUNK, 26, 34);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -CHUNK / 2); // local z in [0, -CHUNK], origin at near edge
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const zl = pos.getZ(i);
      pos.setY(i, bankY(x) + zl * SLOPE + microNoise(x, zl));
      // colour: dark gouged centre -> mossy banks, with torn streaks
      const a = Math.abs(x);
      let t = (a - 3.5) / 4.5; t = t < 0 ? 0 : t > 1 ? 1 : t;
      tmpC.lerpColors(soilA, soilB, t * t * (3 - 2 * t));
      const wig = Math.sin(zl * 0.21 + ci * 1.7) * 1.6;
      if (Math.abs(x - wig) < 0.7 || Math.abs(x + wig * 0.6 - 2.2) < 0.45) tmpC.lerp(gougeC, 0.75);
      const dim = 0.85 + 0.15 * Math.sin(x * 12.3 + zl * 7.7);
      colors[i * 3] = tmpC.r * dim;
      colors[i * 3 + 1] = tmpC.g * dim;
      colors[i * 3 + 2] = tmpC.b * dim;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // decor children: rim shrubs/stakes + glowing horn-shaving dust on the soil
    const rng = mulberry32(977 + ci * 131);
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x1c2618, roughness: 1, flatShading: true });
    for (let s = 0; s < 9; s++) {
      const side = rng() < 0.5 ? -1 : 1;
      const sx = side * (BANK_X + 1.5 + rng() * 6);
      const sz = -rng() * CHUNK;
      const h = 0.8 + rng() * 2.2;
      const shrub = new THREE.Mesh(shrubGeo, shrubMat);
      const sr = 0.35 + rng() * 0.5; // same rng draw order as before
      shrub.scale.set(sr, h, sr);
      shrub.position.set(sx, bankY(sx) + sz * SLOPE + h * 0.4, sz);
      shrub.rotation.set((rng() - 0.5) * 0.3, rng() * 3.14, (rng() - 0.5) * 0.3);
      mesh.add(shrub);
    }
    const N_DUST = 110;
    const dArr = new Float32Array(N_DUST * 3);
    for (let d = 0; d < N_DUST; d++) {
      const dx = (rng() - 0.5) * 9;
      const dz = -rng() * CHUNK;
      dArr[d * 3] = dx;
      dArr[d * 3 + 1] = bankY(dx) + dz * SLOPE + 0.06 + rng() * 0.1;
      dArr[d * 3 + 2] = dz;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
    const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
      color: 0xffc658, size: 0.07, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.add(dust);
    chunks.push(mesh);
  }

  function updateChunks(playerZ) {
    const startSlot = Math.floor(-playerZ / CHUNK) - 1;
    for (let i = 0; i < N_CHUNKS; i++) {
      const slot = startSlot + i;
      const m = chunks[((slot % N_CHUNKS) + N_CHUNKS) % N_CHUNKS];
      m.position.z = -slot * CHUNK;
      m.position.y = -slot * CHUNK * SLOPE;
    }
  }

  // ---------- sky group (follows the player), moon + sea fixed at the end ----------
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);
  const srng = mulberry32(40123);
  const N_ST = 260;
  const stArr = new Float32Array(N_ST * 3);
  for (let i = 0; i < N_ST; i++) {
    const az = srng() * Math.PI * 2;
    const el = 0.12 + srng() * srng() * 1.3;
    const r = 600;
    stArr[i * 3] = Math.cos(az) * Math.cos(el) * r;
    stArr[i * 3 + 1] = Math.sin(el) * r;
    stArr[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
  }
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute('position', new THREE.BufferAttribute(stArr, 3));
  skyGroup.add(new THREE.Points(stGeo, new THREE.PointsMaterial({
    color: 0xcfe0ea, size: 1.6, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.7, depthWrite: false,
  })));

  const seaY = -(TRACK_LEN + 30) * SLOPE;
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(16, 28),
    new THREE.MeshBasicMaterial({ color: 0xe6eef5, fog: false, transparent: true, opacity: 0.95 })
  );
  moon.position.set(14, seaY + 52, -(TRACK_LEN + 330));
  scene.add(moon);
  for (let h = 0; h < 3; h++) { // layered soft halo
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(22 + h * 9, 28),
      new THREE.MeshBasicMaterial({
        color: 0x9fb8c8, fog: false, transparent: true, opacity: 0.07 - h * 0.02,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    halo.position.copy(moon.position);
    halo.position.z -= 1 + h;
    scene.add(halo);
  }

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 360),
    new THREE.MeshStandardMaterial({ color: 0x0a1620, roughness: 0.35, metalness: 0.5, emissive: 0x05121c, emissiveIntensity: 0.7 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, seaY - 1.2, -(TRACK_LEN + 190));
  scene.add(sea);
  const moonpath = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 300),
    new THREE.MeshBasicMaterial({
      color: 0xbcd8e8, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  moonpath.rotation.x = -Math.PI / 2;
  moonpath.position.set(14, seaY - 1.1, -(TRACK_LEN + 180));
  scene.add(moonpath);

  // ---------- the silver calf, charging far ahead (emissive silhouette) ----------
  const calf = new THREE.Group();
  const calfMat = new THREE.MeshStandardMaterial({
    color: 0xcdd9e4, emissive: 0x8fb4cc, emissiveIntensity: 1.35, roughness: 0.5, metalness: 0.3, flatShading: true,
  });
  const calfHornMat = new THREE.MeshStandardMaterial({
    color: 0xffd97a, emissive: 0xffb52e, emissiveIntensity: 3.2, roughness: 0.35,
  });
  const cBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), calfMat);
  cBody.scale.set(0.8, 0.85, 1.7); cBody.position.y = 1.1;
  calf.add(cBody);
  const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), calfMat);
  cHead.position.set(0, 1.45, -0.95);
  calf.add(cHead);
  const cHorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.62, 6), calfHornMat);
  cHorn.position.set(0, 1.62, -1.22);
  cHorn.rotation.x = -Math.PI / 2 + 0.55;
  calf.add(cHorn);
  const calfLegs = [];
  for (let i = 0; i < 4; i++) {
    const lx = (i % 2 === 0 ? -0.24 : 0.24);
    const lz = (i < 2 ? -0.55 : 0.55);
    const leg = new THREE.Group();
    leg.position.set(lx, 1.0, lz);
    const lGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.95, 5);
    lGeo.translate(0, -0.48, 0);
    leg.add(new THREE.Mesh(lGeo, calfMat));
    calf.add(leg);
    calfLegs.push(leg);
  }
  scene.add(calf);

  // calf gallops 18–100 m ahead, weaving; fades in and out of the fog naturally
  function updateCalf(playerZ, tVis) {
    const gap = 60 + 42 * Math.sin(tVis * 0.11 + 1.7);
    const cz = playerZ - gap;
    const cx = Math.sin(tVis * 0.23) * 2.8;
    calf.position.set(cx, groundY(cx, cz) + Math.abs(Math.sin(tVis * 7.4)) * 0.35, cz);
    calf.rotation.y = Math.PI + Math.sin(tVis * 0.23) * 0.12;
    for (let i = 0; i < 4; i++) {
      calfLegs[i].rotation.x = Math.sin(tVis * 14.8 + i * 1.7) * 0.85;
    }
    calfHornMat.emissiveIntensity = 2.6 + Math.sin(tVis * 2.1) * 1.2;
  }

  // ---------- player rig: hunched figure on a wooden sled ----------
  const player = new THREE.Group();
  const ponchoMat = new THREE.MeshStandardMaterial({ color: 0x5c4c36, roughness: 0.95, flatShading: true });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a6e52, roughness: 0.9, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3a24, roughness: 0.9, flatShading: true });
  // a hooded lantern above the sled — a warm moving pool of light
  const lantern = new THREE.PointLight(0xffd9a0, 18, 21, 1.8);
  lantern.position.set(0, 2.2, -0.2);
  player.add(lantern);
  const sled = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 1.7), woodMat);
  sled.position.y = 0.1;
  player.add(sled);
  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 7), ponchoMat);
  torso.position.set(0, 0.62, 0.1);
  torso.rotation.x = -0.35;
  player.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), skinMat);
  head.position.set(0, 1.08, -0.12);
  player.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 7), ponchoMat);
  hat.position.set(0, 1.2, -0.12);
  player.add(hat);
  scene.add(player);

  // ---------- particle pool (one Points, fixed size, additive, vertex colours) ----------
  const N_P = 256;
  const pPos = new Float32Array(N_P * 3);
  const pCol = new Float32Array(N_P * 3);
  const pVel = new Float32Array(N_P * 3);
  const pLife = new Float32Array(N_P);
  const pFade = new Float32Array(N_P * 3); // colour at spawn (fades to black)
  for (let i = 0; i < N_P; i++) pPos[i * 3 + 1] = -9999;
  const pGeo = new THREE.BufferGeometry();
  const pPosAttr = new THREE.BufferAttribute(pPos, 3);
  const pColAttr = new THREE.BufferAttribute(pCol, 3);
  pGeo.setAttribute('position', pPosAttr);
  pGeo.setAttribute('color', pColAttr);
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.1, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let pHead = 0;
  let pSeed = 1;
  function prand() { pSeed = (pSeed * 16807) % 2147483647; return pSeed / 2147483647; }

  function burst(x, y, z, n, r, g, b, spd, up, life) {
    for (let k = 0; k < n; k++) {
      const i = pHead; pHead = (pHead + 1) % N_P;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      const a = prand() * Math.PI * 2;
      const m = (0.3 + prand() * 0.7) * spd;
      pVel[i * 3] = Math.cos(a) * m;
      pVel[i * 3 + 1] = up * (0.4 + prand() * 0.9);
      pVel[i * 3 + 2] = Math.sin(a) * m;
      pLife[i] = life * (0.6 + prand() * 0.4);
      pFade[i * 3] = r; pFade[i * 3 + 1] = g; pFade[i * 3 + 2] = b;
      pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < N_P; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      pVel[i * 3 + 1] -= 7 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      const f = pLife[i] < 0.45 ? pLife[i] / 0.45 : 1;
      pCol[i * 3] = pFade[i * 3] * f;
      pCol[i * 3 + 1] = pFade[i * 3 + 1] * f;
      pCol[i * 3 + 2] = pFade[i * 3 + 2] * f;
    }
    pPosAttr.needsUpdate = true;
    pColAttr.needsUpdate = true;
  }

  return {
    scene, camera, renderer, player, ponchoMat, torso,
    updateChunks, updateCalf, burst, updateParticles,
    render() { renderer.render(scene, camera); },
  };
}
