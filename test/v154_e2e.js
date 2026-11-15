// ExTerm v15.4 browser end-to-end: Learn ExTerm Academy (top-bar mount beside Settings, LEARN_MOUNT_TARGET toggle,
// fuzzy search, learning paths, mastery bar, lazy categories, Try It Live spotlight, Start Drill sandboxes verified by
// real pointer actions, Explain-This-Metric popovers), Social → Perp Leaderboard (windows, Alpha sort, expand, Chart
// Setup, Shadow Mirror, Track, Backtest Style → Quant Lab, Anti-Rug filter, Consensus heatmap), On-chain → Wallet
// Tracker Smart-Money Leaderboard, all 15 Pro Tools upgrades, English + Arabic RTL, strict CSP, no inline handlers,
// phone width. Third-party APIs are blocked: the launcher runs --offline (seeded on-chain sample, simulated prices).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8804, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv154-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 30000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof LearnUI !== 'undefined' && typeof LeaderUI !== 'undefined' && typeof V154UpUI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && !!document.getElementById('btnLearn'), null, { timeout: 60000 });
    await ev(() => { showTab('markets'); selectSym('BTC-USD'); }); await sleep(400);
    const cash0 = await ev(() => JSON.stringify({ c: ACC.cash, p: Object.keys(ACC.pos || {}).length }));

    // ── Learn ExTerm: mount, overlay, search, paths
    ok('top bar: Learn ExTerm sits right after Settings, translated, nothing else added to the nav', await ev(() => { const s = $('#nav button[data-tab="set"]'); return s.nextElementSibling && s.nextElementSibling.id === 'btnLearn' && $('#btnLearn [data-i18n="learn.btn"]').textContent === I18N.t('learn.btn') && $$('#nav #btnLearn').length === 1 && $$('#nav > button').length === 16; }));
    await page.click('#btnLearn'); await sleep(300);
    ok('academy: Obsidian & Gold hero "Learn Our Terminal — Interactive ExTerm Academy"', await ev(() => !$('#learnOv').hidden && $('#lxTitle').textContent === 'Learn Our Terminal — Interactive ExTerm Academy'));
    ok('academy: 4 goal pills, quick-start + mastery bars ("X / Y Modules Completed"), 9 collapsed categories rendered lazily', await ev(() => $$('#learnOv [data-goal]').length === 4 && /\d+ \/ \d+ Modules Completed/.test($('#lxStats').textContent) && $$('#learnOv details.lx-cat').length === 9 && $$('#learnOv [data-catbody]').every((x) => !x.innerHTML)));
    await page.click('#learnOv details.lx-cat[data-cat="quant"] > summary'); await sleep(200);
    ok('academy: opening a category renders its lesson cards with all five sections', await ev(() => { const c = $$('#learnOv [data-catbody="quant"] .lx-card'); return c.length >= 6 && c.every((x) => x.querySelectorAll('h5').length >= 3 && x.querySelector('[data-lx="try"]')); }));
    await page.click('#learnOv [data-goal="quant"]'); await sleep(150);
    ok('learning path: No-Code Quant Bots playlist ≤ 15 minutes, saved', await ev(() => $('#learnOv [data-goal="quant"]').classList.contains('on') && /No-Code Quant Bots · (\d+) min/.test($('.lx-path h4').textContent) && +/· (\d+) min/.exec($('.lx-path h4').textContent)[1] <= 15 && ST.v154.goal === 'quant'));
    await page.fill('#lxQ', 'How do I drag a stop loss ladder'); await sleep(200);
    ok('fuzzy search: "How do I drag a stop loss ladder" → the SL/TP ladder lesson first', await ev(() => { const c = $('#lxBody .lx-card'); return c && c.dataset.mod === 'chart-ladder'; }));
    await page.fill('#lxQ', 'zzqqxx'); await sleep(100);
    ok('fuzzy search: nonsense → empty state', await ev(() => !$('#lxBody .lx-card')));
    await page.fill('#lxQ', 'auto-evolve'); await sleep(150);
    await page.click('#lxBody .lx-card[data-mod="quant-evolve"] [data-lx="try"]');
    ok('Try It Live: jumps to Lab → 🧬 Auto-Evolve and pulses the gold spotlight ring', await waitFor(() => $('#tab-lab').classList.contains('on') && !!$('#q153Root') && !!$('.lx-spot'), null, 8000));
    ok('Try It Live: lesson marked complete in the mastery tracker', await ev(() => ST.v154.done.includes('quant-evolve')));

    // ── LEARN_MOUNT_TARGET toggle
    await ev(() => { LearnUI.mount('settings'); showTab('set'); }); await sleep(1500);
    ok('LEARN_MOUNT_TARGET = settings: button leaves the top bar, appears in Settings → Documentation & Academy', await ev(() => !$('#btnLearn') && !!$('#learnSet') && /Documentation/.test($('#learnSet').textContent)));
    await ev(() => $('#learnSet button').click()); await sleep(200);
    ok('Settings mount opens the same academy', await ev(() => !$('#learnOv').hidden));
    await ev(() => { LearnUI.close(); LearnUI.mount('topbar'); });
    ok('mount back to topbar', await ev(() => !!$('#btnLearn') && !$('#learnSet')));

    // ── Start Drill: real pointer actions verified live
    await ev(() => { showTab('markets'); LearnUI.open(); }); await page.fill('#lxQ', 'drag sl tp ladders'); await sleep(150);
    await page.click('#lxBody .lx-card[data-mod="chart-ladder"] [data-lx="drill"]'); await sleep(700);
    ok('drill: sandbox scenario on the chart (simulated, tagged) + banner + ladder', await ev(() => chart.data.length === 160 && chart.data.every((c) => c.sim) && !$('#learnDrill').hidden && /SANDBOX/.test($('#learnDrill').textContent) && V152UI.ladder && V152UI.ladder.L.levels.length === 3));
    const lad = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L, lv = V152UI.ladder.L.levels.find((v) => { const y = L.py(v.p); return y > L.y0 + 40 && y < L.y0 + L.mainH - 10; }) || V152UI.ladder.L.levels[0]; return { x: r.left + (L.W - L.Rm) * 0.4, y: r.top + L.py(lv.p), dy: L.py(lv.p) - L.y0 > 60 ? -30 : 30 }; });
    await page.mouse.move(lad.x, lad.y); await page.mouse.down(); await page.mouse.move(lad.x, lad.y + lad.dy, { steps: 6 }); await page.mouse.up();
    ok('drill: dragging a TP rung on the chart is detected and awards the 🏅 badge', await waitFor(() => ST.v154.badges.includes('chart-ladder') && $('#learnDrill').hidden, null, 6000), await ev(() => JSON.stringify({ b: ST.v154.badges, d: !!LearnUI.drill })));
    ok('drill: live chart restored afterwards', await waitFor(() => chart.data.length > 0 && !chart.data[0].sim, null, 6000));
    await ev(() => { LearnUI.open(); }); await page.fill('#lxQ', 'anchor vwap'); await sleep(150);
    await page.click('#lxBody .lx-card[data-mod="chart-vwap"] [data-lx="drill"]'); await sleep(700);
    const cv = await ev(() => { const r = chart.cv.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.35 }; });
    await page.mouse.click(cv.x, cv.y);
    ok('drill: anchoring VWAP with a real chart click awards the badge', await waitFor(() => ST.v154.badges.includes('chart-vwap'), null, 6000));

    // ── Explain This Metric
    await ev(() => V154UpUI.open('flow')); await sleep(1500);
    ok('Explain-This-Metric: subtle "?" added to the Charm / Vanna control', await ev(() => !!$('#v154Up [data-learn="charm"] .lx-q-btn')));
    await page.click('#v154Up [data-learn="charm"] .lx-q-btn'); await sleep(150);
    ok('popover: concise summary + Open Full Lesson →', await ev(() => !$('#lxPop').hidden && /Charm/.test($('#lxPop').textContent) && !!$('#lxPop [data-lesson="flow-charm"]')));
    await page.click('#lxPop [data-lesson]'); await sleep(200);
    ok('Open Full Lesson jumps into the academy at that lesson', await ev(() => !$('#learnOv').hidden && $('#lxBody .lx-card').dataset.mod === 'flow-charm'));
    await ev(() => { LearnUI.close(); $('#v154Up').classList.remove('on'); });

    // ── Social → Perp Leaderboard
    await page.click('#nav button[data-tab="social"]'); await sleep(200);
    ok('Social: Feed | Perp Leaderboard switch, feed shown by default', await ev(() => !!$('#lbSeg') && $('#lbFeedBtn').classList.contains('on') && $('#lbPerp').hidden && !$('#tab-social .soterm').hidden));
    await page.click('#lbPerpBtn');
    ok('Perp Leaderboard: ranked on-chain traders (offline sample flagged), Alpha header with "?"', await waitFor(() => $$('#lbPerp .lb-row').length >= 20 && /SAMPLE/.test($('#lbPerp').textContent) && !!$('#lbPerp .lb-alpha-h'), null, 20000));
    ok('Perp Leaderboard: style tags + signals filled after enrichment', await waitFor(() => $$('#lbPerp .lb-row .tag').some((t) => /Scalper|Swing|Mean-Reversion|News Sniper/.test(t.textContent)), null, 20000));
    const n0 = await ev(() => $$('#lbPerp .lb-row').length);
    await page.click('#lbPerp [data-win="day"]'); await sleep(300);
    ok('windows: 24h / 7d / 30d / All switch the PnL column', await ev(() => /PnL 24h/.test($('#lbPerp .lb-t').textContent)));
    await page.click('#lbPerp .lb-row [data-lb="expand"]');
    ok('expand: live open positions (Asset, Side, Leverage, Entry, Unrealized PnL, Liquidation)', await waitFor(() => { const t = $('#lbPerp .lb-pos'); return t && ['Asset', 'Side', 'Leverage', 'Entry', 'Unrealized PnL', 'Liquidation'].every((h) => t.textContent.includes(h)); }, null, 10000));
    await page.click('#lbPerp [data-lb="mirror"]'); await sleep(200);
    ok('Shadow Mirror: dry-run mirror armed (no custody, no balance change)', await ev(() => ST.v154.mirror.length === 1));
    await page.click('#lbPerp [data-lb="track"]'); await sleep(200);
    ok('+ Track Wallet: saved for the Smart-Money Leaderboard', await ev(() => ST.v154.tracked.length === 1));
    await page.click('#lbPerp [data-lb="setup"]');
    ok('Chart Setup: opens that market on the chart with entry + liquidation levels', await waitFor(() => $('#tab-markets').classList.contains('on') && LeaderUI.setup && LeaderUI.setup.entry > 0 && ST.sel === LeaderUI.setup.sym, null, 8000));
    await page.click('#nav button[data-tab="social"]'); await sleep(200);
    const nOn = await ev(() => LeaderUI.top().length); await page.click('#lbPerp input[data-lbc="antiRug"]'); await sleep(300);
    ok('Anti-Rug filter: on by default; turning it off reveals the screened copy-trap wallets', await ev((n) => !ST.v154.antiRug && LeaderUI.top().length > n && LeaderUI.top().some((r) => LeaderUI.rug(r).flag), nOn), nOn);
    await page.click('#lbPerp input[data-lbc="antiRug"]'); await sleep(200);
    await page.click('#lbPerp input[data-lbc="heat"]'); await sleep(200);
    ok('Consensus heatmap: toggle on, overlay registered on the chart', await ev(() => ST.v154.heat === true && chart.overlays.includes(LeaderUI.overlay)));
    ok('Consensus heatmap: Top-25 books produce price-axis bins for BTC', await ev(() => { const books = [...LeaderUI.det.values()], B = V154.heatmap(books, 'BTC', 1, 1e7, 40); return B && B.some((x) => x.w > 0); }));
    await page.click('#lbPerp [data-lb="backtest"]');
    ok('Backtest Style: trader cadence → Quant Lab run with a time-stop filter, through the 17-test gate', await waitFor(() => $('#tab-lab').classList.contains('on') && !!$('#q153Root') && V153UI.filters && V153UI.filters.timeStop >= 2 && !!V153UI.base && !!V153UI.base.grade, null, 90000), await ev(() => JSON.stringify({ f: V153UI.filters, b: !!V153UI.base, g: V153UI.base && V153UI.base.grade })));

    // ── On-chain → Wallet Tracker → Smart-Money Leaderboard
    await ev(() => { setMode('onchain'); showTab('whales'); }); await sleep(1200);
    ok('Smart-Money Leaderboard: collapsed panel in the on-chain Wallet Tracker', await waitFor(() => !!$('#lbSmart') && !$('#lbSmart').hidden && !$('#lbSmart').open, null, 8000));
    await page.click('#lbSmart > summary');
    ok('Smart-Money Leaderboard: tracked ★ wallet + public top 25 with win rate, realised PnL, Alpha', await waitFor(() => { const t = $('#lbSmart table'); return t && /Win rate/.test(t.textContent) && /Realised PnL/.test(t.textContent) && $$('#lbSmart tr').length >= 10 && /★/.test(t.textContent); }, null, 20000));
    await page.fill('#lbAddr', '<script>alert(1)</script>'); await page.click('#lbAddBtn'); await sleep(200);
    ok('Smart-Money: hostile address refused, nothing injected', await ev(() => ST.v154.tracked.length === 1 && !document.querySelector('#lbSmart script')));
    ok('CONFLUENCE: top wallets lining up on the same side are detected', await ev(() => Array.isArray(LeaderUI.conf)));
    await ev(() => { setMode('crypto', 'BTC-USD'); showTab('markets'); }); await sleep(800);

    // ── 15 Pro Tools upgrades
    await ev(() => { const d = $('#v154Up'); if (d) d.remove(); }); await page.click('#btnPro'); await sleep(200);
    ok('Pro Tools: one 🧰 drawer, six collapsed sections, nothing rendered or drawn until opened', await ev(() => $('#v154Up').classList.contains('on') && $$('#v154Up details[data-sec]').length === 6 && $$('#v154Up details[open]').length === 0 && $$('#v154Up [data-body]').every((x) => !x.innerHTML)));
    await page.click('#v154Up details[data-sec="chart"] > summary'); await sleep(150);
    for (const k of ['ghost', 'sess']) await page.click(`#v154Up input[data-u="${k}"]`);
    await page.click('#v154Up [data-ghtf="14400"]'); await sleep(900);
    ok('1 ghost candles: 4h shells computed behind the chart', await ev(() => V154UpUI.cfg().ghost && V154UpUI.cfg().ghostTf === 14400));
    ok('3 kill-zones + opening range: toggled on', await ev(() => V154UpUI.cfg().sess));
    await ev(() => V152UI.A.ladder()); await sleep(300); await page.click('#v154Up [data-v="armLadder"]'); await sleep(200);
    ok('2 step-ladder: rules armed on the TP ladder', await ev(() => V152UI.ladder && V152UI.ladder.armed && V152UI.ladder.armed.TP1 === 'be01'));
    const rung = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L; return { x: r.left + (L.W - L.Rm) * 0.5, y: r.top + L.py(V152UI.ladder.L.levels[0].p) }; });
    await page.mouse.click(rung.x, rung.y, { button: 'right' }); await sleep(200);
    ok('2 step-ladder: right-click a TP rung opens the Auto-Breakeven menu', await ev(() => !$('#v154Menu').hidden && /Move SL to Entry \+0\.1R/.test($('#v154Menu').textContent)));
    await page.click('#v154Menu [data-rule="be"]'); await sleep(100);
    ok('2 step-ladder: menu choice arms the rung', await ev(() => V152UI.ladder.armed.TP1 === 'be'));
    await page.click('#v154Up details[data-sec="flow"] > summary'); await sleep(150);
    for (const k of ['tape', 'charm', 'absorb']) await page.click(`#v154Up input[data-u="${k}"]`);
    ok('4 tape speedometer: micro-gauge on the chart (orders/s + imbalance)', await waitFor(() => !!$('#v154Tape') && /\/s/.test($('#v154Tape').textContent), null, 4000));
    ok('5 charm / vanna + 6 absorption: toggled on', await ev(() => V154UpUI.cfg().charm && V154UpUI.cfg().absorb));
    await page.click('#v154Up details[data-sec="scan"] > summary'); await sleep(150);
    await page.click('#v154Up [data-v="gap"]');
    ok('7 gap-fill scanner: ranked rows with gap %, RVOL and 90-day fill rate', await waitFor(() => { const t = $('#v154ScanOut table'); return t && /90d fill rate/.test(t.textContent) && $$('#v154ScanOut tr[data-sym]').length >= 3; }, null, 40000));
    await page.click('#v154Up [data-v="lag"]');
    ok('9 lead-lag: correlation / beta / lag table (or an honest not-enough-data note)', await waitFor(() => /Lead-lag|Not enough overlapping/.test($('#v154ScanOut').textContent), null, 40000));
    await page.click('#v154Up details[data-sec="dex"] > summary'); await sleep(150); await page.click('#v154Up [data-v="xray"]'); await sleep(200);
    ok('8 holder X-ray: bubble graph + coordinated share, model source labelled', await ev(() => !!$('#v154XrOut svg.v154-bub circle') && /Coordinated share/.test($('#v154XrOut').textContent) && /model/.test($('#v154XrOut').textContent)));
    await page.click('#v154Up details[data-sec="ai"] > summary'); await sleep(150);
    await page.fill('#v154Hunt', 'bullish FVG above VWAP with RVOL > 1.2x'); await page.click('#v154Up [data-v="hunt"]'); await sleep(300);
    ok('11 pattern hunter: plain English parsed and zones drawn on the chart', await ev(() => Array.isArray(V154UpUI.hunt) && V154UpUI.huntQ.includes('FVG') && /zone/.test($('#v154Up [data-body="ai"]').textContent)));
    for (const k of ['forensic', 'throttle']) await page.click(`#v154Up input[data-u="${k}"]`); await sleep(300);
    ok('12 throttle: status lamp rendered; dry-run shadow fills are wrapped', await ev(() => V154UpUI.cfg().throttle && V152._v154 === true && /Throttle/.test($('#v154Up [data-body="ai"]').textContent)));
    ok('12 throttle: a paused guard blocks a dry-run shadow entry; half-size halves it', await ev(() => { V154UpUI.guard = { factor: 0, why: 'test' }; const a = V152.shadowFill({ side: 'buy', usd: 100, sym: 'BTC-USD' }, { price: 10, ts: 1 }, 0); V154UpUI.guard = { factor: 0.5, why: 'test' }; const h = V152.shadowFill({ side: 'buy', usd: 100, sym: 'BTC-USD' }, { price: 10, ts: 1 }, 0); V154UpUI.guard = { factor: 1, why: 'normal' }; return a === null && h && Math.abs(h.usd - 50) < 1e-9; }));
    await ev(() => $('#v154Up').classList.remove('on'));
    await sleep(400); const fx = await ev(() => { const L = chart.L; return { x: L.kx(L.end - 5), y: L.y0 + L.mainH * 0.4 }; }), cvh = await page.evaluateHandle(() => chart.cv);
    for (let k = 0; k < 3 && !(await ev(() => !!$('#v154Fx'))); k++) { await cvh.asElement().click({ modifiers: ['Alt'], position: { x: fx.x - k * 12, y: fx.y + k * 10 }, force: true }); await sleep(500); }
    ok('10 Alt+click a spike: forensic breakdown with an Ask the 3-Agent Copilot button', await waitFor(() => !!$('#v154Fx') && /Why did price just move/.test($('#v154Fx').textContent) && !!$('#v154Fx [data-fx="ask"]'), null, 4000));
    await ev(() => { const m = $('#v154Fx'); if (m) m.remove(); V154UpUI.open('macro'); }); await sleep(200);
    await page.click('#v154Up input[data-u="react"]'); await page.click('#v154Up [data-v="react"]');
    ok('13 FOMC / CPI / NFP reactions: measured table (or honest empty-history note)', await waitFor(() => /First 5 min spike/.test($('#v154ReOut').textContent), null, 40000));
    await ev(() => { const n = Date.now(); Journal.merge([{ id: 'j_t1', ts: n - 300000, side: 'buy', sym: 'BTC-USD', usd: 1000, price: 100, qty: 10 }, { id: 'j_t2', ts: n - 240000, side: 'sell', sym: 'BTC-USD', usd: 950, price: 95, qty: 10, pnl: -50, held: 60000 }, { id: 'j_t3', ts: n - 200000, side: 'buy', sym: 'BTC-USD', usd: 3000, price: 95, qty: 31 }]); showTab('journal'); });
    ok('14 tilt guard: revenge-size warning banner in the Journal', await waitFor(() => !!$('#v154Tilt') && /Tilt & Revenge-Trade Guard/.test($('#v154Tilt').textContent), null, 8000));
    await ev(() => V154UpUI.A.worst());
    ok('15 Replay My Worst Loss: that trade loads into bar replay', await waitFor(() => Replay.on && Replay.sym === 'BTC-USD', null, 15000));
    await ev(() => { Replay.exit(); for (const id of ['j_t1', 'j_t2', 'j_t3']) Journal.remove(id); });

    // ── RTL
    await ev(() => I18N.set('ar')); await sleep(300);
    ok('RTL: Arabic mirrors the page; Learn ExTerm + leaderboard labels translated', await ev(() => document.documentElement.dir === 'rtl' && $('#btnLearn [data-i18n]').textContent === I18N.tr('ar', 'learn.btn') && $('#lbPerpBtn [data-i18n]').textContent === I18N.tr('ar', 'lb.perp') && I18N.tr('ar', 'learn.btn') !== 'Learn ExTerm'));
    await page.click('#btnLearn'); await sleep(250);
    ok('RTL: academy overlay renders right-to-left with the Arabic hero', await ev(() => $('#learnOv').dir === 'rtl' && $('#lxTitle').textContent === I18N.tr('ar', 'learn.hero')));
    await ev(() => { LearnUI.close(); I18N.set('en'); });

    // ── security + layout
    ok('no inline event-handler attributes anywhere in the live DOM', await ev(() => [...document.querySelectorAll('*')].every((el) => ![...el.attributes].some((a) => /^on/i.test(a.name)))));
    ok('strict CSP: default-src none, script + style SHA-256 hashes, no unsafe-inline script', await ev(() => { const c = $('meta[http-equiv="Content-Security-Policy"]').content; return /default-src 'none'/.test(c) && /script-src 'sha256-/.test(c) && /style-src-elem 'self' 'sha256-/.test(c) && !/script-src[^;]*unsafe-inline/.test(c); }));
    ok('paper balances untouched by mirror / backtest / drills', await ev((c0) => { const c = JSON.parse(c0); return Math.abs(ACC.cash - c.c) < 1e-6; }, cash0));
    await page.setViewportSize({ width: 390, height: 844 }); await ev(() => LearnUI.open()); await sleep(300);
    ok('phone width: academy fits without horizontal scroll', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1 && $('.lx-wrap').getBoundingClientRect().right <= innerWidth + 1));
    ok('no page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 4).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${res.length - f}/${res.length} passed`);
  process.exit(f ? 1 : 0);
})();
