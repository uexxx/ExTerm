const assert = require('assert');
const NT = require('../src/strategies2.js');
let passed = 0; const fails = [];
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) <= e, `${a} !~ ${b}`);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function walk(n, seed = 1, vol = 0.012, drift = 0, t0 = 1700000000, tf = 900) { const r = rng(seed); let p = 100; const o = []; for (let i = 0; i < n; i++) { const op = p; p *= 1 + (r() - 0.5) * 2 * vol + drift; o.push({ t: t0 + i * tf, o: op, h: Math.max(op, p) * (1 + r() * vol * 0.6), l: Math.min(op, p) * (1 - r() * vol * 0.6), c: p, v: 50 + r() * 100 + (r() < 0.05 ? 400 : 0) }); } return o; }
function ou(n, seed) { const r = rng(seed); let x = 0, prev = 100; const o = []; for (let i = 0; i < n; i++) { x += -0.08 * x + (r() - 0.5) * 3; const c = 100 + x; o.push({ t: 1700000000 + i * 900, o: prev, h: Math.max(prev, c) + r() * 0.6, l: Math.min(prev, c) - r() * 0.6, c, v: 50 + r() * 100 }); prev = c; } return o; }
const I = NT.ind;

console.log('indicators');
const W = walk(600, 3);
t('oscillator bounds (stoch, stochRSI, willr, mfi, cci finite, adx)', () => {
  const s = I.stoch(W); assert(s.k.filter(Number.isFinite).every((v) => v >= -1e-9 && v <= 100 + 1e-9)); assert(s.d.filter(Number.isFinite).length > 500);
  const sr = I.stochRsi(W.map((x) => x.c)); assert(sr.k.filter(Number.isFinite).every((v) => v >= -1e-9 && v <= 100 + 1e-9)); assert(sr.k.filter(Number.isFinite).length > 500);
  assert(I.willr(W).filter(Number.isFinite).every((v) => v <= 1e-9 && v >= -100 - 1e-9));
  assert(I.mfi(W).filter(Number.isFinite).every((v) => v >= 0 && v <= 100));
  assert(I.cci(W).filter(Number.isFinite).length > 500);
  const a = I.adx(W); assert(a.adx.filter(Number.isFinite).every((v) => v >= 0 && v <= 100)); assert(a.adx.filter(Number.isFinite).length > 500);
});
t('wma / hma known values', () => { const w = I.wma([1, 2, 3, 4], 3); near(w[2], (1 + 4 + 9) / 6); near(w[3], (2 + 6 + 12) / 6); assert(I.hma(W.map((x) => x.c), 21).filter(Number.isFinite).length > 550); });
t('psar sits below price in a steady uptrend', () => { const up = Array.from({ length: 80 }, (_, i) => ({ t: i, o: 100 + i, h: 101.5 + i, l: 99.5 + i, c: 101 + i, v: 1 })); const s = I.psar(up); for (let i = 10; i < 80; i++) { assert(s.up[i]); assert(s.sar[i] < up[i].l); } });
t('supertrend up in uptrend, down in downtrend', () => { const up = walk(300, 1, 0.004, 0.004), dn = walk(300, 1, 0.004, -0.004); assert(I.supertrend(up).up[299] === true); assert(I.supertrend(dn).up[299] === false); });
t('swings: confirmed only after L bars, values correct', () => {
  const c = [5, 6, 7, 10, 7, 6, 5, 4, 3, 6, 7].map((v, i) => ({ t: i, o: v, h: v, l: v, c: v, v: 1 }));
  const s = I.swings(c, 2); assert(isNaN(s.shVal[4])); assert.strictEqual(s.shVal[5], 10); assert.strictEqual(s.shIdx[5], 3); assert.strictEqual(s.slVal[10], 3); assert(isNaN(s.slVal[9]));
});
t('ichimoku / keltner / aroon / rvwap / pivots shapes', () => {
  const ic = I.ichimoku(W); assert(Number.isFinite(ic.spanB[599]) && Number.isFinite(ic.ten[599]));
  const k = I.keltner(W); assert(k.up[599] > k.mid[599] && k.mid[599] > k.lo[599]);
  const ar = I.aroon(W); assert(ar.up[599] >= 0 && ar.up[599] <= 100);
  const v = I.rvwap(W, 48); assert(Number.isFinite(v.vw[599]) && v.sd[599] >= 0);
  const pv = I.dailyPivots(W); assert(Number.isFinite(pv.P[599]) && pv.S2[599] < pv.S1[599] && pv.S1[599] < pv.P[599] && pv.P[599] < pv.R1[599]);
});
t('heikin-ashi close = OHLC/4', () => { const h = I.heikin(W); near(h[10].c, (W[10].o + W[10].h + W[10].l + W[10].c) / 4); });

