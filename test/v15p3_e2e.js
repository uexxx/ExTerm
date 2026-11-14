// ExTerm v15 phase 3 browser end-to-end: 1s / 5s timeframes on crypto and stocks, the Grok tab (local quant engine,
// tool calls with confirmation, auto-workflow, strategy library + Pine export, Macro Shield rendering of hostile
// headlines, Copilot Bridge), the 3-agent Copilot desk with its action cards, the leak detector, the compact intel strip
// in Lab → News, vault handling of the new secrets, and strict CSP / no inline handlers / phone width.
// Third-party APIs are blocked: the app runs on simulated prices through the launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | '), 'ERRS', errs.slice(0, 5).join(' || ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8783, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt15p3-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
  await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__exterm_p2 === true && typeof Grok !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && px(ST.sel) > 0, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
  const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);

  ok('phase 3 boots: Grok, P3 core and pack 4 are loaded', await ev(() => typeof Grok === 'object' && typeof Desk === 'object' && typeof P3 === 'object' && NT.PACK4.length === 40));

  /* ── 1s / 5s timeframes ── */
  await ev(() => { showTab('markets'); selectSym('BTC-USD'); }); await sleep(400);
  ok('crypto: 1s and 5s buttons sit before 15s', await ev(() => { const t = $$('#tfBtns button').map((x) => x.textContent.trim()); return t[0] === '1s' && t[1] === '5s' && t[2] === '15s'; }));
  await page.click('#tfBtns button:text-is("1s")');
  ok('crypto: the 1s chart renders immediately with 1-second spacing', await waitFor(() => chart.data.length > 30 && chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t === 1, null, 15000), await ev(() => [chart.data.length, chart.err || '']));
  await page.click('#tfBtns button:text-is("5s")');
  ok('crypto: 5s chart with 5-second spacing', await waitFor(() => chart.data.length > 30 && chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t === 5, null, 15000));
  const v0 = await ev(() => getStore(ST.sel, ST.tf).version); await sleep(2500);
  ok('crypto: live ticks keep moving the 5s store', await ev((v) => getStore(ST.sel, ST.tf).version > v, v0));
  await ev(() => setMode('stocks')); await sleep(800);
  ok('stocks: 1s / 5s / 15s are offered too (no 1m floor)', await ev(() => ['1s', '5s', '15s'].every((t) => $$('#tfBtns button').some((x) => x.textContent.trim() === t))));
  await page.click('#tfBtns button:text-is("1s")');
  // offline there is no stock tick history: the chart seeds from the last quote and grows a bar per second
  ok('stocks: the 1s chart renders', await waitFor(() => chart.data.length >= 2 && chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t === 1, null, 15000), await ev(() => [ST.sel, chart.data.length, chart.err || '']));
  ok('strategies backtest on 1s bars', await ev(async () => { const c = await History.get('BTC-USD', 1, 600); const r = NT.backtest(c, NT.strategies.q4_qs_rsi2, {}, { cash: 10000, fee: 0.001, slip: 0, tfSec: 1 }); return c.length > 100 && Array.isArray(r.trades); }));
  await ev(() => { setMode('crypto'); ST.tf = '15m'; selectSym('BTC-USD'); chartRefresh(true); }); await sleep(600);

  /* ── Grok tab ── */
  await page.click('nav button[data-tab="grok"]');
  ok('Grok is its own top-level tab with every panel', await ev(() => curTab === 'grok' && ['gkConsole', 'gkWf', 'gkShield', 'gkBots', 'gkBridge', 'gkAuto', 'gkAlerts', 'gkLib'].every((id) => !!document.getElementById(id)) && getComputedStyle($('#tab-ai')).display === 'none'));
  ok('engine defaults to the zero-key local quant engine', await ev(() => /Local quant engine/.test($('.gk-head').textContent) && $('#gkKey').hidden));
  await page.fill('#gkIn', 'what regime is BTC in 1h?'); await page.press('#gkIn', 'Enter');
  ok('local engine runs a tool call and shows the result', await waitFor(() => /Regime · BTC 1h/.test($('#gkLog').textContent) && !Grok.busy, null, 30000), await ev(() => $('#gkLog').textContent.slice(-300)));
  await page.fill('#gkIn', 'what regime is ETH in 1h?'); await page.press('#gkIn', 'Enter');
  ok('local engine uses the market named in the request, not the selected chart', await waitFor(() => /Regime · ETH 1h/.test($('#gkLog').textContent) && !Grok.busy, null, 30000) && await ev(() => ST.sel === 'BTC-USD'));
  await page.fill('#gkIn', 'validate q4_qs_dualma on BTC 1h'); await page.press('#gkIn', 'Enter');
  ok('17-test Validation Lab runs from Grok', await waitFor(() => /17-test Validation Lab/.test($('#gkLog').textContent) && !Grok.busy, null, 60000), await ev(() => $('#gkLog').textContent.slice(-300)));
  await page.fill('#gkIn', 'pause all bots'); await page.press('#gkIn', 'Enter');
  ok('bot-changing tools wait for an OK (no silent actions)', await waitFor(() => $$('.gk-pend').length === 1 && /pause bots/.test($('.gk-pend').textContent), null, 10000));
  await page.click('.gk-pend [data-gkno]');
  ok('Skip drops the queued action', await ev(() => !$('.gk-pend') && Grok.pending.length === 0));

  // workflow → deploy (confirmed) → in-tab bot (the launcher runs with --no-bots here)
  await page.click('[data-gk="wfgen"]');
  ok('Generate Auto-Workflow draws the 8-stage pipeline', await waitFor(() => $$('#gkWfOut .wf-node').length === 8, null, 20000));
  const nb = await ev(() => ST.bots.length);
  await page.click('[data-gk="wfdeploy"]'); await page.click('.gk-pend [data-gkok]');
  ok('Deploy asks, then starts the bot', await waitFor((n) => ST.bots.length === n + 1, nb, 15000));

  // library + Pine
  ok('strategy library: 4 categories × 10', await ev(() => $$('#gkLib [data-gkcat]').length === 4 && $$('#gkLib .gk-strat').length === 10));
  await page.click('#gkLib [data-gkcat="On-Chain Solana/DEX"]');
  ok('category switch shows the on-chain pack', await ev(() => $$('#gkLib .gk-strat').length === 10 && /DEX/.test($('#gkLib .gk-strat').textContent)));
  await page.click('#gkLib .gk-strat [data-gks="pine"]');
  ok('Pine Script v5 export renders as text', await ev(() => /^\/\/@version=5/.test($('#gkPine').textContent) && /strategy\("/.test($('#gkPine').textContent)));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-gk="pinedl"]')]);
  ok('…and downloads as .pine', /\.pine$/.test(dl.suggestedFilename()));

  // Macro Shield with hostile headlines (launcher is --offline, so inject a feed the way /api/intel would)
  ok('offline launcher: the shield explains why there is no feed', await ev(() => /no World Monitor feed|--offline|launcher/.test($('#gkShield').textContent)));
  await ev(() => {
    const now = Date.now() / 1000;
    Grok.intel = { items: P3.cleanIntel({ items: [{ id: 'x1', title: '<img src=x onerror="window.__x=1">Strait closed', source: '<b>wire</b>', sev: 'CRITICAL', link: 'javascript:window.__x=2', ts: now - 60 }, { id: 'x2', title: 'Fed hints at a cut', source: 'Wire', sev: 'MACRO', link: 'https://example.com/a', ts: now - 30 }] }), cfg: { notify: true, autoPause: false, tighten: false } };
    Grok.warn(); Grok.render();
  });
  ok('headlines render as text with severity badges; javascript: links never become links', await ev(() => !$('#gkShield img') && window.__x === undefined && $$('#gkShield .gk-badge.critical').length >= 1 && $$('#gkShield .gk-badge.macro').length === 1 && !$$('#gkShield a').some((a) => /^javascript:/i.test(a.getAttribute('href') || '')) && $$('#gkShield a').some((a) => a.getAttribute('href') === 'https://example.com/a' && a.rel.includes('noopener'))));
  ok('a fresh CRITICAL warns the Copilot once', await ev(() => ST.chat.filter((m) => /Macro Shield: CRITICAL/.test(m.text)).length === 1 && (Grok.warn(), ST.chat.filter((m) => /Macro Shield: CRITICAL/.test(m.text)).length === 1)));
  ok('mobile alerts: controls are disabled without launcher alerts', await ev(() => $('[data-gk="savehooks"]').disabled && $('[data-gk="testhooks"]').disabled));

  /* ── 3-agent Copilot desk ── */
  await page.click('nav button[data-tab="ai"]');
  const ask = async (q) => { if (await ev(() => curTab !== 'ai')) await page.click('nav button[data-tab="ai"]'); const n = await ev(() => ST.chat.length); await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await waitFor((k) => ST.chat.length >= k + 2 && !aiBusy, n, 60000); return ev(() => ST.chat[ST.chat.length - 1]); };
  let m = await ask('desk BTC 1h');
  ok('desk: three agents report, CRITICAL headline vetoes the trade', /3-Agent Quant Desk · BTC 1h/.test(m.text) && /Technical \/ Order-Flow Analyst/.test(m.text) && /Intelligence/.test(m.text) && /Chief Risk Officer: NO-TRADE/.test(m.text), m.text.slice(0, 400));
  ok('desk: action cards without an order card while vetoed', m.acts && m.acts.map((a) => a.l).join('|') === '📍 Plot Levels on Chart|🧪 Run 17-Test Backtest|⚡ Send Setup to Grok Tab', JSON.stringify(m.acts));
  await ev(() => { Grok.intel.items = []; });
  m = await ask('3-agent desk on ETH 1h');
  ok('desk: without the shock the CRO gives a verdict and a plan', /Plan \((GO|REDUCE|NO-TRADE)\)/.test(m.text) && m.acts.length >= 3);
  const card = (l) => page.locator('#chatLog .msg', { hasText: '3-Agent Quant Desk' }).last().locator('.acts button', { hasText: l }).click();
  await card('Send Setup to Grok Tab');
  ok('Send Setup to Grok Tab lands in the Copilot Bridge', await waitFor(() => (ST.grok.inbox || []).length === 1 && ST.grok.inbox[0].sym === 'ETH-USD', null, 10000));
  await page.click('nav button[data-tab="ai"]'); await sleep(200);
  const draws = await ev(() => (ST.draw['ETH-USD'] || []).length);
  await card('Plot Levels on Chart');
  ok('Plot Levels on Chart opens the chart and draws the levels', await waitFor((d) => curTab === 'markets' && ST.sel === 'ETH-USD' && (ST.draw['ETH-USD'] || []).length > d, draws, 10000));
  m = await ask('__p3 order|ETH-USD|500|999999999|1999999999');
  ok('a forged order card with a stop above price is refused', /moved through|no longer valid/.test(m.text));
  const p0 = await ev(() => px('ETH-USD'));
  m = await ask(`__p3 order|ETH-USD|500|${(p0 * 0.97).toFixed(2)}|${(p0 * 1.06).toFixed(2)}`);
  ok('Place Paper Order with SL/TP fills with the bracket attached', /Paper buy filled/.test(m.text) && await ev((p) => { const q = ACC.pos['ETH-USD']; return !!q && Math.abs(q.sl / (p * 0.97) - 1) < 0.01 && Math.abs(q.tp / (p * 1.06) - 1) < 0.01; }, p0), m.text);
  m = await ask('show my behavioral leaks');
  ok('Behavioral Leak & Mistake Detector answers', /Behavioral Leak|at least 3 closed/.test(m.text), m.text.slice(0, 200));
  m = await ask('news on the exchange leak');
  ok('desk triggers are anchored: "leak" in a news question is not the leak detector', !/Behavioral Leak/.test(m.text));
  m = await ask('analyze BTC');
  ok('classic analysis offers the 3-agent desk', m.acts && m.acts.some((a) => /3-agent desk/.test(a.l)));

  /* ── Grok bridge panel + compact news strip ── */
  await page.click('nav button[data-tab="grok"]');
  ok('bridge inbox shows the Copilot setup', await ev(() => /ETH/.test($('#gkBridge').textContent) && $$('#gkBridge [data-gkb]').length === 3));
  await ev(() => { showTab('lab'); }); await sleep(300);
  await page.click('#labNav button:has-text("News sentiment")');
  ok('Lab → News carries the compact Global Intel strip', await waitFor(() => !!$('.gk-strip') && /Global Intel/.test($('.gk-strip').textContent), null, 15000));

  /* ── vault: the new secrets never reach localStorage in plain text ── */
  ok('Grok key and webhooks are vault secrets', await ev(() => { ST.grok.key = 'xai-SECRET-123'; ST.hooks.discord = 'https://discord.com/api/webhooks/123456/abcdefghijklmnopqrstuvwx'; saveState(); const raw = localStorage.getItem('novaterm.v1'); return SECRET_PATHS.some(([a, k]) => a === 'grok' && k === 'key') && !raw.includes('xai-SECRET-123') && !raw.includes('abcdefghijklmnopqrstuvwx'); }));
  await ev(() => { ST.grok.key = ''; ST.hooks.discord = ''; saveState(); });

  /* ── strict CSP hygiene ── */
  await ev(() => showTab('grok')); await sleep(300);
  r = await ev(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).map((e) => e.tagName + '.' + e.className).slice(0, 5));
  ok('no inline on* event handlers anywhere in the DOM', r.length === 0, JSON.stringify(r));
  ok('no CSP violations, page errors or dialogs', errs.length === 0, errs.slice(0, 4).join(' || '));
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  ok('phone width: the Grok tab has no horizontal page scroll', await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await ev(() => document.documentElement.scrollWidth));

  await b.close();
  console.log(res.join('\n'));
  const fails = res.filter((x) => x.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
var r;
