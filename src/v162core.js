/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.2 core (pure, no DOM): sub-minute history seeding, minimum price span, daily-loss breach test,
   launch briefing content and the live-only workspace map. UI in v162.js. */
const V162 = (() => {
  const V = {};
  /* deterministic 0..1 noise per bucket, so a re-seed of the same window draws the same candles */
  const rnd = (t) => { let x = Math.imul((t | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const quiet = (r) => r.v === 0 && r.h === r.l && r.o === r.c;

  /* Back-populates n sub-minute bars (tf seconds) from 1-minute OHLCV: every minute is walked open → first extreme →
     second extreme → close (low first on an up minute), then the tail is bridged multiplicatively so the last close
     equals spot exactly. Real (non-flat) bars in `real` replace seeded ones; every bar opens at the prior close.
     closed: the session is over, so the window ends at the last 1m bar instead of now. */
  V.seedSub = (m1, tf, n, spot, nowSec, real, closed) => {
    if (!(tf > 0 && tf < 60) || !(n > 0) || !(spot > 0)) return (real || []).slice(-n);
    const M = (m1 || []).filter((k) => k && k.t > 0 && k.o > 0 && k.h > 0 && k.l > 0 && k.c > 0).sort((a, b) => a.t - b.t), by = new Map(M.map((k) => [k.t, k]));
    const lastM = M.length ? M[M.length - 1] : null;
    const end = closed && lastM ? lastM.t + 60 - tf : Math.floor(nowSec / tf) * tf, start = end - (n - 1) * tf;
    /* typical relative minute range keeps quiet / missing minutes moving; floor 0.05% so even a flat feed shows texture */
    const rr = M.slice(-120).map((k) => (k.h - k.l) / k.c).filter((x) => x > 0).sort((a, b) => a - b), rel = Math.max(0.0005, rr.length ? rr[rr.length >> 1] : 0.0015);
    const K = Math.max(1, Math.round(60 / tf)), out = [];
    let ref = M.length ? (M.find((k) => k.t >= start - 60) || lastM).o : spot, idx = 0;
    const at = (k, f) => { // piecewise path inside one minute, f in 0..1
      const up = k.c >= k.o, a = up ? k.l : k.h, b = up ? k.h : k.l, pts = [k.o, a, b, k.c], s = Math.min(2.999, f * 3), i = Math.floor(s), w = s - i;
      return pts[i] + (pts[i + 1] - pts[i]) * w;
    };
    for (let t = start; t <= end; t += tf, idx++) {
      const mt = Math.floor(t / 60) * 60; let k = by.get(mt);
      if (!k) { const p = ref; k = { o: p, h: p, l: p, c: p }; }
      const prev = out.length ? out[out.length - 1].c : k.o, kk = (t - mt) / tf;
      const flat = k.h - k.l < k.c * rel * 0.25, amp = (flat ? k.c * rel : k.h - k.l) * 0.22;
      let c = at(k, (kk + 1) / K) + (rnd(t) - 0.5) * amp; if (!(c > 0)) c = k.c;
      if (kk === K - 1) c = k.c; // the minute closes where the real minute closed
      if (flat) c = k.c + (rnd(t + 7) - 0.5) * k.c * rel * 0.6;
      const wick = Math.abs(c - prev) * 0.35 + amp * 0.25 * rnd(t + 3);
      out.push({ t, o: prev, h: Math.max(prev, c) + wick * rnd(t + 1), l: Math.max(Math.min(prev, c) * 0.5, Math.min(prev, c) - wick * rnd(t + 2)), c, v: 0 });
      ref = k.c;
    }
    /* bridge: ramp a multiplicative correction over the last 25% so the final close lands on spot with no jump */
    const last = out.length ? out[out.length - 1].c : spot, r = spot / last, nb = Math.max(1, Math.ceil(out.length * 0.25));
    if (Number.isFinite(r) && r > 0) for (let i = out.length - nb; i < out.length; i++) { const w = (i - (out.length - nb) + 1) / nb, f = 1 + (r - 1) * w; const b = out[i]; b.o *= f; b.h *= f; b.l *= f; b.c *= f; }
    if (out.length) out[out.length - 1].c = spot;
    /* real bars win; then enforce gapless open = prior close and a consistent high / low */
    const rmap = new Map((real || []).filter((x) => x && x.t >= start && !quiet(x)).map((x) => [x.t, x]));
    for (const x of real || []) if (x && x.t > end && !quiet(x)) out.push(Object.assign({}, x));
    for (let i = 0; i < out.length; i++) {
      const R = rmap.get(out[i].t); if (R) out[i] = { t: R.t, o: R.o, h: R.h, l: R.l, c: R.c, v: R.v || 0, real: true };
      const b = out[i]; if (i) b.o = out[i - 1].c; b.h = Math.max(b.h, b.o, b.c); b.l = Math.min(b.l, b.o, b.c);
    }
    out.seeded = out.filter((b) => !b.real).length;
    return out.slice(-n);
  };

  /* minimum visible price span: at least pct of mid (0.20 % default), centred, so quiet seconds never draw as dashes */
  V.minSpan = (lo, hi, pct) => {
    const p = pct > 0 ? pct : 0.002, mid = (lo + hi) / 2; if (!(mid > 0)) return { lo, hi };
    const need = mid * p; if (hi - lo >= need) return { lo, hi };
    const e = (need - (hi - lo)) / 2; return { lo: lo - e, hi: hi + e };
  };

  /* realised + unrealised session drawdown at or beyond the cap trips the breaker (cap 0 / blank = off) */
  V.breached = (dayLoss, cap) => +cap > 0 && Number.isFinite(+dayLoss) && +dayLoss >= +cap;
  V.lossGauge = (dayLoss, cap) => { const c = +cap > 0 ? +cap : 0, d = Math.max(0, +dayLoss || 0); return { used: d, cap: c, left: c ? Math.max(0, c - d) : null, pct: c ? Math.min(100, (d / c) * 100) : 0 }; };

  /* US regular session, Mon–Fri 09:30–16:00 America/New_York (holidays come from the feed's session flag) */
  V.usOpen = (ms) => {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value;
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false; const m = (+p.hour % 24) * 60 + +p.minute; return m >= 570 && m < 960;
  };

  V.CHECKLIST = [
    'Your bot listens only on 127.0.0.1 (or an allow-listed private LAN host over HTTPS). ExTerm never sees exchange keys or funds.',
    'Max Daily Loss ($), Max Single-Order Notional, Max Spread % and the consecutive-loss cooldown are set to amounts you can afford to lose.',
    'Every slot passes Test Signal Payload (Dry-Run) and the receiver echoes the idempotency_key.',
    'The heartbeat is green on every slot you arm; three missed beats trip the Dead-Man\'s Switch.',
    'You know the kill-switch: Ctrl+Shift+K sends CANCEL_ALL_AND_FLATTEN and reverts all six slots to PAPER.',
  ];
  V.HIGHLIGHTS = [
    'Universal timeframes: 1s to 1M on crypto, stocks, on-chain, options and futures',
    'True-form sub-minute candles: full-width history seeded from 1-minute OHLCV and bridged to the live price',
    'Auto-flatten: breaching Max Daily Loss ($) while armed sends CANCEL_ALL_AND_FLATTEN and disarms every slot',
    'Live-only workspace: arming hides paper and simulation tools in every tab until you disarm',
    'MARKET CLOSED · LAST SESSION badge for US equities outside regular hours',
  ];
  /* selectors hidden while body.live-bot-armed (paper, replay and CPU-heavy offline research) */
  V.PAPER_ONLY = [
    '#replayBtn', '[data-v161m="replay"]', '#pfReset', '#cpReset', '#pvReset',
    '#q153Root details[data-sec="evolve"]', '#q153Root details[data-sec="crisis"]', '#q153Root details[data-sec="synth"]', '#v157Mtn', '.p5-p:has([data-p5="wfo"])',
    '[data-lb="backtest"]', '[data-lx="drill"]',
  ];
  V.LEARN_BANNER = 'LIVE BOT ARMED — Practice Drills Paused (Disarm to PAPER to Practice)';
  return V;
})();
if (typeof module !== 'undefined') module.exports = V162;
