// ExTerm v17.1 unit tests: ring buffer, AMM x*y=k + L2 impact, reactive ledger (stops, partial TPs, trailing HWM,
// resting orders, NET BE, Shift+Esc flatten, JSON round-trip), stale-feed guard, failover order, (epoch ms, price)
// drawing anchors, sub-penny notation, Copilot routing + action pills + local analyst, option stats, cross-DEX arb,
// plus static checks on the build order and the UI module.
const fs = require('fs'), path = require('path');
const V = require('../src/v171core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i) : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

// ring
const R = new V.Ring(3); for (let i = 1; i <= 5; i++) R.push(i);
ok('ring: fixed capacity, oldest pruned, order kept', R.size === 3 && R.toArray().join() === '3,4,5' && R.last() === 5 && R.a.length === 3);

// AMM
const a = V.amm(1000, 1000, 'buy', 10, 0);
ok('amm: x*y=k buy output and impact', near(a.out, 1000 - 1e6 / 1010) && a.impactPct > 0.99 && a.impactPct < 1.01, a);
const big = V.amm(1000, 1000, 'buy', 500, 30);
ok('amm: impact grows with size and fee', big.impactPct > 50 && V.amm(1000, 1000, 'sell', 10, 30).impactPct > 0);
const fd = V.estimateFill({ px: 0.000002115, usd: 1000, side: 'buy', liqUsd: 50000 });
ok('estimateFill: DEX pool uses AMM model (~4% on $1K into $50K liq)', fd.model === 'AMM x·y=k' && fd.impactPct > 3.5 && fd.impactPct < 5, fd);
const lw = V.l2Walk([[100, 1], [101, 1], [102, 10]], 250);
ok('l2Walk: walks levels, avg and impact vs best', near(lw.avg, 250 / (1 + 1 + 49 / 102), 1e-9) && lw.impactPct > 0 && !lw.partial, lw);
ok('l2Walk: partial when the book is too thin', V.l2Walk([[100, 1]], 1000).partial === true);
const fc = V.estimateFill({ px: 60000, usd: 10000, side: 'buy', depthUsd: 5e6 });
ok('estimateFill: CEX without book uses synthetic L2, tiny impact', fc.model === 'L2 est.' && fc.impactPct < 0.1 && fc.avg > 60000, fc);

// ledger
const L = new V.Ledger({ fee: 0.001 });
const p = L.open({ sym: 'BTC-USD', qty: 1, avg: 100, sl: 95, tps: [{ px: 110, frac: 0.5 }], trail: { pct: 5 } });
ok('ledger: NET BE above entry by fees both ways', L.netBE(p.id) > 100.19 && L.netBE(p.id) < 100.21, L.netBE(p.id));
let ev = L.onTick('BTC-USD', 104, 1);
ok('ledger: trailing stop ratchets with the high-water mark', ev.some((e) => e.k === 'trail') && near(L.pos[p.id].sl, 104 * 0.95) && L.pos[p.id].trail.hwm === 104);
L.onTick('BTC-USD', 101, 2);
ok('ledger: trail never loosens', near(L.pos[p.id].sl, 98.8));
ev = L.onTick('BTC-USD', 111, 3);
ok('ledger: partial TP closes half', ev.some((e) => e.k === 'tp') && near(L.pos[p.id].qty, 0.5));
ev = L.onTick('BTC-USD', 100, 4);
ok('ledger: stop closes the rest', ev.some((e) => e.k === 'sl') && !L.pos[p.id] && L.closed.size === 2);
L.order({ sym: 'ETH-USD', side: 'buy', type: 'limit', px: 3000, qty: 2 });
ok('ledger: resting limit fills on cross', L.onTick('ETH-USD', 3010, 5).length === 0 && L.onTick('ETH-USD', 2999, 6).some((e) => e.k === 'order') && L.list('ETH-USD').length === 1);
L.order({ sym: 'SOL-USD', side: 'buy', px: 100, qty: 1 }); L.open({ sym: 'SOL-USD', qty: 3, avg: 150, dir: -1 });
const fl = L.flattenAll((s) => ({ 'ETH-USD': 3100, 'SOL-USD': 140 }[s]), 7);
ok('ledger: Shift+Esc flatten closes all positions and cancels all orders', fl.closed.length === 2 && fl.cancelled === 1 && !Object.keys(L.pos).length && !Object.keys(L.orders).length && fl.pnl > 0, fl);
const L2 = V.Ledger.from(JSON.parse(JSON.stringify(Object.assign(new V.Ledger(), {}).toJSON())));
const L3 = new V.Ledger(); L3.open({ sym: 'X', qty: 2, avg: 5, sl: 4 }); const back = V.Ledger.from(JSON.parse(JSON.stringify(L3.toJSON())));
ok('ledger: JSON round-trip for IndexedDB', L2.list().length === 0 && back.list().length === 1 && back.list()[0].sl === 4);
const Lc = new V.Ledger({ cap: 8 }); for (let i = 0; i < 100; i++) Lc.emit({ k: 'x', i });
ok('ledger: event log is a pruned ring (no 24/7 growth)', Lc.events.size === 8 && Lc.events.last().i === 99);

// stale guard
const G = new V.StaleGuard(5000); G.ok(1000); G.fail(2000, 'HTTP 429');
ok('stale: fresh while within 5 s of the last good tick', !G.state(5999).stale);
ok('stale: all providers failing > 5 s → STALE with age', G.state(7000).stale && G.state(7000).ageS === 6 && G.state(7000).why === 'HTTP 429');
G.ok(7100); ok('stale: a fresh tick clears it', !G.state(7200).stale);
const G2 = new V.StaleGuard(); ok('stale: no data and no failures is not stale', !G2.state(1e6).stale);
ok('rpcOrder: publicnode last, cooling hosts skipped', V.rpcOrder(['https://solana-rpc.publicnode.com', 'https://a.x', 'https://b.y'], { 'a.x': 2e12 }, 1e12).join() === 'https://b.y,https://solana-rpc.publicnode.com');
ok('isRateOrTls: 429 / SSL / fetch failures trigger failover', V.isRateOrTls('HTTP 429') && V.isRateOrTls('SSLError: EOF') && !V.isRateOrTls('HTTP 404'));

// drawings
const d = V.anchor({ type: 'line', t1: 1732170000, t2: 1732173600, p1: 1, p2: 2 });
ok('anchor: chart seconds stamped as epoch ms', d.ms1 === 1732170000000 && d.ms2 === 1732173600000);
ok('project: re-projects into a ms-based store and back, idempotent', V.project(d, 'ms') && d.t1 === 1732170000000 && V.project(d, 's') && d.t1 === 1732170000 && !V.project(d, 's'));

// formatting
ok('tiny: subscript sub-penny notation', V.tiny(0.000002115, true) === '$0.0₅2115' && V.tiny(0.00001965) === '0.0₄1965' && V.tiny(60316.4, true) === '$60,316.4');
const mg = V.monogram('oc:solana:abc', 'solana');
ok('monogram: never blank (letters + hue + chain)', mg.txt === 'AB' && mg.chain === 'SOL' && mg.hue >= 0 && V.monogram('', '').txt === '?');

// copilot
ok('keyKind: detects Claude / Grok / OpenAI keys', V.keyKind('sk-ant-api03-xyz') === 'claude' && V.keyKind('xai-abc') === 'grok' && V.keyKind('sk-proj-' + 'a'.repeat(60)) === 'openai');
const rq = V.llmRequest({ id: 'claude' }, 'K', 'SYS', [{ role: 'user', content: 'hi' }]);
ok('llmRequest: Claude uses the native Messages API with browser-access header and fallback', rq.url === 'https://api.anthropic.com/v1/messages' && rq.headers['x-api-key'] === 'K' && rq.headers['anthropic-dangerous-direct-browser-access'] === 'true' && rq.body.model === 'claude-opus-5-5' && rq.body.system === 'SYS' && rq.body.temperature === undefined);
const ro = V.llmRequest({ id: 'ollama' }, '', 'SYS', [{ role: 'user', content: 'hi' }]);
ok('llmRequest: Ollama via the launcher, OpenAI-compatible, no key', ro.url === '/ollama/v1/chat/completions' && !ro.headers.Authorization && ro.body.messages[0].role === 'system');
ok('llmText: reads both response shapes and refusals', V.llmText({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'A' }] }) === 'A' && V.llmText({ choices: [{ message: { content: 'B' } }] }) === 'B' && /declined/.test(V.llmText({ content: [], stop_reason: 'refusal' })));
const acts = V.parseActions('Entry 64,250 with stop-loss at $62,900. Target 68000. Support 63,000, resistance 66,500. An EMA cross works. [[cmd: backtest ema on BTC 1h]]');
ok('parseActions: Plot · R:R Ruler · Quant Lab · Bot rule · cmd pills', ['plot', 'ruler', 'lab', 'bot', 'cmd'].every((k) => acts.some((x) => x.kind === k)) && acts[0].levels.length === 5 && acts[1].entry === 64250 && acts[1].stop === 62900, acts);
const C = Array.from({ length: 80 }, (_, i) => ({ t: i, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i }));
const an = V.analyst('what now?', { sym: 'TEST', candles: C, cvd: 5000, rug: 'LP locked' });
ok('analyst: deterministic answer with bias, levels and pills (no dead-end)', /Bullish/.test(an) && /Entry/.test(an) && /Rug Shield/.test(an) && V.parseActions(an).some((x) => x.kind === 'ruler'));
ok('analyst: too few candles still answers', /not enough candles/.test(V.analyst('x', { candles: [] })));

