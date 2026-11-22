// ExTerm v17.3 unit tests: 85 % layout box + area-filling radii, on-chain (age, buy pressure) targets that never collapse to
// a flat line, lively bubble physics (never settles, elastic collisions conserve momentum, walls contain, hover repel, drag
// = infinite mass), fractal dendrites, particle pool, Singularity callouts, action-heat matrix, throughput histogram, plus
// static checks: exact v16.6 palette restored (pre-v17 files, theme swatches, no v17.1 slate overrides), build order,
// engine switcher, additive lighting, telemetry matrix, live bubble hooks, strict CSP, license, privacy.
const fs = require('fs'), path = require('path');
const V = require('../src/v173core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i) : '')); } };

const B = V.box(1000, 600); ok('box: 85 % of width and height, centred', B.w === 850 && B.h === 510 && B.x0 === 75 && B.y0 === 45);
const R = V.radii(Array.from({ length: 32 }, (_, i) => 1 + i * 10), 1000, 600, { frac: 0.3 }), area = R.reduce((s, r) => s + Math.PI * r * r, 0) / 6e5;
ok('radii: ∝ √size, scaled to fill ~30 % of the canvas, clamped', R.length === 32 && R[31] > R[0] && area > 0.24 && area < 0.36 && Math.max(...R) <= 600 * 0.17 + 1e-9, { area });

const tg = V.targets(Array.from({ length: 30 }, (_, i) => ({ ageMin: null, buys: undefined, sells: undefined, ch: (i % 7) * 6 - 18 })));
const tys = tg.map((t) => t.ty), sd = Math.sqrt(tys.reduce((s, v) => s + (v - tys.reduce((a, b) => a + b, 0) / tys.length) ** 2, 0) / tys.length);
ok('targets: no age + no buy/sell counts → rank-ordered x, 1h-change estimate for y: never a flat line', sd > 0.15 && new Set(tg.map((t) => t.tx.toFixed(3))).size === 30 && tg.every((t) => t.est && t.ageEst), { sd });
const t2 = V.targets([{ ageMin: 5, buys: 90, sells: 10, ch: 0 }, { ageMin: 2000, buys: 10, sells: 90, ch: 0 }]);
ok('targets: newer → right, more buyers → higher', t2[0].tx > t2[1].tx && t2[0].ty < t2[1].ty && !t2[0].est && Math.abs(t2[0].bp - 0.9) < 1e-9);

const mk = (n) => Array.from({ length: n }, (_, i) => ({ x: 100 + (i % 8) * 90, y: 100 + Math.floor(i / 8) * 80, r: 14 + (i % 5) * 4, tx: 500, ty: 300, ph: i, ch: (i % 9) - 4 }));
const N = mk(36); const e = []; for (let f = 0; f < 600; f++) { V.step(N, 1 / 60, f / 60, 1000, 600); if (f > 300) e.push(V.energy(N)); }
const emin = Math.min(...e);
ok('physics: never settles (currents + swirl keep every frame moving after 10 s)', emin > 15, { emin: Math.round(emin) });
ok('physics: boundary containment', N.every((n) => n.x >= n.r - 1e-6 && n.x <= 1000 - n.r + 1e-6 && n.y >= n.r - 1e-6 && n.y <= 600 - n.r + 1e-6));
let ov = 0; for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const d = Math.hypot(N[i].x - N[j].x, N[i].y - N[j].y); if (d < (N[i].r + N[j].r) * 0.7) ov++; }
ok('physics: collisions keep spheres apart (no deep overlaps)', ov <= 2, { ov });
const a = { x: 100, y: 300, vx: 200, vy: 0, r: 20, tx: 100, ty: 300, ph: 0 }, b = { x: 138, y: 300, vx: -200, vy: 0, r: 20, tx: 138, ty: 300, ph: 0 };
const p0 = a.vx * 400 + b.vx * 400; V.step([a, b], 1e-4, 0, 1000, 600, { k: 0, swirl: 0, cur: 0, damp: 0, buoy: 0, rest: 1 }); const p1 = a.vx * a.r * a.r + b.vx * b.r * b.r;
ok('physics: elastic collision reverses approach and conserves momentum (equal masses)', a.vx < 0 && b.vx > 0 && Math.abs(p1 - p0) < 1e-6, { a: a.vx, b: b.vx });
const w = { x: 5, y: 300, vx: -300, vy: 0, r: 20, tx: 5, ty: 300 }; V.step([w], 0.016, 0, 1000, 600, { k: 0, swirl: 0, cur: 0, damp: 0, buoy: 0 });
ok('physics: wall bounce reflects with restitution', w.x === 20 && w.vx > 0 && w.vx < 300);
const h = { x: 510, y: 300, vx: 0, vy: 0, r: 20, tx: 510, ty: 300 }; V.step([h], 0.016, 0, 1000, 600, { k: 0, swirl: 0, cur: 0, damp: 0, buoy: 0, ptr: { x: 500, y: 300, on: true, r: 60 } });
ok('physics: hover repel pushes away from the pointer', h.vx > 0);
const dg = { x: 300, y: 300, vx: 0, vy: 0, r: 30, tx: 300, ty: 300, drag: true }, hit = { x: 340, y: 300, vx: 0, vy: 0, r: 20, tx: 340, ty: 300 }; V.step([dg, hit], 0.016, 0, 1000, 600, { k: 0, swirl: 0, cur: 0, damp: 0, buoy: 0 });
ok('physics: dragged bubble is immovable (infinite mass) and shoves the other one', dg.x === 300 && dg.y === 300 && hit.x >= 350 - 1e-9);
const gain = { x: 500, y: 300, vx: 0, vy: 0, r: 10, tx: 500, ty: 300, ch: 10, ph: Math.PI / 2 }; V.step([gain], 0.016, 0, 1000, 600, { k: 0, swirl: 0, cur: 0, damp: 0 });
ok('physics: buoyancy lifts gainers', gain.vy < 0);

