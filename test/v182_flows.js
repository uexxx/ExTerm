// ExTerm v18.2 browser flows, shared by test/v17pro_e2e.js (desktop 1440 × 900 + phone 390 × 844) and runnable alone:
//   node test/v182_flows.js   (starts serve.py --offline on EXTERM_E2E_PORT or 8879, outside network blocked)
// The UI-speed crawl clicks every visible, enabled control on the 5 rail views and the Portfolio & Risk Console and fails if any is
// dead (no DOM mutation, no state change, no focus move, no download, no clipboard write), throws, or takes ≥ 10 ms of main-thread
// time; plus atomic 5m → 1h switches, the Lane 22 guard, the OffscreenCanvas HUD worker + Shift+Drag ruler, Zen (Z), R, 1–5,
// the 26-lane mesh dot, Lane 25 star + Ctrl+K search, the Lane 26 console (PAPER / LIVE isolation, Close 50 % / 100 %, Stop → BE,
// CSV export, Shift+Esc), Stocks / 0DTE population, ≥ 80 ms hover pre-warm → chart open, and Stocks EVO / Crypto EVO.
const UI_MS = 10;
/* controls the crawl does not click (they are exercised by dedicated checks below, or they destroy the session) */
const SKIP = /reset|delete|wipe|forget|erase|remove all|clear all|sign out|log out|FLATTEN|panic|uninstall|factory|revoke/i;

