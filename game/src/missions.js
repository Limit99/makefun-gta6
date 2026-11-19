// missions.js - the story of Neon Harbor: Vice Run. Three missions for
// Rico Alvarez, told through radio dialogue with Marla, his fixer:
//   1. FIRST WHEELS  - steal a marked coupe and deliver it to the garage.
//   2. HARBOR HEAT   - a dockside shootout with the Harbor Kings, then escape.
//   3. SUNSET RUN    - a hot package run across the whole city.
// Plus free-roam content: 12 hidden packages ($100 each) and health pickups.
NH.Missions = (function () {
  let marker = null, markerRing = null;

  function makeMarker(scene) {
    const geo = new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false });
    marker = new THREE.Mesh(geo, mat);
    marker.position.y = 17;
    const rgeo = new THREE.RingGeometry(1.9, 2.5, 24);
    markerRing = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    markerRing.rotation.x = -Math.PI / 2; markerRing.position.y = 0.15;
    scene.add(marker); scene.add(markerRing);
  }

  function setMarker(x, z, color) {
    if (!marker) return;
    if (x === null) { marker.visible = false; markerRing.visible = false; return; }
    marker.visible = true; markerRing.visible = true;
    marker.position.x = x; marker.position.z = z;
    markerRing.position.x = x; markerRing.position.z = z;
    if (color) { marker.material.color.setHex(color); markerRing.material.color.setHex(color); }
  }

  const DEFS = [
    {
      id: 'first-wheels', title: 'FIRST WHEELS', reward: 500,
      intro: ['MARLA (RADIO)', 'Rico? Marla. Word is you drive like the devil owes you money. Prove it: there is a turquoise coupe parked by the marina. Take it. Bring it to the garage on the south-east corner. And try not to paint it with police.'],
      stages: [
        { obj: 'Steal the turquoise coupe by the marina', marker: [149, 28], color: 0x39d0d8,
          enter: function (G) {
            const car = NH.Vehicles.makeCar('sport', 0x19b5bd);
            car.kind = 'mission';
            car.mesh.position.set(149, 0, 28); car.heading = Math.PI / 2; car.mesh.rotation.y = car.heading;
            G.scene.add(car.mesh); G.cars.push(car);
            G.ms.missionCar = car;
          },
          done: function (G) { return G.player.car === G.ms.missionCar; } },
        { obj: 'Deliver the coupe to the garage', marker: [132, 100], color: 0xffd94d,
          done: function (G) {
            return G.player.car === G.ms.missionCar &&
              NH.dist(G.playerPos.x, G.playerPos.z, 132, 100) < 8;
          } }
      ],
      outro: ['MARLA (RADIO)', 'Clean work, wheelman. $500 wired. The Harbor Kings noticed you, though. Meet me at the docks tonight - bring that pistol of yours.']
    },
    {
      id: 'harbor-heat', title: 'HARBOR HEAT', reward: 900,
      intro: ['MARLA (RADIO)', 'The Kings think the docks are theirs. Three of their boys are guarding a shipment on the pier tonight. Send them swimming, then disappear to the safehouse in the north-west.'],
      stages: [
        { obj: 'Head to the pier on the east shore', marker: [205, -84], color: 0xffd94d,
          done: function (G) { return NH.dist(G.playerPos.x, G.playerPos.z, 205, -84) < 10; } },
        { obj: 'Take out the Harbor Kings', marker: [212, -84], color: 0xff5e5e, kills: 3,
          enter: function (G) {
            G.ms.kills = 0;
            for (const [ex, ez] of [[184, -88], [190, -76], [180, -80]]) {
              const e = NH.Combat.spawnEnemy(G.scene, ex, ez);
              e.baseShirt = 0x8e1f2f;
              G.peds.push(e); G.ms.enemies.push(e);
            }
            if (G.onCrime) G.onCrime('missionHeat', 212, -84);
          },
          done: function (G) { return G.ms.kills >= 3; } },
        { obj: 'Lose the heat, then reach the safehouse', marker: [-132, -132], color: 0x7bf1e8,
          enter: function (G) { G.heatFloor = 65; NH.Police.addHeat(G, 65); },
          done: function (G) {
            if (NH.dist(G.playerPos.x, G.playerPos.z, -132, -132) < 26) G.heatFloor = 0;
            return NH.dist(G.playerPos.x, G.playerPos.z, -132, -132) < 8 && G.stars <= 1;
          } }
      ],
      outro: ['MARLA (RADIO)', 'The Kings are short three soldiers and Solmara is talking. One last job, Rico - a package run. After that, this city is yours.']
    },
    {
      id: 'sunset-run', title: 'SUNSET RUN', reward: 1500,
      intro: ['MARLA (RADIO)', 'A package waits at Palm Court, west side. The second you touch it, every cop in Solmara will know your name. Drop it at the marina, south-east. Do not stop. Do not get caught.'],
      stages: [
        { obj: 'Pick up the package at Palm Court', marker: [-148, 84], color: 0xffd94d,
          done: function (G) { return NH.dist(G.playerPos.x, G.playerPos.z, -148, 84) < 6; } },
        { obj: 'Deliver the package to the marina drop - do not stop!', marker: [140, -140], color: 0xff5e8a,
          enter: function (G) { G.heatFloor = 125; NH.Police.addHeat(G, 130); NH.Audio.cash(); },
          done: function (G) { return NH.dist(G.playerPos.x, G.playerPos.z, 140, -140) < 8; } }
      ],
      outro: ['MARLA (RADIO)', 'You did it, Rico. From boat rat to legend in one week. Solmara is yours now - the packages hidden around town are my gift. Keep them warm.']
    }
  ];

  function startMission(G, idx) {
    G.ms = { stage: 0, kills: 0, enemies: [], missionCar: null };
    const def = DEFS[idx];
    if (!def) { // all missions done: free roam
      G.missionTitle = 'FREE ROAM';
      G.objective = 'Story complete! Find the hidden packages, outrun the law, cruise Solmara.';
      setMarker(null);
      return;
    }
    G.missionTitle = 'MISSION ' + (idx + 1) + ' - ' + def.title;
    G.showDialogue(def.intro[0], def.intro[1], 9);
    enterStage(G, def, 0);
  }

  function enterStage(G, def, stageIdx) {
    const stage = def.stages[stageIdx];
    G.ms.stage = stageIdx;
    G.objective = stage.obj;
    if (stage.marker) setMarker(stage.marker[0], stage.marker[1], stage.color);
    else setMarker(null);
    if (stage.enter) stage.enter(G);
    refreshObjective(G, def, stage);
  }

  function refreshObjective(G, def, stage) {
    if (stage && stage.kills) G.objective = stage.obj + ' (' + (G.ms.kills || 0) + '/' + stage.kills + ')';
  }

  function completeMission(G, def) {
    G.cash += def.reward;
    NH.Audio.missionDone();
    G.showToast('MISSION COMPLETE  +$' + def.reward);
    G.showDialogue(def.outro[0], def.outro[1], 9);
    G.heatFloor = 0;
    G.missionIndex++;
    startMission(G, G.missionIndex);
    G.autoSave();
  }

  function update(dt, G) {
    // spin the marker ring for visibility
    if (markerRing && markerRing.visible) {
      markerRing.rotation.z += dt * 1.5;
      const s = 1 + Math.sin(G.time * 4) * 0.08;
      markerRing.scale.set(s, s, 1);
    }
    const def = DEFS[G.missionIndex];
    if (!def || G.player.dead) return;
    const stage = def.stages[G.ms.stage];
    if (!stage) return;
    refreshObjective(G, def, stage);
    if (stage.done(G)) {
      if (G.ms.stage + 1 < def.stages.length) {
        NH.Audio.pickup();
        enterStage(G, def, G.ms.stage + 1);
      } else completeMission(G, def);
    }
  }

  // --- free-roam pickups: hidden packages + health ---
  const PACKAGE_SPOTS = [
    [-112, -104], [-56, 130], [0, -148], [56, -56], [112, 130], [168, 40],
    [-148, -28], [28, 148], [104, -140], [-104, 56], [182, -140], [60, 96]
  ];
  function makePickups(scene) {
    const pkgMat = new THREE.MeshLambertMaterial({ color: 0x39d0d8, emissive: 0x0d5a60 });
    const pkgGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const list = PACKAGE_SPOTS.map(function ([x, z], i) {
      const m = new THREE.Mesh(pkgGeo, pkgMat);
      m.position.set(x, 1.1, z); scene.add(m);
      return { mesh: m, x: x, z: z, kind: 'package', taken: false, id: i };
    });
    const heartMat = new THREE.MeshLambertMaterial({ color: 0xff5e7a, emissive: 0x5e1020 });
    for (const [x, z] of [[-76, 56], [84, -20], [196, -60]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), heartMat);
      m.position.set(x, 1.1, z); scene.add(m);
      list.push({ mesh: m, x: x, z: z, kind: 'health', taken: false, id: -1 });
    }
    return list;
  }

  function updatePickups(dt, G) {
    for (const pk of G.pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2.2;
      pk.mesh.position.y = 1.1 + Math.sin(G.time * 2.4 + pk.x) * 0.18;
      const d2 = NH.dist2(G.playerPos.x, G.playerPos.z, pk.x, pk.z);
      if (d2 < 2.1 * 2.1) {
        pk.taken = true; pk.mesh.visible = false;
        if (pk.kind === 'package') {
          G.packagesFound.push(pk.id);
          G.cash += 100;
          NH.Audio.cash();
          G.showToast('HIDDEN PACKAGE  +$100  (' + G.packagesFound.length + '/12)');
        } else {
          NH.Player.heal(G.player, 55);
          G.player.armor = Math.min(100, G.player.armor + 25);
          NH.Audio.pickup();
          G.showToast('PATCHED UP  +HEALTH & ARMOR');
        }
        G.autoSave();
      }
    }
  }

  return { DEFS: DEFS, startMission: startMission, update: update,
    makeMarker: makeMarker, setMarker: setMarker, makePickups: makePickups,
    updatePickups: updatePickups,
    markerPos: function () { return marker && marker.visible ? marker.position : null; } };
})();
