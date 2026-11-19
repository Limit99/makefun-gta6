# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Limit99/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Limit99/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor: Vice Run** — an original 3D open-world crime game set in Solmara, a sun-soaked coastal city in 1987. Play as Rico Alvarez, a wheelman working for fixer Marla against the Harbor Kings gang: explore the city on foot and by car, steal and drive cars, run traffic-dodging deliveries, fight gang gunmen, complete 3 story missions, collect 12 hidden packages — and shake the police while your wanted level climbs to 5 stars. Full HUD with a live minimap, day/night cycle, synthesized WebAudio engine/siren/music, and localStorage saves. Everything — city, characters, story, art, sound — is original and generated in code; three.js is vendored under `game/vendor/`.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
```

No build step and no network: `game/index.html` and its files are the whole game. Hand-in check: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

Controls: WASD move/drive · mouse orbit & aim · Shift sprint · E/F enter/exit car · Space handbrake · left mouse shoot · Esc pause.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0gynx1gq&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
