/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.6 core (pure, no DOM; loaded after v175core.js on the main thread, in the 8 worker lanes and in Node), unit-tested in
   test/v176.test.js. Exact pre-v17.0 palette (Obsidian #07080B / #0D1117 · Bullion Gold #F5C84B).
   · 4D maths    tesseract (16 vertices / 32 edges) rotated in the XW · YW · ZW planes, (p, q) torus knots on nested Clifford tori in
                 S³ (Hopf fibration S³ → S²) stereographically projected, branching L-system dendrites, seeded midpoint-displacement
                 plasma bolts, Keplerian accretion vortex
   · renderers   sing (Synapse 4D singularity + 6 orbiting squad nodes) · ac (strange attractor + Merton cone) · sonar2 (eigen-risk
                 sonar + worker mesh) · eq (real-bot equity sparkline) · radar (Alpha Radar quantum constellation dome); registered
                 into V175.R so the 3D Spatial worker renders them off-thread through OffscreenCanvas
   · Alpha Radar every asset graded by the applicable ExTerm engines + a 6-bot consensus debate → tier, side, 6-box dossier,
                 plain-English summary (score shrinks toward neutral while a symbol's live history is short) */
const V176 = (() => {
  const V = {}, X = typeof V175 !== 'undefined' ? V175 : require('./v175core.js'), E = X.E, { fin, clamp, mean, sd } = X.util;
  V.VERSION = '17.6';
  V.PAL = X.PAL;
  const RGB = { gold: '245,200,75', up: '47,208,138', dn: '255,90,95', ink: '216,207,182', mut: '154,145,122' };
  V.RGB = RGB;
  const f2 = (v, d) => (fin(v) ? v.toFixed(d == null ? 2 : d) : '–');
  const fp = (v) => (!fin(v) ? '–' : v >= 1000 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));
  const usd = (v) => (!fin(v) ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'k' : '$' + Math.round(v));

  /* ══ 1. 4D geometry ══ */
  /* tesseract: vertices of {−1, 1}⁴, edges join vertices that differ in exactly one coordinate */
  V.tesseract = () => { const v = []; for (let i = 0; i < 16; i++) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]); const e = []; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) e.push([i, j]); } return { v, e }; };
  /* rotate a 4-vector in the XW, YW and ZW planes (the "4th-dimensional" rotations a 3D eye can't do) */
  V.rot4 = (p, a, b, c) => { let [x, y, z, w] = p, ca = Math.cos(a), sa = Math.sin(a); [x, w] = [x * ca - w * sa, x * sa + w * ca]; ca = Math.cos(b); sa = Math.sin(b); [y, w] = [y * ca - w * sa, y * sa + w * ca]; ca = Math.cos(c); sa = Math.sin(c); [z, w] = [z * ca - w * sa, z * sa + w * ca]; return [x, y, z, w]; };
  /* (p, q) torus knot on the Clifford-family torus of S³ at latitude η: (cos η e^{ipθ}, sin η e^{iqθ}); unit norm by construction */
  V.torusKnot = (p, q, eta, n) => { const out = new Float64Array(n * 4), ce = Math.cos(eta), se = Math.sin(eta); for (let k = 0; k < n; k++) { const th = (k / n) * 2 * Math.PI; out[k * 4] = ce * Math.cos(p * th); out[k * 4 + 1] = ce * Math.sin(p * th); out[k * 4 + 2] = se * Math.cos(q * th); out[k * 4 + 3] = se * Math.sin(q * th); } return out; };
  /* stereographic projection S³ \ {north pole} → R³ */
  V.stereo = (x1, x2, x3, x4) => { const d = Math.max(1e-3, 1 - x4); return [x1 / d, x2 / d, x3 / d]; };
  /* plasma bolt: seeded midpoint displacement, 2^depth + 1 points from (x0, y0) to (x1, y1) */
  V.bolt = (seed, x0, y0, x1, y1, depth, rough) => {
    const r = X.rng(seed), n = 1 << depth, P = new Float64Array((n + 1) * 2); P[0] = x0; P[1] = y0; P[n * 2] = x1; P[n * 2 + 1] = y1; let amp = Math.hypot(x1 - x0, y1 - y0) * (rough == null ? 0.22 : rough);
    for (let step = n; step > 1; step >>= 1, amp *= 0.55) for (let i = 0; i < n; i += step) { const a = i, b = i + step, m = (a + b) >> 1, dx = P[b * 2] - P[a * 2], dy = P[b * 2 + 1] - P[a * 2 + 1], L = Math.hypot(dx, dy) || 1, o = (r() - 0.5) * 2 * amp; P[m * 2] = (P[a * 2] + P[b * 2]) / 2 - (dy / L) * o; P[m * 2 + 1] = (P[a * 2 + 1] + P[b * 2 + 1]) / 2 + (dx / L) * o; }
    return P;
  };
  /* branching dendrite (L-system X → F[+X][−X]FX, F → FF), turtle segments [x0, y0, x1, y1, depth] growing along +y */
  V.dendrite = (iters) => E.turtle(E.lsystem('X', { X: 'F[+X][-X]FX', F: 'FF' }, iters == null ? 4 : iters), 0.44, 1);
  /* Keplerian angular speed ∝ r^−1.5 (inner vortex spins faster) */
  V.kepler = (r) => 0.9 / Math.pow(Math.max(0.05, r), 1.5);
  /* camera: yaw about y, pitch about x, perspective (F = 3.2) */
  V.cam = (yaw, pitch, S, cx, cy) => { const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return (x, y, z) => { const x1 = x * cy0 - z * sy0, z1 = x * sy0 + z * cy0, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, k = 3.2 / (3.2 + z2); return [cx + x1 * S * k, cy - y1 * S * k, z2, k]; }; };

  /* ══ 2. renderers (pure: 2D context + state snapshot) ══ */
  const R = {};
  const glow2 = (g, path, col, a, lw, d) => { g.strokeStyle = `rgba(${col},${(a * 0.22).toFixed(3)})`; g.lineWidth = lw * 3.2 * d; g.stroke(path); g.strokeStyle = `rgba(${col},${a.toFixed(3)})`; g.lineWidth = lw * d; g.stroke(path); };
  const NODE_COL = (st) => (st === 'ACTIVE' ? RGB.up : /DEMO/.test(st || '') ? RGB.gold : st === 'IDLE' ? RGB.ink : RGB.mut);
  V.nodePos = (k, t) => { const an = (k / 6) * 2 * Math.PI + t * 0.16; return [Math.cos(an) * 1.5, Math.sin(an * 2 + t) * 0.06, Math.sin(an) * 1.5]; };
  /* THE SYNAPSE 4D psychedelic singularity. s: { W, H, d, t, yaw, pitch, zoom, nodes: [{ n, st, f }], fx: [{ k, age, seed }], mode, active, real, demo, off } */
  R.sing = (g, s, memo) => {
    const { W, H, d, t } = s, cx = W / 2, cy = H * 0.5, S = Math.min(W * 0.62, H) * 0.36 * clamp(s.zoom || 1, 0.5, 2.5), P = V.cam((s.yaw || 0) + t * 0.11, s.pitch == null ? 0.42 : s.pitch, S, cx, cy);
    if (!memo.T) { memo.T = V.tesseract(); memo.K = [V.torusKnot(2, 3, Math.PI / 4, 220), V.torusKnot(3, 5, Math.PI / 6, 260), V.torusKnot(1, 4, Math.PI / 3, 200), V.torusKnot(5, 2, 0.42, 240)]; memo.D = V.dendrite(4); let m = 1; for (let i = 0; i < memo.D.length; i += 5) m = Math.max(m, -memo.D[i + 3]); memo.Dm = m; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    if (g.createRadialGradient) { const rg = g.createRadialGradient(cx, cy, 0, cx, cy, S * 1.9); rg.addColorStop(0, `rgba(${RGB.gold},.22)`); rg.addColorStop(0.35, `rgba(${RGB.gold},.06)`); rg.addColorStop(1, `rgba(${RGB.gold},0)`); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'lighter';
    /* accretion vortex: 3 colour bands, tilted disk, particles placed analytically (no per-particle state) */
    const tilt = 0.24, ct = Math.cos(tilt), st = Math.sin(tilt), bands = [new Path2D(), new Path2D(), new Path2D()], N = 640;
    for (let i = 0; i < N; i++) { const u = (i * 0.6180339887) % 1, r = 0.3 + u * u * 1.05, an = i * 2.399963 + t * V.kepler(r), x = Math.cos(an) * r, z0 = Math.sin(an) * r, y0 = Math.sin(an * 3 + t) * 0.012, y = y0 * ct - z0 * st, z = y0 * st + z0 * ct, p = P(x, y, z), sz = (u < 0.25 ? 1.8 : 1.2) * d * p[3]; bands[u < 0.22 ? 0 : u < 0.6 ? 1 : 2].rect(p[0], p[1], sz, sz); }
    g.fillStyle = `rgba(${RGB.ink},.85)`; g.fill(bands[0]); g.fillStyle = `rgba(${RGB.gold},.75)`; g.fill(bands[1]); g.fillStyle = `rgba(${RGB.gold},.38)`; g.fill(bands[2]);
    /* nested Hopf torus knots: rotate in 4D, stereographic to R³ */
    const a4 = t * 0.29, b4 = t * 0.17, c4 = t * 0.11, kc = [RGB.gold, RGB.up, RGB.gold, RGB.ink];
    memo.K.forEach((K, ki) => { const path = new Path2D(), n = K.length / 4; let brk = false; for (let k = 0; k <= n; k++) { const j = (k % n) * 4, q = V.rot4([K[j], K[j + 1], K[j + 2], K[j + 3]], a4 * (ki % 2 ? -1 : 1), b4, c4), e = V.stereo(q[0], q[1], q[2], q[3]), sc = 0.34, far = e[0] * e[0] + e[1] * e[1] + e[2] * e[2] > 7, p = P(e[0] * sc, e[1] * sc, e[2] * sc); if (far) { brk = true; continue; } if (k && !brk) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); brk = false; } /* near the projection pole the knot runs to infinity: lift the pen there instead of drawing a canvas-wide chord */ glow2(g, path, kc[ki], 0.55 + 0.2 * Math.sin(t * 1.3 + ki), 1, d); });
    /* tesseract + inner counter-rotating tesseract */
    const T = memo.T; for (const [scl, dir, col] of [[0.62, 1, RGB.gold], [0.3, -1, RGB.up]]) { const pv = T.v.map((v) => { const q = V.rot4(v, t * 0.5 * dir, t * 0.33, t * 0.21 * dir), k4 = 1 / (2.4 - q[3] * 0.5); return P(q[0] * k4 * scl, q[1] * k4 * scl, q[2] * k4 * scl); }), path = new Path2D(); for (const [i, j] of T.e) { path.moveTo(pv[i][0], pv[i][1]); path.lineTo(pv[j][0], pv[j][1]); } glow2(g, path, col, 0.7, 1.1, d); g.fillStyle = `rgba(${RGB.ink},.9)`; for (const p of pv) g.fillRect(p[0] - 1.2 * d, p[1] - 1.2 * d, 2.4 * d, 2.4 * d); }
    /* 6 orbiting squad nodes (projected now: dendrites + bolts aim at them) */
    const nodes = (s.nodes || []).slice(0, 6), np = [0, 1, 2, 3, 4, 5].map((k) => { const q = V.nodePos(k, t); return P(q[0], q[1], q[2]); });
    /* L-system dendrites from the core toward each node */
    const D = memo.D; np.forEach((p, k) => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1, sc = (L * 0.62) / memo.Dm, ux = dx / L, uy = dy / L, path = new Path2D(); for (let i = 0; i < D.length; i += 5) { const x0 = D[i], y0 = -D[i + 1], x1 = D[i + 2], y1 = -D[i + 3]; path.moveTo(cx + (y0 * ux - x0 * uy) * sc, cy + (y0 * uy + x0 * ux) * sc); path.lineTo(cx + (y1 * ux - x1 * uy) * sc, cy + (y1 * uy + x1 * ux) * sc); } const st0 = nodes[k] && nodes[k].st; g.strokeStyle = `rgba(${NODE_COL(st0)},${(0.1 + 0.07 * Math.sin(t * 2 + k)).toFixed(3)})`; g.lineWidth = 0.8 * d; g.stroke(path); });
    /* event horizon: photon ring + lensed far side of the disk + black hole */
    const hr = S * 0.16; g.strokeStyle = `rgba(${RGB.gold},.35)`; g.lineWidth = 7 * d; g.beginPath(); g.ellipse(cx, cy, hr * 1.55, hr * 0.62, 0, Math.PI, 2 * Math.PI); g.stroke(); g.strokeStyle = `rgba(${RGB.ink},.9)`; g.lineWidth = 2 * d; g.beginPath(); g.arc(cx, cy, hr * 1.08, 0, 2 * Math.PI); g.stroke(); g.strokeStyle = `rgba(${RGB.gold},.5)`; g.lineWidth = 5 * d; g.beginPath(); g.arc(cx, cy, hr * 1.16, 0, 2 * Math.PI); g.stroke();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, hr, 0, 2 * Math.PI); g.fill(); g.globalCompositeOperation = 'lighter';
    /* plasma arcs: one per squad fire (fading), plus a faint ambient arc to a working node */
    const arc = (k, seed, a, col) => { const p = np[k], B = V.bolt(seed, cx, cy, p[0], p[1], 5, 0.2), path = new Path2D(); for (let i = 0; i < B.length; i += 2) { if (i) path.lineTo(B[i], B[i + 1]); else path.moveTo(B[i], B[i + 1]); } g.strokeStyle = `rgba(${col},${(a * 0.18).toFixed(3)})`; g.lineWidth = 7 * d; g.stroke(path); g.strokeStyle = `rgba(${col},${a.toFixed(3)})`; g.lineWidth = 2 * d; g.stroke(path); g.strokeStyle = `rgba(${RGB.ink},${(a * 0.9).toFixed(3)})`; g.lineWidth = 0.7 * d; g.stroke(path); };
    for (const f of s.fx || []) if (f.k >= 0 && f.k < 6) arc(f.k, (f.seed | 0) + Math.floor(t * 24), Math.max(0, 1 - f.age), f.k === 3 ? RGB.dn : f.k === 2 ? RGB.up : RGB.gold);
    const live = nodes.map((n, k) => (n && (n.st === 'ACTIVE' || /DEMO/.test(n.st || '')) ? k : -1)).filter((k) => k >= 0); if (live.length) { const tk = Math.floor(t * 3); arc(live[tk % live.length], tk * 7919, 0.28, RGB.gold); }
    /* node bodies (holographic hexagons) + labels */
    g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
    np.forEach((p, k) => { const n = nodes[k] || {}, col = NODE_COL(n.st), r = 13 * d * p[3], hot = (s.fx || []).some((f) => f.k === k && f.age < 0.5); g.fillStyle = 'rgba(0,0,0,.72)'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * Math.PI + t * 0.6; g.lineTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r); } g.closePath(); g.fill(); g.strokeStyle = `rgba(${col},${hot ? 1 : 0.85})`; g.lineWidth = (hot ? 2.4 : 1.4) * d; g.stroke(); g.strokeStyle = `rgba(${col},.35)`; g.lineWidth = d; g.beginPath(); g.arc(p[0], p[1], r * 1.5, t * 2 + k, t * 2 + k + 4); g.stroke(); g.fillStyle = `rgba(${col},1)`; g.beginPath(); g.arc(p[0], p[1], 2.6 * d, 0, 2 * Math.PI); g.fill(); g.font = `800 ${9.5 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = V.PAL.gold; g.fillText(n.n || '', p[0], p[1] - r - 6 * d); g.font = `700 ${8.5 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = `rgba(${col},1)`; g.fillText((n.st || 'STANDBY') + (n.f ? ' · ' + n.f : ''), p[0], p[1] + r + 11 * d); });
    g.font = `800 ${10 * d}px Inter, system-ui, sans-serif`; g.fillStyle = V.PAL.gold; g.fillText('4D SINGULARITY · TESSERACT · HOPF S³→S² TORUS KNOTS · ACCRETION VORTEX · L-SYSTEM DENDRITES · PLASMA ARCS', cx, H - 22 * d);
    g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = V.PAL.mut; g.fillText(`${s.mode || 'STANDBY'} · ${s.active || 0} active · ${s.real || 0} real / ${s.demo || 0} demo events${s.off ? ' · rendered off-thread' : ''}`, cx, H - 9 * d);
    g.textAlign = 'right'; g.fillText('drag to orbit · wheel to zoom', W - 10 * d, 16 * d); g.textAlign = 'center';
    if ((s.mode || 'STANDBY') === 'STANDBY') { g.fillStyle = `rgba(${RGB.gold},.8)`; g.font = `800 ${12 * d}px Inter, system-ui, sans-serif`; g.fillText('STANDBY · no bot running', cx, 18 * d); }
  };
  /* strange attractor (left) + Merton probability cone (right). s.data: { lz, rs, bands, steps } (sent once per refresh) */
  R.ac = (g, s, memo) => {
    const { W, H, d, t } = s, D = s.data || {}, half = Math.round(W * 0.42); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    g.font = `600 ${10 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left';
    if (D.lz) { const P = V.cam(t * 0.3, 0.35, Math.min(half, H) * 0.42, half / 2, H * 0.52); g.globalCompositeOperation = 'lighter'; for (const [arr, sc, off, col] of [[D.lz, 0.032, [0, -0.8, 0], RGB.gold], [D.rs, 0.07, [0, -0.3, 0], RGB.up]]) { if (!arr) continue; const path = new Path2D(); for (let i = 0; i < arr.length; i += 3) { const p = P(arr[i] * sc, arr[i + 2] * sc + off[1], arr[i + 1] * sc); if (i) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); } glow2(g, path, col, 0.8, 0.9, d); } g.globalCompositeOperation = 'source-over'; } else { g.fillStyle = V.PAL.mut; g.fillText('attractor: computing in the Quant lane…', 8 * d, 18 * d); }
    g.strokeStyle = `rgba(${RGB.gold},.18)`; g.lineWidth = d; g.beginPath(); g.moveTo(half + 0.5, 6 * d); g.lineTo(half + 0.5, H - 6 * d); g.stroke();
    const B = D.bands; if (!B) { g.fillStyle = V.PAL.mut; g.fillText('Merton cone: waiting for ≥ 60 bars', half + 10 * d, 18 * d); return; }
    const n = D.steps + 1, lo = Math.min(...B.p10) * 0.995, hi = Math.max(...B.p90) * 1.005, x0 = half + 46 * d, xs = (i) => x0 + (i / (n - 1)) * (W - x0 - 8 * d), ys = (v) => H - 14 * d - ((v - lo) / (hi - lo || 1)) * (H - 26 * d);
    const band = (a, b, col, al) => { g.fillStyle = `rgba(${col},${al})`; g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(xs(i), ys(a[i])); for (let i = n - 1; i >= 0; i--) g.lineTo(xs(i), ys(b[i])); g.closePath(); g.fill(); };
    band(B.p10, B.p90, RGB.up, 0.16); band(B.p25, B.p75, RGB.gold, 0.28);
    const line = (a, col, lw, al) => { const p = new Path2D(); for (let i = 0; i < n; i++) { if (i) p.lineTo(xs(i), ys(a[i])); else p.moveTo(xs(i), ys(a[i])); } g.globalCompositeOperation = 'lighter'; glow2(g, p, col, al, lw, d); g.globalCompositeOperation = 'source-over'; };
    line(B.p90, RGB.up, 1, 0.9); line(B.p10, RGB.dn, 1, 0.8); line(B.p50, RGB.gold, 1.8, 1);
    g.font = `700 ${9 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'right'; g.fillStyle = V.PAL.up; g.fillText('P90 ' + fp(B.p90[n - 1]), x0 - 4 * d, ys(B.p90[n - 1]) + 3 * d); g.fillStyle = V.PAL.gold; g.fillText('P50 ' + fp(B.p50[n - 1]), x0 - 4 * d, ys(B.p50[n - 1]) + 3 * d); g.fillStyle = V.PAL.dn; g.fillText('P10 ' + fp(B.p10[n - 1]), x0 - 4 * d, ys(B.p10[n - 1]) + 3 * d);
    if (s.hover) { const i = clamp(Math.round(((s.hover.x * W - x0) / (W - x0 - 8 * d)) * (n - 1)), 0, n - 1), x = xs(i); g.strokeStyle = `rgba(${RGB.ink},.6)`; g.lineWidth = d; g.beginPath(); g.moveTo(x, 6 * d); g.lineTo(x, H - 12 * d); g.stroke(); g.textAlign = x > W * 0.75 ? 'right' : 'left'; const dx = x > W * 0.75 ? -6 * d : 6 * d; g.fillStyle = V.PAL.up; g.fillText('P90 ' + fp(B.p90[i]), x + dx, 16 * d); g.fillStyle = V.PAL.gold; g.fillText('P50 ' + fp(B.p50[i]), x + dx, 28 * d); g.fillStyle = V.PAL.dn; g.fillText('P10 ' + fp(B.p10[i]), x + dx, 40 * d); }
  };
  /* eigen-risk sonar (left) + worker mesh bars (right). s.eig: { syms, top, loss3s } | null; s.lanes: [[name, avgMs, p99Ms, state, q]] */
  R.sonar2 = (g, s) => {
    const { W, H, d, t } = s, half = W * 0.52, cx = half * 0.5, cy = H / 2, Rr = Math.min(half * 0.46, H * 0.44), sw = (t * 1.7) % (2 * Math.PI), e = s.eig; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter'; const rings = new Path2D(); for (let k = 1; k <= 5; k++) { rings.moveTo(cx + (Rr * k) / 5, cy); rings.arc(cx, cy, (Rr * k) / 5, 0, 2 * Math.PI); } for (let k = 0; k < 12; k++) { const a = (k / 12) * 2 * Math.PI; rings.moveTo(cx, cy); rings.lineTo(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); } glow2(g, rings, RGB.gold, 0.32, 0.8, d);
    if (g.createConicGradient) { const gr = g.createConicGradient(sw - 1.1, cx, cy); gr.addColorStop(0, `rgba(${RGB.up},0)`); gr.addColorStop(0.17, `rgba(${RGB.up},.55)`); gr.addColorStop(0.175, `rgba(${RGB.up},0)`); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Rr, 0, 2 * Math.PI); g.fill(); }
    const beam = new Path2D(); beam.moveTo(cx, cy); beam.lineTo(cx + Math.cos(sw) * Rr, cy + Math.sin(sw) * Rr); glow2(g, beam, RGB.up, 1, 1.6, d);
    g.font = `700 ${9 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left';
    if (e && e.syms) e.syms.forEach((sy, i) => { const an = (i / e.syms.length) * 2 * Math.PI, rr = Rr * clamp(Math.abs(e.top[i] || 0) * 1.4, 0.14, 1), x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr, age = ((sw - an + 4 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI), br = Math.max(0.35, 1 - age), col = (e.top[i] || 0) >= 0 ? RGB.gold : RGB.dn; g.fillStyle = `rgba(${col},${(br * 0.3).toFixed(3)})`; g.beginPath(); g.arc(x, y, 9 * d, 0, 2 * Math.PI); g.fill(); g.fillStyle = `rgba(${col},${br.toFixed(3)})`; g.beginPath(); g.arc(x, y, 3.6 * d, 0, 2 * Math.PI); g.fill(); g.fillStyle = `rgba(${RGB.ink},${br.toFixed(3)})`; g.fillText(String(sy).replace(/^oc:[^:]+:/, '').slice(0, 9), x + 6 * d, y + 3 * d); });
    else { g.fillStyle = `rgba(${RGB.mut},1)`; g.fillText('collecting live samples…', 6 * d, 14 * d); }
    g.globalCompositeOperation = 'source-over';
    const L = s.lanes || [], x0 = half + 12 * d, rowH = (H - 22 * d) / Math.max(1, L.length), mx = Math.max(1, ...L.map((l) => l[2] || 0)); g.font = `700 ${9 * d}px ui-monospace, Menlo, monospace`;
    g.fillStyle = V.PAL.gold; g.textAlign = 'left'; g.fillText('WORKER MESH · avg / p99 ms', x0, 11 * d);
    L.forEach((l, i) => { const y = 18 * d + i * rowH, bw = W - x0 - 96 * d, col = l[3] === 'BUSY' ? RGB.gold : l[3] === 'INLINE' ? RGB.dn : RGB.up; g.fillStyle = V.PAL.ink; g.fillText('W' + (i + 1), x0, y + rowH * 0.62); g.fillStyle = `rgba(${col},.16)`; g.fillRect(x0 + 24 * d, y + rowH * 0.2, bw, rowH * 0.55); g.fillStyle = `rgba(${col},.95)`; g.fillRect(x0 + 24 * d, y + rowH * 0.2, Math.max(2 * d, bw * clamp((l[1] || 0) / mx, 0, 1)), rowH * 0.55); g.fillStyle = `rgba(${RGB.ink},.85)`; g.fillRect(x0 + 24 * d + bw * clamp((l[2] || 0) / mx, 0, 1) - d, y + rowH * 0.12, 2 * d, rowH * 0.7); g.fillStyle = V.PAL.ink; g.fillText(f2(l[1], 2) + ' / ' + f2(l[2], 1), x0 + 30 * d + bw, y + rowH * 0.62); });
  };
  /* equity sparkline of the REAL running bots. s.data: { eq: [..] } */
  R.eq = (g, s) => {
    const { W, H, d } = s, q = (s.data && s.data.eq) || []; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    if (q.length < 2) { g.strokeStyle = `rgba(${RGB.mut},.5)`; g.lineWidth = d; g.beginPath(); g.moveTo(4 * d, H / 2); g.lineTo(W - 4 * d, H / 2); g.stroke(); g.fillStyle = V.PAL.mut; g.font = `600 ${9 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left'; g.fillText('equity: no real bot running', 6 * d, 12 * d); return; }
    const lo = Math.min(...q), hi = Math.max(...q), up = q[q.length - 1] >= q[0], col = up ? RGB.up : RGB.dn, xs = (i) => 4 * d + (i / (q.length - 1)) * (W - 8 * d), ys = (v) => H - 4 * d - ((v - lo) / (hi - lo || 1)) * (H - 8 * d);
    g.fillStyle = `rgba(${col},.14)`; g.beginPath(); g.moveTo(xs(0), H); q.forEach((v, i) => g.lineTo(xs(i), ys(v))); g.lineTo(xs(q.length - 1), H); g.closePath(); g.fill();
    const p = new Path2D(); q.forEach((v, i) => (i ? p.lineTo(xs(i), ys(v)) : p.moveTo(xs(i), ys(v)))); g.globalCompositeOperation = 'lighter'; glow2(g, p, col, 1, 1.5, d); g.globalCompositeOperation = 'source-over';
  };

  /* ══ 3. Alpha Radar dome ══ */
  V.QUADS = [['stock', 'Stocks'], ['crypto', 'Crypto'], ['perp', 'Perps'], ['dex', 'On-Chain DEX']];
  V.quadOf = (m) => Math.max(0, V.QUADS.findIndex((q) => q[0] === m));
  /* orb position on the dome: higher score → nearer the centre and higher above the base disk */
  V.radarPos = (o) => { const q = V.quadOf(o.m), u = clamp((o.score - 50) / 50, 0, 1), an = (q + 0.12 + 0.76 * (o.a == null ? 0.5 : o.a)) * (Math.PI / 2), rad = 0.98 - 0.72 * u; return [Math.cos(an) * rad, 0.06 + 0.62 * Math.pow(u, 1.4), Math.sin(an) * rad]; };
  V.radarCam = (s) => V.cam((s.yaw || 0) + s.t * 0.07, s.pitch == null ? 0.52 : s.pitch, Math.min(s.W, s.H * 1.5) * 0.4 * clamp(s.zoom || 1, 0.5, 2.5), s.W / 2, s.H * 0.6);
  V.GRADE_COL = { S: RGB.ink, 'A+': RGB.gold, A: RGB.up, 'B+': RGB.gold, B: RGB.mut, C: RGB.mut };
  /* s: { W, H, d, t, yaw, pitch, zoom, sel, data: { orbs: [{ sym, l, m, score, g, a }], arcs: [[i, j, w]] }, paused } */
  R.radar = (g, s, memo) => {
    const { W, H, d, t } = s, P = V.radarCam(s), D = s.data || { orbs: [], arcs: [] }, O = D.orbs || [], c0 = P(0, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    if (g.createRadialGradient) { const rg = g.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], Math.max(W, H) * 0.6); rg.addColorStop(0, `rgba(${RGB.gold},.16)`); rg.addColorStop(1, `rgba(${RGB.gold},0)`); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'lighter';
    const circ = (path, ox, oz, r, y, n) => { for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI, p = P(ox + Math.cos(a) * r, y, oz + Math.sin(a) * r); if (i) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); } };
    /* base: concentric rings, quadrant spokes, flower-of-life (sacred geometry) */
    const base = new Path2D(); for (let k = 1; k <= 5; k++) circ(base, 0, 0, k / 5, 0, 64); for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * Math.PI, p = P(Math.cos(a), 0, Math.sin(a)); base.moveTo(c0[0], c0[1]); base.lineTo(p[0], p[1]); } glow2(g, base, RGB.gold, 0.26, 0.7, d);
    const fol = new Path2D(); for (let k = 0; k < 6; k++) { const a = (k / 6) * 2 * Math.PI + t * 0.05; circ(fol, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.5, 0, 48); } circ(fol, 0, 0, 0.5, 0, 48); glow2(g, fol, RGB.up, 0.16, 0.7, d);
    const qa = [0, 1, 2, 3].map((q) => { const a = (q + 0.5) * (Math.PI / 2); return P(Math.cos(a) * 1.13, 0, Math.sin(a) * 1.13); });
    /* rotating wave-interference torus: radius modulated by two counter-propagating standing waves */
    const tor = new Path2D(), R0 = 0.55, r0 = 0.13, rot = t * 0.25; for (let i = 0; i < 22; i++) { const u = (i / 22) * 2 * Math.PI + rot; for (let j = 0; j <= 28; j++) { const v = (j / 28) * 2 * Math.PI, rr = r0 * (1 + 0.38 * Math.sin(5 * u + 2.1 * t) * Math.cos(3 * v - 1.4 * t)), x = (R0 + rr * Math.cos(v)) * Math.cos(u), z = (R0 + rr * Math.cos(v)) * Math.sin(u), y = 0.34 + rr * Math.sin(v), p = P(x, y, z); if (j) tor.lineTo(p[0], p[1]); else tor.moveTo(p[0], p[1]); } } glow2(g, tor, RGB.gold, 0.32, 0.6, d);
    /* sweeping volumetric beam: a fan of vertical sheets trailing the sweep angle */
    const sw = (t * (s.paused ? 0 : 0.9)) % (2 * Math.PI); for (let i = 0; i < 9; i++) { const a0 = sw - i * 0.045, a1 = a0 - 0.045, p0 = P(Math.cos(a0), 0, Math.sin(a0)), p1 = P(Math.cos(a1), 0, Math.sin(a1)), u0 = P(Math.cos(a0), 0.5, Math.sin(a0)), u1 = P(Math.cos(a1), 0.5, Math.sin(a1)), al = (0.2 * (1 - i / 9)).toFixed(3); g.fillStyle = `rgba(${RGB.gold},${al})`; g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.closePath(); g.fill(); g.fillStyle = `rgba(${RGB.gold},${(al * 0.5).toFixed(3)})`; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(u0[0], u0[1]); g.lineTo(u1[0], u1[1]); g.lineTo(p1[0], p1[1]); g.closePath(); g.fill(); }
    /* opportunity orbs */
    const pos = O.map((o) => { const q = V.radarPos(o); return { o, p: P(q[0], q[1], q[2]), b: P(q[0], 0, q[2]), an: Math.atan2(q[2], q[0]) }; });
    /* transfer-entropy plasma arcs (animated dashes) */
    if (g.setLineDash) { g.setLineDash([5 * d, 7 * d]); g.lineDashOffset = -t * 40 * d; }
    for (const [i, j, w] of D.arcs || []) { const A = pos[i], B = pos[j]; if (!A || !B) continue; const mx = (A.p[0] + B.p[0]) / 2, my = Math.min(A.p[1], B.p[1]) - 40 * d; g.strokeStyle = `rgba(${RGB.up},${(clamp(w, 0.1, 1) * (0.45 + 0.35 * Math.sin(t * 3 + i))).toFixed(3)})`; g.lineWidth = 1.4 * d; g.beginPath(); g.moveTo(A.p[0], A.p[1]); g.quadraticCurveTo(mx, my, B.p[0], B.p[1]); g.stroke(); }
    if (g.setLineDash) g.setLineDash([]);
    pos.sort((a, b) => b.p[2] - a.p[2]);
    for (const { o, p, b, an } of pos) { const col = V.GRADE_COL[o.g] || RGB.mut, lit = Math.max(0, 1 - (((sw - an) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / 1.2), rr = (2.5 + Math.max(0, o.score - 50) / 9) * d * p[3]; g.strokeStyle = `rgba(${col},.35)`; g.lineWidth = d; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(p[0], p[1]); g.stroke(); g.fillStyle = `rgba(${col},${(0.16 + 0.3 * lit).toFixed(3)})`; g.beginPath(); g.arc(p[0], p[1], rr * 2.6, 0, 2 * Math.PI); g.fill(); g.fillStyle = `rgba(${col},${(0.75 + 0.25 * lit).toFixed(3)})`; g.beginPath(); g.arc(p[0], p[1], rr, 0, 2 * Math.PI); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
    g.font = `800 ${10 * d}px Inter, system-ui, sans-serif`; V.QUADS.forEach(([, name], q) => { const lab = name.toUpperCase() + ' (' + O.filter((o) => V.quadOf(o.m) === q).length + ')', hw = g.measureText(lab).width / 2 + 4 * d; g.fillStyle = V.PAL.gold; g.fillText(lab, clamp(qa[q][0], hw, W - hw), clamp(qa[q][1] + 4 * d, 40 * d, H - 6 * d)); }); /* rim labels stay inside narrow (phone) canvases */
    g.font = `700 ${8.5 * d}px ui-monospace, Menlo, monospace`; for (const { o, p } of pos) if (o.score >= 78 || o.sym === s.sel) { g.fillStyle = V.PAL.ink; g.fillText(String(o.l).slice(0, 10) + ' ' + o.g, p[0], p[1] - 10 * d); }
    const se = pos.find((x) => x.o.sym === s.sel); if (se) { const [x, y] = se.p, r = 18 * d, a = t * 1.5; g.strokeStyle = `rgba(${RGB.gold},1)`; g.lineWidth = 1.6 * d; for (let k = 0; k < 4; k++) { const b = a + (k * Math.PI) / 2; g.beginPath(); g.arc(x, y, r, b, b + 0.9); g.stroke(); } g.beginPath(); g.moveTo(x - r * 1.6, y); g.lineTo(x - r * 0.6, y); g.moveTo(x + r * 0.6, y); g.lineTo(x + r * 1.6, y); g.moveTo(x, y - r * 1.6); g.lineTo(x, y - r * 0.6); g.moveTo(x, y + r * 0.6); g.lineTo(x, y + r * 1.6); g.stroke(); g.fillStyle = V.PAL.gold; g.font = `800 ${10 * d}px ui-monospace, Menlo, monospace`; g.fillText('◎ ' + String(se.o.l).slice(0, 12) + ' · ' + se.o.g + ' ' + Math.round(se.o.score), x, y + r * 2.4); }
    g.textAlign = 'left'; g.font = `800 ${10 * d}px Inter, system-ui, sans-serif`; g.fillStyle = V.PAL.gold; g.fillText('ALPHA RADAR · QUANTUM CONSTELLATION', 10 * d, 16 * d); g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = V.PAL.mut; g.fillText(`${O.length} graded · ${(D.arcs || []).length} transfer-entropy links${s.paused ? ' · PAUSED' : ''}${s.off ? ' · rendered off-thread' : ''}`, 10 * d, 29 * d);
  };
  V.R = R;
  /* register with the v17.5 renderer table (main thread, worker kernel and Node all load this file after v175core.js) */
  for (const k of ['sing', 'ac', 'sonar2', 'eq', 'radar']) { X.R[k] = R[k]; if (X.R.KINDS.indexOf(k) < 0) X.R.KINDS.push(k); }

  /* ══ 4. Alpha Radar grading: applicable engines + 6-bot consensus ══ */
  V.TIERS = [['S', 92], ['A+', 85], ['A', 78], ['B+', 70], ['B', 60]];
  V.grade = (score) => { for (const [g, m] of V.TIERS) if (score >= m) return g; return 'C'; };
  V.MIN_GRADE = { all: 0, S: 92, 'A+': 85, A: 78, 'B+': 70 };
  V.BOTS = ['HUNTER-α', 'MUTATOR-EVO', 'HEDGER-ARB', 'RISK-GUARD', 'SNIPER-EXEC', 'SCALPER-EXIT'];
  const SCALE = { stock: 3, crypto: 6, perp: 6, dex: 25 }; // a "big" 24 h move per market, %
  /* safe max order size for ≤ 2 % price impact: constant-product pool (x·y = k, quote reserve = liq / 2) for DEX pools,
     square-root impact law (impact ≈ σ_daily · √(Q / ADV)) elsewhere, capped at 1 % of ADV */
  V.safeSize = (a) => {
    if (a.m === 'dex') return a.liq > 0 ? (a.liq / 2) * (Math.sqrt(1.02) - 1) : null;
    const adv = a.advUsd, sig = Math.max(0.004, a.sigD || 0.02); if (!(adv > 0)) return null; return Math.min(adv * 0.01, adv * (0.02 / sig) ** 2);
  };
  /* DEX rug shield 0…100 (higher = safer) from liquidity, buy/sell balance, age, mcap/liquidity */
  V.rugShield = (a) => { let s = 50; const liq = a.liq || 0, b = a.buys || 0, sl = a.sells || 0, age = a.ageH; s += liq > 1e6 ? 25 : liq > 2.5e5 ? 15 : liq > 5e4 ? 0 : -25; if (b + sl > 50) s += clamp(((b - sl) / (b + sl)) * 40, -20, 15); if (fin(age)) s += age < 6 ? -20 : age < 48 ? -8 : age > 24 * 30 ? 10 : 0; if (a.mcap > 0 && liq > 0) s += a.mcap / liq > 80 ? -15 : 0; return Math.round(clamp(s, 0, 100)); };
  /* asset: { sym, l, m: 'stock'|'crypto'|'perp'|'dex', px, chg24, hi24, lo24, advUsd, liq, mcap, buys, sells, ageH, bid, ask, funding, series: [..prices] }
     ctx: { med: { stock, crypto, perp, dex } median 24 h change per market } */
  V.score = (a, ctx) => {
    const px = a.px, ser = (a.series || []).filter((x) => x > 0), n = ser.length, r = []; for (let i = 1; i < n; i++) r.push(ser[i] / ser[i - 1] - 1);
    const sc = SCALE[a.m] || 6, chg = fin(a.chg24) ? a.chg24 : 0, rng = a.hi24 > a.lo24 ? a.hi24 - a.lo24 : px * (sc / 100), rp = a.hi24 > a.lo24 ? clamp((px - a.lo24) / (a.hi24 - a.lo24), 0, 1) : 0.5;
    const eng = [], sigD = rng / px / 2 || 0.02; a.sigD = sigD;
    let hurst = null, slope = 0, pe = null; if (n >= 32) { hurst = clamp(E.hurst(r), 0, 1); const k = E.kalman(ser.slice(-60)); slope = (k[k.length - 1] / k[Math.max(0, k.length - 10)] - 1) * 100; pe = E.permEntropy(r); eng.push(['Hurst', f2(hurst, 2)], ['Adaptive Kalman', (slope >= 0 ? '+' : '') + f2(slope, 2) + '%'], ['Perm. entropy', f2(pe, 2)]); }
    const atr = Math.max(rng * 0.35, px * 0.002), side0 = chg >= 0 ? 'long' : 'short', side = a.m === 'dex' ? 'long' : side0, sgn = side === 'long' ? 1 : -1;
    const br = E.shadowBracket(px, side, atr); eng.push(['Shadow bracket', 'stop ' + fp(br.stop)]);
    const kel = E.kelly(clamp(0.5 + chg / (sc * 8), 0.3, 0.7), 2); eng.push(['Kelly', f2(kel * 100, 1) + '%']);
    const safe = V.safeSize(a); eng.push(['≤2% impact size', usd(safe)]);
    const spread = a.bid > 0 && a.ask > 0 ? (a.ask / a.bid - 1) * 1e4 : null; if (spread != null) { const ot = E.orderType({ spreadBps: spread, volBps: sigD * 1e4, urgency: 0.5, sizePctAdv: safe && a.advUsd ? 10000 / a.advUsd : 0.001 }); eng.push(['Order type', ot.best]); }
    const rug = a.m === 'dex' ? V.rugShield(a) : null; if (rug != null) { const mev = E.mevSandwich({ sizeUsd: 1000, liqUsd: a.liq || 1e5, slipTol: 0.01, gasUsd: 0.5 }); eng.push(['Rug shield', rug + '/100'], ['MEV sandwich $1k', f2(mev.prob * 100, 0) + '%']); }
    /* 6-bot debate: each vote ∈ [−1, 1] for the proposed side, with one plain-English reason */
    const m = clamp(chg / sc, -2, 2), med = (ctx && ctx.med && fin(ctx.med[a.m]) ? ctx.med[a.m] : 0), rel = clamp((chg - med) / sc, -2, 2);
    const v = [];
    v.push([clamp(sgn * (m * 0.6) + (side === 'long' ? rp - 0.5 : 0.5 - rp), -1, 1), Math.abs(chg) < sc * 0.15 ? 'no momentum to hunt' : `${chg >= 0 ? '+' : ''}${f2(chg, 1)}% 24 h, ${Math.round(rp * 100)}% of the day's range`]);
    v.push(hurst == null ? [0, 'regime: warming up (' + n + '/32 live samples)'] : [clamp(sgn * Math.sign(slope) * (hurst - 0.45) * 4, -1, 1), `Hurst ${f2(hurst, 2)} (${hurst > 0.55 ? 'trending' : hurst < 0.45 ? 'mean-reverting' : 'random walk'}), Kalman ${slope >= 0 ? 'up' : 'down'}`]);
    v.push([clamp(sgn * rel * 0.8, -1, 1), `${rel * sgn >= 0 ? 'outperforms' : 'lags'} the ${a.m === 'stock' ? 'stock' : a.m === 'dex' ? 'DEX' : 'crypto'} median by ${f2(Math.abs(chg - med), 1)} pts`]);
    let risk = 0.4; const why = []; if (Math.abs(chg) > sc * 3) { risk -= 0.9; why.push('parabolic move'); } if (sigD > (a.m === 'stock' ? 0.04 : 0.12)) { risk -= 0.4; why.push('wide range'); } if (rug != null && rug < 45) { risk -= 1; why.push('rug shield ' + rug); } if (safe != null && safe < 2000) { risk -= 0.5; why.push('thin liquidity'); } if (a.m === 'dex' && side0 === 'short') { risk -= 0.6; why.push('no shorting on-chain'); }
    v.push([clamp(risk, -1, 1), why.length ? 'flags ' + why.join(', ') : 'risk inside limits']);
    v.push(spread == null ? [safe != null && safe > 1e4 ? 0.5 : 0, safe != null ? 'fills up to ' + usd(safe) + ' at ≤ 2% impact' : 'no depth data'] : [clamp((25 - spread) / 25, -1, 1) * (safe != null && safe > 1e4 ? 1 : 0.5), `spread ${f2(spread, 1)} bps, ≤ 2% impact up to ${usd(safe)}`]);
    const stop = br.stop, risk1 = Math.abs(px - stop) || px * 0.01, tp1 = side === 'long' ? Math.max(px + 1.5 * risk1, a.hi24 > px ? a.hi24 : 0) : Math.min(px - 1.5 * risk1, a.lo24 > 0 && a.lo24 < px ? a.lo24 : Infinity), tp2 = px + sgn * 3 * risk1, rr = Math.abs(tp1 - px) / risk1;
    v.push([clamp((rr - 1.2) / 1.5, -1, 1), `R:R ${f2(rr, 1)} to TP1, 3.0 to TP2`]);
    const W8 = [1.2, 1, 0.8, 1.4, 0.7, 0.9]; let num = 0, den = 0; v.forEach(([x], i) => { num += x * W8[i]; den += W8[i]; }); let raw = 50 + 50 * (num / den);
    if (v[3][0] < -0.5) raw = Math.min(raw, 69); // RISK-GUARD veto
    const conf = 0.55 + 0.45 * Math.min(1, n / 60), score = Math.round(clamp(55 + (raw - 55) * conf, 0, 100) * 10) / 10, gr = V.grade(score);
    const pro = v.filter((x) => x[0] > 0.15).length, con = v.filter((x) => x[0] < -0.15).length;
    const regime = hurst == null ? 'warming up · ' + n + ' samples' : (hurst > 0.55 ? 'trend' : hurst < 0.45 ? 'mean-revert' : 'random-walk') + ' · H ' + f2(hurst, 2);
    const stat = a.m === 'dex' ? 'Rug-Shield ' + rug + '/100 · liq ' + usd(a.liq) : (a.m === 'crypto' || a.m === 'perp') ? (fin(a.funding) ? 'Funding ' + f2(a.funding * 100, 4) + '%/8h' : 'Funding n/a (no perp quote) · σd ' + f2(sigD * 100, 1) + '%') : 'GEX: open Options for the chain · σd ' + f2(sigD * 100, 1) + '%';
    const trig = Math.abs(chg) < sc * 0.15 ? 'Range ' + Math.round(rp * 100) + '% · coiling' : (rp > 0.85 && side === 'long' ? 'Breakout ' : rp < 0.15 && side === 'short' ? 'Breakdown ' : side === 'long' ? 'Momentum ' : 'Fade ') + (chg >= 0 ? '+' : '') + f2(chg, 1) + '% 24 h';
    const dossier = [['Trigger', trig], ['Safe Max $ (≤2% impact)', usd(safe)], [a.m === 'dex' ? 'Rug-Shield' : a.m === 'stock' ? 'GEX' : 'Funding', stat], ['Regime Edge', regime + ' · edge ' + f2((raw - 50) / 5, 1) + '%'], ['Entry / Stop', fp(px) + ' / ' + fp(stop)], ['TP1 / TP2 · R:R', fp(tp1) + ' / ' + fp(tp2) + ' · ' + f2(rr, 1)]];
    const summary = `${pro} of 6 bots back ${side.toUpperCase()} ${a.l}${con ? `, ${con} object` : ''}. ` + V.BOTS.map((b, i) => (Math.abs(v[i][0]) > 0.15 ? `${b} ${v[i][0] > 0 ? 'for' : 'against'}: ${v[i][1]}` : '')).filter(Boolean).slice(0, 3).join('; ') + '.';
    return { sym: a.sym, l: a.l, m: a.m, px, side, score, g: gr, votes: v.map(([x, t2], i) => [V.BOTS[i], Math.round(x * 100) / 100, t2]), pro, con, entry: px, stop, tp1, tp2, rr, safe, dossier, summary, engines: eng, applied: eng.length, n };
  };
  /* scan a universe: grade every asset, keep a stable angle per symbol, transfer-entropy links between the top series */
  V.scan = (assets, opt) => {
    const o = opt || {}, by = {}; for (const a of assets) (by[a.m] = by[a.m] || []).push(fin(a.chg24) ? a.chg24 : 0); const med = {}; for (const k in by) { const s = by[k].slice().sort((x, y) => x - y); med[k] = s[s.length >> 1]; }
    const out = assets.filter((a) => a && a.px > 0).map((a) => { const r = V.score(a, { med }); let h = 0; for (const ch of String(a.sym)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; r.a = (h % 1000) / 1000; return r; }).sort((x, y) => y.score - x.score);
    const arcs = [], top = out.filter((r) => r.n >= 32).slice(0, o.teTop || 6), ser = {}; for (const a of assets) ser[a.sym] = a.series; const rr = (s) => { const r = []; for (let i = 1; i < s.length; i++) r.push(s[i] / s[i - 1] - 1); return r; };
    for (let i = 0; i < top.length; i++) for (let j = 0; j < top.length; j++) if (i !== j) { const A = ser[top[i].sym], B = ser[top[j].sym], n = Math.min(A.length, B.length); if (n < 32) continue; const te = E.transferEntropy(rr(A.slice(-n)), rr(B.slice(-n)), 3); if (te > 0.05) arcs.push([out.indexOf(top[i]), out.indexOf(top[j]), Math.min(1, te * 4)]); }
    return { picks: out, arcs: arcs.sort((x, y) => y[2] - x[2]).slice(0, 10), med };
  };
  V.counts = (picks) => ({ all: picks.length, stock: picks.filter((p) => p.m === 'stock').length, crypto: picks.filter((p) => p.m === 'crypto' || p.m === 'perp').length, dex: picks.filter((p) => p.m === 'dex').length, S: picks.filter((p) => p.score >= 92).length, 'A+': picks.filter((p) => p.score >= 85).length, A: picks.filter((p) => p.score >= 78).length, 'B+': picks.filter((p) => p.score >= 70).length });
  /* squad KPIs from REAL closed trades: win rate, profit factor, per-trade Sharpe */
  V.kpis = (pnls) => { const p = (pnls || []).filter(fin), w = p.filter((x) => x > 0), l = p.filter((x) => x <= 0), gw = w.reduce((s, x) => s + x, 0), gl = -l.reduce((s, x) => s + x, 0), s2 = sd(p); return { n: p.length, win: p.length ? w.length / p.length : null, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, sharpe: p.length >= 2 && s2 > 0 ? (mean(p) / s2) * Math.sqrt(p.length) : null }; };
  /* ══ 5. On-Chain Token Desk ══ */
  /* Rug Shield v2 from the pool's recent swaps (trades: [{ side, usd, ts (s), who }]), its stats and the safety-scan meta.
     sybil = normalised Shannon entropy of buys per wallet (low = few wallets doing most buys); slot-0 = share of buy $ in the first
     2 s after pool creation (only when that moment is inside the swap window); LP lock = scanned %; retention half-life = window ·
     ln 2 / −ln(share of buyers who have not sold since). Each check says when it can't be measured instead of guessing. */
  V.rug2 = (trades, st, meta, nowS) => {
    const T = (trades || []).filter((t) => t && fin(t.ts)), buys = T.filter((t) => t.side === 'buy'), out = { checks: [], score: null };
    const by = new Map(); for (const t of buys) if (t.who) by.set(t.who, (by.get(t.who) || 0) + 1);
    if (by.size >= 3) { const n = [...by.values()].reduce((s, x) => s + x, 0); let H = 0; for (const c of by.values()) { const p = c / n; H -= p * Math.log2(p); } const h = H / Math.log2(by.size); out.checks.push(['Sybil entropy', h >= 0.8 ? 'pass' : h >= 0.6 ? 'warn' : 'fail', `H ${f2(h, 2)} · ${by.size} wallets / ${n} buys`, h]); }
    else out.checks.push(['Sybil entropy', 'n/a', buys.length ? 'too few wallet-tagged buys (' + by.size + ' wallets)' : 'no recent buys in the swap window', null]);
    const c0 = st && fin(st.created) ? st.created / 1000 : null, t0 = T.length ? Math.min(...T.map((t) => t.ts)) : null;
    if (c0 != null && t0 != null && t0 <= c0 + 2) { const tot = buys.reduce((s, t) => s + (t.usd || 0), 0) || 1, first = buys.filter((t) => t.ts <= c0 + 2).reduce((s, t) => s + (t.usd || 0), 0), sh = first / tot; out.checks.push(['Slot-0 bundle', sh > 0.2 ? 'fail' : sh > 0.08 ? 'warn' : 'pass', f2(sh * 100, 1) + '% of buy $ in the first 2 s', 1 - sh]); }
    else out.checks.push(['Slot-0 bundle', 'n/a', c0 == null ? 'pool creation time unknown' : 'launch is older than the swap window (' + f2(((nowS || Date.now() / 1000) - c0) / 3600, 1) + ' h)', null]);
    const lp = meta && fin(meta.lpLocked) ? meta.lpLocked : null; out.checks.push(['LP lock', lp == null ? 'n/a' : lp >= 80 ? 'pass' : lp >= 50 ? 'warn' : 'fail', lp == null ? 'unscanned: run Lab → Token safety' : f2(lp, 0) + '% locked / burned', lp == null ? null : lp / 100]);
    const first = new Map(), sold = new Set(); for (const t of T) { if (!t.who) continue; if (t.side === 'buy' && !first.has(t.who)) first.set(t.who, t.ts); else if (t.side === 'sell' && first.has(t.who) && t.ts > first.get(t.who)) sold.add(t.who); }
    if (first.size >= 5 && T.length > 1) { const win = Math.max(1, Math.max(...T.map((t) => t.ts)) - t0), f = 1 - sold.size / first.size, hl = f > 0 && f < 1 ? (win * Math.LN2) / -Math.log(f) : f >= 1 ? Infinity : 0; out.checks.push(['Smart-money retention', f >= 0.75 ? 'pass' : f >= 0.5 ? 'warn' : 'fail', `${f2(f * 100, 0)}% of ${first.size} buyers still holding · half-life ${hl === Infinity ? '> window' : hl < 120 ? f2(hl, 0) + ' s' : f2(hl / 60, 1) + ' min'}`, f]); }
    else out.checks.push(['Smart-money retention', 'n/a', 'needs ≥ 5 wallet-tagged buyers in the window', null]);
    const v = out.checks.map((c) => c[3]).filter(fin); out.score = v.length ? Math.round((v.reduce((s, x) => s + clamp(x, 0, 1), 0) / v.length) * 100) : null; out.measured = v.length; return out;
  };
  /* TWAP slicer on a constant-product pool (quote reserve = liq / 2): per-slice impact, total cost vs one clip, and the sandwich
     odds for one slice at the given priority fee (V175 MEV model) */
  V.twap = (sizeUsd, liqUsd, n, prioUsd) => {
    const Rq = Math.max(1, (liqUsd || 0) / 2), N = Math.max(1, Math.min(50, Math.round(n || 1))), q = sizeUsd / N, imp = (x) => (1 + x / Rq) ** 2 - 1, one = imp(sizeUsd), per = imp(q), mev1 = E.mevSandwich({ sizeUsd, liqUsd: liqUsd || 1, slipTol: Math.max(one, 0.005), gasUsd: prioUsd }), mevN = E.mevSandwich({ sizeUsd: q, liqUsd: liqUsd || 1, slipTol: Math.max(per, 0.005), gasUsd: prioUsd });
    return { n: N, slice: q, oneImpact: one, sliceImpact: per, oneCost: sizeUsd * one / 2, twapCost: N * q * per / 2, saved: sizeUsd * one / 2 - N * q * per / 2, mevOne: mev1.prob, mevSlice: mevN.prob, safeTol: mevN.safeTol };
  };
  /* the Alpha Radar op runs in the Screener lane */
  E.alphaScan = V.scan; const scr = X.LANES.find((l) => l[0] === 'screener'); if (scr && scr[2].indexOf('alphaScan') < 0) scr[2].push('alphaScan');
  const r0 = X.route; if (!X.route._v176) { X.route = (fn) => r0(fn) || (fn === 'alphaScan' ? 'screener' : null); X.route._v176 = true; }
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V176;
