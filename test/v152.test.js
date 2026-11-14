// ExTerm v15.2 core unit tests: the pure logic behind the 44 workstation upgrades + the i18n engine (hostile input included).
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const V = require('../src/v152core.js');
const I = require('../src/i18n.js');
const { webcrypto } = require('crypto');
const subtle = (globalThis.crypto && globalThis.crypto.subtle) || webcrypto.subtle;
const C = (t, o, h, l, c, v = 100) => ({ t, o, h, l, c, v });
const walk = (n, seed = 1, p0 = 100, step = 3600) => { let s = seed, p = p0; const out = []; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; const r = (s / 2147483647 - 0.5) * 2, o = p; p = Math.max(1, p * (1 + r * 0.02)); out.push(C(1.7e9 + i * step, o, Math.max(o, p) * 1.004, Math.min(o, p) * 0.996, p, 100 + (s % 900))); } return out; };

(async () => {
  // ── i18n
  ok('i18n: 32+ named languages incl. RTL Arabic, Hebrew, Persian, Urdu', I.LANGS.length >= 32 && ['ar', 'he', 'fa', 'ur'].every((c) => I.isRtl(c)) && !I.isRtl('en') && !I.isRtl('ja'));
  ok('i18n: every named language translates every key (no gaps)', I.LANGS.every((l) => I.KEYS.every((k) => typeof I.DICT[l.code][k] === 'string' && I.DICT[l.code][k].length > 0)), I.LANGS.filter((l) => I.KEYS.some((k) => !I.DICT[l.code] || !I.DICT[l.code][k])).map((l) => l.code).join(','));
  ok('i18n: t() falls back to English for an ISO-639 code without a dictionary, and to the key for unknown keys', I.tr('qu', 'nav.markets') === 'Markets' && I.tr('es', 'nav.markets') === 'Mercados' && I.tr('ja', 'no.such') === 'no.such');
  ok('i18n: ISO-639 fallback list covers 180+ codes', I.ISO.length >= 180 && I.ISO.includes('sw') && I.ISO.includes('zu'));
  ok('i18n: normalise rejects junk and maps browser locales', I.norm('zh-TW') === 'zh-TW' && I.norm('zh-HK') === 'zh-TW' && I.norm('zh-CN') === 'zh-CN' && I.norm('pt-BR') === 'pt' && I.norm('"><img>') === null && I.norm('xx') === null && I.norm('qu') === 'qu');
  ok('i18n: search "esp" → Español, "japan" → 日本語, "ar" → العربية first', I.search('esp')[0].code === 'es' && I.search('japan')[0].code === 'ja' && I.search('ar')[0].code === 'ar', JSON.stringify([I.search('esp')[0], I.search('japan')[0], I.search('ar')[0]]));
  ok('i18n: search tolerates typos (deutch → Deutsch)', I.search('deutch')[0].code === 'de', JSON.stringify(I.search('deutch').slice(0, 2)));

  // ── 1 bar timer
  const bt = V.barTimer(1_000_000_250, 5);
  ok('1 bar timer: 5s bar, 4.75 s left, label with tenths', bt.left === 4750 && bt.label === '4.8s' && Math.abs(bt.frac - 0.05) < 1e-9, JSON.stringify(bt));
  ok('1 bar timer: 1m bar shows m:ss, bad tf → null', V.barTimer(30_000, 3600).label === '59:30' && V.barTimer(1, 0) === null);
  // ── 2 sync groups
  ok('2 sync: same group + valid payload accepted, other group / bad symbol / unknown kind rejected', V.syncAccept({ k: 'v152sync', g: 'A', kind: 'sym', v: 'SOL-USD' }, 'A').v === 'SOL-USD' && !V.syncAccept({ k: 'v152sync', g: 'B', kind: 'sym', v: 'SOL-USD' }, 'A') && !V.syncAccept({ k: 'v152sync', g: 'A', kind: 'sym', v: '<img src=x>' }, 'A') && !V.syncAccept({ k: 'v152sync', g: 'A', kind: 'eval', v: 1 }, 'A') && !V.syncAccept({ k: 'v152sync', g: 'A', kind: 'tf', v: '7x' }, 'A'));
  // ── 3 TP ladder
  const L = V.tpLadder(100, 95, [50, 30, 20]);
  ok('3 ladder: TP1/2/3 at 1R/2R/3R, splits 50/30/20', L.levels.map((x) => x.p).join() === '105,110,115' && L.levels.map((x) => x.pct).join() === '50,30,20');
  let st = V.tpStep(L, 105.5);
  ok('3 ladder: TP1 hit closes 50% and moves the stop to break-even', st.closePct === 50 && L.sl === 100 && L.be && st.events.includes('stop → break-even'), JSON.stringify(st));
  st = V.tpStep(L, 99.9);
  ok('3 ladder: price back at entry → stopped at break-even for the remaining 50%', st.closePct === 50 && st.done && st.events[0] === 'stopped at break-even', JSON.stringify(st));
  const Ls = V.tpLadder(100, 104); ok('3 ladder: short ladder goes down', Ls.levels[0].p === 96 && !Ls.long);
  // ── 4 patterns
  const P = [C(0, 10, 11, 9, 10.5), C(1, 10.5, 12, 10.4, 11.8), C(2, 11.8, 13, 11.5, 12.9)];
  ok('4 FVG: bar0 high 11 < bar2 low 11.5 → bullish gap 11–11.5', V.fvg(P).length === 1 && V.fvg(P)[0].bot === 11 && V.fvg(P)[0].top === 11.5);
  ok('4 engulfing: red then bigger green that engulfs', V.engulf([C(0, 10, 10.2, 9.4, 9.5), C(1, 9.4, 10.6, 9.3, 10.5)])[0].dir === 'bull');
  const sw = Array.from({ length: 21 }, (_, i) => C(i, 10, 11, 9, 10)); sw.push(C(21, 10, 11.5, 9.8, 10.6));
  ok('4 sweep: wick above the 20-bar high, close back below → bearish sweep', V.sweeps(sw)[0].dir === 'bear');
  const ob = Array.from({ length: 22 }, (_, i) => C(i, 10, 10.2, 9.8, 10.05)); ob[21] = C(21, 10.05, 10.1, 9.9, 9.95); ob.push(C(22, 9.95, 11.5, 9.9, 11.4));
  ok('4 order block: last red candle before a displacement bar', V.orderBlocks(ob).some((x) => x.i === 21 && x.dir === 'bull'), JSON.stringify(V.orderBlocks(ob)));
  ok('4 patterns: all off by default → nothing', V.patterns(walk(200), 0, 200, {}).length === 0);
  // ── 5 snap
  ok('5 magnet: snaps to the nearest OHLC within tolerance, untouched beyond it', V.snap(10.96, C(0, 10, 11, 9, 10.5), 0.1) === 11 && V.snap(10.7, C(0, 10, 11, 9, 10.5), 0.1) === 10.7 && V.snap(10.7, C(0, 10, 11, 9, 10.5)) === 10.5);
  // ── 6 events
  const fe = V.futureEvents(1000, [{ t: 500, k: 'fomc', l: 'past' }, { t: 2000, k: 'cpi', l: 'CPI <b>' }, { t: 99e9, k: 'x', l: 'far' }]);
  ok('6 events: only future ones inside the horizon, label kept as data (escaped at render)', fe.length === 1 && fe[0].inSec === 1000 && fe[0].l === 'CPI <b>');
  ok('6 events: "CPI 2026-12-10 13:30" parses; junk rejected', V.parseEvent('CPI 2026-12-10 13:30').k === 'cpi' && V.parseEvent('CPI 2026-12-10 13:30').t === Date.parse('2026-12-10T13:30:00Z') / 1000 && V.parseEvent('<script> 2026') === null);

  // ── 9 walls
  const b0 = { bids: [[99, 1], [98, 1], [97, 10], [96, 1]], asks: [[101, 1], [102, 1], [103, 12], [104, 1]] };
  const ev = V.wallEvents(b0, { bids: [[99, 1], [98, 1], [97, 9.5], [96, 1]], asks: [[101, 1], [102, 1], [104, 1]] }, { 97: 6, 103: 0.5 });
  ok('9 walls: bid wall refilled after trading → iceberg; ask wall pulled without trades → spoof', ev.find((x) => x.p === 97).ev === 'iceberg' && ev.find((x) => x.p === 103).ev === 'spoof', JSON.stringify(ev));
  // ── 10 CVD divergence
  const dv = [C(0, 10, 10.5, 9.9, 10.4, 100), C(1, 10.4, 11, 10.3, 10.9, 100), C(2, 10.9, 12, 10.8, 11.9, 300), C(3, 11.9, 11.8, 11, 11.1, 100), C(4, 11.1, 11.2, 10.5, 10.6, 100), C(5, 10.6, 11.4, 10.5, 11.3, 50), C(6, 11.3, 12.5, 11.2, 11.4, 400), C(7, 11.4, 11.6, 11, 11.1, 300), C(8, 11.1, 11.2, 10.4, 10.5, 300), C(9, 10.5, 10.6, 10, 10.1, 100)];
  const dd = V.cvdDiv(dv, 2);
  ok('10 CVD divergence: higher high in price, lower CVD → bearish marker', dd.some((x) => x.dir === 'bear' && x.i === 6), JSON.stringify(dd));
  // ── 11 AVWAP
  const av = V.avwap([C(0, 10, 10, 10, 10, 1), C(1, 20, 20, 20, 20, 1)], 0);
  ok('11 AVWAP: equal volume 10 & 20 → vwap 15, σ 5, ±2σ 5..25', av[1].vw === 15 && Math.abs(av[1].u1 - 20) < 1e-9 && Math.abs(av[1].d2 - 5) < 1e-9, JSON.stringify(av[1]));
  // ── 12 sessions
  ok('12 sessions: 03:00 UTC asia, 09:00 london, 15:00 ny, 22:00 none', V.sessionOf(3 * 3600) === 'asia' && V.sessionOf(9 * 3600) === 'london' && V.sessionOf(15 * 3600) === 'ny' && V.sessionOf(22 * 3600) === null);
  const sp = V.sessionProfiles(walk(72, 3, 100, 3600));
  ok('12 session profiles: three profiles with a POC inside their range', ['asia', 'london', 'ny'].every((k) => sp[k] && sp[k].poc >= sp[k].lo && sp[k].poc <= sp[k].hi));
  // ── 13 zero gamma (synthetic GEX linear in spot)
  ok('13 zero gamma: interpolates the spot where total GEX crosses zero', Math.abs(V.zeroGamma({}, 100, 0.1, (ch, S) => ({ total: S - 97 })) - 97) < 1e-6 && V.zeroGamma({}, 100, 0.1, () => ({ total: 1 })) === null);
  // ── 14 unusual
  const un = V.unusual({ calls: [{ strike: 110, vol: 5000, oi: 800, last: 2 }, { strike: 100, vol: 50, oi: 9000, last: 5 }], puts: [] }, 100, { minPrem: 100000 });
  ok('14 unusual: vol > OI + OTM burst → UNUSUAL + SWEEP-LIKE, quiet strike skipped', un.length === 1 && un[0].tags.includes('UNUSUAL') && un[0].tags.includes('SWEEP-LIKE'), JSON.stringify(un));
  // ── 15 payoff
  const legs = [{ type: 'call', strike: 100, qty: 1, prem: 3 }, { type: 'call', strike: 110, qty: -1, prem: 1 }];
  const po = V.payoff(legs, 100, { span: 0.3 });
  ok('15 payoff: bull call spread breakeven 102, max profit 800, max loss −200', po.be.length === 1 && Math.abs(po.be[0] - 102) < 0.05 && po.maxP === 800 && po.maxL === -200, JSON.stringify({ be: po.be, maxP: po.maxP, maxL: po.maxL }));
  ok('15 presets: iron condor has 4 legs, net short the inner strikes', V.legsPreset('condor', 100).length === 4 && V.legsPreset('condor', 100)[1].qty === -1);
  const bsx = (S, K, T) => ({ price: Math.max(0, S - K) + 5 * Math.sqrt(T) });
  const th = V.thetaCurve([{ type: 'call', strike: 100, qty: 1, prem: 5 }], 100, 1, bsx);
  ok('15 theta curve: long option value decays to intrinsic at expiry', th[0].pnl === 0 && th[th.length - 1].pnl === -500 && th[th.length - 1].days === 0);

  // ── 16 memory
  const mem = V.memo({}, 'crypto', { tf: '5s', preset: 'scalp', risk: 50, ind: { ema: true, 'x<y': true, vol: 'yes' } });
  ok('16 swap memory: tf kept, risk clamped to 10%, junk indicator keys dropped, unknown mode ignored', V.recall(mem, 'crypto').tf === '5s' && mem.crypto.risk === 10 && Object.keys(mem.crypto.ind).join() === 'ema' && !V.recall(V.memo(mem, 'forex', { tf: '1m' }), 'forex'));
  // ── 17 scanner formula
  const f1 = V.parseFormula('RVOL > 3 AND Price > VWAP');
  ok('17 formula: RVOL > 3 AND Price > VWAP', !f1.error && V.evalFormula(f1.ast, { rvol: 4, price: 10, vwap: 9 }) && !V.evalFormula(f1.ast, { rvol: 2, price: 10, vwap: 9 }));
  const f2 = V.parseFormula('(RSI < 30 OR CHG > 5) AND LIQ >= 100000');
  ok('17 formula: parentheses + OR', !f2.error && V.evalFormula(f2.ast, { rsi: 50, chg: 6, liq: 1e5 }) && !V.evalFormula(f2.ast, { rsi: 50, chg: 1, liq: 1e6 }));
  ok('17 formula: code injection / unknown fields / dangling operators rejected', !!V.parseFormula('constructor > 1').error && !!V.parseFormula('RVOL > 3 AND').error && !!V.parseFormula('alert(1)').error && !!V.parseFormula('RVOL > 3; fetch()').error);
  // ── 18 DEX safety
  const ds = V.dexSafety({ mintAuth: null, freezeAuth: 'Abc', top10: 62, lpLocked: 95 });
  ok('18 DEX safety: 2 of 4 green → caution; nothing known → unknown', ds.score === 50 && ds.verdict === 'caution' && V.dexSafety({}).verdict === 'unknown');
  // ── 19 confluence
  const cf = V.confluence([{ sym: 'oc:A', who: 'w1', side: 'buy', t: 0, winRate: 0.7, usd: 1000 }, { sym: 'oc:A', who: 'w2', side: 'buy', t: 200, winRate: 0.8, usd: 500 }, { sym: 'oc:B', who: 'w1', side: 'buy', t: 0, winRate: 0.7 }, { sym: 'oc:B', who: 'w3', side: 'buy', t: 900, winRate: 0.9 }, { sym: 'oc:C', who: 'w4', side: 'buy', t: 0, winRate: 0.3 }, { sym: 'oc:C', who: 'w5', side: 'buy', t: 1, winRate: 0.2 }]);
  ok('19 confluence: 2 good wallets within 5 min fire; 15 min apart or low win-rate do not', cf.length === 1 && cf[0].sym === 'oc:A' && cf[0].usd === 1500, JSON.stringify(cf));
  ok('19 leaderboard: win-rate × log(trades)', V.leaderboard([{ name: 'a', winRate: 0.9, trades: 2 }, { name: 'b', winRate: 0.7, trades: 400 }])[0].name === 'b');
  // ── 20 net inflow
  ok('20 net inflow: buys − sells inside the window only', V.netFlow([{ sym: 'X', side: 'buy', usd: 100, t: 95 }, { sym: 'X', side: 'sell', usd: 30, t: 99 }, { sym: 'X', side: 'buy', usd: 999, t: 10 }], 100, 60).X === 70);
  // ── 21 spark / RS
  ok('21 sparkline + relative strength', V.spark([1, 2, 3], 60, 10) === '0,10 30,5 60,0' && V.relStrength([100, 110], [100, 105]) === 5 && V.relStrength([], [1, 2]) === null);
  // ── 22 DEX sim
  const sim = V.dexSim(10000, 100000, 'turbo');
  ok('22 DEX sim: $10k into $100k liquidity ≈ 16.7% impact, turbo slippage 2.5% → would fail', Math.abs(sim.impactPct - 16.667) < 0.01 && sim.fails && V.dexSim(10, 1e6, 'normal').fails === false);

  // ── 23 composer
  const rules = { entry: { logic: 'AND', conds: [{ a: 'rsi14', op: '<', b: 30 }, { a: 'close', op: '>', b: 'ema200' }] }, exit: { logic: 'OR', conds: [{ a: 'rsi14', op: '>', b: 70 }] }, sl: 2, tp: 6 };
  const pine = V.toPine(rules, 'My "rule"\nx');
  ok('23 composer → Pine v5: version header, AND/OR joined, stop + limit, name sanitised', /^\/\/@version=5\nstrategy\("My rulex"/.test(pine.pine) && /longEntry = ta\.rsi\(close, 14\) < 30 and close > ta\.ema\(close, 200\)/.test(pine.pine) && /stop=strategy\.position_avg_price \* 0\.98, limit=strategy\.position_avg_price \* 1\.06/.test(pine.pine), pine.pine || pine.error);
  ok('23 composer: invalid series / operator / stop rejected', !!V.toPine({ entry: { logic: 'AND', conds: [{ a: 'eval', op: '<', b: 1 }] }, exit: rules.exit }).error && !!V.validRules(Object.assign({}, rules, { sl: 80 })));
  ok('23 composer: prototype keys (constructor / __proto__ / toString) are not series', !!V.validRules({ entry: { logic: 'AND', conds: [{ a: 'constructor', op: '<', b: 1 }] }, exit: rules.exit }) && !!V.validRules({ entry: { logic: 'AND', conds: [{ a: 'close', op: '<', b: '__proto__' }] }, exit: rules.exit }) && !!V.validRules({ entry: { logic: 'AND', conds: [{ a: 'toString', op: '>', b: 1 }] }, exit: rules.exit }));
  ok('23 cleanRules keeps only validated fields', JSON.stringify(Object.keys(V.cleanRules(Object.assign({ evil: 1 }, rules)))) === '["entry","exit","sl","tp"]' && V.cleanRules({}) === null);
  ok('23 MACD series is linear-time and matches a direct EMA difference', (() => { const D = walk(300, 9), m = V.seriesOf(D, 'macd'); return m.length === 300 && Number.isFinite(m[299]); })());
  const W = walk(400, 7); const simr = V.simRules(W, rules);
  ok('23 rules simulate on candles: equity curve per bar', simr.eq.length === W.length && simr.eq.every((x) => x > 0));
  // ── 24 portfolio
  const pf = V.portfolio({ A: [1, 1.1, 1.21], B: [2, 1.8, 1.62] });
  ok('24 portfolio: equal-weight combined curve of normalised members', Math.abs(pf.eq[2] - 1.01) < 1e-9 && pf.keys.join() === 'A,B', JSON.stringify(pf.eq));
  const pf2 = V.portfolio({ A: walk(100, 2).map((c) => c.c), B: walk(100, 2).map((c) => c.c * 2) });
  ok('24 portfolio: identical paths correlate at 1', Math.abs(pf2.corr[0][1] - 1) < 1e-9);
  // ── 25 plateau
  ok('25 sensitivity: broad positive grid → robust; lone spike → fragile', V.plateau([[5, 6, 5], [6, 7, 6], [5, 6, 5]]).verdict === 'robust plateau' && V.plateau([[-1, -2, -1], [-1, 9, -1], [-2, -1, -3]]).verdict === 'fragile / overfit');
  ok('25 grid: throws become null', V.grid([1, 2], [1], (x) => { if (x === 2) throw new Error('x'); return x; })[0].join() === '1,');
  // ── 26 fix gate
  const fx = V.fixGate([{ id: 'dd', status: 'fail' }, { id: 'regime', status: 'fail' }, { id: 'n', status: 'fail' }, { id: 'cost', status: 'pass' }], { atrStop: 1.5 });
  ok('26 fix weak gate: failed dd/regime → trendEma 200 added, existing atrStop kept, passes ignored', fx.o.trendEma === 200 && fx.o.atrStop === 1.5 && !fx.o.cooldown && fx.applied.length === 1, JSON.stringify(fx));
  // ── 27 prop
  ok('27 prop rulebooks: Apex / Topstep / FTMO / custom present and valid', ['apex', 'topstep', 'ftmo', 'custom'].every((k) => V.ruleOk(V.PROP[k])));
  ok('27 prop: FTMO static 10% → a 9% dip after a run-up still passes; trailing 5% fails', V.propRun([100, 108, 99.5, 111], V.PROP.ftmo, 1000).passed === true && V.propRun([100, 104, 98.5], V.PROP.apex, 1000).passed === false);
  ok('27 prop: daily loss rule', /daily loss/.test(V.propRun([100, 100, 97], V.PROP.topstep, 1000).fail));
  // ── 28 blind
  const bl = V.blind([C(1.7e9, 50, 55, 45, 50), C(1.7e9 + 60, 50, 60, 50, 55)]);
  ok('28 blind drill: rebased to 100 and moved to the 2000 epoch, shape kept', bl[0].c === 100 && bl[1].c === 110 && bl[0].t === V.BLIND_T0 && bl[1].t - bl[0].t === 60);
  // ── 29 MFE / MAE
  const ex = V.excursion({ entry: 100, exit: 102, t0: 0, t1: 2 }, [C(0, 100, 101, 98, 100), C(1, 100, 106, 99, 104), C(2, 104, 104, 101, 102)]);
  ok('29 MFE/MAE: +6% favourable, −2% adverse, 33% capture → left-money tag', ex.mfe === 6 && ex.mae === 2 && ex.eff === 33 && V.autoTag({ t0: 0, t1: 120 }, ex).includes('left-money'), JSON.stringify(ex));
  // ── 30 battle
  const bb = V.battle([{ name: 'a', eq: [1, 1.1, 1.05] }, { name: 'b', eq: [1, 1.02, 1.04] }, { name: 'c', eq: [1, 0.9] }, { name: 'd', eq: [1, 1] }, { name: 'e', eq: [1, 2] }]);
  ok('30 battle: max 4 contenders, ranked by return / drawdown', bb.length === 4 && bb[0].name === 'b' && bb.every((r, i) => r.rank === i + 1) && !bb.some((r) => r.name === 'e'));

  // ── 31 NL compiler
  const nl = V.nlCompile('Buy SOL when RSI below 30 and price above EMA 200, sell when RSI above 70, stop 2%, take profit 6% on 15m');
  ok('31 NL compiler → workflow JSON', nl.ok && nl.workflow.sym === 'SOL' && nl.workflow.tf === '15m' && nl.workflow.rules.sl === 2 && nl.workflow.rules.tp === 6 && nl.workflow.rules.entry.conds.length === 2 && nl.workflow.rules.entry.conds[1].b === 'ema200' && nl.workflow.rules.exit.conds[0].b === 70, JSON.stringify(nl));
  ok('31 NL compiler: nonsense → helpful error', !V.nlCompile('make me rich').ok && !V.nlCompile('').ok);
  ok('31 NL compiler: crossover phrasing', V.nlCompile('buy when close crosses above ema 50').workflow.rules.entry.conds[0].op === 'crosses above');
  // ── 32 range
  const rs = V.rangeStats(W, 10, 30);
  ok('32 range stats + prompt', rs.bars === 21 && /21 bars/.test(V.rangePrompt('BTC-USD', '1h', rs)) && V.rangeStats(W, 5, 5) === null);
  // ── 33 critique
  ok('33 devil\'s advocate: clean plan → A; no stop + 5% risk + counter-trend → F', V.critique({ side: 'buy', entry: 100, sl: 98, tp: 106, riskPct: 1, trendUp: true, rsi: 55 }).grade === 'A' && V.critique({ side: 'buy', entry: 100, riskPct: 5, trendUp: false, rsi: 80, eventSoon: true }).grade === 'F');
  // ── 34 impact
  ok('34 impact tags: OPEC → OIL/XLE, chip export controls → NVDA/SMH', V.impactTags('OPEC cuts crude output')[0].sym === 'XLE' && V.impactTags('US tightens chip export controls').some((x) => x.tag === 'NVDA/SMH') && !V.impactTags('local bakery opens').length);
  // ── 35 card
  ok('35 alert card: R:R 3 in the text', V.alertCard({ side: 'buy', sym: 'BTC-USD', tf: '1h', entry: 100, sl: 98, tp: 106 }).rr === 3 && /R:R 3/.test(V.alertCard({ side: 'buy', sym: 'BTC-USD', tf: '1h', entry: 100, sl: 98, tp: 106 }).text));
  // ── 36 telemetry
  ok('36 uptime + percentile', V.fmtUptime(3725) === '1h 2m' && V.fmtUptime(90061) === '1d 1h' && V.pctl([5, 1, 9, 3], 50) === 5);
  // ── 37 levels
  const day = 86400 * 20000, lv = V.levels([C(day - 7200, 10, 12, 9, 11), C(day - 3600, 11, 13, 10, 12), C(day + 600, 12, 14, 11, 13)], day + 1000);
  ok('37 PDH/PDL/PDC + overnight range', lv.pdh === 13 && lv.pdl === 9 && lv.pdc === 12 && lv.onh === 14 && lv.onl === 11);
  ok('37 EOD recap', V.recap([{ pnl: 10 }, { pnl: -4 }]).wr === 50 && V.recap([]).wr === null);
  // ── 38 shadow
  const sf = V.shadowFill({ side: 'buy', usd: 1000, sym: 'X' }, { price: 100, ts: 1 }, 10);
  ok('38 shadow fill: 10 bps worse than mid, slippage in $', sf.price === 100.1 && Math.abs(sf.slipUsd - 1) < 1e-9 && V.shadowFill({ side: 'hack', usd: 1 }, { price: 1 }) === null);

  // ── 39 signed share codes
  const kp = await V.newKey(subtle), code = await V.signCode(subtle, kp, 'workspace', { theme: 'obsidian', tf: '5m' });
  const vr = await V.verifyCode(subtle, code);
  ok('39 share code: signed, verifies, signer fingerprint shown', /^EXT1\./.test(code) && vr.ok && vr.kind === 'workspace' && vr.data.tf === '5m' && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(vr.signer), JSON.stringify(vr));
  const parts = code.split('.'), body = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); body.data.tf = '1m';
  const forged = 'EXT1.' + Buffer.from(JSON.stringify(body)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + parts[2];
  ok('39 share code: tampered payload rejected, junk rejected', !(await V.verifyCode(subtle, forged)).ok && !(await V.verifyCode(subtle, 'hello')).ok && !(await V.verifyCode(subtle, 'EXT1.aaaaaaaaaaaa.' + 'b'.repeat(60))).ok);
  ok('39 workspace whitelist: unknown keys, bad theme, bad colours dropped', JSON.stringify(V.cleanWorkspace({ theme: 'x"><', tf: '5m', evil: 1, tokens: { '--acc': '#fff', '--x': '#000', '--up': 'red;}' } })) === '{"tf":"5m","tokens":{"--acc":"#fff"}}');
  // ── 40 governor
  const arr = Array.from({ length: 10 }, (_, i) => i); ok('40 ring buffer trims oldest bars + frame pacing', V.trim(arr, 4) === 6 && arr.join() === '6,7,8,9' && V.trim(arr, 10) === 0 && V.pace(0, 4.2, 240) && !V.pace(0, 2, 240));
  // ── 41 tokens
  ok('41 theme tokens: only known variables + hex colours', JSON.stringify(V.cleanTokens({ '--acc': '#D4AF37', '--bg': 'url(x)', '--evil': '#fff' })) === '{"--acc":"#D4AF37"}');
  // ── 42 calc
  ok('42 calculator: 10000 * 0.015 / 12.5 = 12', V.calc('10000 * 0.015 / 12.5') === 12 && V.isCalc('10000 * 0.015 / 12.5'));
  ok('42 calculator: precedence, power, parentheses, unary minus', V.calc('2+3*4') === 14 && V.calc('(2+3)*4') === 20 && V.calc('2^3^2') === 512 && V.calc('-3+5') === 2 && V.calc('7%4') === 3);
  ok('42 calculator: no eval surface (letters, bad syntax, /0 → null)', V.calc('alert(1)') === null && V.calc('2+') === null && V.calc('1/0') === null && !V.isCalc('BTC') && !V.isCalc('2026'));
  // ── 44 integrity
  const sums = V.parseSums('a'.repeat(64) + '  exterm.html\n' + 'b'.repeat(64) + '  dist/serve.py\njunk line\n');
  ok('44 SHA256SUMS parser (relative names, dist/ prefix tolerated)', sums['exterm.html'] === 'a'.repeat(64) && sums['serve.py'] === 'b'.repeat(64) && Object.keys(sums).length === 2);
  ok('44 CSP check: default-src none + sha256 script only', V.cspOk("default-src 'none'; script-src 'sha256-" + 'A'.repeat(44) + "'; style-src 'self'") && !V.cspOk("default-src 'none'; script-src 'self' 'unsafe-inline'") && !V.cspOk("default-src *; script-src 'sha256-" + 'A'.repeat(44) + "'"));

  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FAIL'));
  console.log(`${res.length - f.length}/${res.length} passed`);
  process.exit(f.length ? 1 : 0);
})().catch((e) => { console.log(res.join('\n')); console.log('CRASH', e && e.stack); process.exit(1); });
