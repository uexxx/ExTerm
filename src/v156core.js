/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v15.6 core (pure, Node-testable): compact shorthand numbers ($1.43M, +48.2%, $0.0₅48) with exact tooltips, 44px
   sparkline geometry, option Greeks for the inspector rail, virtual-window maths for long tables, O(1) latest-bar indicator
   patching (only the forming bar is recomputed) and a chunked, seed-identical Monte Carlo that yields to the frame loop. */
const V156 = (() => {
  const V = {};
  const fin = Number.isFinite, num = (x) => (fin(+x) ? +x : 0);

  /* ══ shorthand numbers ══ */
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');
  /* compact magnitude: 1.43M · 12.5K · 980 · 0.0₅48 (subscript = zeros after the decimal point, used from 4 zeros on) */
  V.compact = (v) => {
    const x = Math.abs(num(v));
    if (x >= 1e12) return (x / 1e12).toFixed(2) + 'T'; if (x >= 1e9) return (x / 1e9).toFixed(2) + 'B';
    if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M'; if (x >= 1e4) return (x / 1e3).toFixed(1) + 'K';
    if (x >= 1) return x.toLocaleString('en-US', { maximumFractionDigits: 2 }); if (x === 0) return '0';
    const z = Math.floor(-Math.log10(x)); // zeros after the decimal point
    if (z >= 4) { const sig = Math.round(x * Math.pow(10, z + 2)); return '0.0' + sub(z) + String(Math.min(99, sig)); }
    return x.toPrecision(3).replace(/0+$/, '').replace(/\.$/, '');
  };
  V.usd = (v, sign = false) => { const x = num(v); return (x < 0 ? '−$' : sign && x > 0 ? '+$' : '$') + V.compact(x); };
  V.pct = (v, sign = true) => { const x = num(v); return (x < 0 ? '−' : sign && x > 0 ? '+' : '') + Math.abs(x).toFixed(1) + '%'; };
  /* exact figure for the title tooltip */
  V.exact = (v) => { const x = num(v); return Math.abs(x) >= 1 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x.toPrecision(6).replace(/0+$/, ''); };
  /* "$1,234,567.89" / "−$12.30" / "+$5" as shown by older views → number (null when not a dollar figure) */
  V.parseUsd = (s) => { const m = /^([+−-])?\$([\d,]+(?:\.\d+)?)$/.exec(String(s).trim()); if (!m) return null; const x = +m[2].replace(/,/g, ''); return m[1] === '−' || m[1] === '-' ? -x : x; };

  /* ══ 44px sparkline: polyline points + direction (gold when flat) ══ */
  V.spark = (vals, w = 44, h = 16) => {
    const a = (vals || []).filter(fin); if (a.length < 2) return null;
    let lo = Infinity, hi = -Infinity; for (const x of a) { if (x < lo) lo = x; if (x > hi) hi = x; }
    const rg = hi - lo || 1, st = (w - 2) / (a.length - 1);
    const pts = a.map((x, i) => (1 + i * st).toFixed(1) + ',' + (h - 1 - ((x - lo) / rg) * (h - 2)).toFixed(1)).join(' ');
    const ch = (a[a.length - 1] - a[0]) / (Math.abs(a[0]) || 1);
    return { pts, dir: ch > 0.0005 ? 'up' : ch < -0.0005 ? 'dn' : 'flat', ch: ch * 100 };
  };
  /* bounded sample ring per key */
  V.ring = (max = 40) => { const m = new Map(); return { push(k, v) { if (!fin(v)) return; let a = m.get(k); if (!a) m.set(k, (a = [])); if (a[a.length - 1] !== v || a.length < 2) a.push(v); if (a.length > max) a.splice(0, a.length - max); }, get: (k) => m.get(k) || [], seed(k, arr) { if (!m.has(k) && arr && arr.length) m.set(k, arr.filter(fin).slice(-max)); } }; };

  /* ══ Greeks (Black-Scholes; theta per day, vega per 1 vol point) for the inspector rail ══ */
  const npdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const ncdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
  V.greeks = (S, K, T, r, iv, type) => {
    if (!(S > 0) || !(K > 0) || !(T > 0) || !(iv > 0)) return null;
    const sq = Math.sqrt(T), v = iv * sq, d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / v, d2 = d1 - v, df = Math.exp(-r * T), put = type === 'put';
    const theta = (-S * npdf(d1) * iv / (2 * sq) + (put ? r * K * df * ncdf(-d2) : -r * K * df * ncdf(d2))) / 365;
    return { delta: put ? ncdf(d1) - 1 : ncdf(d1), gamma: npdf(d1) / (S * v), theta, vega: (S * npdf(d1) * sq) / 100, price: put ? K * df * ncdf(-d2) - S * ncdf(-d1) : S * ncdf(d1) - K * df * ncdf(d2) };
  };

  /* ══ virtual window: which rows of a long table to put in the DOM ══ */
  V.vwin = (scrollTop, viewH, rowH, total, over = 8) => {
    const rh = rowH > 0 ? rowH : 28, n = Math.max(0, total | 0), start = Math.min(n, Math.max(0, Math.floor(num(scrollTop) / rh) - over)), end = Math.min(n, Math.ceil((num(scrollTop) + Math.max(rh, num(viewH))) / rh) + over);
    return { start, end: Math.max(start, end), padTop: start * rh, padBot: (n - Math.max(start, end)) * rh };
  };

  /* ══ O(1) latest-bar indicator patch ══
     The chart's built-ins (EMA 20/50, SMA 200, Bollinger 20·2, RSI 14, MACD 12/26/9) are causal: bar i depends on bars ≤ i.
     When only the forming bar moved (or one new bar opened), recompute just those indices from a fixed tail. SMA/BB are
     exact on any tail ≥ their window; the recursive ones (EMA/RSI/MACD) start from a different seed whose weight decays as
     (1−α)^800 — below 1e-13 for every period used — so the patched value equals a full recompute to double precision. */
  V.TAIL = 800;
  V.patchInd = (c, cl, idxs, ind, W = V.TAIL) => {
    const n = cl.length;
    for (const a of [c.ema20, c.ema50, c.sma200, c.rsi, c.bb.mid, c.bb.up, c.bb.lo, c.macd.macd, c.macd.signal, c.macd.hist]) while (a.length < n) a.push(NaN);
    for (const i of idxs) {
      if (i < 0 || i >= n) continue; const t = cl.slice(Math.max(0, i - W + 1), i + 1), L = t.length - 1;
      c.ema20[i] = ind.ema(t, 20)[L]; c.ema50[i] = ind.ema(t, 50)[L]; c.sma200[i] = ind.sma(t, 200)[L]; c.rsi[i] = ind.rsi(t, 14)[L];
      const b = ind.bb(t, 20, 2); c.bb.mid[i] = b.mid[L]; c.bb.up[i] = b.up[L]; c.bb.lo[i] = b.lo[L];
      const m = ind.macd(t); c.macd.macd[i] = m.macd[L]; c.macd.signal[i] = m.signal[L]; c.macd.hist[i] = m.hist[L];
    }
    return c;
  };

  /* ══ chunked Monte Carlo: identical numbers to P5.monteCarlo (same xorshift stream), but yields every `chunk` runs ══ */
  V.monteCarloAsync = async (rets, runs = 1000, seed = 7, chunk = 100, yieldFn) => {
    if (!rets || rets.length < 3) return null;
    const pause = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
    let s = seed >>> 0 || 7; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const fin0 = [], dds = [];
    for (let k = 0; k < runs; k++) {
      let eq = 1, pk = 1, dd = 0; for (let i = 0; i < rets.length; i++) { eq *= 1 + rets[Math.floor(rnd() * rets.length)]; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); }
      fin0.push(eq - 1); dds.push(dd); if (k % chunk === chunk - 1 && k < runs - 1) await pause();
    }
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
    return { runs, p5: q(fin0, 0.05), p50: q(fin0, 0.5), p95: q(fin0, 0.95), ddP50: q(dds, 0.5), ddP95: q(dds, 0.95), lossProb: fin0.filter((x) => x < 0).length / runs };
  };

  /* ══ 1-word top navigation (English; other languages keep their translated labels) ══ */
  V.NAV = { markets: 'Markets', desk: 'Flow', heat: 'DEX', whales: 'Whales', lab: 'Lab', grok: 'Grok', journal: 'Journal', btnLearn: 'Learn', bots: 'Bots', port: 'Portfolio', social: 'Social', workspace: 'Workspace', challenge: 'Challenges', ai: 'Copilot', world: 'World', set: 'Settings', v155How: 'Help' };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V156;
