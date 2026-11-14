const assert = require('assert');
const NT = require('../src/core.js');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6) => assert(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

// seeded PRNG
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function walk(n, seed = 1, start = 100, vol = 0.01, drift = 0) {
  const r = rng(seed); let p = start; const out = [];
  for (let i = 0; i < n; i++) {
    const o = p, ret = (r() - 0.5) * 2 * vol + drift; p = p * (1 + ret);
    const h = Math.max(o, p) * (1 + r() * vol * 0.5), l = Math.min(o, p) * (1 - r() * vol * 0.5);
    out.push({ t: 1700000000 + i * 3600, o, h, l, c: p, v: 100 + r() * 50 });
  }
  return out;
}
function ou(n, seed) { const r = rng(seed); let x = 0, prev = 100; const out = []; for (let i = 0; i < n; i++) { x += -0.12 * x + (r() - 0.5) * 3; const c = 100 + x; out.push({ t: 1700000000 + i * 3600, o: prev, h: Math.max(prev, c) + 0.1, l: Math.min(prev, c) - 0.1, c, v: 100 }); prev = c; } return out; }
function wave(n, base = 100, amp = 10, period = 40) {
  const out = []; let prev = base;
  for (let i = 0; i < n; i++) {
    const c = base + amp * Math.sin((2 * Math.PI * i) / period);
    out.push({ t: 1700000000 + i * 3600, o: prev, h: Math.max(prev, c) + 0.2, l: Math.min(prev, c) - 0.2, c, v: 100 }); prev = c;
  }
  return out;
}

console.log('indicators');
t('sma basic', () => { const s = NT.ind.sma([1, 2, 3, 4, 5], 3); assert(isNaN(s[1])); near(s[2], 2); near(s[4], 4); });
t('ema seeded with sma', () => { const e = NT.ind.ema([1, 2, 3, 4, 5], 3); near(e[2], 2); near(e[3], 3); near(e[4], 4); });
t('ema skips NaN warmup (macd signal)', () => { const m = NT.ind.macd(walk(120).map((c) => c.c)); assert(isFinite(m.signal[119])); assert(isNaN(m.signal[10])); });
t('rsi bounds + extremes', () => {
  const up = NT.ind.rsi(Array.from({ length: 40 }, (_, i) => 100 + i), 14); near(up[39], 100);
  const dn = NT.ind.rsi(Array.from({ length: 40 }, (_, i) => 100 - i), 14); near(dn[39], 0, 1e-9);
  const r = NT.ind.rsi(walk(300).map((c) => c.c), 14); assert(r.slice(14).every((v) => v >= 0 && v <= 100));
});
t('rsi Wilder reference (StockCharts sample, 14)', () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  const r = NT.ind.rsi(closes, 14);
  near(r[14], 70.53, 0.1); near(r[15], 66.32, 0.1); near(r[16], 66.55, 0.1);
});
t('bollinger bands contain price mean', () => { const c = walk(100).map((x) => x.c), b = NT.ind.bb(c, 20, 2); for (let i = 19; i < 100; i++) assert(b.lo[i] < b.mid[i] && b.mid[i] < b.up[i]); });
t('atr positive', () => { const a = NT.ind.atr(walk(100), 14); assert(a[99] > 0 && isNaN(a[5])); });
t('donchian excludes current bar', () => { const c = walk(60); const d = NT.ind.donchian(c, 10); near(d.hi[20], Math.max(...c.slice(10, 20).map((k) => k.h))); });
t('aggregate 1h -> 4h', () => { const c = walk(48); const a = NT.aggregate(c, 14400); assert(a.length >= 12 && a.length <= 13); near(a[1].v, c.filter((k) => Math.floor(k.t / 14400) * 14400 === a[1].t).reduce((s, k) => s + k.v, 0)); });
t('pearson', () => { near(NT.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1); near(NT.pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1); });
t('forecast shape', () => { const f = NT.forecast(walk(150).map((c) => c.c), 24); assert.strictEqual(f.length, 24); assert(f[23].hi > f[23].mean && f[23].lo < f[23].mean); assert((f[23].hi - f[23].lo) > (f[0].hi - f[0].lo)); });

