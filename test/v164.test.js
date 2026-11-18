// ExTerm v16.4 unit tests: zero-volume re-anchoring (core rollover), on-chain timeframe plans + aggregation, stream
// failover parsing, swap dedupe, AVWAP / tape / imbalance, strictly isolated DEX discovery + filters + presets + pressure,
// 6 structural strategies through the real backtest + 17-test validator, safe Pine v5 templates, Copilot reader / NL /
// auditor / leak detector, node builder, bot export (executed), research maths; static wiring, CSP, XSS, privacy.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const NT = require('../src/strategies4.js'); require('../src/validate.js');
global.self = { NT }; const V = require('../src/v164core.js'); delete global.self;
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, ['serve.py', 'build.py'].includes(f) ? f : 'src/' + f), 'utf8');
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const series = (n, sec, drift) => { let p = 100; const c = []; for (let i = 0; i < n; i++) { const o = p; p *= 1 + Math.sin(i / 13) * 0.004 + (rnd() - 0.5) * 0.01 + (drift || 0); c.push({ t: 1700000000 + i * sec, o, h: Math.max(o, p) * (1 + rnd() * 0.003), l: Math.min(o, p) * (1 - rnd() * 0.003), c: p, v: 50 + rnd() * 100 }); } return c; };

// 1. re-anchoring: replay the real data.js CandleStore rollover
const ds = src('data.js'), cls = ds.slice(ds.indexOf('class CandleStore'), ds.indexOf('function getStore'));
const CandleStore = new Function('NT', 'CANDLE_CAP', cls + '; return CandleStore;')({ TF: { '1s': 1, '5s': 5, '1m': 60 } }, 5000);
const st = new CandleStore('X', '1s'); st.candles = [{ t: 100, o: 10, h: 10.2, l: 9.9, c: 10, v: 5 }, { t: 101, o: 10, h: 10, l: 10, c: 10, v: 0 }];
st.applyTick(10, 0, 105.2);
ok('core rollover: a flat zero-volume forming bar is re-anchored in place (no new flat bar)', st.candles.length === 2 && st.candles[1].t === 105, JSON.stringify(st.candles));
st.applyTick(10.4, 2, 106.1);
ok('core rollover: the re-anchored quiet bar absorbs the next real trade (opens at the prior close)', st.candles.length === 2 && st.candles[1].t === 106 && st.candles[1].o === 10 && st.candles[1].c === 10.4 && st.candles[1].v === 2, JSON.stringify(st.candles));
st.applyTick(10.5, 0, 112);
ok('core rollover: a traded bar is never moved; the next bucket appends; quiet seconds are never back-filled', st.candles.length === 3 && st.candles[1].t === 106 && st.candles[2].t === 112 && V.flatZero(st.candles) === 0, JSON.stringify(st.candles.map((x) => x.t)));
const q = new CandleStore('Y', '1s'); q.candles = [{ t: 1, o: 5, h: 5, l: 5, c: 5, v: 3 }, { t: 2, o: 5, h: 5.2, l: 5, c: 5.2, v: 0 }]; q.applyTick(5.3, 0, 3);
ok('core rollover: a quote-driven bar that moved keeps its slot (stocks quote ticks have size 0)', q.candles.length === 3 && q.candles[1].t === 2);
const ag = new CandleStore('Z', '5s'); ag.candles = [{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: 5, o: 1, h: 1, l: 1, c: 1, v: 0 }]; ag.applyAgg({ t: 17, o: 1, h: 1.2, l: 1, c: 1.1, v: 4 });
ok('core rollover (worker aggregates): same re-anchor rule in applyAgg', ag.candles.length === 2 && ag.candles[1].t === 15 && ag.candles[1].v === 4);
ok('reanchor(): only flat, zero-volume, sub-minute bars move', V.reanchor({ t: 10, o: 1, h: 1, l: 1, c: 1, v: 0 }, 1, 12) && !V.reanchor({ t: 10, o: 1, h: 1, l: 1, c: 1, v: 1 }, 1, 12) && !V.reanchor({ t: 10, o: 1, h: 2, l: 1, c: 2, v: 0 }, 1, 12) && !V.reanchor({ t: 60, o: 1, h: 1, l: 1, c: 1, v: 0 }, 60, 200));

