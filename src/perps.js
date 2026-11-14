/* ExTerm v13: crypto derivatives data (funding, open interest, long/short ratio, liquidations) and a PAPER perpetual-
   futures account with long AND short positions, leverage, isolated margin, liquidation price and funding payments.
   Paper only: no order ever leaves this page. Data comes from public endpoints (Hyperliquid, then OKX, then Bybit). */
const Deriv = (() => {
  const D = { cache: {}, hist: {}, err: {} };
  const HL = 'https://api.hyperliquid.xyz/info', OKX = 'https://www.okx.com/api/v5', BYB = 'https://api.bybit.com/v5';
  const num = (v) => { const x = +v; return Number.isFinite(x) ? x : null; };
  const baseFor = (sym) => String(sym || '').replace(/-USD$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  D.baseFor = baseFor;
  let hlAll = { ts: 0, map: null };
  async function hyperliquid(base) {
    if (!hlAll.map || Date.now() - hlAll.ts > 30000) {
      const r = await J.post(HL, { type: 'metaAndAssetCtxs' }, { timeout: 9000 });
      if (!Array.isArray(r) || !r[0] || !Array.isArray(r[0].universe) || !Array.isArray(r[1])) throw new Error('unexpected Hyperliquid reply');
      const map = {}; r[0].universe.forEach((u, i) => { if (u && typeof u.name === 'string' && r[1][i]) map[u.name.toUpperCase()] = r[1][i]; }); hlAll = { ts: Date.now(), map };
    }
    const c = hlAll.map[base] || hlAll.map['K' + base]; if (!c) throw new Error('no Hyperliquid perp for ' + base);
    const mark = num(c.markPx), oi = num(c.openInterest), f1h = num(c.funding);
    return { src: 'Hyperliquid', mark, oiUsd: oi != null && mark ? oi * mark : null, funding8h: f1h != null ? f1h * 8 * 100 : null, fundingEvery: '1h', premium: num(c.premium) != null ? num(c.premium) * 100 : null, vol24: num(c.dayNtlVlm), ls: null, liqs: null };
  }
  async function okx(base) {
    const id = base + '-USDT-SWAP';
    const [f, o, l, ls] = await Promise.allSettled([
      J.get(`${OKX}/public/funding-rate?instId=${id}`, { timeout: 9000 }), J.get(`${OKX}/public/open-interest?instType=SWAP&instId=${id}`, { timeout: 9000 }),
      J.get(`${OKX}/public/liquidation-orders?instType=SWAP&uly=${base}-USDT&state=filled&limit=100`, { timeout: 9000 }), J.get(`${OKX}/rubik/stat/contracts/long-short-account-ratio?ccy=${base}&period=1H`, { timeout: 9000 }),
    ]);
    const fv = f.status === 'fulfilled' && f.value && f.value.data && f.value.data[0];
    if (!fv) throw new Error('no OKX perp for ' + base);
    const ov = o.status === 'fulfilled' && o.value && o.value.data && o.value.data[0];
    const liqs = []; const lv = l.status === 'fulfilled' && l.value && l.value.data && l.value.data[0];
    for (const d of (lv && lv.details) || []) { const px = num(d.bkPx), sz = num(d.sz); if (px && sz) liqs.push({ side: d.posSide === 'long' || d.side === 'sell' ? 'long' : 'short', px, usd: null, sz, ts: num(d.ts) }); }
    const lsv = ls.status === 'fulfilled' && ls.value && Array.isArray(ls.value.data) && ls.value.data[0];
    return { src: 'OKX', mark: null, oiUsd: ov ? num(ov.oiUsd) : null, funding8h: num(fv.fundingRate) != null ? num(fv.fundingRate) * 100 : null, fundingEvery: '8h', nextFunding: num(fv.nextFundingTime) || num(fv.fundingTime), premium: null, ls: lsv ? num(lsv[1]) : null, liqs: liqs.slice(0, 60) };
  }
  async function bybit(base) {
    const s = base + 'USDT', [t, a] = await Promise.allSettled([J.get(`${BYB}/market/tickers?category=linear&symbol=${s}`, { timeout: 9000 }), J.get(`${BYB}/market/account-ratio?category=linear&symbol=${s}&period=1h&limit=1`, { timeout: 9000 })]);
    const tv = t.status === 'fulfilled' && t.value && t.value.result && t.value.result.list && t.value.result.list[0];
    if (!tv) throw new Error('no Bybit perp for ' + base);
    const av = a.status === 'fulfilled' && a.value && a.value.result && a.value.result.list && a.value.result.list[0];
    return { src: 'Bybit', mark: num(tv.markPrice), oiUsd: num(tv.openInterestValue), funding8h: num(tv.fundingRate) != null ? num(tv.fundingRate) * 100 : null, fundingEvery: '8h', nextFunding: num(tv.nextFundingTime), premium: null, ls: av ? (num(av.buyRatio) && num(av.sellRatio) ? num(av.buyRatio) / num(av.sellRatio) : null) : null, liqs: null };
  }
  D.get = async (sym, force) => {
    const base = baseFor(sym); if (!base) return null;
    const c = D.cache[base]; if (!force && c && Date.now() - c.ts < 25000) return c.v;
    const errs = [];
    for (const [name, fn] of [['Hyperliquid', hyperliquid], ['OKX', okx], ['Bybit', bybit]]) {
      try {
        const v = await fn(base);
        if (!v.liqs && name !== 'OKX') { try { const o = await okx(base); v.liqs = o.liqs; if (v.ls == null) v.ls = o.ls; } catch (e) { /* extras are optional */ } }
        D.cache[base] = { ts: Date.now(), v }; D.err[base] = '';
        const h = D.hist[base] || (D.hist[base] = []); if (v.oiUsd) { h.push({ t: Date.now(), oi: v.oiUsd, f: v.funding8h }); if (h.length > 400) h.splice(0, h.length - 400); }
        return v;
      } catch (e) { errs.push(name + ': ' + String(e.message || e).slice(0, 60)); }
    }
    D.err[base] = errs.join(' · '); return null;
  };
  // what the numbers usually mean, in plain words (a reading, not a signal)
  D.read = (v) => {
    if (!v) return '';
    const out = [];
    if (v.funding8h != null) { const a = v.funding8h; out.push(a > 0.05 ? 'Funding is high: longs are paying a lot to stay in, the trade is crowded on the long side.' : a < -0.02 ? 'Funding is negative: shorts are paying longs, so the crowd is leaning short (squeezes happen from here).' : 'Funding is normal.'); }
    if (v.ls != null) out.push(v.ls > 2 ? `Accounts are ${v.ls.toFixed(1)}× more long than short.` : v.ls < 0.8 ? `More accounts are short than long (${v.ls.toFixed(2)}).` : '');
    return out.filter(Boolean).join(' ');
  };
  return D;
})();

const Futures = (() => {
  const F = { MMR: 0.005, FEE: 0.0005 };
  F.acct = () => { const a = ST.fut || (ST.fut = { cash: 10000, cash0: 10000, pos: {}, trades: [], funding: 0, liqs: 0 }); a.pos = a.pos || {}; a.trades = a.trades || []; return a; };
  F.mark = (sym) => { const d = Deriv.cache[Deriv.baseFor(sym)]; return (typeof px === 'function' && px(sym)) || (d && d.v.mark) || null; };
  F.liqPrice = (side, entry, lev) => side === 'long' ? entry * (1 - 1 / lev + F.MMR) : entry * (1 + 1 / lev - F.MMR);
  F.upnl = (p, mark) => (p.side === 'long' ? 1 : -1) * (mark - p.entry) * p.qty;
  F.equity = () => { const a = F.acct(); let e = a.cash; for (const s in a.pos) { const p = a.pos[s], m = F.mark(s) || p.entry; e += Math.max(0, p.margin + F.upnl(p, m)); } return e; };
  const rec = (t) => { const a = F.acct(); a.trades.push(t); if (a.trades.length > 500) a.trades.splice(0, a.trades.length - 500); try { if (typeof Journal !== 'undefined') Journal.record(Object.assign({}, t, { side: t.side === 'open' ? 'buy' : 'sell', reason: t.reason + ` (${t.dir} ${t.lev}×, paper perps)`, src: 'perps' }), null); } catch (e) { /* never block */ } };
  F.open = (sym, side, lev, margin, o = {}) => {
    const a = F.acct(), mark = o.price || F.mark(sym);
    if (!(mark > 0)) throw new Error('no price for ' + sym + ' yet');
    lev = Math.round(Math.max(1, Math.min(50, +lev || 1))); margin = +margin;
    if (!(margin >= 1)) throw new Error('margin must be at least $1');
    if (margin > a.cash + 1e-9) throw new Error('not enough paper margin (free: ' + NT.fmtUSD(a.cash) + ')');
    const cur = a.pos[sym];
    if (cur && cur.side !== side) F.close(sym, 1, 'flipped side');
    const notional = margin * lev, fill = mark * (side === 'long' ? 1 + 0.0002 : 1 - 0.0002), fee = notional * F.FEE, qty = (notional - fee) / fill;
    a.cash -= margin;
    const p = a.pos[sym];
    if (p && p.side === side) { const q = p.qty + qty; p.entry = (p.entry * p.qty + fill * qty) / q; p.qty = q; p.margin += margin - fee; p.lev = Math.max(1, (p.qty * p.entry) / p.margin); }
    else a.pos[sym] = { side, qty, entry: fill, margin: margin - fee, lev, t0: Date.now(), lastFund: Date.now(), funding: 0 };
    const P = a.pos[sym]; P.liq = F.liqPrice(side, P.entry, P.lev);
    if (o.slPct > 0) P.sl = side === 'long' ? P.entry * (1 - o.slPct / 100) : P.entry * (1 + o.slPct / 100);
    if (o.tpPct > 0) P.tp = side === 'long' ? P.entry * (1 + o.tpPct / 100) : P.entry * (1 - o.tpPct / 100);
    const t = { id: NT.uid(), ts: Date.now(), sym, side: 'open', dir: side, lev, qty, price: fill, usd: notional, fee, pnl: null, reason: 'opened ' + side };
    rec(t); saveState(); return t;
  };
  F.close = (sym, frac = 1, reason = 'closed by you', price) => {
    const a = F.acct(), p = a.pos[sym]; if (!p) return null;
    const mark = price || F.mark(sym) || p.entry; frac = Math.max(0.01, Math.min(1, frac));
    const qty = p.qty * frac, fill = mark * (p.side === 'long' ? 1 - 0.0002 : 1 + 0.0002), fee = qty * fill * F.FEE;
    const part = p.margin * frac, raw = (p.side === 'long' ? 1 : -1) * (fill - p.entry) * qty - fee, back = Math.max(0, part + raw);
    a.cash += back; p.qty -= qty; p.margin -= part;
    const t = { id: NT.uid(), ts: Date.now(), sym, side: 'close', dir: p.side, lev: Math.round(p.lev), qty, price: fill, usd: qty * fill, fee, pnl: back - part, reason }; // a loss can't exceed the margin
    if (frac >= 0.999 || p.qty < 1e-12) delete a.pos[sym];
    rec(t); saveState(); return t;
  };
  // liquidation, stop / target and funding, checked on every price tick
  F.check = (sym, mark, now = Date.now()) => {
    const a = F.acct(), p = a.pos[sym]; if (!p || !(mark > 0)) return null;
    if ((p.side === 'long' && mark <= p.liq) || (p.side === 'short' && mark >= p.liq)) {
      const t = { id: NT.uid(), ts: now, sym, side: 'close', dir: p.side, lev: Math.round(p.lev), qty: p.qty, price: p.liq, usd: p.qty * p.liq, fee: 0, pnl: -p.margin, reason: 'LIQUIDATED' };
      delete a.pos[sym]; a.liqs = (a.liqs || 0) + 1; rec(t); saveState();
      if (typeof toast === 'function') toast(`💥 Paper ${esc(p.side)} on <b>${esc(baseOf(sym))}</b> was liquidated at ${NT.fmtPrice(p.liq)} (margin lost: ${NT.fmtUSD(p.margin)})`, 'dn', 10000);
      return t;
    }
    if (p.sl && ((p.side === 'long' && mark <= p.sl) || (p.side === 'short' && mark >= p.sl))) return F.close(sym, 1, 'stop-loss', p.sl);
    if (p.tp && ((p.side === 'long' && mark >= p.tp) || (p.side === 'short' && mark <= p.tp))) return F.close(sym, 1, 'take-profit', p.tp);
    const d = Deriv.cache[Deriv.baseFor(sym)], f8 = d && d.v.funding8h;
    if (f8 != null && now - p.lastFund >= 3600e3) { // funding: longs pay shorts when the rate is positive (charged hourly here)
      const hrs = Math.floor((now - p.lastFund) / 3600e3), pay = (p.side === 'long' ? 1 : -1) * (f8 / 100 / 8) * hrs * p.qty * mark;
      p.margin -= pay; p.funding += pay; a.funding = (a.funding || 0) + pay; p.lastFund += hrs * 3600e3; p.lev = Math.max(1, (p.qty * p.entry) / Math.max(1e-9, p.margin)); p.liq = F.liqPrice(p.side, p.entry, p.lev);
    }
    return null;
  };
  F.reset = (cash) => { ST.fut = { cash: +cash || 10000, cash0: +cash || 10000, pos: {}, trades: [], funding: 0, liqs: 0 }; saveState(); };

  /* ---- UI: Markets › side column ---- */
  F.ui = () => ST.futUI || (ST.futUI = { side: 'long', lev: 3, margin: 500, sl: '', tp: '', view: 'data' });
  F.render = async (force) => {
    const host = $('#derivPanel'); if (!host) return;
    const crypto = ST.mode === 'crypto'; host.hidden = !crypto; if (!crypto) return;
    const sym = ST.sel, base = Deriv.baseFor(sym), u = F.ui();
    if (!host.dataset.built || host.dataset.sym !== sym || force) {
      host.dataset.built = '1'; host.dataset.sym = sym;
      host.innerHTML = `<h3>⚡ Perps <span class="sp"></span><span class="seg sm" id="pvView"><button data-v="data" class="${u.view === 'data' ? 'on' : ''}">Data</button><button data-v="trade" class="${u.view === 'trade' ? 'on' : ''}">Paper trade</button></span></h3><div class="pb" id="pvBody"><div class="note">Loading ${esc(base)} perpetual futures data…</div></div>`;
      $('#pvView').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.view = b.dataset.v; saveState(); F.render(true); };
    }
    const v = await Deriv.get(sym, force);
    if (ST.sel !== sym) return;
    const body = $('#pvBody'); if (!body) return;
    if (u.view === 'trade') return F.renderTicket(body, sym, v);
    if (!v) { body.innerHTML = `<div class="note">No perpetual-futures data for ${esc(base)}. ${esc(Deriv.err[base] || '')}${!J.proxy ? ' Start the launcher if your browser blocks these APIs.' : ''}</div>`; return; }
    const h = Deriv.hist[base] || [], oiCh = h.length > 5 ? ((h[h.length - 1].oi / h[0].oi - 1) * 100) : null, sinceMin = h.length > 5 ? Math.round((h[h.length - 1].t - h[0].t) / 60000) : 0;
    const L = (v.liqs || []).filter((x) => x.ts && Date.now() - x.ts < 3600e3), lq = { long: 0, short: 0 }; for (const x of L) lq[x.side] += x.sz * x.px;
    const fClass = v.funding8h == null ? '' : v.funding8h > 0.03 ? 'dn' : v.funding8h < 0 ? 'up' : '';
    body.innerHTML = `<div class="pv-grid">
      <div><span class="k">Funding / 8h</span><b class="${fClass}">${v.funding8h == null ? '–' : v.funding8h.toFixed(4) + '%'}</b><span class="s">${v.funding8h == null ? '' : NT.fmtPct(v.funding8h * 3 * 365, 1) + ' a year'}</span></div>
      <div><span class="k">Open interest</span><b>${v.oiUsd ? '$' + NT.fmtCompact(v.oiUsd) : '–'}</b><span class="s">${oiCh == null ? 'change appears after a few minutes' : NT.fmtPct(oiCh, 2) + ' in ' + sinceMin + 'm'}</span></div>
      <div><span class="k">Long / short</span><b>${v.ls == null ? '–' : v.ls.toFixed(2)}</b><span class="s">accounts ratio</span></div>
      <div><span class="k">Liquidated 1h</span><b><span class="dn">${lq.long ? '$' + NT.fmtCompact(lq.long) : '$0'}</span> / <span class="up">${lq.short ? '$' + NT.fmtCompact(lq.short) : '$0'}</span></b><span class="s">longs / shorts${v.liqs ? '' : ' (n/a)'}</span></div>
    </div>
    <div class="note" style="margin-top:6px">${esc(Deriv.read(v))}</div>
    ${L.length ? `<div class="pv-liqs">${L.slice(0, 8).map((x) => `<div class="${x.side === 'long' ? 'dn' : 'up'}">${x.side === 'long' ? '🔻 long' : '🔺 short'} liquidated · ${NT.fmtPrice(x.px)} · $${NT.fmtCompact(x.sz * x.px)} <span class="note">${esc(fmtClock(x.ts))}</span></div>`).join('')}</div>` : ''}
    <div class="note" style="margin-top:6px">Source: ${esc(v.src)}${v.liqs && v.src !== 'OKX' ? ' + OKX (liquidations)' : ''} · funding paid every ${esc(v.fundingEvery)} · public data, refreshed every 25s.</div>`;
  };
  F.renderTicket = (body, sym, v) => {
    const u = F.ui(), a = F.acct(), mark = F.mark(sym), lev = u.lev, notional = u.margin * lev, liq = mark ? F.liqPrice(u.side, mark, lev) : null;
    const fday = v && v.funding8h != null ? (u.side === 'long' ? 1 : -1) * (v.funding8h / 100) * 3 * notional : null;
    const pos = Object.entries(a.pos);
    body.innerHTML = `<div class="seg pv-side" id="pvSide"><button data-s="long" class="${u.side === 'long' ? 'on up' : ''}">Long</button><button data-s="short" class="${u.side === 'short' ? 'on dn' : ''}">Short</button></div>
      <label class="f">Leverage <b id="pvLevV">${lev}×</b><input type="range" id="pvLev" min="1" max="50" step="1" value="${lev}"></label>
      <div class="row" style="gap:6px"><label class="f" style="flex:1">Margin $<input class="in num" id="pvMargin" type="number" min="1" step="10" value="${esc(u.margin)}"></label><label class="f" style="width:74px">Stop %<input class="in num" id="pvSl" type="number" min="0" step="0.5" value="${esc(u.sl)}" placeholder="off"></label><label class="f" style="width:74px">Target %<input class="in num" id="pvTp" type="number" min="0" step="0.5" value="${esc(u.tp)}" placeholder="off"></label></div>
      <div class="pv-est"><span>Position size <b>${NT.fmtUSD(notional, 0)}</b></span><span>Liquidation ≈ <b class="dn">${liq ? NT.fmtPrice(liq) : '–'}</b>${mark && liq ? ` <span class="note">(${NT.fmtPct((liq / mark - 1) * 100, 1)})</span>` : ''}</span><span>Funding/day ≈ <b class="${fday > 0 ? 'dn' : 'up'}">${fday == null ? '–' : NT.fmtUSD(-fday)}</b></span></div>
      <button class="btn ${u.side === 'long' ? 'buy' : 'sell'}" id="pvGo" style="width:100%">${u.side === 'long' ? 'Open long' : 'Open short'} ${esc(baseOf(sym))} · paper</button>
      <div class="note" style="margin:6px 0">Free margin ${NT.fmtUSD(a.cash)} · perps equity ${NT.fmtUSD(F.equity())}${a.liqs ? ` · ${a.liqs} liquidation${a.liqs > 1 ? 's' : ''}` : ''} · <a href="#" id="pvReset">reset</a></div>
      ${pos.length ? `<table class="pv-pos"><thead><tr><th>Position</th><th class="r">Entry / Liq</th><th class="r">P&amp;L</th><th></th></tr></thead><tbody>${pos.map(([s, p]) => { const m = F.mark(s) || p.entry, pl = F.upnl(p, m); return `<tr data-pv="${esc(s)}"><td><b class="${p.side === 'long' ? 'up' : 'dn'}">${esc(p.side)} ${Math.round(p.lev)}×</b> ${esc(baseOf(s))}<div class="note">margin ${NT.fmtUSD(p.margin)}${p.funding ? ' · funding ' + NT.fmtUSD(-p.funding) : ''}</div></td><td class="r num">${NT.fmtPrice(p.entry)}<div class="note dn">${NT.fmtPrice(p.liq)}</div></td><td class="r num ${pl >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(pl)}<div class="note">${NT.fmtPct((pl / p.margin) * 100, 1)}</div></td><td class="r"><button class="btn sm" data-pvc="0.5">½</button> <button class="btn sm" data-pvc="1">Close</button></td></tr>`; }).join('')}</tbody></table>` : ''}
      <div class="note">Paper only. Leverage multiplies losses as much as gains: at ${lev}× a ${(100 / lev).toFixed(1)}% move against you wipes out the margin.</div>`;
    $('#pvSide').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; u.side = b.dataset.s; saveState(); F.renderTicket(body, sym, v); };
    $('#pvLev').oninput = (e) => { u.lev = +e.target.value; $('#pvLevV').textContent = u.lev + '×'; };
    $('#pvLev').onchange = () => { saveState(); F.renderTicket(body, sym, v); };
    $('#pvMargin').onchange = (e) => { u.margin = Math.max(1, +e.target.value || 1); saveState(); F.renderTicket(body, sym, v); };
    $('#pvSl').onchange = (e) => { u.sl = e.target.value; saveState(); }; $('#pvTp').onchange = (e) => { u.tp = e.target.value; saveState(); };
    $('#pvGo').onclick = () => { try { const t = F.open(sym, u.side, u.lev, u.margin, { slPct: +u.sl || 0, tpPct: +u.tp || 0 }); toast(`⚡ Paper ${esc(u.side)} ${t.lev}× <b>${esc(baseOf(sym))}</b> at ${NT.fmtPrice(t.price)} (size ${NT.fmtUSD(t.usd, 0)})`, u.side === 'long' ? 'up' : 'dn'); F.renderTicket(body, sym, v); } catch (e) { toast(esc(e.message), 'amb'); } };
    $('#pvReset').onclick = (e) => { e.preventDefault(); confirmClick(e.target, () => { F.reset(10000); F.renderTicket(body, sym, v); }); };
    body.querySelectorAll('[data-pvc]').forEach((b) => { b.onclick = () => { const s = b.closest('tr').dataset.pv, t = F.close(s, +b.dataset.pvc); if (t) toast(`Closed ${b.dataset.pvc === '1' ? '' : 'half of '}paper ${esc(t.dir)} ${esc(baseOf(s))}: <b class="${t.pnl >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(t.pnl)}</b>`, t.pnl >= 0 ? 'up' : 'dn'); F.renderTicket(body, sym, v); }; });
  };
  F.start = () => {
    Feed.tickL.push((sym, price) => { if (ST.fut && ST.fut.pos && ST.fut.pos[sym]) F.check(sym, price); });
    setInterval(() => { if (curTab === 'markets' && !document.hidden && ST.mode === 'crypto') F.render(false); for (const s of Object.keys((ST.fut || {}).pos || {})) Deriv.get(s); }, 25000);
  };
  return F;
})();
