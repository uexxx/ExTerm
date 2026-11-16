// ExTerm v15.6 core unit tests: shorthand numbers + exact tooltips, 44px sparkline geometry, Greeks vs P5.bs, virtual-window
// maths, O(1) latest-bar indicator patch == full recompute (tick on the forming bar and a newly opened bar), chunked Monte
// Carlo == P5.monteCarlo (same seed), the quant worker message, 1-word nav map; static CSP / privacy / banned-term checks.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const NT = require('../src/strategies4.js');
const P5 = require('../src/v15p5core.js');
const V = require('../src/v156core.js');

// ── shorthand numbers
ok('shorthand: $1.43M · $12.5K · $980 · −$2.10B · $0', V.usd(1430000) === '$1.43M' && V.usd(12500) === '$12.5K' && V.usd(980) === '$980' && V.usd(-2.1e9) === '−$2.10B' && V.usd(0) === '$0', [V.usd(1430000), V.usd(12500), V.usd(980), V.usd(-2.1e9)]);
ok('shorthand: +48.2% / −3.0% / 0.0%', V.pct(48.21) === '+48.2%' && V.pct(-3) === '−3.0%' && V.pct(0) === '0.0%');
ok('shorthand: sub-cent prices use subscript zeros ($0.0₅48 = 0.0000048)', V.usd(0.0000048) === '$0.0₅48' && V.usd(0.00012) === '$0.00012' && V.compact(0.0123) === '0.0123', [V.usd(0.0000048), V.usd(0.00012), V.compact(0.0123)]);
ok('shorthand: exact tooltip keeps full precision', V.exact(1430512.4567) === '1,430,512.46' && V.exact(0.0000048123) === '0.0000048123');
ok('shorthand: parses older "$1,234.50" / "−$12.30" cells, ignores non-dollar text', V.parseUsd('$1,234.50') === 1234.5 && V.parseUsd('−$12.30') === -12.3 && V.parseUsd('+$5') === 5 && V.parseUsd('12%') === null && V.parseUsd('BTC') === null);

// ── sparkline
const sp = V.spark([1, 2, 3, 2.5, 4]);
ok('sparkline: 44×16 polyline inside the box, direction up', sp && sp.dir === 'up' && sp.pts.split(' ').length === 5 && sp.pts.split(' ').every((p) => { const [x, y] = p.split(',').map(Number); return x >= 0 && x <= 44 && y >= 0 && y <= 16; }), sp && sp.pts);
ok('sparkline: down / flat / needs 2+ finite points', V.spark([5, 4, 3]).dir === 'dn' && V.spark([2, 2, 2]).dir === 'flat' && V.spark([1]) === null && V.spark([NaN, 1]) === null);
{ const r = V.ring(5); for (let i = 0; i < 9; i++) r.push('a', i); r.push('a', 8); ok('sparkline ring: bounded to max, repeats collapsed', r.get('a').join() === '4,5,6,7,8' && r.get('nope').length === 0); }

// ── Greeks
{ const g = V.greeks(100, 100, 30 / 365, 0.04, 0.5, 'call'), b = P5.bs(100, 100, 30 / 365, 0.04, 0.5, 'call'), p = V.greeks(100, 100, 30 / 365, 0.04, 0.5, 'put');
  ok('greeks: delta / gamma / price match P5.bs; put delta = call delta − 1; theta < 0; vega > 0', Math.abs(g.delta - b.delta) < 1e-6 && Math.abs(g.gamma - b.gamma) < 1e-9 && Math.abs(g.price - b.price) < 1e-4 && Math.abs(p.delta - (g.delta - 1)) < 1e-9 && g.theta < 0 && p.theta < 0 && g.vega > 0, JSON.stringify([g, b]));
  ok('greeks: expired / zero-vol legs return null (no NaN in the rail)', V.greeks(100, 100, 0, 0.04, 0.5, 'call') === null && V.greeks(100, 100, 0.1, 0.04, 0, 'put') === null); }

// ── virtual window
{ const w = V.vwin(2800, 280, 28, 1500, 8); ok('virtual window: 1,500 rows at scroll 2,800 → rows 92–118 in the DOM, spacers sum to the full height', w.start === 92 && w.end === 118 && w.padTop + (w.end - w.start) * 28 + w.padBot === 1500 * 28, JSON.stringify(w)); }
ok('virtual window: clamps at both ends and on empty tables', V.vwin(0, 300, 28, 5).end === 5 && V.vwin(1e9, 300, 28, 50).end === 50 && V.vwin(0, 300, 28, 0).end === 0);