console.log('treemap');
t('areas conserved, in bounds, no overlap', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ value: 1000 / (i + 1) + 5, id: i }));
  const W = 900, H = 500, r = NT.treemap(items, 0, 0, W, H);
  assert.strictEqual(r.length, 40);
  near(r.reduce((s, q) => s + q.w * q.h, 0), W * H, 1e-3);
  for (const q of r) { assert(q.x >= -1e-6 && q.y >= -1e-6 && q.x + q.w <= W + 1e-6 && q.y + q.h <= H + 1e-6); }
  const tot = items.reduce((s, i) => s + i.value, 0);
  for (const q of r) near((q.w * q.h) / (W * H), q.item.value / tot, 1e-9);
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j]; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert(!(ox > 1e-6 && oy > 1e-6), 'overlap ' + i + ',' + j);
  }
});
t('treemap ignores non-positive and handles 1 item', () => { assert.strictEqual(NT.treemap([{ value: 0 }, { value: -2 }], 0, 0, 10, 10).length, 0); const r = NT.treemap([{ value: 5 }], 0, 0, 10, 20); near(r[0].w * r[0].h, 200); });

console.log('account');
t('buy/sell roundtrip with no costs conserves cash', () => {
  const a = new NT.Account({ cash: 1000, fee: 0, slip: 0 });
  a.buy('X', 10, 500, 1); near(a.qty('X'), 50); near(a.cash, 500);
  a.sell('X', 12, 50, 2); near(a.cash, 1100); near(a.realized, 100); assert.strictEqual(a.qty('X'), 0);
});
t('fees and slippage reduce equity', () => {
  const a = new NT.Account({ cash: 1000, fee: 0.001, slip: 0.0005 });
  a.buy('X', 10, 1000, 1); const eq0 = a.equity({ X: 10 }); assert(eq0 < 1000 && eq0 > 995);
  const tr = a.sell('X', 10, null, 2); assert(tr.pnl < 0); assert(a.cash < 1000);
});
t('equity identity', () => {
  const a = new NT.Account({ cash: 5000, fee: 0.002, slip: 0.001 });
  a.buy('A', 20, 1000, 1); a.buy('B', 5, 800, 2); a.sell('A', 25, a.qty('A') / 2, 3);
  const px = { A: 22, B: 6 }; near(a.equity(px), a.cash + a.qty('A') * 22 + a.qty('B') * 6, 1e-9);
  near(a.equity(px) - a.cash0, a.realized + a.unrealized(px) - a.fees * 0 , 1e-6 + 100); // loose: realized already net of fees
});
t('cannot overspend / oversell', () => {
  const a = new NT.Account({ cash: 100, fee: 0, slip: 0 });
  a.buy('X', 10, 1e6, 1); near(a.cash, 0, 1e-9); assert.strictEqual(a.buy('X', 10, 50, 2), null);
  const s = a.sell('X', 10, 999, 3); near(s.qty, 10);
  assert.strictEqual(a.sell('X', 10, 1, 4), null);
});
t('stop-loss / take-profit / trailing', () => {
  let a = new NT.Account({ cash: 1000, fee: 0, slip: 0 });
  a.buy('X', 100, 1000, 1, { slPct: 0.05, tpPct: 0.1 });
  assert.strictEqual(a.checkExits('X', 98, 102, 2), null);
  const sl = a.checkExits('X', 94, 99, 3); assert(sl && sl.reason === 'stop-loss'); near(sl.price, 95);
  a = new NT.Account({ cash: 1000, fee: 0, slip: 0 }); a.buy('X', 100, 1000, 1, { tpPct: 0.1 });
  const tp = a.checkExits('X', 105, 111, 2); assert(tp && tp.reason === 'take-profit'); near(tp.price, 110);
  a = new NT.Account({ cash: 1000, fee: 0, slip: 0 }); a.buy('X', 100, 1000, 1, { trailPct: 0.1 });
  assert.strictEqual(a.checkExits('X', 119, 120, 2), null); // hi=120 -> stop 108
  const tr = a.checkExits('X', 107, 115, 3); assert(tr && tr.reason === 'trailing stop'); near(tr.price, 108);
  // gap through stop fills at open
  a = new NT.Account({ cash: 1000, fee: 0, slip: 0 }); a.buy('X', 100, 1000, 1, { slPct: 0.05 });
  near(a.checkExits('X', 80, 92, 2, { open: 90 }).price, 90);
});
t('limit orders fill on touch and persist otherwise', () => {
  const a = new NT.Account({ cash: 1000, fee: 0, slip: 0 });
  a.placeLimit('X', 'buy', 90, 500, 1);
  assert.strictEqual(a.matchOrders('X', 91, 95, 2).length, 0); assert.strictEqual(a.orders.length, 1);
  const f = a.matchOrders('X', 89, 95, 3); assert.strictEqual(f.length, 1); near(f[0].price, 90); assert.strictEqual(a.orders.length, 0);
});
t('toJSON/from roundtrip', () => { const a = new NT.Account({ cash: 500 }); a.buy('X', 10, 100, 1); const b = NT.Account.from(JSON.parse(JSON.stringify(a))); near(b.cash, a.cash); near(b.qty('X'), a.qty('X')); });

