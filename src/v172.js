/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.2 UI (maths in V172, v172core.js). Same pattern as v17.0 / v17.1: mounted by a 500 ms tick, listeners only,
   text through textContent (strict CSP, no inline handlers, no eval).
   · Theme      strict Obsidian #07080B / #0D1117 / #161B22 + Bullion Gold #F5C84B, Emerald #22C55E, Crimson #EF4444,
                one-time migration to the Obsidian & Gold theme (the picker still works afterwards)
   · Synapse    Bot Fleet → "THE SYNAPSE" neural cockpit. It takes over V171UI.core (same API: raf, fps, events, NODES, cone,
                scope, start / stop / on / record), so every bus listener and the 0-fps-when-hidden contract stay intact.
                Left   SENSORY INPUT LAYER: WS ticks/s (Feed.tickL), L1/L2 SWR cache (Resource Timing + serve.py
                       Server-Timing), Worker Math (Worker.postMessage), Cross-Exchange CVD (V170UI.merger), GEX/Volatility
                Centre 6 neural nodes → central ExTerm core, dendrite curves firing impulses for every background event
                Right  CORTEX: active symbol price + mini curve + synaptic weight bars
                Bottom SIGNAL ROTATION (phase-space attractor) · THE TRACE (ms-stamped process stream) · THE PRICER
                       (Monte Carlo fan of futures, 48 GBM paths, p5–p95 bands) */
