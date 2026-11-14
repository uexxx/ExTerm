/* ExTerm strategy pack 2 — extra indicators + 37 more strategies (smart-money concepts, trend, momentum,
   mean reversion, breakout, price action, volume). All long-only, no look-ahead: a bar's signal only uses data up to that bar. */
(function (NT) {
  'use strict';
  const I = NT.ind, S = NT.strategies;
  const nan = (n) => new Array(n).fill(NaN);
  const fin = Number.isFinite;

  /* ───────────── indicators ───────────── */
  I.smaN = (a, p) => { // NaN-aware SMA (window must be fully finite)
    const o = nan(a.length); let s = 0, cnt = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (fin(v)) { s += v; cnt++; } else { s = 0; cnt = 0; continue; }
      if (cnt > p) { s -= a[i - p]; cnt = p; }
      if (cnt === p) o[i] = s / p;
    }
    return o;
  };
  I.rollMax = (a, p) => { const o = nan(a.length); for (let i = p - 1; i < a.length; i++) { let m = -Infinity; for (let k = i - p + 1; k <= i; k++) if (a[k] > m) m = a[k]; o[i] = m; } return o; };
  I.rollMin = (a, p) => { const o = nan(a.length); for (let i = p - 1; i < a.length; i++) { let m = Infinity; for (let k = i - p + 1; k <= i; k++) if (a[k] < m) m = a[k]; o[i] = m; } return o; };
  I.std = (a, p) => { const m = I.smaN(a, p), o = nan(a.length); for (let i = 0; i < a.length; i++) { if (!fin(m[i])) continue; let v = 0; for (let k = i - p + 1; k <= i; k++) v += (a[k] - m[i]) ** 2; o[i] = Math.sqrt(v / p); } return o; };
  I.wma = (a, p) => {
    const o = nan(a.length), den = (p * (p + 1)) / 2;
    for (let i = p - 1; i < a.length; i++) { let s = 0, ok = true; for (let k = 0; k < p; k++) { const v = a[i - k]; if (!fin(v)) { ok = false; break; } s += v * (p - k); } if (ok) o[i] = s / den; }
    return o;
  };
  I.hma = (a, p) => { const h = I.wma(a, Math.max(1, Math.round(p / 2))), f = I.wma(a, p); return I.wma(a.map((_, i) => 2 * h[i] - f[i]), Math.max(1, Math.round(Math.sqrt(p)))); };
  I.stoch = (c, k = 14, d = 3, sm = 3) => {
    const hh = I.rollMax(c.map((x) => x.h), k), ll = I.rollMin(c.map((x) => x.l), k);
    const raw = c.map((x, i) => (fin(hh[i]) ? (hh[i] - ll[i] ? ((x.c - ll[i]) / (hh[i] - ll[i])) * 100 : 50) : NaN));
    const K = I.smaN(raw, sm); return { k: K, d: I.smaN(K, d) };
  };
  I.stochRsi = (cl, p = 14, k = 3, d = 3) => {
    const r = I.rsi(cl, p), hi = I.rollMax(r.map((v) => (fin(v) ? v : -Infinity)), p), lo = I.rollMin(r.map((v) => (fin(v) ? v : Infinity)), p);
    const raw = r.map((v, i) => (fin(v) && fin(hi[i]) && fin(lo[i]) ? (hi[i] - lo[i] ? ((v - lo[i]) / (hi[i] - lo[i])) * 100 : 50) : NaN));
    const K = I.smaN(raw, k); return { k: K, d: I.smaN(K, d) };
  };
  I.cci = (c, p = 20) => {
    const tp = c.map((x) => (x.h + x.l + x.c) / 3), m = I.smaN(tp, p), o = nan(c.length);
    for (let i = p - 1; i < c.length; i++) { let md = 0; for (let k = i - p + 1; k <= i; k++) md += Math.abs(tp[k] - m[i]); md /= p; o[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0; }
    return o;
  };
  I.willr = (c, p = 14) => { const hh = I.rollMax(c.map((x) => x.h), p), ll = I.rollMin(c.map((x) => x.l), p); return c.map((x, i) => (fin(hh[i]) ? (hh[i] - ll[i] ? ((hh[i] - x.c) / (hh[i] - ll[i])) * -100 : -50) : NaN)); };
  I.mfi = (c, p = 14) => {
    const tp = c.map((x) => (x.h + x.l + x.c) / 3), o = nan(c.length);
    for (let i = p; i < c.length; i++) { let pos = 0, neg = 0; for (let k = i - p + 1; k <= i; k++) { const f = tp[k] * c[k].v; if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f; } o[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg); }
    return o;
  };
  I.obv = (c) => { let v = 0; return c.map((x, i) => { if (i > 0) v += x.c > c[i - 1].c ? x.v : x.c < c[i - 1].c ? -x.v : 0; return v; }); };
  I.roc = (a, p) => a.map((v, i) => (i >= p && a[i - p] ? (v / a[i - p] - 1) * 100 : NaN));
  I.zscore = (a, p) => { const m = I.smaN(a, p), s = I.std(a, p); return a.map((v, i) => (fin(s[i]) && s[i] > 0 ? (v - m[i]) / s[i] : NaN)); };
  I.adx = (c, p = 14) => {
    const n = c.length, pdi = nan(n), mdi = nan(n), adx = nan(n);
    let trS = 0, pS = 0, mS = 0, prev = NaN; const dxs = [];
    for (let i = 1; i < n; i++) {
      const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
      const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
      const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
      if (i <= p) { trS += tr; pS += pdm; mS += mdm; if (i < p) continue; } else { trS = trS - trS / p + tr; pS = pS - pS / p + pdm; mS = mS - mS / p + mdm; }
      pdi[i] = trS ? (100 * pS) / trS : 0; mdi[i] = trS ? (100 * mS) / trS : 0;
      const sum = pdi[i] + mdi[i], dx = sum ? (100 * Math.abs(pdi[i] - mdi[i])) / sum : 0;
      if (!fin(prev)) { dxs.push(dx); if (dxs.length === p) { prev = dxs.reduce((s, v) => s + v, 0) / p; adx[i] = prev; } }
      else { prev = (prev * (p - 1) + dx) / p; adx[i] = prev; }
    }
    return { adx, pdi, mdi };
  };
  I.psar = (c, step = 0.02, mx = 0.2) => {
    const n = c.length, sar = nan(n), up = new Array(n).fill(null);
    if (n < 3) return { sar, up };
    let isUp = c[1].c >= c[0].c, af = step, ep = isUp ? Math.max(c[0].h, c[1].h) : Math.min(c[0].l, c[1].l), s = isUp ? Math.min(c[0].l, c[1].l) : Math.max(c[0].h, c[1].h);
    sar[1] = s; up[1] = isUp;
    for (let i = 2; i < n; i++) {
      s = s + af * (ep - s);
      if (isUp) {
        s = Math.min(s, c[i - 1].l, c[i - 2].l);
        if (c[i].l < s) { isUp = false; s = ep; ep = c[i].l; af = step; } else if (c[i].h > ep) { ep = c[i].h; af = Math.min(mx, af + step); }
      } else {
        s = Math.max(s, c[i - 1].h, c[i - 2].h);
        if (c[i].h > s) { isUp = true; s = ep; ep = c[i].h; af = step; } else if (c[i].l < ep) { ep = c[i].l; af = Math.min(mx, af + step); }
      }
      sar[i] = s; up[i] = isUp;
    }
    return { sar, up };
  };
  I.supertrend = (c, p = 10, m = 3) => {
    const n = c.length, atr = I.atr(c, p), line = nan(n), up = new Array(n).fill(null);
    let fu = NaN, fl = NaN, dir = 1;
    for (let i = 1; i < n; i++) {
      if (!fin(atr[i])) continue;
      const mid = (c[i].h + c[i].l) / 2, bu = mid + m * atr[i], bl = mid - m * atr[i], pc = c[i - 1].c;
      const nfu = !fin(fu) || bu < fu || pc > fu ? bu : fu, nfl = !fin(fl) || bl > fl || pc < fl ? bl : fl;
      if (dir === 1 && c[i].c < nfl) dir = -1; else if (dir === -1 && c[i].c > nfu) dir = 1;
      fu = nfu; fl = nfl; line[i] = dir === 1 ? fl : fu; up[i] = dir === 1;
    }
    return { line, up };
  };
  I.ichimoku = (c, t = 9, k = 26, b = 52) => {
    const H = c.map((x) => x.h), L = c.map((x) => x.l), mid = (p) => { const hh = I.rollMax(H, p), ll = I.rollMin(L, p); return hh.map((v, i) => (v + ll[i]) / 2); };
    const ten = mid(t), kij = mid(k), sb = mid(b), n = c.length, spanA = nan(n), spanB = nan(n);
    for (let i = k; i < n; i++) { spanA[i] = (ten[i - k] + kij[i - k]) / 2; spanB[i] = sb[i - k]; }
    return { ten, kij, spanA, spanB };
  };
  I.keltner = (c, p = 20, m = 2, ap = 10) => { const mid = I.ema(c.map((x) => x.c), p), atr = I.atr(c, ap); return { mid, up: mid.map((v, i) => v + m * atr[i]), lo: mid.map((v, i) => v - m * atr[i]) }; };
  I.aroon = (c, p = 25) => {
    const n = c.length, up = nan(n), dn = nan(n);
    for (let i = p; i < n; i++) { let hi = -Infinity, hiI = i, lo = Infinity, loI = i; for (let k = i - p; k <= i; k++) { if (c[k].h >= hi) { hi = c[k].h; hiI = k; } if (c[k].l <= lo) { lo = c[k].l; loI = k; } } up[i] = (100 * (p - (i - hiI))) / p; dn[i] = (100 * (p - (i - loI))) / p; }
    return { up, dn };
  };
  I.heikin = (c) => { const o = []; for (let i = 0; i < c.length; i++) { const x = c[i], hc = (x.o + x.h + x.l + x.c) / 4, ho = i ? (o[i - 1].o + o[i - 1].c) / 2 : (x.o + x.c) / 2; o.push({ o: ho, c: hc, h: Math.max(x.h, ho, hc), l: Math.min(x.l, ho, hc) }); } return o; };
  I.rvwap = (c, p = 48) => {
    const n = c.length, vw = nan(n), sd = nan(n), tp = c.map((x) => (x.h + x.l + x.c) / 3);
    for (let i = p - 1; i < n; i++) { let pv = 0, v = 0; for (let k = i - p + 1; k <= i; k++) { pv += tp[k] * c[k].v; v += c[k].v; } if (!v) continue; const m = pv / v; let q = 0; for (let k = i - p + 1; k <= i; k++) q += c[k].v * (tp[k] - m) ** 2; vw[i] = m; sd[i] = Math.sqrt(q / v); }
    return { vw, sd };
  };
  // swing pivots, confirmed L bars after the pivot (no look-ahead)
  I.swings = (c, L = 5) => {
    const n = c.length, o = { shVal: nan(n), shIdx: nan(n), shPrev: nan(n), shPrevIdx: nan(n), slVal: nan(n), slIdx: nan(n), slPrev: nan(n), slPrevIdx: nan(n) };
    let sh = null, shp = null, sl = null, slp = null;
    for (let i = 0; i < n; i++) {
      const j = i - L;
      if (j >= L) {
        let isH = true, isL = true;
        for (let k = j - L; k <= j + L; k++) {
          if (k === j) continue;
          if (c[k].h > c[j].h || (k < j && c[k].h === c[j].h)) isH = false;
          if (c[k].l < c[j].l || (k < j && c[k].l === c[j].l)) isL = false;
          if (!isH && !isL) break;
        }
        if (isH) { shp = sh; sh = { i: j, v: c[j].h }; }
        if (isL) { slp = sl; sl = { i: j, v: c[j].l }; }
      }
      if (sh) { o.shVal[i] = sh.v; o.shIdx[i] = sh.i; } if (shp) { o.shPrev[i] = shp.v; o.shPrevIdx[i] = shp.i; }
      if (sl) { o.slVal[i] = sl.v; o.slIdx[i] = sl.i; } if (slp) { o.slPrev[i] = slp.v; o.slPrevIdx[i] = slp.i; }
    }
    return o;
  };
  // classic floor pivots from the previous UTC day
  I.dailyPivots = (c) => {
    const n = c.length, P = nan(n), S1 = nan(n), S2 = nan(n), R1 = nan(n);
    let day = null, cur = null, prev = null;
    for (let i = 0; i < n; i++) {
      const d = Math.floor(c[i].t / 86400);
      if (d !== day) { prev = cur; day = d; cur = { h: c[i].h, l: c[i].l, c: c[i].c }; } else { cur.h = Math.max(cur.h, c[i].h); cur.l = Math.min(cur.l, c[i].l); cur.c = c[i].c; }
      if (prev) { const p = (prev.h + prev.l + prev.c) / 3; P[i] = p; S1[i] = 2 * p - prev.h; R1[i] = 2 * p - prev.l; S2[i] = p - (prev.h - prev.l); }
    }
    return { P, S1, S2, R1 };
  };

  /* ───────────── helpers ───────────── */
  const P = (k, label, def, min, max, step) => ({ k, label, def, min, max, step });
  const fp = (v) => (NT.fmtPrice ? NT.fmtPrice(v) : String(v));
  const buy = (reason, extra) => [Object.assign({ side: 'buy', frac: 1, reason }, extra)];
  const sell = (reason, extra) => [Object.assign({ side: 'sell', frac: 1, reason }, extra)];
  const crossUp = (a, b, i) => i > 0 && fin(a[i]) && fin(a[i - 1]) && fin(b[i]) && fin(b[i - 1]) && a[i - 1] <= b[i - 1] && a[i] > b[i];
  const crossDn = (a, b, i) => crossUp(b, a, i);
  const lvl = (v) => ({ length: Infinity, map: null, v }); // eslint-disable-line no-unused-vars
  const crossUpL = (a, x, i) => i > 0 && fin(a[i]) && fin(a[i - 1]) && a[i - 1] <= x && a[i] > x;
  const crossDnL = (a, x, i) => i > 0 && fin(a[i]) && fin(a[i - 1]) && a[i - 1] >= x && a[i] < x;
  // structural stop / target management for strategies that set st.sl / st.tp on entry
  function manage(i, c, ctx) {
    const st = ctx.state, b = c[i];
    if (!ctx.pos) { st.sl = st.tp = null; return null; }
    if (st.sl && b.l <= st.sl) { const px = b.o < st.sl ? b.o : st.sl; st.sl = st.tp = null; return sell('structure stop hit', { px }); }
    if (st.tp && b.h >= st.tp) { const px = b.o > st.tp ? b.o : st.tp; st.sl = st.tp = null; return sell('target hit', { px }); }
    return null;
  }
  function enter(st, reason, entry, sl, rr, tp) {
    if (!(sl > 0) || sl >= entry) return null;
    st.sl = sl; st.tp = tp != null ? tp : rr > 0 ? entry + rr * (entry - sl) : null;
    return buy(reason + ` · stop ${fp(sl)}${st.tp ? ' · target ' + fp(st.tp) : ''}`);
  }
  const cls = (o) => o; // no-op tag for readability
  const add = (id, o) => { S[id] = o; };

  /* categories for existing strategies */
  const cat = { smacross: 'Trend', rsi: 'Mean Reversion', bollinger: 'Mean Reversion', macd: 'Momentum', donchian: 'Breakout', grid: 'Bots', dca: 'Bots', whaleflow: 'On-chain' };
  for (const k in cat) if (S[k]) S[k].cat = cat[k];

  /* ═════════════ SMART MONEY CONCEPTS ═════════════ */
  add('orderblock', cls({
    name: 'Order Block', cat: 'Smart Money (SMC)',
    desc: 'When price breaks a confirmed swing high (bullish break of structure), the last down-candle before the move is marked as a bullish order block. Buys the first retest of that zone that closes back up. Stop goes below the block, with an R-multiple target.',
    params: [P('L', 'Swing length', 4, 2, 15, 1), P('rr', 'Reward : risk', 2, 0.5, 8, 0.25), P('age', 'Block valid (bars)', 60, 10, 400, 5), P('buf', 'Stop buffer %', 0.15, 0, 3, 0.05)],
    opt: { L: [3, 4, 6], rr: [1.5, 2, 3], age: [40, 80] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const p = ctx.params, st = ctx.state, sw = X.sw, b = c[i];
      st.obs = st.obs || [];
      if (fin(sw.shVal[i]) && b.c > sw.shVal[i] && st.bos !== sw.shIdx[i]) {
        st.bos = sw.shIdx[i];
        for (let j = i - 1; j >= Math.max(0, sw.shIdx[i] - 10); j--) if (c[j].c < c[j].o) { st.obs.push({ top: c[j].h, bot: c[j].l, born: i }); break; }
      }
      st.obs = st.obs.filter((o) => !o.used && i - o.born <= p.age && b.c >= o.bot).slice(-8);
      if (ctx.pos) return null;
      for (const o of st.obs) if (i > o.born + 1 && b.l <= o.top && b.c > o.bot && b.c > b.o) { o.used = true; return enter(st, `retest of bullish order block ${fp(o.bot)}–${fp(o.top)}`, b.c, o.bot * (1 - p.buf / 100), p.rr); }
      return null;
    },
  }));
  add('liqsweep', {
    name: 'Liquidity Sweep', cat: 'Smart Money (SMC)',
    desc: 'Buys a stop-hunt: a wick takes out the last confirmed swing low (grabbing the sell-side liquidity resting there), then the bar closes back above it. Stop goes under the sweep wick, with an R-multiple target.',
    params: [P('L', 'Swing length', 5, 2, 15, 1), P('rr', 'Reward : risk', 2, 0.5, 8, 0.25), P('buf', 'Stop buffer %', 0.1, 0, 3, 0.05)],
    opt: { L: [3, 5, 8], rr: [1.5, 2, 3] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const p = ctx.params, st = ctx.state, sw = X.sw, b = c[i];
      if (ctx.pos || !fin(sw.slVal[i]) || st.swept === sw.slIdx[i]) return null;
      if (b.l < sw.slVal[i] && b.c > sw.slVal[i]) { st.swept = sw.slIdx[i]; return enter(st, `swept swing low ${fp(sw.slVal[i])} and reclaimed it`, b.c, b.l * (1 - p.buf / 100), p.rr); }
      return null;
    },
  });
  add('fvg', {
    name: 'Fair Value Gap Retest', cat: 'Smart Money (SMC)',
    desc: 'Detects bullish fair value gaps (3-candle imbalance, where a bar’s low sits above the high two bars back) after a strong displacement. Buys when price trades back into the gap and holds it. Stop goes below the displacement candle.',
    params: [P('gap', 'Min gap %', 0.15, 0.01, 5, 0.01), P('rr', 'Reward : risk', 2, 0.5, 8, 0.25), P('age', 'Gap valid (bars)', 30, 5, 300, 5)],
    opt: { gap: [0.05, 0.15, 0.4], rr: [1.5, 2, 3] },
    prepare: () => ({}),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const p = ctx.params, st = ctx.state, b = c[i];
      st.gaps = st.gaps || [];
      if (i >= 2 && b.l > c[i - 2].h && ((b.l - c[i - 2].h) / b.c) * 100 >= p.gap) st.gaps.push({ top: b.l, bot: c[i - 2].h, sl: Math.min(c[i - 1].l, c[i - 2].l), born: i });
      st.gaps = st.gaps.filter((g) => !g.used && i - g.born <= p.age && b.c >= g.sl).slice(-8);
      if (ctx.pos) return null;
      for (const g of st.gaps) if (i > g.born && b.l <= g.top && b.c >= g.bot) { g.used = true; return enter(st, `filled bullish FVG ${fp(g.bot)}–${fp(g.top)}`, b.c, g.sl * 0.999, p.rr); }
      return null;
    },
  });
  add('bos', {
    name: 'Break of Structure', cat: 'Smart Money (SMC)',
    desc: 'Trend continuation. With a higher swing low in place, buys a close above the last confirmed swing high. Trails the stop on swing structure and exits when price closes below the latest swing low.',
    params: [P('L', 'Swing length', 5, 2, 15, 1)],
    opt: { L: [3, 4, 5, 7, 10] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L) }),
    onBar: (i, X, c, ctx) => {
      const sw = X.sw, b = c[i], st = ctx.state;
      if (ctx.pos) { if (fin(sw.slVal[i]) && b.c < sw.slVal[i]) return sell(`closed below swing low ${fp(sw.slVal[i])}`); return null; }
      if (fin(sw.shVal[i]) && fin(sw.slPrev[i]) && b.c > sw.shVal[i] && st.used !== sw.shIdx[i] && sw.slVal[i] > sw.slPrev[i]) { st.used = sw.shIdx[i]; return buy(`bullish BOS above ${fp(sw.shVal[i])} (higher low)`); }
      return null;
    },
  });
  add('choch', {
    name: 'Change of Character', cat: 'Smart Money (SMC)',
    desc: 'Reversal entry. In a downtrend (lower highs and lower lows), the first close above the last lower high signals a change of character. Stop goes at the last swing low, with an R-multiple target.',
    params: [P('L', 'Swing length', 5, 2, 15, 1), P('rr', 'Reward : risk', 2.5, 0.5, 8, 0.25)],
    opt: { L: [3, 5, 7], rr: [1.5, 2.5, 4] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const sw = X.sw, b = c[i], st = ctx.state;
      if (ctx.pos || !fin(sw.shPrev[i]) || !fin(sw.slPrev[i]) || st.used === sw.shIdx[i]) return null;
      if (sw.shVal[i] < sw.shPrev[i] && sw.slVal[i] < sw.slPrev[i] && b.c > sw.shVal[i]) { st.used = sw.shIdx[i]; return enter(st, `CHoCH: broke lower high ${fp(sw.shVal[i])}`, b.c, sw.slVal[i] * 0.999, ctx.params.rr); }
      return null;
    },
  });
  add('turtlesoup', {
    name: 'Turtle Soup (False Breakdown)', cat: 'Smart Money (SMC)',
    desc: 'Fades failed breakdowns. Price trades below the prior N-bar low but closes back above it, trapping breakout sellers. Stop goes under the bar’s low, with an R-multiple target.',
    params: [P('n', 'Lookback bars', 20, 5, 100, 1), P('rr', 'Reward : risk', 2, 0.5, 8, 0.25)],
    opt: { n: [10, 20, 40], rr: [1.5, 2, 3] },
    prepare: (c, p) => ({ dc: I.donchian(c, p.n) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const lo = X.dc.lo[i], b = c[i];
      if (!ctx.pos && fin(lo) && b.l < lo && b.c > lo) return enter(ctx.state, `false breakdown of ${ctx.params.n}-bar low ${fp(lo)}`, b.c, b.l * 0.999, ctx.params.rr);
      return null;
    },
  });
  add('premdisc', {
    name: 'Premium / Discount', cat: 'Smart Money (SMC)',
    desc: 'Uses the dealing range between the last swing low and high. In bullish structure (higher low), buys a bullish candle in the discount zone (lower part of the range) and targets the range high. Stop goes below the swing low.',
    params: [P('L', 'Swing length', 5, 2, 15, 1), P('zone', 'Discount zone (0–0.5)', 0.3, 0.05, 0.5, 0.05)],
    opt: { L: [3, 5, 8], zone: [0.2, 0.3, 0.4] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const sw = X.sw, b = c[i], hi = sw.shVal[i], lo = sw.slVal[i];
      if (ctx.pos || !fin(hi) || !fin(lo) || !fin(sw.slPrev[i]) || hi <= lo || lo <= sw.slPrev[i]) return null;
      if (b.c <= lo + ctx.params.zone * (hi - lo) && b.c > lo && b.c > b.o && ctx.state.used !== sw.slIdx[i]) { ctx.state.used = sw.slIdx[i]; return enter(ctx.state, `bullish candle in discount of range ${fp(lo)}–${fp(hi)}`, b.c, lo * 0.998, 0, hi); }
      return null;
    },
  });
  add('goldenpocket', {
    name: 'Fibonacci Golden Pocket', cat: 'Smart Money (SMC)',
    desc: 'In an uptrend (price above the trend EMA), waits for a pullback into the 0.618–0.65 retracement of the last swing leg up, then buys a bullish close. Stop goes below the 0.786 level, and the target is the swing high.',
    params: [P('L', 'Swing length', 5, 2, 15, 1), P('trend', 'Trend EMA', 100, 20, 300, 5)],
    opt: { L: [3, 5, 8], trend: [50, 100, 200] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L), e: I.ema(c.map((x) => x.c), p.trend) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const sw = X.sw, b = c[i], hi = sw.shVal[i], lo = sw.slVal[i];
      if (ctx.pos || !fin(hi) || !fin(lo) || !(sw.slIdx[i] < sw.shIdx[i]) || !(b.c > X.e[i]) || ctx.state.used === sw.shIdx[i]) return null;
      const r = hi - lo, top = hi - 0.618 * r, bot = hi - 0.65 * r, stop = hi - 0.786 * r;
      if (b.l <= top && b.c >= bot && b.c > b.o) { ctx.state.used = sw.shIdx[i]; return enter(ctx.state, `golden-pocket bounce ${fp(bot)}–${fp(top)}`, b.c, stop, 0, hi); }
      return null;
    },
  });

  /* ═════════════ TREND ═════════════ */
  add('supertrend', {
    name: 'Supertrend', cat: 'Trend', desc: 'ATR trailing-band trend filter. Buys when Supertrend flips up and sells when it flips down.',
    params: [P('p', 'ATR period', 10, 3, 50, 1), P('m', 'ATR multiplier', 3, 0.5, 8, 0.25)], opt: { p: [7, 10, 14], m: [2, 3, 4] },
    prepare: (c, p) => I.supertrend(c, p.p, p.m),
    onBar: (i, X, c, ctx) => { if (i < 1 || X.up[i] == null || X.up[i - 1] == null) return null; if (!ctx.pos && X.up[i] && !X.up[i - 1]) return buy('Supertrend flipped bullish'); if (ctx.pos && !X.up[i] && X.up[i - 1]) return sell('Supertrend flipped bearish'); return null; },
  });
  add('ichimoku', {
    name: 'Ichimoku Cloud', cat: 'Trend', desc: 'Buys a Tenkan/Kijun bullish cross while price is above the cloud. Exits on a close below the Kijun.',
    params: [P('t', 'Tenkan', 9, 3, 30, 1), P('k', 'Kijun', 26, 10, 60, 1), P('b', 'Senkou B', 52, 20, 120, 1)], opt: { t: [7, 9, 12], k: [22, 26, 30] },
    prepare: (c, p) => I.ichimoku(c, p.t, p.k, p.b),
    onBar: (i, X, c, ctx) => {
      const top = Math.max(X.spanA[i], X.spanB[i]);
      if (!ctx.pos && crossUp(X.ten, X.kij, i) && fin(top) && c[i].c > top) return buy('TK cross above the cloud');
      if (ctx.pos && fin(X.kij[i]) && c[i].c < X.kij[i]) return sell('closed below Kijun');
      return null;
    },
  });
  add('psar', {
    name: 'Parabolic SAR', cat: 'Trend', desc: 'Stop-and-reverse trend system. Buys when SAR flips below price and sells when it flips above.',
    params: [P('step', 'Acceleration step', 0.02, 0.005, 0.1, 0.005), P('max', 'Max acceleration', 0.2, 0.05, 0.5, 0.05)], opt: { step: [0.01, 0.02, 0.03], max: [0.1, 0.2] },
    prepare: (c, p) => I.psar(c, p.step, p.max),
    onBar: (i, X, c, ctx) => { if (i < 2 || X.up[i] == null || X.up[i - 1] == null) return null; if (!ctx.pos && X.up[i] && !X.up[i - 1]) return buy('SAR flipped below price'); if (ctx.pos && !X.up[i] && X.up[i - 1]) return sell('SAR flipped above price'); return null; },
  });
  add('adx', {
    name: 'ADX Trend Strength', cat: 'Trend', desc: 'Buys when +DI crosses above −DI while ADX shows a strong trend. Exits when −DI takes over.',
    params: [P('p', 'Period', 14, 5, 50, 1), P('thr', 'Min ADX', 22, 10, 50, 1)], opt: { p: [10, 14, 20], thr: [18, 22, 28] },
    prepare: (c, p) => I.adx(c, p.p),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(X.pdi, X.mdi, i) && X.adx[i] > ctx.params.thr) return buy(`+DI crossed −DI, ADX ${X.adx[i].toFixed(0)}`); if (ctx.pos && crossDn(X.pdi, X.mdi, i)) return sell('−DI crossed above +DI'); return null; },
  });
  add('hma', {
    name: 'Hull MA Turn', cat: 'Trend', desc: 'The Hull moving average reacts fast with little lag. Buys when it turns up and sells when it turns down.',
    params: [P('p', 'HMA period', 21, 5, 120, 1)], opt: { p: [9, 14, 21, 34, 55] },
    prepare: (c, p) => ({ h: I.hma(c.map((x) => x.c), p.p) }),
    onBar: (i, X, c, ctx) => { const h = X.h; if (i < 2 || !fin(h[i - 2])) return null; if (!ctx.pos && h[i] > h[i - 1] && h[i - 1] <= h[i - 2]) return buy('Hull MA turned up'); if (ctx.pos && h[i] < h[i - 1] && h[i - 1] >= h[i - 2]) return sell('Hull MA turned down'); return null; },
  });
  add('tripleema', {
    name: 'Triple EMA Ribbon', cat: 'Trend', desc: 'Buys when EMA 8 > 21 > 55 first stack bullishly. Exits when the fast EMA drops below the middle one.',
    params: [P('a', 'Fast', 8, 2, 50, 1), P('b', 'Mid', 21, 5, 100, 1), P('c', 'Slow', 55, 20, 300, 1)], opt: { a: [5, 8, 13], b: [21, 34], c: [55, 89] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { a: I.ema(cl, p.a), b: I.ema(cl, p.b), c: I.ema(cl, p.c) }; },
    onBar: (i, X, c, ctx) => { const al = (k) => X.a[k] > X.b[k] && X.b[k] > X.c[k]; if (i < 1 || !fin(X.c[i - 1])) return null; if (!ctx.pos && al(i) && !al(i - 1)) return buy('EMA ribbon stacked bullish'); if (ctx.pos && X.a[i] < X.b[i]) return sell('fast EMA lost the mid EMA'); return null; },
  });
  add('goldencross', {
    name: 'Golden Cross 50/200', cat: 'Trend', desc: 'The classic. Buys when the 50 SMA crosses above the 200 SMA (golden cross) and sells on the death cross. Needs long history.',
    params: [P('f', 'Fast SMA', 50, 5, 200, 1), P('s', 'Slow SMA', 200, 20, 400, 5)], opt: { f: [20, 50], s: [100, 200] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { f: I.sma(cl, p.f), s: I.sma(cl, p.s) }; },
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(X.f, X.s, i)) return buy('golden cross'); if (ctx.pos && crossDn(X.f, X.s, i)) return sell('death cross'); return null; },
  });
  add('chandelier', {
    name: 'Chandelier Exit Trend', cat: 'Trend', desc: 'ATR-based trailing stops from the highest high and lowest low. Goes long when price closes above the short stop and exits when it loses the long stop.',
    params: [P('p', 'Lookback', 22, 5, 100, 1), P('m', 'ATR mult', 3, 1, 8, 0.25)], opt: { p: [14, 22, 34], m: [2, 3, 4] },
    prepare: (c, p) => { const atr = I.atr(c, p.p), hh = I.rollMax(c.map((x) => x.h), p.p), ll = I.rollMin(c.map((x) => x.l), p.p); return { ls: hh.map((v, i) => v - p.m * atr[i]), ss: ll.map((v, i) => v + p.m * atr[i]) }; },
    onBar: (i, X, c, ctx) => { if (i < 1) return null; if (!ctx.pos && fin(X.ss[i - 1]) && c[i].c > X.ss[i - 1]) return buy('closed above chandelier short stop'); if (ctx.pos && fin(X.ls[i - 1]) && c[i].c < X.ls[i - 1]) return sell('closed below chandelier long stop'); return null; },
  });
  add('heikin', {
    name: 'Heikin-Ashi Trend', cat: 'Trend', desc: 'Buys after N strong bullish Heikin-Ashi candles in a row (no lower wick) and exits on the first bearish HA candle.',
    params: [P('n', 'Strong candles', 2, 1, 6, 1)], opt: { n: [1, 2, 3, 4] },
    prepare: (c) => ({ ha: I.heikin(c) }),
    onBar: (i, X, c, ctx) => {
      const ha = X.ha, n = ctx.params.n; if (i < n + 1) return null;
      const strong = (k) => ha[k].c > ha[k].o && Math.abs(ha[k].l - Math.min(ha[k].o, ha[k].c)) < 1e-12 * Math.max(1, ha[k].c) + 1e-9;
      if (!ctx.pos) { let ok = true; for (let k = i - n + 1; k <= i; k++) if (!strong(k)) ok = false; if (ok && !strong(i - n)) return buy(`${n} strong bullish Heikin-Ashi candles`); }
      if (ctx.pos && ha[i].c < ha[i].o) return sell('bearish Heikin-Ashi candle');
      return null;
    },
  });
  add('aroon', {
    name: 'Aroon Trend', cat: 'Trend', desc: 'Buys when Aroon Up crosses above Aroon Down while above 70 (fresh highs). Exits when Aroon Down leads.',
    params: [P('p', 'Period', 25, 5, 100, 1)], opt: { p: [14, 25, 40] },
    prepare: (c, p) => I.aroon(c, p.p),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(X.up, X.dn, i) && X.up[i] >= 70) return buy('Aroon Up crossed Aroon Down'); if (ctx.pos && crossDn(X.up, X.dn, i)) return sell('Aroon Down took over'); return null; },
  });

  /* ═════════════ MOMENTUM / OSCILLATORS ═════════════ */
  add('stoch', {
    name: 'Stochastic Cross', cat: 'Momentum', desc: 'Buys a %K/%D bullish cross in the oversold zone and sells a bearish cross in the overbought zone.',
    params: [P('k', '%K period', 14, 3, 50, 1), P('os', 'Oversold', 20, 5, 40, 1), P('ob', 'Overbought', 80, 60, 95, 1)], opt: { k: [9, 14, 21], os: [15, 20, 30] },
    prepare: (c, p) => I.stoch(c, p.k, 3, 3),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(X.k, X.d, i) && X.d[i] < ctx.params.os) return buy(`stoch bull cross at ${X.k[i].toFixed(0)}`); if (ctx.pos && ((crossDn(X.k, X.d, i) && X.d[i] > ctx.params.ob) || X.k[i] > 95)) return sell(`stoch bear cross at ${X.k[i].toFixed(0)}`); return null; },
  });
  add('stochrsi', {
    name: 'Stochastic RSI', cat: 'Momentum', desc: 'Stochastic applied to RSI, which is more sensitive. Buys a K/D cross up below 20 and sells a cross down above 80.',
    params: [P('p', 'RSI period', 14, 3, 50, 1), P('os', 'Oversold', 20, 5, 40, 1), P('ob', 'Overbought', 80, 60, 95, 1)], opt: { p: [7, 14, 21], os: [10, 20] },
    prepare: (c, p) => I.stochRsi(c.map((x) => x.c), p.p, 3, 3),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(X.k, X.d, i) && X.k[i] < ctx.params.os + 10) return buy(`StochRSI bull cross ${X.k[i].toFixed(0)}`); if (ctx.pos && crossDn(X.k, X.d, i) && X.k[i] > ctx.params.ob - 10) return sell(`StochRSI bear cross ${X.k[i].toFixed(0)}`); return null; },
  });
  add('cci', {
    name: 'CCI Reversal', cat: 'Momentum', desc: 'Buys when the Commodity Channel Index climbs back above −100 and sells when it falls back below +100.',
    params: [P('p', 'Period', 20, 5, 100, 1), P('lvl', 'Level', 100, 50, 250, 10)], opt: { p: [14, 20, 30], lvl: [100, 150] },
    prepare: (c, p) => ({ v: I.cci(c, p.p) }),
    onBar: (i, X, c, ctx) => { const L = ctx.params.lvl; if (!ctx.pos && crossUpL(X.v, -L, i)) return buy(`CCI back above −${L}`); if (ctx.pos && crossDnL(X.v, L, i)) return sell(`CCI back below +${L}`); return null; },
  });
  add('willr', {
    name: 'Williams %R', cat: 'Momentum', desc: 'Buys when %R exits oversold (crosses above −80) and sells when it exits overbought (crosses below −20).',
    params: [P('p', 'Period', 14, 3, 60, 1)], opt: { p: [7, 14, 21, 30] },
    prepare: (c, p) => ({ v: I.willr(c, p.p) }),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUpL(X.v, -80, i)) return buy('%R left oversold'); if (ctx.pos && crossDnL(X.v, -20, i)) return sell('%R left overbought'); return null; },
  });
  add('rsidiv', {
    name: 'RSI Bullish Divergence', cat: 'Momentum', desc: 'Price makes a lower swing low but RSI makes a higher low, so selling momentum is fading. Buys on confirmation. Stop goes below the new low, with an R-multiple target.',
    params: [P('L', 'Swing length', 4, 2, 12, 1), P('p', 'RSI period', 14, 5, 30, 1), P('rr', 'Reward : risk', 2, 0.5, 6, 0.25)], opt: { L: [3, 4, 6], rr: [1.5, 2, 3] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L), r: I.rsi(c.map((x) => x.c), p.p) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const sw = X.sw, st = ctx.state; if (ctx.pos || !fin(sw.slPrev[i]) || st.used === sw.slIdx[i]) return null;
      const a = X.r[sw.slPrevIdx[i]], b = X.r[sw.slIdx[i]];
      if (sw.slVal[i] < sw.slPrev[i] && fin(a) && fin(b) && b > a && b < 45 && c[i].c > c[i].o) { st.used = sw.slIdx[i]; return enter(st, `bullish RSI divergence (${a.toFixed(0)}→${b.toFixed(0)})`, c[i].c, sw.slVal[i] * 0.998, ctx.params.rr); }
      return null;
    },
  });
  add('roc', {
    name: 'Rate-of-Change Momentum', cat: 'Momentum', desc: 'Buys when the N-bar rate of change crosses above a threshold and exits when momentum turns negative.',
    params: [P('p', 'ROC period', 12, 2, 100, 1), P('thr', 'Entry threshold %', 1, 0, 20, 0.25)], opt: { p: [6, 12, 24], thr: [0.5, 1, 2] },
    prepare: (c, p) => ({ v: I.roc(c.map((x) => x.c), p.p) }),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUpL(X.v, ctx.params.thr, i)) return buy(`ROC crossed +${ctx.params.thr}%`); if (ctx.pos && crossDnL(X.v, 0, i)) return sell('ROC turned negative'); return null; },
  });
  add('elder', {
    name: 'Elder Impulse', cat: 'Momentum', desc: 'Alexander Elder’s impulse system. A green bar (EMA13 rising and MACD histogram rising) is a buy, and a red bar (both falling) is an exit.',
    params: [P('e', 'EMA period', 13, 5, 50, 1)], opt: { e: [8, 13, 21] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { e: I.ema(cl, p.e), h: I.macd(cl).hist }; },
    onBar: (i, X, c, ctx) => {
      if (i < 2 || !fin(X.h[i - 1]) || !fin(X.e[i - 1])) return null;
      const g = (k) => X.e[k] > X.e[k - 1] && X.h[k] > X.h[k - 1], r = (k) => X.e[k] < X.e[k - 1] && X.h[k] < X.h[k - 1];
      if (!ctx.pos && g(i) && !g(i - 1)) return buy('impulse turned green'); if (ctx.pos && r(i)) return sell('impulse turned red'); return null;
    },
  });

  /* ═════════════ MEAN REVERSION ═════════════ */
  add('mfi', {
    name: 'Money Flow Index', cat: 'Mean Reversion', desc: 'Volume-weighted RSI. Buys when MFI recovers from below 20 and sells above 80.',
    params: [P('p', 'Period', 14, 3, 50, 1), P('os', 'Oversold', 20, 5, 40, 1), P('ob', 'Overbought', 80, 60, 95, 1)], opt: { p: [10, 14, 21], os: [15, 20, 25] },
    prepare: (c, p) => ({ v: I.mfi(c, p.p) }),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUpL(X.v, ctx.params.os, i)) return buy(`MFI recovered above ${ctx.params.os}`); if (ctx.pos && X.v[i] > ctx.params.ob) return sell(`MFI ${X.v[i].toFixed(0)} overbought`); return null; },
  });
  add('vwaprev', {
    name: 'VWAP Reversion', cat: 'Mean Reversion', desc: 'Buys when price stretches below the rolling VWAP by k standard deviations and exits back at VWAP.',
    params: [P('p', 'VWAP window (bars)', 48, 10, 500, 1), P('k', 'Std devs', 2, 0.5, 4, 0.25)], opt: { p: [24, 48, 96], k: [1.5, 2, 2.5] },
    prepare: (c, p) => I.rvwap(c, p.p),
    onBar: (i, X, c, ctx) => { const b = c[i]; if (!fin(X.vw[i])) return null; if (!ctx.pos && b.c < X.vw[i] - ctx.params.k * X.sd[i]) return buy(`${ctx.params.k}σ below VWAP ${fp(X.vw[i])}`); if (ctx.pos && b.c >= X.vw[i]) return sell('back to VWAP'); return null; },
  });
  add('zscore', {
    name: 'Z-Score Reversion', cat: 'Mean Reversion', desc: 'Statistical mean reversion. Buys when price is more than N standard deviations below its moving average and exits at the mean.',
    params: [P('p', 'Lookback', 30, 10, 200, 1), P('z', 'Entry z', 2, 0.5, 4, 0.1)], opt: { p: [20, 30, 50], z: [1.5, 2, 2.5] },
    prepare: (c, p) => ({ z: I.zscore(c.map((x) => x.c), p.p) }),
    onBar: (i, X, c, ctx) => { const z = X.z[i]; if (!fin(z)) return null; if (!ctx.pos && z < -ctx.params.z) return buy(`z-score ${z.toFixed(2)}`); if (ctx.pos && z >= 0) return sell('reverted to the mean'); return null; },
  });
  add('pivot', {
    name: 'Pivot Point Bounce', cat: 'Mean Reversion', desc: 'Classic floor pivots from yesterday’s range. Buys a bounce off S1 (wick through, close above), targets the central pivot, and stops below S2. Best on intraday timeframes.',
    params: [P('rr', 'Unused (target = pivot)', 0, 0, 0, 1)], opt: {},
    prepare: (c) => I.dailyPivots(c),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const b = c[i], s1 = X.S1[i], d = Math.floor(b.t / 86400);
      if (!ctx.pos && fin(s1) && b.l <= s1 && b.c > s1 && b.c < X.P[i] && ctx.state.day !== d) { ctx.state.day = d; return enter(ctx.state, `bounce off S1 ${fp(s1)}`, b.c, X.S2[i], 0, X.P[i]); }
      return null;
    },
  });

  /* ═════════════ BREAKOUT / VOLATILITY ═════════════ */
  add('keltner', {
    name: 'Keltner Breakout', cat: 'Breakout', desc: 'Buys a close above the upper Keltner channel (EMA ± ATR) and exits on a close back below the middle line.',
    params: [P('p', 'EMA period', 20, 5, 100, 1), P('m', 'ATR mult', 2, 0.5, 5, 0.25)], opt: { p: [14, 20, 30], m: [1.5, 2, 2.5] },
    prepare: (c, p) => I.keltner(c, p.p, p.m, 10),
    onBar: (i, X, c, ctx) => { if (!ctx.pos && crossUp(c.map ? null : null, null, i)) return null; const b = c[i]; if (!fin(X.up[i])) return null; if (!ctx.pos && b.c > X.up[i] && c[i - 1].c <= X.up[i - 1]) return buy('closed above upper Keltner'); if (ctx.pos && b.c < X.mid[i]) return sell('lost the Keltner midline'); return null; },
  });
  add('bbbreak', {
    name: 'Bollinger Breakout', cat: 'Breakout', desc: 'The trend-following twin of Bollinger reversion. Buys a close above the upper band and rides it until price closes below the middle band.',
    params: [P('p', 'Period', 20, 5, 100, 1), P('m', 'Std devs', 2, 1, 4, 0.25)], opt: { p: [14, 20, 30], m: [1.5, 2, 2.5] },
    prepare: (c, p) => I.bb(c.map((x) => x.c), p.p, p.m),
    onBar: (i, X, c, ctx) => { const b = c[i]; if (i < 1 || !fin(X.up[i - 1])) return null; if (!ctx.pos && b.c > X.up[i] && c[i - 1].c <= X.up[i - 1]) return buy('closed above upper Bollinger band'); if (ctx.pos && b.c < X.mid[i]) return sell('closed below middle band'); return null; },
  });
  add('squeeze', {
    name: 'TTM Squeeze', cat: 'Breakout', desc: 'Volatility compression. While Bollinger Bands sit inside the Keltner Channel, the market is coiling. Buys when the squeeze releases with upward momentum and exits when momentum fades.',
    params: [P('p', 'Length', 20, 10, 50, 1), P('kc', 'Keltner mult', 1.5, 1, 3, 0.1)], opt: { p: [14, 20, 30], kc: [1.25, 1.5, 2] },
    prepare: (c, p) => { const cl = c.map((x) => x.c), bb = I.bb(cl, p.p, 2), kc = I.keltner(c, p.p, p.kc, p.p), sm = I.sma(cl, p.p), mom = cl.map((v, i) => v - sm[i]); return { on: bb.up.map((u, i) => fin(u) && fin(kc.up[i]) && u < kc.up[i] && bb.lo[i] > kc.lo[i]), mom }; },
    onBar: (i, X, c, ctx) => { if (i < 2) return null; if (!ctx.pos && X.on[i - 1] && !X.on[i] && X.mom[i] > 0 && X.mom[i] > X.mom[i - 1]) return buy('squeeze fired upward'); if (ctx.pos && fin(X.mom[i]) && X.mom[i] < X.mom[i - 1] && X.mom[i - 1] < X.mom[i - 2]) return sell('squeeze momentum fading'); return null; },
  });
  add('orb', {
    name: 'Opening Range Breakout', cat: 'Breakout', desc: 'The first N bars of each (UTC) session set a range. Buys the first close above the range high, stops at the range low, and exits at the end of the session. Use intraday timeframes.',
    params: [P('n', 'Range bars', 4, 1, 30, 1)], opt: { n: [2, 4, 6, 8] },
    prepare: () => ({}),
    onBar: (i, X, c, ctx) => {
      const st = ctx.state, b = c[i], d = Math.floor(b.t / 86400);
      if (st.d !== d) { const wasPos = !!ctx.pos; st.d = d; st.n = 0; st.hi = -Infinity; st.lo = Infinity; st.done = false; st.sl = null; if (wasPos) return sell('session ended'); }
      st.n++;
      if (ctx.pos) { if (st.sl && b.l <= st.sl) { st.sl = null; return sell('range low stop', { px: b.o < st.lo ? b.o : st.lo }); } return null; }
      if (st.n <= ctx.params.n) { st.hi = Math.max(st.hi, b.h); st.lo = Math.min(st.lo, b.l); return null; }
      if (!st.done && b.c > st.hi) { st.done = true; st.sl = st.lo; return buy(`broke opening range high ${fp(st.hi)}`); }
      return null;
    },
  });
  add('volspike', {
    name: 'Volume Spike Breakout', cat: 'Volume', desc: 'Buys a breakout to a new N-bar high on volume well above average (institutional participation) and trails with the 20 EMA.',
    params: [P('n', 'Breakout bars', 20, 5, 100, 1), P('k', 'Volume × average', 2, 1.2, 6, 0.1)], opt: { n: [10, 20, 40], k: [1.5, 2, 3] },
    prepare: (c, p) => ({ dc: I.donchian(c, p.n), va: I.smaN(c.map((x) => x.v), 20), e: I.ema(c.map((x) => x.c), 20) }),
    onBar: (i, X, c, ctx) => { const b = c[i]; if (!fin(X.dc.hi[i]) || !fin(X.va[i - 1])) return null; if (!ctx.pos && b.c > X.dc.hi[i] && b.v > ctx.params.k * X.va[i - 1]) return buy(`breakout on ${(b.v / X.va[i - 1]).toFixed(1)}× volume`); if (ctx.pos && b.c < X.e[i]) return sell('closed below 20 EMA'); return null; },
  });
  add('obv', {
    name: 'OBV Breakout', cat: 'Volume', desc: 'On-Balance Volume leads price. Buys when OBV makes a new N-bar high while price is above its 50 EMA and exits when OBV drops below its 20-bar average.',
    params: [P('n', 'OBV high lookback', 20, 5, 100, 1)], opt: { n: [10, 20, 40] },
    prepare: (c, p) => { const o = I.obv(c); return { o, hi: I.rollMax(o, p.n), m: I.smaN(o, 20), e: I.ema(c.map((x) => x.c), 50) }; },
    onBar: (i, X, c, ctx) => { if (i < 1 || !fin(X.hi[i - 1]) || !fin(X.e[i])) return null; if (!ctx.pos && X.o[i] > X.hi[i - 1] && c[i].c > X.e[i]) return buy('OBV new high, price above 50 EMA'); if (ctx.pos && X.o[i] < X.m[i]) return sell('OBV below its average'); return null; },
  });

  /* ═════════════ PRICE ACTION ═════════════ */
  add('engulfing', {
    name: 'Bullish Engulfing', cat: 'Price Action', desc: 'A green candle fully engulfs the prior red candle’s body while price is above the trend EMA. Stop goes below the pattern, with an R-multiple target.',
    params: [P('trend', 'Trend EMA', 50, 10, 300, 5), P('rr', 'Reward : risk', 2, 0.5, 6, 0.25)], opt: { trend: [20, 50, 100], rr: [1.5, 2, 3] },
    prepare: (c, p) => ({ e: I.ema(c.map((x) => x.c), p.trend) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      if (ctx.pos || i < 1 || !fin(X.e[i])) return null; const b = c[i], q = c[i - 1];
      if (q.c < q.o && b.c > b.o && b.c >= q.o && b.o <= q.c && b.c > X.e[i]) return enter(ctx.state, 'bullish engulfing in uptrend', b.c, Math.min(b.l, q.l) * 0.999, ctx.params.rr);
      return null;
    },
  });
  add('insidebar', {
    name: 'Inside Bar Breakout', cat: 'Price Action', desc: 'A bar contained inside the previous bar marks compression. Buys a close above the inside bar’s high, with the stop at its low and an R-multiple target.',
    params: [P('rr', 'Reward : risk', 2, 0.5, 6, 0.25), P('trend', 'Trend EMA (0 = off)', 50, 0, 300, 5)], opt: { rr: [1.5, 2, 3], trend: [0, 50] },
    prepare: (c, p) => ({ e: p.trend > 0 ? I.ema(c.map((x) => x.c), p.trend) : null }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      if (ctx.pos || i < 2) return null; const mo = c[i - 2], ib = c[i - 1], b = c[i];
      if (X.e && !(b.c > X.e[i])) return null;
      if (ib.h < mo.h && ib.l > mo.l && b.c > ib.h) return enter(ctx.state, 'inside-bar breakout', b.c, ib.l * 0.999, ctx.params.rr);
      return null;
    },
  });
  add('pinbar', {
    name: 'Hammer / Pin Bar', cat: 'Price Action', desc: 'A long lower wick (at least 2× the body, close in the top third) at a fresh N-bar low shows buyers rejecting lower prices. Stop goes under the wick.',
    params: [P('n', 'Fresh-low lookback', 10, 3, 60, 1), P('rr', 'Reward : risk', 2, 0.5, 6, 0.25)], opt: { n: [5, 10, 20], rr: [1.5, 2, 3] },
    prepare: (c, p) => ({ dc: I.donchian(c, p.n) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m;
      const b = c[i], body = Math.abs(b.c - b.o), rng = b.h - b.l, wick = Math.min(b.o, b.c) - b.l;
      if (!ctx.pos && fin(X.dc.lo[i]) && rng > 0 && b.l <= X.dc.lo[i] && wick >= 2 * Math.max(body, rng * 0.05) && (b.c - b.l) / rng >= 0.66) return enter(ctx.state, 'hammer at a fresh low', b.c, b.l * 0.999, ctx.params.rr);
      return null;
    },
  });
  add('threesoldiers', {
    name: 'Three White Soldiers', cat: 'Price Action', desc: 'Three consecutive strong green candles, each closing near its high and above the previous close. Rides momentum and exits on the first close below the prior bar’s low.',
    params: [P('q', 'Min close position (0–1)', 0.7, 0.5, 0.95, 0.05)], opt: { q: [0.6, 0.7, 0.8] },
    prepare: () => ({}),
    onBar: (i, X, c, ctx) => {
      if (i < 3) return null; const ok = (k) => { const b = c[k], r = b.h - b.l; return b.c > b.o && r > 0 && (b.c - b.l) / r >= ctx.params.q && b.c > c[k - 1].c; };
      if (!ctx.pos && ok(i) && ok(i - 1) && ok(i - 2) && !ok(i - 3)) return buy('three white soldiers');
      if (ctx.pos && c[i].c < c[i - 1].l) return sell('closed below prior bar low');
      return null;
    },
  });
  add('macrossrsi', {
    name: 'EMA Trend + RSI Pullback', cat: 'Trend', desc: 'Buys RSI pullbacks (dips below the buy level) only while price holds above a long EMA, buying the dip in an uptrend. Exits when RSI is strong again or price loses the EMA.',
    params: [P('trend', 'Trend EMA', 200, 20, 400, 5), P('lvl', 'RSI dip level', 40, 20, 50, 1)], opt: { trend: [50, 100, 200], lvl: [35, 40, 45] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { e: I.ema(cl, p.trend), r: I.rsi(cl, 14) }; },
    onBar: (i, X, c, ctx) => { const b = c[i]; if (!fin(X.e[i]) || !fin(X.r[i])) return null; if (!ctx.pos && b.c > X.e[i] && crossUpL(X.r, ctx.params.lvl, i)) return buy(`RSI pullback in uptrend (${X.r[i].toFixed(0)})`); if (ctx.pos && (X.r[i] > 70 || b.c < X.e[i])) return sell(X.r[i] > 70 ? 'RSI above 70' : 'lost the trend EMA'); return null; },
  });
  add('donchmid', {
    name: 'Donchian Mid Pullback', cat: 'Trend', desc: 'In a channel uptrend (new highs recently), buys pullbacks that touch the Donchian midline and close back up, and exits at a new channel high or a close below the lower band.',
    params: [P('n', 'Channel bars', 30, 10, 120, 1)], opt: { n: [20, 30, 55] },
    prepare: (c, p) => ({ dc: I.donchian(c, p.n), ar: I.aroon(c, p.n) }),
    onBar: (i, X, c, ctx) => {
      const hi = X.dc.hi[i], lo = X.dc.lo[i], b = c[i]; if (!fin(hi) || !fin(X.ar.up[i])) return null; const mid = (hi + lo) / 2;
      if (!ctx.pos && X.ar.up[i] > 60 && b.l <= mid && b.c > mid && b.c > b.o) return buy(`pullback to channel mid ${fp(mid)}`);
      if (ctx.pos && (b.h >= hi || b.c < lo)) return sell(b.h >= hi ? 'reached channel high' : 'broke channel low');
      return null;
    },
  });
  // fix the Keltner onBar (keep it simple and safe)
  S.keltner.onBar = (i, X, c, ctx) => { const b = c[i]; if (i < 1 || !fin(X.up[i]) || !fin(X.up[i - 1])) return null; if (!ctx.pos && b.c > X.up[i] && c[i - 1].c <= X.up[i - 1]) return buy('closed above upper Keltner'); if (ctx.pos && b.c < X.mid[i]) return sell('lost the Keltner midline'); return null; };


  /* ───────────── ★ Pro set — proven, published rules with trend/regime filters, tuned for win rate ───────────── */
  const timeUp = (st, i, n) => n > 0 && st.entryI != null && i - st.entryI >= n;
  const go = (st, i, reason, entry, sl, rr, tp) => { const s = enter(st, reason, entry, sl, rr, tp); if (s) st.entryI = i; return s; };
  const PRO = 'Pro: ';
  add('pro_rsi2', {
    name: '★ Connors RSI-2 Pullback', cat: 'Mean Reversion', pro: true,
    desc: PRO + 'Larry Connors’ published rule. Trades only in an uptrend (close above the 200 SMA), buys when 2-period RSI is deeply oversold, and exits as soon as price closes back above the 5 SMA. Holds are short; this family historically wins 65–75% of trades on indices and large caps. A wide ATR disaster stop and a time stop cap the rare big loser.',
    params: [P('trend', 'Trend SMA', 200, 50, 400, 10), P('rsi', 'RSI(2) buy below', 10, 2, 30, 1), P('exit', 'Exit above SMA', 5, 3, 20, 1), P('stop', 'Disaster stop ATR×', 3, 1, 8, 0.5), P('maxBars', 'Max bars held', 10, 2, 60, 1)],
    opt: { rsi: [5, 10, 15], exit: [5, 8], trend: [100, 200] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { t: I.sma(cl, p.trend), r: I.rsi(cl, 2), e: I.sma(cl, p.exit), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (fin(X.e[i]) && b.c > X.e[i]) return sell(`closed back above the ${p.exit} SMA`); if (timeUp(st, i, p.maxBars)) return sell('time stop'); return null; }
      if (fin(X.t[i]) && fin(X.r[i]) && fin(X.a[i]) && b.c > X.t[i] && X.r[i] < p.rsi) return go(st, i, `RSI(2) ${X.r[i].toFixed(1)} while above the ${p.trend} SMA`, b.c, b.c - p.stop * X.a[i], 0);
      return null;
    },
  });
  add('pro_ibs', {
    name: '★ IBS Reversion', cat: 'Mean Reversion', pro: true,
    desc: PRO + 'Internal Bar Strength = where the close sits in the bar’s range. Closing near the low (IBS < 0.2) after two down closes, below the 10 SMA but inside an uptrend, tends to snap back within a few bars. Exits on a close above the prior high or a strong close, with a time stop. A well-documented edge on ETFs, indices and majors.',
    params: [P('trend', 'Trend SMA', 200, 50, 400, 10), P('ibs', 'Buy when IBS below', 0.2, 0.05, 0.4, 0.05), P('ibsx', 'Exit when IBS above', 0.75, 0.5, 0.95, 0.05), P('stop', 'Disaster stop ATR×', 3, 1, 8, 0.5), P('maxBars', 'Max bars held', 6, 1, 30, 1)],
    opt: { ibs: [0.1, 0.2, 0.3], maxBars: [3, 6, 10] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { t: I.sma(cl, p.trend), s10: I.sma(cl, 10), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i], ibs = (b.c - b.l) / Math.max(1e-12, b.h - b.l);
      if (ctx.pos) { if (i > 0 && b.c > c[i - 1].h) return sell('closed above the prior bar’s high'); if (ibs > p.ibsx && st.entryI !== i) return sell(`strong close (IBS ${ibs.toFixed(2)})`); if (timeUp(st, i, p.maxBars)) return sell('time stop'); return null; }
      if (fin(X.t[i]) && fin(X.a[i]) && i > 2 && b.c > X.t[i] && b.c < X.s10[i] && b.c < c[i - 1].c && c[i - 1].c < c[i - 2].c && ibs < p.ibs && b.h > b.l) return go(st, i, `IBS ${ibs.toFixed(2)} in uptrend`, b.c, b.c - p.stop * X.a[i], 0);
      return null;
    },
  });
  add('pro_trendpb', {
    name: '★ Trend Pullback (EMA stack)', cat: 'Trend', pro: true,
    desc: PRO + 'Only trades when EMA 20 > 50 > 200 (a clean uptrend). Buys the pullback that tags the 20 EMA and closes back above it with RSI not overheated. Stop under the recent swing low, take profit at 1.2R, and bail if price closes under the 50 EMA. Buying dips in trends is the most robust edge in trading.',
    params: [P('f', 'Fast EMA', 20, 5, 50, 1), P('m', 'Mid EMA', 50, 20, 120, 1), P('s', 'Trend EMA', 200, 100, 400, 10), P('rr', 'Reward : risk', 1.2, 0.75, 5, 0.1), P('rsiMax', 'RSI max at entry', 60, 40, 80, 1)],
    opt: { f: [10, 20], rr: [1, 1.2, 1.5, 2] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { f: I.ema(cl, p.f), m: I.ema(cl, p.m), s: I.ema(cl, p.s), r: I.rsi(cl, 14), a: I.atr(c, 14), lo: I.rollMin(c.map((x) => x.l), 5) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (b.c < X.m[i]) return sell(`closed below the ${p.m} EMA`); return null; }
      if (!fin(X.s[i]) || !fin(X.a[i])) return null;
      if (X.f[i] > X.m[i] && X.m[i] > X.s[i] && b.l <= X.f[i] && b.c > X.f[i] && X.r[i] < p.rsiMax) return go(st, i, `pullback to the ${p.f} EMA in a stacked uptrend`, b.c, Math.min(X.lo[i], b.l) - 0.3 * X.a[i], p.rr);
      return null;
    },
  });
  add('pro_momo', {
    name: '★ Momentum Reset (RSI 50 reclaim)', cat: 'Momentum', pro: true,
    desc: PRO + 'In an uptrend (EMA 50 above EMA 200, ADX showing a real trend), waits for momentum to cool (RSI under 45), then buys when RSI reclaims 50. You enter as momentum resumes, not at the top. 2-ATR stop, 2R target, exit if the trend breaks.',
    params: [P('lb', 'Cool-off lookback', 10, 3, 30, 1), P('adx', 'ADX min', 18, 10, 35, 1), P('rr', 'Reward : risk', 2, 1, 5, 0.25), P('stop', 'Stop ATR×', 2, 1, 5, 0.25)],
    opt: { rr: [1.5, 2, 3], adx: [15, 20, 25] },
    prepare: (c) => { const cl = c.map((x) => x.c); return { r: I.rsi(cl, 14), e50: I.ema(cl, 50), e200: I.ema(cl, 200), d: I.adx(c, 14), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (b.c < X.e50[i] && X.e50[i] < X.e200[i]) return sell('trend broke'); return null; }
      if (!fin(X.e200[i]) || !fin(X.d.adx[i]) || !fin(X.a[i])) return null;
      let cooled = false; for (let k = Math.max(0, i - p.lb); k < i; k++) if (X.r[k] < 45) { cooled = true; break; }
      if (X.e50[i] > X.e200[i] && X.d.adx[i] >= p.adx && cooled && crossUpL(X.r, 50, i)) return go(st, i, `RSI reclaimed 50 after a reset · ADX ${X.d.adx[i].toFixed(0)}`, b.c, b.c - p.stop * X.a[i], p.rr);
      return null;
    },
  });
  add('pro_squeeze', {
    name: '★ Volatility Squeeze Breakout', cat: 'Breakout', pro: true,
    desc: PRO + 'Bollinger bandwidth near its tightest in 100 bars means energy is coiled. Buys the first close above the upper band with a volume surge, and only above the 200 EMA. Stop under the middle band, quick 1.5R target to bank the expansion, so more breakouts end as winners.',
    params: [P('p', 'BB period', 20, 10, 50, 1), P('look', 'Squeeze lookback', 100, 40, 300, 10), P('tight', 'Within % of tightest', 20, 0, 80, 5), P('vol', 'Volume × average', 1.4, 1, 4, 0.1), P('rr', 'Reward : risk', 1.5, 0.75, 5, 0.25)],
    opt: { rr: [1, 1.5, 2], vol: [1.2, 1.5] },
    prepare: (c, p) => { const cl = c.map((x) => x.c), bb = I.bb(cl, p.p, 2), bw = bb.up.map((u, i) => (u - bb.lo[i]) / (bb.mid ? bb.mid[i] : cl[i])); return { bb, bw, mn: I.rollMin(bw.map((v) => (fin(v) ? v : Infinity)), p.look), vs: I.smaN(c.map((x) => x.v), 20), e: I.ema(cl, 200), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos || i < 6 || !fin(X.e[i]) || !fin(X.bb.up[i])) return null;
      let sq = false; for (let k = i - 5; k < i; k++) if (fin(X.bw[k]) && fin(X.mn[k]) && X.bw[k] <= X.mn[k] * (1 + p.tight / 100)) { sq = true; break; }
      const mid = (X.bb.up[i] + X.bb.lo[i]) / 2;
      if (sq && b.c > X.bb.up[i] && b.c > X.e[i] && (!X.vs[i] || b.v >= p.vol * X.vs[i])) return go(st, i, 'squeeze released upward on volume', b.c, Math.min(mid, b.c - 1.5 * X.a[i]), p.rr);
      return null;
    },
  });
  add('pro_vwap', {
    name: '★ VWAP Reclaim', cat: 'Volume', pro: true,
    desc: PRO + 'Institutions benchmark to VWAP. In an uptrend (above the 200 EMA), buys when price dips under the rolling VWAP and then reclaims it on above-average volume. Target is the VWAP +1.5σ band, stop under the dip low. A favourite intraday setup.',
    params: [P('p', 'VWAP window', 48, 10, 300, 2), P('sd', 'Target σ', 1.5, 0.5, 3, 0.25), P('vol', 'Volume × average', 1.2, 0.8, 3, 0.1)],
    opt: { p: [24, 48, 96], sd: [1, 1.5, 2] },
    prepare: (c, p) => { const v = I.rvwap(c, p.p); return { vw: v.vw, sd: v.sd, e: I.ema(c.map((x) => x.c), 200), vs: I.smaN(c.map((x) => x.v), 20), lo: I.rollMin(c.map((x) => x.l), 4), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos || i < 1 || !fin(X.vw[i]) || !fin(X.e[i]) || !fin(X.sd[i])) return null;
      if (b.c > X.e[i] && c[i - 1].c < X.vw[i - 1] && b.c > X.vw[i] && (!X.vs[i] || b.v >= p.vol * X.vs[i])) { const tp = X.vw[i] + p.sd * X.sd[i]; if (tp > b.c * 1.001) return go(st, i, 'reclaimed VWAP on volume in an uptrend', b.c, X.lo[i] - 0.25 * X.a[i], 0, tp); }
      return null;
    },
  });
  add('pro_engulf', {
    name: '★ Engulfing at Support', cat: 'Price Action', pro: true,
    desc: PRO + 'A bullish engulfing candle only counts at a meaningful level: in an uptrend (above the 200 EMA), with the pattern’s low tagging the 50 EMA or the recent range low, and RSI not overbought. Stop under the pattern, 1.5R target. Context turns a coin-flip pattern into an edge.',
    params: [P('rr', 'Reward : risk', 1.5, 0.75, 5, 0.25), P('zone', 'Zone width ATR×', 0.6, 0.1, 2, 0.1), P('rsiMax', 'RSI max', 55, 35, 75, 1)],
    opt: { rr: [1, 1.5, 2], zone: [0.4, 0.8] },
    prepare: (c) => { const cl = c.map((x) => x.c); return { e50: I.ema(cl, 50), e200: I.ema(cl, 200), r: I.rsi(cl, 14), a: I.atr(c, 14), ll: I.rollMin(c.map((x) => x.l), 20) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i], q = c[i - 1];
      if (ctx.pos || i < 2 || !fin(X.e200[i]) || !fin(X.a[i])) return null;
      const engulf = q.c < q.o && b.c > b.o && b.c >= q.o && b.o <= q.c, lo = Math.min(b.l, q.l), z = p.zone * X.a[i];
      const atLevel = Math.abs(lo - X.e50[i]) <= z || Math.abs(lo - X.ll[i - 1]) <= z;
      if (engulf && atLevel && b.c > X.e200[i] && X.r[i] < p.rsiMax) return go(st, i, 'bullish engulfing at support in an uptrend', b.c, lo - 0.2 * X.a[i], p.rr);
      return null;
    },
  });
  add('pro_smc', {
    name: '★ SMC Sweep + Discount', cat: 'Smart Money (SMC)', pro: true,
    desc: PRO + 'Confluence entry. Price sweeps a confirmed swing low (sell-side liquidity), closes back above it, sits in the discount half of the recent range, and higher-timeframe bias is bullish (above the 200 SMA). Stop under the sweep wick; target the last swing high (buy-side liquidity), capped at 1.5R so more trades get paid.',
    params: [P('L', 'Swing length', 5, 2, 12, 1), P('range', 'Range lookback', 60, 20, 200, 5), P('minRR', 'Min reward : risk', 1, 0.5, 4, 0.1), P('rr', 'Max R target', 1.5, 0.75, 5, 0.25)],
    opt: { L: [3, 5, 8], minRR: [1, 1.5] },
    prepare: (c, p) => ({ sw: I.swings(c, p.L), t: I.sma(c.map((x) => x.c), 200), hh: I.rollMax(c.map((x) => x.h), p.range), ll: I.rollMin(c.map((x) => x.l), p.range), a: I.atr(c, 14) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, sw = X.sw, b = c[i];
      if (ctx.pos || !fin(sw.slVal[i]) || !fin(X.t[i]) || st.swept === sw.slIdx[i]) return null;
      const eq = (X.hh[i] + X.ll[i]) / 2;
      if (b.l < sw.slVal[i] && b.c > sw.slVal[i] && b.c < eq && b.c > X.t[i] * 0.97) {
        st.swept = sw.slIdx[i]; const sl = b.l - 0.25 * X.a[i], risk = b.c - sl, tgt = fin(sw.shVal[i]) && sw.shVal[i] > b.c ? sw.shVal[i] : null;
        if (tgt && (tgt - b.c) / risk >= p.minRR) return go(st, i, `swept ${fp(sw.slVal[i])} in discount → target liquidity ${fp(Math.min(tgt, b.c + p.rr * risk))}`, b.c, sl, 0, Math.min(tgt, b.c + p.rr * risk));
        if (!tgt) return go(st, i, `swept ${fp(sw.slVal[i])} in discount`, b.c, sl, p.rr);
      }
      return null;
    },
  });
  add('pro_dca', {
    name: '★ Smart DCA (dips in uptrends)', cat: 'Bots', pro: true,
    desc: PRO + 'DCA that only buys when it pays to: price below the 20 SMA (a dip) but above the 200 SMA (still an uptrend). Buys double when RSI is under 30, caps the number of buys, and takes profit above the average cost. Fewer, better-priced entries than a blind DCA.',
    params: [P('every', 'Min bars between buys', 6, 1, 200, 1), P('usd', 'USD per buy', 200, 5, 1e6, 5), P('max', 'Max buys per cycle', 8, 1, 50, 1), P('tp', 'Take-profit %', 4, 0.5, 50, 0.5)],
    opt: { every: [3, 6, 12], tp: [2, 4, 8] },
    prepare: (c) => { const cl = c.map((x) => x.c); return { f: I.sma(cl, 20), t: I.sma(cl, 200), r: I.rsi(cl, 14) }; },
    onExit: (st) => { st.k = 0; st.last = -1e9; },
    onBar: (i, X, c, ctx) => {
      const p = ctx.params, st = ctx.state, b = c[i]; if (st.k == null) { st.k = 0; st.last = -1e9; }
      if (ctx.pos && b.c >= ctx.pos.avg * (1 + p.tp / 100)) { st.k = 0; st.last = -1e9; return sell(`take-profit ${p.tp}% above average cost`); }
      if (!fin(X.t[i]) || st.k >= p.max || i - st.last < p.every) return null;
      if (b.c < X.f[i] && b.c > X.t[i]) { st.k++; st.last = i; const x2 = X.r[i] < 30; return [{ side: 'buy', usd: p.usd * (x2 ? 2 : 1), reason: `dip buy ${st.k}/${p.max}${x2 ? ' (RSI<30, double size)' : ''}` }]; }
      return null;
    },
  });

  /* ───────────── ★ Pro set 2 — robust, regime-aware systems built to hold up across bull, bear and sideways markets ─────────────
     Each one pairs an entry edge with a trend/regime filter, a hard stop and a trailing exit, and was stress-tested on
     bull, bear, sideways, crash-and-recovery and fat-tailed markets across many random seeds (see test/robust.test.js). */
  I.er = (a, p = 10) => a.map((v, i) => { if (i < p) return NaN; let path = 0; for (let k = i - p + 1; k <= i; k++) path += Math.abs(a[k] - a[k - 1]); return path ? Math.abs(v - a[i - p]) / path : 0; });
  I.kama = (a, p = 10, f = 2, s = 30) => {
    const e = I.er(a, p), fs = 2 / (f + 1), ss = 2 / (s + 1), o = nan(a.length);
    for (let i = p; i < a.length; i++) { const sc = (e[i] * (fs - ss) + ss) ** 2; o[i] = fin(o[i - 1]) ? o[i - 1] + sc * (a[i] - o[i - 1]) : a[i]; }
    return o;
  };
  I.rollMinC = (a, p) => a.map((_, i) => { if (i < p - 1) return NaN; let m = Infinity; for (let k = i - p + 1; k <= i; k++) if (a[k] < m) m = a[k]; return m; });
  I.rollMaxC = (a, p) => a.map((_, i) => { if (i < p - 1) return NaN; let m = -Infinity; for (let k = i - p + 1; k <= i; k++) if (a[k] > m) m = a[k]; return m; });
  // chandelier trail: checks the stop built from PREVIOUS bars first (no look-ahead), then ratchets it up with this bar
  function trailHit(st, b, atr, k) {
    if (st.tr != null && b.l <= st.tr) { const px = b.o < st.tr ? b.o : st.tr; st.tr = null; st.sl = st.tp = null; return sell(`trailing stop ${k}×ATR`, { px }); }
    if (fin(atr)) st.tr = Math.max(st.tr == null ? -Infinity : st.tr, b.h - k * atr);
    return null;
  }
  const fresh = (st) => { st.tr = null; };
  const P2 = 'Pro · robust: ';

  add('pro_ensemble', {
    name: '★ Ensemble Vote (5 models)', cat: 'Trend', pro: true,
    desc: P2 + 'Five independent, well-known signals each cast a vote: price above the 200 SMA, 3-month momentum, MACD histogram, Donchian midline and Supertrend. Buys when at least 4 agree and exits when 2 or fewer still do, or on a 3×ATR chandelier stop. Requiring agreement filters out most false signals, and the trailing stop keeps losses small in bear markets.',
    params: [P('enter', 'Votes to enter', 4, 3, 5, 1), P('exit', 'Exit at votes ≤', 2, 0, 3, 1), P('mom', 'Momentum bars', 63, 20, 252, 1), P('trail', 'Trail ATR×', 3, 1.5, 6, 0.5)],
    opt: { enter: [4, 5], exit: [1, 2], trail: [2.5, 3, 4] },
    prepare: (c, p) => { const cl = c.map((x) => x.c), dc = I.donchian(c, 50); return { s: I.sma(cl, 200), r: I.roc(cl, p.mom), m: I.macd(cl).hist, mid: dc.hi.map((h, i) => (h + dc.lo[i]) / 2), st: I.supertrend(c, 10, 3), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (!fin(X.s[i]) || !fin(X.r[i]) || !fin(X.mid[i])) return null;
      const v = (b.c > X.s[i]) + (X.r[i] > 0) + (X.m[i] > 0) + (b.c > X.mid[i]) + (X.st.up[i] === true);
      if (ctx.pos) { const t = trailHit(st, b, X.a[i], p.trail); if (t) return t; if (v <= p.exit) return sell(`only ${v}/5 models still bullish`); return null; }
      if (v >= p.enter) { fresh(st); return go(st, i, `${v}/5 models agree`, b.c, b.c - 2.5 * X.a[i], 0); }
      return null;
    },
  });
  add('pro_regime', {
    name: '★ Regime Switcher (trend ⇄ range)', cat: 'Trend', pro: true,
    desc: P2 + 'Detects the market regime with ADX and the efficiency ratio, then uses the playbook that fits it. In a strong trend it buys 20-bar breakouts and rides them with a trailing stop. In a quiet range it buys deep RSI(2) dips and sells the bounce. In a downtrend (below the 200 SMA with strong ADX) it stays in cash. This adapts to whatever the market is doing instead of hoping one style keeps working.',
    params: [P('adxT', 'Trend ADX above', 25, 15, 40, 1), P('adxR', 'Range ADX below', 20, 10, 30, 1), P('brk', 'Breakout bars', 20, 10, 60, 1), P('rsi', 'Range RSI(2) below', 10, 3, 25, 1), P('trail', 'Trail ATR×', 4, 1.5, 8, 0.5)],
    opt: { adxT: [22, 25, 30], brk: [20, 40], trail: [3, 4, 5] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { ad: I.adx(c, 14).adx, er: I.er(cl, 20), s: I.sma(cl, 200), s5: I.sma(cl, 5), r2: I.rsi(cl, 2), dc: I.donchian(c, p.brk), lo10: I.donchian(c, 10).lo, a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (!fin(X.ad[i]) || !fin(X.s[i]) || !fin(X.a[i])) return null;
      if (ctx.pos) {
        if (st.mode === 'trend') { const t = trailHit(st, b, X.a[i], p.trail); if (t) return t; if (b.c < X.s[i]) return sell('trend broke (below the 200 SMA)'); }
        else { if (b.c > X.s5[i] || X.r2[i] > 70) return sell('range bounce taken'); if (timeUp(st, i, 8)) return sell('time stop'); }
        return null;
      }
      const bear = b.c < X.s[i] && X.ad[i] > p.adxT;
      if (bear) return null;
      if (X.ad[i] > p.adxT && X.er[i] > 0.3 && b.c > X.s[i] && fin(X.dc.hi[i]) && b.c > X.dc.hi[i]) { st.mode = 'trend'; fresh(st); return go(st, i, `trend regime (ADX ${X.ad[i].toFixed(0)}): ${p.brk}-bar breakout`, b.c, b.c - 2.5 * X.a[i], 0); }
      if (X.ad[i] < p.adxR && b.c > X.s[i] * 0.97 && X.r2[i] < p.rsi) { st.mode = 'range'; return go(st, i, `range regime (ADX ${X.ad[i].toFixed(0)}): RSI(2) ${X.r2[i].toFixed(0)} dip`, b.c, b.c - 3 * X.a[i], 0); }
      return null;
    },
  });
  add('pro_kama', {
    name: '★ Kaufman Adaptive Trend (KAMA)', cat: 'Trend', pro: true,
    desc: P2 + 'Kaufman’s Adaptive Moving Average speeds up in clean trends and almost freezes in choppy markets, so it avoids most of the whipsaws that kill ordinary moving-average systems. Buys when price crosses above a rising KAMA while the efficiency ratio shows a real trend, and exits below KAMA minus 1 ATR or on the trailing stop.',
    params: [P('er', 'ER period', 10, 5, 30, 1), P('slow', 'Slow constant', 30, 15, 60, 1), P('erMin', 'Min efficiency', 0.3, 0.1, 0.7, 0.05), P('trail', 'Trail ATR×', 3.5, 1.5, 6, 0.5)],
    opt: { er: [10, 20], erMin: [0.25, 0.35], trail: [3, 4] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { k: I.kama(cl, p.er, 2, p.slow), e: I.er(cl, p.er), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (i < 2 || !fin(X.k[i - 1]) || !fin(X.a[i])) return null;
      if (ctx.pos) { const t = trailHit(st, b, X.a[i], p.trail); if (t) return t; if (b.c < X.k[i] - X.a[i]) return sell('closed below KAMA − 1 ATR'); return null; }
      if (c[i - 1].c <= X.k[i - 1] && b.c > X.k[i] && X.k[i] > X.k[i - 1] && X.e[i] >= p.erMin) { fresh(st); return go(st, i, `crossed above rising KAMA (ER ${X.e[i].toFixed(2)})`, b.c, b.c - 2.5 * X.a[i], 0); }
      return null;
    },
  });
  add('pro_tsmom', {
    name: '★ Time-Series Momentum', cat: 'Momentum', pro: true,
    desc: P2 + 'The most-studied trend effect in finance (Moskowitz, Ooi & Pedersen): assets that rose over the past months tend to keep rising, across stocks, bonds, commodities and crypto. Holds while the lookback return is positive and price is above its average, steps aside when momentum turns negative. Few trades, small losses in crashes, big gains in long trends.',
    params: [P('look', 'Lookback bars', 126, 20, 300, 1), P('fast', 'Confirm SMA', 50, 10, 200, 5), P('trail', 'Trail ATR×', 4, 2, 8, 0.5)],
    opt: { look: [63, 126, 200], trail: [3, 4, 6] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { r: I.roc(cl, p.look), s: I.sma(cl, p.fast), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const p = ctx.params, st = ctx.state, b = c[i]; if (!fin(X.r[i]) || !fin(X.s[i])) return null;
      if (ctx.pos) { const t = trailHit(st, b, X.a[i], p.trail); if (t) return t; if (X.r[i] < 0 || b.c < X.s[i]) return sell(X.r[i] < 0 ? 'momentum turned negative' : `fell below the ${p.fast} SMA`); return null; }
      if (X.r[i] > 0 && b.c > X.s[i]) { fresh(st); return buy(`${p.look}-bar return +${X.r[i].toFixed(1)}% and above the ${p.fast} SMA`); }
      return null;
    },
  });
  add('pro_double7', {
    name: '★ Connors Double 7s', cat: 'Mean Reversion', pro: true,
    desc: P2 + 'Published by Larry Connors: in an uptrend, buy a 7-bar closing low and sell at the next 7-bar closing high. Simple, very few parameters (so little room to overfit), with a disaster stop and time stop added for safety.',
    params: [P('n', 'Lookback bars', 7, 3, 20, 1), P('trend', 'Trend SMA', 200, 50, 400, 10), P('stop', 'Disaster stop ATR×', 3, 1, 8, 0.5), P('maxBars', 'Max bars held', 12, 3, 60, 1)],
    opt: { n: [5, 7, 10], trend: [100, 200] },
    prepare: (c, p) => { const cl = c.map((x) => x.c); return { t: I.sma(cl, p.trend), lo: I.rollMinC(cl, p.n), hi: I.rollMaxC(cl, p.n), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (b.c >= X.hi[i]) return sell(`${p.n}-bar closing high`); if (timeUp(st, i, p.maxBars)) return sell('time stop'); return null; }
      if (fin(X.t[i]) && fin(X.a[i]) && b.c > X.t[i] && b.c <= X.lo[i]) return go(st, i, `${p.n}-bar closing low above the ${p.trend} SMA`, b.c, b.c - p.stop * X.a[i], 0);
      return null;
    },
  });
  add('pro_cumrsi', {
    name: '★ Cumulative RSI (Connors)', cat: 'Mean Reversion', pro: true,
    desc: P2 + 'Adds up the last 2 readings of RSI(2). When that sum drops below 35 in an uptrend the market is stretched to the downside, and it usually snaps back within days. Exits when RSI(2) recovers above 65. One of the highest win-rate published rules, with a trend filter and stops so it doesn’t catch falling knives.',
    params: [P('sum', 'Sum below', 35, 10, 60, 1), P('exit', 'Exit RSI(2) above', 65, 50, 90, 1), P('trend', 'Trend SMA', 200, 50, 400, 10), P('stop', 'Disaster stop ATR×', 3, 1, 8, 0.5)],
    opt: { sum: [25, 35, 45], exit: [60, 70] },
    prepare: (c, p) => { const cl = c.map((x) => x.c), r = I.rsi(cl, 2); return { r, cr: r.map((v, i) => (i > 0 && fin(v) && fin(r[i - 1]) ? v + r[i - 1] : NaN)), t: I.sma(cl, p.trend), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (X.r[i] > p.exit) return sell(`RSI(2) back above ${p.exit}`); if (timeUp(st, i, 10)) return sell('time stop'); return null; }
      if (fin(X.cr[i]) && fin(X.t[i]) && fin(X.a[i]) && b.c > X.t[i] && X.cr[i] < p.sum) return go(st, i, `cumulative RSI(2) ${X.cr[i].toFixed(0)}`, b.c, b.c - p.stop * X.a[i], 0);
      return null;
    },
  });
  add('pro_turtle2', {
    name: '★ Turtle System 2 (55/20, 2N)', cat: 'Breakout', pro: true,
    desc: P2 + 'The Turtle Traders’ long-term system: buy a 55-bar breakout, stop out 2 ATR (“2N”) below entry, and exit on a 20-bar low. It loses small and often in ranges but catches every big trend, which is what made the Turtles famous. A 200 SMA filter skips breakouts inside bear markets.',
    params: [P('entry', 'Breakout bars', 55, 20, 120, 1), P('exit', 'Exit low bars', 20, 5, 60, 1), P('n', 'Stop N×ATR', 2, 1, 5, 0.5), P('filter', 'Trend filter SMA (0=off)', 200, 0, 400, 10)],
    opt: { entry: [40, 55], exit: [10, 20], n: [2, 3] },
    prepare: (c, p) => ({ hi: I.donchian(c, p.entry).hi, lo: I.donchian(c, p.exit).lo, a: I.atr(c, 20), s: p.filter ? I.sma(c.map((x) => x.c), p.filter) : null }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (ctx.pos) { if (fin(X.lo[i]) && b.c < X.lo[i]) return sell(`${p.exit}-bar low`); return null; }
      if (fin(X.hi[i]) && fin(X.a[i]) && b.c > X.hi[i] && (!X.s || (fin(X.s[i]) && b.c > X.s[i]))) return go(st, i, `${p.entry}-bar breakout`, b.c, b.c - p.n * X.a[i], 0);
      return null;
    },
  });
  add('pro_macdz', {
    name: '★ MACD Trend Pullback', cat: 'Momentum', pro: true,
    desc: P2 + 'Waits for a healthy uptrend (price above the 200 EMA and MACD above zero), then buys the moment the histogram turns back up after a pullback. That enters with the trend at a better price than chasing. Stop below the recent swing, then a trailing stop lets winners run (an optional fixed target is available).',
    params: [P('trend', 'Trend EMA', 200, 50, 400, 10), P('rr', 'Target R (0 = trail only)', 0, 0, 6, 0.5), P('trail', 'Trail ATR×', 4, 1.5, 8, 0.5)],
    opt: { trend: [100, 200], rr: [0, 3], trail: [3, 4, 5] },
    prepare: (c, p) => { const cl = c.map((x) => x.c), md = I.macd(cl); return { t: I.ema(cl, p.trend), m: md.macd, h: md.hist, lo: I.donchian(c, 10).lo, a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (i < 2 || !fin(X.t[i]) || !fin(X.h[i - 1]) || !fin(X.a[i])) return null;
      if (ctx.pos) { const t = trailHit(st, b, X.a[i], p.trail); if (t) return t; if (b.c < X.t[i]) return sell('closed below the trend EMA'); return null; }
      if (b.c > X.t[i] && X.m[i] > 0 && X.h[i - 1] < 0 && X.h[i] > X.h[i - 1]) { fresh(st); const sl = Math.min(fin(X.lo[i]) ? X.lo[i] : b.c - 2 * X.a[i], b.c - 1 * X.a[i]); return go(st, i, 'MACD histogram turned up in an uptrend', b.c, sl, p.rr); }
      return null;
    },
  });
  add('pro_keltpb', {
    name: '★ Keltner Trend Pullback', cat: 'Trend', pro: true,
    desc: P2 + 'Only trades strong, aligned trends (EMA 50 above EMA 200, both rising). Buys when price dips to the lower Keltner band (EMA 20 − 1.5 ATR) and closes back above it, a classic “buy the dip in a trend” setup. Exits at a stretched upper band (EMA 20 + 4 ATR) or when price closes well below the EMA 50.',
    params: [P('mult', 'Entry band ATR×', 1.5, 0.5, 3, 0.25), P('tpMult', 'Exit band ATR×', 4, 1, 8, 0.5), P('stop', 'Stop ATR×', 2.5, 1, 5, 0.5)],
    opt: { mult: [1, 1.5, 2], tpMult: [3, 4, 6] },
    prepare: (c) => { const cl = c.map((x) => x.c); return { e20: I.ema(cl, 20), e50: I.ema(cl, 50), e200: I.ema(cl, 200), a: I.atr(c, 14) }; },
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (i < 5 || !fin(X.e200[i]) || !fin(X.a[i])) return null;
      const lower = X.e20[i] - p.mult * X.a[i], upper = X.e20[i] + p.tpMult * X.a[i];
      if (ctx.pos) { if (b.h >= upper) return sell(`reached EMA 20 + ${p.tpMult} ATR`, { px: Math.max(b.o, upper) }); if (b.c < X.e50[i] - 0.5 * X.a[i]) return sell('closed well below the EMA 50'); return null; }
      if (X.e50[i] > X.e200[i] && X.e50[i] > X.e50[i - 5] && X.e200[i] > X.e200[i - 5] && b.l <= lower && b.c > lower) return go(st, i, 'dip to the lower Keltner band in an aligned uptrend', b.c, b.c - p.stop * X.a[i], 0);
      return null;
    },
  });
  add('pro_vcp', {
    name: '★ Volatility Contraction Breakout', cat: 'Breakout', pro: true,
    desc: P2 + 'Volatility moves in cycles: quiet, tight markets lead to big moves. Waits for short-term volatility to shrink well below its long-term level, then buys the breakout above the recent high on above-average volume. Stop under the base, then a trailing stop rides the expansion.',
    params: [P('ratio', 'ATR(10)/ATR(50) below', 0.9, 0.4, 1.2, 0.05), P('brk', 'Breakout bars', 20, 10, 60, 1), P('vol', 'Volume × average', 1.1, 0.5, 3, 0.1), P('trail', 'Trail ATR×', 3, 1.5, 6, 0.5)],
    opt: { ratio: [0.75, 0.9, 1], brk: [15, 20, 30] },
    prepare: (c, p) => ({ a10: I.atr(c, 10), a50: I.atr(c, 50), dc: I.donchian(c, p.brk), lo: I.donchian(c, 10).lo, va: I.sma(c.map((x) => x.v), 20), s: I.sma(c.map((x) => x.c), 100) }),
    onBar: (i, X, c, ctx) => {
      const m = manage(i, c, ctx); if (m) return m; const p = ctx.params, st = ctx.state, b = c[i];
      if (i < 2 || !fin(X.a50[i - 1]) || !fin(X.dc.hi[i]) || !fin(X.s[i])) return null;
      if (ctx.pos) { const t = trailHit(st, b, X.a10[i], p.trail); if (t) return t; return null; }
      const tight = X.a10[i - 1] / X.a50[i - 1] < p.ratio, vOK = !(X.va[i] > 0) || b.v >= p.vol * X.va[i];
      if (tight && vOK && b.c > X.dc.hi[i] && b.c > X.s[i]) { fresh(st); return go(st, i, `breakout after volatility contraction (ATR ratio ${(X.a10[i - 1] / X.a50[i - 1]).toFixed(2)})`, b.c, Math.min(fin(X.lo[i]) ? X.lo[i] : b.c * 0.95, b.c - X.a10[i]), 0); }
      return null;
    },
  });
  NT.STRAT_CATS = ['Smart Money (SMC)', 'Trend', 'Momentum', 'Mean Reversion', 'Breakout', 'Volume', 'Price Action', 'Bots', 'On-chain'];
  return NT;
})(typeof module === 'object' && module.exports ? require('./core.js') : self.NT);
if (typeof module === 'object' && module.exports) module.exports = require('./core.js');
