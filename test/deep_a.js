const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errs = [], res = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
  const ok = (n, c, i = '') => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  // ── markets
  await page.fill('#wlAdd', 'DOGE'); await page.click('#wlAddBtn').catch(() => {}); await sleep(200); ok('watchlist: add symbol', await ev(() => ST.watch.includes('DOGE-USD')));
  await page.click('#watchList [data-s="ETH-USD"], .wl-row[data-s="ETH-USD"]'); await sleep(500); ok('watchlist: click selects symbol', await ev(() => ST.sel === 'ETH-USD'));
  await page.click('#tfBtns button[data-v="1h"]'); await page.waitForFunction(() => chart.tfSec === 3600 && chart.data.length > 50, null, { timeout: 20000 }).catch(() => {}); ok('timeframe switch → 1h candles', await ev(() => ST.tf === '1h' && chart.data.length > 50));
  for (const t of ['ha', 'line', 'area', 'candles']) { await page.click(`#ctBtns button[data-v="${t}"]`); await sleep(120); } ok('chart types switch', await ev(() => ST.ind.type === 'candles'));
  await ev(() => { for (const k of ['ema', 'sma', 'vwap', 'bb', 'kc', 'st', 'ichi', 'psar', 'vol', 'rsi', 'macd', 'stochrsi', 'adx', 'atr', 'obv', 'fc']) ST.ind[k] = true; Object.assign(chart.o, ST.ind); chartRefresh(true); }); await sleep(600);
  ok('all 16 indicators render together', errs.length === 0, errs.slice(0, 1).join(''));
  await ev(() => { for (const k of ['sma', 'vwap', 'bb', 'kc', 'st', 'ichi', 'psar', 'rsi', 'macd', 'stochrsi', 'adx', 'atr', 'obv', 'fc']) ST.ind[k] = false; Object.assign(chart.o, ST.ind); chartRefresh(true); });
  // ── order ticket
  await page.fill('#tkUsd', '2000'); await page.fill('#tkSl', '5'); await page.fill('#tkTp', '10'); await page.click('#tkGo'); await sleep(300);
  ok('market buy with stop-loss & take-profit', await ev(() => ACC.pos['ETH-USD'] && ACC.pos['ETH-USD'].sl > 0 && ACC.pos['ETH-USD'].tp > 0));
  await page.click('#posClose'); await sleep(300); ok('close position from position strip', await ev(() => !ACC.pos['ETH-USD']));
  await page.click('#tkType button[data-t="limit"]'); await page.fill('#tkLimit', String(await ev(() => (px('ETH-USD') * 1.05).toFixed(2)))); await page.fill('#tkUsd', '1000'); await page.fill('#tkSl', ''); await page.fill('#tkTp', ''); await page.click('#tkGo'); await sleep(300);
  const placed = await ev(() => ACC.orders.length + ACC.trades.filter((t) => /limit buy/.test(t.reason || '')).length); /* a marketable limit can fill on the very next tick */ await sleep(4000); ok('limit order placed and filled on the next tick', placed >= 1 && await ev(() => !!ACC.pos['ETH-USD']), `placed ${placed}, open ${await ev(() => ACC.orders.length)}`);
  await page.click('#tkType button[data-t="market"]');
  // ── alerts
  await ev(() => { ST.alerts.push({ id: 'a1', sym: 'ETH-USD', dir: 'above', price: px('ETH-USD') * 0.99, active: true, created: Date.now() }); Feed.subscribe(['ETH-USD']); }); await sleep(4000);
  ok('price alert triggers', await ev(() => ST.alerts.find((a) => a.id === 'a1').active === false));
  // ── heat map
  await page.click('nav button[data-tab="heat"]'); await sleep(1500); await page.waitForSelector('#heatHost .tile', { timeout: 15000 }); const tiles = await ev(() => document.querySelectorAll('#heatHost .tile').length);
  await page.hover('#heatHost .tile'); await sleep(300); ok('heat map draws tiles + hover tooltip', tiles > 10 && await ev(() => document.getElementById('tip').innerHTML.length > 10), tiles + ' tiles');
  // ── bots
  await page.click('nav button[data-tab="bots"]'); await sleep(300); await page.click('#suPack'); await sleep(500); ok('starter pack launches 4 bots', await ev(() => ST.bots.length >= 4));
  const bid = await ev(() => ST.bots[0].id); await page.click(`.bot[data-id="${bid}"] button[data-act="toggle"]`); await sleep(200); ok('pause a bot', await ev((i) => !ST.bots.find((b) => b.id === i).run, bid));
  await page.click(`.bot[data-id="${bid}"] button[data-act="toggle"]`); await sleep(200); ok('resume a bot', await ev((i) => ST.bots.find((b) => b.id === i).run, bid));
  await ev(() => { ST.setup.sym = 'BTC-USD'; renderSetup(); }); await page.selectOption('#suStrat', 'pro_momo'); await page.selectOption('#btBars', '2000').catch(() => {});
  await page.click('#btOpt'); await page.waitForFunction(() => !btBusy, null, { timeout: 90000 }); ok('parameter optimizer completes', /Strategy return/.test(await page.textContent('#btResult')));
  await page.click('#lbRun'); await page.waitForFunction(() => !btBusy && document.querySelector('#lbGrade'), null, { timeout: 120000 });
  const lbRows = await ev(() => document.querySelectorAll('#lbOut tbody tr').length), nStrat = await ev(() => Object.values(NT.strategies).filter((s) => !s.liveOnly).length);
  ok('leaderboard backtests every strategy', lbRows >= nStrat - 1, `${lbRows} rows / ${nStrat} strategies`);
  await page.click('#lbGrade'); await page.waitForFunction(() => document.querySelectorAll('#lbOut .grade').length >= 10, null, { timeout: 240000 }).catch(() => {}); ok('leaderboard grades top 10', await ev(() => document.querySelectorAll('#lbOut .grade').length >= 10));
  // ── portfolio + CSV
  await page.click('nav button[data-tab="port"]'); await sleep(800); ok('portfolio lists trades + bot accounts', await ev(() => pfTrades().length >= 3 && document.querySelectorAll('#pfAccts tr.acc-row').length >= 5));
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#pfCsv'); const d1 = await dl; ok('portfolio CSV export downloads', !!d1, d1 ? d1.suggestedFilename() : '');
  await page.click('#pfSide button[data-v="buy"]'); await sleep(200); ok('journal filter: buys only', await ev(() => [...document.querySelectorAll('#pfTrades td:nth-child(4)')].every((t) => /buy/.test(t.textContent))));
  // ── palette, themes, mode switch
  await page.keyboard.press('Control+k'); await sleep(200); await page.fill('#palIn', 'heat'); await sleep(200); await page.keyboard.press('Enter'); await sleep(400); ok('⌘K palette navigates', await ev(() => curTab === 'heat'));
  await page.click('#btnMore'); await page.click('#btnTheme'); await page.waitForSelector('#thPop'); await page.click('#thPop [data-theme-pick="cyber"]'); await page.waitForTimeout(300);
  ok('theme picker switches theme (v12)', await ev(() => document.body.dataset.theme === 'cyber' && ST.theme === 'cyber'));
  await page.click('#btnMore'); await page.click('#btnTheme'); await page.click('#thPop [data-theme-pick="nova"]'); await page.waitForTimeout(300);
  ok('themes switch back to the default', await ev(() => document.body.dataset.theme === 'nova'));
  await page.click('#modeSwitch button[data-mode="stocks"]').catch(() => ev(() => setMode('stocks'))); await sleep(600); ok('mode switch → stocks', await ev(() => ST.mode === 'stocks'));
  await ev(() => setMode('crypto')); await sleep(400);
  // ── backup export/import
  await page.click('nav button[data-tab="set"]'); await sleep(300); const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#seExp'); const d2 = await dl2; ok('settings: export backup downloads', !!d2);
  await page.fill('#seFee', '0.2'); await page.click('#seSave'); await sleep(200); ok('settings: fee saves', await ev(() => ST.settings.fee === 0.2));
  await page.click('#seCheck'); await page.waitForFunction(() => document.getElementById('seCheckOut').textContent.length > 30, null, { timeout: 15000 }).catch(() => {}); ok('connection check reports', await ev(() => document.getElementById('seCheckOut').textContent.length > 30));
  // ── AI copilot
  await page.click('nav button[data-tab="ai"]');
  const ask = async (q) => { await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 60000 }); await sleep(150); return ev(() => ST.chat[ST.chat.length - 1].text); };
  ok('copilot: backtest command', /Backtest|return/i.test(await ask('backtest connors rsi 2 on ETH 4h')));
  await ask('buy $300 of SOL'); ok('copilot: paper buy executes', await ev(() => !!ACC.pos['SOL-USD']));
  ok('copilot: bots status', /bot/i.test(await ask('how are my bots doing?')));
  await ask('alert me when BTC drops below 50000'); ok('copilot: creates alert', await ev(() => ST.alerts.some((a) => a.sym === 'BTC-USD' && a.dir === 'below')));
  ok('copilot: portfolio summary', /equity|Paper/i.test(await ask('show my portfolio')));
  ok('no page errors (part A)', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length + ' passed'); await browser.close();
})();
