// El Trauco — ugly forest dwarf of the deep woods, ~0.9 m, conical hat,
// ragged poncho, stone hatchet. Squat triangular silhouette, sickly green glow.
import * as THREE from 'three';
import { makeTexture, applyWeave, paintFibers } from './textures.js';

export function createTrauco() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // animated inner root; group transform belongs to main.js
  group.add(root);

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x8a7355, roughness: 0.95, flatShading: true,
  });
  const ponchoMat = new THREE.MeshStandardMaterial({
    color: 0x46381f, roughness: 1.0, flatShading: true,
  });
  const ponchoMat2 = new THREE.MeshStandardMaterial({
    color: 0x59472a, roughness: 1.0, flatShading: true,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0x33402a, roughness: 1.0, flatShading: true,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x4a3522, roughness: 0.9, flatShading: true,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x68707a, roughness: 0.7, flatShading: true,
  });
  // sickly green — eyes + hatchet edge share the accent material
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xa8ff7e, emissive: 0x71ff4d, emissiveIntensity: 2.2, roughness: 0.4,
  });
  const glintMat = new THREE.MeshStandardMaterial({
    color: 0xc9ffd2, emissive: 0x9dffb0, emissiveIntensity: 0.4, roughness: 0.3,
  });

  // coarse home-loomed fiber: heavy jittery strands for poncho and hat,
  // drawn once and tinted by the existing wool colors
  const fiberTex = makeTexture(96, 3, (g, s, r) =>
    paintFibers(g, s, r, { count: 34, jitter: 2, wave: 2, range: 60, base: 226 }), 31);
  applyWeave(fiberTex, [ponchoMat, ponchoMat2, hatMat], 0.022);

  // ---------- stump legs (the Trauco walks on stumps, not feet) ----------
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.26, 6), skinMat);
    leg.position.set(side * 0.1, 0.13, 0);
    root.add(leg);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 6), woodMat);
    stump.position.set(side * 0.1, 0.035, 0);
    root.add(stump);
  }

  // ---------- squat body under a ragged poncho ----------
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), ponchoMat2);
  torso.position.y = 0.45;
  torso.scale.set(1.0, 0.95, 0.85);
  root.add(torso);

  const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.46, 9), ponchoMat);
  poncho.position.y = 0.5;
  root.add(poncho);

  // jagged hanging flaps make the hem look torn (kept: update() flutters them
  // a beat behind the weight shifts, like wool catching the night air)
  const flaps = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const len = 0.12 + 0.1 * (((i * 53) % 7) / 7);
    const flap = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, len, 4), i % 2 ? ponchoMat : ponchoMat2,
    );
    flap.position.set(Math.cos(a) * 0.3, 0.3 - len * 0.4, Math.sin(a) * 0.3);
    flap.rotation.z = Math.cos(a) * 0.3;
    flap.rotation.x = -Math.sin(a) * 0.3;
    root.add(flap);
    flaps.push({ m: flap, z0: flap.rotation.z, x0: flap.rotation.x, ph: i * 0.8 });
  }

  // ---------- head group (head + face + hat pivot together) ----------
  const headGrp = new THREE.Group();
  headGrp.position.set(0, 0.74, 0.02);
  root.add(headGrp);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6), skinMat);
  head.position.y = 0.08;
  head.scale.set(1.05, 0.92, 1.0);
  headGrp.add(head);

  // huge ugly nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.15, 5), skinMat);
  nose.position.set(0, 0.05, 0.15);
  nose.rotation.x = Math.PI / 2 + 0.25;
  headGrp.add(nose);

  // heavy brow
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.05), skinMat);
  brow.position.set(0, 0.12, 0.1);
  brow.rotation.x = 0.3;
  headGrp.add(brow);

  // pointed ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 4), skinMat);
    ear.position.set(side * 0.13, 0.1, -0.01);
    ear.rotation.z = side * -1.9;
    headGrp.add(ear);
  }

  // glowing sickly eyes — emissive accent #1
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), glowMat);
    eye.position.set(side * 0.052, 0.085, 0.115);
    headGrp.add(eye);
  }

  // conical hat with brim — the defining silhouette
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.4, 8), hatMat);
  hat.position.set(0.015, 0.32, -0.01);
  hat.rotation.z = -0.1;
  headGrp.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.025, 9), hatMat);
  brim.position.set(0.01, 0.135, -0.01);
  brim.rotation.z = -0.1;
  headGrp.add(brim);

  // ---------- arms ----------
  function limbDown(len, rTop, rBot, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 6);
    g.translate(0, -len / 2, 0); // pivot at upper end, hangs -y
    return new THREE.Mesh(g, mat);
  }

  // left arm hangs, knuckles low like an ape
  const armL = new THREE.Group();
  armL.position.set(-0.22, 0.58, 0.02);
  armL.add(limbDown(0.34, 0.045, 0.05, skinMat));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), skinMat);
  handL.position.y = -0.36;
  armL.add(handL);
  armL.rotation.z = -0.18;
  root.add(armL);

  // right arm holds the stone hatchet up and forward
  const armR = new THREE.Group();
  armR.position.set(0.22, 0.58, 0.02);
  armR.add(limbDown(0.24, 0.045, 0.05, skinMat));
  const foreR = new THREE.Group();
  foreR.position.y = -0.24;
  foreR.add(limbDown(0.22, 0.038, 0.045, skinMat));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat);
  handR.position.y = -0.23;
  foreR.add(handR);
  armR.add(foreR);
  root.add(armR);

  // stone hatchet gripped in the right hand
  const hatchet = new THREE.Group();
  hatchet.position.y = -0.23;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 5), woodMat);
  handle.position.y = 0.1;
  hatchet.add(handle);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), stoneMat);
  stone.position.set(0, 0.26, 0.05);
  hatchet.add(stone);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.075, 0.025), glintMat);
  edge.position.set(0, 0.26, 0.135);
  hatchet.add(edge);
  hatchet.rotation.x = 0.35;
  foreR.add(hatchet);

  // base pose: shoulder back, forearm raised so the hatchet shows over the poncho
  armR.rotation.x = 0.55;
  armR.rotation.z = 0.25;
  foreR.rotation.x = 1.5;

  // ---------- sickly green light ----------
  const light = new THREE.PointLight(0x76ff55, 24, 28, 1.8);
  light.position.set(0, 1.0, 0.25);
  group.add(light);

  // foxfire toadstools where he stands — dim second accent on its own pulse
  // (static in group: marsh light clings to the ground, not to him)
  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x6fae62, emissive: 0x4fd435, emissiveIntensity: 0.7, roughness: 0.6,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x5a5443, roughness: 0.95, flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const a = 1.1 + i * 2.0;
    const x = Math.cos(a) * (0.34 + i * 0.07);
    const z = Math.sin(a) * (0.36 + i * 0.05);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.06, 5), stemMat);
    stem.position.set(x, 0.03, z);
    group.add(stem);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.045, 6), mossMat);
    cap.position.set(x, 0.075, z);
    cap.rotation.z = Math.cos(a) * 0.2;
    group.add(cap);
  }

  // ---------- drifting spores ----------
  const SPORES = 28;
  const arr = new Float32Array(SPORES * 3);
  for (let i = 0; i < SPORES; i++) {
    const s1 = Math.sin(i * 157.3 + 113.1) * 43758.5453;
    const s2 = Math.sin(i * 311.7 + 271.9) * 43758.5453;
    const s3 = Math.sin(i * 433.1 + 97.7) * 43758.5453;
    const f1 = s1 - Math.floor(s1), f2 = s2 - Math.floor(s2), f3 = s3 - Math.floor(s3);
    const ang = f1 * Math.PI * 2;
    const rad = 0.3 + f2 * 0.8;
    arr[i * 3] = Math.cos(ang) * rad;
    arr[i * 3 + 1] = 0.1 + f3 * 1.1;
    arr[i * 3 + 2] = Math.sin(ang) * rad;
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const sporeMat = new THREE.PointsMaterial({
    color: 0x9aff70, size: 0.045, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  group.add(spores);

  // ---------- idle: shifts weight foot to foot, hatchet glints ----------
  function update(t) {
    // restless weight shift — lean left, lean right, small hop of the hips
    const shift = Math.sin(t * 0.85);
    root.rotation.z = shift * 0.07;
    root.position.x = shift * 0.035;
    root.position.y = 0.018 * Math.abs(Math.sin(t * 1.7));
    root.rotation.y = Math.sin(t * 0.31) * 0.22;

    // head twitches around, watching the woods; hat rides along
    headGrp.rotation.y = Math.sin(t * 0.53 + 1.2) * 0.55 + Math.sin(t * 2.3) * 0.05;
    headGrp.rotation.z = -shift * 0.06;

    // arms answer the shifting weight; hatchet arm hefts slightly
    armL.rotation.x = Math.sin(t * 0.85 + 0.6) * 0.12;
    armR.rotation.x = 0.55 + Math.sin(t * 0.85 + 2.1) * 0.1;
    foreR.rotation.x = 1.5 + Math.sin(t * 1.3) * 0.09;

    // the torn hem flutters a beat behind the weight shifts
    for (let i = 0; i < flaps.length; i++) {
      const f = flaps[i];
      f.m.rotation.z = f.z0 + Math.sin(t * 0.85 - 1.1 + f.ph) * 0.1;
      f.m.rotation.x = f.x0 + Math.sin(t * 1.05 - 0.7 + f.ph) * 0.08;
    }

    // hatchet edge catches the moonlight in sharp glints
    const g = Math.max(0, Math.sin(t * 1.45 + 0.4));
    glintMat.emissiveIntensity = 0.35 + 3.4 * g * g * g * g * g * g * g * g;

    // sickly glow gutters like marsh light; the toadstools answer late and low
    light.intensity = 24 + Math.sin(t * 3.3) * 2.5 + Math.sin(t * 8.1) * 1.5;
    glowMat.emissiveIntensity = 2.2 + Math.sin(t * 3.3 + 0.5) * 0.45;
    mossMat.emissiveIntensity = 0.7 + Math.sin(t * 3.3 - 1.4) * 0.3;
    spores.rotation.y = -t * 0.21;
    spores.position.y = Math.sin(t * 0.6) * 0.05;
    sporeMat.opacity = 0.42 + 0.18 * Math.sin(t * 2.2 + 2.0);
  }

  return { group, update };
}
