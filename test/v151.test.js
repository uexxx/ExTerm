// ExTerm v15.1 core unit tests: Candle X mark, % risk sizing, killzones, ghost line, correlation, event pins,
// whale markers, setup JSON (hostile input), prop-challenge evaluation, regime lock, presets and hotkeys.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const V = require('../src/v151core.js');

// 1. brand mark
const svg = V.markSvg(32, 'a"><script>');
ok('mark: 8 candles in 4 colour quadrants (2 each)', V.CANDLES.length === 8 && ['tl', 'tr', 'bl', 'br'].every((k) => V.CANDLES.filter((c) => c.k === k).length === 2));
ok('mark: exact palette (white TL, gold BL, champagne TR, silver BR, gold diamond, ring)', V.COL.tl === '#F8FAFC' && V.COL.bl === '#C99A32' && V.COL.tr === '#F3D06B' && V.COL.br === '#CBD5E1' && V.COL.diamond === '#E5C158' && V.COL.ring0 === '#B8943A' && V.COL.ring1 === '#D4AF37');
ok('mark: quadrants sit in an X (TL up-left, BR down-right)', V.CANDLES.filter((c) => c.k === 'tl').every((c) => c.x < 32 && c.y < 32) && V.CANDLES.filter((c) => c.k === 'br').every((c) => c.x > 32 && c.y > 32));
ok('mark: every candle (with wick) stays inside the ring', V.CANDLES.every((c) => [c.y - c.h / 2 - c.w, c.y + c.h / 2 + c.w].every((y) => Math.hypot(c.x - 32, y - 32) < 28)));
ok('mark: self-contained SVG, no script, no external refs, id sanitised', /^<svg[^>]*viewBox="0 0 64 64"/.test(svg) && !/<script|href=|on\w+=/i.test(svg) && /id="ascriptR"/.test(svg), svg.slice(0, 160));
ok('favicon: data URI svg', /^data:image\/svg\+xml,%3Csvg/.test(V.markDataUri()));
let ops = 0; const g = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' && /^[a-z]/.test(k) ? (...a) => { ops++; } : undefined), set: () => true });
V.drawMark(g, 0, 0, 64); V.drawWordmark(g, 0, 0, 40);
ok('canvas mark + wordmark draw without errors', ops > 30);

// 2. % risk size
const p = V.posSize({ equity: 100000, riskPct: 1, entry: 100, sl: 95 });
ok('1% of $100k with a 5% stop = $20k position, $1k risk', p && Math.abs(p.usd - 20000) < 0.01 && Math.abs(p.riskUsd - 1000) < 0.01 && !p.capped, JSON.stringify(p));
const p2 = V.posSize({ equity: 10000, riskPct: 2, entry: 100, sl: 99.9 });
ok('tight stop is capped at equity', p2 && p2.usd === 10000 && p2.capped);
ok('no stop / bad input → null', V.posSize({ equity: 1e5, riskPct: 1, entry: 100, sl: 0 }) === null && V.posSize({ equity: 1e5, riskPct: 1, entry: 100, sl: 100 }) === null && V.posSize({ equity: -1, riskPct: 1, entry: 1, sl: 0.5 }) === null);

// 3. killzones (2026-11-16 is a Monday; EST = -5h)
const at = (h, m, day = 16) => Date.UTC(2026, 10, day, h + 5, m) / 1000;
let s = V.session(at(9, 45), -18000); ok('NY Open active at 09:45 ET with 1h15m left', s.active === 'NY Open' && s.left === 75 * 60, JSON.stringify(s));
s = V.session(at(3, 0), -18000); ok('London active at 03:00 ET', s.active === 'London');
s = V.session(at(15, 30), -18000); ok('Power Hour active at 15:30 ET', s.active === 'Power Hour');
s = V.session(at(12, 0), -18000); ok('midday: next is Power Hour in 3h', !s.active && s.next === 'Power Hour' && s.inSec === 3 * 3600, JSON.stringify(s));
s = V.session(at(21, 0), -18000); ok('Asia active Monday 21:00 ET', s.active === 'Asia');
s = V.session(at(12, 0, 14), -18000); ok('Saturday: next session is Sunday-evening Asia', !s.active && s.next === 'Asia' && s.inSec === 32 * 3600, JSON.stringify(s));
ok('duration format', V.fmtDur(75 * 60) === '1h 15m' && V.fmtDur(65) === '1m 05s');

