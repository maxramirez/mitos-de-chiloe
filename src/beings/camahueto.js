// El Camahueto — silver calf-bull of the rivers, ~2 m tall quadruped with a
// single golden horn. Long horizontal silhouette, forward horn spike, pale blue glow.
import * as THREE from 'three';
import { makeTexture, applyWeave, paintHide } from './textures.js';

export function createCamahueto() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // animated inner root; group transform belongs to main.js
  group.add(root);

  // ---------- materials ----------
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0x9aacb9, roughness: 0.62, metalness: 0.25, flatShading: true,
  });
  const silverDark = new THREE.MeshStandardMaterial({
    color: 0x8a98a6, roughness: 0.65, metalness: 0.3, flatShading: true,
  });
  const hoofMat = new THREE.MeshStandardMaterial({
    color: 0x343c46, roughness: 0.8, flatShading: true,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x101820, roughness: 0.25,
    emissive: 0x2a4a66, emissiveIntensity: 0.35, // wet eyes catch the moon
  });
  // the single GOLDEN horn — emissive accent
  const hornMat = new THREE.MeshStandardMaterial({
    color: 0xffd97a, emissive: 0xffb52e, emissiveIntensity: 2.3, roughness: 0.35,
  });

  // river-calf hide: wet mottled patches, drawn once, tinted by the silvers
  const hideTex = makeTexture(96, 3, (g, s, r) =>
    paintHide(g, s, r, { blotches: 40, range: 34 }), 71);
  applyWeave(hideTex, [silverMat, silverDark], 0.016);

  // ---------- body: chest deep, hips lower, silvered flanks ----------
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.46, 9, 7), silverMat);
  chest.position.set(0, 1.12, 0.32);
  chest.scale.set(0.82, 0.85, 1.05);
  root.add(chest);

  const barrel = new THREE.Mesh(new THREE.SphereGeometry(0.44, 9, 7), silverMat);
  barrel.position.set(0, 1.06, -0.22);
  barrel.scale.set(0.78, 0.78, 1.25);
  root.add(barrel);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), silverDark);
  hips.position.set(0, 1.05, -0.68);
  hips.scale.set(0.85, 0.88, 0.9);
  root.add(hips);

  // ---------- legs (pivot groups at the shoulders/hips) ----------
  function makeLeg(x, z, pivotY) {
    const leg = new THREE.Group();
    leg.position.set(x, pivotY, z);
    const upperGeo = new THREE.CylinderGeometry(0.085, 0.062, 0.52, 6);
    upperGeo.translate(0, -0.26, 0);
    leg.add(new THREE.Mesh(upperGeo, silverDark));
    const knee = new THREE.Group();
    knee.position.y = -0.52;
    const lowerGeo = new THREE.CylinderGeometry(0.058, 0.045, 0.42, 6);
    lowerGeo.translate(0, -0.21, 0);
    knee.add(new THREE.Mesh(lowerGeo, silverDark));
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.11, 6), hoofMat);
    hoof.position.y = -0.46;
    knee.add(hoof);
    leg.add(knee);
    return { leg, knee };
  }

  const flLeg = makeLeg(-0.22, 0.45, 1.03); // front-left: the pawing leg
  const frLeg = makeLeg(0.22, 0.45, 1.03);
  const blLeg = makeLeg(-0.23, -0.68, 1.0);
  const brLeg = makeLeg(0.23, -0.68, 1.0);
  root.add(flLeg.leg, frLeg.leg, blLeg.leg, brLeg.leg);

  // ---------- neck + head group (pivots together at the chest) ----------
  const headGrp = new THREE.Group();
  headGrp.position.set(0, 1.3, 0.55);
  root.add(headGrp);

  const neckGeo = new THREE.CylinderGeometry(0.13, 0.2, 0.62, 7);
  neckGeo.translate(0, 0.31, 0);
  const neck = new THREE.Mesh(neckGeo, silverMat);
  neck.rotation.x = 0.55; // leans forward toward +Z
  headGrp.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 6), silverMat);
  head.position.set(0, 0.56, 0.32);
  head.scale.set(0.82, 0.95, 1.1);
  headGrp.add(head);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.115, 0.24, 7), silverDark);
  muzzle.position.set(0, 0.49, 0.52);
  muzzle.rotation.x = Math.PI / 2 - 0.25;
  headGrp.add(muzzle);

  // ears flicked back (kept: they flick on their own beats in update())
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), silverDark);
    ear.position.set(side * 0.15, 0.66, 0.21);
    ear.rotation.z = side * -1.6;
    ear.rotation.y = side * 0.4;
    headGrp.add(ear);
    ears.push({ m: ear, z0: ear.rotation.z, ph: side * 1.7 });
  }

  // dark wet eyes
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), eyeMat);
    eye.position.set(side * 0.115, 0.58, 0.42);
    headGrp.add(eye);
  }

  // the single golden horn, forehead, raked forward like a young narval
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), hornMat);
  horn.position.set(0, 0.72, 0.46);
  horn.rotation.x = Math.PI / 2 - 0.85; // up and forward
  headGrp.add(horn);
  const hornBase = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 5, 9), hornMat);
  hornBase.position.set(0, 0.66, 0.4);
  hornBase.rotation.x = -0.85;
  headGrp.add(hornBase);
  // growth rings up the horn — richer accent along the spike, same slow pulse
  // horn: half-length 0.25, base radius 0.05; axis dir (0, sin0.85, cos0.85)
  for (const d of [0.06, 0.15]) {
    const coneR = 0.05 * ((0.25 - d) / 0.5); // cone radius at offset d from center
    const ring = new THREE.Mesh(new THREE.TorusGeometry(coneR + 0.008, 0.009, 5, 9), hornMat);
    ring.position.set(0, 0.72 + Math.sin(0.85) * d, 0.46 + Math.cos(0.85) * d);
    ring.rotation.x = -0.85;
    headGrp.add(ring);
  }

  // ---------- tail with tuft ----------
  const tail = new THREE.Group();
  tail.position.set(0, 1.22, -0.92);
  const tailGeo = new THREE.CylinderGeometry(0.028, 0.02, 0.55, 5);
  tailGeo.translate(0, -0.275, 0);
  tail.add(new THREE.Mesh(tailGeo, silverDark));
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), hoofMat);
  tuft.position.y = -0.62;
  tuft.rotation.x = Math.PI;
  tail.add(tuft);
  tail.rotation.x = 0.35;
  root.add(tail);

  // ---------- one light: pale blue body glow that blushes gold with the horn pulse
  // (a second PointLight here would raise the scene's light count and the cost
  // of every lit fragment — the pulse lives in this light's color instead)
  const C_BLUE = new THREE.Color(0x9fd4ff);
  const C_GOLD = new THREE.Color(0xffbe3a);
  const light = new THREE.PointLight(0x9fd4ff, 14, 26, 1.8);
  light.position.set(0, 3.0, 0.4);
  group.add(light);

  // ---------- river-mist motes, pale blue ----------
  const MOTES = 36;
  const arr = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    const s1 = Math.sin(i * 141.3 + 233.7) * 43758.5453;
    const s2 = Math.sin(i * 287.1 + 119.3) * 43758.5453;
    const s3 = Math.sin(i * 397.7 + 331.1) * 43758.5453;
    const f1 = s1 - Math.floor(s1), f2 = s2 - Math.floor(s2), f3 = s3 - Math.floor(s3);
    const ang = f1 * Math.PI * 2;
    const rad = 0.6 + f2 * 1.1;
    arr[i * 3] = Math.cos(ang) * rad;
    arr[i * 3 + 1] = 0.15 + f3 * 1.9;
    arr[i * 3 + 2] = Math.sin(ang) * rad;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xbfe2ff, size: 0.055, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  // ---------- idle: paws the ground, horn pulses golden ----------
  function update(t) {
    // pawing comes in bouts — a smooth gate opens every few seconds
    const gate = Math.max(0, Math.sin(t * 0.42 + 0.7));
    const g = gate * gate;
    flLeg.leg.rotation.x = g * (0.3 + 0.28 * Math.sin(t * 5.6));
    flLeg.knee.rotation.x = -g * (0.55 + 0.3 * Math.sin(t * 5.6 + 1.1));

    // breath and small weight shifts
    const breath = Math.sin(t * 1.1);
    root.position.y = 0.012 * breath;
    root.rotation.z = Math.sin(t * 0.5 + 1.0) * 0.022 - g * 0.025;
    chest.scale.y = 0.85 + 0.012 * breath;

    // head lowers into the pawing, otherwise scans slowly
    headGrp.rotation.x = Math.sin(t * 0.7) * 0.05 - g * 0.22;
    headGrp.rotation.y = Math.sin(t * 0.27 + 0.8) * 0.3 * (1 - g);

    // tail swishes, faster when worked up; the tuft whips a beat behind
    tail.rotation.z = Math.sin(t * (1.6 + g * 2.5)) * (0.18 + g * 0.2);
    tail.rotation.x = 0.35 + Math.sin(t * 0.9) * 0.06;
    tuft.rotation.z = Math.sin(t * (1.6 + g * 2.5) - 1.1) * (0.22 + g * 0.18);

    // ears flick independently — quick nervous swivels over the slow scan
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      const flick = Math.max(0, Math.sin(t * 1.9 + e.ph));
      e.m.rotation.z = e.z0 + flick * flick * flick * 0.18 * (i === 0 ? 1 : -1);
    }

    // the golden horn pulses like a slow heartbeat; wet eyes catch it late
    const pulse = Math.sin(t * 2.3) * 0.5 + Math.sin(t * 5.9) * 0.18;
    hornMat.emissiveIntensity = 2.3 + pulse * 1.6;
    eyeMat.emissiveIntensity = 0.35 + Math.max(0, Math.sin(t * 2.3 - 1.2)) * 0.3;
    light.color.lerpColors(C_BLUE, C_GOLD, Math.max(0, pulse) * 0.55);
    light.intensity = 14 + Math.sin(t * 1.7 + 0.4) * 1.4 + Math.max(0, pulse) * 3.5;

    // mist drifts in a slow ring
    motes.rotation.y = t * 0.16;
    motes.position.y = Math.sin(t * 0.55) * 0.06;
    moteMat.opacity = 0.38 + 0.16 * Math.sin(t * 1.9 + 1.3);
  }

  return { group, update };
}
