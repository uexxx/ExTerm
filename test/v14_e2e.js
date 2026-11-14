// v14 end-to-end: every v14 feature through the real UI. Starts its own launcher (port 8780, temporary data folder).
// Third-party APIs are blocked (the app runs on simulated prices); /api/update and DexScreener are mocked per test.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; let errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | '), String(e && e.stack).split('\n').slice(1, 5).join(' | '), 'ERRS', errs.slice(0, 5).join(' || ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const PORT = 8780, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt14-'));
const MOCK = { update: null, ds429: false };
(async () => {
  const srv = spawn(process.platform === 'win32' ? 'python' : 'python3', ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await new Promise((r) => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const open = async (seed, vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 1500, height: 920 }, acceptDownloads: true });
    if (seed) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, seed);
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('framenavigated', (f) => { if (f === page.mainFrame() && page.__loaded) errs.push('NAVIGATED ' + f.url()); }); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    await page.route('**/*', async (r) => {
      const url = r.request().url();
      if (url.startsWith(BASE + '/api/update') && MOCK.update) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK.update) });
      if (url.startsWith(BASE + '/proxy?')) { const t = new URL(url).searchParams.get('u') || ''; if (/api\.dexscreener\.com/.test(t) && MOCK.ds429) return r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Rate limit exceeded, slow down"}' }); return r.abort(); }
      if (url.startsWith(BASE)) return r.continue();
      return r.abort();
    });
    await page.goto(BASE + '/'); page.__loaded = true;
    await page.waitForFunction(() => window.__exterm_v14 === true && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    return { ctx, page, ev: (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); }) };
  };
  let { ctx, page, ev } = await open();
  ok('v14 boots with the launcher', await ev(() => window.__exterm_v14 === true && Launcher.caps && Launcher.caps.version === '15.0' && Launcher.caps.update === true), await ev(() => JSON.stringify(Launcher.caps)));

  /* ── multi-timeframe strip ── */
  await page.waitForFunction(() => document.querySelectorAll('#mtfStrip .mtf-c').length === 4, null, { timeout: 20000 }).catch(() => {});
  let r = await ev(() => ({ n: document.querySelectorAll('#mtfStrip .mtf-c').length, txt: $('#mtfStrip').textContent, sum: $('#mtfStrip').dataset.summary, dirs: [...document.querySelectorAll('#mtfStrip .mtf-c')].map((x) => x.title) }));
  ok('MTF strip shows 15m / 1h / 4h / 1d with a direction', r.n === 4 && /15m/.test(r.txt) && /1d/.test(r.txt) && r.dirs.every((t) => /: (up|down|flat)/.test(t)), JSON.stringify(r));
  ok('MTF strip has a plain-language summary', /timeframes|Mostly|Mixed/.test(r.sum || ''), r.sum);
  await ev(() => selectSym('ETH-USD')); await page.waitForFunction(() => /ETH/.test(V14UI.mtfKey) && document.querySelectorAll('#mtfStrip .mtf-c').length === 4, null, { timeout: 20000 }).catch(() => {});
  ok('MTF strip follows the selected symbol', await ev(() => V14UI.mtfKey.startsWith('ETH-USD')));
  await ev(() => selectSym('BTC-USD'));

  /* ── keyboard shortcuts ── */
  await page.click('#chartHost', { position: { x: 300, y: 200 } }).catch(() => {});
  await ev(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('?');
  ok('? opens the shortcut list', await ev(() => !!$('#v14Keys') && /Switch timeframe/.test($('#v14Keys').textContent)));
  await page.keyboard.press('Escape'); ok('Esc closes it', await ev(() => !$('#v14Keys')));
  const tfs = await ev(() => tfList()); await page.keyboard.press('3');
  ok('number keys switch the timeframe', await ev((t) => ST.tf === t, tfs[2]), await ev(() => ST.tf));
  await page.keyboard.press('1');
  await page.keyboard.press('s');
  r = await ev(() => ({ side: (document.querySelector('#ticket .tabs button.on') || {}).dataset.side, focus: document.activeElement && document.activeElement.id }));
  ok('S switches the ticket to Sell and focuses the amount', r.side === 'sell' && r.focus === 'tkUsd', JSON.stringify(r));
  await page.keyboard.type('5'); ok('…and typing then goes into the box, not a shortcut', await ev(() => ST.tf === tfList()[0] && /5/.test($('#tkUsd').value)));
  await ev(() => document.activeElement.blur()); await page.keyboard.press('b');
  ok('B switches back to Buy', await ev(() => document.querySelector('#ticket .tabs button.on').dataset.side === 'buy'));
  await ev(() => { $('#symInput').focus(); }); await page.keyboard.press('3'); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await ev(() => { document.activeElement.blur(); const d = document.querySelector('.sp-drop.on, #symPick.on'); if (d) d.classList.remove('on'); });
  ok('shortcuts are ignored while typing in a box', await ev(() => ST.tf === tfList()[0]));
  await ev(() => { chart.view = { bars: 40, off: 20 }; }); await page.keyboard.press('f');
  ok('F resets the chart zoom', await ev(() => chart.view.bars === 110 && chart.view.off === 0));
  await page.keyboard.press('r'); await page.waitForFunction(() => Replay.on, null, { timeout: 8000 }).catch(() => {});
  ok('R starts bar replay', await ev(() => Replay.on));
  const tfBefore = await ev(() => ST.tf); await page.keyboard.press('b'); await page.keyboard.press('4');
  ok('during replay B trades the replay and number keys do nothing', await ev((t) => Replay.acct.trades.length === 1 && ST.tf === t && document.activeElement.id !== 'tkUsd', tfBefore), await ev(() => JSON.stringify({ n: Replay.acct.trades.length, tf: ST.tf })));
  await page.keyboard.press('r'); await page.waitForFunction(() => !Replay.on, null, { timeout: 8000 }).catch(() => {});
  ok('R again leaves replay', await ev(() => !Replay.on));

  /* ── journal trades on the chart ── */
  await ev(() => { selectSym('BTC-USD'); });
  await page.waitForFunction(() => chart.data.length > 50, null, { timeout: 10000 });
  const mk = await ev(async () => {
    const D = chart.data, i = D.length - 25, j = D.length - 10, t1 = D[i].t * 1000, t2 = D[j].t * 1000;
    Journal.record({ id: 'm1', sym: 'BTC-USD', side: 'buy', price: D[i].c, usd: 100, qty: 1, ts: t1 }, null);
    Journal.record({ id: 'm2', sym: 'BTC-USD', side: 'sell', price: D[j].c, usd: 100, qty: 1, pnl: 12.5, ts: t2 }, null);
    ST.settings.jnMarks = false; chart.invalidate(); await new Promise((r) => setTimeout(r, 300));
    return { t1: D[i].t, p1: D[i].c };
  });
  const pix = async () => ev(async (m) => { chart.invalidate(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const dpr = chart.cv.width / chart.cv.clientWidth, x = Math.round(chart.tToX(m.t1) * dpr), y = Math.round(chart.L.py(m.p1) * dpr), d = chart.cv.getContext('2d').getImageData(x - 10, y - 4, 20, 26).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 34) < 6 && Math.abs(d[i + 1] - 197) < 6 && Math.abs(d[i + 2] - 94) < 6) k++; return k; }, mk);
  await page.waitForTimeout(300); const before = await pix();
  await page.keyboard.press('j'); await page.waitForTimeout(400); const after = await pix();
  const jdiag = await ev(() => ({ on: ST.settings.jnMarks, act: (document.activeElement || {}).id || (document.activeElement || {}).tagName, modal: !!document.querySelector('.v13-modal, #tourOv'), tab: curTab, replay: Replay.on }));
  ok('J shows your journal trades as markers on the chart', jdiag.on === true && after > 15 && after > before + 15, JSON.stringify({ before, after, jdiag }));
  await page.keyboard.press('j'); ok('J hides them again (setting saved)', await ev(() => ST.settings.jnMarks === false && JSON.parse(localStorage.getItem(LS_KEY)).settings.jnMarks === false));

  /* ── P&L calendar ── */
  await ev(async () => {
    const dayMs = 864e5, base = Date.now();
    for (let k = 0; k < 6; k++) Journal.record({ id: 'c' + k, sym: 'ETH-USD', side: 'sell', price: 10, usd: 50, qty: 5, pnl: k % 2 ? -15 : 25, ts: base - (k % 3) * dayMs }, null);
    showTab('journal'); Journal.filt.period = 'all'; Journal.render();
  });
  await page.waitForFunction(() => !!$('#jnCal'), null, { timeout: 8000 }).catch(() => {});
  r = await ev(() => { const td = V14UI.dayKey(Date.now()), cell = $(`#jnCal [data-day="${td}"]`); return { cal: !!$('#jnCal'), today: cell && cell.textContent, cls: cell && cell.className, month: $('#jnCal .cal-m').textContent, sum: $('#jnCal .note').textContent }; });
  ok('the journal shows a P&L calendar for this month', r.cal && /today/.test(r.cls || '') && /\$/.test(r.today || '') && /closed trade/.test(r.sum), JSON.stringify(r));
  const listAll = await ev(() => Journal.filtered().length);
  await ev(() => $(`#jnCal [data-day="${V14UI.dayKey(Date.now())}"]`).click());
  r = await ev(() => ({ n: Journal.filtered().length, day: Journal.filt.day, chip: !!$('[data-calclr]'), on: !!$('#jnCal .cal-d.on'), same: Journal.filtered().every((e) => V14UI.dayKey(e.ts) === Journal.filt.day) }));
  ok('clicking a day filters the journal to that day', r.n > 0 && r.n < listAll && r.chip && r.on && r.same, JSON.stringify(r) + ' of ' + listAll);
  await ev(() => $('[data-calclr]').click()); ok('the chip clears the day filter', await ev((n) => !Journal.filt.day && Journal.filtered().length === n, listAll));
  const m0 = await ev(() => $('#jnCal .cal-m').textContent); await ev(() => $('#jnCal [data-cal="-1"]').click());
  ok('‹ goes to the previous month', await ev((m) => $('#jnCal .cal-m').textContent !== m, m0));
  await ev(() => $('#jnCal [data-cal="1"]').click()); await ev(() => $('#jnCal [data-cal="1"]').click());
  ok('› moves forward, crossing years correctly', await ev(() => !!$('#jnCal .cal-m').textContent.match(/\d{4}/)));
  await ev(() => { Journal.record({ id: 'xss', sym: '<img src=x onerror="window.__pwn=1">', side: 'sell', price: 1, usd: 1, qty: 1, pnl: 3, ts: Date.now() }, null); Journal.render(); });
  ok('calendar renders safely with hostile symbols', await ev(() => window.__pwn === undefined && !document.querySelector('#jnCal img')));

  /* ── backtest add-ons ── */
  await ev(() => { showTab('bots'); Object.assign(ST.setup, { strat: Object.keys(NT.strategies).find((k) => /ema/i.test(k) && !NT.strategies[k].liveOnly) || Object.keys(NT.strategies)[0], sym: 'BTC-USD', tf: '1h', bars: '1500' }); renderSetup(); });
  await ev(() => runBacktest()); await page.waitForFunction(() => !!$('#v14Bt'), null, { timeout: 60000 }).catch(() => {});
  r = await ev(() => ({ has: !!$('#v14Bt'), q: ($('#v14Bt .v14-box h4 .tag') || {}).textContent, rr: ($('#v14Bt').textContent.match(/chance of a 50% drawdown|Needs at least 5/) || [''])[0], sel: document.querySelectorAll('#v14C1 option').length }));
  ok('backtests show a data-quality grade', r.has && /^[ABCDF]$/.test(r.q || ''), JSON.stringify(r));
  ok('backtests show risk of ruin (or why not)', !!r.rr, JSON.stringify(r));
  const other = await ev(() => Object.keys(NT.strategies).filter((k) => !NT.strategies[k].liveOnly && k !== lastBt.S.strat).slice(0, 2));
  await ev((o) => { $('#v14C1').value = o[0]; $('#v14C2').value = o[1]; $('#v14Cmp').click(); }, other);
  await page.waitForFunction(() => document.querySelectorAll('#v14CmpOut tbody tr').length === 3, null, { timeout: 60000 }).catch(() => {});
  r = await ev(() => ({ rows: document.querySelectorAll('#v14CmpOut tbody tr').length, cv: !!$('#v14CmpCv'), first: $('#v14CmpOut tbody tr td').textContent, lens: (V14UI.lastCompare || []).map((x) => x.res.eq.length) }));
  ok('compare runs 2 more strategies on the same data and overlays them', r.rows === 3 && r.cv && /yours/.test(r.first) && r.lens.every((l) => l === r.lens[0]), JSON.stringify(r));
  await ev(() => { $('#v14C1').value = lastBt.S.strat; $('#v14C2').value = ''; $('#v14Cmp').click(); });
  ok('comparing a strategy with itself explains instead of running', await ev(() => /different strategy/.test($('#v14CmpOut').textContent)));

  /* ── trade CSV is formula-safe ── */
  const dl = await (async () => {
    await ev(() => { ACC.buy('BTC-USD', px('BTC-USD'), 100, Date.now(), { reason: '=HYPERLINK("http://evil")', src: 'manual' }); ACC.sell('BTC-USD', px('BTC-USD') * 0.9, null, Date.now() + 1, { reason: '@SUM(A1)', src: 'manual' }); showTab('portfolio'); renderPortfolio(true); });
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), ev(() => $('#pfCsv').click())]);
    return d ? fs.readFileSync(await d.path(), 'utf8') : '';
  })();
  ok('trade CSV export neutralises formulas', dl.includes(`"'=HYPERLINK`) && dl.includes(`"'@SUM`) && !/,"=HYPERLINK/.test(dl), dl.slice(0, 200));
  ok('…while negative numbers stay numbers', /,"-\d/.test(dl) && !/"'-\d/.test(dl), dl.split('\n').slice(1, 3).join(' | '));

  /* ── DexScreener 429 in the page ── */
  MOCK.ds429 = true;
  r = await ev(async () => { try { await J.get('https://api.dexscreener.com/latest/dex/pairs/solana/abc'); return { ok: 1 }; } catch (e) { return { m: e.message, rate: e.rate }; } });
  ok('a DexScreener 429 becomes a short "free limit" message', r.rate === true && /free limit reached/.test(r.m) && !/slow down/.test(r.m), JSON.stringify(r));
  MOCK.ds429 = false;

  /* ── update banner ── */
  MOCK.update = { current: '14.0', latest: '14.1', newer: true, url: 'https://github.com/uexxx/novaterm-pioneering-trading-terminals/releases/tag/v14.1', notes: '<img src=x onerror="window.__pwn=9"> Faster radar' };
  await ev(() => V14UI.checkUpdate());
  r = await ev(() => { const b = $('#v14Upd'); return b && { txt: b.textContent, href: b.querySelector('a').getAttribute('href'), rel: b.querySelector('a').rel, img: !!b.querySelector('img') }; });
  ok('a newer release shows an update banner with a link to GitHub', r && /14\.1 is out/.test(r.txt) && r.href.startsWith('https://github.com/') && /noopener/.test(r.rel), JSON.stringify(r));
  ok('release notes are shown as text, not HTML', r && !r.img && /onerror/.test(r.txt) && (await ev(() => window.__pwn)) === undefined);
  await ev(() => $('#v14Upd [data-skip]').click());
  ok('"Not now" hides it and remembers that version', await ev(() => !$('#v14Upd') && ST.settings.updSkip === '14.1'));
  await ev(() => V14UI.checkUpdate()); ok('the skipped version does not come back', await ev(() => !$('#v14Upd')));
  MOCK.update = { current: '14.0', latest: '14.2', newer: true, url: 'javascript:alert(1)', notes: '' };
  await ev(() => V14UI.checkUpdate()); ok('a non-GitHub link never makes a banner', await ev(() => !$('#v14Upd')));
  MOCK.update = null;
  r = await ev(async () => J.get('/api/update', { timeout: 15000 }).catch((e) => ({ err: e.message })));
  ok('the real launcher endpoint answers (offline here: no update, no crash)', r && r.current === '15.0' && r.newer === false, JSON.stringify(r));

  /* ── welcome back + saved to disk ── */
  await ev(() => V14UI.saveVisit()); await ev(() => DiskSync.push());
  const disk = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'));
  ok('the last-visit snapshot is saved to this computer too', !!disk.keys['nt.lastVisit'] && JSON.parse(disk.keys['nt.lastVisit']).px['BTC-USD'] > 0);
  await ctx.close(); await new Promise((r) => setTimeout(r, 800));
  // pretend the last visit was 3 hours ago, with hostile data in it, then open a brand-new browser (it restores from disk)
  const lv = JSON.parse(JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8')).keys['nt.lastVisit']); lv.ts = Date.now() - 3 * 3600e3 - 120000; lv.px['BTC-USD'] *= 0.9; lv.px['<img src=x onerror="window.__pwn=2">'] = 1; lv.eq -= 250; lv.jn = Math.max(0, lv.jn - 3);
  const tok = (await (await fetch(BASE + '/')).text()).match(/name="nt-token" content="([^"]+)"/)[1];
  await fetch(BASE + '/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ExTerm': tok }, body: JSON.stringify({ keys: { 'nt.lastVisit': JSON.stringify(lv) }, savedAt: Date.now() + 5000 }) });
  ({ ctx, page, ev } = await open());
  await page.waitForFunction(() => !!$('#v14Welcome'), null, { timeout: 30000 }).catch(() => {});
  r = await ev(() => { const w = $('#v14Welcome'); return w && { txt: w.textContent, img: !!w.querySelector('img') }; });
  ok('welcome-back card: time away, movers, equity change, new trades', r && /You were away 3h/.test(r.txt) && /BTC/.test(r.txt) && /\+/.test(r.txt) && /new trade.* in your journal/.test(r.txt), JSON.stringify(r));
  ok('welcome-back card is safe with hostile saved data', r && !r.img && (await ev(() => window.__pwn)) === undefined);
  await ev(() => $('#v14Welcome .x').click()); ok('it can be closed', await ev(() => !$('#v14Welcome')));
  await ctx.close();

  /* ── small screens ── */
  ({ ctx, page, ev } = await open(null, { width: 390, height: 844 }));
  await ev(() => { showTab('journal'); Journal.render(); }); await page.waitForFunction(() => !!$('#jnCal'), null, { timeout: 8000 }).catch(() => {});
  r = await ev(() => { const c = $('#jnCal'); return c && { w: c.scrollWidth, cw: c.clientWidth, doc: document.documentElement.scrollWidth }; });
  ok('the calendar fits a phone screen', r && r.w <= r.cw + 2 && r.doc <= 392, JSON.stringify(r));
  await ctx.close();

  ok('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(res.join('\n')); const n = res.filter((x) => x.startsWith('PASS')).length; console.log(`${n}/${res.length} passed`);
  process.exit(n === res.length ? 0 : 1);
})();
