/* ExTerm order-flow tools: volume profile (with point of control and value area), estimated buy/sell delta,
   and estimated liquidation levels. Candle-based estimates, clearly labelled as such: exchanges don't publish
   every position, so liquidation levels are modelled from where volume traded and common leverage levels. */
const OF = (() => {
  const O = {};
  const fin = Number.isFinite;

  /* ---- pure computations (unit-tested) ---- */
  // volume profile over candles [start, end): each candle's volume is spread evenly across its high-low range
  O.profile = (D, start = 0, end = D.length, nb = 40) => {
    start = Math.max(0, start); end = Math.min(D.length, end);
    let lo = Infinity, hi = -Infinity;
    for (let i = start; i < end; i++) { if (D[i].l < lo) lo = D[i].l; if (D[i].h > hi) hi = D[i].h; }
    if (!(hi > lo) || end - start < 2) return null;
    const step = (hi - lo) / nb, bins = Array.from({ length: nb }, (_, k) => ({ lo: lo + k * step, hi: lo + (k + 1) * step, v: 0, buy: 0, sell: 0 }));
    for (let i = start; i < end; i++) {
      const k = D[i], v = k.v || 0; if (!(v > 0)) continue;
      const a = Math.max(0, Math.floor((k.l - lo) / step)), b = Math.min(nb - 1, Math.floor((k.h - lo) / step)), share = v / (b - a + 1), up = k.c >= k.o;
      for (let j = a; j <= b; j++) { bins[j].v += share; if (up) bins[j].buy += share; else bins[j].sell += share; }
    }
    let poc = 0; for (let j = 1; j < nb; j++) if (bins[j].v > bins[poc].v) poc = j;
    const total = bins.reduce((s, x) => s + x.v, 0); let a = poc, b = poc, acc = bins[poc].v;
    while (acc < total * 0.7 && (a > 0 || b < nb - 1)) { const dn = a > 0 ? bins[a - 1].v : -1, upv = b < nb - 1 ? bins[b + 1].v : -1; if (upv >= dn) { b++; acc += bins[b].v; } else { a--; acc += bins[a].v; } }
    return { bins, poc, pocPrice: (bins[poc].lo + bins[poc].hi) / 2, vah: bins[b].hi, val: bins[a].lo, total, lo, hi };
  };
  // estimated delta: where the close sits in the bar's range says who won the bar
  O.delta = (D) => D.map((k) => { const r = k.h - k.l; if (!(r > 0) || !(k.v > 0)) return 0; return k.v * (((k.c - k.l) - (k.h - k.c)) / r); });
  O.cvd = (D) => { let s = 0; return O.delta(D).map((d) => (s += d)); };
  // estimated liquidation clusters near the current price
  O.LEV = [10, 25, 50, 100];
  O.liqLevels = (D, price, look = 300, nb = 60, band = 0.25) => {
    const n = D.length; if (n < 20 || !(price > 0)) return null;
    const lo = price * (1 - band), hi = price * (1 + band), step = (hi - lo) / nb;
    const longs = new Array(nb).fill(0), shorts = new Array(nb).fill(0);
    const add = (arr, p, w) => { const j = Math.floor((p - lo) / step); if (j >= 0 && j < nb) arr[j] += w; };
    for (let i = Math.max(0, n - look); i < n; i++) {
      const k = D[i], p = (k.h + k.l + k.c) / 3, w = (k.v || 0) * (0.5 + (i - (n - look)) / look); // recent volume weighs more
      for (const L of O.LEV) { add(longs, p * (1 - 1 / L), w / L * 10); add(shorts, p * (1 + 1 / L), w / L * 10); }
    }
    // a level is "used up" once price traded through it after it formed: approximate by clearing bins price already crossed recently
    const recentLo = Math.min(...D.slice(-20).map((k) => k.l)), recentHi = Math.max(...D.slice(-20).map((k) => k.h));
    for (let j = 0; j < nb; j++) { const mid = lo + (j + 0.5) * step; if (mid >= recentLo && mid <= recentHi) { longs[j] *= 0.15; shorts[j] *= 0.15; } }
    const mx = Math.max(1e-12, ...longs, ...shorts);
    return { lo, hi, step, longs: longs.map((v) => v / mx), shorts: shorts.map((v) => v / mx) };
  };

  /* ---- chart overlays ---- */
  const drawProfile = (g, L, ch) => {
    if (!ch.o.vp) return; const D = L.D, P = O.profile(D, L.start, L.end, 48); if (!P) return;
    const right = L.W - L.Rm, maxW = Math.min(170, L.plotW * 0.26), mx = Math.max(...P.bins.map((b) => b.v)) || 1, col = L.col;
    for (let j = 0; j < P.bins.length; j++) {
      const b = P.bins[j], y1 = L.py(b.hi), y2 = L.py(b.lo), h = Math.max(1, y2 - y1 - 1), w = (b.v / mx) * maxW, wb = b.v ? (b.buy / b.v) * w : 0;
      const inVA = b.lo >= P.val - 1e-12 && b.hi <= P.vah + 1e-12, a = inVA ? '55' : '26';
      g.fillStyle = col.up + a; g.fillRect(right - w, y1, wb, h); g.fillStyle = col.dn + a; g.fillRect(right - w + wb, y1, w - wb, h);
    }
    const yp = Math.round(L.py(P.pocPrice)) + 0.5; g.strokeStyle = col.amb; g.lineWidth = 1.2; g.setLineDash([6, 3]); g.beginPath(); g.moveTo(L.Lm, yp); g.lineTo(right, yp); g.stroke(); g.setLineDash([]);
    g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = col.amb; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('POC ' + NT.fmtPrice(P.pocPrice), L.Lm + 4, yp - 2);
    g.fillStyle = col.txt; for (const [lbl, p] of [['VAH', P.vah], ['VAL', P.val]]) { const y = L.py(p); if (y > L.y0 && y < L.y0 + L.mainH) g.fillText(lbl, right - maxW - 30, y); }
  };
  const drawDelta = (g, L, ch) => {
    if (!ch.o.delta) return; const D = L.D, d = O.delta(D), col = L.col, h = L.mainH * 0.11, base = L.y0 + L.mainH - (ch.o.vol ? L.volH + 6 : 4);
    let mx = 0; for (let i = L.start; i < L.end; i++) mx = Math.max(mx, Math.abs(d[i]));
    if (!mx) return; const mid = base - h / 2;
    g.strokeStyle = col.grid; g.beginPath(); g.moveTo(L.Lm, mid + 0.5); g.lineTo(L.W - L.Rm, mid + 0.5); g.stroke();
    for (let i = L.start; i < L.end; i++) { const v = d[i] / mx * (h / 2); g.fillStyle = (v >= 0 ? col.up : col.dn) + 'aa'; g.fillRect(L.kx(i) - L.bw * 0.3, v >= 0 ? mid - v : mid, Math.max(1, L.bw * 0.6), Math.max(1, Math.abs(v))); }
    g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = col.txt; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('Δ delta (est.)', L.Lm + 4, mid - h / 2 + 10);
  };
  const drawLiq = (g, L, ch) => {
    if (!ch.o.liq) return; const D = L.D, last = D[D.length - 1]; if (!last) return;
    const Q = O.liqLevels(D, last.c); if (!Q) return; const col = L.col, left = L.Lm, right = L.W - L.Rm;
    for (let j = 0; j < Q.longs.length; j++) {
      const y1 = L.py(Q.lo + (j + 1) * Q.step), y2 = L.py(Q.lo + j * Q.step); if (y2 < L.y0 || y1 > L.y0 + L.mainH) continue;
      const lv = Q.longs[j], sv = Q.shorts[j], v = Math.max(lv, sv); if (v < 0.42) continue;
      g.fillStyle = (sv >= lv ? '#f59e0b' : '#CBD5E1') + Math.round(10 + Math.pow((v - 0.42) / 0.58, 1.6) * 80).toString(16).padStart(2, '0');
      g.fillRect(left, y1, right - left, Math.max(1, y2 - y1));
    }
    g.font = '10px ui-monospace, Menlo, monospace'; g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillStyle = '#f59e0b'; g.fillText('■ short liquidations (est.)', right - 6, L.y0 + 4); g.fillStyle = '#CBD5E1'; g.fillText('■ long liquidations (est.)', right - 6, L.y0 + 16);
  };
  O.attach = (ch) => { if (!ch || ch._of) return; ch._of = true; ch.overlays.unshift(drawLiq); ch.overlays.push(drawProfile, drawDelta); };
  return O;
})();
if (typeof module === 'object' && module.exports) module.exports = OF;
