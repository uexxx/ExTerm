/* ExTerm v15 phase 5 core: pure logic for the institutional desk. DOM ladder rows and click-to-order mapping, CVD and
   footprint bins, options (Yahoo chain parsing, Black-Scholes, max pain, GEX, paper options book), synthetic ratio
   candles, correlation guard, isolated paper sub-wallets, whale tape, smart-money wallet profiler, MTF trend matrix,
   auto-fibs, PDH/PDL, volume profile (POC / value area), US equity sessions, walk-forward optimisation, Monte Carlo,
   a Pine Script v5 importer (to the safe no-code spec format), the multi-exchange arbitrage scanner, liquidation
   bands, BroadcastChannel message checks, offline replay packs and encrypted .exterm backups (PBKDF2 + AES-GCM).
   No DOM and no network here: everything is unit-tested in Node (test/v15p5.test.js). */
const P5 = (() => {
  const N = typeof NT !== 'undefined' ? NT : require('./core.js');
  const P = {}, fin = Number.isFinite;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const STR = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, n);
  const num = (v) => { const x = +v; return fin(x) ? x : null; };
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)) : 0; };

  /* ══ 1. order flow ══ */
  /* DOM ladder: levels bucketed to `tick`, `rows` prices centred on the mid, with bid / ask size at each level */
  P.ladder = (book, tick, rows = 24) => {
    const bids = (book && book.bids) || [], asks = (book && book.asks) || [];
    const bb = bids.length ? Math.max(...bids.map((x) => +x[0])) : null, ba = asks.length ? Math.min(...asks.map((x) => +x[0])) : null;
    if (!(bb > 0) || !(ba > 0) || !(tick > 0)) return { rows: [], mid: null };
    const mid = (bb + ba) / 2, q = (p) => Math.round(p / tick), bk = new Map();
    for (const [p, s] of bids) { const k = q(+p), r = bk.get(k) || { bid: 0, ask: 0 }; r.bid += +s || 0; bk.set(k, r); }
    for (const [p, s] of asks) { const k = q(+p), r = bk.get(k) || { bid: 0, ask: 0 }; r.ask += +s || 0; bk.set(k, r); }
    const top = q(mid) + Math.floor(rows / 2), out = [];
    for (let i = 0; i < rows; i++) { const k = top - i, r = bk.get(k) || { bid: 0, ask: 0 }; out.push({ p: +(k * tick).toFixed(10), bid: r.bid, ask: r.ask }); }
    const mx = Math.max(1e-12, ...out.map((r) => Math.max(r.bid, r.ask)));
    for (const r of out) { r.bw = r.bid / mx; r.aw = r.ask / mx; }
    return { rows: out, mid, bb, ba };
  };
  /* click-to-trade: the bid column buys, the ask column sells; resting side of the market = limit, through it = stop */
  P.ladderOrder = (price, side, bb, ba) => {
    if (!(price > 0) || !(bb > 0) || !(ba > 0)) return null;
    if (side === 'buy') return { side: 'buy', type: price <= ba ? 'limit' : 'stop', price };
    if (side === 'sell') return { side: 'sell', type: price >= bb ? 'limit' : 'stop', price };
    return null;
  };
  /* tick-rule aggressor side for a tape: +1 buy, −1 sell (zero ticks keep the last side) */
  P.sides = (trades) => { let prev = null, s = 0; return (trades || []).map((x) => { if (prev != null) { if (x.p > prev) s = 1; else if (x.p < prev) s = -1; } prev = x.p; return s; }); };
  /* CVD per bar: delta = aggressive buy volume − sell volume inside each candle, cvd = running sum */
  P.cvd = (trades, candles, tf) => {
    const sd0 = P.sides(trades), by = new Map();
    (trades || []).forEach((x, i) => { if (!sd0[i]) return; const b = Math.floor(x.t / tf) * tf; by.set(b, (by.get(b) || 0) + sd0[i] * (x.q > 0 ? x.q : 1)); });
    let run = 0; return (candles || []).map((k) => { const d = by.get(k.t) || 0; run += d; return { t: k.t, delta: d, cvd: run }; });
  };
  /* footprint: for one bar, bid × ask volume at each price bucket, plus diagonal 3:1 imbalances */
  P.footprint = (trades, barT, tf, tick) => {
    const sd0 = P.sides(trades), lv = new Map();
    (trades || []).forEach((x, i) => {
      if (x.t < barT || x.t >= barT + tf || !sd0[i]) return;
      const k = Math.round(x.p / tick), r = lv.get(k) || { bid: 0, ask: 0 }; if (sd0[i] > 0) r.ask += x.q > 0 ? x.q : 1; else r.bid += x.q > 0 ? x.q : 1; lv.set(k, r);
    });
    const rows = [...lv.entries()].sort((a, b) => b[0] - a[0]).map(([k, r]) => ({ p: +(k * tick).toFixed(10), bid: r.bid, ask: r.ask, delta: r.ask - r.bid }));
    for (let i = 0; i < rows.length; i++) { const below = rows[i + 1]; rows[i].imb = below && below.bid > 0 && rows[i].ask / below.bid >= 3 ? 'buy' : below && rows[i].ask > 0 && below.bid / rows[i].ask >= 3 ? 'sell' : null; }
    return { rows, delta: sum(rows.map((r) => r.delta)), poc: rows.length ? rows.reduce((a, b) => (a.bid + a.ask >= b.bid + b.ask ? a : b)).p : null };
  };
  /* whale tape: trades of at least minUsd with their aggressor side, newest first */
  P.whales = (trades, minUsd, max = 50) => { const s = P.sides(trades), out = []; (trades || []).forEach((x, i) => { const usd = x.p * (x.q || 0); if (usd >= minUsd) out.push({ t: x.t, p: x.p, q: x.q, usd, side: s[i] > 0 ? 'buy' : s[i] < 0 ? 'sell' : '—' }); }); return out.reverse().slice(0, max); };

  /* ══ 2. options ══ */
  const ncdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp((-x * x) / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? 1 - p : p; };
  const npdf = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
  P.bs = (S, K, T, r, iv, type) => {
    if (!(S > 0) || !(K > 0)) return { price: 0, delta: 0, gamma: 0 };
    if (!(T > 0) || !(iv > 0)) { const intr = type === 'put' ? Math.max(0, K - S) : Math.max(0, S - K); return { price: intr, delta: type === 'put' ? (S < K ? -1 : 0) : S > K ? 1 : 0, gamma: 0 }; }
    const v = iv * Math.sqrt(T), d1 = (Math.log(S / K) + (r + (iv * iv) / 2) * T) / v, d2 = d1 - v, df = Math.exp(-r * T);
    const price = type === 'put' ? K * df * ncdf(-d2) - S * ncdf(-d1) : S * ncdf(d1) - K * df * ncdf(d2);
    return { price, delta: type === 'put' ? ncdf(d1) - 1 : ncdf(d1), gamma: npdf(d1) / (S * v) };
  };
  /* Yahoo v7 options JSON → clean chain (trust boundary: plain numbers, capped arrays) */
  P.parseYahoo = (j) => {
    const r = j && j.optionChain && Array.isArray(j.optionChain.result) && j.optionChain.result[0]; if (!r) return null;
    const q = r.quote || {}, o = (Array.isArray(r.options) && r.options[0]) || {}, leg = (x) => ({ strike: num(x.strike), bid: num(x.bid) || 0, ask: num(x.ask) || 0, last: num(x.lastPrice) || 0, oi: Math.max(0, num(x.openInterest) || 0), vol: Math.max(0, num(x.volume) || 0), iv: num(x.impliedVolatility) || 0, contract: STR(x.contractSymbol, 32).replace(/[^A-Z0-9]/g, '') });
    const ok = (x) => x.strike > 0;
    return { sym: STR(q.symbol, 12).toUpperCase().replace(/[^A-Z0-9.^-]/g, ''), spot: num(q.regularMarketPrice), exps: (Array.isArray(r.expirationDates) ? r.expirationDates : []).map(num).filter((x) => x > 0).slice(0, 40), exp: num(o.expirationDate), calls: (Array.isArray(o.calls) ? o.calls : []).slice(0, 400).map(leg).filter(ok), puts: (Array.isArray(o.puts) ? o.puts : []).slice(0, 400).map(leg).filter(ok) };
  };
  /* max pain: the expiry price at which option holders' total intrinsic value (writers' payout) is smallest */
  P.maxPain = (chain) => {
    const ks = [...new Set([...(chain.calls || []), ...(chain.puts || [])].map((x) => x.strike))].sort((a, b) => a - b); if (!ks.length) return null;
    let best = null;
    for (const S of ks) { let pay = 0; for (const c of chain.calls || []) pay += Math.max(0, S - c.strike) * c.oi; for (const p of chain.puts || []) pay += Math.max(0, p.strike - S) * p.oi; if (!best || pay < best.pay) best = { strike: S, pay }; }
    return best.strike;
  };
  /* dealer gamma exposure per strike ($ per 1 % move, dealers long calls / short puts convention), total and flip */
  P.gex = (chain, spot, T, r = 0.04) => {
    const m = new Map(), add = (k, v) => m.set(k, (m.get(k) || 0) + v);
    for (const c of chain.calls || []) add(c.strike, P.bs(spot, c.strike, T, r, c.iv || 0.5, 'call').gamma * c.oi * 100 * spot * spot * 0.01);
    for (const p of chain.puts || []) add(p.strike, -P.bs(spot, p.strike, T, r, p.iv || 0.5, 'put').gamma * p.oi * 100 * spot * spot * 0.01);
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([strike, g]) => ({ strike, g }));
    let run = 0, flip = null; for (let i = 0; i < rows.length; i++) { const prev = run; run += rows[i].g; if (i && Math.sign(prev) !== Math.sign(run) && prev !== 0) flip = rows[i].strike; }
    const wall = (sgn) => rows.filter((x) => sgn * x.g > 0).sort((a, b) => sgn * (b.g - a.g))[0];
    return { rows, total: run, flip, callWall: (wall(1) || {}).strike || null, putWall: (wall(-1) || {}).strike || null };
  };
  /* paper options: positions [{id, sym, type, strike, exp, qty, prem}] marked with a price function */
  P.optMark = (pos, markOf) => { const m = markOf(pos); return { mark: m, value: m * pos.qty * 100, pnl: (m - pos.prem) * pos.qty * 100 }; };
  P.optOrder = (o, cash) => {
    const qty = Math.floor(+o.qty), prem = +o.prem, type = o.type === 'put' ? 'put' : o.type === 'call' ? 'call' : null;
    if (!type || !(qty >= 1 && qty <= 1000) || !(prem > 0) || !(+o.strike > 0) || !(+o.exp > 0)) return { ok: false, err: 'Invalid option order' };
    const cost = qty * prem * 100; if (cost > cash) return { ok: false, err: 'Not enough paper cash' };
    return { ok: true, cost, pos: { sym: STR(o.sym, 12), type, strike: +o.strike, exp: +o.exp, qty, prem } };
  };

  /* ══ 3. ratio charts, correlation, sub-wallets, broadcast ══ */
  P.ratio = (a, b) => {
    const mb = new Map((b || []).map((k) => [k.t, k])), out = [];
    for (const x of a || []) { const y = mb.get(x.t); if (!y || !(y.o > 0) || !(y.c > 0)) continue; const o = x.o / y.o, c = x.c / y.c; out.push({ t: x.t, o, h: Math.max(o, c, x.h / y.h), l: Math.min(o, c, x.l / y.l), c, v: 0 }); }
    return out;
  };
  P.rets = (c) => { const r = []; for (let i = 1; i < (c || []).length; i++) if (c[i - 1].c > 0) r.push(Math.log(c[i].c / c[i - 1].c)); return r; };
  P.corr = (x, y) => { const n = Math.min(x.length, y.length); if (n < 10) return null; const a = x.slice(-n), b = y.slice(-n), ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : null; };
  /* cross-bot guard: block a new long when it is ≥ max correlated with what is already held */
  P.corrGuard = (cand, held, max = 0.85) => {
    let worst = null;
    for (const h of held || []) { if (h.sym === cand.sym) continue; const r = P.corr(cand.rets, h.rets); if (r != null && (!worst || r > worst.r)) worst = { sym: h.sym, r }; }
    return { ok: !worst || worst.r < max, worst };
  };
  /* isolated paper sub-wallets: carve paper cash out of the main account, never more than it holds */
  P.subCreate = (wallets, name, usd, mainCash) => {
    const n = STR(name, 24).replace(/[<>"'`&\\]/g, ''), amt = +usd, list = Array.isArray(wallets) ? wallets : [];
    if (n.length < 2) return { ok: false, err: 'Name the sub-wallet (2–24 characters)' };
    if (list.some((w) => w.name.toLowerCase() === n.toLowerCase())) return { ok: false, err: 'A sub-wallet with that name exists' };
    if (list.length >= 12) return { ok: false, err: 'At most 12 sub-wallets' };
    if (!(amt >= 10) || amt > mainCash) return { ok: false, err: 'Allocate between $10 and your free paper cash' };
    return { ok: true, wallet: { id: 'sw_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: n, alloc: amt, cash: amt, bots: [] } };
  };
  P.subClose = (w) => ({ refund: Math.max(0, +w.cash || 0) });
  /* BroadcastChannel pop-outs: only these message shapes are accepted from other windows */
  P.bcMsg = (m) => {
    if (!m || typeof m !== 'object' || m.v !== 1) return null;
    const sym = STR(m.sym, 100), tf = typeof m.tf === 'string' && Object.prototype.hasOwnProperty.call(N.TF, m.tf) ? m.tf : null;
    if (m.k === 'sym' && sym && /^[A-Za-z0-9:._^\-]{1,100}$/.test(sym)) return { k: 'sym', sym, tf, from: STR(m.from, 16) };
    if (m.k === 'cross' && fin(+m.t)) return { k: 'cross', t: +m.t, from: STR(m.from, 16) };
    if (m.k === 'hello' || m.k === 'bye') return { k: m.k, from: STR(m.from, 16) };
    return null;
  };

  /* ══ 5. smart-money wallet profiler ══ */
  /* trades [{ts, side, token, qty, usd}] → FIFO round trips, win rate, holding time, style */
  P.profile = (trades) => {
    const lots = new Map(), trips = []; let vol = 0;
    for (const x of (trades || []).filter((x) => x && x.token && x.qty > 0 && x.usd > 0).sort((a, b) => a.ts - b.ts)) {
      vol += x.usd; const q = lots.get(x.token) || [];
      if (x.side === 'buy') { q.push({ qty: x.qty, px: x.usd / x.qty, ts: x.ts }); lots.set(x.token, q); continue; }
      let left = x.qty; const px = x.usd / x.qty;
      while (left > 1e-12 && q.length) { const l = q[0], take = Math.min(left, l.qty); trips.push({ token: x.token, pnl: (px - l.px) * take, ret: px / l.px - 1, hold: x.ts - l.ts }); l.qty -= take; left -= take; if (l.qty <= 1e-12) q.shift(); }
    }
    const wins = trips.filter((t) => t.pnl > 0), holdMin = trips.length ? mean(trips.map((t) => t.hold)) / 60 : null;
    const byTok = {}; for (const t of trips) byTok[t.token] = (byTok[t.token] || 0) + t.pnl;
    const style = !trips.length ? 'accumulating' : holdMin < 30 ? 'sniper / scalper' : holdMin < 60 * 24 ? 'day trader' : holdMin < 60 * 24 * 14 ? 'swing trader' : 'long-term holder';
    return { trips: trips.length, winRate: trips.length ? wins.length / trips.length : null, realized: sum(trips.map((t) => t.pnl)), avgRet: trips.length ? mean(trips.map((t) => t.ret)) : null, holdMin, volume: vol, style, best: Object.entries(byTok).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([token, pnl]) => ({ token, pnl })) };
  };

  /* ══ 6. chart intelligence ══ */
  P.trend = (c) => {
    if (!c || c.length < 55) return 0;
    const cl = c.map((x) => x.c), e20 = N.ind.ema(cl, 20), e50 = N.ind.ema(cl, 50), i = c.length - 1, s = e20[i] - e20[i - 5];
    return cl[i] > e20[i] && e20[i] > e50[i] && s > 0 ? 1 : cl[i] < e20[i] && e20[i] < e50[i] && s < 0 ? -1 : 0;
  };
  P.mtf = (byTf) => { const rows = Object.entries(byTf || {}).map(([tf, c]) => ({ tf, dir: P.trend(c) })); const score = sum(rows.map((r) => r.dir)); return { rows, score, bias: score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'mixed' }; };
  /* auto-fibs: the last significant swing (pivot high / low over `w` bars) inside the lookback */
  P.autoFib = (c, look = 150, w = 5) => {
    const a = (c || []).slice(-look); if (a.length < w * 2 + 3) return null;
    let hi = -Infinity, hiI = -1, lo = Infinity, loI = -1;
    for (let i = 0; i < a.length; i++) { if (a[i].h > hi) { hi = a[i].h; hiI = i; } if (a[i].l < lo) { lo = a[i].l; loI = i; } }
    const up = loI < hiI, R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return { up, hi, lo, t1: a[up ? loI : hiI].t, t2: a[up ? hiI : loI].t, levels: R.map((r) => ({ r, p: up ? hi - (hi - lo) * r : lo + (hi - lo) * r })) };
  };
  /* previous session high / low / close (UTC days for crypto; pass tzOffsetSec for an exchange day) */
  P.prevDay = (c, tzOff = 0) => {
    if (!c || c.length < 2) return null;
    const day = (t) => Math.floor((t + tzOff) / 86400), today = day(c[c.length - 1].t), prev = c.filter((k) => day(k.t) === today - 1).length ? today - 1 : Math.max(...c.filter((k) => day(k.t) < today).map((k) => day(k.t)));
    const d = c.filter((k) => day(k.t) === prev); if (!d.length) return null;
    return { pdh: Math.max(...d.map((k) => k.h)), pdl: Math.min(...d.map((k) => k.l)), pdc: d[d.length - 1].c };
  };
  /* volume profile (VPVR): volume spread across each bar's range, POC = busiest bin, value area = 70 % around it */
  P.vpvr = (c, bins = 40) => {
    if (!c || !c.length) return null;
    const lo = Math.min(...c.map((k) => k.l)), hi = Math.max(...c.map((k) => k.h)), step = (hi - lo) / bins || hi * 1e-4 || 1, v = new Array(bins).fill(0);
    for (const k of c) { const a = clamp(Math.floor((k.l - lo) / step), 0, bins - 1), b = clamp(Math.floor((k.h - lo) / step), 0, bins - 1), per = (k.v || 0) / (b - a + 1); for (let i = a; i <= b; i++) v[i] += per; }
    let poc = 0; for (let i = 1; i < bins; i++) if (v[i] > v[poc]) poc = i;
    const tot = sum(v); let inV = v[poc], L = poc, H = poc;
    while (inV < tot * 0.7 && (L > 0 || H < bins - 1)) { const dn = L > 0 ? v[L - 1] : -1, upv = H < bins - 1 ? v[H + 1] : -1; if (upv >= dn) inV += v[++H]; else inV += v[--L]; }
    return { lo, step, bins: v.map((x, i) => ({ p0: lo + i * step, p1: lo + (i + 1) * step, v: x })), poc: lo + (poc + 0.5) * step, vah: lo + (H + 1) * step, val: lo + L * step };
  };
  /* US equity sessions in New York time (DST: 2nd Sunday of March to 1st Sunday of November) */
  const nthSun = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + (n - 1) * 7; };
  P.nyOffset = (tSec) => { const d = new Date(tSec * 1000), y = d.getUTCFullYear(), s = Date.UTC(y, 2, nthSun(y, 2, 2), 7) / 1000, e = Date.UTC(y, 10, nthSun(y, 10, 1), 6) / 1000; return tSec >= s && tSec < e ? -4 * 3600 : -5 * 3600; };
  P.session = (tSec) => {
    const lt = tSec + P.nyOffset(tSec), dow = new Date(lt * 1000).getUTCDay(), m = Math.floor((((lt % 86400) + 86400) % 86400) / 60);
    if (dow === 0 || dow === 6) return 'closed';
    return m >= 240 && m < 570 ? 'pre' : m >= 570 && m < 960 ? 'rth' : m >= 960 && m < 1200 ? 'post' : 'closed';
  };
  /* scheduled FOMC decision days 2026 (Federal Reserve calendar); earnings + Form 4 markers come from live data */
  P.FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
  P.events = (o) => {
    const out = P.FOMC_2026.map((d) => ({ t: Date.parse(d + 'T18:00:00Z') / 1000, k: 'fomc', l: 'FOMC rate decision' }));
    for (const e of (o && o.earnings) || []) if (fin(+e.t)) out.push({ t: +e.t, k: 'earn', l: STR(e.l || 'Earnings', 40) });
    for (const f of (o && o.form4) || []) if (fin(+f.t)) out.push({ t: +f.t, k: 'f4', l: STR(f.l || 'Form 4', 60) });
    return out.sort((a, b) => a.t - b.t);
  };

  /* ══ 7. quant lab ══ */
  /* walk-forward: optimise on each in-sample window over a small grid, then test the winner out of sample */
  P.walkForward = (c, strat, grid, o = {}) => {
    const folds = clamp(o.folds | 0 || 4, 2, 10), isFrac = clamp(+o.isFrac || 0.7, 0.5, 0.9), n = c.length, size = Math.floor(n / folds), res = [];
    const bt = (cs, p) => N.backtest(cs, strat, p, { cash: 10000, fee: o.fee != null ? o.fee : 0.001, slip: 0, tfSec: o.tfSec || 3600 });
    for (let f = 0; f < folds; f++) {
      const seg = c.slice(f * size, f === folds - 1 ? n : (f + 1) * size), cut = Math.floor(seg.length * isFrac); if (cut < 60 || seg.length - cut < 20) continue;
      let best = null; for (const p of grid) { const r = bt(seg.slice(0, cut), p), ret = r.eq.length ? r.eq[r.eq.length - 1] / 10000 - 1 : 0; if (!best || ret > best.ret) best = { p, ret }; }
      const oos = bt(seg, best.p), fromT = seg[cut].t, i0 = oos.t.findIndex((t) => t >= fromT), e0 = oos.eq[Math.max(0, i0 - 1)] || 10000, ret = oos.eq[oos.eq.length - 1] / e0 - 1;
      res.push({ fold: f + 1, params: best.p, isRet: best.ret, oosRet: ret });
    }
    const wfe = res.length ? mean(res.map((r) => r.oosRet)) / (Math.abs(mean(res.map((r) => r.isRet))) || 1e-9) : null;
    return { folds: res, oosTotal: res.reduce((a, r) => a * (1 + r.oosRet), 1) - 1, efficiency: wfe, robust: res.length >= 2 && res.filter((r) => r.oosRet > 0).length / res.length >= 0.5 && wfe > 0.3 };
  };
  /* Monte Carlo: resample trade returns (seeded), report percentiles of final equity and max drawdown */
  P.monteCarlo = (rets, runs = 1000, seed = 7) => {
    if (!rets || rets.length < 3) return null;
    let s = seed >>> 0 || 7; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const fin0 = [], dds = [];
    for (let k = 0; k < runs; k++) { let eq = 1, pk = 1, dd = 0; for (let i = 0; i < rets.length; i++) { eq *= 1 + rets[Math.floor(rnd() * rets.length)]; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); } fin0.push(eq - 1); dds.push(dd); }
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
    return { runs, p5: q(fin0, 0.05), p50: q(fin0, 0.5), p95: q(fin0, 0.95), ddP50: q(dds, 0.5), ddP95: q(dds, 0.95), lossProb: fin0.filter((x) => x < 0).length / runs };
  };
  /* Pine Script v5 importer → no-code spec (validated by NT.Spec.validate). Reads inputs, ta.* series, crossovers,
     comparisons joined by and / or, strategy.entry / strategy.close and percent stops. Never evaluates code. */
  P.pineImport = (src) => {
    const text = String(src || '').slice(0, 20000), errs = [], vars = new Map(), conds = new Map();
    if (!/^\s*\/\/\s*@version\s*=\s*[56]/m.test(text)) errs.push('Expected a Pine Script v5 (//@version=5) strategy');
    const nameM = /strategy\s*\(\s*(?:title\s*=\s*)?["']([^"']{2,48})["']/.exec(text);
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean).map((l) => (l.length > 500 ? '\u0000' + l.slice(0, 60) : l)); // very long lines are reported, never parsed
    const numOf = (x) => { x = String(x).trim(); if (/^-?\d+(\.\d+)?$/.test(x)) return +x; if (vars.has(x) && vars.get(x).k === 'num') return vars.get(x).v; return null; };
    const series = (x) => {
      x = String(x).trim(); let m;
      if (vars.has(x)) { const v = vars.get(x); return v.k === 'num' ? { k: 'const', v: v.v } : v.op; }
      if (/^close$/.test(x)) return { k: 'price' }; if (/^open$/.test(x)) return { k: 'open' }; if (/^high$/.test(x)) return { k: 'high' }; if (/^low$/.test(x)) return { k: 'low' }; if (/^volume$/.test(x)) return { k: 'volume' };
      if ((m = /^ta\.(ema|sma|rsi|atr)\s*\(\s*(?:close\s*,\s*)?([^,)]+)\s*\)$/.exec(x))) { const n = numOf(m[2]); return n ? { k: m[1], n } : null; }
      if ((m = /^ta\.highest\s*\(\s*(?:high\s*,\s*)?([^,)]+)\s*\)$/.exec(x))) { const n = numOf(m[1]); return n ? { k: 'highest', n } : null; }
      if ((m = /^ta\.lowest\s*\(\s*(?:low\s*,\s*)?([^,)]+)\s*\)$/.exec(x))) { const n = numOf(m[1]); return n ? { k: 'lowest', n } : null; }
      if (/^ta\.vwap(\s*\(\s*\w*\s*\))?$/.test(x)) return { k: 'vwap' };
      if ((m = /^ta\.sma\s*\(\s*volume\s*,\s*([^)]+)\)$/.exec(x))) { const n = numOf(m[1]); return n ? { k: 'volSma', n } : null; }
      const n = numOf(x); return n != null ? { k: 'const', v: n } : null;
    };
    const cond = (x) => {
      x = String(x).trim().replace(/^\((.*)\)$/, '$1'); let m;
      if (conds.has(x)) return conds.get(x);
      if ((m = /^ta\.cross(over|under)\s*\(\s*([^,]+?)\s*,\s*(.+)\)$/.exec(x))) { const a = series(m[2]), b = series(m[3]); return a && b ? { all: [{ a, op: m[1] === 'over' ? 'crossAbove' : 'crossBelow', b }] } : null; }
      if ((m = /^(.+?)\s*(>=|<=|>|<)\s*(.+)$/.exec(x))) { const a = series(m[1]), b = series(m[3]); return a && b ? { all: [{ a, op: m[2], b }] } : null; }
      return null;
    };
    const combine = (x) => {
      if (/\s+or\s+/.test(x) && /\s+and\s+/.test(x)) return null; // mixed and / or: refuse rather than silently change precedence
      const ors = String(x).split(/\s+or\s+/); if (ors.length > 1) { const parts = ors.map((p) => combine(p)); if (parts.some((p) => !p)) return null; const flat = parts.flatMap((p) => p.all || p.any); return { any: flat }; }
      const ands = String(x).split(/\s+and\s+/), parts = ands.map(cond); if (parts.some((p) => !p)) return null;
      const flat = parts.flatMap((p) => (p.all || p.any)); return parts.some((p) => p.any && p.any.length > 1) && parts.length > 1 ? null : { all: flat };
    };
    let entry = null, exit = null, dir = 'long'; const risk = {}; const unsupported = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; let m;
      if (l[0] === '\u0000') { unsupported.push(l.slice(1) + '… (line too long)'); continue; }
      if (/^\/\/@version|^strategy\s*\(|^indicator\s*\(|^plot|^bgcolor|^alertcondition|^import\s/.test(l)) continue;
      if ((m = /^(\w+)\s*=\s*input(?:\.int|\.float)?\s*\(\s*(?:defval\s*=\s*)?(-?\d+(?:\.\d+)?)/.exec(l))) { vars.set(m[1], { k: 'num', v: +m[2] }); continue; }
      if ((m = /^\[\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*ta\.macd\s*\(/.exec(l))) { vars.set(m[1], { k: 's', op: { k: 'macd' } }); vars.set(m[2], { k: 's', op: { k: 'macdSignal' } }); vars.set(m[3], { k: 's', op: { k: 'macdHist' } }); continue; }
      if ((m = /^\[\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*ta\.bb\s*\(\s*close\s*,\s*([^,]+),/.exec(l))) { const n = numOf(m[4]) || 20; vars.set(m[1], { k: 's', op: { k: 'bbMid', n } }); vars.set(m[2], { k: 's', op: { k: 'bbUpper', n } }); vars.set(m[3], { k: 's', op: { k: 'bbLower', n } }); continue; }
      if ((m = /^(\w+)\s*=\s*(ta\.\w+\s*\(.*\)|close|open|high|low|volume|-?\d+(?:\.\d+)?)$/.exec(l))) { const n = numOf(m[2]); if (n != null) { vars.set(m[1], { k: 'num', v: n }); continue; } const s = series(m[2]); if (s) { vars.set(m[1], { k: 's', op: s }); continue; } const c = cond(m[2]); if (c) { conds.set(m[1], c); continue; } unsupported.push(l.slice(0, 60)); continue; }
      if ((m = /^(\w+)\s*=\s*(.+)$/.exec(l)) && !/^strategy\./.test(m[2])) { const c = combine(m[2]); if (c) { conds.set(m[1], c); continue; } unsupported.push(l.slice(0, 60)); continue; }
      if ((m = /^if\s+(.+)$/.exec(l))) {
        const body = (lines[i + 1] || ''), c = combine(m[1]); if (!/^strategy\./.test(body)) { unsupported.push('if ' + m[1].slice(0, 50)); continue; } i++;
        if (/strategy\.entry\s*\(/.test(body)) { const sh = /strategy\.short/.test(body); if (entry && (sh ? 'short' : 'long') !== dir) { unsupported.push('second ' + (sh ? 'short' : 'long') + ' entry (one direction per strategy)'); continue; } if (sh) dir = 'short'; if (c) entry = c; else unsupported.push('if ' + m[1].slice(0, 50)); }
        else if (/strategy\.close|strategy\.exit/.test(body)) { if (c) exit = c; else unsupported.push('if ' + m[1].slice(0, 50)); }
        continue;
      }
      if ((m = /strategy\.exit\s*\((.*)\)/.exec(l))) { const sl = /stop\s*=\s*close\s*\*\s*\(\s*1\s*-\s*([\d.]+)\s*\)/.exec(m[1]), tp = /limit\s*=\s*close\s*\*\s*\(\s*1\s*\+\s*([\d.]+)\s*\)/.exec(m[1]); if (sl) risk.sl = +(+sl[1] * 100).toFixed(2); if (tp) risk.tp = +(+tp[1] * 100).toFixed(2); continue; }
      unsupported.push(l.slice(0, 60));
    }
    if (!entry) errs.push('No strategy.entry condition I can read (supported: ta.crossover / crossunder, comparisons, and / or)');
    const raw = { v: 1, name: nameM ? nameM[1] : 'Imported Pine strategy', desc: 'Imported from Pine Script v5', entry: entry || { all: [] }, exit: exit || { any: [] }, risk };
    if (dir === 'short') raw.dir = 'short';
    const v = N.Spec ? N.Spec.validate(raw) : { ok: !errs.length, spec: raw, errors: [] };
    return { ok: !errs.length && v.ok, spec: v.spec, errors: errs.concat(v.errors || []), unsupported: unsupported.slice(0, 20) };
  };

  /* ══ 8. derivatives & arbitrage ══ */
  /* quotes {exchange: {bid, ask}} → best buy (lowest ask) vs best sell (highest bid), net of taker fees */
  P.arb = (quotes, feeBps = 10) => {
    const ex = Object.entries(quotes || {}).filter(([, q]) => q && q.bid > 0 && q.ask > 0 && q.ask >= q.bid * 0.98);
    if (ex.length < 2) return null;
    const buy = ex.reduce((a, b) => (b[1].ask < a[1].ask ? b : a)), sell = ex.reduce((a, b) => (b[1].bid > a[1].bid ? b : a));
    if (buy[0] === sell[0]) return { buy: buy[0], sell: sell[0], grossBps: 0, netBps: -2 * feeBps, ok: false };
    const gross = (sell[1].bid / buy[1].ask - 1) * 1e4;
    return { buy: buy[0], sell: sell[0], buyPx: buy[1].ask, sellPx: sell[1].bid, grossBps: gross, netBps: gross - 2 * feeBps, ok: gross - 2 * feeBps > 0 };
  };
  /* estimated liquidation bands: where 5×–100× longs and shorts opened near `entries` get liquidated (MMR ≈ 0.5 %) */
  P.liqBands = (entries, lev = [5, 10, 25, 50, 100], mmr = 0.005) => {
    const out = [];
    for (const e of entries || []) for (const L of lev) { const w = (e.w || 1) / L ** 0.5; out.push({ side: 'long', lev: L, p: e.p * (1 - 1 / L + mmr), w }); out.push({ side: 'short', lev: L, p: e.p * (1 + 1 / L - mmr), w }); }
    return out;
  };
  P.liqHeat = (bands, lo, hi, bins = 40) => { const step = (hi - lo) / bins, h = new Array(bins).fill(0); for (const b of bands) { const i = Math.floor((b.p - lo) / step); if (i >= 0 && i < bins) h[i] += b.w; } const mx = Math.max(1e-12, ...h); return h.map((v, i) => ({ p: lo + (i + 0.5) * step, v, k: v / mx })); };

  /* ══ 9. offline replay packs + encrypted .exterm backups ══ */
  P.packSession = (sym, tf, candles) => ({ v: 1, sym: STR(sym, 100), tf: Object.prototype.hasOwnProperty.call(N.TF, tf) ? tf : '1h', ts: Date.now(), c: (candles || []).slice(-5000).map((k) => [k.t, k.o, k.h, k.l, k.c, k.v || 0]) });
  P.unpackSession = (o) => {
    if (!o || o.v !== 1 || !Array.isArray(o.c) || !Object.prototype.hasOwnProperty.call(N.TF, o.tf)) return null;
    const c = o.c.slice(0, 5000).filter((r) => Array.isArray(r) && r.length === 6 && r.every(fin) && r[2] >= r[3] && r[1] > 0).map(([t, oo, h, l, cc, v]) => ({ t, o: oo, h, l, c: cc, v })).sort((a, b) => a.t - b.t).filter((k, i, a) => !i || k.t > a[i - 1].t);
    return c.length >= 20 ? { sym: STR(o.sym, 100), tf: o.tf, ts: +o.ts || 0, candles: c } : null;
  };
  const b64 = (u8) => { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => (typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
  P.KDF_ITER = 600000; // OWASP 2023 figure for PBKDF2-HMAC-SHA256
  const keyOf = async (pass, salt, iter) => { const s = subtle(), base = await s.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return s.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); };
  P.encrypt = async (obj, pass, iter = P.KDF_ITER) => {
    if (!subtle()) throw new Error('Web Crypto is not available');
    if (String(pass || '').length < 8) throw new Error('Use a passphrase of at least 8 characters');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12)), k = await keyOf(pass, salt, iter);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj))));
    return JSON.stringify({ exterm: 15, kind: 'encrypted-backup', kdf: 'PBKDF2-SHA256', iter, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  };
  P.decrypt = async (text, pass) => {
    let o; try { o = JSON.parse(text); } catch (e) { throw new Error('Not an .exterm backup file'); }
    if (!o || o.exterm !== 15 || o.kind !== 'encrypted-backup' || typeof o.ct !== 'string' || !(o.iter >= 100000 && o.iter <= 2000000)) throw new Error('Not an .exterm backup file');
    let out; try { const k = await keyOf(String(pass || ''), unb64(o.salt), o.iter), pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.ct)); out = JSON.parse(new TextDecoder().decode(pt)); } catch (e) { throw new Error('Wrong passphrase or damaged file'); }
    return out;
  };
  /* only ExTerm's own storage keys are restored from a backup, as strings */
  P.restoreKeys = (obj, own) => { const out = {}; const k = obj && obj.keys; if (!k || typeof k !== 'object') return out; for (const [a, b] of Object.entries(k)) if (own(a) && typeof b === 'string' && b.length < 8e6) out[a] = b; return out; };

  P._clamp = clamp; P._sd = sd;
  return P;
})();
if (typeof module === 'object' && module.exports) module.exports = P5;
