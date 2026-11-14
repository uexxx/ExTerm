const assert = require('assert'); const NT = require('../src/validate.js');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function walk(n, seed) { const r = rng(seed); let p = 100; const o = []; for (let i = 0; i < n; i++) { const op = p; p *= 1 + (r() - 0.5) * 0.02; o.push({ t: 1700000000 + i * 3600, o: op, h: Math.max(op, p) * (1 + r() * 0.004), l: Math.min(op, p) * (1 - r() * 0.004), c: p, v: 100 }); } return o; }
function ou(n, seed) { const r = rng(seed); let x = 0, prev = 100; const o = []; for (let i = 0; i < n; i++) { x += -0.1 * x + (r() - 0.5) * 3; const c = 100 + x; o.push({ t: 1700000000 + i * 3600, o: prev, h: Math.max(prev, c) + r() * 0.4, l: Math.min(prev, c) - r() * 0.4, c, v: 100 }); prev = c; } return o; }
const o = { cash: 10000, fee: 0.001, slip: 0.0005, tfSec: 3600 };
let t0 = Date.now(); const good = NT.validate(ou(4000, 3), NT.strategies.rsi, { period: 7, buyBelow: 25, sellAbove: 55 }, o);
console.log(`real edge (RSI on mean-reverting data): grade ${good.grade} · score ${good.score} · ${Date.now() - t0}ms`); good.checks.forEach((c) => console.log(`   ${c.status.padEnd(4)} ${c.name} — ${c.value}`));
t0 = Date.now(); const bad = NT.validate(walk(4000, 5), NT.strategies.smacross, { fast: 9, slow: 21 }, o);
console.log(`no edge (EMA cross on a pure random walk): grade ${bad.grade} · score ${bad.score} · ${Date.now() - t0}ms · hard fails: ${bad.checks.filter((c) => c.hard).map((c) => c.id)}`);
assert('AB'.includes(good.grade), 'real edge should grade A/B'); assert('DF'.includes(bad.grade), 'random walk should grade D/F');
assert(good.fan.length > 10 && good.folds.length === 5 && good.sens.length > 0 && good.checks.length === 17);
const big = walk(50000, 9); t0 = Date.now(); const v = NT.validate(big, NT.strategies.orderblock, NT.defaultParams('orderblock'), o); console.log(`50k candles order-block validation: ${((Date.now() - t0) / 1000).toFixed(1)}s, grade ${v.grade}`);
// enhancers
const c = ou(3000, 8), b0 = NT.backtest(c, NT.strategies.rsi, NT.defaultParams('rsi'), o), b1 = NT.backtest(c, NT.strategies.rsi, NT.defaultParams('rsi'), Object.assign({}, o, { atrStop: 1, timeStop: 8, riskPct: 1, cooldown: 5, delay: 1 }));
assert(b1.eq.every(Number.isFinite) && b1.trades.some((t) => /time stop/.test(t.reason)) && b1.trades.some((t) => /stop-loss/.test(t.reason)), 'stops fire');
const bt = NT.backtest(c, NT.strategies.rsi, NT.defaultParams('rsi'), Object.assign({}, o, { trendEma: 50 })); assert(bt.filtered > 0 && bt.stats.closed < b0.stats.closed, 'trend filter blocks counter-trend entries');
const rk = b1.trades.filter((t) => t.side === 'buy'); assert(rk.length && rk.every((t) => t.usd < 9900), 'risk sizing never goes all-in');
console.log(`enhancers: base ${b0.stats.closed} trades ${b0.stats.ret.toFixed(1)}% → enhanced ${b1.stats.closed} trades ${b1.stats.ret.toFixed(1)}% (filtered ${b1.filtered} entries)`);
console.log('validate tests passed');
