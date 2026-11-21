// Copyright (c) 2026 ExTerm Labs. All Rights Reserved.
// Captures the 14 README screenshots (01–14) at 2× device pixel ratio from the offline launcher, in ONE headless browser that
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
    const shot = async (name, settle) => { await clean().catch(() => {}); await sleep(settle || 700); await ev(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); }); const f = path.join(OUT, name); await p.screenshot({ path: f }); SHOTS.push(name); console.log('shot ' + name); };
    await p.goto(BASE + '/');
    await p.waitForFunction(() => typeof V17App !== 'undefined' && V17App.mounted && typeof chart !== 'undefined' && chart && chart.data.length > 200, null, { timeout: 90000 });
    await clean(); await sleep(2500);

    // 01 markets: morning levels + GEX walls + NET BE + confluence + Reach strip + Live Tape
    await ev(async () => { showTab('markets'); if (typeof V166UI !== 'undefined') V166UI.toggle(true); V17App.Brief.plot(); await V17App.Opts.gex(); V17App.Layer.dirty(); chart.invalidate(); });
    await shot('01-markets-terminal.png', 1500);
    // 02 + 03 Quant Lab Edge-Coach
    await ev(() => { showTab('lab'); V17App.Coach.run(); const c = document.querySelector('#x17Coach'); if (c) c.scrollIntoView({ block: 'start' }); });
    await shot('02-quant-lab-edge-coach.png');
    await ev(() => { const r = document.querySelector('#x17RR'); if (r) r.scrollIntoView({ block: 'start' }); });
    await shot('03-rr-heatmap-prop-firm.png');
    // 04 Bot Fleet
    await ev(() => { showTab('fleet'); V17App.cfg.mode = 'copilot'; V17App.Fleet.demo(); V17App.Fleet.propose(); V17App.Fleet.paint(); V17App.Fleet.evolve(); document.querySelector('#tab-fleet').scrollTop = 0; });
    await shot('04-bot-fleet-torus.png', 1200);
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
    // 09 pulse
    await ev(() => { showTab('pulse'); V17App.Pulse.events(); V17App.Pulse.debate(); const s = document.querySelector('#x17Shock'); s.value = '-6'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await shot('09-pulse-event-backtester.png');
    // 10 3D
    await ev(() => { showTab('d3'); V17App.D3.show(); });
    await shot('10-3d-order-blocks.png');
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
    await ctx.close();
    // 14 mobile app (390 × 844 @2×)
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await block(m);
    const ph = await m.newPage(); await ph.goto(BASE + '/');
    await ph.waitForFunction(() => typeof V17Mob !== 'undefined' && V17Mob.mounted && typeof chart !== 'undefined' && chart && chart.data.length > 100 && !!document.querySelector('#x17Dock'), null, { timeout: 90000 });
    await ph.evaluate(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #x17Brief, #v170Clip')) x.remove(); for (const t of document.querySelectorAll('#toasts > *')) t.remove(); V17App.Brief.plot(); const a = document.querySelector('.x17-arcm'); a.click(); });
    await sleep(1500); await ph.evaluate(() => { for (const t of document.querySelectorAll('#toasts > *')) t.remove(); });
    await ph.screenshot({ path: path.join(OUT, '14-mobile-app.png') }); SHOTS.push('14-mobile-app.png'); console.log('shot 14-mobile-app.png');
    await m.close();
  } finally { await b.close(); }
  console.log(SHOTS.length + ' screenshots → docs/screenshots'); process.exit(SHOTS.length === 14 ? 0 : 1);
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
