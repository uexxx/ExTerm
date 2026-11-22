/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.3 UI (maths in V173, v173core.js). Listeners only, text through textContent, strict CSP.
   · Live bubbles   one high-speed physics + additive-light engine for the On-Chain bubble map (Age × Buy Pressure,
                    Radar.bubbles), the Market bubble map (v164 Discovery, animated in place) and the heat bubbles
                    (P4UI.Bubbles): 25–40+ tokens filling ~85 % of a ResizeObserver-sized canvas, glossy emerald / crimson
                    spheres with ticker + live %, 'lighter' halos, specular highlights, gold / emerald / crimson shockwave
                    rings on every update, hover repel, drag-fling; 0 fps only while hidden
   · Synapse        1-click Visual Engine Switcher: Synapse Cortex (fractal dendrites, comets, spores, pulsing core) ·
                    Singularity Burst (event horizon, radial filaments, coronal tendrils, shockwaves, callout badges) ·
                    Auto-Morph (cross-fades every 12 s), all additive ('lighter'), fed by window.__EXTERM_BUS + sensors
   · Matrix         // RUN LOG · // ACCESS LEDGER · // BLAST RADIUS · // ACTION HEAT · // THROUGHPUT · // BOT STATUS,
                    plus Signal Rotation and The Pricer, in the pre-v17.0 (v16.6) Obsidian & Gold palette */
