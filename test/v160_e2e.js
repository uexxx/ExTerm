// ExTerm v16.0 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL), against a real HMAC-verifying receiver on
// 127.0.0.1: fresh install is PAPER; Live External Execution stays disabled until all four gates pass (heartbeat handshake +
// circuit breakers + disclosure + exact ARM LIVE BOT); signed signals reach the receiver only when live; circuit breakers
// block oversized trades; reload with a live bot → briefing modal (Disconnect & Revert to Paper, Acknowledge & Continue);
// Ctrl+Shift+K kill-switch; v15.1–v15.7 features still work; zero page errors / CSP violations.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const V160 = require('../src/v160core.js');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8820, BASE = 'http://localhost:' + PORT, RPORT = 18765, RECV = 'http://127.0.0.1:' + RPORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv160-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
// local receiver: verifies every envelope with the slot secret the test reads from the page
const R = { secret: '', last: null, got: [], bad: 0 };
const recv = http.createServer((q, s) => {
  if (q.method !== 'POST') { s.writeHead(405); s.end(); return; }
  let b = ''; q.on('data', (d) => (b += d)).on('end', async () => {
    const v = R.secret ? await V160.verify(b, R.secret, R.last) : { ok: false };
    if (v.ok) { R.last = { session: v.p.session, seq: v.p.seq }; R.got.push(v.p); } else R.bad++;
    s.writeHead(v.ok ? 200 : 401, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); s.end(JSON.stringify({ ok: v.ok }));
  });
}).listen(RPORT, '127.0.0.1');
const kinds = (k) => R.got.filter((p) => p.kind === k);
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { recv.close(); } catch (e) { /* closed */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(BASE) || u.startsWith(RECV) ? r.continue() : r.abort(); });
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v160 /.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const shot = async (name) => { if (!SHOTS) return; await ev((x) => { const re = new RegExp('^' + x + '(-|\\b)'); if (ST.watch.some((s) => re.test(s))) { ST.watch = ST.watch.filter((s) => !re.test(s)); renderWatch(); } for (const e of document.querySelectorAll('.ticker *')) if (re.test(e.textContent.trim())) e.style.display = 'none'; for (const t of document.querySelectorAll('#toasts > *')) t.remove(); }, 'S' + 'OL'); await sleep(500); await page.screenshot({ path: path.join(SHOTS, name) }); }; // docs screenshots keep to the majors
    const booted = () => page.waitForFunction(() => typeof V160UI !== 'undefined' && V160UI.st && document.body.classList.contains('v160') && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard')) x.remove(); });
    await page.goto(BASE + '/'); await booted(); await clean();

    // ── 1. fresh install: PAPER everywhere, UI mounted
    ok('fresh install: PAPER mode on all six slots, no slot enabled, pill hidden', await ev(() => V160UI.st.mode === 'paper' && V160UI.st.slots.length === 6 && V160UI.st.slots.every((s) => s.mode === 'paper' && !s.enabled) && $('#v160Pill').hidden));
    await ev(() => showTab('grok')); await sleep(400);
    ok('Grok tab: Execution Bridge panel shows six adapter slots with originals names + receiver schema', await ev(() => $$('#tab-grok #v160Bridge .v160-slot').length === 6 && /Local Python \/ Node Script Runner/.test($('#v160Bridge').textContent) && /Graduated Shadow-to-Live Mirror/.test($('#v160Bridge').textContent) && $$('#v160Bridge .v160-schema').length === 6));
    ok('Settings tab: bridge status card reads PAPER / SIMULATION', await ev(() => /PAPER \/ SIMULATION/.test($('#tab-set #v160Set').textContent)));
    ok('lock: Enable Live External Execution is disabled, all four gates closed', await ev(() => $('[data-v160="arm"]').disabled && $$('#v160Gates li').length === 4 && $$('#v160Gates li.ok').length === 0));

    // ── 2. SSRF guard in the UI
    const url1 = '#v160Bridge [data-v160f="url"][data-id="1"]';
    await page.fill(url1, 'http://example.com/hook');
    ok('ssrf: a public endpoint is flagged and its heartbeat is refused without any request', await ev(async () => { const s = V160UI.st.slots[0]; const hb = await V160UI.heartbeat(s); return !hb.ok && /127\.0\.0\.1/.test(hb.why) && /127\.0\.0\.1/.test($('[data-v160err="1"]').textContent); }) && R.got.length === 0 && R.bad === 0);

    // ── 3. paper mode: fills are simulated, nothing leaves the page
    R.secret = await ev(() => V160UI.st.slots[0].secret);
    await page.fill(url1, RECV + '/signal'); await page.check('#v160Bridge [data-v160f="en"][data-id="1"]');
    await ev(() => { setMode('crypto'); selectSym('BTC-USD'); }); await sleep(800);
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 }));
    ok('paper: a paper fill is logged as simulated and nothing is sent', await waitFor(() => /PAPER · BUY BTC/.test($('#v160Log').textContent), null, 3000) && R.got.length === 0);

    // ── 4. four gates, one at a time
    await page.click('#v160Bridge [data-v160="hb"][data-id="1"]');
    ok('gate 1: heartbeat handshake with the 127.0.0.1 receiver (signed, verified, latency in ms)', await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok && /\d+ ms/.test($('[data-v160hb="1"]').textContent), null, 6000) && kinds('heartbeat').length === 1 && R.bad === 0, JSON.stringify(R));
    const gatesOk = () => ev(() => $$('#v160Gates li.ok').length), armDisabled = () => ev(() => $('[data-v160="arm"]').disabled);
    ok('after gate 1 only: still locked', (await gatesOk()) === 1 && (await armDisabled()));
    await page.fill('[data-v160f="maxLoss"]', '500'); await page.fill('[data-v160f="riskPct"]', '1');
    ok('gate 2 partially set (2 of 3 breakers): still locked', (await gatesOk()) === 1 && (await armDisabled()));
    await page.fill('[data-v160f="maxPos"]', '3');
    ok('gate 2: all three circuit breakers set; still locked', (await gatesOk()) === 2 && (await armDisabled()));
    await page.check('[data-v160f="ack"]');
    ok('gate 3: disclosure accepted; still locked', (await gatesOk()) === 3 && (await armDisabled()));
    for (const p of ['arm live bot', 'ARM LIVE', 'ARM LIVE BOT!']) await page.fill('[data-v160f="phrase"]', p);
    ok('gate 4: a wrong phrase keeps the switch locked', (await gatesOk()) === 3 && (await armDisabled()));
    ok('lock: forcing arm() past the UI is refused while a gate is closed', await ev(() => { V160UI.arm(); return V160UI.st.mode === 'paper'; }));
    await page.fill('[data-v160f="phrase"]', 'ARM LIVE BOT');
    ok('gate 4: exact phrase → all four gates pass and the switch unlocks', (await gatesOk()) === 4 && !(await armDisabled()));
    await ev(() => $('#v160Lock').scrollIntoView({ block: 'center' })); await shot('v16.0-4-gate-live-lock.png');
    await page.click('[data-v160="arm"]');
    ok('armed: LIVE mode, Slot 1 LIVE, other slots PAPER, LIVE BOT ARMED pill visible, config frozen', await ev(() => V160UI.st.mode === 'live' && V160UI.st.slots[0].mode === 'live' && V160UI.st.slots.slice(1).every((s) => s.mode === 'paper') && !$('#v160Pill').hidden && /LIVE BOT ARMED/.test($('#v160Pill').textContent) && $('[data-v160f="maxLoss"]').disabled && $(`[data-v160f="url"][data-id="1"]`).disabled));

    // ── 5. live routing + circuit breakers
    const n0 = kinds('signal').length;
    await ev(() => ACC.buy(ST.sel, px(ST.sel), 100, Date.now(), { slPct: 0.02 }));
    ok('live: a manual fill within the caps reaches the receiver as a signed, verified signal', await waitFor((n) => /LIVE · BUY BTC/.test($('#v160Log').textContent), n0, 6000) && kinds('signal').length === n0 + 1 && kinds('signal').pop().body.symbol === 'BTC' && kinds('signal').pop().body.source === 'manual', JSON.stringify(kinds('signal').slice(-1)));
    await ev(() => ACC.buy('ETH-USD', px('ETH-USD') || 3000, 5000, Date.now(), {}));
    await sleep(800);
    ok('circuit breaker: a 50%-of-equity trade without a stop is blocked and never sent', await ev(() => /BLOCKED · BUY ETH/.test($('#v160Log').textContent)) && kinds('signal').length === n0 + 1);
    ok('replay-safe: inside each session (rotated on arm) every envelope carried a rising seq', R.got.every((p, i) => i === 0 || p.session !== R.got[i - 1].session || p.seq > R.got[i - 1].seq) && new Set(R.got.map((p) => p.session)).size >= 2);
    await ev(() => showTab('grok')); await ev(() => $('#v160Bridge').scrollIntoView({ block: 'start' })); await shot('v16.0-local-bot-bridges.png');

    // ── 6. reload with a live bot → briefing modal → Disconnect & Revert to Paper
    R.last = null; await page.reload(); await booted();
    ok('reload: Live External Bot Connected briefing appears with slot, endpoint, caps and non-advisory reminder', await waitFor(() => { const m = $('#v160Brief'); return m && /Live External Bot Connected/.test(m.textContent) && /Slot 1/.test(m.textContent) && /127\.0\.0\.1:18765/.test(m.textContent) && /\$500/.test(m.textContent) && /1%/.test(m.textContent) && /investment advice/.test(m.textContent); }, null, 15000));
    ok('briefing: fresh heartbeat latency shown, signals held until acknowledged', await waitFor(() => /\d+ ms/.test(($('#v160Brief [data-v160b="1"]') || {}).textContent || ''), null, 6000) && await ev(() => { ACC.buy(ST.sel, px(ST.sel), 50, Date.now(), { slPct: 0.02 }); return V160UI.briefed === false; }) && (await sleep(600), await ev(() => /HELD · BUY/.test($('#v160Log').textContent || '') || V160UI.stats.blocked > 0)));
    await clean(); await shot('v16.0-boot-briefing.png');
    const d0 = kinds('flatten').length;
    await page.click('#v160Brief [data-v160="revert"]');
    ok('Disconnect & Revert to Paper: modal closes, PAPER on all six slots, pill hidden, receiver told to CANCEL_ALL_AND_FLATTEN', await ev(() => !$('#v160Brief') && V160UI.st.mode === 'paper' && V160UI.st.slots.every((s) => s.mode === 'paper') && $('#v160Pill').hidden && !V160UI.st.ack) && await waitFor(() => true) && (await sleep(800), kinds('flatten').length === d0 + 1 && kinds('flatten').pop().body.action === 'CANCEL_ALL_AND_FLATTEN'));

    // ── 7. re-arm (disclosure + phrase required again) → reload → acknowledge → Ctrl+Shift+K
    await ev(() => showTab('grok')); await sleep(300);
    ok('re-arm: the disclosure and phrase must be given again (gates 3 + 4 closed after revert)', await ev(() => $$('#v160Gates li.ok').length <= 2 && $('[data-v160="arm"]').disabled));
    await page.click('#v160Bridge [data-v160="hb"][data-id="1"]'); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000);
    await page.check('[data-v160f="ack"]'); await page.fill('[data-v160f="phrase"]', 'ARM LIVE BOT'); await page.click('[data-v160="arm"]');
    R.last = null; await page.reload(); await booted();
    await waitFor(() => !!$('#v160Brief'), null, 15000); await page.click('#v160Brief [data-v160="briefAck"]');
    ok('Acknowledge & Continue Live: modal closes, still LIVE, routing resumed', await ev(() => !$('#v160Brief') && V160UI.st.mode === 'live' && V160UI.briefed === true && !$('#v160Pill').hidden));
    await clean(); await ev(() => { showTab('markets'); document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await page.keyboard.press('Control+Shift+K'); await sleep(300);
    ok('Ctrl+Shift+K: instant disarm, PAPER on all six slots, pill hidden, command palette not opened', await ev(() => V160UI.st.mode === 'paper' && V160UI.st.slots.every((s) => s.mode === 'paper') && $('#v160Pill').hidden && !$('#palette').classList.contains('on')));
    await page.reload(); await booted(); await clean();
    ok('after kill + reload: boots in PAPER, no briefing', await ev(() => V160UI.st.mode === 'paper' && !$('#v160Brief')));

    // ── 8. chart context menu + measure dragger (screenshot) still work
    await ev(() => { showTab('markets'); setMode('crypto'); selectSym('BTC-USD'); }); await sleep(1500);
    { const r = await ev(() => { const D = chart.data, n = D.length; if (n < 40) return null; const a = D[n - 36], z = D[n - 6]; chart.drawings.push({ id: 'v160ruler', type: 'ruler', t1: a.t, p1: a.l, t2: z.t, p2: z.h }); chart.invalidate(); V152UI.attachLadder(); return true; }); await sleep(600);
      const m = await ev(() => { const Ld = V152UI.ladder, L = chart.L; if (!Ld || !L || !L.py) return false; const r = chart.cv.getBoundingClientRect(), lv = Ld.L.levels.map((v) => L.py(v.p)), y = lv.find((v) => v > 60 && v < r.height - 80) ?? lv[0]; chart.cv.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.6, clientY: r.top + y })); return !!$('#v154Menu') && !$('#v154Menu').hidden; });
      ok('chart: measure dragger (ruler) draws and the right-click ladder context menu opens', !!r && m); }
    await ev(() => { const m = $('#v154Menu'), r = chart.cv.getBoundingClientRect(); if (m) { m.style.left = Math.round(r.left + r.width * 0.55) + 'px'; m.style.top = Math.round(r.top + r.height * 0.42) + 'px'; } }); // TP levels can sit above the visible range: show the menu over the plot for the docs shot
    await shot('v16.0-chart-context-menu-measure.png');
    await ev(() => { const m = $('#v154Menu'); if (m) m.hidden = true; chart.drawings = chart.drawings.filter((d) => d.id !== 'v160ruler'); chart.invalidate(); });

    // ── 9. v15.1–v15.7 regressions
    await page.keyboard.press('Control+k'); await sleep(250);
    ok('Ctrl+K command palette still opens and searches', await ev(() => $('#palette').classList.contains('on')) && (await page.fill('#palIn', 'ichimoku'), await sleep(200), await ev(() => palItems.some((x) => /Ichimoku/i.test(x.l)))));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(400);
    ok('Simple | Pro still toggles', await ev(() => document.body.classList.contains('v155-simple')));
    await page.click('#v155Ws [data-ws="pro"]'); await sleep(300);
    ok('1s / 5s / 10s true-form candle buttons still offered (v15.7)', await ev(() => ['1s', '5s', '10s'].every((t) => [...document.querySelectorAll('#tfBtns button')].some((x) => x.textContent.trim() === t)) && typeof V157UI !== 'undefined' && V157UI.views.size === 5));
    ok('Learn ExTerm + inspector rail still open (v15.4 / v15.6)', await ev(async () => { $('#btnLearn').click(); await new Promise((r) => setTimeout(r, 400)); const v = [...document.querySelectorAll('[id^="lx"], .lx-modal, .learn-modal, [class*="learn"]')].some((e) => e.offsetParent !== null && e.id !== 'btnLearn' && e.getBoundingClientRect().width > 300); LearnUI.close(); V156UI.openInspector('Test', '<p>t</p>'); const i = !$('#v155Drawer').hidden; V155S.closeDr(); return v && i; }));
    await ev(() => { showTab('lab'); }); await sleep(500); if (await ev(() => !!$('#labNav button[data-v="q153"]'))) await page.click('#labNav button[data-v="q153"]'); await sleep(600);
    if (await ev(() => !!$('#q153Base .v155-starter'))) await page.click('#q153Base .v155-starter'); else await ev(() => V153UI.A.base());
    ok('Quant Lab wizard + Bot Net Profit $ hero still render', await waitFor(() => $$('.v155-steps [data-step]').length === 4 && /\$/.test(($('#v155HeroQNet') || {}).textContent || ''), null, 40000));

    // ── 10. Arabic RTL
    await ev(() => { I18N.set('ar'); showTab('grok'); }); await sleep(900);
    ok('RTL: page mirrors, bridge panel fits 1440×900 without horizontal scroll, lock usable', await ev(() => document.documentElement.dir === 'rtl' && document.documentElement.scrollWidth <= innerWidth && $('#v160Bridge').getBoundingClientRect().width <= innerWidth && $$('#v160Bridge .v160-slot').length === 6));
    await page.click('#v160Bridge [data-v160="hb"][data-id="1"]'); await waitFor(() => V160UI.st.slots[0].hb && V160UI.st.slots[0].hb.ok, null, 6000);
    await page.check('[data-v160f="ack"]'); await page.fill('[data-v160f="phrase"]', 'ARM LIVE BO');
    ok('RTL: gates enforced identically (wrong phrase → locked)', await ev(() => $('[data-v160="arm"]').disabled));
    await page.fill('[data-v160f="phrase"]', 'ARM LIVE BOT'); await page.click('[data-v160="arm"]');
    const armedRtl = await ev(() => V160UI.st.mode === 'live' && !$('#v160Pill').hidden), k0 = await ev(() => V160UI.stats.kills);
    await page.keyboard.press('Control+Shift+K'); await sleep(300);
    ok('RTL: arm then Ctrl+Shift+K reverts to PAPER', armedRtl && await ev((k0) => V160UI.stats.kills === k0 + 1 && V160UI.st.mode === 'paper' && $('#v160Pill').hidden, k0));
    await ev(() => I18N.set('en')); await sleep(300);

    ok('receiver: zero unverifiable envelopes reached 127.0.0.1', R.bad === 0, R.bad);
    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
