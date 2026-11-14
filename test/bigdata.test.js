// performance + correctness of backtests on very large candle sets (what the "100k candles" option produces)
const NT = require('../src/strategies2.js');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function walk(n) { const r = rng(9); let p = 100; const o = []; for (let i = 0; i < n; i++) { const op = p; p *= 1 + (r() - 0.5) * 0.01 + 0.00002; o.push({ t: 1600000000 + i * 60, o: op, h: Math.max(op, p) * (1 + r() * 0.003), l: Math.min(op, p) * (1 - r() * 0.003), c: p, v: 50 + r() * 100 }); } return o; }
for (const n of [100000, 200000]) {
  const c = walk(n); let t0 = Date.now(), worst = ['', 0], bad = [];
  for (const [id, st] of Object.entries(NT.strategies)) {
    if (st.liveOnly) continue; const t = Date.now();
    const r = NT.backtest(c, st, NT.defaultParams(id), { cash: 10000, tfSec: 60 });
    if (!r.eq.every(Number.isFinite) || r.eq.length !== n) bad.push(id);
    const ms = Date.now() - t; if (ms > worst[1]) worst = [id, ms];
  }
  console.log(`${n.toLocaleString()} candles · all ${Object.values(NT.strategies).filter((s) => !s.liveOnly).length} strategies (leaderboard) in ${((Date.now() - t0) / 1000).toFixed(1)}s · slowest ${worst[0]} ${worst[1]}ms · bad: ${bad.length ? bad.join(',') : 'none'}`);
  if (bad.length) process.exitCode = 1;
}
const c = walk(100000), t1 = Date.now(), o = NT.optimize(c, NT.strategies.orderblock, NT.defaultParams('orderblock'), { cash: 10000, tfSec: 60 });
console.log(`optimizer (orderblock, ${Object.values(NT.strategies.orderblock.opt).reduce((a, v) => a * v.length, 1)} combos) on 100k candles: ${((Date.now() - t1) / 1000).toFixed(1)}s · best ${o[0] && o[0].ret.toFixed(1)}%`);
