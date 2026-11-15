// ExTerm v15.2 browser end-to-end: first-launch language gate (fuzzy search, RTL, persistence, 🌐 pill), progressive
// disclosure (clean default, collapsed drawer sections that all render), chart overlays + bar timer, HUD clean mode (H),
// TP ladder, AVWAP click-anchor, Ctrl+K calculator / language / theme, formula scanner (hostile input), composer → Pine,
// NL rule compiler + dry-run, signed share codes (tamper rejected), theme tokens, devil's advocate gate, launcher health +
// integrity endpoints, replay speed keys + blind drill, strict CSP, no inline handlers, phone width.
// Third-party APIs are blocked: the app runs on simulated prices through the --offline launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8799, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv152-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'es-ES' });
    await ctx.addInitScript(() => { try { localStorage.setItem('nt.forceGate', '1'); } catch (e) { /* storage */ } });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const ev = (f, a) => page.evaluate(f, a);

    // ── 1. first-launch language gate
    await page.goto(BASE + '/');
    await page.waitForSelector('#langGate', { timeout: 30000 });
    ok('gate: the very first screen is the language gate (before the walkthrough), Obsidian & Gold card', await ev(() => !!$('#langGate .lg-card-wrap') && !$('#walkCard') && /rgba?\(/.test(getComputedStyle($('#langGate .lg-card-wrap')).borderTopColor)));
    ok('gate: pre-selects the browser language (es-ES → Español) and speaks it', await ev(() => $('#langGate .lg-card.on').dataset.lang === 'es' && $('#lgTitle').textContent === 'Elige tu idioma'), await ev(() => $('#lgTitle').textContent));
    ok('gate: 32 named language cards with flag + native + English names', await ev(() => $$('#lgGrid .lg-card').length >= 32 && [...$$('#lgGrid .lg-card b')].some((x) => x.textContent === '中文 (繁體)') && [...$$('#lgGrid .lg-card b')].some((x) => x.textContent === 'Kiswahili')));
    await page.fill('#lgQ', 'japan'); await sleep(100);
    ok('gate: fuzzy search "japan" → 日本語 first', await ev(() => $('#lgGrid .lg-card').dataset.lang === 'ja'));
    await page.fill('#lgQ', 'quechua'); await sleep(100);
    ok('gate: ISO-639 fallback locales are searchable (Quechua, English interface)', await ev(() => [...$$('#lgGrid .lg-card')].some((x) => x.dataset.lang === 'qu' && x.classList.contains('fb'))));
    await page.fill('#lgQ', '"><img src=x onerror=alert(1)>'); await sleep(100);
    ok('gate: hostile search text is inert', await ev(() => !document.querySelector('#lgGrid img')));
    await page.fill('#lgQ', 'arab'); await sleep(100); await page.keyboard.press('Enter'); await sleep(300);
    ok('RTL: Arabic sets <html dir="rtl" lang="ar"> and mirrors layout', await ev(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar' && document.body.classList.contains('rtl')));
    ok('nav: all 13 tab buttons intact and clickable after translation', await ev(() => $$('#nav button[data-tab]').length >= 13 && [...$$('#nav button[data-tab]')].every((b) => b.offsetParent && b.querySelector('.ni'))));
    ok('i18n: nav + header translate live (الأسواق, رصيد تجريبي), pill shows 🌐 AR', await ev(() => $('[data-i18n="nav.markets"]').textContent === 'الأسواق' && $('[data-i18n="hdr.equity"]').textContent === 'رصيد تجريبي' && $('#btnLang').textContent === '🌐 AR'));
    ok('gate: closed after choosing; language saved in settings', await ev(() => !$('#langGate') && ST.settings.lang === 'ar'));
    await page.waitForFunction(() => typeof V152UI === 'object' && !!$('#btnWs') && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.overlays.includes(V152UI.overlay), null, { timeout: 60000 });
    await page.click('#btnLang'); await page.waitForSelector('#langGate');
    ok('🌐 pill reopens the selector in the current language', await ev(() => $('#lgTitle').textContent === 'اختر لغتك' && $('#langGate').dir === 'rtl'));
    await page.click('#lgGrid [data-lang="de"]'); await page.click('#lgGo'); await sleep(200);
    ok('switch to Deutsch: LTR again, Märkte / Einstellungen', await ev(() => document.documentElement.dir === 'ltr' && $('[data-i18n="nav.markets"]').textContent === 'Märkte' && $('[data-i18n="nav.set"]').textContent === 'Einstellungen'));
    await ev(() => saveState()); await page.reload();
    await page.waitForFunction(() => typeof V152UI === 'object' && !!$('#btnWs') && typeof chart !== 'undefined' && chart && chart.data.length > 50 && chart.overlays.includes(V152UI.overlay), null, { timeout: 60000 }); await sleep(400);
    ok('reload: no gate (language persisted), still German', await ev(() => !$('#langGate') && $('[data-i18n="nav.markets"]').textContent === 'Märkte'));
    await ev(() => I18N.set('en'));

    // ── 2. progressive disclosure: clean default
    ok('clean default: drawer closed, labels / walls / gamma / PiP / sync / DEX strip off, bar timer on', await ev(() => { const c = V152UI.cfg(); return !$('#v152Drawer.on') && !c.labels.fvg && !c.labels.ob && !c.walls && !c.gamma && !c.pip && !c.group && !c.dexStrip && c.timer && !$('#v152Pip') && !$('#v152Sync'); }));
    await page.click('#btnMore'); await page.click('#btnWs'); await sleep(300);
    ok('drawer: 6 phases, 30 tool sections, all collapsed', await ev(() => $$('#v152Drawer .v152-ph').length === 6 && $$('#v152Drawer details').length === 30 && ![...$$('#v152Drawer details')].some((d) => d.open)));
    const secErr = await ev(async () => { const bad = []; for (const d of $$('#v152Drawer details')) { d.open = true; await new Promise((r) => setTimeout(r, 15)); const b = d.querySelector('.v152-sb'); if (!b.innerHTML.trim()) bad.push(d.dataset.sec); d.open = false; } return bad; });
    ok('drawer: every section renders when opened', secErr.length === 0, secErr.join(','));
    await page.fill('#v152Q', 'pine'); await sleep(100);
    ok('drawer filter narrows to the composer', await ev(() => [...$$('#v152Drawer details')].filter((d) => !d.hidden).map((d) => d.dataset.sec).join() === 'compose'));
    await page.fill('#v152Q', '');

    // ── 3. chart: bar timer, labels, events, HUD
    await ev(() => { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === '5s'); if (b) b.click(); });
    await page.waitForFunction(() => chart.tfSec === 5 && chart.data.length > 3, null, { timeout: 20000 });
    ok('bar timer counts down inside the 5s bar', await ev(() => { const t = V152.barTimer(Date.now(), chart.tfSec); return t.left > 0 && t.left <= 5000 && /s$/.test(t.label); }));
    await ev(() => { const c = V152UI.cfg(); c.labels.fvg = c.labels.eng = c.labels.ob = c.labels.sweep = true; c.cvdDiv = true; c.sess.ny = true; chart.invalidate(); chart.draw(); });
    ok('auto-labels + CVD + session profile overlays draw without errors', errs.length === 0, errs.join('|'));
    await ev(() => { const c = V152UI.cfg(); c.labels.fvg = c.labels.eng = c.labels.ob = c.labels.sweep = false; c.cvdDiv = false; c.sess.ny = false; });
    await ev(() => { showTab('markets'); document.activeElement.blur(); });
    await page.keyboard.press('h'); await sleep(200);
    ok('H → HUD clean mode: nav + ticker hidden, Candle X watermark', await ev(() => document.body.classList.contains('hud-clean') && getComputedStyle($('#nav')).display === 'none' && !!$('#hudMark') && /Candle X/.test($('#hudMark').textContent)));
    await page.keyboard.press('h'); await sleep(100);
    ok('H again restores the workspace', await ev(() => !document.body.classList.contains('hud-clean') && getComputedStyle($('#nav')).display !== 'none' && !$('#hudMark')));
    await ev(() => { V152UI.cfg().pip = true; }); await sleep(1300);
    ok('PiP mini chart appears on a 5s chart', await ev(() => !!$('#v152Pip canvas')));
    await ev(() => { V152UI.cfg().pip = false; });

    // ── 4. TP ladder, AVWAP, CRO
    await ev(() => V152UI.A.ladder());
    ok('TP ladder attaches TP1–3 with 50/30/20 splits', await ev(() => { const L = V152UI.ladder; return !!L && L.L.levels.length === 3 && L.L.levels.map((x) => x.pct).join() === '50,30,20'; }));
    await ev(() => V152UI.A.pickAv());
    const box = await page.locator('#chartHost canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4); await sleep(200);
    ok('AVWAP: click a candle to anchor', await ev(() => V152UI.cfg().anchor > 0));
    await ev(() => { V152UI.cfg().anchor = null; V152UI.ladder = null; });
    await ev(() => { V152UI.cfg().cro = true; ChartTrade.demo(); ChartTrade.place(); }); await sleep(200);
    ok("devil's advocate grades the bracket A–F before placing", await ev(() => !!$('#v152Cro') && /grade [A-F]/.test($('#v152Cro').getAttribute('aria-label'))));
    await ev(() => { const m = $('#v152Cro'); if (m) m.remove(); V152UI.cfg().cro = false; ChartTrade.draft = null; });

    // ── 5. Ctrl+K: calculator, language, theme
    await ev(() => palOpen()); await page.fill('#palIn', '10000 * 0.015 / 12.5'); await sleep(150);
    ok('Ctrl+K calculator: 10000 * 0.015 / 12.5 = 12 on top', await ev(() => palItems[0] && palItems[0].l === '= 12'));
    await page.fill('#palIn', 'español'); await sleep(150);
    ok('Ctrl+K language switch command', await ev(() => palItems.some((x) => x.l === '🌐 Language: Español')));
    await page.fill('#palIn', 'theme obsidian'); await sleep(150);
    ok('Ctrl+K theme switch command', await ev(() => palItems.some((x) => x.l === '🎨 Theme: Obsidian & Gold')));
    await page.keyboard.press('Escape');

    // ── 6. scanner formula, composer, NL compiler
    await ev(() => V152UI.open('scan')); await page.fill('#v152F', 'constructor > 1'); await ev(() => V152UI.A.runF());
    ok('formula scanner rejects unknown identifiers (no eval)', await ev(() => /Unknown field/.test($('#v152ScanOut').textContent)));
    await page.fill('#v152F', 'PRICE > 0'); await ev(() => V152UI.A.runF());
    ok('formula scanner runs over the watchlist', await ev(() => $$('#v152ScanOut tr').length >= 1), await ev(() => $('#v152ScanOut').textContent));
    await ev(() => { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === '1h'); if (b) b.click(); }); await page.waitForFunction(() => chart.tfSec === 3600 && chart.data.length > 100, null, { timeout: 20000 });
    await ev(() => V152UI.open('compose')); await ev(() => V152UI.A.compPine());
    ok('composer exports Pine Script v5', await ev(() => /^\/\/@version=5/.test($('#v152CompOut textarea').value) && /ta\.crossover|ta\.rsi/.test($('#v152CompOut textarea').value)));
    await ev(() => V152UI.A.compBt());
    ok('composer backtests on the chart', await ev(() => /Return/.test($('#v152CompOut').textContent)), await ev(() => $('#v152CompOut').textContent));
    await ev(() => showTab('grok')); await page.waitForSelector('#v152Nl', { timeout: 10000 });
    await ev(() => { $('#v152Nl').open = true; $('[data-nl="compile"]').click(); });
    ok('Grok: plain-English rules compile to workflow JSON', await ev(() => { const j = JSON.parse($('#v152NlOut textarea').value); return j.kind === 'exterm-workflow' && j.rules.sl === 2 && j.rules.tp === 6; }));
    await sleep(5500);
    ok('Grok: daemon health strip (uptime, latency, cache, heartbeats) from /api/health', await ev(() => /Daemon/.test($('#v152Tele').textContent) && /up /.test($('#v152Tele').textContent)), await ev(() => $('#v152Tele').textContent));
    await ev(() => showTab('markets'));

    // ── 7. signed share codes + tokens
    await ev(() => V152UI.open('share')); await ev(() => V152UI.A.shareWs()); await page.waitForFunction(() => /^EXT1\./.test($('#v152Code').value), null, { timeout: 8000 });
    const code = await ev(() => $('#v152Code').value);
    await ev(() => V152UI.A.importCode()); await sleep(300);
    ok('share code: signer fingerprint + changes shown BEFORE applying (new signer flagged)', await ev(() => /new signer/.test($('#v152CodeMsg').textContent) && !!$('#v152CodeMsg [data-a="applyCode"]')), await ev(() => $('#v152CodeMsg').textContent));
    await ev(() => V152UI.A.applyCode()); await sleep(200);
    ok('share code: signed workspace code verifies + applies with signer fingerprint', await ev(() => /applied ✓ · signed by ([0-9a-f]{2}:){5}[0-9a-f]{2}/.test($('#v152CodeMsg').textContent)), await ev(() => $('#v152CodeMsg').textContent));
    const parts = code.split('.'); const forged = parts[0] + '.' + parts[1].slice(0, -4) + 'AAAA.' + parts[2];
    await ev((c) => { $('#v152Code').value = c; }, forged); await ev(() => V152UI.A.importCode()); await sleep(200);
    ok('share code: tampered code rejected', await ev(() => /altered|Corrupted|Not an/.test($('#v152CodeMsg').textContent)), await ev(() => $('#v152CodeMsg').textContent));
    await ev(() => { V152UI.cfg().tokens = { '--acc': '#00ff88' }; }); await ev(() => V152UI.open('theme')); await ev(() => { const i = $('[data-tok="--acc"]'); i.value = '#11aa55'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    ok('theme token editor applies a custom accent on top of the theme', await ev(() => getComputedStyle(document.body).getPropertyValue('--acc').trim().toLowerCase() === '#11aa55'));
    await ev(() => V152UI.A.tokReset());

    // ── 8. integrity + replay
    await ev(() => V152UI.open('verify')); await ev(() => V152UI.A.verify()); await page.waitForFunction(() => /File hashes/.test($('#v152VerOut').textContent), null, { timeout: 15000 });
    ok('Verify Build Integrity: CSP PASS, no inline handlers, exterm.html + serve.py match SHA256SUMS', await ev(() => { const t = $('#v152VerOut').textContent; return /CSP default-src nonePASS/.test(t) && /Inline handlersnone/.test(t) && /File hashesMATCH/.test(t); }), await ev(() => $('#v152VerOut').textContent));
    await ev(() => { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === '1h'); if (b) b.click(); }); await page.waitForFunction(() => chart.tfSec === 3600 && chart.data.length > 100, null, { timeout: 20000 });
    await ev(() => V152UI.A.blind()); await page.waitForFunction(() => Replay.on, null, { timeout: 15000 });
    ok('blind drill: replay on, prices rebased to 100, dates moved, ticker hidden', await ev(() => Replay.sym === 'BLIND' && Math.abs(Replay.data[0].c - 100) < 1e-6 && Replay.data[0].t === V152.BLIND_T0 && getComputedStyle($('#qSym')).visibility === 'hidden'));
    await ev(() => document.activeElement.blur()); await page.keyboard.press('5'); await sleep(100);
    ok('replay speed hotkey 5 → 5×', await ev(() => Replay.speed === 5));
    await page.keyboard.press('0'); await sleep(100);
    ok('replay speed hotkey 0 → 10×', await ev(() => Replay.speed === 10));
    await ev(() => V152UI.A.blindOff());

    // ── 9. security + layout
    ok('no inline event handlers anywhere in the DOM', await ev(() => ![...document.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)))));
    const csp = await ev(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
    ok('strict CSP: default-src none, SHA-256 script hash, no unsafe-inline script', /default-src 'none'/.test(csp) && /script-src[^;]*'sha256-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 200));
    await ev(() => V152UI.close());
    await page.setViewportSize({ width: 390, height: 844 }); await ev(() => I18N.gate(false)); await sleep(200);
    ok('phone width: language gate fits, no horizontal page scroll', await ev(() => $('#langGate .lg-card-wrap').getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1), await ev(() => document.documentElement.scrollWidth + ' > ' + innerWidth));
    await page.keyboard.press('Escape');
    ok('no page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 4).join(' || '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fails = res.filter((r) => r.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
