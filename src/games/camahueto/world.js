// EL CAMAHUETO — world.js
// Scene, renderer, recycled gully terrain, sky/moon/sea, the silver calf ahead,
// the player rig, and a fixed-size particle pool. Everything procedural.
// All per-frame work here is allocation-free.

import * as THREE from 'three';
import {
  TRACK_LEN, SLOPE, BANK_X, CHUNK, N_CHUNKS,
  bankY, groundY, microNoise, mulberry32,
} from './consts.js';
import { soilTex, woodTex, clothTex, seaTex, ponchoTex, faceTex, hideTex } from './textures.js';

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
  // colours lifted ~15% to offset the soil texture's sub-white average
  const soilA = new THREE.Color(0x3c2a16);   // gouged dark soil
  const soilB = new THREE.Color(0x2a3a25);   // mossy banks
  const gougeC = new THREE.Color(0x140c06);  // torn streaks
  const tmpC = new THREE.Color();
  // one shared ground material: procedural soil grain as map + self-bump
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, flatShading: true,
    map: soilTex, bumpMap: soilTex, bumpScale: 0.25,
  });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x1c2618, roughness: 1, flatShading: true });

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
    const mesh = new THREE.Mesh(geo, groundMat);
    scene.add(mesh);

    // decor children: rim shrubs/stakes + glowing horn-shaving dust on the soil
    const rng = mulberry32(977 + ci * 131);
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
    new THREE.MeshStandardMaterial({
      color: 0x0c1a26, roughness: 0.35, metalness: 0.5,
      emissive: 0x07161f, emissiveIntensity: 0.85,
      map: seaTex, emissiveMap: seaTex, bumpMap: seaTex, bumpScale: 0.5,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, seaY - 1.2, -(TRACK_LEN + 190));
  scene.add(sea);
  const moonpathMat = new THREE.MeshBasicMaterial({
    color: 0xbcd8e8, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const moonpath = new THREE.Mesh(new THREE.PlaneGeometry(9, 300), moonpathMat);
  moonpath.rotation.x = -Math.PI / 2;
  moonpath.position.set(14, seaY - 1.1, -(TRACK_LEN + 180));
  scene.add(moonpath);

  // ---------- the silver calf, charging far ahead (emissive silhouette) ----------
  const calf = new THREE.Group();
  const calfMat = new THREE.MeshStandardMaterial({
    color: 0xcdd9e4, emissive: 0x8fb4cc, emissiveIntensity: 1.35, roughness: 0.5, metalness: 0.3, flatShading: true,
    map: hideTex, bumpMap: hideTex, bumpScale: 0.12, // dappled silver hide
  });
  const calfDarkMat = new THREE.MeshStandardMaterial({ // hooves + tail tuft
    color: 0x39424e, emissive: 0x1b2530, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.2, flatShading: true,
  });
  const calfHornMat = new THREE.MeshStandardMaterial({
    color: 0xffd97a, emissive: 0xffb52e, emissiveIntensity: 3.2, roughness: 0.35,
  });
  const cBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), calfMat);
  cBody.scale.set(0.8, 0.85, 1.7); cBody.position.y = 1.1;
  calf.add(cBody);
  // neck bridges body and head so the silhouette reads as one animal
  const cNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.55, 6), calfMat);
  cNeck.position.set(0, 1.3, -0.76);
  cNeck.rotation.x = -0.55;
  calf.add(cNeck);
  // head group: skull + muzzle + ears + moonlit eyes bob together
  const cHeadG = new THREE.Group();
  cHeadG.position.set(0, 1.45, -0.95);
  calf.add(cHeadG);
  cHeadG.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), calfMat));
  const cMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), calfMat);
  cMuzzle.scale.set(0.85, 0.75, 1.25);
  cMuzzle.position.set(0, -0.05, -0.19);
  cHeadG.add(cMuzzle);
  const eyeGeo = new THREE.SphereGeometry(0.028, 6, 5);
  const eyeMat = new THREE.MeshBasicMaterial({
    color: 0xcfeaff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let e = 0; e < 2; e++) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(e === 0 ? -0.105 : 0.105, 0.055, -0.19); // proud of the skull so they catch the moon
    cHeadG.add(eye);
  }
  const calfEars = [];
  const earGeo = new THREE.ConeGeometry(0.05, 0.17, 4);
  for (let e = 0; e < 2; e++) {
    const ear = new THREE.Mesh(earGeo, calfMat);
    ear.position.set(e === 0 ? -0.14 : 0.14, 0.18, 0.05);
    ear.rotation.z = e === 0 ? 0.85 : -0.85;
    cHeadG.add(ear);
    calfEars.push(ear);
  }
  const cHorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.62, 6), calfHornMat);
  cHorn.position.set(0, 0.17, -0.27); // rides the head group, so it bobs too
  cHorn.rotation.x = -Math.PI / 2 + 0.55;
  cHeadG.add(cHorn);
  // tail: hangs from the rump, swishing against the gallop
  const cTailG = new THREE.Group();
  cTailG.position.set(0, 1.28, 0.8);
  const tailGeo = new THREE.CylinderGeometry(0.022, 0.045, 0.5, 4);
  tailGeo.translate(0, -0.25, 0);
  cTailG.add(new THREE.Mesh(tailGeo, calfMat));
  const cTuft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), calfDarkMat);
  cTuft.position.y = -0.52;
  cTailG.add(cTuft);
  calf.add(cTailG);
  const calfLegs = [];
  const hoofGeo = new THREE.CylinderGeometry(0.075, 0.08, 0.1, 5);
  for (let i = 0; i < 4; i++) {
    const lx = (i % 2 === 0 ? -0.24 : 0.24);
    const lz = (i < 2 ? -0.55 : 0.55);
    const leg = new THREE.Group();
    leg.position.set(lx, 1.0, lz);
    const lGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.95, 5);
    lGeo.translate(0, -0.48, 0);
    leg.add(new THREE.Mesh(lGeo, calfMat));
    const hoof = new THREE.Mesh(hoofGeo, calfDarkMat);
    hoof.position.y = -0.95;
    leg.add(hoof); // hooves swing with the leg
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
    // secondary motion: head pumps with the gallop (slightly behind the legs),
    // tail swishes on the bounce, ears ride a slow flick cycle
    cHeadG.position.y = 1.45 + Math.sin(tVis * 14.8 + 0.9) * 0.045;
    cHeadG.rotation.x = Math.sin(tVis * 14.8 + 0.9) * 0.07;
    cTailG.rotation.x = -0.45 + Math.sin(tVis * 7.4 + 1.6) * 0.2;
    cTailG.rotation.z = Math.sin(tVis * 3.1) * 0.25;
    const fl = Math.sin(tVis * 0.9 + 2.0);
    const fl8 = fl > 0 ? (fl * fl) * (fl * fl) * (fl * fl) * (fl * fl) : 0; // occasional flick
    calfEars[0].rotation.x = Math.sin(tVis * 1.7) * 0.1 + fl8 * 0.5;
    calfEars[1].rotation.x = Math.sin(tVis * 1.7 + 2.4) * 0.1 + fl8 * 0.35;
    calfHornMat.emissiveIntensity = 2.6 + Math.sin(tVis * 2.1) * 1.2;
    calfMat.emissiveIntensity = 1.3 + 0.15 * Math.sin(tVis * 1.3); // moonlit hide breathes
    eyeMat.opacity = 0.75 + 0.2 * Math.sin(tVis * 2.7 + 0.5);
    // living water: swell streaks drift shoreward, moonpath breathes
    seaTex.offset.y = tVis * 0.012; // uniform-only update, no re-upload
    moonpathMat.opacity = 0.14 + 0.05 * Math.sin(tVis * 0.7);
  }

  // ---------- player rig: hunched figure on a wooden sled ----------
  const player = new THREE.Group();
  // woven chilote stripes carry the colour now; the old weave stays as bump
  const ponchoMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, flatShading: true,
    map: ponchoTex, bumpMap: clothTex, bumpScale: 0.12,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a6e52, roughness: 0.9, flatShading: true });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, flatShading: true, map: faceTex, // hair cap + skin gradient
  });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xa8895a, roughness: 1, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x59432a, roughness: 0.9, flatShading: true,
    map: woodTex, bumpMap: woodTex, bumpScale: 0.2,
  });
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
  // drape: a wider second cone flares the poncho hem over the sled
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 7), ponchoMat);
  skirt.position.set(0, 0.34, 0.16);
  skirt.rotation.x = -0.35;
  player.add(skirt);
  // sleeves reach forward to mitt-hands gripping the sled's nose
  const armGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.42, 5);
  const handGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (let a = 0; a < 2; a++) {
    const sx = a === 0 ? -1 : 1;
    const arm = new THREE.Mesh(armGeo, ponchoMat);
    arm.position.set(sx * 0.2, 0.48, -0.32); // hugs the poncho cone
    arm.rotation.x = 0.95;
    arm.rotation.z = sx * -0.18;
    player.add(arm);
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(sx * 0.26, 0.31, -0.5);
    player.add(hand);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), headMat);
  head.position.set(0, 1.08, -0.12);
  player.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 7), ponchoMat);
  hat.position.set(0, 1.2, -0.12);
  player.add(hat);
  // wide wool brim under the crown — the silhouette reads at any distance
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.04, 8), ponchoMat);
  brim.position.set(0, 1.15, -0.12);
  brim.rotation.x = -0.1;
  player.add(brim);
  // scarf tail streaming behind the neck (pivot group; tail extends +z = behind)
  const scarfG = new THREE.Group();
  scarfG.position.set(0, 1.0, 0.02);
  const scarfGeo = new THREE.BoxGeometry(0.07, 0.02, 0.46);
  scarfGeo.translate(0, 0, 0.23);
  scarfG.add(new THREE.Mesh(scarfGeo, scarfMat));
  player.add(scarfG);
  scene.add(player);

  // cloth + flame nuance: skirt lags the body bob (main bobs the whole group
  // at ~9.5 rad/s of sim time), scarf streams harder with speed, lantern
  // flame wavers. Called once per frame from main's render(); allocation-free.
  function updateRig(simT, tVis, spdN, grounded) {
    const sway = Math.sin(simT * 9.5 - 1.1) * (grounded ? 1 : 0.35); // trails the bob
    skirt.rotation.z = sway * 0.1;
    skirt.rotation.x = -0.35 + sway * 0.05;
    scarfG.rotation.x = -(0.2 + spdN * 0.55) + Math.sin(tVis * 11 + 1.7) * (0.1 + 0.2 * spdN);
    scarfG.rotation.z = Math.sin(tVis * 7.3) * 0.16;
    lantern.intensity = 18 + Math.sin(tVis * 13.7) * 1.3 + Math.sin(tVis * 29.1 + 0.7) * 0.9;
  }

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
    updateChunks, updateCalf, updateRig, burst, updateParticles,
    render() { renderer.render(scene, camera); },
  };
}
