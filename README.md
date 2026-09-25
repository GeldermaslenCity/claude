# ABYSSAL SIGNAL

> This repo also contains **DEAD COURTYARD**, a 3D first-person zombie survival game built with
> Three.js. See [`courtyard/README.md`](courtyard/README.md) for how to run it.

A 2D side-view submarine mining and survival-horror game for the browser. You pilot a small
mining submarine under the ice of an alien ocean. You mine ore in the dark, sell it at Anchor
Station and upgrade the sub so it can dive deeper, while something enormous listens below.

It uses only plain HTML, CSS and JavaScript with Canvas 2D and Web Audio. There are no
libraries, no build step and no asset files: every graphic and sound is generated at runtime.

## Running the game

**Option A: open the file.** Double-click `index.html`, or drag it into Chrome, Edge or
Firefox. The scripts are classic `<script>` tags, so the game also runs from `file://`.

**Option B: serve the folder.** This is recommended if your browser limits `file://` storage.

```bash
cd /path/to/this/repo
python3 -m http.server 8000
# then open http://localhost:8000
```

The game is designed for 1920×1080 and scales to any window size. Click once to enable audio;
browsers block sound until the page has had a user interaction. Headphones help: sounds are
panned to show where they come from.

## Controls

| Input | Action |
|---|---|
| **W A S D** / arrows | Steer the submarine |
| **Mouse** | Aim the floodlight and the mining laser |
| **Left click (hold)** | Mining laser. It also hurts creatures |
| **Right click** | Launch a decoy flare |
| **Space** | Sonar ping |
| **F** | Toggle the floodlight |
| **Shift (hold)** | Silent running: slow but quiet |
| **R** | Shock pulse (Countermeasures Mk II or higher) |
| **E** | Dock, read logs, pick up items. Hold E to repair the relay |
| **Tab / M** | Sonar map. The world keeps moving while it is open |
| **Esc / P** | Pause (save, settings, quit) |

## The expedition loop

1. **Launch** from Anchor Station, which hangs under the ice.
2. **Navigate** by floodlight and sonar. A ping outlines the cave walls, fills in the map and
   shows contacts. Everything nearby hears the ping.
3. **Mine** glinting deposits with the laser. Mining is loud. Cargo space is limited.
4. **Manage** hull, oxygen, battery, fuel and cargo:
   - Hitting walls damages the hull, and so does diving below your hull's crush depth.
   - Oxygen drains all the time.
   - The light, sonar, laser and shock pulse drain the battery.
   - The engine burns fuel. With empty tanks the sub falls back to weak battery propulsion.
5. **Dock** by pressing E at the green clamp. At the station you can:
   - sell ore
   - repair, refuel and restock flares (oxygen and battery refill for free)
   - buy upgrades
   - hand in contracts
6. **Death** loses your cargo. A rescue drone recovers 20% of its value, the company charges a
   recovery fee, and you relaunch with a half-repaired hull.

## World & progression

| Zone | Depth | Resources | Threats |
|---|---|---|---|
| Anchor Station | 0–170 m | none (safe zone) | none |
| The Shelf Caverns | 170–1,000 m | Iron, Copper, some Fuel Crystal | Needlejaws, Lamp Jellies |
| The Bone Gardens | 1,000–2,000 m | Copper, Titanium, Fuel Crystal, rare Resonite | Stalkers, Needlejaws, a few Lantern Maws, **the Warden** |
| The Hadal Throat | 2,000–3,000 m | Titanium, Fuel Crystal, Resonite | Lantern Maws, Stalkers, **the Warden** |
| The Trench | 3,000 m + | none | the source of the signal |

The world is generated from a seed that is stored with your save. Mined-out veins sometimes grow
back while you are docked.

**Upgrades** (10 lines, each with 3–4 levels):
- **Hull plating:** hull strength and crush depth. The final Trench-Rated Hull is story-locked.
- **Batteries**
- **Oxygen**
- **Engine and fuel tanks**
- **Quiet propulsion**
- **Floodlights**
- **Mining laser:** Mk II cuts Titanium and Fuel Crystal. Mk III cuts Resonite.
- **Cargo hold**
- **Sonar:** range, contact classification, fewer ghost contacts, and passive tracking of the Warden.
- **Countermeasures:** more flares, and a shock pulse from Mk II.

### Creatures

- **Needlejaw** (killable): small fish that are drawn to your floodlight. They nip at the hull.
- **Hollow Stalker** (killable): an eel that hunts noise but hates light. It circles in the dark
  and strikes from behind. Keep it lit.
- **Lantern Maw** (killable): a blind angler with a pretty glowing lure. It lunges at vibration,
  so go slow and quiet near the lights in the dark.
