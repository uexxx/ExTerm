/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.8 pure core (no DOM): Lane 5–8 client maths (Smart Score, context routing, tape row mapping), the full-range
   tick-accurate L2 liquidity ladder, the zero-copy tick pipeline (typed ring buffers, DataView binary frames, 240 Hz
   coalescing, O(1) EMA / ATR / VWAP), Bot Radar predator physics (spring crosshair, orbital lock cycling, volume clock,
   VPIN, velocity cones, ghost trails, icebergs, spoof flashes, cabal tethers, bridge filaments, Mirror Flow / Fade Trap),
   and the self-healing Terminal Brain (BOCPD + HMM cadence, zero-gamma flips, transfer entropy, 60 s flight recorder,
   zero-GC particle pool, hedged RPC failover, dead-feed execution lock).
   Two-signal palette: Bullion Gold #F5C84B (live / buy) and Crimson #EF4444 (alert / sell) on Obsidian #050608–#0A0D12. */
const V178 = (() => {
  const V = {};
  const fin = Number.isFinite, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  V.GOLD = '#F5C84B'; V.RED = '#EF4444'; V.BG = '#050608'; V.BG2 = '#0A0D12';
  V.VER = '17.8';

  /* ══ 1. Lanes 5–8 (client side) ══ */
  V.LANES = [[5, 'Crypto / Perps / On-Chain PnL', 30], [6, 'Stocks / SEC Form 4 / 13F', 30], [7, 'Crypto + DEX Transactions Tape', 25], [8, 'US Stocks Tape / Blocks / L2', 25]]; // [lane, name, warm budget ms]
  V.WINS = ['24h', '7d', '30d'];
  V.smart = (wrPct, n) => (wrPct != null && n >= 2 ? Math.round(wrPct * Math.log(n) * 100) / 100 : 0); // win rate (%) × ln(sample size), same as serve.py
  V.ctxOf = (sym) => (!sym ? 'crypto' : /^oc:/.test(sym) ? 'onchain' : /-(USD|USDT|USDC|EUR)$/.test(sym) ? 'crypto' : 'stocks');
  V.laneOf = (sym) => (V.ctxOf(sym) === 'stocks' ? 8 : 7);
  V.isAddr = (s) => /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(String(s || ''));
  V.short = (s) => (String(s).length > 14 ? String(s).slice(0, 6) + '…' + String(s).slice(-4) : String(s));
  V.money = (v) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'K' : s + '$' + a.toFixed(0); };
  /* lane tape row → V166 tape ingest arguments; synth rows carry a SYNTH venue so they are never mistaken for real prints */
  V.tapeArgs = (sym, r) => {
    if (!r || !(r.px > 0) || !fin(r.t)) return null;
    const who = r.synth ? 'SYNTH' : String(r.who || (V.ctxOf(sym) === 'stocks' ? 'Consolidated' : 'Exchange')).slice(0, 64);
    return { sym, price: r.px, size: r.qty > 0 ? r.qty : r.usd / r.px, side: r.side === 'sell' ? 'sell' : 'buy', ts: r.t, x: { who, usd: r.usd }, agg: (r.tags || []).includes('1M AGG'), block: (r.tags || []).includes('BLOCK') };
  };
  V.dedupeKey = (r) => r.id || r.t + ':' + r.px + ':' + r.usd;
  V.notifyNew = (items, seen, max) => { const out = []; for (const it of items || []) { if (seen.has(it.id)) continue; seen.add(it.id); out.push(it); } if (seen.size > 4000) seen.clear(); return out.slice(0, max || 5); };

  /* ══ 2. full-range tick-accurate L2 liquidity ladder (below AND above price, whole Y axis) ══ */
  /* bin the resting book over [lo, hi]: bids land below mid, asks above; every bin of the visible ladder gets a shelf */
  V.ladder = (book, lo, hi, bins, mid) => {
    const n = bins | 0 || 64, out = new Array(n), step = (hi - lo) / n; if (!(step > 0)) return { bins: [], max: 0, lo, hi, step: 0 };
    for (let j = 0; j < n; j++) out[j] = { lo: lo + step * j, hi: lo + step * (j + 1), bid: 0, ask: 0 };
    const put = (lv, k) => { for (const [p, q] of lv || []) { if (!(p >= lo && p < hi && q > 0)) continue; out[Math.min(n - 1, Math.floor((p - lo) / step))][k] += q * p; } };
    put(book && book.bids, 'bid'); put(book && book.asks, 'ask');
    let max = 0; for (const b of out) { if (mid > 0) { if (b.hi <= mid) b.ask = 0; if (b.lo >= mid) b.bid = 0; } max = Math.max(max, b.bid, b.ask); }
    return { bins: out, max, lo, hi, step };
  };
  /* when the real book only covers a few ticks, extend it across the whole visible range with a decaying resting-depth model
     anchored on the real top-of-book size (model: true), so shelves exist below and above every candle */
  V.extendBook = (book, mid, lo, hi, levels, seed) => {
    const b = { bids: (book && book.bids ? book.bids.slice() : []), asks: (book && book.asks ? book.asks.slice() : []), model: false };
    if (!(mid > 0) || !(hi > lo)) return b; const L = levels || 48, top = (b.bids[0] && b.bids[0][1]) || (b.asks[0] && b.asks[0][1]) || 1;
    const minB = b.bids.length ? Math.min(...b.bids.map((x) => x[0])) : mid, maxA = b.asks.length ? Math.max(...b.asks.map((x) => x[0])) : mid;
    let s = (seed >>> 0) || 1; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    if (minB > lo) { const st = (minB - lo) / L; for (let i = 1; i <= L; i++) { const p = minB - st * i; if (p < lo) break; b.bids.push([p, top * (0.6 + 1.8 * rnd()) * (1 + (i % 7 === 0 ? 2.5 : 0))]); } b.model = true; }
    if (maxA < hi) { const st = (hi - maxA) / L; for (let i = 1; i <= L; i++) { const p = maxA + st * i; if (p > hi) break; b.asks.push([p, top * (0.6 + 1.8 * rnd()) * (1 + (i % 7 === 0 ? 2.5 : 0))]); } b.model = true; }
    return b;
  };
  /* per-tick shelf state: thickness eases toward the live size, bevel glow spikes when a shelf changes (every single tick) */
  class Shelves {
    constructor(n) { this.n = n || 64; this.w = new Float32Array(this.n * 2); this.glow = new Float32Array(this.n * 2); this.ticks = 0; }
    apply(L, alpha) {
      const a = alpha == null ? 0.55 : alpha; if (L.bins.length !== this.n) { this.n = L.bins.length; this.w = new Float32Array(this.n * 2); this.glow = new Float32Array(this.n * 2); }
      for (let j = 0; j < this.n; j++) for (let k = 0; k < 2; k++) { const v = L.max > 0 ? (k ? L.bins[j].ask : L.bins[j].bid) / L.max : 0, i = j * 2 + k, d = Math.abs(v - this.w[i]); this.w[i] += (v - this.w[i]) * a; this.glow[i] = Math.min(1, this.glow[i] * 0.86 + d * 3); }
      this.ticks++; return this;
    }
  }
  V.Shelves = Shelves;

  /* ══ 3. zero-copy tick pipeline ══ */
  /* fixed typed ring: [t, p, v] triplets in one Float64Array (SharedArrayBuffer when the page is cross-origin isolated) */
  class TickRing {
    constructor(cap, shared) { this.cap = cap || 4096; const bytes = this.cap * 3 * 8, SAB = shared && typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : ArrayBuffer; this.buf = new SAB(bytes); this.f = new Float64Array(this.buf); this.n = 0; this.shared = SAB !== ArrayBuffer; }
    push(t, p, v) { const i = (this.n % this.cap) * 3; this.f[i] = t; this.f[i + 1] = p; this.f[i + 2] = v || 0; return this.n++; }
    get size() { return Math.min(this.n, this.cap); }
    at(seq) { const i = (seq % this.cap) * 3; return [this.f[i], this.f[i + 1], this.f[i + 2]]; }
    last() { return this.n ? this.at(this.n - 1) : null; }
  }
  V.TickRing = TickRing;
  /* binary frame: u32 count, then count × (f64 t, f64 p, f32 v) little-endian = 20 bytes per tick */
  V.FRAME = 20;
  V.encodeTicks = (ticks) => { const b = new ArrayBuffer(4 + ticks.length * V.FRAME), d = new DataView(b); d.setUint32(0, ticks.length, true); ticks.forEach((k, i) => { const o = 4 + i * V.FRAME; d.setFloat64(o, k[0], true); d.setFloat64(o + 8, k[1], true); d.setFloat32(o + 16, k[2] || 0, true); }); return b; };
  V.decodeTicks = (buf, ring) => { const d = new DataView(buf), n = d.getUint32(0, true); if (4 + n * V.FRAME > buf.byteLength) return 0; for (let i = 0; i < n; i++) { const o = 4 + i * V.FRAME; ring.push(d.getFloat64(o, true), d.getFloat64(o + 8, true), d.getFloat32(o + 16, true)); } return n; };
  /* 240 Hz coalescer: ticks inside one 4.16 ms window collapse into one update per symbol (last price, summed size) */
  V.COALESCE_MS = 1000 / 240;
  class Coalescer {
    constructor(ms) { this.ms = ms || V.COALESCE_MS; this.m = new Map(); this.at = 0; this.in = 0; this.out = 0; }
    add(sym, p, v, t) { this.in++; const o = this.m.get(sym); if (o) { o.p = p; o.v += v || 0; o.t = t; o.n++; } else this.m.set(sym, { sym, p, v: v || 0, t, n: 1 }); }
    flush(now) { if (now - this.at < this.ms || !this.m.size) return null; this.at = now; const r = [...this.m.values()]; this.m.clear(); this.out += r.length; return r; }
  }
  V.Coalescer = Coalescer;
  /* O(1) incremental indicators: one update per tick / bar, no re-scan */
  class EMA { constructor(n) { this.k = 2 / ((n || 20) + 1); this.v = null; } push(x) { this.v = this.v == null ? x : this.v + (x - this.v) * this.k; return this.v; } }
  class ATR { constructor(n) { this.n = n || 14; this.v = null; this.pc = null; this.c = 0; } push(h, l, c) { const tr = this.pc == null ? h - l : Math.max(h - l, Math.abs(h - this.pc), Math.abs(l - this.pc)); this.pc = c; this.c++; this.v = this.v == null ? tr : this.v + (tr - this.v) / Math.min(this.n, this.c); return this.v; } }
  class VWAP { constructor() { this.pv = 0; this.vv = 0; } push(p, v) { this.pv += p * v; this.vv += v; return this.vv > 0 ? this.pv / this.vv : p; } reset() { this.pv = this.vv = 0; } }
  Object.assign(V, { EMA, ATR, VWAP });

  /* ══ 4. Bot Radar predator physics ══ */
  /* damped spring (semi-implicit Euler): the Gold magnetic crosshair glides onto its target with inertia */
  V.spring = (s, tx, ty, dt, k, c) => { const K = k || 180, C = c || 22, h = Math.min(0.05, dt || 0.016); s.vx += (K * (tx - s.x) - C * s.vx) * h; s.vy += (K * (ty - s.y) - C * s.vy) * h; s.x += s.vx * h; s.y += s.vy * h; return s; };
  /* the top 5 Inner-Ring executors by recent volume; [ / ] cycle the orbital lock through them */
  V.top5 = (bots) => bots.filter((b) => b.ring === 0 && (b.kind === 'executor' || b.kind === 'sniper' || b.kind === 'mev' || b.kind === 'whale')).sort((a, b) => b.usd - a.usd || b.last - a.last).slice(0, 5);
  V.cycle = (list, cur, dir) => { if (!list.length) return null; const i = list.findIndex((b) => b.id === cur); if (i < 0) return (dir > 0 ? list[0] : list[list.length - 1]).id; return list[(i + (dir > 0 ? 1 : -1) + list.length) % list.length].id; };
  /* Volume Clock: sweep angular speed follows tick velocity (ticks / s), not wall time */
  V.sweepSpeed = (tps) => clamp(0.35 + Math.log1p(Math.max(0, tps)) * 0.55, 0.35, 4.2);
  /* VPIN over equal-volume buckets: mean |buy − sell| / bucket volume */
  V.vpin = (buckets) => { let s = 0, n = 0; for (const b of buckets) { const t = b.buy + b.sell; if (t > 0) { s += Math.abs(b.buy - b.sell) / t; n++; } } return n ? s / n : 0; };
  class VpinBuckets {
    constructor(size, keep) { this.size = size || 50000; this.keep = keep || 50; this.cur = { buy: 0, sell: 0 }; this.b = []; }
    close() { this.b.push(this.cur); if (this.b.length > this.keep) this.b.shift(); this.cur = { buy: 0, sell: 0 }; }
    add(usd, side) { let u = usd > 0 ? usd : 0, guard = 0; while (u > 1e-9 && guard++ < 400) { const room = this.size - this.cur.buy - this.cur.sell; if (room <= 1e-9) { this.close(); continue; } const take = Math.min(room, u); this.cur[side === 'sell' ? 'sell' : 'buy'] += take; u -= take; if (room - take <= 1e-9) this.close(); } } // size may shrink live: an over-full bucket closes, never loops
    value() { return V.vpin(this.b); }
  }
  V.VpinBuckets = VpinBuckets; V.VPIN_ALERT = 0.75;
  /* velocity cone: projected arc over the next 5–30 s (wider = less certain), from angular velocity */
  V.cone = (a, w, horizon) => { const H = clamp(horizon || 15, 5, 30), sweep = w * H; return { a0: a, a1: a + sweep, spread: clamp(0.08 + Math.abs(sweep) * 0.12, 0.08, 0.9) }; };
  /* 60 s ghost trail: fixed ring of positions sampled at 2 Hz (120 points) */
  class Ghost { constructor(n) { this.n = n || 120; this.x = new Float32Array(this.n); this.y = new Float32Array(this.n); this.t = new Float64Array(this.n); this.k = 0; } add(x, y, t) { if (this.k && t - this.t[(this.k - 1) % this.n] < 500) return false; const i = this.k % this.n; this.x[i] = x; this.y[i] = y; this.t[i] = t; this.k++; return true; } pts(now) { const out = []; for (let j = Math.max(0, this.k - this.n); j < this.k; j++) { const i = j % this.n; if (now - this.t[i] <= 60000) out.push([this.x[i], this.y[i], (now - this.t[i]) / 60000]); } return out; } }
  V.Ghost = Ghost;
  /* iceberg: ≥ 3 same-size refills at one price inside 10 s (a hidden order reloading its visible clip) */
  V.iceberg = (prints) => { const m = new Map(); for (const p of prints) { const k = p.px.toPrecision(8) + '|' + Math.round(p.usd / 10); const o = m.get(k) || []; o.push(p.t); m.set(k, o); } for (const ts of m.values()) { ts.sort((a, b) => a - b); for (let i = 2; i < ts.length; i++) if (ts[i] - ts[i - 2] <= 10000) return true; } return false; };
  /* spoof: a resting level ≥ 3× the median shelf vanishes without a print near it */
  V.spoofs = (prev, cur, printsNear) => { if (!prev || !cur || prev.bins.length !== cur.bins.length) return []; const sz = []; for (const b of prev.bins) { if (b.bid) sz.push(b.bid); if (b.ask) sz.push(b.ask); } if (!sz.length) return []; sz.sort((a, b) => a - b); const med = sz[sz.length >> 1], out = []; prev.bins.forEach((b, j) => { for (const k of ['bid', 'ask']) if (b[k] >= 3 * med && cur.bins[j][k] < b[k] * 0.25 && !printsNear(b.lo, b.hi)) out.push({ j, side: k, usd: b[k], p: (b.lo + b.hi) / 2 }); }); return out; };
  /* cabal: actors that print the same side inside 300 ms of each other ≥ 3 times → the top 3 pairs become Slot 0–2 tethers */
  V.cabal = (prints) => { const P = prints.slice().sort((a, b) => a.t - b.t), c = new Map(); for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length && P[j].t - P[i].t <= 300; j++) { if (P[i].id === P[j].id || P[i].side !== P[j].side) continue; const k = P[i].id < P[j].id ? P[i].id + '|' + P[j].id : P[j].id + '|' + P[i].id; c.set(k, (c.get(k) || 0) + 1); } return [...c].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n], slot) => { const [a, b] = k.split('|'); return { slot, a, b, n }; }); };
  /* cross-chain bridge filament: two ≥ $250K on-chain whale prints on different chains inside 60 s */
  V.BRIDGE_USD = 250000;
  V.bridges = (prints) => { const W = prints.filter((p) => p.usd >= V.BRIDGE_USD && /^oc:/.test(p.sym)).sort((a, b) => a.t - b.t), out = []; for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length && W[j].t - W[i].t <= 60000; j++) { const ca = W[i].sym.split(':')[1], cb = W[j].sym.split(':')[1]; if (ca !== cb) out.push({ a: W[i].id, b: W[j].id, usd: Math.min(W[i].usd, W[j].usd), chains: ca + '→' + cb }); } return out.slice(-6); };
  /* target-lock pill: does following this bot pay? aligned with the move since its first print → MIRROR FLOW, against it → FADE TRAP */
  V.lockPill = (net, px0, px1) => { if (!(px0 > 0 && px1 > 0) || Math.abs(net) < 0.2) return null; const mv = px1 / px0 - 1; if (Math.abs(mv) < 1e-5) return null; return Math.sign(mv) === Math.sign(net) ? 'MIRROR FLOW' : 'FADE TRAP'; };
  class History { constructor(n) { this.n = n || 10; this.a = []; } push(s, t) { if (this.a.length && this.a[0].s === s && t - this.a[0].t < 4000) return; this.a.unshift({ s, t }); if (this.a.length > this.n) this.a.length = this.n; } }
  V.History = History;

  /* ══ 5. self-healing Terminal Brain ══ */
  /* BOCPD (Adams & MacKay) with a constant hazard and a Normal-Gamma prior (Student-t predictive), run length truncated */
  class BOCPD {
    constructor(hazard, maxR) { this.h = hazard || 1 / 60; this.max = maxR || 120; this.R = new Float64Array([1]); this.mu = [0]; this.k = [1]; this.a = [1]; this.b = [1]; this.cp = 0; this.map = 0; this.t = 0; }
    push(x) {
      const n = this.R.length, pred = new Float64Array(n);
      for (let r = 0; r < n; r++) { const nu = 2 * this.a[r], sc = Math.sqrt((this.b[r] * (this.k[r] + 1)) / (this.a[r] * this.k[r])), z = (x - this.mu[r]) / sc; pred[r] = Math.exp(lgam((nu + 1) / 2) - lgam(nu / 2) - 0.5 * Math.log(nu * Math.PI) - Math.log(sc) - ((nu + 1) / 2) * Math.log1p((z * z) / nu)); }
      const m = Math.min(n + 1, this.max), R2 = new Float64Array(m); let cp = 0;
      for (let r = 0; r < n; r++) { const g = this.R[r] * pred[r]; cp += g * this.h; if (r + 1 < m) R2[r + 1] += g * (1 - this.h); }
      R2[0] = cp; let s = 0; for (let r = 0; r < m; r++) s += R2[r]; if (!(s > 0)) { R2.fill(0); R2[0] = 1; s = 1; } for (let r = 0; r < m; r++) R2[r] /= s;
      const mu = [0], k = [1], a = [1], b = [1];
      for (let r = 0; r < m - 1 && r < n; r++) { mu.push((this.k[r] * this.mu[r] + x) / (this.k[r] + 1)); k.push(this.k[r] + 1); a.push(this.a[r] + 0.5); b.push(this.b[r] + (this.k[r] * (x - this.mu[r]) ** 2) / (2 * (this.k[r] + 1))); }
      this.R = R2; this.mu = mu; this.k = k; this.a = a; this.b = b; this.cp = 0; for (let r = 0; r < Math.min(6, m); r++) this.cp += R2[r]; /* P(run length ≤ 5): with a constant hazard P(r = 0) alone is always h */ let best = 0; for (let r = 1; r < m; r++) if (R2[r] > R2[best]) best = r; this.map = best; this.t++; return this;
    }
  }
  const lgam = (z) => { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (const c of g) ser += c / ++y; return -tmp + Math.log((2.5066282746310005 * ser) / x); };
  V.BOCPD = BOCPD;
  /* 2-state Gaussian HMM forward filter: CALM vs STRESS on the event-rate / |return| series */
  class HMM2 {
    constructor(mu, sd, stay) { this.mu = mu || [0, 3]; this.sd = sd || [1, 2]; this.st = stay || 0.95; this.p = [0.9, 0.1]; }
    push(x) { const A = this.st, pr = [this.p[0] * A + this.p[1] * (1 - A), this.p[0] * (1 - A) + this.p[1] * A], l = (i) => Math.exp(-0.5 * ((x - this.mu[i]) / this.sd[i]) ** 2) / this.sd[i], q = [pr[0] * l(0), pr[1] * l(1)], s = q[0] + q[1]; this.p = s > 0 ? [q[0] / s, q[1] / s] : [0.5, 0.5]; return this; }
    get stress() { return this.p[1]; }
  }
  V.HMM2 = HMM2;
  /* harmonic cadence: calm + long run → slow breathing (0.6×); stress or a fresh change point → fast (up to 2.2×) */
  V.cadence = (cp, mapR, stress) => clamp(0.6 + stress * 1.2 + cp * 2 + (mapR < 5 ? 0.3 : 0), 0.6, 2.2);
  V.zeroGammaFlip = (p0, p1, flip) => flip > 0 && p0 > 0 && p1 > 0 && (p0 - flip) * (p1 - flip) < 0;
  /* transfer entropy X → Y (bits), k = 1, series discretised into `bins` quantiles */
  V.disc = (a, bins) => { const s = Float64Array.from(a).sort(), q = []; for (let i = 1; i < bins; i++) q.push(s[Math.floor((i * s.length) / bins)]); return Array.from(a, (v) => { let k = 0; while (k < q.length && v > q[k]) k++; return k; }); };
  V.transferEntropy = (x, y, bins) => {
    const B = bins || 3, n = Math.min(x.length, y.length); if (n < 8) return 0; const X = V.disc(x.slice(0, n), B), Y = V.disc(y.slice(0, n), B), c3 = new Map(), c2a = new Map(), c2b = new Map(), c1 = new Map(), inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (let t = 0; t < n - 1; t++) { inc(c3, Y[t + 1] + ',' + Y[t] + ',' + X[t]); inc(c2a, Y[t] + ',' + X[t]); inc(c2b, Y[t + 1] + ',' + Y[t]); inc(c1, '' + Y[t]); }
    let te = 0; const N = n - 1; for (const [k, v] of c3) { const [y1, y0, x0] = k.split(','), p = v / N, a = v / c2a.get(y0 + ',' + x0), b = c2b.get(y1 + ',' + y0) / c1.get(y0); te += p * Math.log2(a / b); } return Math.max(0, te);
  };
  /* 60 s flight recorder: 10 Hz × 60 s = 600 frames, up to 48 node activities quantised to one byte each (+ hot bit) */
  class FlightRec {
    constructor(frames, nodes) { this.F = frames || 600; this.N = nodes || 48; this.a = new Uint8Array(this.F * this.N); this.t = new Float64Array(this.F); this.k = 0; this.ids = []; }
    record(t, nodes) { if (this.k && t - this.t[(this.k - 1) % this.F] < 95) return false; const f = this.k % this.F, o = f * this.N; if (!this.ids.length || this.ids.length !== Math.min(this.N, nodes.length)) this.ids = nodes.slice(0, this.N).map((n) => n.id); for (let i = 0; i < this.N; i++) { const n = nodes[i]; this.a[o + i] = n ? (Math.round(clamp(n.act, 0, 1) * 127) | (n.hot ? 128 : 0)) : 0; } this.t[f] = t; this.k++; return true; }
    get len() { return Math.min(this.k, this.F); }
    frame(back) { const b = clamp(back | 0, 0, this.len - 1), f = (this.k - 1 - b) % this.F, o = f * this.N, out = []; for (let i = 0; i < this.N; i++) { const v = this.a[o + i]; out.push({ act: (v & 127) / 127, hot: v >> 7 }); } return { t: this.t[f], nodes: out }; }
    export() { const L = this.len, head = 16, buf = new ArrayBuffer(head + L * (8 + this.N)), d = new DataView(buf); d.setUint32(0, 0x58543138, true); d.setUint16(4, L, true); d.setUint16(6, this.N, true); d.setFloat64(8, Date.now(), true); for (let j = 0; j < L; j++) { const f = (this.k - L + j) % this.F, o = head + j * (8 + this.N); d.setFloat64(o, this.t[f], true); new Uint8Array(buf, o + 8, this.N).set(this.a.subarray(f * this.N, f * this.N + this.N)); } return buf; }
  }
  V.FlightRec = FlightRec;
  /* zero-GC particle pool: one pre-allocated Float32Array [x, y, vx, vy, life, kind] × cap; spawn / step never allocate */
  class Particles {
    constructor(cap) { this.cap = cap || 512; this.d = new Float32Array(this.cap * 6); this.live = 0; this.head = 0; }
    spawn(x, y, vx, vy, life, kind) { const i = (this.head++ % this.cap) * 6, d = this.d; if (!(d[i + 4] > 0)) this.live++; d[i] = x; d[i + 1] = y; d[i + 2] = vx; d[i + 3] = vy; d[i + 4] = life; d[i + 5] = kind || 0; }
    step(dt) { const d = this.d; let n = 0; for (let i = 0; i < d.length; i += 6) { if (!(d[i + 4] > 0)) continue; d[i] += d[i + 2] * dt; d[i + 1] += d[i + 3] * dt; d[i + 4] -= dt; if (d[i + 4] > 0) n++; } this.live = n; return n; }
  }
  V.Particles = Particles;
  /* hedged failover: the primary gets `budget` ms; then the next endpoint fires too; the first success wins (< 50 ms switch) */
  V.FAILOVER_MS = 50;
  V.hedge = (fns, budget) => new Promise((resolve, reject) => {
    let i = 0, done = false, fails = 0; const B = budget == null ? V.FAILOVER_MS : budget, t0 = Date.now(), timers = [];
    const fire = () => { if (done || i >= fns.length) return; const k = i++; Promise.resolve().then(() => fns[k]()).then((v) => { if (done) return; done = true; timers.forEach(clearTimeout); resolve({ v, k, ms: Date.now() - t0 }); }, () => { fails++; if (fails >= fns.length && !done) { done = true; timers.forEach(clearTimeout); reject(new Error('all endpoints failed')); } else fire(); }); if (i < fns.length) timers.push(setTimeout(fire, B)); };
    fire();
  });
  V.DEAD_MS = 5000;
  V.deadFeed = (lastTick, now) => !(lastTick > 0) || now - lastTick > V.DEAD_MS;
  V.SOLO = ['feed', 'proc', 'bot', 'lane'];
  V.soloFilter = (graph, g) => { if (!g) return graph; const keep = new Set(['core']); for (const n of graph.nodes) if (n.g === g) keep.add(n.id); for (const e of graph.edges) if (keep.has(e.a)) keep.add(e.b); return { nodes: graph.nodes.filter((n) => keep.has(n.id)), edges: graph.edges.filter((e) => keep.has(e.a) && keep.has(e.b)) }; };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V178;
