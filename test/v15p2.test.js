// ExTerm v15 phase 2 unit tests: bracket math + undo history, realistic paper fills, backtest round trips, Field Manual
// search, Morning Brief data, the click-to-trade bracket store, the realistic-fill account hook and the Challenges Hub rules.
const vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const P2 = require('../src/v15p2core.js');

/* ── bracket math ── */
{
  const m = P2.bracket({ entry: 100, sl: 98, tp: 104, usd: 1000 });
  ok('bracket: qty from USD, $ risk / reward, % moves and R:R', near(m.qty, 10) && near(m.risk, -20) && near(m.reward, 40) && near(m.slPct, -2) && near(m.tpPct, 4) && near(m.rr, 2), JSON.stringify(m));
  const q = P2.bracket({ entry: 50, sl: 45, qty: 3 });
  ok('bracket: explicit qty wins; a missing target leaves reward and R:R empty', near(q.risk, -15) && q.reward === null && q.rr === null, JSON.stringify(q));
  const sh = P2.bracket({ entry: 100, sl: 105, tp: 90, qty: 2, short: true });
  ok('bracket: a short risks above and earns below', near(sh.risk, -10) && near(sh.reward, 20) && near(sh.rr, 2), JSON.stringify(sh));
  ok('bracket: a stop above a long entry is not a valid R:R', P2.bracket({ entry: 100, sl: 101, tp: 110, qty: 1 }).rr === null);
  ok('bracket: no entry → all empty', P2.bracket({ entry: 0, sl: 1, tp: 2 }).risk === null);
  const l = P2.live({ entry: 100, qty: 2 }, 110);
  ok('live P&L of an open long', near(l.pnl, 20) && near(l.pct, 10));
  ok('live P&L needs a price', P2.live({ entry: 100, qty: 2 }, 0).pnl === null);
}
/* ── dragging stays on the right side of the entry ── */
{
  const b = { entry: 100, sl: 95, tp: 110 };
  ok('clamp: a long stop dragged above entry stays just below it', P2.clampLine('sl', 120, b) < 100 && P2.clampLine('sl', 120, b) > 99.99);
  ok('clamp: a long target dragged below entry stays just above it', P2.clampLine('tp', 80, b) > 100 && P2.clampLine('tp', 80, b) < 100.01);
  ok('clamp: entry stays between stop and target', P2.clampLine('entry', 200, b) < 110 && P2.clampLine('entry', 1, b) > 95 && P2.clampLine('entry', 102, b) === 102);
  ok('clamp: free moves pass through unchanged', P2.clampLine('sl', 90, b) === 90 && P2.clampLine('tp', 130, b) === 130);
  ok('clamp: a short stop stays above entry', P2.clampLine('sl', 80, { entry: 100, short: true }) > 100);
  ok('clamp: rejects junk', P2.clampLine('sl', NaN, b) === null && P2.clampLine('sl', -5, b) === null && P2.clampLine('sl', Infinity, b) === null);
  const d = P2.defaults(100, 0, 0), d2 = P2.defaults(100, 5, 12);
  ok('defaults: 2% stop and a 2R target, or the ticket’s %', near(d.sl, 98) && near(d.tp, 104) && near(d2.sl, 95) && near(d2.tp, 112), JSON.stringify([d, d2]));
}
/* ── undo / redo ── */
{
  const h = new P2.History(3);
  ok('history: a no-op move is not recorded', !h.push({ key: 'k', field: 'sl', from: 1, to: 1 }) && !h.canUndo);
  h.push({ key: 'k', field: 'sl', from: 1, to: 2 }); h.push({ key: 'k', field: 'sl', from: 2, to: 3 });
  const u = h.undo(); ok('history: undo returns the last move', u.to === 3 && h.canRedo);
  const r = h.redo(); ok('history: redo replays it', r.to === 3 && !h.canRedo);
  h.undo(); h.push({ key: 'k', field: 'tp', from: 5, to: 6 }); ok('history: a new move clears the redo stack', !h.canRedo);
  for (let i = 0; i < 10; i++) h.push({ key: 'k', field: 'sl', from: i, to: i + 1 });
  ok('history: keeps at most max entries', h.u.length === 3);
  h.clear(); ok('history: clear empties both stacks', !h.canUndo && !h.canRedo && h.undo() === null && h.redo() === null);
}
/* ── realistic paper fills ── */
{
  const book = { bids: [[99.9, 5], [99.8, 5], [99.5, 100]], asks: [[100.1, 5], [100.2, 5], [100.5, 100]] };
  const small = P2.exec('buy', 100, 100.1, { kind: 'cex', book });
  ok('fill: a small buy pays half the spread and no depth impact', near(small.spreadBp, 10, 1e-6) && small.impactBp < 1e-6 && small.price > 100, JSON.stringify(small));
  const big = P2.exec('buy', 100, 1001.5 + 300, { kind: 'cex', book }); // eats level 1, level 2, then some of level 3
  ok('fill: a large buy walks the book (VWAP above the best ask)', big.impactBp > 5 && big.price > small.price, JSON.stringify(big));
  const sell = P2.exec('sell', 100, 1500, { kind: 'cex', book });
  ok('fill: a sell walks the bids and fills below the quote', sell.price < 100 && sell.impactBp > 0, JSON.stringify(sell));
  const huge = P2.exec('buy', 100, 1e6, { kind: 'cex', book });
  ok('fill: an order larger than the visible book is flagged and penalised', /larger than the visible book/.test(huge.note) && huge.impactBp > big.impactBp, JSON.stringify(huge));
  const nob = P2.exec('buy', 100, 1e6, { kind: 'cex' }); ok('fill: no book → modelled 1 bp half-spread + sqrt impact', near(nob.spreadBp, 1) && near(nob.impactBp, 8), JSON.stringify(nob));
  const st = P2.exec('buy', 200, 1e6, { kind: 'stock' }), penny = P2.exec('buy', 2, 1000, { kind: 'stock' });
  ok('fill: stocks pay a tighter spread than penny stocks', near(st.spreadBp, 1.5) && near(st.impactBp, 10) && penny.spreadBp === 10);
  const dex = P2.exec('buy', 1, 10000, { kind: 'dex', liq: 200000 });
  ok('fill: DEX buy pays the pool fee + constant-product slippage u/(R+u)', near(dex.spreadBp, 25) && near(dex.impactBp, (10000 / 110000) * 1e4, 1e-9) && near(dex.price, 1 + dex.bp / 1e4), JSON.stringify(dex));
  const thin = P2.exec('buy', 1, 10000, { kind: 'dex', liq: 20000 }); ok('fill: thinner pool → more slippage', thin.impactBp > dex.impactBp);
  const unk = P2.exec('sell', 1, 1000, { kind: 'dex' }); ok('fill: unknown DEX liquidity is assumed thin and flagged', /unknown/.test(unk.note) && unk.price < 1);
  ok('fill: deterministic', JSON.stringify(P2.exec('buy', 100, 5000, { kind: 'cex', book })) === JSON.stringify(P2.exec('buy', 100, 5000, { kind: 'cex', book })));
  ok('fill: zero / bad size or price leaves the price alone', P2.exec('buy', 100, 0, {}).price === 100 && P2.exec('buy', 100, NaN, {}).price === 100 && P2.exec('buy', 0, 10, {}).price === 0);
  ok('fill: impact is capped at 50%', P2.exec('buy', 1, 1e12, { kind: 'dex', liq: 1000 }).impactBp <= 5000);
  const crossed = P2.exec('buy', 100, 100, { kind: 'cex', book: { bids: [[101, 1]], asks: [[100, 1]] } });
  ok('fill: a crossed / bad book falls back to the model', near(crossed.spreadBp, 1));
}
/* ── backtest round trips ── */
{
  const tr = [
    { ts: 1, side: 'sell', price: 5, qty: 1, pnl: 1 }, // orphan sell (window started mid-trade): ignored
    { ts: 10, side: 'buy', price: 100, qty: 1, reason: 'cross up' }, { ts: 20, side: 'sell', price: 110, qty: 1, pnl: 9.5, reason: 'take-profit' },
    { ts: 30, side: 'buy', price: 100, qty: 1 }, { ts: 31, side: 'buy', price: 90, qty: 1 }, { ts: 40, side: 'sell', price: 80, qty: 1, pnl: -15 }, { ts: 41, side: 'sell', price: 80, qty: 1, pnl: -15 },
    { ts: 50, side: 'buy', price: 70, qty: 2 },
  ];
  const t = P2.trips(tr);
  ok('trips: pairs entries with exits, skips orphan sells, keeps the open one', t.length === 3 && t[0].t0 === 10 && t[0].t1 === 20 && t[2].open && t[2].p1 === null, JSON.stringify(t.map((x) => [x.t0, x.t1, x.open])));
  ok('trips: win from P&L, % of cost', t[0].win === true && near(t[0].pct, 9.5) && t[0].reason === 'take-profit' && t[0].why0 === 'cross up');
  ok('trips: scale-in averages the entry and partial exits close once fully sold', t[1].n === 2 && near(t[1].avg, 95) && t[1].win === false && near(t[1].pnl, -30), JSON.stringify(t[1]));
  const s = P2.tripStats(t); ok('trips: stats count closed trips only', s.n === 2 && s.wins === 1 && s.losses === 1 && s.winRate === 50, JSON.stringify(s));
  const sh = P2.trips([{ ts: 1, side: 'buy', price: 100, qty: 1, short: true }, { ts: 2, side: 'sell', price: 90, qty: 1, short: true }]);
  ok('trips: shorts without P&L use the inverted % move', sh[0].short && near(sh[0].pct, 10) && sh[0].win);
  ok('trips: junk in, nothing out', P2.trips(null).length === 0 && P2.trips([{ side: 'buy', price: -1 }, null, { side: 'x', price: 5 }]).length === 0);
}
/* ── Field Manual search + Morning Brief ── */
{
  const items = [{ id: 'a', t: 'Prop-Firm Evaluation', k: 'drawdown', b: 'reach +8%' }, { id: 'b', t: 'Realistic fills', k: 'slippage spread', b: 'order book' }];
  ok('search: every word must match title, tags or body', P2.search(items, 'prop drawdown').map((x) => x.id).join() === 'a' && P2.search(items, 'SLIPPAGE book').map((x) => x.id).join() === 'b' && P2.search(items, 'prop slippage').length === 0);
  ok('search: empty query lists everything', P2.search(items, '  ').length === 2);
  const br = P2.brief({ watch: [{ sym: 'A', ch: 1 }, { sym: 'B', ch: -9 }, { sym: 'C', ch: null }, { sym: 'D', ch: 3 }], pos: [{ sym: 'A', qty: 2, avg: 10, px: 12, sl: 9, tp: 15 }, { sym: 'B', qty: 1, avg: 5, px: 4 }], eq: 110, eq0: 100, orders: 2, alerts: 1, streak: 3 });
  ok('brief: movers by size of move, positions with P&L and stop distance, unprotected count', br.movers.map((m) => m.sym).join() === 'B,D,A' && near(br.pos[0].pnl, 4) && near(br.pos[0].toSl, -25) && br.naked === 1 && near(br.eqCh, 10) && br.orders === 2, JSON.stringify(br));
}