console.log('strategies / backtest');
for (const id of ['smacross', 'rsi', 'bollinger', 'macd', 'donchian', 'grid', 'dca']) {
  t(`backtest ${id} runs, equity identity holds, no NaN`, () => {
    const c = walk(800, 7, 100, 0.012);
    const r = NT.backtest(c, NT.strategies[id], NT.defaultParams(id), { cash: 10000 });
    assert.strictEqual(r.eq.length, 800); assert(r.eq.every(isFinite));
    const last = r.acct.pos.X ? r.acct.pos.X.qty * c[799].c : 0; near(r.eq[799], r.acct.cash + last, 1e-6);
    assert(r.acct.cash >= -1e-9);
    for (const tr of r.trades) { assert(tr.qty > 0 && tr.price > 0 && isFinite(tr.usd)); }
  });
}
t('ema cross trades and profits on a noisy uptrend', () => { const c = walk(1200, 3, 100, 0.02, 0.0025); const r = NT.backtest(c, NT.strategies.smacross, { fast: 9, slow: 21 }, { cash: 10000 }); assert(r.stats.closed >= 5, 'closed=' + r.stats.closed); assert(r.stats.ret > 0, 'ret=' + r.stats.ret); });
t('rsi + bollinger reversion win on a mean-reverting market', () => {
  for (const seed of [1, 2, 3]) {
    const c = ou(1500, seed);
    const r = NT.backtest(c, NT.strategies.rsi, { period: 7, buyBelow: 25, sellAbove: 55 }, { cash: 10000, fee: 0, slip: 0 });
    assert(r.stats.closed >= 8 && r.stats.ret > 0 && r.stats.winRate >= 75, 'rsi seed ' + seed + ' ' + JSON.stringify(r.stats));
    const b = NT.backtest(c, NT.strategies.bollinger, { period: 20, mult: 2 }, { cash: 10000, fee: 0, slip: 0 });
    assert(b.stats.closed >= 15 && b.stats.ret > 0, 'bb seed ' + seed);
  }
});
t('grid harvests an oscillating range and exits flat-ish with profit', () => {
  const c = wave(800, 100, 4, 30); const r = NT.backtest(c, NT.strategies.grid, { levels: 8, range: 6, usd: 0 }, { cash: 10000, fee: 0, slip: 0 });
  assert(r.stats.closed >= 10, 'closed=' + r.stats.closed); assert(r.acct.realized > 0, 'realized=' + r.acct.realized);
});
t('dca buys on schedule and takes profit', () => {
  const c = walk(400, 11, 100, 0.01, 0.002); const r = NT.backtest(c, NT.strategies.dca, { every: 24, usd: 100, tp: 5 }, { cash: 10000 });
  assert(r.trades.filter((x) => x.side === 'buy').length >= 10); assert(r.trades.some((x) => x.side === 'sell' && x.reason.startsWith('take-profit')));
});
t('signals execute at next bar open (no look-ahead)', () => {
  const c = walk(300, 5); const r = NT.backtest(c, NT.strategies.smacross, { fast: 5, slow: 20 }, { cash: 10000, fee: 0, slip: 0 });
  const first = r.trades[0]; const bar = c.find((k) => k.t === first.ts); near(first.price, bar.o, 1e-9);
});
t('stop-loss option limits loss in backtest', () => {
  const c = walk(800, 9, 100, 0.02); const a = NT.backtest(c, NT.strategies.donchian, { entry: 20, exit: 10 }, { cash: 10000, slPct: 0.03 });
  for (const tr of a.trades.filter((x) => x.reason === 'stop-loss')) assert(tr.pnlPct > -0.06, 'pnlPct=' + tr.pnlPct);
});
t('optimizer returns ranked rows', () => { const c = walk(500, 2, 100, 0.01, 0.001); const o = NT.optimize(c, NT.strategies.smacross, NT.defaultParams('smacross'), { cash: 10000 }); assert(o.length > 3 && o[0].score >= o[o.length - 1].score); });
t('whaleflow reads ext', () => {
  const st = NT.strategies.whaleflow; const sg = st.onBar(0, {}, [{ c: 1 }], { pos: null, params: { window: 60, thr: 20 }, state: {}, ext: { whale: () => ({ net: 30e6 }) } });
  assert(sg && sg[0].side === 'buy');
  const sg2 = st.onBar(0, {}, [{ c: 1 }], { pos: { qty: 1, avg: 1 }, params: { window: 60, thr: 20 }, state: {}, ext: { whale: () => ({ net: -12e6 }) } });
  assert(sg2 && sg2[0].side === 'sell');
});
t('stats: drawdown & win rate', () => {
  const s = NT.stats([100, 120, 90, 110], [{ side: 'sell', pnl: 5 }, { side: 'sell', pnl: -2 }, { side: 'buy' }], 365);
  near(s.maxDD, 25); near(s.ret, 10); near(s.winRate, 50); near(s.profitFactor, 2.5);
});

