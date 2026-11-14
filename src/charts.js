/* ExTerm charts — dependency-free canvas candlestick chart, line charts, heat colours */
const cssv = (n, d) => (getComputedStyle(document.body || document.documentElement).getPropertyValue(n).trim() || d); // v15.1: themes and market modes set their tokens on <body>

function niceTicks(min, max, target) {
  const range = max - min || 1, rough = range / target, mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(12));
  return out;
}
const pad2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// chart time zone (v13): null = this computer's time, otherwise an IANA zone such as 'UTC' or 'America/New_York'
const TZ = { zone: null, fmt: null, cache: new Map() };
TZ.set = (z) => { TZ.zone = z && z !== 'local' ? z : null; TZ.cache.clear(); try { TZ.fmt = TZ.zone ? new Intl.DateTimeFormat('en-US', { timeZone: TZ.zone, hour12: false, month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }) : null; } catch (e) { TZ.zone = null; TZ.fmt = null; } };
TZ.parts = (sec) => {
  if (!TZ.fmt) { const d = new Date(sec * 1000); return { mo: d.getMonth(), d: d.getDate(), h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() }; }
  const k = Math.floor(sec); let v = TZ.cache.get(k); if (v) return v;
  const o = {}; for (const p of TZ.fmt.formatToParts(new Date(k * 1000))) o[p.type] = +p.value;
  v = { mo: o.month - 1, d: o.day, h: o.hour % 24, m: o.minute, s: o.second }; if (TZ.cache.size > 4000) TZ.cache.clear(); TZ.cache.set(k, v); return v;
};
function fmtTime(sec, tfSec, full) {
  const d = TZ.parts(sec);
  if (full) return `${MON[d.mo]} ${d.d} ${pad2(d.h)}:${pad2(d.m)}${tfSec < 60 ? ":" + pad2(d.s) : ""}`;
  return tfSec >= 86400 ? `${MON[d.mo]} ${d.d}` : tfSec < 60 ? `${pad2(d.h)}:${pad2(d.m)}:${pad2(d.s)}` : `${pad2(d.h)}:${pad2(d.m)}`;
}

