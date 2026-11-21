// ExTerm v15.7 browser end-to-end at 1440×900, English (LTR) + Arabic (RTL): 1s / 5s / 10s switch from the RAM tick ring
// in < 10 ms with true candle bodies (≥ 4px wide, ≥ 2.5px tall, gap between bars, no flat lines), O(1) indicator patching on
// the live 1s chart, the five pure-canvas 3D views (render, drag + arrow-key rotation, Reset Angle, zero frames while
// hidden), zero page errors / CSP violations; v15.1–v15.6 features (Ctrl+K, Simple | Pro, Quant Lab wizard + Bot Net
// Profit hero, Learn ExTerm) still work.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8817, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv157-'));
const SHOTS = process.env.EXTERM_SHOTS || ''; // optional: directory for the README screenshots
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); // offline: no outside WebSockets either
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' && /Content Security Policy|Refused to/.test(t)) || /^v157 /.test(t)) errs.push('CONSOLE ' + t); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    const shot = async (name) => { if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(SHOTS, name) }); } };
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V157UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && document.body.classList.contains('v157'), null, { timeout: 60000 });
    await ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard')) x.remove(); setMode('crypto'); selectSym('BTC-USD'); });
    ok('ring: live trades fill the 1s Float64Array ring for the selected market', await waitFor(() => V157.rings.get(ST.sel) && V157.rings.get(ST.sel).size >= 20, null, 45000), await ev(() => (V157.rings.get(ST.sel) || {}).size));

    // ── 1. 1s / 5s / 10s: cold switch from RAM, true candle form
    ok('timeframes: 1s, 5s and 10s buttons are offered', await ev(() => ['1s', '5s', '10s'].every((t) => [...document.querySelectorAll('#tfBtns button')].some((x) => x.textContent.trim() === t))));
    for (const tf of ['10s', '5s', '1s']) {
      const r = await ev((tf) => {
        const k = ST.sel + '|' + tf, old = Stores.get(k); if (old) { Stores.delete(k); const ss = StoresBySym.get(ST.sel); if (ss) ss.delete(old); } // cold: no cached store for this timeframe
        const btn = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === tf), s0 = V157UI.stats.seeded, t0 = performance.now(); btn.click(); const dt = performance.now() - t0, d = chart.data, n = d.length;
        return { dt, n, step: n > 1 ? d[n - 1].t - d[n - 2].t : 0, seeded: V157UI.stats.seeded - s0, seedMs: V157UI.stats.seedMs };
      }, tf);
      ok(`${tf}: cold switch renders candles from the RAM ring in < 10 ms (no network wait)`, r.dt < 10 && r.n >= (tf === '1s' ? 11 : 2) && r.seeded === 1 && r.step === { '1s': 1, '5s': 5, '10s': 10 }[tf], JSON.stringify(r));
      await sleep(400);
      const g = await ev(async () => {
        const rec = [], f = NT.bodyRect; NT.bodyRect = (...a) => { const r = f(...a); rec.push(r); return r; };
        chart.invalidate(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); NT.bodyRect = f;
        rec.sort((a, b) => a.x - b.x); const gaps = rec.slice(1).map((r, i) => r.x - (rec[i].x + rec[i].w));
        return { n: rec.length, minW: Math.min(...rec.map((r) => r.w)), minH: Math.min(...rec.map((r) => r.h)), minGap: Math.min(...gaps), avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length, bars: chart.view.bars, plotW: chart.L.plotW };
      });
      ok(`${tf}: every candle has a real body (width ≥ 4px, height ≥ 2.5px), bars never touch (avg gap ≈ 2px), count fits the plot`, g.n >= (tf === '1s' ? 11 : 2) && g.minW >= 4 && g.minH >= 2.5 && g.minGap >= 1 && g.avgGap >= 1.5 && g.bars <= Math.floor(g.plotW / 6) + 1, JSON.stringify(g));
    }
    ok('1s: gapless candles (open = prior close) on the live chart', await ev(() => { const d = chart.data.slice(-120); return d.every((k, i) => i === 0 || Math.abs(k.o - d[i - 1].c) < 1e-9); }));
    { const p0 = await ev(() => V156UI.stats.patch); await sleep(3000); const p1 = await ev(() => V156UI.stats.patch);
      ok('1s: indicators update in O(1) on live ticks (forming-bar patch, not a full recompute)', p1 > p0, `${p0} → ${p1}`); }
    if (SHOTS) { await ev(() => { chart.view.bars = 72; chart.invalidate(); }); await sleep(25000); await ev((x) => { const re = new RegExp('^' + x + '(-|\\b)'); ST.watch = ST.watch.filter((s) => !re.test(s)); renderWatch(); for (const e of document.querySelectorAll('.ticker *')) if (re.test(e.textContent.trim())) e.style.display = 'none'; }, 'S' + 'OL'); } // docs screenshots: zoom in on bodies, keep the shot to the majors
    await shot('v15.7-1s-candles.png');

    // ── 2. 3D views
    const frames = () => ev(() => Object.assign({}, V157UI.stats.frames));
    const painted = (id) => ev((id) => { const c = $('#' + id + ' canvas'); if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 16) if (d[i]) k++; return k; }, id);
    const check3d = async (id, label) => {
      await ev((id) => $('#' + id).scrollIntoView({ block: 'center' }), id); await sleep(700);
      const f = await frames(), px = await painted(id);
      ok(`${label}: renders on its own canvas (frames drawn, non-blank)`, f[id] > 0 && px > 200, JSON.stringify({ f: f[id], px }));
      const a0 = await ev((id) => Object.assign({}, V157UI.views.get(id).ang), id), box = await page.locator('#' + id + ' canvas').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 25, { steps: 5 }); await page.mouse.up();
      const a1 = await ev((id) => Object.assign({}, V157UI.views.get(id).ang), id);
      await page.focus('#' + id + ' canvas'); await page.keyboard.press('ArrowLeft'); const a2 = await ev((id) => Object.assign({}, V157UI.views.get(id).ang), id);
      await page.click('#' + id + ' [data-v157="reset"]'); const a3 = await ev((id) => Object.assign({}, V157UI.views.get(id).ang), id), a00 = await ev(() => V157.ANG0);
      ok(`${label}: drag rotates, arrow keys rotate, Reset Angle restores the default view`, Math.abs(a1.yaw - a0.yaw) > 0.5 && Math.abs(a2.yaw - a1.yaw) > 0.05 && a3.yaw === a00.yaw && a3.pitch === a00.pitch, JSON.stringify([a0, a1, a2, a3]));
    };
    await ev(() => { showTab('desk'); }); await sleep(800);
    ok('Flow: Liquidity Terrain + IV & Gamma Surface mount beside the desk (outside its 1 s re-render)', await waitFor(() => !!$('#v157Flow #v157Terrain') && !!$('#v157Flow #v157IV') && !$('#p5Body #v157Terrain'), null, 8000));
    await sleep(2500);
    await check3d('v157Terrain', '3D Order-Book Liquidity Terrain');
    await ev(() => $('#v157Terrain').scrollIntoView({ block: 'center' })); await shot('v15.7-liquidity-terrain.png');
    await check3d('v157IV', '3D Options IV & Gamma Surface');
    await page.click('#v157IV [data-v157="gamma"]'); await sleep(500);
    ok('IV surface: Γ toggle switches the mesh to $ gamma', await ev(() => /gamma/.test($('#v157IV .v157-cap').textContent) && $('#v157IV [data-v157="gamma"]').classList.contains('on')));
    await ev(() => $('#v157IV').scrollIntoView({ block: 'center' })); await shot('v15.7-gamma-surface.png');

    // hidden tab: zero frames
    await ev(() => showTab('markets')); await sleep(400);
    { const f0 = await frames(); await sleep(1500); const f1 = await frames(); ok('3D: hidden views draw zero frames (paused off-tab)', ['v157Terrain', 'v157IV', 'v157Corr', 'v157Whale', 'v157Mtn'].every((k) => f1[k] === f0[k]), JSON.stringify([f0, f1])); }

    await ev(() => showTab($('#tab-world') ? 'world' : 'ai')); await sleep(1500);
    ok('Macro: Correlation & Regime Orbit mounts', await waitFor(() => !!$('#v157Corr') && $('#v157Corr').offsetParent !== null, null, 8000));
    await check3d('v157Corr', '3D Multi-Asset Correlation & Regime Orbit');

    await ev(() => showTab('whales')); await sleep(1500);
    ok('Whales: Whale & Liquidation Cluster Orbit mounts', await waitFor(() => !!$('#v157Whale') && $('#v157Whale').offsetParent !== null, null, 8000));
    await check3d('v157Whale', '3D Whale & Liquidation Cluster Orbit');

    // ── 3. Quant Lab (wizard + Bot Net Profit hero) + Profit Mountain in step 2
    await ev(() => { showTab('lab'); }); await sleep(600); if (await ev(() => !!$('#labNav button[data-v="q153"]'))) await page.click('#labNav button[data-v="q153"]'); await sleep(800);
    if (await ev(() => !!$('#q153Base .v155-starter'))) await page.click('#q153Base .v155-starter'); else await ev(() => V153UI.A.base());
    ok('Quant Lab: 4-step wizard + Bot Net Profit $ hero card render', await waitFor(() => $$('.v155-steps [data-step]').length === 4 && !!$('#v155HeroQ') && /\$/.test(($('#v155HeroQNet') || {}).textContent || ''), null, 40000));
    ok('Lab step 2: Profit Mountain mounts inside step 2', await waitFor(() => !!$('.v155-step[data-step="2"] #v157Mtn'), null, 5000));
    await ev(() => $('#v157Mtn').scrollIntoView({ block: 'center' })); await sleep(300);
    await page.click('#v157Mtn [data-v157="build"]');
    ok('Profit Mountain: 7 × 7 stop / target sweep finishes with a plateau-vs-spike verdict and a $ figure', await waitFor(() => /\$/.test($('#v157Mtn .v157-cap').textContent) && /plateau|ridge|spike|no profitable/.test($('#v157Mtn .v157-cap').textContent), null, 60000), await ev(() => $('#v157Mtn .v157-cap').textContent));
    await check3d('v157Mtn', '3D Quant Lab Profit Mountain');
    await ev(() => $('#v157Mtn').scrollIntoView({ block: 'center' })); await shot('v15.7-profit-mountain.png');

    // ── 4. v15.1–v15.6 features still work
    await ev(() => showTab('markets')); await sleep(400);
    await page.keyboard.press('Control+k'); await sleep(250);
    ok('Ctrl+K command palette still opens and searches', await ev(() => $('#palette').classList.contains('on')) && (await page.fill('#palIn', 'ichimoku'), await sleep(200), await ev(() => palItems.some((x) => /Ichimoku/i.test(x.l)))));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(500);
    ok('Simple | Pro: Simple mode trims the nav and keeps the 1-word labels', await ev(() => document.body.classList.contains('v155-simple') && $('#nav button[data-tab="markets"] .v156-nl').textContent === 'Markets'));
    await page.click('#v155Ws [data-ws="pro"]'); await sleep(400);
    ok('Learn ExTerm still opens from the Learn tab', await ev(async () => { $('#btnLearn').click(); await new Promise((r) => setTimeout(r, 400)); const v = [...document.querySelectorAll('[id^="lx"], .lx-modal, .learn-modal, [class*="learn"]')].some((e) => e.offsetParent !== null && e.id !== 'btnLearn' && e.getBoundingClientRect().width > 300); LearnUI.close(); return v; }));
    ok('inspector rail still opens (v15.6)', await ev(() => { V156UI.openInspector('Test', '<p>t</p>'); const ok1 = !$('#v155Drawer').hidden; V155S.closeDr(); return ok1; }));

    // ── 5. Arabic RTL
    await ev(() => { I18N.set('ar'); showTab('desk'); }); await sleep(1200);
    { const f0 = await frames(); await ev(() => $('#v157Terrain').scrollIntoView({ block: 'center' })); await sleep(1500); const f1 = await frames();
      ok('RTL: page mirrors, 3D views keep rendering, no horizontal scroll at 1440×900', await ev(() => document.documentElement.dir === 'rtl' && document.documentElement.scrollWidth <= innerWidth) && f1.v157Terrain > f0.v157Terrain, JSON.stringify([f0.v157Terrain, f1.v157Terrain])); }
    await ev(() => { showTab('markets'); const b2 = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === '5s'); b2.click(); }); await sleep(800);
    ok('RTL: 5s candles keep true form (body ≥ 4px)', await ev(async () => { const rec = [], f = NT.bodyRect; NT.bodyRect = (...a) => { const r = f(...a); rec.push(r); return r; }; chart.invalidate(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); NT.bodyRect = f; return rec.length > 10 && rec.every((r) => r.w >= 4 && r.h >= 2.5); }));
    await ev(() => I18N.set('en')); await sleep(300);

    ok('zero page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 5).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
  process.exit();
})();
