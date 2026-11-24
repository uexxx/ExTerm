/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.0 UI (maths in V180, v180core.js). Listeners only, text through textContent, strict CSP; floating blur(12px) rail.
   · rail     5 clean tabs: 24/7 Alpha Recs · 24/7 Bot Radar · Terminal Brain · 24/7 Optional Live Bot · Co-Pilot / Paper
   · alpha    border-free live feed from Lanes 11–16 with asset-class filter pills, S-TIER · A+ · A · B+ · WATCHLIST tiers,
              Passed / Pending / Failed badges, the "Why" engine readout, 6-bot votes, Lane 15 Monte Carlo, Lane 16 confluence
              + Journal RAG, Entry / Stop / TP1 / TP2 / R:R / Safe Size and 1-click Copy Setup · Open on Chart · Paper Mirror ·
              Send to Live Bot (gated by the Lane 18 Risk Firewall)
   · depth    a floating pill on the 1s–1M chart toggling 7 live 2D passes, all redrawn from the live candle array on every
              chart paint (no detached copy): volume-delta cores, L2 shelves, absorption / exhaustion glows, AVWAP ±1σ/±2σ,
              GEX strikes, 1σ expected-move cone, 5m/15m PiP ghosts behind 1s–15s
   · cockpit  rAF crosshair magnifier, drag-handle R:R lines, 3-point pattern alerts, Ctrl+V contract hydration, Shift+P smart
              pyramid, Shift+F atomic flip, L2 queue-position paper fills, Ctrl+K commands, mobile one-thumb arc */

/* the rail reads V177.TABS when it mounts (after boot): widen it to 5 tabs now, before that happens */
if (typeof V177 !== 'undefined' && typeof V180 !== 'undefined' && !V177._x180) {
  V177._x180 = true; const base = V177.railOf; V177.TABS.splice(0, V177.TABS.length, ...V180.TABS); V177.ENTRY.alpha = 'alpha'; V177.railOf = (t) => V180.railOf(t, base);
}

