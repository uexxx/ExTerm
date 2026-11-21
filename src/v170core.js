/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.0 core (pure, no DOM, no network; runs on the page, in the Web Worker and in Node tests):
   · Epoch            monotonic request generation token: late async answers from an old symbol / market / TF are dropped
   · ts / dedup       any venue timestamp (s · ms · µs · ns · ISO) → epoch ms; 512-entry cross-venue signature set
   · Lee-Ready        quote rule (vs mid) with tick-rule fallback → BUY / SELL bits; BLOCK ($100K+) and SWEEP bits
   · Merger           one composite typed-array ring for CB · KRK · BIN · BYB · OKX · DEX prints, per-venue CVD / last / lag,
                      venue-mask filter, spot-vs-perp basis %, OI-weighted funding, cross-venue spread (bps), L2 depth buckets
   · Venue adapters   Bybit + OKX public trade streams (Coinbase / Kraken / Binance come from V164.exParse)
   · OHLCV packing    [[t,o,h,l,c,v], …] ⇄ Float64Array (zero-copy Transferable for the worker / IndexedDB)
   · LRU              L1 in-memory map of the last 50 symbol rings (the page adds IndexedDB as L2)
   · Formula          safe compiler (no eval: CSP-clean) for screener rules like "RVOL > 3x AND Price > VWAP AND 5m Delta > +$50K",
                      columnar scan + index sort for the worker, breakout edge detection for the chime
   · CSV              OHLCV CSV → packed Float64Array
   · Clipboard        Solana / EVM contract address or ticker detection
   · Backoff + heartbeat for the standalone reconnect pill */
