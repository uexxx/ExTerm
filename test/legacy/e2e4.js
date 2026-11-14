const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a); const sleep = (ms) => page.waitForTimeout(ms);
  // graphics: ticker, chart types, overlays, themes
  await sleep(3500);
  console.log('ticker items:', await ev(() => document.querySelectorAll('#tickerTrack .ti').length), '| sparklines:', await ev(() => document.querySelectorAll('.wl-row .spk').length));
  for (const t of ['ha', 'line', 'area', 'candles']) { await page.click(`#ctBtns button[data-v="${t}"]`).catch(async () => { await ev((t) => { ST.ind.type = t; chartRefresh(true); }, t); }); await sleep(150); }
  await ev(() => { Object.assign(ST.ind, { vwap: true, st: true, kc: true, ichi: true, psar: true, stochrsi: true, adx: true, atr: false, obv: false, rsi: false, macd: false }); chartRefresh(true); }); await sleep(400);
  await page.screenshot({ path: 'test/v4_chart_overlays.png' });
  await ev(() => { Object.assign(ST.ind, { ichi: false, psar: false, kc: false, stochrsi: false, adx: false }); ST.ind.type = 'ha'; chartRefresh(true); });
  for (let i = 0; i < 4; i++) { await page.click('#btnTheme'); await sleep(200); if (i === 0) await page.screenshot({ path: 'test/v4_theme_aurora.png' }); }
  console.log('theme back to:', await ev(() => document.body.dataset.theme));
  await page.click('#modeSwitch button[data-mode="stocks"]').catch(() => ev(() => setMode('stocks'))); await sleep(2500);
  console.log('stocks ticker items:', await ev(() => document.querySelectorAll('#tickerTrack .ti').length)); await page.screenshot({ path: 'test/v4_stocks.png' });
  await ev(() => setMode('crypto')); await sleep(800);
  // backtest: enhancers + validation
  await page.click('nav button[data-tab="bots"]'); await page.fill('#suSym', 'BTC'); await page.selectOption('#suTf', '1h'); await page.dispatchEvent('#suTf', 'change');
  await page.selectOption('#suStrat', 'supertrend'); await sleep(150); await page.selectOption('#btBars', '5000').catch(() => {});
  const enhOpen = await ev(() => { const d = document.querySelector('details.enh'); if (d) d.open = true; return !!d; }); console.log('enhancers panel:', enhOpen);
  const pro = await page.$('details.enh [data-enhp="pro"], details.enh button:has-text("pro")'); if (pro) await pro.click();
  await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 90000 });
  console.log('bt result:', (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 220));
  await page.click('#btVal2'); await page.waitForFunction(() => document.querySelector('#btVal .gradebig'), null, { timeout: 180000 }); await sleep(800);
  console.log('validation:', (await page.textContent('#btVal .valhead')).replace(/\s+/g, ' ').slice(0, 200));
  console.log('checks:', await ev(() => [...document.querySelectorAll('#btVal table.checks tr')].slice(1).map((r) => r.children[0].textContent.trim().slice(0, 2) + r.children[1].textContent.trim().slice(0, 22)).join(' | ')));
  await ev(() => document.querySelector('#btVal').scrollIntoView()); await page.screenshot({ path: 'test/v4_validation.png' });
  await ev(() => document.querySelector('#btVal').scrollIntoView({ block: 'end' })); await page.screenshot({ path: 'test/v4_validation2.png' });
  // leaderboard + grading
  const lb = await page.$('#btAll, #lbRun, button:has-text("Leaderboard")'); if (lb) { await lb.click(); await page.waitForFunction(() => !btBusy, null, { timeout: 120000 }); await sleep(400); const g = await page.$('#lbGrade'); if (g) { await g.click(); await page.waitForFunction(() => [...document.querySelectorAll('.grade')].length >= 5, null, { timeout: 300000 }).catch(() => {}); } console.log('leaderboard grades:', await ev(() => [...document.querySelectorAll('.grade')].map((x) => x.textContent).join(' '))); await page.screenshot({ path: 'test/v4_leaderboard.png' }); }
  // wallets: mock RPC, discover, score
  await page.click('nav button[data-tab="whales"]'); await sleep(500);
  await ev(() => { Sol.stop(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.solPx = 200; Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(6000);
  console.log('wallet statuses:', await ev(() => { const m = {}; document.querySelectorAll('#wTable .wst, #wTable [class*=st-]').forEach((e) => { const k = e.textContent.trim().slice(0, 14); m[k] = (m[k] || 0) + 1; }); return JSON.stringify(m); }));
  await page.click('#wDiscover'); await sleep(1500);
  console.log('discover rows:', await ev(() => document.querySelectorAll('#drawer tr, #drawer .disc-row').length), '|', (await page.textContent('#drawer')).replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: 'test/v4_discover.png' });
  const n0 = await ev(() => Sol.wallets.length); const addAll = await page.$('#drawer button:has-text("Add all")'); if (addAll) { await addAll.click(); await sleep(500); } console.log('wallets', n0, '→', await ev(() => Sol.wallets.length));
  await ev(() => closeDrawer()); await page.click('#wScore'); await sleep(4000);
  console.log('rank drawer:', (await page.textContent('#drawer')).replace(/\s+/g, ' ').slice(0, 220)); await page.screenshot({ path: 'test/v4_rank.png' });
  await ev(() => closeDrawer()); await sleep(300); await page.screenshot({ path: 'test/v4_tracker.png' });
  // AI + lab quick smoke
  await page.click('nav button[data-tab="ai"]'); await page.fill('#chatIn', 'backtest ichimoku on ETH 4h'); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 60000 });
  console.log('AI>', (await ev(() => ST.chat[ST.chat.length - 1].text)).replace(/\s+/g, ' ').slice(0, 120));
  for (const t of ['heat', 'port', 'lab', 'set', 'markets']) { await page.click(`nav button[data-tab="${t}"]`); await sleep(500); }
  await page.screenshot({ path: 'test/v4_markets.png' });
  console.log('ERRORS:', errs.length ? errs.slice(0, 10) : 'none'); await browser.close();
})();
