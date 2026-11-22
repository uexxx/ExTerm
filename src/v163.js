/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.3 UI: live-execution precision cockpit. Wraps existing pieces (ids, listeners and the v16.0 router stay
   intact):
   · Live Safety Settings (in the Execution Bridge panel): Require Stop-Loss on All Live Opening Orders (ON by default),
     depth ≥ N×, stale-quote freeze, trades-per-hour limit, 6-slot exposure cap, drawdown throttle, correlation guard,
     thin-hours spread tightening and Auto-Disarm on Idle (Off (24/7) | 15m | 30m | 60m). Registered as V160UI.pre guards.
   · Order ticket: $ Risk → exact qty, time-in-force (GTC / IOC / Post-Only), Auto-BE on TP1, TP1 50% / TP2 30% / TP3 20%
   · Chart: R:R + dollar P&L badges while dragging Entry / SL / TP, one-click BE pill on the open position line, bid/ask
     spread tunnel on 1s – 1m, order-preview ghost lines, Alt + drag magnetic snap to high / low / VWAP, trailing-stop
     activation + step lines, fill markers with slippage in bps
   · Hotkeys: Shift+B buy market · Shift+S sell market · Shift+X cancel all pending orders
   Strict CSP: no inline handlers, every dynamic string through esc(). Maths in V163 (v163core.js). */
