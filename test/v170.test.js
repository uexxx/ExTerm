// ExTerm v17.0 unit tests: request epoch, timestamp normalisation, 512 dedup, Lee-Ready, composite venue merger + telemetry,
// depth buckets, Bybit/OKX adapters, OHLCV packing, LRU, formula compiler + columnar scan + sort, CSV, clipboard detection,
// backoff/heartbeat, worker wiring and static CSP / privacy checks.
const fs = require('fs'), path = require('path');
const V = require('../src/v170core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' — ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); } };

(async () => {
  // 1. epoch
  const E = new V.Epoch(); const e0 = E.get(); const pr = E.guard(new Promise((r) => setTimeout(() => r(42), 5))); E.bump();
  ok('epoch: a late answer after a switch resolves to STALE', (await pr) === V.STALE && E.get() === e0 + 1);
  ok('epoch: an answer within the same epoch passes through', (await E.guard(Promise.resolve(7))) === 7);

  // 2. timestamps
  const T = 1732170000123;
  ok('toMs: seconds / ms / µs / ns / ISO / numeric string all land on epoch ms', V.toMs(1732170000.123) === T && V.toMs(T) === T && V.toMs(T * 1000) === T && V.toMs(T * 1e6) === T && V.toMs(new Date(T).toISOString()) === T && V.toMs(String(T)) === T);
  ok('toMs: junk → NaN', Number.isNaN(V.toMs('nope')) && Number.isNaN(V.toMs(-5)) && Number.isNaN(V.toMs(null)));
  ok('fmtMs: HH:MM:SS.mmm', V.fmtMs(Date.UTC(2026, 0, 1, 9, 5, 7, 42), true) === '09:05:07.042');
  const D = new V.Dedup(512); for (let i = 0; i < 600; i++) D.add('s' + i);
  ok('dedup: capped at 512, oldest evicted first, duplicates rejected', D.size === 512 && D.add('s0') === true && D.add('s599') === false);

  // 3. Lee-Ready
  const Bt = V.BIT;
  ok('Lee-Ready: quote rule (above mid = buy, below = sell)', V.leeReady(100.6, 100, 101) === Bt.BUY && V.leeReady(100.4, 100, 101) === Bt.SELL);
  ok('Lee-Ready: at the mid falls back to the tick rule', V.leeReady(100.5, 100, 101, 100.4) === Bt.BUY && V.leeReady(100.5, 100, 101, 100.6) === Bt.SELL);
  ok('Lee-Ready: zero tick inherits the previous side', V.leeReady(10, 0, 0, 10, Bt.SELL) === Bt.SELL && V.leeReady(10, 0, 0, 10, Bt.BUY) === Bt.BUY);

  // 4. merger
  const M = new V.Merger(64), now = 1e12 + 5000;
  M.push('CB', 1e12, 100, 1, 'buy', 'a', now); M.push('KRK', 1e12 + 10, 100.2, 2, 'sell', null, now); M.push('BIN', 1e12 + 20, 100.1, 3, null, null, now);
  ok('merger: duplicate print (same venue + trade id) is dropped', M.push('CB', 1e12, 100, 1, 'buy', 'a', now) === -1 && M.dups === 1);
  ok('merger: the same print on two venues is NOT a duplicate', M.push('BYB', 1e12, 100, 1, 'buy', 'a', now) >= 0);
  const out = new Uint32Array(64);
  ok('merger: venue-mask filter (KRK only)', M.filter(V.vbit('KRK'), out) === 1 && M.row(out[0]).venue === 'KRK');
  ok('merger: All Aggregated returns every venue newest first', M.filter(V.ALL, out) === 4 && M.row(out[0]).venue === 'BYB');
  ok('merger: missing aggressor side is classified with Lee-Ready (tick rule vs venue prev)', (M.row(2).mask & 3) === Bt.BUY);
  ok('merger: per-venue CVD in USD', Math.abs(M.cvd(V.vbit('CB')) - 100) < 1e-9 && Math.abs(M.cvd(V.vbit('KRK')) + 200.4) < 1e-9);
  ok('merger: live venues, median lag and provenance pill', M.live(now).length === 4 && M.lagMs(now) > 0 && /^LIVE · \d+ms · AGGREGATED \[/.test(V.provenance(M.live(now), M.lagMs(now))));
  const S = new V.Merger(64); let q; for (let i = 0; i < 4; i++) q = S.push('CB', 2e12 + i * 100, 100 + i, 1, 'buy', 'x' + i, 2e12);
  ok('merger: 3+ same-side walking prints within 1 s are tagged SWEEP (back-tagged too)', (S.row(q).mask & Bt.SWEEP) && (S.row(0).mask & Bt.SWEEP));
  const W = new V.Merger(8); W.push('OKX', 3e12, 50000, 3, 'buy', 'w', 3e12);
  ok('merger: $150K print carries WHALE + BLOCK bits', (W.row(0).mask & Bt.WHALE) && (W.row(0).mask & Bt.BLOCK));
  const R = new V.Merger(4); for (let i = 0; i < 10; i++) R.push('CB', 4e12 + i, 10, 1, 'buy', 'r' + i, 4e12);
  ok('merger: ring wraps at capacity (no allocation growth)', R.size === 4 && R.filter(V.ALL, new Uint32Array(10)) === 4 && R.f.length === 16);

  // telemetry
  ok('basis %: perp over spot', Math.abs(V.basisPct(100, 100.5) - 0.5) < 1e-9 && V.basisPct(0, 1) === null);
  ok('aggregated funding: OI-weighted, plain mean without OI', Math.abs(V.aggFunding([{ rate: 0.0001, oi: 3 }, { rate: 0.0004, oi: 1 }]) - 0.000175) < 1e-12 && Math.abs(V.aggFunding([{ rate: 0.0001 }, { rate: 0.0003 }]) - 0.0002) < 1e-12 && V.aggFunding([]) === null);
  ok('cross-venue spread in bps', Math.abs(V.spreadBps({ CB: 100, KRK: 100.1 }) - 9.995) < 0.01 && V.spreadBps({ CB: 100 }) === null);
  const dep = V.depthBuckets({ CB: { bids: [[99.4, 1], [98.2, 5]], asks: [[100.6, 2]] }, BIN: { bids: [[99.1, 4]], asks: [[100.2, 1]] } }, 1);
  ok('depth: bids/asks bucketed across venues with a venue mask', dep.bids[0][0] === 99 && dep.bids[0][1] === 5 && dep.bids[0][2] === (V.vbit('CB') | V.vbit('BIN')) && dep.asks[0][0] === 101 && dep.asks[0][1] === 3);
  ok('depth: walls name every contributing venue', dep.walls.some((w) => w.price === 99 && w.venues.join() === 'CB,BIN'));

  // 5. adapters
  const by = V.EX2.bybit, ox = V.EX2.okx;
  ok('Bybit: symbol, subscribe, parse (Sell → sell, ms ts, trade id)', by.sym('BTC-USD') === 'BTCUSDT' && JSON.parse(by.sub('BTCUSDT')).args[0] === 'publicTrade.BTCUSDT' && by.parse(JSON.stringify({ topic: 'publicTrade.BTCUSDT', data: [{ T: 1732170000123, S: 'Sell', v: '0.5', p: '97000.5', i: 'abc' }] }))[0].side === 'sell');
  ok('OKX: symbol, subscribe, parse', ox.sym('ETH-USD') === 'ETH-USDT' && JSON.parse(ox.sub('ETH-USDT')).args[0].instId === 'ETH-USDT' && ox.parse({ arg: { channel: 'trades' }, data: [{ px: '3000', sz: '2', side: 'buy', ts: '1732170000123', tradeId: '9' }] })[0].price === 3000);
  ok('adapters ignore pongs, acks and garbage', by.parse('{"op":"pong"}').length === 0 && ox.parse('pong').length === 0 && by.parse('nope').length === 0);

  // 6. pack + LRU
  const cs = [{ t: 1, o: 2, h: 3, l: 1, c: 2.5, v: 9 }, [2, 2.5, 4, 2, 3, 8]], f = V.pack(cs);
  ok('pack: objects and arrays → one Float64Array (transferable)', f instanceof Float64Array && f.length === 12 && V.unpack(f)[1].c === 3 && V.unpack(f)[0].v === 9);
  const L = new V.LRU(50); for (let i = 0; i < 60; i++) L.set('k' + i, i); L.get('k10');
  ok('LRU: holds the last 50, a read refreshes recency', L.size === 50 && !L.has('k0') && L.has('k10') && L.keys()[49] === 'k10');

  // 8. formula
  const F = V.compile('RVOL > 3.0x AND Price > VWAP AND 5m Delta > +$50K');
  ok('formula: compound rule with x / $ / K suffixes and "5m Delta"', F.fn({ rvol: 3.5, price: 10, vwap: 9.5, delta5m: 60000 }) && !F.fn({ rvol: 3.5, price: 10, vwap: 9.5, delta5m: 40000 }) && F.fields.join() === 'rvol,price,vwap,delta5m');
  ok('formula: OR / NOT / parentheses / arithmetic', V.compile('(liq >= 1M OR mcap < 500k) AND NOT holders < 100').fn({ liq: 2e6, mcap: 1e9, holders: 150 }) && V.compile('price > vwap * 1.02').fn({ price: 103, vwap: 100 }) && !V.compile('price > vwap * 1.05').fn({ price: 103, vwap: 100 }));
  ok('formula: missing values never match', !V.compile('rvol > 1').fn({}));
  ok('formula: negative literals and %', V.compile('chg < -5%').fn({ ch: -7 }) && !V.compile('chg < -5%').fn({ ch: -2 }));
  const bad = V.tryCompile('rvol >> 3'), unk = V.tryCompile('wizard > 3'), inj = V.tryCompile('constructor.constructor("x")()');
  ok('formula: syntax errors, unknown fields and injection attempts are rejected (no eval)', !bad.ok && !unk.ok && /unknown field/.test(unk.error) && !inj.ok);
  const cols = ['rvol', 'price', 'vwap'], data = new Float64Array([4, 10, 9, 1, 10, 9, 5, 8, 9, NaN, 1, 1]);
  ok('scanColumns: columnar scan returns matching row indices', V.scanColumns('rvol > 3 AND price > vwap', cols, data, 4).join() === '0');
  ok('sortIndex: descending, missing last, stable', V.sortIndex(data, 3, 0, 4, true).join() === '2,0,1,3' && V.sortIndex(data, 3, 0, 4, false).join() === '1,0,2,3');
  ok('breakouts: only rows that newly match', V.breakouts(new Set(['a', 'b']), ['b', 'c', 'd']).join() === 'c,d');
  { const rows = Array.from({ length: 20000 }, (_, i) => [i % 7, 10 + (i % 13), 10]), d2 = new Float64Array(rows.flat()), t0 = Date.now(); V.scanColumns('rvol > 3 AND price > vwap', cols, d2, rows.length); V.sortIndex(d2, 3, 1, rows.length, true); ok('scan + sort 20k rows well under 250 ms', Date.now() - t0 < 250, Date.now() - t0); }

  // 9. CSV
  const csv = 'Date,Open,High,Low,Close,Volume\n2026-01-02,10,11,9,10.5,100\n2026-01-01,9,10,8,9.5,90\nbad,row\n2026-01-02,10,11,9,10.5,100';
  const P = V.parseCSV(csv), rows = V.unpack(P.f);
  ok('CSV: header detection, sorting, dedup, junk rows skipped', P.n === 2 && rows[0].c === 9.5 && rows[1].t === Date.UTC(2026, 0, 2) / 1000);
  ok('CSV: headerless numeric rows and semicolons', V.parseCSV('1700000000;1;2;0.5;1.5;10\n1700000060;1.5;2;1;1.8;5').n === 2 && V.parseCSV('').error);

  // 10. clipboard
  ok('clip: EVM contract address (also inside a DexScreener URL)', V.detectClip('0x4200000000000000000000000000000000000006').chain === 'evm' && V.detectClip('https://dexscreener.com/base/0x4200000000000000000000000000000000000006').value === '0x4200000000000000000000000000000000000006');
  ok('clip: Solana mint address', (V.detectClip('So11111111111111111111111111111111111111112') || {}).chain === 'solana' || (V.detectClip('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || {}).chain === 'solana');
  ok('clip: tickers ($sol, BTC-USD, NVDA) but not ordinary words or sentences', V.detectClip('$sol').value === 'SOL' && V.detectClip('BTC-USD').value === 'BTC-USD' && V.detectClip('NVDA').value === 'NVDA' && V.detectClip('hello') === null && V.detectClip('buy the dip') === null);

  // 11. backoff / heartbeat
  ok('backoff: 500 ms → 1 s → 2 s (held)', V.backoff(0) === 500 && V.backoff(1) === 1000 && V.backoff(2) === 2000 && V.backoff(9) === 2000);
  ok('heartbeat: emerald under 15 s, amber after', V.heartbeat(3000) === 'emerald' && V.heartbeat(16000) === 'amber' && V.heartbeat(NaN) === 'amber');

  // static wiring + safety
  const ui = src('v170.js'), core = src('v170core.js'), wk = src('worker.js'), build = fs.readFileSync(path.join(root, 'build.py'), 'utf8');
  ok('build: v170core + v170 bundled, v170core inlined into the worker before worker.js', /"v170core\.js", "v160\.js"/.test(build) && /"v166\.js", "v170\.js", "boot\.js"/.test(build) && /"v170core\.js", "worker\.js"/.test(build));
  ok('worker: v170 jobs return typed arrays as Transferables', /self\.postMessage\(Object\.assign\(\{ id: m\.id, done: true \}, o\), bufs\)/.test(wk) && /\[idx\.buffer\]/.test(wk) && /\[r\.f\.buffer\]/.test(wk));
  ok('CSP: no inline handlers, eval or new Function in v17.0 sources', !/\son[a-z]+=["']/i.test(ui + core) && !/\beval\(|new Function/.test(ui + core));
  ok('clipboard is read only when permission is already granted (no prompt)', /permissions\.query\(\{ name: 'clipboard-read' \}\)/.test(ui) && /st\.state !== 'granted'/.test(ui));
  ok('epoch wired into selectSym / setMode / chartRefresh', /selectSym = wrap\(selectSym\)/.test(ui) && /setMode = wrap\(setMode\)/.test(ui) && /chartRefresh = wrap\(chartRefresh\)/.test(ui));
  ok('privacy: no personal paths, emails or usernames in v17.0 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + core));
  ok('licence header: proprietary notice on both v17.0 files', [ui, core].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')));

  /* ══════════ v17.0 Phases 2–6 (V17P: v170pro.js · v170app.js · v170mob.js) ══════════ */
  const X = require('../src/v170pro.js'), app = src('v170app.js'), mob = src('v170mob.js'), pro = src('v170pro.js');
  const mk = (n, f) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: 1767225600 + i * 300, o: c, h: c * 1.004, l: c * 0.996, c: c * (i % 2 ? 1.001 : 0.999), v: 100 + (i % 7) * 10 }; });
  const Cw = mk(400, (i) => 100 + 6 * Math.sin(i / 18) + i * 0.01);

  // PHASE 2 · Edge-Coach
  const rts = X.roundTrips([{ sym: 'A', side: 'buy', price: 100, qty: 2, ts: (Cw[10].t) * 1000, fee: 0.2 }, { sym: 'A', side: 'sell', price: 104, qty: 1, ts: Cw[20].t * 1000, fee: 0.1 }, { sym: 'A', side: 'sell', price: 98, qty: 1, ts: Cw[30].t * 1000, fee: 0.1 }]);
  ok('P2 round trips: FIFO partial exits, fees split, ms → s timestamps', rts.length === 2 && Math.abs(rts[0].pnl - (4 - 0.1 - 0.1)) < 1e-9 && rts[1].pnl < 0 && rts[0].entryTs === Cw[10].t);
  const ex0 = X.excursion({ dir: 1, entryTs: Cw[10].t, exitTs: Cw[40].t, entry: Cw[10].c, exit: Cw[40].c, qty: 1 }, Cw);
  ok('P2 MFE / MAE: favourable ≥ 0, adverse ≥ 0, capture ≤ 1', ex0 && ex0.mfePct >= 0 && ex0.maePct >= 0 && ex0.capture <= 1 && ex0.mfe >= 0);
  const shd = X.shadow({ dir: 1, exitTs: Cw[100].t, exit: Cw[100].c, qty: 1 }, Cw, 14400);
  ok('P2 4h shadow counterfactual: complete window, return vs exit, verdict', shd && shd.complete && Number.isFinite(shd.ret) && /early|good|neutral/.test(shd.verdict) && Math.abs(shd.px - Cw[148].c) < 1e-9);
  const hm = X.heatmap([{ entryTs: Date.UTC(2026, 0, 5, 14) / 1000, pnl: 5 }, { entryTs: Date.UTC(2026, 0, 5, 14, 30) / 1000, pnl: -1 }, { entryTs: Date.UTC(2026, 0, 6, 3) / 1000, pnl: 2 }]);
  ok('P2 hour × weekday heatmap (UTC): counts and win rate per cell', hm.grid[1][14].n === 2 && hm.grid[1][14].rate === 0.5 && hm.grid[2][3].rate === 1);
  const of1 = X.overfit([{ is: { ret: 0.4, sharpe: 2.5 }, oos: { ret: -0.1, sharpe: -0.5 } }, { is: { ret: 0.3, sharpe: 2 }, oos: { ret: -0.05, sharpe: -0.2 } }]), of2 = X.overfit([{ is: { ret: 0.1, sharpe: 1 }, oos: { ret: 0.09, sharpe: 0.95 } }, { is: { ret: 0.12, sharpe: 1.1 }, oos: { ret: 0.11, sharpe: 1.05 } }]);
  ok('P2 walk-forward overfitting score: 0–100, curve-fit ≫ robust', of1.score >= 70 && of2.score <= 25 && of1.score <= 100 && of2.score >= 0 && of2.grade === 'Robust');
  ok('P2 anchored walk-forward folds never overlap their OOS window with IS', X.wfFolds(500, 4).every((f) => f.oosFrom > f.isTo && f.oosTo < 500));
  const pGood = X.propSim(Array.from({ length: 60 }, (_, i) => (i % 3 ? 0.012 : -0.006)), { size: 100000, sims: 800, seed: 3 }), pBad = X.propSim(Array.from({ length: 60 }, (_, i) => (i % 3 ? -0.02 : 0.01)), { size: 50000, sims: 800, seed: 3 });
  ok('P2 prop-firm simulator: $50K/$100K/$200K presets, good edge passes, bad edge breaches', [50000, 100000, 200000].every((k) => X.PROP[k].size === k) && pGood.pass > 0.7 && pBad.pass < 0.05 && Math.abs(pGood.pass + pGood.failDaily + pGood.failDD + pGood.timeout - 1) < 1e-9);
  ok('P2 prop simulator is reproducible with a seed', X.propSim([0.01, -0.005, 0.008], { sims: 300, seed: 9 }).pass === X.propSim([0.01, -0.005, 0.008], { sims: 300, seed: 9 }).pass);
  const grid = X.rrGrid(Cw, Cw.map((_, i) => i).filter((i) => i % 15 === 0));
  ok('P2 R:R heatmap: 6×6 cells over 0.5×–3.0× ATR with a best cell', grid.cells.length === 6 && grid.cells.every((r) => r.length === 6) && grid.mults[0] === 0.5 && grid.mults[5] === 3 && grid.best && grid.n > 10);
  ok('P2 simEntry: stop hit = −1R, target hit = +TP/SL R', X.simEntry([{ c: 100, h: 100, l: 100 }, { c: 99, h: 100, l: 98 }], 0, 1, 2) === -1 && X.simEntry([{ c: 100, h: 100, l: 100 }, { c: 102, h: 103, l: 100 }], 0, 1, 2) === 2);
  const kel = X.kelly(0.55, 2, 1);
  ok('P2 Kelly sizer: full = p − q/b, half and quarter', Math.abs(kel.full - 0.325) < 1e-9 && Math.abs(kel.half - 0.1625) < 1e-9 && Math.abs(kel.quarter - 0.08125) < 1e-9 && X.kelly(0.3, 1, 1).full === 0);
  const sr = X.slipResim([{ entry: 100, exit: 101, qty: 10, pnl: 10 }], 50);
  ok('P2 slippage re-sim: 50 bps per side erodes P&L exactly', Math.abs(sr.pnl - (10 - (201 * 10 * 0.005))) < 1e-9 && X.slipCurve([{ entry: 1, exit: 1, qty: 1, pnl: 0 }]).map((x) => x.bps).join() === '0,5,10,20,30,40,50');
  const Pcsv = V.parseCSV('time,open,high,low,close,volume\n1700000000,1,2,0.5,1.5,10');
  ok('P2 OHLCV CSV import feeds the coach (V170.parseCSV → candles)', Pcsv && Pcsv.n === 1 && /x17Csv/.test(app) && /V170\.parseCSV\(txt\)/.test(app));
  const lint = X.pineLint('//@version=4\nstudy("x")\nx = security(syminfo.tickerid, "D", close)\nplot(sma(close, 10), transp=50)\ny := 2\nif (close > open\n'), clean = X.pineLint('//@version=5\nindicator("ok", overlay=true)\nlen = input.int(20)\nplot(ta.ema(close, len))\n');
  ok('P2 Pine v5 linter: version, study, security, ta. namespace, transp, := before =, unbalanced (', ['Version 4', 'indicator()', 'request.security', 'ta.sma', 'transp=', '"y" is reassigned', 'unclosed "("'].every((k) => lint.some((i) => i.msg.includes(k))) && clean.length === 0);
  const sheet = X.tearSheet({ title: 'T <script>', sym: 'BTC-USD', at: 0 }, { ret: 0.1, dd: 0.05, sharpe: 1.2 }, rts, { overfit: 20 });
  ok('P2 Obsidian/Gold tear sheet: self-contained, escaped, no scripts, gold #F5C84B on #07080B', /#07080B/.test(sheet) && /#F5C84B/.test(sheet) && !/<script/i.test(sheet) && /&lt;script&gt;/.test(sheet) && /All Rights Reserved/.test(sheet));
  const lk = X.leaks(rts.concat(rts, rts), { ex: [{ capture: 0.1, maePct: 0.05 }, { capture: 0.2, maePct: 0.04 }], overfit: { score: 80, grade: 'Curve-fit' }, slip: [{ bps: 20, base: 5, pnl: -1 }] });
  ok('P2 backtest leaks ranked by severity + AI coach prompt', lk.length >= 3 && lk[0].sev === 3 && /trading coach/.test(X.coachPrompt(lk, { ret: 0.1, dd: 0.05, sharpe: 1 }, { sym: 'X' })) && /Send Backtest Leaks to AI Coach/.test(app));
  const exp = JSON.parse(X.exportPlaybook({ name: 'Breakout', apiKey: 'sk-123', secret: 'x', params: { fast: 9, wallet: 'So11111111111111111111111111111111111111112', nested: { password: 'p', webhookUrl: 'https://x.y' } }, note: 'see https://evil.example', addr: '0x4200000000000000000000000000000000000006' }));
  ok('P2 .exterm.json export sanitizes keys, secrets, wallets, URLs and addresses', exp.format === 'exterm.playbook' && exp.playbook.name === 'Breakout' && !('apiKey' in exp.playbook) && !('secret' in exp.playbook) && exp.playbook.params.fast === 9 && !('wallet' in exp.playbook.params) && JSON.stringify(exp.playbook.params.nested) === '{}' && !('note' in exp.playbook) && !('addr' in exp.playbook));
  ok('P2 .exterm.json import validates format, version, name; blocks __proto__', X.importPlaybook(JSON.stringify(exp)).ok && !X.importPlaybook('{"format":"x"}').ok && !X.importPlaybook('nope').ok && X.importPlaybook('{"format":"exterm.playbook","v":1,"playbook":{"name":"a","__proto__":{"polluted":1}}}').ok && ({}).polluted === undefined);

  // PHASE 3 · canvas, fleet, briefing, GEX, DOM, workspaces
  const sch = new X.Scheduler(['static', 'live']); let paints = 0; sch.on('static', () => paints++);
  sch.mark('static'); sch.tick(); const N = 200000, t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) sch.tick(); const idleMs = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  ok('P3 dirty-flag scheduler: paints once when dirty, idle tick < 0.002 ms', paints === 1 && sch.idle === N && idleMs < 0.002, idleMs.toFixed(6) + ' ms');
  const sg = new X.SpatialGrid(24); for (let i = 0; i < 5000; i++) sg.insert((i % 100) * 30, Math.floor(i / 100) * 20, 20, 14, i); const t1 = process.hrtime.bigint(); let hit = null; for (let i = 0; i < 100000; i++) hit = sg.hit(305, 205); const hitMs = Number(process.hrtime.bigint() - t1) / 1e6 / 1e5;
  ok('P3 O(1) spatial hash hit-test: correct item, flat cost with 5,000 boxes', hit === 1010 && sg.hit(-50, -50) === null && hitMs < 0.005, hitMs.toFixed(6) + ' ms');
  ok('P3 Bot Fleet: 3 modes (Paper Sandbox / Attended Co-Pilot / Live Unattended 24/7)', X.MODES.map((m) => m.label).join('|') === 'Paper Sandbox|Attended Co-Pilot|Live Unattended 24/7');
  const arm = { ack: true, settled: 5000, cap: 2000, slipBps: 15, dailyLoss: 200, phrase: 'ARM LIVE BOT' };
  ok('P3 5-step arming wizard: each step blocks (ack, zero-overdraft cap, bps, kill-switch, phrase)', X.armCheck(arm).ok && X.armCheck(Object.assign({}, arm, { ack: false })).step === 0 && X.armCheck(Object.assign({}, arm, { cap: 6000 })).step === 1 && X.armCheck(Object.assign({}, arm, { slipBps: 500 })).step === 2 && X.armCheck(Object.assign({}, arm, { dailyLoss: 0 })).step === 3 && X.armCheck(Object.assign({}, arm, { phrase: 'arm live bot' })).step === 4 && X.ARM_STEPS.length === 5);
  const armed = Object.assign({ armed: true }, arm);
  ok('P3 fleet guard: cap, slippage and kill-switch enforced on every order', X.fleetGuard({ usd: 500, px: 100, ref: 100 }, armed, 0).ok && !X.fleetGuard({ usd: 2500 }, armed, 0).ok && !X.fleetGuard({ usd: 100, px: 100.5, ref: 100 }, armed, 0).ok && !X.fleetGuard({ usd: 100 }, Object.assign({}, armed, { lossToday: 200 }), 0).ok && !X.fleetGuard({ usd: 1 }, { armed: false }, 0).ok);
  const tor = X.torus(48, 18, 1, 0.38); let onT = true; for (let i = 0; i < tor.length; i += 3) { const d = Math.hypot(Math.hypot(tor[i], tor[i + 1]) - 1, tor[i + 2]); if (Math.abs(d - 0.38) > 1e-5) onT = false; }
  ok('P3 Neural Strategy Torus: Float32Array mesh on the torus surface; 0 fps when hidden', tor instanceof Float32Array && tor.length === 48 * 18 * 3 && onT && /cancelAnimationFrame\(U\.torus\.raf\)/.test(app) && /curTab !== 'fleet'/.test(app));
  const evo = X.evolve({ a: 0 }, { a: [-10, 10, 1] }, (p) => -Math.abs(p.a - 7), 60, 5);
  ok('P3 self-improving loop: seeded hill-climb improves monotonically', evo.score >= evo.history[0] && evo.history.every((v, i, h) => !i || v >= h[i - 1]) && evo.params.a === 7);
  const day = Math.floor(Cw[Cw.length - 1].t / 86400) * 86400, lv = X.morningLevels(Cw, Cw[Cw.length - 1].t, 0, 0), prev = Cw.filter((c) => c.t >= day - 86400 && c.t < day);
  ok('P3 morning levels: PDH / PDL / PDC + floor pivots', lv && lv.pdh === Math.max(...prev.map((c) => c.h)) && lv.pdl === Math.min(...prev.map((c) => c.l)) && Math.abs(lv.pivot - (lv.pdh + lv.pdl + lv.pdc) / 3) < 1e-9 && lv.r1 > lv.pivot && lv.s1 < lv.pivot);
  const bc = X.bs(100, 100, 0.25, 0.04, 0.3, 'C'), bp = X.bs(100, 100, 0.25, 0.04, 0.3, 'P');
  ok('P3 Black-Scholes: put-call parity, call delta ∈ (0,1), gamma equal for C/P', Math.abs(bc.price - bp.price - (100 - 100 * Math.exp(-0.04 * 0.25))) < 1e-3 && bc.delta > 0.5 && bc.delta < 1 && Math.abs(bc.gamma - bp.gamma) < 1e-12);
  const gx = X.gex([{ strike: 90, type: 'P', oi: 5000, gamma: 0.02 }, { strike: 95, type: 'P', oi: 1000, gamma: 0.03 }, { strike: 105, type: 'C', oi: 1500, gamma: 0.03 }, { strike: 110, type: 'C', oi: 6000, gamma: 0.02 }], 100);
  ok('P3 live GEX: call wall, put wall, zero-gamma flip between them', gx.callWall === 110 && gx.putWall === 90 && gx.flip > 95 && gx.flip < 110 && /gamma/.test(gx.regime) && X.modelChain(100).length > 20);
  const snaps = [{ t: 0, bids: [[99, 1], [98, 50], [97, 1]], asks: [[101, 1], [102, 1]], last: 100 }, { t: 1500, bids: [[99, 1], [98, 50], [97, 1]], asks: [[101, 1], [102, 1]], last: 100 }, { t: 2500, bids: [[99, 1], [98, 1], [97, 1]], asks: [[101, 1], [102, 1]], last: 100 }];
  ok('P3 DOM spoof ladder: a big wall pulled in < 3 s without trading there is flagged', X.spoofs(snaps).length === 1 && X.spoofs(snaps)[0].px === 98 && X.spoofs(snaps.map((s) => Object.assign({}, s, { last: 97.5 }))).length === 0);
  const up = mk(300, (i) => 100 + i * 0.5), cf = X.confluence(Object.fromEntries(X.TF6.map(([k]) => [k, up])));
  ok('P3 6-TF confluence strip: 6 votes, +6 in a clean uptrend, resampler keeps OHLC', cf.votes.length === 6 && cf.score === 6 && cf.label === 'Strong bull' && X.resample(up, 900).length === Math.ceil(up.length / 3) && X.resample(up, 900)[0].h === Math.max(up[0].h, up[1].h, up[2].h));
  const lq = X.liqClusters(Cw, Cw[Cw.length - 1].c);
  ok('P3 crypto liquidation clusters: longs below price, shorts above', lq.longs.length && lq.shorts.length && lq.longs.every((x) => x.px < Cw[Cw.length - 1].c) && lq.shorts.every((x) => x.px > Cw[Cw.length - 1].c));
  const hp = X.rugSim({ baseReserve: 1e6, quoteReserve: 1e5, sellTax: 0.9 }), safe = X.rugSim({ baseReserve: 1e6, quoteReserve: 5e5, sellTax: 0, lpLockedPct: 1, top10: 0.15 });
  ok('P3 On-Chain rug / honeypot sim: honeypot flagged, safe pool gets Rug Shield, impact grows', hp.verdict === 'DANGER' && hp.flags.some((f) => /HONEYPOT/.test(f)) && safe.shield && safe.verdict === 'OK' && safe.impacts[3].impact > safe.impacts[0].impact);
  const sb = X.sniperBundles([{ wallet: 'a', slot: 0, amount: 100, funder: 'F' }, { wallet: 'b', slot: 1, amount: 50, funder: 'F' }, { wallet: 'c', slot: 0, amount: 10 }, { wallet: 'd', slot: 9, amount: 999, funder: 'F' }], 0);
  ok('P3 block-0 sniper bundles grouped by funder; later blocks ignored', sb.bundles.length === 1 && sb.bundles[0].wallets.join() === 'a,b' && sb.snipers === 3 && Math.abs(sb.bundledPct - 150 / 160) < 1e-9);
  ok('P3 smart-money leaderboard ranks by win rate and P&L, ignores < 5 trades', X.smartMoney([{ name: 'a', trades: 20, wins: 15, pnl: 1e5 }, { name: 'b', trades: 20, wins: 8, pnl: 1e3 }, { name: 'c', trades: 2, wins: 2, pnl: 1e9 }]).map((w) => w.name).join() === 'a,b');
  const spread = [{ type: 'C', side: 'buy', strike: 100, qty: 1, prem: 5 }, { type: 'C', side: 'sell', strike: 110, qty: 1, prem: 2 }];
  ok('P3 options multi-leg: payoff, breakeven, greeks, 1σ/2σ cone', X.payoff(spread, 90) === -300 && X.payoff(spread, 120) === 700 && Math.abs(X.breakevens(spread, 80, 130)[0] - 103) < 0.2 && X.legGreeks(spread, 105, 30 / 365).delta > 0 && X.cone(100, 0.5, 30)[1].hi > X.cone(100, 0.5, 30)[0].hi);
  const vpC = Array.from({ length: 200 }, (_, i) => ({ t: Date.UTC(2026, 0, 5, 14, 30) / 1000 + i * 60, h: 101 + (i % 5), l: 99 + (i % 5), c: 100 + (i % 5), v: i % 5 === 2 ? 500 : 50 })), vp = X.volProfile(vpC, 'rth', 20, -300);
  ok('P3 futures RTH / ETH volume profile: POC inside the value area (70%)', vp && vp.val <= vp.poc && vp.poc <= vp.vah && X.isRTH(Date.UTC(2026, 0, 5, 15) / 1000, -300) && !X.isRTH(Date.UTC(2026, 0, 5, 22) / 1000, -300) && !X.isRTH(Date.UTC(2026, 0, 4, 15) / 1000, -300));
  const tr = X.tickRisk('ES', 5000, 4990, { riskUsd: 1500 });
  ok('P3 tick risk calculator: ES 10 pts = 40 ticks = $500/contract → 3 contracts for $1,500', tr.ticks === 40 && tr.perContract === 500 && tr.contracts === 3 && X.tickRisk('MNQ', 100, 99, { contracts: 2 }).risk === 4);
  const evs = X.lastEvents(X.FOMC, Date.UTC(2026, 10, 21), 12), react = X.reaction(Cw, [{ kind: 'FOMC', date: 'x', t: Cw[50].t }], [300, 1500]);
  ok('P3 Pulse: last-12 FOMC events before now, reaction measured from in-memory candles', evs.length === 12 && evs[0].date === '2026-10-28' && evs.every((e) => e.t * 1000 <= Date.UTC(2026, 10, 21)) && Math.abs(react[0].moves[0] - (Cw[51].c / Cw[50].c - 1)) < 1e-12);
  ok('P3 Pulse makes 0 extra network calls (no fetch / J.get in the Pulse block except the explicit SEC button)', (() => { const s = app.slice(app.indexOf('const Pulse = {'), app.indexOf('U.pulse = Pulse')); return !/fetch\(/.test(s) && (s.match(/J\.get\(/g) || []).length === 2 && /async sec\(\)/.test(s); })());
  const bsk = X.betaShock([{ value: 10000, beta: 1.5 }, { value: 5000, beta: 0.5, dir: -1 }], -10);
  ok('P3 portfolio beta shock slider −10% ↔ +10%', Math.abs(bsk.pnl - (-1500 + 250)) < 1e-9 && Math.abs(X.beta([0.01, -0.02, 0.03, 0.01, -0.01, 0.02], [0.005, -0.01, 0.015, 0.005, -0.005, 0.01]) - 2) < 1e-9 && /min="-10" max="10"/.test(app));
  const obC = Cw.slice(); obC[200] = Object.assign({}, obC[200], { o: obC[200].c * 1.003 }); for (let k = 201; k <= 203; k++) obC[k] = Object.assign({}, obC[k], { c: obC[200].c * (1 + 0.02 * (k - 200)), h: obC[200].c * (1 + 0.021 * (k - 200)) });
  ok('P3 3D volumetric order blocks: displacement after an opposite candle, with volume', X.orderBlocks(obC, 2).some((b) => b.i === 200 && b.side === 'bull' && b.vol > 0) && /x17Scrub/.test(app) && /L2 Wall Fusion/.test(app));
  const rr0 = X.rr(100, 98, 103);
  ok('P3 R:R ruler + NET BE line + smart trailing stops (only tighten)', rr0.mult === 1.5 && rr0.t2 === 104 && Math.abs(X.netBE(100, 1, 0.001, 0.0005) - 100 / 0.9985) < 1e-9 && X.trail(up, { entry: up[100].c, sl: up[100].c * 0.9, dir: 1, t0: up[100].t }, 'atr', 3) > up[100].c * 0.9 && X.trail(up, { entry: 100, sl: 1e9, dir: 1 }, 'atr') === null);
  const vc = X.parseVoice('Buy $500 of SOL with stop at 140'), vt = X.parseVoice('timeframe 5 minutes'), vo = X.parseVoice('open bot fleet');
  ok('P3 voice commands: orders staged (never auto-sent), TF, tabs, symbols', vc.kind === 'order' && vc.usd === 500 && vc.sym === 'SOL' && vc.stop === 140 && vc.confirm && vt.tf === '5m' && X.parseVoice('show eth').sym === 'ETH' && X.parseVoice('open pulse').tab === 'pulse' && vo.kind === 'tab' && vo.tab === 'fleet' && X.parseVoice('go to quant lab').tab === 'lab' && X.parseVoice('flatten').confirm === true);
  const db2 = X.debate({ conf: 4, rsi: 25, vwapDist: 0.01, cvd: 5e5, funding: -0.001, gexRegime: 'negative gamma', atrPct: 0.02 });
  ok('P3 Bull / Bear / Risk debate: three sides + verdict', db2.bull.length >= 4 && db2.risk.length >= 2 && db2.verdict === 'Bull case stronger');

  // PHASE 4 · Academy
  ok('P4 Academy: 5 modules, 15 interactive missions covering v17 tools', X.ACADEMY.length === 5 && X.ACADEMY.flatMap((m) => m.missions).length === 15 && X.academyProgress({ m1a: 1, m1b: 1, m1c: 1 }).modules[0].done && X.academyProgress({}).pct === 0);
  const tm = X.topMistake([{ pnl: -5, tags: ['FOMO', 'news'] }, { pnl: -2, tags: ['FOMO'] }, { pnl: 9, tags: ['news', 'news'] }]);
  ok('P4 custom drill targets the top losing mistake tag', tm.tag === 'FOMO' && tm.n === 2 && X.drill(tm).rules.length >= 2 && /FOMO/.test(X.drill(tm).title) && X.drill(null).tag === 'plan');

  // PHASE 5 · languages, mobile, polish
  ok('P5 first-launch picker: exactly EN/ES/ZH/JA/KO/FR/DE/PT/AR(RTL)/HI, saved in IndexedDB', X.LANG10.map((l) => l[0].split('-')[0]).join() === 'en,es,zh,ja,ko,fr,de,pt,ar,hi' && X.isRtl('ar') && !X.isRtl('en') && /indexedDB\.open\('exterm-v17'/.test(mob) && /U\.pset\('lang'/.test(mob));
  ok('P5 Hide Balances renders $***,***', X.maskBal('$12,345.67', true) === '$**,***.**' && X.maskBal('$1', false) === '$1' && /content:"\$\*\*\*,\*\*\*"/.test(fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8')));
  ok('P5 1-tap Phantom / Solflare / Jupiter / Uniswap deep links; $0 ExTerm fee; bad CAs rejected', /^https:\/\/jup\.ag\/swap\//.test(X.deepLink('jupiter', { ca: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })) && /phantom\.app\/ul\/browse/.test(X.deepLink('phantom', { ca: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })) && /solflare\.com\/ul/.test(X.deepLink('solflare', { ca: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })) && /app\.uniswap\.org\/swap/.test(X.deepLink('uniswap', { ca: '0x4200000000000000000000000000000000000006' })) && X.deepLink('uniswap', { ca: 'javascript:alert(1)' }) === null && /ExTerm adds a \$0 fee/.test(mob));
  const qrm = X.qr('https://uexxx.github.io/ExTerm/#x17setup=abc');
  ok('P5 QR pairing encoder: square matrix, finder patterns, version scales with data', qrm && qrm.size === qrm.version * 4 + 17 && qrm.m[0].slice(0, 7).every(Boolean) && qrm.m[6].slice(0, 7).every(Boolean) && !qrm.m[1][1] && X.qr('x'.repeat(150)).version > qrm.version);
  ok('P5 PIN policy (4–8 digits, no repeats or runs) + PBKDF2 hashing + WebAuthn biometrics', X.PIN_OK('4831') && !X.PIN_OK('1111') && !X.PIN_OK('1234') && !X.PIN_OK('12a4') && /PBKDF2/.test(mob) && /userVerification: 'required'/.test(mob));
  ok('P5 sizing keypad: digits, decimal guard, % of max, clear', X.sizeKeys('1', '2') === '12' && X.sizeKeys('1.5', '.') === '1.5' && X.sizeKeys('', '50%', 1000) === '500' && X.sizeKeys('99', 'C') === '' && X.sizeKeys('12', '⌫') === '1');
  ok('P5 mobile < 820 px: 5-tab dock, thumb arc, swipe, landscape split, handedness, AMOLED #000000, PiP, share card', X.DOCK.length === 5 && /max-width:819px/.test(fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8')) && ['x17Arc', 'touchstart', 'orientation:landscape', 'x17-left', 'x17-amoled', 'requestPictureInPicture', 'exterm-setup.png'].every((k) => (mob + fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8')).includes(k)));
  const reachBlock = app.slice(app.indexOf('const REACH_GO = {'), app.indexOf('const ICON = {'));
  ok('P5 1-click reach: all 14 surfaces wired on the Reach strip (v17.1: 3D moved onto the chart, AI Bridge / Quant Lab only in the nav)', X.REACH.length === 14 && !X.REACH.includes('3D') && X.REACH.every((n) => reachBlock.includes("'" + n + "': ()")));

  // PHASE 6 · build, CSP, licence, privacy, APK workflow
  ok('P6 build: v17 Pro files bundled after v170.js and right before boot.js', /V17_PRO = \["v170pro\.js", "v170app\.js", "v170mob\.js", "v171core\.js", "v171\.js"\]/.test(build) && /order\.index\("boot\.js"\)/.test(build));
  ok('P6 CSP: no inline handlers, eval or new Function in v17 Pro sources', !/\son[a-z]+=["']/i.test(app + mob + pro) && !/\beval\(|new Function/.test(app + mob + pro));
  ok('P6 licence: proprietary header on every v17 Pro file; zero MIT/AGPL text in shipped docs', [app, mob, pro].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')) && ['LICENSE', 'README.md', 'BRAND_GUIDELINES.md', 'package.json'].every((f) => !/\b(MIT|AGPL)\b/.test(fs.readFileSync(path.join(root, f), 'utf8'))));
  ok('P6 privacy: no personal paths, emails or usernames in v17 Pro sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(app + mob + pro));
  ok('P6 Android: GitHub workflow builds the APK', fs.existsSync(path.join(root, '.github', 'workflows', 'build-android-apk.yml')) && /ExTerm-v17\.\d-android\.apk/.test(fs.readFileSync(path.join(root, '.github', 'workflows', 'build-android-apk.yml'), 'utf8')));
  ok('P6 live bot dispatch is localhost-only and HMAC-signed', /\^http:\\\/\\\/\(127\\\.0\\\.0\\\.1\|localhost\)/.test(app) && /name: 'HMAC', hash: 'SHA-256'/.test(app));

  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
