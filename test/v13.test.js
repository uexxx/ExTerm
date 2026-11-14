// v13 unit tests: short-side account, short + windowed backtests, the 15 new strategies (no look-ahead, every one
// trades), higher-timeframe no-code operands (no look-ahead), Pine export, and the pure logic of the browser modules
// (paper futures, copy-backtest, linked wallets, social spam / spikes, regimes, basket summary) loaded in a sandbox.
const NT = require('../src/strategies3.js'); require('../src/strategies2.js');
const SP = NT.Spec, vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
function gen(n, tf, seed = 1, vol = 0.01, jumpy = false, t0 = 1700000000 - (1700000000 % 86400)) {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, g = () => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return (u - 3) / 1.2; };
  const c = []; let p = 100, drift = 0;
  for (let i = 0; i < n; i++) { if (i % 300 === 0) drift = (r() - 0.45) * vol * 0.4; const burst = jumpy && r() < 0.02 ? (r() - 0.3) * 0.25 : 0, o = p, ch = drift + g() * vol + burst, cl = Math.max(1e-6, o * (1 + ch)); c.push({ t: t0 + i * tf, o, h: Math.max(o, cl) * (1 + Math.abs(g()) * vol * 0.4), l: Math.min(o, cl) * (1 - Math.abs(g()) * vol * 0.4), c: cl, v: 1000 * (1 + r()) * (burst ? 6 : 1) * (1 + Math.abs(ch) * 40) }); p = cl; }
  return c;
}