// 4. ghost line
const main = [1, 2, 3, 4].map((i) => ({ t: i * 60, c: 100 + i })), bench = [{ t: 60, c: 50 }, { t: 120, c: 55 }, { t: 240, c: 60 }];
const gh = V.ghost(main, bench, 0, 4);
ok('ghost starts at the main close and scales by bench return', gh[0] === 101 && Math.abs(gh[1] - 111.1) < 1e-9 && Math.abs(gh[2] - 111.1) < 1e-9 && Math.abs(gh[3] - 121.2) < 1e-9, JSON.stringify(gh));
ok('ghost: bench starting after the window → nulls then values', V.ghost(main, [{ t: 180, c: 10 }], 0, 4).map((x) => x == null ? 'n' : 'v').join('') === 'nnvv');

// 5. correlation
const days = Array.from({ length: 60 }, (_, i) => i * 86400), a = [], b = [], c = [];
let x = 100, y = 50, z = 30; for (let i = 0; i < 60; i++) { const r = Math.sin(i * 1.7) * 0.02; x *= 1 + r; y *= 1 + r * 2; z *= 1 - r; a.push({ t: days[i], c: x }); b.push({ t: days[i] + 3600, c: y }); c.push({ t: days[i], c: z }); }
const cm = V.corrMatrix({ A: a, B: b, C: c, E: [] });
ok('correlation: diagonal 1, co-moving ≈ +1, inverse ≈ −1, aligned by date', cm.M[0][0] === 1 && cm.M[0][1] > 0.99 && cm.M[0][2] < -0.99, JSON.stringify(cm.M.slice(0, 3).map((r) => r.slice(0, 3))));
ok('correlation: empty series → null, never NaN', cm.M[0][3] === null && cm.M[3][0] === null);

// 6. pins
const pins = V.pins({ sym: 'BTC-USD', t0: 1000, t1: 5000, intel: [{ sev: 'CRITICAL', ts: 2000, title: 'Strait closed', source: 'AP' }, { sev: 'HIGH', ts: 2100, title: 'x' }, { sev: 'CRITICAL', ts: 9000, title: 'late' }],
  closed: [{ sym: 'BTC-USD', src: 'bot', ts: 3000e3, openTs: 1500e3, win: true, pct: 2.5, exit: { price: 101 }, entry: { price: 99 } }, { sym: 'ETH-USD', src: 'bot', ts: 3000e3 }, { sym: 'BTC-USD', src: 'manual', ts: 3000e3 }],
  why: () => ['hit the planned target'] });
ok('pins: CRITICAL in range + bot entry/exit for this symbol only', pins.map((q) => q.kind + ':' + q.t).join() === 'BOT:1500,MACRO:2000,BOT:3000', JSON.stringify(pins));
ok('pins: bot exit carries the autopsy reason and result', pins[2].sub === 'hit the planned target' && pins[2].label === 'Win +2.50%' && pins[2].price === 101);
ok('pinAt finds the nearest pin within tolerance', V.pinAt(pins, (t) => t / 10, 201).t === 2000 && V.pinAt(pins, (t) => t / 10, 260) === null);

// 7. whale markers
ok('whale: size × price over threshold', V.whaleMark('BTC-USD', 100000, 3, 'buy', 10, null, 250000).usd === 300000 && V.whaleMark('BTC-USD', 100000, 1, 'buy', 10, null, 250000) === null);
const sm = V.whaleMark('oc:solana:x', 0.01, 1, 'sell', 10, { usd: 5000, who: 'A'.repeat(99), smart: true }, 2500);
ok('smart money: tracked wallet flag + launcher usd + label (truncated)', sm.kind === 'smart' && sm.who.length === 40 && sm.side === 'sell');
ok('an untracked trader address alone is a whale, not smart money', V.whaleMark('oc:solana:x', 0.01, 1, 'buy', 10, { usd: 5000, who: 'SomeAddr' }, 2500).kind === 'whale');
const arr = []; for (let i = 0; i < 350; i++) V.pushCapped(arr, i, 300); ok('marker buffer capped', arr.length === 300 && arr[0] === 50);

