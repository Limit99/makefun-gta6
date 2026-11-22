// main.js - Neon Harbor: Vice Run. Boot, game loop and state machine.
// Wires every module together: builds Solmara, spawns traffic / pedestrians /
// the player, runs the wanted + mission + combat systems, owns the camera,
// the day cycle, crime bookkeeping, busted/wasted/respawn, menus, saving,
// and the staged ?shot= scenes used for the entry screenshots.
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  NH.rng = NH.makeRng(seed * 7919 + 13);
  const shotName = params.get('shot');
  const benchName = params.get('bench');

  // ---------- renderer / scene ----------
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fd3e8, 120, 460);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(30, 14, 70);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -78; sun.shadow.camera.right = 78;
  sun.shadow.camera.top = 78; sun.shadow.camera.bottom = -78;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6; // kills the striped shadow acne on slabs/roads
  scene.add(sun); scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  // ---------- game state ----------
  const G = {
    scene: scene, time: 0, mode: 'menu',
    cars: [], peds: [], police: [], pickups: [],
    heat: 0, stars: 0, heatFloor: 0, unseenTime: 0, lastCrimeAt: -99,
    cash: 250, missionIndex: 0, missionTitle: '', objective: '',
    packagesFound: [], playSeconds: 0, timeOfDay: 10.6, timeFrozen: false,
    weapon: { ammo: 12, magSize: 12, cooldown: 0, reloading: 0 },
    playerPos: new THREE.Vector3(12, 0, 40),
    playerCar: null, ms: null, crashHeatCd: 0,
    showDialogue: function (w, t, s) { NH.HUD.showDialogue(w, t, s); },
    showToast: function (t) { NH.HUD.showToast(t); },
    autoSave: function () { if (NH.Save.save(G)) NH.HUD.showSaved(); }
  };
  window.G = G;

  NH.City.build(scene);
  G.fx = NH.Combat.initFx(scene);
  NH.Missions.makeMarker(scene);
  G.pickups = NH.Missions.makePickups(scene);
  G.player = NH.Player.create(scene);
  const player = G.player;

  // traffic + parked cars
  for (let i = 0; i < 14; i++) {
    const car = NH.Vehicles.makeCar('traffic', NH.pick(NH.Vehicles.CAR_COLORS));
    NH.Vehicles.placeOnRoad(car, 12, 40, 18, 170);
    scene.add(car.mesh); G.cars.push(car);
  }
  for (const spot of (NH.CityParkingSpots || []).slice(0, 10)) {
    const car = NH.Vehicles.makeCar('parked', NH.pick(NH.Vehicles.CAR_COLORS));
    car.mesh.position.set(spot.x, 0, spot.z);
    car.heading = spot.heading; car.mesh.rotation.y = spot.heading;
    scene.add(car.mesh); G.cars.push(car);
  }
  // pedestrians
  for (let i = 0; i < 26; i++) {
    const sx = NH.pick(NH.City.STREETS) + NH.pick([-11.5, 11.5]);
    const sz = NH.rand(-160, 160);
    const ped = NH.Peds.spawn(scene, NH.rng() < 0.5 ? sx : sz, NH.rng() < 0.5 ? sz : sx);
    G.peds.push(ped);
  }

  // ---------- crime + event bookkeeping ----------
  function nearestCopDist(x, z) {
    let d = Infinity;
    for (const cop of G.police) d = Math.min(d, NH.dist(x, z, cop.mesh.position.x, cop.mesh.position.z));
    return d;
  }
  G.onCrime = function (kind, x, z) {
    if (kind === 'gunshot') { if (nearestCopDist(x, z) < 85) NH.Police.addHeat(G, 9); }
    else if (kind === 'pedDown') NH.Police.addHeat(G, 34);
    else if (kind === 'shotCar') { if (nearestCopDist(x, z) < 70) NH.Police.addHeat(G, 6); }
    else if (kind === 'missionHeat') NH.Police.addHeat(G, 50);
  };
  G.onPedHit = function (ped, car) {
    NH.Combat.burst(G.fx, ped.mesh.position.x, 0.8, ped.mesh.position.z, 0xb02020, 8, 2, 2);
    NH.Audio.hit();
    if (car === player.car || car.driver === 'player') {
      NH.Police.addHeat(G, 42);
      G.showToast('You ran someone down!');
      NH.Peds.scare(G, ped.mesh.position.x, ped.mesh.position.z, 18);
    }
  };
  G.onCrash = function (car, other, impact) {
    const involvesPlayer = car === player.car || (other && other === player.car);
    const px = car.mesh.position.x, pz = car.mesh.position.z;
    NH.Combat.burst(G.fx, px, 0.8, pz, 0xffcf5e, Math.min(14, 4 + impact), 2.4, 2.4);
    NH.Audio.crash(impact > 11);
    if (involvesPlayer) {
      if (impact > 13) NH.Player.damage(player, impact * 0.35, G);
      if (G.crashHeatCd <= 0 && nearestCopDist(px, pz) < 65) {
        NH.Police.addHeat(G, 8); G.crashHeatCd = 2.5;
      }
    }
  };
  G.onCarStolen = function () {
    let witnessed = nearestCopDist(player.mesh.position.x, player.mesh.position.z) < 70;
    if (!witnessed) for (const ped of G.peds) {
      if (!ped.dead && NH.dist2(ped.mesh.position.x, ped.mesh.position.z, player.mesh.position.x, player.mesh.position.z) < 28 * 28) { witnessed = true; break; }
    }
    NH.Police.addHeat(G, witnessed ? 30 : 12);
    G.showToast('Vehicle stolen');
  };
  G.onEnemyKilled = function () {
    if (G.ms) G.ms.kills = (G.ms.kills || 0) + 1;
    G.cash += 25;
    NH.Audio.cash();
  };

  function clearPolice() {
    for (const cop of G.police) { scene.remove(cop.mesh); G.cars.splice(G.cars.indexOf(cop), 1); }
    G.police.length = 0;
  }
  function resetAfterEnd(kind) {
    G.heat = 0; G.heatFloor = 0; G.stars = 0; player.bustedMeter = 0;
    clearPolice();
    if (player.car) NH.Player.exitCar(player, G);
    player.dead = false; player.health = 100;
    if (kind === 'wasted') {
      const fine = Math.min(200, Math.floor(G.cash * 0.1));
      G.cash -= fine;
      player.mesh.position.set(-76, 0, 48); player.heading = Math.PI / 2;
      G.showToast('Hospital bill: -$' + fine);
    } else {
      const fine = Math.min(300, Math.floor(G.cash * 0.15));
      G.cash -= fine;
      player.mesh.position.set(62, 0, -76); player.heading = 0;
      G.showToast('Bail posted: -$' + fine);
    }
    player.fig.group.visible = true;
    player.y = 0; player.vy = 0;
  }
  G.onWasted = function () {
    if (G.mode !== 'play') return;
    NH.Audio.wasted(); NH.Audio.engineStop();
    endRun('WASTED', 'The city chewed you up, Rico. Solmara General patched what was left.');
  };
  G.onBusted = function () {
    if (G.mode !== 'play') return;
    NH.Audio.busted(); NH.Audio.engineStop();
    endRun('BUSTED', 'Solmara PD got their man. A "donation" to the precinct fund greased your release.');
  };
  function endRun(title, text) {
    G.mode = 'end';
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-title').style.color = title === 'WASTED' ? '#ff5470' : '#ffd94d';
    document.getElementById('end-text').textContent = text;
    document.getElementById('end-screen').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- input ----------
  const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };
  const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump' };
  let camYaw = Math.PI, camPitch = 0.32, mouseDown = false;

  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; if (e.code === 'Space') e.preventDefault(); }
    if (e.code === 'Space') input.handbrake = true;
    if (G.mode === 'play') {
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        if (player.car) NH.Player.exitCar(player, G); else NH.Player.tryEnter(player, G);
      }
      if (e.code === 'KeyR') NH.Combat.startReload(G);
      if (e.code === 'KeyP') { if (NH.Save.save(G)) NH.HUD.showSaved(); }
      if (e.code === 'KeyM') openPause();
    } else if (G.mode === 'pause' && (e.code === 'KeyM' || e.code === 'Escape')) closePause();
  });
  window.addEventListener('keyup', function (e) {
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
    if (e.code === 'Space') input.handbrake = false;
  });
  canvas.addEventListener('mousedown', function (e) {
    NH.Audio.unlock();
    if (G.mode === 'play' && !document.pointerLockElement) canvas.requestPointerLock();
    if (e.button === 0) mouseDown = true;
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) mouseDown = false; });
  window.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement === canvas && G.mode === 'play') {
      camYaw -= e.movementX * 0.0027;
      camPitch = NH.clamp(camPitch + e.movementY * 0.0022, -0.12, 1.05);
    }
  });
  document.addEventListener('pointerlockchange', function () {
    if (!document.pointerLockElement && G.mode === 'play' && !shotName) openPause();
  });

  // ---------- menus ----------
  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const hudEl = document.getElementById('hud');
  if (NH.Save.exists()) document.getElementById('btn-continue').classList.remove('hidden');

  function startPlay(fresh) {
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    hudEl.classList.remove('hidden');
    G.mode = 'play';
    NH.Audio.unlock(); NH.Audio.musicStart();
    if (fresh) {
      G.cash = 250; G.missionIndex = 0; G.packagesFound = [];
      for (const pk of G.pickups) if (pk.kind === 'package') { pk.taken = false; pk.mesh.visible = true; }
      player.health = 100; player.armor = 0;
      player.mesh.position.set(12, 0, 40);
      NH.Missions.startMission(G, 0);
    }
    camYaw = player.heading;
  }
  document.getElementById('btn-new').addEventListener('click', function () { startPlay(true); });
  document.getElementById('btn-continue').addEventListener('click', function () {
    const data = NH.Save.load();
    startPlay(false);
    if (data) {
      G.cash = data.cash || 0;
      G.missionIndex = data.missionIndex || 0;
      G.packagesFound = data.packages || [];
      for (const pk of G.pickups) if (pk.kind === 'package' && G.packagesFound.includes(pk.id)) { pk.taken = true; pk.mesh.visible = false; }
      player.health = data.health || 100; player.armor = data.armor || 0;
      player.mesh.position.set(data.x || 12, 0, data.z || 40);
      player.heading = data.heading || 0;
      G.playSeconds = data.playSeconds || 0;
    }
    NH.Missions.startMission(G, G.missionIndex);
    G.showToast('Save loaded');
  });
  function openPause() {
    if (G.mode !== 'play') return;
    G.mode = 'pause';
    document.getElementById('pause-stats').textContent =
      'Cash $' + Math.floor(G.cash) + ' · Mission ' + Math.min(G.missionIndex + 1, 3) + ' of 3 · Packages ' +
      G.packagesFound.length + '/12 · Time in Solmara: ' + Math.floor(G.playSeconds / 60) + 'm ' + Math.floor(G.playSeconds % 60) + 's';
    pauseScreen.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closePause() { pauseScreen.classList.add('hidden'); G.mode = 'play'; }
  document.getElementById('btn-resume').addEventListener('click', closePause);
  document.getElementById('btn-save').addEventListener('click', function () { if (NH.Save.save(G)) NH.HUD.showSaved(); });
  document.getElementById('btn-quit').addEventListener('click', function () {
    pauseScreen.classList.add('hidden'); hudEl.classList.add('hidden');
    startScreen.classList.remove('hidden'); G.mode = 'menu';
    if (NH.Save.exists()) document.getElementById('btn-continue').classList.remove('hidden');
  });
  document.getElementById('btn-respawn').addEventListener('click', function () {
    const wasWasted = document.getElementById('end-title').textContent === 'WASTED';
    document.getElementById('end-screen').classList.add('hidden');
    resetAfterEnd(wasWasted ? 'wasted' : 'busted');
    G.mode = 'play';
  });

  // ---------- sky / day cycle ----------
  const skyDay = new THREE.Color(0x87c5e8), skyNight = new THREE.Color(0x0d1430),
    skyDusk = new THREE.Color(0xff9e64), fogDay = new THREE.Color(0x9fd3e8),
    fogNight = new THREE.Color(0x131c38), tmpColor = new THREE.Color();
  function updateSky() {
    const tod = G.timeOfDay;
    const sunA = ((tod - 6) / 12) * Math.PI;
    const elev = Math.sin(sunA);
    const dayF = NH.clamp(elev * 1.7 + 0.22, 0, 1);
    const duskF = NH.clamp(1 - Math.abs(elev) * 2.6, 0, 1) * (tod > 5 && tod < 20 ? 1 : 0);
    tmpColor.copy(skyNight).lerp(skyDay, dayF).lerp(skyDusk, duskF * 0.55);
    scene.background.copy(tmpColor);
    scene.fog.color.copy(fogNight).lerp(fogDay, dayF).lerp(skyDusk, duskF * 0.3);
    const px = G.playerPos.x, pz = G.playerPos.z;
    sun.position.set(px + Math.cos(sunA) * 160, Math.max(14, elev * 190), pz + 70);
    sun.target.position.set(px, 0, pz);
    sun.intensity = 0.18 + dayF * 1.05;
    sun.color.setHSL(0.11, 0.5, 0.72 + dayF * 0.2);
    hemi.intensity = 0.22 + dayF * 0.55;
    ambient.intensity = 0.10 + (1 - dayF) * 0.06;
    NH.City.setNight(1 - dayF);
    // headlight glow on the player's car after dark
    if (G.playerCar && !G.playerCar.spot) {
      const spot = new THREE.SpotLight(0xffe9b0, 0, 34, 0.62, 0.5);
      spot.position.set(0, 1, 2); 
      const tgt = new THREE.Object3D(); tgt.position.set(0, 0, 16);
      G.playerCar.mesh.add(tgt); spot.target = tgt;
      G.playerCar.mesh.add(spot);
      G.playerCar.spot = spot;
    }
    if (G.playerCar && G.playerCar.spot) G.playerCar.spot.intensity = (1 - dayF) * 2.2;
  }

  // ---------- camera ----------
  const camPos = new THREE.Vector3(30, 14, 70);
  function updateCamera(dt) {
    const target = new THREE.Vector3(G.playerPos.x, 1.7 + player.y, G.playerPos.z);
    if (G.mode === 'menu') {
      const t = G.time * 0.05;
      const orbit = new THREE.Vector3(Math.sin(t) * 120, 42, Math.cos(t) * 120);
      camera.position.lerp(orbit, 1 - Math.exp(-dt * 2));
      camera.lookAt(0, 6, 0);
      return;
    }
    if (player.car && Math.abs(player.car.speed) > 4 && !document.pointerLockElement && !G.cineCam) {
      camYaw = NH.angleLerp(camYaw, player.car.heading, dt * 1.6);
    }
    const yaw = G.cineCam ? G.cineCam.yaw : camYaw;
    const pitch = G.cineCam ? G.cineCam.pitch : camPitch;
    const dist = G.cineCam ? G.cineCam.dist : (player.car ? 10.5 : 6.8);
    const fx = Math.sin(yaw) * Math.cos(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const want = new THREE.Vector3(
      target.x - fx * dist, Math.max(0.7, target.y + fy * dist + 1.2), target.z - fz * dist);
    const k = shotName ? 1 : 1 - Math.exp(-dt * 7);
    camPos.lerp(want, k);
    camera.position.copy(camPos);
    camera.lookAt(target.x + fx * 5, target.y + 0.4, target.z + fz * 5);
  }

  function cameraAimDir() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return dir;
  }

  // ---------- staged screenshot scenes ----------
  function placePlayerInCar(car) {
    player.car = car; car.driver = 'player';
    player.fig.group.visible = false;
    G.playerCar = car;
    player.mesh.position.copy(car.mesh.position);
  }
  function stageShot(name) {
    hudEl.classList.remove('hidden');
    startScreen.classList.add('hidden');
    G.mode = 'play';
    NH.Missions.startMission(G, 0);
    if (name === 'cover') {
      G.timeOfDay = 15.4; G.timeFrozen = true;
      const car = NH.Vehicles.makeCar('sport', 0xe83e6b);
      car.mesh.position.set(24, 0, 6); car.heading = 0; car.mesh.rotation.y = 0; car.speed = 15;
      car.staged = true; // collisions off: the chase stays on the road
      scene.add(car.mesh); G.cars.push(car);
      placePlayerInCar(car);
      G.autoDrive = { x: 24, z: 165 };
      NH.Police.addHeat(G, 130);
      for (const [cx, cz] of [[20, -22], [28, -31]]) {
        const cop = NH.Vehicles.makeCar('police');
        cop.mesh.position.set(cx, 0, cz); cop.heading = 0; cop.mesh.rotation.y = 0; cop.speed = 14;
        cop.maxSpeed = 27; // trail the coupe menacingly without wrecking the shot
        scene.add(cop.mesh); G.cars.push(cop); G.police.push(cop);
      }
      G.missionTitle = 'MISSION 1 - FIRST WHEELS';
      G.objective = 'Deliver the coupe to the garage - lose the cops!';
      NH.Missions.setMarker(132, 100, 0xffd94d);
      document.getElementById('dialogue').classList.add('hidden');
      // front three-quarter camera: the stolen coupe faces us, cruisers
      // with flashing lightbars close in behind it.
      G.cineCam = { yaw: 2.72, pitch: 0.22, dist: 12 };
      camYaw = 0; camPitch = 0.3;
    } else if (name === 'street') {
      G.timeOfDay = 11.2; G.timeFrozen = true;
      player.mesh.position.set(16.5, 0, 47); player.heading = 2.5;
      camYaw = 2.5; camPitch = 0.3;
      for (const [px2, pz2] of [[20, 38], [12, 30], [24, 52], [38, 40]]) G.peds.push(NH.Peds.spawn(scene, px2, pz2));
      // traffic flowing through the intersection in front of the player
      for (const [cx, cz, axis, line, dir] of [[32, 2, 'z', 28, -1], [58, 24, 'x', 28, -1], [24, 66, 'z', 28, 1]]) {
        const tc = NH.Vehicles.makeCar('traffic', NH.pick(NH.Vehicles.CAR_COLORS));
        tc.mesh.position.set(cx, 0, cz);
        tc.axis = axis; tc.line = line; tc.dir = dir; tc.speed = 8;
        tc.heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        tc.mesh.rotation.y = tc.heading;
        scene.add(tc.mesh); G.cars.push(tc);
      }
    } else if (name === 'mission') {
      G.timeOfDay = 16.8; G.timeFrozen = true;
      player.mesh.position.set(172, 0, -68); player.heading = NH.angleTo(172, -68, 188, -82);
      camYaw = player.heading; camPitch = 0.26;
      G.missionIndex = 1;
      G.missionTitle = 'MISSION 2 - HARBOR HEAT';
      G.objective = 'Take out the Harbor Kings (1/3)';
      NH.Missions.setMarker(196, -84, 0xff5e5e);
      document.getElementById('dialogue').classList.add('hidden');
      const e1 = NH.Combat.spawnEnemy(scene, 186, -58); e1.holdPosition = true; G.peds.push(e1);
      const e2 = NH.Combat.spawnEnemy(scene, 200, -56); e2.holdPosition = true; G.peds.push(e2);
      const e3 = NH.Combat.spawnEnemy(scene, 183, -76);
      e3.dead = true; e3.health = 0; NH.Humans.layDown(e3.fig); G.peds.push(e3);
      NH.Police.addHeat(G, 70);
      const cop = NH.Vehicles.makeCar('police');
      cop.mesh.position.set(170, 0, -88); cop.heading = Math.PI / 2; cop.mesh.rotation.y = Math.PI / 2;
      scene.add(cop.mesh); G.cars.push(cop); G.police.push(cop);
    } else if (name === 'night') {
      G.timeOfDay = 19.4; G.timeFrozen = true;
      const car = NH.Vehicles.makeCar('sedan', 0x2b6cb0);
      car.mesh.position.set(-60, 0, 6); car.heading = 0; car.mesh.rotation.y = 0;
      car.staged = true;
      scene.add(car.mesh); G.cars.push(car);
      placePlayerInCar(car);
      NH.Police.addHeat(G, 70);
      const cop = NH.Vehicles.makeCar('police');
      cop.mesh.position.set(-50, 0, 21); cop.heading = Math.PI; cop.mesh.rotation.y = Math.PI;
      cop.staged = true; // roadblock ahead, lightbar flashing, no ramming
      scene.add(cop.mesh); G.cars.push(cop); G.police.push(cop);
      document.getElementById('dialogue').classList.add('hidden');
      G.missionTitle = 'MISSION 3 - SUNSET RUN';
      G.objective = 'Deliver the package to the marina drop - do not stop!';
      NH.Missions.setMarker(140, -140, 0xff5e8a);
      camYaw = 0; camPitch = 0.3;
    }
    updateSky();
  }
  if (shotName) stageShot(shotName);
  else if (benchName) stageShot(benchName);

  // ---------- bench mode (?bench=<scene>): frame-cost report ----------
  // Runs the staged scene with all AI live, counts rAF frames, then writes
  // one BENCH line into document.title and a #bench-out div for headless
  // extraction. Draw calls / triangles are the machine-independent numbers.
  const bench = benchName ? { frames: 0, start: -1, done: false } : null;
  if (bench) {
    const out = document.createElement('div');
    out.id = 'bench-out';
    out.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99;color:#0f0;font:12px monospace;';
    out.textContent = 'BENCH running';
    document.body.appendChild(out);
  }
  function benchTick() {
    if (!bench || bench.done) return;
    const now = performance.now();
    if (bench.start < 0) bench.start = now;
    bench.frames++;
    const elapsed = now - bench.start;
    if (bench.frames >= 300 || (elapsed >= 15000 && bench.frames >= 40)) {
      bench.done = true;
      const avg = elapsed / Math.max(1, bench.frames);
      const info = renderer.info.render;
      const line = 'BENCH scene=' + benchName +
        ' avg_ms=' + avg.toFixed(2) +
        ' fps=' + (1000 / Math.max(0.01, avg)).toFixed(1) +
        ' calls=' + info.calls +
        ' tris=' + info.triangles;
      document.title = line;
      const out = document.getElementById('bench-out');
      if (out) out.textContent = line;
    }
  }

  // ---------- main loop ----------
  const clockT = new THREE.Clock();
  let promptCd = 0;

  // Round 3: shadow casters are limited to the player, police, and
  // whatever is near the player (refreshed ~3x a second). Distant traffic
  // and pedestrians stop paying shadow-pass cost; they still render and
  // simulate exactly as before. Part lists are cached on first sight.
  let shadowCd = 0;
  function collectShadowParts(root) {
    const parts = [];
    root.traverse(function (o) { if (o.isMesh && o.castShadow) parts.push(o); });
    return parts;
  }
  function refreshShadowCasters() {
    const px = G.playerPos.x, pz = G.playerPos.z;
    const R2 = 55 * 55;
    for (const car of G.cars) {
      if (!car.shadowParts) car.shadowParts = collectShadowParts(car.mesh);
      const near = car.kind === 'police' || car === player.car ||
        NH.dist2(px, pz, car.mesh.position.x, car.mesh.position.z) < R2;
      for (const m of car.shadowParts) m.castShadow = near;
    }
    for (const ped of G.peds) {
      if (!ped.shadowParts) ped.shadowParts = collectShadowParts(ped.fig.group);
      const near = NH.dist2(px, pz, ped.mesh.position.x, ped.mesh.position.z) < R2;
      for (const m of ped.shadowParts) m.castShadow = near;
    }
    if (!player.shadowParts) player.shadowParts = collectShadowParts(player.fig.group);
    for (const m of player.shadowParts) m.castShadow = true;
  }
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clockT.getDelta());
    G.time += dt;
    if (G.crashHeatCd > 0) G.crashHeatCd -= dt;

    if (!G.timeFrozen && G.mode !== 'menu') G.timeOfDay = (G.timeOfDay + dt * 0.045) % 24;

    if (G.mode === 'play') {
      G.playSeconds += dt;
      // player + world position reference
      if (player.car && G.autoDrive) NH.Vehicles.seek(player.car, G.autoDrive.x, G.autoDrive.z, dt, G, 0.92, false);
      else if (player.car) NH.Player.updateDriving(player, dt, G, input);
      else NH.Player.updateOnFoot(player, dt, G, input, camYaw);
      G.playerCar = player.car;
      const ap = player.car ? player.car.mesh.position : player.mesh.position;
      G.playerPos.set(ap.x, 0, ap.z);

      // shooting: hold mouse (locked) or tap
      if (mouseDown && !player.car && document.pointerLockElement === canvas) {
        NH.Combat.tryShoot(G, camera.position, cameraAimDir());
      }
      NH.Combat.updateWeapon(dt, G);
      NH.Vehicles.updateTraffic(dt, G);
      NH.Peds.update(dt, G);
      NH.Combat.updateEnemies(dt, G);
      NH.Police.update(dt, G);
      NH.Missions.update(dt, G);
      NH.Missions.updatePickups(dt, G);

      // enter-car prompt
      promptCd -= dt;
      if (promptCd <= 0) {
        promptCd = 0.15;
        if (!player.car) {
          const near = NH.Player.nearestCar(player, G, 3.6);
          NH.HUD.setPrompt(near ? 'Press E - ' + (near.kind === 'parked' ? 'Get in car' : 'Steal car') : null);
        } else NH.HUD.setPrompt(null);
      }
      NH.HUD.update(dt, G);
    } else {
      // menu / pause / end: keep the city alive in the background
      G.playerPos.set(player.mesh.position.x, 0, player.mesh.position.z);
      NH.Vehicles.updateTraffic(dt, G);
      NH.Peds.update(dt, G);
      for (const cop of G.police) { // idle flash on staged cops
        if (cop.lightRed) {
          const flash = (G.time * 2.4) % 1 < 0.5;
          cop.lightRed.material.emissiveIntensity = flash ? 1.6 : 0.15;
          cop.lightBlue.material.emissiveIntensity = flash ? 0.15 : 1.6;
        }
      }
    }
    shadowCd -= dt;
    if (shadowCd <= 0) { shadowCd = 0.33; refreshShadowCasters(); }
    NH.Combat.updateFx(G.fx, dt);
    updateSky();
    updateCamera(dt);
    renderer.render(scene, camera);
    benchTick();
  }
  frame();

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
