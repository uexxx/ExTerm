// ExTerm v15 phase 5 unit tests: DOM ladder + click-to-order, CVD, footprint, whale tape, Black-Scholes, Yahoo options
// parsing, max pain, GEX, paper options, ratio candles, correlation guard, sub-wallets, BroadcastChannel checks, wallet
// profiler, MTF matrix, auto-fibs, PDH/PDL, VPVR, sessions, events, walk-forward, Monte Carlo, Pine importer, arbitrage,
// liquidation bands, offline replay packs and encrypted .exterm backups.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const NT = require('../src/strategies4.js');
const P5 = require('../src/v15p5core.js');
const mk = (n, tf, f, t0 = 1.7e9) => { const c = []; let p = 100; for (let i = 0; i < n; i++) { const o = p; p = f(i, p); c.push({ t: t0 + i * tf, o, h: Math.max(o, p) * 1.002, l: Math.min(o, p) * 0.998, c: p, v: 100 + ((i * 7919) % 97) }); } return c; };

(async () => {
  /* ── 1. order flow ── */
  const book = { bids: [[99.98, 2], [99.95, 5], [99.9, 1]], asks: [[100.02, 3], [100.05, 4], [100.2, 8]] };
  const L = P5.ladder(book, 0.05, 10);
  ok('ladder: rows centred on the mid with bucketed sizes', L.rows.length === 10 && Math.abs(L.mid - 100) < 1e-9 && L.rows.some((r) => r.p === 100.05 && r.ask === 4) && L.rows.some((r) => r.p === 99.95 && r.bid === 5), JSON.stringify(L.rows.slice(0, 4)));
  ok('ladder: bars scale to the largest level', Math.max(...L.rows.map((r) => Math.max(r.bw, r.aw))) === 1);
  ok('ladder: empty / bad book → no rows', P5.ladder({ bids: [], asks: [] }, 0.05).rows.length === 0 && P5.ladder(book, 0).rows.length === 0);
  ok('click-to-trade: buy below the ask = limit, above = stop', P5.ladderOrder(99.9, 'buy', 99.98, 100.02).type === 'limit' && P5.ladderOrder(100.5, 'buy', 99.98, 100.02).type === 'stop');
  ok('click-to-trade: sell above the bid = limit, below = stop', P5.ladderOrder(100.5, 'sell', 99.98, 100.02).type === 'limit' && P5.ladderOrder(99.5, 'sell', 99.98, 100.02).type === 'stop' && P5.ladderOrder(0, 'buy', 1, 2) === null && P5.ladderOrder(1, 'x', 1, 2) === null);
  const tape = [{ t: 0.1, p: 10, q: 1 }, { t: 0.5, p: 10.1, q: 2 }, { t: 0.9, p: 10.1, q: 1 }, { t: 1.2, p: 10.0, q: 5 }, { t: 1.6, p: 10.2, q: 1 }, { t: 2.1, p: 10.3, q: 3 }];
  const cv = P5.cvd(tape, [{ t: 0 }, { t: 1 }, { t: 2 }], 1);
  ok('CVD: per-bar aggressor delta and running total', cv.map((x) => x.delta).join(',') === '3,-4,3' && cv[2].cvd === 2, JSON.stringify(cv));
  const fp = P5.footprint(tape, 0, 2, 0.1);
  ok('footprint: bid × ask per price level inside the bar', fp.rows.find((r) => r.p === 10.1).ask === 3 && fp.rows.find((r) => r.p === 10).bid === 5 && fp.delta === 3 - 5 + 1, JSON.stringify(fp));
  ok('footprint: POC is the busiest level', fp.poc === 10);
  const imb = P5.footprint([{ t: 0, p: 10, q: 1 }, { t: 0.1, p: 9.9, q: 1 }, { t: 0.2, p: 10, q: 9 }], 0, 1, 0.1);
  ok('footprint: diagonal 3:1 imbalance is flagged', imb.rows.find((r) => r.p === 10).imb === 'buy', JSON.stringify(imb.rows));
  const wh = P5.whales([{ t: 1, p: 100, q: 1 }, { t: 2, p: 101, q: 600 }, { t: 3, p: 100.5, q: 2000 }], 50000);
  ok('whale tape: only big prints, newest first, with side', wh.length === 2 && wh[0].side === 'sell' && wh[1].side === 'buy' && wh[0].usd === 201000);

  /* ── 2. options ── */
  const c = P5.bs(100, 100, 0.5, 0.04, 0.3, 'call'), p = P5.bs(100, 100, 0.5, 0.04, 0.3, 'put');
  ok('Black-Scholes: put-call parity holds', Math.abs(c.price - p.price - (100 - 100 * Math.exp(-0.04 * 0.5))) < 0.02, [c.price, p.price]);
  ok('Black-Scholes: ATM call ≈ 9.4 (S=K=100, 6m, 30 %)', Math.abs(c.price - 9.4) < 0.15 && c.delta > 0.5 && c.delta < 0.65 && c.gamma > 0);
  ok('Black-Scholes: expiry = intrinsic', P5.bs(110, 100, 0, 0.04, 0.3, 'call').price === 10 && P5.bs(90, 100, 0, 0.04, 0.3, 'put').price === 10);
  const yj = { optionChain: { result: [{ quote: { symbol: 'NVDA', regularMarketPrice: 120 }, expirationDates: [1790000000, 'x'], options: [{ expirationDate: 1790000000, calls: [{ strike: 110, bid: 11, ask: 11.4, openInterest: 500, impliedVolatility: 0.5, contractSymbol: 'NVDA261218C00110000<x>' }, { strike: 120, openInterest: 3000, impliedVolatility: 0.45 }, { strike: 130, openInterest: 800, impliedVolatility: 0.44 }, { strike: 'evil' }], puts: [{ strike: 110, openInterest: 2500, impliedVolatility: 0.5 }, { strike: 120, openInterest: 1000, impliedVolatility: 0.46 }, { strike: 130, openInterest: 100, impliedVolatility: 0.45 }] }] }] } };
  const ch = P5.parseYahoo(yj);
  ok('Yahoo chain parses into plain numbers; junk strikes dropped; contract ids sanitised', ch.sym === 'NVDA' && ch.spot === 120 && ch.calls.length === 3 && ch.puts.length === 3 && ch.exps.length === 1 && /^[A-Z0-9]+$/.test(ch.calls[0].contract));
  ok('Yahoo parse: hostile / empty payload → null', P5.parseYahoo({}) === null && P5.parseYahoo(null) === null);
  ok('max pain is the strike with the smallest writer payout', P5.maxPain(ch) === 120, P5.maxPain(ch));
  const gx = P5.gex(ch, 120, 30 / 365);
  ok('GEX: per-strike dealer gamma, call wall / put wall', gx.rows.length === 3 && gx.callWall === 120 && gx.putWall === 110 && Number.isFinite(gx.total));
  const o1 = P5.optOrder({ sym: 'NVDA', type: 'call', strike: 120, exp: 1790000000, qty: 2, prem: 5.2 }, 5000);
  ok('paper options: cost = qty × premium × 100', o1.ok && o1.cost === 1040 && o1.pos.qty === 2);
  ok('paper options: rejects bad orders and overspending', !P5.optOrder({ type: 'call', strike: 1, exp: 1, qty: 1, prem: 60 }, 5000).ok && !P5.optOrder({ type: 'straddle', strike: 1, exp: 1, qty: 1, prem: 1 }, 1e9).ok && !P5.optOrder({ type: 'put', strike: 1, exp: 1, qty: 0.5, prem: 1 }, 1e9).ok);
  ok('paper options: mark-to-market P&L', P5.optMark(o1.pos, () => 7.2).pnl === 400);

  /* ── 3. ratio, correlation, sub-wallets, broadcast ── */
  const A = mk(100, 3600, (i, p) => p * 1.01), B = mk(100, 3600, (i, p) => p * 1.005);
  const R = P5.ratio(A, B.slice(10));
  ok('ratio candles align on time and divide (SOL/ETH style)', R.length === 90 && Math.abs(R[0].c - A[10].c / B[10].c) < 1e-12 && R.every((k) => k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c)));
  const ra = P5.rets(mk(200, 3600, (i, p) => p * (1 + Math.sin(i) * 0.01))), rb = ra.map((x) => x * 1.3 + 0.0001), rc = ra.map((x, i) => (i % 2 ? x : -x));
  ok('correlation: identical shape ≈ 1, scrambled ≈ low', P5.corr(ra, rb) > 0.99 && Math.abs(P5.corr(ra, rc)) < 0.5 && P5.corr([1], [1]) === null);
  const g = P5.corrGuard({ sym: 'SOL-USD', rets: rb }, [{ sym: 'BTC-USD', rets: ra }, { sym: 'SOL-USD', rets: ra }], 0.85);
  ok('correlation guard blocks a ≥0.85-correlated new long and names the culprit', !g.ok && g.worst.sym === 'BTC-USD');
  ok('correlation guard allows uncorrelated trades', P5.corrGuard({ sym: 'X', rets: rc }, [{ sym: 'BTC-USD', rets: ra }]).ok);
  const sw = P5.subCreate([], 'Scalp <b>', 2500, 10000);
  ok('sub-wallet: carved from main cash, name sanitised', sw.ok && sw.wallet.cash === 2500 && !/[<>]/.test(sw.wallet.name));
  ok('sub-wallet ids are unique even for look-alike names', P5.subCreate([], 'A-b', 100, 1000).wallet.id !== P5.subCreate([], 'A_b', 100, 1000).wallet.id);
  ok('sub-wallet: refuses overspend, dupes and junk names', !P5.subCreate([], 'Big', 20000, 10000).ok && !P5.subCreate([sw.wallet], 'scalp b', 100, 10000).ok && !P5.subCreate([], 'x', 100, 1000).ok && P5.subClose({ cash: 42 }).refund === 42);
  ok('BroadcastChannel: valid symbol sync passes, junk is dropped', P5.bcMsg({ v: 1, k: 'sym', sym: 'BTC-USD', tf: '5m' }).sym === 'BTC-USD' && P5.bcMsg({ v: 1, k: 'sym', sym: '<img>' }) === null && P5.bcMsg({ v: 1, k: 'eval', code: 'x' }) === null && P5.bcMsg({ v: 2 }) === null && P5.bcMsg({ v: 1, k: 'sym', sym: 'BTC-USD', tf: 'constructor' }).tf === null);

  /* ── 5. wallet profiler ── */
  const pr = P5.profile([{ ts: 0, side: 'buy', token: 'WIF', qty: 100, usd: 100 }, { ts: 600, side: 'sell', token: 'WIF', qty: 50, usd: 100 }, { ts: 1200, side: 'sell', token: 'WIF', qty: 50, usd: 25 }, { ts: 0, side: 'buy', token: 'BONK', qty: 10, usd: 10 }, { ts: 300, side: 'sell', token: 'BONK', qty: 10, usd: 30 }]);
  ok('profiler: FIFO round trips, win rate, realised P&L, style', pr.trips === 3 && Math.abs(pr.winRate - 2 / 3) < 1e-9 && pr.realized === 50 + -25 + 20 && pr.style === 'sniper / scalper' && pr.best[0].token === 'WIF', JSON.stringify(pr));
  ok('profiler: no closed trades → accumulating', P5.profile([{ ts: 0, side: 'buy', token: 'X', qty: 1, usd: 1 }]).style === 'accumulating');

  /* ── 6. chart intel ── */
  const up = mk(120, 3600, (i, p) => p * 1.004), dn = mk(120, 3600, (i, p) => p * 0.996);
  ok('trend: up / down / short history', P5.trend(up) === 1 && P5.trend(dn) === -1 && P5.trend(up.slice(0, 20)) === 0);
  const m = P5.mtf({ '15m': up, '1h': up, '4h': dn, '1d': up });
  ok('MTF matrix scores and biases', m.rows.length === 4 && m.score === 2 && m.bias === 'bullish');
  const f = P5.autoFib(mk(200, 3600, (i, p) => 100 + Math.sin(i / 30) * 20));
  ok('auto-fibs: 0 → 1 between the swing high and low, 0.618 inside', f && f.levels.length === 7 && f.levels.find((x) => x.r === 0.618).p < f.hi && f.levels.find((x) => x.r === 0.618).p > f.lo);
  const d2 = mk(72, 3600, (i) => 100 + (i < 24 ? 0 : i < 48 ? (i - 24) : 5), Date.UTC(2026, 10, 10) / 1000);
  const pd = P5.prevDay(d2);
  ok('PDH / PDL / PDC from the previous UTC day', pd && Math.abs(pd.pdh - Math.max(...d2.slice(24, 48).map((k) => k.h))) < 1e-9 && pd.pdl === Math.min(...d2.slice(24, 48).map((k) => k.l)) && pd.pdc === d2[47].c, JSON.stringify(pd));
  const vp = P5.vpvr(mk(300, 3600, (i) => 100 + Math.sin(i / 10) * 5 + (i % 7 === 0 ? 0 : 0)), 30);
  ok('VPVR: 30 bins, POC inside the value area, VAL < POC < VAH', vp.bins.length === 30 && vp.val <= vp.poc && vp.poc <= vp.vah);
  ok('sessions: NY pre / regular / post / closed with DST', P5.session(Date.UTC(2026, 6, 15, 13, 0) / 1000) === 'pre' && P5.session(Date.UTC(2026, 6, 15, 14, 0) / 1000) === 'rth' && P5.session(Date.UTC(2026, 6, 15, 21, 0) / 1000) === 'post' && P5.session(Date.UTC(2026, 0, 15, 14, 0) / 1000) === 'pre' && P5.session(Date.UTC(2026, 0, 15, 15, 0) / 1000) === 'rth' && P5.session(Date.UTC(2026, 6, 18, 15) / 1000) === 'closed');
  const ev = P5.events({ earnings: [{ t: 1790000000, l: 'NVDA Q3 <script>' }], form4: [{ t: 1780000000, l: 'CEO buy' }, { t: 'x' }] });
  ok('events: FOMC 2026 + earnings + Form 4, sorted', ev.filter((e) => e.k === 'fomc').length === 8 && ev.some((e) => e.k === 'earn') && ev.filter((e) => e.k === 'f4').length === 1 && ev.every((e, i) => !i || e.t >= ev[i - 1].t));

  /* ── 7. quant lab ── */
  const wave = mk(1600, 3600, (i, p) => p * (1 + Math.sin(i / 18) * 0.006 + 0.0002));
  const id = Object.keys(NT.strategies).find((k) => /ema|ma_cross|cross/.test(k)) || Object.keys(NT.strategies)[0];
  const def = NT.defaultParams(id), grid = [def, Object.assign({}, def)];
  const wf = P5.walkForward(wave, NT.strategies[id], grid, { folds: 4 });
  ok('walk-forward: 4 folds with in-sample pick and out-of-sample result', wf.folds.length === 4 && wf.folds.every((x) => Number.isFinite(x.oosRet) && Number.isFinite(x.isRet)) && typeof wf.robust === 'boolean', JSON.stringify(wf).slice(0, 200));
  const mc = P5.monteCarlo([0.02, -0.01, 0.03, -0.02, 0.01, 0.015, -0.005], 2000, 42);
  ok('Monte Carlo: ordered percentiles and drawdown stats', mc.p5 <= mc.p50 && mc.p50 <= mc.p95 && mc.ddP50 <= mc.ddP95 && mc.lossProb >= 0 && mc.lossProb <= 1);
  ok('Monte Carlo: seeded = reproducible', JSON.stringify(P5.monteCarlo([0.02, -0.01, 0.03], 500, 9)) === JSON.stringify(P5.monteCarlo([0.02, -0.01, 0.03], 500, 9)) && P5.monteCarlo([0.1], 10) === null);
  const pine = ['//@version=5', 'strategy("EMA cross RSI", overlay=true)', 'fastLen = input.int(9, "Fast")', 'fast = ta.ema(close, fastLen)', 'slow = ta.ema(close, 21)', 'r = ta.rsi(close, 14)', 'longCond = ta.crossover(fast, slow) and r < 70', 'if longCond', '    strategy.entry("L", strategy.long)', 'if ta.crossunder(fast, slow)', '    strategy.close("L")', 'strategy.exit("x", "L", stop=close*(1-0.03), limit=close*(1+0.06))', 'plot(fast)'].join('\n');
  const pi = P5.pineImport(pine);
  ok('Pine importer: EMA cross + RSI filter → valid spec', pi.ok && pi.spec.name === 'EMA cross RSI' && pi.spec.entry.all.length === 2 && pi.spec.entry.all[0].op === 'crossAbove' && pi.spec.entry.all[0].a.n === 9 && pi.spec.exit.all[0].op === 'crossBelow' && pi.spec.risk.sl === 3 && pi.spec.risk.tp === 6, JSON.stringify(pi));
  const cs = NT.Spec.compile ? NT.Spec.compile(pi.spec) : null;
  ok('…and the imported spec backtests', !!cs && Array.isArray(NT.backtest(wave.slice(0, 500), cs, {}, { tfSec: 3600 }).trades));
  const macd = P5.pineImport('//@version=5\nstrategy("MACD")\n[m, s, h] = ta.macd(close, 12, 26, 9)\nif ta.crossover(m, s)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(m, s)\n    strategy.close("L")');
  ok('Pine importer: MACD tuple', macd.ok && macd.spec.entry.all[0].a.k === 'macd' && macd.spec.entry.all[0].b.k === 'macdSignal');
  const bad = P5.pineImport('//@version=5\nstrategy("x")\nx = request.security(syminfo.tickerid, "D", close)\nif barstate.isconfirmed\n    strategy.entry("L", strategy.long)');
  ok('Pine importer: unsupported code is reported, never run', !bad.ok && bad.unsupported.length >= 1 && bad.errors.length >= 1);
  ok('Pine importer: not v5 → error', !P5.pineImport('strategy("x")').ok);
  const mixed = P5.pineImport('//@version=5\nstrategy("M")\nr = ta.rsi(close, 14)\nif r < 30 and close > open or r < 10\n    strategy.entry("L", strategy.long)');
  ok('Pine importer: mixed and / or is refused (no silent precedence change)', !mixed.ok && mixed.unsupported.some((x) => /and|or/.test(x)));
  const ls = P5.pineImport('//@version=5\nstrategy("LS")\nf = ta.ema(close, 9)\ns = ta.ema(close, 21)\nif ta.crossover(f, s)\n    strategy.entry("L", strategy.long)\nif ta.crossunder(f, s)\n    strategy.entry("S", strategy.short)\nstrategy.exit("x", "L", stop=close*(1-0.05))');
  ok('Pine importer: long + short keeps the first direction and reports the second', ls.ok && !ls.spec.dir && ls.spec.entry.all[0].op === 'crossAbove' && ls.unsupported.some((x) => /second short entry/.test(x)));
  const longLine = P5.pineImport('//@version=5\nstrategy("X")\nq = ' + 'a '.repeat(5000) + '\nif ta.crossover(close, ta.ema(close, 9))\n    strategy.entry("L", strategy.long)');
  ok('Pine importer: 10 KB lines are reported, not parsed', longLine.unsupported.some((x) => /too long/.test(x)));

  /* ── 8. derivs & arb ── */
  const ab = P5.arb({ coinbase: { bid: 100, ask: 100.02 }, kraken: { bid: 100.4, ask: 100.45 }, binance: { bid: 99.9, ask: 99.95 } }, 10);
  ok('arbitrage: buy the lowest ask, sell the highest bid, net of fees', ab.buy === 'binance' && ab.sell === 'kraken' && Math.abs(ab.grossBps - (100.4 / 99.95 - 1) * 1e4) < 1e-9 && ab.ok && Math.abs(ab.netBps - (ab.grossBps - 20)) < 1e-9);
  ok('arbitrage: needs two venues; crossed junk quotes are ignored', P5.arb({ a: { bid: 1, ask: 1.01 } }) === null && P5.arb({ a: { bid: 1, ask: 1.01 }, b: { bid: 5, ask: 1 } }) === null);
  const lb = P5.liqBands([{ p: 100, w: 1 }]);
  ok('liquidation bands: 100× long liquidates ~0.5 % below, 10× ~9.5 %', Math.abs(lb.find((b) => b.side === 'long' && b.lev === 100).p - 99.5) < 1e-9 && Math.abs(lb.find((b) => b.side === 'long' && b.lev === 10).p - 90.5) < 1e-9 && lb.find((b) => b.side === 'short' && b.lev === 10).p > 100);
  const lh = P5.liqHeat(lb, 80, 120, 20);
  ok('liquidation heat bins normalised to 1', lh.length === 20 && Math.max(...lh.map((x) => x.k)) === 1);

  /* ── 9. replay packs + encrypted backups ── */
  const pack = P5.packSession('BTC-USD', '5m', up);
  const un = P5.unpackSession(JSON.parse(JSON.stringify(pack)));
  ok('offline replay pack round-trips candles', un && un.candles.length === 120 && un.candles[5].c === up[5].c && un.tf === '5m');
  const shuf = P5.unpackSession(Object.assign({}, pack, { c: pack.c.slice().reverse().concat([pack.c[3]]) }));
  ok('offline replay pack is sorted and de-duplicated', shuf.candles.length === 120 && shuf.candles.every((k, i, a) => !i || k.t > a[i - 1].t));
  ok('offline replay pack rejects tampered data', P5.unpackSession({ v: 1, tf: '5m', c: [[1, 'x', 1, 1, 1, 1]] }) === null && P5.unpackSession({ v: 1, tf: 'constructor', c: pack.c }) === null);
  const secret = { keys: { 'novaterm.v1': '{"a":1}' }, note: 'ünïcødé ✓' };
  const enc = await P5.encrypt(secret, 'correct horse battery', 100000);
  ok('encrypted backup: AES-256-GCM with PBKDF2, no plaintext inside', /"cipher":"AES-256-GCM"/.test(enc) && !/novaterm\.v1|ünïcødé/.test(enc));
  ok('encrypted backup: decrypts with the passphrase', JSON.stringify(await P5.decrypt(enc, 'correct horse battery')) === JSON.stringify(secret));
  let wrong = ''; try { await P5.decrypt(enc, 'wrong passphrase!'); } catch (e) { wrong = e.message; }
  ok('encrypted backup: wrong passphrase is refused', /Wrong passphrase/.test(wrong));
  let tam = ''; const t2 = JSON.parse(enc); t2.ct = t2.ct.slice(0, -6) + 'AAAAAA'; try { await P5.decrypt(JSON.stringify(t2), 'correct horse battery'); } catch (e) { tam = e.message; }
  ok('encrypted backup: tampering is detected (GCM tag)', /Wrong passphrase or damaged/.test(tam));
  let short = ''; try { await P5.encrypt({}, 'short'); } catch (e) { short = e.message; }
  ok('encrypted backup: short passphrases refused; low KDF iterations refused on import', /at least 8/.test(short) && await P5.decrypt(JSON.stringify(Object.assign(JSON.parse(enc), { iter: 10 })), 'x').then(() => false, (e) => /Not an/.test(e.message)));
  ok('restore only accepts own string keys', JSON.stringify(P5.restoreKeys({ keys: { 'novaterm.v1': 'x', evil: 'y', 'novaterm.n': 5 } }, (k) => /^novaterm/.test(k))) === '{"novaterm.v1":"x"}');

  console.log(res.join('\n'));
  const fails = res.filter((x) => x.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log(res.join('\n')); console.log('CRASH', e && e.stack); process.exit(1); });
