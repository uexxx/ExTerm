/* ExTerm v15 phase 4 core: pure logic for buy-pressure windows (ticks / bars / DEX transaction counts), the dense
   bubble engine's layout + collision pass, Launch Radar age brackets, the live market scanner (gainers, RVOL spikes,
   strategy signal matches), sparkline sampling and responsive layout classes.
   No DOM and no network here: everything is unit-tested in Node (test/v15p4.test.js). */
const P4 = (() => {
  const N = typeof NT !== 'undefined' ? NT : require('./core.js');
  const P = {}, fin = Number.isFinite;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ── buy-pressure windows ── */
  P.WINDOWS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '24h': 86400 };
  P.WIN_KEYS = Object.keys(P.WINDOWS);
  P.winOk = (w) => typeof w === 'string' && Object.prototype.hasOwnProperty.call(P.WINDOWS, w);

  /* tick rule (Lee–Ready tick test): an uptick is buyer-initiated, a downtick seller-initiated, a zero tick keeps the
     previous side. Weighted by size (count when sizes are unknown, e.g. launcher stock quotes). */
  P.tickPressure = (trades, from) => {
    let buy = 0, sell = 0, prev = null, side = 0, n = 0;
    for (const x of trades || []) {
      if (!x || !(x.p > 0)) continue;
      if (prev != null) { if (x.p > prev) side = 1; else if (x.p < prev) side = -1; }
      prev = x.p;
      if (x.t < from || !side) continue;
      const w = x.q > 0 ? x.q : 1; if (side > 0) buy += w; else sell += w; n++;
    }
    return buy + sell > 0 ? { bp: buy / (buy + sell), n, buy, sell } : null;
  };
  /* bars: volume of up-closing bars vs down-closing bars inside the window */
  P.barPressure = (candles, from) => {
    let buy = 0, sell = 0, n = 0;
    for (const k of candles || []) {
      if (!k || k.t < from || !(k.c > 0)) continue;
      const w = k.v > 0 ? k.v : 1;
      if (k.c > k.o) buy += w; else if (k.c < k.o) sell += w; else continue;
      n++;
    }
    return buy + sell > 0 ? { bp: buy / (buy + sell), n, buy, sell } : null;
  };
  /* best available source for a window: ticks if they cover ≥ 80 % of it, then bars, then a price-change proxy */
  P.pressure = (src, win, now) => {
    const sec = P.WINDOWS[win] || 3600, from = now - sec, s = src || {};
    const tr = s.trades || [];
    if (tr.length > 4 && tr[0].t <= now - sec * 0.8) { const r = P.tickPressure(tr, from); if (r) return Object.assign(r, { src: 'ticks' }); }
    const cs = s.candles || [];
    if (cs.length > 2 && cs[0].t <= now - sec * 0.8) { const r = P.barPressure(cs, from); if (r) return Object.assign(r, { src: 'bars' }); }
    const ch = s.ch || {}, near = { '1m': ['1h', '24h'], '5m': ['1h', '24h'], '15m': ['1h', '24h'], '1h': ['1h', '24h'], '4h': ['1h', '24h'], '24h': ['24h', '1h'] }[win] || ['24h'];
    for (const k of near) if (fin(ch[k])) return { bp: clamp(0.5 + ch[k] / (k === '24h' ? 20 : 6), 0.02, 0.98), src: 'change', approx: true };
    if (tr.length > 1) { const r = P.tickPressure(tr, -Infinity); if (r) return Object.assign(r, { src: 'ticks', approx: true }); }
    return { bp: 0.5, src: 'none' };
  };
  /* DEX pools: GeckoTerminal/DexScreener report buys/sells for 5m, 15m, 1h, 6h, 24h. 1m and 4h use the nearest
     window and say so (approx), never a made-up number. */
  P.OC_FIELDS = { '1m': ['5m'], '5m': ['5m'], '15m': ['15m', '5m'], '1h': ['1h'], '4h': ['6h', '1h'], '24h': ['24', '6h'] };
  P.ocPressure = (st, win) => {
    const o = st || {}, ks = P.OC_FIELDS[win] || ['1h'];
    for (const k of ks) {
      const b = o['buys' + k], x = o['sells' + k];
      if (fin(b) && fin(x) && b + x > 0) return { bp: b / (b + x), buys: b, sells: x, field: k === '24' ? '24h' : k, approx: (k === '24' ? '24h' : k) !== win };
    }
    return { bp: 0.5, buys: 0, sells: 0, field: null, approx: true };
  };

  /* ── dense bubble engine: targets + collision ── */
  /* items: {id, bp (0..1), ch (%), size (>0)}; x = change (or age when given), y = buy pressure, area ∝ size.
     density 1..3 packs up to 60 × density bubbles into the same canvas by shrinking radii with √count. */
  P.bubbleTargets = (items, W, H, o = {}) => {
    const density = clamp(+o.density || 2, 1, 3), cap = Math.round(60 * density), list = (items || []).filter((x) => x && x.id != null).slice(0, cap);
    const n = Math.max(1, list.length), smax = Math.max(1e-9, ...list.map((x) => (x.size > 0 ? x.size : 0))), pad = 18;
    const rMax = clamp(Math.sqrt((W * H) / n) * 0.42, 9, 56), rMin = Math.max(4, rMax * 0.22);
    const chs = list.map((x) => (fin(x.ch) ? x.ch : 0)), span = Math.max(1, ...chs.map(Math.abs));
    return list.map((x, i) => {
      const r = rMin + Math.sqrt(Math.max(0, x.size || 0) / smax) * (rMax - rMin);
      const fx = fin(x.xk) ? clamp(x.xk, 0, 1) : 0.5 + chs[i] / (2 * span) * 0.92;
      const bp = fin(x.bp) ? clamp(x.bp, 0, 1) : 0.5;
      return { id: x.id, r, tx: pad + r + fx * Math.max(1, W - 2 * (pad + r)), ty: pad + r + (1 - bp) * Math.max(1, H - 2 * (pad + r) - 16), bp, ch: chs[i], d: x };
    });
  };
  /* one relaxation pass over a uniform grid (O(n) on average): damped spring to the target, soft overlap separation,
     keep inside. Velocity is damped hard (×0.82 per tick) and snapped to zero below 0.08 px/tick, and overlaps are
     resolved at a 0.28 factor (not a 0.5 hard bounce), so packed bubbles settle instead of oscillating. */
  P.DAMP = 0.82; P.SEP = 0.28; P.SLEEP = 0.08;
  P.relax = (nodes, W, H, ease = 0.08) => {
    let cell = 8; for (const n of nodes) if (n.r * 2 > cell) cell = n.r * 2;
    const grid = new Map(), key = (cx, cy) => cx * 73856093 ^ cy * 19349663, spring = ease * 0.12;
    for (const n of nodes) {
      if (!fin(n.x)) { n.x = n.tx; n.y = n.ty; }
      if (!fin(n.vx)) { n.vx = 0; n.vy = 0; }
      n.vx = (n.vx + (n.tx - n.x) * spring) * P.DAMP; n.vy = (n.vy + (n.ty - n.y) * spring) * P.DAMP;
      if (Math.hypot(n.vx, n.vy) < P.SLEEP) { n.vx = 0; n.vy = 0; }
      n.x += n.vx; n.y += n.vy;
      const k = key(Math.floor(n.x / cell), Math.floor(n.y / cell)); let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(n);
    }
    let overlaps = 0;
    for (const a of nodes) {
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b0 = grid.get(key(cx + dx, cy + dy)); if (!b0) continue;
        for (const b of b0) {
          if (b === a || b.id < a.id) continue;
          const ddx = b.x - a.x, ddy = b.y - a.y, d = Math.hypot(ddx, ddy) || 0.01, min = a.r + b.r + 1.5;
          if (d < min) { overlaps++; const k = ((min - d) / d) * P.SEP; a.x -= ddx * k; a.y -= ddy * k; b.x += ddx * k; b.y += ddy * k; }
        }
      }
    }
    for (const n of nodes) { n.x = clamp(n.x, n.r + 1, W - n.r - 1); n.y = clamp(n.y, n.r + 1, H - n.r - 1); }
    return overlaps;
  };
  P.hit = (nodes, x, y) => { for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; if (Math.hypot(n.x - x, n.y - y) <= n.r) return n; } return null; };
  /* colour bucket (−8..8) for the change: bubbles are pre-rendered per bucket, so a frame is only drawImage calls */
  P.bucket = (ch, scale) => Math.round(clamp((fin(ch) ? ch : 0) / (scale || 10), -1, 1) * 8);

  /* ── Launch Radar: live age brackets ── */
  P.BRACKETS = [
    { id: 'new', l: 'New Launches <1h', max: 3600 },
    { id: 'run', l: '1h–6h Runners', max: 21600 },
    { id: 'est', l: '6h–24h Established', max: 86400 },
    { id: 'trend', l: '24h+ Trending', max: Infinity },
  ];
  P.bracketOf = (ageSec) => (fin(ageSec) && ageSec >= 0 ? P.BRACKETS.find((b) => ageSec < b.max).id : 'trend');
  /* rows: symbols; createdOf(sym) → ms epoch or null; groups keep their input order */
  P.groupRadar = (rows, createdOf, nowMs) => {
    const g = P.BRACKETS.map((b) => ({ id: b.id, l: b.l, rows: [] }));
    for (const s of rows || []) { const c = createdOf(s), age = fin(c) && c > 0 ? (nowMs - c) / 1000 : NaN; g[P.BRACKETS.findIndex((b) => b.id === P.bracketOf(age))].rows.push(s); }
    return g;
  };
  /* what "⚡ Send to Grok Tab" hands the Grok bridge (P3.bridge validates it again on the other side) */
  P.radarSetup = (sym, st, win, label) => {
    const o = st || {}, pr = P.ocPressure(o, win), side = pr.bp >= 0.5 ? 'buy' : 'sell', px = +o.price > 0 ? +o.price : null;
    const tf = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '24h': '1h' }[win] || '5m';
    const created = +o.created > 0 ? o.created : null;
    return { from: 'copilot', sym: String(sym), tf, side, entry: px, sl: px ? px * (side === 'buy' ? 0.85 : 1.15) : null, tp: px ? px * (side === 'buy' ? 1.3 : 0.7) : null,
      note: `Launch Radar · ${String(label || '').slice(0, 24)} · ${(pr.bp * 100).toFixed(0)}% buys (${pr.field || win}${pr.approx ? '≈' : ''})${created ? ' · ' + P.BRACKETS.find((b) => b.id === P.bracketOf((Date.now() - created) / 1000)).l : ''}` };
  };

  /* ── live market scanner ── */
  /* relative volume: the newest bar's volume over the mean of the previous n bars (0 when there is no baseline) */
  P.rvol = (candles, n = 20) => {
    const c = candles || []; if (c.length < 3) return 0;
    const last = c[c.length - 1], prev = c.slice(Math.max(0, c.length - 1 - n), c.length - 1).map((k) => +k.v || 0);
    const m = prev.reduce((s, x) => s + x, 0) / (prev.length || 1);
    return m > 0 ? (+last.v || 0) / m : 0;
  };
  /* does the strategy fire an entry on the newest bar? (flat position, same prepare/onBar contract as the backtester) */
  P.signalNow = (strat, candles, params) => {
    try {
      if (!strat || typeof strat.prepare !== 'function' || !candles || candles.length < 30) return null;
      const S = strat.prepare(candles, params || {}), i = candles.length - 1, b = candles[i];
      const sg = strat.onBar(i, S, candles, { pos: null, state: {}, params: params || {}, price: b.c, cash: 10000, cash0: 10000, ext: {} }) || [];
      return sg.some((x) => x && x.side === 'buy') ? 'buy' : null;
    } catch (e) { return null; }
  };
  /* rows: {sym, ch, rvol, sigs:[ids]} → top gainers, RVOL > x spikes, signal matches */
  P.scan = (rows, o = {}) => {
    const top = o.top || 8, min = o.rvolMin || 3, list = (rows || []).filter((r) => r && r.sym);
    return {
      gainers: list.filter((r) => fin(r.ch)).sort((a, b) => b.ch - a.ch).slice(0, top),
      spikes: list.filter((r) => fin(r.rvol) && r.rvol > min).sort((a, b) => b.rvol - a.rvol).slice(0, top),
      signals: list.filter((r) => Array.isArray(r.sigs) && r.sigs.length).slice(0, top),
    };
  };

  /* ── sparklines: the last `span` seconds of ticks, bucketed to at most `max` points (sub-second resolution) ── */
  P.sparkPoints = (ticks, now, span = 60, max = 120) => {
    const from = now - span, pts = (ticks || []).filter((x) => x && x.t >= from && x.p > 0);
    if (!pts.length) return [];
    const step = span / max, out = [];
    let cur = null;
    for (const x of pts) { const b = Math.floor((x.t - from) / step); if (!cur || cur.b !== b) { cur = { b, t: x.t, p: x.p }; out.push(cur); } else { cur.t = x.t; cur.p = x.p; } }
    return out.map((x) => ({ t: x.t, p: x.p }));
  };
  P.sparkPath = (pts, W, H, pad = 2) => {
    if (!pts || pts.length < 2) return [];
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p)), dt = t1 - t0 || 1, dp = hi - lo || hi * 1e-6 || 1;
    return pts.map((x) => [pad + ((x.t - t0) / dt) * (W - 2 * pad), H - pad - ((x.p - lo) / dp) * (H - 2 * pad)]);
  };
  P.unifiedWatch = (mk) => {
    const out = [], seen = new Set();
    for (const m of ['crypto', 'stocks', 'onchain']) for (const s of ((mk || {})[m] || {}).watch || []) if (typeof s === 'string' && !seen.has(s)) { seen.add(s); out.push({ sym: s, mode: m }); }
    return out;
  };

  /* ── responsive layout class from the viewport ── */
  P.layoutFor = (w, touch) => (w < 600 ? 'phone' : w < 1024 && touch ? 'tablet' : w < 900 ? 'tablet' : w < 1366 ? 'half' : 'full');

  return P;
})();
if (typeof module === 'object' && module.exports) module.exports = P4;
