/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v15.7 core (pure, Node-testable): a pre-allocated Float64Array ring of 1-second OHLCV bars per symbol (15 minutes,
   no per-tick allocation), local 1s → 5s / 10s rollup with gapless open = prior close, sub-10s candle geometry (≥ 4px body,
   2px gap, ≥ 2.5px body height) and the perspective maths behind the five pure-canvas 3D views. */
const V157 = (() => {
  const V = {};
  const fin = Number.isFinite;

  /* ══ 1s tick ring: slot = [t, o, h, l, c, v]; 900 slots = 15 minutes ══ */
  V.SLOTS = 900; const F = 6;
  V.ring = (slots = V.SLOTS) => {
    const a = new Float64Array(slots * F); let head = -1, n = 0; // head = newest slot index
    return {
      get size() { return n; },
      push(p, q, ts) {
        if (!(p > 0) || !fin(ts)) return; const t = Math.floor(ts), i0 = head * F;
        if (n && a[i0] === t) { if (p > a[i0 + 2]) a[i0 + 2] = p; if (p < a[i0 + 3]) a[i0 + 3] = p; a[i0 + 4] = p; a[i0 + 5] += q || 0; return; }
        if (n && t < a[i0]) return; // late tick for a closed second: dropped (bars never rewrite history)
        const o = n ? a[i0 + 4] : p; head = (head + 1) % slots; if (n < slots) n++; const i = head * F;
        a[i] = t; a[i + 1] = o; a[i + 2] = Math.max(o, p); a[i + 3] = Math.min(o, p); a[i + 4] = p; a[i + 5] = q || 0; // open = prior close: gapless
      },
      /* bars of `sec` seconds (1, 5, 10, …) from the ring, quiet buckets filled flat, oldest first */
      rollup(sec = 1, now) {
        if (!n) return []; const out = [], first = (head - n + 1 + slots) % slots;
        for (let k = 0; k < n; k++) {
          const i = ((first + k) % slots) * F, b = Math.floor(a[i] / sec) * sec, L = out[out.length - 1];
          if (L && L.t === b) { if (a[i + 2] > L.h) L.h = a[i + 2]; if (a[i + 3] < L.l) L.l = a[i + 3]; L.c = a[i + 4]; L.v += a[i + 5]; continue; }
          if (L) for (let t = L.t + sec; t < b; t += sec) out.push({ t, o: L.c, h: L.c, l: L.c, c: L.c, v: 0 });
          const o = L ? out[out.length - 1].c : a[i + 1]; out.push({ t: b, o, h: Math.max(o, a[i + 2]), l: Math.min(o, a[i + 3]), c: a[i + 4], v: a[i + 5] });
        }
        const end = fin(now) ? Math.floor(now / sec) * sec : 0, L = out[out.length - 1]; // keep time continuous up to now
        for (let t = L.t + sec; t <= end && out.length < 20000; t += sec) out.push({ t, o: L.c, h: L.c, l: L.c, c: L.c, v: 0 });
        return out;
      },
    };
  };
  /* one ring per symbol */
  V.rings = new Map();
  V.note = (sym, p, q, ts) => { let r = V.rings.get(sym); if (!r) V.rings.set(sym, (r = V.ring())); r.push(p, q, ts); };

  /* ══ sub-10s candle geometry ══ */
  V.FAST = 10; V.MIN_W = 4; V.GAP = 2; V.MIN_H = 2.5;
  /* most bars that fit a plot of `plotW` px at ≥ 4px body + 2px gap */
  V.maxBars = (plotW) => Math.max(20, Math.floor(Math.max(0, plotW) / (V.MIN_W + V.GAP)));
  /* body rect centred on the 1px wick at round(x)+0.5; never thinner than 4px on fast timeframes or shorter than 2.5px */
  V.body = (yo, yc, x, bw, fast) => {
    const w = fast ? Math.max(V.MIN_W, Math.floor(bw - V.GAP)) : Math.max(1, Math.round(Math.max(1.5, bw * 0.7)));
    let top = Math.min(yo, yc), h = Math.abs(yo - yc); if (h < V.MIN_H) { top -= (V.MIN_H - h) / 2; h = V.MIN_H; }
    const y = Math.round(top); // whole pixels: crisp edges, and a 2.5px minimum rounds up to a 3px body
    return { x: Math.round(x) - Math.floor(w / 2), y, w, h: Math.max(Math.ceil(V.MIN_H), Math.round(top + h) - y) };
  };

  /* ══ 3D: yaw/pitch rotation + perspective projection ══ */
  V.ANG0 = { yaw: -0.65, pitch: 0.55 };
  V.proj = (x, y, z, ang, w, h, zoom = 1) => {
    const cy = Math.cos(ang.yaw), sy = Math.sin(ang.yaw), cp = Math.cos(ang.pitch), sp = Math.sin(ang.pitch);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy; // yaw around the vertical axis
    const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp; // pitch towards the viewer
    const d = 3.2, k = (Math.min(w, h * 1.5) * 0.74 * zoom) / (d + y2); // perspective: farther (larger y2) = smaller
    return [w / 2 + x1 * k, h / 2 - z2 * k, y2];
  };
  V.clampAng = (a) => ({ yaw: ((a.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), pitch: Math.max(-0.2, Math.min(1.45, a.pitch)) });
  /* normalise a z grid (rows × cols) to −1…1 cube coordinates; returns { pts[r][c] = [x,y,z], lo, hi } */
  V.grid = (Z) => {
    const R = Z.length, C = R ? Z[0].length : 0; let lo = Infinity, hi = -Infinity;
    for (const row of Z) for (const v of row) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!fin(lo)) { lo = 0; hi = 1; } const rg = hi - lo || 1;
    const pts = Z.map((row, r) => row.map((v, c) => [C > 1 ? (c / (C - 1)) * 2 - 1 : 0, R > 1 ? (r / (R - 1)) * 2 - 1 : 0, fin(v) ? ((v - lo) / rg) * 1.2 - 0.6 : -0.6]));
    return { pts, lo, hi };
  };

  /* ══ order-book depth → price-bin row for the liquidity terrain (bids negative side, asks positive side of mid) ══ */
  V.depthRow = (book, mid, bins = 24, span = 0.01) => {
    const row = new Array(bins).fill(0); if (!(mid > 0) || !book) return row;
    const lo = mid * (1 - span), step = (2 * mid * span) / bins;
    for (const side of [book.bids || [], book.asks || []]) for (const [p, q] of side) { const i = Math.floor((p - lo) / step); if (i >= 0 && i < bins && q > 0) row[i] += p * q; }
    return row;
  };
  /* modelled book when no live depth is available (labelled as such in the UI): walls drift slowly with time */
  V.modelBook = (mid, t) => {
    const bids = [], asks = [];
    for (let k = 1; k <= 20; k++) { const d = k * 0.0005, wall = 1 + 3 * Math.exp(-((k - 8 - 3 * Math.sin(t / 40)) ** 2) / 3); bids.push([mid * (1 - d), (1 + k * 0.15) * wall]); asks.push([mid * (1 + d), (1 + k * 0.12) * (1 + 2.5 * Math.exp(-((k - 13 - 2 * Math.cos(t / 55)) ** 2) / 2))]); }
    return { bids, asks };
  };

  /* ══ options surface: strike × expiry grid of IV (or net gamma × OI) from one chain's smile ══ */
  V.EXP_D = [1, 7, 14, 30, 60, 90];
  V.ivSurface = (strikes, ivAt, spot, mode, greeks) => V.EXP_D.map((dte) => strikes.map((k) => {
    const iv0 = ivAt(k); if (!(iv0 > 0)) return NaN;
    const term = Math.sqrt(30 / dte), mny = Math.abs(Math.log(k / spot)), iv = Math.max(0.02, iv0 * (0.9 + 0.1 * term) + iv0 * mny * 0.5 * (term - 1)); // modelled term structure: wings steepen near expiry
    if (mode !== 'gamma') return iv * 100;
    const g = greeks ? greeks(spot, k, dte / 365, 0.04, iv, 'call') : null; return g ? g.gamma * spot * spot * 0.01 : NaN; // $ gamma per 1% move
  }));

  /* ══ Quant Lab profit mountain: SL% × TP% grid → plateau vs spike ══ */
  V.SL = [0.5, 1, 1.5, 2, 3, 4, 5]; V.TP = [1, 2, 3, 4, 6, 8, 10];
  /* robustness = mean of the best cell's 3×3 neighbourhood ÷ best cell (≈1 broad plateau, ≪1 fragile spike) */
  V.plateau = (Z) => {
    let br = 0, bc = 0, best = -Infinity; Z.forEach((row, r) => row.forEach((v, c) => { if (fin(v) && v > best) { best = v; br = r; bc = c; } }));
    if (!fin(best)) return null; let s = 0, k = 0;
    for (let r = br - 1; r <= br + 1; r++) for (let c = bc - 1; c <= bc + 1; c++) if (Z[r] && fin(Z[r][c])) { s += Z[r][c]; k++; }
    const mean = s / k, rob = best > 0 ? Math.max(0, mean / best) : 0;
    return { r: br, c: bc, best, mean, rob, kind: best <= 0 ? 'none' : rob >= 0.7 ? 'plateau' : rob >= 0.4 ? 'ridge' : 'spike' };
  };

  /* ══ correlation of log returns over the last n bars (tail-aligned close arrays) + momentum (% change) ══ */
  V.corr = (closes, n = 60) => {
    const R = closes.map((c) => { const a = (c || []).slice(-(n + 1)), r = []; for (let i = 1; i < a.length; i++) r.push(a[i] > 0 && a[i - 1] > 0 ? Math.log(a[i] / a[i - 1]) : 0); return r; });
    const p = (x, y) => { const k = Math.min(x.length, y.length); if (k < 10) return null; const a = x.slice(-k), b = y.slice(-k); let ma = 0, mb = 0; for (let i = 0; i < k; i++) { ma += a[i]; mb += b[i]; } ma /= k; mb /= k; let s = 0, sa = 0, sb = 0; for (let i = 0; i < k; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : null; };
    return { M: R.map((a, i) => R.map((b, j) => (i === j ? 1 : p(a, b)))), mom: closes.map((c) => { const a = (c || []).slice(-21); return a.length > 1 && a[0] > 0 ? (a[a.length - 1] / a[0] - 1) * 100 : 0; }) };
  };

  /* ══ orbit layouts ══ */
  /* nodes evenly on a ring, height from a value in −1…1 */
  V.orbit = (n, hs) => Array.from({ length: n }, (_, i) => { const a = (i / Math.max(1, n)) * 2 * Math.PI; return [Math.cos(a) * 0.9, Math.sin(a) * 0.9, (hs && fin(hs[i]) ? hs[i] : 0) * 0.6]; });
  /* whale positions: angle by coin, radius by liquidation distance (closer = inner ring), height long/short */
  V.whalePts = (pos) => {
    const coins = [...new Set(pos.map((p) => p.coin))].sort(), mx = Math.max(1, ...pos.map((p) => p.ntl || 0));
    return pos.map((p, i) => {
      const a = (coins.indexOf(p.coin) / Math.max(1, coins.length)) * 2 * Math.PI + (i % 5) * 0.09, dist = p.liq > 0 && p.mark > 0 ? Math.abs(p.mark - p.liq) / p.mark * 100 : 50;
      const r = 0.25 + 0.75 * Math.min(1, dist / 30);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: (p.side === 'Short' ? -1 : 1) * (0.15 + 0.45 * Math.sqrt((p.ntl || 0) / mx)), size: 3 + 9 * Math.sqrt((p.ntl || 0) / mx), dist, p };
    });
  };
  V.liqColor = (dist) => (dist <= 2.5 ? '#e879f9' : dist <= 10 ? '#f5a524' : '#26c281');
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V157;
