const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|WebSocket|net::/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort());
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const log = (...a) => console.log(...a), ev = (f) => page.evaluate(f);
  log('crypto:', await ev(() => Providers.active.id), '| stocks:', await ev(() => Stocks.active.id), '| wallets:', await ev(() => Sol.wallets.length), '| sol:', await ev(() => Sol.st));
  await page.waitForTimeout(2500);
  // stocks tab
  await page.click('nav button[data-tab="stocks"]'); await page.waitForTimeout(2500);
  log('stocks mode:', await ev(() => [ST.mode, ST.sel, getStore(ST.sel, ST.tf).candles.length, px(ST.sel) && px(ST.sel).toFixed(2), $('#qChg').textContent, $('#mkMode').textContent]));
  await page.fill('#symInput', 'nvidia'); await page.press('#symInput', 'Enter'); await page.waitForTimeout(1200);
  await page.fill('#tkUsd', '3000'); await page.click('#tkGo'); await page.waitForTimeout(300);
  log('stock buy:', await ev(() => JSON.stringify(Object.keys(ACC.pos)) + ' cash ' + ACC.cash.toFixed(0)), '| book:', (await page.textContent('#book')).replace(/\s+/g, ' ').slice(0, 80));
  await page.screenshot({ path: 'test/v2_stocks.png' });
  // back to crypto keeps separate watchlist
  await page.click('nav button[data-tab="crypto"]'); await page.waitForTimeout(800);
  log('crypto mode:', await ev(() => [ST.mode, ST.sel, ST.watch.slice(0, 3).join(',')]));
  // heat map stocks
  await page.click('nav button[data-tab="heat"]'); await page.click('#heatAsset button[data-v="stocks"]'); await page.waitForTimeout(2000);
  log('stock heat tiles:', await page.$$eval('.tile', (t) => t.length), '| sectors:', await page.$$eval('.seclab', (t) => t.length), '|', (await page.textContent('#heatStats')).replace(/\s+/g, ' ').slice(0, 120));
  await page.screenshot({ path: 'test/v2_heat_stocks.png' });
  await page.click('.tile[data-sym="AAPL"]'); await page.waitForTimeout(800); log('heat click ->', await ev(() => [curTab, ST.mode, ST.sel]));
  // tracker
  await page.click('nav button[data-tab="whales"]'); await page.waitForTimeout(9000);
  log('tracker:', await ev(() => [Sol.st, Sol.trades.length, Sol.hot(60).length]), '| feed rows:', await page.$$eval('#trFeed tbody tr', (r) => r.length), '| wallet rows:', await page.$$eval('#wTable > table > tbody > tr', (r) => r.length));
  await page.click('#cpOn'); await page.waitForTimeout(12000);
  log('copy-bot:', await ev(() => [ST.copy.on, COPY.trades.length, Object.keys(COPY.pos).length, copyEquity().toFixed(2)]));
  await page.screenshot({ path: 'test/v2_tracker.png' });
  await page.evaluate(() => document.querySelector('#wTable').scrollIntoView()); await page.screenshot({ path: 'test/v2_wallets.png' });
  // wallet search, alert toggle, rename, expand
  await page.fill('#wQ', 'whale'); await page.waitForTimeout(300); log('search whale rows:', await page.$$eval('#wTable > table > tbody > tr', (r) => r.length));
  const first = await page.$('#wTable [data-walert]'); const a0 = await ev(() => Sol.wallets.filter((w) => w.alerts).length); await first.click(); log('alerts toggled:', a0, '->', await ev(() => Sol.wallets.filter((w) => w.alerts).length));
  await page.click('#wTable [data-wren]'); await page.keyboard.press('Control+a'); await page.keyboard.type('Renamed Whale'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  log('renamed:', await ev(() => Sol.wallets.some((w) => w.name === 'Renamed Whale')));
  await page.fill('#wQ', '');
  // import / export
  await page.click('#wImpBtn'); await page.fill('#wImpText', JSON.stringify([{ trackedWalletAddress: 'ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1', name: 'solghost', emoji: '👻', alertsOn: true }, { trackedWalletAddress: 'GgYB9bYJKLtTYvYzAdD1cWaVmVvcz3sJiqcP7TnN5uRj', name: 'New guy', emoji: '🆕', alertsOn: false }]));
  await page.click('#wImpGo'); await page.waitForTimeout(300); log('after import:', await ev(() => Sol.wallets.length));
  // AI
  await page.click('nav button[data-tab="ai"]');
  for (const q of ['what are my wallets buying?', 'analyze NVDA', 'buy $1000 of apple', 'backtest rsi on SPY 1h', 'price of tsla', 'start an ema bot on QQQ 1h']) {
    await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); await page.waitForTimeout(150);
    log(' AI>', q, '=>', (await ev(() => ST.chat[ST.chat.length - 1].text)).replace(/\s+/g, ' ').slice(0, 140));
  }
  // lab screener in stocks mode
  await page.click('nav button[data-tab="stocks"]'); await page.click('nav button[data-tab="lab"]'); await page.click('#scrRun'); await page.waitForFunction(() => !scr.busy, null, { timeout: 40000 });
  log('stock screener rows:', await page.$$eval('#labBody tbody tr', (r) => r.length));
  await page.click('nav button[data-tab="port"]'); await page.waitForTimeout(400); log('portfolio:', (await page.textContent('#pfStats')).replace(/\s+/g, ' ').slice(-110));
  // palette wallet search
  await page.keyboard.press('Control+k'); await page.keyboard.type('catz'); await page.waitForTimeout(200); log('palette:', await page.$$eval('#palList .it', (r) => r.map((x) => x.textContent).slice(0, 4).join(' | ')));
  await page.keyboard.press('Escape');
  // persistence
  await ev(() => saveState()); await page.reload(); await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  log('after reload:', await ev(() => [ST.mode, Sol.wallets.length, Sol.wallets.some((w) => w.name === 'Renamed Whale'), ST.copy.on, COPY.trades.length, Object.keys(ACC.pos).join(',')]));
  log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
