// ExTerm v15 phase 4 unit tests: sub-minute candle continuity (trades → bars and live ticks), minimum body height,
// buy-pressure windows (tick rule, bars, DEX counts), dense bubble layout + collision, Launch Radar brackets and the
// Grok setup payload, the scanner (RVOL, signal-now, gainers), sparklines, unified watchlist and layout classes.
const vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const NT = require('../src/strategies4.js');
const P4 = require('../src/v15p4core.js');
const P3 = require('../src/v15p3core.js');

/* ── 1. candle continuity + body ── */
{
  const sb = { console, Date, Math, JSON, Map, Set, Promise, setTimeout, clearTimeout, queueMicrotask, isFinite, parseFloat, URL, encodeURIComponent, AbortController: function () { this.signal = {}; this.abort = () => {}; } };
  vm.createContext(sb);
  vm.runInContext(src('core.js') + '\nthis.NT = NT;', sb);
  Object.assign(sb, { isStock: (s) => /^[A-Z]{1,5}$/.test(s), isOnchain: (s) => /^oc:/.test(s), document: { querySelector: () => null }, location: { protocol: 'file:' }, fetch: async () => { throw new Error('offline'); } });
  vm.runInContext(src('data.js') + '\nthis.TFX = TFX; this.CandleStore = CandleStore;', sb);
  const { TFX, CandleStore } = sb;
  // a gappy tape: price jumps between buckets (the classic micro-gap)
  const tr = [{ t: 100.1, p: 10, q: 1 }, { t: 100.6, p: 10.4, q: 1 }, { t: 101.2, p: 10.9, q: 1 }, { t: 101.8, p: 10.7, q: 2 }, { t: 104.3, p: 10.2, q: 1 }, { t: 104.9, p: 10.25, q: 1 }];
  for (const tf of [1, 5, 15]) {
    const b = TFX.fromTrades(tr.map((x) => Object.assign({}, x)), tf);
    const gaps = b.slice(1).filter((k, i) => k.o !== b[i].c).length;
    ok(`${tf}s bars: every open equals the prior close (no micro-gaps)`, gaps === 0 && b.length >= 1, JSON.stringify(b));
    ok(`${tf}s bars: high/low still contain the anchored open`, b.every((k) => k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c)));
  }
  ok('1s: time stays continuous (quiet seconds become flat bars)', TFX.fromTrades(tr.map((x) => Object.assign({}, x)), 1).map((k) => k.t).join(',') === '100,101,102,103,104');
  const s = new CandleStore('BTC-USD', '5s'); s.candles = [{ t: 100, o: 10, h: 10.5, l: 9.9, c: 10.4, v: 3 }];
  s.applyTick(10.9, 1, 105.2);
  ok('live tick opening a 5s bar anchors its open to the prior close', s.candles[1].o === 10.4 && s.candles[1].l === 10.4 && s.candles[1].h === 10.9 && s.candles[1].c === 10.9, JSON.stringify(s.candles[1]));
  s.applyAgg({ t: 110, o: 11.2, h: 11.3, l: 11.1, c: 11.25, v: 2 });
  ok('worker-folded second opening a bar anchors too', s.candles[2].o === 10.9 && s.candles[2].l === 10.9 && s.candles[2].h === 11.3);
  const q = new CandleStore('DOGE-USD', '5s'); q.candles = [{ t: 100, o: 1, h: 1, l: 1, c: 1, v: 1 }]; q.applyTick(1.2, 1, 117);
  // v16.4 contract (see v164.test.js "quiet seconds are never back-filled"): no flat Vol-0 bars for quiet 5s buckets; the
  // next traded bucket still opens at the prior close, so the series stays gap-free in price.
  ok('quiet 5s buckets are not back-filled; the next traded bar opens at the prior close', q.candles.map((k) => k.t).join(',') === '100,115' && q.candles[1].o === 1 && q.candles[1].l === 1 && q.candles[1].c === 1.2 && q.candles[1].v === 1, JSON.stringify(q.candles));
  const m = new CandleStore('BTC-USD', '1m'); m.candles = [{ t: 60, o: 10, h: 10.5, l: 9.9, c: 10.4, v: 3 }]; m.applyTick(10.9, 1, 121);
  ok('1m and above keep the real first-trade open (TradingView behaviour)', m.candles[1].o === 10.9);
  const r = NT.bodyRect(100, 100, 50.3, 8);
  ok('flat candle body is a clean ≥2 px bar centred on the price', r.h >= 2 && Math.abs(r.y + r.h / 2 - 100) <= 1 && Number.isInteger(r.x) && Number.isInteger(r.y), JSON.stringify(r));
  const r2 = NT.bodyRect(80, 120, 50, 10);
  ok('normal bodies keep their height and are pixel-snapped', r2.h === 40 && r2.y === 80 && r2.w === 7);
  ok('thin zoom still gets a visible body', NT.bodyRect(10, 10.2, 5, 1).w >= 1 && NT.bodyRect(10, 10.2, 5, 1).h >= 2);
}