/* ── the app pieces in a sandbox: core.js (Account) + v15p2core + v15p2 with small stubs ── */
const toasts = []; let saved = 0;
const sb = { console, Math, JSON, Date, Array, Object, Number, String, Map, Set, Promise, Error, isFinite, setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {} };
vm.createContext(sb);
vm.runInContext(src('core.js') + '\nthis.NT = NT;', sb);
Object.assign(sb, {
  ST: { settings: {}, sel: 'BTC-USD', stops: [], alerts: [], draw: {} }, PRICE: { 'BTC-USD': 100, 'oc:solana:pool': 1, AAPL: 200 },
  toast: (m) => toasts.push(m), saveState: () => { saved++; }, esc: (s) => String(s), baseOf: (s) => String(s).split('-')[0], $: () => null, $$: () => [],
  Feed: { subscribe: () => {} }, boot: async () => {}, renderTicketMeta: () => {}, isStock: (s) => s === 'AAPL', isOnchain: (s) => /^oc:/.test(s), OC: { stats: { 'oc:solana:pool': { liq: 100000 } } },
  navigator: {}, window: {}, document: { addEventListener: () => {}, querySelector: () => null },
});
vm.runInContext('var px = (s) => PRICE[s]; var ACC = new NT.Account({ cash: 100000 });\n' + src('v15p2core.js') + '\n' + src('v15p2.js') + '\nthis.X = { P2, ChartTrade, ExecSim, Manual, Walk, Brief, Doctor, getACC: () => ACC };', sb);
const X = sb.X, ACC = X.getACC(); sb.P2 = X.P2;
{
  const T = X.ChartTrade;
  T.draft = Object.assign({ sym: 'BTC-USD', usd: 500 }, sb.P2.defaults(99, 0, 0));
  ok('bracket store: the draft is the current bracket', T.cur().kind === 'draft' && T.cur().entry === 99);
  ok('bracket store: set moves a line', T.set('draft', 'sl', 96) && T.cur().sl === 96 && !T.set('draft', 'evil', 1));
  const o = T.place();
  ok('place: an entry below the price becomes a buy limit with the bracket attached', o && ACC.orders.length === 1 && ACC.orders[0].price === 99 && ACC.orders[0].meta.slPx === 96 && near(ACC.orders[0].meta.tpPx, 99 + 2 * (99 - 99 * 0.98)) && T.draft === null, JSON.stringify(ACC.orders));
  const b = T.cur(); ok('bracket store: a pending limit is shown next', b.kind === 'order' && b.sl === 96);
  T.set(b.key, 'sl', 95); ok('dragging an order’s stop rewrites its absolute price', ACC.orders[0].meta.slPx === 95);
  T.hist.push({ key: b.key, field: 'sl', from: 96, to: 95 }); T.apply(T.hist.undo(), true);
  ok('undo puts the order’s stop back', ACC.orders[0].meta.slPx === 96);
  T.apply(T.hist.redo(), false); ok('redo moves it again', ACC.orders[0].meta.slPx === 95);
  const fills = ACC.matchOrders('BTC-USD', 98, 101, 1);
  ok('the limit fills with the dragged stop and target on the position', fills.length === 1 && ACC.pos['BTC-USD'].sl === 95 && ACC.pos['BTC-USD'].tp > 99, JSON.stringify(ACC.pos['BTC-USD']));
  const p = T.cur(); ok('an open position becomes the bracket; its entry is fixed', p.kind === 'pos' && !T.set(p.key, 'entry', 50) && T.set(p.key, 'sl', 97) && ACC.pos['BTC-USD'].sl === 97);
  T.draft = Object.assign({ sym: 'BTC-USD', usd: 500 }, sb.P2.defaults(105, 0, 0)); T.place();
  ok('place: an entry above the price arms a buy stop', sb.ST.stops.length === 1 && sb.ST.stops[0].trigger === 105 && sb.ST.stops[0].meta.slPx > 0);
  ok('a missing bracket key cannot be edited', !T.set('ord:nope', 'sl', 1) && !T.set('pos:NOPE', 'sl', 1) && T.find('stop:nope') === null);
  T.act('alert', 120); ok('+ menu: alert above the price', sb.ST.alerts.length === 1 && sb.ST.alerts[0].dir === 'above' && sb.ST.alerts[0].price === 120);
  T.act('alert', 80); ok('+ menu: alert below the price', sb.ST.alerts[1].dir === 'below');
  const before = sb.ST.stops.length; T.act('sell', 90);
  ok('+ menu: a sell below the price arms a protective sell stop for the whole position', sb.ST.stops.length === before + 1 && sb.ST.stops[before].side === 'sell' && near(sb.ST.stops[before].usd, ACC.qty('BTC-USD') * 90));
  T.act('sell', 130); ok('+ menu: a sell above the price places a sell limit', ACC.orders.some((x) => x.side === 'sell' && x.price === 130));
}
{
  const E = X.ExecSim; E.install();
  sb.ST.settings.realExec = false; const a = ACC.buy('AAPL', 200, 1000, 1, { reason: 'market buy' });
  ok('fills: off → the usual flat slippage', near(a.price, 200 * (1 + ACC.slip)) && !a.exec);
  sb.ST.settings.realExec = true; const b = ACC.buy('AAPL', 200, 1000, 2, { reason: 'market buy' });
  ok('fills: on → the stock model price, tagged and explained', near(b.price, sb.P2.exec('buy', 200, 1000, { kind: 'stock' }).price) && b.exec && /fill: spread/.test(b.reason), JSON.stringify(b));
  const s = ACC.sell('AAPL', 200, null, 3, { reason: 'stop-loss' });
  ok('fills: stop-loss exits pay the spread too', s.price < 200 && s.exec);
  const L = ACC.buy('BTC-USD', 100, 1000, 4, { reason: 'limit buy' });
  ok('fills: limit fills keep their price', near(L.price, 100 * (1 + ACC.slip)) && !L.exec);
  const d = ACC.buy('oc:solana:pool', 1, 5000, 5, { reason: 'market buy' });
  ok('fills: DEX buys pay pool slippage from its liquidity', d.exec.kind === 'dex' && near(d.exec.impactBp, (5000 / 55000) * 1e4, 1e-3));
  const other = new sb.NT.Account({ cash: 1000 }), t = other.buy('AAPL', 200, 500, 6, {});
  ok('fills: bots and backtests (other accounts) are never touched', near(t.price, 200 * (1 + other.slip)) && !t.exec);
  E.install(); const again = ACC.buy('AAPL', 200, 1000, 7, { reason: 'market buy' });
  ok('fills: installing twice does not double the cost', near(again.price, sb.P2.exec('buy', 200, 1000, { kind: 'stock' }).price));
}
{
  const M = X.Manual;
  ok('field manual: every topic has a working Try-this link', M.ITEMS.every((it) => typeof M.GO[it.id] === 'function') && M.ITEMS.length >= 15);
  ok('field manual: topic ids are unique', new Set(M.ITEMS.map((i) => i.id)).size === M.ITEMS.length);
  ok('field manual: search finds prop firm, slippage and undo topics', sb.P2.search(M.ITEMS, 'prop firm')[0].id === 'prop' && sb.P2.search(M.ITEMS, 'slippage').some((i) => i.id === 'exec') && sb.P2.search(M.ITEMS, 'ctrl z').some((i) => i.id === 'undo'));
  ok('walkthrough: five steps, each with Show me and a done check', X.Walk.STEPS.length === 5 && X.Walk.STEPS.every((s) => typeof s.go === 'function' && typeof s.done === 'function'));
  ok('morning brief: lists the click-to-trade commands', X.Brief.COMMANDS.some(([k]) => /\+/.test(k)) && X.Brief.COMMANDS.some(([k]) => /Ctrl\+Z/.test(k)));
  const c = X.Doctor.clean({ name: '<b>x</b>'.repeat(40), ok: 'yes', detail: 1 });
  ok('doctor: launcher rows are coerced to short strings and tri-state ok', c.name.length === 80 && c.ok === null && c.detail === '1');
}