const V163UI = (() => {
  const KEY = 'exterm.v163.cfg';
  const U = { cfg: V163.DEFAULTS(), sent: [], spread: new Map(), books: {}, scale: {}, fills: new Map(), lastAct: Date.now(), bookAt: 0,
    stats: { blocked: 0, passed: 0, scaled: 0, hot: 0, be: 0, tp: 0, snaps: 0, idle: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const B = () => (typeof V160UI !== 'undefined' && V160UI.st ? V160UI : null);
  const live = () => { const b = B(); return !!(b && b.live()); };
  const fp = (v) => NT.fmtPrice(v);
  const price = (s) => (typeof px === 'function' ? px(s) : 0) || 0;
  const kindOf = (s) => (typeof isOnchain === 'function' && isOnchain(s) ? 'onchain' : typeof isStock === 'function' && isStock(s) ? 'stock' : 'crypto');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U.cfg)); } catch (e) { /* private window: settings live for this session */ } };
  const load = () => { let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; } U.cfg = V163.load(raw); };
  const sync = () => { const b = B(); if (b) b.requireSL = U.cfg.requireSL !== false; };

  /* ══ 1 + 6. pre-route guard chain for the v16.0 router ══ */
  const closesOf = (acct) => ((acct && acct.trades) || []).filter((t) => t.side === 'sell' && t.src !== 'backtest' && Number.isFinite(t.pnl) && +t.ts > (U.since || 0)).map((t) => ({ pnl: t.pnl, ts: +t.ts })); // U.since: Reset Session Safety Counters
  const exposure = (t) => {
    const out = [], b = B(), bot = b && (ST.bots || []).find((x) => String(x.id) === b.st.promote);
    for (const a of [typeof ACC !== 'undefined' ? ACC : null, bot && bot.account]) for (const [s, p] of Object.entries((a && a.pos) || {})) {
      if (!(p && p.qty > 0)) continue; let usd = p.qty * (price(s) || p.cost / p.qty);
      if (a === ACC && s === t.sym) usd = Math.max(0, usd - (+t.usd || 0)); // the paper fill being routed is already in the book
      out.push({ sym: s, usd });
    }
    return out;
  };
  const quoteAge = (s, now) => { const L = typeof Feed !== 'undefined' && Feed.live && Feed.live[s]; let ts = L && L.ts; if (!ts && kindOf(s) === 'onchain' && typeof OC !== 'undefined') ts = OC.polled; return ts ? now - ts : NaN; };
  const bookOf = (s) => { const k = U.books[s]; if (k && Date.now() - k.ts < 6000) return k; const p = typeof P5UI !== 'undefined' && P5UI.book && P5UI.book.sym === s && Date.now() - (P5UI.bookTs || 0) < 6000 ? P5UI.book : null; return p; };
  const closesFor = (s) => { try { const st = getStore(s, ST.tf); return st.candles.slice(-61).map((k) => k.c); } catch (e) { return []; } };
  const guard = (body, t, acct) => {
    const c = U.cfg, now = Date.now(), b = B();
    body.tif = c.tif;
    if (!V163.isOpening(body)) return { ok: true };
    const open = {}; for (const s of Object.keys(acct.pos || {})) if (s !== t.sym && acct.pos[s].qty > 0) open[baseOf(s)] = closesFor(s);
    const ctx = { now, kind: kindOf(t.sym), quoteAge: quoteAge(t.sym, now), sentTimes: U.sent, positions: exposure(t), book: bookOf(t.sym), closes: closesOf(acct),
      corrNew: closesFor(t.sym), corrOpen: open, spread: b ? b.spreadOf(t.sym) : null, maxSpreadPct: b && b.fs ? +b.fs.maxSpreadPct : NaN };
    const r = V163.preflight(body, ctx, c);
    if (!r.ok) { U.stats.blocked++; return r; }
    U.stats.passed++; U.sent.push(now); U.sent = U.sent.filter((x) => now - x < 3600000);
    if (r.scale < 1) {
      U.stats.scaled++; body.usd = +(body.usd * r.scale).toFixed(2); if (body.qty > 0) body.qty = +(body.qty * r.scale).toPrecision(10);
    }
    if (r.notes.length && b) b.led('guard', { status: r.scale < 1 ? 'scaled' : 'pass', detail: `${baseOf(t.sym)}: ${r.notes.join('; ')}` });
    return { ok: true };
  };
  const wireGuard = () => { const b = B(); if (!b || !Array.isArray(b.pre) || b.pre.includes(guard)) return; b.pre.push(guard); sync(); };

  /* order books for the depth check: the selected market, every 2 s while armed (crypto with a REST book only) */
  const pullBook = async () => {
    const s = ST.sel; if (!live() || kindOf(s) !== 'crypto' || typeof Providers === 'undefined' || !Providers.active || !Providers.active.book || Date.now() - U.bookAt < 2000) return;
    U.bookAt = Date.now(); try { const bk = await Providers.active.book(s); if (bk && bk.bids && bk.asks) U.books[s] = { bids: bk.bids, asks: bk.asks, ts: Date.now() }; } catch (e) { /* unknown book: the depth check notes it */ }
  };

  /* ══ Live Safety Settings panel ══ */
  const chk = (k, label, hint) => `<label class="v160-chk"><input type="checkbox" class="v163-cfg" data-v163f="${k}"${U.cfg[k] ? ' checked' : ''}> ${label}${hint ? ` <span class="note">${hint}</span>` : ''}</label>`;
  const numIn = (k, label, min, max, step) => `<label><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" class="in mono v163-cfg" data-v163f="${k}" value="${esc(U.cfg[k])}" inputmode="decimal"></label>`;
  const panelHTML = () => {
    const c = U.cfg, idle = V163.IDLE.map((m) => `<option value="${m}"${c.idleMin === m ? ' selected' : ''}>${m ? m + 'm' : 'Off (24/7)'}</option>`).join('');
    return `<h3><svg viewBox="0 0 24 24" aria-hidden="true" class="v163-ic"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="1.6"/></svg> Live Safety Settings · v16.3 Core Risk Guards</h3>
      <p class="note">Checked on every live <b>opening</b> signal before it is signed. Closing and CANCEL_ALL_AND_FLATTEN orders are never blocked.${live() ? ' <b>Locked while armed:</b> disarm to PAPER to loosen a guard.' : ''}</p>
      <div class="v163-grid">
        ${chk('requireSL', '<b>Require Stop-Loss on All Live Opening Orders</b>', 'long stop below entry, short stop above')}
        ${c.requireSL ? '' : '<p class="v163-warn" role="alert">Stop-loss requirement is OFF: live opening orders without a stop will be sent.</p>'}
        ${chk('depthOn', 'Order-book liquidity depth check')}${numIn('depthX', 'Depth ≥ × order', 1, 50, 0.5)}
        ${chk('staleOn', 'Smart Stale-Quote Freeze', '5s crypto · 20s stocks · 90s on-chain')}
        ${numIn('maxPerHour', 'Max trades per hour (0 = off)', 0, 1000, 1)}
        ${numIn('expCap', 'Global 6-slot exposure cap $ (0 = off)', 0, 1e10, 100)}
        ${chk('throttle', 'Drawdown Throttle', '50% size cut after 2 losses in a row')}
        ${chk('corrOn', 'Correlation Guard')}${numIn('corrMax', 'Max correlation r', 0.5, 0.99, 0.01)}
        ${chk('thinOn', 'Weekend / extended-hours spread cap 50% tighter')}
        <label><span>Auto-Disarm on Idle</span><select class="in v163-cfg" data-v163f="idleMin">${idle}</select></label>
      </div>
      <p class="note" id="v163Stat" role="status"></p>`;
  };
  let sec = null;
  const onCfg = (e) => {
    const f = e.target.closest('[data-v163f]'); if (!f) return; const k = f.dataset.v163f;
    if (live() && k !== 'idleMin') { paintPanel(true); toast('Live Safety Settings are locked while armed. Disarm to PAPER to change them.', 'amb'); return; }
    const nx = Object.assign({}, U.cfg, { [k]: f.type === 'checkbox' ? f.checked : f.tagName === 'SELECT' ? +f.value : f.value });
    U.cfg = V163.load(nx); save(); sync(); if (f.type === 'checkbox' || f.tagName === 'SELECT' || e.type === 'change') paintPanel(true);
  };
  const paintPanel = (force) => {
    const host = $1('#v160Bridge'); if (!host) return;
    if (!sec) { sec = document.createElement('div'); sec.id = 'v163Safety'; sec.className = 'v163-safety'; sec.addEventListener('change', onCfg); sec.addEventListener('input', (e) => { if (e.target.type === 'number') onCfg(e); }); }
    const anchor = $1('#v161Fs', host); if (sec.parentNode !== host) { if (anchor) anchor.after(sec); else host.appendChild(sec); force = true; }
    const lk = live(); if (force || sec._lk !== lk) { sec._lk = lk; sec.innerHTML = panelHTML(); for (const x of sec.querySelectorAll('.v163-cfg')) if (x.dataset.v163f !== 'idleMin') x.disabled = lk; }
    const st = $1('#v163Stat', sec), txt = `Guards: ${U.stats.passed} passed · ${U.stats.blocked} blocked · ${U.stats.scaled} size-throttled · ${U.sent.filter((x) => Date.now() - x < 3600000).length} live opens this hour${U.cfg.idleMin ? ` · auto-disarm after ${U.cfg.idleMin}m idle` : ' · 24/7 unattended (no idle disarm)'}`;
    if (st && st.textContent !== txt) st.textContent = txt;
  };

  /* ══ 2 + 3 + 5. order ticket: $ Risk → qty, TIF, Auto-BE, TP splitter ══ */
  const tkNum = (id) => { const el = $1(id), v = el ? parseFloat(el.value) : NaN; return v > 0 ? v : 0; };
  const tkEntry = () => (typeof tkType !== 'undefined' && tkType !== 'market' ? tkNum('#tkLimit') : price(ST.sel));
  const sizeCalc = () => {
    const e = tkEntry(), slp = tkNum('#tkSl') / 100, risk = tkNum('#v163Risk'); if (!(e > 0) || !(slp > 0) || !(risk > 0)) return null;
    return V163.sizeByRisk(risk, e, e * (1 - slp), { feePct: typeof ACC !== 'undefined' ? ACC.fee : 0, maxUsd: typeof ACC !== 'undefined' ? ACC.cash : 0 });
  };
  const paintRisk = () => {
    const o = $1('#v163RiskOut'); if (!o) return; const r = sizeCalc(), b = baseOf(ST.sel);
    const txt = r ? `= ${NT.fmtQty(r.qty)} ${b} · ${NT.fmtUSD(r.usd)} notional · loses ${NT.fmtUSD(r.risk)} at the stop${r.capped ? ' (capped by cash)' : ''}` : 'Set a stop-loss % to turn $ risk into an exact quantity';
    if (o.textContent !== txt) o.textContent = txt;
  };
  const applySize = () => {
    const r = sizeCalc(); if (!r) { toast('Set a $ risk and a stop-loss % first', 'amb'); return; }
    const z = $1('#tkSize [data-z="usd"]'); if (z && !z.classList.contains('on')) z.click();
    const u = $1('#tkUsd'); if (u) u.value = r.usd.toFixed(2);
    try { renderTicketMeta(); } catch (e) { /* ticket not built */ }
    toast(`Sized ${esc(NT.fmtQty(r.qty))} ${esc(baseOf(ST.sel))} for ${esc(NT.fmtUSD(r.risk))} risk`, 'acc');
  };
  const tkHTML = () => `<div class="row v163-risk"><label class="f"><span>$ Risk → exact qty</span><input class="in mono" id="v163Risk" value="${esc(U.cfg.riskUsd)}" inputmode="decimal" aria-describedby="v163RiskOut"></label><button type="button" class="btn sm" data-v163t="size">Size</button></div>
    <div class="note" id="v163RiskOut" role="status"></div>
    <div class="row v163-tifrow"><span class="note">Time in force</span><div class="seg" id="v163Tif" role="group" aria-label="Time in force">${V163.TIF.map((k) => `<button type="button" data-tif="${k}" class="${U.cfg.tif === k ? 'on' : ''}" aria-pressed="${U.cfg.tif === k}">${esc(V163.TIF_LABEL[k])}</button>`).join('')}</div></div>
    <label class="chk"><input type="checkbox" id="v163AutoBE"${U.cfg.autoBE ? ' checked' : ''}> Auto-BE on TP1</label>
    <label class="chk"><input type="checkbox" id="v163Split"${U.cfg.splitTP ? ' checked' : ''}> Scale out TP1 50% / TP2 30% / TP3 20%</label>
    <div class="note v163-keys">Shift+B buy market · Shift+S sell market · Shift+X cancel all</div>`;
  const mountTicket = () => {
    const go = $1('#tkGo'); if (!go || $1('#v163Tk')) return;
    const box = document.createElement('div'); box.id = 'v163Tk'; box.className = 'v163-tk'; box.innerHTML = tkHTML(); go.before(box);
    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tif]'); if (t) { U.cfg.tif = t.dataset.tif; save(); for (const x of box.querySelectorAll('[data-tif]')) { x.classList.toggle('on', x === t); x.setAttribute('aria-pressed', String(x === t)); } return; }
      if (e.target.closest('[data-v163t="size"]')) applySize();
    });
    box.addEventListener('input', (e) => { if (e.target.id === 'v163Risk') { const v = parseFloat(e.target.value); if (v > 0) { U.cfg.riskUsd = v; save(); } paintRisk(); } });
    box.addEventListener('change', (e) => { if (e.target.id === 'v163AutoBE') { U.cfg.autoBE = e.target.checked; save(); } else if (e.target.id === 'v163Split') { U.cfg.splitTP = e.target.checked; save(); if (chart) chart.invalidate(); } });
    const tk = $1('#ticket'); if (tk && !tk._v163) { tk._v163 = true; tk.addEventListener('input', paintRisk); tk.addEventListener('click', tifPre, true); tk.addEventListener('click', tifPost); }
    paintRisk();
  };
  /* TIF on manual limit orders: Post-Only refuses a crossing price before the order exists; IOC cancels whatever did not fill */
  let tifSnap = null;
  const tifPre = (e) => {
    tifSnap = null; if (!e.target.closest('#tkGo') || typeof tkType === 'undefined' || tkType !== 'limit') return;
    const s = ST.sel, L = (typeof Feed !== 'undefined' && Feed.live[s]) || {}, p = price(s), lim = tkNum('#tkLimit');
    const r = V163.tifCheck(U.cfg.tif, tkSide, lim, L.bid > 0 ? L.bid : p, L.ask > 0 ? L.ask : p);
    if (!r.ok) { e.preventDefault(); e.stopImmediatePropagation(); toast('⛔ ' + esc(r.why), 'amb'); return; }
    tifSnap = { ids: new Set((ACC.orders || []).map((o) => o.id)), cancel: r.cancelRest };
  };
  const tifPost = (e) => {
    if (!tifSnap || !e.target.closest('#tkGo')) return; const snap = tifSnap; tifSnap = null; if (!snap.cancel) return;
    const fresh = (ACC.orders || []).filter((o) => !snap.ids.has(o.id)); for (const o of fresh) ACC.cancel(o.id);
    if (fresh.length) { toast('IOC: the limit could not fill immediately, so it was cancelled', 'amb'); try { renderTicketMeta(); saveState(); } catch (x) { /* ticket not built */ } }
  };

  /* ══ 3. Auto-BE on TP1 + scaled take-profit, on every price tick of an open paper position ══ */
  const levels = (sym) => { const p = ACC.pos[sym], s = U.scale[sym]; if (!p || !s || !(p.tp > s.entry)) return null; return V163.splitTP(s.q0, s.entry, p.tp, V163.SPLIT, 'long'); };
  const onPx = (sym, last) => {
    if (typeof ACC === 'undefined' || ACC.short) return; const p = ACC.pos[sym];
    if (!p || !(p.qty > 0)) { delete U.scale[sym]; return; }
    const entry = p.cost / p.qty; let s = U.scale[sym];
    if (!s || p.qty > s.q0 * 1.0001 || (Math.abs(s.entry - entry) / entry > 1e-6 && !s.hit[0])) s = U.scale[sym] = { q0: p.qty, entry, hit: [false, false] };
    const lv = levels(sym), now = Date.now(); let moved = false;
    if (U.cfg.splitTP && lv) for (let i = 0; i < 2; i++) {
      if (s.hit[i] || !V163.hit('long', last, lv[i].price)) continue; s.hit[i] = true; const q = Math.min(lv[i].qty, ACC.qty(sym)); if (!(q > 0)) continue;
      const t = ACC.sell(sym, last, q, now, { reason: `scaled take-profit TP${i + 1} (${lv[i].pct}%)`, src: 'manual' }); if (t) { U.stats.tp++; moved = true; try { tradeToast(t, 'Paper account'); } catch (e) { /* toast not ready */ } }
    }
    const pp = ACC.pos[sym];
    if (U.cfg.autoBE && pp && pp.tp > s.entry) {
      const tp1 = lv ? lv[0].price : s.entry + (pp.tp - s.entry) / 3, be = V163.autoBE({ entry: s.entry, side: 'long', sl: pp.sl }, last, tp1, ACC.fee);
      if (be) { pp.sl = be; U.stats.be++; moved = true; toast(`Auto-BE: ${esc(baseOf(sym))} stop moved to break-even ${esc(fp(be))} after TP1`, 'acc'); }
    }
    if (moved && typeof ChartTrade !== 'undefined') ChartTrade.changed();
  };
  const moveBE = () => {
    const sym = ST.sel, p = ACC.pos[sym]; if (!p || !(p.qty > 0)) return;
    const be = V163.breakEven(p.cost / p.qty, 'long', ACC.fee), from = p.sl;
    if (typeof ChartTrade !== 'undefined' && ChartTrade.set('pos:' + sym, 'sl', be)) { if (ChartTrade.hist && ChartTrade.hist.push) { try { ChartTrade.hist.push({ key: 'pos:' + sym, field: 'sl', from, to: be }); } catch (e) { /* history optional */ } } ChartTrade.changed(); }
    else p.sl = be;
    U.stats.be++; toast(`BE: ${esc(baseOf(sym))} stop at break-even ${esc(fp(be))} (fees included)`, 'acc');
  };

  /* ══ 4 + 5. chart layer ══ */
  const feedWire = () => {
    if (typeof Feed === 'undefined' || Feed._v163) return; Feed._v163 = true;
    Feed.tickL.push((sym, p) => {
      const L = Feed.live[sym]; if (L && L.bid > 0 && L.ask > 0) { let a = U.spread.get(sym); if (!a) U.spread.set(sym, (a = [])); V163.pushSpread(a, Math.floor(Date.now() / 1000), +L.bid, +L.ask, 900); }
      try { onPx(sym, p); } catch (e) { console.warn('v163 scale', e); }
    });
  };
  const tradeWire = () => {
    if (typeof NT === 'undefined' || (NT.onTrade && NT.onTrade._v163)) return; const o = NT.onTrade;
    NT.onTrade = function (t) {
      try { if (t && t.src !== 'backtest' && t.id) { const L = typeof Feed !== 'undefined' && Feed.live[t.sym], ref = (L && (t.side === 'buy' ? L.ask : L.bid)) || price(t.sym); const sl = V163.slippage(t.price, ref, t.side); if (sl) { U.fills.set(t.id, sl); if (U.fills.size > 500) U.fills.delete(U.fills.keys().next().value); } } } catch (e) { /* markers are cosmetic */ }
      if (o) return o.apply(this, arguments);
    };
    NT.onTrade._v163 = true; if (o && o._v160) NT.onTrade._v160 = true; if (o && o._v161) NT.onTrade._v161 = true; // never let the router or journal wrap twice
  };
  const tag = (g, txt, x, y, fill, fg) => { g.font = '600 11px ui-monospace, Menlo, Consolas, monospace'; const w = g.measureText(txt).width + 12; g.fillStyle = fill; g.fillRect(x - w, y - 8, w, 16); g.fillStyle = fg || '#0b0b0d'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, x - w + 6, y); return w; };
  const hline = (g, L, y, col, dash, label, x1) => { g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(dash || [3, 3]); g.beginPath(); g.moveTo(L.Lm, Math.round(y) + 0.5); g.lineTo(L.W - L.Rm, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]); if (label) { g.globalAlpha = 0.9; tag(g, label, (x1 || L.W - L.Rm) - 4, y - 11, col, '#0b0b0d'); g.globalAlpha = 1; } };
  const beBtn = (L, y, show) => {
    const host = chart.host; let el = U.be;
    if (!show) { if (el) el.hidden = true; return; }
    if (!el || !el.isConnected || el.parentNode !== host) {
      el = U.be = document.createElement('button'); el.type = 'button'; el.className = 'v163-be'; el.textContent = 'BE'; el.title = 'Move the stop to break-even (entry + round-trip fees)'; el.setAttribute('aria-label', 'Move stop-loss to break-even');
      el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('click', (e) => { e.stopPropagation(); moveBE(); }); host.appendChild(el);
    }
    el.hidden = false; const top = Math.round(y - 9) + 'px', left = Math.round(L.Lm + 6) + 'px'; if (el.style.top !== top) el.style.top = top; if (el.style.left !== left) el.style.left = left;
  };
  const overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L || !L.py || !L.D || !L.D.length) return;
    const c = U.cfg, sym = ST.sel, col = L.col || {}, up = col.up || '#26c281', dn = col.dn || '#ef5350', amb = '#D4AF37', top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, ok = (y) => Number.isFinite(y) && y >= top && y <= bot;
    g.save(); g.beginPath(); g.rect(L.Lm, top, L.W - L.Lm - L.Rm, bot - top); g.clip();
    /* spread tunnel on 1s – 1m */
    const sp = U.spread.get(sym), t0 = L.D[Math.max(0, Math.min(L.D.length - 1, (L.end || L.D.length) - (L.bars || L.D.length)))].t;
    if (c.tunnel && V163.tunnelOn(ch.tfSec) && sp && sp.length > 1) {
      const pts = sp.filter((q) => q.t >= t0); if (pts.length > 1) {
        g.beginPath(); pts.forEach((q, i) => { const x = ch.tToX(q.t), y = L.py(q.ask); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(ch.tToX(pts[i].t), L.py(pts[i].bid)); g.closePath();
        g.globalAlpha = 0.14; g.fillStyle = col.acc || '#5b8cff'; g.fill(); g.globalAlpha = 0.5; g.strokeStyle = col.acc || '#5b8cff'; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
      }
    }
    /* fill markers with slippage */
    if (c.fills && typeof ACC !== 'undefined') for (const t of ACC.trades.slice(-200)) {
      if (t.sym !== sym || t.src === 'backtest' || t.ts / 1000 < t0) continue; const x = ch.tToX(t.ts / 1000), y = L.py(t.price); if (!Number.isFinite(x) || !ok(y)) continue;
      const buy = t.side === 'buy', s = U.fills.get(t.id); g.fillStyle = buy ? up : dn; g.beginPath(); g.moveTo(x, y + (buy ? 2 : -2)); g.lineTo(x - 5, y + (buy ? 10 : -10)); g.lineTo(x + 5, y + (buy ? 10 : -10)); g.closePath(); g.fill();
      if (s) { g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = buy ? 'top' : 'bottom'; g.fillStyle = s.bps > 0.05 ? dn : up; g.fillText(`${s.text}${s.ticks != null ? ' · ' + Math.abs(s.ticks).toFixed(1) + 't' : ''}`, x, y + (buy ? 12 : -12)); }
    }
    const b = typeof ChartTrade !== 'undefined' ? ChartTrade.b : null;
    /* order-preview ghost lines from the ticket when no bracket is on the chart */
    if (c.ghost && !b && typeof curTab !== 'undefined' && curTab === 'markets' && typeof tkSide !== 'undefined' && tkSide === 'buy') {
      const gh = V163.ghost(tkEntry(), tkNum('#tkSl') / 100, tkNum('#tkTp') / 100, 'long');
      if (gh && (gh.sl || gh.tp || tkType !== 'market')) { g.globalAlpha = 0.55; if (ok(L.py(gh.entry))) hline(g, L, L.py(gh.entry), col.acc || '#5b8cff', [2, 4], 'Preview entry'); if (gh.sl && ok(L.py(gh.sl))) hline(g, L, L.py(gh.sl), dn, [2, 4], 'Preview SL'); if (gh.tp && ok(L.py(gh.tp))) hline(g, L, L.py(gh.tp), up, [2, 4], 'Preview TP'); g.globalAlpha = 1; }
    }
    let showBE = false, beY = 0;
    if (b && b.sym === sym && b.entry > 0) {
      const qty = b.qty > 0 ? b.qty : b.usd > 0 ? b.usd / b.entry : 0, xr = L.W - L.Rm - 4, dragging = !!ChartTrade.drag;
      /* R:R + dollar P&L badges on the stop and target lines */
      if (dragging || b.kind === 'draft') for (const [v, cc] of [[b.tp, up], [b.sl, dn]]) {
        const bd = v > 0 ? V163.badge(b.entry, b.sl, v, qty, 'long') : null, y = v > 0 ? L.py(v) : NaN; if (!bd || !ok(y)) continue;
        tag(g, bd.text, xr, y + (y - L.py(b.entry) < 0 ? -21 : 21), cc, '#0b0b0d');
      }
      if (b.kind === 'pos') {
        const p = ACC.pos[sym], e = b.entry; beY = L.py(e); showBE = ok(beY) && !(p && p.sl >= V163.breakEven(e, 'long', ACC.fee) * 0.99999);
        /* TP1 / TP2 of the scaled take-profit */
        const lv = c.splitTP ? levels(sym) : null; if (lv) for (let i = 0; i < 2; i++) { const y = L.py(lv[i].price); if (ok(y)) hline(g, L, y, up, [1, 3], `TP${i + 1} ${lv[i].pct}%${U.scale[sym] && U.scale[sym].hit[i] ? ' ✓' : ''}`, xr - 150); }
        /* trailing stop: activation, live stop and the next step */
        if (p && p.trail > 0) {
          const tp = V163.trailPlan(e, Math.max(p.hi || 0, price(sym)), p.trail, c.trailAct / 100, c.trailStep / 100, 'long');
          if (tp && !tp.active && ok(L.py(tp.act))) hline(g, L, L.py(tp.act), amb, [6, 3], `Trail activates ${fp(tp.act)}`, xr - 150);
          if (tp && tp.active && ok(L.py(tp.stop))) hline(g, L, L.py(tp.stop), amb, [6, 3], `Trail stop ${fp(tp.stop)}`, xr - 150);
          if (tp && tp.active && tp.next && ok(L.py(tp.next))) { g.globalAlpha = 0.5; hline(g, L, L.py(tp.next), amb, [1, 4], `next step ${fp(tp.next)}`, xr - 150); g.globalAlpha = 1; }
        }
      }
    }
    g.restore();
    beBtn(L, beY, showBE);
  };
  /* Alt + drag: magnetic snap of a dragged Entry / SL / TP line to the nearest candle high / low or the visible VWAP */
  const snapMove = (e) => {
    if (!e.altKey || typeof ChartTrade === 'undefined' || !ChartTrade.drag || typeof chart === 'undefined' || !chart || !chart.L || !chart.L.D) return;
    const d = ChartTrade.drag, b = ChartTrade.find(d.key); if (!b) return; const v = b[d.field]; if (!(v > 0)) return;
    const r = chart.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, L = chart.L, D = L.D, i = Math.max(0, Math.min(D.length - 1, chart.idxAtX ? chart.idxAtX(x) : D.length - 1));
    const lv = []; for (let k = i - 1; k <= i + 1; k++) if (D[k]) lv.push(D[k].h, D[k].l);
    const vis = D.slice(Math.max(0, (L.end || D.length) - (L.bars || D.length)), L.end || D.length), vw = V163.vwap(vis); if (vw) lv.push(vw);
    const tol = Math.abs(chart.yToPrice(y) - chart.yToPrice(y + 10)), s = V163.snap(v, lv, tol);
    if (s !== v && ChartTrade.set(d.key, d.field, s)) { U.stats.snaps++; chart.invalidate(); }
  };

  /* ══ 5. hotkeys ══ */
  const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const onKey = (e) => {
    U.lastAct = Date.now();
    const a = V163.hotkey(e, editable(e.target)); if (!a || !U.cfg.hotkeys || typeof curTab === 'undefined' || curTab !== 'markets') return;
    if ((typeof Replay !== 'undefined' && Replay.on) || document.querySelector('.v160-ov, .v13-modal')) return;
    e.preventDefault(); U.stats.hot++;
    if (a === 'cancel') {
      const n = (ACC.orders || []).length + (ST.stops || []).length; for (const o of (ACC.orders || []).slice()) ACC.cancel(o.id); ST.stops = [];
      try { renderStops(); renderTicketMeta(); saveState(); } catch (x) { /* ticket not built */ } if (chart) chart.invalidate();
      toast(n ? `Shift+X: cancelled ${n} pending order${n > 1 ? 's' : ''}` : 'Shift+X: no pending orders', n ? 'acc' : 'amb'); return;
    }
    const side = $1(`#ticket .tabs [data-side="${a}"]`), mk = $1('#tkType [data-t="market"]'), go = $1('#tkGo'); if (!go) return;
    if (side && !side.classList.contains('on')) side.click(); if (mk && !mk.classList.contains('on')) mk.click();
    go.click();
  };

  /* ══ 6. Auto-Disarm on Idle ══ */
  const idleCheck = () => { const b = B(); if (b && b.live() && V163.idleDue(U.lastAct, Date.now(), U.cfg.idleMin)) { U.stats.idle++; U.lastAct = Date.now(); b.kill(`Auto-Disarm on Idle: no activity for ${U.cfg.idleMin}m`); } };
  let mvAt = 0; const touch = () => { U.lastAct = Date.now(); };

  const attach = () => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(overlay)) chart.overlays.push(overlay); };
  const tick = () => { try { wireGuard(); feedWire(); tradeWire(); attach(); mountTicket(); paintPanel(false); idleCheck(); pullBook(); } catch (e) { console.warn('v163', e); } };
  U.start = () => {
    load(); document.body.classList.add('v163'); tick(); setInterval(tick, 1000);
    document.addEventListener('keydown', onKey);
    for (const t of ['pointerdown', 'wheel']) document.addEventListener(t, touch, { passive: true });
    document.addEventListener('pointermove', () => { const n = Date.now(); if (n - mvAt > 5000) { mvAt = n; touch(); } }, { passive: true });
    window.addEventListener('pointermove', snapMove);
  };
  Object.assign(U, { guard, overlay, onPx, moveBE, applySize, onKey, snapMove, idleCheck, paintPanel, mountTicket, tick, sizeCalc });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b163 = boot; boot = async function () { await _b163.apply(this, arguments); try { V163UI.start(); } catch (e) { console.warn('v163 init', e); } }; }

