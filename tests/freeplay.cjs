// Unscripted bot: dives with real controls for a while, pinging, mining whatever it points at,
// and reports vitals / creature activity / errors. Run like playthrough.cjs.
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(600);
  await page.click('#btn-new'); await page.waitForTimeout(400);
  await page.click('#st-launch');
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => ({ state: game.state }));
    if (st.state === 'log') await page.keyboard.press('KeyE');
    if (st.state === 'gameover') { console.log('died at step', i); await page.click('#btn-relaunch'); await page.click('#st-launch'); }
    const k = i % 5 === 0 ? 'KeyS' : keys[Math.floor(Math.random() * 4)];
    await page.mouse.move(960 + Math.random() * 600 - 300, 540 + Math.random() * 400 - 100);
    await page.keyboard.down(k); if (Math.random() < 0.5) await page.keyboard.down('KeyS');
    if (Math.random() < 0.3) await page.mouse.down();
    await page.waitForTimeout(500);
    await page.keyboard.up(k); await page.keyboard.up('KeyS'); await page.mouse.up();
    if (i % 6 === 0) await page.keyboard.press('Space');
    if (i % 30 === 10) await page.screenshot({ path: `${OUT}/free-${i}.png` });
  }
  const s = await page.evaluate(() => ({ depth: game.sub.depthM(), hull: game.sub.hull, o2: game.sub.oxygen, batt: game.sub.battery, fuel: game.sub.fuel, cargo: game.sub.cargo, creatures: game.creatures.list.length, deaths: game.profile.stats.deaths, fps: game.fps, explored: game.world.explored.reduce((a, b) => a + b, 0) }));
  console.log(JSON.stringify(s));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
