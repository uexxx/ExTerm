/* ExTerm strategy validation lab — a deliberately brutal checklist that every strategy must survive before you trust it.
   Runs in the backtest worker. Returns checks (pass / warn / fail), a grade, and the data for the report charts. */
(function (NT) {
  'use strict';
  const fin = Number.isFinite;
  const sharpeOf = (eq, bpy) => { const r = []; for (let i = 1; i < eq.length; i++) r.push(eq[i] / eq[i - 1] - 1); const m = r.reduce((s, x) => s + x, 0) / (r.length || 1), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length || 1)); return sd > 0 ? (m / sd) * Math.sqrt(bpy) : 0; };
  const maxDDof = (eq) => { let pk = -Infinity, m = 0; for (const v of eq) { if (v > pk) pk = v; const d = pk ? (pk - v) / pk : 0; if (d > m) m = d; } return m * 100; };
  const median = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
  const pct = (a, p) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.max(0, Math.round((p / 100) * (b.length - 1))))]; };
  function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // run a strategy on [start, end) with warm-up bars before start; measure only inside the window
  function segRun(candles, strat, params, o, start, end) {
    const W = Math.min(start, 400), slice = candles.slice(start - W, end), r = NT.backtest(slice, strat, params, o);
    const e0 = r.eq[W] != null ? r.eq[Math.max(0, W - 1)] || r.eq[0] : r.eq[0], eq = r.eq.slice(Math.max(0, W - 1));
    const tr = r.trades.filter((t) => t.ts >= candles[start].t);
    return { ret: (eq[eq.length - 1] / e0 - 1) * 100, eq, trades: tr, closed: tr.filter((t) => t.side === 'sell').length };
  }
  function bestParams(candles, strat, base, o, start, end, maxCombos) {
    const keys = Object.keys(strat.opt || {}); if (!keys.length) return base;
    let combos = [{}];
    for (const k of keys) { const nx = []; for (const c of combos) for (const v of strat.opt[k]) nx.push(Object.assign({}, c, { [k]: v })); combos = nx; }
    if (combos.length > maxCombos) { const step = combos.length / maxCombos; combos = Array.from({ length: maxCombos }, (_, i) => combos[Math.floor(i * step)]); }
    let best = base, bestScore = -Infinity;
    for (const cb of combos) {
      const p = Object.assign({}, base, cb); if (p.fast != null && p.slow != null && p.fast >= p.slow) continue;
      const r = segRun(candles, strat, p, o, start, end), sc = r.closed >= 3 ? r.ret / (1 + maxDDof(r.eq) / 10) : -1e9;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    return best;
  }

  NT.validate = (candles, strat, params, o, onProg) => {
    const prog = (k, label) => { if (onProg) onProg(k, 16, label); };
    const tf = o.tfSec || 3600, bpy = (365 * 86400) / tf, n = candles.length;
    const base = NT.backtest(candles, strat, params, o), M = NT.metrics(base, candles, tf), S = base.stats;
    const checks = [], add = (id, name, status, value, rule, why, hard) => checks.push({ id, name, status, value, rule, why, hard: !!hard && status === 'fail' });
    const pp = M.pnlPcts, N = pp.length;
    const bhRet = (candles[n - 1].c / candles[0].c - 1) * 100, bhSharpe = sharpeOf(base.bh, bpy), bhDD = maxDDof(base.bh);

    // 1 sample size
    prog(1, 'sample size');
    add('n', 'Enough trades to mean anything', N >= 30 ? 'pass' : N >= 15 ? 'warn' : 'fail', `${N} closed trades`, '≥ 30 pass · ≥ 15 warn', 'With few trades, any result can be luck. 30+ independent trades is the usual minimum.', true);
    // 2 net profitability
    const pf = S.profitFactor;
    add('profit', 'Profitable after fees & slippage', S.ret > 0 && pf != null && pf >= 1.3 ? 'pass' : S.ret > 0 ? 'warn' : 'fail', `${S.ret.toFixed(1)}% · PF ${pf == null ? '–' : pf === Infinity ? '∞' : pf.toFixed(2)}`, 'return > 0 and profit factor ≥ 1.3', 'Profit factor = gross wins / gross losses. Under 1.3, a small change in costs or market can erase the edge.', true);
    // 3 benchmark
    const better = S.sharpe > bhSharpe, partly = S.sharpe > 0 && (S.sharpe > 0.6 * bhSharpe || bhRet < 0);
    add('bench', 'Beats buy & hold (risk-adjusted)', better ? 'pass' : partly ? 'warn' : 'fail', `Sharpe ${S.sharpe.toFixed(2)} vs ${bhSharpe.toFixed(2)} · DD ${S.maxDD.toFixed(0)}% vs ${bhDD.toFixed(0)}%`, 'Sharpe above buy & hold', 'If just holding gives better risk-adjusted returns, the strategy is adding work without adding value.');
    // 4 drawdown
    add('dd', 'Drawdown you could live with', S.maxDD <= 20 ? 'pass' : S.maxDD <= 35 ? 'warn' : 'fail', `max ${S.maxDD.toFixed(1)}% · longest ${M.maxDDBars} bars underwater`, '≤ 20% pass · ≤ 35% warn', 'Deep drawdowns get abandoned in real life, and a 50% loss needs +100% to recover.');
    // 5 out-of-sample
    prog(5, 'out-of-sample hold-out');
    const cut = Math.floor(n * 0.7), isR = segRun(candles, strat, params, o, Math.min(400, Math.floor(n * 0.05)), cut), oosR = segRun(candles, strat, params, o, cut, n);
    const isSh = sharpeOf(isR.eq, bpy), oosSh = sharpeOf(oosR.eq, bpy);
    add('oos', 'Holds up on unseen data (70/30 split)', oosR.ret > 0 && (isSh <= 0 || oosSh >= 0.5 * isSh) ? 'pass' : oosR.ret > 0 ? 'warn' : 'fail', `in-sample ${isR.ret.toFixed(1)}% → out-of-sample ${oosR.ret.toFixed(1)}% (Sharpe ${isSh.toFixed(2)} → ${oosSh.toFixed(2)})`, 'OOS return > 0 and OOS Sharpe ≥ ½ in-sample', 'The last 30% of data is treated as the future. Strategies that only worked in the past fail here.', true);
    // 6 walk-forward
    prog(6, 'walk-forward optimisation');
    const K = 5, seg = Math.floor(n / (K + 1)), folds = [];
    if (seg > 80) for (let f = 1; f <= K; f++) {
      const tr0 = (f - 1) * seg, tr1 = f * seg, te1 = f === K ? n : (f + 1) * seg;
      const bp = bestParams(candles, strat, params, o, Math.max(tr0, Math.min(200, tr1 - 50)), tr1, 30), r = segRun(candles, strat, bp, o, tr1, te1);
      folds.push({ f, from: candles[tr1].t, to: candles[te1 - 1].t, params: bp, ret: r.ret, trades: r.closed });
    }
    const wfPos = folds.filter((x) => x.ret > 0).length, wfSum = folds.reduce((s, x) => s + x.ret, 0);
    add('wf', 'Walk-forward: re-optimise, then trade the next window', !folds.length ? 'warn' : wfPos / folds.length >= 0.6 && wfSum > 0 ? 'pass' : wfPos / folds.length >= 0.4 && wfSum > 0 ? 'warn' : 'fail', folds.length ? `${wfPos}/${folds.length} windows profitable · total ${wfSum.toFixed(1)}%` : 'not enough data', '≥ 60% of windows profitable', 'Simulates how you would really use it: tune on the past, trade the next period blind. This is the gold-standard overfitting test.');
    // 7 Monte Carlo
    prog(7, 'Monte Carlo');
    const R = rnd(42), MC = 1000, finals = [], dds = [], pathsAt = N ? Array.from({ length: Math.min(N, 200) + 1 }, () => []) : [];
    for (let k = 0; k < MC && N; k++) {
      let e = 1, pk = 1, md = 0, lastS = 0; const P = pathsAt.length - 1;
      for (let j = 0; j < N; j++) { e *= 1 + pp[Math.floor(R() * N)] * (o.posPct != null ? o.posPct : 1); if (e > pk) pk = e; const d = (pk - e) / pk; if (d > md) md = d; const s = Math.floor(((j + 1) * P) / N); if (s > lastS) { pathsAt[s].push(e); lastS = s; } }
      finals.push((e - 1) * 100); dds.push(md * 100);
    }
    const fan = pathsAt.map((a, i) => (i === 0 ? { p5: 1, p25: 1, p50: 1, p75: 1, p95: 1 } : a.length ? { p5: pct(a, 5), p25: pct(a, 25), p50: pct(a, 50), p75: pct(a, 75), p95: pct(a, 95) } : null)).filter(Boolean);
    const p5 = pct(finals, 5), pLoss = finals.length ? finals.filter((x) => x < 0).length / finals.length : 1;
    add('mc', 'Monte Carlo: 1,000 reshuffled trade sequences', N < 5 ? 'fail' : p5 > 0 ? 'pass' : median(finals) > 0 ? 'warn' : 'fail', N ? `5th pct ${p5.toFixed(1)}% · median ${median(finals).toFixed(1)}% · P(loss) ${(pLoss * 100).toFixed(0)}% · 95th pct DD ${pct(dds, 95).toFixed(0)}%` : 'no trades', '5th percentile outcome > 0', 'Resamples your trades in random order and amounts. If even unlucky orderings stay profitable, the edge does not hinge on sequence luck.');
    // 8 random-entry permutation test
    prog(8, 'random-entry test');
    const holds = M.holds.length ? M.holds : [1], cost = (o.fee != null ? o.fee : 0.001) * 2 + (o.slip != null ? o.slip : 0.0005) * 2, RR = rnd(7), PR = 300, beat = [];
    const stratRet = S.ret;
    for (let k = 0; k < PR && N; k++) {
      let e = 1;
      for (let j = 0; j < N; j++) { const h = Math.max(1, Math.round(holds[Math.floor(RR() * holds.length)])), a = Math.floor(RR() * Math.max(1, n - h - 1)), b = Math.min(n - 1, a + h); e *= (candles[b].c / candles[a + 1 > n - 1 ? a : a + 1].o) * (1 - cost) * (o.posPct != null ? o.posPct : 1) + (1 - (o.posPct != null ? o.posPct : 1)); }
      beat.push((e - 1) * 100);
    }
    const pval = beat.length ? (beat.filter((x) => x >= stratRet).length + 1) / (beat.length + 1) : 1;
    add('perm', 'Beats random entries (same # trades & holding times)', pval < 0.05 ? 'pass' : pval < 0.15 ? 'warn' : 'fail', `p = ${pval.toFixed(3)} · random median ${median(beat).toFixed(1)}%`, 'p < 0.05 pass · p < 0.15 warn', 'Trades the same number of times with the same hold lengths, but enters at random. If random entries do as well, the signals carry no information.', pval > 0.3);
    // 9 t-test
    const mean = N ? pp.reduce((s, x) => s + x, 0) / N : 0, sd = Math.sqrt(pp.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, N - 1)), tstat = sd > 0 ? (mean / sd) * Math.sqrt(N) : 0;
    add('t', 'Average trade is statistically above zero', tstat >= 2 ? 'pass' : tstat >= 1.3 ? 'warn' : 'fail', `t = ${tstat.toFixed(2)} · avg trade ${(mean * 100).toFixed(2)}%`, 't ≥ 2 pass · ≥ 1.3 warn', 'A t-statistic of 2 means roughly 95% confidence that the average trade is really positive.');
    // 10 cost stress
    prog(10, 'cost stress');
    const stress = NT.backtest(candles, strat, params, Object.assign({}, o, { fee: (o.fee != null ? o.fee : 0.001) * 2, slip: (o.slip != null ? o.slip : 0.0005) * 3 }));
    add('cost', 'Survives 2× fees and 3× slippage', stress.stats.ret > 0 ? 'pass' : S.ret > 0 && stress.stats.ret > -5 ? 'warn' : 'fail', `${stress.stats.ret.toFixed(1)}% under stress (vs ${S.ret.toFixed(1)}%)`, 'still profitable', 'Real fills are worse than backtests, especially for frequent traders and illiquid coins.');
    // 11 latency
    prog(11, 'latency');
    const late = NT.backtest(candles, strat, params, Object.assign({}, o, { delay: 1 }));
    add('lag', 'Survives one extra bar of delay', late.stats.ret > 0 && late.stats.ret >= 0.5 * S.ret ? 'pass' : late.stats.ret > 0 ? 'warn' : 'fail', `${late.stats.ret.toFixed(1)}% when every signal fills one bar later`, '≥ ½ of base return', 'If the edge vanishes when you are a bar late, it is too fragile to trade by hand or with real-world latency.');
    // 12 parameter robustness
    prog(12, 'parameter robustness');
    const sens = [];
    for (const q of strat.params || []) {
      const v = params[q.k]; if (!fin(v) || v === 0 || q.max === 0) continue;
      for (const mul of [0.8, 1.2]) {
        let nv = v * mul; if ((q.step || 1) >= 1) nv = Math.round(nv); nv = Math.min(q.max, Math.max(q.min, nv)); if (nv === v) continue;
        const r = NT.backtest(candles, strat, Object.assign({}, params, { [q.k]: nv }), o); sens.push({ k: q.k, label: q.label, from: v, to: nv, ret: r.stats.ret, dd: r.stats.maxDD, trades: r.stats.closed });
      }
    }
    const sp = sens.filter((x) => x.ret > 0).length, smed = median(sens.map((x) => x.ret));
    add('robust', 'Parameters are not a knife-edge (±20%)', !sens.length ? 'warn' : sp / sens.length >= 0.7 && smed >= 0.5 * S.ret ? 'pass' : sp / sens.length >= 0.5 ? 'warn' : 'fail', sens.length ? `${sp}/${sens.length} neighbours profitable · median ${smed.toFixed(1)}%` : 'no tunable parameters', '≥ 70% of neighbours profitable', 'Curve-fit strategies only work at one magic setting. Real edges degrade gracefully when you nudge the inputs.');
    // 13 regimes
    prog(13, 'market regimes');
    const L = Math.max(20, Math.min(200, Math.floor(n / 20))), reg = { bull: { pnl: 0, n: 0 }, bear: { pnl: 0, n: 0 }, side: { pnl: 0, n: 0 } }, idxOf = new Map(candles.map((c, i) => [c.t, i]));
    let entryReg = null;
    for (const t of base.trades) {
      const i = idxOf.get(t.ts); if (i == null) continue;
      if (t.side === 'buy' && entryReg == null) { const ch = i >= L ? candles[i].c / candles[i - L].c - 1 : 0; entryReg = ch > 0.05 ? 'bull' : ch < -0.05 ? 'bear' : 'side'; }
      else if (t.side === 'sell' && entryReg) { reg[entryReg].pnl += t.pnl; reg[entryReg].n++; entryReg = null; }
    }
    const traded = Object.values(reg).filter((x) => x.n >= 3), posReg = traded.filter((x) => x.pnl > 0).length, gross = Object.values(reg).reduce((s, x) => s + Math.max(0, x.pnl), 0), worst = Math.min(0, ...Object.values(reg).map((x) => x.pnl));
    add('regime', 'Works in more than one market regime', traded.length >= 2 && posReg >= 2 && -worst < 0.5 * gross ? 'pass' : posReg >= 1 && -worst < gross ? 'warn' : 'fail', `bull ${fmt$(reg.bull.pnl)} (${reg.bull.n}) · sideways ${fmt$(reg.side.pnl)} (${reg.side.n}) · bear ${fmt$(reg.bear.pnl)} (${reg.bear.n})`, 'profitable in ≥ 2 regimes, no regime giving back > ½ of gains', 'Many strategies only work in a bull run. When the regime flips, they bleed.');
    // 14 time consistency
    const SEG = 8, segRets = []; for (let k = 0; k < SEG; k++) { const a = Math.floor((k * n) / SEG), b = Math.floor(((k + 1) * n) / SEG) - 1; segRets.push((base.eq[b] / base.eq[a] - 1) * 100); }
    const segPos = segRets.filter((x) => x > 0).length;
    add('time', 'Consistent through time (8 equal periods)', segPos >= 5 ? 'pass' : segPos >= 4 ? 'warn' : 'fail', `${segPos}/8 periods positive`, '≥ 5 of 8 positive', 'One great stretch can hide years of losses. Consistent equity growth is far more trustworthy.');
    // 15 outlier dependence
    const pnl = base.trades.filter((t) => t.side === 'sell').map((t) => t.pnl).sort((a, b) => b - a), net = pnl.reduce((s, x) => s + x, 0), top3 = pnl.slice(0, 3).reduce((s, x) => s + Math.max(0, x), 0), share = net > 0 ? top3 / net : Infinity;
    add('outlier', 'Not dependent on a few lucky trades', net > 0 && share < 0.5 ? 'pass' : net > 0 && share < 0.8 ? 'warn' : 'fail', net > 0 ? `top 3 trades = ${(share * 100).toFixed(0)}% of net profit` : 'no net profit', 'top 3 trades < 50% of profit', 'If removing three trades kills the result, you are betting on catching rare outliers again.');
    // 16 losing streak + equity smoothness
    const le = base.eq.map((v) => Math.log(Math.max(1e-9, v))), xs = le.map((_, i) => i), mx = (n - 1) / 2, my = le.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (le[i] - my); sxx += (xs[i] - mx) ** 2; syy += (le[i] - my) ** 2; }
    const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0, slopeUp = sxy > 0;
    add('streak', 'Losing streaks you can stomach', M.maxConsecLoss <= 6 ? 'pass' : M.maxConsecLoss <= 10 ? 'warn' : 'fail', `max ${M.maxConsecLoss} losses in a row`, '≤ 6 pass · ≤ 10 warn', 'Long losing streaks are when traders quit, usually right before the strategy recovers.');
    add('smooth', 'Smooth, rising equity curve', slopeUp && r2 >= 0.8 ? 'pass' : slopeUp && r2 >= 0.5 ? 'warn' : 'fail', `R² ${r2.toFixed(2)} ${slopeUp ? '(rising)' : '(falling)'}`, 'R² ≥ 0.8 and rising', 'Measures how close equity is to a steady upward line. Jagged curves mean unstable, regime-dependent edges.');
    prog(16, 'grading');

    const pts = checks.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0), score = Math.round((pts / checks.length) * 100), hard = checks.filter((c) => c.hard);
    let grade = score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : score >= 42 ? 'D' : 'F';
    if (hard.length && 'ABC'.includes(grade)) grade = 'D';
    if (hard.length >= 3) grade = 'F';
    const verdict = grade === 'A' ? 'Robust edge: passes almost every test. Still paper-trade it before risking money.' : grade === 'B' ? 'Promising: a real-looking edge with a few weak spots. Fix the warnings, then forward-test.' : grade === 'C' ? 'Fragile: some edge, but it may not survive real-world conditions.' : grade === 'D' ? `Not tradeable: ${hard.length ? 'fails critical tests (' + hard.map((c) => c.name.toLowerCase()).join('; ') + ')' : 'too many weaknesses'}.` : 'No edge: the results look like luck or curve-fitting.';
    return {
      checks, score, grade, verdict, metrics: Object.assign({}, M, { holds: undefined, pnlPcts: undefined }), stats: S, bh: { ret: bhRet, sharpe: bhSharpe, dd: bhDD },
      folds, fan, finals: { p5, p50: median(finals), p95: pct(finals, 95), pLoss, dd95: pct(dds, 95) }, perm: { p: pval, median: median(beat), dist: beat.slice(0, 300) }, sens, regimes: reg, segRets,
      oos: { is: isR.ret, oos: oosR.ret, isSh, oosSh, cut: candles[cut].t }, stress: stress.stats.ret, late: late.stats.ret,
    };
  };
  function fmt$(v) { return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(0); }
  return NT;
})(typeof module === 'object' && module.exports ? require('./strategies2.js') : self.NT);
if (typeof module === 'object' && module.exports) module.exports = require('./strategies2.js');
