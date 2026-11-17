/* ExTerm core — pure logic (no DOM, no network). Works in browser (global NT) and Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NT = {};

  /* ───────────── utils ───────────── */
  NT.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  NT.uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  NT.TF = { '1s': 1, '5s': 5, '10s': 10, '15s': 15, '30s': 30, '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
  /* v15p4 candle body: pixel-snapped, never thinner than 2 px (flat 1s / 5s ticks draw as clean bars, not scattered dashes) */
  NT.bodyRect = (yo, yc, x, bw) => { const w = Math.max(1, Math.round(Math.max(1.5, bw * 0.7))), minH = 3; let top = Math.min(yo, yc), h = Math.abs(yo - yc); if (h < minH) { top -= (minH - h) / 2; h = minH; } const y = Math.round(top); return { x: Math.round(x) - Math.floor(w / 2), y, w, h: Math.max(minH, Math.round(top + h) - y) }; }; // body centred on the wick at round(x)+0.5
  NT.STABLES = new Set(['USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDD', 'PYUSD', 'USDS', 'BUSD', 'USDG', 'USD1', 'RLUSD', 'USDTB', 'USDF', 'BUIDL', 'USYC']);
  NT.WRAPPED = new Set(['WBTC', 'STETH', 'WSTETH', 'WETH', 'WBETH', 'WEETH', 'CBBTC', 'CBETH', 'RETH', 'METH', 'BSC-USD', 'LBTC', 'SOLVBTC', 'JITOSOL', 'MSOL', 'WBNB']);

  NT.fmtTiny = (p) => { // DEX style for sub-cent prices: 0.0₄1965 = 0.00001965
    if (p == null || !isFinite(p) || p <= 0 || p >= 0.001) return NT.fmtPrice(p);
    const z = Math.ceil(-Math.log10(p) - 1e-12) - 1, sig = Math.round(p * Math.pow(10, z + 4)).toString().slice(0, 4).replace(/(\d)0+$/, '$1');
    return '0.0' + String(z).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('') + sig;
  };
  NT.fmtPrice = (p) => {
    if (p == null || !isFinite(p)) return '–';
    const a = Math.abs(p);
    const max = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : a >= 1e-4 || !a ? 8 : Math.min(14, Math.ceil(-Math.log10(a)) + 3); // memecoins: keep ~4 significant digits
    const min = a >= 1 ? 2 : Math.min(4, max);
    return p.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  };
  NT.fmtUSD = (n, d = 2) => {
    if (n == null || !isFinite(n)) return '–';
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (n < 0 ? '-$' : '$') + s;
  };
  NT.fmtCompact = (n) => {
    if (n == null || !isFinite(n)) return '–';
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e12) return s + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
    return s + a.toFixed(a < 10 ? 2 : 0);
  };
  NT.fmtPct = (n, d = 2) => (n == null || !isFinite(n)) ? '–' : Math.abs(n) >= 1e4 ? (n > 0 ? '+' : '-') + NT.fmtCompact(Math.abs(n)) + '%' : (n > 0 ? '+' : '') + n.toFixed(d) + '%';
  NT.fmtQty = (q) => {
    if (q == null || !isFinite(q)) return '–';
    const a = Math.abs(q);
    return q.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8 });
  };
  NT.shortAddr = (a) => (a && a.length > 14) ? a.slice(0, 6) + '…' + a.slice(-4) : (a || '?');

  /* ───────────── indicators ───────────── */
  const ind = {};
  const nan = (n) => new Array(n).fill(NaN);
  ind.sma = (a, p) => {
    const o = nan(a.length); let s = 0, c = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i]; c++;
      if (c > p) { s -= a[i - p]; c--; }
      if (c === p) o[i] = s / p;
    }
    return o;
  };
  ind.ema = (a, p) => {
    const o = nan(a.length), k = 2 / (p + 1);
    let prev = NaN, cnt = 0, sum = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!isFinite(v)) continue;
      if (!isFinite(prev)) { sum += v; cnt++; if (cnt === p) { prev = sum / p; o[i] = prev; } }
      else { prev = v * k + prev * (1 - k); o[i] = prev; }
    }
    return o;
  };
  ind.rsi = (a, p = 14) => {
    const o = nan(a.length);
    if (a.length <= p) return o;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= p; l /= p;
    o[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = p + 1; i < a.length; i++) {
      const d = a[i] - a[i - 1];
      g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
      l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
      o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return o;
  };
  ind.macd = (a, f = 12, s = 26, sg = 9) => {
    const ef = ind.ema(a, f), es = ind.ema(a, s);
    const macd = a.map((_, i) => ef[i] - es[i]);
    const signal = ind.ema(macd, sg);
    const hist = macd.map((m, i) => m - signal[i]);
    return { macd, signal, hist };
  };
  ind.bb = (a, p = 20, m = 2) => {
    const mid = ind.sma(a, p), up = nan(a.length), lo = nan(a.length);
    for (let i = p - 1; i < a.length; i++) {
      let v = 0;
      for (let j = i - p + 1; j <= i; j++) v += (a[j] - mid[i]) ** 2;
      const sd = Math.sqrt(v / p);
      up[i] = mid[i] + m * sd; lo[i] = mid[i] - m * sd;
    }
    return { mid, up, lo };
  };
  ind.atr = (c, p = 14) => {
    const tr = c.map((k, i) => i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c)));
    const o = nan(c.length);
    if (c.length < p) return o;
    let s = 0; for (let i = 0; i < p; i++) s += tr[i];
    o[p - 1] = s / p;
    for (let i = p; i < c.length; i++) o[i] = (o[i - 1] * (p - 1) + tr[i]) / p;
    return o;
  };
  // highest high / lowest low of the previous p bars (excludes the current bar)
  ind.donchian = (c, p) => {
    const hi = nan(c.length), lo = nan(c.length);
    for (let i = p; i < c.length; i++) {
      let h = -Infinity, l = Infinity;
      for (let j = i - p; j < i; j++) { if (c[j].h > h) h = c[j].h; if (c[j].l < l) l = c[j].l; }
      hi[i] = h; lo[i] = l;
    }
    return { hi, lo };
  };
  ind.vwap = (c) => { // rolling session VWAP over full array
    let pv = 0, v = 0;
    return c.map((k) => { const tp = (k.h + k.l + k.c) / 3; pv += tp * k.v; v += k.v; return v ? pv / v : NaN; });
  };
  NT.ind = ind;

  NT.aggregate = (c, secs) => {
    const out = []; let cur = null;
    for (const k of c) {
      const b = Math.floor(k.t / secs) * secs;
      if (!cur || cur.t !== b) { cur = { t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }; out.push(cur); }
      else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); cur.c = k.c; cur.v += k.v; }
    }
    return out;
  };

  NT.pearson = (x, y) => {
    const n = Math.min(x.length, y.length);
    if (n < 3) return NaN;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  };
  NT.logReturns = (closes) => closes.slice(1).map((c, i) => Math.log(c / closes[i]));

  // damped Holt trend forecast on log price (a statistical projection, not a prediction)
  NT.forecast = (closes, h = 24) => {
    const y = closes.filter(isFinite).map(Math.log);
    if (y.length < 20) return [];
    const al = 0.35, be = 0.12, phi = 0.92;
    let l = y[0], b = y[1] - y[0];
    const errs = [];
    for (let t = 1; t < y.length; t++) {
      const pred = l + phi * b; errs.push(y[t] - pred);
      const ln = al * y[t] + (1 - al) * (l + phi * b);
      b = be * (ln - l) + (1 - be) * phi * b; l = ln;
    }
    const m = errs.reduce((s, e) => s + e, 0) / errs.length;
    const sd = Math.sqrt(errs.reduce((s, e) => s + (e - m) ** 2, 0) / errs.length);
    const out = []; let ph = 0;
    for (let k = 1; k <= h; k++) {
      ph += Math.pow(phi, k);
      const mean = l + ph * b, s = sd * Math.sqrt(k);
      out.push({ mean: Math.exp(mean), lo: Math.exp(mean - 1.28 * s), hi: Math.exp(mean + 1.28 * s) });
    }
    return out;
  };

  /* ───────────── squarified treemap ───────────── */
  NT.treemap = (items, x, y, w, h) => {
    items = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    if (!items.length || w <= 0 || h <= 0) return [];
    const total = items.reduce((s, i) => s + i.value, 0), sc = (w * h) / total;
    let rest = items.map((it) => ({ it, a: it.value * sc }));
    const rects = []; let rx = x, ry = y, rw = w, rh = h;
    const sum = (r) => r.reduce((s, q) => s + q.a, 0);
    const worst = (row, side) => {
      const s = sum(row), mx = Math.max(...row.map((q) => q.a)), mn = Math.min(...row.map((q) => q.a));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    while (rest.length) {
      const side = Math.min(rw, rh);
      let row = [rest[0]], i = 1;
      while (i < rest.length) {
        const nr = row.concat(rest[i]);
        if (worst(nr, side) <= worst(row, side)) { row = nr; i++; } else break;
      }
      const s = sum(row);
      if (rw >= rh) {
        const cw = s / rh; let cy = ry;
        for (const q of row) { const ch = q.a / cw; rects.push({ item: q.it, x: rx, y: cy, w: cw, h: ch }); cy += ch; }
        rx += cw; rw -= cw;
      } else {
        const rhh = s / rw; let cx = rx;
        for (const q of row) { const cw = q.a / rhh; rects.push({ item: q.it, x: cx, y: ry, w: cw, h: rhh }); cx += cw; }
        ry += rhh; rh -= rhh;
      }
      rest = rest.slice(row.length);
    }
    return rects;
  };

  /* ───────────── lexicon sentiment (offline fallback for FinBERT-style scoring) ───────────── */
  const POS = 'surge surges surged soar soars soared rally rallies rallied bullish gain gains gained adopt adopts adoption approve approves approved approval inflow inflows breakout upgrade upgraded partnership partners launch launches record high highs accumulate accumulation buy buying outperform growth grows jump jumps jumped climb climbs recover recovers recovery optimism optimistic milestone boost boosts support supports integrates integration etf win wins profit profits'.split(' ');
  const NEG = 'crash crashes crashed plunge plunges plunged dump dumps dumped bearish loss losses lose hack hacked hacks exploit exploited ban bans banned lawsuit sues sued fraud liquidation liquidations liquidated outflow outflows delist delisted delists scam scams collapse collapses fear fears drop drops dropped slump slumps selloff sell-off warns warning probe investigation arrest arrested rug breach stolen theft bankrupt bankruptcy decline declines fall falls fell tumble tumbles risk risks concern concerns fud sanction sanctions'.split(' ');
  const POSS = new Set(POS), NEGS = new Set(NEG), NEGATORS = new Set(['not', 'no', 'never', "isn't", "won't", 'without', 'fails', 'fail', 'denies', 'denied']);
  NT.sentiment = (text) => {
    const w = String(text || '').toLowerCase().replace(/[^a-z\-' ]/g, ' ').split(/\s+/).filter(Boolean);
    let s = 0, n = 0;
    for (let i = 0; i < w.length; i++) {
      let v = POSS.has(w[i]) ? 1 : NEGS.has(w[i]) ? -1 : 0;
      if (!v) continue;
      if ((i > 0 && NEGATORS.has(w[i - 1])) || (i > 1 && NEGATORS.has(w[i - 2]))) v = -v;
      s += v; n++;
    }
    const score = n ? Math.tanh(s / 2) : 0;
    return { score, label: score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral' };
  };

  /* ───────────── paper account ───────────── */
  class Account {
    constructor(o = {}) {
      this.cash0 = o.cash != null ? o.cash : 100000;
      this.cash = o.cash0 != null ? o.cash0 : this.cash0;
      this.fee = o.fee != null ? o.fee : 0.001;
      this.slip = o.slip != null ? o.slip : 0.0005;
      this.pos = {}; this.trades = []; this.orders = []; this.eq = [];
      this.realized = 0; this.fees = 0;
    }
    static from(o) { const a = new Account({ cash: o.cash0, fee: o.fee, slip: o.slip }); Object.assign(a, o); return a; }
    toJSON() { return { cash0: this.cash0, cash: this.cash, fee: this.fee, slip: this.slip, pos: this.pos, trades: this.trades.slice(-1000), orders: this.orders, eq: this.eq.slice(-2000), realized: this.realized, fees: this.fees }; }
    qty(sym) { return this.pos[sym] ? this.pos[sym].qty : 0; }
    avg(sym) { const p = this.pos[sym]; return p && p.qty > 0 ? p.cost / p.qty : 0; }
    buy(sym, price, usd, ts, meta = {}) {
      usd = Math.min(usd, this.cash);
      if (!(usd >= 1) || !(price > 0)) return null;
      const px = price * (1 + this.slip), fee = usd * this.fee, qty = (usd - fee) / px;
      const p = this.pos[sym] || (this.pos[sym] = { qty: 0, cost: 0, sl: null, tp: null, trail: null, hi: 0 });
      if (!(p.qty > 0)) p.t0 = ts; p.qty += qty; p.cost += usd; p.hi = Math.max(p.hi || 0, px);
      const avg = p.cost / p.qty;
      if (meta.slPct) p.sl = avg * (1 - meta.slPct); else if (meta.slPx) p.sl = meta.slPx;
      if (meta.tpPct) p.tp = avg * (1 + meta.tpPct); else if (meta.tpPx) p.tp = meta.tpPx;
      if (meta.trailPct) p.trail = meta.trailPct;
      this.cash -= usd; this.fees += fee;
      const t = { id: NT.uid(), ts, sym, side: 'buy', qty, price: px, usd, fee, pnl: null, reason: meta.reason || '', src: meta.src || '' };
      this.trades.push(t);
      if (NT.onTrade && t.src !== 'backtest') { try { NT.onTrade(t, this); } catch (e) { /* journal must never break trading */ } }
      return t;
    }
    sell(sym, price, qty, ts, meta = {}) {
      const p = this.pos[sym];
      if (!p || p.qty <= 0 || !(price > 0)) return null;
      qty = Math.min(qty == null ? p.qty : qty, p.qty);
      if (!(qty > 0)) return null;
      const px = price * (1 - this.slip), gross = qty * px, fee = gross * this.fee, net = gross - fee;
      const avg = p.cost / p.qty, basis = qty * avg, pnl = net - basis;
      p.cost -= basis; p.qty -= qty;
      if (p.qty < 1e-12) delete this.pos[sym];
      this.cash += net; this.realized += pnl; this.fees += fee;
      const t = { id: NT.uid(), ts, sym, side: 'sell', qty, price: px, usd: net, fee, pnl, pnlPct: basis ? pnl / basis : 0, held: p.t0 != null ? ts - p.t0 : null, reason: meta.reason || '', src: meta.src || '' };
      this.trades.push(t);
      if (NT.onTrade && t.src !== 'backtest') { try { NT.onTrade(t, this); } catch (e) { /* journal must never break trading */ } }
      return t;
    }
    equity(prices) {
      let e = this.cash;
      for (const s in this.pos) { const p = this.pos[s]; e += p.qty * (prices && prices[s] != null ? prices[s] : p.cost / p.qty); }
      return e;
    }
    unrealized(prices) {
      let u = 0;
      for (const s in this.pos) { const p = this.pos[s]; if (prices && prices[s] != null) u += p.qty * prices[s] - p.cost; }
      return u;
    }
    // stop-loss / take-profit / trailing check over the price range seen since the last check
    checkExits(sym, lo, hi, ts, o = {}) {
      const p = this.pos[sym];
      if (!p) return null;
      if (hi > (p.hi || 0)) p.hi = hi;
      const open = o.open != null ? o.open : null;
      let stop = p.sl || 0;
      if (p.trail && p.hi) stop = Math.max(stop, p.hi * (1 - p.trail));
      if (stop && lo <= stop) {
        const fill = open != null && open < stop ? open : stop;
        return this.sell(sym, fill, null, ts, { reason: p.trail && stop > (p.sl || 0) ? 'trailing stop' : 'stop-loss', src: o.src });
      }
      if (p.tp && hi >= p.tp) {
        const fill = open != null && open > p.tp ? open : p.tp;
        return this.sell(sym, fill, null, ts, { reason: 'take-profit', src: o.src });
      }
      return null;
    }
    placeLimit(sym, side, price, size, ts, meta = {}) { // size = usd for buys, qty for sells
      const od = { id: NT.uid(), ts, sym, side, price, size, meta }; this.orders.push(od); return od;
    }
    cancel(id) { this.orders = this.orders.filter((o) => o.id !== id); }
    matchOrders(sym, lo, hi, ts) {
      const done = [];
      for (const o of this.orders.slice()) {
        if (o.sym !== sym) continue;
        let t = null;
        if (o.side === 'buy' && lo <= o.price) t = this.buy(sym, o.price / (1 + this.slip), o.size, ts, { reason: 'limit buy', src: 'manual', ...o.meta });
        else if (o.side === 'sell' && hi >= o.price) t = this.sell(sym, o.price / (1 - this.slip), o.size, ts, { reason: 'limit sell', src: 'manual' });
        if (t || ((o.side === 'buy' && lo <= o.price) || (o.side === 'sell' && hi >= o.price))) { this.cancel(o.id); if (t) done.push(t); }
      }
      return done;
    }
  }
  NT.Account = Account;
  /* Short-side paper account (v13). Same interface as Account so the backtester, bots and validation lab can drive it:
     buy() OPENS a short (usd = collateral set aside), sell() COVERS it. P&L = qty × (entry − exit) − fees. Stops sit ABOVE
     entry, targets BELOW, and the trailing stop follows the lowest low since entry. Spot only: no leverage here (see Futures). */
  class ShortAccount extends Account {
    constructor(o = {}) { super(o); this.short = true; }
    static from(o) { const a = new ShortAccount({ cash: o.cash0, fee: o.fee, slip: o.slip }); Object.assign(a, o); a.short = true; return a; }
    toJSON() { return Object.assign(super.toJSON(), { short: true }); }
    avg(sym) { const p = this.pos[sym]; return p && p.qty > 0 ? p.entry : 0; }
    buy(sym, price, usd, ts, meta = {}) {
      usd = Math.min(usd, this.cash);
      if (!(usd >= 1) || !(price > 0)) return null;
      const px = price * (1 - this.slip), fee = usd * this.fee, qty = (usd - fee) / px; // a short sells into the bid: slippage lowers the fill
      const p = this.pos[sym] || (this.pos[sym] = { qty: 0, cost: 0, entry: 0, sl: null, tp: null, trail: null, lo: Infinity });
      if (!(p.qty > 0)) { p.t0 = ts; p.lo = px; }
      p.entry = p.qty > 0 ? (p.entry * p.qty + px * qty) / (p.qty + qty) : px; p.qty += qty; p.cost += usd - fee; p.lo = Math.min(p.lo, px);
      if (meta.slPct) p.sl = p.entry * (1 + meta.slPct); else if (meta.slPx) p.sl = meta.slPx;
      if (meta.tpPct) p.tp = p.entry * (1 - meta.tpPct); else if (meta.tpPx) p.tp = meta.tpPx;
      if (meta.trailPct) p.trail = meta.trailPct;
      this.cash -= usd; this.fees += fee;
      const t = { id: NT.uid(), ts, sym, side: 'buy', short: true, qty, price: px, usd, fee, pnl: null, reason: meta.reason || '', src: meta.src || '' };
      this.trades.push(t);
      if (NT.onTrade && t.src !== 'backtest') { try { NT.onTrade(t, this); } catch (e) { /* journal must never break trading */ } }
      return t;
    }
    sell(sym, price, qty, ts, meta = {}) { // cover
      const p = this.pos[sym];
      if (!p || p.qty <= 0 || !(price > 0)) return null;
      qty = Math.min(qty == null ? p.qty : qty, p.qty);
      if (!(qty > 0)) return null;
      const px = price * (1 + this.slip), frac = qty / p.qty, basis = p.cost * frac, fee = qty * px * this.fee;
      const pnl = qty * (p.entry - px) - fee, back = Math.max(0, basis + pnl); // a short can lose at most its collateral in this spot model
      p.cost -= basis; p.qty -= qty;
      if (p.qty < 1e-12) delete this.pos[sym];
      this.cash += back; this.realized += back - basis; this.fees += fee;
      const t = { id: NT.uid(), ts, sym, side: 'sell', short: true, qty, price: px, usd: back, fee, pnl: back - basis, pnlPct: basis ? (back - basis) / basis : 0, held: p.t0 != null ? ts - p.t0 : null, reason: meta.reason || '', src: meta.src || '' };
      this.trades.push(t);
      if (NT.onTrade && t.src !== 'backtest') { try { NT.onTrade(t, this); } catch (e) { /* journal must never break trading */ } }
      return t;
    }
    posValue(p, price) { return Math.max(0, p.cost + p.qty * (p.entry - price)); }
    equity(prices) { let e = this.cash; for (const s in this.pos) { const p = this.pos[s]; e += this.posValue(p, prices && prices[s] != null ? prices[s] : p.entry); } return e; }
    unrealized(prices) { let u = 0; for (const s in this.pos) { const p = this.pos[s]; if (prices && prices[s] != null) u += this.posValue(p, prices[s]) - p.cost; } return u; }
    checkExits(sym, lo, hi, ts, o = {}) {
      const p = this.pos[sym];
      if (!p) return null;
      if (lo < (p.lo == null ? Infinity : p.lo)) p.lo = lo;
      const open = o.open != null ? o.open : null;
      let stop = p.sl || Infinity;
      if (p.trail && isFinite(p.lo)) stop = Math.min(stop, p.lo * (1 + p.trail));
      if (isFinite(stop) && hi >= stop) { // stop first when both could have hit inside one bar (conservative)
        const fill = open != null && open > stop ? open : stop;
        return this.sell(sym, fill, null, ts, { reason: p.trail && stop < (p.sl || Infinity) ? 'trailing stop (short)' : 'stop-loss (short)', src: o.src });
      }
      if (p.tp && lo <= p.tp) {
        const fill = open != null && open < p.tp ? open : p.tp;
        return this.sell(sym, fill, null, ts, { reason: 'take-profit (short)', src: o.src });
      }
      return null;
    }
    placeLimit() { return null; } // limit orders are a long-account feature
  }
  NT.ShortAccount = ShortAccount;
  const _from = Account.from; Account.from = (o) => (o && o.short ? ShortAccount.from(o) : _from(o));

  NT.stats = (eq, trades, barsPerYear) => {
    const n = eq.length, first = eq[0], last = eq[n - 1];
    let peak = -Infinity, mdd = 0;
    for (const v of eq) { if (v > peak) peak = v; const dd = peak ? (peak - v) / peak : 0; if (dd > mdd) mdd = dd; }
    const rets = []; for (let i = 1; i < n; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
    const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
    const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1));
    const sells = trades.filter((t) => t.side === 'sell' && t.pnl != null);
    const wins = sells.filter((t) => t.pnl > 0), loss = sells.filter((t) => t.pnl <= 0);
    const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -loss.reduce((s, t) => s + t.pnl, 0);
    return {
      ret: first ? (last / first - 1) * 100 : 0,
      maxDD: mdd * 100,
      sharpe: sd > 0 && barsPerYear ? (mean / sd) * Math.sqrt(barsPerYear) : 0,
      trades: trades.length, closed: sells.length,
      winRate: sells.length ? (wins.length / sells.length) * 100 : null,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
      avgWin: wins.length ? gw / wins.length : 0, avgLoss: loss.length ? -gl / loss.length : 0,
      best: sells.reduce((m, t) => Math.max(m, t.pnl), sells.length ? -Infinity : 0), worst: sells.reduce((m, t) => Math.min(m, t.pnl), sells.length ? Infinity : 0),
    };
  };

  /* ───────────── strategies ─────────────
     prepare(candles, params) -> series; onBar(i, series, candles, ctx) -> array of signals | null
     ctx = { pos:{qty,avg}|null, state, params, price, cash, cash0, ext }
     signal = { side:'buy'|'sell', frac?, usd?, qty?, px? (limit fill), reason, onFill? } */
  const S = {};
  const P = (k, label, def, min, max, step) => ({ k, label, def, min, max, step });
  const buy = (reason, extra) => [Object.assign({ side: 'buy', frac: 1, reason }, extra)];
  const sell = (reason, extra) => [Object.assign({ side: 'sell', frac: 1, reason }, extra)];

  S.smacross = {
    name: 'EMA Crossover', desc: 'Trend following. Buys when the fast EMA crosses above the slow EMA, sells on the opposite cross.',
    params: [P('fast', 'Fast EMA', 9, 2, 100, 1), P('slow', 'Slow EMA', 21, 3, 300, 1)],
    opt: { fast: [5, 8, 12, 16], slow: [20, 30, 50, 80] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { f: ind.ema(cl, p.fast), s: ind.ema(cl, p.slow) }; },
    onBar: (i, Sx, c, ctx) => {
      const p = ctx.params; if (i < 1 || !isFinite(Sx.s[i - 1])) return null;
      const up = Sx.f[i - 1] <= Sx.s[i - 1] && Sx.f[i] > Sx.s[i], dn = Sx.f[i - 1] >= Sx.s[i - 1] && Sx.f[i] < Sx.s[i];
      if (up && !ctx.pos) return buy(`EMA${p.fast} crossed above EMA${p.slow}`);
      if (dn && ctx.pos) return sell(`EMA${p.fast} crossed below EMA${p.slow}`);
      return null;
    },
  };
  S.rsi = {
    name: 'RSI Mean Reversion', desc: 'Buys oversold dips (RSI below the buy level) and sells strength (RSI above the sell level).',
    params: [P('period', 'RSI period', 14, 2, 50, 1), P('buyBelow', 'Buy below', 30, 5, 50, 1), P('sellAbove', 'Sell above', 60, 50, 95, 1)],
    opt: { period: [7, 10, 14, 21], buyBelow: [20, 25, 30, 35], sellAbove: [55, 60, 70] },
    prepare: (c, p) => ({ r: ind.rsi(c.map((x) => x.c), p.period) }),
    onBar: (i, Sx, c, ctx) => {
      const r = Sx.r[i], p = ctx.params; if (!isFinite(r)) return null;
      if (!ctx.pos && r < p.buyBelow) return buy(`RSI ${r.toFixed(1)} < ${p.buyBelow}`);
      if (ctx.pos && r > p.sellAbove) return sell(`RSI ${r.toFixed(1)} > ${p.sellAbove}`);
      return null;
    },
  };
  S.bollinger = {
    name: 'Bollinger Reversion', desc: 'Buys when price closes below the lower band, sells when it recovers to the middle band.',
    params: [P('period', 'Period', 20, 5, 100, 1), P('mult', 'Std-dev mult', 2, 0.5, 4, 0.1)],
    opt: { period: [10, 15, 20, 30], mult: [1.5, 2, 2.5] },
    prepare: (c, p) => ind.bb(c.map((x) => x.c), p.period, p.mult),
    onBar: (i, Sx, c, ctx) => {
      if (!isFinite(Sx.lo[i])) return null; const px = c[i].c;
      if (!ctx.pos && px < Sx.lo[i]) return buy('close below lower band');
      if (ctx.pos && px > Sx.mid[i]) return sell('close above middle band');
      return null;
    },
  };
  S.macd = {
    name: 'MACD Momentum', desc: 'Buys when the MACD line crosses above its signal line, sells on a cross below.',
    params: [P('fast', 'Fast', 12, 2, 50, 1), P('slow', 'Slow', 26, 5, 100, 1), P('signal', 'Signal', 9, 2, 30, 1)],
    opt: { fast: [8, 12, 16], slow: [21, 26, 34], signal: [7, 9, 12] },
    prepare: (c, p) => ind.macd(c.map((x) => x.c), p.fast, p.slow, p.signal),
    onBar: (i, Sx, c, ctx) => {
      if (i < 1 || !isFinite(Sx.hist[i - 1]) || !isFinite(Sx.hist[i])) return null;
      if (Sx.hist[i - 1] <= 0 && Sx.hist[i] > 0 && !ctx.pos) return buy('MACD crossed above signal');
      if (Sx.hist[i - 1] >= 0 && Sx.hist[i] < 0 && ctx.pos) return sell('MACD crossed below signal');
      return null;
    },
  };
  S.donchian = {
    name: 'Donchian Breakout', desc: 'Turtle-style breakout. Buys a new N-bar high, exits on a new shorter-term low.',
    params: [P('entry', 'Entry bars', 20, 5, 100, 1), P('exit', 'Exit bars', 10, 3, 60, 1)],
    opt: { entry: [10, 20, 30, 55], exit: [5, 10, 20] },
    prepare: (c, p) => ({ en: ind.donchian(c, p.entry), ex: ind.donchian(c, p.exit) }),
    onBar: (i, Sx, c, ctx) => {
      if (!isFinite(Sx.en.hi[i])) return null; const px = c[i].c;
      if (!ctx.pos && px > Sx.en.hi[i]) return buy(`broke ${ctx.params.entry}-bar high`);
      if (ctx.pos && isFinite(Sx.ex.lo[i]) && px < Sx.ex.lo[i]) return sell(`broke ${ctx.params.exit}-bar low`);
      return null;
    },
  };
  S.grid = {
    name: 'Grid Bot', desc: 'Market-making style grid. Places buy lines below price and sells one line higher, harvesting range-bound chop. Starts flat; lines are fixed around the start price.',
    params: [P('levels', 'Grid levels', 8, 2, 40, 1), P('range', 'Range ± %', 6, 1, 40, 0.5), P('usd', 'USD per grid (0 = auto)', 0, 0, 1e6, 10)],
    opt: { levels: [5, 8, 12, 16], range: [3, 5, 8, 12] },
    prepare: () => ({}),
    onExit: (st) => { if (st.slots) st.slots = st.slots.map(() => 0); },
    onBar: (i, Sx, c, ctx) => {
      const p = ctx.params, st = ctx.state, bar = c[i], n = Math.round(p.levels);
      if (!st.lines) {
        const lo = bar.c * (1 - p.range / 100), hi = bar.c * (1 + p.range / 100);
        st.lines = []; for (let k = 0; k <= n; k++) st.lines.push(lo * Math.pow(hi / lo, k / n));
        st.slots = new Array(n).fill(0); st.prev = bar.c; return null;
      }
      const per = p.usd > 0 ? p.usd : ctx.cash0 / n, out = [];
      for (let k = 0; k < n; k++) {
        const L = st.lines[k], U = st.lines[k + 1];
        if (st.slots[k] > 0) {
          if (bar.h >= U) out.push({ side: 'sell', qty: st.slots[k], px: bar.l > U ? bar.o : U, reason: `grid sell @ ${NT.fmtPrice(U)}`, onFill: () => { st.slots[k] = 0; } });
        } else if (st.prev > L && bar.l <= L) {
          out.push({ side: 'buy', usd: per, px: bar.h < L ? bar.o : L, reason: `grid buy @ ${NT.fmtPrice(L)}`, onFill: (t) => { st.slots[k] = t.qty; } });
        }
      }
      st.prev = bar.c;
      return out.length ? out : null;
    },
  };
  S.dca = {
    name: 'DCA Bot', desc: 'Dollar-cost averaging. Buys a fixed USD amount every N bars and sells everything at a take-profit above the average cost.',
    params: [P('every', 'Buy every N bars', 24, 1, 500, 1), P('usd', 'USD per buy', 100, 5, 1e6, 5), P('tp', 'Take-profit % (0 = off)', 8, 0, 100, 0.5)],
    opt: { every: [6, 12, 24, 48], tp: [4, 8, 12] },
    prepare: () => ({}),
    onExit: (st) => { st.n = 0; },
    onBar: (i, Sx, c, ctx) => {
      const p = ctx.params, st = ctx.state;
      if (st.n == null) st.n = p.every;
      st.n++;
      if (ctx.pos && p.tp > 0 && c[i].c >= ctx.pos.avg * (1 + p.tp / 100)) { st.n = 0; return sell(`take-profit ${p.tp}%`); }
      if (st.n >= p.every) { st.n = 0; return [{ side: 'buy', usd: p.usd, reason: `DCA buy $${p.usd}` }]; }
      return null;
    },
  };
  S.whaleflow = {
    name: 'Whale-Flow Follower', liveOnly: true,
    desc: 'LIVE ONLY. Follows on-chain whale flow from the Whales tab. ETH: net exchange outflow (accumulation) = buy, inflow = exit. Other coins: net stablecoin inflow to exchanges (buying power).',
    params: [P('window', 'Window (min)', 60, 5, 720, 5), P('thr', 'Trigger ($M net)', 20, 1, 5000, 1)],
    prepare: () => ({}),
    onBar: (i, Sx, c, ctx) => {
      const f = ctx.ext && ctx.ext.whale ? ctx.ext.whale(ctx.params.window) : null;
      if (!f) return null;
      const thr = ctx.params.thr * 1e6;
      if (!ctx.pos && f.net >= thr) return buy(`whale net flow +${NT.fmtCompact(f.net)}`);
      if (ctx.pos && f.net <= -thr / 2) return sell(`whale net flow ${NT.fmtCompact(f.net)}`);
      return null;
    },
  };
  NT.strategies = S;
  NT.defaultParams = (id) => Object.fromEntries(S[id].params.map((q) => [q.k, q.def]));

  NT.execSignal = (acct, sym, sig, price, ts, o = {}) => {
    const px = sig.px != null ? sig.px : price;
    let t = null;
    if (sig.side === 'buy') {
      const usd = sig.usd != null ? sig.usd : (sig.frac != null ? sig.frac : 1) * (o.posPct != null ? o.posPct : 1) * acct.cash;
      t = acct.buy(sym, px, usd, ts, { reason: sig.reason, src: o.src, slPct: sig.slPct != null ? sig.slPct : o.slPct, tpPct: sig.tpPct != null ? sig.tpPct : o.tpPct, trailPct: sig.trailPct != null ? sig.trailPct : o.trailPct, slPx: sig.slPx, tpPx: sig.tpPx });
    } else {
      const have = acct.qty(sym);
      if (have > 0) t = acct.sell(sym, px, sig.qty != null ? Math.min(sig.qty, have) : (sig.frac != null ? sig.frac : 1) * have, ts, { reason: sig.reason, src: o.src });
    }
    if (t && sig.onFill) sig.onFill(t);
    return t;
  };

  /* Backtest engine. Long-only, signals fill at the next bar open (or later with o.delay), intrabar stops are
     checked before targets (pessimistic), gaps fill at the open. Optional "enhancers" make strategies more robust:
     o.trendEma (only buy above EMA N), o.atrStop / o.atrTrail (k × ATR14), o.timeStop (bars), o.riskPct (% equity risked
     per trade, sized off the stop), o.cooldown (bars to wait after a losing exit), o.delay (extra bars of latency). */
  NT.backtest = (candles, strat, params, o = {}) => {
    const SHORT = !!(o.short || strat.short), acct = new (SHORT ? ShortAccount : Account)({ cash: o.cash || 10000, fee: o.fee != null ? o.fee : 0.001, slip: o.slip != null ? o.slip : 0.0005 });
    const SYM = 'X', state = {}, n = candles.length, Sx = strat.prepare(candles, params);
    const eo = { src: 'backtest', posPct: o.posPct != null ? o.posPct : 1, slPct: o.slPct, tpPct: o.tpPct, trailPct: o.trailPct };
    const atr = o.atrStop || o.atrTrail || o.riskPct ? ind.atr(candles, 14) : null;
    const tEma = o.trendEma ? ind.ema(candles.map((c) => c.c), o.trendEma) : null;
    const delay = Math.max(0, o.delay | 0);
    const eq = [], bh = []; let queue = [], entryIdx = -1, lastLoss = -1e9, inMkt = 0, filtered = 0;
    // o.fromT (v13): test only the window from this timestamp on. Earlier candles are warm-up: indicators see them
    // (prepare ran on the whole array), but no trades happen and equity starts at the window's first bar.
    let fi = 0; if (o.fromT) { while (fi < n && candles[fi].t < o.fromT) fi++; if (fi >= n) fi = n - 1; }
    const closed = (t, i, external) => {
      if (!t || t.side !== 'sell') return;
      if (t.pnl < 0) lastLoss = i;
      if (!acct.pos[SYM]) { entryIdx = -1; if (external && strat.onExit) strat.onExit(state); }
    };
    for (let i = fi; i < n; i++) {
      const b = candles[i];
      if (queue.length) {
        const due = queue.filter((q) => q.at <= i); queue = queue.filter((q) => q.at > i);
        for (const q of due) {
          const sg = q.sg, k = q.i;
          if (sg.side !== 'buy') { closed(NT.execSignal(acct, SYM, sg, b.o, b.t, eo), i, false); continue; }
          if (tEma && !(SHORT ? candles[k].c < tEma[k] : candles[k].c > tEma[k])) { filtered++; continue; }
          if (o.cooldown && k - lastLoss < o.cooldown) { filtered++; continue; }
          let sig = sg;
          if (o.riskPct && atr && isFinite(atr[k]) && sg.usd == null) {
            const stopDist = o.atrStop ? o.atrStop * atr[k] : state.sl && (SHORT ? state.sl > b.o : state.sl < b.o) ? Math.abs(b.o - state.sl) : 2 * atr[k];
            const usd = Math.min(acct.cash, (acct.equity({ [SYM]: b.o }) * (o.riskPct / 100)) / Math.max(1e-9, stopDist / b.o));
            sig = Object.assign({}, sg, { usd, frac: undefined });
          }
          const had = !!acct.pos[SYM], t = NT.execSignal(acct, SYM, sig, b.o, b.t, eo);
          if (t && t.side === 'buy') {
            if (!had) entryIdx = i;
            const p = acct.pos[SYM];
            if (atr && isFinite(atr[k])) { if (o.atrStop) p.sl = SHORT ? Math.min(p.sl || Infinity, t.price + o.atrStop * atr[k]) : Math.max(p.sl || 0, t.price - o.atrStop * atr[k]); if (o.atrTrail) p.trail = (o.atrTrail * atr[k]) / t.price; }
          }
        }
      }
      if (o.timeStop && entryIdx >= 0 && acct.pos[SYM] && i - entryIdx >= o.timeStop) closed(acct.sell(SYM, b.o, null, b.t, { reason: `time stop (${o.timeStop} bars)`, src: 'backtest' }), i, true);
      closed(acct.checkExits(SYM, b.l, b.h, b.t, { open: b.o, src: 'backtest' }), i, true);
      const p = acct.pos[SYM], pos = p ? { qty: p.qty, avg: acct.avg(SYM) } : null;
      if (p) inMkt++;
      const sigs = strat.onBar(i, Sx, candles, { pos, state, params, price: b.c, cash: acct.cash, cash0: acct.cash0, ext: {} }) || [];
      for (const sg of sigs) {
        if (sg.px != null) { const had = !!acct.pos[SYM], t = NT.execSignal(acct, SYM, sg, b.c, b.t, eo); if (t && t.side === 'buy' && !had) entryIdx = i; else closed(t, i, false); }
        else queue.push({ sg, i, at: i + 1 + delay });
      }
      eq.push(acct.equity({ [SYM]: b.c }));
      bh.push(acct.cash0 * (b.c / candles[fi].c));
    }
    const tfSec = o.tfSec || 3600;
    return { acct, eq, bh, trades: acct.trades, stats: NT.stats(eq, acct.trades, (365 * 86400) / tfSec), t: (fi ? candles.slice(fi) : candles).map((c) => c.t), exposure: n - fi ? inMkt / (n - fi) : 0, filtered, short: SHORT, from: fi };
  };

  // extended performance metrics (pro-desk style)
  NT.metrics = (r, candles, tfSec) => {
    const eq = r.eq, n = eq.length, years = Math.max(1e-9, (n * tfSec) / (365 * 86400)), first = eq[0] || 1, last = eq[n - 1] || first;
    const cagr = (Math.pow(Math.max(1e-12, last / first), 1 / years) - 1) * 100;
    const rets = []; for (let i = 1; i < n; i++) rets.push(eq[i] / eq[i - 1] - 1);
    const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1), down = rets.filter((x) => x < 0), dd = Math.sqrt(down.reduce((s, x) => s + x * x, 0) / (rets.length || 1));
    const bpy = (365 * 86400) / tfSec, sortino = dd > 0 ? (mean / dd) * Math.sqrt(bpy) : 0;
    let peak = -Infinity, ulc = 0, ddDur = 0, maxDur = 0;
    for (const v of eq) { if (v >= peak) { peak = v; ddDur = 0; } else { ddDur++; if (ddDur > maxDur) maxDur = ddDur; } const d = peak ? (peak - v) / peak : 0; ulc += d * d * 1e4; }
    const ulcer = Math.sqrt(ulc / (n || 1));
    const sells = r.trades.filter((t) => t.side === 'sell' && t.pnl != null), pp = sells.map((t) => t.pnlPct || 0);
    const wins = pp.filter((x) => x > 0), losses = pp.filter((x) => x <= 0);
    const avgW = wins.length ? wins.reduce((s, x) => s + x, 0) / wins.length : 0, avgL = losses.length ? losses.reduce((s, x) => s + x, 0) / losses.length : 0;
    const wr = pp.length ? wins.length / pp.length : 0, expectancy = pp.length ? pp.reduce((s, x) => s + x, 0) / pp.length : 0;
    const sd = Math.sqrt(pp.reduce((s, x) => s + (x - expectancy) ** 2, 0) / Math.max(1, pp.length - 1));
    let streak = 0, maxStreak = 0; for (const x of pp) { if (x <= 0) { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0; }
    // holding periods: pair each sell with the buys before it
    const holds = []; let openTs = null;
    for (const t of r.trades) { if (t.side === 'buy' && openTs == null) openTs = t.ts; else if (t.side === 'sell' && openTs != null) { holds.push((t.ts - openTs) / tfSec); if (!r.acct.pos || true) openTs = null; } }
    const maxDD = r.stats.maxDD, ret = r.stats.ret;
    return {
      cagr, sortino, calmar: maxDD > 0 ? cagr / maxDD : 0, expectancy: expectancy * 100, avgWin: avgW * 100, avgLoss: avgL * 100, payoff: avgL ? Math.abs(avgW / avgL) : null,
      maxConsecLoss: maxStreak, sqn: sd > 0 ? (expectancy / sd) * Math.sqrt(Math.min(pp.length, 100)) : 0, kelly: avgL && avgW ? (wr - (1 - wr) / Math.abs(avgW / avgL)) * 100 : null,
      ulcer, recovery: maxDD > 0 ? ret / maxDD : 0, exposure: (r.exposure || 0) * 100, avgHold: holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : 0, holds,
      maxDDBars: maxDur, tradesPerMonth: pp.length / Math.max(1e-9, years * 12), years, pnlPcts: pp,
    };
  };

  NT.optimize = (candles, strat, base, o = {}) => {
    const keys = Object.keys(strat.opt || {});
    if (!keys.length) return [];
    let combos = [{}];
    for (const k of keys) { const nx = []; for (const c of combos) for (const v of strat.opt[k]) nx.push(Object.assign({}, c, { [k]: v })); combos = nx; }
    combos = combos.slice(0, 120);
    const res = [];
    for (const cb of combos) {
      const params = Object.assign({}, base, cb);
      if (params.fast != null && params.slow != null && params.fast >= params.slow) continue;
      const r = NT.backtest(candles, strat, params, o);
      res.push({ params, ret: r.stats.ret, maxDD: r.stats.maxDD, sharpe: r.stats.sharpe, trades: r.stats.closed, score: r.stats.ret / (1 + r.stats.maxDD / 10) });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 8);
  };

  /* ───────────── assistant intent parser ───────────── */
  NT.NAMES = { bitcoin: 'BTC', btc: 'BTC', ethereum: 'ETH', ether: 'ETH', eth: 'ETH', solana: 'SOL', sol: 'SOL', ripple: 'XRP', xrp: 'XRP', dogecoin: 'DOGE', doge: 'DOGE', cardano: 'ADA', ada: 'ADA', chainlink: 'LINK', link: 'LINK', avalanche: 'AVAX', avax: 'AVAX', litecoin: 'LTC', ltc: 'LTC', polkadot: 'DOT', dot: 'DOT', uniswap: 'UNI', shiba: 'SHIB', pepe: 'PEPE', sui: 'SUI', near: 'NEAR', aave: 'AAVE', stellar: 'XLM', xlm: 'XLM', hedera: 'HBAR', hbar: 'HBAR', bnb: 'BNB' };
  const STRAT_WORDS = { rsi: 'rsi', ema: 'smacross', sma: 'smacross', cross: 'smacross', crossover: 'smacross', macd: 'macd', bollinger: 'bollinger', bb: 'bollinger', donchian: 'donchian', breakout: 'donchian', turtle: 'donchian', grid: 'grid', dca: 'dca', whale: 'whaleflow', whaleflow: 'whaleflow', momentum: 'macd', trend: 'smacross' };
  const RESERVED = new Set(['all', 'one', 'for', 'the', 'buy', 'sell', 'and', 'are', 'now', 'top', 'max', 'new', 'use', 'run', 'can', 'get', 'how', 'why', 'set', 'see', 'bot', 'bots', 'my', 'me', 'is', 'on', 'in', 'at', 'to', 'of', 'a', 'i', 'it', 'pnl', 'usd', 'long', 'short', 'half', 'stop', 'open', 'add', 'low', 'high', 'real', 'time', 'yes', 'no', 'ok', 'up', 'out', 'ai', 'go', 'do', 'make', 'start', 'with', 'what', 'whale', 'wave', 'rsi', 'ema', 'sma', 'macd', 'bb', 'dca', 'grid', 'trend', 'move', 'play', 'safe', 'fun', 'hold', 'bag', 'sec', 'etf', 'net', 'key', 'ath', 'dip', 'pump', 'dump', 'bull', 'bear', 'coin', 'token', 'swap', 'give', 'take', 'list', 'show', 'tell', 'view', 'chart', 'price', 'alert', 'above', 'below', 'cost', 'pm', 'am', 'ma', 'hood', 'nice', 'fast', 'meme']);
  NT.parseIntent = (text, bases) => {
    const raw = String(text || '').trim(), lc = raw.toLowerCase(), o = { raw, type: 'chat' };
    const toks = lc.replace(/[^a-z0-9$.%\-' ]/g, ' ').split(/\s+/).filter(Boolean);
    // strategy
    for (const w of toks) if (STRAT_WORDS[w]) { o.strat = STRAT_WORDS[w]; break; }
    if (/dollar[- ]cost/.test(lc)) o.strat = 'dca';
    // symbol
    for (const w of toks) { if (NT.NAMES[w]) { o.sym = NT.NAMES[w]; break; } }
    if (!o.sym) for (const w of raw.split(/[\s,]+/)) {
      const u = w.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().replace(/-USD$/, '');
      if (u.length >= 2 && bases && bases.has(u) && !RESERVED.has(u.toLowerCase())) { o.sym = u; break; }
    }
    // timeframe
    const tf = lc.match(/\b(1s|5s|15s|30s|1m|3m|5m|15m|30m|1h|2h|4h|1d)\b/); if (tf) o.tf = tf[1];
    else if (/\bdaily\b/.test(lc)) o.tf = '1d'; else if (/\bhourly\b/.test(lc)) o.tf = '1h';
    // amounts
    let m;
    if ((m = lc.match(/\$\s?([\d,]*\.?\d+)\s?(k|m)?/))) o.usd = parseFloat(m[1].replace(/,/g, '')) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
    else if ((m = lc.match(/([\d,]*\.?\d+)\s?(k)?\s?(usd|usdt|usdc|dollars?|bucks)\b/))) o.usd = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1e3 : 1);
    if ((m = lc.match(/(\d+(?:\.\d+)?)\s?%/))) o.pct = parseFloat(m[1]);
    if (o.usd == null && (m = lc.match(/\b(\d*\.?\d+)\s+(?:of\s+)?(?:[a-z]+\s+)?(?=\b(?:btc|eth|sol|xrp|doge|ada|link|avax|ltc|dot|uni|shib|pepe|sui|near|aave|xlm|hbar|bitcoin|ethereum|solana|ripple|dogecoin|cardano|chainlink|avalanche|litecoin|polkadot)\b)/)) && o.pct == null) o.qty = parseFloat(m[1]);
    if (/\b(all|everything|entire|whole)\b/.test(lc)) o.all = true;
    if (/\bhalf\b/.test(lc)) o.pct = 50;
    if ((m = lc.match(/(above|over|below|under|crosses? (?:above|below)|hits?|reach(?:es)?)\s+\$?\s?([\d,]*\.?\d+)\s?(k)?/))) { o.alertDir = /below|under/.test(m[1]) ? 'below' : 'above'; o.alertPrice = parseFloat(m[2].replace(/,/g, '')) * (m[3] ? 1e3 : 1); }
    // type
    const has = (re) => re.test(lc);
    if (has(/^(help|\?|commands|what can you do|how do (i|you) use)/)) o.type = 'help';
    else if (has(/\b(alert|notify me|remind me|ping me)\b/)) o.type = 'alert';
    else if (has(/\b(back-?test|test (the |a |my )?strateg)/)) o.type = 'backtest';
    else if (has(/\b(start|create|launch|run|spawn|make|add|deploy|build|set up|setup)\b/) && has(/\bbots?\b/)) o.type = 'bot';
    else if (has(/\b(buy|sell|long|close|exit|dump|liquidate)\b/) && (o.sym || o.all) && !has(/\b(should|would|worth|good time|when|how)\b/)) o.type = 'trade';
    else if (has(/\b(portfolio|positions?|holdings?|balance|pnl|p&l|profit|equity|account|how am i doing)\b/)) o.type = 'portfolio';
    else if (has(/\b(bots?|strategies)\b/)) o.type = 'bots';
    else if (has(/\b(whales?|insider|wallets?|on-?chain|exchange flows?|smart money)\b/)) o.type = 'whales';
    else if (has(/\b(heat ?map|market|movers|gainers|losers|breadth|top coins)\b/)) o.type = 'market';
    else if (has(/\b(news|sentiment|headlines?|fear|greed)\b/)) o.type = 'news';
    else if (has(/\b(forecast|predict|projection|prediction)\b/)) o.type = 'forecast';
    else if (has(/\b(analy[sz]e|analysis|technicals?|outlook|signal|rsi|macd|trend|support|resistance|how is|what.?s .* doing|look(s|ing)? like)\b/) && o.sym) o.type = 'analyze';
    else if (o.sym && has(/\b(should|would|worth|good time|safe|bullish|bearish|pump|moon|going to|gonna|buy|sell|hold)\b/)) o.type = 'analyze';
    else if (has(/\b(show|open|chart|go to|switch to|pull up)\b/) && o.sym) o.type = 'open';
    else if (has(/\b(price|quote|worth|cost|how much)\b/) && o.sym) o.type = 'price';
    else if (o.sym && toks.length <= 3) o.type = 'analyze';
    return o;
  };

  return NT;
});
