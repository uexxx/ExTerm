// ExTerm v15.5 browser end-to-end: zero-clutter header (no page scroll, no overlapping header controls), grouped nav,
// Ctrl+K command palette across features / indicators / lessons, Simple | Pro, Reset Clean View, Zen Chart Focus (F + « »),
// Overlays ▾ + smart context + Favorite-4, Smart Order Rules + risk slider, Bot Net Profit hero ($ and %, live capital and
// size what-ifs, "What Changed?"), Quant Lab 4-step wizard, How It Works, English LTR + Arabic RTL at 1440×900 and 1280×720,
// strict CSP and zero page errors. Third-party APIs are blocked: the launcher runs --offline.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8805, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv155-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
    const waitFor = (f, a, t = 30000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V155UI !== 'undefined' && !!document.getElementById('v155Ws') && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    await ev(() => { for (const x of document.querySelectorAll('#langGate')) x.remove(); showTab('markets'); selectSym('BTC-USD'); }); await sleep(400);

    // ── layout: no page scroll, header controls never overlap, at both laptop sizes, LTR and RTL
    const layout = () => ev(() => { const r = [...document.querySelectorAll('#top > *')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0).map((e) => [e.id || e.className, e.getBoundingClientRect()]); const hits = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], c = r[j][1]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) hits.push(r[i][0] + '×' + r[j][0]); }
      const tb = new Set([...document.querySelectorAll('#tab-markets .toolbar > *')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().top / 12))).size;
      return { sw: document.documentElement.scrollWidth, w: innerWidth, hits, tb }; });
    for (const [w, h] of [[1440, 900], [1280, 720]]) for (const lang of ['en', 'ar']) {
      await page.setViewportSize({ width: w, height: h }); await ev((l) => I18N.set(l), lang); await sleep(350); const L = await layout();
      ok(`layout ${w}×${h} ${lang.toUpperCase()}${lang === 'ar' ? ' (RTL)' : ''}: no horizontal page scroll, no overlapping header controls`, L.sw <= L.w && !L.hits.length, JSON.stringify(L));
      if (w === 1440 && lang === 'en') ok('layout 1440: chart toolbar is a single row of controls', L.tb === 1, JSON.stringify(L));
    }
    ok('RTL: Arabic mirrors the page and translates the workspace toggle and nav groups', await ev(() => document.documentElement.dir === 'rtl' && $('#v155Ws [data-ws="simple"]').textContent === I18N.tr('ar', 'v155.simple') && $('#nav button[data-gkey="v155.g.trade"]').dataset.glabel === I18N.tr('ar', 'v155.g.trade')));
    await ev(() => I18N.set('en')); await page.setViewportSize({ width: 1440, height: 900 }); await sleep(300);

    // ── header & nav
    ok('header: Ctrl+K search pill, quiet status dots, Simple | Pro, Reset Clean View, ⋯ More', await ev(() => !!$('#btnPalette.v155-pal') && $('#v155Status #srcPill') && $('#v155Ws [data-ws="pro"]').classList.contains('on') && !!$('#v155Reset') && !!$('#btnMore')));
    await page.click('#btnMore'); await sleep(150);
    ok('⋯ More menu holds Pro Tools, theme, workstation, side panel, demo, brief and trader tools as labelled items', await ev(() => !$('#v155More').hidden && ['btnPro', 'btnTheme', 'btnWs', 'btnTools'].every((id) => $('#v155More #' + id) && $('#v155More #' + id + ' .v155-ml').textContent.length > 2)));
    await page.keyboard.press('Escape'); await page.mouse.click(700, 500); await sleep(100);
    ok('nav: four group captions (Trade · Intelligence · Quant & Bots · Academy & Settings), Learn stays right after Settings in the DOM', await ev(() => ['v155.g.trade', 'v155.g.intel', 'v155.g.quant', 'v155.g.acad'].every((k) => $(`#nav button[data-gkey="${k}"]`)) && $('#nav button[data-tab="set"]').nextElementSibling.id === 'btnLearn' && !!$('#v155How')));

    // ── Ctrl+K
    await page.keyboard.press('Control+k'); await sleep(150); await page.keyboard.type('fragilty', { delay: 10 }); await sleep(200);
    ok('Ctrl+K: typo "fragilty" finds the Quant Lab Fragility tool', await ev(() => $('#palette').classList.contains('on') && palItems.some((x) => /Fragility/.test(x.l))));
    await page.fill('#palIn', 'ichimoku'); await sleep(200);
    ok('Ctrl+K: indicators are indexed (Ichimoku)', await ev(() => palItems.some((x) => /Ichimoku/i.test(x.l) && x.r === 'indicator')));
    await page.fill('#palIn', 'drag a stop loss ladder'); await sleep(200);
    ok('Ctrl+K: Learn ExTerm lessons are indexed', await ev(() => palItems.some((x) => x.r === 'Learn ExTerm')));
    await page.fill('#palIn', 'fragilty'); await sleep(150);
    await page.click('#palList .it:has-text("Fragility")');
    ok('Ctrl+K → pick jumps to Lab → Quant Lab and opens the Fragility section', await waitFor(() => $('#tab-lab').classList.contains('on') && $('#q153Root details[data-sec="frag"]') && $('#q153Root details[data-sec="frag"]').open, null, 8000));

    // ── Quant Lab wizard + hero
    ok('Quant Lab: 4-step wizard (Pick → Stress → Capital & Risk → Review & Deploy) with every section inside its step', await ev(() => $$('.v155-steps [data-step]').length === 4 && $('.v155-step[data-step="2"] details[data-sec="frag"]') && $('.v155-step[data-step="3"] details[data-sec="sizing"]') && $('.v155-step[data-step="4"] details[data-sec="promote"]') && $('.v155-step[data-step="1"] #q153Strat')));
    const hadStarter = await ev(() => !!$('#q153Base .v155-starter'));
    if (hadStarter) await page.click('#q153Base .v155-starter'); else await ev(() => V153UI.A.base());
    ok('Quant Lab: 1-click starter backtest on the empty state renders the Bot Net Profit hero above the curve', hadStarter && await waitFor(() => !!$('#v155HeroQ') && /\$/.test($('#v155HeroQNet').textContent) && /%/.test($('#v155HeroQNet').textContent) && $('#v155HeroQ').nextElementSibling !== null, null, 30000));

    // ── Backtester hero: $ & %, capital / size what-ifs, What Changed?
    await ev(() => { showTab('bots'); }); await sleep(500);
    await ev(() => { const r = $('#btRun'); r.click(); });
    ok('Backtester: Bot Net Profit hero card with $ and % net, start → end, 8 dollar stats', await waitFor(() => { const h = $('#v155HeroBt'); return h && /^[+−]?\$[\d,]+\.\d\d/.test($('#v155HeroBtNet').textContent.trim()) && /%/.test($('#v155HeroBtNet').textContent) && $$('#v155HeroBt .v155-hs').length === 8; }, null, 60000));
    const h1 = await ev(() => { const H = V155UI && V155.hero; const n = $('#v155HeroBtNet').textContent; return n; });
    const consistent = await ev(() => { const r = lastBt.res, H = V155.hero(r, lastBt.S.capital, ST.settings.slip / 100); return Math.abs(H.net - (r.eq[r.eq.length - 1] - lastBt.S.capital)) < 1e-6 && $('#v155HeroBtNet').textContent.startsWith(V155.usd(H.net, true)); });
    ok('Backtester: hero net equals final equity − capital, exactly as displayed', consistent, h1);
    await ev(() => { const i = $('#v155HeroBt [data-h="cap"]'); i.value = '20000'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
    ok('Backtester: changing Starting Capital updates every $ figure live (×2 capital → ×2 net)', await ev((t) => { const v = (s) => +s.replace(/[^\d.]/g, '') * (/^−/.test(s.trim()) ? -1 : 1); const a = v(t.split('/')[0]), b2 = v($('#v155HeroBtNet').textContent.split('/')[0]); return Math.abs(b2 - 2 * a) <= Math.max(0.05, Math.abs(a) * 0.002) && /\$20,000\.00/.test($('#v155HeroBt .v155-flow').textContent); }, h1));
    await ev(() => { const i = $('#v155HeroBt [data-h="size"]'); i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(250);
    ok('Backtester: Position Size slider re-simulates live and shows its value', await ev(() => /50%/.test($('#v155HeroBt [data-h="sizev"]').textContent) && !!$('#v155HeroBtNet')));
    await ev(() => { const c = $('#suCap'); if (c) c.value = '10000'; const p = $('#botForm [data-p]'); if (p) { p.value = String((parseFloat(p.value) || 10) + 3); p.dispatchEvent(new Event('input', { bubbles: true })); p.dispatchEvent(new Event('change', { bubbles: true })); } $('#btRun').click(); });
    ok('What Changed?: re-running after a parameter change shows the ghost curve and an exact $ delta vs the previous run', await waitFor(() => { const d = $('#v155HeroBt .v155-delta'); return d && /\$[\d,]+\.\d\d/.test(d.textContent) && /previous run/.test(d.textContent) && $('#v155HeroBt .v155-mini .g'); }, null, 60000));
    ok('Backtester: one gold primary action on the screen (Run backtest)', await ev(() => [...document.querySelectorAll('#tab-bots .btn.pri')].filter((x) => x.offsetParent && getComputedStyle(x).backgroundColor === 'rgb(245, 184, 65)').length === 1));
    ok('trade log: every closing row carries its dollar P&L', await ev(() => { const rows = $$('#btResult table tbody tr').filter((r) => r.children.length >= 5 && r.children[1].textContent === 'sell'); return rows.length > 0 && rows.every((r) => /\$/.test(r.children[4].textContent)); }));

    // ── Markets: Simple | Pro, Zen, Overlays, favorites, smart context, Smart Order Rules, Reset
    await ev(() => showTab('markets')); await sleep(200);
    await page.click('#v155Ws [data-ws="simple"]'); await sleep(250);
    ok('Simple: only Markets + Settings (+ Learn) in the nav; book, tape, overlays and drawing rail hidden; persisted', await ev(() => [...document.querySelectorAll('#nav button[data-tab]')].filter((x) => x.offsetParent).map((x) => x.dataset.tab).join() === 'markets,set' && !!$('#btnLearn').offsetParent && !$('#tab-markets .book').offsetParent && !$('#v155Ov').offsetParent && !$('.v155-rail').offsetParent && ST.v155.ws === 'simple'));
    await page.click('#v155Ws [data-ws="pro"]'); await sleep(250);
    ok('Pro: all 15 tabs back', await ev(() => [...document.querySelectorAll('#nav button[data-tab]')].filter((x) => x.offsetParent).length === 15));
    const w0 = await ev(() => $('#chartHost').getBoundingClientRect().width);
    await page.mouse.click(700, 500); await page.keyboard.press('f'); await sleep(250);
    const w1 = await ev(() => $('#chartHost').getBoundingClientRect().width);
    ok('Zen Chart Focus: F collapses watchlist and ticket, the chart grows edge to edge (and still fits the zoom)', w1 > w0 + 400 && await ev(() => document.body.classList.contains('v155-hideL') && document.body.classList.contains('v155-hideR') && chart.view.off === 0), w0 + ' → ' + w1);
    await page.keyboard.press('f'); await sleep(200); await page.click('#v155ChevR'); await sleep(200);
    ok('Zen chevrons: » collapses just the ticket side, « » glyphs and aria-pressed follow', await ev(() => !document.body.classList.contains('v155-hideL') && document.body.classList.contains('v155-hideR') && $('#v155ChevR').getAttribute('aria-pressed') === 'true'));
    await page.click('#v155ChevR'); await sleep(150);
    await ev(() => setMode('stocks')); await sleep(800); await page.click('#v155Ov'); await sleep(200);
    ok('Overlays ▾: toggle rows with 1-line descriptions; US stocks highlights 0DTE Gamma and Gap-Fill as Suggested', await ev(() => $$('#v155OvPop .v155-row').length === 9 && $$('#v155OvPop .v155-tx small').every((s) => s.textContent.length > 15) && $('#v155OvPop [data-row="gamma"]').classList.contains('hot') && $('#v155OvPop [data-row="gap"] .v155-sug')));
    await page.click('#v155OvPop [data-row="ghost"] .v155-sw'); await sleep(150);
    ok('Overlays ▾: switching MTF Ghost Candles on drives the Pro Tools overlay and the count badge', await ev(() => V154UpUI.cfg().ghost === true && $('#v155Ov .v155-n').textContent === '1'));
    for (const id of ['ghost', 'gamma', 'sess', 'react', 'absorb']) await page.click(`#v155OvPop [data-star="${id}"]`);
    ok('Favorite 4: starring five tools keeps the latest four in the quick bar beside the ticket', await ev(() => ST.v155.favs.join() === 'gamma,sess,react,absorb' && $$('#v155Favs [data-fav]').length === 4 && !$('#v155Favs').hidden));
    await page.keyboard.press('Escape'); await sleep(100);
    await page.click('#v155Favs [data-fav="sess"]'); await sleep(100);
    ok('Favorite 4: one click toggles the tool', await ev(() => V154UpUI.cfg().sess === true && $('#v155Favs [data-fav="sess"]').classList.contains('on')));
    await ev(() => setMode('crypto')); await sleep(600);
    ok('ticket: Smart Order Rules ▸ collapsed by default with TP1–TP3 step rules and the webhook bridge inside', await ev(() => !$('#v155Rules').open && $$('#v155Rules [data-v155rule]').length === 3 && !!$('#v155Rules #v155Hook')));
    await page.click('#v155Rules > summary'); await page.selectOption('#v155Rules [data-v155rule="TP2"]', 'tp1'); await page.fill('#v155Hook', 'javascript:alert(1)'); await page.keyboard.press('Tab'); await sleep(150);
    ok('Smart Order Rules: rule saved to the step-ladder config; a non-https webhook is rejected', await ev(() => V154UpUI.cfg().rules.TP2 === 'tp1' && V154UpUI.cfg().hookUrl === '' && $('#v155Hook').value === ''));
    await page.click('#tkSize [data-z="risk"]'); await sleep(100);
    await ev(() => { const r = $('#v155RiskR'); r.value = '2.5'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(120);
    ok('inline slider "Risk: 2.5%" drives the risk-size field', await ev(() => $('#v155RiskV').textContent === '2.5%' && $('#tkRisk').value === '2.5' && !$('.v155-slider').hidden));
    await ev(() => { V154UpUI.open('chart'); }); await sleep(150); await page.click('#v155Reset'); await sleep(300);
    ok('Reset Clean View: drawers closed, overlays off, Zen off, back on Markets', await ev(() => !$('#v154Up.on') && !V154UpUI.cfg().ghost && !V154UpUI.cfg().sess && !LeaderUI.cfg().heat && !document.body.classList.contains('v155-hideL') && $('#tab-markets').classList.contains('on') && $('#v155Ov .v155-n').textContent === ''));

    // ── status dots, How It Works, journal
    ok('status: 6px dots (Live Feed · Auto-BE Armed · Shadow Bot Ready) that expand on click', await ev(() => $$('#v155Dots .v155-dot').length === 3 && Math.round($('#v155Dots .v155-dot i').getBoundingClientRect().width) === 6));
    await page.click('#v155Dots [data-dot="live"]'); ok('status: click expands labels', await ev(() => $('#v155Dots').classList.contains('open') && $('#v155Dots [data-dot="live"] span').offsetParent !== null));
    await page.click('#v155How'); await sleep(200);
    ok('? How It Works opens Learn ExTerm on a lesson for the current screen', await ev(() => !$('#learnOv').hidden && $('#lxQ').value.length > 0)); await ev(() => LearnUI.close());
    await ev(() => showTab('journal')); await sleep(400);
    ok('Journal: 4-metric summary strip + Replay My Worst Loss', await ev(() => $$('#v155Jn > div').length === 4 && !!$('#v155Jn [data-v155="worst"]')));
    ok('numbers: tabular figures on prices and P&L', await ev(() => getComputedStyle(document.body).fontVariantNumeric.includes('tabular-nums')));

    // ── security
    const csp = await ev(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
    ok('strict CSP: default-src none, script pinned by SHA-256, no inline handlers anywhere in the DOM', /default-src 'none'/.test(csp) && /script-src 'sha256-/.test(csp) && await ev(() => ![...document.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^on/i.test(a.name)))));
    ok('zero page errors, dialogs or CSP violations', !errs.length, errs.slice(0, 4).join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${res.length - f}/${res.length} passed`);
  process.exit(f ? 1 : 0);
})();