- **Lamp Jelly** (killable): harmless and bioluminescent.
- **The Warden** (unkillable): a huge serpent that lives below 925 m. It tracks your noise,
  sonar pings and light, and burrows through rock. It usually stalks you just past the edge of
  your floodlight, then hunts you down. You can deal with it in four ways:
  - Go silent and dark until it loses interest.
  - Throw a flare to distract it.
  - Shock it so it retreats.
  - Climb back above 925 m.

### Story mission: *The Kestrel Signal*

1. Find the wreck of the survey sub *Kestrel* and read the captain's log.
2. Recover its black box and bring it home for playback.
3. Find out what happened to the crew at the abandoned Vesna Research Station.
4. Carry 4 Titanium and 2 Copper down to Deep Relay 7 in the Hadal Throat and hold E to repair
   it. Welding is loud.
5. Bring the triangulation data home. This unlocks the Trench-Rated Hull.
6. Descend into the Trench and find what is transmitting. This triggers the vertical-slice ending.

The station also offers three rotating **contracts**:
- supply orders that pay above market rate
- salvage jobs: recover drones, buoys or flight recorders marked on your sonar

### Horror systems

The game builds tension without relying on jumpscares:

- You see very little. The floodlight casts shadows off the cave walls.
- Some sonar contacts are ghosts that vanish before you can identify them.
- The hydrophone reports bearings, and the Warden's groans are panned toward it.
- Distant calls, hull knocks, radio whispers, rockfalls and light flickers happen at random.
- Huge shadows sometimes drift through the far background.
- A three-pulse signal repeats every 9 s and gets louder with depth.
- A heartbeat plays when the Warden is close.
- You will find wrecks, an abandoned station, a giant skeleton, an unmanned sub still tapping
  from inside, and warm black spires at the Trench mouth.

## Menus & persistence

- **Title screen:** Continue, New Expedition, How to Play and Settings.
- **Training:** hints walk you through your first dive. You can turn them off in Settings.
- **Pause menu:** Resume, Save, How to Play, Settings, and Save & Quit.
- **Settings:** master, effects and ambience volume; brightness; screen shake; film grain;
  tutorial hints; FPS counter; render resolution (540p pixel-art or sharper 720p).
- **Saving:** the game saves automatically when you dock, launch, buy something or die, and you
  can save manually from the pause menu. Saves use `localStorage`. They store your progress,
  upgrades, contracts, logs, sub state and mined deposits, plus the explored sonar map as a
  compressed bitset.

## Code layout

```
index.html        page shell: canvas, HUD overlay, menu screens
css/style.css     interface styling
js/util.js        math, seeded RNG, hash/value noise, colour helpers
js/config.js      world constants, zones, resources, upgrades, prices
js/audio.js       Web Audio synth: engine, laser, depth drone, all one-shot effects
js/input.js       keyboard and mouse state
js/save.js        localStorage profile and settings, bitset encoding
js/world.js       cave generation (worms + cellular automata + flood-seal), deposits, decor,
                  chunk-cached rendering, DDA raycasting, sonar map
js/structures.js  procedurally drawn station, wrecks, research base, skeleton, relay, gate, abyss
js/particles.js   bubbles, sparks, debris, ichor, silt, ore chunks
js/lighting.js    darkness overlay, shadow-casting floodlight cone, additive glow pass
js/sonar.js       pings, echoes, real and ghost contacts, HUD scope
js/submarine.js   physics, collisions, vitals, noise model, mining laser
js/creatures.js   BFS flow-field pathing, Needlejaw / Stalker / Lantern Maw / Lamp Jelly AI
js/warden.js      the unkillable leviathan: awareness model and roam/stalk/hunt/strike/retreat
js/missions.js    story stages, logs, contracts, tutorial steps
js/atmosphere.js  horror director: signal, heartbeat, random events, parallax backdrop, marine snow
js/hud.js         in-game HUD and message feed
js/ui.js          title, settings, pause, station tabs, map, logs, game over, ending
js/game.js        state machine, main loop, docking/launch/death, render pipeline
js/main.js        bootstrap (exposes window.game for debugging)
```

## Automated tests

The `tests/` folder contains Playwright scripts that drive the real game in headless Chromium.
They need Playwright installed, for example with `npm i -g playwright`.

```bash
NODE_PATH=$(npm root -g) OUT=/tmp node tests/smoke.cjs        # page loads without errors
NODE_PATH=$(npm root -g) OUT=/tmp node tests/playthrough.cjs  # full-loop checks + screenshots
NODE_PATH=$(npm root -g) OUT=/tmp node tests/freeplay.cjs     # random-input bot for a minute
```

`playthrough.cjs` checks the following:
- new game, launch and movement
- sonar and the floodlight toggle
- laser mining into cargo
- docking, selling, upgrades, the trench-hull lock and services
- every story stage, including the relay repair and the ending
- Warden awareness, strikes, shock and flares
- creature spawning
- death and cargo loss, then relaunch
- pause, and a save/load round trip
- the map