/* ExTerm v16.3 closed-loop live cockpit:
   · Floating Live Execution HUD (LIVE ARMED · Slot # · ping · daily P&L vs cap), 44px equity + drawdown micro-sparkline and a
     market-close / funding countdown pill; Pause New Entries (Keep Exits Active); cooldown countdown inside the Buy button
   · Focus Chart (F, reuses the rail collapse), docked Micro-Ticket strip, live Position & Pending Orders Drawer
     (Close 50% · Flatten · Reverse Position · Close Losing / Green Legs)
   · chart: Scale-In / Pyramid ghost line, Fee & Funding / Borrow drag line, liquidation line; ticket: Chase Limit with
     peg-to-best-bid/ask, liquidation & margin-buffer pill, Copy Trade Setup
   · watchlist Signal Readiness dots, acoustic + visual cues (instant mute), privacy-masked trade card on close
   · two-way 127.0.0.1 ACK + fill sync, heartbeat latency & packet-success graph, slippage & fill quality by symbol,
     Interactive Brokers / Alpaca / CCXT / Freqtrade starter bridges
   · per-slot ticker allowlist, time-in-trade auto-exit, price alert → conditional trigger, EOD Flat Timer, encrypted session
     recovery snapshot, Two-Key Arming (Shift + Alt + A), 3-Second Live Readiness Self-Check, Reset Session Safety Counters
   Strict CSP: listeners attached here, every dynamic string through esc(). Maths in V163 (v163core.js). */
