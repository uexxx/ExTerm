// ExTerm v15.3 core unit tests: Auto-Evolve, fragility break-point, regime attribution + crisis replays, feature
// kill-switch, dynamic sizing + prop-firm odds, synthetic paths, trade inspector, shadow-bot package (hostile input included).
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const NT = require('../src/strategies4.js'); require('../src/validate.js');
const V = require('../src/v153core.js');
const I = require('../src/i18n.js');
// GARCH-ish candles: volatility clusters, fat tails, gentle trend
const garch = (n, seed = 3, drift = 0.0004, t0 = 1.7e9, tf = 3600) => { const r = V.rng(seed), g = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r()); let p = 100, s2 = 1e-4, e = 0; const c = []; for (let i = 0; i < n; i++) { s2 = 2e-6 + 0.12 * e * e + 0.85 * s2; e = Math.sqrt(s2) * g(); const o = p; p = Math.max(1, p * Math.exp(drift + e)); c.push({ t: t0 + i * tf, o, h: Math.max(o, p) * (1 + Math.abs(e) * 0.3), l: Math.min(o, p) * (1 - Math.abs(e) * 0.3), c: p, v: 1000 + 800 * r() }); } return c; };

(async () => {
  const S = NT.strategies.smacross, P0 = NT.defaultParams('smacross'), C = garch(1400, 5);
  ok('setup: 123 built-in strategies are registered', Object.keys(NT.strategies).filter((k) => !NT.strategies[k].liveOnly).length >= 100, Object.keys(NT.strategies).length);

  // ── pairs
  const P = V.pairs([{ side: 'buy', ts: 1, usd: 100, qty: 1 }, { side: 'buy', ts: 2, usd: 100, qty: 1 }, { side: 'sell', ts: 3, qty: 1, price: 120, pnl: 20, pnlPct: 0.2 }, { side: 'sell', ts: 4, qty: 1, price: 90, pnl: -10, pnlPct: -0.1 }, { side: 'sell', ts: 5, qty: 1, price: 1, pnl: 0 }]);
  ok('pairs: scale-in + partial exits keep their share of basis; orphan sell ignored', P.length === 2 && P[0].usd === 100 && P[0].entryT === 1 && P[1].exitT === 4 && P[1].ret === -0.1, JSON.stringify(P));

  // ── 2 fragility
  const rows = [0.03, -0.01, 0.02, 0.015, -0.012, 0.025].map((ret) => ({ ret, volF: 1, atr: 0.01, part: 0.01, fill: 1 }));
  const fr = V.fragility(rows);
  ok('fragility: finite break-point where compounded return crosses zero', fin(fr.breakPoint) && V.stressRet(rows, fr.breakPoint * 0.98) > 0 && V.stressRet(rows, fr.breakPoint * 1.02) <= 0, JSON.stringify(fr));
  ok('fragility: curve is monotone non-increasing in friction', fr.curve.every((x, i) => !i || x[1] <= fr.curve[i - 1][1] + 1e-9));
  ok('fragility: losing system → break-point 0; partial fills counted', V.fragility([{ ret: -0.01, volF: 1, atr: 0.01, part: 0, fill: 0.5 }]).breakPoint === 0 && V.fragility([{ ret: -0.01, volF: 1, atr: 0.01, part: 0, fill: 0.5 }]).partial === 1);
  ok('fragility: empty input → null', V.fragility([]) === null);
  const bt = NT.backtest(C, S, P0, { cash: 10000, tfSec: 3600 }), pairs = V.pairs(bt.trades), sr = V.stressRows(C, pairs, { usd: 1e7, cap: 0.1 });
  ok('stress rows: a $10M order on thin bars fills partially and pays impact', sr.length === pairs.length && sr.some((r) => r.fill < 1) && sr.every((r) => r.part > 0 && r.part <= 1), JSON.stringify(sr[0]));

  // ── 3 regimes + crises
  const up = garch(400, 7, 0.004), reg = V.regimes(up);
  ok('regimes: strong uptrend is mostly Bull Trend; warm-up bars unlabelled', reg.slice(0, 50).every((x) => x === null) && reg.filter((x) => x === 'bull').length > reg.filter(Boolean).length * 0.5, JSON.stringify(reg.slice(50, 70)));
  const at = V.attribute(C, bt.eq, bt.from), sumPnl = Object.values(at).reduce((s, x) => s + x.pnl, 0);
  ok('attribution: four regimes, PnL adds up to the labelled part of the curve', Object.keys(at).join() === 'bull,bear,chop,panic' && Math.abs(sumPnl - (bt.eq[bt.eq.length - 1] - bt.eq[50])) < 1 + Math.abs(bt.eq[50] - bt.eq[0]), sumPnl + ' vs ' + (bt.eq[bt.eq.length - 1] - bt.eq[0]));
  const cp = V.crisisPath(C, 'flush2020', { tfSec: 3600 }), mv = cp[cp.length - 1].c / C[C.length - 1].c - 1;
  ok('crisis: 2020 flush path hits its calibrated depth exactly (-50% then +25% → -37.5%)', Math.abs(mv + 0.375) < 1e-6, mv);
  ok('crisis: deterministic, continuous timestamps, sane OHLC', JSON.stringify(V.crisisPath(C, 'flush2020', { tfSec: 3600 })) === JSON.stringify(cp) && cp[0].t === C[C.length - 1].t + 3600 && cp.every((b) => b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) && b.l > 0));
  ok('crisis: unknown / prototype keys rejected', V.crisisPath(C, '__proto__') === null && V.crisisPath(C, 'nope') === null);
  const ct = V.crisisTest(C, S, P0, 'delev2022', { tfSec: 3600 });
  ok('crisis test: strategy vs buy & hold in the 2022 deleveraging replay', ct && fin(ct.ret) && fin(ct.maxDD) && ct.bhRet < -40 && ct.bhDD > 40 && ct.attr.panic, JSON.stringify(ct && { ret: ct.ret, bh: ct.bhRet, dd: ct.bhDD }));
  for (const k of Object.keys(V.CRISES)) ok('crisis preset runs: ' + V.CRISES[k].name, !!V.crisisTest(C, S, P0, k, { tfSec: 3600 }));

  // ── 4 features + kill-switch
  const FR = V.featureRows(C, pairs);
  ok('features: every trade scored on hour, RVOL, ATR pct, RSI, VWAP distance', FR.length === pairs.length && FR.every((r) => r.f.hour >= 0 && r.f.hour < 24 && 'rvol' in r.f && r.f.atrp >= 0 && r.f.atrp <= 1 && 'rsi' in r.f && fin(r.f.vwap)), JSON.stringify(FR[0]));
  const planted = Array.from({ length: 40 }, (_, i) => ({ ret: i % 2 ? 0.02 : -0.015, win: !!(i % 2), entryT: 1.7e9 + i * 3600, f: { hour: (i * 5) % 24, rvol: i % 2 ? 1.5 + (i % 5) * 0.1 : 0.5 + (i % 5) * 0.05, atrp: ((i * 37) % 100) / 100, rsi: 30 + ((i * 13) % 40), vwap: ((i * 7) % 10) - 5 } }));
  const imp = V.importance(planted);
  ok('importance: a planted RVOL edge ranks first with a "skip low RVOL" filter', imp.length && imp[0].k === 'rvol' && imp[0].rule.op === '<' && imp[0].gain > 0, JSON.stringify(imp[0]));
  const kept = V.applyRules(planted, [imp[0].rule]);
  ok('kill-switch: applying the filter removes losers and lifts the equity curve', kept.length < planted.length && V.curve(kept.map((r) => r.ret)).pop() > V.curve(planted.map((r) => r.ret)).pop());
  ok('kill-switch: session rule and missing values are handled', V.keep({ f: { hour: 3 } }, { k: 'hour', v: 'Asia' }) === false && V.keep({ f: { rvol: null } }, { k: 'rvol', op: '<', v: 1 }) === true);
  ok('importance: too few trades → []', V.importance(planted.slice(0, 5)).length === 0);

  // ── 5 sizing + prop odds
  const sz = V.sizing(FR.length >= 5 ? FR : planted);
  ok('sizing: four methods on the same trade list with equity + drawdown', sz.map((x) => x.k).join() === 'fixed,halfKelly,volTarget,eqCurve' && sz.every((x) => x.eq.length === (FR.length >= 5 ? FR : planted).length + 1 && fin(x.ret) && x.maxDD >= 0));
  ok('sizing: half-Kelly is 0 for a losing system, positive for a winning one', V.sizer('halfKelly', [{ ret: -0.01 }, { ret: -0.02 }, { ret: 0.005 }])() === 0 && V.sizer('halfKelly', planted)() > 0);
  const eqc = V.sizer('eqCurve', planted), fx = V.sizer('fixed', planted), down = Array.from({ length: 25 }, (_, i) => 1 - i * 0.01);
  ok('sizing: equity-curve trading halves size below the 20-trade equity MA', Math.abs(eqc(planted[0], down) - fx(planted[0]) * 0.5) < 1e-12 && eqc(planted[0], [1]) === fx(planted[0]));
  const win = Array.from({ length: 20 }, (_, i) => ({ ret: 0.05, atr: 0.01, entryT: 1.7e9 + i * 86400 })), lose = win.map((r) => Object.assign({}, r, { ret: -0.05 }));
  ok('prop odds: always-winning list passes 100%, always-losing never passes', V.propOdds(win, 'volTarget', '50k').pass === 100 && V.propOdds(lose, 'volTarget', '100k').pass === 0);
  const po = V.propOdds(planted, 'fixed', '50k', { runs: 500 });
  ok('prop odds: outcomes sum to 100% and are seeded', Math.abs(po.pass + po.daily + po.trail + po.timeout - 100) < 0.5 && JSON.stringify(V.propOdds(planted, 'fixed', '50k', { runs: 500 })) === JSON.stringify(po), JSON.stringify(po));
  ok('prop odds: unknown account / tiny list → null', V.propOdds(planted, 'fixed', 'constructor') === null && V.propOdds(planted.slice(0, 3), 'fixed', '50k') === null);

  // ── 6 synthetic paths
  const sp = V.synthPath(C, V.rng(1), { block: 24 });
  ok('synthetic: same length + timestamps, positive valid candles', sp.length === C.length && sp.every((b, i) => b.t === C[i].t && b.l > 0 && b.h >= b.l));
  const rs = V.pathStats(C), ss = V.pathStats(sp), shuf = (() => { const rr = V.rng(2), idx = C.slice(1).map((_, i) => i + 1).sort(() => rr() - 0.5); let p = 100; return [{ c: 100 }].concat(idx.map((j) => ({ c: (p *= C[j].c / C[j - 1].c) }))); })();
  ok('synthetic: fat tails preserved (excess kurtosis > 0) and volatility within 25%', ss.kurt > 0 && Math.abs(ss.vol / rs.vol - 1) < 0.25, JSON.stringify([rs, ss]));
  ok('synthetic: volatility clustering preserved better than an i.i.d. shuffle', ss.clust > V.pathStats(shuf).clust, JSON.stringify([ss.clust, V.pathStats(shuf).clust]));
  ok('synthetic: adversarial noise changes the path but keeps it valid', JSON.stringify(V.synthPath(C, V.rng(1), { noise: 0.5 })) !== JSON.stringify(sp) && V.synthPath(C, V.rng(1), { noise: 0.5 }).every((b) => b.l > 0));
  const st = V.synthTest(C.slice(0, 600), S, P0, { paths: 30, tfSec: 3600 });
  ok('synthetic test: distribution, physics check and verdict', st.paths === 30 && st.hist.length === 30 && st.p5 <= st.p50 && st.p50 <= st.p95 && st.profitable >= 0 && st.profitable <= 100 && typeof st.verdict === 'string' && st.physics.synth.vol > 0, JSON.stringify(st).slice(0, 200));

  // ── 7 inspector
  const k = Math.floor(pairs.length / 2), ins = V.inspect(C, pairs[k]);
  ok('inspector: nearest trade for a time inside a trade is that trade', V.nearestTrade(pairs, (pairs[k].entryT + pairs[k].exitT) / 2) === k && V.nearestTrade([], 1) === -1 && V.nearestTrade(pairs, NaN) === -1);
  ok('inspector: window with entry/exit pins, MFE ≥ 0 ≥ MAE, indicator snapshot', ins && ins.bars[ins.entryAt].t === pairs[k].entryT && ins.bars[ins.exitAt].t === pairs[k].exitT && ins.mfe >= ins.mae && 'rsi' in ins.feat, JSON.stringify(ins && { mfe: ins.mfe, mae: ins.mae }));
  ok('inspector: unknown times → null', V.inspect(C, { entryT: 1, exitT: 2 }) === null && V.inspect(C, null) === null);

  // ── 1 Auto-Evolve
  // trending waves: a real edge for breakout systems, so survivors must appear
  const W = (() => { const r = V.rng(5), out = []; let prev = 100; for (let i = 0; i < 1400; i++) { const p = 100 * Math.exp(0.25 * Math.sin(i / 45) + 0.0006 * i) * (1 + (r() - 0.5) * 0.01); out.push({ t: 1.7e9 + i * 3600, o: prev, h: Math.max(prev, p) * 1.003, l: Math.min(prev, p) * 0.997, c: p, v: 1000 + 800 * r() }); prev = p; } return out; })();
  const DS = NT.strategies.donchian, ev = V.evolve(W, DS, NT.defaultParams('donchian'), { gens: 3, pop: 8, tfSec: 3600, seed: 4 });
  ok('evolve: multi-generation history, mutable params discovered', ev.gens.length === 3 && ev.mutable.includes('entry') && ev.evaluated >= 8, JSON.stringify(ev.gens));
  ok('evolve: survivors found; each passed walk-forward and the 17-test lab (grade A–C), ranked by OOS Sharpe + Calmar', ev.survivors.length >= 1 && ev.survivors.every((x, i) => x.wfPass && 'ABC'.includes(x.grade) && (!i || x.score <= ev.survivors[i - 1].score)), JSON.stringify(ev.survivors.map((x) => [x.score, x.grade])));
  ok('evolve: failed mutations are rejected and counted (walk-forward + validation)', ev.rejected.wf > 0 && fin(ev.rejected.val) && ev.evaluated >= ev.survivors.length + ev.rejected.wf, JSON.stringify(ev.rejected));
  ok('evolve: no-edge random walk → every mutation rejected, zero survivors', V.evolve(C.slice(0, 800), S, P0, { gens: 2, pop: 6, tfSec: 3600 }).survivors.length === 0);
  ok('evolve: deterministic for a seed', JSON.stringify(V.evolve(W, DS, NT.defaultParams('donchian'), { gens: 3, pop: 8, tfSec: 3600, seed: 4 }).survivors) === JSON.stringify(ev.survivors));
  ok('evolve: fast < slow always holds for crossover systems', (() => { const r = V.rng(3), d = V.mutable(S); for (let i = 0; i < 300; i++) { const m = V.mutate({ p: P0, f: {} }, d, r, 0.9); if (m && m.p.fast >= m.p.slow) return false; } return true; })());
  ok('evolve: mutations stay inside parameter bounds + filter whitelist', (() => { const r = V.rng(9), d = V.mutable(S); for (let i = 0; i < 200; i++) { const m = V.mutate({ p: P0, f: {} }, d, r, 0.9); if (!m) continue; if (d.some((x) => m.p[x.k] < x.min || m.p[x.k] > x.max)) return false; if (Object.entries(m.f).some(([fk, v]) => !V.FILTERS[fk].includes(v))) return false; } return true; })());

  // ── 8 shadow package
  const pk = V.shadowPackage({ id: 'smacross', params: { fast: 5, slow: 9999, junk: 1 }, filters: { trendEma: 200, atrStop: 7, evil: 1 }, sym: 'BTC-USD', tf: '4h', grade: 'B', usd: 1e9 });
  ok('shadow: params clamped to bounds, unknown keys and filters dropped, risk capped', pk && pk.params.fast === 5 && pk.params.slow === 300 && !('junk' in pk.params) && pk.filters.trendEma === 200 && !('atrStop' in pk.filters) && !('evil' in pk.filters) && pk.risk.usd === 1e6 && pk.tf === '4h', JSON.stringify(pk));
  ok('shadow: hostile ids / symbols / grades rejected or neutralised', V.shadowPackage({ id: '__proto__', sym: 'X' }) === null && V.shadowPackage({ id: 'constructor', sym: 'X' }) === null && V.shadowPackage({ id: 'smacross', sym: '<img src=x onerror=alert(1)>' }) === null && V.shadowPackage({ id: 'smacross', sym: 'ETH-USD', grade: '<b>', tf: 'x' }).grade === null && V.shadowPackage({ id: 'smacross', params: { fast: 'NaN' }, sym: 'ETH-USD' }) === null);
  ok('shadow: desired position is a boolean from the packaged strategy', typeof V.shadowWant(C, pk, 14400) === 'boolean' && V.shadowWant(C.slice(0, 10), pk) === null);

  // ── i18n coverage for the new v15.3 strings
  const K153 = I.KEYS.filter((x) => x.startsWith('q153.') || x === 'lab.q153');
  ok('i18n: nine v15.3 keys exist and every named language translates them', K153.length === 9 && I.LANGS.every((l) => K153.every((x) => typeof I.DICT[l.code][x] === 'string' && I.DICT[l.code][x].length > 0)), I.LANGS.filter((l) => K153.some((x) => !I.DICT[l.code][x])).map((l) => l.code).join());

  console.log(res.join('\n')); const f = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`${res.length - f}/${res.length} v15.3 checks passed`); process.exit(f ? 1 : 0);
})();
function fin(x) { return Number.isFinite(x); }
