/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.7 pure core (no DOM): the 4-tab map, the 24/7 Bot Radar population model (fingerprint → archetype → proximity
   ring → micro-HUD), the 2D tactile depth-layer geometry for the 1s–1m chart, and the Terminal Brain graph mapping.
   Two-signal palette: Bullion Gold #F5C84B (live / buy) and Crimson #EF4444 (alert / sell / threat) on Obsidian #050608–#0A0D12. */
const V177 = (() => {
  const V = {};
  const fin = Number.isFinite, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  V.GOLD = '#F5C84B'; V.RED = '#EF4444'; V.BG = '#050608'; V.BG2 = '#0A0D12';
  V.PALETTE = ['#F5C84B', '#EF4444', '#050608', '#0A0D12'];

  /* ══ 1. strictly 4 top-level tabs; every legacy workspace still exists but belongs to one of them ══ */
  V.TABS = [['botradar', '24/7 Bot Radar'], ['brain', 'Terminal Brain'], ['livebot', '24/7 Optional Live Bot'], ['copilot', 'Co-Pilot / Paper']];
  V.ENTRY = { botradar: 'botradar', brain: 'brain', livebot: 'fleet', copilot: 'markets' };
  V.railOf = (tab) => (tab === 'botradar' || tab === 'brain' ? tab : tab === 'fleet' ? 'livebot' : 'copilot');
  V.FULL = ['botradar', 'brain'];

  /* ══ 2. 24/7 Bot Radar population model ══ */
  V.KINDS = ['scanner', 'staging', 'executor', 'sniper', 'mev', 'whale'];
  V.RING = { scanner: 2, staging: 1, executor: 0, sniper: 0, mev: 0, whale: 0 }; // 0 inner · 1 middle · 2 outer
  V.RING_R = [0.3, 0.6, 0.9];
  V.WHALE_USD = 25000; V.BLOCK_USD = 100000; V.TTL = 180000; V.CAP = 360;
  /* 2 significant digits: an algo re-using the same clip size lands in the same bucket */
  V.qb = (q) => { if (!(q > 0)) return '0'; const e = Math.floor(Math.log10(q)) - 1, m = Math.round(q / 10 ** e); return m + 'e' + e; };
  V.sig = (p) => (p.who ? 'w:' + p.who : p.sym + '|' + (p.side === 'sell' ? 's' : 'b') + '|' + V.qb(p.qty > 0 ? p.qty : p.usd / (p.px || 1)));
  V.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const blank = (id, p) => ({ id, sym: p.sym, who: p.who || '', n: 0, usd: 0, buy: 0, sell: 0, first: p.t, last: p.t, gapS: 0, gapS2: 0, gapN: 0, maxUsd: 0, lastUsd: 0, lastSide: p.side, flip: 0, sweep: 0, burst: [], flags: 0, ageH: p.ageH, kind: 'scanner', ring: 2, pulse: 0 });
  V.F = { SANDWICH: 1, SWEEP: 2, BURST: 4, BLOCK: 8 };
  class Pop {
    constructor(cap) { this.cap = cap || V.CAP; this.m = new Map(); this.total = 0; this.recent = []; this.prints = 0; }
    feed(p) {
      if (!(p && p.sym && p.usd > 0 && fin(p.t))) return null;
      const id = V.sig(p); let b = this.m.get(id); if (!b) { b = blank(id, p); this.m.set(id, b); if (this.m.size > this.cap) this.evict(); }
      if (b.n) { const g = p.t - b.last; if (g >= 0) { b.gapS += g; b.gapS2 += g * g; b.gapN++; } if (p.side !== b.lastSide && g >= 0 && g < 1500) { b.flip++; if (b.lastUsd > 0 && Math.abs(p.usd / b.lastUsd - 1) < 0.35) b.flags |= V.F.SANDWICH; } }
      b.n++; b.usd += p.usd; if (p.side === 'sell') b.sell += p.usd; else b.buy += p.usd; b.last = p.t; b.lastSide = p.side; b.lastUsd = p.usd; b.maxUsd = Math.max(b.maxUsd, p.usd); if (p.ageH != null) b.ageH = p.ageH;
      if (p.usd >= V.BLOCK_USD) b.flags |= V.F.BLOCK;
      b.burst.push(p.t); while (b.burst.length && p.t - b.burst[0] > 1000) b.burst.shift(); if (b.burst.length >= 5) b.flags |= V.F.BURST;
      /* sweep: ≥ 3 same-side prints of one symbol inside 1 s, any actor → the participants are executing, not scanning */
      const R = this.recent; R.push({ t: p.t, sym: p.sym, side: p.side, id }); while (R.length && p.t - R[0].t > 1000) R.shift(); if (R.length > 64) R.shift();
      let same = 0; for (const r of R) if (r.sym === p.sym && r.side === p.side) same++;
      if (same >= 3) for (const r of R) if (r.sym === p.sym && r.side === p.side) { const o = this.m.get(r.id); if (o && !(o.flags & V.F.SWEEP)) { o.flags |= V.F.SWEEP; o.sweep++; if (o !== b) V.classify(o); } }
      b.pulse = p.t; this.total += p.usd; this.prints++; V.classify(b); return b;
    }
    evict() { let old = null; for (const b of this.m.values()) if (!old || b.last < old.last) old = b; if (old) this.m.delete(old.id); }
    prune(now) { for (const [k, b] of this.m) if (now - b.last > V.TTL) this.m.delete(k); }
    list() { return [...this.m.values()]; }
  }
  V.Pop = Pop;
  V.cv = (b) => { if (b.gapN < 2) return null; const m = b.gapS / b.gapN, v = Math.max(0, b.gapS2 / b.gapN - m * m); return m > 0 ? Math.sqrt(v) / m : null; };
  V.rate = (b) => (b.gapN ? 1000 / Math.max(1, b.gapS / b.gapN) : 0); // prints per second
  V.classify = (b) => {
    const cv = V.cv(b), r = V.rate(b);
    let k = 'scanner';
    if (b.flags & V.F.SANDWICH && b.flip >= 2) k = 'mev';
    else if (b.maxUsd >= V.WHALE_USD) k = 'whale';
    else if (b.ageH != null && b.ageH < 1 && b.n >= 2 && b.buy > b.sell) k = 'sniper';
    else if ((b.flags & (V.F.SWEEP | V.F.BURST)) || (b.n >= 3 && r >= 1)) k = 'executor';
    else if (b.n >= 3 && cv != null && cv < 0.45) k = 'staging';
    else if (b.n >= 4) k = 'staging';
    b.kind = k; b.ring = V.RING[k]; return k;
  };
  V.net = (b) => { const t = b.buy + b.sell; return t > 0 ? (b.buy - b.sell) / t : 0; };
  V.FILTERS = [['all', 'All'], ['exec', 'Executors'], ['mev', 'MEV/Whales']];
  V.pass = (b, f) => (f === 'exec' ? b.kind === 'executor' || b.kind === 'sniper' : f === 'mev' ? b.kind === 'mev' || b.kind === 'whale' : true);
  /* micro-HUD: Active Bots · Bot Volume Share % · Net Bot Pressure (−100 sell … +100 buy) over the live window */
  V.hud = (bots, now, winMs, tapeUsd) => {
    let n = 0, usd = 0, buy = 0, sell = 0; const w = winMs || 60000;
    for (const b of bots) { if (now - b.last > w) continue; if (b.kind === 'scanner' && b.n < 2) continue; n++; usd += b.usd; buy += b.buy; sell += b.sell; }
    const t = buy + sell, all = tapeUsd > 0 ? tapeUsd : 0;
    return { active: n, share: all > 0 ? clamp((usd / all) * 100, 0, 100) : 0, pressure: t > 0 ? ((buy - sell) / t) * 100 : 0 };
  };
  /* anomaly callouts: only these ever get a text tag on the radar */
  V.anomaly = (b, now) => {
    if (now - b.pulse > 4000) return null;
    if (b.flags & V.F.SANDWICH && b.kind === 'mev') return 'MEV SANDWICH';
    if (b.flags & V.F.BLOCK) return 'BLOCK $' + Math.round(b.maxUsd / 1000) + 'K';
    if (b.flags & V.F.BURST) return 'BURST ' + b.burst.length + '/s';
    if (b.kind === 'sniper') return 'SNIPER';
    return null;
  };
  /* deterministic polar slot: angle from the fingerprint, radius from the ring (± 4 % so a ring never collapses to a circle of overlaps) */
  V.slot = (b) => { const h = V.hash(b.id); return { a: h * Math.PI * 2, r: V.RING_R[b.ring] * (0.96 + V.hash(b.id + '~') * 0.08) }; };
  V.angVel = (b) => clamp(0.04 + V.rate(b) * 0.18, 0.04, 1.4) * (V.net(b) >= 0 ? 1 : -1); // rad / s: busier bots orbit faster, sellers counter-rotate
  V.shape = (k) => ({ scanner: 'dot', staging: 'tail', executor: 'diamond', sniper: 'tri', mev: 'square', whale: 'ring' }[k] || 'dot');
  V.colorOf = (b) => (b.kind === 'mev' ? V.RED : V.net(b) < -0.2 ? V.RED : V.net(b) > 0.2 ? V.GOLD : 'dim');
  V.pick = (pts, x, y, rad) => { let best = null, bd = rad; for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } } return best; };
  V.p95 = (a) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };

  /* ══ 3. tactile 2D depth layers (pure geometry on the live candle array D: {t,o,h,l,c,v}) ══ */
  V.DEPTH = [
    ['grid', 'Parallax Depth Grid', true], ['vol', 'Volumetric Gradient', true], ['bevel', 'Extruded Bevel Candles', true], ['glow', 'Glow Halos', true],
    ['ob', 'OB Slabs', true], ['vpvr', 'VPVR / POC Shelf', true], ['whale', 'Whale Beacons', true],
    ['cvd', 'CVD Pillars', false], ['gex', 'GEX Bands', false], ['liq', 'Liq Pools', false], ['fvg', 'FVG Tunnels', false], ['avwap', 'AVWAP Canyon', false], ['rr', 'R:R Hologram', false],
  ];
  V.depthDefaults = () => { const o = {}; for (const [k, , d] of V.DEPTH) o[k] = d; return o; };
  V.depthState = (s) => { const o = V.depthDefaults(); if (s && typeof s === 'object') for (const k of Object.keys(o)) if (typeof s[k] === 'boolean') o[k] = s[k]; return o; };
  const body = (k) => Math.abs(k.c - k.o);
  V.vpvr = (D, a, b, bins) => {
    const n = bins || 24; let lo = Infinity, hi = -Infinity; for (let i = a; i < b; i++) { if (D[i].l < lo) lo = D[i].l; if (D[i].h > hi) hi = D[i].h; }
    if (!(hi > lo)) return { bins: [], poc: -1, lo, hi }; const out = []; for (let j = 0; j < n; j++) out.push({ lo: lo + ((hi - lo) * j) / n, hi: lo + ((hi - lo) * (j + 1)) / n, v: 0, buy: 0 });
    for (let i = a; i < b; i++) { const k = D[i], j = clamp(Math.floor((((k.h + k.l + k.c) / 3 - lo) / (hi - lo)) * n), 0, n - 1); out[j].v += k.v || 0; if (k.c >= k.o) out[j].buy += k.v || 0; }
    let poc = 0; for (let j = 1; j < n; j++) if (out[j].v > out[poc].v) poc = j; return { bins: out, poc, lo, hi };
  };
  /* order block: the last opposite-colour candle before an impulsive candle (body ≥ 1.8 × average body) */
  V.obZones = (D, a, b, max) => {
    let s = 0, n = 0; for (let i = a; i < b; i++) { s += body(D[i]); n++; } const avg = n ? s / n : 0, out = []; if (!(avg > 0)) return out;
    for (let i = Math.max(a + 1, 1); i < b; i++) { const k = D[i], p = D[i - 1]; if (body(k) < 1.8 * avg) continue; const bull = k.c > k.o; if (bull === p.c > p.o) continue; out.push({ i: i - 1, top: Math.max(p.o, p.c), bot: Math.min(p.o, p.c), bull }); }
    return out.slice(-(max || 4));
  };
  V.fvg = (D, a, b, max) => { const out = []; for (let i = Math.max(a + 1, 1); i < b - 1; i++) { const L = D[i - 1], R = D[i + 1]; if (L.h < R.l) out.push({ i, top: R.l, bot: L.h, bull: true }); else if (L.l > R.h) out.push({ i, top: L.l, bot: R.h, bull: false }); } return out.slice(-(max || 5)); };
  V.whales = (D, a, b, k) => { let s = 0, s2 = 0, n = 0; for (let i = a; i < b; i++) { const v = D[i].v || 0; s += v; s2 += v * v; n++; } if (n < 5) return []; const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)), th = m + (k || 2.5) * sd, out = []; for (let i = a; i < b; i++) if ((D[i].v || 0) > th && sd > 0) out.push(i); return out; };
  V.liqPools = (D, a, b, max) => { const hi = [], lo = []; for (let i = Math.max(a + 2, 2); i < b - 2; i++) { const k = D[i]; if (k.h > D[i - 1].h && k.h > D[i - 2].h && k.h >= D[i + 1].h && k.h >= D[i + 2].h) hi.push({ i, p: k.h }); if (k.l < D[i - 1].l && k.l < D[i - 2].l && k.l <= D[i + 1].l && k.l <= D[i + 2].l) lo.push({ i, p: k.l }); } return { hi: hi.slice(-(max || 3)), lo: lo.slice(-(max || 3)) }; };
  V.cvd = (D, a, b) => { const out = new Float64Array(Math.max(0, b - a)); let c = 0; for (let i = a; i < b; i++) { const k = D[i]; c += (k.c >= k.o ? 1 : -1) * (k.v || 0); out[i - a] = c; } return out; };
  V.avwap = (D, a, b) => { const out = new Float64Array(Math.max(0, b - a)); let pv = 0, vv = 0; for (let i = a; i < b; i++) { const k = D[i], v = k.v || 0, tp = (k.h + k.l + k.c) / 3; pv += tp * v; vv += v; out[i - a] = vv > 0 ? pv / vv : tp; } return out; };
  /* the depth light: shadow offset grows with the bar's volume rank (taller extrusion = more traded) */
  V.extrude = (v, vmax, bw) => { const r = vmax > 0 ? clamp(v / vmax, 0, 1) : 0; return { dx: clamp(bw * 0.35, 1, 4) * (0.6 + r), dy: 1 + 3 * r, a: 0.18 + 0.32 * r }; };
  V.parallax = (off, bars, depth) => ((off || 0) / Math.max(1, bars || 1)) * (depth || 1);

  /* ══ 4. Terminal Brain graph: every background process as a node, telemetry → velocity · pulse · tension · colour ══ */
  V.brainGraph = (snap) => {
    const nodes = [{ id: 'core', l: 'EXTERM CORE', g: 'core', act: 0, hot: 0 }], edges = [];
    const add = (id, l, g, act, hot, to) => { nodes.push({ id, l, g, act: clamp(act || 0, 0, 1), hot: hot ? 1 : 0 }); edges.push({ a: id, b: to || 'core', ten: 0 }); };
    for (const L of snap.lanes || []) add('lane:' + L.k, L.k.toUpperCase(), 'lane', L.state === 'BUSY' ? 1 : L.state === 'IDLE' ? 0.35 : L.state === 'INLINE' ? 0.25 : 0.08, L.err > 0, 'core');
    for (const F of snap.feeds || []) add('feed:' + F.k, F.l, 'feed', F.stale ? 1 : clamp(F.rate / 20, 0.1, 1), F.stale, 'core');
    for (const P of snap.procs || []) add('proc:' + P.k, P.l, 'proc', P.act, P.hot, P.to ? 'proc:' + P.to : 'core');
    for (const B of snap.squad || []) add('bot:' + B.k, B.l, 'bot', B.st === 'ACTIVE' ? 1 : B.st === 'ARMED' ? 0.6 : B.st === 'IDLE' ? 0.3 : 0.1, false, 'proc:fleet');
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) { const a = byId.get(e.a); e.ten = a ? clamp(a.act * 0.8 + (a.hot ? 0.2 : 0), 0, 1) : 0; e.hot = a ? a.hot : 0; }
    nodes[0].act = clamp((snap.evps || 0) / 30, 0.15, 1); nodes[0].hot = snap.stale ? 1 : 0;
    return { nodes, edges };
  };
  V.brainSpeed = (act) => 0.15 + act * 1.6; // particle velocity along an edge (edge-lengths / s)
  V.brainLayout = (nodes, W, H) => {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H), groups = { lane: [0.2, 0], feed: [0.36, 0.4], proc: [0.3, 2.2], bot: [0.44, 3.4] }, cnt = {}, idx = {};
    for (const n of nodes) cnt[n.g] = (cnt[n.g] || 0) + 1; const out = new Map();
    for (const n of nodes) { if (n.g === 'core') { out.set(n.id, [cx, cy]); continue; } const [rf, off] = groups[n.g] || [0.4, 0], k = (idx[n.g] = (idx[n.g] || 0) + 1) - 1, N = cnt[n.g], a = off + (k / N) * Math.PI * 2, rr = R * rf, sx = W / Math.min(W, H); out.set(n.id, [cx + Math.cos(a) * rr * Math.min(1.6, sx), cy + Math.sin(a) * rr]); }
    return out;
  };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V177;
