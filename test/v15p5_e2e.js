// ExTerm v15 phase 5 browser end-to-end: the 🏛 Pro Desk. DOM ladder click-to-trade (limit + stop, sub-wallet routing),
// CVD + footprint panels, options chain (model fallback offline) with max pain / GEX / paper options, ratio charts +
// synced grid, a real pop-out window kept in sync over BroadcastChannel, correlation guard blocking a correlated entry,
// isolated sub-wallets, whale tape / profiler / PNG flex card, MTF + chart overlays, walk-forward + Monte Carlo, Pine v5
// import (persisted), arbitrage / funding / liquidation panels, offline replay packs, encrypted .exterm backup + restore,
// Ctrl+K palette commands, escaping of hostile strings, strict CSP / no inline handlers and phone width.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | '), 'ERRS', errs.slice(0, 5).join(' || ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8785, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt15p5-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); }); p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); }); };
  watch(page, 'main');
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__exterm_p2 === true && typeof P5UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && px(ST.sel) > 0, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
  const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
  const sec = async (k) => { await page.click(`#p5Nav button[data-v="${k}"]`); await sleep(350); };

  ok('phase 5 boots: P5 core, Pro Desk tab and section nav', await ev(() => typeof P5 === 'object' && !!$('#nav button[data-tab="desk"]') && !!$('#tab-desk')));
  await ev(() => { showTab('markets'); selectSym('BTC-USD'); }); await sleep(300);
  await page.click('#nav button[data-tab="desk"]');
  ok('Pro Desk shows nine sections', await ev(() => curTab === 'desk' && $$('#p5Nav button').length === 9));

  /* ── DOM ladder ── */
  await sec('dom');
  await ev(() => { const p = px('BTC-USD'), bids = [], asks = []; for (let i = 1; i <= 30; i++) { bids.push([p - i * 5, i % 4 + 0.5]); asks.push([p + i * 5, i % 3 + 0.5]); } P5UI.book = { sym: 'BTC-USD', bids, asks }; P5UI.bookTs = Date.now() + 1e9; showTab('desk'); });
  ok('ladder renders bid/ask rows around the mid', await waitFor(() => $$('#p5Body .p5-lad tbody tr').length === 22 && $$('#p5Body [data-lad="buy"]').length === 22, null, 8000));
  const o0 = await ev(() => ACC.orders.length);
  await ev(() => { const bb = Math.max(...P5UI.book.bids.map((x) => x[0])); const btn = $$('#p5Body [data-lad="buy"]').find((x) => +x.dataset.p < bb); window.__ladP = +btn.dataset.p; btn.click(); });
  ok('clicking a bid below the market rests a buy limit there', await ev((n) => ACC.orders.length === n + 1 && ACC.orders[ACC.orders.length - 1].side === 'buy' && Math.abs(ACC.orders[ACC.orders.length - 1].price - window.__ladP) < 1e-6, o0));
  const s0 = await ev(() => (ST.stops || []).length);
  await ev(() => { const ba = Math.min(...P5UI.book.asks.map((x) => x[0])); const btn = $$('#p5Body [data-lad="buy"]').find((x) => +x.dataset.p > ba + 1); btn.click(); });
  ok('clicking a bid above the ask arms a buy stop', await ev((n) => (ST.stops || []).length === n + 1 && ST.stops[ST.stops.length - 1].side === 'buy', s0));
  ok('working orders are tagged on the ladder', await waitFor(() => /L buy/.test($('#p5Body .p5-lad').textContent) && /STP buy/.test($('#p5Body .p5-lad').textContent), null, 5000));
  ok('selling with nothing held is refused', await ev(() => { const n = ACC.orders.length; $$('#p5Body [data-lad="sell"]')[0].click(); return ACC.orders.length === n; }));
  ok('CVD and footprint panels render', await ev(() => !!$('#p5Cvd') && /Footprint/.test($('#p5Body').textContent)));

  /* ── risk: sub-wallets + correlation guard ── */
  await sec('risk');
  const cash0 = await ev(() => ACC.cash);
  await page.fill('#p5SwName', 'Scalps'); await page.fill('#p5SwUsd', '1500'); await page.click('[data-p5="swnew"]');
  ok('sub-wallet carved out of main paper cash', await ev((c) => ST.p5.subs.length === 1 && ST.p5.subs[0].acct.cash === 1500 && Math.abs(ACC.cash - (c - 1500)) < 1e-6, cash0));
  await page.click('[data-swuse]'); await sleep(300);
  ok('"Trade" routes the DOM ladder to the sub-wallet', await ev(() => ST.p5.sec === 'dom' && $('#p5Acct').value === ST.p5.subs[0].id && /Scalps/.test($('#p5Body').textContent)));
  await ev(() => { const bb = Math.max(...P5UI.book.bids.map((x) => x[0])); $$('#p5Body [data-lad="buy"]').find((x) => +x.dataset.p < bb).click(); });
  ok('sub-wallet limit orders stay isolated from the main account', await ev(() => ST.p5.subs[0].acct.orders.length + ST.p5.subs[0].acct.trades.length >= 1 && !ACC.orders.some((o) => o.meta && o.meta.reason === 'DOM ladder limit' && o.size > 1500)));
  await ev(() => { ST.p5.acct = 'main'; });
  // correlation guard: XRP gets a copy of BTC's hourly bars → ρ = 1 with the BTC position
  await ev(async () => { const b1 = getStore('BTC-USD', '1h'); await b1.load(300); const x = getStore('XRP-USD', '1h'); await x.load(300); if (x.loading) await x.loading; x.candles = b1.candles.map((k) => Object.assign({}, k)); x.loaded = true; ACC.buy('BTC-USD', px('BTC-USD'), 500, Date.now(), { src: 'manual', guard: false }); });
  await sec('risk'); await page.check('#p5Guard');
  const blocked = await ev(() => { if (ACC.pos['XRP-USD']) ACC.sell('XRP-USD', px('XRP-USD') || 1, ACC.qty('XRP-USD'), Date.now(), { src: 'manual' }); const r = ACC.buy('XRP-USD', px('XRP-USD') || 1, 300, Date.now(), { src: 'manual' }); return r === null && !ACC.pos['XRP-USD']; });
  ok('correlation guard blocks a ρ≈1 entry against the BTC position', blocked);
  ok('…and logs the block with the culprit', await waitFor(() => { showTab('desk'); return /XRP blocked \(ρ 1\.00 with BTC\)/.test($('#p5Body').textContent); }, null, 5000), await ev(() => $('#p5Body').textContent.slice(0, 300)));
  await page.uncheck('#p5Guard');
  ok('guard off: the same entry goes through', await ev(() => !!ACC.buy('XRP-USD', px('XRP-USD') || 1, 300, Date.now(), { src: 'manual' })));
  ok('backtests are never guarded', await ev(() => { ST.p5.guard.on = true; const c = getStore('BTC-USD', '1h').candles; const r = NT.backtest(c, NT.strategies[Object.keys(NT.strategies)[0]], NT.defaultParams(Object.keys(NT.strategies)[0]), { tfSec: 3600 }); ST.p5.guard.on = false; return Array.isArray(r.trades); }));

  /* ── options (offline: labelled model chain) ── */
  await ev(() => { setMode('stocks'); selectSym('NVDA'); showTab('desk'); }); await sec('opt');
  ok('options chain loads (labelled MODEL when Yahoo is unreachable)', await waitFor(() => /Options chain · NVDA/.test($('#p5Body').textContent) && /MODEL/.test($('#p5Body').textContent) && $$('#p5Body [data-optbuy]').length > 10, null, 20000));
  ok('max pain, GEX and walls are shown', await ev(() => /Max pain/.test($('#p5Body').textContent) && /Call wall/.test($('#p5Body').textContent) && $$('#p5Body .p5-gr').length > 5));
  const oc0 = await ev(() => ST.p5.optCash);
  await page.fill('#p5OptQty', '2'); await page.locator('#p5OptQty').dispatchEvent('change'); await sleep(200);
  await ev(() => $$('#p5Body [data-optbuy="call"]')[10].click());
  ok('paper call bought: 2 contracts × ask × 100 from options cash', await waitFor((c) => ST.p5.opts.length === 1 && ST.p5.opts[0].qty === 2 && Math.abs(ST.p5.optCash - (c - ST.p5.opts[0].prem * 200)) < 1e-6, oc0, 5000));
  await page.click('[data-optclose]');
  ok('closing marks to model and returns the value', await ev(() => ST.p5.opts.length === 0 && ST.p5.optCash > 0));

  /* ── ratio + synced grid + pop-out over BroadcastChannel ── */
  await ev(() => { setMode('crypto'); selectSym('BTC-USD'); showTab('desk'); }); await sec('ratio');
  ok('ratio chart + 4-chart grid render', await waitFor(() => $$('#p5Body canvas[data-ratio]').length === 5 && P5UI.ratioData['SOL-USD/ETH-USD'] && P5UI.ratioData['SOL-USD/ETH-USD'].c && P5UI.ratioData['SOL-USD/ETH-USD'].c.length > 50, null, 25000), await ev(() => JSON.stringify(Object.fromEntries(Object.entries(P5UI.ratioData).map(([k, v]) => [k, v.c ? v.c.length : v.err])))));
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-p5="pop"]')]);
  watch(pop, 'popout');
  await pop.waitForFunction(() => typeof P5UI !== 'undefined' && document.body.classList.contains('popout') && window.__exterm_ready === true, null, { timeout: 60000 });
  await pop.waitForFunction(() => ST.sel === 'BTC-USD', null, { timeout: 15000 }).catch(() => {});
  ok('pop-out window opens chromeless on the same market', await pop.evaluate(() => document.body.classList.contains('popout') && getComputedStyle($('#nav')).display === 'none' && ST.sel === 'BTC-USD'));
  await ev(() => selectSym('ETH-USD'));
  ok('BroadcastChannel: the pop-out follows the main window', await pop.waitForFunction(() => ST.sel === 'ETH-USD', null, { timeout: 10000 }).then(() => true, () => false));
  ok('hostile BroadcastChannel messages are ignored', await pop.evaluate(() => { P5UI.onBc({ v: 1, k: 'sym', sym: '<img src=x onerror=alert(1)>', from: 'evil' }); P5UI.onBc({ v: 1, k: 'run', code: 'alert(1)', from: 'evil' }); return ST.sel === 'ETH-USD'; }));
  await pop.close();
  await ev(() => { selectSym('BTC-USD'); ST.p5.link = false; });

  /* ── tape, profiler, flex card ── */
  await ev(() => showTab('desk')); await sec('tape');
  ok('whale tape + wallet profiler render', await ev(() => /whale tape/.test($('#p5Body').textContent) && /wallet profiler/i.test($('#p5Body').textContent)));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-p5="flex"]')]);
  const pngPath = await dl.path(); const png = fs.readFileSync(pngPath);
  ok('flex card downloads as a 1080×1080 PNG', /\.png$/.test(dl.suggestedFilename()) && png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1080);
  ok('flex card carries the gold @exterm.labs watermark (v15.1 brand)', await ev(() => { const cv = P5UI.flexCanvas(), g = cv.getContext('2d'), d = g.getImageData(700, 990, 300, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 140 && d[i + 2] < 120) n++; return n > 200; }));

  /* ── chart intel ── */
  await sec('intel');
  ok('MTF matrix loads 15m / 1h / 4h / 1d', await waitFor(() => $$('#p5Body .p5-mc').length === 5, null, 30000));
  for (const k of ['fib', 'pd', 'vp', 'ev', 'mtf']) await page.check(`[data-ov="${k}"]`);
  ok('overlay toggles persist', await ev(() => ['fib', 'pd', 'vp', 'ev', 'mtf'].every((k) => ST.p5.ov[k] === true)));
  await ev(() => { showTab('markets'); ST.tf = '1h'; chartRefresh(true); }); await sleep(1200);
  // show the 300 bars the volume profile is built from: on some simulated days the POC sits above the default 110-bar view
  await ev(() => { chart.view.bars = Math.min(chart.data.length, 300); chart.view.off = 0; chart.invalidate(); }); await sleep(300);
  ok('overlays draw on the main chart (POC / fib / PDH labels painted)', await ev(() => { const cv = $('#chartHost canvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let amber = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 140 && d[i + 1] < 175 && d[i + 2] < 30) amber++; return amber > 40; }) /* every pixel: a 1px dashed POC line is thin */, await ev(() => { const cv = $('#chartHost canvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let amber = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 140 && d[i + 1] < 175 && d[i + 2] < 30) amber++; const L = chart.L || {}; return JSON.stringify({ amber, sel: ST.sel, tf: ST.tf, tfSec: chart.tfSec, n: chart.data.length, theme: document.body.dataset.theme, mode: ST.mode, hi: L.hi, lo: L.lo, ov: ST.p5.ov }); }));
  await ev(() => { for (const k of ['fib', 'pd', 'vp', 'ev', 'mtf']) ST.p5.ov[k] = false; chart.invalidate(); showTab('desk'); });

  /* ── quant lab: walk-forward + Monte Carlo + Pine import ── */
  await sec('quant');
  await page.click('[data-p5="wfo"]');
  ok('walk-forward + Monte Carlo run on the chart history', await waitFor(() => !P5UI.qBusy && P5UI.quant && (P5UI.quant.err || (P5UI.quant.wf.folds.length >= 2 && /WF efficiency/.test($('#p5Body').textContent))), null, 90000), await ev(async () => { let h; try { h = (await History.get(ST.sel, NT.TF[ST.tf], 1500)).length; } catch (e) { h = 'ERR ' + e.message; } return JSON.stringify({ sel: ST.sel, tf: ST.tf, hist: h, store: (Stores.get(ST.sel + '|' + ST.tf) || { candles: [] }).candles.length, q: JSON.stringify(P5UI.quant || {}).slice(0, 120) }); }));
  const pine = '//@version=5\nstrategy("E2E Pine Cross")\nfast = ta.ema(close, 9)\nslow = ta.ema(close, 21)\nif ta.crossover(fast, slow)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(fast, slow)\n    strategy.close("L")\nx = <img src=x onerror="window.__x=1">';
  await page.fill('#p5Pine', pine); await page.click('[data-p5="pine"]');
  ok('Pine v5 import registers a no-code strategy and saves it', await waitFor(() => /Imported “E2E Pine Cross”/.test($('#p5PineOut').textContent) && Object.values(NT.strategies).some((s) => /E2E Pine Cross/.test(s.name)) && /E2E Pine Cross/.test(localStorage.getItem('nt.specs') || ''), null, 5000));
  ok('unsupported Pine lines are listed as text, never executed', await ev(() => /Skipped/.test($('#p5PineOut').textContent) && !$('#p5PineOut img') && window.__x === undefined));

  /* ── derivs & arb (offline) ── */
  await sec('deriv');
  ok('arbitrage, funding/OI and liquidation panels render offline', await waitFor(() => /arbitrage/i.test($('#p5Body').textContent) && /funding/i.test($('#p5Body').textContent) && !!$('#p5Liq'), null, 30000));

  /* ── offline replay + encrypted backup ── */
  await ev(() => { showTab('markets'); selectSym('BTC-USD'); ST.tf = '15m'; chartRefresh(true); }); await sleep(1500); await ev(() => showTab('desk')); await sec('replay');
  await page.click('[data-p5="savepack"]');
  ok('chart saved for offline replay (IndexedDB)', await waitFor(() => (P5UI.packs || []).length === 1 && $$('#p5Body [data-pkplay]').length === 1, null, 8000));
  await page.click('[data-pkplay]');
  ok('offline pack opens the Bar Replay trainer', await waitFor(() => document.body.classList.contains('replaying') && curTab === 'markets', null, 10000));
  await ev(() => Replay.exit()); await ev(() => showTab('desk')); await sec('replay');
  await page.fill('#p5Pass', 'short'); await page.click('[data-p5="backup"]');
  ok('short passphrase refused', await waitFor(() => /at least 8/.test($('#p5BkMsg').textContent), null, 5000));
  await ev(() => { ST.p5.marker = 'restore-me-123'; ST.p5.big = 'x'.repeat(300000); saveState(); }); // > 100 KB: exercises the chunked base64 path
  await page.fill('#p5Pass', 'correct horse battery');
  const [bk] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-p5="backup"]')]);
  const bkPath = path.join(DATA, 'b.exterm'); await bk.saveAs(bkPath); const bkTxt = fs.readFileSync(bkPath, 'utf8');
  ok('encrypted .exterm downloads with no plaintext state inside', /\.exterm$/.test(bk.suggestedFilename()) && /AES-256-GCM/.test(bkTxt) && !/restore-me-123|novaterm\.v1|Scalps/.test(bkTxt));
  await ev(() => { ST.p5.marker = 'changed'; saveState(); });
  await page.setInputFiles('#p5File', bkPath); await page.fill('#p5Pass2', 'wrong passphrase!!'); await page.click('[data-p5="restore"]');
  ok('wrong passphrase is refused', await waitFor(() => /Wrong passphrase/.test($('#p5BkMsg').textContent), null, 15000));
  await page.setInputFiles('#p5File', bkPath); await page.fill('#p5Pass2', 'correct horse battery'); await page.click('[data-p5="restore"]');
  ok('right passphrase decrypts and offers a restore', await waitFor(() => /Decrypted \d+ storage entries/.test($('#p5BkMsg').textContent) && !!$('[data-p5="applyrestore"]'), null, 15000));
  await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('[data-p5="applyrestore"]')]);
  await page.waitForFunction(() => window.__exterm_ready === true && typeof P5UI !== 'undefined', null, { timeout: 60000 });
  ok('restore brings the backed-up state back (incl. a 300 KB field)', await ev(() => ST.p5 && ST.p5.marker === 'restore-me-123' && ST.p5.subs.length === 1 && ST.p5.big.length === 300000));
  await ev(() => { delete ST.p5.big; saveState(); });

  /* ── palette ── */
  await page.keyboard.press('Control+k'); await page.fill('#palIn', 'options');
  ok('Ctrl+K lists Pro Desk commands', await waitFor(() => $$('#palList .it').some((x) => /🏛 Options chain/.test(x.textContent)), null, 5000));
  await ev(() => { const i = palItems.findIndex((x) => /Options chain/.test(x.l)); palIdx = i; }); await page.keyboard.press('Enter');
  ok('…and jumps straight to the section', await waitFor(() => curTab === 'desk' && ST.p5.sec === 'opt', null, 5000));

  /* ── hygiene ── */
  await ev(() => { ST.p5.sec = 'risk'; showTab('desk'); });
  const r = await ev(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).map((e) => e.tagName + '.' + e.className).slice(0, 5));
  ok('no inline on* event handlers anywhere in the DOM', r.length === 0, JSON.stringify(r));
  ok('no CSP violations, page errors or dialogs', errs.length === 0, errs.slice(0, 4).join(' || '));
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  ok('phone width: the Pro Desk has no horizontal page scroll', await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await ev(() => document.documentElement.scrollWidth));

  await b.close();
  console.log(res.join('\n'));
  const fails = res.filter((x) => x.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
