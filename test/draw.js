const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await b.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50 && chart.L && chart.L.hi != null, null, { timeout: 60000 });
  const box = await (await page.$('#chartHost canvas')).boundingBox();
  await page.click('#drawBtns button[data-v="t"]'); await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.25); await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.2);
  await page.click('#drawBtns button[data-v="fib"]'); await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45); await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.15);
  await page.click('#drawBtns button[data-v="h"]'); await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
  console.log('drawings:', await page.evaluate(() => (ST.draw[ST.sel] || []).map((d) => d.type).join(',')), '| persisted:', await page.evaluate(() => JSON.parse(localStorage.getItem(LS_KEY)).draw[ST.sel].length));
  await page.waitForTimeout(300); await page.screenshot({ path: 'test/s2_draw.png' });
  await page.click('nav button[data-tab="whales"]'); await page.evaluate(() => { Sol.stop(); Sol.custom = 'http://localhost:8899'; Sol.start({ sim: false }); });
  await page.waitForTimeout(800); await page.click('#trDiag'); await page.waitForFunction(() => !tr.diagBusy && tr.diag && tr.diag.length, null, { timeout: 20000 });
  console.log('diag:', await page.evaluate(() => tr.diag.map((d) => (d.ok ? '✓ ' : '✕ ') + d.name + ' → ' + String(d.info).slice(0, 40)).join(' | ')));
  await page.screenshot({ path: 'test/s2_diag.png' });
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
