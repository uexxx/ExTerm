/* ExTerm v15 phase 2 UI: chart click-to-trade (+ button, draggable Entry/SL/TP lines, Breakeven / Partial-TP, Ctrl+Z/Y),
   realistic paper execution, backtest trade arrows, first-60-seconds walkthrough, 1-click live demo, Morning Brief,
   Field Manual and System Doctor. Pure math lives in v15p2core.js (P2). Strict CSP: every listener is attached here in JS,
   and anything that reaches innerHTML is escaped with esc(). */
const p2typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') || !!(document.activeElement && document.activeElement.isContentEditable);
const p2modal = (title, html, id) => {
  const old = document.getElementById(id); if (old) old.remove();
  const ov = document.createElement('div'); ov.className = 'v13-modal'; ov.id = id; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
  ov.innerHTML = `<div class="v13-card p2-card"><h3>${esc(title)}</h3>${html}<div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn sm pri" data-close>Close</button></div></div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', k); }; const k = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); }); document.addEventListener('keydown', k);
  document.body.appendChild(ov); setTimeout(() => { const b = ov.querySelector('[data-close]'); if (b) b.focus(); }, 20); return ov;
};

/* ───────────── 1. chart click-to-trade ───────────── */
const ChartTrade = (() => {
  const T = { hist: new P2.History(), draft: null, drag: null, price: null, ys: {}, hover: null, b: null, menu: null };
  const fp = (v) => NT.fmtPrice(v);
  const on = () => !(ST.settings && ST.settings.clickTrade === false);
  const num = (sel) => { const el = $(sel), v = el ? parseFloat(el.value) : NaN; return v > 0 ? v : 0; };
  const slOf = (m, e) => (m && m.slPx > 0 ? m.slPx : m && m.slPct > 0 ? e * (1 - m.slPct) : null);
  const tpOf = (m, e) => (m && m.tpPx > 0 ? m.tpPx : m && m.tpPct > 0 ? e * (1 + m.tpPct) : null);
  const split = (key) => { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; };

  /* a bracket is addressed by key: 'draft' | 'pos:<sym>' | 'ord:<id>' (limit buy) | 'stop:<id>' (stop buy) */
  T.find = (key) => {
    if (!key) return null;
    if (key === 'draft') { const d = T.draft; return d ? { kind: 'draft', key, sym: d.sym, entry: d.entry, sl: d.sl, tp: d.tp, usd: d.usd } : null; }
    const [k, id] = split(key);
    if (k === 'pos') { const p = ACC.pos[id]; return p && p.qty > 0 ? { kind: 'pos', key, sym: id, entry: p.cost / p.qty, sl: p.sl, tp: p.tp, qty: p.qty } : null; }
    if (k === 'ord') { const o = (ACC.orders || []).find((x) => x.id === id); return o ? { kind: 'order', key, sym: o.sym, entry: o.price, sl: slOf(o.meta, o.price), tp: tpOf(o.meta, o.price), usd: o.size } : null; }
    if (k === 'stop') { const o = (ST.stops || []).find((x) => x.id === id); return o ? { kind: 'stop', key, sym: o.sym, entry: o.trigger, sl: slOf(o.meta, o.trigger), tp: tpOf(o.meta, o.trigger), usd: o.usd } : null; }
    return null;
  };
  T.cur = () => {
    const sy = ST.sel;
    if (T.draft && T.draft.sym === sy) return T.find('draft');
    if (ACC.pos[sy] && ACC.pos[sy].qty > 0) return T.find('pos:' + sy);
    const o = (ACC.orders || []).filter((x) => x.sym === sy && x.side === 'buy').pop(); if (o) return T.find('ord:' + o.id);
    const st = (ST.stops || []).filter((x) => x.sym === sy && x.side === 'buy').pop(); if (st) return T.find('stop:' + st.id);
    return null;
  };
  T.set = (key, field, v) => {
    if (!/^(entry|sl|tp)$/.test(field)) return false;
    if (key === 'draft') { if (!T.draft) return false; T.draft[field] = v; return true; }
    const [k, id] = split(key);
    if (k === 'pos') { const p = ACC.pos[id]; if (!p || field === 'entry') return false; p[field] = v; return true; }
    const o = k === 'ord' ? (ACC.orders || []).find((x) => x.id === id) : k === 'stop' ? (ST.stops || []).find((x) => x.id === id) : null;
    if (!o) return false;
    if (field === 'entry') { if (k === 'ord') o.price = v; else o.trigger = v; return true; }
    o.meta = o.meta || {}; o.meta[field + 'Px'] = v; delete o.meta[field + 'Pct']; return true;
  };
  T.changed = (save = true) => {
    if (save) saveState();
    if (typeof chart !== 'undefined' && chart) chart.invalidate();
    if (typeof curTab !== 'undefined' && curTab === 'markets') { try { renderPosStrip(); renderTicketMeta(); } catch (e) { /* ticket not built yet */ } }
  };
  T.apply = (a, back) => {
    if (!a) return false;
    if (!T.set(a.key, a.field, back ? a.from : a.to)) { toast('That line no longer exists, so there is nothing to undo.', 'amb'); return true; }
    T.changed(a.key !== 'draft'); return true;
  };
  const movable = (b, f) => (b.kind === 'pos' ? f !== 'entry' : true);

  /* ── canvas overlay: shaded risk/reward zones, the three lines, $ / % labels and price-axis tags ── */
  T.label = (f, v, b, m) => {
    if (f === 'tp') return `TP ${fp(v)}` + (m.reward != null ? `  +${NT.fmtUSD(m.reward)} (${NT.fmtPct(m.tpPct)})` : '');
    if (f === 'sl') return `SL ${fp(v)}` + (m.risk != null ? `  ${NT.fmtUSD(m.risk)} (${NT.fmtPct(m.slPct)})` : '');
    const kind = { draft: 'Entry (draft)', pos: 'Entry', order: 'Buy limit', stop: 'Buy stop' }[b.kind];
    let s = `${kind} ${fp(v)}` + (m.rr ? `  ·  R:R 1:${m.rr.toFixed(2)}` : '');
    if (b.kind === 'pos') { const l = P2.live(b, px(b.sym)); if (l.pnl != null) s += `  ·  ${l.pnl >= 0 ? '+' : ''}${NT.fmtUSD(l.pnl)} (${NT.fmtPct(l.pct)})`; }
    return s;
  };
  T.overlay = (g, L, ch) => {
    T.ys = {};
    if (typeof chart === 'undefined' || ch !== chart || !on() || !L.py) { T.b = null; T.box(null); return; }
    const b = T.cur(); T.b = b; if (!b) { T.box(null); return; }
    const top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, x0 = L.Lm, x1 = L.W - L.Rm, col = L.col, m = P2.bracket(b), clampY = (y) => Math.max(top + 9, Math.min(bot - 9, y));
    g.save(); g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle';
    const ye = clampY(L.py(b.entry));
    for (const [v, c] of [[b.tp, col.up], [b.sl, col.dn]]) { if (!(v > 0)) continue; const y = clampY(L.py(v)); g.globalAlpha = 0.08; g.fillStyle = c; g.fillRect(x0, Math.min(ye, y), x1 - x0, Math.abs(y - ye)); }
    g.globalAlpha = 1;
    for (const [f, v, c] of [['tp', b.tp, col.up], ['entry', b.entry, col.acc], ['sl', b.sl, col.dn]]) {
      if (!(v > 0)) continue;
      const y = Math.round(clampY(L.py(v))) + 0.5, hot = (T.drag && T.drag.field === f) || T.hover === f; T.ys[f] = y;
      g.strokeStyle = c; g.lineWidth = hot ? 2.2 : 1.3; g.setLineDash(b.kind === 'pos' ? [] : [6, 4]);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      const txt = T.label(f, v, b, m), tw = g.measureText(txt).width + 14, bx = Math.max(x0 + 4, x1 - tw - 34);
      g.fillStyle = c; g.fillRect(bx, y - 9, tw, 18); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(txt, bx + 7, y);
      if (movable(b, f)) { g.fillStyle = c; for (let k = -3; k <= 3; k += 3) g.fillRect(bx - 12, y + k - 0.5, 8, 1.2); } // drag grip
      g.fillStyle = c; g.fillRect(x1, y - 9, L.Rm - 2, 18); g.fillStyle = '#fff'; g.fillText(fp(v), x1 + 5, y);
    }
    g.restore();
    T.box(b);
  };
  T.hit = (y) => {
    const b = T.b; if (!b) return null; let best = null, bd = 7;
    for (const f of ['entry', 'sl', 'tp']) { const yy = T.ys[f]; if (yy == null || !movable(b, f)) continue; const d = Math.abs(yy - y); if (d < bd) { bd = d; best = f; } }
    return best;
  };

  /* ── bracket box: size, entry, $ risk / reward, R:R, live P&L and the action buttons ── */
  T.box = (b) => {
    const host = typeof chart !== 'undefined' && chart ? chart.host : null; let el = T.boxEl;
    if (!b || !host) { if (el) el.hidden = true; return; }
    if (!el || !el.isConnected) {
      el = T.boxEl = document.createElement('div'); el.className = 'ct-box'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Trade bracket');
      el.addEventListener('click', T.boxClick); el.addEventListener('input', T.boxInput); el.addEventListener('pointerdown', (e) => e.stopPropagation());
      host.appendChild(el);
    }
    el.hidden = false;
    const key = b.kind + (b.sl > 0 ? 1 : 0) + (b.tp > 0 ? 1 : 0) + b.key;
    if (el._k !== key) {
      el._k = key;
      const head = { draft: `Long draft · ${b.entry > (px(b.sym) || 0) ? 'buy stop' : 'buy limit'}`, pos: 'Open position', order: 'Pending buy limit', stop: 'Pending buy stop' }[b.kind];
      const btn = (a, l, c = '') => `<button type="button" class="btn xs ${c}" data-ctb="${a}">${esc(l)}</button>`;
      const btns = b.kind === 'draft' ? btn('place', b.entry > (px(b.sym) || 0) ? 'Place buy stop' : 'Place buy limit', 'buy') + btn('x', 'Discard')
        : b.kind === 'pos' ? btn('be', 'Breakeven') + btn('ptp', 'Partial TP 50%') + btn('close', 'Close', 'sell')
        : btn('cancel', 'Cancel order');
      el.innerHTML = `<div class="ct-h"><b>${esc(baseOf(b.sym))}</b><span class="note">${esc(head)}</span></div>
        <div class="ct-g"><span>Size</span>${b.kind === 'draft' ? `<input class="in mono xs" data-ctin="usd" inputmode="decimal" aria-label="Size in USD" value="${esc(String(Math.round(b.usd * 100) / 100))}">` : '<b data-f="size"></b>'}
        <span>Entry</span><b data-f="entry"></b><span>Take profit</span><b class="up" data-f="tp"></b><span>Stop loss</span><b class="dn" data-f="sl"></b><span>Reward : risk</span><b data-f="rr"></b>${b.kind === 'pos' ? '<span>Live P&amp;L</span><b data-f="live"></b>' : ''}</div>
        <div class="ct-btns">${btns}${b.sl > 0 ? '' : btn('addsl', '+ Stop')}${b.tp > 0 ? '' : btn('addtp', '+ Target')}</div>
        <div class="note">Drag the lines · Ctrl+Z / Ctrl+Y · Esc</div>`;
    }
    const m = P2.bracket(b), set = (f, t, c) => { const x = el.querySelector(`[data-f="${f}"]`); if (x) { if (x.textContent !== t) x.textContent = t; if (c != null) x.className = c; } };
    set('size', b.kind === 'pos' ? `${NT.fmtQty(b.qty)} (${NT.fmtUSD(b.qty * b.entry)})` : NT.fmtUSD(b.usd));
    set('entry', fp(b.entry));
    set('tp', b.tp > 0 ? `${fp(b.tp)} · +${NT.fmtUSD(m.reward)} (${NT.fmtPct(m.tpPct)})` : 'none');
    set('sl', b.sl > 0 ? `${fp(b.sl)} · ${NT.fmtUSD(m.risk)} (${NT.fmtPct(m.slPct)})` : 'none (unprotected)');
    set('rr', m.rr ? '1 : ' + m.rr.toFixed(2) : '–', m.rr ? (m.rr >= 2 ? 'up' : m.rr >= 1 ? '' : 'amb') : '');
    if (b.kind === 'pos') { const l = P2.live(b, px(b.sym)); set('live', l.pnl == null ? '–' : `${l.pnl >= 0 ? '+' : ''}${NT.fmtUSD(l.pnl)} (${NT.fmtPct(l.pct)})`, l.pnl == null ? '' : l.pnl >= 0 ? 'up' : 'dn'); }
  };
  T.boxInput = (e) => { const t = e.target.closest('[data-ctin="usd"]'); if (!t || !T.draft) return; const v = parseFloat(t.value); if (v > 0 && isFinite(v)) { T.draft.usd = Math.min(v, 1e9); if (chart) chart.invalidate(); } };
  T.boxClick = (e) => {
    const t = e.target.closest('[data-ctb]'); if (!t) return; const a = t.dataset.ctb, b = T.cur(); if (!b) return;
    const now = Date.now(), sy = b.sym;
    if (a === 'place') T.place();
    else if (a === 'x') { T.draft = null; T.hist.clear(); T.changed(false); }
    else if (a === 'be' && b.kind === 'pos') { if (T.set(b.key, 'sl', b.entry)) { T.hist.push({ key: b.key, field: 'sl', from: b.sl, to: b.entry }); toast(`Stop moved to breakeven (${fp(b.entry)}) on ${esc(baseOf(sy))}. Ctrl+Z undoes it.`, 'acc'); T.changed(); } }
    else if (a === 'ptp' && b.kind === 'pos') { const p = px(sy); if (!(p > 0)) return toast('No price yet', 'amb'); const tr = ACC.sell(sy, p, ACC.qty(sy) / 2, now, { reason: 'partial take-profit (50%)', src: 'manual' }); if (tr) tradeToast(tr, 'Paper account'); T.changed(); }
    else if (a === 'close' && b.kind === 'pos') { const p = px(sy); if (!(p > 0)) return toast('No price yet', 'amb'); const tr = ACC.sell(sy, p, null, now, { reason: 'closed from the chart', src: 'manual' }); if (tr) tradeToast(tr, 'Paper account'); T.changed(); }
    else if (a === 'cancel') { const [k, id] = split(b.key); if (k === 'ord') ACC.cancel(id); else ST.stops = (ST.stops || []).filter((x) => x.id !== id); toast('Order cancelled', 'acc'); T.changed(); }
    else if (a === 'addsl' || a === 'addtp') {
      const f = a === 'addsl' ? 'sl' : 'tp', p = px(sy) || b.entry, base = b.kind === 'pos' ? Math.min(p, b.entry) : b.entry;
      const v = P2.clampLine(f, f === 'sl' ? base * 0.98 : Math.max(p, b.entry) * 1.04, b);
      if (v && T.set(b.key, f, v)) { T.hist.push({ key: b.key, field: f, from: b[f] || null, to: v }); T.changed(b.key !== 'draft'); }
    }
  };

  /* ── actions from the + menu ── */
  T.act = (a, p) => {
    const sy = ST.sel, c = px(sy), now = Date.now(); if (!(p > 0)) return;
    if (a === 'buy') {
      T.draft = Object.assign({ sym: sy, usd: num('#tkUsd') || 1000 }, P2.defaults(p, num('#tkSl'), num('#tkTp')));
      T.hist.clear(); T.changed(false); toast('Drag the Entry, Stop and Target lines, then press Place.', 'acc', 4000);
    } else if (a === 'sell') {
      const q = ACC.qty(sy); if (!(q > 0)) return toast('No ' + esc(baseOf(sy)) + ' position to sell', 'amb');
      if (c > 0 && p > c) { ACC.placeLimit(sy, 'sell', p, q, now, {}); toast(`Sell limit placed: ${NT.fmtQty(q)} ${esc(baseOf(sy))} @ ${fp(p)}`, 'acc'); }
      else { ST.stops = ST.stops || []; ST.stops.push({ id: NT.uid(), sym: sy, side: 'sell', trigger: p, usd: q * p, meta: {}, ts: now }); toast(`Sell stop armed: ${NT.fmtQty(q)} ${esc(baseOf(sy))} if price falls to ${fp(p)}`, 'acc'); }
      T.changed();
    } else if (a === 'alert') {
      const dir = c > 0 && p < c ? 'below' : 'above';
      ST.alerts.push({ id: NT.uid(), sym: sy, dir, price: p, active: true, created: now }); Feed.subscribe([sy]); saveState();
      toast(`🔔 Alert set: ${esc(baseOf(sy))} ${dir} ${fp(p)}`, 'acc');
    } else if (a === 'hline' && chart) {
      chart.addDrawing({ type: 'h', p }); ST.draw = ST.draw || {}; ST.draw[ST.sel] = chart.drawings.slice(); saveState(); chart.invalidate();
    }
  };
  T.place = () => {
    const d = T.draft; if (!d) return null;
    const sy = d.sym, c = px(sy), now = Date.now();
    if (typeof Replay !== 'undefined' && Replay.on) { toast('Exit Bar Replay first', 'amb'); return null; }
    if (!(d.usd >= 1)) { toast('Enter a size in USD', 'amb'); return null; }
    if (!(c > 0)) { toast('No price yet for ' + esc(baseOf(sy)), 'amb'); return null; }
    const meta = {}; if (d.sl > 0) meta.slPx = d.sl; if (d.tp > 0) meta.tpPx = d.tp;
    const brk = `${d.sl > 0 ? ' · SL ' + fp(d.sl) : ''}${d.tp > 0 ? ' · TP ' + fp(d.tp) : ''}`;
    let r;
    if (d.entry <= c) { r = ACC.placeLimit(sy, 'buy', d.entry, d.usd, now, meta); toast(`Buy limit placed: ${NT.fmtUSD(d.usd)} of ${esc(baseOf(sy))} @ ${fp(d.entry)}${brk}`, 'acc'); }
    else { r = { id: NT.uid(), sym: sy, side: 'buy', trigger: d.entry, usd: d.usd, meta, ts: now }; ST.stops = ST.stops || []; ST.stops.push(r); toast(`Buy stop armed: ${NT.fmtUSD(d.usd)} of ${esc(baseOf(sy))} when price rises to ${fp(d.entry)}${brk}`, 'acc'); }
    T.draft = null; T.hist.clear(); Feed.subscribe([sy]); T.changed();
    return r;
  };
  T.demo = () => { const c = px(ST.sel); if (!(c > 0)) return false; showTab('markets'); T.act('buy', c * 0.99); return true; };
  T.nudge = () => { let b = T.cur(); if (!b) { T.demo(); b = T.cur(); } if (!b || !(b.sl > 0)) return false; const v = P2.clampLine('sl', b.sl * 0.995, b); if (!v || !T.set(b.key, 'sl', v)) return false; T.hist.push({ key: b.key, field: 'sl', from: b.sl, to: v }); T.changed(b.key !== 'draft'); return true; };

  /* ── + menu ── */
  T.menuClose = () => { if (T.menu) T.menu.remove(); T.menu = null; document.removeEventListener('pointerdown', T.outside, true); if (T.plus) T.plus.hidden = true; };
  T.outside = (e) => { if (T.menu && !T.menu.contains(e.target) && e.target !== T.plus) T.menuClose(); };
  T.menuOpen = (p) => {
    if (!(p > 0) || typeof chart === 'undefined' || !chart) return;
    T.menuClose();
    const sy = ST.sel, c = px(sy), below = c > 0 ? p < c : true, have = ACC.qty(sy) > 0;
    const items = [['buy', `🟢 Buy ${below ? 'limit' : 'stop'} @ ${fp(p)}`, ''], ['sell', `🔴 Sell ${below ? 'stop' : 'limit'} @ ${fp(p)}`, have ? '' : 'You have no position to sell'], ['alert', `🔔 Price alert @ ${fp(p)}`, ''], ['hline', `― Horizontal level @ ${fp(p)}`, '']];
    const el = document.createElement('div'); el.className = 'ct-menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'Trade at ' + fp(p));
    el.innerHTML = `<div class="ct-mh">${esc(baseOf(sy))} @ ${esc(fp(p))}</div>` + items.map(([a, l, dis]) => `<button type="button" role="menuitem" data-cta="${a}"${dis ? ` disabled title="${esc(dis)}"` : ''}>${esc(l)}</button>`).join('');
    const L = chart.L, y = Math.max(4, Math.min(((L && L.H) || 400) - 190, (T.plusY || 40) - 8));
    el.style.top = y + 'px'; el.style.right = ((L && L.Rm) || 62) + 26 + 'px';
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-cta]'); if (!b || b.disabled) return; T.menuClose(); T.act(b.dataset.cta, p); });
    el.addEventListener('keydown', (e) => {
      const bs = [...el.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); } else if (e.key === 'Escape') { e.preventDefault(); T.menuClose(); }
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    chart.host.appendChild(el); T.menu = el; T.price = p;
    setTimeout(() => { document.addEventListener('pointerdown', T.outside, true); const f = el.querySelector('button:not([disabled])'); if (f) f.focus(); }, 0);
  };
  T.movePlus = (x, y) => {
    const ch = chart, L = ch && ch.L, pl = T.plus; if (!pl || !L) return;
    const inside = L.py && x >= L.Lm && x <= L.W - L.Rm && y >= L.y0 && y <= L.y0 + L.mainH - (L.volH || 0) - 4;
    if (!on() || ch.tool || T.drag || !inside || T.hover) { if (!T.menu) pl.hidden = true; return; }
    const pt = ch.toTP(x, y); if (!pt || !(pt.p > 0)) return;
    T.price = pt.p; T.plusY = y; pl.hidden = false;
    pl.style.left = (L.W - L.Rm - 24) + 'px'; pl.style.top = (y - 10) + 'px'; pl.title = 'Trade at ' + fp(pt.p) + ': buy, sell, alert or level';
  };

  /* ── wiring: capture-phase pointer handlers run before the chart's own pan/draw handlers ── */
  T.attach = (ch) => {
    if (!ch || ch._ct) return; ch._ct = true;
    const cv = ch.cv, host = ch.host;
    ch.overlays.push(T.overlay);
    const pl = T.plus = document.createElement('button'); pl.type = 'button'; pl.className = 'ct-plus'; pl.textContent = '+'; pl.hidden = true; pl.setAttribute('aria-label', 'Trade at this price'); host.appendChild(pl);
    pl.addEventListener('click', (e) => { e.stopPropagation(); T.menuOpen(T.price); });
    pl.addEventListener('pointerdown', (e) => e.stopPropagation());
    const loc = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !on() || ch.tool) return;
      const f = T.hit(loc(e).y); if (!f || !T.b) return;
      e.stopImmediatePropagation(); e.preventDefault();
      T.drag = { key: T.b.key, field: f, from: T.b[f] }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ }
      ch.invalidate();
    }, true);
    cv.addEventListener('pointermove', (e) => {
      const { x, y } = loc(e), L = ch.L; if (!L) return;
      if (T.drag) {
        const yy = Math.max(L.y0 + 1, Math.min(L.y0 + L.mainH - (L.volH || 0) - 5, y)), pt = ch.toTP(x, yy), b = T.find(T.drag.key);
        if (pt && b) { let v = P2.clampLine(T.drag.field, pt.p, b); const c = px(b.sym); if (v && b.kind === 'order' && T.drag.field === 'entry' && c > 0) v = Math.min(v, c); if (v && T.set(T.drag.key, T.drag.field, v)) ch.invalidate(); }
        return;
      }
      const h = T.hit(y); if (h !== T.hover) { T.hover = h; cv.style.cursor = h ? 'ns-resize' : 'crosshair'; ch.invalidate(); }
      T.movePlus(x, y);
    }, true);
    const up = () => {
      if (!T.drag) return; const d = T.drag; T.drag = null; const b = T.find(d.key);
      if (b) T.hist.push({ key: d.key, field: d.field, from: d.from, to: b[d.field] });
      T.changed(d.key !== 'draft');
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); window.addEventListener('pointerup', up);
    host.addEventListener('pointerleave', () => { if (!T.menu && T.plus) T.plus.hidden = true; if (T.hover) { T.hover = null; cv.style.cursor = 'crosshair'; } });
  };
  T.onKey = (e) => {
    if (typeof curTab === 'undefined' || curTab !== 'markets' || p2typing() || document.querySelector('.v13-modal, #tourOv')) return;
    if (e.key === 'Escape') { if (T.menu) { e.preventDefault(); T.menuClose(); } else if (T.draft) { e.preventDefault(); T.draft = null; T.hist.clear(); T.changed(false); } return; }
    const mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase(), z = mod && k === 'z' && !e.shiftKey, y = mod && (k === 'y' || (e.shiftKey && k === 'z'));
    // line moves undo first; once that history is empty, Ctrl+Z falls through to the drawing undo (v13)
    const live = (a) => { const b = a && T.find(a.key); return !!b && b.sym === ST.sel; };
    while (T.hist.u.length && !live(T.hist.u[T.hist.u.length - 1])) T.hist.u.pop();
    while (T.hist.r.length && !live(T.hist.r[T.hist.r.length - 1])) T.hist.r.pop();
    if (z && T.hist.canUndo) { e.preventDefault(); e.stopImmediatePropagation(); T.apply(T.hist.undo(), true); }
    else if (y && T.hist.canRedo) { e.preventDefault(); e.stopImmediatePropagation(); T.apply(T.hist.redo(), false); }
  };
  return T;
})();

/* ───────────── 2. realistic paper execution ───────────── */
const ExecSim = (() => {
  const X = { books: {} };
  X.on = () => !!(ST.settings && ST.settings.realExec);
  X.ctx = (sym) => {
    if (typeof isStock === 'function' && isStock(sym)) return { kind: 'stock' };
    if (typeof isOnchain === 'function' && isOnchain(sym)) { const st = (typeof OC !== 'undefined' && OC.stats && OC.stats[sym]) || {}; return { kind: 'dex', liq: st.liq }; }
    const b = X.books[sym]; return { kind: 'cex', book: b && Date.now() - b.ts < 120000 ? b.bk : null };
  };
  // limit-type fills keep their price (that's the point of a limit); market, stop and stop-loss fills pay the spread + impact
  X.skip = (meta) => /^(limit (buy|sell)|take-profit)/.test(String((meta && meta.reason) || ''));
  X.note = (x) => ` · fill: spread ${x.spreadBp.toFixed(1)} bp + ${x.kind === 'dex' ? 'pool slippage' : 'depth impact'} ${x.impactBp.toFixed(1)} bp`;
  X.install = () => {
    if (X._in) return; X._in = true;
    if (typeof Depth3D !== 'undefined') {
      const _p = Depth3D.push;
      Depth3D.push = function (sym, bk) { try { if (bk && Array.isArray(bk.asks) && Array.isArray(bk.bids)) X.books[sym] = { bk: { bids: bk.bids.slice(0, 50), asks: bk.asks.slice(0, 50) }, ts: Date.now() }; } catch (e) { /* malformed book */ } return _p.apply(this, arguments); };
    }
    const A = NT.Account.prototype, _buy = A.buy, _sell = A.sell;
    A.buy = function (sym, price, usd, ts, meta = {}) {
      if (typeof ACC === 'undefined' || this !== ACC || !X.on() || X.skip(meta) || !(price > 0) || !(usd > 0)) return _buy.apply(this, arguments);
      const x = P2.exec('buy', price, Math.min(usd, this.cash), X.ctx(sym));
      const t = _buy.call(this, sym, x.price / (1 + this.slip), usd, ts, Object.assign({}, meta, { reason: (meta.reason || 'buy') + X.note(x) }));
      if (t) t.exec = { ref: price, spreadBp: +x.spreadBp.toFixed(2), impactBp: +x.impactBp.toFixed(2), kind: x.kind };
      return t;
    };
    A.sell = function (sym, price, qty, ts, meta = {}) {
      const p = this.pos && this.pos[sym];
      if (typeof ACC === 'undefined' || this !== ACC || !X.on() || X.skip(meta) || !(price > 0) || !p) return _sell.apply(this, arguments);
      const q = Math.min(qty == null ? p.qty : qty, p.qty), x = P2.exec('sell', price, q * price, X.ctx(sym));
      const t = _sell.call(this, sym, x.price / (1 - this.slip), qty, ts, Object.assign({}, meta, { reason: (meta.reason || 'sell') + X.note(x) }));
      if (t) t.exec = { ref: price, spreadBp: +x.spreadBp.toFixed(2), impactBp: +x.impactBp.toFixed(2), kind: x.kind };
      return t;
    };
    const _r = renderTicketMeta;
    renderTicketMeta = function () { const r = _r.apply(this, arguments); try { X.mountTicket(); const cb = $('#tkReal'); if (cb) cb.checked = X.on(); X.estimate(); } catch (e) { /* ticket not built */ } return r; };
  };
  X.mountTicket = () => {
    const tk = $('#ticket');
    // the ticket's own inputs call the original renderTicketMeta directly (bound before this wrapper existed): re-add the estimate after them
    if (tk && !tk._p2) { tk._p2 = true; tk.addEventListener('input', (e) => { if (e.target && e.target.id === 'tkReal') return; try { X.estimate(); } catch (e) { /* ticket mid-rebuild */ } }); }
    const est = $('#tkEst'); if (!est || $('#tkReal')) return;
    const lab = document.createElement('label'); lab.className = 'ct-exec note'; lab.title = 'Simulates the real bid-ask spread, order-book depth for your size and DEX pool slippage on market and stop fills';
    lab.innerHTML = '<input type="checkbox" id="tkReal"> Realistic fills <span class="mut">(spread · depth · DEX slippage)</span>';
    est.parentNode.insertBefore(lab, est);
    const cb = $('#tkReal'); cb.checked = X.on();
    cb.addEventListener('change', () => { ST.settings.realExec = cb.checked; saveState(); renderTicketMeta(); toast(cb.checked ? 'Realistic paper fills on: market and stop orders now pay the spread and depth impact.' : 'Realistic fills off: paper orders fill at the quoted price plus the flat slippage setting.', 'acc'); });
  };
  X.estimate = () => {
    const el = $('#tkEst');
    if (!el || !X.on() || typeof tkType === 'undefined' || tkType === 'limit') return;
    const s = ST.sel, p = tkType === 'stop' ? parseFloat(($('#tkLimit') || {}).value) : px(s), usd = tkAmount(); if (!(p > 0) || !(usd > 0)) return;
    const x = P2.exec(tkSide, p, usd, X.ctx(s)), add = `realistic fill ≈ ${NT.fmtPrice(x.price)} (spread ${x.spreadBp.toFixed(1)} bp + impact ${x.impactBp.toFixed(1)} bp)${x.note ? ': ' + x.note : ''}`;
    const base = el.textContent.split(/ · realistic fill ≈ |^realistic fill ≈ /)[0]; // idempotent: never append twice
    el.textContent = base ? base + ' · ' + add : add;
  };
  return X;
})();

/* ───────────── 3. backtest trade arrows ───────────── */
const BTArrows = (() => {
  const B = {};
  B.on = () => !(ST.settings && ST.settings.btArrows === false);
  B.attach = (pc, trades) => {
    if (!pc || !pc.host) return;
    pc._trips = P2.trips(trades); pc._arrPts = []; B.last = pc;
    if (!pc.overlays.includes(B.overlay)) pc.overlays.push(B.overlay);
    const st = P2.tripStats(pc._trips), sec = pc.host.previousElementSibling;
    if (sec && !sec.querySelector('.bt-arr')) {
      const lab = document.createElement('label'); lab.className = 'bt-arr';
      lab.innerHTML = `<input type="checkbox" id="btArr"> Trade arrows overlay <span class="mut">${st.n ? `${st.wins} wins · ${st.losses} losses${st.winRate != null ? ' · ' + Math.round(st.winRate) + '% hit rate' : ''}` : 'no closed trades'}</span>`;
      sec.appendChild(lab);
      const cb = lab.querySelector('input'); cb.checked = B.on();
      cb.addEventListener('change', () => { ST.settings.btArrows = cb.checked; saveState(); B.apply(pc); });
    }
    if (!pc._tip) { const tip = document.createElement('div'); tip.className = 'bt-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); pc.host.appendChild(tip); pc._tip = tip; }
    pc.onHover = (t, m) => B.hover(pc, m);
    B.apply(pc);
  };
  B.apply = (pc) => { pc.o.trades = !B.on(); if (!B.on() && pc._tip) pc._tip.hidden = true; pc.invalidate(); };
  const tri = (g, x, y, s, up) => { g.beginPath(); if (up) { g.moveTo(x, y); g.lineTo(x - s, y + s * 1.5); g.lineTo(x + s, y + s * 1.5); } else { g.moveTo(x, y); g.lineTo(x - s, y - s * 1.5); g.lineTo(x + s, y - s * 1.5); } g.closePath(); g.fill(); g.stroke(); };
  B.overlay = (g, L, ch) => {
    ch._arrPts = [];
    if (!B.on() || !ch._trips || !ch._trips.length || !L.D || !L.D.length || !L.py) return;
    const col = L.col, top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0), x0 = L.Lm, x1 = L.W - L.Rm, tA = L.D[L.start].t, tZ = L.D[L.end - 1].t, s = Math.max(4, Math.min(8, L.bw * 0.7));
    g.save(); g.beginPath(); g.rect(x0, top, x1 - x0, bot - top); g.clip(); g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center';
    for (const tr of ch._trips) {
      const tEnd = tr.t1 != null ? tr.t1 : tZ; if (tEnd < tA || tr.t0 > tZ) continue;
      const c = tr.open ? col.acc : tr.win ? col.up : col.dn, up = !tr.short, xa = ch.tToX(tr.t0), ya = L.py(tr.avg || tr.p0);
      g.strokeStyle = col.pan; g.lineWidth = 1.2; g.fillStyle = c;
      if (tr.p1 > 0) {
        const xb = ch.tToX(tr.t1), yb = L.py(tr.p1);
        g.save(); g.strokeStyle = c; g.globalAlpha = 0.7; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke(); g.restore();
        tri(g, xb, up ? yb - 3 : yb + 3, s, !up); ch._arrPts.push({ x: xb, y: up ? yb - 3 - s : yb + 3 + s, tr, k: 'exit' });
        if (tr.pct != null && L.bw > 1.5) { g.fillStyle = c; g.textBaseline = up ? 'bottom' : 'top'; g.fillText((tr.pct >= 0 ? '+' : '') + tr.pct.toFixed(1) + '%', xb, up ? yb - 6 - s * 1.5 : yb + 6 + s * 1.5); }
      }
      g.fillStyle = c; tri(g, xa, up ? ya + 3 : ya - 3, s, up); ch._arrPts.push({ x: xa, y: up ? ya + 3 + s : ya - 3 - s, tr, k: 'entry' });
    }
    g.restore();
  };
  B.hover = (pc, m) => {
    const tip = pc._tip; if (!tip) return;
    if (!m || !B.on()) { tip.hidden = true; return; }
    let best = null, bd = 12; for (const p of pc._arrPts || []) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = p; } }
    if (!best) { tip.hidden = true; return; }
    const tr = best.tr, stamp = (t) => (typeof fmtStamp === 'function' ? fmtStamp(t * 1000) : new Date(t * 1000).toISOString().slice(0, 16));
    const html = `<b class="${tr.open ? '' : tr.win ? 'up' : 'dn'}">${tr.open ? 'Open trade' : tr.win ? '✔ Win' : '✖ Loss'}${tr.pct != null ? ' ' + esc(NT.fmtPct(tr.pct)) : ''}${tr.short ? ' (short)' : ''}</b>
      <div>Entry ${esc(NT.fmtPrice(tr.avg || tr.p0))} · ${esc(stamp(tr.t0))}${tr.n > 1 ? ` · ${tr.n} buys` : ''}</div>${tr.p1 > 0 ? `<div>Exit ${esc(NT.fmtPrice(tr.p1))} · ${esc(stamp(tr.t1))}</div>` : ''}
      ${tr.pnl != null ? `<div>P&amp;L ${esc(NT.fmtUSD(tr.pnl))}</div>` : ''}${tr.why0 ? `<div class="note">In: ${esc(String(tr.why0).slice(0, 120))}</div>` : ''}${tr.reason ? `<div class="note">Out: ${esc(String(tr.reason).slice(0, 120))}</div>` : ''}`;
    if (tip._h !== html) { tip._h = html; tip.innerHTML = html; }
    tip.hidden = false; const w = pc.host.clientWidth || 600;
    tip.style.left = Math.max(4, Math.min(w - 230, m.x + 14)) + 'px'; tip.style.top = Math.max(4, m.y - 80) + 'px';
  };
  return B;
})();

/* ───────────── 4. first-60-seconds walkthrough ───────────── */
const Walk = (() => {
  const W = { on: false, i: 0, t0: 0, timer: 0, s0: null };
  const count = () => (ACC.orders || []).length + (ST.stops || []).length + Object.keys(ACC.pos || {}).length;
  W.STEPS = [
    { t: 'Pick a market', b: 'Type a symbol or click a watchlist row. Crypto, stocks and DEX tokens all share this chart.', go: () => { showTab('markets'); if (ST.mode !== 'crypto' && typeof setMode === 'function') setMode('crypto'); selectSym(ST.sel === 'ETH-USD' ? 'BTC-USD' : 'ETH-USD'); }, done: (s0) => ST.sel !== s0.sel },
    { t: 'Click + at a price', b: 'Hover the chart: a + follows your cursor along the price axis. Click it to buy, sell, set an alert or draw a level at that exact price.', go: () => ChartTrade.demo(), done: () => !!ChartTrade.draft || !!ChartTrade.menu },
    { t: 'Drag your stop and target', b: 'Drag the red SL and green TP lines. Dollar risk, reward and R:R update live. Ctrl+Z undoes a move.', go: () => ChartTrade.nudge(), done: () => ChartTrade.hist.canUndo },
    { t: 'Place it (paper money)', b: 'Press Place in the bracket box. Nothing here touches a real exchange.', go: () => { if (!ChartTrade.draft) ChartTrade.demo(); ChartTrade.place(); }, done: (s0) => count() > s0.n },
    { t: 'Test yourself', b: 'Challenges has replay rounds, Prop-Firm evaluations, Black Swan crashes and more, each graded A+ to F.', go: () => showTab('challenge'), done: () => curTab === 'challenge' },
  ];
  W.start = (from = 0) => {
    W.end(false); W.on = true; W.i = Math.max(0, Math.min(W.STEPS.length - 1, from | 0)); W.t0 = Date.now(); W.s0 = { sel: ST.sel, n: count() };
    const el = document.createElement('div'); el.id = 'walkCard'; el.className = 'walk-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'First 60 seconds walkthrough');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; const a = b.dataset.w; if (a === 'skip') W.end(true); else if (a === 'next') W.next(); else if (a === 'go') { try { W.STEPS[W.i].go(); } catch (x) { console.warn('walk', x); } } });
    document.body.appendChild(el); W.show(); W.timer = setInterval(W.tick, 400);
  };
  W.show = () => {
    const el = $('#walkCard'); if (!el) return; const st = W.STEPS[W.i];
    el.innerHTML = `<div class="walk-h"><b>⏱ First 60 seconds</b><span class="mono" id="walkT">0s</span><button type="button" class="x" data-w="skip" aria-label="Skip walkthrough">×</button></div><div class="walk-bar"><i id="walkBar"></i></div>
      <div class="note">Step ${W.i + 1} of ${W.STEPS.length}</div><h4>${esc(st.t)}</h4><p>${esc(st.b)}</p>
      <div class="row" style="gap:6px;justify-content:flex-end"><button type="button" class="btn sm" data-w="go">Show me</button><button type="button" class="btn sm pri" data-w="next">${W.i === W.STEPS.length - 1 ? 'Finish' : 'Next'}</button></div>`;
    W.tick();
  };
  W.tick = () => {
    if (!W.on) return; const sec = (Date.now() - W.t0) / 1000, t = $('#walkT'), bar = $('#walkBar');
    if (t) t.textContent = Math.floor(sec) + 's'; if (bar) bar.style.width = Math.min(100, (sec / 60) * 100).toFixed(1) + '%';
    try { if (W.STEPS[W.i].done(W.s0)) W.next(); } catch (e) { /* app not ready */ }
  };
  W.next = () => { W.i++; if (W.i >= W.STEPS.length) return W.end(true); W.s0 = { sel: ST.sel, n: count() }; W.show(); };
  W.end = (finished) => {
    clearInterval(W.timer); W.timer = 0; const el = $('#walkCard'); if (el) el.remove();
    if (!W.on) return; W.on = false;
    ST.settings.walkDone = true; ST.settings.tourDone = true; saveState();
    if (finished) toast(`Walkthrough done in ${Math.round((Date.now() - W.t0) / 1000)}s. Settings → 📘 Field Manual has the rest.`, 'acc', 6000);
  };
  return W;
})();

/* ───────────── 5. 1-click live demo preset ───────────── */
const LiveDemo = {
  run() {
    showTab('markets'); if (ST.mode !== 'crypto' && typeof setMode === 'function') setMode('crypto');
    if (ST.sel !== 'BTC-USD') selectSym('BTC-USD');
    ST.ind = Object.assign(ST.ind || {}, { ema: true, vol: true, trades: true });
    if (typeof chart !== 'undefined' && chart) { Object.assign(chart.o, { ema: true, vol: true, trades: true }); chart.invalidate(); }
    Object.assign(ST.settings, { realExec: true, clickTrade: true, btArrows: true }); saveState(); try { renderTicketMeta(); } catch (e) { /* ticket */ }
    let n = 0;
    const go = () => {
      if (px('BTC-USD') > 0 && typeof chart !== 'undefined' && chart && chart.L) { ChartTrade.demo(); toast('▶ Live demo: BTC with realistic fills and a draft bracket. Drag the lines, then press Place.', 'acc', 7000); if (!Walk.on) Walk.start(2); }
      else if (n++ < 40) setTimeout(go, 250);
    };
    go();
  },
};

/* ───────────── 6. Morning Brief ───────────── */
const Brief = (() => {
  const B = {};
  B.COMMANDS = [['+ on the chart', 'Buy / sell limit or stop, price alert or horizontal level at that price'], ['Drag Entry / SL / TP', 'Live dollar risk, reward and R:R'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo line moves, then drawings'], ['Esc', 'Close the + menu or discard a draft'], ['Ctrl+K', 'Command palette'], ['?', 'Keyboard shortcuts'], ['B / S', 'Buy / sell ticket'], ['1–9', 'Switch timeframe'], ['▶ Demo', '1-click live demo preset'], ['Settings → 📘 Field Manual', 'Searchable how-to with Try-this links']];
  B.day = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  B.data = () => {
    const pm = priceMap(), pos = Object.entries(ACC.pos || {}).map(([sym, p]) => ({ sym, qty: p.qty, avg: p.cost / p.qty, px: pm[sym] || px(sym), sl: p.sl, tp: p.tp }));
    let eq = null; try { eq = ACC.equity(pm); } catch (e) { /* prices not ready */ }
    return P2.brief({ watch: (ST.watch || []).slice(0, 24).map((sym) => ({ sym, ch: chg24(sym) })), pos, eq, eq0: ACC.cash0, orders: (ACC.orders || []).length + (ST.stops || []).length, alerts: (ST.alerts || []).filter((a) => a.active).length, streak: typeof Challenge !== 'undefined' ? Challenge.stats().streak : 0 });
  };
  B.open = () => {
    const d = B.data();
    const mv = d.movers.length ? d.movers.map((m) => `<span class="v14-mv"><b>${esc(baseOf(m.sym))}</b> <span class="${m.ch >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(m.ch))}</span></span>`).join('') : '<span class="note">Prices are still loading.</span>';
    const pos = d.pos.length ? `<table class="tbl"><tbody>${d.pos.map((p) => `<tr><td><b>${esc(baseOf(p.sym))}</b></td><td class="r num ${p.pnl == null ? '' : p.pnl >= 0 ? 'up' : 'dn'}">${p.pnl == null ? '–' : esc(NT.fmtUSD(p.pnl))}</td><td class="r note">${p.naked ? '<span class="amb">no stop</span>' : 'SL ' + esc(NT.fmtPct(p.toSl))}</td><td class="r note">${p.toTp == null ? '' : 'TP ' + esc(NT.fmtPct(p.toTp))}</td></tr>`).join('')}</tbody></table>` : '<div class="note">No open paper positions.</div>';
    const html = `<div class="brief"><div class="note">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <div class="sec">Market pulse (24h, your watchlist)</div><div class="v14-mvs">${mv}</div>
      <div class="sec">Paper account</div><div class="note">${d.eqCh != null ? `Equity vs start <b class="${d.eqCh >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(d.eqCh))}</b> · ` : ''}${d.orders} pending order${d.orders === 1 ? '' : 's'} · ${d.alerts} armed alert${d.alerts === 1 ? '' : 's'} · challenge streak ${d.streak}${d.naked ? ` · <span class="amb">${d.naked} position${d.naked === 1 ? '' : 's'} without a stop</span>` : ''}</div>${pos}
      <div class="sec">Command overview</div><table class="tbl v14-keys">${B.COMMANDS.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</table>
      <label class="note brief-auto"><input type="checkbox" id="briefAuto" ${ST.settings.brief === false ? '' : 'checked'}> Show the Morning Brief on my first visit each day</label></div>`;
    const ov = p2modal('☀ Morning Brief', html, 'p2Brief');
    const cb = ov.querySelector('#briefAuto'); if (cb) cb.addEventListener('change', () => { ST.settings.brief = cb.checked; saveState(); });
    return ov;
  };
  B.auto = () => {
    if (navigator.webdriver || ST.settings.brief === false || ST.settings.briefDay === B.day()) return false;
    ST.settings.briefDay = B.day(); saveState();
    setTimeout(() => { if (!document.querySelector('.v13-modal, #tourOv, #walkCard')) B.open(); }, 6000);
    return true;
  };
  return B;
})();

/* ───────────── 7. System Doctor (browser checks + the launcher's /api/doctor) ───────────── */
const Doctor = (() => {
  const D = { rows: [] };
  D.browser = () => {
    const out = [], add = (name, ok, detail) => out.push({ name, ok, detail: String(detail || '') });
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]'), csp = meta ? meta.getAttribute('content') || '' : '';
    add('Strict content security policy', /default-src 'none'/.test(csp) && /script-src 'sha256-/.test(csp), /script-src 'sha256-/.test(csp) ? 'default-src none, script pinned by SHA-256' : 'not the built file (run python build.py)');
    let ls = false; try { localStorage.setItem('nt.doc', '1'); localStorage.removeItem('nt.doc'); ls = true; } catch (e) { /* blocked */ }
    add('Browser storage', ls, ls ? 'saving works' : 'blocked: settings won’t persist (private window?)');
    add('Web Workers', typeof Worker === 'function', typeof Worker === 'function' ? 'backtests run off the main thread' : 'missing: backtests will be slow');
    add('WebSocket', typeof WebSocket === 'function', 'live trade streams');
    add('Chart refresh', typeof FPSGov !== 'undefined' && FPSGov.fps > 0 ? true : null, typeof FPSGov !== 'undefined' ? `${FPSGov.fps || 0} fps on a ${FPSGov.hz} Hz display` : 'unknown');
    add('Launcher (serve.py)', !!(typeof J !== 'undefined' && J.proxy), typeof J !== 'undefined' && J.proxy ? 'connected: live data, saving and background bots' : 'not running: start it with python serve.py for live data');
    add('Market data source', typeof Providers !== 'undefined' && Providers.active ? !/demo|sim/i.test(Providers.active.name) || null : null, typeof Providers !== 'undefined' && Providers.active ? Providers.active.name : 'unknown');
    return out;
  };
  D.clean = (c) => ({ name: String((c && c.name) || '').slice(0, 80), ok: c && c.ok === true ? true : c && c.ok === false ? false : null, detail: String((c && c.detail) || '').slice(0, 300) });
  D.run = async () => {
    const out = $('#docOut'); if (out) out.innerHTML = '<div class="note shimmer">Running checks…</div>';
    let rows = D.browser();
    if (typeof J !== 'undefined' && J.proxy) {
      try { const r = await J.get('/api/doctor', { timeout: 25000 }); if (r && Array.isArray(r.checks)) rows = rows.concat(r.checks.slice(0, 40).map(D.clean)); }
      catch (e) { rows.push({ name: 'Launcher doctor', ok: null, detail: 'unavailable (older launcher?): ' + String(e.message || e).slice(0, 120) }); }
    }
    D.rows = rows;
    const el = $('#docOut');
    if (el) el.innerHTML = `<ul class="doc-list">${rows.map((r) => `<li class="${r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'warn'}"><span aria-hidden="true">${r.ok === true ? '✅' : r.ok === false ? '❌' : '⚠️'}</span> <b>${esc(r.name)}</b> <span class="note">${esc(r.detail)}</span></li>`).join('')}</ul>
      <div class="note">${rows.filter((r) => r.ok === false).length ? 'Fix the ❌ items above, then run the checks again.' : 'All required checks passed.'} Same checks in a terminal: <code>python serve.py --doctor</code></div>`;
    return rows;
  };
  return D;
})();

/* ───────────── 8. Field Manual (Settings → 📘 Field Manual) ───────────── */
const Manual = (() => {
  const M = {};
  const mode = (m) => () => { Challenge.mode = m; showTab('challenge'); };
  M.ITEMS = [
    { id: 'plus', t: 'Click-to-trade: the + button', k: 'chart click trade limit stop order buy sell alert level price axis', b: 'Hover any stock, crypto or DEX chart: a + follows your cursor along the right price axis. Click it for a buy or sell limit/stop order, a price alert or a horizontal level at that exact price.' },
    { id: 'bracket', t: 'Drag Entry, Stop-Loss and Take-Profit lines', k: 'bracket sl tp r:r risk reward drag lines pnl', b: 'A buy from the + menu opens a draft bracket. Drag the lines: the box shows dollar risk and reward, the % move and reward-to-risk live. Press Place to send it as a paper order. Open positions show their SL/TP lines too.' },
    { id: 'undo', t: 'Undo and redo (Ctrl+Z / Ctrl+Y)', k: 'undo redo ctrl z y history mistake', b: 'Every line move and Breakeven click can be undone with Ctrl+Z and redone with Ctrl+Y. When there is nothing left to undo, Ctrl+Z undoes your last drawing instead.' },
    { id: 'be', t: 'Breakeven and Partial take-profit', k: 'breakeven partial tp scale out protect', b: 'With an open position, Breakeven moves your stop to the entry price in one click and Partial TP 50% sells half at market. Both live in the bracket box on the chart.' },
    { id: 'exec', t: 'Realistic paper execution', k: 'slippage spread order book depth dex liquidity fill realistic', b: 'Tick “Realistic fills” in the order ticket. Market and stop fills then pay half the real bid-ask spread plus the depth impact of your size (walking the live order book), or the AMM pool slippage on DEX tokens. Limit fills keep their price.' },
    { id: 'arrows', t: 'Backtest trade arrows', k: 'backtest arrows wins losses entries exits overlay tooltip', b: 'After a backtest, the price chart draws each round trip: an entry arrow, an exit arrow and a dashed line, green for wins and red for losses. Hover an arrow for prices, times, P&L and the reason. Toggle it above the chart.' },
    { id: 'prop', t: 'Prop-Firm $50K / $100K Evaluation', k: 'prop firm evaluation funded drawdown daily loss target challenge', b: 'Reach +8% without breaking a 4% daily loss limit or an 8% max trailing drawdown, on 10 trading days of hourly candles.' },
    { id: 'swan', t: 'Black Swan Survival', k: 'black swan crash covid ftx 2008 financial crisis survival', b: 'Trade the 2020 COVID crash, the 2022 FTX collapse or the 2008 financial crisis without losing 20% from your peak. Paths are modeled on each event’s real key closes.' },
    { id: 'scalp', t: '10-Min Scalping Sprint', k: 'scalping sprint timer 1m minute fast', b: '1-minute candles arrive every 5 seconds with 10 minutes on the clock and a 0.05% fee.' },
    { id: 'naked', t: 'Zero-Indicator Naked Price Action', k: 'naked price action no indicators candles', b: 'No EMAs, volume or indicators: read the candles alone and beat buy-and-hold.' },
    { id: 'trench', t: 'Solana Trench Survival', k: 'solana memecoin trench rug pull pump survival dex', b: 'A simulated fresh memecoin launch with 1% fees and 1% slippage per side. Rugs happen. Lose half your peak and you are out.' },
    { id: 'replay', t: 'Replay Challenge (daily, blind, pick a market)', k: 'replay challenge daily blind streak', b: 'The original: trade a hidden slice of real history candle by candle and beat buy-and-hold.' },
    { id: 'flex', t: 'Discipline grades and Flex Cards', k: 'grade a+ f discipline flex card share image win rate drawdown', b: 'Every challenge ends with a grade from A+ to F based on your edge, max drawdown, rule breaches, trade count and win rate. Press 📸 Flex Card to save a shareable image.' },
    { id: 'walk', t: 'First-60-seconds walkthrough', k: 'tour walkthrough onboarding start help', b: 'Five quick steps: pick a market, click +, drag your stop, place a paper order, try a challenge. Each step has a Show me button.' },
    { id: 'demo', t: '1-click Live Demo', k: 'demo preset quick start', b: 'The ▶ Demo button in the header loads BTC, turns on EMA, volume, realistic fills and trade arrows, and drafts a bracket for you to drag.' },
    { id: 'brief', t: 'Morning Brief', k: 'morning brief summary daily overview commands shortcuts', b: 'Your watchlist’s biggest movers, paper equity, unprotected positions, pending orders and the command overview. Shows on your first visit each day (turn it off in the Brief). Open it any time from ☀ in the header.' },
    { id: 'doctor', t: 'Check for Updates & System Doctor', k: 'doctor update diagnose check problem network launcher', b: 'Checks this browser, the launcher, the data folder, the app file’s checksum, network access and whether a newer release is out. In a terminal: python serve.py --doctor' },
    { id: 'alerts', t: 'Price alerts', k: 'alert notify price above below telegram discord', b: 'Set alerts from the + menu or the Lab tab. With the launcher running they also fire with the browser closed (Telegram / Discord in Settings).' },
    { id: 'keys', t: 'Keyboard shortcuts', k: 'keyboard shortcuts keys hotkeys', b: 'Press ? on the Markets tab for the full list: timeframes, buy/sell, replay, fit chart and more.' },
    { id: 'palette', t: 'Command palette', k: 'command palette ctrl k search jump', b: 'Ctrl+K (⌘K on a Mac) jumps to any market, tab or command.' },
  ];
  M.GO = {
    plus: () => { showTab('markets'); const ch = typeof chart !== 'undefined' && chart; if (ch && ch.L) { const y = ch.L.y0 + ch.L.mainH * 0.4; ChartTrade.movePlus(ch.L.W - ch.L.Rm - 40, y); ChartTrade.menuOpen(ChartTrade.price); } },
    bracket: () => ChartTrade.demo(),
    undo: () => { if (ChartTrade.nudge()) toast('Moved the stop a little. Press Ctrl+Z to undo it, Ctrl+Y to redo.', 'acc', 6000); },
    be: () => { ChartTrade.demo(); toast('Place the draft and once it fills, Breakeven and Partial TP 50% appear in the bracket box.', 'acc', 6000); },
    exec: () => { showTab('markets'); ST.settings.realExec = true; saveState(); try { renderTicketMeta(); } catch (e) { /* ticket */ } const el = $('#tkReal'); if (el) { el.focus(); el.parentNode.classList.add('p2-flash'); setTimeout(() => el.parentNode.classList.remove('p2-flash'), 1600); } },
    arrows: () => { ST.settings.btArrows = true; saveState(); showTab('bots'); toast('Run a backtest: each trade is drawn on the price chart as arrows. Hover one for details.', 'acc', 6000); },
    prop: mode('prop50'), swan: mode('swan'), scalp: mode('scalp'), naked: mode('naked'), trench: mode('trench'), replay: mode('daily'),
    flex: () => { showTab('challenge'); toast('Finish any challenge, then press 📸 Flex Card.', 'acc', 6000); },
    walk: () => Walk.start(0), demo: () => LiveDemo.run(), brief: () => Brief.open(), doctor: () => { M.view('fm'); Doctor.run(); },
    alerts: () => showTab('lab'), keys: () => { showTab('markets'); if (typeof V14UI !== 'undefined' && V14UI.help) V14UI.help(); }, palette: () => { if (typeof palOpen === 'function') palOpen(); },
  };
  M.mount = () => {
    const tab = $('#tab-set'); if (!tab || $('#setSeg')) return;
    const seg = document.createElement('div'); seg.className = 'seg set-seg'; seg.id = 'setSeg'; seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'Settings sections');
    seg.innerHTML = '<button type="button" role="tab" data-st="set" class="on" aria-selected="true">⚙️ Settings</button><button type="button" role="tab" data-st="fm" aria-selected="false">📘 Field Manual</button>';
    tab.prepend(seg);
    const host = document.createElement('div'); host.id = 'fmHost'; tab.appendChild(host);
    seg.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) M.view(b.dataset.st); });
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-fmgo]'); if (!b) return; const f = M.GO[b.dataset.fmgo]; if (f) { try { f(); } catch (x) { console.warn('manual', x); } } });
    host.addEventListener('input', (e) => { if (e.target && e.target.id === 'fmQ') M.filter(e.target.value); });
  };
  M.view = (v) => {
    const tab = $('#tab-set'); if (!tab) return; if (typeof curTab !== 'undefined' && curTab !== 'set') showTab('set');
    tab.classList.toggle('fm-on', v === 'fm');
    $$('#setSeg button').forEach((b) => { b.classList.toggle('on', b.dataset.st === v); b.setAttribute('aria-selected', String(b.dataset.st === v)); });
    if (v === 'fm' && !$('#fmList')) M.render();
  };
  M.render = () => {
    const host = $('#fmHost'); if (!host) return;
    host.innerHTML = `<div class="panel fm"><h3>📘 How to use ExTerm: Field Manual</h3><div class="pb">
      <div class="row fm-top"><input class="in" id="fmQ" type="search" placeholder="Search: stop loss, prop firm, slippage…" aria-label="Search the Field Manual" autocomplete="off"><button type="button" class="btn sm" data-fmgo="walk">⏱ 60-second walkthrough</button><button type="button" class="btn sm" data-fmgo="demo">▶ Live demo</button><button type="button" class="btn sm" data-fmgo="brief">☀ Morning Brief</button></div>
      <div class="note" id="fmCount"></div><div class="fm-list" id="fmList">${M.ITEMS.map((it) => `<article class="fm-item" data-fmid="${esc(it.id)}"><h4>${esc(it.t)}</h4><p>${esc(it.b)}</p>${M.GO[it.id] ? `<button type="button" class="btn sm" data-fmgo="${esc(it.id)}">Try this feature →</button>` : ''}</article>`).join('')}</div></div></div>
      <div class="panel fm-doc"><h3>🩺 Check for Updates &amp; System Doctor</h3><div class="pb"><div class="note">Checks this browser, the launcher, your data folder, the app file's checksum, network access and the latest release. Terminal version: <code>python serve.py --doctor</code></div><button type="button" class="btn pri" id="fmDoc" data-fmgo="doctor" style="margin-top:6px">Run checks</button><div id="docOut"></div></div></div>`;
    M.filter('');
  };
  M.filter = (q) => {
    const ids = new Set(P2.search(M.ITEMS, q).map((i) => i.id)); let n = 0;
    $$('#fmList .fm-item').forEach((el) => { const v = ids.has(el.dataset.fmid); el.hidden = !v; if (v) n++; });
    const c = $('#fmCount'); if (c) c.textContent = q ? `${n} of ${M.ITEMS.length} topics match “${String(q).slice(0, 40)}”` : `${M.ITEMS.length} topics`;
    return n;
  };
  return M;
})();