// 8. setup JSON
const out = V.setupOut({ sym: 'SOL-USD', tf: '1h', entry: 150, sl: 140, tp: 170, riskPct: 1, note: 'n' });
const back = V.setupIn(out, (t) => t === '1h');
ok('setup JSON round-trips', back.ok && back.setup.sym === 'SOL-USD' && back.setup.entry === 150 && back.setup.sl === 140 && back.setup.tp === 170 && back.setup.tf === '1h');
ok('rejects non-JSON, foreign JSON, bad symbol', !V.setupIn('nope').ok && !V.setupIn('{"a":1}').ok && !V.setupIn(JSON.stringify({ v: 1, app: 'ExTerm', sym: '<img src=x>', entry: 1 })).ok);
ok('rejects inverted stop / target and missing entry', !V.setupIn(JSON.stringify({ v: 1, app: 'ExTerm', sym: 'BTC-USD', entry: 100, sl: 110 })).ok && !V.setupIn(JSON.stringify({ v: 1, app: 'ExTerm', sym: 'BTC-USD', entry: 100, tp: 90 })).ok && !V.setupIn(JSON.stringify({ v: 1, app: 'ExTerm', sym: 'BTC-USD' })).ok);
const h = V.setupIn(JSON.stringify({ v: 1, app: 'ExTerm', sym: 'BTC-USD', entry: 100, tf: 'zz', riskPct: 99, note: 'a\u0000b<script>' }), (t) => t === '1h');
ok('unknown tf dropped, absurd risk dropped, control chars stripped (HTML escaping stays the renderer\'s job)', h.ok && h.setup.tf === null && h.setup.riskPct === null && !/\u0000/.test(h.setup.note));

// 9. prop evaluation
const ramp = Array.from({ length: 100 }, (_, i) => 50000 * (1 + i * 0.001));
let e = V.propEval(ramp, { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 }, 50000); ok('steady +0.1%/bar passes the +8% target', e.passed && e.passBar === 80, JSON.stringify(e));
const crash = ramp.slice(0, 30).concat(Array.from({ length: 30 }, (_, i) => 51450 * (1 - i * 0.004)));
e = V.propEval(crash, { target: 8, dailyDD: 4, maxDD: 8, bpd: 24 }, 50000); ok('a 4%+ intraday slide breaks the daily loss rule; return is measured at the failing bar', !e.passed && /daily loss/.test(e.fail) && Math.abs(e.ret - (crash[e.failBar] / 50000 - 1) * 100) < 1e-9, JSON.stringify(e));
e = V.propEval(crash, { maxDD: 20 }, 10000); ok('swan rules: survives a 12% drawdown under a 20% limit', e.passed && !e.fail && e.maxDD > 10 && e.maxDD < 20, JSON.stringify(e));
ok('prop eval: too few bars handled', V.propEval([1], {}, 1).ok === false);

// 10. regime lock
ok('regime: keep a strategy that fits, switch one that does not', !V.regimeSwitch({ regime: 'range', picks: ['a', 'b'] }, 'b').switch && V.regimeSwitch({ regime: 'range', picks: ['a', 'b'] }, 'z').to === 'a' && !V.regimeSwitch({ regime: 'unknown', picks: [] }, 'z').switch);

// 11/12. presets + hotkeys
ok('4 presets: Scalper, Solana Trench, Quant Lab, Macro War Room', V.PRESET_KEYS.map((k) => V.PRESETS[k].name).join('|') === 'Scalper|Solana Trench|Quant Lab|Macro War Room');
ok('presets use valid tabs, modes and 4 workspace cells', V.PRESET_KEYS.every((k) => { const P = V.PRESETS[k]; return ['crypto', 'stocks', 'onchain'].includes(P.mode) && typeof P.tab === 'string' && P.cells.length >= 1 && [1, 2, 3, 4].includes(P.grid); }));
const keys = V.HOTKEYS.map((k) => k[0]).join(' ');
ok('cheat sheet lists Ctrl+K, Ctrl+Z/Y, timeframe keys, presets and ?', /Ctrl\+K/.test(keys) && /Ctrl\+Z/.test(keys) && /1 – 9/.test(keys) && /Alt\+1/.test(keys) && /\?/.test(keys) && /1s/.test(V.HOTKEYS.find((k) => k[0] === '1 – 9')[1]));

console.log(res.join('\n'));
const f = res.filter((r) => r.startsWith('FAIL'));
console.log(`${res.length - f.length}/${res.length} passed`);
process.exit(f.length ? 1 : 0);
