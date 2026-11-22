// ExTerm v15.7 core unit tests: Float64Array 1s ring (gapless open, late ticks dropped, wrap-around), 1s → 5s / 10s rollup
// == TFX-style aggregation of the same trades, rollup speed on a full 15-minute ring, fast-candle geometry (≥ 4px wide,
// ≥ 2.5px tall, 2px gap), 3D projection, IV surface, profit-mountain plateau score, correlation; static CSP / privacy checks.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const V = require('../src/v157core.js');
const V156 = require('../src/v156core.js');

// ── ring + rollup
const T0 = 1_700_000_000;
const trades = []; for (let i = 0; i < 400; i++) trades.push({ t: T0 + i * 0.7 + (i % 3) * 0.05, p: 100 + Math.sin(i / 9) * 2 + (i % 7) * 0.01, q: 1 + (i % 4) });
const r = V.ring(); for (const x of trades) r.push(x.p, x.q, x.t);
ok('ring: one slot per trading second, no allocation per tick (Float64Array backed)', r.size === new Set(trades.map((x) => Math.floor(x.t))).size, r.size);
const b1 = r.rollup(1);
ok('rollup 1s: every bar opens at the prior close (gapless)', b1.every((k, i) => i === 0 || k.o === b1[i - 1].c));
ok('rollup 1s: quiet seconds are filled with flat bars, so time is continuous', b1.every((k, i) => i === 0 || k.t - b1[i - 1].t === 1));
ok('rollup 1s: high ≥ max(open, close) and low ≤ min(open, close) on every bar', b1.every((k) => k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c)));
const ref = (sec) => { const by = new Map(); for (const x of trades) { const b = Math.floor(x.t / sec) * sec, k = by.get(b); if (!k) by.set(b, { t: b, h: x.p, l: x.p, c: x.p, v: x.q }); else { k.h = Math.max(k.h, x.p); k.l = Math.min(k.l, x.p); k.c = x.p; k.v += x.q; } } return [...by.values()]; };
for (const sec of [5, 10]) {
  const a = r.rollup(sec), m = new Map(a.map((k) => [k.t, k])), e = ref(sec);
  ok(`rollup ${sec}s: close, volume and buckets match a direct aggregation of the same trades`, e.every((k) => m.has(k.t) && Math.abs(m.get(k.t).c - k.c) < 1e-12 && Math.abs(m.get(k.t).v - k.v) < 1e-9 && m.get(k.t).h >= k.h && m.get(k.t).l <= k.l), sec);
  ok(`rollup ${sec}s: gapless open = prior close and ${sec}s spacing`, a.every((k, i) => i === 0 || (k.o === a[i - 1].c && k.t - a[i - 1].t === sec)));
}
{ const before = r.rollup(1).length; r.push(1, 1, T0); ok('ring: a late tick for an already closed second is dropped (history never rewritten)', r.rollup(1).length === before && r.rollup(1)[0].l > 50); }
{ const last = trades[trades.length - 1].t, a = r.rollup(1, last + 6); ok('rollup: extends flat bars up to "now" so live ticks land on the right bar', a[a.length - 1].t === Math.floor(last + 6) && a[a.length - 1].v === 0); }
{ const w = V.ring(900); for (let i = 0; i < 2000; i++) w.push(50 + (i % 10), 1, T0 + i); const a = w.rollup(1);
  ok('ring: wraps at 900 slots (15 minutes) and keeps the newest seconds in order', w.size === 900 && a.length === 900 && a[0].t === T0 + 1100 && a[899].t === T0 + 1999);
  const t = process.hrtime.bigint(); for (let k = 0; k < 20; k++) { w.rollup(1); w.rollup(5); w.rollup(10); } const ms = Number(process.hrtime.bigint() - t) / 1e6 / 20;
  ok('rollup: 1s + 5s + 10s from a full 15-minute ring in < 2 ms', ms < 2, ms.toFixed(3) + 'ms'); }
{ V.note('ETH-USD', 3000, 1, T0); V.note('ETH-USD', 3001, 1, T0 + 1); ok('rings: one ring per symbol via V157.note', V.rings.get('ETH-USD').size === 2); }

// ── fast-candle geometry
{ const flat = V.body(100, 100, 50, 6, true); ok('geometry: Open === Close still draws a body ≥ 2.5px tall (never a flat line)', flat.h >= 2.5 && flat.w >= 4, JSON.stringify(flat)); }
{ const g = V.body(100, 140, 50, 6.4, true); ok('geometry: fast body ≥ 4px wide with ≥ 2px gap to the next bar', g.w >= 4 && 6.4 - g.w >= 2 - 1e-9, JSON.stringify(g)); }
{ const g = V.body(100, 140, 50.3, 9, true); ok('geometry: body straddles the 1px wick at round(x)+0.5', g.x <= 50.5 && g.x + g.w >= 51, JSON.stringify(g)); }
ok('geometry: visible bar count fits the plot at 6px per bar (1,000px plot → 166 bars, never below 20)', V.maxBars(1000) === 166 && V.maxBars(50) === 20);