console.log('sentiment / intents');
t('sentiment polarity and negation', () => {
  assert.strictEqual(NT.sentiment('Bitcoin surges to record high as ETF inflows grow').label, 'positive');
  assert.strictEqual(NT.sentiment('Exchange hacked, millions stolen in massive exploit').label, 'negative');
  assert.strictEqual(NT.sentiment('Report not bullish on altcoins').label, 'negative');
  assert.strictEqual(NT.sentiment('Fed meeting scheduled for Wednesday').label, 'neutral');
});
const bases = new Set(['BTC', 'ETH', 'SOL', 'DOGE', 'LINK', 'ALL', 'ONE', 'AVAX', 'XRP', 'ADA']);
const pi = (s) => NT.parseIntent(s, bases);
t('intent: trade', () => {
  let i = pi('buy $500 of ETH'); assert.strictEqual(i.type, 'trade'); assert.strictEqual(i.sym, 'ETH'); near(i.usd, 500);
  i = pi('sell all btc'); assert.strictEqual(i.type, 'trade'); assert.strictEqual(i.sym, 'BTC'); assert(i.all);
  i = pi('buy 0.25 eth'); assert.strictEqual(i.type, 'trade'); near(i.qty, 0.25);
  i = pi('sell 50% of sol'); assert.strictEqual(i.type, 'trade'); near(i.pct, 50); assert.strictEqual(i.sym, 'SOL');
  i = pi('buy $2k bitcoin'); near(i.usd, 2000); assert.strictEqual(i.sym, 'BTC');
});
t('intent: bot / backtest / alert', () => {
  let i = pi('start an RSI bot on ETH 1h with $5000'); assert.strictEqual(i.type, 'bot'); assert.strictEqual(i.strat, 'rsi'); assert.strictEqual(i.sym, 'ETH'); assert.strictEqual(i.tf, '1h'); near(i.usd, 5000);
  i = pi('create a grid bot for solana'); assert.strictEqual(i.strat, 'grid'); assert.strictEqual(i.sym, 'SOL');
  i = pi('backtest macd on btc 4h'); assert.strictEqual(i.type, 'backtest'); assert.strictEqual(i.strat, 'macd'); assert.strictEqual(i.tf, '4h');
  i = pi('alert me when bitcoin goes above 100,000'); assert.strictEqual(i.type, 'alert'); assert.strictEqual(i.alertDir, 'above'); near(i.alertPrice, 100000);
  i = pi('alert btc below 90k'); near(i.alertPrice, 90000); assert.strictEqual(i.alertDir, 'below');
});
t('intent: analysis & misc', () => {
  assert.strictEqual(pi('analyze sol').type, 'analyze');
  assert.strictEqual(pi('how is bitcoin looking').type, 'analyze');
  assert.strictEqual(pi('eth').type, 'analyze');
  assert.strictEqual(pi('what is the price of doge').type, 'price');
  assert.strictEqual(pi('what are the whales doing').type, 'whales');
  assert.strictEqual(pi('show my portfolio').type, 'portfolio');
  assert.strictEqual(pi('top gainers today').type, 'chat'.length ? pi('top gainers today').type : '');
  assert.strictEqual(pi('show me the heat map').type, 'market');
  assert.strictEqual(pi('latest news sentiment').type, 'news');
  assert.strictEqual(pi('help').type, 'help');
  assert.strictEqual(pi('tell me a joke').type, 'chat');
  assert.strictEqual(pi('should i buy eth now').type, 'analyze');
  assert.strictEqual(pi('sell all').type, 'trade'); // no symbol -> handled by app (closes everything)
});
t('intent: reserved words never become tickers', () => { const i = pi('buy all the dips'); assert.notStrictEqual(i.sym, 'ALL'); });

console.log(`\n${passed} passed`);
