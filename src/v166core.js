/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.6 core (pure, no DOM, Node-testable): typed-array live tape engine.
   · one ring per symbol, 2,000 prints: Float64Array [ts, price, size, totalUsd] + Uint32Array [sideMask, venueId]
   · three strictly isolated markets (stocks · crypto · onchain): separate ring maps and venue / maker tables
   · classification bits at ingest (Buy · Sell · Whale $25K+ · Block $100K+ · Sweep · Unusual > 3× avg · Tracked · 1m agg)
   · allocation-free bitmask filter into a reusable Uint32Array (newest first), pressure strip maths,
     sub-tab aggregations (holders · top traders · early · DCA) and the AI Bridge tape export */
const V166 = (() => {
  const V = {};
  V.CAP = 2000; V.MAX_SYMS = 32; V.WHALE = 25000; V.BLOCK = 100000; V.SWEEP_MS = 1000; V.SWEEP_N = 3; V.UNUSUAL_X = 3;
  const B = V.BIT = { BUY: 1, SELL: 2, WHALE: 4, BLOCK: 8, SWEEP: 16, UNUSUAL: 32, TRACKED: 64, AGG: 128 };
  const SIDES = B.BUY | B.SELL;
  V.MARKETS = ['stocks', 'crypto', 'onchain'];
  V.marketOf = (s) => (/^oc:/.test(s) ? 'onchain' : /-(USD|USDT|USDC)$/i.test(s) ? 'crypto' : 'stocks');
  V.TABS = [['trades', 'Trades'], ['positions', 'Positions'], ['holders', 'Holders / Institutions'], ['top', 'Top Traders / Funds'], ['early', 'Pre / Early'], ['tracking', 'Tracking'], ['dca', 'DCA'], ['orders', 'Orders']];
  V.CHIPS = [['all', 'All', 0], ['whale', 'Whales ($25K+)', B.WHALE], ['block', 'Blocks ($100K+)', B.BLOCK], ['sweep', 'Sweeps', B.SWEEP], ['buy', 'Buys', B.BUY], ['sell', 'Sells', B.SELL], ['unusual', 'Unusual (>3x)', B.UNUSUAL], ['tracked', 'Tracked', B.TRACKED]];
  V.chipMask = (ids) => { let m = 0; for (const c of V.CHIPS) if (ids.includes(c[0])) m |= c[2]; return m; };

  /* ══ ring: fixed 2,000-slot circular buffer, no per-print allocation ══ */
  class Ring {
    constructor(cap) { this.cap = cap || V.CAP; this.f = new Float64Array(this.cap * 4); this.u = new Uint32Array(this.cap * 2); this.n = 0; this.sum = 0; this.run = 0; this.runSide = 0; this.lastTs = 0; this.lastPx = 0; this.at = 0; }
    get size() { return Math.min(this.n, this.cap); }
    slot(seq) { return seq % this.cap; }
    has(seq) { return seq < this.n && seq >= this.n - this.cap; }
  }
  V.Ring = Ring;
  V.ts = (r, seq) => r.f[(seq % r.cap) * 4]; V.price = (r, seq) => r.f[(seq % r.cap) * 4 + 1]; V.qty = (r, seq) => r.f[(seq % r.cap) * 4 + 2]; V.usd = (r, seq) => r.f[(seq % r.cap) * 4 + 3];
  V.mask = (r, seq) => r.u[(seq % r.cap) * 2]; V.venue = (r, seq) => r.u[(seq % r.cap) * 2 + 1];

  /* push one print; side 'buy' | 'sell'; ts in ms; returns the sequence number. O(1) except the 3-print sweep back-tag */
  V.push = (r, ts, price, size, usd, side, venueId, extra) => {
    if (!(price > 0) || !Number.isFinite(ts)) return -1;
    const u = usd > 0 ? usd : price * (size > 0 ? size : 0), q = size > 0 ? size : u / price, sd = side === 'sell' ? B.SELL : B.BUY;
    let m = sd | (extra | 0);
    if (u >= V.WHALE) m |= B.WHALE; if (u >= V.BLOCK) m |= B.BLOCK;
    const cnt = r.size; if (cnt >= 20 && u > V.UNUSUAL_X * (r.sum / cnt)) m |= B.UNUSUAL;
    // sweep: same aggressive side, ≤ 1 s apart, price walking with the aggressor (buys lift, sells hit) for ≥ 3 prints
    const walk = sd === B.BUY ? price >= r.lastPx : price <= r.lastPx;
    if (r.runSide === sd && ts - r.lastTs <= V.SWEEP_MS && walk && !(m & B.AGG)) r.run++; else r.run = 1;
    r.runSide = sd; r.lastTs = ts; r.lastPx = price;
    if (r.run >= V.SWEEP_N) { m |= B.SWEEP; if (r.run === V.SWEEP_N) for (let k = 1; k < V.SWEEP_N; k++) if (r.has(r.n - k)) r.u[((r.n - k) % r.cap) * 2] |= B.SWEEP; }
    const s = r.n % r.cap, i = s * 4;
    if (r.n >= r.cap) r.sum -= r.f[i + 3];
    r.f[i] = ts; r.f[i + 1] = price; r.f[i + 2] = q; r.f[i + 3] = u; r.u[s * 2] = m; r.u[s * 2 + 1] = venueId >>> 0; r.sum += u;
    return r.n++;
  };

  /* ══ bitmask filter: newest first into `out` (Uint32Array of sequence numbers), returns the count ══
     side chips OR together (Buys + Sells = both), every other chip must all match (Whales + Buys = whale buys) */
  V.filter = (r, want, minUsd, out, tracked) => {
    const sw = want & SIDES, ot = want & ~SIDES, lo = Math.max(0, r.n - r.cap), mu = minUsd > 0 ? minUsd : 0; let k = 0;
    for (let seq = r.n - 1; seq >= lo; seq--) {
      const s = seq % r.cap; let m = r.u[s * 2]; if (tracked && tracked.has(r.u[s * 2 + 1])) m |= B.TRACKED;
      if ((m & ot) !== ot || (sw && !(m & sw)) || r.f[s * 4 + 3] < mu) continue;
      out[k++] = seq;
    }
    return k;
  };

  /* ══ pressure strip: buy vs sell flow ($ and %), net whale / block flow ($25K+), average print size ══ */
  V.pressure = (r, sinceMs) => {
    let b = 0, s = 0, wb = 0, ws = 0, n = 0; const lo = Math.max(0, r.n - r.cap);
    for (let seq = r.n - 1; seq >= lo; seq--) {
      const sl = seq % r.cap; if (sinceMs && r.f[sl * 4] < sinceMs) break; const u = r.f[sl * 4 + 3], m = r.u[sl * 2]; n++;
      if (m & B.SELL) { s += u; if (m & B.WHALE) ws += u; } else { b += u; if (m & B.WHALE) wb += u; }
    }
    const t = b + s; return { buy: b, sell: s, buyPct: t > 0 ? (b / t) * 100 : 50, sellPct: t > 0 ? (s / t) * 100 : 50, whaleNet: wb - ws, whaleBuy: wb, whaleSell: ws, avg: n ? t / n : 0, n };
  };

  /* ══ sub-tab aggregations by venue / maker id ══ */
  V.agg = (r) => {
    const M = new Map(), lo = Math.max(0, r.n - r.cap);
    for (let seq = lo; seq < r.n; seq++) {
      const sl = seq % r.cap, id = r.u[sl * 2 + 1], u = r.f[sl * 4 + 3], q = r.f[sl * 4 + 2], sell = r.u[sl * 2] & B.SELL, t = r.f[sl * 4];
      let a = M.get(id); if (!a) M.set(id, (a = { id, buy: 0, sell: 0, qb: 0, qs: 0, nb: 0, ns: 0, first: t, last: t, s1: 0, s2: 0, firstPx: r.f[sl * 4 + 1] }));
      if (sell) { a.sell += u; a.qs += q; a.ns++; } else { a.buy += u; a.qb += q; a.nb++; } a.last = t; a.s1 += u; a.s2 += u * u;
    }
    return [...M.values()].map((a) => Object.assign(a, { net: a.buy - a.sell, gross: a.buy + a.sell, n: a.nb + a.ns }));
  };
  V.holders = (A, k) => A.filter((a) => a.net > 0).sort((x, y) => y.net - x.net).slice(0, k || 20);
  V.top = (A, k) => A.slice().sort((x, y) => y.gross - x.gross).slice(0, k || 20);
  V.early = (A, k) => A.slice().sort((x, y) => x.first - y.first).slice(0, k || 20);
  // DCA: ≥ 3 one-sided prints with steady size (coefficient of variation ≤ 25%)
  V.dca = (A, k) => A.filter((a) => a.n >= 3 && (a.nb === 0 || a.ns === 0)).map((a) => { const mu = a.s1 / a.n, sd = Math.sqrt(Math.max(0, a.s2 / a.n - mu * mu)); return Object.assign({}, a, { cv: mu > 0 ? sd / mu : 1, avg: mu, side: a.ns ? 'sell' : 'buy' }); }).filter((a) => a.cv <= 0.25).sort((x, y) => y.gross - x.gross).slice(0, k || 20);

  /* ══ per-market engine: isolated ring maps + venue / maker tables, LRU-capped symbols ══ */
  V.engine = () => {
    const E = { m: {}, keep: '' }; // keep: the symbol on screen is never evicted
    for (const k of V.MARKETS) E.m[k] = { rings: new Map(), ids: new Map(), names: [''], tracked: new Set(), trackedNames: new Set() };
    E.mk = (sym) => E.m[V.marketOf(sym)];
    E.vid = (sym, name) => { const M = E.mk(sym), nm = String(name || '').slice(0, 64); let id = M.ids.get(nm); if (id == null) { id = M.names.length; M.names.push(nm); M.ids.set(nm, id); if (M.trackedNames.has(nm)) M.tracked.add(id); } return id; };
    E.ring = (sym, make) => {
      const M = E.mk(sym); let r = M.rings.get(sym);
      if (!r && make) { if (M.rings.size >= V.MAX_SYMS) { let old = null; for (const [k, x] of M.rings) if (k !== E.keep && (!old || x.at < old[1].at)) old = [k, x]; if (old) M.rings.delete(old[0]); } r = new Ring(); M.rings.set(sym, r); }
      return r || null;
    };
    E.ingest = (sym, ts, price, size, usd, side, venue, extra) => { const r = E.ring(sym, true); r.at = Date.now(); return V.push(r, ts, price, size, usd, side, E.vid(sym, venue), extra); };
    E.name = (sym, id) => E.mk(sym).names[id] || '';
    E.track = (sym, name, on) => { const M = E.mk(sym), id = E.vid(sym, name); if (on) { M.tracked.add(id); M.trackedNames.add(name); } else { M.tracked.delete(id); M.trackedNames.delete(name); } return on; };
    E.isTracked = (sym, name) => E.mk(sym).trackedNames.has(name);
    return E;
  };

  /* ══ display helpers ══ */
  V.type = (m) => { const sd = m & B.SELL ? 'Sell' : 'Buy'; return m & B.BLOCK ? 'Block ' + sd : m & B.WHALE ? 'Whale ' + sd : m & B.SWEEP ? 'Sweep ' + sd : sd; };
  V.cls = (m) => (m & (B.WHALE | B.BLOCK) ? 'gold' : m & B.SWEEP ? 'amb' : m & B.SELL ? 'dn' : 'up');
  V.tags = (m) => [m & B.BLOCK ? 'BLOCK' : m & B.WHALE ? 'WHALE' : '', m & B.SWEEP ? 'SWEEP' : '', m & B.UNUSUAL ? '>3x' : '', m & B.TRACKED ? 'TRACKED' : '', m & B.AGG ? '1m agg' : ''].filter(Boolean).join(' · ');
  V.age = (ms, now) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  V.money = (v) => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return sg + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0)); };

  /* ══ optional stock boost streams (user's own key): trade messages → [{ sym, price, size, ts(ms), venue }] ══ */
  V.BOOST_URL = { finnhub: (k) => 'wss://ws.finnhub.io?token=' + encodeURIComponent(k), alpaca: () => 'wss://stream.data.alpaca.markets/v2/iex' };
  V.parseFinnhub = (raw) => { let j; try { j = JSON.parse(raw); } catch (e) { return []; } if (!j || j.type !== 'trade' || !Array.isArray(j.data)) return []; return j.data.filter((t) => t && t.p > 0 && Number.isFinite(t.t)).map((t) => ({ sym: String(t.s || ''), price: +t.p, size: +t.v || 0, ts: +t.t, venue: 'Finnhub' })); };
  V.parseAlpaca = (raw) => { let j; try { j = JSON.parse(raw); } catch (e) { return []; } return (Array.isArray(j) ? j : []).filter((t) => t && t.T === 't' && t.p > 0).map((t) => ({ sym: String(t.S || ''), price: +t.p, size: +t.s || 0, ts: Date.parse(t.t) || Date.now(), venue: 'Alpaca' + (t.x ? ' · ' + String(t.x).slice(0, 4) : '') })); };
  V.tickSide = (price, prev) => (prev > 0 && price < prev ? 'sell' : 'buy'); // no aggressor flag in these feeds: tick rule

  /* ══ AI Bridge export: pressure + top recent whale / block prints ══ */
  V.aiTape = (E, sym, now, k) => {
    const r = E.ring(sym), mk = V.marketOf(sym); if (!r || !r.n) return `[ExTerm Tape] ${sym} · ${mk} · no prints yet`;
    const out = new Uint32Array(r.cap), n = V.filter(r, B.WHALE, 0, out, E.mk(sym).tracked), P = V.pressure(r), lines = [];
    for (let i = 0; i < Math.min(n, k || 10); i++) { const q = out[i], m = V.mask(r, q); lines.push(`${V.age(V.ts(r, q), now)} ago | ${V.type(m)} | px ${+V.price(r, q).toPrecision(8)} | qty ${+V.qty(r, q).toPrecision(6)} | ${V.money(V.usd(r, q))} | ${E.name(sym, V.venue(r, q)) || '–'}${V.tags(m) ? ' | ' + V.tags(m) : ''}`); }
    return [`[ExTerm Tape] ${sym} · ${mk} · last ${r.size} prints`, `FLOW: buy ${P.buyPct.toFixed(1)}% (${V.money(P.buy)}) vs sell ${P.sellPct.toFixed(1)}% (${V.money(P.sell)}) · net whale/block ($25K+) ${V.money(P.whaleNet)} · avg print ${V.money(P.avg)}`,
      `TOP RECENT WHALE / BLOCK PRINTS (${Math.min(n, k || 10)} of ${n}):`, lines.length ? 'AGE | TYPE | PRICE | SIZE | USD | VENUE/MAKER | TAGS\n' + lines.join('\n') : '(none ≥ $25K in the buffer)',
      'Task: read the aggressor flow and whale/block prints; say whether size is accumulating or distributing, and name the price levels where blocks traded.'].join('\n');
  };

  V.HIGHLIGHTS = [
    'Live Transactions drawer on the chart: 2,000-print typed-array tape per symbol for Stocks, Crypto and On-Chain / DEX, 22 pooled rows, < 0.2 ms per frame at 240 Hz',
    'Tape pressure strip (buy vs. sell $ and %, net whale / block flow $25K+, avg print), hover auto-pause with a gold Paused pill, click a print to pin it on the chart',
    '8 sub-tabs (Trades · Positions · Holders / Institutions · Top Traders / Funds · Pre / Early · Tracking · DCA · Orders) and bitmask filter chips + min-USD',
    'Zero-setup public feeds: Coinbase / Kraken / Binance trades 24/7, DEX pool swaps with makers, stock last-sale tape via the launcher (LAST SESSION TAPE when closed); Copy Tape for AI',
    'Still here from v16.5: AI Bridge tab with the 127.0.0.1/llm-signal firewall, AI-vetted copy-trading and the masked Share Setup Card',
    'Still here from v16.4 / v16.3: DEX Discovery, anchored VWAP, the Floating Live Execution HUD, two-way fill sync with IBKR / Alpaca / CCXT / Freqtrade bridges, Require Stop-Loss ON and Two-Key Arming',
  ];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V166;
