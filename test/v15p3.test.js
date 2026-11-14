// ExTerm v15 phase 3 unit tests: 1s / 5s timeframes and tick bootstrapping, strategy pack 4 (40 specs, Pine export),
// World Monitor intel cleaning + shield, regime, behavioral leaks, autopsy, 3-agent desk, auto-workflow, Grok tool checks.
const vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const NT = require('../src/strategies4.js');
const P3 = require('../src/v15p3core.js');

/* synthetic candles: a trend, a range and a 1-second series */
const mk = (n, tf, f) => { const c = []; let p = 100; for (let i = 0; i < n; i++) { const o = p; p = f(i, p); c.push({ t: 1.7e9 + i * tf, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * 0.999, c: p, v: 100 + ((i * 7919) % 97) }); } return c; };
const trend = mk(400, 3600, (i, p) => p * (1 + 0.004 + Math.sin(i / 5) * 0.002));
const range = mk(400, 3600, (i) => 100 + Math.sin(i / 6) * 2);
const secs = mk(1500, 1, (i, p) => p * (1 + Math.sin(i / 23) * 0.0006 + ((i * 31) % 7 - 3) * 0.0001));

/* ── 1. timeframes ── */
{
  ok('NT.TF has 1s and 5s next to 15s', NT.TF['1s'] === 1 && NT.TF['5s'] === 5 && NT.TF['15s'] === 15);
  const bases = new Set(['BTC', 'ETH']);
  ok('parseIntent reads 1s / 5s and still 15s', NT.parseIntent('chart btc 1s', bases).tf === '1s' && NT.parseIntent('backtest ema on eth 5s', bases).tf === '5s' && NT.parseIntent('chart btc 15s', bases).tf === '15s');
  const sb = { console, Date, Math, JSON, Map, Set, Promise, setTimeout, clearTimeout, queueMicrotask, isFinite, parseFloat, URL, encodeURIComponent, AbortController: function () { this.signal = {}; this.abort = () => {}; } };
  vm.createContext(sb);
  vm.runInContext(src('core.js') + '\nthis.NT = NT;', sb);
  Object.assign(sb, { isStock: (s) => /^[A-Z]{1,5}$/.test(s), isOnchain: (s) => /^oc:/.test(s), document: { querySelector: () => null }, location: { protocol: 'file:' }, fetch: async () => { throw new Error('offline'); } });
  vm.runInContext(src('data.js') + '\nthis.TFX = TFX; this.Feed = Feed; this.J = J; this.CandleStore = CandleStore; this.setPF = (f) => { providerFor = f; };', sb);
  const { TFX, Feed, J } = sb;
  const ticks = [[100, 10], [100.4, 11], [101.2, 12], [104.9, 9], [105.1, 13]].map(([t, p]) => ({ t: 1.7e9 + t, p, q: 1 }));
  const b1 = TFX.fromTrades(ticks.slice(), 1), b5 = TFX.fromTrades(ticks.slice(), 5);
  ok('1s bars: one per second, quiet seconds filled flat', b1.length === 6 && b1[0].o === 10 && b1[0].c === 11 && b1[0].h === 11 && b1[1].c === 12 && b1[2].v === 0 && b1[2].c === 12, JSON.stringify(b1));
  ok('5s bars: OHLC across the bucket', b5.length === 2 && b5[0].o === 10 && b5[0].h === 12 && b5[0].l === 9 && b5[0].c === 9 && b5[1].c === 13, JSON.stringify(b5));
  for (let i = 0; i < 30000; i++) TFX.note('BTC-USD', 100 + i * 1e-3, 0.1, 1.7e9 + i * 0.1);
  const ring = TFX.ring.get('BTC-USD');
  ok('WebSocket trade ring is capped (RAM bound) and keeps the newest trades', ring.length <= TFX.RING * 1.25 && ring[ring.length - 1].p > 129.99);
  ok('ring ignores bad ticks', (TFX.note('X', -1, 1, 5), !TFX.ring.has('X')) && (TFX.note('X', 1, 1, NaN), !TFX.ring.has('X')));
  const merged = TFX.merged([{ t: 1.7e9 + 2999.5, p: 1, q: 1 }], 'BTC-USD');
  const nf = TFX.merged([{ t: 1.7e9 + 2999.5, p: 2, q: 1 }, { t: 1.7e9 + 100, p: 3, q: 1 }], 'BTC-USD');
  ok('merge: newest-first REST pages (Coinbase) do not double-count live trades', nf.slice(2).every((x) => x.t > 1.7e9 + 2999.5) && nf.length === 2 + merged.length - 1, nf.length + ' vs ' + merged.length);
  ok('merge keeps REST trades and only newer live trades', merged[0].p === 1 && merged.slice(1).every((x) => x.t > 1.7e9 + 2999.5) && merged.length > 1);
  // stocks: launcher ticks → sub-minute bars, continuous up to now
  J.proxy = true; const now = Math.floor(Date.now() / 1000);
  J.get = async (u) => { if (!/^\/api\/ticks\?sym=AAPL$/.test(u)) throw new Error('unexpected ' + u); return { ticks: [[now - 20, 200], [now - 19.5, 201], [now - 10, 199], ['x', 5], [now - 9, -3]] }; };
  TFX.stockSub('AAPL', 5, 300).then((rows) => {
    ok('stocks: 5s bars from the launcher RAM ticks (bad ticks dropped)', rows.length >= 4 && rows[0].o === 200 && rows.every((k) => k.l > 0), JSON.stringify(rows.slice(0, 3)));
    ok('stocks: bars run up to the current 5s bucket', rows[rows.length - 1].t === Math.floor(Date.now() / 1000 / 5) * 5);
    J.proxy = false; Feed.live.TSLA = { price: 250 };
    return TFX.stockSub('TSLA', 1, 300);
  }).then((rows) => {
    ok('stocks without the launcher: seeded from the last quote so 1s renders at once', rows.length === 1 && rows[0].c === 250);
    sb.setPF(() => ({ candles: async () => [] }));
    return TFX.stockSub('NOPE', 1, 10).then(() => ok('stocks: no quote at all → clear error', false), (e) => ok('stocks: no quote at all → clear error', /No quote/.test(e.message)));
  }).then(() => {
    const cs = new sb.CandleStore('BTC-USD', '1s'); cs.candles = [{ t: 100, o: 1, h: 1, l: 1, c: 1, v: 0 }];
    cs.applyTick(2, 1, 101.4); cs.applyTick(3, 1, 101.9); cs.applyTick(0.5, 1, 102.0);
    ok('live ticks open a new 1s bar each second', cs.candles.length === 3 && cs.candles[1].o === 1 && cs.candles[1].c === 3 && cs.candles[1].h === 3 && cs.candles[2].o === 3 && cs.candles[2].c === 0.5); // v15p4: sub-minute opens anchor to the prior close
    finish();
  }).catch((e) => { ok('async timeframe tests', false, e.stack); finish(); });
}