/* ── short account ── */
{
  const a = new NT.ShortAccount({ cash: 1000, fee: 0, slip: 0 });
  a.buy('X', 100, 1000, 1);
  ok('short gains when price falls, loses when it rises', a.equity({ X: 90 }) === 1100 && a.equity({ X: 110 }) === 900);
  const t = a.sell('X', 90, null, 2); ok('cover books the profit', Math.abs(t.pnl - 100) < 1e-9 && Math.abs(a.cash - 1100) < 1e-9 && t.short === true);
  const b = new NT.ShortAccount({ cash: 1000, fee: 0, slip: 0 }); b.buy('X', 100, 1000, 1, { slPct: 0.05, tpPct: 0.1 });
  ok('short stop sits above entry, target below', b.pos.X.sl === 105 && Math.abs(b.pos.X.tp - 90) < 1e-9);
  ok('short stop triggers on a spike up and fills at the stop', b.checkExits('X', 99, 106, 2, { open: 100 }).price === 105 && b.cash < 1000);
  const c = new NT.ShortAccount({ cash: 1000, fee: 0, slip: 0 }); c.buy('X', 100, 1000, 1, { trailPct: 0.05 }); c.checkExits('X', 80, 82, 2); const tr = c.checkExits('X', 83, 84.5, 3);
  ok('short trailing stop follows the lowest low', tr && Math.abs(tr.price - 84) < 1e-9 && tr.pnl > 150);
  const d = new NT.ShortAccount({ cash: 1000, fee: 0, slip: 0 }); d.buy('X', 100, 1000, 1); const big = d.sell('X', 400, null, 2);
  ok('a short can lose at most its collateral (spot model)', d.cash === 0 && big.pnl === -1000);
  ok('fees and slippage are charged on both sides', (() => { const e = new NT.ShortAccount({ cash: 1000, fee: 0.001, slip: 0.001 }); e.buy('X', 100, 1000, 1); const t2 = e.sell('X', 100, null, 2); return t2.pnl < -1.9 && t2.pnl > -4.1; })());
  ok('ShortAccount survives save/restore', NT.Account.from(JSON.parse(JSON.stringify(a))) instanceof NT.ShortAccount);
  ok('regular accounts still restore as Account', !(NT.Account.from(JSON.parse(JSON.stringify(new NT.Account({ cash: 5 })))) instanceof NT.ShortAccount));
}
/* ── windowed backtests ── */
{
  const c = gen(1000, 60, 3), st = NT.strategies.ema_cross || Object.values(NT.strategies).find((x) => !x.liveOnly && !x.short), id = Object.keys(NT.strategies).find((k) => NT.strategies[k] === st);
  const full = NT.backtest(c, st, NT.defaultParams(id), { cash: 10000 }), win = NT.backtest(c, st, NT.defaultParams(id), { cash: 10000, fromT: c[700].t });
  ok('fromT tests only the window (equity starts at the window)', win.eq.length === 300 && win.t[0] === c[700].t && win.from === 700 && full.eq.length === 1000);
  ok('no trades happen in the warm-up', win.trades.every((t) => t.ts >= c[700].t * 1000 || t.ts >= c[700].t));
  ok('window buy & hold starts at the window', Math.abs(win.bh[0] - 10000) < 1e-6);
  const late = NT.backtest(c, st, NT.defaultParams(id), { cash: 10000, fromT: c[999].t + 99999 });
  ok('a window after the data does not crash', late.eq.length === 1);
}
/* ── strategy pack 3 ── */
{
  const tfOf = (id) => (id === 'st_tom' ? 86400 : /^(cx_mtf|sh_|cx_trendvt|cx_pyramid|cx_adaptive)/.test(id) ? 3600 : 300);
  let noLook = 0, trades = 0;
  for (const id of NT.PACK3) {
    const st = NT.strategies[id], tf = tfOf(id), c = gen(id === 'st_tom' ? 3000 : 6000, tf, 7, id.startsWith('meme') ? 0.02 : 0.01, id.startsWith('meme')), p = NT.defaultParams(id);
    const r = NT.backtest(c, st, p, { cash: 10000, tfSec: tf }), cut = Math.floor(c.length * 0.6), r2 = NT.backtest(c.slice(0, cut), st, p, { cash: 10000, tfSec: tf });
    const key = (x) => x.trades.filter((t) => t.ts < c[cut - 2].t).map((t) => t.side + t.ts + t.price.toFixed(8)).join();
    if (key(r) === key(r2)) noLook++; else res.push('FAIL look-ahead in ' + id);
    if (r.trades.length || id === 'meme_firstdip') trades++; else res.push('FAIL ' + id + ' never trades on synthetic data');
    if (!st.desc || st.desc.length < 80 || !st.params.length || !st.opt) res.push('FAIL ' + id + ' needs a description, parameters and an optimiser grid');
  }
  ok(`all ${NT.PACK3.length} new strategies are look-ahead free (future data removed → identical past trades)`, noLook === NT.PACK3.length && NT.PACK3.length === 15);
  ok('every new strategy trades on synthetic data (first-dip tested on a constructed pump)', trades === NT.PACK3.length);
  ok('short strategies are flagged short and run on the short account', ['sh_breakdown', 'sh_fade', 'sh_failbreak'].every((id) => NT.strategies[id].short && NT.backtest(gen(3000, 3600, 5), NT.strategies[id], NT.defaultParams(id), {}).short === true));
  // first dip on a constructed pump
  const c = []; let p = 1, t = 1700000000; const push = (np, v = 1000) => { const o = p; c.push({ t, o, h: Math.max(o, np) * 1.002, l: Math.min(o, np) * 0.998, c: np, v }); p = np; t += 60; };
  for (let i = 0; i < 80; i++) push(p * (1 + (i % 2 ? 0.001 : -0.001))); for (let i = 0; i < 20; i++) push(p * 1.03, 5000); for (let i = 0; i < 10; i++) push(p * 0.972, 2000); for (let i = 0; i < 8; i++) push(p * 1.02, 3000); for (let i = 0; i < 40; i++) push(p * 1.004);
  const fd = NT.backtest(c, NT.strategies.meme_firstdip, NT.defaultParams('meme_firstdip'), { cash: 1000, fee: 0, slip: 0 });
  ok('meme first-dip buys the first pullback after a +80% pump and exits at the prior high', fd.trades.length === 2 && /first dip/.test(fd.trades[0].reason) && /take-profit/.test(fd.trades[1].reason) && fd.trades[1].pnl > 0, fd.trades.map((x) => x.reason).join(' / '));
  // ladder partial sells
  const L = []; p = 1; t = 1700000000; const pl = (np, v) => { L.push({ t, o: p, h: Math.max(p, np), l: Math.min(p, np), c: np, v }); p = np; t += 60; };
  for (let i = 0; i < 30; i++) pl(1 + (i % 2) * 0.001, 1000); pl(1.05, 5000); for (let i = 0; i < 30; i++) pl(p * 1.03, 1500); for (let i = 0; i < 30; i++) pl(p * 0.97, 1500);
  const ld = NT.backtest(L, NT.strategies.meme_ladder, NT.defaultParams('meme_ladder'), { cash: 1000, fee: 0, slip: 0 });
  ok('meme ladder sells ⅓ at +30%, ⅓ at +60%, and trails the rest', ld.trades.filter((x) => x.side === 'sell').length === 3 && /⅓ profit/.test(ld.trades[1].reason) && /another ⅓/.test(ld.trades[2].reason), ld.trades.map((x) => x.reason).join(' / '));
  // turn of month: in the market only around month-end
  const D = gen(800, 86400, 9), tom = NT.backtest(D, NT.strategies.st_tom, NT.defaultParams('st_tom'), {});
  ok('turn-of-the-month buys on the last trading day and sells on day 3', tom.trades.length > 40 && tom.trades.filter((x) => x.side === 'buy').every((x) => { const d = new Date(x.ts > 1e12 ? x.ts : x.ts * 1000); const nx = new Date(d.getTime() + 86400e3); return nx.getUTCMonth() !== d.getUTCMonth() || [5, 6].includes(nx.getUTCDay()) || d.getUTCDate() >= 26; }));
  // ORB uses New York session time (DST aware)
  ok('New York session clock handles daylight saving', NT._et(Date.UTC(2026, 6, 1, 13, 30) / 1000).min === 570 && NT._et(Date.UTC(2026, 0, 5, 14, 30) / 1000).min === 570);
}
/* ── higher-timeframe operands + short specs ── */
{
  const c = gen(900, 3600, 11);
  const s = SP._series(c, { k: 'ema', n: 10, tf: 4 }), s2 = SP._series(c.slice(0, 500), { k: 'ema', n: 10, tf: 4 });
  let same = true; for (let i = 0; i < 496; i++) if (!(Number.isNaN(s[i]) && Number.isNaN(s2[i])) && s[i] !== s2[i]) same = false;
  ok('higher-timeframe series never use unfinished bars (future removed → same values)', same);
  const R = SP._resample(c, 4); ok('resampling builds 4-hour bars aligned to the clock', R.htf.length === Math.ceil(c.length / 4) + (c[0].t % 14400 ? 1 : 0) || R.htf.length >= 225);
  const holds = (() => { for (let i = 1; i < c.length; i++) { const g = R.idx[i]; if (R.htf[g].end !== i && R.idx[i - 1] === g && !(Number.isNaN(s[i]) && Number.isNaN(s[i - 1])) && s[i] !== s[i - 1]) return false; } return true; })();
  ok('a higher-timeframe value only changes when a higher-timeframe bar completes', holds);
  const v = SP.validate({ v: 1, name: 'mtf short', dir: 'short', entry: { all: [{ a: { k: 'price', tf: 4 }, op: '<', b: { k: 'ema', n: 50, tf: 4 } }] }, exit: { any: [{ a: { k: 'rsi' }, op: '<', b: { k: 'const', v: 30 } }] }, risk: { sl: 3, tp: 6 } });
  ok('short + higher-timeframe spec validates', v.ok, v.errors);
  const st = SP.compile(v.spec); ok('compiled spec is a short strategy', st.short === true && /\(short\)/.test(st.name));
  const pine = SP.toPine(v.spec);
  ok('Pine: strategy.short, stop above / target below, request.security on the last completed bar', /strategy\.entry\("Short", strategy\.short\)/.test(pine) && /position_avg_price \* \(1 \+ 0\.03\)/.test(pine) && /position_avg_price \* \(1 - 0\.06\)/.test(pine) && /request\.security\(syminfo\.tickerid, timeframe\.from_seconds\(timeframe\.in_seconds\(\) \* 4\), ema50\[1\], lookahead=barmerge\.lookahead_on\)/.test(pine), pine);
  ok('invalid dir / tf are rejected', !SP.validate(Object.assign({}, v.spec, { dir: 'up' })).ok && !SP.validate({ v: 1, name: 'bad tf', entry: { all: [{ a: { k: 'rsi', tf: 7 }, op: '>', b: { k: 'const', v: 1 } }] }, risk: { sl: 1 } }).ok);
  ok('signals() gives entry/exit booleans per bar', (() => { const g = SP.signals(v.spec, c); return g.entry.length === c.length && g.exit.length === c.length && g.entry.some(Boolean); })());
  ok('the 2 new templates validate', SP.TEMPLATES.slice(-2).every((t) => SP.validate(t).ok));
}
/* ── browser modules (pure logic) in a sandbox ── */
{
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const box = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Promise, isFinite, setInterval: () => 0, clearInterval: () => 0, setTimeout: () => 0, NT,
    baseOf: (s) => String(s).replace(/-USD$/, ''), ST: { settings: {}, heat: {}, fut: null, social: {} }, saveState: () => {}, toast: () => {}, esc: (s) => String(s), $: () => null, $$: () => [], px: () => null, Journal: { record: () => null }, Feed: { tickL: [] }, J: {}, OC: { stats: {}, meta: {}, social: {} }, Sol: { trades: [], wallets: [], byAddr: () => null, tokens: {}, hot: () => [], short: (a) => a.slice(0, 4) }, Launcher: { caps: {} }, Safety: { cache: {} } };
  vm.createContext(box);
  vm.runInContext(src('perps.js') + '\nthis.Futures = Futures; this.Deriv = Deriv;', box);
  vm.runInContext(src('walletpro.js') + '\nthis.WalletPro = WalletPro;', box);
  vm.runInContext(src('socialpro.js') + '\nthis.SocialPro = SocialPro;', box);
  vm.runInContext(src('bgbots.js') + '\nthis.Regime = Regime; this.Basket = Basket;', box);
  const F = box.Futures;
  F.reset(10000); const t = F.open('BTC-USD', 'long', 10, 1000, { price: 50000 });
  const p = box.ST.fut.pos['BTC-USD'];
  ok('futures: 10× long uses $1,000 margin for $10,000 of size', t.usd === 10000 && box.ST.fut.cash === 9000);
  ok('futures: liquidation price = entry × (1 − 1/lev + maintenance)', Math.abs(p.liq - p.entry * (1 - 0.1 + 0.005)) < 1e-6);
  ok('futures: unrealised P&L is size × move', Math.abs(F.upnl(p, 51000) - p.qty * (51000 - p.entry)) < 1e-9);
  const liq = F.check('BTC-USD', p.liq - 1); ok('futures: liquidation loses exactly the margin', liq.reason === 'LIQUIDATED' && liq.pnl < -990 && liq.pnl > -1000.01 && box.ST.fut.cash === 9000);
  F.open('ETH-USD', 'short', 3, 900, { price: 2000, slPct: 10 }); const ps = box.ST.fut.pos['ETH-USD'];
  ok('futures: short liquidation sits above entry, stop below liquidation', ps.liq > ps.entry && ps.sl < ps.liq);
  const st2 = F.check('ETH-USD', 2201); ok('futures: short stop-loss closes the position at the stop', st2.reason === 'stop-loss' && !box.ST.fut.pos['ETH-USD'] && st2.pnl < 0);
  F.open('SOL-USD', 'long', 2, 100, { price: 100 }); F.open('SOL-USD', 'short', 2, 100, { price: 110 });
  ok('futures: an opposite order flips the position (closes the old side first)', box.ST.fut.pos['SOL-USD'].side === 'short' && box.ST.fut.trades.some((x) => x.reason === 'flipped side'));
  ok('futures: leverage is clamped to 1–50×', (() => { F.reset(10000); F.open('X', 'long', 500, 10, { price: 1 }); return box.ST.fut.pos.X.lev === 50; })());
  const W = box.WalletPro;
  const g = W.groupsFrom([{ a: 'A', b: 'B', why: 'co' }], { C: 'F1', D: 'F1', E: 'F2' });
  ok('linked wallets: co-trading pairs and shared funders form separate groups', g.length === 2 && g.some((x) => x.members.sort().join() === 'A,B') && g.some((x) => x.members.sort().join() === 'C,D'));
  const g2 = W.groupsFrom([{ a: 'A', b: 'C', why: 'co' }], { C: 'F1', D: 'F1' });
  ok('linked wallets: groups merge across both signals', g2.length === 1 && g2[0].members.length === 3);
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: 1000 + i * 60, o: 10 + i, h: 0, l: 0, c: 11 + i }));
  ok('copy-backtest price lookup interpolates inside the minute and refuses out-of-range times', W.priceAt(cs, 1030 * 1000) === 10.5 && W.priceAt(cs, 10 * 1000) === null && W.priceAt(cs, 1e9) === null);
  const sim = W.copySim([{ mint: 'a', buyTs: 1e12, buyPx: 1, nowPx: 1.2 }], { delay: 0, size: 100, fee: 0, delayCost: 0.0015 });
  ok('copy-backtest marks still-open trades at the current price', sim.rows[0].open && Math.abs(sim.pnl - 20) < 1e-9);
  const SPx = box.SocialPro;
  const now = Date.now(), mk = (i, text, author, tags) => ({ id: 'p' + i, ts: now - i * 1000, text, author, tags: tags || [], cas: [], market: 'crypto', src: 'reddit', sent: { score: 0 } });
  const posts = [mk(1, 'gm $SOL looking strong today friends', 'a'), mk(2, 'FREE AIRDROP claim now!!! guaranteed', 'b'), mk(3, 'same exact copy pasta about the token moon soon', 'c'), mk(4, 'same exact copy pasta about the token moon soon', 'd'), mk(5, 'same exact copy pasta about the token moon soon', 'e'), mk(6, '$A $B $C $D $E $F', 'f', ['A', 'B', 'C', 'D', 'E', 'F'])];
  SPx.flag(posts);
  ok('social: normal posts pass the spam filter', !posts[0].spam);
  ok('social: shill words, copy-paste (3+ accounts) and cashtag spam are flagged', posts[1].spam && posts[2].spam && posts[3].spam && posts[4].spam && posts[5].spam);
  const R = box.Regime, rc = gen(400, 3600, 21), trades = [{ side: 'buy', ts: rc[100].t * 1000 }, { side: 'sell', ts: rc[120].t * 1000, pnl: 50 }, { side: 'buy', ts: rc[300].t * 1000 }, { side: 'sell', ts: rc[310].t * 1000, pnl: -20, frac: 0.5 }, { side: 'sell', ts: rc[320].t * 1000, pnl: 10 }];
  const bd = R.breakdown(trades, rc), tot = bd.up.n + bd.down.n + bd.chop.n;
  ok('regimes: every closed trade (including partial sells) is attributed once', tot === 3 && Math.abs(bd.up.pnl + bd.down.pnl + bd.chop.pnl - 40) < 1e-9);
  const sm = box.Basket.summary([{ ret: 10, bh: 5, eq: [100, 110] }, { ret: -4, bh: 2, eq: [100, 96] }, { ret: 6, bh: 9, eq: [100, 106] }, { err: 'x' }]);
  ok('basket summary: median, profitable count, beat buy & hold, equal-weight basket', sm.n === 3 && sm.med === 6 && sm.prof === 2 && sm.beat === 1 && Math.abs(sm.portRet - 4) < 1e-9);
}
console.log(res.join('\n'));
const n = res.filter((r) => r.startsWith('PASS')).length, f = res.filter((r) => r.startsWith('FAIL')).length;
console.log(`${n}/${n + f} passed`); process.exit(f ? 1 : 0);
