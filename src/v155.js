/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v15.5 UI: zero-clutter workspace. Compact header (Ctrl+K search pill, quiet status dots, ⋯ More menu, Simple | Pro,
   Reset Clean View), grouped nav, slim chart toolbar (4 timeframe pills, Overlays ▾, AI Lens ▾, drawing rail), Zen Chart
   Focus (F / « »), Smart Order Rules accordion + inline risk slider, Favorite-4 quick bar, smart context highlights,
   Bot Net Profit hero card with "What Changed?" on the Backtester and Quant Lab, 4-step Quant Lab wizard, How It Works pill.
   Strict CSP: listeners in JS, every dynamic string through esc(). Maths in V155 (v155core.js). */
const V155UI = (() => {
  const U = { prev: new Map() };
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const up = () => (typeof V154UpUI !== 'undefined' ? V154UpUI : null), lb = () => (typeof LeaderUI !== 'undefined' ? LeaderUI : null), q153 = () => (typeof V153UI !== 'undefined' ? V153UI : null);
  const inv = () => { if (typeof chart !== 'undefined' && chart) chart.invalidate(); };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const spot = (sel) => { if (typeof LearnUI !== 'undefined' && LearnUI.spot) return LearnUI.spot(sel); const x = document.querySelector(sel); if (x) { x.classList.add('lx-spot'); setTimeout(() => x.classList.remove('lx-spot'), 4200); } return x; };

  /* ══ tools behind Overlays ▾ / AI Lens ▾ (also the Favorite-4 and Ctrl+K targets) ══ */
  const upOn = (k) => () => { const u = up(); return !!(u && u.cfg()[k]); };
  const upSet = (k) => (v) => { const u = up(); if (!u) return; u.cfg()[k] = !!v; saveState(); inv(); };
  const TOOLS = [
    { id: 'ghost', ic: '◧', l: 'MTF Ghost Candles', d: 'Higher-timeframe candles drawn faintly behind price.', on: upOn('ghost'), set: upSet('ghost') },
    { id: 'sess', ic: '◷', l: 'Session Kill-Zones / ORB', d: 'Asia, London and New York boxes plus opening-range lines.', on: upOn('sess'), set: upSet('sess') },
    { id: 'heat', ic: '▤', l: 'Consensus Heatmap', d: 'Where the top-25 perp traders sit, stacked on the price axis.', on: () => !!(lb() && lb().cfg().heat), set: (v) => { const L = lb(); if (!L) return; L.cfg().heat = !!v; saveState(); inv(); } },
    { id: 'react', ic: '⌖', l: 'Macro Pins', d: 'FOMC, CPI and NFP reaction markers on the candles they hit.', on: upOn('react'), set: upSet('react') },
    { id: 'absorb', ic: '◉', l: 'Delta Absorption', d: 'Candles where heavy volume failed to move price.', on: upOn('absorb'), set: upSet('absorb') },
    { id: 'gamma', ic: 'Γ', l: '0DTE Gamma Flip & Charm', d: 'Dealer charm drift and pin strike for same-day options.', on: upOn('charm'), set: upSet('charm') },
    { id: 'gap', ic: '⤓', l: 'Gap-Fill Odds', d: 'How often an opening gap like today’s has filled before.', act: () => { const u = up(); if (u) { u.open('scan'); if (u.A.gap) u.A.gap(); } } },
    { id: 'safety', ic: '⛨', l: 'Safety Score', d: 'Honeypot, tax, LP-lock and liquidity checks for DEX tokens.', act: () => { const u = up(); if (u) u.open('dex'); } },
    { id: 'xray', ic: '⌬', l: 'Holder Cluster X-Ray', d: 'Linked-wallet clusters hiding among the top holders.', act: () => { const u = up(); if (u) { u.open('dex'); if (u.A.xray) u.A.xray(); } } },
  ];
  const LENS = [
    { id: 'explain', ic: '✦', key: 'v155.explain', d: 'Alt+click any candle: a forensic “why” handed to the 3-Agent Copilot.', on: upOn('forensic'), set: upSet('forensic') },
    { id: 'hunter', ic: '⌕', key: 'v155.hunter', d: 'Describe a setup in plain English and every match lights up on the chart.', act: () => { const u = up(); if (u) u.open('ai'); } },
  ];
  const ALL = TOOLS.concat(LENS), IDS = ALL.map((t) => t.id), byId = (id) => ALL.find((t) => t.id === id);
  const label = (t) => (t.key ? T(t.key) : t.l);

  const cfg = () => { const c = ST.v155 && typeof ST.v155 === 'object' ? ST.v155 : (ST.v155 = {}); c.ws = V155.mode(c.ws); c.hideL = !!c.hideL; c.hideR = !!c.hideR; c.favs = V155.toggleFav(c.favs, null, IDS); return c; };
  const run = (t, v) => { if (!t) return; if (t.act) t.act(); else t.set(v == null ? !t.on() : v); paintFavs(); paintOvBtn(); };

  /* ══ popovers (one open at a time, closed by outside click / Esc) ══ */
  let pop = null;
  const closePop = () => { if (pop) { pop.el.remove(); if (pop.btn) pop.btn.setAttribute('aria-expanded', 'false'); pop = null; } };
  const openPop = (btn, id, html, onClick) => {
    if (pop && pop.id === id) { closePop(); return null; } closePop();
    const p = el('div', 'v155-pop', html); p.id = id; p.setAttribute('role', 'menu'); document.body.appendChild(p);
    const r = btn.getBoundingClientRect(), W = p.offsetWidth, rtl = document.documentElement.dir === 'rtl';
    p.style.top = Math.round(r.bottom + 6) + 'px'; p.style.left = Math.round(Math.max(8, Math.min(innerWidth - W - 8, rtl ? r.right - W : r.left))) + 'px';
    p.addEventListener('click', onClick); p.addEventListener('change', onClick); btn.setAttribute('aria-expanded', 'true'); pop = { el: p, id, btn }; return p;
  };
  document.addEventListener('pointerdown', (e) => { if (pop && !pop.el.contains(e.target) && !pop.btn.contains(e.target)) closePop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) closePop(); });

  const hot = () => V155.context(ST.mode);
  const toolRow = (t) => { const fav = cfg().favs.includes(t.id), h = hot().includes(t.id);
    return `<div class="v155-row${h ? ' hot' : ''}" data-row="${t.id}"><span class="v155-ic" aria-hidden="true">${esc(t.ic)}</span><div class="v155-tx"><b>${esc(label(t))}</b>${h ? ` <span class="v155-sug">${esc(T('v155.suggest'))}</span>` : ''}<small>${esc(t.d)}</small></div>`
      + (t.act ? `<button type="button" class="btn xs" data-act="${t.id}">Open</button>` : `<label class="v155-sw" title="${esc(label(t))}"><input type="checkbox" data-tool="${t.id}" ${t.on() ? 'checked' : ''} aria-label="${esc(label(t))}"><i></i></label>`)
      + `<button type="button" class="v155-star${fav ? ' on' : ''}" data-star="${t.id}" aria-pressed="${fav}" title="${esc(T('v155.favs'))}">${fav ? '★' : '☆'}</button></div>`; };
  const popClick = (list) => (e) => {
    const s = e.target.closest('[data-star]'); if (s && e.type === 'click') { const c = cfg(); c.favs = V155.toggleFav(c.favs, s.dataset.star, IDS); saveState(); paintFavs(); refreshPop(list); return; }
    const a = e.target.closest('[data-act]'); if (a && e.type === 'click') { closePop(); run(byId(a.dataset.act)); return; }
    const t = e.target.closest('[data-tool]'); if (t && e.type === 'change') run(byId(t.dataset.tool), t.checked);
  };
  const popHtml = (list, title) => `<div class="v155-ph">${esc(title)}</div>${list.map(toolRow).join('')}`;
  const refreshPop = (list) => { if (!pop) return; const scroll = pop.el.scrollTop; pop.el.innerHTML = popHtml(list, pop.id === 'v155OvPop' ? T('v155.overlays') : T('v155.ailens')); pop.el.scrollTop = scroll; };
  const openOverlays = () => openPop($('#v155Ov'), 'v155OvPop', popHtml(TOOLS, T('v155.overlays')), popClick(TOOLS));
  const openLens = () => openPop($('#v155Lens'), 'v155LensPop', popHtml(LENS, T('v155.ailens')), popClick(LENS));
  const paintOvBtn = () => { const b = $('#v155Ov'); if (!b) return; const n = TOOLS.filter((t) => t.on && t.on()).length; b.querySelector('.v155-n').textContent = n ? String(n) : ''; b.classList.toggle('has', n > 0); };

  /* ══ Favorite 4 quick bar beside the order ticket ══ */
  const paintFavs = () => {
    const bar = $('#v155Favs'); if (!bar) return; const f = cfg().favs; bar.hidden = !f.length;
    bar.innerHTML = f.map((id) => { const t = byId(id), on = t.on && t.on(); return `<button type="button" class="v155-fav${on ? ' on' : ''}" data-fav="${id}" title="${esc(t.d)}"><span aria-hidden="true">${esc(t.ic)}</span> ${esc(label(t))}</button>`; }).join('');
  };

  /* ══ header: Ctrl+K pill, quiet status dots, ⋯ More, Simple | Pro, Reset Clean View ══ */
  const mountHeader = () => {
    const top = $('#top'); if (!top || $('#v155Ws')) return;
    const pal = $('#btnPalette'), search = top.querySelector('.search');
    if (pal) { pal.classList.add('v155-pal'); pal.innerHTML = `<span aria-hidden="true">⌕</span><span class="v155-palt" data-i18n="v155.search">${esc(T('v155.search'))}</span><kbd>Ctrl K</kbd>`; pal.setAttribute('aria-label', T('v155.search')); if (search) search.after(pal); }
    const st = el('div', 'v155-status'); st.id = 'v155Status'; st.setAttribute('role', 'group'); st.title = 'Status (click to expand)';
    for (const id of ['srcPill', 'kzPill', 'telePill']) { const p = $('#' + id); if (p) st.appendChild(p); }
    st.addEventListener('click', () => st.classList.toggle('open'));
    const sp = top.querySelector('.spacer'); (sp || top.lastElementChild).after(st);
    const more = el('button', 'ghost v155-more', '⋯'); more.id = 'btnMore'; more.type = 'button'; more.dataset.i18nTitle = 'v155.more'; more.title = T('v155.more'); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'v155-menu'); menu.id = 'v155More'; menu.hidden = true; menu.setAttribute('role', 'menu');
    for (const id of ['btnPro', 'btnTheme', 'btnWs', 'btnSide', 'btnDemo', 'btnBrief', 'btnTools']) { const b = $('#' + id); if (!b) continue; b.setAttribute('role', 'menuitem'); const lab = (b.title || b.getAttribute('aria-label') || id).split(/[:(·]/)[0].trim(); b.appendChild(el('span', 'v155-ml', esc(lab))); menu.appendChild(b); }
    more.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) { const r = more.getBoundingClientRect(); menu.style.top = Math.round(r.bottom + 6) + 'px'; menu.style.right = Math.round(Math.max(8, innerWidth - r.right)) + 'px'; } });
    menu.addEventListener('click', () => setTimeout(() => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); }, 0));
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== more && !e.target.closest('.th-pop, [role="menu"]:not(#v155More)')) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); } }, true);
    document.body.appendChild(menu);
    const ws = el('div', 'seg v155-ws', `<button type="button" data-ws="simple" data-i18n="v155.simple">${esc(T('v155.simple'))}</button><button type="button" data-ws="pro" data-i18n="v155.pro">${esc(T('v155.pro'))}</button>`); ws.id = 'v155Ws'; ws.setAttribute('role', 'group'); ws.setAttribute('aria-label', 'Workspace mode');
    ws.addEventListener('click', (e) => { const b = e.target.closest('[data-ws]'); if (b) setWs(b.dataset.ws); });
    const rst = el('button', 'ghost v155-reset', '↺'); rst.id = 'v155Reset'; rst.type = 'button'; rst.dataset.i18nTitle = 'v155.reset'; rst.title = T('v155.reset'); rst.setAttribute('aria-label', T('v155.reset')); rst.addEventListener('click', () => U.reset());
    const eq = top.querySelector('.eqbox'); (eq || st).after(ws); ws.after(rst);
    const lang = $('#btnLang'); (lang || rst).after(more);
  };

  /* ══ nav: four labelled groups (Pro) or the five essentials (Simple), plus one ? How It Works pill ══ */
  const mountNav = () => {
    const nav = $('#nav'); if (!nav || $('#v155How')) return; nav.classList.add('v155-nav');
    // group captions are ::before labels on each group's first tab: zero layout width, so every tab stays visible at 1280px+
    V155.GROUPS.forEach(([g, key, tabs], gi) => { let first = true;
      tabs.forEach((t, ti) => { const b = nav.querySelector(`button[data-tab="${t}"]`); if (!b) return; b.style.order = String(gi * 100 + 1 + ti); b.dataset.g = g; if (first) { b.dataset.gkey = key; first = false; } }); });
    paintGroups();
    const learn = $('#btnLearn'); if (learn) learn.style.order = '320';
    for (const x of nav.children) if (!x.style.order) x.style.order = '400';
    const how = el('button', 'v155-how', `<span aria-hidden="true">?</span> <span data-i18n="v155.how">${esc(T('v155.how'))}</span>`); how.id = 'v155How'; how.type = 'button'; how.style.order = '330';
    how.addEventListener('click', () => { const tab = (nav.querySelector('button[data-tab].on') || {}).dataset; const m = typeof V154 !== 'undefined' && V154.MODULES.find((x) => x.go && x.go.tab === (tab && tab.tab)); if (typeof LearnUI !== 'undefined') LearnUI.open(m ? m.id : undefined); });
    nav.appendChild(how);
  };
  const paintGroups = () => { for (const b of document.querySelectorAll('#nav button[data-gkey]')) b.dataset.glabel = T(b.dataset.gkey); };
  const setWs = (m) => {
    const c = cfg(); c.ws = V155.mode(m); saveState(); document.body.classList.toggle('v155-simple', c.ws === 'simple');
    for (const b of document.querySelectorAll('#v155Ws [data-ws]')) { const on = b.dataset.ws === c.ws; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const cur = $('#nav button[data-tab].on'); if (c.ws === 'simple' && cur && !V155.SIMPLE_TABS.includes(cur.dataset.tab) && typeof showTab === 'function') showTab('markets');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  };

  /* ══ chart toolbar: 4 timeframe pills (+ ⋯), Overlays ▾, AI Lens ▾, drawing rail, quiet status dots, Zen chevrons ══ */
  const mountChart = () => {
    const bar = $('#tab-markets .toolbar'), host = $('#chartHost'); if (!bar || !host || $('#v155Ov')) return;
    const tf = $('#tfBtns'); if (tf) { tf.classList.add('v155-tf'); const more = el('button', 'btn sm v155-tfmore', '⋯'); more.type = 'button'; more.title = 'More timeframes'; more.setAttribute('aria-expanded', 'false'); more.addEventListener('click', () => { const o = tf.classList.toggle('v155-open'); more.setAttribute('aria-expanded', String(o)); }); tf.after(more); tf.addEventListener('click', (e) => { if (e.target.closest('button') && tf.classList.contains('v155-open')) { tf.classList.remove('v155-open'); more.setAttribute('aria-expanded', 'false'); } }); }
    const ov = el('button', 'btn sm v155-dd', `<span data-i18n="v155.overlays">${esc(T('v155.overlays'))}</span> <b class="v155-n"></b> ▾`); ov.id = 'v155Ov'; ov.type = 'button'; ov.setAttribute('aria-haspopup', 'menu'); ov.setAttribute('aria-expanded', 'false'); ov.addEventListener('click', openOverlays);
    const lens = el('button', 'btn sm v155-dd', `<span data-i18n="v155.ailens">${esc(T('v155.ailens'))}</span> ▾`); lens.id = 'v155Lens'; lens.type = 'button'; lens.setAttribute('aria-haspopup', 'menu'); lens.setAttribute('aria-expanded', 'false'); lens.addEventListener('click', openLens);
    const rp = $('#replayBtn'); if (rp) { rp.before(ov); rp.before(lens); } else { bar.append(ov, lens); }
    const row = el('div', 'v155-chartrow'), rail = el('div', 'v155-rail'); rail.setAttribute('aria-label', 'Chart type and drawing tools');
    for (const id of ['ctBtns', 'drawBtns']) { const x = $('#' + id); if (x) rail.appendChild(x); }
    host.before(row); row.append(rail, host);
    const panel = host.closest('.panel'); if (panel) panel.classList.add('v155-chartpanel');
    const dots = el('div', 'v155-dots'); dots.id = 'v155Dots'; dots.setAttribute('role', 'status'); dots.title = 'Click to expand';
    dots.innerHTML = [['live', 'v155.live'], ['be', 'v155.be'], ['shadow', 'v155.shadow']].map(([k, key]) => `<span class="v155-dot" data-dot="${k}"><i></i><span data-i18n="${key}">${esc(T(key))}</span></span>`).join('');
    dots.addEventListener('click', (e) => { if (!e.target.closest('#mtfStrip')) dots.classList.toggle('open'); }); row.appendChild(dots);
    const mtf = $('#mtfStrip'); if (mtf) dots.prepend(mtf);
    const L = el('button', 'v155-chev v155-chevl', '«'), R = el('button', 'v155-chev v155-chevr', '»');
    L.id = 'v155ChevL'; R.id = 'v155ChevR'; for (const b of [L, R]) { b.type = 'button'; b.dataset.i18nTitle = 'v155.zen'; b.title = T('v155.zen') + ' (F)'; b.setAttribute('aria-label', T('v155.zen')); }
    L.addEventListener('click', () => zen('L')); R.addEventListener('click', () => zen('R')); row.append(L, R);
    const hint = $('#chartHint'); if (hint) host.title = hint.textContent;
  };
  const paintDots = () => {
    const d = $('#v155Dots'); if (!d || document.hidden) return;
    const live = typeof Feed !== 'undefined' && Feed.state === 'live', Ld = typeof V152UI !== 'undefined' ? V152UI.ladder : null, be = !!(Ld && Ld.armed && Object.values(Ld.armed).some((r) => r && r !== 'none'));
    const sh = q153() && q153().cfg ? (q153().cfg().shadow || []).length > 0 : false;
    for (const [k, on] of [['live', live], ['be', be], ['shadow', sh]]) { const x = d.querySelector(`[data-dot="${k}"]`); if (x) x.classList.toggle('on', on); }
  };
  const zen = (side) => {
    const c = cfg(); if (side === 'L') c.hideL = !c.hideL; else if (side === 'R') c.hideR = !c.hideR; else { const v = !(c.hideL && c.hideR); c.hideL = c.hideR = v; }
    saveState(); paintZen(); setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  };
  const paintZen = () => {
    const c = cfg(); document.body.classList.toggle('v155-hideL', c.hideL); document.body.classList.toggle('v155-hideR', c.hideR);
    const L = $('#v155ChevL'), R = $('#v155ChevR'); if (L) { L.textContent = c.hideL ? '»' : '«'; L.setAttribute('aria-pressed', String(c.hideL)); } if (R) { R.textContent = c.hideR ? '«' : '»'; R.setAttribute('aria-pressed', String(c.hideR)); }
  };

  /* ══ order ticket: Smart Order Rules accordion + inline risk slider + Favorite-4 bar ══ */
  const mountTicket = () => {
    const go = $('#tkGo'); if (!go || $('#v155Rules')) return; const u = up(), c = u ? u.cfg() : { rules: {}, hookUrl: '' }, R = typeof V154 !== 'undefined' ? V154.STEP_RULES : { none: 'None' };
    const acc = el('details', 'v155-acc'); acc.id = 'v155Rules';
    acc.innerHTML = `<summary data-i18n="v155.rules">${esc(T('v155.rules'))}</summary><div class="v155-accb"><div class="note">Auto-Breakeven &amp; Trailing Step-Ladders run when a take-profit rung fills (paper, mirrored to the webhook bridge).</div>
      ${['TP1', 'TP2', 'TP3'].map((tp) => `<label class="f v155-rl">${tp} fill →<select class="in" data-v155rule="${tp}">${Object.entries(R).filter(([k]) => k !== 'tp1' || tp !== 'TP1').map(([k, l]) => `<option value="${esc(k)}" ${(c.rules || {})[tp] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
      <label class="f">Paper / Webhook Bridge<input class="in mono" id="v155Hook" type="url" inputmode="url" spellcheck="false" placeholder="http://127.0.0.1:8766/hook (optional)" value="${esc(c.hookUrl || '')}"></label></div>`;
    go.after(acc);
    acc.addEventListener('change', (e) => { const uu = up(); if (!uu) return; const k = e.target.dataset.v155rule; if (k && R[e.target.value]) { uu.cfg().rules[k] = e.target.value; saveState(); return; }
      if (e.target.id === 'v155Hook') { const v = e.target.value.trim(); if (v && !/^(https:\/\/(127\.0\.0\.1|localhost|\d{1,3}(\.\d{1,3}){3})|http:\/\/(127\.0\.0\.1|localhost))(:\d{1,5})?(\/[^\s"'<>]*)?$/.test(v)) { toast('Webhook must be your own bot on 127.0.0.1 / localhost (or an allow-listed private-LAN https host)', 'amb'); e.target.value = uu.cfg().hookUrl || ''; return; } uu.cfg().hookUrl = v.slice(0, 300); saveState(); } });
    const rk = $('#tkRisk'), row = $('#tkRiskRow'); if (rk && row && !$('#v155RiskR')) {
      const w = el('div', 'v155-slider', `<span class="v155-sv"><span data-i18n="v155.risk">${esc(T('v155.risk'))}</span>: <b class="num" id="v155RiskV"></b></span><input type="range" id="v155RiskR" min="0.1" max="5" step="0.1" aria-label="${esc(T('v155.risk'))}">`); row.after(w);
      const r = w.querySelector('input'), v = w.querySelector('#v155RiskV'), sync = () => { const x = Math.max(0.1, Math.min(5, parseFloat(rk.value) || 1)); r.value = String(x); v.textContent = x.toFixed(1) + '%'; };
      const push = V155.debounce(() => { rk.value = r.value; rk.dispatchEvent(new Event('input', { bubbles: true })); }, 16);
      r.addEventListener('input', () => { v.textContent = (+r.value).toFixed(1) + '%'; push(); }); rk.addEventListener('input', sync); sync();
      const seg = $('#tkSize'); const vis = () => { w.hidden = row.hidden; }; if (seg) seg.addEventListener('click', () => setTimeout(vis, 0)); vis();
    }
    const side = $('#tab-markets .side-col'); if (side && !$('#v155Favs')) { const f = el('div', 'v155-favs'); f.id = 'v155Favs'; f.setAttribute('aria-label', T('v155.favs')); side.prepend(f); f.addEventListener('click', (e) => { const b = e.target.closest('[data-fav]'); if (b) run(byId(b.dataset.fav)); }); paintFavs(); }
  };

  /* ══ Bot Net Profit hero card (Backtester + Quant Lab) ══ */
  const ghostSvg = (cur, ghost) => {
    const all = cur.concat(ghost || []).filter(Number.isFinite); if (all.length < 2) return ''; const lo = Math.min(...all), hi = Math.max(...all), d = hi - lo || 1, w = 300, h = 54;
    const pts = (s) => s.map((v, i) => `${((i / Math.max(1, s.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / d) * (h - 6)).toFixed(1)}`).join(' ');
    return `<svg class="v155-mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Equity now versus the previous run">${ghost ? `<polyline class="g" points="${pts(ghost)}"/>` : ''}<polyline class="c" points="${pts(cur)}"/></svg>`;
  };
  const down = (eq, n = 240) => (eq.length <= n ? eq.slice() : Array.from({ length: n }, (_, i) => eq[Math.round((i / (n - 1)) * (eq.length - 1))]));
  const heroHtml = (H, ctx, D) => {
    const st = (k, v, c = '') => `<div class="v155-hs"><span data-i18n="${k}">${esc(T(k))}</span><b class="num ${c}">${esc(v)}</b></div>`;
    return `<div class="v155-hero-top"><div><div class="v155-hk" data-i18n="v155.hero">${esc(T('v155.hero'))}</div><div class="v155-big num ${H.net >= 0 ? 'up' : 'dn'}" id="${ctx.id}Net">${esc(V155.usd(H.net, true))} <span>/ ${esc(V155.pct(H.netPct))}</span></div>
        <div class="v155-flow num"><span>${esc(V155.usd(H.start))}</span> → <b>${esc(V155.usd(H.end))}</b> <span class="mut">· ${esc(H.closed)} trades · ${esc(H.wins)}W / ${esc(H.losses)}L</span></div>
        ${D ? `<div class="v155-delta ${D.same ? '' : D.better ? 'up' : 'dn'}" data-i18n-title="v155.changed" title="${esc(T('v155.changed'))}"><b>${esc(T('v155.changed'))}</b> ${esc(V155.usd(D.delta, true))} <span data-i18n="v155.vs">${esc(T('v155.vs'))}</span></div>` : ''}</div>
      <div class="v155-ctl"><label class="f"><span data-i18n="v155.start">${esc(T('v155.start'))}</span><input class="in num" type="number" min="100" step="100" data-h="cap" value="${esc(Math.round(ctx.cap))}"></label>
        <label class="f"><span><span data-i18n="v155.size">${esc(T('v155.size'))}</span>: <b class="num" data-h="sizev">${esc(ctx.size)}%</b></span><input type="range" min="5" max="100" step="5" data-h="size" value="${esc(ctx.size)}"></label>${ghostSvg(down(ctx.res.eq), D ? D.ghost : null)}</div></div>
      <div class="v155-hgrid">${`<div class="v155-hs"><span>Win rate</span><b class="num">${esc(H.closed ? Math.round((H.wins / H.closed) * 100) + '%' : '–')}</b></div>`}${st('v155.end', V155.usd(H.end), H.net >= 0 ? 'up' : 'dn')}${st('v155.gp', V155.usd(H.grossP), 'up')}${st('v155.gl', V155.usd(H.grossL), H.grossL < 0 ? 'dn' : '')}${st('v155.fees', V155.usd(-H.costs))}${st('v155.aw', V155.usd(H.avgWin), 'up')}${st('v155.al', V155.usd(H.avgLoss), H.avgLoss < 0 ? 'dn' : '')}${st('v155.exp', V155.usd(H.expectancy, true), H.expectancy >= 0 ? 'up' : 'dn')}</div>`;
  };
  /* ctx: { id, key, host, res (run at base cap/size), cap0, size0, slip, rerun(size) → res at cap0, after(res, ghost) } */
  const hero = (ctx) => {
    const p0 = U.prev.get(ctx.key), prev = p0 && p0.res === ctx.res ? p0.before : p0; let card = document.getElementById(ctx.id); if (!card) { card = el('section', 'v155-hero'); card.id = ctx.id; card.setAttribute('aria-label', T('v155.hero')); ctx.host.prepend(card); }
    const base = { res: ctx.res, size: ctx.size0 }, runRes = ctx.res; ctx.cap = ctx.cap0; ctx.size = ctx.size0;
    const paint = (first) => {
      const r0 = ctx.size === base.size ? base.res : (base.cache && base.cache.size === ctx.size ? base.cache.res : (base.cache = { size: ctx.size, res: ctx.rerun(ctx.size) }).res);
      ctx.res = V155.scale(r0, ctx.cap / ctx.cap0); const H = V155.hero(ctx.res, ctx.cap, ctx.slip), D = prev ? V155.diff({ eq: prev.eq.map((v) => v * (ctx.cap / prev.cap)), end: prev.end * (ctx.cap / prev.cap) }, { eq: down(ctx.res.eq), end: H.end }) : null;
      card.innerHTML = heroHtml(H, ctx, D); if (ctx.after) ctx.after(ctx.res, D); if (first) U.prev.set(ctx.key, { eq: down(ctx.res.eq), end: H.end, cap: ctx.cap, res: runRes, before: prev || null }); U.last = { H, D, id: ctx.id };
      if (typeof I18N !== 'undefined') I18N.apply();
    };
    const again = V155.debounce(() => paint(false), 60);
    card.oninput = (e) => { const k = e.target.dataset.h; if (k === 'cap') { const v = parseFloat(e.target.value); if (v >= 100 && v <= 1e9) { ctx.cap = v; again(); } } else if (k === 'size') { ctx.size = +e.target.value; const s = card.querySelector('[data-h="sizev"]'); if (s) s.textContent = ctx.size + '%'; again(); } };
    paint(true); return card;
  };
  const heroBots = (res, S, sym, candles) => {
    const host = $('#btResult .pb'); if (!host || !res || !res.eq || !res.eq.length) return; const strat = NT.strategies[S.strat];
    hero({ id: 'v155HeroBt', key: ['bt', S.strat, sym, S.tf].join('|'), host, res, cap0: +S.capital || 10000, size0: Math.round(+S.posPct || 100), slip: ((ST.settings && ST.settings.slip) || 0) / 100,
      // shortcut: a size change re-simulates on the displayed candle window (the worker run may have warmed up on earlier bars); fine for sizing what-ifs
      rerun: (size) => NT.backtest(candles, strat, S.params, Object.assign(btOpts(S), { posPct: size / 100 })),
      after: (r, D) => { const cv = $('#btChart'); if (!cv || typeof drawLines !== 'function') return; const L = [{ name: 'Strategy', color: cssv('--acc', '#F5B841'), values: r.eq, w: 2, fill: true }, { name: 'Buy & hold', color: '#8b94a9', values: r.bh || res.bh, w: 1.4 }];
        if (D && D.ghost) L.push({ name: 'Previous run', color: 'rgba(148,163,200,.45)', values: V155.resample(D.ghost, r.eq.length), w: 1.2 }); drawLines(cv, L, { fmt: (v) => NT.fmtUSD(v, 0), xs: res.t, xsSpan: NT.TF[S.tf] / 86400, base: r.eq[0] }); } });
  };
  const heroQuant = () => {
    const Q = q153(), b = Q && Q.base, host = $('#q153Base'); if (!b || !host || !b.r) return;
    hero({ id: 'v155HeroQ', key: ['q', b.id, b.sym, b.tf].join('|'), host, res: b.r, cap0: 10000, size0: 100, slip: ((ST.settings && ST.settings.slip) || 0.05) / 100,
      rerun: (size) => NT.backtest(b.cs, NT.strategies[b.id], b.p, Object.assign({ cash: 10000, tfSec: b.sec, posPct: size / 100, fee: ((ST.settings && ST.settings.fee) || 0.1) / 100, slip: ((ST.settings && ST.settings.slip) || 0.05) / 100 }, typeof V153 !== 'undefined' ? V153.filtO(b.f) : {})) });
  };

  /* ══ Quant Lab: 4-step wizard + 1-click starter on the empty state ══ */
  const STEPS = [['v155.s1', ['evolve']], ['v155.s2', ['frag', 'crisis', 'synth', 'kill']], ['v155.s3', ['sizing']], ['v155.s4', ['inspect', 'promote']]];
  const wizard = () => {
    const root = $('#q153Root .pb'); if (!root || root.querySelector('.v155-steps')) return; const rows = root.querySelectorAll(':scope > .v151-row'), base = $('#q153Base');
    const nav = el('ol', 'v155-steps', STEPS.map(([k], i) => `<li><button type="button" data-step="${i + 1}"><b>${i + 1}</b> <span data-i18n="${k}">${esc(T(k))}</span></button></li>`).join('')); nav.setAttribute('aria-label', 'Quant Lab steps');
    const secs = STEPS.map(([k, ids], i) => { const s = el('section', 'v155-step'); s.dataset.step = String(i + 1); s.innerHTML = `<h4><b>${i + 1}</b> <span data-i18n="${k}">${esc(T(k))}</span></h4>`; return { s, ids }; });
    if (rows[1]) secs[0].s.appendChild(rows[1]);
    for (const { s, ids } of secs) for (const id of ids) { const d = root.querySelector(`details[data-sec="${id}"]`); if (d) s.appendChild(d); }
    if (base) secs[3].s.insertBefore(base, secs[3].s.children[1] || null);
    (rows[0] || root.firstChild).after(nav); let at = nav; for (const { s } of secs) { at.after(s); at = s; }
    nav.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (!b) return; const s = root.querySelector(`.v155-step[data-step="${b.dataset.step}"]`); for (const x of nav.querySelectorAll('button')) x.classList.toggle('on', x === b); if (s) { s.scrollIntoView({ block: 'start', behavior: 'smooth' }); s.classList.add('lx-spot'); setTimeout(() => s.classList.remove('lx-spot'), 1600); } });
    starterQ();
  };
  const starterQ = () => { const base = $('#q153Base'), Q = q153(); if (!base || (Q && Q.base) || base.querySelector('.v155-starter')) return; base.insertAdjacentHTML('beforeend', `<button type="button" class="btn v155-starter" data-q="base">▶ <span data-i18n="v155.starter">${esc(T('v155.starter'))}</span></button>`); };
  const starterBt = () => { const out = $('#btResult'); if (!out || out.children.length) return; out.innerHTML = `<div class="pb v155-empty"><button type="button" class="btn v155-starter" id="v155StarterBt">▶ <span data-i18n="v155.starter">${esc(T('v155.starter'))}</span></button><span class="note">Default strategy, your selected market · fees &amp; slippage included</span></div>`; $('#v155StarterBt').addEventListener('click', () => { const r = $('#btRun'); if (r) r.click(); }); };

  /* ══ Ctrl+K: one index over every tab, tool, Quant Lab section, leaderboard, lesson, indicator and strategy ══ */
  const tabEntries = () => [...document.querySelectorAll('#nav button[data-tab]')].map((b) => ({ id: 'tab:' + b.dataset.tab, l: 'Go to ' + b.textContent.trim(), alt: b.textContent.trim(), k: b.dataset.tab, g: 'tab', f: () => { showTab(b.dataset.tab); spot(`#nav button[data-tab="${b.dataset.tab}"]`); } }));
  const quantEntries = () => [['evolve', 'q153.evolve'], ['frag', 'q153.fragility'], ['crisis', 'q153.crisis'], ['kill', 'q153.kill'], ['sizing', 'q153.sizing'], ['synth', 'q153.synth'], ['inspect', 'q153.inspect'], ['promote', 'q153.promote']].map(([k, key]) => ({ id: 'q:' + k, l: 'Quant Lab · ' + ((typeof I18N !== 'undefined' && I18N.tr('en', key)) || k), alt: T(key), k: 'quant lab backtest stress ' + k, g: 'quant lab', f: () => openQuant(k) }));
  const openQuant = async (k) => { showTab('lab'); try { labSec = 'q153'; for (const x of document.querySelectorAll('#labNav button')) x.classList.toggle('on', x.dataset.v === 'q153'); await renderLab(); } catch (e) { /* lab optional */ } const d = document.querySelector(`#q153Root details[data-sec="${k}"]`); if (d) { d.open = true; spot(`#q153Root details[data-sec="${k}"] > summary`); } };
  const entries = (q) => {
    const E = tabEntries().concat(
      ALL.map((t) => ({ id: 'tool:' + t.id, l: label(t), alt: t.l || '', k: t.d, g: t.key ? 'ai lens' : 'overlay', f: () => { showTab('markets'); if (t.act) run(t); else { run(t, true); setTimeout(() => { openOverlays(); spot(`#v155OvPop [data-row="${t.id}"]`); }, 50); } } })),
      quantEntries(),
      [{ id: 'lb:perp', l: 'Perp Trader Leaderboard', alt: T('lb.perp'), k: 'leaderboard perp hyperliquid alpha score top traders', g: 'leaderboard', f: () => { showTab('social'); if (lb()) lb().showPerp(true); spot('#lbPerp'); } },
        { id: 'lb:smart', l: 'Smart-Money Wallet Leaderboard', alt: T('lb.smart'), k: 'leaderboard smart money wallet tracker on-chain', g: 'leaderboard', f: () => { if (ST.mode !== 'onchain') setMode('onchain'); showTab('whales'); setTimeout(() => { const d = $('#lbSmart'); if (d) { d.open = true; spot('#lbSmart > summary'); } }, 120); } },
        { id: 'ws:simple', l: 'Workspace: ' + T('v155.simple'), k: 'simple mode clean minimal beginner', g: 'workspace', f: () => setWs('simple') }, { id: 'ws:pro', l: 'Workspace: ' + T('v155.pro'), k: 'pro mode all tabs advanced', g: 'workspace', f: () => setWs('pro') },
        { id: 'ws:reset', l: T('v155.reset'), alt: 'Reset Clean View', k: 'reset clean declutter close drawers overlays off', g: 'workspace', f: () => U.reset() }, { id: 'ws:zen', l: T('v155.zen') + ' (F)', alt: 'Zen Chart Focus', k: 'zen focus full width hide sidebars', g: 'workspace', f: () => { showTab('markets'); zen(); } }],
      typeof V154 !== 'undefined' ? V154.MODULES.map((m) => ({ id: 'learn:' + m.id, l: '🎓 ' + m.title, k: m.what + ' ' + (m.key || ''), g: 'Learn ExTerm', f: () => LearnUI.open(m.id) })) : []);
    if (q.trim().length >= 2) {
      if (typeof IndPick !== 'undefined') for (const r of IndPick.rows()) E.push({ id: 'ind:' + r.id, l: 'ƒx ' + r.n, k: (r.cat || '') + ' indicator', g: 'indicator', f: () => { showTab('markets'); IndPick.toggle(r); spot('#indBtns'); } });
      for (const [id, s] of Object.entries(NT.strategies || {})) if (s && s.name) E.push({ id: 'strat:' + id, l: '🤖 ' + s.name, k: (s.desc || '') + ' strategy bot backtest', g: 'strategy', f: () => { showTab('bots'); const sel = $('#suStrat'); if (sel) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); } spot('#botForm'); } });
    }
    return E;
  };
  const mountPalette = () => {
    if (typeof palRender !== 'function' || U.palWrapped) return; U.palWrapped = true; const _pr = palRender;
    palRender = function () {
      _pr.apply(this, arguments); const q = ($('#palIn').value || '').trim(); if (!q) return;
      const seen = new Set(palItems.map((x) => x.l)), add = V155.search(q, entries(q), 14).filter((e) => !seen.has(e.l)).map((e) => ({ l: e.l, r: e.g, f: e.f }));
      palItems.push(...add); palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
      $('#palList').innerHTML = palItems.map((x, i) => `<div class="it ${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${esc(x.l)}</span><span class="note">${esc(x.r)}</span></div>`).join('');
    };
    const inp = $('#palIn'); if (inp) { inp.placeholder = T('v155.search'); inp.dataset.i18nPh = 'v155.search'; const h = V155.debounce(() => { palIdx = 0; palRender(); }, 40); inp.oninput = h; }
  };

  /* ══ Journal: 4-metric summary strip + Replay My Worst Loss ══ */
  const journalStrip = () => {
    const host = $('#jnHost'); if (!host || typeof Journal === 'undefined') return; let s = $('#v155Jn'); if (!s) { s = el('div', 'v155-jn'); s.id = 'v155Jn'; host.prepend(s); s.addEventListener('click', (e) => { if (e.target.closest('[data-v155="worst"]')) { const u = up(); if (u && u.A.worst) u.A.worst(); } }); }
    const ex = (Journal.entries || []).filter((e) => e && Number.isFinite(e.pnl)), w = ex.filter((e) => e.pnl > 0), l = ex.filter((e) => e.pnl < 0), net = ex.reduce((a, e) => a + e.pnl, 0), gl = -l.reduce((a, e) => a + e.pnl, 0), pf = gl ? w.reduce((a, e) => a + e.pnl, 0) / gl : null;
    s.innerHTML = [['Trades', String(ex.length)], ['Win rate', ex.length ? Math.round((w.length / ex.length) * 100) + '%' : '–'], ['Net P&L', V155.usd(net, true), net >= 0 ? 'up' : 'dn'], ['Profit factor', pf == null ? '–' : pf.toFixed(2)]].map(([k, v, c]) => `<div><span>${esc(k)}</span><b class="num ${c || ''}">${esc(v)}</b></div>`).join('')
      + `<button type="button" class="btn sm" data-v155="worst">⏪ <span data-i18n="v155.worst">${esc(T('v155.worst'))}</span></button>`;
  };

  /* ══ Reset Clean View: drawers closed, overlays off, Zen off, default layout back ══ */
  U.reset = () => {
    closePop(); const m = $('#v155More'); if (m) m.hidden = true;
    for (const d of document.querySelectorAll('.v152-drawer.on')) d.classList.remove('on');
    if (typeof LearnUI !== 'undefined') LearnUI.close(); if (typeof palClose === 'function') palClose(); if (typeof IndPick !== 'undefined' && IndPick.hide) IndPick.hide();
    const u = up(); if (u) { const c = u.cfg(); for (const k of ['ghost', 'sess', 'tape', 'charm', 'absorb', 'react']) c[k] = false; }
    const L = lb(); if (L) L.cfg().heat = false;
    const c = cfg(); c.hideL = c.hideR = false; paintZen();
    for (const d of document.querySelectorAll('#v155Rules[open], #tab-markets details[open]')) d.open = false;
    const tf = $('#tfBtns'); if (tf) tf.classList.remove('v155-open');
    if (typeof showTab === 'function') showTab('markets');
    if (typeof chart !== 'undefined' && chart) { chart.view = { bars: 110, off: 0 }; chart.invalidate(); }
    saveState(); paintOvBtn(); paintFavs(); setTimeout(() => window.dispatchEvent(new Event('resize')), 30); toast('↺ ' + esc(T('v155.reset')), 'acc');
  };

  U.start = () => {
    cfg(); mountHeader(); mountNav(); mountChart(); mountTicket(); mountPalette(); setWs(cfg().ws); paintZen(); paintOvBtn(); paintDots(); starterBt();
    if (typeof buildTicket === 'function') { const _bt = buildTicket; buildTicket = function () { const r = _bt.apply(this, arguments); try { mountTicket(); } catch (e) { console.warn('v155 ticket', e); } return r; }; }
    if (typeof renderBtResult === 'function') { const _rb = renderBtResult; renderBtResult = function (res, S, sym, candles) { const r = _rb.apply(this, arguments); try { heroBots(res, S, sym, candles); } catch (e) { console.warn('v155 hero', e); } return r; }; }
    const Q = q153(); if (Q && Q.A && Q.A.base) { const _b = Q.A.base; Q.A.base = async function () { const r = await _b.apply(this, arguments); try { heroQuant(); } catch (e) { console.warn('v155 quant hero', e); } return r; }; }
    if (typeof renderLab === 'function') { const _rl = renderLab; renderLab = async function () { const r = await _rl.apply(this, arguments); try { if (typeof labSec !== 'undefined' && labSec === 'q153') { wizard(); if (Q && Q.base) heroQuant(); } } catch (e) { console.warn('v155 wizard', e); } return r; }; }
    if (typeof setMode === 'function') { const _sm = setMode; setMode = function () { const r = _sm.apply(this, arguments); try { if (pop && pop.id === 'v155OvPop') refreshPop(TOOLS); const b = $('#v155Ov'); if (b) b.dataset.hot = hot().filter((id) => byId(id) && !(byId(id).on && byId(id).on())).length; } catch (e) { /* toolbar optional */ } return r; }; }
    if (typeof showTab === 'function') { const _st = showTab; showTab = function (k) { const r = _st.apply(this, arguments); try { if (k === 'journal') setTimeout(journalStrip, 60); if (k === 'bots') setTimeout(starterBt, 60); } catch (e) { /* optional */ } return r; }; }
    const bn = $('#banner'); if (bn) bn.addEventListener('click', () => bn.classList.toggle('open'));
    const b = $('#v155Ov'); if (b) b.dataset.hot = hot().filter((id) => byId(id) && !(byId(id).on && byId(id).on())).length;
    document.addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { const a = document.activeElement; if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) return; const mk = $('#tab-markets'); if (mk && mk.classList.contains('on')) zen(); } });
    setInterval(() => { if (!document.hidden) { paintDots(); paintOvBtn(); } }, 1500); // background polling pauses while the window is hidden
    if (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS)) V14.SHORTCUTS.push(['F', 'Zen Chart Focus (also fits the chart) · « » collapse one side'], ['Ctrl+K', 'Search every feature, ticker, tool, indicator, strategy and lesson']);
    if (typeof I18N !== 'undefined') { const _ap = I18N.apply; I18N.apply = function () { const r = _ap.apply(this, arguments); try { paintGroups(); } catch (e) { /* nav optional */ } return r; }; I18N.apply(); }
  };
  U.cfg = cfg; U.setWs = setWs; U.zen = zen; U.TOOLS = TOOLS; U.LENS = LENS; U.entries = entries; U.run = run; U.openOverlays = openOverlays; U.heroBots = heroBots; U.journalStrip = journalStrip;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b155 = boot; boot = async function () { await _b155.apply(this, arguments); try { V155UI.start(); } catch (e) { console.warn('v155 init', e); } }; }
