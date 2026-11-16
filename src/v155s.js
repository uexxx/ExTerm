/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v15.5 screen restructures. Every existing control is wrapped or moved, never re-implemented, so its listeners,
   ids and data feeds keep working:
   1. Pro Desk → Order Flow: 2-column split (DOM ladder + tape-velocity bar | tabbed CVD & Absorption · Anchored VWAP &
      VPVR · 0DTE Gamma Flip & Charm), by wrapping P5UI.R.dom.
   2. On-chain DEX pools: a 4-column ☰ Table view (Token / Pair · Price & 24h % · Safety Score · Signal) with a slide-out
      Inspect Token drawer (holder-cluster X-ray, LP lock details, gap-fill, lead-lag), by wrapping Radar.
   3. Perp Leaderboard: 4 columns (Rank & Wallet · Alpha · ROI % / Net PnL $ · Open Positions), a Style filter in the one
      filter strip, and the existing expanded row turned into a slide-out Trader Detail & Mirror drawer.
   4. Grok tab: a 3-tab intelligence rail (Grok Bot · 3-Agent Copilot · Macro Shield) with starter chips, active-rule
      cards and a plain-English Drawdown Cool-Off pill.
   5. Settings: 4 tabs (General & Language · Chart & Hotkeys · Execution & Webhooks · Security & Vault).
   Strict CSP: listeners in JS, every dynamic string through esc(). */
