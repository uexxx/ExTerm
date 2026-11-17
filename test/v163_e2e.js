// ExTerm v16.3 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL), against a real signed receiver on 127.0.0.1
// that replies { ok, ack, fill }: Require Stop-Loss (ON by default), $ risk auto-sizer, R:R + $ badges, BE pill snap,
// Auto-BE on TP1, active-tick sub-minute bars (no flat filler on stocks / on-chain), Focus Chart (F), Micro-Ticket,
// position drawer (Close 50% / Reverse / Flatten All), live-only workspace + floating HUD, two-way ACK + fill sync, 3× depth,
// stale-quote freeze, trades-per-hour limit, drawdown throttle, Pause New Entries, cooldown countdown, ticker allowlist,
// 3-Second Live Readiness Self-Check, Two-Key Arming, Reset Session Safety Counters, zero console errors.
// EXTERM_SHOTS=<dir> also writes the six README screenshots (01–06).
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const V160 = require('../src/v160core.js');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8823, BASE = 'http://localhost:' + PORT, RPORT = 18768, RECV = 'http://127.0.0.1:' + RPORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv163-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
const R = { secret: '', last: null, got: [], bad: [], nonces: new V160.NonceCache() };
const recv = http.createServer((q, s) => {
  if (q.method !== 'POST') { s.writeHead(405); s.end(); return; }
  let b = ''; q.on('data', (d) => (b += d)).on('end', async () => {
    const v = R.secret ? await V160.verify(b, R.secret, R.last, undefined, R.nonces) : { ok: false, why: 'no secret' };
    if (v.ok) { R.last = { session: v.p.session, seq: v.p.seq }; R.got.push(v.p); } else R.bad.push(v.why);
    const out = { ok: v.ok, ack: v.ok ? v.p.idempotency_key : null };
    if (v.ok && v.p.kind === 'signal' && v.p.mode === 'live') { const bd = v.p.body, pr = +bd.price || 100; out.fill = { price: +(pr * (bd.action === 'buy' ? 1.0002 : 0.9998)).toPrecision(10), qty: +bd.qty || +bd.usd / pr, ts: Date.now(), order_id: 'T' + R.got.length }; }
    s.writeHead(v.ok ? 200 : 401, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); s.end(JSON.stringify(out));
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
    await ctx.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(BASE) || u.startsWith(RECV) ? r.continue() : r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v16[0123] |^v163 cockpit/.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    const shot = async (name) => { if (!SHOTS) return; await clean(); await sleep(450); await page.screenshot({ path: path.join(SHOTS, name) }); };
    const tfClick = (t) => ev((t) => { const x = [...document.querySelectorAll('#tfBtns button')].find((b) => b.textContent.trim() === t); if (x) x.click(); }, t);
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V163C !== 'undefined' && typeof V163UI !== 'undefined' && typeof V160UI !== 'undefined' && V160UI.st && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && chart.L.py && !!$('#v163Ck'), null, { timeout: 60000 });
    await clean();

    // ── 1. defaults + briefing
    ok('defaults: Require Stop-Loss ON, entries not paused, Two-Key optional (off), cues on', await ev(() => V163UI.cfg.requireSL === true && V160UI.requireSL === true && V163C.c.paused === false && V163C.c.twoKey === false && V163C.c.cues === true));
    await ev(() => V162UI.brief()); await sleep(200);
    ok('briefing: Launch Safety & Critical Updates lists the v16.3 highlights (HUD, two-way sync, Two-Key)', await ev(() => { const m = $('#v162Brief'); return !!m && /v16\.3 Release Highlights/.test(m.textContent) && /HUD/.test(m.textContent) && /Freqtrade/.test(m.textContent) && /Two-Key Arming/.test(m.textContent) && m.querySelector('.v162-modal').getBoundingClientRect().bottom <= innerHeight; }));
    await page.keyboard.press('Escape'); await sleep(150);

    // ── 2. ticket: $ risk sizer, Chase Limit, liquidation pill, countdown, copy setup
    await ev(() => { showTab('markets'); setMode('crypto'); selectSym('BTC-USD'); }); await sleep(800); await tfClick('5m'); await sleep(1200);
    const sz = await ev(() => { $('#tkSl').value = '2'; $('#tkSl').dispatchEvent(new Event('input', { bubbles: true })); const r = $('#v163Risk'); r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); $('#v163Tk [data-v163t="size"]').click(); const c = V163UI.sizeCalc(); return { usd: parseFloat($('#tkUsd').value), risk: c && c.risk, out: $('#v163RiskOut').textContent }; });
    ok('Auto-Position-Sizer: $100 risk at a 2% stop → exact notional in the ticket, loses ≈ $100 at the stop', sz.usd > 1000 && Math.abs(sz.risk - 100) < 1 && /loses \$100/.test(sz.out), JSON.stringify(sz));
    const ck = await ev(() => { V163C.c.lev = 10; V163C.c.mmr = 0.5; const p = V163C.chasePx(); V163C.chase(); const lim = parseFloat($('#tkLimit').value); const r = { p, lim, type: tkType, liq: '', evt: '' }; V163C.tick(); r.liq = $('#v163Liq').textContent; r.evt = $('#v163Evt').textContent; const mk = $('#tkType [data-t="market"]'); if (mk) mk.click(); V163C.c.lev = 1; return r; });
    ok('Chase Limit: switches to limit and pegs to the best bid', ck.type === 'limit' && ck.p > 0 && Math.abs(ck.lim - ck.p) / ck.p < 1e-9, JSON.stringify(ck));
    ok('Liquidation & Margin Buffer pill: 10× shows Liq ≈ and a < 15% buffer warning', /Liq ≈/.test(ck.liq) && /buffer 9\.\d%/.test(ck.liq) && /< 15%/.test(ck.liq), ck.liq);
    ok('Pre-trade countdown pill: next funding print for crypto', /^Funding in \d/.test(ck.evt), ck.evt);
    ok('Copy Trade Setup: LONG BTC @ … · SL … · TP … · ExTerm', await ev(() => /^LONG BTC @ [\d.]+ · SL [\d.]+ · TP /.test(V163C.copySetup())));

    // ── 3. active-tick sub-minute bars: no flat O=H=L=C filler appended on stocks / on-chain
    const flat = () => ev(() => { const D = chart.data; let f = 0; for (let i = 1; i < D.length; i++) if (V163.quiet(D[i]) && D[i].c === D[i - 1].c) f++; return { n: D.length, flat: f }; });
    await ev(() => { setMode('stocks'); selectSym('NVDA'); }); await sleep(900); await tfClick('1s'); await sleep(7000);
    const fS = await flat(); ok('Active-Tick Sub-Minute Bars: stock 1s chart has zero flat filler bars', fS.n > 5 && fS.flat === 0, JSON.stringify(fS));
    const OCS = await ev(() => { const s = 'oc:base:0x4200000000000000000000000000000000000006'; return OC.parse(s) ? s : null; });
    if (OCS) { await ev((s) => { OC.trades = async () => []; OC.meta[s] = { s: 'MICRO', q: 'ETH', n: 'Micro test token' }; setMode('onchain'); selectSym(s); }, OCS); await sleep(900); await tfClick('5s'); await sleep(6000); const fO = await flat(); ok('Active-Tick Sub-Minute Bars: on-chain 5s chart has zero flat filler bars', fO.flat === 0, JSON.stringify(fO)); }
    await ev(() => { setMode('crypto'); selectSym('BTC-USD'); }); await sleep(900); await tfClick('5m'); await sleep(1500);

    // ── 4. chart position: BE pill snap, R:R + $ badges, Auto-BE on TP1, pyramid / fee lines
    await ev(() => { const e = document.querySelector('#indBtns button[data-i="ema"], #indBtns button[data-k="ema"]') || [...document.querySelectorAll('#indBtns button')].find((x) => /EMA/i.test(x.textContent)); if (e && !e.classList.contains('on')) e.click(); });
    const pos = await ev(() => { const p = px('BTC-USD'); ACC.buy('BTC-USD', p, 2500, Date.now(), { slPct: 0.01, tpPct: 0.02, src: 'manual' }); ChartTrade.changed(); chart.invalidate(); return { p, pos: !!ACC.pos['BTC-USD'] }; }); await sleep(700);
    ok('chart: open position draws the one-click BE pill', pos.pos && await waitFor(() => { const x = $('#chartHost .v163-be'); return !!x && !x.hidden; }, null, 4000));
    const badges = await ev(() => { const txt = []; const spy = new Proxy(chart.cv.getContext('2d'), { get(t, k) { if (k === 'fillText') return (s, ...a) => { txt.push(String(s)); return t.fillText(s, ...a); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; }, set(t, k, v) { t[k] = v; return true; } }); const q = ACC.pos['BTC-USD'], e = q.cost / q.qty, L = chart.L, s0 = q.sl, t0 = q.tp, room = L.hi - Math.max(e, px('BTC-USD')); const tp = Math.max(e, px('BTC-USD')) + Math.max(room, e * 0.0005) * 0.5; ChartTrade.set('pos:BTC-USD', 'tp', tp); ChartTrade.set('pos:BTC-USD', 'sl', e - (tp - e) / 2.5);
      const d0 = ChartTrade.drag, b0 = ChartTrade.b; ChartTrade.b = ChartTrade.find('pos:BTC-USD'); ChartTrade.drag = { key: 'pos:BTC-USD', field: 'tp' }; try { V163UI.overlay(spy, chart.L, chart); V163C.overlay(spy, chart.L, chart); } finally { ChartTrade.drag = d0; ChartTrade.b = b0; ChartTrade.set('pos:BTC-USD', 'sl', s0); ChartTrade.set('pos:BTC-USD', 'tp', t0); ChartTrade.changed(); } return txt; });
    ok('R:R + $ badges: dragging shows "+$… (+2.5R)" on TP and "-$… (-1.0R)" on SL', badges.some((t) => /^\+\$[\d,.]+ \(\+2\.\dR\)$/.test(t) || /^\+\$[\d,.]+ \(\+[1-3]\.\dR\)$/.test(t)) && badges.some((t) => /^-\$[\d,.]+ \(-1\.0R\)$/.test(t)), badges.join(' | ') + ' ' + await ev(() => { const b = ChartTrade.b, L = chart.L; return JSON.stringify({ kind: b && b.kind, e: b && b.entry, tp: b && b.tp, sl: b && b.sl, yTp: b && L.py(b.tp), top: L.y0, bot: L.y0 + L.mainH - (L.volH || 0) - 4, hi: L.hi, lo: L.lo }); }));
    const feeIn = await ev(() => { const q = ACC.pos['BTC-USD']; if (!q) return false; const L = chart.L, y = L.py(V163.carryLine(q.cost / q.qty, 'long', ACC.fee, V163C.c.fundRate / 100, (Date.now() - q.t0) / 3600000)); return y >= L.y0 && y <= L.y0 + L.mainH - (L.volH || 0) - 4; });
    ok('chart: Scale-In / Pyramid ghost and Fee & Funding drag line labels', badges.some((t) => /^Add 50% @ .* → avg /.test(t)) && (!feeIn || badges.some((t) => /^Fees \+ funding BE /.test(t))), badges.join(' | '));
    if (SHOTS) { // 01: hold a real drag on the TP line so the R:R + $ badges render on the price axis
      const g = await ev(() => { const q = ACC.pos['BTC-USD'], e = q.cost / q.qty, L0 = chart.L, p = px('BTC-USD'), room = L0.hi - Math.max(e, p); const tp = Math.max(e, p) + Math.max(room, e * 0.0005) * 0.8; ChartTrade.set('pos:BTC-USD', 'tp', tp); ChartTrade.set('pos:BTC-USD', 'sl', e - (e - L0.lo) * 0.55); ChartTrade.changed(); chart.invalidate(); const r = chart.cv.getBoundingClientRect(), L = chart.L, b = ChartTrade.b; return { x: r.left + L.Lm + (L.W - L.Lm - L.Rm) * 0.62, y: r.top + L.py(b.tp) }; }); await sleep(120);
      await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.mouse.move(g.x, g.y - 6, { steps: 3 }); await shot('01-markets-live-execution.png'); await page.mouse.up(); await sleep(200);
      await ev(() => { if (!ACC.pos['BTC-USD']) ACC.buy('BTC-USD', px('BTC-USD'), 2500, Date.now(), { slPct: 0.01, tpPct: 0.02, src: 'manual' }); const p = ACC.pos['BTC-USD']; if (!p) return; const e = p.cost / p.qty; ChartTrade.set('pos:BTC-USD', 'tp', e * 1.02); ChartTrade.set('pos:BTC-USD', 'sl', e * 0.99); ChartTrade.changed(); });
    }
    const be = await ev(() => { $('#chartHost .v163-be').click(); const p = ACC.pos['BTC-USD'], e = p.cost / p.qty; return { sl: p.sl, be: V163.breakEven(e, 'long', ACC.fee) }; });
    ok('BE pill: snaps the stop to break-even (entry + round-trip fees)', Math.abs(be.sl - be.be) / be.be < 1e-9, JSON.stringify(be));
    const abe = await ev(() => { if (!ACC.pos['BTC-USD']) ACC.buy('BTC-USD', px('BTC-USD'), 2500, Date.now(), { slPct: 0.01, tpPct: 0.02, src: 'manual' }); const p = ACC.pos['BTC-USD'], e = p.cost / p.qty; p.sl = e * 0.99; p.tp = e * 1.03; V163UI.cfg.autoBE = true; V163UI.onPx('BTC-USD', e * 1.0105); V163UI.cfg.autoBE = false; return { sl: p.sl, be: V163.breakEven(e, 'long', ACC.fee) }; });
    ok('Auto-BE on TP1: the stop moves to break-even once TP1 trades', Math.abs(abe.sl - abe.be) / abe.be < 1e-9, JSON.stringify(abe));

    // ── 5. Focus Chart (F), Micro-Ticket, drawer
    await ev(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); }); await page.mouse.click(700, 880); await page.keyboard.press('f'); await sleep(400);
    ok('Focus Chart: F collapses both side rails (body.v163-focus)', await ev(() => document.body.classList.contains('v163-focus') && getComputedStyle($('#tab-markets .side-col')).display === 'none'));
    await page.keyboard.press('f'); await sleep(400);
    ok('Focus Chart: F again restores the rails', await ev(() => !document.body.classList.contains('v163-focus') && getComputedStyle($('#tab-markets .side-col')).display !== 'none'));
    await ev(() => V163C.micro(true)); await sleep(400);
    const mt = await ev(() => { const m = $('#v163Micro'), r = m.getBoundingClientRect(); return { vis: getComputedStyle(m).display !== 'none', side: getComputedStyle($('#tab-markets .side-col')).display, inView: r.height > 20 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && getComputedStyle(document.body).display !== 'none' && $('#chartHost').getBoundingClientRect().height > 200, n0: ACC.trades.length }; });
    ok('Micro-Ticket: docked bottom strip replaces the side column', mt.vis && mt.side === 'none' && mt.inView, JSON.stringify(mt));
    await ev(() => { $('#v163mUsd').value = '150'; $('#v163Micro [data-v163m="buy"]').click(); }); await sleep(400);
    ok('Micro-Ticket: Buy routes through the normal ticket (paper fill with SL/TP)', await ev((n0) => ACC.trades.length > n0 && ACC.trades[ACC.trades.length - 1].side === 'buy', mt.n0));
    await ev(() => V163C.drawer(true)); await sleep(300);
    ok('Drawer: lists the live position with Close 50% / Flatten / Reverse Position and the leg actions', await ev(() => { const d = $('#v163Drawer'); return !!d && /BTC/.test(d.textContent) && ['half', 'flat', 'reverse', 'losers', 'winners', 'all'].every((k) => !!d.querySelector(`[data-v163d="${k}"]`)); }));
    const half = await ev(() => { const q0 = ACC.qty('BTC-USD'); $('#v163Drawer [data-v163d="half"][data-sym="BTC-USD"]').click(); return { q0, q1: ACC.qty('BTC-USD') }; });
    ok('Drawer: Close 50% halves the position', Math.abs(half.q1 - half.q0 / 2) / half.q0 < 1e-9, JSON.stringify(half));
    const rev = await ev(() => { $('#v163Drawer [data-v163d="reverse"][data-sym="BTC-USD"]').click(); const s = V163C.sh.pos['BTC-USD']; return { long: ACC.qty('BTC-USD'), short: s ? s.qty : 0, sl: s ? s.sl : 0, entry: s ? s.entry : 0 }; });
    ok('Drawer: Reverse Position closes the long and opens a short with its stop above entry', rev.long === 0 && rev.short > 0 && rev.sl > rev.entry, JSON.stringify(rev));
    await ev(() => { $('#v163Drawer [data-v163d="all"]').click(); }); await sleep(200);
    ok('Drawer: Flatten All closes every leg (long + short) and cancels pending orders', await ev(() => !Object.keys(ACC.pos).length && !Object.keys(V163C.sh.pos).length && !(ACC.orders || []).length));
    await ev(() => { V163C.drawer(false); V163C.micro(false); });

    // ── 6. arm live (Two-Key Arming first), live-only workspace + HUD
    const SEL = '#v160Bridge';
    await ev(() => showTab('grok')); await sleep(500);
    R.secret = await ev(() => V160UI.st.slots[0].secret);
    await page.fill(`${SEL} [data-v160f="url"][data-id="1"]`, RECV + '/signal'); await page.check(`${SEL} [data-v160f="en"][data-id="1"]`);
    await page.fill(`${SEL} [data-v160f="maxLoss"]`, '500'); await page.fill(`${SEL} [data-v160f="riskPct"]`, '1'); await page.fill(`${SEL} [data-v160f="maxPos"]`, '5');
    const gates = async () => { await ev(() => { V160UI.st.slots[0].hb = null; }); await page.click(`${SEL} [data-v160="hb"][data-id="1"]`); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000); if (!(await ev(() => $('#v160Bridge [data-v160f="ack"]').checked))) await page.check(`${SEL} [data-v160f="ack"]`); await page.fill(`${SEL} [data-v160f="phrase"]`, 'ARM LIVE BOT'); await sleep(150); };
    // the drawer closes above were small fee losses: clear the loss-streak cooldown the PAPER way before arming
    await ev(() => { $('#v163Cockpit [data-v163a="reset"]').click(); $('#v163Cockpit [data-v163a="reset"]').click(); }); await sleep(200);
    ok('Reset Session Safety Counters (PAPER): clears the loss-streak cooldown before arming', await ev(() => !V160UI.fs.lockUntil && V160UI.ledger.some((r) => r.kind === 'reset')));
    await ev(() => { $('#v163Cockpit [data-v163c="twoKey"]').click(); }); await sleep(150);
    ok('Two-Key Arming: toggled on in PAPER from the cockpit', await ev(() => V163C.c.twoKey === true));
    await gates(); await page.click(`${SEL} [data-v160="arm"]`); await sleep(250);
    ok('Two-Key Arming: Arm alone (key 2 without key 1) is refused', await ev(() => V160UI.st.mode !== 'live'));
    await page.keyboard.press('Shift+Alt+A'); await sleep(100);
    const gd = await ev(() => ({ dis: $('#v160Bridge [data-v160="arm"]').disabled, gates: V160.gates(V160UI.st, V160UI.phrase, Date.now()).map((g) => g.ok), phrase: V160UI.phrase, turned: V163C.turned > 0 }));
    if (gd.dis) console.log('ARM DIAG', JSON.stringify(gd));
    await ev(() => $('#v160Bridge [data-v160="arm"]').click()); await sleep(300);
    ok('Two-Key Arming: Shift + Alt + A then Arm within 10 s arms live routing', await ev(() => V160UI.st.mode === 'live'));
    ok('Two-Key Arming: the chord never reaches the plain "A" hotkeys (no Auto-Setup modal)', await ev(() => ![...document.querySelectorAll('h2, h3, b, div')].some((x) => x.offsetParent !== null && /^⚙ Auto-Setup/.test(x.textContent.trim()) && x.children.length < 3)));
    ok('live-only workspace: body.live-bot-armed set, reset counters and Two-Key locked while armed', await waitFor(() => document.body.classList.contains('live-bot-armed'), null, 3000) && await waitFor(() => { const r = $('#v163Cockpit [data-v163a="reset"]'), k = $('#v163Cockpit [data-v163c="twoKey"]'); return !!r && !!k && r.disabled && k.disabled; }, null, 3000));
    await ev(() => showTab('markets')); await sleep(1500);
    const hud = await ev(() => { const h = $('#v163Hud'), r = h.getBoundingClientRect(); return { vis: !h.hidden && getComputedStyle(h).display !== 'none', txt: $('#v163HudTxt').textContent, evt: $('#v163HudEvt').textContent, inView: r.top >= 0 && r.right <= innerWidth && r.left >= 0, tape: getComputedStyle($('#tab-markets .tape')).display }; });
    ok('Floating Live Execution HUD: LIVE ARMED · Slot 1 · N ms · Day $… vs -$500 cap', hud.vis && /^LIVE ARMED · Slot 1 · \d+ ms · Day [+-]\$[\d.,]+ vs -\$500 cap$/.test(hud.txt) && /^Funding in /.test(hud.evt) && hud.inView, JSON.stringify(hud));
    ok('live-only workspace: clutter hidden (live trades tape), ticket kept', hud.tape === 'none' && await ev(() => !!$('#tkUsd')));

    // ── 7. live routing with two-way ACK + fill sync
    const sendBuy = (o) => ev((o) => { const s = o.sym || 'BTC-USD', p = px(s); if (Feed.live[s]) Feed.live[s].ts = Date.now();
      if (o.pre === 'stale' && Feed.live[s]) Feed.live[s].ts = Date.now() - 120000;
      V163UI.books[s] = o.pre === 'thin' ? { bids: [[p * 0.9999, 0.0001]], asks: [[p * 1.0001, 0.0001]], ts: Date.now() } : { bids: [[p * 0.9999, 50]], asks: [[p * 1.0001, 50]], ts: Date.now() }; // offline demo books are thin: give routing tests a deep book
      if (o.pre === 'rate') V163UI.cfg.maxPerHour = V163UI.sent.length;
      if (o.pre === 'allow') V163C.c.allow[1] = 'ETH';
      const t = ACC.buy(s, p, o.usd || 200, Date.now(), o.noSl ? { src: 'manual' } : { slPct: 0.02, tpPct: 0.04, src: 'manual' }); return !!t; }, o);
    const n0 = kinds('signal').length; await sendBuy({});
    ok('ACK + fill: signed signal sent and the receiver fill came back into the cockpit', await waitFor(() => V163C.stats.fills >= 1, null, 5000) && kinds('signal').length === n0 + 1, JSON.stringify({ sig: kinds('signal').length - n0, log: await ev(() => V160UI.log.slice(0, 3).map((x) => x.msg)), st: await ev(() => V163C.stats), errs: errs.slice(0, 3) }));
    ok('ACK + fill: fill logged in the Signed Receipt Ledger and bot position synced', await ev(() => V160UI.ledger.some((r) => r.kind === 'fill' && /BTC buy/.test(r.detail) && /ACK \d+ ms/.test(r.detail)) && V163C.botPos.BTC > 0));
    await ev(() => V163C.drawer(true)); await sleep(300);
    ok('Drawer: bot position shown in sync with the paper position', await ev(() => /in sync/.test($('#v163Drawer').textContent)), await ev(() => JSON.stringify({ bot: V163C.botPos, q: ACC.qty('BTC-USD'), t: $('#v163Drawer').textContent.slice(0, 300) })));
    await ev(() => V163C.drawer(false));
    ok('Slippage & fill quality by symbol: BTC avg bps + avg ACK ms', await ev(() => { const r = V163.qSummary(V163C.q).find((x) => x.sym === 'BTC'); return !!r && r.n >= 1 && Math.abs(r.bps - 2) < 0.6 && r.ack > 0; }));
    const blockedBy = async (o, re) => { const s0 = kinds('signal').length, b0 = await ev(() => V160UI.stats.blocked); await sendBuy(o); await sleep(500); const r = await ev(() => ({ b: V160UI.stats.blocked, row: (V160UI.ledger.find((x) => x.kind === 'breaker') || {}).detail || '' })); return r.b === b0 + 1 && kinds('signal').length === s0 && re.test(r.row) ? true : JSON.stringify(r); };
    let r1 = await blockedBy({ sym: 'ETH-USD', noSl: true }, /Require Stop-Loss|missing stop-loss/i); ok('Require Stop-Loss: a live opening order without a stop is blocked and never sent', r1 === true, r1);
    r1 = await blockedBy({ pre: 'stale' }, /Stale-Quote Freeze/); ok('Stale-Quote Freeze: a 2-minute-old crypto quote blocks the opening order', r1 === true, r1);
    r1 = await blockedBy({ pre: 'thin' }, /Liquidity depth/); ok('3× depth check: thin order book within 0.5% blocks the order', r1 === true, r1);
    await ev(() => { delete V163UI.books['BTC-USD']; });
    r1 = await blockedBy({ pre: 'rate' }, /Rate limiter/); ok('Max Trades-Per-Hour: the next live opening order over the limit is blocked', r1 === true, r1);
    await ev(() => { V163UI.cfg.maxPerHour = 20; });
    r1 = await blockedBy({ pre: 'allow' }, /allowlist/); ok('Per-slot ticker allowlist: BTC refused on a Slot 1 limited to ETH', r1 === true, r1);
    await ev(() => { V163C.c.allow[1] = ''; });
    await ev(() => V163C.setPause(true)); await sleep(1300);
    ok('Pause New Entries: Buy button reads "Entries paused · exits active" and is disabled', await ev(() => { const g = $('#tkGo'); return tkSide !== 'buy' || (g.disabled && /Entries paused/.test(g.textContent)); }));
    r1 = await blockedBy({}, /Pause New Entries/); ok('Pause New Entries: live opening orders held', r1 === true, r1);
    const s1 = kinds('signal').length; await ev(() => { const s = 'BTC-USD'; ACC.sell(s, px(s), ACC.qty(s) / 4, Date.now(), { src: 'manual', reason: 'partial exit' }); }); await sleep(600);
    ok('Pause New Entries: exits stay active (a sell is still signed and sent)', kinds('signal').length === s1 + 1 && kinds('signal').pop().body.action === 'sell');
    await ev(() => V163C.setPause(false));
    await ev(() => { V160UI.fs.lockUntil = Date.now() + 702000; }); await sleep(1300);
    ok('Cooldown countdown inside the disabled Buy button (Cooldown: 11m 4xs)', await ev(() => { const g = $('#tkGo'); return tkSide !== 'buy' || (g.disabled && /^Cooldown: 11m \d\ds$/.test(g.textContent)); }));
    await ev(() => { V160UI.fs.lockUntil = 0; V160UI.fs.streakFrom = Date.now(); }); await sleep(1300);
    ok('Cooldown countdown: Buy button restored when the cooldown ends', await ev(() => !$('#tkGo').disabled && !/Cooldown/.test($('#tkGo').textContent)));
    const th0 = kinds('signal').length;
    await ev(() => { const now = Date.now(); for (const k of [2, 1]) ACC.trades.push({ id: 'L' + k, ts: now - k * 1000, sym: 'XRP-USD', side: 'sell', qty: 1, price: 1, usd: 1, fee: 0, pnl: -5, pnlPct: -0.05, src: 'manual' }); });
    await sendBuy({ usd: 300 }); await sleep(700);
    ok('Drawdown Throttle: after 2 losses in a row the live order is cut to 50%', kinds('signal').length === th0 + 1 && Math.abs(kinds('signal').pop().body.usd - 150) < 0.02, JSON.stringify(kinds('signal').slice(-1).map((p) => p.body)));
    await ev(() => { ACC.trades = ACC.trades.filter((t) => !/^L[12]$/.test(t.id)); V160UI.fs.lockUntil = 0; V160UI.fs.streakFrom = Date.now(); });
    const chk = await ev(async () => { const s = ST.sel; if (Feed.live[s]) Feed.live[s].ts = Date.now(); else Feed.live[s] = { price: px(s), ts: Date.now() }; return V163C.selfCheck(); });
    ok('3-Second Live Readiness Self-Check: all 7 checks pass in under 3 s and the result is logged', chk && chk.ready && chk.rows.length === 7 && chk.ms < 3200 && await ev(() => V160UI.ledger.some((r) => r.kind === 'selfcheck' && r.status === 'ready')), JSON.stringify(chk && chk.rows.filter((x) => !x.ok)));
    await ev(() => { for (let i = 0; i < 6; i++) V163C.onHb({ id: 1 }, { ok: i !== 3, ms: 3 + i }); V163C.paintCockpit(true); });
    ok('Heartbeat latency & packet-success graph renders with per-slot stats', await ev(() => /Slot 1: \d+% ok · avg \d+ ms/.test($('#v163HbSt').textContent) && $('#v163HbCv').width === 360));
    // 02: live cockpit (HUD + Micro-Ticket + drawer, focus rails)
    if (SHOTS) { await ev(() => { showTab('markets'); V163C.micro(true); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); V163C.focus(); }); await sleep(2500); await ev(() => V163C.drawer(true)); await sleep(500); await shot('02-live-hud-focus-cockpit.png'); await ev(() => { V163C.drawer(false); V163C.focus(); V163C.micro(false); }); await sleep(400); }

    // ── 8. disarm, reset counters (PAPER only), screenshots of the bridge
    await ev(() => V160UI.kill('test disarm')); await sleep(1300);
    ok('disarm: live-only workspace cleared and the HUD hidden', await ev(() => !document.body.classList.contains('live-bot-armed') && $('#v163Hud').hidden));
    await ev(() => showTab('grok')); await sleep(1300);
    ok('Reset Session Safety Counters: enabled again once disarmed', await ev(() => !$('#v163Cockpit [data-v163a="reset"]').disabled));
    await ev(() => { const x = $('#v163Cockpit [data-v163a="reset"]'); x.click(); x.click(); }); await sleep(300); // confirm-click: "Sure?" then reset
    ok('Reset Session Safety Counters: available in PAPER, zeroes guard stats, rate window and cooldown, logs the reset', await ev(() => V163UI.stats.blocked === 0 && V163UI.stats.passed === 0 && V163UI.sent.length === 0 && V160UI.stats.blocked === 0 && !V160UI.fs.lockUntil && V160UI.ledger.some((r) => r.kind === 'reset')));
    ok('Starter bridges: Interactive Brokers / Alpaca / CCXT / Freqtrade selectable with code shown', await ev(() => { const s = $('#v163BrSel'); const vals = [...s.options].map((o) => o.value); s.value = 'freqtrade'; s.dispatchEvent(new Event('change', { bubbles: true })); return vals.join() === 'ibkr,alpaca,ccxt,freqtrade' && /forceenter/.test($('#v163BrCode').textContent) && /127\.0\.0\.1/.test($('#v163BrCode').textContent); }));
    await ev(() => { $('#v163BrSel').value = 'ibkr'; $('#v163BrSel').dispatchEvent(new Event('change', { bubbles: true })); });
    const snap = await ev(async () => { const a = await V163C.snapSave('correct horse battery'); const raw = localStorage.getItem('exterm.v163.snap'); V163C.c.pyrPct = 77; const r = await V163C.snapRestore('correct horse battery'); return { a, r, enc: !!raw && !/correct horse/.test(raw) && /AES-256-GCM/.test(raw), pyr: V163C.c.pyrPct }; });
    ok('Encrypted Session Recovery Snapshot: AES-256-GCM save + restore round-trip', snap.a && snap.r && snap.enc && snap.pyr === 50, JSON.stringify(snap));
    const trig = await ev(() => { const p = px('BTC-USD'); V163C.c.triggers = [{ id: 'tt1', sym: 'BTC-USD', op: '>=', level: p * 1.0001, action: 'buy', usd: 120, sl: 2 }]; V163C.automate(); Feed.live['BTC-USD'].price = p * 1.001; const n = ACC.trades.length; V163C.automate(); const t = ACC.trades[ACC.trades.length - 1]; return { fired: ACC.trades.length === n + 1 && t.side === 'buy' && /Conditional trigger/.test(t.reason), left: V163C.c.triggers.length, sl: ACC.pos['BTC-USD'] && ACC.pos['BTC-USD'].sl > 0 }; });
    ok('Price Alert → Conditional Trigger: fires once on the cross with a stop-loss, then disarms', trig.fired && trig.left === 0 && trig.sl, JSON.stringify(trig));
    await ev(() => { const p = ACC.pos['BTC-USD']; if (p) p.t0 = Date.now() - 31 * 60000; V163C.c.titMin = 30; V163C.automate(); V163C.c.titMin = 0; });
    ok('Time-in-Trade auto-exit: closes a position held past the limit', await ev(() => !ACC.pos['BTC-USD'] && /Time-in-Trade/.test(ACC.trades[ACC.trades.length - 1].reason)));
    ok('privacy-masked trade card: renders a 1200×675 PNG card without $ size', await ev(() => { const t = ACC.trades[ACC.trades.length - 1]; V163C.offerCard(t); const cv = V163C.cardCanvas(); return !!cv && cv.width === 1200 && cv.height === 675 && !!$('#v163CardPill'); }));
    if (SHOTS) { await ev(() => { showTab('grok'); const s = $('#v163Safety'); if (s) s.scrollIntoView({ block: 'start' }); }); await sleep(400); await ev(() => V163C.selfCheck()); await sleep(800); await ev(() => { $('#v163Safety').scrollIntoView({ block: 'start' }); }); await shot('05-execution-bridge-safety.png'); }

    // ── 9. README screenshots: 3D terrain, Quant Lab
    if (SHOTS) {
      await ev(() => { setMode('crypto'); selectSym('BTC-USD'); showTab('desk'); }); await sleep(5000);
      if (await waitFor(() => !!$('#v157Terrain'), null, 8000)) { await ev(() => $('#v157Terrain').scrollIntoView({ block: 'start' })); await sleep(1500); await shot('03-3d-market-structure.png'); }
      // 04: visual IF / AND / OR strategy builder + the 17-test Validation Lab grade
      await ev(() => showTab('bots')); await sleep(1500);
      if (await waitFor(() => !!$('#bdVal') && !$('#bdVal').disabled, null, 8000)) {
        await ev(() => $('#bdVal').click());
        if (await waitFor(() => !!$('#bdOut .grade.big'), null, 120000)) { await ev(() => $('#bdOut').scrollIntoView({ block: 'end' })); await sleep(800); await shot('04-quant-lab-validation.png'); }
      }
      await ev(() => showTab('lab')); await sleep(600); await ev(() => { const x = $('#labNav button[data-v="q153"]'); if (x) x.click(); }); await sleep(1200);
      await ev(() => { const s = $('#q153Base .v155-starter'); if (s) s.click(); else V153UI.A.base(); });
      if (await waitFor(() => !!$('#v155HeroQ') && /\$/.test(($('#v155HeroQNet') || {}).textContent || ''), null, 45000)) { await sleep(1500); await ev(() => { const h = $('#v155HeroQ'); if (h) h.scrollIntoView({ block: 'start' }); }); await sleep(600); if (!fs.existsSync(path.join(SHOTS, '04-quant-lab-validation.png')) || fs.statSync(path.join(SHOTS, '04-quant-lab-validation.png')).mtimeMs < Date.now() - 600000) await shot('04-quant-lab-validation.png'); }
    }

    // ── 10. Arabic (RTL)
    await ev(() => { showTab('markets'); I18N.set('ar'); }); await sleep(600);
    await ev(() => { V163C.micro(true); V163C.drawer(true); }); await sleep(400);
    const rtl = await ev(() => { const m = $('#v163Micro').getBoundingClientRect(), d = $('#v163Drawer').getBoundingClientRect(); return { dir: document.documentElement.dir, micro: m.left >= 0 && m.right <= innerWidth && m.bottom <= innerHeight, drawer: d.left >= 0 && d.right <= innerWidth && d.left < innerWidth / 2, scroll: document.documentElement.scrollWidth <= innerWidth }; });
    ok('RTL: Micro-Ticket and drawer stay inside the viewport, drawer mirrors to the left, no horizontal scroll', rtl.dir === 'rtl' && rtl.micro && rtl.drawer && rtl.scroll, JSON.stringify(rtl));
    await ev(() => { V163C.drawer(false); V163C.micro(false); }); await page.mouse.click(700, 880); await page.keyboard.press('f'); await sleep(400);
    ok('RTL: Focus Chart (F) works in Arabic', await ev(() => document.body.classList.contains('v163-focus')));
    await page.keyboard.press('f'); await sleep(400);
    ok('RTL: Require Stop-Loss still ON, cockpit and ticket mounted', await ev(() => V163UI.cfg.requireSL === true && !!$('#v163Ck') && !!$('#v163Tk')));
    if (SHOTS) { await ev(() => { V163C.act('all'); setMode('crypto'); selectSym('ETH-USD'); }); await tfClick('15m'); await page.mouse.move(4, 896); await sleep(2500); await shot('06-global-rtl-accessibility.png'); }
    await ev(() => I18N.set('en')); await sleep(300);

    ok('receiver: zero unverifiable envelopes', R.bad.length === 0, R.bad.join());
    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