/* ── 2. strategy pack 4 ── */
{
  ok('pack 4: 40 strategies, 10 per category', NT.PACK4.length === 40 && NT.PACK4_CATS.every((c) => NT.PACK4.filter((id) => NT.strategies[id].cat === c).length === 10));
  ok('pack 4: every one is a validated no-code spec (launcher-runnable)', NT.PACK4.every((id) => NT.strategies[id].spec && NT.Spec.validate(NT.strategies[id].spec).ok));
  ok('pack 4: unique names', new Set(NT.PACK4.map((id) => NT.strategies[id].name)).size === 40);
  let trades = 0, errs = [];
  for (const id of NT.PACK4) { try { for (const c of [trend, range, secs]) trades += NT.backtest(c, NT.strategies[id], NT.defaultParams(id), { cash: 10000, fee: 0.001, slip: 0.0005, tfSec: c[1].t - c[0].t }).trades.length; } catch (e) { errs.push(id + ': ' + e.message); } }
  ok('pack 4: all backtest on 1h and 1s candles without errors', !errs.length && trades > 100, errs.join('; ') + ' trades ' + trades);
  const pine = NT.PACK4.map((id) => NT.Spec.toPine(NT.strategies[id].spec));
  ok('pack 4: Pine Script v5 export for all 40', pine.every((p) => p.startsWith('//@version=5') && /strategy\("/.test(p) && /entryCond = /.test(p)));
  ok('pack 4: shorts export as strategy.short', pine[NT.PACK4.indexOf('q4_cr_perpshort')].includes('strategy.short'));
  ok('pack 4: higher-timeframe operands export without repainting', pine[NT.PACK4.indexOf('q4_qs_mtf')].includes('request.security') && pine[NT.PACK4.indexOf('q4_qs_mtf')].includes('[1]'));
  ok('pack 4: Pine titles carry no quotes (no string breakout)', pine.every((p) => !/strategy\("[^"\n]*"[^,]/.test(p)));
  fs.writeFileSync(path.join(require('os').tmpdir(), 'exterm_pack4_specs.json'), JSON.stringify(NT.PACK4.map((id) => NT.strategies[id].spec)));
}

/* ── 3. World Monitor intel ── */
{
  const now = Math.floor(Date.now() / 1000);
  const r = { items: [{ id: 'a', title: 'Missile strike near strait', source: 'Reuters', sev: 'CRITICAL', link: 'javascript:alert(1)', ts: now - 600 }, { id: 'b', title: 'Fed signals rate cut', sev: 'MACRO', link: 'https://x.y/z', ts: now - 100 }, { id: 'c', title: 'x', sev: 'HIGH' }, { title: 'Weird <b>sev</b>', sev: 'EVIL', ts: 'NaN' }, null, 'str'] };
  const it = P3.cleanIntel(r);
  ok('intel: javascript: links dropped, unknown severity → INFO, junk rows dropped', it.length === 3 && it[0].link === '' && it[1].link === 'https://x.y/z' && it[2].sev === 'INFO' && it[2].ts === 0, JSON.stringify(it));
  ok('intel: titles keep text (escaping happens at render)', it[2].title === 'Weird <b>sev</b>');
  ok('shield: a CRITICAL in the last hour → CRITICAL', P3.shield(it, now).level === 'CRITICAL');
  ok('shield: an old CRITICAL does not trigger', P3.shield(it, now + 7200).level === 'CALM');
  const highs = [1, 2, 3].map((i) => ({ sev: 'HIGH', ts: now - i * 60, title: 't' + i }));
  ok('shield: 3 HIGH headlines → ELEVATED', P3.shield(highs, now).level === 'ELEVATED');
}

/* ── 4. regime ── */
{
  const up = P3.regime(trend), rg = P3.regime(range);
  ok('regime: steady climb reads as trend-up with trend strategies', up.regime === 'trend-up' && up.picks.length > 0 && up.picks.every((id) => NT.strategies[id]), JSON.stringify(up));
  ok('regime: sine wave reads as range or high-vol, not a trend', rg.regime === 'range' || rg.regime === 'high-vol', rg.regime);
  ok('regime: too little data → unknown', P3.regime(trend.slice(0, 30)).regime === 'unknown');
}

/* ── 5. behavioral leaks + autopsy ── */
{
  const t0 = Date.UTC(2026, 10, 10, 14), m = 60000;
  const C = [
    { sym: 'BTC-USD', ts: t0 + 10 * m, openTs: t0, pnl: -100, win: false, usd: 1000, stop: true, held: 10 * m, exit: { reason: 'stop-loss' } },
    { sym: 'BTC-USD', ts: t0 + 20 * m, openTs: t0 + 12 * m, pnl: -150, win: false, usd: 5000, stop: false, held: 8 * m, mood: 'revenge', exit: { reason: 'sell' } },
    { sym: 'ETH-USD', ts: t0 + 40 * m, openTs: t0 + 25 * m, pnl: 30, win: true, usd: 1000, stop: false, held: 1 * m, exit: { reason: 'take-profit' } },
    { sym: 'ETH-USD', ts: t0 + 90 * m, openTs: t0 + 45 * m, pnl: -120, win: false, usd: 1000, stop: false, held: 45 * m, exit: { reason: 'sell' } },
    { sym: 'SOL-USD', ts: t0 + 99 * m, openTs: t0 + 95 * m, pnl: 20, win: true, usd: 900, stop: true, held: 4 * m, exit: { reason: 'take-profit' } },
  ];
  const K = P3.leaks(C, 10), ids = K.leaks.map((l) => l.id);
  ok('leaks: revenge entries, missing stops, size spikes and loss aversion are flagged', ['revenge', 'nostop', 'oversize', 'lossaversion', 'tilt'].every((x) => ids.includes(x)), ids.join(','));
  ok('leaks: discipline score drops with serious leaks', K.score < 50 && K.n === 5);
  ok('leaks: only the last 10 trades count', P3.leaks(Array.from({ length: 30 }, (_, i) => ({ ts: i, pnl: 1, win: true, stop: true, usd: 100 })), 10).n === 10);
  ok('leaks: under 3 trades → a note, no verdict', P3.leaks(C.slice(0, 2)).leaks.length === 0 && /3 closed/.test(P3.leaks(C.slice(0, 2)).note));
  const A = P3.autopsy(C, 10);
  ok('autopsy: newest first, grades by process (stop) not just outcome', A[0].sym === 'SOL-USD' && A[0].grade === 'A' && A.find((x) => x.sym === 'ETH-USD' && x.win).grade === 'C' && A.find((x) => x.pnl === -150).grade === 'F');
  ok('autopsy: explains a planned stop-out', A.find((x) => x.pnl === -100).why[0].includes('stopped out'));
}

/* ── 6. 3-agent desk ── */
{
  const base = { candles: trend, equity: 10000, leaks: { leaks: [] }, intel: { shield: 'CALM' } };
  const R = P3.desk(base);
  ok('desk: three agents (technical, intelligence, CRO) and a plan', R.ok && R.agents.map((a) => a.id).join() === 'tech,intel,cro' && R.plan.sl < R.plan.entry && R.plan.tp > R.plan.entry, JSON.stringify(R.plan));
  ok('desk: CRO sizes about 1% risk', R.plan.usd > 0 && Math.abs(((R.plan.entry - R.plan.sl) * (R.plan.usd / R.plan.entry)) - 100) < 1);
  const V = P3.desk(Object.assign({}, base, { intel: { shield: 'CRITICAL' } }));
  ok('desk: CRITICAL macro headline → NO-TRADE veto', V.plan.verdict === 'NO-TRADE' && V.plan.usd === 0);
  const H = P3.desk(Object.assign({}, base, { leaks: { leaks: [{ sev: 'high' }] } }));
  ok('desk: serious behavioral leak → half size', H.plan.verdict === 'REDUCE' && Math.abs(H.plan.usd - R.plan.usd / 2) < 1);
  ok('desk: thin DEX pool and risk flags weigh on the intelligence agent', P3.desk(Object.assign({}, base, { intel: { pool: { liq: 10000, buys24: 10, sells24: 30, flags: ['mint authority'] } } })).agents[1].score < -1);
  ok('desk: needs 60 candles', P3.desk({ candles: trend.slice(0, 20) }).ok === false);
}

/* ── 7. workflow, tools, local engine, bridge ── */
{
  const w = P3.workflow({ sym: 'BTC-USD', tf: '1h', regime: P3.regime(trend), autoPause: true });
  ok('workflow: 8 linked stages ending in mobile alerts', w.nodes.length === 8 && w.edges.length === 7 && w.nodes[7].kind === 'alert' && w.nodes[5].detail.includes('auto-pause'));
  ok('workflow: 1h spec strategy → 24/7 launcher bot; 5s → in-tab bot', w.bg === true && P3.workflow({ sym: 'BTC-USD', tf: '5s', strat: 'q4_qs_ema513' }).bg === false);
  ok('tools: schemas for all tools, required args listed', P3.schemas().length === Object.keys(P3.TOOLS).length && P3.schemas().find((s) => s.function.name === 'run_validation').function.parameters.required.join() === 'strategy,symbol,timeframe');
  ok('tools: inherited object keys are not timeframes or strategies', !P3.checkTool('run_backtest', { strategy: 'constructor', symbol: 'BTC', timeframe: '1h' }).ok && !P3.checkTool('run_backtest', { strategy: 'q4_qs_dualma', symbol: 'BTC', timeframe: '__proto__' }).ok && !P3.checkTool('start_bot', { strategy: 'hasOwnProperty', symbol: 'BTC', timeframe: 'toString' }).ok && P3.bridge({ strat: 'constructor' }).strat === null);
  ok('intel: a future-dated headline is never fresh', P3.cleanIntel({ items: [{ title: 'Tomorrow headline', sev: 'CRITICAL', ts: Date.now() / 1000 + 86400 }] })[0].ts === 0);
  ok('tools: unknown tool refused', !P3.checkTool('eval_js', {}).ok && !P3.checkTool('__proto__', {}).ok && !P3.checkTool('constructor', {}).ok);
  ok('tools: JSON-string args parsed, bad timeframe / strategy refused', P3.checkTool('run_backtest', '{"strategy":"q4_qs_dualma","symbol":"BTC","timeframe":"1s"}').ok && !P3.checkTool('run_backtest', { strategy: 'q4_qs_dualma', symbol: 'BTC', timeframe: '7m' }).ok && !P3.checkTool('run_backtest', { strategy: 'nope', symbol: 'BTC', timeframe: '1h' }).ok);
  ok('tools: symbols with markup refused, capital range enforced', !P3.checkTool('detect_regime', { symbol: '<img>', timeframe: '1h' }).ok && !P3.checkTool('start_bot', { strategy: 'q4_qs_dualma', symbol: 'BTC', timeframe: '1h', capital: 1e12 }).ok);
  ok('tools: bot-changing tools are marked unsafe (need a click)', ['start_bot', 'pause_bots', 'switch_regime'].every((n) => P3.TOOLS[n].safe === false) && P3.TOOLS.run_validation.safe === true);
  ok('tools: oversized / non-object args refused', !P3.checkTool('journal_autopsy', 'x'.repeat(5000)).ok && !P3.checkTool('journal_autopsy', '[1]').ok);
  const d = { sym: 'BTC-USD', tf: '1h' };
  ok('local engine: routes requests to tools', P3.local('validate q4_cr_rsi2 on btc 4h', d).name === 'run_validation' && P3.local('validate q4_cr_rsi2 on btc 4h', d).args.timeframe === '4h' && P3.local('why did i lose? autopsy', d).name === 'journal_autopsy' && P3.local('any macro news?', d).name === 'macro_intel' && P3.local('pause all bots', d).name === 'pause_bots' && P3.local('generate a workflow', d).name === 'generate_workflow' && P3.local('tune it on 5s', d).args.timeframe === '5s');
  ok('local engine: every routed call passes the tool checks', ['backtest q4_qs_macd', 'regime?', 'start a q4_cr_rsi2 bot', 'list bots', 'switch strategy for the regime'].every((q) => P3.checkTool(P3.local(q, d).name, P3.local(q, d).args).ok));
  const b = P3.bridge({ from: 'evil', sym: 'BTC-USD‮', tf: '9z', side: 'x', entry: -1, sl: '90', strat: 'nope', note: 'n'.repeat(500) });
  ok('bridge: sanitised payload (side, tf, numbers, strategy, note length)', b.from === 'copilot' && b.sym === 'BTC-USD' && b.tf === '1h' && b.side === 'buy' && b.entry === null && b.sl === 90 && b.strat === null && b.note.length === 200);
}

let done = false;
function finish() {
  if (done) return; done = true;
  console.log(res.join('\n'));
  const fails = res.filter((r) => r.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
}
