// ExTerm v16.6 browser end-to-end against serve.py (1440×900, offline launcher, no outside network):
// Live Transactions drawer for Stocks, Crypto and On-Chain / DEX: drawer opens, 22 pooled rows render, all 8 sub-tabs switch,
// every filter chip + min-USD toggles and matches the core filter, market rings stay isolated, hover auto-pause (gold Paused
// pill, frozen snapshot), manual Pause / Live, click-to-pin gold chart marker, Copy Tape for AI → AI Bridge, LAST SESSION TAPE
// for a closed stock market (stubbed Yahoo payload through the page's own proxy client), per-frame cost, zero page / console errors.
// EXTERM_E2E_PORT overrides the port.
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = +process.env.EXTERM_E2E_PORT || 8826, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv166-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push('PAGE ' + e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(t)) || /^v166/.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V166UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && !!document.querySelector('#v166Btn') && !!document.querySelector('#v166Tape'), null, { timeout: 60000 });
    await clean();
    await ev(() => V162UI.brief()); await sleep(200);
    ok('briefing: v16.6 Release Highlights (tape drawer) fit 1440×900', await ev(() => { const m = $('#v162Brief'); return !!m && /v16\.6 Release Highlights/.test(m.textContent) && /Live Transactions drawer/.test(m.textContent) && m.querySelector('.v162-modal').getBoundingClientRect().bottom <= innerHeight; }));
    await page.keyboard.press('Escape'); await sleep(150); await clean();

    // seeded prints (deterministic) on top of whatever the offline demo feeds stream in
    const seed = (sym) => ev((sym) => { const now = Date.now(), p = px(sym) || 10, out = []; const add = (dt, k, usd, side, who) => out.push(V166UI.ingest(sym, p * k, usd / (p * k), side, now - dt, { who })); for (let i = 0; i < 40; i++) add(60000 - i * 900, 1 + (i % 5) * 0.0002, 200 + (i % 7) * 90, i % 3 ? 'buy' : 'sell', 'Venue' + (i % 4)); add(9000, 1.001, 30000, 'buy', 'WhaleA'); add(8000, 0.999, 140000, 'sell', 'BlockB'); add(3000, 1.0, 500, 'buy', 'Sweeper'); add(2800, 1.0001, 500, 'buy', 'Sweeper'); add(2600, 1.0002, 500, 'buy', 'Sweeper'); return out.every((s) => s >= 0); }, sym);
    const markets = [['crypto', 'BTC-USD'], ['stocks', 'AAPL'], ['onchain', null]];
    ok('Live Transactions drawer is open by default on Markets (~230px) above the bottom telemetry dock', await waitFor(() => !$('#v166Tape').hidden && $('#v166Btn').classList.contains('on') && Math.abs($('#v166Tape').getBoundingClientRect().height - 230) < 4 && !!$('#v166Dock #posStrip') && $('#v166Dock').getBoundingClientRect().bottom <= innerHeight, null, 5000));
    const syms = {};
    for (const [mk, sym] of markets) {
      await ev(([mk, sym]) => { showTab('markets'); if (ST.mode !== mk) setMode(mk, sym || undefined); else if (sym && ST.sel !== sym) selectSym(sym); }, [mk, sym]);
      const ready = await waitFor((mk) => V166.marketOf(ST.sel) === mk && V166UI.sym === ST.sel, mk, 30000); // the drawer does not need candle history
      const s = await ev(() => ST.sel); syms[mk] = s; await clean();
      ok(`${mk}: market switched (${s})`, ready, s);
      ok(`${mk}: seeded prints accepted`, await seed(s));
      const rows = await waitFor(() => { const v = [...document.querySelectorAll('#v166Body .v166-r')].filter((r) => !r.hidden); return V166UI.sym === ST.sel && V166UI.cnt >= 45 && v.length === 22; }, null, 8000);
      await waitFor((mk) => $('#v166Buy').textContent !== '–' && V166UI.sym === ST.sel && (mk !== 'stocks' || /TAPE/.test($('#v166Sess').textContent)) && !(mk === 'stocks' && /24\/7/.test($('#v166Sess').textContent)), mk, 3000);
      const shape = await ev(() => ({ pool: document.querySelectorAll('#v166Body .v166-r').length, head: [...document.querySelectorAll('.v166-head span')].map((x) => x.textContent), first: [...document.querySelector('#v166Body .v166-r:not([hidden])').children].map((x) => x.textContent), gold: [...document.querySelectorAll('#v166Body .v166-r.gold')].length, strip: $('#v166Buy').textContent, sess: $('#v166Sess').textContent }));
      ok(`${mk}: drawer renders exactly 22 pooled rows with Age / Type / Price / Amount / Total USD / Venue / Tags`, rows && shape.pool === 22 && shape.head.length === 7 && shape.head[0] === 'Age' && shape.head[6] === 'Signal Tags' && shape.first.length === 7 && /\d+[smhd]/.test(shape.first[0]), JSON.stringify(shape));
      ok(`${mk}: pressure strip shows buy % + $ and a session label`, /%\s·\s\$/.test(shape.strip) && (mk !== 'stocks' || /TAPE/.test(shape.sess)) && (mk !== 'crypto' || /LIVE 24\/7/.test(shape.sess)) && (mk !== 'onchain' || /DEX SWAPS/.test(shape.sess)), JSON.stringify(shape));
      // 8 sub-tabs
      const tabs = [];
      for (const k of ['positions', 'holders', 'top', 'early', 'tracking', 'dca', 'orders', 'trades']) {
        await ev((k) => document.querySelector(`[data-v166t="${k}"]`).click(), k); await sleep(k === 'trades' ? 150 : 1150);
        tabs.push(await ev((k) => ({ k, sel: document.querySelector(`[data-v166t="${k}"]`).getAttribute('aria-selected') === 'true', list: !$('#v166List').hidden, alt: !$('#v166Alt').hidden, tbl: !!$('#v166Alt table'), txt: $('#v166Alt').textContent.slice(0, 60) }), k));
      }
      ok(`${mk}: all 8 sub-tabs switch (Trades list ↔ table views)`, tabs.length === 8 && tabs.every((t) => t.sel && (t.k === 'trades' ? t.list && !t.alt : !t.list && t.alt && t.tbl)), JSON.stringify(tabs.filter((t) => !(t.sel && (t.k === 'trades' ? t.list && !t.alt : !t.list && t.alt && t.tbl)))));
      // chips + min USD
      const chips = await ev(async () => {
        const out = [], r = V166UI.E.ring(ST.sel), tmp = new Uint32Array(V166.CAP), tr = V166UI.E.mk(ST.sel).tracked;
        V166UI.manual = true; // freeze ingestion so counts are comparable
        for (const c of V166.CHIPS) { document.querySelector(`[data-v166f="${c[0]}"]`).click(); out.push({ c: c[0], on: document.querySelector(`[data-v166f="${c[0]}"]`).classList.contains('on'), ui: V166UI.cnt, want: V166.filter(r, c[2], 0, tmp, tr) }); document.querySelector(`[data-v166f="${c[0]}"]`).click(); await new Promise((z) => setTimeout(z, 30)); }
        document.querySelector('[data-v166f="all"]').click(); const mi = $('#v166Min'); mi.value = '25000'; mi.dispatchEvent(new Event('input')); const m25 = V166UI.cnt, w25 = V166.filter(r, 0, 25000, tmp, tr); mi.value = ''; mi.dispatchEvent(new Event('input'));
        V166UI.manual = false; return { out, m25, w25, all: V166UI.cnt };
      });
      const goldOnly = await ev(async () => { document.querySelector('[data-v166f="whale"]').click(); await new Promise((z) => setTimeout(z, 120)); const v = [...document.querySelectorAll('#v166Body .v166-r')].filter((r) => !r.hidden); const g = v.length >= 2 && v.every((r) => r.classList.contains('gold') && /Whale|Block/.test(r.children[1].textContent)); document.querySelector('[data-v166f="all"]').click(); return g; });
      ok(`${mk}: Whales chip shows only gold Whale / Block rows`, goldOnly);
      ok(`${mk}: 8 filter chips + min-USD toggle and match the core bitmask filter`, chips.out.length === 8 && chips.out.every((x) => x.on && x.ui === x.want) && chips.out.find((x) => x.c === 'whale').ui >= 2 && chips.out.find((x) => x.c === 'block').ui >= 1 && chips.out.find((x) => x.c === 'sweep').ui >= 3 && chips.m25 === chips.w25 && chips.m25 >= 2, JSON.stringify(chips));
    }
    ok('isolation: each market holds only its own symbol rings', await ev((S) => !V166UI.E.m.stocks.rings.has(S.crypto) && !V166UI.E.m.crypto.rings.has(S.stocks) && !V166UI.E.m.crypto.rings.has(S.onchain) && !V166UI.E.m.onchain.rings.has(S.crypto) && V166UI.E.m.onchain.rings.has(S.onchain) && V166UI.E.m.stocks.rings.has(S.stocks) && V166UI.E.m.crypto.rings.has(S.crypto), syms));

    // hover pause, manual pause, pin, copy (crypto)
    await ev((s) => { setMode('crypto', s); }, syms.crypto); await waitFor((s) => ST.sel === s && V166UI.sym === s, syms.crypto, 20000); await clean(); await sleep(300);
    await page.hover('#v166Body', { position: { x: 200, y: 40 } }); await sleep(150);
    const c0 = await ev(() => ({ cnt: V166UI.cnt, pill: !$('#v166Pill').hidden, p: V166UI.paused() }));
    await ev(() => { const n = Date.now(); for (let i = 0; i < 10; i++) V166UI.ingest(ST.sel, px(ST.sel), 0.01, 'buy', n, { who: 'Late' }); }); await sleep(200);
    const c1 = await ev(() => V166UI.cnt);
    ok('hover over the table auto-pauses: gold "Paused" pill, snapshot frozen while prints keep arriving', c0.pill && c0.p && c1 === c0.cnt, JSON.stringify([c0, c1]));
    await page.mouse.move(5, 5); await sleep(250);
    ok('leaving the table resumes live scroll (pill hidden, new prints shown)', await ev((n) => $('#v166Pill').hidden && !V166UI.paused() && V166UI.cnt >= n + 10, c0.cnt));
    await ev(() => $('#v166Pause').click()); await sleep(60);
    ok('manual Pause / Live toggle', await ev(() => !$('#v166Pill').hidden && $('#v166Pause').textContent === 'Live') && await ev(() => { $('#v166Pause').click(); return $('#v166Pill').hidden && $('#v166Pause').textContent === 'Pause'; }));
    await ev(() => { V166UI.pins = {}; }); await page.mouse.move(5, 5);
    await ev(() => document.querySelector('#v166Body .v166-r:not([hidden])').click());
    ok('clicking a print drops a gold marker on the active chart', await waitFor(() => (V166UI.pins[ST.sel] || []).length === 1 && V166UI.drawnPins >= 1, null, 5000), await ev(() => JSON.stringify({ pins: V166UI.pins[ST.sel], drawn: V166UI.drawnPins })));
    await ev(() => document.querySelector('[data-v166a="copy"]').click()); await sleep(200);
    const cp = await ev(() => ({ t: V166UI.lastCopy, bridge: typeof V165UI !== 'undefined' && V165UI.lastCopy === V166UI.lastCopy }));
    ok('Copy Tape for AI formats the top whale / block prints and hands them to the AI Bridge', cp.bridge && /^\[ExTerm Tape\] BTC-USD · crypto/.test(cp.t) && /TOP RECENT WHALE \/ BLOCK PRINTS/.test(cp.t) && /Block Sell .*BlockB/.test(cp.t) && /WhaleA/.test(cp.t), cp.t.slice(0, 300));
    const perf = await ev(() => V166UI.perf);
    ok('per-frame main-thread cost while streaming: average < 0.2 ms', perf.frames > 30 && perf.avg < 0.2, JSON.stringify(perf));

    // closed US session → LAST SESSION TAPE (stub the Yahoo payload the page fetches through the launcher proxy)
    await ev(() => { setMode('stocks', 'MSFT'); }); await waitFor(() => ST.sel === 'MSFT' && V166UI.sym === 'MSFT', null, 20000);
    const last = await ev(async () => {
      const t0 = Math.floor(Date.now() / 1000) - 86400, rows = []; for (let i = 0; i < 30; i++) rows.push({ t: t0 + i * 60, o: 400, h: 401, l: 399, c: 400 + (i % 3) - 1, v: 1000 + i * 50 });
      const yf = YF.chart, act = Stocks.active; YF.chart = async () => ({ meta: { regularMarketPrice: 400, chartPreviousClose: 398, regularMarketTime: t0 + 1800, currentTradingPeriod: { regular: { start: t0 - 3600, end: t0 } }, fullExchangeName: 'NasdaqGS' }, rows });
      Stocks.active = YF; V166UI.stock.sym = ''; try { await V166UI.stockPoll(); } finally { YF.chart = yf; Stocks.active = act; }
      await new Promise((z) => setTimeout(z, 400)); const r = V166UI.E.ring('MSFT');
      return { sess: $('#v166Sess').textContent, cls: $('#v166Sess').classList.contains('last'), n: r ? r.n : 0, agg: r ? (V166.mask(r, r.n - 1) & V166.BIT.AGG) > 0 : false, venue: r ? V166UI.E.name('MSFT', V166.venue(r, r.n - 1)) : '', shares: $('#v166QtyH').textContent };
    });
    ok('stocks: closed market prints are labelled LAST SESSION TAPE (1-minute last-sale volume, exchange venue, Shares column)', last.sess === 'LAST SESSION TAPE' && last.cls && last.n >= 30 && last.agg && last.venue === 'NasdaqGS' && last.shares === 'Shares', JSON.stringify(last));
    await ev(() => $('[data-v166a="close"]').click()); await sleep(100);
    ok('close button hides the drawer; it stays hidden on other tabs', await ev(() => $('#v166Tape').hidden && !$('#v166Btn').classList.contains('on')));
    ok('no horizontal page scroll at 1440×900', await ev(() => document.documentElement.scrollWidth <= innerWidth));
    ok('zero page errors, dialogs or console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
