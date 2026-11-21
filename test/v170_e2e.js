// ExTerm v17.0 browser end-to-end against serve.py (1440×900, offline launcher, outside network blocked):
// ST.epoch on symbol / TF switches, venue strip (one line, 1-click venue filter on the tape, hidden for stocks), L1 candle
// hydration < 5 ms, worker jobs with zero-copy Transferables (source buffer detached), CSV job, Discovery formula scanner
// (valid / invalid formulas), clipboard sniper pill, zero page errors. EXTERM_E2E_PORT overrides the port.
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = +process.env.EXTERM_E2E_PORT || 8870, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv170-'));
const CHROME = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push('PAGE ' + e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && !/Failed to load resource|net::ERR_|WebSocket/.test(t)) || /^v170/.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V170UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 20 && !!document.querySelector('#v166Tape'), null, { timeout: 60000 });
    await clean();

    // epoch
    const e0 = await ev(() => ST.epoch);
    await ev(() => { const s = ST.watch.find((x) => x !== ST.sel && /-USD$/.test(x)) || 'ETH-USD'; selectSym(s); });
    const e1 = await ev(() => ST.epoch);
    await ev(() => { const tfs = tfList(); ST.tf = tfs.find((t) => t !== ST.tf); ensureSym(ST.sel); chartRefresh(true); });
    const e2 = await ev(() => ST.epoch);
    ok('ST.epoch increments on a symbol switch and on a timeframe switch', Number.isInteger(e0) && e1 > e0 && e2 > e1, [e0, e1, e2]);
    ok('a late answer from the previous epoch is discarded (V170UI.guard)', await ev(async () => { const p = V170UI.guard(new Promise((r) => setTimeout(() => r(1), 30))); selectSym(ST.watch.find((x) => x !== ST.sel && /-USD$/.test(x)) || 'BTC-USD'); return (await p) === V170.STALE; }));

    // venue strip
    await ev(() => { showTab('markets'); V166UI.toggle(true); if (!/-USD$/.test(ST.sel)) selectSym('BTC-USD'); });
    ok('venue strip mounts inside the Live Tape on crypto', await waitFor(() => { const v = document.querySelector('#v170Vs'); return v && !v.hidden && v.querySelectorAll('[data-v170v]').length === 7; }));
    const geo = await ev(() => { const v = document.querySelector('#v170Vs'); const r = v.getBoundingClientRect(); return { h: r.height, sw: v.scrollWidth, w: v.clientWidth }; });
    ok('zero-clutter: the strip is one line (≤ 28 px tall)', geo.h > 0 && geo.h <= 28, JSON.stringify(geo));
    const filt = await ev(() => {
      const sym = ST.sel, now = Date.now();
      for (let i = 0; i < 6; i++) { V166UI.ingest(sym, 100 + i, 1, 'buy', now - i * 10, { who: 'Kraken' }); V166UI.ingest(sym, 100 + i, 2, 'sell', now - i * 10 - 5, { who: 'Bybit' }); }
      document.querySelector('[data-v170v="KRK"]').click(); V166UI.refilter(true);
      const r = V166UI.E.ring(sym), n = V166UI.cnt, names = []; for (let i = 0; i < Math.min(n, 30); i++) names.push(V166UI.E.name(sym, V166.venue(r, V166UI.idx[i])));
      const krk = document.querySelector('[data-v170v="KRK"]').getAttribute('aria-pressed');
      document.querySelector('[data-v170v="all"]').click(); V166UI.refilter(true); const all = V166UI.cnt;
      return { n, names: [...new Set(names)], krk, all };
    });
    ok('1-click venue filter: KRK shows only Kraken prints; All Aggregated restores every venue', filt.n >= 6 && filt.names.length === 1 && filt.names[0] === 'Kraken' && filt.krk === 'true' && filt.all > filt.n, JSON.stringify(filt));
    ok('provenance pill + heartbeat dot render (offline → RECONNECTING / amber)', await ev(() => { const t = document.querySelector('#v170ProvT').textContent, d = document.querySelector('#v170Dot'); return /LIVE|RECONNECTING/.test(t) && /amber|emerald/.test(d.className); }));
    await ev(() => { const s = (typeof STOCKS !== 'undefined' && STOCKS[0][0]) || 'AAPL'; openSym(s); });
    ok('venue strip hides itself for stocks', await waitFor(() => document.querySelector('#v170Vs').hidden === true, null, 5000));

    // L1 hydration
    const hyd = await ev(() => {
      const src = new CandleStore('ETH-USD', '5m'); src.candles = Array.from({ length: 300 }, (_, i) => ({ t: 1e9 + i * 300, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 })); src.loaded = true; V170UI.remember(src);
      const st = new CandleStore('ETH-USD', '5m'); const t0 = performance.now(); const hit = V170UI.hydrate(st); const ms = performance.now() - t0;
      return { hit, ms, n: st.candles.length, tag: st.v170 };
    });
    ok('L1 cache: a revisited symbol paints its cached candles in < 5 ms', hyd.hit && hyd.n === 300 && hyd.ms < 5 && hyd.tag === 'L1', JSON.stringify(hyd));

    // worker jobs with transferables
    const wj = await ev(async () => {
      const n = 50000, d = new Float64Array(n * 2); for (let i = 0; i < n; i++) { d[i * 2] = Math.random(); d[i * 2 + 1] = i; }
      const t0 = performance.now(); const r = await V170UI.job({ type: 'v170sort', data: d, k: 2, col: 0, n, desc: true }, [d.buffer]); const ms = performance.now() - t0;
      const sc = await V170UI.job({ type: 'v170scan', formula: 'rvol > 3 AND price > vwap', cols: ['rvol', 'price', 'vwap'], data: new Float64Array([4, 10, 9, 1, 10, 9]), n: 2 });
      const csv = await V170UI.job({ type: 'v170csv', text: 'time,open,high,low,close,volume\n1700000000,1,2,0.5,1.5,10\n1700000060,1.5,2,1,1.8,5' });
      return { detached: d.byteLength === 0, len: r.idx.length, isU32: r.idx instanceof Uint32Array, ms, scan: Array.from(sc.idx), csvN: csv.n, csvF: csv.f instanceof Float64Array, worker: !!(typeof BTW !== 'undefined' && BTW.w) };
    });
    ok('worker sort: 50k rows come back as a Uint32Array and the input buffer was transferred (zero-copy, detached)', wj.worker && wj.detached && wj.isU32 && wj.len === 50000, JSON.stringify(wj));
    ok('worker formula scan + CSV parse return typed arrays', wj.scan.join() === '0' && wj.csvN === 2 && wj.csvF, JSON.stringify(wj));

    // formula scanner
    await ev(() => showTab('heat'));
    ok('Discovery formula scanner row mounts', await waitFor(() => !!document.querySelector('#v170FxIn'), null, 10000));
    const fx = await ev(() => { const i = document.querySelector('#v170FxIn'); i.value = 'RVOL >> 3'; document.querySelector('[data-v170fx="apply"]').click(); const bad = document.querySelector('#v170FxMsg').textContent; i.value = 'RVOL > 3x AND Price > VWAP AND 5m Delta > +$50K'; document.querySelector('[data-v170fx="apply"]').click(); const good = document.querySelector('#v170FxMsg').textContent; document.querySelector('[data-v170fx="clear"]').click(); return { bad, good }; });
    ok('formula scanner: a syntax error is reported inline, a valid compound rule is accepted', /⚠/.test(fx.bad) && !/⚠/.test(fx.good), JSON.stringify(fx));

    // clipboard sniper
    const clip = await ev(() => { V170UI.offer('0x4200000000000000000000000000000000000006'); const p = document.querySelector('#v170Clip'); const a = !p.hidden && /Load 0x4200…0006 \(Base\/ETH\) on Chart — 1-Click/.test(p.textContent); V170UI.offer('hello world'); const b = p.textContent; V170UI.offer('$SOL'); return { a, kept: /0x4200/.test(b), c: /Load SOL on Chart/.test(p.textContent) }; });
    ok('clipboard sniper: CA → "Load … on Chart — 1-Click" pill; plain text ignored; $SOL offered', clip.a && clip.kept && clip.c, JSON.stringify(clip));
    ok('clipboard pill is a fixed, single compact element (no layout shift)', await ev(() => getComputedStyle(document.querySelector('#v170Clip')).position === 'fixed'));

    await sleep(600);
    ok('zero page errors / v170 console warnings', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n')); const fl = res.filter((r) => r.startsWith('FAIL')).length; console.log(`\n${res.length - fl}/${res.length} passed`); process.exit(fl ? 1 : 0);
})();
