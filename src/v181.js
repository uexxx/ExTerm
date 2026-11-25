/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.1 UI (maths in V181, v181core.js). No new panels: the 5-tab rail, the full-bleed Bot Radar / Terminal Brain canvases
   and the two-signal palette are untouched; this file only changes how a symbol reaches the chart.
   · normalize  every handoff (Bot Radar, Alpha Recs, Picks, Tracker, Ctrl+K, watchlist, paste) passes through V181.norm: oc:eth:0x…,
                oc:sol:…, oc:base:…, oc:arb:…, DEX URLs, raw 0x… / Base58 contracts (pool resolved by Lane 9), BTCUSDT → BTC-USD, NVDA
   · hydrate    the candle loader answers from the Lane 9 / 10 cache at once (warm < 25 ms) and refreshes in the background; a slow,
                empty or failed loader is hedged after 180 ms by Lane 9 / 10 + 1s / 5s / 15s synthesis from 1m OHLCV + the live spot,
                so a chart never waits for "the next tick"; a store that has cached bars is seeded synchronously (frame 1)
   · pre-warm   symbols surfaced by the Bot Radar, Alpha Recs, Picks and the Tracker are pre-warmed in Lanes 9 / 10 and the page cache */
const V181UI = (() => {
  const U = { mounted: false, ver: '18.1', cache: new Map(), warmed: new Map(), bgAt: new Map(), opens: [], hydLog: [], last: null, warmBusy: false,
    stats: { hits: 0, miss: 0, seeded: 0, hedged: 0, synth: 0, lane: 0, bg: 0, norm: 0, resolved: 0, prewarmed: 0, warmRounds: 0, fail: 0 } };
  const T = (m, k) => { if (typeof toast === 'function') toast(typeof esc === 'function' ? esc(String(m)) : String(m).replace(/[&<>"']/g, ''), k); };
  const api = (p, b, ms) => (typeof V179UI !== 'undefined' && V179UI.api ? V179UI.api(p, b, ms) : Promise.reject(new Error('launcher API unavailable')));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const onchain = (s) => V181.isOnchain(s);
  const known = (u) => { try { return typeof STOCK_SET !== 'undefined' && STOCK_SET.has(u); } catch (e) { return false; } };
  const K = (sym, sec) => sym + '|' + sec;
  const spot = (sym) => {
    try { const L = typeof Feed !== 'undefined' && Feed.live[sym]; if (L && L.price > 0) return L.price; } catch (e) { /* feed not ready */ }
    try { const p = typeof px === 'function' ? px(sym) : 0; if (p > 0) return p; } catch (e) { /* no quote */ }
    try { const s = typeof OC !== 'undefined' && OC.stats[sym]; if (s && s.price > 0) return s.price; } catch (e) { /* no pool stats */ }
    return 0;
  };

  /* ══ 1. the instant-hydration cache ══ */
  const Hyd = U.hyd = {
    put(sym, sec, rows, meta) {
      if (!rows || rows.length < 2) return; const m = meta || {};
      U.cache.delete(K(sym, sec)); U.cache.set(K(sym, sec), { rows: rows.slice(-1500), at: Date.now(), sample: !!m.sample, src: m.src || '' });
      while (U.cache.size > 400) U.cache.delete(U.cache.keys().next().value);
    },
    get(sym, sec) { const e = U.cache.get(K(sym, sec)); return V181.usable(e, Date.now(), onchain(sym)) ? e : null; },
    /* cached bars for this timeframe, or 1s / 5s / 15s synthesized from cached 1m bars + the live spot */
    instant(sym, sec, n) {
      const e = this.get(sym, sec), now = Date.now();
      if (e) { const r = e.rows.slice(-(n || 300)); r.src = e.src; return { rows: r, age: now - e.at }; }
      if (sec < 60) { const m = this.get(sym, 60); if (m) { const r = V181.synthSub(m.rows, sec, n || 300, spot(sym) || m.rows[m.rows.length - 1].c, now / 1000); if (r.length) { r.src = 'synth 1m → ' + sec + 's'; return { rows: r, age: now - m.at, syn: true }; } } }
      return null;
    },
    /* Lane 9 / 10 answer for one sym|sec (server RAM cache, never waits on upstream); cached when it has bars */
    async lane(sym, sec, ms) { const r = await this.laneRaw(sym, sec, ms); return r && r.rows.length >= 2 ? r : null; },
    async laneRaw(sym, sec, ms) {
      const ln = V181.lane(sym, sec), tf = typeof V179 !== 'undefined' ? V179.tfOf(sec) : null; if (!ln || !tf) return null;
      const j = await api('/api/lane' + ln + '/candles?sym=' + encodeURIComponent(sym) + '&tf=' + tf + '&px=' + (spot(sym) || 0), null, ms || 250);
      const rows = V179.toCandles(j.rows), r = { rows, sample: !!j.sample, warming: !!j.warming && !rows.length, unsupported: !!j.unsupported, src: 'Lane ' + ln + ' · ' + (j.src || '') };
      if (rows.length >= 2) { U.stats.lane++; this.put(sym, sec, rows, r); }
      return r;
    },
    /* a key Lane 9 / 10 has never seen answers "warming" until its process fetched it (≈ 0.3–1 s): poll it inside a budget */
    async laneWait(sym, sec, budget) {
      const t0 = performance.now();
      for (;;) { let r = null; try { r = await this.laneRaw(sym, sec, Math.max(150, budget)); } catch (e) { return null; } if (!r || r.rows.length >= 2) return r && r.rows.length >= 2 ? r : null; if (!r.warming || performance.now() - t0 > budget) return null; await wait(100); }
    },
    /* the hedge: Lane 9 / 10 for this timeframe, else 1s / 5s / 15s synthesized from 1m (cache → lane → history) + the spot.
       Lane samples only exist when the launcher runs --offline (its proxied feeds are simulated too), so the hedge may use them */
    async fallback(sym, sec, n) {
      const ok = (r) => r && r.rows.length >= 2;
      const r = await this.laneWait(sym, sec, 1500).catch(() => null);
      if (ok(r)) { const c = r.rows.slice(-n); c.src = r.src; return c; }
      if (sec >= 60) return null;
      let m1 = (U.cache.get(K(sym, 60)) || {}).rows || null;
      if (!m1) { const r1 = await this.laneWait(sym, 60, 1500).catch(() => null); if (ok(r1)) m1 = r1.rows; }
      if (!m1 && typeof History !== 'undefined' && History.get) { try { m1 = await Promise.race([History.get(sym, 60, 120), wait(1500).then(() => null)]); } catch (e) { m1 = null; } }
      const sp = spot(sym) || (m1 && m1.length ? m1[m1.length - 1].c : 0); if (!(sp > 0) && !(m1 && m1.length)) return null;
      const c = V181.synthSub(m1 || [], sec, n, sp, Date.now() / 1000); if (!c.length) return null; U.stats.synth++; c.src = 'synth 1m → ' + sec + 's'; return c;
    },
    /* late answers land in every open store of that sym|sec (merge keeps the live bar) */
    mergeInto(sym, sec, rows) {
      if (!rows || !rows.length || typeof StoresBySym === 'undefined') return; const ss = StoresBySym.get(sym); if (!ss) return;
      for (const s of ss) if (s.sec === sec) { s.merge(rows); s.loaded = true; s.err = null; }
    },
    bg(sym, sec, n, inner) {
      const k = K(sym, sec), t = U.bgAt.get(k) || 0; if (Date.now() - t < V181.REFRESH_AGE) return; U.bgAt.set(k, Date.now()); if (U.bgAt.size > 600) U.bgAt.delete(U.bgAt.keys().next().value);
      U.stats.bg++; inner(sym, sec, n).then((c) => { if (c && c.length) { this.put(sym, sec, c, { src: c.src || 'loader' }); this.mergeInto(sym, sec, c); } }, () => { /* keep the cached bars */ });
    },
    /* frame 1: a store opened with nothing in it is filled synchronously from the cache (the loader still runs and merges) */
    seed(sym, tf) {
      if (typeof getStore !== 'function' || !sym) return false; const s = getStore(sym, tf); if (!s || s.candles.length) return false;
      const h = this.instant(sym, s.sec, 300); if (!h || !h.rows.length) return false;
      s.merge(h.rows); s.loaded = true; s.err = null; U.stats.seeded++; return true;
    },
  };

  /* ══ 2. the candle loader wrap (outermost: V181 → V179 Lane 9 / 10 → the provider loaders) ══ */
  const wrapCandles = () => {
    if (typeof TFX === 'undefined' || !TFX.candles || TFX._x181) return; try { if (typeof V179UI !== 'undefined' && V179UI.candlesWrap) V179UI.candlesWrap.wrap(); } catch (e) { /* v17.9 absent */ }
    TFX._x181 = true; const inner = U.inner = TFX.candles.bind(TFX);
    TFX.candles = async function (sym, sec, n) {
      n = n || 300;
      if (!V181.instantOk(n)) return inner(sym, sec, n);
      const hit = Hyd.instant(sym, sec, n);
      if (hit) { U.stats.hits++; if (hit.age > V181.REFRESH_AGE || hit.syn) Hyd.bg(sym, sec, n, inner); return hit.rows; }
      U.stats.miss++;
      const p = inner(sym, sec, n).then((c) => { if (c && c.length >= 2) Hyd.put(sym, sec, c, { src: c.src || 'loader' }); return c; });
      const settled = p.then((c) => ({ c }), (e) => ({ e }));
      const fbP = Hyd.fallback(sym, sec, n).catch(() => null); // started at once: Lanes 9 / 10 are local RAM, the request is cheap
      const first = await Promise.race([settled, wait(V181.HEDGE_MS).then(() => null)]);
      if (first && first.c && first.c.length) return first.c;
      /* hedge: whichever answers first with bars, the loader or Lanes 9 / 10 + synthesis; a later loader answer is merged in */
      const win = await new Promise((res) => {
        let left = 2; const done = () => { if (--left === 0) res(null); };
        settled.then((x) => { if (x.c && x.c.length) res({ c: x.c }); else done(); });
        fbP.then((c) => { if (c && c.length) res({ fb: c }); else done(); });
      });
      if (win && win.c) return win.c;
      if (win && win.fb) { U.stats.hedged++; settled.then((x) => { if (x.c && x.c.length) Hyd.mergeInto(sym, sec, x.c); }); return win.fb; }
      const last = await settled; if (last.e) { U.stats.fail++; throw last.e; } return last.c;
    };
  };

  /* ══ 3. one normalizer behind every tab → chart handoff ══ */
  const resolveCA = async (n) => {
    U.stats.resolving = (U.stats.resolving || 0) + 1;
    try { const j = await api('/api/lane9/resolve?q=' + encodeURIComponent(n.addr), null, 4000); if (j && j.sym && typeof OC !== 'undefined' && OC.is(j.sym)) { U.stats.resolved++; return j.sym; } } catch (e) { /* launcher absent / offline */ }
    try { if (typeof OC !== 'undefined' && OC.search) { const r = await OC.search(n.addr), s0 = (r || [])[0], id = typeof s0 === 'string' ? s0 : s0 && (s0.id || s0.sym); if (id) { U.stats.resolved++; return id; } } } catch (e) { /* DexScreener unreachable */ }
    return n.sym; // best guess: Lane 9 resolves a token address to its most liquid pool on the server
  };
  const mark = (sym) => { U.last = { sym, t0: performance.now(), tf: typeof ST !== 'undefined' ? ST.tf : '' }; };
  const wrapHandoffs = () => {
    if (typeof selectSym === 'function' && !selectSym._x181) {
      const o = selectSym;
      selectSym = function (sym, noSave) { // eslint-disable-line no-func-assign
        const n = V181.norm(sym, known);
        if (n && n.kind === 'ca') { T('Resolving contract ' + n.addr.slice(0, 6) + '…' + n.addr.slice(-4) + '…', 'acc'); resolveCA(n).then((s) => { try { setMode('onchain', s); } catch (e) { T('Could not open ' + s, 'amb'); } }); return; }
        const s = n ? n.sym : sym; if (n && s !== sym) U.stats.norm++; mark(s); const r = o.call(this, s, noSave); watchOpen(); return r;
      };
      selectSym._x181 = true;
    }
    if (typeof setMode === 'function' && !setMode._x181) {
      const o = setMode;
      setMode = function (m, sel) { // eslint-disable-line no-func-assign
        if (sel) {
          const n = V181.norm(sel, known);
          if (n && n.kind === 'ca') { T('Resolving contract ' + n.addr.slice(0, 6) + '…' + n.addr.slice(-4) + '…', 'acc'); resolveCA(n).then((s) => { try { o.call(this, 'onchain', s); } catch (e) { T('Could not open ' + s, 'amb'); } }); return; }
          if (n) { if (n.sym !== sel) U.stats.norm++; sel = n.sym; m = V181.modeOf(n); mark(sel); }
        }
        return o.call(this, m, sel);
      };
      setMode._x181 = true;
    }
    if (typeof openSym === 'function' && !openSym._x181) {
      const o = openSym;
      openSym = function (sym) { const n = V181.norm(sym, known); if (n && n.kind === 'ca') { try { showTab('markets'); } catch (e) { /* no tab */ } return selectSym(sym); } return o.call(this, n ? n.sym : sym); }; // eslint-disable-line no-func-assign
      openSym._x181 = true;
    }
    if (typeof ensureSym === 'function' && !ensureSym._x181) {
      const o = ensureSym;
      ensureSym = function (sym) { // eslint-disable-line no-func-assign
        const t0 = performance.now(), s0 = typeof getStore === 'function' && typeof ST !== 'undefined' ? getStore(sym, ST.tf) : null, had = !!(s0 && s0.candles.length);
        const r = o.apply(this, arguments);
        try {
          if (s0) {
            const seeded = !had && Hyd.seed(sym, ST.tf), rec = { sym, tf: ST.tf, warm: had || seeded, src: had ? 'store' : seeded ? 'cache' : 'load', t: Date.now() };
            const fin = () => { if (rec.ms == null && s0.candles.length) { rec.ms = performance.now() - t0; rec.n = s0.candles.length; } };
            fin(); if (rec.ms == null && s0.loading) s0.loading.then(fin, fin);
            U.hydLog.push(rec); if (U.hydLog.length > 300) U.hydLog.shift();
          }
        } catch (e) { /* the loader still runs */ }
        return r;
      };
      ensureSym._x181 = true;
    }
  };
  /* one chart handoff for every surface: normalize → right market → Co-Pilot / Paper chart */
  const openChart = U.openChart = (raw) => {
    const n = V181.norm(raw, known); if (!n) { T('Unknown symbol “' + String(raw).slice(0, 40) + '”', 'amb'); return false; }
    try { if (typeof V177UI !== 'undefined' && V177UI.go) V177UI.go('copilot'); else if (typeof showTab === 'function') showTab('markets'); } catch (e) { /* rail not mounted */ }
    if (n.kind === 'ca') { selectSym(raw); return true; }
    setMode(V181.modeOf(n), n.sym); return true;
  };
  /* 24/7 Bot Radar: double-click a bot (or Enter on the locked bot) opens its coin on the chart; the canvas stays full-bleed, no panel */
  const bindRadar = () => {
    const R = typeof V177UI !== 'undefined' && V177UI.radar, cv = document.querySelector('#tab-botradar canvas'); if (!R || !cv || cv._x181) return; cv._x181 = true;
    const symAt = (e) => { const b = cv.getBoundingClientRect(), h = typeof V177 !== 'undefined' && V177.pick ? V177.pick(R.pts || [], e.clientX - b.left, e.clientY - b.top, 16) : null; const id = h ? h.id : R.lock; if (!id) return ''; const bot = R.pop.list().find((x) => x.id === id); return bot ? bot.sym : ''; };
    cv.addEventListener('dblclick', (e) => { const s = symAt(e); if (s) { U.stats.radarOpens = (U.stats.radarOpens || 0) + 1; openChart(s); } });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || !R.lock || (typeof curTab !== 'undefined' && curTab !== 'botradar') || (e.target && e.target.closest && e.target.closest('input,textarea,select'))) return; const bot = R.pop.list().find((x) => x.id === R.lock); if (bot) { e.preventDefault(); openChart(bot.sym); } });
  };
  /* Ctrl+K: a typed / pasted contract, DEX URL, oc: symbol or pair gets an "Open on chart" command at the top */
  const wrapPalette = () => {
    if (typeof palRender !== 'function' || palRender._x181) return; const o = palRender;
    palRender = function () { // eslint-disable-line no-func-assign
      const r = o.apply(this, arguments);
      try {
        const q = (document.querySelector('#palIn') || {}).value || '', n = q.trim().length >= 2 ? V181.norm(q.trim(), known) : null;
        if (n && (n.kind !== 'stock' || /[-/:]/.test(q)) && typeof palItems !== 'undefined' && !palItems.some((x) => x.l === 'Open ' + n.sym)) {
          palItems.unshift({ l: 'Open on chart · ' + (n.kind === 'ca' ? n.addr.slice(0, 6) + '…' + n.addr.slice(-4) + ' (contract)' : n.sym), r: 'chart', f: () => openChart(n.kind === 'ca' ? n.addr : n.sym) });
          const L = document.querySelector('#palList'); if (L) { L.textContent = ''; palItems.forEach((x, i) => { const d = document.createElement('div'); d.className = 'it' + (i === 0 ? ' on' : ''); d.dataset.i = String(i); const a = document.createElement('span'); a.textContent = x.l; const b = document.createElement('span'); b.className = 'note'; b.textContent = x.r; d.append(a, b); L.appendChild(d); }); }
          if (typeof palIdx !== 'undefined') palIdx = 0;
        }
      } catch (e) { /* the palette keeps its own items */ }
      return r;
    };
    palRender._x181 = true;
  };
  /* open → first bars in the store, measured per handoff (the e2e reads U.opens) */
  const watchOpen = () => {
    const L = U.last; if (!L || L.done || typeof getStore !== 'function' || typeof ST === 'undefined') return;
    const s = getStore(L.sym, ST.tf); if (s && s.candles.length) { L.done = true; L.ms = performance.now() - L.t0; L.n = s.candles.length; U.opens.push(L.ms); if (U.opens.length > 200) U.opens.shift(); }
    else if (performance.now() - L.t0 > 30000) L.done = true;
  };

  /* ══ 4. cross-lane pre-warming: Radar (Lanes 5 / 7) · Alpha Recs + Picks (Lanes 11–16) · Tracker → Lanes 9 / 10 + page cache ══ */
  const surfaced = () => {
    const out = [];
    try { for (const r of (typeof V180UI !== 'undefined' && V180UI.data && V180UI.data.rows) || []) out.push(r.sym); } catch (e) { /* no recs yet */ }
    try { for (const r of (typeof V179UI !== 'undefined' && V179UI.picks && V179UI.picks.data && V179UI.picks.data.rows) || []) out.push(r.sym); } catch (e) { /* no picks */ }
    try { const R = typeof V177UI !== 'undefined' && V177UI.radar; if (R && R.pop) for (const b of R.pop.list().sort((a, b2) => b2.last - a.last).slice(0, 40)) out.push(b.sym); } catch (e) { /* radar idle */ }
    try { for (const b of document.querySelectorAll('[data-x178a="load"][data-v], [data-x179a="load"][data-v]')) out.push(b.dataset.v); } catch (e) { /* no tracker rows */ }
    return out;
  };
  const prewarm = async () => {
    if (U.warmBusy || (typeof document !== 'undefined' && document.hidden)) return; U.warmBusy = true;
    try {
      const now = Date.now(), pick = V181.pickWarm(surfaced(), U.warmed, now, 8); if (!pick.length) return; U.stats.warmRounds++;
      for (const s of pick) U.warmed.set(s, { at: now, ok: false });
      api('/api/lane9/prewarm', { syms: pick, tfs: V181.WARM_TFS }, 2500).catch(() => { /* older launcher */ });
      /* the timeframe each market opens on (its saved pill), plus 1m (the source of 1s / 5s / 15s synthesis) */
      const tfOf = (s) => { try { const m = V181.modeOf(V181.norm(s, known)), t = m === ST.mode ? ST.tf : (ST.mk[m] || {}).tf; return NT.TF[t || '1m'] || 60; } catch (e) { return 60; } };
      let local = 0;
      for (const s of pick) {
        let got = false;
        for (const sec of [...new Set([60, tfOf(s)])]) {
          if (!V181.lane(s, sec) && sec >= 60) continue; let r = null;
          try { r = V181.lane(s, sec) ? await Hyd.laneWait(s, sec, 1500) : null; } catch (e) { /* lane warming */ }
          if (r && !r.sample) got = true;
          /* an offline launcher only has lane samples: crypto / stock pages then pre-load from their own (simulated, local) feed */
          else if ((!r || r.sample) && !onchain(s) && U.inner && local < 2) { local++; try { const c = await U.inner(s, sec, 300); if (c && c.length >= 2) { Hyd.put(s, sec, c, { src: c.src || 'loader' }); got = true; } } catch (e) { /* next round */ } }
          else if (r) got = true;
          await wait(40);
        }
        U.warmed.set(s, { at: Date.now(), ok: got }); if (got) U.stats.prewarmed++;
      }
      while (U.warmed.size > 500) U.warmed.delete(U.warmed.keys().next().value);
    } finally { U.warmBusy = false; }
  };

  /* ══ boot ══ */
  U.start = () => {
    if (U.mounted) return; U.mounted = true; wrapCandles(); wrapHandoffs(); wrapPalette(); bindRadar();
    setInterval(() => { try { wrapCandles(); wrapHandoffs(); wrapPalette(); bindRadar(); } catch (e) { console.warn('v181', e); } }, 1000);
    setInterval(watchOpen, 16); setInterval(() => { prewarm().catch(() => { U.warmBusy = false; }); }, 4000); setTimeout(() => prewarm().catch(() => { /* next round */ }), 1500);
  };
  U.prewarm = prewarm; U.surfaced = surfaced; U.resolveCA = resolveCA;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b181 = boot; boot = async function () { await _b181.apply(this, arguments); try { V181UI.start(); } catch (e) { console.warn('v181 init', e); } }; }
