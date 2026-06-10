// La Pincoya — beautiful dancer of the shore, arms raised toward the sea.
// Tall slim silhouette with a raised-arm "V", warm golden glow.
import * as THREE from 'three';

export function createPincoya() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // animated inner root; group transform belongs to main.js
  group.add(root);

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a273, roughness: 0.75, flatShading: true,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    // golden, per the myth — muted for the moonlit palette
    color: 0x9a7430, roughness: 0.9, flatShading: true,
  });
  const dressMat = new THREE.MeshStandardMaterial({
    color: 0x1d4a35, roughness: 0.85, flatShading: true,
  });
  const dressMat2 = new THREE.MeshStandardMaterial({
    color: 0x2c6644, roughness: 0.85, flatShading: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffc875, emissive: 0xffb347, emissiveIntensity: 2.4,
    roughness: 0.4,
  });

  // ---------- skirt of seaweed (lathe gown) ----------
  const skirtPts = [
    new THREE.Vector2(0.03, 0.0),
    new THREE.Vector2(0.50, 0.0),
    new THREE.Vector2(0.44, 0.20),
    new THREE.Vector2(0.30, 0.55),
    new THREE.Vector2(0.21, 0.85),
    new THREE.Vector2(0.19, 1.0),
  ];
  const skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtPts, 10), dressMat);
  root.add(skirt);

  // hanging kelp strands around the waist
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = 0.55 + 0.3 * (((i * 37) % 5) / 5);
    const strand = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, len, 5), i % 2 ? dressMat2 : dressMat,
    );
    strand.position.set(Math.cos(a) * 0.27, 0.92 - len * 0.5, Math.sin(a) * 0.27);
    strand.rotation.z = Math.cos(a) * 0.22;
    strand.rotation.x = -Math.sin(a) * 0.22;
    root.add(strand);
  }

  // ---------- torso / chest / neck / head ----------
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.2, 0.44, 8), dressMat2);
  torso.position.y = 1.2;
  root.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 6), dressMat2);
  chest.position.y = 1.4;
  chest.scale.set(1.15, 0.72, 0.85);
  root.add(chest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6), skinMat);
  neck.position.y = 1.53;
  root.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), skinMat);
  head.position.set(0, 1.67, 0.01);
  root.add(head);

  // hair: cap + long fall down the back
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 9, 7), hairMat);
  hairCap.position.set(0, 1.71, -0.03);
  hairCap.scale.set(1.02, 1.0, 1.05);
  root.add(hairCap);

  const backHairGeo = new THREE.CylinderGeometry(0.04, 0.15, 0.85, 7);
  backHairGeo.translate(0, -0.425, 0);
  const backHair = new THREE.Mesh(backHairGeo, hairMat);
  backHair.position.set(0, 1.7, -0.13);
  backHair.rotation.x = 0.14;
  root.add(backHair);

  const sideHairGeo = new THREE.CylinderGeometry(0.025, 0.06, 0.5, 5);
  sideHairGeo.translate(0, -0.25, 0);
  const sideL = new THREE.Mesh(sideHairGeo, hairMat);
  sideL.position.set(-0.12, 1.7, -0.02);
  sideL.rotation.z = -0.12;
  root.add(sideL);
  const sideR = new THREE.Mesh(sideHairGeo, hairMat);
  sideR.position.set(0.12, 1.7, -0.02);
  sideR.rotation.z = 0.12;
  root.add(sideR);

  // golden garland crown — the emissive accent
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 6, 14), glowMat);
  crown.position.set(0, 1.77, -0.01);
  crown.rotation.x = Math.PI / 2 - 0.18;
  root.add(crown);

  // ---------- raised arms (pivot groups at the shoulders) ----------
  function limb(len, rTop, rBot, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 6);
    g.translate(0, len / 2, 0); // pivot at lower end, extends +y
    return new THREE.Mesh(g, mat);
  }

  const armL = new THREE.Group();
  armL.position.set(-0.2, 1.46, 0);
  const upperL = limb(0.42, 0.04, 0.052, skinMat);
  armL.add(upperL);
  const foreL = new THREE.Group();
  foreL.position.y = 0.42;
  foreL.rotation.z = -0.38;
  foreL.add(limb(0.36, 0.034, 0.042, skinMat));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat);
  handL.position.y = 0.39;
  foreL.add(handL);
  armL.add(foreL);
  root.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.2, 1.46, 0);
  const upperR = limb(0.42, 0.04, 0.052, skinMat);
  armR.add(upperR);
  const foreR = new THREE.Group();
  foreR.position.y = 0.42;
  foreR.rotation.z = 0.38;
  foreR.add(limb(0.36, 0.034, 0.042, skinMat));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat);
  handR.position.y = 0.39;
  foreR.add(handR);
  root.add(armR);

  // base raised pose: out + slightly toward the sea (+Z)
  armL.rotation.set(0.22, 0, 0.62);
  armR.rotation.set(0.22, 0, -0.62);

  // ---------- warm golden light ----------
  const light = new THREE.PointLight(0xffc06a, 30, 32, 1.8);
  light.position.set(0, 1.85, 0.25);
  group.add(light);

  // ---------- drifting golden motes ----------
  const MOTES = 42;
  const moteArr = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const s2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
    const s3 = Math.sin(i * 419.2 + 371.9) * 43758.5453;
    const f1 = s1 - Math.floor(s1), f2 = s2 - Math.floor(s2), f3 = s3 - Math.floor(s3);
    const ang = f1 * Math.PI * 2;
    const rad = 0.35 + f2 * 0.85;
    moteArr[i * 3] = Math.cos(ang) * rad;
    moteArr[i * 3 + 1] = 0.25 + f3 * 1.95;
    moteArr[i * 3 + 2] = Math.sin(ang) * rad;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(moteArr, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xffd28a, size: 0.06, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  // ---------- idle dance ----------
  function update(t) {
    // body sways and slowly turns, as if dancing on the tide line
    root.rotation.y = Math.sin(t * 0.45) * 0.2;
    root.rotation.z = Math.sin(t * 0.9) * 0.045;
    root.position.y = 0.035 * Math.sin(t * 1.8) * Math.sin(t * 1.8);
    skirt.rotation.y = Math.sin(t * 0.7) * 0.1;

    // arms wave gently, offset like a slow rite
    armL.rotation.z = 0.62 + Math.sin(t * 0.9) * 0.13;
    armR.rotation.z = -0.62 - Math.sin(t * 0.9 + 0.7) * 0.13;
    armL.rotation.x = 0.22 + Math.sin(t * 0.6) * 0.08;
    armR.rotation.x = 0.22 + Math.sin(t * 0.6 + 0.5) * 0.08;
    foreL.rotation.z = -0.38 + Math.sin(t * 1.1 + 1.0) * 0.1;
    foreR.rotation.z = 0.38 - Math.sin(t * 1.1) * 0.1;

    // hair answers the sway a beat behind
    backHair.rotation.z = Math.sin(t * 0.9 - 0.8) * 0.07;

    // warm glow breathes; motes circle upward-ish
    light.intensity = 30 + Math.sin(t * 2.1) * 3 + Math.sin(t * 5.3) * 1.2;
    glowMat.emissiveIntensity = 2.4 + Math.sin(t * 2.1) * 0.5;
    motes.rotation.y = t * 0.28;
    motes.position.y = Math.sin(t * 0.8) * 0.07;
    moteMat.opacity = 0.55 + 0.2 * Math.sin(t * 2.7 + 1.0);
  }

  return { group, update };
}
