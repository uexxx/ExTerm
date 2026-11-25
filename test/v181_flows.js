// ExTerm v18.1 browser flows, shared by test/v17pro_e2e.js (desktop 1440 × 900 + phone 390 × 844) and runnable alone:
//   node test/v181_flows.js   (starts serve.py --offline on EXTERM_E2E_PORT or 8878, outside network blocked)
// Every tab → chart handoff with real clicks: 24/7 Alpha Recs "Open on 1s–1M Chart", 24/7 Bot Radar double-click, Tracker "Load",
// Ctrl+K "Open on chart" for typed contracts, plus the normalizer forms (oc:eth:0x…, oc:sol:…, oc:base:…, raw 0x…, BTC-USD, NVDA),
// each across 1s · 1m · 1h · 1d · 1M: non-empty candles, hydration < 250 ms cold (prewarmed) / < 25 ms warm, zero "Could not load
// candles" banners, zero console / page errors.
const TFS = ['1s', '1m', '1h', '1d', '1M'];
const SYMS = { eth: 'oc:eth:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', sol: 'oc:sol:7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', base: 'oc:base:0x4c36388be6f416a29c8d8eee81c771ce6be14b18', ca: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' };

/* in-page helper source: open through a real handoff, then walk the timeframe pills; returns per-tf bars, hydration ms and banners */
const HELP = () => {
  window.__x181 = {
    pill(tf) { const b = [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === tf); if (b) b.click(); return !!b; },
    banner() { const m = chart && !chart.data.length ? chart.msg || '' : ''; const dom = [...document.querySelectorAll('#tab-markets .empty')].map((e) => e.textContent).join(' '); return /Could not load candles|next tick/.test(m + ' ' + dom) ? (m + ' ' + dom).slice(0, 160) : ''; },
    async bars(sym, ms) { for (let i = 0; i < (ms || 4000) / 16; i++) { const s = getStore(ST.sel, ST.tf); if ((!sym || ST.sel === sym) && s.candles.length && chart.data.length) return s.candles.length; await new Promise((r) => requestAnimationFrame(r)); } return 0; },
    last(sym, tf) { const L = V181UI.hydLog.filter((x) => x.sym === sym && x.tf === tf && x.ms != null); return L.length ? L[L.length - 1] : null; },
    async walk(tfs) {
      const out = {}, sym = ST.sel;
      for (const tf of tfs) { this.pill(tf); const n = await this.bars(sym, 5000); await new Promise((r) => setTimeout(r, 30)); const h = this.last(sym, tf); out[tf] = { n, ms: h ? Math.round(h.ms * 10) / 10 : null, warm: h ? h.warm : null, banner: this.banner(), chart: chart.data.length }; }
      return out;
    },
  };
};
const good = (w) => Object.values(w).every((x) => x.n > 0 && x.chart > 0 && !x.banner);

async function desktop(page, ok, ev, waitFor, errs) {
  const e0 = errs.length;
  await ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief')) x.remove(); });
  await ev(HELP);
  await waitFor(() => typeof V181UI !== 'undefined' && V181UI.mounted && TFX._x181 && selectSym._x181 && setMode._x181 && ensureSym._x181, null, 20000);

  /* 1 · 24/7 Alpha Recs → Open on 1s–1M Chart (crypto, stock, on-chain rows), real button clicks */
  await ev(() => { V177UI.go('alpha'); });
  await waitFor(() => V180UI.data && V180UI.data.rows && V180UI.data.rows.length > 0 && document.querySelectorAll('#x180Feed .x180-card').length > 0, null, 45000);
  await waitFor(() => V181UI.stats.prewarmed > 0, null, 20000);
  const al = await ev(async () => {
    const res = {};
    for (const mkt of ['crypto', 'stocks', 'onchain']) {
      V177UI.go('alpha'); document.querySelector('[data-x180f="all"]').click(); await new Promise((r) => setTimeout(r, 80));
      const r = [...V180UI.rows.values()].find((x) => x.mkt === mkt); if (!r) { res[mkt] = 'no row'; continue; }
      const b = document.querySelector(`#x180Feed [data-x180a="chart"][data-k="${CSS.escape(r.sym + '|' + r.side)}"]`); const t0 = performance.now(); b.click();
      const n = await __x181.bars(V181.canon(r.sym), 5000), open = Math.round(performance.now() - t0), h = V181UI.hydLog.filter((x) => x.sym === ST.sel && x.ms != null).pop();
      res[mkt] = { sym: r.sym, sel: ST.sel, tab: curTab, n, open, hyd: h ? Math.round(h.ms) : null, walk: await __x181.walk(['1s', '1m', '1h', '1d', '1M']) };
    }
    return res;
  });
  ok('v18.1 24/7 Alpha Recs → "Open on 1s–1M Chart" (crypto, stock and on-chain setups): the chart opens with candles on 1s · 1m · 1h · 1d · 1M, never a "Could not load candles" banner', ['crypto', 'stocks', 'onchain'].every((m) => al[m] && al[m].n > 0 && al[m].tab === 'markets' && good(al[m].walk)), JSON.stringify(al).slice(0, 900));
  const hy = Object.values(al).filter((x) => x && x.hyd != null).map((x) => x.hyd);
  ok('v18.1 hydration from an Alpha Recs click (symbols pre-warmed in Lanes 9 / 10 + the page cache): first candles in < 250 ms', hy.length === 3 && hy.every((ms) => ms < 250), JSON.stringify(hy));

  /* 2 · 24/7 Bot Radar → double-click a bot (no panel added) */
  await ev(() => { V177UI.go('botradar'); });
  await waitFor(() => V177UI.radar && V177UI.radar.pts && V177UI.radar.pts.length > 0, null, 30000);
  let rd = null;
  for (let k = 0; k < 4 && !(rd && rd.n > 0); k++) {
    const pt = await ev(() => { const R = V177UI.radar, cv = document.querySelector('#tab-botradar canvas'), b = cv.getBoundingClientRect(), L = R.pop.list(); const p = R.pts.find((q) => { const bot = L.find((x) => x.id === q.id); return bot && bot.sym; }); if (!p) return null; const bot = L.find((x) => x.id === p.id); return { x: b.left + p.x, y: b.top + p.y, sym: bot.sym }; });
    if (!pt) { await page.waitForTimeout(500); continue; }
    await page.mouse.dblclick(pt.x, pt.y); await page.waitForTimeout(250);
    rd = await ev(async (want) => { const n = await __x181.bars(null, 5000); return { want, sel: ST.sel, tab: curTab, n, opens: V181UI.stats.radarOpens || 0, walk: ST.sel === V181.canon(want) ? await __x181.walk(['1s', '1m', '1h', '1d', '1M']) : null }; }, pt.sym);
    if (!(rd.opens > 0 && rd.sel === (await ev((s) => V181.canon(s), pt.sym)))) rd.n = 0;
  }
  const panels = await ev(() => document.querySelectorAll('#tab-botradar > :not(canvas):not([data-x177h]):not(.x177-hud):not(.x177-filters):not(.x177-corner)').length);
  ok('v18.1 24/7 Bot Radar → double-click a bot: its coin opens on the Co-Pilot chart with candles on 1s · 1m · 1h · 1d · 1M (canvas stays full-bleed, no panel added)', !!rd && rd.n > 0 && rd.tab === 'markets' && rd.walk && good(rd.walk), JSON.stringify({ rd, panels }).slice(0, 700));

  /* 3 · Tracker → Load */
  const tr = await ev(async () => {
    V177UI.go('copilot'); await new Promise((r) => setTimeout(r, 200)); const tb = document.querySelector('#x178TrkB'); if (!tb) return { err: 'no tracker button' };
    if (document.querySelector('#x178Trk').hidden) tb.click();
    let b = null; for (let i = 0; i < 100 && !b; i++) { b = document.querySelector('#x178Trk [data-x178a="load"][data-v]'); if (!b) { const s = [...document.querySelectorAll('#x178Subs [data-x178s]')][i % 3]; if (s && i % 20 === 19) s.click(); await new Promise((r) => setTimeout(r, 150)); } }
    if (!b) return { err: 'no load rows' }; const v = b.dataset.v; b.click(); const n = await __x181.bars(null, 5000); const w = await __x181.walk(['1s', '1m', '1h', '1d', '1M']); const d = document.querySelector('#x178Trk'); if (d && !d.hidden) document.querySelector('#x178TrkB').click();
    return { v, sel: ST.sel, n, walk: w };
  });
  ok('v18.1 Tracker → Load: the tracked coin / ticker opens with candles on 1s · 1m · 1h · 1d · 1M', !tr.err && tr.n > 0 && good(tr.walk), JSON.stringify(tr).slice(0, 600));

  /* 4 · the normalizer forms through the real handoff (selectSym / setMode wrappers) */
  const nf = await ev(async (S) => {
    const res = {};
    for (const [k, raw] of [['eth', S.eth], ['sol', S.sol], ['base', S.base], ['btc', 'BTC-USD'], ['nvda', 'NVDA'], ['usdt', 'ETHUSDT']]) { V181UI.openChart(raw); const n = await __x181.bars(V181.canon(raw), 5000); res[k] = { raw: raw.slice(0, 24), sel: ST.sel, n, walk: await __x181.walk(['1s', '1m', '1h', '1d', '1M']) }; }
    V181UI.openChart(S.ca); let n = 0; for (let i = 0; i < 300 && !(n = getStore(ST.sel, ST.tf).candles.length && /^oc:/.test(ST.sel) ? 1 : 0); i++) await new Promise((r) => setTimeout(r, 20)); res.ca = { sel: ST.sel, n: await __x181.bars(null, 5000), walk: await __x181.walk(['1s', '1m', '1h', '1d', '1M']) };
    return res;
  }, SYMS);
  ok('v18.1 normalizer handoffs: oc:eth:0x… · oc:sol:… · oc:base:… · BTC-USD · NVDA · ETHUSDT open as oc:eth:<lowercase> · oc:solana:… · oc:base:… · BTC-USD · NVDA · ETH-USD with candles on all 5 timeframes', nf.eth.sel === SYMS.eth.toLowerCase() && nf.sol.sel === SYMS.sol.replace('oc:sol:', 'oc:solana:') && nf.base.sel === SYMS.base && nf.btc.sel === 'BTC-USD' && nf.nvda.sel === 'NVDA' && nf.usdt.sel === 'ETH-USD' && ['eth', 'sol', 'base', 'btc', 'nvda', 'usdt'].every((k) => nf[k].n > 0 && good(nf[k].walk)), JSON.stringify(nf).slice(0, 900));
  ok('v18.1 a raw 0x… contract (no pool given) resolves through Lane 9 and opens on the on-chain chart with candles on all 5 timeframes', /^oc:[a-z_]+:0x[0-9a-f]+$/.test(nf.ca.sel) && nf.ca.n > 0 && good(nf.ca.walk), JSON.stringify(nf.ca).slice(0, 500));

  /* 5 · Ctrl+K: a typed contract gets "Open on chart" at the top */
  await ev(() => { V177UI.go('copilot'); });
  await page.keyboard.press('Control+k'); await page.waitForTimeout(150); await page.keyboard.type(SYMS.sol); await page.waitForTimeout(150);
  const pk = await ev(() => { const f = document.querySelector('#palList .it'); return { top: f ? f.textContent : '', on: !!(f && f.classList.contains('on')) }; });
  await page.keyboard.press('Enter');
  const pk2 = await ev(async (raw) => { const n = await __x181.bars(V181.canon(raw), 5000); return { sel: ST.sel, n, tab: curTab, open: document.querySelector('#palette').classList.contains('on') }; }, SYMS.sol);
  ok('v18.1 Ctrl+K: a typed oc:sol:… symbol offers "Open on chart · oc:solana:…" first; Enter opens it with candles', /^Open on chart · oc:solana:7GCi/.test(pk.top) && pk.on && pk2.sel === SYMS.sol.replace('oc:sol:', 'oc:solana:') && pk2.n > 0 && !pk2.open, JSON.stringify({ pk, pk2 }));

  /* 6 · warm re-opens: < 25 ms from the handoff to bars in the store (store or page cache, synchronous) */
  const wm = await ev(async (S) => {
    const res = [];
    for (const raw of [S.eth, S.sol, 'BTC-USD', 'NVDA']) for (const tf of ['1s', '1m', '1h', '1d', '1M']) {
      V181UI.openChart(raw); await __x181.bars(V181.canon(raw), 3000); __x181.pill(tf); await __x181.bars(V181.canon(raw), 3000);
      V181UI.openChart('ETH-USD'); await __x181.bars('ETH-USD', 3000); // leave, then come back warm
      V181UI.openChart(raw); __x181.pill(tf); const n = await __x181.bars(V181.canon(raw), 3000), h = __x181.last(V181.canon(raw), tf);
      res.push([raw.slice(0, 10), tf, n, h ? Math.round(h.ms * 100) / 100 : null, h && h.warm]);
    }
    return res;
  }, SYMS);
  ok('v18.1 warm hydration: re-opening oc:eth · oc:sol · BTC-USD · NVDA on 1s · 1m · 1h · 1d · 1M puts candles in the store in < 25 ms (synchronous, before the next frame)', wm.length === 20 && wm.every((x) => x[2] > 0 && x[3] != null && x[3] < 25 && x[4]), JSON.stringify(wm));

  /* 7 · hygiene: zero errors, zero banners across every flow above */
  const hg = await ev(() => ({ banner: __x181.banner(), fail: V181UI.stats.fail, hyd: V181UI.hydLog.length, cold: V181.lagMs(V181UI.hydLog.filter((x) => !x.warm && x.ms != null).map((x) => x.ms)), warm: V181.lagMs(V181UI.hydLog.filter((x) => x.warm && x.ms != null).map((x) => x.ms)), stats: V181UI.stats }));
  ok('v18.1 zero "Could not load candles" banners and zero console / page errors across every tab → chart handoff (desktop 1440 × 900)', !hg.banner && errs.length === e0, JSON.stringify(hg).slice(0, 500) + ' ' + errs.slice(e0, e0 + 3).join(' | '));
  return hg;
}

async function phone(ph, ok, errs) {
  const e0 = errs.length;
  await ph.evaluate(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief')) x.remove(); });
  await ph.evaluate(HELP);
  await ph.waitForFunction(() => typeof V181UI !== 'undefined' && V181UI.mounted && TFX._x181, null, { timeout: 30000 });
  const q = await ph.evaluate(async (S) => {
    V177UI.go('alpha'); for (let i = 0; i < 80 && !(V180UI.data && V180UI.data.rows && V180UI.data.rows.length); i++) await new Promise((r) => setTimeout(r, 500)); V180UI.Alpha.paint(); await new Promise((r) => setTimeout(r, 300));
    const out = {}; const r = [...V180UI.rows.values()].find((x) => x.mkt === 'onchain') || [...V180UI.rows.values()][0];
    const b = r && document.querySelector(`#x180Feed [data-x180a="chart"][data-k="${CSS.escape(r.sym + '|' + r.side)}"]`); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); }
    out.alpha = { sym: r && r.sym, btn: !!b, n: await __x181.bars(r ? V181.canon(r.sym) : null, 6000), sel: ST.sel, tab: curTab, walk: await __x181.walk(['1s', '1m', '1h', '1d', '1M']) };
    for (const [k, raw] of [['eth', S.eth], ['btc', 'BTC-USD'], ['nvda', 'NVDA']]) { V181UI.openChart(raw); await __x181.bars(V181.canon(raw), 6000); out[k] = await __x181.walk(['1s', '1M']); }
    out.hs = document.documentElement.scrollWidth > innerWidth + 1; out.banner = __x181.banner(); return out;
  }, SYMS);
  ok('v18.1 phone 390 × 844: Alpha Recs → chart (on-chain setup) renders candles on 1s · 1m · 1h · 1d · 1M; oc:eth · BTC-USD · NVDA open on 1s and 1M; no banner, no horizontal scroll, no errors', q.alpha.n > 0 && good(q.alpha.walk) && good(q.eth) && good(q.btc) && good(q.nvda) && !q.hs && !q.banner && errs.length === e0, JSON.stringify(q).slice(0, 700) + ' ' + errs.slice(e0, e0 + 3).join(' | '));
}
module.exports = { desktop, phone, SYMS, TFS };

