// ExTerm v16.5 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL), zero console errors:
// AI Bridge tab (banner, 3 cards, provider switching, Token-Saver vs Full Quant packets), plain-English AI idea → exact
// ghost lines + 2.56R badge on the chart, REAL HTTP POST round-trips to http://127.0.0.1:<port>/llm-signal (no key → 403,
// unstopped + wrong-way → 422 error receipts, valid → ghost lines with an exact R:R badge, low confidence → PAPER shadow,
// wallet vet), guardrail profile, ticker / contract screen, Pine harden + 17-test gate + diagnostics + shareable JSON,
// AI-vetted copy engine (+4.0% spike blocked by the drift shield, 2-wallet consensus fills with $ risk sizing + ledger
// attribution), Human vs. AI attribution in the receipt ledger, Share Setup Card PNG with balances masked.
// EXTERM_SHOTS=<dir> writes 05-ai-bridge-copy-firewall.png. EXTERM_E2E_PORT overrides the port (use 8765 for screenshots).
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = +process.env.EXTERM_E2E_PORT || 8825, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv165-'));
const SHOTS = process.env.EXTERM_SHOTS || '';
const post = (body, key) => new Promise((resolve) => {
  const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), hdr = { 'Content-Type': 'application/json', 'Content-Length': data.length }; if (key) hdr['X-ExTerm-Bridge'] = key;
  const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/llm-signal', method: 'POST', headers: hdr }, (r) => { let t = ''; r.on('data', (d) => (t += d)); r.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; } resolve({ code: r.statusCode, j }); }); });
  rq.on('error', (e) => resolve({ code: 0, j: { err: e.message } })); rq.end(data);
});
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA, EXTERM_BRIDGE_KEY: '' }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const KEY = (() => { try { return fs.readFileSync(path.join(DATA, 'bridge.key'), 'utf8').trim(); } catch (e) { return ''; } })();
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v165 |^v165 init/.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V165UI !== 'undefined' && typeof V165 !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.L && chart.L.py && !!document.querySelector('#tab-bridge'), null, { timeout: 60000 });
    await clean();
    ok('launcher: bridge key file created at start (owner-only key, not in the page source)', KEY.length >= 24 && !(await ev((k) => document.documentElement.outerHTML.includes(k), KEY)));

    // ── 1. briefing + tab shell
    await ev(() => V162UI.brief()); await sleep(200);
    ok('briefing: v16.5 Release Highlights (AI Bridge, firewall, copy engine) fit 1440×900', await ev(() => { const m = $('#v162Brief'); return !!m && /v16\.[56] Release Highlights/.test(m.textContent) && /AI Bridge tab/.test(m.textContent) && /llm-signal/.test(m.textContent) && m.querySelector('.v162-modal').getBoundingClientRect().bottom <= innerHeight; }));
    await page.keyboard.press('Escape'); await sleep(150); await clean();
    const nav = await ev(() => { const g = $('#nav button[data-tab="grok"]'), bb = $('#nav button[data-tab="bridge"]'); return { has: !!bb, next: !!g && g.nextElementSibling === bb, txt: bb ? bb.textContent.trim() : '', svg: !!(bb && bb.querySelector('svg')), vis: bb ? bb.getBoundingClientRect().width > 0 : false }; });
    ok('nav: AI Bridge tab button with a custom SVG icon, right after Grok', nav.has && nav.next && nav.txt === 'AI Bridge' && nav.svg && nav.vis, JSON.stringify(nav));
    await ev(() => $('#nav button[data-tab="bridge"]').click()); await sleep(400);
    const shell = await ev(() => ({ on: curTab === 'bridge' && $('#tab-bridge').classList.contains('on'), banner: ($('.v165-banner') || {}).textContent || '', cards: document.querySelectorAll('#tab-bridge .v165-card').length, prov: [...document.querySelectorAll('[data-v165p]')].map((x) => x.textContent), pre: document.querySelectorAll('[data-v165q]').length, pk: document.querySelectorAll('[data-v165a^="pk"]').length, fit: [...document.querySelectorAll('#tab-bridge .v165-card')].every((c) => c.getBoundingClientRect().right <= innerWidth + 1), hscroll: document.documentElement.scrollWidth <= innerWidth }));
    ok('AI Bridge: banner "Works With Any AI or Bot: Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Python/Node Bots" + 3 cards', shell.on && /Works With Any AI or Bot: Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Python\/Node Bots/.test(shell.banner) && shell.cards === 3 && shell.fit && shell.hscroll, JSON.stringify(shell));
    ok('Card 1: 6 provider pills, 4 quick-prompt presets, 5 one-click packet buttons', shell.prov.join('|') === 'Grok|ChatGPT|Claude|DeepSeek|Local Ollama|Custom Bot' && shell.pre === 4 && shell.pk === 5);

    // ── 2. provider switching + Token-Saver vs Full Quant
    await ev(() => showTab('markets')); await sleep(600); await ev(() => showTab('bridge')); await sleep(200);
    const provs = [];
    for (const [id, name] of [['grok', 'Grok'], ['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['deepseek', 'DeepSeek'], ['ollama', 'Local Ollama'], ['custom', 'Custom Bot']]) {
      await ev((id) => document.querySelector(`[data-v165p="${id}"]`).click(), id); await sleep(80);
      await ev(() => document.querySelector('[data-v165a="pkChart"]').click()); await sleep(120);
      provs.push(await ev((name) => ({ name, on: document.querySelector('[data-v165p].on').textContent === name, hdr: V165UI.lastCopy.startsWith('[ExTerm→' + name + ']'), tok: V165.estTokens(V165UI.lastCopy), pre: $('#v165Pk').textContent === V165UI.lastCopy, cfg: V165UI.cfg.provider }), name));
    }
    ok('providers: Grok / ChatGPT / Claude / DeepSeek / Ollama / Custom each re-label the copied packet', provs.every((p) => p.on && p.hdr && p.pre), JSON.stringify(provs.filter((p) => !(p.on && p.hdr && p.pre))));
    ok('Token-Saver chart + order-book packet ≈ 120 tokens (≤ 130) with trend / EMA / RSI / ATR / AVWAP / tape / walls', provs.every((p) => p.tok <= 130) && (await ev(() => /trend 1m \w+ · 5m \w+ · 1h [\w/]+ · 4h [\w/]+/.test(V165UI.lastCopy) && /EMA20 .* RSI .* ATR /.test(V165UI.lastCopy) && /AVWAP/.test(V165UI.lastCopy) && /tape10s/.test(V165UI.lastCopy) && /walls/.test(V165UI.lastCopy))), provs.map((p) => p.tok).join());
    await ev(() => { document.querySelector('[data-v165p="claude"]').click(); }); await sleep(60); await ev(() => document.querySelector('[data-v165m="full"]').click()); await sleep(60); await ev(() => document.querySelector('[data-v165a="pkChart"]').click()); await sleep(120);
    const full = await ev(() => ({ tok: V165.estTokens(V165UI.lastCopy), has: ['EMA 20', 'RSI 14', 'ATR 14', 'AVWAP', 'TAPE DELTA', '3D LIQUIDITY WALLS', 'Think carefully about risk'].every((k) => V165UI.lastCopy.includes(k)), lbl: $('#v165Tok').textContent }));
    ok('Full Quant packet is richer (Claude style, all fields) and labelled', full.has && full.tok > 160 && /Full Quant/.test(full.lbl) && /Claude/.test(full.lbl), JSON.stringify(full));
    const others = [];
    for (const k of ['pkChain', 'pkWatch', 'pkOpt', 'pkPost']) { await ev((k) => document.querySelector(`[data-v165a="${k}"]`).click(), k); await sleep(100); others.push(await ev(() => V165UI.lastCopy)); }
    ok('on-chain DD, watchlist comparison, options IV / liquidation and session post-mortem packets copy', /LIQUIDITY:/.test(others[0]) && /MINT AUTHORITY/.test(others[0]) && /WATCHLIST COMPARISON/.test(others[1]) && /SYMBOL \| LAST/.test(others[1]) && /OPTIONS IV/.test(others[2]) && /SESSION POST-MORTEM \(privacy-masked/.test(others[3]) && /AI Bridge \d+ trades/.test(others[3]));
    await ev(() => { document.querySelector('[data-v165m="saver"]').click(); document.querySelector('[data-v165p="grok"]').click(); });

    // ── 3. plain-English AI idea → ghost lines on the 240 Hz chart
    await ev(() => { $('#v165Idea').value = 'Long SOL at 142.50, stop 138.00, target 154.00'; $('[data-v165a="idea"]').click(); });
    const gOk = await waitFor(() => curTab === 'markets' && ST.sel === 'SOL-USD' && V165UI.drawn && V165UI.drawn.sym === 'SOL-USD' && V165UI.drawn.n === 3, null, 30000);
    const g1 = await ev(() => { const G = V165UI.ghosts['SOL-USD']; return { ok: !!G, e: G && G.idea.entry, s: G && G.idea.stop_loss, t: G && G.idea.tp[0], badges: V165UI.drawn ? V165UI.drawn.badges : [], out: $('#v165IdeaOut').textContent, ov: chart.overlays.includes(V165UI.overlay) }; });
    ok('plain English "Long SOL at 142.50, stop 138.00, target 154.00" → exact 142.5 / 138.0 / 154.0', gOk && g1.ok && g1.e === 142.5 && g1.s === 138.0 && g1.t === 154.0, JSON.stringify(g1));
    ok('ghost lines drawn on the chart with the exact 2.56R and $ axis badges', g1.ov && g1.badges.some((x) => /TP 154 · 2\.56R · \+\$256$/.test(x)) && g1.badges.some((x) => /AI Stop 138 · −\$100$/.test(x)) && g1.badges.some((x) => /AI Entry 142\.5$/.test(x)) && /2\.56R/.test(g1.out), JSON.stringify(g1.badges));
    await ev(() => { showTab('bridge'); $('[data-v165a="stage"]').click(); }); await sleep(400);
    ok('1-click staging puts the long on the chart ticket (draft, nothing placed)', await ev(() => typeof ChartTrade !== 'undefined' && ChartTrade.draft && ChartTrade.draft.sym === 'SOL-USD' && ChartTrade.draft.entry === 142.5 && ChartTrade.draft.sl === 138 && ChartTrade.draft.tp === 154));
    await ev(() => { ChartTrade.draft = null; ChartTrade.changed(false); showTab('bridge'); $('#v165Idea').value = 'Short ETH at 3000, stop 2900, target 2800'; $('[data-v165a="idea"]').click(); }); await sleep(300);
    ok('wrong-way stop in pasted text is refused (no ghost lines)', await ev(() => /Wrong-way stop/.test($('#v165IdeaOut').textContent) && !V165UI.ghosts['ETH-USD']));

    // ── 4. real HTTP POST round-trips to 127.0.0.1/llm-signal
    await ev(() => { showTab('markets'); if (ST.sel !== 'SOL-USD') selectSym('SOL-USD'); }); await sleep(800);
    const r0 = await post({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 95 });
    ok('POST without the bridge key → 403', r0.code === 403, JSON.stringify(r0));
    const rA = await post({ symbol: 'SOL', side: 'long', entry: 142.5, stop_loss: null, tp: [150], confidence: 95, source: 'grok' }, KEY);
    const rB = await post({ symbol: 'SOL', side: 'long', entry: 142.5, stop_loss: 145, tp: [150], confidence: 95, source: 'chatgpt' }, KEY);
    ok('POST unstopped (stop_loss: null) → 422 error receipt, signed', rA.code === 422 && rA.j.receipt && rA.j.receipt.status === 'rejected' && /stop_loss missing/.test(rA.j.receipt.reasons[0]) && /^[0-9a-f]{64}$/.test(rA.j.receipt.sig), JSON.stringify(rA));
    ok('POST wrong-way stop → 422 error receipt', rB.code === 422 && rB.j.receipt.status === 'rejected' && /wrong-way/.test(rB.j.receipt.reasons[0]), JSON.stringify(rB));
    const rejSeen = await waitFor((ids) => ids.every((id) => V165UI.receipts.some((r) => r.id === id && r.status === 'rejected')) && ids.every((id) => (V160UI.ledger || []).some((l) => l.kind === 'ai-bridge' && l.status === 'rejected' && l.idempotency_key === id)), [rA.j.receipt.id, rB.j.receipt.id], 15000);
    ok('the page lists both rejections and writes them to the Signed Receipt Ledger', rejSeen);
    const ref = await ev(() => { const bars = chart.data.slice(-200), atr = V165.atr(bars, 14); return { p: px(ST.sel), atr, sym: ST.sel }; });
    const entry = +ref.p.toPrecision(6), d2 = +(2 * ref.atr).toPrecision(4), stop = +(entry - d2).toPrecision(8), tp = +(entry + 2.5 * d2).toPrecision(8);
    const rC = await post({ symbol: 'SOL-USD', side: 'long', entry, stop_loss: stop, tp: [tp], confidence: 90, reason: 'e2e', source: 'e2e-bot' }, KEY);
    ok('POST valid stop-protected proposal → 200 accepted receipt', rC.code === 200 && rC.j.ok && rC.j.receipt.status === 'accepted', JSON.stringify(rC));
    const gC = await waitFor((e) => { const G = V165UI.ghosts['SOL-USD']; return !!G && G.idea.entry === e && /e2e-bot/.test(G.source) && V165UI.drawn && V165UI.drawn.badges.some((x) => /2\.50R/.test(x)); }, entry, 15000);
    const gCd = await ev(() => ({ badges: V165UI.drawn && V165UI.drawn.badges, rc: V165UI.receipts[0] }));
    ok('valid proposal renders dashed ghost lines with the exact 2.50R badge on the chart', gC && gCd.rc.status === 'ghost' && gCd.rc.rr === '2.50R', JSON.stringify(gCd));
    await ev(() => { showTab('bridge'); $('[data-v165a="guard"]').click(); }); await sleep(200);
    ok('Apply AI Live Guardrail Profile: stop ON, 1.5 ATR, 3× depth, 75%, 50% cut after 2, shadow slot on', await ev(() => { const G = V165UI.cfg.guard; return G.mandatorySL && G.minAtr === 1.5 && G.depthMult === 3 && G.threshold === 75 && G.cutAfter === 2 && G.cutPct === 50 && G.shadow && $('#v165Thr').value === '75' && /75%/.test($('#v165ThrV').textContent); }));
    const rD = await post({ symbol: 'SOL-USD', side: 'long', entry, stop_loss: stop, tp: [tp], confidence: 55, source: 'ollama' }, KEY);
    ok('below the 75% threshold → routed to the PAPER shadow slot (not plotted)', rD.code === 200 && await waitFor((id) => V165UI.receipts.some((r) => r.id === id && r.status === 'shadow') && V165UI.shadow.some((s) => s.src === 'ollama' && !s.done), rD.j.receipt.id, 15000));
    const rE = await post({ kind: 'wallet_vet', wallet: '0x' + 'ab'.repeat(20), approve: true, confidence: 88, reason: 'consistent sizing', source: 'claude' }, KEY);
    ok('wallet vetting verdicts arrive through the same endpoint', rE.code === 200 && await waitFor(() => V165UI.vets['0x' + 'ab'.repeat(20)] && V165UI.vets['0x' + 'ab'.repeat(20)].confidence === 88, null, 15000));
    await sleep(600);
    const rcUi = await ev(() => ({ rows: document.querySelectorAll('#v165Rc tbody tr[data-v165rc]').length, txt: $('#v165Rc').textContent }));
    ok('receipts table shows rejected / ghost / shadow / approved rows', rcUi.rows >= 5 && /rejected/.test(rcUi.txt) && /ghost/.test(rcUi.txt) && /shadow/.test(rcUi.txt) && /approved/.test(rcUi.txt), JSON.stringify(rcUi).slice(0, 300));
    ok('templates: 3 switchable ~45-line Python starters pointing at this launcher', await ev(() => { const out = []; for (const k of ['grok', 'cloud', 'ollama']) { document.querySelector(`[data-v165t="${k}"]`).click(); const t = $('#v165Tpl').textContent; out.push(/127\.0\.0\.1:\d+/.test(t) && t.includes('127.0.0.1:' + location.port) && /X-ExTerm-Bridge/.test(t) && t.split('\n').length < 60); } return out.every(Boolean); }));

    // ── 5. ticker / contract paste-box (deterministic safety data)
    await ev(() => { ST.watch = ST.watch.filter((s) => s !== 'AVAX-USD'); V165UI._ti = V165UI.tokenInfo; V165UI.tokenInfo = async (it) => ({ AVAX: { sym: 'AVAX-USD' }, EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { liq: 30000, mint: false, sym: 'oc:solana:x' }, '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { liq: 5e6, mint: true, sym: 'oc:eth:y' } })[it.id] || null; $('#v165Tk').value = 'Grok found $AVAX breaking out; also EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v and 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'; $('[data-v165a="tickers"]').click(); });
    ok('ticker box: survivors join the watchlist; < $50k liquidity and mint authority are dropped', await waitFor(() => ST.watch.includes('AVAX-USD') && /< \$50\.0k/.test($('#v165TkOut').textContent) && /active mint authority/.test($('#v165TkOut').textContent), null, 10000), await ev(() => $('#v165TkOut').textContent));
    await ev(() => { V165UI.tokenInfo = V165UI._ti; });

    // ── 6. Pine harden → 17-test gate → diagnostics → shareable JSON
    await ev(() => { $('#v165Pine').value = '//@version=5\nstrategy("AI RSI dip")\nr = ta.rsi(close, 14)\nif r < 30 and close > ta.sma(close, 200)\n    strategy.entry("L", strategy.long)\nif r > 70\n    strategy.close("L")\n'; $('[data-v165a="harden"]').click(); }); await sleep(200);
    ok('Pine harden: all 6 safety rules pass (confirmed bars, lookahead_off, $ risk, strategy.exit stop, max_intraday_loss, webhook)', await ev(() => document.querySelectorAll('#v165PineChk .ok').length === 7 && !document.querySelector('#v165PineChk .bad') && /barstate\.isconfirmed/.test($('#v165PineSrc').textContent) && /strategy\.risk\.max_intraday_loss/.test($('#v165PineSrc').textContent)));
    await ev(() => $('[data-v165a="pval"]').click());
    const val = await waitFor(() => /gates passed/.test(($('#v165PineOut') || {}).textContent || '') && V165UI.lastVal && V165UI.lastVal.checks.length >= 15, null, 90000);
    ok('1-Click 17-Test Quant Validation grades the AI script', val, await ev(() => ($('#v165PineOut') || {}).textContent.slice(0, 200)));
    await ev(() => $('[data-v165a="pdiag"]').click()); await sleep(100);
    ok('Copy Failure Diagnostics for AI: grade, gate count, Pine safety, refine instruction', await ev(() => /gates passed/.test(V165UI.lastCopy) && /Pine safety: OK barstate\.isconfirmed/.test(V165UI.lastCopy) && /Refine the Pine v5 script/.test(V165UI.lastCopy)));
    await ev(() => $('[data-v165a="sjson"]').click()); await sleep(100);
    ok('Copy Shareable Strategy JSON labelled with the real gate count', await ev(() => { const j = JSON.parse(V165UI.lastCopy); return j.kind === 'strategy' && j.label === `Validated in ExTerm (${V165UI.lastVal.passed}/${V165UI.lastVal.total} Gates Passed)` && !!j.spec; }));

    // ── 7. AI-vetted copy engine: drift shield + 2-wallet consensus with $ risk sizing
    await ev(() => { showTab('whales'); }); await sleep(900);
    ok('Whales tab: AI-Vetted Copy Engine with vetting gate, consensus window, drift, exit modes, daily cap, wallet packet', await ev(() => { const c = $('#v165Copy'); return !!c && c.querySelectorAll('[data-v165cw]').length === 3 && c.querySelectorAll('[data-v165cx]').length === 3 && !!c.querySelector('[data-v165c="vet"]') && !!c.querySelector('[data-v165c="maxDrift"]') && !!c.querySelector('[data-v165c="dayCap"]') && !!c.querySelector('[data-v165ca="packet"]') && /Copy Shadow Mode/.test(c.textContent); }));
    const cp = await ev(() => {
      Object.assign(V165UI.cfg.copy, { on: true, shadow: false, vet: false, maxDrift: 2.5, driftAtr: 0, win: 900, minWallets: 2, riskUsd: 100, minAtr: 1.5 });
      const sym = ST.sel, p = px(sym), now = Date.now() / 1000, n0 = ACC.trades.length, l0 = (V160UI.ledger || []).length;
      V165UI.leaderFill({ addr: '0x' + '1'.repeat(40), sym, side: 'long', price: p / 1.04, ts: now - 120 }); V165UI.leaderFill({ addr: '0x' + '2'.repeat(40), sym, side: 'long', price: p / 1.04, ts: now - 60 });
      const d1 = V165UI.copyEval(now), afterSpike = ACC.trades.length;
      V165UI.cfg.copy.driftAtr = 1.0;
      V165UI.leaderFill({ addr: '0x' + '3'.repeat(40), sym: 'ETH-USD', side: 'long', price: px('ETH-USD'), ts: now - 90 }); V165UI.leaderFill({ addr: '0x' + '4'.repeat(40), sym: 'ETH-USD', side: 'long', price: px('ETH-USD'), ts: now - 30 });
      const d2 = V165UI.copyEval(now), t = ACC.trades[ACC.trades.length - 1], L = (V160UI.ledger || []).slice(0, (V160UI.ledger || []).length - l0);
      return { d1: d1.map((d) => ({ act: d.act, status: d.status, why: d.why })), spikeFilled: afterSpike !== n0, d2: d2.map((d) => ({ act: d.act, plan: d.plan })), t: t && { src: t.src, sym: t.sym, usd: t.usd }, led: L.map((x) => x.kind + ':' + x.status + ':' + x.detail) };
    });
    ok('drift shield: a +4.0% spike past the leader fill (> 2.5%) blocks the copy chase', cp.d1.length === 1 && cp.d1[0].act === 'block' && cp.d1[0].status === 'drift' && /4\.00% past the leader fill \(max 2\.5%\)/.test(cp.d1[0].why) && !cp.spikeFilled && cp.led.some((x) => /^copy:blocked:.*Drift Shield/.test(x)), JSON.stringify(cp));
    const plan = cp.d2[0] && cp.d2[0].plan;
    ok('2-wallet consensus inside the window fires a paper copy sized by exact $ risk (1.5 ATR stop, TP1/TP2/TP3)', cp.d2.length === 1 && cp.d2[0].act === 'copy' && cp.t && cp.t.src === 'copy' && cp.t.sym === 'ETH-USD' && plan && Math.abs(plan.qty * plan.dist - 100) < 1e-6 && plan.tp.length === 3 && Math.abs(cp.t.usd - plan.usd) / plan.usd < 0.001, JSON.stringify(cp.d2));
    ok('Signed Receipt Ledger records the copy with $ risk, stop, TP1–TP3 and attribution', cp.led.some((x) => /^copy:filled:Copy BUY ETH · 2 wallets · \$100 risk · qty [\d.e+-]+ · stop [\d.]+ · TP1 [\d.]+ \/ TP2 [\d.]+ \/ TP3 [\d.]+ .*attribution Copy \(unvetted\)/.test(x)), JSON.stringify(cp.led));
    await ev(() => { if (typeof V160UI !== 'undefined' && V160UI.openPanel) V160UI.openPanel(); });
    const ledOk = await waitFor(() => !!$('#v165LedAttr') && !!$('#v165LedAttr tr[data-v165attr="copy"]') && !!$('#v165LedAttr tr[data-v165attr="ai"]') && !!$('#v165LedAttr tr[data-v165attr="manual"]') && !!$('#v165LedAttr tr[data-v165attr="quant"]'), null, 10000);
    ok('Human vs. AI / Bot Execution Attribution table inside the receipt ledger (Manual · Quant · AI Bridge · Copy)', ledOk && await ev(() => /Copy \(AI-vetted\)/.test($('#v165LedAttr').textContent) && /Slippage bps/.test($('#v165LedAttr').textContent) && !!$('#v165LedAttr [data-v165l="share"]')));
    await ev(() => { for (const m of document.querySelectorAll('.v160-ov')) m.remove(); });

    // ── 8. Share Setup Card (PNG, balances masked)
    await ev(() => { showTab('markets'); if (ST.sel !== 'SOL-USD') selectSym('SOL-USD'); }); await sleep(800);
    await ev(() => V165UI.setGhost(V165.parseIdea('Long SOL at 142.50, stop 138.00, target 154.00'), 'AI Bridge · Grok', false));
    const card = await ev(() => { const r = V165UI.shareCard(null, true), secrets = [ACC.cash.toFixed(2), Math.round(ACC.cash).toString(), NT.fmtUSD(ACC.cash, 2), String(Math.round(ACC.cash0 || 0))].filter((s) => s.length >= 4); return { png: r.url.startsWith('data:image/png;base64,'), len: r.url.length, texts: r.texts, leaks: V165.cardLeaks(r.texts, secrets), rr: r.model.rr }; });
    ok('Share Setup Card renders an Obsidian & Gold PNG: symbol, timeframe, R:R 2.56, source, Entry / Stop / TP', card.png && card.len > 20000 && card.rr === 2.56 && card.texts.includes('ExTerm') && card.texts.some((t) => /SOL-USD .* LONG/.test(t)) && card.texts.some((t) => /R:R 2\.56/.test(t) && /AI Bridge · Grok/.test(t)) && card.texts.includes('Entry 142.5') && card.texts.includes('Stop 138') && card.texts.includes('TP1 154'), JSON.stringify(card.texts));
    ok('Share Setup Card masks balances and personal data (no cash / equity figures in any drawn text)', card.leaks.length === 0 && card.texts.includes('Balances & personal data masked') && !card.texts.some((t) => /balance:|equity|\$\d/i.test(t)), JSON.stringify(card.leaks));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), ev(() => $('#v165ShareBtn').click())]);
    ok('chart toolbar Share Setup Card button downloads exterm-setup-SOL-USD-*.png', !!dl && /^exterm-setup-SOL-USD-\w+\.png$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

    // ── 9. screenshot + Arabic (RTL)
    if (SHOTS) {
      await ev(() => { showTab('bridge'); document.querySelector('[data-v165a="pkChart"]').click(); }); await clean(); await page.mouse.move(2, 896); await sleep(700);
      await page.screenshot({ path: path.join(SHOTS, '05-ai-bridge-copy-firewall.png') });
    }
    await ev(() => { showTab('bridge'); I18N.set('ar'); }); await sleep(1200);
    const rtl = await ev(() => { const cards = [...document.querySelectorAll('#tab-bridge .v165-card')].map((c) => c.getBoundingClientRect()); return { dir: document.documentElement.dir, inView: cards.every((r) => r.left >= -1 && r.right <= innerWidth + 1), scroll: document.documentElement.scrollWidth <= innerWidth, n: cards.length, banner: !!document.querySelector('.v165-banner') && getComputedStyle(document.querySelector('.v165-banner')).flexDirection }; });
    ok('RTL (Arabic): AI Bridge banner mirrors and all 3 cards stay inside 1440×900 with no horizontal scroll', rtl.dir === 'rtl' && rtl.inView && rtl.scroll && rtl.n === 3 && rtl.banner === 'row-reverse', JSON.stringify(rtl));
    await ev(() => { showTab('whales'); }); await sleep(500);
    ok('RTL (Arabic): copy engine panel stays inside the viewport', await ev(() => { const r = $('#v165Copy').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }));
    await ev(() => I18N.set('en')); await sleep(300);

    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
