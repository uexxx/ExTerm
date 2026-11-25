/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.2 UI (maths in V182, v182core.js; HUD pass in the WORKER182_SRC OffscreenCanvas worker). Listeners only, text through
   textContent, strict CSP, two-signal palette (Bullion Gold #F5C84B · Crimson #EF4444 on Obsidian #050608 / #0A0D12).
   · strip      the one floating blur(12px) rail gains: ◎ active-target pill + ★ star (Lane 25 watchlist) · ◫ Portfolio · Z Zen · R Refresh ·
                26-lane mesh pulse dot (self-heal + LIVE readiness) · PIN-gated PAPER | LIVE pill
   · keys       1–5 tabs · Z Zen · R force refresh · P Portfolio & Risk Console · Shift+Esc FLATTEN ALL (v17.9) · Ctrl+K (+ Lane 25 search)
   · atomic tf  every timeframe / symbol switch bumps tfSeq and commits every title in the same frame; late answers for an older seq
                are dropped; the Lane 22 > 4σ outlier guard runs on every candle set (3 sources: the provider, Lanes 9 / 10, live ticks)
   · hud        Shift+Drag ruler, outlier rings and the SYMBOL · TF watermark drawn in a worker (OffscreenCanvas); "Live →" snap pill
   · console    Portfolio & Risk Console (Lane 26): PAPER and LIVE never mixed, 4 KPIs, positions with Close 50 % · Close 100 % ·
                Stop → BE · Chart, FLATTEN ALL, closed trades + SHA-256 audit, CSV / JSON export
   · prewarm    ≥ 80 ms hover on an Alpha Recs card pre-loads its candles, so "Open on chart" paints from RAM
   · evo        closed paper trades → Lane 21 outcome attribution (Stocks EVO / Crypto-DEX EVO, drift-locked, 1-click rollback) */
const V182UI = (() => {
  const U = { mounted: false, ver: '18.2', seq: V182.gen(), tfLog: [], hover: { t: 0, sym: '', warmed: 0, opens: [] }, zen: false, mesh: null, meshAt: 0, stars: [], evo: null, pfBook: 'PAPER', pfOpen: false, lane26: null, lane26ms: null, guard: { calls: 0, fixed: 0, last: [] }, hud: { off: false, w: null, frames: 0, ruler: null, posted: 0 }, acts: 0, outcomes: 0, seenTrades: 0, boot: null, ctl: [] };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const btn = (cls, txt, title) => { const b = el('button', cls, txt); b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; };
  const T = (m, k) => { if (typeof toast === 'function') toast(typeof esc === 'function' ? esc(String(m)) : String(m).replace(/[&<>"']/g, ''), k); };
  const api = (p, b, ms) => (typeof V179UI !== 'undefined' && V179UI.api ? V179UI.api(p, b, ms) : Promise.reject(new Error('launcher API unavailable')));
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sel = () => (typeof ST !== 'undefined' && ST.sel) || '';
  const tf = () => (typeof ST !== 'undefined' && ST.tf) || '';
  const pxOf = (s) => { try { const p = typeof px === 'function' ? px(s) : 0; if (p > 0) return p; } catch (e) { /* no quote */ } return 0; };
  const typing = (t) => !!(t && (t.isContentEditable || (t.closest && t.closest('input,textarea,select,[contenteditable="true"]'))));
  const ch = () => (typeof chart !== 'undefined' && chart ? chart : null);
  const kindOf = (s) => { const n = typeof V181 !== 'undefined' ? V181.norm(s) : null; return n ? n.kind : ''; };
  const canon = (s) => (typeof V181 !== 'undefined' ? V181.canon(s) : s);
  const set = (e, v) => { if (e && e.textContent !== v) e.textContent = v; };
  const save = (k, v) => { try { localStorage.setItem('x182.' + k, JSON.stringify(v)); } catch (e) { /* private window */ } };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem('x182.' + k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };

  /* ══ 1. the strip cluster on the one floating rail ══ */
  const Strip = U.strip = {
    mount() {
      const r = $1('#x177Rail'); if (!r || $1('#x182Cl')) return;
      const c = el('div', 'x182-cl'); c.id = 'x182Cl'; c.setAttribute('role', 'group'); c.setAttribute('aria-label', 'Cockpit controls');
      const tg = btn('x182-tgt mono', '◎ –', 'Active target: open it on the 1s–1M chart'); tg.id = 'x182Tgt'; tg.dataset.x182 = 'target';
      const st = btn('x182-star', '☆', 'Star / unstar the active target (Lane 25 watchlist)'); st.id = 'x182Star'; st.dataset.x182 = 'star';
      const pf = btn('x182-ic mono', '◫', 'Portfolio & Risk Console (P)'); pf.id = 'x182PfB'; pf.dataset.x182 = 'pf';
      const zn = btn('x182-ic mono', 'Z', 'Zen mode (Z): hide every control, keep the canvas'); zn.id = 'x182Zen'; zn.dataset.x182 = 'zen';
      const rf = btn('x182-ic mono', 'R', 'Force refresh (R): new tfSeq, fresh candles, Alpha Recs and mesh'); rf.id = 'x182Ref'; rf.dataset.x182 = 'refresh';
      const ms = btn('x182-mesh', '', '26-lane mesh: checking…'); ms.id = 'x182Mesh'; ms.dataset.x182 = 'mesh'; ms.appendChild(el('i'));
      const md = el('div', 'x182-mode'); md.id = 'x182Mode'; md.setAttribute('role', 'radiogroup'); md.setAttribute('aria-label', 'Global PAPER | LIVE (PIN-gated)');
      for (const m of ['PAPER', 'LIVE']) { const b = btn('x182-m mono', m, m === 'LIVE' ? 'LIVE (needs your PIN)' : 'PAPER: simulated fills only'); b.dataset.x182 = 'mode'; b.dataset.m = m; b.setAttribute('role', 'radio'); md.appendChild(b); }
      c.append(el('span', 'x182-sep'), tg, st, pf, zn, rf, ms, md); r.appendChild(c);
      c.addEventListener('click', (e) => { const b = e.target.closest('[data-x182]'); if (b) Act.run(b.dataset.x182, b); });
      this.paint();
    },
    paint() {
      const s = sel(), t = tf(); set($1('#x182Tgt'), '◎ ' + (s ? (typeof baseOf === 'function' && s.startsWith('oc:') ? baseOf(s) : s) : '–') + ' · ' + t);
      const st = $1('#x182Star'); if (st) { const on = U.stars.includes(canon(s)); set(st, on ? '★' : '☆'); st.classList.toggle('on', on); st.setAttribute('aria-pressed', String(on)); }
      const m = (typeof V179UI !== 'undefined' && V179UI.mode) || 'PAPER'; for (const b of $$1('#x182Mode [data-m]')) { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      const z = $1('#x182Zen'); if (z) { z.classList.toggle('on', U.zen); z.setAttribute('aria-pressed', String(U.zen)); }
      const p = $1('#x182PfB'); if (p) { p.classList.toggle('on', U.pfOpen); p.setAttribute('aria-pressed', String(U.pfOpen)); }
      Mesh.paint();
    },
  };

  /* ══ 2. every control's action (one dispatcher, so the crawler and the hotkeys share it) ══ */
  const Act = U.act = {
    run(k, b) {
      const t0 = performance.now(); U.acts++;
      try {
        if (k === 'target') { const s = sel(); Fast.go('copilot'); later(() => { if (s && typeof selectSym === 'function') selectSym(s); }); }
        else if (k === 'star') Star.toggle(sel());
        else if (k === 'pf') Pf.toggle();
        else if (k === 'zen') Zen.toggle();
        else if (k === 'refresh') Refresh.run();
        else if (k === 'mesh') { Mesh.poll(true); T(Mesh.text(), U.mesh && U.mesh.ok ? 'acc' : 'amb'); }
        else if (k === 'mode') Mode.set(b && b.dataset.m);
      } finally { U.ctl.push(performance.now() - t0); if (U.ctl.length > 200) U.ctl.shift(); Strip.paint(); }
    },
  };
  const Mode = {
    set(m) {
      const S = typeof V179UI !== 'undefined' ? V179UI.strip : null; if (!S) return T('Live Bot module not loaded: PAPER only', 'amb');
      if (m === 'PAPER') { S.setMode('PAPER'); return; }
      const pin = $1('#x179Pin');
      if ((typeof V179UI !== 'undefined' && V179UI.mode) === 'LIVE') return T('LIVE is already unlocked', 'acc');
      if (pin && V179.pinOk(pin.value)) { S.setMode('LIVE'); return; }
      if (typeof V177UI !== 'undefined') V177UI.go('livebot'); setTimeout(() => { const p = $1('#x179Pin'); if (p) p.focus(); }, 0); T('Enter your PIN in the Live Bot strip to unlock LIVE', 'amb');
    },
  };

  /* ══ 2b. frame-0 commits: the click paints its result at once; the heavy re-render follows on the next frame ══
     (rail tabs, the market switch, the ◎ target and the legacy journal used to spend 15–50 ms inside the click handler) */
  const later = (f) => requestAnimationFrame(() => setTimeout(() => { try { f(); } catch (e) { console.warn('v182 deferred', e); } }, 0));
  const Fast = U.fast = {
    pend: 0,
    go(k) {
      const t = typeof V177 !== 'undefined' && V177.ENTRY[k]; if (!t) return;
      for (const b of $$1('#x177Rail [data-x177t]')) { const on = b.dataset.x177t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
      const sec = $1('#tab-' + t); if (sec) { for (const s of $$1('main > .tab.on')) if (s !== sec) s.classList.remove('on'); sec.classList.add('on'); }
      document.body.dataset.x177 = k; const n = ++this.pend; later(() => { if (n === this.pend && typeof V177UI !== 'undefined') V177UI.go(k); });
    },
    /* showTab during a user click: commit the tab now (curTab, nav, section), render on the next frame; programmatic calls stay sync */
    tabSeq: 0, inLater: false, DEFER: '#v155Ov, #v155Lens, #btnPalette',
    wrapShowTab() {
      if (typeof showTab !== 'function' || showTab._x182) return; const o = showTab;
      showTab = function (name) { // eslint-disable-line no-func-assign
        const ev = typeof window !== 'undefined' ? window.event : null;
        if (Fast.inLater || !ev || ev.type !== 'click' || name === 'crypto' || name === 'stocks' || !document.getElementById('tab-' + name)) return o.apply(this, arguments);
        curTab = name; for (const b of $$1('#nav button[data-tab]')) b.classList.toggle('on', b.dataset.tab === name); for (const t of $$1('main > .tab')) t.classList.toggle('on', t.id === 'tab-' + name);
        const n = ++Fast.tabSeq; later(() => { if (n === Fast.tabSeq && curTab === name) { Fast.inLater = true; try { o.call(this, name); } finally { Fast.inLater = false; } } });
      };
      showTab._x182 = true;
    },
    /* the Reach strip (and the phone More sheet that shares REACH_GO): highlight now, switch market / workspace on the next frame */
    wrapReach() {
      const A = typeof V17App !== 'undefined' ? V17App : null, R = A && A.REACH_GO; if (!R || R._x182) return; R._x182 = true;
      const TAB = { Stocks: 'markets', Crypto: 'markets', 'On-Chain': 'markets', Options: 'opts', Futures: 'futs', Screener: 'heat', Pulse: 'pulse', 'Bot Fleet': 'fleet', Academy: 'academy', 'Live Tape': 'markets', 'Whales $25K+': 'markets', Tracker: 'whales', Positions: 'port' };
      for (const k of Object.keys(R)) {
        const f = R[k]; if (typeof f !== 'function') continue;
        R[k] = function () {
          for (const b of $$1('#x17Reach [data-x17r]')) { const on = b.dataset.x17r === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
          const t = TAB[k], sec = t && document.getElementById('tab-' + t); if (sec) { for (const s of $$1('main > .tab.on')) if (s !== sec) s.classList.remove('on'); sec.classList.add('on'); }
          const args = arguments, self = this; later(() => { Fast.inLater = true; try { f.apply(self, args); } finally { Fast.inLater = false; } if (A.paintReach) A.paintReach(); });
        };
      }
    },
    bind() {
      this.wrapShowTab(); this.wrapReach();
      const cx = $1('#x171Ctx'); if (cx && !cx._x182f) { cx._x182f = true; cx.addEventListener('click', (e) => { e.stopImmediatePropagation(); const sec = $1('#tab-markets'); if (sec) { for (const s of $$1('main > .tab.on')) if (s !== sec) s.classList.remove('on'); sec.classList.add('on'); } later(() => { Fast.inLater = true; try { showTab('markets'); } finally { Fast.inLater = false; } }); }, true); }
      /* heavy legacy popovers (they rebuild their whole list on open): the press shows at once (aria-busy), their own handler replays next frame */
      if (!document._x182d) { document._x182d = true; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest(Fast.DEFER); if (!b || b._x182pass) return; e.stopImmediatePropagation(); e.preventDefault(); b.setAttribute('aria-busy', 'true'); later(() => { b._x182pass = true; try { b.click(); } finally { b._x182pass = false; b.removeAttribute('aria-busy'); } }); }, true); }
      /* Live Bot co-pilot queue: Approve leaves the queue at once; the (firewalled) paper / live execution runs on the next frame */
      if (!document._x182q) { document._x182q = true; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-x17f="ok"]'), A = typeof V17App !== 'undefined' ? V17App : null; if (!b || !A || !A.fleet || !Array.isArray(A.queue)) return; e.stopImmediatePropagation(); const o = A.queue.splice(+b.dataset.i, 1)[0]; A.fleet.paintQ(); if (o) later(() => A.fleet.exec(o, true)); }, true); }
      if (!document._x182go) { document._x182go = true; document.addEventListener('submit', (e) => { const f = e.target; if (!f || !f.classList || !f.classList.contains('x175-search')) return; const i = f.querySelector('input'); if (i && !i.value.trim()) { e.preventDefault(); e.stopImmediatePropagation(); i.focus(); T('Type a ticker (NVDA, BTC), a contract (0x… / Base58) or paste a DexScreener / GeckoTerminal link', 'acc'); } }, true); }
      const r = $1('#x177Rail'); if (r && !r._x182f) { r._x182f = true; r.addEventListener('click', (e) => { const b = e.target.closest('[data-x177t]'); if (!b) return; e.stopImmediatePropagation(); this.go(b.dataset.x177t); }, true); }
      const ms = $1('#modeSwitch'); if (ms && !ms._x182f) { ms._x182f = true; ms.addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (!b || typeof ST === 'undefined' || b.dataset.mode === ST.mode) return; e.stopImmediatePropagation(); const m = b.dataset.mode; for (const x of $$1('#modeSwitch button[data-mode]')) x.classList.toggle('on', x === b); later(() => { if (ST.mode !== m) setMode(m); }); }, true); }
    },
  };

  /* ══ 3. Zen mode (Z) ══ */
  const Zen = U.zenM = {
    toggle(on) { U.zen = on == null ? !U.zen : !!on; document.body.classList.toggle('x182-zen', U.zen); save('zen', U.zen); Strip.paint(); const c = ch(); if (c) c.invalidate(); if (on == null) T(U.zen ? 'Zen mode: press Z to bring the controls back' : 'Zen mode off', 'acc'); },
  };

  /* ══ 4. atomic timeframe / symbol switches (tfSeq) + R force refresh ══ */
  const Tf = U.tf = {
    last: '', t0: 0, pend: 0,
    /* capture phase on the pills: the seq is bumped before the app's own handler runs; the document-level bubble listener (after it)
       commits every title in the same frame and records the synchronous switch cost */
    bind() {
      const host = $1('#tfBtns'); if (!host || host._x182) return; host._x182 = true;
      host.addEventListener('click', (e) => { if (e.target.closest('button')) { this.t0 = performance.now(); this.pend = U.seq.bump(); } }, true);
    },
    after() { if (!this.pend) return; const seq = this.pend; this.pend = 0; this.commit(seq); U.tfLog.push({ tf: tf(), sym: sel(), seq, ms: performance.now() - this.t0, chartTf: ch() ? ch().tfSec : null }); if (U.tfLog.length > 60) U.tfLog.shift(); },
    key() { return sel() + '|' + tf(); },
    commit(seq) { this.last = this.key(); Strip.paint(); Hud.post(true); try { if (typeof renderQuote === 'function') renderQuote(); } catch (e) { /* header not built */ } return seq; },
    /* any other path (Ctrl+K, copilot, workspace links, the phone) is caught on the next frame */
    watch() { if (this.key() !== this.last) { U.seq.bump(); this.commit(U.seq.n); } },
  };
  const Refresh = U.refresh = {
    n: 0,
    run() {
      const seq = U.seq.bump(), s = sel(), t = tf(); this.n++;
      try { if (typeof V181UI !== 'undefined') for (const k of [...V181UI.cache.keys()]) if (k.startsWith(s + '|')) V181UI.cache.delete(k); } catch (e) { /* cache absent */ }
      try { if (typeof getStore === 'function') { const st = getStore(s, t); st.loaded = false; st.loading = false; st.load(300).then(() => { if (U.seq.live(seq)) { if (typeof chartRefresh === 'function') chartRefresh(true); } }); } } catch (e) { /* store not ready */ }
      try { if (typeof V180UI !== 'undefined' && V180UI.Alpha) V180UI.Alpha.refresh(true); } catch (e) { /* alpha absent */ }
      Mesh.poll(true); if (U.pfOpen) Pf.render(true); Tf.commit(seq); T('Refreshed ' + s + ' · ' + t + ' (seq ' + seq + ')', 'acc');
    },
  };

  /* ══ 5. Lane 22 outlier guard on every candle set (outermost loader wrap) ══ */
  const Guard = U.guardM = {
    wrap() {
      if (typeof TFX === 'undefined' || !TFX.candles || TFX._x182 || !TFX._x181) return; TFX._x182 = true; const inner = TFX.candles;
      TFX.candles = async function (sym, sec, n) {
        const rows = await inner.apply(this, arguments); if (!Array.isArray(rows) || rows.length < 8) return rows;
        const t0 = performance.now(), refs = [];
        try { const L = typeof V181UI !== 'undefined' ? V181UI.cache.get(sym + '|' + sec) : null; if (L && L.rows && L.rows !== rows && L.rows.length > 4) refs.push(L.rows); } catch (e) { /* no lane cache */ }
        try { const tr = TFX.ring.get(sym); if (tr && tr.length > 20 && TFX.fromTrades) { const b = TFX.fromTrades(tr, sec); if (b.length > 4) refs.push(b); } } catch (e) { /* no ticks */ }
        const g = V182.guardTail(rows, refs, 240); U.guard.calls++; U.guard.fixed += g.fixed.length; U.guard.last.unshift({ sym, sec, n: rows.length, fixed: g.fixed.length, src: 1 + refs.length, ms: performance.now() - t0 }); if (U.guard.last.length > 30) U.guard.last.pop();
        const out = g.rows; out.src = rows.src; return out;
      };
    },
  };

  /* ══ 6. HUD: OffscreenCanvas worker (Shift+Drag ruler, outlier rings, SYMBOL · TF) + "Live →" snap pill ══ */
  const Hud = U.hudM = {
    cv: null, w: null, fb: null, raf: 0, dirty: true,
    mount() {
      const c = ch(), host = c && c.cv && c.cv.parentElement; if (!host || (this.cv && this.cv.isConnected)) return;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const cv = el('canvas', 'x182-hud'); cv.setAttribute('aria-hidden', 'true'); host.appendChild(cv); this.cv = cv;
      const live = btn('x182-live mono', 'Live →', 'Snap back to the live bar'); live.id = 'x182Live'; live.hidden = true; live.addEventListener('click', () => { const c2 = ch(); if (c2) { c2.view.off = 0; c2.invalidate(); } live.hidden = true; }); host.appendChild(live);
      try {
        if (typeof Worker === 'undefined' || typeof WORKER182_SRC === 'undefined' || typeof cv.transferControlToOffscreen !== 'function') throw new Error('no OffscreenCanvas');
        this.url = this.url || URL.createObjectURL(new Blob([WORKER182_SRC], { type: 'text/javascript' })); const w = new Worker(this.url), oc = cv.transferControlToOffscreen();
        w.onmessage = (ev) => { const m = ev.data || {}; if (m.stat) U.hud.stat = m.stat; if (m.ready) U.hud.ready = true; if (m.err) U.hud.err = m.err; };
        w.postMessage({ init: true, canvas: oc }, [oc]); this.w = w; U.hud.off = true;
      } catch (e) { this.fb = cv.getContext('2d'); U.hud.off = false; U.hud.why = e.message; }
      if (!c.overlays.includes(this.overlay)) c.overlays.push(this.overlay);
      this.bindRuler(c, host);
    },
    /* the chart calls this after every paint (pan, zoom, tick): rings + live pill follow the candles */
    overlay: (g, L, c) => { Hud.L = L; Hud.c = c; const lv = $1('#x182Live'), off = c.view && c.view.off > 0; if (lv && lv.hidden === off) lv.hidden = !off; Hud.post(false); },
    state() {
      const c = this.c || ch(), L = this.L, cv = this.cv; if (!cv || !c) return null; const d = Math.max(1, Math.min(3, devicePixelRatio || 1)), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return null;
      const s = { W, H, d, Wd: Math.round(W * d), Hd: Math.round(H * d), seq: U.seq.n, mark: sel() + ' · ' + tf(), rings: [], ruler: null, box: null };
      if (L && L.py && L.kx && L.D) {
        const y1 = L.y0 + L.mainH - (L.volH || 0); s.box = [L.Lm, L.y0, L.W - L.Rm, y1]; s.mark = sel() + ' · ' + tf();
        for (let i = Math.max(L.start, 0); i < L.end && s.rings.length < 40; i++) { const k = L.D[i]; if (k && k.guard) s.rings.push([L.kx(i), L.py(k.h)]); }
        const R = U.hud.ruler; if (R) { const a = R.a, b = R.b || R.a; s.ruler = Object.assign({ x0: a.x, y0: L.py(a.p), x1: b.x, y1: L.py(b.p) }, V182.ruler(a.p, b.p, a.t, b.t, c.tfSec || 60)); }
      }
      return s;
    },
    post(force) {
      if (!this.cv) return; if (this.raf && !force) return;
      const go = () => { this.raf = 0; const s = this.state(); if (!s) return; U.hud.frames++; if (this.w) { this.w.postMessage({ s }); U.hud.posted++; } else if (this.fb) { if (this.cv.width !== s.Wd) this.cv.width = s.Wd; if (this.cv.height !== s.Hd) this.cv.height = s.Hd; V182.hud(this.fb, s); } };
      if (force) { if (this.raf) cancelAnimationFrame(this.raf); go(); } else this.raf = requestAnimationFrame(go);
    },
    /* Shift+Drag on the chart: a temporary measuring ruler (Δ price, %, bars, time); Esc or a plain click clears it */
    bindRuler(c, host) {
      if (host._x182r) return; host._x182r = true;
      const at = (e) => { const r = c.cv.getBoundingClientRect(), pt = c.toTP(e.clientX - r.left, e.clientY - r.top); return pt ? { x: e.clientX - r.left, p: pt.p, t: pt.t } : null; };
      host.addEventListener('pointerdown', (e) => { if (e.target !== c.cv) return; if (!e.shiftKey) { if (U.hud.ruler && !U.hud.ruler.drag) { U.hud.ruler = null; this.post(true); } return; } const a = at(e); if (!a) return; U.hud.ruler = { a, b: null, drag: true }; e.stopImmediatePropagation(); e.preventDefault(); try { c.cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } this.post(true); }, true);
      host.addEventListener('pointermove', (e) => { const R = U.hud.ruler; if (!R || !R.drag || e.target !== c.cv) return; const b = at(e); if (b) { R.b = b; this.post(false); } e.stopImmediatePropagation(); }, true);
      host.addEventListener('pointerup', () => { const R = U.hud.ruler; if (R && R.drag) { R.drag = false; this.post(true); } }, true);
    },
  };

  /* ══ 7. mesh pulse dot (GET /api/mesh: health, self-heal, LIVE readiness) ══ */
  const Mesh = U.meshM = {
    busy: false,
    async poll(force) {
      if (this.busy || (!force && Date.now() - U.meshAt < 5000)) return; this.busy = true; const t0 = performance.now();
      try { U.mesh = await api('/api/mesh', null, 2500); U.mesh.ms = performance.now() - t0; } catch (e) { U.mesh = { ok: false, n: 0, lanes: [], dead: [], err: e.message, ready: { live: false } }; }
      U.meshAt = Date.now(); this.busy = false; this.paint();
    },
    text() { const m = U.mesh; if (!m) return '26-lane mesh: checking…'; if (m.err) return 'Mesh: launcher offline (' + m.err + ')'; return 'Mesh: ' + (m.n - m.dead.length) + '/' + m.n + ' lanes alive (5–26)' + (m.healed ? ' · ' + m.healed + ' self-healed' : '') + ' · LIVE readiness ' + (m.ready.live ? '✓' : '✕ (' + ['pinSet', 'firewall', 'ledger'].filter((k) => !m.ready[k]).join(', ') + ')') + (m.compact ? ' · compact mode' : ''); },
    paint() { const b = $1('#x182Mesh'); if (!b) return; const m = U.mesh, ok = !!(m && m.ok); b.classList.toggle('ok', ok); b.classList.toggle('bad', !!m && !ok); b.title = this.text(); b.setAttribute('aria-label', this.text()); },
  };

  /* ══ 8. Lane 25: star watchlist + Ctrl+K search ══ */
  const Star = U.star = {
    async sync() { try { const j = await api('/api/lane25/watch', { op: 'list' }, 1500); U.stars = j.out.stars || []; } catch (e) { U.stars = load('stars', []); } Strip.paint(); },
    toggle(s) {
      const c = canon(s); if (!c) return; const on = U.stars.includes(c);
      U.stars = on ? U.stars.filter((x) => x !== c) : [c].concat(U.stars).slice(0, 200); save('stars', U.stars); Strip.paint();
      try { if (!on && typeof ST !== 'undefined' && !ST.watch.includes(c)) { ST.watch.unshift(c); if (typeof renderWatch === 'function') renderWatch(); if (typeof saveState === 'function') saveState(); } } catch (e) { /* watchlist not built */ }
      api('/api/lane25/watch', { op: on ? 'remove' : 'add', sym: c }, 1500).then((j) => { U.stars = j.out.stars || U.stars; Strip.paint(); }).catch(() => {});
      T((on ? 'Unstarred ' : '★ Starred ') + c, 'acc');
    },
    wrapPalette() {
      if (typeof palRender !== 'function' || palRender._x182) return; const pr = palRender;
      palRender = function () { // eslint-disable-line no-func-assign
        pr.apply(this, arguments); const q = (($1('#palIn') || {}).value || '').trim(); if (!q || typeof palItems === 'undefined') return;
        /* names / aliases / prefixes only: a typed contract or pair already gets v18.1's "Open on chart" row */
        const hits = V182.search(q, U.stars, 5).filter((h) => h.why !== 'canonical').map((h) => ({ l: (h.star ? '★ ' : '') + 'Open ' + h.sym + (h.name ? ' · ' + h.name : ''), r: 'Lane 25 · ' + h.why, f: () => { if (typeof openSym === 'function') openSym(h.sym); if (typeof V177UI !== 'undefined') V177UI.go('copilot'); } }));
        const add = hits.filter((h) => !palItems.some((x) => x.l === h.l)); if (!add.length) return; palItems.unshift(...add);
        const L = $1('#palList'); if (L) { L.textContent = ''; palItems.forEach((x, i) => { const d = el('div', 'it' + (i === palIdx ? ' on' : '')); d.dataset.i = String(i); d.append(el('span', null, x.l), el('span', 'note', x.r || '')); L.appendChild(d); }); }
      };
      palRender._x182 = true;
    },
  };

  /* ══ 9. hover pre-warm (≥ 80 ms on an Alpha Recs card → candles in RAM before the click) ══ */
  const Hover = U.hoverM = {
    tm: 0,
    bind() {
      const f = $1('#x180Feed'); if (!f || f._x182) return; f._x182 = true;
      f.addEventListener('pointerover', (e) => { const c = e.target.closest('.x180-card'); if (!c || c === this.on) return; this.on = c; clearTimeout(this.tm); const k = c.dataset.k || '', sym = k.split('|')[0]; this.tm = setTimeout(() => this.warm(sym), V182.HOVER_MS); });
      f.addEventListener('pointerleave', () => { clearTimeout(this.tm); this.on = null; });
    },
    warm(sym) {
      const s = canon(sym); if (!s || typeof getStore !== 'function') return; U.hover.sym = s; U.hover.t = performance.now();
      try { const st = getStore(s, tf()); if (!st.loaded && !st.loading) st.load(300); U.hover.warmed++; } catch (e) { /* store */ }
      try { if (typeof Feed !== 'undefined') Feed.subscribe([s]); } catch (e) { /* feed */ }
    },
  };

  /* ══ 10. Portfolio & Risk Console (Lane 26) ══ */
  const ROWS = 16; // recycled row pool
  const Pf = U.pf = {
    root: null, pool: [], top: 0, rows: [], data: null,
    mount() {
      const host = $1('#tab-port'); if (!host || $1('#x182Pf')) return;
      const r = el('div', 'x182-pf'); r.id = 'x182Pf'; r.setAttribute('aria-label', 'Portfolio & Risk Console');
      const hd = el('div', 'x182-pfh'); const h = el('h2', null, 'Portfolio & Risk Console'); const bk = el('div', 'x182-book'); bk.setAttribute('role', 'radiogroup'); bk.setAttribute('aria-label', 'Book (never mixed)');
      for (const m of ['PAPER', 'LIVE']) { const b = btn('x182-bk mono', m, m + ' book only'); b.dataset.x182pf = 'book'; b.dataset.m = m; b.setAttribute('role', 'radio'); bk.appendChild(b); }
      const src = el('span', 'x182-src mono'); src.id = 'x182PfSrc'; hd.append(h, bk, src);
      const k = el('div', 'x182-kpis'); k.id = 'x182Kpis'; for (const [id, l] of [['nlv', 'Net Liquidation Value'], ['bp', 'Available Buying Power'], ['risk', 'Total Open $ Risk to Stop'], ['day', 'Day Realized + Unrealized PnL']]) { const d = el('div', 'x182-kpi'); d.dataset.k = id; d.append(el('b', 'mono', '–'), el('span', null, l)); k.appendChild(d); }
      const vn = el('div', 'x182-ven mono'); vn.id = 'x182Ven';
      const tb = el('div', 'x182-tbl'); tb.id = 'x182Pos'; tb.setAttribute('role', 'table'); tb.setAttribute('aria-label', 'Open positions');
      const head = el('div', 'x182-tr x182-th mono'); head.setAttribute('role', 'row'); for (const l of ['Symbol', 'Side / Size', 'Avg Entry → Mark', 'Shadow Stop / TP1', '$ Risk to Stop', 'Net PnL $ / %', '']) { const c = el('span', null, l); c.setAttribute('role', 'columnheader'); head.appendChild(c); } tb.appendChild(head);
      const body = el('div', 'x182-tb'); body.id = 'x182PosB'; tb.appendChild(body);
      for (let i = 0; i < ROWS; i++) { const row = el('div', 'x182-tr mono'); row.setAttribute('role', 'row'); row.hidden = true; const cells = []; for (let j = 0; j < 6; j++) { const c = el('span'); c.setAttribute('role', 'cell'); cells.push(c); row.appendChild(c); } const a = el('span', 'x182-acts'); for (const [ak, al] of [['c50', 'Close 50%'], ['c100', 'Close 100%'], ['be', 'Stop → BE'], ['chart', 'Chart']]) { const b = btn('btn xs' + (ak === 'c100' ? ' x182-dn' : ''), al); b.dataset.x182pf = ak; a.appendChild(b); } row.appendChild(a); body.appendChild(row); this.pool.push({ row, cells }); }
      const more = el('div', 'x182-more mono'); more.id = 'x182More'; const pv = btn('btn xs ghost', '▲ prev', 'Previous 16 positions'); pv.dataset.x182pf = 'prev'; const nx = btn('btn xs ghost', 'next ▼', 'Next 16 positions'); nx.dataset.x182pf = 'next'; const cnt = el('span'); cnt.id = 'x182Cnt'; more.append(pv, cnt, nx);
      const empty = el('p', 'x182-empty'); empty.id = 'x182Empty';
      const ft = el('div', 'x182-ft'); const fl = btn('btn sm x182-flat', '⚠ FLATTEN ALL (Shift+Esc)', 'Close every position in this book'); fl.dataset.x182pf = 'flat';
      const cs = btn('btn sm ghost', '⇩ CSV', 'Export open + closed trades as CSV'); cs.dataset.x182pf = 'csv'; const js = btn('btn sm ghost', '⇩ JSON', 'Export open + closed trades + audit as JSON'); js.dataset.x182pf = 'json';
      const lg = btn('btn sm ghost', 'Full journal ▸', 'Show the full trade journal, bot accounts and equity curve'); lg.id = 'x182Leg'; lg.dataset.x182pf = 'legacy'; lg.setAttribute('aria-expanded', 'false');
      ft.append(fl, cs, js, lg);
      const au = el('div', 'x182-aud'); au.id = 'x182Aud'; const ah = el('h3', null, 'Closed Trades & SHA-256 Audit'); const al = el('div', 'x182-al mono'); al.id = 'x182AudL'; const ab = el('div', 'x182-ab mono'); ab.id = 'x182AudB'; au.append(ah, al, ab);
      const evo = el('div', 'x182-evo mono'); evo.id = 'x182Evo';
      r.append(hd, k, vn, tb, more, empty, ft, au, evo); host.insertBefore(r, host.firstChild); this.root = r;
      r.addEventListener('click', (e) => { const b = e.target.closest('[data-x182pf]'); if (!b) return; const row = b.closest('.x182-tr'), i = row ? this.pool.findIndex((p) => p.row === row) : -1; this.act(b.dataset.x182pf, i >= 0 ? this.rows[this.top + i] : null, b); });
      document.body.classList.toggle('x182-pfleg', !!load('pfleg', false));
      /* the legacy portfolio only renders while "Full journal" is open (it is hidden otherwise: rendering it cost ~15 ms per visit) */
      const leg = () => document.body.classList.contains('x182-pfleg');
      if (typeof TABS !== 'undefined' && TABS.port && !TABS.port._x182) { const o = TABS.port; TABS.port = { show: () => { U.pfOpen = true; Strip.paint(); try { if (leg()) o.show(); else { ST.pfSeen = Date.now(); if (typeof pfBadge === 'function') pfBadge(); } } catch (e) { /* legacy */ } this.render(true); }, render: () => { try { if (leg()) o.render(); } catch (e) { /* legacy */ } this.render(); }, _x182: true }; }
    },
    toggle() { if (tab() === 'port') { U.pfOpen = false; Fast.go('copilot'); } else { U.pfOpen = true; if (typeof showTab === 'function') showTab('port'); } Strip.paint(); },
    legacy(on) { const v = on == null ? !document.body.classList.contains('x182-pfleg') : !!on; document.body.classList.toggle('x182-pfleg', v); save('pfleg', v); const b = $1('#x182Leg'); if (b) { set(b, v ? 'Full journal ▾' : 'Full journal ▸'); b.setAttribute('aria-expanded', String(v)); } if (v) later(() => { if (typeof renderPortfolio === 'function') renderPortfolio(true); }); },
    /* ── the two books, built from their own sources only ── */
    paper() {
      const pos = [], now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0); let realized = 0, cash = 0, lev = 1;
      const cashBy = {};
      try { cash += ACC.cash; cashBy['spot cash'] = ACC.cash; for (const s in ACC.pos) { const p = ACC.pos[s]; if (!(p.qty > 0)) continue; pos.push({ sym: s, side: 'long', qty: p.qty, entry: p.cost / p.qty, mark: pxOf(s) || p.cost / p.qty, stop: p.sl || 0, tp1: p.tp || 0, venue: kindOf(s) === 'stock' ? 'paper-equities' : kindOf(s) === 'onchain' ? 'paper-onchain' : 'paper-spot', mode: 'PAPER', src: 'spot' }); } for (const t of ACC.trades) if (t.ts >= d0.getTime() && t.pnl != null) realized += t.pnl; } catch (e) { /* account not built */ }
      try { if (typeof Futures !== 'undefined') { const a = Futures.acct(); cash += a.cash; cashBy['perps cash'] = a.cash; for (const s in a.pos) { const p = a.pos[s], m = Futures.mark(s) || p.entry; pos.push({ sym: s, side: p.side === 'short' ? 'short' : 'long', qty: p.qty, entry: p.entry, mark: m, stop: p.sl || 0, tp1: p.tp || 0, margin: p.margin, lev: p.lev, venue: 'paper-perps', mode: 'PAPER', src: 'perps' }); } for (const t of a.trades || []) if ((t.ts || 0) >= d0.getTime() && t.pnl != null) realized += t.pnl; lev = 1; } } catch (e) { /* perps not built */ }
      return { cash, cashBy, pos, realizedDay: realized, lev, at: now };
    },
    live() {
      const C = typeof V163C !== 'undefined' ? V163C : null, pos = [];
      if (C && C.botPos) for (const k in C.botPos) { const q = +C.botPos[k]; if (!q) continue; const s = canon(k.includes('-') || k.startsWith('OC:') ? k : k + '-USD'), fs = (C.fills || []).filter((f) => f.sym === k), wq = fs.reduce((a, f) => a + f.qty, 0), avg = wq ? fs.reduce((a, f) => a + f.qty * f.price, 0) / wq : pxOf(s); pos.push({ sym: s, side: q < 0 ? 'short' : 'long', qty: Math.abs(q), entry: avg, mark: pxOf(s) || avg, stop: 0, tp1: 0, venue: 'your-bot', mode: 'LIVE', src: 'bot' }); }
      return { cash: 0, cashKnown: false, pos, realizedDay: 0, lev: 1 };
    },
    compute() { const t0 = performance.now(), books = { PAPER: this.paper(), LIVE: this.live() }, a = V182.agg(books); a.ms = performance.now() - t0; a.raw = books; return a; },
    async lane() {
      if (this.busy) return; this.busy = true; const b = this.data && this.data.raw; if (!b) { this.busy = false; return; }
      const strip = (bk) => ({ cash: bk.cash, realizedDay: bk.realizedDay, lev: bk.lev, pos: bk.pos.map((p) => ({ sym: p.sym, side: p.side, qty: p.qty, entry: p.entry, mark: p.mark, stop: p.stop, margin: p.margin, venue: p.venue, mode: p.mode })) });
      const t0 = performance.now(); try { const j = await api('/api/lane26/agg', { books: { PAPER: strip(b.PAPER), LIVE: strip(b.LIVE) } }, 2000); U.lane26 = j.out; U.lane26ms = j.laneMs != null ? j.laneMs : performance.now() - t0; } catch (e) { U.lane26 = null; U.lane26err = e.message; }
      this.busy = false; if (tab() === 'port') this.paintSrc();
    },
    render(force) {
      if (!this.root) this.mount(); if (!this.root || tab() !== 'port') return;
      const now = Date.now(); if (!force && now - (this.at || 0) < 900) return; this.at = now;
      try { this.data = this.compute(); } catch (e) { this.data = null; set($1('#x182PfSrc'), 'refused: ' + e.message); return; }
      const B = this.data.books[U.pfBook], raw = this.data.raw[U.pfBook]; this.rows = raw.pos;
      for (const b of $$1('[data-x182pf="book"]', this.root)) { const on = b.dataset.m === U.pfBook; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      const kp = (k, v, cls) => { const d = $1(`[data-k="${k}"]`, this.root); if (!d) return; set(d.firstChild, v); d.classList.toggle('dn', cls === 'dn'); d.classList.toggle('up', cls === 'up'); };
      const known = U.pfBook === 'PAPER' || raw.cashKnown;
      kp('nlv', known ? V182.money(B.nlv) : V182.money(B.gross) + ' in positions'); kp('bp', known ? V182.money(B.buyingPower) : 'from your bot'); kp('risk', V182.money(B.riskToStop) + (B.noStop ? ' · ' + B.noStop + ' w/o stop' : ''), B.noStop ? 'dn' : ''); kp('day', V182.money(B.dayPnl), B.dayPnl < 0 ? 'dn' : B.dayPnl > 0 ? 'up' : '');
      const ven = Object.entries(B.venues).map(([k, v]) => k + ' ' + V182.money(v)).join(' · '); const sec = B.sectors.filter((x) => x.breach).map((x) => x.sector + ' ' + x.pct.toFixed(0) + '% > 25% cap');
      const cb = Object.entries(raw.cashBy || {}).map(([k, v]) => k + ' ' + V182.money(v)).join(' · ');
      set($1('#x182Ven'), U.pfBook + ' book · ' + (cb ? cb + ' · ' : '') + (ven || 'no open positions') + ' · VaR₉₅ ' + V182.money(B.var95) + (sec.length ? ' · ⚠ ' + sec.join(', ') : ''));
      $1('#x182Ven').classList.toggle('dn', sec.length > 0);
      this.top = Math.max(0, Math.min(this.top, Math.max(0, this.rows.length - ROWS))); this.paintRows(); this.paintSrc(); this.audit(); Evo.paint();
      const em = $1('#x182Empty'); em.hidden = this.rows.length > 0; set(em, U.pfBook === 'LIVE' ? 'No LIVE positions reported by your bot (the LIVE book only shows fills your bot ACKed: PAPER is never mixed in).' : 'No open PAPER positions. Use the ticket on Co-Pilot / Paper, or an Alpha Recs Paper Mirror.');
      if (now - (this.laneAt || 0) > 3000) { this.laneAt = now; this.lane(); }
    },
    paintSrc() { const d = this.data; set($1('#x182PfSrc'), 'Lane 26 ' + (U.lane26ms != null ? U.lane26ms.toFixed(1) + ' ms' : U.lane26err ? 'offline (page maths)' : '…') + ' · page ' + (d ? d.ms.toFixed(2) : '–') + ' ms · ' + (U.lane26 && d && Math.abs(U.lane26.books[U.pfBook].var95 - d.books[U.pfBook].var95) < 0.02 ? 'VaR matches' : 'isolated books')); },
    paintRows() {
      const n = this.rows.length;
      for (let i = 0; i < ROWS; i++) {
        const P = this.pool[i], p = this.rows[this.top + i]; P.row.hidden = !p; if (!p) continue; const v = V182.posVal(p), k = kindOf(p.sym), cost = p.qty * p.entry, pct = cost ? (v.upnl / cost) * 100 : 0;
        set(P.cells[0], (typeof baseOf === 'function' && p.sym.startsWith('oc:') ? baseOf(p.sym) : p.sym) + ' · ' + p.venue);
        set(P.cells[1], (p.side === 'short' ? 'SHORT ' : 'LONG ') + (+p.qty).toPrecision(5) + (p.lev > 1 ? ' · ' + Math.round(p.lev) + '×' : ''));
        set(P.cells[2], V182.px(p.entry, k) + ' → ' + V182.px(p.mark, k)); set(P.cells[3], (p.stop ? V182.px(p.stop, k) : 'no stop') + ' / ' + (p.tp1 ? V182.px(p.tp1, k) : '–'));
        set(P.cells[4], V182.money(v.risk)); set(P.cells[5], V182.money(v.upnl) + ' · ' + V182.pct(pct)); P.cells[5].className = v.upnl < 0 ? 'x182-dn' : 'x182-up'; P.cells[3].className = p.stop ? '' : 'x182-dn';
        for (const b of $$1('button', P.row)) b.disabled = U.pfBook === 'LIVE' && b.dataset.x182pf !== 'chart';
      }
      set($1('#x182Cnt'), n > ROWS ? (this.top + 1) + '–' + Math.min(n, this.top + ROWS) + ' of ' + n : n + ' open'); $1('#x182More').hidden = n <= ROWS;
    },
    audit() {
      const tr = (() => { try { return ACC.trades.filter((t) => t.pnl != null).slice(-40).reverse(); } catch (e) { return []; } })(), L = $1('#x182AudL'), B = $1('#x182AudB'); if (!L) return;
      if (U.pfBook === 'LIVE') { const f = (typeof V163C !== 'undefined' && V163C.fills) || []; L.textContent = ''; for (const x of f.slice(0, 12)) L.appendChild(el('div', null, new Date(x.ts || Date.now()).toLocaleTimeString() + '  ' + x.sym + '  ' + x.side.toUpperCase() + ' ' + x.qty + ' @ ' + V182.px(x.price) + '  ACK ' + x.ack + ' ms')); if (!f.length) L.appendChild(el('div', null, 'no LIVE fills yet')); }
      else { const key = tr.length + ':' + (tr[0] ? tr[0].ts : 0); if (L._k !== key) { L._k = key; L.textContent = ''; for (const t of tr.slice(0, 12)) { const d = el('div', t.pnl < 0 ? 'x182-dn' : 'x182-up', new Date(t.ts).toLocaleTimeString() + '  ' + t.sym + '  ' + t.side.toUpperCase() + ' @ ' + V182.px(t.price, kindOf(t.sym)) + '  ' + V182.money(t.pnl) + '  ' + (t.reason || '')); L.appendChild(d); } if (!tr.length) L.appendChild(el('div', null, 'no closed PAPER trades yet')); } }
      const chain = this.chain(tr); set(B, 'local chain ' + chain.slice(0, 16) + '… over ' + tr.length + ' closed trades · Lane 19 ledger ' + (U.ledger ? (U.ledger.ok ? '✓ ' + U.ledger.n + ' entries verified' : '✕ broken at ' + U.ledger.badAt) : 'checking…'));
      if (!this.ledAt || Date.now() - this.ledAt > 10000) { this.ledAt = Date.now(); api('/api/lane19/ledger', null, 2000).then((j) => { U.ledger = j.out; }).catch(() => { U.ledger = null; }); }
    },
    chain(tr) { let h = '0'.repeat(64); for (const t of tr.slice().reverse()) h = V182.sha256(h + '|' + [t.ts, t.sym, t.side, t.qty, t.price, t.pnl].join('|')); return h; },
    exportRows() { const d = this.data || this.compute(), tr = (() => { try { return ACC.trades.slice(-1000); } catch (e) { return []; } })(); return { open: d.raw[U.pfBook].pos, closed: U.pfBook === 'PAPER' ? tr : (typeof V163C !== 'undefined' && V163C.fills) || [], book: U.pfBook, kpis: d.books[U.pfBook], chain: this.chain(tr.filter((t) => t.pnl != null).slice(-40).reverse()), at: new Date().toISOString(), version: '18.2' }; },
    act(k, p, b) {
      const t0 = performance.now(); U.acts++;
      try {
        if (k === 'book') { U.pfBook = b.dataset.m === 'LIVE' ? 'LIVE' : 'PAPER'; this.top = 0; this.render(true); return; }
        if (k === 'prev') { this.top = Math.max(0, this.top - ROWS); this.paintRows(); return; }
        if (k === 'next') { this.top = Math.min(Math.max(0, this.rows.length - ROWS), this.top + ROWS); this.paintRows(); return; }
        if (k === 'legacy') { this.legacy(); return; }
        if (k === 'flat') { this.flatten(); return; }
        if (k === 'csv' || k === 'json') { const x = this.exportRows(), nm = 'exterm-' + x.book.toLowerCase() + '-portfolio-' + x.at.slice(0, 10);
          /* the file is built now; the browser's download machinery (≈ 200 ms on the first save) runs on the next frame */
          if (k === 'json') { const body = JSON.stringify(x, null, 2); later(() => download(nm + '.json', body, 'application/json')); }
          else { const body = V182.csv(x.open.map((q) => Object.assign({ state: 'open' }, q)).concat(x.closed.map((t) => ({ state: 'closed', sym: t.sym, side: t.side, qty: t.qty, entry: t.price, mark: '', stop: '', pnl: t.pnl, ts: t.ts ? new Date(t.ts).toISOString() : '', reason: t.reason || '' }))), [['state', 'State'], ['sym', 'Symbol'], ['side', 'Side'], ['qty', 'Qty'], ['entry', 'Entry / Price'], ['mark', 'Mark'], ['stop', 'Stop'], ['pnl', 'PnL'], ['ts', 'Time'], ['reason', 'Reason'], ['venue', 'Venue']]) + '# sha256-chain,' + x.chain + '\r\n'; later(() => download(nm + '.csv', body, 'text/csv')); }
          T('Exported the ' + x.book + ' book (' + k.toUpperCase() + ', SHA-256 chain ' + x.chain.slice(0, 10) + '…)', 'acc'); return; }
        if (!p) return;
        if (k === 'chart') { if (typeof openSym === 'function') openSym(p.sym); if (typeof V177UI !== 'undefined') V177UI.go('copilot'); return; }
        if (p.mode !== 'PAPER') return T('LIVE positions are managed by your bot: ExTerm never sends LIVE exits from here', 'amb');
        const now = Date.now(), m = pxOf(p.sym) || p.mark;
        if (k === 'c50' || k === 'c100') {
          const f = k === 'c50' ? 0.5 : 1;
          if (p.src === 'spot') { const t = ACC.sell(p.sym, m, V182.closeQty(p, f), now, { reason: 'console close ' + Math.round(f * 100) + '%', src: 'manual' }); if (t && typeof tradeToast === 'function') tradeToast(t, 'Paper account'); }
          else if (p.src === 'perps') Futures.close(p.sym, f, 'console close ' + Math.round(f * 100) + '%');
          ledger(p, k === 'c50' ? 'CLOSE_50' : 'CLOSE_100');
        } else if (k === 'be') {
          const r = V182.beStop(Object.assign({}, p, { mark: m })); if (!r.ok) return T('Stop → BE: ' + r.why, 'amb');
          if (p.src === 'spot' && ACC.pos[p.sym]) ACC.pos[p.sym].sl = r.stop; else if (p.src === 'perps' && Futures.acct().pos[p.sym]) Futures.acct().pos[p.sym].sl = r.stop;
          ledger(p, 'STOP_BE'); T('Stop moved to break-even ' + V182.px(r.stop, kindOf(p.sym)) + ' on ' + p.sym, 'acc');
        }
        try { if (typeof saveState === 'function') saveState(); if (typeof renderPosStrip === 'function') renderPosStrip(); } catch (e) { /* tab */ }
        this.render(true);
      } finally { U.ctl.push(performance.now() - t0); if (U.ctl.length > 200) U.ctl.shift(); }
    },
    flatten() {
      if (U.pfBook === 'LIVE') { if (typeof V179UI !== 'undefined') V179UI.strip.flatten(); T('FLATTEN ALL sent through the Live Bot path (Lane 19 logged)', 'amb'); return; }
      const ps = this.paper().pos; let n = 0; const now = Date.now();
      for (const p of ps) { try { if (p.src === 'spot') { if (ACC.sell(p.sym, pxOf(p.sym) || p.mark, null, now, { reason: 'FLATTEN ALL', src: 'manual' })) n++; } else if (p.src === 'perps') { if (Futures.close(p.sym, 1, 'FLATTEN ALL')) n++; } } catch (e) { /* next */ } }
      if (typeof V179UI !== 'undefined') try { V179UI.strip.flatten(); } catch (e) { /* strip */ }
      try { if (typeof saveState === 'function') saveState(); } catch (e) { /* state */ }
      T('FLATTEN ALL: ' + n + ' PAPER position' + (n === 1 ? '' : 's') + ' closed', n ? 'acc' : 'amb'); this.render(true);
    },
  };
  const ledger = (p, type) => api('/api/lane19/order', { id: 'pf-' + Date.now().toString(36), sym: p.sym, side: type, usd: Math.round(p.qty * (p.mark || p.entry)), type, mode: p.mode, venue: p.venue, verdict: 'n/a' }, 1500).catch(() => {});

  /* ══ 11. Lane 21 Auto-Evolution: closed paper trades → outcome attribution; status + 1-click rollback ══ */
  const Evo = U.evoM = {
    async poll() { try { const j = await api('/api/lane21/status', null, 1500); U.evo = j.out; } catch (e) { U.evo = null; } if (tab() === 'port') this.paint(); },
    feed() {
      let tr; try { tr = ACC.trades; } catch (e) { return; } if (!tr) return; if (U.seenTrades === 0 && tr.length) { U.seenTrades = tr.length; return; }
      for (let i = U.seenTrades; i < tr.length; i++) {
        const t = tr[i]; if (t.pnl == null) continue; const risk = Math.max(1, (t.qty || 0) * (t.price || 0) * 0.01), r = Math.max(-10, Math.min(20, t.pnl / risk)), why = String(t.reason || '').toLowerCase();
        const exit = /stop/.test(why) ? 'stop' : /tp2|take-profit|target 2/.test(why) ? 'tp2' : /tp1|target/.test(why) ? 'tp1' : 'manual';
        U.outcomes++; api('/api/lane21/outcome', { sym: t.sym, book: V182.evoBookOf(t.sym), r, exit, score: 0.6, mode: 'PAPER' }, 1500).then((j) => { if (j.out.evolved) { T('Auto-Evolution: ' + j.out.book + ' EVO → v' + j.out.evolved.ver + ' (' + (j.out.evolved.notes[0] || 'bounded step') + ')', 'acc'); this.poll(); } }).catch(() => {});
      }
      U.seenTrades = tr.length;
    },
    paint() {
      const e = $1('#x182Evo'); if (!e) return; const E = U.evo; e.textContent = '';
      if (!E) { e.appendChild(el('span', null, 'Auto-Evolution (Lanes 14 & 21): launcher offline')); return; }
      for (const b of ['stocks', 'crypto']) { const x = E[b], s = el('span', 'x182-evob'); s.append(el('b', null, (b === 'stocks' ? 'Stocks EVO' : 'Crypto/DEX EVO') + ' v' + x.ver), el('span', null, ' risk ' + x.params.riskPct + '% · stop ' + x.params.atrStop + '×ATR · TP2 ' + x.params.tp2R + 'R · min score ' + x.params.minScore + ' · ' + x.pending + '/10 outcomes')); const rb = btn('btn xs ghost', '↶ Rollback', 'Roll ' + b + ' EVO back one generation'); rb.dataset.x182evo = b; rb.disabled = !x.canRollback; s.appendChild(rb); e.appendChild(s); }
      e.appendChild(el('span', 'x182-note', 'drift-locked: ≤ 10 % of range per generation, inside the Lane 18 firewall bounds'));
    },
    bind() { const e = $1('#x182Evo'); if (!e || e._x182) return; e._x182 = true; e.addEventListener('click', async (ev) => { const b = ev.target.closest('[data-x182evo]'); if (!b) return; try { const j = await api('/api/lane21/rollback', { book: b.dataset.x182evo }, 2000); T(j.out.book + ' EVO rolled back to v' + j.out.ver, 'acc'); } catch (x) { T('Rollback: ' + x.message, 'amb'); } this.poll(); }); },
  };

  /* ══ 12. Lane 24 warm-boot snapshot (cockpit state → the next launch or a paired phone) ══ */
  const Boot = U.bootM = {
    snap() { return { zen: U.zen, stars: U.stars.slice(0, 50), filter: typeof V180UI !== 'undefined' ? V180UI.filter : 'all', book: U.pfBook, sel: sel(), tf: tf() }; },
    async load() { const t0 = performance.now(); try { const j = await api('/api/lane24/boot', null, 1500), s = j.out.snap || {}; U.boot = { ms: performance.now() - t0, at: j.out.at }; if (Array.isArray(s.stars) && !U.stars.length) U.stars = s.stars.filter((x) => typeof x === 'string').slice(0, 200); if (s.book === 'LIVE' || s.book === 'PAPER') U.pfBook = s.book; Strip.paint(); } catch (e) { U.boot = { ms: performance.now() - t0, err: e.message }; } },
    tick() { const s = JSON.stringify(this.snap()); if (s === this.last) return; this.last = s; api('/api/lane24/save', { snap: JSON.parse(s) }, 1500).catch(() => {}); },
  };

  /* ══ 13. phone (< 820 px): the cluster lives in the dock's More sheet (the rail keeps its 5 tabs at full width) ══ */
  const Phone = {
    wrap() {
      const M = typeof V17Mob !== 'undefined' && V17Mob.mobile; if (!M || !M.more || M.more._x182) return; const o = M.more;
      M.more = function () { const r = o.apply(this, arguments); try { const c = $1('#x17Sheet .x17-sheetc'); if (c && !$1('[data-x182m]', c)) { const h = el('h3', null, 'Cockpit'), row = el('div', 'x182-mrow'); for (const [k, l] of [['pf', '◫ Portfolio & Risk'], ['zen', 'Z Zen'], ['refresh', 'R Refresh'], ['mesh', '● Mesh']]) { const b = btn('btn sm', l); b.dataset.x182m = k; row.appendChild(b); } c.append(h, row); } } catch (e) { /* sheet */ } return r; };
      M.more._x182 = true;
      document.addEventListener('click', (e) => { const b = e.target.closest('[data-x182m]'); if (!b) return; try { M.close(); } catch (x) { /* sheet */ } Act.run(b.dataset.x182m, b); });
    },
  };

  /* ══ boot ══ */
  const frame = () => { try { Tf.watch(); } catch (e) { /* not ready */ } requestAnimationFrame(frame); };
  const tick = () => {
    try { Strip.mount(); Fast.bind(); Tf.bind(); Guard.wrap(); Hud.mount(); Hover.bind(); Pf.mount(); Evo.bind(); Star.wrapPalette(); Phone.wrap(); Evo.feed(); Mesh.poll(false); if (tab() === 'port') Pf.render(); Strip.paint(); } catch (e) { console.warn('v182', e); }
  };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; document.body.classList.add('x182');
    U.stars = load('stars', []); if (load('zen', false)) Zen.toggle(true);
    tick(); Star.sync(); Boot.load(); Evo.poll(); requestAnimationFrame(frame);
    document.addEventListener('click', () => Tf.after()); // bubble: runs after the app's own pill handler
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && U.hud.ruler) { U.hud.ruler = null; Hud.post(true); }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.shiftKey && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (U.pfOpen && tab() === 'port') Pf.flatten(); else if (typeof V179UI !== 'undefined') { V179UI.strip.flatten(); T('FLATTEN ALL (Shift+Esc)', 'amb'); } return; }
      if (e.shiftKey) return; const k = e.key.toLowerCase();
      if (V182.KEYS[k] && typeof V177UI !== 'undefined') { e.preventDefault(); const t0 = performance.now(); Fast.go(V182.KEYS[k]); U.tabMs = (U.tabMs || []).concat(performance.now() - t0).slice(-50); return; }
      if (k === 'z') { e.preventDefault(); Act.run('zen'); } else if (k === 'r') { e.preventDefault(); Act.run('refresh'); } else if (k === 'p') { e.preventDefault(); Act.run('pf'); }
    }, true);
    setInterval(tick, 1000); setInterval(() => Boot.tick(), 10000); setInterval(() => { if (tab() === 'port') Evo.poll(); }, 15000);
  };
  U.Strip = Strip; U.Tf = Tf; U.Hud = Hud; U.Pf = Pf; U.Mesh = Mesh; U.Star = Star; U.Hover = Hover; U.Evo = Evo; U.Zen = Zen; U.Refresh = Refresh; U.Guard = Guard;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b182 = boot; boot = async function () { await _b182.apply(this, arguments); try { V182UI.start(); } catch (e) { console.warn('v182 init', e); } }; }
