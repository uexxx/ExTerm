// ExTerm v15 phase 2 browser end-to-end: chart + click-to-trade, draggable Entry/SL/TP lines with Ctrl+Z/Ctrl+Y,
// Breakeven / Partial TP, realistic paper fills, backtest trade arrows + tooltips, the Challenges Hub modes, grades and
// Flex Cards, the walkthrough, live demo, Morning Brief, Field Manual and System Doctor, plus CSP / XSS checks.
// Third-party APIs are blocked: the app runs on simulated prices through the launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | '), 'ERRS', errs.slice(0, 5).join(' || ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8782, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt15p2-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
  await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__exterm_p2 === true && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && px(ST.sel) > 0, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
  const blur = () => ev(() => { if (document.activeElement) document.activeElement.blur(); });

  ok('phase 2 boots on the launcher', await ev(() => window.__exterm_p2 === true && J.proxy && !!$('#btnDemo') && !!$('#btnBrief') && !!$('#setSeg')));
  ok('no walkthrough or brief pops up under automation', await ev(() => !$('#walkCard') && !$('#p2Brief')));
  ok('the built page pins its script by SHA-256 under default-src none', await ev(() => { const c = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content; return /default-src 'none'/.test(c) && /script-src 'sha256-[A-Za-z0-9+/=]+'/.test(c) && !/unsafe-inline'[^;]*script|script-src[^;]*unsafe/.test(c); }));

  /* ── + button follows the cursor and opens the trade menu ── */
  await ev(() => { selectSym('BTC-USD'); }); await sleep(600);
  let g = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L, p = px(ST.sel); let y = L.py(p * 0.995); if (!(y > L.y0 + 10 && y < L.y0 + L.mainH - L.volH - 10)) y = L.y0 + (L.mainH - L.volH) * 0.75; return { x: r.left, y: r.top, W: L.W, Rm: L.Rm, yb: y, ya: L.y0 + 20, p }; });
  await page.mouse.move(g.x + g.W * 0.45, g.y + g.yb); await page.mouse.move(g.x + g.W * 0.5, g.y + g.yb, { steps: 3 });
  let r = await ev(() => ({ vis: !$('.ct-plus').hidden, left: parseFloat($('.ct-plus').style.left), price: ChartTrade.price, want: chart.toTP(chart.L.W * 0.5, parseFloat($('.ct-plus').style.top) + 10).p }));
  ok('+ appears next to the price axis and tracks the cursor price', r.vis && Math.abs(r.left - (g.W - g.Rm - 24)) < 1 && Math.abs(r.price / r.want - 1) < 0.002, JSON.stringify(r));
  await page.click('.ct-plus');
  r = await ev(() => ({ n: $$('.ct-menu [data-cta]').length, txt: $('.ct-menu').textContent, focus: document.activeElement && document.activeElement.dataset.cta }));
  ok('the menu offers buy, sell, alert and level at that price', r.n === 4 && /Buy limit/.test(r.txt) && /alert/i.test(r.txt) && /Horizontal level/.test(r.txt) && r.focus === 'buy', JSON.stringify(r));
  ok('sell is disabled without a position', await ev(() => $('.ct-menu [data-cta="sell"]').disabled));
  await page.keyboard.press('Escape'); ok('Esc closes the menu', await ev(() => !$('.ct-menu')));
  await page.mouse.move(g.x + g.W * 0.5, g.y + g.yb); await page.click('.ct-plus'); await page.click('.ct-menu [data-cta="buy"]');
  await page.waitForFunction(() => ChartTrade.draft && ChartTrade.ys.sl != null && $('.ct-box') && !$('.ct-box').hidden, null, { timeout: 5000 }).catch(() => {});
  r = await ev(() => ({ d: ChartTrade.draft, box: $('.ct-box').textContent }));
  ok('Buy opens a draft bracket with a 2% stop and a 2R target', r.d && r.d.sl < r.d.entry && r.d.tp > r.d.entry && Math.abs((r.d.tp - r.d.entry) / (r.d.entry - r.d.sl) - 2) < 1e-6, JSON.stringify(r.d));
  ok('the bracket box shows $ risk, reward and R:R', /Stop loss/.test(r.box) && /Take profit/.test(r.box) && /1 : 2\.00/.test(r.box), r.box);

  /* ── drag the stop on the canvas, undo / redo ── */
  await ev((k) => { chart.draw(); const L = chart.L, y = (ChartTrade.ys.entry + ChartTrade.ys.sl) / 2; const pt = chart.toTP(L.Lm + 10, y); if (pt) ChartTrade.set(k, 'sl', pt.p); chart.draw(); }, 'draft'); // keep the stop inside the visible range: a 2% stop can sit below it at some prices
  await page.waitForFunction((k) => { const b = ChartTrade.find(k); return b && Math.abs(ChartTrade.ys.sl - (chart.L.py(b.sl) + 0.5)) < 2; }, 'draft', { timeout: 5000 }).catch(() => {}); // the stop line is drawn at its new price before we grab it
  g = await ev(() => { const r = chart.cv.getBoundingClientRect(); return { x: r.left, y: r.top, W: chart.L.W, sl: ChartTrade.ys.sl, tp: ChartTrade.ys.tp, off: chart.view.off, sl0: ChartTrade.draft.sl }; });
  await page.mouse.move(g.x + g.W * 0.3, g.y + g.sl); await page.mouse.down(); await page.mouse.move(g.x + g.W * 0.3, g.y + g.sl + 30, { steps: 6 }); await page.mouse.up();
  r = await ev(() => ({ sl: ChartTrade.draft.sl, off: chart.view.off, undo: ChartTrade.hist.canUndo, box: $('.ct-box [data-f="sl"]').textContent }));
  ok('dragging the SL line moves the stop down (and does not pan the chart)', r.sl < g.sl0 && r.off === g.off && r.undo, JSON.stringify(r));
  ok('the box updates live while you drag', r.box.includes(await ev(() => NT.fmtPrice(ChartTrade.draft.sl))), r.box);
  await page.mouse.move(g.x + g.W * 0.3, g.y + g.tp); await page.mouse.down(); await page.mouse.move(g.x + g.W * 0.3, g.y + g.tp + 400, { steps: 6 }); await page.mouse.up();
  ok('a target dragged below the entry stays above it', await ev(() => ChartTrade.draft.tp > ChartTrade.draft.entry));
  await blur(); await page.keyboard.press('Control+z');
  ok('Ctrl+Z undoes the last line move', await ev((t) => Math.abs(ChartTrade.draft.tp - t) > 0 && ChartTrade.hist.canRedo, 0));
  await page.keyboard.press('Control+z'); ok('…and the one before (stop back where it was)', await ev((s0) => Math.abs(ChartTrade.draft.sl - s0) < 1e-9, g.sl0));
  await page.keyboard.press('Control+y'); ok('Ctrl+Y redoes it', await ev((s0) => ChartTrade.draft.sl < s0, g.sl0));
  const drawsBefore = await ev(() => chart.drawings.length);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  ok('with no line moves left, Ctrl+Z falls through to drawings without errors', await ev((n) => chart.drawings.length <= n, drawsBefore));
  await page.fill('.ct-box [data-ctin="usd"]', '2500'); ok('size is editable in the box', await ev(() => ChartTrade.draft.usd === 2500));
  await page.click('.ct-box [data-ctb="place"]');
  r = await ev(() => { const o = ACC.orders[ACC.orders.length - 1]; return { o, cur: ChartTrade.cur() }; });
  ok('Place sends a paper buy limit with the bracket attached', r.o && r.o.side === 'buy' && r.o.size === 2500 && r.o.meta.slPx > 0 && r.o.meta.tpPx > r.o.price && r.cur.kind === 'order', JSON.stringify(r.o));

  /* ── alert + level from the menu ── */
  g = await ev(() => { const r = chart.cv.getBoundingClientRect(); return { x: r.left, y: r.top, W: chart.L.W, ya: chart.L.y0 + 24 }; });
  const al0 = await ev(() => ST.alerts.length);
  await page.mouse.move(g.x + g.W * 0.5, g.y + g.ya); await page.click('.ct-plus'); await page.click('.ct-menu [data-cta="alert"]');
  ok('Price alert from the + menu', await ev((n) => ST.alerts.length === n + 1 && ST.alerts[n].active && ST.alerts[n].sym === ST.sel, al0));
  const dr0 = await ev(() => chart.drawings.length);
  await page.mouse.move(g.x + g.W * 0.5, g.y + g.ya + 6); await page.click('.ct-plus'); await page.click('.ct-menu [data-cta="hline"]');
  ok('Horizontal level from the + menu (saved with the chart)', await ev((n) => chart.drawings.length === n + 1 && chart.drawings[n].type === 'h' && ST.draw[ST.sel].length === n + 1, dr0));

  /* ── open position: live P&L, Breakeven, undo, Partial TP ── */
  await ev(() => { const o = ACC.orders.filter((x) => x.sym === ST.sel && x.side === 'buy').pop(); ACC.matchOrders(ST.sel, o.price * 0.999, o.price * 1.001, Date.now()); chart.invalidate(); renderPosStrip(); });
  await page.waitForFunction(() => $('.ct-box [data-ctb="be"]'), null, { timeout: 5000 }).catch(() => {});
  r = await ev(() => ({ kind: ChartTrade.cur().kind, live: ($('.ct-box [data-f="live"]') || {}).textContent, sl: ACC.pos[ST.sel].sl }));
  ok('a filled order becomes an open position with live P&L', r.kind === 'pos' && /\$/.test(r.live || ''), JSON.stringify(r));
  await page.click('.ct-box [data-ctb="be"]');
  ok('Breakeven moves the stop to the entry', await ev(() => { const p = ACC.pos[ST.sel]; return Math.abs(p.sl - p.cost / p.qty) < 1e-9; }));
  await blur(); await page.keyboard.press('Control+z'); ok('Ctrl+Z undoes Breakeven', await ev((s) => ACC.pos[ST.sel].sl === s, r.sl));
  const q0 = await ev(() => ACC.qty(ST.sel)); await page.click('.ct-box [data-ctb="ptp"]');
  ok('Partial TP 50% sells half at market', await ev((q) => Math.abs(ACC.qty(ST.sel) - q / 2) < q * 1e-9, q0));
  await ev((k) => { chart.draw(); const L = chart.L, y = (ChartTrade.ys.entry + ChartTrade.ys.sl) / 2; const pt = chart.toTP(L.Lm + 10, y); if (pt) ChartTrade.set(k, 'sl', pt.p); chart.draw(); }, 'pos:' + (await ev(() => ST.sel))); // keep the stop inside the visible range: a 2% stop can sit below it at some prices
  await page.waitForFunction((k) => { const b = ChartTrade.find(k); return b && Math.abs(ChartTrade.ys.sl - (chart.L.py(b.sl) + 0.5)) < 2; }, 'pos:' + (await ev(() => ST.sel)), { timeout: 5000 }).catch(() => {});
  g = await ev(() => { const r = chart.cv.getBoundingClientRect(); chart.draw(); return { x: r.left, y: r.top, W: chart.L.W, sl: ChartTrade.ys.sl, e: ChartTrade.ys.entry, sl0: ACC.pos[ST.sel].sl }; });
  await page.mouse.move(g.x + g.W * 0.3, g.y + g.sl); await page.mouse.down(); await page.mouse.move(g.x + g.W * 0.3, g.y + g.sl + 20, { steps: 4 }); await page.mouse.up();
  ok('a position’s stop line can be dragged too', await ev((s) => ACC.pos[ST.sel].sl < s, g.sl0));
  ok('the entry line of a filled position is fixed (not a drag target)', await ev((y) => ChartTrade.hit(y) !== 'entry', g.e));

  /* ── realistic paper fills ── */
  ok('the ticket has a Realistic fills toggle', await ev(() => !!$('#tkReal') && !$('#tkReal').checked));
  await page.click('#tkReal'); await page.fill('#tkUsd', '1000'); await sleep(100);
  r = await ev(() => ({ on: ST.settings.realExec, est: $('#tkEst').textContent }));
  ok('turning it on shows the expected realistic fill in the ticket', r.on && /realistic fill ≈/.test(r.est) && /spread/.test(r.est), r.est);
  await page.click('#tkGo'); await sleep(200);
  r = await ev(() => ACC.trades[ACC.trades.length - 1]);
  ok('a market buy pays the spread + depth impact and says so', r.side === 'buy' && r.exec && r.exec.spreadBp >= 0 && /fill: spread/.test(r.reason), JSON.stringify(r));
  await page.click('#tkReal'); ok('…and it can be turned off again', await ev(() => ST.settings.realExec === false));

  /* ── backtest trade arrows ── */
  await page.click('nav button[data-tab="bots"]'); await sleep(300);
  await page.click('#btRun'); await page.waitForFunction(() => typeof btBusy !== 'undefined' && !btBusy && $('#btPrice canvas'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => BTArrows.last && BTArrows.last._arrPts && BTArrows.last._arrPts.length > 0, null, { timeout: 10000 }).catch(() => {});
  r = await ev(() => ({ trips: BTArrows.last && BTArrows.last._trips.length, pts: BTArrows.last && BTArrows.last._arrPts.length, cb: !!$('#btArr') && $('#btArr').checked, lbl: ($('.bt-arr') || {}).textContent, tri: BTArrows.last && BTArrows.last.o.trades }));
  ok('a backtest draws entry/exit arrows for its round trips', r.trips > 0 && r.pts > 0 && r.cb && r.tri === false && /wins/.test(r.lbl || ''), JSON.stringify(r));
  g = await ev(() => { const pc = BTArrows.last, rr = pc.cv.getBoundingClientRect(), p = pc._arrPts.find((q) => q.x > 20 && q.x < pc.L.W - pc.L.Rm - 20) || pc._arrPts[0]; return { x: rr.left + p.x, y: rr.top + p.y }; });
  await page.mouse.move(g.x - 30, g.y); await page.mouse.move(g.x, g.y, { steps: 4 });
  r = await ev(() => ({ vis: !$('.bt-tip').hidden, txt: $('.bt-tip').textContent }));
  ok('hovering an arrow shows the trade’s entry, result and reason', r.vis && /Entry/.test(r.txt) && /(Win|Loss|Open trade)/.test(r.txt), JSON.stringify(r));
  await page.click('#btArr'); await sleep(150);
  ok('the overlay toggles off (back to plain markers)', await ev(() => BTArrows.last.o.trades === true && BTArrows.last._arrPts.length === 0 && ST.settings.btArrows === false));
  await page.click('#btArr'); await sleep(150);
  const xss = await ev(async () => {
    const pc = BTArrows.last, D = pc.data, n = D.length;
    BTArrows.attach(pc, [{ ts: D[n - 60].t, side: 'buy', price: D[n - 60].c, qty: 1, reason: '<img src=x onerror="window.__x=1">' }, { ts: D[n - 20].t, side: 'sell', price: D[n - 20].c, qty: 1, pnl: 1, reason: '<svg onload="window.__x=2"></svg>' }]);
    pc.view = { bars: 110, off: 0 }; pc.draw(); const p = pc._arrPts[0]; BTArrows.hover(pc, { x: p.x, y: p.y });
    await new Promise((r) => setTimeout(r, 50));
    return { tags: $('.bt-tip').querySelectorAll('img,svg').length, txt: $('.bt-tip').textContent, x: window.__x };
  });
  ok('tooltip text from strategies is escaped (no markup, no script)', xss.tags === 0 && /<img/.test(xss.txt) && xss.x === undefined, JSON.stringify(xss));

  /* ── Challenges Hub ── */
  await page.click('nav button[data-tab="challenge"]'); await sleep(200);
  ok('the hub lists every mode', await ev(() => ['daily', 'blind', 'random', 'prop50', 'prop100', 'swan', 'scalp', 'naked', 'trench'].every((m) => !!$(`#chMode button[data-v="${m}"]`))));
  await page.click('#chMode button[data-v="prop50"]'); await page.click('#chNew');
  await page.waitForFunction(() => Challenge.g && !Challenge.busy && $('#chChart canvas'), null, { timeout: 30000 }).catch(() => {});
  r = await ev(() => ({ cash0: Challenge.g.cash0, rules: Challenge.g.rules, txt: $('.ch-rules').textContent, mode: Challenge.g.meta.mode }));
  ok('Prop-Firm $50K: $50K account, +8% target, 4% daily, 8% trailing', r.cash0 === 50000 && r.rules.target === 8 && r.rules.dailyDD === 4 && r.rules.maxDD === 8 && /Target \+8%/.test(r.txt) && r.mode === 'prop50', JSON.stringify(r));
  await blur(); await page.keyboard.press('b'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  ok('the drawdown KPI updates as candles play', await ev(() => /%/.test($('#chDD').textContent)));
  await ev(() => { Challenge.g.step(1e6); Challenge.draw(); }); await sleep(300);
  r = await ev(() => ({ end: !$('#chEnd').hidden, txt: $('#chEnd').textContent, share: $('#chShare').textContent }));
  ok('the result shows the discipline grade, max drawdown and win rate', r.end && /Grade/.test(r.txt) && /(A\+|A|B|C|D|F)/.test(r.txt) && /Max DD/.test(r.txt) && /Win rate/.test(r.txt) && /Flex Card/.test(r.share), r.txt.slice(0, 300));
  const png = await ev(() => Challenge.card(Challenge.g.result(), Challenge.stats(), Challenge.g.meta) || '');
  ok('the Flex Card renders as a PNG', /^data:image\/png;base64,/.test(png) && png.length > 20000, png.length);
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#chShare'); const d = await dl;
  ok('📸 Flex Card downloads the image', d && /exterm-flex-card\.png/.test(d.suggestedFilename()));
  await ev(() => Challenge.render()); ok('recent rounds show their grade', await ev(() => !!$('.ch-hist .ch-grade')));

  await page.click('#chMode button[data-v="swan"]'); await page.selectOption('#chSwan', 'gfc'); await page.click('#chNew');
  await page.waitForFunction(() => Challenge.g && !Challenge.busy && Challenge.g.meta.event === 'gfc', null, { timeout: 20000 }).catch(() => {});
  r = await ev(() => ({ m: Challenge.g.meta, dd: Challenge.g.rules.maxDD, head: $('.ch-head').textContent }));
  ok('Black Swan: the 2008 crisis on SPY, modeled, with a 20% drawdown limit', r.m.modeled && r.m.sym === 'SPY' && r.dd === 20 && /2008/.test(r.head), JSON.stringify(r));
  for (const ev2 of ['covid', 'ftx']) { await page.selectOption('#chSwan', ev2).catch(() => {}); }
  await page.click('#chMode button[data-v="naked"]'); await page.click('#chNew');
  await page.waitForFunction(() => Challenge.g && !Challenge.busy && Challenge.g.meta.mode === 'naked', null, { timeout: 30000 }).catch(() => {});
  ok('Naked Price Action hides every indicator and the volume', await ev(() => Challenge.chart.o.ema === false && Challenge.chart.o.vol === false && Challenge.chart.o.bb === false));
  await page.click('#chMode button[data-v="trench"]'); await page.click('#chNew');
  await page.waitForFunction(() => Challenge.g && !Challenge.busy && Challenge.g.meta.mode === 'trench', null, { timeout: 20000 }).catch(() => {});
  ok('Solana Trench: a simulated memecoin with 1% fee + 1% slippage', await ev(() => Challenge.g.meta.sim && /^\$/.test(Challenge.g.meta.sym) && Challenge.g.fee === 0.01 && Challenge.g.slip === 0.01));
  await page.click('#chMode button[data-v="scalp"]'); await page.click('#chNew');
  await page.waitForFunction(() => Challenge.g && !Challenge.busy && Challenge.g.meta.mode === 'scalp', null, { timeout: 30000 }).catch(() => {});
  ok('Scalping Sprint: a 10-minute clock with auto-advancing 1m candles', await ev(() => Challenge.g.deadline - Date.now() > 590000 && Challenge.play && /s · /.test($('#chLeft').textContent) && Challenge.g.meta.tf === '1m'));
  await ev(() => { clearInterval(Challenge.play); Challenge.play = 0; });
  await ev(() => { localStorage.setItem('nt.chal', JSON.stringify({ played: 1, hist: [{ ts: 1, sym: '<img src=x onerror="window.__x=3">', tf: '1h', score: '<b>9</b>', edge: 1, grade: 'A' }] })); Challenge.render(); });
  ok('challenge history from storage is escaped', await ev(() => !$('#chHost .ch-hist img') && window.__x === undefined));

  /* ── walkthrough, live demo, Morning Brief ── */
  await ev(() => showTab('markets')); await ev(() => Walk.start(0)); await sleep(150);
  ok('the walkthrough card opens with a 60-second timer', await ev(() => !!$('#walkCard') && /Step 1 of 5/.test($('#walkCard').textContent) && /First 60 seconds/.test($('#walkCard').textContent)));
  await page.click('#walkCard [data-w="go"]'); await page.waitForFunction(() => /Step 2 of 5/.test(($('#walkCard') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ok('Show me does the step and the walkthrough advances by itself', await ev(() => /Step 2 of 5/.test($('#walkCard').textContent)));
  await page.click('#walkCard [data-w="skip"]'); ok('skip closes it and remembers', await ev(() => !$('#walkCard') && ST.settings.walkDone === true));
  await ev(() => { ChartTrade.draft = null; selectSym('ETH-USD'); ST.settings.realExec = false; }); await sleep(400);
  await page.click('#btnDemo');
  await page.waitForFunction(() => ST.sel === 'BTC-USD' && ChartTrade.draft && $('#walkCard'), null, { timeout: 15000 }).catch(() => {});
  ok('▶ Demo: BTC, realistic fills on, a draft bracket and the walkthrough at the drag step', await ev(() => ST.sel === 'BTC-USD' && ST.settings.realExec === true && !!ChartTrade.draft && /Step 3 of 5/.test(($('#walkCard') || {}).textContent || '')));
  await ev(() => Walk.end(false));
  await page.click('#btnBrief');
  r = await ev(() => ({ open: !!$('#p2Brief'), txt: ($('#p2Brief') || {}).textContent || '' }));
  ok('☀ opens the Morning Brief with movers, account and the command overview', r.open && /Market pulse/.test(r.txt) && /Paper account/.test(r.txt) && /Command overview/.test(r.txt) && /Ctrl\+Z/.test(r.txt), r.txt.slice(0, 200));
  await page.click('#briefAuto'); ok('the daily brief can be switched off from the brief', await ev(() => ST.settings.brief === false));
  await page.keyboard.press('Escape'); ok('Esc closes the brief', await ev(() => !$('#p2Brief')));

  /* ── Field Manual + System Doctor ── */
  await page.click('nav button[data-tab="set"]'); await page.click('#setSeg [data-st="fm"]');
  r = await ev(() => ({ list: $$('#fmList .fm-item').length, setHidden: getComputedStyle($('#setBody')).display === 'none', fmVis: getComputedStyle($('#fmHost')).display !== 'none' }));
  ok('Settings has a Field Manual tab that swaps the view', r.list >= 15 && r.setHidden && r.fmVis, JSON.stringify(r));
  await page.fill('#fmQ', 'prop firm');
  r = await ev(() => ({ vis: $$('#fmList .fm-item').filter((e) => !e.hidden).map((e) => e.dataset.fmid), count: $('#fmCount').textContent }));
  ok('the manual is searchable', r.vis.includes('prop') && r.vis.length < 5 && /match/.test(r.count), JSON.stringify(r));
  await page.fill('#fmQ', '<img src=x onerror="window.__x=4">');
  ok('a hostile search is shown as text', await ev(() => !$('#fmCount img') && window.__x === undefined && $$('#fmList .fm-item').every((e) => e.hidden)));
  await page.fill('#fmQ', 'prop'); await page.click('.fm-item[data-fmid="prop"] [data-fmgo="prop"]');
  ok('Try this feature deep-links into the right place', await ev(() => curTab === 'challenge' && Challenge.mode === 'prop50' && $('#chMode button.on').dataset.v === 'prop50'));
  await page.click('nav button[data-tab="set"]'); await page.click('#setSeg [data-st="set"]');
  ok('…and the Settings tab comes back', await ev(() => getComputedStyle($('#setBody')).display !== 'none' && getComputedStyle($('#fmHost')).display === 'none'));
  await page.click('#setSeg [data-st="fm"]'); await page.click('#fmDoc');
  await page.waitForFunction(() => $$('#docOut li').length > 6, null, { timeout: 30000 }).catch(() => {});
  r = await ev(() => $$('#docOut li').map((l) => l.className + ':' + l.querySelector('b').textContent));
  ok('System Doctor runs browser + launcher checks', r.some((x) => /^ok:Strict content security policy/.test(x)) && r.some((x) => /^ok:Launcher/.test(x)) && r.some((x) => /:Python/.test(x)) && r.some((x) => /:App file checksum/.test(x)), JSON.stringify(r));

  /* ── strict CSP hygiene across everything phase 2 rendered ── */
  r = await ev(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).map((e) => e.tagName + '.' + e.className).slice(0, 5));
  ok('no inline on* event handlers anywhere in the DOM', r.length === 0, JSON.stringify(r));
  ok('no CSP violations, page errors or dialogs', errs.length === 0, errs.slice(0, 4).join(' || '));
  await page.setViewportSize({ width: 390, height: 844 }); await ev(() => showTab('markets')); await sleep(300);
  ok('phone width: no horizontal page scroll', await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await ev(() => document.documentElement.scrollWidth));

  await b.close();
  console.log(res.join('\n'));
  const fails = res.filter((x) => x.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