/* in-page helper (passed to page.evaluate: the strict CSP forbids eval, CDP function calls are fine) */
const HELP = ([UI_MS, SKIP_SRC]) => {
  const SKIP = new RegExp(SKIP_SRC, 'i');
  window.__x182 = {
    muts: 0, side: 0, UI_MS,
    init() {
      if (this.mo) return; this.mo = new MutationObserver((l) => { this.muts += l.length; }); this.mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      const cw = navigator.clipboard && navigator.clipboard.writeText; if (cw && !navigator.clipboard._x182) { navigator.clipboard.writeText = (t) => { this.side++; return cw.call(navigator.clipboard, t).catch(() => {}); }; navigator.clipboard._x182 = true; }
      const co = URL.createObjectURL; URL.createObjectURL = (b) => { this.side++; return co.call(URL, b); };
      window.addEventListener('error', () => { this.jsErr = (this.jsErr || 0) + 1; });
    },
    sig() { const c = typeof chart !== 'undefined' && chart; return [typeof curTab !== 'undefined' ? curTab : '', ST.sel, ST.tf, ST.mode, document.body.className, c ? c.tool + ':' + c.view.bars + ':' + c.view.off + ':' + JSON.stringify(c.o) : '', document.activeElement ? document.activeElement.id || document.activeElement.className : '', location.hash].join('|'); },
    visible(e) { if (!e.isConnected || e.disabled || e.closest('[hidden],[aria-hidden="true"],#toasts')) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false; const h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!h && (h === e || e.contains(h) || h.contains(e)); },
    label(e) { return ((e.id ? '#' + e.id + ' ' : '') + (e.getAttribute('aria-label') || e.title || e.textContent || e.value || e.className || e.tagName)).replace(/\s+/g, ' ').trim().slice(0, 60); },
    controls() { return [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], select, input[type="checkbox"], input[type="radio"], summary, a[href^="#"]')].filter((e) => this.visible(e) && !SKIP.test(this.label(e))); },
    /* a modal / popover the last click opened (it would hide every control behind it) */
    dialog() { return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], #palette.on, #langGate, #walkCard, #x17Brief, [id$="Pop"]')].find((d) => !d.hidden && d.isConnected && getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().width > 0); },
    /* close it the way a person would: its own Close button, else Escape, else a click outside (the v15.5 popovers close on that) */
    tidy(view) {
      for (let i = 0; i < 4; i++) {
        const d = this.dialog(); if (!d) break; const x = d.querySelector('[aria-label="Close"], [aria-label="close"], .x17-sheetx, [data-close], [data-x17m="close"], button[title="Close"]');
        if (d.id === 'palette') { if (typeof palClose === 'function') palClose(); } else if (x) x.click(); else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (this.dialog() === d) document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (this.dialog() === d && d.id === 'x17Sheet') d.hidden = true; }
      }
      for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief, #toasts > *')) x.remove();
      const P = document.querySelector('#palette'); if (P && P.classList.contains('on') && typeof palClose === 'function') palClose();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      for (const s of document.querySelectorAll('#x17Sheet, .x177-depthp, #x180DPL')) s.hidden = true;
      if (typeof Replay !== 'undefined' && Replay.on) try { Replay.exit(); } catch (e) { /* replay */ }
      try { if (typeof chart !== 'undefined' && chart) { chart.tool = null; chart.pend = null; } } catch (e) { /* chart */ }
      if (document.body.classList.contains('x182-zen')) V182UI.Zen.toggle(false);
      if (view && typeof V177UI !== 'undefined') { const cur = V177.railOf(curTab); if (view === 'port' ? curTab !== 'port' : cur !== view) { if (view === 'port') showTab('port'); else V177UI.go(view); } }
    },
    async crawl(view, max) {
      this.init(); this.tidy(view); await new Promise((r) => setTimeout(r, 500));
      const seen = new Set(), rows = []; let list = this.controls();
      for (let k = 0; k < list.length && rows.length < (max || 400); k++) {
        const e = list[k]; if (!this.visible(e)) continue; const b0 = e.getBoundingClientRect(), key = this.label(e) + '@' + Math.round(b0.left / 8) + ',' + Math.round(b0.top / 8); if (seen.has(key)) continue; seen.add(key);
        const isSel = (x) => x.classList.contains('on') || x.getAttribute('aria-checked') === 'true' || x.getAttribute('aria-selected') === 'true' || x.getAttribute('aria-pressed') === 'true' || (x.type === 'radio' && x.checked);
        const s0 = this.sig(), side0 = this.side, err0 = this.jsErr || 0, act0 = V182UI.acts, sel0 = isSel(e); this.muts = 0;
        const t0 = performance.now(); try { if (e.tagName === 'SELECT') { const o = [...e.options].find((x) => !x.selected && !x.disabled); if (o) e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); } else e.click(); } catch (x) { this.jsErr = (this.jsErr || 0) + 1; }
        const ms = performance.now() - t0;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise((r) => setTimeout(r, 40));
        /* re-clicking the segment / tab that is already selected keeps it selected: that is the expected answer, not a dead control */
        const alive = this.muts > 0 || this.sig() !== s0 || this.side > side0 || V182UI.acts > act0 || (sel0 && e.isConnected && isSel(e));
        rows.push({ c: this.label(e), ms: Math.round(ms * 100) / 100, alive, err: (this.jsErr || 0) > err0 });
        if (this.sig().split('|')[0] !== s0.split('|')[0] || this.dialog()) { this.tidy(view); await new Promise((r) => setTimeout(r, 250)); }
        if (k === list.length - 1 || k % 25 === 24) list = list.concat(this.controls().filter((x) => !list.includes(x)));
      }
      this.tidy(view); return rows;
    },
  };
};
const crawlOk = (rows) => rows.length > 0 && rows.every((r) => r.alive && !r.err && r.ms < UI_MS);
const crawlInfo = (rows) => JSON.stringify({ n: rows.length, dead: rows.filter((r) => !r.alive).map((r) => r.c).slice(0, 14), slow: rows.filter((r) => r.ms >= UI_MS).map((r) => r.c + ' ' + r.ms).slice(0, 14), err: rows.filter((r) => r.err).map((r) => r.c).slice(0, 8), p95: (rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length * 0.95)] || 0) });

