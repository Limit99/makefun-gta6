// combat.js - fighting in Neon Harbor: Vice Run: the player's hitscan
// pistol (with melee up close), tracers, muzzle flashes, spark/blood
// particles, and the enemy gunmen who shoot back during missions.
NH.Combat = (function () {
  const MAX_PARTICLES = 260;

  function initFx(scene) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    const parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) { parts.push({ life: 0, vx: 0, vy: 0, vz: 0 }); pos[i * 3 + 1] = -50; }
    // tracer lines pool
    const tracers = [];
    for (let i = 0; i < 10; i++) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
      line.frustumCulled = false; line.visible = false;
      scene.add(line);
      tracers.push({ line: line, life: 0 });
    }
    // muzzle flash sprite
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fg = fc.getContext('2d');
    const grad = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.4, 'rgba(255,170,60,0.8)'); grad.addColorStop(1, 'rgba(255,120,20,0)');
    fg.fillStyle = grad; fg.fillRect(0, 0, 64, 64);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false }));
    flash.scale.set(1.1, 1.1, 1); flash.visible = false;
    scene.add(flash);
    return { points: points, parts: parts, posAttr: geo.attributes.position, colAttr: geo.attributes.color, tracers: tracers, flash: flash, flashLife: 0, next: 0 };
  }

  function burst(fx, x, y, z, colorHex, n, speed, up) {
    const c = new THREE.Color(colorHex);
    for (let k = 0; k < n; k++) {
      const i = fx.next; fx.next = (fx.next + 1) % MAX_PARTICLES;
      const p = fx.parts[i];
      p.life = NH.rand(0.25, 0.6);
      p.vx = NH.rand(-1, 1) * speed; p.vz = NH.rand(-1, 1) * speed;
      p.vy = NH.rand(0.2, 1) * (up || 2.4);
      fx.posAttr.setXYZ(i, x, y, z);
      fx.colAttr.setXYZ(i, c.r, c.g, c.b);
    }
    fx.posAttr.needsUpdate = true; fx.colAttr.needsUpdate = true;
  }

  function tracer(fx, ax, ay, az, bx, by, bz, color) {
    for (const t of fx.tracers) {
      if (t.life <= 0) {
        t.life = 0.07;
        t.line.material.color.setHex(color || 0xffe9a0);
        t.line.geometry.attributes.position.setXYZ(0, ax, ay, az);
        t.line.geometry.attributes.position.setXYZ(1, bx, by, bz);
        t.line.geometry.attributes.position.needsUpdate = true;
        t.line.visible = true;
        return;
      }
    }
  }

  function muzzle(fx, x, y, z) {
    fx.flash.position.set(x, y, z);
    fx.flash.visible = true;
    fx.flashLife = 0.05;
    fx.flash.material.rotation = Math.random() * 3;
  }

  function updateFx(fx, dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = fx.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { fx.posAttr.setY(i, -50); continue; }
      p.vy -= 6.5 * dt;
      fx.posAttr.setXYZ(i,
        fx.posAttr.getX(i) + p.vx * dt,
        Math.max(0.05, fx.posAttr.getY(i) + p.vy * dt),
        fx.posAttr.getZ(i) + p.vz * dt);
    }
    fx.posAttr.needsUpdate = true;
    for (const t of fx.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
    if (fx.flashLife > 0) { fx.flashLife -= dt; if (fx.flashLife <= 0) fx.flash.visible = false; }
  }

  // --- enemies ---
  function spawnEnemy(scene, x, z) {
    const fig = NH.Humans.makeFigure(0x8e1f2f, 0x1c1c22, 0xe0ac69); // Harbor Kings: crimson
    fig.group.position.set(x, 0, z);
    scene.add(fig.group);
    const ped = {
      mesh: fig.group, fig: fig, isEnemy: true, baseShirt: 0x8e1f2f,
      heading: NH.rand(0, 6.28), speed: 0, walkPhase: 0,
      health: 100, dead: false, deathTimer: 0, hitFlash: 0,
      shootCd: NH.rand(0.4, 1.2), strafeDir: NH.rng() < 0.5 ? 1 : -1, panic: 0
    };
    fig.torso.material = fig.torso.material.clone();
    return ped;
  }

  function hurtPerson(G, ped, dmg, fx) {
    ped.health -= dmg;
    ped.hitFlash = 0.12;
    ped.fig.torso.material.color.setHex(0xff3333);
    const p = ped.mesh.position;
    burst(fx, p.x, 1.3, p.z, 0xb02020, 6, 1.6, 2);
    NH.Audio.hit();
    if (ped.health <= 0 && !ped.dead) {
      ped.dead = true;
      NH.Humans.layDown(ped.fig);
      if (ped.isEnemy) { if (G.onEnemyKilled) G.onEnemyKilled(ped); }
      else if (G.onCrime) G.onCrime('pedDown', p.x, p.z);
    }
  }

  function updateEnemy(ped, dt, G) {
    const p = ped.mesh.position;
    if (ped.dead) { ped.deathTimer += dt; return; }
    if (ped.hitFlash > 0) {
      ped.hitFlash -= dt;
      if (ped.hitFlash <= 0) ped.fig.torso.material.color.setHex(ped.baseShirt);
    }
    const pp = G.playerPos;
    const d = NH.dist(p.x, p.z, pp.x, pp.z);
    const want = NH.angleTo(p.x, p.z, pp.x, pp.z);
    ped.heading = NH.angleLerp(ped.heading, want, dt * 8);
    let move = 0;
    if (d > 20) move = 3.4;                 // close in
    else if (d < 9) move = -2.2;            // back off
    else { // strafe sideways while fighting
      p.x += Math.sin(ped.heading + Math.PI / 2) * ped.strafeDir * 1.1 * dt;
      p.z += Math.cos(ped.heading + Math.PI / 2) * ped.strafeDir * 1.1 * dt;
      if (NH.rng() < dt * 0.25) ped.strafeDir *= -1;
    }
    if (move !== 0) {
      p.x += Math.sin(ped.heading) * move * dt;
      p.z += Math.cos(ped.heading) * move * dt;
      ped.walkPhase += dt * 9;
      NH.Humans.animate(ped.fig, ped.walkPhase, 1);
    }
    for (const box of NH.City.colliders) {
      const hit = NH.circleVsBox(p.x, p.z, 0.45, box);
      if (hit) { p.x += hit.x * hit.depth; p.z += hit.z * hit.depth; }
    }
    ped.mesh.rotation.y = ped.heading;
    // shoot back
    ped.shootCd -= dt;
    if (ped.shootCd <= 0 && d < 42 && !G.player.dead) {
      ped.shootCd = NH.rand(0.85, 1.5);
      const fx = G.fx;
      muzzle(fx, p.x + Math.sin(ped.heading) * 0.5, 1.42, p.z + Math.cos(ped.heading) * 0.5);
      const targetY = G.playerCar ? 0.9 : 1.25;
      const hitChance = NH.clamp(0.62 - d * 0.008 - (G.playerCar ? Math.abs(G.playerCar.speed) * 0.012 : (G.player.moving ? 0.12 : 0)), 0.15, 0.65);
      if (NH.rng() < hitChance) {
        tracer(fx, p.x, 1.42, p.z, pp.x, targetY, pp.z, 0xffb0a0);
        NH.Player.damage(G.player, NH.rand(4, 9), G);
        burst(fx, pp.x, 1.2, pp.z, 0xb02020, 4, 1.2, 1.6);
      } else {
        const miss = NH.rand(-2.5, 2.5);
        tracer(fx, p.x, 1.42, p.z, pp.x + miss, targetY + NH.rand(-0.4, 0.7), pp.z + NH.rand(-2.5, 2.5), 0xffb0a0);
      }
      NH.Audio.shot();
    }
  }

  function updateEnemies(dt, G) {
    for (const ped of G.peds) if (ped.isEnemy) updateEnemy(ped, dt, G);
  }

  // --- the player's pistol ---
  function tryShoot(G, origin, dir) {
    const w = G.weapon;
    if (w.cooldown > 0 || w.reloading > 0 || G.player.dead) return;
    const pp = G.player.mesh.position;
    // melee instead when a hostile is right in front of us
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const ep = ped.mesh.position;
      if (NH.dist2(pp.x, pp.z, ep.x, ep.z) < 2.3 * 2.3) {
        w.cooldown = 0.45;
        hurtPerson(G, ped, 55, G.fx);
        NH.Peds.scare(G, pp.x, pp.z, 14);
        return;
      }
    }
    if (w.ammo <= 0) { NH.Audio.dryFire(); w.cooldown = 0.3; return; }
    w.ammo--; w.cooldown = 0.24;
    NH.Audio.shot();
    const fx = G.fx;
    const gx = pp.x + dir.x * 0.5, gy = 1.42 + (G.player.y || 0), gz = pp.z + dir.z * 0.5;
    muzzle(fx, gx, gy, gz);

    // analytic hitscan: nearest of people / cars / buildings
    let bestT = 90, bestKind = null, bestObj = null;
    function rayCircle(cx, cz, r) { // 2D ray vs circle, returns t or Infinity
      const ox = origin.x - cx, oz = origin.z - cz;
      const b = ox * dir.x + oz * dir.z;
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) return Infinity;
      const t = -b - Math.sqrt(disc);
      return t > 0.3 ? t : Infinity;
    }
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const ep = ped.mesh.position;
      const t = rayCircle(ep.x, ep.z, 0.5);
      if (t < bestT) {
        // rough height check: ray height at t must be within the body
        const hy = origin.y + dir.y * t;
        if (hy > 0 && hy < 1.95) { bestT = t; bestKind = 'person'; bestObj = ped; }
      }
    }
    for (const car of G.cars) {
      if (car.dead) continue;
      const cp = car.mesh.position;
      const t = rayCircle(cp.x, cp.z, 2.5);
      if (t < bestT) {
        const hy = origin.y + dir.y * t;
        if (hy > -0.2 && hy < 2.1) { bestT = t; bestKind = 'car'; bestObj = car; }
      }
    }
    for (const box of NH.City.colliders) {
      const t = NH.rayVsBox2D(origin.x, origin.z, dir.x, dir.z, box);
      if (t < bestT) {
        const hy = origin.y + dir.y * t;
        if (hy < 34) { bestT = t; bestKind = 'wall'; bestObj = null; }
      }
    }
    const hx = origin.x + dir.x * bestT, hy = origin.y + dir.y * bestT, hz = origin.z + dir.z * bestT;
    tracer(fx, gx, gy, gz, hx, hy, hz);
    if (bestKind === 'person') hurtPerson(G, bestObj, 34, fx);
    else if (bestKind === 'car') {
      bestObj.health -= 16;
      burst(fx, hx, hy, hz, 0xffcf5e, 7, 2.2, 2.2);
      NH.Audio.hit();
      if (G.onCrime) G.onCrime('shotCar', hx, hz);
    } else if (bestKind === 'wall') burst(fx, hx, hy, hz, 0xcccccc, 4, 1.4, 1.6);

    NH.Peds.scare(G, pp.x, pp.z, 22);
    if (G.onCrime) G.onCrime('gunshot', pp.x, pp.z);
    if (w.ammo === 0) startReload(G);
  }

  function startReload(G) {
    const w = G.weapon;
    if (w.reloading > 0 || w.ammo === w.magSize) return;
    w.reloading = 1.1;
    NH.Audio.reload();
  }

  function updateWeapon(dt, G) {
    const w = G.weapon;
    if (w.cooldown > 0) w.cooldown -= dt;
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) w.ammo = w.magSize;
    }
  }

  return { initFx: initFx, burst: burst, tracer: tracer, muzzle: muzzle, updateFx: updateFx,
    spawnEnemy: spawnEnemy, updateEnemies: updateEnemies, tryShoot: tryShoot,
    startReload: startReload, updateWeapon: updateWeapon };
})();