/* ── 2. buy-pressure windows ── */
{
  const now = 10000;
  const up = []; for (let i = 0; i < 200; i++) up.push({ t: now - 3600 + i * 18, p: 100 + i * 0.1 + (i % 5 === 0 ? -0.3 : 0), q: 1 });
  const tp = P4.tickPressure(up, now - 3600);
  ok('tick rule: a rising tape is mostly buyer-initiated', tp && tp.bp > 0.6 && tp.bp < 1, JSON.stringify(tp));
  ok('tick rule: weights by size', P4.tickPressure([{ t: 1, p: 1, q: 1 }, { t: 2, p: 2, q: 9 }, { t: 3, p: 1.5, q: 1 }], 0).bp === 0.9);
  ok('tick rule: zero ticks keep the previous side', P4.tickPressure([{ t: 1, p: 1 }, { t: 2, p: 2 }, { t: 3, p: 2 }, { t: 4, p: 2 }], 0).buy === 3);
  const p1 = P4.pressure({ trades: up }, '1h', now), p2 = P4.pressure({ trades: up }, '5m', now);
  ok('pressure uses ticks when they cover the window', p1.src === 'ticks' && p2.src === 'ticks');
  const bars = []; for (let i = 0; i < 300; i++) bars.push({ t: now - 300 * 300 + i * 300, o: 10, c: i % 4 ? 11 : 9, v: 10 });
  const pb = P4.pressure({ trades: up, candles: bars }, '24h', now);
  ok('24h falls back to bars when ticks are too short, with up-volume share', pb.src === 'bars' && Math.abs(pb.bp - 0.75) < 0.02, JSON.stringify(pb));
  const pc = P4.pressure({ ch: { '24h': 6 } }, '4h', now);
  ok('no ticks or bars: a change proxy, labelled approximate', pc.src === 'change' && pc.approx && pc.bp > 0.5 && pc.bp < 0.98);
  ok('no data at all: neutral 50 %', P4.pressure({}, '1m', now).bp === 0.5 && P4.pressure({}, '1m', now).src === 'none');
  ok('all six windows exist', P4.WIN_KEYS.join(',') === '1m,5m,15m,1h,4h,24h' && !P4.winOk('constructor') && !P4.winOk('2h'));
  const st = { buys5m: 30, sells5m: 10, buys15m: 50, sells15m: 50, buys1h: 10, sells1h: 30, buys6h: 70, sells6h: 30, buys24: 400, sells24: 600 };
  ok('DEX: 5m / 15m / 1h / 24h read their own counts', P4.ocPressure(st, '5m').bp === 0.75 && P4.ocPressure(st, '15m').bp === 0.5 && P4.ocPressure(st, '1h').bp === 0.25 && P4.ocPressure(st, '24h').bp === 0.4 && !P4.ocPressure(st, '1h').approx);
  ok('DEX: 1m and 4h use the nearest window and say so', P4.ocPressure(st, '1m').approx && P4.ocPressure(st, '1m').field === '5m' && P4.ocPressure(st, '4h').field === '6h' && P4.ocPressure(st, '4h').approx);
  ok('DEX: missing counts fall back (15m → 5m) or go neutral', P4.ocPressure({ buys5m: 1, sells5m: 3 }, '15m').bp === 0.25 && P4.ocPressure({}, '1h').bp === 0.5);
}

