/* ExTerm strategy pack 3 (v13): crypto, meme-coin, short-selling, multi-timeframe and stock-session strategies.
   Same rules as every other pack: a bar's signal only uses data up to and including that bar, orders fill at the
   NEXT bar's open (or at this bar's close when a signal says px), and fees + slippage are always charged.
   None of these is a promise of profit. Each is built on a well-documented market behaviour; check it on real
   data with the validation lab (and the basket test) before you trust it. */
(function (NT) {
  'use strict';
  const I = NT.ind, S = NT.strategies, fin = Number.isFinite;
  const P = (k, label, def, min, max, step) => ({ k, label, def, min, max, step });
  const buy = (reason, extra) => [Object.assign({ side: 'buy', frac: 1, reason }, extra)];
  const sell = (reason, extra) => [Object.assign({ side: 'sell', frac: 1, reason }, extra)];
  const cl = (c) => c.map((x) => x.c);
  const tfOf = (c) => { let m = Infinity; for (let i = 1; i < Math.min(c.length, 60); i++) { const d = c[i].t - c[i - 1].t; if (d > 0 && d < m) m = d; } return isFinite(m) ? m : 3600; };
  const fresh = (st, i, b, extra) => { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, { in: i, hi: b.h, lo: b.l, tl: null }, extra || {}); };
  // chandelier stop on the close: long trails below the highest high since entry, short above the lowest low
  const chand = (st, b, atr, k, short) => {
    if (!fin(atr)) return false;
    if (!short) { st.hi = Math.max(st.hi == null ? b.h : st.hi, b.h); const lv = st.hi - k * atr; st.tl = st.tl == null ? lv : Math.max(st.tl, lv); return b.c < st.tl; }
    st.lo = Math.min(st.lo == null ? b.l : st.lo, b.l); const lv = st.lo + k * atr; st.tl = st.tl == null ? lv : Math.min(st.tl, lv); return b.c > st.tl;
  };
  const rollVwap = (c, n) => { // VWAP of the last n bars (crypto trades 24/7, so a rolling window instead of a session)
    const o = new Array(c.length).fill(NaN); let pv = 0, v = 0;
    for (let i = 0; i < c.length; i++) {
      const k = c[i], tp = (k.h + k.l + k.c) / 3; pv += tp * (k.v || 0); v += k.v || 0;
      if (i >= n) { const x = c[i - n], tq = (x.h + x.l + x.c) / 3; pv -= tq * (x.v || 0); v -= x.v || 0; }
      if (i >= n - 1) o[i] = v > 0 ? pv / v : k.c;
    }
    return o;
  };
  const add = (id, o) => { S[id] = Object.assign({ pack: 3 }, o); };
  const onExit = (st) => { for (const k of Object.keys(st)) delete st[k]; };

  /* ── New York session clock (DST-aware; cached per UTC day) ── */
  const etCache = {};
  const etOffset = (t) => {
    const day = Math.floor(t / 86400); if (etCache[day] != null) return etCache[day];
    let off = -300;
    try {
      const d = new Date(t * 1000), parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
      const g = (k) => +parts.find((p) => p.type === k).value;
      off = Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - d.getTime()) / 60000);
    } catch (e) { /* keep EST */ }
    etCache[day] = off; return off;
  };
  const et = (t) => { const off = etOffset(t), s = t + off * 60; return { day: Math.floor(s / 86400), min: ((Math.floor(s / 60) % 1440) + 1440) % 1440 }; };
  NT._et = et;

  /* ═════════════ CRYPTO ═════════════ */
  add('cx_trendvt', {
    name: '★ Crypto Trend + Volatility Sizing', cat: 'Crypto', pro: true,
    desc: 'Trend following, the most-studied edge in crypto. Buys when the 21 EMA crosses above the 55 EMA with price over the 200 EMA, and sizes each trade so a 2.5×ATR stop risks only a set % of the account (bigger in calm markets, smaller in wild ones). Exits on a 3×ATR chandelier stop or when the EMAs cross back.',
    params: [P('risk', 'Risk per trade %', 1.5, 0.25, 5, 0.25), P('stop', 'Stop ATR×', 2.5, 1, 6, 0.25), P('trail', 'Trail ATR×', 3, 1.5, 8, 0.25)], opt: { stop: [2, 2.5, 3], trail: [2.5, 3, 4] },
    prepare: (c) => { const x = cl(c); return { f: I.ema(x, 21), s: I.ema(x, 55), l: I.ema(x, 200), a: I.atr(c, 14) }; },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 1 || !fin(X.l[i]) || !fin(X.a[i])) return null;
      if (ctx.pos) { if (chand(st, b, X.a[i], p.trail)) return sell('3×ATR chandelier stop hit'); if (X.f[i] < X.s[i]) return sell('21 EMA fell below the 55 EMA'); return null; }
      const cross = X.f[i] > X.s[i] && X.f[i - 1] <= X.s[i - 1];
      if (cross && b.c > X.l[i]) {
        const dist = p.stop * X.a[i], usd = Math.min(ctx.cash, (ctx.cash * (p.risk / 100)) / Math.max(1e-9, dist / b.c));
        fresh(st, i, b); return buy(`trend up (21/55 EMA cross over the 200 EMA), sized for ${p.risk}% risk`, { usd, frac: undefined, slPx: b.c - dist });
      }
      return null;
    },
  });
  add('cx_session', {
    name: '★ Asia-Range Breakout (crypto sessions)', cat: 'Crypto', pro: true,
    desc: 'Crypto volume follows the clock: the Asian session (00:00–08:00 UTC) is often quiet and builds a range that London and New York then break. Buys a close above that range between 08:00 and 20:00 UTC on above-average volume, stops at the range midpoint and closes out at the end of the UTC day. Use 5m–30m charts.',
    params: [P('vol', 'Volume × average', 1.2, 0.5, 4, 0.1), P('stopMid', 'Stop at range mid (1) or low (0)', 1, 0, 1, 1)], opt: { vol: [1, 1.2, 1.5] },
    prepare: (c) => {
      const n = c.length, hi = new Array(n).fill(NaN), lo = new Array(n).fill(NaN), va = I.sma(c.map((x) => x.v || 0), 20);
      let day = -1, h = -Infinity, l = Infinity, done = false;
      for (let i = 0; i < n; i++) {
        const d = Math.floor(c[i].t / 86400), sec = c[i].t % 86400;
        if (d !== day) { day = d; h = -Infinity; l = Infinity; done = false; }
        if (sec < 8 * 3600) { h = Math.max(h, c[i].h); l = Math.min(l, c[i].l); } else done = true;
        if (done && isFinite(h)) { hi[i] = h; lo[i] = l; }
      }
      return { hi, lo, va, tf: tfOf(c) };
    },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, sec = b.t % 86400;
      if (X.tf > 3600) return null; // intraday only
      if (ctx.pos) { if (sec + X.tf >= 86400) return sell('end of the UTC day', { px: b.c }); return null; }
      if (!fin(X.hi[i]) || sec >= 20 * 3600) return null;
      const vOK = !(X.va[i] > 0) || (b.v || 0) >= p.vol * X.va[i];
      if (b.c > X.hi[i] && c[i - 1].c <= X.hi[i] && vOK) {
        const stop = p.stopMid ? (X.hi[i] + X.lo[i]) / 2 : X.lo[i];
        return buy('broke above the Asian-session range on volume', { slPx: stop });
      }
      return null;
    },
  });
  add('cx_mtf', {
    name: '★ Multi-Timeframe Trend Pullback', cat: 'Crypto', pro: true,
    desc: 'Trades with the bigger trend only. The higher timeframe (4× this chart) must be above its 50 EMA and rising. On this chart it waits for a pullback (RSI under 45) and buys when price closes back above the 20 EMA. Stop goes under the pullback low; exits on a 3×ATR chandelier or when the higher-timeframe trend breaks. Higher-timeframe values come only from completed bars.',
    params: [P('k', 'Higher timeframe ×', 4, 2, 24, 1), P('rsi', 'Pullback RSI below', 45, 25, 60, 1), P('trail', 'Trail ATR×', 3, 1.5, 6, 0.25)], opt: { k: [3, 4, 6], rsi: [40, 45, 50] },
    prepare: (c, p) => {
      const k = [2, 3, 4, 6, 8, 12, 24].reduce((a, v) => (Math.abs(v - p.k) < Math.abs(a - p.k) ? v : a), 4), Sx = NT.Spec._series;
      const hp = Sx(c, { k: 'price', tf: k }), he = Sx(c, { k: 'ema', n: 50, tf: k });
      return { hp, he, e20: I.ema(cl(c), 20), r: I.rsi(cl(c), 14), a: I.atr(c, 14), lo10: I.donchian(c, 10).lo };
    },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 25 || !fin(X.he[i]) || !fin(X.he[i - 1]) || !fin(X.a[i])) return null;
      const up = X.hp[i] > X.he[i] && X.he[i] >= X.he[i - 1];
      if (ctx.pos) { if (chand(st, b, X.a[i], p.trail)) return sell('chandelier stop hit'); if (X.hp[i] < X.he[i]) return sell('higher-timeframe trend broke'); return null; }
      let dipped = false; for (let k = 1; k <= 6; k++) if (X.r[i - k] < p.rsi) dipped = true;
      if (up && dipped && b.c > X.e20[i] && c[i - 1].c <= X.e20[i - 1]) { fresh(st, i, b); return buy('higher timeframe up + pullback reclaimed the 20 EMA', { slPx: Math.min(X.lo10[i], b.c - X.a[i]) }); }
      return null;
    },
  });
  add('cx_pyramid', {
    name: '★ Turtle Pyramid (adds to winners)', cat: 'Crypto', pro: true,
    desc: 'The original Turtle rules. Buys a 20-bar breakout with one unit (a quarter of the starting capital) and adds another unit every time price climbs half an ATR more, up to 4 units. Every add raises the stop to 2×ATR under the latest entry. Exits on a 10-bar low. Few, large winners pay for many small losses.',
    params: [P('brk', 'Breakout bars', 20, 10, 60, 1), P('ex', 'Exit low bars', 10, 5, 30, 1), P('units', 'Max units', 4, 1, 6, 1)], opt: { brk: [20, 30, 55], ex: [10, 15, 20] },
    prepare: (c, p) => ({ d: I.donchian(c, p.brk), x: I.donchian(c, p.ex), a: I.atr(c, 20) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (!fin(X.d.hi[i]) || !fin(X.a[i])) return null;
      const unit = ctx.cash0 / Math.max(1, p.units);
      if (ctx.pos) {
        if (b.c < X.x.lo[i]) return sell(`closed below the ${p.ex}-bar low`);
        if ((st.u || 1) < p.units && b.c >= (st.last || b.c) + 0.5 * X.a[i] && ctx.cash >= unit * 0.5) { st.u = (st.u || 1) + 1; st.last = b.c; return buy(`added unit ${st.u} (+½ ATR)`, { usd: Math.min(unit, ctx.cash), frac: undefined, slPx: b.c - 2 * X.a[i] }); }
        return null;
      }
      if (b.c > X.d.hi[i]) { fresh(st, i, b, { u: 1, last: b.c }); return buy(`${p.brk}-bar breakout, unit 1`, { usd: Math.min(unit, ctx.cash), frac: undefined, slPx: b.c - 2 * X.a[i] }); }
      return null;
    },
  });
  add('cx_adaptive', {
    name: '★ Self-Weighting Ensemble', cat: 'Crypto', pro: true,
    desc: 'Four classic signals (trend, momentum, breakout, oversold bounce) each get a vote, and every vote is weighted by how often that signal has actually been right on THIS market over its last 150 signals. Weights only use trades whose outcome was already known, so there is no look-ahead. Buys when the weighted vote passes 60%, exits under 30% or on a 3×ATR chandelier.',
    params: [P('enter', 'Enter above score', 0.6, 0.3, 0.9, 0.05), P('exit', 'Exit below score', 0.3, 0, 0.6, 0.05), P('h', 'Outcome horizon (bars)', 5, 2, 20, 1)], opt: { enter: [0.55, 0.6, 0.7], h: [3, 5, 10] },
    prepare: (c, p) => {
      const x = cl(c), n = c.length, e20 = I.ema(x, 20), e50 = I.ema(x, 50), roc = I.roc(x, 20), r = I.rsi(x, 14), dc = I.donchian(c, 20), h = p.h, W = 150;
      const sig = [(i) => e20[i] > e50[i], (i) => roc[i] > 0, (i) => x[i] > dc.hi[i], (i) => r[i] < 35];
      const on = sig.map((f) => x.map((_, i) => (f(i) ? 1 : 0)));
      const win = (j) => (j + h < n && x[j + h] > x[j] ? 1 : 0); // only read when j + h <= i, i.e. already known at bar i
      const score = new Array(n).fill(NaN), hits = [0, 0, 0, 0], tot = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const j = i - h; // the newest signal whose outcome is known at bar i
        if (j >= 0) for (let k = 0; k < 4; k++) if (on[k][j]) { tot[k]++; hits[k] += win(j); }
        const jo = j - W; if (jo >= 0) for (let k = 0; k < 4; k++) if (on[k][jo]) { tot[k]--; hits[k] -= win(jo); }
        let ws = 0, s = 0;
        for (let k = 0; k < 4; k++) { const acc = tot[k] >= 10 ? hits[k] / tot[k] : 0.5, w = Math.max(0, acc - 0.5) * 2; ws += w; s += w * on[k][i]; }
        score[i] = ws > 0 ? s / ws : 0;
      }
      return { score, a: I.atr(c, 14) };
    },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 60 || !fin(X.a[i])) return null;
      if (ctx.pos) { if (chand(st, b, X.a[i], 3)) return sell('chandelier stop hit'); if (X.score[i] < p.exit) return sell(`weighted vote fell to ${(X.score[i] * 100).toFixed(0)}%`); return null; }
      if (X.score[i] >= p.enter) { fresh(st, i, b); return buy(`weighted vote ${(X.score[i] * 100).toFixed(0)}%`); }
      return null;
    },
  });

  /* ═════════════ MEME COINS (DEX tokens, 1m–15m) ═════════════ */
  add('meme_burst', {
    name: '★ Meme Momentum Burst', cat: 'Meme coins', pro: true,
    desc: 'Catches the start of a run: volume at least 3× its recent average, a close above the rolling VWAP, a strong close near the top of the candle and RSI between 55 and 85 (strong, not yet exhausted). Stop 2×ATR under entry, trails 2.5×ATR, and bails after 30 bars if nothing happens. Meme coins can drop 50%+ in minutes: keep size small.',
    params: [P('vol', 'Volume × average', 3, 1.5, 10, 0.5), P('trail', 'Trail ATR×', 2.5, 1, 6, 0.25), P('time', 'Time stop (bars)', 30, 5, 200, 5)], opt: { vol: [2.5, 3, 4], trail: [2, 2.5, 3.5] },
    prepare: (c) => ({ vw: rollVwap(c, 60), va: I.sma(c.map((x) => x.v || 0), 20), r: I.rsi(cl(c), 14), a: I.atr(c, 14) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 61 || !fin(X.a[i]) || !fin(X.vw[i])) return null;
      if (ctx.pos) { if (chand(st, b, X.a[i], p.trail)) return sell('trailing stop hit'); if (i - st.in >= p.time && b.c < st.entry * 1.03) return sell(`no follow-through after ${p.time} bars`); return null; }
      const rng = b.h - b.l, strong = rng > 0 && (b.c - b.l) / rng >= 0.75;
      if (X.va[i - 1] > 0 && (b.v || 0) >= p.vol * X.va[i - 1] && b.c > X.vw[i] && strong && X.r[i] > 55 && X.r[i] < 85) { fresh(st, i, b, { entry: b.c }); return buy(`volume burst ${((b.v || 0) / X.va[i - 1]).toFixed(1)}× with a strong close over VWAP`, { slPx: b.c - 2 * X.a[i] }); }
      return null;
    },
  });
  add('meme_firstdip', {
    name: '★ Meme First-Dip Buy', cat: 'Meme coins', pro: true,
    desc: 'After a big pump (+40% or more off the recent low), the first healthy pullback is often bought. Waits for price to retrace 38–62% of the move with RSI cooling off, then buys the first green candle back above the 9 EMA. Stop under the 79% retrace, target the prior high, time stop 40 bars.',
    params: [P('pump', 'Pump size %', 40, 15, 300, 5), P('look', 'Look-back bars', 60, 20, 300, 5), P('time', 'Time stop (bars)', 40, 5, 200, 5)], opt: { pump: [30, 40, 60], look: [40, 60, 90] },
    prepare: (c, p) => ({ e9: I.ema(cl(c), 9), r: I.rsi(cl(c), 7), lo: I.donchian(c, p.look).lo }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < p.look + 2 || !fin(X.lo[i])) return null;
      if (ctx.pos) { if (i - st.in >= p.time) return sell(`time stop (${p.time} bars)`); return null; }
      let H = -Infinity, hi = -1; for (let k = i - p.look; k < i; k++) if (c[k].h > H) { H = c[k].h; hi = k; }
      let L = Infinity; for (let k = i - p.look; k <= hi; k++) if (c[k].l < L) L = c[k].l;
      if (!(H / L - 1 >= p.pump / 100) || i - hi < 3) return null;
      const move = H - L, retr = (H - b.l) / move, green = b.c > b.o;
      let cooled = false; for (let k = 1; k <= 5; k++) if (X.r[i - k] < 40) cooled = true;
      if (retr >= 0.382 && retr <= 0.618 && cooled && green && b.c > X.e9[i] && c[i - 1].c <= X.e9[i - 1]) {
        fresh(st, i, b); return buy(`first dip after a +${((H / L - 1) * 100).toFixed(0)}% pump (${(retr * 100).toFixed(0)}% retrace)`, { slPx: H - 0.786 * move, tpPx: H });
      }
      return null;
    },
  });
  add('meme_vwap', {
    name: '★ Meme VWAP Reclaim', cat: 'Meme coins', pro: true,
    desc: 'Buyers taking back control: price spent at least 5 bars under the rolling VWAP, then closes back above it on 1.5× volume. Stop under the last 5 bars’ low, target 2× the risk, and once +1R is reached the stop trails at 2.5×ATR.',
    params: [P('below', 'Bars under VWAP', 5, 2, 30, 1), P('vol', 'Volume × average', 1.5, 0.5, 6, 0.1), P('rr', 'Target R', 2, 1, 6, 0.25)], opt: { below: [3, 5, 8], rr: [1.5, 2, 3] },
    prepare: (c) => ({ vw: rollVwap(c, 60), va: I.sma(c.map((x) => x.v || 0), 20), a: I.atr(c, 14) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 62 || !fin(X.vw[i])) return null;
      if (ctx.pos) { if (b.c >= st.entry + (st.entry - st.sl)) { if (chand(st, b, X.a[i], 2.5)) return sell('trailing stop after +1R'); } return null; }
      let under = true; for (let k = 1; k <= p.below; k++) if (!(c[i - k].c < X.vw[i - k])) under = false;
      if (under && b.c > X.vw[i] && (!(X.va[i - 1] > 0) || (b.v || 0) >= p.vol * X.va[i - 1])) {
        let lo = Infinity; for (let k = 0; k <= 5; k++) lo = Math.min(lo, c[i - k].l);
        if (!(lo < b.c)) return null;
        fresh(st, i, b, { entry: b.c, sl: lo }); return buy('reclaimed VWAP on volume', { slPx: lo, tpPx: b.c + p.rr * (b.c - lo) });
      }
      return null;
    },
  });
  add('meme_ladder', {
    name: '★ Meme Breakout + Profit Ladder', cat: 'Meme coins', pro: true,
    desc: 'Buys a 20-bar breakout on 2× volume, then takes profit in steps the way experienced meme traders do: sells a third at +30%, another third at +60%, and lets the last third ride with a 25% trailing stop. A 15% stop protects the whole position until the first take-profit.',
    params: [P('tp1', 'First take-profit %', 30, 5, 200, 5), P('tp2', 'Second take-profit %', 60, 10, 500, 5), P('trail', 'Runner trail %', 25, 5, 60, 1), P('sl', 'Initial stop %', 15, 3, 50, 1)], opt: { tp1: [20, 30, 50], trail: [15, 25, 35] },
    prepare: (c) => ({ d: I.donchian(c, 20), va: I.sma(c.map((x) => x.v || 0), 20) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (!fin(X.d.hi[i])) return null;
      if (ctx.pos) {
        const g = b.c / st.entry - 1;
        if (!st.s1 && g >= p.tp1 / 100) { st.s1 = 1; return sell(`took ⅓ profit at +${p.tp1}%`, { frac: 1 / 3 }); }
        if (st.s1 && !st.s2 && g >= p.tp2 / 100) { st.s2 = 1; return sell(`took another ⅓ at +${p.tp2}%`, { frac: 0.5 }); }
        if (st.s1) { st.peak = Math.max(st.peak || b.h, b.h); if (b.c < st.peak * (1 - p.trail / 100)) return sell(`runner hit its ${p.trail}% trailing stop`); }
        else if (b.c < st.entry * (1 - p.sl / 100)) return sell(`initial ${p.sl}% stop`);
        return null;
      }
      if (b.c > X.d.hi[i] && (!(X.va[i - 1] > 0) || (b.v || 0) >= 2 * X.va[i - 1])) { fresh(st, i, b, { entry: b.c }); return buy('20-bar breakout on 2× volume'); }
      return null;
    },
  });
  add('meme_rugguard', {
    name: '★ Meme Trend with Rug Guard', cat: 'Meme coins', pro: true,
    desc: 'Rides a meme trend (9 EMA above 21 EMA, price over the 50 EMA) but is built to get out fast: it exits on any single candle that drops more than 12%, when volume dries up to a fifth of normal (the crowd has left), or on a 20% trailing stop.',
    params: [P('drop', 'Exit on a candle drop of %', 12, 3, 40, 1), P('trail', 'Trailing stop %', 20, 5, 50, 1)], opt: { drop: [8, 12, 18], trail: [12, 20, 30] },
    prepare: (c) => { const x = cl(c), v = c.map((k) => k.v || 0); return { f: I.ema(x, 9), s: I.ema(x, 21), l: I.ema(x, 50), v5: I.sma(v, 5), v50: I.sma(v, 50) }; },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 51 || !fin(X.l[i])) return null;
      if (ctx.pos) {
        st.peak = Math.max(st.peak || b.h, b.h);
        if (b.c < b.o * (1 - p.drop / 100) || b.c < c[i - 1].c * (1 - p.drop / 100)) return sell(`rug guard: one candle fell ${p.drop}%+`);
        if (X.v50[i] > 0 && X.v5[i] < 0.2 * X.v50[i]) return sell('rug guard: volume dried up');
        if (b.c < st.peak * (1 - p.trail / 100)) return sell(`${p.trail}% trailing stop`);
        if (X.f[i] < X.s[i]) return sell('trend ended (9 EMA under 21 EMA)');
        return null;
      }
      if (X.f[i] > X.s[i] && X.f[i - 1] <= X.s[i - 1] && b.c > X.l[i]) { fresh(st, i, b); return buy('meme trend started (9/21 EMA cross over the 50 EMA)'); }
      return null;
    },
  });

  /* ═════════════ SHORT SELLING (paper; profit when price falls) ═════════════ */
  add('sh_breakdown', {
    name: '★ Trend Breakdown Short', cat: 'Short selling', pro: true, short: true,
    desc: 'The mirror of a breakout: shorts a close below the 55-bar low while price is under a falling 200 SMA. Stop 2.5×ATR above entry, covers on a close above the 20-bar high or a 3×ATR chandelier stop. Profits when price falls.',
    params: [P('brk', 'Breakdown bars', 55, 10, 120, 1), P('cover', 'Cover high bars', 20, 5, 60, 1), P('trail', 'Trail ATR×', 3, 1.5, 6, 0.25)], opt: { brk: [20, 55], cover: [10, 20] },
    prepare: (c, p) => ({ d: I.donchian(c, p.brk), x: I.donchian(c, p.cover), s: I.sma(cl(c), 200), a: I.atr(c, 14) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (i < 11 || !fin(X.s[i - 10]) || !fin(X.d.lo[i]) || !fin(X.a[i])) return null;
      if (ctx.pos) { if (b.c > X.x.hi[i]) return sell(`covered: closed above the ${p.cover}-bar high`); if (chand(st, b, X.a[i], p.trail, true)) return sell('covered: chandelier stop'); return null; }
      if (b.c < X.d.lo[i] && b.c < X.s[i] && X.s[i] < X.s[i - 10]) { fresh(st, i, b); return buy(`short: ${p.brk}-bar breakdown under a falling 200 SMA`, { slPx: b.c + 2.5 * X.a[i] }); }
      return null;
    },
  });
  add('sh_fade', {
    name: '★ Overbought Fade Short (downtrend)', cat: 'Short selling', pro: true, short: true,
    desc: 'Connors’ RSI-2 rule turned around: in a downtrend (price under the 200 SMA), shorts when 2-period RSI goes above 95, a sharp bounce into resistance. Covers when price closes back under the 5 SMA, with a 2.5×ATR stop and a 10-bar time limit.',
    params: [P('rsi', 'Short above RSI-2', 95, 80, 99, 1), P('time', 'Time stop (bars)', 10, 3, 40, 1)], opt: { rsi: [90, 95, 98] },
    prepare: (c) => { const x = cl(c); return { r: I.rsi(x, 2), s: I.sma(x, 200), m: I.sma(x, 5), a: I.atr(c, 14) }; },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (!fin(X.s[i]) || !fin(X.a[i])) return null;
      if (ctx.pos) { if (b.c < X.m[i]) return sell('covered: back under the 5 SMA'); if (i - st.in >= p.time) return sell(`covered: ${p.time}-bar time stop`); return null; }
      if (b.c < X.s[i] && X.r[i] > p.rsi) { fresh(st, i, b); return buy(`short: RSI-2 at ${X.r[i].toFixed(0)} in a downtrend`, { slPx: b.c + 2.5 * X.a[i] }); }
      return null;
    },
  });
  add('sh_failbreak', {
    name: '★ Failed Breakout Short (liquidity grab)', cat: 'Short selling', pro: true, short: true,
    desc: 'A classic stop-hunt: price spikes above the prior 20-bar high (triggering breakout buyers and short stops) but closes back below it with a long upper wick. Shorts that failure with a stop just above the wick and a target of 2× the risk. 20-bar time limit.',
    params: [P('wick', 'Upper wick ≥ % of candle', 55, 30, 90, 5), P('rr', 'Target R', 2, 1, 5, 0.25)], opt: { wick: [45, 55, 65], rr: [1.5, 2, 3] },
    prepare: (c) => ({ d: I.donchian(c, 20), a: I.atr(c, 14) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (!fin(X.d.hi[i]) || !fin(X.a[i])) return null;
      if (ctx.pos) { if (i - st.in >= 20) return sell('covered: 20-bar time stop'); return null; }
      const rng = b.h - b.l;
      if (rng > 0 && b.h > X.d.hi[i] && b.c < X.d.hi[i] && (b.h - Math.max(b.o, b.c)) / rng >= p.wick / 100) {
        const sl = b.h + 0.25 * X.a[i]; if (!(sl > b.c)) return null;
        fresh(st, i, b); return buy('short: failed breakout above the 20-bar high', { slPx: sl, tpPx: b.c - p.rr * (sl - b.c) });
      }
      return null;
    },
  });

  /* ═════════════ STOCKS (session-based) ═════════════ */
  add('st_orb', {
    name: '★ Opening Range Breakout (stocks)', cat: 'Stocks', pro: true,
    desc: 'Studied for decades on US stocks and index ETFs: the first 30 minutes after the 9:30 ET open set a range; a close above it, above the session VWAP, often keeps going. Stops at the range midpoint and always closes before the 4:00 PM bell (no overnight risk). Use 1m–5m charts on liquid stocks like SPY, QQQ, NVDA.',
    params: [P('or', 'Opening range minutes', 30, 5, 90, 5), P('rr', 'Target R (0 = hold to close)', 0, 0, 6, 0.5)], opt: { or: [15, 30, 60] },
    prepare: (c, p) => {
      const n = c.length, oh = new Array(n).fill(NaN), ol = new Array(n).fill(NaN), vw = new Array(n).fill(NaN), mins = new Array(n);
      let day = -1, h = -Infinity, l = Infinity, pv = 0, v = 0;
      for (let i = 0; i < n; i++) {
        const e = et(c[i].t); mins[i] = e.min;
        if (e.day !== day) { day = e.day; h = -Infinity; l = Infinity; pv = 0; v = 0; }
        if (e.min < 570 || e.min >= 960) continue; // regular session only
        const k = c[i], tp = (k.h + k.l + k.c) / 3; pv += tp * (k.v || 0); v += k.v || 0; vw[i] = v > 0 ? pv / v : k.c;
        if (e.min < 570 + p.or) { h = Math.max(h, k.h); l = Math.min(l, k.l); } else if (isFinite(h)) { oh[i] = h; ol[i] = l; }
      }
      return { oh, ol, vw, mins, tf: tfOf(c) };
    },
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, m = X.mins[i]; if (X.tf > 900) return null;
      if (ctx.pos) { if (m + X.tf / 60 >= 955 || m < 570) return sell('closed before the bell', { px: b.c }); return null; }
      if (!fin(X.oh[i]) || m >= 900) return null;
      if (b.c > X.oh[i] && c[i - 1].c <= X.oh[i] && b.c > X.vw[i]) {
        const sl = (X.oh[i] + X.ol[i]) / 2; return buy(`broke the ${p.or}-minute opening range above VWAP`, { slPx: sl, tpPx: p.rr > 0 ? b.c + p.rr * (b.c - sl) : undefined });
      }
      return null;
    },
  });
  add('st_tom', {
    name: '★ Turn-of-the-Month (stocks, daily)', cat: 'Stocks', pro: true,
    desc: 'One of the best-documented calendar effects in stock indexes: returns cluster around month-end, when pension and payroll money flows in. Buys at the close of the last trading day of the month and sells at the close of the 3rd trading day of the next. In the market only ~20% of the time. Daily candles; works best on SPY / QQQ.',
    params: [P('days', 'Hold into new month (trading days)', 3, 1, 6, 1)], opt: { days: [2, 3, 4] },
    prepare: (c) => ({ tf: tfOf(c) }),
    onExit,
    onBar: (i, X, c, ctx) => {
      const b = c[i], p = ctx.params, st = ctx.state; if (X.tf < 86400) return null;
      const d = new Date(b.t * 1000), y = d.getUTCFullYear(), mo = d.getUTCMonth(), dom = d.getUTCDate(), last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      if (ctx.pos) {
        if (mo !== st.mo) { st.n = (st.n || 0) + (st.seen === b.t ? 0 : 1); st.seen = b.t; if (st.n >= p.days) return sell(`trading day ${p.days} of the new month`, { px: b.c }); }
        return null;
      }
      let more = 0; for (let k = dom + 1; k <= last; k++) { const wd = new Date(Date.UTC(y, mo, k)).getUTCDay(); if (wd !== 0 && wd !== 6) more++; }
      if (more === 0) { fresh(st, i, b, { mo, n: 0 }); return buy('last trading day of the month', { px: b.c }); }
      return null;
    },
  });

  if (Array.isArray(NT.STRAT_CATS)) for (const c of ['Crypto', 'Meme coins', 'Short selling', 'Stocks']) if (!NT.STRAT_CATS.includes(c)) NT.STRAT_CATS.splice(1, 0, c);
  NT.PACK3 = Object.keys(S).filter((k) => S[k].pack === 3);
  return NT;
})(typeof module === 'object' && module.exports ? require('./stratspec.js') : self.NT);
if (typeof module === 'object' && module.exports) module.exports = require('./core.js');
