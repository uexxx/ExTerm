// ExTerm v17.2 unit tests: strict Obsidian & Bullion Gold tokens, per-second meters, log-return stats, Monte Carlo fan of
// futures (bands ordered, seeded, path tags), phase-space embedding, RSI / volume-profile / bar-CVD weights, bus event
// classification (gold / emerald / crimson), ms stamps, money masking, plus static checks on the build order, the Synapse
// UI module (takes over V171UI.core, 3-tier layout, Record X Clip hides balances) and the CSS theme block.
const fs = require('fs'), path = require('path');
const V = require('../src/v172core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i) : '')); } };

ok('theme: strict Obsidian #07080B / #0D1117 / #161B22 + Bullion Gold #F5C84B, Emerald #22C55E, Crimson #EF4444', V.THEME.bg === '#07080B' && V.THEME.panel === '#0D1117' && V.THEME.head === '#161B22' && V.THEME.gold === '#F5C84B' && V.THEME.up === '#22C55E' && V.THEME.dn === '#EF4444' && Object.isFrozen(V.THEME));
ok('synapse: 6 nodes, 5 sensors, 5 weights', V.NODES.join('|') === 'TAPE/CVD|GEX/DOM|3D OB|SCREENER|AI BRIDGE|FIREWALL' && V.SENSORS.length === 5 && V.WEIGHTS.join('|') === 'CVD|GEX|3D OB|Momentum|Risk Budget');

const r = new V.Rate(3); r.roll(1000); for (let i = 0; i < 10; i++) r.count(); r.roll(2000); r.count(4); r.roll(3000); r.roll(4000); r.roll(5000);
ok('Rate: per-second rate, fixed history, total kept', r.h.length === 3 && r.h[0] === 4 && r.h[2] === 0 && r.total === 14, r);
ok('Rate: ignores sub-second rolls', (() => { const q = new V.Rate(); q.roll(0); q.roll(1); q.count(); return q.roll(500) === false && q.h.length === 0; })());
const h = new V.Hist(2); h.push(1); h.push(NaN); h.push(2); h.push(3); ok('Hist: finite only, fixed window', h.h.join() === '2,3' && h.last() === 3);

const cl = []; let p = 100; for (let i = 0; i < 300; i++) { p *= Math.exp(0.001 + 0.01 * Math.sin(i * 1.7)); cl.push(p); }
const st = V.stats(cl); ok('stats: drift and volatility of log returns', st.n === 299 && st.mu > 0.0005 && st.mu < 0.0015 && st.sigma > 0.004 && st.sigma < 0.02, st);
ok('stats: degenerate input', V.stats([1]).sigma === 0 && V.stats(null).n === 0);

const F = V.fan({ s0: 100, mu: 0, sigma: 0.01, steps: 60, paths: 48, seed: 42 }), F2 = V.fan({ s0: 100, mu: 0, sigma: 0.01, steps: 60, paths: 48, seed: 42 });
ok('fan: 48 paths × 60 steps from s0, seeded / reproducible', F.paths.length === 48 && F.paths.every((x) => x.length === 60 && x[0] === 100) && F.paths[7][59] === F2.paths[7][59]);
let ordered = true; for (let i = 0; i < 60; i++) if (!(F.p5[i] <= F.p25[i] && F.p25[i] <= F.p50[i] && F.p50[i] <= F.p75[i] && F.p75[i] <= F.p95[i])) ordered = false;
ok('fan: confidence bands ordered p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95, widening with time', ordered && F.p95[59] - F.p5[59] > F.p95[10] - F.p5[10] && F.lo <= F.p5[59] && F.hi >= F.p95[59]);
ok('fan: every path tagged gain / flat / loss (Emerald / Gold / Crimson), all three present', F.tag.length === 48 && ['up', 'gold', 'dn'].every((k) => F.tag.includes(k)) && Math.abs(F.pUp + F.pDn + F.tag.filter((t) => t === 'gold').length / 48 - 1) < 1e-9);
ok('fan: positive drift shifts the median up', V.fan({ s0: 100, mu: 0.01, sigma: 0.01, steps: 60, paths: 200, seed: 3 }).p50[59] > 140);
ok('fan: different seeds give different futures', V.fan({ s0: 100, sigma: 0.01, seed: 1 }).paths[0][59] !== V.fan({ s0: 100, sigma: 0.01, seed: 2 }).paths[0][59]);

const ph = V.phase(cl, 6, 160); ok('phase: delay embedding (z(p), z(p−6)), 160 points within ±1', ph.length === 160 && ph.every(([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1));
ok('phase: too short → empty', V.phase([1, 2, 3], 6).length === 0);

ok('rsi: rising 100, falling 0, flat 50', V.rsi(Array.from({ length: 30 }, (_, i) => i + 1)) === 100 && V.rsi(Array.from({ length: 30 }, (_, i) => 30 - i)) === 0 && V.rsi(new Array(30).fill(5)) === 50);
const k = Array.from({ length: 80 }, (_, i) => ({ t: i, o: 100, h: 101 + (i % 3), l: 99 - (i % 2), c: i % 2 ? 101 : 99, v: i === 40 ? 5000 : 10 }));
ok('obStrength: volume concentrated in one bucket scores high, 0…1', V.obStrength(k, 80) > 0.5 && V.obStrength(k, 80) <= 1 && V.obStrength([], 80) === 0);
ok('cvdBars: signed bar volume −1…1', V.cvdBars([{ o: 1, c: 2, v: 3 }, { o: 2, c: 1, v: 1 }]) === 0.5 && V.cvdBars([]) === 0);
ok('weights: a thin cross-exchange tape (< $1K) falls back to bar CVD', V.weights({ cvd: -0.3, vol: 0.3, cvdBars: 0.2 }).CVD === 0.2);
const w = V.weights({ cvd: 5000, vol: 10000, gexRegime: 'negative gamma', ob: 0.4, rsi: 85, equity: 1000, exposure: 250 });
ok('weights: CVD · GEX · 3D OB · Momentum · Risk Budget in 0…1', w.CVD === 0.5 && w.GEX === 0.85 && w['3D OB'] === 0.4 && w.Momentum === 1 && w['Risk Budget'] === 0.75 && Object.values(V.weights({})).every((x) => x >= 0 && x <= 1));

ok('classify: firewall block → FIREWALL / crimson', V.classify({ type: 'block', node: 'Firewall' }).node === 5 && V.classify({ type: 'stale' }).col === 'dn' && V.classify({ type: 'loss', node: 'Ledger' }).col === 'dn');
ok('classify: fill / whale / signal → emerald', V.classify({ type: 'fill', node: 'Bots', side: 'buy' }).col === 'up' && V.classify({ type: 'whale' }).node === 3 && V.classify({ type: 'win' }).col === 'up');
ok('classify: tick / cache / mutation → gold; AI → AI BRIDGE; chart → 3D OB', V.classify({ type: 'ui', node: 'Chart' }).col === 'gold' && V.classify({ type: 'ai', node: 'Copilot' }).node === 4 && V.classify({ type: 'draw', node: 'Chart' }).node === 2 && V.classify({ type: 'trail', node: 'Ledger' }).node === 1);
ok('stamp: HH:MM:SS.mmm', /^\d\d:\d\d:\d\d\.\d{3}$/.test(V.stamp(Date.now())) && V.stamp(new Date(2026, 0, 1, 9, 5, 7, 42).getTime()) === '09:05:07.042');
ok('maskMoney: hides every dollar amount', V.maskMoney('fleet buy BTC $1,250.50 · +$12K pnl -$3') === 'fleet buy BTC $••• · $••• pnl $•••');

// static
const b = src('build.py'), ui = src('src/v172.js'), core = src('src/v172core.js'), css = src('src/style.css'), th = src('src/themes.js');
ok('build: v172core + v172 load after v171 and before boot', /V172 = \["v172core\.js", "v172\.js"\]/.test(b) && b.indexOf('V172 =') > b.indexOf('V17_PRO =') && /\+ V172 \+ order\[order\.index\("boot\.js"\):\]/.test(b));
ok('ui: takes over V171UI.core (same API), 3-tier Synapse, all named panels', /Object\.assign\(Core, \{ NODES: V172\.NODES/.test(ui) && ['SENSORY INPUT LAYER', 'THE SYNAPSE', 'CORTEX &amp; SYNAPTIC WEIGHTS', 'SIGNAL ROTATION', 'THE TRACE', 'THE PRICER', 'All Terminal Activity', 'Bot Fleet Only', 'Record X Clip', 'id="x171Core"', 'id="x171Tele"'].every((s) => ui.includes(s)));
ok('ui: real sensors (Feed.tickL, Resource Timing + Server-Timing, Worker.postMessage, V170UI.merger CVD, GEX)', ['Feed.tickL.push', 'PerformanceObserver', 'serverTiming', 'Worker.prototype.postMessage', 'V170UI.merger', 'Opts.gex'].every((s) => ui.includes(s)) && /"Server-Timing": "swr;desc=LIVE"/.test(src('serve.py')));
ok('ui: Record X Clip auto-hides dollar balances and restores them', /hideBalances\(true\)/.test(ui) && /hideBalances\(false\)/.test(ui) && /maskMoney/.test(ui));
ok('ui: 0 fps when hidden (tab / visibility) and pauses via Core.stop', /tab\(\) !== 'fleet' \|\| document\.hidden\) \{ Core\.stop\(\)/.test(ui));
ok('ui: strict CSP (no eval / inline handlers / innerHTML from data)', !/\beval\(|new Function|onclick=/.test(ui + core) && !/innerHTML\s*=\s*[^;]*\b(text|r\.text|e\.text)\b/.test(ui));
ok('css: v17.2 strict token block + Synapse layout + mobile stack < 820 px', /html body\.x172\[data-theme="obsidian"\][^{]*\{[^}]*--bg:#07080B[^}]*--panel:#0D1117[^}]*--panel2:#161B22[^}]*--acc:#F5C84B[^}]*--up:#22C55E;--dn:#EF4444/.test(css) && /\.x172-stage\{display:grid;grid-template-columns:minmax\(220px,1fr\) minmax\(0,2\.4fr\) minmax\(220px,1fr\)/.test(css) && /@media \(max-width:819px\)\{[^@]*\.x172-stage,\.x172-row\{grid-template-columns:minmax\(0,1fr\)\}/.test(css));
ok('themes: Obsidian & Gold is the default', /ST\.theme\) \|\| 'obsidian'/.test(th) && /'#07080B', '#F5C84B'/.test(th));
ok('no washed-out violet / rose literals left in feature modules', !/#(7c5cff|a78bfa|f43f5e|FF5C6C|5EF0B0)(?![0-9a-f])/i.test(fs.readdirSync(path.join(root, 'src')).filter((f) => /^v1[67]\d*.*\.js$/.test(f)).map((f) => src('src/' + f)).join('\n')));
ok('privacy: no personal paths, emails or usernames in v17.2 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + core));
ok('license header on new files', [ui, core].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')));

console.log(`\nv17.2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
