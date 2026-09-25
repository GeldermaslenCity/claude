# DEAD COURTYARD

A first-person, round-based zombie survival game for desktop browsers, built with
[Three.js](https://threejs.org/). You hold an abandoned courtyard against waves of low-poly
zombies. Earn points for hits and kills, and spend them on upgrades between rounds.

Everything runs locally. Three.js is included in `vendor/`, and there is no build step and no
internet connection needed.

## Running the game

The game uses JavaScript modules, which browsers will not load from `file://`. Serve the
folder with any static web server:

```bash
cd courtyard
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome, Edge or Firefox
```

If you don't have Python, any static server works, for example `npx http-server -p 8000`.

Click **Play**. The game captures the mouse (pointer lock). Press **Esc** to release it and
pause.

## Controls

| Input | Action |
|---|---|
| **W A S D** / arrows | Move |
| **Mouse** | Look / aim |
| **Left click** | Shoot (hold for the rifle) |
| **R** | Reload (an empty magazine reloads automatically) |
| **Shift** | Sprint (forward only; less accurate) |
| **Space** | Jump |
| **V** or **F** | Melee (always available, even with no ammo) |
| **1 / 2** or **Q** | Switch pistol / rifle |
| **Esc** or **P** | Pause (sensitivity, volume, restart, quit) |
| **Enter** | In the shop: start the next round |

## How it plays

- **Rounds.** Zombies climb out of the ground around the edges of the courtyard and chase you.
  A round ends when every zombie is dead.
- **Break.** After each round you get a 30-second break with the shop open. Press
  **Start round** when you're ready, or wait for the timer.
- **Scaling.** Each round has more zombies, more health, more damage and faster walkers.
  Red-eyed **runners** appear from round 3 and big **brutes** from round 5.
- **Points.**

  | Action | Points |
  |---|---|
  | Hit | +10 |
  | Kill | +60 |
  | Headshot kill | +100 |
  | Melee kill | +130 |
  | Clearing a round | +50 × the round number |

- **Health.** Regenerates slowly after 4.5 s without taking damage.
- **Ammo.** Each round tops the pistol back up to at least two magazines, so you can't get
  stuck with no ammo.

### Upgrades (shop between rounds)

| Upgrade | Effect | Price |
|---|---|---|
| Vitality | +25 max health (4 levels) | 500, +250 per level |
| Hollow Points | +20% damage (5 levels) | 750, +500 per level |
| Speed Loader | −15% reload time (4 levels) | 500, +300 per level |
| Extended Mags | +30% magazine size (3 levels) | 600, +400 per level |
| Sneakers | +8% move speed (3 levels) | 400, +300 per level |
| AR-15 Rifle | Full-auto rifle, 30-round magazine | 1500 |
| Ammo Crate | Refill reserve ammo for all weapons | 250 |
| Medkit | Full heal | 200 |

All balance numbers live in `js/config.js`.

## Project layout

```
courtyard/
├── index.html          HUD, menus, shop and game-over markup
├── css/style.css
├── js/
│   ├── main.js         Game loop, round flow, shop, screens, scoring
│   ├── config.js       Tuning: weapons, difficulty curve, upgrade prices
│   ├── world.js        Courtyard map, collisions, navigation grid for zombie pathing
│   ├── player.js       Movement, camera, weapons, shooting, reloading, melee
│   ├── zombies.js      Zombie models, animation, chase / attack / death
│   ├── effects.js      Blood, dust, sparks and tracers
│   ├── audio.js        Procedural Web Audio sound effects
│   ├── input.js        Keyboard, mouse and pointer lock
│   └── hud.js          On-screen HUD
├── tests/playtest.cjs  Automated headless playtest (see below)
└── vendor/three/       Three.js r186 (MIT licence)
```

### Implementation notes

- **Collisions.** The player and zombies are circles. The scenery is made of oriented boxes, so
  cars can sit at an angle. Movement pushes the circles back out of any box they overlap.
- **Zombie pathing.** The map is split into a 1 m grid. Every 0.25 s a Dijkstra flow field is
  computed from the player's position. A zombie that can see the player walks straight at
  them. Otherwise it follows the flow field around buildings, cars and barriers. Zombies also
  push away from each other so they don't pile into one spot.
- **Shooting.** Hitscan raycast from the camera, with spread when moving, sprinting or
  jumping. The head is a separate hitbox, so headshots do extra damage and pop the head off.
  Scenery blocks bullets.
- **Weapon rendering.** The weapon viewmodel is drawn in a second pass, so it never clips into
  walls.

## Testing

`tests/playtest.cjs` drives the game in headless Chromium with [Playwright](https://playwright.dev/).
It checks:

- movement, mouse look and jumping
- collisions with the fountain, walls, cars and buildings
- body shots, headshots, and bullets blocked by cars
- manual reload, auto-reload and melee
- zombies chasing and attacking, pathing around obstacles, and keeping apart from each other
- round clearing and the shop opening
- every upgrade, point deductions and disabled buttons
- the rifle's full-auto fire and weapon switching
- the next round being harder
- death, the game-over screen and a full restart
- a whole round played with the real spawner

```bash
cd courtyard
python3 -m http.server 8000 &
npm install playwright        # once; or reuse a global install via NODE_PATH=$(npm root -g)
node tests/playtest.cjs       # URL=... and OUT=<screenshot dir> are optional
```

The test opens the page with `?test`. That mode skips the pointer-lock requirement so a script
can drive the game, and exposes `window.game`.

## Credits and licences

- **Three.js** r186, © 2010–2026 three.js authors, MIT licence (`vendor/three/LICENSE`).
- **3D models.** None downloaded. Zombies, weapons, buildings, cars, barriers and props are
  built in code from boxes, cylinders and extruded shapes.
- **Sound.** None downloaded. Every sound (gunshots, reloads, groans, footsteps, stingers) is
  synthesised at runtime with the Web Audio API.
- **Textures.** The asphalt texture is drawn procedurally on a canvas at startup.

No third-party art or audio is used, so nothing else needs attribution.
