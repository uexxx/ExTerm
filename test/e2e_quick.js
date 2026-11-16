const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort());
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test/q_markets.png' });
  await page.keyboard.press('Control+k'); await page.keyboard.type('doge'); await page.waitForTimeout(200);
  console.log('palette:', await page.$$eval('#palList .it', (r) => r.map((x) => x.textContent).join(' | ')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); console.log('sel after palette:', await page.evaluate(() => ST.sel));
  await page.click('nav button[data-tab="lab"]'); await page.click('#labNav button[data-v="news"]'); await page.waitForTimeout(1500);
  console.log('news:', (await page.textContent('#labBody')).replace(/\s+/g, ' ').slice(0, 120));
  await page.click('#labNav button[data-v="forecast"]'); await page.waitForTimeout(2500); await page.screenshot({ path: 'test/q_fc.png' });
  await page.evaluate((s) => typeof V155S === 'undefined' || V155S.reveal(s), '#seCheck'); // v15.5: Settings tabs
  await page.click('nav button[data-tab="set"]'); await page.click('#seCheck'); await page.waitForTimeout(9500); await page.screenshot({ path: 'test/q_set.png' });
  console.log('banner:', (await page.textContent('#banner')).slice(0, 200));
  console.log('ERRORS:', errs.length ? errs : 'none'); await browser.close();
})();
