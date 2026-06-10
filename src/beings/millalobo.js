// El Millalobo — golden-furred king of the seas, half man, half sea lion.
// Regal and massive (~2.8 m), seated on a wet rock in the shallows, kelp
// cloak at his back, amber crown and trident glowing through the fog.
import * as THREE from 'three';

export function createMillalobo() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // animated figure; rocks stay still
  group.add(root);

  const rnd = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- materials ----------
  const furMat = new THREE.MeshStandardMaterial({
    color: 0xb5853c, roughness: 0.9, flatShading: true,
  });
  const furDark = new THREE.MeshStandardMaterial({
    color: 0x8a6226, roughness: 0.95, flatShading: true,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd8b070, roughness: 0.8, flatShading: true,
  });
  const kelpMat = new THREE.MeshStandardMaterial({
    color: 0x17352b, roughness: 0.9, flatShading: true,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x31373c, roughness: 0.45, metalness: 0.15, flatShading: true, // wet sheen
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a16, emissive: 0xffb347, emissiveIntensity: 2.6, roughness: 0.4,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a04, emissive: 0xffc24f, emissiveIntensity: 1.7, roughness: 0.4,
  });
  const whiskerMat = new THREE.MeshStandardMaterial({
    color: 0xe8e0cc, roughness: 0.7,
  });

  // ---------- throne rock in the shallows ----------
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), rockMat);
  rock.position.y = 0.3;
  rock.scale.set(1.3, 0.55, 1.15);
  rock.rotation.y = 0.7;
  group.add(rock);
  const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rockMat);
  rock2.position.set(1.15, 0.08, 0.55);
  rock2.scale.set(1.1, 0.5, 1.0);
  rock2.rotation.y = 1.9;
  group.add(rock2);
  const rock3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
  rock3.position.set(-1.05, 0.05, -0.35);
  rock3.scale.set(1.0, 0.55, 1.2);
  rock3.rotation.y = 4.1;
  group.add(rock3);

  // ---------- seated body ----------
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), furDark);
  pelvis.position.y = 0.95;
  pelvis.scale.set(1.1, 0.8, 1.0);
  root.add(pelvis);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 7), furMat);
  belly.position.y = 1.32;
  belly.scale.set(1.05, 0.95, 0.9);
  root.add(belly);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.54, 9, 7), furMat);
  chest.position.y = 1.82;
  chest.scale.set(1.22, 0.95, 0.88);
  root.add(chest);

  const chestPlate = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), skinMat);
  chestPlate.position.set(0, 1.78, 0.32);
  chestPlate.scale.set(0.9, 0.8, 0.5);
  root.add(chestPlate);

  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 6), furMat);
    sh.position.set(s * 0.64, 2.1, 0);
    root.add(sh);
  }

  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.32, 7), furMat);
  neckM.position.y = 2.4;
  root.add(neckM);

  // mane ruff
  const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 6, 10), furDark);
  ruff.position.y = 2.34;
  ruff.rotation.x = Math.PI / 2;
  root.add(ruff);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const lock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3 + rnd(i) * 0.14, 5), furDark);
    lock.position.set(Math.cos(a) * 0.32, 2.14, Math.sin(a) * 0.3);
    lock.rotation.x = Math.PI - Math.sin(a) * 0.5;
    lock.rotation.z = Math.cos(a) * 0.5;
    root.add(lock);
  }

  // ---------- sea-lion head (group pivots at the neck) ----------
  const headG = new THREE.Group();
  headG.position.set(0, 2.6, 0.04);
  root.add(headG);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.29, 9, 7), furMat);
  skull.position.y = 0.06;
  headG.add(skull);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skinMat);
  muzzle.position.set(0, -0.02, 0.27);
  muzzle.scale.set(1.0, 0.75, 1.25);
  headG.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), furDark);
  nose.position.set(0, 0.03, 0.44);
  headG.add(nose);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeMat);
  eyeL.position.set(-0.12, 0.13, 0.22);
  headG.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeMat);
  eyeR.position.set(0.12, 0.13, 0.22);
  headG.add(eyeR);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 5), furDark);
    ear.position.set(s * 0.26, 0.16, -0.02);
    ear.rotation.z = -s * 0.9;
    headG.add(ear);
  }
  // long whiskers
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 4), whiskerMat);
      w.position.set(s * 0.18, -0.04 + i * 0.035, 0.32);
      w.rotation.z = s * (1.35 - i * 0.12);
      w.rotation.y = -s * 0.35;
      headG.add(w);
    }
  }
  // amber crown
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 12), goldMat);
  crown.position.y = 0.32;
  crown.rotation.x = Math.PI / 2 - 0.1;
  headG.add(crown);
  for (let i = -1; i <= 1; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 5), goldMat);
    spike.position.set(i * 0.15, 0.4, 0.15 - Math.abs(i) * 0.045);
    headG.add(spike);
  }

  // ---------- arms ----------
  function spar(x1, y1, z1, x2, y2, z2, r1, r2, mat) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 7), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / len, dy / len, dz / len),
    );
    return m;
  }
  // right arm grips the planted trident
  root.add(spar(0.64, 2.08, 0, 0.98, 1.6, 0.16, 0.1, 0.13, furMat));
  root.add(spar(0.98, 1.6, 0.16, 1.04, 1.32, 0.3, 0.08, 0.1, furMat));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), skinMat);
  handR.position.set(1.04, 1.42, 0.3);
  handR.scale.set(0.8, 1.25, 0.8);
  root.add(handR);
  // left arm rests on the flipper-knee
  root.add(spar(-0.64, 2.08, 0, -0.82, 1.55, 0.24, 0.1, 0.12, furMat));
  root.add(spar(-0.82, 1.55, 0.24, -0.46, 1.12, 0.66, 0.07, 0.09, furMat));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), skinMat);
  handL.position.set(-0.44, 1.08, 0.68);
  handL.scale.set(1.0, 0.5, 1.3);
  root.add(handL);

  // ---------- sea-lion lower body: two great fore-flippers ----------
  const flippers = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.05, 6), furDark);
    f.position.set(s * 0.32, 0.72, 0.76);
    f.rotation.x = 2.05;
    f.rotation.z = s * 0.12;
    f.scale.set(1.4, 1, 0.5);
    root.add(f);
    flippers.push(f);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), furDark);
    tip.position.set(s * 0.38, 0.5, 1.22);
    tip.scale.set(1.6, 0.3, 1.1);
    root.add(tip);
  }

  // ---------- kelp cloak down the back ----------
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.75, 8), kelpMat);
  cloak.position.set(0, 1.5, -0.34);
  cloak.scale.set(1.15, 1, 0.5);
  cloak.rotation.x = -0.1;
  root.add(cloak);
  for (let i = 0; i < 4; i++) {
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5 + rnd(i + 8) * 0.3, 5), kelpMat);
    strand.position.set((rnd(i + 16) - 0.5) * 1.1, 0.65, -0.55 - rnd(i + 24) * 0.15);
    strand.rotation.x = 0.2;
    root.add(strand);
  }

  // ---------- the trident, planted on the rock ----------
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 6), kelpMat);
  shaft.position.set(1.04, 1.92, 0.3);
  root.add(shaft);
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 6), goldMat);
  crossbar.position.set(1.04, 3.3, 0.3);
  crossbar.rotation.z = Math.PI / 2;
  root.add(crossbar);
  const prongC = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 5), goldMat);
  prongC.position.set(1.04, 3.6, 0.3);
  root.add(prongC);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.38, 5), goldMat);
    p.position.set(1.04 + s * 0.2, 3.5, 0.3);
    p.rotation.z = -s * 0.12;
    root.add(p);
  }

  // ---------- amber glow ----------
  const light = new THREE.PointLight(0xffb45e, 32, 34, 1.8);
  light.position.set(0, 2.5, 0.9);
  group.add(light);

  // ---------- golden spray motes ----------
  const N = 34;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd(i + 40) * Math.PI * 2;
    const r = 0.9 + rnd(i + 50) * 1.2;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = 0.2 + rnd(i + 60) * 2.5;
    arr[i * 3 + 2] = Math.sin(a) * r;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xffd28a, size: 0.055, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  // ---------- slow regal idle ----------
  function update(t) {
    // deep, unhurried breath
    const b = Math.sin(t * 0.85);
    chest.scale.set(1.22 + b * 0.02, 0.95 + b * 0.035, 0.88 + b * 0.02);
    belly.scale.set(1.05 + b * 0.015, 0.95 + b * 0.02, 0.9);

    // he surveys his seas
    headG.rotation.y = Math.sin(t * 0.26) * 0.38;
    headG.rotation.x = Math.sin(t * 0.51 + 1.0) * 0.05;
    root.rotation.z = Math.sin(t * 0.4) * 0.012;

    // flippers settle and shift
    flippers[0].rotation.x = 2.05 + Math.sin(t * 0.8) * 0.05;
    flippers[1].rotation.x = 2.05 + Math.sin(t * 0.8 + 2.6) * 0.05;

    // crown and trident burn like slow coals
    goldMat.emissiveIntensity = 2.6 + Math.sin(t * 1.3) * 0.5;
    eyeMat.emissiveIntensity = 1.7 + Math.sin(t * 1.3 + 0.6) * 0.25;
    light.intensity = 32 + Math.sin(t * 1.3) * 3.5 + Math.sin(t * 4.7) * 1.0;

    // spray drifts around the throne
    motes.rotation.y = t * 0.2;
    motes.position.y = Math.sin(t * 0.7) * 0.08;
    moteMat.opacity = 0.45 + 0.18 * Math.sin(t * 2.3 + 0.5);
  }

  return { group, update };
}
