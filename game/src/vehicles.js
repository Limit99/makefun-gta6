// vehicles.js - car models, arcade driving physics and traffic AI for
// Neon Harbor: Vice Run. Cars are low-poly box builds (body, cabin, wheels,
// lights). Traffic follows the street grid lane by lane, turning at
// intersections and braking for whatever is ahead of it.
NH.Vehicles = (function () {
  const CAR_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c, 0xfd79a8, 0x95a5a6];
  const bodyGeo = new THREE.BoxGeometry(2.0, 0.55, 4.3);
  const cabinGeo = new THREE.BoxGeometry(1.7, 0.5, 2.1);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 8);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x16181d });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2f45 });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0x555033 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x7a1020, emissive: 0x33060c });

  let carId = 0;

  // Round 3: wheels live in one InstancedMesh per car. The dummy replays
  // the old per-wheel Euler (spin on X, steer on Y for the front pair,
  // fixed Z roll that lays the cylinder on its side) into instance
  // matrices, so the visual is unchanged at a quarter of the draw calls.
  const WHEEL_POS = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  const wheelDummy = new THREE.Object3D();
  function writeWheels(wheels, steer) {
    for (let i = 0; i < 4; i++) {
      wheelDummy.position.set(WHEEL_POS[i][0], 0.38, WHEEL_POS[i][1]);
      wheelDummy.rotation.set(wheels.spin, i < 2 ? steer * 0.42 : 0, Math.PI / 2);
      wheelDummy.updateMatrix();
      wheels.mesh.setMatrixAt(i, wheelDummy.matrix);
    }
    wheels.mesh.instanceMatrix.needsUpdate = true;
  }

  function makeCar(kind, color) {
    const g = new THREE.Group();
    const isPolice = kind === 'police';
    const isSport = kind === 'sport';
    const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f4f6 : color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);
    if (isPolice) { // black doors stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 4.32),
        new THREE.MeshLambertMaterial({ color: 0x14181f }));
      stripe.position.y = 0.5; g.add(stripe);
    }
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.05, isSport ? -0.25 : -0.1); cabin.castShadow = true; g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.09, 1.5), bodyMat);
    roof.position.set(0, 1.34, isSport ? -0.25 : -0.1); g.add(roof);
    if (isSport) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), bodyMat);
      spoiler.position.set(0, 1.0, -2.0); g.add(spoiler);
    }
    const wheelMesh = new THREE.InstancedMesh(wheelGeo, wheelMat, 4);
    wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(wheelMesh);
    const wheels = { mesh: wheelMesh, spin: 0 };
    writeWheels(wheels, 0);
    // head/tail lights: one merged mesh per pair (was four draw calls)
    const headGeo = NH.mergeGeos([-0.6, 0.6].map(function (s) {
      const b = new THREE.BoxGeometry(0.42, 0.16, 0.06); b.translate(s, 0.62, 2.16); return b;
    }));
    g.add(new THREE.Mesh(headGeo, headMat));
    const tailGeo = NH.mergeGeos([-0.6, 0.6].map(function (s) {
      const b = new THREE.BoxGeometry(0.42, 0.14, 0.06); b.translate(s, 0.66, -2.16); return b;
    }));
    g.add(new THREE.Mesh(tailGeo, tailMat));
    let lightbar = null, lightRed = null, lightBlue = null;
    if (isPolice) {
      lightbar = new THREE.Group();
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), chromeMat);
      lightbar.add(barBase);
      lightRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34),
        new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
      lightRed.position.set(-0.3, 0.12, 0); lightbar.add(lightRed);
      lightBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34),
        new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 0.1 }));
      lightBlue.position.set(0.3, 0.12, 0); lightbar.add(lightBlue);
      lightbar.position.set(0, 1.36, -0.1);
      g.add(lightbar);
    }
    const car = {
      id: carId++, kind: kind, mesh: g, wheels: wheels,
      heading: 0, speed: 0, health: 100, dead: false,
      maxSpeed: isSport ? 34 : (isPolice ? 30 : 24),
      accel: isSport ? 15 : 11,
      lightRed: lightRed, lightBlue: lightBlue, flashPhase: Math.random() * 2,
      // traffic state
      axis: 'z', line: 0, dir: 1, cruise: NH.rand(9, 13), targetSpeed: 0,
      stuckTimer: 0, hornTimer: 0
    };
    g.userData.car = car;
    return car;
  }

  function forward(car) { return { x: Math.sin(car.heading), z: Math.cos(car.heading) }; }

  // Shared physics: steer -1..1, throttle -1..1. Handles building collision,
  // world bounds and car-to-car bumps. Crash events go through G.onCrash.
  function integrate(car, dt, steer, throttle, G, handbrake) {
    const drag = handbrake ? 2.6 : 0.55;
    car.speed += throttle * car.accel * dt;
    car.speed -= car.speed * drag * dt * (throttle === 0 ? 1.6 : 0.5);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
    car.speed = NH.clamp(car.speed, -9, car.maxSpeed);
    if (Math.abs(car.speed) > 0.2) {
      const turn = steer * NH.clamp(Math.abs(car.speed) / 7, 0, 1.15) * 1.55;
      car.heading += turn * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.7 : 1);
    }
    const f = forward(car);
    car.mesh.position.x += f.x * car.speed * dt;
    car.mesh.position.z += f.z * car.speed * dt;
    car.mesh.position.y = 0;
    car.mesh.rotation.y = car.heading;

    // wheels: spin + front steer, written into the instanced wheel mesh
    car.wheels.spin += car.speed * dt / 0.38;
    writeWheels(car.wheels, steer);

    // world bounds (ocean side open to the pier, then water stops you)
    const p = car.mesh.position;
    p.x = NH.clamp(p.x, -176, 252);
    p.z = NH.clamp(p.z, -176, 176);
    if (p.x > 224 && Math.abs(p.z + 84) > 14) { p.x = 224; car.speed *= 0.5; }

    // buildings
    for (const box of NH.City.colliders) {
      const hit = NH.circleVsBox(p.x, p.z, 2.05, box);
      if (hit) {
        p.x += hit.x * hit.depth; p.z += hit.z * hit.depth;
        const impact = Math.abs(car.speed);
        if (impact > 4.5 && G && G.onCrash) G.onCrash(car, null, impact);
        car.speed = -car.speed * 0.22;
        car.health -= impact * 1.1;
      }
    }
    // other cars (staged cars are ghosted: screenshot scenes stay composed)
    if (G) for (const other of G.cars) {
      if (other === car || other.dead || car.staged || other.staged) continue;
      const op = other.mesh.position;
      const d2 = NH.dist2(p.x, p.z, op.x, op.z);
      if (d2 < 4.4 * 4.4 && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (4.4 - d) / 2;
        const nx = (p.x - op.x) / d, nz = (p.z - op.z) / d;
        p.x += nx * push; p.z += nz * push;
        op.x -= nx * push; op.z -= nz * push;
        const rel = Math.abs(car.speed - other.speed);
        if (rel > 4 && G.onCrash) G.onCrash(car, other, rel);
        const avg = (car.speed + other.speed) / 2;
        car.speed = avg * 0.7; other.speed = avg * 0.7;
        car.health -= rel * 0.7; other.health -= rel * 0.7;
      }
    }
    if (car.health <= 0 && !car.dead) { car.dead = true; car.speed = 0; }
  }

  // Steer toward a ground target and drive; used by police (and could be
  // reused by any AI driver). speedScale caps aggression.
  function seek(car, tx, tz, dt, G, speedScale, brakeNear) {
    const p = car.mesh.position;
    const want = NH.angleTo(p.x, p.z, tx, tz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = NH.clamp(diff * 1.6, -1, 1);
    const d = NH.dist(p.x, p.z, tx, tz);
    let throttle = 1;
    if (Math.abs(diff) > 2.2 && car.speed > 4) throttle = -0.7; // reverse to re-aim
    else if (Math.abs(diff) > 1.1) throttle = 0.35;
    if (brakeNear && d < 7) throttle = Math.min(throttle, 0.15);
    integrate(car, dt, steer, throttle * (speedScale || 1), G, false);
  }

  // --- traffic ---
  function placeOnRoad(car, nearX, nearZ, minD, maxD) {
    for (let tries = 0; tries < 24; tries++) {
      const vertical = NH.rng() < 0.5;
      const line = NH.pick(NH.City.STREETS);
      const along = NH.rand(-168, 168);
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const d = NH.dist(x, z, nearX, nearZ);
      if (d < minD || d > maxD) continue;
      car.axis = vertical ? 'z' : 'x';
      car.line = line;
      car.dir = NH.rng() < 0.5 ? 1 : -1;
      snapToLane(car, x, z);
      car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.mesh.position.y = 0;
      car.mesh.rotation.y = car.heading;
      return true;
    }
    return false;
  }

  function laneCoord(car) { // perpendicular offset of the correct lane
    if (car.axis === 'z') return car.line + (car.dir > 0 ? -4 : 4);
    return car.line + (car.dir > 0 ? 4 : -4);
  }

  function snapToLane(car, x, z) {
    if (car.axis === 'z') car.mesh.position.set(laneCoord(car), 0, z);
    else car.mesh.position.set(x, 0, laneCoord(car));
  }

  function updateTrafficCar(car, dt, G) {
    const p = car.mesh.position;
    // recycle cars that drift too far from the player
    const pd = NH.dist(p.x, p.z, G.playerPos.x, G.playerPos.z);
    if (pd > 250) { placeOnRoad(car, G.playerPos.x, G.playerPos.z, 130, 210); return; }

    // next intersection ahead
    const along = car.axis === 'z' ? p.z : p.x;
    let cross = null;
    for (const s of NH.City.STREETS) {
      const rel = (s - along) * car.dir;
      if (rel > 1 && (cross === null || rel < cross.rel)) cross = { at: s, rel: rel };
    }
    // decide a turn shortly before reaching the intersection
    if (cross && cross.rel < 9 && !car.turnDecided) {
      car.turnDecided = true;
      car.willTurn = NH.rng() < 0.38;
      car.turnDir = NH.rng() < 0.5 ? 1 : -1;
    }
    if (cross && cross.rel <= 1.2 && car.turnDecided) {
      if (car.willTurn) {
        const oldLine = car.line;
        if (car.axis === 'z') { car.axis = 'x'; car.line = cross.at; car.dir = car.turnDir; snapToLane(car, oldLine, p.z); }
        else { car.axis = 'z'; car.line = cross.at; car.dir = car.turnDir; snapToLane(car, p.x, oldLine); }
      }
      car.turnDecided = false; car.willTurn = false;
    }

    // target: a point ahead in the lane
    const ahead = 22;
    let tx, tz;
    if (car.axis === 'z') { tx = laneCoord(car); tz = p.z + car.dir * ahead; }
    else { tx = p.x + car.dir * ahead; tz = laneCoord(car); }

    // obstacle scan: any car or pedestrian right ahead
    let targetSpeed = car.cruise;
    const f = forward(car);
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      const op = other.mesh.position;
      const relx = op.x - p.x, relz = op.z - p.z;
      const fwd = relx * f.x + relz * f.z;
      const side = Math.abs(relx * f.z - relz * f.x);
      if (fwd > 0 && fwd < 11 && side < 2.4) targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed * 0.9 - (8 - fwd) * 0.4));
    }
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const pp = ped.mesh.position;
      const relx = pp.x - p.x, relz = pp.z - p.z;
      const fwd = relx * f.x + relz * f.z;
      const side = Math.abs(relx * f.z - relz * f.x);
      if (fwd > 0 && fwd < 8 && side < 2.2) targetSpeed = 0;
    }
    if (G.playerCar === null && !G.player.dead) { // pedestrian player ahead?
      const pp = G.playerPos;
      const relx = pp.x - p.x, relz = pp.z - p.z;
      const fwd = relx * f.x + relz * f.z;
      const side = Math.abs(relx * f.z - relz * f.x);
      if (fwd > 0 && fwd < 8 && side < 2.2) targetSpeed = 0;
    }

    // simple speed control toward targetSpeed using seek-style steering
    const want = NH.angleTo(p.x, p.z, tx, tz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = NH.clamp(diff * 1.8, -1, 1);
    let throttle = 0;
    if (car.speed < targetSpeed - 0.4) throttle = 0.85;
    else if (car.speed > targetSpeed + 0.4) throttle = -0.55;
    if (car.dead) throttle = -1;
    integrate(car, dt, steer, throttle, G, false);

    // unstick: if barely moving while wanting to go, jitter the target
    if (targetSpeed > 2 && Math.abs(car.speed) < 0.4) {
      car.stuckTimer += dt;
      if (car.stuckTimer > 2.5) { car.stuckTimer = 0; car.dir = car.dir; car.heading += 0.6; car.speed = 2; }
    } else car.stuckTimer = 0;
  }

  function updateTraffic(dt, G) {
    for (const car of G.cars) if (car.kind === 'traffic') updateTrafficCar(car, dt, G);
  }

  return {
    makeCar: makeCar, integrate: integrate, seek: seek,
    placeOnRoad: placeOnRoad, updateTraffic: updateTraffic,
    CAR_COLORS: CAR_COLORS
  };
})();