// ── 3D maths
{ const a = V.proj(0, 0, 0, V.ANG0, 400, 300); ok('3D: origin projects to the canvas centre', Math.abs(a[0] - 200) < 1e-9 && Math.abs(a[1] - 150) < 1e-9); }
{ const near = V.proj(1, -1, 0, { yaw: 0, pitch: 0 }, 400, 300), far = V.proj(1, 1, 0, { yaw: 0, pitch: 0 }, 400, 300); ok('3D: perspective, farther points sit closer to the centre', Math.abs(far[0] - 200) < Math.abs(near[0] - 200)); }
{ const c = V.clampAng({ yaw: 7, pitch: 3 }); ok('3D: angles are clamped (pitch ≤ 1.45 rad, yaw wrapped to 0…2π)', c.pitch === 1.45 && c.yaw >= 0 && c.yaw < 2 * Math.PI); }
{ const g = V.grid([[0, 1], [2, NaN]]); ok('3D: grid normalises to the −1…1 cube and floors missing cells', g.lo === 0 && g.hi === 2 && g.pts[1][1][2] === -0.6 && g.pts[1][0][2] === 0.6); }
{ const row = V.depthRow({ bids: [[99.5, 2]], asks: [[100.5, 1]] }, 100, 24, 0.01); ok('terrain: bids land below mid, asks above, weighted by notional', row.slice(0, 12).reduce((a, b) => a + b) === 199 && row.slice(12).reduce((a, b) => a + b) === 100.5); }
{ const ks = [90, 95, 100, 105, 110], Z = V.ivSurface(ks, () => 0.5, 100, 'iv'); ok('IV surface: 6 expiries × strikes, ATM IV near the front-month input, wings ≥ ATM', Z.length === V.EXP_D.length && Z[3].length === 5 && Math.abs(Z[3][2] - 50) < 1 && Z[0][0] >= Z[0][2]);
  const G = V.ivSurface(ks, () => 0.5, 100, 'gamma', V156.greeks); ok('gamma surface: peaks at the money and is largest at the front expiry', G[0][2] > G[0][0] && G[0][2] > G[5][2]); }
{ const plat = V.plateau([[5, 6, 5], [6, 7, 6], [5, 6, 5]]), spike = V.plateau([[0, -1, 0], [-1, 9, -1], [0, -1, 0]]);
  ok('profit mountain: a broad plateau scores robust, an isolated spike scores fragile', plat.kind === 'plateau' && spike.kind === 'spike' && plat.r === 1 && plat.c === 1, JSON.stringify([plat, spike])); }
{ const a = Array.from({ length: 80 }, (_, i) => 100 * Math.exp(Math.sin(i) * 0.01 + i * 0.001)), b = a.map((x) => x * 2), c = a.map((x, i) => 10000 / x);
  const k = V.corr([a, b, c]); ok('correlation: identical moves → +1, inverse → −1, momentum in %', Math.abs(k.M[0][1] - 1) < 1e-9 && Math.abs(k.M[0][2] + 1) < 1e-9 && Number.isFinite(k.mom[0])); }
{ const p = V.whalePts([{ coin: 'BTC', side: 'Long', ntl: 1e6, mark: 100, liq: 98 }, { coin: 'ETH', side: 'Short', ntl: 1e5, mark: 100, liq: 130 }]);
  ok('whale orbit: near-liquidation positions sit on the inner ring, shorts below the floor', Math.hypot(p[0].x, p[0].y) < Math.hypot(p[1].x, p[1].y) && p[1].z < 0 && V.liqColor(p[0].dist) === '#e879f9'); }

// ── build + static checks
const B = fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8'), CORE = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8'), APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app_a.js'), 'utf8');
ok('build: v157core.js + v157.js bundled after v156.js and before boot.js', /"v156\.js", "v157core\.js", "v157\.js", "v160core\.js", ("v161core\.js", )?("v162core\.js", )?("v163core\.js", )?("v164core\.js", )?("v165core\.js", )?("v166core\.js", )?("v170core\.js", )?"v160\.js", ("v161\.js", )?("v162\.js", )?("v163\.js", )?("v164\.js", )?("v165\.js", )?("v166\.js", )?("v170\.js", )?"boot\.js"/.test(B));
ok('timeframes: 10s is a first-class timeframe (NT.TF + the timeframe buttons)', /'10s': 10/.test(CORE) && /'5s', '10s', '15s'/.test(APP));
const SRC = ['v157core.js', 'v157.js'].map((x) => [x, fs.readFileSync(path.join(__dirname, '..', 'src', x), 'utf8')]);
ok('static: no inline event handlers, eval, new Function, WebGL or external imports in v15.7 modules', SRC.every(([, x]) => !/\son[a-z]+\s*=\s*["'`]/i.test(x.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\beval\(|new Function\(|getContext\(['"]webgl|import\s*\(|https?:\/\/(?!github\.com\/uexxx)/.test(x)));
const BANNED = new RegExp(['op' + 'en[- ]?so' + 'urce', 'so' + 'lana', '\\bS' + 'OL\\b', 'C:\\\\\\\\Users', '/home/', '@gm' + 'ail', 'rob' + 'lo'].join('|'), 'i');
ok('static: no banned terms, personal paths or private emails in v15.7 modules', SRC.every(([, x]) => !BANNED.test(x)), SRC.filter(([, x]) => BANNED.test(x)).map(([n]) => n));
ok('static: v157.js escapes interpolated titles (esc())', !/\$\{(title|sym|s|lab)\}/.test(SRC[1][1]));

console.log(res.join('\n'));
const fl = res.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${res.length - fl}/${res.length} passed`);
if (fl) process.exitCode = 1;
