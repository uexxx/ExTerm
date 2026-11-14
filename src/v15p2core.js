/* ExTerm v15 phase 2 core: pure logic for click-to-trade brackets, realistic paper fills, backtest round trips and the
   Field Manual search. No DOM here, so every function is unit-tested in Node (test/v15p2.test.js). */
const P2 = (() => {
  const P = {};

  /* ── bracket math: a long (or short) position with entry, stop and target → dollar P&L, % move and reward-to-risk ── */
  P.bracket = (b) => {
    const entry = +b.entry, sl = +b.sl, tp = +b.tp, dir = b.short ? -1 : 1;
    const qty = b.qty > 0 ? +b.qty : b.usd > 0 && entry > 0 ? b.usd / entry : 0;
    const r = { qty, risk: null, reward: null, slPct: null, tpPct: null, rr: null };
    if (!(entry > 0)) return r;
    if (sl > 0) { r.slPct = (sl / entry - 1) * 100; r.risk = (sl - entry) * qty * dir; }
    if (tp > 0) { r.tpPct = (tp / entry - 1) * 100; r.reward = (tp - entry) * qty * dir; }
    if (r.risk != null && r.reward != null && r.risk < 0 && r.reward > 0) r.rr = r.reward / -r.risk;
    return r;
  };
  /* live P&L of an open bracket at the current price */
  P.live = (b, price) => {
    const entry = +b.entry, qty = b.qty > 0 ? +b.qty : b.usd > 0 && entry > 0 ? b.usd / entry : 0, dir = b.short ? -1 : 1;
    if (!(entry > 0) || !(price > 0)) return { pnl: null, pct: null };
    return { pnl: (price - entry) * qty * dir, pct: (price / entry - 1) * 100 * dir };
  };
  /* keep a dragged line on its own side of the entry (a long's stop below, its target above) */
  P.clampLine = (field, v, b) => {
    if (!(v > 0) || !isFinite(v)) return null;
    const e = +b.entry, eps = 1e-6, lo = (x) => x * (1 - eps), hi = (x) => x * (1 + eps), long = !b.short;
    if (field === 'sl' && e > 0) return long ? Math.min(v, lo(e)) : Math.max(v, hi(e));
    if (field === 'tp' && e > 0) return long ? Math.max(v, hi(e)) : Math.min(v, lo(e));
    if (field === 'entry') {
      let x = v; const below = long ? b.sl : b.tp, above = long ? b.tp : b.sl;
      if (below > 0) x = Math.max(x, hi(below)); if (above > 0) x = Math.min(x, lo(above));
      return x;
    }
    return v;
  };
  /* default stop/target for a new draft: the ticket's % if set, else 2% stop and a 2R target */
  P.defaults = (entry, slPct, tpPct) => {
    const s = slPct > 0 && slPct < 90 ? slPct / 100 : 0.02, sl = entry * (1 - s);
    return { entry, sl, tp: tpPct > 0 ? entry * (1 + tpPct / 100) : entry + 2 * (entry - sl) };
  };

  /* ── undo / redo for line moves: each action is { key, field, from, to } ── */
  class History {
    constructor(max = 100) { this.u = []; this.r = []; this.max = max; }
    push(a) { if (!a || a.from === a.to) return false; this.u.push(a); if (this.u.length > this.max) this.u.shift(); this.r = []; return true; }
    undo() { const a = this.u.pop(); if (a) this.r.push(a); return a || null; }
    redo() { const a = this.r.pop(); if (a) this.u.push(a); return a || null; }
    get canUndo() { return this.u.length > 0; }
    get canRedo() { return this.r.length > 0; }
    clear() { this.u = []; this.r = []; }
  }
  P.History = History;

  /* ── realistic paper execution: half the bid-ask spread + walking the order book (or an AMM curve) for the size ──
     ctx.kind: 'cex' (order book in ctx.book = { bids: [[px, qty]], asks: [[px, qty]] }), 'dex' (pool liquidity in USD in
     ctx.liq), 'stock'. Returns the fill price and the cost split in basis points. Deterministic: same input, same fill. */
  P.exec = (side, price, usd, ctx = {}) => {
    const kind = ctx.kind === 'dex' || ctx.kind === 'stock' ? ctx.kind : 'cex';
    const out = { price, spreadBp: 0, impactBp: 0, bp: 0, kind, note: '' };
    if (!(price > 0) || !(usd > 0) || !isFinite(usd)) return out;
    const sgn = side === 'sell' ? -1 : 1;
    if (kind === 'dex') {
      // constant-product pool: buying $u against a quote reserve R (half the pool's liquidity) pays an average of u/R more
      const liq = ctx.liq > 0 && isFinite(ctx.liq) ? +ctx.liq : 0, R = (liq || 50000) / 2;
      out.spreadBp = ctx.feeBp > 0 ? +ctx.feeBp : 25; // pool swap fee (0.25% on Raydium / Uniswap-style pools)
      out.impactBp = (usd / (R + usd)) * 1e4;
      if (!liq) out.note = 'pool liquidity unknown: assumed $50K';
    } else {
      const bk = ctx.book, levels = bk && Array.isArray(sgn > 0 ? bk.asks : bk.bids) ? (sgn > 0 ? bk.asks : bk.bids) : null;
      const bb = bk && bk.bids && bk.bids[0] ? +bk.bids[0][0] : 0, ba = bk && bk.asks && bk.asks[0] ? +bk.asks[0][0] : 0;
      if (levels && levels.length && bb > 0 && ba > bb) {
        const mid = (bb + ba) / 2, best = sgn > 0 ? ba : bb;
        out.spreadBp = ((ba - bb) / 2 / mid) * 1e4;
        let left = usd, qty = 0, cost = 0, last = best;
        for (const lv of levels) {
          const p = +lv[0], q = +lv[1]; if (!(p > 0) || !(q > 0)) continue;
          const take = Math.min(q, left / p); qty += take; cost += take * p; left -= take * p; last = p;
          if (left <= 1e-9) break;
        }
        if (left > 1e-9) { const p = last * (1 + sgn * 0.005); qty += left / p; cost += left; out.note = 'order is larger than the visible book'; }
        const vwap = cost / qty; out.impactBp = Math.max(0, sgn * (vwap / best - 1) * 1e4);
      } else if (kind === 'stock') {
        out.spreadBp = price < 5 ? 10 : 1.5; out.impactBp = 10 * Math.sqrt(usd / 1e6);
      } else {
        out.spreadBp = 1; out.impactBp = 8 * Math.sqrt(usd / 1e6);
      }
    }
    out.impactBp = Math.min(out.impactBp, 5000);
    out.bp = out.spreadBp + out.impactBp;
    out.price = price * (1 + (sgn * out.bp) / 1e4);
    return out;
  };

  /* ── backtest round trips: buys open (and can scale in), sells close; P&L from the trades themselves ── */
  P.trips = (trades) => {
    const out = []; let o = null;
    const close = () => {
      const avg = o.q > 0 ? o.cost / o.q : o.p0;
      o.avg = avg; o.pct = o.pnl != null && o.cost > 0 ? (o.pnl / o.cost) * 100 : o.p1 > 0 ? ((o.p1 / avg - 1) * 100) * (o.short ? -1 : 1) : null;
      o.win = o.pct != null ? o.pct > 0 : null; out.push(o); o = null;
    };
    for (const t of Array.isArray(trades) ? trades : []) {
      if (!t || !(t.price > 0) || (t.side !== 'buy' && t.side !== 'sell')) continue;
      const q = t.qty > 0 ? +t.qty : 0;
      if (t.side === 'buy') {
        if (!o) o = { t0: t.ts, p0: t.price, q: 0, cost: 0, sold: 0, pnl: null, n: 0, short: !!t.short, t1: null, p1: null, reason: '', open: true, why0: t.reason || '' };
        o.q += q; o.cost += q * t.price; o.n++;
        continue;
      }
      if (!o) continue; // a sell with nothing open (e.g. the window started mid-trade)
      o.sold += q; o.t1 = t.ts; o.p1 = t.price; o.reason = t.reason || '';
      if (t.pnl != null && isFinite(t.pnl)) o.pnl = (o.pnl || 0) + t.pnl;
      if (!(q > 0) || o.sold >= o.q * (1 - 1e-9)) { o.open = false; close(); }
    }
    if (o) out.push(Object.assign(o, { avg: o.q > 0 ? o.cost / o.q : o.p0, pct: null, win: null })); // still open at the end
    return out;
  };
  P.tripStats = (trips) => {
    const done = trips.filter((t) => !t.open && t.pct != null), w = done.filter((t) => t.win);
    return { n: done.length, wins: w.length, losses: done.length - w.length, winRate: done.length ? (w.length / done.length) * 100 : null };
  };

  /* ── Field Manual search: every word must appear in the title, tags or body ── */
  P.search = (items, q) => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!words.length) return items.slice();
    return items.filter((it) => { const h = (it.t + ' ' + (it.k || '') + ' ' + it.b).toLowerCase(); return words.every((w) => h.includes(w)); });
  };

  /* ── Morning Brief: the day's numbers in plain values (the UI escapes and formats them) ── */
  P.brief = (s) => {
    const movers = (s.watch || []).filter((w) => w && w.ch != null && isFinite(w.ch)).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 5);
    const pos = (s.pos || []).map((p) => ({ sym: p.sym, pnl: p.px > 0 && p.avg > 0 ? (p.px - p.avg) * p.qty : null, toSl: p.sl > 0 && p.px > 0 ? (p.sl / p.px - 1) * 100 : null, toTp: p.tp > 0 && p.px > 0 ? (p.tp / p.px - 1) * 100 : null, naked: !(p.sl > 0) }));
    return { movers, pos, eqCh: s.eq != null && s.eq0 > 0 ? (s.eq / s.eq0 - 1) * 100 : null, naked: pos.filter((p) => p.naked).length, orders: s.orders | 0, alerts: s.alerts | 0, streak: s.streak | 0 };
  };

  return P;
})();
if (typeof module === 'object' && module.exports) module.exports = P2;