/* ── 3. dense bubbles ── */
{
  const items = []; for (let i = 0; i < 400; i++) items.push({ id: 'S' + i, bp: (i % 10) / 10, ch: (i % 21) - 10, size: 1 + (i % 50) });
  const W = 1200, H = 600;
  const d1 = P4.bubbleTargets(items, W, H, { density: 1 }), d3 = P4.bubbleTargets(items, W, H, { density: 3 });
  ok('density 3 shows 3× the bubbles of density 1', d1.length === 60 && d3.length === 180);
  ok('denser maps use smaller bubbles', Math.max(...d3.map((n) => n.r)) < Math.max(...d1.map((n) => n.r)));
  ok('targets sit inside the canvas; high pressure plots higher', d3.every((n) => n.tx - n.r >= 0 && n.tx + n.r <= W && n.ty - n.r >= 0 && n.ty + n.r <= H) && d3.find((n) => n.bp === 0.9).ty < d3.find((n) => n.bp === 0.1).ty);
  let ov = 0; for (let k = 0; k < 400; k++) ov = P4.relax(d3, W, H, 0.08);
  const pairs = []; for (let i = 0; i < d3.length; i++) for (let j = i + 1; j < d3.length; j++) { const a = d3[i], b = d3[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.8) pairs.push([a.id, b.id]); }
  ok('grid relaxation separates 180 bubbles (no deep overlaps)', pairs.length < 6, pairs.length + ' deep overlaps, last pass ' + ov);
  ok('everything stays inside after relaxing', d3.every((n) => n.x >= n.r && n.x <= W - n.r && n.y >= n.r && n.y <= H - n.r));
  const t0 = process.hrtime.bigint(); for (let k = 0; k < 240; k++) P4.relax(d3, W, H); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 240;
  ok('one relaxation pass of 180 bubbles costs well under a 240 Hz frame (4.1 ms)', ms < 2, ms.toFixed(3) + ' ms');
  ok('hit test finds the top bubble', P4.hit([{ id: 'a', x: 10, y: 10, r: 5 }, { id: 'b', x: 12, y: 10, r: 5 }], 11, 10).id === 'b' && P4.hit([{ id: 'a', x: 10, y: 10, r: 5 }], 100, 100) === null);
  ok('colour buckets are bounded −8..8', P4.bucket(999, 10) === 8 && P4.bucket(-999, 10) === -8 && P4.bucket(null, 10) === 0);
}

/* ── 4. Launch Radar brackets + Grok payload ── */
{
  const now = Date.UTC(2026, 10, 13, 12);
  ok('age brackets: <1h, 1–6h, 6–24h, 24h+', P4.bracketOf(59 * 60) === 'new' && P4.bracketOf(3600) === 'run' && P4.bracketOf(5.9 * 3600) === 'run' && P4.bracketOf(6 * 3600) === 'est' && P4.bracketOf(23 * 3600) === 'est' && P4.bracketOf(25 * 3600) === 'trend' && P4.bracketOf(NaN) === 'trend');
  const ages = { a: 10 * 60, b: 2 * 3600, c: 12 * 3600, d: 3 * 86400, e: null, f: 30 * 60 };
  const g = P4.groupRadar(Object.keys(ages), (s) => (ages[s] == null ? null : now - ages[s] * 1000), now);
  ok('groupRadar keeps order inside brackets and files unknown ages as trending', g.map((x) => x.id + ':' + x.rows.join('')).join(' ') === 'new:af run:b est:c trend:de', JSON.stringify(g));
  ok('bracket labels match the spec', g.map((x) => x.l).join('|') === 'New Launches <1h|1h–6h Runners|6h–24h Established|24h+ Trending');
  const setup = P4.radarSetup('oc:solana:abc', { price: 0.002, buys1h: 80, sells1h: 20, created: Date.now() - 20 * 60000 }, '1h', 'PEPE<script>');
  const b = P3.bridge(Object.assign({}, setup, { ts: 1 }));
  ok('Send to Grok: buy-side setup with entry / SL / TP that the bridge accepts', b.side === 'buy' && b.entry === 0.002 && b.sl < b.entry && b.tp > b.entry && b.tf === '1h' && b.sym === 'oc:solana:abc', JSON.stringify(b));
  ok('Send to Grok: note carries pressure + bracket, capped', /80% buys \(1h\)/.test(b.note) && /New Launches <1h/.test(b.note) && b.note.length <= 200);
  ok('Send to Grok: seller-dominated pools become a sell setup', P4.radarSetup('oc:solana:x', { price: 1, buys1h: 1, sells1h: 9 }, '1h').side === 'sell');
}

