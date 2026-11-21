/* ExTerm smooth 3D layer — transform/opacity only (GPU), eased with requestAnimationFrame, off for reduced-motion users */
const FX3 = (() => {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const X = { tw: new WeakMap() };
  /** count numbers smoothly to their new value (e.g. paper equity) */
  X.tween = (el, to, fmt, ms = 650) => {
    if (!el) return; const st = X.tw.get(el) || { v: to, raf: 0 };
    if (reduce || !isFinite(st.v) || Math.abs(to - st.v) < 1e-9) { st.v = to; el.textContent = fmt(to); X.tw.set(el, st); return; }
    if (st.to === to) return; st.to = to; const from = st.v, t0 = performance.now(); cancelAnimationFrame(st.raf);
    const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); st.v = from + (to - from) * e; el.textContent = fmt(st.v); if (k < 1) st.raf = requestAnimationFrame(step); };
    st.raf = requestAnimationFrame(step); X.tw.set(el, st);
  };
  /** sliding underline under the active nav tab */
  X.nav = () => {
    const nav = document.getElementById('nav'), on = nav && nav.querySelector('button.on'); if (!on) return;
    let bar = nav.querySelector('.navbar3d'); if (!bar) { bar = document.createElement('i'); bar.className = 'navbar3d'; nav.appendChild(bar); }
    bar.style.transform = `translateX(${on.offsetLeft - nav.scrollLeft}px)`; bar.style.width = on.offsetWidth + 'px';
  };
  /** parallax depth: the background glow drifts gently with the pointer (lerped, so it never jitters) */
  function parallax() {
    const bg = document.querySelector('.bgfx'); if (!bg || reduce) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, run = false;
    const loop = () => { cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06; bg.style.transform = `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0) scale(1.06)`; run = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05; if (run) requestAnimationFrame(loop); };
    document.addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth - 0.5) * -18; ty = (e.clientY / innerHeight - 0.5) * -12; if (!run) { run = true; requestAnimationFrame(loop); } }, { passive: true });
  }
  X.init = () => { parallax(); X.nav(); addEventListener('resize', X.nav); const n = document.getElementById('nav'); if (n) n.addEventListener('scroll', X.nav, { passive: true }); };
  return X;
})();

/* Space3D: a perspective "trading floor" behind the app. A grid recedes to a horizon with a faint candle skyline,
   and particles drift toward you. Parallax follows the pointer. Capped at 30 fps, paused when the tab is hidden,
   off for reduced-motion users and in Settings → Appearance. */
const Space3D = (() => {
  const S = { cv: null, g: null, raf: 0, last: 0, t: 0, px: 0, py: 0, tx: 0, ty: 0, parts: [], sky: [], level: 'full' };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = () => (getComputedStyle(document.body).getPropertyValue('--acc').trim() || '#F5C84B');
  function hexA(h, a) { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return `rgba(124,92,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function seed() {
    S.parts = Array.from({ length: 70 }, () => ({ x: (Math.random() - 0.5) * 2, y: Math.random() * -0.9 - 0.05, z: Math.random() }));
    let p = 0.5; S.sky = Array.from({ length: 90 }, () => { const o = p; p = Math.min(0.95, Math.max(0.1, p + (Math.random() - 0.5) * 0.12)); return [o, p, Math.max(o, p) + Math.random() * 0.05, Math.min(o, p) - Math.random() * 0.05]; });
  }
  function size() { const d = Math.min(1.5, window.devicePixelRatio || 1); S.cv.width = innerWidth * d; S.cv.height = innerHeight * d; S.cv.style.width = innerWidth + 'px'; S.cv.style.height = innerHeight + 'px'; S.g.setTransform(d, 0, 0, d, 0, 0); }
  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden || now - S.last < 33) return; const dt = Math.min(0.1, (now - S.last) / 1000 || 0.016); S.last = now;
    const moving = S.level === 'full'; if (moving) S.t += dt;
    S.px += (S.tx - S.px) * 0.05; S.py += (S.ty - S.py) * 0.05;
    const g = S.g, W = innerWidth, H = innerHeight, hz = H * (0.6 + S.py * 0.03), vx = W / 2 + S.px * 60, acc = accent();
    g.clearRect(0, 0, W, H);
    // horizon glow
    const hg = g.createLinearGradient(0, hz - 140, 0, hz + 40); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.75, hexA(acc, 0.10)); hg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hg; g.fillRect(0, hz - 140, W, 180);
    // candle skyline sitting on the horizon
    const cw = W / S.sky.length;
    for (let i = 0; i < S.sky.length; i++) { const [o, c, h, l] = S.sky[i], x = i * cw + (S.px * 20) % cw, up = c >= o; g.fillStyle = up ? 'rgba(34,197,94,.10)' : 'rgba(244,63,94,.09)'; const top = hz - Math.max(o, c) * 90, bot = hz - Math.min(o, c) * 90; g.fillRect(x + cw * 0.25, top, cw * 0.5, Math.max(1, bot - top)); g.fillRect(x + cw * 0.48, hz - h * 90, 1, (h - l) * 90); }
    // perspective floor grid
    g.lineWidth = 1;
    for (let i = -16; i <= 16; i++) { const xb = vx + i * (W / 9); g.strokeStyle = hexA(acc, 0.10 - Math.abs(i) * 0.004); g.beginPath(); g.moveTo(vx + i * 6, hz); g.lineTo(xb, H); g.stroke(); }
    const off = (S.t * 0.35) % 1;
    for (let k = 0; k < 14; k++) { const z = (k + 1 - off) / 14, y = hz + (H - hz) * z * z; g.strokeStyle = hexA(acc, 0.03 + 0.11 * z * z); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // particles flying toward the viewer
    for (const p of S.parts) {
      if (moving) { p.z -= dt * 0.06; if (p.z <= 0.02) { p.z = 1; p.x = (Math.random() - 0.5) * 2; p.y = Math.random() * -0.9 - 0.05; } }
      const sx = vx + (p.x / p.z) * W * 0.18 + S.px * 30 * (1 - p.z), sy = hz + (p.y / p.z) * H * 0.18 + S.py * 20 * (1 - p.z), r = Math.max(0.4, (1 - p.z) * 2.2);
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H) continue; g.fillStyle = hexA(acc, 0.15 + (1 - p.z) * 0.5); g.beginPath(); g.arc(sx, sy, r, 0, 6.283); g.fill();
    }
  }
  S.set = (level) => {
    S.level = reduce && level === 'full' ? 'subtle' : level;
    document.body.classList.toggle('fx-off', S.level === 'off'); document.body.classList.toggle('fx-subtle', S.level === 'subtle');
    if (S.level === 'off') { cancelAnimationFrame(S.raf); S.raf = 0; if (S.g) S.g.clearRect(0, 0, innerWidth, innerHeight); return; }
    if (!S.cv) {
      S.cv = document.createElement('canvas'); S.cv.id = 'bg3d'; S.cv.setAttribute('aria-hidden', 'true'); document.body.prepend(S.cv); S.g = S.cv.getContext('2d'); seed(); size();
      addEventListener('resize', size); document.addEventListener('pointermove', (e) => { S.tx = e.clientX / innerWidth - 0.5; S.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
    }
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  };
  return S;
})();
