// El Invunche — twisted guardian of the brujo cave. The body crouches turned
// away toward the cave mouth; the head has been wrenched 180° so the face —
// and its dim red eyes — stare back out at whoever approaches. One leg is
// folded up against its back. A small rock arch (the cave) stands behind it.
import * as THREE from 'three';
import { makeTexture, applyWeave, paintScars } from './textures.js';

export function createInvunche() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // the creature (idle motion); cave stays still
  group.add(root);

  // deterministic per-index hash (no Math.random)
  const rnd = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x8d7a66, roughness: 0.95, flatShading: true,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x241b14, roughness: 1.0, flatShading: true,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3c3e45, roughness: 0.95, flatShading: true,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x200402, emissive: 0xff2812, emissiveIntensity: 3.2, roughness: 0.4,
  });
  const mawMat = new THREE.MeshStandardMaterial({
    color: 0x050405, emissive: 0x1c0502, emissiveIntensity: 0.6, roughness: 1.0,
  });
  // brujo brand-welts seared into the hide — dim red, breathing with the cave
  const weltMat = new THREE.MeshStandardMaterial({
    color: 0x3a1008, emissive: 0xb02408, emissiveIntensity: 0.8, roughness: 0.85,
  });

  // scarred skin: mottled hide crossed by gashes and pale keloids, with
  // stitch ticks where the brujos sewed it — drawn once, tinted by skinMat
  const scarTex = makeTexture(128, 2, (g, s, r) => paintScars(g, s, r, { scars: 14 }), 83);
  applyWeave(scarTex, [skinMat], 0.022);

  // ---------- hunched body (facing -Z, toward the cave) ----------
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), skinMat);
  torso.position.y = 0.78;
  torso.scale.set(1, 1.3, 0.8);
  torso.rotation.x = -0.5; // hunched toward the cave
  root.add(torso);

  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), skinMat);
  hump.position.set(0, 1.04, 0.18);
  root.add(hump);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), skinMat);
  hips.position.set(0, 0.5, 0.06);
  root.add(hips);

  // ---------- standing leg (its only working leg) ----------
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 7), skinMat);
  leg.position.set(-0.14, 0.28, 0.02);
  root.add(leg);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.28), skinMat);
  foot.position.set(-0.14, 0.04, -0.05);
  root.add(foot);

  // ---------- the folded leg, pressed against its back ----------
  const thighF = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.42, 6), skinMat);
  thighF.position.set(0.15, 0.72, 0.26);
  thighF.rotation.x = 0.38;
  root.add(thighF);
  const shinF = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 6), skinMat);
  shinF.position.set(0.16, 1.05, 0.31);
  shinF.rotation.x = -0.18;
  root.add(shinF);
  const footF = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.08), skinMat);
  footF.position.set(0.17, 1.24, 0.3);
  footF.rotation.x = 0.45;
  root.add(footF);

  // ---------- long knuckle-walking arms (pivot at shoulder) ----------
  function arm(len) {
    const g = new THREE.CylinderGeometry(0.06, 0.075, len, 6);
    g.translate(0, -len / 2, 0); // pivot at top
    return new THREE.Mesh(g, skinMat);
  }
  const armL = arm(0.95);
  armL.position.set(-0.3, 0.98, 0.04);
  armL.rotation.x = 0.42;
  root.add(armL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), skinMat);
  handL.position.set(-0.3, 0.11, -0.34);
  root.add(handL);

  const armR = arm(0.9);
  armR.position.set(0.3, 0.98, 0.04);
  armR.rotation.x = 0.52;
  root.add(armR);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), skinMat);
  handR.position.set(0.3, 0.13, -0.4);
  root.add(handR);

  // ---------- the head, turned 180° to face +Z over its own back ----------
  const headG = new THREE.Group();
  headG.position.set(0, 1.16, -0.16);
  root.add(headG);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.18, 6), skinMat);
  neck.position.y = -0.06;
  neck.rotation.x = -0.25;
  headG.add(neck);
  // the twist — a ring of wrenched skin at the throat
  const twist = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 5, 9), skinMat);
  twist.position.y = 0.0;
  twist.rotation.x = Math.PI / 2;
  headG.add(twist);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), skinMat);
  head.position.set(0, 0.14, 0);
  head.scale.set(0.92, 1.05, 1.0);
  headG.add(head);

  // face on the +Z side — wrong side; it watches you over its back
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeMat);
  eyeL.position.set(-0.06, 0.17, 0.13);
  headG.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeMat);
  eyeR.position.set(0.06, 0.17, 0.13);
  headG.add(eyeR);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.03), hairMat);
  mouth.position.set(0, 0.06, 0.145);
  headG.add(mouth);
  // ragged ear tufts + matted scalp (kept: they shiver behind the head jerks)
  const scalpTufts = [];
  for (let i = 0; i < 6; i++) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.12 + rnd(i) * 0.1, 5), hairMat,
    );
    const a = (i / 6) * Math.PI * 2;
    tuft.position.set(Math.cos(a) * 0.1, 0.27 + rnd(i + 9) * 0.04, Math.sin(a) * 0.08 - 0.04);
    tuft.rotation.x = (rnd(i + 3) - 0.5) * 0.8;
    tuft.rotation.z = (rnd(i + 5) - 0.5) * 0.8;
    headG.add(tuft);
    scalpTufts.push({ m: tuft, x0: tuft.rotation.x, z0: tuft.rotation.z, ph: i * 1.1 });
  }

  // coarse hair down the spine and shoulders (kept: drags behind the breath)
  const spineHair = [];
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.14 + rnd(i + 20) * 0.16, 5), hairMat,
    );
    h.position.set(
      (rnd(i + 31) - 0.5) * 0.42,
      0.55 + rnd(i + 40) * 0.5,
      0.22 + rnd(i + 50) * 0.1,
    );
    h.rotation.x = 0.9 + (rnd(i + 60) - 0.5) * 0.5;
    root.add(h);
    spineHair.push({ m: h, x0: h.rotation.x, ph: i * 0.7 });
  }

  // brand-welts pressed into the back and shoulder — the brujos' marks
  for (let i = 0; i < 3; i++) {
    const welt = new THREE.Mesh(new THREE.TorusGeometry(0.045 - i * 0.008, 0.012, 5, 8), weltMat);
    welt.position.set(-0.16 + i * 0.15, 0.76 + rnd(i + 200) * 0.22, 0.26 + i * 0.015);
    welt.rotation.x = Math.PI / 2 - 0.45;
    welt.rotation.y = (rnd(i + 210) - 0.5) * 0.8;
    root.add(welt);
  }

  // ---------- the cave: a low rock arch behind it (static, in group) ----------
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.3 + rnd(i + 70) * 0.16, 0), rockMat,
    );
    stone.position.set(
      Math.cos(a) * 1.55,
      Math.sin(a) * 1.4 + 0.12,
      -1.7 + (rnd(i + 80) - 0.5) * 0.3,
    );
    stone.rotation.set(rnd(i + 90) * 3.1, rnd(i + 100) * 3.1, rnd(i + 110) * 3.1);
    stone.scale.set(1.05, 0.8 + rnd(i + 120) * 0.5, 0.9);
    group.add(stone);
  }
  // heavier boulders at the arch feet
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), rockMat);
    b.position.set(s * 1.75, 0.22, -1.45);
    b.rotation.set(0.5 * s, 1.1, 0.3);
    b.scale.set(1.1, 0.75, 1.0);
    group.add(b);
  }
  // the black maw of the cave, breathing faint red
  const maw = new THREE.Mesh(new THREE.CircleGeometry(1.28, 12), mawMat);
  maw.position.set(0, 0.95, -1.92);
  group.add(maw);

  // ---------- dim red glow ----------
  const light = new THREE.PointLight(0xff3520, 20, 26, 1.8);
  light.position.set(0, 1.6, 0.2);
  group.add(light);

  // ---------- ember motes drifting from the cave mouth ----------
  const N = 24;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    arr[i * 3] = (rnd(i + 130) - 0.5) * 2.2;
    arr[i * 3 + 1] = 0.15 + rnd(i + 140) * 1.6;
    arr[i * 3 + 2] = -1.8 + rnd(i + 150) * 1.1;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xff6038, size: 0.05, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);

  // ---------- twitching idle ----------
  function update(t) {
    // ragged breathing
    const breath = Math.sin(t * 1.7) + 0.25 * Math.sin(t * 4.9);
    torso.scale.set(1, 1.3 + breath * 0.04, 0.8 + breath * 0.015);

    // the head scans slowly, with sudden small jerks
    headG.rotation.y =
      Math.sin(t * 0.6) * 0.3 +
      Math.sin(t * 5.7) * 0.05 * (0.5 + 0.5 * Math.sin(t * 1.13));
    headG.rotation.z = Math.sin(t * 1.05 + 0.4) * 0.07;

    // restless shifting on its one leg
    root.rotation.y = Math.sin(t * 0.33) * 0.05;
    root.position.y = 0.012 * Math.sin(t * 1.7);
    armL.rotation.x = 0.42 + Math.sin(t * 1.7) * 0.03;
    armR.rotation.x = 0.52 + Math.sin(t * 1.7 + 1.3) * 0.03;

    // matted hair shivers a beat behind the head jerks and the ragged breath
    for (let i = 0; i < scalpTufts.length; i++) {
      const k = scalpTufts[i];
      k.m.rotation.x = k.x0 + Math.sin(t * 1.7 - 1.0 + k.ph) * 0.07;
      k.m.rotation.z = k.z0 + Math.sin(t * 1.35 - 1.3 + k.ph) * 0.06;
    }
    for (let i = 0; i < spineHair.length; i++) {
      const k = spineHair[i];
      k.m.rotation.x = k.x0 + Math.sin(t * 1.7 - 1.5 + k.ph) * 0.05;
    }

    // uneasy red flicker; the brand-welts smolder on the cave's slow breath
    light.intensity = 20 + Math.sin(t * 7.3) * 2.2 + Math.sin(t * 2.1) * 1.5;
    eyeMat.emissiveIntensity = 3.2 + Math.sin(t * 7.3 + 1.0) * 0.7;
    mawMat.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 1.1);
    weltMat.emissiveIntensity = 0.8 + 0.35 * Math.sin(t * 1.1 - 1.8);

    // embers rise and sag on the cave breath
    embers.position.y = Math.sin(t * 0.4) * 0.15;
    embers.rotation.y = Math.sin(t * 0.23) * 0.2;
    emberMat.opacity = 0.4 + 0.18 * Math.sin(t * 2.9);
  }

  return { group, update };
}
