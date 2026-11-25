/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.2 HUD worker: bundled after v182core.js into WORKER182_SRC. The chart's HUD canvas (Shift+Drag ruler, outlier-guard rings,
   SYMBOL · TF watermark) is transferred here with transferControlToOffscreen and redrawn from a tiny per-frame state message, so the
   main thread spends one postMessage per frame on it. Only V182.hud runs here: no eval, no network. */
let HC = null, G = null, N = 0, MS = 0;
self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.init && m.canvas) { HC = m.canvas; G = HC.getContext('2d'); self.postMessage({ ready: true }); return; }
  if (!m.s || !G) return; const s = m.s;
  if (HC.width !== s.Wd) HC.width = s.Wd; if (HC.height !== s.Hd) HC.height = s.Hd;
  const t0 = performance.now(); try { V182.hud(G, s); } catch (e) { self.postMessage({ err: String((e && e.message) || e) }); return; }
  MS = MS * 0.9 + (performance.now() - t0) * 0.1; if (++N % 60 === 0) self.postMessage({ stat: { n: N, ms: MS, seq: s.seq } });
};
