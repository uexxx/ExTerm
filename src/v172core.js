/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.2 core (pure, no DOM): the maths behind the Synapse cockpit, unit-tested in test/v172.test.js.
   · THEME        the strict Obsidian & Bullion Gold token set enforced by the UI
   · Rate         per-second event meter with a fixed-length history (sparklines)
   · stats        log-return drift / volatility of a close series
   · fan          Monte Carlo fan of futures: N seeded GBM paths + p5 / p25 / p50 / p75 / p95 bands, each path tagged
                  gain / flat / loss by where it ends (Emerald / Gold / Crimson)
   · phase        phase-space delay embedding (z-scored price vs its lag) for the Signal Rotation attractor
   · weights      synaptic weights 0…1 for CVD · GEX · 3D OB · Momentum · Risk Budget from live readings
   · classify     bus event → synapse node + impulse colour (gold = tick / cache / mutation, emerald = signal / whale / fill,
                  crimson = firewall block)
   · stamp        HH:MM:SS.mmm millisecond timestamp for The Trace */
const V172 = (() => {
  const V = {};
  V.THEME = Object.freeze({ bg: '#07080B', panel: '#0D1117', head: '#161B22', gold: '#F5C84B', up: '#22C55E', dn: '#EF4444', text: '#F8FAFC', mut: '#9AA4B2' });
  V.NODES = Object.freeze(['TAPE/CVD', 'GEX/DOM', '3D OB', 'SCREENER', 'AI BRIDGE', 'FIREWALL']);
  V.SENSORS = Object.freeze(['WS Ticks/s', 'L1/L2 SWR Cache', 'Worker Math', 'Cross-Exchange CVD', 'GEX/Volatility']);
  V.WEIGHTS = Object.freeze(['CVD', 'GEX', '3D OB', 'Momentum', 'Risk Budget']);
  V.RGB = Object.freeze({ gold: '245,200,75', up: '34,197,94', dn: '239,68,68' });

  /* per-second meter: count(), then roll(now) once a second pushes the rate into a fixed history */
  V.Rate = class {
    constructor(len) { this.len = len || 60; this.h = []; this.n = 0; this.at = 0; this.total = 0; }
    count(k) { const d = k == null ? 1 : k; this.n += d; this.total += d; }
    roll(now) { if (!this.at) { this.at = now; return false; } const dt = now - this.at; if (dt < 1000) return false; this.h.push((this.n * 1000) / dt); if (this.h.length > this.len) this.h.shift(); this.n = 0; this.at = now; return true; }
    last() { return this.h.length ? this.h[this.h.length - 1] : 0; }
    max() { return Math.max(1e-9, ...this.h, 0); }
  };
  /* gauge history: push any reading, keep a fixed window */
  V.Hist = class {
    constructor(len) { this.len = len || 60; this.h = []; }
    push(v) { if (!Number.isFinite(v)) return; this.h.push(v); if (this.h.length > this.len) this.h.shift(); }
    last() { return this.h.length ? this.h[this.h.length - 1] : NaN; }
  };

  V.stats = (closes) => {
    const c = (closes || []).filter((x) => x > 0), r = [];
    for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
    if (r.length < 2) return { mu: 0, sigma: 0, n: r.length };
    const mu = r.reduce((a, b) => a + b, 0) / r.length, v = r.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (r.length - 1);
    return { mu, sigma: Math.sqrt(v), n: r.length };
  };

  /* seeded RNG + Box-Muller normal */
  V.rng = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const normal = (rnd) => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* Monte Carlo fan of futures: geometric Brownian motion from s0 with per-step drift mu / vol sigma */
  V.fan = (o) => {
    const s0 = o.s0 > 0 ? o.s0 : 1, N = Math.max(2, o.steps || 60), P = Math.max(1, o.paths || 48), sig = Math.max(1e-6, o.sigma || 0.01), mu = Number.isFinite(o.mu) ? o.mu : 0, rnd = V.rng(o.seed || 7), paths = [];
    for (let p = 0; p < P; p++) { const row = new Float64Array(N); row[0] = s0; let x = s0; for (let i = 1; i < N; i++) { x *= Math.exp(mu - (sig * sig) / 2 + sig * normal(rnd)); row[i] = x; } paths.push(row); }
    const qs = [0.05, 0.25, 0.5, 0.75, 0.95], band = qs.map(() => new Float64Array(N)), col = new Float64Array(P);
    for (let i = 0; i < N; i++) { for (let p = 0; p < P; p++) col[p] = paths[p][i]; const srt = Array.from(col).sort((a, b) => a - b); qs.forEach((q, k) => { band[k][i] = srt[Math.min(P - 1, Math.max(0, Math.round(q * (P - 1))))]; }); }
    const sd = sig * Math.sqrt(N - 1), tag = paths.map((r) => { const z = Math.log(r[N - 1] / s0) / sd; return z > 0.5 ? 'up' : z < -0.5 ? 'dn' : 'gold'; });
    let lo = Infinity, hi = -Infinity; for (const r of paths) for (let i = 0; i < N; i++) { if (r[i] < lo) lo = r[i]; if (r[i] > hi) hi = r[i]; }
    return { s0, steps: N, paths, tag, p5: band[0], p25: band[1], p50: band[2], p75: band[3], p95: band[4], lo, hi, pUp: tag.filter((t) => t === 'up').length / P, pDn: tag.filter((t) => t === 'dn').length / P };
  };

  /* phase-space delay embedding: (z(p_t), z(p_t-lag)) of the last n closes, z-scored to roughly −1…1 */
  V.phase = (closes, lag, n) => {
    const c = (closes || []).filter((x) => x > 0).slice(-((n || 160) + (lag || 6)));
    const L = lag || 6; if (c.length < L + 3) return [];
    const mean = c.reduce((a, b) => a + b, 0) / c.length, sd = Math.sqrt(c.reduce((a, b) => a + (b - mean) * (b - mean), 0) / c.length) || 1, out = [];
    for (let i = L; i < c.length; i++) out.push([Math.max(-3, Math.min(3, (c[i] - mean) / sd)) / 3, Math.max(-3, Math.min(3, (c[i - L] - mean) / sd)) / 3]);
    return out;
  };

  const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
  /* RSI(14) of a close series (Wilder) */
  V.rsi = (closes, n) => { const c = closes || [], N = n || 14; if (c.length <= N) return 50; let g = 0, l = 0; for (let i = 1; i <= N; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= N; l /= N; for (let i = N + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (N - 1) + Math.max(0, d)) / N; l = (l * (N - 1) + Math.max(0, -d)) / N; } return l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l); };
  /* volume-profile concentration: share of the last n bars' volume in the busiest 10% of price buckets (0…1) */
  V.obStrength = (candles, n) => {
    const k = (candles || []).slice(-(n || 80)).filter((x) => x && x.h >= x.l && x.v >= 0); if (k.length < 5) return 0;
    const lo = Math.min(...k.map((x) => x.l)), hi = Math.max(...k.map((x) => x.h)), B = 20, b = new Array(B).fill(0); if (!(hi > lo)) return 0;
    let tot = 0; for (const x of k) { const i = Math.min(B - 1, Math.floor((((x.h + x.l) / 2 - lo) / (hi - lo)) * B)); b[i] += x.v; tot += x.v; }
    if (!(tot > 0)) return 0; const top = b.slice().sort((x, y) => y - x).slice(0, 2).reduce((s, v) => s + v, 0); return clamp01((top / tot - 0.1) / 0.5);
  };
  /* synaptic weights from live readings (each 0…1) */
  V.weights = (r) => {
    const o = r || {};
    const cvd = Number.isFinite(o.cvd) && Number.isFinite(o.vol) && o.vol >= (o.minVol || 1000) ? /* a thin cross-exchange tape is noise: fall back to bar CVD */ clamp01(Math.abs(o.cvd) / o.vol) : clamp01(Math.abs(o.cvdBars || 0));
    const gex = o.gexRegime ? (/neg|short/i.test(o.gexRegime) ? 0.85 : 0.45) : clamp01((o.sigma || 0) * Math.sqrt(365 * 24) / 1.2);
    const ob = clamp01(o.ob);
    const mom = clamp01(Math.abs((Number.isFinite(o.rsi) ? o.rsi : 50) - 50) / 35);
    const risk = Number.isFinite(o.equity) && o.equity > 0 ? clamp01(1 - (o.exposure || 0) / o.equity) : 1;
    return { CVD: cvd, GEX: gex, '3D OB': ob, Momentum: mom, 'Risk Budget': risk };
  };
  /* signed bar-volume CVD over the last n candles, normalised by total volume (−1…1) */
  V.cvdBars = (candles, n) => { let s = 0, t = 0; for (const x of (candles || []).slice(-(n || 60))) { if (!x || !(x.v >= 0)) continue; s += x.c >= x.o ? x.v : -x.v; t += x.v; } return t > 0 ? s / t : 0; };

  /* bus event → synapse node + impulse colour */
  V.classify = (e) => {
    const t = String((e && e.type) || ''), nd = String((e && e.node) || ''), tx = String((e && e.text) || '');
    const col = /loss|stale|flatten|block|gate|deny|reject|firewall/i.test(t) ? 'dn' : /win|fill|signal|whale|fresh|bot|buy/i.test(t) || (e && e.side === 'buy') ? 'up' : 'gold';
    let node = 0;
    if (/firewall|block|gate|stale|flatten|loss|reject/i.test(t) || /Risk|Firewall/i.test(nd)) node = 5;
    else if (/^(ai|copilot|llm)\b/i.test(t) || /^(Copilot|AI)\b/.test(nd)) node = 4;
    else if (/screen|scan|whale|safety/i.test(t) || /Screener|Bots/i.test(nd)) node = 3;
    else if (/ob|3d|chart|draw/i.test(t) || /Chart/i.test(nd)) node = 2;
    else if (/gex|dom|depth|vol/i.test(t) || /Ledger|GEX|DOM/i.test(nd) || /gex/i.test(tx)) node = 1;
    return { node, col };
  };
  V.stamp = (t) => { const d = new Date(t), p = (n, w) => String(n).padStart(w || 2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`; };
  /* mask $ amounts (Record X Clip with balances hidden) */
  V.maskMoney = (s) => String(s).replace(/[-+]?\$\s?[\d,]+(\.\d+)?[KMB]?/g, '$•••');
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V172;
