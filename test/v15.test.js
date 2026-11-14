// v15 unit tests: deep candle store + worker tick synthesis (data.js in a sandbox), the Binance provider's stream and
// pagination, the upgraded reconnecting socket, the launcher-feed client's input checks and the FPS governor.
const vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');

/* sandbox: core.js + data.js with a fake WebSocket and manual timers */
const timers = []; let clock = 1.7e12;
const sockets = [];
class FakeWS { constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); } send(x) { this.sent.push(JSON.parse(x)); } close() { this.readyState = 3; if (this.onclose) this.onclose(); } }
const sb = {
  console, Math, JSON, URL, Map, Set, Promise, Array, Object, Number, String, Error, isFinite, encodeURIComponent, AbortController,
  Date: Object.assign(function () { return new Date(clock); }, { now: () => clock, parse: Date.parse }),
  setTimeout: (f, ms) => { timers.push({ f, at: clock + (ms || 0) }); return timers.length; }, clearTimeout: () => { }, setInterval: (f, ms) => { const t = { f, at: clock + ms, every: ms }; timers.push(t); return t; }, clearInterval: (t) => { if (t) t.dead = true; },
  queueMicrotask: (f) => Promise.resolve().then(f), performance: { now: () => clock }, WebSocket: FakeWS, addEventListener: () => { },
};
const run = (ms) => { clock += ms; for (const t of timers.slice()) if (!t.dead && t.at <= clock) { if (t.every) t.at += t.every; else t.dead = true; t.f(); } };
vm.createContext(sb);
vm.runInContext(src('core.js') + '\n' + src('data.js') + '\nthis.X = { CandleStore, TickSynth, Feed, StoresBySym, getStore, BN, Sock, WSStat, J, CANDLE_CAP, NT };', sb);
const X = sb.X;
sb.isStock = (s) => /^[A-Z]{1,5}$/.test(s); sb.isOnchain = (s) => /^oc:/.test(s);

/* ── candle store: 5,000 deep, aggregated seconds applied to the active bar ── */
{
  const s = new X.CandleStore('BTC-USD', '15m'); const sec = s.sec;
  s.merge(Array.from({ length: 6000 }, (_, i) => ({ t: i * sec, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 })));
  ok('the store keeps the last 5,000 candles', X.CANDLE_CAP === 5000 && s.candles.length === 5000 && s.candles[0].t === 1000 * sec);
  const last = s.candles[4999].t;
  s.applyAgg({ t: last + 10, o: 1.6, h: 3, l: 0.2, c: 2.5, v: 4 });
  const b = s.candles[4999]; ok('a second of trades updates the active bar (h/l/c/v, open kept)', b.o === 1 && b.h === 3 && b.l === 0.2 && b.c === 2.5 && b.v === 5, JSON.stringify(b));
  s.applyAgg({ t: last + sec + 3, o: 2.5, h: 2.7, l: 2.4, c: 2.6, v: 2 });
  ok('a later second opens a new bar from its own open', s.candles.length === 5000 && s.candles[4999].t === last + sec && s.candles[4999].o === 2.5 && s.candles[4999].v === 2);
  const v = s.version; s.applyAgg({ t: last - sec, o: 9, h: 9, l: 9, c: 9, v: 9 }); ok('an older second never rewrites history', s.version === v && s.candles[4998].c !== 9);
  s.applyAgg({ t: last + sec + 5, o: 1, h: 1, l: 1, c: NaN, v: 1 }); ok('a bad price is ignored', s.candles[4999].c === 2.6);
  const lv = new X.CandleStore('BTC-USD', '1m'); lv.candles = [{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: 60, o: 1, h: 5, l: 0.5, c: 4, v: 9 }];
  lv.merge([{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: 60, o: 1, h: 2, l: 0.9, c: 1.5, v: 3 }]);
  ok('a late history fetch never shrinks the live bar', lv.candles[1].h === 5 && lv.candles[1].l === 0.5 && lv.candles[1].c === 4 && lv.candles[1].v === 9, JSON.stringify(lv.candles[1]));
  const st = new X.CandleStore('AAPL', '1h'); st.loaded = true; st.candles = [{ t: 0 }];
  ok('stocks and on-chain pools are not backfilled (one-call sources)', st.backfill() === null && Object.assign(new X.CandleStore('oc:solana:abcdefabcdefabcdefabcdef', '1h'), { loaded: true }).backfill() === null);
}

