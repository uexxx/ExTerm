/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.0 Pro core (pure, no DOM, no network; runs on the page, in the worker and in Node tests).
   PHASE 2 Quant Lab Edge-Coach   round trips · MFE/MAE · 4h shadow counterfactuals · hour×day heatmap · walk-forward
                                  overfitting score · prop-firm challenge Monte Carlo · ATR SL/TP R:R grid · Kelly ·
                                  slippage re-sim · Pine v5 linter · tear sheet · backtest leaks + AI-coach prompt · playbooks
   PHASE 3 workstation            dirty-flag scheduler · O(1) spatial hash · Bot Fleet modes + 5-step arming wizard · torus
                                  mesh · self-improving hill-climb · morning levels · Black-Scholes greeks · GEX walls ·
                                  DOM spoof detector · 6-TF confluence · liquidation clusters · rug/honeypot AMM sim · block-0
                                  sniper bundles · smart-money ranking · multi-leg payoff + cone · RTH/ETH volume profile ·
                                  tick risk · CPI/FOMC reaction backtest · beta shock · order blocks · R:R ruler · NET BE ·
                                  smart trailing stops · voice command parser · Bull/Bear/Risk debate
   PHASE 4 Academy                5 modules of $100K paper missions · top journal mistake → custom drill
   PHASE 5 mobile + polish        10-language list · balance masking · wallet deep links · QR encoder · PIN policy · 1-click reach */
