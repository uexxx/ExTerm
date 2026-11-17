/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.1 UI: chart click / drag trading polish, ExTerm Chart Context Menu, Precision Range Measure Dragger,
   journal discipline attribution.
   · chart.priceToY / chart.yToPrice: one exact mapping for clicks, drags, menus and the measure ruler
   · dragging the draft Entry / SL / TP lines keeps the order ticket (limit price, SL %, TP %) in step
   · right-click on the plot → price-aware menu (edge-flipping, Esc / outside click closes); the browser's own
     image menu never opens on the chart. A right-click on a TP rung still opens the step-ladder menu (v15.4).
   · Shift + drag (or the ruler toggle) → gold / crimson measurement zone with Δ$, %, bars, elapsed time and
     cumulative volume, drawn on a light top canvas (pointer-events: none) so the candle layer is never redrawn for it
   · Journal: closed trades are tagged Followed Plan / Moved Stop Wider / Over-Size Risk / Early Exit with net $ per group
   Strict CSP: listeners attached here, every dynamic string through esc(). Maths in V161 (v161core.js). */
const V161UI = (() => {
  const DKEY = 'exterm.v161.disc';
  const U = { m: null, mOn: false, drag: false, menu: null, ov: null, disc: { plans: {}, rows: [] }, lastSync: '' };
  const $1 = (s, r) => (r || document).querySelector(s);
  const fp = (v) => NT.fmtPrice(v);
  const GOLD = '#D4AF37', CRIMSON = '#DC143C';

  /* ══ 1. exact price ↔ y mapping on the chart (same formula the candle layer uses) ══ */
  const proto = () => {
    if (typeof CandleChart === 'undefined' || CandleChart.prototype.priceToY) return;
    CandleChart.prototype.priceToY = function (p) { const L = this.L; return L && L.py && Number.isFinite(p) ? L.py(p) : NaN; };
    CandleChart.prototype.yToPrice = function (y) { const L = this.L; if (!L || L.hi == null) return NaN; return L.hi - ((y - L.y0) / (L.mainH - L.volH - 4)) * (L.hi - L.lo); };
    CandleChart.prototype.idxAtX = function (x) { const L = this.L; return L && L.bw ? Math.round((x - L.Lm) / L.bw - 0.5) + (L.end - L.bars) : NaN; };
  };
  const inPlot = (L, x, y) => L && L.py && x >= L.Lm && x <= L.W - L.Rm && y >= L.y0 && y <= L.y0 + L.mainH - (L.volH || 0) - 4;
  const loc = (e) => { const r = chart.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  /* keep the order ticket in step with the draft bracket while its lines are dragged: SL / TP drags update SL % / TP %;
     only an Entry drag switches the ticket to a limit (or stop) order at that price, so a market ticket is left alone */
  const syncTicket = () => {
    if (typeof ChartTrade === 'undefined' || !ChartTrade.draft || ChartTrade.draft.sym !== ST.sel || !ChartTrade.drag || ChartTrade.drag.key !== 'draft') return;
    const d = ChartTrade.draft, k = [d.entry, d.sl, d.tp].join('|'); if (k === U.lastSync) return; U.lastSync = k;
    const lim = $1('#tkLimit'), sl = $1('#tkSl'), tp = $1('#tkTp'); if (!lim) return;
    if (ChartTrade.drag.field === 'entry') {
      const c = typeof px === 'function' ? px(ST.sel) : 0, want = d.entry > c && c > 0 ? 'stop' : 'limit', btn = $1(`#tkType button[data-t="${want}"]`);
      if (btn && !btn.classList.contains('on')) btn.click();
      lim.value = +d.entry.toPrecision(8);
    }
    if (sl) sl.value = d.sl > 0 ? (((d.entry - d.sl) / d.entry) * 100).toFixed(3) : '';
    if (tp) tp.value = d.tp > 0 ? (((d.tp - d.entry) / d.entry) * 100).toFixed(3) : '';
    try { renderTicketMeta(); } catch (e) { /* ticket not built */ }
  };

  /* ══ 2. top overlay canvas (measure zone); pointer-events: none so every click reaches the chart hit-tester ══ */
  const ensureOv = () => {
    if (typeof chart === 'undefined' || !chart) return null;
    if (U.ov && U.ov.isConnected && U.ov.parentNode === chart.host) return U.ov;
    const c = document.createElement('canvas'); c.className = 'v161-ov'; c.setAttribute('aria-hidden', 'true'); chart.host.appendChild(c); U.ov = c; U.og = c.getContext('2d');
    const rd = document.createElement('div'); rd.className = 'v161-mread'; rd.id = 'v161Read'; rd.setAttribute('role', 'status'); rd.setAttribute('aria-live', 'polite'); rd.hidden = true; chart.host.appendChild(rd); U.rd = rd;
    return c;
  };
  const drawOv = () => {
    const c = ensureOv(); if (!c) return; const W = chart.host.clientWidth, H = chart.host.clientHeight, dpr = window.devicePixelRatio || 1, g = U.og;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    const m = U.m, L = chart.L; if (!m || !L || !L.py || !L.D || !L.D.length || m.sym !== ST.sel) { if (U.rd) U.rd.hidden = true; return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xa = chart.tToX(m.t0), xb = chart.tToX(m.t1), ya = chart.priceToY(m.p0), yb = chart.priceToY(m.p1);
    const D = L.D, i0 = D.findIndex((k) => k.t >= m.t0), i1 = D.findIndex((k) => k.t >= m.t1), r = V161.measure(D, i0 < 0 ? D.length - 1 : i0, i1 < 0 ? D.length - 1 : i1, m.p0, m.p1, chart.tfSec);
    if (!r || ![xa, xb, ya, yb].every(Number.isFinite)) { if (U.rd) U.rd.hidden = true; return; }
    const col = r.up ? GOLD : CRIMSON, x0 = Math.min(xa, xb), y0 = Math.min(ya, yb), w = Math.max(1, Math.abs(xb - xa)), h = Math.max(1, Math.abs(yb - ya));
    g.save(); g.beginPath(); g.rect(L.Lm, L.y0, L.W - L.Lm - L.Rm, L.mainH); g.clip();
    g.globalAlpha = 0.16; g.fillStyle = col; g.fillRect(x0, y0, w, h);
    g.globalAlpha = 0.95; g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(h)); g.setLineDash([]);
    g.lineWidth = 1.6; g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke();
    const ang = Math.atan2(yb - ya, xb - xa); g.beginPath(); g.moveTo(xb, yb); g.lineTo(xb - 9 * Math.cos(ang - 0.4), yb - 9 * Math.sin(ang - 0.4)); g.lineTo(xb - 9 * Math.cos(ang + 0.4), yb - 9 * Math.sin(ang + 0.4)); g.closePath(); g.fillStyle = col; g.fill();
    g.restore();
    const sign = r.dp >= 0 ? '+' : '−', l1 = `${sign}$${fp(Math.abs(r.dp))}  (${sign}${Math.abs(r.pct).toFixed(2)}%)`, l2 = `${r.bars} bars · ${V161.fmtDur(r.secs)}`, l3 = `Vol ${NT.fmtCompact(r.vol)}`;
    g.font = '600 11px ui-monospace, Menlo, Consolas, monospace'; const tw = Math.max(...[l1, l2, l3].map((s) => g.measureText(s).width)) + 16, th = 50;
    let bx = xb + 10, by = yb - th / 2; if (bx + tw > L.W - L.Rm) bx = xb - tw - 10; by = Math.max(L.y0 + 2, Math.min(L.y0 + L.mainH - th - 2, by));
    g.globalAlpha = 0.94; g.fillStyle = '#0b0b0d'; g.fillRect(bx, by, tw, th); g.globalAlpha = 1; g.strokeStyle = col; g.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(l1, bx + 8, by + 12); g.fillStyle = '#e8e8ea'; g.fillText(l2, bx + 8, by + 26); g.fillText(l3, bx + 8, by + 40);
    U.res = r; const txt = `${l1} · ${l2} · ${l3}`; if (U.rd) { if (U.rd.textContent !== txt) U.rd.textContent = txt; U.rd.className = 'v161-mread ' + (r.up ? 'up' : 'dn'); U.rd.hidden = false; }
  };
  /* runs inside the chart's full redraw (pan / zoom / new candles) so the zone stays glued to its prices and times */
  const chartHook = (g, L, ch) => { if (ch === chart) { if (U.m) drawOv(); else if (U.rd && !U.rd.hidden) drawOv(); syncTicket(); } };
  const mClear = () => { U.m = null; U.drag = false; drawOv(); };
  const mToggle = (on) => { U.mOn = on == null ? !U.mOn : !!on; const b = $1('#v161MBtn'); if (b) { b.classList.toggle('on', U.mOn); b.setAttribute('aria-pressed', String(U.mOn)); } if (chart) chart.cv.style.cursor = U.mOn ? 'crosshair' : ''; if (!U.mOn && !U.drag) mClear(); };
  const mStart = (x, y) => { const pt = chart.toTP(x, y); if (!pt) return false; U.m = { sym: ST.sel, t0: pt.t, p0: pt.p, t1: pt.t, p1: pt.p }; U.drag = true; drawOv(); return true; };
  const mMove = (x, y) => { const L = chart.L; if (!U.drag || !U.m || !L) return; const yy = Math.max(L.y0 + 1, Math.min(L.y0 + L.mainH - (L.volH || 0) - 5, y)), pt = chart.toTP(x, yy); if (!pt) return; U.m.t1 = pt.t; U.m.p1 = pt.p; drawOv(); };

  /* ══ 3. ExTerm Chart Context Menu ══ */
  const ICON = {
    buy: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    sell: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1H3zM7 14h2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    level: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h14M3 5v6M13 5v6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    vwap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13c3-1 4-8 7-8s3 5 5 5M2 3v10" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    replay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    ai: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.6"/></svg>',
    measure: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12L12 2l2 2L4 14zM5 9l1 1M7 7l1 1M9 5l1 1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    reset: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 10v4h-4M2 2l4 4M14 14l-4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 11V3a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const menuClose = () => { if (U.menu) { U.menu.remove(); U.menu = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', menuKey, true); window.removeEventListener('blur', menuClose); } };
  const outside = (e) => { if (U.menu && !U.menu.contains(e.target)) menuClose(); };
  const menuKey = (e) => {
    if (!U.menu) return; const bs = [...U.menu.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menuClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[(i + 1) % bs.length] || bs[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[(i - 1 + bs.length) % bs.length] || bs[0]).focus(); }
  };
  const menuOpen = (cx, cy, p, t) => {
    menuClose(); const sy = ST.sel, c = typeof px === 'function' ? px(sy) : 0, below = c > 0 ? p < c : true, have = typeof ACC !== 'undefined' && ACC.qty(sy) > 0, P = '$' + fp(p);
    const items = [
      ['buy', ICON.buy, `Place Buy ${below ? 'Limit' : 'Stop'} @ ${P}`, ''],
      ['sell', ICON.sell, `Place Sell ${below ? 'Stop' : 'Limit'} @ ${P}`, have ? '' : 'You have no position to sell'], 0,
      ['alert', ICON.alert, `Set Price Alert @ ${P}`, ''],
      ['hline', ICON.level, 'Drop Horizontal Level', ''],
      ['vwap', ICON.vwap, 'Anchor VWAP Here', typeof V152UI !== 'undefined' ? '' : 'Anchored VWAP is unavailable'], 0,
      ['replay', ICON.replay, 'Start Tick Replay From Here', typeof Replay !== 'undefined' ? '' : 'Replay is unavailable'],
      ['explain', ICON.ai, 'Explain Price Move Here (AI Forensics)', typeof V154 !== 'undefined' ? '' : 'Forensics are unavailable'], 0,
      ['measure', ICON.measure, U.mOn ? 'Measure Dragger: On (Shift + Drag)' : 'Measure Dragger (Shift + Drag)', ''],
      ['reset', ICON.reset, 'Reset Chart Scale', ''],
      ['copy', ICON.copy, `Copy Price (${P})`, ''],
    ];
    const el = document.createElement('div'); el.className = 'v161-menu'; el.id = 'v161Menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'ExTerm Chart Context Menu at ' + P);
    el.innerHTML = `<div class="v161-mh"><b>${esc(baseOf(sy))}</b><span class="num">${esc(P)}</span></div>` + items.map((x) => (x ? `<button type="button" role="menuitem" data-v161m="${x[0]}"${x[3] ? ` disabled title="${esc(x[3])}"` : ''}>${x[1]}<span>${esc(x[2])}</span></button>` : '<hr>')).join('');
    el.style.visibility = 'hidden'; document.body.appendChild(el);
    const r = el.getBoundingClientRect(), pos = V161.menuPos(cx, cy, r.width, r.height, innerWidth, innerHeight);
    el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; el.style.visibility = ''; el.classList.toggle('flip-x', pos.flipX); el.classList.toggle('flip-y', pos.flipY);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-v161m]'); if (!b || b.disabled) return; menuClose(); act(b.dataset.v161m, p, t); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    U.menu = el; U.menuAt = { p, t };
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', menuKey, true); window.addEventListener('blur', menuClose); const f = el.querySelector('button:not([disabled])'); if (f) f.focus({ preventScroll: true }); }, 0);
    return el;
  };
  const act = async (a, p, t) => {
    const T = typeof ChartTrade !== 'undefined' ? ChartTrade : null;
    if (a === 'buy' && T && typeof P2 !== 'undefined') { const n = (s) => { const el = $1(s), v = el ? parseFloat(el.value) : NaN; return v > 0 ? v : 0; }; T.draft = Object.assign({ sym: ST.sel, usd: n('#tkUsd') || 1000 }, P2.defaults(p, n('#tkSl'), n('#tkTp'))); T.hist.clear(); return T.place(); }
    else if (a === 'sell' && T) T.act('sell', p);
    else if (a === 'alert' && T) T.act('alert', p);
    else if (a === 'hline' && T) T.act('hline', p);
    else if (a === 'vwap' && typeof V152UI !== 'undefined') { V152UI.cfg().anchor = t; saveState(); chart.invalidate(); toast('⚓ VWAP anchored at ' + esc(new Date(t * 1000).toLocaleString()), 'acc'); }
    else if (a === 'replay' && typeof Replay !== 'undefined') { const t0 = t; await Replay.enter(); if (!Replay.on) return; const i = Replay.data.findIndex((c) => c.t >= t0); Replay.jump(i < 0 ? Replay.data.length - 1 : i); toast('⏪ Replay starts at ' + esc(new Date(t0 * 1000).toLocaleString()) + ': Space plays, → steps', 'acc'); }
    else if (a === 'explain') explain(t);
    else if (a === 'measure') mToggle();
    else if (a === 'reset') { chart.view = { bars: 110, off: 0 }; chart.invalidate(); }
    else if (a === 'copy') { const s = String(+p.toPrecision(10)); try { navigator.clipboard.writeText(s).then(() => toast('Copied ' + esc(s), 'acc'), () => toast('Clipboard blocked', 'amb')); } catch (e) { toast('Clipboard unavailable', 'amb'); } U.copied = s; }
  };
  const explain = (t) => {
    const D = (chart.L && chart.L.D) || chart.data, i = D.findIndex((c) => c.t >= t); if (i < 0 || typeof V154 === 'undefined') return;
    const sec = chart.tfSec || 60, n = Math.max(2, Math.ceil(60 / sec)), win = D.slice(Math.max(0, i - n + 1), i + 1), vm = D.slice(Math.max(0, i - 40), i).reduce((s, c) => s + c.v, 0) / 40 || 1;
    const f = V154.forensic(win, { imbalance: null, rvol: win[win.length - 1].v / vm }, []); if (!f) return;
    const q = `Explain why ${baseOf(ST.sel)} moved ${f.move}% around ${new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC. Local forensics: range ${f.range}%, wick ratio ${f.wick}; signals: ${f.why.join('; ')}.`;
    const ov = typeof p2modal === 'function' ? p2modal('Explain Price Move Here (AI Forensics)', `<div class="v161-fx"><span>Move <b class="${f.move >= 0 ? 'up' : 'dn'}">${esc(f.move + '%')}</b></span><span>Range <b>${esc(f.range + '%')}</b></span><span>Wick ratio <b>${esc(f.wick)}</b></span></div><ul>${f.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul><div class="row v151-row"><button type="button" class="btn sm pri" data-fx="ask">Ask the 3-Agent Copilot</button></div>`, 'v161Fx') : null;
    if (ov) ov.addEventListener('click', (ev) => { if (!ev.target.closest('[data-fx]')) return; ov.remove(); try { if (typeof Grok !== 'undefined' && Grok.toCopilot) Grok.toCopilot({ text: q }); else { showTab('ai'); const inp = $1('#chatIn'); if (inp) { inp.value = q; $1('#chatForm').requestSubmit(); } } } catch (er) { showTab('ai'); } });
    return f;
  };

  /* ══ chart wiring ══ */
  const attach = () => {
    if (typeof chart === 'undefined' || !chart || !chart.cv) return; proto(); ensureOv();
    if (!chart.overlays.includes(chartHook)) chart.overlays.push(chartHook);
    const host = chart.host;
    /* on the host, bubble phase on purpose: covers the canvas and the floating + button; the v15.4 TP-rung menu (capture on
       the canvas) runs first and claims rung clicks via preventDefault; inputs inside the bracket box keep the native menu */
    if (!host._v161) {
      host._v161 = true;
      host.addEventListener('contextmenu', (e) => {
        if (e.target.closest('input, textarea, select, .ct-box, .ct-menu')) return;
        const claimed = e.defaultPrevented; e.preventDefault(); if (claimed) return;
        const { x, y } = loc(e), L = chart.L; if (!inPlot(L, x, y)) return; const pt = chart.toTP(x, y); if (!pt || !(pt.p > 0)) return;
        if (typeof ChartTrade !== 'undefined' && ChartTrade.menuClose) ChartTrade.menuClose();
        menuOpen(e.clientX, e.clientY, pt.p, pt.t);
      });
    }
    const cv = chart.cv; if (cv._v161) return; cv._v161 = true;
    /* measure gestures are captured on the host (capture phase runs before every canvas listener), so Shift + drag always
       measures, even over an order line, and never pans the chart */
    if (!host._v161m) {
      host._v161m = true;
      host.addEventListener('pointerdown', (e) => {
        if (e.target !== chart.cv || e.button !== 0 || chart.tool || !(e.shiftKey || U.mOn)) return; const { x, y } = loc(e); if (!inPlot(chart.L, x, y)) return;
        if (!mStart(x, y)) return; e.stopPropagation(); e.preventDefault(); try { chart.cv.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ }
      }, true);
      host.addEventListener('pointermove', (e) => { if (!U.drag) return; const { x, y } = loc(e); mMove(x, y); e.stopPropagation(); }, true);
      const up = (e) => { if (!U.drag) return; U.drag = false; if (e) e.stopPropagation(); if (U.m && U.m.t0 === U.m.t1 && U.m.p0 === U.m.p1) mClear(); };
      host.addEventListener('pointerup', up, true); host.addEventListener('pointercancel', up, true);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawOv()).observe(host);
    }
  };
  const toolbar = () => {
    const anchor = $1('#drawBtns'); if (!anchor || $1('#v161MBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'v161MBtn'; b.className = 'btn sm v161-mbtn'; b.title = 'Measure Dragger: drag across the chart (or hold Shift and drag) for Δ$, %, bars, time and volume. Esc clears.'; b.setAttribute('aria-label', 'Measure Dragger'); b.setAttribute('aria-pressed', 'false');
    b.innerHTML = ICON.measure + '<span>Measure</span>'; b.addEventListener('click', () => mToggle()); anchor.after(b);
  };
  const onKey = (e) => { if (e.key === 'Escape' && (U.m || U.mOn) && !U.menu && !document.querySelector('.v13-modal')) { mClear(); if (U.mOn) mToggle(false); } };

  /* ══ 8. journal discipline attribution ══ */
  const saveDisc = () => { try { localStorage.setItem(DKEY, JSON.stringify(U.disc)); } catch (e) { /* session only */ } };
  const loadDisc = () => { try { const o = JSON.parse(localStorage.getItem(DKEY) || 'null'); if (o && typeof o === 'object') U.disc = { plans: o.plans && typeof o.plans === 'object' ? o.plans : {}, rows: Array.isArray(o.rows) ? o.rows.filter((r) => r && Number.isFinite(r.pnl)).slice(-1000) : [] }; } catch (e) { /* fresh */ } };
  const maxRisk = () => { const c = typeof V160UI !== 'undefined' && V160UI.st && V160UI.st.caps; return c && +c.riskPct > 0 ? +c.riskPct : 2; };
  const onTrade = (t, acct) => {
    if (!t || t.src === 'backtest' || typeof ACC === 'undefined' || acct !== ACC) return;
    const P = U.disc.plans, p = ACC.pos[t.sym];
    if (t.side === 'buy') {
      const eq = (() => { try { return ACC.equity(priceMap()); } catch (e) { return 0; } })(), cur = P[t.sym];
      if (cur && p) { cur.usd += t.usd; cur.entry = p.cost / p.qty; }
      else P[t.sym] = { entry: p ? p.cost / p.qty : t.price, sl0: p && p.sl > 0 ? p.sl : null, tp0: p && p.tp > 0 ? p.tp : null, usd: t.usd, eq, ts: t.ts, wider: false };
    } else if (t.side === 'sell' && Number.isFinite(t.pnl)) {
      const plan = P[t.sym], tags = V161.tagTrade(plan, t, { maxRiskPct: maxRisk() });
      U.disc.rows.push({ id: t.id, sym: t.sym, ts: t.ts, pnl: +t.pnl.toFixed(2), tags }); if (U.disc.rows.length > 1000) U.disc.rows.splice(0, U.disc.rows.length - 1000);
      if (!ACC.pos[t.sym]) delete P[t.sym];
    }
    saveDisc(); paintDisc();
  };
  /* a stop moved further from entry than planned (or removed) marks the open trade as "Moved Stop Wider" */
  const watchStops = () => {
    if (typeof ACC === 'undefined') return; let ch = false;
    for (const [sym, pl] of Object.entries(U.disc.plans)) { const p = ACC.pos[sym]; if (!p || !(p.qty > 0)) { delete U.disc.plans[sym]; ch = true; continue; } if (pl.wider || !(pl.sl0 > 0)) continue; if (!(p.sl > 0) || p.sl < pl.sl0 * (1 - 1e-9)) { pl.wider = true; ch = true; } }
    if (ch) saveDisc();
  };
  const wireTrades = () => { if (typeof NT === 'undefined' || (NT.onTrade && NT.onTrade._v161)) return; const o = NT.onTrade; NT.onTrade = function (t, a) { if (o) o.apply(this, arguments); try { onTrade(t, a); } catch (e) { console.warn('v161 journal', e); } }; NT.onTrade._v161 = true; if (o && o._v160) NT.onTrade._v160 = true; }; // keep the v16.0 router's flag so it never wraps twice
  const usd = (v) => (v >= 0 ? '+' : '−') + NT.fmtUSD(Math.abs(v));
  const paintDisc = () => {
    const host = $1('#jnHost'); if (!host) return; let el = $1('#v161Disc');
    if (!el) { el = document.createElement('section'); el.id = 'v161Disc'; el.className = 'panel v161-disc'; el.setAttribute('aria-label', 'Discipline attribution'); }
    if (el.parentNode !== host) host.prepend(el);
    const A = V161.attribution(U.disc.rows), k = JSON.stringify(A); if (el._k === k) return; el._k = k;
    el.innerHTML = `<div class="ph"><span>🎯 Discipline Attribution</span><span class="sp"></span><span class="note">auto-tagged on every close</span></div><div class="pb">
      <div class="v161-dk"><div class="v161-kp up"><span>Disciplined trades · net $</span><b class="num" data-v161d="plan">${esc(usd(A.disciplined))}</b><i class="num">${esc(A.nDisciplined)} trades</i></div><div class="v161-kp dn"><span>Rule violations · net $</span><b class="num" data-v161d="viol">${esc(usd(A.violations))}</b><i class="num">${esc(A.nViolations)} trades</i></div></div>
      <table class="v161-dt"><thead><tr><th>Tag</th><th class="r">Trades</th><th class="r">Net $</th></tr></thead><tbody>${V161.TAGS.map((t) => `<tr><td><span class="v161-tag ${t === 'Followed Plan' ? 'ok' : 'bad'}">${esc(t)}</span></td><td class="r num">${esc(A.byTag[t].n)}</td><td class="r num ${A.byTag[t].usd >= 0 ? 'up' : 'dn'}">${esc(usd(A.byTag[t].usd))}</td></tr>`).join('')}</tbody></table>
      <p class="note">Followed Plan: stop kept, risk within ${esc(maxRisk())}% of equity, no early manual exit. Moved Stop Wider: the stop was moved further from entry or removed. Over-Size Risk: no stop, or risk above the cap. Early Exit: closed by hand below half of the planned reward.</p></div>`;
  };

  U.start = () => {
    loadDisc(); proto();
    document.addEventListener('keydown', onKey);
    const tick = () => { attach(); toolbar(); wireTrades(); };
    tick(); setInterval(tick, 500); setInterval(watchStops, 1000); setInterval(paintDisc, 3000);
  };
  U.ready = () => typeof chart !== 'undefined' && !!chart && !!chart.cv._v161 && !!chart.host._v161 && chart.overlays.includes(chartHook) && !!U.ov && U.ov.parentNode === chart.host;
  Object.assign(U, { menuOpen, menuClose, act, mToggle, mStart, mMove, mClear, drawOv, syncTicket, explain, paintDisc, onTrade, attach });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b161 = boot; boot = async function () { await _b161.apply(this, arguments); try { V161UI.start(); } catch (e) { console.warn('v161 init', e); } }; }
