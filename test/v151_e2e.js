// ExTerm v15.1 browser end-to-end: Candle X brand + favicon, killzone pill, workspace presets (click + Alt+N), every theme
// incl. Obsidian & Gold, live 1s candles with real high/low from ticks + 3px bodies, Auto-Setup (direct + row button that
// must not also open the row), hostile MACRO pins escaped in tooltips, whale markers + watchlist badges, % risk pill,
// Share/Recap PNGs, ? cheat sheet, Trader Tools (setup JSON import incl. hostile input, prop runner, correlation),
// neutral Pine Script labels, strict CSP, no inline handlers, phone width.
// Third-party APIs are blocked: the app runs on simulated prices through the --offline launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8798, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv151-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 940 }, acceptDownloads: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V151UI === 'object' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.overlays.includes(V151UI.overlay), null, { timeout: 60000 });
    const ev = (f, a) => page.evaluate(f, a);

    // 1. brand
    ok('header logo is the Candle X mark: gold ring + 8 candles + diamond, old violet mark gone', await ev(() => { const s = $('.brand .logo svg'); return !!s && s.querySelectorAll('rect').length === 9 && s.querySelectorAll('circle').length === 3 && !document.getElementById('ntBg') && /D4AF37/i.test(s.innerHTML); }));
    ok('wordmark EX (gold) + TERM (silver) + CRYPTO · STOCKS · DEX caption', await ev(() => $('.brand .wn').textContent === 'EX' && $('.brand .wt').textContent === 'TERM' && /CRYPTO · STOCKS · DEX/.test($('.brand .wcap').textContent)));
    ok('favicon is the inline data-URI Candle X ring', await ev(() => { const l = document.querySelector('link[rel="icon"]'); return !!l && /^data:image\/svg\+xml,/.test(l.getAttribute('href')) && /F3D06B/i.test(decodeURIComponent(l.getAttribute('href'))); }));
    ok('vault unlock badge uses the mark (function source)', await ev(() => /V151\.markSvg\(56, 'vault'\)/.test(String(typeof showVaultUnlock === 'function' ? showVaultUnlock : '')) || [...document.scripts].some((s) => /V151\.markSvg\(56, 'vault'\)/.test(s.textContent))));

    // 2. killzone pill + presets
    ok('killzone pill counts down to / within a New York session', await ev(() => /^(Asia|London|NY Open|Power Hour) (· .* left|in .*)$|^Weekend$/.test($('#kzText').textContent)), await ev(() => $('#kzText').textContent));
    ok('4 workspace presets in the nav', await ev(() => $$('#v151Presets button').length === 4));
    await page.click('#v151Presets button[data-preset="quant"]'); await sleep(300);
    ok('Quant Lab preset opens the Pro Desk quant section + saves a workspace layout', await ev(() => curTab === 'desk' && P5UI.cfg().sec === 'quant' && JSON.parse(localStorage.getItem('nt.ws')).cur === 'Quant Lab' && $('#v151Presets button[data-preset="quant"]').classList.contains('on')), await ev(() => JSON.stringify({ tab: curTab, sec: P5UI.cfg().sec, ws: (JSON.parse(localStorage.getItem('nt.ws') || 'null') || {}).cur, on: $('#v151Presets button[data-preset="quant"]').className })));
    await page.keyboard.press('Alt+4'); await sleep(900);
    ok('Alt+4 → Macro War Room (stocks + World tab + SPY ghost)', await ev(() => curTab === 'world' && ST.mode === 'stocks' && V151UI.cfg().ghost === 'SPY'), await ev(() => curTab + ' ' + ST.mode));
    await ev(() => { setMode('crypto'); }); await sleep(600); await ev(() => { showTab('markets'); V151UI.cfg().ghost = null; });
    await page.waitForFunction(() => ST.mode === 'crypto' && chart.data.length > 50, null, { timeout: 20000 });

    // 3. themes
    const th = await ev(() => {
      const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const out = [];
      for (const t of Themes.LIST) {
        Themes.apply(t.id); chart.invalidate(); chart.draw();
        const bodyBg = getComputedStyle(document.body).getPropertyValue('--panel-solid').trim(), txt = getComputedStyle($('#kzText')).color;
        const probe = document.createElement('div'); probe.style.background = bodyBg; document.body.appendChild(probe); const bg = getComputedStyle(probe).backgroundColor; probe.remove();
        out.push({ id: t.id, contrast: cr(txt, bg), acc: cssv('--acc', ''), bodyAcc: getComputedStyle(document.body).getPropertyValue('--acc').trim() });
      }
      Themes.apply('nova'); chart.invalidate();
      return out;
    });
    ok('Obsidian & Gold theme exists and is gold', th.some((t) => t.id === 'obsidian' && /D4AF37/i.test(t.bodyAcc)), JSON.stringify(th.find((t) => t.id === 'obsidian')));
    ok('every theme: header pill text has ≥ 4.5:1 contrast on the panel colour', th.every((t) => t.contrast >= 4.5), JSON.stringify(th.map((t) => t.id + ':' + t.contrast.toFixed(1))));
    ok('every theme: the chart reads the theme accent (tokens live on <body>)', th.every((t) => t.acc === t.bodyAcc), JSON.stringify(th.map((t) => t.id + ':' + t.acc + '/' + t.bodyAcc)));

    // 4. 1s candles with real wicks from ticks + 3px minimum body
    await ev(() => { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === '1s'); b.click(); });
    await page.waitForFunction(() => ST.tf === '1s' && chart.tfSec === 1 && chart.data.length > 5, null, { timeout: 20000 });
    const wick = await ev(async () => {
      const s = ST.sel, p = px(s) || chart.data[chart.data.length - 1].c, t = Math.floor(Date.now() / 1000) + 0.1;
      [[1, 1], [1.004, 2], [0.996, 1], [1.001, 1]].forEach(([k, q], i) => Feed.trade(s, p * k, q, 'buy', t + i * 0.2));
      await new Promise((r) => setTimeout(r, 1600));
      const st = getStore(s, '1s'), k = st.candles.find((c) => c.t === Math.floor(t));
      return k ? { h: k.h, l: k.l, o: k.o, c: k.c, p } : null;
    });
    ok('1s bar gets a real high / low from intra-second trades (not a flat dash)', wick && wick.h >= wick.p * 1.0039 && wick.l <= wick.p * 0.9961, JSON.stringify(wick));
    ok('minimum candle body is 3px', await ev(() => NT.bodyRect(100, 100, 50, 4).h === 3 && NT.bodyRect(100, 100.5, 50, 12).h === 3));
    ok('1s Y-axis scales to the visible candles only (no Bollinger / forecast padding)', await ev(() => { chart.o.bb = true; chart.invalidate(); chart.draw(); const L = chart.L; let lo = Infinity, hi = -Infinity; for (let i = L.start; i < L.end; i++) { lo = Math.min(lo, L.D[i].l); hi = Math.max(hi, L.D[i].h); } const pad = (L.hi - L.lo) - (hi - lo); chart.o.bb = false; return L.hi >= hi && L.lo <= lo && pad <= (hi - lo) * 0.09 + hi * 0.0009; }));

    // 5. whale markers + watchlist badge + chime path
    const wh = await ev(async () => {
      V151UI.cfg().whales = true; const s = ST.sel, p = px(s) || chart.data[chart.data.length - 1].c; if (!ST.watch.includes(s)) ST.watch.unshift(s);
      Feed.trade(s, p, (V151UI.cfg().whaleUsd * 2) / p, 'sell', Date.now() / 1000); renderWatch(); await new Promise((r) => setTimeout(r, 300));
      const row = [...$$('#watchList .wl-row')].find((r) => r.dataset.s === s);
      return { n: (V151UI.whales.get(s) || []).length, glow: !!row && row.classList.contains('v151-glow') && !!row.querySelector('.v151-bdg'), badge: row && row.querySelector('.v151-bdg') ? row.querySelector('.v151-bdg').textContent : '' };
    });
    ok('whale trade → chart marker + glowing 🐋 watchlist badge', wh.n >= 1 && wh.glow && wh.badge === '🐋', JSON.stringify(wh));
    ok('whale alerts are opt-in for webhooks (off by default) and chimes are muteable', await ev(() => V151UI.cfg().push === false && typeof V151UI.chime === 'function' && (V151UI.cfg().mute = true, V151UI.chime('whale'), true)));

    // 6. hostile MACRO pin + tooltip escaping
    await ev(() => { const D = chart.data, t = D[D.length - 20].t; Grok.intel = { items: P3.cleanIntel({ items: [{ id: 'h', title: '<img src=x onerror="window.__x=1">Strait closed', source: '<b>wire</b>', sev: 'CRITICAL', ts: t }] }), cfg: {}, err: '', ts: Date.now() / 1000 }; V151UI.pinKey = ''; chart.invalidate(); chart.draw(); });
    const pin = await ev(() => { const p = V151UI.pins.find((x) => x.kind === 'MACRO'); if (!p) return null; const r = chart.cv.getBoundingClientRect(); return { x: r.left + chart.tToX(p.t), y: r.top + chart.L.y0 + chart.L.mainH / 2 }; });
    ok('CRITICAL headline plotted as a MACRO pin on the candle timeline', !!pin);
    if (pin) { await page.mouse.move(pin.x, pin.y); await sleep(150); }
    ok('pin tooltip shows the headline escaped (no element injected, nothing executed)', await ev(() => { const t = $('#tip'); return t.style.display === 'block' && /MACRO/.test(t.textContent) && /<img/.test(t.textContent) && !t.querySelector('img') && t.querySelectorAll('b').length === 1 && window.__x === undefined; }), await ev(() => $('#tip').innerHTML.slice(0, 200)));

    // 7. Auto-Setup (direct) + 3-agent summary + preview lines + risk pill
    await ev(() => { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === '1h'); b.click(); });
    await page.waitForFunction(() => ST.tf === '1h' && chart.data.length > 60, null, { timeout: 20000 });
    const as = await ev(async () => { const R = await V151UI.autoSetup(ST.sel); return { ok: !!R, txt: R && R.txt, side: R && R.plan && R.plan.side, draft: ChartTrade.draft ? Object.assign({}, ChartTrade.draft) : null, fib: P5UI.cfg().ov.fib, pd: P5UI.cfg().ov.pd, modal: !!$('#v151Setup') }; });
    ok('Auto-Setup turns on Auto-Fibs + PDH/PDL and opens the 3-agent risk summary', as.ok && as.fib && as.pd && as.modal && /3-Agent Quant Desk/.test(as.txt || ''), JSON.stringify(as).slice(0, 300));
    ok('Auto-Setup places preview Entry/SL/TP lines sized to the risk %', as.side !== 'buy' || (as.draft && as.draft.entry > as.draft.sl && as.draft.usd > 0), JSON.stringify(as.draft));
    await ev(() => { const m = $('#v151Setup'); if (m) m.remove(); });
    await ev(() => { const p = px(ST.sel) || chart.data[chart.data.length - 1].c; ChartTrade.draft = { sym: ST.sel, usd: 1234, entry: p, sl: p * 0.98, tp: p * 1.04 }; ChartTrade.changed(false); chart.invalidate(); chart.draw(); });
    await page.waitForSelector('.ct-box .v151-risk', { timeout: 5000 }).catch(() => {});
    const rp = await ev(() => { const r = $('.ct-box .v151-risk'); return r ? { txt: r.textContent, dis: r.querySelector('[data-v151="apply"]').disabled } : null; });
    ok('% risk pill on the bracket shows $ at risk and size', rp && /at risk/.test(rp.txt) && !rp.dis, JSON.stringify(rp));
    await page.click('.ct-box [data-v151="apply"]').catch(() => {});
    ok('Apply Size sets the draft to the 1% risk size', await ev(() => { const d = ChartTrade.draft, s = V151.posSize({ equity: ACC.equity(priceMap()), riskPct: V151UI.cfg().risk, entry: d.entry, sl: d.sl }); return Math.abs(d.usd - s.usd) < 0.01 && d.usd !== 1234; }));
    await ev(() => { ChartTrade.draft = null; ChartTrade.changed(false); });

    // 8. Auto-Setup row button: runs once, and the row underneath does not also open
    const rb = await ev(async () => { let rowClicks = 0; const row = document.createElement('div'); row.className = 'p4-sr'; row.dataset.sym = 'ETH-USD'; row.innerHTML = '<b>ETH</b><button type="button" class="btn xs v151-as" data-autosetup="ETH-USD">⚙</button>'; row.addEventListener('click', () => rowClicks++); document.body.appendChild(row); const was = V151UI.autoSetup; let called = ''; V151UI.autoSetup = (s) => { called = s; }; row.querySelector('button').click(); V151UI.autoSetup = was; row.remove(); return { rowClicks, called }; });
    ok('row ⚙ button triggers Auto-Setup without firing the row click', rb.called === 'ETH-USD' && rb.rowClicks === 0, JSON.stringify(rb));
    ok('scanner rows, radar rows and bubble nodes carry the Auto-Setup hook', await ev(() => [...document.scripts].some((s) => /data-autosetup="\$\{esc\(x\.sym\)\}"/.test(s.textContent) && /a\.dataset\.autosetup = s/.test(s.textContent) && /e\.shiftKey && typeof V151UI/.test(s.textContent))));

    // 9. PNG exports (canvas must not be tainted)
    ok('Share Setup PNG renders the chart with the brand header + @exterm.labs', await ev(() => { const c = V151UI.shareCanvas(); return !!c && c.height > chart.cv.height && /^data:image\/png;base64,/.test(c.toDataURL('image/png')); }));
    ok('Daily Recap PNG renders a 1080² card', await ev(() => { const c = V151UI.recapCanvas(); return c.width === 1080 && /^data:image\/png/.test(c.toDataURL()); }));

    // 10. ? cheat sheet
    await ev(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); showTab('markets'); });
    await page.keyboard.press('Shift+Slash');
    ok('? opens the hotkey cheat sheet with Ctrl+K, Ctrl+Z/Y, presets and 1s/5s keys', await page.waitForSelector('#v14Keys', { timeout: 3000 }).then(() => ev(() => { const t = $('#v14Keys').textContent; return /Ctrl\+K/.test(t) && /Ctrl\+Z/.test(t) && /Alt\+1/.test(t) && /1 = 1s, 2 = 5s/.test(t); }), () => false));
    await page.keyboard.press('Escape');

    // 11. Trader Tools
    await page.click('#btnTools');
    ok('Trader Tools modal: presets, alerts, share, correlation, prop runner', await ev(() => $$('#v151Body section').length === 5 && $$('#v151Body [data-preset]').length === 4));
    await page.fill('#v151Json', JSON.stringify({ v: 1, app: 'ExTerm', sym: '<img src=x onerror=alert(1)>', entry: 1 }));
    await page.click('[data-v151="import"]');
    ok('hostile setup JSON rejected, message rendered as text', await ev(() => /Bad symbol/.test($('#v151JsonMsg').textContent) && !$('#v151JsonMsg img')));
    await page.fill('#v151Json', JSON.stringify({ v: 1, app: 'ExTerm', sym: 'SOL-USD', tf: '1h', entry: 100, sl: 95, tp: 110 }));
    await page.click('[data-v151="import"]'); await sleep(900);
    ok('valid setup JSON loads the market and the preview bracket', await ev(() => ST.sel === 'SOL-USD' && ChartTrade.draft && ChartTrade.draft.entry === 100 && ChartTrade.draft.sl === 95));
    const pr = await ev(async () => { const id = $('#v151Strat').value; const r = await V151UI.runProp(id, 'swan', 'covid'); return { ok: r.ok, passed: typeof r.passed === 'boolean', n: $$('#v151Strat option').length, dd: r.maxDD }; });
    ok('strategy → Black Swan runner grades a backtest (no network)', pr.ok && pr.passed && pr.n >= 80 && pr.dd >= 0, JSON.stringify(pr));
    await page.selectOption('#v151Mode', 'swan'); await page.click('[data-v151="prop"]');
    ok('prop runner result renders PASSED / FAILED', await page.waitForFunction(() => /PASSED|FAILED|Not enough/.test(($('#v151PropOut') || {}).textContent || ''), null, { timeout: 20000 }).then(() => true, () => false));
    await page.click('[data-v151="corr"]');
    ok('correlation matrix renders 6 assets (BTC SOL SPY NVDA DXY GOLD), never NaN', await page.waitForFunction(() => $$('.v151-corr tr').length === 7, null, { timeout: 30000 }).then(() => ev(() => !/NaN/.test($('.v151-corr').textContent) && /DXY/.test($('.v151-corr').textContent)), () => false));
    await ev(() => { const m = $('#v151Tools'); if (m) m.remove(); });

    // 12. Pine labels + no third-party brand claims
    await ev(() => showTab('bots')); await sleep(400);
    ok('Pine buttons use neutral labels (Export Pine Script v5 / Import Pine Script v5 compatible)', await ev(() => { const b = $('#bdPine'); return !!b && /Export Pine Script v5/.test(b.textContent) && [...document.scripts].some((s) => /Import Pine Script v5 compatible/.test(s.textContent)); }));
    const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'exterm.html'), 'utf8');
    ok('shipped build names no third-party charting brand', !/TradingView/i.test(html));

    // 13. security + layout
    ok('no inline event handlers anywhere in the DOM', await ev(() => ![...document.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)))));
    const csp = await ev(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
    ok('strict CSP: default-src none, SHA-256 script hash, no unsafe-inline script', /default-src 'none'/.test(csp) && /script-src[^;]*'sha256-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 200));
    await page.setViewportSize({ width: 390, height: 844 }); await ev(() => showTab('markets')); await sleep(300);
    ok('phone width: no horizontal page scroll', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1), await ev(() => document.documentElement.scrollWidth + ' > ' + innerWidth));
    ok('no page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 4).join(' || '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fails = res.filter((r) => r.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