/* ── Challenges Hub: rules, grades, modeled black swans, trench ── */
const sb2 = { NT: sb.NT, console, Math, JSON, Date, String, Number, Array, Object, localStorage: { s: {}, getItem(k) { return this.s[k] || null; }, setItem(k, v) { this.s[k] = v; } } };
vm.createContext(sb2); vm.runInContext(src('challenge.js') + '\nthis.Challenge = Challenge;', sb2);
const CH = sb2.Challenge;
const flat = (n, p = 100) => Array.from({ length: n }, (_, i) => ({ t: i * 3600, o: p, h: p, l: p, c: p, v: 1 }));
{
  ok('grade: a clean winning prop pass is A+', CH.grade({ edge: 10, maxDD: 1, passed: true, trades: 3, bars: 240, winRate: 100 }).g === 'A+');
  ok('grade: a blown account is F', CH.grade({ edge: -5, maxDD: 9, fail: true, trades: 4, bars: 240, winRate: 25 }).g === 'F');
  ok('grade: sitting out a flat market is a D, not a pass', CH.grade({ edge: 0, maxDD: 0, trades: 0, bars: 90 }).g === 'D');
  const churn = CH.grade({ edge: 2, maxDD: 2, trades: 50, bars: 90, winRate: 50 }).score, calm = CH.grade({ edge: 2, maxDD: 2, trades: 5, bars: 90, winRate: 50 }).score;
  ok('grade: overtrading costs points', churn < calm);
  ok('grade: every result is one of A+..F', ['A+', 'A', 'B', 'C', 'D', 'F'].includes(CH.grade({}).g));

  // prop: a 5% gap down inside one "day" breaks the 4% daily loss limit
  const c = flat(400); for (let i = 62; i < 400; i++) { c[i] = Object.assign({}, c[i], { o: 95, h: 95, l: 95, c: 95 }); }
  let g = new CH.Game(c, { cash0: 50000, rules: { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 }, play: 240, fee: 0 }); g.buy(); g.step(10);
  ok('prop: the daily loss limit closes the account', g.done && /Daily loss limit/.test(g.fail) && g.qty === 0 && !g.result().beat && g.result().grade === 'F', g.fail);
  // prop: slow bleed across days → trailing drawdown
  const bleed = flat(400); for (let i = 60; i < 400; i++) { const p = 100 * Math.pow(0.9985, i - 59); bleed[i] = { t: i * 3600, o: p, h: p, l: p, c: p, v: 1 }; }
  g = new CH.Game(bleed, { rules: { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 }, play: 240, fee: 0 }); g.buy(); g.step(1000);
  ok('prop: an 8% trailing drawdown closes the account even without a bad day', /Max drawdown/.test(g.fail || '') && g.maxDD >= 8, g.fail);
  // prop: +10% rally → passes at +8%
  const up = flat(400); for (let i = 60; i < 400; i++) { const p = 100 * (1 + 0.01 * (i - 59)); up[i] = { t: i * 3600, o: p, h: p, l: p * 0.999, c: p, v: 1 }; }
  g = new CH.Game(up, { cash0: 100000, rules: { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 }, play: 240, fee: 0 }); g.buy(); g.step(1000);
  const r = g.result();
  ok('prop: reaching +8% passes the evaluation early', g.passed && r.beat && r.mine >= 8 && g.i < g.end - 1 && r.grade !== 'F', JSON.stringify({ i: g.i, mine: r.mine, grade: r.grade }));
  ok('result: reports max drawdown, win rate and grade', typeof r.maxDD === 'number' && r.winRate === 100 && /^(A\+|[ABCDF])$/.test(r.grade));
  // drawdown is measured at the candle low
  const wick = flat(200); wick[61] = { t: 61 * 3600, o: 100, h: 100, l: 80, c: 100, v: 1 };
  g = new CH.Game(wick, { fee: 0 }); g.buy(); g.step(3); ok('max drawdown counts intrabar wicks while holding', near(g.maxDD, 20, 1e-6), g.maxDD);
  // replay games are unchanged: no rules → no fail, beat = edge > 0
  g = new CH.Game(flat(200), {}); g.step(1e6); ok('replay mode still has no rules', !g.fail && !g.passed && g.done && g.result().beat === false);

  // black swans: deterministic, hit the key closes exactly, right length
  const sw = CH.swanCandles('covid', CH.rng(7)), sw2 = CH.swanCandles('covid', CH.rng(7)), S = CH.SWANS.covid;
  ok('black swan: same seed, same path', JSON.stringify(sw) === JSON.stringify(sw2));
  ok('black swan: path length and key closes match the event', sw.length === S.pts[S.pts.length - 1][0] && near(sw[S.pts[3][0] - 1].c, S.pts[3][1], 1e-9) && near(sw[sw.length - 1].c, S.pts[S.pts.length - 1][1], 1e-9));
  ok('black swan: candles are well-formed (h ≥ max(o,c), l ≤ min(o,c), time increasing)', sw.every((k, i) => k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c) && k.l > 0 && (i === 0 || k.t > sw[i - 1].t)));
  for (const id of Object.keys(CH.SWANS)) { const s = CH.SWANS[id], cc = CH.swanCandles(id, CH.rng(3)); const gg = new CH.Game(cc, { show: s.show, play: s.pts[s.pts.length - 1][0] - s.show, rules: { maxDD: 20 } }); ok(`black swan ${id}: playable`, gg.end - gg.start > 50 && gg.c[0].t === s.t0); }
  const crash = CH.swanCandles('covid', CH.rng(1)); g = new CH.Game(crash, { show: 60, play: 200, rules: { maxDD: 20 } }); g.step(1000);
  ok('black swan: staying in cash survives the crash and beats buy-and-hold', !g.fail && g.result().beat && g.result().bh < -30, JSON.stringify(g.result()));
  g = new CH.Game(crash, { show: 60, play: 200, rules: { maxDD: 20 } }); g.buy(); g.step(1000);
  ok('black swan: holding through it breaks the 20% drawdown rule', /Max drawdown/.test(g.fail || ''));

  // trench: seeded rugs, fees + slippage
  let rugs = 0; for (let k = 1; k <= 60; k++) { const t = CH.trench(CH.rng(k)); if (t.rug) rugs++; if (t.length < 200 || !t.name) ok('trench: shape', false, k); }
  ok('trench: some launches rug and some don’t', rugs > 5 && rugs < 55, rugs);
  const tg = new CH.Game(flat(200), { fee: 0.01, slip: 0.01 }); tg.buy(); tg.sell();
  ok('trench: 1% fee + 1% slippage per side costs ~4% a round trip', near(tg.cash, 10000 * 0.98 / 1.02, 1e-9), tg.cash);

  // stats keep the new fields and tolerate old callers
  const st = CH.record({ beat: true, score: 700, edge: 2, grade: 'B', maxDD: 3.14159 }, { sym: 'BTC-USD', tf: '1h', mode: 'prop50' });
  ok('stats: mode, grade and drawdown are stored', st.hist[0].mode === 'prop50' && st.hist[0].grade === 'B' && st.hist[0].dd === 3.1);
  const st2 = CH.record({ beat: false, score: 1, edge: 0, grade: '<img>' }, { sym: 'X', tf: '1h', mode: 'evil' });
  ok('stats: unknown modes and grades are not stored as-is', st2.hist[0].mode === 'random' && st2.hist[0].grade === null);
  const d1 = CH.record({ beat: true, score: 300, edge: 1 }, { sym: 'BTC-USD', tf: '1h', daily: '2026-11-13' }), streak1 = d1.streak;
  const d2 = CH.record({ beat: true, score: 999, edge: 9 }, { sym: 'BTC-USD', tf: '1h', daily: '2026-11-13' });
  ok('daily: replaying today (future already seen) keeps the first score and never bumps the streak', d2.daily['2026-11-13'] === 300 && d2.streak === streak1 && d2.played === d1.played + 1, JSON.stringify([d1.streak, d2.streak, d2.daily]));
  ok('modes: every Hub mode exists with a name and description', ['daily', 'blind', 'random', 'prop50', 'prop100', 'swan', 'scalp', 'naked', 'trench'].every((m) => CH.MODES[m] && CH.MODES[m].name && CH.MODES[m].d));
  ok('modes: prop rules are +8% / 4% daily / 8% trailing', CH.MODES.prop50.rules.target === 8 && CH.MODES.prop50.rules.dailyDD === 4 && CH.MODES.prop50.rules.maxDD === 8 && CH.MODES.prop100.cash0 === 100000);
  const sy = CH.synth(CH.rng(5), 200, 100, 0.008, 3600); ok('offline fallback produces a playable series', sy.length >= 180 && sy.every((k) => k.c > 0));
}

console.log(res.join('\n'));
const fails = res.filter((r) => r.startsWith('FAIL'));
console.log(`${res.length - fails.length}/${res.length} passed`);
process.exit(fails.length ? 1 : 0);
