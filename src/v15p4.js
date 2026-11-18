/* ExTerm v15 phase 4 UI: dense canvas bubble heat maps (crypto, stocks, on-chain) with buy-pressure windows
   1m–24h, the Launch Radar's live age brackets with buy/sell pressure bars and "⚡ Send to Grok Tab", the live
   market scanner + unified multi-asset watchlist sidebar with sub-second sparklines, and responsive layout
   classes for half-screen, tablet and phone (touch drawer). Pure logic lives in v15p4core.js (P4).
   Security: every external string goes through esc(); no inline handlers (strict CSP); links are never built here. */
const P4UI = (() => {
  const U = { fps: 0, samples: new Map(), scanRows: [], scanTs: 0, loads: new Map() };
  const VIEWS = ['tiles', 'bubbles'];
  const opt = () => {
    const o = ST.p4 && typeof ST.p4 === 'object' ? ST.p4 : (ST.p4 = {});
    if (!P4.winOk(o.win)) o.win = '1h';
    if (!VIEWS.includes(o.view)) o.view = 'tiles';
    o.density = Math.min(3, Math.max(1, Math.round(+o.density || 2)));
    if (o.tab !== 'scan') o.tab = 'watch';
    o.side = !!o.side;
    return o;
  };
  const nowS = () => Date.now() / 1000;
  const storeOf = (sym, tf) => (typeof Stores !== 'undefined' ? Stores.get(sym + '|' + tf) : null); // never creates a store
  const firstStore = (sym, tfs) => { for (const t of tfs) { const s = storeOf(sym, t); if (s && s.candles.length > 2) return s; } return null; };

  /* ── buy pressure for any crypto / stock symbol in a window: ticks → bars → change proxy ── */
  U.pressureFor = (sym, win, ch) => {
    const sec = P4.WINDOWS[win], tfs = sec <= 900 ? ['1m', '5m', '15m'] : sec <= 14400 ? ['5m', '15m', '1h'] : ['15m', '1h', '4h'];
    const st = firstStore(sym, tfs);
    return P4.pressure({ trades: (typeof TFX !== 'undefined' && TFX.ring.get(sym)) || [], candles: st ? st.candles : null, ch }, win, nowS());
  };

  /* ── dense bubble engine: sprites per colour bucket + radius, one rAF loop (runs at the display's refresh rate:
        60 / 120 / 144 / 240 Hz), grid collision so 2–3× more bubbles stay smooth ── */
  const sprites = new Map();
  const colRGB = (b) => { const k = b / 8; return k >= 0 ? [Math.round(34 + (1 - k) * 90), Math.round(197 + (1 - k) * 20), Math.round(94 + (1 - k) * 80)] : [239, Math.round(68 + (1 + k) * 120), Math.round(68 + (1 + k) * 120)]; };
  const sprite = (b, r, dpr) => {
    const R = Math.max(3, Math.round(r)), key = b + '|' + R + '|' + dpr; let c = sprites.get(key); if (c) return c;
    if (sprites.size > 600) sprites.clear();
    c = document.createElement('canvas'); c.width = c.height = Math.ceil((R * 2 + 4) * dpr);
    const g = c.getContext('2d'), m = c.width / 2, [cr, cg, cb] = colRGB(b);
    g.scale(dpr, dpr); const mm = m / dpr;
    const gr = g.createRadialGradient(mm - R / 3, mm - R / 3, 1, mm, mm, R);
    gr.addColorStop(0, 'rgba(255,255,255,.38)'); gr.addColorStop(0.35, `rgba(${cr},${cg},${cb},.9)`); gr.addColorStop(1, `rgba(${cr},${cg},${cb},.55)`);
    g.beginPath(); g.arc(mm, mm, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    sprites.set(key, c); return c;
  };
  /* host: element; o: {onPick(id), tip(node) → html, scale (colour %), axis: [left, mid, right]} */
  U.Bubbles = (host, o) => {
    const B = { nodes: [], hover: null, raf: 0, frames: 0, t0: performance.now() };
    host.innerHTML = `<div class="p4-bub"><canvas aria-label="Bubble heat map"></canvas><div class="rd-tip p4-tip" hidden></div><div class="rd-axis note"><span>${esc(o.axis[0])}</span><span>${esc(o.axis[1])}</span><span>${esc(o.axis[2])}</span></div></div>`;
    const cv = host.querySelector('canvas'), tip = host.querySelector('.p4-tip'), ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth || 900; H = Math.max(360, Math.min(720, window.innerHeight - 280)); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; };
    size();
    B.set = (items) => {
      const prev = new Map(B.nodes.map((n) => [n.id, n]));
      B.nodes = P4.bubbleTargets(items, W, H, { density: opt().density }).map((n) => { const p = prev.get(n.id); if (p) { n.x = p.x; n.y = p.y; } return n; });
      B.items = items;
      if (B.paused && cv.offsetParent && document.body.contains(cv)) { B.paused = false; B.raf = requestAnimationFrame(frame); }
    };
    const frame = (t) => {
      if (!document.body.contains(cv)) { cancelAnimationFrame(B.raf); return; }
      if (!cv.offsetParent) { B.paused = true; return; } // hidden (other tab / asset): stop drawing until set() wakes it
      if (host.clientWidth && Math.abs(host.clientWidth - W) > 2) { size(); if (B.items) B.set(B.items); }
      P4.relax(B.nodes, W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(148,163,200,.14)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(0, H / 2 - 8); ctx.lineTo(W, H / 2 - 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const n of B.nodes) {
        const fx = n.x, fy = n.y; n.fx = fx; n.fy = fy; // no per-frame float: settled bubbles stay still
        const sp = sprite(P4.bucket(n.ch, o.scale), n.r, dpr), half = sp.width / dpr / 2;
        ctx.drawImage(sp, fx - half, fy - half, sp.width / dpr, sp.height / dpr);
        if (B.hover === n.id) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(fx, fy, n.r, 0, Math.PI * 2); ctx.stroke(); }
        if (n.r > 13) { ctx.fillStyle = 'rgba(10,12,20,.92)'; ctx.font = `700 ${Math.min(14, n.r / 2.3)}px Inter, system-ui, sans-serif`; ctx.fillText(String(n.d.label || n.id).slice(0, 8), fx, fy); }
      }
      if (o.onFrame) o.onFrame(B.nodes);
      B.frames++; if (t - B.t0 >= 1000) { U.fps = Math.round((B.frames * 1000) / (t - B.t0)); B.frames = 0; B.t0 = t; }
      B.raf = requestAnimationFrame(frame);
    };
    B.raf = requestAnimationFrame(frame);
    const at = (e) => { const r = cv.getBoundingClientRect(); return P4.hit(B.nodes.map((n) => ({ id: n.id, x: n.fx || n.x, y: n.fy || n.y, r: n.r, n })), e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener('mousemove', (e) => {
      const h = at(e); B.hover = h ? h.id : null; cv.style.cursor = h ? 'pointer' : 'default';
      if (!h) { tip.hidden = true; return; }
      tip.hidden = false; tip.style.left = Math.min(W - 240, h.x + h.r + 8) + 'px'; tip.style.top = Math.max(0, h.y - 40) + 'px'; tip.innerHTML = o.tip(h.n) + '<div class="note">Shift+click · ⚙ Auto-Setup</div>';
    });
    cv.addEventListener('mouseleave', () => { B.hover = null; tip.hidden = true; });
    cv.addEventListener('click', (e) => { const h = at(e); if (!h) return; if (e.shiftKey && typeof V151UI !== 'undefined') V151UI.autoSetup(h.id); else o.onPick(h.id); });
    B.stop = () => cancelAnimationFrame(B.raf);
    return B;
  };

  /* ── heat map: view + pressure window bar, bubbles for crypto / stocks, pressure for on-chain bubbles ── */
  let heatBub = null;
  const tipHtml = (n, extra) => `<b>${esc(n.d.label || n.id)}</b> <span class="note">${esc(String(n.d.name || '').slice(0, 24))}</span><div>${n.d.price ? esc(NT.fmtPrice(n.d.price)) + ' · ' : ''}<span class="${cls(n.ch)}">${esc(NT.fmtPct(n.ch))}</span></div><div>${(n.bp * 100).toFixed(0)}% buy pressure (${esc(opt().win)}${n.d.src ? ' · ' + esc(n.d.src) : ''})</div>${extra || ''}`;
  const cryptoItems = (win) => heatData().map((d) => {
    const id = d.sym + '-USD', pr = U.pressureFor(id, win, { '1h': d.i.ch1h, '24h': d.i.ch24h });
    return { id, label: d.sym, name: d.name, price: d.price, ch: d.ch, size: d.value, bp: pr.bp, src: pr.src + (pr.approx ? '≈' : '') };
  });
  const stockItems = (win) => STOCKS.map(([s, n, sec, sh]) => {
    const q = sheat.q[s], lv = Feed.live[s], price = (lv && lv.price) || (q && q.price), prev = (lv && lv.open24) || (q && q.prev);
    const ch = price && prev ? (price / prev - 1) * 100 : q ? q.ch : null, pr = U.pressureFor(s, win, { '24h': ch, '1h': ch != null ? ch / 3 : null });
    return { id: s, label: s, name: n, price, ch, size: Math.max(1, sh * (price || STOCK_INFO[s].demo)), bp: pr.bp, src: pr.src + (pr.approx ? '≈' : '') };
  });
  const heatBar = () => {
    let bar = $('#p4HeatBar');
    if (!bar) { const h = $('#heatHost'); if (!h) return null; bar = document.createElement('div'); bar.id = 'p4HeatBar'; bar.className = 'p4-hbar'; h.parentElement.insertBefore(bar, h); const b = document.createElement('div'); b.id = 'p4Bub'; b.hidden = true; h.parentElement.insertBefore(b, h.nextSibling); }
    const o = opt(), oc = ST.heat.asset === 'onchain', bubbles = oc ? ST.radar && ST.radar.view === 'bubbles' : o.view === 'bubbles';
    const html = `${oc ? '' : `<div class="seg" id="p4View">${VIEWS.map((v) => `<button type="button" data-v="${v}" class="${o.view === v ? 'on' : ''}">${v === 'tiles' ? '▦ Tiles' : '🫧 Bubbles'}</button>`).join('')}</div>`}
      <span class="note">Buy pressure</span><div class="seg" id="p4Win">${P4.WIN_KEYS.map((w) => `<button type="button" data-v="${w}" class="${o.win === w ? 'on' : ''}">${w}</button>`).join('')}</div>
      ${bubbles ? `<span class="note">Density</span><div class="seg" id="p4Den">${[1, 2, 3].map((d) => `<button type="button" data-v="${d}" class="${o.density === d ? 'on' : ''}">${d}×</button>`).join('')}</div><span class="note p4-fps" id="p4Fps"></span>` : ''}`;
    if (bar._h !== html) { bar._h = html; bar.innerHTML = html; }
    return bar;
  };
  const bindHeatBar = () => {
    const bar = $('#p4HeatBar'); if (!bar || bar._bound) return; bar._bound = true;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return; const o = opt(), seg = b.parentElement.id;
      if (seg === 'p4View') o.view = b.dataset.v; else if (seg === 'p4Win') o.win = b.dataset.v; else if (seg === 'p4Den') o.density = +b.dataset.v; else return;
      saveState(); if (typeof Radar !== 'undefined') Radar.key = ''; if (heatBub && seg !== 'p4Win') { heatBub.stop(); heatBub = null; } renderHeat(seg === 'p4View');
    });
  };
  const _renderHeat = renderHeat;
  renderHeat = function (relayout) {
    const r = _renderHeat.apply(this, arguments);
    const bar = heatBar(); if (!bar) return r; bindHeatBar();
    const o = opt(), host = $('#heatHost'), bub = $('#p4Bub'), oc = ST.heat.asset === 'onchain';
    if (oc || o.view !== 'bubbles') { if (bub) bub.hidden = true; if (heatBub && !oc) { heatBub.stop(); heatBub = null; } if (!oc && host) host.hidden = false; return r; }
    host.hidden = true; bub.hidden = false;
    const stk = ST.heat.asset === 'stocks', items = stk ? stockItems(o.win) : cryptoItems(o.win);
    if (!heatBub || !document.body.contains(bub.querySelector('canvas')) || heatBub.asset !== ST.heat.asset) {
      if (heatBub) heatBub.stop();
      heatBub = U.Bubbles(bub, { scale: stk ? 3 : HEAT_SCALE[ST.heat.period] || 6, axis: ['← falling', 'buy pressure ↑', 'rising →'], onPick: (id) => openSym(id), tip: (n) => tipHtml(n) });
      heatBub.asset = ST.heat.asset;
    }
    heatBub.set(items);
    return r;
  };
  setInterval(() => { const f = $('#p4Fps'); if (f && curTab === 'heat') f.textContent = U.fps ? U.fps + ' fps' : ''; if (heatBub && curTab === 'heat' && !document.hidden && opt().view === 'bubbles' && ST.heat.asset !== 'onchain') heatBub.set(ST.heat.asset === 'stocks' ? stockItems(opt().win) : cryptoItems(opt().win)); }, 1000);

  U.heatBub = () => heatBub; U.rdBub = () => rdBub;

  /* ── Launch Radar: bubbles on the dense engine + grouped list with pressure bars and Send to Grok ── */
  const ageTxt = (ms) => { const m = (Date.now() - ms) / 60000; return m < 60 ? Math.max(0, Math.round(m)) + 'm' : m < 2880 ? (m / 60).toFixed(1) + 'h' : Math.round(m / 1440) + 'd'; };
  let rdBub = null;
  const ocItems = (rows, win) => rows.map((s) => {
    const st = OC.stats[s] || {}, m = OC.meta[s] || {}, pr = P4.ocPressure(st, win), mins = st.created ? Math.max(1, (Date.now() - st.created) / 60000) : 1440;
    return { id: s, label: m.s || '?', name: m.n, price: st.price, ch: st.ch1h || 0, size: st.vol1h || st.vol24 || 1, bp: pr.bp, xk: 1 - Math.min(1, Math.log(mins) / Math.log(1440)), src: (pr.field || 'n/a') + (pr.approx ? '≈' : ''), st, pr };
  });
  if (typeof Radar !== 'undefined') {
    Radar.bubbles = (host, rows) => {
      if (rdBub) rdBub.stop();
      rdBub = U.Bubbles(host, { scale: 30, axis: ['← older', 'buy pressure ↑', 'newer →'], onPick: (id) => openSym(id), onFrame: (ns) => { for (const n of ns) Radar.pos.set(n.id, { x: n.fx || n.x, y: n.fy || n.y }); }, tip: (n) => tipHtml(n, `<div>MC ${n.d.st.mcap || n.d.st.fdv ? '$' + esc(NT.fmtCompact(n.d.st.mcap || n.d.st.fdv)) : '–'} · Liq ${n.d.st.liq ? '$' + esc(NT.fmtCompact(n.d.st.liq)) : '–'}</div><div>${esc(String(n.d.pr.buys))} buys / ${esc(String(n.d.pr.sells))} sells · ${n.d.st.created ? esc(ageTxt(n.d.st.created)) + ' old' : ''}</div>`) });
      const cv = host.querySelector('canvas'), tp = host.querySelector('.p4-tip'); if (cv) cv.id = 'rdCv'; if (tp) tp.id = 'rdTip'; // v13 contract
      Radar.pos.clear(); rdBub.set(ocItems(rows, opt().win));
    };
    const _rr = Radar.render;
    /* list view: the original rows (age ring, MC, liquidity, socials, safety grade, momentum) stay; phase 4 adds
       live age-bracket headers (newest-first sort), window-aware buy/sell pressure bars and a "⚡ Grok" button */
    Radar.render = function () {
      const o = ST.radar || {}, host = $('#rdBody');
      if (o.view === 'bubbles' && rdBub && host && host.querySelector('.p4-bub canvas')) { rdBub.set(ocItems(Radar.filtered(), opt().win)); return; }
      const out = _rr.apply(this, arguments);
      if (o.view !== 'list' || !host) return out;
      const list = host.querySelector('.radar-list'); if (!list || list.dataset.p4 === Radar.key) return out;
      list.dataset.p4 = Radar.key;
      const win = opt().win, now = Date.now(), lab = {}; for (const b of P4.BRACKETS) lab[b.id] = b.l;
      let last = null;
      for (const row of [...list.querySelectorAll('.rd-row[data-oc]')]) {
        const s = row.dataset.oc, st = OC.stats[s] || {}, pr = P4.ocPressure(st, win), bp = Math.round(pr.bp * 100);
        const bk = P4.bracketOf(st.created ? (now - st.created) / 1000 : NaN);
        if ((o.sort || 'new') === 'new' && bk !== last) { const h = document.createElement('div'); h.className = 'p4-brk'; h.dataset.b = bk; h.innerHTML = `<b>${esc(lab[bk])}</b><span class="tag">${list.querySelectorAll('.rd-row[data-oc]').length}</span>`; row.before(h); last = bk; }
        const bs = row.querySelector('.rd-bs');
        if (bs) { bs.title = `${pr.buys} buys / ${pr.sells} sells (${pr.field || win}${pr.approx ? ', nearest window' : ''})`; bs.innerHTML = `<div class="tc-bar"><i style="width:${bp}%"></i></div><span class="note">${bp}% buys · ${esc(pr.field || win)}${pr.approx ? '≈' : ''} · ${esc(String(pr.buys))}/${esc(String(pr.sells))}</span>`; }
        row.classList.add('p4x'); row.dataset.bk = bk;
        const g = document.createElement('button'); g.type = 'button'; g.className = 'btn xs p4-grok'; g.dataset.p4grok = s; g.title = 'Send this setup to the Grok tab'; g.textContent = '⚡ Grok'; row.appendChild(g);
        const a = document.createElement('button'); a.type = 'button'; a.className = 'btn xs v151-as'; a.dataset.autosetup = s; a.title = 'Auto-Setup: chart + Auto-Fibs + PDH/PDL + Entry/SL/TP + 3-agent risk summary'; a.textContent = '⚙ Setup'; row.appendChild(a);
      }
      for (const h of list.querySelectorAll('.p4-brk')) h.querySelector('.tag').textContent = String(list.querySelectorAll(`.rd-row[data-bk="${h.dataset.b}"]`).length);
      return out;
    };
    const rdb = $('#rdBody');
    if (rdb) {
      const grok = (e) => {
        const b = e.target.closest('[data-p4grok]'); if (!b) return false;
        e.stopPropagation(); e.preventDefault();
        const s = b.dataset.p4grok; if (!OC.is(s)) return true;
        if (typeof Grok !== 'undefined') Grok.receive(P4.radarSetup(s, OC.stats[s], opt().win, (OC.meta[s] || {}).s));
        return true;
      };
      rdb.addEventListener('click', grok, true);
      rdb.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-p4grok]')) e.stopPropagation(); }, true); // the button's own click sends once; the row must not open the chart
    }
  }

  /* ── live market scanner + unified multi-asset watchlist sidebar ── */
  const side = () => $('#p4Side');
  const mount = () => {
    if (side()) return;
    const a = document.createElement('aside'); a.id = 'p4Side'; a.className = 'p4-side'; a.setAttribute('aria-label', 'Watchlist and market scanner'); a.hidden = true;
    a.innerHTML = '<div class="p4-grip" aria-hidden="true"><i></i></div><div class="p4-sh"><div class="seg" id="p4Tabs"><button type="button" data-v="watch">👁 Watchlist</button><button type="button" data-v="scan">📡 Scanner</button></div><span class="sp"></span><button type="button" class="ghost" id="p4SideX" aria-label="Close sidebar">✕</button></div><div class="p4-body" id="p4SideBody"></div>';
    document.body.appendChild(a);
    const btn = document.createElement('button'); btn.id = 'btnSide'; btn.className = 'ghost'; btn.type = 'button'; btn.title = 'Watchlist & market scanner'; btn.setAttribute('aria-controls', 'p4Side'); btn.textContent = '📋';
    const th = $('#btnTheme'); if (th) th.parentElement.insertBefore(btn, th);
    btn.addEventListener('click', () => U.toggle());
    a.querySelector('#p4SideX').addEventListener('click', () => U.toggle(false));
    a.querySelector('#p4Tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; opt().tab = b.dataset.v; saveState(); U.renderSide(true); });
    a.querySelector('#p4SideBody').addEventListener('click', (e) => { const r = e.target.closest('[data-sym]'); if (r) { openSym(r.dataset.sym); if (document.body.classList.contains('lay-phone')) U.toggle(false); } });
    a.querySelector('#p4SideBody').addEventListener('keydown', (e) => { const r = e.target.closest('[data-sym]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSym(r.dataset.sym); } });
    // touch drawer: drag the grip down to close the bottom sheet on phones
    let y0 = null; const grip = a.querySelector('.p4-grip');
    grip.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    grip.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); a.style.transform = dy ? `translateY(${dy}px)` : ''; }, { passive: true });
    grip.addEventListener('touchend', (e) => { const dy = y0 == null ? 0 : (e.changedTouches[0].clientY - y0); y0 = null; a.style.transform = ''; if (dy > 70) U.toggle(false); });
    if (opt().side) U.toggle(true);
  };
  U.toggle = (on) => {
    const a = side(); if (!a) return; const o = opt(); o.side = on == null ? a.hidden : !!on; a.hidden = !o.side;
    document.body.classList.toggle('p4-side-on', o.side); const b = $('#btnSide'); if (b) b.setAttribute('aria-expanded', String(o.side));
    saveState(); if (o.side) U.renderSide(true);
  };
  const modeTag = { crypto: '◆', stocks: '▲', onchain: '⬡' };
  const label = (s) => (typeof baseOf === 'function' ? baseOf(s) : s);
  const ticksOf = (sym) => {
    const r = (typeof TFX !== 'undefined' && TFX.ring.get(sym)) || [], now = nowS();
    if (r.length > 1 && r[r.length - 1].t > now - 60) return r;
    return U.samples.get(sym) || [];
  };
  U.sample = () => { // 4 samples per second per watched symbol: sparklines move between exchange ticks too
    const t = nowS(), w = P4.unifiedWatch(ST.mk), keep = new Set(w.map((x) => x.sym));
    for (const k of U.samples.keys()) if (!keep.has(k)) U.samples.delete(k);
    for (const { sym } of w) { const p = px(sym); if (!(p > 0)) continue; let a = U.samples.get(sym); if (!a) U.samples.set(sym, (a = [])); a.push({ t, p, q: 0 }); if (a.length > 480) a.splice(0, a.length - 480); }
  };
  const drawSpark = (cv, sym) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 84, H = cv.clientHeight || 24; if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const pts = P4.sparkPath(P4.sparkPoints(ticksOf(sym), nowS(), 60, 120), W, H); if (pts.length < 2) return;
    const up = pts[pts.length - 1][1] <= pts[0][1]; g.strokeStyle = up ? '#22c55e' : '#f43f5e'; g.lineWidth = 1.4; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  };
  U.renderSide = (force) => {
    const a = side(); if (!a || a.hidden) return; const o = opt(), body = a.querySelector('#p4SideBody');
    a.querySelectorAll('#p4Tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === o.tab));
    if (o.tab === 'watch') {
      const list = P4.unifiedWatch(ST.mk), key = 'w|' + list.map((x) => x.sym).join(',');
      if (force || body._k !== key) {
        body._k = key;
        body.innerHTML = list.length ? `<div class="p4-wl">${list.map((x) => `<div class="p4-wr" data-sym="${esc(x.sym)}" tabindex="0" role="button"><span class="p4-m">${modeTag[x.mode]}</span><b>${esc(label(x.sym))}</b><canvas class="p4-sp" data-sp="${esc(x.sym)}" aria-hidden="true"></canvas><span class="p4-px mono" data-px="${esc(x.sym)}">–</span><span class="p4-ch" data-ch="${esc(x.sym)}"></span></div>`).join('')}</div><div class="note p4-foot">All three watchlists in one place · sparklines show the last 60 s</div>` : '<div class="empty">Your watchlists are empty. Add symbols on the Markets tab.</div>';
      }
      for (const x of list) {
        const p = px(x.sym), c = chg24(x.sym), pe = body.querySelector(`[data-px="${CSS.escape(x.sym)}"]`), ce = body.querySelector(`[data-ch="${CSS.escape(x.sym)}"]`), sp = body.querySelector(`[data-sp="${CSS.escape(x.sym)}"]`);
        if (pe) pe.textContent = p > 0 ? (isOnchain(x.sym) ? NT.fmtTiny(p) : NT.fmtPrice(p)) : '–';
        if (ce) { ce.textContent = c == null ? '' : NT.fmtPct(c, 1); ce.className = 'p4-ch ' + cls(c); }
        if (sp) drawSpark(sp, x.sym);
      }
      return;
    }
    if (force || Date.now() - U.scanTs > 2500) U.scan();
    const r = P4.scan(U.scanRows, { top: 8, rvolMin: 3 }), item = (x, v) => `<div class="p4-sr" data-sym="${esc(x.sym)}" tabindex="0" role="button"><b>${esc(label(x.sym))}</b><span class="sp"></span>${v}<button type="button" class="btn xs v151-as" data-autosetup="${esc(x.sym)}" title="Auto-Setup: chart + Auto-Fibs + PDH/PDL + Entry/SL/TP + 3-agent risk summary">⚙</button></div>`;
    const html = `<div class="p4-sec"><div class="p4-st">🚀 Top gainers (24h)</div>${r.gainers.map((x) => item(x, `<span class="${cls(x.ch)}">${esc(NT.fmtPct(x.ch, 1))}</span>`)).join('') || '<div class="note">Waiting for prices…</div>'}</div>
      <div class="p4-sec"><div class="p4-st">🔊 Volume spikes · RVOL &gt; 3×</div>${r.spikes.map((x) => item(x, `<span class="tag amb">${esc(x.rvol.toFixed(1))}× · ${esc(x.tf)}</span>`)).join('') || '<div class="note">No unusual volume on loaded charts.</div>'}</div>
      <div class="p4-sec"><div class="p4-st">🎯 Strategy signal matches</div>${r.signals.map((x) => item(x, x.sigs.slice(0, 2).map((s) => `<span class="tag acc">${esc(s)}</span>`).join(' '))).join('') || '<div class="note">No entry signals on the newest bar.</div>'}</div>
      <div class="note p4-foot">Scans ${U.scanRows.length} markets every few seconds · signals = an entry on the newest bar</div>`;
    if (body._k !== html) { body._k = html; body.innerHTML = html; }
  };
  const scanStrats = () => { const ids = new Set((ST.bots || []).map((b) => b.strat)); for (const k of ['ema_cross', 'rsi_rev', 'macd_cross', 'bb_rev', 'q4_qs_rsi2', 'q4_qs_dualma']) if (ids.size < 6 && NT.strategies[k]) ids.add(k); return [...ids].filter((k) => NT.strategies[k]).slice(0, 6); };
  U.scan = () => {
    U.scanTs = Date.now();
    const syms = new Set(P4.unifiedWatch(ST.mk).map((x) => x.sym));
    if (typeof heat !== 'undefined') for (const i of (heat.items || []).slice(0, 40)) if (Providers.ids.has(i.sym + '-USD')) syms.add(i.sym + '-USD');
    const strats = scanStrats(), rows = []; let loads = 0;
    for (const [k, t] of U.loads) if (Date.now() - t > 600000) U.loads.delete(k);
    for (const sym of [...syms].slice(0, 48)) {
      const st = firstStore(sym, ['5m', '1m', '15m', ST.tf, '1h']);
      const ch = chg24(sym) != null ? chg24(sym) : typeof heat !== 'undefined' ? ((heat.items || []).find((i) => i.sym + '-USD' === sym) || {}).ch24h : null;
      const row = { sym, ch: Number.isFinite(ch) ? ch : null, rvol: 0, sigs: [], tf: st ? st.tf : '' };
      if (st && st.candles.length > 25) {
        const c = st.candles.slice(-300); row.rvol = P4.rvol(c, 20);
        for (const id of strats) if (P4.signalNow(NT.strategies[id], c, NT.defaultParams(id)) === 'buy') row.sigs.push(NT.strategies[id].name.split(' (')[0]);
      }
      rows.push(row);
      // load a 5m history for watched crypto / stock symbols once a minute so RVOL and signals have bars to read
      if (!st && !isOnchain(sym) && !U.loads.has(sym) && loads < 3) { loads++; U.loads.set(sym, Date.now()); getStore(sym, '5m').load(150); } // ≤3 history pulls per scan (rate limits)
    }
    U.scanRows = rows;
  };
  setInterval(() => { if (side() && !side().hidden && !document.hidden) { U.sample(); if (opt().tab === 'watch') U.renderSide(false); } }, 250);
  setInterval(() => { if (side() && !side().hidden && !document.hidden && opt().tab === 'scan') U.renderSide(false); }, 3000);

  /* ── responsive layout classes: full / half-screen / tablet / phone ── */
  U.layout = () => {
    const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches), l = P4.layoutFor(window.innerWidth, touch);
    for (const k of ['full', 'half', 'tablet', 'phone']) document.body.classList.toggle('lay-' + k, k === l);
    document.body.classList.toggle('touch', touch); U.lay = l;
  };
  U.start = () => { mount(); U.layout(); window.addEventListener('resize', () => { clearTimeout(U._rz); U._rz = setTimeout(U.layout, 120); }); };
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined') P4UI.start();
