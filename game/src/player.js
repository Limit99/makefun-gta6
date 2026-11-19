// player.js - Rico Alvarez, the player character: on-foot movement
// (walk / sprint / jump, building collision), health and armor, and the
// enter / steal / exit car interaction. While driving, this module feeds
// keyboard input into the vehicle physics.
NH.Player = (function () {
  function create(scene) {
    const fig = NH.Humans.makeFigure(0xff5e3a, 0x22304a, 0xc68642); // Rico: coral shirt
    fig.group.position.set(12, 0, 40);
    scene.add(fig.group);
    return {
      fig: fig, mesh: fig.group, heading: Math.PI, // faces -Z toward the avenue
      health: 100, armor: 0, dead: false,
      vy: 0, y: 0, walkPhase: 0, moving: false,
      car: null, bustedMeter: 0
    };
  }

  function updateOnFoot(pl, dt, G, input, camYaw) {
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    pl.moving = (mx !== 0 || mz !== 0);
    const sprint = input.sprint ? 1.65 : 1;
    const speed = 5.2 * sprint;
    if (pl.moving) {
      const len = Math.hypot(mx, mz);
      const lx = mx / len, lz = mz / len;
      // camera-relative: camYaw 0 looks toward -Z... we keep camYaw as the
      // heading the camera faces, so forward on ground = (sin, cos) of it.
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const rx = -fz, rz = fx; // screen-right on the ground for this camera yaw
      const wx = fx * lz + rx * lx, wz = fz * lz + rz * lx;
      pl.heading = NH.angleLerp(pl.heading, Math.atan2(wx, wz), dt * 14);
      pl.mesh.position.x += Math.sin(pl.heading) * speed * dt;
      pl.mesh.position.z += Math.cos(pl.heading) * speed * dt;
      pl.walkPhase += dt * (input.sprint ? 12 : 8.5);
    }
    // jump / gravity
    if (input.jump && pl.y === 0) pl.vy = 5.4;
    if (pl.y > 0 || pl.vy !== 0) {
      pl.vy -= 15 * dt; pl.y += pl.vy * dt;
      if (pl.y <= 0) { pl.y = 0; pl.vy = 0; }
    }
    const p = pl.mesh.position;
    for (const box of NH.City.colliders) {
      const hit = NH.circleVsBox(p.x, p.z, 0.5, box);
      if (hit) { p.x += hit.x * hit.depth; p.z += hit.z * hit.depth; }
    }
    p.x = NH.clamp(p.x, -175, 240); p.z = NH.clamp(p.z, -175, 175);
    p.y = pl.y;
    pl.mesh.rotation.y = pl.heading;
    NH.Humans.animate(pl.fig, pl.walkPhase, pl.moving ? 1 : 0);
    if (!pl.moving) NH.Humans.animate(pl.fig, 0, 0);
  }

  function updateDriving(pl, dt, G, input) {
    const car = pl.car;
    if (!car) return;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const throttle = (input.forward ? 1 : 0) + (input.back ? -1 : 0);
    // integrate() already flips the turn when reversing; D (steer +1) must
    // decrease heading, since a car facing +Z has its right hand toward -X.
    NH.Vehicles.integrate(car, dt, -steer, throttle, G, input.handbrake);
    NH.Audio.engineUpdate(car.speed / car.maxSpeed);
    pl.mesh.position.copy(car.mesh.position);
    pl.heading = car.heading;
  }

  function nearestCar(pl, G, maxD) {
    const p = pl.mesh.position;
    let best = null, bd = maxD * maxD;
    for (const car of G.cars) {
      if (car.dead) continue;
      const cp = car.mesh.position;
      const d = NH.dist2(p.x, p.z, cp.x, cp.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  // Walk up to a car and press E/F: steal it (or just get in, if parked).
  function tryEnter(pl, G) {
    const car = nearestCar(pl, G, 3.6);
    if (!car) return false;
    pl.car = car;
    car.driver = 'player';
    if (car.kind === 'traffic') { car.kind = 'stolen'; G.onCarStolen(car); }
    else if (car.kind === 'mission') { car.kind = 'stolen'; G.onCarStolen(car); }
    pl.fig.group.visible = false;
    NH.Audio.door(); NH.Audio.engineStart();
    return true;
  }

  function exitCar(pl, G) {
    const car = pl.car;
    if (!car) return;
    car.driver = null;
    pl.car = null;
    // step out on the left side of the car
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    pl.mesh.position.set(car.mesh.position.x - side.x * 2.2, 0, car.mesh.position.z - side.z * 2.2);
    pl.y = 0; pl.vy = 0;
    pl.fig.group.visible = true;
    NH.Audio.door(); NH.Audio.engineStop();
  }

  function damage(pl, amount, G) {
    if (pl.dead) return;
    let rest = amount;
    if (pl.armor > 0) {
      const absorbed = Math.min(pl.armor, amount * 0.6);
      pl.armor -= absorbed; rest -= absorbed;
    }
    pl.health -= rest;
    if (pl.health <= 0) { pl.health = 0; pl.dead = true; if (G && G.onWasted) G.onWasted(); }
  }

  function heal(pl, amount) { pl.health = NH.clamp(pl.health + amount, 0, 100); }

  return { create: create, updateOnFoot: updateOnFoot, updateDriving: updateDriving,
    tryEnter: tryEnter, exitCar: exitCar, nearestCar: nearestCar, damage: damage, heal: heal };
})();
