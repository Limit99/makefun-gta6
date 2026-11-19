# Neon Harbor: Vice Run

An original 3D open-world crime game set in the fictional sun-soaked coastal
city of **Solmara, 1987**. You are Rico Alvarez, a broke wheelman working for
fixer Marla: steal cars, run jobs, fight the Harbor Kings gang, and dodge
Solmara PD's five-star wanted system. Everything — city, names, story, art,
sound — was invented for this entry; the only library is three.js, vendored
as a minified build under `game/vendor/`.

## How to play

Open `game/index.html` in desktop Chrome (or serve with `node serve.ts`).
No network requests at runtime; everything is local.

- **WASD / arrows** — move on foot / drive
- **Mouse** — orbit camera and aim (click the game to pointer-lock)
- **Shift** — sprint · **Space** — jump on foot / handbrake in a car
- **E / F** — enter, steal, or exit the nearest car
- **Left mouse** — shoot the pistol (punch automatically up close)
- **R** — reload · **P** — save game · **M / Esc** — pause menu

Goal: finish Marla's 3 story missions (steal & deliver a coupe → dockside
shootout & escape → cross-city package run at 3 stars) for cash rewards, then
free-roam: 12 hidden packages ($100 each), health/armor pickups, police
chases. Lose condition: health hits zero (**WASTED** — hospital, 10% cash
fine) or police pin you while wanted (**BUSTED** — precinct, 15% fine).
Progress (cash, mission, packages, position, health) saves to localStorage
via P, the pause menu, and automatically at mission/pickup milestones; a
"Game Saved" indicator confirms, and Continue appears on the title screen.

## Map of game/src/

- `util.js` — seeded RNG, math, circle/ray vs box collision helpers
- `city.js` — Solmara generation: 6×6 street grid, pastel buildings with
  procedural facades + lit-window night glow, parks, parking lots, palms,
  lamps, beach, ocean, dock pier; static colliders and road queries
- `vehicles.js` — car factory (traffic / parked / sport / police), arcade
  driving physics, lane-following traffic AI that turns at intersections
  and brakes for obstacles
- `player.js` — Rico on foot (walk/sprint/jump, collision), health/armor,
  enter/steal/exit car interaction, driving input
- `police.js` — wanted heat→stars system with sight-based cooling, cruiser
  spawning, chase/ram AI with flashing lightbars, busted meter
- `pedestrians.js` — low-poly human figure factory + sidewalk crowd AI
  (strolling, panic/flee, car knockdowns)
- `combat.js` — hitscan pistol + melee, tracers, muzzle flash, particle
  bursts, enemy gunmen AI that strafes and shoots back
- `missions.js` — the 3-mission story (dialogue, stage objectives, glowing
  markers), hidden packages and health pickups
- `hud.js` — health/armor/cash/stars/weapon/objective HUD, dialogue and
  toast system, busted meter, canvas minimap (roads, ocean, player arrow,
  police blips, traffic, mission marker, packages)
- `audio.js` — WebAudio synthesis only: engine, siren, gunshots, impacts,
  pickups, jingles, bass music loop (no audio files)
- `save.js` — localStorage save/load
- `main.js` — boot, renderer, day/night cycle + lighting, camera, input,
  state machine (menu/play/pause/wasted/busted), crime bookkeeping,
  respawn, and the staged `?shot=` screenshot scenes

## Screenshots

`screenshots/1-cover.jpg … 4-night.jpg` are real renders of this game in
headless Chrome (1280×800) served by `node serve.ts`, driven by the
`?shot=cover|street|mission|night&seed=1` staging in `main.js` (see
`shots.json`), converted PNG→JPEG at quality 82. Cover: stolen coupe chased
by two cruisers at 3 stars with mission objective + minimap. Street: Rico
on foot amid traffic and pedestrians. Mission: the Harbor Kings shootout at
the pier (1/3 down). Night: dusk city with lit windows, headlights, and a
police roadblock.

## Known issues

- Headless/software rendering is slow (SwiftShader); on a real GPU the game
  runs at full frame rate. Shadow map is 1024² to stay cheap.
- Police and traffic occasionally ghost through each other at intersections
  (arcade collision model, no full rigid-body physics).
- Enemy gunmen have simple line-of-sight-free targeting within range.
- The pier deck is decorative: mission 2's fight happens on the sand beside
  it so combatants stay visible and reachable.
