const { chromium } = require('playwright');
(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(async () => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto('file://' + process.cwd() + '/index.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: process.env.OUT + '/title.png' });
console.log('errors:', errors);
await browser.close();
})();
