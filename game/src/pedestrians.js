// pedestrians.js - people of Solmara. NH.Humans builds the low-poly figure
// (shared by pedestrians, the player and mission enemies) with swing-animated
// limbs. NH.Peds runs the crowd: citizens stroll the sidewalks, panic and
// flee from gunfire and reckless driving, and can be knocked down by cars.
NH.Humans = (function () {
  const skinTones = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

  function makeFigure(shirt, pants, skin) {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: skin || NH.pick(skinTones) });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const hairMat = new THREE.MeshLambertMaterial({ color: NH.pick([0x1c1c1c, 0x4a2f1b, 0x8a6d3b, 0xd9d9d9, 0x7a1f1f]) });

    function limb(mat, w, h, d, px, py) {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.y = -h / 2; m.castShadow = true;
      pivot.add(m); g.add(pivot);
      return pivot;
    }
    const legL = limb(pantsMat, 0.2, 0.8, 0.24, -0.14, 0.82);
    const legR = limb(pantsMat, 0.2, 0.8, 0.24, 0.14, 0.82);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), shirtMat);
    torso.position.y = 1.16; torso.castShadow = true; g.add(torso);
    const armL = limb(shirtMat, 0.16, 0.68, 0.2, -0.37, 1.46);
    const armR = limb(shirtMat, 0.16, 0.68, 0.2, 0.37, 1.46);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
    head.position.y = 1.68; head.castShadow = true; g.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
    hair.position.y = 1.88; g.add(hair);
    return { group: g, legL: legL, legR: legR, armL: armL, armR: armR, torso: torso, head: head };
  }

  function animate(fig, phase, amount) {
    const s = Math.sin(phase) * 0.55 * amount;
    fig.legL.rotation.x = s; fig.legR.rotation.x = -s;
    fig.armL.rotation.x = -s * 0.8; fig.armR.rotation.x = s * 0.8;
  }

  function layDown(fig) {
    fig.group.rotation.x = -Math.PI / 2;
    fig.group.position.y = 0.25;
    fig.legL.rotation.x = 0.15; fig.legR.rotation.x = -0.1;
    fig.armL.rotation.x = 0.4; fig.armR.rotation.x = -0.3;
  }

  return { makeFigure: makeFigure, animate: animate, layDown: layDown, skinTones: skinTones };
})();

NH.Peds = (function () {
  const SHIRTS = [0xff6b81, 0xfeca57, 0x48dbfb, 0x1dd1a1, 0xf368e0, 0xff9f43, 0x54a0ff, 0x5f27cd, 0xffffff, 0x2ed573];
  const PANTS = [0x2f3542, 0x57606f, 0x747d8c, 0x3b4a6b, 0x6b4a2f, 0xdfe4ea];

  function spawn(scene, x, z) {
    const shirt = NH.pick(SHIRTS);
    const fig = NH.Humans.makeFigure(shirt, NH.pick(PANTS));
    fig.torso.material = fig.torso.material.clone();
    fig.group.position.set(x, 0, z);
    scene.add(fig.group);
    // walk state: stroll along a sidewalk line beside a street
    const vertical = NH.rng() < 0.5;
    const ped = {
      mesh: fig.group, fig: fig, isEnemy: false, baseShirt: shirt,
      heading: 0, speed: 0, walkPhase: NH.rand(0, 6),
      axis: vertical ? 'z' : 'x',
      line: NH.City.nearestStreet(vertical ? x : z),
      side: NH.rng() < 0.5 ? -11.5 : 11.5,
      dir: NH.rng() < 0.5 ? 1 : -1,
      health: 30, dead: false, deathTimer: 0,
      panic: 0, threatX: 0, threatZ: 0, hitFlash: 0
    };
    return ped;
  }

  function sidewalkTarget(ped) {
    const p = ped.mesh.position;
    if (ped.axis === 'z') return { x: ped.line + ped.side, z: p.z + ped.dir * 18 };
    return { x: p.x + ped.dir * 18, z: ped.line + ped.side };
  }

  function updatePed(ped, dt, G) {
    const p = ped.mesh.position;
    if (ped.dead) { ped.deathTimer += dt; return; }

    // hit by a moving car?
    for (const car of G.cars) {
      if (car.dead) continue;
      const cp = car.mesh.position;
      if (Math.abs(car.speed) > 3 && NH.dist2(p.x, p.z, cp.x, cp.z) < 2.6 * 2.6) {
        ped.dead = true; ped.health = 0;
        NH.Humans.layDown(ped.fig);
        if (G.onPedHit) G.onPedHit(ped, car);
        return;
      }
    }

    let tx, tz, speed;
    if (ped.panic > 0) {
      ped.panic -= dt;
      const away = NH.angleTo(ped.threatX, ped.threatZ, p.x, p.z);
      tx = p.x + Math.sin(away) * 14; tz = p.z + Math.cos(away) * 14;
      speed = 4.6;
    } else {
      // turn around / switch street at intersections sometimes
      const along = ped.axis === 'z' ? p.z : p.x;
      for (const s of NH.City.STREETS) {
        if (Math.abs(along - s) < 0.8 && NH.rng() < 0.012) {
          if (NH.rng() < 0.5) { // cross to the other axis
            const oldAxis = ped.axis;
            ped.axis = oldAxis === 'z' ? 'x' : 'z';
            ped.line = NH.City.nearestStreet(oldAxis === 'z' ? p.x : p.z);
            ped.side = NH.rng() < 0.5 ? -11.5 : 11.5;
            ped.dir = NH.rng() < 0.5 ? 1 : -1;
          } else ped.dir *= -1;
        }
      }
      const t = sidewalkTarget(ped);
      tx = t.x; tz = t.z; speed = 1.7;
    }

    const want = NH.angleTo(p.x, p.z, tx, tz);
    ped.heading = NH.angleLerp(ped.heading, want, dt * 6);
    p.x += Math.sin(ped.heading) * speed * dt;
    p.z += Math.cos(ped.heading) * speed * dt;
    // keep out of buildings and the sea
    for (const box of NH.City.colliders) {
      const hit = NH.circleVsBox(p.x, p.z, 0.45, box);
      if (hit) { p.x += hit.x * hit.depth; p.z += hit.z * hit.depth; }
    }
    p.x = NH.clamp(p.x, -174, 236); p.z = NH.clamp(p.z, -174, 174);
    ped.mesh.rotation.y = ped.heading;
    ped.walkPhase += dt * (speed > 3 ? 11 : 7);
    NH.Humans.animate(ped.fig, ped.walkPhase, 1);
    if (ped.hitFlash > 0) {
      ped.hitFlash -= dt;
      if (ped.hitFlash <= 0) ped.fig.torso.material.color.setHex(ped.baseShirt);
    }
  }

  function update(dt, G) {
    for (const ped of G.peds) if (!ped.isEnemy) updatePed(ped, dt, G);
  }

  // Everyone within radius panics and runs from (x,z).
  function scare(G, x, z, radius) {
    for (const ped of G.peds) {
      if (ped.dead || ped.isEnemy) continue;
      const p = ped.mesh.position;
      if (NH.dist2(p.x, p.z, x, z) < radius * radius) {
        ped.panic = NH.rand(1.5, 3); ped.threatX = x; ped.threatZ = z;
      }
    }
  }

  return { spawn: spawn, update: update, scare: scare };
})();
