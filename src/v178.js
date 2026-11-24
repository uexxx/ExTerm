/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.8 UI (maths in V178, v178core.js). Listeners only, text through textContent, strict CSP. Keeps the v17.7 4-tab rail.
   · tracker  Co-Pilot / Paper → ◎ Tracker drawer, context-aware: Stocks = SEC Form 4 insider buys / sells, CEO-CFO-Director
              clusters, 13F filers, live insider-buy alerts (Lane 6); Crypto / On-Chain = 50+ wallet PnL leaderboard 24h | 7d | 30d
              (realized PnL, win rate, Smart Score, top tokens, full copyable address), Hyperliquid 30d perp leaders and live whale
              buy alerts (Lane 5). 1-click Load ticker or Pin to the 24/7 Bot Radar.
   · ladder   full-range L2 liquidity shelves below AND above price on the live chart, re-sized + bevel-lit on every tick, fed by a
              typed tick ring + 240 Hz coalescer with O(1) EMA / ATR / VWAP
   · radar    predator HUD on the full-bleed Bot Radar (spring crosshair, 3-arc orbital lock + [ / ] cycling, volume-clock sweep,
              VPIN halo, velocity cones, 60 s ghost trails, icebergs, spoof flashes, cabal tethers, sandwich rings, bridge
              filaments, Mirror Flow / Fade Trap pill, 10-item anomaly history on the Net Bot Pressure HUD)
   · brain    BOCPD + HMM cadence, zero-gamma shockwaves, transfer-entropy filaments, click-to-solo rings, Space + drag 60 s
              flight-recorder scrub (E exports < 50 KB), zero-GC particles, hedged < 50 ms lane failover, > 5 s dead-feed lock
   · tape     the below-chart Live Transactions tape is fed by Lane 7 (crypto + DEX) / Lane 8 (US stocks) whenever its own
              stream starves, de-duplicated, synth rows tagged SYNTH; phone layout keeps every control on screen; 1-click inspect */
