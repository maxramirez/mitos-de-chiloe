// La Sirena chilota — mermaid daughter of Millalobo, seated on her rock at
// the water's edge, pearly tail draped down the stone, slowly combing her
// long golden hair. Cool aqua glow.
import * as THREE from 'three';

export function createSirena() {
  const group = new THREE.Group();
  const fig = new THREE.Group(); // the mermaid (idle sway); rocks stay still
  group.add(fig);

  const rnd = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6bd92, roughness: 0.7, flatShading: true,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0xd9ae5f, roughness: 0.8, flatShading: true,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xb9ded6, metalness: 0.5, roughness: 0.28, flatShading: true,
    emissive: 0x2e6058, emissiveIntensity: 0.45, // pearly sheen in fog
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3a4046, roughness: 0.55, metalness: 0.1, flatShading: true,
  });
  const aquaMat = new THREE.MeshStandardMaterial({
    color: 0x9ffce8, emissive: 0x7fffe0, emissiveIntensity: 2.4, roughness: 0.35,
  });

  // ---------- her rock, and a low stone where the tail dips ----------
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), rockMat);
  rock.position.y = 0.42;
  rock.scale.set(1.15, 0.75, 1.0);
  rock.rotation.y = 0.55;
  group.add(rock);
  const rockB = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), rockMat);
  rockB.position.set(0.12, 0.1, 1.32);
  rockB.scale.set(1.2, 0.5, 1.0);
  rockB.rotation.y = 2.3;
  group.add(rockB);
  const rockC = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), rockMat);
  rockC.position.set(-0.95, 0.06, 0.35);
  rockC.scale.set(1.0, 0.5, 1.1);
  rockC.rotation.y = 4.0;
  group.add(rockC);

  // ---------- torso ----------
  const hipsM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), tailMat);
  hipsM.position.set(0, 1.05, 0.12);
  hipsM.scale.set(1.1, 0.8, 1.0);
  fig.add(hipsM);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.42, 8), skinMat);
  torso.position.set(0, 1.32, 0.06);
  torso.rotation.x = -0.06;
  fig.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skinMat);
  chest.position.set(0, 1.52, 0.05);
  chest.scale.set(1.1, 0.75, 0.8);
  fig.add(chest);

  // pearl strand at the throat
  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 12), aquaMat);
  necklace.position.set(0, 1.62, 0.04);
  necklace.rotation.x = 1.35;
  fig.add(necklace);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 6), skinMat);
  neck.position.set(0, 1.7, 0.03);
  fig.add(neck);

  // ---------- head (tilts with the combing) ----------
  const headG = new THREE.Group();
  headG.position.set(0, 1.8, 0.03);
  headG.rotation.z = -0.16; // leaned toward the comb
  fig.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 9, 7), skinMat);
  headG.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), hairMat);
  hairCap.position.set(0, 0.035, -0.035);
  hairCap.scale.set(1.02, 1.0, 1.06);
  headG.add(hairCap);

  // long golden hair: a fall down the back, and the lock she combs
  const backHairGeo = new THREE.CylinderGeometry(0.045, 0.16, 0.8, 7);
  backHairGeo.translate(0, -0.4, 0);
  const backHair = new THREE.Mesh(backHairGeo, hairMat);
  backHair.position.set(0, 1.84, -0.12);
  backHair.rotation.x = 0.16;
  fig.add(backHair);

  const frontFallGeo = new THREE.CylinderGeometry(0.04, 0.1, 0.75, 6);
  frontFallGeo.translate(0, -0.375, 0);
  const frontFall = new THREE.Mesh(frontFallGeo, hairMat);
  frontFall.position.set(0.12, 1.84, 0.05);
  frontFall.rotation.z = -0.3;
  frontFall.rotation.x = 0.12;
  fig.add(frontFall);

  // ---------- arms ----------
  function limb(len, rTop, rBot) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 6);
    g.translate(0, len / 2, 0); // pivot at lower end
    return new THREE.Mesh(g, skinMat);
  }

  // right arm raised, combing the lock over her shoulder
  const armR = new THREE.Group();
  armR.position.set(0.19, 1.56, 0.03);
  armR.rotation.z = -1.9;
  armR.add(limb(0.32, 0.035, 0.045));
  const foreR = new THREE.Group();
  foreR.position.y = 0.32;
  foreR.rotation.z = 2.15;
  foreR.add(limb(0.3, 0.03, 0.038));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), skinMat);
  handR.position.y = 0.32;
  foreR.add(handR);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.025), aquaMat);
  comb.position.set(0.02, 0.36, 0.01);
  comb.rotation.z = 0.55;
  foreR.add(comb);
  armR.add(foreR);
  fig.add(armR);

  // left arm braced back on the stone
  const armL = new THREE.Group();
  armL.position.set(-0.19, 1.56, 0.03);
  armL.rotation.z = 2.55;
  armL.rotation.x = -0.55;
  armL.add(limb(0.52, 0.035, 0.05));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat);
  handL.position.y = 0.54;
  handL.scale.set(1.2, 0.5, 1.3);
  armL.add(handL);
  fig.add(armL);

  // ---------- the pearly tail, draped down the rock, fluke curling up ----------
  const segLens = [0.5, 0.45, 0.4, 0.35];
  const segRads = [0.17, 0.13, 0.1, 0.07, 0.045];
  const segBends = [-0.55, -0.45, -0.5, -0.55];
  const tailSegs = [];
  let parent = fig;
  let attachY = 1.02, attachZ = 0.22;
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    if (i === 0) g.position.set(0, attachY, attachZ);
    else g.position.set(0, -segLens[i - 1], 0);
    g.rotation.x = segBends[i];
    const geo = new THREE.CylinderGeometry(segRads[i + 1], segRads[i], segLens[i], 7);
    geo.translate(0, -segLens[i] / 2, 0);
    g.add(new THREE.Mesh(geo, tailMat));
    // a pearl glint on each joint
    if (i < 3) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4), aquaMat);
      pearl.position.set(0, -segLens[i] * 0.55, segRads[i + 1] * 0.95);
      g.add(pearl);
    }
    parent.add(g);
    tailSegs.push(g);
    parent = g;
  }
  // fluke — two flattened fins splayed from the tail tip
  const flukeG = new THREE.Group();
  flukeG.position.set(0, -segLens[3], 0);
  tailSegs[3].add(flukeG);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), tailMat);
    fin.position.set(s * 0.1, -0.15, 0);
    fin.rotation.z = Math.PI + s * 0.55;
    fin.scale.set(0.85, 1, 0.28);
    flukeG.add(fin);
  }
  const tipPearl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), aquaMat);
  tipPearl.position.set(0, -0.02, 0);
  flukeG.add(tipPearl);

  // ---------- cool aqua glow ----------
  const light = new THREE.PointLight(0x7fe8d8, 28, 30, 1.8);
  light.position.set(0.3, 1.7, 0.6);
  group.add(light);

  // ---------- sea-spray sparkles ----------
  const N = 30;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd(i + 70) * Math.PI * 2;
    const r = 0.5 + rnd(i + 80) * 1.2;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = 0.1 + rnd(i + 90) * 1.9;
    arr[i * 3 + 2] = Math.sin(a) * r;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xa8ffe9, size: 0.05, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  // ---------- combing idle ----------
  function update(t) {
    // the comb strokes down the lock, again and again
    const s = Math.sin(t * 1.5);
    armR.rotation.z = -1.9 + s * 0.15;
    foreR.rotation.z = 2.15 + s * 0.35;
    headG.rotation.z = -0.16 + s * 0.045;
    headG.rotation.y = Math.sin(t * 0.31) * 0.12;
    frontFall.rotation.z = -0.3 + Math.sin(t * 1.5 - 0.6) * 0.05;

    // gentle sway on the rock; tail tip flicks at the water
    fig.rotation.y = Math.sin(t * 0.4) * 0.05;
    fig.position.y = Math.sin(t * 0.9) * 0.012;
    tailSegs[3].rotation.x = segBends[3] + Math.sin(t * 0.85) * 0.12;
    tailSegs[2].rotation.x = segBends[2] + Math.sin(t * 0.85 - 0.7) * 0.05;

    // pearl-light shimmer
    aquaMat.emissiveIntensity = 2.4 + Math.sin(t * 2.2) * 0.5;
    tailMat.emissiveIntensity = 0.45 + Math.sin(t * 1.1 + 2.0) * 0.12;
    light.intensity = 28 + Math.sin(t * 2.2) * 3 + Math.sin(t * 5.9) * 0.9;

    motes.rotation.y = t * 0.22;
    moteMat.opacity = 0.45 + 0.2 * Math.sin(t * 2.6);
  }

  return { group, update };
}
