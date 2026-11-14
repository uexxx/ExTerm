const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const ev = (f) => page.evaluate(f);
  await page.click('nav button[data-tab="bots"]'); await page.fill('#suSym', 'BTC'); await page.selectOption('#suTf', '15m'); await page.dispatchEvent('#suTf', 'change');
  await page.selectOption('#btBars', '100000'); await page.waitForTimeout(200); console.log('estimate BTC 15m 100k:', await page.textContent('#btEst'));
  await page.selectOption('#btBars', 'r:3650'); await page.waitForTimeout(200); console.log('estimate BTC 15m 10y:', await page.textContent('#btEst'));
  await page.selectOption('#suStrat', 'supertrend'); await page.waitForTimeout(150); await page.selectOption('#btBars', '50000'); await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 60000 });
  console.log('supertrend 50k:', (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 140));
  await page.screenshot({ path: 'test/v3_backtest_50k.png' });
  await page.click('nav button[data-tab="ai"]');
  for (const q of ['backtest order block on BTC 1h', 'start a liquidity sweep bot on ETH 15m', 'backtest stochastic rsi on SOL 4h', 'backtest bollinger breakout on ETH 1h']) { await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); await page.waitForTimeout(100); console.log(' AI>', q, '=>', (await ev(() => ST.chat[ST.chat.length - 1].text)).replace(/\s+/g, ' ').slice(0, 95)); }
  console.log('ERRORS:', errs.length ? errs : 'none'); await browser.close();
})();