/* ───────────── wiring ───────────── */
const V15P2 = {
  mountHeader() {
    const ref = $('#btnTheme'); if (!ref || $('#btnDemo')) return;
    const mk = (id, txt, title, fn) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'ghost'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); ref.parentNode.insertBefore(b, ref); };
    mk('btnDemo', '▶ Demo', '1-click live demo: BTC, realistic fills and a draft trade bracket', () => LiveDemo.run());
    mk('btnBrief', '☀', 'Morning Brief: movers, your account and the command overview', () => Brief.open());
  },
  init() {
    ExecSim.install(); ExecSim.mountTicket();
    if (typeof chart !== 'undefined' && chart) ChartTrade.attach(chart);
    document.addEventListener('keydown', ChartTrade.onKey, true);
    Manual.mount(); V15P2.mountHeader();
    if (!ST.settings.walkDone && !ST.settings.tourDone && !navigator.webdriver) { ST.settings.tourDone = true; setTimeout(() => Walk.start(0), 5000); } // replaces the v13 tour on a first run
    else Brief.auto();
    window.__exterm_p2 = true;
  },
};
// wire up after the v14 boot wrapper (ST, chart, ticket and launcher are ready by then)
{ const _bp2 = boot; boot = async function () { await _bp2.apply(this, arguments); try { V15P2.init(); } catch (e) { console.warn('v15p2 init', e); } }; }
