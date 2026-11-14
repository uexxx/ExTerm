// ExTerm v15.3 browser end-to-end: Quant Lab Pro in the Lab tab. Progressive disclosure (one pill, eight collapsed
// accordions rendered on open), baseline backtest + clickable equity curve → trade inspector (pins, MFE/MAE, jump to
// chart), Auto-Evolve in the Web Worker, Fragility Break-Point meter, Crisis Time Machine + regime attribution, Feature
// Kill-Switch, Dynamic Sizing / Prop-Firm odds, Synthetic Paths, Promote to Grok Shadow Bot (validation gate, sanitised
// package, live forward tick, balances untouched), hostile strategy names, i18n, strict CSP, no inline handlers, phone width.
// Third-party APIs are blocked: the app runs on simulated prices through the --offline launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8803, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntv153-'));
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
    const open = async (k) => { await page.click(`#q153Root details[data-sec="${k}"] > summary`); await sleep(200); };
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof V153UI !== 'undefined' && typeof V153 === 'object' && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    await ev(() => { showTab('markets'); selectSym('BTC-USD'); }); await sleep(300);
    const cash0 = await ev(() => JSON.stringify({ c: ACC.cash, p: Object.keys(ACC.pos || {}).length }));

    // ── progressive disclosure
    await page.click('#nav button[data-tab="lab"]'); await sleep(300);
    ok('Lab nav gains exactly one 🧬 Quant Lab Pro pill (translated label)', await ev(() => $$('#labNav button[data-v="q153"]').length === 1 && $('#labNav button[data-v="q153"] [data-i18n="lab.q153"]').textContent === I18N.t('lab.q153')));
    await page.click('#labNav button[data-v="q153"]'); await sleep(300);
    ok('panel: eight collapsed accordions, none rendered until opened', await ev(() => $$('#q153Root details.q153-sec').length === 8 && $$('#q153Root details[open]').length === 0 && $$('#q153Root [data-body]').every((x) => !x.innerHTML)));
    ok('panel: every built-in + No-Code strategy is selectable (100+)', await ev(() => $$('#q153Strat option').length >= 100 && $('#q153Strat').value === 'donchian'));

    // ── baseline + clickable equity curve → inspector (7)
    await page.click('#q153Root [data-q="base"]');
    ok('baseline backtest renders KPIs and an equity curve with dip / peak markers', await waitFor(() => !!$('#q153Curve') && $$('#q153Curve [data-pt]').length >= 2 && V153UI.base && V153UI.base.pairs.length > 3), await ev(() => $('#q153Base').textContent.slice(0, 200)));
    await page.click('#q153Curve', { position: { x: 700, y: 75 } });
    ok('inspector: clicking the curve opens that trade on its candles with entry / exit pins', await waitFor(() => !!$('#q153Insp .q153-cnd') && /entry/.test($('#q153Insp svg').textContent) && /exit/.test($('#q153Insp svg').textContent), null, 5000));
    ok('inspector: MFE / MAE + indicator snapshot', await ev(() => /MFE/.test($('#q153Insp').textContent) && /MAE/.test($('#q153Insp').textContent) && /RSI/.test($('#q153Insp').textContent) && /VWAP/.test($('#q153Insp').textContent)));
    const t1 = await ev(() => $('#q153Insp h3').textContent); await ev(() => $('#q153Insp [data-tr]:not([disabled])').click()); await sleep(150);
    ok('inspector: previous / next walks trade by trade', await ev((t) => !!$('#q153Insp') && $('#q153Insp h3').textContent !== t, t1));
    await ev(() => $('#q153Insp [data-close]').click());
    await page.focus('#q153Curve [data-pt]'); await page.keyboard.press('Enter'); await sleep(200);
    ok('inspector: the drawdown dip / peak markers are keyboard-reachable buttons', await ev(() => !!$('#q153Insp')));
    await ev(() => $('#q153Insp [data-jump]').click());
    ok('inspector: "jump to this candle" opens Markets on that market', await waitFor(() => curTab === 'markets' && ST.sel === V153UI.base.sym, null, 6000));
    await page.click('#nav button[data-tab="lab"]'); await sleep(300);
    ok('Lab remembers the Quant Lab Pro section and the last backtest', await ev(() => !!$('#q153Root') && !!$('#q153Curve') && $('#labNav button[data-v="q153"]').classList.contains('on')));

    // ── 1 Auto-Evolve
    await open('evolve'); await ev(() => { $('#q153Gen').value = '4'; $('#q153Pop').value = '10'; });
    await page.click('#q153Root [data-q="evolve"]');
    ok('Auto-Evolve: runs generations in the background Web Worker and ranks survivors', await waitFor(() => !!$('#q153EvOut table') && /Evaluated/.test($('#q153EvOut').textContent), null, 90000) && await ev(() => !!BTW.w && V153UI.ev.gens.length === 4 && /Baseline/.test($('#q153EvOut table').textContent)), await ev(() => $('#q153EvOut').textContent.slice(0, 200)));
    ok('Auto-Evolve: rejected mutations are reported (walk-forward + 17-test lab) and survivors are graded A–C', await ev(() => /Rejected · walk-forward/.test($('#q153EvOut').textContent) && V153UI.ev.survivors.every((s) => /^[ABC]$/.test(s.grade) && s.wfPass)));
    const nSurv = await ev(() => V153UI.ev.survivors.length);
    if (nSurv) { await ev(() => $('#q153EvOut [data-q="use"]').click()); ok('Auto-Evolve: "Use" applies the survivor across the lab', await waitFor(() => V153UI.base && V153UI.base.grade && /^[ABC]$/.test(V153UI.base.grade), null, 15000)); }
    else ok('Auto-Evolve: an honest "no robust edge" message when nothing survives', await ev(() => /no robust edge/.test($('#q153EvOut').textContent)));

    // ── 2 fragility
    await open('frag'); await page.click('#q153Root [data-q="frag"]'); await sleep(300);
    ok('Fragility Break-Point: meter + break-point multiplier + friction curve', await ev(() => !!$('#q153FrOut .q153-meter[role="meter"]') && isFinite(+$('#q153FrOut .q153-meter').getAttribute('aria-valuenow')) && /Fragility Break-Point/.test($('#q153FrOut').textContent) && $$('#q153FrOut table td').length >= 10));
    await ev(() => { $('#q153Usd').value = '1e12'; $('#q153Cap').value = '-5'; $('#q153Bps').value = '<b>x'; }); await page.click('#q153Root [data-q="frag"]'); await sleep(300);
    ok('Fragility: hostile / extreme inputs are clamped (huge order → partial fills), never break the panel', await ev(() => !!$('#q153FrOut .q153-meter') && !$('#q153FrOut b b') && /Partial fills/.test($('#q153FrOut').textContent) && !/Partial fills0 \//.test($('#q153FrOut').textContent.replace(/\s/g, ''))));

    // ── 3 crisis time machine
    await open('crisis');
    ok('Crisis Time Machine: regime attribution on real history (Bull / Bear / Chop / Panic) before any replay', await ev(() => ['Bull Trend', 'Bear Trend', 'Low-Vol Chop', 'High-Vol Panic'].every((x) => $('#q153CrOut').textContent.includes(x))));
    await page.click('#q153Root [data-q="crisis"]');
    ok('Crisis Time Machine: 2020 Liquidity Flush, 2022 Deleveraging and FOMC shocks replayed vs buy & hold', await waitFor(() => /2020 Liquidity Flush/.test(($('#q153CrOut table') || {}).textContent || '') && /2022 Crypto Deleveraging/.test($('#q153CrOut').textContent) && /FOMC Rate-Shock/.test($('#q153CrOut').textContent), null, 60000));

    // ── 4 kill-switch
    await open('kill'); await page.click('#q153Root [data-q="kill"]'); await sleep(300);
    const hasDrv = await ev(() => $$('#q153KillOut [data-rule]').length);
    if (hasDrv) {
      const before = await ev(() => $('#q153KillOut .v151-kpis').textContent);
      await page.click('#q153KillOut [data-rule="0"]'); await sleep(200);
      ok('Feature Kill-Switch: top drivers listed; toggling a filter recalculates the equity curve instantly', await ev((b0) => $$('#q153KillOut [data-rule]').length <= 3 && $('#q153KillOut .v151-kpis').textContent !== b0 && V153UI.rules.length === 1 && !!$('#q153KillOut svg'), before));
    } else ok('Feature Kill-Switch: explains when there are too few trades', await ev(() => /Need 8\+ trades/.test($('#q153KillOut').textContent)));

    // ── 5 sizing + prop odds
    await open('sizing'); await page.click('#q153Root [data-q="sizing"]'); await sleep(400);
    ok('Dynamic Sizing: Fixed Fractional, Half-Kelly, ATR vol-target and Equity-Curve on one trade list with $50k pass odds', await ev(() => ['Fixed Fractional', 'Half-Kelly', 'Volatility-Targeted', 'Equity-Curve Trading'].every((x) => $('#q153SzOut').textContent.includes(x)) && /Pass \$50k/.test($('#q153SzOut').textContent)));
    await page.click('#q153Root [data-acct="100k"]'); await sleep(400);
    ok('Prop-Firm odds: switching to the $100k rulebook recomputes', await ev(() => /Pass \$100k/.test($('#q153SzOut').textContent) && /6,000|6000/.test($('#q153SzOut').textContent)));

    // ── 6 synthetic paths
    await open('synth'); await ev(() => { $('#q153Paths').value = '200'; $('#q153Noise').value = '0.25'; }); await page.click('#q153Root [data-q="synth"]');
    ok('Synthetic Paths: 200 block-bootstrap paths with noise → histogram, physics check, verdict', await waitFor(() => /Verdict/.test(($('#q153SyOut') || {}).textContent || '') && /200 paths/.test($('#q153SyOut').textContent) && !!$('#q153SyOut svg rect') && /Excess kurtosis/.test($('#q153SyOut').textContent), null, 90000), await ev(() => $('#q153SyOut').textContent.slice(0, 200)));

    // ── 8 promote to Grok shadow bot
    await ev(() => { V153UI.base.grade = null; }); await open('promote');
    ok('Promote: blocked until the strategy is validated (grade A–C)', await ev(() => $('#q153Root [data-q="promote"]').disabled));
    await page.click('#q153Root [data-q="validate"]');
    ok('Promote: the 17-test validation runs from the panel and grades the strategy', await waitFor(() => !!V153UI.base.grade, null, 90000));
    await ev(() => { V153UI.base.grade = 'B'; const d = $('#q153Root details[data-sec="promote"]'); d.open = false; d.open = true; }); await sleep(300);
    await ev(() => { $('#q153SUsd').value = '99999999'; }); await page.click('#q153Root [data-q="promote"]'); await sleep(400);
    ok('Promote: packages strategy ID, evolved params, filters and capped risk limits', await ev(() => { const k = ST.v153.shadow[0]; return ST.v153.shadow.length === 1 && k.kind === 'v153-shadow' && k.id === V153UI.base.id && k.grade === 'B' && k.risk.usd === 1e6 && k.risk.maxOpen === 1 && JSON.stringify(k.params) === JSON.stringify(V153UI.base.p); }), await ev(() => JSON.stringify(ST.v153.shadow)));
    await ev(() => showTab('grok')); await sleep(300); await ev(() => V153UI.mountGrok());
    ok('Grok tab lists the promoted shadow bot', await waitFor(() => !!$('#q153Grok') && !$('#q153Grok').hidden && /long \(shadow\)|flat/.test($('#q153Grok').textContent), null, 8000));
    await ev(() => V153UI.shadowTick()); await sleep(800);
    ok('shadow bot processes the live forward tick (dry-run) and never touches balances', await ev((c0) => ST.v153.shadow[0].lastT > 0 && JSON.stringify({ c: ACC.cash, p: Object.keys(ACC.pos || {}).length }) === c0 && (!ST.v153.shadow[0].fills || V152UI.shadow.some((f) => /🧬/.test(f.bot))), cash0), await ev(() => JSON.stringify(ST.v153.shadow[0])));
    await ev(() => $('#q153Grok [data-q="unshadow"]').click()); await sleep(200);
    ok('shadow bot can be removed', await ev(() => ST.v153.shadow.length === 0));

    // ── hostile strategy name (e.g. an imported No-Code spec) stays inert
    await ev(() => { NT.strategies.zz_hostile = Object.assign({}, NT.strategies.smacross, { name: '<img src=x onerror="window.__pwn=1">' }); showTab('lab'); }); await sleep(300);
    await ev(() => { $('#labNav button[data-v="q153"]').click(); }); await sleep(300);
    ok('XSS: a hostile strategy name renders as text, never markup', await ev(() => [...$$('#q153Strat option')].some((o) => o.textContent.includes('<img')) && !$('#q153Root img') && !window.__pwn));
    await ev(() => { delete NT.strategies.zz_hostile; });

    // ── i18n
    await ev(() => { ST.settings.lang = 'es'; I18N.apply(); }); await sleep(200);
    ok('i18n: Quant Lab Pro strings translate live (es)', await ev(() => $('#labNav button[data-v="q153"] [data-i18n]').textContent === 'Laboratorio Quant Pro' && $('#q153Root details[data-sec="evolve"] [data-i18n]').textContent === 'Auto-Evolución'));
    await ev(() => { ST.settings.lang = 'en'; I18N.apply(); });

    // ── security + layout
    ok('strict CSP: default-src none + script hash, no unsafe-inline scripts', await ev(() => { const c = $('meta[http-equiv="Content-Security-Policy"]').content; return /default-src 'none'/.test(c) && /script-src 'sha256-/.test(c) && !/script-src[^;]*unsafe-inline/.test(c); }));
    ok('no inline event handlers anywhere in the live DOM', await ev(() => ![...document.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)))));
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    ok('phone width: Quant Lab Pro fits without horizontal page scroll', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('no page errors, dialogs or CSP violations', errs.length === 0, errs.join(' | '));
  } finally { await b.close(); }
  console.log(res.join('\n')); const f = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`${res.length - f}/${res.length} v15.3 e2e checks passed`); process.exit(f ? 1 : 0);
})();