const V163C = (() => {
  const KEY = 'exterm.v163.cockpit', SKEY = 'exterm.v163.short', NKEY = 'exterm.v163.snap', QKEY = 'exterm.v163.quality';
  const C = { c: V163.CDEF(), eq: [], hb: {}, q: {}, botPos: {}, fills: [], turned: 0, seen: new Set(), blocked: null, prevPx: {}, dots: {}, dotsAt: {}, pass: '', check: null, sh: null, peg: new Set(),
    lastCard: null, eodDay: '', stats: { acks: 0, fills: 0, cues: 0, cards: 0, trig: 0, tit: 0, eod: 0, resets: 0, held: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const B = () => (typeof V160UI !== 'undefined' && V160UI.st ? V160UI : null);
  const live = () => { const b = B(); return !!(b && b.live()); };
  const px0 = (s) => (typeof px === 'function' ? px(s) : 0) || 0;
  const fp = (v) => (typeof NT !== 'undefined' ? NT.fmtPrice(v) : String(v));
  const kindOf = (s) => (typeof isOnchain === 'function' && isOnchain(s) ? 'onchain' : typeof isStock === 'function' && isStock(s) ? 'stock' : 'crypto');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(C.c)); } catch (e) { /* session only */ } };
  const saveShort = () => { try { if (C.sh) localStorage.setItem(SKEY, JSON.stringify(C.sh)); } catch (e) { /* session only */ } };
  const saveQ = () => { try { localStorage.setItem(QKEY, JSON.stringify(C.q)); } catch (e) { /* session only */ } };
  const load = () => {
    let raw = null, s = null, q = null; try { raw = localStorage.getItem(KEY); s = JSON.parse(localStorage.getItem(SKEY) || 'null'); q = JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch (e) { /* defaults */ }
    C.c = V163.cload(raw); if (q && typeof q === 'object') for (const [k, a] of Object.entries(q)) if (Array.isArray(a)) for (const x of a.slice(-50)) if (x && Number.isFinite(+x.bps)) V163.qAdd(C.q, k, +x.bps, x.ack == null ? null : +x.ack);
    try { C.sh = s && typeof s === 'object' ? NT.ShortAccount.from(Object.assign({}, s, { short: true })) : new NT.ShortAccount({ cash: 100000, fee: ACC ? ACC.fee : 0.001, slip: ACC ? ACC.slip : 0.0005 }); } catch (e) { C.sh = null; }
  };
  const ui = () => { try { renderTicketMeta(); } catch (e) { /* ticket not built */ } try { renderPosStrip(); } catch (e) { /* strip not built */ } try { saveState(); } catch (e) { /* storage */ } saveShort(); if (typeof ChartTrade !== 'undefined' && ChartTrade.changed) ChartTrade.changed(); if (typeof chart !== 'undefined' && chart) chart.invalidate(); };
  const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const modalOpen = () => !!document.querySelector('.v160-ov, .v13-modal');

  /* ══ cues: WebAudio blip + HUD flash, muted instantly ══ */
  let actx = null;
  const cue = (kind) => {
    C.stats.cues++; const h = $1('#v163Hud'); if (h) { h.classList.remove('v163-flash', 'v163-flash-dn'); void h.offsetWidth; h.classList.add(kind === 'block' ? 'v163-flash-dn' : 'v163-flash'); }
    if (!C.c.cues || C.c.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), f = { buy: 880, sell: 660, fill: 990, block: 220, trig: 740 }[kind] || 600, t = actx.currentTime;
      o.type = kind === 'block' ? 'square' : 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'block' ? 0.22 : 0.09));
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.25);
    } catch (e) { /* audio unavailable */ }
  };

  /* ══ positions across the paper long account and the cockpit's reverse (short) book ══ */
  const positions = () => {
    const out = [];
    for (const [s, p] of Object.entries((typeof ACC !== 'undefined' && ACC && ACC.pos) || {})) if (p && p.qty > 0) out.push({ sym: s, qty: p.qty, entry: p.cost / p.qty, side: 'long', acct: ACC, sl: p.sl, tp: p.tp, t0: p.t0 });
    for (const [s, p] of Object.entries((C.sh && C.sh.pos) || {})) if (p && p.qty > 0) out.push({ sym: s, qty: p.qty, entry: p.entry, side: 'short', acct: C.sh, sl: p.sl, tp: p.tp, t0: p.t0 });
    return out;
  };
  const prices = () => { const m = {}; for (const p of positions()) m[p.sym] = px0(p.sym); return m; };
  const equity = () => { let e = 0; try { e += ACC.equity(priceMap()); } catch (x) { /* not booted */ } try { if (C.sh) e += C.sh.equity(prices()) - C.sh.cash0; } catch (x) { /* no short book */ } return e; };
  const closeOne = (p, qty, why) => { const pr = px0(p.sym); if (!(pr > 0)) return null; return p.acct.sell(p.sym, pr, qty, Date.now(), { reason: why, src: 'manual' }); };
  const act = (action, sym) => {
    const list = positions().filter((p) => !sym || p.sym === sym), plan = V163.drawerPlan(list, action, prices()); let n = 0;
    for (const x of plan) {
      const p = list.find((y) => y.sym === x.sym && y.acct === x.acct); if (!p) continue; const pr = px0(p.sym), usd = p.qty * pr;
      const t = closeOne(p, action === 'half' ? x.qty : null, { half: 'Drawer: Close 50%', flat: 'Drawer: Flatten', reverse: 'Drawer: Reverse Position', losers: 'Drawer: Close Losing Legs', winners: 'Drawer: Close Green Legs', all: 'Drawer: Flatten All' }[action]); if (t) n++;
      if (t && action === 'reverse' && pr > 0) {
        const d = p.sl > 0 ? Math.min(0.2, Math.max(0.002, Math.abs(p.entry - p.sl) / p.entry)) : 0.02, nu = usd * (1 - (ACC.fee || 0) * 2);
        const r = p.side === 'long' ? (C.sh ? C.sh.buy(p.sym, pr, nu, Date.now(), { slPx: pr * (1 + d), reason: 'Drawer: Reverse Position (short)', src: 'manual' }) : null) : ACC.buy(p.sym, pr, nu, Date.now(), { slPx: pr * (1 - d), reason: 'Drawer: Reverse Position (long)', src: 'manual' });
        if (r) toast(`Reversed ${esc(baseOf(p.sym))} to ${esc(p.side === 'long' ? 'SHORT' : 'LONG')} with a ${esc((d * 100).toFixed(2))}% stop`, 'acc'); else toast('Reverse: the opposite leg could not be opened (cash or price unavailable)', 'amb');
      }
    }
    if (action === 'all') { for (const o of (ACC.orders || []).slice()) ACC.cancel(o.id); ST.stops = []; try { renderStops(); } catch (e) { /* stops list */ } }
    ui(); paintDrawer(); if (n || action === 'all') toast(`${esc({ half: 'Closed 50%', flat: 'Flattened', reverse: 'Reversed', losers: 'Closed losing legs', winners: 'Closed green legs', all: 'Flattened all positions and cancelled pending orders' }[action])}${n ? ` (${n})` : ''}`, 'acc');
    else toast('Nothing to close for that action', 'amb');
    return n;
  };

  /* ══ HUD ══ */
  const pingNow = () => { const b = B(); if (!b) return 0; const ls = b.st.slots.filter((s) => s.enabled && (s.mode === 'live' || !b.live())); let m = 0; for (const s of ls) if (s.hb && s.hb.ok) m = m ? Math.min(m, s.hb.ms) : s.hb.ms; return m; };
  const dayPnl = () => { const b = B(); if (!b) return 0; try { b.dayLoss(); return equity() - (b.st.day ? b.st.day.eq0 : equity()); } catch (e) { return 0; } };
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="v163-hic">${d}</svg>`;
  const IC = { pause: '<path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2.2"/>', play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>', mute: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l4 6M21 9l-4 6" stroke="currentColor" stroke-width="1.8"/>', sound: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.6"/>', focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8"/>', micro: '<rect x="3" y="14" width="18" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 17h4" stroke="currentColor" stroke-width="1.8"/>', drawer: '<path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" stroke-width="1.8"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2"/>' };
  const hudHTML = () => `<div class="v163-hrow"><span class="v163-led" aria-hidden="true"></span><b id="v163HudTxt" class="mono"></b></div>
    <div class="v163-hrow"><canvas id="v163Spark" width="168" height="44" aria-label="Live session equity and drawdown"></canvas><div class="v163-hcol"><span id="v163HudDD" class="mono note"></span><span id="v163HudEvt" class="v163-pill mono"></span></div></div>
    <div class="v163-hrow v163-hbtns">
      <button type="button" class="v163-hb" data-v163h="pause" aria-pressed="false"></button>
      <button type="button" class="v163-hb" data-v163h="mute" aria-pressed="false"></button>
      <button type="button" class="v163-hb" data-v163h="focus" title="Focus Chart (F): collapse both side rails">${icon(IC.focus)}<span>Focus</span></button>
      <button type="button" class="v163-hb" data-v163h="micro" aria-pressed="false" title="Micro-Ticket docked bottom strip">${icon(IC.micro)}<span>Micro</span></button>
      <button type="button" class="v163-hb" data-v163h="drawer" title="Live positions & pending orders">${icon(IC.drawer)}<span>Positions</span></button>
      <button type="button" class="v163-hb" data-v163h="check" title="3-Second Live Readiness Self-Check">${icon(IC.check)}<span>Check</span></button>
    </div>`;
  const onHud = (e) => {
    const x = e.target.closest('[data-v163h]'); if (!x) return; const a = x.dataset.v163h;
    if (a === 'pause') setPause(!C.c.paused);
    else if (a === 'mute') { C.c.muted = !C.c.muted; save(); paintHud(true); toast(C.c.muted ? 'Cues muted' : 'Cues on', 'acc'); }
    else if (a === 'focus') focus();
    else if (a === 'micro') micro(!C.c.micro);
    else if (a === 'drawer') drawer();
    else if (a === 'check') selfCheck();
  };
  const setPause = (on) => {
    C.c.paused = !!on; save(); paintHud(true); paintCockpit(true); const b = B();
    if (b) b.led('breaker', { status: on ? 'entries paused' : 'entries resumed', detail: on ? 'Pause New Entries: live opening orders held, exits stay active' : 'Pause New Entries released' });
    toast(on ? '⏸ New entries paused: exits, stops and flatten stay active' : '▶ New entries resumed', on ? 'amb' : 'acc');
  };
  const paintSpark = () => {
    const cv = $1('#v163Spark'); if (!cv) return; const g = cv.getContext('2d'); if (!g) return; const w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
    const s = V163.spark(C.eq.map((x) => x.e), w, h); if (!s) { g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.fillText('collecting equity…', 6, h / 2 + 3); return; }
    g.beginPath(); s.peakPts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = s.pts.length - 1; i >= 0; i--) g.lineTo(s.pts[i][0], s.pts[i][1]); g.closePath(); g.fillStyle = 'rgba(244,63,94,.22)'; g.fill();
    g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = s.up ? '#2fd08a' : '#f43f5e'; g.lineWidth = 1.5; g.stroke();
    const dd = $1('#v163HudDD'), t = `DD ${s.ddPct.toFixed(2)}% · ${V163.money(s.last - s.first)}`; if (dd && dd.textContent !== t) dd.textContent = t;
  };
  const paintHud = (force) => {
    const host = typeof chart !== 'undefined' && chart && chart.host ? chart.host : $1('#chartHost'); if (!host) return; let h = $1('#v163Hud');
    if (!h || h.parentNode !== host) { if (h) h.remove(); h = document.createElement('div'); h.id = 'v163Hud'; h.className = 'v163-hud'; h.setAttribute('role', 'status'); h.setAttribute('aria-label', 'Live Execution HUD'); h.innerHTML = hudHTML(); h.addEventListener('click', onHud); h.addEventListener('pointerdown', (e) => e.stopPropagation()); host.appendChild(h); force = true; }
    const b = B(), on = live(); h.hidden = !on; if (!on && !force) return;
    const slots = b ? b.st.slots.filter((s) => s.enabled && s.mode === 'live').map((s) => s.id) : [], H = V163.hud({ armed: on, slots, ping: pingNow(), dayPnl: dayPnl(), cap: b ? b.st.caps.maxLoss : 0 });
    const tx = $1('#v163HudTxt', h); if (tx.textContent !== H.text) tx.textContent = H.text; if (h.dataset.level !== H.level) h.dataset.level = H.level;
    const ev = V163.nextEvent(Date.now(), kindOf(ST.sel)), ep = $1('#v163HudEvt', h), et = ev ? `${ev.name} in ${V163.countdown(ev.left)}` : 'on-chain · 24/7'; if (ep.textContent !== et) ep.textContent = et;
    const pb = $1('[data-v163h="pause"]', h), mb = $1('[data-v163h="mute"]', h), mi = $1('[data-v163h="micro"]', h);
    if (force || pb._p !== C.c.paused) { pb._p = C.c.paused; pb.innerHTML = icon(C.c.paused ? IC.play : IC.pause) + `<span>${C.c.paused ? 'Resume entries' : 'Pause entries'}</span>`; pb.setAttribute('aria-pressed', String(C.c.paused)); pb.title = 'Pause New Entries (Keep Exits Active)'; pb.classList.toggle('on', C.c.paused); }
    if (force || mb._m !== C.c.muted) { mb._m = C.c.muted; mb.innerHTML = icon(C.c.muted ? IC.mute : IC.sound) + `<span>${C.c.muted ? 'Muted' : 'Cues'}</span>`; mb.setAttribute('aria-pressed', String(C.c.muted)); mb.title = 'Acoustic & visual confirmation cues (instant mute)'; }
    mi.setAttribute('aria-pressed', String(C.c.micro)); mi.classList.toggle('on', C.c.micro);
    paintSpark();
  };

  /* ══ Buy button: cooldown countdown / paused entries ══ */
  const paintGo = () => {
    const go = $1('#tkGo'); if (!go) return; const b = B(), now = Date.now(), on = live(), buy = typeof tkSide === 'undefined' || tkSide === 'buy';
    const cd = on && b && b.fs ? V163.cooldownLabel(+b.fs.lockUntil, now) : null, lab = buy && cd ? cd : buy && on && C.c.paused ? 'Entries paused · exits active' : null;
    if (lab) { if (go._v163o == null) go._v163o = go.textContent; go.disabled = true; go.classList.add('v163-cd'); if (go.textContent !== lab) go.textContent = lab; go.setAttribute('aria-disabled', 'true'); }
    else if (go._v163o != null) { go.textContent = go._v163o; go._v163o = null; go.disabled = false; go.classList.remove('v163-cd'); go.removeAttribute('aria-disabled'); try { renderTicketMeta(); } catch (e) { /* ticket not built */ } }
    const mb = $1('#v163Micro [data-v163m="buy"]'); if (mb) { mb.disabled = !!lab; const t = lab || 'Buy'; if (mb.textContent !== t) mb.textContent = t; }
  };

  /* ══ Focus Chart (F) + Micro-Ticket ══ */
  const focus = () => { if (typeof V155UI !== 'undefined' && V155UI.zen) V155UI.zen(); else document.body.classList.toggle('v155-hideL'); setTimeout(paintFocus, 60); };
  const paintFocus = () => { const on = document.body.classList.contains('v155-hideL') && document.body.classList.contains('v155-hideR'); document.body.classList.toggle('v163-focus', on); const f = $1('#v163Hud [data-v163h="focus"]'); if (f) { f.setAttribute('aria-pressed', String(on)); f.classList.toggle('on', on); } };
  const micro = (on) => { C.c.micro = !!on; save(); document.body.classList.toggle('v163-micro', C.c.micro); mountMicro(); paintHud(true); setTimeout(() => window.dispatchEvent(new Event('resize')), 30); };
  const mountMicro = () => {
    const strip = $1('#posStrip'); if (!strip) return; let m = $1('#v163Micro');
    if (!m) {
      m = document.createElement('div'); m.id = 'v163Micro'; m.className = 'v163-mstrip'; m.setAttribute('role', 'group'); m.setAttribute('aria-label', 'Micro-Ticket');
      m.innerHTML = `<b class="v163-mt">Micro-Ticket</b><span class="v163-msym mono" id="v163mSym"></span>
        <label><span>$</span><input class="in mono" id="v163mUsd" inputmode="decimal" value="100" aria-label="Order size in dollars"></label>
        <label><span>SL %</span><input class="in mono" id="v163mSl" inputmode="decimal" value="1.5" aria-label="Stop-loss percent"></label>
        <label><span>TP %</span><input class="in mono" id="v163mTp" inputmode="decimal" value="3" aria-label="Take-profit percent"></label>
        <button type="button" class="btn up" data-v163m="buy">Buy</button><button type="button" class="btn dn" data-v163m="sell">Sell</button>
        <button type="button" class="btn sm" data-v163m="drawer">Positions</button><button type="button" class="btn sm" data-v163m="exit" aria-label="Exit Micro-Ticket">✕</button>`;
      m.addEventListener('click', (e) => { const x = e.target.closest('[data-v163m]'); if (!x) return; const a = x.dataset.v163m; if (a === 'exit') micro(false); else if (a === 'drawer') drawer(); else microGo(a); });
    }
    const ch = $1('#chartHost'), at = strip.closest('#v166Dock') && ch ? ch.closest('.v155-chartrow') || ch : strip; // v16.6 moved #posStrip into the bottom dock: keep the micro-ticket under the chart
    if (m.parentNode !== at.parentNode || m.previousElementSibling !== at) at.after(m);
    const s = $1('#v163mSym', m), t = ST.sel ? baseOf(ST.sel) + ' ' + fp(px0(ST.sel)) : ''; if (s.textContent !== t) s.textContent = t;
  };
  const setVal = (sel, v) => { const el = $1(sel); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
  const microGo = (side) => {
    const usd = parseFloat(($1('#v163mUsd') || {}).value), sl = parseFloat(($1('#v163mSl') || {}).value), tp = parseFloat(($1('#v163mTp') || {}).value);
    if (!(usd > 0)) { toast('Micro-Ticket: enter a $ size', 'amb'); return; }
    const sb = $1(`#ticket .tabs [data-side="${side}"]`); if (sb && !sb.classList.contains('on')) sb.click();
    const mk = $1('#tkType [data-t="market"]'); if (mk && !mk.classList.contains('on')) mk.click();
    const z = $1('#tkSize [data-z="usd"]'); if (z && !z.classList.contains('on')) z.click();
    setVal('#tkUsd', usd.toFixed(2)); if (side === 'buy') { setVal('#tkSl', sl > 0 ? String(sl) : ''); setVal('#tkTp', tp > 0 ? String(tp) : ''); }
    const go = $1('#tkGo'); if (go && !go.disabled) go.click(); else toast('Micro-Ticket: order button is locked (cooldown or paused entries)', 'amb');
  };

  /* ══ Live Position & Pending Orders Drawer ══ */
  const drawer = (open) => {
    let d = $1('#v163Drawer'); const want = open == null ? !d : open;
    if (!want) { if (d) d.remove(); return; }
    if (!d) {
      d = document.createElement('aside'); d.id = 'v163Drawer'; d.className = 'v163-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Live positions and pending orders');
      d.addEventListener('click', (e) => {
        const x = e.target.closest('[data-v163d]'); if (!x) return; const a = x.dataset.v163d, s = x.dataset.sym || '';
        if (a === 'close') { d.remove(); return; }
        if (a === 'cancel') { ACC.cancel(x.dataset.id); C.peg.delete(x.dataset.id); ui(); paintDrawer(); return; }
        if (a === 'unstop') { ST.stops = (ST.stops || []).filter((o) => String(o.id) !== x.dataset.id); try { renderStops(); } catch (er) { /* list */ } ui(); paintDrawer(); return; }
        if (a === 'copy') { copySetup(s); return; }
        act(a, s || null);
      });
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape') d.remove(); });
      document.body.appendChild(d);
    }
    paintDrawer(true); const f = $1('[data-v163d="close"]', d); if (f && open !== false) f.focus({ preventScroll: true });
    return d;
  };
  const paintDrawer = (force) => {
    const d = $1('#v163Drawer'); if (!d) return; const pos = positions(), pr = prices(), b = B();
    const rows = pos.map((p) => {
      const m = pr[p.sym] || p.entry, pnl = (m - p.entry) * p.qty * (p.side === 'short' ? -1 : 1), pct = ((m - p.entry) / p.entry) * 100 * (p.side === 'short' ? -1 : 1), bq = C.botPos[baseOf(p.sym)];
      const sync = bq == null ? '<span class="note">no bot fills</span>' : Math.abs(Math.abs(bq) - p.qty) <= p.qty * 0.01 ? `<span class="up">bot ${esc(NT.fmtQty(bq))} ✓ in sync</span>` : `<span class="v163-drift">bot ${esc(NT.fmtQty(bq))} · drift</span>`;
      return `<div class="v163-prow"><div class="v163-ph"><b>${esc(baseOf(p.sym))}</b><span class="v163-side ${p.side}">${p.side === 'short' ? 'SHORT' : 'LONG'}</span><span class="mono">${esc(NT.fmtQty(p.qty))} @ ${esc(fp(p.entry))}</span><span class="mono ${pnl >= 0 ? 'up' : 'dn'}">${esc(V163.money(pnl))} (${esc((pct >= 0 ? '+' : '') + pct.toFixed(2))}%)</span></div>
        <div class="v163-pmeta note mono">SL ${p.sl > 0 ? esc(fp(p.sl)) : '–'} · TP ${p.tp > 0 ? esc(fp(p.tp)) : '–'} · in trade ${p.t0 ? esc(V163.countdown(Date.now() - p.t0)) : '–'} · ${sync}</div>
        <div class="v163-pacts"><button type="button" class="btn xs" data-v163d="half" data-sym="${esc(p.sym)}">Close 50%</button><button type="button" class="btn xs" data-v163d="flat" data-sym="${esc(p.sym)}">Flatten</button><button type="button" class="btn xs" data-v163d="reverse" data-sym="${esc(p.sym)}">Reverse Position</button><button type="button" class="btn xs" data-v163d="copy" data-sym="${esc(p.sym)}">Copy setup</button></div></div>`;
    }).join('');
    const ords = (ACC.orders || []).map((o) => `<div class="v163-orow mono"><span>${esc(String(o.side).toUpperCase())} ${esc(baseOf(o.sym))} limit @ ${esc(fp(o.price))}${C.peg.has(o.id) ? ' · pegged' : ''}</span><button type="button" class="btn xs" data-v163d="cancel" data-id="${esc(o.id)}">Cancel</button></div>`).join('')
      + (ST.stops || []).map((o) => `<div class="v163-orow mono"><span>STOP ${esc(baseOf(o.sym || ''))} @ ${esc(fp(o.price || o.trig || 0))}</span><button type="button" class="btn xs" data-v163d="unstop" data-id="${esc(o.id)}">Cancel</button></div>`).join('');
    const k = rows + '|' + ords + '|' + (b && b.live()); if (!force && d._k === k) return; d._k = k;
    d.innerHTML = `<div class="v163-dh"><h3>Live Positions &amp; Pending Orders</h3><span class="v162-mode ${b && b.live() ? 'live' : 'paper'}">${b && b.live() ? 'LIVE BOT ARMED' : 'PAPER'}</span><button type="button" class="btn xs" data-v163d="close" aria-label="Close drawer">✕</button></div>
      <div class="v163-dbody">${rows || '<p class="note">No open positions.</p>'}<h4>Pending orders</h4>${ords || '<p class="note">No pending orders.</p>'}</div>
      <div class="v163-dfoot"><button type="button" class="btn sm" data-v163d="losers">Close Losing Legs</button><button type="button" class="btn sm" data-v163d="winners">Close Green Legs</button><button type="button" class="btn sm dn" data-v163d="all">Flatten All</button></div>
      <p class="note">Every close is a normal exit: it is never blocked by Pause New Entries, cooldowns or the opening-order guards.</p>`;
  };

  /* ══ ticket: Chase Limit + peg, liquidation & margin buffer, countdown, Copy Trade Setup ══ */
  const tkNum = (id) => { const el = $1(id), v = el ? parseFloat(el.value) : NaN; return v > 0 ? v : 0; };
  const tkEntry = () => (typeof tkType !== 'undefined' && tkType !== 'market' ? tkNum('#tkLimit') || px0(ST.sel) : px0(ST.sel));
  const quote = (s) => { const L = (typeof Feed !== 'undefined' && Feed.live[s]) || {}, p = px0(s); return { bid: L.bid > 0 ? +L.bid : p, ask: L.ask > 0 ? +L.ask : p }; };
  const chasePx = () => { const q = quote(ST.sel), side = typeof tkSide === 'undefined' ? 'buy' : tkSide; return V163.chase(side, q.bid, q.ask, V163.tick(q.bid), C.c.pegAgg); };
  const chase = () => {
    const p = chasePx(); if (!(p > 0)) { toast('Chase Limit: no bid / ask yet', 'amb'); return; }
    const lb = $1('#tkType [data-t="limit"]'); if (lb && !lb.classList.contains('on')) lb.click();
    setVal('#tkLimit', String(+p.toPrecision(10))); toast(`Chase Limit: pegged to best ${esc(typeof tkSide !== 'undefined' && tkSide === 'sell' ? 'ask' : 'bid')} ${esc(fp(p))}`, 'acc');
  };
  const ckHTML = () => `<div class="row v163-ckrow"><button type="button" class="btn sm" data-v163k="chase" title="Set the limit to the best bid (buy) or best ask (sell)">Chase Limit</button>
      <label class="chk"><input type="checkbox" id="v163Peg"${C.c.peg ? ' checked' : ''}> Peg to best bid/ask</label><label class="chk"><input type="checkbox" id="v163PegAgg"${C.c.pegAgg ? ' checked' : ''}> 1 tick inside</label></div>
    <div class="row v163-ckrow"><label class="f v163-lev"><span>Leverage ×</span><input class="in mono" id="v163Lev" inputmode="decimal" value="${esc(C.c.lev)}"></label><span class="v163-pill mono" id="v163Liq" role="status"></span></div>
    <div class="row v163-ckrow"><span class="v163-pill mono" id="v163Evt" role="timer"></span><button type="button" class="btn sm" data-v163k="copy">Copy Trade Setup</button></div>`;
  const mountCk = () => {
    const go = $1('#tkGo'); if (!go || $1('#v163Ck')) return;
    const box = document.createElement('div'); box.id = 'v163Ck'; box.className = 'v163-tk v163-ck'; box.innerHTML = ckHTML(); go.before(box);
    box.addEventListener('click', (e) => { const x = e.target.closest('[data-v163k]'); if (!x) return; if (x.dataset.v163k === 'chase') chase(); else copySetup(); });
    box.addEventListener('change', (e) => { const t = e.target; if (t.id === 'v163Peg') { C.c.peg = t.checked; save(); } else if (t.id === 'v163PegAgg') { C.c.pegAgg = t.checked; save(); } });
    box.addEventListener('input', (e) => { if (e.target.id === 'v163Lev') { C.c = V163.cload(Object.assign({}, C.c, { lev: e.target.value })); save(); paintCk(); if (chart) chart.invalidate(); } });
    const tk = $1('#ticket'); if (tk && !tk._v163c) { tk._v163c = true; tk.addEventListener('click', pegPre, true); tk.addEventListener('click', pegPost); }
    paintCk();
  };
  let pegSnap = null;
  const pegPre = (e) => { pegSnap = e.target.closest('#tkGo') && C.c.peg && typeof tkType !== 'undefined' && tkType === 'limit' ? new Set((ACC.orders || []).map((o) => o.id)) : null; };
  const pegPost = (e) => { if (!pegSnap || !e.target.closest('#tkGo')) return; for (const o of ACC.orders || []) if (!pegSnap.has(o.id)) C.peg.add(o.id); pegSnap = null; };
  const repeg = () => {
    if (C.c.peg && typeof tkType !== 'undefined' && tkType === 'limit' && document.activeElement !== $1('#tkLimit')) { const p = chasePx(); const el = $1('#tkLimit'); if (p > 0 && el && Math.abs((parseFloat(el.value) || 0) - p) > p * 1e-9) setVal('#tkLimit', String(+p.toPrecision(10))); }
    for (const o of ACC.orders || []) {
      if (!C.peg.has(o.id)) continue; const q = quote(o.sym), np = V163.chase(o.side, q.bid, q.ask, V163.tick(q.bid), C.c.pegAgg); if (np > 0 && np !== o.price) o.price = np;
    }
    for (const id of [...C.peg]) if (!(ACC.orders || []).some((o) => o.id === id)) C.peg.delete(id);
  };
  const paintCk = () => {
    const lq = $1('#v163Liq'); if (lq) {
      const e = tkEntry(), side = typeof tkSide !== 'undefined' && tkSide === 'sell' ? 'short' : 'long', L = V163.liq(e, C.c.lev, side, C.c.mmr / 100), bf = L ? V163.liqBuffer(px0(ST.sel) || e, L) : null;
      const slp = tkNum('#tkSl') / 100, slPx = slp > 0 ? e * (1 - slp) : 0, beyond = L && slPx > 0 && slPx <= L;
      const t = !L ? `${C.c.lev}× · no liquidation (spot)` : `${bf.warn || beyond ? '⚠ ' : ''}Liq ≈ ${fp(L)} · buffer ${bf.pct.toFixed(1)}%${bf.warn ? ' (< 15%)' : ''}${beyond ? ' · stop beyond liq' : ''}`;
      if (lq.textContent !== t) lq.textContent = t; lq.classList.toggle('warn', !!(L && (bf.warn || beyond)));
    }
    const ev = $1('#v163Evt'); if (ev) { const x = V163.nextEvent(Date.now(), kindOf(ST.sel)), t = x ? `${x.name} in ${V163.countdown(x.left)}` : 'On-chain · trades 24/7'; if (ev.textContent !== t) ev.textContent = t; ev.classList.toggle('warn', !!(x && x.left < 15 * 60000)); }
  };
  const copySetup = (sym) => {
    const s = sym || ST.sel, pos = positions().find((p) => p.sym === s);
    let o; if (pos) o = { sym: baseOf(s), side: pos.side, entry: pos.entry, sl: pos.sl, tp: pos.tp, tf: ST.tf };
    else { const e = tkEntry(), sl = tkNum('#tkSl') / 100, tp = tkNum('#tkTp') / 100, r = typeof V163UI !== 'undefined' && V163UI.sizeCalc ? V163UI.sizeCalc() : null; o = { sym: baseOf(s), side: 'long', entry: e, sl: sl > 0 ? e * (1 - sl) : 0, tp: tp > 0 ? e * (1 + tp) : 0, risk: r ? r.risk : 0, tf: ST.tf }; }
    const txt = V163.setupText(o); C.lastSetup = txt;
    const done = () => toast('Trade setup copied: ' + esc(txt), 'acc');
    try { navigator.clipboard.writeText(txt).then(done, () => toast('Copy blocked by the browser. Setup: ' + esc(txt), 'amb')); } catch (e) { toast('Setup: ' + esc(txt), 'acc'); }
    return txt;
  };

  /* ══ chart layer: pyramid ghost, fee & funding drag line, liquidation, reverse-book lines ══ */
  const tag = (g, txt, x, y, fill) => { g.font = '600 11px ui-monospace, Menlo, Consolas, monospace'; const w = g.measureText(txt).width + 12; g.fillStyle = fill; g.fillRect(x - w, y - 8, w, 16); g.fillStyle = '#0b0b0d'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, x - w + 6, y); };
  const hl = (g, L, y, col, dash, label, xr) => { g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(dash); g.beginPath(); g.moveTo(L.Lm, Math.round(y) + 0.5); g.lineTo(L.W - L.Rm, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]); if (label) { g.globalAlpha = 0.92; tag(g, label, xr, y - 11, col); g.globalAlpha = 1; } };
  const overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L || !L.py) return; const sym = ST.sel, p = positions().find((x) => x.sym === sym); if (!p) return;
    const top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, ok = (y) => Number.isFinite(y) && y >= top && y <= bot, pr = px0(sym), xr = L.W - L.Rm - 170, col = L.col || {};
    g.save(); g.beginPath(); g.rect(L.Lm, top, L.W - L.Lm - L.Rm, bot - top); g.clip();
    if (p.side === 'short') { if (ok(L.py(p.entry))) hl(g, L, L.py(p.entry), '#c4b5fd', [4, 3], `SHORT ${NT.fmtQty(p.qty)} @ ${fp(p.entry)}`, xr); if (p.sl > 0 && ok(L.py(p.sl))) hl(g, L, L.py(p.sl), col.dn || '#ef5350', [4, 3], `Short SL ${fp(p.sl)}`, xr); }
    const py = V163.pyramid(p.qty, p.entry, C.c.pyrPct / 100, pr);
    if (py && ok(L.py(pr))) { g.globalAlpha = 0.6; hl(g, L, L.py(pr), '#7dd3fc', [2, 5], `Add ${C.c.pyrPct}% @ ${fp(pr)} → avg ${fp(py.blended)}`, xr); g.globalAlpha = 1; if (ok(L.py(py.blended))) { g.globalAlpha = 0.45; hl(g, L, L.py(py.blended), '#7dd3fc', [1, 4], 'Blended entry', xr); g.globalAlpha = 1; } }
    const hrs = p.t0 ? (Date.now() - p.t0) / 3600000 : 0, rate = kindOf(sym) === 'crypto' || (p.side === 'short' && kindOf(sym) === 'stock') ? C.c.fundRate / 100 : 0, cl = V163.carryLine(p.entry, p.side, ACC.fee, rate, hrs);
    if (cl && ok(L.py(cl))) { const usd = Math.abs(cl - p.entry) * p.qty; hl(g, L, L.py(cl), '#D4AF37', [6, 3], `Fees + ${p.side === 'short' && kindOf(sym) === 'stock' ? 'borrow' : 'funding'} BE ${fp(cl)} (−$${usd.toFixed(2)})`, xr); }
    const lq = V163.liq(p.entry, C.c.lev, p.side, C.c.mmr / 100); if (lq && ok(L.py(lq))) hl(g, L, L.py(lq), '#ff4d6d', [8, 4], `Liq ≈ ${fp(lq)}`, xr);
    g.restore();
  };

  /* ══ watchlist Signal Readiness dots ══ */
  let mo = null, dotting = false;
  const dotFor = (s) => {
    const now = Date.now(); if (C.dotsAt[s] && now - C.dotsAt[s] < 10000) return C.dots[s] || 'idle'; C.dotsAt[s] = now;
    let cs = []; try { if (typeof Stores !== 'undefined') { const st = Stores.get(s + '|' + ST.tf) || Stores.get(s + '|1m'); if (st && st.candles) cs = st.candles.slice(-120).map((k) => k.c); } } catch (e) { cs = []; }
    return (C.dots[s] = V163.readiness(cs));
  };
  const applyDots = () => {
    const wl = $1('#watchList'); if (!wl || dotting) return; dotting = true;
    try {
      for (const r of wl.querySelectorAll('.wl-row[data-s]')) {
        const s = r.dataset.s, d = C.c.dots ? dotFor(s) : null; let i = r.querySelector('.v163-dot');
        if (!d) { if (i) i.remove(); continue; }
        if (!i) { i = document.createElement('i'); i.className = 'v163-dot'; i.setAttribute('role', 'img'); const b = r.querySelector('b'); if (b) b.before(i); else r.prepend(i); }
        const cls = 'v163-dot ' + d; if (i.className !== cls) { i.className = cls; const lab = d === 'ready' ? 'Signal ready: EMA 20/50 crossed in the last 3 bars' : d === 'near' ? 'Signal near: EMA 20/50 within 0.15%' : 'No signal'; i.title = lab; i.setAttribute('aria-label', lab); }
      }
    } finally { dotting = false; }
  };
  const wireDots = () => { const wl = $1('#watchList'); if (!wl || mo) return; mo = new MutationObserver(() => { if (!dotting) applyDots(); }); mo.observe(wl, { childList: true }); applyDots(); };

  /* ══ trades: cues + privacy-masked trade card on close ══ */
  const scanTrades = () => {
    const all = [...((typeof ACC !== 'undefined' && ACC && ACC.trades) || []).slice(-20), ...((C.sh && C.sh.trades) || []).slice(-20)];
    if (!C.primed) { for (const t of all) C.seen.add(t.id); C.primed = true; return; }
    for (const t of all) {
      if (!t || C.seen.has(t.id) || t.src === 'backtest') continue; C.seen.add(t.id); cue(t.side === 'buy' ? 'buy' : 'sell');
      if (t.side === 'sell' && Number.isFinite(t.pnl)) offerCard(t);
    }
    if (C.seen.size > 2000) C.seen = new Set([...C.seen].slice(-500));
    const b = B(); if (b) { const n = b.stats.blocked; if (C.blocked != null && n > C.blocked) cue('block'); C.blocked = n; }
  };
  const offerCard = (t) => {
    const prior = (t.short ? C.sh : ACC).trades.filter((x) => x.sym === t.sym && x.side === 'buy' && x.ts <= t.ts).pop(), sl = C.slAt && C.slAt[t.sym];
    const card = V163.maskCard(t, sl || (prior && prior.slPx) || 0); if (!card) return; C.lastCard = { t, card };
    if (C.c.autoCard) { exportCard(); return; }
    let p = $1('#v163CardPill'); if (!p) { p = document.createElement('div'); p.id = 'v163CardPill'; p.className = 'v163-cardpill'; p.setAttribute('role', 'status'); p.addEventListener('click', (e) => { const x = e.target.closest('[data-v163p]'); if (!x) return; if (x.dataset.v163p === 'save') exportCard(); p.remove(); }); document.body.appendChild(p); }
    p.innerHTML = `<span><b>${esc(card.title)}</b> <span class="${card.win ? 'up' : 'dn'}">${esc(card.result)}${card.r ? ' · ' + esc(card.r) : ''}</span></span><button type="button" class="btn xs" data-v163p="save">Save privacy-masked card</button><button type="button" class="btn xs" data-v163p="x" aria-label="Dismiss">✕</button>`;
    clearTimeout(C.cardT); C.cardT = setTimeout(() => { const q = $1('#v163CardPill'); if (q) q.remove(); }, 20000);
  };
  const cardCanvas = () => {
    const L = C.lastCard; if (!L) return null; const W = 1200, H = 675, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
    try { if (typeof chart !== 'undefined' && chart && chart.cv && chart.cv.width > 0) { g.globalAlpha = 0.9; g.drawImage(chart.cv, 0, 0, chart.cv.width, chart.cv.height, 0, 0, W, Math.round(H * 0.7)); g.globalAlpha = 1; } } catch (e) { /* tainted or absent */ }
    const gr = g.createLinearGradient(0, H * 0.55, 0, H); gr.addColorStop(0, 'rgba(11,11,13,0)'); gr.addColorStop(0.3, 'rgba(11,11,13,.92)'); gr.addColorStop(1, '#0b0b0d'); g.fillStyle = gr; g.fillRect(0, H * 0.55, W, H * 0.45);
    const c = L.card; g.textBaseline = 'alphabetic'; g.fillStyle = '#D4AF37'; g.font = '700 22px ui-sans-serif, system-ui, sans-serif'; g.fillText('ExTerm · Trade Card', 40, H - 150);
    g.fillStyle = '#e8e8ea'; g.font = '700 40px ui-sans-serif, system-ui, sans-serif'; g.fillText(c.title, 40, H - 100);
    g.fillStyle = c.win ? '#2fd08a' : '#f43f5e'; g.font = '800 64px ui-monospace, Menlo, Consolas, monospace'; g.fillText(c.result + (c.r ? '  ' + c.r : ''), 40, H - 34);
    g.fillStyle = 'rgba(232,232,234,.7)'; g.font = '500 18px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'right'; g.fillText(`held ${c.held}${c.reason ? ' · ' + c.reason : ''}`, W - 40, H - 100); g.fillText('privacy-masked: no size, no quantity, no account value', W - 40, H - 40); g.textAlign = 'left';
    return cv;
  };
  const exportCard = () => {
    const cv = cardCanvas(); if (!cv) { toast('No closed trade to export yet', 'amb'); return false; }
    cv.toBlob((bl) => { if (!bl) return; const u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = `exterm-trade-card-${(C.lastCard.card.title.split(' ')[0] || 'trade').replace(/[^\w-]/g, '')}-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); C.stats.cards++; toast('Privacy-masked trade card saved', 'acc'); }, 'image/png');
    return true;
  };

  /* ══ two-way bot sync: ACK + fill callback, heartbeat samples ══ */
  const onAck = (s, body, r) => {
    C.stats.acks++; const f = V163.parseFill(r && r.reply, r && r.key), b = B(); if (!f) return;
    const dir = V163.signedQty(body.side, body.action, 1) > 0 ? 'buy' : 'sell', ref = +body.price > 0 ? +body.price : f.price, sl = V163.slippage(f.price, ref, dir);
    V163.qAdd(C.q, body.symbol, sl ? sl.bps : 0, r.ms); saveQ(); C.stats.fills++;
    const k = String(body.symbol).toUpperCase(); C.botPos[k] = +((C.botPos[k] || 0) + V163.signedQty(body.side, body.action, f.qty)).toPrecision(12);
    C.fills.unshift({ ts: f.ts, slot: s.id, sym: k, side: dir, qty: f.qty, price: f.price, bps: sl ? sl.bps : 0, ack: r.ms, id: f.id }); if (C.fills.length > 30) C.fills.length = 30;
    if (b) b.led('fill', { slot: s.id, status: 'filled', key: r.key, sig: r.sig, detail: `${k} ${dir} ${f.qty} @ ${f.price} · ${sl ? sl.text : '0 bps'} vs ${ref} · ACK ${r.ms} ms${f.id ? ' · order ' + f.id : ''}` });
    cue('fill'); paintSync();
  };
  const onHb = (s, hb) => { const a = C.hb[s.id] || (C.hb[s.id] = []); a.push({ ok: !!(hb && hb.ok), ms: hb && hb.ms ? hb.ms : 0, t: Date.now() }); if (a.length > 60) a.splice(0, a.length - 60); paintSync(); };
  const guard = (body, t, acct) => {
    if (!V163.isOpening(body)) return { ok: true };
    const p = V163.pauseCheck(body, C.c.paused); if (!p.ok) { C.stats.held++; return p; }
    const b = B(), bot = acct !== ACC && !(b.manual || []).includes(acct);
    const bs = bot && typeof b.slotFor === 'function' ? b.slotFor((ST.bots || []).find((x) => x.account === acct)) : 6;
    for (const s of b.st.slots.filter((x) => x.enabled && x.mode === 'live' && (bot ? x.id === bs : x.id !== 6))) if (!V163.allowOk(C.c.allow[s.id], body.symbol)) return { ok: false, status: 'allowlist', why: `Slot ${s.id} ticker allowlist (${C.c.allow[s.id]}) does not include ${body.symbol}` };
    return { ok: true };
  };
  const wire = () => {
    const b = B(); if (!b) return;
    if (Array.isArray(b.pre) && !b.pre.includes(guard)) b.pre.unshift(guard);
    if (Array.isArray(b.post) && !b.post.includes(onAck)) b.post.push(onAck);
    if (Array.isArray(b.hbL) && !b.hbL.includes(onHb)) b.hbL.push(onHb);
    if (C.sh && Array.isArray(b.manual) && !b.manual.includes(C.sh)) b.manual.push(C.sh);
  };

  /* ══ automation: time-in-trade exit, EOD flat, conditional triggers, reverse-book exits ══ */
  const automate = () => {
    const now = Date.now(), b = B();
    if (C.c.titMin > 0) for (const p of positions()) if (V163.timeExitDue(p.t0, now, C.c.titMin)) { const t = closeOne(p, null, `Time-in-Trade auto-exit (${C.c.titMin}m)`); if (t) { C.stats.tit++; toast(`⏱ Time-in-Trade: closed ${esc(baseOf(p.sym))} after ${esc(C.c.titMin)}m`, 'amb'); if (b) b.led('breaker', { status: 'time-exit', detail: `${baseOf(p.sym)} closed after ${C.c.titMin}m in trade` }); ui(); } }
    const day = new Date().toISOString().slice(0, 10);
    if (C.c.eodMin > 0 && V163.eodDue(now, C.c.eodMin)) {
      const stk = positions().filter((p) => kindOf(p.sym) === 'stock');
      if (stk.length) { let n = 0; for (const p of stk) if (closeOne(p, null, `EOD Flat Timer (${C.c.eodMin}m before the US close)`)) n++; if (n) { C.stats.eod++; C.eodDay = day; toast(`🔔 EOD Flat Timer: flattened ${n} equity position${n > 1 ? 's' : ''} before the close`, 'amb'); if (b) b.led('breaker', { status: 'eod-flat', detail: `${n} equity position(s) flattened ${C.c.eodMin}m before the US close` }); ui(); } }
    }
    let fired = false;
    for (const r of C.c.triggers.slice()) {
      const p = px0(r.sym), prev = C.prevPx[r.id]; C.prevPx[r.id] = p; if (!V163.trigCross(r, prev, p)) continue;
      let t = null; if (r.action === 'buy') t = ACC.buy(r.sym, p, r.usd, now, { slPct: (r.sl || 2) / 100, reason: `Conditional trigger ${r.op} ${r.level}`, src: 'manual' }); else if (ACC.qty(r.sym) > 0) t = ACC.sell(r.sym, p, null, now, { reason: `Conditional trigger ${r.op} ${r.level}`, src: 'manual' });
      C.c.triggers = C.c.triggers.filter((x) => x.id !== r.id); fired = true; C.stats.trig++; cue('trig');
      toast(t ? `🎯 Trigger fired: ${esc(r.action.toUpperCase())} ${esc(baseOf(r.sym))} at ${esc(fp(p))}` : `🎯 Trigger crossed ${esc(baseOf(r.sym))} ${esc(r.op)} ${esc(fp(r.level))} but no order was possible`, t ? 'acc' : 'amb');
      if (b) b.led('breaker', { status: 'trigger', detail: `${baseOf(r.sym)} ${r.op} ${r.level} → ${r.action}${t ? '' : ' (nothing to do)'}` });
    }
    if (fired) { save(); ui(); paintCockpit(true); }
    if (C.sh) for (const s of Object.keys(C.sh.pos)) { const p = px0(s); if (p > 0 && C.sh.checkExits(s, p, p, now, { src: 'manual' })) { saveShort(); ui(); } }
  };

  /* ══ Two-Key Arming (Shift + Alt + A) + F hotkey hand-off ══ */
  const onKey = (e) => {
    if (V163.twoKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); C.turned = Date.now(); /* the chord must never reach the Alt + A Auto-Setup hotkey */ const a = $1('[data-v160="arm"]'); if (a) { a.classList.add('v163-key1'); setTimeout(() => a.classList.remove('v163-key1'), V163.TWO_KEY_MS); } toast('🔑 Key 1 turned: press “Enable Live External Execution” within 10 s to arm', 'amb'); return; }
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !editable(e.target)) setTimeout(paintFocus, 60);
  };
  const onArmClick = (e) => {
    const a = e.target.closest && e.target.closest('[data-v160="arm"]'); if (!a || !C.c.twoKey || a.disabled) return;
    if (!V163.twoKeyOk(C.turned, Date.now())) { e.preventDefault(); e.stopImmediatePropagation(); toast('🔐 Two-Key Arming: press Shift + Alt + A first (key 1), then arm within 10 s (key 2)', 'amb'); return; }
    C.turned = 0; a.classList.remove('v163-key1');
  };

  /* ══ 3-Second Live Readiness Self-Check ══ */
  const selfCheck = async () => {
    const b = B(); if (!b) return null; const t0 = performance.now(), sym = ST.sel, now = Date.now(), en = b.st.slots.filter((s) => s.enabled);
    C.check = { running: true }; paintCheck();
    const hb = await Promise.all(en.map((s) => Promise.race([b.heartbeat(s).then((h) => h || { ok: false }, () => ({ ok: false })), new Promise((r) => setTimeout(() => r({ ok: false, why: 'no reply in 3 s' }), 3000))])));
    const L = typeof Feed !== 'undefined' && Feed.live && Feed.live[sym], ts = L && L.ts ? L.ts : kindOf(sym) === 'onchain' && typeof OC !== 'undefined' ? OC.polled : 0, sq = V163.staleQuote(ts ? Date.now() - ts : NaN, kindOf(sym));
    const sp = b.spreadOf(sym), sg = sp.bid > 0 && sp.ask > 0 && b.fs ? V161.spreadGuard(sp.bid, sp.ask, b.fs.maxSpreadPct) : null, cd = b.fs && +b.fs.lockUntil > now ? new Date(+b.fs.lockUntil).toLocaleTimeString() : '';
    const r = V163.selfCheck({ slots: en.length, hbOk: hb.filter((h) => h && h.ok).length, hbMs: Math.max(0, ...hb.filter((h) => h && h.ok).map((h) => h.ms || 0)), requireSL: typeof V163UI !== 'undefined' ? V163UI.cfg.requireSL : true, maxLoss: +b.st.caps.maxLoss || 0,
      quoteOk: sq.ok, quoteWhy: sq.age == null ? 'no quote timestamp yet' : `${baseOf(sym)} quote ${(sq.age / 1000).toFixed(1)}s old (max ${(sq.max / 1000).toFixed(0)}s)`, cooldown: cd, spreadOk: sg ? sg.ok : true, spreadWhy: sg ? `spread ${sg.pct.toFixed(3)}% (ceiling ${b.fs.maxSpreadPct}%)` : 'no bid/ask: checked again on every order' });
    r.ms = Math.round(performance.now() - t0); r.ts = Date.now(); C.check = r; paintCheck();
    b.led('selfcheck', { status: r.ready ? 'ready' : 'not ready', detail: `${r.passed}/${r.rows.length} checks passed in ${r.ms} ms` });
    toast(r.ready ? `✅ Live Readiness: all ${esc(r.rows.length)} checks passed in ${esc(r.ms)} ms` : `⚠ Live Readiness: ${esc(r.rows.length - r.passed)} check(s) failed`, r.ready ? 'acc' : 'amb');
    return r;
  };
  const paintCheck = () => {
    const el = $1('#v163Check'); if (!el) return; const r = C.check;
    if (!r) { el.innerHTML = '<p class="note">Not run yet. Pings every enabled slot (3 s timeout) and checks stops, caps, quote freshness, cooldown and spread.</p>'; return; }
    if (r.running) { el.innerHTML = '<p class="note">Running… (max 3 s)</p>'; return; }
    el.innerHTML = `<div class="v163-ready ${r.ready ? 'ok' : 'bad'}">${r.ready ? 'READY' : 'NOT READY'} · ${r.passed}/${r.rows.length} in ${r.ms} ms</div><ul class="v163-chk">${r.rows.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}"><b>${x.ok ? '✓' : '✗'}</b> ${esc(x.k)} <span class="note">${esc(x.why)}</span></li>`).join('')}</ul>`;
  };

  /* ══ Reset Session Safety Counters (PAPER only) ══ */
  const resetCounters = () => {
    const b = B(); if (!b || !V163.canReset(b.st.mode)) { toast('Reset is only available while disarmed in PAPER mode', 'amb'); return false; }
    if (typeof V163UI !== 'undefined') { for (const k of Object.keys(V163UI.stats)) V163UI.stats[k] = 0; V163UI.sent = []; V163UI.since = Date.now(); } // restarts the drawdown-throttle window too
    for (const k of Object.keys(b.stats)) b.stats[k] = 0; for (const k of Object.keys(b.fails)) b.fails[k] = 0;
    if (b.fs) { b.fs.lockUntil = 0; b.fs.streakFrom = Date.now(); try { localStorage.setItem('exterm.v161.fs', JSON.stringify(b.fs)); } catch (e) { /* session only */ } }
    try { b.st.day = { d: new Date().toISOString().slice(0, 10), eq0: ACC.equity(priceMap()) }; localStorage.setItem('exterm.v160.bridge', JSON.stringify(b.st)); } catch (e) { /* session only */ }
    if (typeof V162UI !== 'undefined') V162UI.tripped = false;
    C.eq = []; for (const k of Object.keys(C.stats)) C.stats[k] = 0; C.stats.resets = 1; C.check = null; C.blocked = b.stats.blocked;
    b.led('reset', { status: 'paper', detail: 'Session safety counters reset: guard stats, hourly rate, heartbeat misses, loss-streak cooldown and daily-loss baseline' });
    toast('Session safety counters reset (PAPER)', 'acc'); paintCockpit(true); return true;
  };

  /* ══ encrypted session recovery snapshot ══ */
  const snapObj = () => ({ v163: typeof V163UI !== 'undefined' ? V163UI.cfg : null, cockpit: C.c, quality: C.q, short: C.sh ? C.sh.toJSON() : null, ts: Date.now() });
  const snapSave = async (pass) => {
    try { const blob = await V163.seal(snapObj(), pass); localStorage.setItem(NKEY, blob); C.pass = pass; C.snapAt = Date.now(); paintSnap(); toast('🔒 Encrypted session snapshot saved (AES-256-GCM)', 'acc'); return true; }
    catch (e) { toast('Snapshot: ' + esc(e.message || e), 'amb'); return false; }
  };
  const snapRestore = async (pass) => {
    if (live()) { toast('Disarm to PAPER before restoring a snapshot', 'amb'); return false; }
    let blob = null; try { blob = localStorage.getItem(NKEY); } catch (e) { blob = null; } if (!blob) { toast('No encrypted snapshot saved yet', 'amb'); return false; }
    try {
      const o = await V163.unseal(blob, pass);
      if (o.cockpit) C.c = V163.cload(o.cockpit); if (o.v163 && typeof V163UI !== 'undefined') { V163UI.cfg = V163.load(o.v163); try { localStorage.setItem('exterm.v163.cfg', JSON.stringify(V163UI.cfg)); } catch (x) { /* session */ } }
      if (o.short) { try { C.sh = NT.ShortAccount.from(Object.assign({}, o.short, { short: true })); const b = B(); if (b) b.manual = [C.sh]; } catch (x) { /* keep current */ } }
      if (o.quality) { C.q = {}; for (const [k, a] of Object.entries(o.quality)) if (Array.isArray(a)) for (const y of a) if (y && Number.isFinite(+y.bps)) V163.qAdd(C.q, k, +y.bps, y.ack); }
      C.pass = pass; save(); saveShort(); saveQ(); ui(); paintCockpit(true); toast('Session restored from the encrypted snapshot', 'acc'); return true;
    } catch (e) { toast('Restore failed: ' + esc(e.message || e), 'dn'); return false; }
  };
  const paintSnap = () => { const el = $1('#v163SnapSt'); if (!el) return; let has = false; try { has = !!localStorage.getItem(NKEY); } catch (e) { has = false; } const t = `${has ? 'Snapshot stored' : 'No snapshot yet'}${C.snapAt ? ' · last saved ' + new Date(C.snapAt).toLocaleTimeString() : ''}${C.pass ? ' · auto-saves every 60 s this session' : ''}`; if (el.textContent !== t) el.textContent = t; };

  /* ══ Closed-Loop Live Cockpit panel (inside the Execution Bridge) ══ */
  const ck = (k, label, hint, lock) => `<label class="v160-chk"><input type="checkbox" class="v163c-cfg" data-v163c="${k}"${C.c[k] ? ' checked' : ''}${lock ? ' data-lock="1"' : ''}> ${label}${hint ? ` <span class="note">${hint}</span>` : ''}</label>`;
  const nm = (k, label, min, max, step) => `<label><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" class="in mono v163c-cfg" data-v163c="${k}" value="${esc(C.c[k])}" inputmode="decimal"></label>`;
  const cockpitHTML = () => {
    const L = live(), eod = [0, 5, 10, 15, 30].map((m) => `<option value="${m}"${C.c.eodMin === m ? ' selected' : ''}>${m ? m + ' min before close' : 'Off'}</option>`).join('');
    const bopts = Object.entries(V163.BRIDGES).map(([k, x]) => `<option value="${k}">${esc(x.name)} · slot ${x.slot} · :${x.port}</option>`).join('');
    const trig = C.c.triggers.map((r) => `<li class="mono">${esc(baseOf(r.sym))} ${esc(r.op === '>=' ? '≥' : '≤')} ${esc(fp(r.level))} → ${esc(r.action.toUpperCase())}${r.action === 'buy' ? ' $' + esc(r.usd) + ' · SL ' + esc(r.sl) + '%' : ' all'} <button type="button" class="btn xs" data-v163a="untrig" data-id="${esc(r.id)}" aria-label="Remove trigger">✕</button></li>`).join('');
    return `<h3><svg viewBox="0 0 24 24" aria-hidden="true" class="v163-ic"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h2M19 12h2" stroke="currentColor" stroke-width="1.6"/></svg> Closed-Loop Live Cockpit · v16.3</h3>
      <div class="v163-grid">
        ${ck('paused', '<b>Pause New Entries (Keep Exits Active)</b>', 'stops, closes and flatten still work')}
        ${ck('twoKey', 'Hardware-Style Two-Key Arming', 'Shift + Alt + A, then Arm within 10 s', true)}
        ${ck('cues', 'Acoustic &amp; visual confirmation cues')}${ck('muted', 'Mute cues')}
        ${ck('autoCard', 'Auto-save privacy-masked trade card on close')}${ck('dots', 'Watchlist Signal Readiness dots')}
        ${nm('lev', 'Leverage × (liquidation pill)', 1, 125, 1)}${nm('mmr', 'Maintenance margin %', 0, 10, 0.1)}
        ${nm('fundRate', 'Funding / borrow % per 8h', 0, 1, 0.005)}${nm('pyrPct', 'Pyramid ghost add %', 1, 300, 5)}
        ${nm('titMin', 'Time-in-Trade auto-exit (min, 0 = off)', 0, 10080, 1)}
        <label><span>EOD Flat Timer (equities / futures)</span><select class="in v163c-cfg" data-v163c="eodMin">${eod}</select></label>
      </div>
      <h4>Per-slot asset &amp; ticker allowlist <span class="note">empty = any symbol · opening orders only${L ? ' · locked while armed' : ''}</span></h4>
      <div class="v163-allow">${[1, 2, 3, 4, 5, 6].map((i) => `<label><span>Slot ${i}</span><input class="in mono v163c-allow" data-slot="${i}" value="${esc(C.c.allow[i])}" placeholder="any (e.g. BTC, ETH, NVDA)"${L ? ' disabled' : ''}></label>`).join('')}</div>
      <div class="v163-acts"><button type="button" class="btn pri" data-v163a="check">Run 3-Second Live Readiness Self-Check</button>
        <button type="button" class="btn" data-v163a="reset"${L ? ' disabled title="Disarm to PAPER first"' : ''}>Reset Session Safety Counters</button>
        <button type="button" class="btn" data-v163a="drawer">Positions &amp; Orders Drawer</button></div>
      <div id="v163Check" role="status"></div>
      <h4>Two-way bot sync · 127.0.0.1 ACK + fill callback</h4>
      <div class="v163-sync"><div><canvas id="v163HbCv" width="360" height="64" aria-label="Bot heartbeat latency and packet success"></canvas><div id="v163HbSt" class="note mono"></div></div>
        <div><table class="v163-q"><caption class="note">Slippage &amp; fill quality by symbol</caption><thead><tr><th>Symbol</th><th>Fills</th><th>Avg slip</th><th>Avg ACK</th></tr></thead><tbody id="v163Q"></tbody></table></div></div>
      <div id="v163Fills" class="v163-fills mono"></div>
      <h4>Price alert → conditional trigger</h4>
      <div class="v163-trig"><input class="in mono" id="v163tSym" value="${esc(ST.sel || '')}" aria-label="Trigger symbol"><select class="in" id="v163tOp" aria-label="Direction"><option value=">=">crosses above ≥</option><option value="<=">crosses below ≤</option></select>
        <input class="in mono" id="v163tLvl" inputmode="decimal" placeholder="price" aria-label="Trigger price"><select class="in" id="v163tAct" aria-label="Action"><option value="buy">BUY</option><option value="sell">SELL all</option></select>
        <input class="in mono" id="v163tUsd" inputmode="decimal" value="100" aria-label="Buy size in dollars"><input class="in mono" id="v163tSl" inputmode="decimal" value="2" aria-label="Stop-loss percent"><button type="button" class="btn sm" data-v163a="trig">Add trigger</button></div>
      <ul class="v163-tlist">${trig || '<li class="note">No triggers armed.</li>'}</ul>
      <h4>Encrypted session recovery snapshot</h4>
      <div class="v163-snap"><input class="in" type="password" id="v163Pass" autocomplete="new-password" placeholder="passphrase (8+ characters, never stored)" aria-label="Snapshot passphrase"><button type="button" class="btn sm" data-v163a="snap">Save encrypted snapshot</button><button type="button" class="btn sm" data-v163a="restore">Restore</button><span class="note" id="v163SnapSt"></span></div>
      <h4>Local broker starter bridges <span class="note">~40 lines of Python each · verify the signature, execute, reply ack + fill</span></h4>
      <div class="v163-br"><select class="in" id="v163BrSel" aria-label="Starter bridge">${bopts}</select><button type="button" class="btn sm" data-v163a="brcopy">Copy</button><button type="button" class="btn sm" data-v163a="brsave">Download .py</button></div>
      <pre class="v161-pre mono v163-code" id="v163BrCode" tabindex="0" aria-label="Starter bridge source"></pre>`;
  };
  let cp = null;
  const onCockpit = async (e) => {
    const a = e.target.closest('[data-v163a]'); if (!a || e.type !== 'click') return; const k = a.dataset.v163a;
    if (k === 'check') selfCheck();
    else if (k === 'reset') { if (typeof confirmClick === 'function') confirmClick(a, resetCounters); else resetCounters(); }
    else if (k === 'drawer') drawer(true);
    else if (k === 'untrig') { C.c.triggers = C.c.triggers.filter((x) => x.id !== a.dataset.id); save(); paintCockpit(true); }
    else if (k === 'trig') {
      const r = { id: Math.random().toString(36).slice(2, 10), sym: ($1('#v163tSym').value || '').trim(), op: $1('#v163tOp').value, level: parseFloat($1('#v163tLvl').value), action: $1('#v163tAct').value, usd: parseFloat($1('#v163tUsd').value) || 0, sl: parseFloat($1('#v163tSl').value) || 2 };
      if (!V163.trigOk(r)) { toast('Trigger needs a symbol, a price above 0 and (for BUY) at least $1', 'amb'); return; }
      C.c.triggers = V163.cload(Object.assign({}, C.c, { triggers: C.c.triggers.concat([r]) })).triggers; C.prevPx[r.id] = px0(r.sym); save(); paintCockpit(true); toast(`Trigger armed: ${esc(baseOf(r.sym))} ${esc(r.op)} ${esc(fp(r.level))} → ${esc(r.action.toUpperCase())}`, 'acc');
    } else if (k === 'snap' || k === 'restore') { const p = $1('#v163Pass'), v = p ? p.value : ''; if (p) p.value = ''; if (k === 'snap') snapSave(v); else snapRestore(v); }
    else if (k === 'brcopy') { const t = V163.bridge($1('#v163BrSel').value); try { await navigator.clipboard.writeText(t); toast('Starter bridge copied', 'acc'); } catch (x) { toast('Copy blocked: select the code and copy it manually', 'amb'); } }
    else if (k === 'brsave') { const x = V163.BRIDGES[$1('#v163BrSel').value]; if (!x) return; const u = URL.createObjectURL(new Blob([V163.bridge($1('#v163BrSel').value)], { type: 'text/x-python' })), l = document.createElement('a'); l.href = u; l.download = x.file; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  };
  const onCfg = (e) => {
    const t = e.target;
    if (t.id === 'v163BrSel') { paintBridge(); return; }
    if (t.classList.contains('v163c-allow')) { if (live()) { paintCockpit(true); return; } if (e.type === 'change') { C.c.allow[t.dataset.slot] = V163.allowParse(t.value).join(', '); save(); t.value = C.c.allow[t.dataset.slot]; } return; }
    const f = t.closest('[data-v163c]'); if (!f) return; const k = f.dataset.v163c;
    if (f.dataset.lock && live()) { toast('Two-Key Arming is locked while armed', 'amb'); paintCockpit(true); return; }
    if (k === 'paused') { setPause(f.checked); return; }
    C.c = V163.cload(Object.assign({}, C.c, { [k]: f.type === 'checkbox' ? f.checked : f.tagName === 'SELECT' ? +f.value : f.value })); save(); paintHud(true);
    if (k === 'dots') { C.dotsAt = {}; applyDots(); } if (f.type === 'checkbox' || f.tagName === 'SELECT') paintCockpit(true); if (typeof chart !== 'undefined' && chart) chart.invalidate();
  };
  const paintBridge = () => { const s = $1('#v163BrSel'), c = $1('#v163BrCode'); if (!s || !c) return; const t = V163.bridge(s.value); if (c.textContent !== t) c.textContent = t; };
  const paintSync = () => {
    const cv = $1('#v163HbCv'); if (cv) {
      const g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h); const all = Object.entries(C.hb).flatMap(([id, a]) => a.map((x) => Object.assign({ id: +id }, x))).sort((a, b) => a.t - b.t).slice(-60);
      const mx = Math.max(10, ...all.filter((x) => x.ok).map((x) => x.ms)), bw = w / 60;
      all.forEach((x, i) => { const bh = x.ok ? Math.max(3, (x.ms / mx) * (h - 14)) : h - 14; g.fillStyle = x.ok ? (x.ms > 1000 ? '#D4AF37' : '#2fd08a') : '#f43f5e'; g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh); });
      g.fillStyle = 'rgba(232,232,234,.55)'; g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.fillText(all.length ? `max ${Math.round(mx)} ms` : 'waiting for heartbeats…', 4, 10);
    }
    const st = $1('#v163HbSt'); if (st) { const t = Object.entries(C.hb).map(([id, a]) => { const s = V163.hbStats(a); return `Slot ${id}: ${s.okPct == null ? '–' : s.okPct.toFixed(0)}% ok · avg ${s.avgMs == null ? '–' : Math.round(s.avgMs)} ms · ${s.n} pkts`; }).join('  |  ') || 'No heartbeats yet: enable a slot and wait 15 s or run the self-check.'; if (st.textContent !== t) st.textContent = t; }
    const q = $1('#v163Q'); if (q) { const rows = V163.qSummary(C.q); const html = rows.map((r) => `<tr><td>${esc(r.sym)}</td><td>${esc(r.n)}</td><td class="${r.bps > 0.05 ? 'dn' : 'up'}">${esc((r.bps >= 0 ? '+' : '') + r.bps.toFixed(1))} bps</td><td>${r.ack == null ? '–' : esc(Math.round(r.ack)) + ' ms'}</td></tr>`).join('') || '<tr><td colspan="4" class="note">No bot fills yet</td></tr>'; if (q._h !== html) { q._h = html; q.innerHTML = html; } }
    const f = $1('#v163Fills'); if (f) { const html = C.fills.slice(0, 6).map((x) => `<div>${esc(new Date(x.ts).toLocaleTimeString())} · Slot ${esc(x.slot)} · ${esc(x.sym)} ${esc(x.side.toUpperCase())} ${esc(NT.fmtQty(x.qty))} @ ${esc(fp(x.price))} · ${esc((x.bps >= 0 ? '+' : '') + x.bps.toFixed(1))} bps · ACK ${esc(x.ack)} ms${x.id ? ' · #' + esc(x.id) : ''}</div>`).join(''); if (f._h !== html) { f._h = html; f.innerHTML = html; } }
  };
  const paintCockpit = (force) => {
    const host = $1('#v160Bridge'); if (!host) return;
    if (!cp) { cp = document.createElement('div'); cp.id = 'v163Cockpit'; cp.className = 'v163-safety v163-cockpit'; cp.addEventListener('click', onCockpit); cp.addEventListener('change', onCfg); cp.addEventListener('input', (e) => { if (e.target.type === 'number') onCfg(e); }); }
    const anchor = $1('#v163Safety', host); if (cp.parentNode !== host) { if (anchor) anchor.after(cp); else host.appendChild(cp); if (!cp.firstChild) force = true; } // re-attach keeps the same nodes (focus, confirm clicks)
    const lk = live(); if (force || cp._lk !== lk) { const sel = $1('#v163BrSel', cp), sv = sel ? sel.value : ''; cp._lk = lk; cp.innerHTML = cockpitHTML(); if (sv) $1('#v163BrSel', cp).value = sv; for (const x of cp.querySelectorAll('[data-lock]')) x.disabled = lk; paintBridge(); paintCheck(); }
    paintSync(); paintSnap();
  };

  const attach = () => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(overlay)) chart.overlays.push(overlay); };
  let snapT = 0;
  const tick = () => {
    try {
      wire(); attach(); mountCk(); paintCk(); paintGo(); repeg(); scanTrades(); C.slAt = C.slAt || {}; for (const p of positions()) if (p.sl > 0) C.slAt[p.sym] = p.sl; automate(); paintCockpit(false); paintDrawer(false); wireDots();
      const now = Date.now(); if (live()) { C.eq.push({ t: now, e: equity() }); if (C.eq.length > 900) C.eq.splice(0, C.eq.length - 900); } paintHud(false);
      if (C.c.micro) mountMicro(); document.body.classList.toggle('v163-micro', !!C.c.micro); paintFocus();
      if (C.pass && now - snapT > 60000) { snapT = now; V163.seal(snapObj(), C.pass).then((b) => { try { localStorage.setItem(NKEY, b); C.snapAt = Date.now(); } catch (e) { /* storage */ } }, () => {}); }
    } catch (e) { console.warn('v163 cockpit', e); }
  };
  C.start = () => {
    load(); tick(); setInterval(tick, 1000); setInterval(() => { C.dotsAt = {}; applyDots(); }, 15000);
    document.addEventListener('keydown', onKey, true); document.addEventListener('click', onArmClick, true);
  };
  Object.assign(C, { act, drawer, paintDrawer, micro, microGo, focus, setPause, chase, chasePx, copySetup, overlay, onAck, onHb, guard, automate, selfCheck, resetCounters, snapSave, snapRestore, exportCard, cardCanvas, applyDots, paintHud, paintCockpit, positions, tick, offerCard });
  return C;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b163c = boot; boot = async function () { await _b163c.apply(this, arguments); try { V163C.start(); } catch (e) { console.warn('v163 cockpit init', e); } }; }
