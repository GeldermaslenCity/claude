// Automated playtest in headless Chromium. Checks movement, collisions, shooting, reloading,
// zombie pathing and attacks, round flow, the shop, death and restart.
//
// Run from the courtyard/ folder while a local server is running:
//   python3 -m http.server 8000 &
//   npm install playwright   (or use a global install: NODE_PATH=$(npm root -g))
//   node tests/playtest.cjs
// Environment: URL (default http://localhost:8000/index.html), OUT (screenshot folder).
const { chromium } = require('playwright');

const URL = (process.env.URL || 'http://localhost:8000/index.html') + '?test';
const OUT = process.env.OUT || '.';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let failed = 0;
  const check = (cond, msg, data) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${data !== undefined ? '  ' + JSON.stringify(data) : ''}`);
    if (!cond) failed++;
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });

  await page.goto(URL);
  await page.waitForFunction(() => window.game && game.state === 'menu');
  await page.click('#btn-play');
  await page.waitForTimeout(200);

  // Helpers installed in the page. The rAF loop keeps running; game.step() advances time
  // deterministically on top of it.
  await ev(() => {
    window.T = {
      aimAt(x, y, z) {
        const p = game.player;
        const eyeY = p.pos.y + 1.65;
        const dx = x - p.pos.x, dy = y - eyeY, dz = z - p.pos.z;
        p.yaw = Math.atan2(-dx, -dz);
        p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      },
      fire() { game.input.mouseClicked = true; game.input.mouseDown = true; game.step(1 / 60); game.input.mouseDown = false; },
      spawnAt(x, z, type = 'walker') {
        const zb = game.spawnZombie();
        zb.pos.set(x, 0, z); zb.group.position.set(x, 0, z);
        zb.state = 'chase'; zb.stateTime = 0;
        zb.speed = 0; // frozen unless the test changes it
        return game.zombies.indexOf(zb);
      },
      freeze() { game.phase = 'test'; }, // stops the round manager from spawning / clearing
    };
  });

  // ---------------- basics ----------------
  let s = await ev(() => ({ state: game.state, round: game.round, hp: game.player.health, mag: game.player.weapon.mag, pts: game.points }));
  check(s.state === 'playing' && s.round === 1, 'game starts at round 1', s);
  check(s.mag === 10, 'click on Play did not fire a shot', s);
  await ev(() => game.step(0.5));
  await shot('01-start');

  // ---------------- movement via real keyboard events ----------------
  await ev(() => { T.freeze(); game.player.pos.set(0, 0, 7); game.player.yaw = 0; game.player.pitch = 0; });
  await page.keyboard.down('KeyW');
  await ev(() => game.step(0.6));
  await page.keyboard.up('KeyW');
  s = await ev(() => game.player.pos.toArray());
  check(s[2] < 5 && Math.abs(s[0]) < 0.3, 'W moves forward (towards -Z)', s);
  await page.keyboard.down('KeyD');
  await ev(() => game.step(0.5));
  await page.keyboard.up('KeyD');
  const s2 = await ev(() => game.player.pos.toArray());
  check(s2[0] > s[0] + 1.2, 'D strafes right', s2);
  await page.keyboard.down('KeyA');
  await ev(() => game.step(0.5));
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');
  await ev(() => game.step(0.5));
  await page.keyboard.up('KeyS');
  const s3 = await ev(() => game.player.pos.toArray());
  check(s3[2] > s2[2] + 1.2, 'S moves backward', s3);

  // mouse look through the real input path
  const yaw0 = await ev(() => { game.input.locked = true; return game.player.yaw; });
  await ev(() => { game.input.dx = 200; game.step(1 / 60); });
  const yaw1 = await ev(() => game.player.yaw);
  check(yaw1 < yaw0 - 0.2, 'mouse X turns the view', { yaw0, yaw1 });
  await ev(() => { game.input.locked = false; });

  // jumping
  await ev(() => { game.player.pos.set(0, 0, 7); game.input.pressed.add('Space'); game.step(1 / 60); });
  const jy = await ev(() => { game.step(0.2); return game.player.pos.y; });
  const ly = await ev(() => { game.step(1.0); return game.player.pos.y; });
  check(jy > 0.5 && ly === 0, 'space jumps and lands', { jy, ly });

  // ---------------- collisions ----------------
  s = await ev(() => {
    const p = game.player; p.pos.set(0, 0, 7); p.yaw = 0; p.vel.set(0, 0, 0);
    let minClear = Infinity;
    game.input.keys.add('KeyW');
    for (let i = 0; i < 180; i++) { game.step(1 / 60); minClear = Math.min(minClear, game.world.pointClearance(p.pos.x, p.pos.z)); }
    game.input.keys.delete('KeyW');
    return { pos: p.pos.toArray(), minClear };
  });
  check(s.minClear > 0.3, 'fountain blocks the player (slides around it, never inside)', s);
  s = await ev(() => {
    const p = game.player; p.pos.set(0, 0, 20.5); p.yaw = 0; p.vel.set(0, 0, 0);
    game.input.keys.add('KeyS'); game.step(4); game.input.keys.delete('KeyS');
    return p.pos.toArray();
  });
  check(s[2] <= 29.61, 'perimeter wall blocks the player', s);
  s = await ev(() => {
    const p = game.player; p.pos.set(-13, 0, 10); p.yaw = 0; p.vel.set(0, 0, 0); // car at (-13, 7)
    game.input.keys.add('KeyW'); game.step(2); game.input.keys.delete('KeyW');
    return { pos: p.pos.toArray(), clear: game.world.pointClearance(p.pos.x, p.pos.z) };
  });
  check(s.clear > 0.3, 'player cannot walk into a car', s);
  // sprinting into a building corner at an angle must not tunnel through
  s = await ev(() => {
    const p = game.player; p.pos.set(-12, 0, -16); p.yaw = Math.atan2(1, 1); p.vel.set(0, 0, 0);
    game.input.keys.add('KeyW'); game.input.keys.add('ShiftLeft'); game.step(3);
    game.input.keys.clear();
    return { pos: p.pos.toArray(), clear: game.world.pointClearance(p.pos.x, p.pos.z) };
  });
  check(s.clear > 0.3, 'sprinting into a building does not clip through', s);

  // ---------------- shooting ----------------
  s = await ev(() => {
    const p = game.player; p.pos.set(0, 0, 12); p.vel.set(0, 0, 0);
    game.effects.clear();
    const i = T.spawnAt(0, 18);
    const z = game.zombies[i];
    game.step(0.05);
    const hp0 = z.health, mag0 = p.weapon.mag, pts0 = game.points;
    T.aimAt(0, 1.2, 18); // torso
    T.fire();
    return { hp0, hp1: z.health, mag0, mag1: p.weapon.mag, pts: game.points - pts0 };
  });
  check(s.hp1 < s.hp0, 'body shot damages a zombie', s);
  check(s.mag1 === s.mag0 - 1, 'shooting uses one round', s);
  check(s.pts === 10, 'a hit awards 10 points', s);
  await ev(() => game.step(0.3));
  s = await ev(() => {
    const z = game.zombies[game.zombies.length - 1];
    const head = z.head.getWorldPosition(new z.pos.constructor());
    T.aimAt(head.x, head.y, head.z);
    const pts0 = game.points, hs0 = game.headshots;
    T.fire();
    return { alive: z.alive, headless: z.headless, pts: game.points - pts0, hs: game.headshots - hs0 };
  });
  check(!s.alive && s.headless && s.hs === 1 && s.pts === 100, 'headshot kills and awards 100', s);
  await ev(() => game.step(0.1));
  await shot('02-headshot');

  // shots are blocked by scenery
  s = await ev(() => {
    const p = game.player; p.pos.set(-13, 0, 11); // car at (-13, 7) sits between player and zombie
    const i = T.spawnAt(-13, 3);
    const z = game.zombies[i];
    game.step(0.05);
    const hp0 = z.health;
    T.aimAt(-13, 0.8, 3);
    T.fire();
    return { hp0, hp1: z.health };
  });
  check(s.hp1 === s.hp0, 'a car blocks bullets', s);

  // ---------------- reloading ----------------
  s = await ev(() => {
    const p = game.player; const w = p.weapon;
    w.mag = 3; const res0 = w.reserve;
    game.input.pressed.add('KeyR'); game.step(1 / 60);
    const reloading = p.reloading;
    game.input.mouseClicked = true; game.step(1 / 60);
    const magDuring = w.mag;
    game.step(p.reloadDuration() + 0.1);
    return { reloading, magDuring, mag: w.mag, size: p.magSize(), res0, res1: w.reserve };
  });
  check(s.reloading && s.magDuring === 3, 'R starts a reload and blocks firing', s);
  check(s.mag === s.size && s.res1 === s.res0 - (s.size - 3), 'reload fills the magazine from reserve', s);
  s = await ev(() => {
    const p = game.player; p.weapon.mag = 1; p.fireCooldown = 0;
    T.aimAt(0, 1, -30); T.fire(); game.step(0.2);
    return { reloading: p.reloading };
  });
  check(s.reloading, 'empty magazine auto-reloads', s);
  await ev(() => game.step(2));

  // melee
  s = await ev(() => {
    const p = game.player; p.pos.set(5, 0, 9); p.vel.set(0, 0, 0);
    const i = T.spawnAt(5, 7.6); const z = game.zombies[i];
    T.aimAt(5, 1.2, 7.6); game.step(1 / 60);
    const hp0 = z.health;
    game.input.pressed.add('KeyV'); game.step(1 / 60);
    return { hp0, hp1: z.health };
  });
  check(s.hp1 < s.hp0, 'melee (V) damages an adjacent zombie', s);

  // ---------------- zombie behaviour ----------------
  // Clear test zombies, then put one behind the NW apartment block's corner so it must path around.
  s = await ev(() => {
    game.clearZombies();
    const p = game.player; p.pos.set(-10, 0, -24); p.vel.set(0, 0, 0); p.health = 1000; p.maxHealth = 1000;
    const i = T.spawnAt(-24, -16);
    const z = game.zombies[i]; z.speed = 2.5;
    const d0 = Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z);
    let minClear = Infinity, t = 0;
    while (t < 20) {
      game.step(0.1); t += 0.1;
      minClear = Math.min(minClear, game.world.pointClearance(z.pos.x, z.pos.z));
      if (p.health < 1000) break;
    }
    const d1 = Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z);
    return { d0, d1, t: +t.toFixed(1), hurt: 1000 - p.health, minClear: +minClear.toFixed(2) };
  });
  check(s.d1 < 2 && s.hurt > 0, 'zombie chases the player and attacks', s);
  check(s.minClear > 0.25, 'zombie never overlaps scenery while chasing', s);

  // zombie trapped behind a car / barrier line finds a way round
  s = await ev(() => {
    game.clearZombies();
    const p = game.player; p.pos.set(0, 0, 23); p.health = p.maxHealth = 1000;
    const i = T.spawnAt(0, 16); const z = game.zombies[i]; z.speed = 2.5; // jersey barriers at z≈19 in between
    let t = 0; while (t < 15 && p.health >= 1000) { game.step(0.1); t += 0.1; }
    return { t: +t.toFixed(1), hurt: 1000 - p.health, zpos: z.pos.toArray().map(v => +v.toFixed(2)) };
  });
  check(s.hurt > 0, 'zombie paths around the barrier line to reach the player', s);

  // separation: several zombies don't stack on one spot
  s = await ev(() => {
    game.clearZombies();
    const p = game.player; p.pos.set(0, 0, 10); p.health = p.maxHealth = 1000;
    for (let k = 0; k < 6; k++) { const z = game.zombies[T.spawnAt(-6 + k * 0.1, 18)]; z.speed = 2; }
    game.step(6);
    let minD = Infinity;
    for (const a of game.zombies) for (const b of game.zombies) if (a !== b) minD = Math.min(minD, a.pos.distanceTo(b.pos));
    return { minD: +minD.toFixed(2) };
  });
  check(s.minD > 0.35, 'zombies separate from each other', s);
  await shot('03-horde');

  // ---------------- round flow ----------------
  s = await ev(() => {
    game.clearZombies();
    const p = game.player; p.maxHealth = 100; p.health = 100; p.pos.set(0, 0, 7);
    game.phase = 'wave'; game.toSpawn = 4; game.spawnTimer = 0;
    let spawned = 0, t = 0;
    while (t < 60 && game.state === 'playing' && game.phase === 'wave') {
      game.step(0.1); t += 0.1;
      for (const z of game.zombies) if (z.alive && z.state !== 'rising') {
        z.speed = 0;
        game.damageZombie(z, 9999, 'body', z.pos.clone().setY(1), new z.pos.constructor(0, 0, 1)); spawned++;
      }
    }
    return { phase: game.phase, killed: spawned, remaining: game.zombiesRemaining() };
  });
  check(s.phase === 'cleared' && s.killed === 4 && s.remaining === 0, 'killing every zombie clears the round', s);
  await ev(() => game.step(3));
  s = await ev(() => ({ state: game.state, timer: game.shopTimer }));
  check(s.state === 'shop', 'shop opens after the round', s);
  await shot('04-shop');

  // ---------------- upgrades ----------------
  s = await ev(() => {
    const p = game.player;
    game.points = 20000; game.renderShop();
    const before = { max: p.maxHealth, dmg: p.damageMult(), reload: p.reloadDuration(), mag: p.magSize(), speed: p.speedMult() };
    const r = {};
    for (const id of ['vitality', 'damage', 'reload', 'mag', 'speed']) r[id] = game.buy(id);
    const after = { max: p.maxHealth, dmg: p.damageMult(), reload: +p.reloadDuration().toFixed(3), mag: p.magSize('pistol'), speed: p.speedMult() };
    r.rifle = game.buy('rifle');
    Object.assign(after, { rifle: p.weapons.rifle.owned, current: p.current });
    p.health = 50; r.heal = game.buy('heal');
    p.weapons.pistol.reserve = 0; r.ammo = game.buy('ammo');
    const spent = 20000 - game.points;
    return { before, after, r, hp: p.health, reserve: p.weapons.pistol.reserve, spent };
  });
  check(s.after.max === s.before.max + 25, 'Vitality raises max health', s.after);
  check(s.after.dmg > s.before.dmg, 'Hollow Points raises damage');
  check(s.after.reload < s.before.reload, 'Speed Loader shortens reloads');
  check(s.after.mag > s.before.mag, 'Extended Mags enlarge the magazine');
  check(s.after.speed > s.before.speed, 'Sneakers raise move speed');
  check(s.after.rifle && s.after.current === 'rifle', 'rifle can be bought and is equipped');
  check(s.hp === 125 && s.reserve > 0, 'medkit heals and ammo crate refills', { hp: s.hp, reserve: s.reserve });
  check(s.spent === 500 + 750 + 500 + 600 + 400 + 1500 + 200 + 250, 'points are deducted correctly', s.spent);
  s = await ev(() => { game.points = 0; game.renderShop(); return { ok: game.buy('vitality'), enabled: [...document.querySelectorAll('#shop-items button')].filter(b => !b.disabled).length }; });
  check(!s.ok && s.enabled === 0, 'cannot buy without points; buttons disabled', s);
  s = await ev(() => { game.points = 5000; game.renderShop(); return [...document.querySelectorAll('#shop-items button')].filter(b => !b.disabled).map(b => b.dataset.id); });
  check(!s.includes('rifle') && !s.includes('heal'), 'owned rifle and full health cannot be re-bought', s);
  await page.click('#shop-items button[data-id="vitality"]');
  s = await ev(() => ({ lvl: game.player.upgrades.vitality, pts: game.points }));
  check(s.lvl === 2 && s.pts === 5000 - 750, 'shop buttons work with real clicks', s);

  // ---------------- next round ----------------
  await page.click('#btn-next');
  s = await ev(() => ({ state: game.state, round: game.round, toSpawn: game.toSpawn, phase: game.phase }));
  check(s.state === 'playing' && s.round === 2 && s.toSpawn > 6, 'next round starts with more zombies', s);
  s = await ev(() => { game.step(3.5); const z = game.zombies[0]; return z ? { hp: z.maxHealth } : null; });
  check(s && s.hp > 55, 'round 2 zombies are tougher', s);
  // full-auto rifle
  s = await ev(() => {
    game.step(0.5); const p = game.player; p.switchTo('rifle'); game.step(0.5); const m0 = p.weapon.mag;
    game.input.mouseDown = true; game.step(0.5); game.input.mouseDown = false; game.step(1 / 60);
    return { name: p.def.name, fired: m0 - p.weapon.mag };
  });
  check(s.fired >= 4, 'rifle fires automatically while held', s);
  s = await ev(() => { game.input.pressed.add('Digit1'); game.step(0.5); return game.player.current; });
  check(s === 'pistol', 'key 1 switches back to pistol', s);

  await ev(() => game.step(4));
  await shot('05-round2');

  // ---------------- death and restart ----------------
  s = await ev(() => {
    const p = game.player; p.health = 5; p.sinceDamage = 0;
    const z = game.zombies[T.spawnAt(p.pos.x + 0.9, p.pos.z)];
    z.speed = 1;
    let t = 0; while (t < 8 && !p.dead) { game.step(0.1); t += 0.1; p.sinceDamage = 0; }
    const dead = p.dead;
    game.step(3);
    return { dead, state: game.state };
  });
  check(s.dead && s.state === 'gameover', 'player dies and the game-over screen appears', s);
  const goVisible = await page.isVisible('#gameover');
  check(goVisible, 'game-over overlay is visible');
  await shot('06-gameover');
  await page.click('#btn-restart');
  await page.waitForTimeout(100);
  s = await ev(() => ({ state: game.state, round: game.round, hp: game.player.health, max: game.player.maxHealth, pts: game.points, z: game.zombies.length, rifle: game.player.weapons.rifle.owned, up: game.player.upgrades.damage, dead: game.player.dead }));
  check(s.state === 'playing' && s.round === 1 && s.hp === 100 && s.max === 100 && s.pts === 0 && s.z === 0 && !s.rifle && s.up === 0 && !s.dead, 'restart resets everything', s);

  // ---------------- natural play: let round 1 run with the real spawner ----------------
  s = await ev(() => {
    const p = game.player; p.health = p.maxHealth = 100000;
    let t = 0, maxAlive = 0;
    while (t < 90 && game.phase !== 'cleared') {
      game.step(0.1); t += 0.1;
      const alive = game.zombies.filter(z => z.alive);
      maxAlive = Math.max(maxAlive, alive.length);
      // auto-kill zombies that reach the player, to exercise the full spawn -> chase -> die loop
      for (const z of alive) if (z.state !== 'rising' && z.pos.distanceTo(p.pos) < 1.6) game.damageZombie(z, 9999, 'body', z.pos.clone().setY(1), new z.pos.constructor(0, 0, 1));
    }
    return { t: +t.toFixed(1), phase: game.phase, kills: game.kills, maxAlive };
  });
  check(s.phase === 'cleared' && s.kills === 6, 'round 1 plays out: 6 zombies spawn, reach the player and die', s);

  check(errors.length === 0, 'no page errors', errors);
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
