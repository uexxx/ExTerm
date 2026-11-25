// ExTerm v17.7 launch + regression tests (30): strictly 4 top-level tabs + floating blur(12px) idle-fading rail, full-bleed
// 24/7 Bot Radar (fingerprints, 5 archetypes → 3 proximity rings, 3 micro-HUD numbers, All / Executors / MEV/Whales filters,
// anomaly-only callouts, hover / click target lock) and Terminal Brain (telemetry → velocity · pulse · tension · colour), the
// 2D tactile depth layers that replace the detached 3D chart and stay locked to live ticks, real renderer runs against a
// mocked 2D context, frame-budget sampling, plus static checks: build order, two-signal palette, CSP hygiene, license, version.
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = require('../src/v177core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i).slice(0, 400) : '')); } };
const T0 = 1.8e12, P = (o) => Object.assign({ sym: 'BTC-USD', t: T0, px: 100, qty: 1, usd: 100, side: 'buy' }, o);

/* ── 1. the 4 tabs ── */
ok('strictly 4 top-level tabs, in order: 24/7 Bot Radar · Terminal Brain · 24/7 Optional Live Bot · Co-Pilot / Paper', V.TABS.length === 4 && V.TABS.map((t) => t[1]).join('|') === '24/7 Bot Radar|Terminal Brain|24/7 Optional Live Bot|Co-Pilot / Paper');
ok('every legacy workspace folds into one rail tab (fleet → Live Bot, everything else → Co-Pilot / Paper) and each rail tab has an entry workspace', V.railOf('botradar') === 'botradar' && V.railOf('brain') === 'brain' && V.railOf('fleet') === 'livebot' && ['markets', 'heat', 'lab', 'radar', 'whales', 'opts', 'set'].every((t) => V.railOf(t) === 'copilot') && V.TABS.every(([k]) => V.railOf(V.ENTRY[k]) === k) && V.FULL.join() === 'botradar,brain');

/* ── 2. Bot Radar population model ── */
ok('fingerprint: equal clip sizes share a bucket, different sizes do not, on-chain wallets key by wallet', V.qb(0.421) === V.qb(0.424) && V.qb(0.42) !== V.qb(0.5) && V.sig(P({ qty: 0.42 })) === V.sig(P({ qty: 0.4249 })) && V.sig(P({ who: 'Ab12', sym: 'oc:sol:x' })) === 'w:Ab12');
let pop = new V.Pop(); for (let i = 0; i < 8; i++) pop.feed(P({ t: T0 + i * 250, qty: 0.42, usd: 42 }));
let b = pop.list()[0]; ok('fast repeated clips (4 / s) → EXECUTOR on the inner ring', b.kind === 'executor' && b.ring === 0 && V.rate(b) > 3, b);
pop = new V.Pop(); pop.feed(P({ usd: 150000, qty: 1500 })); b = pop.list()[0];
ok('$150K print → WHALE on the inner ring with a BLOCK callout', b.kind === 'whale' && b.ring === 0 && /^BLOCK \$150K$/.test(V.anomaly(b, T0 + 100)), V.anomaly(b, T0 + 100));
pop = new V.Pop(); pop.feed(P({ who: 'mev1', usd: 2000, side: 'buy' })); pop.feed(P({ who: 'mev1', usd: 2040, side: 'sell', t: T0 + 180 })); pop.feed(P({ who: 'mev1', usd: 1990, side: 'buy', t: T0 + 420 })); b = pop.list()[0];
ok('buy → sell → buy of similar size inside 1.5 s → MEV sandwich (inner ring, Crimson, MEV SANDWICH callout)', b.kind === 'mev' && b.ring === 0 && V.colorOf(b) === V.RED && V.anomaly(b, T0 + 500) === 'MEV SANDWICH', b);
pop = new V.Pop(); for (let i = 0; i < 6; i++) pop.feed(P({ t: T0 + i * 5000 + (i % 2) * 120, qty: 3, usd: 300, side: 'sell' })); b = pop.list()[0];
ok('slow, regular same-size clips (TWAP / limit wall) → STAGING on the middle ring', b.kind === 'staging' && b.ring === 1 && V.cv(b) < 0.45, { k: b.kind, cv: V.cv(b) });
pop = new V.Pop(); pop.feed(P({ usd: 25, qty: 0.25 })); b = pop.list()[0];
ok('a one-off small print → passive SCANNER on the outer ring with no callout', b.kind === 'scanner' && b.ring === 2 && V.anomaly(b, T0 + 10) === null);
pop = new V.Pop(); pop.feed(P({ sym: 'oc:sol:new', who: 'snp', usd: 800, ageH: 0.2 })); pop.feed(P({ sym: 'oc:sol:new', who: 'snp', usd: 900, ageH: 0.2, t: T0 + 4000 })); b = pop.list()[0];
ok('two buys into a pool < 1 h old → SNIPER (inner ring, SNIPER callout)', b.kind === 'sniper' && b.ring === 0 && V.anomaly(b, T0 + 4100) === 'SNIPER', b);
pop = new V.Pop(); pop.feed(P({ who: 'a', usd: 500 })); pop.feed(P({ who: 'b', usd: 700, t: T0 + 200 })); pop.feed(P({ who: 'c', usd: 900, t: T0 + 400 }));
ok('sweep: 3 same-side prints of one symbol inside 1 s from 3 actors → all 3 flagged executors', pop.list().every((x) => x.kind === 'executor' && x.flags & V.F.SWEEP));
const s1 = V.slot({ id: 'x', ring: 1 }), s2 = V.slot({ id: 'x', ring: 1 });
ok('3 proximity rings (inner 0.3 · middle 0.6 · outer 0.9), deterministic slot within ±4 % of its ring', V.RING_R.join() === '0.3,0.6,0.9' && s1.a === s2.a && s1.r === s2.r && Math.abs(s1.r / 0.6 - 1) <= 0.04 && V.RING.scanner === 2 && V.RING.staging === 1 && ['executor', 'sniper', 'mev', 'whale'].every((k) => V.RING[k] === 0));
pop = new V.Pop(); pop.feed(P({ usd: 20, sym: 'ETH-USD' })); for (let i = 0; i < 4; i++) pop.feed(P({ who: 'e', t: T0 + i * 200, usd: 1000, side: 'buy' })); pop.feed(P({ who: 'w', usd: 60000, side: 'sell', t: T0 + 900 }));
const H = V.hud(pop.list(), T0 + 1000, 60000, 100000);
ok('micro-HUD: Active Bots excludes one-print scanners; Bot Volume Share = bot $ / tape $; Net Bot Pressure −100…+100', H.active === 2 && Math.abs(H.share - 64) < 1e-9 && Math.abs(H.pressure - ((4000 - 60000) / 64000) * 100) < 1e-9, H);
const kinds = V.KINDS.map((k) => ({ kind: k }));
ok('filters: All passes everything, Executors = executor + sniper, MEV/Whales = mev + whale', V.FILTERS.map((f) => f[1]).join('|') === 'All|Executors|MEV/Whales' && kinds.filter((x) => V.pass(x, 'all')).length === 6 && kinds.filter((x) => V.pass(x, 'exec')).map((x) => x.kind).join() === 'executor,sniper' && kinds.filter((x) => V.pass(x, 'mev')).map((x) => x.kind).join() === 'mev,whale');
pop = new V.Pop(50); for (let i = 0; i < 200; i++) pop.feed(P({ who: 'w' + i, t: T0 + i * 2000, usd: 10 })); const n50 = pop.m.size, oldest = Math.min(...pop.list().map((x) => x.last)); pop.prune(T0 + 175 * 2000 + V.TTL);
ok('fixed capacity (oldest evicted, never > cap) and 24/7 pruning after the TTL', n50 === 50 && oldest === T0 + 150 * 2000 && pop.m.size === 25 && pop.list().every((x) => x.last >= T0 + 175 * 2000), { n50, oldest, after: pop.m.size });
const slow = { gapN: 3, gapS: 3 * 4000, buy: 1, sell: 0 }, fast = { gapN: 3, gapS: 3 * 200, buy: 1, sell: 0 }, seller = { gapN: 3, gapS: 600, buy: 0, sell: 1 };
ok('velocity (busier bots orbit faster, net sellers counter-rotate) · hover / click pick (nearest within radius, else null) · frame-budget p95 sampler', V.angVel(fast) > V.angVel(slow) && V.angVel(seller) < 0 && V.pick([{ x: 10, y: 10, id: 'a' }, { x: 30, y: 10, id: 'b' }], 27, 12, 16).id === 'b' && V.pick([{ x: 10, y: 10, id: 'a' }], 90, 90, 16) === null && V.p95([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 9]) === 9 && V.p95([]) === 0);

/* ── 3. tactile 2D depth layers ── */
ok('13 depth passes ported from the 3D layers (7 on by default), state sanitised', V.DEPTH.length === 13 && Object.values(V.depthDefaults()).filter(Boolean).length === 7 && V.depthState({ ob: false, evil: true, grid: 'x' }).ob === false && !('evil' in V.depthState({ evil: true })) && V.depthState({ grid: 'x' }).grid === true);
const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const D = mk(60, (i) => { const o = 100 + Math.sin(i / 4) * 3; return { t: 1000 + i, o, c: o + (i % 2 ? 0.6 : -0.5), h: o + 1.2, l: o - 1.2, v: 10 + (i === 40 ? 400 : i % 7) }; });
D[30] = { t: 1030, o: 101, c: 100.4, h: 101.3, l: 100.2, v: 12 }; D[31] = { t: 1031, o: 100.5, c: 106, h: 106.2, l: 100.4, v: 30 };
const VP = V.vpvr(D, 0, 60, 24), vt = D.reduce((s, k) => s + k.v, 0);
ok('VPVR shelf: 24 bins conserve total volume, POC is the fullest bin', VP.bins.length === 24 && Math.abs(VP.bins.reduce((s, z) => s + z.v, 0) - vt) < 1e-9 && VP.bins.every((z) => z.v <= VP.bins[VP.poc].v));
const ob = V.obZones(D, 0, 60, 8), fv = V.fvg([{ h: 10, l: 9 }, { h: 12, l: 10 }, { h: 14, l: 11 }], 0, 3), wh = V.whales(D, 0, 60, 2.5), lq = V.liqPools(D, 0, 60, 3);
const C = V.cvd([{ o: 1, c: 2, v: 5 }, { o: 2, c: 1, v: 3 }], 0, 2), AV = V.avwap([{ h: 3, l: 1, c: 2, v: 1 }, { h: 6, l: 4, c: 5, v: 3 }], 0, 2), ex = V.extrude(100, 100, 10), ex0 = V.extrude(0, 100, 10);
ok('OB slab before the impulsive candle, bullish FVG tunnel, whale beacon on the volume spike, liq pools at swings, CVD pillars, AVWAP canyon, volume-ranked extrusion', ob.some((z) => z.i === 30 && z.bull) && fv.length === 1 && fv[0].bull && fv[0].bot === 10 && fv[0].top === 11 && wh.includes(40) && lq.hi.length > 0 && lq.lo.length > 0 && C[0] === 5 && C[1] === 2 && AV[0] === 2 && Math.abs(AV[1] - 4.25) < 1e-9 && ex.dy > ex0.dy && ex.a > ex0.a && ex.dx > ex0.dx, { ob, fv, wh, lq });

/* ── 4. Terminal Brain graph ── */
const lanes = mk(8, (i) => ({ k: 'l' + i, state: i === 0 ? 'BUSY' : i === 1 ? 'HIBERNATE' : 'IDLE', err: i === 2 ? 1 : 0 }));
const GR = V.brainGraph({ lanes, feeds: [{ k: 'q', l: 'Q', rate: 20, stale: false }, { k: 't', l: 'T', rate: 0, stale: true }], procs: [{ k: 'fleet', l: 'F', act: 0.3 }, { k: 'fw', l: 'FW', act: 1, hot: true }], squad: mk(6, (k) => ({ k, l: 'B' + k, st: k ? 'STANDBY' : 'ACTIVE' })), evps: 60, stale: true });
const ten = (id) => GR.edges.find((e) => e.a === id).ten;
ok('Terminal Brain: 1 core + 8 lanes + feeds + processes + 6 squad nodes, a tree (edges = nodes − 1), squad wired to the fleet', GR.nodes.length === 1 + 8 + 2 + 2 + 6 && GR.edges.length === GR.nodes.length - 1 && GR.edges.filter((e) => e.b === 'proc:fleet').length === 6);
ok('telemetry drives the render: BUSY lane taut + fast, hibernating lane slack, stale feed / firewall / lane errors / stale core turn Crimson', ten('lane:l0') > ten('lane:l3') && ten('lane:l3') > ten('lane:l1') && V.brainSpeed(1) > V.brainSpeed(0.1) && GR.nodes.find((n) => n.id === 'feed:t').hot && GR.nodes.find((n) => n.id === 'proc:fw').hot && GR.nodes.find((n) => n.id === 'lane:l2').hot && GR.nodes[0].hot === 1 && GR.nodes[0].act === 1);

/* ── 5. the real v17.7 renderers against a mocked 2D context (vm) ── */
const mockCtx = () => { const calls = { n: 0, arc: 0, img: 0, ops: new Set(), text: [] }; const t = {}; return new Proxy(t, { get: (o, k) => (k === 'calls' ? calls : k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : /^create(Linear|Radial)Gradient$/.test(k) ? () => ({ addColorStop() {} }) : k === 'fillText' ? (s) => { calls.text.push(String(s)); calls.n++; } : k === 'arc' ? () => { calls.arc++; calls.n++; } : k === 'drawImage' ? () => { calls.img++; calls.n++; } : typeof k === 'string' && /^(fillStyle|strokeStyle|lineWidth|font|textAlign|textBaseline|globalCompositeOperation|globalAlpha)$/.test(k) ? o[k] : () => { calls.n++; }), set: (o, k, v) => { o[k] = v; if (k === 'globalCompositeOperation') calls.ops.add(v); return true; } }); };
const mkCanvas = () => { const g = mockCtx(); return { width: 0, height: 0, g, getContext: () => g, addEventListener() {}, style: {} }; };
const sb = { V177: V, performance: { now: () => Date.now() }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, console, Date, Math, Map, Set, Float64Array, JSON, document: { createElement: () => mkCanvas(), addEventListener() {}, body: { classList: { contains: () => true } } }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, curTab: 'botradar' };
vm.createContext(sb); vm.runInContext(src('src/v177.js') + '\nthis.V177UI = V177UI;', sb);
const UI = sb.V177UI, RD = UI.radar;
for (let i = 0; i < 6; i++) RD.feed(P({ t: Date.now() - 900 + i * 120, qty: 0.42, usd: 900 })); RD.feed(P({ who: 'w9', usd: 150000, t: Date.now() })); RD.feed(P({ usd: 15, t: Date.now(), sym: 'ETH-USD' }));
for (let i = 0; i < 4; i++) RD.feed(P({ sym: 'SOL-USD', t: Date.now() - 30000 + i * 6000, qty: 7, usd: 700, side: 'sell' }));
const cv = mkCanvas(); RD.draw(cv, 1000, 0.016); const c1 = cv.g.calls, anoms = RD.pop.list().map((x) => V.anomaly(x, Date.now())).filter(Boolean).sort();
ok('Bot Radar renderer: full canvas, 3 ring arcs + inner-ring nodes, every bot hit-testable, callouts only for anomalies (BLOCK, BURST), no persistent labels', cv.width === 1440 && cv.height === 900 && c1.arc >= 3 && RD.pts.length === RD.pop.m.size && RD.drawn === RD.pop.m.size && anoms.length === 2 && c1.text.slice().sort().join('|') === anoms.join('|') && anoms.some((s) => /^BLOCK \$150K/.test(s)) && anoms.some((s) => /^BURST/.test(s)) && !c1.text.some((s) => /USD|w9|SOL/.test(s)), { arc: c1.arc, text: c1.text, anoms, pts: RD.pts.length, bots: RD.pop.m.size });
const w = RD.pts.find((q) => q.id === 'w:w9'); RD.lock = w.id; const cv2 = mkCanvas(); RD.draw(cv2, 1016, 0.016);
ok('click target lock reveals full telemetry (kind, prints, volume, net) only for the locked bot', RD.telemetry && RD.telemetry.locked && RD.telemetry.id === 'w:w9' && RD.telemetry.kind === 'whale' && cv2.g.calls.text.some((s) => /^LOCKED · WHALE/.test(s)) && cv2.g.calls.text.some((s) => /^volume \$150\.0K/.test(s)), cv2.g.calls.text);
/* depth overlay on a mocked chart layout: draws behind (destination-over) + additive halos (lighter), follows the last live tick */
const L = { D, start: 0, end: 60, bw: 12, kx: (i) => 6 + i * 12 + 6, py: (p) => 30 + (110 - p) * 20, Lm: 6, Rm: 60, W: 800, H: 500, y0: 30, mainH: 400, volH: 60, bars: 60 }, g = mockCtx();
UI.depth.st = V.depthState(Object.fromEntries(V.DEPTH.map(([k]) => [k, true]))); UI.depth.overlay(g, L, { data: D, view: { off: 0 } });
const d1 = UI.depth.draws, c0 = UI.depth.lastC; D.push({ t: 1060, o: 101, c: 104.25, h: 104.5, l: 100.9, v: 22 }); L.end = 61; UI.depth.overlay(mockCtx(), L, { data: D, view: { off: 0 } });
ok('tactile 2D depth pass: parallax grid + volumetric gradient + bevel extrusion behind the candles, OB / VPVR / FVG / CVD / AVWAP / liq slabs, additive whale + last-price halos', ['grid', 'vol', 'bevel', 'ob', 'vpvr', 'whale', 'glow', 'cvd', 'fvg', 'avwap', 'liq'].every((k) => UI.depth.lastPasses.includes(k)) && g.calls.ops.has('destination-over') && g.calls.ops.has('lighter') && g.calls.img >= 2, { passes: UI.depth.lastPasses, ops: [...g.calls.ops] });
ok('depth layers stay locked to live ticks: a new 1s candle redraws them on that candle (no frozen copy)', UI.depth.draws === d1 + 1 && c0 === D[59].c && UI.depth.lastC === 104.25 && UI.depth.lastT === 1060);
sb.curTab = 'brain'; const bc = mkCanvas(); UI.brain.draw(bc, 1000, 0.016); UI.brain.draw(bc, 1016, 0.016);
ok('Terminal Brain renderer: every node drawn on one full canvas, labels cached (one build for unchanged labels)', bc.width === 1440 && UI.brain.drawn >= 7 && UI.brain.labelBuilds === 1 && bc.g.calls.arc >= UI.brain.drawn, { drawn: UI.brain.drawn, lb: UI.brain.labelBuilds });

/* ── 6. static checks ── */
const ui = src('src/v177.js'), core = src('src/v177core.js'), css = src('src/style.css'), blk = css.slice(css.indexOf('/* ══ v17.7')), build = src('build.py');
const hexes = (s) => (s.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase()), allowed = new Set(['#F5C84B', '#EF4444', '#050608', '#0A0D12', '#CBD5E1', '#94A3B8', '#E5E7EB']);
const order = build.match(/V172 = \[([^\]]+)\]/)[1];
ok('build: v177core.js + v177.js load after v176.js (V172 group, before boot.js)', /"v176\.js", "v177core\.js", "v177\.js"(, "v178core\.js", "v178\.js"(, "v179core\.js", "v179\.js"(, "v180core\.js", "v180\.js"(, "v181core\.js", "v181\.js"(, "v182core\.js", "v182\.js")?)?)?)?)?$/.test(order.trim()));
ok('two-signal palette lock: every colour in v17.7 JS + CSS is Bullion Gold, Crimson, Obsidian or a neutral', [...hexes(ui), ...hexes(core), ...hexes(blk)].every((h) => allowed.has(h)) && hexes(blk).includes('#F5C84B') && hexes(blk).includes('#EF4444') && hexes(blk).includes('#050608'), [...new Set([...hexes(ui), ...hexes(core), ...hexes(blk)])].filter((h) => !allowed.has(h)));
ok('rail CSS: floating, backdrop-filter blur(12px), tabular-nums mono, idle fade; full-bleed 100vw × 100vh; legacy nav hidden', /\.x177-rail\{position:fixed[^}]*backdrop-filter:blur\(12px\)[^}]*tabular-nums/.test(blk) && /\.x177-rail\.idle\{opacity:\.16\}/.test(blk) && /\.tab\.x177-full\.on\{[^}]*position:fixed;inset:0;width:100vw;height:100vh/.test(blk) && /body\.x177 #nav\{display:none!important\}/.test(blk));
ok('detached 3D removed: pill + 3D window + 3D layer drawer deleted, toggle neutered, Alpha Radar handoff no longer opens 3D; strict-CSP hygiene (no innerHTML / eval / inline handlers) in v17.7 code', /'#x171_3d', '#x171D3W', '#x175LayB', '#x175LayDr'/.test(ui) && /D\.toggle = function \(\) \{ this\.on = false; return false; \}/.test(ui) && !/chart3d\.toggle\(true\)/.test(src('src/v176.js')) && ![ui, core].some((s) => /innerHTML|insertAdjacentHTML|\beval\(|new Function|onclick=/.test(s)));
ok('license header on both files, no personal paths, version 17.7+ everywhere (package.json, serve.py, About, Android, APK + package tools)', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + core) && [ui, core].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')) && /"version": "(?:17\.[7-9]|18\.[0-2])\.0"/.test(src('package.json')) && /VERSION = "(?:17\.[7-9]|18\.[0-2])"/.test(src('serve.py')) && /ExTerm v(?:17\.[7-9]|18\.[0-2]) · Official Release/.test(src('src/index.html')) && /ExTermAndroid\/(?:17\.[7-9]|18\.[0-2])/.test(src('android/src/com/exterm/app/MainActivity.java')) && /"(?:17\.[7-9]|18\.[0-2])", "(?:17[7-9]0|18[0-2]0)"/.test(src('tools/build_apk.py')) && /V = "(?:17\.[7-9]|18\.[0-2])"/.test(src('tools/package_release.py')) && /Proprietary/.test(src('LICENSE')));

console.log(`\nv17.7: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