const V170 = (() => {
  const V = {};
  const fin = Number.isFinite;

  /* ══ 1. monotonic request token ══ */
  V.Epoch = class {
    constructor() { this.v = 0; }
    bump() { return ++this.v; }
    get() { return this.v; }
    ok(e) { return e === this.v; }
    /* wrap a promise: resolves to the value, or to V.STALE when the epoch moved while it was in flight */
    guard(p) { const e = this.v; return Promise.resolve(p).then((x) => (e === this.v ? x : V.STALE)); }
  };
  V.STALE = Object.freeze({ stale: true });

  /* ══ 2. timestamps + dedup ══ */
  V.toMs = (x) => {
    if (x == null || x === '') return NaN;
    if (typeof x === 'string' && !/^\s*-?\d+(\.\d+)?\s*$/.test(x)) { const t = Date.parse(x); return fin(t) ? t : NaN; }
    const n = +x; if (!fin(n) || n <= 0) return NaN;
    if (n < 1e11) return Math.round(n * 1000);        // seconds
    if (n < 1e14) return Math.round(n);               // milliseconds
    if (n < 1e17) return Math.round(n / 1e3);         // microseconds
    return Math.round(n / 1e6);                       // nanoseconds
  };
  const p2 = (n) => (n < 10 ? '0' : '') + n, p3 = (n) => (n < 10 ? '00' : n < 100 ? '0' : '') + n;
  V.fmtMs = (ms, utc) => { const d = new Date(ms); if (!fin(d.getTime())) return '–'; return utc ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${p3(d.getUTCMilliseconds())}` : `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`; };
  V.Dedup = class {
    constructor(cap) { this.cap = cap || 512; this.set = new Set(); this.ring = new Array(this.cap); this.i = 0; }
    /* true when new (and remembered); false for a duplicate. Oldest signature is evicted first. */
    add(sig) {
      if (this.set.has(sig)) return false;
      const old = this.ring[this.i]; if (old !== undefined) this.set.delete(old);
      this.ring[this.i] = sig; this.i = (this.i + 1) % this.cap; this.set.add(sig); return true;
    }
    get size() { return this.set.size; }
  };
  V.sig = (venue, ms, price, size, id) => (id != null && id !== '' ? venue + '#' + id : venue + '|' + ms + '|' + (+price).toPrecision(10) + '|' + (+size).toPrecision(8));

  /* ══ 3. Lee-Ready classification ══ */
  const B = V.BIT = { BUY: 1, SELL: 2, WHALE: 4, BLOCK: 8, SWEEP: 16 }; // same bit values as V166.BIT
  V.BLOCK_USD = 100000; V.WHALE_USD = 25000; V.SWEEP_MS = 1000; V.SWEEP_N = 3;
  /* quote rule when a valid quote exists (trade above mid = buyer-initiated), tick rule otherwise (uptick = buy,
     zero tick inherits the previous classification). Returns B.BUY or B.SELL. */
  V.leeReady = (price, bid, ask, prevPx, prevSide) => {
    if (bid > 0 && ask > 0 && ask >= bid) { const mid = (bid + ask) / 2; if (price > mid) return B.BUY; if (price < mid) return B.SELL; }
    if (prevPx > 0) { if (price > prevPx) return B.BUY; if (price < prevPx) return B.SELL; }
    return prevSide === B.SELL ? B.SELL : prevSide === B.BUY ? B.BUY : B.BUY;
  };

  /* ══ 4. composite multi-venue ring ══ */
  V.VENUES = ['CB', 'KRK', 'BIN', 'BYB', 'OKX', 'DEX'];
  V.VENUE_NAME = { CB: 'Coinbase', KRK: 'Kraken', BIN: 'Binance', BYB: 'Bybit', OKX: 'OKX', DEX: 'DEX' };
  V.VENUE_OF_EX = { coinbase: 'CB', kraken: 'KRK', binance: 'BIN', bybit: 'BYB', okx: 'OKX' };
  V.vbit = (code) => { const i = V.VENUES.indexOf(code); return i < 0 ? 0 : 1 << i; };
  V.ALL = (1 << V.VENUES.length) - 1;
  V.Merger = class {
    constructor(cap) {
      this.cap = cap || 4096; this.f = new Float64Array(this.cap * 4); this.u = new Uint32Array(this.cap * 2); this.n = 0;
      this.dd = new V.Dedup(512); this.dups = 0;
      this.v = V.VENUES.map(() => ({ last: 0, cvd: 0, vol: 0, n: 0, at: 0, lag: 0, prevPx: 0, prevSide: 0, bid: 0, ask: 0 }));
      this.runSide = 0; this.run = 0; this.lastTs = 0; this.lastPx = 0;
    }
    quote(code, bid, ask) { const i = V.VENUES.indexOf(code); if (i >= 0) { this.v[i].bid = +bid || 0; this.v[i].ask = +ask || 0; } }
    /* side may be 'buy' / 'sell' (exchange-reported aggressor) or null (classified with Lee-Ready). Returns seq or -1. */
    push(code, ts, price, size, side, id, now) {
      const vi = V.VENUES.indexOf(code); const ms = V.toMs(ts); price = +price; size = +size;
      if (vi < 0 || !(price > 0) || !(size >= 0) || !fin(ms)) return -1;
      if (!this.dd.add(V.sig(code, ms, price, size, id))) { this.dups++; return -1; }
      const st = this.v[vi], usd = price * size;
      let m = side === 'buy' ? B.BUY : side === 'sell' ? B.SELL : V.leeReady(price, st.bid, st.ask, st.prevPx, st.prevSide);
      if (usd >= V.WHALE_USD) m |= B.WHALE; if (usd >= V.BLOCK_USD) m |= B.BLOCK;
      const sd = m & 3, walk = sd === B.BUY ? price >= this.lastPx : price <= this.lastPx;
      if (this.runSide === sd && Math.abs(ms - this.lastTs) <= V.SWEEP_MS && walk) this.run++; else this.run = 1;
      this.runSide = sd; this.lastTs = ms; this.lastPx = price;
      if (this.run >= V.SWEEP_N) { m |= B.SWEEP; if (this.run === V.SWEEP_N) for (let k = 1; k < V.SWEEP_N; k++) { const q = this.n - k; if (q >= 0 && q >= this.n - this.cap) this.u[(q % this.cap) * 2] |= B.SWEEP; } }
      st.prevPx = price; st.prevSide = sd; st.last = price; st.vol += usd; st.n++; st.cvd += sd === B.BUY ? usd : -usd;
      const t = now || Date.now(); st.at = t; st.lag = Math.max(0, t - ms);
      const s = this.n % this.cap; this.f[s * 4] = ms; this.f[s * 4 + 1] = price; this.f[s * 4 + 2] = size; this.f[s * 4 + 3] = usd; this.u[s * 2] = m; this.u[s * 2 + 1] = vi;
      return this.n++;
    }
    get size() { return Math.min(this.n, this.cap); }
    /* newest-first sequence numbers whose venue is in `mask` (and whose bits include `want`) into a reusable Uint32Array */
    filter(mask, out, want) {
      const lo = Math.max(0, this.n - this.cap); let k = 0; want = want | 0;
      for (let q = this.n - 1; q >= lo && k < out.length; q--) { const s = q % this.cap; if (!((1 << this.u[s * 2 + 1]) & mask)) continue; if (want && (this.u[s * 2] & want) !== want) continue; out[k++] = q; }
      return k;
    }
    row(q) { const s = q % this.cap; return { ts: this.f[s * 4], price: this.f[s * 4 + 1], size: this.f[s * 4 + 2], usd: this.f[s * 4 + 3], mask: this.u[s * 2], venue: V.VENUES[this.u[s * 2 + 1]] }; }
    cvd(mask) { let c = 0; V.VENUES.forEach((_, i) => { if ((1 << i) & mask) c += this.v[i].cvd; }); return c; }
    live(now, ms) { const t = now || Date.now(); return V.VENUES.filter((_, i) => this.v[i].at && t - this.v[i].at < (ms || 15000)); }
    lagMs(now) { const L = this.live(now).map((c) => this.v[V.VENUES.indexOf(c)].lag).sort((a, b) => a - b); return L.length ? L[L.length >> 1] : null; }
    lastPrices(now) { const o = {}; for (const c of this.live(now)) o[c] = this.v[V.VENUES.indexOf(c)].last; return o; }
  };
  V.basisPct = (spot, perp) => (spot > 0 && perp > 0 ? ((perp - spot) / spot) * 100 : null);
  /* rows [{ rate, oi }] → open-interest-weighted funding rate (plain mean where OI is missing) */
  V.aggFunding = (rows) => {
    const ok = (rows || []).filter((r) => r && fin(+r.rate)); if (!ok.length) return null;
    const w = ok.reduce((s, r) => s + (+r.oi > 0 ? +r.oi : 0), 0);
    return w > 0 ? ok.reduce((s, r) => s + +r.rate * (+r.oi > 0 ? +r.oi : 0), 0) / w : ok.reduce((s, r) => s + +r.rate, 0) / ok.length;
  };
  V.spreadBps = (prices) => { const v = Object.values(prices || {}).filter((x) => x > 0); if (v.length < 2) return null; const hi = Math.max(...v), lo = Math.min(...v); return ((hi - lo) / ((hi + lo) / 2)) * 1e4; };
  /* books { CB: { bids: [[p, q]], asks: [[p, q]] }, … } → bucketed combined depth; each level carries a venue mask */
  V.depthBuckets = (books, bucket) => {
    const bk = bucket > 0 ? bucket : 1, B2 = new Map(), A2 = new Map();
    const add = (M, p, q, bit, floor) => { if (!(p > 0) || !(q > 0)) return; const k = (floor ? Math.floor(p / bk) : Math.ceil(p / bk)) * bk, o = M.get(k) || [k, 0, 0]; o[1] += q; o[2] |= bit; M.set(k, o); };
    for (const [code, b] of Object.entries(books || {})) { const bit = V.vbit(code); for (const [p, q] of (b && b.bids) || []) add(B2, +p, +q, bit, true); for (const [p, q] of (b && b.asks) || []) add(A2, +p, +q, bit, false); }
    const bids = [...B2.values()].sort((a, b) => b[0] - a[0]), asks = [...A2.values()].sort((a, b) => a[0] - b[0]);
    const all = bids.concat(asks).map((x) => x[1]).sort((a, b) => b - a), wallMin = all.length ? all[Math.min(all.length - 1, 2)] : Infinity;
    return { bids, asks, walls: bids.concat(asks).filter((x) => x[1] >= wallMin && x[1] > 0).map((x) => ({ price: x[0], qty: x[1], venues: V.VENUES.filter((c) => x[2] & V.vbit(c)), side: x[0] <= (bids[0] || [0])[0] ? 'bid' : 'ask' })) };
  };

  /* ══ 5. Bybit + OKX public trade adapters ══ */
  V.EX2 = {
    bybit: { url: 'wss://stream.bybit.com/v5/public/spot', sym: (s) => { const m = /^([A-Z0-9]{2,10})-(USD|USDT|USDC)$/i.exec(s || ''); return m ? m[1].toUpperCase() + 'USDT' : null; }, sub: (x) => JSON.stringify({ op: 'subscribe', args: ['publicTrade.' + x] }),
      parse: (raw) => { let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return []; } if (!m || !/^publicTrade\./.test(m.topic || '') || !Array.isArray(m.data)) return []; return m.data.map((d) => ({ price: +d.p, size: +d.v, side: d.S === 'Sell' ? 'sell' : 'buy', ts: +d.T, id: d.i })).filter((x) => x.price > 0 && x.size >= 0); } },
    okx: { url: 'wss://ws.okx.com:8443/ws/v5/public', sym: (s) => { const m = /^([A-Z0-9]{2,10})-(USD|USDT|USDC)$/i.exec(s || ''); return m ? m[1].toUpperCase() + '-USDT' : null; }, sub: (x) => JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId: x }] }),
      parse: (raw) => { let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return []; } if (!m || !m.arg || m.arg.channel !== 'trades' || !Array.isArray(m.data)) return []; return m.data.map((d) => ({ price: +d.px, size: +d.sz, side: d.side === 'sell' ? 'sell' : 'buy', ts: +d.ts, id: d.tradeId })).filter((x) => x.price > 0 && x.size >= 0); } },
  };

  /* ══ 6. OHLCV packing ══ */
  V.pack = (candles) => {
    const n = (candles || []).length, f = new Float64Array(n * 6);
    for (let i = 0; i < n; i++) { const k = candles[i]; const a = Array.isArray(k) ? k : [k.t, k.o, k.h, k.l, k.c, k.v]; for (let j = 0; j < 6; j++) f[i * 6 + j] = +a[j] || 0; }
    return f;
  };
  V.unpack = (f) => { const out = []; if (!f) return out; for (let i = 0; i + 5 < f.length; i += 6) out.push({ t: f[i], o: f[i + 1], h: f[i + 2], l: f[i + 3], c: f[i + 4], v: f[i + 5] }); return out; };

  /* ══ 7. L1 LRU ══ */
  V.LRU = class {
    constructor(cap) { this.cap = cap || 50; this.m = new Map(); }
    get(k) { if (!this.m.has(k)) return undefined; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; }
    set(k, v) { this.m.delete(k); this.m.set(k, v); while (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); return this; }
    has(k) { return this.m.has(k); }
    keys() { return [...this.m.keys()]; }
    get size() { return this.m.size; }
  };

  /* ══ 8. formula compiler (no eval) ══ */
  V.FIELDS = { price: 'price', px: 'price', last: 'price', vwap: 'vwap', rvol: 'rvol', chg: 'ch', change: 'ch', ch: 'ch', 'chg_5m': 'ch5m', 'chg_1h': 'ch1h', 'ch_5m': 'ch5m', 'ch_1h': 'ch1h',
    vol: 'v24', volume: 'v24', 'vol_5m': 'v5', 'vol_1h': 'v1h', 'vol_24h': 'v24', liq: 'liq', liquidity: 'liq', mcap: 'mcap', cap: 'mcap', holders: 'holders', top10: 'top10',
    spread: 'spread', range: 'range', age: 'ageMin', 'delta_5m': 'delta5m', delta: 'delta5m', 'delta_1h': 'delta1h', buys: 'bsPct', bs: 'bsPct', 'buy_pct': 'bsPct' };
  const SUFFIX = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, x: 1, '%': 1 };
  /* "5m Delta" → delta_5m, only when that is a known field ("1M OR …" stays a million followed by OR) */
  V.normalize = (src) => String(src || '').replace(/\b(\d+)\s*(s|m|h|d)\s+([a-z]+)/gi, (all, n, u, w) => { const k = w.toLowerCase() + '_' + n + u.toLowerCase(); return V.FIELDS[k] ? k : all; });
  const tokenize = (s) => {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      let m = /^(>=|<=|!=|==|>|<|=|\(|\)|\+|-|\*|\/|&&|\|\|)/.exec(s.slice(i));
      if (m && !(m[1] === '+' || m[1] === '-') ) { out.push({ k: 'op', v: m[1] }); i += m[1].length; continue; }
      m = /^[+-]?\$?(\d+(?:\.\d+)?|\.\d+)\s*([kmbtKMBT%xX])?(?![a-zA-Z_])/.exec(s.slice(i));
      const prevIsVal = out.length && (out[out.length - 1].k === 'num' || out[out.length - 1].k === 'id' || out[out.length - 1].v === ')');
      if (m && !(prevIsVal && /^[+-]/.test(m[0]))) { const neg = m[0][0] === '-'; out.push({ k: 'num', v: (neg ? -1 : 1) * parseFloat(m[1]) * (SUFFIX[(m[2] || '').toLowerCase()] || 1) }); i += m[0].length; continue; }
      if (c === '+' || c === '-') { out.push({ k: 'op', v: c }); i++; continue; }
      m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i));
      if (m) { const w = m[0].toLowerCase(); if (w === 'and' || w === 'or' || w === 'not') out.push({ k: 'op', v: w === 'and' ? '&&' : w === 'or' ? '||' : '!' }); else out.push({ k: 'id', v: w }); i += m[0].length; continue; }
      throw new Error('unexpected "' + c + '" at ' + i);
    }
    return out;
  };
  /* returns { fn(row) → bool, fields: [...], src } ; throws on syntax / unknown field */
  V.compile = (src) => {
    const toks = tokenize(V.normalize(src)); let p = 0; const used = new Set();
    const peek = () => toks[p], eat = (v) => { const t = toks[p]; if (!t || (v && t.v !== v)) throw new Error('expected ' + (v || 'value') + (t ? ' near "' + t.v + '"' : ' at end')); p++; return t; };
    const atom = () => {
      const t = peek(); if (!t) throw new Error('unexpected end');
      if (t.v === '(') { eat('('); const e = orE(); eat(')'); return e; }
      if (t.v === '-') { eat('-'); const a = atom(); return (r) => -a(r); }
      if (t.k === 'num') { eat(); const v = t.v; return () => v; }
      if (t.k === 'id') { eat(); const f = V.FIELDS[t.v]; if (!f) throw new Error('unknown field "' + t.v + '" (try: ' + Object.keys(V.FIELDS).slice(0, 12).join(', ') + ' …)'); used.add(f); return (r) => { const x = r[f]; return x == null || x === '' ? NaN : +x; }; }
      throw new Error('unexpected "' + t.v + '"');
    };
    const mul = () => { let a = atom(); while (peek() && (peek().v === '*' || peek().v === '/')) { const o = eat().v, l = a, b = atom(); a = o === '*' ? (r) => l(r) * b(r) : (r) => l(r) / b(r); } return a; };
    const add = () => { let a = mul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = eat().v, l = a, b = mul(); a = o === '+' ? (r) => l(r) + b(r) : (r) => l(r) - b(r); } return a; };
    const cmp = () => {
      const a = add(), t = peek(); if (!t || !/^(>=|<=|!=|==|>|<|=)$/.test(t.v)) return (r) => { const x = +a(r); return fin(x) && x !== 0; }; // +: a parenthesised sub-expression yields a boolean
      eat(); const b = add();
      switch (t.v) { case '>': return (r) => a(r) > b(r); case '<': return (r) => a(r) < b(r); case '>=': return (r) => a(r) >= b(r); case '<=': return (r) => a(r) <= b(r); case '!=': return (r) => a(r) !== b(r); default: return (r) => a(r) === b(r); }
    };
    const notE = () => { if (peek() && peek().v === '!') { eat(); const e = notE(); return (r) => !e(r); } return cmp(); };
    const andE = () => { let a = notE(); while (peek() && peek().v === '&&') { eat(); const l = a, b = notE(); a = (r) => l(r) && b(r); } return a; };
    const orE = () => { let a = andE(); while (peek() && peek().v === '||') { eat(); const l = a, b = andE(); a = (r) => l(r) || b(r); } return a; };
    if (!toks.length) throw new Error('empty formula');
    const fn = orE(); if (p < toks.length) throw new Error('unexpected "' + toks[p].v + '"');
    return { fn: (r) => { try { return !!fn(r); } catch (e) { return false; } }, fields: [...used], src: String(src) };
  };
  V.tryCompile = (src) => { try { return { ok: true, f: V.compile(src) }; } catch (e) { return { ok: false, error: e.message }; } };
  /* columnar scan for the worker: cols = field names, data = Float64Array(n × cols.length) (NaN = missing) */
  V.scanColumns = (src, cols, data, n) => {
    const f = V.compile(src), k = cols.length, row = {}, out = new Uint32Array(n); let c = 0;
    for (let i = 0; i < n; i++) { for (let j = 0; j < k; j++) row[cols[j]] = data[i * k + j]; if (f.fn(row)) out[c++] = i; }
    return out.slice(0, c);
  };
  /* index sort over one column, missing values last; stable */
  V.sortIndex = (data, k, col, n, desc) => {
    const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    const d = desc ? -1 : 1;
    return idx.sort((a, b) => { const x = data[a * k + col], y = data[b * k + col], xn = !fin(x), yn = !fin(y); if (xn && yn) return a - b; if (xn) return 1; if (yn) return -1; return x === y ? a - b : (x - y) * d; });
  };
  /* rows that newly match (not matching in the previous pass) → the breakout chime fires for these */
  V.breakouts = (prevSet, ids) => { const fresh = []; for (const id of ids) if (!prevSet.has(id)) fresh.push(id); return fresh; };

  /* ══ 9. CSV → packed OHLCV ══ */
  V.parseCSV = (text) => {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim()); if (!lines.length) return { f: new Float64Array(0), n: 0, error: 'empty file' };
    const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    let head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, '')), start = 1;
    const find = (...names) => head.findIndex((h) => names.includes(h));
    let ix = [find('time', 'timestamp', 'date', 'datetime', 't', 'open time', 'open_time'), find('open', 'o'), find('high', 'h'), find('low', 'l'), find('close', 'c', 'adj close'), find('volume', 'vol', 'v')];
    if (ix.slice(0, 5).some((x) => x < 0)) { if (lines[0].split(sep).every((x) => /^[\d.eE+\-:T Z/"]+$/.test(x.trim()))) { ix = [0, 1, 2, 3, 4, 5]; start = 0; } else return { f: new Float64Array(0), n: 0, error: 'need time, open, high, low, close columns' }; }
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const c = lines[i].split(sep).map((x) => x.trim().replace(/^"|"$/g, '')); const ms = V.toMs(c[ix[0]]);
      const o = +c[ix[1]], h = +c[ix[2]], l = +c[ix[3]], cl = +c[ix[4]], v = ix[5] >= 0 ? +c[ix[5]] || 0 : 0;
      if (!fin(ms) || !(o > 0) || !(h > 0) || !(l > 0) || !(cl > 0)) continue;
      rows.push([Math.floor(ms / 1000), o, Math.max(h, o, cl), Math.min(l, o, cl), cl, v]);
    }
    rows.sort((a, b) => a[0] - b[0]);
    const dedup = rows.filter((r, i) => i === 0 || r[0] !== rows[i - 1][0]);
    return { f: V.pack(dedup), n: dedup.length, error: dedup.length ? null : 'no valid rows' };
  };

  /* ══ 10. clipboard sniper ══ */
  V.detectClip = (raw) => {
    const s = String(raw || '').trim(); if (!s || s.length > 120 || /\s/.test(s)) return null;
    let m = /^(?:https?:\/\/[^\s]*?\/)?(0x[a-fA-F0-9]{40})(?:[/?#].*)?$/.exec(s); if (m) return { kind: 'ca', chain: 'evm', value: m[1] };
    m = /^(?:https?:\/\/[^\s]*?\/)?([1-9A-HJ-NP-Za-km-z]{32,44})(?:[/?#].*)?$/.exec(s); if (m && /[a-z]/.test(m[1]) && /[A-Z1-9]/.test(m[1])) return { kind: 'ca', chain: 'solana', value: m[1] };
    m = /^\$?([A-Za-z]{1,6})(?:[-/](USD|USDT|USDC))?$/.exec(s); if (m && (s[0] === '$' || m[2] || s === s.toUpperCase())) { const b = m[1].toUpperCase(); return { kind: 'ticker', value: m[2] ? b + '-' + m[2].toUpperCase().replace('USDT', 'USD').replace('USDC', 'USD') : b }; }
    return null;
  };

  /* ══ 11. reconnect backoff + heartbeat ══ */
  V.BACKOFF = [500, 1000, 2000];
  V.backoff = (attempt) => V.BACKOFF[Math.min(Math.max(0, attempt | 0), V.BACKOFF.length - 1)];
  V.heartbeat = (ageMs) => (fin(ageMs) && ageMs < 15000 ? 'emerald' : 'amber');
  V.provenance = (live, lagMs) => (live && live.length ? 'LIVE · ' + (fin(lagMs) ? Math.round(lagMs) + 'ms' : '–') + ' · ' + (live.length > 1 ? 'AGGREGATED [' + live.join('·') + ']' : live[0]) : 'RECONNECTING…');

  V.HIGHLIGHTS = ['429 storm shield (single-flight + per-host cooldown + stale fallback)', 'Cross-venue tape: CB · KRK · BIN · BYB · OKX', 'Instant chart switches (L1/L2 candle cache)', 'Screener formula scanner + breakout chime', 'Clipboard CA / ticker sniper', 'Monotonic request epoch'];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V170;