const T = V.tree(0, 0, 400, 0, { seed: 3, depth: 5 }); ok('tree: fractal dendrite, dozens of branching segments, depth tagged 0…1', T instanceof Float32Array && T.length % 5 === 0 && T.length / 5 >= 20 && [...Array(T.length / 5).keys()].every((i) => T[i * 5 + 4] >= 0 && T[i * 5 + 4] <= 1), T.length / 5);
ok('tree: seeded / reproducible', V.tree(0, 0, 400, 0, { seed: 3 }).join() === V.tree(0, 0, 400, 0, { seed: 3 }).join() && V.tree(0, 0, 400, 0, { seed: 4 }).join() !== V.tree(0, 0, 400, 0, { seed: 3 }).join());
const P = new V.Pool(4); for (let i = 0; i < 6; i++) P.spawn(i, 0, 10, 0, 1, i % 3); ok('pool: fixed capacity ring, oldest overwritten', P.n === 4 && P.x[0] === 4 && P.x[1] === 5 && P.update(0.5, 0, 0) === 4 && P.x[0] === 9);
ok('pool: particles expire', P.update(0.6) === 0);
ok('badge: callouts TICK BATCH / WHALE SWEEP / GEX SHIFT / 3D OB WALL / FIREWALL PASS (+ BLOCK)', V.badge({ type: 'tick' }).text === 'TICK BATCH' && V.badge({ type: 'whale' }).text === 'WHALE SWEEP' && V.badge({ type: 'fill', node: 'Bots' }).col === 'up' && V.badge({ type: 'ui', text: 'GEX recalc' }).text === 'GEX SHIFT' && V.badge({ type: 'draw', node: 'Chart' }).text === '3D OB WALL' && V.badge({ type: 'gate', node: 'Firewall' }).text === 'FIREWALL PASS' && V.badge({ type: 'block', node: 'Firewall' }).text === 'FIREWALL BLOCK' && V.badge({ type: 'block' }).col === 'dn');
const H = new V.Heat(6, 30); H.hit(2, 1000); H.hit(2, 1100); H.hit(5, 2500); H.decay(0.5);
ok('heat: 1 s buckets per subsystem, flash decays', H.cell(2, 1) === 2 && H.cell(5, 0) === 1 && H.flash(5, 0) < 1 && H.flash(5, 0) > 0.1 && H.cell(0, 0) === 0);
const Th = new V.Thru(3); Th.add('gold', 1000); Th.add('up', 1200); Th.add('dn', 2100); Th.add('gold', 3000);
ok('throughput: stacked per-second buckets', Th.b.length === 2 && Th.b[0].gold === 1 && Th.b[0].up === 1 && Th.b[1].dn === 1 && Th.cur.gold === 1 && Th.max() === 2);
Th.add('up', 9000); ok('throughput: fixed length, idle seconds roll in as empty bars', Th.b.length === 3 && Th.b.every((x) => x.gold + x.up + x.dn <= 1) && Th.cur.up === 1);

