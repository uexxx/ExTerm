/* ExTerm app — part D: global Crypto/Stocks switch, stock heat map, Solana wallet tracker (terminal style),
   SEC insider tracker, copy-trade bot */

/* ───────────── global market switch ───────────── */
function fillSymList() {
  const opts = ST.mode === 'onchain' ? [] : ST.mode === 'stocks'
    ? Object.values(STOCK_INFO).map((s) => `<option value="${s.sym}">${esc(s.name)}</option>`)
    : (Providers.list || []).map((p) => `<option value="${p.base}">${p.id}</option>`);
  $('#symList').innerHTML = opts.join('');
  $('#symInput').placeholder = ST.mode === 'stocks' ? 'Ticker, e.g. NVDA' : ST.mode === 'onchain' ? 'Token name or contract address' : 'Symbol, e.g. ETH';
}
function applyModeChrome() {
  const st = ST.mode === 'stocks', oc = ST.mode === 'onchain';
  document.body.classList.toggle('mode-stocks', st); document.body.classList.toggle('mode-crypto', !st && !oc); document.body.classList.toggle('mode-onchain', oc);
  $$('#modeSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === ST.mode));
  $('#navTrack').textContent = st ? 'Insider Tracker' : 'Wallet Tracker';
  $('#navMode').textContent = st ? 'US stocks & ETFs · ' + Stocks.active.name : oc ? 'On-chain DEX tokens · ' + (OC.sim ? 'simulated' : OC.name) : 'Crypto · ' + Providers.active.name;
  ST.heat.asset = ST.mode;
  const wa = $('#wlAdd'); if (wa) wa.placeholder = oc ? 'Add token: name, ticker or contract…' : 'Add symbol…';
}
function setMode(m, sel) {
  if (m !== 'crypto' && m !== 'stocks' && m !== 'onchain') return;
  const seq = setMode.seq = (setMode.seq || 0) + 1; // a later mode choice cancels a still-loading first on-chain visit
  if (m === 'onchain') {
    const k = ST.mk.onchain || (ST.mk.onchain = { watch: [], sel: null, tf: '5m' });
    if (!sel && (!k.sel || !k.watch.length)) { // first visit: fill the watchlist with today's trending pools, then switch
      if (setMode.busy) { setMode.pend = seq; return; } setMode.busy = true; setMode.pend = 0; toast('Loading trending on-chain tokens…');
      OC.discover('trending').then((syms) => { const top = syms.slice(0, 10); if (!k.watch.length) k.watch = top.slice(); k.sel = k.sel || top[0]; }).catch(() => {}).finally(() => { setMode.busy = false; if (setMode.seq !== seq && setMode.seq !== setMode.pend) return; if (k.sel) setMode('onchain'); else toast('No on-chain tokens available right now', 'amb'); });
      return;
    }
    if (sel && !k.watch.includes(sel) && ST.mode !== 'onchain') k.watch.unshift(sel);
  }
  if (m !== ST.mode) {
    ST.mk[ST.mode] = { watch: ST.watch, sel: ST.sel, tf: ST.tf };
    ST.mode = m; const k = ST.mk[m];
    ST.watch = k.watch; ST.sel = sel || k.sel; ST.tf = k.tf;
  } else if (sel) ST.sel = sel;
  applyModeChrome(); fillSymList();
  if (chart) {
    if (!tfList().includes(ST.tf)) ST.tf = '1m';
    segBtns($('#tfBtns'), tfList().map((v) => ({ v, l: v })), ST.tf, (v) => { ST.tf = v; ensureSym(ST.sel); chartRefresh(true); saveState(); });
    Feed.subscribe(ST.watch); selectSym(ST.sel, true); renderMode();
  }
  // every tab follows the switch
  if (typeof heat !== 'undefined') { heat.W = 0; buildHeatControls(); }
  if (typeof renderSetup === 'function' && $('#botForm').innerHTML) renderSetup(); // the bot/backtest market stays whatever you picked: any crypto or stock in either mode
  scr.rows = []; news.items = []; news.ts = 0; heat.fngMode = null; lab.mkt = null; if (lab.uni === 'crypto' || lab.uni === 'stocks' || lab.uni === 'onchain') lab.uni = null;
  const t = TABS[curTab]; if (t) { if (t.show) t.show(); if (t.render) t.render(); }
  saveState();
}
function marketStatus(sym) {
  if (isOnchain(sym)) return OC.sim || OC.parse(sym).chain === 'sim' ? 'simulated' : '24/7 on-chain';
  if (!isStock(sym)) return Providers.active === Demo ? 'simulated' : '24/7';
  if (Stocks.active === StockDemo) return 'simulated';
  const s = StockFeed.session[sym]; return s == null ? 'checking…' : s ? 'market open' : 'market closed';
}
function renderMode() {
  const el = $('#mkMode'); if (!el) return;
  const st = ST.mode === 'stocks', ms = marketStatus(ST.sel);
  el.textContent = st ? `${Stocks.active.name} · ${ms}` : isOnchain(ST.sel) ? `DEX · ${ms}` : `${Providers.active.name} · ${ms}`;
  el.className = 'tag ' + (ms === 'simulated' ? 'amb' : ms === 'market closed' ? '' : 'up');
}

/* ───────────── stock heat map (grouped by sector) ───────────── */
const sheat = { q: {}, ts: 0, loading: false, err: '' };
async function loadStockHeat(force) {
  if (sheat.loading || (!force && sheat.ts && Date.now() - sheat.ts < 60000)) return;
  sheat.loading = true; $('#heatNote').textContent = 'Loading stock quotes…';
  try { const rows = await Stocks.active.quotes(STOCKS.map((s) => s[0])); for (const r of rows) if (r && r.price) sheat.q[r.sym] = r; sheat.ts = Date.now(); sheat.err = ''; }
  catch (e) { sheat.err = e.message; }
  sheat.loading = false; renderHeat(true);
}
function renderStockHeat(relayout) {
  const host = $('#heatHost'); if (!host.clientWidth) return;
  const W = host.clientWidth, H = host.clientHeight, sc = 3;
  $('#heatScale').textContent = '±3% = full colour';
  const items = STOCKS.map(([s, n, sec, sh]) => { const q = sheat.q[s], lv = Feed.live[s]; const price = (lv && lv.price) || (q && q.price); const prev = (lv && lv.open24) || (q && q.prev); return { sym: s, name: n, sector: sec, price, ch: price && prev ? (price / prev - 1) * 100 : q ? q.ch : null, value: Math.max(1, sh * (price || STOCK_INFO[s].demo)) }; });
  const bySec = {}; for (const it of items) (bySec[it.sector] = bySec[it.sector] || []).push(it);
  if (relayout || W !== heat.W || H !== heat.H || !host.querySelector('.tile[data-stock]')) {
    heat.W = W; heat.H = H; heat.tiles = {}; host.innerHTML = '';
    const secRects = NT.treemap(Object.entries(bySec).map(([k, v]) => ({ value: v.reduce((s, x) => s + x.value, 0), k, v })), 0, 0, W, H);
    for (const sr of secRects) {
      const lab = sr.h > 46 && sr.w > 60, hdr = lab ? 15 : 0;
      if (lab) { const l = document.createElement('div'); l.className = 'seclab'; l.style.cssText = `left:${sr.x}px;top:${sr.y}px;width:${sr.w}px`; l.textContent = sr.item.k; host.appendChild(l); }
      for (const r of NT.treemap(sr.item.v.map((d) => ({ value: d.value, d })), sr.x, sr.y + hdr, sr.w, sr.h - hdr)) {
        const d = r.item.d, el = document.createElement('div'); el.className = 'tile';
        el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        const m = Math.min(r.w, r.h), fs = Math.max(9, Math.min(26, m / 4));
        el.innerHTML = `<b style="font-size:${fs}px">${esc(d.sym)}</b><span class="pc" style="font-size:${Math.max(9, fs * 0.62)}px"></span>${m > 70 && r.w > 80 ? `<span class="pr" style="font-size:${Math.max(9, fs * 0.5)}px;opacity:.8"></span>` : ''}`;
        if (m < 26) el.querySelector('.pc').style.display = 'none';
        el.dataset.sym = d.sym; el.dataset.stock = '1'; host.appendChild(el); heat.tiles[d.sym] = el;
      }
    }
  }
  let up = 0, n = 0, best = null, worst = null; const secAgg = {};
  for (const d of items) {
    const el = heat.tiles[d.sym]; if (!el) continue;
    el.style.background = heatColor(d.ch, sc); el.querySelector('.pc').textContent = d.ch == null ? '–' : NT.fmtPct(d.ch);
    const pr = el.querySelector('.pr'); if (pr) pr.textContent = d.price ? NT.fmtPrice(d.price) : '';
    el._d = { sym: d.sym, name: d.name, price: d.price, ch: d.ch, i: { ch24h: d.ch, mcap: d.value, sector: d.sector } };
    if (d.ch != null) { n++; if (d.ch > 0) up++; if (!best || d.ch > best.ch) best = d; if (!worst || d.ch < worst.ch) worst = d; const a = secAgg[d.sector] || (secAgg[d.sector] = { w: 0, s: 0 }); a.w += d.value; a.s += d.value * d.ch; }
  }
  const secs = Object.entries(secAgg).map(([k, a]) => [k, a.s / a.w]).sort((a, b) => b[1] - a[1]);
  const stat = (k, v, s, c) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${esc(v)}</span><span class="s">${esc(s)}</span></div>`;
  let h = '';
  for (const s of ['SPY', 'QQQ', 'DIA']) { const lv = Feed.live[s], c = lv && lv.open24 ? (lv.price / lv.open24 - 1) * 100 : null; if (lv) h += stat(s, NT.fmtPrice(lv.price), c == null ? '' : NT.fmtPct(c) + ' today', cls(c)); }
  if (n) h += stat('Breadth', Math.round((up / n) * 100) + '% green', `${up} up · ${n - up} down`, up / n > 0.5 ? 'up' : 'dn');
  if (secs.length) h += stat('Best sector', secs[0][0], NT.fmtPct(secs[0][1]), 'up') + stat('Worst sector', secs[secs.length - 1][0], NT.fmtPct(secs[secs.length - 1][1]), 'dn');
  if (best) h += stat('Top gainer', best.sym, NT.fmtPct(best.ch), 'up') + stat('Top loser', worst.sym, NT.fmtPct(worst.ch), 'dn');
  $('#heatStats').innerHTML = h;
  $('#heatNote').textContent = sheat.err ? 'Could not load stock quotes: ' + sheat.err : `Source: ${Stocks.active.name}${Stocks.active === StockDemo ? ' (prices are made up, so run serve.py for real quotes)' : ''} · ${STOCKS.length} large US stocks grouped by sector, sized by approximate market cap · daily change vs previous close · updated ${sheat.ts ? fmtClock(sheat.ts) : '–'}`;
}

/* ───────────── copy-trade paper bot ───────────── */
let COPY = null;
const copyPos = () => Object.keys(COPY.pos);
function copyEquity() { let e = COPY.cash; for (const m in COPY.pos) { const p = COPY.pos[m], px_ = Sol.priceOf(m); e += px_ ? p.qty * px_ : p.cost; } return e; }
function copyQualifies(ev) { const c = ST.copy; if (c.who === 'alerts') return ev.alerts; return true; }
function copyOnTrade(ev) {
  const c = ST.copy; if (!c.on || ev.hist || !ev.mint) return;
  const now = Date.now();
  if (ev.side === 'buy' && copyQualifies(ev) && !COPY.pos[ev.mint]) {
    const sizeOk = (ev.sol || 0) >= c.minSol || (ev.usd || 0) >= c.minSol * (Sol.solPx || 150);
    if (!sizeOk || copyPos().length >= c.max || COPY.cash < 1) return;
    const price = Sol.priceOf(ev.mint) || ev.px; if (!price) return;
    const t = COPY.buy(ev.mint, price, Math.min(c.usd, COPY.cash), now, { reason: `copied ${ev.emoji || ''} ${ev.name || Sol.short(ev.wallet)}`, src: 'copy', slPct: c.sl / 100 || 0, tpPct: c.tp / 100 || 0 });
    if (t) { COPY.pos[ev.mint].from = ev.wallet; t.tok = Sol.tokName(ev.mint); toast(`🧬 Copy-bot <b>BUY</b> ${esc(t.tok)} for ${NT.fmtUSD(t.usd, 0)} after ${esc(ev.emoji || '')} ${esc(ev.name || '')}`, 'up'); }
  } else if (ev.side === 'sell' && c.mirror && COPY.pos[ev.mint] && COPY.pos[ev.mint].from === ev.wallet) {
    const price = Sol.priceOf(ev.mint) || ev.px || (COPY.pos[ev.mint].cost / COPY.pos[ev.mint].qty);
    const t = COPY.sell(ev.mint, price, null, now, { reason: `mirrored sell by ${ev.name || Sol.short(ev.wallet)}`, src: 'copy' });
    if (t) { t.tok = Sol.tokName(ev.mint); toast(`🧬 Copy-bot <b>SELL</b> ${esc(t.tok)} (mirrored) · P&L <b class="${cls(t.pnl)}">${NT.fmtUSD(t.pnl)}</b>`, t.pnl >= 0 ? 'up' : 'dn'); }
  }
}
function copyTick() {
  const now = Date.now();
  for (const m of copyPos()) {
    const p = Sol.priceOf(m); if (!p) continue;
    const t = COPY.checkExits(m, p, p, now, { open: p, src: 'copy' });
    if (t) { t.tok = Sol.tokName(m); toast(`🧬 Copy-bot ${esc(t.reason)}: ${esc(t.tok)} · P&L <b class="${cls(t.pnl)}">${NT.fmtUSD(t.pnl)}</b>`, t.pnl >= 0 ? 'up' : 'dn'); }
  }
}

/* ───────────── Solana wallet tracker UI ───────────── */
let whView = 'tracker', tr = { filter: 'swaps', minSol: 0, q: '', wq: '', walerts: false, sort: 'score', tier: 'all', hotWin: 60, dirty: true, wdirty: true, hold: 0, busyHist: {}, seen: new Set(), flash: {}, drawer: null };
const ago = (ms) => { if (!ms) return '–'; const s = (Date.now() - ms) / 1000; return s < 60 ? Math.max(0, Math.floor(s)) + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const solscan = (k, v) => `https://solscan.io/${encodeURIComponent(k)}/${encodeURIComponent(String(v || ''))}`; // encoded: signatures/addresses come from remote RPC responses
function avatar(m, small) {
  const t = Sol.tokens[m] || {}, name = t.sym || (m ? m.slice(0, 2) : 'SOL'), h = m ? hash(m) : 0, c1 = `hsl(${h % 360} 70% 45%)`, c2 = `hsl(${(h >> 8) % 360} 70% 35%)`;
  return `<span class="av ${small ? 'sm' : ''}" style="background:linear-gradient(135deg,${c1},${c2})">${t.img && safeUrl(t.img, '', true) ? `<img src="${safeUrl(t.img, '', true)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-rm="1">` : ''}${t.img && safeUrl(t.img, '', true) ? '' : esc(String(name).slice(0, 2).toUpperCase())}</span>`;
}
function tokLink(m) { const t = Sol.tokens[m] || {}; return `<a href="${safeUrl(t.url, 'https://dexscreener.com/solana/' + m)}" target="_blank" rel="noopener noreferrer"><b>${esc(t.sym || Sol.short(m))}</b></a>`; }
function tradeCard(t) {
  const isNew = !tr.seen.has(t.id); tr.seen.add(t.id);
  const side = t.side === 'buy' ? '<span class="side-b">BUY</span>' : t.side === 'sell' ? '<span class="side-s">SELL</span>' : `<span class="tag">${esc(t.side.replace('_', ' '))}</span>`;
  const tk = Sol.tokens[t.mint] || {};
  return `<div class="trow ${t.alerts ? 'hl' : ''} ${isNew && !t.hist ? 'new' : ''}">${avatar(t.mint)}
    <div style="min-width:0"><div class="l1">${side} ${t.mint ? tokLink(t.mint) : '<b>SOL</b>'}${tk.mcap ? `<span class="mut">mc $${NT.fmtCompact(tk.mcap)}</span>` : ''}${t.dex ? `<span class="tag">${esc(t.dex)}</span>` : ''}${t.sim ? '<span class="tag">sim</span>' : ''}</div>
    <div class="l2"><a href="#" data-wopen="${t.wallet}">${esc(t.emoji || '')} ${esc(t.name || Sol.short(t.wallet))}</a><span>${ago(t.ts)} ago</span>${t.sig && !t.sim ? `<a href="${solscan('tx', t.sig)}" target="_blank" rel="noopener">tx ↗</a>` : ''}${tk.ch1h != null ? `<span class="${cls(tk.ch1h)}">1h ${NT.fmtPct(tk.ch1h, 0)}</span>` : ''}</div></div>
    <div class="amt"><b class="${t.side === 'buy' ? 'up' : t.side === 'sell' ? 'dn' : ''}">${t.sol ? NT.fmtQty(+t.sol.toFixed(3)) + ' ◎' : ''}</b><div class="mut">${t.usd ? '$' + NT.fmtCompact(t.usd) : ''}</div></div></div>`;
}
function filteredTrades() {
  let a = Sol.trades;
  if (tr.filter === 'buys') a = a.filter((t) => t.side === 'buy'); else if (tr.filter === 'sells') a = a.filter((t) => t.side === 'sell'); else if (tr.filter === 'alerts') a = a.filter((t) => t.alerts); else if (tr.filter === 'swaps') a = a.filter((t) => t.side === 'buy' || t.side === 'sell');
  if (tr.minSol > 0) a = a.filter((t) => (t.sol || 0) >= tr.minSol || (t.usd || 0) >= tr.minSol * (Sol.solPx || 150));
  if (tr.q) { const q = tr.q.toLowerCase(); a = a.filter((t) => (t.name || '').toLowerCase().includes(q) || (t.mint && (Sol.tokName(t.mint).toLowerCase().includes(q) || t.mint === tr.q)) || t.wallet === tr.q); }
  return a;
}
/* ───────────── tracker revamp: smart-money radar ───────────── */
const KOL_META = new Map((typeof DEFAULT_WALLETS !== 'undefined' ? DEFAULT_WALLETS : []).map((o) => [o.trackedWalletAddress, o]));
const TIERS = { consistent: ['🎯', 'Consistent', '#22c55e'], whale: ['🐋', 'Whale', '#38bdf8'], grinder: ['⚡', 'Grinder', '#f5a524'], sniper: ['🎲', 'Sniper', '#f472b6'], rising: ['🌱', 'Rising', '#a78bfa'] };
function wMeta(w) {
  const k = KOL_META.get(w.addr) || {}, e = w.ext || {};
  const wr = e.winRate != null ? e.winRate : k.w + k.l ? (k.w / (k.w + k.l)) * 100 : null;
  return { tier: k.tier || (e.winRate != null ? (e.winRate >= 50 ? 'consistent' : 'rising') : null), wr, n: e.trades || (k.w + k.l) || 0, pnl: e.pnl != null ? e.pnl : k.pnl != null ? k.pnl : null, pnlUnit: e.pnl != null ? '$' : '◎', score: k.score != null ? k.score : wr != null ? (wr / 100) * Math.log(1 + (e.trades || 1)) * 10 : 0, src: e.src || k.src || '' };
}
function wrRing(wr, size = 34) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, v = wr == null ? 0 : Math.max(0, Math.min(100, wr)), col = wr == null ? 'rgba(148,163,200,.35)' : wr >= 55 ? 'var(--up)' : wr >= 45 ? 'var(--amber)' : 'var(--dn)';
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(148,163,200,.14)" stroke-width="3"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${((v / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${size < 30 ? 8 : 9.5}" font-weight="700" fill="currentColor">${wr == null ? '–' : Math.round(wr)}</text></svg>`;
}
function renderRadar() {
  const now = Date.now(), h1 = Sol.trades.filter((t) => t.ts > now - 3600000 && (t.side === 'buy' || t.side === 'sell'));
  const bS = h1.filter((t) => t.side === 'buy').reduce((a, t) => a + (t.sol || 0), 0), sS = h1.filter((t) => t.side === 'sell').reduce((a, t) => a + (t.sol || 0), 0), net = bS - sS;
  const nb = h1.filter((t) => t.side === 'buy').length, ns = h1.length - nb, act = new Set(h1.map((t) => t.wallet)).size, hot = Sol.hot(60)[0];
  const st = Sol.st, dot = st === 'live' ? 'ok' : st === 'sim' || st === 'connecting' || st === 'throttled' ? 'warn' : 'bad', ws = Sol.wallets;
  const ratio = nb + ns ? (nb / (nb + ns)) * 100 : 50;
  const kpi = (k, v, s, c = '') => `<div class="rk"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  $('#trHero').innerHTML = `<div class="rhead"><div class="rpulse ${dot}"><i></i><i></i><b>📡</b></div><div><div class="rtitle">Smart Money Radar</div><div class="note">${ws.length} wallets · ${ws.filter((w) => w.alerts).length} on alert · ${Sol.sim ? 'simulated activity' : esc(st) + ' via ' + esc(Sol.rpcUsed ? Sol.rpcUsed.replace(/^https:\/\//, '') : Sol.custom ? 'your RPC' : 'public RPC')}</div></div></div>
    ${kpi('Net flow · 1h', (net >= 0 ? '+' : '') + NT.fmtQty(+net.toFixed(2)) + ' ◎', `${NT.fmtQty(+bS.toFixed(1))} in · ${NT.fmtQty(+sS.toFixed(1))} out`, net >= 0 ? 'up' : 'dn')}
    <div class="rk"><span class="k">Buys vs sells · 1h</span><span class="v">${nb}<span class="mut" style="font-size:13px"> / ${ns}</span></span><span class="rbar"><i style="width:${ratio.toFixed(0)}%"></i></span></div>
    ${kpi('Active wallets · 1h', act, `of ${ws.length} tracked`)}
    ${kpi('Most bought · 1h', hot ? esc(Sol.tokName(hot.mint)) : '–', hot ? `${hot.buyers.size} wallets · ${NT.fmtQty(+(hot.sol || 0).toFixed(1))} ◎` : 'waiting for buys')}
    ${kpi('History', `<span style="font-size:13px">${esc(Sol.source())}</span>`, Sol.keys.st || Sol.heliusKey() ? 'full history &amp; win rates' : '<a href="#" data-goto="set">add a free key →</a>')}
    ${kpi('Copy-bot', ST.copy.on ? 'ON' : 'off', `${copyPos().length} open · ${NT.fmtUSD(copyEquity() - COPY.cash0, 0)}`, ST.copy.on ? 'up' : '')}`;
}
async function runDiag() { if (tr.diagBusy) return; tr.diagBusy = true; tr.diag = []; renderNet(); try { await Sol.diagnose((o) => { tr.diag = o.slice(); renderNet(); }); } finally { tr.diagBusy = false; renderNet(); const bad = (tr.diag || []).filter((d) => !d.ok).length; toast(bad ? `Diagnostics: ${bad} step(s) failed. See the fixes in the Data connection panel` : 'Diagnostics: everything works ✓', bad ? 'amb' : 'up', 6000); } }
function renderNet() {
  const el = $('#trNet'); if (!el) return;
  if (Sol.sim) { el.innerHTML = '<div class="note">Demo mode: wallet activity is simulated.</div>'; return; }
  const eps = Sol.endpointsInfo ? Sol.endpointsInfo() : [];
  $('#trNetNote').textContent = J.proxy ? 'via local server' : 'direct from browser';
  const diag = tr.diag ? `<div class="diag">${tr.diag.map((d) => `<div class="dg ${d.ok ? 'ok' : 'bad'}"><b>${d.ok ? '✓' : '✕'}</b><div><div>${esc(d.name)} <span class="note">${d.ms}ms</span></div><div class="note">${esc(String(d.info || ''))}</div>${!d.ok && d.hint ? `<div class="fix">→ ${esc(d.hint)}</div>` : ''}</div></div>`).join('')}</div>` : '';
  const warn = location.protocol === 'file:' || !J.proxy ? `<div class="fixbox">⚠ <b>Opened without the launcher.</b> Browsers block or throttle Solana requests from a plain file. Close this tab and double-click <b>start-exterm.bat</b> (no Python needed). Wallet history then routes through the local server.</div>` : '';
  const html = warn + `<div class="row" style="margin-bottom:6px"><button class="btn sm pri" id="trDiag" ${tr.diagBusy ? 'disabled' : ''}>${tr.diagBusy ? 'Testing…' : '🩺 Run diagnostics'}</button><span class="note">tests every step the tracker needs</span></div>` + diag + eps.map((e) => `<div class="ep"><i class="dot ${e.cool ? 'warn' : e.fails ? 'bad' : e.used ? 'ok' : ''}"></i><span class="mono">${esc(e.u)}</span><span class="sp"></span><span class="note">${e.cool ? 'cooling ' + e.cool + 's' : e.used ? 'active' : e.fails ? e.fails + ' errors' : 'standby'}</span></div>`).join('')
    + `<div class="note" style="margin-top:8px;line-height:1.5">${Sol.archival() ? 'Your RPC keeps full history.' : 'Free public nodes rate-limit browsers and keep only recent history; ExTerm rotates between them automatically.'}${J.proxy ? '' : ' <b>Tip:</b> launch with <b>start-exterm.bat</b> so requests go through the local server (no CORS errors).'}${Sol.keys.st || Sol.heliusKey() ? '' : ' A free <a href="#" data-goto="set">Solana Tracker or Helius key</a> unlocks full history and live win rates.'}</div>`;
  if (el._h !== html) { el._h = html; el.innerHTML = html; }
}

function renderTracker() {
  if (whView !== 'tracker' || ST.mode === 'stocks') return;
  renderRadar(); renderNet(); renderSpotCrypto();
  const st = Sol.st, ws = Sol.wallets, h1 = Sol.trades.filter((t) => t.ts > Date.now() - 3600000 && (t.side === 'buy' || t.side === 'sell'));
  const dot = st === 'live' ? 'ok' : st === 'sim' || st === 'connecting' || st === 'throttled' ? 'warn' : 'bad';
  const stat = (k, v, s, c = '') => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  const wsd = Sol.ws.st === 'live' ? 'ok' : Sol.ws.st === 'off' ? '' : 'warn';
  $('#trStats').innerHTML =
    stat('Tracking', ws.length + ' wallets', ws.filter((w) => w.alerts).length + ' with alerts') +
    stat('Polling', `<span style="font-size:13px"><i class="dot ${dot}"></i> ${esc(st)}</span>`, Sol.sim ? 'simulated activity' : `${esc(Sol.rpcUsed || (Sol.custom ? 'custom RPC' : 'public RPC'))} · ${Sol.activePerMin().toFixed(0)}/min`) +
    stat('Websocket', `<span style="font-size:13px"><i class="dot ${wsd}"></i> ${esc(Sol.sim ? 'sim' : Sol.ws.st)}</span>`, Sol.sim ? '' : `${Sol.ws.subs}/${Sol.ws.want} alert wallets live`) +
    stat('Scanned', `${Sol.scanned()}/${ws.length}`, Sol.err && !Sol.sim ? esc(Sol.err).slice(0, 46) : `${Sol.queueLen} tx queued · ${Sol.stats.tx} decoded`, Sol.err && !Sol.sim ? 'amb' : '') +
    stat('Swaps (1h)', h1.length, `${h1.filter((t) => t.side === 'buy').length} buys · ${h1.filter((t) => t.side === 'sell').length} sells`) +
    stat('History source', `<span style="font-size:13px">${esc(Sol.source())}</span>`, Sol.keys.st || Sol.heliusKey() ? 'full trade history' : '<a href="#" data-goto="set">add a free key →</a>', Sol.keys.st || Sol.heliusKey() ? 'up' : 'amb') +
    stat('Copy-bot', ST.copy.on ? 'ON' : 'off', `${copyPos().length} open · P&L ${NT.fmtUSD(copyEquity() - COPY.cash0, 0)}`, ST.copy.on ? 'up' : '');
  if (tr.dirty) {
    tr.dirty = false; const a = filteredTrades();
    $('#trFeed').innerHTML = a.length ? a.slice(0, 200).map(tradeCard).join('')
      : `<div class="empty">${Sol.sim ? 'Waiting for simulated trades…' : `Watching ${ws.length} wallets.<br>The first pass records each wallet's latest transaction, and new swaps stream in here as they land (alert wallets via websocket, the rest by polling).<br><span class="note">Tip: open any wallet and hit <b>Load history</b> to backfill its recent trades now. A free Helius / QuickNode RPC in Settings makes everything near-real-time.</span>`}</div>`;
  }
  const hot = Sol.hot(tr.hotWin).slice(0, 12);
  $('#trHot').innerHTML = hot.length ? hot.map((x) => {
    const t = Sol.tokens[x.mint] || {};
    return `<div class="hotrow"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="row" style="flex-wrap:nowrap">${avatar(x.mint, true)} ${tokLink(x.mint)}${t.mcap ? ` <span class="mut">mc $${NT.fmtCompact(t.mcap)}</span>` : ''}</span><span class="tag ${x.buyers.size >= 3 ? 'up' : x.buyers.size === 2 ? 'amb' : ''}">${x.buyers.size} wallet${x.buyers.size > 1 ? 's' : ''}</span></div>
      <div class="note">${x.sol ? NT.fmtQty(+x.sol.toFixed(2)) + ' ◎ in' : ''}${x.usd ? ' ($' + NT.fmtCompact(x.usd) + ')' : ''}${x.sellers.size ? ` · <span class="dn">${x.sellers.size} selling</span>` : ''} · ${ago(x.last)} ago${t.liq ? ' · liq $' + NT.fmtCompact(t.liq) : ''}</div>
      <div class="note" style="white-space:normal">${[...x.buyers.values()].slice(0, 6).map(esc).join(', ')}${x.buyers.size > 6 ? ' …' : ''}</div>
      <div class="row" style="margin-top:4px"><a class="btn sm" href="${safeUrl(t.url, 'https://dexscreener.com/solana/' + x.mint)}" target="_blank" rel="noopener noreferrer">Chart ↗</a><button class="btn sm" data-copymint="${x.mint}">Paper buy $${ST.copy.usd}</button><button class="btn sm" data-q="${x.mint}">Filter</button></div></div>`;
  }).join('') : '<div class="empty">No buys in this window yet. Tokens bought by several of your wallets rank to the top.</div>';
  const ae = document.activeElement; if (!(ae && ae.closest && ae.closest('#trCopy'))) renderCopy();
  if (tr.wdirty && Date.now() > tr.hold) renderWalletTable();
  if (tr.drawer && $('#drawer').classList.contains('on') && Date.now() > tr.hold && !(ae && ae.closest && ae.closest('#drawer'))) renderDrawer();
}
function renderCopy() {
  const c = ST.copy, pos = copyPos(), eq = copyEquity(), stt = NT.stats([COPY.cash0, eq], COPY.trades, 0);
  const rows = pos.map((m) => { const p = COPY.pos[m], now = Sol.priceOf(m), avg = p.cost / p.qty, u = now ? p.qty * now - p.cost : null; const w = Sol.byAddr(p.from); return `<tr><td>${tokLink(m)}</td><td class="r num ${cls(u)}">${u == null ? '–' : NT.fmtPct((u / p.cost) * 100, 0)}</td><td class="mut">${w ? esc(w.emoji + ' ' + w.name) : 'manual'}</td><td><button class="btn sm sell" data-copysell="${m}">Sell</button></td></tr>`; }).join('');
  $('#trCopy').innerHTML = `<div class="row" style="justify-content:space-between"><label class="f chk"><input type="checkbox" id="cpOn" ${c.on ? 'checked' : ''}> <b>Auto-copy buys</b></label><span class="note">equity <b class="mono ${cls(eq - COPY.cash0)}">${NT.fmtUSD(eq, 0)}</b> · win ${stt.winRate == null ? '–' : stt.winRate.toFixed(0) + '%'}</span></div>
    <div class="pgrid" style="margin-top:8px">
      <label class="f">Copy from<select class="in" id="cpWho"><option value="alerts" ${c.who === 'alerts' ? 'selected' : ''}>🔔 alert wallets</option><option value="all" ${c.who === 'all' ? 'selected' : ''}>all wallets</option></select></label>
      <label class="f">Size / trade ($)<input class="in mono" id="cpUsd" value="${c.usd}"></label>
      <label class="f">Only if they spend ≥ ◎<input class="in mono" id="cpMin" value="${c.minSol}"></label>
      <label class="f">Max positions<input class="in mono" id="cpMax" value="${c.max}"></label>
      <label class="f">Take-profit %<input class="in mono" id="cpTp" value="${c.tp}"></label>
      <label class="f">Stop-loss %<input class="in mono" id="cpSl" value="${c.sl}"></label>
    </div>
    <label class="f chk" style="margin-top:8px"><input type="checkbox" id="cpMirror" ${c.mirror ? 'checked' : ''}> sell when the copied wallet sells</label>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" id="cpSave">Save</button><button class="btn sm" id="cpReset">Reset ($${NT.fmtCompact(c.cash)})</button><span class="note">1% fee + 1% slip</span></div>
    ${rows ? `<table style="margin-top:8px"><thead><tr><th>Token</th><th class="r">P&amp;L</th><th>From</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="note" style="margin-top:8px">No open copy positions.</div>'}`;
}
function renderWalletTable() {
  tr.wdirty = false;
  let ws = Sol.wallets.slice();
  if (tr.walerts) ws = ws.filter((w) => w.alerts);
  if (tr.tier && tr.tier !== 'all') ws = ws.filter((w) => wMeta(w).tier === tr.tier);
  if (tr.wq) { const q = tr.wq.toLowerCase(); ws = ws.filter((w) => w.name.toLowerCase().includes(q) || w.addr.toLowerCase().includes(q)); }
  const k = tr.sort, M = new Map(ws.map((w) => [w.addr, wMeta(w)]));
  ws.sort((a, b) => { const A = M.get(a.addr), B = M.get(b.addr); return k === 'name' ? a.name.localeCompare(b.name) : k === 'wr' ? (B.wr ?? -1) - (A.wr ?? -1) : k === 'pnl' ? (B.pnl ?? -1e9) - (A.pnl ?? -1e9) : k === 'trades' ? (b.buys + b.sells) - (a.buys + a.sells) : k === 'active' ? (b.lastTs || 0) - (a.lastTs || 0) : B.score - A.score || (b.lastTs || 0) - (a.lastTs || 0); });
  $('#wCount').textContent = `${ws.length}${ws.length !== Sol.wallets.length ? ' of ' + Sol.wallets.length : ''}`;
  $('#wAlertsOnly').classList.toggle('on', tr.walerts);
  const now = Date.now();
  $('#wTable').innerHTML = ws.map((w) => {
    const m = M.get(w.addr), T = TIERS[m.tier];
    const status = w.lastTs ? `<span class="${now - w.lastTs < 3600000 ? 'up' : ''}">${ago(w.lastTs)} ago</span>` : w.err && !Sol.sim ? `<span class="amb" title="${esc(w.err)}">retrying…</span>` : w.lastCheck ? (Sol.archival() ? 'no recent activity' : '<span title="Free public RPC nodes only keep recent history. Add a Solana Tracker or Helius key in Settings to see older activity.">quiet lately ⓘ</span>') : '<span class="scan">scanning</span>';
    return `<div class="wcard ${tr.drawer === w.addr ? 'on' : ''} ${tr.flash[w.addr] && now - tr.flash[w.addr] < 1500 ? 'flash' : ''}" data-wopen="${w.addr}" style="--tc:${T ? T[2] : 'rgba(148,163,200,.4)'}">
      <span class="wav">${esc(w.emoji || (T ? T[0] : '👛'))}</span>
      <div style="min-width:0"><div class="nm">${esc(w.name || Sol.short(w.addr))}${T ? `<span class="tier">${T[1]}</span>` : ''}</div>
        <div class="sub">${status}${(() => { const km = KOL_META.get(w.addr); return km && !w.ext ? (km.w + km.l ? ` · <span class="up">${km.w}W</span>·<span class="dn">${km.l}L</span>` : '') : m.n ? ` · ${m.n} trades` : ''; })()}${m.pnl != null ? ` · <span class="${m.pnl >= 0 ? 'up' : 'dn'}">${m.pnl >= 0 ? '+' : ''}${m.pnlUnit === '$' ? NT.fmtUSD(m.pnl, 0) : NT.fmtQty(+m.pnl.toFixed(1)) + ' ◎'}</span>` : ''}${w.buys + w.sells ? ` · live <span class="up">${w.buys}</span>/<span class="dn">${w.sells}</span>` : ''}</div></div>
      <span class="wr" title="Win rate${m.src ? ' · ' + esc(m.src) : ''}">${wrRing(m.wr)}</span>
      <button class="bell ${w.alerts ? 'on' : ''}" data-walert="${w.addr}" title="Toggle alerts">🔔</button></div>`;
  }).join('') || '<div class="empty">No wallets match.</div>';
}
let disc = { rows: null, src: '', live: false, period: '7d', sort: 'realized', minTrades: 10, minWR: 50, busy: false, scoring: false };
function openDiscover() {
  tr.drawer = null; $('#drawer').classList.add('on'); $('#dTitle').innerHTML = '🏆 Discover top Solana traders';
  renderDiscover(); if (!disc.rows) loadDiscover();
}
async function loadDiscover() {
  disc.busy = true; renderDiscover();
  try { const r = await Sol.discover(disc.period, disc.sort); disc.rows = r.rows; disc.src = r.src; disc.live = r.live; } catch (e) { toast('Leaderboard failed: ' + esc(e.message), 'dn'); const r = await Sol.discover(null, null, true); Object.assign(disc, { rows: r.rows, src: r.src + ' (live API failed)', live: false }); }
  disc.busy = false; renderDiscover();
}
function discFiltered() { return (disc.rows || []).filter((r) => (r.trades == null || r.trades >= disc.minTrades) && (r.winRate == null || r.winRate >= disc.minWR)); }
function renderDiscover() {
  if (tr.drawer) return; const have = new Set(Sol.wallets.map((w) => w.addr)), rows = discFiltered();
  $('#dBody').innerHTML = `<div class="note" style="margin-bottom:8px">Source: <b>${esc(disc.src || '…')}</b>${disc.live ? '' : '. Add a free <b>Solana Tracker</b> API key in Settings for a live leaderboard with exact win rates across 1d / 7d / 30d / 90d.'}</div>
    ${disc.live ? `<div class="row" style="margin-bottom:8px"><div class="seg" id="dsPer">${['1d', '7d', '14d', '30d', '90d'].map((p) => `<button data-v="${p}" class="${p === disc.period ? 'on' : ''}">${p}</button>`).join('')}</div><select class="in" id="dsSort" style="width:auto">${[['realized', 'Realized PnL'], ['win_percentage', 'Win rate'], ['trades', 'Trades'], ['roi', 'ROI']].map(([v, l]) => `<option value="${v}" ${v === disc.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    <div class="row" style="margin-bottom:8px"><label class="f" style="flex-direction:row;align-items:center;gap:6px">Min trades <input class="in mono" id="dsMinT" value="${disc.minTrades}" style="width:60px"></label><label class="f" style="flex-direction:row;align-items:center;gap:6px">Min win rate % <input class="in mono" id="dsMinW" value="${disc.minWR}" style="width:60px"></label><button class="btn sm pri" id="dsAddAll">Add all ${rows.filter((r) => !have.has(r.addr)).length} shown</button></div>
    ${disc.busy ? '<div class="empty">Loading leaderboard…</div>' : `<table><thead><tr><th>#</th><th>Trader</th><th class="r">PnL</th><th class="r">Win rate</th><th class="r">Trades</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mut">${r.rank}</td><td><b>${esc(r.name || Sol.short(r.addr))}</b>${r.twitter ? ` <span class="mut">@${esc(r.twitter)}</span>` : ''}<div class="addr mut">${esc(Sol.short(r.addr))} <a href="https://kolscan.io/account/${r.addr}" target="_blank" rel="noopener">kolscan ↗</a> <a href="https://gmgn.ai/sol/address/${r.addr}" target="_blank" rel="noopener">gmgn ↗</a></div></td><td class="r num up">${r.pnlUsd != null ? NT.fmtUSD(r.pnlUsd, 0) : r.pnlSol != null ? '+' + r.pnlSol.toFixed(1) + ' ◎' : '–'}</td><td class="r num ${r.winRate >= 55 ? 'up' : r.winRate != null && r.winRate < 45 ? 'dn' : ''}">${r.winRate == null ? '–' : r.winRate.toFixed(0) + '%'}${r.w != null ? `<div class="note">${r.w}W / ${r.l}L</div>` : ''}</td><td class="r num">${r.trades ?? '–'}</td><td class="r">${have.has(r.addr) ? '<span class="tag up">tracking</span>' : `<button class="btn sm" data-dsadd="${r.addr}">＋ Track</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No traders match these filters.</td></tr>'}</tbody></table>`}
    <div class="note" style="margin-top:10px">Win rates of 90–100% are usually bots or wash trading, and past performance doesn't predict the next trade. Real top memecoin traders sit around 50–65% with strict risk control. New wallets are added with alerts on, so the copy-bot can paper-follow them.</div>`;
  const b = $('#dBody');
  b.querySelectorAll('#dsPer button').forEach((x) => { x.onclick = () => { disc.period = x.dataset.v; loadDiscover(); }; });
  const so = $('#dsSort'); if (so) so.onchange = () => { disc.sort = so.value; loadDiscover(); };
  $('#dsMinT').onchange = (e) => { disc.minTrades = +e.target.value || 0; renderDiscover(); };
  $('#dsMinW').onchange = (e) => { disc.minWR = +e.target.value || 0; renderDiscover(); };
  $('#dsAddAll').onclick = () => { const add = discFiltered().filter((r) => !have.has(r.addr)); const res = Sol.load(add.map((r) => ({ trackedWalletAddress: r.addr, name: '🏆 ' + (r.name || Sol.short(r.addr)) + (r.winRate != null ? ` (${r.winRate.toFixed(0)}% WR)` : ''), emoji: '🏆', alertsOn: true }))); saveState(); renderDiscover(); renderWalletTable(); toast(`Added ${res.added} top traders with alerts on`, 'up'); };
  b.querySelectorAll('[data-dsadd]').forEach((x) => { x.onclick = () => { const r = (disc.rows || []).find((q) => q.addr === x.dataset.dsadd); Sol.load([{ trackedWalletAddress: r.addr, name: '🏆 ' + (r.name || Sol.short(r.addr)) + (r.winRate != null ? ` (${r.winRate.toFixed(0)}% WR)` : ''), emoji: '🏆', alertsOn: true }]); saveState(); renderDiscover(); renderWalletTable(); }; });
}
async function scoreAll() {
  if (disc.scoring) return; disc.scoring = true; const ws = Sol.wallets.slice().sort((a, b) => b.alerts - a.alerts || (b.lastTs || 0) - (a.lastTs || 0));
  let k = 0; const t0 = Date.now(); openRank();
  for (const w of ws) {
    if (!disc.scoring) break; k++; $('#rankProg') && ($('#rankProg').innerHTML = progBar((k / ws.length) * 100, `Scoring ${k}/${ws.length}: ${esc(w.name)} via ${esc(Sol.source())}…`));
    try { await Sol.score(w); } catch (e) { w.ext = { err: e.message, at: Date.now() }; }
    if (k % 5 === 0) renderRank();
    await new Promise((r) => setTimeout(r, Sol.keys.st ? 120 : 350));
  }
  disc.scoring = false; renderRank(); renderWalletTable(); saveState(); toast(`Scored ${k} wallets in ${Math.round((Date.now() - t0) / 1000)}s`, 'acc');
}
function openRank() { tr.drawer = null; $('#drawer').classList.add('on'); $('#dTitle').innerHTML = '📊 Your wallets ranked'; renderRank(); }
const smart = (x) => (x && x.winRate != null ? x.winRate * Math.log10(10 + (x.trades || x.tokens || 0)) * (x.pnl > 0 ? 1.15 : x.pnl < 0 ? 0.8 : 1) : -1);
function renderRank() {
  if (tr.drawer) return; const ws = Sol.wallets.filter((w) => w.ext && !w.ext.err).sort((a, b) => smart(b.ext) - smart(a.ext)), losers = ws.filter((w) => (w.ext.trades || w.ext.tokens || 0) >= 10 && (w.ext.winRate < 35 || w.ext.pnl < 0));
  $('#dBody').innerHTML = `<div id="rankProg"></div><div class="row" style="margin:8px 0"><button class="btn sm pri" id="rkRun" ${disc.scoring ? 'disabled' : ''}>${disc.scoring ? 'Scoring…' : 'Score all ' + Sol.wallets.length + ' wallets'}</button>${disc.scoring ? '<button class="btn sm" id="rkStop">Stop</button>' : ''}<button class="btn sm" id="rkPrune" ${losers.length ? '' : 'disabled'}>Remove ${losers.length} losing wallets…</button><button class="btn sm" id="rkAlerts">🔔 Alerts on for top 25</button></div>
    <div class="note">Source: ${esc(Sol.source())}. Smart score = win rate × log(sample size), boosted for net-profitable wallets.</div>
    ${ws.length ? `<table style="margin-top:8px"><thead><tr><th>#</th><th>Wallet</th><th class="r">Win rate</th><th class="r">PnL</th><th class="r">Trades</th><th class="r">Score</th></tr></thead><tbody>${ws.map((w, i) => `<tr><td class="mut">${i + 1}</td><td><a href="#" data-wopen="${w.addr}">${esc(w.emoji)} ${esc(w.name)}</a></td><td class="r num ${w.ext.winRate >= 50 ? 'up' : 'dn'}">${w.ext.winRate == null ? '–' : w.ext.winRate.toFixed(0) + '%'}</td><td class="r num ${cls(w.ext.pnl)}">${w.ext.pnl == null ? '–' : NT.fmtUSD(w.ext.pnl, 0)}</td><td class="r num">${w.ext.trades ?? w.ext.tokens ?? '–'}</td><td class="r num">${smart(w.ext) < 0 ? '–' : smart(w.ext).toFixed(0)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No wallets scored yet.</div>'}`;
  $('#rkRun').onclick = scoreAll; const st = $('#rkStop'); if (st) st.onclick = () => { disc.scoring = false; };
  $('#rkPrune').onclick = (e) => confirmClick(e.target, () => { losers.forEach((w) => Sol.remove(w.addr)); saveState(); renderRank(); renderWalletTable(); toast(`Removed ${losers.length} wallets`, 'acc'); });
  $('#rkAlerts').onclick = () => { ws.forEach((w, i) => Sol.setAlert(w.addr, i < 25)); saveState(); renderWalletTable(); toast('Alerts now on for your 25 best-scoring wallets', 'up'); };
}
function openWallet(a) {
  tr.drawer = a; $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); tr.wdirty = true; renderDrawer(); renderWalletTable();
  const w = Sol.byAddr(a); if (!w || Sol.sim) return;
  // auto-load what this wallet holds (one cheap call) and its latest trades, so "what did they buy" is visible immediately
  if (!w.holdings && !tr.busyHist['h' + a]) { tr.busyHist['h' + a] = true; Sol.loadHoldings(w).catch((e) => { w.err = e.message; }).finally(() => { tr.busyHist['h' + a] = false; if (tr.drawer === a) renderDrawer(); }); }
  if (!w.recent.length && !tr.busyHist[a]) { tr.busyHist[a] = true; Sol.history(w, 12).catch((e) => { w.err = e.message; }).finally(() => { tr.busyHist[a] = false; tr.dirty = true; if (tr.drawer === a) renderDrawer(); }); }
}
function closeDrawer() { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); tr.drawer = null; tr.wdirty = true; if (curTab === 'whales') renderWalletTable(); }
function renderDrawer() {
  const w = Sol.byAddr(tr.drawer); if (!w) return closeDrawer();
  const s = Sol.walletStats(w), stat = (k, v, c = '') => `<div class="stat" style="min-width:110px"><span class="k">${k}</span><span class="v ${c}" style="font-size:15px">${v}</span></div>`;
  $('#dTitle').innerHTML = `${esc(w.emoji)} ${esc(w.name || 'Unnamed wallet')}`;
  const hold = w.holdings ? w.holdings.map((h) => ({ h, px: Sol.priceOf(h.mint) })).map((x) => Object.assign(x, { val: x.px ? x.px * x.h.amt : null })).sort((a, b) => (b.val || 0) - (a.val || 0)) : null;
  $('#dBody').innerHTML = `
    <div class="row" style="justify-content:space-between"><span class="addr mut" style="word-break:break-all">${esc(w.addr)}</span><button class="btn sm" data-wcopy="${w.addr}">Copy</button></div>
    <div class="row" style="margin:10px 0"><a class="btn sm" href="${solscan('account', w.addr)}" target="_blank" rel="noopener">Solscan ↗</a><a class="btn sm" href="https://gmgn.ai/sol/address/${w.addr}" target="_blank" rel="noopener">GMGN ↗</a><a class="btn sm" href="https://birdeye.so/profile/${w.addr}?chain=solana" target="_blank" rel="noopener">Birdeye ↗</a>
      <button class="btn sm ${w.alerts ? 'on' : ''}" data-walert="${w.addr}">${w.alerts ? '🔔 Alerts on' : '🔕 Alerts off'}</button><button class="btn sm" data-wren="${w.addr}">Rename</button><button class="btn sm" data-wdel="${w.addr}">Remove</button></div>
    <div id="dRen"></div>
    <div class="stats">${stat('SOL balance', w.bal == null ? '–' : NT.fmtQty(+w.bal.toFixed(3)) + ' ◎')}${stat('Last active', w.lastTs ? ago(w.lastTs) + ' ago' : '–')}${stat('Buys / sells', `<span class="up">${s.rows.reduce((a, r) => a + (r.buyUsd ? 1 : 0), 0) ? w.buys : w.buys}</span> / <span class="dn">${w.sells}</span>`)}${stat('Realized P&L*', s.closed ? NT.fmtUSD(s.realized, 0) : '–', cls(s.realized))}${stat('Win rate*', s.winRate == null ? '–' : s.winRate.toFixed(0) + '%')}${stat('Volume seen', '$' + NT.fmtCompact(s.vol))}${w.ext && !w.ext.err ? stat('Win rate (' + esc(w.ext.src) + ')', w.ext.winRate == null ? '–' : w.ext.winRate.toFixed(0) + '%', w.ext.winRate >= 50 ? 'up' : 'dn') + stat('PnL (' + esc(w.ext.src) + ')', w.ext.pnl == null ? '–' : NT.fmtUSD(w.ext.pnl, 0), cls(w.ext.pnl)) : ''}</div>
    <div class="note" style="margin-bottom:6px">History source: <b>${esc(Sol.source())}</b>${w.histAt ? ' · loaded ' + ago(w.histAt) + ' ago' : ''}${!Sol.archival() && !Sol.keys.st && !Sol.heliusKey() ? '. Public RPC only shows ~2 days, so add a key in Settings for full history.' : ''}</div>
    <div class="row"><button class="btn sm pri" data-whist="${w.addr}" ${tr.busyHist[w.addr] ? 'disabled' : ''}>${tr.busyHist[w.addr] ? 'Loading…' : 'Load history (25 txs)'}</button><button class="btn sm" data-whold="${w.addr}" ${tr.busyHist['h' + w.addr] ? 'disabled' : ''}>${tr.busyHist['h' + w.addr] ? 'Loading…' : 'Load holdings'}</button><button class="btn sm" data-wscore="${w.addr}">📊 Score</button></div>
    <div class="sec">Token P&amp;L from decoded trades*</div>
    ${s.rows.length ? `<table><thead><tr><th>Token</th><th class="r">Bought</th><th class="r">Sold</th><th class="r">Realized</th><th class="r">Open</th></tr></thead><tbody>${s.rows.slice(0, 25).map((r) => `<tr><td>${tokLink(r.mint)}</td><td class="r num">$${NT.fmtCompact(r.buyUsd)}</td><td class="r num">$${NT.fmtCompact(r.sellUsd)}</td><td class="r num ${cls(r.realized)}">${r.sellUsd && r.buyUsd ? NT.fmtUSD(r.realized, 0) : '–'}</td><td class="r num ${cls(r.unreal)}">${r.unreal == null ? '–' : NT.fmtUSD(r.unreal, 0)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No decoded swaps yet. Hit <b>Load history</b>.</div>'}
    ${hold ? `<div class="sec">Holdings (${hold.length} tokens)</div>${hold.length ? `<table><thead><tr><th>Token</th><th class="r">Amount</th><th class="r">Value</th></tr></thead><tbody>${hold.slice(0, 40).map((x) => `<tr><td class="row" style="flex-wrap:nowrap">${avatar(x.h.mint, true)} ${tokLink(x.h.mint)}</td><td class="r num">${NT.fmtCompact(x.h.amt)}</td><td class="r num">${x.val == null ? '–' : '$' + NT.fmtCompact(x.val)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No token balances.</div>'}` : ''}
    <div class="sec">Recent trades</div>
    <div>${w.recent.length ? w.recent.map(tradeCard).join('') : '<div class="note">None decoded yet.</div>'}</div>
    <div class="note" style="margin-top:10px">*Estimated only from swaps this app has decoded (history you load + live trades), valued in USD at the time of each trade.</div>`;
}
function initTracker() {
  $('#trNet').onclick = (e) => { if (e.target.id === 'trDiag') runDiag(); };
  segBtns($('#trFilter'), [{ v: 'swaps', l: 'Swaps' }, { v: 'buys', l: 'Buys' }, { v: 'sells', l: 'Sells' }, { v: 'alerts', l: '🔔 Alerts' }, { v: 'all', l: 'All activity' }], tr.filter, (v) => { tr.filter = v; tr.dirty = true; renderTracker(); });
  segBtns($('#trHotWin'), [{ v: 15, l: '15m' }, { v: 60, l: '1h' }, { v: 240, l: '4h' }, { v: 1440, l: '24h' }], tr.hotWin, (v) => { tr.hotWin = +v; renderTracker(); });
  $('#trMin').oninput = (e) => { tr.minSol = parseFloat(e.target.value) || 0; tr.dirty = true; renderTracker(); };
  $('#trQ').oninput = (e) => { tr.q = e.target.value.trim(); tr.dirty = true; renderTracker(); };
  $('#wQ').oninput = (e) => { tr.wq = e.target.value.trim(); renderWalletTable(); };
  $('#wSort').onchange = (e) => { tr.sort = e.target.value; renderWalletTable(); }; $('#wSort').value = tr.sort;
  segBtns($('#wTier'), [{ v: 'all', l: 'All' }].concat(Object.entries(TIERS).map(([v, t]) => ({ v, l: t[0] + ' ' + t[1] }))), tr.tier, (v) => { tr.tier = v; renderWalletTable(); });
  $('#wAlertsOnly').onclick = () => { tr.walerts = !tr.walerts; renderWalletTable(); };
  $('#wAddToggle').onclick = () => { $('#wAddBox').hidden = !$('#wAddBox').hidden; };
  $('#wDiscover').onclick = openDiscover; $('#wScore').onclick = () => { openRank(); };
  $('#dClose').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tr.drawer) closeDrawer(); });
  $('#wAddSol').onclick = () => { const r = Sol.add($('#wsAddr').value.trim(), $('#wsName').value.trim(), $('#wsEmoji').value.trim() || '👛', $('#wsAlert').checked); if (!r.ok) return toast(esc(r.err), 'amb'); $('#wsAddr').value = $('#wsName').value = ''; renderWalletTable(); saveState(); toast('Wallet added', 'acc'); };
  $('#wImpFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; $('#wImpText').value = await f.text(); };
  $('#wImpGo').onclick = () => {
    try {
      let d = JSON.parse($('#wImpText').value); if (!Array.isArray(d)) d = d.wallets || d.trackedWallets || [];
      const r = Sol.load(d, $('#wImpReplace').checked); renderWalletTable(); saveState();
      toast(`Imported: ${r.added} added, ${r.updated} updated${r.skipped ? ', ' + r.skipped + ' skipped (invalid/duplicate)' : ''}`, 'up'); $('#wAddBox').hidden = true; $('#wImpText').value = '';
    } catch (e) { toast('Import failed: ' + esc(e.message) + '. Expecting a JSON list of {trackedWalletAddress, name, emoji, alertsOn}.', 'dn', 9000); }
  };
  $('#wExp').onclick = async () => { const txt = JSON.stringify(Sol.exportList(), null, 2); if (!download('tracked-wallets.json', txt, 'application/json')) { try { await navigator.clipboard.writeText(txt); toast('Wallet list copied to clipboard', 'acc'); } catch (e) { toast('Export blocked here', 'amb'); } } };
  $('#wDefault').onclick = (e) => confirmClick(e.target, () => { const r = Sol.load(DEFAULT_WALLETS, true); Sol.stop(); Sol.start({ sim: Sol.sim }); tr.wdirty = tr.dirty = true; renderWalletTable(); saveState(); toast(`Loaded the curated top-trader list (${Sol.wallets.length} wallets)`, 'acc'); });
  const onClick = async (e) => {
    const g = (a) => e.target.closest('[' + a + ']'), get = (el, a) => el.getAttribute(a);
    let el;
    if ((el = g('data-walert'))) { e.stopPropagation(); const w = Sol.byAddr(get(el, 'data-walert')); if (w) { Sol.setAlert(w.addr, !w.alerts); renderWalletTable(); if (tr.drawer) renderDrawer(); saveState(); } }
    else if ((el = g('data-wcopy'))) { try { await navigator.clipboard.writeText(get(el, 'data-wcopy')); toast('Address copied', 'acc', 2000); } catch (x) { toast(esc(get(el, 'data-wcopy')), '', 8000); } }
    else if ((el = g('data-wopen'))) { e.preventDefault(); openWallet(get(el, 'data-wopen')); }
    else if ((el = g('data-whist'))) { const w = Sol.byAddr(get(el, 'data-whist')); if (!w) return; tr.busyHist[w.addr] = true; renderDrawer(); try { const n = await Sol.history(w, 25); toast(`${esc(w.name)}: ${n} trades decoded`, 'acc'); } catch (x) { toast('Could not load history: ' + esc(x.message), 'dn'); } tr.busyHist[w.addr] = false; tr.dirty = true; renderDrawer(); renderTracker(); }
    else if ((el = g('data-whold'))) { const w = Sol.byAddr(get(el, 'data-whold')); if (!w) return; tr.busyHist['h' + w.addr] = true; renderDrawer(); try { await Sol.loadHoldings(w); } catch (x) { toast('Could not load holdings: ' + esc(x.message), 'dn'); } tr.busyHist['h' + w.addr] = false; renderDrawer(); }
    else if ((el = g('data-wscore'))) { const w = Sol.byAddr(get(el, 'data-wscore')); try { await Sol.score(w); toast(`${esc(w.name)}: win rate ${w.ext.winRate == null ? '–' : w.ext.winRate.toFixed(0) + '%'}`, 'acc'); } catch (x) { toast('Scoring failed: ' + esc(x.message), 'dn'); } renderDrawer(); renderWalletTable(); saveState(); }
    else if ((el = g('data-wren'))) { const w = Sol.byAddr(get(el, 'data-wren')); tr.hold = Date.now() + 60000; $('#dRen').innerHTML = `<div class="row" style="margin-bottom:10px"><input class="in" id="dRenE" value="${esc(w.emoji)}" style="width:52px"><input class="in" id="dRenN" value="${esc(w.name)}" style="flex:1"><button class="btn sm pri" id="dRenOk">Save</button></div>`; $('#dRenN').focus(); const done = () => { w.name = $('#dRenN').value.trim() || w.name; w.emoji = $('#dRenE').value.trim() || w.emoji; tr.hold = 0; renderDrawer(); renderWalletTable(); saveState(); }; $('#dRenOk').onclick = done; $('#dRenN').onkeydown = (k) => { if (k.key === 'Enter') done(); }; }
    else if ((el = g('data-wdel'))) { confirmClick(el, () => { Sol.remove(get(el, 'data-wdel')); closeDrawer(); renderWalletTable(); saveState(); }); }
    else if ((el = g('data-q'))) { tr.q = get(el, 'data-q'); $('#trQ').value = tr.q; tr.dirty = true; renderTracker(); }
    else if ((el = g('data-copymint'))) { const m = get(el, 'data-copymint'), p = Sol.priceOf(m); if (!p) return toast('No price for that token yet', 'amb'); if (COPY.pos[m]) return toast('Already holding it', 'amb'); const t = COPY.buy(m, p, Math.min(ST.copy.usd, COPY.cash), Date.now(), { reason: 'manual paper buy (hot token)', src: 'copy', slPct: ST.copy.sl / 100, tpPct: ST.copy.tp / 100 }); if (t) { t.tok = Sol.tokName(m); toast(`Paper bought ${esc(t.tok)} for ${NT.fmtUSD(t.usd, 0)}`, 'up'); saveState(); renderTracker(); } }
    else if ((el = g('data-copysell'))) { const m = get(el, 'data-copysell'), p = Sol.priceOf(m) || COPY.pos[m].cost / COPY.pos[m].qty; const t = COPY.sell(m, p, null, Date.now(), { reason: 'manual sell', src: 'copy' }); if (t) { t.tok = Sol.tokName(m); toast(`Sold ${esc(t.tok)} · P&L ${NT.fmtUSD(t.pnl)}`, t.pnl >= 0 ? 'up' : 'dn'); } saveState(); renderTracker(); }
    else if (e.target.id === 'cpSave' || e.target.id === 'cpOn' || e.target.id === 'cpMirror') {
      const c = ST.copy; c.on = $('#cpOn').checked; c.mirror = $('#cpMirror').checked; c.who = $('#cpWho').value;
      c.usd = Math.max(1, +$('#cpUsd').value || 50); c.minSol = Math.max(0, +$('#cpMin').value || 0); c.max = Math.max(1, +$('#cpMax').value || 5); c.tp = Math.max(0, +$('#cpTp').value || 0); c.sl = Math.max(0, +$('#cpSl').value || 0);
      saveState(); if (e.target.id === 'cpSave') toast('Copy-bot settings saved', 'acc'); if (e.target.id === 'cpOn') toast(c.on ? '🧬 Copy-bot ON: paper-copying buys from ' + (c.who === 'alerts' ? 'your alert wallets' : 'all tracked wallets') : 'Copy-bot paused', c.on ? 'up' : '');
    }
    else if (e.target.id === 'cpReset') confirmClick(e.target, () => { COPY = new NT.Account({ cash: ST.copy.cash, fee: 0.01, slip: 0.01 }); ST.copy.acct = COPY; saveState(); renderTracker(); });
  };
  $('#tab-whales').addEventListener('click', onClick); $('#drawer').addEventListener('click', onClick);
  Sol.listeners.push((ev) => {
    tr.dirty = true; tr.wdirty = true; tr.flash[ev.wallet] = Date.now();
    copyOnTrade(ev);
    if (ev.hist || !ev.alerts || (ev.side !== 'buy' && ev.side !== 'sell')) return;
    if (ev.sim && Math.random() > 0.35) return;
    const tok = ev.mint ? Sol.tokName(ev.mint) : 'SOL';
    toast(`${esc(ev.emoji || '🔔')} <b>${esc(ev.name || Sol.short(ev.wallet))}</b> ${ev.side === 'buy' ? '<span class="up">bought</span>' : '<span class="dn">sold</span>'} <b>${esc(tok)}</b>${ev.sol ? ' · ' + NT.fmtQty(+ev.sol.toFixed(2)) + ' ◎' : ''}${ev.usd ? ' ($' + NT.fmtCompact(ev.usd) + ')' : ''}`, ev.side === 'buy' ? 'up' : 'dn', 8000);
    if (!ev.sim) { beep(); try { if (window.Notification && Notification.permission === 'granted') new Notification(`${ev.name || 'Wallet'} ${ev.side === 'buy' ? 'bought' : 'sold'} ${tok}`, { body: `${ev.sol ? ev.sol.toFixed(2) + ' SOL' : ''} ${ev.dex ? 'on ' + ev.dex : ''}` }); } catch (x) { } }
  });
  Sol.watchMints = () => copyPos().concat(Sol.hot(tr.hotWin).slice(0, 10).map((x) => x.mint), Sol.trades.slice(0, 40).map((t) => t.mint).filter(Boolean));
}

/* ───────────── SEC insider tracker UI (stocks) ───────────── */
let ins = { filter: 'all', q: '', dirty: true, live: true };
function insTickers() { const v = ($('#inTickers').value || '').toUpperCase().split(/[\s,;]+/).filter((s) => /^[A-Z][A-Z0-9.\-]{0,8}$/.test(s)); return [...new Set(v)]; }
function insRows() {
  let a = SEC.trades;
  if (ins.filter === 'buys') a = a.filter((t) => t.code === 'P'); else if (ins.filter === 'sales') a = a.filter((t) => t.code === 'S'); else if (ins.filter === 'big') a = a.filter((t) => (t.value || 0) >= 1e6); else if (ins.filter === 'watch') { const w = new Set(ST.mk.stocks.watch.concat(insTickers())); a = a.filter((t) => w.has(t.ticker)); }
  if (ins.q) { const q = ins.q.toLowerCase(); a = a.filter((t) => t.ticker.toLowerCase().includes(q) || (t.insider || '').toLowerCase().includes(q) || (t.company || '').toLowerCase().includes(q)); }
  return a;
}
function renderInsider() {
  if (ST.mode !== 'stocks') return;
  renderSpotStocks();
  const d30 = Date.now() - 30 * 864e5, buys = SEC.trades.filter((t) => t.code === 'P' && t.ts > d30), sales = SEC.trades.filter((t) => t.code === 'S' && t.ts > d30), cl = SEC.clusters(30).filter((x) => x.insiders.size >= 2);
  const stat = (k, v, s, c = '') => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  const dot = SEC.st === 'live' ? 'ok' : SEC.st === 'error' ? 'bad' : 'warn';
  $('#inStats').innerHTML = stat('Source', `<span style="font-size:13px"><i class="dot ${dot}"></i> ${SEC.sim ? 'simulated' : 'SEC EDGAR'}</span>`, SEC.err ? esc(SEC.err).slice(0, 50) : SEC.st === 'scanning' ? 'scanning ' + SEC.progress : SEC.streamTs ? 'stream updated ' + ago(SEC.streamTs) + ' ago' : SEC.st) +
    stat('Transactions', SEC.trades.length, 'parsed from Form 4s') + stat('Insider buys (30d)', buys.length, '$' + NT.fmtCompact(buys.reduce((s, t) => s + (t.value || 0), 0)), 'up') +
    stat('Insider sales (30d)', sales.length, '$' + NT.fmtCompact(sales.reduce((s, t) => s + (t.value || 0), 0)), 'dn') + stat('Cluster buys', cl.length, '2+ insiders, same stock');
  $('#inProg').textContent = SEC.st === 'scanning' ? `Scanning… ${SEC.progress}` : SEC.ts ? `Last scan ${fmtClock(SEC.ts)}` : (SEC.sim ? 'Simulated filings (stock data is simulated here).' : 'Open-market buys (code P) are usually the most meaningful insider signal.');
  if (ins.dirty) {
    ins.dirty = false; const a = insRows();
    const tag = (t) => `<span class="tag ${t.code === 'P' ? 'up' : t.code === 'S' ? 'dn' : ''}">${esc(t.type)}</span>`;
    $('#inFeed').innerHTML = a.length ? `<table><thead><tr><th>Date</th><th>Ticker</th><th>Insider</th><th>Type</th><th class="r">Shares</th><th class="r">Price</th><th class="r">Value</th><th class="r">Owned after</th><th></th></tr></thead><tbody>${a.slice(0, 300).map((t) => `<tr class="${t.code === 'P' ? 'hl' : ''}"><td class="mut">${esc(t.date)}</td><td><a href="#" data-stk="${esc(t.ticker)}"><b>${esc(t.ticker)}</b></a> <span class="mut">${esc((t.company || '').slice(0, 22))}</span></td><td>${esc(t.insider)}<div class="note">${esc(t.role)}</div></td><td>${tag(t)}${t.sim ? ' <span class="tag">sim</span>' : ''}</td><td class="r num">${t.shares == null ? '–' : NT.fmtCompact(t.shares)}</td><td class="r num">${t.price ? NT.fmtPrice(t.price) : '–'}</td><td class="r num ${t.code === 'P' ? 'up' : t.code === 'S' ? 'dn' : ''}">${t.value ? '$' + NT.fmtCompact(t.value) : '–'}</td><td class="r num">${t.after == null ? '–' : NT.fmtCompact(t.after)}</td><td>${t.url ? `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener">filing ↗</a>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${SEC.st === 'scanning' ? 'Scanning Form 4 filings…' : J.proxy || SEC.sim ? 'No insider transactions loaded yet. Hit <b>Scan Form 4s</b>, or wait for the live stream.' : 'The insider tracker reads SEC EDGAR, which browsers can only reach through ExTerm’s local proxy.<br>Start the app with <b>start-exterm</b> / <b>python serve.py</b>.'}</div>`;
  }
  $('#inClusters').innerHTML = cl.length ? cl.slice(0, 15).map((x) => `<div class="hotrow"><div class="row" style="justify-content:space-between"><a href="#" data-stk="${esc(x.ticker)}"><b>${esc(x.ticker)}</b></a><span class="tag up">${x.insiders.size} insiders</span></div><div class="note">$${NT.fmtCompact(x.value)} bought · last ${ago(x.last)} ago</div><div class="note" style="white-space:normal">${[...x.insiders.entries()].slice(0, 5).map(([n, r]) => esc(n) + (r ? ' (' + esc(r) + ')' : '')).join(', ')}</div></div>`).join('') : '<div class="empty">No cluster buys in the loaded filings.</div>';
  const big = SEC.trades.filter((t) => t.code === 'P' && t.value).sort((a, b) => b.value - a.value).slice(0, 12);
  $('#inBig').innerHTML = big.length ? big.map((t) => `<div class="hotrow"><div class="row" style="justify-content:space-between"><span><a href="#" data-stk="${esc(t.ticker)}"><b>${esc(t.ticker)}</b></a> <span class="mut">${esc(t.date)}</span></span><b class="up mono">$${NT.fmtCompact(t.value)}</b></div><div class="note">${esc(t.insider)} · ${esc(t.role)} · ${NT.fmtCompact(t.shares)} sh @ ${NT.fmtPrice(t.price)}</div></div>`).join('') : '<div class="empty">No open-market buys loaded.</div>';
}
function initInsider() {
  segBtns($('#inFilter'), [{ v: 'all', l: 'All' }, { v: 'buys', l: 'Buys' }, { v: 'sales', l: 'Sales' }, { v: 'big', l: '≥ $1M' }, { v: 'watch', l: 'My tickers' }], ins.filter, (v) => { ins.filter = v; ins.dirty = true; renderInsider(); });
  $('#inQ').oninput = (e) => { ins.q = e.target.value.trim(); ins.dirty = true; renderInsider(); };
  const defT = ST.mk.stocks.watch.filter((s) => STOCK_INFO[s] && STOCK_INFO[s].shares).concat(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'JPM', 'PLTR', 'COIN']);
  $('#inTickers').value = (ST.secTickers || [...new Set(defT)].slice(0, 16)).join(', ');
  $('#inTickers').onchange = () => { ST.secTickers = insTickers(); saveState(); };
  $('#inUseWatch').onclick = () => { $('#inTickers').value = ST.mk.stocks.watch.filter((s) => !/^\^/.test(s)).join(', '); ST.secTickers = insTickers(); saveState(); };
  $('#inScan').onclick = async () => { ST.secTickers = insTickers(); saveState(); const p = SEC.scan(insTickers()); ins.dirty = true; renderInsider(); await p; ins.dirty = true; renderInsider(); saveState(); };
  $('#inLive').checked = ST.secLive !== false; $('#inLive').onchange = (e) => { ST.secLive = e.target.checked; saveState(); if (e.target.checked) SEC.stream().then(() => { ins.dirty = true; renderInsider(); }); };
  $('#whInsider').addEventListener('click', (e) => { const a = e.target.closest('[data-stk]'); if (a) { e.preventDefault(); selectSym(a.dataset.stk); showTab('markets'); } });
  SEC.listeners.push((t) => { ins.dirty = true; if (t.code === 'P' && (t.value || 0) >= 250000 && !t.sim && Date.now() - SEC.streamTs < 600000 && SEC.streamTs) toast(`🏛️ Insider buy: <b>${esc(t.ticker)}</b> ${esc(t.insider)} (${esc(t.role)}) bought $${NT.fmtCompact(t.value)}`, 'up', 9000); });
}

/* ───────────── convergence spotlight: what several tracked wallets / insiders are buying together ───────────── */
const spot = { win: 240 };
function spotApply(el) { if (el._h !== el._next) { el._h = el._next; el.innerHTML = el._next; } }
function renderSpotCrypto() {
  const el = $('#trSpot'); if (!el) return;
  const all = Sol.hot(spot.win), multi = all.filter((x) => x.buyers.size >= 2).map((x) => {
    const buys = Sol.trades.filter((t) => t.mint === x.mint && t.side === 'buy' && t.ts >= x.first && t.px), entry = buys.length ? buys[buys.length - 1].px : null, now = Sol.priceOf(x.mint);
    return Object.assign(x, { entry, chg: entry && now ? (now / entry - 1) * 100 : null, score: x.buyers.size * 3 + Math.log10(1 + x.sol) * 2 - x.sellers.size * 1.5 });
  }).sort((a, b) => b.score - a.score);
  const top = multi[0], winBtns = [[60, '1h'], [240, '4h'], [1440, '24h']].map(([v, l]) => `<button class="${spot.win === v ? 'on' : ''}" data-spwin="${v}">${l}</button>`).join('');
  if (!top) { const w1 = all[0]; el._next = `<div class="spot empty-spot"><div class="sp-l"><span class="spk-t">🎯 Smart-money convergence</span><div class="note">When <b>2 or more</b> of your tracked wallets buy the same token, it's spotlighted here${w1 ? ` · watching <b>${esc(Sol.tokName(w1.mint))}</b> (${w1.buyers.size} buyer)` : ''}.</div></div><div class="seg">${winBtns}</div></div>`; spotApply(el); return; }
  const t = Sol.tokens[top.mint] || {}, buyers = [...top.buyers.entries()].map(([a, n]) => { const w = Sol.byAddr(a), m = w ? wMeta(w) : {}, T = TIERS[m.tier]; return `<a href="#" class="buyer" data-wopen="${esc(a)}" style="--tc:${T ? T[2] : 'var(--mut)'}" title="${esc(n)}${m.wr != null ? ' · WR ' + Math.round(m.wr) + '%' : ''}">${esc(n.trim())}</a>`; }).join('');
  el._next = `<div class="spot"><div class="sp-glow"></div>
    <div class="sp-l">${avatar(top.mint)}<div style="min-width:0"><div class="spk-t">🎯 Smart-money convergence <span class="tag up">${top.buyers.size} wallets buying</span>${top.sellers.size ? `<span class="tag dn">${top.sellers.size} selling</span>` : ''}</div>
      <div class="sp-name">${tokLink(top.mint)}${t.name ? `<span class="mut"> ${esc(t.name)}</span>` : ''}</div>
      <div class="buyers">${buyers}</div></div></div>
    <div class="sp-m"><div><span class="k">Smart money in</span><b class="mono up">${NT.fmtQty(+top.sol.toFixed(2))} ◎</b><small>${top.usd ? '$' + NT.fmtCompact(top.usd) : ''}</small></div>
      <div><span class="k">Since first buy</span><b class="mono ${cls(top.chg)}">${top.chg == null ? '–' : NT.fmtPct(top.chg, 1)}</b><small>${ago(top.first)} ago</small></div>
      <div><span class="k">Mkt cap · liq</span><b class="mono">${t.mcap ? '$' + NT.fmtCompact(t.mcap) : '–'}</b><small>${t.liq ? 'liq $' + NT.fmtCompact(t.liq) : ''}</small></div></div>
    <div class="sp-a"><div class="seg">${winBtns}</div><div class="row"><a class="btn sm" href="${safeUrl(t.url, 'https://dexscreener.com/solana/' + top.mint)}" target="_blank" rel="noopener noreferrer">Chart ↗</a><button class="btn sm pri" data-copymint="${esc(top.mint)}">Paper buy $${ST.copy.usd}</button><button class="btn sm" data-spfilter="${esc(top.mint)}">Show trades</button><button class="btn sm" data-socopy="${esc(top.mint)}">Copy CA</button></div>
      ${multi.length > 1 ? `<div class="runners">${multi.slice(1, 5).map((x) => `<a href="#" data-spfilter="${esc(x.mint)}">${esc(Sol.tokName(x.mint))} <b>${x.buyers.size}</b></a>`).join('')}</div>` : ''}</div></div>`;
  spotApply(el);
}
function renderSpotStocks() {
  const el = $('#inSpot'); if (!el) return;
  const cl = SEC.clusters(30).filter((c) => c.insiders.size >= 2);
  const top = cl[0];
  if (!top) { el._next = `<div class="spot empty-spot"><div class="sp-l"><span class="spk-t">🎯 Insider convergence</span><div class="note">When <b>2 or more</b> insiders buy the same stock within 30 days (a classic signal), it's spotlighted here. Scan Form 4s to load filings.</div></div></div>`; spotApply(el); return; }
  const buys = SEC.trades.filter((t) => t.ticker === top.ticker && t.code === 'P' && t.price), avg = buys.length ? buys.reduce((s, t) => s + t.price * (t.shares || 1), 0) / buys.reduce((s, t) => s + (t.shares || 1), 0) : null, now = px(top.ticker), chg = avg && now ? (now / avg - 1) * 100 : null;
  el._next = `<div class="spot"><div class="sp-glow"></div>
    <div class="sp-l">${SymPick.badge(top.ticker, 40)}<div style="min-width:0"><div class="spk-t">🎯 Insider convergence <span class="tag up">${top.insiders.size} insiders buying</span></div>
      <div class="sp-name"><a href="#" data-spopen="${esc(top.ticker)}"><b>${esc(top.ticker)}</b></a><span class="mut"> ${esc(top.company || '')}</span></div>
      <div class="buyers">${[...top.insiders.entries()].slice(0, 8).map(([n, r]) => `<span class="buyer" style="--tc:var(--up)">${esc(n)}<small> ${esc(r || '')}</small></span>`).join('')}</div></div></div>
    <div class="sp-m"><div><span class="k">Bought (30d)</span><b class="mono up">$${NT.fmtCompact(top.value)}</b><small>${top.n} purchases</small></div>
      <div><span class="k">vs avg insider price</span><b class="mono ${cls(chg)}">${chg == null ? '–' : NT.fmtPct(chg, 1)}</b><small>${avg ? 'avg $' + avg.toFixed(2) : ''}</small></div>
      <div><span class="k">Last buy</span><b class="mono">${top.last ? ago(top.last) : '–'}</b><small>ago</small></div></div>
    <div class="sp-a"><div class="row"><button class="btn sm pri" data-spopen="${esc(top.ticker)}">Open chart</button><button class="btn sm" data-spbt="${esc(top.ticker)}">Backtest it</button></div>
      ${cl.length > 1 ? `<div class="runners">${cl.slice(1, 5).map((c) => `<a href="#" data-spopen="${esc(c.ticker)}">${esc(c.ticker)} <b>${c.insiders.size}</b></a>`).join('')}</div>` : ''}</div></div>`;
  spotApply(el);
}
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-spwin]'); if (w) { spot.win = +w.dataset.spwin; renderSpotCrypto(); return; }
  const f = e.target.closest('[data-spfilter]'); if (f) { e.preventDefault(); tr.q = f.dataset.spfilter; const q = $('#trQ'); if (q) q.value = tr.q; tr.dirty = true; renderTracker(); return; }
  const o = e.target.closest('[data-spopen]'); if (o) { e.preventDefault(); openSym(o.dataset.spopen); return; }
  const b = e.target.closest('[data-spbt]'); if (b) { ST.setup.sym = b.dataset.spbt; showTab('bots'); renderSetup(); return; }
  const c = e.target.closest('#trSpot [data-socopy]'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.socopy).then(() => toast('Contract address copied', 'acc', 1500)); }
});