const V173UI = (() => {
  const U = { mounted: false, engines: new Set(), n: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const A = () => (typeof V17App !== 'undefined' ? V17App : null);
  const S2 = () => (typeof V172UI !== 'undefined' ? V172UI : null);
  const tab = () => (typeof curTab !== 'undefined' ? curTab : 'markets');
  const sym = () => (typeof ST !== 'undefined' ? ST.sel : '');
  const DPR = () => Math.max(1, Math.min(3, devicePixelRatio || 1));
  const fin = Number.isFinite, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TH = V172.THEME, C = { gold: '245,184,65', gold2: '212,175,55', up: '47,208,138', dn: '255,90,95', white: '255,250,235' };
  const hidden = () => document.body.classList.contains('x17-hide');
  const money = (v) => (hidden() || (S2() && S2().syn.rec) ? '$•••' : fin(v) ? '$' + Math.round(v).toLocaleString('en-US') : '–');
  const pctTxt = (ch) => (fin(ch) ? (ch >= 0 ? '+' : '') + (Math.abs(ch) >= 100 ? ch.toFixed(0) : ch.toFixed(1)) + '%' : '');

  /* ══ 1. live bubble engine ══ */
  const sprites = new Map();
  const bucket = (col) => { const c = clamp(fin(col) ? col : 0, -1, 1), b = Math.round(c * 4); return b === 0 && c !== 0 ? (c > 0 ? 1 : -1) : b; }; // −4 … 4: emerald / crimson, gold only for exactly flat
  const rgbOf = (b) => { const k = Math.abs(b) / 4; if (b === 0) return [212, 175, 55]; return b > 0 ? [Math.round(30 + 17 * k), Math.round(150 + 58 * k), Math.round(100 + 38 * k)] : [Math.round(200 + 55 * k), Math.round(80 + 10 * k), Math.round(88 + 7 * k)]; };
  const sprite = (kind, b) => {
    const key = kind + b; if (sprites.has(key)) return sprites.get(key);
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), [r, gg, bb] = rgbOf(b), m = S / 2;
    if (kind === 'halo') { const gr = g.createRadialGradient(m, m, S * 0.18, m, m, m); gr.addColorStop(0, `rgba(${r},${gg},${bb},.75)`); gr.addColorStop(0.45, `rgba(${r},${gg},${bb},.28)`); gr.addColorStop(1, `rgba(${r},${gg},${bb},0)`); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
    else if (kind === 'ball') { const gr = g.createRadialGradient(m * 0.66, m * 0.6, S * 0.03, m, m, m); gr.addColorStop(0, 'rgba(255,255,255,.92)'); gr.addColorStop(0.16, `rgba(${Math.min(255, r + 90)},${Math.min(255, gg + 70)},${Math.min(255, bb + 70)},.98)`); gr.addColorStop(0.55, `rgba(${r},${gg},${bb},.95)`); gr.addColorStop(1, `rgba(${Math.round(r * 0.32)},${Math.round(gg * 0.32)},${Math.round(bb * 0.32)},.96)`); g.fillStyle = gr; g.beginPath(); g.arc(m, m, m - 1, 0, 6.2832); g.fill(); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.stroke(); }
    else { const gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
    sprites.set(key, c); return c;
  };
  /* cfg: {host, height() (css px), writeBack(n), tip(n) → html|null, tipEl, onPick(n, e), refresh() → items, label, axis} */
  const Live = (cv, cfg) => {
    const E = { cv, nodes: [], byId: new Map(), raf: 0, fps: 0, frames: 0, fpsAt: 0, last: 0, pulses: 0, rings: 0, ptr: { x: 0, y: 0, on: false, r: 70 }, drag: null, W: 0, H: 0, dead: false, paused: false, energy: 0, suppress: false };
    const ctx = cv.getContext('2d');
    const size = () => { const w = Math.max(240, Math.round((cfg.host && cfg.host.clientWidth) || cv.clientWidth || 900)), h = Math.max(260, Math.round(cfg.height ? cfg.height() : cv.clientHeight || 440)), d = DPR(); if (w === E.W && (h === E.H || (h < E.H && E.H - h < 6)) && cv.width === Math.round(w * d)) return false; /* grow at once, shrink past 6 px */ const sx = E.W ? w / E.W : 1, sy = E.H ? h / E.H : 1; E.W = w; E.H = h; cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + 'px'; cv.style.height = h + 'px'; for (const n of E.nodes) { n.x *= sx; n.y *= sy; } layout(); return true; };
    const layout = () => { const B = V173.box(E.W, E.H, 0.85), R = V173.radii(E.nodes.map((n) => n.size), E.W, E.H, { frac: cfg.frac || 0.3 }); E.nodes.forEach((n, i) => { n.r = R[i]; n.tx = B.x0 + n.tx01 * B.w; n.ty = B.y0 + n.ty01 * B.h; }); };
    E.set = (items) => {
      const seen = new Set(), list = [];
      for (const it of items) {
        let n = E.byId.get(it.id); const fresh = !n;
        if (!n) { n = { id: it.id, x: 0, y: 0, vx: 0, vy: 0, r: 10, ph: Math.random() * 6.28, rings: [], flash: 0, beat: 1 + Math.random() * 4 }; E.byId.set(it.id, n); }
        const prevCh = n.ch; Object.assign(n, { src: it.src, label: it.label, ch: it.ch, col: it.col, size: it.size, tx01: clamp(it.tx01, 0, 1), ty01: clamp(it.ty01, 0, 1), est: it.est });
        if (!fresh && fin(prevCh) && fin(it.ch) && Math.abs(it.ch - prevCh) > 1e-6) { n.rings.push({ a: 0, c: it.ch > prevCh ? 'up' : 'dn', w: 1 }); n.flash = 1; E.pulses++; }
        else if (!fresh && it.stamp && n.stamp && it.stamp !== n.stamp) { n.rings.push({ a: 0, c: 'gold', w: 0.8 }); n.flash = Math.max(n.flash, 0.6); E.pulses++; } // data refreshed, price unchanged
        n.stamp = it.stamp;
        seen.add(it.id); list.push(n);
      }
      for (const id of [...E.byId.keys()]) if (!seen.has(id)) E.byId.delete(id);
      E.nodes = list; size(); layout();
      for (const n of list) if (!n.x && !n.y) { n.x = n.tx + (Math.random() - 0.5) * 40; n.y = n.ty + (Math.random() - 0.5) * 40; n.rings.push({ a: 0, c: 'gold', w: 1 }); }
      wake();
    };
    const hit = (x, y) => { for (let i = E.nodes.length - 1; i >= 0; i--) { const n = E.nodes[i]; if (Math.hypot(n.x - x, n.y - y) <= n.r) return n; } return null; };
    const pos = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    let dr = null;
    cv.addEventListener('pointermove', (e) => { const p = pos(e); E.ptr.x = p.x; E.ptr.y = p.y; E.ptr.on = true; if (dr) { const now = performance.now(), dt = Math.max(0.008, (now - dr.t) / 1000); dr.vx = (p.x - dr.n.x) / dt; dr.vy = (p.y - dr.n.y) / dt; dr.n.x = p.x; dr.n.y = p.y; dr.t = now; dr.moved += Math.hypot(e.movementX || 0, e.movementY || 0); } const h = dr ? dr.n : hit(p.x, p.y); E.hover = h; cv.style.cursor = h ? (dr ? 'grabbing' : 'grab') : 'default'; if (cfg.tipEl) { const html = h && cfg.tip ? cfg.tip(h) : null; if (!html) cfg.tipEl.hidden = true; else { cfg.tipEl.innerHTML = html; cfg.tipEl.hidden = false; const c = P4.clampTip(h.x + h.r + 8, h.y - 40, cfg.tipEl.offsetWidth, cfg.tipEl.offsetHeight, E.W, E.H); cfg.tipEl.style.left = c.x + 'px'; cfg.tipEl.style.top = c.y + 'px'; } } });
    cv.addEventListener('pointerleave', () => { E.ptr.on = false; E.hover = null; if (cfg.tipEl) cfg.tipEl.hidden = true; });
    cv.addEventListener('pointerdown', (e) => { const p = pos(e), n = hit(p.x, p.y); if (!n) return; dr = { n, t: performance.now(), vx: 0, vy: 0, moved: 0, x0: p.x, y0: p.y }; n.drag = true; n.flash = 1; n.rings.push({ a: 0, c: 'gold', w: 1.2 }); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } });
    const up = (e) => { if (!dr) return; const n = dr.n, p = pos(e), moved = Math.hypot(p.x - dr.x0, p.y - dr.y0); n.drag = false; const vm = Math.max(E.W, E.H) * 2.2, sp = Math.hypot(dr.vx, dr.vy) || 1, k = Math.min(1, vm / sp); n.vx = dr.vx * k; n.vy = dr.vy * k; dr = null; if (moved > 5) E.suppress = true; else if (cfg.onPick) cfg.onPick(n, e); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('click', (e) => { if (E.suppress) { E.suppress = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (!t) return; const b = cv.getBoundingClientRect(); if (hit(t.clientX - b.left, t.clientY - b.top)) e.preventDefault(); }, { passive: false }); // drag a bubble instead of scrolling; scroll anywhere else
    if (typeof ResizeObserver !== 'undefined' && cfg.host) new ResizeObserver(() => { if (size()) wake(); }).observe(cfg.host);
    const draw = (now) => {
      E.raf = 0; if (!cv.isConnected) { E.stop(); return; }
      if (document.hidden || !cv.offsetParent) { E.paused = true; E.fps = 0; return; }
      E.paused = false; const dt = Math.min(0.033, E.last ? (now - E.last) / 1000 : 0.016), t = now / 1000; E.last = now;
      if (E.frames % 15 === 0) size(); // live height (≈85 % of the viewport below the host) as the layout above it changes
      E.frames++; if (!E.fpsAt) E.fpsAt = now; if (now - E.fpsAt >= 1000) { E.fps = Math.round((E.frames * 1000) / (now - E.fpsAt)); E.frames = 0; E.fpsAt = now; }
      V173.step(E.nodes, dt, t, E.W, E.H, { ptr: E.ptr }); E.energy = V173.energy(E.nodes);
      if (cfg.writeBack) for (const n of E.nodes) cfg.writeBack(n);
      const d = DPR(); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, E.W, E.H);
      const B = V173.box(E.W, E.H, 0.85); ctx.strokeStyle = 'rgba(212,175,55,.14)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(B.x0, B.y0 + B.h / 2); ctx.lineTo(B.x0 + B.w, B.y0 + B.h / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      for (const n of E.nodes) { // additive halos, breathing + flashing: bubbles are never dark
        n.beat -= dt; if (n.beat <= 0) { n.beat = 2 + Math.random() * 5; n.rings.push({ a: 0, c: 'gold', w: 0.55 }); n.flash = Math.max(n.flash, 0.35); E.pulses++; }
        n.flash *= Math.exp(-dt * 2.4); const glow = clamp(0.5 + 0.22 * Math.sin(t * 2.7 + n.ph) + n.flash * 0.6, 0, 1.3), hr = n.r * (2.0 + n.flash * 0.6);
        ctx.globalAlpha = Math.min(1, glow); ctx.drawImage(sprite('halo', bucket(n.col)), n.x - hr, n.y - hr, hr * 2, hr * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (const n of E.nodes) ctx.drawImage(sprite('ball', bucket(n.col)), n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      ctx.globalCompositeOperation = 'lighter';
      for (const n of E.nodes) { // specular highlight + shockwave rings
        const sr = n.r * 0.42; ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 3.1 + n.ph) + n.flash * 0.3; ctx.drawImage(sprite('spec', 0), n.x - n.r * 0.36 - sr, n.y - n.r * 0.4 - sr, sr * 2, sr * 2);
        ctx.globalAlpha = 1; n.rings = n.rings.filter((g) => g.a < 1);
        for (const g of n.rings) { g.a += dt * 1.25; const rr = n.r + g.a * (34 + n.r * 1.5), al = (1 - g.a) * g.w; ctx.strokeStyle = `rgba(${C[g.c] || C.gold},${al.toFixed(3)})`; ctx.lineWidth = 1 + 2.6 * (1 - g.a) * g.w; ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.2832); ctx.stroke(); E.rings++; }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (const n of E.nodes) {
        if (n.r < 10) continue; const fs = clamp(n.r * 0.4, 9, 20), lab = String(n.label || '?'), has = fin(n.ch) && n.r >= 17, yy = has ? n.y - fs * 0.38 : n.y;
        ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`; let s = lab; const mx = n.r * 1.8; if (ctx.measureText(s).width > mx) { while (s.length > 2 && ctx.measureText(s + '…').width > mx) s = s.slice(0, -1); s += '…'; }
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(s, n.x, yy); ctx.fillStyle = '#fffaf0'; ctx.fillText(s, n.x, yy);
        if (has) { const f2 = clamp(fs * 0.78, 8, 15); ctx.font = `700 ${f2}px ui-monospace, Menlo, monospace`; const pt = pctTxt(n.ch); ctx.strokeText(pt, n.x, n.y + fs * 0.62); ctx.fillStyle = n.ch >= 0 ? '#c9ffe3' : '#ffd3d4'; ctx.fillText(pt, n.x, n.y + fs * 0.62); }
        if (E.hover === n) { ctx.strokeStyle = TH.gold2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, 6.2832); ctx.stroke(); }
      }
      E.raf = requestAnimationFrame(draw);
    };
    const wake = () => { if (!E.raf && !E.dead) E.raf = requestAnimationFrame(draw); };
    E.wake = wake;
    E.timer = setInterval(() => { if (!cv.isConnected) { E.stop(); return; } if (!E.raf && !document.hidden && cv.offsetParent) { E.last = 0; wake(); } if (cfg.refresh && !document.hidden && cv.offsetParent) { const it = cfg.refresh(); if (it) E.set(it); } }, 1500);
    E.stop = () => { E.dead = true; if (E.raf) cancelAnimationFrame(E.raf); E.raf = 0; E.fps = 0; clearInterval(E.timer); U.engines.delete(E); };
    U.engines.add(E); return E;
  };
  U.Live = Live;

  /* ── 1a. On-Chain bubble map: x = age, y = 5m buy pressure (Radar.bubbles) ── */
  const vh85 = (host) => () => { const top = Math.max(0, host.getBoundingClientRect().top); return Math.max(420, Math.round(Math.min(innerHeight * 0.85, innerHeight - top - 12))); };
  const onchainItems = (rows) => {
    const now = Date.now(), list = rows.slice(0, 40), raw = list.map((s) => { const st = (typeof OC !== 'undefined' && OC.stats[s]) || {}; return { s, st, ageMin: st.created ? (now - st.created) / 60000 : null, buys: st.buys5m, sells: st.sells5m, ch: fin(st.ch1h) ? st.ch1h : fin(st.ch5m) ? st.ch5m : fin(st.ch24h) ? st.ch24h : 0 }; });
    const tg = V173.targets(raw);
    return raw.map((r, i) => ({ id: r.s, src: r, label: ((typeof OC !== 'undefined' && OC.meta[r.s]) || {}).s || String(r.s).split(':').pop().slice(0, 6), ch: r.ch, col: clamp(r.ch / 30, -1, 1), size: Math.max(1, r.st.vol1h || r.st.liq || 1), tx01: tg[i].tx, ty01: tg[i].ty, est: tg[i].est, stamp: r.st.ts || 0 }));
  };
  const hookRadar = () => {
    if (typeof Radar === 'undefined' || Radar._x173) return; Radar._x173 = true; const orig = Radar.bubbles;
    Radar.bubbles = (host, rows) => {
      try {
        const ex = host._x173; if (ex && ex.cv.isConnected && host.contains(ex.cv)) { ex.rows = rows; ex.set(onchainItems(rows)); return; }
        host.innerHTML = '<div class="rd-bub x173-bub"><canvas id="rdCv" class="x173-live" aria-label="On-chain bubble map: age (newer right) versus 5-minute buy pressure (higher up), size = 1h volume, colour = 1h change"></canvas><div class="rd-tip" id="rdTip" hidden></div><div class="rd-axis note"><span>← older</span><span>buy pressure ↑</span><span>newer →</span></div></div>';
        const cv = $1('#rdCv', host), wrap = cv.parentElement, tip = $1('#rdTip', host);
        const E = Live(cv, { host: wrap, height: vh85(wrap), tipEl: tip, onPick: (n) => { if (typeof openSym === 'function') openSym(n.id); }, refresh: () => onchainItems(E.rows || rows),
          tip: (n) => { const st = n.src.st, m = (typeof OC !== 'undefined' && OC.meta[n.id]) || {}; const esc2 = typeof esc === 'function' ? esc : V171.esc; return `<b>${esc2(m.s || n.label)}</b> <span class="note">${esc2(String(m.n || '').slice(0, 24))}</span><div>MC ${st.mcap || st.fdv ? '$' + NT.fmtCompact(st.mcap || st.fdv) : '–'} · Liq ${st.liq ? '$' + NT.fmtCompact(st.liq) : '–'}</div><div>1h <span class="${n.ch >= 0 ? 'up' : 'dn'}">${esc2(pctTxt(n.ch))}</span> · vol $${NT.fmtCompact(st.vol1h || 0)}</div><div>${n.est ? 'buy pressure est. from 1h change' : Math.round((st.buys5m / Math.max(1, st.buys5m + st.sells5m)) * 100) + '% buys (5m)'}${n.src.ageMin ? ' · ' + esc2(Math.round(n.src.ageMin) + 'm old') : ''}</div><div class="note">drag to fling · click: chart</div>`; } });
        E.rows = rows; host._x173 = E; E.set(onchainItems(rows));
      } catch (e) { console.warn('v173 radar', e); return orig(host, rows); }
    };
  };
  /* ── 1b. heat bubbles (P4UI.Bubbles): same API (set / stop), live engine underneath ── */
  const hookP4 = () => {
    if (typeof P4UI === 'undefined' || P4UI._x173 || typeof P4 === 'undefined') return; P4UI._x173 = true;
    P4UI.Bubbles = (host, o) => {
      host.innerHTML = `<div class="p4-bub x173-bub"><canvas class="x173-live" aria-label="Bubble heat map"></canvas><div class="rd-tip p4-tip" hidden></div><div class="rd-axis note"><span>${V171.esc(o.axis[0])}</span><span>${V171.esc(o.axis[1])}</span><span>${V171.esc(o.axis[2])}</span></div></div>`;
      const cv = $1('canvas', host), tip = $1('.p4-tip', host), wrap = cv.parentElement;
      const E = Live(cv, { host: wrap, height: () => Math.max(360, Math.min(720, innerHeight - 280)), tipEl: tip, tip: (n) => o.tip({ id: n.id, d: n.src, bp: n.src.bp, ch: n.ch }) + '<div class="note">drag to fling · Shift+click · ⚙ Auto-Setup</div>',
        onPick: (n, e) => { if (e.shiftKey && typeof V151UI !== 'undefined') V151UI.autoSetup(n.id); else o.onPick(n.id); } });
      const B = { nodes: [], engine: E };
      B.set = (items) => { const W = 1000, H = 600, T = P4.bubbleTargets(items, W, H, { density: 2 }); B.items = items; E.set(T.map((t) => ({ id: t.id, src: t.d, label: t.d.label || t.id, ch: t.ch, col: clamp(t.ch / (o.scale || 6), -1, 1), size: Math.max(1e-6, t.d.size || 1), tx01: t.tx / W, ty01: t.ty / H }))); B.nodes = E.nodes; if (o.onFrame) o.onFrame(E.nodes); P4UI.fps = E.fps; };
      B.stop = () => E.stop();
      return B;
    };
  };
  /* ── 1c. Market bubble map (v164): animate its own bubPts so hitBub / tooltips / clicks follow the motion ── */
  U.marketBubbles = (cv, pts, o) => {
    try {
      let E = cv._x173; // same canvas (v164 re-renders every price tick): keep the engine, its positions and momentum
      if (!E || E.dead) { E = Live(cv, { host: o.host, height: vh85(cv), frac: 0.3, writeBack: (n) => { n.src.x = n.x; n.src.y = n.y; n.src.rad = n.r; } }); cv._x173 = E; cv.classList.add('x173-live'); }
      E.hH = o.H;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      E.set(pts.map((p, i) => { const ch = [p.r.ch24, p.r.ch, p.r.chg, p.r.change].find(fin); return { id: p.r.id || p.r.sym || i, src: p, label: p.r.sym, ch: fin(ch) ? ch : 0, col: o.color(p), size: p.rad * p.rad, tx01: x1 > x0 ? (p.x - x0) / (x1 - x0) : 0.5, ty01: y1 > y0 ? (p.y - y0) / (y1 - y0) : 0.5 }; }));
      return true;
    } catch (e) { console.warn('v173 market bubbles', e); return false; }
  };

  /* ══ 2. THE SYNAPSE: Synapse Cortex · Singularity Burst · Auto-Morph ══ */
  const ENG = [['cortex', 'Synapse Cortex'], ['singularity', 'Singularity Burst'], ['auto', 'Auto-Morph']];
  const NODE_BADGE = ['TICK BATCH', 'GEX SHIFT', '3D OB WALL', 'WHALE SWEEP', 'AI SIGNAL', 'FIREWALL PASS'];
  const X = U.syn = {
    eng: (() => { try { return localStorage.getItem('x173.eng') || 'auto'; } catch (e) { return 'auto'; } })(), morph: 0, morphAt: 0, morphFrom: 'cortex', morphTo: 'singularity', last: 0,
    comets: [], spores: new V173.Pool(800), fil: new V173.Pool(3200), badges: [], shocks: [], trees: null, treeKey: '', flash: 0, evq: [], lastEvt: null,
    heat: new V173.Heat(6, 30), thru: new V173.Thru(40), acc: {}, events: 0, ambient: 0, bright: 0,
  };
  const accHit = (k, ok) => { const a = X.acc[k] || (X.acc[k] = { ok: 0, deny: 0, at: 0 }); if (ok === false) a.deny++; else a.ok++; a.at = Date.now(); };
  /* every Synapse impulse (bus events + background sensors) lands here */
  const onFire = (node, col, external) => {
    const now = Date.now(), e = X.lastEvt && now - X.lastEvt.at < 30 ? X.lastEvt.e : null, b = e ? V173.badge(e) : { text: node === 5 && col === 'dn' ? 'FIREWALL BLOCK' : NODE_BADGE[node] || 'TICK BATCH', col: col === 'dn' ? 'dn' : node === 3 || col === 'up' ? 'up' : 'gold' };
    X.events++; X.heat.hit(node, now); X.thru.add(col, now); X.evq.push({ node, col, badge: b, ext: !!external, t: now }); if (X.evq.length > 64) X.evq.shift();
    accHit(['WS Feed / Cache', 'GEX / DOM', 'Worker / 3D OB', 'Screener', 'Copilot / AI', 'Firewall'][node] || 'Terminal', !(node === 5 && col === 'dn'));
  };
  const hookSyn = () => {
    const s2 = S2(); if (!s2 || !s2.syn || s2.syn._x173) return !!(s2 && s2.syn && s2.syn._x173); const Syn = s2.syn;
    const f0 = Syn.fire.bind(Syn); Syn.fire = function (node, col, external) { f0(node, col, external); const core = typeof V171UI !== 'undefined' ? V171UI.core : null; if (core && core.raf && !(core.scope === 'fleet' && !external)) onFire(node, col, external); };
    const o0 = Syn.on.bind(Syn); Syn.on = function (e) { X.lastEvt = { e, at: Date.now() }; if (e && e.src === 'fleet') accHit('Bot Fleet', !/block|stale/.test(e.type)); if (e && e.node === 'Ledger') accHit('Ledger', true); return o0(e); };
    const d0 = Syn.drawCore.bind(Syn); Syn._drawV172 = d0;
    Syn.drawCore = function (cv, now) { drawEngines(cv, now, Syn); try { drawMatrix(now, Syn); } catch (e) { console.warn('v173 matrix', e); } };
    Syn._x173 = true; return true;
  };
  /* ── shared geometry ── */
  const nodesOf = (Syn, W, H) => Syn.layout(W, H);
  const card = (g, n, h, d) => { const r = 7 * d, lit = Math.max(0.28, h); g.save(); g.globalCompositeOperation = 'lighter'; const hr = Math.max(n.w, n.h) * (0.62 + lit * 0.25), cx = n.x + n.w / 2, cy = n.y + n.h / 2; g.globalAlpha = Math.min(0.7, lit * 0.6); g.drawImage(sprite('halo', 0), cx - hr, cy - hr, hr * 2, hr * 2); g.restore();
    g.fillStyle = TH.panel; rrect(g, n.x, n.y, n.w, n.h, r); g.fill(); g.strokeStyle = `rgba(${C.gold},${(0.5 + lit * 0.5).toFixed(2)})`; g.lineWidth = (1 + lit * 1.4) * d; rrect(g, n.x, n.y, n.w, n.h, r); g.stroke();
    g.fillStyle = `rgba(${C.gold},${(0.55 + lit * 0.45).toFixed(2)})`; g.fillRect(n.x + 3 * d, n.y + 6 * d, 3 * d, n.h - 12 * d);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = `800 ${10.5 * d}px Inter, system-ui, sans-serif`; g.fillStyle = TH.gold2; g.fillText(n.nm, n.x + 12 * d, n.y + 14 * d);
    g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = TH.mut; g.fillText(`${Math.round(n.count || 0)} impulses`, n.x + 12 * d, n.y + 27 * d);
    g.fillStyle = h > 0.12 ? TH.up : '#3a3426'; g.beginPath(); g.arc(n.x + n.w - 10 * d, n.y + n.h / 2, 3.2 * d, 0, 6.2832); g.fill(); };
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  /* ── engine dispatcher (Auto-Morph cross-fade) ── */
  const drawEngines = (cv, now, Syn) => {
    const g = cv.getContext('2d'), dt = Math.min(0.05, X.last ? (now - X.last) / 1000 : 0.016); X.last = now;
    const dk = Math.exp(-dt * 2.2); for (let i = 0; i < 6; i++) Syn.heat[i] *= dk; Syn.imp.length = 0; Syn.waves.length = 0; // v17.2's impulse queues are drawn by these engines now
    const evs = X.evq.splice(0); let a = X.eng, b = null, m = 0;
    if (X.eng === 'auto') { if (!X.morphAt) X.morphAt = now; const ph = (now - X.morphAt) % 24000; a = ph < 12000 ? 'cortex' : 'singularity'; b = a === 'cortex' ? 'singularity' : 'cortex'; const into = ph % 12000; m = into > 10500 ? (into - 10500) / 1500 : 0; X.cur = m > 0.5 ? b : a; } else X.cur = a;
    const run = (k, al, ev) => { g.save(); g.globalAlpha = al; if (k === 'singularity') singularity(g, cv, now, dt, Syn, ev, al); else cortex(g, cv, now, dt, Syn, ev, al); g.restore(); };
    run(a, 1, evs); if (b && m > 0) run(b, m, evs);
    const d = DPR(); g.globalCompositeOperation = 'source-over'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = `700 ${10 * d}px Inter, system-ui, sans-serif`; g.fillStyle = `rgba(${C.gold},.8)`; g.fillText(`EXTERM · ${X.cur === 'singularity' ? 'SINGULARITY BURST' : 'SYNAPSE CORTEX'}${X.eng === 'auto' ? ' · AUTO-MORPH' : ''} · ${sym() || ''}`, 10 * d, cv.height - 10 * d);
    if (Syn.rec) { g.fillStyle = TH.dn; g.beginPath(); g.arc(cv.width - 16 * d, 16 * d, 5 * d, 0, 6.2832); g.fill(); g.textAlign = 'right'; g.fillText('REC · balances hidden', cv.width - 26 * d, 20 * d); }
  };
  /* ── Synapse Cortex ── */
  const cortex = (g, cv, now, dt, Syn, evs, al) => {
    const W = cv.width, H = cv.height, d = DPR(), cx = W / 2, cy = H / 2, R = Math.min(W * 0.17, H * 0.3), t = now / 1000, nodes = nodesOf(Syn, W, H), act = Math.min(1, Syn.heat.reduce((s, v) => s + v, 0) / 2.4);
    for (let i = 0; i < 6; i++) nodes[i].count = Syn.counts[i];
    const key = W + 'x' + H; if (X.treeKey !== key) { X.treeKey = key; X.trees = []; nodes.forEach((n, i) => { for (let k = 0; k < 3; k++) X.trees.push({ node: i, seg: V173.tree(n.ax, n.ay + (k - 1) * 9 * d, cx + (n.ax < cx ? -1 : 1) * R * 0.55, cy + (n.ay - cy) * 0.25, { seed: i * 31 + k * 7 + 3, depth: 6, first: 0.26 }) }); }); for (let k = 0; k < 10; k++) { const an = (k / 10) * 6.2832 + 0.3; X.trees.push({ node: k % 6, core: true, seg: V173.tree(cx + Math.cos(an) * R * 0.6, cy + Math.sin(an) * R * 0.6, cx + Math.cos(an) * Math.min(W, H) * 0.47, cy + Math.sin(an) * Math.min(W, H) * 0.47, { seed: 97 + k * 13, depth: 4, first: 0.3 }) }); } }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const beat = 0.5 + 0.5 * Math.sin(t * 9.4), core = R * (0.36 + 0.06 * beat + X.flash * 0.12);
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.1); rg.addColorStop(0, `rgba(${C.gold},${(0.5 + 0.25 * beat + X.flash * 0.3).toFixed(3)})`); rg.addColorStop(0.3, `rgba(${C.gold2},${(0.1 + act * 0.1).toFixed(3)})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    /* fractal dendrites lit by travelling waves (bucketed into 5 brightness × 2 width classes) */
    const paths = []; for (let i = 0; i < 10; i++) paths.push(new Path2D());
    for (const tr of X.trees) { const s = tr.seg, h = Syn.heat[tr.node] || 0, ph = tr.node * 1.7 + (tr.core ? 2.2 : 0); for (let i = 0; i < s.length; i += 5) { const dep = s[i + 4], w = Math.pow(Math.max(0, Math.sin(dep * 7.5 - t * (tr.core ? -6 : 7.5) + ph)), 6), v = clamp(0.22 + h * 0.5 + w * (0.55 + act * 0.45), 0, 1), lv = Math.min(4, Math.floor(v * 5)), wc = dep < 0.35 ? 0 : 1; const p = paths[lv * 2 + wc]; p.moveTo(s[i], s[i + 1]); p.lineTo(s[i + 2], s[i + 3]); } }
    for (let lv = 0; lv < 5; lv++) for (let wc = 0; wc < 2; wc++) { g.strokeStyle = `rgba(${C.gold},${(0.1 + lv * 0.17).toFixed(2)})`; g.lineWidth = (wc ? 0.9 : 1.8) * d * (1 + lv * 0.12); g.stroke(paths[lv * 2 + wc]); }
    /* rotating geodesic core, fast */
    const M = Syn.mesh || (typeof V171UI !== 'undefined' && V171UI.core.mesh); if (M) { const nV = M.v.length / 3, aa = t * 0.9, bb = t * 0.55, ca = Math.cos(aa), sa = Math.sin(aa), cb = Math.cos(bb), sb = Math.sin(bb), P = X.P2 && X.P2.length === nV * 2 ? X.P2 : (X.P2 = new Float32Array(nV * 2)), rr2 = R * (0.92 + beat * 0.06 + X.flash * 0.08); for (let i = 0, j = 0; i < M.v.length; i += 3, j++) { const x = M.v[i], y = M.v[i + 1], z = M.v[i + 2], x1 = x * ca + z * sa, z1 = -x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, k = 3 / (3 + z2); P[j * 2] = cx + x1 * rr2 * k; P[j * 2 + 1] = cy + y1 * rr2 * k; } const mp = new Path2D(); for (let i = 0; i < M.e.length; i += 2) { const p = M.e[i], q = M.e[i + 1]; mp.moveTo(P[p * 2], P[p * 2 + 1]); mp.lineTo(P[q * 2], P[q * 2 + 1]); } g.strokeStyle = `rgba(${C.gold},${(0.22 + act * 0.25 + X.flash * 0.2).toFixed(3)})`; g.lineWidth = 0.8 * d; g.stroke(mp); }
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, core); cg.addColorStop(0, 'rgba(255,250,230,.95)'); cg.addColorStop(0.35, `rgba(${C.gold},.85)`); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, core, 0, 6.2832); g.fill();
    /* comets: every event fires packets; arrivals relay to another node; an ambient stream keeps it moving */
    for (const e of evs) { for (let k = 0; k < 3; k++) X.comets.push({ node: e.node, u: -k * 0.08, v: 0.9 + Math.random() * 0.7, col: e.col, br: (k % 3) - 1, out: false }); X.flash = Math.min(1, X.flash + (e.col === 'gold' ? 0.08 : 0.25)); for (let k = 0; k < 14; k++) { const n = nodes[e.node]; X.spores.spawn(n.ax, n.ay, (Math.random() - 0.5) * 160 * d, (Math.random() - 0.7) * 120 * d, 0.6 + Math.random() * 0.8, e.col === 'up' ? 1 : e.col === 'dn' ? 2 : 0); } }
    X.ambient += dt * (7 + act * 10); while (X.ambient >= 1) { X.ambient -= 1; X.comets.push({ node: Math.floor(Math.random() * 6), u: 0, v: 0.8 + Math.random() * 0.8, col: 'gold', br: Math.floor(Math.random() * 3) - 1, out: Math.random() < 0.3 }); }
    if (X.comets.length > 220) X.comets.splice(0, X.comets.length - 220);
    const heads = { gold: new Path2D(), up: new Path2D(), dn: new Path2D() }, tails = { gold: new Path2D(), up: new Path2D(), dn: new Path2D() };
    X.comets = X.comets.filter((c) => { c.u += c.v * dt; if (c.u >= 1) { if (!c.out && Math.random() < 0.65) { c.node = Math.floor(Math.random() * 6); c.u = 0; c.out = true; c.br = Math.floor(Math.random() * 3) - 1; X.flash = Math.min(1, X.flash + 0.04); } else return false; } if (c.u < 0) return true; const n = nodes[c.node], q = (u) => Syn.bez(n, c.out ? 1 - u : u, c.br), h = q(c.u), tp = tails[c.col] || tails.gold, hp = heads[c.col] || heads.gold; tp.moveTo(h[0], h[1]); for (let k = 1; k <= 6; k++) { const pp = q(Math.max(0, c.u - k * 0.03)); tp.lineTo(pp[0], pp[1]); } hp.moveTo(h[0] + 3.4 * d, h[1]); hp.arc(h[0], h[1], 3.4 * d, 0, 6.2832); return true; });
    for (const k of ['gold', 'up', 'dn']) { g.strokeStyle = `rgba(${C[k]},.55)`; g.lineWidth = 2.6 * d; g.stroke(tails[k]); g.fillStyle = `rgba(${C[k]},1)`; g.fill(heads[k]); g.fillStyle = `rgba(${C.white},.55)`; g.fill(heads[k]); }
    /* spore cascades from the core (continuous) + node bursts */
    const sr = 60 + act * 120; X.sporeAcc = (X.sporeAcc || 0) + dt * sr; while (X.sporeAcc >= 1) { X.sporeAcc -= 1; const an = Math.random() * 6.2832, sp = (90 + Math.random() * 260) * d; X.spores.spawn(cx + Math.cos(an) * core, cy + Math.sin(an) * core, Math.cos(an) * sp, Math.sin(an) * sp, 0.7 + Math.random() * 1.1, 0); }
    X.spores.update(dt, 70 * d, 0.8); const P0 = X.spores, sp3 = [new Path2D(), new Path2D(), new Path2D()]; for (let i = 0; i < P0.n; i++) { if (P0.life[i] <= 0) continue; const s = (1.2 + 1.6 * (P0.life[i] / P0.max[i])) * d; sp3[P0.c[i]].rect(P0.x[i] - s / 2, P0.y[i] - s / 2, s, s); }
    ['gold', 'up', 'dn'].forEach((k, i) => { g.fillStyle = `rgba(${C[k]},.8)`; g.fill(sp3[i]); });
    X.shocks = X.shocks.filter((s) => s.a < 1); for (const e of evs) if (e.col !== 'gold' && X.shocks.length < 16) X.shocks.push({ a: 0, col: e.col }); for (const s of X.shocks) { s.a += dt * 1.1; g.strokeStyle = `rgba(${C[s.col]},${(1 - s.a).toFixed(2)})`; g.lineWidth = 3 * d * (1 - s.a) + d; g.beginPath(); g.arc(cx, cy, R * (0.6 + s.a * 2.2), 0, 6.2832); g.stroke(); }
    X.flash *= Math.exp(-dt * 3);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) card(g, nodes[i], Math.min(1, Syn.heat[i] * 1.6 + 0.15 + 0.1 * Math.sin(t * 5 + i)), d);
    g.textAlign = 'center'; g.font = `800 ${11 * d}px Inter, system-ui, sans-serif`; g.fillStyle = TH.gold2; g.fillText('EXTERM CORE', cx, cy + R + 20 * d); g.font = `600 ${9.5 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = TH.mut; g.fillText(`${typeof V171UI !== 'undefined' ? V171UI.core.events : 0} bus events · ${Syn.pulses} impulses · ${X.comets.length} comets`, cx, cy + R + 34 * d);
  };
  /* ── Singularity Burst ── */
  const singularity = (g, cv, now, dt, Syn, evs, al) => {
    const W = cv.width, H = cv.height, d = DPR(), cx = W / 2, cy = H / 2, Rh = Math.min(W, H) * 0.15, t = now / 1000, act = Math.min(1, Syn.heat.reduce((s, v) => s + v, 0) / 2.4), Rn = Math.min(W * 0.42, H * 0.43);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#07080B'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(cx, cy, Rh * 0.9, cx, cy, Rh * 4.2); halo.addColorStop(0, `rgba(${C.gold},${(0.42 + act * 0.25 + X.flash * 0.3).toFixed(3)})`); halo.addColorStop(0.35, `rgba(${C.gold2},.12)`); halo.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = halo; g.fillRect(0, 0, W, H);
    /* radial filaments: thousands, ambient + bursts per event */
    const emit = (n, col, spMul, ang0) => { for (let k = 0; k < n; k++) { const an = ang0 == null ? Math.random() * 6.2832 : ang0 + (Math.random() - 0.5) * 0.9, sp = (260 + Math.random() * 760) * d * (spMul || 1), sw = (Math.random() - 0.5) * 0.35; X.fil.spawn(cx + Math.cos(an) * Rh * 1.04, cy + Math.sin(an) * Rh * 1.04, Math.cos(an + sw) * sp, Math.sin(an + sw) * sp, 0.45 + Math.random() * 0.9, col); } };
    X.filAcc = (X.filAcc || 0) + dt * (900 + act * 1400); const amb = Math.floor(X.filAcc); X.filAcc -= amb; emit(amb, 0, 1);
    for (const e of evs) { const ang = (e.node / 6) * 6.2832 - Math.PI / 2; emit(e.col === 'gold' ? 90 : 220, e.col === 'up' ? 1 : e.col === 'dn' ? 2 : 0, 1.35, ang); X.flash = Math.min(1, X.flash + (e.col === 'gold' ? 0.1 : 0.32)); if (X.shocks.length < 18) X.shocks.push({ a: 0, col: e.col, sing: true }); if (X.badges.length < 16 && (e.col !== 'gold' || Math.random() < 0.35)) X.badges.push({ text: e.badge.text, col: e.badge.col, x: cx + Math.cos(ang) * Rh * 1.3, y: cy + Math.sin(ang) * Rh * 1.3, vx: Math.cos(ang + (Math.random() - 0.5) * 0.6) * 420 * d, vy: Math.sin(ang + (Math.random() - 0.5) * 0.6) * 420 * d, life: 2.2 }); }
    X.fil.update(dt, 0, 0.35); const F = X.fil, fp = [new Path2D(), new Path2D(), new Path2D()]; for (let i = 0; i < F.n; i++) { if (F.life[i] <= 0) continue; const k = 0.028 + 0.02 * (F.life[i] / F.max[i]); fp[F.c[i]].moveTo(F.x[i] - F.vx[i] * k, F.y[i] - F.vy[i] * k); fp[F.c[i]].lineTo(F.x[i], F.y[i]); }
    ['gold', 'up', 'dn'].forEach((k, i) => { g.strokeStyle = `rgba(${C[k]},.5)`; g.lineWidth = 1.25 * d; g.stroke(fp[i]); });
    /* coronal plasma tendrils */
    for (let k = 0; k < 14; k++) { const a0 = (k / 14) * 6.2832 + t * (0.35 + (k % 3) * 0.12), len = Rh * (1.1 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.3 + k * 1.9)) + act * 0.5), p = new Path2D(); p.moveTo(cx + Math.cos(a0) * Rh, cy + Math.sin(a0) * Rh); for (let s = 1; s <= 10; s++) { const u = s / 10, an = a0 + Math.sin(t * 3.1 + k + u * 4) * 0.35 * u, rr = Rh + len * u; p.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); } [[7, 0.07], [3.2, 0.16], [1.3, 0.55]].forEach(([w, a]) => { g.strokeStyle = `rgba(${k % 4 === 0 ? '255,140,60' : C.gold},${a})`; g.lineWidth = w * d; g.stroke(p); }); }
    /* shockwave flashes */
    X.shocks = X.shocks.filter((s) => s.a < 1); for (const s of X.shocks) { s.a += dt * 1.6; g.strokeStyle = `rgba(${C[s.col] || C.gold},${(0.9 * (1 - s.a)).toFixed(2)})`; g.lineWidth = (4 * (1 - s.a) + 1) * d; g.beginPath(); g.arc(cx, cy, Rh * (1.05 + s.a * 4.2), 0, 6.2832); g.stroke(); }
    if (X.flash > 0.02) { g.fillStyle = `rgba(${C.gold},${(X.flash * 0.07).toFixed(3)})`; g.fillRect(0, 0, W, H); } X.flash *= Math.exp(-dt * 3);
    /* event horizon: pitch-black disc + photon ring */
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, Rh, 0, 6.2832); g.fill();
    g.globalCompositeOperation = 'lighter'; for (const [w, a] of [[9, 0.12], [4, 0.3], [1.6, 0.95]]) { g.strokeStyle = `rgba(${C.gold},${(a * (0.8 + 0.2 * Math.sin(t * 13)) + X.flash * 0.2).toFixed(3)})`; g.lineWidth = w * d; g.beginPath(); g.arc(cx, cy, Rh * 1.02, 0, 6.2832); g.stroke(); }
    g.setLineDash([10 * d, 14 * d]); g.lineDashOffset = -t * 120 * d; g.strokeStyle = `rgba(255,170,70,.55)`; g.lineWidth = 2 * d; g.beginPath(); g.arc(cx, cy, Rh * 1.22, 0, 6.2832); g.stroke(); g.setLineDash([]);
    /* 6 subsystem chips on the outer ring */
    g.globalCompositeOperation = 'source-over'; g.font = `800 ${10 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 6; i++) { const an = (i / 6) * 6.2832 - Math.PI / 2, x = cx + Math.cos(an) * Rn, y = cy + Math.sin(an) * Rn * 0.86, h = Math.min(1, Syn.heat[i] * 1.6 + 0.2), w = g.measureText(V172.NODES[i]).width + 22 * d, hh = 22 * d; g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = h; const hr = w * 0.8; g.drawImage(sprite('halo', 0), x - hr, y - hr, hr * 2, hr * 2); g.restore(); g.fillStyle = 'rgba(11,14,20,.85)'; rrect(g, x - w / 2, y - hh / 2, w, hh, 6 * d); g.fill(); g.strokeStyle = `rgba(${C.gold},${(0.45 + h * 0.55).toFixed(2)})`; g.lineWidth = d * (1 + h); rrect(g, x - w / 2, y - hh / 2, w, hh, 6 * d); g.stroke(); g.fillStyle = TH.gold2; g.fillText(V172.NODES[i], x, y + 0.5 * d); }
    /* callout badges erupting outward */
    X.badges = X.badges.filter((b) => b.life > 0); g.font = `800 ${10.5 * d}px ui-monospace, Menlo, monospace`;
    for (const b of X.badges) { b.life -= dt; const k = Math.exp(-dt * 2.6); b.vx *= k; b.vy *= k; b.x += b.vx * dt; b.y += b.vy * dt; const al2 = Math.min(1, b.life / 0.6), w = g.measureText(b.text).width + 18 * d, hh = 20 * d, x = clamp(b.x, w / 2 + 4, W - w / 2 - 4), y = clamp(b.y, hh, H - hh); g.globalAlpha = al2; g.fillStyle = 'rgba(11,14,20,.82)'; rrect(g, x - w / 2, y - hh / 2, w, hh, 5 * d); g.fill(); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(${C[b.col] || C.gold},.95)`; g.lineWidth = 1.5 * d; rrect(g, x - w / 2, y - hh / 2, w, hh, 5 * d); g.stroke(); g.restore(); g.fillStyle = `rgb(${C[b.col] || C.gold})`; g.fillText(b.text, x, y + 0.5 * d); g.globalAlpha = 1; }
    g.textBaseline = 'alphabetic'; g.font = `600 ${9.5 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = TH.mut; g.fillText(`${F.alive} filaments · ${X.badges.length} callouts`, cx, cy + Rh + 26 * d);
  };

  /* ══ 3. 6-panel institutional telemetry matrix ══ */
  const PANELS = [['RUN LOG', 'run'], ['ACCESS LEDGER', 'acc'], ['BLAST RADIUS', 'blast'], ['ACTION HEAT', 'heat'], ['THROUGHPUT', 'thru'], ['BOT STATUS', 'bots']];
  const mountMatrix = () => {
    const root = $1('#x172Syn'); if (!root || $1('#x173Mx', root)) return !!(root && $1('#x173Mx', root));
    const hd = $1('.x171-corebar', root); if (hd && !$1('.x173-eng', hd)) { const sw = document.createElement('div'); sw.className = 'seg x173-eng'; sw.setAttribute('role', 'radiogroup'); sw.setAttribute('aria-label', 'Visual engine'); sw.innerHTML = ENG.map(([k, l]) => `<button type="button" role="radio" data-x173eng="${k}" class="${X.eng === k ? 'on' : ''}" aria-checked="${X.eng === k}">${l}</button>`).join(''); hd.prepend(sw); sw.addEventListener('click', (e) => { const b = e.target.closest('[data-x173eng]'); if (!b) return; X.eng = b.dataset.x173eng; X.morphAt = 0; try { localStorage.setItem('x173.eng', X.eng); } catch (x) { /* private window */ } for (const x of $$1('[data-x173eng]', sw)) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); } }); }
    const fb = $1('[data-cs="fleet"]', root); if (fb) fb.textContent = 'Working Bots';
    const row = $1('.x172-row', root); if (!row) return false;
    const mx = document.createElement('div'); mx.id = 'x173Mx'; mx.className = 'x173-mx';
    mx.innerHTML = PANELS.map(([t, k]) => `<div class="x172-card x173-p" data-x173p="${k}"><h4>// ${t}</h4><div class="x173-b" id="x173B_${k}"></div></div>`).join('');
    row.before(mx);
    const ol = $1('#x171Tele', root); if (ol) $1('#x173B_run', mx).appendChild(ol);
    $1('#x173B_heat', mx).innerHTML = '<canvas id="x173Heat" aria-label="Action heat: impulses per subsystem per second, last 30 s"></canvas>';
    $1('#x173B_thru', mx).innerHTML = '<canvas id="x173Thru" aria-label="Throughput: events per second, last 40 s"></canvas><p class="note" id="x173ThruN"></p>';
    $1('#x173B_blast', mx).innerHTML = '<div class="x173-blast"><canvas id="x173Blast" aria-hidden="true"></canvas><dl id="x173BlastD"></dl></div>';
    $1('#x173B_acc', mx).innerHTML = '<table class="x173-t mono"><thead><tr><th>subsystem</th><th>grant</th><th>deny</th><th>last</th></tr></thead><tbody id="x173AccT"></tbody></table>';
    $1('#x173B_bots', mx).innerHTML = '<ul class="x173-bots" id="x173BotsL"></ul>';
    for (const c of $$1('.x172-row > .x172-card', root)) if (c.contains($1('#x171Tele', root)) || !c.querySelector('canvas')) c.remove();
    row.classList.add('x173-row2');
    const Syn = S2().syn; for (const c of $$1('canvas', mx)) { Syn.cvs[c.id] = c; if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => Syn.fit(c)).observe(c); Syn.fit(c); }
    return true;
  };
  const drawMatrix = (now, Syn) => {
    if (!$1('#x173Mx')) return; const d = DPR(), dt = Math.min(0.05, X.mLast ? (now - X.mLast) / 1000 : 0.016); X.mLast = now; const wall = Date.now();
    /* ACTION HEAT: 6 × 30 grid, cells flash on every impulse */
    X.heat.roll(wall); X.heat.decay(dt); const hc = Syn.cvs.x173Heat;
    if (hc) { const g = hc.getContext('2d'), W = hc.width, H = hc.height, lw = 58 * d, cols = 30, cw = (W - lw - 4 * d) / cols, ch = (H - 6 * d) / 6; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.font = `700 ${8.5 * d}px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle'; g.textAlign = 'left';
      let mxv = 1; for (let r = 0; r < 6; r++) for (let a = 0; a < cols; a++) mxv = Math.max(mxv, X.heat.cell(r, a));
      for (let r = 0; r < 6; r++) { g.fillStyle = TH.mut; g.fillText(V172.NODES[r], 0, 3 * d + ch * r + ch / 2); for (let a = 0; a < cols; a++) { const v = X.heat.cell(r, a) / mxv, f = X.heat.flash(r, a), x = lw + (cols - 1 - a) * cw, y = 3 * d + ch * r; g.fillStyle = `rgba(${C.gold2},${(0.06 + v * 0.6).toFixed(3)})`; g.fillRect(x + 1, y + 1, cw - 2, ch - 2); if (f > 0.02) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${r === 5 ? C.dn : r === 3 ? C.up : C.gold},${Math.min(1, f).toFixed(3)})`; g.fillRect(x, y, cw, ch); g.restore(); } } } }
    /* THROUGHPUT: stacked bar histogram */
    X.thru.roll(wall); const tc = Syn.cvs.x173Thru;
    if (tc) { const g = tc.getContext('2d'), W = tc.width, H = tc.height, N = X.thru.n, bars = X.thru.b.concat([X.thru.cur]), mxv = X.thru.max(), bw = W / N; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(212,175,55,.12)'; g.beginPath(); g.moveTo(0, H - 0.5); g.lineTo(W, H - 0.5); g.stroke();
      bars.slice(-N).forEach((b, i, arr) => { const x = W - (arr.length - i) * bw; let y = H; for (const [k, v] of [['gold', b.gold], ['up', b.up], ['dn', b.dn]]) { if (!v) continue; const h = (v / mxv) * (H - 4 * d); g.fillStyle = `rgba(${C[k]},${i === arr.length - 1 ? 1 : 0.78})`; g.fillRect(x + 1, y - h, bw - 2, h); y -= h; } });
      const lastB = X.thru.b[X.thru.b.length - 1], n = $1('#x173ThruN'); if (n && Syn.frames % 20 === 0) n.textContent = `${lastB ? lastB.gold + lastB.up + lastB.dn : 0} ev/s · peak ${mxv} · ${X.events} total`; }
    if (Syn.frames % 15) return; // DOM panels: ~4–8 Hz
    /* ACCESS LEDGER */
    const sense = S2().sense, rows = [['WS Feed', sense.ticks.total, 0, sense.ticks.total ? 0 : null], ['Browser L1 cache', sense.hits1, 0], ['Proxy L2 SWR', sense.hits2, sense.miss], ['Worker math', sense.work.total, 0]].map((r) => ({ k: r[0], ok: r[1], deny: r[2], at: null }));
    for (const [k, a] of Object.entries(X.acc)) rows.push({ k, ok: a.ok, deny: a.deny, at: a.at });
    const tb = $1('#x173AccT'); if (tb) { const frag = document.createDocumentFragment(); for (const r of rows.slice(0, 11)) { const tr = document.createElement('tr'); for (const [v, cl] of [[r.k, ''], [String(r.ok || 0), 'up'], [String(r.deny || 0), r.deny ? 'dn' : ''], [r.at ? Math.max(0, Math.round((wall - r.at) / 1000)) + 's' : '–', '']]) { const td = document.createElement('td'); td.textContent = v; if (cl) td.className = cl; tr.appendChild(td); } frag.appendChild(tr); } tb.replaceChildren(frag); }
    /* BLAST RADIUS */
    let eq = NaN, gross = 0, worst = 0, npos = 0; const C2 = typeof chart !== 'undefined' && chart && chart.data ? chart.data : [], sig = V172.stats(C2.slice(-200).map((k) => k.c)).sigma || 0.01;
    try { if (typeof ACC !== 'undefined') { const pm = typeof priceMap === 'function' ? priceMap() : {}; eq = ACC.equity(pm); for (const [s, p] of Object.entries(ACC.pos || {})) { if (!(p.qty > 0)) continue; npos++; const px = pm[s] || p.cost / p.qty, v = p.qty * px; gross += v; worst += p.sl ? Math.max(0, (px - p.sl) * p.qty) : v * Math.min(0.5, 2 * sig * Math.sqrt(24)); } } } catch (e) { /* account not ready */ }
    const L = window.__EXTERM_LEDGER, orders = L ? Object.keys(L.orders || {}).length : 0, bots = typeof ST !== 'undefined' && ST.bots ? ST.bots.filter((b) => b.run).length : 0, frac = eq > 0 ? clamp(gross / eq, 0, 1) : 0;
    const dl = $1('#x173BlastD'); if (dl) { const frag = document.createDocumentFragment(); for (const [k, v, cl] of [['open positions', String(npos), ''], ['gross exposure', money(gross), ''], ['worst case (stop / −2σ·day)', worst ? '−' + money(worst).replace('$', '$') : money(0), worst ? 'dn' : ''], ['exposure / equity', (frac * 100).toFixed(1) + '%', frac > 0.5 ? 'dn' : 'up'], ['resting orders', String(orders), ''], ['bots running', String(bots), bots ? 'up' : '']]) { const dt2 = document.createElement('dt'), dd = document.createElement('dd'); dt2.textContent = k; dd.textContent = v; if (cl) dd.className = cl; frag.append(dt2, dd); } dl.replaceChildren(frag); }
    const bc = Syn.cvs.x173Blast; if (bc) { const g = bc.getContext('2d'), W = bc.width, H = bc.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46, t = now / 1000; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); for (let k = 1; k <= 3; k++) { g.strokeStyle = `rgba(${C.gold2},${0.12 + k * 0.06})`; g.lineWidth = d; g.beginPath(); g.arc(cx, cy, (R * k) / 3, 0, 6.2832); g.stroke(); } g.globalCompositeOperation = 'lighter'; const rr = R * Math.max(0.08, frac), pul = 0.5 + 0.5 * Math.sin(t * 3); const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr); gr.addColorStop(0, `rgba(${frac > 0.5 ? C.dn : C.gold},${(0.5 + pul * 0.3).toFixed(2)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill(); g.globalCompositeOperation = 'source-over'; }
    /* BOT STATUS */
    const ul = $1('#x173BotsL'); if (ul) { const a = A(), cfg = a && a.cfg ? a.cfg : {}, stale = typeof V171UI !== 'undefined' && V171UI.stale, items = [['Fleet mode', String(cfg.mode || 'paper').toUpperCase(), cfg.mode === 'live' ? (cfg.arm && cfg.arm.armed ? 'up' : 'dn') : 'gold'], ['Arming', cfg.arm && cfg.arm.armed ? 'ARMED' : 'SAFE', cfg.arm && cfg.arm.armed ? 'dn' : 'up'], ['Feed lock', stale ? 'STALE · LOCKED' : 'LIVE', stale ? 'dn' : 'up'], ['Demo bot', a && a.demo ? `RUNNING · ${a.demo.acct ? a.demo.acct.trades.length : 0} fills` : 'IDLE', a && a.demo ? 'up' : 'gold'], ['Co-pilot queue', String(a && a.queue ? a.queue.length : 0) + ' pending', a && a.queue && a.queue.length ? 'gold' : 'up']];
      for (const b of (typeof ST !== 'undefined' && ST.bots ? ST.bots : []).slice(0, 5)) items.push([String(b.name || b.strat || 'bot').slice(0, 22), b.run ? 'RUNNING' : 'PAUSED', b.run ? 'up' : 'gold']);
      const frag = document.createDocumentFragment(); for (const [k, v, cl] of items) { const li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('b'); s.textContent = k; b.textContent = v; b.className = 'x173-pill ' + cl; li.append(s, b); frag.appendChild(li); } ul.replaceChildren(frag); }
  };

  /* ══ boot ══ */
  const tick = () => { try { hookRadar(); hookP4(); if (hookSyn()) mountMatrix(); U.n++; } catch (e) { console.warn('v173', e); } };
  U.start = () => { if (U.mounted) return; U.mounted = true; tick(); setInterval(tick, 500); document.addEventListener('visibilitychange', () => { if (!document.hidden) for (const E of U.engines) { E.last = 0; E.wake(); } }); };
  U.tick = tick;
  try { hookRadar(); hookP4(); } catch (e) { /* modules missing in this build */ } // before any view builds its first bubble map
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b173 = boot; boot = async function () { await _b173.apply(this, arguments); try { V173UI.start(); } catch (e) { console.warn('v173 init', e); } }; }
