const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a); const sleep = (ms) => page.waitForTimeout(ms);
  await page.click('nav button[data-tab="bots"]'); await page.fill('#suSym', 'ETH'); await page.selectOption('#suTf', '1h'); await page.dispatchEvent('#suTf', 'change'); await page.selectOption('#btBars', '5000').catch(() => {});
  await page.click('#lbRun'); await page.waitForFunction(() => !btBusy && document.querySelector('#lbGrade'), null, { timeout: 120000 });
  await page.click('#lbGrade'); await page.waitForFunction(() => document.querySelectorAll('#lbOut .grade').length >= 10, null, { timeout: 300000 }).catch(() => {});
  console.log('leaderboard grades:', await ev(() => [...document.querySelectorAll('#lbOut .grade')].map((x) => x.textContent).join(' ')), '|', await page.textContent('#lbGradeNote'));
  await ev(() => document.querySelector('#btAll').scrollIntoView()); await page.screenshot({ path: 'test/v4_leaderboard.png' });
  await page.click('nav button[data-tab="whales"]');
  await ev(() => { Sol.stop(); Sol.trades = []; Sol.ids = new Set(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; w.recent = []; w.buys = w.sells = 0; }); Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(15000);
  console.log('poll status:', (await page.textContent('#trStats')).replace(/\s+/g, ' ').slice(0, 260));
  console.log('wallet subs:', await ev(() => { const m = {}; document.querySelectorAll('#wList .sub, .wrow .sub').forEach((e) => { const k = e.textContent.replace(/[\d.,]+/g, '#').slice(0, 26); m[k] = (m[k] || 0) + 1; }); return JSON.stringify(m).slice(0, 400); }));
  console.log('trades:', await ev(() => Sol.trades.length));
  await page.click('#wScore'); await sleep(300); const sa = await page.$('#drawer button:has-text("Score all")'); if (sa) { await sa.click(); await sleep(12000); }
  console.log('rank:', (await page.textContent('#drawer')).replace(/\s+/g, ' ').slice(0, 300)); await page.screenshot({ path: 'test/v4_rank.png' });
  await ev(() => closeDrawer()); await sleep(400); await page.screenshot({ path: 'test/v4_tracker.png' });
  console.log('ERRORS:', errs.length ? errs.slice(0, 10) : 'none'); await browser.close();
})();