const V155S = (() => {
  const U = {};
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const t = (k) => `<span data-i18n="${k}">${esc(T(k))}</span>`;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const cfg = () => (typeof V155UI !== 'undefined' ? V155UI.cfg() : (ST.v155 = ST.v155 || {}));
  const up = () => (typeof V154UpUI !== 'undefined' ? V154UpUI : null);
  const kpis = (rows) => `<div class="v151-kpis">${rows.map(([k, v, c]) => `<div><span class="k">${esc(k)}</span><b class="num ${c || ''}">${esc(v)}</b></div>`).join('')}</div>`;
  const fp = (p) => (p == null || !isFinite(p) ? '–' : NT.fmtPrice(p));
  const i18n = () => { if (typeof I18N !== 'undefined') I18N.apply(); };

  /* ══ shared slide-out drawer (z-index above the corner banner pill, below popovers; no backdrop, nothing blocks clicks) ══ */
  const drawer = () => {
    let d = $('#v155Drawer'); if (d) return d;
    d = el('aside', 'v155-drawer', `<div class="v155-dh"><b id="v155DrTitle"></b><button type="button" class="x" data-v155dr="close" aria-label="Close">×</button></div><div class="v155-db" id="v155DrBody"></div>`);
    d.id = 'v155Drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-labelledby', 'v155DrTitle'); d.hidden = true; document.body.appendChild(d);
    d.addEventListener('click', onDrawer); document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) closeDr(); });
    return d;
  };
  const openDr = (title, body) => { const d = drawer(); $('#v155DrTitle').innerHTML = title; $('#v155DrBody').innerHTML = body; d.hidden = false; d.classList.add('on'); i18n(); return d; };
  const closeDr = () => { const d = $('#v155Drawer'); if (d) { d.classList.remove('on'); d.hidden = true; } U.tok = null; };

  /* ══ 2. On-chain DEX: ☰ Table view + Inspect Token drawer ══ */
  const safetyOf = (s) => { const m = OC.meta[s] || {}, p = OC.parse(s) || {}; return m.ca && typeof Safety !== 'undefined' ? Safety.cache[p.chain + ':' + m.ca] || null : null; };
  const signal = (s) => { const sc = typeof Radar !== 'undefined' ? Radar.score(s) : 0; return sc > 1.5 ? ['🔥', 'Momentum', 'up'] : sc > 0.8 ? ['↗', 'Buyers in control', 'up'] : sc < -0.3 ? ['↘', 'Sellers in control', 'dn'] : ['·', 'Neutral', '']; };
  const grade = (sf) => `<span class="safe-pill g-${esc(String(sf.grade).toLowerCase().replace('?', 'u'))}">${esc(sf.grade)}</span>${sf.score != null ? ` <span class="mut num">${esc(sf.score)}/100</span>` : ''}`;
  U.dexTable = (rows) => `<table class="v152-t v155-dex"><thead><tr><th>${t('v155.dx.token')}</th><th>${t('v155.dx.price')}</th><th>${t('v155.dx.safety')}</th><th>${t('v155.dx.signal')}</th></tr></thead><tbody>${rows.map((s) => {
    const st = OC.stats[s] || {}, m = OC.meta[s] || {}, sf = safetyOf(s), [ic, lab, c] = signal(s);
    return `<tr data-v155tok="${esc(s)}" tabindex="0" role="button" aria-label="${esc(T('v155.dx.inspect') + ' ' + (m.s || ''))}"><td><b>${esc(m.s || '?')}</b> <span class="mut">/ ${esc(m.q || '')}</span><div class="mut">${esc((m.n || '').slice(0, 28))}${m.dex ? ' · ' + esc(m.dex) : ''}</div></td>`
      + `<td class="num">${esc(fp(st.price))} <span class="${cls(st.ch24)}">${esc(st.ch24 == null ? '' : NT.fmtPct(st.ch24))}</span></td><td>${sf ? grade(sf) : '<span class="mut">not scanned</span>'}</td><td class="${c}">${esc(ic)} ${esc(lab)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">No pairs match these filters.</td></tr>'}</tbody></table>`;
  const inspect = (s) => {
    const st = OC.stats[s] || {}, m = OC.meta[s] || {}, sf = safetyOf(s), u = up(); U.tok = s;
    // the Pro Tools drawer renders the same output ids: empty its copies so X-ray / gap-fill / lead-lag land in this drawer
    for (const b of document.querySelectorAll('#v154Up [data-body="scan"], #v154Up [data-body="dex"]')) b.innerHTML = '';
    const lp = sf && Array.isArray(sf.checks) ? sf.checks.filter((c) => /lp|lock|burn|liquid/i.test((c.id || '') + ' ' + (c.label || ''))) : [];
    const [ic, lab, c] = signal(s);
    openDr(`🔎 ${t('v155.dx.inspect')} · ${esc(m.s || '?')}`, kpis([['Price', fp(st.price)], ['24h', st.ch24 == null ? '–' : NT.fmtPct(st.ch24), cls(st.ch24)], ['Liquidity', st.liq ? '$' + NT.fmtCompact(st.liq) : '–'], ['Market cap', st.mcap || st.fdv ? '$' + NT.fmtCompact(st.mcap || st.fdv) : '–'], ['Safety', sf ? sf.grade + (sf.score != null ? ' · ' + sf.score : '') : 'not scanned'], ['Signal', ic + ' ' + lab, c]])
      + `<div class="v151-row"><button type="button" class="btn sm" data-v155dr="chart">📈 Open chart</button>${m.ca ? '<button type="button" class="btn sm" data-v155dr="scan">🛡 Run safety scan</button>' : ''}</div>`
      + `<details open><summary>🩻 Dev-Wallet Cluster X-Ray</summary>${u ? u.R.dex() : ''}</details>`
      + `<details open><summary>🔒 ${t('v155.dx.lp')}</summary>${lp.length ? lp.map((x) => `<div class="v155-chk"><b>${esc(x.label || x.id)}</b> <span class="tag ${x.status === 'pass' ? 'up' : x.status === 'fail' ? 'dn' : 'amb'}">${esc(x.status)}</span><div class="mut">${esc(x.why || '')}</div></div>`).join('') : '<div class="note">Run the safety scan to read the pool’s LP lock and burn status.</div>'}</details>`
      + `<details><summary>⤓ Gap-Fill Scanner · ↔ Lead-Lag Divergences</summary>${u ? u.R.scan() : ''}</details>`);
  };
  const onDrawer = (e) => {
    const b = e.target.closest('[data-v155dr]'), u = up(), s = U.tok;
    if (b) { const a = b.dataset.v155dr;
      if (a === 'close') closeDr();
      else if (a === 'chart' && s) { closeDr(); if (typeof openSym === 'function') openSym(s); }
      else if (a === 'scan' && s) { const m = OC.meta[s] || {}, p = OC.parse(s) || {}; b.disabled = true; Safety.scan(m.ca, p.chain).then(() => { if (U.tok === s) inspect(s); }).catch((er) => { toast('Safety scan: ' + esc(er.message || er), 'dn'); b.disabled = false; }); }
      return; }
    const v = e.target.closest('[data-v]'); if (!v || !u || !u.A[v.dataset.v]) return;
    if (v.dataset.v === 'xray' && s && ST.sel !== s && typeof selectSym === 'function') selectSym(s); // the X-ray reads the open market
    u.A[v.dataset.v](v);
  };
  const dexWrap = () => {
    if (typeof Radar === 'undefined' || Radar._v155) return; Radar._v155 = true;
    const _tb = Radar.toolbar, _rr = Radar.render;
    Radar.toolbar = function () { const on = (ST.radar || {}).view === 'table'; return _tb.apply(this, arguments).replace(/(<button data-v="bubbles"[^>]*>[^<]*<\/button>)/, `$1<button data-v="table" class="${on ? 'on' : ''}">☰ ${esc(T('v155.dx.table'))}</button>`); };
    Radar.render = function () {
      if ((ST.radar || {}).view !== 'table') return _rr.apply(this, arguments);
      const host = $('#rdBody'); if (!host) return; Radar.key = ''; // the other views re-render when switched back
      if (!Radar.rows || !Radar.rows.length) return _rr.apply(this, arguments); // loading / error states stay the original's
      const h = U.dexTable(Radar.filtered()); if (host._v155 !== h) { host._v155 = h; host.innerHTML = h; i18n(); }
    };
    document.addEventListener('click', (e) => { const r = e.target.closest('[data-v155tok]'); if (r) inspect(r.dataset.v155tok); }, true); // capture: the radar host stops bubbling clicks
    document.addEventListener('keydown', (e) => { const r = e.target.closest && e.target.closest('[data-v155tok]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inspect(r.dataset.v155tok); } });
  };

  /* ══ 1. Pro Desk → Order Flow: 2-column split ══ */
  const tapeBar = () => {
    const ring = (typeof TFX !== 'undefined' && TFX.ring.get(ST.sel)) || []; let last = ring.length ? ring[0].p : 0;
    const tr = ring.slice(-600).map((x) => { const side = x.p >= last ? 'buy' : 'sell'; last = x.p; return { t: x.t * (x.t < 1e12 ? 1000 : 1), side, q: x.q || 1 }; });
    const v = V154.tapeVelocity(tr, Date.now(), 5000), pct = Math.max(2, Math.min(100, v.base ? (v.perSec / (v.base * 3)) * 100 : v.perSec * 10));
    return `<div class="panel p5-p v155-tape"><div class="ph">⚡ ${t('v155.of.tape')}<span class="sp"></span><span class="note num">${esc(v.perSec)}/s · base ${esc(v.base)}/s</span></div><div class="pb"><div class="v155-tbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}"><i class="${v.side === 'buy' ? 'up' : 'dn'}" style="width:${pct.toFixed(0)}%"></i></div><div class="note">${v.burst ? `<span class="tag ${v.side === 'buy' ? 'up' : 'dn'}">AGGRESSIVE ${v.side === 'buy' ? 'BUY' : 'SELL'} SWEEP</span> ` : ''}Imbalance ${esc(Math.round(Math.abs(v.imbalance) * 100))}% ${esc(v.side)} · last 5 s vs the 30 s before</div></div></div>`;
  };
  const candlesNow = () => { try { const st = typeof Stores !== 'undefined' && Stores.get(ST.sel + '|' + ST.tf); return (st && st.candles && st.candles.length ? st.candles : (typeof chart !== 'undefined' && chart ? chart.data : [])).slice(-200); } catch (e) { return []; } };
  const vwapHtml = () => {
    const D = candlesNow(); if (D.length < 20) return '<div class="empty">Needs 20+ candles on the open chart.</div>';
    let i0 = 0; D.forEach((c, i) => { if (c.l < D[i0].l) i0 = i; }); // anchor at the lowest low in view
    const vp = P5.vpvr(D, 24), av = V152.avwap(D, i0), a = av[av.length - 1], p = D[D.length - 1].c, mx = Math.max(...vp.bins.map((b) => b.v)) || 1, H = 160;
    const pos = p > a.u2 ? 'above +2σ (stretched)' : p > a.u1 ? 'above +1σ' : p >= a.d1 ? 'inside ±1σ (fair value)' : p >= a.d2 ? 'below −1σ' : 'below −2σ (stretched)';
    return kpis([['POC', fp(vp.poc)], ['Value area high', fp(vp.vah)], ['Value area low', fp(vp.val)], ['AVWAP', fp(a.vw)], ['±1σ', fp(a.d1) + ' – ' + fp(a.u1)], ['Price vs AVWAP', pos, p >= a.vw ? 'up' : 'dn']])
      + `<svg class="v155-vp" viewBox="0 0 300 ${H}" preserveAspectRatio="none" role="img" aria-label="Volume profile with point of control">${vp.bins.map((b, i) => { const y = H - ((i + 1) / vp.bins.length) * H, inVA = b.p1 > vp.val && b.p0 < vp.vah; return `<rect x="0" y="${y.toFixed(1)}" width="${((b.v / mx) * 300).toFixed(1)}" height="${(H / vp.bins.length - 1).toFixed(1)}" class="${Math.abs((b.p0 + b.p1) / 2 - vp.poc) < vp.step ? 'poc' : inVA ? 'va' : ''}"/>`; }).join('')}</svg>`
      + `<div class="note">Anchored at the lowest low of the last ${esc(D.length)} ${esc(ST.tf)} candles. Gold = point of control, shaded = 70% value area.</div>`;
  };
  const gammaHtml = () => {
    const ch = typeof P5UI !== 'undefined' ? P5UI.chain : null;
    if (!ch) return `<div class="empty">0DTE gamma and charm need an options chain.<div class="v151-row"><button type="button" class="btn sm" data-v155of="loadchain">Load options chain</button></div></div>`;
    const spot = ch.spot || px(ch.sym), T0 = Math.max(1 / 365, ((ch.exp || 0) - Date.now() / 1000) / 31557600), g = P5.gex(ch, spot, T0), cc = V154.charmCurve(ch, spot);
    // call gamma above the axis, put gamma below (net per strike can cancel to zero on a balanced chain)
    const side = (legs) => new Map(legs.filter((x) => Math.abs(x.strike / spot - 1) < 0.06).map((x) => [x.strike, P5.bs(spot, x.strike, T0, 0.04, x.iv || 0.5, 'call').gamma * x.oi * 100 * spot * spot * 0.01]));
    const C = side(ch.calls || []), Pt = side(ch.puts || []), ks = [...new Set([...C.keys(), ...Pt.keys()])].sort((a, b) => a - b), mx = Math.max(1, ...C.values(), ...Pt.values());
    const wall = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return kpis([['Gamma flip', g.flip ? fp(g.flip) : 'none (balanced)'], ['Call wall', fp((wall(C) || [])[0])], ['Put wall', fp((wall(Pt) || [])[0])], ['Net GEX', (g.total >= 0 ? '+' : '−') + '$' + NT.fmtCompact(Math.abs(g.total)), g.total >= 0 ? 'up' : 'dn'], ['Charm window', cc ? cc.window : '–'], ['Pin strike', cc ? fp(cc.pinStrike) : '–']])
      + `<svg class="v155-gex" viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label="Call gamma above the axis, put gamma below, per strike">${ks.map((k, i) => { const w = 300 / Math.max(1, ks.length), hc = ((C.get(k) || 0) / mx) * 56, hp = ((Pt.get(k) || 0) / mx) * 56, x = (i * w).toFixed(1), ww = Math.max(1, w - 1).toFixed(1); return `<rect x="${x}" y="${(60 - hc).toFixed(1)}" width="${ww}" height="${hc.toFixed(1)}" class="pos" data-v156k="${esc(k)}"><title>${esc(fp(k) + ' call γ $' + NT.fmtCompact(C.get(k) || 0))}</title></rect><rect x="${x}" y="60" width="${ww}" height="${hp.toFixed(1)}" class="neg" data-v156k="${esc(k)}"><title>${esc(fp(k) + ' put γ $' + NT.fmtCompact(Pt.get(k) || 0))}</title></rect>`; }).join('')}<line x1="0" y1="60" x2="300" y2="60"/></svg>`
      + `<div class="note">${esc(ch.sym)}${ch.sim ? ' · modelled chain (labelled simulation)' : ''} · ${g.total >= 0 ? 'dealers long gamma: moves tend to mean-revert' : 'dealers short gamma: moves tend to extend'}.</div>`;
  };
  const OF_TABS = [['cvd', 'v155.of.cvd'], ['vwap', 'v155.of.vwap'], ['gamma', 'v155.of.gamma']];
  const ofWrap = () => {
    if (typeof P5UI === 'undefined' || !P5UI.R || !P5UI.R.dom || P5UI.R.dom._v155) return; const orig = P5UI.R.dom;
    const W = function () {
      const html = orig.apply(this, arguments), tpl = document.createElement('template'); tpl.innerHTML = html; const ps = tpl.content.querySelectorAll('.p5-p'); if (ps.length < 3) return html;
      const [lad, cvd, foot] = ps, cur = OF_TABS.some(([k]) => k === cfg().ofTab) ? cfg().ofTab : 'cvd';
      return `<div class="p5-grid2 v155-of"><div class="v155-ofl">${tapeBar()}${lad.outerHTML}</div><div class="panel v155-oft"><div class="seg v155-oftabs" role="tablist">${OF_TABS.map(([k, key]) => `<button type="button" role="tab" data-v155of="${k}" aria-selected="${cur === k}" class="${cur === k ? 'on' : ''}">${t(key)}</button>`).join('')}</div>`
        + `<div data-ofp="cvd"${cur === 'cvd' ? '' : ' hidden'}>${cvd.outerHTML}${foot.outerHTML}</div><div data-ofp="vwap" class="pb"${cur === 'vwap' ? '' : ' hidden'}>${cur === 'vwap' ? vwapHtml() : ''}</div><div data-ofp="gamma" class="pb"${cur === 'gamma' ? '' : ' hidden'}>${cur === 'gamma' ? gammaHtml() : ''}</div></div></div>`;
    };
    W._v155 = true; P5UI.R.dom = W;
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-v155of]'); if (!b) return; const v = b.dataset.v155of;
      if (v === 'loadchain') { if (P5UI.loadChain) P5UI.loadChain().then(() => TABS.desk && TABS.desk.show()); return; }
      cfg().ofTab = v; saveState(); if (TABS.desk) TABS.desk.show(); });
  };

  /* ══ 3. Perp Leaderboard: 4 columns + Style filter + Trader Detail & Mirror drawer ══ */
  const STYLES = ['all', 'Scalper', 'Swing', 'Mean-Reversion', 'News Sniper'];
  const lbPost = () => {
    const host = $('#lbPerp'); if (!host || typeof LeaderUI === 'undefined') return; const c = cfg();
    // the Style filter goes last in the strip, so nothing before it shifts on re-render
    const ph = host.querySelector('.panel > .ph'); if (ph && !host.querySelector('#v155LbStyle')) ph.insertAdjacentHTML('beforeend', `<label class="v155-lbsty">${t('v155.lb.style')} <select class="in xs" id="v155LbStyle" aria-label="${esc(T('v155.lb.style'))}">${STYLES.map((v) => `<option value="${esc(v)}"${(c.lbStyle || 'all') === v ? ' selected' : ''}>${esc(v === 'all' ? 'All' : v)}</option>`).join('')}</select></label>`);
    const tb = host.querySelector('table.lb-t'); if (!tb || tb.dataset.v155) return; tb.dataset.v155 = '1'; tb.classList.add('v155-lb4');
    const th = tb.querySelector('tr').children; if (th.length >= 9) { th[1].innerHTML = t('v155.lb.rank'); th[3].innerHTML = `${t('v155.lb.roi')} <span class="mut">· ${esc(th[3].textContent.trim())}</span>`; th[8].innerHTML = t('v155.lb.open'); }
    for (const row of tb.querySelectorAll('tr.lb-row')) {
      const td = row.children, b = row.querySelector('[data-lb="expand"]'); if (td.length < 9 || !b) continue; const d = LeaderUI.det.get(b.dataset.a);
      td[1].insertAdjacentHTML('afterbegin', `<span class="v155-rk num">#${esc(td[0].textContent.trim())}</span> `);
      td[3].insertAdjacentHTML('afterbegin', `<b class="num ${esc(td[4].className)}">${esc(td[4].textContent)}</b> <span class="mut">/</span> `);
      row.dataset.style = td[6].textContent.trim(); td[8].insertAdjacentHTML('afterbegin', `<span class="v155-open num">${d ? esc(d.positions.length) + ' open' : '…'}</span> `);
      if ((c.lbStyle || 'all') !== 'all' && row.dataset.style !== c.lbStyle) { row.hidden = true; const nx = row.nextElementSibling; if (nx && nx.classList.contains('lb-x')) nx.hidden = true; }
    }
    for (const x of tb.querySelectorAll('tr.lb-x')) {
      const row = x.previousElementSibling, b = row && row.querySelector('[data-lb="expand"]'), cell = x.firstElementChild; if (!b || !cell) continue;
      const addr = b.dataset.a, d = LeaderUI.det.get(addr), td = row.children;
      for (const s of cell.querySelectorAll('[data-lb="setup"]')) s.innerHTML = `📐 ${t('v155.lb.plot')} · ${esc(s.dataset.c || '')}`;
      cell.insertAdjacentHTML('afterbegin', `<div class="v155-dh"><b>👤 ${t('v155.lb.detail')} · <span class="mono">${esc(td[1].textContent.replace(/^#\d+\s*/, '').trim())}</span></b><button type="button" class="x" data-lb="expand" data-a="${esc(addr)}" aria-label="Close">×</button></div>`
        + kpis([['Alpha', td[2].textContent.trim()], ['ROI / PnL', td[3].textContent.trim()], ['Account', td[5].textContent.trim()], [T('v155.lb.style'), td[6].textContent.trim()]])
        + `<div class="v155-sig">${td[7].innerHTML || '<span class="mut">no live signals</span>'}</div>`
        + `<div class="note">🧲 ${t('v155.lb.liq')}: ${d && d.magnets.length ? esc(d.magnets.map((m) => m.coin + ' ' + m.dist + '% from liquidation').join(' · ')) : 'none within 2.5%'} · 🔔 ${t('v155.lb.exit')}: ${LeaderUI.cfg().tracked.some((w) => w.addr === addr) ? 'on (tracked)' : 'track the wallet to get Full Exit / Size Trimmed / SL Tightened alerts'}</div>`);
    }
    i18n();
  };
  const lbWire = () => {
    const host = $('#lbPerp'); if (!host || host._v155) return; host._v155 = true;
    new MutationObserver(lbPost).observe(host, { childList: true }); lbPost();
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-lb="expand"]'); if (b && LeaderUI.open && !LeaderUI.open.has(b.dataset.a)) LeaderUI.open.clear(); }, true); // one drawer at a time
    host.addEventListener('change', (e) => { if (e.target.id === 'v155LbStyle') { cfg().lbStyle = e.target.value; saveState(); LeaderUI.renderPerp(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const x = host.querySelector('tr.lb-x .v155-dh [data-lb="expand"]'); if (x) x.click(); } });
  };

  /* ══ 4. Grok tab: 3-tab intelligence rail ══ */
  const GROK_Q = ['Backtest the best momentum strategy on BTC 1h', 'What regime is ETH in on 4h?', 'Validate q4_cr_donchadx on BTC 4h', 'Autopsy my journal', 'Switch strategy for the regime'];
  const COP_Q = ['desk BTC 1h', 'what are the whales doing?', 'show my leaks', 'how is my portfolio?', 'news sentiment'];
  const coolPill = () => {
    const u = up(), on = !!(u && u.cfg().throttle), G = (u && u.guard) || { factor: 1, why: '' };
    const [ic, txt, c] = !on ? ['○', 'Off — bots trade full size whatever the drawdown', ''] : G.factor === 0 ? ['⛔', 'Entries paused — ' + G.why, 'dn'] : G.factor < 1 ? ['⚠', 'Half size — ' + G.why, 'amb'] : ['✅', 'Normal size — no drawdown or volatility stress', 'up'];
    return `<div class="v155-pill ${c}"><b>${t('v155.ir.cool')}</b> <span>${esc(ic + ' ' + txt)}</span> <button type="button" class="btn xs" data-v155ir-act="cool">${on ? 'Turn off' : 'Turn on'}</button></div>`;
  };
  const rulesCards = () => {
    const cards = [];
    for (const b of (typeof BgBotsUI !== 'undefined' && BgBotsUI.list) || []) cards.push(['☁', b.name, (b.status || '') + (b.active ? ' · running 24/7' : ' · paused')]);
    for (const b of (ST.bots || []).slice(0, 6)) cards.push(['🤖', b.name || b.strat, `${baseOf(b.sym || '')} ${b.tf || ''} · ${b.run ? 'running' : 'paused'}`]);
    const sh = typeof V153UI !== 'undefined' && V153UI.cfg ? (V153UI.cfg().shadow || []) : []; for (const p of sh.slice(0, 3)) cards.push(['👻', 'Shadow · ' + (p.id || p.strat || ''), 'dry-run on live ticks']);
    const ic = (typeof Grok !== 'undefined' && Grok.intel && Grok.intel.cfg) || {}; if (ic.autoPause) cards.push(['🛡', 'Auto-pause on CRITICAL', 'World Monitor headline rule']); if (ic.tighten) cards.push(['🛡', 'Tighten stops to 1%', 'on CRITICAL headlines']);
    return cards.length ? cards.slice(0, 8).map(([i, n, s]) => `<div class="v155-card"><span aria-hidden="true">${esc(i)}</span><div><b>${esc(n)}</b><div class="mut">${esc(s)}</div></div></div>`).join('') : '<div class="note">No active rules yet. Start a bot, promote a Quant Lab strategy or switch on a Macro Shield rule.</div>';
  };
  const macroCard = () => {
    const I = typeof Grok !== 'undefined' ? Grok.intel : null, sh = I && typeof P3 !== 'undefined' ? P3.shield(I.items) : null;
    const lv = sh ? sh.level : null, words = { CALM: 'Calm — no market-moving headline risk', ELEVATED: 'Elevated — trade smaller, widen nothing', CRITICAL: 'Critical — new entries are risky; bots can auto-pause' };
    return `<div class="v155-pill ${lv === 'CALM' ? 'up' : lv === 'CRITICAL' ? 'dn' : lv ? 'amb' : ''}"><b>Regime</b> <span>${esc(lv ? words[lv] || lv : 'Loading World Monitor…')}</span> <button type="button" class="btn xs" data-v155ir-act="world">Open World</button></div>`;
  };
  const IR = [['grok', 'v155.ir.grok'], ['copilot', 'v155.ir.copilot'], ['macro', 'v155.ir.macro']];
  const grokRail = () => {
    const host = $('#gkHost'), grid = host && host.querySelector(':scope > .gk-grid'); if (!grid || host.querySelector('.v155-ir')) return;
    const cur = IR.some(([k]) => k === cfg().irTab) ? cfg().irTab : 'grok', wrap = el('div', 'v155-gkwrap'), r = el('aside', 'panel v155-ir');
    r.setAttribute('aria-label', 'Intelligence rail');
    r.innerHTML = `<div class="seg v155-irt" role="tablist">${IR.map(([k, key]) => `<button type="button" role="tab" data-v155ir="${k}" aria-selected="${cur === k}" class="${cur === k ? 'on' : ''}">${t(key)}</button>`).join('')}</div>`
      + `<section data-irp="grok"${cur === 'grok' ? '' : ' hidden'}>${coolPill()}<div class="v155-chips">${GROK_Q.map((q) => `<button type="button" class="chip" data-v155gq="${esc(q)}">${esc(q)}</button>`).join('')}</div><h5>${t('v155.ir.rules')}</h5>${rulesCards()}</section>`
      + `<section data-irp="copilot"${cur === 'copilot' ? '' : ' hidden'}><div class="note">The 3-agent desk (analyst · risk · execution) answers in the AI Copilot tab.</div><div class="v155-chips">${COP_Q.map((q) => `<button type="button" class="chip" data-v155cq="${esc(q)}">${esc(q)}</button>`).join('')}</div></section>`
      + `<section data-irp="macro"${cur === 'macro' ? '' : ' hidden'}>${macroCard()}</section>`;
    grid.before(wrap); wrap.append(grid, r);
    for (const [id, k] of [['gkBots', 'grok'], ['gkBridge', 'copilot'], ['gkShield', 'macro']]) { const p = grid.querySelector('#' + id); if (p) r.querySelector(`[data-irp="${k}"]`).appendChild(p); }
    i18n();
  };
  const grokWire = () => {
    const host = $('#gkHost'); if (!host || host._v155) return; host._v155 = true; new MutationObserver(grokRail).observe(host, { childList: true }); grokRail();
    host.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-v155ir]'); if (tb) { const k = tb.dataset.v155ir; cfg().irTab = k; saveState(); for (const b of host.querySelectorAll('[data-v155ir]')) { const on = b.dataset.v155ir === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); } for (const s of host.querySelectorAll('[data-irp]')) s.hidden = s.dataset.irp !== k; return; }
      const g = e.target.closest('[data-v155gq]'); if (g) { const i = $('#gkIn'), f = $('#gkForm'); if (i && f) { i.value = g.dataset.v155gq; if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true })); } return; }
      const q = e.target.closest('[data-v155cq]'); if (q) { showTab('ai'); if (typeof aiSend === 'function') aiSend(q.dataset.v155cq); return; }
      const a = e.target.closest('[data-v155ir-act]'); if (!a) return;
      if (a.dataset.v155irAct === 'world') showTab('world');
      else if (a.dataset.v155irAct === 'cool') { const u = up(); if (u) { u.cfg().throttle = !u.cfg().throttle; saveState(); } const p = a.closest('.v155-pill'); if (p) p.outerHTML = coolPill(); i18n(); }
    });
  };

  /* ══ 5. Settings: 4 tabs ══ */
  const SG = [['gen', 'v155.st.gen'], ['chart', 'v155.st.chart'], ['exec', 'v155.st.exec'], ['sec', 'v155.st.sec']];
  U.classify = (title) => (/language|idioma|langue|sprache/i.test(title) ? 'gen' : /privacy|security|vault|api key|\bkeys?\b|wallet tracker|\bsec\b|edgar|insider|your data|backup|integrity|erase/i.test(title) ? 'sec'
    : /paper trading|\bfees?\b|webhook|bridge|alert|telegram|discord|\bbots?\b|execution|order|copilot|llm|model|broker/i.test(title) ? 'exec'
      : /chart|hotkey|shortcut|appearance|visual|theme|indicator|candle|workstation|hud|layout/i.test(title) ? 'chart' : 'gen');
  const showSt = (k) => {
    const host = $('#setBody'); if (!host) return; cfg().setTab = k;
    for (const b of host.querySelectorAll(':scope > .v155-stabs [data-v155st]')) { const on = b.dataset.v155st === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    for (const g of host.querySelectorAll(':scope > .v155-sg')) g.hidden = g.dataset.sg !== k;
  };
  const card = (title, nodes) => { const p = el('div', 'panel v155-sp'), h = el('h3'), b = el('div', 'pb'); h.textContent = title; b.append(...nodes); p.append(h, b); return p; };
  const settingsOrg = () => {
    const host = $('#setBody'); if (!host) return; let bar = host.querySelector(':scope > .v155-stabs');
    if (!bar) {
      bar = el('div', 'seg v155-stabs', SG.map(([k, key]) => `<button type="button" role="tab" data-v155st="${k}">${t(key)}</button>`).join('')); bar.setAttribute('role', 'tablist'); host.prepend(bar);
      for (const [k] of SG) { const g = el('div', 'v155-sg'); g.dataset.sg = k; host.appendChild(g); }
      const keys = (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS) ? V14.SHORTCUTS : []).slice(0, 40);
      if (keys.length) host.querySelector('.v155-sg[data-sg="chart"]').appendChild(el('div', 'panel v155-sp', `<h3>⌨ Keyboard shortcuts</h3><div class="pb"><table class="v152-t">${keys.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table></div>`));
    }
    const group = (k) => host.querySelector(`:scope > .v155-sg[data-sg="${k}"]`), moved = [];
    for (const c of [...host.children]) {
      if (c === bar || c.classList.contains('v155-sg')) continue;
      const panels = c.classList.contains('panel') ? [c] : [...c.querySelectorAll(':scope > .panel, :scope > details.panel')];
      for (const p of panels) {
        const head = p.querySelector(':scope > h3, :scope > .ph, :scope > summary'), title = head ? head.textContent.trim() : '', pb = p.querySelector(':scope > .pb');
        if (!pb || !pb.querySelector(':scope > .sec') || p.tagName === 'DETAILS') { p.classList.add('v155-sp'); group(U.classify(title + ' ' + (p.id || ''))).appendChild(p); moved.push(p); continue; }
        const chunks = [{ title, nodes: [] }]; for (const n of [...pb.childNodes]) { if (n.nodeType === 1 && n.classList.contains('sec')) chunks.push({ title: n.textContent.trim(), nodes: [] }); else chunks[chunks.length - 1].nodes.push(n); }
        for (const ch of chunks) if (ch.nodes.some((n) => n.nodeType === 1)) group(U.classify(ch.title)).appendChild(card(ch.title, ch.nodes));
        p.remove(); moved.push(p);
      }
      if (c.isConnected && c !== bar && !c.querySelector('.panel, input, select, button, textarea')) c.remove(); else if (c.isConnected && !panels.length) group('gen').appendChild(c);
    }
    if (moved.length || !host.querySelector(':scope > .v155-sg:not([hidden])')) showSt(SG.some(([k]) => k === cfg().setTab) ? cfg().setTab : 'gen');
    i18n();
  };
  U.reveal = (sel) => { const e = document.querySelector(sel), g = e && e.closest('#setBody > .v155-sg'); if (g) showSt(g.dataset.sg); return !!g; };
  const settingsWire = () => {
    const host = $('#setBody'); if (!host || host._v155) return; host._v155 = true; new MutationObserver(settingsOrg).observe(host, { childList: true }); settingsOrg();
    host.addEventListener('click', (e) => { const b = e.target.closest('.v155-stabs [data-v155st]'); if (b) { showSt(b.dataset.v155st); saveState(); } });
  };

  U.start = () => { ofWrap(); dexWrap(); lbWire(); grokWire(); settingsWire(); setTimeout(() => { lbWire(); grokWire(); }, 3000); };
  U.inspect = inspect; U.closeDr = closeDr; U.settingsTab = showSt; U.openDr = (title, body) => { U.tok = null; return openDr(title, body); };
  return U;
})();
if (typeof module === 'object' && module.exports) module.exports = V155S;
else if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b155s = boot; boot = async function () { await _b155s.apply(this, arguments); try { V155S.start(); } catch (e) { console.warn('v155 screens init', e); } }; }