// options + arb
const chain = [{ strike: 90, type: 'P', oi: 500, iv: 0.6 }, { strike: 100, type: 'P', oi: 300, iv: 0.5 }, { strike: 100, type: 'C', oi: 400, iv: 0.45 }, { strike: 110, type: 'C', oi: 900, iv: 0.42 }];
const os = V.optStats(chain, 100, [0.3, 0.6]);
ok('optStats: P/C ratio, max pain, IV rank, skew', near(os.pcr, 800 / 1300) && os.maxPain === 100 && near(os.ivRank, 50) && near(os.skew, 0.18), os);
const arb = V.dexArb([{ dex: 'Raydium', price: 1.0, liq: 2e6 }, { dex: 'Orca', price: 1.01, liq: 5e5 }, { dex: 'Meteora', price: 1.004, liq: 1e5 }]);
ok('dexArb: cross-DEX spread, buy-low / sell-high, per-pool impact', arb.buy === 'Raydium' && arb.sell === 'Orca' && near(arb.spreadBps, 100, 1e-6) && arb.rows[0].i10k > arb.rows[0].i1k, arb);

// static: build + module wiring
const b = src('build.py'), ui = src('src/v171.js');
ok('build: v171core + v171 load after the v17.0 modules and before boot', /"v170mob\.js", "v171core\.js", "v171\.js"/.test(b) && b.indexOf('v171.js') < b.lastIndexOf('boot.js'));
ok('ui: global ledger, bus, Shift+Esc, stale lock, chart 3D, neural core, search everywhere', ['__EXTERM_LEDGER', '__EXTERM_BUS', "'Escape'", 'STALE FEED', 'DELAYED DATA', 'x171-3d', 'ResizeObserver', 'x171-search'].every((k) => ui.includes(k)));
ok('ui: strict CSP (no eval / inline handlers)', !/\beval\(|new Function|onclick="/.test(ui) && !/\beval\(|new Function/.test(src('src/v171core.js')));
ok('license header on new files', [ui, src('src/v171core.js')].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')));

console.log(`\nv17.1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