class CandleChart {
  constructor(host) {
    this.host = host;
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:crosshair';
    host.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.data = []; this.tfSec = 900; this.markers = []; this.fc = null; this.msg = 'Loading…';
    this.o = { ema: true, sma: false, bb: false, vol: true, rsi: false, macd: false, trades: true, fc: false };
    this.tool = null; this.drawings = []; this.pend = null; this.onDraw = null; this.overlays = []; this.ext = null; this.onHover = null;
    this.view = { bars: 110, off: 0 }; this.mouse = null; this.cache = null; this.raf = 0; this.drag = null; this.W = 0; this.H = 0;
    this.bind();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.invalidate()).observe(host);
  }
  bind() {
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.15 : 1 / 1.15, n = this.data.length;
      this.view.bars = Math.round(NT.clamp(this.view.bars * k, 20, Math.max(60, Math.min(1500, n))));
      this.invalidate();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (this.tool && this.L && this.L.hi != null) { const r = cv.getBoundingClientRect(), pt = this.toTP(e.clientX - r.left, e.clientY - r.top); if (!pt) return;
        if (this.tool === 'h') { this.addDrawing({ type: 'h', p: pt.p }); }
        else if (this.tool === 'txt') { if (this.onText) this.onText(pt, e.clientX, e.clientY); }
        else if (!this.pend) this.pend = pt;
        else if (this.tool === 'ch' && !this.pend2) this.pend2 = pt; // channel: 2 points for the line, a 3rd for the width
        else if (this.tool === 'ch') { const a = this.pend, b = this.pend2, at = b.t === a.t ? a.p : a.p + (b.p - a.p) * ((pt.t - a.t) / (b.t - a.t)); this.addDrawing({ type: 'ch', t1: a.t, p1: a.p, t2: b.t, p2: b.p, off: pt.p - at }); this.pend = null; this.pend2 = null; }
        else { this.addDrawing({ type: this.tool, t1: this.pend.t, p1: this.pend.p, t2: pt.t, p2: pt.p }); this.pend = null; }
        this.invalidate(); return; }
      this.drag = { x: e.clientX, off: this.view.off }; try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(); this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.onHover && this.L && this.L.D && this.L.D.length) { const L = this.L, i = Math.round((this.mouse.x - L.Lm) / L.bw - 0.5) + (L.end - L.bars); this.onHover(i >= 0 && i < L.D.length ? L.D[i].t : null, this.mouse); }
      if (this.drag && this.L) {
        const shift = Math.round((e.clientX - this.drag.x) / this.L.bw);
        this.view.off = NT.clamp(this.drag.off + shift, 0, Math.max(0, this.data.length - 10));
      }
      this.invalidate(!!this.drag || !!this.pend);
    });
    cv.addEventListener('pointerup', () => { this.drag = null; });
    cv.addEventListener('pointerleave', () => { this.mouse = null; this.drag = null; if (this.onHover) this.onHover(null); this.invalidate(!!this.pend); });
    cv.addEventListener('dblclick', () => { this.view = { bars: 110, off: 0 }; this.invalidate(); });
  }
  set(data, tfSec, markers, fc, msg) { this.data = data || []; this.tfSec = tfSec; this.markers = markers || []; this.fc = fc || null; this.msg = msg || (this.data.length ? '' : 'Loading…'); this.cache = null; this.invalidate(); }
  toTP(x, y) { const L = this.L; if (!L || !L.D || !L.D.length || y < L.y0 || y > L.y0 + L.mainH) return null; let i = Math.round((x - L.Lm) / L.bw - 0.5) + (L.end - L.bars); const n = L.D.length, last = L.D[n - 1].t, step = n > 1 ? L.D[n - 1].t - L.D[n - 2].t : 60; const t = i < n ? L.D[Math.max(0, i)].t : last + (i - n + 1) * step; return { t, p: L.hi - ((y - L.y0) / (L.mainH - L.volH - 4)) * (L.hi - L.lo) }; }
  tToX(t) { const L = this.L, D = L.D, n = D.length; let lo = 0, hi = n - 1; if (t >= D[n - 1].t) { const step = n > 1 ? D[n - 1].t - D[n - 2].t : 60; return L.kx(n - 1 + (t - D[n - 1].t) / step); } while (lo < hi) { const m = (lo + hi) >> 1; if (D[m].t < t) lo = m + 1; else hi = m; } return L.kx(lo); }
  addDrawing(d) { this.drawings.push(d); this.redo = []; if (this.onDraw) this.onDraw(this.drawings); }
  undo() { if (this.pend) { this.pend = null; this.pend2 = null; this.invalidate(); return true; } const d = this.drawings.pop(); if (!d) return false; (this.redo = this.redo || []).push(d); if (this.onDraw) this.onDraw(this.drawings); this.invalidate(); return true; }
  redoOne() { const d = (this.redo || []).pop(); if (!d) return false; this.drawings.push(d); if (this.onDraw) this.onDraw(this.drawings); this.invalidate(); return true; }
  // full=false: only the cursor layer changed (crosshair, legend), so the cached static layer is reused
  invalidate(full = true) {
    if (full) this.dirty = true;
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = 0;
      const gap = typeof FPSGov !== 'undefined' ? FPSGov.gap : 0;
      if (gap && now - (this.lastDraw || 0) < gap - 1) { this.invalidate(false); return; } // governor: skip this vsync
      this.lastDraw = now; const t0 = performance.now();
      try { this.draw(); } catch (e) { console.error('chart', e); }
      if (typeof FPSGov !== 'undefined') FPSGov.cost(performance.now() - t0);
    });
  }
  indicators() {
    const d = this.data, o0 = this.o, key = d.length + ':' + (d.length ? d[d.length - 1].c : 0) + ':' + (d.length ? d[0].t : 0) + ':' + ['vwap', 'st', 'kc', 'ichi', 'psar', 'stochrsi', 'adx', 'atr', 'obv', 'type'].map((k) => o0[k]).join(',') + ':' + JSON.stringify(o0.extra || []);
    if (this.cache && this.cache.key === key) return this.cache;
    const cl = d.map((k) => k.c), c = { key };
    c.ema20 = NT.ind.ema(cl, 20); c.ema50 = NT.ind.ema(cl, 50); c.sma200 = NT.ind.sma(cl, 200);
    c.bb = NT.ind.bb(cl, 20, 2); c.rsi = NT.ind.rsi(cl, 14); c.macd = NT.ind.macd(cl);
    const o = this.o, I = NT.ind;
    if (o.vwap && I.rvwap) c.vwap = I.rvwap(d, Math.min(96, Math.max(10, Math.floor(d.length / 6)))).vw;
    if (o.st && I.supertrend) c.st = I.supertrend(d, 10, 3);
    if (o.kc && I.keltner) c.kc = I.keltner(d, 20, 2, 10);
    if (o.ichi && I.ichimoku) c.ichi = I.ichimoku(d);
    if (o.psar && I.psar) c.psar = I.psar(d);
    if (o.stochrsi && I.stochRsi) c.srsi = I.stochRsi(cl);
    if (o.adx && I.adx) c.adx = I.adx(d, 14);
    if (o.atr) c.atr = I.atr(d, 14);
    if (o.obv && I.obv) c.obv = I.obv(d);
    if (o.type === 'ha' && I.heikin) c.ha = I.heikin(d);
    c.extra = []; if (typeof IND !== 'undefined') for (const e of o.extra || []) { const def = IND.byId[e.id]; if (!def) continue; try { c.extra.push({ def, e, out: def.f(d, Object.assign({}, def.p, e.p || {})) }); } catch (err) { console.warn('indicator', e.id, err); } }
    this.cache = c; return c;
  }
  draw() {
    const cv = this.cv, g = this.g, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); this.dirty = true; }
    // dynamic layer only: blit the cached static layer, then draw crosshair + legend on top
    if (!this.dirty && !this.pend && this.S && this.sc && this.sc.width === cv.width && this.sc.height === cv.height) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this.sc, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); this.drawDyn(g, this.S); return;
    }
    this.dirty = false; this.S = null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); this.W = W; this.H = H;
    const col = { up: cssv('--up', '#26c281'), dn: cssv('--dn', '#ef5350'), grid: cssv('--grid', '#1b2230'), txt: cssv('--mut', '#7d879b'), acc: cssv('--acc', '#5b8cff'), amb: cssv('--amber', '#f5a524'), fg: cssv('--text', '#d6dbe6'), pan: cssv('--panel-solid', '#111624') };
    const D = this.data, n = D.length;
    if (!n) { g.fillStyle = col.txt; g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText(this.msg || 'No data', W / 2, H / 2); return; }
    const o = this.o, ind = this.indicators();
    g.font = '11px ui-monospace, Menlo, Consolas, monospace';
    let mxp = 0; for (let i = Math.max(0, n - 400); i < n; i++) if (D[i].h > mxp) mxp = D[i].h;
    const subs0 = ['rsi', 'macd', 'stochrsi', 'adx', 'atr', 'obv'].filter((k) => this.o[k]).length + (this.o.extra || []).filter((e) => typeof IND !== 'undefined' && IND.byId[e.id] && IND.byId[e.id].pane === 'sub').length;
    const Lm = 6, Rm = Math.max(62, Math.ceil(g.measureText(NT.fmtPrice(mxp * 1.1)).width) + 16), Tm = 28, Bm = 22, subs = subs0;
    const subH = subs ? Math.min(100, (H - Tm - Bm) * (subs > 2 ? 0.14 : 0.19)) : 0, mainH = H - Tm - Bm - subH * subs - subs * 6;
    const plotW = W - Lm - Rm, fcN = o.fc && this.fc && this.view.off === 0 && !(this.tfSec > 0 && this.tfSec <= 15) ? this.fc.length : 0;
    const bars = Math.min(this.view.bars, Math.max(20, n)), slots = bars + fcN, bw = plotW / slots;
    const end = n - this.view.off, start = Math.max(0, end - bars);
    const kx = (i) => Lm + (i - (end - bars) + 0.5) * bw;
    this.L = { bw, kx, end, start, Lm, Rm, Tm, mainH, plotW };
    // price range
    let lo = Infinity, hi = -Infinity;
    const subMin = this.tfSec > 0 && this.tfSec <= 15; // v15.1: 1s / 5s / 15s scale strictly to the visible candles, so real tick ranges fill the pane
    for (let i = start; i < end; i++) {
      lo = Math.min(lo, D[i].l); hi = Math.max(hi, D[i].h);
      if (subMin) continue;
      if (o.bb && isFinite(ind.bb.up[i])) { hi = Math.max(hi, ind.bb.up[i]); lo = Math.min(lo, ind.bb.lo[i]); }
      if (o.kc && ind.kc && isFinite(ind.kc.up[i])) { hi = Math.max(hi, ind.kc.up[i]); lo = Math.min(lo, ind.kc.lo[i]); }
    }
    if (fcN) for (const f of this.fc) { hi = Math.max(hi, f.hi); lo = Math.min(lo, f.lo); }
    const padv = (hi - lo) * (subMin ? 0.04 : 0.07) || hi * (subMin ? 0.0004 : 0.01); lo -= padv; hi += padv;
    const volH = o.vol ? mainH * 0.16 : 0, y0 = Tm, y1 = Tm + mainH - volH * 0.0;
    const py = (p) => y0 + (hi - p) / (hi - lo) * (mainH - volH - 4);
    Object.assign(this.L, { hi, lo, y0, volH, bars, D });
    // grid + price axis
    g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 1;
    for (const t of niceTicks(lo, hi, Math.max(3, Math.floor(mainH / 55)))) {
      const y = Math.round(py(t)) + 0.5; if (y < y0 || y > y0 + mainH) continue;
      g.strokeStyle = col.grid; g.beginPath(); g.moveTo(Lm, y); g.lineTo(W - Rm, y); g.stroke();
      g.fillStyle = col.txt; g.fillText(NT.fmtPrice(t), W - Rm + 6, y);
    }
    // time axis + vertical grid
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const every = Math.max(1, Math.round(110 / bw));
    for (let i = start; i < end; i++) {
      if ((end - 1 - i) % every !== 0) continue;
      const x = Math.round(kx(i)) + 0.5;
      g.strokeStyle = col.grid; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, H - Bm); g.stroke();
      g.fillStyle = col.txt; g.fillText(fmtTime(D[i].t, this.tfSec), x, H - 7);
    }
    // volume
    if (o.vol) {
      let vmax = 0; for (let i = start; i < end; i++) vmax = Math.max(vmax, D[i].v);
      for (let i = start; i < end; i++) {
        const k = D[i], h = vmax ? (k.v / vmax) * volH * 0.95 : 0;
        g.fillStyle = (k.c >= k.o ? col.up : col.dn) + '44'; g.fillRect(kx(i) - bw * 0.35, y0 + mainH - h, Math.max(1, bw * 0.7), h);
      }
    }
    // bollinger fill
    const line = (arr, color, w) => {
      g.strokeStyle = color; g.lineWidth = w || 1.2; g.beginPath(); let on = false;
      for (let i = start; i < end; i++) { const v = arr[i]; if (!isFinite(v)) { on = false; continue; } const x = kx(i), y = py(v); if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y); }
      g.stroke();
    };
    if (o.bb) {
      g.fillStyle = col.acc + '14'; g.beginPath(); let started = false;
      for (let i = start; i < end; i++) if (isFinite(ind.bb.up[i])) { const x = kx(i), y = py(ind.bb.up[i]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
      for (let i = end - 1; i >= start; i--) if (isFinite(ind.bb.lo[i])) g.lineTo(kx(i), py(ind.bb.lo[i]));
      g.closePath(); g.fill(); line(ind.bb.up, col.acc + '99', 1); line(ind.bb.lo, col.acc + '99', 1); line(ind.bb.mid, col.acc + '66', 1);
    }
    // ichimoku cloud (behind price)
    if (o.ichi && ind.ichi) {
      const A = ind.ichi.spanA, B = ind.ichi.spanB;
      for (let i = Math.max(start, 1); i < end; i++) { if (!isFinite(A[i]) || !isFinite(B[i]) || !isFinite(A[i - 1])) continue; g.fillStyle = (A[i] >= B[i] ? col.up : col.dn) + '1f'; g.beginPath(); g.moveTo(kx(i - 1), py(A[i - 1])); g.lineTo(kx(i), py(A[i])); g.lineTo(kx(i), py(B[i])); g.lineTo(kx(i - 1), py(B[i - 1])); g.closePath(); g.fill(); }
      line(ind.ichi.ten, '#38bdf8', 1); line(ind.ichi.kij, '#f472b6', 1);
    }
    if (o.kc && ind.kc) { line(ind.kc.up, '#14b8a6aa', 1); line(ind.kc.lo, '#14b8a6aa', 1); line(ind.kc.mid, '#14b8a666', 1); }
    // price
    const T = o.type || 'candles';
    if (T === 'line' || T === 'area') {
      g.beginPath(); for (let i = start; i < end; i++) { const x = kx(i), y = py(D[i].c); i === start ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = col.acc; g.lineWidth = 1.8; g.stroke();
      if (T === 'area') { g.lineTo(kx(end - 1), y0 + mainH - volH); g.lineTo(kx(start), y0 + mainH - volH); g.closePath(); const gr = g.createLinearGradient(0, y0, 0, y0 + mainH); gr.addColorStop(0, col.acc + '55'); gr.addColorStop(1, col.acc + '00'); g.fillStyle = gr; g.fill(); }
    }
    for (let i = start; i < end && (T === 'candles' || T === 'ha'); i++) {
      const k = T === 'ha' && ind.ha ? ind.ha[i] : D[i], x = kx(i), up = k.c >= k.o, c = up ? col.up : col.dn;
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, py(k.h)); g.lineTo(Math.round(x) + 0.5, py(k.l)); g.stroke();
      const br = NT.bodyRect(py(k.o), py(k.c), x, bw);
      g.fillRect(br.x, br.y, br.w, br.h);
    }
    if (o.ema) { line(ind.ema20, col.amb, 1.3); line(ind.ema50, '#c678dd', 1.3); }
    // library overlays
    const PAL = ['#38bdf8', '#f472b6', '#f59e0b', '#a78bfa', '#22c55e', '#fb7185', '#14b8a6', '#eab308', '#60a5fa', '#c084fc', '#f97316', '#4ade80'];
    if (ind.extra && ind.extra.length) { g.save(); g.beginPath(); g.rect(Lm, y0, plotW, mainH - volH); g.clip(); let ci = 0;
      for (const x of ind.extra) { if (x.def.pane !== 'over') continue; for (const ln of x.out) { const cc = PAL[ci++ % PAL.length]; if (ln.dots) { g.fillStyle = cc; for (let i = start; i < end; i++) { const v = ln.v[i]; if (Number.isFinite(v)) { g.beginPath(); g.arc(kx(i), py(v), Math.max(1.5, Math.min(3, bw * 0.2)), 0, 7); g.fill(); } } } else line(ln.v, cc, 1.25); } }
      g.restore(); }
    if (o.vwap && ind.vwap) line(ind.vwap, '#fbbf24', 1.6);
    if (o.st && ind.st) { for (let i = Math.max(start, 1); i < end; i++) { const a = ind.st.line[i - 1], b = ind.st.line[i]; if (!isFinite(a) || !isFinite(b) || ind.st.up[i] !== ind.st.up[i - 1]) continue; g.strokeStyle = ind.st.up[i] ? col.up : col.dn; g.lineWidth = 2; g.beginPath(); g.moveTo(kx(i - 1), py(a)); g.lineTo(kx(i), py(b)); g.stroke(); } }
    if (o.psar && ind.psar) { for (let i = start; i < end; i++) { const v = ind.psar.sar[i]; if (!isFinite(v)) continue; g.fillStyle = ind.psar.up[i] ? col.up : col.dn; g.beginPath(); g.arc(kx(i), py(v), Math.max(1.2, Math.min(2.5, bw * 0.18)), 0, 7); g.fill(); } }
    if (o.sma) line(ind.sma200, '#56b6c2', 1.3);
    // forecast
    if (fcN) {
      const last = D[n - 1], x0 = kx(n - 1);
      g.fillStyle = col.acc + '1c'; g.beginPath(); g.moveTo(x0, py(last.c));
      this.fc.forEach((f, j) => g.lineTo(x0 + (j + 1) * bw, py(f.hi)));
      for (let j = this.fc.length - 1; j >= 0; j--) g.lineTo(x0 + (j + 1) * bw, py(this.fc[j].lo));
      g.closePath(); g.fill();
      g.setLineDash([5, 4]); g.strokeStyle = col.acc; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, py(last.c));
      this.fc.forEach((f, j) => g.lineTo(x0 + (j + 1) * bw, py(f.mean))); g.stroke(); g.setLineDash([]);
    }
    // trade markers
    if (o.trades && this.markers.length) {
      const tf = this.tfSec;
      for (const m of this.markers) {
        const idx = findIdx(D, Math.floor(m.t / tf) * tf); if (idx < start || idx >= end) continue;
        const x = kx(idx), y = py(m.price), s = Math.max(4, Math.min(8, bw * 0.6));
        g.fillStyle = m.side === 'buy' ? col.up : col.dn; g.strokeStyle = col.pan; g.lineWidth = 1.5; g.beginPath();
        if (m.side === 'buy') { g.moveTo(x, y); g.lineTo(x - s, y + s * 1.6); g.lineTo(x + s, y + s * 1.6); } else { g.moveTo(x, y); g.lineTo(x - s, y - s * 1.6); g.lineTo(x + s, y - s * 1.6); }
        g.closePath(); g.stroke(); g.fill();
      }
    }
    // last price
    const lastC = D[n - 1], lp = lastC.c, ly = py(lp);
    if (this.view.off === 0 && ly >= y0 && ly <= y0 + mainH) {
      const c = lastC.c >= lastC.o ? col.up : col.dn;
      g.setLineDash([2, 3]); g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(Lm, Math.round(ly) + 0.5); g.lineTo(W - Rm, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]);
      g.fillStyle = c; g.fillRect(W - Rm, ly - 9, Rm - 2, 18); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(NT.fmtPrice(lp), W - Rm + 5, ly);
    }
    // drawings (trend lines, horizontal levels, fib retracements)
    if (this.drawings.length || this.pend) {
      g.save(); g.beginPath(); g.rect(Lm, y0, plotW, mainH - volH); g.clip();
      const prev = this.pend && this.mouse ? this.toTP(this.mouse.x, this.mouse.y) : null;
      const gh = !this.pend || !prev ? [] : this.tool === 'ch' && this.pend2 ? [{ type: 'ch', t1: this.pend.t, p1: this.pend.p, t2: this.pend2.t, p2: this.pend2.p, off: prev.p - (this.pend2.t === this.pend.t ? this.pend.p : this.pend.p + (this.pend2.p - this.pend.p) * ((prev.t - this.pend.t) / (this.pend2.t - this.pend.t))), ghost: 1 }] : [{ type: this.tool === 'ch' ? 't' : this.tool, t1: this.pend.t, p1: this.pend.p, t2: prev.t, p2: prev.p, ghost: 1 }];
      const list = this.drawings.concat(gh);
      for (const d of list) {
        g.globalAlpha = d.ghost ? 0.6 : 1; g.lineWidth = 1.5;
        if (d.type === 'h') { const y = py(d.p); g.strokeStyle = col.amb; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(Lm, y); g.lineTo(W - Rm, y); g.stroke(); g.setLineDash([]); g.restore(); g.save(); g.fillStyle = col.amb; g.fillRect(W - Rm, y - 9, Rm - 2, 18); g.fillStyle = '#0b0e14'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(NT.fmtPrice(d.p), W - Rm + 5, y); g.beginPath(); g.rect(Lm, y0, plotW, mainH - volH); g.clip(); continue; }
        if (d.type === 'txt') { if (!d.text) continue; const x = this.tToX(d.t), y = py(d.p); g.font = '600 12px Inter, system-ui, sans-serif'; const tw = g.measureText(d.text).width + 12; g.fillStyle = col.pan + 'ee'; g.fillRect(x, y - 10, tw, 20); g.strokeStyle = col.amb; g.strokeRect(x + 0.5, y - 9.5, tw, 20); g.fillStyle = col.fg; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(d.text, x + 6, y); continue; }
        const x1 = this.tToX(d.t1), x2 = this.tToX(d.t2), y1 = py(d.p1), y2 = py(d.p2);
        if (d.type === 'rect') { const xa = Math.min(x1, x2), ya = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1); g.fillStyle = col.acc + '22'; g.fillRect(xa, ya, w, h); g.strokeStyle = col.acc + 'aa'; g.strokeRect(xa + 0.5, ya + 0.5, w, h); g.fillStyle = col.txt; g.font = '10px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(NT.fmtPct((Math.max(d.p1, d.p2) / Math.min(d.p1, d.p2) - 1) * 100, 2), xa + 4, ya - 2); }
        if (d.type === 'ch') { const xb = W - Rm, slope = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0, ext = (x) => y1 + slope * (x - x1), dy = py(d.p1 + d.off) - y1; g.strokeStyle = '#38bdf8'; for (const o of [0, dy]) { g.beginPath(); g.moveTo(x1, y1 + o); g.lineTo(xb, ext(xb) + o); g.stroke(); } g.fillStyle = 'rgba(56,189,248,.08)'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(xb, ext(xb)); g.lineTo(xb, ext(xb) + dy); g.lineTo(x1, y1 + dy); g.closePath(); g.fill(); g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x1, y1 + dy / 2); g.lineTo(xb, ext(xb) + dy / 2); g.stroke(); g.setLineDash([]); }
        if (d.type === 'ruler') { const dp = d.p2 - d.p1, pc = (dp / d.p1) * 100, dt = Math.abs(d.t2 - d.t1), bars = Math.round(dt / (this.tfSec || 60)), up = dp >= 0, c0 = up ? col.up : col.dn; g.fillStyle = c0 + '22'; g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.strokeStyle = c0; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          const tt = `${up ? '+' : ''}${NT.fmtPrice(dp)} (${NT.fmtPct(pc, 2)}) · ${bars} bars · ${dt >= 86400 ? (dt / 86400).toFixed(1) + 'd' : dt >= 3600 ? (dt / 3600).toFixed(1) + 'h' : Math.round(dt / 60) + 'm'}`; g.font = '600 11px Inter, system-ui, sans-serif'; const tw = g.measureText(tt).width + 12, bx = Math.min(W - Rm - tw, (x1 + x2) / 2 - tw / 2), by = Math.min(y1, y2) - 24; g.fillStyle = c0; g.fillRect(bx, by, tw, 18); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(tt, bx + 6, by + 9); }
        if (d.type === 'long' || d.type === 'short') { const L0 = d.type === 'long', risk = Math.abs(d.p1 - d.p2), tgt = L0 ? d.p1 + risk * (d.rr || 2) : d.p1 - risk * (d.rr || 2), xa = x1, xb = Math.max(x2, x1 + 90), ye = y1, ys = y2, yt = py(tgt);
          g.fillStyle = col.up + '26'; g.fillRect(xa, Math.min(ye, yt), xb - xa, Math.abs(yt - ye)); g.fillStyle = col.dn + '26'; g.fillRect(xa, Math.min(ye, ys), xb - xa, Math.abs(ys - ye)); g.strokeStyle = col.fg; g.beginPath(); g.moveTo(xa, ye); g.lineTo(xb, ye); g.stroke();
          g.font = '600 10px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = col.up; g.fillText(`Target ${NT.fmtPrice(tgt)} (${NT.fmtPct((tgt / d.p1 - 1) * 100, 2)}) · ${d.rr || 2}R`, xa + 4, (ye + yt) / 2); g.fillStyle = col.dn; g.fillText(`Stop ${NT.fmtPrice(d.p2)} (${NT.fmtPct((d.p2 / d.p1 - 1) * 100, 2)})`, xa + 4, (ye + ys) / 2); g.fillStyle = col.txt; g.fillText(`${L0 ? 'Long' : 'Short'} @ ${NT.fmtPrice(d.p1)}`, xa + 4, ye - 8); }
        if (d.type === 't') { g.strokeStyle = col.acc; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); for (const [x, y] of [[x1, y1], [x2, y2]]) { g.fillStyle = col.acc; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }
        if (d.type === 'fib') { const lv = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], cs = ['#94a3b8', '#f472b6', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#94a3b8']; const xa = Math.min(x1, x2), xb = Math.max(W - Rm, Math.max(x1, x2));
          lv.forEach((k, j) => { const p = d.p2 + (d.p1 - d.p2) * k, y = py(p); g.strokeStyle = cs[j]; g.globalAlpha = d.ghost ? 0.5 : 0.9; g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke(); g.fillStyle = cs[j]; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${k} · ${NT.fmtPrice(p)}`, xa + 4, y - 2); if (j < lv.length - 1) { const yn = py(d.p2 + (d.p1 - d.p2) * lv[j + 1]); g.globalAlpha = 0.06; g.fillRect(xa, Math.min(y, yn), xb - xa, Math.abs(yn - y)); } }); }
      }
      g.globalAlpha = 1; g.restore();
    }
    // sub panes
    let sy = Tm + mainH + 6;
    const pane = (title, fn, fixed) => {
      g.fillStyle = col.pan + '66'; g.fillRect(Lm, sy, plotW, subH);
      g.strokeStyle = col.grid; g.strokeRect(Lm + 0.5, sy + 0.5, plotW - 1, subH - 1);
      g.fillStyle = col.txt; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(title, Lm + 6, sy + 4);
      fn(sy, subH); sy += subH + 6;
    };
    if (o.rsi) pane('RSI 14', (s0, h) => {
      const yy = (v) => s0 + (100 - v) / 100 * h;
      for (const l of [30, 70]) { g.strokeStyle = col.txt + '55'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Lm, yy(l)); g.lineTo(W - Rm, yy(l)); g.stroke(); g.setLineDash([]); g.fillStyle = col.txt; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(l, W - Rm + 6, yy(l)); }
      g.strokeStyle = '#c678dd'; g.lineWidth = 1.3; g.beginPath(); let on = false;
      for (let i = start; i < end; i++) { const v = ind.rsi[i]; if (!isFinite(v)) { on = false; continue; } const x = kx(i); if (!on) { g.moveTo(x, yy(v)); on = true; } else g.lineTo(x, yy(v)); } g.stroke();
      const lv = ind.rsi[end - 1]; if (isFinite(lv)) { g.fillStyle = '#c678dd'; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(lv.toFixed(1), W - Rm - 6, s0 + 4); }
    });
    if (o.macd) pane('MACD 12·26·9', (s0, h) => {
      const m = ind.macd; let mx = 1e-12; for (let i = start; i < end; i++) { for (const a of [m.macd[i], m.signal[i], m.hist[i]]) if (isFinite(a)) mx = Math.max(mx, Math.abs(a)); }
      const yy = (v) => s0 + h / 2 - (v / mx) * (h / 2 - 4);
      g.strokeStyle = col.txt + '44'; g.beginPath(); g.moveTo(Lm, yy(0)); g.lineTo(W - Rm, yy(0)); g.stroke();
      for (let i = start; i < end; i++) { const v = m.hist[i]; if (!isFinite(v)) continue; g.fillStyle = (v >= 0 ? col.up : col.dn) + '88'; const y = yy(v), z = yy(0); g.fillRect(kx(i) - bw * 0.3, Math.min(y, z), Math.max(1, bw * 0.6), Math.abs(y - z)); }
      const ln = (arr, c) => { g.strokeStyle = c; g.lineWidth = 1.2; g.beginPath(); let on = false; for (let i = start; i < end; i++) { const v = arr[i]; if (!isFinite(v)) { on = false; continue; } const x = kx(i); if (!on) { g.moveTo(x, yy(v)); on = true; } else g.lineTo(x, yy(v)); } g.stroke(); };
      ln(m.macd, col.acc); ln(m.signal, col.amb);
    });
    const lnP = (s0, h, arrs, cols, fixed) => {
      let mn = Infinity, mx = -Infinity; for (const a of arrs) for (let i = start; i < end; i++) if (isFinite(a[i])) { mn = Math.min(mn, a[i]); mx = Math.max(mx, a[i]); }
      if (fixed) { mn = fixed[0]; mx = fixed[1]; } if (!isFinite(mn)) return; if (mx === mn) mx = mn + 1;
      const yy = (v) => s0 + 4 + (mx - v) / (mx - mn) * (h - 8);
      arrs.forEach((a, k) => { g.strokeStyle = cols[k]; g.lineWidth = 1.3; g.beginPath(); let on = false; for (let i = start; i < end; i++) { const v = a[i]; if (!isFinite(v)) { on = false; continue; } const x = kx(i); if (!on) { g.moveTo(x, yy(v)); on = true; } else g.lineTo(x, yy(v)); } g.stroke(); });
      return yy;
    };
    if (o.stochrsi && ind.srsi) pane('Stoch RSI 14·3·3', (s0, h) => { const yy = lnP(s0, h, [ind.srsi.k, ind.srsi.d], [col.acc, col.amb], [0, 100]); for (const l of [20, 80]) { g.strokeStyle = col.txt + '44'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Lm, yy(l)); g.lineTo(W - Rm, yy(l)); g.stroke(); g.setLineDash([]); } });
    if (o.adx && ind.adx) pane('ADX 14 · +DI · −DI', (s0, h) => { lnP(s0, h, [ind.adx.adx, ind.adx.pdi, ind.adx.mdi], [col.fg, col.up, col.dn], [0, 60]); });
    if (o.atr && ind.atr) pane('ATR 14', (s0, h) => { lnP(s0, h, [ind.atr], ['#38bdf8']); });
    if (o.obv && ind.obv) pane('On-Balance Volume', (s0, h) => { lnP(s0, h, [ind.obv], ['#a78bfa']); });
    // library sub-panes
    if (ind.extra) { let ci = 0; for (const x of ind.extra) { if (x.def.pane !== 'sub') continue; const d0 = x.def, pr = Object.assign({}, d0.p, x.e.p || {}), ttl = d0.name + (Object.keys(pr).length ? ' (' + Object.values(pr).join(', ') + ')' : '');
      pane(ttl, (s0, h) => { const lines = x.out.filter((l) => !l.hist && !l.dots), hs = x.out.filter((l) => l.hist), ds = x.out.filter((l) => l.dots); let mn = Infinity, mx = -Infinity;
        if (d0.range) { mn = d0.range[0]; mx = d0.range[1]; } else { for (const l of x.out) for (let i = start; i < end; i++) { const v = l.v[i]; if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } } for (const lv of d0.levels || []) { if (lv < mn) mn = lv; if (lv > mx) mx = lv; } }
        if (!Number.isFinite(mn)) return; if (mx === mn) { mx += 1; mn -= 1; } const pad = (mx - mn) * 0.06; if (!d0.range) { mx += pad; mn -= pad; }
        const yy = (v) => s0 + 4 + ((mx - v) / (mx - mn)) * (h - 8);
        for (const lv of d0.levels || []) { g.strokeStyle = col.txt + '44'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Lm, yy(lv)); g.lineTo(W - Rm, yy(lv)); g.stroke(); g.setLineDash([]); g.fillStyle = col.txt; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(String(lv), W - Rm + 6, yy(lv)); }
        const z = yy(Math.max(mn, Math.min(mx, 0)));
        for (const l of hs) for (let i = start; i < end; i++) { const v = l.v[i]; if (!Number.isFinite(v)) continue; g.fillStyle = (v >= 0 ? col.up : col.dn) + '99'; const y = yy(v); g.fillRect(kx(i) - bw * 0.3, Math.min(y, z), Math.max(1, bw * 0.6), Math.max(1, Math.abs(y - z))); }
        lines.forEach((l) => { const cc = PAL[ci++ % PAL.length]; g.strokeStyle = cc; g.lineWidth = 1.3; g.beginPath(); let on = false; for (let i = start; i < end; i++) { const v = l.v[i]; if (!Number.isFinite(v)) { on = false; continue; } const X = kx(i), Y = yy(v); if (!on) { g.moveTo(X, Y); on = true; } else g.lineTo(X, Y); } g.stroke(); const lv = l.v[end - 1]; if (Number.isFinite(lv)) { g.fillStyle = cc; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(l.n + ' ' + (Math.abs(lv) >= 1e4 ? NT.fmtCompact(lv) : lv.toFixed(Math.abs(lv) < 10 ? 2 : 1)), W - Rm - 6, s0 + 4 + lines.indexOf(l) * 12); } });
        for (const l of ds) { g.fillStyle = col.amb; for (let i = start; i < end; i++) { const v = l.v[i]; if (Number.isFinite(v)) { g.beginPath(); g.arc(kx(i), yy(v), 2, 0, 7); g.fill(); } } }
      }); } }
    // plug-in overlays (order flow, workspace links): each gets the canvas and the layout
    this.L.py = py; this.L.W = W; this.L.H = H; this.L.col = col;
    for (const f of this.overlays) { try { f(g, this.L, this); } catch (e) { console.warn('overlay', e); } }
    // snapshot the static layer (everything above) so cursor-only frames are one drawImage
    const sc = this.sc || (this.sc = document.createElement('canvas'));
    if (sc.width !== cv.width || sc.height !== cv.height) { sc.width = cv.width; sc.height = cv.height; }
    const sg = sc.getContext('2d'); sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sc.width, sc.height); sg.drawImage(cv, 0, 0);
    this.S = { W, H, Lm, Rm, Bm, y0, mainH, volH, hi, lo, bw, end, bars, start, D, kx, col, ind, o };
    this.drawDyn(g, this.S);
  }
  drawDyn(g, S) {
    const { W, H, Lm, Rm, Bm, y0, mainH, volH, hi, lo, bw, end, bars, start, D, kx, col, ind, o } = S;
    g.font = '11px ui-monospace, Menlo, Consolas, monospace';
    // synced crosshair from another chart (workspaces)
    if (!this.mouse && this.ext && this.ext.t != null && D.length) { const x = Math.round(this.tToX(this.ext.t)) + 0.5; if (x >= Lm && x <= W - Rm) { g.setLineDash([3, 3]); g.strokeStyle = col.acc + 'cc'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, H - Bm); g.stroke(); g.setLineDash([]); } }
    // crosshair + legend
    let hi_i = end - 1;
    if (this.mouse && this.mouse.x >= Lm && this.mouse.x <= W - Rm && this.mouse.y >= y0 && this.mouse.y <= H - Bm) {
      const i = Math.round((this.mouse.x - Lm) / bw - 0.5) + (end - bars);
      if (i >= start && i < end) hi_i = i;
      g.setLineDash([3, 3]); g.strokeStyle = col.txt + 'aa'; g.lineWidth = 1;
      const cx = Math.round(i >= start && i < end ? kx(i) : this.mouse.x) + 0.5;
      g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, H - Bm); g.moveTo(Lm, Math.round(this.mouse.y) + 0.5); g.lineTo(W - Rm, Math.round(this.mouse.y) + 0.5); g.stroke(); g.setLineDash([]);
      if (this.mouse.y <= y0 + mainH) {
        const price = hi - (this.mouse.y - y0) / (mainH - volH - 4) * (hi - lo);
        g.fillStyle = col.fg; g.fillRect(W - Rm, this.mouse.y - 9, Rm - 2, 18); g.fillStyle = '#0b0e14'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(NT.fmtPrice(price), W - Rm + 5, this.mouse.y);
      }
      if (i >= start && i < end) { g.fillStyle = col.fg; const tt = fmtTime(D[i].t, this.tfSec, true), tw = g.measureText(tt).width + 12; g.fillRect(NT.clamp(cx - tw / 2, 0, W - tw), H - Bm + 2, tw, 17); g.fillStyle = '#0b0e14'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tt, NT.clamp(cx, tw / 2, W - tw / 2), H - Bm + 11); }
    }
    const k = D[hi_i], chg = hi_i > 0 ? (k.c / D[hi_i - 1].c - 1) * 100 : 0, cc = k.c >= k.o ? col.up : col.dn;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '12px ui-monospace, Menlo, Consolas, monospace';
    let lx = Lm + 4; const ty = 14;
    const seg = (t, c) => { g.fillStyle = c; g.fillText(t, lx, ty); lx += g.measureText(t).width + 4; };
    seg('O', col.txt); seg(NT.fmtPrice(k.o), cc); seg('H', col.txt); seg(NT.fmtPrice(k.h), cc); seg('L', col.txt); seg(NT.fmtPrice(k.l), cc); seg('C', col.txt); seg(NT.fmtPrice(k.c), cc); seg(NT.fmtPct(chg), cc);
    seg('  Vol', col.txt); seg(NT.fmtCompact(k.v), col.fg);
    if (o.ema) { seg('  EMA20', col.amb); if (isFinite(ind.ema20[hi_i])) seg(NT.fmtPrice(ind.ema20[hi_i]), col.amb); seg('EMA50', '#c678dd'); if (isFinite(ind.ema50[hi_i])) seg(NT.fmtPrice(ind.ema50[hi_i]), '#c678dd'); }
  }
}
function findIdx(D, t) { // index of candle with bucket time t (binary search); -1 if before
  let a = 0, b = D.length - 1, r = -1;
  while (a <= b) { const m = (a + b) >> 1; if (D[m].t <= t) { r = m; a = m + 1; } else b = m - 1; }
  return r;
}

/* multi-series line chart (equity curves etc.) */
function drawLines(cv, series, o = {}) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const txt = cssv('--mut', '#7d879b'), grid = cssv('--grid', '#1b2230');
  let lo = Infinity, hi = -Infinity, cnt = 0;
  for (const s of series) for (const v of s.values) if (isFinite(v)) { cnt++; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (cnt < 2) { g.fillStyle = txt; g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText(o.empty || 'Collecting data…', W / 2, H / 2); return; }
  if (hi === lo) { hi += 1; lo -= 1; } const pd = (hi - lo) * 0.08; lo -= pd; hi += pd;
  g.font = '11px ui-monospace, Menlo, Consolas, monospace';
  const L = 6, R = Math.max(54, Math.ceil(Math.max(g.measureText((o.fmt || NT.fmtCompact)(hi)).width, g.measureText((o.fmt || NT.fmtCompact)(lo)).width)) + 12), T = 22, B = o.xs ? 20 : 8, pw = W - L - R, ph = H - T - B;
  const maxN = Math.max(...series.map((s) => s.values.length));
  const x = (i, n) => L + (n <= 1 ? 0 : (i / (n - 1)) * pw), y = (v) => T + (hi - v) / (hi - lo) * ph;
  g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
  for (const t of niceTicks(lo, hi, 4)) { const yy = Math.round(y(t)) + 0.5; g.strokeStyle = grid; g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke(); g.fillStyle = txt; g.fillText((o.fmt || NT.fmtCompact)(t), W - R + 5, yy); }
  if (o.xs && o.xs.length > 1) { g.textAlign = 'center'; g.textBaseline = 'alphabetic'; const n = o.xs.length; for (let k = 0; k <= 4; k++) { const i = Math.round((k / 4) * (n - 1)); g.fillStyle = txt; g.fillText(fmtTime(o.xs[i], (o.xs[n - 1] - o.xs[0]) > 2 * 86400 ? 86400 : 3600), Math.min(W - R - 18, Math.max(L + 18, x(i, n))), H - 5); } }
  if (o.base != null) { g.setLineDash([4, 4]); g.strokeStyle = txt + '88'; g.beginPath(); g.moveTo(L, y(o.base)); g.lineTo(W - R, y(o.base)); g.stroke(); g.setLineDash([]); }
  let lx = L + 4;
  series.forEach((s) => {
    const n = s.values.length, step = Math.max(1, Math.floor(n / (pw * 1.5))); g.strokeStyle = s.color; g.lineWidth = s.w || 1.8; g.beginPath(); let on = false;
    for (let i = 0; i < n; i = i === n - 1 ? n : Math.min(n - 1, i + step)) { const v = s.values[i]; if (!isFinite(v)) { on = false; continue; } const xx = x(i, maxN === n ? n : maxN), yy = y(v); if (!on) { g.moveTo(xx, yy); on = true; } else g.lineTo(xx, yy); }
    g.stroke();
    if (s.fill) { g.lineTo(x(n - 1, n), T + ph); g.lineTo(x(0, n), T + ph); g.closePath(); g.fillStyle = s.color + '18'; g.fill(); }
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = s.color; g.font = '11px system-ui'; const lbl = s.name + (isFinite(s.values[n - 1]) ? '  ' + (o.fmt || NT.fmtCompact)(s.values[n - 1]) : ''); g.fillText(lbl, lx, 10); lx += g.measureText(lbl).width + 16;
  });
}

function heatColor(pct, scale) {
  if (pct == null || !isFinite(pct)) return '#1c2333';
  const t = NT.clamp(pct / scale, -1, 1), mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.pow(k, 0.85)));
  const gray = [28, 35, 51], green = [9, 178, 112], red = [226, 54, 78];
  const c = t >= 0 ? mix(gray, green, t) : mix(gray, red, -t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
