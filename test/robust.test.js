// Stress test: every ★ Pro strategy on 7 market regimes × 8 random seeds, with fees (0.1%) and slippage (0.05%).
// Synthetic markets, so this measures robustness (how a rule behaves in bull, bear, sideways, crash and fat-tailed
// conditions), not future profits. Run the in-app Validation lab on real data for that.
const NT = require('../src/strategies2.js');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function series(rets, seed, volOf) {
  const r = rng(seed * 7 + 1), o = []; let p = 100;
  rets.forEach((x, i) => { const op = p; p = Math.max(0.01, p * (1 + x)); const w = Math.abs(gauss(r)) * (volOf ? volOf(i) : 0.01) * p * 0.6; o.push({ t: 1.6e9 + i * 86400, o: op, h: Math.max(op, p) + w, l: Math.max(0.005, Math.min(op, p) - w), c: p, v: 1000 * (1 + r() * 2) * (1 + Math.abs(x) * 40) }); });
  return o;
}
const N = 1500;
const REG = {
  bull: (r) => Array.from({ length: N }, () => 0.0008 + 0.015 * gauss(r)),
  bear: (r) => Array.from({ length: N }, () => -0.0008 + 0.02 * gauss(r)),
  sideways: (r) => { let x = 0; const o = []; for (let i = 0; i < N; i++) { const nx = x - 0.06 * x + 0.015 * gauss(r); o.push(Math.exp(nx - x) - 1); x = nx; } return o; },
  crash: (r) => Array.from({ length: N }, (_, i) => (i < 600 ? 0.0009 : i < 700 ? -0.007 : 0.0012) + (i >= 600 && i < 700 ? 0.035 : 0.016) * gauss(r)),
  chop: (r) => Array.from({ length: N }, () => 0.03 * gauss(r)),
  cycle: (r) => Array.from({ length: N }, (_, i) => [0.0012, 0, -0.0012, 0.001][Math.floor(i / 375)] + 0.017 * gauss(r)),
  fattail: (r) => Array.from({ length: N }, () => 0.0004 + 0.012 * gauss(r) + (r() < 0.02 ? (r() < 0.5 ? -1 : 1) * 0.08 * r() : 0)),
};
const SEEDS = 8, STR = Object.keys(NT.strategies).filter((k) => NT.strategies[k].pro);
const rows = [], byReg = {};
for (const id of STR) {
  const S = NT.strategies[id], agg = { ret: [], bh: [], dd: [], bhdd: [], wins: 0, trades: 0, sharpe: [], bhSharpe: [], reg: {} };
  for (const [reg, gen] of Object.entries(REG)) {
    for (let s = 1; s <= SEEDS; s++) {
      const c = series(gen(rng(s * 101 + reg.length * 13)), s), r = NT.backtest(c, S, NT.defaultParams(id), { cash: 10000, fee: 0.001, slip: 0.0005, tfSec: 86400 });
      const st = r.stats, bh = (c[c.length - 1].c / c[0].c - 1) * 100;
      let peak = c[0].c, bdd = 0; for (const k of c) { peak = Math.max(peak, k.c); bdd = Math.max(bdd, (1 - k.c / peak) * 100); }
      const ret = st.ret != null ? st.ret : st.totalReturn;
      agg.ret.push(ret); agg.bh.push(bh); agg.dd.push(st.maxDD); agg.bhdd.push(bdd);
      agg.trades += st.closed || 0; agg.wins += ((st.winRate || 0) / (st.winRate > 1 ? 100 : 1)) * (st.closed || 0);
      (agg.reg[reg] = agg.reg[reg] || []).push(ret - bh); (agg.abs = agg.abs || {}); (agg.abs[reg] = agg.abs[reg] || []).push(ret);
      (byReg[reg] = byReg[reg] || []).push({ id, ret, bh });
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  rows.push({ id, name: S.name, ret: avg(agg.ret), bh: avg(agg.bh), dd: avg(agg.dd), bhdd: avg(agg.bhdd), wr: agg.trades ? (agg.wins / agg.trades) * 100 : 0, trades: agg.trades / (SEEDS * 7), beatBear: avg(agg.reg.bear), beatCrash: avg(agg.reg.crash), bull: avg(agg.abs.bull), cyc: avg(agg.abs.cycle), retDD: avg(agg.ret) / Math.max(1, avg(agg.dd)) });
}
rows.sort((a, b) => b.retDD - a.retDD);
const f = (v, d = 1) => (v >= 0 ? ' ' : '') + v.toFixed(d);
console.log('strategy'.padEnd(40), 'avgRet%', ' B&H%', ' maxDD%', ' B&H DD%', ' win%', ' trades', ' vsB&H(bear)', ' vsB&H(crash)', ' bull%', ' cycle%');
for (const r of rows) console.log(r.name.slice(0, 40).padEnd(40), f(r.ret).padStart(7), f(r.bh).padStart(6), f(r.dd).padStart(7), f(r.bhdd).padStart(8), f(r.wr, 0).padStart(5), f(r.trades, 0).padStart(7), f(r.beatBear).padStart(11), f(r.beatCrash).padStart(12), f(r.bull).padStart(6), f(r.cyc).padStart(7));
// pass criteria for the new robust set: smaller average drawdown than buy & hold, beats buy & hold in bear markets,
// and still makes money in bull markets (random-walk data has no edge to find, so this checks risk control, not alpha)
const NEW = ['pro_ensemble', 'pro_regime', 'pro_kama', 'pro_tsmom', 'pro_double7', 'pro_cumrsi', 'pro_turtle2', 'pro_macdz', 'pro_keltpb', 'pro_vcp'];
let fail = 0;
for (const id of NEW) { const r = rows.find((x) => x.id === id); const ok = r && r.dd < r.bhdd && r.beatBear > 0 && r.bull > 0; if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + id, r ? `maxDD ${r.dd.toFixed(1)}% vs B&H ${r.bhdd.toFixed(1)}%, bear vs B&H +${r.beatBear.toFixed(1)}, bull ${r.bull.toFixed(1)}%` : 'missing'); }
console.log(`${NEW.length - fail}/${NEW.length} robust strategies pass`);
if (fail) process.exitCode = 1;
