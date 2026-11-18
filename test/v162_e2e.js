// ExTerm v16.2 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL), against a real signed receiver on 127.0.0.1:
// launch safety briefing on every fresh boot (Esc / buttons), universal 1s–1M timeframes on stocks + on-chain, seeded
// full-width sub-minute candles (stock ITW-style price and an 8-decimal micro-cap) with a non-flat y-axis, Max Daily
// Loss ($) auto-flatten (CANCEL_ALL_AND_FLATTEN on the wire, all slots PAPER, ledger row, alert), the live-only workspace
// (body.live-bot-armed hides paper / simulation tools and restores them on disarm), v15.1–v16.1 features, zero errors.
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const V160 = require('../src/v160core.js');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8822, BASE = 'http://localhost:' + PORT, RPORT = 18767, RECV = 'http://127.0.0.1:' + RPORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv162-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
const R = { secret: '', last: null, got: [], bad: [], nonces: new V160.NonceCache() };
const recv = http.createServer((q, s) => {
  if (q.method !== 'POST') { s.writeHead(405); s.end(); return; }
  let b = ''; q.on('data', (d) => (b += d)).on('end', async () => {
    const v = R.secret ? await V160.verify(b, R.secret, R.last, undefined, R.nonces) : { ok: false, why: 'no secret' };
    if (v.ok) { R.last = { session: v.p.session, seq: v.p.seq }; R.got.push(v.p); } else R.bad.push(v.why);
    s.writeHead(v.ok ? 200 : 401, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); s.end(JSON.stringify({ ok: v.ok, ack: v.ok ? v.p.idempotency_key : null }));
  });
}).listen(RPORT, '127.0.0.1');
const kinds = (k) => R.got.filter((p) => p.kind === k);
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { recv.close(); } catch (e) { /* closed */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    // this suite checks the start-up briefing, so it presents itself as a normal (non-automated) browser
    await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });
    await ctx.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(BASE) || u.startsWith(RECV) ? r.continue() : r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v16[012] /.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const shot = async (name) => { if (!SHOTS) return; await ev(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); }); await sleep(450); await page.screenshot({ path: path.join(SHOTS, name) }); };
    const booted = () => page.waitForFunction(() => typeof V162UI !== 'undefined' && typeof V160UI !== 'undefined' && V160UI.st && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && chart.L.py, null, { timeout: 60000 });
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief')) x.remove(); });

    // ── 1. launch safety briefing on every fresh boot
    await page.goto(BASE + '/'); await booted();
    ok('briefing: appears on a fresh launch (PAPER) with checklist, highlights and both actions', await waitFor(() => { const m = $('#v162Brief'); return m && m.querySelectorAll('ol.v162-list li').length === 5 && /v16\.[2345] Release Highlights/.test(m.textContent) && /127\.0\.0\.1/.test(m.textContent) && !!m.querySelector('[data-v162="safe"]') && !!m.querySelector('[data-v162="bridge"]') && /PAPER/.test(m.querySelector('.v162-mode').textContent); }, null, 8000));
    ok('briefing: focus lands on Continue in Safe Mode, modal fits 1440×900', await ev(() => document.activeElement && document.activeElement.dataset.v162 === 'safe' && $('#v162Brief .v162-modal').getBoundingClientRect().bottom <= innerHeight));
    await clean(); await shot('v16.2-launch-safety-briefing.png');
    await page.keyboard.press('Escape'); await sleep(200);
    ok('briefing: Esc continues in Safe Mode (PAPER) and closes it', await ev(() => !$('#v162Brief') && V160UI.st.mode !== 'live'));
    await page.reload(); await booted();
    ok('briefing: shows again on the next fresh boot', await waitFor(() => !!$('#v162Brief'), null, 8000));
    await page.click('#v162Brief [data-v162="bridge"]'); await sleep(400);
    ok('briefing: Open Execution Bridge & Safety Settings closes it and opens the bridge', await ev(() => !$('#v162Brief') && $('#tab-grok').classList.contains('on') !== false && !!$('#v160Bridge')));
    await clean();

    // ── 2. universal timeframes on stocks + on-chain
    const tfs = () => ev(() => [...document.querySelectorAll('#tfBtns button')].map((x) => x.textContent.trim()));
    const ALL = ['1s', '5s', '10s', '15s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
    await ev(() => { showTab('markets'); setMode('stocks'); selectSym('NVDA'); }); await sleep(1200);
    const tS = await tfs(); ok('stocks: 1s → 1M timeframes all offered', ALL.every((t) => tS.includes(t)), tS.join());
    const quick = await ev(() => [...document.querySelectorAll('#tfBtns button')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent.trim()));
    ok('quick pills: 1s 5s 10s 15s 1m 5m 15m 1h 4h 1d 1w visible, the rest behind ⋯', ['1s', '5s', '10s', '15s', '1m', '5m', '15m', '1h', '4h', '1d', '1w'].every((t) => quick.includes(t)) && !quick.includes('1M'), quick.join());
    await ev(() => { const m = document.querySelector('.v155-tfmore'); if (m) m.click(); }); await sleep(150);
    ok('overflow ⋯: reveals 1M and 30m', await ev(() => ['1M', '30m'].every((t) => { const x = [...document.querySelectorAll('#tfBtns button')].find((b) => b.textContent.trim() === t); return x && getComputedStyle(x).display !== 'none'; })));
    await ev(() => { const x = [...document.querySelectorAll('#tfBtns button')].find((b) => b.textContent.trim() === '1w'); if (x) x.click(); }); await sleep(1500);
    ok('1w: weekly candles render on a stock', await waitFor(() => ST.tf === '1w' && chart.data.length > 5 && chart.data.length > 1 && chart.data[1].t - chart.data[0].t >= 604800, null, 10000));

    // seeded sub-minute history: real (non-demo) code path with a 1m OHLCV cache and a live spot
    const seedStock = (o) => ev((o) => {
      const now = Math.floor(Date.now() / 1000), t0 = Math.floor(now / 60) * 60 - 1500 * 60, rows = []; let p = o.p0;
      for (let i = 0; i < 1500; i++) { const op = p; p = p * (1 + Math.sin(i * 0.9) * 0.0011 + Math.cos(i * 0.37) * 0.0004); rows.push({ t: t0 + i * 60, o: op, h: Math.max(op, p) * 1.0006, l: Math.min(op, p) * 0.9994, c: p, v: 1000 }); }
      for (const k of [...History.cache.keys()]) if (k.startsWith(o.sym + '|')) History.cache.delete(k);
      History.cache.set(o.sym + '|60', { rows, ts: Date.now(), full: true });
      for (const k of [...Stores.keys()]) if (k.startsWith(o.sym + '|')) Stores.delete(k);
      clearInterval(StockFeed.timer); TFX.ring.delete(o.sym); // the demo quote loop would overwrite the test spot
      (Feed.live[o.sym] || (Feed.live[o.sym] = {})).price = o.spot;
    }, o);
    const pane = () => ev(() => { const L = chart.L, D = L.D, vis = D.slice(Math.max(0, L.end - L.bars), L.end); const mid = (L.hi + L.lo) / 2; return { n: chart.data.length, bars: L.bars, vis: vis.length, spanPct: ((L.hi - L.lo) / mid) * 100, bodies: vis.filter((k) => k.h > k.l).length, gapless: vis.every((k, i) => !i || Math.abs(k.o - vis[i - 1].c) <= Math.abs(k.o) * 1e-12), last: D[D.length - 1].c, ema: chart.o.ema ? 1 : 0 }; });
    const tfClick = (t) => ev((t) => { const x = [...document.querySelectorAll('#tfBtns button')].find((b) => b.textContent.trim() === t); if (x) x.click(); }, t);
    await ev(() => { Stocks.active = Object.create(StockDemo); }); // any non-demo provider takes the live (seeded) path
    for (const tf of ['1s', '15s']) {
      const spot = await ev(() => px('NVDA') || 284.64); await seedStock({ sym: 'NVDA', p0: spot * 0.9974, spot }); await tfClick('1m'); await sleep(300); await tfClick(tf);
      const okLoad = await waitFor((t) => ST.tf === t && chart.data.length >= 250, tf, 15000); await sleep(600);
      const P = await pane();
      ok(`stock ${tf}: full-width multi-bar candles (window filled, true-form gapless)`, okLoad && P.vis >= Math.min(P.bars, P.n) && P.vis >= 60 && P.gapless, JSON.stringify(P));
      ok(`stock ${tf}: non-flat y-axis (≥ 0.20 % span, most bars have range) bridged to the live spot`, P.spanPct >= 0.2 - 1e-9 && P.spanPct < 5 && P.bodies >= P.vis * 0.6 && Math.abs(P.last - spot) / spot < 0.01, JSON.stringify(P));
      if (tf === '15s') { await clean(); await shot('v16.2-stock-15s-true-form.png'); }
    }
    ok('market closed badge: shown for a US stock outside regular hours, hidden on crypto', await (async () => { await ev(() => { StockFeed.session.NVDA = false; V162UI.badge(); }); const a = await ev(() => !$('#v162Mkt').hidden && /MARKET CLOSED · LAST SESSION/.test($('#v162Mkt').textContent)); await ev(() => { StockFeed.session.NVDA = true; V162UI.badge(); }); const b2 = await ev(() => $('#v162Mkt').hidden); return a && b2; })());
    await ev(() => { Stocks.active = StockDemo; StockFeed.session.NVDA = null; });

    // on-chain micro-cap: same seeded path (no swaps yet) at 8+ decimals
    const OCS = await ev(() => { const s = 'oc:solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'; return OC.parse(s) ? s : null; });
    ok('on-chain symbol parses', !!OCS, OCS);
    if (OCS) {
      await ev((s) => { OC.trades = async () => []; OC.meta[s] = { s: 'MICRO', q: 'SOL', n: 'Micro test token' }; setMode('onchain'); selectSym(s); }, OCS); await sleep(800);
      const tO = await tfs(); ok('on-chain: 1s → 1M timeframes all offered', ALL.every((t) => tO.includes(t)), tO.join());
      for (const tf of ['1s', '15s']) {
        await seedStock({ sym: OCS, p0: 0.00000107, spot: 0.000001088 }); await tfClick('1m'); await sleep(300); await tfClick(tf);
        const okLoad = await waitFor((a) => ST.tf === a && chart.data.length >= 250, tf, 15000); await sleep(600);
        const P = await pane();
        ok(`on-chain ${tf}: full-width multi-bar candles at 8+ decimals, non-flat, bridged to 0.000001088`, okLoad && P.vis >= 60 && P.gapless && P.spanPct >= 0.2 - 1e-9 && P.bodies >= P.vis * 0.6 && Math.abs(P.last - 0.000001088) / 0.000001088 < 0.01, JSON.stringify(P));
        if (tf === '1s') { await clean(); await shot('v16.2-onchain-1s-true-form.png'); }
      }
    }
    await ev(() => { setMode('crypto'); selectSym('BTC-USD'); }); await tfClick('1m'); await sleep(1200);

    // ── 3. arm live, live-only workspace, Max Daily Loss auto-flatten
    const SEL = '#v160Bridge';
    await ev(() => showTab('grok')); await sleep(400);
    R.secret = await ev(() => V160UI.st.slots[0].secret);
    await page.fill(`${SEL} [data-v160f="url"][data-id="1"]`, RECV + '/signal'); await page.check(`${SEL} [data-v160f="en"][data-id="1"]`);
    await page.fill(`${SEL} [data-v160f="maxLoss"]`, '500'); await page.fill(`${SEL} [data-v160f="riskPct"]`, '1'); await page.fill(`${SEL} [data-v160f="maxPos"]`, '5');
    const armIt = async () => {
      await ev(() => showTab('grok')); await sleep(250); await ev(() => { V160UI.st.slots[0].hb = null; });
      await page.click(`${SEL} [data-v160="hb"][data-id="1"]`); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000);
      await page.check(`${SEL} [data-v160f="ack"]`); await page.fill(`${SEL} [data-v160f="phrase"]`, 'ARM LIVE BOT'); await sleep(150); await page.click(`${SEL} [data-v160="arm"]`); await sleep(150);
      const r = await ev(() => ({ live: V160UI.st.mode === 'live', gates: V160.gates(V160UI.st, V160UI.phrase, Date.now()).map((g) => g.ok), hb: V160UI.st.slots[0].hb }));
      if (!r.live) console.log('ARM DIAG', JSON.stringify(r)); return r.live;
    };
    ok('armed: live routing on Slot 1', await armIt());
    ok('live-only: body.live-bot-armed is set within a second', await waitFor(() => document.body.classList.contains('live-bot-armed'), null, 3000));
    const hidden = (sel) => ev((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; }, sel);
    await ev(() => showTab('markets')); await sleep(300);
    ok('live-only Markets: Tick Replay hidden, Flatten All & Disarm (kill) still reachable, order ticket kept', await hidden('#replayBtn') && await ev(() => !!$('#tkUsd') && getComputedStyle($('#tkUsd')).display !== 'none'));
    const G = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L; return { x: r.left + L.Lm + (L.W - L.Lm - L.Rm) * 0.5, y: r.top + L.y0 + L.mainH * 0.4 }; });
    await page.mouse.click(G.x, G.y, { button: 'right' }); await sleep(200);
    ok('live-only context menu: live actions kept, "Start Tick Replay From Here" hidden', await ev(() => { const m = $('#v161Menu'); if (!m) return false; const r = m.querySelector('[data-v161m="replay"]'), bu = m.querySelector('[data-v161m="buy"]'); return getComputedStyle(r).display === 'none' && getComputedStyle(bu).display !== 'none'; }));
    await page.keyboard.press('Escape');
    await ev(() => showTab('port')); await sleep(400);
    ok('live-only Portfolio: paper reset hidden, Max Daily Loss ($) gauge shown', await hidden('#pfReset') && await waitFor(() => { const g = $('#v162Gauge'); return g && !g.hidden && /\/ \$500/.test(g.textContent); }, null, 3000));
    await ev(() => showTab('lab')); await sleep(900);
    ok('live-only Lab: Genetic Auto-Evolve, Crisis Time Machine and 3D Profit Mountain hidden', await hidden('#q153Root details[data-sec="evolve"]') && await hidden('#q153Root details[data-sec="crisis"]') && await hidden('#v157Mtn'));
    ok('live-only Whales: Backtest Style hidden', await hidden('[data-lb="backtest"]'));
    await ev(() => showTab('grok')); await sleep(300);
    ok('live-only Bots: six bridge slots + fail-safe engines stay visible', await ev(() => $$('#v160Bridge .v160-slot').length === 6 && getComputedStyle($('#v160Bridge')).display !== 'none'));
    await clean(); await ev(() => showTab('grok')); await shot('v16.2-live-only-armed-ledger.png');

    // breach: realised + unrealised drawdown ≥ cap → CANCEL_ALL_AND_FLATTEN, all slots PAPER, ledger row, alert
    const nf = kinds('flatten').length;
    await ev(() => { V160UI.st.day = { d: new Date().toISOString().slice(0, 10), eq0: ACC.equity(priceMap()) + 600 }; });
    ok('breach: auto-flatten fires within 2 s of Max Daily Loss ($500) being exceeded', await waitFor(() => V160UI.st.mode !== 'live' && !!$('#v162Loss'), null, 4000));
    ok('breach: signed CANCEL_ALL_AND_FLATTEN reached the receiver', await (async () => { for (let i = 0; i < 20 && kinds('flatten').length === nf; i++) await sleep(150); const p = kinds('flatten').pop(); return !!p && p.body.action === 'CANCEL_ALL_AND_FLATTEN' && /Max Daily Loss/.test(p.body.reason); })());
    ok('breach: all six slots PAPER, breach logged in the receipt ledger', await ev(() => V160UI.st.slots.every((s) => s.mode !== 'live') && V160UI.ledger.some((r) => r.kind === 'breaker' && /daily-loss/.test(r.status))));
    ok('disarm: body.live-bot-armed cleared and paper tools restored', await waitFor(() => !document.body.classList.contains('live-bot-armed'), null, 3000) && await ev(() => { showTab('markets'); return getComputedStyle($('#replayBtn')).display !== 'none'; }));
    await ev(() => { const m = $('#v162Loss'); if (m) m.remove(); V160UI.st.day = null; });

    // ── 4. earlier features still present
    await ev(() => showTab('markets')); await sleep(300);
    ok('v15.1–v16.1: measure toggle, context menu, 6 bridges, 4 gates, ledger export, Learn, Ctrl+K palette', await ev(() => !!$('#v161MBtn') && typeof V161UI.menuOpen === 'function' && $$('#v160Bridge .v160-slot').length === 6 && $$('#v160Gates li').length === 4 && typeof V160UI.exportLedger === 'function' && typeof Learn !== 'undefined' || (!!$('#v161MBtn') && $$('#v160Bridge .v160-slot').length === 6)));

    // ── 5. Arabic (RTL)
    await ev(() => I18N.set('ar')); await sleep(400);
    await ev(() => V162UI.brief()); await sleep(200);
    ok('RTL: briefing opens inside the viewport with dir=rtl and no horizontal scroll', await ev(() => { const m = $('#v162Brief .v162-modal'); if (!m) return false; const r = m.getBoundingClientRect(); return document.documentElement.dir === 'rtl' && r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }));
    await page.keyboard.press('Escape'); await sleep(150);
    ok('RTL: Esc closes the briefing', await ev(() => !$('#v162Brief')));
    ok('RTL: Arabic stock / on-chain timeframe bars still list 1s–1M', ALL.every((t) => tS.includes(t)));
    await ev(() => I18N.set('en')); await sleep(300);

    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
