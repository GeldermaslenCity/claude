// Automated playthrough of the core loop in headless Chromium.
// Run: NODE_PATH=$(npm root -g) OUT=/tmp node tests/playthrough.cjs
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
  const wait = ms => page.waitForTimeout(ms);
  const log = (...a) => console.log(...a);
  const check = (cond, msg) => { log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

  await page.goto('file://' + process.cwd() + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(800);
  await page.click('#btn-new');
  await wait(800);
  let s = await ev(() => ({ state: game.state, docked: game.docked, credits: game.profile.credits, contracts: game.profile.contracts.length }));
  check(s.state === 'play' && s.docked, 'new game starts docked at station ' + JSON.stringify(s));
  check(s.contracts === 3, 'three contracts generated');
  await shot('01-station');

  // launch & steer
  await page.click('#st-launch');
  await wait(300);
  await page.mouse.move(1200, 700);
  await page.keyboard.down('KeyS'); await page.keyboard.down('KeyD');
  await wait(1500);
  await page.keyboard.up('KeyS'); await page.keyboard.up('KeyD');
  s = await ev(() => ({ docked: game.docked, y: game.sub.y, moved: game.sub.moved, tut: game.profile.tutorial.step, fuel: game.sub.fuel }));
  check(!s.docked && s.moved > 50, 'sub launched and moved ' + JSON.stringify(s));
  await page.keyboard.press('Space');
  await wait(900);
  s = await ev(() => ({ pinged: game.tut.pinged, echoes: game.sonar.echoes.length }));
  check(s.pinged && s.echoes > 0, 'sonar ping produces echoes ' + JSON.stringify(s));
  await page.keyboard.press('KeyF');
  await wait(100);
  check(await ev(() => !game.sub.lightsOn), 'F toggles light off');
  await page.keyboard.press('KeyF');
  await shot('02-launched');

  // teleport next to an iron deposit and mine it with the real laser code
  const dep = await ev(() => {
    const w = game.world;
    const d = w.deposits.find(d => d.type === 'iron' && d.ty > 50 && d.ty < 150);
    const sx = d.x + d.dir[0] * 40, sy = d.y + d.dir[1] * 40;
    game.sub.x = sx; game.sub.y = sy; game.sub.vx = game.sub.vy = 0; game.snapCamera();
    return { x: d.x, y: d.y, id: d.id, amount: d.amount, sx, sy };
  });
  await wait(200);
  // aim mouse at the deposit on screen
  const aimAt = async (wx, wy) => {
    const p = await ev(([wx, wy]) => { const r = game.canvas.getBoundingClientRect(); return { x: r.left + (wx - game.cam.x) / game.vw * r.width, y: r.top + (wy - game.cam.y) / game.vh * r.height }; }, [wx, wy]);
    await page.mouse.move(p.x, p.y);
  };
  await page.mouse.down();
  for (let i = 0; i < 60; i++) { await ev(([x, y]) => { game.sub.x = x; game.sub.y = y; game.sub.vx = game.sub.vy = 0; }, [dep.sx, dep.sy]); await aimAt(dep.x, dep.y); await wait(80); }
  await shot('03-mining');
  await page.mouse.up();
  s = await ev(() => ({ cargo: game.sub.cargo, mined: game.tut.mined, noise: game.sub.noise }));
  check((s.cargo.iron || 0) >= 2, 'laser mined iron into cargo ' + JSON.stringify(s));

  // return to station and dock via E
  await ev(() => { const P = game.world.pois.station; game.sub.x = P.dockX; game.sub.y = P.dockY + 20; game.snapCamera(); });
  await wait(200);
  await page.keyboard.press('KeyE');
  await wait(400);
  s = await ev(() => ({ docked: game.docked, open: !document.getElementById('screen-station').classList.contains('hidden') }));
  check(s.docked && s.open, 'docking opens station ' + JSON.stringify(s));
  const before = await ev(() => game.profile.credits);
  await page.click('.tabs button[data-tab="market"]');
  await page.click('[data-act="sellevery"]');
  const after = await ev(() => game.profile.credits);
  check(after > before, `selling cargo adds credits ${before} -> ${after}`);
  await shot('04-market');

  // money for upgrades; buy a few through the UI
  await ev(() => { game.profile.credits = 5000; UI.renderStation(); });
  await page.click('.tabs button[data-tab="upgrades"]');
  for (const k of ['hull', 'hull', 'laser', 'laser', 'defense', 'sonar', 'cargo']) await page.click(`[data-act="buy"][data-key="${k}"]`);
  s = await ev(() => ({ up: game.profile.upgrades, maxHull: game.sub.stats.maxHull, depth: game.sub.stats.depth, shock: game.sub.stats.shock }));
  check(s.up.hull === 2 && s.up.laser === 2 && s.maxHull === 175 && s.shock > 0, 'upgrades apply stats ' + JSON.stringify(s));
  await shot('05-upgrades');
  // trench hull must be locked
  await ev(() => { game.profile.upgrades.hull = 3; game.sub.applyUpgrades(game.profile.upgrades); UI.renderStation(); });
  check(await ev(() => !game.buyUpgrade('hull')), 'trench hull locked before story');
  // services
  await ev(() => { game.sub.hull = 30; game.sub.fuel = 10; UI.tab = 'services'; UI.renderStation(); });
  await page.click('[data-act="fullservice"]');
  s = await ev(() => ({ hull: game.sub.hull, max: game.sub.stats.maxHull, fuel: game.sub.fuel }));
  check(Math.abs(s.hull - s.max) < 1, 'full service repairs ' + JSON.stringify(s));
  await page.click('.tabs button[data-tab="missions"]');
  await shot('06-missions');

  // ---- story: kestrel log -> black box -> dock ----
  await page.click('#st-launch'); await wait(200);
  const tp = (x, y) => ev(([x, y]) => { game.sub.x = x; game.sub.y = y; game.sub.vx = game.sub.vy = 0; game.snapCamera(); }, [x, y]);
  let it = await ev(() => Missions.interactables(game).find(i => i.id === 'kestrel'));
  await tp(it.x, it.y); await wait(200);
  await shot('07-kestrel');
  await page.keyboard.press('KeyE'); await wait(300);
  s = await ev(() => ({ state: game.state, stage: game.profile.story.stage }));
  check(s.state === 'log' && s.stage === 1, 'reading kestrel log advances story ' + JSON.stringify(s));
  await shot('08-log');
  await page.keyboard.press('KeyE'); await wait(200);
  it = await ev(() => Missions.interactables(game).find(i => i.id === 'blackbox'));
  await tp(it.x, it.y); await wait(200);
  await page.keyboard.press('KeyE'); await wait(200);
  check(await ev(() => game.profile.story.blackBox && game.profile.story.stage === 2), 'black box recovered');
  await ev(() => { const P = game.world.pois.station; game.sub.x = P.dockX; game.sub.y = P.dockY; });
  await wait(100);
  await page.keyboard.press('KeyE'); await wait(300);
  s = await ev(() => ({ stage: game.profile.story.stage, state: game.state }));
  check(s.stage === 3, 'docking with black box plays log and advances ' + JSON.stringify(s));
  await ev(() => game.closeLog());
  await page.click('#st-launch'); await wait(200);

  // vesna lifepod
  it = await ev(() => Missions.interactables(game).find(i => i.id === 'vesna2'));
  await tp(it.x, it.y); await wait(250);
  await shot('09-vesna');
  await page.keyboard.press('KeyE'); await wait(200);
  await page.keyboard.press('KeyE'); await wait(200);
  check(await ev(() => game.profile.story.stage === 4), 'lifepod log -> repair relay stage');

  // relay repair: needs materials, hold E
  it = await ev(() => Missions.interactables(game).find(i => i.id === 'repair'));
  await tp(it.x, it.y); await wait(250);
  await ev(() => { game.sub.cargo.titanium = 4; game.sub.cargo.copper = 3; game.sub.hull = 999; });
  await page.keyboard.down('KeyE'); await wait(6600); await page.keyboard.up('KeyE');
  s = await ev(() => ({ stage: game.profile.story.stage, relay: game.profile.story.relayRepaired, cargo: game.sub.cargo }));
  check(s.relay && s.stage === 5 && s.cargo.copper === 1, 'relay repaired consuming materials ' + JSON.stringify(s));
  await ev(() => game.closeLog());
  await shot('10-relay');
  await ev(() => { const P = game.world.pois.station; game.sub.x = P.dockX; game.sub.y = P.dockY; game.sub.hull = game.sub.stats.maxHull; });
  await page.keyboard.press('KeyE'); await wait(300);
  await ev(() => game.closeLog());
  s = await ev(() => ({ stage: game.profile.story.stage, unlocked: game.profile.story.trenchUnlocked, buy: (game.profile.credits += 3000, game.buyUpgrade('hull')), hull: game.profile.upgrades.hull }));
  check(s.stage === 6 && s.unlocked && s.buy && s.hull === 4, 'trench hull unlocked and purchasable ' + JSON.stringify(s));

  // ---- the Warden: go deep, make noise, confirm it becomes aware ----
  await page.click('#st-launch'); await wait(200);
  const P = await ev(() => game.world.pois.skeleton);
  await tp(P.x, P.y); await ev(() => { game.warden.x = game.sub.x + 600; game.warden.y = game.sub.y; game.warden.segs.forEach(s => { s.x = game.warden.x; s.y = game.warden.y; }); });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await wait(1200); }
  s = await ev(() => ({ aw: game.warden.awareness, st: game.warden.state, active: game.warden.active, creatures: game.creatures.list.map(c => c.type) }));
  check(s.active && s.aw > 30, 'warden hears sonar pings ' + JSON.stringify(s));
  await ev(() => { game.warden.x = game.sub.x + 150; game.warden.y = game.sub.y; game.warden.awareness = 90; game.warden.state = 'hunt'; game.sub.hull = 200; });
  await wait(2500);
  await shot('11-warden');
  s = await ev(() => ({ st: game.warden.state, hull: game.sub.hull }));
  check(s.hull < 200, 'warden strike damages the sub ' + JSON.stringify(s));
  // laser cannot kill it; shock repels
  await ev(() => { game.warden.state = 'hunt'; game.warden.awareness = 90; game.warden.x = game.sub.x + 120; game.warden.y = game.sub.y; game.sub.battery = 100; game.sub.shockCd = 0; });
  await page.keyboard.press('KeyR'); await wait(100);
  check(await ev(() => game.warden.state === 'retreat'), 'shock pulse repels the Warden');
  // flare distracts
  await ev(() => { game.warden.state = 'stalk'; game.warden.awareness = 50; game.warden.x = game.sub.x + 500; game.warden.y = game.sub.y; });
  await page.mouse.click(1500, 540, { button: 'right' }); await wait(200);
  check(await ev(() => game.warden.state === 'distracted' || game.flares.length > 0), 'flare launched / distracts');

  // creatures bite etc. - let the sim run in zone 3 with lights on
  await ev(() => { const r = game.world.pois.relay; game.sub.x = r.x; game.sub.y = r.y; game.sub.hull = 280; game.warden.state = 'retreat'; game.warden.timer = 60; game.snapCamera(); });
  await wait(5000);
  s = await ev(() => ({ n: game.creatures.list.length, types: [...new Set(game.creatures.list.map(c => c.type))] }));
  check(s.n > 0, 'creatures spawn in the Hadal Throat ' + JSON.stringify(s));
  await shot('12-throat');

  // ---- death ----
  await ev(() => { game.sub.cargo = { titanium: 5, resonite: 2 }; game.sub.hull = 0.1; game.sub.damage(5, 'test'); });
  await wait(300);
  s = await ev(() => ({ state: game.state, deaths: game.profile.stats.deaths, cargo: game.sub.cargo }));
  check(s.state === 'gameover' && Object.keys(s.cargo).length === 0, 'destruction -> game over, cargo lost ' + JSON.stringify(s));
  await shot('13-gameover');
  await page.click('#btn-relaunch'); await wait(300);
  check(await ev(() => game.state === 'play' && game.docked), 'relaunch returns to station');

  // ---- save & load ----
  await page.click('#st-launch'); await wait(300);
  await page.keyboard.press('Escape'); await wait(100);
  check(await ev(() => game.state === 'pause'), 'escape pauses');
  await shot('14-pause');
  await page.click('#btn-save');
  const snap = await ev(() => ({ credits: game.profile.credits, stage: game.profile.story.stage, up: JSON.stringify(game.profile.upgrades), x: Math.round(game.sub.x), explored: game.world.explored.reduce((a, b) => a + b, 0) }));
  await page.click('#btn-quit'); await wait(300);
  check(await ev(() => game.state === 'title'), 'quit to title');
  await page.reload(); await wait(800);
  await page.click('#btn-continue'); await wait(800);
  const loaded = await ev(() => ({ credits: game.profile.credits, stage: game.profile.story.stage, up: JSON.stringify(game.profile.upgrades), x: Math.round(game.sub.x), explored: game.world.explored.reduce((a, b) => a + b, 0) }));
  const same = snap.credits === loaded.credits && snap.stage === loaded.stage && snap.up === loaded.up && snap.x === loaded.x && loaded.explored >= snap.explored;
  check(same, 'save/load round-trip ' + JSON.stringify(loaded) + ' vs ' + JSON.stringify(snap));

  // ---- map ----
  await page.keyboard.press('Tab'); await wait(300);
  await shot('15-map');
  await page.keyboard.press('Tab');

  // ---- ending ----
  await ev(() => { const a = game.world.pois.abyss; game.sub.x = a.x; game.sub.y = a.y; });
  await wait(300);
  check(await ev(() => game.state === 'ending'), 'reaching the abyss triggers ending');
  await wait(4000);
  await shot('16-ending');

  // perf sample
  await ev(() => game.closeEnding());
  await ev(() => { const k = game.world.pois.vesna; game.sub.x = k.x; game.sub.y = k.y - 40; game.snapCamera(); });
  await wait(3000);
  log('fps', await ev(() => game.fps.toFixed(1)));
  log('errors:', errors.length ? errors : 'none');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
