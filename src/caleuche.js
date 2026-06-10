// El Caleuche — the ghost galleon of Chiloé. ~45 m, bow toward LOCAL +Z,
// waterline at local y = 0. Dark hull ringed with faintly glowing wales,
// three masts of pale spectral sails, green lanterns burning through the fog.
// update(t) bobs/rolls an inner child and shimmers the sails ONLY —
// main.js owns the group's world position and rotation.y.
import * as THREE from 'three';

export function createCaleuche() {
  const group = new THREE.Group();
  const root = new THREE.Group(); // all ship parts; bob/roll applied here
  group.add(root);

  const rnd = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- materials ----------
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x10171a, emissive: 0x0c241c, emissiveIntensity: 0.3,
    roughness: 0.85, flatShading: true,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x1b2023, roughness: 1.0, flatShading: true,
  });
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x14171a, roughness: 0.9, flatShading: true,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x0c0f10, roughness: 1.0,
  });
  const waleMat = new THREE.MeshStandardMaterial({
    color: 0x14241c, emissive: 0x9fffd0, emissiveIntensity: 0.7, roughness: 0.7,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x0c1410, emissive: 0x9fffd0, emissiveIntensity: 1.8, roughness: 0.5,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0x2c463e, emissive: 0x9fffd0, emissiveIntensity: 1.5,
    transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
    roughness: 0.6,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xeafff4, emissive: 0x9fffd0, emissiveIntensity: 3.0, roughness: 0.3,
  });

  // ---------- hull: a lathe bowl stretched into a 34 m hull, beam ~10 ----------
  const hullPts = [
    new THREE.Vector2(0.4, -2.7),
    new THREE.Vector2(8.0, -2.3),
    new THREE.Vector2(13.0, -1.1),
    new THREE.Vector2(15.6, 0.6),
    new THREE.Vector2(16.6, 2.3),
    new THREE.Vector2(16.3, 3.7),
    new THREE.Vector2(15.8, 4.6),
  ];
  const hull = new THREE.Mesh(new THREE.LatheGeometry(hullPts, 16), hullMat);
  hull.scale.set(0.3, 1, 1); // long axis = Z (bow +Z)
  root.add(hull);

  const deck = new THREE.Mesh(new THREE.CircleGeometry(15.7, 16), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.scale.set(0.3, 1, 1);
  deck.position.y = 3.4;
  root.add(deck);

  // glowing wales — elliptical strakes that draw the hull out of the fog
  const waleData = [
    [16.75, 2.2],
    [16.45, 3.4],
    [15.95, 4.6], // rail
  ];
  for (const [r, y] of waleData) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.13, 5, 48), waleMat);
    w.rotation.x = Math.PI / 2;
    w.scale.set(0.3, 1, 1);
    w.position.y = y;
    root.add(w);
  }

  // ---------- stern castle ----------
  const quarter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.4, 7), hullMat);
  quarter.position.set(0, 5.4, -10);
  root.add(quarter);
  const poop = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.8, 4), hullMat);
  poop.position.set(0, 7.5, -12.4);
  root.add(poop);
  // stern gallery windows, lit from within by no living flame
  const gal1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 0.2), windowMat);
  gal1.position.set(0, 5.7, -13.6);
  root.add(gal1);
  const gal2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.2), windowMat);
  gal2.position.set(0, 7.7, -14.48);
  root.add(gal2);

  // ---------- forecastle ----------
  const fore = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.8, 4.0), hullMat);
  fore.position.set(0, 4.3, 11.5);
  root.add(fore);

  // ---------- spar helper (build-time only) ----------
  const UP = new THREE.Vector3(0, 1, 0);
  const DIR = new THREE.Vector3();
  function spar(x1, y1, z1, x2, y2, z2, r1, r2, mat) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 6), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    DIR.set(dx / len, dy / len, dz / len);
    m.quaternion.setFromUnitVectors(UP, DIR);
    root.add(m);
    return m;
  }

  // ---------- bow: stem, beakhead and bowsprit ----------
  spar(0, 0.6, 15.5, 0, 5.0, 20.2, 0.2, 0.32, hullMat); // rising stem
  spar(-1.3, 4.4, 14.2, 0, 5.0, 20.0, 0.07, 0.07, mastMat); // beak rails
  spar(1.3, 4.4, 14.2, 0, 5.0, 20.0, 0.07, 0.07, mastMat);
  spar(0, 5.2, 16.5, 0, 8.6, 27.0, 0.12, 0.2, mastMat); // bowsprit
  // spectral figurehead — a pale orb where a saint's face should be
  const figurehead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), lanternMat);
  figurehead.position.set(0, 5.3, 20.5);
  root.add(figurehead);

  // ---------- masts, tops, yards and sails ----------
  // masts: [z, base y, top y]
  const mastDefs = [
    [9.5, 3.4, 22.4], // fore
    [0.5, 3.4, 27.4], // main
    [-9.5, 6.6, 22.6], // mizzen
  ];
  for (const [z, y0, y1] of mastDefs) {
    spar(0, y0, z, 0, y1, z, 0.22, 0.42, mastMat);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.22, 8), mastMat);
    top.position.set(0, y0 + (y1 - y0) * 0.68, z);
    root.add(top);
  }

  // billowing square sail, ragged at the foot, hanging from y=0 downward
  let sailSeed = 0;
  function makeSailGeo(w, h) {
    const geo = new THREE.PlaneGeometry(w, h, 8, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / w + 0.5;
      const ny = pos.getY(i) / h + 0.5;
      pos.setZ(i, Math.sin(nx * Math.PI) * (0.35 + 0.65 * (1 - ny)) * w * 0.1);
      if (ny < 0.01) {
        pos.setY(i, pos.getY(i) - rnd(sailSeed + i) * h * 0.09); // tattered foot
      }
    }
    sailSeed += 97;
    geo.translate(0, -h / 2, 0);
    geo.computeVertexNormals();
    return geo;
  }
  // sails: [w, h, top y, mast z]
  const sailDefs = [
    [10.5, 6.5, 10.5, 9.5], // fore course
    [7.5, 5.0, 16.8, 9.5], // fore topsail
    [12.0, 7.5, 11.2, 0.5], // main course
    [9.0, 6.0, 18.6, 0.5], // main topsail
    [6.2, 4.2, 24.2, 0.5], // main topgallant
    [8.0, 5.0, 13.2, -9.5], // mizzen course
    [5.6, 3.6, 17.8, -9.5], // mizzen topsail
  ];
  for (const [w, h, y, z] of sailDefs) {
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, w + 1.6, 6), mastMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, y + 0.15, z);
    root.add(yard);
    const sail = new THREE.Mesh(makeSailGeo(w, h), sailMat);
    sail.position.set(0, y, z + 0.35);
    root.add(sail);
  }

  // spectral pennants at the mastheads
  const flags = [];
  for (let i = 0; i < mastDefs.length; i++) {
    const geo = new THREE.PlaneGeometry(1.7, 0.5, 4, 1);
    geo.translate(0.85, 0, 0);
    const f = new THREE.Mesh(geo, sailMat);
    f.position.set(0, mastDefs[i][2] + 0.35, mastDefs[i][0]);
    root.add(f);
    flags.push(f);
  }

  // ---------- standing rigging ----------
  spar(0, 8.4, 26.2, 0, 22.2, 9.5, 0.045, 0.045, ropeMat); // forestay
  spar(0, 22.2, 9.5, 0, 27.2, 0.5, 0.045, 0.045, ropeMat);
  spar(0, 27.2, 0.5, 0, 22.4, -9.5, 0.045, 0.045, ropeMat);
  spar(0, 22.4, -9.5, 0, 8.6, -13.8, 0.045, 0.045, ropeMat);
  for (const [z, , y1] of mastDefs) {
    for (const s of [-1, 1]) {
      spar(s * 4.0, 4.6, z - 2.2, 0, y1 * 0.7, z, 0.04, 0.04, ropeMat);
      spar(s * 4.0, 4.6, z + 2.2, 0, y1 * 0.7, z, 0.04, 0.04, ropeMat);
    }
  }

  // ---------- ghost lanterns (3 PointLights, 0x9fffd0) ----------
  const lights = [];
  const lanternPos = [
    [-1.9, 9.1, -14.2], // stern, port
    [1.9, 9.1, -14.2], // stern, starboard
    [0, 5.9, 19.6], // bow, above the figurehead
  ];
  for (const [x, y, z] of lanternPos) {
    if (z < 0) spar(x, 8.4, z + 0.6, x, y + 0.35, z, 0.05, 0.05, mastMat); // stern posts
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), lanternMat);
    bulb.position.set(x, y, z);
    root.add(bulb);
    const l = new THREE.PointLight(0x9fffd0, 28, 38, 1.8);
    l.position.set(x, y, z);
    root.add(l);
    lights.push(l);
  }

  // ---------- faint mist clinging to the waterline (static in group) ----------
  const N = 140;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd(i + 200) * Math.PI * 2;
    arr[i * 3] = Math.cos(a) * (4 + rnd(i + 300) * 6.5);
    arr[i * 3 + 1] = 0.2 + rnd(i + 400) * 4.5;
    arr[i * 3 + 2] = Math.sin(a) * (16 + rnd(i + 500) * 9);
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mistMat = new THREE.PointsMaterial({
    color: 0x9fffd0, size: 1.5, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mist = new THREE.Points(mistGeo, mistMat);
  group.add(mist);

  // ---------- bob / roll / shimmer — strictly in place ----------
  function update(t) {
    // swell: bob + roll + slight pitch, all on the inner root
    root.position.y = Math.sin(t * 0.5) * 0.35 + Math.sin(t * 0.27 + 1.3) * 0.18;
    root.rotation.z = Math.sin(t * 0.43) * 0.02 + Math.sin(t * 0.19) * 0.008;
    root.rotation.x = Math.sin(t * 0.31 + 0.7) * 0.011;

    // the sails breathe their cold light
    sailMat.emissiveIntensity = 1.5 + Math.sin(t * 1.2) * 0.3 + Math.sin(t * 4.7 + 0.5) * 0.12;
    sailMat.opacity = 0.6 + Math.sin(t * 0.8 + 2.0) * 0.05;
    waleMat.emissiveIntensity = 0.7 + Math.sin(t * 1.7) * 0.15;
    windowMat.emissiveIntensity = 1.8 + Math.sin(t * 3.1) * 0.3;

    // lanterns gutter, each to its own rhythm
    for (let i = 0; i < lights.length; i++) {
      lights[i].intensity = 28 + Math.sin(t * 5.1 + i * 2.1) * 3 + Math.sin(t * 1.3 + i) * 2;
    }
    lanternMat.emissiveIntensity = 3.0 + Math.sin(t * 5.1) * 0.5;

    // pennants stream in a wind no one feels
    flags[0].rotation.y = Math.sin(t * 1.9) * 0.5;
    flags[1].rotation.y = Math.sin(t * 1.9 + 2.1) * 0.5;
    flags[2].rotation.y = Math.sin(t * 1.9 + 4.2) * 0.5;

    // mist sways and thins
    mist.rotation.y = Math.sin(t * 0.07) * 0.15;
    mist.position.y = Math.sin(t * 0.21) * 0.4;
    mistMat.opacity = 0.16 + Math.sin(t * 0.5) * 0.05;
  }

  return { group, update };
}