// 2. full-depth on-chain candles
ok('on-chain plans: every timeframe 1m–1M has a GeckoTerminal unit (30m from 15m, 1w from 1d ×7, 1M from 1d ×30)', [60, 300, 900, 1800, 3600, 14400, 43200, 86400, 604800, 2592000].every((s) => !!V.ocPlan(s)) && V.ocPlan(1800).unit === 'minute' && V.ocPlan(1800).agg === 15 && V.ocPlan(1800).k === 2 && V.ocPlan(604800).k === 7 && V.ocPlan(5).sub === true);
const hr = series(48, 3600).map((x, i) => Object.assign(x, { t: 1700006400 + i * 3600 })), h4 = V.aggregate(hr, 14400); // 4h-aligned start
ok('aggregate: 48 hourly bars → 12 dense 4h bars, OHLCV exact', h4.length === 12 && h4[0].o === hr[0].o && h4[0].c === hr[3].c && near(h4[0].v, hr[0].v + hr[1].v + hr[2].v + hr[3].v) && h4[0].h === Math.max(...hr.slice(0, 4).map((x) => x.h)));
ok('raw fetch size: capped at the 1,000-bar API limit', V.ocRaw(604800, 300) === 1000 && V.ocRaw(3600, 300) === 300 && V.OC_LIMIT === 1000);
ok('young tokens: viewport fits the bars that exist (edge-to-edge)', V.fitBars(40, 120, 12) === 40 && V.fitBars(5, 120, 12) === 12 && V.fitBars(400, 120) === 120);
ok('serve.py: GeckoTerminal OHLCV depth raised to limit=1000', /ohlcv\/%s\?aggregate=%d&limit=1000/.test(src('serve.py')));

// 3. failover
ok('failover: stall after 1,500 ms, next exchange skips current + failed', V.stalled(1000, 2600) && !V.stalled(1000, 2400) && V.stalled(undefined, 5) && V.nextEx('coinbase', []) === 'kraken' && V.nextEx('kraken', ['coinbase']) === 'binance' && V.nextEx('kraken', ['coinbase', 'binance']) === null);
ok('failover: symbol mapping per exchange', V.exSym('kraken', 'BTC-USD') === 'BTC/USD' && V.exSym('coinbase', 'ETH-USD') === 'ETH-USD' && V.exSym('binance', 'SOL-USD') === 'solusdt' && V.exSym('kraken', 'oc:x') === null);
const kr = V.exParse('kraken', JSON.stringify({ channel: 'trade', data: [{ price: 100.5, qty: 0.2, side: 'sell', timestamp: '2026-11-17T10:00:00.250Z' }] })), cb = V.exParse('coinbase', { type: 'match', price: '50', size: '1', side: 'buy', time: '2026-11-17T10:00:00Z' }), bn = V.exParse('binance', { e: 'trade', p: '7', q: '3', m: true, T: 1700000000123 });
ok('failover: Kraken / Coinbase / Binance trade messages normalise (Coinbase maker side flipped to taker)', kr[0].price === 100.5 && kr[0].side === 'sell' && near(kr[0].ts % 1, 0.25, 1e-6) && cb[0].side === 'sell' && bn[0].side === 'sell' && near(bn[0].ts, 1700000000.123) && V.exParse('binance', '{bad').length === 0 && V.exParse('kraken', { channel: 'heartbeat' }).length === 0);
ok('failover: subscribe payloads', /"channel":"trade"/.test(V.exSub('kraken', 'BTC-USD')) && /"matches"/.test(V.exSub('coinbase', 'BTC-USD')) && /btcusdt@trade/.test(V.exSub('binance', 'BTC-USD')));