// static: palette restore + wiring
const css = src('src/style.css'), th = src('src/themes.js'), ui = src('src/v173.js'), core = src('src/v173core.js'), bld = src('build.py'), v164 = src('src/v164.js');
ok('palette: v16.6 Obsidian & Gold rules intact (obsidian tokens, #D4AF37 / #CBD5E1 gradient, #2fd08a / #ff5a5f)', /--acc:#D4AF37;--acc2:#CBD5E1/.test(css) && /--up:#2fd08a;--dn:#ff5a5f/.test(css) && /body\[data-theme="obsidian"\]\{--bg:var\(--obs\);--panel:#0F131B/.test(css));
ok('palette: the v17.1 slate overrides and the v17.2 strict token block are gone', !/body\.x171\[data-theme="obsidian"\][^{]*\{[^}]*--text:#F8FAFC/.test(css) && !/html body\.x172\[data-theme="obsidian"\]/.test(css) && !/body\.x171 :is\(\.note,\.lbl,th,\.x17-kpi span\)\{color:#94A3B8\}/.test(css));
ok('palette: pre-v17 modules carry their v16.6 colours again (EMA50 #c678dd, heat #f43f5e, liq #e879f9)', /'#c678dd'/.test(src('src/charts.js')) && /#f43f5e/.test(src('src/app_b.js')) && /'#e879f9'/.test(src('src/v157core.js')));
ok('themes: Obsidian & Gold default with v16.6 swatches', /ST\.theme\) \|\| 'obsidian'/.test(th) && /sw: \['#070707', '#D4AF37', '#CBD5E1', '#2fd08a'\]/.test(th));
ok('build: v173core + v173 after v172 and before boot', /"v172\.js", "v173core\.js", "v173\.js"[,\]]/.test(bld) && /\+ V172 \+ order\[order\.index\("boot\.js"\):\]/.test(bld));
ok('synapse: 1-click engine switcher (Synapse Cortex | Singularity Burst | Auto-Morph), additive lighting', ['Synapse Cortex', 'Singularity Burst', 'Auto-Morph', 'data-x173eng'].every((s) => ui.includes(s)) && (ui.match(/globalCompositeOperation = 'lighter'/g) || []).length >= 6);
ok('synapse: fractal dendrites, comets, spores, event horizon, radial filaments, coronal tendrils, callouts', ['V173.tree(', 'X.comets', 'X.spores', "fillStyle = '#000'", 'X.fil', 'coronal plasma tendrils', 'X.badges'].every((s) => ui.includes(s)));
ok('matrix: // RUN LOG · ACCESS LEDGER · BLAST RADIUS · ACTION HEAT · THROUGHPUT · BOT STATUS + Signal Rotation / Pricer kept', ['RUN LOG', 'ACCESS LEDGER', 'BLAST RADIUS', 'ACTION HEAT', 'THROUGHPUT', 'BOT STATUS', 'x172-row'].every((s) => ui.includes(s)) && /'#x171Tele'/.test(ui) && /'Working Bots'/.test(ui));
ok('bubbles: Radar.bubbles + P4UI.Bubbles overridden, v164 animates its own bubPts (reuse on re-render), ResizeObserver, 0 fps when hidden', /Radar\.bubbles = /.test(ui) && /P4UI\.Bubbles = /.test(ui) && /V173UI\.marketBubbles\(bubCv, bubPts/.test(v164) && /const reuse = /.test(v164) && /new ResizeObserver/.test(ui) && /document\.hidden \|\| !cv\.offsetParent\) \{ E\.paused = true; E\.fps = 0/.test(ui));
ok('bubbles: glossy spheres, additive halos, specular, shockwave rings, hover repel, drag-fling', ["sprite('halo'", "sprite('ball'", "sprite('spec'", 'n.rings.push', 'ptr: E.ptr', 'setPointerCapture', 'E.suppress'].every((s) => ui.includes(s)));
ok('record: Synapse clip still hides balances; matrix masks $ while recording / hidden', /hideBalances\(true\)/.test(src('src/v172.js')) && /hidden\(\) \|\| \(S2\(\) && S2\(\)\.syn\.rec\) \? '\$•••'/.test(ui));
ok('strict CSP: no eval / Function / inline handlers', !/\beval\(|new Function|onclick=/.test(ui + core));
ok('privacy: no personal paths, emails or usernames in v17.3 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + core));
ok('license header on new files', [ui, core].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')));

console.log(`\nv17.3: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