async function desktop(page, ok, ev, waitFor, errs) {
  const e0 = errs.length;
  await ev(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief')) x.remove(); });
  await ev(HELP, [UI_MS, SKIP.source]);
  await waitFor(() => typeof V182UI !== 'undefined' && V182UI.mounted && TFX._x182 && document.querySelector('#x182Cl') && V182UI.mesh && V182UI.mesh.n > 0, null, 30000);

  /* 1 · one 44 px strip: 5 tabs | target + star | ◫ · Z · R · mesh dot · PAPER | LIVE */
  const st = await ev(() => { V177UI.go('copilot'); const r = document.querySelector('#x177Rail'), R = r.getBoundingClientRect(), c = document.querySelector('#x182Cl'); return { tabs: r.querySelectorAll('[data-x177t]').length, btns: [...c.querySelectorAll('button')].map((b) => b.dataset.x182 + (b.dataset.m ? ':' + b.dataset.m : '')), h: R.height, inView: R.left >= 0 && R.right <= innerWidth && R.bottom <= innerHeight, blur: getComputedStyle(r).backdropFilter, one: document.querySelectorAll('.x177-rail').length }; });
  ok('v18.2 ONE 44 px blur(12px) strip: 5 tabs | ◎ target + ★ star | ◫ Portfolio · Z Zen · R Refresh · mesh pulse dot · PAPER | LIVE pill, inside the 1440 × 900 viewport', st.one === 1 && st.tabs === 5 && st.btns.join() === 'target,star,pf,zen,refresh,mesh,mode:PAPER,mode:LIVE' && st.h >= 44 && st.h <= 50 && st.inView && /blur\(12px\)/.test(st.blur), JSON.stringify(st));

  /* 2 · the crawl: every visible control on every rail view + the console */
  const crawl = {};
  for (const v of ['alpha', 'botradar', 'brain', 'livebot', 'copilot', 'port']) crawl[v] = await ev((v2) => __x182.crawl(v2, 260), v);
  const all = Object.values(crawl).flat();
  for (const v of Object.keys(crawl)) ok('v18.2 UI-speed crawl · desktop · ' + v + ': every visible control clicked, alive, error-free, < ' + UI_MS + ' ms main-thread', crawlOk(crawl[v]), crawlInfo(crawl[v]));
  ok('v18.2 UI-speed crawl · desktop total: ≥ 120 distinct controls across the 5 views + console, zero dead, zero slow, zero errors', all.length >= 120 && crawlOk(all), crawlInfo(all));

  /* 3 · atomic 5m → 1h: seq bumped, every title committed in the same frame, chart.tfSec switched synchronously */
  const tf = await ev(async () => {
    V177UI.go('copilot'); setMode('crypto', 'BTC-USD'); await new Promise((r) => setTimeout(r, 600)); const pill = (t) => [...document.querySelectorAll('#tfBtns button')].find((x) => x.textContent.trim() === t);
    const out = []; for (const t of ['5m', '1h', '5m', '1h']) { const s0 = V182UI.seq.n; pill(t).click(); const s = V182UI.Hud.state(); out.push({ t, seq: V182UI.seq.n - s0, chart: chart.tfSec, tgt: document.querySelector('#x182Tgt').textContent, ms: V182UI.tfLog[V182UI.tfLog.length - 1].ms, mark: s && s.mark }); }
    return out;
  });
  ok('v18.2 atomic 5m → 1h → 5m → 1h: tfSeq++ per switch, chart.tfSec and the ◎ target pill / HUD watermark show the new timeframe in the same frame, < 5 ms per switch', tf.every((x) => x.seq === 1 && x.chart === (x.t === '1h' ? 3600 : 300) && x.tgt.endsWith(' · ' + x.t) && x.mark && x.mark.endsWith(' · ' + x.t) && x.ms < 5), JSON.stringify(tf));

  /* 4 · Lane 22 guard on the page loader + HUD worker + Shift+Drag ruler + Live → pill */
  const gd = await ev(async () => { const n0 = V182UI.guard.calls; const st = getStore('ETH-USD', '5m'); await st.load(300); const D = chart.data; if (D.length > 20) { D[D.length - 5].guard = 1; chart.invalidate(); } await new Promise((r) => setTimeout(r, 160)); const s = V182UI.Hud.state(); return { calls: V182UI.guard.calls - n0, wrapped: TFX._x182 && TFX._x181, rings: s ? s.rings.length : 0, off: V182UI.hud.off, ready: !!V182UI.hud.ready, posted: V182UI.hud.posted }; });
  const cb = await page.evaluate(() => { const r = chart.cv.getBoundingClientRect(); return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.4, x2: r.left + r.width * 0.6, y2: r.top + r.height * 0.25 }; });
  await page.keyboard.down('Shift'); await page.mouse.move(cb.x, cb.y); await page.mouse.down(); await page.mouse.move(cb.x2, cb.y2, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(150);
  const ru = await ev(() => { const R = V182UI.hud.ruler, s = V182UI.Hud.state(); chart.view.off = 30; chart.invalidate(); return new Promise((r) => setTimeout(() => { const live = document.querySelector('#x182Live'), shown = !live.hidden; live.click(); setTimeout(() => r({ ruler: !!(R && R.b), txt: s && s.ruler && s.ruler.txt, shown, back: chart.view.off === 0 && live.hidden, stat: V182UI.hud.stat || null }), 80); }, 160)); });
  await page.keyboard.press('Escape');
  ok('v18.2 Lane 22 > 4σ guard wraps the candle loader (outermost, after V181) and its rings reach the HUD; the HUD renders in the OffscreenCanvas worker', gd.calls >= 1 && gd.wrapped && gd.rings >= 1 && gd.off && gd.ready && gd.posted > 0, JSON.stringify(gd));
  ok('v18.2 Shift+Drag ruler (Δ price · % · bars · time, drawn off-thread) and the "Live →" snap pill (appears when panned, snaps back on click)', ru.ruler && /bars/.test(ru.txt || '') && ru.shown && ru.back, JSON.stringify(ru));

  /* 5 · hotkeys: Z Zen, R refresh, 1–5 tabs */
  await ev(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); V177UI.go('copilot'); });
  const w0 = await ev(() => chart.cv.getBoundingClientRect().width); await page.keyboard.press('z'); await page.waitForTimeout(250);
  const z1 = await ev(() => ({ zen: document.body.classList.contains('x182-zen'), top: getComputedStyle(document.querySelector('#top')).display, side: getComputedStyle(document.querySelector('#tab-markets .side-col')).display, w: chart.cv.getBoundingClientRect().width }));
  await page.keyboard.press('z'); await page.waitForTimeout(200); const z2 = await ev(() => ({ zen: document.body.classList.contains('x182-zen'), top: getComputedStyle(document.querySelector('#top')).display }));
  const r0 = await ev(() => ({ seq: V182UI.seq.n, n: V182UI.Refresh.n })); await page.keyboard.press('r'); await page.waitForTimeout(150); const r1 = await ev(() => ({ seq: V182UI.seq.n, n: V182UI.Refresh.n }));
  const keys = {}; for (const [k, t] of [['1', 'alpha'], ['2', 'botradar'], ['3', 'brain'], ['4', 'fleet'], ['5', 'markets']]) { await page.keyboard.press(k); await page.waitForTimeout(350); keys[k] = (await ev(() => curTab)) === t; }
  const tabMs = await ev(() => V182UI.tabMs || []);
  ok('v18.2 Zen mode (Z): header, ticket column and toolbars hide and the chart widens; Z again restores everything', z1.zen && z1.top === 'none' && z1.side === 'none' && z1.w > w0 + 100 && !z2.zen && z2.top !== 'none', JSON.stringify({ w0, z1, z2 }));
  ok('v18.2 hotkeys: R = force refresh (new tfSeq), 1–5 = the 5 rail tabs', r1.seq > r0.seq && r1.n === r0.n + 1 && Object.values(keys).every(Boolean), JSON.stringify({ r0, r1, keys, tabMs }));

  /* 6 · mesh pulse dot + lanes */
  const ms = await ev(async () => { await V182UI.Mesh.poll(true); const j = await V179UI.api('/api/mesh'); const d = document.querySelector('#x182Mesh'); return { n: j.n, ids: j.lanes.map((l) => l.lane), dead: j.dead, ok: j.ok, cls: d.className, title: d.title, ready: j.ready }; });
  ok('v18.2 26-lane mesh pulse dot: Lanes 5–26 (22 lanes) all alive, gold pulse, self-heal + LIVE readiness (PIN / firewall / ledger) in its label', ms.n === 22 && ms.ids[0] === 5 && ms.ids[21] === 26 && !ms.dead.length && ms.ok && /\bok\b/.test(ms.cls) && /22\/22 lanes alive/.test(ms.title) && /LIVE readiness/.test(ms.title), JSON.stringify(ms));

  /* 7 · Lane 25 star + Ctrl+K search; Lanes 25 / 26 latency */
  const s25 = await ev(async () => { setMode('crypto', 'ETH-USD'); await new Promise((r) => setTimeout(r, 300)); const was = V182UI.stars.includes('ETH-USD'); document.querySelector('#x182Star').click(); await new Promise((r) => setTimeout(r, 400)); const j = await V179UI.api('/api/lane25/watch', { op: 'list' }); const on = V182UI.stars.includes('ETH-USD') && j.out.stars.includes('ETH-USD'); const star = document.querySelector('#x182Star').textContent;
    palOpen(); const inp = document.querySelector('#palIn'); inp.value = 'nvid'; inp.dispatchEvent(new Event('input', { bubbles: true })); if (typeof palRender === 'function') palRender(); const first = [...document.querySelectorAll('#palList .it')].map((x) => x.textContent).slice(0, 3); palClose();
    const lat = []; for (let i = 0; i < 9; i++) { const a = await V179UI.api('/api/lane25/search?q=sol'), b = await V179UI.api('/api/lane26/agg', { books: { PAPER: { cash: 1000, pos: [] }, LIVE: { cash: 0, pos: [] } } }); lat.push([a.laneMs, b.laneMs]); }
    const med = (k) => lat.map((x) => x[k]).sort((x, y) => x - y)[4];
    return { was, on, star, first, l25: med(0), l26: med(1) }; });
  ok('v18.2 Lane 25: ★ stars the active target into the launcher watchlist; Ctrl+K "nvid" → "Open NVDA · NVIDIA" first (alias / prefix search); Lanes 25 and 26 answer in < 5 ms', !s25.was && s25.on && s25.star === '★' && /Open NVDA/.test(s25.first[0] || '') && s25.l25 < 5 && s25.l26 < 5, JSON.stringify(s25));

  /* 8 · Portfolio & Risk Console (Lane 26) */
  const pf = await ev(async () => {
    const now = Date.now(); setMode('crypto', 'BTC-USD'); await new Promise((r) => setTimeout(r, 300));
    for (const s of Object.keys(ACC.pos)) ACC.sell(s, px(s) || ACC.pos[s].cost / ACC.pos[s].qty, null, now, { reason: 'v182 test reset', src: 'manual' }); // the crawl may have spent the paper cash on the ticket
    const p = px('BTC-USD'); ACC.buy('BTC-USD', p, 2000, now, { reason: 'v182 test', src: 'manual' }); ACC.pos['BTC-USD'].sl = p * 0.98;
    showTab('port'); await new Promise((r) => setTimeout(r, 400)); document.querySelector('[data-x182pf="book"][data-m="PAPER"]').click(); V182UI.Pf.render(true);
    const rows = () => [...document.querySelectorAll('#x182PosB .x182-tr:not([hidden])')], kp = () => [...document.querySelectorAll('#x182Kpis .x182-kpi b')].map((b) => b.textContent);
    const out = { tab: curTab, labels: [...document.querySelectorAll('#x182Kpis .x182-kpi span')].map((s) => s.textContent), kp: kp(), rows: rows().length, cells: rows()[0] && [...rows()[0].children].map((c) => c.textContent.slice(0, 40)), num: getComputedStyle(document.querySelector('#x182Kpis')).fontVariantNumeric };
    const r0 = rows().find((r) => /BTC-USD/.test(r.textContent)); if (!r0) return Object.assign(out, { err: 'no BTC row', pos: Object.keys(ACC.pos), cash: ACC.cash, px: p, rowsTxt: rows().map((r) => r.textContent.slice(0, 60)), book: V182UI.pfBook, tabNow: curTab }); const q0 = ACC.pos['BTC-USD'].qty; r0.querySelector('[data-x182pf="be"]').click(); out.be = ACC.pos['BTC-USD'].sl; const r1 = rows().find((r) => /BTC-USD/.test(r.textContent)); r1.querySelector('[data-x182pf="c50"]').click(); out.half = ACC.pos['BTC-USD'] ? ACC.pos['BTC-USD'].qty / q0 : 0;
    document.querySelector('[data-x182pf="book"][data-m="LIVE"]').click(); out.live = { rows: rows().length, kp: kp(), empty: document.querySelector('#x182Empty').textContent.slice(0, 60) };
    document.querySelector('[data-x182pf="book"][data-m="PAPER"]').click(); out.paperRows = rows().length;
    try { V182.agg({ PAPER: { cash: 1, pos: [{ sym: 'BTC-USD', qty: 1, entry: 1, mode: 'LIVE' }] } }); out.mix = 'accepted'; } catch (e) { out.mix = e.message; }
    let lane = null; try { lane = await V179UI.api('/api/lane26/agg', { books: { PAPER: { cash: 1, pos: [{ sym: 'BTC-USD', qty: 1, entry: 1, mode: 'LIVE' }] } } }); } catch (e) { lane = e.message; } out.laneMix = String(lane && lane.out ? 'accepted' : lane).slice(0, 80);
    out.src = document.querySelector('#x182PfSrc').textContent; out.aud = document.querySelector('#x182AudB').textContent.slice(0, 80);
    return out; });
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('[data-x182pf="csv"]'); const d1 = await dl;
  let csv = ''; try { const p = d1 && await d1.path(); csv = p ? require('fs').readFileSync(p, 'utf8') : ''; } catch (e) { csv = ''; }
  const pf2 = await ev(async () => { const r = [...document.querySelectorAll('#x182PosB .x182-tr:not([hidden])')].find((x) => /BTC-USD/.test(x.textContent)); if (r) r.querySelector('[data-x182pf="c100"]').click(); const gone = !ACC.pos['BTC-USD']; ACC.buy('ETH-USD', px('ETH-USD'), 500, Date.now(), { reason: 'v182 flat test', src: 'manual' }); V182UI.Pf.render(true); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return { gone, before: Object.keys(ACC.pos).length }; });
  await page.keyboard.press('Shift+Escape'); await page.waitForTimeout(250); const pf3 = await ev(() => ({ after: Object.keys(ACC.pos).length }));
  ok('v18.2 Portfolio & Risk Console: 4 tabular-nums KPIs (Net Liquidation Value · Available Buying Power · Total Open $ Risk to Stop · Day Realized + Unrealized PnL) and the open-positions table (Symbol, Side / Size, Avg Entry → Mark, Shadow Stop / TP1, $ Risk to Stop, Net PnL)', pf.tab === 'port' && pf.labels.join('|') === 'Net Liquidation Value|Available Buying Power|Total Open $ Risk to Stop|Day Realized + Unrealized PnL' && pf.rows >= 1 && pf.cells && /LONG/.test(pf.cells.join(' ')) && /→/.test(pf.cells.join(' ')) && /tabular-nums/.test(pf.num) && /\$/.test(pf.kp[2]), JSON.stringify(pf).slice(0, 700));
  ok('v18.2 PAPER and LIVE never mixed: the LIVE book shows only bot-ACKed fills (none here), a position tagged for the other book is refused by the page (V182.agg) and by Lane 26', pf.live.rows === 0 && pf.paperRows >= 1 && /mixed balances refused/.test(pf.mix) && /mixed balances refused/.test(pf.laneMix), JSON.stringify({ live: pf.live, mix: pf.mix, laneMix: pf.laneMix }));
  ok('v18.2 1-click Close 50 % halves the position, Close 100 % closes it, Stop → BE refuses a losing / flat position, Shift+Esc FLATTEN ALL closes every PAPER position', Math.abs(pf.half - 0.5) < 1e-6 && pf2.gone && pf2.before >= 1 && pf3.after === 0, JSON.stringify({ half: pf.half, be: pf.be, pf2, pf3 }));
  ok('v18.2 Closed Trades & SHA-256 audit + CSV export (formula-guarded, sha256-chain footer); Lane 26 confirms the page maths', !!d1 && /^State,Symbol,Side/.test(csv) && /# sha256-chain,[0-9a-f]{64}/.test(csv) && /local chain [0-9a-f]{16}/.test(pf.aud) && /Lane 26 [0-9.]+ ms/.test(pf.src), JSON.stringify({ file: d1 && d1.suggestedFilename(), head: csv.slice(0, 60), aud: pf.aud, src: pf.src }));

  /* 9 · Stocks / 0DTE populated + ≥ 80 ms hover pre-warm → chart open */
  await ev(() => { V177UI.go('alpha'); }); await waitFor(() => V180UI.data && V180UI.data.rows && V180UI.data.rows.length > 0, null, 30000);
  const sk = await ev(async () => { document.querySelector('[data-x180f="stocks"]').click(); await new Promise((r) => setTimeout(r, 120)); const n = document.querySelectorAll('#x180Feed .x180-card').length; document.querySelector('[data-x180f="all"]').click(); await new Promise((r) => setTimeout(r, 120)); return { n, ses: (await V179UI.api('/api/lane11/scan')).session }; });
  ok('v18.2 24/7 Alpha Recs · Stocks / 0DTE is populated (session-aware: ' + (sk.ses && sk.ses.session) + ')', sk.n > 0 && !!sk.ses, JSON.stringify(sk));
  const card = await ev(() => { const c = [...document.querySelectorAll('#x180Feed .x180-card')].find((x) => { const s = x.dataset.k.split('|')[0]; return V181.canon(s) !== ST.sel && !s.startsWith('oc:'); }); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 20, k: c.dataset.k }; });
  let hv = null;
  if (card) {
    await page.mouse.move(card.x, card.y); await page.waitForTimeout(140); await page.mouse.move(card.x + 4, card.y + 2); await page.waitForTimeout(1500);
    hv = await ev(async (k) => { const sym = V181.canon(k.split('|')[0]), warm = V182UI.hover.sym === sym, st = getStore(sym, ST.tf), loaded = st.loaded && st.candles.length > 0; const b = document.querySelector(`#x180Feed [data-x180a="chart"][data-k="${CSS.escape(k)}"]`); const t0 = performance.now(); b.click(); const sync = performance.now() - t0, now = ST.sel === sym && chart.data.length > 0 && chart.data === getStore(sym, ST.tf).candles; return { sym, warm, loaded, sync: Math.round(sync * 100) / 100, painted: now, warmed: V182UI.hover.warmed }; }, card.k);
  }
  ok('v18.2 ≥ 80 ms hover on an Alpha Recs card pre-warms its candles, so "Open on 1s–1M Chart" puts them on the chart synchronously (same click)', !!hv && hv.warm && hv.loaded && hv.painted, JSON.stringify(hv));

  /* 10 · Stocks EVO / Crypto-DEX EVO (Lanes 14 & 21) */
  const evo = await ev(async () => { const s0 = (await V179UI.api('/api/lane21/status')).out; let last = null; for (let i = 0; i < 10; i++) last = (await V179UI.api('/api/lane21/outcome', { sym: 'NVDA', r: i % 3 ? -1 : 2, exit: i % 3 ? 'stop' : 'tp2', score: 0.55 })).out; const s1 = (await V179UI.api('/api/lane21/status')).out; const rb = (await V179UI.api('/api/lane21/rollback', { book: 'stocks' })).out; const s2 = (await V179UI.api('/api/lane21/status')).out; return { v0: s0.stocks.ver, ev: last.evolved, v1: s1.stocks.ver, c0: s0.crypto.ver, c1: s1.crypto.ver, cp: JSON.stringify(s0.crypto.params) === JSON.stringify(s1.crypto.params), rb: rb.ver, p2: s2.stocks.params, p0: s0.stocks.params }; });
  ok('v18.2 Stocks EVO evolves after 10 attributed outcomes (bounded, drift-locked), Crypto/DEX EVO untouched (isolated books), 1-click rollback restores the previous generation', evo.v1 === evo.v0 + 1 && !!evo.ev && evo.c1 === evo.c0 && evo.cp && evo.rb === evo.v0 && JSON.stringify(evo.p2) === JSON.stringify(evo.p0), JSON.stringify(evo).slice(0, 500));
  ok('v18.2 desktop: zero console / page errors across the v18.2 flows (incl. the crawl)', errs.length === e0, errs.slice(e0, e0 + 5).join(' | '));
  await ev(() => { V177UI.go('copilot'); });
  return { crawl };
}