// 4. swap dedupe + serve.py tape
const seen = new Set(), d1 = V.dedupe(seen, [{ tx: 'a', ts: 2 }, { tx: 'b', ts: 1 }]), d2 = V.dedupe(seen, [{ tx: 'b', ts: 1 }, { tx: 'c', ts: 3 }, { ts: 9 }]);
ok('swap dedupe: by transaction hash, sorted by time, unkeyed rows dropped', d1.map((x) => x.tx).join() === 'b,a' && d2.map((x) => x.tx).join() === 'c');
const sv = src('serve.py');
ok('serve.py: /api/swaps answers from RAM, background fetch ≥ 4 s apart, tx-hash dedupe, oc: symbols only', /if p == "\/api\/swaps" and method == "GET"/.test(sv) && /MIN_GAP = 4\.0/.test(sv) && /if x\["tx"\] in P\["seen"\]: continue/.test(sv) && /RX = re\.compile\(r"\^oc:/.test(sv) && /"next_ms": 500/.test(sv));
const py = `import importlib.util,sys,json\nsys.argv=['serve.py','--help']\nspec=importlib.util.spec_from_file_location('s',${JSON.stringify(path.join(root, 'serve.py'))});m=importlib.util.module_from_spec(spec)\ntry: spec.loader.exec_module(m)\nexcept SystemExit: pass\nT=m.SwapTape()\nT.pools['oc:solana:'+'A'*40]={'rows':[],'seen':set(),'at':9e18,'busy':False,'used':0}\nP=T.pools['oc:solana:'+'A'*40]\nfor tx,ts in (('t1',1.0),('t2',2.0),('t1',1.0)):\n  P['busy']=False\n  if tx not in P['seen']: P['seen'].add(tx); P['rows'].append({'tx':tx,'ts':ts,'price':1,'usd':1,'side':'buy'})\nr=T.get('oc:solana:'+'A'*40,1.5)\ntry:\n  T.get('AAPL',0); bad=False\nexcept ValueError: bad=True\nprint(json.dumps({'n':len(r['trades']),'tx':r['trades'][0]['tx'] if r['trades'] else '', 'bad':bad}))\n`;
let pyr = null; try { const f = path.join(os.tmpdir(), 'v164swap.py'); fs.writeFileSync(f, py); pyr = JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', f], { encoding: 'utf8', timeout: 30000 }).trim().split('\n').pop()); } catch (e) { pyr = { err: e.message }; }
ok('serve.py SwapTape: since-filter returns only newer swaps, rejects non on-chain symbols', pyr && pyr.n === 1 && pyr.tx === 't2' && pyr.bad === true, JSON.stringify(pyr));

// 5. AVWAP / tape / book
const bars = series(60, 60), av = V.avwap(bars, 20);
ok('AVWAP: NaN before the anchor, equals typical price on the anchor bar, volume-weighted after', Number.isNaN(av[19]) && near(av[20], (bars[20].h + bars[20].l + bars[20].c) / 3) && av[59] > 0 && V.anchorIdx(bars, bars[33].t) === 33 && V.anchorIdx(bars, bars[33].t - 1) === 33);
ok('AVWAP swing anchor: last confirmed pivot', (() => { const b = [5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8].map((x, i) => ({ t: i, h: x + 0.5, l: x, c: x })); return V.swing(b, 3, 'low') === 4; })());
const now = 1e9, tp = [{ price: 10, size: 2, side: 'buy', ms: now - 3000 }, { price: 10, size: 1, side: 'sell', ms: now - 8000 }, { price: 10, size: 5, side: 'sell', ms: now - 30000 }];
ok('tape delta: 10 s / 60 s aggressive buy share and $ delta', near(V.tapeDelta(tp, now, 10).ratio, 2 / 3) && V.tapeDelta(tp, now, 10).delta === 10 && V.tapeDelta(tp, now, 60).delta === -40 && V.tapeDelta([], now, 10).ratio === null);
ok('book micro-imbalance: (bid $ − ask $) / total over N levels', near(V.imbalance({ bids: [[10, 3]], asks: [[11, 1]] }, 5).imb, (30 - 11) / 41) && V.imbalance(null) === null);

// 6–14. discovery
const R = [
  { id: 'BTC-USD', mode: 'crypto', sym: 'BTC', group: 'Mega cap', ch: 2, mcap: 1e12, v24: 3e10 },
  { id: 'AAPL', mode: 'stocks', sym: 'AAPL', group: 'Tech', ch: -1, mcap: 3e12, v24: 5e9 },
  { id: 'oc:solana:' + 'A'.repeat(40), mode: 'onchain', sym: 'MEME', chain: 'solana', dex: 'pumpfun', group: 'Solana', ch: 40, liq: 20000, mcap: 2e5, v5: 3000, v1h: 9000, v24: 30000, rvol: 7.2, created: now - 2 * 3600000, holders: 900, bsPct: 61, b1h: 80, s1h: 20, v1h2: 0, mintOff: true, lpLocked: true, top10: 18, smartIn: 25000 },
  { id: 'oc:base:' + 'B'.repeat(40), mode: 'onchain', sym: 'OLD', chain: 'base', dex: 'uniswap', group: 'Base', ch: -12, liq: 900000, mcap: 4e7, v5: 100, v1h: 2000, v24: 600000, rvol: 0.08, created: now - 90 * 86400000, holders: null, bsPct: 45 },
  { id: 'oc:solana:' + 'C'.repeat(40), mode: 'crypto', sym: 'FAKE', group: 'x' }, // mislabelled row: must never leak into any mode
];
ok('strict isolation: each mode sees only its own markets (no stocks or CEX pairs in on-chain, none of them in stocks)', V.isolate(R, 'onchain').map((r) => r.sym).join() === 'MEME,OLD' && V.isolate(R, 'stocks').map((r) => r.sym).join() === 'AAPL' && V.isolate(R, 'crypto').map((r) => r.sym).join() === 'BTC');
ok('mode detection from the symbol id', V.modeOf('oc:base:x') === 'onchain' && V.modeOf('NVDA') === 'stocks' && V.modeOf('ETH-USD') === 'crypto' && V.modeOf('weird id') === null);
const OCR = V.isolate(R, 'onchain');
ok('filters: chain + DEX pills', V.applyFilter(OCR, { chain: 'solana' }, now).length === 1 && V.applyFilter(OCR, { dex: 'uniswap' }, now)[0].sym === 'OLD');
ok('filters: min / max ranges for liquidity, market cap, volumes, age, holders, buy/sell %', V.applyFilter(OCR, { liqMin: '50000' }, now)[0].sym === 'OLD' && V.applyFilter(OCR, { mcapMax: '1e6' }, now)[0].sym === 'MEME' && V.applyFilter(OCR, { ageMax: '6h' }, now).map((r) => r.sym).join() === 'MEME' && V.applyFilter(OCR, { ageMin: '30d' }, now)[0].sym === 'OLD' && V.applyFilter(OCR, { holdMin: '500' }, now).map((r) => r.sym).join() === 'MEME' && V.applyFilter(OCR, { bsMin: '50' }, now).length === 1 && V.applyFilter(OCR, { v5Min: '1000' }, now).length === 1);
ok('filters: safety toggles are strict (unknown never passes)', V.applyFilter(OCR, { noMint: true, lpLocked: true, top10: true, smart: true }, now).map((r) => r.sym).join() === 'MEME');
ok('filters: age parser m / h / d', V.parseAge('90') === 5400000 && V.parseAge('6h') === 21600000 && V.parseAge('2d') === 172800000 && V.parseAge('x') === null);
ok('presets: New Launches, High-Liquidity Breakouts, Smart-Money Accumulation', Object.values(V.PRESETS).map((p) => p.label).join() === 'New Launches,High-Liquidity Breakouts,Smart-Money Accumulation' && V.applyFilter(OCR, V.PRESETS.newLaunches.f, now).map((r) => r.sym).join() === 'MEME');
ok('quick search (/) matches symbol, name or id', V.applyFilter(R, { q: 'aap' }, now).length === 1 && V.filterCount({ liqMin: '1', q: 'x', noMint: true }) === 2);
ok('unified pills: All | Top Movers | Volume Surges | mode groups', V.pill(OCR, 'surges').map((r) => r.sym).join() === 'MEME' && V.pill(OCR, 'Base').map((r) => r.sym).join() === 'OLD' && V.pill(OCR, 'all').length === 2 && V.groups(OCR).join() === 'Base,Solana' && V.pill(OCR, 'movers').length === 2);
const mv = V.movers(OCR, 5);
ok('Top Movers rail: gainers, losers, > 3× volume surges', mv.gainers[0].sym === 'MEME' && mv.losers[0].sym === 'OLD' && mv.surges.map((r) => r.sym).join() === 'MEME');
const pr = V.pressure(OCR[0]);
ok('Buy Pressure: taker buy share % and net aggressive $ delta per window', near(pr.h1.pct, 80) && near(pr.h1.delta, 9000 * 0.6) && pr.m5 === null);
ok('Bubbles: Market Cap | Volume Surge | Whale Net Flow | Volatility Squeeze sizing + colour', V.BUB.join() === 'mcap,surge,whale,squeeze' && V.bubbleMetric(OCR[0], 'surge') === 7.2 && V.bubbleMetric(OCR[0], 'whale') > 0 && V.bubbleColor(OCR[0], 'mcap') === 1 && V.bubbleColor(OCR[1], 'mcap') < 0);
ok('gravity clusters: one centre per group inside the canvas', (() => { const c = V.clusters(OCR, 800, 400); return c.size === 2 && [...c.values()].every((p) => p.x > 0 && p.x < 800 && p.y > 0 && p.y < 400); })());
ok('Export Filtered Basket: max 10, mode-pure', (() => { const b = V.basket(R, 'onchain', 10); return b.n === 2 && b.symbols.every((s) => /^oc:/.test(s)) && !b.symbols.includes('oc:solana:' + 'C'.repeat(40)); })());
ok('spread in bps', near(V.spread(99.95, 100.05), 10) && V.spread(0, 1) === null);

// 15. structural strategies through the real engine
const ids = V.register(NT), cand = series(1500, 900);
ok('6 structural strategies register as specs (pack 5)', ids.length === 6 && ids.every((id) => NT.strategies[id] && NT.strategies[id].spec && NT.strategies[id].pine) && NT.PACK5.length === 6 && NT.STRAT_CATS.includes(V.STRAT_CAT));
ok('strategy names: ORB, Anchored VWAP Pullback, Squeeze Expansion, Liquidity Sweep, Z-Score Reversion, Funding & Basis Divergence', ['Opening Range Breakout', 'Anchored VWAP Pullback', 'Volatility Squeeze Expansion', 'Liquidity Sweep and Failed Breakdown Reversal', 'Regime-Filtered Z-Score Mean Reversion', 'Funding-Rate and Perp Basis Divergence'].every((n) => ids.some((id) => NT.strategies[id].name.includes(n))));
ok('every structural strategy backtests on the real engine and carries a stop', ids.every((id) => { const r = NT.backtest(cand, NT.strategies[id], {}, { short: NT.strategies[id].short }); return r && r.stats && Number.isFinite(r.stats.ret) && NT.strategies[id].spec.risk.sl > 0; }));
const vg = NT.validate(cand, NT.strategies[ids[0]], {}, {});
ok('17-test validation gate grades a structural strategy', vg && vg.checks.length === 17 && /^[A-F]$/.test(vg.grade), vg && vg.grade);
ok('Funding & Basis strategy is a short with an honest proxy description', NT.strategies.q5_basis.short === true && /no funding history/.test(NT.strategies.q5_basis.spec.desc));
ok('worker bundle includes v164core.js so pack 5 runs off-thread', /"v15p5core\.js", "v164core\.js", "worker\.js"/.test(src('build.py')) && /self\.NT\.Spec\) \{ try \{ V164\.register\(self\.NT\)/.test(src('v164core.js')));

// Pine templates
ok('Pine v5 library: every template is confirmed-bar, no look-ahead, $ risk sized, strategy.exit stop, max_intraday_loss, webhook JSON', V.PINE_LIB.length === 6 && V.PINE_LIB.every((k) => { const c2 = V.pineCheck(V.pine(k)); return c2.ok && !c2.repaint && /^\/\/@version=5/.test(V.pine(k)) && /127\.0\.0\.1/.test(V.pine(k)); }));
ok('Pine checker catches an unsafe script (no stop, look-ahead on)', (() => { const c2 = V.pineCheck('//@version=5\nstrategy("x")\nx = request.security(syminfo.tickerid, "D", close, lookahead = barmerge.lookahead_on)\nstrategy.entry("L", strategy.long)'); return !c2.ok && c2.repaint && c2.rows.some((r) => r.k === 'strategy.exit stop-loss' && !r.ok); })());

// 16. Copilot
const up = series(300, 3600, 0.002), rc = V.readChart(up);
ok('Copilot chart reader: trend, structure, ATR, support / resistance, regime', rc && ['bullish', 'bearish', 'neutral'].includes(rc.trend) && rc.atr > 0 && /trend|range/.test(rc.structure) && ['trend', 'range', 'volatile'].includes(rc.regime) && typeof rc.summary === 'string' && V.readChart(up.slice(0, 10)) === null);
const nl = V.nlToSpec('Buy when RSI 14 is below 30 and price is above the SMA 200, exit when price crosses below the EMA 20, stop 3%, target 6%');
ok('natural language → safe spec: entry, exit, stop and target recognised and valid', nl.ok && nl.spec.entry.all.length === 2 && nl.spec.exit.any[0].op === 'crossBelow' && nl.spec.risk.sl === 3 && nl.spec.risk.tp === 6 && NT.Spec.validate(nl.spec).ok, JSON.stringify(nl.spec));
const nl2 = V.nlToSpec('buy when price crosses above the EMA 50');
ok('natural language: missing stop gets a 2% stop and a default exit, both explained; no duplicate cross/above rule', nl2.ok && nl2.spec.risk.sl === 2 && nl2.notes.length === 2 && nl2.spec.entry.all.length === 1 && NT.Spec.validate(nl2.spec).ok);
ok('natural language: unrecognised text is refused, never guessed', V.nlToSpec('make me rich').ok === false);
const au = V.audit({ entry: 100, sl: 99.8, tp: 100.3, atr: 1, corr: 0.9, corrSym: 'ETH' }), au2 = V.audit({ entry: 100, sl: 101, atr: 1 });
ok('pre-trade auditor: stop inside noise, poor R:R, correlation; wrong-side stop blocks; suggests 1.5 ATR', au.ok && au.rows.some((r) => r.k === 'Stop inside the noise') && au.rows.some((r) => r.k === 'Reward : risk' && r.lvl === 'warn') && au.rows.some((r) => /Correlated/.test(r.k)) && near(au.stop15, 98.5) && !au2.ok && V.audit({ entry: 100, atr: 1 }).rows[0].k === 'No stop-loss');
const lk = V.leaks([{ kind: 'breaker', status: 'depth', detail: 'BUY X: Liquidity depth: $1' }, { kind: 'breaker', status: 'depth', detail: 'BUY X: Liquidity depth: $2' }, { kind: 'breaker', status: 'depth', detail: 'BUY X: Liquidity depth: $3' }, { kind: 'signal', status: 'failed', ts: 1 }, { kind: 'signal', ts: 1000 }, { kind: 'signal', ts: 2000 }, { kind: 'breaker', detail: 'Require Stop-Loss: opening order has no stop-loss' }], [{ bps: 14 }, { bps: 2 }]);
ok('ledger leak detector: repeated blocks, failed sends, slippage, overtrading bursts, stop refusals', ['Repeated blocks', 'Failed sends', 'High slippage fills', 'Overtrading bursts', 'Stop-loss refusals'].every((k) => lk.findings.some((f) => f.k === k)) && V.leaks([], []).clean);

// 17. research & bots
const ns = V.nodesToSpec('n', [{ type: 'entry', join: 'any' }, { type: 'risk', risk: { sl: 1.5 } }, { type: 'cond', parent: 'entry', a: { k: 'rsi', n: 14 }, op: '<', b: { k: 'const', v: 30 } }, { type: 'cond', parent: 'exit', a: { k: 'rsi', n: 14 }, op: '>', b: { k: 'const', v: 60 } }]);
ok('node builder → valid spec (join + risk carried)', NT.Spec.validate(ns).ok && ns.entry.any.length === 1 && ns.exit.any.length === 1 && ns.risk.sl === 1.5);
const dr = V.drift([{ sym: 'BTC', side: 'buy', price: 100, ts: 1000 }], [{ sym: 'BTC', side: 'buy', price: 100.3, ts: 1500 }]);
ok('shadow drift: matched fill drift in bps and lag', dr && near(dr.bps, 30) && dr.lagMs === 500 && dr.alert === true && V.drift([], []) === null);
ok('regime detector + auto-switch map', ['trend', 'range', 'volatile'].includes(V.regime(up)) && V.regime([]) === 'unknown' && V.pickBot('trend', { trend: 'q5_orb' }) === 'q5_orb' && V.pickBot('range', {}) === null);
ok('multi-slot router: valid slot or fallback', V.route({ a: 3 }, 'a', 6) === 3 && V.route({ a: 9 }, 'a', 6) === 6 && V.route({}, 'b') === 1);
const simple = { v: 1, name: 'x', entry: { all: [{ a: { k: 'price' }, op: 'crossAbove', b: { k: 'ema', n: 10 } }] }, exit: { any: [{ a: { k: 'price' }, op: 'crossBelow', b: { k: 'ema', n: 10 } }] }, risk: { sl: 2 } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v164bot-')), bf = path.join(tmp, 'bars.json'); fs.writeFileSync(bf, JSON.stringify(series(400, 3600)));
const nb = V.exportBot(simple, 'node'), pb = V.exportBot(simple, 'py'); fs.writeFileSync(path.join(tmp, nb.file), nb.code); fs.writeFileSync(path.join(tmp, pb.file), pb.code);
let nOut = '', pOut = ''; try { nOut = execFileSync(process.execPath, [path.join(tmp, nb.file), bf], { encoding: 'utf8' }); pOut = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', path.join(tmp, pb.file), bf], { encoding: 'utf8' }); } catch (e) { nOut = 'ERR ' + e.message; }
const nl1 = nOut.trim().split('\n').filter(Boolean), pl1 = pOut.trim().split('\n').filter(Boolean);
ok('standalone bot export: Node and Python bots run, emit the same buy / sell signals with a stop on every buy', nl1.length > 4 && nl1.length === pl1.length && nl1.every((l, i) => JSON.parse(l).action === JSON.parse(pl1[i]).action && JSON.parse(l).t === JSON.parse(pl1[i]).t) && nl1.filter((l) => JSON.parse(l).action === 'buy').every((l) => JSON.parse(l).sl > 0), `${nl1.length} vs ${pl1.length} ${nOut.slice(0, 120)}`);
fs.rmSync(tmp, { recursive: true, force: true });
ok('bot export refuses unsupported operators with a clear reason', V.exportBot({ entry: { all: [{ a: { k: 'adx', n: 14 }, op: '>', b: { k: 'const', v: 20 } }] }, exit: { any: [] }, risk: {} }, 'py').ok === false);
ok('depth & dynamic slippage: square-root impact grows with size / depth', near(V.impactBps(10000, 1e6, 25), 2.5) && V.impactBps(40000, 1e6, 25) === 5 && V.slipAdjust([{ usd: 10000 }, { usd: 40000 }], 1e6, 25).cost > 0);
const P = V.portfolio([{ sym: 'A', eq: [1, 1.1, 1.2, 1.15] }, { sym: 'B', eq: [1, 1.1, 1.2, 1.15] }, { sym: 'C', eq: [1, 0.9, 0.8, 0.85] }]);
ok('multi-asset portfolio: equal-weight curve, max DD, correlation matrix (≤ 10 symbols)', P && P.syms.length === 3 && near(P.corr[0][1], 1, 1e-9) && P.corr[0][2] < 0 && Number.isFinite(P.maxDD) && V.portfolio([]) === null);
const sc = V.stress(cand, 'crash', 500);
ok('event-window stress: Flash Crash drops ≈15% in 5 bars; FOMC widens ranges; Thin Weekend halves volume; OHLC stays consistent', sc[505].c < cand[505].c * 0.87 && V.stress(cand, 'fomc', 500)[503].h - V.stress(cand, 'fomc', 500)[503].l > cand[503].h - cand[503].l && V.stress(cand, 'weekend', 500)[505].v < cand[505].v && ['crash', 'fomc', 'weekend'].every((k) => V.stress(cand, k).every((b) => b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c))));
const dc = V.decay((c2) => NT.backtest(c2, NT.strategies[ids[0]], {}, {}).stats, cand, 5);
ok('walk-forward decay matrix: 5 folds with in-sample vs out-of-sample', dc && dc.rows.length === 5 && dc.rows.every((r) => Number.isFinite(r.inRet) && Number.isFinite(r.outRet)) && V.decay(() => ({}), cand.slice(0, 50), 5) === null);
ok('backtest trade replay markers', V.markers([{ ts: 1700000000000, price: 1, side: 'buy' }, { ts: 1700000100, price: 2, side: 'sell', pnl: 1, pnlPct: 0.05 }]).map((m) => m.label).join() === 'B,+5.0%');

// static wiring / CSP / privacy
const ui = src('v164.js'), core = src('v164core.js'), B = src('build.py'), css = src('style.css');
ok('build: v164core.js after v163core.js, v164.js after v163.js, before boot.js', /"v163core\.js", "v164core\.js", (?:"v165core\.js", )?(?:"v166core\.js", )?"v160\.js"/.test(B) && /"v163\.js", "v164\.js", (?:"v165\.js", )?(?:"v166\.js", )?"boot\.js"/.test(B));
ok('v16.0 router: Multi-Slot Strategy Router hook (default slot 6)', /U\.slotFor\(bot\) : 6/.test(src('v160.js')) && /V160UI\.slotFor = \(bot\) => V164\.route/.test(ui));
ok('briefing lists the v16.4 highlights', /V164\.HIGHLIGHTS/.test(src('v162.js')) && V.HIGHLIGHTS.length >= 5);
ok('UI: discovery isolates rows by mode and syncs the legacy heat views to the market pill', /return V164\.isolate\(out, m\)/.test(ui) && /ST\.heat\.asset = m/.test(ui));
ok('UI: failover feeds Feed.trade only while the primary stalls; swap tape skips when the regular feed is live', /V164\.stalled\(U\.lastPrim\[sym\], now\)/.test(ui) && /if \(own\) continue/.test(ui));
ok('CSP: no inline handlers or eval in v16.4', !/\son[a-z]+=["']/i.test(ui + core) && !/\beval\(|new Function/.test(ui + core));
ok('XSS: toasts with dynamic text escape it', !/toast\(`[^`]*\$\{(?!esc\()[^`]*`/.test(ui));
ok('XSS: table / list cells go through esc()', !/<td>\$\{(?!esc\(|cell\(|r\.decay|statRow)/.test(ui));
ok('CSS: discovery, copilot, studio styles present with RTL rules', ['.v164-dex', '.v164-t', '.v164-tile', '.v164-pb', '.v164-cop', '.v164-stu', '.v164-zone', 'html[dir="rtl"] .v164-tip'].every((k) => css.includes(k)));
ok('privacy: no personal paths, emails, usernames or legacy product name in v16.4 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term', 'op' + 'en[- ]?so' + 'urce'].join('|'), 'i').test(ui + core));
ok('launcher points at the ExTerm repository for update checks', /UPDATE_REPO = "uexxx\/ExTerm"/.test(src('serve.py')) && /VERSION = "16\.[456]"/.test(src('serve.py')));

const fails = res.filter((r) => r.startsWith('FAIL'));
console.log(res.join('\n')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
