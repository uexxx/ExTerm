/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.7 UI: Sovereign 4-Tab Declutter (maths in V177, v177core.js). Listeners only, text through textContent, strict CSP.
   · rail       ONE floating translucent rail (blur 12px, tabular-nums mono) with strictly 4 tabs, auto-fades when idle
   · botradar   full-bleed 100vw × 100vh 2D canvas: 3 proximity rings fed by every live print, 3 corner micro-HUD numbers, 3 filter
                pills, callouts only on anomalies, telemetry only on hover / click target lock
   · brain      full-bleed 100vw × 100vh 2D canvas: every worker lane, feed, process and squad bot as a node; telemetry drives node
                velocity, pulse intensity, line tension and colour; zero HTML panels
   · livebot    the Bot Fleet execution view without the Synapse / panels / 3-option picker (one Co-Pilot switch + Arm wizard)
   · copilot    the 1s–1m main chart + ticket; the detached 3D mode is gone, replaced by live tactile 2D depth passes on the chart
   Both canvases run one rAF loop only while their tab is on screen (0 fps when hidden) and record per-frame main-thread cost. */
const V177UI = (() => {
  const U = { mounted: false, idle: false, ver: '17.7' };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const T = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const DPR = () => Math.max(1, Math.min(3, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1));
  const G = V177.GOLD, R = V177.RED, GA = (a) => 'rgba(245,200,75,' + a + ')', RA = (a) => 'rgba(239,68,68,' + a + ')', WA = (a) => 'rgba(203,213,225,' + a + ')';
  const DIM = '#CBD5E1';
  const MONO ='ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';
  const usdS = (v) => (!(v > 0) ? '$0' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0));

  /* ══ sizes: ResizeObserver only, so no frame ever reads layout ══ */
  const SIZE = new Map();
  const RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) SIZE.set(e.target, [e.contentRect.width, e.contentRect.height]); }) : null;
  const watch = (cv) => { if (RO) RO.observe(cv); };
  const fit = (cv) => { const s = SIZE.get(cv) || [innerWidth, innerHeight], d = DPR(), W = Math.max(2, Math.round(s[0] * d)), H = Math.max(2, Math.round(s[1] * d)); if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H; return { W, H, d, w: s[0], h: s[1] }; };
  /* pre-rendered additive glow sprite (drawImage is far cheaper than shadowBlur) */
  const sprite = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(' + rgb + ',0.9)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',0.28)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
  let SPR = null; const spr = () => SPR || (SPR = { g: sprite('245,200,75'), r: sprite('239,68,68') });

  /* one frame loop per full-bleed canvas: runs only while its tab is on and the page visible → 0 fps when hidden */
  const Loop = (name, draw) => {
    const L = { name, raf: 0, frames: 0, fps: 0, fpsN: 0, fpsAt: 0, cost: [], last: 0 };
    const step = (now) => {
      if (tab() !== name || document.hidden) { L.raf = 0; L.fps = 0; return; }
      const t0 = performance.now(); try { draw(now, L.last ? Math.min(0.1, (now - L.last) / 1000) : 0.016); } catch (e) { console.warn('v177 ' + name, e); }
      L.cost.push(performance.now() - t0); if (L.cost.length > 240) L.cost.shift();
      L.last = now; L.frames++; L.fpsN++; if (now - L.fpsAt >= 1000) { L.fps = L.fpsN; L.fpsN = 0; L.fpsAt = now; }
      L.raf = requestAnimationFrame(step);
    };
    L.start = () => { if (!L.raf && tab() === name && !document.hidden) { L.last = 0; L.fpsAt = performance.now(); L.fpsN = 0; L.raf = requestAnimationFrame(step); } };
    L.stop = () => { if (L.raf) cancelAnimationFrame(L.raf); L.raf = 0; L.fps = 0; };
    L.p95 = () => V177.p95(L.cost);
    return L;
  };

  /* ══ 1. the floating rail ══ */
  const Rail = U.rail = {
    mount() {
      if ($1('#x177Rail')) return; const r = el('nav', 'x177-rail'); r.id = 'x177Rail'; r.setAttribute('aria-label', 'Workspaces'); r.setAttribute('role', 'tablist');
      V177.TABS.forEach(([k, l], i) => { const b = el('button', 'x177-rt'); b.type = 'button'; b.dataset.x177t = k; b.setAttribute('role', 'tab'); b.append(el('i', null, String(i + 1).padStart(2, '0')), el('span', null, l)); r.appendChild(b); });
      r.addEventListener('click', (e) => { const b = e.target.closest('[data-x177t]'); if (b) go(b.dataset.x177t); });
      r.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const ks = V177.TABS.map((t) => t[0]), i = ks.indexOf(V177.railOf(tab())), n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; go(n); const b = $1(`[data-x177t="${n}"]`, r); if (b) b.focus(); });
      document.body.appendChild(r);
      const wake = () => this.wake(); for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) document.addEventListener(ev, wake, { passive: true, capture: true });
      this.wake();
    },
    wake() { const r = $1('#x177Rail'); if (!r) return; if (U.idle) { U.idle = false; r.classList.remove('idle'); } clearTimeout(this.tm); this.tm = setTimeout(() => { U.idle = true; r.classList.add('idle'); }, U.idleMs || 2600); },
    sync() {
      const k = V177.railOf(tab()); for (const b of $$1('#x177Rail [data-x177t]')) { const on = b.dataset.x177t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      const B = document.body; B.dataset.x177 = k; B.classList.toggle('x177-fb', V177.FULL.includes(tab()));
      const dk = $1('#x17Dock'); document.documentElement.style.setProperty('--x177-dock', (dk && k === 'copilot' && dk.offsetHeight ? dk.offsetHeight : 0) + 'px');
    },
  };
  const go = (k) => { const t = V177.ENTRY[k]; if (!t) return; try { const S = $1('#x17Sheet'); if (S) S.hidden = true; document.body.classList.remove('x17-m-trade', 'x17-m-watch'); } catch (e) { /* phone sheets */ } showTab(t); };
  U.go = go;

  /* ══ 2. full-bleed sections (one canvas each, nothing below them) ══ */
  const mountFull = () => {
    const main = $1('main'); if (!main) return false;
    if (!$1('#tab-botradar')) {
      const s = el('section', 'tab x177-full'); s.id = 'tab-botradar'; s.setAttribute('aria-label', '24/7 Bot Radar');
      const cv = el('canvas', 'x177-cv'); cv.id = 'x177RadarC'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', '24/7 Bot Radar: outer ring passive scanners, middle ring staging and limit walls, inner ring active executors, MEV and snipers; hover or click a bot for telemetry');
      const hud = el('div', 'x177-hud'); hud.id = 'x177Hud'; for (const [k, l, c] of [['active', 'ACTIVE BOTS', 'tl'], ['share', 'BOT VOL SHARE', 'tr'], ['pressure', 'NET BOT PRESSURE', 'br']]) { const d = el('div', 'x177-h ' + c); d.dataset.x177h = k; d.append(el('b', null, '0'), el('span', null, l)); hud.appendChild(d); }
      const pills = el('div', 'x177-pills'); pills.setAttribute('role', 'radiogroup'); pills.setAttribute('aria-label', 'Bot filter'); for (const [k, l] of V177.FILTERS) { const b = el('button', 'x177-pill', l); b.type = 'button'; b.dataset.x177f = k; b.setAttribute('role', 'radio'); pills.appendChild(b); }
      s.append(cv, hud, pills); main.appendChild(s); watch(cv); Radar.bind(cv, s);
      TABS.botradar = { show: () => { Radar.paintHud(); Radar.L.start(); }, render: () => {} };
    }
    if (!$1('#tab-brain')) {
      const s = el('section', 'tab x177-full'); s.id = 'tab-brain'; s.setAttribute('aria-label', 'Terminal Brain');
      const cv = el('canvas', 'x177-cv'); cv.id = 'x177BrainC'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Terminal Brain: every worker lane, data feed, process and squad bot as a live node; hover a node for telemetry');
      s.appendChild(cv); main.appendChild(s); watch(cv); Brain.bind(cv);
      TABS.brain = { show: () => { Brain.snap(true); Brain.L.start(); }, render: () => {} };
    }
    return true;
  };

  /* ══ 3. 24/7 Bot Radar ══ */
  const Radar = U.radar = {
    pop: new V177.Pop(), filter: 'all', hover: null, lock: null, pts: [], tape: new Float64Array(60), tapeAt: 0, sweep: 0, hud: { active: 0, share: 0, pressure: 0 },
    /* every print the terminal ingests (Live Tape engine: crypto, perps, stocks, on-chain swaps with wallet tags) */
    real: 0, realAt: 0, simPrints: 0, sim: false,
    feed(p) { if (p.sim) { if (!this.sim) return null; this.simPrints++; } else { this.real++; this.realAt = Date.now(); if (this.sim) { this.sim = false; this.pop = new V177.Pop(); } } const b = this.pop.feed(p); const s = Math.floor(p.t / 1000); if (s !== this.tapeAt) { const k = Math.min(60, Math.max(0, s - this.tapeAt)); for (let i = 1; i <= k; i++) this.tape[(this.tapeAt + i) % 60] = 0; this.tapeAt = s; } this.tape[s % 60] += p.usd; return b; },
    tapeUsd() { let t = 0; for (let i = 0; i < 60; i++) t += this.tape[i]; return t; },
    bind(cv, s) {
      const xy = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
      cv.addEventListener('pointermove', (e) => { const [x, y] = xy(e); const h = V177.pick(this.pts, x, y, 16); this.hover = h ? h.id : null; cv.style.cursor = h ? 'crosshair' : ''; });
      cv.addEventListener('pointerleave', () => { this.hover = null; });
      cv.addEventListener('click', (e) => { const [x, y] = xy(e); const h = V177.pick(this.pts, x, y, 16); this.lock = h ? (this.lock === h.id ? null : h.id) : null; });
      s.addEventListener('click', (e) => { const p = e.target.closest('[data-x177f]'); if (p) { this.filter = p.dataset.x177f; this.paintHud(); } });
      this.L = Loop('botradar', (now, dt) => this.draw(cv, now, dt));
    },
    resort() { this._ls = this.pop.list().sort((a, b) => b.last - a.last); this._lsAt = Date.now(); this._lsPop = this.pop; },
    paintHud() {
      const h = this.hud = V177.hud(this.pop.list(), Date.now(), 60000, this.tapeUsd()), s = $1('#tab-botradar'); if (!s) return;
      const set = (k, v, cls) => { const d = $1(`[data-x177h="${k}"]`, s); if (!d) return; const b = d.firstChild; if (b.textContent !== v) b.textContent = v; d.classList.toggle('up', cls === 'up'); d.classList.toggle('dn', cls === 'dn'); };
      set('active', String(h.active)); set('share', h.share.toFixed(1) + '%'); set('pressure', (h.pressure > 0 ? '+' : '') + h.pressure.toFixed(0), h.pressure > 10 ? 'up' : h.pressure < -10 ? 'dn' : '');
      for (const b of $$1('[data-x177f]', s)) { const on = b.dataset.x177f === this.filter; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    },
    draw(cv, now, dt) {
      const { W, H, d } = fit(cv), g = cv.getContext('2d'), S = spr(), t = Date.now(), cx = W / 2, cy = H / 2, RR = Math.min(W, H) * 0.47;
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = V177.BG; g.fillRect(0, 0, W, H);
      /* rings + crosshair + sweep beam */
      g.lineWidth = d; for (let i = 0; i < 3; i++) { g.strokeStyle = GA(0.16 - i * 0.04); g.beginPath(); g.arc(cx, cy, RR * V177.RING_R[i], 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = GA(0.05); g.beginPath(); g.moveTo(cx - RR, cy); g.lineTo(cx + RR, cy); g.moveTo(cx, cy - RR); g.lineTo(cx, cy + RR); g.stroke();
      this.sweep = (this.sweep + dt * 0.9) % (Math.PI * 2); g.fillStyle = GA(0.045); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, RR, this.sweep - 0.5, this.sweep); g.closePath(); g.fill();
      g.strokeStyle = GA(0.22); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(this.sweep) * RR, cy + Math.sin(this.sweep) * RR); g.stroke();
      /* bots */
      const pts = this._pp || (this._pp = []), tags = [], dots = this._dots || (this._dots = [[], [], []]); dots[0].length = dots[1].length = dots[2].length = 0; let shown = 0, glowN = 0, np = 0;
      const BK = this._bk || (this._bk = Array.from({ length: 6 }, () => ({ tr: [], tl: [], sh: [] }))), GL = this._gl || (this._gl = []), PU = this._pu || (this._pu = Array.from({ length: 6 }, () => [])); for (const k of BK) k.tr.length = k.tl.length = k.sh.length = 0; GL.length = 0; for (const p of PU) p.length = 0; // v17.8 frame budget: scanner dots batched into 3 fills, one trail stroke per bot, glow sprites for the 48 most recent hot bots
      if (!this._ls || this._lsPop !== this.pop) this.resort(); // v17.8 frame budget: the 5×/s re-sort runs on a timer, outside the frame
      const list = this._ls;
      for (const b of list) {
        if (shown >= 200) break; /* v17.8 frame budget: the 200 most recent bots are drawn (all still count in the HUD) */ if (!V177.pass(b, this.filter)) continue; shown++;
        const sl = b._sl || (b._sl = V177.slot(b)); if (b._ring !== b.ring) { b._ring = b.ring; b._sl = V177.slot(b); }
        b._ph = (b._ph || 0) + V177.angVel(b) * dt; const a = b._sl.a + b._ph, rr = RR * b._sl.r, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        const age = (t - b.last) / V177.TTL, fade = Math.max(0.15, 1 - age), col = V177.colorOf(b), C = col === 'dim' ? DIM : col;
        if (b.ring === 2) dots[fade > 0.66 ? 0 : fade > 0.33 ? 1 : 2].push(x, y);
        else {
          /* v17.8 frame budget: everything is bucketed by colour × fade (6 buckets) and drawn after the loop as one path per bucket,
             so a frame sets each canvas style a handful of times instead of once per bot */
          const K = BK[(col === R ? 1 : col === 'dim' ? 2 : 0) * 2 + (fade > 0.55 ? 0 : 1)];
          const tr = b._tr || (b._tr = []); if (!tr.length || Math.hypot(tr[tr.length - 1][0] - x, tr[tr.length - 1][1] - y) > 3 * d) { tr.push([x, y]); if (tr.length > 7) tr.shift(); }
          if (tr.length > 1) { K.tr.push(tr.length + 1); for (const q of tr) K.tr.push(q[0], q[1]); K.tr.push(x, y); }
          if (b.ring === 1) { const v = V177.angVel(b), ta = a - Math.sign(v) * Math.PI / 2, L = (6 + Math.min(14, Math.abs(v) * 20)) * d; K.tl.push(x, y, x + Math.cos(ta) * L, y + Math.sin(ta) * L); }
          else {
            const sz = (b.kind === 'whale' ? 6 : 4.5) * d; if (glowN++ < 48) GL.push(col === R ? 1 : 0, x, y, sz, fade);
            K.sh.push(V177.shape(b.kind), x, y, sz);
            const pa = (t - b.pulse) / 900; if (pa >= 0 && pa < 1) PU[(col === R ? 3 : 0) + (pa < 0.33 ? 0 : pa < 0.66 ? 1 : 2)].push(x, y, sz + pa * 18 * d);
          }
        }
        let po = pts[np]; if (!po) po = pts[np] = { x: 0, y: 0, id: '' }; po.x = x / d; po.y = y / d; po.id = b.id; np++; // pooled: no per-frame allocation
        const an = tags.length < 6 && b.ring !== 2 ? V177.anomaly(b, t) : null; if (an) tags.push([x, y, an, col === R]);
        if (b.id === this.lock || b.id === this.hover) this._sel = [b, x, y];
      }
      /* batched render: glows (one composite switch) → per bucket trails, middle-ring tails, inner shapes → pulse rings */
      if (GL.length) { g.globalCompositeOperation = 'lighter'; for (let i = 0; i < GL.length; i += 5) { const s = GL[i + 3]; g.globalAlpha = 0.55 * GL[i + 4]; g.drawImage(GL[i] ? S.r : S.g, GL[i + 1] - s * 3, GL[i + 2] - s * 3, s * 6, s * 6); } g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      for (let bi = 0; bi < 6; bi++) {
        const K = BK[bi], C = [G, R, DIM][bi >> 1], fa = bi & 1 ? 0.45 : 1; if (!K.tr.length && !K.tl.length && !K.sh.length) continue; g.strokeStyle = C; g.fillStyle = C;
        if (K.tr.length) { g.globalAlpha = 0.3 * fa; g.lineWidth = 1.4 * d; g.beginPath(); for (let i = 0; i < K.tr.length;) { const n = K.tr[i++]; g.moveTo(K.tr[i], K.tr[i + 1]); for (let j = 1; j < n; j++) g.lineTo(K.tr[i + j * 2], K.tr[i + j * 2 + 1]); i += n * 2; } g.stroke(); }
        if (K.tl.length) { g.globalAlpha = 0.7 * fa; g.lineWidth = 1.4 * d; g.beginPath(); for (let i = 0; i < K.tl.length; i += 4) { g.moveTo(K.tl[i], K.tl[i + 1]); g.lineTo(K.tl[i + 2], K.tl[i + 3]); } g.stroke(); g.globalAlpha = 0.85 * fa; g.beginPath(); for (let i = 0; i < K.tl.length; i += 4) g.rect(K.tl[i] - 1.5 * d, K.tl[i + 1] - 1.5 * d, 3 * d, 3 * d); g.fill(); }
        if (K.sh.length) {
          g.globalAlpha = fa; g.beginPath(); let rings = 0;
          for (let i = 0; i < K.sh.length; i += 4) { const sh = K.sh[i], x = K.sh[i + 1], y = K.sh[i + 2], sz = K.sh[i + 3]; if (sh === 'diamond') { g.moveTo(x, y - sz); g.lineTo(x + sz, y); g.lineTo(x, y + sz); g.lineTo(x - sz, y); g.closePath(); } else if (sh === 'tri') { g.moveTo(x, y - sz); g.lineTo(x + sz, y + sz * 0.8); g.lineTo(x - sz, y + sz * 0.8); g.closePath(); } else if (sh === 'square') g.rect(x - sz * 0.8, y - sz * 0.8, sz * 1.6, sz * 1.6); else { g.moveTo(x + sz * 0.45, y); g.arc(x, y, sz * 0.45, 0, Math.PI * 2); rings++; } }
          g.fill();
          if (rings) { g.lineWidth = 1.5 * d; g.beginPath(); for (let i = 0; i < K.sh.length; i += 4) if (K.sh[i] !== 'diamond' && K.sh[i] !== 'tri' && K.sh[i] !== 'square') { g.moveTo(K.sh[i + 1] + K.sh[i + 3], K.sh[i + 2]); g.arc(K.sh[i + 1], K.sh[i + 2], K.sh[i + 3], 0, Math.PI * 2); } g.stroke(); }
        }
      }
      g.lineWidth = 1.2 * d; for (let pi = 0; pi < 6; pi++) { const P = PU[pi]; if (!P.length) continue; g.strokeStyle = pi < 3 ? G : R; g.globalAlpha = [0.65, 0.4, 0.15][pi % 3]; g.beginPath(); for (let i = 0; i < P.length; i += 3) { g.moveTo(P[i] + P[i + 2], P[i + 1]); g.arc(P[i], P[i + 1], P[i + 2], 0, Math.PI * 2); } g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = DIM; for (let k = 0; k < 3; k++) { const D2 = dots[k]; if (!D2.length) continue; g.globalAlpha = 0.35 * [0.85, 0.5, 0.2][k]; g.beginPath(); for (let i = 0; i < D2.length; i += 2) g.rect(D2[i] - d, D2[i + 1] - d, 2 * d, 2 * d); g.fill(); } g.globalAlpha = 1;
      pts.length = np; this.pts = pts;
      g.font = '600 ' + Math.round(10 * d) + 'px ' + MONO; g.textBaseline = 'middle';
      for (const [x, y, s, red] of tags) { const w = g.measureText(s).width + 10 * d, X = Math.min(W - w - 4, x + 9 * d), Y = y - 14 * d; g.fillStyle = 'rgba(5,6,8,0.82)'; g.fillRect(X, Y - 8 * d, w, 16 * d); g.strokeStyle = red ? R : G; g.lineWidth = d; g.strokeRect(X + 0.5, Y - 8 * d + 0.5, w - 1, 16 * d - 1); g.fillStyle = red ? R : G; g.fillText(s, X + 5 * d, Y); }
      /* target lock / hover telemetry */
      const sel = this._sel; this._sel = null;
      if (sel && (sel[0].id === this.lock || sel[0].id === this.hover)) {
        const [b, x, y] = sel, locked = b.id === this.lock, c = locked ? G : WA(0.8); g.strokeStyle = c; g.lineWidth = 1.2 * d; const q = 12 * d;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(x + sx * q, y + sy * q * 0.45); g.lineTo(x + sx * q, y + sy * q); g.lineTo(x + sx * q * 0.45, y + sy * q); g.stroke(); }
        const net = V177.net(b), rows = [(locked ? 'LOCKED · ' : '') + b.kind.toUpperCase() + ' · ' + (b.who ? b.who.slice(0, 14) : b.sym), 'prints ' + b.n + ' · ' + V177.rate(b).toFixed(2) + '/s', 'volume ' + usdS(b.usd) + ' · max ' + usdS(b.maxUsd), 'net ' + (net >= 0 ? '+' : '') + (net * 100).toFixed(0) + '% · seen ' + Math.max(0, Math.round((t - b.last) / 1000)) + 's ago'];
        let w = 0; for (const s of rows) w = Math.max(w, g.measureText(s).width); w += 16 * d; const h = rows.length * 15 * d + 10 * d, X = Math.min(W - w - 8 * d, x + 18 * d), Y = Math.min(H - h - 8 * d, Math.max(8 * d, y - h / 2));
        g.fillStyle = 'rgba(10,13,18,0.92)'; g.fillRect(X, Y, w, h); g.strokeStyle = locked ? G : GA(0.35); g.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1);
        rows.forEach((s, i) => { g.fillStyle = i === 0 ? (V177.colorOf(b) === R ? R : G) : WA(0.85); g.fillText(s, X + 8 * d, Y + 12 * d + i * 15 * d); });
        this.telemetry = { id: b.id, kind: b.kind, n: b.n, usd: b.usd, locked };
      } else if (!this.lock) this.telemetry = null;
      if (!shown) { g.fillStyle = WA(0.4); g.textAlign = 'center'; g.fillText('LISTENING · ' + this.pop.prints + ' PRINTS', cx, cy); g.textAlign = 'left'; }
      if (this.sim) { g.fillStyle = GA(0.55); g.textAlign = 'center'; g.fillText('SIMULATED FLOW · no live trade stream connected · switches to real prints automatically', cx, 22 * d); g.textAlign = 'left'; }
      this.drawn = shown;
    },
  };

  /* offline demo only: the Demo provider streams quotes but no trade prints, so the radar would sit empty. While the feed is the
     Demo provider (or on-chain pools are simulated) and no real print has arrived for 8 s, demo ticks drive a clearly labelled
     SIMULATED flow with the five archetypes; the first real print clears it. */
  const Sim = U.sim = {
    k: 0,
    allowed() { const demo = typeof Providers !== 'undefined' && typeof Demo !== 'undefined' && Providers.active === Demo, ocs = typeof OC !== 'undefined' && !!OC.sim, noStream = typeof Feed !== 'undefined' && Feed.state !== 'open'; return (demo || ocs || noStream) && Date.now() - Radar.realAt > 8000; },
    onTick(sym, price) {
      if (!(price > 0)) return; const on = this.allowed(); if (on !== Radar.sim) { Radar.sim = on; if (on) Radar.pop = new V177.Pop(); } if (!on) return;
      const now = Date.now(), rnd = Math.random, f = (who, usd, side, dt) => Radar.feed({ sym, t: now + (dt || 0), px: price, qty: usd / price, usd, side, who: 'sim:' + who, sim: true }); this.k++;
      if (rnd() < 0.7) f('scan' + ((rnd() * 90) | 0), 5 + rnd() * 120, rnd() < 0.5 ? 'buy' : 'sell');
      const tw = this.tw || (this.tw = [0, 0, 0, 0, 0]), j = this.k % 5; if (now - tw[j] >= 1500) { tw[j] = now; f('twap' + j, 400 + j * 150, j % 2 ? 'sell' : 'buy'); } // 5 TWAP / limit-wall actors on a steady cadence
      if (rnd() < 0.09) { const side = rnd() < 0.55 ? 'buy' : 'sell', id = 'exec' + ((rnd() * 8) | 0); for (let i = 0; i < 4; i++) f(id, 900 + rnd() * 2500, side, i * 60); }
      if (rnd() < 0.04) { const id = 'mev' + ((rnd() * 4) | 0), u = 1500 + rnd() * 4000; f(id, u, 'buy', 0); f(id, u * 1.02, 'sell', 180); f(id, u * 0.99, 'buy', 420); }
      if (rnd() < 0.012) f('whale' + ((rnd() * 6) | 0), 26000 + rnd() * 140000, rnd() < 0.5 ? 'buy' : 'sell');
    },
  };

  /* ══ 4. Terminal Brain ══ */
  const Brain = U.brain = {
    graph: null, pos: null, key: '', snapAt: 0, evs: [], waves: [], parts: new Map(), hover: null, last: {},
    snap(force) {
      if (!force && Date.now() - this.snapAt < 250) return this.graph; this.snapAt = Date.now(); const now = Date.now();
      const P5 = typeof V175UI !== 'undefined' ? V175UI : null, M = P5 && P5.mesh, lanes = [];
      if (M && M.lanes) for (const k of Object.keys(M.lanes)) { const L = M.lanes[k]; lanes.push({ k, state: M.state(L), err: (L.tele && L.tele.err) || 0 }); }
      while (this.evs.length && now - this.evs[0].t > 5000) this.evs.shift();
      const rate = (re) => this.evs.filter((e) => re.test(e.type)).length / 5, stale = typeof V171UI !== 'undefined' && !!V171UI.stale;
      const liveN = typeof Feed !== 'undefined' && Feed.live ? Object.keys(Feed.live).length : 0, ocSim = typeof OC !== 'undefined' && !!OC.sim;
      const feeds = [{ k: 'quotes', l: 'QUOTES ' + liveN, rate: Radar.pop.prints ? 8 : liveN, stale }, { k: 'tape', l: 'TAPE', rate: (Radar.tapeUsd() > 0 ? 10 : 0) + rate(/print/), stale }, { k: 'chain', l: ocSim ? 'ON-CHAIN SIM' : 'ON-CHAIN', rate: ocSim ? 3 : 8, stale: false }];
      const A = typeof V17App !== 'undefined' ? V17App : null, cfg = (A && A.cfg) || {}, q = (A && A.queue && A.queue.length) || 0, pos = typeof ACC !== 'undefined' && ACC.pos ? Object.keys(ACC.pos).length : 0;
      const blocks = rate(/block|stale|flatten/), fills = rate(/fill|win|order/);
      const procs = [{ k: 'fleet', l: 'BOT FLEET · ' + String(cfg.mode || 'paper').toUpperCase(), act: cfg.mode === 'live' && cfg.arm && cfg.arm.armed ? 1 : cfg.mode === 'copilot' ? 0.6 : 0.3, hot: cfg.mode === 'live' }, { k: 'firewall', l: 'FIREWALL', act: Math.min(1, 0.2 + blocks), hot: blocks > 0 }, { k: 'ledger', l: 'LEDGER · ' + pos + ' POS', act: Math.min(1, 0.2 + pos * 0.2 + fills), hot: false }, { k: 'copilot', l: 'CO-PILOT Q ' + q, act: Math.min(1, 0.15 + q * 0.3), hot: false, to: 'firewall' }, { k: 'alpha', l: 'ALPHA SCAN', act: typeof V176UI !== 'undefined' && V176UI.scans ? 0.5 : 0.1, hot: false }, { k: 'radar', l: 'BOT RADAR · ' + Radar.hud.active, act: Math.min(1, 0.1 + Radar.hud.active / 40), hot: Radar.hud.pressure < -40 }];
      const Sq = P5 && P5.squad, squad = Sq && Sq.m ? Sq.m.map((b, k) => ({ k, l: b.name, st: Sq.status(k, now) })) : [];
      const evps = this.evs.length / 5; this.graph = V177.brainGraph({ lanes, feeds, procs, squad, evps, stale }); this.stats = { lanes: lanes.length, feeds: feeds.length, procs: procs.length, squad: squad.length, evps, stale };
      return this.graph;
    },
    bind(cv) {
      cv.addEventListener('pointermove', (e) => { const b = cv.getBoundingClientRect(), d = DPR(), x = (e.clientX - b.left) * d, y = (e.clientY - b.top) * d; let best = null, bd = 22 * d; if (this.pos) for (const [id, p] of this.pos) { const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = id; } } this.hover = best; });
      cv.addEventListener('pointerleave', () => { this.hover = null; });
      this.L = Loop('brain', (now, dt) => this.draw(cv, now, dt));
    },
    on(e) { if (!e || e.type === 'tick') return; this.evs.push({ t: Date.now(), type: String(e.type || '') }); if (this.evs.length > 400) this.evs.shift(); if (this.L && this.L.raf && this.waves.length < 10 && /fill|win|block|stale|loss|flatten|bot/.test(e.type)) this.waves.push({ r: 0, red: /block|stale|loss|flatten/.test(e.type) }); },
    draw(cv, now, dt) {
      const { W, H, d } = fit(cv), g = cv.getContext('2d'), Gr = this.snap(false); if (!Gr) return; const S = spr();
      const key = W + 'x' + H + ':' + Gr.nodes.map((n) => n.id).join(','); if (key !== this.key) { this.key = key; this.pos = V177.brainLayout(Gr.nodes, W, H); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = V177.BG; g.fillRect(0, 0, W, H);
      const P = this.pos, byId = new Map(Gr.nodes.map((n) => [n.id, n])), ts = now / 1000;
      /* edges: line tension = taut when busy, slack (sagging) when idle; colour Crimson when the source is hot */
      for (const e of Gr.edges) {
        const a = P.get(e.a), b = P.get(e.b); if (!a || !b) continue; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, sag = (1 - e.ten) * Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22 + Math.sin(ts * 1.3 + a[0]) * 3 * d * (1 - e.ten);
        const qx = mx, qy = my + sag; e._q = [a, [qx, qy], b];
        g.strokeStyle = e.hot ? R : G; g.globalAlpha = e.hot ? 0.25 + e.ten * 0.5 : 0.06 + e.ten * 0.32; g.lineWidth = (0.8 + e.ten * 1.6) * d; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(qx, qy, b[0], b[1]); g.stroke();
        /* particles: velocity from the source's activity */
        const src = byId.get(e.a), sp = V177.brainSpeed(src ? src.act : 0); let ph = this.parts.get(e.a) || 0; ph = (ph + sp * dt) % 1; this.parts.set(e.a, ph);
        g.fillStyle = e.hot ? R : G; g.globalAlpha = 0.35 + 0.6 * (src ? src.act : 0);
        for (let k = 0; k < 2; k++) { const u = (ph + k * 0.5) % 1, iu = 1 - u, x = iu * iu * a[0] + 2 * iu * u * qx + u * u * b[0], y = iu * iu * a[1] + 2 * iu * u * qy + u * u * b[1]; g.fillRect(x - 1.5 * d, y - 1.5 * d, 3 * d, 3 * d); }
      }
      g.globalAlpha = 1;
      /* nodes: pulse intensity = activity; core breathes with events / s */
      g.globalCompositeOperation = 'lighter';
      for (const n of Gr.nodes) { const p = P.get(n.id); if (!p) continue; const core = n.g === 'core', gs = (core ? 75 : 22) * d * (1 + Math.sin(ts * (2 + n.act * 6) + p[0]) * 0.18 * n.act); g.globalAlpha = 0.25 + n.act * 0.6; g.drawImage(n.hot ? S.r : S.g, p[0] - gs, p[1] - gs, gs * 2, gs * 2); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      for (const n of Gr.nodes) {
        const p = P.get(n.id); if (!p) continue; const core = n.g === 'core', base = (core ? 15 : n.g === 'lane' ? 6 : n.g === 'bot' ? 4.5 : 5.5) * d, rr = base * (1 + Math.sin(ts * (2 + n.act * 6) + p[0]) * 0.18 * n.act);
        g.fillStyle = n.hot ? R : G; g.globalAlpha = n.hot || n.act > 0.3 ? 1 : 0.45; g.beginPath(); g.arc(p[0], p[1], rr, 0, Math.PI * 2); g.fill();
        if (core) { g.strokeStyle = G; g.globalAlpha = 0.5; g.lineWidth = 1.2 * d; g.beginPath(); g.arc(p[0], p[1], rr * 1.7 + Math.sin(ts * 2) * 2 * d, 0, Math.PI * 2); g.stroke(); }
      }
      g.globalAlpha = 1;
      /* labels change a few times a second at most: cached on an offscreen layer, one drawImage per frame */
      const lk = key + '|' + Gr.nodes.map((n) => n.l + (n.hot ? '!' : '')).join('|') + '|' + this.hover;
      if (this.lk !== lk || !this.lc || this.lc.width !== W || this.lc.height !== H) {
        this.lk = lk; const lc = this.lc || (this.lc = document.createElement('canvas')); lc.width = W; lc.height = H; const q = lc.getContext('2d'); q.font = Math.round(9.5 * d) + 'px ' + MONO; q.textAlign = 'center'; q.textBaseline = 'top';
        for (const n of Gr.nodes) { const p = P.get(n.id); if (!p || (n.g === 'bot' && n.id !== this.hover)) continue; const core = n.g === 'core'; q.fillStyle = n.hot ? R : WA(core ? 0.85 : 0.5); q.fillText(n.l, p[0], p[1] + (core ? 20 : 10) * d); }
        this.labelBuilds = (this.labelBuilds || 0) + 1;
      }
      g.drawImage(this.lc, 0, 0);
      /* event shockwaves from the core */
      const c = P.get('core'); this.waves = this.waves.filter((w) => (w.r += dt * 0.9) < 1); if (c) for (const w of this.waves) { g.strokeStyle = w.red ? RA((0.7 * (1 - w.r)).toFixed(3)) : GA((0.6 * (1 - w.r)).toFixed(3)); g.lineWidth = 1.5 * d; g.beginPath(); g.arc(c[0], c[1], 18 * d + w.r * Math.min(W, H) * 0.42, 0, Math.PI * 2); g.stroke(); }
      if (this.hover && byId.get(this.hover)) { const n = byId.get(this.hover), p = P.get(n.id), s = n.l + ' · ' + n.g.toUpperCase() + ' · activity ' + Math.round(n.act * 100) + '%' + (n.hot ? ' · ALERT' : ''); g.textAlign = 'left'; g.textBaseline = 'middle'; const w = g.measureText(s).width + 14 * d, X = Math.min(W - w - 6 * d, p[0] + 14 * d), Y = p[1] - 22 * d; g.fillStyle = 'rgba(10,13,18,0.92)'; g.fillRect(X, Y - 9 * d, w, 18 * d); g.strokeStyle = n.hot ? R : G; g.strokeRect(X + 0.5, Y - 9 * d + 0.5, w - 1, 18 * d - 1); g.fillStyle = n.hot ? R : G; g.fillText(s, X + 7 * d, Y); }
      g.textAlign = 'left'; this.drawn = Gr.nodes.length;
    },
  };

  /* ══ 5. tactile 2D depth layers on the live 1s–1m chart (a chart overlay: redrawn on every tick the chart paints) ══ */
  const Depth = U.depth = {
    st: V177.depthDefaults(), draws: 0, lastC: null, lastT: null, lastPasses: [],
    load() { try { this.st = V177.depthState(JSON.parse(localStorage.getItem('x177.depth') || 'null')); } catch (e) { this.st = V177.depthDefaults(); } },
    save() { try { localStorage.setItem('x177.depth', JSON.stringify(this.st)); } catch (e) { /* private window */ } },
    count() { return Object.values(this.st).filter(Boolean).length; },
    set(k, on) { if (!(k in this.st)) return; this.st[k] = !!on; this.save(); this.paint(); if (typeof chart !== 'undefined' && chart) chart.invalidate(); },
    overlay: null,
    mount() {
      const bar = $1('#tab-markets .toolbar'); if (!bar || $1('#x177DepthB')) return;
      const b = el('button', 'btn sm x177-depthb'); b.type = 'button'; b.id = 'x177DepthB'; b.title = 'Tactile 2D depth layers drawn on the live chart'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'x177DepthP');
      const rp = $1('#replayBtn', bar); if (rp) rp.before(b); else bar.appendChild(b);
      const p = el('div', 'x177-depthp'); p.id = 'x177DepthP'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Depth layers');
      for (const [k, l] of V177.DEPTH) { const lb = el('label', 'x177-dl'); const cb = el('input'); cb.type = 'checkbox'; cb.dataset.x177d = k; cb.addEventListener('change', () => this.set(k, cb.checked)); lb.append(cb, el('span', null, l)); p.appendChild(lb); }
      document.body.appendChild(p);
      b.addEventListener('click', () => { p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) { const r = b.getBoundingClientRect(); p.style.top = Math.round(r.bottom + 6) + 'px'; p.style.left = Math.round(Math.max(8, Math.min(innerWidth - 248, r.left))) + 'px'; } });
      document.addEventListener('pointerdown', (e) => { if (!p.hidden && !p.contains(e.target) && e.target !== b) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } }, true);
      this.paint();
    },
    paint() { for (const cb of $$1('[data-x177d]')) cb.checked = !!this.st[cb.dataset.x177d]; const b = $1('#x177DepthB'); if (b) b.textContent = '◈ Depth · ' + this.count(); },
    attach() { if (typeof chart === 'undefined' || !chart || !chart.overlays) return; if (!chart.overlays.includes(this.overlay)) { chart.overlays.unshift(this.overlay); chart.invalidate(); } },
  };
  Depth.overlay = (g, L, ch) => {
    const st = Depth.st, D = L.D || ch.data, a = L.start, b = L.end; if (!D || !(b - a > 2) || !L.py || !L.kx) return;
    const py = L.py, kx = L.kx, bw = L.bw, x0 = L.Lm, x1 = L.W - L.Rm, y0 = L.y0, y1 = L.y0 + L.mainH - (L.volH || 0), passes = [];
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0 + (L.volH || 0)); g.clip();
    /* behind the candles: destination-over paints under what the chart already drew */
    g.globalCompositeOperation = 'destination-over';
    if (st.vol) { const lc = D[b - 1].c, ly = Math.max(y0, Math.min(y1, py(lc))), gr = g.createLinearGradient(0, ly, 0, y1); gr.addColorStop(0, GA(0.16)); gr.addColorStop(1, GA(0)); g.fillStyle = gr; g.beginPath(); g.moveTo(kx(a), y1); for (let i = a; i < b; i++) g.lineTo(kx(i), py(D[i].c)); g.lineTo(kx(b - 1), y1); g.closePath(); g.fill(); passes.push('vol'); }
    if (st.grid) { const off = V177.parallax(ch.view && ch.view.off, L.bars, 40), sp = 46; g.strokeStyle = GA(0.05); g.lineWidth = 1; g.beginPath(); for (let x = x0 - (off % sp) - sp; x < x1 + sp; x += sp) { g.moveTo(x, y1); g.lineTo(x + (x - (x0 + x1) / 2) * 0.25, y0); } for (let k = 1; k <= 6; k++) { const y = y1 - (y1 - y0) * (1 - Math.pow(0.72, k)); g.moveTo(x0, y); g.lineTo(x1, y); } g.stroke(); passes.push('grid'); }
    if (st.bevel && bw >= 2) { let vm = 0; for (let i = a; i < b; i++) vm = Math.max(vm, D[i].v || 0); for (let i = a; i < b; i++) { const k = D[i], e = V177.extrude(k.v || 0, vm, bw), yA = py(Math.max(k.o, k.c)), yB = py(Math.min(k.o, k.c)), x = kx(i) - bw * 0.35; g.fillStyle = 'rgba(0,0,0,' + e.a.toFixed(3) + ')'; g.fillRect(x + e.dx, yA + e.dy, Math.max(1, bw * 0.7), Math.max(1, yB - yA)); } passes.push('bevel'); }
    g.globalCompositeOperation = 'source-over';
    /* on top: bevel highlights, slabs, shelves, beacons, halos */
    if (st.bevel && bw >= 4) { g.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = a; i < b; i++) { const k = D[i], yA = py(Math.max(k.o, k.c)), h = Math.max(1, py(Math.min(k.o, k.c)) - yA), x = kx(i) - bw * 0.35; g.fillRect(x, yA, 1, h); g.fillRect(x, yA, Math.max(1, bw * 0.7), 1); } }
    if (st.ob) { for (const z of V177.obZones(D, a, b, 4)) { const xa = kx(z.i) - bw / 2, yt = py(z.top), yb = py(z.bot), h = Math.max(2, yb - yt), c = z.bull ? GA : RA; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(xa + 3, yt + 3, x1 - xa, h); g.fillStyle = c(0.12); g.fillRect(xa, yt, x1 - xa, h); g.fillStyle = c(0.45); g.fillRect(xa, yt, x1 - xa, 1); } passes.push('ob'); }
    if (st.fvg) { for (const z of V177.fvg(D, a, b, 5)) { const xa = kx(z.i), yt = py(z.top), yb = py(z.bot), gr = g.createLinearGradient(xa, 0, x1, 0), c = z.bull ? GA : RA; gr.addColorStop(0, c(0.22)); gr.addColorStop(1, c(0)); g.fillStyle = gr; g.fillRect(xa, yt, x1 - xa, Math.max(1, yb - yt)); } passes.push('fvg'); }
    if (st.vpvr) { const V = V177.vpvr(D, a, b, 24); if (V.bins.length) { let vm = 0; for (const z of V.bins) vm = Math.max(vm, z.v); const wMax = (x1 - x0) * 0.16; V.bins.forEach((z, j) => { const yt = py(z.hi), yb = py(z.lo), h = Math.max(1, yb - yt - 1), w = vm ? (z.v / vm) * wMax : 0, x = x1 - w, poc = j === V.poc; g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - 3, yt + 2, w, h); g.fillStyle = poc ? GA(0.5) : GA(0.13); g.fillRect(x, yt, w, h); g.fillStyle = GA(poc ? 0.9 : 0.3); g.fillRect(x, yt, w, 1); }); const pz = V.bins[V.poc]; if (pz) { const y = py((pz.lo + pz.hi) / 2); g.strokeStyle = GA(0.55); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]); } } passes.push('vpvr'); }
    if (st.cvd && L.volH) { const C = V177.cvd(D, a, b); let m = 0; for (const v of C) m = Math.max(m, Math.abs(v)); const base = L.y0 + L.mainH, hh = L.volH * 0.9; for (let i = a; i < b; i++) { const v = C[i - a], h = m ? (Math.abs(v) / m) * hh : 0, x = kx(i) - bw * 0.2; g.fillStyle = v >= 0 ? GA(0.35) : RA(0.35); g.fillRect(x, base - h, Math.max(1, bw * 0.4), h); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, base - h, Math.max(1, bw * 0.4), 1); } passes.push('cvd'); }
    if (st.avwap) { const A = V177.avwap(D, a, b); g.lineWidth = 6; g.strokeStyle = GA(0.08); g.beginPath(); for (let i = a; i < b; i++) { const y = py(A[i - a]); if (i === a) g.moveTo(kx(i), y); else g.lineTo(kx(i), y); } g.stroke(); g.lineWidth = 1.4; g.strokeStyle = GA(0.7); g.stroke(); passes.push('avwap'); }
    if (st.liq) { const P = V177.liqPools(D, a, b, 3); for (const [arr, c] of [[P.hi, RA], [P.lo, GA]]) for (const z of arr) { const y = py(z.p), gr = g.createLinearGradient(0, y - 8, 0, y + 8); gr.addColorStop(0, c(0)); gr.addColorStop(0.5, c(0.28)); gr.addColorStop(1, c(0)); g.fillStyle = gr; g.fillRect(kx(z.i), y - 8, x1 - kx(z.i), 16); } passes.push('liq'); }
    const A17 = typeof V17App !== 'undefined' ? V17App : null;
    if (st.gex && A17 && A17.gex && A17.gex.r) { const r = A17.gex.r; for (const [p, c] of [[r.callWall, GA], [r.putWall, RA], [r.flip, GA]]) { if (!(p > 0)) continue; const y = py(p); if (y < y0 || y > y1) continue; const gr = g.createLinearGradient(0, y - 10, 0, y + 10); gr.addColorStop(0, c(0)); gr.addColorStop(0.5, c(0.3)); gr.addColorStop(1, c(0)); g.fillStyle = gr; g.fillRect(x0, y - 10, x1 - x0, 20); } passes.push('gex'); }
    if (st.rr && A17 && A17.ruler && A17.ruler.done) { const ru = A17.ruler, ya = py(ru.a.p), yb = py(ru.b.p), yt = py(ru.a.p + (ru.a.p - ru.b.p) * 2), xa = kx(Math.max(a, b - 30)); g.fillStyle = RA(0.12); g.fillRect(xa, Math.min(ya, yb), x1 - xa, Math.abs(yb - ya)); g.fillStyle = GA(0.12); g.fillRect(xa, Math.min(ya, yt), x1 - xa, Math.abs(yt - ya)); g.strokeStyle = GA(0.6); g.strokeRect(xa + 0.5, Math.min(yt, yb) + 0.5, x1 - xa - 1, Math.abs(yt - yb)); passes.push('rr'); }
    g.globalCompositeOperation = 'lighter';
    if (st.whale) { const S = spr(); for (const i of V177.whales(D, a, b, 2.5)) { const k = D[i], x = kx(i), y = py(k.c >= k.o ? k.h : k.l), r = Math.max(10, bw * 2.2); g.globalAlpha = 0.6; g.drawImage(k.c >= k.o ? S.g : S.r, x - r, y - r, r * 2, r * 2); } g.globalAlpha = 1; passes.push('whale'); }
    if (st.glow) { const k = D[b - 1], y = py(k.c); if (y >= y0 && y <= y1) { const S = spr(), x = kx(b - 1), r = Math.max(16, bw * 3); g.globalAlpha = 0.75; g.drawImage(k.c >= k.o ? S.g : S.r, x - r, y - r, r * 2, r * 2); g.globalAlpha = 0.18; g.drawImage(S.g, x - r * 3, y - r * 0.6, r * 6, r * 1.2); g.globalAlpha = 1; } passes.push('glow'); }
    g.restore();
    Depth.draws++; Depth.lastC = D[b - 1].c; Depth.lastT = D[b - 1].t; Depth.lastPasses = passes;
  };

  /* ══ 6. the detached 3D chart mode is deleted (it rendered a frozen copy of the candles, decoupled from live ticks) ══ */
  const kill3D = () => {
    const D = typeof V171UI !== 'undefined' && V171UI.chart3d; if (D && !D._x177) { try { if (D.on) D.toggle(false); } catch (e) { /* not mounted */ } D._x177 = true; D.mountPill = () => {}; D.toggle = function () { this.on = false; return false; }; D.start = () => {}; }
    for (const s of ['#x171_3d', '#x171D3W', '#x175LayB', '#x175LayDr']) { const e = $1(s); if (e) e.remove(); }
  };

  /* ══ 7. 24/7 Optional Live Bot: clean execution view ══ */
  const Live = U.live = {
    mount() {
      const s = $1('#tab-fleet'); if (!s || !s.firstChild || $1('#x177Ctl')) return; const A = typeof V17App !== 'undefined' ? V17App : null; if (!A) return;
      const c = el('div', 'x177-ctl'); c.id = 'x177Ctl';
      const cp = el('button', 'btn sm x177-cp'); cp.type = 'button'; cp.id = 'x177Cp'; cp.setAttribute('role', 'switch');
      const arm = el('button', 'btn sm pri x177-arm'); arm.type = 'button'; arm.id = 'x177Arm';
      const st = el('span', 'x177-st mono'); st.id = 'x177St'; c.append(cp, arm, st);
      const wrap = $1('.x17-wrap', s) || s; wrap.prepend(c);
      const pick = (m) => { const b = $1(`[data-x17f="mode"][data-v="${m}"]`, s); if (b) b.click(); };
      cp.addEventListener('click', () => { const m = (A.cfg && A.cfg.mode) || 'paper'; pick(m === 'copilot' ? 'paper' : 'copilot'); this.paint(); });
      arm.addEventListener('click', () => { const m = (A.cfg && A.cfg.mode) || 'paper'; if (m === 'live') pick('paper'); else pick('live'); this.paint(); });
      this.paint();
    },
    paint() {
      const A = typeof V17App !== 'undefined' ? V17App : null, cp = $1('#x177Cp'), arm = $1('#x177Arm'), st = $1('#x177St'); if (!A || !cp) return; const m = (A.cfg && A.cfg.mode) || 'paper', armed = !!(A.cfg && A.cfg.arm && A.cfg.arm.armed);
      cp.textContent = 'Co-Pilot approvals · ' + (m === 'copilot' ? 'ON' : 'OFF'); cp.setAttribute('aria-checked', String(m === 'copilot')); cp.classList.toggle('on', m === 'copilot');
      arm.textContent = m === 'live' ? 'Disarm → Paper' : 'Arm 24/7 Live Bot…'; arm.classList.toggle('red', m === 'live');
      st.textContent = m === 'live' ? (armed ? 'LIVE · ARMED' : 'LIVE · NOT ARMED') : m === 'copilot' ? 'CO-PILOT · every order waits for you' : 'PAPER · simulated fills';
    },
  };
  /* the Synapse / Working Bots canvases no longer exist on screen: never start their loops */
  const quietSynapse = () => { const C = typeof V171UI !== 'undefined' && V171UI.core; if (C && !C._x177 && typeof C.start === 'function') { C._x177 = true; const st = C.start.bind(C); C.start = function () { if (document.body.classList.contains('x177')) return; return st(); }; if (C.raf && typeof C.stop === 'function') C.stop(); } };

  /* ══ boot ══ */
  const tick = () => {
    try { mountFull(); Rail.mount(); kill3D(); quietSynapse(); Depth.mount(); Depth.attach(); Live.mount(); Live.paint(); Rail.sync(); if (tab() === 'botradar') Radar.paintHud(); if (Date.now() - (U.pruneAt || 0) > 2000) { U.pruneAt = Date.now(); Radar.pop.prune(Date.now()); } } catch (e) { console.warn('v177', e); }
  };
  const hookTape = () => {
    const E = typeof V166UI !== 'undefined' && V166UI.E; if (!E || E._x177 || typeof E.ingest !== 'function') return; E._x177 = true; const ing = E.ingest.bind(E);
    E.ingest = function (sym, ms, price, size, usd, side, venue) { const seq = ing.apply(E, arguments); try { const u = usd > 0 ? usd : price * (size > 0 ? size : 0), oc = /^oc:/.test(sym), o = oc && typeof OC !== 'undefined' && OC.stats ? OC.stats[sym] : null; if (u > 0) Radar.feed({ sym, t: ms, px: price, qty: size, usd: u, side: side === 'sell' ? 'sell' : 'buy', who: oc && venue && venue !== 'DEX pool' ? String(venue) : '', ageH: o && o.created ? (Date.now() - o.created) / 36e5 : null }); } catch (e) { /* radar must never break the tape */ } return seq; };
  };
  U.start = () => {
    if (U.mounted) return; U.mounted = true; document.body.classList.add('x177'); Depth.load(); hookTape(); tick();
    if (typeof showTab === 'function' && !showTab._x177) { const o = showTab; showTab = function (n) { const r = o.apply(this, arguments); try { Rail.sync(); if (n === 'botradar') Radar.L.start(); else if (Radar.L) Radar.L.stop(); if (n === 'brain') Brain.L.start(); else if (Brain.L) Brain.L.stop(); if (n === 'fleet') setTimeout(() => { Live.mount(); Live.paint(); }, 0); } catch (e) { /* never block navigation */ } return r; }; showTab._x177 = true; } // eslint-disable-line no-func-assign
    try { const B = window.__EXTERM_BUS; if (B && B.on) B.on((e) => Brain.on(e)); } catch (e) { /* bus not ready */ }
    try { if (typeof Feed !== 'undefined' && Feed.tickL && !Feed._x177) { Feed._x177 = true; Feed.tickL.push((s, p) => { try { Sim.onTick(s, p); } catch (e) { /* demo only */ } }); } } catch (e) { /* feed not ready */ }
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (Radar.L) Radar.L.stop(); if (Brain.L) Brain.L.stop(); } else { if (Radar.L) Radar.L.start(); if (Brain.L) Brain.L.start(); } });
    setInterval(() => { hookTape(); tick(); }, 1000); setInterval(() => { if (tab() === 'botradar' && !document.hidden) Radar.paintHud(); }, 250); setInterval(() => { if (tab() === 'botradar' && !document.hidden) Radar.resort(); }, 200);
  };
  U.tick = tick; U.Rail = Rail;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b177 = boot; boot = async function () { await _b177.apply(this, arguments); try { V177UI.start(); } catch (e) { console.warn('v177 init', e); } }; }