/* ── worker tick synthesis: the worker source folds trades per symbol per second; result equals tick-by-tick ── */
(async () => {
  const posted = []; const w = { postMessage: (x) => posted.push(x), setTimeout: (f) => f() };
  vm.createContext(w); vm.runInContext(X.TickSynth.SRC, w);
  const trades = [['BTC-USD', 100, 1, 1000.1], ['BTC-USD', 104, 2, 1000.5], ['BTC-USD', 99, 1, 1000.9], ['ETH-USD', 5, 3, 1000.2], ['BTC-USD', 101, 1, 1001.2]];
  w.onmessage({ data: trades });
  const g = posted.flat();
  ok('trades fold into one OHLCV per symbol per second', g.length === 3 && g[0].o === 100 && g[0].h === 104 && g[0].l === 99 && g[0].c === 99 && g[0].v === 4 && g[0].t === 1000 && g[2].t === 1001, JSON.stringify(g));
  const a = new X.CandleStore('BTC-USD', '15s'), b = new X.CandleStore('BTC-USD', '15s'); a.candles = [{ t: 990, o: 98, h: 98, l: 98, c: 98, v: 0 }]; b.candles = [{ t: 990, o: 98, h: 98, l: 98, c: 98, v: 0 }];
  for (const x of trades.filter((x) => x[0] === 'BTC-USD')) a.applyTick(x[1], x[2], x[3]);
  for (const x of g.filter((x) => x.s === 'BTC-USD')) b.applyAgg(x);
  ok('worker path builds the same bars as tick-by-tick', JSON.stringify(a.candles) === JSON.stringify(b.candles), JSON.stringify([a.candles, b.candles]));
  ok('without Web Workers trades go straight to the store', X.TickSynth.off === true && X.TickSynth.push('BTC-USD', 1, 1, 1) === false);
  const st = X.getStore('SOL-USD', '1m'); st.candles = [{ t: 960, o: 10, h: 10, l: 10, c: 10, v: 0 }];
  X.Feed.trade('SOL-USD', 11, 2, 'buy', 1000); ok('Feed.trade still updates candles on the fallback path', st.candles[0].c === 11 && st.candles[0].h === 11 && st.candles[0].v === 2);

  /* ── exchange-to-screen latency ── */
  X.WSStat.ms = null; X.WSStat.lag(clock / 1000 - 0.05); X.WSStat.lag(clock / 1000 + 120);
  ok('socket latency ignores impossible timestamps', X.WSStat.get() === 50, X.WSStat.get());

  /* ── Binance stream ── */
  const calls = []; const h = { tick: (...a) => calls.push(['tick', ...a]), trade: (...a) => calls.push(['trade', ...a]), state: () => { } };
  const s = X.BN.stream(h), ws = sockets[sockets.length - 1];
  ok('Binance uses the public spot stream', ws.url === 'wss://stream.binance.com:9443/ws');
  ws.readyState = 1; ws.onopen(); s.sub(['BTC-USD', 'ETH-USD']);
  ok('subscribing sends trade + ticker streams for USDT pairs', JSON.stringify(ws.sent[0].params) === JSON.stringify(['btcusdt@trade', 'btcusdt@ticker', 'ethusdt@trade', 'ethusdt@ticker']) && ws.sent[0].method === 'SUBSCRIBE');
  s.sub(['BTC-USD']); ok('re-subscribing a symbol sends nothing', ws.sent.length === 1);
  ws.onmessage({ data: JSON.stringify({ e: 'trade', s: 'BTCUSDT', p: '97000.5', q: '0.01', T: 1700000000123, m: true }) });
  ws.onmessage({ data: JSON.stringify({ e: '24hrTicker', s: 'ETHUSDT', c: '3300', o: '3200', b: '3299', a: '3301', v: '10', h: '3350', l: '3150' }) });
  ws.onmessage({ data: JSON.stringify({ e: '24hrTicker', s: 'ETHUSDT', c: '0' }) });
  ok('a trade maps to -USD with the taker side', calls[0][0] === 'trade' && calls[0][1] === 'BTC-USD' && calls[0][2] === 97000.5 && calls[0][4] === 'sell' && Math.abs(calls[0][5] - 1700000000.123) < 1e-6, JSON.stringify(calls[0]));
  ok('a ticker maps price, open and book', calls[1][0] === 'tick' && calls[1][1] === 'ETH-USD' && calls[1][2] === 3300 && calls[1][3].open24 === 3200 && calls[1][3].bid === 3299 && calls.length === 2);

  /* ── Binance klines pagination: 2,500 candles = 3 calls walking back with endTime ── */
  const urls = []; const realGet = X.J.get;
  X.J.get = async (u) => { urls.push(u); const lim = +/limit=(\d+)/.exec(u)[1], end = +((/endTime=(\d+)/.exec(u) || [])[1] || 3e12); const top = Math.floor(end / 60000) * 60000; return Array.from({ length: lim }, (_, i) => [top - (lim - 1 - i) * 60000, '1', '2', '0.5', '1.5', '7']); };
  const k = await X.BN.candles('BTC-USD', 60, 2500); X.J.get = realGet;
  ok('deep history pages 1,000 at a time', urls.length === 3 && /limit=1000/.test(urls[0]) && /endTime=/.test(urls[1]) && /limit=500/.test(urls[2]) && k.length === 2500, urls.join(' | '));
  ok('pages join oldest-first without gaps', k.every((c, i) => !i || c.t - k[i - 1].t === 60), k.slice(995, 1003).map((c) => c.t).join(','));
  let bad = null; try { await X.BN.candles('BTC-USD', 15, 10); } catch (e) { bad = e.message; } ok('an unsupported timeframe is refused', /no 15s/.test(bad || ''));

  /* ── reconnecting socket: keepalive, stale watchdog, backoff ── */
  let quiet = 30000; const sock = new X.Sock('wss://x.test', { onMsg: () => { }, staleMs: () => quiet, ping: { method: 'ping' }, pingMs: 10000 }); sock.open();
  const fw = sockets[sockets.length - 1]; fw.readyState = 1; fw.onopen();
  run(10000); ok('keepalive ping goes out on schedule', fw.sent.some((m) => m.method === 'ping'), JSON.stringify(fw.sent));
  run(25000); ok('a socket quiet past staleMs is closed and retried', fw.readyState === 3 && sockets[sockets.length - 1] === fw && sock.rt, sock.state);
  run(2000); ok('the retry opens a fresh socket', sockets[sockets.length - 1] !== fw && sockets[sockets.length - 1].url === 'wss://x.test');
  sock.close(); const n = sockets.length; run(60000); ok('close() stops retries', sockets.length === n);

  /* ── launcher feed client: only asked-for symbols, only sane numbers ── */
  const got = []; global.Feed = { live: { AAPL: { price: 190 } }, tick: (s, p, x) => got.push([s, p, x]) }; global.J = { proxy: true };
  const V15 = require('../src/v15core.js');
  V15.LFeed.apply({ prices: { 'oc:solana:AAA': { p: 0.5, ch24: 25 }, AAPL: { p: 190 }, MSFT: { p: 400 }, 'oc:solana:BBB': { p: -1 }, 'oc:solana:CCC': { p: 'x' }, 'oc:solana:DDD': { p: Infinity }, '<img src=x>': { p: 1 } } }, ['oc:solana:AAA', 'AAPL', 'oc:solana:BBB', 'oc:solana:CCC', 'oc:solana:DDD']);
  ok('feed prices reach the page only for requested symbols with finite positive prices', got.length === 1 && got[0][0] === 'oc:solana:AAA' && got[0][1] === 0.5 && Math.abs(got[0][2].open24 - 0.4) < 1e-12, JSON.stringify(got));
  V15.LFeed.apply(null, ['AAPL']); V15.LFeed.apply({ prices: 'nope' }, ['AAPL']); ok('junk replies are ignored', got.length === 1);

  /* ── FPS governor ── */
  const G = V15.FPSGov; G.hz = 240; G.avg = 0;
  for (let i = 0; i < 40; i++) G.cost(1.2); ok('cheap draws run at the display rate (240 Hz)', G.gap === 0 && G.target() === 240);
  for (let i = 0; i < 80; i++) G.cost(20); ok('20 ms draws step down to 30 fps', Math.round(1000 / G.gap) === 30 && G.target() === 30, G.gap);
  for (let i = 0; i < 80; i++) G.cost(5); ok('medium draws settle in between', G.target() > 30 && G.target() < 240, G.target());
  for (let i = 0; i < 120; i++) G.cost(0.8); ok('…and climb back once draws are cheap again', G.gap === 0);
  V15.Tele.el = null; global.WSStat = { get: () => 12 }; G.fps = 240; ok('telemetry pill text', V15.Tele.text() === '240 FPS · 12ms WS', V15.Tele.text());

  console.log(res.join('\n'));
  const p = res.filter((r) => r.startsWith('PASS')).length; console.log(`${p}/${res.length} passed`);
  process.exit(p === res.length ? 0 : 1);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