/* ── 5. scanner ── */
{
  const c = []; for (let i = 0; i < 60; i++) c.push({ t: i * 300, o: 100, h: 101, l: 99, c: 100 + (i % 3) - 1, v: i === 59 ? 500 : 100 });
  ok('RVOL: newest bar vs mean of the previous 20', Math.abs(P4.rvol(c, 20) - 5) < 1e-9 && P4.rvol([], 20) === 0 && P4.rvol(c.map((k) => Object.assign({}, k, { v: 0 })), 20) === 0);
  const always = { prepare: () => ({}), onBar: () => [{ side: 'buy' }] }, never = { prepare: () => ({}), onBar: () => [] }, boom = { prepare: () => { throw new Error('x'); }, onBar: () => [] };
  ok('signalNow: entry on the newest bar / none / errors are contained', P4.signalNow(always, c) === 'buy' && P4.signalNow(never, c) === null && P4.signalNow(boom, c) === null && P4.signalNow(always, c.slice(0, 5)) === null);
  const real = Object.keys(NT.strategies).slice(0, 12).map((k) => P4.signalNow(NT.strategies[k], c, NT.defaultParams(k)));
  ok('signalNow runs real library strategies without throwing', real.every((x) => x === null || x === 'buy'));
  const r = P4.scan([{ sym: 'A', ch: 5, rvol: 1 }, { sym: 'B', ch: 12, rvol: 4.2, sigs: ['EMA'] }, { sym: 'C', ch: -3, rvol: 3.1 }, { sym: 'D', ch: null, rvol: 2.9 }, { sym: '' }], { top: 5, rvolMin: 3 });
  ok('scan: gainers sorted, RVOL > 3× spikes, signal matches', r.gainers.map((x) => x.sym).join('') === 'BAC' && r.spikes.map((x) => x.sym).join('') === 'BC' && r.signals.map((x) => x.sym).join('') === 'B');
}

/* ── 6. sparklines, watchlist, layout ── */
{
  const now = 1000, t = []; for (let i = 0; i < 600; i++) t.push({ t: now - 60 + i * 0.1, p: 100 + Math.sin(i / 30) });
  const pts = P4.sparkPoints(t, now, 60, 120);
  ok('sparkline buckets 600 sub-second ticks into ≤120 points', pts.length > 100 && pts.length <= 120 && pts[pts.length - 1].p === t[t.length - 1].p);
  const path = P4.sparkPath(pts, 84, 24);
  ok('sparkline path fits the box', path.every(([x, y]) => x >= 0 && x <= 84 && y >= 0 && y <= 24) && P4.sparkPath([{ t: 1, p: 1 }], 84, 24).length === 0);
  ok('flat prices draw a flat line, not NaN', P4.sparkPath([{ t: 1, p: 5 }, { t: 2, p: 5 }], 84, 24).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const w = P4.unifiedWatch({ crypto: { watch: ['BTC-USD', 'SOL-USD'] }, stocks: { watch: ['NVDA', 'SPY', 'BTC-USD'] }, onchain: { watch: ['oc:solana:x', 42] } });
  ok('unified watchlist merges all three modes, de-duplicated, strings only', w.map((x) => x.sym + '/' + x.mode).join(' ') === 'BTC-USD/crypto SOL-USD/crypto NVDA/stocks SPY/stocks oc:solana:x/onchain');
  ok('layout classes: phone / tablet / half-screen / full', P4.layoutFor(390, true) === 'phone' && P4.layoutFor(820, true) === 'tablet' && P4.layoutFor(1000, true) === 'tablet' && P4.layoutFor(960, false) === 'half' && P4.layoutFor(1280, false) === 'half' && P4.layoutFor(1920, false) === 'full');
}

/* ── 7. security: the UI module never builds inline handlers or unescaped HTML from data ── */
{
  const ui = src('v15p4.js');
  ok('v15p4.js has no inline on* handlers, eval or new Function', !/\son[a-z]+\s*=\s*["'`]/i.test(ui.replace(/addEventListener\('[a-z]+'/g, '')) && !/\beval\(|new Function/.test(ui));
  const interp = [...ui.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]).filter((x) => /\b(m\.s|m\.n|n\.d\.label|n\.d\.name|x\.sym|s\b)/.test(x) && !/esc\(|safeUrl\(|label\(|CSS\.escape|modeTag|\.length|\?|\.map\(/.test(x));
  ok('symbols and names are always escaped when interpolated', interp.length === 0, interp.join(' | '));
}

console.log(res.join('\n'));
const fails = res.filter((x) => x.startsWith('FAIL'));
console.log(`${res.length - fails.length}/${res.length} passed`);
process.exit(fails.length ? 1 : 0);
