/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.0 pure core (no DOM): the 5-tab rail map, the 24/7 Alpha Recs feed model (asset-class filters, S-TIER · A+ · A ·
   B+ · WATCHLIST tiers, Passed / Pending criteria, the "Why" engine readout, Entry / Stop / TP1 / TP2 / R:R / Safe Size and the
   1-click Copy Setup text), the fighter-jet 2D depth-layer geometry for the 1s–1M chart, the crosshair magnifier maths,
   drag-handle R:R, 3-point pattern → radar alerts, Ctrl+V contract detection, Shift+P smart pyramid, Shift+F atomic flip,
   the L2 queue-position paper fill model and the Ctrl+K fuzzy ranker.
   Two-signal palette: Bullion Gold #F5C84B (live / pass / buy) and Crimson #EF4444 (alert / fail / sell) on Obsidian #050608–#0A0D12. */
const V180 = (() => {
  const V = {};
  const fin = Number.isFinite, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  V.VER = '18.0'; V.GOLD = '#F5C84B'; V.RED = '#EF4444'; V.BG = '#050608'; V.BG2 = '#0A0D12';
  V.PALETTE = ['#F5C84B', '#EF4444', '#050608', '#0A0D12'];
  V.FRAME_MS = 1.2; // depth-layer budget per chart frame (p95)
  V.PAL_MS = 10; // Ctrl+K open → first paint budget

  /* ══ 1. five clean tabs on the floating rail ══ */
  V.TABS = [['alpha', '24/7 Alpha Recs'], ['botradar', '24/7 Bot Radar'], ['brain', 'Terminal Brain'], ['livebot', '24/7 Optional Live Bot'], ['copilot', 'Co-Pilot / Paper']];
  V.railOf = (tab, base) => (tab === 'alpha' ? 'alpha' : base ? base(tab) : tab === 'botradar' || tab === 'brain' ? tab : tab === 'fleet' ? 'livebot' : 'copilot');

  /* ══ 2. 24/7 Alpha Recs (Lanes 11–16) ══ */
  V.FILTERS = [['all', 'All'], ['stocks', 'Stocks / 0DTE'], ['crypto', 'Crypto / Perps'], ['onchain', 'On-Chain DEX']];
  V.pass = (r, f) => !f || f === 'all' || (r && r.mkt === f);
  V.TIERS = ['S-TIER', 'A+', 'A', 'B+', 'WATCHLIST'];
  /* Lane 16 grades S-TIER / A / B+ / WATCHLIST; A splits into A+ (score ≥ 86, peer-reviewed, Monte Carlo not vetoed) and A */
  V.tier = (r) => {
    if (!r) return 'WATCHLIST'; const t = r.tier, s = +r.tierScore || 0, mc = r.mc || {};
    if (t === 'S-TIER') return 'S-TIER';
    if (t === 'A') return s >= 86 && r.peer && mc.verdict !== 'VETO' ? 'A+' : 'A';
    return t === 'B+' ? 'B+' : 'WATCHLIST';
  };
  V.tierCls = (t) => ({ 'S-TIER': 's', 'A+': 'ap', A: 'a', 'B+': 'b', WATCHLIST: 'w' }[t] || 'w');
  V.counts = (rows) => { const o = {}; for (const t of V.TIERS) o[t] = 0; for (const r of rows || []) o[V.tier(r)]++; return o; };
  V.crit = (r) => { const o = { passed: [], pending: [], failed: [] }; for (const [n, s] of (r && r.criteria) || []) (o[s] || o.pending).push(n); return o; };
  /* partial-match setups are shown, never dropped: the feed is only empty while the scanners warm */
  V.feed = (rows, f) => (rows || []).filter((r) => r && r.sym && (r.side === 'buy' || r.side === 'sell') && V.pass(r, f)).sort((a, b) => V.TIERS.indexOf(V.tier(a)) - V.TIERS.indexOf(V.tier(b)) || (b.tierScore || 0) - (a.tierScore || 0));
  V.label = (r) => (r.mkt === 'onchain' ? r.name || String(r.sym).split(':').pop().slice(0, 8) + '…' : r.sym);
  V.ctxOf = (r) => (r.mkt === 'stocks' ? 'stocks' : r.mkt === 'onchain' ? 'onchain' : 'crypto');

  /* the "Why": which engines fired. state on = fired for this setup · off = checked, not firing · pending = no data yet */
  V.ENGINES = ['GEX / Zero-Gamma', 'Form 4 Insiders', '30d Smart Money', 'Stoikov P_micro', 'Rug Shield v2'];
  const nf = (v, d) => (fin(+v) ? (+v).toFixed(d) : '–');
  const px = (v) => (!fin(+v) ? '–' : Math.abs(v) >= 1000 ? (+v).toFixed(2) : Math.abs(v) >= 1 ? (+v).toFixed(3) : (+v).toPrecision(4));
  V.px = px;
  V.why = (r, ctx) => {
    const f = (r && r.feat) || {}, m = r && r.mkt, c = ctx || {}, out = [];
    if (m === 'stocks') {
      const g = f.flip ? 'Zero-Gamma flip ' + px(f.flip) : f.wall ? 'Gamma wall ' + px(f.wall) : f.maxPain ? '0DTE max pain ' + px(f.maxPain) : null;
      out.push(['GEX / Zero-Gamma', g ? 'on' : 'pending', g || 'options chain not loaded']);
      const tk = String(r.sym).toUpperCase(), F4 = c.form4 && c.form4[tk];
      out.push(['Form 4 Insiders', F4 ? 'on' : c.form4 ? 'off' : 'pending', F4 ? F4.insiders + ' insider' + (F4.insiders === 1 ? '' : 's') + ' bought ' + V.money(F4.value) + ' (30d)' + (F4.ceo || F4.cfo ? ' · C-suite' : '') : c.form4 ? 'no insider cluster (30d)' : 'SEC index warming']);
      if (f.pin != null) out.push(['PIN (informed flow)', +f.pin >= 0.25 ? 'on' : 'off', 'PIN ' + nf(f.pin, 2)]);
      if (f.resid != null) out.push(['RMT alpha residual', 'on', nf(f.resid, 2) + 'σ off the market mode']);
    } else if (m === 'crypto') {
      const sk = f.microSkewBps != null ? f.microSkewBps : f.skew;
      out.push(['Stoikov P_micro', sk == null ? 'pending' : Math.abs(sk) >= 0.5 ? 'on' : 'off', sk == null ? 'L2 book warming' : 'P_micro skew ' + nf(sk, 2) + ' bps']);
      const fu = f.funding8hBps != null ? f.funding8hBps : f.funding8h; if (fu != null) out.push(['Funding (8h)', Math.abs(fu) >= 3 ? 'on' : 'off', nf(fu, 2) + ' bps']);
      const ba = f.basisBps != null ? f.basisBps : f.basis; if (ba != null) out.push(['Spot-perp basis', Math.abs(ba) >= 8 ? 'on' : 'off', nf(ba, 1) + ' bps']);
      const sm = c.smart && c.smart[String(r.sym).replace(/-USD$/, '')];
      out.push(['30d Smart Money', sm ? (sm.n >= 2 ? 'on' : 'off') : c.smart ? 'off' : 'pending', sm ? sm.n + ' top 30d-PnL wallet' + (sm.n === 1 ? '' : 's') + ' trading it · ' + V.money(sm.pnl) + ' realised' : c.smart ? 'not in the top 30d-PnL wallets' : 'Lane 5 board warming']);
    } else if (m === 'onchain') {
      const sh = f.shieldPass != null ? (f.shieldPass ? 'on' : 'off') : f.top3 != null ? (f.top3 <= 0.15 && (f.impact == null || f.impact <= 2) ? 'on' : 'off') : 'pending';
      out.push(['Rug Shield v2', sh, [f.impact != null ? 'impact ' + nf(f.impact, 2) + '%' : '', f.top3 != null ? 'top-3 ' + nf(f.top3 * 100, 0) + '%' : '', f.entropy != null ? 'entropy ' + nf(f.entropy, 2) : '', f.lpLocked === true ? 'LP locked' : f.lpLocked === false ? 'LP unlocked' : ''].filter(Boolean).join(' · ') || 'RugCheck pending']);
      out.push(['30d Smart Money', f.rising ? 'on' : f.halfLifeH != null ? 'off' : 'pending', f.rising ? 'buyers still accumulating (net-buy proxy)' : f.halfLifeH != null ? 'buyer half-life ' + nf(f.halfLifeH, 1) + 'h' : 'swaps warming']);
    }
    return out;
  };
  /* context maps for the "Why": Form 4 clusters by ticker (Lane 6) and 30d top-PnL wallet activity by coin (Lane 5) */
  V.form4Map = (rows) => { const o = {}; for (const x of rows || []) if (x && x.ticker) o[String(x.ticker).toUpperCase()] = x; return o; };
  V.smartMap = (rows) => { const o = {}; for (const x of rows || []) { if (!x || !(x.pnl > 0)) continue; for (const t of x.tokens || []) { const k = String(t).toUpperCase(), e = o[k] || (o[k] = { n: 0, pnl: 0 }); e.n++; e.pnl += x.pnl; } } return o; };
  V.money = (v) => { const a = Math.abs(+v || 0), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'K' : s + '$' + a.toFixed(0); };
  V.votes = (r) => Object.entries((r && r.votes) || {}).map(([k, v]) => [k, +v, +v > 0]);
  V.mcOf = (r) => { const m = (r && r.mc) || {}; return { pTP: m.pTP, ev: m.evR, cvar: m.cvar5R, slip: m.slipPct, verdict: m.verdict || 'PENDING', paths: m.paths || 1000, veto: m.veto || [] }; };

  /* levels: the Lane 15 stress test runs SL 1 ATR / TP 2 ATR, so the plan uses the same geometry; size risks riskPct of equity */
  V.levels = (r, o) => {
    const p = +r.px, atr = +r.atr > 0 ? +r.atr : p * 0.01, s = r.side === 'sell' ? -1 : 1, O = o || {}; if (!(p > 0)) return null;
    const eq = +O.equity > 0 ? +O.equity : 10000, rp = +O.riskPct > 0 ? +O.riskPct : 1, cap = +O.capPct > 0 ? +O.capPct : 25;
    const entry = p, stop = p - s * atr, tp1 = p + s * atr, tp2 = p + s * 2 * atr, risk = Math.abs(entry - stop);
    const slip = (r.mc && +r.mc.slipPct) || 0, haircut = slip > 1 ? 0.5 : 1;
    let usd = ((eq * rp) / 100 / (risk / entry)) * haircut; const capped = usd > (eq * cap) / 100; if (capped) usd = (eq * cap) / 100;
    return { entry, stop, tp1, tp2, rr: Math.abs(tp2 - entry) / risk, rr1: Math.abs(tp1 - entry) / risk, usd, qty: usd / entry, riskUsd: usd * (risk / entry), capped, haircut, side: s > 0 ? 'buy' : 'sell' };
  };
  V.setup = (r, lv, at) => ({ v: 'exterm-alpha/1', ts: at || 0, sym: r.sym, mkt: r.mkt, side: r.side, setup: r.setup, tier: V.tier(r), score: r.tierScore, entry: +px(lv.entry), stop: +px(lv.stop), tp1: +px(lv.tp1), tp2: +px(lv.tp2), rr: +lv.rr.toFixed(2), safeUsd: Math.round(lv.usd), consensus: r.consensus, agree: (r.agree || 0) + '/6', mc: V.mcOf(r), mtf: r.mtf, journalWin: r.journalWin, criteria: r.criteria || [] });
  V.setupText = (r, lv, why) => {
    const m = V.mcOf(r), c = V.crit(r);
    return [V.tier(r) + ' ' + (r.side === 'buy' ? 'LONG' : 'SHORT') + ' ' + V.label(r) + ' · ' + (r.setup || ''),
      'Entry ' + px(lv.entry) + ' · Stop ' + px(lv.stop) + ' · TP1 ' + px(lv.tp1) + ' · TP2 ' + px(lv.tp2) + ' · R:R ' + lv.rr.toFixed(2) + ' · Safe size ' + V.money(lv.usd),
      '6-bot consensus ' + nf(r.consensus, 2) + ' (' + (r.agree || 0) + '/6) · Monte Carlo ' + m.paths + ' paths P(TP) ' + (fin(m.pTP) ? Math.round(m.pTP * 100) + '%' : '–') + ' EV ' + nf(m.ev, 2) + 'R · ' + m.verdict,
      'MTF ' + (r.mtf || '–') + ' · Journal ' + (r.journalWin != null ? r.journalWin + '% (' + r.journalN + ')' : 'pending'),
      'Why: ' + (why || V.why(r)).filter((w) => w[1] === 'on').map((w) => w[0] + ' (' + w[2] + ')').join('; '),
      'Passed ' + c.passed.length + ' · Pending ' + c.pending.length + ' · Failed ' + c.failed.length + ' — ExTerm 24/7 Alpha Recs · not financial advice'].join('\n');
  };

  /* ══ 3. fighter-jet tactile 2D depth layers (pure geometry on the live candle array D: {t,o,h,l,c,v}) ══ */
  V.LAYERS = [['vdc', 'Volume-Delta Cores', true], ['l2', 'L2 Liquidity Shelves', true], ['abs', 'Absorption Glows', true], ['bands', 'AVWAP ±1σ/±2σ', true], ['gex', 'GEX Strikes', true], ['cone', '1σ Move Cone', true], ['ghost', '5m/15m Ghosts', true]];
  V.layerDefaults = () => { const o = {}; for (const [k, , d] of V.LAYERS) o[k] = d; return o; };
  V.layerState = (s) => { const o = V.layerDefaults(); if (s && typeof s === 'object') for (const k of Object.keys(o)) if (typeof s[k] === 'boolean') o[k] = s[k]; return o; };
  /* close-location volume split: share of the bar's volume that lifted the offer */
  V.buyShare = (k) => { const r = k.h - k.l; return r > 0 ? clamp((k.c - k.l) / r, 0, 1) : k.c >= k.o ? 0.5 : 0.5; };
  V.delta = (k) => (k.v || 0) * (2 * V.buyShare(k) - 1);
  /* absorption = heavy volume that failed to move price (small body, z ≥ 1.5); exhaustion = heavy volume rejected at the extreme (wick ≥ 60 %) */
  V.absorb = (D, a, b, z) => {
    let s = 0, s2 = 0, n = 0; for (let i = a; i < b; i++) { const v = D[i].v || 0; s += v; s2 += v * v; n++; } if (n < 5) return [];
    const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)), th = m + (z || 1.5) * sd, out = []; if (!(sd > 0)) return out;
    for (let i = a; i < b; i++) {
      const k = D[i], r = k.h - k.l; if (!((k.v || 0) >= th) || !(r > 0)) continue; const body = Math.abs(k.c - k.o), up = k.h - Math.max(k.o, k.c), dn = Math.min(k.o, k.c) - k.l;
      if (up / r >= 0.6) out.push({ i, kind: 'exh', side: 'sell', p: k.h }); else if (dn / r >= 0.6) out.push({ i, kind: 'exh', side: 'buy', p: k.l });
      else if (body / r <= 0.35) out.push({ i, kind: 'abs', side: V.delta(k) >= 0 ? 'sell' : 'buy', p: (k.h + k.l) / 2 }); // passive side absorbed the aggressor
    }
    return out;
  };
  /* anchored VWAP with volume-weighted ±σ bands */
  V.bands = (D, a, b) => {
    const n = Math.max(0, b - a), m = new Float64Array(n), sd = new Float64Array(n); let pv = 0, vv = 0, p2 = 0;
    for (let i = a; i < b; i++) { const k = D[i], v = k.v > 0 ? k.v : 1e-9, tp = (k.h + k.l + k.c) / 3; pv += tp * v; vv += v; p2 += tp * tp * v; const mu = pv / vv; m[i - a] = mu; sd[i - a] = Math.sqrt(Math.max(0, p2 / vv - mu * mu)); }
    return { m, sd };
  };
  /* 1σ forward expected-move cone from realised log-return volatility: ± σ·√k for k bars ahead */
  V.sigma = (D, a, b) => { let s = 0, s2 = 0, n = 0; for (let i = Math.max(a + 1, 1); i < b; i++) { if (!(D[i - 1].c > 0 && D[i].c > 0)) continue; const r = Math.log(D[i].c / D[i - 1].c); s += r; s2 += r * r; n++; } if (n < 3) return 0; const mu = s / n; return Math.sqrt(Math.max(0, s2 / n - mu * mu)); };
  V.cone = (c, sig, steps) => { const out = []; for (let k = 1; k <= (steps || 20); k++) { const w = sig * Math.sqrt(k); out.push({ k, up: c * Math.exp(w), dn: c * Math.exp(-w) }); } return out; };
  /* PiP structural ghosts: 5m / 15m candles drawn behind 1s–15s charts */
  V.ghostTfs = (tfSec) => (tfSec > 0 && tfSec <= 15 ? [300, 900] : []);
  V.ghost = (D, a, b, sec) => {
    const out = []; let g = null;
    for (let i = a; i < b; i++) { const k = D[i], key = Math.floor(k.t / sec); if (!g || g.key !== key) { if (g) out.push(g); g = { key, i0: i, i1: i, o: k.o, h: k.h, l: k.l, c: k.c }; } else { g.i1 = i; if (k.h > g.h) g.h = k.h; if (k.l < g.l) g.l = k.l; g.c = k.c; } }
    if (g) out.push(g); return out;
  };
  /* L2 shelves: the n largest resting levels per side, size normalised to the biggest */
  V.shelves = (bk, n) => {
    if (!bk || !Array.isArray(bk.bids) || !Array.isArray(bk.asks)) return [];
    const pick = (arr, side) => arr.filter((x) => Array.isArray(x) && x[0] > 0 && x[1] > 0).map((x) => ({ p: +x[0], q: +x[1], side }));
    const all = pick(bk.bids, 'bid').concat(pick(bk.asks, 'ask')).sort((x, y) => y.q * y.p - x.q * x.p).slice(0, n || 8), mx = all.length ? all[0].q * all[0].p : 0;
    return all.map((x) => Object.assign(x, { w: mx > 0 ? (x.q * x.p) / mx : 0 }));
  };
  /* GEX strike lines: call wall, put wall, zero-gamma flip (whatever the options feed answered) */
  V.gexLines = (g) => { const out = []; if (!g) return out; if (g.callWall > 0) out.push({ k: 'Call Wall', p: +g.callWall, c: 'gold' }); if (g.putWall > 0) out.push({ k: 'Put Wall', p: +g.putWall, c: 'red' }); if (g.flip > 0) out.push({ k: 'Zero-Gamma Flip', p: +g.flip, c: 'gold', dash: true }); return out; };

  /* ══ 4. Depth Crosshair Magnifier ══ */
  V.imbalance = (bk, n) => { if (!bk) return null; let B = 0, A = 0; for (const x of (bk.bids || []).slice(0, n || 10)) B += +x[1] || 0; for (const x of (bk.asks || []).slice(0, n || 10)) A += +x[1] || 0; return B + A > 0 ? ((B - A) / (B + A)) * 100 : null; };
  /* Stoikov micro-price: the mid leaned toward the side about to be eaten */
  V.pmicro = (bk) => { if (!bk || !bk.bids || !bk.asks || !bk.bids[0] || !bk.asks[0]) return null; const [b, bq] = bk.bids[0].map(Number), [a, aq] = bk.asks[0].map(Number); return bq + aq > 0 ? (b * aq + a * bq) / (bq + aq) : (a + b) / 2; };
  /* absorption rate: volume per 1 % of range traded, relative to the window average (> 1 = heavier than usual) */
  V.absRate = (D, i, a, b) => {
    const f = (k) => (k.v || 0) / Math.max(1e-9, ((k.h - k.l) / (k.c || 1)) * 100 || 1e-3);
    let s = 0, n = 0; for (let j = Math.max(a, i - 50); j < Math.min(b, i + 1); j++) { s += f(D[j]); n++; } return n && D[i] ? f(D[i]) / (s / n || 1) : null;
  };
  V.countdown = (tBar, tfSec, nowMs) => (tfSec > 0 && fin(tBar) ? Math.max(0, (tBar + tfSec) * 1000 - nowMs) : null);
  V.fmtMs = (ms) => (ms == null ? '–' : ms >= 3600000 ? Math.floor(ms / 3600000) + 'h' + String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0') + 'm' : ms >= 60000 ? Math.floor(ms / 60000) + 'm' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0') + 's' : (ms / 1000).toFixed(3) + 's');

  /* ══ 5. drag-handle R:R lines ══ */
  V.PLAN_KEYS = ['entry', 'stop', 'tp1', 'tp2'];
  V.rr = (pl) => { const r = Math.abs(pl.entry - pl.stop); return r > 0 ? Math.abs(pl.tp2 - pl.entry) / r : 0; };
  /* a drag may never invert the bracket: buy keeps stop < entry < tp1 ≤ tp2, sell mirrors it */
  V.drag = (pl, key, p) => {
    if (!pl || !V.PLAN_KEYS.includes(key) || !(p > 0)) return false; const s = pl.side === 'sell' ? -1 : 1, e = 1e-9 * pl.entry, n = Object.assign({}, pl, { [key]: p });
    const ok = s * (n.entry - n.stop) > e && s * (n.tp1 - n.entry) > e && s * (n.tp2 - n.tp1) >= 0; if (!ok) return false; Object.assign(pl, n); return true;
  };
  /* a plan whose entry sits more than 3 risk units from the live price is rescaled onto it (same % geometry, never ≤ 0) */
  V.reanchor = (pl, live) => { if (!pl || !(live > 0) || !(pl.entry > 0)) return false; const r = Math.abs(pl.entry - pl.stop); if (!(r > 0) || Math.abs(live - pl.entry) <= 3 * r) return false; const f = live / pl.entry; for (const k of V.PLAN_KEYS) pl[k] *= f; pl.reanchored = true; return true; };
  V.priceAt = (y, py, lo, hi) => { const ya = py(lo), yb = py(hi); return ya === yb ? lo : lo + ((y - ya) / (yb - ya)) * (hi - lo); };
  V.nearest = (pl, y, py, tol) => { let best = null, bd = tol || 7; for (const k of V.PLAN_KEYS) { const d = Math.abs(py(pl[k]) - y); if (d <= bd) { bd = d; best = k; } } return best; };

  /* ══ 6. freehand 3-point pattern → radar alert ══ */
  V.pattern3 = (pts) => {
    if (!Array.isArray(pts) || pts.length !== 3 || !pts.every((q) => q && q.p > 0 && fin(q.i))) return null;
    const [a, b, c] = pts.slice().sort((x, y) => x.i - y.i), sp = Math.abs(a.p - b.p) || a.p * 0.002;
    if (b.p < a.p && c.p > b.p) return c.p >= a.p ? { name: 'Bullish V reversal', side: 'buy', trigger: c.p, stop: b.p } : { name: 'Lower high', side: 'sell', trigger: b.p, stop: c.p + sp * 0.1 };
    if (b.p > a.p && c.p < b.p) return c.p <= a.p ? { name: 'Bearish V reversal', side: 'sell', trigger: c.p, stop: b.p } : { name: 'Higher low', side: 'buy', trigger: b.p, stop: c.p - sp * 0.1 };
    if (a.p < b.p && b.p <= c.p) return { name: 'Ascending leg', side: 'buy', trigger: c.p, stop: b.p };
    if (a.p > b.p && b.p >= c.p) return { name: 'Descending leg', side: 'sell', trigger: c.p, stop: b.p };
    return null;
  };
  V.patternHit = (pt, p) => !!pt && p > 0 && (pt.side === 'buy' ? p >= pt.trigger : p <= pt.trigger);

  /* ══ 7. Ctrl+V anywhere: contract-address auto-hydration ══ */
  V.ca = (text) => {
    let t = String(text || '').trim(); if (!t || t.length > 300) return null;
    const u = t.match(/^https?:\/\/[^\s]+$/) ? t.split(/[/?#]/).filter(Boolean) : null; if (u) t = u.find((x) => /^0x[a-fA-F0-9]{40}$/.test(x) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x)) || '';
    if (/^0x[a-fA-F0-9]{40}$/.test(t)) return { chain: 'evm', addr: t.toLowerCase() };
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) && /[0-9]/.test(t) && /[a-z]/.test(t)) return { chain: 'solana', addr: t };
    return null;
  };

  /* ══ 8. Shift+P smart pyramid · Shift+F atomic flip ══ */
  /* add only into a winner: each add needs +1 ATR more open profit, is half the previous add, and lifts the stop to the new break-even */
  V.pyramid = (pos, p, atr, o) => {
    const O = o || {}, maxAdds = O.maxAdds || 3, adds = O.adds || 0; if (!pos || !(pos.qty > 0) || !(p > 0)) return { ok: false, why: 'no open position' };
    const avg = pos.cost / pos.qty, a = atr > 0 ? atr : p * 0.01, s = pos.side === 'sell' ? -1 : 1, gain = (s * (p - avg)) / a;
    if (adds >= maxAdds) return { ok: false, why: 'pyramid full (' + maxAdds + ' adds)' };
    if (gain < adds + 1) return { ok: false, why: 'needs +' + (adds + 1) + ' ATR open profit (now ' + gain.toFixed(2) + ')' };
    const usd = (O.baseUsd > 0 ? O.baseUsd : pos.cost) * Math.pow(0.5, adds + 1), q2 = pos.qty + usd / p, be = (pos.cost + usd) / q2;
    return { ok: true, usd, stop: be, adds: adds + 1 };
  };
  V.flip = (pos, p) => (pos && pos.qty > 0 && p > 0 ? { close: pos.qty, side: pos.side === 'sell' ? 'buy' : 'sell', usd: pos.qty * p } : null);

  /* ══ 9. realistic L2 queue-position paper fills ══ */
  /* a resting limit fills only after the size queued ahead of it trades; a print through the price fills it outright */
  V.queueFill = (o, t) => {
    if (!o || o.left <= 0 || !t || !(t.p > 0) || !(t.q > 0)) return 0; const buy = o.side === 'buy';
    if (buy ? t.p < o.px : t.p > o.px) { const f = o.left; o.left = 0; o.ahead = 0; return f; }
    if (t.p !== o.px || (buy ? t.side !== 'sell' : t.side !== 'buy')) return 0;
    let q = t.q; const eat = Math.min(o.ahead, q); o.ahead -= eat; q -= eat; if (q <= 0) return 0; const f = Math.min(o.left, q); o.left -= f; return f;
  };
  V.aheadOf = (bk, side, p) => { if (!bk) return 0; let s = 0; for (const x of (side === 'buy' ? bk.bids : bk.asks) || []) if (side === 'buy' ? x[0] >= p : x[0] <= p) s += +x[1] || 0; return s; };

  /* ══ 10. Ctrl+K fuzzy ranker (< 10 ms over hundreds of commands) ══ */
  V.fuzzy = (q, s) => {
    q = String(q || '').toLowerCase(); s = String(s || '').toLowerCase(); if (!q) return 1; const ix = s.indexOf(q); if (ix >= 0) return 1000 - ix - (s.length - q.length) * 0.01;
    let j = 0, sc = 0, run = 0; for (let i = 0; i < s.length && j < q.length; i++) { if (s[i] === q[j]) { j++; run++; sc += 10 + run * 5 + (i === 0 || s[i - 1] === ' ' ? 15 : 0); } else run = 0; }
    return j === q.length ? sc : -1;
  };
  V.rank = (q, cmds, max) => { const out = []; for (const c of cmds) { const s = V.fuzzy(q, c.l + ' ' + (c.k || '')); if (s >= 0) out.push([s, c]); } out.sort((x, y) => y[0] - x[0]); return out.slice(0, max || 12).map((x) => x[1]); };

  V.p95 = (a) => { if (!a || !a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V180;