const V180UI = (() => {
  const U = { mounted: false, ver: '18.0', filter: 'all', data: null, at: 0, err: '', ms: null, ctx: { form4: null, smart: null }, ctxAt: 0, rows: new Map(), plans: {}, mirror: [], patterns: [], drawPts: null, layers: V180.layerDefaults(), cost: [], draws: 0, passes: [], book: null, bookSym: '', bookAt: 0, mag: { on: false, x: 0, y: 0, raf: 0, frames: 0, t0: 0 }, drag: null, pal: { ms: [], last: null }, copies: 0, handoffs: 0, blocked: 0, hyd: 0, pyr: {}, flips: 0, lastCopy: '', realised: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const escT = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s).replace(/[&<>"']/g, ''));
  const T = (m, k) => { if (typeof toast === 'function') toast(escT(m), k); };
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sel = () => (typeof ST !== 'undefined' && ST.sel) || '';
  const pxOf = (s) => { try { const p = typeof px === 'function' ? px(s) : 0; if (p > 0) return p; } catch (e) { /* not ready */ } return 0; };
  const api = (p, b, ms) => (typeof V179UI !== 'undefined' && V179UI.api ? V179UI.api(p, b, ms) : Promise.reject(new Error('launcher API unavailable')));
  const typing = (t) => !!(t && (t.isContentEditable || (t.closest && t.closest('input,textarea,select,[contenteditable="true"]'))));
  const ch = () => (typeof chart !== 'undefined' && chart ? chart : null);
  const inval = () => { const c = ch(); if (c) c.invalidate(); };
  const equity = () => { try { return ACC.equity(typeof priceMap === 'function' ? priceMap() : {}); } catch (e) { return 10000; } };
  const GA = (a) => 'rgba(245,200,75,' + a + ')', RA = (a) => 'rgba(239,68,68,' + a + ')';
  const MONO = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';

  /* ══ 1. 24/7 Alpha Recs ══ */
  const Alpha = U.alpha = {
    mount() {
      const main = $1('main'); if (!main || $1('#tab-alpha')) return;
      const s = el('section', 'tab x180-alpha'); s.id = 'tab-alpha'; s.setAttribute('aria-label', '24/7 Alpha Recs');
      const hd = el('div', 'x180-ah'); const h = el('h2', null, '24/7 Alpha Recs'); const src = el('span', 'x180-src mono'); src.id = 'x180Src'; hd.append(h, el('span', 'x180-lanes mono', 'Lanes 11–16'), src);
      const pills = el('div', 'x180-pills'); pills.setAttribute('role', 'radiogroup'); pills.setAttribute('aria-label', 'Asset class');
      for (const [k, l] of V180.FILTERS) { const b = el('button', 'x180-pill', l); b.type = 'button'; b.dataset.x180f = k; b.setAttribute('role', 'radio'); pills.appendChild(b); }
      const tiers = el('div', 'x180-tiers'); tiers.id = 'x180Tiers';
      const mir = el('div', 'x180-mir mono'); mir.id = 'x180Mir';
      const feed = el('div', 'x180-feed'); feed.id = 'x180Feed'; feed.setAttribute('role', 'list'); feed.setAttribute('aria-live', 'off');
      s.append(hd, pills, tiers, mir, feed); main.appendChild(s);
      if (typeof TABS !== 'undefined') TABS.alpha = { show: () => this.refresh(true), render: () => this.paint() };
      s.addEventListener('click', (e) => {
        const f = e.target.closest('[data-x180f]'); if (f) { U.filter = f.dataset.x180f; this.paint(); return; }
        const a = e.target.closest('[data-x180a]'); if (!a) return; const r = U.rows.get(a.dataset.k); if (!r) return;
        ({ copy: Act.copy, chart: Act.chart, mirror: Act.mirror, live: Act.live })[a.dataset.x180a](r);
      });
      this.paint();
    },
    async refresh(force) {
      if (!force && Date.now() - U.at < 2500) return; U.at = Date.now();
      try {
        try { performance.clearResourceTimings(); } catch (x) { /* old engine */ } const t0 = performance.now(); U.data = await api('/api/lane16/recs'); U.ms = performance.now() - t0; U.err = '';
        try { const e2 = performance.getEntriesByName(new URL('/api/lane16/recs', location.href).href).pop(); if (e2 && e2.responseEnd > 0) U.net = e2.responseEnd - e2.requestStart; } catch (x) { /* no resource timing */ } // the lane + loopback, without main-thread queueing
      } catch (e) { U.err = 'Alpha Recs need the ExTerm launcher (serve.py): ' + (e.message || e); }
      if (Date.now() - U.ctxAt > 30000) { U.ctxAt = Date.now(); this.context(); }
      if (tab() === 'alpha') this.paint();
    },
    async context() {
      const [f4, lb] = await Promise.allSettled([api('/api/lane6/clusters'), api('/api/lane5/board?win=30d')]);
      if (f4.status === 'fulfilled') U.ctx.form4 = V180.form4Map(f4.value.rows); if (lb.status === 'fulfilled') U.ctx.smart = V180.smartMap(lb.value.rows);
      if (tab() === 'alpha') this.paint();
    },
    paint() {
      const feed = $1('#x180Feed'); if (!feed) return; const D = U.data, all = (D && D.rows) || [], rows = V180.feed(all, U.filter);
      for (const b of $$1('[data-x180f]')) { const on = b.dataset.x180f === U.filter; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      $1('#x180Src').textContent = D ? (D.sample ? 'SAMPLE · offline launcher' : 'LIVE') + ' · ' + all.length + ' setups' + (U.net != null ? ' · Lane 16 ' + U.net.toFixed(1) + ' ms' : U.ms != null ? ' · ' + U.ms.toFixed(1) + ' ms' : '') + ' · journal ' + (D.journal || 0) : U.err ? 'launcher offline' : 'warming…';
      const tg = $1('#x180Tiers'), cn = V180.counts(V180.feed(all, U.filter)); tg.textContent = ''; for (const t of V180.TIERS) tg.appendChild(el('span', 'x180-tier ' + V180.tierCls(t), t + ' ' + cn[t]));
      Mirror.paint(); feed.textContent = ''; U.rows.clear();
      if (!rows.length) { feed.appendChild(el('p', 'x180-empty', U.err || (all.length ? 'No ' + V180.FILTERS.find((f) => f[0] === U.filter)[1] + ' setups right now: the other asset classes still have ' + all.length + '.' : 'Warming Lanes 11–16 (scanners → consensus → Monte Carlo → confluence)…'))); return; }
      const eq = equity(), frag = document.createDocumentFragment();
      for (const r of rows.slice(0, 30)) { const k = r.sym + '|' + r.side; U.rows.set(k, r); frag.appendChild(this.card(r, k, eq)); }
      feed.appendChild(frag);
    },
    card(r, k, eq) {
      const t = V180.tier(r), c = V180.crit(r), lv = V180.levels(r, { equity: eq, riskPct: 1 }), why = V180.why(r, U.ctx), mc = V180.mcOf(r), buy = r.side === 'buy';
      const a = el('article', 'x180-card'); a.setAttribute('role', 'listitem'); a.dataset.k = k;
      const h = el('header', 'x180-ch');
      h.append(el('span', 'x180-tier ' + V180.tierCls(t), t), el('b', 'mono', V180.label(r)), el('span', buy ? 'x180-up' : 'x180-dn', buy ? 'LONG' : 'SHORT'), el('span', 'x180-setup', r.setup || ''), el('span', 'x180-score mono', (r.tierScore || 0) + '/100'));
      const cb = el('span', 'x180-cc'); cb.append(el('span', 'x180-b ok', '✓ ' + c.passed.length + ' passed'), el('span', 'x180-b wait', '… ' + c.pending.length + ' pending')); if (c.failed.length) cb.appendChild(el('span', 'x180-b bad', '✕ ' + c.failed.length + ' failed')); h.appendChild(cb);
      const w = el('div', 'x180-why'); w.appendChild(el('i', null, 'WHY'));
      for (const [n, st, d] of why) { const x = el('span', 'x180-w ' + st); x.append(el('b', null, n), el('span', null, d)); x.title = n + ': ' + d; w.appendChild(x); }
      if (!why.length) w.appendChild(el('span', 'x180-w pending', 'engine readout pending'));
      const g = el('div', 'x180-grid');
      const v6 = el('div', 'x180-cell'); v6.appendChild(el('i', null, '6-BOT CONSENSUS · ' + (r.agree || 0) + '/6 · ' + (r.consensus != null ? (+r.consensus).toFixed(2) : '–')));
      const vb = el('div', 'x180-votes'); for (const [bn, v, yes] of V180.votes(r)) { const s = el('span', 'x180-v ' + (yes ? 'ok' : 'bad')); s.title = bn + ' ' + v.toFixed(2); const bar = el('u'); bar.style.width = Math.round(Math.min(1, Math.abs(v)) * 100) + '%'; s.append(el('em', null, bn.split('-')[0]), bar); vb.appendChild(s); } v6.appendChild(vb);
      const m15 = el('div', 'x180-cell'); m15.append(el('i', null, 'LANE 15 · ' + mc.paths.toLocaleString('en-US') + '-PATH MONTE CARLO'), el('b', 'mono ' + (mc.verdict === 'PASS' ? 'x180-up' : mc.verdict === 'VETO' ? 'x180-dn' : ''), 'P(TP) ' + (mc.pTP != null ? Math.round(mc.pTP * 100) + '%' : '–') + ' · EV ' + (mc.ev != null ? mc.ev.toFixed(2) + 'R' : '–') + ' · CVaR₅ ' + (mc.cvar != null ? mc.cvar.toFixed(2) + 'R' : '–') + ' · slip ' + (mc.slip != null ? mc.slip.toFixed(2) + '%' : '–') + ' · ' + mc.verdict));
      const l16 = el('div', 'x180-cell'); l16.append(el('i', null, 'LANE 16 · 1m–1d CONFLUENCE + JOURNAL RAG'), el('b', 'mono', 'MTF ' + (r.mtf || '–') + ' · journal ' + (r.journalWin != null ? r.journalWin + '% win (' + r.journalN + ' similar)' : 'pending (< 3 similar trades)')));
      g.append(v6, m15, l16);
      const L = el('div', 'x180-lv mono');
      if (lv) for (const [n, v, cls] of [['Entry', V180.px(lv.entry)], ['Stop', V180.px(lv.stop), 'x180-dn'], ['TP1', V180.px(lv.tp1), 'x180-up'], ['TP2', V180.px(lv.tp2), 'x180-up'], ['R:R', lv.rr.toFixed(2)], ['Safe Size', V180.money(lv.usd) + (lv.capped ? ' cap' : '')]]) { const s = el('span'); s.append(el('i', null, n), el('b', cls || '', v)); L.appendChild(s); }
      const bd = el('div', 'x180-crit'); for (const [n, s] of r.criteria || []) bd.appendChild(el('span', 'x180-b ' + (s === 'passed' ? 'ok' : s === 'failed' ? 'bad' : 'wait'), (s === 'passed' ? '✓ ' : s === 'failed' ? '✕ ' : '… ') + n));
      const acts = el('div', 'x180-acts');
      for (const [ak, al, cls] of [['copy', '⧉ Copy Setup'], ['chart', '◰ Open on 1s–1M Chart'], ['mirror', '◇ Paper Mirror'], ['live', '⚡ Send to Live Bot', 'x180-live']]) { const b = el('button', 'btn xs ' + (cls || ''), al); b.type = 'button'; b.dataset.x180a = ak; b.dataset.k = k; acts.appendChild(b); }
      a.append(h, w, g, L, bd, acts); return a;
    },
  };

  /* ══ 2. the four 1-click actions ══ */
  const Act = U.act = {
    copy(r) {
      const lv = V180.levels(r, { equity: equity(), riskPct: 1 }); if (!lv) return T('No price for ' + r.sym + ' yet', 'amb');
      const txt = V180.setupText(r, lv, V180.why(r, U.ctx)) + '\n' + JSON.stringify(V180.setup(r, lv, Date.now())); U.lastCopy = txt; U.copies++;
      try { navigator.clipboard.writeText(txt).then(() => T('Setup copied: ' + V180.label(r) + ' (text + JSON)', 'acc'), () => T('Clipboard blocked: setup kept in memory (Ctrl+K → Copy)', 'amb')); } catch (e) { T('Clipboard unavailable', 'amb'); }
    },
    async chart(r) {
      const lv = V180.levels(r, { equity: equity(), riskPct: 1 }); if (!lv) return T('No price for ' + r.sym + ' yet', 'amb');
      const pl = U.plans[r.sym] = { sym: r.sym, side: r.side, entry: lv.entry, stop: lv.stop, tp1: lv.tp1, tp2: lv.tp2, tier: V180.tier(r), setup: r.setup, usd: lv.usd, at: Date.now() };
      try { setMode(V180.ctxOf(r), r.sym); } catch (e) { return T('Could not load ' + r.sym + ': ' + e.message, 'amb'); }
      if (typeof V177UI !== 'undefined') V177UI.go('copilot'); Depth.mount(); Depth.attach(); inval();
      /* the scan price can be seconds old: if the live chart has moved more than 3 ATR away, the plan is re-anchored (same ATR geometry) */
      let live = 0; for (let i = 0; i < 30 && !(live > 0); i++) { live = pxOf(r.sym); if (!(live > 0)) await new Promise((x) => setTimeout(x, 100)); }
      const re = V180.reanchor(pl, live); if (re) inval();
      T('Entry / Stop / TP1 / TP2 drawn on ' + V180.label(r) + (re ? ' (re-anchored to the live price)' : '') + ': drag any line to adjust', 'acc');
    },
    mirror(r) {
      const lv = V180.levels(r, { equity: equity(), riskPct: 1 }); if (!lv) return T('No price for ' + r.sym + ' yet', 'amb');
      const bk = U.bookSym === r.sym && Date.now() - U.bookAt < 10000 ? U.book : null, qty = lv.usd / lv.entry;
      const o = { id: 'm' + Date.now().toString(36), sym: r.sym, side: r.side, px: lv.entry, qty, left: qty, ahead: V180.aheadOf(bk, r.side, lv.entry), stop: lv.stop, tp1: lv.tp1, tp2: lv.tp2, state: 'queued', t: Date.now(), pnl: 0, tier: V180.tier(r) };
      U.mirror.unshift(o); if (U.mirror.length > 40) U.mirror.pop(); Mirror.paint();
      T('Paper Mirror: ' + (r.side === 'buy' ? 'buy' : 'sell') + ' limit ' + V180.px(lv.entry) + ' ' + V180.label(r) + ' queued' + (o.ahead > 0 ? ' behind ' + o.ahead.toPrecision(3) + ' resting' : ''), 'acc');
    },
    async live(r) {
      const lv = V180.levels(r, { equity: equity(), riskPct: 1 }); if (!lv) return T('No price for ' + r.sym + ' yet', 'amb');
      const mc = V180.mcOf(r), rq = typeof V179 !== 'undefined' ? V179.checkReq({ sym: r.sym, usd: lv.usd, px: lv.entry, atr: Math.abs(lv.entry - lv.stop), equity: equity(), winp: mc.pTP != null ? mc.pTP : 0.5, payoff: lv.rr, slipPct: mc.slip }) : null;
      let j; try { j = await api('/api/lane18/check', rq, 1500); } catch (e) { U.blocked++; return T('Lane 18 Risk Firewall unreachable: nothing was sent', 'amb'); }
      if (!j.out.ok) { U.blocked++; return T('Lane 18 Risk Firewall BLOCKED ' + V180.label(r) + ': ' + j.out.checks.filter((c) => c.state === 'fail').map((c) => c.name).join(', '), 'dn'); }
      const A = typeof V17App !== 'undefined' ? V17App : null, o = { side: r.side, sym: r.sym, usd: Math.round(lv.usd), px: lv.entry, ref: lv.entry, why: 'Alpha Recs ' + V180.tier(r) + ' · ' + (r.setup || '') };
      U.handoffs++; api('/api/lane19/order', { id: 'alpha-' + Date.now().toString(36), sym: r.sym, side: r.side, usd: o.usd, type: 'ALPHA_HANDOFF', mode: (typeof V179UI !== 'undefined' && V179UI.mode) || 'PAPER', verdict: j.out.verdict }).catch(() => {});
      if (!A || !A.fleet) return T('Firewall ALLOW · Live Bot module not loaded', 'amb');
      const m = (A.cfg && A.cfg.mode) || 'paper';
      if (m === 'copilot') { A.queue.push(o); A.fleet.paintQ(); T('Firewall ALLOW → queued in the Live Bot for your 1-click approval', 'acc'); }
      else { const res = await A.fleet.exec(o, false); T(m === 'live' ? (res && res.ok ? 'Firewall ALLOW → signal sent to your armed bot' : 'Live Bot refused the handoff') : 'Firewall ALLOW → Live Bot is in PAPER: simulated fill', res && res.ok ? 'acc' : 'amb'); }
    },
  };

  /* ══ 3. Paper Mirror ledger with L2 queue-position fills ══ */
  const Mirror = U.mirrorL = {
    trade(sym, p, q, side) { for (const o of U.mirror) if (o.state === 'queued' && o.sym === sym) { const f = V180.queueFill(o, { p, q, side }); if (f > 0 && o.left <= 1e-12) this.fill(o, o.px); } },
    tick(sym, p) {
      for (const o of U.mirror) {
        if (o.sym !== sym || !(p > 0)) continue; const s = o.side === 'buy' ? 1 : -1;
        if (o.state === 'queued') { if (s * (o.px - p) > 0) { V180.queueFill(o, { p, q: o.left, side: o.side === 'buy' ? 'sell' : 'buy' }); this.fill(o, o.px); } continue; } // traded through the level
        if (o.state !== 'open' && o.state !== 'runner') continue;
        if (s * (p - o.stop) <= 0) this.close(o, o.stop, o.state === 'runner' ? 'stop (break-even)' : 'stop');
        else if (o.state === 'open' && s * (p - o.tp1) >= 0) { o.pnl += s * (o.tp1 - o.px) * o.qty * 0.5; o.qty *= 0.5; o.stop = o.px; o.state = 'runner'; this.paint(); }
        else if (o.state === 'runner' && s * (p - o.tp2) >= 0) this.close(o, o.tp2, 'TP2');
      }
    },
    fill(o, p) { o.state = 'open'; o.fill = p; o.filledAt = Date.now(); T('Paper Mirror filled ' + o.sym + ' @ ' + V180.px(p) + ' (queue cleared)', 'acc'); this.paint(); },
    close(o, p, why) { const s = o.side === 'buy' ? 1 : -1; o.pnl += s * (p - o.px) * o.qty; o.state = 'closed'; o.why = why; U.realised += o.pnl; T('Paper Mirror ' + o.sym + ' closed at ' + why + ': ' + V180.money(o.pnl), o.pnl >= 0 ? 'acc' : 'amb'); this.paint(); },
    paint() {
      const m = $1('#x180Mir'); if (!m) return; const q = U.mirror.filter((o) => o.state === 'queued'), op = U.mirror.filter((o) => o.state === 'open' || o.state === 'runner');
      m.textContent = 'PAPER MIRROR · ' + q.length + ' queued' + (q.length ? ' (ahead ' + q.reduce((s, o) => s + o.ahead, 0).toPrecision(3) + ')' : '') + ' · ' + op.length + ' open · realised ' + V180.money(U.realised);
      m.classList.toggle('dn', U.realised < 0);
    },
  };

  /* ══ 4. fighter-jet depth pill + overlay (100 % redrawn from the live candles on every chart paint) ══ */
  let SPR = null; const spr = () => { if (SPR) return SPR; const mk = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, 'rgba(' + rgb + ',0.85)'); gr.addColorStop(0.4, 'rgba(' + rgb + ',0.25)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return c; }; return (SPR = { g: mk('245,200,75'), r: mk('239,68,68') }); };
  const Depth = U.depth = {
    load() { try { U.layers = V180.layerState(JSON.parse(localStorage.getItem('x180.layers') || 'null')); } catch (e) { U.layers = V180.layerDefaults(); } },
    save() { try { localStorage.setItem('x180.layers', JSON.stringify(U.layers)); } catch (e) { /* private window */ } },
    set(k, on) { if (!(k in U.layers)) return; U.layers[k] = !!on; this.save(); this.paint(); inval(); },
    count() { return Object.values(U.layers).filter(Boolean).length; },
    host() { const c = ch(); return c && c.cv && c.cv.parentElement; },
    mount() {
      const h = this.host(); if (!h || $1('#x180DP')) return; if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
      const p = el('div', 'x180-dp'); p.id = 'x180DP';
      const b = el('button', 'x180-dpb'); b.type = 'button'; b.id = 'x180DPB'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'x180DPL'); b.title = 'Fighter-jet 2D depth layers (live, locked to every tick)';
      const L = el('div', 'x180-dpl'); L.id = 'x180DPL'; L.hidden = true; L.setAttribute('role', 'group'); L.setAttribute('aria-label', 'Depth layers');
      for (const [k, l] of V180.LAYERS) { const c = el('button', 'x180-dc', l); c.type = 'button'; c.dataset.x180l = k; c.setAttribute('aria-pressed', 'false'); L.appendChild(c); }
      const pat = el('button', 'x180-dc x180-tool', '✎ 3-pt pattern'); pat.type = 'button'; pat.dataset.x180t = 'pattern'; const clr = el('button', 'x180-dc x180-tool', '✕ clear R:R'); clr.type = 'button'; clr.dataset.x180t = 'clear'; L.append(pat, clr);
      p.append(b, L); h.appendChild(p);
      p.addEventListener('click', (e) => {
        if (e.target.closest('#x180DPB')) { L.hidden = !L.hidden; b.setAttribute('aria-expanded', String(!L.hidden)); return; }
        const c = e.target.closest('[data-x180l]'); if (c) { this.set(c.dataset.x180l, !U.layers[c.dataset.x180l]); return; }
        const t = e.target.closest('[data-x180t]'); if (t) { if (t.dataset.x180t === 'pattern') Cockpit.patternMode(); else { delete U.plans[sel()]; U.patterns = U.patterns.filter((x) => x.sym !== sel()); inval(); } }
      });
      this.paint();
    },
    paint() { for (const c of $$1('[data-x180l]')) { const on = !!U.layers[c.dataset.x180l]; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); } const b = $1('#x180DPB'); if (b) b.textContent = '◈ 2D · ' + this.count() + '/' + V180.LAYERS.length; const pt = $1('[data-x180t="pattern"]'); if (pt) pt.classList.toggle('on', !!U.drawPts); },
    attach() {
      const c = ch(); if (!c || !c.overlays) return; if (!c.overlays.includes(this.overlay)) { c.overlays.push(this.overlay); c.invalidate(); }
      /* an Alpha plan on this symbol widens the price axis to include its four lines, so every handle can be grabbed */
      if (!c.rangeHook) c.rangeHook = (lo, hi) => { if (U.drag && U.drag.lo != null) return { lo: U.drag.lo, hi: U.drag.hi }; const pl = U.plans[sel()]; if (!pl) return null; let a = lo, b = hi; for (const k of V180.PLAN_KEYS) { if (pl[k] > 0) { a = Math.min(a, pl[k]); b = Math.max(b, pl[k]); } } return { lo: a, hi: b }; };
    },
    p95() { return V180.p95(U.cost); },
  };
  Depth.overlay = (g, L, c) => {
    const t0 = performance.now(), D = L.D || c.data, a = L.start, b = L.end; if (!D || !(b - a > 2) || !L.py || !L.kx) return;
    const st = U.layers, py = L.py, kx = L.kx, bw = L.bw, x0 = L.Lm, x1 = L.W - L.Rm, y0 = L.y0, y1 = L.y0 + L.mainH - (L.volH || 0), passes = [], s0 = sel();
    const yin = (y) => y >= y0 && y <= y1;
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    /* behind the candles */
    g.globalCompositeOperation = 'destination-over';
    if (st.ghost) { const tfs = V180.ghostTfs(c.tfSec); for (const sec of tfs) { const big = sec === 900; for (const k of V180.ghost(D, a, b, sec)) { const xa = kx(k.i0) - bw / 2, xb = kx(k.i1) + bw / 2, yo = py(k.o), yc = py(k.c), up = k.c >= k.o; g.fillStyle = up ? GA(big ? 0.05 : 0.08) : RA(big ? 0.05 : 0.08); g.fillRect(xa, Math.min(yo, yc), Math.max(1, xb - xa), Math.max(1, Math.abs(yc - yo))); g.strokeStyle = up ? GA(big ? 0.12 : 0.2) : RA(big ? 0.12 : 0.2); g.strokeRect(xa + 0.5, py(k.h) + 0.5, Math.max(1, xb - xa - 1), Math.max(1, py(k.l) - py(k.h))); } } if (tfs.length) passes.push('ghost'); }
    if (st.bands) {
      const B = V180.bands(D, a, b), n = b - a, par = 2, band = (k, alpha) => { g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(kx(a + i), py(B.m[i] + k * B.sd[i])); for (let i = n - 1; i >= 0; i--) g.lineTo(kx(a + i), py(B.m[i] - k * B.sd[i])); g.closePath(); g.fillStyle = GA(alpha); g.fill(); };
      band(2, 0.035); band(1, 0.05);
      g.globalCompositeOperation = 'source-over'; g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(kx(a + i) + par, py(B.m[i]) + par); g.stroke(); // parallax shadow
      g.strokeStyle = GA(0.85); g.lineWidth = 1.3; g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(kx(a + i), py(B.m[i])); g.stroke();
      g.setLineDash([3, 4]); g.lineWidth = 1; for (const k of [-2, -1, 1, 2]) { g.strokeStyle = GA(Math.abs(k) === 1 ? 0.35 : 0.22); g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(kx(a + i), py(B.m[i] + k * B.sd[i])); g.stroke(); } g.setLineDash([]);
      g.globalCompositeOperation = 'destination-over'; passes.push('bands');
    }
    g.globalCompositeOperation = 'source-over';
    /* on top */
    if (st.vdc && bw >= 2) { const cw = Math.max(1, bw * 0.26); for (let i = a; i < b; i++) { const k = D[i], v = k.v || 0; if (!(v > 0)) continue; const d = V180.delta(k) / v, yA = py(Math.max(k.o, k.c)), yB = py(Math.min(k.o, k.c)), h = Math.max(1, (yB - yA) * Math.min(1, Math.abs(d) * 1.4 + 0.15)), ym = (yA + yB) / 2; g.fillStyle = d >= 0 ? GA(0.9) : RA(0.9); g.fillRect(kx(i) - cw / 2, ym - h / 2, cw, h); } passes.push('vdc'); }
    if (st.l2 && U.book && U.bookSym === s0 && Date.now() - U.bookAt < 8000) { const wMax = (x1 - x0) * 0.22; for (const z of V180.shelves(U.book, 8)) { const y = py(z.p); if (!yin(y)) continue; const w = Math.max(6, z.w * wMax), x = x1 - w; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 4, y + 2, w, 4); g.fillStyle = z.side === 'bid' ? GA(0.18 + 0.4 * z.w) : RA(0.18 + 0.4 * z.w); g.fillRect(x, y - 2, w, 4); g.fillStyle = z.side === 'bid' ? GA(0.9) : RA(0.9); g.fillRect(x, y - 2, 2, 4); } passes.push('l2'); }
    if (st.gex) { const A17 = typeof V17App !== 'undefined' ? V17App : null, ls = V180.gexLines(A17 && A17.gex && A17.gex.r); g.font = '10px ' + MONO; g.textAlign = 'right'; g.textBaseline = 'bottom'; for (const z of ls) { const y = py(z.p); if (!yin(y)) continue; const c0 = z.c === 'red' ? RA : GA; g.strokeStyle = c0(0.8); g.lineWidth = 1.2; if (z.dash) g.setLineDash([6, 4]); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]); g.fillStyle = c0(0.95); g.fillText(z.k + ' ' + V180.px(z.p), x1 - 4, y - 2); } if (ls.length) passes.push('gex'); }
    if (st.cone) { const sig = V180.sigma(D, Math.max(a, b - 120), b), k = D[b - 1], xs = kx(b - 1), room = Math.floor((x1 - xs) / Math.max(1, bw)), n = Math.min(24, Math.max(0, room)); if (sig > 0) { const C = V180.cone(k.c, sig, Math.max(1, n)); if (n >= 2) { g.beginPath(); g.moveTo(xs, py(k.c)); for (const z of C) g.lineTo(xs + z.k * bw, py(z.up)); for (let i = C.length - 1; i >= 0; i--) g.lineTo(xs + C[i].k * bw, py(C[i].dn)); g.closePath(); g.fillStyle = GA(0.07); g.fill(); g.strokeStyle = GA(0.4); g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]); } else { const z = C[C.length - 1]; g.strokeStyle = GA(0.6); g.beginPath(); g.moveTo(xs + bw, py(z.up)); g.lineTo(xs + bw, py(z.dn)); g.stroke(); } passes.push('cone'); } }
    if (st.abs) { const S = spr(); g.globalCompositeOperation = 'lighter'; for (const z of V180.absorb(D, a, b, 1.5)) { const r = Math.max(9, bw * 1.8), x = kx(z.i), y = py(z.p); g.globalAlpha = z.kind === 'exh' ? 0.75 : 0.55; g.drawImage(z.side === 'buy' ? S.g : S.r, x - r, y - r, r * 2, r * 2); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; passes.push('abs'); }
    /* the Alpha plan: drag-handle Entry / Stop / TP1 / TP2 */
    const pl = U.plans[s0];
    if (pl) {
      const ye = py(pl.entry), ys = py(pl.stop), y2 = py(pl.tp2); g.fillStyle = RA(0.07); g.fillRect(x0, Math.min(ye, ys), x1 - x0, Math.abs(ys - ye)); g.fillStyle = GA(0.06); g.fillRect(x0, Math.min(ye, y2), x1 - x0, Math.abs(y2 - ye));
      g.font = '600 10.5px ' + MONO; g.textBaseline = 'middle'; g.textAlign = 'left';
      for (const [k, lab, c0, dash] of [['entry', 'ENTRY', GA, false], ['stop', 'STOP', RA, false], ['tp1', 'TP1', GA, true], ['tp2', 'TP2', GA, true]]) {
        const y = py(pl[k]); if (!yin(y)) continue; g.strokeStyle = c0(U.drag && U.drag.key === k ? 1 : 0.85); g.lineWidth = U.drag && U.drag.key === k ? 2 : 1.3; if (dash) g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
        const tx = lab + ' ' + V180.px(pl[k]) + (k === 'tp2' ? ' · R:R ' + V180.rr(pl).toFixed(2) : ''), w = g.measureText(tx).width + 12, hx = x1 - w - 8; g.fillStyle = 'rgba(10,13,18,0.92)'; g.fillRect(hx, y - 8, w, 16); g.strokeStyle = c0(0.9); g.strokeRect(hx + 0.5, y - 7.5, w - 1, 15); g.fillStyle = c0(1); g.fillText(tx, hx + 6, y); g.fillRect(hx - 9, y - 3, 6, 6); // the 6 px square is the drag handle
      }
      passes.push('plan');
    }
    /* 3-point patterns (by candle time, so they ride with the live chart) */
    const ix = (t) => { let lo = a, hi = b - 1; if (!(hi >= lo)) return -1; if (t <= D[lo].t) return lo; if (t >= D[hi].t) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m].t <= t) lo = m; else hi = m; } return lo; };
    for (const pt of U.patterns) { if (pt.sym !== s0) continue; const c0 = pt.side === 'buy' ? GA : RA; g.strokeStyle = c0(pt.hit ? 0.4 : 0.9); g.lineWidth = 1.6; g.beginPath(); pt.pts.forEach((q, j) => { const x = kx(ix(q.t)), y = py(q.p); if (j) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); const y = py(pt.trigger); if (yin(y)) { g.setLineDash([2, 3]); g.beginPath(); g.moveTo(kx(ix(pt.pts[2].t)), y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]); g.font = '10px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = c0(1); g.fillText(pt.name + (pt.hit ? ' · FIRED' : ' · armed'), kx(ix(pt.pts[2].t)) + 4, y - 2); } }
    if (U.drawPts && U.drawPts.length) { g.fillStyle = GA(1); for (const q of U.drawPts) { const x = kx(ix(q.t)), y = py(q.p); g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); } }
    g.restore();
    U.draws++; U.passes = passes; U.lastC = D[b - 1].c; U.lastT = D[b - 1].t; U.cost.push(performance.now() - t0); if (U.cost.length > 240) U.cost.shift();
  };

  /* ══ 5. cockpit: magnifier, drag handles, patterns, Ctrl+V, Shift+P / Shift+F, Ctrl+K, mobile arc ══ */
  const Cockpit = U.cockpit = {
    bound: null,
    bind() {
      const c = ch(), h = Depth.host(); if (!c || !h || this.bound === c.cv) return; this.bound = c.cv;
      const mag = $1('#x180Mag') || (() => { const m = el('div', 'x180-mag mono'); m.id = 'x180Mag'; m.hidden = true; m.setAttribute('aria-hidden', 'true'); for (const k of ['px', 'imb', 'abs', 'pm', 'cd']) { const r = el('div'); r.dataset.x180m = k; r.append(el('i'), el('b', null, '–')); m.appendChild(r); } h.appendChild(m); return m; })();
      const xy = (e) => { const r = c.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const priceAt = (y) => { const L = c.L; return L && L.py && L.hi != null ? V180.priceAt(y, L.py, L.lo, L.hi) : null; };
      /* capture on the host: runs before the chart's own pan / draw handlers */
      h.addEventListener('pointerdown', (e) => {
        if (e.target !== c.cv) return; const [x, y] = xy(e), L = c.L; if (!L || !L.py) return;
        if (U.drawPts) { const p = priceAt(y), i = Math.round((x - L.Lm) / L.bw - 0.5) + (L.end - L.bars), D = L.D; if (!(p > 0) || !D || !D.length) return; U.drawPts.push({ t: D[Math.max(0, Math.min(D.length - 1, i))].t, i, p }); e.stopImmediatePropagation(); e.preventDefault(); if (U.drawPts.length === 3) this.finishPattern(); inval(); return; }
        const pl = U.plans[sel()]; if (!pl || x > L.W - L.Rm) return; const k = V180.nearest(pl, y, L.py, 7); if (!k) return;
        /* the axis holds still while you drag (no feedback loop): freeze the un-padded range the chart pads by 7 % per side */
        const raw = (L.hi - L.lo) / 1.14, cut = (L.hi - L.lo - raw) / 2; U.drag = { key: k, id: e.pointerId, lo: L.lo + cut, hi: L.hi - cut }; try { c.cv.setPointerCapture(e.pointerId); } catch (x2) { /* synthetic */ } e.stopImmediatePropagation(); e.preventDefault(); inval();
      }, true);
      h.addEventListener('pointermove', (e) => {
        if (e.target !== c.cv) return; const [x, y] = xy(e);
        if (U.drag) { const p = priceAt(y); if (p > 0 && V180.drag(U.plans[sel()], U.drag.key, p)) inval(); e.stopImmediatePropagation(); return; }
        const pl = U.plans[sel()]; c.cv.style.cursor = pl && c.L && c.L.py && V180.nearest(pl, y, c.L.py, 7) ? 'ns-resize' : U.drawPts ? 'copy' : '';
        U.mag.x = x; U.mag.y = y; if (!U.mag.on) { U.mag.on = true; U.mag.t0 = performance.now(); U.mag.frames = 0; mag.hidden = false; this.loop(); }
      }, true);
      const up = (e) => { if (U.drag) { U.drag = null; inval(); e.stopImmediatePropagation(); } };
      h.addEventListener('pointerup', up, true); h.addEventListener('pointercancel', up, true);
      c.cv.addEventListener('pointerleave', () => { U.mag.on = false; mag.hidden = true; });
    },
    /* the magnifier runs on rAF at the display's refresh rate (240 Hz panels get 240 updates / s) while the cursor is on the chart */
    loop() {
      const step = () => {
        if (!U.mag.on || tab() !== 'markets') { U.mag.raf = 0; U.mag.on = false; const m = $1('#x180Mag'); if (m) m.hidden = true; return; }
        try { this.magPaint(); } catch (e) { /* chart between datasets */ } U.mag.frames++; U.mag.raf = requestAnimationFrame(step);
      };
      if (!U.mag.raf) U.mag.raf = requestAnimationFrame(step);
    },
    magPaint() {
      const c = ch(), L = c && c.L, m = $1('#x180Mag'); if (!L || !L.D || !L.D.length || !L.py || !m) return; const D = L.D, n = D.length;
      const i = Math.max(L.start, Math.min(L.end - 1, Math.round((U.mag.x - L.Lm) / L.bw - 0.5) + (L.end - L.bars))), p = V180.priceAt(U.mag.y, L.py, L.lo, L.hi);
      const bk = U.bookSym === sel() && Date.now() - U.bookAt < 8000 ? U.book : null, imb = V180.imbalance(bk, 10), pm = V180.pmicro(bk), ar = V180.absRate(D, i, L.start, L.end), cd = V180.countdown(D[n - 1].t, c.tfSec, Date.now());
      const set = (k, lab, v, cls) => { const r = $1(`[data-x180m="${k}"]`, m); if (!r) return; const a = r.firstChild, b = r.lastChild; if (a.textContent !== lab) a.textContent = lab; if (b.textContent !== v) b.textContent = v; b.className = cls || ''; };
      set('px', 'PRICE', V180.px(p)); set('imb', 'BID/ASK IMB', imb == null ? 'L2 n/a' : (imb >= 0 ? '+' : '') + imb.toFixed(1) + '%', imb == null ? '' : imb >= 0 ? 'x180-up' : 'x180-dn');
      set('abs', 'ABSORPTION', ar == null ? '–' : ar.toFixed(2) + '×', ar > 1.5 ? 'x180-up' : ''); set('pm', 'P_MICRO', pm == null ? 'L2 n/a' : V180.px(pm)); set('cd', 'CLOSE IN', V180.fmtMs(cd));
      const W = L.W || 0, x = U.mag.x + 18 + 170 > W ? U.mag.x - 18 - 170 : U.mag.x + 18, y = Math.max(4, Math.min((L.H || 400) - 110, U.mag.y + 18)); m.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    },
    patternMode() { U.drawPts = U.drawPts ? null : []; Depth.paint(); if (U.drawPts) { if (typeof V177UI !== 'undefined' && tab() !== 'markets') V177UI.go('copilot'); T('Pattern mode: click 3 swing points on the chart (Esc cancels)', 'acc'); } inval(); },
    finishPattern() {
      const pts = U.drawPts; U.drawPts = null; Depth.paint(); const P = V180.pattern3(pts);
      if (!P) return T('Those 3 points are not a tradable shape: try swing high / low / high', 'amb');
      U.patterns.push(Object.assign({ sym: sel(), pts: pts.slice().sort((x, y) => x.i - y.i), hit: false, at: Date.now() }, P)); if (U.patterns.length > 20) U.patterns.shift();
      T(P.name + ' armed on ' + sel() + ': radar alert when price ' + (P.side === 'buy' ? 'rises to ' : 'falls to ') + V180.px(P.trigger), 'acc'); inval();
    },
    tick(sym, p) {
      for (const pt of U.patterns) if (!pt.hit && pt.sym === sym && V180.patternHit(pt, p)) {
        pt.hit = true; T('◎ Pattern radar: ' + pt.name + ' fired on ' + sym + ' at ' + V180.px(p), pt.side === 'buy' ? 'acc' : 'amb'); inval();
        try { if (typeof V177UI !== 'undefined' && V177UI.radar) V177UI.radar.pattern = { sym, name: pt.name, side: pt.side, t: Date.now() }; } catch (e) { /* radar optional */ }
      }
    },
    /* Shift+P: add into a winner only (needs +1 ATR more open profit per add, each add half the last, stop → new break-even) */
    pyramid() {
      const s = sel(), p = pxOf(s); if (!(p > 0)) return T('No live price for ' + s + ' yet', 'amb');
      const atr = (() => { try { return typeof tkAtr === 'function' ? tkAtr() : null; } catch (e) { return null; } })() || p * 0.01;
      const F = typeof Futures !== 'undefined' ? Futures : null, fp = F && typeof ST !== 'undefined' && ST.fut && ST.fut.pos ? ST.fut.pos[s] : null, sp = typeof ACC !== 'undefined' && ACC.pos ? ACC.pos[s] : null, st = U.pyr[s] || (U.pyr[s] = { adds: 0, base: 0 });
      try {
        if (fp) { const pos = { qty: fp.qty, cost: fp.qty * fp.entry, side: fp.side === 'short' ? 'sell' : 'buy' }; if (!st.base) st.base = pos.cost; const r = V180.pyramid(pos, p, atr, { adds: st.adds, baseUsd: st.base }); if (!r.ok) return T('Smart pyramid: ' + r.why, 'amb'); F.open(s, fp.side, fp.lev, r.usd / Math.max(1, fp.lev)); ST.fut.pos[s].sl = r.stop; st.adds = r.adds; T('▲ Smart pyramid #' + r.adds + ': +' + V180.money(r.usd) + ' perps · stop → break-even ' + V180.px(r.stop), 'acc'); }
        else if (sp) { const pos = { qty: sp.qty, cost: sp.cost, side: 'buy' }; if (!st.base) st.base = sp.cost; const r = V180.pyramid(pos, p, atr, { adds: st.adds, baseUsd: st.base }); if (!r.ok) return T('Smart pyramid: ' + r.why, 'amb'); if (ACC.cash < r.usd) return T('Smart pyramid: not enough paper cash', 'amb'); const t = ACC.buy(s, p, r.usd, Date.now(), { reason: 'smart pyramid add #' + r.adds, src: 'manual' }); if (t && typeof tradeToast === 'function') tradeToast(t, 'Paper account'); if (ACC.pos[s]) ACC.pos[s].sl = r.stop; st.adds = r.adds; }
        else return T('Smart pyramid: no open position in ' + s, 'amb');
      } catch (e) { return T('Smart pyramid failed: ' + e.message, 'amb'); }
      this.after();
    },
    /* Shift+F: close and reverse in one synchronous step (no await between the legs) */
    flip() {
      const s = sel(), p = pxOf(s); if (!(p > 0)) return T('No live price for ' + s + ' yet', 'amb');
      const F = typeof Futures !== 'undefined' ? Futures : null, fp = F && typeof ST !== 'undefined' && ST.fut && ST.fut.pos ? ST.fut.pos[s] : null, sp = typeof ACC !== 'undefined' && ACC.pos ? ACC.pos[s] : null;
      try {
        if (fp) { const side = fp.side === 'long' ? 'short' : 'long', lev = fp.lev, m = fp.margin; F.close(s, 1, 'atomic flip'); F.open(s, side, lev, Math.min(m, F.acct().cash)); T('⇄ Atomic flip → ' + side.toUpperCase() + ' ' + s + ' (perps, ' + Math.round(lev) + '×)', 'acc'); }
        else if (sp) { const t = ACC.sell(s, p, null, Date.now(), { reason: 'atomic flip', src: 'manual' }); if (!t) return T('Flip failed: could not close ' + s, 'amb'); if (F) { F.open(s, 'short', 1, Math.min(t.usd, F.acct().cash)); T('⇄ Atomic flip: long closed → SHORT ' + s + ' (paper perps 1×)', 'acc'); } else T('⇄ Long closed (no perps paper account to reverse into)', 'amb'); }
        else return T('Atomic flip: no open position in ' + s, 'amb');
      } catch (e) { return T('Atomic flip failed: ' + e.message, 'amb'); }
      U.flips++; U.pyr[s] = { adds: 0, base: 0 }; this.after();
    },
    after() { try { renderPosStrip(); renderTicketMeta(); renderWatch(); chartRefresh(true); saveState(); } catch (e) { /* tab not built */ } },
    /* Ctrl+V anywhere outside a text box: a contract address loads straight onto the chart */
    async hydrate(hit) {
      U.hyd++; if (typeof OC === 'undefined' || !OC.search) return T('On-chain search unavailable', 'amb'); T('Hydrating ' + hit.addr.slice(0, 6) + '…' + hit.addr.slice(-4) + ' (' + (hit.chain === 'evm' ? 'Base / ETH' : 'Solana') + ')…');
      try { const r = await OC.search(hit.addr), s0 = (r || [])[0], id = typeof s0 === 'string' ? s0 : s0 && (s0.id || s0.sym); if (!id) return T('No DEX pool found for that contract', 'amb'); if (typeof openSym === 'function') openSym(id); if (typeof V177UI !== 'undefined') V177UI.go('copilot'); U.hydrated = id; } catch (e) { T('Lookup failed: ' + e.message, 'amb'); }
    },
  };

  /* Ctrl+K: v18 commands ranked by V180.rank; the open → first paint time is recorded (budget 10 ms) */
  const Pal = U.palette = {
    cmds() {
      const top = () => V180.feed((U.data && U.data.rows) || [], U.filter)[0];
      const out = V180.TABS.map(([k, l]) => ({ l: 'Go to ' + l, k: 'tab rail ' + k, f: () => V177UI.go(k) }));
      for (const [k, l] of V180.FILTERS) out.push({ l: 'Alpha Recs: ' + l, k: 'filter alpha ' + k, f: () => { U.filter = k; V177UI.go('alpha'); Alpha.paint(); } });
      for (const [k, l] of V180.LAYERS) out.push({ l: (U.layers[k] ? 'Hide ' : 'Show ') + l, k: '2d depth layer ' + k, f: () => Depth.set(k, !U.layers[k]) });
      out.push({ l: 'Copy top Alpha setup', k: 'clipboard copy setup', f: () => { const r = top(); if (r) Act.copy(r); else T('No setup yet', 'amb'); } }, { l: 'Open top Alpha setup on chart', k: 'chart plan entry stop tp', f: () => { const r = top(); if (r) Act.chart(r); else T('No setup yet', 'amb'); } },
        { l: 'Smart pyramid (Shift+P)', k: 'add scale in winner', f: () => Cockpit.pyramid() }, { l: 'Atomic flip (Shift+F)', k: 'reverse position', f: () => Cockpit.flip() }, { l: 'Draw 3-point pattern alert', k: 'pattern radar draw freehand', f: () => Cockpit.patternMode() },
        { l: 'Clear R:R plan lines', k: 'remove plan entry stop', f: () => { delete U.plans[sel()]; inval(); } }, { l: 'FLATTEN ALL (Shift+Esc)', k: 'panic close everything', f: () => { if (typeof V179UI !== 'undefined') V179UI.strip.flatten(); } });
      return out;
    },
    wrap() {
      if (typeof palRender !== 'function' || palRender._x180) return; const pr = palRender;
      palRender = function () { // eslint-disable-line no-func-assign
        pr.apply(this, arguments); const q = (($1('#palIn') || {}).value || '').trim(), add = V180.rank(q, Pal.cmds(), q ? 8 : 5).map((c) => ({ l: c.l, r: 'v18', f: c.f }));
        if (!add.length || typeof palItems === 'undefined') return; palItems.unshift(...add); const L = $1('#palList'); if (L) L.innerHTML = palItems.map((x, i) => `<div class="it ${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${escT(x.l)}</span><span class="note">${escT(x.r)}</span></div>`).join('');
      };
      palRender._x180 = true;
      /* last = the palette's own open cost (render + its layout + focus); total also counts the layout the live tickers had already left pending */
      if (typeof palOpen === 'function' && !palOpen._x180) { const po = palOpen; palOpen = function () { const tA = performance.now(); void document.body.offsetWidth; const t0 = performance.now(), r = po.apply(this, arguments); void document.body.offsetWidth; const t1 = performance.now(); U.pal.last = t1 - t0; U.pal.total = t1 - tA; U.pal.ms.push(U.pal.last); if (U.pal.ms.length > 50) U.pal.ms.shift(); return r; }; palOpen._x180 = true; } // eslint-disable-line no-func-assign
      const pr2 = palRender; palRender = function () { const t0 = performance.now(), r = pr2.apply(this, arguments); U.pal.render = performance.now() - t0; return r; }; palRender._x180 = true; // eslint-disable-line no-func-assign
    },
  };

  /* mobile one-thumb arc (< 820 px / APK): the v17 arc gains Flip · Pyramid · ⌘K · Alpha on an outer quarter-circle */
  const Arc = U.arc = {
    mount() {
      const arc = $1('#x17Arc'), s = arc && $1('.x17-arcs', arc); if (!s || $1('[data-x180q]', arc)) return; arc.classList.add('x180-arc');
      for (const [k, l] of [['flip', '⇄ Flip'], ['pyr', '▲ Pyramid'], ['pal', '⌘ Cmd'], ['alpha', '◆ Alpha']]) { const b = el('button', 'x180-aq', l); b.type = 'button'; b.dataset.x180q = k; s.appendChild(b); }
      /* one curved thumb column above the ◎ button: 50 px rows (≥ 44 px targets never overlap), bulging toward the thumb's reach */
      const bs = $$1('button', s), n = bs.length; bs.forEach((b, i) => { b.style.setProperty('--x180x', -Math.round(38 * Math.sin((Math.PI * i) / Math.max(1, n - 1))) + 'px'); b.style.setProperty('--x180y', -(84 + i * 50) + 'px'); });
      arc.addEventListener('click', (e) => { const q = e.target.closest('[data-x180q]'); if (!q) return; s.hidden = true; const m = $1('.x17-arcm', arc); if (m) m.setAttribute('aria-expanded', 'false'); ({ flip: () => Cockpit.flip(), pyr: () => Cockpit.pyramid(), pal: () => { if (typeof palOpen === 'function') palOpen(); }, alpha: () => V177UI.go('alpha') })[q.dataset.x180q](); });
    },
  };

  /* the order book the terminal already polls, captured for the L2 shelves / magnifier / queue (no extra requests) */
  const hookBook = () => { const P = typeof Providers !== 'undefined' && Providers.active; if (!P || typeof P.book !== 'function' || P.book._x180) return; const o = P.book; P.book = async function (s) { const bk = await o.apply(this, arguments); try { if (bk && bk.bids && bk.asks) { U.book = bk; U.bookSym = s; U.bookAt = Date.now(); } } catch (e) { /* never break the book */ } return bk; }; P.book._x180 = true; };

  /* ══ boot ══ */
  const tick = () => { try { Alpha.mount(); Depth.mount(); Depth.attach(); Cockpit.bind(); hookBook(); if (innerWidth < 820) Arc.mount(); if (tab() === 'alpha') Alpha.refresh(); } catch (e) { console.warn('v180', e); } };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; document.body.classList.add('x180'); Depth.load(); tick(); Pal.wrap();
    /* warm the hidden palette once at idle (first-render styles + JIT), so even the first Ctrl+K of the session opens warm */
    const warm = () => { try { const P = $1('#palette'); if (P && !P.classList.contains('on') && typeof palRender === 'function') { palRender(); U.pal.warmed = true; } } catch (e) { /* palette not built */ } };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 1500);
    if (typeof Feed !== 'undefined') { if (Feed.tradeL && !Feed._x180t) { Feed._x180t = true; Feed.tradeL.push((s, p, q, side) => { try { Mirror.trade(s, +p, +q, side); } catch (e) { /* ledger only */ } }); } if (Feed.tickL && !Feed._x180k) { Feed._x180k = true; Feed.tickL.push((s, p) => { try { Mirror.tick(s, +p); Cockpit.tick(s, +p); } catch (e) { /* ledger only */ } }); } }
    window.addEventListener('paste', (e) => { if (typing(e.target)) return; let t = ''; try { t = e.clipboardData ? e.clipboardData.getData('text') : ''; } catch (x) { return; } const hit = V180.ca(t); if (!hit) return; e.stopImmediatePropagation(); e.preventDefault(); Cockpit.hydrate(hit); }, true);
    window.addEventListener('keydown', (e) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && U.drawPts) { U.drawPts = null; Depth.paint(); inval(); return; }
      if (!e.shiftKey || tab() !== 'markets') return; const k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); e.stopImmediatePropagation(); Cockpit.pyramid(); } else if (k === 'f') { e.preventDefault(); e.stopImmediatePropagation(); Cockpit.flip(); }
    }, true);
    setInterval(tick, 1000); setInterval(() => { if (tab() === 'alpha' && !document.hidden) Alpha.refresh(); }, 3000);
  };
  U.tick = tick; U.Alpha = Alpha; U.Depth = Depth; U.Cockpit = Cockpit; U.Mirror = Mirror;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b180 = boot; boot = async function () { await _b180.apply(this, arguments); try { V180UI.start(); } catch (e) { console.warn('v180 init', e); } }; }
