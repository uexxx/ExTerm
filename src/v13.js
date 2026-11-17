/* ExTerm v13 glue: wires the v13 modules into the existing tabs (same pattern as v12.js). Loaded last. */

/* ───────────── first-run tour ───────────── */
const Tour = (() => {
  const T = { i: 0 };
  const STEPS = [
    ['#nav', 'Tabs', 'Everything lives in these tabs: Markets, Heat Map, Bots & Backtest, Portfolio, Wallet tracker, Social, Copilot and more.'],
    ['#modeSwitch', 'Markets', 'Switch between crypto, US stocks and on-chain DEX tokens. Every tool follows the market you pick.'],
    ['#chartHost', 'Chart', 'Scroll to zoom, drag to pan. The toolbar above has timeframes, indicators and drawing tools (Ctrl+Z undoes a drawing).'],
    ['#ticket', 'Paper trading', 'Buy and sell with paper money: market, limit and stop orders with stop-loss, take-profit and trailing stops. Nothing here is real money.'],
    ['#derivPanel', 'Perps (crypto)', 'Funding, open interest and liquidations for the selected coin, plus a paper futures ticket with long, short and leverage.'],
    ['#srcPill', 'Data status', 'Shows where prices come from. If it says simulated or shows a ⏸ badge, start the launcher for live data.'],
    [null, 'You’re set', 'Bots & Backtest has 100+ strategies (15 new ones in v13), background bots and the basket test. Settings has backups, API keys and the time zone. Have fun, and remember: it’s all paper.'],
  ];
  T.start = () => { T.i = 0; showTab('markets'); setTimeout(T.show, 250); };
  T.end = () => { const o = $('#tourOv'); if (o) o.remove(); ST.settings.tourDone = true; saveState(); document.removeEventListener('keydown', T.key); };
  T.key = (e) => { if (e.key === 'Escape') T.end(); else if (e.key === 'ArrowRight' || e.key === 'Enter') T.next(); else if (e.key === 'ArrowLeft') T.prev(); };
  T.next = () => { T.i++; if (T.i >= STEPS.length) T.end(); else T.show(); };
  T.prev = () => { T.i = Math.max(0, T.i - 1); T.show(); };
  T.show = () => {
    let ov = $('#tourOv'); if (!ov) { ov = document.createElement('div'); ov.id = 'tourOv'; ov.className = 'tour-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); document.addEventListener('keydown', T.key); }
    let [sel, title, body] = STEPS[T.i], el = sel ? $(sel) : null;
    if (el && (el.hidden || !el.offsetWidth)) el = null;
    if (el && el.scrollIntoView) { const q = el.getBoundingClientRect(); if (q.top < 0 || q.bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' }); } // a target below the fold (e.g. a taller ticket) comes into view first
    const r = el ? el.getBoundingClientRect() : null, pad = 6;
    const hole = r ? `<div class="tour-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '';
    const cw = 320, left = r ? Math.min(window.innerWidth - cw - 12, Math.max(12, r.left)) : (window.innerWidth - cw) / 2, top = r ? Math.min(window.innerHeight - 200, r.bottom + 180 < window.innerHeight ? r.bottom + 12 : Math.max(12, r.top - 170)) : window.innerHeight / 2 - 90;
    ov.innerHTML = `${hole}<div class="tour-card" style="left:${left}px;top:${top}px;width:${cw}px"><div class="note">${T.i + 1} / ${STEPS.length}</div><h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="row" style="justify-content:space-between"><button class="btn sm ghost" id="tourSkip">Skip tour</button><span><button class="btn sm" id="tourPrev" ${T.i ? '' : 'disabled'}>Back</button> <button class="btn sm pri" id="tourNext">${T.i === STEPS.length - 1 ? 'Done' : 'Next'}</button></span></div></div>`;
    $('#tourSkip').onclick = T.end; $('#tourPrev').onclick = T.prev; $('#tourNext').onclick = T.next; setTimeout(() => $('#tourNext').focus(), 20);
  };
  return T;
})();

/* ───────────── API keys hub (one place that shows every key and where to set it) ───────────── */
const KeysHub = (() => {
  const K = {};
  const LIST = [
    ['AI Copilot key', () => !!ST.ai.key || ST.ai.preset === 'ollamab', 'Smarter Copilot answers (OpenAI-compatible, Groq, OpenRouter…). Not needed with local AI.', 'set', 'aiKey'],
    ['Solana Tracker key', () => !!ST.settings.stKey, 'Live KOL leaderboard, exact wallet win rates and long wallet history. Free tier.', 'set', 'seStKey'],
    ['Helius key', () => !!ST.settings.heliusKey, 'Faster, deeper Solana wallet history. Free tier.', 'set', 'seHelKey'],
    ['Custom Solana RPC', () => !!ST.settings.solRpc, 'Your own RPC for the wallet tracker (fewer rate limits).', 'set', 'seSolRpc'],
    ['SEC contact email', () => !!ST.settings.secContact, 'Required by the SEC to read insider (Form 4) filings.', 'set', 'seSec'],
    ['Telegram / Discord', () => !!(Launcher.bg && (Launcher.bg.telegram || Launcher.bg.discord)), 'Background alerts, bot trades, wallet buys and social spikes sent to your phone. Needs the launcher.', 'set', 'bgTg'],
    ['X (Twitter) API token', () => !!(ST.social && ST.social.xToken), 'Adds X posts to Social Pulse. Paid X API plan.', 'social', 'soXTok'],
  ];
  K.panel = () => `<div class="panel" id="v13Keys"><h3>🔑 API keys &amp; connections</h3><div class="pb"><div class="note">Every key is optional. They're kept in this browser tab's session only (or in your encrypted key vault) and are never put in backups.</div>
    <table class="keys"><tbody>${LIST.map(([n, ok, why, tab, id], i) => `<tr><td><b>${n}</b><div class="note">${why}</div></td><td><span class="tag ${ok() ? 'up' : ''}">${ok() ? 'set' : 'not set'}</span></td><td class="r"><button class="btn sm" data-key-go="${i}">${ok() ? 'Edit' : 'Set up'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  K.go = (i) => { const [, , , tab, id] = LIST[i]; if (curTab !== tab) showTab(tab); setTimeout(() => { const el = $('#' + id); if (el && typeof V155S !== 'undefined' && V155S.reveal) V155S.reveal('#' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.classList.add('flash-field'); setTimeout(() => el.classList.remove('flash-field'), 1600); } else toast('That setting appears once the launcher is running', 'amb'); }, 200); };
  return K;
})();

/* ───────────── wiring ───────────── */
(function v13() {
  // storage safety first, so every later save goes through it
  SafeStore.wrap();
  setTimeout(() => SafeStore.auto(), 60000); setInterval(() => SafeStore.auto(), 6 * 3600e3);
  BgTick.start();
  setInterval(DataHealth.badge, 5000);

  // ── layout: new panels ──
  const after = (refSel, html) => { const r = $(refSel); if (r && !document.getElementById((html.match(/id="([^"]+)"/) || [])[1])) r.insertAdjacentHTML('afterend', html); };
  after('#ticket', '<div class="panel" id="derivPanel" hidden></div><div class="panel" id="tokenCard" hidden></div>');
  after('#builder', '<div class="panel" id="bgBots"></div><div class="panel" id="basket"></div>');
  const trSide = $('#trCopy') && $('#trCopy').closest('.side-col'); if (trSide && !$('#wpPanel')) trSide.insertAdjacentHTML('afterbegin', '<div class="panel" id="wpPanel"></div>');
  const soSide = $('#soSrcs') && $('#soSrcs').closest('.side-col'); if (soSide && !$('#spPanel')) soSide.insertAdjacentHTML('afterbegin', '<div class="panel" id="spPanel"></div>');
  const hh = $('#heatHost'); if (hh && !$('#rdBar')) { hh.insertAdjacentHTML('beforebegin', '<div id="rdBar"></div>'); hh.insertAdjacentHTML('afterend', '<div id="rdBody" hidden></div>'); }

  // ── markets: perps panel + token card ──
  const mk = TABS.markets, mkShow = mk.show && mk.show.bind(mk);
  mk.show = function () { if (mkShow) mkShow(); Futures.render(true); TokenCard.render(); };
  const _sel = selectSym;
  selectSym = function (sym, noSave) { const r = _sel.apply(this, arguments); if (curTab === 'markets') { Futures.render(true); TokenCard.render(); } return r; };
  const _pool = renderPoolStats; let tcLast = 0;
  renderPoolStats = function (s) { _pool.apply(this, arguments); if (Date.now() - tcLast > 4000) { tcLast = Date.now(); TokenCard.render(); } };
  Futures.start();
  document.addEventListener('keydown', (e) => {
    if (curTab !== 'markets' || !chart || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z', y = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'));
    if (y) { e.preventDefault(); if (chart.redoOne()) { ST.draw[ST.sel] = chart.drawings.slice(); saveState(); } }
    else if (z) { e.preventDefault(); if (chart.undo()) { ST.draw[ST.sel] = chart.drawings.slice(); saveState(); } }
  });

  // ── heat map: Launch Radar ──
  const _oc = renderOcHeat;
  renderOcHeat = function (relayout) {
    const bar = $('#rdBar'), body = $('#rdBody'), host = $('#heatHost'), o = ST.radar || (ST.radar = { view: 'tiles', sort: 'new', minLiq: 5000, socials: false });
    if (bar && !bar.contains(document.activeElement)) { const h = Radar.toolbar().replace(/id="rdNote">[^<]*/, ''); if (h !== bar._h) { bar._h = h; bar.innerHTML = Radar.toolbar(); Radar.bindBar(bar); } }
    if (o.view === 'tiles') { if (body) body.hidden = true; if (host) host.hidden = false; return _oc.apply(this, arguments); }
    if (host) host.hidden = true; if (body) body.hidden = false;
    Radar.render(); Radar.refresh(false).then(() => { if (curTab === 'heat' && o.view !== 'tiles') Radar.render(); const n = $('#rdNote'); if (n) n.textContent = Radar.note(); });
  };
  const _rh = renderHeat;
  renderHeat = function () { const bar = $('#rdBar'), body = $('#rdBody'); if (ST.heat.asset !== 'onchain') { if (bar) { bar.innerHTML = ''; bar._h = ''; } if (body) body.hidden = true; const h = $('#heatHost'); if (h) h.hidden = false; } return _rh.apply(this, arguments); };
  const rdb = $('#rdBody'); if (rdb) { rdb.onclick = (e) => { const r = e.target.closest('[data-oc]'); if (r) openSym(r.dataset.oc); }; rdb.onkeydown = (e) => { const r = e.target.closest('[data-oc]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSym(r.dataset.oc); } }; }
  setInterval(() => { if (curTab === 'heat' && !document.hidden && ST.heat.asset === 'onchain' && ST.radar && ST.radar.view !== 'tiles') renderOcHeat(false); }, 30000);

  // ── bots & backtest: background bots, basket test, regime breakdown, short labels ──
  const bt = TABS.bots, btShow = bt.show.bind(bt);
  bt.show = function () { btShow(); BgBotsUI.render(); Basket.render(); BgBotsUI.refresh(); };
  const _rs = renderSetup; renderSetup = function () { const r = _rs.apply(this, arguments); if (curTab === 'bots') Basket.render(); return r; };
  const _bt = renderBtResult;
  renderBtResult = function (res, S, sym, candles) {
    const r = _bt.apply(this, arguments);
    try {
      const host = $('#btResult');
      if (host && candles && candles.length > 60) host.insertAdjacentHTML('beforeend', `<div class="pb">${res.short ? '<div class="note"><span class="tag dn">SHORT</span> This strategy sells first and buys back later: it profits when price falls. Buy markers are short entries, sell markers are covers.</div>' : ''}${Regime.html(res.trades, candles)}</div>`);
    } catch (e) { console.warn('regime', e); }
    return r;
  };

  // ── wallet tracker ──
  WalletPro.wrapAdd();
  Sol.listeners.push((ev) => { try { WalletPro.onTrade(ev); } catch (e) { /* never break the feed */ } });
  setInterval(() => { if (!Sol.sim) WalletPro.checkClusters(); if (curTab === 'whales' && $('#wpPanel') && $('#wpPanel').offsetWidth && !$('#wpPanel').contains(document.activeElement)) WalletPro.renderPanel(); }, 30000);
  const _rd = renderDrawer;
  renderDrawer = function () {
    const r = _rd.apply(this, arguments); const w = Sol.byAddr(tr.drawer);
    if (w && $('#dBody') && !$('#cbRun')) { $('#dBody').insertAdjacentHTML('beforeend', WalletPro.drawerHtml(w)); WalletPro.bindDrawer(w); }
    return r;
  };
  const _disc = renderDiscover;
  renderDiscover = function () {
    if (disc.src2 === 'trending') return renderDiscoverTrending();
    const r = _disc.apply(this, arguments); const b = $('#dBody');
    if (b && !tr.drawer) b.insertAdjacentHTML('afterbegin', discSwitch());
    bindDiscSwitch(); return r;
  };
  window.discSwitch = () => `<div class="seg" id="dsSrc2" style="margin-bottom:8px"><button data-v="kol" class="${disc.src2 !== 'trending' ? 'on' : ''}">🏆 KOL leaderboard</button><button data-v="trending" class="${disc.src2 === 'trending' ? 'on' : ''}">🔥 Active on trending tokens (live)</button></div>`;
  window.bindDiscSwitch = () => { const s = $('#dsSrc2'); if (s) s.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; disc.src2 = b.dataset.v; renderDiscover(); if (disc.src2 === 'trending' && !disc.trows) loadDiscoverTrending(); }; };
  window.loadDiscoverTrending = async () => {
    disc.tbusy = true; renderDiscover();
    try { disc.trows = await WalletPro.discoverTrending((t) => { disc.tprog = t; if (disc.src2 === 'trending') renderDiscover(); }); } catch (e) { disc.trows = []; disc.terr = e.message; }
    disc.tbusy = false; renderDiscover();
  };
  window.renderDiscoverTrending = () => {
    if (tr.drawer) return; const have = new Set(Sol.wallets.map((w) => w.addr)), rows = (disc.trows || []).filter((r) => !r.bot || disc.tbots);
    $('#dBody').innerHTML = discSwitch() + `<div class="note" style="margin-bottom:8px">Wallets buying <b>2 or more</b> of today's trending Solana tokens right now, from public DEX trade feeds (no key needed). Busy wallets with 40+ trades in the sample are usually bots and are hidden.</div>
      <div class="row" style="margin-bottom:8px;gap:8px"><button class="btn sm" id="dtReload" ${disc.tbusy ? 'disabled' : ''}>↻ Refresh</button><label class="chk"><input type="checkbox" id="dtBots" ${disc.tbots ? 'checked' : ''}> show bot-like wallets</label><span class="sp" style="flex:1"></span><button class="btn sm pri" id="dtAddAll" ${rows.length ? '' : 'disabled'}>Add top 20</button></div>
      ${disc.tbusy ? `<div class="empty">${esc(disc.tprog || 'Loading…')}</div>` : rows.length ? `<table><thead><tr><th>Wallet</th><th>Tokens bought</th><th class="r">Bought</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${esc(Sol.short(r.addr))}${r.bot ? ' <span class="tag amb">bot?</span>' : ''}</td><td class="note">${r.tokens.slice(0, 4).map(esc).join(', ')}${r.tokens.length > 4 ? ' +' + (r.tokens.length - 4) : ''}</td><td class="r num">${NT.fmtUSD(r.buyUsd, 0)}</td><td class="r">${have.has(r.addr) ? '<span class="note">tracked</span>' : `<button class="btn sm" data-dtadd="${esc(r.addr)}">Add</button>`}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${disc.terr ? 'Couldn’t load trades: ' + esc(disc.terr) : 'No wallets found yet. Try refresh.'}</div>`}
      <div class="note" style="margin-top:8px">Being active on hot tokens is not the same as being good. Add a few, let the tracker collect their trades, then check their Score v2 and copy-backtest before trusting them.</div>`;
    bindDiscSwitch();
    $('#dtReload').onclick = loadDiscoverTrending; $('#dtBots').onchange = (e) => { disc.tbots = e.target.checked; renderDiscover(); };
    const add = (list) => { const r = Sol.load(list.map((x) => ({ trackedWalletAddress: x.addr, name: '🔥 ' + Sol.short(x.addr) + ' · ' + x.tokens.slice(0, 2).join('/'), emoji: '🔥', alertsOn: false }))); toast(`Added ${r.added} wallet${r.added === 1 ? '' : 's'}`, 'up'); saveState(); renderDiscover(); };
    $('#dtAddAll').onclick = () => add(rows.filter((r) => !have.has(r.addr) && !r.bot).slice(0, 20));
    $('#dBody').querySelectorAll('[data-dtadd]').forEach((b) => { b.onclick = () => add(rows.filter((r) => r.addr === b.dataset.dtadd)); });
  };

  // ── social ──
  const _sf = soFiltered; soFiltered = function () { return SocialPro.visible(_sf.apply(this, arguments)); };
  const _tr = Social.trends; Social.trends = function (market, win) { const all = Social.posts; if (!(ST.social && ST.social.hideSpam !== false)) return _tr.call(Social, market, win); Social.posts = all.filter((p) => !p.spam); try { return _tr.call(Social, market, win); } finally { Social.posts = all; } };
  const _rso = renderSocial;
  renderSocial = function (force) {
    SocialPro.flag(Social.posts);
    const r = _rso.apply(this, arguments);
    const host = $('#spPanel'); if (host && curTab === 'social' && !host.contains(document.activeElement)) { const h = SocialPro.panel(soMarket()); if (h !== host._h) { host._h = h; host.innerHTML = h; SocialPro.bind(host); } }
    return r;
  };
  setInterval(() => { if (Social.posts.length) { SocialPro.flag(Social.posts); SocialPro.checkSpikes('crypto'); SocialPro.checkSpikes('stocks'); if (ST.social && ST.social.aiSent) SocialPro.aiSentiment(); } }, 60000);

  // ── Copilot knows your journal, perps, wallets and background bots ──
  const _ctx = aiContext;
  aiContext = function () {
    const c = _ctx.apply(this, arguments);
    try {
      const J0 = typeof Journal !== 'undefined' && Array.isArray(Journal.entries) ? Journal.entries : [];
      if (J0.length && typeof Journal.review === 'function') { const R = Journal.review(J0); if (R.n) c.journal = { closedTrades: R.n, winRate: R.winRate != null ? +(+R.winRate).toFixed(1) : null, totalPnl: +(+R.pnl || 0).toFixed(2), habits: (R.insights || []).slice(0, 5).map((x) => x.title + (x.detail ? ': ' + x.detail : '')) }; }
      const F = ST.fut; if (F && Object.keys(F.pos || {}).length) c.paperPerps = { freeMargin: +F.cash.toFixed(2), positions: Object.entries(F.pos).map(([s, p]) => ({ s, side: p.side, lev: +p.lev.toFixed(1), entry: p.entry, liq: p.liq, margin: +p.margin.toFixed(2) })) };
      if (Sol.wallets.length) c.trackedWallets = { count: Sol.wallets.length, topGraded: Sol.wallets.map((w) => ({ name: w.name || Sol.short(w.addr), s: WalletPro.score(w) })).filter((x) => x.s.grade !== '?').sort((a, b) => b.s.score - a.s.score).slice(0, 5).map((x) => ({ name: x.name, grade: x.s.grade, score: x.s.score })), clusters: WalletPro.clusters().slice(0, 3).map((x) => ({ token: (Sol.tokens[x.mint] || {}).sym || x.mint.slice(0, 6), wallets: x.independent, weight: +x.weight.toFixed(1) })) };
      if (BgBotsUI.list.length) c.backgroundBots = BgBotsUI.list.map((b) => ({ name: b.name, status: b.status, equity: b.equity, capital: b.capital }));
      const d = Deriv.cache[Deriv.baseFor(ST.sel)]; if (ST.mode === 'crypto' && d) c.derivatives = { funding8hPct: d.v.funding8h, openInterestUsd: d.v.oiUsd, longShortRatio: d.v.ls, src: d.v.src };
    } catch (e) { /* context extras are best effort */ }
    return c;
  };

  // ── settings: data status, backups, keys, time zone, tour ──
  const _set = renderSettings;
  renderSettings = function () {
    const r = _set.apply(this, arguments), host = $('#tab-set');
    if (host && !$('#v13Set')) {
      const tz = ST.settings.tz || 'local', zones = [['local', 'This computer'], ['UTC', 'UTC'], ['America/New_York', 'New York (US stocks)'], ['America/Chicago', 'Chicago'], ['America/Los_Angeles', 'Los Angeles'], ['Europe/London', 'London'], ['Europe/Berlin', 'Berlin'], ['Asia/Singapore', 'Singapore'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney']];
      const wrap = document.createElement('div'); wrap.id = 'v13Set'; wrap.className = 'v13-set';
      wrap.innerHTML = DataHealth.panel() + SafeStore.panel() + KeysHub.panel() + `<div class="panel"><h3>🕒 Time zone &amp; help</h3><div class="pb"><label class="f">Show times in<select class="in" id="v13Tz">${zones.map(([v, l]) => `<option value="${v}" ${v === tz ? 'selected' : ''}>${l}</option>`).join('')}</select></label><div class="note">Applies to chart time labels, the journal, trades and alerts.</div><div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" id="v13Tour">Take the tour again</button></div></div></div>`;
      const first = host.querySelector('.panel'); if (first) first.parentNode.insertBefore(wrap, first); else host.appendChild(wrap);
      SafeStore.bind();
      $('#v13Intro').onclick = () => DataHealth.intro(true);
      const jd = $('#v13JnDl'); if (jd) jd.onclick = async () => { // the full journal log kept on this computer, as CSV
        try {
          const list = await J.get('/api/journal', { timeout: 30000 }); if (!Array.isArray(list)) throw new Error('unexpected reply');
          const q = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; }; // no spreadsheet formulas
          const cols = ['ts', 'sym', 'side', 'price', 'qty', 'usd', 'pnl', 'pnlPct', 'held', 'src', 'reason', 'tags', 'mood', 'notes'];
          const rows = list.map((e) => cols.map((c) => q(c === 'ts' ? new Date(e.ts).toISOString() : c === 'tags' ? (e.tags || []).join(' ') : e[c])).join(','));
          download('exterm-journal-log-' + new Date().toISOString().slice(0, 10) + '.csv', cols.join(',') + '\n' + rows.join('\n'), 'text/csv');
          toast(`Downloaded ${list.length} journal entries ✓`, 'up');
        } catch (e) { toast('Journal log download failed: ' + esc(e.message), 'dn'); }
      };
      $('#v13Tz').onchange = (e) => { ST.settings.tz = e.target.value; TZ.set(ST.settings.tz); saveState(); if (chart) chart.invalidate(); toast('Time zone updated', 'up'); };
      $('#v13Tour').onclick = () => Tour.start();
      wrap.querySelectorAll('[data-key-go]').forEach((b) => { b.onclick = () => KeysHub.go(+b.dataset.keyGo); });
      SafeStore.list().then(() => { const p = $('#v13Store'); if (p && curTab === 'set') { p.outerHTML = SafeStore.panel(); SafeStore.bind(); } });
    }
    return r;
  };



  // ── after boot (ST loaded, chart created, launcher detected) ──
  const _boot = boot;
  boot = async function () {
    await _boot.apply(this, arguments);
    TZ.set(ST.settings.tz);
    if (typeof DiskSync !== 'undefined') DiskSync.start().catch((e) => console.warn('disk sync', e));
  if (typeof chart !== 'undefined' && chart) {
    chart.overlays.push(SocialPro.overlay);
    chart.onText = (pt, cx, cy) => {
      const box = document.createElement('div'); box.className = 'txt-pop'; box.style.left = Math.min(window.innerWidth - 230, cx) + 'px'; box.style.top = cy + 'px';
      box.innerHTML = '<input class="in" maxlength="60" placeholder="Note… (Enter to place)" aria-label="Chart note">'; document.body.appendChild(box);
      const inp = box.querySelector('input'), t0 = Date.now(); setTimeout(() => inp.focus(), 20); // after the canvas click finishes
      let fin = false; const done = (ok) => { if (fin) return; fin = true; const v = inp.value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60); box.remove(); if (ok && v) chart.addDrawing({ type: 'txt', t: pt.t, p: pt.p, text: v }); chart.invalidate(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }; inp.onblur = () => { if (Date.now() - t0 < 500) setTimeout(() => inp.focus(), 0); else done(true); };
    };
  }
  // ── installable app (only when served by the launcher; file:// pages can't register a service worker) ──
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator && J.proxy) {
    if (!document.querySelector('link[rel="manifest"]')) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest'; document.head.appendChild(l); }
    navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ });
  }
  // small screens: a lighter, touch-friendly layout
  const mq = window.matchMedia('(max-width: 760px)'), mob = () => document.documentElement.classList.toggle('is-mobile', mq.matches);
  mob(); if (mq.addEventListener) mq.addEventListener('change', mob);
  // first run: live-data screen, then the tour (not shown to automated test browsers)
  if (!navigator.webdriver) setTimeout(() => { DataHealth.intro(false); if (!ST.settings.tourDone && !$('.v13-modal')) setTimeout(() => { if (!ST.settings.tourDone && !$('.v13-modal')) Tour.start(); }, 600); }, 4500);
    setTimeout(() => BgBotsUI.start(), 4000);
    setTimeout(() => WalletPro.renderPanel(), 3000);
    window.__exterm_v13 = true;
  };
})();