// ── O(1) latest-bar patch == full recompute
const I = NT.ind; let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const cl = []; let p = 64000; for (let i = 0; i < 5000; i++) { p *= 1 + (rnd() - 0.5) * 0.01; cl.push(p); }
const full = (a) => ({ ema20: I.ema(a, 20), ema50: I.ema(a, 50), sma200: I.sma(a, 200), rsi: I.rsi(a, 14), bb: I.bb(a, 20, 2), macd: I.macd(a) });
const flat = (c) => [c.ema20, c.ema50, c.sma200, c.rsi, c.bb.mid, c.bb.up, c.bb.lo, c.macd.macd, c.macd.signal, c.macd.hist];
const maxRel = (a, b) => { let m = 0; flat(a).forEach((x, k) => { const y = flat(b)[k]; for (let i = 0; i < x.length; i++) { if (Number.isNaN(x[i]) && Number.isNaN(y[i])) continue; m = Math.max(m, Math.abs(x[i] - y[i]) / (Math.abs(y[i]) || 1)); } if (x.length !== y.length) m = Infinity; }); return m; };
{ const c = full(cl), a = cl.slice(); a[a.length - 1] *= 1.004; V.patchInd(c, a, [a.length - 1], I); const e = maxRel(c, full(a));
  ok('incremental: a tick on the forming bar patches all 10 built-in series to equal a full 5,000-bar recompute (rel err < 1e-9)', e < 1e-9, e); }
{ const c = full(cl.slice(0, -1)), a = cl.slice(); a[a.length - 2] *= 0.997; V.patchInd(c, a, [a.length - 2, a.length - 1], I); const e = maxRel(c, full(a));
  ok('incremental: a newly opened bar (previous bar finalised) extends every series and still equals a full recompute', e < 1e-9, e); }
{ const t0 = process.hrtime.bigint(); for (let k = 0; k < 50; k++) full(cl); const tf = Number(process.hrtime.bigint() - t0);
  const c = full(cl), t1 = process.hrtime.bigint(); for (let k = 0; k < 50; k++) V.patchInd(c, cl, [cl.length - 1], I); const tp = Number(process.hrtime.bigint() - t1);
  ok('incremental: patch cost does not grow with history (5,000 bars: patch faster than a full recompute)', tp < tf, `patch ${tp / 1e6}ms vs full ${tf / 1e6}ms`); }

// ── chunked Monte Carlo == P5.monteCarlo
const rets = Array.from({ length: 60 }, (_, i) => Math.sin(i * 1.7) * 0.03 + 0.002);
let yields = 0;
V.monteCarloAsync(rets, 1000, 7, 100, () => { yields++; return Promise.resolve(); }).then((a) => {
  const b = P5.monteCarlo(rets, 1000, 7);
  ok('monte carlo: chunked run returns the exact same percentiles as P5.monteCarlo (seed 7)', JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
  ok('monte carlo: yields to the frame loop 9 times over 1,000 runs (every 100)', yields === 9, yields);
  return V.monteCarloAsync([0.1], 10);
}).then((z) => {
  ok('monte carlo: fewer than 3 trades → null, like the original', z === null);
  finish();
});

// ── quant worker message: the worker source carries v15p5core and answers type "quant"
const W = fs.readFileSync(path.join(__dirname, '..', 'src', 'worker.js'), 'utf8'), B = fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8');
ok('worker: walk-forward + Monte Carlo run in the backtest worker (type "quant"), worker bundle includes v15p5core.js', /m\.type === 'quant'/.test(W) && /P5\.walkForward/.test(W) && /P5\.monteCarlo/.test(W) && /"v15p5core\.js", "worker\.js"/.test(B));
ok('build: v156core.js + v156.js are bundled after v155s.js and before boot.js', /"v155s\.js", "v156core\.js", "v156\.js", "boot\.js"/.test(B));

// ── nav
ok('nav: 1-word English labels (Markets · Flow · DEX · Whales · Lab · Grok · Journal · Learn)', ['markets', 'desk', 'heat', 'whales', 'lab', 'grok', 'journal', 'btnLearn'].map((k) => V.NAV[k]).join() === 'Markets,Flow,DEX,Whales,Lab,Grok,Journal,Learn' && Object.values(V.NAV).every((w) => !/\s/.test(w)));

// ── static: strict CSP + privacy on the new modules
const SRC = ['v156core.js', 'v156.js'].map((x) => [x, fs.readFileSync(path.join(__dirname, '..', 'src', x), 'utf8')]);
ok('static: no inline event handler attributes, eval or new Function in v15.6 modules', SRC.every(([, x]) => !/\son[a-z]+\s*=\s*["'`]/i.test(x.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\beval\(|new Function\(/.test(x)), SRC.filter(([, x]) => /\son[a-z]+\s*=\s*["'`]/i.test(x)).map(([n]) => n));
const BANNED = new RegExp(['op' + 'en[- ]?so' + 'urce', 'so' + 'lana', '\\bS' + 'OL\\b', 'C:\\\\\\\\Users', '/home/', '@gm' + 'ail', 'rob' + 'lo'].join('|'), 'i');
ok('static: no banned terms, personal paths or private emails in v15.6 modules', SRC.every(([, x]) => !BANNED.test(x)), SRC.filter(([, x]) => BANNED.test(x)).map(([n]) => n));
ok('static: v156.js escapes every interpolated row value (esc() around titles, labels and symbols)', !/\$\{(sym|s|lab|title|k)\}/.test(SRC[1][1]));

function finish() {
  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
}
