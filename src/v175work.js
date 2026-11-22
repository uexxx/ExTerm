/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.5 worker kernel: bundled after v175core.js into WORKER175_SRC; the page starts 8 dedicated workers from it, one per lane
   (Feed / L2 · 3D Spatial / Shock · On-Chain / Bellman-Ford · Options GEX / IV · Screener / Causality · Quant Lab / CPCV ·
   Bot Squad / Ledger · Copilot RAG / Recorder). Each worker runs only the ops allow-listed for its lane (V175.allowed: no eval,
   no arbitrary property access). Float64Array arguments arrive transferred (zero copy); typed arrays in the result are transferred back. */
let LANE = '';
const isTyped = (x) => x instanceof Float64Array || x instanceof Float32Array;
const plain = (a) => (a instanceof Float64Array ? V175.unpack(a) : isTyped(a) ? Array.from(a) : a); // Float64Array args are V175.pack()ed series: [n, ...values]
const transferables = (o, out, d) => { if (!o || typeof o !== 'object' || d > 3) return; if (ArrayBuffer.isView(o)) { if (out.indexOf(o.buffer) < 0) out.push(o.buffer); return; } if (Array.isArray(o) && o.length && typeof o[0] !== 'object') return; for (const k in o) transferables(o[k], out, d + 1); };
/* off-thread rendering (3D Spatial lane): canvases transferred with transferControlToOffscreen draw here from a per-frame state
   snapshot; large payloads (attractor xyz, Monte Carlo paths) arrive once in s.data and are cached per canvas */
const RC = {};
const render = (m) => {
  if (m.render === 'init') { if (LANE === 'spatial' && V175.R.KINDS.indexOf(m.kind) >= 0 && m.canvas) RC[m.id] = { cv: m.canvas, g: m.canvas.getContext('2d'), kind: m.kind, memo: {}, data: null, ms: 0, n: 0 }; return; }
  const r = RC[m.id]; if (!r) return; const s = m.s || {};
  if (s.data) r.data = s.data; s.data = r.data; s.off = true;
  if (r.cv.width !== s.W) r.cv.width = s.W; if (r.cv.height !== s.H) r.cv.height = s.H;
  const t0 = performance.now(); try { V175.R[r.kind](r.g, s, r.memo); } catch (e) { r.err = String(e && e.message); }
  r.ms = r.ms * 0.9 + (performance.now() - t0) * 0.1; if (++r.n % 120 === 0) self.postMessage({ rstat: { id: m.id, ms: r.ms, err: r.err || null } });
};
self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.render) { render(m); return; }
  if (m.init) { LANE = String(m.init); self.postMessage({ ready: LANE }); return; }
  if (m.ping) { self.postMessage({ id: m.id, ok: true, out: m.ping, ms: 0 }); return; }
  const t0 = performance.now();
  try {
    if (!V175.allowed(LANE, m.fn)) throw new Error('op "' + m.fn + '" is not allowed on lane ' + LANE);
    const out = V175.E[m.fn].apply(null, (m.args || []).map(plain)), tr = [];
    transferables(out, tr, 0);
    self.postMessage({ id: m.id, ok: true, out, ms: performance.now() - t0 }, tr);
  } catch (e) { self.postMessage({ id: m.id, ok: false, err: String((e && e.message) || e), ms: performance.now() - t0 }); }
};
