// ExTerm v15.6 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL): tonal obsidian surfaces, strict 3-size type
// scale, 1-word nav, 44px watchlist sparklines, 4px scrollbars, chart-first ambient dimming, hover-only row actions, ONE
// right-hand inspector rail (DEX Token Audit · Whale Trader Detail · 0DTE strike Greeks replace each other), DEX shorthand
// price + sparkline + one badge, leaderboard shorthand $, O(1) latest-bar indicators == full recompute in the live chart,
// quant worker (walk-forward + Monte Carlo off-thread), windowed 1,500-row trade log; zero page errors / CSP violations;
// v15.1–v15.5 features (Ctrl+K, Simple | Pro, Quant Lab wizard + Bot Net Profit hero, Learn ExTerm) still work.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8807, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv156-'));
const SHOTS = process.env.EXTERM_SHOTS || ''; // optional: directory for the README screenshots
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const shot = async (name) => { if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(SHOTS, name) }); } };
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V156UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && document.body.classList.contains('v156'), null, { timeout: 60000 });
    await ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard')) x.remove(); });
    await sleep(2500);

    // ── 1. tonal obsidian surfaces + 3-size type scale + layout
    ok('surfaces: #0B0E14 canvas → #111620 panels → #181F2E cards, panel borders dropped', await ev(() => { const bg = getComputedStyle(document.body).backgroundColor, p = getComputedStyle($('#tab-markets .panel')), k = $('.wl-row.on'); return bg === 'rgb(11, 14, 20)' && p.backgroundColor === 'rgb(17, 22, 32)' && /rgba\(0, 0, 0, 0\)|transparent/.test(p.borderTopColor) && (!k || getComputedStyle(k).backgroundColor === 'rgb(24, 31, 46)'); }), await ev(() => getComputedStyle(document.body).backgroundColor + ' ' + getComputedStyle($('#tab-markets .panel')).backgroundColor));
    const scale = await ev(() => { const bad = {}; for (const e of document.querySelectorAll('#tab-markets *, #nav button, #nav button *')) { if (!e.offsetParent || e.closest('[aria-hidden="true"], .ni, svg, canvas') || getComputedStyle(e).fontSize === '0px' /* icon-only, text hidden */ || getComputedStyle(e).fontSize === '0px' /* icon-only, text hidden */ || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue; const f = getComputedStyle(e).fontSize; if (!['11px', '13px', '18px'].includes(f)) bad[f + ' ' + e.tagName + '.' + String(e.className).slice(0, 24)] = 1; } return Object.keys(bad); });
    ok('type scale: every visible text in Markets + nav is 18px, 13px or 11px', scale.length === 0, scale.join(' | '));
    const layout = () => ev(() => { const r = (s) => { const e = $(s); return e ? e.getBoundingClientRect() : null; }, cols = [...document.querySelectorAll('#tab-markets .mk > *')].map((e) => e.getBoundingClientRect()).filter((x) => x.width > 0);
      const ov = cols.some((a, i) => cols.some((b2, j) => j > i && a.left < b2.right - 1 && b2.left < a.right - 1 && a.top < b2.bottom - 1 && b2.top < a.bottom - 1));
      const tb = $('#tab-markets .toolbar'), tops = new Set([...tb.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().top / 8)));
      return { sw: document.documentElement.scrollWidth, w: innerWidth, ov, tb: tops.size, chart: r('#chartHost') && Math.round(r('#chartHost').width) }; });
    { const L = await layout(); ok('layout 1440×900 EN: no horizontal scroll, the 3 market columns never overlap, toolbar stays one row', L.sw <= L.w && !L.ov && L.tb === 1 && L.chart > 700, JSON.stringify(L)); }

    // ── 2. 1-word nav
    const NAVW = { markets: 'Markets', desk: 'Flow', heat: 'DEX', whales: 'Whales', lab: 'Lab', grok: 'Grok', journal: 'Journal', btnLearn: 'Learn' };
    const navTxt = await ev((W) => Object.keys(W).map((k) => { const b = $(`#nav button[data-tab="${k}"]`) || $('#' + k); return b ? [...b.querySelectorAll(':scope > span, :scope > .v156-nl')].filter((s) => getComputedStyle(s).display !== 'none' && !s.matches('.ni, .nbadge, [aria-hidden="true"]')).map((s) => s.textContent.trim()).join(' ') : 'missing ' + k; }), NAVW);
    ok('nav: 1-word tabs — Markets · Flow · DEX · Whales · Lab · Grok · Journal · Learn', navTxt.join() === Object.values(NAVW).join(), navTxt.join());
    ok('nav: the full label stays in the tooltip (Pro Desk, Heat Map, Wallet Tracker)', await ev(() => $('#nav button[data-tab="desk"]').title === 'Pro Desk' && /Heat/.test($('#nav button[data-tab="heat"]').title) && $('#nav button[data-tab="whales"]').title.length > 3));

    // ── 3. watchlist sparklines, 4px scrollbars, ambient dimming
    ok('watchlist: 44px sparkline column on every row, % column folded away, no overlap with the price', await ev(() => { const rows = $$('#watchList .wl-row[data-s]'); return rows.length > 3 && rows.every((r) => { const s = r.querySelector('.v156-spkbox'), p = s && s.nextElementSibling; if (!s || !p) return false; const a = s.getBoundingClientRect(), c = p.getBoundingClientRect(); return Math.round(a.width) === 44 && a.right <= c.left + 1 && getComputedStyle(r.children[3]).display === 'none'; }) && $$('#watchList .v156-spk').length > 0; }));
    // headless Chrome draws overlay (0px) scrollbars, so check the shipped rule rather than a measured width
    ok('scrollbars: 4px, transparent until the scroll area is hovered', await ev(() => { const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch (e) { return []; } }).join('\n'); return /body\.v156 ::-webkit-scrollbar \{[^}]*width: 4px; height: 4px/.test(css) && /body\.v156 :hover::-webkit-scrollbar-thumb/.test(css); }));
    if (SHOTS) { await ev(() => { const x = document.querySelector('#watchList .x[data-x="SOL-USD"]'); if (x) x.click(); }); await sleep(600); } // README images: no chain-token tickers
    await page.mouse.move(700, 450); await page.hover('#chartHost'); await sleep(450);
    const dim = await ev(() => [...document.querySelectorAll('#tab-markets .mk > *')].map((e) => [!!e.querySelector('#chartHost'), +getComputedStyle(e).opacity]));
    ok('ambient dimming: hovering the chart dims the side panels to 78% and keeps the chart at 100%', dim.every(([c, o]) => (c ? o === 1 : Math.abs(o - 0.78) < 0.01)), JSON.stringify(dim));
    await shot('v15.6-markets.png');
    await page.hover('#watchList'); await sleep(450);
    ok('ambient dimming: hovering a side panel snaps everything back to 100%', await ev(() => [...document.querySelectorAll('#tab-markets .mk > *')].every((e) => +getComputedStyle(e).opacity === 1)));

    // ── 4. O(1) latest-bar indicators in the live chart
    ok('engine: live ticks patch only the forming bar (no full recompute per tick)', await waitFor(() => V156UI.stats.patch > 0, null, 20000), await ev(() => JSON.stringify(V156UI.stats)));
    ok('engine: the patched EMA 20/50 · SMA 200 · BB · RSI · MACD equal a full recompute of the live series', await ev(() => { const c = chart.indicators(), cl = chart.data.map((k) => k.c), n = cl.length - 1, I = NT.ind, f = { e20: I.ema(cl, 20)[n], e50: I.ema(cl, 50)[n], s200: I.sma(cl, 200)[n], up: I.bb(cl, 20, 2).up[n], rsi: I.rsi(cl, 14)[n], h: I.macd(cl).hist[n] }, g = { e20: c.ema20[n], e50: c.ema50[n], s200: c.sma200[n], up: c.bb.up[n], rsi: c.rsi[n], h: c.macd.hist[n] }; return Object.keys(f).every((k) => (Number.isNaN(f[k]) && Number.isNaN(g[k])) || Math.abs(f[k] - g[k]) <= 1e-9 * Math.max(1, Math.abs(f[k]))); }));
    ok('engine: a symbol switch still rebuilds the indicators from scratch (history check)', await ev(async () => { const f0 = V156UI.stats.full; selectSym('ETH-USD'); await new Promise((r) => setTimeout(r, 2500)); const ok1 = V156UI.stats.full > f0 && Math.abs(chart.indicators().ema20[chart.data.length - 1] - NT.ind.ema(chart.data.map((k) => k.c), 20)[chart.data.length - 1]) < 1e-6 * chart.data[chart.data.length - 1].c; selectSym('BTC-USD'); return ok1; }));

    // ── 5. quant worker + windowed trade log
    ok('engine: walk-forward + 1,000-run Monte Carlo answer from the backtest Web Worker', await ev(async () => { if (!BTW.get()) return 'no worker'; const id = 'smacross', cs = chart.data.slice(); const r = await BTW.run({ type: 'quant', strat: id, candles: cs, grid: [NT.defaultParams(id)], wfo: { folds: 2, tfSec: 3600, fee: 0.001 }, o: { cash: 10000, fee: 0.001, slip: 0, tfSec: 3600 } }); return !!(r.wf && Array.isArray(r.wf.folds) && (r.mc === null || r.mc.runs === 1000)); }));
    ok('trade log: 1,500 trades scroll through a window (≤ 60 rows in the DOM), last trade reachable', await ev(async () => { const box = document.createElement('div'); box.className = 'scroll'; box.style.cssText = 'max-height:260px;overflow:auto;position:fixed;left:0;top:0;width:500px;scroll-behavior:auto'; box.innerHTML = '<table><thead><tr><th>#</th><th>Why</th></tr></thead><tbody></tbody></table>'; document.body.appendChild(box);
      const list = Array.from({ length: 1500 }, (_, i) => ({ i })); V156UI.virt(box, list, (t) => `<tr><td>${t.i}</td><td>row</td></tr>`); const n0 = box.querySelectorAll('tbody tr:not(.v156-pad)').length;
      box.scrollTop = box.scrollHeight; await new Promise((r) => setTimeout(r, 150)); const last = [...box.querySelectorAll('tbody tr:not(.v156-pad) td:first-child')].pop().textContent; const n1 = box.querySelectorAll('tbody tr:not(.v156-pad)').length; const info = JSON.stringify({ n0, n1, last, sh: box.scrollHeight, st: box.scrollTop, ch: box.clientHeight }); box.remove(); return n0 <= 60 && n1 <= 60 && last === '1499' ? true : info; }) === true, 'see next');

    // ── 6. inspector rail: 0DTE strike Greeks
    await ev(() => { setMode('stocks'); }); await sleep(1500); await ev(() => { showTab('desk'); P5UI.cfg().sec = 'dom'; TABS.desk.show(); }); await sleep(800);
    await page.click('[data-v155of="gamma"]'); await sleep(300);
    if (await ev(() => !!$('[data-v155of="loadchain"]'))) await page.click('[data-v155of="loadchain"]');
    await waitFor(() => document.querySelectorAll('[data-ofp="gamma"] rect[data-v156k]').length > 4, null, 20000);
    await ev(() => { const r = [...document.querySelectorAll('[data-ofp="gamma"] rect[data-v156k]')].sort((a, b) => b.getBBox().height - a.getBBox().height)[0]; r.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(400);
    ok('inspector: clicking a 0DTE strike opens the shared rail with call + put Delta, Gamma, Theta, Vega, IV, OI', await ev(() => { const d = $('#v155Drawer'); return d && !d.hidden && d.classList.contains('v156-insp') && /Greeks/.test($('#v155DrTitle').textContent) && ['Delta', 'Gamma', 'Theta', 'Vega', 'IV', 'Open interest'].every((w) => d.textContent.includes(w)) && /Call/.test(d.textContent) && /Put/.test(d.textContent); }), await ev(() => ($('#v155Drawer') || {}).textContent));
    await shot('v15.6-inspector.png');
    ok('inspector: right-hand rail, ≤ 520px, no NaN', await ev(() => { const r = $('#v155Drawer').getBoundingClientRect(); return Math.round(r.right) === innerWidth && r.width <= 521 && !/NaN|undefined/.test($('#v155Drawer').textContent); }));

    // ── 7. DEX: shorthand price + sparkline + one badge; Token Audit in the same rail
    await ev(() => { V155S.closeDr(); setMode('onchain'); }); await sleep(1500); await ev(() => showTab('heat')); await sleep(1500);
    if (await ev(() => (ST.radar || {}).view !== 'table')) await page.click('#rdBar [data-v="table"]');
    ok('DEX table: still 4 columns; price cell is a shorthand figure (exact value in the tooltip) + a 44px sparkline', await waitFor(() => { const r = document.querySelector('.v155-dex tbody tr[data-v155tok]'); if (!r || $$('.v155-dex thead th').length !== 4) return false; const p = r.children[1].querySelector('.v156-px'); return p && /^\$/.test(p.textContent) && /^\$[\d,.]+$/.test(p.title) && !!r.children[1].querySelector('.v156-spk'); }, null, 30000), await ev(() => ($('.v155-dex tbody tr') || {}).outerHTML));
    ok('DEX table: at most one badge per row', await ev(() => $$('.v155-dex tbody tr[data-v155tok]').every((r) => [...r.querySelectorAll('.tag, .safe-pill')].filter((t) => getComputedStyle(t).display !== 'none').length <= 1)));
    await page.click('.v155-dex tbody tr[data-v155tok]'); await sleep(400);
    ok('inspector: a DEX row replaces the strike Greeks with the Token Audit in the same rail', await ev(() => { const d = $('#v155Drawer'); return !d.hidden && /Inspect Token/.test($('#v155DrTitle').textContent) && d.classList.contains('v156-insp') && !!d.querySelector('[data-v="xray"]'); }));

    // ── 8. Perp Leaderboard: shorthand $, hover-only action, whole-row click → trader in the rail (closes the DEX audit)
    await ev(() => { setMode('crypto'); showTab('social'); LeaderUI.showPerp(true); }); await waitFor(() => $$('#lbPerp tr.lb-row').length > 5, null, 20000); await sleep(400);
    ok('leaderboard: large $ figures in shorthand with the exact amount in the tooltip', await ev(() => $$('#lbPerp tr.lb-row td').some((td) => /\$\d+(\.\d+)?[KMB]/.test(td.textContent) && /\$[\d,]+/.test(td.title || (td.querySelector('[title]') || {}).title || ''))));
    ok('leaderboard: at most one visible badge per row (Alpha pill)', await ev(() => $$('#lbPerp tr.lb-row').every((r) => [...r.querySelectorAll('.tag')].filter((t) => t.offsetParent && getComputedStyle(t).display !== 'none').length <= 1)));
    await page.mouse.move(5, 5); await sleep(250);
    ok('hover-only actions: the row ▸ action is hidden until that row is hovered', await ev(() => +getComputedStyle($('#lbPerp tr.lb-row [data-lb="expand"]')).opacity === 0));
    await page.hover('#lbPerp tr.lb-row:nth-of-type(3)'); await sleep(250);
    ok('hover-only actions: hovering the row reveals its action', await ev(() => +getComputedStyle($('#lbPerp tr.lb-row:nth-of-type(3) [data-lb="expand"]')).opacity === 1));
    await page.click('#lbPerp tr.lb-row:nth-of-type(3) td:nth-child(2)'); await waitFor(() => !!$('#lbPerp tr.lb-x .v155-dh'), null, 15000); await sleep(300);
    ok('inspector: a whole-row click opens Whale Trader Detail in the rail and closes the DEX audit (one inspector at a time)', await ev(() => { const x = $('#lbPerp tr.lb-x'); return !!x && x.classList.contains('v156-insp') && $('#v155Drawer').hidden && Math.round(x.getBoundingClientRect().right) === innerWidth && x.getBoundingClientRect().width <= 521 && !!x.querySelector('[data-lb="mirror"]'); }));
    await ev(() => V156UI.openInspector('Test', '<p>t</p>')); await sleep(400);
    ok('inspector: opening another inspector closes the trader drawer', await ev(() => !$('#lbPerp tr.lb-x') && LeaderUI.open.size === 0 && !$('#v155Drawer').hidden));
    await ev(() => V155S.closeDr());

    // ── 9. v15.1–v15.5 features still work
    await ev(() => showTab('markets')); await sleep(400);
    await page.keyboard.press('Control+k'); await sleep(250);
    ok('Ctrl+K command palette still opens and searches', await ev(() => $('#palette').classList.contains('on')) && (await page.fill('#palIn', 'ichimoku'), await sleep(200), await ev(() => palItems.some((x) => /Ichimoku/i.test(x.l)))));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(500);
    ok('Simple | Pro: Simple mode trims the nav and keeps the 1-word labels', await ev(() => document.body.classList.contains('v155-simple') && $('#nav button[data-tab="markets"] .v156-nl').textContent === 'Markets'));
    await shot('v15.6-simple-mode.png');
    await page.click('#v155Ws [data-ws="pro"]'); await sleep(400);
    await ev(() => { showTab('lab'); }); await sleep(600); if (await ev(() => !!$('#labNav button[data-v="q153"]'))) await page.click('#labNav button[data-v="q153"]'); await sleep(800);
    const hadStarter = await ev(() => !!$('#q153Base .v155-starter'));
    if (hadStarter) await page.click('#q153Base .v155-starter'); else await ev(() => V153UI.A.base());
    ok('Quant Lab: 4-step wizard + Bot Net Profit $ hero card render', await waitFor(() => $$('.v155-steps [data-step]').length === 4 && !!$('#v155HeroQ') && /\$/.test(($('#v155HeroQNet') || {}).textContent || ''), null, 40000));
    await ev(() => { const h = $('#v155HeroQ'); if (h) h.scrollIntoView({ block: 'start' }); }); await shot('v15.6-quant-lab.png');
    ok('Learn ExTerm still opens from the 1-word Learn tab', await ev(async () => { $('#btnLearn').click(); await new Promise((r) => setTimeout(r, 400)); const v = [...document.querySelectorAll('[id^="lx"], .lx-modal, .learn-modal, [class*="learn"]')].some((e) => e.offsetParent !== null && e.id !== 'btnLearn' && e.getBoundingClientRect().width > 300); LearnUI.close(); return v; }));

    // ── 10. Arabic RTL
    await ev(() => { showTab('markets'); I18N.set('ar'); }); await sleep(700);
    ok('RTL: Arabic mirrors the page and keeps the translated nav labels (no English 1-word override)', await ev(() => document.documentElement.dir === 'rtl' && !document.body.classList.contains('v156-short') && getComputedStyle($('#nav button[data-tab="markets"] .v156-nl')).display === 'none' && /[؀-ۿ]/.test($('#nav button[data-tab="markets"]').innerText)));
    { const L = await layout(); ok('layout 1440×900 AR: no horizontal scroll, columns never overlap, toolbar one row', L.sw <= L.w && !L.ov && L.tb === 1, JSON.stringify(L)); }
    await ev(() => V156UI.openInspector('اختبار', '<p>t</p>')); await sleep(400);
    ok('RTL: the inspector rail opens on the inline-end (left) edge', await ev(() => Math.round($('#v155Drawer').getBoundingClientRect().left) === 0));
    await ev(() => { V155S.closeDr(); I18N.set('en'); }); await sleep(300);

    if (SHOTS) { // README images for the v15.5 screen restructures (shipped in v15.6)
      await ev(() => { setMode('crypto'); selectSym('BTC-USD'); showTab('desk'); P5UI.cfg().sec = 'dom'; ST.v155.ofTab = 'cvd'; TABS.desk.show(); }); await sleep(2500); await shot('v15.5-order-flow.png');
      await ev(() => showTab('grok')); await sleep(1500); await shot('v15.5-grok-rail.png');
    }
    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  process.exit(fl ? 1 : 0);
})();