console.log('SMC triggers on hand-built patterns');
const bar = (t, o, h, l, c) => ({ t: 1700000000 + t * 900, o, h, l, c, v: 100 });
t('liquidity sweep buys the reclaim of a swept swing low', () => {
  const c = []; let k = 0; const push = (o, h, l, cl) => c.push(bar(k++, o, h, l, cl));
  for (const v of [105, 104, 103, 102, 100, 102, 103, 104, 105, 104, 103]) push(v, v + 0.5, v - 0.5, v); // swing low at 99.5 (bar 4)
  push(103, 103.2, 98.8, 101.5); // sweep below 99.5, close back above
  for (const v of [102, 103, 104, 105, 106]) push(v - 0.5, v + 0.3, v - 0.8, v);
  const r = NT.backtest(c, NT.strategies.liqsweep, { L: 3, rr: 2, buf: 0 }, { cash: 1000, fee: 0, slip: 0 });
  assert(r.trades.length >= 1 && r.trades[0].side === 'buy', JSON.stringify(r.trades.map((x) => x.reason)));
  assert(/swept swing low/.test(r.trades[0].reason));
});
t('order block: BOS then retest of last down candle triggers a buy', () => {
  const c = []; let k = 0; const push = (o, h, l, cl) => c.push(bar(k++, o, h, l, cl));
  for (const v of [100, 101, 102, 104, 102, 101, 100.5]) push(v, v + 0.4, v - 0.4, v); // swing high 104.4 at bar 3
  push(101, 101.2, 99.5, 99.8); // last down candle (OB: 99.5–101.2)
  push(100, 103, 99.9, 102.8); push(103, 106, 102.5, 105.8); // BOS above 104.4
  push(105.5, 106.2, 104, 104.5); push(104, 104.5, 102, 102.3); // pull back
  push(102, 102.5, 100.8, 101.9); // into block (low 100.8 ≤ 101.2) and close up (101.9 > 102? need c>o)
  push(101.5, 103, 101, 102.8); // retest bar closing green inside/above block
  for (const v of [104, 106, 108, 110]) push(v - 1, v + 0.5, v - 1.2, v);
  const r = NT.backtest(c, NT.strategies.orderblock, { L: 2, rr: 2, age: 60, buf: 0 }, { cash: 1000, fee: 0, slip: 0 });
  assert(r.trades.some((x) => /order block/.test(x.reason)), JSON.stringify(r.trades.map((x) => x.reason)));
});
t('fair value gap retest triggers', () => {
  const c = []; let k = 0; const push = (o, h, l, cl) => c.push(bar(k++, o, h, l, cl));
  for (const v of [100, 100.2, 100.1, 100.3]) push(v, v + 0.3, v - 0.3, v);
  push(100.3, 100.6, 100.0, 100.5); push(100.6, 104, 100.5, 103.8); push(103.9, 105, 102.0, 104.6); // gap: 100.6 → 102.0
  push(104.5, 104.8, 103, 103.2); push(103.1, 103.3, 101.5, 102.4); // trades into gap, closes inside
  for (const v of [104, 106, 108]) push(v - 1, v + 0.5, v - 1.2, v);
  const r = NT.backtest(c, NT.strategies.fvg, { gap: 0.2, rr: 2, age: 30 }, { cash: 1000, fee: 0, slip: 0 });
  assert(r.trades.some((x) => /FVG/.test(x.reason)), JSON.stringify(r.trades.map((x) => x.reason)));
});
t('structure stop exits at the stop price (or gap open)', () => {
  const st = {}; const ctx = { pos: { qty: 1, avg: 10 }, state: st };
  st.sl = 9; st.tp = 12;
  const sig = NT.strategies.liqsweep.onBar(0, { sw: I.swings([bar(0, 9.5, 9.6, 8.5, 9)], 5) }, [bar(0, 9.5, 9.6, 8.5, 9)], Object.assign(ctx, { params: { L: 5, rr: 2, buf: 0 } }));
  assert(sig && sig[0].side === 'sell' && sig[0].px === 9);
});

