// hud.js - everything drawn over the 3D view in Neon Harbor: Vice Run:
// health/armor bars, cash, wanted stars, weapon readout, mission objective,
// dialogue box, toasts, the busted meter, and the canvas minimap (roads,
// ocean, player arrow, police blips, traffic, mission marker, packages).
NH.HUD = (function () {
  let el = {};
  let dialogueTimer = 0, toastTimer = 0;
  let mapCtx = null;

  function grab() {
    const ids = ['hud', 'health-fill', 'armor-fill', 'cash', 'stars', 'clock', 'weapon-name', 'weapon-ammo',
      'mission-title', 'objective', 'packages', 'dialogue', 'toast', 'prompt', 'crosshair',
      'busted-bar-wrap', 'busted-fill', 'saved-indicator'];
    for (const id of ids) el[id] = document.getElementById(id);
    const mm = document.getElementById('minimap');
    if (mm) mapCtx = mm.getContext('2d');
  }

  function showDialogue(who, text, seconds) {
    if (!el.dialogue) grab();
    el.dialogue.querySelector('.who').textContent = who;
    el.dialogue.querySelector('.text').textContent = text;
    el.dialogue.classList.remove('hidden');
    dialogueTimer = seconds || 6;
  }

  function showToast(text) {
    if (!el.toast) grab();
    el.toast.textContent = text;
    el.toast.style.opacity = '1';
    toastTimer = 2.6;
  }

  function showSaved() {
    if (!el['saved-indicator']) grab();
    const s = el['saved-indicator'];
    s.style.opacity = '1';
    setTimeout(function () { s.style.opacity = '0'; }, 1600);
  }

  function setPrompt(text) {
    if (!el.prompt) grab();
    if (text) { el.prompt.textContent = text; el.prompt.classList.remove('hidden'); }
    else el.prompt.classList.add('hidden');
  }

  function update(dt, G) {
    if (!el.hud) grab();
    el['health-fill'].style.width = NH.clamp(G.player.health, 0, 100) + '%';
    el['armor-fill'].style.width = NH.clamp(G.player.armor, 0, 100) + '%';
    el.cash.textContent = '$' + Math.floor(G.cash);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += '<span class="' + (i < G.stars ? 'lit' : '') + '">★</span>';
    el.stars.innerHTML = stars;
    const hh = Math.floor(G.timeOfDay), mm2 = Math.floor((G.timeOfDay - hh) * 60);
    el.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm2 < 10 ? '0' : '') + mm2 + (G.playerCar ? '  ·  ' + Math.abs(Math.round(G.playerCar.speed * 3.6)) + ' km/h' : '');
    el['weapon-ammo'].textContent = G.playerCar ? '—' : (G.weapon.reloading > 0 ? '···' : G.weapon.ammo + ' / ∞');
    el['weapon-name'].textContent = G.playerCar ? 'VEHICLE' : 'PISTOL';
    el['mission-title'].textContent = G.missionTitle || '';
    el.objective.textContent = G.objective || '';
    el.packages.textContent = '▣ Packages: ' + G.packagesFound.length + ' / 12';
    el.crosshair.classList.toggle('hidden', !!G.playerCar || G.mode !== 'play');
    if (G.player.bustedMeter > 0.02) {
      el['busted-bar-wrap'].classList.remove('hidden');
      el['busted-fill'].style.width = (G.player.bustedMeter * 100) + '%';
    } else el['busted-bar-wrap'].classList.add('hidden');

    if (dialogueTimer > 0) { dialogueTimer -= dt; if (dialogueTimer <= 0) el.dialogue.classList.add('hidden'); }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.style.opacity = '0'; }
    drawMinimap(G);
  }

  // --- minimap ---
  const MAP_WORLD = 460, MAP_PX = 184;
  function w2m(x, z) {
    const s = MAP_PX / MAP_WORLD;
    return [92 + (x - 30) * s, 92 + z * s];
  }
  function drawMinimap(G) {
    if (!mapCtx) return;
    const c = mapCtx;
    c.fillStyle = '#274b63'; c.fillRect(0, 0, MAP_PX, MAP_PX);      // water
    const [lx, ly] = w2m(-178, -178), [rx] = w2m(219, 0);
    c.fillStyle = '#c9b489'; c.fillRect(lx, ly, rx - lx, MAP_PX);    // land
    const [bx] = w2m(178, 0);
    c.fillStyle = '#e8d194'; c.fillRect(bx, 0, rx - bx, MAP_PX);     // beach
    c.strokeStyle = '#3a3f46'; c.lineWidth = 5; c.beginPath();       // roads
    for (const s of NH.City.STREETS) {
      const [vx] = w2m(s, 0); c.moveTo(vx, 0); c.lineTo(vx, MAP_PX);
      const [, hz] = w2m(0, s); c.moveTo(0, hz); c.lineTo(MAP_PX, hz);
    }
    c.stroke();
    // pickups
    c.fillStyle = '#39d0d8';
    for (const pk of G.pickups) {
      if (pk.taken || pk.kind !== 'package') continue;
      const [px, py] = w2m(pk.x, pk.z); c.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    // traffic
    c.fillStyle = '#aab4c0';
    for (const car of G.cars) {
      if (car.kind === 'police') continue;
      const [px, py] = w2m(car.mesh.position.x, car.mesh.position.z);
      c.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    // mission marker
    const mp = NH.Missions.markerPos();
    if (mp) {
      const [px, py] = w2m(mp.x, mp.z);
      c.fillStyle = (G.time * 3) % 1 < 0.6 ? '#ffd94d' : '#fff3b0';
      c.beginPath(); c.arc(px, py, 4.5, 0, 6.29); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    }
    // police blips flash red/blue
    for (const cop of G.police) {
      const [px, py] = w2m(cop.mesh.position.x, cop.mesh.position.z);
      c.fillStyle = (G.time * 2.4) % 1 < 0.5 ? '#ff4040' : '#4d7bff';
      c.beginPath(); c.arc(px, py, 3.2, 0, 6.29); c.fill();
    }
    // player arrow
    const pp = G.playerPos;
    const [px, py] = w2m(pp.x, pp.z);
    const h = G.playerCar ? G.playerCar.heading : G.player.heading;
    c.save();
    c.translate(px, py); c.rotate(h);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, 6); c.lineTo(-4, -4); c.lineTo(4, -4); c.closePath(); c.fill();
    c.strokeStyle = '#10131f'; c.lineWidth = 1.2; c.stroke();
    c.restore();
  }

  return { grab: grab, update: update, showDialogue: showDialogue, showToast: showToast,
    showSaved: showSaved, setPrompt: setPrompt };
})();
