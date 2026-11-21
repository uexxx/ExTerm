// ExTerm v17.0 Phases 2–5 browser end-to-end against serve.py (offline launcher, outside network blocked), one browser,
// closed at the end: Reach strip (17 one-click chips, one line, not over the chart), Quant Lab Edge-Coach (demo run,
// heatmaps, R:R 1-click apply, Pine linter, tear sheet, playbook), 2-layer canvas idle cost, Briefing modal + plot,
// Bot Fleet (gate, demo, co-pilot queue, wizard steps, torus fps → 0 when hidden), Options / Futures / Pulse / 3D tabs,
// DOM ladder, confluence pill, Academy + drill, 10-language first-launch picker (IndexedDB), Hide Balances, phone
// viewport (dock, arc, keypad, swipe), zero page errors. EXTERM_E2E_PORT overrides the port.
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('ERRS', errs.slice(0, 6).join(' | ')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = +process.env.EXTERM_E2E_PORT || 8871, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv17p-'));
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
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close());
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push('PAGE ' + e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && !/Failed to load resource|net::ERR_|WebSocket/.test(t)) || /^v17(app|mob)/.test(t)) errs.push('CONSOLE ' + t); });
    page.on('download', (d) => { res.push('INFO download ' + d.suggestedFilename()); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V17App !== 'undefined' && V17App.mounted && typeof chart !== 'undefined' && chart && chart.data.length > 120 && !!document.querySelector('#x17Reach'), null, { timeout: 60000 });
    await clean();

    // Reach strip
    const reach = await ev(() => { const r = document.querySelector('#x17Reach'), box = r.getBoundingClientRect(), ch = document.querySelector('#chartHost').getBoundingClientRect(); return { n: r.querySelectorAll('[data-x17r]').length, h: box.height, names: [...r.querySelectorAll('[data-x17r]')].map((b) => b.dataset.x17r), overChart: box.bottom > ch.top + 1, vis: [...r.querySelectorAll('[data-x17r]')].every((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && q.right <= innerWidth + 1; }) }; });
    ok('Reach strip: 17 one-click chips, one line (≤ 32 px), all visible at 1440 px, never over the chart', reach.n === 17 && reach.h <= 32 && reach.vis && !reach.overChart && reach.names.join('|') === V17P_REACH_SENTINEL, JSON.stringify(reach));
    const nav = await ev(async () => { const want = { 'Options': 'opts', 'Futures': 'futs', 'Screener': 'heat', 'Pulse': 'pulse', '3D': 'd3', 'Bot Fleet': 'fleet', 'Quant Lab': 'lab', 'AI Bridge': 'bridge', 'Academy': 'academy', 'Tracker': 'whales', 'Positions': 'port', 'Live Tape': 'markets', 'Whales $25K+': 'markets', 'Stocks': 'markets', 'Crypto': 'markets', 'On-Chain': 'markets' }, bad = [];
      for (const [n, tab] of Object.entries(want)) { document.querySelector(`[data-x17r="${n}"]`).click(); await new Promise((r) => setTimeout(r, 60)); const sec = document.querySelector('#tab-' + tab); if (curTab !== tab || !sec || !sec.classList.contains('on')) bad.push(n + '→' + curTab); }
      const whales = typeof V166UI !== 'undefined' ? V166UI.minUsd : null; document.querySelector('[data-x17r="Crypto"]').click(); return { bad, whales, mode: ST.mode }; });
    ok('every chip lands on its workspace in one click (incl. Whales $25K+ tape filter)', nav.bad.length === 0 && nav.whales === 25000 && nav.mode === 'crypto', JSON.stringify(nav));
    await ev(() => { V166UI.minUsd = 0; V166UI.dirty = true; });
    await ev(() => document.querySelector('[data-x17r="Briefing"]').click());
    ok('Briefing chip opens the Morning Briefing modal', await waitFor(() => !!document.querySelector('#x17Brief [data-x17b="plot"]'), null, 4000));
    const plot = await ev(() => { document.querySelector('#x17Brief [data-x17b="plot"]').click(); const lv = V17App.levels[ST.sel]; return { closed: !document.querySelector('#x17Brief'), keys: lv ? Object.keys(lv) : [], pill: !!document.querySelector('#x17BriefPill'), hist: V17App.cfg.briefHist.length }; });
    ok('1-Click Plot All Morning Levels: PDH/PDL/PDC + pivots on the chart, 7-day history, header Briefing pill', plot.closed && ['pdh', 'pdl', 'pdc', 'pivot', 'r1', 's1'].every((k) => plot.keys.includes(k)) && plot.pill && plot.hist >= 1, JSON.stringify(plot));

    // 2-layer canvas
    const lay = await ev(async () => { const L = V17App.Layer; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b0 = L.builds; chart.invalidate(false); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b1 = L.builds; const t0 = performance.now(); for (let i = 0; i < 100000; i++) L.sched.tick(); const idle = (performance.now() - t0) / 100000; V17App.Layer.dirty(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const labels = L.lines().length; return { rebuiltOnCursor: b1 !== b0, idle, rebuiltOnDirty: L.builds > b1, labels, hasOverlay: chart.overlays.includes(L.overlay) }; });
    ok('2-layer canvas: cursor-only frames reuse the offscreen layer, idle tick < 0.002 ms, dirty flag repaints', !lay.rebuiltOnCursor && lay.idle < 0.002 && lay.rebuiltOnDirty && lay.labels >= 6 && lay.hasOverlay, JSON.stringify(lay));
    const hitT = await ev(() => { const L = V17App.Layer, grid = L.grid, k = [...grid.m.values()][0]; if (!k || !k.length) return { none: true }; const b0 = k[0]; return { item: !!L.hitTest(b0.x + 2, b0.y + 2), miss: L.hitTest(-99, -99) === null }; });
    ok('O(1) spatial hit-testing finds the level label under the cursor', hitT.item && hitT.miss, JSON.stringify(hitT));

    // Edge-Coach
    await ev(() => document.querySelector('[data-x17r="Quant Lab"]').click());
    ok('Quant Lab Edge-Coach mounts at the top of the Lab tab', await waitFor(() => { const c = document.querySelector('#x17Coach'); return c && c.offsetHeight > 0; }, null, 6000));
    const coach = await ev(() => { document.querySelector('[data-x17c="run"]').click(); const R = V17App.coach; return R ? { n: R.rts.length, heat: document.querySelectorAll('#x17Heat .x17-heat i').length, rr: document.querySelectorAll('.x17-rrb').length, best: !!document.querySelector('.x17-rrb.best'), mfe: document.querySelectorAll('#x17Ex tbody tr').length, prop: R.prop.sims, kelly: !!document.querySelector('#x17Kelly .x17-kpi'), of: R.of.score, kind: R.s.kind } : null; });
    ok('Edge-Coach analysis: MFE/MAE + shadow table, 7×24 heatmap, 6×6 R:R grid, prop sim, Kelly, overfitting score', coach && coach.n > 0 && coach.heat === 168 && coach.rr === 36 && coach.best && coach.mfe > 0 && coach.prop > 0 && coach.kelly && (coach.of === null || (coach.of >= 0 && coach.of <= 100)), JSON.stringify(coach));
    const slip = await ev(() => { const s = document.querySelector('#x17Slip'); s.value = '50'; s.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#x17SlipOut').textContent; });
    ok('slippage slider re-simulates at +50 bps', /\+50 bps per side/.test(slip), slip);
    const apply = await ev(() => { document.querySelector('.x17-rrb.best').click(); const a = V17App.rrApplied; return { tab: curTab, a: a && a.sym === ST.sel && a.sl < a.tp, lines: V17App.Layer.lines().filter((l) => /^(SL|TP) /.test(l.label)).length }; });
    ok('1-Click Apply to Chart: SL/TP from the best cell land on the chart', apply.tab === 'markets' && apply.a && apply.lines === 2, JSON.stringify(apply));
    await ev(() => showTab('lab'));
    const pine = await ev(() => { const d = document.querySelector('.x17-pine'); d.open = true; const t = document.querySelector('#x17Pine'); t.value = '//@version=4\nstudy("x")\nplot(sma(close,9))'; t.dispatchEvent(new Event('input', { bubbles: true })); const bad = document.querySelectorAll('#x17Lint li.error').length; t.value = '//@version=5\nindicator("ok")\nplot(ta.sma(close,9))'; t.dispatchEvent(new Event('input', { bubbles: true })); return { bad, good: document.querySelector('#x17Lint li.ok') ? 1 : 0 }; });
    ok('Pine Script v5 inline linter flags v4 code and passes clean v5', pine.bad >= 3 && pine.good === 1, JSON.stringify(pine));
    const exp = await ev(() => { const html = V17App.Coach.sheet(), pb = JSON.parse(V17App.Coach.pbExport()); return { sheet: /#07080B/.test(html) && /#F5C84B/.test(html) && !/<script/i.test(html), pb: pb.format === 'exterm.playbook' && !!pb.playbook.name, prompt: V17App.Coach.ai().length > 80, aiTab: curTab }; });
    ok('Tear sheet (Obsidian/Gold) + sanitized playbook export + Send Leaks to AI Coach', exp.sheet && exp.pb && exp.prompt && exp.aiTab === 'ai', JSON.stringify(exp));

    // Bot Fleet
    await ev(() => { delete V17App.demo; document.querySelector('[data-x17r="Bot Fleet"]').click(); });
    ok('Bot Fleet: No-Bot gate banner with a demo button when no bot runs', await waitFor(() => { const g = document.querySelector('#x17Gate'); return g && !g.hidden && !!g.querySelector('[data-x17f="demo"]'); }, null, 5000));
    ok('Neural Strategy Torus animates while the tab is visible', await waitFor(() => V17App.torus.raf > 0 && V17App.torus.fps > 20, null, 5000), await ev(() => V17App.torus.fps));
    const fleet = await ev(async () => { document.querySelector('[data-x17f="mode"][data-v="copilot"]').click(); document.querySelector('[data-x17f="demo"]').click(); await new Promise((r) => setTimeout(r, 50)); const q = V17App.queue.length, btn = document.querySelector('[data-x17f="ok"]'); if (btn) btn.click(); return { mode: V17App.cfg.mode, q, after: V17App.queue.length, gate: document.querySelector('#x17Gate').hidden, modes: document.querySelectorAll('[data-x17f="mode"]').length }; });
    ok('3-mode selector + Attended Co-Pilot queue with 1-click approve', fleet.modes === 3 && fleet.mode === 'copilot' && fleet.q === 1 && fleet.after === 0 && fleet.gate, JSON.stringify(fleet));
    const wiz = await ev(() => { document.querySelector('[data-x17f="mode"][data-v="live"]').click(); const W = document.querySelector('#x17Wiz'), next = () => W.querySelector('[data-w="next"]').click(), set = (k, v) => { const i = W.querySelector(`[data-w="${k}"]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, err = () => W.querySelector('#x17WizErr').textContent, steps = [];
      next(); steps.push(err()); set('ack', true); next(); set('settled', '1000'); set('cap', '5000'); next(); steps.push(err()); set('cap', '800'); next(); set('slipBps', '500'); next(); steps.push(err()); set('slipBps', '15'); next(); set('dailyLoss', '100'); next(); set('phrase', 'arm live bot'); next(); steps.push(err());
      const before = V17App.cfg.arm.armed; set('phrase', 'ARM LIVE BOT'); next(); return { steps, before, armed: V17App.cfg.arm.armed, cap: V17App.cfg.arm.cap, mode: V17App.cfg.mode, closed: !document.querySelector('#x17Wiz') }; });
    ok('Mandatory 5-step arming wizard: ack, zero-overdraft cap, max bps, kill-switch, typed ARM LIVE BOT', /understand|Tick/.test(wiz.steps[0]) && /overdraft/i.test(wiz.steps[1]) && /bps/.test(wiz.steps[2]) && /ARM LIVE BOT/.test(wiz.steps[3]) && wiz.before === false && wiz.armed && wiz.cap === 800 && wiz.mode === 'live' && wiz.closed, JSON.stringify(wiz));
    await ev(() => { V17App.cfg.arm = { armed: false }; V17App.cfg.mode = 'paper'; V17App.save(); });
    const evo = await ev(() => { document.querySelector('[data-x17f="evolve"]').click(); return document.querySelector('#x17EvoOut').textContent; });
    ok('Self-Improving loop runs 20 generations', /20 generations/.test(evo), evo);
    await ev(() => showTab('markets'));
    ok('torus pauses at 0 fps the moment Bot Fleet is hidden', await waitFor(() => V17App.torus.raf === 0 && V17App.torus.fps === 0, null, 3000));

    // Options / Futures / Pulse / 3D
    await ev(() => document.querySelector('[data-x17r="Options"]').click());
    ok('Options: GEX flip / call wall / put wall computed (model chain offline) and drawn on the chart', await waitFor(() => V17App.gex && V17App.gex.r.callWall > 0 && V17App.gex.r.putWall > 0 && document.querySelectorAll('#x17GexOut .x17-kpi').length === 4, null, 8000));
    const opt = await ev(() => { document.querySelector('[data-x17o="ic"]').click(); return { legs: V17App.opts.legs.length, greeks: document.querySelectorAll('#x17Greeks .x17-kpi').length, chartLines: V17App.Layer.lines().filter((l) => /Wall|Flip/.test(l.label)).length }; });
    ok('Multi-Leg Builder (iron condor) + payoff cone + Greeks', opt.legs === 4 && opt.greeks === 6 && opt.chartLines >= 2, JSON.stringify(opt));
    await ev(() => document.querySelector('[data-x17r="Futures"]').click());
    const fut = await ev(() => { const k = document.querySelectorAll('#x17VpK .x17-kpi').length; const c = document.querySelector('#x17TkC'); c.value = 'ES'; document.querySelector('#x17TkE').value = '5000'; document.querySelector('#x17TkS').value = '4990'; document.querySelector('#x17TkR').value = '1500'; document.querySelector('#x17TkE').dispatchEvent(new Event('input', { bubbles: true })); return { k, tick: document.querySelector('#x17TkOut').textContent, liq: document.querySelectorAll('#x17LiqOut tbody tr').length }; });
    ok('Futures: RTH/ETH volume profile (POC/VAH/VAL), tick risk calc, liquidation clusters', fut.k === 4 && /40/.test(fut.tick) && /\$500/.test(fut.tick) && fut.liq > 0, JSON.stringify(fut));
    await ev(() => document.querySelector('[data-x17r="Pulse"]').click());
    const pul = await ev(() => { document.querySelector('[data-x17p="ev"]').click(); document.querySelector('[data-x17p="deb"]').click(); const s = document.querySelector('#x17Shock'); s.value = '-10'; s.dispatchEvent(new Event('input', { bubbles: true })); return { ev: document.querySelectorAll('#x17EvOut tbody tr').length, deb: document.querySelectorAll('.x17-deb').length, beta: /portfolio P&L if the benchmark moves -10%/.test(document.querySelector('#x17BetaOut').textContent) }; });
    ok('Pulse: last-12 FOMC reaction table, Bull/Bear/Risk debate, beta shock at −10%', pul.ev === 12 && pul.deb === 3 && pul.beta, JSON.stringify(pul));
    await ev(() => document.querySelector('[data-x17r="3D"]').click());
    const d3 = await ev(() => { const c = document.querySelector('#x17D3C'), s = document.querySelector('#x17Scrub'), px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < px.length; i += 64) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++; const before = document.querySelector('#x17ScrubT').textContent; s.value = String(+s.min + 5); s.dispatchEvent(new Event('input', { bubbles: true })); return { lit, moved: document.querySelector('#x17ScrubT').textContent !== before }; });
    ok('3D volumetric order blocks + L2 wall fusion render, replay scrubber moves through history', d3.lit > 0 && d3.moved, JSON.stringify(d3));

    // markets: DOM ladder, confluence, tools
    await ev(() => showTab('markets'));
    const mk = await ev(() => ({ dom: !!document.querySelector('#x17Dom summary'), conf: document.querySelectorAll('#x17Conf i').length, tools: ['#x17RulerBtn', '#x17GridBtn', '#x17Trail'].every((s) => document.querySelector(s)), be: typeof V17App.netBE === 'function' }));
    ok('Collapsible DOM Spoof Ladder, 6-TF confluence pill, R:R / 2×2 / Smart Trail tools', mk.dom && mk.conf === 6 && mk.tools && mk.be, JSON.stringify(mk));
    const nbe = await ev(() => { const s = ST.sel, px = chart.data[chart.data.length - 1].c; ACC.buy(s, px, 1000, Date.now(), { src: 'test' }); V17App.Layer.dirty(); const l = V17App.Layer.lines().find((x) => x.label === 'NET BE'); ACC.sell(s, px, null, Date.now(), { src: 'test' }); return { has: !!l, above: l && l.p > px }; });
    ok('NET BE line sits above entry by fees + slippage for an open paper position', nbe.has && nbe.above, JSON.stringify(nbe));
    const g4 = await ev(async () => { document.querySelector('#x17GridBtn').click(); await new Promise((r) => setTimeout(r, 300)); const n = document.querySelectorAll('#x17Grid .x17-gc canvas').length; document.querySelector('#x17GridBtn').click(); return { n, back: !document.querySelector('#x17Grid') && !document.querySelector('#chartHost').hidden }; });
    ok('2×2 Multi-Chart Sync toggles four synced charts and back', g4.n === 4 && g4.back, JSON.stringify(g4));
    const voice = await ev(() => { const a = V17App.Voice.run('open pulse'), tab = curTab, o = V17App.Voice.run('buy $250 of BTC'); showTab('markets'); return { a: a.kind, tab, staged: V17App.voiceOrder && V17App.voiceOrder.usd === 250, trades: ACC.trades.filter((t) => t.src === 'voice').length }; });
    ok('Voice commands navigate and stage orders without executing them', voice.a === 'tab' && voice.tab === 'pulse' && voice.staged && voice.trades === 0, JSON.stringify(voice));

    // Academy
    await ev(() => document.querySelector('[data-x17r="Academy"]').click());
    const ac = await ev(() => { const mods = document.querySelectorAll('.x17-mod').length, missions = document.querySelectorAll('.x17-mod li').length, done = document.querySelectorAll('.x17-mod li.ok').length; document.querySelector('[data-x17a="drill"]').click(); return { mods, missions, done, drill: !!V17App.cfg.drill && document.querySelector('.x17-drill ol li') !== null }; });
    ok('Academy: 5 modules, 15 missions, progress from tools already used, Custom Drill Generator', ac.mods === 5 && ac.missions === 15 && ac.done >= 6 && ac.drill, JSON.stringify(ac));

    // Hide balances
    const hide = await ev(() => { V17Mob.hideBalances(true); const e = document.querySelector('#eqVal'), a = getComputedStyle(e, '::after').content, fs0 = getComputedStyle(e).fontSize; V17Mob.hideBalances(false); return { a, fs0, after: getComputedStyle(e).fontSize }; });
    ok('"Hide Balances" shows $***,*** and restores', /\$\*\*\*,\*\*\*/.test(hide.a) && hide.fs0 === '0px' && hide.after !== '0px', JSON.stringify(hide));

    // 10-language first-launch picker (fresh context: no saved language)
    const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push('PAGE2 ' + e.message));
    await p2.addInitScript(() => { try { localStorage.setItem('nt.forceGate', '1'); } catch (e) { /* storage */ } });
    await ctx.clearCookies(); await p2.goto(BASE + '/?fresh=1');
    await p2.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('nt.state') || 'null'); if (s && s.settings) { delete s.settings.lang; localStorage.setItem('nt.state', JSON.stringify(s)); } } catch (e) { /* none */ } });
    await p2.waitForFunction(() => typeof I18N !== 'undefined' && typeof V17Mob !== 'undefined', null, { timeout: 60000 });
    const lp = await p2.evaluate(async () => { I18N.gate(true); const g = document.querySelector('#langGate.x17-lang'); const codes = g ? [...g.querySelectorAll('#lgGrid .lg-card')].filter((c) => getComputedStyle(c).display !== 'none').sort((a, b) => +a.style.order - +b.style.order).map((b) => b.dataset.lang) : []; const q = g.querySelector('#lgQ'); q.value = 'japan'; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 30)); const search = (g.querySelector('#lgGrid .lg-card') || {}).dataset; q.value = ''; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 30)); if (!search || search.lang !== 'ja') return { codes, search: 'broken' }; const ar = g.querySelector('#lgGrid [data-lang="ar"]'); ar.click(); const ar2 = document.querySelector('#langGate #lgGrid [data-lang="ar"]'); if (ar2) ar2.click(); await new Promise((r) => setTimeout(r, 300)); return { codes, dir: document.documentElement.dir, lang: ST.settings.lang, idb: await V17Mob.pget('lang'), gone: !document.querySelector('#langGate') }; });
    ok('First-launch 10-language picker (EN/ES/ZH/JA/KO/FR/DE/PT/AR-RTL/HI) saves to IndexedDB, Arabic flips RTL', lp.codes.length === 10 && lp.codes.join() === 'en,es,zh-CN,ja,ko,fr,de,pt,ar,hi' && lp.dir === 'rtl' && lp.lang === 'ar' && lp.idb === 'ar' && lp.gone, JSON.stringify(lp));
    await p2.evaluate(() => I18N.set('en')); await p2.close();

    // phone viewport
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await m.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort())); await m.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close());
    const ph = await m.newPage(); ph.on('pageerror', (e) => errs.push('PHONE ' + e.message));
    await ph.goto(BASE + '/'); await ph.waitForFunction(() => typeof V17Mob !== 'undefined' && V17Mob.mounted && !!document.querySelector('#x17Dock'), null, { timeout: 60000 });
    await ph.evaluate(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #x17Brief')) x.remove(); });
    const mo = await ph.evaluate(() => { const d = document.querySelector('#x17Dock'), r = d.getBoundingClientRect(); return { dock: getComputedStyle(d).display, btns: d.querySelectorAll('button').length, bottom: Math.round(r.bottom) >= innerHeight - 1, nav: getComputedStyle(document.querySelector('#nav')).display, reach: getComputedStyle(document.querySelector('#x17Reach')).display, arc: getComputedStyle(document.querySelector('#x17Arc')).display, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
    ok('Mobile < 820 px: 5-tab bottom dock + thumb-arc pill replace the nav; no horizontal scroll', mo.dock !== 'none' && mo.btns === 5 && mo.bottom && mo.nav === 'none' && mo.reach === 'none' && mo.arc !== 'none' && !mo.hscroll, JSON.stringify(mo));
    const mo2 = await ph.evaluate(async () => { document.querySelector('[data-x17d="trade"]').click(); await new Promise((r) => setTimeout(r, 50)); const keys = document.querySelectorAll('#x17Keys button').length, inp = document.querySelector('#tkUsd'); inp.value = ''; for (const k of ['2', '5', '0']) document.querySelector(`#x17Keys [data-k="${k}"]`).click(); const v = inp.value; document.querySelector('[data-x17d="more"]').click(); const sheet = document.querySelector('#x17Sheet'); const chips = sheet.querySelectorAll('[data-x17m="reach"]').length; sheet.querySelector('[data-x17m="hand"]').click(); const left = document.body.classList.contains('x17-left'); sheet.querySelector('[data-x17m="qr"]').click(); const qr = !!document.querySelector('#x17Qr'); document.querySelector('[data-x17m="close"]').click(); V17Mob.mobile.swapSheet(); document.querySelector('#x17Ca').value = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; document.querySelector('#x17Ca').dispatchEvent(new Event('input')); const links = [...document.querySelectorAll('#x17Links a')].map((a) => a.textContent); const fee = /\$0 fee/.test(document.querySelector('#x17Sheet').textContent); V17Mob.mobile.close(); const w0 = ST.watch.slice(), s = w0[2]; V17Mob.swipeAct(s, 'pin'); const pinned = ST.watch[0] === s; ST.watch = w0; return { keys, v, chips, left, qr, links, fee, pinned }; });
    ok('Mobile: sizing keypad, More sheet with all 17 workspaces, left-handed, QR pairing, wallet deep links ($0 fee), swipe-to-pin', mo2.keys === 17 && mo2.v === '250' && mo2.chips === 17 && mo2.left && mo2.qr && mo2.links.join() === 'Phantom,Solflare,Jupiter' && mo2.fee && mo2.pinned, JSON.stringify(mo2));
    await m.close();

    ok('zero page errors across desktop, fresh first launch and phone', errs.length === 0, errs.slice(0, 6).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n')); const f = res.filter((x) => x.startsWith('FAIL')).length; console.log(`\n${res.filter((x) => x.startsWith('PASS')).length}/${res.filter((x) => /^(PASS|FAIL)/.test(x)).length} passed`); process.exit(f ? 1 : 0);
})();
const V17P_REACH_SENTINEL = ['Stocks', 'Crypto', 'On-Chain', 'Options', 'Futures', 'Screener', 'Pulse', '3D', 'Bot Fleet', 'Quant Lab', 'AI Bridge', 'Academy', 'Live Tape', 'Whales $25K+', 'Tracker', 'Positions', 'Briefing'].join('|');
