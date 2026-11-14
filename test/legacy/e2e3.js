const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|WebSocket|net::/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const log = (...a) => console.log(...a), ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
  const tabs = ['markets', 'heat', 'bots', 'port', 'whales', 'ai', 'lab', 'set'];
  await wait(2500);
  // ---- every tab in both modes ----
  for (const mode of ['crypto', 'stocks']) {
    await page.click(`#modeSwitch button[data-mode="${mode}"]`); await wait(900);
    log(`\n[${mode}] body=${await ev(() => document.body.className)} nav="${await page.textContent('#navTrack')}" sel=${await ev(() => ST.sel)} heat=${await ev(() => ST.heat.asset)}`);
    for (const t of tabs) {
      await page.click(`nav button[data-tab="${t}"]`); await wait(t === 'heat' ? 1800 : 700);
      const txt = (await page.textContent(`#tab-${t}`)).replace(/\s+/g, ' ');
      log(`  ${t.padEnd(8)} ok · ${txt.length} chars · ${txt.slice(0, 90)}`);
      if (['markets', 'heat', 'whales', 'bots'].includes(t)) await page.screenshot({ path: `test/v3_${mode}_${t}.png` });
    }
  }
  // ---- backtester + leaderboard, both markets ----
  for (const [mode, sym, strat, tf] of [['crypto', 'BTC', 'orderblock', '15m'], ['stocks', 'SPY', 'liqsweep', '1d']]) {
    await page.click(`#modeSwitch button[data-mode="${mode}"]`); await page.click('nav button[data-tab="bots"]'); await wait(400);
    await page.selectOption('#suStrat', strat); await wait(200); await page.fill('#suSym', sym); await page.selectOption('#suTf', tf);
    await page.selectOption('#btBars', mode === 'crypto' ? '100000' : 'r:1825'); await wait(150); log(`[${mode}] history estimate:`, await page.textContent('#btEst'));
    await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 30000 }); await wait(300);
    log(`\n[${mode}] backtest ${strat} ${sym} ${tf}:`, (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 170), '| price chart canvas:', await page.$$eval('#btPrice canvas', (c) => c.length), '| worker:', await ev(() => !!BTW.w));
    await page.click('#lbRun'); await page.waitForFunction(() => !lbBusy && lbRows, null, { timeout: 120000 }); await wait(300);
    log(`[${mode}] leaderboard rows:`, await page.$$eval('#lbOut tbody tr', (r) => r.length), '|', (await page.textContent('#lbOut .stats')).replace(/\s+/g, ' '));
    await page.click('#lbOut tbody tr:nth-child(2)'); await page.waitForFunction(() => !btBusy, null, { timeout: 30000 }); await wait(300);
    log(`[${mode}] clicked row 2 -> setup strat:`, await ev(() => ST.setup.strat));
    await page.screenshot({ path: `test/v3_${mode}_backtest.png`, fullPage: false });
    await page.click('#suPack'); await wait(300); log(`[${mode}] starter pack bots shown:`, await page.$$eval('#botList .bot', (b) => b.length));
  }
  // ---- Solana tracker against the mock RPC (real polling / batching / decoding / DexScreener) ----
  await page.click('#modeSwitch button[data-mode="crypto"]'); await page.click('nav button[data-tab="whales"]');
  await ev(() => { Sol.stop(); Sol.trades = []; Sol.ids = new Set(); Sol.tokens = {}; Sol._simToks = null; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; w.recent = []; w.buys = w.sells = 0; }); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; ST.copy.on = true; ST.copy.minSol = 1; Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; });
  await wait(32000);
  const s = await ev(() => ({ st: Sol.st, err: Sol.err, scanned: Sol.scanned(), checks: Sol.stats.checks, tx: Sol.stats.tx, trades: Sol.trades.length, buys: Sol.trades.filter((t) => t.side === 'buy').length, sells: Sol.trades.filter((t) => t.side === 'sell').length, named: Sol.trades.filter((t) => Sol.tokens[t.mint] && Sol.tokens[t.mint].sym).length, dex: [...new Set(Sol.trades.map((t) => t.dex))], hot: Sol.hot(60).length, noBatch: Sol.noBatch, bal: Sol.wallets.filter((w) => w.bal != null).length, copyTrades: COPY.trades.length, copyPos: Object.keys(COPY.pos).length }));
  log('\n[tracker/mock RPC]', JSON.stringify(s));
  log('  feed cards:', await page.$$eval('#trFeed .trow', (r) => r.length), '| first:', (await page.textContent('#trFeed .trow')).replace(/\s+/g, ' ').slice(0, 110));
  log('  hot tokens:', await page.$$eval('#trHot .hotrow', (r) => r.length), '| wallet rows:', await page.$$eval('#wTable .wrow', (r) => r.length));
  await page.screenshot({ path: 'test/v3_tracker_live.png' });
  await page.click('#wTable .wrow'); await wait(500); log('  drawer open:', await ev(() => $('#drawer').classList.contains('on')), '|', (await page.textContent('#dTitle')));
  await page.click('#dBody [data-whist]'); await page.waitForFunction(() => !Object.values(tr.busyHist).some(Boolean), null, { timeout: 30000 });
  await page.click('#dBody [data-whold]'); await page.waitForFunction(() => !Object.values(tr.busyHist).some(Boolean), null, { timeout: 30000 }); await wait(400);
  log('  drawer after history+holdings:', (await page.textContent('#dBody')).replace(/\s+/g, ' ').slice(0, 260));
  await page.screenshot({ path: 'test/v3_drawer.png' });
  await page.keyboard.press('Escape'); await wait(300);
  // ---- SEC insider tracker against mock EDGAR ----
  await page.click('#modeSwitch button[data-mode="stocks"]'); await wait(400);
  await ev(() => { SEC.sim = false; SEC.WWW = SEC.DATA = 'http://localhost:8899'; SEC.trades = []; SEC.ids = new Set(); SEC.scanned = {}; SEC.st = 'idle'; SEC.map = null; });
  await page.click('nav button[data-tab="whales"]'); await wait(300);
  await page.fill('#inTickers', 'AAPL, NVDA, MSFT'); await page.click('#inScan'); await page.waitForFunction(() => SEC.st !== 'scanning', null, { timeout: 30000 });
  await ev(() => SEC.stream()); await wait(1500); await ev(() => { ins.dirty = true; renderInsider(); });
  log('\n[insiders/mock SEC]', JSON.stringify(await ev(() => ({ st: SEC.st, err: SEC.err, n: SEC.trades.length, buys: SEC.trades.filter((t) => t.code === 'P').length, clusters: SEC.clusters(60).filter((x) => x.insiders.size >= 2).map((x) => x.ticker), sample: SEC.trades[0] && [SEC.trades[0].ticker, SEC.trades[0].insider, SEC.trades[0].role, SEC.trades[0].type, SEC.trades[0].value] }))));
  log('  feed rows:', await page.$$eval('#inFeed tbody tr', (r) => r.length), '| clusters:', await page.$$eval('#inClusters .hotrow', (r) => r.length));
  await page.screenshot({ path: 'test/v3_insiders.png' });
  // ---- copilot in both modes ----
  await page.click('nav button[data-tab="ai"]');
  for (const [mode, qs] of [['stocks', ['what are insiders buying?', 'analyze NVDA', 'backtest order block on AAPL 1h']], ['crypto', ['what are my wallets buying?', 'start a liquidity sweep bot on ETH 15m', 'backtest supertrend on BTC 1h']]]) {
    await page.click(`#modeSwitch button[data-mode="${mode}"]`); await wait(300);
    for (const q of qs) { await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); await wait(150); log(` AI[${mode}]>`, q, '=>', (await ev(() => ST.chat[ST.chat.length - 1].text)).replace(/\s+/g, ' ').slice(0, 120)); }
  }
  // ---- portfolio scope & persistence ----
  await ev(() => { ACC.buy('NVDA', px('NVDA') || 190, 1000, Date.now(), { src: 'manual' }); ACC.buy('ETH-USD', px('ETH-USD') || 3300, 1000, Date.now(), { src: 'manual' }); });
  await page.click('nav button[data-tab="port"]'); await wait(300);
  log('\n[portfolio crypto scope] rows:', await page.$$eval('#pfHold tbody tr', (r) => r.length), '|', await page.textContent('#pfScopeNote'));
  await page.click('#modeSwitch button[data-mode="stocks"]'); await wait(300); log('[portfolio stocks scope] rows:', await page.$$eval('#pfHold tbody tr', (r) => r.length));
  await page.click('#pfScope button[data-v="all"]'); await wait(200); log('[portfolio all] rows:', await page.$$eval('#pfHold tbody tr', (r) => r.length));
  await ev(() => saveState()); await page.reload(); await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  log('[after reload]', JSON.stringify(await ev(() => ({ mode: ST.mode, body: document.body.className, wallets: Sol.wallets.length, solTrades: Sol.trades.length, sec: SEC.trades.length, bots: ST.bots.length, pos: Object.keys(ACC.pos) }))));
  log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
