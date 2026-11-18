/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.4 core (pure, no DOM, Node-testable; also loaded by the backtest worker):
   · chart precision: zero-volume forming-bar re-anchoring, OHLCV aggregation, on-chain timeframe plans (1s–1M),
     viewport fit for young tokens, multi-exchange stream failover maths, swap dedupe, anchored VWAP, tape delta,
     order-book micro-imbalance
   · DEX discovery: strictly mode-isolated rows, GMGN-style range filters + safety toggles + presets, group pills,
     top movers / >3x volume surges, buy-pressure barometer, bubble metrics, chain / sector gravity clusters, basket export
   · 6 structural strategy specs (validated + registered into NT.strategies), safe Pine Script v5 templates + checker
   · Copilot: chart structure & liquidity reader, natural language → safe strategy spec, pre-trade stop auditor,
     receipt-ledger leak detector
   · research: strategy node graph → spec, shadow drift, regime switcher, slot router, standalone bot export,
     depth-aware slippage, multi-asset portfolio, event stress windows, walk-forward decay matrix, trade replay markers */
const V164 = (() => {
  const V = {};
  const fin = Number.isFinite;
  const num = (v, d) => (v === '' || v == null || typeof v === 'boolean' || !fin(+v) ? d : +v);
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };

  /* ══ 1. zero-volume bar re-anchoring (1s–15s) ══
     a forming sub-minute bar that saw no trade (v === 0) is moved to the new bucket instead of leaving a flat bar behind */
  V.reanchor = (last, sec, ts) => {
    if (!last || !(sec > 0 && sec < 60) || !fin(ts)) return null;
    const b = Math.floor(ts / sec) * sec; if (b <= last.t) return null;
    return !(last.v > 0) && last.o === last.h && last.h === last.l && last.l === last.c ? { t: b } : null; // a quote-driven bar that moved keeps its slot
  };
  V.applyReanchor = (bars, sec, ts, price, size) => {
    const last = bars[bars.length - 1], r = V.reanchor(last, sec, ts); if (!r) return false;
    last.t = r.t; if (price > 0) { last.c = price; last.h = Math.max(last.h, price); last.l = Math.min(last.l, price); } last.v = (last.v || 0) + (size > 0 ? size : 0);
    return true;
  };
  /* flat zero-volume bars anywhere in a series (what the chart must never show) */
  V.flatZero = (bars) => (bars || []).filter((b, i) => i > 0 && b && !(b.v > 0) && b.o === b.h && b.h === b.l && b.l === b.c).length;

  /* ══ 2. full-depth on-chain candles ══ */
  V.aggregate = (rows, sec) => {
    const out = []; if (!(sec > 0)) return out;
    for (const r of [...(rows || [])].filter((x) => x && fin(x.t) && x.c > 0).sort((a, b) => a.t - b.t)) {
      const t = Math.floor(r.t / sec) * sec, L = out[out.length - 1];
      if (L && L.t === t) { L.h = Math.max(L.h, r.h); L.l = Math.min(L.l, r.l); L.c = r.c; L.v += r.v || 0; }
      else out.push({ t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0 });
    }
    return out;
  };
  /* GeckoTerminal serves minute 1/5/15, hour 1/4/12 and day 1; everything else is aggregated from the nearest finer unit */
  V.OC_PLAN = { 60: ['minute', 1, 1], 300: ['minute', 5, 1], 900: ['minute', 15, 1], 1800: ['minute', 15, 2], 3600: ['hour', 1, 1], 14400: ['hour', 4, 1], 43200: ['hour', 12, 1], 86400: ['day', 1, 1], 604800: ['day', 1, 7], 2592000: ['day', 1, 30] };
  V.ocPlan = (tfSec) => { const p = V.OC_PLAN[tfSec]; if (p) return { unit: p[0], agg: p[1], k: p[2], fetchSec: (p[0] === 'minute' ? 60 : p[0] === 'hour' ? 3600 : 86400) * p[1] }; return tfSec < 60 ? { unit: 'minute', agg: 1, k: 1, fetchSec: 60, sub: true } : null; };
  V.OC_LIMIT = 1000;
  V.ocRaw = (tfSec, n) => { const p = V.ocPlan(tfSec); return p ? Math.min(V.OC_LIMIT, Math.max(2, Math.ceil((n || 300) * (p.k || 1)))) : 0; };
  /* young tokens: fit the viewport to the bars that exist (edge-to-edge) instead of leaving an empty left side */
  V.fitBars = (n, viewBars, minBars) => (n > 0 && n < viewBars ? Math.max(minBars || 12, n) : viewBars);

  /* ══ 3. multi-exchange public trade stream failover ══ */
  V.EX = ['kraken', 'coinbase', 'binance'];
  V.STALL_MS = 1500;
  V.stalled = (lastTs, now, ms) => !fin(lastTs) || now - lastTs > (ms || V.STALL_MS);
  V.nextEx = (current, failed) => { const f = new Set(failed || []); const order = V.EX.filter((x) => x !== current && !f.has(x)); return order[0] || null; };
  V.exSym = (ex, sym) => {
    const m = /^([A-Z0-9]{2,10})-(USD|USDT|USDC|EUR)$/i.exec(String(sym || '')); if (!m) return null; const b = m[1].toUpperCase(), q = m[2].toUpperCase();
    if (ex === 'kraken') return (b === 'BTC' ? 'BTC' : b) + '/' + (q === 'USDT' ? 'USDT' : 'USD');
    if (ex === 'coinbase') return b + '-' + (q === 'USDT' ? 'USDT' : 'USD');
    if (ex === 'binance') return (b + (q === 'USD' ? 'USDT' : q)).toLowerCase();
    return null;
  };
  V.EX_URL = { kraken: 'wss://ws.kraken.com/v2', coinbase: 'wss://ws-feed.exchange.coinbase.com', binance: 'wss://stream.binance.com:9443/ws' };
  V.exSub = (ex, sym) => { const s = V.exSym(ex, sym); if (!s) return null;
    if (ex === 'kraken') return JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: [s] } });
    if (ex === 'coinbase') return JSON.stringify({ type: 'subscribe', product_ids: [s], channels: ['matches'] });
    return JSON.stringify({ method: 'SUBSCRIBE', params: [s + '@trade'], id: 1 }); };
  /* normalise one stream message into [{ price, size, side, ts }] (ts in seconds) */
  V.exParse = (ex, raw) => {
    let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return []; } if (!m || typeof m !== 'object') return [];
    const ok = (p, q) => p > 0 && p < 1e9 && q >= 0 && q < 1e12;
    if (ex === 'kraken') { if (m.channel !== 'trade' || !Array.isArray(m.data)) return []; return m.data.map((d) => ({ price: +d.price, size: +d.qty, side: d.side === 'sell' ? 'sell' : 'buy', ts: Date.parse(d.timestamp) / 1000 })).filter((x) => ok(x.price, x.size) && fin(x.ts)); }
    if (ex === 'coinbase') { if (m.type !== 'match' && m.type !== 'last_match') return []; const x = { price: +m.price, size: +m.size, side: m.side === 'buy' ? 'sell' : 'buy', ts: Date.parse(m.time) / 1000 }; return ok(x.price, x.size) && fin(x.ts) ? [x] : []; } // Coinbase "side" is the maker side
    if (ex === 'binance') { if (m.e !== 'trade') return []; const x = { price: +m.p, size: +m.q, side: m.m ? 'sell' : 'buy', ts: +m.T / 1000 }; return ok(x.price, x.size) && fin(x.ts) ? [x] : []; }
    return [];
  };

  /* ══ 4. fast DEX swap poll: transaction-signature dedupe ══ */
  V.dedupe = (seen, swaps, max) => {
    const out = []; for (const s of swaps || []) { const k = s && String(s.tx || s.id || ''); if (!k || seen.has(k)) continue; seen.add(k); out.push(s); }
    if (seen.size > (max || 5000)) { const keep = [...seen].slice(-Math.floor((max || 5000) / 2)); seen.clear(); for (const k of keep) seen.add(k); }
    return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  };

  /* ══ 5. anchored VWAP, tape delta, book micro-imbalance ══ */
  V.avwap = (bars, from) => {
    const out = new Array((bars || []).length).fill(NaN); let pv = 0, vv = 0;
    for (let i = Math.max(0, from | 0); i < out.length; i++) { const b = bars[i], tp = (b.h + b.l + b.c) / 3, v = b.v > 0 ? b.v : 0; pv += tp * (v || 1e-12); vv += v || 1e-12; out[i] = pv / vv; }
    return out;
  };
  V.anchorIdx = (bars, t) => { let lo = 0, hi = (bars || []).length - 1; if (hi < 0) return -1; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].t < t) lo = m + 1; else hi = m; } return lo; };
  /* swing anchors: the last pivot high / low with `k` bars on each side */
  V.swing = (bars, k, kind) => { const K = k || 5; for (let i = bars.length - 1 - K; i >= K; i--) { let p = true; for (let j = i - K; j <= i + K; j++) if (j !== i && (kind === 'low' ? bars[j].l < bars[i].l : bars[j].h > bars[i].h)) { p = false; break; } if (p) return i; } return -1; };
  V.tapeDelta = (trades, now, winSec) => {
    let b = 0, s = 0; const w = (winSec || 10) * 1000;
    for (const t of trades || []) { if (!t || now - t.ms > w || t.ms > now) continue; const usd = (t.price || 0) * (t.size || 0); if (t.side === 'sell') s += usd; else b += usd; }
    const tot = b + s; return { buy: b, sell: s, delta: b - s, ratio: tot > 0 ? b / tot : null };
  };
  V.imbalance = (book, levels) => {
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return null; const n = levels || 10, sum = (a) => a.slice(0, n).reduce((x, l) => x + (+l[0]) * (+l[1] || 0), 0);
    const b = sum(book.bids), a = sum(book.asks); return b + a > 0 ? { bid: b, ask: a, imb: (b - a) / (b + a) } : null;
  };

  /* ══ 6–14. DEX discovery (strict market-mode isolation) ══ */
  V.MODES = ['crypto', 'stocks', 'onchain'];
  V.modeOf = (id) => (/^oc:/.test(String(id)) ? 'onchain' : /^[A-Z0-9.]{1,6}$/.test(String(id)) ? 'stocks' : /-(USD|USDT|USDC)$/i.test(String(id)) ? 'crypto' : null);
  /* every row carries its mode; a view only ever receives rows of the active mode */
  V.isolate = (rows, mode) => (rows || []).filter((r) => r && r.mode === mode && V.modeOf(r.id) === mode);
  V.CHAINS = ['all', 'solana', 'base', 'eth', 'bsc', 'arbitrum'];
  V.CHAIN_LABEL = { all: 'All', solana: 'Solana', base: 'Base', eth: 'Ethereum', bsc: 'BSC', arbitrum: 'Arbitrum' };
  V.DEXES = ['all', 'pumpfun', 'raydium', 'meteora', 'uniswap', 'pancakeswap'];
  V.DEX_LABEL = { all: 'All DEXes', pumpfun: 'Pump.fun', raydium: 'Raydium', meteora: 'Meteora', uniswap: 'Uniswap', pancakeswap: 'PancakeSwap' };
  V.dexKey = (dexId) => { const d = String(dexId || '').toLowerCase(); return /pump/.test(d) ? 'pumpfun' : /raydium/.test(d) ? 'raydium' : /meteora/.test(d) ? 'meteora' : /uniswap/.test(d) ? 'uniswap' : /pancake/.test(d) ? 'pancakeswap' : 'other'; };
  V.rvol = (vol1h, vol24) => (vol24 > 0 && vol1h >= 0 ? (vol1h * 24) / vol24 : null);
  V.parseAge = (s) => { const m = /^\s*(\d+(?:\.\d+)?)\s*([mhd])?\s*$/i.exec(String(s == null ? '' : s)); if (!m) return null; return +m[1] * ({ m: 60, h: 3600, d: 86400 }[(m[2] || 'm').toLowerCase()]) * 1000; };
  V.FILTER_DEF = () => ({ chain: 'all', dex: 'all', liqMin: '', liqMax: '', mcapMin: '', mcapMax: '', v5Min: '', v1hMin: '', v24Min: '', v24Max: '', ageMin: '', ageMax: '', holdMin: '', bsMin: '', bsMax: '', noMint: false, lpLocked: false, top10: false, smart: false, q: '' });
  V.PRESETS = {
    newLaunches: { label: 'New Launches', f: { ageMax: '6h', liqMin: '5000', v1hMin: '2000' } },
    breakouts: { label: 'High-Liquidity Breakouts', f: { liqMin: '250000', v24Min: '500000', bsMin: '52' } },
    smartMoney: { label: 'Smart-Money Accumulation', f: { smart: true, liqMin: '50000', bsMin: '55' } },
  };
  const rng = (v, lo, hi) => { const a = num(lo, null), b = num(hi, null); if (a == null && b == null) return true; if (!fin(v)) return false; return (a == null || v >= a) && (b == null || v <= b); };
  /* toggles are strict: unknown safety data never passes a safety toggle */
  V.applyFilter = (rows, f, now) => {
    const F = Object.assign(V.FILTER_DEF(), f || {}), t = fin(now) ? now : Date.now(), q = String(F.q || '').trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (r.mode === 'onchain') {
        if (F.chain !== 'all' && r.chain !== F.chain) return false;
        if (F.dex !== 'all' && r.dex !== F.dex) return false;
        const age = r.created ? t - r.created : null, aMin = V.parseAge(F.ageMin), aMax = V.parseAge(F.ageMax);
        if ((aMin != null || aMax != null) && (age == null || (aMin != null && age < aMin) || (aMax != null && age > aMax))) return false;
        if (!rng(r.holders, F.holdMin, null) || !rng(r.bsPct, F.bsMin, F.bsMax) || !rng(r.v5, F.v5Min, null)) return false;
        if (F.noMint && r.mintOff !== true) return false; if (F.lpLocked && r.lpLocked !== true) return false;
        if (F.top10 && !(r.top10 < 25)) return false; if (F.smart && !(r.smartIn > 10000)) return false;
      }
      if (!rng(r.liq, F.liqMin, F.liqMax) || !rng(r.mcap, F.mcapMin, F.mcapMax) || !rng(r.v1h, F.v1hMin, null) || !rng(r.v24, F.v24Min, F.v24Max)) return false;
      if (q && !(String(r.sym).toLowerCase().includes(q) || String(r.name || '').toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q))) return false;
      return true;
    });
  };
  V.filterCount = (f) => { const F = f || {}, d = V.FILTER_DEF(); return Object.keys(d).filter((k) => k !== 'q' && F[k] != null && F[k] !== d[k] && F[k] !== '').length; };
  /* unified pills: All | Top Movers | Volume Surges | <mode groups> */
  V.groups = (rows) => [...new Set((rows || []).map((r) => r.group).filter(Boolean))].sort();
  V.pill = (rows, pill) => {
    if (!pill || pill === 'all') return rows;
    if (pill === 'movers') { const s = [...rows].filter((r) => fin(r.ch)).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)); return s.slice(0, Math.max(10, Math.ceil(s.length * 0.25))); }
    if (pill === 'surges') return rows.filter((r) => r.rvol >= 3);
    return rows.filter((r) => r.group === pill);
  };
  V.movers = (rows, n) => { const R = (rows || []).filter((r) => fin(r.ch)); const k = n || 6; return { gainers: [...R].sort((a, b) => b.ch - a.ch).slice(0, k).filter((r) => r.ch > 0), losers: [...R].sort((a, b) => a.ch - b.ch).slice(0, k).filter((r) => r.ch < 0), surges: (rows || []).filter((r) => r.rvol >= 3).sort((a, b) => b.rvol - a.rvol).slice(0, k) }; };
  /* buy-pressure barometer: taker buy share of volume (or of tx counts) + net aggressive $ delta per window */
  V.pressure = (r) => {
    const win = (b, s, vol) => { if (!(b >= 0) || !(s >= 0) || b + s === 0) return null; const ratio = b / (b + s); return { ratio, pct: ratio * 100, delta: fin(vol) && vol > 0 ? vol * (2 * ratio - 1) : null }; };
    return { m5: win(r.b5, r.s5, r.v5), m15: win(r.b15, r.s15, null), h1: win(r.b1h, r.s1h, r.v1h), h24: win(r.b24, r.s24, r.v24) };
  };
  V.BUB = ['mcap', 'surge', 'whale', 'squeeze'];
  V.BUB_LABEL = { mcap: 'Market Cap', surge: 'Volume Surge', whale: 'Whale Net Flow', squeeze: 'Volatility Squeeze' };
  V.bubbleMetric = (r, k) => {
    if (k === 'surge') return Math.max(0, r.rvol || 0);
    if (k === 'whale') { const p = V.pressure(r).h1 || V.pressure(r).h24; return p && fin(p.delta) ? Math.abs(p.delta) : 0; }
    if (k === 'squeeze') return fin(r.range) && r.range > 0 ? 1 / r.range : 0;
    return Math.max(0, r.mcap || r.v24 || 0);
  };
  V.bubbleColor = (r, k) => { if (k === 'whale') { const p = V.pressure(r).h1 || V.pressure(r).h24; return p ? (p.ratio >= 0.5 ? 1 : -1) * Math.min(1, Math.abs(p.ratio - 0.5) * 4) : 0; } return fin(r.ch) ? Math.max(-1, Math.min(1, r.ch / 10)) : 0; };
  /* gravity clusters: rows pulled toward their group's centre on a circle */
  V.clusters = (rows, W, H) => {
    const gs = V.groups(rows), out = new Map(), cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.32;
    gs.forEach((g, i) => { const a = (i / Math.max(1, gs.length)) * Math.PI * 2 - Math.PI / 2; out.set(g, { x: gs.length > 1 ? cx + Math.cos(a) * R : cx, y: gs.length > 1 ? cy + Math.sin(a) * R : cy }); });
    return out;
  };
  /* export a filtered basket to the Quant Lab portfolio backtester (max 10, mode-pure) */
  V.basket = (rows, mode, max) => { const R = V.isolate(rows, mode); return { mode, symbols: R.slice(0, max || 10).map((r) => r.id), n: Math.min(R.length, max || 10) }; };
  V.spread = (bid, ask) => (bid > 0 && ask >= bid ? ((ask - bid) / ((ask + bid) / 2)) * 1e4 : null);

  /* ══ 15. six structural strategies (specs: validated, backtested, 17-test graded, Pine-exportable, launcher-parity) ══ */
  const o = (k, n, tf) => { const x = { k }; if (n != null) x.n = n; if (tf > 1) x.tf = tf; return x; };
  const v = (x) => ({ k: 'const', v: x }), c = (a, op, b) => ({ a, op, b }), all = (...x) => ({ all: x }), any = (...x) => ({ any: x }), P = o('price'), VOL = o('volume');
  V.STRATS = [
    ['orb', '5m', { name: 'Opening Range Breakout', desc: 'Breaks the prior 6-bar (30-minute on 5m) range above VWAP on above-average volume; out on a close back under VWAP.', entry: all(c(P, 'crossAbove', o('highest', 6)), c(P, '>', o('vwap')), c(VOL, '>', o('volSma', 20))), exit: any(c(P, 'crossBelow', o('vwap'))), risk: { sl: 1.2, tp: 2.4 } }],
    ['avwap_pb', '15m', { name: 'Anchored VWAP Pullback', desc: 'In an EMA 20 > EMA 50 uptrend, a bar dips through VWAP and closes back above it with RSI over 45.', entry: all(c(o('low'), '<', o('vwap')), c(P, '>', o('vwap')), c(o('ema', 20), '>', o('ema', 50)), c(o('rsi', 14), '>', v(45))), exit: any(c(P, 'crossBelow', o('ema', 50))), risk: { sl: 2, trail: 3 } }],
    ['squeeze', '1h', { name: 'Volatility Squeeze Expansion', desc: 'ATR 14 still below ATR 100 (compressed) when price closes through the upper Bollinger band on volume.', entry: all(c(o('atr', 14), '<', o('atr', 100)), c(P, 'crossAbove', o('bbUpper', 20)), c(VOL, '>', o('volSma', 20))), exit: any(c(P, '<', o('bbMid', 20))), risk: { sl: 3, trail: 4 } }],
    ['sweep', '15m', { name: 'Liquidity Sweep and Failed Breakdown Reversal', desc: 'The bar sweeps the prior 20-bar low, then closes back above it while RSI is still weak: trapped sellers fuel the reversal.', entry: all(c(o('low'), '<', o('lowest', 20)), c(P, '>', o('lowest', 20)), c(o('rsi', 14), '<', v(45))), exit: any(c(P, '>', o('highest', 10)), c(o('rsi', 14), '>', v(65))), risk: { sl: 2.5, tp: 5 } }],
    ['zrev', '1h', { name: 'Regime-Filtered Z-Score Mean Reversion', desc: 'Close below the 2-sigma Bollinger band (z < −2) only in a ranging regime (ADX 14 < 20); out at the mean.', entry: all(c(P, '<', o('bbLower', 20)), c(o('adx', 14), '<', v(20))), exit: any(c(P, '>', o('bbMid', 20))), risk: { sl: 3 } }],
    ['basis', '1h', { name: 'Funding-Rate and Perp Basis Divergence', dir: 'short', desc: 'Crowded-long proxy (candles carry no funding history): +6% over 24 bars, RSI rolling over from 70 and a negative MACD histogram. Live, confirm with the funding pill.', entry: all(c(o('change', 24), '>', v(6)), c(o('rsi', 14), 'crossBelow', v(70)), c(o('macdHist'), '<', v(0))), exit: any(c(o('rsi', 14), '<', v(45))), risk: { sl: 3, tp: 6 } }],
  ];
  V.STRAT_CAT = 'Structural (v16.4)';
  V.register = (NT) => {
    if (!NT || !NT.Spec || !NT.strategies) return [];
    const SP = NT.Spec, ids = [];
    for (const [id, tf, raw] of V.STRATS) {
      const val = SP.validate(Object.assign({ v: 1, author: 'ExTerm' }, raw)); if (!val.ok) throw new Error('v16.4 strategy ' + id + ': ' + val.errors[0]);
      NT.strategies['q5_' + id] = Object.assign(SP.compile(val.spec), { name: '★ ' + val.spec.name + (val.spec.dir === 'short' ? ' (short)' : ''), cat: V.STRAT_CAT, pack: 5, pro: true, custom: false, tfHint: tf, pine: true, spec: val.spec });
      ids.push('q5_' + id);
    }
    NT.PACK5 = ids; if (Array.isArray(NT.STRAT_CATS) && !NT.STRAT_CATS.includes(V.STRAT_CAT)) NT.STRAT_CATS.push(V.STRAT_CAT);
    return ids;
  };

  /* ══ safe Pine Script v5 templates ══ */
  V.PINE_RULES = [['barstate.isconfirmed', /barstate\.isconfirmed/], ['lookahead_off', /lookahead\s*=\s*barmerge\.lookahead_off/], ['$ risk sizing', /riskUsd/], ['strategy.exit stop-loss', /strategy\.exit\([^)]*stop\s*=/], ['max_intraday_loss', /strategy\.risk\.max_intraday_loss\(/], ['127.0.0.1 webhook JSON', /alert_message|alert\(/]];
  V.pineCheck = (src) => { const s = String(src || ''); const rows = V.PINE_RULES.map(([k, rx]) => ({ k, ok: rx.test(s) })); return { ok: rows.every((r) => r.ok), rows, repaint: /request\.security\([^)]*lookahead\s*=\s*barmerge\.lookahead_on/.test(s) }; };
  const PINE_ENTRY = {
    orb: { cond: 'ta.crossover(close, ta.highest(high, 6)[1]) and close > ta.vwap and volume > ta.sma(volume, 20)', exit: 'ta.crossunder(close, ta.vwap)', sl: 1.2, tp: 2.4 },
    avwap_pb: { cond: 'low < ta.vwap and close > ta.vwap and ta.ema(close, 20) > ta.ema(close, 50) and ta.rsi(close, 14) > 45', exit: 'ta.crossunder(close, ta.ema(close, 50))', sl: 2, tp: 4 },
    squeeze: { cond: 'ta.atr(14) < ta.atr(100) and ta.crossover(close, ta.sma(close, 20) + 2 * ta.stdev(close, 20)) and volume > ta.sma(volume, 20)', exit: 'close < ta.sma(close, 20)', sl: 3, tp: 6 },
    sweep: { cond: 'low < ta.lowest(low, 20)[1] and close > ta.lowest(low, 20)[1] and ta.rsi(close, 14) < 45', exit: 'close > ta.highest(high, 10)[1] or ta.rsi(close, 14) > 65', sl: 2.5, tp: 5 },
    zrev: { cond: '(close - ta.sma(close, 20)) / ta.stdev(close, 20) < -2 and adxValue < 20', exit: 'close > ta.sma(close, 20)', sl: 3, tp: 3 },
    htfTrend: { cond: 'close > htfEma and ta.crossover(ta.rsi(close, 14), 40)', exit: 'ta.rsi(close, 14) > 75 or close < htfEma', sl: 3, tp: 6 },
  };
  V.PINE_LIB = Object.keys(PINE_ENTRY);
  V.PINE_NAME = { orb: 'Opening Range Breakout', avwap_pb: 'Anchored VWAP Pullback', squeeze: 'Volatility Squeeze Expansion', sweep: 'Liquidity Sweep Reversal', zrev: 'Regime-Filtered Z-Score Reversion', htfTrend: 'Higher-Timeframe Trend Pullback (no look-ahead)' };
  V.pine = (key, opt) => {
    const e = PINE_ENTRY[key]; if (!e) return '';
    const O = Object.assign({ risk: 100, maxLoss: 300, slot: 1, port: 8765 }, opt || {}), title = V.PINE_NAME[key];
    return `//@version=5
// ${title} · ExTerm safe template: confirmed bars only, no look-ahead, $ risk sizing, mandatory stop-loss
strategy("${title} (ExTerm)", overlay = true, process_orders_on_close = true, default_qty_type = strategy.fixed, initial_capital = 10000, commission_type = strategy.commission.percent, commission_value = 0.1, slippage = 2)
riskUsd   = input.float(${O.risk}, "Risk per trade ($)", minval = 1)
slPct     = input.float(${e.sl}, "Stop-loss %", minval = 0.1)
tpPct     = input.float(${e.tp}, "Take-profit %", minval = 0.1)
strategy.risk.max_intraday_loss(${O.maxLoss}, strategy.cash)
htfEma    = request.security(syminfo.tickerid, "240", ta.ema(close, 50)[1], lookahead = barmerge.lookahead_off)
[_, _, adxValue] = ta.dmi(14, 14)
longOk    = barstate.isconfirmed and strategy.position_size == 0 and (${e.cond})
stopPx    = close * (1 - slPct / 100)
qty       = riskUsd / math.max(close - stopPx, syminfo.mintick)
if longOk
    strategy.entry("L", strategy.long, qty = qty, alert_message = '{"app":"ExTerm","action":"buy","symbol":"' + syminfo.ticker + '","price":' + str.tostring(close) + ',"sl":' + str.tostring(stopPx) + ',"usd":' + str.tostring(qty * close) + ',"slot":${O.slot}}')
strategy.exit("L-exit", "L", stop = strategy.position_avg_price * (1 - slPct / 100), limit = strategy.position_avg_price * (1 + tpPct / 100))
if barstate.isconfirmed and strategy.position_size > 0 and (${e.exit})
    strategy.close("L", comment = "rule exit")
// Webhook: point the alert at a local relay on 127.0.0.1:${O.port} that forwards to an ExTerm slot. Message: {{strategy.order.alert_message}}
`;
  };

  /* ══ 16. Copilot: chart reader, NL → safe spec, pre-trade auditor, ledger leak detector ══ */
  V.atr = (b, n) => { const N = n || 14; if (!b || b.length < N + 1) return null; let s = 0; for (let i = b.length - N; i < b.length; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); return s / N; };
  V.ema = (xs, n) => { const k = 2 / (n + 1); let e = null; const out = []; for (const x of xs) { e = e == null ? x : x * k + e * (1 - k); out.push(e); } return out; };
  V.pivots = (b, k) => { const hi = [], lo = []; const K = k || 3; for (let i = K; i < b.length - K; i++) { let h = true, l = true; for (let j = i - K; j <= i + K; j++) { if (j === i) continue; if (b[j].h >= b[i].h) h = false; if (b[j].l <= b[i].l) l = false; } if (h) hi.push({ i, p: b[i].h }); if (l) lo.push({ i, p: b[i].l }); } return { hi, lo }; };
  V.readChart = (bars) => {
    const b = (bars || []).filter((x) => x && x.c > 0); if (b.length < 30) return null;
    const cl = b.map((x) => x.c), e20 = V.ema(cl, 20), e50 = V.ema(cl, 50), n = b.length - 1, last = cl[n], atr = V.atr(b, 14), pv = V.pivots(b, 3);
    const H = pv.hi.slice(-2), L = pv.lo.slice(-2), hh = H.length === 2 && H[1].p > H[0].p, hl = L.length === 2 && L[1].p > L[0].p, lh = H.length === 2 && H[1].p < H[0].p, ll = L.length === 2 && L[1].p < L[0].p;
    const structure = hh && hl ? 'uptrend (higher highs & higher lows)' : lh && ll ? 'downtrend (lower highs & lower lows)' : 'range / transition';
    const tol = (atr || last * 0.002) * 0.25, eq = (arr) => { const out = []; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (Math.abs(arr[i].p - arr[j].p) <= tol) out.push((arr[i].p + arr[j].p) / 2); return [...new Set(out.map((x) => +x.toPrecision(8)))].slice(-3); };
    const res = pv.hi.filter((x) => x.p > last).map((x) => x.p).sort((a, c2) => a - c2)[0] || null, sup = pv.lo.filter((x) => x.p < last).map((x) => x.p).sort((a, c2) => c2 - a)[0] || null;
    const trend = e20[n] > e50[n] && last > e20[n] ? 'bullish' : e20[n] < e50[n] && last < e20[n] ? 'bearish' : 'neutral', volPct = atr ? (atr / last) * 100 : null;
    return { trend, structure, last, atr, atrPct: volPct, support: sup, resistance: res, eqHighs: eq(pv.hi), eqLows: eq(pv.lo), ema20: e20[n], ema50: e50[n],
      regime: V.regime(b), summary: `${trend} · ${structure}${sup ? ' · support ' + (+sup.toPrecision(6)) : ''}${res ? ' · resistance ' + (+res.toPrecision(6)) : ''}${volPct ? ' · ATR ' + volPct.toFixed(2) + '%' : ''}` };
  };
  /* natural language → strategy spec (a safe, validated subset; unknown phrases are reported, never guessed) */
  V.nlToSpec = (text) => {
    const t = String(text || '').toLowerCase(), entry = [], exit = [], notes = []; let dir = /\bshort\b/.test(t) ? 'short' : 'long';
    const N = (m, d) => (m && m[1] != null ? +m[1] : d);
    let m;
    if ((m = /rsi(?:\s*\(?(\d+)\)?)?\s*(?:is\s*)?(?:below|under|<)\s*(\d+)/.exec(t))) entry.push(c(o('rsi', N(m, 14) || 14), '<', v(+m[2])));
    if ((m = /rsi(?:\s*\(?(\d+)\)?)?\s*(?:is\s*)?(?:above|over|>)\s*(\d+)/.exec(t))) (entry.length ? exit : entry).push(c(o('rsi', N(m, 14) || 14), '>', v(+m[2])));
    if ((m = /(?:price|close)?\s*(?:crosses|breaks)\s*above\s*(?:the\s*)?(ema|sma)\s*(\d+)/.exec(t))) entry.push(c(P, 'crossAbove', o(m[1], +m[2])));
    if ((m = /(?:price|close)?\s*(?:is\s*)?above\s*(?:the\s*)?(ema|sma)\s*(\d+)/.exec(t.replace(/(?:crosses|breaks)\s*above\s*(?:the\s*)?(?:ema|sma)\s*\d+/g, '')))) entry.push(c(P, '>', o(m[1], +m[2])));
    if ((m = /(?:price|close)?\s*(?:crosses|falls|drops)\s*below\s*(?:the\s*)?(ema|sma)\s*(\d+)/.exec(t))) exit.push(c(P, 'crossBelow', o(m[1], +m[2])));
    if (/\bvwap\b/.test(t)) { if (/above\s*(?:the\s*)?vwap|reclaim/.test(t)) entry.push(c(P, '>', o('vwap'))); if (/below\s*(?:the\s*)?vwap/.test(t)) exit.push(c(P, 'crossBelow', o('vwap'))); }
    if ((m = /(?:breakout|breaks?)\s*(?:of|above)?\s*(?:the\s*)?(\d+)[-\s]*bar\s*high/.exec(t))) entry.push(c(P, '>', o('highest', +m[1])));
    if (/volume\s*(?:spike|surge|above average|>\s*average)/.test(t)) entry.push(c(VOL, '>', o('volSma', 20)));
    if ((m = /macd\s*(?:crosses\s*)?above\s*(?:the\s*)?signal/.exec(t))) entry.push(c(o('macd'), 'crossAbove', o('macdSignal')));
    if (/bollinger|lower band/.test(t) && /below|under/.test(t)) entry.push(c(P, '<', o('bbLower', 20)));
    const risk = {}; if ((m = /stop(?:[-\s]*loss)?\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%/.exec(t))) risk.sl = +m[1]; if ((m = /(?:target|take[-\s]*profit|tp)\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%/.exec(t))) risk.tp = +m[1]; if ((m = /trail(?:ing)?\s*(?:stop)?\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%/.exec(t))) risk.trail = +m[1];
    if (!risk.sl) { risk.sl = 2; notes.push('No stop-loss given: a 2% stop was added (every ExTerm strategy carries a stop).'); }
    if (!entry.length) return { ok: false, why: 'No entry rule recognised. Try: "buy when RSI 14 is below 30 and price is above the SMA 200, stop 3%, target 6%".' };
    if (!exit.length) { exit.push(c(o('rsi', 14), '>', v(dir === 'short' ? 30 : 70))); notes.push('No exit rule given: exits when RSI 14 crosses back through 70 (30 for shorts).'); }
    const spec = { v: 1, name: 'Copilot: ' + String(text).trim().slice(0, 40), desc: String(text).trim().slice(0, 200), entry: { all: entry }, exit: { any: exit }, risk };
    if (dir === 'short') spec.dir = 'short';
    return { ok: true, spec, notes };
  };
  /* pre-trade setup & stop-loss sanity: ATR-relative stop distance, R:R, correlation with open risk */
  V.audit = (x) => {
    const r = [], e = +x.entry, sl = +x.sl, tp = +x.tp, atr = +x.atr, side = x.side === 'short' ? -1 : 1;
    const add = (lvl, k, why) => r.push({ lvl, k, why });
    if (!(sl > 0)) add('bad', 'No stop-loss', 'Every live opening order needs a stop (Require Stop-Loss).');
    else if ((sl - e) * side >= 0) add('bad', 'Stop on the wrong side', side > 0 ? 'A long stop must sit below entry.' : 'A short stop must sit above entry.');
    else if (atr > 0) { const k = Math.abs(e - sl) / atr; if (k < 0.75) add('warn', 'Stop inside the noise', `Stop is ${k.toFixed(2)} ATR away: normal volatility will likely hit it. Consider 1.5 ATR (${(+(e - side * 1.5 * atr).toPrecision(8))}).`); else if (k > 4) add('warn', 'Very wide stop', `Stop is ${k.toFixed(1)} ATR away: size down to keep $ risk constant.`); else add('ok', 'Stop distance', `${k.toFixed(2)} ATR: outside normal noise.`); }
    if (tp > 0 && sl > 0) { const rr = Math.abs(tp - e) / Math.abs(e - sl); add(rr >= 1.5 ? 'ok' : 'warn', 'Reward : risk', `${rr.toFixed(2)} : 1${rr < 1.5 ? ' (below 1.5 : 1)' : ''}`); }
    if (fin(+x.corr) && x.corr > 0.85) add('warn', 'Correlated with an open position', `r = ${(+x.corr).toFixed(2)} with ${x.corrSym || 'an open position'}: this mostly doubles the same bet.`);
    if (fin(+x.riskPct) && x.riskPct > 2) add('warn', 'Risk per trade', `${(+x.riskPct).toFixed(2)}% of equity at the stop (above 2%).`);
    return { rows: r, ok: !r.some((z) => z.lvl === 'bad'), stop15: atr > 0 && e > 0 ? e - side * 1.5 * atr : null };
  };
  /* post-session receipt-ledger leak detector */
  V.leaks = (rows, fills) => {
    const L = (rows || []).filter((x) => x && typeof x === 'object'), out = [], add = (k, n, why) => { if (n) out.push({ k, n, why }); };
    const blocked = L.filter((x) => x.kind === 'breaker'), byWhy = {}; for (const b of blocked) { const w = String(b.detail || '').split(':').slice(1).join(':').trim().split(' ').slice(0, 2).join(' ') || b.status; byWhy[w] = (byWhy[w] || 0) + 1; }
    const top = Object.entries(byWhy).sort((a, b) => b[1] - a[1])[0];
    add('Repeated blocks', top && top[1] >= 3 ? top[1] : 0, top ? `"${top[0]}" blocked ${top[1]}× : fix the setup instead of retrying.` : '');
    add('Failed sends', L.filter((x) => /failed|missed/.test(String(x.status))).length, 'Signals or heartbeats that never reached the bot.');
    const sl = (fills || []).filter((f) => fin(f.bps) && f.bps > 10); add('High slippage fills', sl.length, 'Fills more than 10 bps worse than the signal price.');
    const sig = L.filter((x) => x.kind === 'signal').map((x) => x.ts).sort((a, b) => a - b); let burst = 0; for (let i = 2; i < sig.length; i++) if (sig[i] - sig[i - 2] < 60000) burst++;
    add('Overtrading bursts', burst, '3+ live signals inside one minute (possible revenge or fat-finger trading).');
    add('Stop-loss refusals', L.filter((x) => /stop-loss/i.test(String(x.detail))).length, 'Opening orders sent without a valid stop.');
    return { findings: out, clean: !out.length };
  };

  /* ══ 17. research & bots ══ */
  /* drag-and-drop node graph → spec: nodes { id, type: 'entry'|'exit'|'cond'|'risk', join: 'all'|'any', a, op, b, risk } */
  V.nodesToSpec = (name, nodes) => {
    const N = nodes || [], cond = (x) => ({ a: x.a, op: x.op, b: x.b }), en = N.filter((x) => x.type === 'cond' && x.parent === 'entry'), ex = N.filter((x) => x.type === 'cond' && x.parent === 'exit');
    const je = (N.find((x) => x.type === 'entry') || {}).join === 'any' ? 'any' : 'all', jx = (N.find((x) => x.type === 'exit') || {}).join === 'all' ? 'all' : 'any', rk = (N.find((x) => x.type === 'risk') || {}).risk || { sl: 2 };
    return { v: 1, name: String(name || '').trim().length >= 2 ? String(name).trim().slice(0, 48) : 'Node strategy', entry: { [je]: en.map(cond) }, exit: { [jx]: ex.map(cond) }, risk: Object.assign({ sl: 2 }, rk) };
  };
  V.drift = (paper, live) => {
    const P = (paper || []).filter((x) => x && x.price > 0), Lx = (live || []).filter((x) => x && x.price > 0); if (!P.length || !Lx.length) return null;
    const pairs = []; for (const l of Lx) { let best = null; for (const p of P) if (p.sym === l.sym && p.side === l.side && (!best || Math.abs(p.ts - l.ts) < Math.abs(best.ts - l.ts))) best = p; if (best && Math.abs(best.ts - l.ts) < 120000) pairs.push({ bps: ((l.price - best.price) / best.price) * 1e4 * (l.side === 'sell' ? -1 : 1), lag: l.ts - best.ts }); }
    if (!pairs.length) return null; const b = pairs.map((x) => x.bps); return { n: pairs.length, bps: mean(b), worst: Math.max(...b), lagMs: mean(pairs.map((x) => x.lag)), alert: mean(b) > 15 };
  };
  V.regime = (bars) => {
    const b = (bars || []).filter((x) => x && x.c > 0); if (b.length < 60) return 'unknown';
    const cl = b.map((x) => x.c), n = cl.length - 1, rets = []; for (let i = n - 49; i <= n; i++) rets.push(Math.log(cl[i] / cl[i - 1]));
    const vol = sd(rets), longVol = (() => { const r = []; for (let i = 1; i <= n; i++) r.push(Math.log(cl[i] / cl[i - 1])); return sd(r); })(), eff = Math.abs(cl[n] - cl[n - 49]) / rets.reduce((s, x, i) => s + Math.abs(cl[n - 49 + i] - cl[n - 50 + i]), 0 || 1);
    if (longVol > 0 && vol > longVol * 1.6) return 'volatile'; return eff > 0.35 ? 'trend' : 'range';
  };
  V.pickBot = (regime, map) => (map && map[regime]) || null;
  /* multi-slot router: each strategy id → the slot that receives its signals */
  V.route = (routes, stratId, fallback) => { const r = routes && routes[stratId]; return r >= 1 && r <= 6 ? r : fallback || 1; };
  /* standalone local bot export (Python or Node) for the spec subset */
  const PY_IND = { price: 'c', open: 'o', high: 'h', low: 'l', volume: 'v' };
  V.BOT_OPS = ['price', 'open', 'high', 'low', 'volume', 'ema', 'sma', 'rsi', 'highest', 'lowest', 'change', 'volSma', 'const'];
  V.botSupported = (spec) => { const ops = []; const walk = (g) => { for (const x of (g.all || g.any || [])) ops.push(x.a.k, x.b.k); }; walk(spec.entry); walk(spec.exit); const bad = ops.filter((k) => !V.BOT_OPS.includes(k)); return { ok: !bad.length, bad: [...new Set(bad)] }; };
  V.exportBot = (spec, lang) => {
    const sup = V.botSupported(spec); if (!sup.ok) return { ok: false, why: 'Not yet exportable: ' + sup.bad.join(', ') + '. Supported: ' + V.BOT_OPS.join(', ') };
    const ex = (x) => { const k = x.k; if (k === 'const') return String(x.v); if (PY_IND[k]) return `S["${k}"]`; return `S["${k}${x.n || ''}"]`; };
    const cmp = (x, py) => {
      const a = ex(x.a), b = ex(x.b), A = (i) => (x.a.k === 'const' ? a : a + '[' + i + ']'), B = (i) => (x.b.k === 'const' ? b : b + '[' + i + ']'), and = py ? 'and' : '&&';
      if (x.op === 'crossAbove') return `(${A('i-1')} <= ${B('i-1')} ${and} ${A('i')} > ${B('i')})`;
      if (x.op === 'crossBelow') return `(${A('i-1')} >= ${B('i-1')} ${and} ${A('i')} < ${B('i')})`;
      return `(${A('i')} ${x.op} ${B('i')})`;
    };
    const grp = (g, py) => { const k = g.all ? 'all' : 'any', j = k === 'all' ? (py ? ' and ' : ' && ') : (py ? ' or ' : ' || '); return '(' + (g[k] || []).map((x) => cmp(x, py)).join(j) + ')'; };
    const need = new Set(); const walk = (g) => { for (const x of (g.all || g.any || [])) for (const s of [x.a, x.b]) if (!PY_IND[s.k] && s.k !== 'const') need.add(s.k + ':' + (s.n || '')); }; walk(spec.entry); walk(spec.exit);
    const sl = spec.risk && spec.risk.sl ? spec.risk.sl : 2;
    if (lang === 'node') {
      const ind = [...need].map((k) => { const [op, n] = k.split(':'); return `  S["${op}${n}"] = IND.${op}(bars, ${n || 0});`; }).join('\n');
      return { ok: true, file: 'exterm-bot.js', code: `// ExTerm standalone bot · ${spec.name} · paper signals by default; stop-loss ${sl}% on every entry
// node exterm-bot.js bars.json   (bars: [{t,o,h,l,c,v}] oldest first)
const fs = require('fs');
const IND = {
  ema: (b, n) => { const k = 2 / (n + 1); let e = null; return b.map((x) => (e = e == null ? x.c : x.c * k + e * (1 - k))); },
  sma: (b, n) => b.map((_, i) => (i + 1 < n ? NaN : b.slice(i + 1 - n, i + 1).reduce((s, x) => s + x.c, 0) / n)),
  volSma: (b, n) => b.map((_, i) => (i + 1 < n ? NaN : b.slice(i + 1 - n, i + 1).reduce((s, x) => s + x.v, 0) / n)),
  rsi: (b, n) => { let g = 0, l = 0; return b.map((x, i) => { if (!i) return NaN; const d = x.c - b[i - 1].c; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; return i < n ? NaN : l === 0 ? 100 : 100 - 100 / (1 + g / l); }); },
  highest: (b, n) => b.map((_, i) => (i < n ? NaN : Math.max(...b.slice(i - n, i).map((x) => x.h)))),
  lowest: (b, n) => b.map((_, i) => (i < n ? NaN : Math.min(...b.slice(i - n, i).map((x) => x.l)))),
  change: (b, n) => b.map((x, i) => (i < n ? NaN : (x.c / b[i - n].c - 1) * 100)),
};
const bars = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), S = { c: bars.map((x) => x.c), o: bars.map((x) => x.o), h: bars.map((x) => x.h), l: bars.map((x) => x.l), v: bars.map((x) => x.v) };
S.price = S.c; S.open = S.o; S.high = S.h; S.low = S.l; S.volume = S.v;
${ind}
let inPos = false;
for (let i = 1; i < bars.length; i++) {
  if (!inPos && ${grp(spec.entry, false)}) { inPos = true; console.log(JSON.stringify({ t: bars[i].t, action: 'buy', price: bars[i].c, sl: +(bars[i].c * ${(1 - sl / 100).toFixed(6)}).toPrecision(10) })); }
  else if (inPos && ${grp(spec.exit, false)}) { inPos = false; console.log(JSON.stringify({ t: bars[i].t, action: 'sell', price: bars[i].c })); }
}
` };
    }
    const ind = [...need].map((k) => { const [op, n] = k.split(':'); return `S["${op}${n}"] = IND["${op}"](bars, ${n || 0})`; }).join('\n');
    return { ok: true, file: 'exterm_bot.py', code: `# ExTerm standalone bot · ${spec.name} · paper signals by default; stop-loss ${sl}% on every entry
# python exterm_bot.py bars.json   (bars: [{"t","o","h","l","c","v"}] oldest first)
import json, sys
def ema(b, n):
    k, e, out = 2 / (n + 1), None, []
    for x in b: e = x["c"] if e is None else x["c"] * k + e * (1 - k); out.append(e)
    return out
def sma(b, n): return [float("nan") if i + 1 < n else sum(x["c"] for x in b[i + 1 - n:i + 1]) / n for i in range(len(b))]
def volSma(b, n): return [float("nan") if i + 1 < n else sum(x["v"] for x in b[i + 1 - n:i + 1]) / n for i in range(len(b))]
def rsi(b, n):
    g = l = 0.0; out = [float("nan")]
    for i in range(1, len(b)):
        d = b[i]["c"] - b[i - 1]["c"]; g = (g * (n - 1) + max(d, 0)) / n; l = (l * (n - 1) + max(-d, 0)) / n
        out.append(float("nan") if i < n else 100.0 if l == 0 else 100 - 100 / (1 + g / l))
    return out
def highest(b, n): return [float("nan") if i < n else max(x["h"] for x in b[i - n:i]) for i in range(len(b))]
def lowest(b, n): return [float("nan") if i < n else min(x["l"] for x in b[i - n:i]) for i in range(len(b))]
def change(b, n): return [float("nan") if i < n else (b[i]["c"] / b[i - n]["c"] - 1) * 100 for i in range(len(b))]
IND = {"ema": ema, "sma": sma, "volSma": volSma, "rsi": rsi, "highest": highest, "lowest": lowest, "change": change}
bars = json.load(open(sys.argv[1]))
S = {k: [x[k[0]] for x in bars] for k in ("c", "o", "h", "l", "v")}
S.update({"price": S["c"], "open": S["o"], "high": S["h"], "low": S["l"], "volume": S["v"]})
${ind}
in_pos = False
for i in range(1, len(bars)):
    if not in_pos and ${grp(spec.entry, true)}:
        in_pos = True; print(json.dumps({"t": bars[i]["t"], "action": "buy", "price": bars[i]["c"], "sl": bars[i]["c"] * ${(1 - sl / 100).toFixed(6)}}))
    elif in_pos and ${grp(spec.exit, true)}:
        in_pos = False; print(json.dumps({"t": bars[i]["t"], "action": "sell", "price": bars[i]["c"]}))
` };
  };
  /* order-book depth & dynamic slippage: square-root market impact on top of the fixed slippage */
  V.impactBps = (usd, depthUsd, k) => (usd > 0 && depthUsd > 0 ? (k || 25) * Math.sqrt(usd / depthUsd) : 0);
  V.slipAdjust = (trades, depthUsd, k) => {
    let cost = 0; const out = (trades || []).map((t) => { const bps = V.impactBps(t.usd, depthUsd, k), c2 = (t.usd || 0) * bps / 1e4; cost += c2; return Object.assign({}, t, { impactBps: bps, impactUsd: c2 }); });
    return { trades: out, cost, avgBps: out.length ? mean(out.map((x) => x.impactBps)) : 0 };
  };
  /* multi-asset portfolio: equal-weight equity curves (aligned by index) + correlation matrix */
  V.portfolio = (curves) => {
    const C = (curves || []).filter((x) => x && Array.isArray(x.eq) && x.eq.length > 2).slice(0, 10); if (!C.length) return null;
    const n = Math.min(...C.map((x) => x.eq.length)), eq = []; for (let i = 0; i < n; i++) eq.push(mean(C.map((x) => x.eq[x.eq.length - n + i] / x.eq[x.eq.length - n])) * 10000);
    const rets = C.map((x) => { const e = x.eq.slice(-n), r = []; for (let i = 1; i < n; i++) r.push(e[i] / e[i - 1] - 1); return r; });
    const corr = rets.map((a) => rets.map((b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0; }));
    let peak = -Infinity, dd = 0; for (const x of eq) { peak = Math.max(peak, x); dd = Math.max(dd, (peak - x) / peak); }
    const pr = []; for (let i = 1; i < eq.length; i++) pr.push(eq[i] / eq[i - 1] - 1);
    return { eq, ret: (eq[eq.length - 1] / eq[0] - 1) * 100, maxDD: dd * 100, sharpe: sd(pr) > 0 ? (mean(pr) / sd(pr)) * Math.sqrt(252) : 0, corr, syms: C.map((x) => x.sym), avgCorr: (() => { const v2 = []; for (let i = 0; i < corr.length; i++) for (let j = i + 1; j < corr.length; j++) v2.push(corr[i][j]); return v2.length ? mean(v2) : 0; })() };
  };
  /* event-window & macro stress: transform a candle window; deterministic */
  V.STRESS = { crash: 'Flash Crash (−15% in 5 bars, half recovered)', fomc: 'FOMC (3× range for 12 bars, whipsaw)', weekend: 'Thin Weekend (gaps + 2× wicks, half volume)' };
  V.stress = (bars, kind, at) => {
    const b = (bars || []).map((x) => Object.assign({}, x)); if (b.length < 30) return b; const s = Math.max(1, Math.min(b.length - 25, at == null ? Math.floor(b.length * 0.6) : at));
    const scaleFrom = (i, f) => { for (let j = i; j < b.length; j++) { b[j].o *= f; b[j].h *= f; b[j].l *= f; b[j].c *= f; } };
    if (kind === 'crash') { for (let k = 0; k < 5; k++) { const f = 0.968; b[s + k].l *= 0.97; scaleFrom(s + k, f); } for (let k = 5; k < 15; k++) scaleFrom(s + k, 1.0083); }
    else if (kind === 'fomc') { for (let k = 0; k < 12; k++) { const x = b[s + k], mid = (x.h + x.l) / 2, r = (x.h - x.l) * 1.5 + mid * 0.002; x.h = mid + r; x.l = Math.max(mid * 0.5, mid - r); x.c = k % 2 ? x.l + (x.h - x.l) * 0.8 : x.l + (x.h - x.l) * 0.2; x.v *= 3; } }
    else if (kind === 'weekend') { for (let k = 0; k < 20; k++) { const x = b[s + k], w = (x.h - x.l); x.h += w; x.l = Math.max(x.l * 0.5, x.l - w); x.v *= 0.5; if (k % 6 === 0) scaleFrom(s + k, k % 12 === 0 ? 1.012 : 0.988); } }
    for (const x of b) { x.h = Math.max(x.h, x.o, x.c); x.l = Math.min(x.l, x.o, x.c); }
    return b;
  };
  /* walk-forward rolling out-of-sample decay: in-sample vs next-window out-of-sample return per fold */
  V.decay = (runOn, bars, folds) => {
    const k = folds || 5, n = (bars || []).length, w = Math.floor(n / (k + 1)); if (w < 30) return null; const rows = [];
    for (let i = 0; i < k; i++) { const ins = bars.slice(i * w, (i + 1) * w), oos = bars.slice((i + 1) * w, (i + 2) * w), a = runOn(ins), b2 = runOn(oos); rows.push({ fold: i + 1, inRet: a.ret, outRet: b2.ret, inSharpe: a.sharpe, outSharpe: b2.sharpe, decay: fin(a.sharpe) && a.sharpe !== 0 ? 1 - b2.sharpe / a.sharpe : null }); }
    const d = rows.map((r) => r.decay).filter(fin); return { rows, avgDecay: d.length ? mean(d) : null, oosPositive: rows.filter((r) => r.outRet > 0).length };
  };
  /* backtest trade replay → chart markers */
  V.markers = (trades, t0) => (trades || []).filter((t) => t && t.price > 0 && fin(t.ts)).map((t) => ({ t: t.ts > 1e12 ? t.ts / 1000 : t.ts, price: t.price, side: t.side, pnl: t.pnl, label: t.side === 'buy' ? 'B' : (t.pnl >= 0 ? '+' : '') + (fin(t.pnlPct) ? (t.pnlPct * 100).toFixed(1) + '%' : '') })).filter((m) => !t0 || m.t >= t0);

  V.HIGHLIGHTS = [
    'Zero-volume bar re-anchoring, full-depth on-chain candles on every timeframe (1s–1M), multi-exchange stream failover and a 500 ms DEX swap poller',
    'DEX tab Discovery: strictly isolated Crypto / Stocks / On-chain datasets across Scanner, Tiles, Bubbles and Buy Pressure, GMGN-style filters, presets, top movers and basket export',
    'Anchored VWAP (click to anchor), live tape delta and book micro-imbalance strip on the chart',
    '6 structural strategies graded by the 17-test lab, safe Pine Script v5 templates, a context-aware Copilot and a realistic backtester (depth slippage, portfolio, stress, decay, replay)',
    'Still here from v16.3: the Floating Live Execution HUD, two-way ACK + fill sync with Interactive Brokers / Alpaca / CCXT / Freqtrade starter bridges, Require Stop-Loss ON by default and Two-Key Arming',
  ];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V164;
/* self-register the structural strategies wherever the strategy engine is loaded (page and backtest worker) */
if (typeof self !== 'undefined' && self.NT && self.NT.Spec) { try { V164.register(self.NT); } catch (e) { /* surfaced by the unit suite */ } }