console.log('every strategy backtests cleanly');
const sets = { 'random walk': walk(1500, 7, 0.012), 'uptrend': walk(1500, 11, 0.01, 0.0012), 'mean-reverting': ou(1500, 5), 'downtrend': walk(1500, 13, 0.01, -0.001) };
const table = [];
for (const [id, st] of Object.entries(NT.strategies)) {
  if (st.liveOnly) continue;
  t(`${id.padEnd(14)} ${st.name}`, () => {
    let total = 0; const row = { id };
    for (const [nm, c] of Object.entries(sets)) {
      const r = NT.backtest(c, st, NT.defaultParams(id), { cash: 10000, fee: 0.001, slip: 0.0005, tfSec: 900 });
      assert.strictEqual(r.eq.length, c.length); assert(r.eq.every(Number.isFinite), 'NaN equity on ' + nm);
      const last = r.acct.pos.X ? r.acct.pos.X.qty * c[c.length - 1].c : 0; near(r.eq[r.eq.length - 1], r.acct.cash + last, 1e-6);
      assert(r.acct.cash >= -1e-6, 'negative cash'); for (const tr of r.trades) assert(tr.qty > 0 && tr.price > 0 && Number.isFinite(tr.usd));
      // no look-ahead: market fills happen at a bar open, px fills within the bar range
      for (const tr of r.trades) { const b = c.find((k) => k.t === tr.ts); assert(b && tr.price >= b.l * 0.999 - 1e-9 && tr.price <= b.h * 1.001 + 1e-9, 'fill outside bar range'); }
      total += r.stats.closed; row[nm] = `${r.stats.ret.toFixed(1)}% / ${r.stats.closed}`;
    }
    assert(total >= 1, 'never traded on any data set');
    table.push(row);
  });
}
t('optimizer works for every strategy with a grid', () => {
  const c = walk(800, 21, 0.012);
  for (const [id, st] of Object.entries(NT.strategies)) { if (st.liveOnly || !st.opt || !Object.keys(st.opt).length) continue; const o = NT.optimize(c, st, NT.defaultParams(id), { cash: 10000 }); assert(Array.isArray(o)); }
});
t('strategy catalogue: 40+ strategies, all categorised, params valid', () => {
  const all = Object.entries(NT.strategies); assert(all.length >= 40, 'only ' + all.length);
  for (const [id, s] of all) { assert(s.cat && NT.STRAT_CATS.includes(s.cat), id + ' cat'); assert(s.name && s.desc && Array.isArray(s.params), id); for (const p of s.params) assert(p.def >= p.min && p.def <= p.max || p.max === 0, id + '.' + p.k); }
});
console.table(table);
console.log(`\n${passed} passed${fails.length ? ', FAILED: ' + fails.join(', ') : ''} · ${Object.keys(NT.strategies).length} strategies`);
