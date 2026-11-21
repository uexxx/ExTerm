/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v15.6 UI: visual minimalism + 240Hz engine smoothing. Everything wraps existing views (ids, listeners and data feeds
   stay intact):
   · 1-word top navigation (English; translated labels stay as they are), full label kept in the tooltip
   · 44px sparklines in the Watchlist and DEX table, compact shorthand figures with the exact value in the title tooltip
   · one badge per row; Perp Leaderboard rows open the trader on a whole-row click
   · ONE right-hand inspector rail: DEX Token Audit, Whale Trader Detail and 0DTE strike Greeks share its geometry and
     replace each other (opening one closes the other)
   · O(1) latest-bar chart indicators (only the forming bar is recomputed; heavy overlays refresh ≤ 4×/s) and windowed
     rendering for long trade logs. Tonal surfaces, hover-only row actions, 4px scrollbars and chart-first ambient dimming
     are pure CSS under body.v156.
   Strict CSP: listeners in JS, every dynamic string through esc(). Maths in V156 (v156core.js). */
const V156UI = (() => {
  const U = { stats: { full: 0, patch: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const isEn = () => typeof I18N === 'undefined' || I18N.cur() === 'en';
  const svgSpark = (vals, title) => { const s = V156.spark(vals); if (!s) return '<span class="v156-spk v156-none" aria-hidden="true"></span>';
    return `<svg class="v156-spk ${s.dir}" viewBox="0 0 44 16" width="44" height="16" role="img" aria-label="${esc(title || 'trend')} ${esc(V156.pct(s.ch))}"><title>${esc((title || 'Trend') + ' ' + V156.pct(s.ch))}</title><polyline points="${esc(s.pts)}"/></svg>`; };

  /* ══ 1-word top navigation ══ */
  const navShort = () => {
    const nav = $1('#nav'); if (!nav) return; const en = isEn(); document.body.classList.toggle('v156-short', en);
    for (const [k, w] of Object.entries(V156.NAV)) {
      const b = [...nav.querySelectorAll('button[data-tab]')].find((x) => x.dataset.tab === k) || (document.getElementById(k) && document.getElementById(k).closest('#nav') ? document.getElementById(k) : null); if (!b) continue;
      for (const tn of [...b.childNodes]) if (tn.nodeType === 3 && tn.nodeValue.trim()) { const w0 = document.createElement('span'); w0.className = 'v156-ol'; w0.textContent = tn.nodeValue.trim(); tn.replaceWith(w0); } // bare-text labels ("Pro Desk")
      const labels = [...b.children].filter((c) => !c.matches('.ni, .nbadge, .v156-nl, [aria-hidden="true"]')); if (!labels.length) continue;
      const full = labels.map((c) => c.textContent.trim()).join(' ').trim(); let s = b.querySelector(':scope > .v156-nl');
      if (!s) { s = document.createElement('span'); s.className = 'v156-nl'; labels[labels.length - 1].after(s); }
      s.textContent = w; if (full && full !== w) b.title = full; else b.removeAttribute('title');
    }
  };

  /* ══ Watchlist: 44px sparkline per row (price kept, % column folded into the sparkline tooltip) ══ */
  const ring = V156.ring(40);
  const wlPaint = () => {
    for (const r of document.querySelectorAll('#watchList .wl-row[data-s]')) {
      const s = r.dataset.s; r.classList.add('v156s');
      let box = r.querySelector(':scope > .v156-spkbox'); if (!box) { box = document.createElement('span'); box.className = 'v156-spkbox'; const nm = r.firstElementChild; if (nm) nm.after(box); else r.prepend(box); }
      const own = r.firstElementChild && r.firstElementChild.querySelector('svg.spk'); // the watchlist's own candle sparkline: move it into the 44px column
      if (own) { box.replaceChildren(own); own.classList.add('v156-spk'); own.setAttribute('width', '44'); own.setAttribute('height', '16'); box._k = 'own'; continue; }
      if (box._k === 'own' && box.firstChild) continue;
      const vals = ring.get(s), key = vals.length + ':' + vals[vals.length - 1]; if (box._k === key) continue; box._k = key;
      box.innerHTML = svgSpark(vals, s.split('-')[0] + ' recent trend');
    }
  };
  const sample = () => {
    for (const r of document.querySelectorAll('#watchList .wl-row[data-s]')) {
      const s = r.dataset.s;
      try { if (typeof Stores !== 'undefined') { const st = Stores.get(s + '|' + ST.tf); if (st && st.candles && st.candles.length > 1) ring.seed(s, st.candles.slice(-40).map((c) => c.c)); } } catch (e) { /* no store yet */ }
      const p = typeof px === 'function' ? px(s) : null; if (p > 0) ring.push(s, p);
    }
    wlPaint();
  };
  const wlWire = () => { const wl = $1('#watchList'); if (!wl || wl._v156) return; wl._v156 = true; new MutationObserver(wlPaint).observe(wl, { childList: true }); sample(); setInterval(sample, 2000); };

  /* ══ DEX table: shorthand price + 44px sparkline, one badge per row ══ */
  const dexWrap = () => {
    if (typeof V155S === 'undefined' || !V155S.dexTable || V155S.dexTable._v156) return; const orig = V155S.dexTable;
    const W = function (rows) {
      const html = orig.apply(this, arguments), tpl = document.createElement('template'); tpl.innerHTML = html;
      for (const tr of tpl.content.querySelectorAll('tr[data-v155tok]')) {
        const s = tr.dataset.v155tok, st = (typeof OC !== 'undefined' && OC.stats[s]) || {}, td = tr.children; if (td.length < 4) continue;
        if (st.price > 0) ring.push('oc:' + s, st.price);
        let vals = ring.get('oc:' + s); if (vals.length < 2 && st.price > 0 && Number.isFinite(st.ch24)) vals = [st.price / (1 + st.ch24 / 100), st.price];
        td[1].innerHTML = `<span class="num v156-px" title="${esc(st.price > 0 ? '$' + V156.exact(st.price) : '')}">${esc(st.price > 0 ? V156.usd(st.price) : '–')}</span> ${svgSpark(vals, '24h')}`;
        const pill = td[2].querySelector('.safe-pill'), sc = td[2].querySelector('.mut'); if (pill && sc) { pill.title = sc.textContent.trim(); sc.remove(); }
      }
      return tpl.innerHTML;
    };
    W._v156 = true; V155S.dexTable = W;
  };

  /* ══ unified right-hand inspector rail ══ */
  const lb = () => (typeof LeaderUI !== 'undefined' ? LeaderUI : null);
  const closeLb = () => { const L = lb(); if (L && L.open && L.open.size) { L.open.clear(); L.renderPerp(); } };
  const watchDr = () => {
    const d = $1('#v155Drawer'); if (!d) return; d.classList.add('v156-insp');
    if (!d._v156) { d._v156 = true; new MutationObserver(() => { if (!d.hidden) closeLb(); }).observe(d, { attributes: true, attributeFilter: ['hidden'] }); }
    if (!d.hidden) closeLb();
  };
  U.openInspector = (title, body) => { if (typeof V155S === 'undefined' || !V155S.openDr) return null; const d = V155S.openDr(title, body); watchDr(); return d; };

  /* 0DTE strike → Greeks for both legs in the rail */
  const strikeHtml = (k) => {
    const ch = typeof P5UI !== 'undefined' ? P5UI.chain : null; if (!ch) return '<div class="empty">Load an options chain first.</div>';
    const spot = ch.spot || (typeof px === 'function' ? px(ch.sym) : 0), T0 = Math.max(1 / 365, ((ch.exp || 0) - Date.now() / 1000) / 31557600);
    const leg = (arr, type) => { const x = (arr || []).find((l) => +l.strike === +k); if (!x) return `<div class="note">No ${type} at this strike.</div>`; const g = V156.greeks(spot, +k, T0, 0.04, x.iv || 0.5, type);
      const f = (v, d) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));
      return `<div class="v151-kpis">${[['Delta', f(g && g.delta, 3)], ['Gamma', f(g && g.gamma, 5)], ['Theta / day', g ? (g.theta < 0 ? '−$' : '$') + f(Math.abs(g.theta), 2) : '–'], ['Vega / vol pt', g ? '$' + f(g.vega, 2) : '–'], ['IV', x.iv ? (x.iv * 100).toFixed(1) + '%' : '–'], ['Open interest', x.oi != null ? V156.compact(x.oi) : '–']].map(([a, b]) => `<div><span class="k">${esc(a)}</span><b class="num">${esc(b)}</b></div>`).join('')}</div>`; };
    const dist = spot > 0 ? ((+k / spot - 1) * 100) : 0;
    return `<div class="note">${esc(ch.sym)} · spot ${esc(NT.fmtPrice(spot))} · strike ${esc(V156.pct(dist))} from spot${ch.sim ? ' · modelled chain (labelled simulation)' : ''}</div><details open><summary>Call</summary>${leg(ch.calls, 'call')}</details><details open><summary>Put</summary>${leg(ch.puts, 'put')}</details>`;
  };
  const onStrike = (e) => { const r = e.target.closest && e.target.closest('[data-v156k]'); if (!r) return; const k = r.dataset.v156k; U.openInspector(`Γ 0DTE Greeks · ${esc(NT.fmtPrice(+k))}`, strikeHtml(k)); };

  /* Perp Leaderboard: whole-row click opens the trader, shorthand $ figures, the detail row joins the rail */
  const shortCells = (row) => {
    const tw = document.createTreeWalker(row, NodeFilter.SHOW_TEXT), hits = []; let n; while ((n = tw.nextNode())) { const v = V156.parseUsd(n.nodeValue); if (v != null && Math.abs(v) >= 1000) hits.push([n, v]); }
    for (const [node, v] of hits) { const t = node.nodeValue.trim(); node.nodeValue = (/^\+/.test(t) ? '+' : '') + V156.usd(v); if (node.parentElement) node.parentElement.title = (v < 0 ? '−$' : '$') + V156.exact(Math.abs(v)); }
  };
  const lbPost = () => {
    const host = $1('#lbPerp'); if (!host) return;
    for (const row of host.querySelectorAll('tr.lb-row:not([data-v156])')) { row.dataset.v156 = '1'; row.tabIndex = 0; shortCells(row); }
    const x = host.querySelector('tr.lb-x'); if (x) { x.classList.add('v156-insp'); if (typeof V155S !== 'undefined' && $1('#v155Drawer') && !$1('#v155Drawer').hidden) V155S.closeDr(); }
  };
  const lbWire = () => {
    const host = $1('#lbPerp'); if (!host || host._v156) return; host._v156 = true; new MutationObserver(lbPost).observe(host, { childList: true }); lbPost();
    const open = (row) => { const b = row && row.querySelector('[data-lb="expand"]'); if (b) b.click(); };
    host.addEventListener('click', (e) => { if (e.target.closest('button, a, input, select, label, summary')) return; open(e.target.closest('tr.lb-row')); });
    host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.lb-row')) { e.preventDefault(); open(e.target); } });
  };

  /* ══ O(1) latest-bar indicators on every CandleChart ══ */
  const HEAVY = ['vwap', 'st', 'kc', 'ichi', 'psar', 'stochrsi', 'adx', 'atr', 'obv'];
  const optKey = (o) => HEAVY.map((k) => (o[k] ? 1 : 0)).join('') + ':' + (o.type || '') + ':' + JSON.stringify(o.extra || []);
  const incWire = () => {
    if (typeof CandleChart === 'undefined' || CandleChart.prototype._v156) return; const P = CandleChart.prototype, orig = P.indicators; P._v156 = true;
    const full = (self) => { const c = orig.call(self), d = self.data; c.v156 = true; c.n = d.length; c.t0 = d.length ? d[0].t : 0; c.lastC = d.length ? d[d.length - 1].c : 0; c.cl = d.map((k) => k.c); c.opt = optKey(self.o || {}); c.at = performance.now(); U.stats.full++; return c; };
    /* optional overlays + Indicator-Picker extras: the same calls CandleChart.indicators makes (charts.js), refreshed on their own */
    const heavyPart = (self, c) => {
      const d = self.data, o = self.o, I = NT.ind, cl = c.cl;
      c.vwap = o.vwap && I.rvwap ? I.rvwap(d, Math.min(96, Math.max(10, Math.floor(d.length / 6)))).vw : undefined;
      c.st = o.st && I.supertrend ? I.supertrend(d, 10, 3) : undefined; c.kc = o.kc && I.keltner ? I.keltner(d, 20, 2, 10) : undefined;
      c.ichi = o.ichi && I.ichimoku ? I.ichimoku(d) : undefined; c.psar = o.psar && I.psar ? I.psar(d) : undefined;
      c.srsi = o.stochrsi && I.stochRsi ? I.stochRsi(cl) : undefined; c.adx = o.adx && I.adx ? I.adx(d, 14) : undefined;
      c.atr = o.atr ? I.atr(d, 14) : undefined; c.obv = o.obv && I.obv ? I.obv(d) : undefined;
      c.extra = []; if (typeof IND !== 'undefined') for (const e of o.extra || []) { const def = IND.byId[e.id]; if (!def) continue; try { c.extra.push({ def, e, out: def.f(d, Object.assign({}, def.p, e.p || {})) }); } catch (err) { console.warn('indicator', e.id, err); } }
      c.at = performance.now();
    };
    // the feed calls set() with the refreshed series on every poll: keep the cache, indicators() re-validates it below
    const _set = P.set; P.set = function () { const prev = this.cache, r = _set.apply(this, arguments); if (prev && prev.v156 && !this.cache) this.cache = prev; return r; };
    // history unchanged? 24 sampled closes + the last settled bar (a symbol / timeframe switch or a backfill fails this)
    const sameHist = (p, d, upto) => { const k = Math.max(1, Math.floor(upto / 24)); for (let i = 0; i < upto; i += k) if (p.cl[i] !== d[i].c) return false; return upto < 1 || p.cl[upto - 1] === d[upto - 1].c; };
    P.indicators = function () {
      const d = this.data || [], n = d.length, o = this.o || {}, p = this.cache;
      if (n < 2 || o.type === 'ha' || !p || !p.v156 || p.opt !== optKey(o) || p.t0 !== d[0].t || !p.cl) return full(this);
      const grew = p.n === n - 1; if (p.n !== n && !grew) return full(this);
      if (!sameHist(p, d, grew ? n - 2 : n - 1)) return full(this);
      if (p.n === n && p.lastC === d[n - 1].c) return p; // nothing moved
      // O(1): only the forming bar (plus the bar it just closed) is recomputed for the built-ins, on every tick
      if (grew) { p.cl.push(d[n - 1].c); p.cl[n - 2] = d[n - 2].c; V156.patchInd(p, p.cl, [n - 2, n - 1], NT.ind); } else { p.cl[n - 1] = d[n - 1].c; V156.patchInd(p, p.cl, [n - 1], NT.ind); }
      p.n = n; p.lastC = d[n - 1].c; U.stats.patch++;
      // heavy overlays/extras: immediately when a bar opens, otherwise at most 4×/s while the bar forms
      if ((HEAVY.some((k) => o[k]) || (o.extra || []).length) && (grew || performance.now() - p.at > 250)) { heavyPart(this, p); U.stats.heavy = (U.stats.heavy || 0) + 1; }
      return p;
    };
  };

  /* ══ windowed rendering for long tables (only the visible rows live in the DOM) ══ */
  U.virt = (box, list, rowFn, rowH = 28) => {
    const tb = box && box.querySelector('tbody'); if (!tb || !Array.isArray(list)) return;
    const cols = ((box.querySelector('thead tr') || {}).children || []).length || 1; let last = '', raf = 0, rh = rowH;
    const pad = (h) => (h > 0 ? `<tr class="v156-pad" aria-hidden="true"><td colspan="${cols}" style="height:${h}px;padding:0;border:0"></td></tr>` : '');
    const paint = () => { const w = V156.vwin(box.scrollTop, box.clientHeight || 260, rh, list.length, 10), key = w.start + ':' + w.end; if (key === last) return; last = key; tb.innerHTML = pad(w.padTop) + list.slice(w.start, w.end).map(rowFn).join('') + pad(w.padBot); };
    box.classList.add('v156-virt'); box.dataset.vrows = String(list.length); paint();
    const real = tb.querySelector('tr:not(.v156-pad)'); if (real && real.offsetHeight > 0 && Math.abs(real.offsetHeight - rh) > 1) { rh = real.offsetHeight; last = ''; paint(); }
    box.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }, { passive: true });
  };

  U.start = () => {
    document.body.classList.add('v156');
    incWire(); dexWrap(); navShort(); wlWire(); lbWire();
    // the page-level rail (DEX audit / strike Greeks) belongs to the screen it was opened on: switching tabs closes it.
    // The trader rail lives inside its tab (hidden with it) and docks: the leaderboard reflows beside it (CSS).
    if (typeof showTab === 'function' && !showTab._v156) { const _st = showTab; showTab = function (k) { const on = document.querySelector('.tab.on'); if (!on || on.id !== 'tab-' + k) { try { if (typeof V155S !== 'undefined' && V155S.closeDr) V155S.closeDr(); } catch (e) { /* not mounted */ } } return _st.apply(this, arguments); }; showTab._v156 = true; }
    if (typeof I18N !== 'undefined' && !I18N.apply._v156) { const a = I18N.apply; I18N.apply = function () { const r = a.apply(this, arguments); try { navShort(); } catch (e) { /* nav not mounted */ } return r; }; I18N.apply._v156 = true; }
    document.addEventListener('click', (e) => { onStrike(e); if (e.target.closest && e.target.closest('[data-v155tok]')) setTimeout(watchDr, 0); }, true);
    document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-v155tok]')) setTimeout(watchDr, 0); });
    setTimeout(() => { navShort(); wlWire(); lbWire(); watchDr(); }, 3000);
  };
  U.navShort = navShort;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b156 = boot; boot = async function () { await _b156.apply(this, arguments); try { V156UI.start(); } catch (e) { console.warn('v156 init', e); } }; }
