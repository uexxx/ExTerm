/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.5 UI (maths in V175, v175core.js; heavy work in 8 dedicated Web Workers built from WORKER175_SRC). Listeners only,
   text through textContent, strict CSP, exact pre-v17.0 palette (Obsidian #07080B / #0D1117 · Bullion Gold #F5C84B).
   · Mesh          8 worker lanes (Float64Array transfer), per-lane ms / queue telemetry, + the 4 serve.py lanes (/api/lanes)
   · Loop          one rAF driver for every v17.5 canvas: frame-budget meter, 0 fps (hibernate) for hidden canvases
   · Search        "Search any stock, coin, or paste meme coin CA…" + "Use Active Chart Symbol" in EVERY tool tab and the Briefing
   · Layers        main-chart 3D: ≤ 3 layers on by default, 12-layer drawer, IndexedDB presets
   · Scenes        optional 2D | 3D pill on each tool tab (fast 2D stays the default)
   · Shock Lab     156-scenario 3D order-book flight simulator + stress test of open positions and running bots (Quant Lab)
   · Squad         Working Bots: HUNTER-α … HEDGER-ARB bound 1:1 to real bus events (STANDBY until a bot runs or the demo is
                   explicitly started), 4D core, 8 quant panels
   · Edge          30 engines computed in the lanes for whatever symbol is active
   · Sonar · Voice HUD (Shift+V) · 60 s Flight Recorder (Shift+R) */
const V175UI = (() => {
  const U = { mounted: false, n: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const T = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const A = () => (typeof V17App !== 'undefined' ? V17App : null);
  const UI1 = () => (typeof V171UI !== 'undefined' ? V171UI : null);
  const S2 = () => (typeof V172UI !== 'undefined' ? V172UI : null);
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sym = () => (typeof ST !== 'undefined' ? ST.sel : '');
  const bus = () => (typeof window !== 'undefined' ? window.__EXTERM_BUS : null);
  const fin = Number.isFinite, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), { mean, sd, quant } = V175.util;
  const DPR = () => Math.max(1, Math.min(3, devicePixelRatio || 1));
  const PAL = V175.PAL, RGB = { gold: '245,200,75', up: '47,208,138', dn: '255,90,95', ink: '216,207,182', mut: '154,145,122' };
  const hidden = () => document.body.classList.contains('x17-hide') || !!(S2() && S2().syn && S2().syn.rec);
  const money = (v) => (hidden() ? '$•••' : fin(v) ? (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') : '–');
  const f2 = (v, d) => (fin(v) ? v.toFixed(d == null ? 2 : d) : '–');
  const pxOf = (s) => { try { if (typeof px === 'function') { const p = px(s); if (p > 0) return p; } } catch (e) { /* not ready */ } const L = typeof Feed !== 'undefined' && Feed.live && Feed.live[s]; return L && L.price > 0 ? L.price : 0; };
  const bars = () => (typeof chart !== 'undefined' && chart && Array.isArray(chart.data) ? chart.data : []);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const msOf = (t) => (t > 1e12 ? t : t * 1000); // bar times may be s or ms
  const rets = (c) => { const r = []; for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) r.push(c[i] / c[i - 1] - 1); return r; };

  /* ══ 0. IndexedDB key-value (3D layer presets, IF-THEN rules) ══ */
  const IDB = {
    db: null, p: null,
    open() { if (this.p) return this.p; this.p = new Promise((res) => { try { const r = indexedDB.open('exterm-v175', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); } }); return this.p; },
    async get(k) { const d = await this.open(); if (!d) return null; return new Promise((res) => { try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result == null ? null : q.result); q.onerror = () => res(null); } catch (e) { res(null); } }); },
    async set(k, v) { const d = await this.open(); if (!d) return false; return new Promise((res) => { try { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } }); },
  };
  U.idb = IDB;

  /* ══ 1. worker mesh: 8 dedicated lanes ══ */
  const Mesh = U.mesh = {
    lanes: {}, seq: 0, cb: new Map(), url: null, srv: null, srvAt: 0,
    start() {
      if (Object.keys(this.lanes).length) return;
      for (const [k, name] of V175.LANES) {
        const L = { k, name, tele: new V175.Tele(256), w: null, ready: false, last: 0, compute: 0 };
        try {
          if (typeof Worker === 'undefined' || typeof WORKER175_SRC === 'undefined') throw new Error('no workers');
          if (!this.url) this.url = URL.createObjectURL(new Blob([WORKER175_SRC], { type: 'text/javascript' }));
          L.w = new Worker(this.url, { name: 'exterm-' + k }); L.w.onmessage = (e) => this.msg(L, e.data); L.w.onerror = (e) => { L.tele.err++; L.errMsg = String((e && e.message) || 'worker error'); };
          L.w.postMessage({ init: k });
        } catch (e) { L.w = null; } // inline fallback: same functions on the main thread
        this.lanes[k] = L;
      }
    },
    /* run(fn, ...args): routed to the lane that owns fn; Float64Array args are transferred */
    run(fn, ...args) {
      const k = V175.route(fn), L = this.lanes[k]; if (!L) return Promise.reject(new Error('no lane for ' + fn));
      L.tele.q++; L.tele.peakQ = Math.max(L.tele.peakQ, L.tele.q); L.last = Date.now();
      if (!L.w) { const t0 = performance.now(); try { const out = V175.E[fn](...args.map((a) => (a instanceof Float64Array ? V175.unpack(a) : a))); L.tele.add(performance.now() - t0); return Promise.resolve(out); } catch (e) { L.tele.err++; return Promise.reject(e); } finally { L.tele.q--; } }
      const id = ++this.seq, t0 = performance.now();
      return new Promise((res, rej) => {
        this.cb.set(id, { res, rej, L, t0 }); const tr = args.filter((a) => a instanceof Float64Array).map((a) => a.buffer);
        try { L.w.postMessage({ id, fn, args }, tr); } catch (e) { this.cb.delete(id); L.tele.q--; L.tele.err++; rej(e); return; }
        setTimeout(() => { const c = this.cb.get(id); if (c) { this.cb.delete(id); L.tele.q = Math.max(0, L.tele.q - 1); L.tele.err++; rej(new Error('lane timeout: ' + fn)); } }, 20000);
      });
    },
    msg(L, m) { if (m && m.ready) { L.ready = true; return; } if (m && m.rstat) { Panels.rstat[m.rstat.id] = m.rstat; return; } const c = m && this.cb.get(m.id); if (!c) return; this.cb.delete(m.id); L.tele.q = Math.max(0, L.tele.q - 1); L.tele.add(performance.now() - c.t0); L.compute = m.ms || 0; if (m.ok) c.res(m.out); else { L.tele.err++; c.rej(new Error(m.err)); } },
    state(L) { return !L.w ? 'INLINE' : L.tele.q ? 'BUSY' : Date.now() - L.last > 5000 ? 'HIBERNATE' : 'IDLE'; },
    samples() { return [].concat(...Object.values(this.lanes).map((L) => L.tele.vals())); },
    async pollServer() { // the 4 serve.py lanes (only when served by the launcher)
      if (Date.now() - this.srvAt < 2500) return this.srv; this.srvAt = Date.now();
      const m = document.querySelector('meta[name="nt-token"]'); if (!m || location.protocol === 'file:') { this.srv = null; return null; }
      try { const r = await fetch('/api/lanes', { headers: { 'X-ExTerm': m.content } }); this.srv = r.ok ? await r.json() : null; } catch (e) { this.srv = null; }
      return this.srv;
    },
  };

  /* ══ 2. one rAF driver for every v17.5 canvas (frame budget + 0 fps hibernation) ══ */
  const SIZE = new WeakMap(); // canvas → [css w, css h] from ResizeObserver
  const Loop = U.loop = {
    items: new Set(), raf: 0, frame: new V175.Tele(240), fpsN: 0, fpsAt: 0, fps: 0, last: 0,
    /* visibility + size come from IntersectionObserver / ResizeObserver callbacks: no layout reads inside the frame */
    io: typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { for (const e of es) { const it = Loop.byCv.get(e.target); if (it) { it.inView = e.isIntersecting && e.boundingClientRect.width > 0; if (it.inView) Loop.wake(); } } }) : null,
    ro: typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) SIZE.set(e.target, [e.contentRect.width, e.contentRect.height]); }) : null,
    byCv: new WeakMap(),
    add(cv, draw, cap) { const it = { cv, draw, cap: cap || 60, at: 0, fps: 0, n: 0, nAt: 0, vis: false, inView: !this.io }; this.items.add(it); this.byCv.set(cv, it); if (this.io) this.io.observe(cv); if (this.ro) this.ro.observe(cv); this.wake(); return it; },
    vis(cv) { const it = this.byCv.get(cv); return cv.isConnected && !document.hidden && (it && this.io ? it.inView : !!cv.offsetParent && cv.clientWidth > 0); },
    wake() { if (!this.raf && !document.hidden) this.raf = requestAnimationFrame((t) => this.tick(t)); },
    BUDGET: 0.6, // ms of v17.5 canvas work per frame (hard target 1.2 ms incl. GC jitter); whatever is still due draws next frame (most-late first)
    tick(now) {
      this.raf = 0; const t0 = performance.now(); let any = false, ran = 0; const due = [];
      for (const it of this.items) {
        if (!it.cv.isConnected) { this.items.delete(it); continue; }
        it.vis = this.vis(it.cv); if (!it.vis) { it.fps = 0; continue; } any = true;
        const late = now - it.at - 1000 / it.cap; if (late >= -1) due.push([late * it.cap, it]);
      }
      due.sort((a, b) => b[0] - a[0]);
      for (const [, it] of due) {
        if (ran && performance.now() - t0 + (it.cost || 0) > this.BUDGET) { this.deferred = (this.deferred || 0) + 1; continue; }
        const dt = Math.min(0.05, it.at ? (now - it.at) / 1000 : 0.016); it.at = now;
        const c0 = performance.now(); try { it.draw(now, dt); ran++; } catch (e) { console.warn('v175 draw', e); } const cms = performance.now() - c0; it.cost = (it.cost || 0) * 0.9 + cms * 0.1; (it.hist || (it.hist = [])).push(cms); if (it.hist.length > 240) it.hist.shift();
        it.n++; if (!it.nAt) it.nAt = now; if (now - it.nAt >= 1000) { it.fps = Math.round((it.n * 1000) / (now - it.nAt)); it.n = 0; it.nAt = now; }
      }
      if (ran) this.frame.add(performance.now() - t0);
      this.fpsN++; if (!this.fpsAt) this.fpsAt = now; if (now - this.fpsAt >= 1000) { this.fps = Math.round((this.fpsN * 1000) / (now - this.fpsAt)); this.fpsN = 0; this.fpsAt = now; }
      if (any) this.raf = requestAnimationFrame((t) => this.tick(t)); else this.fps = 0; // nothing visible: hibernate (the 500 ms tick wakes it)
    },
    budget() { const v = this.frame.vals(); return { p50: v.length ? quant(v, 0.5) : 0, p95: v.length ? quant(v, 0.95) : 0, max: v.length ? Math.max(...v) : 0, n: v.length, fps: this.fps }; },
  };
  const fit = (cv) => { const d = DPR(), sz = SIZE.get(cv) || [cv.clientWidth, cv.clientHeight], w = Math.max(1, Math.round(sz[0] * d)), h = Math.max(1, Math.round(sz[1] * d)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return d; };

  /* ══ 3. universal search inside EVERY tool ══ */
  const V171_TOOLS = ['desk', 'opts', 'futs', 'lab', 'pulse', 'fleet', 'bridge', 'ai', 'heat', 'grok']; // v17.1 mounts these
  const MORE_TOOLS = ['markets', 'whales', 'port', 'journal', 'workspace', 'social', 'bots', 'challenge', 'academy'];
  U.TOOLS = V171_TOOLS.concat(MORE_TOOLS);
  const searchBar = (extra) => {
    const bar = el('form', 'x171-search x175-search' + (extra ? ' ' + extra : '')); bar.setAttribute('role', 'search');
    const ic = el('span', null, '⌕'); ic.setAttribute('aria-hidden', 'true');
    const inp = el('input', 'in'); inp.type = 'search'; inp.placeholder = 'Search any stock, coin, or paste meme coin CA…'; inp.setAttribute('aria-label', 'Search any stock, coin, or meme coin contract address'); inp.autocomplete = 'off'; inp.spellcheck = false;
    const go = el('button', 'btn xs pri', 'Go'); go.type = 'submit';
    const act = el('button', 'btn xs', 'Use Active Chart Symbol'); act.type = 'button'; act.dataset.x171 = 'active';
    const lab = el('span', 'x171-act');
    bar.append(ic, inp, go, act, lab);
    bar.addEventListener('submit', (e) => { e.preventDefault(); const q = inp.value, c = V175.classify(q); if (c.kind === 'empty') return; const u = UI1(); if (!u || !u.go) return; u.go(c.kind === 'perp' ? c.q.replace('-PERP', '-USD') : q, true).then((s) => { if (s) { inp.value = ''; Flight.mark('search', s); } }); });
    act.addEventListener('click', () => { const t = tab(); try { if (t !== 'markets') showTab(t); } catch (e) { /* rerender */ } T('Using ' + sym()); });
    return bar;
  };
  const mountSearch = () => {
    const t = tab(); if (!MORE_TOOLS.includes(t)) return; const sec = $1('#tab-' + t); if (!sec || !sec.children.length) return;
    let bar = $1(':scope > .x171-search', sec);
    if (!bar && t === 'markets') { bar = mRow() && $1('#x175MRow .x175-search'); }
    else if (!bar) { bar = searchBar(); sec.prepend(bar); }
    if (!bar) return; const a = $1('.x171-act', bar), s = sym(), txt = 'active: ' + (typeof isOnchain === 'function' && isOnchain(s) && typeof OC !== 'undefined' && OC.label ? OC.label(s) : s); if (a && a.textContent !== txt) a.textContent = txt;
  };
  /* chart tab: ONE compact row under the toolbar = search + single-line EDGE ticker (click to expand) */
  const mRow = () => { let r = $1('#x175MRow'); if (r) return r; const tb = $1('#tab-markets .toolbar'); if (!tb) return null; r = el('div', 'x175-mrow'); r.id = 'x175MRow'; r.appendChild(searchBar('x175-mini')); tb.after(r); return r; };
  const mountBriefSearch = () => { const m = $1('#x17Brief'); if (!m || $1('.x175-search', m)) return; const box = $1('.x17-mbox', m) || m.firstElementChild || m; box.prepend(searchBar('x175-brief')); };
  U.searchCoverage = () => U.TOOLS.map((t) => [t, !!(t === 'markets' ? $1('#x175MRow .x175-search') : $1('#tab-' + t + ' .x171-search'))]);

  /* ══ 4. main-chart 3D layers drawer (≤ 3 default) ══ */
  const Layers = U.layers = {
    st: V175.layerDefaults(), replay: 1, presets: { Clean: V175.layerDefaults() }, loaded: false,
    async load() { const s = await IDB.get('layers'); if (s && s.st) { this.st = V175.layerState(s.st); if (s.presets) this.presets = Object.assign({ Clean: V175.layerDefaults() }, s.presets); } this.loaded = true; this.apply(); this.paint(); },
    save() { IDB.set('layers', { st: this.st, presets: this.presets }); },
    apply() { const D = UI1() && UI1().chart3d; if (!D) return; D.layers = this.st; D.dirty = true; },
    set(k, on) { if (!(k in this.st)) return; this.st[k] = !!on; this.apply(); this.save(); this.paint(); Flight.mark('layer', k + (on ? ' on' : ' off')); },
    count() { return V175.layersOn(this.st).length; },
    mount() {
      const b3 = $1('#x171_3d'); if (!b3 || $1('#x175LayB')) return; const b = el('button', 'btn sm x175-layb', '3D Layers'); b.type = 'button'; b.id = 'x175LayB'; b.title = '3D chart layers: OB Prisms, VPVR / POC and Whale Beacons on by default'; b.setAttribute('aria-expanded', 'false'); b3.after(b);
      const dr = el('div', 'x175-drawer'); dr.id = 'x175LayDr'; dr.hidden = true; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-label', '3D layers');
      const h = el('div', 'x175-drh'); h.append(el('b', null, '3D LAYERS'), el('span', 'x175-mut', 'default: 3 core layers')); dr.appendChild(h);
      const list = el('div', 'x175-laylist'); for (const [k, name, def] of V175.LAYERS) { const lb = el('label', 'x175-lay'); const cb = el('input'); cb.type = 'checkbox'; cb.dataset.x175lay = k; cb.checked = !!this.st[k]; cb.addEventListener('change', () => this.set(k, cb.checked)); lb.append(cb, el('span', null, name), el('em', null, def ? 'core' : 'extra')); list.appendChild(lb); } dr.appendChild(list);
      const rp = el('label', 'x175-lay x175-rep'); const rg = el('input'); rg.type = 'range'; rg.min = '10'; rg.max = '100'; rg.value = '100'; rg.setAttribute('aria-label', '4D replay scrub'); rg.addEventListener('input', () => { this.replay = +rg.value / 100; if (!this.st.replay) this.set('replay', true); this.apply(); }); rp.append(el('span', null, '4D Replay Scrub'), rg); dr.appendChild(rp);
      const pr = el('div', 'x175-presets'); pr.append(el('span', 'x175-mut', 'presets')); const draw = () => { for (const x of $$1('[data-x175pre]', pr)) x.remove(); for (const n of Object.keys(this.presets)) { const pb = el('button', 'btn xs', n); pb.type = 'button'; pb.dataset.x175pre = n; pb.addEventListener('click', () => { this.st = V175.layerState(this.presets[n]); this.apply(); this.save(); this.paint(); }); pr.insertBefore(pb, sv); } };
      const sv = el('button', 'btn xs pri', 'Save preset'); sv.type = 'button'; sv.addEventListener('click', () => { const n = 'Preset ' + Object.keys(this.presets).length; this.presets[n] = Object.assign({}, this.st); this.save(); draw(); T('Saved “' + n + '” (IndexedDB)'); }); pr.appendChild(sv); dr.appendChild(pr); draw();
      const host = $1('#chartHost'); (host && host.parentNode ? host.parentNode : document.body).appendChild(dr);
      b.addEventListener('click', () => { dr.hidden = !dr.hidden; b.setAttribute('aria-expanded', String(!dr.hidden)); if (!dr.hidden) { const D = UI1() && UI1().chart3d; if (D && !D.on) D.toggle(true); } });
      this.paint();
    },
    paint() { for (const cb of $$1('[data-x175lay]')) cb.checked = !!this.st[cb.dataset.x175lay]; const b = $1('#x175LayB'); if (b) b.textContent = '3D Layers · ' + this.count(); },
  };
  /* overlay: the extra layers drawn with v17.1's own projection (V171UI.chart3d.geo) */
  const overlay = (D) => {
    const G = D.geo, st = Layers.st; if (!G || !G.C || G.C.length < 5) return; const { g, P, X, Y, C, lo, hi, dpr } = G, n = C.length;
    const poly = (pts, fill, stroke, lw) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = (lw || 1) * dpr; g.stroke(); } };
    const line = (a, b, col, lw) => { g.strokeStyle = col; g.lineWidth = (lw || 1) * dpr; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    const atr = mean(C.slice(-14).map((c) => c.h - c.l)) || (hi - lo) * 0.02, last = C[n - 1].c, inR = (p) => p >= lo && p <= hi; let drawn = 0;
    g.save();
    if (st.vpvr) { const vp = V175.vpvr(C, 24), vm = Math.max(1e-9, ...vp.bins.map((b) => b.v)); for (const b of vp.bins) { const L = 0.5 * (b.v / vm); poly([P(-1, Y(b.lo), 0.35), P(-1 + L, Y(b.lo), 0.35), P(-1 + L, Y(b.hi), 0.35), P(-1, Y(b.hi), 0.35)], `rgba(${RGB.gold},${(0.08 + 0.22 * (b.v / vm)).toFixed(3)})`); } line(P(-1, Y(vp.poc), 0.35), P(1, Y(vp.poc), 0.35), `rgba(${RGB.gold},.95)`, 1.6); g.setLineDash([4 * dpr, 5 * dpr]); line(P(-1, Y(vp.vah), 0.35), P(1, Y(vp.vah), 0.35), `rgba(${RGB.gold},.45)`); line(P(-1, Y(vp.val), 0.35), P(1, Y(vp.val), 0.35), `rgba(${RGB.gold},.45)`); g.setLineDash([]); const q = P(1, Y(vp.poc), 0.35); g.fillStyle = PAL.gold; g.font = `700 ${10 * dpr}px Inter, system-ui, sans-serif`; g.textAlign = 'left'; g.fillText('POC', q[0] + 4 * dpr, q[1] - 3 * dpr); drawn++; }
    if (st.whale) { for (const w of V175.whales(C, 2.2)) { const c = C[w.i], col = w.side === 'buy' ? RGB.up : RGB.dn, a = P(X(w.i), Y(c.h), 0), b = P(X(w.i), Y(c.h) + 0.22 + 0.04 * Math.min(6, w.z), 0); line(a, b, `rgba(${col},.85)`, 1.4); g.save(); g.globalCompositeOperation = 'lighter'; const r = (3 + Math.min(5, w.z)) * dpr, gr = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], r * 3); gr.addColorStop(0, `rgba(${col},.95)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(b[0], b[1], r * 3, 0, 6.2832); g.fill(); g.restore(); } drawn++; }
    if (st.cvd) { let cum = 0; const cv = C.map((c) => (cum += c.c >= c.o ? c.v || 0 : -(c.v || 0))), m = Math.max(1e-9, ...cv.map(Math.abs)); cv.forEach((v, i) => line(P(X(i), -0.15, -0.33), P(X(i), -0.15 + 0.35 * (v / m), -0.33), `rgba(${v >= 0 ? RGB.up : RGB.dn},.6)`, 2)); drawn++; }
    if (st.gex && typeof V17P !== 'undefined' && V17P.modelChain && V17P.gex) { try { const gx = V17P.gex(V17P.modelChain(last, String(sym()).length + 3), last), m = Math.max(1e-9, ...gx.rows.map((r) => Math.abs(r.net))); for (const r of gx.rows) if (inR(r.strike)) poly([P(1.02, Y(r.strike) - 0.006, -0.05), P(1.02 + 0.3 * (Math.abs(r.net) / m), Y(r.strike) - 0.006, -0.05), P(1.02 + 0.3 * (Math.abs(r.net) / m), Y(r.strike) + 0.006, 0.05), P(1.02, Y(r.strike) + 0.006, 0.05)], `rgba(${r.net >= 0 ? RGB.up : RGB.dn},.55)`); drawn++; } catch (e) { /* no chain */ } }
    if (st.liq) { const pos = []; for (const c of C.slice(-60)) for (const lev of [10, 25, 50]) { pos.push({ entry: c.c, lev, side: 'long', usd: c.v || 1 }); pos.push({ entry: c.c, lev, side: 'short', usd: c.v || 1 }); } const hm = V175.E.liqHeatmap(pos, 30, lo, hi), m = Math.max(1e-9, ...hm.bins), w = (hi - lo) / 30; hm.bins.forEach((v, k) => { if (v / m < 0.15) return; const p0 = lo + k * w, col = p0 < last ? RGB.dn : RGB.up; poly([P(-1, Y(p0), 0.3), P(1, Y(p0), 0.3), P(1, Y(p0 + w), 0.3), P(-1, Y(p0 + w), 0.3)], `rgba(${col},${(0.05 + 0.2 * (v / m)).toFixed(3)})`); }); drawn++; }
    if (st.fvg) { for (let i = 1; i < n - 1; i++) { const a = C[i - 1], b = C[i + 1]; let top = 0, bot = 0, col = ''; if (a.h < b.l) { bot = a.h; top = b.l; col = RGB.up; } else if (a.l > b.h) { bot = b.h; top = a.l; col = RGB.dn; } if (!col) continue; poly([P(X(i), Y(bot), -0.12), P(1, Y(bot), -0.12), P(1, Y(top), 0.12), P(X(i), Y(top), 0.12)], `rgba(${col},.1)`, `rgba(${col},.4)`, 0.8); } drawn++; }
    if (st.avwap) { let k0 = 0; for (let i = 1; i < n; i++) if (C[i].l < C[k0].l) k0 = i; let pv = 0, vv = 0, p2 = 0; const pts = []; for (let i = k0; i < n; i++) { const tp = (C[i].h + C[i].l + C[i].c) / 3, v = C[i].v || 1; pv += tp * v; vv += v; p2 += tp * tp * v; const vw = pv / vv, s = Math.sqrt(Math.max(0, p2 / vv - vw * vw)); pts.push([i, vw, s]); } for (const [z, sg] of [[-0.2, -1], [0.2, 1]]) { g.beginPath(); pts.forEach(([i, vw, s], k) => { const p = P(X(i), Y(vw + sg * s), z); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.strokeStyle = `rgba(${RGB.gold},.35)`; g.lineWidth = dpr; g.stroke(); } g.beginPath(); pts.forEach(([i, vw], k) => { const p = P(X(i), Y(vw), 0); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.strokeStyle = `rgba(${RGB.gold},.9)`; g.lineWidth = 1.6 * dpr; g.stroke(); drawn++; }
    if (st.rr) { const br = V175.E.shadowBracket(last, 'long', atr), x0 = X(n - 1), x1 = Math.min(1.3, x0 + 0.3), box = (y0, y1, col) => { const q = [[x0, y0, -0.15], [x1, y0, -0.15], [x1, y1, -0.15], [x0, y1, -0.15], [x0, y0, 0.15], [x1, y0, 0.15], [x1, y1, 0.15], [x0, y1, 0.15]].map((v) => P(v[0], v[1], v[2])); poly([q[0], q[1], q[2], q[3]], `rgba(${col},.12)`); for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) line(q[a], q[b], `rgba(${col},.7)`, 0.8); }; box(Y(last), Y(Math.min(hi * 1.2, br.tp)), RGB.up); box(Y(Math.max(lo * 0.8, br.stop)), Y(last), RGB.dn); drawn++; }
    if (st.strata) { [1, 2, 4, 8, 16, 32].forEach((k, j) => { g.beginPath(); let f = true; for (let i = n - 1; i >= 0; i -= k) { const p = P(X(i), Y(C[i].c), -0.3 + j * 0.12); if (f) { g.moveTo(p[0], p[1]); f = false; } else g.lineTo(p[0], p[1]); } g.strokeStyle = `rgba(${RGB.gold},${(0.85 - j * 0.12).toFixed(2)})`; g.lineWidth = dpr; g.stroke(); }); drawn++; }
    if (st.replay) { const r = Math.max(1, Math.round(Layers.replay * (n - 1))); poly([P(X(r), -0.15, -0.35), P(X(r), 1.05, -0.35), P(X(r), 1.05, 0.35), P(X(r), -0.15, 0.35)], `rgba(${RGB.gold},.07)`, `rgba(${RGB.gold},.6)`); const q = P(X(r), 1.05, 0); g.fillStyle = PAL.gold; g.font = `700 ${10 * dpr}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.fillText('REPLAY ' + (r - (n - 1) || 'now'), q[0], q[1] - 4 * dpr); drawn++; }
    g.restore();
    D.lastDraw = Object.assign(D.lastDraw || {}, { layers: Layers.count(), overlay: drawn + (st.ob ? 1 : 0) + (st.l2 ? 1 : 0) });
  };
  const hook3d = () => { const D = UI1() && UI1().chart3d; if (!D || D._x175) return; const d0 = D.draw.bind(D); D.draw = function () { d0(); try { overlay(this); } catch (e) { console.warn('v175 layers', e); } }; D.layers = Layers.st; D._x175 = true; };

  /* ══ 5. optional 2D | 3D scenes on the tool tabs ══ */
  const SCENES = { whales: 'On-Chain 3-Layer Wallet Cabal DAG · CLMM Volcano · Bubble Nebula', opts: '3D IV & GEX Surface + Spot-Shift', futs: 'Futures 3D DOM Waterfall', heat: 'Screener 3D Alpha Cube', pulse: 'Pulse 3D Whale Globe', desk: 'Derivs 3D Arb Hyper-Graph', lab: 'Quant Lab 3D Sharpe Surface & DNA Helix', ai: 'Copilot 3D Bull / Bear / Risk Tetrahedron', port: 'Portfolio 3D Equity / Drawdown Canyon', grok: 'Ctrl+K 3D Carousel' };
  const Scenes = U.scenes = { mode: {}, data: {}, at: {}, view: {} };
  const proj = (yaw, pitch, W, H, zoom) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), S = Math.min(W, H) * 0.36 * (zoom || 1); return (x, y, z) => { const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, k = 3 / (3 + z2); return [W / 2 + x1 * S * k, H * 0.54 - y1 * S * k, z2, k]; }; };
  const surfCol = (v) => (v >= 0.5 ? `rgba(${RGB.up},${(0.25 + 0.6 * (v - 0.5) * 2).toFixed(3)})` : `rgba(${RGB.gold},${(0.2 + 0.6 * (0.5 - v) * 2).toFixed(3)})`);
  const norm = (M) => { const f = [].concat(...M).filter(fin), lo = Math.min(...f), hi = Math.max(...f), s = hi - lo || 1; return M.map((r) => r.map((v) => (fin(v) ? (v - lo) / s : 0))); };
  const helix = (items) => { const pts = [], edges = []; items.slice(0, 10).forEach((it, i) => { const a = i * 0.7, y = -0.8 + i * 0.17; pts.push({ x: Math.cos(a) * 0.5, y, z: Math.sin(a) * 0.5, r: 3, c: RGB.gold, l: it }); pts.push({ x: -Math.cos(a) * 0.5, y, z: -Math.sin(a) * 0.5, r: 3, c: RGB.up }); edges.push([pts.length - 2, pts.length - 1, 0.5]); }); return { pts, edges }; };
  /* builders return { surf: [[0..1]], pts: [{x,y,z,r,c,l}], edges: [[i,j,alpha]], note } in [-1,1]³ */
  const BUILD = {
    async opts() { const s = sym(), spot = pxOf(s) || (bars().slice(-1)[0] || {}).c || 100, Ks = Array.from({ length: 15 }, (_, i) => spot * (0.8 + i * (0.4 / 14))), Ts = [1, 2, 5, 7, 14, 30, 60].map((d) => d / 365), iv = await Mesh.run('ivSurface', spot, Ks, Ts, 0.5), shift = Math.sin(Date.now() / 4000) * 0.08; const pts = []; try { const gx = V17P.gex(V17P.modelChain(spot, s.length + 3), spot), m = Math.max(1e-9, ...gx.rows.map((r) => Math.abs(r.net))); gx.rows.forEach((r) => { const x = ((r.strike / spot - 0.8) / 0.4) * 2 - 1; if (x >= -1 && x <= 1) pts.push({ x, y: -0.6 + 0.9 * (Math.abs(r.net) / m), z: 1.05, r: 2.5, c: r.net >= 0 ? RGB.up : RGB.dn }); }); } catch (e) { /* no gex */ } pts.push({ x: shift * 10 * 0.2, y: 0.6, z: 0, r: 4, c: RGB.gold, l: 'spot ' + (shift >= 0 ? '+' : '') + (shift * 100).toFixed(1) + '%' }); return { surf: norm(iv), pts, note: 'IV surface (model smile) · GEX towers · spot-shift ±8 %' }; },
    async futs() { const a = A(), dom = a && a.dom ? a.dom.slice(-24) : []; if (dom.length < 3) { const mid = pxOf(sym()) || 100, rows = []; for (let t = 0; t < 20; t++) { const b = V175.synthBook(mid * (1 + Math.sin(t / 3) * 0.001), { levels: 20, seed: t + 1 }); rows.push(b.bids.slice(0, 10).reverse().concat(b.asks.slice(0, 10)).map((x) => x[0] * x[1])); } return { surf: norm(rows), note: 'DOM waterfall (model book: live L2 not streaming yet)' }; } const rows = dom.map((bk) => (bk.bids || []).slice(0, 10).reverse().concat((bk.asks || []).slice(0, 10)).map((x) => x[0] * x[1])), w = Math.min(...rows.map((r) => r.length)); return { surf: norm(rows.map((r) => r.slice(0, w))), note: 'DOM waterfall · ' + dom.length + ' live L2 snapshots' }; },
    async heat() { const L = typeof Feed !== 'undefined' && Feed.live ? Feed.live : {}, ks = Object.keys(L).filter((k) => L[k] && L[k].price > 0).slice(0, 60); if (!ks.length) return { pts: [], note: 'Alpha cube: waiting for live quotes' }; const ch = ks.map((k) => (fin(L[k].ch) ? L[k].ch : 0)), vol = ks.map((k) => Math.log(1 + (L[k].vol || L[k].volume || 1))), m1 = Math.max(1e-9, ...ch.map(Math.abs)), vm = Math.max(1e-9, ...vol); return { pts: ks.map((k, i) => ({ x: ch[i] / m1, y: (vol[i] / vm) * 1.6 - 0.8, z: ((k.charCodeAt(0) % 20) / 10 - 1) * 0.8, r: 2 + 4 * (vol[i] / vm), c: ch[i] >= 0 ? RGB.up : RGB.dn, l: i < 12 ? k : '' })), note: 'Alpha cube · x = change · y = log volume · ' + ks.length + ' live symbols' }; },
    async pulse() { const B = bus(), ev = B && B.recent ? B.recent.toArray().filter((e) => /whale|sweep|fill|tick/i.test(e.type + ' ' + (e.text || ''))).slice(-60) : [], pts = []; for (let i = 0; i < 160; i++) { const th = Math.acos(1 - (2 * (i + 0.5)) / 160), ph = Math.PI * (1 + Math.sqrt(5)) * i; pts.push({ x: Math.sin(th) * Math.cos(ph) * 0.8, y: Math.cos(th) * 0.8, z: Math.sin(th) * Math.sin(ph) * 0.8, r: 1, c: RGB.mut }); } ev.forEach((e, i) => { let h = 0; for (const ch of String(e.t) + (e.text || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const th = (h % 1000) / 1000 * Math.PI, ph = ((h >>> 10) % 1000) / 1000 * 6.2832; pts.push({ x: Math.sin(th) * Math.cos(ph) * 0.84, y: Math.cos(th) * 0.84, z: Math.sin(th) * Math.sin(ph) * 0.84, r: 3.5, c: /sell|dn|loss/i.test(e.text || '') ? RGB.dn : RGB.up, l: i > ev.length - 4 ? String(e.text || e.type).slice(0, 18) : '' }); }); return { pts, note: 'Whale globe · ' + ev.length + ' recent bus events (positions hashed, not geography)' }; },
    async desk() { const u = UI1(), c = u && u.deriv && u.deriv.cache ? u.deriv.cache[sym()] : null, q = (c && c.q) || {}, ven = Object.keys(q); if (!ven.length) return { pts: [{ x: 0, y: 0, z: 0, r: 4, c: RGB.gold, l: sym() }], note: 'Arb hyper-graph: open Derivs & Arb to load venue quotes' }; const pts = ven.map((v, i) => ({ x: Math.cos((i / ven.length) * 6.2832) * 0.7, y: (q[v].bid / (q[ven[0]].bid || 1) - 1) * 200, z: Math.sin((i / ven.length) * 6.2832) * 0.7, r: 5, c: RGB.gold, l: v })), edges = []; for (let i = 0; i < ven.length; i++) for (let j = 0; j < ven.length; j++) if (i !== j && q[ven[j]].bid > q[ven[i]].ask) edges.push([i, j, 0.9]); else if (i < j) edges.push([i, j, 0.15]); return { pts, edges, note: 'Arb hyper-graph · ' + ven.length + ' venues · bright = buy-ask < sell-bid' }; },
    async lab() { const c = bars().slice(-400).map((b) => b.c); if (c.length < 80) return { pts: [], note: 'Sharpe surface: waiting for bars' }; const fs = [3, 5, 8, 10, 13, 16, 20, 25], ss = [20, 30, 40, 50, 60, 80, 100, 130, 160, 200].filter((x) => x < c.length - 10), grid = await Mesh.run('sharpeGrid', V175.pack(c), fs, ss).catch(() => null); const ga = U.edgeCache.lab && U.edgeCache.lab.top ? U.edgeCache.lab.top.map((t) => t.expr.slice(0, 22)) : ['ret1', 'mom20', 'z20', 'rsi14']; return Object.assign({ surf: grid ? norm(grid) : null, note: 'Sharpe surface (SMA fast × slow) + DNA helix of the top genetic alphas' }, helix(ga)); },
    async ai() { const r = U.edgeCache.ai && U.edgeCache.ai.post ? U.edgeCache.ai.post : { bull: 1 / 3, bear: 1 / 3, risk: 1 / 3 }, V4 = [[0, 0.9, 0], [-0.8, -0.45, -0.46], [0.8, -0.45, -0.46], [0, -0.45, 0.92]], pts = [{ x: V4[0][0], y: V4[0][1], z: V4[0][2], r: 5, c: RGB.up, l: 'BULL ' + f2(r.bull * 100, 0) + '%' }, { x: V4[1][0], y: V4[1][1], z: V4[1][2], r: 5, c: RGB.dn, l: 'BEAR ' + f2(r.bear * 100, 0) + '%' }, { x: V4[2][0], y: V4[2][1], z: V4[2][2], r: 5, c: RGB.gold, l: 'RISK ' + f2(r.risk * 100, 0) + '%' }, { x: V4[3][0], y: V4[3][1], z: V4[3][2], r: 3, c: RGB.mut, l: 'neutral' }], b = [r.bull, r.bear, r.risk]; pts.push({ x: b[0] * V4[0][0] + b[1] * V4[1][0] + b[2] * V4[2][0], y: b[0] * V4[0][1] + b[1] * V4[1][1] + b[2] * V4[2][1], z: b[0] * V4[0][2] + b[1] * V4[1][2] + b[2] * V4[2][2], r: 7, c: RGB.gold, l: 'posterior' }); return { pts, edges: [[0, 1, 0.5], [0, 2, 0.5], [0, 3, 0.5], [1, 2, 0.5], [1, 3, 0.5], [2, 3, 0.5], [4, 0, 0.9], [4, 1, 0.9], [4, 2, 0.9]], note: 'Bayesian 3-agent posterior inside the Bull / Bear / Risk tetrahedron' }; },
    async port() { const acc = typeof ACC !== 'undefined' ? ACC : null, eq = acc && acc.eq && acc.eq.length > 10 ? acc.eq.slice(-120).map((e) => (typeof e === 'number' ? e : e.v || e.eq || e[1] || 0)) : bars().slice(-120).map((b) => b.c), rows = []; let pk = -Infinity; const dd = eq.map((v) => { pk = Math.max(pk, v); return pk > 0 ? v / pk - 1 : 0; }); for (let k = 0; k < 8; k++) rows.push(eq.filter((_, i) => i % 4 === 0).map((v, i) => v * (1 + dd[i * 4] * k * 0.15))); return { surf: norm(rows), note: acc && acc.eq && acc.eq.length > 10 ? 'Equity / drawdown canyon · ' + eq.length + ' equity points' : 'Equity canyon: no paper equity yet, showing price' }; },
    async whales() { const W = typeof TOP_WALLETS !== 'undefined' && Array.isArray(TOP_WALLETS) ? TOP_WALLETS.slice(0, 18) : [], pts = [], edges = []; W.forEach((w, i) => pts.push({ x: -0.9, y: 0.85 - i * 0.1, z: Math.sin(i) * 0.3, r: 2 + Math.min(5, Math.abs(w.pnl || 0) / 10), c: (w.pnl || 0) >= 0 ? RGB.up : RGB.dn, l: i < 6 ? String(w.name || '').slice(0, 10) : '' })); const toks = ['SOL', 'BONK', 'WIF', 'JUP', String(sym()).replace(/^oc:[^:]+:/, '').slice(0, 6) || 'ACTIVE']; toks.forEach((t, i) => pts.push({ x: 0, y: 0.6 - i * 0.3, z: 0, r: 5, c: RGB.gold, l: t })); for (let i = 0; i < W.length; i++) edges.push([i, W.length + (i % toks.length), 0.35]); pts.push({ x: 0.9, y: 0, z: 0, r: 6, c: RGB.dn, l: 'CEX / sinks' }); for (let i = 0; i < toks.length; i++) edges.push([W.length + i, pts.length - 1, 0.25]); const mid = pxOf(sym()) || 1, bk = V175.synthBook(mid, { levels: 16 }), rings = bk.bids.map((b, k) => b[0] * b[1]).slice(0, 12), m = Math.max(...rings); rings.forEach((v, k) => { for (let a = 0; a < 18; a++) { const an = (a / 18) * 6.2832, rr = 0.15 + k * 0.05; pts.push({ x: 0.55 + Math.cos(an) * rr * 0.6, y: -0.85 + (v / m) * 0.5 * (1 - k / 14), z: Math.sin(an) * rr * 0.6, r: 1, c: RGB.gold }); } }); return { pts, edges, note: '3-layer cabal DAG (top wallets → tokens → sinks) + CLMM liquidity volcano (model book)' }; },
    async grok() { const items = typeof palItems !== 'undefined' && Array.isArray(palItems) ? palItems.slice(0, 16).map((p) => String(p.t || p.name || p.label || '')) : V175.ENGINES.slice(0, 16).map((e) => e[0]); return { pts: items.map((t, i) => { const a = (i / items.length) * 6.2832 + Date.now() / 3000; return { x: Math.cos(a) * 0.8, y: 0, z: Math.sin(a) * 0.8, r: 4, c: RGB.gold, l: t.slice(0, 20) }; }), note: 'Ctrl+K 3D carousel (command palette items orbit; Ctrl+K opens the palette)' }; },
  };
  const drawScene = (cv, k, now) => {
    const d = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height, v = Scenes.view[k] || (Scenes.view[k] = { yaw: -0.6, pitch: 0.45, auto: true, zoom: 1 }); if (v.auto) v.yaw += 0.004;
    if (!Scenes.at[k] || now - Scenes.at[k] > (k === 'grok' || k === 'opts' ? 600 : 3000)) { Scenes.at[k] = now; BUILD[k]().then((r) => { Scenes.data[k] = r; }).catch((e) => { Scenes.data[k] = { pts: [], note: 'scene error: ' + e.message }; }); }
    const D = Scenes.data[k]; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAL.obs; g.fillRect(0, 0, W, H); const P = proj(v.yaw, v.pitch, W, H, v.zoom);
    g.strokeStyle = `rgba(${RGB.gold},.08)`; g.lineWidth = d * 0.6; for (let i = -4; i <= 4; i++) { const a = P(i / 4, -0.9, -1), b = P(i / 4, -0.9, 1), c = P(-1, -0.9, i / 4), e = P(1, -0.9, i / 4); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(e[0], e[1]); g.stroke(); }
    if (!D) return;
    if (D.surf && D.surf.length > 1) { const R = D.surf.length, Cc = D.surf[0].length, Q = (i, j) => P((j / (Cc - 1)) * 2 - 1, -0.9 + D.surf[i][j] * 1.5, (i / (R - 1)) * 2 - 1); for (let i = 0; i < R - 1; i++) for (let j = 0; j < Cc - 1; j++) { const a = Q(i, j), b = Q(i, j + 1), c = Q(i + 1, j + 1), e = Q(i + 1, j); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(e[0], e[1]); g.closePath(); g.fillStyle = surfCol((D.surf[i][j] + D.surf[i + 1][j + 1]) / 2); g.fill(); g.strokeStyle = `rgba(${RGB.gold},.18)`; g.lineWidth = 0.6 * d; g.stroke(); } }
    const pp = (D.pts || []).map((p) => P(p.x, p.y, p.z));
    for (const [i, j, a] of D.edges || []) { if (!pp[i] || !pp[j]) continue; g.strokeStyle = `rgba(${RGB.gold},${a})`; g.lineWidth = d * 0.8; g.beginPath(); g.moveTo(pp[i][0], pp[i][1]); g.lineTo(pp[j][0], pp[j][1]); g.stroke(); }
    const ord = pp.map((q, i) => [q[2], i]).sort((a, b) => b[0] - a[0]); g.font = `600 ${10 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left';
    for (const [, i] of ord) { const p = D.pts[i], q = pp[i], r = Math.max(0.6, p.r * q[3]) * d; g.fillStyle = `rgba(${p.c},.9)`; g.beginPath(); g.arc(q[0], q[1], r, 0, 6.2832); g.fill(); if (p.l) { g.fillStyle = PAL.ink; g.fillText(p.l, q[0] + r + 3 * d, q[1] + 3 * d); } }
    g.fillStyle = PAL.mut; g.font = `600 ${10 * d}px ui-monospace, Menlo, monospace`; g.fillText((D.note || '') + ' · drag to orbit', 10 * d, H - 10 * d);
  };
  const mountPill = () => {
    const t = tab(); if (!SCENES[t]) return; const sec = $1('#tab-' + t); if (!sec) return; const bar = $1('.x171-search', sec); if (!bar || $1('.x175-pill', bar)) return;
    const seg = el('div', 'seg x175-pill'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', SCENES[t] + ' view'); seg.title = SCENES[t];
    for (const m of ['2D', '3D']) { const b = el('button', null, m); b.type = 'button'; b.dataset.x175v = m; b.setAttribute('role', 'radio'); const on = (Scenes.mode[t] || '2D') === m; b.className = on ? 'on' : ''; b.setAttribute('aria-checked', String(on)); seg.appendChild(b); }
    seg.addEventListener('click', (e) => { const b = e.target.closest('[data-x175v]'); if (b) setScene(t, b.dataset.x175v); }); bar.appendChild(seg);
    if (Scenes.mode[t] === '3D') setScene(t, '3D');
  };
  const setScene = (t, m) => {
    Scenes.mode[t] = m; const sec = $1('#tab-' + t); if (!sec) return; for (const b of $$1('.x175-pill [data-x175v]', sec)) { const on = b.dataset.x175v === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    let box = $1(':scope > .x175-scene', sec); if (m !== '3D') { if (box) box.hidden = true; return; }
    if (!box) { box = el('div', 'x175-scene'); box.append(el('h4', null, SCENES[t])); const cv = el('canvas'); cv.setAttribute('aria-label', SCENES[t]); box.appendChild(cv); const bar = $1(':scope > .x171-search', sec); if (bar) bar.after(box); else sec.prepend(box);
      let dr = null; cv.addEventListener('pointerdown', (e) => { const v = Scenes.view[t]; if (!v) return; dr = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch }; v.auto = false; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } }); cv.addEventListener('pointermove', (e) => { if (!dr) return; const v = Scenes.view[t]; v.yaw = dr.yaw + (e.clientX - dr.x) / 160; v.pitch = clamp(dr.pitch + (e.clientY - dr.y) / 200, -0.2, 1.4); }); cv.addEventListener('pointerup', () => { dr = null; }); cv.addEventListener('dblclick', () => { Scenes.view[t] = null; });
      cv.addEventListener('wheel', (e) => { const v = Scenes.view[t]; if (!v) return; e.preventDefault(); v.zoom = clamp(v.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.5); }, { passive: false });
      Loop.add(cv, (now) => drawScene(cv, t, now), 40); }
    box.hidden = false; Loop.wake(); Flight.mark('scene', t + ' 3D');
  };

  /* ══ 6. 3D order-book Shock Lab · 156 scenarios (Quant Lab) ══ */
  const SCN = V175.scenarios();
  const Shock = U.shock = {
    last: null, stress: null, sc: null,
    params() { const v = (id) => +(($1('#' + id) || {}).value || 0); return { orderUsd: v('x175sUsd'), depthPct: v('x175sDep') / 100, volMult: v('x175sVol') / 10, spoofPct: v('x175sSpf') / 100, side: ($1('#x175sSide .on') || { dataset: { side: 'sell' } }).dataset.side, gapPct: this.sc ? this.sc.gapPct : 0 }; },
    book(s) { const p = pxOf(s) || (bars().slice(-1)[0] || {}).c || 100, a = A(), bk = a && a.dom && a.dom.length ? a.dom[a.dom.length - 1] : null; if (bk && bk.bids && bk.bids.length > 5 && bk.asks && bk.asks.length > 5) { const mid = (bk.bids[0][0] + bk.asks[0][0]) / 2; if (Math.abs(mid / p - 1) < 0.02) return { mid, bids: bk.bids, asks: bk.asks, live: true }; } const B = bars().slice(-20), dv = B.length ? mean(B.map((b) => (b.v || 0) * b.c)) : 1e6; return Object.assign(V175.synthBook(p, { depthUsd: clamp(dv * 0.05, 5e4, 5e7), levels: 40, seed: String(s).length + 7 }), { live: false }); },
    pick(id) { const s = SCN.find((x) => x.id === +id); if (!s) return; this.sc = s; const set = (k, v) => { const e = $1('#' + k); if (e) { e.value = String(v); e.dispatchEvent(new Event('input')); } }; set('x175sUsd', s.orderUsd); set('x175sDep', Math.round(s.depthPct * 100)); set('x175sVol', Math.round(s.volMult * 10)); set('x175sSpf', Math.round(s.spoofPct * 100)); },
    async run() { const s = sym(), bk = this.book(s), p = this.params(), r = await Mesh.run('shock', bk, p); r.live = bk.live; r.sym = s; r.mid = bk.mid; r.pre = (p.side === 'sell' ? bk.bids : bk.asks).slice(0, 40); this.last = r; this.paint(); Flight.mark('shock', s + ' ' + f2(r.slipBps, 1) + ' bps'); bus() && bus().emit('ui', { node: 'Chart', text: '3D OB shock · ' + (this.sc ? this.sc.name : 'custom') + ' · slip ' + f2(r.slipBps, 1) + ' bps' }); return r; },
    async stressAll() {
      const s = sym(), bk = this.book(s), sc = this.sc || Object.assign({ name: 'custom' }, this.params()), rows = [];
      if (typeof ACC !== 'undefined' && ACC.pos) for (const [k, q] of Object.entries(ACC.pos)) if (q && q.qty > 0) rows.push({ sym: k, qty: q.qty, px: pxOf(k) || q.cost / q.qty, kind: 'position' });
      if (typeof ST !== 'undefined' && Array.isArray(ST.bots)) for (const b of ST.bots) if (b.run && b.account && b.account.pos) for (const [k, q] of Object.entries(b.account.pos)) if (q && q.qty > 0) rows.push({ sym: k, qty: q.qty, px: pxOf(k) || q.cost / q.qty, kind: 'bot · ' + String(b.name || b.strat || 'bot').slice(0, 16) });
      this.stress = rows.length ? await Mesh.run('stressPositions', rows, sc, bk) : { rows: [], total: 0, worst: 0, liquidations: 0, empty: true }; this.stress.scen = sc.name; this.paint(); return this.stress;
    },
    mount() {
      if (tab() !== 'lab') return; const sec = $1('#tab-lab'); if (!sec || $1('#x175Shock', sec)) return;
      const box = el('details', 'x175-shock'); box.id = 'x175Shock'; box.open = true; const sm = el('summary', null, '3D Order-Book Shock & Scenario Flight Simulator · ' + SCN.length + ' scenarios'); box.appendChild(sm);
      const row = el('div', 'x175-srow'), cat = el('select', 'in'); cat.id = 'x175sCat'; cat.setAttribute('aria-label', 'Scenario category'); cat.appendChild(new Option('All 6 categories', '')); for (const [k, n] of V175.SCEN_CATS) cat.appendChild(new Option(n, k));
      const lst = el('select', 'in'); lst.id = 'x175sList'; lst.setAttribute('aria-label', 'Scenario'); const fill = () => { lst.textContent = ''; for (const s of SCN) if (!cat.value || s.cat === cat.value) lst.appendChild(new Option(s.id + ' · ' + s.catName + ' · ' + s.name, String(s.id))); }; fill(); cat.addEventListener('change', fill); lst.addEventListener('change', () => this.pick(lst.value));
      row.append(cat, lst); box.appendChild(row);
      const sl = el('div', 'x175-sliders'); for (const [id, lab, mn, mx, val, fmt] of [['x175sUsd', 'Order Size $', 1000, 5000000, 250000, (v) => money(+v)], ['x175sDep', 'Book Depth %', 5, 100, 60, (v) => v + '%'], ['x175sVol', 'Vol Multiplier', 10, 60, 15, (v) => (v / 10).toFixed(1) + '×'], ['x175sSpf', 'Spoof Pull %', 0, 95, 20, (v) => v + '%']]) { const lb = el('label', 'x175-sl'), r = el('input'); r.type = 'range'; r.id = id; r.min = String(mn); r.max = String(mx); r.value = String(val); if (id === 'x175sUsd') r.step = '1000'; const o = el('b', null, fmt(val)); r.addEventListener('input', () => { o.textContent = fmt(r.value); }); lb.append(el('span', null, lab), r, o); sl.appendChild(lb); } box.appendChild(sl);
      const ctl = el('div', 'x175-srow'), side = el('div', 'seg'); side.id = 'x175sSide'; for (const sd2 of ['sell', 'buy']) { const b = el('button', sd2 === 'sell' ? 'on' : '', sd2 === 'sell' ? 'Market sell' : 'Market buy'); b.type = 'button'; b.dataset.side = sd2; side.appendChild(b); } side.addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (!b) return; for (const x of $$1('[data-side]', side)) x.classList.toggle('on', x === b); });
      const run = el('button', 'btn pri', 'Run Shock'); run.type = 'button'; run.id = 'x175sRun'; run.addEventListener('click', () => this.run().catch((e) => T('Shock failed: ' + e.message, 'dn')));
      const st = el('button', 'btn', 'Stress-Test My Open Positions & Active Bots'); st.type = 'button'; st.id = 'x175sStress'; st.addEventListener('click', () => this.stressAll().catch((e) => T('Stress test failed: ' + e.message, 'dn')));
      ctl.append(side, run, st); box.appendChild(ctl);
      const out = el('div', 'x175-sout'), cv = el('canvas'); cv.id = 'x175sCv'; cv.setAttribute('aria-label', '3D order book before and after the shock'); const dl = el('dl', 'x175-dl'); dl.id = 'x175sDl'; out.append(cv, dl); box.appendChild(out); const sp = el('div', 'x175-stress'); sp.id = 'x175sSt'; box.appendChild(sp);
      const bar = $1(':scope > .x171-search', sec), sc2 = $1(':scope > .x175-scene', sec); (sc2 || bar) ? (sc2 || bar).after(box) : sec.prepend(box);
      Loop.add(cv, () => this.draw(cv), 30); this.pick(SCN[0].id);
    },
    paint() {
      const r = this.last, dl = $1('#x175sDl'); if (dl && r) { dl.textContent = ''; for (const [k, v, c] of [['symbol', r.sym + (r.live ? ' · live L2' : ' · model book'), ''], ['scenario', this.sc ? this.sc.name : 'custom', ''], ['filled', money(r.filledUsd) + (r.unfilledUsd > 1 ? ' · ' + money(r.unfilledUsd) + ' unfilled' : ''), r.unfilledUsd > 1 ? 'dn' : ''], ['avg fill slippage', f2(r.slipBps, 1) + ' bps', r.slipBps > 50 ? 'dn' : 'up'], ['impact (last level)', f2(r.impactBps, 1) + ' bps', ''], ['levels swept', String(r.levels), ''], ['post-shock move', (r.movePct >= 0 ? '+' : '') + f2(r.movePct, 2) + '%', r.movePct < 0 ? 'dn' : 'up']]) { const dt = el('dt', null, k), dd = el('dd', c, v); dl.append(dt, dd); } }
      const sp = $1('#x175sSt'), s = this.stress; if (sp && s) { sp.textContent = ''; if (s.empty) { sp.appendChild(el('p', 'note', 'No open positions or running bots to stress. Open a paper position or start a bot, then run it again.')); return; } sp.appendChild(el('p', 'note', 'Scenario “' + s.scen + '”: total ' + money(s.total) + ' · worst ' + money(s.worst) + ' · ' + s.liquidations + ' liquidation(s)')); const t = el('table', 'x175-t mono'), hd = el('tr'); for (const h of ['symbol', 'kind', 'value', 'P&L', 'exit slip']) hd.appendChild(el('th', null, h)); t.appendChild(hd); for (const x of s.rows) { const tr = el('tr'); for (const [v, c] of [[x.sym, ''], [x.kind, ''], [money(x.value), ''], [money(x.pnl), x.pnl < 0 ? 'dn' : 'up'], [f2(x.slipBps, 1) + ' bps', '']]) tr.appendChild(el('td', c, v)); t.appendChild(tr); } sp.appendChild(t); }
    },
    draw(cv) {
      const d = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height, r = this.last; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAL.obs; g.fillRect(0, 0, W, H);
      const t = performance.now() / 1000, P = proj(-0.7 + Math.sin(t * 0.3) * 0.15, 0.5, W, H, 1.05);
      if (!r) { g.fillStyle = PAL.mut; g.font = `600 ${11 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.fillText('Pick a scenario and press Run Shock', W / 2, H / 2); return; }
      const n = Math.min(40, r.pre.length), mxq = Math.max(1e-9, ...r.pre.slice(0, n).map((x) => x[1] * x[0])), bar = (i, h, z, col, al) => { const x0 = -1 + (i / n) * 2, x1 = x0 + 1.6 / n, y0 = -0.8, y1 = y0 + h * 1.5, q = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z), P(x1, y0, z + 0.25), P(x1, y1, z + 0.25), P(x0, y1, z + 0.25)]; g.fillStyle = `rgba(${col},${al})`; g.beginPath(); [0, 1, 2, 3].forEach((k, j) => (j ? g.lineTo(q[k][0], q[k][1]) : g.moveTo(q[k][0], q[k][1]))); g.closePath(); g.fill(); g.fillStyle = `rgba(${col},${al * 0.6})`; g.beginPath(); g.moveTo(q[3][0], q[3][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[5][0], q[5][1]); g.lineTo(q[6][0], q[6][1]); g.closePath(); g.fill(); };
      for (let i = 0; i < n; i++) { bar(i, (r.pre[i][1] * r.pre[i][0]) / mxq, -0.5, RGB.gold, 0.35); const post = r.book[i] ? (r.book[i][1] * r.book[i][0]) / mxq : 0, swept = i < r.levels; bar(i, swept ? post * Math.max(0, 1 - 0.5 * (1 + Math.sin(t * 4 + i))) : post, 0.2, swept ? RGB.dn : RGB.up, 0.8); }
      g.fillStyle = PAL.ink; g.font = `600 ${10 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'left'; g.fillText('back: book before · front: after the shock (crimson = levels swept by the order)', 10 * d, H - 10 * d);
    },
  };

  /* ══ 7. Working Bots squad + 4D core + 8 quant panels (inside THE SYNAPSE) ══ */
  const Squad = U.squad = new V175.Squad();
  const SQ = { heat: new V173.Heat(6, 30), thru: new V173.Thru(40), demoT: 0, fx: [], quant: {}, qAt: 0, samples: new Map(), sAt: 0, tsArms: null, log: [], eq: [], eqAt: 0, cam: { yaw: 0, pitch: 0.42, zoom: 1 }, lanesAt: 0, lanes: [] };
  U.sq = SQ;
  const realBots = () => { let n = 0; try { if (typeof ST !== 'undefined' && Array.isArray(ST.bots)) n += ST.bots.filter((b) => b.run).length; const a = A(); if (a && a.Fleet && a.Fleet.on && a.cfg && a.cfg.mode && a.cfg.mode !== 'off') n += 1; } catch (e) { /* not ready */ } return n; };
  const onBus = (e) => { Flight.push(e); const k = Squad.feed(e, Date.now()); if (k < 0) return; SQ.log.unshift({ t: Date.now(), k, text: String(e.text || e.type || '').slice(0, 90), demo: e.src === 'demo' }); if (SQ.log.length > 40) SQ.log.pop(); SQ.heat.hit(k, Date.now()); SQ.thru.add(/loss|block|stale|flatten|dn/i.test(e.type + (e.text || '')) ? 'dn' : /win|fill|pass/i.test(e.type) ? 'up' : 'gold', Date.now()); SQ.fx.push({ k, t: performance.now() }); if (SQ.fx.length > 40) SQ.fx.shift(); Sonar.ping(k); };
  const DEMO = [['scan', 'HUNTER-α scan: 3 screener hits'], ['fill', 'SNIPER-EXEC fill 0.42 @ market'], ['win', 'SCALPER-EXIT take-profit +1.8R'], ['gate', 'RISK-GUARD firewall pass (10/10)'], ['evolve', 'MUTATOR-EVO evolution: Sharpe 1.41 → 1.58'], ['hedge', 'HEDGER-ARB basis hedge 3.1 bps'], ['block', 'RISK-GUARD block: size over cap'], ['loss', 'SCALPER-EXIT stop −1R']];
  const demoTick = () => { if (!Squad.demoOn) return; if (realBots() > 0) { Squad.demoOn = false; paintDemo(); T('Real bots are running: the demo stopped (only real events are shown now)', 'amb'); return; } const [type, text] = DEMO[Math.floor(Math.random() * DEMO.length)]; onBus({ type, text: 'DEMO · ' + text, src: 'demo', node: 'Bots', lat: 0.2 + Math.random() * 1.6, t: Date.now() }); };
  const paintDemo = () => { const b = $1('#x175Demo'); if (b) { b.textContent = Squad.demoOn ? 'Stop Live Demo' : 'Explore Live Demo'; b.classList.toggle('on', Squad.demoOn); b.setAttribute('aria-pressed', String(Squad.demoOn)); } };
  /* v17.6: 3 wide panels (was 8) under the 4D singularity; the squad roster stays in the DOM for screen readers, the canvas draws it as 6 orbiting nodes */
  const PANELS = [['attr', '3D Strange Attractor & Merton Probability Cone'], ['sonar', 'Eigen-Risk Sonar & Worker Mesh Telemetry'], ['kpi', 'Squad Execution Stream & Live KPIs']];
  /* drag-orbit + wheel-zoom for a camera { yaw, pitch, zoom } (the canvas keeps its DOM events after transferControlToOffscreen) */
  const orbit = (cv, cam, onTap) => {
    let drag = null; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ } });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; cam.yaw += (e.clientX - drag.x) * 0.008; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.006, -0.2, 1.3); drag.x = e.clientX; drag.y = e.clientY; });
    cv.addEventListener('pointerup', (e) => { if (drag && onTap && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) onTap(e); drag = null; });
    cv.addEventListener('pointercancel', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.5); }, { passive: false });
  };
  U.orbit = orbit;
  const mountSquad = () => {
    const root = $1('#x172Syn'); if (!root || $1('#x175Sq', root)) return !!(root && $1('#x175Sq', root));
    const sq = el('section', 'x175-sq'); sq.id = 'x175Sq'; sq.setAttribute('aria-label', 'Working Bots squad');
    const top = el('div', 'x175-sqtop'), core = el('canvas', 'x175-core'); core.id = 'x175Core'; core.setAttribute('aria-label', '4D psychedelic singularity: rotating tesseract, Hopf-fibration torus knots, accretion vortex, L-system dendrites and plasma arcs to the 6 squad bots (drag to orbit, wheel to zoom)'); top.appendChild(core);
    const side = el('div', 'x175-sqside'), hd = el('div', 'x175-sqh'); hd.append(el('b', null, '// WORKING BOTS'), el('span', 'x175-mode', 'STANDBY')); const db = el('button', 'btn sm x175-demo', 'Explore Live Demo'); db.type = 'button'; db.id = 'x175Demo'; db.setAttribute('aria-pressed', 'false'); db.title = 'Clearly labelled DEMO events; never shown while a real bot runs'; db.addEventListener('click', () => { if (!Squad.demoOn && realBots() > 0) { T('Real bots are running: only real events are shown', 'amb'); return; } Squad.demoOn = !Squad.demoOn; paintDemo(); }); hd.appendChild(db); side.appendChild(hd);
    const ul = el('ul', 'x175-bots x176-sr'); ul.id = 'x175Bots'; V175.SQUAD.forEach(([id, name, role], k) => { const li = el('li'); li.dataset.k = String(k); li.append(el('b', null, name), el('span', 'x175-st', 'STANDBY'), el('em', null, role), el('i', 'x175-last', '–')); ul.appendChild(li); }); side.appendChild(ul); top.appendChild(side); sq.appendChild(top);
    const grid = el('div', 'x175-grid'); for (const [k, t] of PANELS) { const c = el('div', 'x172-card x175-p'); c.dataset.p = k; c.append(el('h4', null, '// ' + t)); const b = el('div', 'x175-pb'); b.id = 'x175P_' + k; c.appendChild(b); grid.appendChild(c); } sq.appendChild(grid);
    const mx = $1('#x173Mx', root); if (mx) mx.after(sq); else root.appendChild(sq);
    for (const k of ['attr', 'sonar']) { const cv = el('canvas'); cv.id = 'x175C_' + k; $1('#x175P_' + k).appendChild(cv); }
    $1('#x175P_attr').appendChild(el('p', 'note mono x175-q', '')).id = 'x175Qattr'; $1('#x175P_attr').appendChild(el('p', 'note mono x175-q', '')).id = 'x175Qcone'; $1('#x175P_sonar').appendChild(el('p', 'note mono x175-q', '')).id = 'x175Qsonar';
    const mt = el('table', 'x175-t mono'); mt.id = 'x175MeshT'; const mw = el('div', 'x176-mesh'); mw.appendChild(mt); $1('#x175P_sonar').append(mw, el('dl', 'x175-dl x176-fb')); $1('#x175P_sonar .x176-fb').id = 'x175Kpi';
    const kb = $1('#x175P_kpi'), tiles = el('div', 'x176-kpis'); tiles.id = 'x176Kpi'; for (const [k, l] of [['mode', 'Mode'], ['win', 'Win Rate'], ['pf', 'Profit Factor'], ['sh', 'Sharpe (per trade)'], ['n', 'Closed trades'], ['bots', 'Real bots']]) { const d0 = el('div', 'x176-kt'); d0.dataset.k = k; d0.append(el('span', null, l), el('b', null, '–')); tiles.appendChild(d0); }
    const eq = el('canvas', 'x176-eq'); eq.id = 'x175C_eq'; const lg = el('ul', 'x176-log mono'); lg.id = 'x176Log'; lg.setAttribute('aria-live', 'polite'); kb.append(tiles, eq, lg);
    panel(core, 'sing', coreState, 240); panel($1('#x175C_attr'), 'ac', attrState, 45); panel($1('#x175C_sonar'), 'sonar2', sonarState, 45); panel(eq, 'eq', eqState, 4);
    orbit(core, SQ.cam);
    const cc = $1('#x175C_attr'); cc.addEventListener('pointermove', (e) => { const b = cc.getBoundingClientRect(); SQ.hover = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; }); cc.addEventListener('pointerleave', () => { SQ.hover = null; });
    return true;
  };
  /* panels render in the 3D Spatial worker (OffscreenCanvas) from a per-frame state snapshot; main-thread fallback runs the same
     V175.R renderer. Main-thread cost per panel per frame = building the snapshot + one postMessage. */
  const Panels = U.panels = { off: 0, list: [], rstat: {} };
  const panel = (cv, kind, state, cap) => {
    const L = Mesh.lanes.spatial; let off = false; const memo = {}, P = { cv, kind, off: false, data: null, sent: null };
    if (L && L.w && typeof cv.transferControlToOffscreen === 'function') { try { const oc = cv.transferControlToOffscreen(); L.w.postMessage({ render: 'init', id: cv.id, kind, canvas: oc }, [oc]); off = true; Panels.off++; } catch (e) { off = false; } }
    P.off = off; const g = off ? null : cv.getContext('2d'); Panels.list.push(P);
    Loop.add(cv, (now, dt) => {
      const sz = SIZE.get(cv) || [cv.clientWidth, cv.clientHeight], d = DPR(), s = state(now, dt) || {}; s.W = Math.max(1, Math.round(sz[0] * d)); s.H = Math.max(1, Math.round(sz[1] * d)); s.d = d; s.t = now / 1000;
      if (s.data !== undefined) { if (s.data === P.sent) delete s.data; else P.sent = s.data; } // big payloads travel once
      if (off) { L.w.postMessage({ render: 'frame', id: cv.id, s }); return; }
      if (s.data !== undefined) P.data = s.data; s.data = P.data; if (cv.width !== s.W) cv.width = s.W; if (cv.height !== s.H) cv.height = s.H; V175.R[kind](g, s, memo);
    }, cap);
    return P;
  };
  U.panel = panel; // v17.6 Alpha Radar dome reuses the same off-thread path
  /* the singularity's per-frame snapshot: squad roster refreshed 4×/s (cheap), camera + fires every frame */
  const coreState = (now) => { if (!SQ.cs || now - SQ.csAt > 250) { const K = Squad.kpis(), w = Date.now(); SQ.csAt = now; SQ.cs = { mode: K.mode, active: K.active, real: Squad.realEvents, demo: Squad.demoEvents, nodes: Squad.m.map((b, k) => ({ n: b.name, st: Squad.status(k, w), f: b.fires })) }; } SQ.fx = SQ.fx.filter((f) => now - f.t < 650); return Object.assign({}, SQ.cs, { yaw: SQ.cam.yaw, pitch: SQ.cam.pitch, zoom: SQ.cam.zoom, fx: SQ.fx.map((f) => ({ k: f.k, age: (now - f.t) / 650, seed: f.t })) }); };  const quantRefresh = async () => {
    if (Date.now() - SQ.qAt < 8000) return; SQ.qAt = Date.now(); const B = bars().slice(-400), c = B.map((b) => b.c); if (c.length < 60) return; const r = rets(c), S0 = c[c.length - 1];
    const dtMs = B.length > 2 ? (msOf(B[B.length - 1].t) - msOf(B[0].t)) / (B.length - 1) : 3600e3, perYear = clamp((365 * 864e5) / (dtMs > 0 ? dtMs : 3600e3), 1, 600000), s = sd(r) || 0.01, big = r.filter((x) => Math.abs(x) > 4 * s);
    /* drift from a few hundred bars is mostly noise: shrink it 80 % toward 0 before it drives the cone and Kelly */
    const opt = { mu: clamp(mean(r) * perYear * 0.2, -1, 1), sigma: clamp(s * Math.sqrt(perYear), 0.05, 5), lambda: clamp((big.length / r.length) * perYear, 0, 50), muJ: big.length ? mean(big) : -0.02, sigJ: big.length > 1 ? sd(big) : 0.05, T: 60 / perYear, steps: 60, paths: 100, seed: 42 };
    try {
      const [mt, h, pe, ly, lz, rs] = await Promise.all([Mesh.run('merton', S0, opt), Mesh.run('hurst', V175.pack(r)), Mesh.run('permEntropy', V175.pack(r)), SQ.quant.lyap != null ? Promise.resolve(SQ.quant.lyap) : Mesh.run('lyapunov', { steps: 15000 }), SQ.quant.lz ? Promise.resolve(SQ.quant.lz) : Mesh.run('lorenz', 3000), SQ.quant.rs ? Promise.resolve(SQ.quant.rs) : Mesh.run('rossler', 3000)]);
      Object.assign(SQ.quant, { mt, h, pe, lyap: ly, lz, rs, sym: sym(), opt, S0, tstat: mean(r) / ((sd(r) || 1) / Math.sqrt(r.length)) }); // drift t-stat gates the Kelly readout
    } catch (e) { SQ.quant.err = e.message; }
  };
  const sampleRefresh = async () => { // live price rings for the eigen-risk sonar / RMT / transfer entropy (positions first, then live quotes)
    if (Date.now() - SQ.sAt < 2000) return; SQ.sAt = Date.now(); const want = []; if (typeof ACC !== 'undefined' && ACC.pos) for (const k of Object.keys(ACC.pos)) if (ACC.pos[k].qty > 0) want.push(k); if (sym()) want.push(sym()); const L = typeof Feed !== 'undefined' && Feed.live ? Feed.live : {}; for (const k of Object.keys(L)) if (want.length < 8 && !want.includes(k) && L[k] && L[k].price > 0) want.push(k);
    for (const k of want.slice(0, 8)) { const p = pxOf(k); if (!(p > 0)) continue; const a = SQ.samples.get(k) || []; a.push(p); if (a.length > 180) a.shift(); SQ.samples.set(k, a); }
    const ks = [...SQ.samples.keys()].filter((k) => SQ.samples.get(k).length >= 30); if (ks.length >= 2) { const n = Math.min(...ks.map((k) => SQ.samples.get(k).length)), R = ks.map((k) => rets(SQ.samples.get(k).slice(-n))), ok = R.every((x) => sd(x) > 0); if (ok) { const w = ks.map((k) => (typeof ACC !== 'undefined' && ACC.pos && ACC.pos[k] ? ACC.pos[k].qty * pxOf(k) : 0)), tw = w.reduce((s, x) => s + x, 0); SQ.eig = await Mesh.run('eigenRisk', R, tw > 0 ? w.map((x) => x / tw) : null).catch(() => null); if (SQ.eig) { SQ.eig.syms = ks; SQ.eig.usd = tw; } } }
  };
  const setTxt = (id, tx) => { const q = document.getElementById(id); if (q && q.textContent !== tx) q.textContent = tx; };
  /* panel 1: attractor + Merton cone share one canvas; the payload object is rebuilt (and re-sent once) only when a refresh lands */
  const attrState = () => { const Q = SQ.quant, M = Q.mt; if (Q.lz) setTxt('x175Qattr', `${Q.sym} · Hurst H ${f2(Q.h, 3)} (${Q.h > 0.55 ? 'trending' : Q.h < 0.45 ? 'mean-reverting' : 'random-walk'}) · Lorenz λ₁ ${f2(Q.lyap, 3)} · perm. entropy ${f2(Q.pe, 3)}`); if (M) coneTxt(); if (!Q.lz && !M) return { data: null }; if (!Q.acData || Q.acData.mt !== M || Q.acData.lz !== Q.lz) Q.acData = { mt: M, lz: Q.lz, rs: Q.rs, bands: M ? M.bands : null, steps: M ? M.steps : 0 }; const D = Q.acData; return { data: D.sent || (D.sent = { lz: D.lz, rs: D.rs, bands: D.bands, steps: D.steps }), hover: SQ.hover || null }; };
  const coneTxt = () => { const Q = SQ.quant, M = Q.mt; setTxt('x175Qcone', `${M.positive ? '+EV' : '−EV'} ${f2(M.ev * 100, 2)}% · Kelly f* ${Math.abs(Q.tstat || 0) < 2 ? '0 (drift t = ' + f2(Q.tstat, 1) + ', not significant)' : M.kelly > 0 ? f2(M.kelly * 100, 1) + '% long' : M.kelly < 0 ? f2(-M.kelly * 100, 1) + '% short' : '0 (no edge)'} · 95% VaR ${f2(M.var95 * 100, 2)}% · CVaR ${f2(M.cvar95 * 100, 2)}% · λ ${Q.opt.lambda >= 50 ? '≥ 50 (capped)' : f2(Q.opt.lambda, 1)}/yr jumps`); };
  const sonarState = () => { const e = SQ.eig; setTxt('x175Qsonar', e ? `top factor ${f2(e.share[0] * 100, 0)}% of variance · portfolio σ ${f2(e.sigma * 100, 2)}%/sample · −3σ ${e.usd > 0 ? money(-e.usd * e.loss3s) : f2(-e.loss3s * 100, 2) + '%'} · ${e.syms.length} symbols` : `collecting live samples (${Math.max(0, ...[...SQ.samples.values()].map((a) => a.length))}/30)…`); if (performance.now() - SQ.lanesAt > 500) { SQ.lanesAt = performance.now(); SQ.lanes = Object.values(Mesh.lanes).map((L) => { const t = L.tele.stats(); return [L.name, +t.avg.toFixed(3), +t.p99.toFixed(3), Mesh.state(L), t.q]; }); } return { eig: e ? { syms: e.syms, top: e.top, loss3s: e.loss3s } : null, lanes: SQ.lanes }; };
  const eqState = () => ({ data: SQ.eqD || null });
  /* panel 3: KPIs from REAL running bots only (closed paper/live trades of ST.bots with run = true); demo fires never count */
  const runningBots = () => { try { return typeof ST !== 'undefined' && Array.isArray(ST.bots) ? ST.bots.filter((b) => b.run && b.account) : []; } catch (e) { return []; } };
  const paintKpis = (K, now) => {
    const bs = runningBots(), pn = []; for (const b of bs) for (const t of b.account.trades || []) if (t.side === 'sell' && fin(t.pnl)) pn.push(t.pnl); const R = V176.kpis(pn);
    if (now - SQ.eqAt > 2000) { SQ.eqAt = now; if (bs.length) { let eq = 0; try { const pm = typeof priceMap === 'function' ? priceMap() : {}; for (const b of bs) eq += typeof b.account.equity === 'function' ? b.account.equity(pm) : b.account.cash || 0; } catch (e) { eq = NaN; } if (fin(eq)) { SQ.eq.push(eq); if (SQ.eq.length > 150) SQ.eq.shift(); SQ.eqD = { eq: SQ.eq.slice() }; } } else if (SQ.eq.length) { SQ.eq = []; SQ.eqD = null; } }
    const v = { mode: K.mode, win: R.win == null ? '–' : f2(R.win * 100, 1) + '%', pf: R.pf == null ? '–' : R.pf === Infinity ? '∞' : f2(R.pf, 2), sh: R.sharpe == null ? '–' : f2(R.sharpe, 2), n: String(R.n), bots: String(bs.length) };
    for (const d0 of $$1('#x176Kpi .x176-kt')) { const b = d0.lastChild, tx = v[d0.dataset.k]; if (b.textContent !== tx) { b.textContent = tx; b.className = d0.dataset.k === 'mode' ? (K.mode === 'LIVE BOTS' ? 'up' : K.mode === 'DEMO' ? 'gold' : '') : ''; } }
    const lg = $1('#x176Log'); if (lg && lg._n !== SQ.log.length + ':' + (SQ.log[0] ? SQ.log[0].t : 0)) { lg._n = SQ.log.length + ':' + (SQ.log[0] ? SQ.log[0].t : 0); lg.textContent = ''; if (!SQ.log.length) lg.appendChild(el('li', 'x176-none', bs.length ? 'waiting for the first squad event from your running bots…' : 'no squad events yet: start a bot in Bots (or Explore Live Demo, labelled DEMO)')); for (const e of SQ.log.slice(0, 14)) { const li = el('li', e.demo ? 'demo' : 'real'); li.append(el('time', null, new Date(e.t).toLocaleTimeString('en-US', { hour12: false })), el('b', null, NAMES[e.k] || '?'), el('span', null, e.text)); lg.appendChild(li); } }
  };
  const NAMES = V175.SQUAD.map((q) => q[1]);
  const paintSquadDom = () => {
    if (!$1('#x175Sq')) return; const now = Date.now(); Squad.setReal(realBots()); const K = Squad.kpis(now), md = $1('#x175Sq .x175-mode'); if (md && md.textContent !== K.mode) { md.textContent = K.mode; md.className = 'x175-mode ' + (K.mode === 'LIVE BOTS' ? 'up' : K.mode === 'DEMO' ? 'gold' : ''); }
    for (const li of $$1('#x175Bots li')) { const k = +li.dataset.k, b = Squad.m[k], s = Squad.status(k, now), st = $1('.x175-st', li), la = $1('.x175-last', li); if (st.textContent !== s) { st.textContent = s; st.className = 'x175-st ' + (s === 'ACTIVE' ? 'up' : /DEMO/.test(s) ? 'gold' : ''); } const tx = b.last ? b.last + ' · ' + b.fires + ' fires' : '–'; if (la.textContent !== tx) la.textContent = tx; }
    paintKpis(K, now);
    const kp = $1('#x175Kpi'); if (kp) { const fb = Loop.budget(), rows = [['fire latency p99', f2(K.p99, 2) + ' ms'],['v17.5 main-thread frame work p95', f2(fb.p95, 3) + ' ms'], ['off-thread panels (Spatial lane)', Panels.off + ' / ' + Panels.list.length + (Object.keys(Panels.rstat).length ? ' · ' + f2(Object.values(Panels.rstat).reduce((s, r) => s + r.ms, 0), 2) + ' ms/frame in worker' : '')], ['render loop', fb.fps + ' fps']]; kp.textContent = ''; for (const [k, v] of rows) kp.append(el('dt', null, k), el('dd', null, v)); }
    const mt = $1('#x175MeshT'); if (mt) { mt.textContent = ''; const hd = el('tr'); for (const h of ['lane', 'state', 'jobs', 'q', 'avg', 'p99']) hd.appendChild(el('th', null, h)); mt.appendChild(hd); for (const L of Object.values(Mesh.lanes)) { const s = L.tele.stats(), tr = el('tr'); for (const v of [L.name, Mesh.state(L), String(s.jobs), String(s.q), f2(s.avg, 2), f2(s.p99, 2)]) tr.appendChild(el('td', null, v)); mt.appendChild(tr); } const sv = Mesh.srv; if (sv && sv.lanes) for (const r of sv.lanes) { const tr = el('tr', 'x175-srv'); for (const v of ['py · ' + r.name, (r.kind === 'process' ? 'PROC ' : r.kind.toUpperCase() + ' ') + r.state.toUpperCase(), String(r.jobs), String(r.q), f2(r.avg, 2), f2(r.p99, 2)]) tr.appendChild(el('td', null, v)); mt.appendChild(tr); } else { const tr = el('tr', 'x175-srv'), td = el('td', null, 'serve.py lanes: open ExTerm through the launcher to see the 4 Python lanes'); td.colSpan = 6; tr.appendChild(td); mt.appendChild(tr); } }
    const ol = $1('#x175EngL'); if (ol && (!ol._at || now - ol._at > 2000)) { ol._at = now; ol.textContent = ''; for (const [name, , ws] of V175.ENGINES) { const v = U.edgeVals[name], li = el('li', v ? 'up' : ''); li.append(el('span', null, name), el('b', null, v || 'standby · ' + ws)); ol.appendChild(li); } }
  };

  /* ══ 8. 30 edge engines, computed in the lanes for the active symbol ══ */
  U.edgeCache = {}; U.edgeVals = {};
  const tickT = new Map(); // tick arrival times per symbol (Hawkes)
  const EDGE = {
    async markets() {
      const B = bars().slice(-200); if (B.length < 40) return []; const c = B.map((b) => b.c), r = rets(c), last = c[c.length - 1], atr = mean(B.slice(-14).map((b) => b.h - b.l)), vs = B.slice(-30), u = Math.max(1e-9, mean(vs.map((b) => b.v || 0)) / 40), bu = vs.map((b) => { const n = Math.max(1, Math.round((b.v || 0) / u)), clv = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5; return Math.round(n * (0.25 + 0.5 * clv)); }), se = vs.map((b, i) => Math.max(0, Math.max(1, Math.round((b.v || 0) / u)) - bu[i]));
      const L = typeof Feed !== 'undefined' && Feed.live ? Feed.live[sym()] || {} : {}, spread = L.bid > 0 && L.ask > 0 ? (L.ask / L.bid - 1) * 1e4 : 4, adv = mean(B.slice(-24).map((b) => (b.v || 0) * b.c)) * 24 || 1e7;
      const [pin, kf, cy, ot, ac] = await Promise.all([Mesh.run('pin', bu, se), Mesh.run('kalman', V175.pack(c.slice(-120))), Mesh.run('cycle', V175.pack(c.slice(-128))), Mesh.run('orderType', { spreadBps: spread, volBps: (sd(r) || 0.001) * 1e4, urgency: 0.5, sizePctAdv: 10000 / adv }), Mesh.run('almgrenChriss', 100000 / last, 10, { sigma: sd(r) || 0.01, eta: 2.5e-7, lambda: 1e-6 })]);
      const br = V175.E.shadowBracket(last, 'long', atr), a = A(), dom = a && a.dom ? a.dom.slice(-30) : [], wall = dom.length ? (dom[dom.length - 1].bids || []).reduce((m, x) => (x[1] > m[1] ? x : m), [0, 0]) : null; let hl = null; if (wall && wall[0] > 0 && dom.length >= 4) { const ts = [], sz = []; dom.forEach((bk, i) => { const lv = (bk.bids || []).find((x) => Math.abs(x[0] / wall[0] - 1) < 1e-6); if (lv) { ts.push(i); sz.push(lv[1]); } }); if (ts.length >= 3) hl = V175.E.spoofHalfLife(ts, sz); }
      const slope = (kf[kf.length - 1] / kf[kf.length - 6] - 1) * 100;
      return [['Easley-O\'Hara Pin-Score', 'PIN ' + f2(pin.pin, 3)], ['Adaptive Kalman Filter', (slope >= 0 ? '+' : '') + f2(slope, 3) + '% / 5 bars'], ['Wavelet / FFT Cycle', f2(cy.period, 1) + '-bar cycle'], ['Optimal Order-Type Selector', ot.best + ' (' + f2(ot.cost[ot.best], 1) + ' bps)'], ['Almgren-Chriss Slicer', 'slice 1 = ' + f2((ac.trades[0] / (100000 / last)) * 100, 1) + '% of $100k'], ['Stealth IOC Shadow-Bracket', 'stop ' + f2(br.stop, last < 10 ? 5 : 2) + ' · TP ' + f2(br.tp, last < 10 ? 5 : 2)], ['Spoof-Elasticity Half-Life', hl && fin(hl.halfLife) ? f2(hl.halfLife, 1) + ' snapshots' : 'tracking L2 wall…'], ['Draw-Pattern-to-Bot Compiler', 'ready · draw a trendline then Compile'], ['WebAudio Sonar', Sonar.on ? 'ON' : 'off · toggle in Synapse'], ['Voice HUD (Shift+V)', 'Shift+V'], ['60 s Flight Recorder (Shift+R)', Flight.buf.length + ' events buffered']];
    },
    async whales() {
      const s = sym(), st = typeof OC !== 'undefined' && OC.stats ? OC.stats[s] || {} : {}, liq = +st.liq || 0, W = typeof TOP_WALLETS !== 'undefined' && Array.isArray(TOP_WALLETS) ? TOP_WALLETS : [], out = [];
      const [m1, m2] = await Promise.all([Mesh.run('mevSandwich', { sizeUsd: 1000, liqUsd: liq || 250000, slipTol: 0.01, gasUsd: 0.5 }), Mesh.run('mevSandwich', { sizeUsd: 10000, liqUsd: liq || 250000, slipTol: 0.01, gasUsd: 0.5 })]);
      out.push(['MEV Sandwich Predictor', '$1k ' + f2(m1.prob * 100, 0) + '% · $10k ' + f2(m2.prob * 100, 0) + '%' + (liq ? '' : ' (model pool)')]);
      const B = bars().slice(-60), tr = []; B.forEach((b, i) => { const n = Math.min(6, Math.max(1, Math.round(Math.log10(1 + (b.v || 0))))); for (let k = 0; k < n; k++) tr.push({ from: 'w' + ((i * 7 + k * 3) % (11 + (i % 5))), to: 'w' + ((i * 5 + k * 11) % (13 + (i % 3))) }); });
      if (tr.length) { const ws = await Mesh.run('washScore', tr); out.push(['Sybil Wash-Trading Entropy', ws.score + '/100 · H ' + f2(ws.entropy, 2) + ' bits (bar-derived proxy)']); }
      if (W.length) { const top = W.slice().sort((a, b) => (b.pnl || 0) - (a.pnl || 0))[0], wr = ((top.w || 0) + 1) / ((top.w || 0) + (top.l || 0) + 2); out.push(['Smart-Money Half-Life & 30d Board', String(top.name || '').slice(0, 10) + ' · ' + f2(top.pnl, 1) + ' · win ' + f2(wr * 100, 0) + '%']); }
      return out;
    },
    async opts() {
      const s = sym(), spot = pxOf(s) || (bars().slice(-1)[0] || {}).c; if (!(spot > 0) || typeof V17P === 'undefined' || !V17P.modelChain) return []; const ch = V17P.modelChain(spot, s.length + 3), Ks = [...new Set(ch.map((o) => o.strike))].sort((a, b) => a - b), iv = mean(ch.map((o) => o.iv || 0.5)), T = 7 / 365;
      const C = Ks.map((k) => V175.E.bsCall(spot, k, T, 0.04, iv)), cOI = Ks.map((k) => (ch.find((o) => o.strike === k && o.type === 'C') || {}).oi || 0), pOI = Ks.map((k) => (ch.find((o) => o.strike === k && o.type === 'P') || {}).oi || 0);
      const [bl, gv, mp] = await Promise.all([Mesh.run('breedenLitzenberger', Ks, C, 0.04, T), Mesh.run('gvc', spot, ch.map((o) => ({ K: o.strike, T, iv: o.iv, oi: o.oi, type: o.type === 'P' ? 'put' : 'call' })), 0.04), Mesh.run('maxPain', Ks, cOI, pOI)]); const pr0 = V175.E.pinRisk(spot, mp.strike, 0.5, iv), pr7 = V175.E.pinRisk(spot, mp.strike, 7, iv);
      return [['Breeden-Litzenberger RND', 'mean ' + f2(bl.mean, 2) + ' · mass ' + f2(bl.mass, 2) + ' (model chain)'], ['Gamma-Vanna-Charm Vector', 'Γ ' + f2(gv.gamma, 0) + ' · vanna ' + f2(gv.vanna, 0) + ' · charm ' + f2(gv.charm, 0)], ['0DTE-7DTE Pin-Risk & Max-Pain Drift', 'max pain ' + f2(mp.strike, 2) + ' · pin 0DTE ' + f2(pr0.pinProb * 100, 0) + '% / 7DTE ' + f2(pr7.pinProb * 100, 0) + '%']];
    },
    async futs() {
      const out = [], ts = (tickT.get(sym()) || []).slice(-300); if (ts.length >= 20) { const t0 = ts[0], tt = ts.map((x) => (x - t0) / 1000), T = tt[tt.length - 1] || 1, rate = tt.length / T; let best = null; for (const br of [0.2, 0.4, 0.6, 0.8]) for (const b of [0.5, 1, 2, 5]) { const h = await Mesh.run('hawkes', tt, rate * (1 - br), br * b, b, T); if (!best || h.ll > best.ll) best = h; } out.push(['Queue-Reactive Hawkes DOM', 'branching n ' + f2(best.branching, 2) + ' · λ ' + f2(best.intensity, 2) + '/s']); } else out.push(['Queue-Reactive Hawkes DOM', 'collecting ticks (' + ts.length + '/20)']);
      const a = A(), dom = a && a.dom ? a.dom.slice(-60) : []; if (dom.length >= 12) { const imb = dom.map((bk) => V175.E.bookImb(bk.bids || [], bk.asks || [], 10).imb), mid = dom.map((bk) => (bk.bids && bk.asks && bk.bids[0] && bk.asks[0] ? (bk.bids[0][0] + bk.asks[0][0]) / 2 : 0)), r = mid.slice(1).map((m, i) => (mid[i] > 0 ? m / mid[i] - 1 : 0)); const li = await Mesh.run('latencyImpulse', imb.slice(1), r, 5); out.push(['Cross-Exchange Latency Impulse', 'book→price lead ' + li.lag + ' snaps · ρ ' + f2(li.corr, 2)]); }
      return out;
    },
    async heat() { const ks = [...SQ.samples.keys()].filter((k) => SQ.samples.get(k).length >= 30); if (ks.length < 3) return [['Marchenko-Pastur RMT Filter', 'collecting live samples…']]; const n = Math.min(...ks.map((k) => SQ.samples.get(k).length)), R = ks.map((k) => rets(SQ.samples.get(k).slice(-n))); if (!R.every((x) => sd(x) > 0)) return []; const mp = await Mesh.run('marchenkoPastur', R); let best = [0, '', '']; for (let i = 0; i < Math.min(4, ks.length); i++) for (let j = 0; j < Math.min(4, ks.length); j++) if (i !== j) { const te = await Mesh.run('transferEntropy', R[i], R[j], 3); if (te > best[0]) best = [te, ks[i], ks[j]]; } return [['Marchenko-Pastur RMT Filter', mp.signal + ' signal eigen > λ+ ' + f2(mp.lambdaPlus, 2)], ['Transfer Entropy Causality', best[1] ? String(best[1]).slice(0, 10) + ' → ' + String(best[2]).slice(0, 10) + ' ' + f2(best[0], 3) + ' bits' : 'n/a']]; },
    async pulse() { const c = bars().slice(-300).map((b) => b.c); if (c.length < 60) return []; const r = rets(c), [bo, vc] = await Promise.all([Mesh.run('bocpd', V175.pack(r.map((x) => x * 100)), { hazard: 1 / 120 }), Mesh.run('volCone', V175.pack(r), [5, 10, 20, 60])]), last = bo.changes.length ? bo.changes[bo.changes.length - 1] : null, out = [['BOCPD Regime Detector', bo.changes.length + ' regime changes · current run ' + bo.runLength[bo.runLength.length - 1] + ' bars' + (last != null ? ' (since bar ' + last + ')' : '')], ['Catalyst Vol Cone', vc.cone.map((x) => x.w + 'b ' + f2(x.now * 100, 0) + '%').join(' · ')]]; const ref = [...SQ.samples.keys()].find((k) => k !== sym() && /BTC|SPY/.test(k)), a = SQ.samples.get(sym()), b = ref && SQ.samples.get(ref); if (a && b && a.length >= 30 && b.length >= 30) { const n = Math.min(a.length, b.length), cp = await Mesh.run('copula', rets(a.slice(-n)), rets(b.slice(-n))); out.push(['Clayton/Gumbel Tail Copula', 'vs ' + ref + ' τ ' + f2(cp.tau, 2) + ' · λL ' + f2(cp.clayton.lowerTail, 2) + ' · λU ' + f2(cp.gumbel.upperTail, 2)]); } else out.push(['Clayton/Gumbel Tail Copula', 'collecting a BTC / SPY reference series…']); return out; },
    async desk() { const u = UI1(), c = u && u.deriv && u.deriv.cache ? u.deriv.cache[sym()] : null, q = (c && c.q) || {}, ven = Object.keys(q).filter((v) => q[v].bid > 0 && q[v].ask > 0), out = []; if (ven.length >= 2) { const nodes = ['USD'].concat(ven.map((v) => 'COIN@' + v)), edges = []; for (const v of ven) { edges.push(['USD', 'COIN@' + v, (1 / q[v].ask) * 0.999]); edges.push(['COIN@' + v, 'USD', q[v].bid * 0.999]); } for (const a2 of ven) for (const b of ven) if (a2 !== b) edges.push(['COIN@' + a2, 'COIN@' + b, 0.9995]); const bf = await Mesh.run('bellmanFord', nodes, edges); out.push(['Bellman-Ford Arb + Liq Heatmap', bf.arb ? 'ARB ' + f2(bf.profit * 1e4, 1) + ' bps · ' + bf.cycle.join('→') : 'no multi-hop arb across ' + ven.length + ' venues (after fees)']); } else out.push(['Bellman-Ford Arb + Liq Heatmap', 'needs ≥ 2 venue quotes (open Derivs & Arb)']); return out; },
    async lab() { const c = bars().slice(-400).map((b) => b.c); if (c.length < 120) return []; const ga = await Mesh.run('geneticAlpha', V175.pack(c), { seed: 11, pop: 40, gens: 6 }), T = c.length - 22, ds = await Mesh.run('deflatedSharpe', ga.sharpe / Math.sqrt(252), ga.trials, T), cv = await Mesh.run('cpcv', 6, 2, c.length, 1), eq = typeof ACC !== 'undefined' && ACC.equity && typeof priceMap === 'function' ? ACC.equity(priceMap()) : 0, pos = typeof ACC !== 'undefined' && ACC.pos ? Object.entries(ACC.pos).filter(([, p]) => p.qty > 0).map(([k, p]) => ({ value: p.qty * (pxOf(k) || p.cost / p.qty) })) : [], inv = pos.length ? await Mesh.run('inverseStress', pos, eq * 0.1) : null; U.edgeCache.lab = ga; return [['Symbolic Genetic Alpha (DSR + CPCV)', ga.best.slice(0, 34) + ' · SR ' + f2(ga.sharpe, 2) + ' · DSR ' + f2(ds.dsr, 2) + ' · CPCV ' + cv.nSplits + ' splits / ' + cv.paths + ' paths'], ['Inverse Portfolio Stress-Tester', inv ? (inv.shock == null ? 'no uniform shock reaches −10% equity' : 'a ' + f2(inv.shock * 100, 1) + '% move costs 10% of equity') : 'no open positions']]; },
    async fleet() { const bots2 = typeof ST !== 'undefined' && Array.isArray(ST.bots) ? ST.bots : [], arms = bots2.map((b) => { const t = b.account && b.account.trades ? b.account.trades.filter((x) => x.side === 'sell' && fin(x.pnl)) : []; return { name: String(b.name || b.strat || 'bot'), wins: t.filter((x) => x.pnl > 0).length, losses: t.filter((x) => x.pnl <= 0).length }; }), out = []; if (arms.length) { const ts = await Mesh.run('thompson', arms, 7); out.push(['Thompson-Sampling Bandit', 'allocate next to ' + arms[ts.pick].name.slice(0, 18) + ' (' + f2(ts.draws[ts.pick] * 100, 0) + '%)']); } else out.push(['Thompson-Sampling Bandit', 'no bots yet: create one in Bots']); const B = bars().slice(-2), rules = (await IDB.get('rules')) || [{ if: ['ch', '>', 3], then: 'HUNTER-α: momentum flag' }, { if: [['ch', '<', -3], ['bots', '>', 0]], then: 'RISK-GUARD: tighten stops' }], ctx = { ch: B.length === 2 ? (B[1].c / B[0].c - 1) * 100 : 0, bots: realBots(), price: B.length ? B[B.length - 1].c : 0 }, fired = await Mesh.run('ifThen', rules, ctx, null); out.push(['Multi-Rule IF-THEN Automator', rules.length + ' rules · ' + (fired.length ? 'fired: ' + fired.join(', ') : 'none fired')]); return out; },
    async ai() { const c = bars().slice(-200).map((b) => b.c); if (c.length < 40) return []; const k = V175.E.kalman(c.slice(-60)), sl = k[k.length - 1] / k[k.length - 10] - 1, r = rets(c), vol = sd(r.slice(-20)) / (sd(r) || 1), post = await Mesh.run('bayes3', null, [sl > 0 ? [0.65, 0.2, 0.15] : [0.2, 0.65, 0.15], vol > 1.3 ? [0.25, 0.25, 0.5] : [0.4, 0.4, 0.2]]); U.edgeCache.ai = { post }; const J = typeof Journal !== 'undefined' && Journal.JN ? Journal.JN.entries : [], docs = (J || []).slice(-300).map((e) => String(e.note || e.text || '') + ' ' + String(e.sym || '')); let rag = 'journal empty'; if (docs.length) { const hits = await Mesh.run('rag', docs, String(sym()) + ' ' + (sl > 0 ? 'long breakout' : 'short breakdown'), 2); rag = hits.length ? hits.length + ' similar journal notes (top ' + f2(hits[0].score, 2) + ')' : 'no similar notes'; } return [['Bayesian 3-Agent Co-Pilot + RAG', 'Bull ' + f2(post.bull * 100, 0) + '% · Bear ' + f2(post.bear * 100, 0) + '% · Risk ' + f2(post.risk * 100, 0) + '% · ' + rag]]; },
    async journal() { const tr = typeof ACC !== 'undefined' && ACC.trades ? ACC.trades.filter((t) => t.side === 'sell' && fin(t.pnl)).slice(-50) : []; if (!tr.length) return [['Counterfactual Shadow Twin', 'no closed paper trades yet'], ['MFE/MAE Missed-Alpha', 'no closed paper trades yet']]; const rows = tr.map((t) => ({ id: t.id, pnl: t.pnl, size: t.usd, mae: fin(t.pnlPct) ? Math.min(0, t.pnlPct) : null, afterLosses: 0 })); let lossRun = 0; rows.forEach((r) => { r.afterLosses = lossRun; lossRun = r.pnl < 0 ? lossRun + 1 : 0; }); const tw = await Mesh.run('shadowTwin', rows, { stopPct: 0.02, skipAfterLosses: 3 }), t = tr[tr.length - 1], B = bars().filter((b) => msOf(b.t) >= t.ts - (t.held || 0) && msOf(b.t) <= t.ts), entry = t.price / (1 + (t.pnlPct || 0)); const mm = B.length ? await Mesh.run('mfeMae', { side: 'long', entry, exit: t.price }, B) : null; return [['Counterfactual Shadow Twin', 'rules-followed twin ' + money(tw.twin) + ' vs actual ' + money(tw.actual) + ' (' + (tw.delta >= 0 ? '+' : '') + money(tw.delta) + ')'], ['MFE/MAE Missed-Alpha', mm ? 'last trade MFE ' + f2(mm.mfe, 2) + '% · MAE ' + f2(mm.mae, 2) + '% · missed ' + f2(mm.missed, 2) + '%' : 'last trade outside loaded bars']]; },
  };
  EDGE.port = EDGE.lab; EDGE.academy = EDGE.markets; EDGE.grok = EDGE.ai; EDGE.bridge = EDGE.ai; EDGE.workspace = EDGE.markets; EDGE.social = EDGE.whales; EDGE.bots = EDGE.fleet; EDGE.challenge = EDGE.journal;
  const edgeAt = {};
  const runEdge = async (t) => {
    const f = EDGE[t]; if (!f || (edgeAt[t] && Date.now() - edgeAt[t] < 6000)) return; edgeAt[t] = Date.now();
    let rows = []; try { rows = await f(); } catch (e) { rows = [['Edge engines', 'waiting: ' + String(e.message || e).slice(0, 60)]]; }
    for (const [k, v] of rows) U.edgeVals[k] = v; const sec = $1('#tab-' + t); if (!sec) return; let strip = $1(':scope > .x175-edge', sec) || (t === 'markets' ? $1('#x175EdgeM') : null);
    if (!strip) { strip = el('div', 'x175-edge mono'); strip.setAttribute('aria-label', 'Edge engines for the active symbol (click to expand)'); strip.tabIndex = 0; const tg = () => strip.classList.toggle('open'); strip.addEventListener('click', tg); strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } }); if (t === 'markets') { strip.id = 'x175EdgeM'; const r = mRow(); if (!r) return; r.appendChild(strip); } else { const bar = $1(':scope > .x171-search', sec); if (!bar) return; bar.after(strip); } }
    strip.textContent = ''; strip.appendChild(el('b', null, 'EDGE')); if (!rows.length) { edgeAt[t] = 0; strip.appendChild(el('span', null, 'warming up · waiting for bars / quotes for ' + (sym() || 'the active symbol'))); return; } for (const [k, v] of rows) { const s = el('span'); s.title = k; s.append(el('i', null, k.replace(/ \(.*\)$/, '')), document.createTextNode(' ' + v)); strip.appendChild(s); }
  };
  U.runEdge = runEdge;

  /* ══ 9. WebAudio Sonar · Voice HUD (Shift+V) · 60 s Flight Recorder (Shift+R) ══ */
  const Sonar = U.sonar = {
    on: false, ctx: null, at: 0,
    toggle(v) { this.on = v == null ? !this.on : !!v; if (this.on && !this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; T('WebAudio unavailable', 'amb'); } } const b = $1('#x175Sonar'); if (b) { b.classList.toggle('on', this.on); b.setAttribute('aria-pressed', String(this.on)); } return this.on; },
    ping(k) { if (!this.on || !this.ctx || performance.now() - this.at < 70) return; this.at = performance.now(); try { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = [880, 660, 990, 220, 520, 740][k] || 600; o.frequency.setValueAtTime(f, c.currentTime); o.frequency.exponentialRampToValueAtTime(f * 0.5, c.currentTime + 0.18); g.gain.setValueAtTime(0.06, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.22); } catch (e) { /* audio blocked */ } },
  };
  const Voice = U.voice = {
    say() { const s = sym(), p = pxOf(s), K = Squad.kpis(), Q = SQ.quant, txt = `${String(s).replace(/^oc:[^:]+:/, '')} ${p > 0 ? 'at ' + (p < 1 ? p.toPrecision(4) : p.toFixed(2)) : ''}. Bots: ${K.mode.toLowerCase()}, ${K.active} active. ${Q.mt ? 'Merton median ' + Q.mt.bands.p50[Q.mt.steps].toFixed(2) + ', value at risk ' + (Q.mt.var95 * 100).toFixed(1) + ' percent.' : ''} ${U.edgeVals['Optimal Order-Type Selector'] ? 'Best order type ' + U.edgeVals['Optimal Order-Type Selector'].split(' ')[0] + '.' : ''}`; if (typeof speechSynthesis === 'undefined') { T(txt); return txt; } try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.rate = 1.05; speechSynthesis.speak(u); } catch (e) { /* speech blocked */ } T('Voice HUD: ' + txt.slice(0, 120)); return txt; },
  };
  const Flight = U.flight = {
    buf: [], rec: false,
    push(e) { const now = Date.now(); this.buf.push({ t: now, type: String(e.type || ''), node: String(e.node || ''), text: String(e.text || '').slice(0, 140), src: e.src || '' }); while (this.buf.length && now - this.buf[0].t > 60000) this.buf.shift(); if (this.buf.length > 4000) this.buf.shift(); },
    mark(type, text) { this.push({ type: 'v175.' + type, node: 'v17.5', text }); },
    dump() { const fb = Loop.budget(), snap = { app: 'ExTerm', version: V175.VERSION, at: new Date().toISOString(), symbol: sym(), tab: tab(), squad: Squad.kpis(), frame: fb, lanes: Object.values(Mesh.lanes).map((L) => Object.assign({ lane: L.k, state: Mesh.state(L) }, L.tele.stats())), server: Mesh.srv, edge: U.edgeVals, events: this.buf.slice() };
      if (hidden()) snap.note = 'balances hidden'; const blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exterm-flight-' + Date.now() + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); T('Flight Recorder: last 60 s saved (' + snap.events.length + ' events)'); return snap; },
  };
  const keys = (e) => { if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || (document.activeElement && document.activeElement.isContentEditable)) return; if (e.key === 'V') { if (tab() === 'markets') return; /* the chart keeps v17.0's Shift+V voice commands */ e.preventDefault(); Voice.say(); } else if (e.key === 'R') { e.preventDefault(); e.stopImmediatePropagation(); Flight.dump(); } };
  const mountTools = () => { const hd = $1('#x172Syn .x171-corebar'); if (!hd || $1('#x175Sonar', hd)) return; const s = el('button', 'btn xs x175-tool', 'Sonar'); s.type = 'button'; s.id = 'x175Sonar'; s.setAttribute('aria-pressed', 'false'); s.title = 'WebAudio sonar: a ping per squad fire'; s.addEventListener('click', () => Sonar.toggle()); const v = el('button', 'btn xs x175-tool', 'Voice HUD'); v.type = 'button'; v.title = 'Shift+V'; v.addEventListener('click', () => Voice.say()); const r = el('button', 'btn xs x175-tool', 'Flight Rec 60 s'); r.type = 'button'; r.title = 'Shift+R'; r.addEventListener('click', () => Flight.dump()); hd.append(s, v, r); };

  /* ══ boot ══ */
  const tick = () => {
    try {
      Mesh.start(); hook3d(); Layers.mount(); mountSearch(); mountBriefSearch(); mountPill(); Shock.mount(); if (mountSquad()) { mountTools(); paintSquadDom(); }
      const t = tab(); if (!document.hidden) { runEdge(t); if ($1('#x175Sq') && $1('#x175Sq').offsetParent) { quantRefresh(); Mesh.pollServer(); } sampleRefresh(); }
      Loop.wake(); U.n++;
    } catch (e) { console.warn('v175', e); }
  };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; Mesh.start(); Layers.load(); tick(); setInterval(tick, 500); setInterval(demoTick, 450);
    const B = bus(); if (B && B.on) B.on(onBus);
    if (typeof Feed !== 'undefined' && Array.isArray(Feed.tickL)) Feed.tickL.push((s) => { const a = tickT.get(s) || []; a.push(Date.now()); if (a.length > 400) a.shift(); tickT.set(s, a); });
    document.addEventListener('keydown', keys, true); document.addEventListener('visibilitychange', () => { if (!document.hidden) Loop.wake(); });
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { if (document.getElementById('x17Brief')) mountBriefSearch(); }).observe(document.body, { childList: true }); // the Briefing opens async
  };
  U.tick = tick; U.paintSquad = paintSquadDom;
  U.stats = () => ({ lanes: Object.values(Mesh.lanes).map((L) => ({ lane: L.k, worker: !!L.w, ready: L.ready, state: Mesh.state(L), stats: L.tele.stats() })), frame: Loop.budget(), canvases: [...Loop.items].map((it) => ({ id: it.cv.id || (it.cv.parentNode && it.cv.parentNode.className), vis: it.vis, fps: it.fps, ms: +(it.cost || 0).toFixed(3), p95: it.hist && it.hist.length ? +quant(it.hist, 0.95).toFixed(3) : 0, max: it.hist && it.hist.length ? +Math.max(...it.hist).toFixed(3) : 0 })), squad: Squad.kpis(), layers: Layers.count(), search: U.searchCoverage(), scenarios: SCN.length });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b175 = boot; boot = async function () { await _b175.apply(this, arguments); try { V175UI.start(); } catch (e) { console.warn('v175 init', e); } }; }
