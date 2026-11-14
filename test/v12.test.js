// v12 unit tests: token safety grading, strategy specs (validation, no look-ahead, Pine export), order flow maths,
// trade-journal review engine, replay-challenge engine. Pure functions, no browser.
const assert = require('assert');
const NT = require('../src/stratspec.js'), SP = NT.Spec;
global.NT = NT;
const Safety = require('../src/safety.js');
const OF = require('../src/orderflow.js');
let passed = 0; const fails = [];
const t = (name, fn) => { try { fn(); passed++; } catch (e) { fails.push(name + ': ' + e.message); } };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function market(n, seed, drift = 0.0004) { const r = rng(seed); let p = 100; const o = []; for (let i = 0; i < n; i++) { const op = p; p = Math.max(0.01, p * (1 + drift + (r() - 0.5) * 0.03)); o.push({ t: 1.6e9 + i * 3600, o: op, h: Math.max(op, p) * (1 + r() * 0.008), l: Math.min(op, p) * (1 - r() * 0.008), c: p, v: 1000 + r() * 3000 }); } return o; }

/* ───────── token safety ───────── */
t('safety: clean token grades A', () => { const c = [].concat(Safety.checkMint({ mintAuthority: null, freezeAuthority: null, program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }), Safety.checkHolders([{ uiAmount: 300 }, ...Array.from({ length: 12 }, () => ({ uiAmount: 10 }))], 1000), Safety.checkMarket({ liquidity: { usd: 250000 }, pairCreatedAt: Date.now() - 30 * 864e5, txns: { h24: { buys: 800, sells: 700 } }, volume: { h24: 900000 } })); const g = Safety.grade(c); assert.strictEqual(g.grade, 'A'); assert.ok(!g.crit); });
t('safety: live mint authority is critical and caps the grade at D', () => { const c = [].concat(Safety.checkMint({ mintAuthority: 'Abc', freezeAuthority: null, program: 'x' }), Safety.checkMarket({ liquidity: { usd: 900000 }, pairCreatedAt: Date.now() - 90 * 864e5, txns: { h24: { buys: 500, sells: 500 } } })); const g = Safety.grade(c); assert.ok(g.crit); assert.ok('DF'.includes(g.grade), g.grade); });
t('safety: freeze authority + thin liquidity grades F', () => { const g = Safety.grade([].concat(Safety.checkMint({ mintAuthority: 'A', freezeAuthority: 'B', program: 'x' }), Safety.checkMarket({ liquidity: { usd: 3000 }, pairCreatedAt: Date.now() - 36e5, txns: { h24: { buys: 90, sells: 0 } } }))); assert.strictEqual(g.grade, 'F'); });
t('safety: zero sells with many buys flags a honeypot', () => { const c = Safety.checkMarket({ liquidity: { usd: 80000 }, txns: { h24: { buys: 400, sells: 0 } } }); const s = c.find((x) => x.id === 'sells'); assert.strictEqual(s.status, 'fail'); assert.ok(s.crit); });
t('safety: dangerous Token-2022 extensions fail', () => { const c = Safety.checkMint({ mintAuthority: null, freezeAuthority: null, program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', extensions: [{ extension: 'permanentDelegate' }] }); assert.strictEqual(c.find((x) => x.id === 'ext').status, 'fail'); });
t('safety: high transfer tax fails, small tax warns', () => { const f = (bps) => Safety.checkMint({ program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', extensions: [{ extension: 'transferFeeConfig', state: { newerTransferFee: { transferFeeBasisPoints: bps } } }] }).find((x) => x.id === 'ext').status; assert.strictEqual(f(1000), 'fail'); assert.strictEqual(f(100), 'warn'); });
t('safety: concentrated holders fail', () => { const c = Safety.checkHolders([{ uiAmount: 100 }, ...Array.from({ length: 10 }, () => ({ uiAmount: 70 }))], 1000); assert.strictEqual(c[0].status, 'fail'); });
t('safety: no data → "?" grade, never a false A', () => { const g = Safety.grade([].concat(Safety.checkMint(null), Safety.checkHolders(null, 0), Safety.checkMarket(null), Safety.checkRugcheck(null))); assert.strictEqual(g.grade, '?'); });
t('safety: RugCheck unlocked liquidity fails, text is stripped of markup', () => { const c = Safety.checkRugcheck({ risks: [{ name: 'LP Unlocked <img src=x onerror=alert(1)>', level: 'danger', description: '"><script>' }] }); const lp = c.find((x) => x.id === 'lp'); assert.strictEqual(lp.status, 'fail'); assert.ok(!/[<>"]/.test(lp.why)); });
t('safety: garbage numbers never produce NaN scores', () => { const g = Safety.grade(Safety.checkMarket({ liquidity: { usd: 'abc' }, pairCreatedAt: 'x', txns: { h24: { buys: 'NaN', sells: null } }, volume: { h24: Infinity } })); assert.ok(Number.isFinite(g.score)); });
t('safety: address validation', () => { assert.ok(Safety.isMint('7DSidHrQFhzLYaxvJTGpB15kHZC6rYA81hFXTTMfpump')); assert.ok(!Safety.isMint('0OIl' + 'x'.repeat(40))); assert.ok(!Safety.isMint('abc')); assert.ok(Safety.isEvm('0x' + 'a'.repeat(40))); assert.ok(!Safety.isEvm('0x' + 'g'.repeat(40))); });

/* ───────── strategy specs ───────── */
t('spec: every template validates and registers', () => { for (const s of SP.TEMPLATES) { const v = SP.validate(s); assert.ok(v.ok, v.errors.join(';')); assert.ok(NT.strategies[SP.register(s)]); } });
t('spec: unknown fields, indicators and prototype keys are rejected', () => {
  const v = SP.validate({ v: 1, name: 'Evil', entry: { all: [{ a: { k: '__proto__' }, op: '>', b: { k: 'constructor' } }] }, exit: { any: [] }, risk: { sl: 5 }, evil: 1 });
  assert.ok(!v.ok); assert.ok(v.errors.some((e) => /Unknown field/.test(e))); assert.ok(v.errors.some((e) => /unknown indicator/.test(e)));
  assert.strictEqual(({}).polluted, undefined);
});
t('spec: comparisons limited to the allow-list', () => { const v = SP.validate({ v: 1, name: 'X', entry: { all: [{ a: { k: 'price' }, op: 'eval', b: { k: 'const', v: 1 } }] }, exit: { any: [] }, risk: { sl: 2 } }); assert.ok(!v.ok); });
t('spec: periods are bounded integers', () => { for (const n of [0, 1, 401, 2.5, 'x', -3]) assert.ok(!SP.validate({ v: 1, name: 'X', entry: { all: [{ a: { k: 'ema', n }, op: '>', b: { k: 'const', v: 1 } }] }, exit: { any: [] }, risk: { sl: 2 } }).ok, 'n=' + n); });
t('spec: needs an exit or a stop', () => { assert.ok(!SP.validate({ v: 1, name: 'No exit', entry: { all: [{ a: { k: 'price' }, op: '>', b: { k: 'const', v: 1 } }] }, exit: { any: [] }, risk: {} }).ok); });
t('spec: left side must be an indicator', () => { assert.ok(!SP.validate({ v: 1, name: 'X', entry: { all: [{ a: { k: 'const', v: 1 }, op: '>', b: { k: 'price' } }] }, exit: { any: [] }, risk: { sl: 1 } }).ok); });
t('spec: oversized files rejected', () => { assert.ok(!SP.validate({ v: 1, name: 'X', desc: 'a'.repeat(30000), entry: { all: [] }, exit: { any: [] } }).ok); });
t('spec: at most 8 conditions per group', () => { const c = { a: { k: 'price' }, op: '>', b: { k: 'const', v: 1 } }; assert.ok(!SP.validate({ v: 1, name: 'X', entry: { all: Array(9).fill(c) }, exit: { any: [] }, risk: { sl: 1 } }).ok); });
t('spec: names are cleaned (no markup, no control chars)', () => { const v = SP.validate({ v: 1, name: '<b>Hi</b>‮\u0007', entry: { all: [{ a: { k: 'price' }, op: '>', b: { k: 'const', v: 1 } }] }, exit: { any: [] }, risk: { sl: 1 } }); assert.ok(!/[<>‮\u0007]/.test(v.spec.name)); });
t('spec: compiled strategy has no look-ahead (future bars never change past signals)', () => {
  for (const tpl of SP.TEMPLATES) {
    const c = market(900, 11), st = SP.compile(SP.validate(tpl).spec), cut = 600;
    const a = NT.backtest(c, st, {}, { cash: 10000 }).trades.filter((x) => x.ts <= c[cut].t).map((x) => x.side + x.ts);
    const c2 = c.slice(0, cut + 1).concat(market(299, 99, -0.01).map((k, i) => Object.assign(k, { t: c[cut + 1 + i].t })));
    const b = NT.backtest(c2, st, {}, { cash: 10000 }).trades.filter((x) => x.ts <= c[cut].t).map((x) => x.side + x.ts);
    assert.deepStrictEqual(a, b, tpl.name);
  }
});
t('spec: crossAbove fires only on the crossing bar', () => {
  const c = Array.from({ length: 60 }, (_, i) => ({ t: i, o: 1, h: 1, l: 1, c: i < 30 ? 10 : 30, v: 1 }));
  const st = SP.compile(SP.validate({ v: 1, name: 'Cross', entry: { all: [{ a: { k: 'price' }, op: 'crossAbove', b: { k: 'const', v: 20 } }] }, exit: { any: [] }, risk: { tp: 1 } }).spec);
  const Sx = st.prepare(c, {}); let fires = 0; for (let i = 0; i < 60; i++) if (st.onBar(i, Sx, c, { pos: null })) fires++; assert.strictEqual(fires, 1);
});
t('spec: risk block becomes real stop/target on the position', () => {
  const c = market(600, 3, 0.001), id = SP.register({ v: 1, name: 'Stop test', entry: { all: [{ a: { k: 'price' }, op: '>', b: { k: 'const', v: 0 } }] }, exit: { any: [] }, risk: { sl: 2, tp: 3 } });
  const r = NT.backtest(c, NT.strategies[id], {}, { cash: 10000 }), exits = r.trades.filter((x) => x.side === 'sell').map((x) => x.reason);
  assert.ok(exits.length > 5 && exits.every((x) => /stop-loss|take-profit/.test(x)), exits.slice(0, 5).join(','));
});
t('spec: highest/lowest look only at prior bars (fast path matches brute force)', () => { const c = market(700, 21), h = SP.OPS.highest.f(c, 25), l = SP.OPS.lowest.f(c, 9); for (let i = 0; i < 700; i++) { if (i < 25) assert.ok(Number.isNaN(h[i])); else assert.strictEqual(h[i], Math.max(...c.slice(i - 25, i).map((k) => k.h))); if (i >= 9) assert.strictEqual(l[i], Math.min(...c.slice(i - 9, i).map((k) => k.l))); } });
t('spec: Pine export is v5 with entry/exit and risk', () => {
  const p = SP.toPine(SP.validate(SP.TEMPLATES[0]).spec);
  assert.ok(p.startsWith('//@version=5')); assert.ok(/strategy\("RSI dip in an uptrend"/.test(p)); assert.ok(/ta\.rsi\(close, 14\)/.test(p)); assert.ok(/strategy\.exit\("Risk", "Long", stop=/.test(p));
  const p2 = SP.toPine(SP.validate({ v: 1, name: 'M"ACD"', entry: { all: [{ a: { k: 'macd' }, op: 'crossAbove', b: { k: 'macdSignal' } }, { a: { k: 'adx', n: 14 }, op: '>', b: { k: 'const', v: 25 } }] }, exit: { any: [] }, risk: { trail: 5 } }).spec);
  assert.ok(/\[_macd, _sig, _hist\] = ta\.macd/.test(p2) && /ta\.dmi\(14, 14\)/.test(p2) && /ta\.crossover\(_macd, _sig\)/.test(p2) && !/strategy\("M"/.test(p2));
});
t('spec: community library files are valid and unique', () => { const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'community', 'strategies'), ids = new Set(); for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) { const v = SP.validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); assert.ok(v.ok, f + ': ' + v.errors.join(';')); assert.ok(v.spec.author, f); const id = SP.idOf(v.spec); assert.ok(!ids.has(id), 'dup ' + id); ids.add(id); } assert.ok(ids.size >= 6); });

/* ───────── order flow ───────── */
t('orderflow: profile conserves volume, POC is the heaviest bin, value area holds ≥70%', () => {
  const c = market(400, 5), P = OF.profile(c, 0, c.length, 40), tot = c.reduce((s, k) => s + k.v, 0);
  assert.ok(Math.abs(P.total - tot) / tot < 1e-9); assert.ok(P.bins.every((b) => b.v <= P.bins[P.poc].v));
  const va = P.bins.filter((b) => b.lo >= P.val - 1e-9 && b.hi <= P.vah + 1e-9).reduce((s, b) => s + b.v, 0); assert.ok(va / tot >= 0.7 - 1e-9);
  assert.ok(P.val <= P.pocPrice && P.pocPrice <= P.vah);
});
t('orderflow: flat or empty input is handled', () => { assert.strictEqual(OF.profile([], 0, 0), null); assert.strictEqual(OF.profile([{ o: 1, h: 1, l: 1, c: 1, v: 5 }, { o: 1, h: 1, l: 1, c: 1, v: 5 }]), null); assert.deepStrictEqual(OF.delta([{ o: 1, h: 1, l: 1, c: 1, v: 9 }]), [0]); });
t('orderflow: delta sign follows where the bar closed', () => { const d = OF.delta([{ o: 1, h: 2, l: 1, c: 2, v: 10 }, { o: 2, h: 2, l: 1, c: 1, v: 10 }, { o: 1, h: 2, l: 1, c: 1.5, v: 10 }]); assert.ok(d[0] === 10 && d[1] === -10 && d[2] === 0); assert.deepStrictEqual(OF.cvd([{ o: 1, h: 2, l: 1, c: 2, v: 4 }, { o: 1, h: 2, l: 1, c: 2, v: 6 }]), [4, 10]); });
t('orderflow: liquidation levels sit around price, normalised to 0..1', () => { const c = market(500, 8), Q = OF.liqLevels(c, c[c.length - 1].c); assert.ok(Q.lo < c[c.length - 1].c && Q.hi > c[c.length - 1].c); for (const v of Q.longs.concat(Q.shorts)) assert.ok(v >= 0 && v <= 1); assert.strictEqual(OF.liqLevels(c.slice(0, 5), 1), null); });

/* ───────── journal review (load browser file into a sandbox) ───────── */
const fs = require('fs'), vm = require('vm');
const sb = { NT, TABS: {}, console, Date, Math, JSON, String, Number, Array, Object, Set, setTimeout, clearTimeout, indexedDB: undefined, localStorage: { getItem: () => null, setItem: () => {} }, baseOf: (s) => s.replace('-USD', ''), cssv: () => '#000', curTab: '' };
NT.fmtUSD = NT.fmtUSD || ((v) => '$' + v.toFixed(2));
vm.createContext(sb); vm.runInContext(fs.readFileSync(__dirname + '/../src/journal.js', 'utf8') + '\nthis.Journal = Journal;', sb);
const JN = sb.Journal;
const H = 3600e3, T0 = Date.UTC(2026, 10, 2, 9);
function tr(k, opts) { const ts = T0 + k * H; return [{ id: 'b' + k, ts, sym: opts.sym || 'BTC-USD', side: 'buy', usd: opts.usd || 500, src: 'manual', plan: opts.stop ? { sl: 1 } : null, tags: [], mood: opts.mood || '' }, { id: 's' + k, ts: ts + (opts.held || 0.5 * H), sym: opts.sym || 'BTC-USD', side: 'sell', pnl: opts.pnl, pnlPct: opts.pnl / 500, held: opts.held || 0.5 * H, src: 'manual', tags: [], mood: '' }]; }
t('journal: pairs buys with sells per symbol and source', () => { const C = JN.closed([].concat(tr(0, { pnl: 10 }), tr(2, { pnl: -5, sym: 'ETH-USD' }))); assert.strictEqual(C.length, 2); assert.ok(C.every((x) => x.entry)); });
t('journal: too few trades → asks for more, no fake insights', () => { const R = JN.review([].concat(tr(0, { pnl: 1 }))); assert.ok(R.note && !R.insights.length); });
t('journal: finds holding losers longer than winners', () => { let e = []; for (let k = 0; k < 10; k++) e = e.concat(tr(k * 3, k % 2 ? { pnl: -20, held: 8 * H } : { pnl: 15, held: 0.3 * H })); const R = JN.review(e); assert.ok(R.insights.some((x) => x.id === 'hold'), R.insights.map((x) => x.id).join()); });
t('journal: finds revenge trading', () => {
  let e = [];
  for (let k = 0; k < 6; k++) { const base = k * 10; e = e.concat(tr(base, { pnl: -30 })); const [b, s] = tr(base, { pnl: -25 }); b.id += 'r'; s.id += 'r'; b.ts += 0.6 * H; s.ts = b.ts + 0.3 * H; e.push(b, s); }
  for (let k = 0; k < 6; k++) e = e.concat(tr(100 + k * 10, { pnl: 40 }));
  const R = JN.review(e); assert.ok(R.insights.some((x) => x.id === 'revenge'), R.insights.map((x) => x.id).join());
});
t('journal: finds losing streaks and trading without stops', () => { let e = []; for (let k = 0; k < 6; k++) e = e.concat(tr(k * 2, { pnl: -10 })); const R = JN.review(e); assert.ok(R.insights.some((x) => x.id === 'streak')); assert.ok(R.insights.some((x) => x.id === 'stops')); });
t('journal: CSV export neutralises spreadsheet formulas', () => { const csv = JN.csv([{ ts: T0, sym: 'BTC-USD', side: 'buy', price: 1, usd: 1, pnl: null, pnlPct: null, held: null, src: 'manual', reason: '=HYPERLINK("http://evil")', tags: [], mood: '', notes: '+cmd|calc' }]); assert.ok(csv.includes(`"'=HYPERLINK`) && csv.includes(`"'+cmd|calc"`)); });
t('journal: notes, moods and tags are validated on update', () => { JN.entries = [{ id: 'x', ts: T0, sym: 'BTC-USD', notes: '', tags: [], mood: '' }]; JN.ready = true; JN.update('x', { notes: 'a'.repeat(5000), mood: 'evil', tags: ['FOMO', '<script>', 'plan'] }); const e = JN.entries[0]; assert.strictEqual(e.notes.length, 2000); assert.strictEqual(e.mood, ''); assert.deepStrictEqual(e.tags, ['FOMO', 'plan']); });

/* ───────── replay challenges ───────── */
const sb2 = { NT, console, Math, JSON, Date, String, Number, Array, Object, localStorage: { s: {}, getItem(k) { return this.s[k] || null; }, setItem(k, v) { this.s[k] = v; } } };
vm.createContext(sb2); vm.runInContext(fs.readFileSync(__dirname + '/../src/challenge.js', 'utf8') + '\nthis.Challenge = Challenge;', sb2);
const CH = sb2.Challenge;
t('challenge: daily seed is deterministic per date and differs across dates', () => { const a = CH.rng(CH.seed('exterm-daily-2026-11-08')), b = CH.rng(CH.seed('exterm-daily-2026-11-08')), c = CH.rng(CH.seed('exterm-daily-2026-11-09')); const x = [a(), a(), a()], y = [b(), b(), b()], z = [c(), c(), c()]; assert.deepStrictEqual(x, y); assert.notDeepStrictEqual(x, z); });
t('challenge: game rules (no double buy, fees, auto-close at the end)', () => {
  const c = market(CH.SHOW + CH.PLAY, 4), g = new CH.Game(c);
  assert.strictEqual(g.i, CH.SHOW - 1); assert.strictEqual(g.visible().length, CH.SHOW);
  assert.ok(g.buy()); assert.ok(!g.buy()); const q = g.qty; assert.ok(q > 0 && g.cash === 0);
  g.step(5); assert.ok(g.sell()); assert.ok(!g.sell());
  g.buy(); g.step(10000); assert.ok(g.done); assert.strictEqual(g.qty, 0); assert.strictEqual(g.i, g.end - 1);
  const r = g.result(); assert.ok(Number.isFinite(r.mine) && Number.isFinite(r.bh) && r.score >= 0 && r.score <= 1000);
});
t('challenge: doing nothing scores below beating the market', () => { const c = market(CH.SHOW + CH.PLAY, 2, 0.003), idle = new CH.Game(c); idle.step(1e6); const hold = new CH.Game(c); hold.buy(); hold.step(1e6); assert.ok(!idle.result().beat); assert.ok(hold.result().mine > idle.result().mine); });
t('challenge: blind mode hides real prices and dates', () => { const c = market(200, 1).map((k) => Object.assign(k, { c: k.c * 1000, o: k.o * 1000, h: k.h * 1000, l: k.l * 1000 })), b = CH.blind(c); assert.ok(Math.abs(b[0].c - 100) < 1e-9); assert.ok(b[0].t !== c[0].t); assert.ok(b.every((k, i) => i === 0 || k.t > b[i - 1].t)); });
t('challenge: stats record streaks and keep only recent history', () => { for (let i = 0; i < 40; i++) CH.record({ beat: i >= 35, score: 600, edge: 1 }, { sym: 'BTC-USD', tf: '1h' }); const s = CH.stats(); assert.strictEqual(s.played, 40); assert.strictEqual(s.streak, 5); assert.strictEqual(s.hist.length, 30); });
t('challenge: refuses too little history', () => { assert.throws(() => new CH.Game(market(10, 1))); });

console.log(fails.length ? fails.map((f) => 'FAIL ' + f).join('\n') : '');
console.log(`${passed}/${passed + fails.length} passed`);
process.exit(fails.length ? 1 : 0);
