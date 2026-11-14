/* ExTerm v15 core: launcher price feed (/api/feed), adaptive FPS governor for the charts, live telemetry pill.
   Everything here is additive: without the launcher the page keeps its own pollers, without rAF nothing is throttled. */

/* ── launcher feed: one token-gated GET every 2 s returns DEX + stock prices from the launcher's RAM cache ── */
const LFeed = {
  on: null, ms: 2000, timer: null, busy: false, last: 0, n: 0,
  syms() {
    const oc = typeof OC !== 'undefined' && OC.subs ? [...OC.subs].filter((s) => !/^oc:sim:/.test(s)) : [];
    const st = typeof StockFeed !== 'undefined' && (typeof Stocks === 'undefined' || Stocks.active !== StockDemo) ? [...StockFeed.subs] : [];
    return oc.concat(st).slice(0, 300);
  },
  async poll() {
    if (LFeed.busy || LFeed.on === false || !J.proxy || document.hidden) return;
    const syms = LFeed.syms(); if (!syms.length) return;
    LFeed.busy = true;
    try {
      const r = await J.get('/api/feed?syms=' + encodeURIComponent(syms.join(',')), { timeout: 4000 });
      LFeed.on = true; LFeed.apply(r, syms);
    } catch (e) { if (/HTTP (404|503)/.test(e.message)) LFeed.on = false; } // older launcher, or started with --no-feed
    LFeed.busy = false;
  },
  /* trust boundary: only symbols we asked for, only finite positive numbers reach the feed */
  apply(r, syms) {
    const want = new Set(syms), px = (r && typeof r.prices === 'object' && r.prices) || {};
    for (const s of Object.keys(px)) {
      const v = px[s]; if (!want.has(s) || !v || typeof v !== 'object') continue;
      const p = +v.p, ch = v.ch24 == null ? null : +v.ch24; if (!(p > 0) || !isFinite(p)) continue;
      const L = Feed.live[s]; if (L && L.price === p) { L.ts = Date.now(); continue; }
      Feed.tick(s, p, { open24: ch != null && isFinite(ch) && ch > -100 ? p / (1 + ch / 100) : undefined });
      LFeed.n++;
    }
    LFeed.last = Date.now();
  },
  start() { clearInterval(LFeed.timer); LFeed.timer = setInterval(LFeed.poll, LFeed.ms); },
};

/* ── adaptive FPS governor: charts draw at the display's refresh (60-240 Hz) while frames are cheap, and step down
   toward 30 fps when a chart's draw cost no longer fits the frame budget, then climb back once it does ── */
const FPSGov = {
  hz: 60, fps: 0, gap: 0, avg: 0, frames: 0, t0: 0, peak: 0, MIN: 30,
  cost(ms) {
    FPSGov.avg = FPSGov.avg ? FPSGov.avg * 0.9 + ms * 0.1 : ms;
    const budget = 1000 / FPSGov.hz * 0.6, target = FPSGov.avg <= budget ? FPSGov.hz : Math.max(FPSGov.MIN, Math.min(FPSGov.hz, 600 / FPSGov.avg));
    FPSGov.gap = target >= FPSGov.hz - 0.5 ? 0 : 1000 / target;
  },
  target() { return FPSGov.gap ? Math.round(1000 / FPSGov.gap) : FPSGov.hz; },
  /* measure the real refresh rate with a light rAF counter (paused by the browser while the tab is hidden) */
  loop(now) {
    if (!FPSGov.t0) FPSGov.t0 = now;
    FPSGov.frames++;
    if (now - FPSGov.t0 >= 1000) {
      FPSGov.fps = Math.round(FPSGov.frames * 1000 / (now - FPSGov.t0)); FPSGov.frames = 0; FPSGov.t0 = now;
      FPSGov.peak = Math.max(FPSGov.peak * 0.98, FPSGov.fps); // slow decay: moving the window to a 60 Hz screen lowers it
      FPSGov.hz = [60, 75, 90, 100, 120, 144, 165, 240].reduce((a, h) => (FPSGov.peak >= h * 0.92 ? h : a), 60);
    }
    requestAnimationFrame(FPSGov.loop);
  },
  start() { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(FPSGov.loop); },
};

/* ── header telemetry pill: "240 FPS · 12ms WS" ── */
const Tele = {
  el: null,
  mount() {
    if (Tele.el || typeof document === 'undefined') return;
    const src = document.getElementById('srcPill'); if (!src || !src.parentNode) return;
    const el = document.createElement('div'); el.className = 'pill tele'; el.id = 'telePill'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'off');
    src.parentNode.insertBefore(el, src.nextSibling); Tele.el = el;
  },
  text() {
    const fps = Math.min(FPSGov.fps || 0, FPSGov.target()), ws = WSStat.get();
    return (fps ? fps : '—') + ' FPS · ' + (ws == null ? '— WS' : ws + 'ms WS');
  },
  render() {
    Tele.mount(); if (!Tele.el) return;
    const t = Tele.text(); if (Tele.el.textContent !== t) Tele.el.textContent = t; // textContent only: nothing here is HTML
    Tele.el.title = `Chart refresh: ${FPSGov.fps || 0} fps on a ${FPSGov.hz} Hz display${FPSGov.gap ? ` (governor capped at ${FPSGov.target()} fps: draws take ${FPSGov.avg.toFixed(1)} ms)` : ''}\nLive socket: ${WSStat.get() == null ? 'no trades in the last 15 s' : WSStat.get() + ' ms from exchange to screen'}` + (LFeed.on ? `\nLauncher feed: ${LFeed.n} price updates` : '');
  },
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  FPSGov.start(); LFeed.start();
  setInterval(Tele.render, 1000); setTimeout(Tele.render, 300);
}
if (typeof module === 'object' && module.exports) module.exports = { LFeed, FPSGov, Tele };
