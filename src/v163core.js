/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.3 core (pure, no DOM, Node-testable): live-execution precision.
   · active-tick sub-minute bars (a quiet tick never appends a flat O=H=L=C bar)
   · mandatory stop-loss with direction check (long SL < entry, short SL > entry); closes / flatten always pass
   · fixed-dollar-risk position sizer, R:R + dollar P&L badges, break-even stop, auto-BE on TP1, TP1/TP2/TP3 splitter
   · spread tunnel samples, magnetic snap (high / low / VWAP), trailing-stop activation + step plan, slippage in bps / ticks
   · time-in-force (GTC / IOC / Post-Only) and the Shift+B / Shift+S / Shift+X ticket hotkeys
   · core risk guards: order-book depth ≥ 3×, stale-quote freeze, trades-per-hour limit, global 6-slot exposure cap,
     drawdown throttle, correlation guard, thin-hours spread tightening, auto-disarm on idle. UI in v163.js. */
const V163 = (() => {
  const V = {};
  const fin = Number.isFinite;
  const num = (v, lo, hi, def) => (v !== '' && v !== null && v !== undefined && typeof v !== 'boolean' && fin(+v) && +v >= lo && +v <= hi ? +v : def);

  /* ══ 0. active-tick sub-minute bars ══ */
  V.SUB = 60;
  V.quiet = (b) => !!b && !(b.v > 0) && b.o === b.h && b.h === b.l && b.l === b.c;
  /* what one tick does to a sub-minute store whose newest bar is `last`:
     'merge' (same bucket) · 'append' (new bucket AND the price or volume changed) · 'skip' (new bucket, nothing changed)
     · 'old' (late tick for a closed bucket) · 'pass' (not a sub-minute store: leave it to the normal path) */
  V.subStep = (last, sec, ts, changed) => {
    if (!last || !(sec > 0 && sec < V.SUB) || !fin(ts)) return 'pass';
    const b = Math.floor(ts / sec) * sec;
    if (b < last.t) return 'old';
    if (b === last.t) return 'merge';
    return changed ? 'append' : 'skip';
  };
  V.tickChanged = (last, price, size) => !!last && (price !== last.c || size > 0);
  V.aggChanged = (last, a) => !!last && !!a && (a.c !== last.c || a.h !== a.l || a.v > 0);
  /* the single bar a changed tick appends: opens at the prior close (gapless), no flat filler bars in between */
  V.nextBar = (last, sec, ts, o) => { const t = Math.floor(ts / sec) * sec, p = last.c; return { t, o: p, h: Math.max(p, o.h != null ? o.h : o.c), l: Math.min(p, o.l != null ? o.l : o.c), c: o.c, v: o.v || 0 }; };
  /* drop flat quiet bars from a rolled-up sub-minute window (the first bar stays as the anchor); re-chain open = prior close */
  V.activeOnly = (bars) => {
    const out = []; for (const b of bars || []) { if (!b) continue; if (out.length && V.quiet(b) && b.c === out[out.length - 1].c) continue; out.push(Object.assign({}, b)); }
    for (let i = 1; i < out.length; i++) { const b = out[i], p = out[i - 1].c; b.o = p; b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); }
    return out;
  };

  /* ══ 1. mandatory stop-loss on live opening orders ══ */
  V.isOpening = (b) => !!b && b.action === 'buy' && !b.reduce;
  V.checkSL = (b, on) => {
    if (on === false || !V.isOpening(b)) return { ok: true };
    if (!(+b.sl > 0)) return { ok: false, status: 'sl', why: 'Require Stop-Loss: opening order has no stop-loss' };
    const e = +b.price; if (!(e > 0)) return { ok: true };
    if (b.side === 'short' ? !(b.sl > e) : !(b.sl < e)) return { ok: false, status: 'sl', why: `Require Stop-Loss: ${b.side === 'short' ? 'short stop must sit above' : 'long stop must sit below'} entry ${e}` };
    return { ok: true };
  };

  /* ══ 2. fixed-dollar-risk sizer + R:R / dollar badges ══ */
  V.decimals = (step) => { if (!(step > 0)) return 8; const s = String(step); return s.includes('e-') ? +s.split('e-')[1] : (s.split('.')[1] || '').length; };
  V.floorStep = (q, step) => (step > 0 ? +(Math.floor(q / step + 1e-9) * step).toFixed(V.decimals(step)) : q);
  /* $ risk → exact quantity: qty × (|entry − stop| + round-trip fee) = risk; floored to the lot step; capped by maxUsd */
  V.sizeByRisk = (riskUsd, entry, sl, o) => {
    const x = Object.assign({ step: 0, feePct: 0, maxUsd: 0 }, o || {});
    if (!(riskUsd > 0) || !(entry > 0) || !(sl > 0) || sl === entry) return null;
    const per = Math.abs(entry - sl) + entry * Math.max(0, x.feePct) * 2; let qty = V.floorStep(riskUsd / per, x.step), capped = false;
    if (x.maxUsd > 0 && qty * entry > x.maxUsd) { qty = V.floorStep(x.maxUsd / entry, x.step); capped = true; }
    if (!(qty > 0)) return null;
    return { qty, usd: qty * entry, risk: qty * per, per, capped, side: sl < entry ? 'long' : 'short' };
  };
  V.money = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '+') + '$' + (a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2)); };
  /* P&L at `target` for qty, and its R multiple against the stop: '+$420 (+2.8R)' / '-$150 (-1.0R)' */
  V.badge = (entry, sl, target, qty, side) => {
    if (!(entry > 0) || !(target > 0) || !(qty > 0)) return null;
    const dir = side === 'short' ? -1 : 1, usd = (target - entry) * qty * dir, risk = sl > 0 ? Math.abs(entry - sl) * qty : 0, r = risk > 0 ? usd / risk : null;
    return { usd, r, text: V.money(usd) + (r == null ? '' : ` (${r >= 0 ? '+' : '-'}${Math.abs(r).toFixed(1)}R)`) };
  };

  /* ══ 3. break-even stop, auto-BE on TP1, scaled take-profit ══ */
  V.breakEven = (entry, side, feePct) => { const f = Math.max(0, +feePct || 0) * 2; return side === 'short' ? entry * (1 - f) : entry * (1 + f); };
  V.SPLIT = [50, 30, 20];
  V.splitTP = (qty, entry, tp, pcts, side, step) => {
    const P = Array.isArray(pcts) && pcts.length === 3 && pcts.every((p) => p > 0) ? pcts : V.SPLIT, sum = P.reduce((a, b) => a + b, 0);
    if (!(qty > 0) || !(entry > 0) || !(tp > 0) || Math.abs(sum - 100) > 1e-9 || (side === 'short' ? tp >= entry : tp <= entry)) return null;
    const out = []; let left = qty;
    for (let i = 0; i < 3; i++) { const q = i < 2 ? V.floorStep((qty * P[i]) / 100, step || 0) : left; left -= q; out.push({ n: i + 1, pct: P[i], qty: q, price: entry + ((tp - entry) * (i + 1)) / 3 }); }
    return out;
  };
  V.hit = (side, price, level) => (side === 'short' ? price <= level : price >= level);
  /* auto-BE: once TP1 trades, the stop moves to break-even (never loosens an already tighter stop) */
  V.autoBE = (pos, price, tp1, feePct) => {
    if (!pos || !(pos.entry > 0) || !(tp1 > 0) || !V.hit(pos.side, price, tp1)) return null;
    const be = V.breakEven(pos.entry, pos.side, feePct), sl = +pos.sl || 0;
    if (pos.side === 'short' ? sl > 0 && sl <= be : sl >= be) return null;
    return be;
  };

  /* ══ 4. chart precision helpers ══ */
  V.SPREAD_TF = [1, 5, 10, 15, 30, 60]; // the spread tunnel draws on 1s – 1m
  V.tunnelOn = (tfSec) => tfSec > 0 && tfSec <= 60;
  V.pushSpread = (arr, t, bid, ask, max) => { if (!(bid > 0) || !(ask >= bid) || !fin(t)) return arr; const L = arr[arr.length - 1]; if (L && L.t === t) { L.bid = bid; L.ask = ask; } else arr.push({ t, bid, ask }); if (arr.length > (max || 900)) arr.splice(0, arr.length - (max || 900)); return arr; };
  V.vwap = (bars) => { let pv = 0, v = 0, s = 0, n = 0; for (const b of bars || []) { if (!b) continue; const tp = (b.h + b.l + b.c) / 3; if (!fin(tp)) continue; s += tp; n++; if (b.v > 0) { pv += tp * b.v; v += b.v; } } return v > 0 ? pv / v : n ? s / n : null; };
  /* magnetic snap: the nearest of high / low / VWAP within tolPrice of p, else p unchanged */
  V.snap = (p, levels, tolPrice) => { let best = p, d = tolPrice > 0 ? tolPrice : 0; for (const x of levels || []) { if (!(x > 0)) continue; const k = Math.abs(x - p); if (k <= d) { d = k; best = x; } } return best; };
  /* ghost bracket of the order ticket: entry (limit or last), stop / target from % inputs */
  V.ghost = (entry, slPct, tpPct, side) => { if (!(entry > 0)) return null; const s = side === 'short' ? -1 : 1; return { entry, sl: slPct > 0 ? entry * (1 - s * slPct) : null, tp: tpPct > 0 ? entry * (1 + s * tpPct) : null }; };
  /* trailing stop: activates once price moves actPct in favour, then trails trailPct off the extreme and ratchets in
     stepPct increments (of entry); `next` is the price at which the stop moves up one more step */
  V.trailPlan = (entry, extreme, trailPct, actPct, stepPct, side) => {
    if (!(entry > 0) || !(extreme > 0) || !(trailPct > 0)) return null;
    const s = side === 'short' ? -1 : 1, act = entry * (1 + s * Math.max(0, actPct || 0)), active = s > 0 ? extreme >= act : extreme <= act;
    if (!active) return { active: false, act, stop: null, next: act };
    const raw = extreme * (1 - s * trailPct), st = (stepPct || 0) > 0 ? entry * stepPct : 0;
    const stop = st ? (s > 0 ? Math.floor(raw / st + 1e-9) * st : Math.ceil(raw / st - 1e-9) * st) : raw;
    const next = st ? (stop + s * st) / (1 - s * trailPct) : null;
    return { active: true, act, stop, next };
  };
  V.tick = (price) => (price > 0 ? Math.pow(10, Math.floor(Math.log10(price)) - 4) : 0);
  /* slippage vs the reference price at order time; positive = adverse (paid more on a buy, received less on a sell) */
  V.slippage = (fill, ref, side, tick) => {
    if (!(fill > 0) || !(ref > 0)) return null; const adv = side === 'sell' ? ref - fill : fill - ref, t = tick > 0 ? tick : V.tick(ref);
    return { bps: (adv / ref) * 1e4, ticks: t > 0 ? adv / t : null, text: `${adv >= 0 ? '+' : '-'}${Math.abs((adv / ref) * 1e4).toFixed(1)} bps` };
  };

  /* ══ 5. time-in-force + hotkeys ══ */
  V.TIF = ['GTC', 'IOC', 'POST'];
  V.TIF_LABEL = { GTC: 'GTC', IOC: 'IOC', POST: 'Post-Only' };
  /* limit placement under a TIF: Post-Only refuses a price that would take liquidity; IOC keeps only an immediate fill */
  V.tifCheck = (tif, side, limit, bid, ask) => {
    const mk = side === 'buy' ? ask > 0 && limit >= ask : bid > 0 && limit <= bid;
    if (tif === 'POST' && mk) return { ok: false, why: `Post-Only: a ${side} limit at ${limit} would cross the ${side === 'buy' ? 'ask ' + ask : 'bid ' + bid} and take liquidity` };
    if (tif === 'IOC') return { ok: true, marketable: mk, cancelRest: !mk };
    return { ok: true, marketable: mk, cancelRest: false };
  };
  V.HOTKEYS = { B: 'buy', S: 'sell', X: 'cancel' };
  V.hotkey = (e, editable) => {
    if (!e || editable || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
    const k = String(e.key || '').toUpperCase(); return Object.prototype.hasOwnProperty.call(V.HOTKEYS, k) ? V.HOTKEYS[k] : null;
  };

  /* ══ 6. core risk guards ══ */
  /* opposite-side book depth within bandPct of mid must be ≥ mult × order notional; unknown book = pass, noted */
  V.depthCheck = (book, side, usd, mult, bandPct) => {
    const m = mult > 0 ? mult : 3, need = usd * m, lv = book && (side === 'sell' ? book.bids : book.asks);
    if (!Array.isArray(lv) || !lv.length || !book.bids || !book.asks || !book.bids.length || !book.asks.length) return { ok: true, known: false, depth: null, need };
    const mid = (+book.bids[0][0] + +book.asks[0][0]) / 2, band = mid * ((bandPct > 0 ? bandPct : 0.5) / 100); let depth = 0;
    for (const [p, q] of lv) { if (!(p > 0) || !(q > 0)) continue; if (Math.abs(p - mid) > band) break; depth += p * q; }
    return { ok: depth >= need, known: true, depth, need };
  };
  /* stale-quote freeze: the allowed quote age depends on how the market streams */
  V.STALE_MS = { crypto: 5000, stock: 20000, onchain: 90000 };
  V.staleQuote = (ageMs, kind, mult) => { const max = (V.STALE_MS[kind] || V.STALE_MS.crypto) * (mult > 0 ? mult : 1); if (!fin(ageMs) || ageMs < 0) return { ok: false, age: null, max, why: 'no quote timestamp' }; return { ok: ageMs <= max, age: ageMs, max }; };
  V.rateLimit = (times, now, max) => { const n = (times || []).filter((t) => now - t < 3600000 && t <= now).length; return { ok: !(max > 0) || n < max, n, max }; };
  V.exposure = (positions, addUsd, cap) => { const tot = (positions || []).reduce((a, p) => a + Math.max(0, +(p && p.usd) || 0), 0); return { ok: !(cap > 0) || tot + Math.max(0, +addUsd || 0) <= cap, total: tot, after: tot + Math.max(0, +addUsd || 0), cap }; };
  /* drawdown throttle: after n consecutive losing closes the next opening order is cut to `cut` of its size */
  V.throttle = (closes, n, cut) => { const xs = (closes || []).filter((c) => c && fin(c.pnl) && fin(c.ts)).sort((a, b) => a.ts - b.ts); let k = 0; for (let i = xs.length - 1; i >= 0 && xs[i].pnl < 0; i--) k++; const N = n > 0 ? n : 2; return { losses: k, scale: k >= N ? (cut > 0 && cut <= 1 ? cut : 0.5) : 1 }; };
  V.returns = (xs) => { const r = []; for (let i = 1; i < (xs || []).length; i++) if (xs[i - 1] > 0 && xs[i] > 0) r.push(Math.log(xs[i] / xs[i - 1])); return r; };
  V.pearson = (a, b) => {
    const n = Math.min(a.length, b.length); if (n < 10) return null; const x = a.slice(-n), y = b.slice(-n);
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  };
  /* correlation guard: refuse a new position whose returns move with an open one at r > max */
  V.corrGuard = (closesNew, open, max) => {
    const lim = max > 0 ? max : 0.85, rn = V.returns(closesNew);
    for (const [sym, cs] of Object.entries(open || {})) { const r = V.pearson(rn, V.returns(cs)); if (r != null && r > lim) return { ok: false, sym, r, max: lim }; }
    return { ok: true, max: lim };
  };
  /* thin-liquidity hours: weekends (UTC) for crypto, outside 09:30–16:00 New York for US stocks */
  V.usRegular = (ms) => {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value;
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false; const m = (+p.hour % 24) * 60 + +p.minute; return m >= 570 && m < 960;
  };
  V.thinHours = (ms, kind) => { if (kind === 'stock') return !V.usRegular(ms); const d = new Date(ms).getUTCDay(); return d === 0 || d === 6; };
  V.spreadCap = (base, thin, cut) => (thin ? base * (cut > 0 && cut <= 1 ? cut : 0.5) : base);
  V.IDLE = [0, 15, 30, 60];
  V.idleDue = (lastAct, now, mins) => mins > 0 && fin(lastAct) && now - lastAct >= mins * 60000;

  /* ══ settings ══ */
  V.DEFAULTS = () => ({ requireSL: true, depthOn: true, depthX: 3, staleOn: true, maxPerHour: 20, expCap: 25000, throttle: true, corrOn: true, corrMax: 0.85, thinOn: true, idleMin: 0,
    tif: 'GTC', riskUsd: 100, autoBE: false, splitTP: false, trailAct: 0, trailStep: 0, tunnel: true, ghost: true, fills: true, hotkeys: true });
  V.load = (raw) => {
    const d = V.DEFAULTS(); let o = null; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return d;
    for (const k of ['requireSL', 'depthOn', 'staleOn', 'throttle', 'corrOn', 'thinOn', 'autoBE', 'splitTP', 'tunnel', 'ghost', 'fills', 'hotkeys']) if (typeof o[k] === 'boolean') d[k] = o[k];
    d.depthX = num(o.depthX, 1, 50, d.depthX); d.maxPerHour = Math.round(num(o.maxPerHour, 0, 1000, d.maxPerHour)); d.expCap = num(o.expCap, 0, 1e10, d.expCap);
    d.corrMax = num(o.corrMax, 0.5, 0.99, d.corrMax); d.idleMin = V.IDLE.includes(+o.idleMin) ? +o.idleMin : 0; d.tif = V.TIF.includes(o.tif) ? o.tif : 'GTC';
    d.riskUsd = num(o.riskUsd, 0.01, 1e9, d.riskUsd); d.trailAct = num(o.trailAct, 0, 50, 0); d.trailStep = num(o.trailStep, 0, 50, 0);
    return d;
  };

  /* every guard for one live opening order, in order; the first failure blocks. ctx:
     { quoteAge, kind, sentTimes, now, positions:[{usd}], book, closes, corrNew, corrOpen, spread:{bid,ask}, maxSpreadPct } */
  V.preflight = (b, ctx, cfg) => {
    const c = Object.assign(V.DEFAULTS(), cfg || {}), x = ctx || {}, now = fin(x.now) ? x.now : Date.now();
    const sl = V.checkSL(b, c.requireSL); if (!sl.ok) return sl;
    if (!V.isOpening(b)) return { ok: true, scale: 1, notes: [] };
    const notes = [], usd = +b.usd || 0;
    if (c.staleOn) { const s = V.staleQuote(x.quoteAge, x.kind); if (!s.ok) return { ok: false, status: 'stale', why: s.age == null ? 'Stale-Quote Freeze: no fresh quote' : `Stale-Quote Freeze: quote is ${(s.age / 1000).toFixed(1)}s old (max ${(s.max / 1000).toFixed(0)}s for ${x.kind || 'crypto'})` }; }
    const rl = V.rateLimit(x.sentTimes, now, c.maxPerHour); if (!rl.ok) return { ok: false, status: 'rate', why: `Rate limiter: ${rl.n} live opening orders in the last hour (max ${rl.max})` };
    const ex = V.exposure(x.positions, usd, c.expCap); if (!ex.ok) return { ok: false, status: 'exposure', why: `6-Slot Exposure Cap: $${Math.round(ex.after).toLocaleString('en-US')} would exceed the $${Math.round(ex.cap).toLocaleString('en-US')} cap` };
    if (c.depthOn) { const d = V.depthCheck(x.book, 'buy', usd, c.depthX); if (!d.ok) return { ok: false, status: 'depth', why: `Liquidity depth: $${Math.round(d.depth).toLocaleString('en-US')} within 0.5% of mid is below ${c.depthX}× the $${Math.round(usd).toLocaleString('en-US')} order` }; if (!d.known) notes.push('depth unknown (no book)'); }
    if (c.corrOn) { const r = V.corrGuard(x.corrNew, x.corrOpen, c.corrMax); if (!r.ok) return { ok: false, status: 'corr', why: `Correlation Guard: r = ${r.r.toFixed(2)} with open ${r.sym} (max ${r.max})` }; }
    if (c.thinOn && x.spread && fin(+x.maxSpreadPct)) {
      const thin = V.thinHours(now, x.kind); if (thin) { const cap = V.spreadCap(+x.maxSpreadPct, true), b0 = +x.spread.bid, a0 = +x.spread.ask; const pct = b0 > 0 && a0 >= b0 ? ((a0 - b0) / ((a0 + b0) / 2)) * 100 : null; if (pct != null && pct > cap) return { ok: false, status: 'thin', why: `Thin-liquidity hours: spread ${pct.toFixed(3)}% is above the tightened ${cap.toFixed(3)}% cap` }; notes.push('thin hours: spread cap halved'); }
    }
    let scale = 1; if (c.throttle) { const t = V.throttle(x.closes, 2, 0.5); scale = t.scale; if (scale < 1) notes.push(`Drawdown Throttle: ${t.losses} losses in a row, size cut to ${scale * 100}%`); }
    return { ok: true, scale, notes };
  };
  /* ══════════ v16.3 closed-loop cockpit (pure) ══════════ */
  /* compact countdown: 42s · 11m 42s · 2h 05m · 3d 04h */
  V.countdown = (ms) => {
    if (!fin(ms) || ms < 0) return '0s'; const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (v) => String(v).padStart(2, '0');
    return d ? `${d}d ${p(h)}h` : h ? `${h}h ${p(m)}m` : m ? `${m}m ${p(x)}s` : `${x}s`;
  };
  /* floating live HUD line + alert level (crit once 80% of the daily-loss cap is used) */
  V.hud = (o) => {
    const x = o || {}, slots = (x.slots || []).filter((s) => fin(+s)), cap = +x.cap > 0 ? +x.cap : 0, pnl = fin(+x.dayPnl) ? +x.dayPnl : 0, used = cap && pnl < 0 ? -pnl / cap : 0;
    const head = x.armed ? 'LIVE ARMED' : 'PAPER', sl = slots.length ? 'Slot ' + slots.join(',') : 'no slot', ping = fin(+x.ping) && +x.ping > 0 ? Math.round(+x.ping) + ' ms' : '– ms';
    const text = `${head} · ${sl} · ${ping} · Day ${V.money(pnl)} vs -$${cap ? Math.round(cap).toLocaleString('en-US') : '–'} cap`;
    return { text, used, level: !x.armed ? 'paper' : used >= 0.8 ? 'crit' : used >= 0.5 || !(+x.ping > 0) ? 'warn' : 'ok' };
  };
  /* 44px equity + drawdown micro-sparkline geometry */
  V.spark = (xs, w, h) => {
    const v = (xs || []).filter(fin); if (v.length < 2 || !(w > 0) || !(h > 0)) return null;
    let lo = Infinity, hi = -Infinity, peak = -Infinity, dd = 0; for (const e of v) { lo = Math.min(lo, e); hi = Math.max(hi, e); peak = Math.max(peak, e); dd = Math.max(dd, peak - e); }
    const span = hi - lo || Math.abs(hi) * 1e-6 || 1, n = v.length - 1, pk = []; let run = -Infinity;
    const pts = v.map((e, i) => { run = Math.max(run, e); pk.push([(i / n) * w, h - 2 - ((run - lo) / span) * (h - 4)]); return [(i / n) * w, h - 2 - ((e - lo) / span) * (h - 4)]; });
    return { pts, peakPts: pk, dd, ddPct: peak > 0 ? (dd / peak) * 100 : 0, last: v[v.length - 1], first: v[0], up: v[v.length - 1] >= v[0] };
  };
  /* New York wall clock (minutes since midnight, weekday) */
  V.ny = (ms) => { const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value; return { wd: p.weekday, min: (+p.hour % 24) * 60 + +p.minute + +p.second / 60 }; };
  /* next pre-trade event: US close (or next open) for stocks, the next 8-hourly funding print for crypto */
  V.nextEvent = (now, kind) => {
    if (kind === 'stock') {
      const n = V.ny(now), wk = n.wd !== 'Sat' && n.wd !== 'Sun';
      if (wk && n.min >= 570 && n.min < 960) return { name: 'US close', at: now + (960 - n.min) * 60000, left: (960 - n.min) * 60000 };
      let add = n.min < 570 && wk ? 570 - n.min : 1440 - n.min + 570, d = new Date(now + add * 60000); for (let i = 0; i < 4 && /Sat|Sun/.test(V.ny(+d).wd); i++) { add += 1440; d = new Date(now + add * 60000); }
      return { name: 'US open', at: now + add * 60000, left: add * 60000 };
    }
    if (kind === 'onchain') return null;
    const h8 = 8 * 3600000, at = Math.floor(now / h8) * h8 + h8; return { name: 'Funding', at, left: at - now };
  };
  /* Pause New Entries (Keep Exits Active): blocks only live opening orders */
  V.pauseCheck = (b, paused) => (paused && V.isOpening(b) ? { ok: false, status: 'paused', why: 'Pause New Entries is ON: exits stay active, new entries are held' } : { ok: true });
  V.cooldownLabel = (until, now) => (fin(until) && until > now ? 'Cooldown: ' + V.countdown(until - now) : null);
  /* position drawer actions → paper close list [{ sym, qty, acct }] */
  V.drawerPlan = (positions, action, prices) => {
    const out = [];
    for (const p of positions || []) {
      if (!p || !(p.qty > 0) || !(p.entry > 0)) continue; const m = prices && prices[p.sym] > 0 ? prices[p.sym] : p.entry, pnl = (m - p.entry) * p.qty * (p.side === 'short' ? -1 : 1);
      if (action === 'half') out.push({ sym: p.sym, qty: p.qty / 2, acct: p.acct });
      else if (action === 'flat' || action === 'reverse' || action === 'all') out.push({ sym: p.sym, qty: p.qty, acct: p.acct });
      else if (action === 'losers' && pnl < 0) out.push({ sym: p.sym, qty: p.qty, acct: p.acct });
      else if (action === 'winners' && pnl > 0) out.push({ sym: p.sym, qty: p.qty, acct: p.acct });
    }
    return out;
  };
  /* scale-in / pyramid preview: add pct of the open size at price → blended entry */
  V.pyramid = (qty, entry, pct, price) => { if (!(qty > 0) || !(entry > 0) || !(pct > 0) || !(price > 0)) return null; const add = qty * pct, tot = qty + add; return { add, qty: tot, blended: (qty * entry + add * price) / tot, usd: add * price }; };
  /* fee + funding / borrow drag line: the price that pays round-trip fees plus the carry accrued over `hours` */
  V.carryLine = (entry, side, feePct, ratePer8h, hours) => { if (!(entry > 0)) return null; const f = Math.max(0, +feePct || 0) * 2 + Math.max(0, +ratePer8h || 0) * Math.max(0, +hours || 0) / 8; return side === 'short' ? entry * (1 - f) : entry * (1 + f); };
  /* Chase Limit: peg to the best bid (buy) / best ask (sell); aggressive steps one tick inside the spread when there is room */
  V.chase = (side, bid, ask, tick, aggressive) => {
    if (!(bid > 0) || !(ask >= bid)) return null; const t = tick > 0 ? tick : V.tick(bid), room = ask - bid > t * 1.5;
    if (side === 'sell') return aggressive && room ? ask - t : ask;
    return aggressive && room ? bid + t : bid;
  };
  /* isolated-margin liquidation estimate and the buffer from the mark (warn under 15%) */
  V.LIQ_WARN = 15;
  V.liq = (entry, lev, side, mmr) => { if (!(entry > 0) || !(lev > 1)) return null; const m = mmr >= 0 ? mmr : 0.005; return side === 'short' ? entry * (1 + 1 / lev - m) : entry * (1 - 1 / lev + m); };
  V.liqBuffer = (mark, liqPx) => { if (!(mark > 0) || !(liqPx > 0)) return null; const pct = (Math.abs(mark - liqPx) / mark) * 100; return { pct, warn: pct < V.LIQ_WARN }; };
  /* watchlist Signal Readiness dot: EMA 20 / 50 cross within 3 bars = ready, gap under 0.15% = near */
  V.ema = (xs, n) => { const k = 2 / (n + 1), out = []; let e = null; for (const x of xs) { e = e == null ? x : x * k + e * (1 - k); out.push(e); } return out; };
  V.readiness = (closes) => {
    const c = (closes || []).filter((x) => x > 0); if (c.length < 55) return 'idle'; const a = V.ema(c, 20), b = V.ema(c, 50), n = c.length - 1;
    for (let i = n; i > n - 3; i--) if ((a[i] - b[i]) * (a[i - 1] - b[i - 1]) < 0) return 'ready';
    return Math.abs(a[n] - b[n]) / b[n] < 0.0015 ? 'near' : 'idle';
  };
  /* one-click Copy Trade Setup text */
  V.setupText = (o) => {
    const x = o || {}, f = (v) => (v > 0 ? String(+(+v).toPrecision(7)) : '–'), rr = x.entry > 0 && x.sl > 0 && x.tp > 0 ? Math.abs(x.tp - x.entry) / Math.abs(x.entry - x.sl) : null;
    return `${x.side === 'short' ? 'SHORT' : 'LONG'} ${String(x.sym || '').toUpperCase()} @ ${f(x.entry)} · SL ${f(x.sl)} · TP ${f(x.tp)}${rr ? ' · R:R ' + rr.toFixed(2) : ''}${x.risk > 0 ? ' · risk $' + (+x.risk).toFixed(2) : ''}${x.tf ? ' · ' + x.tf : ''} · ExTerm`;
  };
  /* privacy-masked trade card: R multiple, % and holding time only (no $ size, no quantity, no account value) */
  V.maskCard = (t, sl) => {
    if (!t || !(t.price > 0)) return null; const pct = fin(t.pnlPct) ? t.pnlPct * 100 : null, entry = t.qty > 0 && fin(t.pnl) ? (t.usd - t.pnl) / t.qty : null;
    const r = entry && sl > 0 && Math.abs(entry - sl) > 0 ? ((t.price - entry) / Math.abs(entry - sl)) * (t.short ? -1 : 1) : null, held = fin(t.held) && t.held > 0 ? V.countdown(t.held) : '–';
    return { title: `${String(t.sym || '').split(/[-/]/)[0].toUpperCase()} · ${t.short ? 'SHORT' : 'LONG'} closed`, result: pct == null ? '–' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', r: r == null ? null : (r >= 0 ? '+' : '') + r.toFixed(2) + 'R', held, win: pct != null && pct >= 0, reason: String(t.reason || '').slice(0, 40) };
  };
  /* two-way bot sync: a receiver reply may carry { ack, fill: { price, qty, ts, order_id } } */
  V.parseFill = (reply, key) => {
    if (!reply || typeof reply !== 'object' || reply.ack !== key || !reply.fill || typeof reply.fill !== 'object') return null; const f = reply.fill, p = +f.price, q = +f.qty;
    if (!(p > 0) || !(q > 0) || p > 1e12 || q > 1e15) return null;
    return { price: p, qty: q, ts: fin(+f.ts) && +f.ts > 0 ? +f.ts : Date.now(), id: String(f.order_id == null ? '' : f.order_id).replace(/[^\w.:-]/g, '').slice(0, 64) };
  };
  /* slippage & fill quality by symbol (rolling last `max` fills) */
  V.qAdd = (m, sym, bps, ackMs, max) => { const k = String(sym || '').toUpperCase(); if (!k || !fin(bps)) return m; const a = m[k] || (m[k] = []); a.push({ bps, ack: fin(ackMs) ? ackMs : null }); if (a.length > (max || 50)) a.splice(0, a.length - (max || 50)); return m; };
  V.qSummary = (m) => Object.entries(m || {}).map(([sym, a]) => { const ak = a.filter((x) => x.ack != null); return { sym, n: a.length, bps: a.reduce((s, x) => s + x.bps, 0) / (a.length || 1), ack: ak.length ? ak.reduce((s, x) => s + x.ack, 0) / ak.length : null }; }).sort((x, y) => y.n - x.n);
  V.signedQty = (side, action, qty) => (action === 'buy' ? 1 : -1) * (side === 'short' ? -1 : 1) * qty;
  /* bot heartbeat latency + packet success */
  V.hbStats = (xs) => { const s = (xs || []).filter((x) => x && typeof x.ok === 'boolean'), ok = s.filter((x) => x.ok); return { n: s.length, okPct: s.length ? (ok.length / s.length) * 100 : null, avgMs: ok.length ? ok.reduce((a, x) => a + (+x.ms || 0), 0) / ok.length : null, last: s[s.length - 1] || null }; };
  /* per-slot asset / ticker allowlist ("" = any) */
  V.allowParse = (s) => [...new Set(String(s || '').toUpperCase().split(/[\s,;]+/).map((x) => x.replace(/[^A-Z0-9._]/g, '')).filter((x) => x && x.length <= 20))];
  V.allowOk = (list, sym) => { const L = Array.isArray(list) ? list : V.allowParse(list); if (!L.length) return true; const b = String(sym || '').toUpperCase().split(/[-/]/)[0]; return L.includes(b); };
  V.timeExitDue = (t0, now, mins) => mins > 0 && fin(+t0) && +t0 > 0 && now - +t0 >= mins * 60000;
  /* Price Alert → Conditional Trigger: fires once when price crosses the level in the chosen direction */
  V.trigCross = (rule, prev, price) => !!rule && rule.level > 0 && prev > 0 && price > 0 && (rule.op === '<=' ? prev > rule.level && price <= rule.level : prev < rule.level && price >= rule.level);
  V.trigOk = (r) => !!r && typeof r === 'object' && /^[\w.:/-]{1,40}$/.test(String(r.sym || '')) && (r.op === '>=' || r.op === '<=') && +r.level > 0 && (r.action === 'buy' || r.action === 'sell') && (r.action === 'sell' || +r.usd >= 1);
  /* EOD Flat Timer: inside the last `mins` minutes of the US regular session */
  V.eodDue = (now, mins) => { if (!(mins > 0)) return false; const n = V.ny(now); return n.wd !== 'Sat' && n.wd !== 'Sun' && n.min >= 960 - mins && n.min < 960; };
  /* Hardware-Style Two-Key Arming: Shift + Alt + A turns key 1; Arm must follow within the window */
  V.TWO_KEY_MS = 10000;
  V.twoKey = (e) => !!e && e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyA' || String(e.key || '').toUpperCase() === 'A');
  V.twoKeyOk = (turnedAt, now, win) => fin(turnedAt) && turnedAt > 0 && now - turnedAt >= 0 && now - turnedAt <= (win || V.TWO_KEY_MS);
  /* 3-Second Live Readiness Self-Check: every row must pass */
  V.selfCheck = (c) => {
    const x = c || {}, rows = [];
    const add = (k, ok, why) => rows.push({ k, ok: !!ok, why: String(why || '') });
    add('Local bot slot enabled', x.slots > 0, x.slots > 0 ? x.slots + ' slot(s) enabled' : 'enable at least one 127.0.0.1 slot');
    add('Heartbeat under 3 s on every enabled slot', x.slots > 0 && x.hbOk === x.slots, `${x.hbOk || 0}/${x.slots || 0} answered${x.hbMs > 0 ? ' · worst ' + Math.round(x.hbMs) + ' ms' : ''}`);
    add('Require Stop-Loss is ON', x.requireSL !== false, x.requireSL !== false ? 'opening orders need a stop' : 'turn Require Stop-Loss back on');
    add('Max Daily Loss ($) cap set', x.maxLoss > 0, x.maxLoss > 0 ? '$' + x.maxLoss : 'set a daily-loss cap');
    add('Fresh quote on the selected market', x.quoteOk === true, x.quoteWhy || '');
    add('No loss-streak cooldown active', !x.cooldown, x.cooldown ? 'cooldown until ' + x.cooldown : 'clear');
    add('Spread inside the Execution Shield ceiling', x.spreadOk !== false, x.spreadWhy || '');
    return { rows, ready: rows.every((r) => r.ok), passed: rows.filter((r) => r.ok).length };
  };
  V.canReset = (mode) => mode !== 'live';
  /* encrypted session recovery snapshot: PBKDF2-SHA256 (200k) → AES-256-GCM, WebCrypto in the browser and Node ≥ 18 */
  const sub = () => (typeof crypto !== 'undefined' && crypto.subtle) || null;
  const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64'); };
  const unb64 = (s) => { const r = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); const a = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; };
  const kdf = async (pass, salt) => { const s = sub(), base = await s.importKey('raw', new TextEncoder().encode(String(pass)), 'PBKDF2', false, ['deriveKey']); return s.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); };
  V.seal = async (obj, pass) => {
    if (!sub() || String(pass || '').length < 8) throw new Error('passphrase must be at least 8 characters');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), k = await kdf(pass, salt);
    const ct = new Uint8Array(await sub().encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj))));
    return JSON.stringify({ v: 1, app: 'ExTerm', alg: 'PBKDF2-SHA256-200k/AES-256-GCM', ts: Date.now(), s: b64(salt), i: b64(iv), c: b64(ct) });
  };
  V.unseal = async (blob, pass) => {
    let o; try { o = typeof blob === 'string' ? JSON.parse(blob) : blob; } catch (e) { throw new Error('snapshot is damaged'); }
    if (!o || o.v !== 1 || !o.s || !o.i || !o.c) throw new Error('snapshot is damaged');
    let pt; try { pt = await sub().decrypt({ name: 'AES-GCM', iv: unb64(o.i) }, await kdf(pass, unb64(o.s)), unb64(o.c)); } catch (e) { throw new Error('wrong passphrase or tampered snapshot'); }
    return JSON.parse(new TextDecoder().decode(pt));
  };
  /* copy-pasteable local broker starter bridges: verify the signed envelope, execute, reply { ok, ack, fill } */
  const PY_HEAD = (port, imports) => `# ExTerm local starter bridge · listens on 127.0.0.1:${port} only · set EXTERM_SLOT_SECRET to your slot secret
import hmac, hashlib, json, os, time
from http.server import BaseHTTPRequestHandler, HTTPServer
${imports}
SECRET = bytes.fromhex(os.environ.get("EXTERM_SLOT_SECRET", "PASTE_SLOT_SECRET_HEX"))
seen, last = set(), {}

def verify(raw):
    w = json.loads(raw); p = json.loads(w["payload"])
    key = hmac.new(SECRET, ("ExTerm-session-v2|" + str(p["session"])).encode(), hashlib.sha256).digest()
    want = "sha256=" + hmac.new(key, w["payload"].encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, w.get("sig", "")): raise ValueError("bad signature")
    if time.time() * 1000 > p["expires_at_ms"] or p["idempotency_key"] in seen: raise ValueError("expired or replay")
    if p["seq"] <= last.get(p["session"], -1): raise ValueError("replay")
    seen.add(p["idempotency_key"]); last[p["session"]] = p["seq"]
    return p

def is_buy(b): return (b["action"] == "buy") != (b.get("side") == "short")
`;
  const PY_TAIL = (port) => `
class Bridge(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            p = verify(self.rfile.read(int(self.headers["Content-Length"])))
            out = {"ok": True, "ack": p["idempotency_key"]}
            if p["mode"] == "live" and p["kind"] == "signal": out["fill"] = execute(p["body"])
            if p["mode"] == "live" and p["kind"] == "flatten": flatten()
        except Exception as e:
            out = {"ok": False, "error": str(e)[:120]}
        data = json.dumps(out).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(data)

HTTPServer(("127.0.0.1", ${port}), Bridge).serve_forever()
`;
  V.BRIDGES = {
    ibkr: { name: 'Interactive Brokers (TWS / Gateway)', file: 'exterm_ibkr_bridge.py', port: 8769, slot: 5, pip: 'ib_insync', imports: 'from ib_insync import IB, Stock, MarketOrder', body: `
ib = IB(); ib.connect("127.0.0.1", 7497, clientId=7)   # 7497 = TWS paper port

def execute(b):
    c = Stock(b["symbol"], "SMART", "USD"); ib.qualifyContracts(c)
    qty = max(1, int(b.get("qty") or b["usd"] / b["price"]))
    t = ib.placeOrder(c, MarketOrder("BUY" if is_buy(b) else "SELL", qty)); ib.sleep(1.5)
    return {"price": t.orderStatus.avgFillPrice, "qty": t.orderStatus.filled, "ts": int(time.time() * 1000), "order_id": t.order.orderId}

def flatten():
    ib.reqGlobalCancel()
    for p in ib.positions(): ib.placeOrder(p.contract, MarketOrder("SELL" if p.position > 0 else "BUY", abs(p.position)))
` },
    alpaca: { name: 'Alpaca (paper or live)', file: 'exterm_alpaca_bridge.py', port: 8769, slot: 5, pip: 'alpaca-py', imports: 'from alpaca.trading.client import TradingClient\nfrom alpaca.trading.requests import MarketOrderRequest\nfrom alpaca.trading.enums import OrderSide, TimeInForce', body: `
api = TradingClient(os.environ["APCA_API_KEY_ID"], os.environ["APCA_API_SECRET_KEY"], paper=True)

def execute(b):
    qty = round(b.get("qty") or b["usd"] / b["price"], 6)
    o = api.submit_order(MarketOrderRequest(symbol=b["symbol"], qty=qty, side=OrderSide.BUY if is_buy(b) else OrderSide.SELL, time_in_force=TimeInForce.DAY))
    time.sleep(1.0); o = api.get_order_by_id(o.id)
    return {"price": float(o.filled_avg_price or 0), "qty": float(o.filled_qty or 0), "ts": int(time.time() * 1000), "order_id": str(o.id)}

def flatten():
    api.close_all_positions(cancel_orders=True)
` },
    ccxt: { name: 'CCXT crypto exchange', file: 'exterm_ccxt_bridge.py', port: 8765, slot: 1, pip: 'ccxt', imports: 'import ccxt', body: `
ex = getattr(ccxt, os.environ.get("EX_ID", "kraken"))({"apiKey": os.environ["EX_KEY"], "secret": os.environ["EX_SECRET"]})
QUOTE = os.environ.get("EX_QUOTE", "USDT")

def execute(b):
    sym = b["symbol"] + "/" + QUOTE; amt = float(ex.amount_to_precision(sym, b.get("qty") or b["usd"] / b["price"]))
    o = ex.create_order(sym, "market", "buy" if is_buy(b) else "sell", amt)
    return {"price": o.get("average") or o.get("price") or b["price"], "qty": o.get("filled") or amt, "ts": o.get("timestamp") or int(time.time() * 1000), "order_id": o["id"]}

def flatten():
    for o in ex.fetch_open_orders(): ex.cancel_order(o["id"], o["symbol"])
` },
    freqtrade: { name: 'Freqtrade REST API', file: 'exterm_freqtrade_bridge.py', port: 8766, slot: 2, pip: 'requests', imports: 'import requests', body: `
FT = os.environ.get("FT_URL", "http://127.0.0.1:8080/api/v1")   # needs force_entry_enable: true
AUTH = (os.environ["FT_USER"], os.environ["FT_PASS"]); PAIR = "{}/" + os.environ.get("FT_QUOTE", "USDT")

def execute(b):
    if b["action"] == "buy":
        r = requests.post(FT + "/forceenter", json={"pair": PAIR.format(b["symbol"]), "side": "short" if b.get("side") == "short" else "long", "stakeamount": b["usd"]}, auth=AUTH, timeout=3).json()
    else:
        t = [x for x in requests.get(FT + "/status", auth=AUTH, timeout=3).json() if x["pair"] == PAIR.format(b["symbol"])]
        r = requests.post(FT + "/forceexit", json={"tradeid": t[0]["trade_id"]}, auth=AUTH, timeout=3).json() if t else {}
    return {"price": r.get("open_rate") or b["price"], "qty": r.get("amount") or b.get("qty") or 0, "ts": int(time.time() * 1000), "order_id": r.get("trade_id", "")}

def flatten():
    requests.post(FT + "/forceexit", json={"tradeid": "all"}, auth=AUTH, timeout=3)
` },
  };
  V.bridge = (k) => { const b = V.BRIDGES[k]; return b ? PY_HEAD(b.port, b.imports) + b.body + PY_TAIL(b.port) : ''; };
  /* cockpit settings */
  V.CDEF = () => ({ paused: false, muted: false, cues: true, autoCard: false, twoKey: false, lev: 1, mmr: 0.5, fundRate: 0.01, pyrPct: 50, peg: false, pegAgg: false,
    titMin: 0, eodMin: 0, allow: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' }, triggers: [], focus: false, micro: false, dots: true });
  V.cload = (raw) => {
    const d = V.CDEF(); let o = null; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; } if (!o || typeof o !== 'object') return d;
    for (const k of ['paused', 'muted', 'cues', 'autoCard', 'twoKey', 'peg', 'pegAgg', 'focus', 'micro', 'dots']) if (typeof o[k] === 'boolean') d[k] = o[k];
    d.lev = num(o.lev, 1, 125, 1); d.mmr = num(o.mmr, 0, 10, 0.5); d.fundRate = num(o.fundRate, 0, 1, 0.01); d.pyrPct = num(o.pyrPct, 1, 300, 50);
    d.titMin = Math.round(num(o.titMin, 0, 10080, 0)); d.eodMin = [0, 5, 10, 15, 30].includes(+o.eodMin) ? +o.eodMin : 0;
    if (o.allow && typeof o.allow === 'object') for (const k of Object.keys(d.allow)) if (typeof o.allow[k] === 'string') d.allow[k] = V.allowParse(o.allow[k]).join(', ');
    if (Array.isArray(o.triggers)) d.triggers = o.triggers.filter(V.trigOk).slice(0, 20).map((r) => ({ id: String(r.id || Math.random().toString(36).slice(2, 10)).replace(/\W/g, '').slice(0, 16), sym: String(r.sym), op: r.op, level: +r.level, action: r.action, usd: +r.usd || 0, sl: num(r.sl, 0, 50, 2) }));
    return d;
  };
  V.HIGHLIGHTS = [
    'Closed-loop cockpit: floating Live Execution HUD (slot, ping, daily P&L vs cap), 44px equity / drawdown sparkline and a market-close / funding countdown',
    'Pause New Entries (exits stay active), cooldown countdown inside the Buy button, Focus Chart (F), docked Micro-Ticket and a live position & orders drawer',
    'Two-way 127.0.0.1 ACK + fill sync, heartbeat latency graph, slippage & fill quality by symbol, and starter bridges for Interactive Brokers, Alpaca, CCXT and Freqtrade',
    'Require Stop-Loss on every live opening order (ON by default), $ risk sizer with R:R and $ badges, BE pill, Auto-BE on TP1',
    'Core risk guards: 3× depth, stale-quote freeze, trades-per-hour limit, 6-slot exposure cap, drawdown throttle, correlation guard',
    'Two-Key Arming (Shift + Alt + A), 3-Second Live Readiness Self-Check, per-slot ticker allowlist, time-in-trade exit and EOD Flat Timer',
  ];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V163;