const V172UI = (() => {
  const U = { mounted: false, n: 0, migrated: false };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const T = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const A = () => (typeof V17App !== 'undefined' ? V17App : null);
  const UI1 = () => (typeof V171UI !== 'undefined' ? V171UI : null);
  const sym = () => (typeof ST !== 'undefined' ? ST.sel : '');
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const candles = () => (typeof chart !== 'undefined' && chart && Array.isArray(chart.data) ? chart.data : []);
  const TH = V172.THEME, RGB = V172.RGB;
  const DPR = () => Math.max(1, Math.min(3, devicePixelRatio || 1));
  const fmtP = (p) => (!(p > 0) ? '–' : p < 0.001 ? '$' + p.toPrecision(3) : '$' + (typeof NT !== 'undefined' && NT.fmtPrice ? NT.fmtPrice(p) : p.toLocaleString('en-US', { maximumFractionDigits: p < 1 ? 6 : 2 })));
  const fmtK = (v) => { if (!Number.isFinite(v)) return '–'; const a = Math.abs(v), s = a < 0.5 ? '' : v < 0 ? '−' : '+'; if (a < 0.5) return '$0'; return s + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0)); };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

  /* ══ 1. strict Obsidian & Bullion Gold ══ */
  const theme = () => {
    document.body.classList.add('x172');
    if (U.migrated || typeof ST === 'undefined' || !ST || typeof Themes === 'undefined') return;
    U.migrated = true; let done = null; try { done = localStorage.getItem('x172.theme'); } catch (e) { done = '1'; }
    if (!done) { try { localStorage.setItem('x172.theme', '1'); } catch (e) { /* private window */ } if (ST.theme !== 'obsidian') { Themes.apply('obsidian'); if (typeof saveState === 'function') saveState(); } }
    const m = $1('meta[name="theme-color"]'); if (m && /^(obsidian|gold)$/.test(document.body.dataset.theme || '')) m.content = TH.bg;
  };

  /* ══ 2. background process sensors (real counters, never synthetic) ══ */
  const S = U.sense = { ticks: new V172.Rate(60), net: new V172.Rate(60), work: new V172.Rate(60), hits1: 0, hits2: 0, miss: 0, req: 0, cvd: new V172.Hist(60), vol: new V172.Hist(60), cache: new V172.Hist(60), lastSym: '', burst: 0, cvdSrc: 'bars' };
  const Trace = U.trace = { ring: new V171.Ring(120), dirty: true, n: 0 };
  const log = (cls, text, t) => { Trace.ring.push({ t: t || Date.now(), cls, text: String(text).slice(0, 140) }); Trace.dirty = true; Trace.n++; };
  let Core = null, Syn = null;
  /* internal pulses (sensors) reach the synapse directly: they are terminal activity, not bus / fleet activity */
  const pulse = (node, col, text) => { if (Syn) Syn.fire(node, col, false); if (text) log(col, text); };
  const hostOf = (url) => { try { const u = new URL(url), q = u.searchParams.get('u'); return q ? new URL(q).hostname : u.hostname; } catch (x) { return 'local'; } };
  const hookSensors = () => {
    if (U.hooked) return; U.hooked = true;
    if (typeof Feed !== 'undefined' && Feed.tickL) Feed.tickL.push((s) => { S.ticks.count(); S.burst++; S.lastSym = s; });
    try {
      if (typeof PerformanceObserver !== 'undefined') new PerformanceObserver((list) => { for (const e of list.getEntries()) {
        S.net.count(); S.req++; const st = (e.serverTiming || []).find((x) => x.name === 'swr'), url = String(e.name); let kind = 'net';
        if (e.transferSize === 0 && e.decodedBodySize > 0) { S.hits1++; kind = 'L1'; } else if (st && st.description === 'MISS') { S.miss++; kind = 'miss'; } else if (st) { S.hits2++; kind = 'L2'; }
        const host = hostOf(url);
        if (/screen|scan|dexscreener|gecko|birdeye|pump/i.test(url)) pulse(3, 'gold', `screener scan · ${host}`);
        else if (kind === 'miss') pulse(5, 'dn', `firewall gate · upstream 429 shield · ${host}`);
        else pulse(0, 'gold', `cache ${kind === 'L1' ? 'L1 hit (browser)' : kind === 'L2' ? 'L2 SWR ' + st.description : 'fetch'} · ${host} · ${Math.round(e.duration)} ms`);
      } }).observe({ type: 'resource', buffered: false });
    } catch (e) { /* old engine */ }
    try { if (typeof Worker !== 'undefined' && !Worker.prototype._x172) { const pm = Worker.prototype.postMessage; Worker.prototype.postMessage = function () { S.work.count(); pulse(2, 'gold', ''); return pm.apply(this, arguments); }; Worker.prototype._x172 = true; } } catch (e) { /* locked prototype */ }
    try { if (typeof Safety !== 'undefined' && Safety.scan && !Safety.scan._x172) { const sc = Safety.scan; Safety.scan = function (id) { pulse(3, 'up', 'safety scan · ' + String(id).slice(0, 10) + '…'); return sc.apply(Safety, arguments); }; Safety.scan._x172 = true; } } catch (e) { /* frozen */ }
  };
  const hookApp = () => {
    const a = A(); if (!a) return;
    if (a.Opts && a.Opts.gex && !a.Opts.gex._x172) { const g = a.Opts.gex; a.Opts.gex = async function () { const r = await g.apply(a.Opts, arguments); if (r) pulse(1, 'gold', `GEX recalc · flip ${fmtP(r.flip)} · ${r.regime || '–'}`); return r; }; a.Opts.gex._x172 = true; }
    if (a.Fleet && a.Fleet.exec && !a.Fleet.exec._x172) { const ex = a.Fleet.exec; a.Fleet.exec = async function (o) { const r = await ex.apply(this, arguments); if (r && r.ok === false) { const B = UI1() && UI1().bus; if (B) B.emit('block', { node: 'Firewall', text: `firewall gate · ${o && o.side} ${o && o.sym} blocked: ${r.why || 'risk'}`, src: 'fleet' }); } return r; }; a.Fleet.exec._x172 = true; }
  };
  /* once a second: roll the meters, sample CVD / volatility / cache ratio, log WS bursts */
  const sample = () => {
    const now = Date.now(); S.ticks.roll(now); S.net.roll(now); S.work.roll(now);
    const C = candles(), st = V172.stats(C.slice(-200).map((k) => k.c)), m = typeof V170UI !== 'undefined' && V170UI.merger && V170UI.merger.n ? V170UI.merger : null;
    S.cvdSrc = m ? 'x-exch' : 'bars'; S.cvd.push(m ? m.cvd(V170.ALL) : V172.cvdBars(C, 60)); S.vol.push(st.sigma * 1e4);
    S.cache.push(S.req ? ((S.hits1 + S.hits2) / S.req) * 100 : 0);
    if (S.burst) { log('gold', `WS burst · ${S.burst} tick${S.burst > 1 ? 's' : ''} · ${S.lastSym || sym()}`); S.burst = 0; }
    if (Syn) Syn.fire(0, 'gold', false); // the 1 Hz sampler is itself a background process: the synapse never sits static
  };

  /* ══ 3. THE SYNAPSE ══ */
  const W8 = { CVD: 0, GEX: 0, '3D OB': 0, Momentum: 0, 'Risk Budget': 1 }, W8T = Object.assign({}, W8);
  Syn = U.syn = {
    imp: [], waves: [], heat: new Float32Array(6), counts: new Float32Array(6), coreFlash: 0, fan: null, fanAt: 0, fanKey: '', rec: false, frames: 0, last: 0, mesh: null, cvs: {}, pulses: 0,
    fire(node, col, external) { if (!Core || !Core.raf) return; if (Core.scope === 'fleet' && !external) return; if (this.imp.length < 90) this.imp.push({ node, col, t: 0, v: 0.012 + Math.random() * 0.014, br: Math.random() < 0.45 ? (Math.random() < 0.5 ? 1 : 2) : 0, out: Math.random() < 0.18 }); this.heat[node] = Math.min(1, this.heat[node] + 0.35); this.counts[node]++; this.pulses++; },
    html() {
      const sen = V172.SENSORS.map((n, i) => `<div class="x172-sen"><div class="x172-sl"><span>${n}</span><b id="x172Sv${i}">–</b></div><canvas class="x172-spark" id="x172Sp${i}" aria-hidden="true"></canvas><i class="x172-bar"><u id="x172Sb${i}"></u></i></div>`).join('');
      const w = V172.WEIGHTS.map((n, i) => `<div class="x172-w"><span>${n}</span><i><u id="x172Wb${i}"></u></i><b id="x172Wv${i}" class="mono">0.00</b></div>`).join('');
      return `<header class="x172-hd"><div class="x172-ttl"><b>THE SYNAPSE</b><span>Neural cockpit · every background terminal process, live</span></div>
        <div class="row x171-corebar"><div class="seg" role="group" aria-label="Activity scope"><button type="button" data-cs="all" class="on" aria-pressed="true">All Terminal Activity</button><button type="button" data-cs="fleet" aria-pressed="false">Bot Fleet Only</button></div><label class="x17-chk"><input type="checkbox" id="x171Auto" checked> Auto-Cycle Evolution</label><button type="button" class="btn xs x172-rec" data-cs="rec">● Record X Clip</button><span class="x172-fps mono" id="x17Fps">0 fps</span></div></header>
        <div class="x172-stage">
          <div class="x172-card x172-left"><h4>SENSORY INPUT LAYER</h4>${sen}</div>
          <div class="x172-card x172-center"><h4>THE SYNAPSE <em>6 neural nodes → central ExTerm core</em></h4><canvas id="x171Core" aria-label="The Synapse: six neural nodes firing impulses into the central ExTerm core for every background terminal event"></canvas><div class="x172-legend"><span class="g">● tick · cache · mutation</span><span class="u">● signal · whale · fill</span><span class="d">● firewall block</span></div></div>
          <div class="x172-card x172-right"><h4>CORTEX &amp; SYNAPTIC WEIGHTS</h4><div class="x172-sym"><b id="x172Sym">–</b><span class="mono" id="x172Px">–</span><em id="x172Chg" class="mono"></em></div><canvas id="x172Mini" aria-label="Active symbol mini curve"></canvas>${w}</div>
        </div>
        <div class="x172-row">
          <div class="x172-card"><h4>SIGNAL ROTATION <em>phase-space momentum attractor</em></h4><canvas id="x172Rot" aria-label="Phase-space attractor of the active symbol"></canvas></div>
          <div class="x172-card"><h4>THE TRACE <em>ms-stamped background process stream</em></h4><ol class="x172-trace mono" id="x171Tele" aria-live="off"></ol></div>
          <div class="x172-card"><h4>THE PRICER <em>Monte Carlo fan of futures</em></h4><canvas id="x172Fan" aria-label="Monte Carlo fan of 48 forward price paths with confidence bands"></canvas><p class="note" id="x172FanN"></p></div>
        </div>`;
    },
    mount() {
      const t = $1('#tab-fleet'); if (!t || !t.firstChild) return;
      const old = $1('#x17TorusC'); if (old && !old.dataset.x172) { old.dataset.x172 = '1'; old.textContent = ''; if (old.parentElement) old.parentElement.classList.add('x172-gone'); const cols = old.closest('.x17-cols'); if (cols) cols.classList.remove('x171-fleetcols'); }
      if ($1('#x172Syn')) return; const root = document.createElement('section'); root.id = 'x172Syn'; root.className = 'x172-syn'; root.setAttribute('aria-label', 'The Synapse neural cockpit'); root.innerHTML = this.html();
      const srch = $1(':scope > .x171-search', t); if (srch) srch.after(root); else t.prepend(root);
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-cs]'); if (!b) return; if (b.dataset.cs === 'rec') { Core.record(); return; } Core.scope = b.dataset.cs; for (const x of $$1('[data-cs="all"],[data-cs="fleet"]', root)) { const on = x.dataset.cs === Core.scope; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); } });
      $1('#x171Auto', root).addEventListener('change', (e) => { Core.auto = e.target.checked; });
      this.cvs = {}; for (const c of $$1('canvas', root)) { this.cvs[c.id] = c; if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fit(c)).observe(c); this.fit(c); }
      log('up', 'Synapse online · listening on window.__EXTERM_BUS');
    },
    fit(c) { const r = c.getBoundingClientRect(), d = DPR(), W = Math.max(40, Math.round(r.width * d)), H = Math.max(24, Math.round(r.height * d)); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } },
    on(e) {
      if (!Core.raf) return; if (Core.scope === 'fleet' && e.src !== 'fleet' && !/bot|flatten|stale/.test(e.type)) return;
      if (e.type === 'tick') return; // ticks are counted by the WS sensor, not as bus events
      Core.events++; const k = V172.classify(e); this.fire(k.node, k.col, true);
      if (/fill|win|loss|flatten|stale|bot|block/.test(e.type) && this.waves.length < 14) this.waves.push({ r: 0, col: k.col });
      if (e.text) { log(k.col, `${e.node ? e.node + ' · ' : ''}${e.text}`, e.t); Core.tele.push(new Date(e.t).toTimeString().slice(0, 8) + ' ' + e.text); }
    },
    start() {
      if (Core.raf || document.hidden) return; const cv = $1('#x171Core'); if (!cv) return;
      Core.mesh = Core.mesh || Core.geo(); this.mesh = Core.mesh; for (const c of Object.values(this.cvs)) this.fit(c);
      const T0 = A() ? A().torus : { raf: 0, fps: 0 }; this.last = performance.now(); this.frames = 0; let lastSample = 0;
      const loop = (now) => {
        if (!cv.isConnected || tab() !== 'fleet' || document.hidden) { Core.stop(); return; }
        this.frames++; if (now - this.last >= 1000) { Core.fps = Math.round((this.frames * 1000) / (now - this.last)); this.frames = 0; this.last = now; T0.fps = Core.fps; const f = $1('#x17Fps'); if (f) f.textContent = Core.fps + ' fps'; }
        if (now - lastSample >= 1000) { lastSample = now; try { sample(); this.cortex(); } catch (e) { /* sampling must not stop the loop */ } }
        try { this.drawCore(cv, now); this.drawSensors(now); this.drawMini(); this.drawRot(now); this.drawFan(now); this.paintTrace(); this.paintWeights(); } catch (e) { console.warn('v172', e); }
        if (Core.auto && now - Core.evoAt > 45000) { Core.evoAt = now; const F = A() && A().Fleet; if (F) setTimeout(() => { try { const r = F.evolve(); const B = UI1().bus; if (r && B) B.emit('bot', { node: 'Bots', text: `evolution: fast ${r.params.fast}/slow ${r.params.slow} · score ${r.score.toFixed(2)}`, src: 'fleet' }); } catch (e) { /* not enough candles */ } }, 0); }
        Core.raf = requestAnimationFrame(loop); T0.raf = Core.raf;
      };
      Core.raf = requestAnimationFrame(loop); T0.raf = Core.raf;
    },
    stop() { if (Core.raf) cancelAnimationFrame(Core.raf); Core.raf = 0; Core.fps = 0; const a = A(); if (a) { a.torus.raf = 0; a.torus.fps = 0; } const f = $1('#x17Fps'); if (f) f.textContent = '0 fps'; },
    layout(W, H) { // 6 node cards: 3 left, 3 right, around the core
      const d = DPR(), cx = W / 2, cy = H * 0.5, nw = Math.min(124 * d, W * 0.25), nh = 34 * d, px = Math.max(8 * d, W * 0.025), ys = [0.18, 0.5, 0.82];
      return V172.NODES.map((nm, i) => { const left = i < 3, y = H * ys[i % 3], x = left ? px : W - px - nw; return { nm, x, y: y - nh / 2, w: nw, h: nh, ax: left ? x + nw : x, ay: y, cx, cy }; });
    },
    bez(n, t, br) { // dendrite / axon: node anchor → core rim, cubic; br = branch twig offset (−1 / 0 / 1)
      const d = DPR(), R = Math.min(n.cx * 0.4, n.cy * 0.6), dir = n.ax < n.cx ? 1 : -1, x0 = n.ax, y0 = n.ay, x3 = n.cx - dir * R * 0.5, y3 = n.cy + (n.ay - n.cy) * 0.2, x1 = x0 + (x3 - x0) * 0.45, y1 = y0 + br * 22 * d, x2 = x3 - (x3 - x0) * 0.3, y2 = y3 - br * 14 * d, u = 1 - t;
      return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
    },
    drawCore(cv, now) {
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = DPR(), cx = W / 2, cy = H / 2, R = Math.min(W * 0.17, H * 0.3), M = this.mesh, nV = M.v.length / 3;
      if (!this.P2 || this.P2.length !== nV * 2) { this.P2 = new Float32Array(nV * 2); this.Z = new Float32Array(nV); } const P2 = this.P2, Z = this.Z;
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
      const act = Math.min(1, this.heat.reduce((s, v) => s + v, 0) / 3), breath = 0.5 + 0.5 * Math.sin(now / 900);
      const rg = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.2); rg.addColorStop(0, `rgba(245,200,75,${(0.14 + act * 0.2 + this.coreFlash * 0.3).toFixed(3)})`); rg.addColorStop(1, 'rgba(7,8,11,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      const nodes = this.layout(W, H);
      for (let i = 0; i < 6; i++) { const n = nodes[i], h = this.heat[i]; for (const br of [0, 1, -1]) { g.strokeStyle = `rgba(245,200,75,${((br ? 0.06 : 0.16) + h * (br ? 0.2 : 0.45)).toFixed(3)})`; g.lineWidth = (br ? 0.8 : 1.4) * d; g.beginPath(); for (let s = 0; s <= 24; s++) { const p = this.bez(n, s / 24, br); if (s) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke(); } this.heat[i] *= 0.965; }
      const a = now / 2600, b = now / 4100, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), Rk = R * (0.96 + breath * 0.04 + this.coreFlash * 0.08);
      for (let i = 0, j = 0; i < M.v.length; i += 3, j++) { const x = M.v[i], y = M.v[i + 1], z = M.v[i + 2], x1 = x * ca + z * sa, z1 = -x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, k = 3 / (3 + z2); P2[j * 2] = cx + x1 * Rk * k; P2[j * 2 + 1] = cy + y1 * Rk * k; Z[j] = z2; }
      g.lineWidth = d * 0.75; for (let i = 0; i < M.e.length; i += 2) { const p = M.e[i], q = M.e[i + 1], z = (Z[p] + Z[q]) / 2; g.strokeStyle = `rgba(245,200,75,${(0.08 + (1 - (z + 1) / 2) * (0.5 + act * 0.3)).toFixed(3)})`; g.beginPath(); g.moveTo(P2[p * 2], P2[p * 2 + 1]); g.lineTo(P2[q * 2], P2[q * 2 + 1]); g.stroke(); }
      g.fillStyle = `rgba(255,240,168,${(0.35 + act * 0.5).toFixed(2)})`; for (let j = 0; j < nV; j += 3) if (Z[j] < -0.4) g.fillRect(P2[j * 2] - d, P2[j * 2 + 1] - d, 2 * d, 2 * d);
      g.font = `800 ${11 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = TH.gold; g.fillText('EXTERM CORE', cx, cy + Rk + 18 * d);
      g.font = `600 ${9.5 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = TH.mut; g.fillText(`${Core.events} bus events · ${this.pulses} impulses`, cx, cy + Rk + 32 * d);
      this.imp = this.imp.filter((p) => p.t < 1);
      for (const p of this.imp) { p.t += p.v; const n = nodes[p.node], tt = p.out ? 1 - p.t : p.t, rgb = RGB[p.col] || RGB.gold, q = this.bez(n, tt, p.br === 2 ? -1 : p.br);
        for (let k = 1; k <= 5; k++) { const qq = this.bez(n, Math.max(0, Math.min(1, tt + (p.out ? 1 : -1) * k * 0.022)), p.br === 2 ? -1 : p.br); g.fillStyle = `rgba(${rgb},${(0.32 - k * 0.055).toFixed(3)})`; g.beginPath(); g.arc(qq[0], qq[1], (3.2 - k * 0.4) * d, 0, 6.2832); g.fill(); }
        g.shadowColor = `rgba(${rgb},1)`; g.shadowBlur = 12 * d; g.fillStyle = `rgb(${rgb})`; g.beginPath(); g.arc(q[0], q[1], 3.4 * d, 0, 6.2832); g.fill(); g.shadowBlur = 0;
        if (p.t >= 1 && !p.out) this.coreFlash = Math.min(1, this.coreFlash + (p.col === 'gold' ? 0.12 : 0.3)); }
      this.coreFlash *= 0.93;
      this.waves = this.waves.filter((w) => w.r < 1); for (const w of this.waves) { w.r += 0.016; g.strokeStyle = `rgba(${RGB[w.col] || RGB.gold},${(1 - w.r).toFixed(2)})`; g.lineWidth = 2 * d; g.beginPath(); g.arc(cx, cy, Rk * (1 + w.r * 1.3), 0, 6.2832); g.stroke(); }
      for (let i = 0; i < 6; i++) { const n = nodes[i], h = Math.min(1, this.heat[i] * 1.6), r = 7 * d;
        g.shadowColor = 'rgba(245,200,75,.9)'; g.shadowBlur = (4 + h * 18) * d; g.fillStyle = TH.panel; rr(g, n.x, n.y, n.w, n.h, r); g.fill(); g.shadowBlur = 0;
        g.strokeStyle = `rgba(245,200,75,${(0.45 + h * 0.55).toFixed(2)})`; g.lineWidth = (1 + h) * d; rr(g, n.x, n.y, n.w, n.h, r); g.stroke();
        g.fillStyle = `rgba(245,200,75,${(0.5 + h * 0.5).toFixed(2)})`; g.fillRect(n.x + 3 * d, n.y + 6 * d, 3 * d, n.h - 12 * d);
        g.textAlign = 'left'; g.font = `800 ${10.5 * d}px Inter, system-ui, sans-serif`; g.fillStyle = TH.gold; g.fillText(n.nm, n.x + 12 * d, n.y + 14 * d);
        g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = TH.mut; g.fillText(`${Math.round(this.counts[i])} impulses`, n.x + 12 * d, n.y + 27 * d);
        g.fillStyle = h > 0.15 ? TH.up : '#3A4250'; g.beginPath(); g.arc(n.x + n.w - 10 * d, n.y + n.h / 2, 3.2 * d, 0, 6.2832); g.fill(); }
      g.textAlign = 'left'; g.font = `700 ${10 * d}px Inter, system-ui, sans-serif`; g.fillStyle = 'rgba(245,200,75,.75)'; g.fillText(`EXTERM · THE SYNAPSE · ${sym() || ''}`, 10 * d, H - 10 * d);
      if (this.rec) { g.fillStyle = TH.dn; g.beginPath(); g.arc(W - 16 * d, 16 * d, 5 * d, 0, 6.2832); g.fill(); g.textAlign = 'right'; g.fillText('REC · balances hidden', W - 26 * d, 20 * d); }
    },
    spark(c, h, col, now) {
      if (!c) return; const g = c.getContext('2d'), W = c.width, H = c.height, d = DPR(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(245,200,75,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - 0.5); g.lineTo(W, H - 0.5); g.stroke();
      if (!h.length) { const y = H / 2 + Math.sin(now / 300) * H * 0.12; g.strokeStyle = 'rgba(245,200,75,.4)'; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); return; }
      const lo = Math.min(0, ...h), hi = Math.max(...h, lo + 1e-9), n = h.length, X = (i) => (W * i) / Math.max(19, n - 1), Y = (v) => H - 2 * d - ((v - lo) / (hi - lo)) * (H - 4 * d), off = W - X(n - 1);
      g.beginPath(); h.forEach((v, i) => (i ? g.lineTo(X(i) + off, Y(v)) : g.moveTo(X(i) + off, Y(v)))); g.lineTo(W, H); g.lineTo(off, H); g.closePath(); g.fillStyle = `rgba(${col},.14)`; g.fill();
      g.beginPath(); h.forEach((v, i) => (i ? g.lineTo(X(i) + off, Y(v)) : g.moveTo(X(i) + off, Y(v)))); g.strokeStyle = `rgba(${col},.95)`; g.lineWidth = 1.4 * d; g.stroke();
      g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(W - 3 * d, Y(h[n - 1]), (2 + Math.sin(now / 180)) * d, 0, 6.2832); g.fill();
    },
    drawSensors(now) {
      const cv = this.cvs, cvdH = S.cvd.h, volH = S.vol.h, cl = S.cvd.last() || 0, gx = A() && A().gex && A().gex.sym === sym() ? String(A().gex.r.regime || '').split(/[\s(]+/).slice(0, 2).join(' ') : '';
      const vals = [
        [S.ticks.h, RGB.gold, `${S.ticks.last().toFixed(1)}/s`, S.ticks.last() / Math.max(10, S.ticks.max())],
        [S.cache.h, RGB.gold, `L1 ${S.hits1} · L2 ${S.hits2} · ${Math.round(S.cache.last() || 0)}%`, (S.cache.last() || 0) / 100],
        [S.work.h, RGB.up, `${S.work.last().toFixed(1)} jobs/s`, S.work.last() / Math.max(4, S.work.max())],
        [cvdH, cl >= 0 ? RGB.up : RGB.dn, S.cvdSrc === 'x-exch' ? fmtK(cl) : `${(cl * 100).toFixed(1)}% bar Δ`, S.cvdSrc === 'x-exch' ? Math.abs(cl) / Math.max(1, ...cvdH.map(Math.abs)) : Math.abs(cl)],
        [volH, RGB.gold, `σ ${(S.vol.last() || 0).toFixed(1)} bps${gx ? ' · ' + gx : ''}`, (S.vol.last() || 0) / Math.max(1, ...volH)],
      ];
      vals.forEach(([h, col, txt, f], i) => { this.spark(cv['x172Sp' + i], h, col, now); if (this.frames % 15 === 0) { const v = $1('#x172Sv' + i), b = $1('#x172Sb' + i); if (v && v.textContent !== txt) v.textContent = txt; if (b) b.style.width = (Math.max(0.02, Math.min(1, f || 0)) * 100).toFixed(1) + '%'; } });
    },
    cortex() {
      const C = candles(), cl = C.slice(-120).map((k) => k.c), last = cl[cl.length - 1], first = cl[0], st = V172.stats(cl);
      const sEl = $1('#x172Sym'), pEl = $1('#x172Px'), cEl = $1('#x172Chg'); if (sEl) sEl.textContent = sym() || '–'; if (pEl) pEl.textContent = this.rec ? '$•••' : fmtP(last);
      if (cEl && first > 0 && last > 0) { const ch = (last / first - 1) * 100; cEl.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'; cEl.className = 'mono ' + (ch >= 0 ? 'up' : 'dn'); }
      let eq = NaN, ex = 0; try { if (typeof ACC !== 'undefined') { const pm = typeof priceMap === 'function' ? priceMap() : {}; eq = ACC.equity(pm); for (const [s, p] of Object.entries(ACC.pos || {})) ex += (p.qty || 0) * (pm[s] || (p.qty ? p.cost / p.qty : 0)); } } catch (e) { /* account not ready */ }
      const m = typeof V170UI !== 'undefined' && V170UI.merger && V170UI.merger.n ? V170UI.merger : null, a = A();
      Object.assign(W8T, V172.weights({ cvd: m ? m.cvd(V170.ALL) : NaN, vol: m ? m.v.reduce((s, v) => s + v.vol, 0) : NaN, cvdBars: V172.cvdBars(C, 60), gexRegime: a && a.gex && a.gex.sym === sym() ? a.gex.r.regime : null, sigma: st.sigma, ob: V172.obStrength(C, 80), rsi: V172.rsi(C.slice(-200).map((k) => k.c)), equity: eq, exposure: ex }));
    },
    paintWeights() { if (this.frames % 4) return; V172.WEIGHTS.forEach((k, i) => { W8[k] += (W8T[k] - W8[k]) * 0.18; const b = $1('#x172Wb' + i), v = $1('#x172Wv' + i); if (b) b.style.width = (Math.max(0.01, W8[k]) * 100).toFixed(1) + '%'; if (v) v.textContent = W8[k].toFixed(2); }); },
    drawMini() {
      const c = this.cvs.x172Mini; if (!c || this.frames % 6) return; const g = c.getContext('2d'), W = c.width, H = c.height, d = DPR(), C = candles().slice(-120); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); if (C.length < 3) return;
      const lo = Math.min(...C.map((k) => k.l)), hi = Math.max(...C.map((k) => k.h)), X = (i) => (W * i) / (C.length - 1), Y = (v) => H - 3 * d - ((v - lo) / (hi - lo || 1)) * (H - 6 * d), col = C[C.length - 1].c >= C[0].c ? RGB.up : RGB.dn;
      g.beginPath(); C.forEach((k, i) => (i ? g.lineTo(X(i), Y(k.c)) : g.moveTo(X(i), Y(k.c)))); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, `rgba(${col},.28)`); lg.addColorStop(1, 'rgba(7,8,11,0)'); g.fillStyle = lg; g.fill();
      g.beginPath(); C.forEach((k, i) => (i ? g.lineTo(X(i), Y(k.c)) : g.moveTo(X(i), Y(k.c)))); g.strokeStyle = TH.gold; g.lineWidth = 1.5 * d; g.stroke();
    },
    drawRot(now) {
      const c = this.cvs.x172Rot; if (!c) return; const g = c.getContext('2d'), W = c.width, H = c.height, d = DPR(), cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
      if (!this.ph || this.frames % 60 === 0) { let e = 0; this.ph = V172.phase(candles().slice(-230).map((k, i) => (e = i ? e + 0.35 * (k.c - e) : k.c)), 6, 180); } // EMA-smoothed closes: the momentum loop, not tick noise
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(7,8,11,.30)'; g.fillRect(0, 0, W, H); // phosphor persistence
      g.strokeStyle = 'rgba(245,200,75,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      const P = this.ph; if (!P || P.length < 4) { g.strokeStyle = 'rgba(245,200,75,.5)'; g.beginPath(); g.arc(cx, cy, R * 0.6, now / 400, now / 400 + 4); g.stroke(); return; }
      const rot = now / 7000, cr = Math.cos(rot), sr = Math.sin(rot), pt = (p) => [cx + (p[0] * cr - p[1] * sr) * R, cy + (p[0] * sr + p[1] * cr) * R];
      g.lineWidth = 1.2 * d; for (let i = 1; i < P.length; i++) { const a = pt(P[i - 1]), b = pt(P[i]); g.strokeStyle = `rgba(245,200,75,${(0.08 + (i / P.length) * 0.6).toFixed(3)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      const k = (now / 16) % P.length, i0 = Math.floor(k), fr = k - i0, p0 = P[i0], p1 = P[(i0 + 1) % P.length], hd = pt([p0[0] + (p1[0] - p0[0]) * fr, p0[1] + (p1[1] - p0[1]) * fr]);
      g.shadowColor = 'rgba(34,197,94,1)'; g.shadowBlur = 14 * d; g.fillStyle = TH.up; g.beginPath(); g.arc(hd[0], hd[1], 3.6 * d, 0, 6.2832); g.fill(); g.shadowBlur = 0;
      const e = pt(P[P.length - 1]); g.strokeStyle = TH.up; g.lineWidth = 1.5 * d; g.beginPath(); g.arc(e[0], e[1], 5 * d, 0, 6.2832); g.stroke();
      g.fillStyle = TH.mut; g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'left'; g.fillText(`z(p) vs z(p−6) · ${Core.fps || 0} Hz`, 6 * d, H - 6 * d);
    },
    drawFan(now) {
      const c = this.cvs.x172Fan; if (!c) return; const C = candles(), cl = C.slice(-200).map((k) => k.c), s0 = cl[cl.length - 1], key = sym() + ':' + C.length;
      if (!this.fan || now - this.fanAt > 6000 || key !== this.fanKey) { const st = V172.stats(cl); this.fan = V172.fan({ s0: s0 > 0 ? s0 : 100, mu: st.mu, sigma: st.sigma || 0.004, steps: 60, paths: 48, seed: (Math.floor(now / 6000) % 9973) + 11 }); this.fanAt = now; this.fanKey = key; this.fanDrawn = 0;
        const F0 = this.fan; Core.cone = { lo: Array.from(F0.p5, (v) => v - F0.s0), mid: Array.from(F0.p50, (v) => v - F0.s0), hi: Array.from(F0.p95, (v) => v - F0.s0) };
        const n = $1('#x172FanN'); if (n) n.textContent = `${F0.paths.length} GBM paths · 60 bars · P(up) ${(F0.pUp * 100).toFixed(0)}% · P(down) ${(F0.pDn * 100).toFixed(0)}% · σ from live ${sym() || ''} closes`; }
      const F = this.fan, g = c.getContext('2d'), W = c.width, H = c.height, d = DPR(), N = F.steps; this.fanDrawn = Math.min(N, (this.fanDrawn || 0) + 1.2); const upto = Math.max(2, Math.floor(this.fanDrawn));
      const lo = Math.min(F.lo, F.s0), hi = Math.max(F.hi, F.s0), X = (i) => 6 * d + ((W - 12 * d) * i) / (N - 1), Y = (v) => 14 * d + (1 - (v - lo) / (hi - lo || 1)) * (H - 30 * d);
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
      const band = (a, b, al) => { g.beginPath(); for (let i = 0; i < upto; i++) (i ? g.lineTo(X(i), Y(a[i])) : g.moveTo(X(i), Y(a[i]))); for (let i = upto - 1; i >= 0; i--) g.lineTo(X(i), Y(b[i])); g.closePath(); g.fillStyle = `rgba(245,200,75,${al})`; g.fill(); };
      band(F.p95, F.p5, 0.07); band(F.p75, F.p25, 0.12);
      g.lineWidth = 0.9 * d; F.paths.forEach((r, p) => { g.strokeStyle = `rgba(${RGB[F.tag[p]]},.45)`; g.beginPath(); for (let i = 0; i < upto; i++) (i ? g.lineTo(X(i), Y(r[i])) : g.moveTo(X(i), Y(r[i]))); g.stroke(); });
      g.strokeStyle = TH.gold; g.lineWidth = 2 * d; g.beginPath(); for (let i = 0; i < upto; i++) (i ? g.lineTo(X(i), Y(F.p50[i])) : g.moveTo(X(i), Y(F.p50[i]))); g.stroke();
      g.setLineDash([3 * d, 3 * d]); g.strokeStyle = 'rgba(248,250,252,.35)'; g.lineWidth = d; g.beginPath(); g.moveTo(X(0), Y(F.s0)); g.lineTo(W, Y(F.s0)); g.stroke(); g.setLineDash([]);
      const lab = (v) => (this.rec ? '$•••' : fmtP(v)); g.font = `700 ${9.5 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'right';
      g.fillStyle = TH.up; g.fillText('p95 ' + lab(F.p95[N - 1]), W - 6 * d, 11 * d); g.fillStyle = TH.dn; g.fillText('p5 ' + lab(F.p5[N - 1]), W - 6 * d, H - 4 * d);
      g.textAlign = 'left'; g.fillStyle = TH.gold; g.fillText('now ' + lab(F.s0), 6 * d, 11 * d); g.fillStyle = TH.mut; g.fillText('p5 · p25 · p50 · p75 · p95', 6 * d, H - 4 * d);
    },
    paintTrace() { // incremental: only new rows are created (and animate in); a full re-render only when recording toggles masking
      if (!Trace.dirty || this.frames % 6) return; Trace.dirty = false; const ol = $1('#x171Tele'); if (!ol) return;
      const row = (r, still) => { const li = document.createElement('li'); li.className = 'x172-t-' + r.cls + (still ? ' x172-still' : ''); const s = document.createElement('time'); s.textContent = V172.stamp(r.t); const b = document.createElement('span'); b.textContent = this.rec ? V172.maskMoney(r.text) : r.text; li.append(s, b); return li; };
      const all = Trace.ring.toArray(), full = Trace.full || ol.dataset.n == null || this.rec !== (ol.dataset.rec === '1');
      if (full) { Trace.full = false; ol.dataset.rec = this.rec ? '1' : '0'; const frag = document.createDocumentFragment(); for (const r of all.slice(-40).reverse()) frag.appendChild(row(r, true)); ol.replaceChildren(frag); }
      else { const k = Math.min(40, Math.max(0, Trace.n - +ol.dataset.n)); for (const r of all.slice(all.length - k)) ol.prepend(row(r, false)); while (ol.children.length > 40) ol.lastChild.remove(); }
      ol.dataset.n = String(Trace.n);
    },
    record() {
      const cv = $1('#x171Core'); if (!cv || !cv.captureStream || typeof MediaRecorder === 'undefined') { T('Recording needs Chrome / Edge (MediaRecorder)', 'dn'); return false; }
      const M = typeof V17Mob !== 'undefined' ? V17Mob : null, wasHidden = document.body.classList.contains('x17-hide');
      if (M && M.hideBalances && !wasHidden) M.hideBalances(true); this.rec = true; Trace.dirty = true; // auto-hide every dollar balance for the clip
      const st = cv.captureStream(60), mr = new MediaRecorder(st, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' }), parts = [];
      mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      mr.onstop = () => { this.rec = false; Trace.dirty = true; if (M && M.hideBalances && !wasHidden) M.hideBalances(false); const url = URL.createObjectURL(new Blob(parts, { type: 'video/webm' })), a = document.createElement('a'); a.href = url; a.download = 'exterm-synapse.webm'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); T('Clip saved: exterm-synapse.webm, balances hidden (post it on X)', 'up'); };
      mr.start(); log('dn', 'REC · Synapse clip recording 8 s · balances hidden'); T('● Recording 8 s of The Synapse (balances hidden)…'); setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, 8000); return true;
    },
  };

  /* take over V171UI.core: same object, so v171's bus listener, Fleet.start / stop wrappers and tick keep working */
  const takeover = () => {
    const u = UI1(); if (!u || !u.core) return false; if (u.core._x172) return true; Core = u.core;
    if (Core.raf) Core.stop(); const cur = $1('#x17TorusC #x171Core'); if (cur) cur.remove();
    Object.assign(Core, { NODES: V172.NODES.slice(), mount: () => Syn.mount(), start: () => Syn.start(), stop: () => Syn.stop(), on: (e) => Syn.on(e), record: () => Syn.record(), synapse: Syn, _x172: true });
    return true;
  };

  /* ══ boot ══ */
  const tick = () => { try {
    theme(); hookSensors(); hookApp();
    if (takeover()) { Syn.mount(); if (tab() === 'fleet' && !Core.raf && !document.hidden && $1('#x171Core')) Core.start(); }
    U.n++; } catch (e) { console.warn('v172', e); } };
  U.start = () => { if (U.mounted) return; U.mounted = true; tick(); setInterval(tick, 500); };
  U.theme = theme; U.log = log;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b172 = boot; boot = async function () { await _b172.apply(this, arguments); try { V172UI.start(); } catch (e) { console.warn('v172 init', e); } }; }