if (require.main === module) {
  const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
  const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
  const PORT = +process.env.EXTERM_E2E_PORT || 8878, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'xt181f-'));
  const CHROME = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  const res = [], errs = [], ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 900)));
  const block = async (ctx) => { await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort())); await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); };
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ' PAGE ' + e.message)); p.on('dialog', (d) => { errs.push(tag + ' DIALOG ' + d.message()); d.dismiss(); }); p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|net::ERR_|WebSocket/.test(t)) errs.push(tag + ' CONSOLE ' + t); }); };
  (async () => {
    const srv = spawn(process.platform === 'win32' ? 'python' : 'python3', ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
    process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
    for (let i = 0; i < 80; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await new Promise((r) => setTimeout(r, 250)); }
    const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await block(ctx);
      const page = await ctx.newPage(); page.setDefaultTimeout(15000); watch(page, 'DESK');
      const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
      const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
      await page.goto(BASE + '/'); await page.waitForFunction(() => typeof V181UI !== 'undefined' && V181UI.mounted && typeof chart !== 'undefined' && chart && chart.data && chart.data.length > 60, null, { timeout: 90000 });
      const hg = await desktop(page, ok, ev, waitFor, errs); console.log('hydration', JSON.stringify({ cold: hg.cold, warm: hg.warm }));
      const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await block(m);
      const ph = await m.newPage(); watch(ph, 'PHONE'); await ph.goto(BASE + '/'); await ph.waitForFunction(() => typeof V181UI !== 'undefined' && V181UI.mounted && typeof V17Mob !== 'undefined' && V17Mob.mounted, null, { timeout: 90000 });
      await phone(ph, ok, errs); await m.close();
    } catch (e) { res.push('FAIL crashed: ' + String(e && e.message).split('\n').slice(0, 3).join(' | ')); } finally { await b.close(); }
    console.log(res.join('\n')); const f = res.filter((x) => x.startsWith('FAIL')).length; console.log(`\n${res.length - f}/${res.length} passed`); process.exit(f ? 1 : 0);
  })();
}