const V178UI = (() => {
  const U = { mounted: false, ver: '17.8', pins: new Set(), sonar: false, lock: { on: false, age: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const escT = (s) => (typeof esc === 'function' ? esc(String(s)) : String(s).replace(/[&<>"']/g, ''));
  const T = (m, k) => { if (typeof toast === 'function') toast(escT(m), k); }; // toast() renders HTML: always escape
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sel = () => (typeof ST !== 'undefined' && ST.sel) || '';
  const G = V178.GOLD, R = V178.RED, GA = (a) => 'rgba(245,200,75,' + a + ')', RA = (a) => 'rgba(239,68,68,' + a + ')', WA = (a) => 'rgba(203,213,225,' + a + ')';
  const DPR = () => Math.max(1, Math.min(3, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1));
  const MONO = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';
  const tok = () => { try { if (typeof J !== 'undefined' && J.token) return J.token(); } catch (e) { /* no token helper */ } const m = typeof document !== 'undefined' && document.querySelector('meta[name="exterm-token"]'); return m ? m.content : ''; };
  const api = async (path, ms) => { const c = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = c && setTimeout(() => c.abort(), ms || 8000); try { const r = await fetch(path, { cache: 'no-store', headers: { 'X-ExTerm': tok() }, signal: c && c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { if (tm) clearTimeout(tm); } };
  U.api = api;
  /* hedged failover: lane endpoint first, legacy endpoint after 50 ms; the first good answer wins */
  const hedged = (paths) => V178.hedge(paths.map((p) => () => api(p, 6000)), V178.FAILOVER_MS);
  const W = { fail: 0, wins: [0, 0], lastMs: 0 };
  U.failover = W;
  /* cached font metrics: canvas text widths are measured once per string */
  const MW = new Map(); const mw = (g, s) => { const k = g.font + '|' + s; let w = MW.get(k); if (w == null) { w = g.measureText(s).width; if (MW.size > 800) MW.clear(); MW.set(k, w); } return w; };
  /* pre-rasterised glow sprites (OffscreenCanvas when available) */
  let SPR = null;
  const sprite = (rgb) => { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64) : document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(' + rgb + ',0.85)'); gr.addColorStop(0.4, 'rgba(' + rgb + ',0.22)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
  const spr = () => SPR || (SPR = { g: sprite('245,200,75'), r: sprite('239,68,68') });
  const loadPins = () => { try { for (const s of JSON.parse(localStorage.getItem('x178.pins') || '[]').slice(0, 40)) if (typeof s === 'string') U.pins.add(s.slice(0, 40)); } catch (e) { /* storage */ } };
  const savePins = () => { try { localStorage.setItem('x178.pins', JSON.stringify([...U.pins])); } catch (e) { /* storage */ } };
  const loadSym = (ctx, s) => { try { if (typeof setMode === 'function') setMode(ctx, s); if (typeof V177UI !== 'undefined') V177UI.go('copilot'); } catch (e) { T('Could not load ' + s, 'amb'); } };
  const pin = (s) => { if (U.pins.has(s)) U.pins.delete(s); else U.pins.add(s); savePins(); T((U.pins.has(s) ? 'Pinned to 24/7 Bot Radar: ' : 'Unpinned: ') + s, 'acc'); Trk.paint(); };
  const copy = async (s) => { try { await navigator.clipboard.writeText(s); T('Copied ' + V178.short(s), 'acc'); } catch (e) { T('Copy blocked by the browser', 'amb'); } };

  /* ══ 1. Tracker drawer (Lane 5 + Lane 6) ══ */
  const Trk = U.tracker = {
    open: false, sub: '', win: '24h', data: {}, at: 0, seen: new Set(), primed: false, err: '',
    ctx() { return V178.ctxOf(sel()) === 'stocks' ? 'stocks' : 'crypto'; },
    subs() { return this.ctx() === 'stocks' ? [['ins', 'Insider Buys / Sells'], ['clu', 'Clusters'], ['f13', '13F / Congress'], ['alr', 'Buy Alerts']] : [['lb', 'On-Chain PnL'], ['perp', 'Perps 30d'], ['wb', 'Whale Buys']]; },
    mount() {
      const bar = $1('#tab-markets .toolbar'); if (!bar || $1('#x178TrkB')) return;
      const b = el('button', 'btn sm x178-trkb', '◎ Tracker'); b.type = 'button'; b.id = 'x178TrkB'; b.title = 'Social & Trackers: insiders, 13F, on-chain PnL leaders, whale buys'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'x178Trk');
      const dp = $1('#x177DepthB', bar); if (dp) dp.after(b); else bar.appendChild(b);
      const d = el('aside', 'x178-trk'); d.id = 'x178Trk'; d.hidden = true; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Social & Trackers');
      const hd = el('div', 'x178-th'); const ttl = el('b', null, 'Trackers'); ttl.id = 'x178TrkT'; const x = el('button', 'btn xs ghost', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close trackers'); x.dataset.x178a = 'close'; hd.append(ttl, el('span', 'x178-src mono'), x);
      const sb = el('div', 'x178-subs'); sb.id = 'x178Subs'; sb.setAttribute('role', 'tablist'); const wn = el('div', 'x178-wins'); wn.id = 'x178Wins'; for (const w of V178.WINS) { const p = el('button', 'x178-pill', w); p.type = 'button'; p.dataset.x178w = w; wn.appendChild(p); }
      const body = el('div', 'x178-tb'); body.id = 'x178TrkBody'; d.append(hd, sb, wn, body); document.body.appendChild(d);
      b.addEventListener('click', () => this.toggle());
      d.addEventListener('click', (e) => {
        const a = e.target.closest('[data-x178a]'), s = e.target.closest('[data-x178s]'), w = e.target.closest('[data-x178w]');
        if (s) { this.sub = s.dataset.x178s; this.paint(); }
        if (w) { this.win = w.dataset.x178w; this.refresh(true); }
        if (!a) return; const k = a.dataset.x178a, v = a.dataset.v || '';
        if (k === 'close') this.toggle(false); else if (k === 'load') loadSym(a.dataset.ctx, v); else if (k === 'pin') pin(v); else if (k === 'copy') copy(v);
      });
    },
    toggle(on) { const d = $1('#x178Trk'), b = $1('#x178TrkB'); if (!d) return; this.open = on == null ? d.hidden : !!on; d.hidden = !this.open; if (b) b.setAttribute('aria-expanded', String(this.open)); if (this.open) { this.refresh(true); this.paint(); } },
    async refresh(force) {
      if (!force && Date.now() - this.at < 3000) return; this.at = Date.now(); const c = this.ctx();
      try {
        if (c === 'stocks') { const [ins, clu, f13, alr] = await Promise.all(['insiders', 'clusters', 'f13', 'alerts'].map((k) => api('/api/lane6/' + k))); Object.assign(this.data, { ins, clu, f13, alr }); }
        else { const t0 = performance.now(), lb = await hedged(['/api/lane5/board?win=' + this.win, '/api/hl/leaderboard']), [perp, wb] = await Promise.all([api('/api/lane5/perps'), api('/api/lane5/whales')]); W.lastMs = performance.now() - t0; W.wins[lb.k]++; this.data.lb = lb.k === 0 ? lb.v : { rows: ((lb.v && lb.v.rows) || []).slice(0, 60).map((r) => ({ addr: r.addr, name: r.name, acct: r.acct, pnl: (r.pnl || {})[{ '24h': 'day', '7d': 'week', '30d': 'month' }[this.win]] || 0, winRate: null, n: 0, smart: 0, tokens: [], src: 'board (failover)' })), sample: lb.v && lb.v.sample }; Object.assign(this.data, { perp, wb }); }
        this.err = '';
      } catch (e) { this.err = 'Trackers need the ExTerm launcher (serve.py): ' + (e.message || e); }
      if (this.open) this.paint();
    },
    /* live buy notifications (whale buys + insider buys), polled in the background; the first load only primes the seen-set */
    async notify() {
      try {
        const [w, a] = await Promise.all([api('/api/lane5/whales'), api('/api/lane6/alerts')]); this.data.wb = w; this.data.alr = a;
        const nw = V178.notifyNew(w.items, this.seen, 2), na = V178.notifyNew(a.items, this.seen, 2);
        if (this.primed) { for (const x of nw) T('🐋 Whale buy ' + V178.money(x.usd) + ' ' + x.coin + ' · ' + V178.short(x.addr) + (x.sample ? ' (sample)' : ''), 'acc'); for (const x of na) T('Insider buy ' + x.ticker + ' ' + V178.money(x.value) + ' · ' + x.insider + ' (' + (x.role || 'insider') + ')' + (x.sample ? ' (sample)' : ''), 'acc'); }
        this.primed = true; U.notes = (U.notes || 0) + nw.length + na.length;
      } catch (e) { /* launcher not running */ }
    },
    row(cells, acts) { const r = el('div', 'x178-r'); for (const [t, cls] of cells) r.appendChild(el('span', cls || '', t)); const a = el('span', 'x178-acts'); for (const [lab, k, v, ctx, aria] of acts) { const b = el('button', 'btn xs' + (k === 'pin' && U.pins.has(v) ? ' on' : ''), lab); b.type = 'button'; b.dataset.x178a = k; b.dataset.v = v; if (ctx) b.dataset.ctx = ctx; if (aria) b.setAttribute('aria-label', aria); a.appendChild(b); } r.appendChild(a); return r; },
    paint() {
      const d = $1('#x178Trk'); if (!d || d.hidden) return; const c = this.ctx(), subs = this.subs(); if (!subs.some((s) => s[0] === this.sub)) this.sub = subs[0][0];
      $1('#x178TrkT').textContent = c === 'stocks' ? 'Stocks · Insiders & 13F (Lane 6)' : 'Crypto / On-Chain · Smart Money (Lane 5)';
      const sb = $1('#x178Subs'); sb.textContent = ''; for (const [k, l] of subs) { const b = el('button', 'x178-sub' + (k === this.sub ? ' on' : ''), l); b.type = 'button'; b.dataset.x178s = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === this.sub)); sb.appendChild(b); }
      $1('#x178Wins').hidden = this.sub !== 'lb'; for (const p of $$1('[data-x178w]')) p.classList.toggle('on', p.dataset.x178w === this.win);
      const body = $1('#x178TrkBody'); body.textContent = ''; const D = this.data, src = $1('.x178-src', d);
      const head = (cols) => { const h = el('div', 'x178-r x178-hd'); for (const t of cols) h.appendChild(el('span', null, t)); body.appendChild(h); };
      const empty = (msg) => body.appendChild(el('p', 'note', this.err || msg));
      const pick = { ins: D.ins, clu: D.clu, f13: D.f13, alr: D.alr, lb: D.lb, perp: D.perp, wb: D.wb }[this.sub];
      src.textContent = pick ? (pick.sample ? 'SAMPLE · offline launcher' : pick.warming ? 'warming…' : 'LIVE · ' + new Date((pick.ts || Date.now() / 1000) * 1000).toLocaleTimeString()) : '';
      if (this.sub === 'ins') { head(['Ticker', 'Insider · Role', 'Type', 'Value', 'Date', '']); const rows = (D.ins && D.ins.rows) || []; if (!rows.length) return empty('Indexing the newest SEC Form 4 filings…'); for (const x of rows.slice(0, 80)) body.appendChild(this.row([[x.ticker, 'mono b'], [x.insider + ' · ' + (x.role || '–')], [x.type, x.code === 'P' ? 'up' : x.code === 'S' ? 'dn' : ''], [V178.money(x.value), 'num'], [x.date, 'num']], [['Load', 'load', x.ticker, 'stocks'], ['Pin', 'pin', x.ticker]])); return; }
      if (this.sub === 'clu') { head(['Ticker', 'Insiders', 'CEO / CFO / Dir', 'Bought (30d)', '']); const rows = (D.clu && D.clu.rows) || []; if (!rows.length) return empty('No insider buy clusters in the last 30 days yet.'); for (const x of rows) body.appendChild(this.row([[x.ticker, 'mono b'], [String(x.insiders), 'num'], [[x.ceo && 'CEO', x.cfo && 'CFO', x.director && 'DIR'].filter(Boolean).join(' · ') || '–', x.ceo || x.cfo ? 'up' : ''], [V178.money(x.value), 'num']], [['Load', 'load', x.ticker, 'stocks'], ['Pin', 'pin', x.ticker]])); return; }
      if (this.sub === 'f13') { head(['13F-HR filer', 'Filed', '']); const rows = (D.f13 && D.f13.rows) || []; for (const x of rows) body.appendChild(this.row([[x.filer, 'b'], [x.filed, 'num']], [])); body.appendChild(el('p', 'note', (D.f13 && D.f13.congress) || 'Congressional trades: no free, key-less source.')); return; }
      if (this.sub === 'alr') { head(['Ticker', 'Insider buy', 'Value', 'Date', '']); const rows = (D.alr && D.alr.items) || []; if (!rows.length) return empty('No insider buys ≥ $100K yet.'); for (const x of rows) body.appendChild(this.row([[x.ticker, 'mono b'], [x.insider + ' · ' + (x.role || '–')], [V178.money(x.value), 'num up'], [x.date, 'num']], [['Load', 'load', x.ticker, 'stocks'], ['Pin', 'pin', x.ticker]])); return; }
      if (this.sub === 'lb') { head(['#', 'Wallet (full address)', 'Realized PnL', 'Win %', 'Smart', 'Top tokens', '']); const rows = (D.lb && D.lb.rows) || []; if (!rows.length) return empty('Scoring the 50+ tracked wallets…'); rows.slice(0, 60).forEach((x, i) => { const r = this.row([[String(i + 1), 'num'], [x.addr, 'mono addr'], [V178.money(x.pnl), 'num ' + (x.pnl >= 0 ? 'up' : 'dn')], [x.winRate == null ? '–' : x.winRate.toFixed(1) + '%', 'num'], [x.smart ? x.smart.toFixed(1) : '–', 'num b'], [(x.tokens || []).join(' · ') || '–', 'mono']], [['Copy', 'copy', x.addr, '', 'Copy address ' + x.addr], ...(x.tokens && x.tokens[0] ? [['Load ' + x.tokens[0], 'load', x.tokens[0] + '-USD', 'crypto']] : [])]); body.appendChild(r); }); body.appendChild(el('p', 'note', 'Smart Score = win rate (%) × ln(closed trades). Realized PnL and win rate from each wallet’s Hyperliquid fills (the newest 2 000 per wallet); board PnL until a wallet’s fills are in.')); return; }
      if (this.sub === 'perp') { head(['Trader', 'Account', '30d PnL', '30d ROI', 'Alpha', '']); const rows = (D.perp && D.perp.rows) || []; if (!rows.length) return empty('Loading Hyperliquid leaders…'); for (const x of rows) body.appendChild(this.row([[x.name || V178.short(x.addr), 'mono'], [V178.money(x.acct), 'num'], [V178.money(x.pnl30), 'num ' + (x.pnl30 >= 0 ? 'up' : 'dn')], [(x.roi30 * 100).toFixed(1) + '%', 'num'], [String(x.alpha), 'num b']], [['Copy', 'copy', x.addr]])); return; }
      if (this.sub === 'wb') { head(['Wallet', 'Coin', 'Buy size', 'When', '']); const rows = (D.wb && D.wb.items) || []; if (!rows.length) return empty('No whale buys ≥ $50K in the last 24 h.'); for (const x of rows) body.appendChild(this.row([[V178.short(x.addr), 'mono'], [x.coin, 'mono b'], [V178.money(x.usd), 'num up'], [new Date(x.t).toLocaleTimeString(), 'num']], [['Copy', 'copy', x.addr], ['Load', 'load', x.coin + '-USD', 'crypto'], ['Pin', 'pin', x.coin + '-USD']])); }
    },
  };

  /* ══ 2. zero-copy tick pipeline + full-range L2 liquidity ladder ══ */
  const Pipe = U.pipe = {
    ring: new V178.TickRing(4096, typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated), co: new V178.Coalescer(), sym: '', ema: new V178.EMA(20), atr: new V178.ATR(14), vwap: new V178.VWAP(), last: 0, lastTick: 0, ticks: 0, flushes: 0, bar: null,
    onTick(s, p, v) {
      if (!(p > 0)) return; const now = Date.now(); this.lastTick = now; this.ticks++; if (s !== sel()) return;
      if (s !== this.sym) { this.sym = s; this.ema = new V178.EMA(20); this.atr = new V178.ATR(14); this.vwap.reset(); this.bar = null; }
      this.ring.push(now, p, v || 0); this.co.add(s, p, v || 0, now);
      const f = this.co.flush(typeof performance !== 'undefined' ? performance.now() : now); if (f) { this.flushes++; for (const u of f) this.apply(u); }
    },
    apply(u) { const sec = Math.floor(u.t / 1000); let b = this.bar; if (!b || b.s !== sec) { if (b) this.atr.push(b.h, b.l, b.c); b = this.bar = { s: sec, h: u.p, l: u.p, c: u.p }; } else { b.h = Math.max(b.h, u.p); b.l = Math.min(b.l, u.p); b.c = u.p; } this.ema.push(u.p); this.vwap.push(u.p, u.v > 0 ? u.v : 1); this.last = u.p; },
  };
  const Lad = U.ladder = {
    on: true, sh: new V178.Shelves(64), prev: null, draws: 0, lastMid: 0, lastBook: null, model: false, spoofAt: 0, spoofs: [],
    load() { try { this.on = localStorage.getItem('x178.ladder') !== '0'; } catch (e) { this.on = true; } },
    book() { const A = typeof V17App !== 'undefined' ? V17App : null; const bk = A && A.dom && A.dom.length ? A.dom[A.dom.length - 1] : null; return bk && bk.bids && bk.asks ? bk : null; },
  };
  Lad.overlay = (g, L, ch) => {
    if (!Lad.on) return; const D = L.D || ch.data, a = L.start, b = L.end; if (!D || !(b - a > 1) || !L.py) return;
    const y0 = L.y0, y1 = L.y0 + L.mainH - (L.volH || 0), x1 = L.W - L.Rm, mid = D[b - 1].c, k = L.py(mid + 1) - L.py(mid); if (!(mid > 0) || !Number.isFinite(k) || !k) return;
    const pAt = (y) => mid + (y - L.py(mid)) / k, hi = Math.max(pAt(y0), pAt(y1)), lo = Math.min(pAt(y0), pAt(y1)); if (!(hi > lo)) return;
    const real = Lad.book(), bk = V178.extendBook(real, mid, lo, hi, 40, (Math.floor(mid * 1e4) ^ D.length) >>> 0), LL = V178.ladder(bk, lo, hi, 64, mid);
    Lad.model = bk.model; Lad.sh.apply(LL); const sp = V178.spoofs(Lad.prev, LL, () => false); if (real && sp.length) { Lad.spoofAt = Date.now(); Lad.spoofs = sp; } Lad.prev = real ? LL : null;
    const wMax = Math.min(140, (x1 - L.Lm) * 0.14), w = Lad.sh.w, gl = Lad.sh.glow; g.save(); g.beginPath(); g.rect(L.Lm, y0, x1 - L.Lm, y1 - y0); g.clip();
    for (let j = 0; j < LL.bins.length; j++) {
      const z = LL.bins[j], yt = L.py(z.hi), yb = L.py(z.lo), top = Math.min(yt, yb), h = Math.max(1, Math.abs(yb - yt) - 1);
      for (let s = 0; s < 2; s++) { const v = w[j * 2 + s]; if (v < 0.01) continue; const ww = v * wMax, x = x1 - ww, c = s ? RA : GA; g.fillStyle = c((0.1 + v * 0.22).toFixed(3)); g.fillRect(x, top, ww, h); g.fillStyle = c((0.25 + gl[j * 2 + s] * 0.7).toFixed(3)); g.fillRect(x, top, ww, 1); g.fillRect(x, top, 1, h); }
    }
    const ym = L.py(mid); g.strokeStyle = GA(0.35); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L.Lm, ym); g.lineTo(x1, ym); g.stroke(); g.setLineDash([]);
    g.font = '10px ' + MONO; g.textBaseline = 'top'; g.fillStyle = GA(0.75); const tag = 'L2 ' + (real ? (bk.model ? 'LIVE + MODEL' : 'LIVE') : 'MODEL') + (Pipe.ema.v ? ' · EMA20 ' + (+Pipe.ema.v.toPrecision(7)) + ' · VWAP ' + (+Pipe.vwap.push(mid, 0).toPrecision(7)) : ''); g.fillText(tag, Math.max(L.Lm + 4, x1 - mw(g, tag) - 4), y0 + 4);
    g.restore(); Lad.draws++; Lad.lastMid = mid; Lad.bins = LL.bins.length; Lad.below = LL.bins.filter((z) => z.bid > 0).length; Lad.above = LL.bins.filter((z) => z.ask > 0).length; Lad.lo = lo; Lad.hi = hi;
  };

  /* ══ 3. Bot Radar predator HUD (wraps V177UI.radar.draw / feed) ══ */
  const RX = U.radar = {
    cross: { x: 0, y: 0, vx: 0, vy: 0 }, ptr: null, vp: new V178.VpinBuckets(25000, 40), tps: 0, tpsN: 0, tpsAt: 0, ghosts: new Map(), recent: [], hist: new V178.History(10), histOpen: false, cab: [], br: [], extAt: 0, lastPx: new Map(), cost: [], extras: 0,
    wrap() {
      const RD = typeof V177UI !== 'undefined' && V177UI.radar; if (!RD || RD._x178) return false; RD._x178 = true; this.RD = RD;
      const feed = RD.feed.bind(RD); RD.feed = (p) => { if (Tape.synthIn) p.sim = true; /* SYNTH tape rows are never real prints: they must not end the labelled simulated flow */ const b = feed(p); if (b) this.onPrint(b, p); return b; };
      const draw = RD.draw.bind(RD); RD.draw = (cv, now, dt) => { RD.sweep += (V178.sweepSpeed(this.tps) - 0.9) * dt; draw(cv, now, dt); const t0 = performance.now(); try { this.extra(cv, now, dt); } catch (e) { console.warn('v178 radar', e); } this.cost.push(performance.now() - t0); if (this.cost.length > 240) this.cost.shift(); };
      return true;
    },
    onPrint(b, p) {
      this.tpsN++; const now = Date.now(); if (now - this.tpsAt >= 1000) { this.tps = this.tps * 0.5 + this.tpsN * 0.5 * (1000 / Math.max(1, now - this.tpsAt || 1000)); this.tpsN = 0; this.tpsAt = now; }
      this.vp.add(p.usd, p.side); this.lastPx.set(p.sym, p.px); if (b._px0 == null) b._px0 = p.px;
      if (U.pins.size && (U.pins.has(p.sym) || U.pins.has(String(p.sym).replace(/-USD.*$/, '')))) b._pin = 1;
      const pr = b._pr || (b._pr = []); pr.push({ px: p.px, usd: p.usd, t: p.t }); if (pr.length > 8) pr.shift(); if (pr.length >= 3 && V178.iceberg(pr)) b._ice = p.t;
      this.recent.push({ id: b.id, t: p.t, side: p.side, usd: p.usd, sym: p.sym }); if (this.recent.length > 300) this.recent.shift();
    },
    scan() { const r = this.recent.slice(-200); this.cab = V178.cabal(r); this.br = V178.bridges(r.map((x) => ({ id: x.id, t: x.t, usd: x.usd, sym: x.sym }))); },
    pos(b, cx, cy, RR) { const sl = b._sl; if (!sl) return null; const a = sl.a + (b._ph || 0); return [cx + Math.cos(a) * RR * sl.r, cy + Math.sin(a) * RR * sl.r, a]; },
    extra(cv, now, dt) {
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = DPR(), cx = W / 2, cy = H / 2, RR = Math.min(W, H) * 0.47, RD = this.RD, t = Date.now(), S = spr(); let n = 0;
      if (t - (this.vpAt || 0) > 2000) { this.vpAt = t; this.vp.size = Math.max(5000, Math.min(5e6, RD.tapeUsd() / 20)); } const vpin = this.vp.value(); this.vpin = vpin; /* bucket = 1/20 of the last minute's tape, the usual 1/50-of-volume VPIN rule scaled to a live window */
      if (vpin > V178.VPIN_ALERT) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 + 0.25 * Math.sin(now / 160); g.drawImage(S.r, cx - 60 * d, cy - 60 * d, 120 * d, 120 * d); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.strokeStyle = R; g.lineWidth = 2 * d; g.beginPath(); g.arc(cx, cy, 14 * d, 0, Math.PI * 2); g.stroke(); n++; this.hist.push('VPIN ' + vpin.toFixed(2) + ' TOXIC FLOW', t); }
      if (!this.extT) { this.scan(); if (typeof setInterval === 'function') this.extT = setInterval(() => { if (tab() === 'botradar' && !document.hidden) this.scan(); }, 500); else if (t - this.extAt > 500) this.extAt = t; } /* v17.8 frame budget: the cabal / bridge scan runs on a timer, outside the frame */
      const F = (this.fr = (this.fr || 0) + 1), inner = this._in || (this._in = []); inner.length = 0; let k = 0; for (const b of RD._ls || []) { if (k++ > 260) break; if (b.ring === 2 || !V177.pass(b, RD.filter) || !b._sl) continue; const a = b._sl.a + (b._ph || 0), P = b._xy || (b._xy = [0, 0, 0]); P[0] = cx + Math.cos(a) * RR * b._sl.r; P[1] = cy + Math.sin(a) * RR * b._sl.r; P[2] = a; b._xyF = F; inner.push(b); } // zero-alloc: positions reuse one array per bot, lookups check the frame stamp
      const top = this._top || (this._top = []); top.length = 0; for (const b of inner) { if (top.length < 6) { top.push(b); top.sort((p, q) => q.usd - p.usd); } else if (b.usd > top[5].usd) { top[5] = b; top.sort((p, q) => q.usd - p.usd); } }
      /* ghost trails (60 s) + velocity cones (5–30 s) for the heaviest bots */
      g.lineWidth = d;
      for (const b of top) {
        let gh = this.ghosts.get(b.id); if (!gh) { if (this.ghosts.size > 40) this.ghosts.delete(this.ghosts.keys().next().value); gh = new V178.Ghost(120); this.ghosts.set(b.id, gh); } gh.add(b._xy[0], b._xy[1], t);
        const pts = gh.pts(t); if (pts.length > 1) { g.strokeStyle = GA(0.12); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i][0], pts[i][1]); g.lineTo(b._xy[0], b._xy[1]); g.stroke(); }
        const w = V177.angVel(b), C = V178.cone(b._xy[2], w, 15), r0 = RR * b._sl.r, red = V177.colorOf(b) === R; g.fillStyle = red ? RA(0.07) : GA(0.07); g.beginPath(); g.moveTo(b._xy[0], b._xy[1]); g.arc(cx, cy, r0 * (1 + C.spread * 0.3), C.a0, C.a1, w < 0); g.arc(cx, cy, Math.max(4, r0 * (1 - C.spread * 0.3)), C.a1, C.a0, w >= 0); g.closePath(); g.fill(); n++;
      }
      /* iceberg reload rings · sandwich double-rings · pinned brackets */
      for (const b of inner) {
        const [x, y] = b._xy;
        if (b._ice && t - b._ice < 8000) { g.strokeStyle = GA(0.7); g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.arc(x, y, 13 * d + ((t / 90) % 6) * d, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); this.hist.push('ICEBERG ' + V178.short(b.who || b.sym), b._ice); n++; }
        if (b.kind === 'mev') { g.strokeStyle = R; g.globalAlpha = 0.8; g.beginPath(); g.arc(x, y, 9 * d, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y, 13 * d, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; n++; }
        if (b._pin) { g.strokeStyle = G; const q = 9 * d; g.strokeRect(x - q, y - q, q * 2, q * 2); }
      }
      const byId = { get: (id) => { const b = RD.pop.m.get(id); return b && b._xyF === F ? b : undefined; } };
      /* Slot 0–2 cabal tethers · Gold > $250K cross-chain bridge filaments */
      for (const c of this.cab) { const A = byId.get(c.a), B = byId.get(c.b); if (!A || !B) continue; g.strokeStyle = GA(0.55 - c.slot * 0.12); g.lineWidth = (2 - c.slot * 0.4) * d; g.beginPath(); g.moveTo(A._xy[0], A._xy[1]); g.lineTo(B._xy[0], B._xy[1]); g.stroke(); g.fillStyle = G; g.font = Math.round(9 * d) + 'px ' + MONO; g.fillText('SLOT ' + c.slot, (A._xy[0] + B._xy[0]) / 2, (A._xy[1] + B._xy[1]) / 2); this.hist.push('CABAL SLOT ' + c.slot + ' ×' + c.n, t); n++; }
      for (const f of this.br) { const A = byId.get(f.a), B = byId.get(f.b); if (!A || !B) continue; g.strokeStyle = GA(0.8); g.lineWidth = 1.5 * d; g.beginPath(); g.moveTo(A._xy[0], A._xy[1]); g.quadraticCurveTo(cx, cy, B._xy[0], B._xy[1]); g.stroke(); this.hist.push('BRIDGE ' + f.chains + ' ' + V178.money(f.usd), t); n++; }
      /* Crimson spoof-cancellation flashes from the live L2 ladder */
      if (t - Lad.spoofAt < 900) { const a = 1 - (t - Lad.spoofAt) / 900; g.strokeStyle = RA(a.toFixed(3)); g.lineWidth = 3 * d; g.beginPath(); g.arc(cx, cy, RR * 0.95, 0, Math.PI * 2); g.stroke(); this.hist.push('SPOOF CANCEL ' + V178.money((Lad.spoofs[0] || {}).usd || 0), Lad.spoofAt); n++; }
      /* spring-inertia Gold magnetic crosshair: glides onto the hovered bot, else follows the pointer */
      const hv = RD.hover && byId.get(RD.hover), tx = hv ? hv._xy[0] : this.ptr ? this.ptr[0] * d : cx, ty = hv ? hv._xy[1] : this.ptr ? this.ptr[1] * d : cy;
      V178.spring(this.cross, tx, ty, dt); const X = this.cross.x, Y = this.cross.y, q = (hv ? 11 : 16) * d; g.strokeStyle = GA(hv ? 0.95 : 0.4); g.lineWidth = 1.2 * d; g.beginPath(); g.moveTo(X - q * 1.8, Y); g.lineTo(X - q * 0.6, Y); g.moveTo(X + q * 0.6, Y); g.lineTo(X + q * 1.8, Y); g.moveTo(X, Y - q * 1.8); g.lineTo(X, Y - q * 0.6); g.moveTo(X, Y + q * 0.6); g.lineTo(X, Y + q * 1.8); g.stroke(); g.beginPath(); g.arc(X, Y, q, 0, Math.PI * 2); g.stroke();
      /* 3-arc orbital lock + Mirror Flow / Fade Trap target-lock pill */
      let lk = RD.lock && byId.get(RD.lock); if (RD.lock && !lk) { const b = RD.pop.m.get(RD.lock), P = b && this.pos(b, cx, cy, RR); if (P) { b._xy = P; lk = b; } }
      this.pill = null;
      if (lk && lk._xy) { const [x, y] = lk._xy, rr = 20 * d, ph = now / 400; g.strokeStyle = G; g.lineWidth = 2 * d; for (let i = 0; i < 3; i++) { const a0 = ph + (i * Math.PI * 2) / 3; g.beginPath(); g.arc(x, y, rr, a0, a0 + 1.4); g.stroke(); }
        const pl = V178.lockPill(V177.net(lk), lk._px0, this.lastPx.get(lk.sym)); this.pill = pl; if (pl) { g.font = '600 ' + Math.round(10 * d) + 'px ' + MONO; const s = pl, ww = mw(g, s) + 14 * d, px = Math.min(W - ww - 6 * d, x - ww / 2), py = y + rr + 8 * d; g.fillStyle = 'rgba(5,6,8,0.9)'; g.fillRect(px, py, ww, 18 * d); g.strokeStyle = pl === 'FADE TRAP' ? R : G; g.strokeRect(px + 0.5, py + 0.5, ww - 1, 18 * d - 1); g.fillStyle = pl === 'FADE TRAP' ? R : G; g.textBaseline = 'middle'; g.fillText(s, px + 7 * d, py + 9 * d); } n++; }
      for (const b of top.slice(0, 6)) { const an = V177.anomaly(b, t); if (an) this.hist.push(an, b.pulse); }
      /* 10-item anomaly history while the pointer is on the Net Bot Pressure HUD */
      if (this.histOpen && this.hist.a.length) { g.font = Math.round(10 * d) + 'px ' + MONO; g.textBaseline = 'middle'; const rows = this.hist.a.map((h) => Math.max(0, Math.round((t - h.t) / 1000)) + 's · ' + h.s); let ww = 0; for (const s of rows) ww = Math.max(ww, mw(g, s)); ww += 16 * d; const hh = rows.length * 14 * d + 26 * d, X0 = W - ww - 14 * d, Y0 = H - hh - 70 * d; g.fillStyle = 'rgba(10,13,18,0.94)'; g.fillRect(X0, Y0, ww, hh); g.strokeStyle = GA(0.5); g.strokeRect(X0 + 0.5, Y0 + 0.5, ww - 1, hh - 1); g.fillStyle = G; g.fillText('ANOMALY HISTORY · LAST 10', X0 + 8 * d, Y0 + 11 * d); rows.forEach((s, i) => { g.fillStyle = /SPOOF|VPIN|MEV|FADE/.test(s) ? R : WA(0.85); g.fillText(s, X0 + 8 * d, Y0 + 26 * d + i * 14 * d); }); n++; }
      this.extras = n;
    },
    keys(e) {
      if (tab() !== 'botradar' || e.target.closest && e.target.closest('input, textarea, select')) return; const RD = this.RD; if (!RD) return;
      if (e.key === '[' || e.key === ']') { const L = V178.top5(RD.pop.list()); const nx = V178.cycle(L, RD.lock, e.key === ']' ? 1 : -1); if (nx) { RD.lock = nx; this.ping(); } e.preventDefault(); }
      else if (e.key === 's' || e.key === 'S') { U.sonar = !U.sonar; T('Sonar ping ' + (U.sonar ? 'on' : 'off'), 'acc'); }
    },
    ping() { if (!U.sonar) return; try { const A = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)()), o = A.createOscillator(), gn = A.createGain(); o.frequency.value = 1320; gn.gain.setValueAtTime(0.06, A.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.09); o.connect(gn).connect(A.destination); o.start(); o.stop(A.currentTime + 0.1); } catch (e) { /* audio blocked */ } },
    bind() {
      const cv = $1('#x177RadarC'); if (!cv || cv._x178) return; cv._x178 = true;
      cv.addEventListener('pointermove', (e) => { const b = cv.getBoundingClientRect(); this.ptr = [e.clientX - b.left, e.clientY - b.top]; });
      cv.addEventListener('pointerleave', () => { this.ptr = null; });
      const hp = $1('[data-x177h="pressure"]'); if (hp) { hp.addEventListener('pointerenter', () => { this.histOpen = true; }); hp.addEventListener('pointerleave', () => { this.histOpen = false; }); hp.title = 'Hover: last 10 anomalies'; }
      document.addEventListener('keydown', (e) => this.keys(e));
    },
  };

  /* ══ 4. self-healing Terminal Brain (wraps V177UI.brain.snap / draw) ══ */
  const BX = U.brain = {
    bocpd: new V178.BOCPD(1 / 40), hmm: new V178.HMM2([1, 6], [1.2, 3], 0.93), cad: 1, solo: null, rec: new V178.FlightRec(600, 48), scrub: false, back: 0, space: false, dragX: null, parts: new V178.Particles(512), te: [], ser: { q: [], t: [] }, serAt: 0, flips: 0, lastPx: 0, cost: [], lastTe: 0,
    wrap() {
      const B = typeof V177UI !== 'undefined' && V177UI.brain; if (!B || B._x178) return false; B._x178 = true; this.B = B;
      const snap = B.snap.bind(B);
      B.snap = (force) => { const g0 = snap(force); if (!g0) return g0; if (g0 !== this._raw) { this._raw = g0; this.enrich(g0); this._solo = null; } if (!this.solo) return g0; return this._solo || (this._solo = V178.soloFilter(g0, this.solo)); };
      const draw = B.draw.bind(B);
      B.draw = (cv, now, dt) => {
        this.tick(now); let g0 = null;
        if (this.scrub && this.rec.len) { const fr = this.rec.frame(this.back), raw = B.graph; if (raw) { g0 = raw; const ids = this.rec.ids; B.graph = { nodes: raw.nodes.map((n) => { const i = ids.indexOf(n.id); return i >= 0 && i < fr.nodes.length ? Object.assign({}, n, { act: fr.nodes[i].act, hot: fr.nodes[i].hot }) : n; }), edges: raw.edges }; B.snapAt = Date.now(); } }
        draw(cv, now, dt * this.cad); if (g0) B.graph = g0;
        const t0 = performance.now(); try { this.extra(cv, now, dt); } catch (e) { console.warn('v178 brain', e); } this.cost.push(performance.now() - t0); if (this.cost.length > 240) this.cost.shift();
      };
      return true;
    },
    enrich(g) {
      /* Lanes 5–8 + the dead-feed lock join the graph as processes (the v17.7 8 worker lanes stay group 'lane') */
      const F = U.fast || [], add = (id, l, act, hot) => { if (g.nodes.some((n) => n.id === id)) return; g.nodes.push({ id, l, g: 'proc', act: Math.max(0, Math.min(1, act)), hot: hot ? 1 : 0 }); g.edges.push({ a: id, b: 'core', ten: act * 0.8, hot: hot ? 1 : 0 }); };
      for (const ln of F.length ? F.map((x) => x.lane) : [5, 6, 7, 8]) { /* v17.9: every fast lane the launcher runs (5–19) */ const r = F.find((x) => x.lane === ln); add('proc:lane' + ln, 'LANE ' + ln + (r ? ' · ' + (r.p99 || 0).toFixed(1) + 'ms' : ' · OFF'), r ? Math.min(1, 0.25 + (r.warms ? 0.4 : 0) + (r.hits ? 0.2 : 0)) : 0.05, !!(r && r.err)); }
      if (U.lock.on) { const c = g.nodes[0]; if (c) c.hot = 1; }
    },
    tick(now) {
      if (now - this.serAt < 250) return; this.serAt = now; const B = this.B, ev = B.evs.length / 5;
      this.bocpd.push(ev); this.hmm.push(ev); const tgt = V178.cadence(this.bocpd.cp, this.bocpd.map, this.hmm.stress); this.cad += (tgt - this.cad) * 0.3;
      if (this.bocpd.cp > 0.6 && this.bocpd.t > 20 && now - (this.cpAt || 0) > 4000) { this.cpAt = now; if (B.waves.length < 10) B.waves.push({ r: 0, red: false }); }
      /* zero-gamma flip: price crossing the GEX flip level → Gold shockwave + particle burst */
      const A = typeof V17App !== 'undefined' ? V17App : null, flip = A && A.gex && A.gex.r && A.gex.r.flip, px = Pipe.last || 0;
      if (V178.zeroGammaFlip(this.lastPx, px, flip)) this.flipNow(); if (px > 0) this.lastPx = px;
      /* transfer entropy between the quote stream and the print stream (64 × 250 ms samples), every 2 s */
      const q = this.ser.q, pr = this.ser.t; q.push(Pipe.ticks - (this._qt || 0)); this._qt = Pipe.ticks; const pc = RX.RD ? RX.RD.pop.prints : 0; pr.push(pc - (this._pt || 0)); this._pt = pc; if (q.length > 64) { q.shift(); pr.shift(); }
      if (now - this.lastTe > 2000 && q.length >= 24) { this.lastTe = now; const qp = V178.transferEntropy(q, pr), pq = V178.transferEntropy(pr, q); this.te = [{ a: 'feed:quotes', b: 'feed:tape', v: qp }, { a: 'feed:tape', b: 'feed:quotes', v: pq }]; }
      /* flight recorder at 10 Hz */
      if (!this.scrub && B.graph) this.rec.record(now, (this._raw || B.graph).nodes); // frame clock (monotonic), 10 Hz
    },
    flipNow() { this.flips++; const B = this.B; if (B.waves.length < 10) B.waves.push({ r: 0, red: false, flip: 1 }); const p = B.pos && B.pos.get('core'); if (p) for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, s = 120 + (i % 5) * 40; this.parts.spawn(p[0], p[1], Math.cos(a) * s, Math.sin(a) * s, 1.2, 0); } },
    extra(cv, now, dt) {
      const B = this.B, g = cv.getContext('2d'), W = cv.width, H = cv.height, d = DPR(), P = B.pos; if (!P) return;
      /* transfer-entropy lead-lag filaments between feeds */
      for (const f of this.te) { const a = P.get(f.a), b = P.get(f.b); if (!a || !b || f.v < 0.02) continue; g.strokeStyle = GA(Math.min(0.85, 0.15 + f.v).toFixed(3)); g.lineWidth = (1 + Math.min(3, f.v * 6)) * d; g.setLineDash([6 * d, 4 * d]); g.lineDashOffset = -(now / 40) % 20; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 60 * d, b[0], b[1]); g.stroke(); g.setLineDash([]); }
      /* zero-GC particles */
      this.parts.step(Math.min(0.05, dt)); const D = this.parts.d; g.fillStyle = G; for (let i = 0; i < D.length; i += 6) if (D[i + 4] > 0) { g.globalAlpha = Math.min(1, D[i + 4]); g.fillRect(D[i] - 1.5 * d, D[i + 1] - 1.5 * d, 3 * d, 3 * d); } g.globalAlpha = 1;
      g.font = Math.round(10 * d) + 'px ' + MONO; g.textBaseline = 'top'; g.textAlign = 'left';
      const st = 'CADENCE ' + this.cad.toFixed(2) + '× · CP ' + (this.bocpd.cp * 100).toFixed(0) + '% · REGIME ' + (this.hmm.stress > 0.5 ? 'STRESS' : 'CALM') + (this.solo ? ' · SOLO ' + this.solo.toUpperCase() : '') + ' · REC ' + (this.rec.len / 10).toFixed(0) + 's';
      g.fillStyle = this.hmm.stress > 0.5 ? R : GA(0.7); g.fillText(st, 16 * d, H - 28 * d);
      if (this.scrub) { const s = 'REPLAY −' + (this.back / 10).toFixed(1) + 's · drag ◂▸ · release Space for live · E exports'; g.fillStyle = G; g.fillText(s, 16 * d, 16 * d); const bw = W - 32 * d, x = 16 * d + bw * (1 - this.back / Math.max(1, this.rec.len - 1)); g.fillStyle = GA(0.2); g.fillRect(16 * d, 32 * d, bw, 3 * d); g.fillStyle = G; g.fillRect(x - 2 * d, 29 * d, 4 * d, 9 * d); }
      if (U.lock.on) { const s = 'EXECUTION LOCK · FEED DEAD ' + (U.lock.age / 1000).toFixed(1) + 's · orders blocked until ticks resume'; g.font = '600 ' + Math.round(12 * d) + 'px ' + MONO; const ww = mw(g, s) + 24 * d, x = (W - ww) / 2, y = 54 * d; g.fillStyle = 'rgba(5,6,8,0.92)'; g.fillRect(x, y, ww, 26 * d); g.strokeStyle = R; g.lineWidth = 2 * d; g.strokeRect(x, y, ww, 26 * d); g.fillStyle = R; g.textBaseline = 'middle'; g.fillText(s, x + 12 * d, y + 13 * d); g.strokeStyle = RA(0.25 + 0.2 * Math.sin(now / 200)); g.strokeRect(2 * d, 2 * d, W - 4 * d, H - 4 * d); }
    },
    bind() {
      const cv = $1('#x177BrainC'); if (!cv || cv._x178) return; cv._x178 = true; const B = this.B;
      cv.addEventListener('click', () => { if (this.space || this.dragged) { this.dragged = false; return; } /* the end of a Space + drag scrub is not a solo click */ const h = B.hover && (B.graph || { nodes: [] }).nodes.find((n) => n.id === B.hover); const gsel = h && V178.SOLO.includes(h.g) ? h.g : null; this.solo = gsel && this.solo !== gsel ? gsel : null; this._solo = null; B.key = ''; B.snapAt = 0; });
      cv.addEventListener('pointerdown', (e) => { if (this.space) { this.scrub = true; this.dragX = e.clientX; this.back0 = this.back; } });
      cv.addEventListener('pointermove', (e) => { if (this.scrub && this.dragX != null && (e.buttons & 1)) { this.dragged = true; const w = cv.getBoundingClientRect().width || 1; this.back = Math.max(0, Math.min(this.rec.len - 1, Math.round(this.back0 + ((this.dragX - e.clientX) / w) * this.rec.len))); } });
      cv.addEventListener('pointerup', () => { this.dragX = null; });
      document.addEventListener('keydown', (e) => { if (tab() !== 'brain' || (e.target.closest && e.target.closest('input, textarea, select'))) return; if (e.code === 'Space') { e.preventDefault(); if (!this.space) { this.space = true; this.scrub = true; this.back = Math.min(this.back, this.rec.len - 1); } } else if (e.key === 'e' || e.key === 'E') this.download(); });
      document.addEventListener('keyup', (e) => { if (e.code === 'Space' && this.space) { this.space = false; this.scrub = false; this.back = 0; this.dragX = null; } });
    },
    exportBytes() { return this.rec.export(); },
    download() { try { const buf = this.rec.export(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' })); a.download = 'exterm-flight-' + Date.now() + '.bin'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); T('Flight recorder exported (' + (buf.byteLength / 1024).toFixed(1) + ' KB)', 'acc'); } catch (e) { T('Export failed', 'amb'); } },
  };

  /* ══ 5. > 5 s dead-feed Crimson execution lock (no tick on ANY symbol) ══ */
  const Lock = {
    check() { const f = Pipe.co.flush(typeof performance !== 'undefined' ? performance.now() : Date.now()); if (f) { Pipe.flushes++; for (const u of f) Pipe.apply(u); } const now = Date.now(), up = now - (U.startAt || now) > 10000, dead = up && V178.deadFeed(Pipe.lastTick, now); U.lock.age = Pipe.lastTick ? now - Pipe.lastTick : 0; if (dead !== U.lock.on) { U.lock.on = dead; if (dead) T('Execution lock: no market data for 5 s, orders are blocked until ticks resume', 'amb'); else T('Feed restored: execution lock lifted', 'acc'); } },
    guard() { if (typeof submitOrder !== 'function' || submitOrder._x178) return; const o = submitOrder; submitOrder = function () { if (U.lock.on) { T('Execution lock: the market-data feed has been dead for > 5 s', 'amb'); return; } return o.apply(this, arguments); }; submitOrder._x178 = true; }, // eslint-disable-line no-func-assign
  };
  U.lockCheck = () => Lock.check();

  /* ══ 6. Wave 2: below-chart Live Transactions tape fed by Lane 7 / Lane 8 ══ */
  const Tape = U.tape = {
    seen: new Map(), mine: new Map(), polls: 0, rows: 0, last: null, busy: false, ms: 0, src: '', synth: false, inspectN: 0,
    want() { const V6 = typeof V166UI !== 'undefined' ? V166UI : null; return !!V6 && tab() === 'markets' && V6.open && !document.hidden; }, /* keeps ingesting while paused (hover / Pause freeze the display only, like the feed) */
    async poll(force) {
      if ((this.busy && Date.now() - this.busyAt < 6000) || (!force && !this.want())) return; const s = sel(); if (!s) return; this.busy = true; this.busyAt = Date.now(); /* a hung request can never block the tape for more than 6 s */ const ln = V178.laneOf(s), V6 = V166UI;
      try {
        const px = (typeof chart !== 'undefined' && chart && chart.data && chart.data.length ? chart.data[chart.data.length - 1].c : 0) || Pipe.last || 0, t0 = performance.now();
        const j = await api('/api/lane' + ln + '/tape?sym=' + encodeURIComponent(s) + '&px=' + (+px || 0), 5000); this.ms = performance.now() - t0; this.polls++; this.last = j; this.src = j.src || ''; this.synth = !!j.synth; if (s !== sel()) return;
        const r = V6.E.ring(s), mine = this.mine.get(s), starving = !r || !r.size || Date.now() - r.lastTs > 3000 || r.lastTs === mine;
        if (ln === 7 && !starving) return; // the tape's own stream is alive: Lane 7 only backfills a starving tape
        let set = this.seen.get(s); if (!set) { set = new Set(); this.seen.set(s, set); if (this.seen.size > 40) this.seen.delete(this.seen.keys().next().value); }
        const have = new Set(); if (r) for (let q = Math.max(0, r.n - Math.min(r.n, 600)); q < r.n; q++) have.add(Math.round(V166.ts(r, q) / 1000) + '|' + (+V166.price(r, q)).toPrecision(6));
        const B = V166.BIT; let n = 0;
        for (const row of (j.rows || []).slice().sort((a, b) => a.t - b.t)) { const k = V178.dedupeKey(row); if (set.has(k)) continue; set.add(k); const A = V178.tapeArgs(s, row); if (!A || have.has(Math.round(A.ts / 1000) + '|' + A.price.toPrecision(6))) continue; this.synthIn = !!row.synth; try { V6.ingest(s, A.price, A.size, A.side, A.ts, A.x, (A.agg ? B.AGG : 0) | (A.block ? B.BLOCK : 0)); } finally { this.synthIn = false; } n++; }
        if (set.size > 3000) { const keep = [...set].slice(-1500); set.clear(); for (const k of keep) set.add(k); }
        if (n) { this.rows += n; const r2 = V6.E.ring(s); if (r2) this.mine.set(s, r2.lastTs); V6.refilter(true); }
      } catch (e) { this.err = String(e.message || e); } finally { this.busy = false; }
    },
    /* 1-click inspection: click a row's Venue / Maker cell → who, flow and Track / Copy / Load in one card */
    mountInspect() {
      const body = $1('#v166Body'); if (!body || body._x178) return; body._x178 = true;
      body.addEventListener('click', (e) => { const cell = e.target.closest('.v166-r > span'); if (!cell) return; const r = cell.parentElement, idx = [...r.children].indexOf(cell); if (idx === 5 || idx === 6) { e.stopPropagation(); this.inspect(r, (r.children[5] || {}).textContent || ''); } }, true);
    },
    inspect(row, who) {
      const s = sel(), V6 = V166UI, E = V6.E, r = E.ring(s); if (!r) return; this.inspectN++; let id = -1; const M = E.mk(s); for (let i = 0; i < M.names.length; i++) if (M.names[i] === who || (who.includes('…') && M.names[i].startsWith(who.split('…')[0]) && M.names[i].endsWith(who.split('…')[1]))) { id = i; break; }
      let buy = 0, sell = 0, n = 0; const full = id >= 0 ? M.names[id] : who; for (let q = Math.max(0, r.n - r.cap); q < r.n; q++) { if (V166.venue(r, q) !== id) continue; n++; if (V166.mask(r, q) & V166.BIT.SELL) sell += V166.usd(r, q); else buy += V166.usd(r, q); }
      let c = $1('#x178Insp'); if (!c) { c = el('div', 'x178-insp'); c.id = 'x178Insp'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Inspect'); document.body.appendChild(c); c.addEventListener('click', (e) => { const a = e.target.closest('[data-x178i]'); if (!a) return; const k = a.dataset.x178i; if (k === 'x') c.hidden = true; else if (k === 'copy') copy(c.dataset.who); else if (k === 'track') { V6.track(c.dataset.who, true); c.hidden = true; } else if (k === 'pin') pin(sel()); }); document.addEventListener('pointerdown', (e) => { if (!c.hidden && !c.contains(e.target)) c.hidden = true; }, true); }
      c.textContent = ''; c.dataset.who = full; c.hidden = false;
      c.append(el('b', 'mono', V178.isAddr(full) ? full : full || '–'), el('p', 'num', n + ' prints · bought ' + V178.money(buy) + ' · sold ' + V178.money(sell) + ' · net ' + V178.money(buy - sell)));
      const acts = el('div', 'x178-acts'); for (const [l, k] of [['Track', 'track'], ['Copy', 'copy'], ['Pin ' + (s.length > 14 ? V178.short(s) : s) + ' to Radar', 'pin'], ['✕', 'x']]) { const b = el('button', 'btn xs', l); b.type = 'button'; b.dataset.x178i = k; acts.appendChild(b); } c.appendChild(acts);
      const rb = row.getBoundingClientRect(); c.style.left = Math.round(Math.max(8, Math.min(innerWidth - 330, rb.left + rb.width * 0.55))) + 'px'; c.style.top = Math.round(Math.max(8, rb.top - 96)) + 'px';
      this.inspected = { who: full, n, buy, sell };
    },
  };

  /* ══ boot ══ */
  const fastPoll = async () => { try { const j = await api('/api/fast', 4000); U.fast = j.lanes || []; } catch (e) { U.fast = []; } };
  const tick = () => {
    try { RX.wrap(); RX.bind(); BX.wrap(); BX.bind(); Trk.mount(); Tape.mountInspect(); Lock.guard(); Lock.check();
      if (typeof chart !== 'undefined' && chart && chart.overlays && !chart.overlays.includes(Lad.overlay)) { chart.overlays.push(Lad.overlay); chart.invalidate && chart.invalidate(); }
    } catch (e) { console.warn('v178', e); }
  };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; U.startAt = Date.now(); document.body.classList.add('x178'); loadPins(); Lad.load();
    /* desynchronized low-latency 2D contexts for the two full-bleed canvases (must be the first getContext call) */
    for (const id of ['x177RadarC', 'x177BrainC']) { const c = document.getElementById(id); if (c && !c._x178ctx) { c._x178ctx = true; try { c.getContext('2d', { desynchronized: true, alpha: false }); } catch (e) { /* unsupported */ } } }
    try { if (typeof Feed !== 'undefined' && Feed.tickL && !Feed._x178) { Feed._x178 = true; Feed.tickL.push((s, p, v) => { try { Pipe.onTick(s, p, v); } catch (e) { /* never break the feed */ } }); } } catch (e) { /* feed not ready */ }
    tick(); fastPoll(); Trk.notify();
    setInterval(tick, 1000); setInterval(() => { Lock.check(); Tape.poll(); }, 500); setInterval(() => { fastPoll(); if (Trk.open) { Trk.refresh(); } }, 3000); setInterval(() => Trk.notify(), 10000);
  };
  U.tick = tick; U.Lock = Lock;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b178 = boot; boot = async function () { await _b178.apply(this, arguments); try { V178UI.start(); } catch (e) { console.warn('v178 init', e); } }; }
