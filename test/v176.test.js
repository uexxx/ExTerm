// ExTerm v17.6 unit + static tests (25): 4D maths (tesseract, XW/YW/ZW rotations, Hopf torus knots on S³, stereographic map,
// plasma bolts, L-system dendrites), the 5 new off-thread renderers (Synapse 4D singularity, attractor + Merton cone, sonar +
// worker mesh, real-bot equity, Alpha Radar dome), Alpha Radar grading (tiers, 6-bot consensus, truthful shrink, RISK-GUARD veto,
// ≤ 2 % impact sizing, ≥ 15 graded picks across markets, worker-lane routing), On-Chain Token Desk maths (Rug Shield v2, TWAP),
// plus static checks: build order + worker source, pre-v17.0 palette lock, Synapse 3 panels, Alpha Radar tab, DEX bubble
// timeframe pills, strict CSP, license, privacy, version.
const fs = require('fs'), path = require('path'), vm = require('vm');
const X = require('../src/v175core.js'), V = require('../src/v176core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i).slice(0, 400) : '')); } };
const near = (a, b, t) => Math.abs(a - b) <= t, norm = (p) => Math.hypot(...p);

/* ── 4D maths ── */
const T = V.tesseract();
ok('tesseract: 16 vertices of {−1,1}⁴, 32 edges, every edge flips exactly one coordinate', T.v.length === 16 && T.e.length === 32 && T.e.every(([i, j]) => T.v[i].filter((x, k) => x !== T.v[j][k]).length === 1));
ok('rot4: XW · YW · ZW rotations preserve the 4D norm', T.v.every((v) => near(norm(V.rot4(v, 0.7, -1.3, 2.1)), 2, 1e-9)));
const K = V.torusKnot(2, 3, Math.PI / 4, 64); let onS3 = true; for (let k = 0; k < 64; k++) onS3 = onS3 && near(Math.hypot(K[k * 4], K[k * 4 + 1], K[k * 4 + 2], K[k * 4 + 3]), 1, 1e-9);
ok('Hopf torus knots lie on S³ and the stereographic map sends (0,0,0,−1) to the origin, (1,0,0,0) to (1,0,0)', onS3 && V.stereo(0, 0, 0, -1).every((x) => near(x, 0, 1e-12)) && near(V.stereo(1, 0, 0, 0)[0], 1, 1e-12));
const B1 = V.bolt(7, 0, 0, 100, 0, 5), B2 = V.bolt(7, 0, 0, 100, 0, 5);
ok('plasma bolt: 33 points, exact endpoints, deterministic per seed, actually jagged', B1.length === 66 && B1[0] === 0 && B1[64] === 100 && B1.every((x, i) => x === B2[i]) && B1.some((x, i) => i % 2 === 1 && Math.abs(x) > 1));
const D = V.dendrite(4); ok('L-system dendrite (X → F[+X][−X]FX) yields hundreds of branching segments', D.length / 5 > 100 && new Set(Array.from({ length: D.length / 5 }, (_, i) => D[i * 5 + 4])).size >= 3);

/* ── renderers ── */
global.Path2D = class { constructor() { this.n = 0; } moveTo() { this.n++; } lineTo() { this.n++; } arc() { this.n++; } rect() { this.n++; } closePath() {} };
const mockCtx = () => { const calls = { n: 0, stroke: 0, fill: 0, text: [] }; return new Proxy({}, { get: (t, k) => (k === 'calls' ? calls : k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : k === 'createConicGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'fillText' ? (s) => { calls.text.push(String(s)); calls.n++; } : typeof k === 'string' && /^(fillStyle|strokeStyle|lineWidth|font|textAlign|textBaseline|globalCompositeOperation|globalAlpha|lineDashOffset)$/.test(k) ? t[k] : (...a) => { calls.n++; if (k === 'stroke') calls.stroke++; if (k === 'fill' || k === 'fillRect') calls.fill++; }), set: (t, k, v) => { t[k] = v; return true; } }); };
ok('5 new renderers registered in the shared V175.R table (so the 3D Spatial worker renders them off-thread)', ['sing', 'ac', 'sonar2', 'eq', 'radar'].every((k) => typeof X.R[k] === 'function' && X.R.KINDS.includes(k)));
const base = { W: 900, H: 420, d: 1, t: 9.3 }, nodes = X.SQUAD.map((q, k) => ({ n: q[1], st: k === 1 ? 'ACTIVE' : 'STANDBY', f: k })), m = X.E.merton(100, { paths: 20, steps: 30 });
const orbs = Array.from({ length: 20 }, (_, i) => ({ sym: 'S' + i, l: 'S' + i, m: V.QUADS[i % 4][0], score: 50 + i * 2.4, g: V.grade(50 + i * 2.4), a: (i * 0.37) % 1 }));
const ST = { sing: Object.assign({ mode: 'STANDBY', active: 1, real: 2, demo: 0, nodes, fx: [{ k: 3, age: 0.2, seed: 5 }], yaw: 0.3, pitch: 0.4, zoom: 1.2 }, base), ac: Object.assign({ data: { lz: X.E.lorenz(400), rs: X.E.rossler(400), bands: m.bands, steps: m.steps }, hover: { x: 0.8, y: 0.5 } }, base), sonar2: Object.assign({ eig: { syms: ['BTC', 'ETH', 'SOL'], top: [0.6, -0.4, 0.2], loss3s: 0.04 }, lanes: X.LANES.map((l, i) => [l[1], i * 0.3, i * 0.9, i % 2 ? 'IDLE' : 'BUSY', 0]) }, base), eq: Object.assign({ data: { eq: [100, 101, 99, 104, 107] } }, base), radar: Object.assign({ data: { orbs, arcs: [[0, 5, 0.6], [3, 9, 0.3]] }, sel: 'S19', yaw: 0.2 }, base) };
const coreS = src('src/v176core.js'), rblk = coreS.slice(coreS.indexOf('const R = {}'), coreS.indexOf('V.R = R;'));
const rr = Object.keys(ST).map((k) => { const g = mockCtx(); try { X.R[k](g, ST[k], {}); X.R[k](g, ST[k], {}); return [k, g.calls.n > 20 && g.calls.stroke + g.calls.fill > 4, g.calls.text]; } catch (e) { return [k, false, e.message]; } });
ok('renderers are pure (2D context + snapshot, no DOM) and draw real geometry for all 5 kinds', rr.every((x) => x[1]) && !/document|window\.|querySelector/.test(rblk), rr.filter((x) => !x[1]));
const sTxt = rr[0][2].join(' | ');
ok('4D singularity: 6 holographic bot nodes with status, STANDBY banner, drag/zoom hint, layer title', X.SQUAD.every((q) => sTxt.includes(q[1])) && /STANDBY · no bot running/.test(sTxt) && /drag to orbit · wheel to zoom/.test(sTxt) && /TESSERACT · HOPF S³→S² TORUS KNOTS · ACCRETION VORTEX · L-SYSTEM DENDRITES · PLASMA ARCS/.test(sTxt) && /ACTIVE · 1/.test(sTxt));
const lo = V.radarPos({ m: 'crypto', score: 55, a: 0.5 }), hi = V.radarPos({ m: 'crypto', score: 95, a: 0.5 });
ok('Alpha Radar dome: higher grade → orb nearer the centre and higher; 4 quadrants (Stocks · Crypto · Perps · On-Chain DEX); reticle on the pinned orb', Math.hypot(hi[0], hi[2]) < Math.hypot(lo[0], lo[2]) && hi[1] > lo[1] && V.QUADS.map((q) => q[1]).join() === 'Stocks,Crypto,Perps,On-Chain DEX' && rr[4][2].some((t) => /^◎ S19/.test(t)));

/* ── Alpha Radar grading ── */
ok('grade tiers: S 92+ · A+ 85+ · A 78+ · B+ 70+ · B 60+ · C', V.grade(92) === 'S' && V.grade(91.9) === 'A+' && V.grade(85) === 'A+' && V.grade(78) === 'A' && V.grade(70) === 'B+' && V.grade(60) === 'B' && V.grade(59) === 'C');
const ser = (n, d) => Array.from({ length: n }, (_, i) => 100 * Math.exp(d * i + 0.004 * Math.sin(i / 3)));
const U = []; for (let i = 0; i < 8; i++) U.push({ sym: 'C' + i + '-USD', l: 'C' + i, m: 'crypto', px: 100 + i, chg24: -6 + i * 2, hi24: 110 + i, lo24: 95, advUsd: 5e8, bid: 99.9 + i, ask: 100.1 + i, series: ser(70, 0.001 * (i - 3)) }); for (let i = 0; i < 7; i++) U.push({ sym: 'K' + i, l: 'K' + i, m: 'stock', px: 50 + i, chg24: -2 + i * 0.7, hi24: 55 + i, lo24: 48, advUsd: 2e9, series: [] }); for (let i = 0; i < 5; i++) U.push({ sym: 'oc:solana:P' + i + 'aaaaaa', l: 'M' + i, m: 'dex', px: 0.01, chg24: 10 * i - 15, liq: 50000 * (i + 1), buys: 900, sells: 600, ageH: 100, mcap: 2e6, series: [] });
const S = V.scan(U);
ok('scan: ≥ 15 graded picks across Stocks / Crypto / On-Chain, sorted by score, each with 6 bot votes and a 6-box dossier', S.picks.length >= 15 && S.picks.every((p, i) => !i || p.score <= S.picks[i - 1].score) && S.picks.every((p) => p.votes.length === 6 && p.dossier.length === 6) && V.BOTS.join() === 'HUNTER-α,MUTATOR-EVO,HEDGER-ARB,RISK-GUARD,SNIPER-EXEC,SCALPER-EXIT' && new Set(S.picks.map((p) => p.m)).size === 3);
ok('dossier boxes = Trigger · Safe Max $ (≤2% impact) · GEX/Funding/Rug-Shield · Regime Edge · Entry/Stop · TP1/TP2 & R:R + plain-English summary', S.picks.every((p) => p.dossier[0][0] === 'Trigger' && /Safe Max/.test(p.dossier[1][0]) && ['GEX', 'Funding', 'Rug-Shield'].includes(p.dossier[2][0]) && p.dossier[3][0] === 'Regime Edge' && p.dossier[4][0] === 'Entry / Stop' && /TP1 \/ TP2/.test(p.dossier[5][0]) && /of 6 bots back (LONG|SHORT)/.test(p.summary)));
const a0 = { sym: 'Z', l: 'Z', m: 'crypto', px: 100, chg24: 9, hi24: 101, lo24: 90, advUsd: 1e9, bid: 99.99, ask: 100.01 }, warm = V.score(Object.assign({ series: [] }, a0)), full = V.score(Object.assign({ series: ser(80, 0.003) }, a0));
ok('truthful shrink: with no live history the grade is pulled toward neutral (55) and the regime says "warming up"', Math.abs(warm.score - 55) < Math.abs(full.score - 55) && /warming up/.test(warm.dossier[3][1]) && /H \d/.test(full.dossier[3][1]));
const rug = V.score({ sym: 'oc:x:Y', l: 'Y', m: 'dex', px: 0.001, chg24: 400, liq: 8000, buys: 50, sells: 400, ageH: 2, mcap: 9e6, series: ser(80, 0.01) });
ok('RISK-GUARD veto caps a parabolic thin-liquidity rug candidate below B+ (≤ 69) and On-Chain picks are long-only', rug.score <= 69 && rug.votes[3][1] < -0.5 && S.picks.filter((p) => p.m === 'dex').every((p) => p.side === 'long'));
const ss = V.safeSize({ m: 'dex', liq: 400000 }), Rq = 200000;
ok('Safe Max $: constant-product size gives exactly 2 % price impact; CEX size ≤ 1 % of ADV', near((1 + ss / Rq) ** 2 - 1, 0.02, 1e-9) && V.safeSize({ m: 'crypto', advUsd: 1e8, sigD: 0.001 }) <= 1e6 && V.safeSize({ m: 'stock' }) === null);
const kp = V.kpis([100, -50, 200, -25]);
ok('squad KPIs from real closed trades: win rate, profit factor, per-trade Sharpe; no trades → no numbers (never fabricated)', kp.n === 4 && kp.win === 0.5 && near(kp.pf, 4, 1e-9) && kp.sharpe > 0 && V.kpis([]).win === null && V.kpis([]).pf === null);
const C = V.counts(S.picks);
ok('sub-tab counters: All = Stocks + Crypto & Perps + On-Chain Meme Coins; grade counters nest (S ≤ A+ ≤ A ≤ B+)', C.all === C.stock + C.crypto + C.dex && C.S <= C['A+'] && C['A+'] <= C.A && C.A <= C['B+']);
/* the worker kernel (v175core + v176core + v175work, as bundled in WORKER175_SRC) runs alphaScan on the Screener lane only */
const sent = []; const ctx = { self: { postMessage: (m) => sent.push(m) }, performance: { now: () => 0 }, Float64Array, Float32Array, ArrayBuffer, console, Math, JSON, Map, Set }; ctx.self.self = ctx.self; vm.createContext(ctx);
vm.runInContext(src('src/v175core.js').replace(/^const V175/m, 'var V175') + '\n' + src('src/v176core.js').replace(/^const V176/m, 'var V176') + '\n' + src('src/v175work.js').replace(/self\.onmessage =/, 'self.onmessage = self.onmessage ='), ctx);
ctx.self.onmessage({ data: { init: 'screener' } }); ctx.self.onmessage({ data: { id: 1, fn: 'alphaScan', args: [U.slice(0, 6)] } }); ctx.self.onmessage({ data: { init: 'quant' } }); ctx.self.onmessage({ data: { id: 2, fn: 'alphaScan', args: [U.slice(0, 6)] } });
const r1 = sent.find((m) => m.id === 1), r2 = sent.find((m) => m.id === 2);
ok('worker lanes: alphaScan routed to the Screener lane, runs inside the worker kernel there, refused on other lanes', X.route('alphaScan') === 'screener' && X.allowed('screener', 'alphaScan') && r1 && r1.ok && r1.out.picks.length === 6 && r2 && !r2.ok, { r1: r1 && r1.err, r2: r2 && r2.ok });

/* ── On-Chain Token Desk maths ── */
const now = 1e6, tr = []; for (let i = 0; i < 40; i++) tr.push({ side: i % 5 ? 'buy' : 'sell', usd: 100, ts: now - 400 + i * 10, who: 'w' + (i % 12) });
const g2 = V.rug2(tr, { created: (now - 401) * 1000 }, { lpLocked: 92 }, now), g0 = V.rug2([], {}, {}, now);
ok('Rug Shield v2: Sybil entropy · Slot-0 bundle · LP lock · smart-money retention half-life measured from swaps; says n/a (no score) when it cannot measure', g2.checks.map((c) => c[0]).join() === 'Sybil entropy,Slot-0 bundle,LP lock,Smart-money retention' && g2.measured === 4 && g2.score > 50 && /half-life/.test(g2.checks[3][2]) && g0.score === null && g0.checks.every((c) => c[1] === 'n/a'));
const tw = V.twap(10000, 300000, 8, 0.5);
ok('TWAP slicer: 8 slices cut constant-product impact cost vs one clip and lower the per-slice sandwich odds', tw.n === 8 && tw.twapCost < tw.oneCost && tw.saved > 0 && tw.mevSlice <= tw.mevOne && near(tw.slice * 8, 10000, 1e-9));

/* ── static ── */
const ui = src('src/v176.js'), v175 = src('src/v175.js'), css = src('src/style.css'), bld = src('build.py'), html = src('src/index.html'), v164 = src('src/v164.js'), dex = src('src/dex.js');
const css176 = css.slice(css.indexOf('/* ═══ v17.6'), css.indexOf('/* ═══ v17.5'));
const HEX = new Set(['#07080b', '#0d1117', '#f5c84b', '#2fd08a', '#ff5a5f', '#9a917a', '#d8cfb6', '#000']), RGBA = new Set(['245,200,75', '47,208,138', '255,90,95', '216,207,182', '154,145,122', '0,0,0']);
const hexes = (s) => (s.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((x) => x.toLowerCase()), rgbs = (s) => (s.match(/rgba?\((\d+,\d+,\d+)/g) || []).map((x) => x.replace(/rgba?\(/, '')), rgbVars = (coreS.match(/RGB = \{[^}]+\}/)[0].match(/'(\d+,\d+,\d+)'/g) || []).map((x) => x.replace(/'/g, ''));
ok('build: v176core + v176 after v175 and before boot; WORKER175_SRC = v175core + v176core + v175work', /"v175core\.js", "v175\.js", "v176core\.js", "v176\.js"(, "v177core\.js", "v177\.js"(, "v178core\.js", "v178\.js"(, "v179core\.js", "v179\.js"(, "v180core\.js", "v180\.js"(, "v181core\.js", "v181\.js"(, "v182core\.js", "v182\.js")?)?)?)?)?)?\]/.test(bld) && /\("v175core\.js", "v176core\.js", "v175work\.js"\)/.test(bld));
ok('palette lock: every v17.6 colour literal (JS + CSS, incl. the < 820 px block) is a pre-v17.0 Obsidian & Gold token', [...hexes(ui), ...hexes(coreS), ...hexes(css176)].every((h) => HEX.has(h)) && [...rgbs(ui), ...rgbs(coreS), ...rgbs(css176), ...rgbVars].every((t) => RGBA.has(t)) && /@media \(max-width:819px\)\{[\s\S]*#tab-radar/.test(css176) && /#x175Sq \.x175-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/.test(css176), { hex: [...hexes(ui), ...hexes(coreS), ...hexes(css176)].filter((h) => !HEX.has(h)), rgb: [...rgbs(ui), ...rgbs(coreS), ...rgbs(css176)].filter((t) => !RGBA.has(t)) });
ok('Synapse: 4D singularity (drag-orbit / zoom, 240 Hz cap) + exactly 3 panels, KPIs bound to running bots only', /PANELS = \[\['attr', '3D Strange Attractor & Merton Probability Cone'\], \['sonar', 'Eigen-Risk Sonar & Worker Mesh Telemetry'\], \['kpi', 'Squad Execution Stream & Live KPIs'\]\]/.test(v175) && /panel\(core, 'sing', coreState, 240\)/.test(v175) && /orbit\(core, SQ\.cam\)/.test(v175) && /filter\(\(b\) => b\.run && b\.account\)/.test(v175));
ok('Alpha Radar tab: top-level nav, 4 market sub-tabs with counters, 5 grade pills, Pause / Resume, Pin / Lookup bar, 4 handoffs, scan in the Screener lane', /dataset\.tab = 'radar'/.test(ui) && ['All Consensus', 'Stocks', 'Crypto & Perps', 'On-Chain Meme Coins', 'S-Tier 92+', 'A+ 85+', 'A 78+', 'B+ 70+', 'Pin / Lookup Any Ticker or Meme Coin CA…', (ui.includes('Chart + 3D') ? 'Chart + 3D' : 'Load on Chart'), '3D Shock Test', 'Load R:R Ruler', 'Deploy Bot Rule'].every((s) => ui.includes(s)) && /M\.run\('alphaScan'/.test(ui) && /'Resume' : 'Pause'/.test(ui));
ok('DEX bubble map + On-Chain desk: 28–40 merged pools, 5m | 1h | 6h | 24h pills + Refresh drive label / colour / radius / impulse; chain pills, CA resolver, Rug Shield v2, MEV + TWAP, 3 handoffs', /O\.UNI_MIN = 28; O\.UNI_MAX = 40/.test(dex) && /O\.boosted = async/.test(dex) && /dataset\.v164tf = t/.test(v164) && /dataset\.v164ref/.test(v164) && /mom = oc \?/.test(v164) && /spring impulse/.test(v164) && ['All Chains', 'Solana', 'Base', 'Ethereum', 'Arbitrum', 'Search / paste meme coin CA…', 'RUG SHIELD v2', 'MEV PRIORITY-FEE SANDWICH PREDICTOR & TWAP SLICER', 'Load on Main Chart', '3D Shock Lab', 'Copy CA'].every((s) => ui.includes(s)));
ok('strict CSP + license + privacy + version 17.6: no eval / innerHTML / inline handlers in v17.6 code, headers present, no personal paths', !/\beval\(|new Function|\.innerHTML\s*=|onclick=/.test(ui + coreS) && [ui, coreS].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')) && !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + coreS) && V.VERSION === '17.6' && /VERSION = "(?:17\.[6-9]|18\.[0-2])"/.test(src('serve.py')) && /ExTerm v(?:17\.[6-9]|18\.[0-2]) · Official Release/.test(html) && /"(?:17\.[6-9]|18\.[0-2])", "(?:17[6-9]0|18[0-2]0)"/.test(src('tools/build_apk.py')));

console.log(`\nv17.6: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
