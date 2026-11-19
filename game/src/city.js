// city.js - generates the fictional coastal city of Solmara for
// Neon Harbor: Vice Run: a 6x6 street grid of pastel art-deco blocks, palm
// trees, street lamps, a beach and the ocean to the east, plus a dock pier.
// Also owns the static collision boxes and road queries every other system
// (traffic, police, player) navigates by.
NH.City = (function () {
  const STREETS = [-140, -84, -28, 28, 84, 140];   // street centre lines (x and z)
  const BLOCKS = [-112, -56, 0, 56, 112];          // block centres between streets
  const ROAD_HALF = 8;                             // half road width
  const BLOCK_HALF = 20;                           // half block width
  const EDGE = 172;                                // city ground edge
  const PASTELS = [0xf7d9c4, 0xf9e79f, 0xaed6f1, 0xf5b7b1, 0xd2b4de, 0xa3e4d7, 0xfdebd0, 0xf8c471, 0xaeb6bf, 0xf1948a];

  let colliders = [];        // {minX,maxX,minZ,maxZ} solid boxes (buildings)
  let nightMats = [];        // materials whose emissive changes at night
  let lampHeadMat = null;
  let oceanMat = null;
  let group = null;

  // Procedural building facade: one canvas texture, tinted per building.
  function facadeTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) {
      const lit = NH.rng() < 0.28;
      g.fillStyle = lit ? '#ffd873' : '#33455c';
      g.fillRect(10 + x * 23, 14 + y * 24, 14, 15);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(10 + x * 23, 14 + y * 24, 14, 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 248, 128, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Matching emissive map: black except for the lit windows, so at night
  // only the windows glow - not the whole facade.
  function facadeGlowTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) {
      if (NH.rng() < 0.42) {
        g.fillStyle = NH.rng() < 0.8 ? '#ffc37a' : '#9fd8ff';
        g.fillRect(10 + x * 23, 14 + y * 24, 14, 15);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function roadTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#33383f'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#f7dc6f'; g.fillRect(30, 4, 4, 24);   // centre dash
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 0, 2, 64); g.fillRect(60, 0, 2, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makePalm(x, z) {
    const palm = new THREE.Group();
    const trunkMat = NH.CityMats.trunk, leafMat = NH.CityMats.leaf;
    const trunk = new THREE.Mesh(NH.CityGeo.trunk, trunkMat);
    trunk.position.y = 3.1; trunk.rotation.z = NH.rand(-0.09, 0.09);
    trunk.castShadow = true;
    palm.add(trunk);
    const crown = new THREE.Mesh(NH.CityGeo.crown, leafMat);
    crown.position.y = 6.3; crown.scale.y = 0.45; crown.castShadow = true;
    palm.add(crown);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(NH.CityGeo.frond, leafMat);
      const a = (i / 5) * Math.PI * 2 + NH.rand(-0.3, 0.3);
      frond.position.set(Math.sin(a) * 1.5, 6.5, Math.cos(a) * 1.5);
      frond.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    return palm;
  }

  function makeLamp(x, z) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(NH.CityGeo.lampPole, NH.CityMats.metal);
    pole.position.y = 3; lamp.add(pole);
    const head = new THREE.Mesh(NH.CityGeo.lampHead, lampHeadMat);
    head.position.y = 6.1; lamp.add(head);
    lamp.position.set(x, 0, z);
    return lamp;
  }

  function build(scene) {
    group = new THREE.Group();
    colliders = []; nightMats = [];
    NH.CityMats = {
      trunk: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x2e9e5b }),
      metal: new THREE.MeshLambertMaterial({ color: 0x3c4653 })
    };
    NH.CityGeo = {
      trunk: new THREE.CylinderGeometry(0.16, 0.26, 6.4, 6),
      crown: new THREE.IcosahedronGeometry(1.5, 0),
      frond: new THREE.ConeGeometry(0.5, 3.4, 4),
      lampPole: new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
      lampHead: new THREE.SphereGeometry(0.32, 8, 6)
    };
    lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x000000 });
    nightMats.push(lampHeadMat);

    // --- ground, beach, ocean ---
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0xb8a888 }));
    ground.rotation.x = -Math.PI / 2; ground.position.x = 30; ground.receiveShadow = true;
    group.add(ground);

    const beach = new THREE.Mesh(new THREE.PlaneGeometry(46, 560),
      new THREE.MeshLambertMaterial({ color: 0xe8d194 }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(196, 0.015, 0); beach.receiveShadow = true;
    group.add(beach);

    oceanMat = new THREE.MeshLambertMaterial({ color: 0x1a6f9e, transparent: true, opacity: 0.92 });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(560, 700), oceanMat);
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(219 + 280, 0.12, 0);
    group.add(ocean);

    // --- roads ---
    const roadTex = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    for (const s of STREETS) {
      const len = EDGE * 2 + 30;
      const vTex = roadTex.clone(); vTex.needsUpdate = true; vTex.repeat.set(1, len / 16);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len),
        new THREE.MeshLambertMaterial({ map: vTex }));
      v.rotation.x = -Math.PI / 2; // width across X, length along Z: a north-south street
      v.position.set(s, 0.03, 0); v.receiveShadow = true; group.add(v);
      const hTex = roadTex.clone(); hTex.needsUpdate = true; hTex.repeat.set(len / 16, 1);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD_HALF * 2),
        new THREE.MeshLambertMaterial({ map: hTex }));
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.031, s); h.receiveShadow = true; group.add(h);
    }

    // --- blocks: sidewalks, buildings, parks, parking lots ---
    const facade = facadeTexture();
    const facadeGlow = facadeGlowTexture();
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc4ae });
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x6fae5f });
    const lotMat = new THREE.MeshLambertMaterial({ color: 0x565d66 });
    const roofMats = [];
    NH.CityParkingSpots = [];

    for (const bx of BLOCKS) for (const bz of BLOCKS) {
      const kind = NH.rng();
      const baseMat = kind < 0.16 ? parkMat : (kind < 0.30 ? lotMat : walkMat);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_HALF * 2, 0.24, BLOCK_HALF * 2), baseMat);
      slab.position.set(bx, 0.12, bz); slab.receiveShadow = true; group.add(slab);

      if (kind < 0.16) { // park: palms and grass, no buildings
        for (let i = 0; i < 5; i++)
          group.add(makePalm(bx + NH.rand(-15, 15), bz + NH.rand(-15, 15)));
        continue;
      }
      if (kind < 0.30) { // parking lot: register spots for parked cars
        for (let i = 0; i < 4; i++)
          NH.CityParkingSpots.push({ x: bx - 12 + i * 8, z: bz, heading: Math.PI / 2 });
        continue;
      }
      // 1-4 buildings per block
      const layout = NH.rng();
      const spots = layout < 0.4 ? [[0, 0, 30, 30]]
        : layout < 0.75 ? [[-10, -10, 17, 17], [10, 10, 17, 17], [-10, 10, 17, 17], [10, -10, 17, 17]]
        : [[0, -10, 32, 16], [0, 11, 32, 14]];
      for (const [ox, oz, w, d] of spots) {
        const hgt = NH.rand(10, 34) * (Math.abs(bx) < 60 && Math.abs(bz) < 60 ? 1.35 : 1);
        const tint = NH.pick(PASTELS);
        const tex = facade.clone(); tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 11)), Math.max(1, Math.round(hgt / 11)));
        const glow = facadeGlow.clone(); glow.needsUpdate = true;
        glow.repeat.copy(tex.repeat);
        const mat = new THREE.MeshLambertMaterial({ map: tex, color: tint, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0 });
        nightMats.push(mat); roofMats.push(mat);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), mat);
        b.position.set(bx + ox, hgt / 2 + 0.2, bz + oz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: bx + ox - w / 2, maxX: bx + ox + w / 2, minZ: bz + oz - d / 2, maxZ: bz + oz + d / 2 });
      }
    }

    // --- palms along sidewalks and the beach, lamps at corners ---
    for (const sx of STREETS) for (const sz of STREETS) {
      if (NH.rng() < 0.75) group.add(makePalm(sx + 11.5, sz + 11.5));
      if (NH.rng() < 0.6) group.add(makePalm(sx - 11.5, sz - 11.5));
      group.add(makeLamp(sx + 9.5, sz - 9.5));
      if (NH.rng() < 0.5) group.add(makeLamp(sx - 9.5, sz + 9.5));
    }
    for (let z = -160; z <= 160; z += 26) group.add(makePalm(182, z + NH.rand(-4, 4)));

    // --- dock pier on the east shore ---
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 18), pierMat);
    pier.position.set(212, 0.7, -84); pier.castShadow = true; group.add(pier);
    for (let i = 0; i < 4; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6),
        new THREE.MeshLambertMaterial({ color: NH.pick([0xb08954, 0x7f9c96, 0xc46a4a]) }));
      crate.position.set(196 + i * 9, 2.5, -88 + (i % 2) * 7);
      crate.castShadow = true; group.add(crate);
      colliders.push({ minX: crate.position.x - 1.3, maxX: crate.position.x + 1.3, minZ: crate.position.z - 1.3, maxZ: crate.position.z + 1.3 });
    }

    scene.add(group);
    return { colliders: colliders };
  }

  function isRoad(x, z) {
    for (const s of STREETS) if (Math.abs(x - s) < ROAD_HALF + 0.5 || Math.abs(z - s) < ROAD_HALF + 0.5) return true;
    return false;
  }

  // Nearest street centre line value to a coordinate (for lane logic).
  function nearestStreet(v) {
    let best = STREETS[0], bd = Infinity;
    for (const s of STREETS) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  function setNight(f) { // f: 0 = day, 1 = night
    for (const m of nightMats) if (m !== lampHeadMat) m.emissiveIntensity = 0.75 * f;
    lampHeadMat.emissive.setRGB(1.0 * f, 0.85 * f, 0.45 * f);
    if (oceanMat) oceanMat.color.setHex(f > 0.5 ? 0x0d3350 : 0x1a6f9e);
  }

  return {
    build: build, isRoad: isRoad, nearestStreet: nearestStreet, setNight: setNight,
    STREETS: STREETS, BLOCKS: BLOCKS, ROAD_HALF: ROAD_HALF, EDGE: EDGE,
    get colliders() { return colliders; }
  };
})();
