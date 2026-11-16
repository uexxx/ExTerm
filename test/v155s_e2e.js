// ExTerm v15.5 screen restructures, browser end-to-end: Order Flow 2-column split (DOM ladder + tape velocity | tabbed CVD &
// Absorption · Anchored VWAP & VPVR · 0DTE Gamma Flip & Charm), DEX ☰ Table + Inspect Token drawer, Perp Leaderboard 4 columns
// + Style filter + Trader Detail & Mirror drawer, Grok 3-tab intelligence rail, Settings 4 tabs. English LTR + Arabic RTL at
// 1440×900 and 1280×720: no page scroll, drawers above the corner banner, zero page errors; v15.1–v15.5 features still work.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8806, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv155s-'));
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
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V155S !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && !!document.getElementById('v155Ws'), null, { timeout: 60000 });
    await ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard')) x.remove(); });
    // a drawer must never sit under the corner banner pill
    const onTop = (sel) => ev((s) => { const bn = $('#banner'); bn.hidden = false; bn.textContent = 'Test banner'; const e = document.querySelector(s); if (!e) return 'missing ' + s; const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const okk = e.contains(t) || t === e; bn.hidden = true; return okk || (t ? (t.id || t.className) : 'none'); }, sel);

    // ── 1. Order Flow
    await ev(() => { setMode('crypto'); selectSym('BTC-USD'); showTab('desk'); P5UI.cfg().sec = 'dom'; TABS.desk.show(); }); await sleep(1500);
    ok('Order Flow: 2 columns — DOM ladder + tape-velocity bar on the left, tabbed card on the right', await ev(() => { const g = $('.v155-of'); return g && g.children.length === 2 && !!$('.v155-ofl .v155-tape') && !!$('.v155-ofl .p5-lad, .v155-ofl .empty') && $$('.v155-oft [data-v155of]').length === 3; }));
    ok('Order Flow: CVD & Absorption tab keeps the CVD canvas and footprint (existing ids)', await ev(() => !!$('[data-ofp="cvd"]:not([hidden]) #p5Cvd') && !!$('[data-ofp="cvd"] .p5-fp, [data-ofp="cvd"] .empty')));
    ok('Order Flow: DOM ladder click-to-trade buttons still render with their data hooks', await ev(() => $$('#p5Body [data-lad]').length > 0 || !!$('#p5Body .p5-lad') || /Loading the order book/.test($('#p5Body').textContent)));
    await page.click('[data-v155of="vwap"]'); await sleep(400);
    ok('Order Flow: Anchored VWAP & VPVR tab shows POC, value area and AVWAP with a profile', await ev(() => /POC/.test($('[data-ofp="vwap"]').textContent) && /AVWAP/.test($('[data-ofp="vwap"]').textContent) && !!$('[data-ofp="vwap"] svg.v155-vp rect.poc') && ST.v155.ofTab === 'vwap'));
    await ev(() => setMode('stocks')); await sleep(1200); await ev(() => { showTab('desk'); TABS.desk.show(); }); await sleep(500);
    await page.click('[data-v155of="gamma"]'); await sleep(300);
    if (await ev(() => !!$('[data-v155of="loadchain"]'))) await page.click('[data-v155of="loadchain"]');
    ok('Order Flow: 0DTE Gamma Flip & Charm tab loads the chain → gamma flip, call / put walls, charm window, per-strike bars', await waitFor(() => { const t = ($('[data-ofp="gamma"]') || {}).textContent || ''; return /Call wall/.test(t) && /Charm window/.test(t) && document.querySelectorAll('[data-ofp="gamma"] svg rect').length > 4; }, null, 20000));

    // ── 2. DEX table + Inspect Token drawer
    await ev(() => { setMode('onchain'); }); await sleep(1500); await ev(() => showTab('heat')); await sleep(1500);
    if (await ev(() => (ST.radar || {}).view !== 'table')) await page.click('#rdBar [data-v="table"]');
    ok('DEX: ☰ Table view with 4 columns (Token / Pair · Price & 24h % · Safety Score · Signal)', await waitFor(() => $$('.v155-dex thead th').length === 4 && $$('.v155-dex tbody tr[data-v155tok]').length > 0, null, 30000), await ev(() => ({ v: (ST.radar || {}).view, h: ($('#rdBody') || {}).textContent })));
    ok('DEX: existing Tiles / Radar / Bubbles views are still offered', await ev(() => ['tiles', 'list', 'bubbles', 'table'].every((v) => $('#rdBar [data-v="' + v + '"]'))));
    await page.click('.v155-dex tbody tr[data-v155tok]'); await sleep(300);
    ok('DEX: a row click slides out Inspect Token with X-Ray, LP lock, gap-fill and lead-lag sections', await ev(() => { const d = $('#v155Drawer'); return d && !d.hidden && /Inspect Token/.test($('#v155DrTitle').textContent) && !!$('#v155Drawer [data-v="xray"]') && !!$('#v155Drawer [data-v="gap"]') && !!$('#v155Drawer [data-v="lag"]') && /LP Lock/.test(d.textContent); }));
    await page.click('#v155Drawer [data-v="xray"]'); await sleep(400);
    ok('DEX drawer: Holder Cluster X-Ray renders inside the drawer (Pro Tools logic reused)', await ev(() => /Coordinated share/.test(($('#v155Drawer #v154XrOut') || {}).textContent || '')));
    ok('DEX drawer: sits above the corner banner — the close button is clickable', (await onTop('#v155Drawer .v155-dh .x')) === true);
    await page.keyboard.press('Escape'); ok('DEX drawer: Esc closes it', await ev(() => $('#v155Drawer').hidden));

    // ── 3. Perp Leaderboard
    await ev(() => { setMode('crypto'); showTab('social'); LeaderUI.showPerp(true); }); await waitFor(() => $$('#lbPerp tr.lb-row').length > 5, null, 20000);
    ok('Leaderboard: 4 visible columns — Rank & Wallet · Alpha · ROI % / Net PnL $ · Open Positions', await ev(() => { const th = [...document.querySelectorAll('#lbPerp table.lb-t > tbody > tr:first-child > th')].filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.textContent.trim()); return th.length === 4 && th[0] === I18N.t('v155.lb.rank') && th[3] === I18N.t('v155.lb.open'); }));
    ok('Leaderboard: one filter strip — timeframe, Alpha/PnL/ROI, Style, Anti-Rug, chart heatmap', await ev(() => { const ph = $('#lbPerp .panel > .ph'); return !!(ph.querySelector('#lbWin') && ph.querySelector('#lbBy') && ph.querySelector('#v155LbStyle') && ph.querySelector('[data-lbc="antiRug"]') && ph.querySelector('[data-lbc="heat"]')); }));
    await page.selectOption('#v155LbStyle', 'Swing'); await sleep(300);
    ok('Leaderboard: Style filter shows only that style (saved)', await ev(() => { const vis = $$('#lbPerp tr.lb-row').filter((r) => !r.hidden); return vis.length > 0 && vis.every((r) => r.dataset.style === 'Swing') && ST.v155.lbStyle === 'Swing'; }));
    await page.selectOption('#v155LbStyle', 'all'); await sleep(300);
    const a1 = await ev(() => $('#lbPerp tr.lb-row [data-lb="expand"]').dataset.a);
    await page.click(`#lbPerp [data-lb="expand"][data-a="${a1}"]`); await waitFor(() => !!$('#lbPerp tr.lb-x .v155-dh'), null, 15000); await sleep(300);
    ok('Trader Detail & Mirror: slides out as a fixed right-hand drawer with the existing actions (Plot on Chart, Shadow Mirror, Track, Backtest Style)', await ev(() => { const x = $('#lbPerp tr.lb-x'), hit = document.elementFromPoint(innerWidth - 60, 30); return getComputedStyle(x).position === 'fixed' && x.contains(hit) && !!x.querySelector('[data-lb="mirror"]') && !!x.querySelector('[data-lb="track"]') && !!x.querySelector('[data-lb="backtest"]') && /Liquidation Magnet/.test(x.textContent) && /Exit Alerts/.test(x.textContent); }), await ev(() => { const x = $('#lbPerp tr.lb-x'), h = document.elementFromPoint(innerWidth - 60, 30); return JSON.stringify({ pos: x && getComputedStyle(x).position, hit: h && (h.id || h.tagName + '.' + h.className), m: x && !!x.querySelector('[data-lb="mirror"]'), t: x && x.textContent.slice(0, 160) }); }));
    ok('Trader drawer: above the corner banner', (await onTop('#lbPerp tr.lb-x .v155-dh .x')) === true);
    const a2 = await ev(() => $$('#lbPerp tr.lb-row [data-lb="expand"]')[1].dataset.a);
    await page.locator(`#lbPerp tr.lb-row [data-lb="expand"][data-a="${a2}"]`).dispatchEvent('click'); await waitFor(() => !!$('#lbPerp tr.lb-x .v155-dh'), null, 15000); await sleep(300); // the open drawer covers the row
    ok('Trader drawer: one at a time', await ev((a) => $$('#lbPerp tr.lb-x').length === 1 && LeaderUI.open.has(a), a2));
    await page.click('#lbPerp tr.lb-x [data-lb="mirror"]'); await sleep(200);
    ok('Trader drawer: Shadow Mirror still toggles through the existing handler', await ev((a) => LeaderUI.cfg().mirror.includes(a), a2));
    await page.click('#lbPerp tr.lb-x .v155-dh .x'); await sleep(300); ok('Trader drawer: × closes it', await ev(() => !$('#lbPerp tr.lb-x')));

    // ── 4. Grok intelligence rail
    await ev(() => showTab('grok')); await waitFor(() => !!$('.v155-ir'), null, 10000);
    ok('Grok: 3-tab intelligence rail (Grok Bot · 3-Agent Copilot · Macro Shield) beside the console', await ev(() => $$('.v155-ir [data-v155ir]').length === 3 && !!$('.v155-gkwrap .gk-grid #gkConsole')));
    ok('Grok rail: 24/7 bots, Copilot Bridge and Macro Shield panels moved in (same ids, same handlers)', await ev(() => !!$('.v155-ir [data-irp="grok"] #gkBots') && !!$('.v155-ir [data-irp="copilot"] #gkBridge') && !!$('.v155-ir [data-irp="macro"] #gkShield')));
    ok('Grok rail: plain-English starter chips, active-rule cards and a human-readable Drawdown Cool-Off pill', await ev(() => $$('.v155-ir [data-v155gq]').length >= 4 && /Drawdown Cool-Off/.test($('.v155-ir').textContent) && /(Off|Normal size|Half size|paused)/.test($('.v155-ir .v155-pill').textContent)));
    const logN = await ev(() => Grok.log.length);
    await page.click('.v155-ir [data-v155gq]'); ok('Grok rail: a starter chip runs in the Grok console', await waitFor((n) => Grok.log.length > n, logN, 15000));
    await waitFor(() => !!$('.v155-ir'), null, 5000);
    await page.click('.v155-ir [data-v155ir="macro"]'); await sleep(150);
    ok('Grok rail: tabs switch and remember the choice', await ev(() => !$('.v155-ir [data-irp="macro"]').hidden && $('.v155-ir [data-irp="grok"]').hidden && ST.v155.irTab === 'macro'));
    await page.click('.v155-ir [data-v155ir="grok"]'); await page.click('.v155-ir [data-v155ir-act="cool"]'); await sleep(150);
    ok('Grok rail: Cool-Off pill toggles the bot drawdown throttle', await ev(() => V154UpUI.cfg().throttle === true && /(Normal size|Half size|paused)/.test($('.v155-ir .v155-pill').textContent)));

    // ── 5. Settings tabs
    await ev(() => showTab('set')); await sleep(600);
    ok('Settings: 4 tabs (General & Language · Chart & Hotkeys · Execution & Webhooks · Security & Vault), nothing left outside them', await ev(() => $$('#setBody > .v155-stabs [data-v155st]').length === 4 && $$('#setBody > .v155-sg').length === 4 && [...document.querySelectorAll('#setBody > *')].every((c) => c.matches('.v155-stabs, .v155-sg'))));
    ok('Settings: controls sit in the right tab', await ev(() => !!$('.v155-sg[data-sg="gen"] #seSrc') && !!$('.v155-sg[data-sg="exec"] #seFee') && !!$('.v155-sg[data-sg="sec"] #seKeyMode') && !!$('.v155-sg[data-sg="chart"]').textContent.match(/Keyboard shortcuts/)));
    await page.click('#setBody [data-v155st="exec"]'); await page.fill('#seFee', '0.07'); await page.click('#seSave'); await sleep(200);
    ok('Settings: existing Save still works from inside its tab', await ev(() => ST.settings.fee === 0.07 && !$('.v155-sg[data-sg="exec"]').hidden));
    await ev(() => renderSettings()); await sleep(200);
    ok('Settings: re-render keeps the 4-tab layout and the open tab', await ev(() => $$('#setBody > .v155-sg').length === 4 && !$('.v155-sg[data-sg="exec"]').hidden));

    // ── layout across sizes and languages
    for (const [w, h] of [[1440, 900], [1280, 720]]) for (const lang of ['en', 'ar']) {
      await page.setViewportSize({ width: w, height: h }); await ev((l) => I18N.set(l), lang); await sleep(250);
      const L = await ev(async () => { const out = {}; for (const t of ['desk', 'heat', 'social', 'grok', 'set']) { showTab(t); await new Promise((r) => setTimeout(r, 350)); out[t] = document.documentElement.scrollWidth <= innerWidth; } return out; });
      ok(`layout ${w}×${h} ${lang.toUpperCase()}: all 5 restructured screens without horizontal page scroll`, Object.values(L).every(Boolean), JSON.stringify(L));
    }
    ok('RTL: Settings tabs and rail labels are translated', await ev(() => $('#setBody [data-v155st="sec"]').textContent.trim() === I18N.tr('ar', 'v155.st.sec')));
    await ev(() => I18N.set('en')); await page.setViewportSize({ width: 1440, height: 900 });

    // ── v15.1–v15.5 regressions
    await ev(() => showTab('markets')); await sleep(300); await page.mouse.click(700, 500);
    await page.keyboard.press('Control+k'); await sleep(150);
    ok('regression: Ctrl+K palette still opens', await ev(() => $('#palette').classList.contains('on'))); await page.keyboard.press('Escape');
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(150); const simple = await ev(() => document.body.classList.contains('v155-simple')); await page.click('#v155Ws [data-ws="pro"]');
    ok('regression: Simple | Pro still switches', simple && await ev(() => !document.body.classList.contains('v155-simple')));
    await ev(() => { showTab('bots'); $('#btRun').click(); });
    ok('regression: Bot Net Profit $ card still renders on a backtest', await waitFor(() => !!$('#v155HeroBt') && /\$/.test($('#v155HeroBtNet').textContent), null, 60000));
    await ev(() => LearnUI.open()); ok('regression: Learn ExTerm still opens', await ev(() => !$('#learnOv').hidden)); await ev(() => LearnUI.close());
    ok('strict CSP and no inline handlers anywhere in the DOM', await ev(() => /default-src 'none'/.test($('meta[http-equiv="Content-Security-Policy"]').content) && ![...document.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^on/i.test(a.name)))));
    ok('zero page errors, dialogs or CSP violations', !errs.length, errs.slice(0, 4).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${res.length - f}/${res.length} passed`);
  process.exit(f ? 1 : 0);
})();
