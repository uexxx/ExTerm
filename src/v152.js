/* ExTerm v15.2 UI: the 44 workstation upgrades behind progressive disclosure. The default screen only gains a 🌐 pill,
   a 🧭 Workstation button and a subtle bar-timer ring; everything else lives in collapsed drawer sections (rendered when
   opened), Ctrl+K commands, H (HUD clean mode) and opt-in chart overlays. Pure logic is in v152core.js (V152).
   Security: every external string reaches the DOM through esc() / textContent, listeners are attached in JS (strict CSP,
   no inline handlers), formulas and maths are parsed (never eval'd), share codes are signature-checked and whitelisted,
   chart snapshots go only to the launcher's Telegram / Discord notifier. */
const V152UI = (() => {
  const U = { ctrl: false, flow: new Map(), lat: [], shadow: [], ladder: null, pick: null, range: null, cross: null, walls: [], book0: null, traded: {}, cache: {}, frames: 0, fps: 0, lastSwapMs: null, tele: null, conf: [], buys: [] };
  const TF_OK = /^(1s|5s|15s|1m|5m|15m|1h|4h|1d)$/;
  const cfg = () => {
    const c = ST.v152 && typeof ST.v152 === 'object' ? ST.v152 : (ST.v152 = {});
    c.timer = c.timer !== false; for (const k of ['magnet', 'events']) c[k] = c[k] !== false;
    for (const k of ['pip', 'walls', 'cvdDiv', 'gamma', 'sparks', 'cro', 'autoBrief', 'shadow', 'dexStrip']) c[k] = !!c[k];
    c.labels = Object.assign({ fvg: false, eng: false, ob: false, sweep: false }, c.labels || {});
    c.sess = Object.assign({ asia: false, london: false, ny: false }, c.sess || {});
    c.sync = Object.assign({ cross: true, tf: true, sym: false }, c.sync || {}); if (!V152.GROUPS.includes(c.group)) c.group = null;
    c.pipTf = ['15m', '1h'].includes(c.pipTf) ? c.pipTf : '15m'; c.fee = V152.FEES[c.fee] ? c.fee : 'normal';
    c.splits = Array.isArray(c.splits) && c.splits.length === 3 && c.splits.every((x) => +x >= 0 && +x <= 100) ? c.splits.map(Number) : [50, 30, 20];
    c.mem = c.mem && typeof c.mem === 'object' ? c.mem : {}; c.notes = c.notes && typeof c.notes === 'object' ? c.notes : {};
    c.scanners = Array.isArray(c.scanners) ? c.scanners.filter((s) => s && typeof s.name === 'string' && typeof s.f === 'string').slice(0, 12) : [];
    c.userEv = Array.isArray(c.userEv) ? c.userEv.filter((e) => e && isFinite(e.t)).slice(-30) : [];
    c.tokens = V152.cleanTokens(c.tokens); if (c.anchor != null && !isFinite(c.anchor)) c.anchor = null;
    return c;
  };
  const save = () => { cfg(); saveState(); };
  const inv = () => { if (typeof chart !== 'undefined' && chart) chart.invalidate(); };
  const fp = (p) => (p == null || !isFinite(p) ? '–' : p < 0.01 ? NT.fmtTiny(p) : NT.fmtPrice(p));
  const candles = () => { try { const st = getStore(ST.sel, ST.tf); return st && st.candles && st.candles.length ? st.candles : (typeof chart !== 'undefined' && chart ? chart.data : []); } catch (e) { return []; } };
  const openSym = (sym) => { showTab('markets'); const m = modeOf(sym); if (m !== ST.mode) setMode(m, sym); else if (ST.sel !== sym) selectSym(sym); };
  const stratList = () => Object.entries(NT.strategies).filter(([, S]) => S && !S.liveOnly && typeof S.prepare === 'function').map(([id, S]) => [id, String(S.name || id).replace(/^★ /, '')]).sort((a, b) => a[1].localeCompare(b[1]));
  const stratSel = (id, cur, multi) => `<select class="in" id="${id}" ${multi ? 'multiple size="5"' : ''} aria-label="Strategy">${stratList().map(([k, n]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const kpis = (rows) => `<div class="v151-kpis">${rows.map(([k, v, c]) => `<div><span class="k">${esc(k)}</span><b class="${c || ''}">${esc(v)}</b></div>`).join('')}</div>`;
  const tog = (path, label) => { const [a, b] = path.split('.'), c = cfg(), on = b ? c[a][b] : c[a]; return `<label class="chk"><input type="checkbox" data-c="${esc(path)}" ${on ? 'checked' : ''}> ${esc(label)}</label>`; };
  const svgLine = (series, w = 360, h = 110, cols = ['var(--acc)', 'var(--up)', 'var(--dn)', '#38bdf8']) => {
    const all = series.flatMap((s) => s.filter(isFinite)); if (!all.length) return ''; const lo = Math.min(...all), hi = Math.max(...all), d = hi - lo || 1;
    return `<svg class="v152-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${series.map((s, k) => `<polyline fill="none" stroke="${cols[k % cols.length]}" stroke-width="1.6" points="${s.map((v, i) => `${((i / Math.max(1, s.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / d) * (h - 4) - 2).toFixed(1)}`).join(' ')}"/>`).join('')}</svg>`;
  };
  const busy = (el, txt = 'Running…') => { if (el) el.innerHTML = `<div class="note">${esc(txt)}</div>`; return new Promise((r) => setTimeout(r, 20)); };
  const hist = async (sym, sec, n) => { try { return await History.get(sym, sec, n); } catch (e) { return []; } };

  /* ══ chart overlay ══ */
  const ov = {};
  ov.timer = (g, L, ch) => {
    if (!cfg().timer || !(ch.tfSec > 0) || !L.D.length) return; const T = V152.barTimer(Date.now(), ch.tfSec); if (!T) return;
    const y = L.py(L.D[L.D.length - 1].c), x = L.W - L.Rm - 14; if (!(y > L.y0 && y < L.y0 + L.mainH)) return;
    g.save(); g.lineWidth = 2; g.strokeStyle = L.col.fg; g.globalAlpha = 0.18; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.9; g.strokeStyle = T.left < 3000 ? L.col.amb : L.col.acc; g.beginPath(); g.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + T.frac * Math.PI * 2); g.stroke();
    g.font = '600 9px JetBrains Mono, monospace'; g.fillStyle = L.col.fg; g.globalAlpha = 0.75; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(T.label, x - 11, y); g.restore();
  };
  ov.ladder = (g, L, ch) => {
    const Ld = U.ladder; if (!Ld || Ld.sym !== ST.sel) return;
    g.save(); g.font = '700 10px Inter, system-ui, sans-serif'; g.textBaseline = 'bottom';
    for (const x of Ld.L.levels) { const y = L.py(x.p); if (!(y > L.y0 && y < L.y0 + L.mainH)) continue; g.strokeStyle = L.col.up; g.globalAlpha = x.hit ? 0.3 : 0.85; g.setLineDash([6, 3]); g.beginPath(); g.moveTo(L.Lm, y); g.lineTo(L.W - L.Rm, y); g.stroke(); g.setLineDash([]); g.fillStyle = L.col.up; g.fillText(`${x.k} ${x.pct}%${x.hit ? ' ✓' : ' ⇕'}`, L.Lm + (L.W - L.Rm - L.Lm) * 0.58, y - 2); }
    const ys = L.py(Ld.L.sl); if (ys > L.y0 && ys < L.y0 + L.mainH) { g.strokeStyle = Ld.L.be ? L.col.acc : L.col.dn; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(L.Lm, ys); g.lineTo(L.W - L.Rm, ys); g.stroke(); g.fillStyle = g.strokeStyle; g.fillText(Ld.L.be ? 'SL → break-even' : 'SL', L.Lm + (L.W - L.Rm - L.Lm) * 0.58, ys - 2); }
    g.restore();
  };
  ov.labels = (g, L) => {
    const on = cfg().labels; if (!on.fvg && !on.eng && !on.ob && !on.sweep) return;
    const D = L.D, key = 'pat|' + ST.sel + '|' + L.start + '|' + L.end + '|' + D.length + '|' + (D[D.length - 1] || {}).c + JSON.stringify(on);
    if (U.cache.patKey !== key) { U.cache.patKey = key; const all = V152.patterns(D, L.start, L.end, on), per = {}; U.cache.pat = all.reverse().filter((p) => (per[p.kind] = (per[p.kind] || 0) + 1) <= 8).reverse(); } /* newest 8 per kind: subtle, not wallpaper */
    g.save(); g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (const p of U.cache.pat) {
      const x = L.kx(p.i), c = p.dir === 'bull' ? L.col.up : L.col.dn;
      if (p.top != null) { const y1 = L.py(p.top), y2 = L.py(p.bot); g.fillStyle = c; g.globalAlpha = p.kind === 'OB' ? 0.1 : 0.08; g.fillRect(x, y1, L.W - L.Rm - x, y2 - y1); g.globalAlpha = 0.7; g.textBaseline = 'bottom'; g.fillText(p.kind, x + 10, y1 - 1); }
      else { const y = L.py(p.p) + (p.dir === 'bull' ? 11 : -4); g.fillStyle = c; g.globalAlpha = 0.75; g.textBaseline = 'middle'; g.fillText(p.kind === 'ENG' ? 'E' : 'SW', x, y); }
    }
    g.restore();
  };
  U.eventList = () => { const now = Date.now(); if (U._ev && now - U._ev.ts < 1000 && U._ev.n === cfg().userEv.length) return U._ev.v.map((e) => Object.assign({}, e, { inSec: e.t - now / 1000 })); const ev = (typeof P5 !== 'undefined' ? P5.events({}) : []).concat(cfg().userEv), v = V152.futureEvents(now / 1000, ev, 21 * 86400); U._ev = { ts: now, n: cfg().userEv.length, v }; return v; }; // cached 1 s: the overlay asks every frame
  ov.events = (g, L, ch) => {
    if (!cfg().events) return; const evs = U.eventList(); if (!evs.length) return;
    const top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, right = L.W - L.Rm; let stack = 0;
    g.save(); g.font = '700 9px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const e of evs) {
      const x = ch.tToX(e.t), c = e.k === 'fomc' ? L.col.amb : e.k === 'cpi' ? '#f472b6' : '#38bdf8', lbl = (e.k === 'fomc' ? 'FOMC' : e.k === 'cpi' ? 'CPI' : e.k === 'earn' ? 'ER' : 'EV') + ' ' + V151.fmtDur(e.inSec);
      g.fillStyle = c; g.strokeStyle = c;
      if (x <= right) { g.globalAlpha = 0.6; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x, top + 14); g.lineTo(x, bot); g.stroke(); g.setLineDash([]); g.globalAlpha = 0.95; g.textAlign = 'center'; g.fillText(lbl, x, bot - 8); }
      else if (stack < 4) { g.globalAlpha = 0.9; g.textAlign = 'right'; g.fillText('→ ' + lbl, right - 30, top + 26 + 12 * stack++); }
    }
    g.restore();
  };
  ov.avwap = (g, L) => {
    const a = cfg().anchor; if (a == null) return; const D = L.D; let i0 = D.findIndex((c) => c.t >= a); if (i0 < 0) return;
    const key = 'av|' + ST.sel + '|' + a + '|' + D.length + '|' + (D[D.length - 1] || {}).c; if (U.cache.avKey !== key) { U.cache.avKey = key; U.cache.av = V152.avwap(D, i0); }
    const rows = U.cache.av; g.save(); g.lineWidth = 1.3;
    for (const [k, col, a2, dash] of [['vw', L.col.acc, 0.95, []], ['u1', L.col.fg, 0.35, [4, 3]], ['d1', L.col.fg, 0.35, [4, 3]], ['u2', L.col.fg, 0.22, [2, 4]], ['d2', L.col.fg, 0.22, [2, 4]]]) {
      g.strokeStyle = col; g.globalAlpha = a2; g.setLineDash(dash); g.beginPath(); let on = false;
      for (const r of rows) { if (r.i < L.start || r.i >= L.end) continue; const x = L.kx(r.i), y = L.py(r[k]); if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y); }
      g.stroke();
    }
    g.setLineDash([]); g.globalAlpha = 0.9; g.fillStyle = L.col.acc; g.font = '700 9px Inter, system-ui, sans-serif'; const last = rows[rows.length - 1]; if (last) g.fillText('AVWAP', L.W - L.Rm - 70, L.py(last.vw) - 4); g.restore();
  };
  ov.sess = (g, L) => {
    const s = cfg().sess; if (!s.asia && !s.london && !s.ny) return; const D = L.D.slice(L.start, L.end), key = 'sp|' + ST.sel + '|' + L.start + '|' + L.end + '|' + (D[D.length - 1] || {}).c;
    if (U.cache.spKey !== key) { U.cache.spKey = key; U.cache.sp = V152.sessionProfiles(D, 32); }
    const cols = { asia: '#a78bfa', london: '#38bdf8', ny: '#f59e0b' }, right = L.W - L.Rm - 4; let off = 0;
    g.save();
    for (const k of ['asia', 'london', 'ny']) {
      const P = U.cache.sp[k]; if (!s[k] || !P) continue; const vmax = Math.max(...P.bins.map((b) => b.v)) || 1;
      g.fillStyle = cols[k]; for (const b of P.bins) { const y1 = L.py(b.p1), y2 = L.py(b.p0), w = (b.v / vmax) * 46; g.globalAlpha = 0.28; g.fillRect(right - off - w, y1, w, Math.max(1, y2 - y1 - 1)); }
      g.globalAlpha = 0.9; g.fillRect(right - off - 46, L.py(P.poc), 46, 1.5); g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(k.toUpperCase(), right - off, L.y0 + 12); off += 52;
    }
    g.restore();
  };
  ov.gamma = (g, L) => {
    if (!cfg().gamma || typeof P5UI === 'undefined') return; const ch = P5UI.chain; if (!ch || ch.sym !== ST.sel) return;
    if (U.cache.gKey !== ch) { const T = Math.max(1 / 365, (ch.exp - Date.now() / 1000) / 31557600), gx = P5.gex(ch, ch.spot, T); U.cache.gKey = ch; U.cache.g = { flip: gx.flip, call: gx.callWall, put: gx.putWall, zero: V152.zeroGamma(ch, ch.spot, T, P5.gex) }; }
    const G = U.cache.g; g.save(); g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'right';
    for (const [k, p, c] of [['Zero γ', G.zero, '#e879f9'], ['γ flip', G.flip, '#c084fc'], ['Call wall', G.call, L.col.up], ['Put wall', G.put, L.col.dn]]) { if (!(p > 0)) continue; const y = L.py(p); if (!(y > L.y0 && y < L.y0 + L.mainH)) continue; g.strokeStyle = c; g.fillStyle = c; g.globalAlpha = 0.7; g.setLineDash([8, 4]); g.beginPath(); g.moveTo(L.Lm, y); g.lineTo(L.W - L.Rm, y); g.stroke(); g.setLineDash([]); g.fillText(k + ' ' + fp(p), L.W - L.Rm - 4, y - 3); }
    g.restore();
  };
  ov.cvd = (g, L) => {
    if (!cfg().cvdDiv) return; const D = L.D, key = 'cv|' + ST.sel + '|' + D.length + '|' + (D[D.length - 1] || {}).c; if (U.cache.cvKey !== key) { U.cache.cvKey = key; U.cache.cv = V152.cvdDiv(D.slice(-400), 3).map((x) => Object.assign(x, { i: x.i + Math.max(0, D.length - 400) })); }
    g.save(); g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (const d of U.cache.cv) { if (d.i < L.start || d.i >= L.end) continue; const x = L.kx(d.i), y = L.py(d.p) + (d.dir === 'bull' ? 14 : -8); g.fillStyle = d.dir === 'bull' ? L.col.up : L.col.dn; g.globalAlpha = 0.85; g.fillText('CVD÷', x, y); }
    g.restore();
  };
  ov.misc = (g, L, ch) => {
    const top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4; g.save();
    if (U.range && U.range.sym === ST.sel && U.range.t1 != null) { const x1 = ch.tToX(U.range.t0), x2 = ch.tToX(U.range.t1); g.fillStyle = L.col.acc; g.globalAlpha = 0.1; g.fillRect(Math.min(x1, x2), top, Math.abs(x2 - x1) + L.bw, bot - top); }
    if (U.cross != null && cfg().group) { const x = ch.tToX(U.cross); if (x >= L.Lm && x <= L.W - L.Rm) { g.strokeStyle = L.col.acc; g.globalAlpha = 0.6; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); g.setLineDash([]); } }
    if (cfg().walls && U.walls.length && U.book0 && U.book0.sym === ST.sel) for (const w of U.walls) { const y = L.py(w.p); if (!(y > top && y < bot)) continue; g.strokeStyle = w.ev === 'spoof' ? L.col.amb : w.side === 'bids' ? L.col.up : L.col.dn; g.globalAlpha = 0.55; g.lineWidth = 3; g.beginPath(); g.moveTo(L.W - L.Rm - 40, y); g.lineTo(L.W - L.Rm, y); g.stroke(); }
    g.restore();
  };
  U.overlay = (g, L, ch) => { if (typeof chart === 'undefined' || ch !== chart || !L.py || !L.D || !L.D.length) return; for (const k of ['labels', 'sess', 'avwap', 'gamma', 'cvd', 'events', 'ladder', 'misc', 'timer']) { g.save(); try { ov[k](g, L, ch); } catch (e) { /* an overlay must never break the chart */ } g.restore(); } };

  /* ══ chart pointer hooks: TP-ladder drag, AVWAP anchor pick, range pick; magnet snap via toTP ══ */
  const ptHook = (cv) => {
    if (cv._v152) return; cv._v152 = true;
    cv.addEventListener('pointerdown', (e) => {
      const L = chart.L; if (!L || !L.D) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, pt = chart.toTP(x, y);
      if (U.pick && pt) { e.stopImmediatePropagation(); e.preventDefault(); const mode = U.pick; U.pick = null; cv.style.cursor = '';
        if (mode === 'avwap') { cfg().anchor = pt.t; save(); toast('⚓ AVWAP anchored at ' + esc(fmtStamp(pt.t * 1000))); }
        else if (mode === 'range0') { U.range = { sym: ST.sel, t0: pt.t, t1: null }; U.pick = 'range1'; cv.style.cursor = 'crosshair'; toast('Now click the last candle of the range'); }
        else if (mode === 'range1' && U.range) { U.range.t1 = pt.t; drawerRefresh('copilot'); toast('Range selected: open 🧭 → Copilot to ask about it'); }
        inv(); return; }
      if (U.ladder && U.ladder.sym === ST.sel) { const lv = U.ladder.L.levels.find((v) => !v.hit && Math.abs(L.py(v.p) - y) < 6); if (lv) { e.stopImmediatePropagation(); e.preventDefault(); U.drag = lv; try { cv.setPointerCapture(e.pointerId); } catch (x2) { /* old browser */ } } }
    }, true);
    cv.addEventListener('pointermove', (e) => { if (!U.drag) return; const r = cv.getBoundingClientRect(), pt = chart.toTP(e.clientX - r.left, e.clientY - r.top); if (pt && pt.p > 0) { const L0 = U.ladder && U.ladder.L; U.drag.p = L0 ? (L0.long ? Math.max(pt.p, L0.entry * 1.0005) : Math.min(pt.p, L0.entry * 0.9995)) : pt.p; inv(); } e.stopImmediatePropagation(); }, true);
    for (const ev of ['pointercancel', 'lostpointercapture']) cv.addEventListener(ev, () => { U.drag = null; }, true);
    cv.addEventListener('pointerup', (e) => { if (U.drag) { U.drag = null; e.stopImmediatePropagation(); } }, true);
    const base = Object.getPrototypeOf(chart).toTP;
    chart.toTP = function (x, y) { const p = base.call(this, x, y); if (p && U.ctrl && cfg().magnet && this.L && this.L.D) { const c = this.L.D.find((k) => k.t === p.t); if (c) p.p = V152.snap(p.p, c, (this.L.hi - this.L.lo) * 0.04); } return p; };
  };
  U.attachLadder = () => {
    const d = typeof ChartTrade !== 'undefined' && ChartTrade.draft && ChartTrade.draft.sym === ST.sel ? ChartTrade.draft : null, pos = ACC.pos && ACC.pos[ST.sel], D = candles();
    let entry = d ? d.entry : pos ? pos.cost / pos.qty : px(ST.sel), sl = d && d.sl > 0 ? d.sl : pos && pos.sl > 0 ? pos.sl : null;
    if (!(entry > 0)) { toast('No price yet', 'amb'); return; }
    if (!sl) { const a = V152.seriesOf(D.slice(-60), 'atr14').pop() || entry * 0.01; sl = entry - 1.5 * a; }
    const L = V152.tpLadder(entry, sl, cfg().splits); if (!L) { toast('Entry and stop must differ', 'amb'); return; }
    U.ladder = { sym: ST.sel, L, qty0: pos ? pos.qty : 0 }; inv(); toast('🎯 TP ladder on the chart: drag TP1–TP3; the stop moves to break-even after TP1 fills.', 'acc', 6000); drawerRefresh('ladder');
  };
  const ladderTick = (sym, p) => {
    const Ld = U.ladder; if (!Ld || Ld.sym !== sym || !(p > 0)) return;
    const pos = ACC.pos && ACC.pos[sym]; if (!pos) return; // a ladder on a draft waits for the fill
    if (!Ld.qty0 && !Ld.L.levels.some((x) => x.hit)) Ld.qty0 = pos.qty; // splits are % of the size at the first tick in position
    const r = V152.tpStep(Ld.L, p); if (!r.events.length) return;
    const all = r.done || /stopped/.test(r.events[0]);
    if (r.closePct > 0) { try { const q = all ? null : Math.min(pos.qty, Ld.qty0 * (r.closePct / 100)); ACC.sell(sym, p, q != null && q >= pos.qty * 0.999 ? null : q, Date.now(), { reason: 'TP ladder', src: 'manual' }); } catch (e) { console.warn('ladder', e); } }
    if (pos && Ld.L.be && ACC.pos[sym]) ACC.pos[sym].sl = Ld.L.entry;
    toast('🎯 ' + esc(baseOf(sym)) + ': ' + esc(r.events.join(' · ')), 'acc'); if (r.done) U.ladder = null; inv();
  };

  /* ══ PiP mini chart, sync badge, HUD clean mode, DEX safety strip ══ */
  const pip = () => {
    const host = $('#chartHost'); if (!host) return; let el = $('#v152Pip'); const show = cfg().pip && typeof chart !== 'undefined' && chart && chart.tfSec > 0 && chart.tfSec < 60;
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'v152Pip'; el.className = 'v152-pip'; el.innerHTML = '<button type="button" class="v152-piph" aria-expanded="true"></button><canvas width="220" height="110" aria-label="Higher timeframe mini chart"></canvas>'; host.appendChild(el); el.querySelector('button').addEventListener('click', () => { el.classList.toggle('min'); el.querySelector('button').setAttribute('aria-expanded', String(!el.classList.contains('min'))); }); }
    el.querySelector('button').textContent = '▣ ' + baseOf(ST.sel) + ' · ' + cfg().pipTf;
    const st = getStore(ST.sel, cfg().pipTf); if (!st.loaded) { if (!st.loading) st.load(200); return; }
    const D = st.candles.slice(-60), cv = el.querySelector('canvas'), g = cv.getContext('2d'); if (!D.length) return;
    const lo = Math.min(...D.map((c) => c.l)), hi = Math.max(...D.map((c) => c.h)), y = (p) => 104 - ((p - lo) / (hi - lo || 1)) * 98, w = 220 / D.length;
    g.clearRect(0, 0, 220, 110); D.forEach((c, i) => { const col = c.c >= c.o ? cssv('--up', '#2fd08a') : cssv('--dn', '#ff5470'); g.strokeStyle = col; g.fillStyle = col; const x = i * w + w / 2; g.beginPath(); g.moveTo(x, y(c.h)); g.lineTo(x, y(c.l)); g.stroke(); g.fillRect(x - w * 0.3, Math.min(y(c.o), y(c.c)), Math.max(1, w * 0.6), Math.max(1, Math.abs(y(c.o) - y(c.c)))); });
  };
  const syncBadge = () => {
    const host = $('#chartHost'); if (!host) return; let b = $('#v152Sync'); const g = cfg().group;
    if (!g) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'v152Sync'; b.className = 'v152-sync'; host.appendChild(b); b.addEventListener('click', () => { const c = cfg(), i = V152.GROUPS.indexOf(c.group); c.group = V152.GROUPS[(i + 1) % 3]; save(); syncBadge(); }); }
    b.textContent = '🔗 Group ' + g; b.title = 'Synced with other ExTerm windows in group ' + g + ' (click to cycle A → B → C)'; b.dataset.g = g;
  };
  let bc = null; const chan = () => { if (!bc && typeof BroadcastChannel !== 'undefined') { bc = new BroadcastChannel('exterm-v152'); bc.onmessage = (e) => onSync(e.data); } return bc; };
  const post = (kind, v) => { const c = cfg(); if (!c.group || U.applying) return; const ch = chan(); if (ch) ch.postMessage({ k: 'v152sync', g: c.group, kind, v }); };
  const onSync = (m) => {
    const c = cfg(), a = V152.syncAccept(m, c.group, c.sync); if (!a) return;
    U.applying = true; try { if (a.kind === 'cross') { U.cross = a.v; inv(); } else if (a.kind === 'tf') { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === a.v); if (b && ST.tf !== a.v) b.click(); } else if (a.kind === 'sym' && ST.sel !== a.v && (isStock(a.v) || isOnchain(a.v) || (Providers.ids && Providers.ids.has(a.v)))) openSym(a.v); } finally { U.last = { sel: ST.sel, tf: ST.tf }; U.applying = false; }
  };
  U.hud = (on) => {
    const v = on == null ? !document.body.classList.contains('hud-clean') : !!on; document.body.classList.toggle('hud-clean', v);
    let m = $('#hudMark'); if (v && !m && $('#chartHost')) { m = document.createElement('div'); m.id = 'hudMark'; m.className = 'hud-mark'; m.innerHTML = V151.markSvg(20, 'hud') + '<span>Candle X</span>'; $('#chartHost').appendChild(m); } if (!v && m) m.remove();
    setTimeout(() => { window.dispatchEvent(new Event('resize')); inv(); }, 30); return v;
  };
  const dexStrip = () => {
    const host = $('#chartHost'); if (!host) return; let el = $('#v152Dex'); const sym = ST.sel;
    if (!cfg().dexStrip || !isOnchain(sym)) { if (el) el.remove(); return; }
    const m = (OC.meta && OC.meta[sym]) || {}, p = OC.parse(sym) || {}, r = m.ca ? Safety.cache[p.chain + ':' + m.ca] : null;
    if (m.ca && p.chain && p.chain !== 'sim' && !r && !(U.scanned || (U.scanned = new Set())).has(m.ca)) { U.scanned.add(m.ca); Safety.scan(m.ca, p.chain).then(dexStrip, () => {}); }
    const st = (id) => (r ? (r.checks.find((c) => c.id === id) || {}).status : undefined), hol = r ? r.checks.find((c) => c.id === 'holders') : null;
    const S = V152.dexSafety({ mintAuth: st('mint') === 'pass' ? null : st('mint') === 'fail' ? 'set' : undefined, freezeAuth: st('freeze') === 'pass' ? null : st('freeze') === 'fail' ? 'set' : undefined, top10: hol && isFinite(hol.top10) ? hol.top10 : undefined, lpLocked: st('lp') === 'pass' ? 100 : st('lp') === 'fail' ? 0 : undefined });
    if (!el) { el = document.createElement('div'); el.id = 'v152Dex'; el.className = 'v152-dex'; host.appendChild(el); }
    el.innerHTML = S.badges.map((b) => `<span class="v152-b ${b.unk ? 'unk' : b.ok ? 'ok' : 'bad'}" title="${esc(b.label)}">${b.unk ? '?' : b.ok ? '✓' : '✕'} ${esc(b.label)}</span>`).join('') + `<span class="v152-b ${S.verdict}">${esc(S.verdict)}</span>`;
  };

  /* ══ order flow: book polling for walls, trade ring for net inflow + latency ══ */
  const pollWalls = async () => {
    if (!cfg().walls || isOnchain(ST.sel) || isStock(ST.sel) || document.hidden || U.wBusy) return; U.wBusy = true;
    try { const b = Object.assign(await Providers.active.book(ST.sel), { sym: ST.sel }); if (U.book0 && U.book0.sym === b.sym) { const ev = V152.wallEvents(U.book0, b, U.traded, 4); if (ev.length) { U.walls = ev; for (const w of ev) if (w.ev === 'spoof' || w.ev === 'iceberg') V151UI.badge(b.sym, 'signal', `${w.ev === 'spoof' ? '👻 spoof' : '🧊 iceberg'} ${w.side === 'bids' ? 'bid' : 'ask'} ${fp(w.p)}`); } } U.book0 = b; U.traded = {}; drawerRefresh('walls', true); inv(); }
    catch (e) { U.wErr = e.message; } finally { U.wBusy = false; }
  };
  const onTrade = (sym, p, q, side, ts) => {
    const a = U.flow.get(sym) || (U.flow.set(sym, []), U.flow.get(sym)); V151.pushCapped(a, { t: ts, p, q, side, usd: p * q, sym }, 3000);
    const lag = Date.now() - ts * 1000; if (ts > 1e9 && ts < 1e11 && lag >= 0 && lag < 30000) V151.pushCapped(U.lat, lag, 200); /* replayed / simulated ticks with old stamps are not latency */
    if (cfg().walls && U.book0 && sym === U.book0.sym) { const k = p; U.traded[k] = (U.traded[k] || 0) + q; for (const s of ['bids', 'asks']) for (const [bp] of U.book0[s] || []) if (Math.abs(bp - p) / p < 0.0002) U.traded[bp] = (U.traded[bp] || 0) + q; }
    ladderTick(sym, p); if (cfg().shadow && U.flowRules && sym === U.flowRules.sym) shadowTick(sym, p, ts);
  };

  /* ══ drawer ══ */
  const SECTIONS = [
    ['p1', '📈 Chart & execution', [['chart', 'Overlays & labels'], ['ladder', 'Partial take-profit ladder'], ['sync', 'Sync groups & PiP']]],
    ['p2', '🌊 Order flow & options', [['walls', 'Iceberg / spoof walls'], ['avwap', 'Anchored VWAP & session profiles'], ['gamma', '0DTE gamma & unusual options'], ['payoff', 'Multi-leg payoff builder']]],
    ['p3', '🔀 Markets, scanners & DEX', [['swap', 'Market-swap memory'], ['scan', 'Formula scanner'], ['dex', 'DEX safety & fee simulator'], ['smart', 'Smart-money leaderboard'], ['watch', 'Watchlist sparklines & notes']]],
    ['p4', '🧪 Quant lab', [['compose', 'No-code strategy composer'], ['port', 'Portfolio backtester'], ['sens', 'Parameter sensitivity heatmap'], ['gate', 'Fix weak gate (17-test lab)'], ['prop', 'Prop-firm rulebooks'], ['drill', 'Replay speed & blind drill'], ['mfe', 'Journal MFE / MAE'], ['battle', 'Strategy battle']]],
    ['p5', '⚡ Grok, copilot & World', [['copilot', 'Chart-range copilot'], ['cro', "Devil's advocate risk grade"], ['impact', 'World impact tags'], ['card', 'Alert cards (Discord / Telegram)'], ['brief', 'Pre-market brief & EOD recap']]],
    ['p6', '🛡 Platform', [['share', 'Signed .exterm share codes'], ['perf', 'Frame pacing & memory governor'], ['theme', 'Theme token editor'], ['cachem', 'Local data cache'], ['verify', 'Verify build integrity']]],
  ];
  const R = {}; // section renderers → html
  R.chart = () => `<div class="v152-tg">${tog('timer', 'Bar-timer ring')}${tog('magnet', 'Magnet snap (hold Ctrl while drawing)')}${tog('events', 'Future FOMC / CPI / earnings markers')}${tog('cvdDiv', 'CVD divergence markers')}</div>
    <div class="note">Price-action auto-labels (off by default):</div><div class="v152-tg">${tog('labels.fvg', 'Fair value gaps')}${tog('labels.ob', 'Order blocks')}${tog('labels.eng', 'Engulfing')}${tog('labels.sweep', 'Liquidity sweeps')}</div>
    <div class="row v151-row"><input class="in" id="v152Ev" placeholder="Add event: CPI 2026-12-10 13:30" aria-label="Add a future event"><button type="button" class="btn sm" data-a="addEv">Add</button></div>
    <div class="note">${U.eventList().slice(0, 5).map((e) => esc(e.l) + ' · in ' + esc(V151.fmtDur(e.inSec))).join('<br>') || 'No events in the next 3 weeks.'}</div>
    <div class="row v151-row"><button type="button" class="btn sm" data-a="hud">⌧ HUD clean mode (H)</button></div>`;
  R.ladder = () => { const c = cfg(), L = U.ladder; return `<div class="row v151-row">${c.splits.map((v, i) => `<label class="note">TP${i + 1} % <input class="in mono v152-num" data-split="${i}" value="${esc(v)}" inputmode="decimal"></label>`).join('')}</div>
    <div class="row v151-row"><button type="button" class="btn sm pri" data-a="ladder">Attach to bracket / position</button>${L ? '<button type="button" class="btn sm" data-a="ladderOff">Remove</button>' : ''}</div>
    ${L ? `<div class="note">${esc(baseOf(L.sym))}: ${L.L.levels.map((x) => `${x.k} ${fp(x.p)} (${x.pct}%)${x.hit ? ' ✓' : ''}`).map(esc).join(' · ')} · SL ${esc(fp(L.L.sl))}${L.L.be ? ' (break-even)' : ''}</div>` : '<div class="note">TPs at 1R / 2R / 3R from your bracket or open position; drag them on the chart.</div>'}`; };
  R.sync = () => { const c = cfg(); return `<div class="row v151-row"><span class="note">Group</span><div class="seg" id="v152Grp">${['off', ...V152.GROUPS].map((g) => `<button type="button" data-grp="${g}" class="${(c.group || 'off') === g ? 'on' : ''}">${g === 'off' ? 'Off' : g}</button>`).join('')}</div></div>
    <div class="v152-tg">${tog('sync.cross', 'Crosshair')}${tog('sync.tf', 'Timeframe')}${tog('sync.sym', 'Symbol')}</div><div class="note">Pop out a chart (Ctrl+K → Pop out) and give both windows the same group.</div>
    <div class="v152-tg">${tog('pip', 'Picture-in-picture mini chart on 1s / 5s / 15s')}</div><div class="seg" id="v152PipTf">${['15m', '1h'].map((t) => `<button type="button" data-piptf="${t}" class="${c.pipTf === t ? 'on' : ''}">${t}</button>`).join('')}</div>`; };
  R.walls = () => `<div class="v152-tg">${tog('walls', 'Detect iceberg / spoof walls (crypto order books)')}</div>${U.walls.length ? `<table class="v152-t"><tr><th>Side</th><th>Price</th><th>Size</th><th>Event</th></tr>${U.walls.slice(0, 12).map((w) => `<tr><td>${w.side === 'bids' ? 'Bid' : 'Ask'}</td><td class="mono">${esc(fp(w.p))}</td><td class="mono">${esc(NT.fmtCompact(w.q))}</td><td class="${w.ev === 'spoof' ? 'dn' : 'up'}">${esc(w.ev)} · ${esc(w.note)}</td></tr>`).join('')}</table>` : `<div class="note">${cfg().walls ? (U.wErr ? 'Book unavailable: ' + esc(U.wErr) : 'Watching the book every 2 s…') : 'Walls ≥ 4× the median level size that absorb market orders or get pulled.'}</div>`}`;
  R.avwap = () => { const c = cfg(); return `<div class="row v151-row"><button type="button" class="btn sm pri" data-a="pickAv">⚓ Click a candle to anchor</button><button type="button" class="btn sm" data-a="avMacro">Anchor to latest ⚠️ MACRO pin</button>${c.anchor != null ? '<button type="button" class="btn sm" data-a="avOff">Clear</button>' : ''}</div>
    <div class="note">${c.anchor != null ? 'Anchored at ' + esc(fmtStamp(c.anchor * 1000)) + ' with ±1σ / ±2σ bands.' : 'Volume-weighted from any swing candle.'}</div><div class="note">Session volume profiles (UTC: Asia 00–07, London 07–13, NY 13–21):</div><div class="v152-tg">${tog('sess.asia', 'Asia')}${tog('sess.london', 'London')}${tog('sess.ny', 'New York')}</div>`; };
  R.gamma = () => {
    const ch = typeof P5UI !== 'undefined' ? P5UI.chain : null, ok = ch && ch.sym === ST.sel, un = ok ? V152.unusual(ch, ch.spot, { minPrem: 100000 }) : [];
    return `<div class="v152-tg">${tog('gamma', 'Zero-gamma, gamma flip and call / put walls on the stock chart')}</div><div class="row v151-row"><button type="button" class="btn sm" data-a="loadChain">Load options chain (${esc(isStock(ST.sel) ? ST.sel : 'SPY')})</button><button type="button" class="btn sm" data-a="routeUn" ${un.length ? '' : 'disabled'}>Route alerts to watchlist</button></div>
      ${ok ? `<div class="note">${ch.sim ? 'Model chain (Black-Scholes, live chain unavailable). ' : ''}${un.length} unusual strikes</div><table class="v152-t"><tr><th>Type</th><th>Strike</th><th>Vol / OI</th><th>Premium</th><th>Tags</th></tr>${un.slice(0, 10).map((x) => `<tr><td>${esc(x.type)}</td><td class="mono">${esc(fp(x.strike))}</td><td class="mono">${esc(x.vol + ' / ' + x.oi)}</td><td class="mono">${esc(NT.fmtUSD(x.prem, 0))}</td><td>${esc(x.tags.join(' '))}</td></tr>`).join('')}</table>` : '<div class="note">Open a stock chart and load its chain.</div>'}`;
  };
  R.payoff = () => { const S = px(ST.sel) || 100, P = U.payoff || (U.payoff = { kind: 'bullcall', legs: null });
    if (!P.legs) P.legs = V152.legsPreset(P.kind, S, 0.05, (k, t) => +P5.bs(S, k, 30 / 365, 0.04, 0.5, t).price.toFixed(2));
    const res = V152.payoff(P.legs, S, { span: 0.25, T: 30 / 365, bs: P5.bs }), th = V152.thetaCurve(P.legs, S, 30 / 365, P5.bs, 6);
    return `<div class="row v151-row"><select class="in" id="v152Pre" aria-label="Strategy">${[['bullcall', 'Bull call vertical'], ['bearput', 'Bear put vertical'], ['straddle', 'Long straddle'], ['strangle', 'Long strangle'], ['condor', 'Iron condor']].map(([k, n]) => `<option value="${k}" ${P.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="note">Spot ${esc(fp(S))} · 30 DTE · IV 50%</span></div>
      <table class="v152-t"><tr><th>Leg</th><th>Strike</th><th>Qty</th><th>Premium</th></tr>${P.legs.map((g, i) => `<tr><td>${esc(g.type)}</td><td><input class="in mono v152-num" data-leg="${i}.strike" value="${esc(g.strike)}"></td><td><input class="in mono v152-num" data-leg="${i}.qty" value="${esc(g.qty)}"></td><td><input class="in mono v152-num" data-leg="${i}.prem" value="${esc(g.prem)}"></td></tr>`).join('')}</table>
      ${svgLine([res.pts.map((p) => p.exp), res.pts.map((p) => p.now), res.pts.map(() => 0)], 360, 110, ['var(--acc)', '#38bdf8', 'var(--fg)'])}
      ${kpis([['Breakevens', res.be.map(fp).join(' / ') || '–'], ['Max profit', NT.fmtUSD(res.maxP, 0), 'up'], ['Max loss', NT.fmtUSD(res.maxL, 0), 'dn']])}<div class="note">Gold = at expiry · blue = today · theta decay at spot: ${th.map((x) => esc(x.days + 'd ' + NT.fmtUSD(x.pnl, 0))).join(' → ')}</div>`; };
  R.swap = () => { const c = cfg(); return `<div class="note">Alt+M or the market switch keeps each market's timeframe, indicators and risk %.${U.lastSwapMs != null ? ` Last swap: <b class="mono">${esc(U.lastSwapMs.toFixed(0))} ms</b>.` : ''}</div><table class="v152-t"><tr><th>Market</th><th>TF</th><th>Risk</th><th>Indicators</th></tr>${['crypto', 'stocks', 'onchain'].map((m) => { const r = V152.recall(c.mem, m); return `<tr><td>${esc(m)}</td><td>${esc(r ? r.tf : (ST.mk[m] || {}).tf || '–')}</td><td>${esc(r ? r.risk + '%' : '–')}</td><td>${esc(r ? Object.keys(r.ind).filter((k) => r.ind[k]).slice(0, 6).join(', ') : '–')}</td></tr>`; }).join('')}</table>`; };
  R.scan = () => { const c = cfg(); return `<div class="row v151-row"><input class="in mono" id="v152F" placeholder="RVOL > 3 AND Price > VWAP" value="${esc(U.lastF || '')}" aria-label="Scanner formula"><input class="in" id="v152Fn" placeholder="Tab name" style="max-width:110px" aria-label="Scanner name"><button type="button" class="btn sm" data-a="runF">Run</button><button type="button" class="btn sm pri" data-a="saveF">Save tab</button></div>
    <div class="note">Fields: ${esc(V152.FIELDS.join(' · '))} · AND / OR / ( ) · runs over your watchlist</div><div class="seg v152-tabs">${c.scanners.map((s, i) => `<button type="button" data-scan="${i}" title="${esc(s.f)}">${esc(s.name)}</button>`).join('')}</div><div id="v152ScanOut"></div>`; };
  R.dex = () => { const c = cfg(), sym = ST.sel, liq = isOnchain(sym) && OC.stats[sym] ? +OC.stats[sym].liq || 0 : 0, usd = +(U.dexUsd || 500), sim = V152.dexSim(usd, liq || 50000, c.fee);
    return `<div class="v152-tg">${tog('dexStrip', 'Safety strip on every DEX pair (mint · freeze · top-10 · LP lock)')}</div><div class="row v151-row"><div class="seg" id="v152Fee">${Object.keys(V152.FEES).map((k) => `<button type="button" data-fee="${k}" class="${c.fee === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div><label class="note">Size $ <input class="in mono v152-num" id="v152DexUsd" value="${esc(usd)}"></label></div>
      ${kpis([['Liquidity', liq ? NT.fmtUSD(liq, 0) : '$50K (sample)'], ['Price impact', sim.impactPct + '%', sim.fails ? 'dn' : ''], ['Slippage cap', sim.slipPct + '%'], ['Priority fee', sim.feeSol + ' SOL'], ['Landing', '~' + sim.landingMs + ' ms']])}<div class="note">${sim.fails ? 'This size would exceed the slippage cap and fail: use Turbo, a smaller size or split it.' : 'Paper DEX fills use this preset.'}</div>`; };
  R.smart = () => {
    const ws = typeof Sol !== 'undefined' ? (Sol.wallets || []).map((w) => ({ name: w.name, addr: w.addr, winRate: w.stats && isFinite(w.stats.winRate) ? w.stats.winRate : isFinite(w.winRate) ? w.winRate : null, trades: w.stats && isFinite(w.stats.trades) ? w.stats.trades : (Sol.trades || []).filter((t) => t.wallet === w.addr || t.who === w.addr).length })) : [];
    const lb = V152.leaderboard(ws.map((w) => Object.assign(w, { winRate: w.winRate == null ? 0.5 : w.winRate })));
    return `<table class="v152-t"><tr><th>#</th><th>Wallet</th><th>Win</th><th>Trades</th><th>Score</th></tr>${lb.slice(0, 10).map((w, i) => `<tr><td>${i + 1}</td><td>${esc(w.name || Sol.short(w.addr))}</td><td>${esc(Math.round(w.winRate * 100) + '%')}</td><td>${esc(w.trades)}</td><td class="mono">${esc(w.score)}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Track wallets in the Wallet Tracker first.</td></tr>'}</table>
      <div class="note">Confluence alert: 2+ tracked wallets (≥ 55% win rate) buying the same token within 5 minutes.</div><div class="note">${U.conf.slice(-5).reverse().map((x) => `🎯 ${esc(baseOf(x.sym))}: ${esc(x.wallets.join(', '))} · ${esc(NT.fmtUSD(x.usd, 0))}`).join('<br>') || 'No confluence yet this session.'}</div>`;
  };
  R.watch = () => `<div class="v152-tg">${tog('sparks', '24h sparklines + relative strength vs BTC / SPY in the watchlist')}</div><div class="note">Trade-plan note for ${esc(baseOf(ST.sel))} (shown on hover in the watchlist):</div><textarea class="in" id="v152Note" rows="2" maxlength="300" aria-label="Trade plan note">${esc(cfg().notes[ST.sel] || '')}</textarea><div class="row v151-row"><button type="button" class="btn sm" data-a="saveNote">Save note</button><button type="button" class="btn sm" data-a="flowHeat">🫧 Bubble map in net-inflow mode</button></div>`;
  const condRow = (side, c, i) => `<div class="row v152-cond" data-side="${side}" data-i="${i}"><select class="in" data-k="a">${Object.keys(V152.SERIES).map((k) => `<option ${c.a === k ? 'selected' : ''}>${k}</option>`).join('')}</select><select class="in" data-k="op">${['>', '<', '>=', '<=', 'crosses above', 'crosses below'].map((o) => `<option ${c.op === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select><input class="in mono" data-k="b" value="${esc(c.b)}" list="v152Ser" aria-label="Value or series"><button type="button" class="btn xs" data-a="delCond" aria-label="Remove condition">×</button></div>`;
  U.rules = () => U.comp || (U.comp = { entry: { logic: 'AND', conds: [{ a: 'rsi14', op: '<', b: 30 }, { a: 'close', op: '>', b: 'ema200' }] }, exit: { logic: 'OR', conds: [{ a: 'rsi14', op: '>', b: 70 }] }, sl: 3, tp: 8 });
  R.compose = () => { const r = U.rules(); return `<datalist id="v152Ser">${Object.keys(V152.SERIES).map((k) => `<option value="${k}">`).join('')}</datalist>${['entry', 'exit'].map((side) => `<div class="note"><b>${side === 'entry' ? 'Enter long when' : 'Exit when'}</b> <select class="in v152-logic" data-logic="${side}"><option ${r[side].logic === 'AND' ? 'selected' : ''}>AND</option><option ${r[side].logic === 'OR' ? 'selected' : ''}>OR</option></select> <button type="button" class="btn xs" data-a="addCond" data-side="${side}">+ condition</button></div>${r[side].conds.map((c, i) => condRow(side, c, i)).join('')}`).join('')}
    <div class="row v151-row"><label class="note">Stop % <input class="in mono v152-num" id="v152Sl" value="${esc(r.sl || '')}"></label><label class="note">Target % <input class="in mono v152-num" id="v152Tp" value="${esc(r.tp || '')}"></label></div>
    <div class="row v151-row"><button type="button" class="btn sm pri" data-a="compBt">Backtest on this chart</button><button type="button" class="btn sm" data-a="compPine">Pine Script v5</button><button type="button" class="btn sm" data-a="compJson">JSON</button></div><div id="v152CompOut"></div>`; };
  R.port = () => `<div class="row v151-row">${stratSel('v152PS', U.ps)}<input class="in" id="v152Basket" value="${esc(U.basket || 'NVDA, TSLA, BTC-USD, SOL-USD')}" aria-label="Basket"><button type="button" class="btn sm pri" data-a="portRun">Run</button></div><div id="v152PortOut"><div class="note">Same strategy across a basket on 1h history: combined Sharpe, drawdown and return correlation.</div></div>`;
  R.sens = () => `<div class="row v151-row">${stratSel('v152SS', U.ss)}<button type="button" class="btn sm pri" data-a="sensRun">Run 5 × 5 grid</button></div><div id="v152SensOut"><div class="note">Sweeps the first two parameters ±40% on the open market's 1h history.</div></div>`;
  R.gate = () => `<div class="row v151-row">${stratSel('v152GS', U.gs)}<button type="button" class="btn sm pri" data-a="gateRun">Validate</button></div><div id="v152GateOut"><div class="note">Runs the 17-test Validation Lab, then one click adds the ATR / trend / time filters that target each failed gate and re-runs.</div></div>`;
  R.prop = () => { const k = U.propK || 'apex', r = Object.assign({}, V152.PROP[k], k === 'custom' ? cfg().propCustom || {} : {}); return `<div class="row v151-row"><div class="seg" id="v152PropK">${Object.keys(V152.PROP).map((x) => `<button type="button" data-propk="${x}" class="${k === x ? 'on' : ''}">${esc(V152.PROP[x].name)}</button>`).join('')}</div></div>
    <div class="row v151-row"><label class="note">Target % <input class="in mono v152-num" id="v152PT" value="${esc(r.target)}" ${k === 'custom' ? '' : 'disabled'}></label><label class="note">Daily % <input class="in mono v152-num" id="v152PD" value="${esc(r.dailyDD == null ? '' : r.dailyDD)}" ${k === 'custom' ? '' : 'disabled'}></label><label class="note">Max DD % <input class="in mono v152-num" id="v152PM" value="${esc(r.maxDD)}" ${k === 'custom' ? '' : 'disabled'}></label><label class="chk"><input type="checkbox" id="v152PTr" ${r.trail ? 'checked' : ''} ${k === 'custom' ? '' : 'disabled'}> trailing</label></div>
    <div class="row v151-row">${stratSel('v152PrS', U.prs)}<button type="button" class="btn sm pri" data-a="propRun">Run gauntlet</button></div><div id="v152PropOut"><div class="note">Rules are approximate public 50K / 100K figures: check the firm's current rulebook.</div></div>`; };
  R.drill = () => `<div class="note">In Bar Replay: <b>1</b> = 1×, <b>2</b> = 2×, <b>5</b> = 5×, <b>0</b> = 10×.</div><div class="row v151-row"><button type="button" class="btn sm pri" data-a="blind">🙈 Start Blind Drill</button>${document.body.classList.contains('blind') ? '<button type="button" class="btn sm" data-a="blindOff">Reveal</button>' : ''}</div><div class="note">Hides the ticker and dates and rebases price to 100: pure price-action training. Reveal shows what it was.</div>`;
  R.mfe = () => `<div class="row v151-row"><button type="button" class="btn sm pri" data-a="mfeRun">Analyse last 30 closed trades</button></div><div id="v152MfeOut"><div class="note">Maximum favourable / adverse excursion, capture efficiency and auto-tags (scalp, swing, left-money, was-green, no-stop…).</div></div>`;
  R.battle = () => `<div class="note">Pick 2–4 strategies (Ctrl+click):</div><div class="row v151-row">${stratSel('v152BS', null, true)}<button type="button" class="btn sm pri" data-a="battleRun">Battle</button></div><div id="v152BattleOut"></div>`;
  R.copilot = () => { const st = U.range && U.range.t1 != null && U.range.sym === ST.sel ? (() => { const D = candles(), i0 = D.findIndex((c) => c.t >= U.range.t0), i1 = D.findIndex((c) => c.t >= U.range.t1); return i0 >= 0 && i1 >= 0 ? V152.rangeStats(D, i0, i1) : null; })() : null;
    return `<div class="row v151-row"><button type="button" class="btn sm pri" data-a="pickRange">Select a candle range</button>${st ? '<button type="button" class="btn sm" data-a="askRange">✨ Ask the 3-agent Copilot</button><button type="button" class="btn sm" data-a="clrRange">Clear</button>' : ''}</div>${st ? kpis([['Bars', st.bars], ['Return', st.ret + '%', st.ret >= 0 ? 'up' : 'dn'], ['Range', st.rangePct + '%'], ['Est. CVD', st.cvd, st.cvd >= 0 ? 'up' : 'dn'], ['Up bars', st.up + '/' + st.bars]]) : '<div class="note">Click the first and last candle on the chart.</div>'}`; };
  R.cro = () => `<div class="v152-tg">${tog('cro', 'Grade every chart bracket order A–F before it is placed')}</div><div class="note">A Chief-Risk-Officer agent checks stop, R:R, risk %, trend, RSI, upcoming events, open positions and losing streaks. You can always place anyway.</div>`;
  R.impact = () => { const I = typeof Grok !== 'undefined' && Grok.intel ? Grok.intel.items || [] : [], rows = I.map((x) => ({ x, tags: V152.impactTags((x.title || '') + ' ' + (x.summary || '')) })).filter((r) => r.tags.length).slice(0, 10);
    return `<div class="row v151-row"><button type="button" class="btn sm" data-a="loadIntel">Refresh World Monitor</button></div>${rows.length ? rows.map((r) => `<div class="v152-imp"><span>${esc(String(r.x.title || '').slice(0, 110))}</span><span>${r.tags.map((t) => `<button type="button" class="btn xs" data-impact="${esc(t.sym)}" title="Trade impact: open ${esc(t.sym)}">${esc(t.tag)}</button>`).join(' ')}</span></div>`).join('') : '<div class="note">No tagged headlines yet (World Monitor intel needs the launcher).</div>'}`; };
  R.card = () => `<div class="note">Sends a rich card with entry / stop / target, R:R and a chart snapshot to the Telegram / Discord you set in Settings → Background alerts (through the local launcher only).</div><div class="row v151-row"><button type="button" class="btn sm pri" data-a="sendCard">Send card for this chart</button></div><div class="note" id="v152CardMsg"></div>`;
  R.brief = () => `<div class="v152-tg">${tog('autoBrief', 'Show the pre-market brief on the first launch each day and the recap after 16:05')}</div><div class="row v151-row"><button type="button" class="btn sm pri" data-a="brief">☀ Pre-market levels brief</button><button type="button" class="btn sm" data-a="recap">🌙 End-of-day recap</button></div>`;
  R.share = () => `<div class="row v151-row"><button type="button" class="btn sm pri" data-a="shareWs">Export workspace code</button><button type="button" class="btn sm" data-a="shareSt">Export composer strategy</button></div><textarea class="in mono" id="v152Code" rows="3" placeholder="Paste an EXT1… code to import" aria-label="Share code"></textarea><div class="row v151-row"><button type="button" class="btn sm" data-a="importCode">Verify & import</button><button type="button" class="btn sm" data-a="dlCode">Download .exterm</button></div><div class="note" id="v152CodeMsg">Codes are ECDSA P-256 signed: any edit breaks the signature. The signer's fingerprint is shown before anything is applied; a valid signature proves integrity, not identity, so compare it with the fingerprint the author published.</div>`;
  R.perf = () => { let n = 0, bars = 0; for (const [, set] of StoresBySym) for (const s of set) if (s.sec < 60) { n++; bars += s.candles.length; } return `${kpis([['Frame rate', U.fps ? U.fps + ' fps' : '–'], ['Sub-minute stores', n], ['Buffered 1s–15s bars', bars], ['Trimmed', U.trimmed || 0]])}<div class="note">The chart draws on requestAnimationFrame (your display's refresh rate: 60 / 120 / 144 / 240 Hz). The governor trims off-screen 1s / 5s / 15s stores to their newest 3,600 bars every 30 s.</div>`; };
  R.theme = () => { const t = cfg().tokens; return `<div class="v152-tok">${V152.TOKENS.map(([k, l]) => `<label class="note">${esc(l)} <input type="color" data-tok="${esc(k)}" value="${esc(t[k] || (/^#[0-9a-f]{6}$/i.test(cssv(k, '')) ? cssv(k, '') : '#d4af37'))}"></label>`).join('')}</div><div class="row v151-row"><button type="button" class="btn sm" data-a="tokReset">Reset to theme</button></div><div class="note">Applied on top of the current theme (Obsidian & Gold by default) and saved.</div>`; };
  R.cachem = () => { const rows = []; for (const [sym, set] of StoresBySym) for (const s of set) rows.push({ sym, tf: s.tf || s.sec + 's', n: s.candles.length, ok: s.loaded }); rows.sort((a, b) => b.n - a.n);
    return `<div class="row v151-row"><button type="button" class="btn sm" data-a="precache">Pre-cache watchlist (${esc(ST.tf)})</button><button type="button" class="btn sm" data-a="purgeAll">Purge other markets</button></div><table class="v152-t"><tr><th>Market</th><th>TF</th><th>Bars</th><th></th></tr>${rows.slice(0, 20).map((r) => `<tr><td>${esc(baseOf(r.sym))}</td><td>${esc(r.tf)}</td><td class="mono">${esc(r.n)}</td><td><button type="button" class="btn xs" data-purge="${esc(r.sym)}">Purge</button></td></tr>`).join('')}</table>`; };
  R.verify = () => `<div class="row v151-row"><button type="button" class="btn sm pri" data-a="verify">Verify build integrity</button></div><div id="v152VerOut"><div class="note">Hashes exterm.html and serve.py on disk against the SHA256SUMS.txt next to them (launcher) and checks the live Content-Security-Policy. This catches accidental corruption; to rule out tampering, also check SHA256SUMS.txt against the published release.</div></div>`;

  const drawerRefresh = (id, quiet) => { const b = document.querySelector(`#v152Drawer [data-sec="${id}"] .v152-sb`); if (b && b.closest('details').open && !(quiet && b.contains(document.activeElement))) b.innerHTML = R[id](); };
  U.open = (sec) => {
    let d = $('#v152Drawer');
    if (!d) {
      d = document.createElement('aside'); d.id = 'v152Drawer'; d.className = 'v152-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Workstation');
      d.innerHTML = `<div class="v152-dh"><b data-i18n="ws.title">${esc(I18N.t('ws.title'))}</b><input class="in" id="v152Q" type="search" placeholder="Filter tools…" aria-label="Filter tools"><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
        <div class="v152-db">${SECTIONS.map(([pid, title, items]) => `<section class="v152-ph" data-ph="${pid}"><h4>${esc(title)}</h4>${items.map(([id, t]) => `<details data-sec="${id}"><summary>${esc(t)}</summary><div class="v152-sb"></div></details>`).join('')}</section>`).join('')}</div>`;
      document.body.appendChild(d); bindDrawer(d);
    }
    d.classList.add('on'); if (sec) { const x = d.querySelector(`[data-sec="${sec}"]`); if (x) { if (!x.open) x._fresh = true; x.open = true; x.querySelector('.v152-sb').innerHTML = R[sec](); x.scrollIntoView({ block: 'nearest' }); } /* _fresh: the async toggle event must not re-render (it would wipe inputs) */ }
    return d;
  };
  U.close = () => { const d = $('#v152Drawer'); if (d) d.classList.remove('on'); };

  /* actions */
  const A = {};
  A.close = U.close; A.hud = () => U.hud();
  A.addEv = () => { const e = V152.parseEvent($('#v152Ev').value); if (!e) { toast('Use: NAME YYYY-MM-DD HH:MM (UTC)', 'amb'); return; } cfg().userEv.push(e); save(); inv(); drawerRefresh('chart'); };
  A.ladder = U.attachLadder; A.ladderOff = () => { U.ladder = null; inv(); drawerRefresh('ladder'); };
  A.pickAv = () => { U.pick = 'avwap'; showTab('markets'); chart.cv.style.cursor = 'crosshair'; toast('Click the candle to anchor VWAP from'); };
  A.avMacro = () => { const p = (V151UI.pins || []).filter((x) => x.kind === 'MACRO').pop(); if (!p) { toast('No ⚠️ MACRO pin on this chart', 'amb'); return; } cfg().anchor = p.t; save(); inv(); drawerRefresh('avwap'); };
  A.avOff = () => { cfg().anchor = null; save(); inv(); drawerRefresh('avwap'); };
  A.loadChain = async () => { if (typeof P5UI === 'undefined') return; await P5UI.loadChain(); U.cache.gKey = null; inv(); drawerRefresh('gamma'); };
  A.routeUn = () => { const ch = P5UI.chain; if (!ch) return; const un = V152.unusual(ch, ch.spot, { minPrem: 100000 }); for (const x of un.slice(0, 3)) V151UI.badge(ch.sym, 'signal', `🧨 ${x.tags[0]} ${x.type} ${fp(x.strike)} · ${NT.fmtUSD(x.prem, 0)}`); toast(`${un.length} unusual strikes routed to the ${esc(ch.sym)} watchlist badge`); };
  const scanRows = () => (ST.watch || []).slice(0, 40).map((sym) => {
    let D = []; try { D = getStore(sym, ST.tf).candles || []; } catch (e) { /* no store */ }
    const p = px(sym), last = D.slice(-21), vol = last.length ? last[last.length - 1].v || 0 : 0, avg = last.length > 1 ? last.slice(0, -1).reduce((s, c) => s + (c.v || 0), 0) / (last.length - 1) : 0;
    const ser = (k) => (D.length > 30 ? V152.seriesOf(D.slice(-300), k).pop() : null);
    return { sym, price: p, chg: chg24(sym), vol, rvol: avg > 0 ? vol / avg : null, vwap: ser('vwap'), rsi: ser('rsi14'), ema20: ser('ema20'), ema50: ser('ema50'), atr: ser('atr14'), liq: isOnchain(sym) && OC.stats[sym] ? OC.stats[sym].liq : null, mcap: isOnchain(sym) && OC.stats[sym] ? OC.stats[sym].mcap : null };
  });
  const runF = (f) => { const P = V152.parseFormula(f), out = $('#v152ScanOut'); U.lastF = f; if (P.error) { out.innerHTML = `<div class="note dn">${esc(P.error)}</div>`; return; } const hits = scanRows().filter((r) => V152.evalFormula(P.ast, r)); out.innerHTML = hits.length ? `<table class="v152-t">${hits.map((r) => `<tr data-open="${esc(r.sym)}" tabindex="0"><td>${esc(baseOf(r.sym))}</td><td class="mono">${esc(fp(r.price))}</td><td class="${cls(r.chg)}">${esc(NT.fmtPct(r.chg))}</td><td class="mono">RVOL ${esc(r.rvol == null ? '–' : r.rvol.toFixed(1))}</td></tr>`).join('')}</table>` : '<div class="note">No watchlist market matches right now (only loaded charts have RVOL / VWAP / RSI).</div>'; };
  A.runF = () => runF($('#v152F').value);
  A.saveF = () => { const f = $('#v152F').value, n = ($('#v152Fn').value || '').trim().slice(0, 18) || 'Scan ' + (cfg().scanners.length + 1); if (V152.parseFormula(f).error) return runF(f); cfg().scanners.push({ name: n, f }); save(); drawerRefresh('scan'); };
  A.saveNote = () => { const v = $('#v152Note').value.slice(0, 300); if (v.trim()) cfg().notes[ST.sel] = v; else delete cfg().notes[ST.sel]; save(); decorateWatch(); toast('Note saved'); };
  A.flowHeat = () => { cfg().flowMode = true; save(); showTab('heat'); };
  const readRules = () => {
    const r = U.rules(), d = $('#v152Drawer'); for (const row of d.querySelectorAll('.v152-cond')) { const c = r[row.dataset.side].conds[+row.dataset.i]; if (!c) continue; c.a = row.querySelector('[data-k="a"]').value; c.op = row.querySelector('[data-k="op"]').value; const b = row.querySelector('[data-k="b"]').value.trim(); c.b = V152.isSeries(b) ? b : +b; }
    for (const s of d.querySelectorAll('.v152-logic')) r[s.dataset.logic].logic = s.value; const sl = +$('#v152Sl').value, tp = +$('#v152Tp').value; r.sl = sl > 0 ? sl : null; r.tp = tp > 0 ? tp : null; return r;
  };
  A.addCond = (b) => { readRules(); const r = U.rules(); if (r[b.dataset.side].conds.length < 8) r[b.dataset.side].conds.push({ a: 'close', op: '>', b: 'ema50' }); drawerRefresh('compose'); };
  A.delCond = (b) => { readRules(); const row = b.closest('.v152-cond'), L = U.rules()[row.dataset.side].conds; if (L.length > 1) L.splice(+row.dataset.i, 1); drawerRefresh('compose'); };
  A.compBt = () => { const r = readRules(), e = V152.validRules(r), out = $('#v152CompOut'); if (e) { out.innerHTML = `<div class="note dn">${esc(e)}</div>`; return; } const D = candles(); if (D.length < 60) { out.innerHTML = '<div class="note">Need 60+ candles on the chart.</div>'; return; } const res = V152.simRules(D, r), s = V152.stats(res.eq, (365 * 86400) / (chart.tfSec || 3600)); out.innerHTML = kpis([['Return', s.ret + '%', s.ret >= 0 ? 'up' : 'dn'], ['Max DD', s.maxDD + '%'], ['Sharpe', s.sharpe], ['Trades', res.trades.length]]) + svgLine([res.eq]); };
  A.compPine = () => { const p = V152.toPine(readRules(), 'ExTerm composer'), out = $('#v152CompOut'); out.innerHTML = p.error ? `<div class="note dn">${esc(p.error)}</div>` : `<textarea class="in mono" rows="9" readonly aria-label="Pine Script">${esc(p.pine)}</textarea>`; };
  A.compJson = () => { const r = readRules(), e = V152.validRules(r), out = $('#v152CompOut'); out.innerHTML = e ? `<div class="note dn">${esc(e)}</div>` : `<textarea class="in mono" rows="7" readonly aria-label="Strategy JSON">${esc(JSON.stringify({ v: 1, kind: 'exterm-rules', rules: r }, null, 1))}</textarea>`; };
  const btEq = (c, id, o = {}) => NT.backtest(c, NT.strategies[id], NT.defaultParams(id), Object.assign({ cash: 10000 }, o));
  A.portRun = async () => {
    const id = $('#v152PS').value, out = $('#v152PortOut'); U.ps = id; U.basket = $('#v152Basket').value; const syms = U.basket.split(/[\s,]+/).map((s) => resolveSym(s) || s.toUpperCase()).filter((s) => /^[A-Za-z0-9:._^\-]{1,40}$/.test(s)).slice(0, 8);
    await busy(out, 'Loading 1h history for ' + syms.length + ' markets…'); const curves = {};
    await Promise.all(syms.map(async (s) => { const c = await hist(s, 3600, 600); if (c.length > 120) curves[baseOf(s)] = btEq(c, id).eq; }));
    const P = V152.portfolio(curves, 8760); if (!P) { out.innerHTML = '<div class="note dn">No history for that basket.</div>'; return; }
    out.innerHTML = kpis([['Basket return', P.ret + '%', P.ret >= 0 ? 'up' : 'dn'], ['Max DD', P.maxDD + '%'], ['Sharpe', P.sharpe]]) + `<table class="v152-t"><tr><th></th>${P.keys.map((k) => `<th>${esc(k)}</th>`).join('')}<th>Return</th><th>Sharpe</th></tr>${P.keys.map((k, i) => `<tr><th>${esc(k)}</th>${P.corr[i].map((v) => `<td class="mono">${v == null ? '–' : esc(v.toFixed(2))}</td>`).join('')}<td class="${P.each[i].ret >= 0 ? 'up' : 'dn'}">${esc(P.each[i].ret)}%</td><td>${esc(P.each[i].sharpe)}</td></tr>`).join('')}</table>` + svgLine([P.eq]);
  };
  A.sensRun = async () => {
    const id = $('#v152SS').value, out = $('#v152SensOut'), S = NT.strategies[id], ps = (S.params || []).filter((q) => q.max > q.min).slice(0, 2); U.ss = id;
    if (ps.length < 2) { out.innerHTML = '<div class="note dn">This strategy has fewer than two tunable parameters.</div>'; return; }
    await busy(out); const c = await hist(isOnchain(ST.sel) ? 'BTC-USD' : ST.sel, 3600, 600); if (c.length < 150) { out.innerHTML = '<div class="note dn">Not enough history.</div>'; return; }
    const base = NT.defaultParams(id), axis = (q) => [0.6, 0.8, 1, 1.2, 1.4].map((m) => { let v = base[q.k] * m; if ((q.step || 1) >= 1) v = Math.round(v); return Math.min(q.max, Math.max(q.min, v)); });
    const xs = axis(ps[0]), ys = axis(ps[1]), M = V152.grid(xs, ys, (x, y) => NT.backtest(c, S, Object.assign({}, base, { [ps[0].k]: x, [ps[1].k]: y }), { cash: 10000 }).stats.ret), pl = V152.plateau(M), mx = Math.max(1, ...M.flat().filter(isFinite).map(Math.abs));
    out.innerHTML = `<table class="v152-t v152-heat"><tr><th>${esc(ps[1].label)} ↓ / ${esc(ps[0].label)} →</th>${xs.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>${ys.map((y, i) => `<tr><th>${esc(y)}</th>${M[i].map((v) => `<td class="${v >= 0 ? 'pos' : 'neg'}" style="--c:${v == null ? 0 : Math.round((Math.abs(v) / mx) * 70)}%">${v == null ? '–' : esc(v.toFixed(1))}</td>`).join('')}</tr>`).join('')}</table>` + (pl ? `<div class="note">Verdict: <b>${esc(pl.verdict)}</b> · ${esc(pl.profitable)}% of cells profitable · neighbours keep ${esc(pl.neighbour)}% of the best result</div>` : '');
  };
  A.gateRun = async () => {
    const id = $('#v152GS').value, out = $('#v152GateOut'); U.gs = id; await busy(out, 'Running the 17-test Validation Lab…');
    const c = await hist(isOnchain(ST.sel) ? 'BTC-USD' : ST.sel, 3600, 800); if (c.length < 300) { out.innerHTML = '<div class="note dn">Need 300+ hourly candles.</div>'; return; }
    const S = NT.strategies[id], p = NT.defaultParams(id), v0 = NT.validate(c, S, p, { tfSec: 3600 }), fx = V152.fixGate(v0.checks, {}), cnt = (v) => v.checks.filter((x) => x.status === 'pass').length;
    U.gateCtx = { c, id, fx, v0 };
    out.innerHTML = `<div class="note">${cnt(v0)} / ${v0.checks.length} gates pass.</div><table class="v152-t">${v0.checks.filter((x) => x.status !== 'pass').map((x) => `<tr><td class="${x.status === 'fail' ? 'dn' : ''}">${esc(x.status)}</td><td>${esc(x.name)}</td><td class="note">${esc(x.value)}</td></tr>`).join('')}</table>${fx.applied.length ? `<button type="button" class="btn sm pri" data-a="gateFix">🔧 Fix weak gate (${esc(fx.applied.join(', '))})</button>` : '<div class="note">No automatic fix for the failed gates.</div>'}<div id="v152GateFix"></div>`;
  };
  A.gateFix = async () => { const g = U.gateCtx, el = $('#v152GateFix'); if (!g) return; await busy(el, 'Re-running with filters…'); const v1 = NT.validate(g.c, NT.strategies[g.id], NT.defaultParams(g.id), Object.assign({ tfSec: 3600 }, g.fx.o)), p0 = g.v0.checks.filter((x) => x.status === 'pass').length, p1 = v1.checks.filter((x) => x.status === 'pass').length; el.innerHTML = kpis([['Gates before', p0 + '/' + g.v0.checks.length], ['Gates after', p1 + '/' + v1.checks.length, p1 > p0 ? 'up' : p1 < p0 ? 'dn' : '']]) + `<div class="note">Filters: ${esc(g.fx.applied.join(', '))}. Apply them in Bots & Backtest → enhancers if the result holds.</div>`; };
  A.propRun = async () => {
    const k = U.propK || 'apex', out = $('#v152PropOut'), id = $('#v152PrS').value; U.prs = id;
    let rules = V152.PROP[k]; if (k === 'custom') { rules = { name: 'Custom', target: +$('#v152PT').value, dailyDD: $('#v152PD').value === '' ? null : +$('#v152PD').value, maxDD: +$('#v152PM').value, trail: $('#v152PTr').checked }; if (!V152.ruleOk(rules)) { out.innerHTML = '<div class="note dn">Target and max drawdown must be 0–100 %.</div>'; return; } cfg().propCustom = rules; save(); }
    await busy(out); const c = await hist(isOnchain(ST.sel) ? 'BTC-USD' : ST.sel, 3600, 540); if (c.length < 300) { out.innerHTML = '<div class="note dn">Not enough 1h history.</div>'; return; }
    const bt = btEq(c, id, { fromT: c[c.length - 240].t }), eq = bt.eq.slice(-240), r = V152.propRun(eq, rules, 24);
    out.innerHTML = r.ok ? kpis([['Result', r.passed ? 'PASSED' : 'FAILED', r.passed ? 'up' : 'dn'], ['Return', r.ret + '%'], ['Max DD', r.maxDD + '%'], ['Worst day', r.worstDay + '%']]) + `<div class="note">${esc(rules.name)}${r.fail ? ' · ' + esc(r.fail) : ''} · last 240 × 1h bars</div>` : `<div class="note dn">${esc(r.error)}</div>`;
  };
  A.blind = async () => { if (Replay.on) Replay.exit(); showTab('markets'); await Replay.enter(); if (!Replay.on) return; U.blindReal = { sym: Replay.sym, tf: Replay.tf }; Replay.data = V152.blind(Replay.data); Replay.sym = 'BLIND'; document.body.classList.add('blind'); Replay.draw(); toast('🙈 Blind Drill: ticker and dates hidden. Space plays, B / S trade, 1 / 2 / 5 / 0 set the speed.', 'acc', 7000); drawerRefresh('drill'); };
  A.blindOff = () => { document.body.classList.remove('blind'); const r = U.blindReal; toast(r ? 'It was ' + esc(baseOf(r.sym)) + ' · ' + esc(r.tf) : 'Blind Drill ended', 'acc'); if (Replay.on) Replay.exit(); U.blindReal = null; drawerRefresh('drill'); };
  A.mfeRun = async () => {
    const out = $('#v152MfeOut'), C = typeof Journal !== 'undefined' ? Journal.closed(Journal.entries || []).filter((x) => x.entry && x.openTs).slice(-30) : []; if (!C.length) { out.innerHTML = '<div class="note">No closed trades with an entry yet.</div>'; return; }
    await busy(out, 'Loading candles…'); const bySym = {}; for (const s of [...new Set(C.map((x) => x.sym))].slice(0, 6)) bySym[s] = await hist(s, 300, 1000);
    const rows = C.map((x) => { const tr = { entry: x.entry.price, exit: x.exit.price, t0: Math.floor(x.openTs / 1000), t1: Math.floor(x.ts / 1000), stop: x.stop }, e = bySym[x.sym] ? V152.excursion(tr, bySym[x.sym]) : null; return { x, e, tags: V152.autoTag(tr, e) }; }).reverse();
    out.innerHTML = `<table class="v152-t"><tr><th>Market</th><th>P&L</th><th>MFE</th><th>MAE</th><th>Capture</th><th>Tags</th></tr>${rows.map((r) => `<tr><td>${esc(baseOf(r.x.sym))}</td><td class="${cls(r.x.pnl)}">${esc(NT.fmtUSD(r.x.pnl, 0))}</td><td class="up">${r.e ? esc(r.e.mfe + '%') : '–'}</td><td class="dn">${r.e ? esc(r.e.mae + '%') : '–'}</td><td>${r.e ? esc(r.e.eff + '%') : '–'}</td><td>${esc(r.tags.join(' · '))}</td></tr>`).join('')}</table>`;
  };
  A.battleRun = async () => { const ids = [...$('#v152BS').selectedOptions].map((o) => o.value).slice(0, 4), out = $('#v152BattleOut'); if (ids.length < 2) { out.innerHTML = '<div class="note dn">Pick at least two strategies.</div>'; return; } await busy(out); const c = await hist(isOnchain(ST.sel) ? 'BTC-USD' : ST.sel, 3600, 600); if (c.length < 150) { out.innerHTML = '<div class="note dn">Not enough history.</div>'; return; }
    const B = V152.battle(ids.map((id) => ({ name: String(NT.strategies[id].name || id).replace(/^★ /, ''), eq: btEq(c, id).eq }))); const cols = ['var(--acc)', 'var(--up)', '#38bdf8', '#f472b6'];
    out.innerHTML = `<table class="v152-t"><tr><th>#</th><th>Strategy</th><th>Return</th><th>Max DD</th><th>Sharpe</th></tr>${B.map((r, i) => `<tr><td><i class="v152-sw" style="background:${cols[i]}"></i>${r.rank}</td><td>${esc(r.name)}</td><td class="${r.ret >= 0 ? 'up' : 'dn'}">${esc(r.ret)}%</td><td>${esc(r.maxDD)}%</td><td>${esc(r.sharpe)}</td></tr>`).join('')}</table>` + svgLine(B.map((r) => r.eq), 360, 120, cols) + `<div class="note">Identical data: ${esc(baseOf(isOnchain(ST.sel) ? 'BTC-USD' : ST.sel))} 1h, ${c.length} bars.</div>`; };
  A.pickRange = () => { showTab('markets'); U.pick = 'range0'; U.range = null; chart.cv.style.cursor = 'crosshair'; toast('Click the first candle of the range'); inv(); };
  A.clrRange = () => { U.range = null; inv(); drawerRefresh('copilot'); };
  A.askRange = () => { const D = candles(), i0 = D.findIndex((c) => c.t >= U.range.t0), i1 = D.findIndex((c) => c.t >= U.range.t1), st = V152.rangeStats(D, i0, i1); if (!st) return; showTab('ai'); aiSend(V152.rangePrompt(ST.sel, ST.tf, st)); };
  A.loadIntel = async () => { try { await Grok.loadIntel(); } catch (e) { toast('World Monitor: ' + esc(e.message), 'amb'); } drawerRefresh('impact'); };
  A.sendCard = async () => {
    const m = $('#v152CardMsg'), d = ChartTrade.draft && ChartTrade.draft.sym === ST.sel ? ChartTrade.draft : null, pos = ACC.pos[ST.sel], card = V152.alertCard({ side: 'buy', sym: baseOf(ST.sel), tf: ST.tf, entry: d ? d.entry : pos ? pos.cost / pos.qty : px(ST.sel), sl: d ? d.sl : pos && pos.sl, tp: d ? d.tp : pos && pos.tp, setup: 'ExTerm chart setup' });
    let png = ''; try { const cv = chart.cv, k = Math.min(1, 640 / cv.width), t = document.createElement('canvas'); t.width = Math.round(cv.width * k); t.height = Math.round(cv.height * k); t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); png = t.toDataURL('image/png').split(',')[1]; } catch (e) { /* tainted or no chart */ }
    m.textContent = 'Sending…'; try { const r = await J.req('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: card.text, png }) }, 25000); m.textContent = r.ok ? 'Sent to ' + (r.sent || []).join(' + ') + ' ✓' : 'Nothing sent: set up Telegram / Discord in Settings → Background alerts.'; } catch (e) { m.textContent = 'Needs the launcher with alerts on: ' + e.message; }
  };
  A.brief = async () => {
    const sym = isOnchain(ST.sel) ? 'BTC-USD' : ST.sel, c = await hist(sym, 3600, 72), lv = V152.levels(c, Date.now() / 1000), ev = U.eventList().slice(0, 6), wm = typeof Grok !== 'undefined' && Grok.intel ? (Grok.intel.items || []).filter((x) => /critical|high/i.test(x.level || x.severity || '')).slice(0, 4) : [];
    p2modal('☀ Pre-market brief · ' + baseOf(sym), (lv ? kpis([['PDH', fp(lv.pdh)], ['PDL', fp(lv.pdl)], ['PDC', fp(lv.pdc)], ['Overnight high', fp(lv.onh)], ['Overnight low', fp(lv.onl)]]) : '<div class="note">No prior-day candles.</div>') + `<div class="note"><b>Events</b><br>${ev.map((e) => esc(e.l + ' · in ' + V151.fmtDur(e.inSec))).join('<br>') || 'None scheduled in 3 weeks.'}</div><div class="note"><b>World</b><br>${wm.map((x) => esc(String(x.title || '').slice(0, 120))).join('<br>') || 'No high-impact headlines loaded.'}</div><div class="note">Levels are UTC-day based. Not financial advice.</div>`, 'v152Brief');
  };
  A.recap = () => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const C = typeof Journal !== 'undefined' ? Journal.closed(Journal.entries || []).filter((x) => x.ts >= d0.getTime()) : [], r = V152.recap(C);
    p2modal('🌙 End-of-day recap', kpis([['Trades', r.n], ['Win rate', r.wr == null ? '–' : r.wr + '%'], ['P&L', NT.fmtUSD(r.pnl, 0), r.pnl >= 0 ? 'up' : 'dn'], ['Best', r.best ? baseOf(r.best.sym) + ' ' + NT.fmtUSD(r.best.pnl, 0) : '–'], ['Worst', r.worst ? baseOf(r.worst.sym) + ' ' + NT.fmtUSD(r.worst.pnl, 0) : '–']]) + '<div class="note">Journal → insights has the full breakdown.</div>', 'v152Recap'); };
  /* the signing key lives in IndexedDB as a non-extractable CryptoKey: never in ST, saved state, /api/state or backups */
  const idb = (val) => new Promise((res, rej) => { const o = indexedDB.open('exterm-v152', 1); o.onupgradeneeded = () => o.result.createObjectStore('k'); o.onerror = () => rej(o.error); o.onsuccess = () => { const st = o.result.transaction('k', val ? 'readwrite' : 'readonly').objectStore('k'), q = val ? st.put(val, 'sign') : st.get('sign'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; });
  const key = async () => { const c = cfg(); if (c.signKey) { delete c.signKey; save(); } let kp = null; try { kp = await idb(); } catch (e) { /* storage blocked */ } if (kp && kp.privateKey && kp.publicKey) return kp; kp = await V152.newKey(crypto.subtle, false); try { await idb(kp); } catch (e) { /* this session only */ } return kp; };
  const shareOut = async (kind, data) => { const m = $('#v152CodeMsg'); try { const kp = await key(), code = await V152.signCode(crypto.subtle, kp, kind, data); $('#v152Code').value = code; m.textContent = `Signed ${kind} code ready · publish your fingerprint ${await V152.fingerprint(crypto.subtle, await crypto.subtle.exportKey('jwk', kp.publicKey))} with it so others can check it is yours`; } catch (e) { m.textContent = 'Could not sign: ' + e.message; } };
  A.shareWs = () => shareOut('workspace', V152.cleanWorkspace({ theme: Themes.cur(), tf: ST.tf, lang: I18N.cur(), ind: ST.ind || {}, tokens: cfg().tokens }));
  A.shareSt = () => { const r = readRulesSafe(); const e = V152.validRules(r); if (e) { $('#v152CodeMsg').textContent = e; return; } shareOut('strategy', r); };
  const readRulesSafe = () => (document.querySelector('#v152Drawer .v152-cond') ? readRules() : U.rules());
  /* import: verify the signature, show the signer (known / new) and what will change, apply only after a click */
  A.importCode = async () => {
    const m = $('#v152CodeMsg'), v = await V152.verifyCode(crypto.subtle, $('#v152Code').value); U.pendingCode = null; if (!v.ok) { m.textContent = v.error; return; }
    const data = v.kind === 'workspace' ? V152.cleanWorkspace(v.data) : V152.cleanRules(v.data); if (!data) { m.textContent = v.kind === 'workspace' ? 'Empty workspace' : 'Strategy rejected: ' + V152.validRules(v.data); return; }
    const known = (cfg().signers || []).includes(v.signer); U.pendingCode = { kind: v.kind, data, signer: v.signer };
    m.innerHTML = `Signature valid: the code was not altered after signing. Signer <b class="mono">${esc(v.signer)}</b> ${known ? '(trusted before)' : '<b class="dn">(new signer: compare with the fingerprint the author published)</b>'} · ${esc(v.kind === 'workspace' ? 'changes: ' + Object.keys(data).join(', ') : 'loads a ' + data.entry.conds.length + ' + ' + data.exit.conds.length + ' condition strategy into the composer')} <button type="button" class="btn xs pri" data-a="applyCode">Apply</button>`;
  };
  A.applyCode = () => {
    const p = U.pendingCode, m = $('#v152CodeMsg'); if (!p) return; U.pendingCode = null; const c = cfg(); c.signers = [p.signer].concat((c.signers || []).filter((x) => x !== p.signer)).slice(0, 50);
    if (p.kind === 'workspace') { const w = p.data; if (w.theme) Themes.set(w.theme); if (w.lang) I18N.set(w.lang); if (w.ind) { ST.ind = Object.assign(ST.ind || {}, w.ind); if (chart) Object.assign(chart.o, w.ind); } if (w.tokens) { c.tokens = w.tokens; applyTokens(); } if (w.tf) { const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === w.tf); if (b) b.click(); } save(); inv(); m.textContent = `Workspace applied ✓ · signed by ${p.signer}`; }
    else { U.comp = p.data; save(); m.textContent = `Strategy loaded into the composer ✓ · signed by ${p.signer}`; const s = document.querySelector('#v152Drawer [data-sec="compose"]'); if (s) s.open = true; drawerRefresh('compose'); }
  };
  A.dlCode = () => { const v = $('#v152Code').value.trim(); if (!/^EXT1\./.test(v)) { $('#v152CodeMsg').textContent = 'Export a code first'; return; } const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([v], { type: 'text/plain' })); a.download = 'preset.exterm'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const applyTokens = () => { const t = cfg().tokens; for (const [k] of V152.TOKENS) { if (t[k]) document.body.style.setProperty(k, t[k]); else document.body.style.removeProperty(k); } inv(); };
  A.tokReset = () => { cfg().tokens = {}; save(); applyTokens(); drawerRefresh('theme'); };
  A.precache = () => { let n = 0; for (const s of (ST.watch || []).slice(0, 20)) { const st = getStore(s, ST.tf); if (!st.loaded && !st.loading) { st.load(1000); n++; } } toast(`Pre-caching ${n} markets on ${esc(ST.tf)}`); setTimeout(() => drawerRefresh('cachem'), 2500); };
  const purge = (sym) => { const set = StoresBySym.get(sym); if (!set || sym === ST.sel) return 0; let n = 0; for (const s of set) { n += s.candles.length; s.candles.length = 0; s.loaded = false; } return n; };
  A.purgeAll = () => { let n = 0; for (const [sym] of StoresBySym) if (!(ST.watch || []).includes(sym)) n += purge(sym); toast(`Purged ${n} cached bars`); drawerRefresh('cachem'); };
  A.verify = async () => {
    const out = $('#v152VerOut'); await busy(out, 'Hashing…'); const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]'), csp = meta ? meta.content : '', inl = [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length;
    let files = null, err = ''; try { files = await J.req('/api/integrity', undefined, 15000); } catch (e) { err = e.message; }
    const rows = files && Array.isArray(files.files) ? files.files : [];
    out.innerHTML = kpis([['CSP default-src none', V152.cspOk(csp) ? 'PASS' : 'FAIL', V152.cspOk(csp) ? 'up' : 'dn'], ['Inline handlers', inl ? inl + ' found' : 'none', inl ? 'dn' : 'up'], ['File hashes', rows.length ? (rows.every((r) => r.ok) ? 'MATCH' : 'MISMATCH') : 'n/a', rows.length ? (rows.every((r) => r.ok) ? 'up' : 'dn') : '']]) + (rows.length ? `<table class="v152-t">${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${esc(String(r.sha || '').slice(0, 16))}…</td><td class="${r.ok ? 'up' : 'dn'}">${r.ok ? '✓ matches SHA256SUMS' : esc(r.why || 'mismatch')}</td></tr>`).join('')}</table>` : `<div class="note">${esc(err || 'File hashes need the launcher (python serve.py).')}</div>`);
  };

  const bindDrawer = (d) => {
    d.addEventListener('toggle', (e) => { const det = e.target; if (det.tagName !== 'DETAILS') return; if (det._fresh) { det._fresh = false; return; } if (det.open) det.querySelector('.v152-sb').innerHTML = R[det.dataset.sec](); }, true);
    d.addEventListener('click', (e) => {
      const t = e.target;
      const a = t.closest('[data-a]'); if (a && A[a.dataset.a]) { e.preventDefault(); Promise.resolve(A[a.dataset.a](a)).catch((x) => toast('⚠ ' + esc(x.message), 'amb')); return; }
      const g = t.closest('[data-grp]'); if (g) { cfg().group = g.dataset.grp === 'off' ? null : g.dataset.grp; save(); syncBadge(); drawerRefresh('sync'); return; }
      const pt = t.closest('[data-piptf]'); if (pt) { cfg().pipTf = pt.dataset.piptf; save(); pip(); drawerRefresh('sync'); return; }
      const f = t.closest('[data-fee]'); if (f) { cfg().fee = f.dataset.fee; save(); drawerRefresh('dex'); return; }
      const pk = t.closest('[data-propk]'); if (pk) { U.propK = pk.dataset.propk; drawerRefresh('prop'); return; }
      const sc = t.closest('[data-scan]'); if (sc) { const s = cfg().scanners[+sc.dataset.scan]; if (s) { $('#v152F').value = s.f; runF(s.f); } return; }
      const im = t.closest('[data-impact]'); if (im) { const s = im.dataset.impact; if (/^[A-Za-z0-9:._^\-]{1,40}$/.test(s)) { openSym(s); toast('Trade impact: ' + esc(s)); } return; }
      const op = t.closest('[data-open]'); if (op) { openSym(op.dataset.open); return; }
      const pu = t.closest('[data-purge]'); if (pu) { toast(`Purged ${purge(pu.dataset.purge)} bars`); drawerRefresh('cachem'); }
    });
    d.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.c) { const [a, b] = t.dataset.c.split('.'), c = cfg(); if (b) c[a][b] = t.checked; else c[a] = t.checked; save(); U.cache = {}; inv(); pip(); dexStrip(); decorateWatch(); if (a === 'walls' && !t.checked) U.walls = []; return; }
      if (t.dataset.split != null) { const c = cfg(); c.splits[+t.dataset.split] = Math.max(0, Math.min(100, +t.value || 0)); save(); return; }
      if (t.dataset.leg) { const [i, k] = t.dataset.leg.split('.'), g = U.payoff.legs[+i]; const v = +t.value; if (g && isFinite(v) && (k !== 'strike' || v > 0)) g[k] = v; drawerRefresh('payoff'); return; }
      if (t.id === 'v152Pre') { U.payoff = { kind: t.value, legs: null }; drawerRefresh('payoff'); return; }
      if (t.id === 'v152DexUsd') { U.dexUsd = Math.max(1, +t.value || 500); drawerRefresh('dex'); return; }
      if (t.dataset.tok) { cfg().tokens[t.dataset.tok] = t.value; cfg().tokens = V152.cleanTokens(cfg().tokens); save(); applyTokens(); }
    });
    d.addEventListener('input', (e) => { if (e.target.id === 'v152Q') { const q = e.target.value.trim().toLowerCase(); for (const det of d.querySelectorAll('details')) det.hidden = !!q && !det.textContent.toLowerCase().includes(q) && !det.dataset.sec.includes(q); for (const s of d.querySelectorAll('.v152-ph')) s.hidden = ![...s.querySelectorAll('details')].some((x) => !x.hidden); } });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); U.close(); } const r = e.target.closest && e.target.closest('[data-open]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSym(r.dataset.open); } });
  };

  /* ══ Grok tab: telemetry strip + rule compiler with dry-run shadow mode ══ */
  const shadowTick = (sym, p, ts) => {
    const W = U.flowRules; if (!W) return; const D = candles(); if (D.length < 60 || ST.sel !== sym) return;
    const t = D[D.length - 1].t; if (W.lastT === t) return; W.lastT = t;
    const en = V152.signals(D.slice(-300), W.rules.entry), ex = V152.signals(D.slice(-300), W.rules.exit), i = en.length - 2;
    const side = !W.inPos && en[i] ? 'buy' : W.inPos && ex[i] ? 'sell' : null; if (!side) return;
    const f = V152.shadowFill({ side, usd: 1000, sym, bot: W.name }, { price: p, ts: Date.now() }, 5); if (!f) return; W.inPos = side === 'buy';
    V151.pushCapped(U.shadow, f, 200); renderGrokCard(); toast(`👻 Dry-run ${esc(side)} ${esc(baseOf(sym))} @ ${esc(fp(f.price))} (no balance touched)`);
  };
  const renderGrokCard = () => {
    const out = $('#v152ShadowLog'); if (!out) return; const s = V152.shadowStats(U.shadow);
    out.innerHTML = `<div class="note">${s.n} hypothetical fills · ${s.buys} buys / ${s.sells} sells · simulated slippage ${esc(NT.fmtUSD(s.slipUsd, 2))}</div>${U.shadow.slice(-6).reverse().map((f) => `<div class="note mono">${esc(new Date(f.ts).toLocaleTimeString())} ${esc(f.side)} ${esc(baseOf(f.sym))} mid ${esc(fp(f.mid))} → ${esc(fp(f.price))}</div>`).join('')}`;
  };
  const mountGrok = () => {
    const host = $('#tab-grok'); if (!host || $('#v152Tele')) return;
    const tele = document.createElement('div'); tele.id = 'v152Tele'; tele.className = 'v152-tele'; tele.setAttribute('aria-live', 'polite'); tele.innerHTML = '<span class="note">Daemon health: connecting…</span>'; host.prepend(tele);
    const det = document.createElement('details'); det.className = 'panel v152-grok'; det.id = 'v152Nl';
    det.innerHTML = `<summary>🧠 Plain-English bot rules → backtestable workflow</summary><div class="pb"><textarea class="in" id="v152NlIn" rows="2" maxlength="600" aria-label="Rules in plain English">Buy SOL when RSI below 30 and price above EMA 200, sell when RSI above 70, stop 2%, take profit 6%</textarea>
      <div class="row v151-row"><button type="button" class="btn sm pri" data-nl="compile">Compile</button><button type="button" class="btn sm" data-nl="bt">Backtest</button><button type="button" class="btn sm" data-nl="compose">Open in composer</button><label class="chk"><input type="checkbox" id="v152Shadow" ${cfg().shadow ? 'checked' : ''}> 👻 Dry-run shadow mode on live ticks</label></div><div id="v152NlOut"></div><div id="v152ShadowLog"></div></div>`;
    tele.after(det);
    const compile = () => { const r = V152.nlCompile($('#v152NlIn').value), out = $('#v152NlOut'); if (!r.ok) { out.innerHTML = `<div class="note dn">${esc(r.error)}</div>`; return null; } out.innerHTML = `<textarea class="in mono" rows="6" readonly aria-label="Workflow JSON">${esc(JSON.stringify(r.workflow, null, 1))}</textarea>`; return r.workflow; };
    det.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nl]'); if (!b) return; const w = compile(); if (!w) return;
      if (b.dataset.nl === 'bt') { const go = () => { const D = candles(), res = V152.simRules(D, w.rules), s = V152.stats(res.eq, (365 * 86400) / (chart.tfSec || 3600)); $('#v152NlOut').insertAdjacentHTML('beforeend', kpis([['Return', s.ret + '%', s.ret >= 0 ? 'up' : 'dn'], ['Max DD', s.maxDD + '%'], ['Trades', res.trades.length], ['On', baseOf(ST.sel) + ' ' + ST.tf]])); }; const sym = w.sym ? resolveSym(w.sym) : null; if (sym && sym !== ST.sel) { openSym(sym); setTimeout(go, 1500); } else go(); }
      if (b.dataset.nl === 'compose') { U.comp = w.rules; U.open('compose'); }
      U.flowRules = cfg().shadow ? { rules: w.rules, sym: ST.sel, name: w.name } : U.flowRules;
    });
    det.addEventListener('change', (e) => { if (e.target.id === 'v152Shadow') { cfg().shadow = e.target.checked; save(); if (e.target.checked) { const w = compile(); if (w) { U.flowRules = { rules: w.rules, sym: ST.sel, name: w.name }; toast('👻 Dry-run on ' + esc(baseOf(ST.sel)) + ': hypothetical fills are logged, balances are never touched.', 'acc'); } } else U.flowRules = null; renderGrokCard(); } });
  };
  const tele = async () => {
    const el = $('#v152Tele'); if (!el || (curTab !== 'grok') || document.hidden) return;
    let h = null; try { h = await J.req('/api/health', undefined, 4000); } catch (e) { /* no launcher */ }
    const lat = V152.pctl(U.lat, 50), p95 = V152.pctl(U.lat, 95);
    el.innerHTML = [['Daemon', h ? 'up ' + V152.fmtUptime(h.uptime) : 'offline', h ? 'up' : 'dn'], ['Tick latency', lat == null ? '–' : `${Math.max(0, Math.round(lat))} ms (p95 ${Math.max(0, Math.round(p95))})`], ['RAM cache hits', h && h.cache && h.cache.total ? Math.round((h.cache.hits / h.cache.total) * 100) + '%' : '–'], ['Bot heartbeats', h ? `${h.bots.active}/${h.bots.total}` : '–']].map(([k, v, c]) => `<span class="v152-tk"><span class="k">${esc(k)}</span><b class="${c || ''}">${esc(v)}</b></span>`).join('');
  };

  /* ══ watchlist sparklines, RS badges, notes ══ */
  const decorateWatch = () => {
    const c = cfg(), wl = $('#watchList'); if (!wl) return;
    for (const row of wl.querySelectorAll('.wl-row[data-s]')) {
      const sym = row.dataset.s; let sp = row.querySelector('.v152-spark'); const note = c.notes[sym];
      if (note) row.title = 'Plan: ' + note; else if (row.title && row.title.startsWith('Plan: ')) row.removeAttribute('title');
      if (!c.sparks) { if (sp) sp.remove(); continue; }
      let D = []; try { D = (getStore(sym, '1h').candles || []).slice(-24); } catch (e) { /* none */ }
      if (D.length < 2) { const st = getStore(sym, '1h'); if (!st.loaded && !st.loading && !(U.sparkLoad || (U.sparkLoad = new Set())).has(sym)) { U.sparkLoad.add(sym); st.load(48); } continue; }
      const bench = isStock(sym) ? 'SPY' : 'BTC-USD', B = sym === bench ? null : (getStore(bench, '1h').candles || []).slice(-24), rs = B && B.length > 1 ? V152.relStrength(D.map((x) => x.c), B.map((x) => x.c)) : null;
      if (!sp) { sp = document.createElement('span'); sp.className = 'v152-spark'; row.appendChild(sp); }
      const up = D[D.length - 1].c >= D[0].c; sp.innerHTML = `<svg viewBox="0 0 60 16" width="60" height="16" aria-hidden="true"><polyline fill="none" stroke="${up ? 'var(--up)' : 'var(--dn)'}" stroke-width="1.3" points="${V152.spark(D.map((x) => x.c))}"/></svg>${rs == null ? '' : `<b class="${rs >= 0 ? 'up' : 'dn'}" title="24h relative strength vs ${esc(baseOf(bench))}">${rs >= 0 ? '+' : ''}${esc(rs.toFixed(1))} vs ${esc(baseOf(bench))}</b>`}`;
    }
  };

  /* ══ settings: language + integrity panel ══ */
  const mountSettings = () => {
    const host = $('#setBody'); if (!host || $('#v152Set')) return; const p = document.createElement('div'); p.className = 'panel'; p.id = 'v152Set';
    p.innerHTML = `<h3>🌐 <span data-i18n="lang.label">${esc(I18N.t('lang.label'))}</span> &amp; 🛡 build integrity</h3><div class="pb"><div class="row v151-row"><span class="note">${esc(I18N.label(I18N.cur()))}</span><button type="button" class="btn sm" id="v152SetLang">🌐 Change language</button><button type="button" class="btn sm pri" id="v152SetVer">Verify build integrity</button></div><div id="v152SetOut"></div></div>`;
    host.appendChild(p); p.querySelector('#v152SetLang').addEventListener('click', () => I18N.gate(false));
    p.querySelector('#v152SetVer').addEventListener('click', () => { U.open('verify'); A.verify(); });
  };

  /* ══ Ctrl+K: calculator, language, theme, workstation commands ══ */
  const palWrap = () => {
    if (typeof palRender !== 'function') return; const _pr = palRender;
    palRender = function () {
      _pr.apply(this, arguments); const raw = ($('#palIn').value || '').trim(), q = raw.toLowerCase(), add = [];
      if (V152.isCalc(raw)) { const v = V152.calc(raw); if (v != null) add.push({ l: `= ${+v.toPrecision(12)}`, r: 'calculator · copy', f: () => { try { navigator.clipboard.writeText(String(+v.toPrecision(12))); toast('Copied ' + esc(String(+v.toPrecision(12)))); } catch (e) { /* clipboard blocked */ } } }); }
      if (/^(lang|language|idioma|langue|sprache|🌐)/.test(q) || (q.length >= 3 && I18N.search(q, false).length && !V152.isCalc(raw))) { const L = /^(lang|language)\s*/.test(q) ? I18N.search(q.replace(/^(lang|language)\s*/, ''), false) : I18N.search(q, false); for (const l of L.slice(0, 4)) add.push({ l: `🌐 Language: ${l.native}`, r: l.english, f: () => I18N.set(l.code) }); }
      if (q.startsWith('theme') || q.length >= 3) for (const t of Themes.LIST) if (('theme ' + t.name).toLowerCase().includes(q) || (q.startsWith('theme') && q.length <= 6)) add.push({ l: `🎨 Theme: ${t.name}`, r: 'theme', f: () => Themes.set(t.id) });
      const cmds = [['🧭 Workstation drawer', 'workstation tools drawer advanced', () => U.open()], ['⌧ HUD clean mode (H)', 'hud clean record screen recording hide', () => U.hud()], ['🎯 TP ladder on this chart', 'tp ladder take profit partial break even', U.attachLadder], ['⚓ Anchored VWAP', 'avwap anchored vwap sigma', () => A.pickAv()], ['🔎 Formula scanner', 'scanner formula rvol vwap filter', () => U.open('scan')], ['📐 Options payoff builder', 'options payoff straddle condor vertical', () => U.open('payoff')], ['🧪 Strategy composer → Pine', 'composer pine script no code strategy', () => U.open('compose')], ['⚔ Strategy battle', 'battle compare strategies leaderboard', () => U.open('battle')], ['🙈 Blind drill', 'blind drill replay training', () => A.blind()], ['☀ Pre-market brief', 'brief pre market pdh pdl levels', () => A.brief()], ['🛡 Verify build integrity', 'verify integrity sha256 csp security', () => { U.open('verify'); A.verify(); }], ['🔐 Share code (signed)', 'share export import code exterm', () => U.open('share')], ['🌐 Choose language', 'language lang translate', () => I18N.gate(false)]];
      for (const [l, k, f] of cmds) if (!q || l.toLowerCase().includes(q) || k.includes(q)) add.push({ l, r: 'v15.2', f });
      palItems.unshift(...add.filter((x) => x.r.startsWith('calculator'))); palItems.push(...add.filter((x) => !x.r.startsWith('calculator')));
      $('#palList').innerHTML = palItems.map((x, i) => `<div class="it ${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${esc(x.l)}</span><span class="note">${esc(x.r)}</span></div>`).join('');
    };
  };

  /* ══ start ══ */
  U.start = () => {
    cfg(); applyTokens();
    const th = $('#btnTheme'); if (th && !$('#btnWs')) { const b = document.createElement('button'); b.id = 'btnWs'; b.className = 'ghost'; b.textContent = '🧭'; b.dataset.i18nTitle = 'ws.title'; b.title = I18N.t('ws.title'); b.setAttribute('aria-label', I18N.t('ws.title')); th.before(b); b.addEventListener('click', () => ($('#v152Drawer.on') ? U.close() : U.open())); }
    palWrap();
    if (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS)) V14.SHORTCUTS.push(['H', 'HUD clean mode (hide panels for recordings)'], ['Ctrl (hold)', 'Magnet: snap drawings to candle OHLC'], ['1 / 2 / 5 / 0 (replay)', 'Replay speed 1× / 2× / 5× / 10×'], ['Ctrl+K → 10000*0.015/12.5', 'Inline calculator']);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Control') U.ctrl = true;
      if (typeof Replay !== 'undefined' && Replay.on && !e.ctrlKey && !e.altKey && !p2typing() && V152.REPLAY_KEYS[e.code]) { const sp = V152.REPLAY_KEYS[e.code], b = $(`#rpSpeed button[data-sp="${sp}"]`); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); toast('Replay ' + sp + '×'); } return; }
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && !p2typing() && !document.querySelector('.v13-modal, #langGate, #tourOv')) { e.preventDefault(); const on = U.hud(); toast(on ? 'HUD clean mode on · press H to exit' : 'HUD clean mode off'); }
    }, true);
    document.addEventListener('keyup', (e) => { if (e.key === 'Control') U.ctrl = false; }); window.addEventListener('blur', () => { U.ctrl = false; });
    Feed.tradeL.push((sym, p, q, side, ts) => { try { onTrade(sym, p, q, side, ts); } catch (e) { /* never break the feed */ } });
    if (typeof Sol !== 'undefined' && Array.isArray(Sol.listeners)) Sol.listeners.push((ev) => { try { const t = ev && (ev.trade || ev); if (!t || t.side !== 'buy' || !t.sym) return; const w = Sol.byAddr ? Sol.byAddr(t.wallet || t.who) : null; V151.pushCapped(U.buys, { sym: t.sym, who: (w && w.name) || String(t.wallet || t.who || '').slice(0, 8), side: 'buy', t: (t.ts > 1e11 ? t.ts / 1000 : t.ts) || Date.now() / 1000, usd: t.usd, winRate: w && w.stats ? w.stats.winRate : null }, 400); const hits = V152.confluence(U.buys); const fresh = hits.filter((h) => !U.conf.some((x) => x.sym === h.sym && Math.abs(x.t - h.t) < 300)); for (const h of fresh) { U.conf.push(h); V151UI.badge(h.sym, 'smart', `🎯 confluence: ${h.wallets.length} wallets`); toast(`🎯 Smart-money confluence on ${esc(baseOf(h.sym))}: ${esc(h.wallets.join(', '))}`, 'acc', 8000); } } catch (e) { /* never break the feed */ } });
    if (typeof setMode === 'function') { const _sm = setMode; setMode = function (m) { const t0 = performance.now(), from = ST.mode; try { V152.memo(cfg().mem, from, { tf: ST.tf, risk: (ST.v151 || {}).risk, ind: ST.ind || {} }); } catch (e) { /* memory is best effort */ } const r = _sm.apply(this, arguments); if (ST.mode !== from) { const rec = V152.recall(cfg().mem, ST.mode); if (rec) { if (ST.v151) ST.v151.risk = rec.risk; if (rec.ind && Object.keys(rec.ind).length) { ST.ind = Object.assign(ST.ind || {}, rec.ind); if (typeof chart !== 'undefined' && chart) { Object.assign(chart.o, rec.ind); chart.invalidate(); } } } U.lastSwapMs = performance.now() - t0; save(); } return r; }; }
    if (typeof ChartTrade !== 'undefined') { const _pl = ChartTrade.place; ChartTrade.place = function () { if (!cfg().cro || U.croOk) { U.croOk = false; return _pl.apply(this, arguments); } const d = ChartTrade.draft; if (!d) return _pl.apply(this, arguments); const D = candles(), c = D.map((x) => x.c), e200 = V152.seriesOf(D, 'ema200').pop(), rsi = V152.seriesOf(D.slice(-200), 'rsi14').pop(), eq = (() => { try { return ACC.equity(priceMap()); } catch (x) { return ACC.cash; } })(); const C = typeof Journal !== 'undefined' ? Journal.closed(Journal.entries || []) : []; let streak = 0; for (let i = C.length - 1; i >= 0 && !C[i].win; i--) streak++;
      const g = V152.critique({ side: 'buy', entry: d.entry, sl: d.sl, tp: d.tp, riskPct: d.sl > 0 && eq > 0 ? ((d.usd / d.entry) * Math.abs(d.entry - d.sl) / eq) * 100 : null, trendUp: c.length > 200 ? c[c.length - 1] > e200 : null, rsi, eventSoon: U.eventList().some((x) => x.inSec < 6 * 3600), openPositions: Object.keys(ACC.pos || {}).length, lossStreak: streak });
      const ov2 = p2modal(`😈 Devil's advocate · grade ${g.grade}`, `<div class="v152-grade g-${g.grade.toLowerCase()}">${esc(g.grade)}<span>${esc(g.score)}/100</span></div><ul class="v152-notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><div class="row" style="justify-content:flex-end;gap:6px"><button type="button" class="btn sm" data-cro="go">Place anyway</button></div>`, 'v152Cro');
      ov2.querySelector('[data-cro="go"]').addEventListener('click', () => { ov2.remove(); U.croOk = true; ChartTrade.place(); }); return null; }; }
    if (typeof renderWatch === 'function') { const _rw = renderWatch; renderWatch = function () { const r = _rw.apply(this, arguments); try { decorateWatch(); } catch (e) { /* decoration only */ } return r; }; }
    if (typeof P4UI !== 'undefined' && P4UI.Bubbles) { const _b = P4UI.Bubbles; P4UI.Bubbles = function (host, o) { const B = _b.apply(this, arguments), _set = B.set; B.set = function (items) { if (Array.isArray(items)) items = items.map((it) => (it && it._flowRaw) || it); if (cfg().flowMode && Array.isArray(items)) { const now = Date.now() / 1000, win = U.flowWin || 300; items = items.map((it) => { const f = V152.netFlow(U.flow.get(it.id) || [], now, win)[it.id] || 0; return Object.assign({}, it, { _flowRaw: it, ch: Math.sign(f) * Math.min(12, Math.log10(1 + Math.abs(f) / 100) * 3), name: 'net ' + NT.fmtUSD(f, 0) + ' / ' + (win / 60) + 'm · ' + (it.name || '') }); }); } return _set.call(this, items); }; /* resize re-sets the mapped items: always map from the raw copy */ return B; }; }
    if (typeof renderHeat === 'function') { const _rh = renderHeat; renderHeat = function () { const r = _rh.apply(this, arguments); try { const bar = $('#p4HeatBar'); if (bar && ST.heat.asset !== 'onchain' && !$('#v152FlowSeg')) { const s = document.createElement('div'); s.className = 'seg'; s.id = 'v152FlowSeg'; bar.appendChild(s); s.addEventListener('click', (e) => { const b = e.target.closest('button[data-flow]'); if (!b) return; const v = b.dataset.flow; if (v === 'pct') cfg().flowMode = false; else { cfg().flowMode = true; U.flowWin = +v; } save(); renderHeat(); }); } const s = $('#v152FlowSeg'); if (s) s.innerHTML = [['pct', '% chg'], ['60', '$ 1m'], ['300', '$ 5m'], ['900', '$ 15m']].map(([v, l]) => `<button type="button" data-flow="${v}" class="${(cfg().flowMode ? String(U.flowWin || 300) : 'pct') === v ? 'on' : ''}" title="${v === 'pct' ? 'Colour by % change' : 'Colour by net buy − sell dollar flow'}">${l}</button>`).join(''); } catch (e) { /* heat bar optional */ } return r; }; }
    if (typeof TABS !== 'undefined' && TABS.set) { const _s = TABS.set.show; TABS.set.show = function () { const r = _s.apply(this, arguments); try { mountSettings(); } catch (e) { /* panel optional */ } return r; }; }
    setInterval(() => { // attach overlay + pointer hooks to the Markets chart, keep chrome in sync
      if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(U.overlay)) { chart.overlays.push(U.overlay); inv(); } ptHook(chart.cv);
      syncBadge(); pip(); dexStrip(); mountGrok();
      const c = cfg(); if (c.group && !U.applying) { const last = U.last || {}; if (last.sel !== ST.sel && last.sel != null && c.sync.sym) post('sym', ST.sel); if (last.tf !== ST.tf && last.tf != null && c.sync.tf) post('tf', ST.tf); U.last = { sel: ST.sel, tf: ST.tf }; chan(); }
    }, 1000);
    setInterval(() => { if (cfg().timer && typeof chart !== 'undefined' && chart && chart.tfSec > 0 && chart.tfSec <= 60 && curTab === 'markets' && !document.hidden) chart.invalidate(); }, 250);
    document.addEventListener('mousemove', () => { if (Date.now() - (U._xT || 0) < 60 || !cfg().group || !cfg().sync.cross || typeof chart === 'undefined' || !chart || !chart.mouse || !chart.L || !chart.L.D) return; const pt = chart.toTP(chart.mouse.x, chart.mouse.y); if (!pt) return; U._xT = Date.now(); post('cross', pt.t); }, { passive: true });
    setInterval(pollWalls, 2000); setInterval(tele, 5000); setTimeout(tele, 1500);
    setInterval(() => { let n = 0; for (const [sym, set] of StoresBySym) { if (sym === ST.sel) continue; for (const s of set) if (s.sec < 60) n += V152.trim(s.candles, 3600); } U.trimmed = (U.trimmed || 0) + n; }, 30000); // memory governor
    const fr = () => { U.frames++; requestAnimationFrame(fr); }; requestAnimationFrame(fr); setInterval(() => { U.fps = U.frames; U.frames = 0; }, 1000);
    setInterval(() => { if (cfg().sparks) decorateWatch(); }, 20000);
    const day = new Date().toDateString(); setTimeout(() => { const c = cfg(); if (c.autoBrief && c.briefDay !== day && !navigator.webdriver) { c.briefDay = day; save(); A.brief(); } }, 9000);
    setInterval(() => { const c = cfg(), d = new Date(); if (c.autoBrief && c.recapDay !== d.toDateString() && d.getHours() * 60 + d.getMinutes() >= 16 * 60 + 5) { c.recapDay = d.toDateString(); save(); A.recap(); } }, 60000);
  };
  U.cfg = cfg; U.A = A; U.R = R; U.decorateWatch = decorateWatch;
  return U;
})();
// wire up after boot (ST is loaded, the Markets chart and the palette exist)
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b152 = boot; boot = async function () { await _b152.apply(this, arguments); try { V152UI.start(); } catch (e) { console.warn('v152 init', e); } }; }