const V17P = (() => {
  const P = {};
  const fin = Number.isFinite, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.esc = esc; P.mean = mean; P.sd = sd;
  /* seeded PRNG (mulberry32): Monte Carlo and the self-improving loop are reproducible */
  P.rng = (seed) => { let a = (seed >>> 0) || 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  P.toSec = (x) => { const n = +x; return !fin(n) ? NaN : n > 1e11 ? Math.floor(n / 1000) : n; };
  const bsearch = (C, t) => { let lo = 0, hi = C.length - 1; if (!C.length) return -1; if (t <= C[0].t) return 0; if (t >= C[hi].t) return hi; while (lo < hi) { const m = (lo + hi) >> 1; if (C[m].t < t) lo = m + 1; else hi = m; } return lo; };
  P.bsearch = bsearch;

  /* ════════════════ PHASE 2 · QUANT LAB EDGE-COACH ════════════════ */
  /* buy/sell fills → FIFO round trips (long). Short accounts report side 'short'/'cover' and are mirrored. */
  P.roundTrips = (trades) => {
    const open = {}, out = [];
    for (const t of trades || []) {
      if (!t || !(t.price > 0)) continue; const s = t.sym || 'X', ts = P.toSec(t.ts);
      if (t.side === 'buy' || t.side === 'short') { (open[s] || (open[s] = [])).push({ ts, px: t.price, qty: +t.qty || 0, fee: +t.fee || 0, dir: t.side === 'short' ? -1 : 1 }); continue; }
      if (t.side !== 'sell' && t.side !== 'cover') continue;
      const q = open[s]; if (!q || !q.length) continue; let left = +t.qty || q.reduce((a, x) => a + x.qty, 0);
      const fee = +t.fee || 0, totQ = left;
      while (left > 1e-12 && q.length) {
        const e = q[0], take = Math.min(left, e.qty), frac = totQ > 0 ? take / totQ : 1, efrac = e.qty > 0 ? take / e.qty : 1;
        const gross = e.dir * (t.price - e.px) * take, f = fee * frac + e.fee * efrac;
        out.push({ sym: s, dir: e.dir, entryTs: e.ts, exitTs: ts, entry: e.px, exit: t.price, qty: take, pnl: gross - f, pnlPct: e.dir * (t.price - e.px) / e.px, fee: f, reason: t.reason || '' });
        e.qty -= take; e.fee -= e.fee * efrac; left -= take; if (e.qty <= 1e-12) q.shift();
      }
    }
    return out;
  };
  /* maximum favourable / adverse excursion while the trade was open, and how much of the MFE the exit captured */
  P.excursion = (rt, candles) => {
    const C = candles || [], i0 = bsearch(C, rt.entryTs), i1 = bsearch(C, rt.exitTs); if (i0 < 0) return null;
    let hi = Math.max(rt.entry, rt.exit), lo = Math.min(rt.entry, rt.exit);
    for (let i = i0; i <= i1 && i < C.length; i++) { if (C[i].t < rt.entryTs - 1 || C[i].t > rt.exitTs) continue; hi = Math.max(hi, C[i].h); lo = Math.min(lo, C[i].l); }
    const d = rt.dir || 1, fav = d > 0 ? hi - rt.entry : rt.entry - lo, adv = d > 0 ? rt.entry - lo : hi - rt.entry;
    const mfePct = fav / rt.entry, maePct = adv / rt.entry, realised = d * (rt.exit - rt.entry);
    return { mfe: fav * rt.qty, mae: adv * rt.qty, mfePct, maePct, capture: fav > 0 ? clamp(realised / fav, -9, 1) : 0 };
  };
  /* shadow counterfactual: what holding 4 h past the exit would have done */
  P.shadow = (rt, candles, sec) => {
    const C = candles || [], H = sec || 14400, i = bsearch(C, rt.exitTs); if (i < 0 || !C.length || C[C.length - 1].t < rt.exitTs) return null;
    let best = rt.exit, worst = rt.exit, last = rt.exit, j = i; const d = rt.dir || 1;
    for (; j < C.length && C[j].t <= rt.exitTs + H; j++) { if (C[j].t < rt.exitTs) continue; best = d > 0 ? Math.max(best, C[j].h) : Math.min(best, C[j].l); worst = d > 0 ? Math.min(worst, C[j].l) : Math.max(worst, C[j].h); last = C[j].c; }
    const ret = d * (last - rt.exit) / rt.exit, up = d * (best - rt.exit) / rt.exit, dn = d * (worst - rt.exit) / rt.exit, full = C[C.length - 1].t >= rt.exitTs + H;
    return { px: last, ret, bestPct: up, worstPct: dn, usd: d * (last - rt.exit) * rt.qty, complete: full, verdict: ret > 0.005 ? 'exited early' : ret < -0.005 ? 'good exit' : 'neutral' };
  };
  P.DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* win rate by entry hour × weekday (UTC, or a fixed offset in minutes) */
  P.heatmap = (rts, tzMin) => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, w: 0, pnl: 0, rate: null })));
    for (const r of rts || []) { const d = new Date((r.entryTs + (tzMin || 0) * 60) * 1000); if (!fin(d.getTime())) continue; const c = g[d.getUTCDay()][d.getUTCHours()]; c.n++; if (r.pnl > 0) c.w++; c.pnl += r.pnl; }
    let best = null, worst = null;
    for (let a = 0; a < 7; a++) for (let h = 0; h < 24; h++) { const c = g[a][h]; if (!c.n) continue; c.rate = c.w / c.n; if (c.n >= 2) { if (!best || c.rate > best.rate || (c.rate === best.rate && c.pnl > best.pnl)) best = { day: a, hour: h, rate: c.rate, n: c.n, pnl: c.pnl }; if (!worst || c.rate < worst.rate || (c.rate === worst.rate && c.pnl < worst.pnl)) worst = { day: a, hour: h, rate: c.rate, n: c.n, pnl: c.pnl }; } }
    return { grid: g, best, worst };
  };
  /* walk-forward overfitting score, 0 (robust) … 100 (curve-fit). Inputs: per fold in-sample vs out-of-sample stats.
     Blend of: Sharpe decay IS→OOS, share of folds whose OOS return is negative while IS was positive, OOS dispersion. */
  P.overfit = (folds) => {
    const F = (folds || []).filter((f) => f && f.is && f.oos && fin(f.is.ret) && fin(f.oos.ret)); if (!F.length) return { score: null, grade: '–', folds: 0 };
    const sIs = mean(F.map((f) => (fin(f.is.sharpe) ? f.is.sharpe : 0))), sOos = mean(F.map((f) => (fin(f.oos.sharpe) ? f.oos.sharpe : 0)));
    const decay = sIs > 0 ? clamp((sIs - sOos) / sIs, 0, 1.5) / 1.5 : sOos < 0 ? 1 : 0.5;
    const flips = F.filter((f) => f.is.ret > 0 && f.oos.ret <= 0).length / F.length;
    const rIs = mean(F.map((f) => f.is.ret)), rOos = mean(F.map((f) => f.oos.ret)), retDecay = rIs > 0 ? clamp((rIs - rOos) / rIs, 0, 2) / 2 : rOos < 0 ? 1 : 0.5;
    const disp = clamp(sd(F.map((f) => f.oos.ret)) / (Math.abs(rOos) + 0.01) / 4, 0, 1);
    const score = Math.round(100 * clamp(0.4 * decay + 0.3 * flips + 0.2 * retDecay + 0.1 * disp, 0, 1));
    return { score, grade: score < 25 ? 'Robust' : score < 50 ? 'Moderate' : score < 75 ? 'Fragile' : 'Curve-fit', folds: F.length, sharpeIs: sIs, sharpeOos: sOos, retIs: rIs, retOos: rOos, flips };
  };
  /* anchored walk-forward folds over candle indices: [{ isFrom, isTo, oosFrom, oosTo }] */
  P.wfFolds = (n, k, oosFrac) => { const K = Math.max(2, k | 0), seg = Math.floor(n / (K + 1)), out = []; if (seg < 20) return out; for (let i = 1; i <= K; i++) out.push({ isFrom: 0, isTo: seg * i - 1, oosFrom: seg * i, oosTo: Math.min(n - 1, seg * i + Math.max(10, Math.floor(seg * (oosFrac || 1))) - 1) }); return out; };
  P.statsOf = (eq) => { if (!eq || eq.length < 3) return { ret: 0, sharpe: 0, dd: 0 }; const r = []; let pk = eq[0], dd = 0; for (let i = 1; i < eq.length; i++) { r.push(eq[i] / eq[i - 1] - 1); pk = Math.max(pk, eq[i]); dd = Math.max(dd, 1 - eq[i] / pk); } const s = sd(r); return { ret: eq[eq.length - 1] / eq[0] - 1, sharpe: s > 0 ? (mean(r) / s) * Math.sqrt(r.length) : 0, dd }; };

  /* prop-firm challenge Monte Carlo: bootstrap per-trade returns into daily paths */
  P.PROP = { 50000: { size: 50000, target: 0.08, daily: 0.05, maxDD: 0.10, days: 30, fee: 155 }, 100000: { size: 100000, target: 0.08, daily: 0.05, maxDD: 0.10, days: 30, fee: 299 }, 200000: { size: 200000, target: 0.08, daily: 0.05, maxDD: 0.10, days: 30, fee: 549 } };
  P.propSim = (rets, o) => {
    const R = (rets || []).filter(fin), cfg = Object.assign({}, P.PROP[100000], P.PROP[(o && o.size) || 100000] || {}, o || {}), sims = cfg.sims || 2000, tpd = Math.max(1, cfg.tradesPerDay || 3), rnd = P.rng(cfg.seed || 7);
    if (!R.length) return { pass: 0, failDaily: 0, failDD: 0, timeout: 0, medianDays: null, sims: 0, cfg };
    let pass = 0, fd = 0, fdd = 0, to = 0; const days = [];
    for (let s = 0; s < sims; s++) {
      let eq = 1, hi = 1, res = 'timeout';
      for (let d = 1; d <= cfg.days && res === 'timeout'; d++) {
        const open = eq;
        for (let k = 0; k < tpd; k++) { eq *= 1 + R[Math.floor(rnd() * R.length)] * (cfg.risk || 1); hi = Math.max(hi, eq); if (open - eq >= cfg.daily) { res = 'daily'; break; } if (1 - eq >= cfg.maxDD) { res = 'dd'; break; } }
        if (res === 'timeout' && eq - 1 >= cfg.target) { res = 'pass'; days.push(d); }
      }
      if (res === 'pass') pass++; else if (res === 'daily') fd++; else if (res === 'dd') fdd++; else to++;
    }
    days.sort((a, b) => a - b);
    return { pass: pass / sims, failDaily: fd / sims, failDD: fdd / sims, timeout: to / sims, medianDays: days.length ? days[days.length >> 1] : null, sims, cfg, ev: (pass / sims) * cfg.size * cfg.target * 0.8 - cfg.fee };
  };

  /* Wilder ATR on candle objects */
  P.atr = (C, n) => { const N = n || 14, out = new Array(C.length).fill(NaN); let a = 0; for (let i = 1; i < C.length; i++) { const tr = Math.max(C[i].h - C[i].l, Math.abs(C[i].h - C[i - 1].c), Math.abs(C[i].l - C[i - 1].c)); if (i <= N) { a += tr; if (i === N) { a /= N; out[i] = a; } } else { a = (a * (N - 1) + tr) / N; out[i] = a; } } return out; };
  /* one entry at bar i (long dir 1 / short -1) with absolute stop / target distances: R multiple of the outcome */
  P.simEntry = (C, i, sl, tp, dir, maxBars) => {
    const d = dir || 1, e = C[i].c, stop = e - d * sl, tgt = e + d * tp, end = Math.min(C.length - 1, i + (maxBars || 200));
    for (let j = i + 1; j <= end; j++) { const b = C[j], hitS = d > 0 ? b.l <= stop : b.h >= stop, hitT = d > 0 ? b.h >= tgt : b.l <= tgt; if (hitS) return -1; if (hitT) return tp / sl; }
    return (d * (C[end].c - e)) / sl;
  };
  P.MULTS = [0.5, 1, 1.5, 2, 2.5, 3];
  /* SL × TP (in ATR) expectancy heatmap over the entries; best cell by expectancy in R then win rate */
  P.rrGrid = (C, entries, mults, dir) => {
    const M = mults || P.MULTS, A = P.atr(C, 14), E = (entries || []).filter((i) => i > 14 && i < C.length - 2 && fin(A[i])), cells = [];
    let best = null;
    for (let a = 0; a < M.length; a++) { const row = []; for (let b = 0; b < M.length; b++) {
      let s = 0, w = 0; for (const i of E) { const r = P.simEntry(C, i, M[a] * A[i], M[b] * A[i], dir, 200); s += r; if (r > 0) w++; }
      const c = { sl: M[a], tp: M[b], exp: E.length ? s / E.length : 0, win: E.length ? w / E.length : 0, n: E.length }; row.push(c);
      if (E.length && (!best || c.exp > best.exp || (c.exp === best.exp && c.win > best.win))) best = c; } cells.push(row); }
    return { mults: M, cells, best, n: E.length, atr: A[A.length - 1] };
  };
  P.entriesOf = (C, rts) => (rts || []).map((r) => bsearch(C, r.entryTs)).filter((i) => i >= 0);
  /* Kelly fraction from win rate and average win / loss (both positive numbers) */
  P.kelly = (p, avgWin, avgLoss) => { if (!(avgLoss > 0) || !(avgWin > 0) || !fin(p)) return { full: 0, half: 0, quarter: 0, edge: 0, b: 0 }; const b = avgWin / avgLoss, f = clamp(p - (1 - p) / b, 0, 1); return { full: f, half: f / 2, quarter: f / 4, edge: p * b - (1 - p), b }; };
  P.kellyOf = (rts) => { const W = rts.filter((r) => r.pnl > 0), L = rts.filter((r) => r.pnl <= 0); return P.kelly(rts.length ? W.length / rts.length : 0, mean(W.map((r) => r.pnlPct)), Math.abs(mean(L.map((r) => r.pnlPct)))); };
  /* re-simulate round trips with extra slippage (bps per side) */
  P.slipResim = (rts, bps) => { const k = (bps || 0) / 1e4; let base = 0, adj = 0; for (const r of rts || []) { base += r.pnl; adj += r.pnl - (r.entry + r.exit) * r.qty * k; } return { base, pnl: adj, delta: adj - base, bps: bps || 0 }; };
  P.slipCurve = (rts) => [0, 5, 10, 20, 30, 40, 50].map((b) => P.slipResim(rts, b));

  /* Pine Script v5 inline linter: [{ line, sev: 'error'|'warn'|'info', msg }] */
  P.pineLint = (src) => {
    const L = String(src || '').split(/\r?\n/), out = [], add = (line, sev, msg) => out.push({ line, sev, msg });
    const vi = L.findIndex((l) => /^\s*\/\/\s*@version\s*=\s*\d+/.test(l));
    if (vi < 0) add(1, 'error', 'Missing "//@version=5" header'); else { const v = +/=\s*(\d+)/.exec(L[vi])[1]; if (v < 5) add(vi + 1, 'error', `Version ${v} script: v5 is required (study → indicator, security → request.security, input types → input.int/float/…)`); }
    const decl = L.findIndex((l) => /^\s*(indicator|strategy|library)\s*\(/.test(l)); if (decl < 0 && !L.some((l) => /^\s*study\s*\(/.test(l))) add(1, 'error', 'No indicator(), strategy() or library() declaration');
    const depth = { '(': 0, '[': 0 }, declared = new Set(['close', 'open', 'high', 'low', 'volume', 'time', 'bar_index', 'na', 'hl2', 'hlc3', 'ohlc4']);
    L.forEach((raw, i) => {
      const n = i + 1, l = raw.replace(/\/\/.*$/, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
      if (/^\s*study\s*\(/.test(l)) add(n, 'error', 'study() was renamed indicator() in v5');
      if (/(^|[^.\w])security\s*\(/.test(l)) add(n, 'error', 'security() is request.security() in v5');
      if (/\b(sma|ema|rsi|atr|wma|crossover|crossunder|highest|lowest|stdev|macd|stoch)\s*\(/.test(l) && !/\bta\.\w+\s*\(/.test(l.replace(/\b(sma|ema|rsi|atr|wma|crossover|crossunder|highest|lowest|stdev|macd|stoch)\s*\(/, ''))) { const m = /(^|[^.\w])(sma|ema|rsi|atr|wma|crossover|crossunder|highest|lowest|stdev|macd|stoch)\s*\(/.exec(l); if (m) add(n, 'error', `${m[2]}() needs the ta. namespace in v5 (ta.${m[2]})`); }
      if (/\binput\s*\([^)]*type\s*=\s*input\./.test(l)) add(n, 'warn', 'input(type=…) is deprecated: use input.int(), input.float(), input.bool() …');
      if (/\btransp\s*=/.test(l)) add(n, 'warn', 'transp= is removed in v5: use color.new(color, transparency)');
      if (/\b(iff)\s*\(/.test(l)) add(n, 'warn', 'iff() is removed in v5: use the ?: ternary');
      if (/^\t/.test(raw)) add(n, 'info', 'Tab indentation: Pine expects 4 spaces (or a multiple)');
      else { const m = /^( +)\S/.exec(raw); if (m && m[1].length % 4 !== 0 && !/^\s*[|&+\-*/?:,]/.test(raw.trim())) add(n, 'warn', 'Indentation is not a multiple of 4 spaces'); }
      const dm = /^\s*(?:var\s+|varip\s+)?(?:(?:float|int|bool|string|color|line|label|box|table|array<[^>]+>)\s+)?([A-Za-z_]\w*)\s*=(?!=)/.exec(l); if (dm) declared.add(dm[1]);
      const ra = /^\s*([A-Za-z_]\w*)\s*:=/.exec(l); if (ra && !declared.has(ra[1])) add(n, 'error', `"${ra[1]}" is reassigned with := before it is declared with =`);
      for (const ch of l) { if (ch === '(' || ch === '[') depth[ch]++; else if (ch === ')') depth['(']--; else if (ch === ']') depth['[']--; }
      if (depth['('] < 0) { add(n, 'error', 'Unbalanced ")"'); depth['('] = 0; } if (depth['['] < 0) { add(n, 'error', 'Unbalanced "]"'); depth['['] = 0; }
      if (/strategy\.(entry|order)\s*\(/.test(l) && decl >= 0 && !/^\s*strategy\s*\(/.test(L[decl])) add(n, 'error', 'strategy.* calls need a strategy() declaration');
    });
    if (depth['('] > 0) add(L.length, 'error', `${depth['(']} unclosed "("`); if (depth['['] > 0) add(L.length, 'error', `${depth['[']} unclosed "["`);
    return out.sort((a, b) => a.line - b.line);
  };

  /* Obsidian / Gold tear sheet: self-contained HTML (inline CSS, no scripts) */
  P.tearSheet = (meta, stats, rts, extra) => {
    const m = meta || {}, s = stats || {}, x = extra || {}, pct = (v) => (fin(v) ? (v * 100).toFixed(2) + '%' : '–'), num = (v, d) => (fin(v) ? (+v).toFixed(d == null ? 2 : d) : '–');
    const W = (rts || []).filter((r) => r.pnl > 0), rows = (rts || []).slice(-40).map((r) => `<tr><td>${esc(new Date(r.entryTs * 1000).toISOString().slice(0, 16).replace('T', ' '))}</td><td>${r.dir < 0 ? 'Short' : 'Long'}</td><td>${num(r.entry, 4)}</td><td>${num(r.exit, 4)}</td><td class="${r.pnl >= 0 ? 'up' : 'dn'}">${num(r.pnl)}</td><td>${pct(r.pnlPct)}</td></tr>`).join('');
    const kv = (k, v) => `<div class="k"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(m.title || 'ExTerm Tear Sheet')}</title>
<style>body{margin:0;background:#07080B;color:#E8E6E1;font:14px/1.5 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums}main{max-width:960px;margin:0 auto;padding:32px 20px}h1{color:#F5C84B;font-size:26px;margin:0 0 4px;letter-spacing:.02em}.sub{color:#9A968C;margin-bottom:22px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:24px}.k{background:#0E1015;border:1px solid #2A2618;border-radius:10px;padding:10px 12px}.k span{display:block;color:#9A968C;font-size:12px}.k b{color:#F5C84B;font-size:18px}table{width:100%;border-collapse:collapse;font-size:12.5px}th{color:#F5C84B;text-align:left;border-bottom:1px solid #3A3220;padding:6px}td{padding:5px 6px;border-bottom:1px solid #16181E}.up{color:#2ECC8F}.dn{color:#FF5C6C}footer{color:#6E6A60;font-size:11px;margin-top:26px}</style></head><body><main>
<h1>${esc(m.title || 'Strategy Tear Sheet')}</h1><div class="sub">${esc(m.sym || '')} · ${esc(m.tf || '')} · ${esc(m.strategy || '')} · generated ${esc(new Date(m.at || 0).toISOString().slice(0, 10))}</div>
<div class="g">${kv('Net return', pct(s.ret))}${kv('Max drawdown', pct(s.dd != null ? -Math.abs(s.dd) : NaN))}${kv('Sharpe', num(s.sharpe))}${kv('Trades', String((rts || []).length))}${kv('Win rate', pct((rts || []).length ? W.length / rts.length : NaN))}${kv('Overfitting score', x.overfit != null ? x.overfit + ' / 100' : '–')}${kv('Half-Kelly', pct(x.halfKelly))}${kv('Prop pass (100K)', pct(x.propPass))}</div>
<table><thead><tr><th>Entry (UTC)</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Return</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No closed trades</td></tr>'}</tbody></table>
<footer>ExTerm v17.1 · Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Simulated results are not a guarantee of future performance.</footer></main></body></html>`;
  };

  /* backtest leaks: the specific habits costing money, ranked */
  P.leaks = (rts, ctx) => {
    const c = ctx || {}, L = [], R = rts || []; if (!R.length) return L;
    const ex = (c.ex || []).filter(Boolean);
    if (ex.length) { const cap = mean(ex.map((e) => e.capture)); if (cap < 0.35) L.push({ k: 'giveback', sev: 3, msg: `Exits capture only ${(cap * 100).toFixed(0)}% of the best price reached (MFE): winners are given back` }); const deep = ex.filter((e) => e.maePct > 0.03).length / ex.length; if (deep > 0.25) L.push({ k: 'mae', sev: 2, msg: `${(deep * 100).toFixed(0)}% of trades sat more than 3% underwater (MAE): stops are too loose or entries early` }); }
    const sh = (c.shadow || []).filter((s) => s && s.complete); if (sh.length >= 3) { const early = sh.filter((s) => s.ret > 0.005).length / sh.length; if (early > 0.5) L.push({ k: 'early', sev: 2, msg: `${(early * 100).toFixed(0)}% of exits kept running ≥ 0.5% in the next 4 h: consider a trailing exit` }); }
    if (c.heat && c.heat.worst && c.heat.worst.rate < 0.35) L.push({ k: 'hour', sev: 2, msg: `${P.DAYS[c.heat.worst.day]} ${String(c.heat.worst.hour).padStart(2, '0')}:00 UTC wins only ${(c.heat.worst.rate * 100).toFixed(0)}% (${c.heat.worst.n} trades): skip that window` });
    if (c.overfit && c.overfit.score != null && c.overfit.score >= 50) L.push({ k: 'overfit', sev: 3, msg: `Walk-forward overfitting score ${c.overfit.score}/100 (${c.overfit.grade}): parameters do not survive out-of-sample` });
    if (c.slip) { const s20 = c.slip.find((x) => x.bps === 20); if (s20 && s20.base > 0 && s20.pnl <= 0) L.push({ k: 'slip', sev: 3, msg: 'Edge disappears at 20 bps slippage: too thin for live fills' }); }
    const lossStreak = (() => { let m = 0, k = 0; for (const r of R) { k = r.pnl <= 0 ? k + 1 : 0; m = Math.max(m, k); } return m; })(); if (lossStreak >= 5) L.push({ k: 'streak', sev: 1, msg: `Longest losing streak ${lossStreak}: size so that ${lossStreak + 3} losses in a row stay survivable` });
    const W = R.filter((r) => r.pnl > 0), Lo = R.filter((r) => r.pnl <= 0); if (W.length && Lo.length && Math.abs(mean(Lo.map((r) => r.pnl))) > 1.5 * mean(W.map((r) => r.pnl)) && W.length / R.length < 0.6) L.push({ k: 'asym', sev: 2, msg: 'Average loss is more than 1.5× the average win at a sub-60% win rate' });
    return L.sort((a, b) => b.sev - a.sev);
  };
  P.coachPrompt = (leaks, stats, meta) => `You are my trading coach. Here are the leaks found in my ExTerm backtest of ${meta && meta.strategy ? meta.strategy : 'my strategy'} on ${meta && meta.sym ? meta.sym : 'one symbol'} (${meta && meta.tf ? meta.tf : '?'}):\n` +
    (leaks.length ? leaks.map((l, i) => `${i + 1}. ${l.msg}`).join('\n') : 'No major leaks detected.') + `\nStats: return ${stats && fin(stats.ret) ? (stats.ret * 100).toFixed(1) + '%' : '?'}, max DD ${stats && fin(stats.dd) ? (Math.abs(stats.dd) * 100).toFixed(1) + '%' : '?'}, Sharpe ${stats && fin(stats.sharpe) ? stats.sharpe.toFixed(2) : '?'}.\nGive me the 3 highest-impact concrete rule changes, each with the parameter to change and how to verify it in a walk-forward test. Do not suggest increasing leverage.`;

  /* sanitized .exterm.json playbooks: no keys, secrets, wallets, endpoints or personal data survive */
  const SECRET = /key|secret|token|pass|pwd|seed|mnemonic|private|priv|auth|cookie|session|wallet|address|email|phone|endpoint|url|webhook|account|signer|bearer/i;
  P.PLAYBOOK = 'exterm.playbook';
  P.sanitize = (v, depth) => {
    const d = depth || 0; if (d > 6) return undefined;
    if (v == null || typeof v === 'boolean') return v; if (typeof v === 'number') return fin(v) ? v : undefined;
    if (typeof v === 'string') { if (/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(v) || /https?:\/\/|wss?:\/\/|@[a-z0-9-]+\./i.test(v)) return undefined; return v.slice(0, 2000); }
    if (Array.isArray(v)) return v.slice(0, 500).map((x) => P.sanitize(x, d + 1)).filter((x) => x !== undefined);
    if (typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (SECRET.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue; const s = P.sanitize(x, d + 1); if (s !== undefined) o[k.slice(0, 60)] = s; } return o; }
    return undefined;
  };
  P.exportPlaybook = (pb, at) => JSON.stringify({ format: P.PLAYBOOK, v: 1, at: at || 0, playbook: P.sanitize(pb) }, null, 2);
  P.importPlaybook = (text) => {
    let j; try { j = JSON.parse(String(text || '')); } catch (e) { return { ok: false, error: 'not JSON' }; }
    if (!j || j.format !== P.PLAYBOOK || j.v !== 1 || typeof j.playbook !== 'object' || !j.playbook) return { ok: false, error: 'not an ExTerm playbook (.exterm.json v1)' };
    const pb = P.sanitize(j.playbook); if (!pb.name || typeof pb.name !== 'string') return { ok: false, error: 'playbook needs a name' };
    return { ok: true, playbook: pb };
  };

  /* ════════════════ PHASE 3 · CANVAS, BOT FLEET, BRIEFING, GEX, DOM, PULSE, 3D ════════════════ */
  /* dirty-flag scheduler: layers only repaint when marked dirty; an idle tick is one integer compare */
  P.Scheduler = class {
    constructor(layers) { this.L = (layers || ['static', 'live']).slice(); this.mask = 0; this.paints = 0; this.idle = 0; this.fn = {}; }
    on(layer, fn) { this.fn[layer] = fn; return this; }
    mark(layer) { const i = this.L.indexOf(layer); if (i >= 0) this.mask |= 1 << i; }
    markAll() { this.mask = (1 << this.L.length) - 1; }
    dirty(layer) { return !!(this.mask & (1 << this.L.indexOf(layer))); }
    tick() { if (!this.mask) { this.idle++; return 0; } const m = this.mask; this.mask = 0; let n = 0; for (let i = 0; i < this.L.length; i++) if (m & (1 << i)) { const f = this.fn[this.L[i]]; if (f) f(); n++; } this.paints += n; return n; }
  };
  /* uniform spatial hash: insert boxes, query a point in O(1) average (one cell lookup) */
  P.SpatialGrid = class {
    constructor(cell) { this.c = cell || 32; this.m = new Map(); this.n = 0; }
    key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
    clear() { this.m.clear(); this.n = 0; }
    insert(x, y, w, h, item) { const c = this.c, x0 = Math.floor(x / c), x1 = Math.floor((x + w) / c), y0 = Math.floor(y / c), y1 = Math.floor((y + h) / c), box = { x, y, w, h, item }; for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(box); } this.n++; }
    hit(px, py) { const a = this.m.get(this.key(Math.floor(px / this.c), Math.floor(py / this.c))); if (!a) return null; for (let i = a.length - 1; i >= 0; i--) { const b = a[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.item; } return null; }
  };

  /* Bot Fleet */
  P.MODES = [{ id: 'paper', label: 'Paper Sandbox', desc: 'Simulated fills on the $100K paper account. No real orders.', live: false },
    { id: 'copilot', label: 'Attended Co-Pilot', desc: 'The bot proposes; every order waits for your 1-click approve.', live: true },
    { id: 'live', label: 'Live Unattended 24/7', desc: 'Signals go straight to your local bot. Requires the 5-step arming wizard.', live: true }];
  P.ARM_PHRASE = 'ARM LIVE BOT';
  P.ARM_STEPS = ['Risk acknowledgement', 'Zero-overdraft settled-cash cap', 'Max slippage (bps)', 'Daily loss kill-switch', 'Type ARM LIVE BOT'];
  /* validates the arming wizard up to step k (0-based); returns { ok, step, error } at the first failing step */
  P.armCheck = (s, upTo) => {
    const st = s || {}, K = upTo == null ? 4 : upTo, fail = (i, e) => ({ ok: false, step: i, error: e });
    if (K >= 0 && st.ack !== true) return fail(0, 'Tick the box: live orders can lose real money and ExTerm Labs is not your broker');
    if (K >= 1) { const cap = +st.cap, cash = +st.settled; if (!(cash > 0)) return fail(1, 'Enter your settled cash balance (unsettled funds cannot be used)'); if (!(cap > 0)) return fail(1, 'Enter a cash cap greater than $0'); if (cap > cash) return fail(1, 'Zero-overdraft rule: the cap cannot exceed settled cash'); }
    if (K >= 2) { const b = +st.slipBps; if (!(b >= 1 && b <= 100)) return fail(2, 'Max slippage must be between 1 and 100 bps'); }
    if (K >= 3) { const d = +st.dailyLoss; if (!(d > 0)) return fail(3, 'Set a daily loss limit greater than $0'); if (d > +st.cap) return fail(3, 'Daily loss limit cannot exceed the cash cap'); }
    if (K >= 4 && String(st.phrase || '').trim() !== P.ARM_PHRASE) return fail(4, 'Type ARM LIVE BOT exactly (capitals) to arm');
    return { ok: true, step: K + 1, error: '' };
  };
  /* order guard for an armed bot: never more than the cap's free cash, never worse than max slippage */
  P.fleetGuard = (order, arm, spent) => {
    if (!arm || !arm.armed) return { ok: false, why: 'not armed' }; const usd = +order.usd, free = +arm.cap - (+spent || 0);
    if (!(usd > 0)) return { ok: false, why: 'empty order' }; if (usd > free + 1e-9) return { ok: false, why: `exceeds settled-cash cap ($${free.toFixed(2)} free)` };
    if (order.ref > 0 && order.px > 0) { const bps = Math.abs(order.px / order.ref - 1) * 1e4; if (bps > +arm.slipBps) return { ok: false, why: `slippage ${bps.toFixed(1)} bps > max ${arm.slipBps}` }; }
    if ((+arm.lossToday || 0) >= +arm.dailyLoss) return { ok: false, why: 'daily loss kill-switch tripped' };
    return { ok: true, why: '' };
  };
  /* torus mesh (x, y, z triplets) into a reusable Float32Array: u around the ring, v around the tube */
  P.torus = (nu, nv, R, r, out) => { const n = nu * nv, f = out && out.length >= n * 3 ? out : new Float32Array(n * 3); let k = 0; for (let i = 0; i < nu; i++) { const u = (i / nu) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u); for (let j = 0; j < nv; j++) { const v = (j / nv) * Math.PI * 2, w = R + r * Math.cos(v); f[k++] = w * cu; f[k++] = w * su; f[k++] = r * Math.sin(v); } } return f; };
  /* self-improving loop: seeded hill-climb over numeric params with bounds; keeps a candidate only if score improves */
  P.evolve = (params, bounds, score, iters, seed) => {
    const rnd = P.rng(seed || 1), keys = Object.keys(bounds || {}); let best = Object.assign({}, params), bs = score(best); const hist = [bs];
    for (let i = 0; i < (iters || 20); i++) { const c = Object.assign({}, best); for (const k of keys) { const [lo, hi, step] = bounds[k]; if (rnd() < 0.5) { const d = (rnd() < 0.5 ? -1 : 1) * (step || (hi - lo) / 10) * (1 + Math.floor(rnd() * 3)); const cur = fin(+c[k]) ? +c[k] : lo; c[k] = clamp(step ? Math.round((cur + d) / step) * step : cur + d, lo, hi); } } const s = score(c); if (s > bs) { best = c; bs = s; } hist.push(bs); }
    return { params: best, score: bs, history: hist };
  };

  /* morning levels from intraday candles (seconds): previous day H/L/C, overnight H/L, floor pivots. Day boundary at UTC+tz. */
  P.morningLevels = (C, nowSec, tzMin, openMin) => {
    if (!C || C.length < 10) return null; const off = (tzMin || 0) * 60, dayOf = (t) => Math.floor((t + off) / 86400), today = dayOf(nowSec || C[C.length - 1].t), om = openMin == null ? 0 : openMin;
    const prev = C.filter((c) => dayOf(c.t) === today - 1); const pd = prev.length ? prev : C.filter((c) => dayOf(c.t) < today).slice(-Math.max(1, Math.floor(C.length / 3)));
    if (!pd.length) return null; const H = Math.max(...pd.map((c) => c.h)), Lw = Math.min(...pd.map((c) => c.l)), Cl = pd[pd.length - 1].c;
    const on = C.filter((c) => dayOf(c.t) === today && ((c.t + off) % 86400) / 60 < om), pv = (H + Lw + Cl) / 3;
    const lv = { pdh: H, pdl: Lw, pdc: Cl, pivot: pv, r1: 2 * pv - Lw, s1: 2 * pv - H, r2: pv + (H - Lw), s2: pv - (H - Lw) };
    if (on.length) { lv.onh = Math.max(...on.map((c) => c.h)); lv.onl = Math.min(...on.map((c) => c.l)); }
    return lv;
  };
  P.LEVEL_NAMES = { pdh: 'Prev Day High', pdl: 'Prev Day Low', pdc: 'Prev Close', onh: 'Overnight High', onl: 'Overnight Low', pivot: 'Pivot', r1: 'R1', s1: 'S1', r2: 'R2', s2: 'S2' };

  /* Black-Scholes */
  const ncdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x > 0 ? 1 - p : p; };
  const npdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
  P.ncdf = ncdf;
  P.bs = (S, K, T, r, iv, type) => {
    const t = Math.max(T, 1e-6), v = Math.max(iv, 1e-4), d1 = (Math.log(S / K) + (r + v * v / 2) * t) / (v * Math.sqrt(t)), d2 = d1 - v * Math.sqrt(t), call = type !== 'P' && type !== 'put';
    const price = call ? S * ncdf(d1) - K * Math.exp(-r * t) * ncdf(d2) : K * Math.exp(-r * t) * ncdf(-d2) - S * ncdf(-d1);
    return { price, delta: call ? ncdf(d1) : ncdf(d1) - 1, gamma: npdf(d1) / (S * v * Math.sqrt(t)), vega: S * npdf(d1) * Math.sqrt(t) / 100, theta: (-(S * npdf(d1) * v) / (2 * Math.sqrt(t)) - (call ? 1 : -1) * r * K * Math.exp(-r * t) * ncdf(call ? d2 : -d2)) / 365 };
  };
  /* dealer gamma exposure per strike ($ per 1% move): calls +, puts −; flip where the cumulative profile crosses zero */
  P.gex = (chain, spot, mult) => {
    const M = mult || 100, by = new Map();
    for (const o of chain || []) { if (!(o.strike > 0) || !(o.oi >= 0)) continue; const g = fin(o.gamma) ? o.gamma : P.bs(spot, o.strike, o.T || 30 / 365, 0.04, o.iv || 0.5, o.type).gamma; const v = g * o.oi * M * spot * spot * 0.01 * (o.type === 'P' ? -1 : 1); const x = by.get(o.strike) || { strike: o.strike, call: 0, put: 0, net: 0 }; if (o.type === 'P') x.put += v; else x.call += v; x.net += v; by.set(o.strike, x); }
    const rows = [...by.values()].sort((a, b) => a.strike - b.strike); if (!rows.length) return { rows, flip: null, callWall: null, putWall: null, total: 0 };
    let cum = 0, flip = null; for (let i = 0; i < rows.length; i++) { const prev = cum; cum += rows[i].net; rows[i].cum = cum; if (i && flip == null && Math.sign(prev) !== Math.sign(cum) && prev !== 0) { const a = rows[i - 1].strike, b = rows[i].strike; flip = a + (b - a) * (Math.abs(prev) / (Math.abs(prev) + Math.abs(cum))); } }
    /* true zero-gamma level: total dealer gamma recomputed at hypothetical spots (needs IV, not a fixed per-option gamma) */
    const live = (chain || []).filter((o) => o.strike > 0 && o.oi >= 0 && !fin(o.gamma));
    if (live.length && live.length === (chain || []).length) {
      const tot = (S) => live.reduce((s, o) => s + P.bs(S, o.strike, o.T || 30 / 365, 0.04, o.iv || 0.5, o.type).gamma * o.oi * M * S * S * 0.01 * (o.type === 'P' ? -1 : 1), 0);
      const lo = rows[0].strike, hi = rows[rows.length - 1].strike, N = 120; let prevS = lo, prevV = tot(lo), best = null;
      for (let i = 1; i <= N; i++) { const S = lo + ((hi - lo) * i) / N, v = tot(S); if (Math.sign(v) !== Math.sign(prevV) && prevV !== 0) { const x = prevS + (S - prevS) * (Math.abs(prevV) / (Math.abs(prevV) + Math.abs(v))); if (best == null || Math.abs(x - spot) < Math.abs(best - spot)) best = x; } prevS = S; prevV = v; }
      if (best != null) flip = best; cum = tot(spot); // regime at the current spot
    }
    const cw = rows.reduce((m, r) => (r.call > m.call ? r : m), rows[0]), pw = rows.reduce((m, r) => (r.put < m.put ? r : m), rows[0]);
    return { rows, flip, callWall: cw.strike, putWall: pw.strike, total: cum, regime: cum >= 0 ? 'positive gamma (mean-reverting)' : 'negative gamma (trend-amplifying)' };
  };
  /* deterministic model chain around spot when no live chain is available: OI concentrated at round strikes */
  P.modelChain = (spot, seed) => { const rnd = P.rng(seed || 3), step = spot > 5000 ? 500 : spot > 1000 ? 50 : spot > 100 ? 5 : spot > 10 ? 1 : 0.1, base = Math.round(spot / step) * step, out = []; for (let k = -10; k <= 10; k++) { const K = +(base + k * step).toFixed(6); if (K <= 0) continue; const round = Math.abs(K / (step * 4) - Math.round(K / (step * 4))) < 1e-9 ? 2.2 : 1; const wc = Math.exp(-((k - 3) * (k - 3)) / 18) * round, wp = Math.exp(-((k + 3) * (k + 3)) / 18) * round; out.push({ strike: K, type: 'C', oi: Math.round((800 + rnd() * 1200) * wc), iv: 0.45 + Math.abs(k) * 0.01 }); out.push({ strike: K, type: 'P', oi: Math.round((800 + rnd() * 1200) * wp), iv: 0.5 + Math.abs(k) * 0.012 }); } return out; }; // calls stacked above spot, puts below (typical positioning)

  /* DOM spoof detector: a resting size ≥ k × the book median that vanishes within maxMs without the price trading there */
  P.spoofs = (snaps, o) => {
    const k = (o && o.k) || 5, maxMs = (o && o.maxMs) || 3000, seen = new Map(), out = [];
    for (let s = 0; s < (snaps || []).length; s++) {
      const S = snaps[s], lv = (S.bids || []).map((x) => ['bid', x[0], x[1]]).concat((S.asks || []).map((x) => ['ask', x[0], x[1]])); if (!lv.length) continue;
      const sz = lv.map((x) => x[2]).sort((a, b) => a - b), med = sz[sz.length >> 1] || 0, cur = new Set();
      for (const [side, px, q] of lv) { const key = side + px; if (q >= k * med && med > 0) { cur.add(key); if (!seen.has(key)) seen.set(key, { side, px, q, t0: S.t }); } }
      for (const [key, v] of seen) if (!cur.has(key)) { const life = S.t - v.t0, traded = side2(v, S); if (life <= maxMs && !traded) out.push({ side: v.side, px: v.px, qty: v.q, lifeMs: life, t: S.t }); seen.delete(key); }
    }
    return out;
    function side2(v, S) { return v.side === 'bid' ? S.last != null && S.last <= v.px : S.last != null && S.last >= v.px; }
  };
  /* 6-timeframe confluence: each TF votes +1 bull / −1 bear / 0 by close vs EMA20 vs EMA50 */
  const emaArr = (a, n) => { const k = 2 / (n + 1), o = []; let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[0]; o.push(e); } return o; };
  P.ema = emaArr;
  P.tfBias = (C) => { if (!C || C.length < 20) return 0; const cl = C.map((c) => c.c), e20 = emaArr(cl, 20), e50 = emaArr(cl, Math.min(50, cl.length)), i = cl.length - 1; return cl[i] > e20[i] && e20[i] >= e50[i] ? 1 : cl[i] < e20[i] && e20[i] <= e50[i] ? -1 : 0; };
  P.TF6 = [['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400], ['1D', 86400]];
  P.resample = (C, sec) => { const out = []; let cur = null; for (const c of C || []) { const b = Math.floor(c.t / sec) * sec; if (!cur || cur.t !== b) { cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0 }; out.push(cur); } else { cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; cur.v += c.v || 0; } } return out; };
  P.confluence = (byTf) => { const votes = P.TF6.map(([k]) => ({ tf: k, bias: P.tfBias((byTf || {})[k]) })), s = votes.reduce((a, v) => a + v.bias, 0); return { votes, score: s, label: s >= 4 ? 'Strong bull' : s >= 2 ? 'Bull' : s <= -4 ? 'Strong bear' : s <= -2 ? 'Bear' : 'Mixed' }; };

  /* crypto liquidation clusters (estimate): positions opened at recent volume-weighted prices at common leverages */
  P.LEVS = [5, 10, 25, 50, 100];
  P.liqClusters = (C, price, bucketPct) => {
    const bk = (bucketPct || 0.25) / 100 * price, M = new Map(), R = (C || []).slice(-300);
    for (const c of R) { const px = (c.h + c.l + c.c) / 3, v = (c.v || 1) * px; for (const L of P.LEVS) { const w = v / L; for (const [side, lp] of [['long', px * (1 - 1 / L + 0.005)], ['short', px * (1 + 1 / L - 0.005)]]) { if (side === 'long' && lp >= price) continue; if (side === 'short' && lp <= price) continue; const k = Math.round(lp / bk) * bk, x = M.get(side + k) || { side, px: k, usd: 0 }; x.usd += w; M.set(side + k, x); } } }
    const all = [...M.values()].filter((x) => Math.abs(x.px / price - 1) < 0.25).sort((a, b) => b.usd - a.usd);
    return { longs: all.filter((x) => x.side === 'long').slice(0, 6), shorts: all.filter((x) => x.side === 'short').slice(0, 6) };
  };
  /* rug / honeypot simulation on a constant-product pool: sell impact for a % of supply, taxes, authority flags */
  P.rugSim = (pool) => {
    const p = pool || {}, x = +p.baseReserve, y = +p.quoteReserve, flags = []; if (!(x > 0) || !(y > 0)) return { ok: false, error: 'pool reserves unknown' };
    const sellTax = clamp(+p.sellTax || 0, 0, 1), buyTax = clamp(+p.buyTax || 0, 0, 1), out = (dx) => { const dxe = dx * (1 - 0.003); return (y * dxe) / (x + dxe) * (1 - sellTax); };
    const spot = y / x, imp = [0.01, 0.05, 0.1, 0.25].map((f) => { const dx = (p.supply || x) * f, got = out(dx); return { pct: f, quote: got, impact: 1 - got / (dx * spot) }; });
    if (sellTax >= 0.5 || p.canSell === false) flags.push('HONEYPOT: selling is blocked or taxed ≥ 50%'); else if (sellTax > 0.1) flags.push(`High sell tax ${(sellTax * 100).toFixed(0)}%`);
    if (buyTax > 0.1) flags.push(`High buy tax ${(buyTax * 100).toFixed(0)}%`); if (p.mintAuthority) flags.push('Mint authority active: supply can be inflated'); if (p.freezeAuthority) flags.push('Freeze authority active: your tokens can be frozen');
    if (p.lpLockedPct != null && p.lpLockedPct < 0.8) flags.push(`Only ${(p.lpLockedPct * 100).toFixed(0)}% of LP locked/burned: liquidity can be pulled`); if (p.top10 != null && p.top10 > 0.4) flags.push(`Top 10 wallets hold ${(p.top10 * 100).toFixed(0)}%`);
    const rugDrain = y * (p.lpLockedPct != null ? 1 - p.lpLockedPct : 1), risk = clamp((sellTax >= 0.5 || p.canSell === false ? 60 : sellTax * 100) + (p.mintAuthority ? 15 : 0) + (p.freezeAuthority ? 15 : 0) + (p.lpLockedPct != null ? (1 - p.lpLockedPct) * 25 : 10) + (p.top10 != null ? Math.max(0, p.top10 - 0.2) * 50 : 0), 0, 100);
    return { ok: true, spot, impacts: imp, flags, rugDrainQuote: rugDrain, risk: Math.round(risk), verdict: risk >= 60 ? 'DANGER' : risk >= 30 ? 'CAUTION' : 'OK', shield: risk < 30 };
  };
  /* block-0 sniper bundles: buys within the first blocks, grouped by shared funder or identical size/slot */
  P.sniperBundles = (buys, launchSlot) => {
    const B = (buys || []).filter((b) => b && b.slot != null && b.slot - (launchSlot || 0) <= 2), groups = new Map();
    for (const b of B) { const k = b.funder ? 'f:' + b.funder : 's:' + b.slot + ':' + Math.round((+b.amount || 0) * 100); const g = groups.get(k) || { key: k, wallets: [], amount: 0, slot: b.slot, funder: b.funder || null }; g.wallets.push(b.wallet); g.amount += +b.amount || 0; groups.set(k, g); }
    const bundles = [...groups.values()].filter((g) => g.wallets.length >= 2).sort((a, b) => b.amount - a.amount), tot = B.reduce((s, b) => s + (+b.amount || 0), 0);
    return { bundles, snipers: B.length, bundledPct: tot ? bundles.reduce((s, g) => s + g.amount, 0) / tot : 0 };
  };
  P.smartMoney = (wallets) => (wallets || []).filter((w) => w && (w.trades || 0) >= 5).map((w) => { const wr = (w.wins || 0) / w.trades, pnl = +w.pnl || 0; return Object.assign({}, w, { winRate: wr, score: Math.round(clamp(wr, 0, 1) * 60 + clamp(Math.log10(Math.max(1, pnl)) / 7, 0, 1) * 40) }); }).sort((a, b) => b.score - a.score);

  /* options: multi-leg payoff at expiry, live greeks, payoff cone */
  P.payoff = (legs, S) => (legs || []).reduce((s, l) => { const q = (+l.qty || 1) * (l.side === 'sell' ? -1 : 1) * (l.mult || 100), intr = l.type === 'P' ? Math.max(0, l.strike - S) : l.type === 'C' ? Math.max(0, S - l.strike) : S - (l.strike || 0); return s + q * (intr - (+l.prem || 0)); }, 0);
  P.legGreeks = (legs, S, T, r) => { const g = { delta: 0, gamma: 0, theta: 0, vega: 0, value: 0 }; for (const l of legs || []) { const q = (+l.qty || 1) * (l.side === 'sell' ? -1 : 1) * (l.mult || 100); if (l.type !== 'C' && l.type !== 'P') { g.delta += q; continue; } const b = P.bs(S, l.strike, l.T != null ? l.T : T, r || 0.04, l.iv || 0.5, l.type); g.delta += q * b.delta; g.gamma += q * b.gamma; g.theta += q * b.theta; g.vega += q * b.vega; g.value += q * b.price; } return g; };
  P.breakevens = (legs, lo, hi) => { const out = [], n = 400; let prev = null; for (let i = 0; i <= n; i++) { const s = lo + ((hi - lo) * i) / n, v = P.payoff(legs, s); if (prev && Math.sign(v) !== Math.sign(prev.v) && prev.v !== 0) out.push(prev.s + (s - prev.s) * (Math.abs(prev.v) / (Math.abs(prev.v) + Math.abs(v)))); prev = { s, v }; } return out; };
  P.cone = (S, iv, days) => [1, 2].map((k) => { const m = iv * Math.sqrt((days || 30) / 365) * k; return { sigma: k, lo: S * Math.exp(-m), hi: S * Math.exp(m) }; });

  /* futures: session volume profile (POC / VAH / VAL at 70%) — RTH 09:30–16:00 New York (tz offset in minutes) */
  P.isRTH = (t, nyOffMin) => { const m = (((t / 60 + (nyOffMin == null ? -300 : nyOffMin)) % 1440) + 1440) % 1440, d = new Date((t + (nyOffMin == null ? -300 : nyOffMin) * 60) * 1000).getUTCDay(); return d >= 1 && d <= 5 && m >= 570 && m < 960; };
  P.volProfile = (C, session, bins, nyOffMin) => {
    const R = (C || []).filter((c) => (session === 'rth' ? P.isRTH(c.t, nyOffMin) : session === 'eth' ? !P.isRTH(c.t, nyOffMin) : true)); if (!R.length) return null;
    const hi = Math.max(...R.map((c) => c.h)), lo = Math.min(...R.map((c) => c.l)), N = bins || 40, w = (hi - lo) / N || 1, vol = new Float64Array(N);
    for (const c of R) { const a = Math.max(0, Math.floor((c.l - lo) / w)), b = Math.min(N - 1, Math.floor((c.h - lo) / w)), share = (c.v || 1) / (b - a + 1); for (let i = a; i <= b; i++) vol[i] += share; }
    let poc = 0; for (let i = 1; i < N; i++) if (vol[i] > vol[poc]) poc = i; const tot = vol.reduce((s, x) => s + x, 0); let a = poc, b = poc, acc = vol[poc];
    while (acc < tot * 0.7 && (a > 0 || b < N - 1)) { const up = b < N - 1 ? vol[b + 1] : -1, dn = a > 0 ? vol[a - 1] : -1; if (up >= dn) acc += vol[++b]; else acc += vol[--a]; }
    return { bins: [...vol], lo, hi, w, poc: lo + (poc + 0.5) * w, vah: lo + (b + 1) * w, val: lo + a * w, bars: R.length };
  };
  P.TICKS = { ES: { tick: 0.25, val: 12.5, name: 'E-mini S&P 500' }, MES: { tick: 0.25, val: 1.25, name: 'Micro E-mini S&P' }, NQ: { tick: 0.25, val: 5, name: 'E-mini Nasdaq-100' }, MNQ: { tick: 0.25, val: 0.5, name: 'Micro E-mini Nasdaq' }, YM: { tick: 1, val: 5, name: 'E-mini Dow' }, RTY: { tick: 0.1, val: 5, name: 'E-mini Russell 2000' }, CL: { tick: 0.01, val: 10, name: 'Crude Oil' }, MCL: { tick: 0.01, val: 1, name: 'Micro Crude' }, GC: { tick: 0.1, val: 10, name: 'Gold' }, MGC: { tick: 0.1, val: 1, name: 'Micro Gold' }, ZN: { tick: 1 / 64, val: 15.625, name: '10-Year Note' }, '6E': { tick: 0.00005, val: 6.25, name: 'Euro FX' } };
  P.tickRisk = (code, entry, stop, o) => { const s = P.TICKS[code]; if (!s || !(entry > 0) || !(stop > 0) || entry === stop) return null; const ticks = Math.round(Math.abs(entry - stop) / s.tick), perC = ticks * s.val, opts = o || {}; const contracts = opts.riskUsd > 0 ? Math.floor(opts.riskUsd / perC) : Math.max(1, opts.contracts | 0 || 1); return { ticks, perContract: perC, contracts, risk: perC * contracts, spec: s }; };

  /* Pulse: event reaction backtest over candles already in memory (0 extra network calls) */
  P.FOMC = ['2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'].map((d) => ({ kind: 'FOMC', date: d, utcH: 19 }));
  P.lastEvents = (events, nowMs, n) => (events || []).map((e) => Object.assign({}, e, { t: Date.parse(e.date + 'T' + String(e.utcH == null ? 13 : e.utcH).padStart(2, '0') + ':' + (e.utcH === 13 ? '30' : '00') + ':00Z') / 1000 })).filter((e) => fin(e.t) && e.t * 1000 <= (nowMs || Date.now())).sort((a, b) => b.t - a.t).slice(0, n || 12);
  P.reaction = (C, events, horizons) => {
    const H = horizons || [3600, 14400, 86400]; return (events || []).map((e) => { const i = bsearch(C, e.t); if (i < 0 || !C[i] || Math.abs(C[i].t - e.t) > 86400) return Object.assign({ moves: H.map(() => null) }, e); const p0 = C[i].c; return Object.assign({}, e, { px: p0, moves: H.map((h) => { const j = bsearch(C, e.t + h); return C[j] && C[j].t >= e.t + h * 0.8 ? C[j].c / p0 - 1 : null; }) }); });
  };
  P.reactionStats = (rows) => { const cols = rows.length ? rows[0].moves.length : 0, out = []; for (let k = 0; k < cols; k++) { const v = rows.map((r) => r.moves[k]).filter(fin); out.push({ n: v.length, avg: mean(v), up: v.length ? v.filter((x) => x > 0).length / v.length : null, absAvg: mean(v.map(Math.abs)) }); } return out; };
  /* beta of returns a on b; portfolio P&L for a benchmark shock */
  P.beta = (a, b) => { const n = Math.min(a.length, b.length); if (n < 5) return 1; const A = a.slice(-n), B = b.slice(-n), ma = mean(A), mb = mean(B); let cov = 0, vb = 0; for (let i = 0; i < n; i++) { cov += (A[i] - ma) * (B[i] - mb); vb += (B[i] - mb) ** 2; } return vb > 0 ? cov / vb : 1; };
  P.rets = (C) => { const r = []; for (let i = 1; i < (C || []).length; i++) if (C[i - 1].c > 0) r.push(C[i].c / C[i - 1].c - 1); return r; };
  P.betaShock = (positions, shockPct) => { let pnl = 0; const rows = (positions || []).map((p) => { const d = (+p.value || 0) * (fin(p.beta) ? p.beta : 1) * (shockPct / 100) * (p.dir < 0 ? -1 : 1); pnl += d; return Object.assign({}, p, { pnl: d }); }); return { pnl, rows }; };
  /* order blocks: last opposite candle before a displacement move ≥ k × ATR within 3 bars */
  P.orderBlocks = (C, k, max) => {
    const A = P.atr(C, 14), out = [], K = k || 2;
    for (let i = 15; i < C.length - 3; i++) { if (!fin(A[i])) continue; const mv = C[i + 3].c - C[i].c; const bull = mv > K * A[i] && C[i].c < C[i].o, bear = -mv > K * A[i] && C[i].c > C[i].o; if (!bull && !bear) continue;
      let vol = 0; for (let j = i; j <= i + 3; j++) vol += C[j].v || 0; const ob = { i, t: C[i].t, top: C[i].h, bot: C[i].l, side: bull ? 'bull' : 'bear', vol, mitigated: false };
      for (let j = i + 4; j < C.length; j++) if (bull ? C[j].l <= ob.bot : C[j].h >= ob.top) { ob.mitigated = true; ob.mt = C[j].t; break; } out.push(ob); }
    return out.slice(-(max || 12));
  };
  P.rr = (entry, stop, price) => { const r = Math.abs(entry - stop); if (!(r > 0)) return null; const dir = entry >= stop ? 1 : -1; return { r, dir, mult: (dir * (price - entry)) / r, t1: entry + dir * r, t2: entry + dir * 2 * r, t3: entry + dir * 3 * r }; };
  /* net break-even: average cost plus the round-trip fee + slippage still to pay on exit */
  P.netBE = (avg, qty, feeRate, slip, paidFees, dir) => { if (!(avg > 0) || !(qty > 0)) return null; const d = dir || 1, f = (feeRate || 0) + (slip || 0), paid = (paidFees || 0) / qty; return d > 0 ? (avg + paid) / (1 - f) : (avg - paid) / (1 + f); };
  /* smart trailing stop: ATR chandelier, swing structure, or break-even after +1R; only ever tightens */
  P.trail = (C, pos, mode, k) => {
    if (!pos || !(pos.entry > 0) || !C || C.length < 16) return null; const A = P.atr(C, 14), a = A[A.length - 1], d = pos.dir || 1, cur = pos.sl, last = C[C.length - 1], since = C.filter((c) => c.t >= (pos.t0 || 0));
    let s = null;
    if (mode === 'structure') { const sw = C.slice(-12); s = d > 0 ? Math.min(...sw.slice(0, -1).map((c) => c.l)) : Math.max(...sw.slice(0, -1).map((c) => c.h)); }
    else if (mode === 'be') { const R = cur ? Math.abs(pos.entry - cur) : a * 1.5; if (d * (last.c - pos.entry) >= R) s = pos.entry; }
    else { const ex = since.length ? (d > 0 ? Math.max(...since.map((c) => c.h)) : Math.min(...since.map((c) => c.l))) : last.c; s = ex - d * (k || 3) * a; }
    if (s == null || !fin(s)) return null; if (cur != null && (d > 0 ? s <= cur : s >= cur)) return null; if (d > 0 ? s >= last.c : s <= last.c) return null; return s;
  };
  /* voice commands → intent (never places a live order by itself) */
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, thirty: 30, hundred: 100 };
  P.parseVoice = (text) => {
    const s = String(text || '').toLowerCase().replace(/[^\w\s.$%-]/g, ' ').replace(/\s+/g, ' ').trim(); if (!s) return null; const n = (w) => (w in NUMW ? NUMW[w] : parseFloat(w));
    let m = /^(buy|sell|long|short)\s+(\$?[\d.]+|\w+)\s*(dollars?|usd|\$)?\s*(?:of\s+)?([a-z]{1,6})?(?:\s+(?:with\s+)?stop\s+(?:at\s+)?([\d.]+))?/.exec(s);
    if (m) { const amt = n(m[2].replace('$', '')); if (fin(amt) && amt > 0) return { kind: 'order', side: m[1] === 'buy' || m[1] === 'long' ? 'buy' : 'sell', usd: m[3] || m[2][0] === '$' ? amt : null, qty: m[3] || m[2][0] === '$' ? null : amt, sym: m[4] ? m[4].toUpperCase() : null, stop: m[5] ? +m[5] : null, confirm: true }; }
    m = /^(?:show|open|chart|load|go to)\s+(?:the\s+)?([a-z0-9 ]{1,20}?)(?:\s+chart)?$/.exec(s); if (m) { const k = m[1].replace(/\s+/g, ''), tabs = { fleet: 'fleet', botfleet: 'fleet', bots: 'fleet', pulse: 'pulse', options: 'opts', futures: 'futs', academy: 'academy', lab: 'lab', quantlab: 'lab', briefing: 'brief', screener: 'heat', tracker: 'whales', positions: 'port', portfolio: 'port', '3d': 'd3', aibridge: 'bridge', bridge: 'bridge' }; if (tabs[k]) return { kind: 'tab', tab: tabs[k] }; if (/^[a-z0-9]{1,8}$/.test(k)) return { kind: 'symbol', sym: k.toUpperCase() }; }
    m = /^(?:timeframe|time frame|tf)\s+([\w]+)\s*(second|seconds|minute|minutes|min|hour|hours|day|days|s|m|h|d)?$/.exec(s); if (m) { const v = n(m[1]), u = (m[2] || 'm')[0]; if (fin(v)) return { kind: 'tf', tf: v + (u === 's' ? 's' : u === 'h' ? 'h' : u === 'd' ? 'D' : 'm') }; }
    if (/^(flatten|close all|close everything|panic)/.test(s)) return { kind: 'flatten', confirm: true };
    if (/^(plot|draw) (morning )?levels/.test(s)) return { kind: 'levels' };
    if (/^(hide|show) balances?/.test(s)) return { kind: 'balances', hide: /^hide/.test(s) };
    return { kind: 'unknown', text: s };
  };
  /* Bull / Bear / Risk debate: deterministic arguments from features (an AI, when connected, can expand them) */
  P.debate = (f) => {
    const x = f || {}, bull = [], bear = [], risk = [], pc = (v) => (v * 100).toFixed(1) + '%';
    if (x.conf != null) (x.conf > 0 ? bull : x.conf < 0 ? bear : risk).push(`6-TF confluence ${x.conf > 0 ? '+' : ''}${x.conf}/6`);
    if (fin(x.rsi)) { if (x.rsi < 30) bull.push(`RSI ${x.rsi.toFixed(0)} is oversold`); else if (x.rsi > 70) bear.push(`RSI ${x.rsi.toFixed(0)} is overbought`); }
    if (fin(x.vwapDist)) (x.vwapDist > 0 ? bull : bear).push(`Price ${x.vwapDist > 0 ? 'above' : 'below'} VWAP by ${pc(Math.abs(x.vwapDist))}`);
    if (fin(x.cvd)) (x.cvd > 0 ? bull : bear).push(`Tape CVD ${x.cvd > 0 ? 'positive' : 'negative'} (${x.cvd > 0 ? 'buyers' : 'sellers'} lifting)`);
    if (fin(x.funding)) { if (x.funding > 0.0005) bear.push('Funding hot: longs crowded'); else if (x.funding < -0.0002) bull.push('Negative funding: shorts paying, squeeze fuel'); }
    if (x.gexRegime) risk.push(`Dealer ${x.gexRegime}`); if (fin(x.atrPct)) risk.push(`ATR ${pc(x.atrPct)} per bar: size the stop to ≥ 1 ATR`);
    if (x.event) risk.push(`Event risk: ${x.event}`); if (x.spoofs) risk.push(`${x.spoofs} spoofed DOM level${x.spoofs > 1 ? 's' : ''} in the last minutes`);
    if (!risk.length) risk.push('No elevated risk flags: keep the mandatory stop');
    const s = bull.length - bear.length; return { bull, bear, risk, verdict: s >= 2 ? 'Bull case stronger' : s <= -2 ? 'Bear case stronger' : 'No edge: wait' };
  };

  /* ════════════════ PHASE 4 · ACADEMY ════════════════ */
  P.ACADEMY = [
    { id: 'm1', title: 'Module 1 · Chart & Execution', missions: [['m1a', 'Open the Briefing and plot all morning levels', 'levels'], ['m1b', 'Measure a setup with the R:R Ruler (≥ 2R)', 'ruler'], ['m1c', 'Place a paper trade with a stop and see your NET BE line', 'netbe']] },
    { id: 'm2', title: 'Module 2 · Order Flow & Options', missions: [['m2a', 'Read the GEX flip, call wall and put wall', 'gex'], ['m2b', 'Spot a spoofed level on the DOM Spoof Ladder', 'dom'], ['m2c', 'Build a 2-leg options spread and read its Greeks', 'opts']] },
    { id: 'm3', title: 'Module 3 · Quant Lab Edge-Coach', missions: [['m3a', 'Run the Edge-Coach on a backtest (MFE/MAE + shadows)', 'coach'], ['m3b', 'Apply the best SL/TP cell from the R:R heatmap to the chart', 'rrapply'], ['m3c', 'Pass a simulated $100K prop challenge (pass ≥ 50%)', 'prop']] },
    { id: 'm4', title: 'Module 4 · Bot Fleet', missions: [['m4a', 'Run a bot in Paper Sandbox', 'paperbot'], ['m4b', 'Complete arming wizard steps 1–4 (do not arm)', 'wizard'], ['m4c', 'Run the Self-Improving loop for 20 generations', 'evolve']] },
    { id: 'm5', title: 'Module 5 · Risk & Mobile', missions: [['m5a', 'Stress your portfolio with the Beta Shock slider at −10%', 'beta'], ['m5b', 'Turn on Hide Balances', 'hide'], ['m5c', 'Finish your Custom Drill', 'drill']] }];
  /* a mission counts as done when either its id (m1a) or its action key (levels) was recorded */
  P.missionDone = (d, x) => !!(d && (d[x[0]] || d[x[2]]));
  P.academyProgress = (done) => { const d = done || {}, all = P.ACADEMY.flatMap((m) => m.missions), n = all.filter((x) => P.missionDone(d, x)).length; return { done: n, total: all.length, pct: all.length ? n / all.length : 0, modules: P.ACADEMY.map((m) => ({ id: m.id, done: m.missions.every((x) => P.missionDone(d, x)) })) }; };
  /* top mistake tag among losing journal entries (FOMO, revenge, early exit …) */
  P.MISTAKES = { FOMO: 'Chasing (FOMO)', news: 'Trading the headline', scalp: 'Over-trading scalps', breakout: 'Failed breakouts', reversal: 'Catching knives', pullback: 'Buying weak pullbacks', swing: 'Holding losers too long', plan: 'Off-plan trades' };
  P.topMistake = (entries) => { const c = {}; for (const e of entries || []) { const loss = (e.pnl != null && e.pnl < 0) || e.outcome === 'loss'; if (!loss) continue; for (const t of e.tags || []) c[t] = (c[t] || 0) + 1; } const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return top ? { tag: top[0], n: top[1], label: P.MISTAKES[top[0]] || top[0] } : null; };
  P.drill = (m) => { const tag = m && m.tag ? m.tag : 'plan', D = { FOMO: ['Wait for a 50% pullback of the impulse before entering', 'Skip any entry > 1.5 ATR from VWAP', 'Log the setup BEFORE clicking buy'], news: ['No entries 5 min either side of a scheduled event', 'Use the Pulse backtester: trade only the post-event retest'], scalp: ['Max 5 trades per session', 'Each trade must target ≥ 2R on the R:R Ruler'], breakout: ['Enter breakouts only with 6-TF confluence ≥ +3', 'Require a retest of the level before entry'], reversal: ['No counter-trend entries without a CHoCH + order block', 'Half size on reversals'], pullback: ['Pullbacks only to an unmitigated order block', 'Stop below the block, target the previous high'], swing: ['Move the stop to break-even at +1R (Smart Trail · BE)', 'Hard time stop: exit after 20 bars without progress'], plan: ['Write entry, stop and target before each trade', 'Only trade setups saved in your playbook'] };
    const rules = D[tag] || D.plan; return { tag, title: `Custom Drill · ${P.MISTAKES[tag] || tag}`, rules, reps: 10, pass: 'Complete 10 paper reps that follow every rule (graded from your journal tags)' }; };

  /* ════════════════ PHASE 5 · LANGUAGES, MOBILE, POLISH ════════════════ */
  P.LANG10 = [['en', 'English'], ['es', 'Español'], ['zh-CN', '简体中文'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['ar', 'العربية'], ['hi', 'हिन्दी']];
  P.isRtl = (c) => /^ar\b/.test(String(c || ''));
  P.maskBal = (txt, hidden) => (hidden ? String(txt == null ? '' : txt).replace(/[0-9]/g, '*') : String(txt == null ? '' : txt));
  /* wallet deep links: ExTerm adds no fee of its own (network / DEX fees still apply) */
  P.deepLink = (wallet, o) => {
    const x = o || {}, enc = encodeURIComponent, sol = 'So11111111111111111111111111111111111111112', usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const ca = String(x.ca || ''), okSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca), okEvm = /^0x[a-fA-F0-9]{40}$/.test(ca);
    if (wallet === 'jupiter') return okSol ? `https://jup.ag/swap/${x.from === 'USDC' ? usdc : sol}-${ca}` : null;
    if (wallet === 'phantom') return okSol ? `https://phantom.app/ul/browse/${enc('https://jup.ag/swap/SOL-' + ca)}?ref=${enc('https://jup.ag')}` : null;
    if (wallet === 'solflare') return okSol ? `https://solflare.com/ul/v1/browse/${enc('https://jup.ag/swap/SOL-' + ca)}?ref=${enc('https://jup.ag')}` : null;
    if (wallet === 'uniswap') return okEvm ? `https://app.uniswap.org/swap?chain=${enc(x.chain || 'base')}&inputCurrency=ETH&outputCurrency=${ca}` : null;
    return null;
  };
  P.PIN_OK = (pin) => /^\d{4,8}$/.test(String(pin || '')) && !/^(\d)\1+$/.test(pin) && !'0123456789'.includes(pin) && !'9876543210'.includes(pin);
  P.HAND = ['right', 'left'];
  P.DOCK = [['markets', 'Chart'], ['watch', 'Watch'], ['trade', 'Trade'], ['fleet', 'Fleet'], ['more', 'More']];
  /* the 17 surfaces that must stay reachable in one click */
  P.REACH = ['Stocks', 'Crypto', 'On-Chain', 'Options', 'Futures', 'Screener', 'Pulse', 'Bot Fleet', 'Academy', 'Live Tape', 'Whales $25K+', 'Tracker', 'Positions', 'Briefing'];
  P.sizeKeys = (cur, key, max) => { let s = String(cur || ''); if (key === 'C') return ''; if (key === '⌫') return s.slice(0, -1); if (/^(25|50|75|100)%$/.test(key)) { const v = (max || 0) * parseInt(key, 10) / 100; return v > 0 ? String(Math.floor(v * 100) / 100) : s; } if (key === '.' && s.includes('.')) return s; if (s.length >= 12) return s; return s === '0' && key !== '.' ? key : s + key; };

  /* QR code (byte mode, ECC M, versions 1–10, all 8 masks scored) → boolean matrix */
  P.qr = (text) => {
    const data = Array.from(new TextEncoder().encode(String(text || '')));
    const EC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28], BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21]; // ECC M codewords per block, block count (v1–25)
    const capOf = (v) => { const raw = rawMods(v) >> 3; return raw - EC[v] * BLK[v]; };
    function rawMods(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
    let ver = 1; for (; ver <= 25; ver++) { const bits = 4 + (ver < 10 ? 8 : 16) + data.length * 8; if (Math.ceil(bits / 8) <= capOf(ver)) break; } if (ver > 25) return null;
    const bb = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bb.push((v >>> i) & 1); };
    put(4, 4); put(data.length, ver < 10 ? 8 : 16); for (const b of data) put(b, 8);
    const cap = capOf(ver) * 8; put(0, Math.min(4, cap - bb.length)); put(0, (8 - (bb.length % 8)) % 8); for (let p = 0xec; bb.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
    const dc = []; for (let i = 0; i < bb.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j]; dc.push(v); }
    // Reed-Solomon over GF(256)
    const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; };
    const deg = EC[ver], gen = new Array(deg).fill(0); gen[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { gen[j] = mul(gen[j], root); if (j + 1 < deg) gen[j] ^= gen[j + 1]; } root = mul(root, 2); }
    const rs = (d) => { const r = new Array(deg).fill(0); for (const b of d) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < deg; i++) r[i] ^= mul(gen[i], f); } return r; };
    const nb = BLK[ver], rawCw = rawMods(ver) >> 3, shortLen = Math.floor(rawCw / nb), nShort = nb - (rawCw % nb), blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) { const len = shortLen - deg + (i < nShort ? 0 : 1), d = dc.slice(k, k + len); k += len; const e = rs(d); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
    const cw = []; for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (i !== shortLen - deg || j >= nShort) cw.push(blocks[j][i]);
    const N = ver * 4 + 17, M = Array.from({ length: N }, () => new Array(N).fill(false)), F = Array.from({ length: N }, () => new Array(N).fill(false));
    const set = (x, y, v) => { M[y][x] = v; F[y][x] = true; };
    for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < N && y >= 0 && y < N) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(N - 4, 3); finder(3, N - 4);
    if (ver >= 2) { const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, pos = [6]; for (let p = N - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); } }
    const fmt = (mask) => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412; for (let i = 0; i <= 5; i++) set(8, i, ((b >>> i) & 1) === 1); set(8, 7, ((b >>> 6) & 1) === 1); set(8, 8, ((b >>> 7) & 1) === 1); set(7, 8, ((b >>> 8) & 1) === 1); for (let i = 9; i < 15; i++) set(14 - i, 8, ((b >>> i) & 1) === 1); for (let i = 0; i < 8; i++) set(N - 1 - i, 8, ((b >>> i) & 1) === 1); for (let i = 8; i < 15; i++) set(8, N - 15 + i, ((b >>> i) & 1) === 1); set(8, N - 8, true); };
    fmt(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = N - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
    let i = 0; for (let right = N - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? N - 1 - vert : vert; if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const apply = (m) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => { let p = 0; for (let pass = 0; pass < 2; pass++) for (let a = 0; a < N; a++) { let run = 1; for (let b = 1; b < N; b++) { const c = pass ? M[b][a] : M[a][b], d = pass ? M[b - 1][a] : M[a][b - 1]; if (c === d) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; } let dark = 0; for (const r of M) for (const c of r) if (c) dark++; p += Math.floor(Math.abs(dark * 20 - N * N * 10) / (N * N)) * 10; return p; };
    let best = 0, bp = Infinity; for (let m = 0; m < 8; m++) { apply(m); fmt(m); const p = penalty(); if (p < bp) { bp = p; best = m; } apply(m); }
    apply(best); fmt(best); return { size: N, version: ver, mask: best, m: M };
  };

  P.HIGHLIGHTS = ['Quant Lab Edge-Coach (MFE/MAE, shadows, overfitting score, prop sim, R:R heatmap)', 'Bot Fleet with 5-step arming wizard', 'Morning Briefing + GEX walls + DOM spoof ladder', 'Pulse event backtester', '5-module Academy', '10-language picker + native mobile app'];
  return P;
})();
if (typeof module === 'object' && module.exports) module.exports = V17P;
