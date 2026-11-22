/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.3 core (pure, no DOM), unit-tested in test/v173.test.js.
   · box / radii   the 85 % layout box and radii scaled so the bubbles fill it (area fraction, min / max clamp)
   · step          lively bubble physics: (Age, Buy-Pressure) spring attractors, orbital swirl + buoyancy currents that never
                   stop, elastic collisions (restitution, mass ∝ r²), wall bounces, hover repel, drag (infinite mass) + fling
   · targets       on-chain (age, buy pressure) → normalised targets, never a flat line when the feed lacks a field
   · tree          procedural fractal dendrite: branching segments from a node toward the core, with depth for wave timing
   · Pool          fixed-capacity particle pool (typed arrays): spores, comets, radial filaments
   · badge         bus event → Singularity callout ("TICK BATCH", "WHALE SWEEP", "GEX SHIFT", "3D OB WALL", "FIREWALL PASS")
   · Heat          6 × N action-heat matrix (1 s buckets) with per-cell flash decay
   · Thru          throughput histogram: events / s stacked gold · emerald · crimson */
const V173 = (() => {
  const V = {};
  const fin = Number.isFinite, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  V.box = (W, H, f) => { const k = f || 0.85, w = W * k, h = H * k; return { x0: (W - w) / 2, y0: (H - h) / 2, w, h }; };
  /* radii ∝ √base, scaled so Σπr² = frac·W·H (then clamped) */
  V.radii = (bases, W, H, o) => {
    const p = o || {}, frac = p.frac || 0.3, b = bases.map((x) => Math.sqrt(Math.max(1e-9, fin(x) && x > 0 ? x : 1e-9))), mx = Math.max(...b, 1e-9), rel = b.map((x) => 0.35 + 0.65 * (x / mx));
    const sum = rel.reduce((s, x) => s + Math.PI * x * x, 0) || 1, s = Math.sqrt((frac * W * H) / sum), lo = p.min || 7, hi = p.max || Math.min(W, H) * 0.17;
    return rel.map((x) => clamp(x * s, lo, hi));
  };
  /* on-chain targets: x = age (log, newest right), y = buy pressure (high = top). Missing age → rank order; missing
     buy / sell counts → a 1h-change estimate (logistic), flagged est, so tokens never collapse onto one line */
  V.targets = (rows) => {
    const n = rows.length;
    return rows.map((r, i) => {
      const age = fin(r.ageMin) && r.ageMin > 0 ? r.ageMin : null, tx = age != null ? 1 - clamp(Math.log(age) / Math.log(1440 * 7), 0, 1) : n > 1 ? 1 - i / (n - 1) : 0.5;
      const has = fin(r.buys) && fin(r.sells) && r.buys + r.sells > 0, bp = has ? r.buys / (r.buys + r.sells) : 1 / (1 + Math.exp(-(fin(r.ch) ? r.ch : 0) / 6));
      return { tx: clamp(tx, 0, 1), ty: clamp(1 - bp, 0, 1), bp, est: !has, ageEst: age == null };
    });
  };
  /* one physics step. nodes: {x, y, vx, vy, r, tx, ty, ph, ch, drag}; o: {k, swirl, cur, damp, rest, wall, ptr:{x,y,r,on}, buoy} */
  V.step = (nodes, dt, t, W, H, o) => {
    const p = o || {}, k = p.k == null ? 3.2 : p.k, sw = p.swirl == null ? 0.9 : p.swirl, A = (p.cur == null ? 0.7 : p.cur) * Math.min(W, H), damp = p.damp == null ? 1.25 : p.damp, rest = p.rest == null ? 0.86 : p.rest, wall = p.wall == null ? 0.8 : p.wall, vmax = Math.max(W, H) * 1.6, d1 = Math.exp(-damp * dt), ptr = p.ptr, buoy = (p.buoy == null ? 0.05 : p.buoy) * Math.min(W, H);
    for (const n of nodes) {
      if (!fin(n.vx)) { n.vx = 0; n.vy = 0; } if (!fin(n.ph)) n.ph = 0;
      if (n.drag) continue;
      const wob = 0.045 * Math.min(W, H), dx = n.tx + wob * Math.cos(t * 1.7 + n.ph) - n.x, dy = n.ty + wob * Math.sin(t * 1.9 + n.ph * 1.3) - n.y; // each attractor orbits: nothing can be pinned still
      let ax = k * dx - sw * dy * 1.2, ay = k * dy + sw * dx * 1.2; // spring + orbital swirl around the attractor
      ax += A * Math.sin(n.y * 0.013 + t * 1.35 + n.ph); ay += A * Math.cos(n.x * 0.011 + t * 1.15 + n.ph * 1.7); // currents (never settle)
      ay -= buoy * clamp((fin(n.ch) ? n.ch : 0) / 10, -1, 1) * (0.6 + 0.4 * Math.sin(t * 2.1 + n.ph)); // buoyancy: gainers float up
      if (ptr && ptr.on) { const qx = n.x - ptr.x, qy = n.y - ptr.y, q = Math.hypot(qx, qy) || 1, R = (ptr.r || 90) + n.r; if (q < R) { const f = (1 - q / R) * Math.min(W, H) * 9; ax += (qx / q) * f; ay += (qy / q) * f; } }
      n.vx = (n.vx + ax * dt) * d1; n.vy = (n.vy + ay * dt) * d1;
      const sp = Math.hypot(n.vx, n.vy); if (sp > vmax) { n.vx *= vmax / sp; n.vy *= vmax / sp; }
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    let hits = 0;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, mn = a.r + b.r; if (Math.abs(dx) > mn || Math.abs(dy) > mn) continue;
      const d = Math.hypot(dx, dy) || 0.01; if (d >= mn) continue; hits++;
      const nx = dx / d, ny = dy / d, ia = a.drag ? 0 : 1 / (a.r * a.r), ib = b.drag ? 0 : 1 / (b.r * b.r), it = ia + ib || 1, ov = mn - d;
      a.x -= nx * ov * (ia / it); a.y -= ny * ov * (ia / it); b.x += nx * ov * (ib / it); b.y += ny * ov * (ib / it);
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (vn < 0) { const jj = (-(1 + rest) * vn) / it; a.vx -= jj * ia * nx; a.vy -= jj * ia * ny; b.vx += jj * ib * nx; b.vy += jj * ib * ny; }
    }
    for (const n of nodes) {
      if (n.x < n.r) { n.x = n.r; n.vx = Math.abs(n.vx) * wall; } else if (n.x > W - n.r) { n.x = W - n.r; n.vx = -Math.abs(n.vx) * wall; }
      if (n.y < n.r) { n.y = n.r; n.vy = Math.abs(n.vy) * wall; } else if (n.y > H - n.r) { n.y = H - n.r; n.vy = -Math.abs(n.vy) * wall; }
    }
    return hits;
  };
  V.energy = (nodes) => (nodes.length ? nodes.reduce((s, n) => s + Math.hypot(n.vx || 0, n.vy || 0), 0) / nodes.length : 0);
  V.rng = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  /* fractal dendrite from (x0,y0) toward (x1,y1): returns Float32Array [ax, ay, bx, by, depth01] × segments */
  V.tree = (x0, y0, x1, y1, o) => {
    const p = o || {}, rnd = V.rng(p.seed || 1), depth = p.depth || 5, segs = [], L0 = Math.hypot(x1 - x0, y1 - y0) || 1, base = Math.atan2(y1 - y0, x1 - x0);
    const grow = (x, y, ang, len, d, dist) => {
      const steer = Math.atan2(y1 - y, x1 - x), a = ang + (steer - ang) * 0.35 + (rnd() - 0.5) * 0.5, bx = x + Math.cos(a) * len, by = y + Math.sin(a) * len, nd = dist + len;
      segs.push(x, y, bx, by, Math.min(1, nd / L0));
      if (d >= depth) return;
      const kids = d < 3 ? 2 : rnd() < 0.7 ? 2 : 1;
      for (let c = 0; c < kids; c++) grow(bx, by, a + (c === 0 ? -1 : 1) * (0.32 + rnd() * 0.5) * (kids > 1 ? 1 : (rnd() - 0.5)), len * (0.68 + rnd() * 0.16), d + 1, nd);
    };
    grow(x0, y0, base, L0 * (p.first || 0.3), 1, 0);
    return Float32Array.from(segs);
  };
  /* fixed-capacity particle pool */
  V.Pool = class {
    constructor(n) { this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.c = new Uint8Array(n); this.i = 0; this.alive = 0; }
    spawn(x, y, vx, vy, life, c) { const i = this.i; this.i = (i + 1) % this.n; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.max[i] = life; this.c[i] = c || 0; return i; }
    update(dt, g, drag) { const d = drag == null ? 1 : Math.exp(-drag * dt); let a = 0; for (let i = 0; i < this.n; i++) { if (this.life[i] <= 0) continue; this.life[i] -= dt; this.vx[i] *= d; this.vy[i] = this.vy[i] * d + (g || 0) * dt; this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; if (this.life[i] > 0) a++; } this.alive = a; return a; }
  };
  /* Singularity callouts */
  V.badge = (e) => {
    const t = String((e && e.type) || ''), nd = String((e && e.node) || ''), tx = String((e && e.text) || '');
    if (/block|reject|deny|stale|flatten/i.test(t)) return { text: 'FIREWALL BLOCK', col: 'dn' };
    if (/firewall|gate|pass/i.test(t) || /Firewall|Risk/.test(nd)) return { text: 'FIREWALL PASS', col: 'up' };
    if (/whale|sweep|fill|win|screen|scan/i.test(t) || /Screener|Bots/.test(nd) || /whale|sweep/i.test(tx)) return { text: 'WHALE SWEEP', col: 'up' };
    if (/gex|dom|depth/i.test(t) || /GEX|DOM/.test(nd) || /gex/i.test(tx)) return { text: 'GEX SHIFT', col: 'gold' };
    if (/ob|3d|chart|draw|wall/i.test(t) || /Chart/.test(nd)) return { text: '3D OB WALL', col: 'gold' };
    if (/^(ai|copilot)/i.test(t) || /Copilot|AI/.test(nd)) return { text: 'AI SIGNAL', col: 'gold' };
    if (/loss/i.test(t)) return { text: 'STOP HIT', col: 'dn' };
    return { text: 'TICK BATCH', col: 'gold' };
  };
  /* action heat: rows × cols, column = 1 s bucket; flash decays per frame */
  V.Heat = class {
    constructor(rows, cols) { this.rows = rows; this.cols = cols; this.v = new Float32Array(rows * cols); this.f = new Float32Array(rows * cols); this.head = 0; this.at = 0; }
    hit(r, now) { this.roll(now); const k = r * this.cols + this.head; this.v[k] += 1; this.f[k] = 1; }
    roll(now) { if (!this.at) this.at = now; while (now - this.at >= 1000) { this.at += 1000; this.head = (this.head + 1) % this.cols; for (let r = 0; r < this.rows; r++) { this.v[r * this.cols + this.head] = 0; this.f[r * this.cols + this.head] = 0; } } }
    decay(dt) { const d = Math.exp(-dt * 3.2); for (let i = 0; i < this.f.length; i++) this.f[i] *= d; }
    cell(r, age) { return this.v[r * this.cols + ((this.head - age + this.cols * 8) % this.cols)]; }
    flash(r, age) { return this.f[r * this.cols + ((this.head - age + this.cols * 8) % this.cols)]; }
  };
  /* throughput histogram */
  V.Thru = class {
    constructor(n) { this.n = n || 40; this.b = []; this.cur = { gold: 0, up: 0, dn: 0 }; this.at = 0; }
    add(col, now) { this.roll(now); this.cur[col === 'up' || col === 'dn' ? col : 'gold']++; }
    roll(now) { if (!this.at) this.at = now; while (now - this.at >= 1000) { this.at += 1000; this.b.push(this.cur); if (this.b.length > this.n) this.b.shift(); this.cur = { gold: 0, up: 0, dn: 0 }; } }
    max() { return Math.max(1, ...this.b.map((x) => x.gold + x.up + x.dn), this.cur.gold + this.cur.up + this.cur.dn); }
  };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V173;
