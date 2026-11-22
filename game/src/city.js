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
  let palmSpots = [];        // Round 3: prop transforms pooled for instancing
  let lampSpots = [];

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

  // Round 3: a palm used to be 7 meshes and a lamp 2 — with ~80 palms and
  // ~55 lamps that was most of the city's draw calls. The makers below now
  // only record transforms; buildProps() raises them all as InstancedMeshes
  // (trunks, crowns, fronds, poles, heads = 5 draw calls for every prop).
  // Call sites still add the returned (empty) group, as before.
  function makePalm(x, z) {
    palmSpots.push({ x: x, z: z, lean: NH.rand(-0.09, 0.09), rot: NH.rand(0, Math.PI * 2) });
    return new THREE.Group();
  }

  function makeLamp(x, z) {
    lampSpots.push({ x: x, z: z });
    return new THREE.Group();
  }

  const propDummy = new THREE.Object3D();
  function setProp(mesh, i, x, y, z, rx, ry, rz, sy) {
    propDummy.position.set(x, y, z);
    propDummy.rotation.set(rx, ry, rz);
    propDummy.scale.set(1, sy || 1, 1);
    propDummy.updateMatrix();
    mesh.setMatrixAt(i, propDummy.matrix);
  }

  // Props are instanced per 4x4 city sector (not one city-wide mesh) so
  // frustum culling still drops off-screen sectors — a single city-wide
  // instanced mesh would draw every palm in every frame and in the
  // shadow pass, which costs more triangles than it saves calls.
  function sectorKey(x, z) {
    return (x < -86 ? 0 : x < 0 ? 1 : x < 86 ? 2 : 3) + ':' + (z < -88 ? 0 : z < 0 ? 1 : z < 88 ? 2 : 3);
  }
  function bucketBySector(spots) {
    const map = new Map();
    for (const p of spots) {
      const k = sectorKey(p.x, p.z);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    return map;
  }

  function buildProps(parent) {
    for (const spots of bucketBySector(palmSpots).values()) {
      const n = spots.length;
      const trunks = new THREE.InstancedMesh(NH.CityGeo.trunk, NH.CityMats.trunk, n);
      const crowns = new THREE.InstancedMesh(NH.CityGeo.crown, NH.CityMats.leaf, n);
      const fronds = new THREE.InstancedMesh(NH.CityGeo.frond, NH.CityMats.leaf, n * 5);
      let fi = 0;
      spots.forEach(function (p, i) {
        setProp(trunks, i, p.x, 3.1, p.z, 0, 0, p.lean);
        setProp(crowns, i, p.x, 6.3, p.z, 0, p.rot, 0, 0.45);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + p.rot;
          setProp(fronds, fi++, p.x + Math.sin(a) * 1.5, 6.5, p.z + Math.cos(a) * 1.5,
            Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
        }
      });
      trunks.castShadow = true; crowns.castShadow = true;
      parent.add(trunks); parent.add(crowns); parent.add(fronds);
    }
    for (const spots of bucketBySector(lampSpots).values()) {
      const poles = new THREE.InstancedMesh(NH.CityGeo.lampPole, NH.CityMats.metal, spots.length);
      const heads = new THREE.InstancedMesh(NH.CityGeo.lampHead, lampHeadMat, spots.length);
      spots.forEach(function (p, i) {
        setProp(poles, i, p.x, 3, p.z, 0, 0, 0);
        setProp(heads, i, p.x, 6.1, p.z, 0, 0, 0);
      });
      parent.add(poles); parent.add(heads);
    }
  }

  // Scale a geometry's UVs in place (bakes a texture repeat into the UVs
  // so merged geometry can share one material/texture).
  function scaleUv(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }

  // --- Round 3 street dressing: neon shop signs (invented Solmara
  // businesses, canvas-drawn, emissive so they glow after dark), shop
  // awnings, rooftop water tanks / AC boxes, and beach umbrellas by the
  // pier. Everything merges into a handful of meshes.
  function signTexture(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#101623'; g.fillRect(0, 0, 256, 80);
    g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(5, 5, 246, 70);
    g.font = 'bold 33px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, 128, 43);
    return new THREE.CanvasTexture(c);
  }

  function buildDressing(parent, roofSpots) {
    // neon blade signs on posts at street corners: [name, colour, x, z, faceX, faceZ]
    const SIGNS = [
      ['CAFÉ BRISA', '#ff7ac0', 37, 37, 28, 28],
      ['HOTEL PALMA', '#ffd94d', 37.5, 18.5, 28, 28],
      ['NEON RECORDS', '#5ee7ff', 37, -18.5, 28, -28],
      ['BAR CORAL', '#ff9e5e', -37.5, -18.5, -28, -28],
      ['SOLMARA SURF', '#7dffb0', 176, -58, 210, -58],
      ['PIER 9 DINER', '#c09aff', -18.5, 66, -28, 84]
    ];
    const poleGeos = [];
    for (const [name, color, x, z, fx, fz] of SIGNS) {
      const pole = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 6);
      pole.translate(x, 2.8, z); poleGeos.push(pole);
      const tex = signTexture(name, color);
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, side: THREE.DoubleSide });
      nightMats.push(mat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), mat);
      sign.position.set(x, 5.1, z);
      sign.rotation.y = Math.atan2(fx - x, fz - z);
      parent.add(sign);
    }
    const polesMesh = new THREE.Mesh(NH.mergeGeos(poleGeos), NH.CityMats.metal);
    parent.add(polesMesh);

    // awnings over shopfronts, hung on real building faces (from the
    // roof-spot list, so every awning has a building behind it), sloping
    // down toward the street on each building's south side
    const awnA = [], awnB = [];
    roofSpots.forEach(function (r, i) {
      if (i % 4 !== 1) return;
      const a = new THREE.BoxGeometry(Math.min(r.w * 0.62, 11), 0.14, 2.4);
      a.rotateX(-0.32);
      a.translate(r.x, 3.1, r.z - r.d / 2 - 1.0);
      (awnA.length <= awnB.length ? awnA : awnB).push(a);
    });
    const awnMatA = new THREE.MeshLambertMaterial({ color: 0x12a5a0 });
    const awnMatB = new THREE.MeshLambertMaterial({ color: 0xe2603f });
    if (awnA.length) { const m = new THREE.Mesh(NH.mergeGeos(awnA), awnMatA); m.castShadow = true; parent.add(m); }
    if (awnB.length) { const m = new THREE.Mesh(NH.mergeGeos(awnB), awnMatB); m.castShadow = true; parent.add(m); }

    // rooftop props on a rotating subset of buildings, merged per sector
    // (a single city-wide merged mesh would defeat frustum/shadow culling)
    const tankGeos = new Map(), acGeos = new Map();
    roofSpots.forEach(function (r, i) {
      const k = sectorKey(r.x, r.z);
      if (i % 3 === 0) {
        const t = new THREE.CylinderGeometry(1.1, 1.1, 2.3, 7);
        t.translate(r.x + r.w / 4, r.top + 1.15, r.z - r.d / 5);
        if (!tankGeos.has(k)) tankGeos.set(k, []);
        tankGeos.get(k).push(t);
      } else if (i % 3 === 1) {
        const a = new THREE.BoxGeometry(1.7, 1.1, 1.7);
        a.translate(r.x - r.w / 5, r.top + 0.55, r.z + r.d / 5);
        if (!acGeos.has(k)) acGeos.set(k, []);
        acGeos.get(k).push(a);
      }
    });
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x9c6b4a });
    for (const geos of tankGeos.values()) {
      const tanks = new THREE.Mesh(NH.mergeGeos(geos), tankMat);
      tanks.castShadow = true; parent.add(tanks);
    }
    const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
    for (const geos of acGeos.values()) {
      const acs = new THREE.Mesh(NH.mergeGeos(geos), acMat);
      acs.castShadow = true; parent.add(acs);
    }

    // beach umbrellas along the shore
    const umbPoles = [], umbTops = [];
    const umbColors = [0xff5e7a, 0xffd94d, 0x39c2d8, 0xff8c42, 0x7dd069, 0xc09aff];
    [-120, -70, -25, 30, 80, 125].forEach(function (z, i) {
      const x = 184 + (i % 3) * 3;
      const p = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6); p.translate(x, 1.3, z); umbPoles.push(p);
      const t = new THREE.ConeGeometry(2.1, 0.9, 9); NH.tintGeo(t, umbColors[i]); t.translate(x, 2.75, z); umbTops.push(t);
    });
    parent.add(new THREE.Mesh(NH.mergeGeos(umbPoles), NH.CityMats.metal));
    const umbMesh = new THREE.Mesh(NH.mergeGeos(umbTops),
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
    umbMesh.castShadow = true; parent.add(umbMesh);
  }

  function build(scene) {
    group = new THREE.Group();
    colliders = []; nightMats = [];
    palmSpots = []; lampSpots = [];
    NH.CityMats = {
      trunk: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x2e9e5b }),
      metal: new THREE.MeshLambertMaterial({ color: 0x3c4653 })
    };
    NH.CityGeo = {
      trunk: new THREE.CylinderGeometry(0.16, 0.26, 6.4, 5),
      crown: new THREE.IcosahedronGeometry(1.5, 0),
      frond: new THREE.ConeGeometry(0.5, 3.4, 3),
      lampPole: new THREE.CylinderGeometry(0.09, 0.12, 6, 5),
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

    // --- roads: Round 3 merged all 12 street planes into one mesh, with
    // each plane's texture repeat baked into its UVs (same look, 1 call) ---
    const roadTex = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const roadGeos = [];
    for (const s of STREETS) {
      const len = EDGE * 2 + 30;
      const vGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, len);
      scaleUv(vGeo, 1, len / 16);
      vGeo.rotateX(-Math.PI / 2); vGeo.translate(s, 0.03, 0);
      roadGeos.push(vGeo);
      const hGeo = new THREE.PlaneGeometry(len, ROAD_HALF * 2);
      scaleUv(hGeo, len / 16, 1);
      hGeo.rotateX(-Math.PI / 2); hGeo.translate(0, 0.031, s);
      roadGeos.push(hGeo);
    }
    const roadsMesh = new THREE.Mesh(NH.mergeGeos(roadGeos), roadMat);
    roadsMesh.receiveShadow = true; group.add(roadsMesh);

    // --- blocks: sidewalks, buildings, parks, parking lots ---
    const facade = facadeTexture();
    const facadeGlow = facadeGlowTexture();
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc4ae });
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x6fae5f });
    const lotMat = new THREE.MeshLambertMaterial({ color: 0x565d66 });
    const roofMats = [];
    NH.CityParkingSpots = [];
    // Round 3 merge collectors: slabs grouped by material, buildings by
    // facade-repeat bucket (per-building tint rides in vertex colours),
    // roof spots remembered for the rooftop props in buildDressing().
    const slabGeos = new Map();
    const buildingBuckets = new Map();
    const buildingMats = new Map();
    const roofSpots = [];

    for (const bx of BLOCKS) for (const bz of BLOCKS) {
      const kind = NH.rng();
      const baseMat = kind < 0.16 ? parkMat : (kind < 0.30 ? lotMat : walkMat);
      const slabGeo = new THREE.BoxGeometry(BLOCK_HALF * 2, 0.24, BLOCK_HALF * 2);
      slabGeo.translate(bx, 0.12, bz);
      const slabKey = baseMat.uuid + '@' + sectorKey(bx, bz);
      if (!slabGeos.has(slabKey)) slabGeos.set(slabKey, { mat: baseMat, geos: [] });
      slabGeos.get(slabKey).geos.push(slabGeo);

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
        // Buildings sharing a facade-repeat bucket merge into one mesh;
        // the bucket material is created once (its textures carry the
        // bucket repeat, exactly as the per-building clones did), and the
        // per-building pastel moves into vertex colours.
        const rx = Math.max(1, Math.round(w / 11)), ry = Math.max(1, Math.round(hgt / 11));
        const repKey = rx + 'x' + ry;
        if (!buildingMats.has(repKey)) {
          const tex = facade.clone(); tex.needsUpdate = true; tex.repeat.set(rx, ry);
          const glow = facadeGlow.clone(); glow.needsUpdate = true; glow.repeat.set(rx, ry);
          const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0, vertexColors: true });
          nightMats.push(mat); roofMats.push(mat);
          buildingMats.set(repKey, mat);
        }
        // merged per sector as well as per repeat, so frustum/shadow
        // culling can still drop the far side of the city
        const key = repKey + '@' + sectorKey(bx + ox, bz + oz);
        if (!buildingBuckets.has(key)) buildingBuckets.set(key, { mat: buildingMats.get(repKey), geos: [] });
        const bg = new THREE.BoxGeometry(w, hgt, d);
        bg.translate(bx + ox, hgt / 2 + 0.2, bz + oz);
        NH.tintGeo(bg, tint);
        buildingBuckets.get(key).geos.push(bg);
        roofSpots.push({ x: bx + ox, z: bz + oz, top: hgt + 0.35, w: w, d: d });
        colliders.push({ minX: bx + ox - w / 2, maxX: bx + ox + w / 2, minZ: bz + oz - d / 2, maxZ: bz + oz + d / 2 });
      }
    }

    // Round 3: flush the merges — 25 slabs become ≤3 meshes, every
    // building becomes one mesh per facade bucket (a handful in total).
    for (const slab of slabGeos.values()) {
      const m = new THREE.Mesh(NH.mergeGeos(slab.geos), slab.mat);
      m.receiveShadow = true; group.add(m);
    }
    for (const bucket of buildingBuckets.values()) {
      const m = new THREE.Mesh(NH.mergeGeos(bucket.geos), bucket.mat);
      m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    buildDressing(group, roofSpots);

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

    buildProps(group);
    // the whole city is static: freeze matrices so the renderer skips
    // per-frame matrix updates for every city object
    group.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
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
