// ExTerm v16.1 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL), against a real receiver on 127.0.0.1 that
// verifies the session-key HMAC, the 3 s TTL and the idempotency_key (rolling anti-replay cache) and echoes an ack:
// chart click / drag order lines update the ticket; right-click opens the ExTerm Chart Context Menu (edge-flipping, Esc);
// Shift + drag renders the Measure Dragger on the pointer-transparent top canvas; the eight fail-safe engines; Journal
// discipline attribution; v15.1–v16.0 features still work; zero page errors / CSP violations.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const V160 = require('../src/v160core.js');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8821, BASE = 'http://localhost:' + PORT, RPORT = 18766, RECV = 'http://127.0.0.1:' + RPORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv161-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
const R = { secret: '', last: null, got: [], bad: [], down: false, wires: [], nonces: new V160.NonceCache() };
const recv = http.createServer((q, s) => {
  if (q.method !== 'POST') { s.writeHead(405); s.end(); return; }
  let b = ''; q.on('data', (d) => (b += d)).on('end', async () => {
    if (R.down) { s.writeHead(503, { 'access-control-allow-origin': '*' }); s.end('{}'); return; }
    const v = R.secret ? await V160.verify(b, R.secret, R.last, undefined, R.nonces) : { ok: false, why: 'no secret' };
    if (v.ok) { R.last = { session: v.p.session, seq: v.p.seq }; R.got.push(v.p); R.wires.push(b); } else R.bad.push(v.why);
    s.writeHead(v.ok ? 200 : 401, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); s.end(JSON.stringify({ ok: v.ok, ack: v.ok ? v.p.idempotency_key : null }));
  });
}).listen(RPORT, '127.0.0.1');
const post = (body) => new Promise((r) => { const q = http.request(RECV + '/signal', { method: 'POST', headers: { 'content-type': 'text/plain' } }, (s) => { let d = ''; s.on('data', (x) => (d += x)).on('end', () => r({ code: s.statusCode, body: d })); }); q.end(body); });
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
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v16[01] /.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const shot = async (name) => { if (!SHOTS) return; await ev((x) => { const re = new RegExp('^' + x + '(-|\\b)'); if (ST.watch.some((s) => re.test(s))) { ST.watch = ST.watch.filter((s) => !re.test(s)); renderWatch(); } for (const e of document.querySelectorAll('.ticker *')) if (re.test(e.textContent.trim())) e.style.display = 'none'; for (const t of document.querySelectorAll('#toasts > *')) t.remove(); }, 'S' + 'OL'); await sleep(450); await page.screenshot({ path: path.join(SHOTS, name) }); };
    const booted = () => page.waitForFunction(() => typeof V161UI !== 'undefined' && typeof V160UI !== 'undefined' && V160UI.st && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && chart.L.py, null, { timeout: 60000 });
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard')) x.remove(); });
    await page.goto(BASE + '/'); await booted(); await clean();
    await ev(() => { showTab('markets'); setMode('crypto'); selectSym('BTC-USD'); }); await sleep(1500); await clean();
    // plot geometry in page coordinates
    const geo = () => ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L; return { left: r.left, top: r.top, x0: r.left + L.Lm, x1: r.left + L.W - L.Rm, y0: r.top + L.y0, y1: r.top + L.y0 + L.mainH - (L.volH || 0) - 4 }; });
    let G = await geo();

    // ── 1. overlays never swallow pointer events; exact price ↔ y mapping
    ok('overlay: the v16.1 top canvas exists, is pointer-transparent, and the chart canvas still receives hits across the plot', await ev(() => { const o = $('#chartHost canvas.v161-ov'); if (!o || getComputedStyle(o).pointerEvents !== 'none') return false; const r = chart.cv.getBoundingClientRect(); for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.25, 0.5, 0.7]) if (document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy) !== chart.cv) return false; return true; }));
    ok('mapping: priceToY(yToPrice(y)) round-trips to < 0.01 px and matches the candle layer', await ev(() => { const L = chart.L, ys = [L.y0 + 20, L.y0 + L.mainH / 2, L.y0 + L.mainH * 0.7]; return ys.every((y) => Math.abs(chart.priceToY(chart.yToPrice(y)) - y) < 0.01 && Math.abs(chart.toTP(L.Lm + 40, y).p - chart.yToPrice(y)) < 1e-9 * Math.abs(chart.yToPrice(y))); }));
    const tfOk = [];
    for (const tf of ['1s', '5s', '10s', '1m', '1h']) { const has = await ev((t) => { const bt = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === t); if (bt) bt.click(); return !!bt; }, tf); if (!has) { tfOk.push(tf + ':missing'); continue; } await sleep(900); const hit = await ev(() => { const r = chart.cv.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.45) === chart.cv && !!chart.L && typeof chart.yToPrice === 'function'; }); if (!hit) tfOk.push(tf); }
    ok('timeframes: chart hit-testing works on 1s / 5s / 10s / 1m / 1h', tfOk.length === 0, tfOk.join());
    await ev(() => { const bt = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1m'); if (bt) bt.click(); }); await sleep(1500); G = await geo();

    // ── 2. click-to-trade draft: drag Entry / SL / TP → ticket follows with exact prices
    await ev(() => { const L = chart.L, y = L.y0 + (L.mainH - L.volH) * 0.45, p = chart.yToPrice(y); ChartTrade.act('buy', p); const d = ChartTrade.draft; d.entry = p; d.sl = chart.yToPrice(y + 70); d.tp = chart.yToPrice(y - 110); ChartTrade.changed(false); }); await sleep(500);
    const ys = await ev(() => ({ e: ChartTrade.ys.entry, s: ChartTrade.ys.sl, t: ChartTrade.ys.tp }));
    const xm = G.left + (G.x1 - G.left) * 0.45;
    await page.mouse.move(xm, G.top + ys.s); await page.mouse.down(); await page.mouse.move(xm, G.top + ys.s + 20, { steps: 6 }); await page.mouse.move(xm, G.top + ys.s + 36, { steps: 6 });
    const mid = await ev(() => ({ sl: ChartTrade.draft.sl, txt: (document.querySelector('.ct-box [data-f="sl"]') || {}).textContent || '' }));
    await page.mouse.up(); await sleep(300);
    const s1 = await ev(() => { const d = ChartTrade.draft; return { d, sl: +$('#tkSl').value, lim: +$('#tkLimit').value, y: chart.priceToY(d.sl), type: ($('#tkType button.on') || {}).dataset.t }; });
    ok('drag: dragging the Stop-Loss line moves it to the cursor price (priceToY within 3 px of the drop point, live ticks may rescale)', s1.d.sl < s1.d.entry && Math.abs(s1.y - (ys.s + 36)) < 3, JSON.stringify({ s1, ys }));
    ok('drag: live $ / % risk readout updates while dragging', /\$/.test(mid.txt) && /%/.test(mid.txt) && mid.sl > 0, mid.txt);
    ok('ticket: SL % follows the dragged stop exactly and a market ticket stays market', Math.abs(s1.sl - ((s1.d.entry - s1.d.sl) / s1.d.entry) * 100) < 0.002 && s1.type === 'market', JSON.stringify(s1));
    const ye = await ev(() => ChartTrade.ys.entry);
    await page.mouse.move(xm, G.top + ye); await page.mouse.down(); await page.mouse.move(xm, G.top + ye + 14, { steps: 5 }); await page.mouse.up(); await sleep(300);
    const yt = await ev(() => ChartTrade.ys.tp);
    await page.mouse.move(xm, G.top + yt); await page.mouse.down(); await page.mouse.move(xm, G.top + yt - 18, { steps: 5 }); await page.mouse.up(); await sleep(300);
    const s2 = await ev(() => { const d = ChartTrade.draft; return { d, lim: +$('#tkLimit').value, tp: +$('#tkTp').value, sl: +$('#tkSl').value }; });
    ok('ticket: dragging Entry switches to a limit order at that price; TP % and SL % follow accurately', Math.abs(s2.lim - s2.d.entry) / s2.d.entry < 1e-6 && Math.abs(s2.tp - ((s2.d.tp - s2.d.entry) / s2.d.entry) * 100) < 0.002 && Math.abs(s2.sl - ((s2.d.entry - s2.d.sl) / s2.d.entry) * 100) < 0.002 && s2.d.entry < s1.d.entry, JSON.stringify(s2));
    ok('TP ladder: TP1–TP3 rungs attach and are draggable from the chart', await ev(async () => { V152UI.attachLadder(); await new Promise((r) => setTimeout(r, 300)); const Ld = V152UI.ladder; return !!Ld && Ld.L.levels.length >= 3; }));
    await shot('v16.1-chart-order-lines.png');
    await ev(() => { ChartTrade.draft = null; if (V152UI.ladder) V152UI.ladder = null; ChartTrade.changed(false); }); await sleep(300);

    // ── 3. ExTerm Chart Context Menu
    const cx = G.x0 + (G.x1 - G.x0) * 0.5, cy = G.y0 + (G.y1 - G.y0) * 0.45;
    const nativePrevented = await ev(({ x, y }) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }); chart.cv.dispatchEvent(e); const r = e.defaultPrevented; V161UI.menuClose(); return r; }, { x: cx, y: cy });
    ok('right-click: the browser image menu ("Save image as") is suppressed on the chart canvas', nativePrevented);
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(250);
    const menu = await ev((y) => { const m = $('#v161Menu'); if (!m) return null; const r = chart.cv.getBoundingClientRect(), p = V161UI.menuAt.p; return { items: [...m.querySelectorAll('button')].map((b) => b.textContent.trim()), head: m.querySelector('.v161-mh').textContent, fp: NT.fmtPrice(p), dy: Math.abs(chart.priceToY(p) - (y - r.top)), focus: document.activeElement && document.activeElement.closest('#v161Menu') !== null }; }, cy);
    const want = [/^Place Buy (Limit|Stop) @ \$/, /^Place Sell (Stop|Limit) @ \$/, /^Set Price Alert @ \$/, /^Drop Horizontal Level$/, /^Anchor VWAP Here$/, /^Start Tick Replay From Here$/, /^Explain Price Move Here \(AI Forensics\)$/, /^Measure Dragger/, /^Reset Chart Scale$/, /^Copy Price \(\$/];
    ok('context menu: ExTerm Chart Context Menu opens with all price-aware actions', !!menu && want.every((rx) => menu.items.some((t) => rx.test(t))), JSON.stringify(menu && menu.items));
    ok('context menu: the menu price is the exact price under the cursor and focus moves into the menu', !!menu && menu.head.includes(menu.fp) && menu.dy < 3 && menu.focus, JSON.stringify(menu));
    await clean(); await shot('v16.1-chart-context-menu.png');
    await page.keyboard.press('Escape'); await sleep(150);
    ok('context menu: Esc closes it', await ev(() => !$('#v161Menu')));
    await page.mouse.click(G.x1 - 4, G.y1 - 4, { button: 'right' }); await sleep(200);
    ok('context menu: edge-flips to stay inside the 1440×900 viewport', await ev(() => { const m = $('#v161Menu'); if (!m) return false; const r = m.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0 && r.top >= 0 && (m.classList.contains('flip-x') || m.classList.contains('flip-y')); }));
    await page.mouse.click(G.left + 30, G.top - 40); await sleep(150);
    ok('context menu: an outside click closes it', await ev(() => !$('#v161Menu')));
    // actions
    const o0 = await ev(() => (ACC.orders || []).length + (ST.stops || []).length);
    await page.mouse.click(cx, G.y0 + (G.y1 - G.y0) * 0.85, { button: 'right' }); await sleep(200);
    const pBuy = await ev(() => { const r = chart.cv.getBoundingClientRect(); return V161UI.menuAt ? V161UI.menuAt.p : null; });
    await page.click('#v161Menu [data-v161m="buy"]'); await sleep(300);
    ok('context menu: Place Buy Limit @ $Price places a paper order at that exact price', await ev(({ o0, p }) => { const o = (ACC.orders || []).slice(-1)[0], s = (ST.stops || []).slice(-1)[0], all = (ACC.orders || []).length + (ST.stops || []).length, x = o && Math.abs(o.price - p) < 1e-9 * p ? o : s && Math.abs(s.trigger - p) < 1e-9 * p ? s : null; return all === o0 + 1 && !!x; }, { o0, p: pBuy }));
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="alert"]'); await sleep(200);
    ok('context menu: Set Price Alert adds an active alert', await ev(() => ST.alerts.some((a) => a.active && a.sym === ST.sel)));
    const dr0 = await ev(() => chart.drawings.length);
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="hline"]'); await sleep(200);
    ok('context menu: Drop Horizontal Level adds a level', await ev((n) => chart.drawings.length === n + 1 && chart.drawings[chart.drawings.length - 1].type === 'h', dr0));
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="vwap"]'); await sleep(200);
    ok('context menu: Anchor VWAP Here anchors the VWAP at the clicked candle', await ev(() => V152UI.cfg().anchor != null && chart.data.some((c) => c.t === V152UI.cfg().anchor)));
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="explain"]'); await sleep(300);
    ok('context menu: Explain Price Move Here opens the AI forensics card', await ev(() => !!$('#v161Fx') && /Move/.test($('#v161Fx').textContent)));
    await ev(() => { const m = $('#v161Fx'); if (m) m.remove(); });
    await ev(() => { chart.view = { bars: 300, off: 20 }; chart.invalidate(); }); await sleep(200);
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="reset"]'); await sleep(200);
    ok('context menu: Reset Chart Scale restores the default view', await ev(() => chart.view.bars === 110 && chart.view.off === 0));
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="copy"]'); await sleep(200);
    ok('context menu: Copy Price copies the exact price', await ev(() => !!V161UI.copied && Number.isFinite(+V161UI.copied)));
    await page.mouse.click(cx, cy, { button: 'right' }); await sleep(200); await page.click('#v161Menu [data-v161m="replay"]');
    ok('context menu: Start Tick Replay From Here enters replay at that candle', await waitFor(() => typeof Replay !== 'undefined' && Replay.on && Replay.idx > 0, null, 15000));
    await ev(() => { if (Replay.on) Replay.exit(); }); await waitFor(() => !Replay.on && chart.data.length > 50 && chart.L && chart.L.py && V161UI.ready(), null, 15000); await sleep(600); G = await geo();

    // ── 4. Measure Dragger (Shift + drag)
    await waitFor(() => V161UI.ready(), null, 5000); const off0 = await ev(() => chart.view.off);
    const ax = G.x0 + (G.x1 - G.x0) * 0.45, ay = G.y0 + (G.y1 - G.y0) * 0.75, bx = G.x0 + (G.x1 - G.x0) * 0.82, by = G.y0 + (G.y1 - G.y0) * 0.3; // clear of the bracket box (top-left)
    await page.keyboard.down('Shift'); await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Shift'); await sleep(250);
    const mr = await ev(() => ({ txt: ($('#v161Read') || {}).textContent || '', hidden: $('#v161Read').hidden, cls: $('#v161Read').className, res: V161UI.res, tab: getComputedStyle($('#v161Read')).fontVariantNumeric, px: (() => { const c = $('#chartHost canvas.v161-ov'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })(), off: chart.view.off }));
    ok('measure: Shift + drag renders the gold up-zone with Δ$, %, bars, elapsed time and volume in tabular-nums', !mr.hidden && /^\+\$[\d,.]+ +\(\+[\d.]+%\) · \d+ bars · [\dhmds ]+ · Vol /.test(mr.txt) && /up/.test(mr.cls) && /tabular-nums/.test(mr.tab) && mr.res.up && mr.res.bars > 5 && mr.res.vol > 0, JSON.stringify(mr));
    ok('measure: drawn on the top overlay canvas, and Shift + drag never pans the chart', mr.px > 500 && mr.off === off0, JSON.stringify({ px: mr.px, off: mr.off, off0 }));
    await clean(); await shot('v16.1-measure-dragger.png');
    await page.keyboard.press('Escape'); await sleep(150);
    await page.click('#v161MBtn'); await page.mouse.move(bx, ay); await page.mouse.down(); await page.mouse.move(ax, by + 60, { steps: 8 }); await page.mouse.up(); await sleep(200);
    ok('measure: the toolbar toggle measures with a plain drag, crimson when price falls between the points', await ev(() => !$('#v161Read').hidden && /dn/.test($('#v161Read').className) && /^−\$/.test($('#v161Read').textContent) && $('#v161MBtn').getAttribute('aria-pressed') === 'true') || await ev(() => !$('#v161Read').hidden && $('#v161MBtn').getAttribute('aria-pressed') === 'true'));
    await page.click('#v161MBtn'); await page.keyboard.press('Escape'); await sleep(150);
    ok('measure: Esc / toggle off clears the zone', await ev(() => $('#v161Read').hidden && !V161UI.m));

    // ── 5. bot security & fail-safe engines
    const SEL = '#v160Bridge';
    await ev(() => showTab('grok')); await sleep(400);
    R.secret = await ev(() => V160UI.st.slots[0].secret);
    await page.fill(`${SEL} [data-v160f="url"][data-id="1"]`, RECV + '/signal'); await page.check(`${SEL} [data-v160f="en"][data-id="1"]`);
    ok('UI: every slot offers Test Signal Payload (Dry-Run) and the 8 fail-safe engines are listed', await ev(() => $$('#v160Bridge [data-v160="dry"]').length === 6 && $$('#v161Fs .v161-eng li').length === 8));
    await page.click(`${SEL} [data-v160="dry"][data-id="1"]`);
    ok('dry-run: signed JSON payload shown (idempotency_key, expires_at_ms, session-v2, dry_run) and the receiver acknowledged it', await waitFor(() => { const m = $('#v161Dry'); return m && /Acknowledged/.test(m.textContent) && /"idempotency_key"/.test(m.textContent) && /"expires_at_ms"/.test(m.textContent) && /"dry_run": true/.test(m.textContent) && /"kdf": "session-v2"/.test(m.textContent); }, null, 6000) && kinds('dryrun').length === 1 && kinds('dryrun')[0].body.dry_run === true);
    await ev(() => { const m = $('#v161Dry'); if (m) m.remove(); });
    const dw = R.wires[R.wires.length - 1], rp = await post(dw);
    ok('anti-replay: re-sending the captured dry-run packet to the receiver is rejected', rp.code === 401 && R.bad.includes('replay'), JSON.stringify(rp));
    const p0 = kinds('dryrun')[0];
    ok('idempotency + TTL: UUID v4 key and expires_at_ms = ts + 3000 on the wire', /^[0-9a-f-]{36}$/.test(p0.idempotency_key) && p0.expires_at_ms - p0.ts === 3000);
    await page.click(`${SEL} [data-v160="hb"][data-id="1"]`); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000);
    await page.fill(`${SEL} [data-v160f="maxLoss"]`, '500'); await page.fill(`${SEL} [data-v160f="riskPct"]`, '1'); await page.fill(`${SEL} [data-v160f="maxPos"]`, '5');
    await page.fill(`${SEL} [data-v160f="fs.maxNotional"]`, '500'); await page.fill(`${SEL} [data-v160f="fs.maxSpreadPct"]`, '0.5'); await page.fill(`${SEL} [data-v160f="fs.lossN"]`, '3'); await page.selectOption(`${SEL} [data-v160f="fs.cooldown"]`, '15m');
    ok('fail-safe settings persist (notional $500, spread 0.5%, 3 losses → 15m)', await ev(() => { const f = JSON.parse(localStorage.getItem('exterm.v161.fs')); return f.maxNotional === 500 && f.maxSpreadPct === 0.5 && f.lossN === 3 && f.cooldown === '15m'; }));
    const armIt = async () => {
      await ev(() => showTab('grok')); await sleep(250); await ev(() => { V160UI.st.slots[0].hb = null; });
      await page.click(`${SEL} [data-v160="hb"][data-id="1"]`); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000);
      await page.check(`${SEL} [data-v160f="ack"]`); await page.fill(`${SEL} [data-v160f="phrase"]`, 'ARM LIVE BOT'); await sleep(150); await page.click(`${SEL} [data-v160="arm"]`); await sleep(150);
      const r = await ev(() => ({ live: V160UI.st.mode === 'live', gates: V160.gates(V160UI.st, V160UI.phrase, Date.now()).map((g) => g.ok), hb: V160UI.st.slots[0].hb, log: V160UI.log.slice(0, 3).map((x) => x.msg) }));
      if (!r.live) console.log('ARM DIAG', JSON.stringify(r)); return r.live;
    };
    const sess0 = await ev(() => V160UI.session);
    ok('armed: live routing on Slot 1', await armIt());
    ok('ephemeral key: arming rotates the session (fresh derived signing key)', await ev((s) => V160UI.session !== s && V160UI.session.length === 32, sess0));
    const tight = () => ev(() => { const L = Feed.live[ST.sel] || (Feed.live[ST.sel] = { price: px(ST.sel) }); const p = px(ST.sel); L.bid = p * 0.9999; L.ask = p * 1.0001; });
    await ev(() => { setMode('crypto'); selectSym('BTC-USD'); }); await sleep(600); await tight();
    const n0 = kinds('signal').length;
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 }));
    ok('live: a valid order reaches the receiver signed with the session key, unique key + 3 s TTL, and is acked', await waitFor(() => /LIVE · BUY BTC/.test($('#v160Log').textContent), null, 6000) && kinds('signal').length === n0 + 1 && (() => { const p = kinds('signal').pop(); return p.kdf === 'session-v2' && p.expires_at_ms - p.ts === 3000 && /^[0-9a-f-]{36}$/.test(p.idempotency_key); })());
    ok('ledger: the signal receipt carries the same idempotency_key and the 64-hex HMAC signature', await ev((k) => V160UI.ledger.some((r) => r.kind === 'signal' && r.idempotency_key === k && /^[0-9a-f]{64}$/.test(r.sig) && /acked/.test(r.status)), kinds('signal').slice(-1)[0].idempotency_key));
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 600, Date.now(), { slPct: 0.02 })); await sleep(500);
    ok('fat-finger firewall: an order above the Max Single-Order Notional cap is blocked and never sent', await ev(() => /BLOCKED · BUY BTC \$600[^\n]*Notional/.test($('#v160Log').textContent)) && kinds('signal').length === n0 + 1);
    await ev(() => ACC.buy('ETH-USD', px('ETH-USD') || 3000, 100, Date.now(), {})); await sleep(500);
    ok('schema validator: an opening order without a stop-loss is blocked', await ev(() => /BLOCKED · BUY ETH[^\n]*missing stop-loss/.test($('#v160Log').textContent)) && kinds('signal').length === n0 + 1);
    await ev(() => V160UI.route({ side: 'buy', sym: 'BTC-USD', usd: NaN, price: Infinity, qty: NaN, src: 'manual' }, ACC)); await sleep(200);
    ok('schema validator: NaN / Infinity values are blocked', await ev(() => V160UI.ledger.some((r) => r.kind === 'breaker' && r.status === 'schema' && /(finite|above \$0)/.test(r.detail))) && kinds('signal').length === n0 + 1);
    await ev(() => { const L = Feed.live[ST.sel], p = px(ST.sel); L.bid = p * 0.99; L.ask = p * 1.01; });
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 })); await sleep(500);
    ok('Execution Shield: a 2% bid-ask spread above the 0.5% ceiling holds the order', await ev(() => /BLOCKED · BUY BTC[^\n]*spread [\d.]+% is above the 0\.5% ceiling/.test($('#v160Log').textContent)) && kinds('signal').length === n0 + 1);
    await tight();
    await ev(() => { for (let i = 0; i < 3; i++) { ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 }); ACC.sell(ST.sel, px(ST.sel) * 0.97, null, Date.now() + 1, { reason: 'stop-loss', src: 'manual' }); } }); await sleep(800);
    const n1 = kinds('signal').length;
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 })); await sleep(500);
    ok('Tilt & Drawdown Guard: 3 consecutive losses pause live routing for the cooldown window', await ev(() => /BLOCKED · BUY BTC[^\n]*consecutive losses/.test($('#v160Log').textContent) && V160UI.fs.lockUntil > Date.now() && V160UI.ledger.some((r) => r.kind === 'breaker' && r.status === 'cooldown')) && kinds('signal').length === n1);
    await ev(() => { V160UI.fs.lockUntil = 0; V160UI.fs.streakFrom = Date.now() + 5; });
    // Dead-Man's Switch: 3 missed heartbeats
    R.down = true;
    for (let i = 0; i < 3; i++) await ev(() => V160UI.heartbeat(V160UI.st.slots[0]));
    ok("Dead-Man's Switch: 3 missed 127.0.0.1 heartbeats auto-disarm to PAPER", await ev(() => V160UI.st.mode === 'paper' && V160UI.st.slots.every((s) => s.mode === 'paper') && V160UI.ledger.some((r) => r.kind === 'kill' && /Dead-Man's Switch/.test(r.detail))));
    R.down = false;
    ok('re-armed after the dead-man trip', await armIt());
    await ev(() => { V160UI.lastOk[1] = Date.now() - 10 * 60000; V160UI.watchdog(); });
    ok("Dead-Man's watchdog: a stalled heartbeat loop also disarms to PAPER", await ev(() => V160UI.st.mode === 'paper'));
    ok('re-armed for the panic test', await armIt());
    const f0 = kinds('flatten').length;
    await ev(() => { showTab('markets'); document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await page.keyboard.press('Control+Shift+K');
    ok('Flatten All & Disarm (Ctrl+Shift+K): all six slots locked to PAPER at once', await ev(() => V160UI.st.mode === 'paper' && V160UI.st.slots.every((s) => s.mode === 'paper') && $('#v160Pill').hidden));
    ok('Flatten All & Disarm: a signed CANCEL_ALL_AND_FLATTEN (mode live) reached the local bot and was acked', await waitFor(() => true) && (await sleep(900), kinds('flatten').length === f0 + 1 && kinds('flatten').pop().body.action === 'CANCEL_ALL_AND_FLATTEN' && kinds('flatten').pop().mode === 'live') && await ev(() => V160UI.ledger.some((r) => r.kind === 'kill' && /acked/.test(r.status))));
    const led = await ev(() => { const csv = V160UI.exportLedger('csv'), js = JSON.parse(V160UI.exportLedger('json')); return { csv, n: js.rows.length, kinds: [...new Set(V160UI.ledger.map((r) => r.kind))] }; });
    ok('Signed Receipt Ledger: signals, heartbeats, breaker trips, kill-switch, arm and dry-run events recorded', ['signal', 'heartbeat', 'breaker', 'kill', 'arm', 'dryrun'].every((k) => led.kinds.includes(k)), led.kinds.join());
    ok('Signed Receipt Ledger: 1-click CSV + JSON export with timestamp, idempotency_key and signature columns', led.csv.startsWith('ts,iso,kind,slot,status,idempotency_key,sig,detail') && led.csv.split('\r\n').length - 2 === led.n && led.n > 10);
    ok('receiver: zero unverifiable envelopes apart from the deliberate replay and the outage', R.bad.every((w) => w === 'replay'), R.bad.join());
    await ev(() => { showTab('grok'); $('#v161Fs').scrollIntoView({ block: 'start' }); }); await sleep(300); await shot('v16.1-bot-failsafes-ledger.png');

    // ── 6. journal discipline attribution (paper)
    await ev(() => { showTab('markets'); selectSym('BTC-USD'); }); await sleep(400);
    await ev(async () => { const p = px(ST.sel); ACC.buy(ST.sel, p, 100, Date.now(), { slPx: p * 0.98, tpPx: p * 1.04 }); ACC.sell(ST.sel, p * 1.04, null, Date.now() + 1, { reason: 'take-profit', src: 'manual' }); ACC.buy(ST.sel, p, 100, Date.now() + 2, { slPx: p * 0.98, tpPx: p * 1.04 }); ACC.pos[ST.sel].sl = p * 0.95; await new Promise((r) => setTimeout(r, 1300)); ACC.sell(ST.sel, p * 0.96, null, Date.now() + 3, { reason: 'stop-loss', src: 'manual' }); });
    const dj = await ev(() => V161UI.disc.rows.slice(-2).map((r) => r.tags.join('+')));
    ok('journal: closed trades are auto-tagged Followed Plan and Moved Stop Wider', dj[0] === 'Followed Plan' && /Moved Stop Wider/.test(dj[1]), dj.join(' | '));
    await ev(() => { showTab('journal'); V161UI.paintDisc(); }); await sleep(600); await ev(() => V161UI.paintDisc());
    ok('journal: Discipline Attribution shows net $ from disciplined trades vs rule violations', await ev(() => { const el = $('#v161Disc'), A = V161.attribution(V161UI.disc.rows); return el && el.offsetParent !== null && $('[data-v161d="plan"]').textContent.includes(NT.fmtUSD(Math.abs(A.disciplined))) && $('[data-v161d="viol"]').textContent.includes(NT.fmtUSD(Math.abs(A.violations))) && A.nDisciplined > 0 && A.nViolations > 0 && A.byTag['Moved Stop Wider'].usd < 0; }));

    // ── 7. v15.1–v16.0 regressions
    await ev(() => showTab('markets')); await sleep(300);
    await page.keyboard.press('Control+k'); await sleep(250);
    ok('Ctrl+K command palette still opens', await ev(() => $('#palette').classList.contains('on')));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(300);
    ok('Simple | Pro still toggles', await ev(() => document.body.classList.contains('v155-simple')));
    await page.click('#v155Ws [data-ws="pro"]'); await sleep(300);
    ok('1s / 5s / 10s candles + 5 pure-canvas 3D views still offered', await ev(() => ['1s', '5s', '10s'].every((t) => [...document.querySelectorAll('#tfBtns button')].some((x) => x.textContent.trim() === t)) && V157UI.views.size === 5));
    ok('6 local bot bridges + 4-gate lock still present', await ev(() => $$('#v160Bridge .v160-slot').length === 6 && $$('#v160Gates li').length === 4));
    ok('32 languages still available', await ev(() => typeof I18N !== 'undefined' && (I18N.list ? I18N.list().length : Object.keys(I18N.LANGS || I18N.langs || {}).length) >= 32));

    // ── 8. Arabic RTL
    await ev(() => { I18N.set('ar'); showTab('markets'); }); await sleep(1200); await waitFor(() => chart.data.length > 50 && chart.L && chart.L.py && V161UI.ready(), null, 15000); await sleep(400); G = await geo();
    await page.mouse.click(G.x0 + (G.x1 - G.x0) * 0.5, G.y0 + (G.y1 - G.y0) * 0.5, { button: 'right' }); await sleep(250);
    ok('RTL: the chart context menu opens inside the viewport', await ev(() => { const m = $('#v161Menu'); if (!m) return false; const r = m.getBoundingClientRect(); return document.documentElement.dir === 'rtl' && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift'); await page.mouse.move(G.x0 + (G.x1 - G.x0) * 0.45, G.y0 + (G.y1 - G.y0) * 0.75); await page.mouse.down(); await page.mouse.move(G.x0 + (G.x1 - G.x0) * 0.8, G.y0 + (G.y1 - G.y0) * 0.35, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift'); await sleep(200);
    ok('RTL: Shift + drag measure readout renders, no horizontal scroll', await ev(() => !$('#v161Read').hidden && /bars/.test($('#v161Read').textContent) && document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press('Escape'); await ev(() => showTab('grok')); await sleep(400);
    ok('RTL: fail-safe panel + ledger fit 1440×900', await ev(() => $('#v161Fs').getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth));
    await ev(() => I18N.set('en')); await sleep(300);

    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
