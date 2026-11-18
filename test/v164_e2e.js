// ExTerm v16.4 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL):
// DEX Discovery strict market-mode isolation across Scanner / Tiles / Bubbles / Buy Pressure + Top Movers (Crypto, Stocks,
// On-chain), filter drawer + presets + pills + `/` search + keyboard navigation + Pin + basket export; ⚓ AVWAP tool and
// tape strip; zero flat zero-volume sub-minute bars; full-depth on-chain 4h / 1w; Copilot (chart reader, NL → Pine v5,
// 17-test validation, auditor, leak scan, Pine library); Strategy Studio Pro (drag-and-drop nodes, validate, backtest,
// replay on chart, depth slippage, stress, walk-forward decay, portfolio basket, bot export, router); zero errors.
// EXTERM_SHOTS=<dir> writes 01, 03, 04, 05, 06 (02 comes from the v16.3 live-cockpit suite).
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8824, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv164-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v16[01234] |^v163 cockpit|^v164/.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    const shot = async (name) => { if (!SHOTS) return; await clean(); await page.mouse.move(2, 896); await sleep(500); await page.screenshot({ path: path.join(SHOTS, name) }); };
    const tfClick = (t) => ev((t) => { const x = [...document.querySelectorAll('#tfBtns button')].find((y) => y.textContent.trim() === t); if (x) x.click(); }, t);
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V164UI !== 'undefined' && typeof V164 !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && chart.L.py, null, { timeout: 60000 });
    await clean();

    // ── 1. briefing + strategies
    await ev(() => V162UI.brief()); await sleep(200);
    ok('briefing: v16.4 Release Highlights listed and the modal fits 1440×900', await ev(() => { const m = $('#v162Brief'); return !!m && /v16\.[45] Release Highlights/.test(m.textContent) && /Discovery/.test(m.textContent) && m.querySelector('.v162-modal').getBoundingClientRect().bottom <= innerHeight; }));
    await page.keyboard.press('Escape'); await sleep(150);
    ok('pack 5: six structural strategies registered in the page', await ev(() => (NT.PACK5 || []).length === 6 && NT.PACK5.every((id) => NT.strategies[id] && NT.strategies[id].spec)));

    // ── 2. DEX Discovery: strict market-mode isolation
    const modeOf = (id) => (/^oc:/.test(id) ? 'onchain' : /^[A-Z0-9.]{1,6}$/.test(id) ? 'stocks' : /-(USD|USDT|USDC)$/i.test(id) ? 'crypto' : null);
    const iso = {};
    for (const m of ['crypto', 'stocks', 'onchain']) {
      await ev((m) => { setMode(m); showTab('heat'); }, m); await sleep(1500);
      const lab = { crypto: 'Crypto pairs only', stocks: 'US equities only', onchain: 'On-chain DEX tokens only' }[m];
      const okRows = await waitFor((lab) => ((document.querySelector('#v164Mode') || {}).textContent || '').startsWith(lab) && V164UI.view && V164UI.view.length > 2 && !!document.querySelector('#v164Main tr[data-v164id], #v164Main [data-v164id]'), lab, 30000);
      const ids = await ev(() => ({ rows: V164UI.rows.map((r) => r.id), dom: [...document.querySelectorAll('#v164Main [data-v164id], #v164Rail [data-v164id]')].map((x) => x.dataset.v164id), legacy: ST.heat.asset, label: $('#v164Mode').textContent }));
      iso[m] = ids; const bad = ids.rows.concat(ids.dom).filter((id) => modeOf(id) !== m);
      ok(`isolation · ${m}: Scanner + Top Movers show only ${m} markets (legacy heat views follow the pill)`, okRows && ids.rows.length > 2 && !bad.length && ids.legacy === m, JSON.stringify({ n: ids.rows.length, bad: bad.slice(0, 4), legacy: ids.legacy, label: ids.label }));
      for (const v of ['tiles', 'bubbles', 'pressure']) {
        await ev((v) => document.querySelector(`[data-v164v="${v}"]`).click(), v); await sleep(500);
        const r = await ev((v) => ({ dom: [...document.querySelectorAll('#v164Main [data-v164id]')].map((x) => x.dataset.v164id), cv: !!document.querySelector('#v164Main canvas.v164-bub'), note: ($('#v164Main .note') || {}).textContent || '' }), v);
        const leak = r.dom.filter((id) => modeOf(id) !== m);
        ok(`isolation · ${m} · ${v}: renders with zero cross-market bleed`, !leak.length && (v === 'bubbles' ? r.cv : v === 'pressure' ? r.dom.length > 0 || /No buyer/.test(r.note) : r.dom.length > 0), JSON.stringify({ n: r.dom.length, leak: leak.slice(0, 3) }));
      }
      await ev(() => document.querySelector('[data-v164v="scanner"]').click()); await sleep(300);
    }
    ok('isolation: the three datasets never overlap', !iso.crypto.rows.some((x) => iso.stocks.rows.includes(x) || iso.onchain.rows.includes(x)) && !iso.stocks.rows.some((x) => iso.onchain.rows.includes(x)));

    // on-chain filter drawer, presets, pills, search, keyboard, pin
    await ev(() => { setMode('onchain'); showTab('heat'); }); await sleep(1200);
    await ev(() => $('#v164FBtn').click()); await sleep(200);
    ok('filter drawer: chain + DEX pills, 8 min / max range rows and 4 safety toggles (on-chain)', await ev(() => { const f = $('#v164Filter'); return !f.hidden && f.querySelectorAll('[data-v164a="chain"]').length === 6 && f.querySelectorAll('[data-v164a="dex"]').length === 6 && f.querySelectorAll('.v164-fg label').length === 8 && f.querySelectorAll('.v164-tg input[type=checkbox]').length === 4; }));
    const n0 = await ev(() => V164UI.view.length);
    await ev(() => { const x = $('#v164Filter [data-v164f="liqMin"]'); x.value = '1e15'; $('#v164Filter [data-v164a="fapply"]').click(); }); await sleep(400);
    ok('filter drawer: an impossible min liquidity empties the view; Filters button shows the count', await ev(() => V164UI.view.length === 0 && /Filters \(1\)/.test($('#v164FBtn').textContent) && /No onchain markets match/.test($('#v164Main').textContent)));
    await ev(() => { $('#v164FBtn').click(); }); await sleep(150); await ev(() => $('#v164Filter [data-v164a="freset"]').click()); await sleep(400);
    ok('filter drawer: Reset restores the full view', await ev((n0) => V164UI.view.length === n0, n0));
    await ev(() => { const s = $('#v164Preset'); s.value = 'smartMoney'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
    ok('presets: Smart-Money Accumulation applies strict toggles + ranges', await ev(() => V164UI.cfg.filter.smart === true && V164UI.cfg.filter.liqMin === '50000'));
    await ev(() => { V164UI.cfg.filter = V164.FILTER_DEF(); V164UI.paintDex(true); }); await sleep(200);
    await ev(() => document.querySelector('[data-v164p="surges"]').click()); await sleep(250);
    ok('pills: Volume Surges keeps only > 3× RVOL rows', await ev(() => V164UI.view.every((r) => r.rvol >= 3)));
    await ev(() => document.querySelector('[data-v164p="all"]').click()); await sleep(250);
    await ev(() => { if (document.activeElement) document.activeElement.blur(); }); await page.keyboard.press('/'); await sleep(150);
    ok('`/` focuses the quick search', await ev(() => document.activeElement === $('#v164Q')));
    const first = await ev(() => V164UI.view[0].sym);
    await page.keyboard.type(first.slice(0, 3)); await sleep(400);
    ok('quick search filters the scanner', await ev((s) => V164UI.view.length >= 1 && V164UI.view.every((r) => (r.sym + ' ' + (r.name || '') + ' ' + r.id).toLowerCase().includes(s.slice(0, 3).toLowerCase())), first));
    await ev(() => { const q = $('#v164Q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
    await ev(() => $('#v164Main').focus()); await page.keyboard.press('ArrowDown'); await sleep(100);
    ok('keyboard: ArrowDown moves the selection', await ev(() => !!$('#v164Main tr.sel') && $('#v164Main tr.sel').dataset.v164id === V164UI.view[1].id));
    const pinId = await ev(() => V164UI.view[1].id); await page.keyboard.press('p'); await sleep(200);
    ok('keyboard: P pins the selected token to the watchlist', await ev((id) => ST.watch.includes(id), pinId));
    if (SHOTS) { await ev(() => { $('#v164FBtn').click(); }); await sleep(250); }
    // RTL on-chain scanner screenshot comes later; open chart with Enter
    await ev(() => { const f = $('#v164Filter'); if (!f.hidden) $('#v164FBtn').click(); $('#v164Main').focus(); }); await page.keyboard.press('Enter'); await sleep(900);
    ok('keyboard: Enter opens the selected token chart on Markets', await ev((id) => curTab === 'markets' && ST.sel === id, pinId));

    // ── 3. on-chain full depth: 4h + 1w dense, no flat zero-volume bars
    // deterministic history (live GeckoTerminal is rate-limited during test runs): what the fetch + aggregate path hands the chart
    const seedOc = (sec, n) => ev(({ sec, n }) => { const sym = ST.sel, now = Math.floor(Date.now() / 1000), t0 = Math.floor(now / sec) * sec - (n - 1) * sec; let p = 0.01; const rows = []; for (let i = 0; i < n; i++) { const o = p; p = p * (1 + Math.sin(i * 0.7) * 0.02 + Math.cos(i * 0.31) * 0.01); rows.push({ t: t0 + i * sec, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1000 + i }); } for (const k of [...History.cache.keys()]) if (k.startsWith(sym + '|' + sec)) History.cache.delete(k); History.cache.set(sym + '|' + sec, { rows, ts: Date.now(), full: true }); for (const k of [...Stores.keys()]) if (k === sym + '|' + { 14400: '4h', 604800: '1w', 86400: '1d' }[sec]) Stores.delete(k); }, { sec, n });
    // stub the raw pool history (deterministic, dense); v16.4 re-wraps it within 500 ms, so 1w really goes through fetch-daily → aggregate
    await ev(() => { const raw = async (sym, tf, n) => { const now = Math.floor(Date.now() / 1000), t0 = Math.floor(now / tf) * tf - ((n || 300) - 1) * tf; let p = 0.01; const rows = []; for (let i = 0; i < (n || 300); i++) { const o = p; p = p * (1 + Math.sin(i * 0.7) * 0.02 + Math.cos(i * 0.31) * 0.01); rows.push({ t: t0 + i * tf, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1000 + i }); } window.__ocCalls = (window.__ocCalls || []).concat([tf]); return rows; }; OC.history = raw; OC.candles = raw; for (const k of [...History.cache.keys()]) if (k.startsWith(ST.sel + '|')) History.cache.delete(k); for (const k of [...Stores.keys()]) if (k.startsWith(ST.sel + '|') && !/\|\d+s$/.test(k)) Stores.delete(k); });
    await waitFor(() => OC.history._v164 === true, null, 3000);
    await ev(() => showTab('markets')); await tfClick('4h'); await waitFor(() => ST.tf === '4h' && chart.data.length > 30, null, 30000); await sleep(500);
    const c4 = await ev(() => ({ n: chart.data.length, step: chart.data.length > 1 ? chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t : 0, flat: V164.flatZero(chart.data) }));
    ok('on-chain 4h: dense multi-bar history at the 4h step with no flat zero-volume bars', c4.n > 30 && c4.step === 14400 && c4.flat === 0, JSON.stringify(c4));
    await ev(() => { const m = document.querySelector('.v155-tfmore'); if (m) m.click(); }); await sleep(150); await tfClick('1w'); await waitFor(() => ST.tf === '1w' && chart.data.length >= 3, null, 30000); await sleep(500);
    const cw = await ev(() => ({ n: chart.data.length, step: chart.data.length > 1 ? chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t : 0 }));
    ok('on-chain 1w: weekly candles aggregated from daily (not hourly fallback)', cw.n >= 3 && cw.step >= 604800 && (await ev(() => (window.__ocCalls || []).includes(86400) && !(window.__ocCalls || []).includes(604800))), JSON.stringify(cw) + ' ' + JSON.stringify(await ev(() => { const s = getStore(ST.sel, ST.tf); return { sel: ST.sel, tf: ST.tf, err: String(s.err || ''), loaded: s.loaded, len: s.candles.length, tabs: curTab, btn: [...document.querySelectorAll('#tfBtns button')].map((x) => x.textContent.trim()).join(' ') }; })));
    await tfClick('1s'); await sleep(6000);
    const c1 = await ev(() => ({ n: chart.data.length, flat: V164.flatZero(chart.data.slice(1)) }));
    ok('on-chain 1s: zero-volume bars re-anchored (no flat Vol 0.00 bars)', c1.n > 3 && c1.flat === 0, JSON.stringify(c1));
    await ev(() => { showTab('markets'); setMode('stocks'); selectSym('NVDA'); }); await sleep(900); await tfClick('1s'); await sleep(6000);
    const cs = await ev(() => ({ n: chart.data.length, flat: V164.flatZero(chart.data.slice(1)) }));
    ok('stocks 1s: zero flat zero-volume bars', cs.n > 3 && cs.flat === 0, JSON.stringify(cs));

    // ── 4. chart: ⚓ AVWAP + tape strip
    await ev(() => { showTab('markets'); setMode('crypto'); selectSym('BTC-USD'); }); await sleep(900); await tfClick('5m'); await waitFor(() => chart.data.length > 50 && chart.L && chart.L.D, null, 15000); await sleep(800);
    ok('⚓ AVWAP tool on the chart toolbar with click / session / swing anchors', await ev(() => { $('#v164AvBtn').click(); const m = $('#v164AvMenu'); const ok2 = !!m && ['pick', 'session', 'swingL', 'swingH', 'off'].every((k) => !!m.querySelector(`[data-av="${k}"]`)); return ok2; }));
    await ev(() => $('#v164AvMenu [data-av="session"]').click()); await sleep(300);
    const avTxt = await ev(() => { const txt = []; const g = chart.cv.getContext('2d'); const spy = new Proxy(g, { get(t, k) { if (k === 'fillText') return (s, ...a) => { txt.push(String(s)); return t.fillText(s, ...a); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; }, set(t, k, v) { t[k] = v; return true; } }); V164UI.overlay(spy, chart.L, chart); return txt; });
    ok('AVWAP drawn from the session anchor + tape-delta strip on the chart', avTxt.some((t) => /^AVWAP · Session /.test(t)) && avTxt.some((t) => /^Tape 10s .*60s/.test(t)), avTxt.join(' | ') + ' ' + JSON.stringify(await ev(() => ({ sel: ST.sel, av: V164UI.av, menu: !!document.querySelector('#v164AvMenu'), n: chart.data.length, LD: chart.L && chart.L.D && chart.L.D.length, end: chart.L && chart.L.end, bars: chart.L && chart.L.bars }))));
    const pk = await ev(() => { $('#v164AvBtn').click(); $('#v164AvMenu [data-av="pick"]').click(); const r = chart.cv.getBoundingClientRect(), L = chart.L; return { x: r.left + L.Lm + (L.W - L.Lm - L.Rm) * 0.4, y: r.top + L.y0 + L.mainH * 0.5 }; });
    await page.mouse.click(pk.x, pk.y); await sleep(200);
    ok('AVWAP click-to-anchor sets the anchor at the clicked candle', await ev(() => !!V164UI.av['BTC-USD'] && V164UI.av['BTC-USD'].kind === 'Anchor' && chart.cv.style.cursor === '' && V164UI.pick === false));
    if (SHOTS) {
      await ev(() => { const e = document.querySelector('#indBtns button[data-i="ema"], #indBtns button[data-k="ema"]') || [...document.querySelectorAll('#indBtns button')].find((x) => /EMA/i.test(x.textContent)); if (e && !e.classList.contains('on')) e.click(); const p = px('BTC-USD'); if (!ACC.pos['BTC-USD']) ACC.buy('BTC-USD', p, 2500, Date.now(), { slPct: 0.01, tpPct: 0.02, src: 'manual' }); ChartTrade.changed(); $('#v164AvBtn').click(); $('#v164AvMenu [data-av="session"]').click(); });
      await sleep(1500); await shot('01-markets-live-execution.png');
    }

    // ── 5. Copilot
    await ev(() => showTab('ai')); await sleep(800);
    ok('Copilot: panel with 7 action pills, NL box and the Pine library', await waitFor(() => !!$('#v164Cop') && $$('#v164Cop .v164-acts [data-v164c]').length >= 7 && !!$('#v164Nl') && !!$('#v164PineSrc'), null, 6000));
    await ev(() => $('#v164Cop [data-v164c="analyze"]').click()); await sleep(300);
    ok('Analyze Active Chart: structure, levels, regime and 1.5 ATR read locally', await ev(() => /ATR/.test($('#v164CopOut').textContent) && /Regime/.test($('#v164CopOut').textContent)));
    await ev(() => $('#v164Cop [data-v164c="audit"]').click()); await sleep(300);
    ok('Pre-Trade Setup & Stop-Loss Auditor reports on the ticket', await ev(() => /Pre-trade audit/.test($('#v164CopOut').textContent) && $$('#v164CopOut li').length >= 1));
    await ev(() => $('#v164Cop [data-v164c="leaks"]').click()); await sleep(200);
    ok('Ledger leak detector runs on the Signed Receipt Ledger', await ev(() => /receipt/.test($('#v164CopOut').textContent)));
    await ev(() => { $('#v164Nl').value = 'Buy when RSI 14 is below 35 and price is above the EMA 50, exit when price crosses below the EMA 20, stop 2.5%, target 5%'; $('#v164Cop [data-v164c="nl"]').click(); }); await sleep(300);
    ok('Natural language → safe strategy + Pine Script v5', await ev(() => /\/\/@version=5/.test($('#v164CopOut').textContent) && /strategy\.exit|strategy\.close|stop/i.test($('#v164CopOut').textContent)));
    await ev(() => $('#v164CopOut [data-v164c="validate"]').click());
    ok('Copilot: 17-test validation grades the generated strategy', await waitFor(() => /tests passed/.test(($('#v164CopOut') || {}).textContent || ''), null, 90000), await ev(() => $('#v164CopOut').textContent.slice(0, 200)));
    ok('Pine library: every safety rule ticked for the selected template', await ev(() => { const s = $('#v164PineSel'); s.value = 'sweep'; s.dispatchEvent(new Event('change', { bubbles: true })); return $$('#v164PineChk .bad').length === 0 && $$('#v164PineChk .ok').length === 7 && /barstate\.isconfirmed/.test($('#v164PineSrc').textContent); }));
    if (SHOTS) { await ev(() => { $('#v164Cop .v164-lib').open = true; $('#v164Cop').scrollIntoView({ block: 'start' }); }); await sleep(400); await shot('05-copilot-pine-bridge.png'); }
    await ev(() => $('#v164CopOut [data-v164c="studio"]').click()); await sleep(1200);

    // ── 6. Strategy Studio Pro
    ok('Studio: opens in the Lab with the Copilot strategy selected', await waitFor(() => { const s = $('#v164Studio'); return !!s && s.open && $('#v164Strat').value === '__copilot'; }, null, 6000));
    await ev(() => { const s = $('#v164Strat'); s.value = '__nodes'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await ev(() => { $('#v164Pal [data-chip="3"]').click(); }); // click adds to Entry
    const dropped = await ev(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'chip:4'); const z = document.querySelector('[data-zone="exit"]'); z.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); z.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); return V164UI.nodes.map((n) => n.parent + ':' + n.label); });
    ok('node builder: click-to-add and drag-and-drop place Entry / Exit nodes', dropped.includes('entry:Close ↗ EMA 20') && dropped.includes('exit:Close ↘ EMA 20'), dropped.join());
    await ev(() => $('#v164Studio [data-v164x="validate"]').click());
    ok('Studio: node strategy passes through the 17-test validation gate', await waitFor(() => /tests passed/.test(($('#v164Res') || {}).textContent || ''), null, 90000), await ev(() => $('#v164Res').textContent.slice(0, 200)));
    await ev(() => $('#v164Studio [data-v164x="bt"]').click());
    ok('Studio: backtest result table', await waitFor(() => /Return/.test(($('#v164Res') || {}).textContent || '') && !!$('#v164Res table'), null, 30000));
    for (const [k, rx] of [['depth', /square-root market impact/], ['stress', /Flash Crash/], ['decay', /Walk-forward rolling out-of-sample decay/], ['portfolio', /Equal-weight portfolio/], ['bots', /Shadow Drift Monitor[\s\S]*Regime-Aware[\s\S]*Multi-Slot Strategy Router/]]) {
      await ev((k) => document.querySelector(`#v164Studio [data-v164r="${k}"]`).click(), k);
      ok(`Studio research · ${k}`, await waitFor((rx) => new RegExp(rx).test(($('#v164Res') || {}).textContent || ''), rx.source, 60000), await ev(() => $('#v164Res').textContent.slice(0, 160)));
      if (k === 'decay' && SHOTS) { await ev(() => $('#v164Studio').scrollIntoView({ block: 'start' })); await sleep(400); await shot('04-quant-lab-validation.png'); }
    }
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), ev(() => $('#v164Studio [data-v164x="py"]').click())]);
    ok('Export Strategy → standalone Python bot download', !!dl && dl.suggestedFilename() === 'exterm_bot.py');
    await ev(() => $('#v164Studio [data-v164x="replay"]').click()); await sleep(2500);
    ok('Backtest Trade Replay on Chart: markers on the active chart', await ev(() => curTab === 'markets' && V164UI.markers.sym === ST.sel && V164UI.markers.list.length > 0));

    // ── 7. basket export from the DEX tab
    await ev(() => { setMode('crypto'); showTab('heat'); }); await sleep(1500); await waitFor(() => V164UI.view.length > 2, null, 20000);
    await ev(() => $('#v164Dex [data-v164a="basket"]').click());
    ok('Export Filtered Basket → Quant Lab portfolio backtest (≤ 10, mode-pure)', await waitFor(() => curTab === 'lab' && V164UI.basket && V164UI.basket.n > 0 && V164UI.basket.n <= 10 && V164UI.basket.symbols.every((s) => /-USD$/.test(s)) && /Equal-weight portfolio/.test(($('#v164Res') || {}).textContent || ''), null, 60000));
    if (SHOTS) { await ev(() => { setMode('crypto'); showTab('heat'); }); await sleep(1200); await ev(() => document.querySelector('[data-v164v="bubbles"]').click()); await sleep(900); await ev(() => $('#v164Dex').scrollIntoView({ block: 'start' })); await shot('03-dex-discovery-3d-structure.png'); await ev(() => document.querySelector('[data-v164v="scanner"]').click()); }

    // ── 8. Arabic (RTL): on-chain scanner
    await ev(() => { setMode('onchain'); showTab('heat'); I18N.set('ar'); }); await sleep(1500);
    await ev(() => { if ($('#v164Filter').hidden) $('#v164FBtn').click(); }); await sleep(300);
    const rtl = await ev(() => { const d = $('#v164Dex').getBoundingClientRect(), f = $('#v164Filter').getBoundingClientRect(); return { dir: document.documentElement.dir, inView: d.left >= 0 && d.right <= innerWidth + 1 && f.right <= innerWidth + 1, scroll: document.documentElement.scrollWidth <= innerWidth, rows: V164UI.view.length, leak: V164UI.view.filter((r) => !/^oc:/.test(r.id)).length }; });
    ok('RTL: on-chain Discovery + filter drawer mirror inside the viewport, still on-chain only', rtl.dir === 'rtl' && rtl.inView && rtl.scroll && rtl.rows > 0 && rtl.leak === 0, JSON.stringify(rtl));
    if (SHOTS) { await ev(() => $('#v164Dex').scrollIntoView({ block: 'start' })); await shot('06-onchain-scanner-rtl.png'); }
    await ev(() => { $('#v164FBtn').click(); I18N.set('en'); }); await sleep(300);

    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
