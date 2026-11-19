// police.js - Solmara PD: the wanted system and the chase AI.
// Crimes add "heat"; heat maps to 0-5 stars. Police cruisers spawn on the
// road grid around the player, chase, ram and block. Stay out of sight and
// the heat cools off. Get pinned on foot (or boxed in while stopped) and
// the busted meter fills.
NH.Police = (function () {
  const STAR_THRESHOLDS = [1, 25, 65, 125, 200, 290]; // heat needed per star
  const DESIRED = [0, 1, 2, 3, 4, 6];                  // cruisers per star level

  function starsFor(heat) {
    let s = 0;
    for (let i = 1; i < STAR_THRESHOLDS.length; i++) if (heat >= STAR_THRESHOLDS[i]) s = i;
    return s;
  }

  function addHeat(G, amount) {
    G.heat = Math.min(340, G.heat + amount);
    G.lastCrimeAt = G.time;
    G.stars = starsFor(G.heat);
    if (amount > 0) G.unseenTime = 0;
  }

  function spawnCop(G) {
    const car = NH.Vehicles.makeCar('police');
    if (!NH.Vehicles.placeOnRoad(car, G.playerPos.x, G.playerPos.z, 65, 115)) {
      // fallback: nearest street corner to the player
      car.mesh.position.set(NH.City.nearestStreet(G.playerPos.x) + 4, 0, NH.City.nearestStreet(G.playerPos.z));
      car.axis = 'z'; car.line = NH.City.nearestStreet(G.playerPos.x); car.dir = 1;
    }
    car.kind = 'police';
    G.scene.add(car.mesh);
    G.cars.push(car);
    G.police.push(car);
    return car;
  }

  function removeCop(G, car) {
    G.scene.remove(car.mesh);
    G.cars.splice(G.cars.indexOf(car), 1);
    G.police.splice(G.police.indexOf(car), 1);
  }

  function update(dt, G) {
    G.stars = starsFor(G.heat);
    const pp = G.playerPos;

    // --- sight & cooling ---
    let nearestCop = Infinity;
    for (const cop of G.police) {
      const d = NH.dist(cop.mesh.position.x, cop.mesh.position.z, pp.x, pp.z);
      if (d < nearestCop) nearestCop = d;
    }
    const seen = nearestCop < 58;
    if (seen) G.unseenTime = 0; else G.unseenTime += dt;
    if (G.unseenTime > 5 && G.time - G.lastCrimeAt > 4) {
      G.heat = Math.max(G.heatFloor || 0, G.heat - 6.5 * dt);
      if (G.heat <= 0.01 && !G.heatFloor) G.heat = 0;
      G.stars = starsFor(G.heat);
    }

    // --- spawn / despawn to match the wanted level ---
    const want = DESIRED[G.stars];
    if (G.police.length < want && !G.player.dead) spawnCop(G);
    for (let i = G.police.length - 1; i >= 0; i--) {
      const cop = G.police[i];
      const d = NH.dist(cop.mesh.position.x, cop.mesh.position.z, pp.x, pp.z);
      if ((G.police.length > want && d > 60) || d > 260 || (cop.dead && d > 40)) removeCop(G, cop);
    }

    // --- chase ---
    const flash = (G.time * 2.4) % 1 < 0.5;
    for (const cop of G.police) {
      if (cop.lightRed) {
        cop.lightRed.material.emissiveIntensity = flash ? 1.6 : 0.15;
        cop.lightBlue.material.emissiveIntensity = flash ? 0.15 : 1.6;
      }
      if (cop.dead || cop.staged) continue; // staged cruisers hold their pose
      // aim slightly ahead of a moving player car to cut it off
      let tx = pp.x, tz = pp.z;
      if (G.playerCar) { tx += Math.sin(G.playerCar.heading) * G.playerCar.speed * 0.35; tz += Math.cos(G.playerCar.heading) * G.playerCar.speed * 0.35; }
      const aggression = 0.82 + G.stars * 0.06;
      NH.Vehicles.seek(cop, tx, tz, dt, G, aggression, !!G.playerCar === false);
    }
    NH.Audio.sirenUpdate(dt, nearestCop < 48 && G.stars > 0);

    // --- busted meter ---
    const pl = G.player;
    let pinning = false;
    if (!pl.dead && G.stars > 0) {
      if (!pl.car && nearestCop < 4.2) pinning = true;
      if (pl.car && Math.abs(pl.car.speed) < 1.6 && nearestCop < 7) pinning = true;
    }
    if (pinning) pl.bustedMeter += dt / 2.6;
    else pl.bustedMeter = Math.max(0, pl.bustedMeter - dt * 0.7);
    if (pl.bustedMeter >= 1 && !pl.dead) { pl.bustedMeter = 0; G.onBusted(); }
  }

  return { addHeat: addHeat, starsFor: starsFor, update: update, DESIRED: DESIRED };
})();