async function phone(ph, ok, errs) {
  const e0 = errs.length;
  await ph.evaluate(() => { for (const x of document.querySelectorAll('#langGate, #walkCard, #p2Brief, #v162Brief, #v163CardPill, #v164AvMenu, #x17Brief')) x.remove(); });
  await ph.evaluate(HELP, [UI_MS, SKIP.source]);
  await ph.waitForFunction(() => typeof V182UI !== 'undefined' && V182UI.mounted && document.querySelector('#x182Cl'), null, { timeout: 30000 });
  const q = await ph.evaluate(async () => {
    V177UI.go('copilot'); await new Promise((r) => setTimeout(r, 600)); const rail = document.querySelector('#x177Rail').getBoundingClientRect(), cl = getComputedStyle(document.querySelector('#x182Cl')).display;
    document.querySelector('[data-x17d="more"]').click(); await new Promise((r) => setTimeout(r, 300)); const row = [...document.querySelectorAll('#x17Sheet [data-x182m]')].map((b) => b.dataset.x182m); const pfb = document.querySelector('#x17Sheet [data-x182m="pf"]'); if (pfb) pfb.click(); await new Promise((r) => setTimeout(r, 500));
    const k = [...document.querySelectorAll('#x182Kpis .x182-kpi')].map((e) => e.getBoundingClientRect()), t = document.querySelector('#x182Pf').getBoundingClientRect();
    return { rail: rail.left >= 0 && rail.right <= innerWidth + 1, cl, row, tab: curTab, kfit: k.length === 4 && k.every((r) => r.left >= 0 && r.right <= innerWidth + 1), cols: new Set(k.map((r) => Math.round(r.left))).size, pfit: t.left >= 0 && t.right <= innerWidth + 1, hs: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  ok('v18.2 phone 390 × 844: the rail keeps its 5 tabs at full width (cluster folded into the dock More sheet: Portfolio · Zen · Refresh · Mesh), the console opens from it and its 4 KPIs fit in 2 columns, no horizontal scroll', q.rail && q.cl === 'none' && q.row.join() === 'pf,zen,refresh,mesh' && q.tab === 'port' && q.kfit && q.cols === 2 && q.pfit && !q.hs, JSON.stringify(q));
  const crawl = {}; for (const v of ['copilot', 'port']) crawl[v] = await ph.evaluate((v2) => __x182.crawl(v2, 160), v);
  const all = Object.values(crawl).flat();
  ok('v18.2 UI-speed crawl · phone 390 × 844 (Co-Pilot / Paper + Portfolio console): every visible control alive, error-free, < ' + UI_MS + ' ms', all.length >= 30 && crawlOk(all), crawlInfo(all));
  ok('v18.2 phone: zero console / page errors across the v18.2 flows', errs.length === e0, errs.slice(e0, e0 + 4).join(' | '));
  await ph.evaluate(() => { V177UI.go('copilot'); });
}
module.exports = { desktop, phone, UI_MS, SKIP };

if (require.main === module) {
  const { chromium } = require(process.platform === 'win32' ? 'C:/opt/npm-tools/node_modules/playwright' : '/opt/npm-tools/node_modules/playwright');
  const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
  const PORT = +process.env.EXTERM_E2E_PORT || 8879, BASE = 'http://127.0.0.1:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'xt182f-'));
  const CHROME = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  const res = [], errs = [], ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 1200)));
  const block = async (ctx) => { await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort())); await ctx.routeWebSocket((u) => !/^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), (ws) => ws.close()); };
  const watch = (p, tag) => { p.on('pageerror', (e) => errs.push(tag + ' PAGE ' + e.message)); p.on('dialog', (d) => { errs.push(tag + ' DIALOG ' + d.message()); d.dismiss(); }); p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|net::ERR_|WebSocket/.test(t)) errs.push(tag + ' CONSOLE ' + t); }); };
  (async () => {
    const srv = spawn(process.platform === 'win32' ? 'python' : 'python3', ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
    process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
    for (let i = 0; i < 80; i++) { const up = await new Promise((r) => http.get(BASE + '/', (s) => { s.resume(); r(true); }).on('error', () => r(false))); if (up) break; await new Promise((r) => setTimeout(r, 250)); }
    const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await block(ctx); await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => null);
      const page = await ctx.newPage(); page.setDefaultTimeout(15000); watch(page, 'DESK');
      const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
      const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);
      await page.goto(BASE + '/'); await page.waitForFunction(() => typeof V182UI !== 'undefined' && V182UI.mounted && typeof chart !== 'undefined' && chart && chart.data && chart.data.length > 60, null, { timeout: 90000 });
      const out = await desktop(page, ok, ev, waitFor, errs); if (process.env.X182_DUMP) fs.writeFileSync(process.env.X182_DUMP, JSON.stringify(out.crawl, null, 1));
      const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await block(m);
      const ph = await m.newPage(); watch(ph, 'PHONE'); await ph.goto(BASE + '/'); await ph.waitForFunction(() => typeof V182UI !== 'undefined' && V182UI.mounted && typeof V17Mob !== 'undefined' && V17Mob.mounted, null, { timeout: 90000 });
      await phone(ph, ok, errs); await m.close();
    } catch (e) { res.push('FAIL crashed: ' + String(e && e.message).split('\n').slice(0, 3).join(' | ')); } finally { await b.close(); }
    console.log(res.join('\n')); const f = res.filter((x) => x.startsWith('FAIL')).length; console.log(`\n${res.length - f}/${res.length} passed`); process.exit(f ? 1 : 0);
  })();
}
