/* ExTerm app — part B: Heat Map, Bots & Backtest, Portfolio */

/* ───────────── HEAT MAP ───────────── */
const heat = { items: [], src: '', full: false, ts: 0, loading: false, global: null, fng: null, tiles: {}, W: 0, H: 0 };
const HEAT_SCALE = { '1h': 2, '24h': 6, '7d': 15 };
const ocHeat = { syms: [], ts: 0, loading: false, err: '', key: '' };
const OC_HEAT_SCALE = { '5m': 4, '1h': 10, '6h': 20, '24h': 40 };
async function loadOcHeat(force) {
  const H = ST.heat, key = (H.ocKind || 'trending') + ':' + (H.ocChain || 'solana');
  if (ocHeat.loading || (!force && ocHeat.key === key && Date.now() - ocHeat.ts < 90000)) return;
  ocHeat.loading = true; $('#heatNote').textContent = 'Loading on-chain pools…';
  try { ocHeat.syms = await OC.discover(H.ocKind || 'trending', H.ocChain || 'solana', force); ocHeat.err = ''; ocHeat.key = key; ocHeat.ts = Date.now(); }
  catch (e) { ocHeat.err = e.message; }
  ocHeat.loading = false; renderHeat(true);
}
function renderOcHeat(relayout) {
  const host = $('#heatHost'); if (!host.clientWidth) return;
  const H = ST.heat, per = H.ocPer || '24h', sc = OC_HEAT_SCALE[per], W = host.clientWidth, Hh = host.clientHeight;
  $('#heatScale').textContent = `±${sc}% = full colour`;
  const fld = { '5m': 'ch5m', '1h': 'ch1h', '6h': 'ch6h', '24h': 'ch24' }[per];
  const data = ocHeat.syms.map((s) => { const st = OC.stats[s] || {}, m = OC.meta[s] || {}, lv = Feed.live[s]; return { full: s, sym: OC.label(s), name: m.n, price: (lv && lv.price) || st.price, ch: st[fld], value: Math.max(1, Math.sqrt(st.vol24 || st.liq || 1)), i: { ch1h: st.ch1h, ch24h: st.ch24, mcap: st.mcap || st.fdv, vol: st.vol24, sector: (m.dex || 'DEX') + (st.liq ? ' · liquidity $' + NT.fmtCompact(st.liq) : '') } }; });
  if (relayout || W !== heat.W || Hh !== heat.H || !host.querySelector('.tile[data-oc]')) {
    heat.W = W; heat.H = Hh; heat.tiles = {}; host.innerHTML = '';
    for (const r of NT.treemap(data.map((d) => ({ value: d.value, d })), 0, 0, W, Hh)) {
      const d = r.item.d, el = document.createElement('div'); el.className = 'tile';
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      const m = Math.min(r.w, r.h), fs = Math.max(9, Math.min(26, m / 4.2));
      el.innerHTML = `<b style="font-size:${fs}px">${esc(d.sym)}</b><span class="pc" style="font-size:${Math.max(9, fs * 0.62)}px"></span>${m > 78 && r.w > 84 ? `<span class="pr" style="font-size:${Math.max(9, fs * 0.5)}px;opacity:.8"></span>` : ''}`;
      if (m < 28) el.querySelector('.pc').style.display = 'none';
      el.dataset.oc = d.full; el.dataset.sym = d.sym; host.appendChild(el); heat.tiles[d.full] = el;
    }
  }
  let up = 0, n = 0, best = null, worst = null, vol = 0, liq = 0;
  for (const d of data) {
    const el = heat.tiles[d.full]; if (!el) continue;
    el.style.background = heatColor(d.ch, sc); el.querySelector('.pc').textContent = d.ch == null ? '–' : NT.fmtPct(d.ch, Math.abs(d.ch) < 10 ? 2 : 1);
    const pr = el.querySelector('.pr'); if (pr) pr.textContent = NT.fmtTiny(d.price); el._d = d;
    vol += d.i.vol || 0; liq += (OC.stats[d.full] || {}).liq || 0;
    if (d.ch != null) { n++; if (d.ch > 0) up++; if (!best || d.ch > best.ch) best = d; if (!worst || d.ch < worst.ch) worst = d; }
  }
  const st = [['Pools', String(data.length), (H.ocKind === 'new' ? 'new pairs' : 'trending') + ' · ' + ((OC.CHAINS[H.ocChain || 'solana'] || [])[0] || ''), ''], ['24h volume', '$' + NT.fmtCompact(vol), 'across shown pools', ''], ['Liquidity', '$' + NT.fmtCompact(liq), 'total in pools', '']];
  if (n) st.push(['Breadth', Math.round((up / n) * 100) + '% green', `${up} up · ${n - up} down (${per})`, up / n > 0.5 ? 'up' : 'dn']);
  if (best) st.push(['Top gainer', best.sym, NT.fmtPct(best.ch), 'up'], ['Top loser', worst.sym, NT.fmtPct(worst.ch), 'dn']);
  $('#heatStats').innerHTML = st.map(([k, v, s, c]) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('');
  $('#heatNote').textContent = ocHeat.err ? (ocHeat.syms.length ? 'Showing the last pools · ' : 'Could not load pools: ') + ocHeat.err : `Source: ${OC.sim ? 'simulated (DEX APIs unreachable — run the launcher)' : 'GeckoTerminal'} · updated ${ocHeat.ts ? fmtClock(ocHeat.ts) : '–'} · tile size = 24h volume · click a tile to open its chart`;
}
async function loadHeat(force) {
  if (ST.heat.asset === 'onchain') return loadOcHeat(force);
  if (ST.heat.asset === 'stocks') return loadStockHeat(force);
  if (heat.loading) return;
  if (!force && heat.items.length && Date.now() - heat.ts < 90000) return;
  heat.loading = true; $('#heatNote').textContent = 'Loading market data…';
  try {
    const r = await loadMarketList(); heat.items = r.items; heat.src = r.src; heat.full = r.full; heat.ts = Date.now();
    if (!r.full && ST.heat.period !== '24h') { ST.heat.period = '24h'; buildHeatControls(); }
    Feed.subscribe(r.items.slice(0, 60).map((i) => i.sym + '-USD').filter((id) => Providers.ids.has(id)));
    $('#heatNote').textContent = '';
  } catch (e) { $('#heatNote').textContent = 'Could not load market data: ' + e.message; }
  heat.loading = false;
  if (Providers.active !== Demo) { try { heat.global = await Ext.global(); } catch (e) { heat.global = null; } try { heat.fng = await Ext.fng(); } catch (e) { heat.fng = null; } }
  renderHeat(true);
}
function heatData() {
  const H = ST.heat, per = H.period;
  let items = heat.items.filter((i) => i.price > 0);
  if (H.hide) items = items.filter((i) => !NT.STABLES.has(i.sym) && !NT.WRAPPED.has(i.sym));
  items = items.slice(0, H.top);
  return items.map((i) => {
    const id = i.sym + '-USD', lv = Feed.live[id];
    let ch = per === '1h' ? i.ch1h : per === '7d' ? i.ch7d : i.ch24h;
    if (per === '24h' && lv && lv.open24 && lv.price) ch = (lv.price / lv.open24 - 1) * 100;
    const size = H.size === 'vol' || !i.mcap ? i.vol : i.mcap;
    return { value: Math.max(size || 0, 1), sym: i.sym, name: i.name, price: lv && lv.price ? lv.price : i.price, ch, i };
  });
}
function renderHeat(relayout) {
  if (ST.heat.asset === 'onchain') return renderOcHeat(relayout);
  if (ST.heat.asset === 'stocks') return renderStockHeat(relayout);
  const host = $('#heatHost'); if (!host.clientWidth) return;
  const data = heatData(), W = host.clientWidth, H = host.clientHeight, per = ST.heat.period, sc = HEAT_SCALE[per];
  $('#heatScale').textContent = `±${sc}% = full colour`;
  if (relayout || W !== heat.W || H !== heat.H || !Object.keys(heat.tiles).length) {
    heat.W = W; heat.H = H; heat.tiles = {}; host.innerHTML = '';
    const rects = NT.treemap(data.map((d) => ({ value: d.value, d })), 0, 0, W, H);
    for (const r of rects) {
      const d = r.item.d, el = document.createElement('div'); el.className = 'tile';
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      const m = Math.min(r.w, r.h), fs = Math.max(9, Math.min(28, m / 4.2));
      el.innerHTML = `<b style="font-size:${fs}px">${esc(d.sym)}</b><span class="pc" style="font-size:${Math.max(9, fs * 0.62)}px"></span>${m > 78 && r.w > 84 ? `<span class="pr" style="font-size:${Math.max(9, fs * 0.5)}px;opacity:.8"></span>` : ''}`;
      if (m < 28) el.querySelector('.pc').style.display = 'none';
      el.dataset.sym = d.sym; host.appendChild(el); heat.tiles[d.sym] = el;
    }
  }
  let up = 0, n = 0, best = null, worst = null;
  for (const d of data) {
    const el = heat.tiles[d.sym]; if (!el) continue;
    el.style.background = heatColor(d.ch, sc);
    el.querySelector('.pc').textContent = d.ch == null ? '–' : NT.fmtPct(d.ch, Math.abs(d.ch) < 10 ? 2 : 1);
    const pr = el.querySelector('.pr'); if (pr) pr.textContent = NT.fmtPrice(d.price);
    el._d = d;
    if (d.ch != null) { n++; if (d.ch > 0) up++; if (!best || d.ch > best.ch) best = d; if (!worst || d.ch < worst.ch) worst = d; }
  }
  const g = heat.global, f = heat.fng && heat.fng[0], st = [];
  if (g) st.push(['Total market cap', NT.fmtCompact(g.mcap).replace(/^/, '$'), NT.fmtPct(g.ch24h) + ' 24h', cls(g.ch24h)], ['BTC dominance', g.btcDom.toFixed(1) + '%', 'ETH ' + g.ethDom.toFixed(1) + '%', '']);
  if (f) st.push(['Fear & Greed', f.v, f.label, f.v >= 55 ? 'up' : f.v <= 45 ? 'dn' : '']);
  if (n) st.push(['Breadth', Math.round((up / n) * 100) + '% green', `${up} up · ${n - up} down`, up / n > 0.5 ? 'up' : 'dn']);
  if (best) st.push(['Top gainer', best.sym, NT.fmtPct(best.ch), 'up'], ['Top loser', worst.sym, NT.fmtPct(worst.ch), 'dn']);
  $('#heatStats').innerHTML = st.map(([k, v, s, c]) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('');
  $('#heatNote').textContent = `Source: ${heat.src}${heat.full ? '' : ' — 1h/7d unavailable'} · updated ${heat.ts ? fmtClock(heat.ts) : '–'} · tiles recolour live from the exchange feed (24h view) · click a tile to open its chart`;
}
function buildHeatControls() {
  const H = ST.heat; H.asset = ST.mode; const stk = H.asset === 'stocks';
  if (H.asset === 'onchain') {
    $('#heatAssetTag').textContent = '⬡ On-chain · DEX pools';
    ['#heatPeriod', '#heatSize', '#heatTop'].forEach((s) => { $(s).style.display = ''; }); $('#heatHideL').style.display = 'none';
    segBtns($('#heatPeriod'), ['5m', '1h', '6h', '24h'].map((v) => ({ v, l: v })), H.ocPer || '24h', (v) => { H.ocPer = v; renderHeat(true); saveState(); });
    segBtns($('#heatSize'), [{ v: 'trending', l: '🔥 Trending' }, { v: 'new', l: '✦ New pairs' }], H.ocKind || 'trending', (v) => { H.ocKind = v; loadOcHeat(true); saveState(); });
    segBtns($('#heatTop'), Object.entries(OC.CHAINS).map(([v, c]) => ({ v, l: c[0] })), H.ocChain || 'solana', (v) => { H.ocChain = v; OC.chain = v; loadOcHeat(true); saveState(); });
    return;
  }
  $('#heatAssetTag').textContent = stk ? '▲ Stocks · S&P 500 leaders by sector' : '◆ Crypto · top coins';
  ['#heatPeriod', '#heatSize', '#heatTop', '#heatHideL'].forEach((s) => { $(s).style.display = stk ? 'none' : ''; });
  segBtns($('#heatPeriod'), [{ v: '1h', l: '1h' }, { v: '24h', l: '24h' }, { v: '7d', l: '7d' }], H.period, (v) => { if (!heat.full && v !== '24h') { toast('1h / 7d need CoinGecko data, which is unreachable right now.', 'amb'); buildHeatControls(); return; } H.period = v; renderHeat(false); saveState(); });
  segBtns($('#heatSize'), [{ v: 'mcap', l: 'Size: market cap' }, { v: 'vol', l: 'Size: volume' }], H.size, (v) => { H.size = v; renderHeat(true); saveState(); });
  segBtns($('#heatTop'), [{ v: 25, l: 'Top 25' }, { v: 50, l: 'Top 50' }, { v: 100, l: 'Top 100' }], H.top, (v) => { H.top = +v; renderHeat(true); saveState(); });
  $('#heatHide').checked = H.hide;
}
function initHeat() {
  buildHeatControls();
  $('#heatHide').onchange = (e) => { ST.heat.hide = e.target.checked; renderHeat(true); saveState(); };
  $('#heatRefresh').onclick = () => loadHeat(true);
  const host = $('#heatHost'), tip = $('#tip');
  host.onmousemove = (e) => {
    const t = e.target.closest('.tile'); if (!t || !t._d) { tip.style.display = 'none'; return; }
    const d = t._d, i = d.i;
    tip.innerHTML = `<b>${esc(d.sym)}</b> <span class="mut">${esc(d.name || '')}</span><br><span class="mono">${NT.fmtPrice(d.price)}</span><br>` +
      [['1h', i.ch1h], ['24h', d.ch != null && ST.heat.period === '24h' ? d.ch : i.ch24h], ['7d', i.ch7d]].filter((x) => x[1] != null).map((x) => `<span class="mut">${x[0]}</span> <span class="${cls(x[1])} mono">${NT.fmtPct(x[1])}</span>`).join(' &nbsp; ') +
      (i.sector ? `<br><span class="mut">${esc(i.sector)}</span>` : '') + (i.mcap ? `<br><span class="mut">Mkt cap</span> <span class="mono">$${NT.fmtCompact(i.mcap)}</span>` : '') + (i.vol ? `<br><span class="mut">24h vol</span> <span class="mono">$${NT.fmtCompact(i.vol)}</span>` : '') + (i.rank ? `<br><span class="mut">Rank</span> #${i.rank}` : '');
    tip.style.display = 'block'; tip.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px'; tip.style.top = Math.min(window.innerHeight - 160, e.clientY + 14) + 'px';
  };
  host.onmouseleave = () => { tip.style.display = 'none'; };
  host.onclick = (e) => {
    const t = e.target.closest('.tile'); if (!t) return;
    if (t.dataset.oc) { openSym(t.dataset.oc); return; }
    if (t.dataset.stock) { selectSym(t.dataset.sym); showTab('markets'); return; }
    const id = t.dataset.sym + '-USD';
    if (Providers.ids.has(id)) { selectSym(id); showTab('markets'); } else toast(`${esc(t.dataset.sym)} isn't listed on ${esc(Providers.active.name)}`, 'amb');
  };
  if (typeof ResizeObserver !== 'undefined') { let to = 0; new ResizeObserver(() => { clearTimeout(to); to = setTimeout(() => { if (curTab === 'heat') renderHeat(true); }, 120); }).observe(host); }
}
TABS.heat = { show() { loadHeat(false); setTimeout(() => renderHeat(true), 30); }, render() { if (ST.heat.asset === 'onchain' ? ocHeat.syms.length : heat.items.length) renderHeat(false); } };

/* ───────────── BOTS ───────────── */
const PRESETS = [
  ['EMA 9/21 · BTC 1h', { strat: 'smacross', sym: 'BTC', tf: '1h' }], ['RSI · ETH 15m', { strat: 'rsi', sym: 'ETH', tf: '15m' }], ['Bollinger · XRP 15m', { strat: 'bollinger', sym: 'XRP', tf: '15m' }],
  ['MACD · SOL 1h', { strat: 'macd', sym: 'SOL', tf: '1h' }], ['Turtle breakout · BTC 4h', { strat: 'donchian', sym: 'BTC', tf: '4h' }], ['Grid · SOL 5m', { strat: 'grid', sym: 'SOL', tf: '5m' }],
  ['DCA · BTC 1h', { strat: 'dca', sym: 'BTC', tf: '1h' }], ['Whale-flow · ETH 5m', { strat: 'whaleflow', sym: 'ETH', tf: '5m' }],
  ['Order Block · BTC 15m', { strat: 'orderblock', sym: 'BTC', tf: '15m' }], ['Liquidity Sweep · ETH 15m', { strat: 'liqsweep', sym: 'ETH', tf: '15m' }], ['FVG · SOL 15m', { strat: 'fvg', sym: 'SOL', tf: '15m' }],
  ['Supertrend · BTC 1h', { strat: 'supertrend', sym: 'BTC', tf: '1h' }], ['TTM Squeeze · ETH 1h', { strat: 'squeeze', sym: 'ETH', tf: '1h' }],
  ['EMA · SPY 1h', { strat: 'smacross', sym: 'SPY', tf: '1h', stock: 1 }], ['RSI · NVDA 15m', { strat: 'rsi', sym: 'NVDA', tf: '15m', stock: 1 }], ['Breakout · TSLA 1d', { strat: 'donchian', sym: 'TSLA', tf: '1d', stock: 1 }],
  ['Order Block · NVDA 1h', { strat: 'orderblock', sym: 'NVDA', tf: '1h', stock: 1 }], ['Liquidity Sweep · AAPL 15m', { strat: 'liqsweep', sym: 'AAPL', tf: '15m', stock: 1 }], ['Golden Cross · SPY 1d', { strat: 'goldencross', sym: 'SPY', tf: '1d', stock: 1 }],
  ['TTM Squeeze · QQQ 1h', { strat: 'squeeze', sym: 'QQQ', tf: '1h', stock: 1 }], ['ORB · TSLA 5m', { strat: 'orb', sym: 'TSLA', tf: '5m', stock: 1 }], ['Pivot Bounce · SPY 15m', { strat: 'pivot', sym: 'SPY', tf: '15m', stock: 1 }],
];
const presetsForMode = () => PRESETS.map((p, i) => [p, i]).filter(([p]) => !!p[1].stock === (ST.mode === 'stocks'));
function stratOptions(sel) {
  const groups = {}; for (const [k, v] of Object.entries(NT.strategies)) { if (ST.mode === 'stocks' && v.cat === 'On-chain') continue; (groups[v.cat || 'Other'] = groups[v.cat || 'Other'] || []).push([k, v]); } for (const g of Object.values(groups)) g.sort((a, b2) => (b2[1].pro ? 1 : 0) - (a[1].pro ? 1 : 0));
  return (NT.STRAT_CATS || Object.keys(groups)).filter((c) => groups[c]).map((c) => `<optgroup label="${esc(c)} (${groups[c].length})">${groups[c].map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.name)}${v.liveOnly ? ' (live only)' : ''}</option>`).join('')}</optgroup>`).join('');
}
let botOpen = {}, btBusy = false, lastBt = null;
function readSetup() {
  const S = ST.setup, g = (id) => { const e = $('#' + id); return e ? e.value : ''; };
  S.strat = g('suStrat') || S.strat; S.sym = g('suSym') || S.sym; S.tf = g('suTf') || S.tf;
  S.capital = parseFloat(g('suCap')) || 10000; S.posPct = parseFloat(g('suPos')) || 100;
  S.sl = g('suSl'); S.tp = g('suTp'); S.trail = g('suTr'); S.bars = g('btBars') || S.bars;
  S.enh = S.enh || {}; $$('#btForm [data-enh]').forEach((i) => { S.enh[i.dataset.enh] = Math.max(0, parseFloat(i.value) || 0); });
  S.params = {}; $$('#botForm [data-p]').forEach((i) => { const v = parseFloat(i.value); S.params[i.dataset.p] = isFinite(v) ? v : NT.strategies[S.strat].params.find((q) => q.k === i.dataset.p).def; });
  return S;
}
function normSym(x) { if (/^oc:/.test(String(x || '').trim())) { const r = String(x).trim(); return OC.is(r) ? r : 'BTC-USD'; } x = String(x || '').trim().toUpperCase(); if (!x) return 'BTC-USD'; if (/-USD$/.test(x) || STOCK_SET.has(x)) return x; if (NT.NAMES[x.toLowerCase()]) x = NT.NAMES[x.toLowerCase()]; return Providers.ids && Providers.ids.has(x + '-USD') ? x + '-USD' : x; }
function renderSetup() {
  const S = ST.setup, strat = NT.strategies[S.strat]; S.sym = normSym(S.sym);
  if (S.paramsFor !== S.strat) { S.params = Object.assign(NT.defaultParams(S.strat), S.paramsOverride || {}); S.paramsFor = S.strat; S.paramsOverride = null; }
  $('#botForm').innerHTML = `
  <div class="pgrid">
    <label class="f" style="grid-column:1/3">Strategy<select class="in" id="suStrat">${stratOptions(S.strat)}</select></label>
    <div class="desc" style="grid-column:1/3"><span class="tag acc" style="margin-bottom:4px">${esc(strat.cat || '')}</span><br>${esc(strat.desc)}</div>
    <label class="f" style="grid-column:1/3">Market — any crypto or stock<div>${SymPick.field('suSym', S.sym)}</div></label>
    <label class="f">Timeframe<select class="in" id="suTf">${TF_LIST.map((t) => `<option ${t === S.tf ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${strat.params.map((p) => `<label class="f">${esc(p.label)}<input class="in mono" data-p="${p.k}" value="${S.params[p.k] != null ? S.params[p.k] : p.def}" inputmode="decimal"></label>`).join('')}
    <label class="f">Capital (USD)<input class="in mono" id="suCap" value="${S.capital}" inputmode="decimal"></label>
    <label class="f">Size per entry %<input class="in mono" id="suPos" value="${S.posPct}" inputmode="decimal"></label>
    <label class="f">Stop-loss %<input class="in mono" id="suSl" value="${esc(S.sl)}" placeholder="off" inputmode="decimal"></label>
    <label class="f">Take-profit %<input class="in mono" id="suTp" value="${esc(S.tp)}" placeholder="off" inputmode="decimal"></label>
    <label class="f">Trailing stop %<input class="in mono" id="suTr" value="${esc(S.trail)}" placeholder="off" inputmode="decimal"></label>
  </div>
  <div class="row" style="margin-top:12px"><button class="btn pri" id="suCreate">Create &amp; start bot</button><button class="btn" id="suBt">Backtest this setup →</button></div>
  <div class="sec">Quick presets</div>
  <div class="row" id="suPresets">${presetsForMode().map(([p, i]) => `<span class="chip" data-i="${i}">${esc(p[0])}</span>`).join('')}</div>
  <div class="sec">Starter pack</div>
  <div class="row"><button class="btn sm" id="suPack">${ST.mode === 'stocks' ? 'Launch 4 stock bots (5m / 15m)' : ST.mode === 'onchain' ? 'Launch 4 on-chain bots on your watchlist' : 'Launch 4 fast crypto bots (1m / 5m)'}</button></div>
  <div class="note" style="margin-top:6px">Bots trade a virtual wallet per bot and only run while this page is open. Fees &amp; slippage come from Settings.</div>`;
  $('#stratCount').textContent = Object.keys(NT.strategies).length + ' strategies';
  $('#suStrat').onchange = () => { const v = $('#suStrat').value; ST.setup.strat = v; ST.setup.paramsFor = null; readSetupLite(); renderSetup(); };
  $('#suCreate').onclick = () => { const s = readSetup(); createBot(s); };
  $('#suBt').onclick = () => { readSetup(); runBacktest(); };
  $('#suPresets').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; const p = PRESETS[+c.dataset.i][1]; readSetupLite(); Object.assign(ST.setup, { strat: p.strat, sym: p.stock ? p.sym : p.sym + '-USD', tf: p.tf, paramsFor: null }); renderSetup(); renderBtHeader(); };
  $('#suPack').onclick = launchPack;
  SymPick.bind($('#botForm'), (s) => { readSetupLite(); ST.setup.sym = s; renderBtHeader(); saveState(); });
  renderBtHeader();
}
function readSetupLite() { const S = ST.setup, v = (id) => { const e = $('#' + id); return e ? e.value : null; }; if (v('suSym')) S.sym = v('suSym'); if (v('suTf')) S.tf = v('suTf'); if (v('suCap')) S.capital = parseFloat(v('suCap')) || S.capital; }
function createBot(cfg) {
  const sym = normSym(cfg.sym); if (!sym) return toast('Unknown symbol “' + esc(cfg.sym) + '”', 'amb');
  const st = NT.strategies[cfg.strat]; if (!st) return;
  const b = {
    id: NT.uid(), name: cfg.name || `${st.name.split(' ')[0]} ${baseOf(sym)} ${cfg.tf}`, strat: cfg.strat, sym, tf: cfg.tf,
    params: Object.assign(NT.defaultParams(cfg.strat), cfg.params || {}), capital: cfg.capital || 10000, posPct: (cfg.posPct || 100) / 100,
    sl: (parseFloat(cfg.sl) || 0) / 100, tp: (parseFloat(cfg.tp) || 0) / 100, trail: (parseFloat(cfg.trail) || 0) / 100,
    run: true, account: new NT.Account({ cash: cfg.capital || 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 }), state: {}, lastBar: 0, created: Date.now(), lastSig: '', _rt: {},
  };
  ST.bots.push(b); Feed.subscribe([sym]); getStore(sym, b.tf).load(400);
  renderBots(true); saveState(); toast(`🤖 Bot <b>${esc(b.name)}</b> started with ${NT.fmtUSD(b.capital, 0)}`, 'up'); return b;
}
function launchPack() {
  const mk = (strat, sym, tf, extra) => createBot(Object.assign({ strat, sym, tf, capital: 5000, posPct: 100, sl: '', tp: '', trail: '', params: {} }, extra));
  if (ST.mode === 'onchain') {
    const w = ST.watch.filter(isOnchain); if (!w.length) return toast('Add some on-chain tokens to your watchlist first', 'amb');
    const pick = (k) => w[k % w.length];
    mk('rsi', pick(0), '5m', { params: { period: 7, buyBelow: 30, sellAbove: 60 }, sl: '8', name: 'RSI dip ' + baseOf(pick(0)) });
    mk('supertrend', pick(1), '5m', { params: { p: 10, m: 3 }, sl: '10', name: 'Trend ' + baseOf(pick(1)) });
    mk('squeeze', pick(2), '15m', { sl: '10', name: 'Squeeze ' + baseOf(pick(2)) });
    mk('smacross', pick(3), '5m', { params: { fast: 8, slow: 21 }, sl: '8', trail: '12', name: 'MA cross ' + baseOf(pick(3)) });
    return;
  }
  if (ST.mode === 'stocks') { mk('rsi', 'SPY', '5m', { params: { period: 7, buyBelow: 35, sellAbove: 55 } }); mk('supertrend', 'NVDA', '15m', { params: { p: 10, m: 2 } }); mk('liqsweep', 'AAPL', '5m'); mk('squeeze', 'QQQ', '15m'); return; }
  mk('rsi', 'BTC', '1m', { params: { period: 7, buyBelow: 35, sellAbove: 55 }, sl: '1.5' });
  mk('smacross', 'ETH', '1m', { params: { fast: 5, slow: 13 } });
  mk('grid', 'SOL', '1m', { params: { levels: 8, range: 1.5 } });
  mk('bollinger', 'XRP', '5m', { params: { period: 20, mult: 2 } });
}
function botStats(b) {
  const a = b.account, p = px(b.sym), eq = a.equity({ [b.sym]: p }), pnl = eq - a.cash0, st = NT.stats(a.eq.map((x) => x.v).concat([eq]), a.trades, 0);
  return { eq, pnl, pct: (pnl / a.cash0) * 100, st };
}
let holdBots = 0, lastBotRender = 0;
function renderBots(force) {
  if (!force && Date.now() < holdBots) return;
  lastBotRender = Date.now();
  const host = $('#botList'); $('#botNote').textContent = ST.bots.length ? `${ST.bots.filter((b) => b.run).length} running · ${ST.bots.length} total` : '';
  const allBots = ST.bots, here = (b) => modeOf(b.sym) === ST.mode; const shown = allBots.filter(here).concat(allBots.filter((b) => !here(b)));
  if (!ST.bots.length) { host.innerHTML = '<div class="empty" style="grid-column:1/-1">No bots yet. Pick a strategy on the left, or hit <b>Launch 4 fast demo bots</b> to see paper trading in action.</div>'; return; }
  host.innerHTML = shown.map((b) => {
    const s = botStats(b), a = b.account, strat = NT.strategies[b.strat], pos = a.pos[b.sym], rt = b._rt || {};
    const status = !b.run ? '<span class="tag">paused</span>' : rt.err ? `<span class="tag dn" title="${esc(rt.err)}">error</span>` : rt.status === 'loading' ? '<span class="tag amb">loading…</span>' : '<span class="tag up">● running</span>';
    const pp = Object.entries(b.params).map(([k, v]) => `${k} ${v}`).join(' · ');
    const trades = botOpen[b.id] ? `<div class="scroll" style="max-height:170px;margin-top:4px"><table><thead><tr><th>Time</th><th>Side</th><th class="r">Price</th><th class="r">P&amp;L</th><th>Why</th></tr></thead><tbody>${a.trades.slice(-25).reverse().map((t) => `<tr><td class="mut">${fmtStamp(t.ts)}</td><td class="${t.side === 'buy' ? 'up' : 'dn'}">${t.side}</td><td class="r num">${NT.fmtPrice(t.price)}</td><td class="r num ${cls(t.pnl)}">${t.pnl == null ? '' : NT.fmtUSD(t.pnl)}</td><td class="mut">${esc(t.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">no trades yet</td></tr>'}</tbody></table></div>` : '';
    return `<div class="bot ${b.run ? '' : 'off'}" data-id="${b.id}">
      <h4>${esc(b.name)} ${status}<span style="flex:1"></span><span class="tag acc">${esc(baseOf(b.sym))} · ${b.tf}</span></h4>
      <div class="note">${esc(strat.name)} — ${esc(pp)}${b.sl ? ` · SL ${(b.sl * 100).toFixed(1)}%` : ''}${b.tp ? ` · TP ${(b.tp * 100).toFixed(1)}%` : ''}${b.trail ? ` · trail ${(b.trail * 100).toFixed(1)}%` : ''}</div>
      <canvas class="mini" data-spark="${b.id}"></canvas>
      <div class="kv">
        <div><span class="k">Equity</span><span class="v">${NT.fmtUSD(s.eq, 0)}</span></div>
        <div><span class="k">P&amp;L</span><span class="v ${cls(s.pnl)}">${NT.fmtUSD(s.pnl, 0)} <small>${NT.fmtPct(s.pct, 1)}</small></span></div>
        <div><span class="k">Trades / win</span><span class="v">${s.st.closed}${s.st.winRate != null ? ' / ' + s.st.winRate.toFixed(0) + '%' : ''}</span></div>
      </div>
      <div class="note">${pos ? `Holding <b class="mono" style="color:var(--text)">${NT.fmtQty(pos.qty)} ${esc(baseOf(b.sym))}</b> @ ${NT.fmtPrice(a.avg(b.sym))}` : 'Flat'} · ${rt.err ? '<span class="dn">' + esc(rt.err) + '</span>' : b.lastSig ? 'last: ' + esc(b.lastSig) : 'waiting for a signal'}</div>
      <div class="row"><button class="btn sm" data-act="toggle">${b.run ? 'Pause' : 'Resume'}</button><button class="btn sm" data-act="trades">${botOpen[b.id] ? 'Hide' : 'Trades'} (${a.trades.length})</button><button class="btn sm" data-act="bt">Backtest</button><button class="btn sm ${b.manual ? 'on' : ''}" data-act="manual" title="Manual approval: signals wait for you instead of executing">${b.manual ? '✋ Manual' : '⚡ Auto'}</button>${pos ? '<button class="btn sm sell" data-act="close">Close position</button>' : ''}<button class="btn sm" data-act="reset">Reset</button><button class="btn sm" data-act="del">Delete</button></div>
      ${trades}</div>`;
  }).join('');
  for (const b of shown) {
    const c = $(`canvas[data-spark="${b.id}"]`); if (!c) continue;
    const v = b.account.eq.map((x) => x.v); const cur = botStats(b).eq; v.push(cur);
    drawSpark(c, v, cur >= b.account.cash0 ? '#26c281' : '#ef5350');
  }
}
function drawSpark(cv, v, color) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (v.length < 2) { g.fillStyle = '#7c869a'; g.font = '11px system-ui'; g.fillText('equity curve builds as the bot runs', 4, H / 2); return; }
  const lo = Math.min(...v), hi = Math.max(...v) || 1, rg = hi - lo || 1;
  g.beginPath(); v.forEach((y, i) => { const px_ = (i / (v.length - 1)) * (W - 2) + 1, py_ = H - 4 - ((y - lo) / rg) * (H - 8); i ? g.lineTo(px_, py_) : g.moveTo(px_, py_); });
  g.strokeStyle = color; g.lineWidth = 1.6; g.stroke(); g.lineTo(W - 1, H); g.lineTo(1, H); g.closePath(); g.fillStyle = color + '1c'; g.fill();
}
const armed = new WeakMap();
function confirmClick(btn, fn) { if (armed.get(btn)) { armed.delete(btn); holdBots = 0; fn(); return; } armed.set(btn, 1); holdBots = Date.now() + 3000; const t = btn.textContent; btn.textContent = 'Sure?'; setTimeout(() => { armed.delete(btn); holdBots = 0; if (btn.isConnected) btn.textContent = t; }, 3000); }
/* ───────────── Bot control center: kill switch, close positions, manual approvals, order control ───────────── */
function closeBotPos(b, why) { const p = b.account.pos[b.sym]; if (!p) return null; const pr = px(b.sym) || b.account.avg(b.sym); const t = b.account.sell(b.sym, pr, null, Date.now(), { reason: why || 'closed manually', src: 'bot:' + b.name }); if (t) tradeToast(t, b.name); return t; }
function fillPending(id, price) {
  const q = (ST.pending || []).find((x) => x.id === id); if (!q) return; const b = ST.bots.find((x) => x.id === q.botId);
  if (!b) { ST.pending = ST.pending.filter((x) => x.id !== id); renderBotCtl(); return; }
  const pr = price || px(q.sym) || q.ref; const t = NT.execSignal(b.account, q.sym, q.sig, pr, Date.now(), { src: 'bot:' + b.name + ' (approved)', posPct: b.posPct, slPct: b.sl, tpPct: b.tp, trailPct: b.trail });
  ST.pending = ST.pending.filter((x) => x.id !== id);
  if (t) { b.lastSig = `${t.side} ${NT.fmtQty(t.qty)} @ ${NT.fmtPrice(t.price)}: approved by you`; tradeToast(t, b.name + ' (approved)'); } else toast('Nothing to fill: ' + (q.side === 'sell' ? 'the bot has no position to sell' : 'no cash left in that bot'), 'amb');
  renderBotCtl(); renderBots(true); saveState();
}
function renderBotCtl() {
  const el = $('#botCtl'); if (!el) return;
  const bots = ST.bots, run = bots.filter((b) => b.run).length, open = bots.filter((b) => b.account.pos[b.sym]).length, man = bots.filter((b) => b.manual).length, P = ST.pending || [], ord = ACC.orders || [];
  el.innerHTML = `<div class="ctl-head"><div><b>🎛 Bot control center</b><div class="note">${bots.length} bots · ${run} running · ${open} holding a position · ${man} on manual approval</div></div><span class="sp"></span>
    <button class="btn sm" data-ctl="pauseall" ${run ? '' : 'disabled'}>⏸ Pause all</button><button class="btn sm" data-ctl="resumeall" ${bots.length && run < bots.length ? '' : 'disabled'}>▶ Resume all</button>
    <button class="btn sm" data-ctl="manualall">✋ All to manual</button><button class="btn sm" data-ctl="autoall">⚡ All to auto</button>
    <button class="btn sm sell" data-ctl="closeall" ${open ? '' : 'disabled'}>Close all bot positions</button><button class="btn sm kill" data-ctl="kill">⏹ STOP EVERYTHING</button></div>
    <div class="ctl-grid"><div><div class="sec">⏳ Signals waiting for approval (${P.length})</div>${P.length ? `<table><thead><tr><th>Bot</th><th>Signal</th><th class="r">Signal px</th><th class="r">Now</th><th>Age</th><th></th></tr></thead><tbody>${P.map((q) => { const now = px(q.sym); return `<tr><td>${esc(q.bot)}</td><td><b class="${q.side === 'buy' ? 'up' : 'dn'}">${q.side.toUpperCase()}</b> ${esc(baseOf(q.sym))}<div class="note">${esc(q.sig.reason || '')}</div></td><td class="r num">${NT.fmtPrice(q.ref)}</td><td class="r num">${NT.fmtPrice(now)}</td><td class="mut">${ago(q.ts)}</td><td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn xs buy" data-pfill="${q.id}">Fill at market</button><input class="in mono xs" data-ppx="${q.id}" placeholder="price" style="width:80px"><button class="btn xs" data-pfillpx="${q.id}">Fill at price</button><button class="btn xs" data-prej="${q.id}">Reject</button></div></td></tr>`; }).join('')}</tbody></table>` : '<div class="note">Nothing waiting. Switch a bot to <b>✋ Manual</b> and its buy/sell signals will queue here for you to fill or reject. Its stop-loss and take-profit exits still protect open positions automatically.</div>'}</div>
    <div><div class="sec">📋 Open limit orders (${ord.length})</div>${ord.length ? `<table><tbody>${ord.map((o) => `<tr><td><b>${esc(baseOf(o.sym))}</b></td><td class="${o.side === 'buy' ? 'up' : 'dn'}">limit ${o.side}</td><td class="r num">@ ${NT.fmtPrice(o.price)}</td><td class="r num">${o.side === 'buy' ? NT.fmtUSD(o.size, 0) : NT.fmtQty(o.size)}</td><td class="r"><button class="btn xs buy" data-ofill="${o.id}">Fill now</button><button class="btn xs" data-ocancel="${o.id}">Cancel</button></td></tr>`).join('')}</tbody></table>` : '<div class="note">No open limit orders. Place one from the Markets order ticket; you can fill it early or cancel it here.</div>'}</div></div>`;
}
function botCtlAction(e) {
  const t = e.target.closest('[data-ctl],[data-pfill],[data-pfillpx],[data-prej],[data-ofill],[data-ocancel]'); if (!t) return; const d = t.dataset;
  if (d.ctl === 'pauseall') { ST.bots.forEach((b) => { b.run = false; }); toast('⏸ All bots paused: no new signals', 'acc'); }
  else if (d.ctl === 'resumeall') { ST.bots.forEach((b) => { b.run = true; b.lastBar = 0; }); toast('▶ All bots running', 'acc'); }
  else if (d.ctl === 'manualall') { ST.bots.forEach((b) => { b.manual = true; }); toast('✋ Every bot now waits for your approval', 'acc'); }
  else if (d.ctl === 'autoall') { ST.bots.forEach((b) => { b.manual = false; }); ST.pending = []; toast('⚡ Every bot executes automatically', 'acc'); }
  else if (d.ctl === 'closeall') { return confirmClick(t, () => { let n = 0; ST.bots.forEach((b) => { if (closeBotPos(b, 'closed from control center')) n++; }); toast(`Closed ${n} bot position${n === 1 ? '' : 's'}`, 'acc'); renderBots(true); renderBotCtl(); saveState(); }); }
  else if (d.ctl === 'kill') { return confirmClick(t, () => { let n = 0; ST.bots.forEach((b) => { b.run = false; if (closeBotPos(b, 'STOP EVERYTHING')) n++; }); ST.pending = []; for (const o of ACC.orders.slice()) ACC.cancel(o.id); toast(`⏹ Everything stopped: all bots paused, ${n} position${n === 1 ? '' : 's'} closed, pending signals and limit orders cancelled`, 'dn', 9000); renderBots(true); renderBotCtl(); saveState(); }); }
  else if (d.pfill) return fillPending(d.pfill);
  else if (d.pfillpx) { const v = parseFloat(($(`[data-ppx="${d.pfillpx}"]`) || {}).value); if (!(v > 0)) return toast('Type the fill price first', 'amb'); return fillPending(d.pfillpx, v); }
  else if (d.prej) { ST.pending = (ST.pending || []).filter((x) => x.id !== d.prej); toast('Signal rejected', 'acc'); }
  else if (d.ofill) { const o = ACC.orders.find((x) => x.id === d.ofill); if (o) { const pr = px(o.sym); const tr2 = o.side === 'buy' ? ACC.buy(o.sym, pr, o.size, Date.now(), Object.assign({ reason: 'limit filled early (manual)', src: 'manual' }, o.meta || {})) : ACC.sell(o.sym, pr, o.size, Date.now(), { reason: 'limit filled early (manual)', src: 'manual' }); ACC.cancel(o.id); if (tr2) tradeToast(tr2, 'Paper account'); else toast('Could not fill: not enough cash or position', 'amb'); } }
  else if (d.ocancel) { ACC.cancel(d.ocancel); toast('Limit order cancelled', 'acc'); }
  renderBots(true); renderBotCtl(); saveState();
}
function botAction(e) {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('.bot').dataset.id, b = ST.bots.find((x) => x.id === id); if (!b) return;
  const act = btn.dataset.act;
  if (act === 'toggle') { b.run = !b.run; if (b.run) b.lastBar = 0; renderBots(true); saveState(); }
  else if (act === 'trades') { botOpen[id] = !botOpen[id]; renderBots(true); }
  else if (act === 'bt') { Object.assign(ST.setup, { strat: b.strat, sym: b.sym, tf: b.tf, capital: b.capital, paramsFor: null, paramsOverride: b.params }); renderSetup(); runBacktest(); window.scrollTo(0, 0); $('#tab-bots').scrollTop = 0; }
  else if (act === 'reset') confirmClick(btn, () => { b.account = new NT.Account({ cash: b.capital, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 }); b.state = {}; b.lastBar = 0; b.lastSig = ''; renderBots(true); saveState(); });
  else if (act === 'del') confirmClick(btn, () => { closeBotPos(b, 'bot deleted'); ST.bots = ST.bots.filter((x) => x.id !== id); ST.pending = (ST.pending || []).filter((q) => q.botId !== id); renderBots(true); renderBotCtl(); saveState(); });
  else if (act === 'manual') { b.manual = !b.manual; if (!b.manual) ST.pending = (ST.pending || []).filter((q) => q.botId !== id); toast(b.manual ? `✋ ${esc(b.name)}: signals now wait for your approval` : `⚡ ${esc(b.name)}: signals execute automatically`, 'acc'); renderBots(true); renderBotCtl(); saveState(); }
  else if (act === 'close') { closeBotPos(b, 'closed manually'); renderBots(true); saveState(); }
}
function botLoop() {
  for (const b of ST.bots) {
    if (!b.run) continue;
    const rt = b._rt || (b._rt = {}), store = getStore(b.sym, b.tf);
    if (!store.loaded) { rt.status = 'loading'; if (!store.loading && (!rt.lastTry || Date.now() - rt.lastTry > 20000)) { rt.lastTry = Date.now(); store.load(400); } if (store.err) rt.err = 'candles: ' + store.err; continue; }
    rt.status = 'running'; rt.err = null;
    const closed = store.candles.slice(0, -1); if (closed.length < 10) continue;
    const lc = closed[closed.length - 1];
    if (lc.t > b.lastBar) { b.lastBar = lc.t; try { runBotBar(b, closed); } catch (e) { rt.err = e.message; console.error('bot', b.name, e); } }
  }
}
function runBotBar(b, closed) {
  const st = NT.strategies[b.strat], a = b.account, i = closed.length - 1, price = px(b.sym) || closed[i].c;
  const S = st.prepare(closed, b.params), p = a.pos[b.sym], pos = p ? { qty: p.qty, avg: a.avg(b.sym) } : null;
  const sigs = st.onBar(i, S, closed, { pos, state: b.state, params: b.params, price, cash: a.cash, cash0: a.cash0, ext: { whale: (w) => Whale.forSym(b.sym, w) } }) || [];
  for (const sg of sigs) {
    if (b.manual) { // manual-approval mode: queue the signal for the user instead of executing it
      ST.pending = (ST.pending || []).filter((q) => !(q.botId === b.id && q.side === sg.side));
      ST.pending.unshift({ id: NT.uid(), ts: Date.now(), botId: b.id, bot: b.name, sym: b.sym, side: sg.side, sig: { side: sg.side, frac: sg.frac, usd: sg.usd, qty: sg.qty, reason: sg.reason }, ref: price });
      ST.pending = ST.pending.slice(0, 50); b.lastSig = `⏳ ${sg.side} signal waiting for your approval — ${sg.reason || ''}`;
      toast(`⏳ <b>${esc(b.name)}</b> wants to <b>${sg.side.toUpperCase()}</b> ${esc(baseOf(b.sym))} @ ${NT.fmtPrice(price)}: approve it in Bots › Control center`, 'amb', 8000); renderBotCtl(); continue;
    }
    const t = NT.execSignal(a, b.sym, sg, price, Date.now(), { src: 'bot:' + b.name, posPct: b.posPct, slPct: b.sl, tpPct: b.tp, trailPct: b.trail });
    if (t) { b.lastSig = `${t.side} ${NT.fmtQty(t.qty)} @ ${NT.fmtPrice(t.price)} — ${t.reason}`; tradeToast(t, b.name); }
  }
}

/* ── backtest worker (keeps the UI smooth on 100k-candle runs) ── */
const BTW = {
  w: null, id: 0, cb: {}, failed: false,
  get() {
    if (this.w || this.failed) return this.w;
    try { this.w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); this.w.onmessage = (e) => { const c = this.cb[e.data.id]; if (!c) return; if (e.data.done) { delete this.cb[e.data.id]; e.data.error ? c.rej(new Error(e.data.error)) : c.res(e.data); } else if (c.prog) c.prog(e.data); }; this.w.onerror = (e) => { console.warn('worker', e.message); }; }
    catch (e) { this.failed = true; this.w = null; }
    return this.w;
  },
  run(msg, prog) {
    const w = this.get();
    if (!w) return Promise.resolve(BTW.local(msg, prog));
    return new Promise((res, rej) => { const id = ++this.id; this.cb[id] = { res, rej, prog }; w.postMessage(Object.assign({ id, specs: NT.Spec ? NT.Spec.list() : [] }, msg)); });
  },
  local(m) { // main-thread fallback
    if (m.type === 'bt') { const st = NT.strategies[m.strat]; return { res: NT.backtest(m.candles, st, m.params, m.o), opt: m.optimize ? NT.optimize(m.candles, st, m.params, m.o) : null }; }
    const rows = Object.keys(NT.strategies).filter((k) => !NT.strategies[k].liveOnly).map((id) => { const st = NT.strategies[id], r = NT.backtest(m.candles, st, NT.defaultParams(id), m.o); return { id, name: st.name, cat: st.cat, ret: r.stats.ret, dd: r.stats.maxDD, trades: r.stats.closed, win: r.stats.winRate, pf: r.stats.profitFactor, sharpe: r.stats.sharpe }; });
    return { rows };
  },
};
function btTradeRow(t) { return `<tr><td class="mut">${fmtStamp(t.ts * 1000)}</td><td class="${t.side === 'buy' ? 'up' : 'dn'}">${esc(t.side)}</td><td class="r num">${NT.fmtPrice(t.price)}</td><td class="r num">${NT.fmtQty(t.qty)}</td><td class="r num ${cls(t.pnl)}">${t.pnl == null ? '' : NT.fmtUSD(t.pnl)}</td><td class="mut">${esc(t.reason)}</td></tr>`; }
const ENH = [['trendEma', 'Trend filter: only buy above EMA', 'EMA length, 0 = off'], ['atrStop', 'ATR stop-loss ×', 'k × ATR(14) below entry'], ['atrTrail', 'ATR trailing stop ×', 'trails k × ATR'], ['timeStop', 'Time stop (bars)', 'exit after N bars'], ['riskPct', 'Risk per trade %', 'size off the stop distance'], ['cooldown', 'Cooldown after loss (bars)', 'skip entries after a loser'], ['delay', 'Extra latency (bars)', 'simulate slow fills']];
function btOpts(S) {
  const e = S.enh || {}, o = { cash: S.capital, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, posPct: S.posPct / 100, slPct: (parseFloat(S.sl) || 0) / 100 || undefined, tpPct: (parseFloat(S.tp) || 0) / 100 || undefined, trailPct: (parseFloat(S.trail) || 0) / 100 || undefined, tfSec: NT.TF[S.tf] };
  for (const [k] of ENH) if (+e[k] > 0) o[k] = +e[k];
  return o;
}
const enhOn = (S) => ENH.filter(([k]) => +((S.enh || {})[k]) > 0).length;
const HIST_OPTS = { 'Number of candles': [[500, '500'], [1000, '1,000'], [2000, '2,000'], [5000, '5,000'], [10000, '10,000'], [25000, '25,000'], [50000, '50,000'], [100000, '100,000'], [200000, '200,000 (max)']], 'Recent (for 15s–15m charts)': [['r:0.0417', 'Last 1 hour'], ['r:1', 'Last 24 hours'], ['r:2', 'Last 2 days']], 'Date range': [['r:7', 'Last 7 days'], ['r:30', 'Last 30 days'], ['r:90', 'Last 3 months'], ['r:180', 'Last 6 months'], ['r:365', 'Last 1 year'], ['r:730', 'Last 2 years'], ['r:1095', 'Last 3 years'], ['r:1825', 'Last 5 years'], ['r:3650', 'Last 10 years']] };
const symOf = (S) => normSym(S.sym);
const WARMUP = 300; // extra candles loaded before short windows so indicators are ready on the window's first bar
// short date windows (≤ 7 days): the backtest only trades from this timestamp (seconds); earlier candles are warm-up
function windowFrom(S) { const v = String(S.bars || ''); if (!v.startsWith('r:')) return null; const d = +v.slice(2); return d > 0 && d <= 7 ? Math.floor(Date.now() / 1000 - d * 86400) : null; }
function windowLabel(S) { const d = +String(S.bars || '').slice(2); return d < 0.05 ? 'last hour' : d <= 1 ? 'last 24 hours' : d <= 2 ? 'last 2 days' : 'last 7 days'; }
function barsFor(S) {
  const tf = NT.TF[S.tf], v = String(S.bars || 1000), sym = symOf(S);
  if (v.startsWith('r:')) { const days = +v.slice(2); const perDay = isStock(sym) ? (tf >= 86400 ? 252 / 365 : (6.5 * 3600) / tf * (252 / 365)) : 86400 / tf; return Math.max(60, Math.min(History.MAX, Math.ceil(days * perDay) + (days <= 7 ? WARMUP : 0))); }
  return Math.max(60, Math.min(History.MAX, +v || 1000));
}
function histEstimate(S) {
  const n = barsFor(S), tf = NT.TF[S.tf], stk = isStock(symOf(S));
  const days = stk ? (tf >= 86400 ? n * 365 / 252 : n * tf / (6.5 * 3600) * 365 / 252) : n * tf / 86400;
  const fromT = windowFrom(S);
  if (fromT) { const wd = +String(S.bars).slice(2), wn = Math.floor((wd * 86400) / tf); return `Tests the ${windowLabel(S)}: about ${NT.fmtQty(wn)} ${S.tf} candles, plus ${WARMUP} earlier candles to warm up indicators (no trades there).` + (wn < 30 ? ` ⚠ That's very few candles: pick a smaller timeframe (${wd < 0.05 ? '1s, 5s or 15s' : '1m or 5m'}) for a meaningful test.` : ''); }
  const span = days >= 730 ? (days / 365).toFixed(1) + ' years' : days >= 60 ? Math.round(days / 30) + ' months' : days >= 2 ? Math.round(days) + ' days' : Math.round(days * 24) + ' hours';
  let note = `≈ ${NT.fmtQty(n)} candles · ${span}`;
  if (String(S.bars).startsWith('r:') && n >= History.MAX) note += ` · capped at ${NT.fmtQty(History.MAX)} candles, so pick a bigger timeframe to cover the whole range`;
  if (!stk && Providers.active !== Demo) note += ` · ~${Math.ceil(n * (tf === 14400 ? 4 : 1) / 300)} Coinbase requests`;
  if (stk && Stocks.active !== StockDemo) { const lim = History.stockLimitDays[tf]; if (lim < 1e5 && days > lim) note += ` · ⚠ Yahoo only keeps ~${lim} days of ${S.tf} data, so use 1h or 1d for longer tests`; }
  return note;
}
const progBar = (pct, label) => `<div class="pb"><div class="note" style="margin-bottom:6px">${label}</div><div class="prog"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div></div>`;
async function loadHistory(sym, S, out) {
  const n = barsFor(S), t0 = performance.now();
  out.innerHTML = progBar(1, `Downloading ${NT.fmtQty(n)} × ${S.tf} candles for ${esc(sym)}…`);
  const rows = await History.get(sym, NT.TF[S.tf], n, (d, tot, got) => { out.innerHTML = progBar((d / tot) * 100, `Downloading ${esc(sym)} ${S.tf}: ${NT.fmtQty(got)} / ${NT.fmtQty(n)} candles · request ${d}/${tot}`); });
  rows.ms = Math.round(performance.now() - t0);
  return rows;
}

/* ── backtester ── */
function renderBtHeader() {
  const S = ST.setup;
  $('#btForm').innerHTML = `<div class="row"><span class="tag acc">${esc(NT.strategies[S.strat].name)}</span>${SymPick.field('btSymPick', normSym(S.sym), { compact: true })}<span class="tag">${S.tf}</span><span class="note">uses the setup on the left</span><span style="flex:1"></span>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px">History <select class="in" id="btBars" style="width:auto">${Object.entries(HIST_OPTS).map(([g, os]) => `<optgroup label="${g}">${os.map(([v, l]) => `<option value="${v}" ${String(v) === String(S.bars) ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <button class="btn pri" id="btRun">Run backtest</button><button class="btn" id="btOpt">Optimize params</button><button class="btn val" id="btVal2" title="Run the brutal 17-point validation checklist">🧪 Validate</button></div>
    <div class="note" id="btEst" style="margin-top:6px">${esc(histEstimate(S))}</div>
    <details class="enh" ${enhOn(S) ? 'open' : ''}><summary>⚙️ Accuracy enhancers <span class="tag ${enhOn(S) ? 'acc' : ''}">${enhOn(S) ? enhOn(S) + ' active' : 'off'}</span> <span class="note">filters, stops &amp; sizing applied on top of any strategy</span></summary>
      <div class="enhgrid">${ENH.map(([k, l, h]) => `<label class="f">${esc(l)}<input class="in mono" data-enh="${k}" value="${(S.enh || {})[k] || 0}" inputmode="decimal" title="${esc(h)}"></label>`).join('')}</div>
      <div class="row" style="margin-top:6px"><span class="chip" data-enhp="pro">Pro preset (EMA200 filter · 2×ATR stop · 1% risk · 3-bar cooldown)</span><span class="chip" data-enhp="tight">Scalp preset (1.5×ATR trail · 24-bar time stop)</span><span class="chip" data-enhp="off">All off</span></div></details>`;
  $$('[data-enh]', $('#btForm')).forEach((i) => { i.onchange = () => { readSetup(); renderBtHeader(); saveState(); }; });
  $('#btForm').querySelectorAll('[data-enhp]').forEach((c) => { c.onclick = () => { const P = { pro: { trendEma: 200, atrStop: 2, riskPct: 1, cooldown: 3 }, tight: { atrTrail: 1.5, timeStop: 24 }, off: {} }[c.dataset.enhp]; readSetup(); ST.setup.enh = Object.assign({}, P); renderBtHeader(); saveState(); toast('Enhancers updated', 'acc'); }; });
  $('#btVal2').onclick = () => { readSetup(); runValidation(); };
  const upd = () => { readSetup(); $('#btEst').textContent = histEstimate(ST.setup); renderLeaderHeader(); saveState(); };
  $('#btBars').onchange = upd; ['suSym', 'suTf'].forEach((id) => { const e = $('#' + id); if (e) e.addEventListener('change', upd); });
  $('#btRun').onclick = () => { readSetup(); runBacktest(); }; $('#btOpt').onclick = () => { readSetup(); runBacktest(true); };
  renderLeaderHeader();
  SymPick.bind($('#btForm'), (sym) => { readSetupLite(); ST.setup.sym = sym; renderSetup(); saveState(); });
}
async function runBacktest(optimize) {
  if (btBusy) return; const S = readSetup(), strat = NT.strategies[S.strat], out = $('#btResult');
  if (strat.liveOnly) { out.innerHTML = '<div class="empty">This strategy depends on live on-chain flow and can’t be backtested on historical candles.</div>'; return; }
  const sym = normSym(S.sym); if (!sym) { out.innerHTML = '<div class="empty">Unknown symbol</div>'; return; }
  btBusy = true;
  try {
    const candles = await loadHistory(sym, S, out);
    if (candles.length < 60) throw new Error('only ' + candles.length + ' candles available');
    const o = btOpts(S), fromT = windowFrom(S);
    if (fromT) { o.fromT = fromT; const inWin = candles.filter((c) => c.t >= fromT).length; if (inWin < 2) throw new Error(`only ${inWin} ${S.tf} candle${inWin === 1 ? '' : 's'} in the ${windowLabel(S)}. Pick a smaller timeframe (1s, 5s or 15s for the last hour)`); }
    const t0 = performance.now();
    out.innerHTML = progBar(optimize ? 3 : 60, `Backtesting ${esc(strat.name)} on ${NT.fmtQty(candles.length)} candles…`);
    const r = await BTW.run({ type: 'bt', strat: S.strat, params: S.params, candles, o, optimize: !!optimize }, (p) => { out.innerHTML = progBar((p.prog / p.total) * 100, `Optimizing parameters on ${NT.fmtQty(candles.length)} candles… ${p.prog}/${p.total}`); });
    const res = r.res; res.ms = Math.round(performance.now() - t0); res.dl = candles.ms;
    const shown = fromT ? Object.assign(candles.filter((c) => c.t >= fromT), { src: candles.src, ms: candles.ms }) : candles;
    lastBt = { res, S, sym, candles: shown }; renderBtResult(res, S, sym, shown, r.opt);
  } catch (e) { out.innerHTML = `<div class="empty">Backtest failed: ${esc(e.message)}</div>`; }
  btBusy = false;
}
function renderBtResult(res, S, sym, candles, opt) {
  const st = res.stats, bhRet = (candles[candles.length - 1].c / candles[0].c - 1) * 100, fin = res.eq[res.eq.length - 1];
  const stat = (k, v, c = '', s = '') => `<div class="stat" style="min-width:104px"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  $('#btResult').innerHTML = `<div class="pb">
    <div class="stats" style="margin-bottom:8px">
      ${stat('Strategy return', NT.fmtPct(st.ret), cls(st.ret), NT.fmtUSD(fin - S.capital, 0))}${stat('Buy & hold', NT.fmtPct(bhRet), cls(bhRet), 'same period')}${stat('Max drawdown', '-' + st.maxDD.toFixed(1) + '%', 'dn')}${stat('Sharpe*', st.sharpe.toFixed(2), '', 'annualised, per bar')}
      ${stat('Closed trades', st.closed, '', st.trades - st.closed + ' open/entry fills')}${stat('Win rate', st.winRate == null ? '–' : st.winRate.toFixed(0) + '%')}${stat('Profit factor', st.profitFactor == null ? '–' : st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2))}${stat('Fees paid', NT.fmtUSD(res.acct.fees, 0))}
    </div>
    ${(() => { const M = NT.metrics(res, candles, NT.TF[S.tf]); const f = (v, d = 2) => (v == null || !isFinite(v) ? '–' : v.toFixed(d)); return `<div class="stats mstats">${stat('CAGR', NT.fmtPct(M.cagr, 1), cls(M.cagr))}${stat('Sortino', f(M.sortino))}${stat('Calmar', f(M.calmar))}${stat('Expectancy', NT.fmtPct(M.expectancy), cls(M.expectancy), 'per trade')}${stat('Payoff', M.payoff == null ? '–' : f(M.payoff), '', 'avg win / avg loss')}${stat('SQN', f(M.sqn), M.sqn >= 2 ? 'up' : M.sqn < 1 ? 'dn' : '', 'system quality')}${stat('Kelly', M.kelly == null ? '–' : f(M.kelly, 1) + '%')}${stat('Exposure', f(M.exposure, 0) + '%', '', 'time in market')}${stat('Avg hold', f(M.avgHold, 1) + ' bars')}${stat('Max losing streak', M.maxConsecLoss)}${stat('Ulcer index', f(M.ulcer, 1))}${stat('Trades / month', f(M.tradesPerMonth, 1))}</div>`; })()}
    ${enhOn(S) ? `<div class="note">⚙️ ${enhOn(S)} enhancer(s) active · ${res.filtered || 0} entries filtered out</div>` : ''}
    <div class="sec" style="margin-top:4px">Price &amp; trades <span class="note" style="text-transform:none;letter-spacing:0">▲ buy · ▼ sell · scroll to zoom</span></div>
    <div id="btPrice" style="height:300px;position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden"></div>
    <div class="sec">Equity vs buy &amp; hold</div>
    <canvas id="btChart" class="cvs" style="height:200px"></canvas>
    <div class="note" style="margin:6px 0"><b>${esc(sym)} ${S.tf} · ${NT.fmtQty(candles.length)} candles</b> from ${esc(candles.src || '')} (${fmtStamp(candles[0].t * 1000)} → ${fmtStamp(candles[candles.length - 1].t * 1000)})${barsFor(S) > candles.length + 5 ? ` · <span class="amb">the source only had ${NT.fmtQty(candles.length)} of the ${NT.fmtQty(barsFor(S))} requested</span>` : ''} · downloaded in ${((res.dl || 0) / 1000).toFixed(1)}s, computed in ${((res.ms || 0) / 1000).toFixed(2)}s. Signals fill at the <b>next bar’s open</b>; fees/slippage applied. Past results don’t predict future returns${isSimProv(providerFor(sym)) ? ' — and this is <b>simulated</b> demo data' : ''}.</div>
    ${opt ? `<div class="sec">Parameter sweep — top results (beware of over-fitting)</div><table><thead><tr><th>Params</th><th class="r">Return</th><th class="r">Max DD</th><th class="r">Trades</th><th></th></tr></thead><tbody>${opt.map((r, i) => `<tr><td class="mono">${Object.entries(r.params).map(([k, v]) => k + ' ' + v).join(' · ')}</td><td class="r num ${cls(r.ret)}">${NT.fmtPct(r.ret)}</td><td class="r num dn">-${r.maxDD.toFixed(1)}%</td><td class="r num">${r.trades}</td><td class="r"><button class="btn sm" data-apply="${i}">Use</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">no result</td></tr>'}</tbody></table>` : ''}
    <div class="sec">Trades (${NT.fmtQty(res.trades.length)}${res.trades.length > 300 && typeof V156UI === 'undefined' ? ', newest 300 shown' : ''})</div>
    <div class="scroll" id="btTradesBox" style="max-height:260px"><table><thead><tr><th>Time</th><th>Side</th><th class="r">Price</th><th class="r">Qty</th><th class="r">P&amp;L</th><th>Why</th></tr></thead><tbody>${res.trades.slice(-300).reverse().map(btTradeRow).join('') || '<tr><td colspan="6" class="empty">No trades — strategy never triggered on this data</td></tr>'}</tbody></table></div></div>`;
  if (res.trades.length > 120 && typeof V156UI !== 'undefined') V156UI.virt($('#btTradesBox'), res.trades.slice().reverse(), btTradeRow); // v15.6: every trade scrollable, only the visible rows in the DOM
  drawLines($('#btChart'), [{ name: 'Strategy', color: cssv('--acc', '#7c5cff'), values: res.eq, w: 2, fill: true }, { name: 'Buy & hold', color: '#8b94a9', values: res.bh, w: 1.4 }], { fmt: (v) => (Math.abs(v) >= 1e6 ? '$' + NT.fmtCompact(v) : NT.fmtUSD(v, 0)), xs: res.t, xsSpan: NT.TF[S.tf] / 86400, base: S.capital });
  const pc = new CandleChart($('#btPrice')); pc.o = { ema: true, sma: false, bb: false, vol: true, rsi: false, macd: false, trades: true, fc: false }; pc.view.bars = Math.min(candles.length, 400);
  pc.set(candles, NT.TF[S.tf], res.trades.map((t) => ({ t: t.ts, side: t.side, price: t.price })), null, '');
  if (typeof BTArrows !== 'undefined') BTArrows.attach(pc, res.trades); // v15: win/loss round-trip arrows + hover tooltips
  $$('[data-apply]', $('#btResult')).forEach((b) => { b.onclick = () => { const r = opt[+b.dataset.apply]; Object.assign(ST.setup, { paramsFor: null, paramsOverride: r.params }); readSetupLite(); renderSetup(); toast('Parameters applied to the setup form', 'acc'); }; });
}
let lbBusy = false, lbRows = null, lbSort = 'ret', lbCtx = null;
function renderLeaderHeader() {
  const S = ST.setup;
  $('#btAll').innerHTML = `<div class="row"><span class="note">Runs all ${Object.values(NT.strategies).filter((s) => !s.liveOnly).length} backtestable strategies with default settings on <b>${esc(S.sym)}</b> · ${S.tf} · ${NT.fmtQty(barsFor(S))} candles, then ranks them.</span><span style="flex:1"></span><button class="btn pri" id="lbRun">Backtest all strategies</button></div><div id="lbOut" style="margin-top:10px"></div>`;
  $('#lbRun').onclick = runLeaderboard;
  if (lbRows) renderLeader();
}
async function runLeaderboard() {
  if (lbBusy) return; const S = readSetup(), sym = normSym(S.sym), out = $('#lbOut');
  if (!sym) { out.innerHTML = '<div class="empty">Unknown symbol</div>'; return; }
  lbBusy = true; $('#lbRun').disabled = true;
  try {
    const candles = await loadHistory(sym, S, out); if (candles.length < 60) throw new Error('only ' + candles.length + ' candles');
    const o = Object.assign(btOpts(S), { posPct: 1 }), bh = (candles[candles.length - 1].c / candles[0].c - 1) * 100;
    lbCtx = { candles, o, sym };
    const r = await BTW.run({ type: 'all', candles, o }, (p) => { out.innerHTML = progBar((p.prog / p.total) * 100, `Backtesting ${p.prog}/${p.total} strategies on ${NT.fmtQty(candles.length)} candles · ${esc(p.phase)}`); });
    const rows = r.rows;
    lbRows = { rows, bh, sym, tf: S.tf, n: candles.length, from: candles[0].t, to: candles[candles.length - 1].t, src: candles.src };
    renderLeader();
  } catch (e) { out.innerHTML = `<div class="empty">Leaderboard failed: ${esc(e.message)}</div>`; }
  lbBusy = false; const b = $('#lbRun'); if (b) b.disabled = false;
}
function renderLeader() {
  const L = lbRows, out = $('#lbOut'); if (!L || !out) return;
  const key = lbSort, rows = L.rows.filter((r) => !r.err).sort((a, b) => key === 'grade' ? (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) : (key === 'dd' ? a.dd - b.dd : (b[key] == null ? -1e9 : b[key] === Infinity ? 1e9 : b[key]) - (a[key] == null ? -1e9 : a[key] === Infinity ? 1e9 : a[key])));
  const mx = Math.max(1, ...rows.map((r) => Math.abs(r.ret))), beat = rows.filter((r) => r.ret > L.bh).length;
  const th = (k, l) => `<th class="s r" data-lb="${k}">${l}${lbSort === k ? ' ▾' : ''}</th>`;
  out.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn sm val" id="lbGrade">🧪 Grade the top 10 (brutal checklist)</button><span class="note" id="lbGradeNote">ranks by robustness, not just return</span></div><div class="stats"><div class="stat"><span class="k">Buy &amp; hold</span><span class="v ${cls(L.bh)}">${NT.fmtPct(L.bh)}</span><span class="s">${esc(L.sym)} ${L.tf} · ${NT.fmtQty(L.n)} bars · ${esc(L.src || '')}</span></div><div class="stat"><span class="k">Beat buy &amp; hold</span><span class="v">${beat}/${rows.length}</span><span class="s">strategies</span></div><div class="stat"><span class="k">Best</span><span class="v up" style="font-size:14px">${esc(rows[0] ? rows[0].name : '–')}</span><span class="s">${rows[0] ? NT.fmtPct(rows[0].ret) : ''}</span></div></div>
    <div class="scroll" style="max-height:420px"><table class="lb"><thead><tr><th>#</th><th>Strategy</th><th>Category</th>${th('ret', 'Return')}<th></th>${th('dd', 'Max DD')}${th('trades', 'Trades')}${th('win', 'Win %')}${th('pf', 'Profit f.')}${th('sharpe', 'Sharpe')}<th class="s" data-lb="grade">Grade${lbSort === 'grade' ? ' ▾' : ''}</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-lbid="${r.id}" class="${i === 0 ? 'best' : ''}" title="Click to load this strategy into the backtester"><td class="mut">${i + 1}</td><td><b>${esc(r.name)}</b></td><td class="mut">${esc(r.cat || '')}</td><td class="r num ${cls(r.ret)}">${NT.fmtPct(r.ret)}</td><td style="width:90px"><span class="bar-in" style="width:${Math.max(2, (Math.abs(r.ret) / mx) * 80)}px;${r.ret < 0 ? 'background:var(--dn)' : ''}"></span></td><td class="r num dn">-${r.dd.toFixed(1)}%</td><td class="r num">${r.trades}</td><td class="r num">${r.win == null ? '–' : r.win.toFixed(0) + '%'}</td><td class="r num">${r.pf == null ? '–' : r.pf === Infinity ? '∞' : r.pf.toFixed(2)}</td><td class="r num">${r.sharpe.toFixed(2)}</td><td>${r.grade ? `<span class="grade g${r.grade}" title="${esc(r.verdict || '')}">${r.grade}</span> <span class="mut">${r.score}</span>` : '<span class="mut">–</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="note" style="margin-top:6px">${fmtStamp(L.from * 1000)} → ${fmtStamp(L.to * 1000)} · default parameters · fees &amp; slippage included. A strategy that tops one window often won’t top the next, so test several symbols and timeframes${isSimProv(providerFor(L.sym)) ? '. <b>Simulated data.</b>' : '.'}</div>`;
  const gb = $('#lbGrade'); if (gb) gb.onclick = gradeTop;
  out.onclick = (e) => {
    const h = e.target.closest('[data-lb]'); if (h) { lbSort = h.dataset.lb; renderLeader(); return; }
    const r = e.target.closest('[data-lbid]'); if (r) { Object.assign(ST.setup, { strat: r.dataset.lbid, paramsFor: null }); renderSetup(); runBacktest(); $('#btResult').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
}
async function gradeTop() {
  if (!lbRows || !lbCtx || lbBusy) return; lbBusy = true; const b = $('#lbGrade'); b.disabled = true;
  const top = lbRows.rows.filter((r) => !r.err).sort((a, c) => c.ret - a.ret).slice(0, 10);
  for (let k = 0; k < top.length; k++) {
    $('#lbGradeNote').textContent = `Validating ${k + 1}/${top.length}: ${top[k].name}…`;
    try { const r = await BTW.run({ type: 'validate', strat: top[k].id, params: NT.defaultParams(top[k].id), candles: lbCtx.candles, o: lbCtx.o }); top[k].grade = r.v.grade; top[k].score = r.v.score; top[k].verdict = r.v.verdict; } catch (e) { top[k].grade = '?'; }
  }
  lbSort = 'grade'; lbBusy = false; renderLeader(); toast('Top 10 graded. Sorted by robustness score.', 'acc');
}
const OTHER_MKTS = () => (ST.mode === 'onchain' ? ST.watch.filter(isOnchain).slice(0, 4) : ST.mode === 'stocks' ? ['SPY', 'QQQ', 'AAPL', 'NVDA'] : ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD']);
async function runValidation() {
  if (btBusy) return; const S = readSetup(), strat = NT.strategies[S.strat], out = $('#btVal');
  if (strat.liveOnly) { out.innerHTML = '<div class="empty">Live-only strategies can’t be validated on history.</div>'; return; }
  const sym = normSym(S.sym); if (!sym) return;
  btBusy = true; out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const candles = await loadHistory(sym, S, out); if (candles.length < 300) throw new Error('validation needs at least 300 candles. Pick more history.');
    const o = btOpts(S), t0 = performance.now();
    const r = await BTW.run({ type: 'validate', strat: S.strat, params: S.params, candles, o }, (p) => { out.innerHTML = progBar((p.prog / p.total) * 100, `🧪 Validating ${esc(strat.name)} on ${NT.fmtQty(candles.length)} candles · ${esc(p.phase)} (${p.prog}/${p.total})`); });
    const v = r.v; v.ms = Math.round(performance.now() - t0);
    // cross-market check: same strategy, same settings, other symbols
    out.innerHTML = progBar(95, 'Cross-checking on other markets…');
    const others = OTHER_MKTS().filter((s) => s !== sym).slice(0, 3), mk = [];
    for (const s of others) { try { const c = await History.get(s, NT.TF[S.tf], Math.min(barsFor(S), 20000)); const x = await BTW.run({ type: 'bt', strat: S.strat, params: S.params, candles: c, o }); mk.push({ sym: s, ret: x.res.stats.ret, dd: x.res.stats.maxDD, trades: x.res.stats.closed, bh: (c[c.length - 1].c / c[0].c - 1) * 100 }); } catch (e) { mk.push({ sym: s, err: e.message }); } }
    const okM = mk.filter((m) => !m.err && m.ret > 0).length, tried = mk.filter((m) => !m.err).length;
    if (tried) { v.checks.push({ id: 'markets', name: 'Works on other markets too', status: okM >= Math.ceil(tried * 0.66) ? 'pass' : okM >= 1 ? 'warn' : 'fail', value: mk.filter((m) => !m.err).map((m) => `${baseOf(m.sym)} ${NT.fmtPct(m.ret, 1)}`).join(' · '), rule: 'profitable on ≥ ⅔ of other symbols', why: 'An edge that only exists on one ticker is often a coincidence of that chart. Real patterns repeat across markets.' });
      const pts = v.checks.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0); v.score = Math.round((pts / v.checks.length) * 100); }
    v.mk = mk; renderValidation(v, { sym, S, strat, candles });
  } catch (e) { out.innerHTML = `<div class="empty">Validation failed: ${esc(e.message)}</div>`; }
  btBusy = false;
}
function renderValidation(v, ctx) {
  const ic = { pass: '✅', warn: '⚠️', fail: '❌' }, cnt = (s) => v.checks.filter((c) => c.status === s).length, M = v.metrics, f = (x, d = 2) => (x == null || !isFinite(x) ? '–' : x.toFixed(d));
  $('#btVal').innerHTML = `<div class="pb valrep">
    <div class="valhead"><div class="gradebig g${v.grade}">${v.grade}</div><div style="flex:1;min-width:0"><div class="vtitle">${esc(ctx.strat.name)} on ${esc(ctx.sym)} ${ctx.S.tf} · robustness score <b>${v.score}/100</b></div><div class="vverdict">${esc(v.verdict)}</div>
      <div class="row" style="margin-top:6px"><span class="tag up">✅ ${cnt('pass')} passed</span><span class="tag amb">⚠️ ${cnt('warn')} warnings</span><span class="tag dn">❌ ${cnt('fail')} failed</span>${v.checks.filter((c) => c.hard).map((c) => `<span class="tag dn">critical: ${esc(c.name)}</span>`).join('')}<span class="note">${NT.fmtQty(ctx.candles.length)} candles · ${(v.ms / 1000).toFixed(1)}s</span></div></div></div>
    <table class="checks"><thead><tr><th></th><th>Test</th><th>Result</th><th>Pass rule</th></tr></thead><tbody>${v.checks.map((c) => `<tr class="c-${c.status}"><td>${ic[c.status]}</td><td><b>${esc(c.name)}</b><div class="note">${esc(c.why)}</div></td><td class="mono">${esc(c.value)}</td><td class="note">${esc(c.rule)}</td></tr>`).join('')}</tbody></table>
    <div class="cols2" style="margin-top:12px">
      <div class="panel"><h3>Monte Carlo · 1,000 trade sequences</h3><div class="pb"><canvas id="vFan" class="cvs" style="height:210px"></canvas><div class="note">Bands: 5th–95th and 25th–75th percentile equity multiple. 5th pct ${NT.fmtPct(v.finals.p5, 1)} · median ${NT.fmtPct(v.finals.p50, 1)} · 95th pct ${NT.fmtPct(v.finals.p95, 1)} · chance of a loss ${(v.finals.pLoss * 100).toFixed(0)}% · 95th pct drawdown ${f(v.finals.dd95, 0)}%</div></div></div>
      <div class="panel"><h3>Random-entry test · ${v.perm.dist.length} random strategies</h3><div class="pb"><canvas id="vPerm" class="cvs" style="height:210px"></canvas><div class="note">Grey = returns of random entries with the same trade count &amp; holding times. The line marks your strategy (${NT.fmtPct(ctx.strat ? v.stats.ret : 0, 1)}). p-value ${v.perm.p.toFixed(3)}.</div></div></div>
    </div>
    <div class="cols2" style="margin-top:12px">
      <div class="panel"><h3>Walk-forward windows</h3><div class="pb scroll">${v.folds.length ? `<table><thead><tr><th>#</th><th>Trade window</th><th>Params (tuned on prior window)</th><th class="r">Trades</th><th class="r">Return</th></tr></thead><tbody>${v.folds.map((x) => `<tr><td>${x.f}</td><td class="mut">${fmtStamp(x.from * 1000)} → ${fmtStamp(x.to * 1000)}</td><td class="mono note">${esc(Object.entries(x.params).map(([k, val]) => k + ' ' + val).join(' · '))}</td><td class="r num">${x.trades}</td><td class="r num ${cls(x.ret)}">${NT.fmtPct(x.ret, 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="note">Not enough data for walk-forward.</div>'}</div></div>
      <div class="panel"><h3>Parameter sensitivity (±20%)</h3><div class="pb scroll">${v.sens.length ? `<table><thead><tr><th>Parameter</th><th class="r">Value</th><th class="r">Return</th><th class="r">Max DD</th><th class="r">Trades</th></tr></thead><tbody>${v.sens.map((x) => `<tr><td>${esc(x.label)}</td><td class="r num">${x.from} → ${x.to}</td><td class="r num ${cls(x.ret)}">${NT.fmtPct(x.ret, 1)}</td><td class="r num dn">-${x.dd.toFixed(1)}%</td><td class="r num">${x.trades}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No tunable parameters.</div>'}</div></div>
    </div>
    <div class="cols3" style="margin-top:12px">
      <div class="panel"><h3>Market regimes</h3><div class="pb"><table>${Object.entries({ bull: '🐂 Bull', side: '↔️ Sideways', bear: '🐻 Bear' }).map(([k, l]) => `<tr><td>${l}</td><td class="r num">${v.regimes[k].n} trades</td><td class="r num ${cls(v.regimes[k].pnl)}">${NT.fmtUSD(v.regimes[k].pnl, 0)}</td></tr>`).join('')}</table></div></div>
      <div class="panel"><h3>8 equal periods</h3><div class="pb"><canvas id="vSeg" class="cvs" style="height:120px"></canvas></div></div>
      <div class="panel"><h3>Other markets</h3><div class="pb">${(v.mk || []).length ? `<table>${v.mk.map((m) => `<tr><td><b>${esc(baseOf(m.sym))}</b></td>${m.err ? `<td colspan="2" class="note">${esc(m.err)}</td>` : `<td class="r num ${cls(m.ret)}">${NT.fmtPct(m.ret, 1)}</td><td class="r note">B&amp;H ${NT.fmtPct(m.bh, 0)} · ${m.trades} tr</td>`}</tr>`).join('')}</table>` : '<div class="note">–</div>'}</div></div>
    </div>
    <div class="stats mstats" style="margin-top:12px">${[['CAGR', NT.fmtPct(M.cagr, 1)], ['Sortino', f(M.sortino)], ['Calmar', f(M.calmar)], ['Expectancy', NT.fmtPct(M.expectancy)], ['Payoff', f(M.payoff)], ['SQN', f(M.sqn)], ['Kelly', M.kelly == null ? '–' : f(M.kelly, 1) + '%'], ['Exposure', f(M.exposure, 0) + '%'], ['Avg hold', f(M.avgHold, 1) + ' bars'], ['OOS Sharpe', f(v.oos.oosSh)], ['Stress return', NT.fmtPct(v.stress, 1)], ['+1 bar latency', NT.fmtPct(v.late, 1)]].map(([k, val]) => `<div class="stat"><span class="k">${k}</span><span class="v" style="font-size:15px">${val}</span></div>`).join('')}</div>
    <div class="note" style="margin-top:8px">The checklist is intentionally harsh: most strategies fail it, which is the point. A good grade is not a guarantee. Forward-test with a paper bot before trusting any edge.</div></div>`;
  const acc = cssv('--acc', '#7c5cff');
  drawLines($('#vFan'), [{ name: '95th', color: '#22c55e', values: v.fan.map((x) => x.p95), w: 1 }, { name: '75th', color: acc, values: v.fan.map((x) => x.p75), w: 1 }, { name: 'Median', color: '#e6eaf3', values: v.fan.map((x) => x.p50), w: 2 }, { name: '25th', color: acc, values: v.fan.map((x) => x.p25), w: 1 }, { name: '5th', color: '#f43f5e', values: v.fan.map((x) => x.p5), w: 1 }], { fmt: (x) => x.toFixed(2) + '×', base: 1 });
  drawHist($('#vPerm'), v.perm.dist, v.stats.ret);
  drawBars($('#vSeg'), v.segRets);
}
function drawHist(cv, vals, mark) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!vals.length) return; let lo = Math.min(mark, ...vals), hi = Math.max(mark, ...vals); if (hi === lo) hi = lo + 1; const B = 30, bins = new Array(B).fill(0);
  for (const v of vals) bins[Math.min(B - 1, Math.floor(((v - lo) / (hi - lo)) * B))]++;
  const mx = Math.max(...bins), bw = (W - 20) / B;
  bins.forEach((b, i) => { const h = (b / mx) * (H - 30); g.fillStyle = 'rgba(139,148,169,.45)'; g.fillRect(10 + i * bw + 1, H - 18 - h, bw - 2, h); });
  const x = 10 + ((mark - lo) / (hi - lo)) * (W - 20); g.strokeStyle = cssv('--acc', '#7c5cff'); g.lineWidth = 3; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, H - 18); g.stroke();
  g.fillStyle = '#8b94a9'; g.font = '11px ui-monospace, monospace'; g.textAlign = 'left'; g.fillText(NT.fmtPct(lo, 0), 10, H - 4); g.textAlign = 'right'; g.fillText(NT.fmtPct(hi, 0), W - 10, H - 4);
}
function drawBars(cv, vals) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mx = Math.max(1e-9, ...vals.map(Math.abs)), bw = W / vals.length, z = H / 2;
  g.strokeStyle = 'rgba(148,163,200,.25)'; g.beginPath(); g.moveTo(0, z); g.lineTo(W, z); g.stroke();
  vals.forEach((v, i) => { const h = (Math.abs(v) / mx) * (H / 2 - 12); g.fillStyle = v >= 0 ? '#22c55e' : '#f43f5e'; g.fillRect(i * bw + 4, v >= 0 ? z - h : z, bw - 8, h); g.fillStyle = '#8b94a9'; g.font = '10px ui-monospace, monospace'; g.textAlign = 'center'; g.fillText(NT.fmtPct(v, 0), i * bw + bw / 2, v >= 0 ? z - h - 3 : z + h + 11); });
}
function initBots() { renderSetup(); renderBots(true); $('#botList').onclick = botAction; $('#botCtl').onclick = botCtlAction; renderBotCtl(); }
TABS.bots = { show() { renderBots(true); renderBotCtl(); }, render() { if (Date.now() - lastBotRender > 3000) { renderBots(); const c = $('#botCtl'); if (c && !c.contains(document.activeElement)) renderBotCtl(); } } };

/* ───────────── PORTFOLIO — tracks every paper trade the app makes ───────────── */
let pfScope = 'mode';
const pf = { acct: 'all', side: 'all', range: 'all', q: '', eqRange: 'all', limit: 150, lastKey: '', lastRender: 0, seen: 0 };
const inScope = (sym, copy) => pfScope === 'all' || (ST.mode === 'stocks' ? !copy && isStock(sym) : ST.mode === 'onchain' ? copy || isOnchain(sym) : copy || modeOf(sym) === 'crypto');
const fmtDur = (ms) => { if (ms == null || !isFinite(ms)) return '–'; const m = ms / 60000; return m < 1 ? '<1m' : m < 60 ? m.toFixed(0) + 'm' : m < 1440 ? (m / 60).toFixed(1) + 'h' : (m / 1440).toFixed(1) + 'd'; };
function pfAccounts() {
  const out = [{ id: 'manual', name: 'Paper account', sub: 'Order ticket · AI Copilot · limit orders', ic: '🧾', acct: ACC, mark: (s) => px(s), label: (s) => baseOf(s), on: true, tradeOk: (t) => inScope(t.sym), posOk: (s) => inScope(s) }];
  for (const b of ST.bots) if (inScope(b.sym)) { const st = NT.strategies[b.strat]; out.push({ id: 'bot:' + b.id, bot: b, name: b.name, sub: `Bot · ${st ? st.name : b.strat} · ${baseOf(b.sym)} ${b.tf}`, ic: '🤖', acct: b.account, mark: (s) => px(s), label: (s) => baseOf(s), on: b.run, tradeOk: () => true, posOk: () => true }); }
  if (COPY && inScope('', true)) out.push({ id: 'copy', name: 'Copy-bot', sub: 'Mirrors your tracked Solana wallets', ic: '🛰', acct: COPY, mark: (m) => Sol.priceOf(m), label: (m) => Sol.tokName(m), on: ST.copy.on, tradeOk: () => true, posOk: () => true });
  for (const a of out) {
    let e = a.acct.cash, open = 0, un = 0; for (const s in a.acct.pos) { const p = a.acct.pos[s], m = a.mark(s), v = m ? p.qty * m : p.cost; e += v; if (a.posOk(s)) { open++; un += v - p.cost; } }
    a.eq = e; a.pnl = e - a.acct.cash0; a.ret = (a.pnl / a.acct.cash0) * 100; a.open = open; a.un = un;
    const sells = a.acct.trades.filter((t) => t.side === 'sell' && t.pnl != null && a.tradeOk(t)); a.closed = sells.length; a.wins = sells.filter((t) => t.pnl > 0).length; a.nTrades = a.acct.trades.filter(a.tradeOk).length;
    const ev = a.acct.eq.map((x) => x.v).concat([e]); let pk = -Infinity, dd = 0; for (const v of ev) { pk = Math.max(pk, v); dd = Math.max(dd, pk > 0 ? (1 - v / pk) * 100 : 0); } a.dd = dd; a.spark = ev.slice(-60);
  }
  return out;
}
const whoKind = (a, t) => (a.id === 'manual' ? (t.src === 'copilot' ? 'copilot' : 'manual') : a.id === 'copy' ? 'copy' : 'bot');
const whoName = (a, t) => (a.id === 'manual' ? (t.src === 'copilot' ? 'AI Copilot' : 'Manual') : a.name);
function pfTrades(accts = pfAccounts()) {
  const all = [];
  for (const a of accts) for (const t of a.acct.trades) if (a.tradeOk(t)) all.push(Object.assign({}, t, { acctId: a.id, who: whoName(a, t), kind: whoKind(a, t), label: t.tok || a.label(t.sym) }));
  return all.sort((x, y) => y.ts - x.ts);
}
function pfStats(trades) {
  const s = trades.filter((t) => t.side === 'sell' && t.pnl != null), w = s.filter((t) => t.pnl > 0), l = s.filter((t) => t.pnl <= 0);
  const gw = w.reduce((a, t) => a + t.pnl, 0), gl = -l.reduce((a, t) => a + t.pnl, 0), sum = gw - gl, avg = (arr, f) => (arr.length ? arr.reduce((a, t) => a + f(t), 0) / arr.length : null);
  const best = s.reduce((b, t) => (!b || t.pnl > b.pnl ? t : b), null), worst = s.reduce((b, t) => (!b || t.pnl < b.pnl ? t : b), null);
  let streak = 0, maxL = 0, cur = 0; for (const t of s.slice().sort((a, b) => a.ts - b.ts)) { if (t.pnl > 0) cur = 0; else { cur++; maxL = Math.max(maxL, cur); } } for (const t of s) { if (t.pnl > 0) { if (streak >= 0) streak++; else break; } else { if (streak <= 0) streak--; else break; } }
  return { n: s.length, wins: w.length, wr: s.length ? (w.length / s.length) * 100 : null, pf: gl > 0 ? gw / gl : w.length ? Infinity : null, pnl: sum, exp: avg(s, (t) => t.pnl), avgW: avg(w, (t) => t.pnl), avgL: avg(l, (t) => t.pnl), holdW: avg(w.filter((t) => t.held != null), (t) => t.held), holdL: avg(l.filter((t) => t.held != null), (t) => t.held), best, worst, fees: trades.reduce((a, t) => a + (t.fee || 0), 0), streak, maxL, buys: trades.filter((t) => t.side === 'buy').length };
}
function pfFiltered(all) {
  const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const since = { today: d0.getTime(), '7d': now - 7 * 864e5, '30d': now - 30 * 864e5, all: 0 }[pf.range] || 0, q = pf.q.trim().toLowerCase();
  return all.filter((t) => (pf.acct === 'all' || t.acctId === pf.acct || (pf.acct === 'k:copilot' && t.kind === 'copilot') || (pf.acct === 'k:bots' && t.kind === 'bot')) && t.ts >= since
    && (pf.side === 'all' || (pf.side === 'buy' && t.side === 'buy') || (pf.side === 'sell' && t.side === 'sell') || (pf.side === 'win' && t.pnl > 0) || (pf.side === 'loss' && t.pnl != null && t.pnl <= 0))
    && (!q || String(t.label).toLowerCase().includes(q) || String(t.reason).toLowerCase().includes(q) || String(t.who).toLowerCase().includes(q)));
}
function pfSpark(v) { if (v.length < 3) return ''; const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1; return `<svg class="spk" style="width:90px;height:22px" viewBox="0 0 90 22" preserveAspectRatio="none"><polyline fill="none" stroke="${v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--dn)'}" stroke-width="1.5" points="${v.map((x, i) => `${((i / (v.length - 1)) * 90).toFixed(1)},${(21 - ((x - lo) / r) * 20).toFixed(1)}`).join(' ')}"/></svg>`; }
function pfBars(cv, items, horiz) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.font = '11px ui-monospace, monospace'; g.textBaseline = 'middle';
  if (!items.length) { g.fillStyle = '#8b94a9'; g.textAlign = 'center'; g.fillText('No closed trades yet', W / 2, H / 2); return; }
  const mx = Math.max(1e-9, ...items.map((x) => Math.abs(x.v)));
  if (horiz) {
    const rh = Math.min(24, H / items.length), lw = 78, z = lw + (W - lw - 70) * (items.some((x) => x.v < 0) ? 0.45 : 0), span = W - lw - 70 - (z - lw);
    items.forEach((x, i) => { const y = i * rh + rh / 2, w = (Math.abs(x.v) / mx) * (x.v >= 0 ? W - 70 - z : z - lw); g.fillStyle = '#c3c9d6'; g.textAlign = 'left'; g.fillText(String(x.l).slice(0, 10), 2, y); g.fillStyle = x.v >= 0 ? '#22c55e' : '#f43f5e'; const bx = x.v >= 0 ? z : z - w; g.beginPath(); g.roundRect ? g.roundRect(bx, y - rh * 0.32, Math.max(2, w), rh * 0.64, 4) : g.rect(bx, y - rh * 0.32, Math.max(2, w), rh * 0.64); g.fill(); g.fillStyle = x.v >= 0 ? '#86efac' : '#fda4af'; g.textAlign = x.v >= 0 ? 'left' : 'right'; g.fillText(NT.fmtUSD(x.v, 0), x.v >= 0 ? bx + w + 5 : bx - 5, y); });
    void span;
  } else {
    const bw = W / items.length, z = H / 2 - 6;
    g.strokeStyle = 'rgba(148,163,200,.25)'; g.beginPath(); g.moveTo(0, z); g.lineTo(W, z); g.stroke();
    items.forEach((x, i) => { const h = (Math.abs(x.v) / mx) * (z - 14); g.fillStyle = x.v > 0 ? '#22c55e' : x.v < 0 ? '#f43f5e' : 'rgba(148,163,200,.3)'; g.fillRect(i * bw + bw * 0.18, x.v >= 0 ? z - h : z, bw * 0.64, Math.max(1, h)); g.fillStyle = '#8b94a9'; g.textAlign = 'center'; g.fillText(x.l, i * bw + bw / 2, H - 7); });
  }
}
function pfBadge() {
  const el = $('#pfBadge'); if (!el) return; if (curTab === 'port') { ST.pfSeen = Date.now(); el.hidden = true; return; }
  const seen = ST.pfSeen || 0; let n = 0; for (const t of ACC.trades) if (t.ts > seen) n++; for (const b of ST.bots) for (const t of b.account.trades) if (t.ts > seen) n++; if (COPY) for (const t of COPY.trades) if (t.ts > seen) n++;
  el.hidden = !n; el.textContent = n > 99 ? '99+' : n;
}
function renderPortfolio(force) {
  if (!force && Date.now() - pf.lastRender < 1500) return; pf.lastRender = Date.now();
  segBtns($('#pfScope'), [{ v: 'mode', l: ST.mode === 'stocks' ? '▲ Stocks only' : ST.mode === 'onchain' ? '⬡ On-chain only' : '◆ Crypto only' }, { v: 'all', l: 'Everything' }], pfScope, (v) => { pfScope = v; pf.acct = 'all'; renderPortfolio(true); });
  const accts = pfAccounts(), all = pfTrades(accts), S = pfStats(all);
  const tot = accts.reduce((a, x) => a + x.eq, 0), start = accts.reduce((a, x) => a + x.acct.cash0, 0), pnl = tot - start, open = accts.reduce((a, x) => a + x.open, 0), un = accts.reduce((a, x) => a + x.un, 0);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const today = all.filter((t) => t.ts >= d0.getTime() && t.pnl != null).reduce((a, t) => a + t.pnl, 0), nToday = all.filter((t) => t.ts >= d0.getTime()).length;
  $('#pfScopeNote').textContent = `${accts.length} paper account${accts.length === 1 ? '' : 's'} · ${all.length} trades tracked${pfScope === 'mode' ? ' · ' + (ST.mode === 'stocks' ? 'stock' : ST.mode === 'onchain' ? 'on-chain' : 'crypto') + ' trades only' : ''}`;
  const stat = (k, v, c = '', s = '') => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  $('#pfStats').innerHTML = stat('Total paper equity', NT.fmtUSD(tot, 0), '', 'across ' + accts.length + ' accounts') + stat('Total P&L', NT.fmtUSD(pnl, 0), cls(pnl), NT.fmtPct((pnl / start) * 100, 2) + ' on ' + NT.fmtUSD(start, 0)) + stat('Today', NT.fmtUSD(today, 0), cls(today), nToday + ' trades today') + stat('Unrealized', NT.fmtUSD(un, 0), cls(un), open + ' open positions')
    + stat('Win rate', S.wr == null ? '–' : S.wr.toFixed(0) + '%', S.wr == null ? '' : S.wr >= 50 ? 'up' : 'dn', `${S.wins}W / ${S.n - S.wins}L`) + stat('Profit factor', S.pf == null ? '–' : S.pf === Infinity ? '∞' : S.pf.toFixed(2), S.pf == null ? '' : S.pf >= 1 ? 'up' : 'dn', 'gross win ÷ gross loss') + stat('Expectancy', S.exp == null ? '–' : NT.fmtUSD(S.exp), cls(S.exp), 'avg P&L per closed trade') + stat('Fees paid', NT.fmtUSD(S.fees, 0), '', S.buys + ' entries');
  // accounts table
  $('#pfAccts').innerHTML = `<table><thead><tr><th>Account</th><th>Status</th><th class="r">Start</th><th class="r">Equity</th><th class="r">P&amp;L</th><th class="r">Win rate</th><th class="r">Trades</th><th class="r">Open</th><th class="r">Max DD</th><th>Curve</th></tr></thead><tbody>${accts.map((a) => `<tr class="acc-row ${pf.acct === a.id ? 'on' : ''}" data-acct="${a.id}"><td><div class="ai"><span class="ic">${a.ic}</span><div><b>${esc(a.name)}</b><small>${esc(a.sub)}</small></div></div></td><td><span class="pill ${a.on ? 'on' : ''}">${a.id === 'manual' ? 'active' : a.on ? 'running' : 'paused'}</span></td><td class="r num">${NT.fmtUSD(a.acct.cash0, 0)}</td><td class="r num">${NT.fmtUSD(a.eq, 0)}</td><td class="r num ${cls(a.pnl)}">${NT.fmtUSD(a.pnl, 0)}<br><small>${NT.fmtPct(a.ret, 2)}</small></td><td class="r num">${a.closed ? ((a.wins / a.closed) * 100).toFixed(0) + '%' : '–'}<br><small class="mut">${a.wins}/${a.closed}</small></td><td class="r num">${a.nTrades}</td><td class="r num">${a.open}</td><td class="r num dn">${a.dd ? '-' + a.dd.toFixed(1) + '%' : '–'}</td><td>${pfSpark(a.spark)}</td></tr>`).join('')}</tbody></table>`
    + (accts.length < 2 ? `<div class="empty" style="padding:10px">Start a bot on <a href="#" data-goto="bots">Bots &amp; Backtest</a> or switch on the copy-bot in the <a href="#" data-goto="whales">Wallet Tracker</a>; their trades will show up here too.</div>` : '');
  // equity chart
  segBtns($('#pfEqRange'), [{ v: '1h', l: '1H' }, { v: '24h', l: '24H' }, { v: '7d', l: '7D' }, { v: 'all', l: 'All' }], pf.eqRange, (v) => { pf.eqRange = v; renderPortfolio(true); });
  const cut = { '1h': Date.now() - 36e5, '24h': Date.now() - 864e5, '7d': Date.now() - 7 * 864e5, all: 0 }[pf.eqRange], E = ST.totalEq.filter((x) => x.t >= cut && x.p != null).concat([{ p: pnl, pm: ACC.equity(priceMap()) - ACC.cash0, pb: ST.bots.reduce((s, b) => s + botStats(b).pnl, 0), pc: COPY ? copyEquity() - COPY.cash0 : 0 }]);
  const ser = [{ name: 'Total P&L', color: '#a78bfa', values: E.map((x) => x.p), fill: true }];
  ser.push({ name: 'Paper account', color: '#5b8cff', values: E.map((x) => x.pm), w: 1.2 }); if (ST.bots.length) ser.push({ name: 'Bots', color: '#f5a524', values: E.map((x) => x.pb), w: 1.2 }); if (COPY && COPY.trades.length) ser.push({ name: 'Copy-bot', color: '#14b8a6', values: E.map((x) => x.pc), w: 1.2 });
  drawLines($('#pfChart'), E.length > 1 ? ser : [], { fmt: (v) => NT.fmtUSD(v, 0), base: 0, empty: 'The P&L curve builds as the app runs (sampled every 15 s)' });
  // open positions
  const pos = []; for (const a of accts) for (const s in a.acct.pos) if (a.posOk(s)) { const p = a.acct.pos[s], m = a.mark(s), val = m ? p.qty * m : null; pos.push({ a, s, p, m, val, u: m ? val - p.cost : null }); }
  pos.sort((x, y) => (y.val || y.p.cost) - (x.val || x.p.cost));
  const ord = ACC.orders.filter((o) => inScope(o.sym));
  if (Date.now() >= holdBots || !$('#pfHoldNote [data-pfcloseall]')) $('#pfHoldNote').innerHTML = pos.length ? `${pos.length} open · ${NT.fmtUSD(pos.reduce((s, x) => s + (x.val || x.p.cost), 0), 0)} exposure <button class="btn xs sell" data-pfcloseall="1">Close all</button>` : '';
  $('#pfHold').innerHTML = (pos.length ? `<table><thead><tr><th>Asset</th><th>Account</th><th class="r">Value</th><th class="r">Avg → Mark</th><th class="r">P&amp;L</th><th class="r">Held</th><th>Exits</th><th></th></tr></thead><tbody>${pos.map(({ a, s, p, m, val, u }) => `<tr><td>${a.id === 'copy' ? `<b>${esc(a.label(s))}</b>` : `<a href="#" data-open="${esc(s)}"><b>${esc(a.label(s))}</b></a>`}</td><td><span class="pill who-${a.id === 'manual' ? 'manual' : a.id === 'copy' ? 'copy' : 'bot'}">${esc(a.name)}</span></td><td class="r num">${NT.fmtUSD(val == null ? p.cost : val, 0)}</td><td class="r num">${NT.fmtPrice(p.cost / p.qty)} → ${NT.fmtPrice(m)}</td><td class="r num ${cls(u)}">${u == null ? '–' : NT.fmtUSD(u) + '<br><small>' + NT.fmtPct((u / p.cost) * 100, 1) + '</small>'}</td><td class="r num mut">${p.t0 ? fmtDur(Date.now() - p.t0) : '–'}</td><td class="mut" style="font-size:11px">${p.sl ? 'SL ' + NT.fmtPrice(p.sl) : ''}${p.tp ? '<br>TP ' + NT.fmtPrice(p.tp) : ''}</td><td class="r"><button class="btn sm sell" data-close="${a.id}|${esc(s)}">Close</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No open positions. Trade from the Markets tab order ticket, ask the AI Copilot, or start a bot.</div>')
    + (ord.length ? `<div class="sec" style="padding:0 10px">Open limit orders</div><table><tbody>${ord.map((o) => `<tr><td>${esc(baseOf(o.sym))}</td><td class="${o.side === 'buy' ? 'up' : 'dn'}">limit ${o.side}</td><td class="r num">${NT.fmtPrice(o.price)}</td><td class="r num">${o.side === 'buy' ? NT.fmtUSD(o.size, 0) : NT.fmtQty(o.size)}</td><td class="r"><button class="btn sm" data-cancel="${o.id}">Cancel</button></td></tr>`).join('')}</tbody></table>` : '');
  // analytics
  const by = {}; for (const t of all) if (t.pnl != null) by[t.label] = (by[t.label] || 0) + t.pnl;
  const ba = Object.entries(by).sort((a, b) => b[1] - a[1]); const pick = ba.length > 8 ? ba.slice(0, 4).concat(ba.slice(-4)) : ba;
  pfBars($('#pfByAsset'), pick.map(([l, v]) => ({ l, v })), true);
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); const a0 = d.getTime(), a1 = a0 + 864e5; days.push({ l: String(d.getDate()), v: all.filter((t) => t.pnl != null && t.ts >= a0 && t.ts < a1).reduce((s, t) => s + t.pnl, 0) }); }
  pfBars($('#pfDaily'), days, false);
  const kv = (k, v, c = '') => `<div><span>${k}</span><b class="${c}">${v}</b></div>`;
  $('#pfInsights').innerHTML = kv('Avg win', S.avgW == null ? '–' : NT.fmtUSD(S.avgW), 'up') + kv('Avg loss', S.avgL == null ? '–' : NT.fmtUSD(S.avgL), 'dn') + kv('Hold · winners', fmtDur(S.holdW)) + kv('Hold · losers', fmtDur(S.holdL)) + kv('Best trade', S.best ? `${esc(S.best.label)} ${NT.fmtUSD(S.best.pnl, 0)}` : '–', 'up') + kv('Worst trade', S.worst ? `${esc(S.worst.label)} ${NT.fmtUSD(S.worst.pnl, 0)}` : '–', 'dn') + kv('Current streak', S.streak ? (S.streak > 0 ? S.streak + ' wins' : -S.streak + ' losses') : '–', S.streak > 0 ? 'up' : S.streak < 0 ? 'dn' : '') + kv('Worst losing run', S.maxL ? S.maxL + ' in a row' : '–');
  // journal
  const sel = $('#pfAcct'), opts = [['all', 'All accounts'], ['manual', 'Paper account (manual + Copilot)'], ['k:copilot', 'AI Copilot only'], ['k:bots', 'All bots']].concat(accts.filter((a) => a.id !== 'manual').map((a) => [a.id, a.name]));
  const oh = opts.map(([v, l]) => `<option value="${esc(v)}" ${pf.acct === v ? 'selected' : ''}>${esc(l)}</option>`).join(''); if (sel.dataset.h !== oh) { sel.innerHTML = oh; sel.dataset.h = oh; }
  if (!opts.some(([v]) => v === pf.acct)) pf.acct = 'all';
  segBtns($('#pfSide'), [{ v: 'all', l: 'All' }, { v: 'buy', l: 'Buys' }, { v: 'sell', l: 'Sells' }, { v: 'win', l: 'Winners' }, { v: 'loss', l: 'Losers' }], pf.side, (v) => { pf.side = v; pf.limit = 150; renderPortfolio(true); });
  segBtns($('#pfRange'), [{ v: 'today', l: 'Today' }, { v: '7d', l: '7D' }, { v: '30d', l: '30D' }, { v: 'all', l: 'All time' }], pf.range, (v) => { pf.range = v; pf.limit = 150; renderPortfolio(true); });
  const F = pfFiltered(all), FS = pfStats(F);
  $('#pfTradeSum').innerHTML = `${F.length} trades · ${FS.n} closed · win rate ${FS.wr == null ? '–' : FS.wr.toFixed(0) + '%'} · P&amp;L <b class="${cls(FS.pnl)}">${NT.fmtUSD(FS.pnl, 0)}</b>`;
  const key = [F.length, F[0] && F[0].id, pf.limit, pf.acct, pf.side, pf.range, pf.q, pfScope].join('|');
  if (key !== pf.lastKey || force) {
    const seen = pf.seen; pf.lastKey = key;
    $('#pfTrades').innerHTML = F.length ? `<table><thead><tr><th>Time</th><th>Account</th><th>Asset</th><th>Side</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Value</th><th class="r">P&amp;L</th><th class="r">Held</th><th>Why</th></tr></thead><tbody>${F.slice(0, pf.limit).map((t) => `<tr class="${seen && t.ts > seen ? 'new' : ''}"><td class="mut">${fmtStamp(t.ts)}</td><td><span class="pill who-${t.kind}">${esc(t.who)}</span></td><td><b>${esc(t.label)}</b></td><td class="${t.side === 'buy' ? 'up' : 'dn'}">${t.side === 'buy' ? '▲ buy' : '▼ sell'}</td><td class="r num">${NT.fmtQty(t.qty)}</td><td class="r num">${NT.fmtPrice(t.price)}</td><td class="r num">${NT.fmtUSD(t.usd)}</td><td class="r num ${cls(t.pnl)}">${t.pnl == null ? '' : NT.fmtUSD(t.pnl) + ' <small>(' + NT.fmtPct((t.pnlPct || 0) * 100, 1) + ')</small>'}</td><td class="r num mut">${t.held != null ? fmtDur(t.held) : ''}</td><td class="mut" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.reason)}">${esc(t.reason)}</td></tr>`).join('')}</tbody></table>${F.length > pf.limit ? `<div style="text-align:center;padding:10px"><button class="btn sm" id="pfMore">Show ${Math.min(150, F.length - pf.limit)} more (${F.length - pf.limit} hidden)</button></div>` : ''}` : `<div class="empty">${all.length ? 'No trades match these filters.' : 'No paper trades yet. Buy from the Markets order ticket, tell the AI Copilot “buy $500 of ETH”, start a bot, or turn on the copy-bot; every fill shows up here automatically.'}</div>`;
    pf.seen = Date.now();
  }
}
function pfClose(id, sym) {
  const now = Date.now(); let t = null, who = 'Paper account';
  if (id === 'manual') t = ACC.sell(sym, px(sym), null, now, { reason: 'manual close (portfolio)', src: 'manual' });
  else if (id === 'copy') { const p = COPY.pos[sym]; t = COPY.sell(sym, Sol.priceOf(sym) || (p ? p.cost / p.qty : 0), null, now, { reason: 'manual close (portfolio)', src: 'copy' }); if (t) t.tok = Sol.tokName(sym); who = 'Copy-bot'; }
  else { const b = ST.bots.find((x) => 'bot:' + x.id === id); if (b) { t = b.account.sell(sym, px(sym), null, now, { reason: 'manual close (portfolio)', src: 'bot' }); who = b.name; } }
  if (t) tradeToast(t, who); else toast('Could not close: no price yet', 'amb');
  renderPortfolio(true); renderPosStrip(); saveState();
}
function initPortfolio() {
  $('#pfHold').onclick = (e) => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); showTab('markets'); selectSym(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c) { const [id, ...rest] = c.dataset.close.split('|'); pfClose(id, rest.join('|')); return; }
    const x = e.target.closest('[data-cancel]'); if (x) { ACC.cancel(x.dataset.cancel); renderPortfolio(true); saveState(); }
  };
  $('#pfHoldNote').onclick = (e) => { const b = e.target.closest('[data-pfcloseall]'); if (!b) return; confirmClick(b, () => { let n = 0; for (const a of pfAccounts()) for (const s of Object.keys(a.acct.pos)) if (a.posOk(s)) { pfClose(a.id, s); n++; } toast(`Closed ${n} position${n === 1 ? '' : 's'} across all paper accounts`, 'acc'); }); };
  $('#pfAccts').onclick = (e) => { const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); showTab(g.dataset.goto); return; } const r = e.target.closest('[data-acct]'); if (r) { pf.acct = pf.acct === r.dataset.acct ? 'all' : r.dataset.acct; pf.limit = 150; renderPortfolio(true); $('#pfTrades').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } };
  $('#pfAcct').onchange = (e) => { pf.acct = e.target.value; pf.limit = 150; renderPortfolio(true); };
  $('#pfQ').oninput = (e) => { pf.q = e.target.value; renderPortfolio(true); };
  $('#pfTrades').onclick = (e) => { if (e.target.id === 'pfMore') { pf.limit += 150; renderPortfolio(true); } };
  $('#pfReset').onclick = (e) => confirmClick(e.target, () => { ACC = new NT.Account({ cash: ST.settings.startCash, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 }); ST.acct = ACC; ST.totalEq = []; renderPortfolio(true); renderTicketMeta(); renderPosStrip(); chartRefresh(true); saveState(); toast('Paper account reset to ' + NT.fmtUSD(ST.settings.startCash, 0), 'acc'); });
  $('#pfCsv').onclick = () => {
    const rows = [['time', 'account', 'symbol', 'side', 'qty', 'price', 'usd', 'fee', 'pnl', 'pnl_pct', 'held_min', 'reason']].concat(pfFiltered(pfTrades()).map((t) => [new Date(t.ts).toISOString(), t.who, t.label, t.side, t.qty, t.price, t.usd, t.fee, t.pnl == null ? '' : t.pnl, t.pnlPct == null ? '' : (t.pnlPct * 100).toFixed(2), t.held == null ? '' : (t.held / 60000).toFixed(1), t.reason]));
    const cell = (c) => { let v = String(c == null ? '' : c); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }; // v14: no spreadsheet formulas (numbers like -2.5 stay numbers)
    const csv = rows.map((r) => r.map(cell).join(',')).join('\n');
    if (!download('exterm-trades.csv', csv, 'text/csv')) toast('Download blocked in this view', 'amb'); else toast(`Exported ${rows.length - 1} trades`, 'acc');
  };
}
TABS.port = { show() { ST.pfSeen = Date.now(); pfBadge(); renderPortfolio(true); }, render() { renderPortfolio(); } };
