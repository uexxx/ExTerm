/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v15.7 UI: sub-second true-form candles + five pure-canvas 3D views. Wraps existing pieces (ids, feeds and
   listeners stay intact):
   · every live trade lands in a 15-minute Float64Array ring of 1s bars (V157.rings), so a fresh 1s / 5s / 10s chart is
     seeded synchronously from RAM before the network history arrives
   · on 1s / 5s / 10s every candle body is ≥ 4px wide with a 2px gap (visible bar count fits the plot width) and ≥ 2.5px tall
   · 3D Order-Book Liquidity Terrain + Options IV & Gamma Surface (Flow), Correlation & Regime Orbit (World/Copilot),
     Quant Lab Profit Mountain (Lab step 2), Whale & Liquidation Cluster Orbit (Whales). One rAF loop draws only views that
     are on screen and changed; hidden tabs, off-screen panels and background browser tabs cost zero frames.
   Strict CSP: no inline handlers, every dynamic string through esc(). Maths in V157 (v157core.js). */
const V157UI = (() => {
  const U = { views: new Map(), stats: { frames: {}, seeded: 0, seedMs: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const C = () => ({ up: cssv('--up', '#26c281'), dn: cssv('--dn', '#ef5350'), acc: cssv('--acc', '#5b8cff'), amb: cssv('--amber', '#f5a524'), txt: cssv('--mut', '#7d879b'), fg: cssv('--text', '#d6dbe6'), grid: cssv('--grid', '#1b2230') });

  /* ══ ticks → 1s ring (exchange trades; plain ticker updates only for markets without a trade stream) ══ */
  const traded = new Set();
  const feedWire = () => {
    if (typeof Feed === 'undefined' || Feed._v157) return; Feed._v157 = true;
    Feed.tradeL.push((sym, p, q, side, ts) => { if (!traded.has(sym)) { traded.add(sym); V157.rings.delete(sym); } V157.note(sym, p, q, ts); }); // restart on exchange time: ticker updates use the local clock
    Feed.tickL.push((sym, p) => { if (!traded.has(sym)) V157.note(sym, p, 0, Date.now() / 1000); });
  };
  /* a new 1s / 5s / 10s store starts from the ring at once; the usual history load still merges in behind it */
  const storeWire = () => {
    if (typeof getStore !== 'function' || getStore._v157) return; const g0 = getStore;
    getStore = function () {
      const s = g0.apply(this, arguments);
      if (s && s.sec <= V157.FAST && !s.candles.length) { const r = V157.rings.get(s.sym); if (r && r.size > 1) { const t0 = performance.now(); s.merge(r.rollup(s.sec, Date.now() / 1000)); U.stats.seeded++; U.stats.seedMs = performance.now() - t0; } }
      return s;
    };
    getStore._v157 = true;
  };
  /* ══ crisp fast candles: ≥ 4px body + 2px gap on 1s / 5s / 10s ══ */
  let fastNow = false;
  const chartWire = () => {
    if (typeof CandleChart === 'undefined' || CandleChart.prototype._v157) return; const P = CandleChart.prototype, d0 = P.draw, br = NT.bodyRect; P._v157 = true;
    NT.bodyRect = (yo, yc, x, bw) => (fastNow ? V157.body(yo, yc, x, bw, true) : br(yo, yc, x, bw));
    P.draw = function () {
      const fast = this.tfSec > 0 && this.tfSec <= V157.FAST;
      if (fast) { const pw = this.L && this.L.plotW > 0 ? this.L.plotW : (this.cv.clientWidth || 0) - 76, mb = V157.maxBars(pw); if (this.view.bars > mb) { this.view.bars = mb; this.dirty = true; } }
      fastNow = fast; try { return d0.apply(this, arguments); } finally { fastNow = false; }
    };
  };

  /* ══ 3D view shell: drag / arrow keys rotate, Home or Reset Angle restores, auto-orbit after 4 s idle ══ */
  let raf = 0;
  const kick = () => { if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame); };
  const visible = (v) => v.inView && v.cv.isConnected && v.cv.offsetParent !== null && !document.hidden;
  const paint = (v) => {
    const cv = v.cv, dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return false;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    try { v.draw(g, w, h, v.ang); } catch (e) { console.warn('v157 3d', v.id, e); }
    return true;
  };
  function frame() {
    raf = 0; let any = false; const now = performance.now();
    for (const v of U.views.values()) {
      if (!visible(v)) continue; any = true;
      if (v.auto && now - v.idle > 4000) { v.ang.yaw += 0.004; v.dirty = true; }
      if (v.dirty && paint(v)) { v.dirty = false; U.stats.frames[v.id]++; }
    }
    if (any) raf = requestAnimationFrame(frame);
  }
  const mkView = (id, title, o) => {
    const box = document.createElement('div'); box.className = 'panel v157-3d'; box.id = id;
    box.innerHTML = `<div class="ph"><span>${esc(title)}</span><span class="sp"></span>${o.seg || ''}<button type="button" class="btn xs" data-v157="reset">Reset Angle</button></div><div class="pb"><canvas tabindex="0" role="img" aria-label="${esc(title)}: drag or use the arrow keys to rotate, Home to reset"></canvas><div class="note v157-cap"></div></div>`;
    const v = Object.assign({ id, box, cv: box.querySelector('canvas'), cap: box.querySelector('.v157-cap'), ang: Object.assign({}, V157.ANG0), dirty: true, idle: 0, inView: typeof IntersectionObserver === 'undefined' }, o);
    const touch = () => { v.dirty = true; v.idle = performance.now(); kick(); };
    let drag = null;
    v.cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, a: Object.assign({}, v.ang) }; try { v.cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } touch(); });
    v.cv.addEventListener('pointermove', (e) => { if (!drag) return; v.ang = V157.clampAng({ yaw: drag.a.yaw + (e.clientX - drag.x) * 0.01, pitch: drag.a.pitch + (e.clientY - drag.y) * 0.01 }); touch(); });
    for (const t of ['pointerup', 'pointercancel']) v.cv.addEventListener(t, () => { drag = null; });
    v.cv.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
      if (k) v.ang = V157.clampAng({ yaw: v.ang.yaw + k[0], pitch: v.ang.pitch + k[1] }); else if (e.key === 'Home') v.ang = Object.assign({}, V157.ANG0); else return;
      e.preventDefault(); touch();
    });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-v157]'); if (!b) return; if (b.dataset.v157 === 'reset') { v.ang = Object.assign({}, V157.ANG0); touch(); } else if (v.onBtn) { v.onBtn(b); touch(); } });
    if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver((es) => { v.inView = es[es.length - 1].isIntersecting; if (v.inView) { v.dirty = true; if (v.update) Promise.resolve(v.update()).then(() => { v.dirty = true; kick(); }); kick(); } }).observe(v.cv);
    U.views.set(id, v); U.stats.frames[id] = 0; return v;
  };

  /* ══ drawing helpers ══ */
  const P3 = (ang, w, h) => (x, y, z) => V157.proj(x, y, z, ang, w, h);
  const floor = (g, p, c, L) => {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => p(x, y, -0.6)); g.strokeStyle = c.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (const k of [1, 2, 3, 0]) g.lineTo(q[k][0], q[k][1]);
    const a = p(-1, -1, -0.6), b = p(-1, -1, 0.6); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    if (!L) return; g.fillStyle = c.txt; g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = (s, pt) => s && g.fillText(s, pt[0], pt[1]); t(L[0], p(0, -1.3, -0.6)); t(L[1], p(1.3, 0, -0.6)); t(L[2], p(-1, -1, 0.78));
  };
  /* wireframe surface; segments bucketed by colour + height so the whole mesh is ~20 strokes */
  const surface = (g, w, h, ang, Z, hue, L) => {
    const c = C(), p = P3(ang, w, h), { pts, lo, hi } = V157.grid(Z), S = pts.map((row) => row.map((q) => p(q[0], q[1], q[2]))), B = new Map();
    floor(g, p, c, L);
    const add = (r, cc, r2, c2) => { const z = (pts[r][cc][2] + pts[r2][c2][2]) / 2, k = hue(r, cc) + '|' + Math.min(9, Math.floor(((z + 0.6) / 1.2) * 10)); let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(S[r][cc], S[r2][c2]); };
    for (let r = 0; r < S.length; r++) for (let cc = 0; cc < S[r].length; cc++) { if (cc + 1 < S[r].length) add(r, cc, r, cc + 1); if (r + 1 < S.length) add(r, cc, r + 1, cc); }
    g.lineWidth = 1.1;
    for (const [k, segs] of B) { const [col, lv] = k.split('|'); g.strokeStyle = col; g.globalAlpha = 0.28 + 0.07 * +lv; g.beginPath(); for (let i = 0; i < segs.length; i += 2) { g.moveTo(segs[i][0], segs[i][1]); g.lineTo(segs[i + 1][0], segs[i + 1][1]); } g.stroke(); }
    g.globalAlpha = 1; return { lo, hi };
  };
  const dot = (g, x, y, r, fill, label, fg) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (label) { g.fillStyle = fg; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(label, x, y - r - 2); } };
  const short = (s) => String(s || '').split('-')[0];
  const live = () => typeof Providers !== 'undefined' && Providers.active && (typeof Demo === 'undefined' || Providers.active !== Demo);
  const price = (s) => (typeof px === 'function' ? px(s) : 0) || 0;

  /* ══ 1. Order-book liquidity terrain: price bins × last 40 seconds ══ */
  const terr = { rows: [], sym: '', span: 0, live: false, own: null, at: 0 };
  const terrV = mkView('v157Terrain', '3D Order-Book Liquidity Terrain', {
    async update() {
      const s = ST.sel, mid = price(s); if (terr.sym !== s) Object.assign(terr, { sym: s, rows: [], span: 0, own: null }); if (!(mid > 0)) return;
      let bk = typeof P5UI !== 'undefined' && P5UI.book && P5UI.book.sym === s && Date.now() - (P5UI.bookTs || 0) < 5000 ? P5UI.book : null;
      if (!bk && live() && !isOnchain(s) && !isStock(s) && Providers.active.book && Date.now() - terr.at > 2000) { terr.at = Date.now(); try { terr.own = Object.assign(await Providers.active.book(s), { sym: s, ts: Date.now() }); } catch (e) { terr.own = null; } }
      if (!bk && terr.own && terr.own.sym === s && Date.now() - terr.own.ts < 6000) bk = terr.own;
      terr.live = !!bk; if (!bk) bk = V157.modelBook(mid, Date.now() / 1000);
      if (!terr.span) { let m = 0; for (const [p] of [...(bk.bids || []), ...(bk.asks || [])]) m = Math.max(m, Math.abs(p / mid - 1)); terr.span = Math.max(0.0005, m * 1.1); }
      terr.rows.push(V157.depthRow(bk, mid, 24, terr.span).map((v) => Math.log1p(v))); if (terr.rows.length > 40) terr.rows.shift();
      terrV.cap.textContent = `${short(s)} · ${terr.live ? 'live order book' : 'modelled depth (no live book for this market)'} · ±${(terr.span * 100).toFixed(2)}% around mid × last ${terr.rows.length}s · green = bids, red = asks; tall ridges are walls, sudden gaps are liquidity cliffs`;
    },
    draw(g, w, h, ang) {
      const c = C(), Z = terr.rows.length > 1 ? terr.rows : terr.rows.length ? [terr.rows[0], terr.rows[0]] : [new Array(24).fill(0), new Array(24).fill(0)];
      surface(g, w, h, ang, Z, (r, cc) => (cc < 12 ? c.up : c.dn), ['price (bid ← mid → ask)', 'time →', 'depth $']);
    },
  });

  /* ══ 2. Options IV / net-gamma surface: strike × expiry ══ */
  const ivS = { mode: 'iv', d: null };
  const ivV = mkView('v157IV', '3D Options IV & Gamma Surface', {
    seg: '<div class="seg v157-seg"><button type="button" class="on" data-v157="iv">IV</button><button type="button" data-v157="gamma">Γ</button></div>',
    onBtn(b) { ivS.mode = b.dataset.v157; for (const x of ivV.box.querySelectorAll('.v157-seg button')) x.classList.toggle('on', x === b); ivV.update(); },
    update() {
      const ch = typeof P5UI !== 'undefined' ? P5UI.chain : null, s = ch ? ch.sym : ST.sel, spot = (ch && ch.spot) || price(s) || 100; let ks, ivAt, src;
      const L = ch && ch.calls ? ch.calls.filter((x) => x.iv > 0 && Math.abs(x.strike / spot - 1) < 0.2).sort((a, b) => a.strike - b.strike) : [];
      if (L.length > 4) { const st = Math.max(1, Math.floor(L.length / 15)); ks = L.filter((_, i) => i % st === 0).map((x) => +x.strike); ivAt = (k) => L.reduce((m, x) => (Math.abs(x.strike - k) < Math.abs(m.strike - k) ? x : m)).iv; src = ch.sim ? 'modelled chain (labelled simulation)' : 'live chain'; }
      else { ks = Array.from({ length: 15 }, (_, i) => spot * (0.86 + i * 0.02)); ivAt = (k) => { const m = Math.log(k / spot); return 0.45 + 0.9 * m * m - 0.15 * m; }; src = 'modelled smile (open Flow → Options for a live chain)'; }
      ivS.d = { Z: V157.ivSurface(ks, ivAt, spot, ivS.mode, typeof V156 !== 'undefined' ? V156.greeks : null), ks, s };
      ivV.cap.textContent = `${short(s)} · ${src} · strikes ${NT.fmtPrice(ks[0])}–${NT.fmtPrice(ks[ks.length - 1])} × ${V157.EXP_D.join(' / ')} DTE (term structure modelled from the front smile) · ${ivS.mode === 'iv' ? 'implied volatility %' : 'call $ gamma per 1% move'}`;
    },
    draw(g, w, h, ang) { if (!ivS.d) this.update(); const c = C(); surface(g, w, h, ang, ivS.d.Z, () => (ivS.mode === 'iv' ? c.acc : c.amb), ['strike →', 'expiry →', ivS.mode === 'iv' ? 'IV %' : 'Γ $']); },
  });

  /* ══ 3. Multi-asset correlation & regime orbit ══ */
  const cor = { d: null };
  const corV = mkView('v157Corr', '3D Multi-Asset Correlation & Regime Orbit', {
    auto: true,
    update() {
      const syms = (ST.watch || []).filter((s) => !isOnchain(s)).slice(0, 8);
      const closes = syms.map((s) => { const st = getStore(s, ST.tf); if (!st.loaded && !st.loading && st.candles.length < 30) st.load(120); return st.candles.map((k) => k.c); });
      cor.d = Object.assign({ syms }, V157.corr(closes)); const n = closes.filter((x) => x.length > 11).length;
      corV.cap.textContent = `${n}/${syms.length} watchlist markets · correlation of the last 60 ${ST.tf} returns · beam width = |ρ|, green = move together, red = opposite · height = 20-bar momentum`;
    },
    draw(g, w, h, ang) {
      const c = C(), p = P3(ang, w, h); floor(g, p, c, null); const d = cor.d; if (!d || !d.syms.length) return;
      const N = V157.orbit(d.syms.length, d.mom.map((m) => Math.max(-1, Math.min(1, m / 5)))).map((q) => p(q[0], q[1], q[2]));
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const r = d.M[i][j]; if (r == null || Math.abs(r) < 0.3) continue; g.strokeStyle = r > 0 ? c.up : c.dn; g.globalAlpha = 0.25 + 0.6 * Math.abs(r); g.lineWidth = 0.5 + 3.5 * Math.abs(r); g.beginPath(); g.moveTo(N[i][0], N[i][1]); g.lineTo(N[j][0], N[j][1]); g.stroke(); }
      g.globalAlpha = 1; const ord = N.map((q, i) => i).sort((a, b) => N[b][2] - N[a][2]);
      for (const i of ord) dot(g, N[i][0], N[i][1], 6, d.mom[i] >= 0 ? c.up : c.dn, `${short(d.syms[i])} ${d.mom[i] >= 0 ? '+' : ''}${d.mom[i].toFixed(1)}%`, c.fg);
    },
  });

  /* ══ 4. Quant Lab profit mountain: SL % × TP % × net bot profit ══ */
  const mtn = { Z: null, busy: false, pl: null, key: '' };
  const mtnV = mkView('v157Mtn', '3D Quant Lab Profit Mountain', {
    seg: '<button type="button" class="btn xs pri" data-v157="build">Build mountain</button>',
    async onBtn(b) {
      const B = typeof V153UI !== 'undefined' ? V153UI.base : null; if (b.dataset.v157 !== 'build' || mtn.busy) return;
      if (!B) { mtnV.cap.textContent = 'Run the baseline backtest first (step 1 / Run backtest), then build the mountain.'; return; }
      mtn.busy = true; const Z = V157.SL.map(() => V157.TP.map(() => NaN)); mtn.Z = Z; mtn.pl = null;
      const o0 = Object.assign({ cash: 10000, tfSec: B.sec, fee: ((ST.settings && ST.settings.fee) || 0.1) / 100, slip: ((ST.settings && ST.settings.slip) || 0.05) / 100 }, typeof V153 !== 'undefined' && V153.filtO ? V153.filtO(B.f) : {});
      for (let r = 0; r < V157.SL.length; r++) {
        for (let k = 0; k < V157.TP.length; k++) { try { const res = NT.backtest(B.cs, NT.strategies[B.id], B.p, Object.assign({}, o0, { slPct: V157.SL[r] / 100, tpPct: V157.TP[k] / 100 })); Z[r][k] = res.eq[res.eq.length - 1] - 10000; } catch (e) { Z[r][k] = NaN; } }
        mtnV.cap.textContent = `Backtesting ${(r + 1) * V157.TP.length}/${V157.SL.length * V157.TP.length} stop / target pairs…`; mtnV.dirty = true; kick();
        await new Promise((ok) => setTimeout(ok, 0)); // yield a frame per row
      }
      mtn.busy = false; mtn.pl = V157.plateau(Z); mtn.key = B.id + '|' + B.sym + '|' + B.tf; const pl = mtn.pl;
      mtnV.cap.textContent = pl ? `${short(B.sym)} ${B.tf} · best net bot profit ${pl.best >= 0 ? '+' : '−'}$${Math.abs(pl.best).toFixed(0)} at SL ${V157.SL[pl.r]}% / TP ${V157.TP[pl.c]}% · neighbourhood keeps ${(pl.rob * 100).toFixed(0)}% → ${pl.kind === 'plateau' ? 'broad plateau (robust)' : pl.kind === 'ridge' ? 'narrow ridge (handle with care)' : pl.kind === 'spike' ? 'fragile spike (likely overfit)' : 'no profitable pair'} · $10,000 paper, fees + slippage included` : 'No result.';
    },
    draw(g, w, h, ang) {
      const c = C(), Z = mtn.Z || V157.SL.map(() => V157.TP.map(() => 0));
      surface(g, w, h, ang, Z, (r, k) => (Number.isFinite(Z[r][k]) && Z[r][k] >= 0 ? c.up : c.dn), ['take-profit % →', 'stop-loss % →', 'net $']);
      if (mtn.pl && mtn.Z) { const q = V157.grid(Z).pts[mtn.pl.r][mtn.pl.c], s = V157.proj(q[0], q[1], q[2], ang, w, h); dot(g, s[0], s[1], 5, c.amb, `best ${mtn.pl.best >= 0 ? '+' : '−'}$${Math.abs(Math.round(mtn.pl.best))}`, c.fg); }
      if (!mtn.Z) { g.fillStyle = c.txt; g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText('Build the mountain to sweep 49 stop / target pairs', w / 2, 18); }
    },
  });

  /* ══ 5. On-chain whale & liquidation cluster orbit ══ */
  const wh = { d: null };
  const MODEL = ['BTC', 'ETH', 'HYPE', 'XRP', 'DOGE', 'AVAX'];
  const whV = mkView('v157Whale', '3D Whale & Liquidation Cluster Orbit', {
    auto: true,
    update() {
      let pos = []; if (typeof LeaderUI !== 'undefined' && LeaderUI.det) for (const [, d] of LeaderUI.det) for (const q of d.positions || []) if (q && q.ntl > 0) pos.push(q);
      const isLive = pos.length > 0;
      if (!isLive) pos = Array.from({ length: 30 }, (_, i) => { const coin = MODEL[i % MODEL.length], mark = price(coin + '-USD') || [97000, 3400, 30, 2.3, 0.35, 38][i % MODEL.length], side = i % 3 ? 'Long' : 'Short', d = 0.01 + ((i * 37) % 23) / 100; return { coin, side, mark, ntl: 2e5 + ((i * 7919) % 41) * 1.1e5, liq: side === 'Long' ? mark * (1 - d) : mark * (1 + d) }; });
      pos = pos.sort((a, b) => b.ntl - a.ntl).slice(0, 60); wh.d = { pts: V157.whalePts(pos), live: isLive };
      const hot = wh.d.pts.filter((q) => q.dist <= 2.5).length;
      whV.cap.textContent = `${isLive ? 'Live positions of expanded Perp Leaderboard traders' : 'Modelled sample (expand traders in Social → Perp Leaderboard for live positions)'} · ${pos.length} positions · size = notional, inner ring = closer to liquidation, up = long, down = short · ${hot} within 2.5% of liquidation`;
    },
    draw(g, w, h, ang) {
      const c = C(), p = P3(ang, w, h); floor(g, p, c, null); if (!wh.d) return;
      for (const rr of [0.25, 0.625, 1]) { g.strokeStyle = c.grid; g.beginPath(); for (let k = 0; k <= 48; k++) { const a = (k / 48) * 2 * Math.PI, s = p(Math.cos(a) * rr, Math.sin(a) * rr, 0); k ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); } g.stroke(); }
      const S = wh.d.pts.map((q) => ({ q, s: p(q.x, q.y, q.z), b: p(q.x, q.y, 0) })).sort((a, b) => b.s[2] - a.s[2]); const seen = new Set();
      for (const { q, s, b } of S) { g.strokeStyle = c.grid; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(s[0], s[1]); g.stroke(); g.globalAlpha = 0.85; const lab = !seen.has(q.p.coin) && q.size > 7 ? (seen.add(q.p.coin), q.p.coin) : ''; dot(g, s[0], s[1], q.size, V157.liqColor(q.dist), lab, c.fg); g.globalAlpha = 1; }
    },
  });

  /* ══ mounting: hosts are re-attached if a view re-renders its container ══ */
  const row = (id, ...boxes) => { let r = document.getElementById(id); if (!r) { r = document.createElement('div'); r.id = id; r.className = 'v157-row'; } for (const b of boxes) if (b.parentNode !== r) r.appendChild(b); return r; };
  const mount = () => {
    const p5 = $1('#p5Body'); if (p5 && !$1('#v157Flow')) p5.after(row('v157Flow', terrV.box, ivV.box));
    const mac = $1('#tab-world') || $1('#tab-ai'); if (mac && !corV.box.isConnected) mac.appendChild(row('v157Macro', corV.box));
    const st2 = $1('#q153Root .v155-step[data-step="2"]'); if (st2 && !mtnV.box.isConnected) st2.appendChild(mtnV.box);
    const whs = $1('#tab-whales'); if (whs && !whV.box.isConnected) whs.appendChild(row('v157Whales', whV.box));
  };
  const tickData = async () => {
    mount();
    for (const v of U.views.values()) { if (!v.update || !visible(v)) continue; try { await v.update(); } catch (e) { console.warn('v157 data', v.id, e); } v.dirty = true; }
    kick();
  };
  U.start = () => {
    document.body.classList.add('v157');
    feedWire(); storeWire(); chartWire(); mount(); kick();
    setInterval(tickData, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { for (const v of U.views.values()) v.dirty = true; kick(); } });
  };
  U.mount = mount; U.kick = kick;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b157 = boot; boot = async function () { await _b157.apply(this, arguments); try { V157UI.start(); } catch (e) { console.warn('v157 init', e); } }; }
