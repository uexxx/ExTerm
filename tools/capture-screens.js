// Copyright (c) 2026 ExTerm Labs. All Rights Reserved.
// Captures the 30 README screenshots (01–30) at 2× device pixel ratio from the offline launcher, in ONE headless browser that
// is closed at the end. Old docs/screenshots/*.png are deleted first. Usage: node tools/capture-screens.js
const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'docs', 'screenshots'), PORT = +process.env.EXTERM_SHOT_PORT || 8872, BASE = 'http://127.0.0.1:' + PORT;
const CHROME = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntshots-')), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [];
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); for (const f of fs.readdirSync(OUT)) if (/\.png$/i.test(f)) fs.unlinkSync(path.join(OUT, f));
  const srv = spawn(process.platform === 'win32' ? 'python' : 'python3', ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: ROOT, env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  for (let i = 0; i < 60; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await sleep(250); }
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const block = async (ctx) => { await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort())); await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); };
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); await block(ctx);
    const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    const ev = (f, a) => p.evaluate(f, a);
    const clean = () => ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief, #x17Wiz, #v170Clip')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    const shot = async (name, settle) => { await clean().catch(() => {}); await sleep(settle || 700); await ev(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); if (typeof V177UI !== 'undefined') V177UI.rail.wake(); }); const f = path.join(OUT, name); await p.screenshot({ path: f }); SHOTS.push(name); console.log('shot ' + name); };
    await p.goto(BASE + '/');
    await p.waitForFunction(() => typeof V17App !== 'undefined' && V17App.mounted && typeof chart !== 'undefined' && chart && chart.data.length > 200, null, { timeout: 90000 });
    await clean(); await sleep(2500);

    // 01 hero: chart with morning levels + GEX flip / call wall / put wall, DOM Spoof Ladder open in the side column, Live Tape
    await ev(async () => { showTab('markets'); if (typeof V166UI !== 'undefined') V166UI.toggle(true); V17App.Brief.plot(); await V17App.Opts.gex(); V17App.Layer.dirty(); chart.invalidate(); const d = document.querySelector('#x17Dom'); if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); const side = d.closest('.side-col'); if (side) side.scrollTop = Math.max(0, d.offsetTop - 160); } });
    await shot('01-hero-chart-gex-dom.png', 1800);
    // 02 + 03 Quant Lab Edge-Coach
    await ev(() => { showTab('lab'); V17App.Coach.run(); const c = document.querySelector('#x17Coach'); if (c) c.scrollIntoView({ block: 'start' }); });
    await shot('02-quant-lab-edge-coach.png');
    await ev(() => { const r = document.querySelector('#x17RR'); if (r) r.scrollIntoView({ block: 'start' }); });
    await shot('03-rr-heatmap-prop-firm.png');
    // 04 pulse
    await ev(() => { showTab('pulse'); V17App.Pulse.events(); V17App.Pulse.debate(); const s = document.querySelector('#x17Shock'); s.value = '-6'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await shot('04-pulse-event-backtester.png');
    // 05 arming wizard (step 2: zero-overdraft cap)
    await ev(() => { const W = V17App.Wizard; W.open(); W.st.ack = true; W.step = 1; W.st.settled = '25000'; W.st.cap = '5000'; W.paint(); });
    await sleep(300); await p.screenshot({ path: path.join(OUT, '05-arming-wizard.png') }); SHOTS.push('05-arming-wizard.png'); console.log('shot 05-arming-wizard.png');
    await ev(() => { const w = document.querySelector('#x17Wiz'); if (w) w.remove(); V17App.cfg.mode = 'paper'; V17App.save(); });
    // 06 morning briefing
    await ev(() => { showTab('markets'); V17App.Brief.open(true); });
    await sleep(500); await p.screenshot({ path: path.join(OUT, '06-morning-briefing.png') }); SHOTS.push('06-morning-briefing.png'); console.log('shot 06-morning-briefing.png');
    await ev(() => { const x = document.querySelector('#x17Brief'); if (x) x.remove(); });
    // 07 options
    await ev(async () => { showTab('opts'); await V17App.Opts.gex(); V17App.Opts.preset('ic'); });
    await shot('07-options-gex-multileg.png');
    // 08 futures
    await ev(() => { showTab('futs'); });
    await shot('08-futures-volume-profile.png');
    // v17.7 · 09 tactile 2D depth layers on the live 1s chart (the detached 3D chart mode is gone) · 19 the 13-pass depth drawer
    await ev(async () => { V177UI.go('copilot'); const b1 = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1s'); if (b1) b1.click(); for (let i = 0; i < 80 && !(chart.tfSec === 1 && chart.data.length > 40); i++) await new Promise((r) => setTimeout(r, 250)); for (const k of ['cvd', 'liq', 'avwap']) V177UI.depth.set(k, true); });
    await shot('09-tactile-2d-depth-1s-chart.png', 2500);
    await ev(() => { document.querySelector('#x177DepthB').click(); });
    await shot('19-depth-layers-drawer.png', 900); await ev(() => { document.querySelector('#x177DepthB').click(); for (const k of ['cvd', 'liq', 'avwap']) V177UI.depth.set(k, false); const b = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1m'); if (b) b.click(); });
    // v17.7 · 17 the 24/7 Optional Live Bot clean execution view (Co-Pilot switch + Arm wizard, approval queue, fleet)
    await ev(() => { V177UI.go('livebot'); V17App.cfg.mode = 'copilot'; V17App.Fleet.demo(); V17App.Fleet.propose(); V17App.Fleet.paint(); V177UI.live.paint(); });
    await shot('17-live-bot-clean-view.png', 1500); await ev(() => { V17App.cfg.mode = 'paper'; V17App.save(); V177UI.live.paint(); });
    // v17.5 · 18 Shock Lab (Quant Lab): flash-crash scenario on the live book
    await ev(async () => { showTab('lab'); await new Promise((r) => setTimeout(r, 900)); const c = document.querySelector('#x175sCat'); c.value = 'crash'; c.dispatchEvent(new Event('change')); const l = document.querySelector('#x175sList'); l.value = l.options[2].value; l.dispatchEvent(new Event('change')); await V175UI.shock.run(); document.querySelector('#x175Shock').scrollIntoView({ block: 'start' }); });
    await shot('18-shock-lab-flight-simulator.png', 1500);
    // v17.5 · 20 Options 3D IV & GEX surface (optional 2D | 3D pill)
    await ev(async () => { showTab('opts'); await new Promise((r) => setTimeout(r, 700)); document.querySelector('#tab-opts .x175-pill [data-x175v="3D"]').click(); });
    await shot('20-options-3d-iv-surface.png', 2500); await ev(() => { document.querySelector('#tab-opts .x175-pill [data-x175v="2D"]').click(); showTab('markets'); });
    // v17.7 · 10 full-bleed Terminal Brain (every worker lane, feed, process and squad bot as a live node) · 15 full-bleed 24/7 Bot Radar with a target lock · 28 MEV/Whales filter
    await ev(() => { V177UI.go('brain'); const B = window.__EXTERM_BUS; let i = 0; const ev8 = [['fill', 'Bots', 'demo BUY filled'], ['win', 'Ledger', 'TP hit'], ['block', 'Firewall', 'firewall block'], ['bot', 'Bots', 'evolution gen 20']]; const t = setInterval(() => { const e = ev8[i++ % ev8.length]; B.emit(e[0], { node: e[1], text: e[2], src: 'fleet' }); if (i > 14) clearInterval(t); }, 350); });
    await sleep(3000); await shot('10-terminal-brain-full-bleed.png', 400);
    await ev(async () => { V177UI.go('botradar'); for (let i = 0; i < 80; i++) { const r = [0, 0, 0]; for (const b of V177UI.radar.pop.m.values()) r[b.ring]++; if (r.every((x) => x > 2)) break; await new Promise((x) => setTimeout(x, 250)); } await new Promise((x) => setTimeout(x, 4000)); const R = V177UI.radar, w = [...R.pop.m.values()].filter((b) => b.ring === 0).sort((a, b) => b.usd - a.usd)[0]; if (w) R.lock = w.id; });
    await shot('15-bot-radar-full-bleed.png', 600);
    await ev(() => { V177UI.radar.lock = null; document.querySelector('[data-x177f="mev"]').click(); });
    await shot('28-bot-radar-mev-whales-filter.png', 1200); await ev(() => { document.querySelector('[data-x177f="all"]').click(); V177UI.go('copilot'); });
    await ev(async () => { showTab('heat'); for (let i = 0; i < 60; i++) { const bt = document.querySelector('[data-v164v="bubbles"]'); if (bt && !bt.classList.contains('on')) bt.click(); const cv = document.querySelector('canvas.v164-bub'); if (cv && cv._x173 && cv._x173.nodes.length) break; await new Promise((r) => setTimeout(r, 250)); } const t = document.querySelector('#tab-heat'); if (t) t.scrollTop = 0; });
    await shot('16-live-bubble-map.png', 2500);
    // 11 academy (with a drill)
    await ev(() => { V17Mob.drillGen(); showTab('academy'); });
    await shot('11-academy.png');
    // 12 language picker
    await ev(() => { showTab('markets'); V17Mob.langPicker(); });
    await sleep(500); await p.screenshot({ path: path.join(OUT, '12-language-picker.png') }); SHOTS.push('12-language-picker.png'); console.log('shot 12-language-picker.png');
    await ev(() => { const g = document.querySelector('#langGate'); if (g) g.remove(); });
    // 13 on-chain lab inside the Screener
    await ev(() => { showTab('heat'); const d = document.querySelector('#x17Chain'); if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); V17Mob.chain.rug(); V17Mob.chain.bubbles(); V17Mob.chain.smart(); d.scrollIntoView({ block: 'start' }); } });
    await sleep(1500); await ev(() => { const d = document.querySelector('#x17Chain'); if (d) d.scrollIntoView({ block: 'start' }); }); // Discovery tiles render late and push the card down
    await shot('13-onchain-lab.png', 600);
    // v17.6 · 21 Alpha Radar quantum dome + graded dossiers (wait for ≥ 15 picks and some live history)
    await ev(async () => { showTab('radar'); for (let i = 0; i < 60 && !(V176UI.res && V176UI.res.picks.length >= 15); i++) await new Promise((r) => setTimeout(r, 500)); document.querySelector('#tab-radar').scrollTop = 0; const p = V176UI.view()[0]; if (p) { V176UI.sel = p.sym; } });
    await shot('21-alpha-radar-quantum-dome.png', 4000);
    // v17.6 · 22 / 23 DEX bubble map (28–40 merged pools) on the 1h and 24h windows
    await ev(async () => { setMode('onchain'); await new Promise((r) => setTimeout(r, 2500)); showTab('heat'); await new Promise((r) => setTimeout(r, 800)); const bt = document.querySelector('[data-v164v="bubbles"]'); if (bt) bt.click(); for (let i = 0; i < 60; i++) { const c = document.querySelector('canvas.v164-bub'); if (c && c._x173 && c._x173.nodes.length >= 25) break; await new Promise((r) => setTimeout(r, 400)); } document.querySelector('[data-v164tf="1h"]').click(); const d = document.querySelector('#v164Dex'); if (d) d.scrollIntoView({ block: 'start' }); });
    await shot('22-dex-bubble-map-1h.png', 3500);
    await ev(() => { document.querySelector('[data-v164tf="24h"]').click(); const d = document.querySelector('#v164Dex'); if (d) d.scrollIntoView({ block: 'start' }); });
    await shot('23-dex-bubble-map-24h.png', 3500);
    // v17.6 · 25 On-Chain Token Desk (chain pills, CA resolver, Rug Shield v2, MEV + TWAP, handoffs)
    await ev(async () => { showTab('whales'); for (let i = 0; i < 30 && !V176UI.desk.rug; i++) await new Promise((r) => setTimeout(r, 400)); const d = document.querySelector('#x176Desk'); if (d) d.scrollIntoView({ block: 'start' }); });
    await shot('25-onchain-token-desk.png', 1500);
    // v17.6 · 24 Main chart: unclipped EDGE quant strip + toolbar that wraps clear of the order ticket
    await ev(async () => { setMode('crypto', 'BTC-USD'); showTab('markets'); await new Promise((r) => setTimeout(r, 2500)); V175UI.runEdge('markets'); });
    await shot('24-main-chart-quant-strip.png', 3500);
    // v17.8 · 31 full-range L2 liquidity ladder + Live Transactions tape (Lane 7) · 32 Tracker: On-Chain PnL leaderboard (Lane 5) · 33 Tracker: SEC Form 4 insiders (Lane 6)
    await ev(async () => { V177UI.go('copilot'); if (!V166UI.open) V166UI.toggle(true); const b1 = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1m'); if (b1) b1.click(); await new Promise((r) => setTimeout(r, 2500)); });
    await shot('31-l2-ladder-live-tape.png', 3000);
    await ev(async () => { V178UI.tracker.win = '30d'; V178UI.tracker.toggle(true); await new Promise((r) => setTimeout(r, 2000)); V178UI.tracker.paint(); });
    await shot('32-tracker-onchain-pnl-leaderboard.png', 900);
    await ev(async () => { V178UI.tracker.toggle(false); setMode('stocks', 'AAPL'); await new Promise((r) => setTimeout(r, 2500)); V178UI.tracker.toggle(true); await new Promise((r) => setTimeout(r, 2000)); V178UI.tracker.paint(); });
    await shot('33-tracker-sec-form4-insiders.png', 900); await ev(() => { V178UI.tracker.toggle(false); setMode('crypto', 'BTC-USD'); });
    // v17.9 · 35 ◆ Picks drawer (Lanes 11–16: tiers, consensus, Monte Carlo, criteria badges) · 36 the 24/7 Optional Live Bot execution strip (Lanes 17–19)
    await ev(async () => { V179UI.picks.toggle(true); for (let i = 0; i < 40 && !(V179UI.picks.data && V179UI.picks.data.rows && V179UI.picks.data.rows.length); i++) await new Promise((r) => setTimeout(r, 250)); V179UI.picks.paint(); });
    await shot('35-picks-recommendation-engine.png', 900); await ev(() => V179UI.picks.toggle(false));
    await ev(async () => { V177UI.go('livebot'); await new Promise((r) => setTimeout(r, 1500)); V179UI.strip.poll(); });
    await shot('36-live-bot-execution-strip.png', 1200); await ev(() => V177UI.go('copilot'));
    // v18.0 · 37 the 24/7 Alpha Recs tab (Lanes 11–16 feed, tiers, Why, consensus, Monte Carlo, levels, 1-click actions) · 38 fighter-jet 2D depth chart (plan lines, depth pill, magnifier)
    await ev(async () => { V177UI.go('alpha'); for (let i = 0; i < 60 && !(V180UI.data && V180UI.data.rows && V180UI.data.rows.length); i++) await new Promise((r) => setTimeout(r, 250)); V180UI.Alpha.paint(); document.querySelector('#tab-alpha').scrollTop = 0; });
    await shot('37-alpha-recs-feed.png', 1200);
    await ev(async () => { const r = [...V180UI.rows.values()].find((x) => x.mkt === 'crypto') || [...V180UI.rows.values()][0]; await V180UI.act.chart(r); await new Promise((x) => setTimeout(x, 2500)); const b = document.querySelector('#x180DPB'); if (b && document.querySelector('#x180DPL').hidden) b.click(); chart.invalidate(); });
    { const g = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L; return { x: r.left + L.Lm + (L.W - L.Rm - L.Lm) * 0.62, y: r.top + L.y0 + L.mainH * 0.42 }; }); await p.mouse.move(g.x - 20, g.y); await p.mouse.move(g.x, g.y, { steps: 4 }); }
    await sleep(600); await p.screenshot({ path: path.join(OUT, '38-depth-chart-plan-magnifier.png') }); SHOTS.push('38-depth-chart-plan-magnifier.png'); console.log('shot 38-depth-chart-plan-magnifier.png');
    await p.mouse.move(2, 2); await ev(() => { const L = document.querySelector('#x180DPL'); if (L && !L.hidden) document.querySelector('#x180DPB').click(); });
    // v18.1 · 41 a raw oc:eth:0x… contract opened from Ctrl+K on the 1s chart: candles on frame 1 (Lane 9 + 1m → 1s synthesis), no "next tick" wait
    await ev(async () => { V181UI.openChart('oc:eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'); for (let i = 0; i < 100 && !(chart.data && chart.data.length > 100 && /^oc:eth:/.test(ST.sel)); i++) await new Promise((r) => setTimeout(r, 50)); const t = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1s'); if (t) t.click(); for (let i = 0; i < 100 && !(ST.tf === '1s' && chart.data.length > 100); i++) await new Promise((r) => setTimeout(r, 50)); chart.invalidate(); });
    await shot('41-instant-chart-contract-1s.png', 1500);
    // v18.2 · 43 Portfolio & Risk Console (paper positions, 4 KPIs, actions, audit, EVO) · 44 the strip + a Shift+Drag ruler on the chart
    await ev(async () => { setMode('crypto', 'BTC-USD'); await new Promise((r) => setTimeout(r, 800)); const now = Date.now(); for (const [s, u, sl] of [['BTC-USD', 2500, 0.985], ['ETH-USD', 1500, 0.97], ['SOL-USD', 900, 0]]) { const q = px(s); if (q > 0) { ACC.buy(s, q, u, now, { reason: 'screenshot', src: 'manual' }); if (sl && ACC.pos[s]) ACC.pos[s].sl = q * sl; } } const e = px('ETH-USD'); if (e > 0 && ACC.pos['ETH-USD']) ACC.sell('ETH-USD', e * 1.004, ACC.pos['ETH-USD'].qty * 0.3, now, { reason: 'TP1 scale-out (screenshot)', src: 'manual' }); showTab('port'); const b = document.querySelector('[data-x182pf="book"][data-m="PAPER"]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 3500)); V182UI.Pf.render(true); });
    await shot('43-portfolio-risk-console.png', 1200);
    await ev(async () => { V177UI.go('copilot'); setMode('crypto', 'BTC-USD'); await new Promise((r) => setTimeout(r, 1500)); const t = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '15m'); if (t) t.click(); await new Promise((r) => setTimeout(r, 1500)); });
    { const g = await ev(() => { const r = chart.cv.getBoundingClientRect(), L = chart.L; return { x: r.left + L.Lm + (L.W - L.Rm - L.Lm) * 0.42, y: r.top + L.y0 + L.mainH * 0.62, x2: r.left + L.Lm + (L.W - L.Rm - L.Lm) * 0.78, y2: r.top + L.y0 + L.mainH * 0.3 }; }); await p.keyboard.down('Shift'); await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x2, g.y2, { steps: 8 }); await p.mouse.up(); await p.keyboard.up('Shift'); }
    await sleep(500); await ev(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); V177UI.rail.wake(); }); await p.screenshot({ path: path.join(OUT, '44-cockpit-strip-ruler.png') }); SHOTS.push('44-cockpit-strip-ruler.png'); console.log('shot 44-cockpit-strip-ruler.png');
    await p.keyboard.press('Escape');
    await ctx.close();
    // 14 mobile app (390 × 844 @2×)
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await block(m);
    const ph = await m.newPage(); await ph.goto(BASE + '/');
    await ph.waitForFunction(() => typeof V17Mob !== 'undefined' && V17Mob.mounted && typeof chart !== 'undefined' && chart && chart.data.length > 100 && !!document.querySelector('#x17Dock'), null, { timeout: 90000 });
    await ph.evaluate(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #x17Brief, #v170Clip')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); V17App.Brief.plot(); const a = document.querySelector('.x17-arcm'); a.click(); });
    await sleep(1500); await ph.evaluate(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await ph.screenshot({ path: path.join(OUT, '14-mobile-touch-cockpit.png') }); SHOTS.push('14-mobile-touch-cockpit.png'); console.log('shot 14-mobile-touch-cockpit.png');
    // v17.6 · 26 phone Alpha Radar · 27 phone DEX bubble map
    const phShot = async (name) => { await ph.evaluate(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); if (typeof V177UI !== 'undefined') V177UI.rail.wake(); }); await ph.screenshot({ path: path.join(OUT, name) }); SHOTS.push(name); console.log('shot ' + name); };
    await ph.evaluate(async () => { const a = document.querySelector('.x17-arcm'); if (a) a.click(); /* close the thumb arc that shot 14 opened */ showTab('radar'); for (let i = 0; i < 60 && !(V176UI.res && V176UI.res.picks.length >= 15); i++) await new Promise((r) => setTimeout(r, 500)); window.scrollTo(0, 0); });
    await sleep(3500); await phShot('26-mobile-alpha-radar.png');
    await ph.evaluate(async () => { setMode('onchain'); await new Promise((r) => setTimeout(r, 2500)); showTab('heat'); await new Promise((r) => setTimeout(r, 800)); const bt = document.querySelector('[data-v164v="bubbles"]'); if (bt) bt.click(); for (let i = 0; i < 60; i++) { const c = document.querySelector('canvas.v164-bub'); if (c && c._x173 && c._x173.nodes.length >= 25) break; await new Promise((r) => setTimeout(r, 400)); } const d = document.querySelector('.v164-tf'); if (d) d.scrollIntoView({ block: 'start' }); });
    await sleep(3500); await phShot('27-mobile-dex-bubble-map.png');
    // v17.7 · 29 phone 24/7 Bot Radar · 30 phone Terminal Brain (full-bleed 390 × 844, same 4-tab rail)
    await ph.evaluate(async () => { setMode('crypto', 'BTC-USD'); V177UI.go('botradar'); for (let i = 0; i < 80; i++) { const r = [0, 0, 0]; for (const b of V177UI.radar.pop.m.values()) r[b.ring]++; if (r.every((x) => x > 2)) break; await new Promise((x) => setTimeout(x, 250)); } });
    await sleep(3500); await phShot('29-mobile-bot-radar.png');
    await ph.evaluate(() => V177UI.go('brain')); await sleep(2500); await phShot('30-mobile-terminal-brain.png');
    // v17.8 · 34 phone below-chart Live Transactions tape (every control on screen)
    await ph.evaluate(async () => { V177UI.go('copilot'); if (!V166UI.open) V166UI.toggle(true); await new Promise((r) => setTimeout(r, 3000)); document.querySelector('#v166Tape').scrollIntoView({ block: 'end' }); });
    await sleep(1200); await phShot('34-mobile-live-tape.png');
    // v18.0 · 39 phone 24/7 Alpha Recs (5-tab rail) · 40 phone one-thumb action arc on Co-Pilot / Paper
    await ph.evaluate(async () => { if (V166UI.open) V166UI.toggle(false); V177UI.go('alpha'); for (let i = 0; i < 60 && !(V180UI.data && V180UI.data.rows && V180UI.data.rows.length); i++) await new Promise((r) => setTimeout(r, 250)); V180UI.Alpha.paint(); document.querySelector('#tab-alpha').scrollTop = 0; });
    await sleep(1500); await phShot('39-mobile-alpha-recs.png');
    await ph.evaluate(async () => { V177UI.go('copilot'); await new Promise((r) => setTimeout(r, 1500)); const a = document.querySelector('.x17-arcm'); if (a) a.click(); });
    await sleep(1000); await phShot('40-mobile-thumb-arc.png'); await ph.evaluate(() => { const a = document.querySelector('.x17-arcm'); if (a) a.click(); });
    // v18.1 · 42 phone: an oc:sol:… pool opened on the 1s chart with candles on frame 1
    await ph.evaluate(async () => { V181UI.openChart('oc:sol:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'); for (let i = 0; i < 100 && !(chart.data && chart.data.length > 100 && /^oc:solana:/.test(ST.sel)); i++) await new Promise((r) => setTimeout(r, 50)); const t = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '1s'); if (t) t.click(); for (let i = 0; i < 100 && !(ST.tf === '1s' && chart.data.length > 100); i++) await new Promise((r) => setTimeout(r, 50)); chart.invalidate(); });
    await sleep(1500); await phShot('42-mobile-instant-chart-1s.png');
    // v18.2 · 45 phone Portfolio & Risk Console (opened from the dock More sheet)
    await ph.evaluate(async () => { setMode('crypto', 'BTC-USD'); await new Promise((r) => setTimeout(r, 800)); const now = Date.now(); for (const [s, u, sl] of [['BTC-USD', 2000, 0.985], ['ETH-USD', 1200, 0]]) { const q = px(s); if (q > 0) { ACC.buy(s, q, u, now, { reason: 'screenshot', src: 'manual' }); if (sl && ACC.pos[s]) ACC.pos[s].sl = q * sl; } } document.querySelector('[data-x17d="more"]').click(); await new Promise((r) => setTimeout(r, 400)); const b = document.querySelector('#x17Sheet [data-x182m="pf"]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 3500)); V182UI.Pf.render(true); window.scrollTo(0, 0); });
    await sleep(1200); await phShot('45-mobile-portfolio.png');
    await m.close();
  } finally { await b.close(); }
  console.log(SHOTS.length + ' screenshots → docs/screenshots'); process.exit(SHOTS.length === 45 ? 0 : 1);
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
