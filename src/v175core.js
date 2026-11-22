/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.5 core (pure, no DOM; runs on the main thread, in the 8 Web Worker lanes and in Node), unit-tested in test/v175.test.js.
   · mesh       8 browser lanes + 4 server lanes, op → lane routing, Float64Array pack / unpack, per-lane latency telemetry
   · symbols    classify any query: US stock · crypto pair · perp · EVM CA · Solana CA
   · squad      HUNTER-α · SNIPER-EXEC · SCALPER-EXIT · RISK-GUARD · MUTATOR-EVO · HEDGER-ARB fed 1:1 by real bus events;
                demo events only when "Explore Live Demo" is on and no real bot is running (never mixed)
   · layers     main-chart 3D layer registry: exactly 3 on by default (OB Prisms · VPVR / POC · Whale Beacons)
   · shock      156 scenarios (6 categories × 26), model order book, book-walk shock simulator, position / bot stress test
   · engines    30 deterministic quant / execution engines (catalogue in V.ENGINES) */
const V175 = (() => {
  const V = {};
  const fin = Number.isFinite, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / (a.length - 1)); };
  const quant = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(), p = clamp(q, 0, 1) * (s.length - 1), i = Math.floor(p), f = p - i; return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i]; };
  V.util = { fin, clamp, sum, mean, sd, quant };
  V.VERSION = '17.5';
  /* exact pre-v17.0 palette (v16.6 dock + launcher): Obsidian #07080B / #0D1117 · Bullion Gold #F5C84B */
  V.PAL = Object.freeze({ obs: '#07080B', panel: '#0D1117', gold: '#F5C84B', up: '#2fd08a', dn: '#ff5a5f', mut: '#9a917a', ink: '#d8cfb6' });

  /* ══ deterministic RNG (Park–Miller) + Box–Muller normal ══ */
  V.rng = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  V.normal = (r) => { let u = 0; while (u < 1e-12) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v); };
  const poisson = (r, lam) => { if (lam <= 0) return 0; const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 50); return k - 1; };

  /* ══ 1. worker mesh: lanes, routing, binary protocol, telemetry ══ */
  V.LANES = [
    ['feed', 'Feed / L2', ['ohlc', 'bookImb', 'kalman', 'cycle', 'haar', 'pin', 'spoofHalfLife', 'latencyImpulse']],
    ['spatial', '3D Spatial / Shock Physics', ['shock', 'synthBook', 'stressPositions', 'lorenz', 'rossler', 'lsystem', 'turtle', 'hopf']],
    ['chain', 'On-Chain / Bellman-Ford Graph', ['bellmanFord', 'washScore', 'mevSandwich', 'smartMoney', 'liqHeatmap']],
    ['options', 'Options GEX / IV Surface', ['greeks', 'bsCall', 'breedenLitzenberger', 'maxPain', 'pinRisk', 'gvc', 'ivSurface']],
    ['screener', 'Screener / Causality', ['transferEntropy', 'marchenkoPastur', 'kendallTau', 'copula', 'bocpd', 'volCone']],
    ['quant', 'Quant Lab / CPCV', ['merton', 'sharpeGrid', 'cpcv', 'deflatedSharpe', 'geneticAlpha', 'inverseStress', 'hurst', 'lyapunov', 'lyapSeries', 'permEntropy', 'eigenRisk', 'varCvar']],
    ['bots', 'Autonomous Bot Squad / Ledger', ['thompson', 'kelly', 'almgrenChriss', 'orderType', 'shadowBracket', 'drawToBot', 'ifThen', 'hawkes']],
    ['copilot', 'Copilot RAG / Flight Recorder', ['bayes3', 'rag', 'shadowTwin', 'mfeMae']],
  ];
  V.SERVER_LANES = [['ingest', 'Market / WS Ingest'], ['forensics', 'On-Chain DEX / DAG Forensics'], ['quant', 'Heavy Quant / GEX / Shock Math'], ['exec', 'Copilot / Bot Execution']];
  const ROUTE = {}; for (const [k, , ops] of V.LANES) for (const o of ops) ROUTE[o] = k;
  V.route = (fn) => ROUTE[fn] || null;
  /* every op a worker may run: allow-list (no eval, no arbitrary property access) */
  V.allowed = (lane, fn) => { const L = V.LANES.find((x) => x[0] === lane); return !!L && L[2].includes(fn) && typeof V.E[fn] === 'function'; };
  /* series ↔ Float64Array: [n, ...values]; matrices: [rows, cols, ...row-major] */
  V.pack = (arr) => { const n = arr.length, f = new Float64Array(n + 1); f[0] = n; for (let i = 0; i < n; i++) f[i + 1] = +arr[i]; return f; };
  V.unpack = (f) => { const n = f[0] | 0; return Array.from(f.subarray(1, 1 + n)); };
  V.packM = (M) => { const r = M.length, c = r ? M[0].length : 0, f = new Float64Array(2 + r * c); f[0] = r; f[1] = c; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) f[2 + i * c + j] = +M[i][j]; return f; };
  V.unpackM = (f) => { const r = f[0] | 0, c = f[1] | 0, M = []; for (let i = 0; i < r; i++) M.push(Array.from(f.subarray(2 + i * c, 2 + (i + 1) * c))); return M; };
  /* latency ring: avg / p50 / p99 per lane */
  V.Tele = class {
    constructor(n) { this.n = n || 256; this.a = new Float64Array(this.n); this.i = 0; this.c = 0; this.jobs = 0; this.err = 0; this.q = 0; this.peakQ = 0; this.at = 0; }
    add(ms) { this.a[this.i] = ms; this.i = (this.i + 1) % this.n; this.c = Math.min(this.n, this.c + 1); this.jobs++; this.at = Date.now(); }
    vals() { return Array.from(this.a.subarray(0, this.c)); }
    stats() { const v = this.vals(); return { jobs: this.jobs, err: this.err, q: this.q, peakQ: this.peakQ, avg: v.length ? mean(v) : 0, p50: v.length ? quant(v, 0.5) : 0, p99: v.length ? quant(v, 0.99) : 0 }; }
  };
  /* latency histogram: fixed log buckets (ms) */
  V.LAT_BUCKETS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, Infinity];
  V.histo = (ms) => { const h = new Array(V.LAT_BUCKETS.length).fill(0); for (const x of ms) { let k = 0; while (x > V.LAT_BUCKETS[k]) k++; h[k]++; } return h; };

  /* ══ 2. any stock / coin / perp / meme-coin CA ══ */
  V.classify = (q) => {
    const s = String(q == null ? '' : q).trim(); if (!s) return { kind: 'empty', q: '' };
    if (/^0x[a-fA-F0-9]{40}$/.test(s)) return { kind: 'evm-ca', q: s.toLowerCase() };
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return { kind: 'sol-ca', q: s };
    const u = s.toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z0-9]{2,12}(-PERP|PERP|-SWAP|USDT\.P)$/.test(u)) return { kind: 'perp', q: u.replace(/(-PERP|PERP|-SWAP|USDT\.P)$/, '') + '-PERP' };
    if (/^[A-Z0-9]{2,12}[-/](USD|USDT|USDC|BTC|ETH|EUR)$/.test(u)) return { kind: 'crypto', q: u.replace('/', '-') };
    if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|LINK|DOT|BNB|LTC|TRX|TON|SHIB|PEPE|WIF|BONK|SUI|APT|ARB|OP|NEAR|ATOM|HYPE|JUP|FET|RNDR|INJ|SEI|TIA)$/.test(u)) return { kind: 'crypto', q: u + '-USD' };
    if (/^\$?[A-Z]{1,5}([.-][A-Z])?$/.test(u)) return { kind: 'stock', q: u.replace(/^\$/, '').replace('-', '.') };
    if (/^[A-Z0-9]{2,12}$/.test(u)) return { kind: 'crypto', q: u + '-USD' };
    return { kind: 'name', q: s };
  };

  /* ══ 3. truthful Working Bots squad ══ */
  V.SQUAD = [
    ['hunter', 'HUNTER-α', 'scans · screener hits · whale sweeps', /scan|screen|whale|signal|hunt|alert/i],
    ['sniper', 'SNIPER-EXEC', 'entries · fills · order routing', /fill|order|entry|exec|buy|bot/i],
    ['scalper', 'SCALPER-EXIT', 'exits · take-profit · stops', /exit|win|loss|\btp\b|stop|close|sell/i],
    ['risk', 'RISK-GUARD', 'firewall gates · blocks · stale lock · flatten', /gate|block|firewall|stale|flatten|risk|deny|reject/i],
    ['mutator', 'MUTATOR-EVO', 'evolution · parameter mutation · backtests', /evol|mutat|backtest|param|genetic|optim/i],
    ['hedger', 'HEDGER-ARB', 'hedges · cross-venue arb · funding', /hedge|\barb|funding|basis/i],
  ];
  /* map a bus event to a squad member (null = not a bot event). Type first, then text; risk wins ties */
  V.squadOf = (e) => {
    if (!e) return null; const t = String(e.type || ''), tx = String(e.text || ''), nd = String(e.node || '');
    const botish = e.src === 'fleet' || e.src === 'demo' || /Bots|Risk|Ledger|Firewall/.test(nd) || /^(bot|fill|win|loss|gate|block|flatten|stale|order|evolve|hedge|arb|scan)$/i.test(t);
    if (!botish) return null;
    for (const k of [3, 4, 5, 2, 0]) if (V.SQUAD[k][3].test(t)) return k;
    for (const k of [3, 4, 5, 2, 0, 1]) if (V.SQUAD[k][3].test(tx)) return k;
    return 1;
  };
  /* squad state machine: real events always count; demo events are dropped unless the demo is on AND no real bot runs */
  V.Squad = class {
    constructor() { this.m = V.SQUAD.map(([id, name]) => ({ id, name, fires: 0, real: 0, demo: 0, last: null, lastAt: 0, lat: [] })); this.demoOn = false; this.realBots = 0; this.realEvents = 0; this.demoEvents = 0; this.dropped = 0; }
    setReal(n) { this.realBots = Math.max(0, n | 0); }
    feed(e, now) {
      const k = V.squadOf(e); if (k == null) return -1; const demo = e.src === 'demo';
      if (demo && (!this.demoOn || this.realBots > 0)) { this.dropped++; return -1; }
      const b = this.m[k]; b.fires++; if (demo) { b.demo++; this.demoEvents++; } else { b.real++; this.realEvents++; } b.last = String(e.text || e.type || '').slice(0, 80); b.lastAt = now || Date.now();
      if (fin(e.lat)) { b.lat.push(e.lat); if (b.lat.length > 64) b.lat.shift(); }
      return k;
    }
    status(k, now) { const b = this.m[k], t = now || Date.now(); if (this.realBots > 0 || b.real) return b.real && t - b.lastAt < 15000 ? 'ACTIVE' : this.realBots > 0 ? 'ARMED' : 'IDLE'; if (this.demoOn) return b.demo && t - b.lastAt < 15000 ? 'DEMO' : 'DEMO · IDLE'; return 'STANDBY'; }
    kpis(now) { const t = now || Date.now(), fires = this.m.reduce((s, b) => s + b.fires, 0), active = this.m.filter((b, k) => /^(ACTIVE|DEMO)$/.test(this.status(k, t))).length, lat = [].concat(...this.m.map((b) => b.lat)); return { fires, real: this.realEvents, demo: this.demoEvents, dropped: this.dropped, active, mode: this.realBots > 0 ? 'LIVE BOTS' : this.demoOn ? 'DEMO' : 'STANDBY', p99: lat.length ? quant(lat, 0.99) : 0 }; }
  };

  /* ══ 4. main-chart 3D layers (≤ 3 on by default) ══ */
  V.LAYERS = [
    ['ob', 'OB Prisms', true], ['vpvr', 'VPVR / POC', true], ['whale', 'Whale Beacons', true],
    ['l2', 'L2 Terrain', false], ['cvd', 'CVD Pillars', false], ['gex', 'GEX Towers', false], ['liq', 'Liq Pools', false], ['fvg', 'FVG Tunnels', false],
    ['avwap', 'AVWAP Canyon', false], ['rr', '3D R:R Hologram Box', false], ['strata', '6-TF Stacked Strata', false], ['replay', '4D Replay Scrub', false],
  ];
  V.layerDefaults = () => Object.fromEntries(V.LAYERS.map(([k, , on]) => [k, on]));
  V.layerState = (saved) => { const d = V.layerDefaults(); if (saved && typeof saved === 'object') for (const k of Object.keys(d)) if (typeof saved[k] === 'boolean') d[k] = saved[k]; return d; };
  V.layersOn = (st) => Object.keys(st).filter((k) => st[k]);
  /* volume profile: price bins, POC, 70 % value area */
  V.vpvr = (bars, bins) => {
    const n = bins || 24; if (!bars || !bars.length) return { bins: [], poc: NaN, vah: NaN, val: NaN };
    let lo = Infinity, hi = -Infinity; for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); } const w = (hi - lo) / n || 1, v = new Array(n).fill(0);
    for (const b of bars) { const a = clamp(Math.floor((b.l - lo) / w), 0, n - 1), z = clamp(Math.floor((b.h - lo) / w), 0, n - 1), per = (b.v || 0) / (z - a + 1); for (let k = a; k <= z; k++) v[k] += per; }
    let pk = 0; for (let k = 1; k < n; k++) if (v[k] > v[pk]) pk = k; const tot = sum(v); let acc = v[pk], a = pk, z = pk;
    while (acc < tot * 0.7 && (a > 0 || z < n - 1)) { const up = z < n - 1 ? v[z + 1] : -1, dn = a > 0 ? v[a - 1] : -1; if (up >= dn) acc += v[++z]; else acc += v[--a]; }
    return { bins: v.map((x, k) => ({ lo: lo + k * w, hi: lo + (k + 1) * w, v: x })), poc: lo + (pk + 0.5) * w, vah: lo + (z + 1) * w, val: lo + a * w };
  };
  /* whale beacons: bars whose volume z-score ≥ k */
  V.whales = (bars, k) => { const vs = bars.map((b) => b.v || 0), m = mean(vs), s = sd(vs) || 1; return bars.map((b, i) => ({ i, z: ((b.v || 0) - m) / s, side: b.c >= b.o ? 'buy' : 'sell' })).filter((x) => x.z >= (k || 2.5)); };

  /* ══ 5. 3D order-book shock + 150+ scenario flight simulator ══ */
  V.SCEN_CATS = [
    ['liq', 'Liquidity Crunch', ['Book thins into the close', 'Market-maker pull', 'Weekend air pocket', 'Holiday half-day', 'Depth evaporates at open', 'ETF rebalance drain', 'Stablecoin redemption run', 'CEX withdrawal freeze', 'Options expiry vacuum', 'Index deletion', 'Lunch-hour lull', 'Asia-session gap', 'Post-earnings drift'], { depth: 0.35, vol: 1.6, spoof: 0.1, size: 250000, gap: -0.02 }],
    ['crash', 'Flash Crash', ['Fat-finger sell', 'Stop-loss cascade', 'Liquidation waterfall', 'Algo feedback loop', 'Circuit-breaker trip', 'Oracle mispricing', 'Cross-margin unwind', 'Basis blow-out', 'Bridge exploit dump', 'Treasury auction miss', 'VIX spike', 'Leveraged ETF rebalance', 'Mini-flash on thin pair'], { depth: 0.25, vol: 3.2, spoof: 0.2, size: 1500000, gap: -0.08 }],
    ['squeeze', 'Short Squeeze', ['Gamma squeeze', 'Borrow recall', 'Funding flip', 'Meme rally', 'Short-interest above 30 %', 'Call-wall breach', 'Negative funding unwind', 'Index inclusion', 'Retail swarm', 'Buyback announcement', 'Halt-and-reopen', 'Options-led melt-up', 'Perp OI squeeze'], { depth: 0.45, vol: 2.4, spoof: 0.15, size: 800000, gap: 0.07 }],
    ['spoof', 'Spoof & Layering', ['Layered bid wall pulled', 'Phantom ask ladder', 'Iceberg reveal', 'Quote stuffing burst', 'Momentum ignition', 'Wash-print bait', 'Wall flicker 50 ms', 'Cross-venue spoof', 'Bait-and-switch', 'Ping orders', 'Closing-auction layering', 'Fake breakout wall', 'Pinging the touch'], { depth: 0.6, vol: 1.4, spoof: 0.65, size: 300000, gap: -0.01 }],
    ['macro', 'Macro Shock', ['CPI hot print', 'FOMC surprise hike', 'NFP miss', 'Geopolitical strike', 'Sovereign downgrade', 'Bank failure', 'Oil supply shock', 'Yen carry unwind', 'Tariff headline', 'Rate-cut surprise', 'Debt-ceiling standoff', 'China stimulus', 'War-risk premium'], { depth: 0.5, vol: 2.0, spoof: 0.1, size: 600000, gap: -0.04 }],
    ['chain', 'On-Chain Rug / Depeg', ['LP rug pull', 'Stablecoin depeg', 'Honeypot sell-lock', 'Dev wallet dump', 'Sniper-bot exit', 'Bridge depeg', 'Oracle manipulation', 'Sandwich storm', 'Bundle-wallet dump', 'Mint authority abuse', 'Liquidity migration', 'Validator halt', 'Restaking slash'], { depth: 0.15, vol: 4.0, spoof: 0.3, size: 120000, gap: -0.35 }],
  ];
  /* 6 categories × 13 events × 2 severities (base / extreme) = 156 deterministic scenarios */
  V.scenarios = () => {
    const out = []; let id = 0;
    for (const [cat, cname, names, base] of V.SCEN_CATS) names.forEach((nm, i) => { for (const sev of [1, 2]) { const j = 1 + ((i * 7) % 5) / 10, m = sev === 2 ? 1.75 : 1;
      out.push({ id: ++id, cat, catName: cname, name: nm + (sev === 2 ? ' · extreme' : ''), sev, orderUsd: Math.round(base.size * j * m), depthPct: +clamp((base.depth / (sev === 2 ? 1.6 : 1)) * (1.05 - (i % 4) * 0.05), 0.05, 1).toFixed(4), volMult: +(base.vol * j * (sev === 2 ? 1.5 : 1)).toFixed(2), spoofPct: +clamp(base.spoof * (sev === 2 ? 1.4 : 1), 0, 0.95).toFixed(4), gapPct: +(base.gap * j * m).toFixed(4) }); } });
    return out;
  };
  /* model book around mid: n levels a side, half-spread, $ depth decaying with distance */
  V.synthBook = (mid, o) => {
    const p = o || {}, n = p.levels || 40, hs = (p.spreadBps || 4) / 2e4, tick = p.tickPct || 0.0005, d0 = p.depthUsd || 500000, r = V.rng(p.seed || 7), bids = [], asks = [];
    for (let k = 0; k < n; k++) { const dec = Math.exp(-k / (n * 0.45)) * 0.6 + 0.4, j = 0.75 + r() * 0.5, usd = (d0 / n) * dec * j * 4, pb = mid * (1 - hs - k * tick), pa = mid * (1 + hs + k * tick); bids.push([pb, usd / pb]); asks.push([pa, usd / pa]); }
    return { mid, bids, asks };
  };
  /* shock: keep depthPct of the book, pull spoofPct of the near quarter, widen by volMult, then walk a market order */
  V.shock = (book, o) => {
    const p = o || {}, side = p.side === 'buy' ? 'buy' : 'sell', keep = clamp(fin(p.depthPct) ? p.depthPct : 1, 0.01, 1), pull = clamp(p.spoofPct || 0, 0, 0.99), vm = Math.max(1, p.volMult || 1), usd = Math.max(0, p.orderUsd || 0), mid = book.mid, src = side === 'sell' ? book.bids : book.asks;
    const near = Math.max(1, Math.round(src.length * 0.25)), lv = src.map(([px, q], k) => [mid + (px - mid) * vm, q * keep * (k < near ? 1 - pull : 1)]);
    let left = usd, qty = 0, cost = 0, used = 0, last = mid;
    for (const [px, q] of lv) { if (left <= 1e-9) break; const take = Math.min(q, left / px); qty += take; cost += take * px; left -= take * px; used++; last = px; }
    const avg = qty > 0 ? cost / qty : mid, slip = qty > 0 ? Math.abs(avg / mid - 1) * 1e4 : 0, impact = Math.abs(last / mid - 1) * 1e4, gap = fin(p.gapPct) ? p.gapPct : 0, post = last * (1 + gap);
    return { side, filledUsd: usd - left, unfilledUsd: left, qty, avg, slipBps: slip, impactBps: impact, levels: used, postMid: post, movePct: (post / mid - 1) * 100, book: lv };
  };
  /* stress open positions + running bots under a scenario: gap move + exit slippage from the shocked book */
  V.stressPositions = (positions, scen, book) => {
    const rows = (positions || []).map((p) => { const px = p.px || p.mark || 0, val = Math.abs(p.qty || 0) * px, long = (p.qty || 0) >= 0, s = book ? V.shock(book, { side: long ? 'sell' : 'buy', orderUsd: val, depthPct: scen.depthPct, spoofPct: scen.spoofPct, volMult: scen.volMult }) : { slipBps: 0 };
      const mv = scen.gapPct * (long ? 1 : -1) * Math.max(1, scen.volMult / 1.5), pnl = val * mv - (val * s.slipBps) / 1e4; return { sym: p.sym, kind: p.kind || 'position', value: val, pnl, slipBps: s.slipBps, liquidated: !!(p.lev && p.lev > 1 && -mv * p.lev >= 0.9) }; });
    return { rows, total: rows.reduce((s, r) => s + r.pnl, 0), worst: rows.reduce((m, r) => Math.min(m, r.pnl), 0), liquidations: rows.filter((r) => r.liquidated).length };
  };

  /* ══ 6. the 30 engines ══ */
  const E = V.E = {};
  /* — Chart & Execution — */
  /* Easley–O'Hara PIN: grid MLE over α, δ, μ; εb / εs from the moment conditions; log-space Poisson mixture */
  const lfact = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const lpois = (k, lam, lf) => (lam <= 0 ? (k === 0 ? 0 : -1e9) : k * Math.log(lam) - lam - lf);
  const lse3 = (a, b, c) => { const m = Math.max(a, b, c); return m + Math.log(Math.exp(a - m) + Math.exp(b - m) + Math.exp(c - m)); };
  E.pin = (buys, sells) => {
    const n = buys.length, mb = mean(buys), ms = mean(sells), mx = Math.max(1, ...buys.map((b, i) => Math.abs(b - sells[i]))), lfb = buys.map(lfact), lfs = sells.map(lfact); let best = { ll: -Infinity };
    for (let a = 0.05; a < 0.96; a += 0.05) for (let d = 0.05; d < 0.96; d += 0.05) for (let mu = mx * 0.05; mu <= mx * 1.6; mu += mx * 0.05) {
      const eb = mb - a * (1 - d) * mu, es = ms - a * d * mu; if (eb <= 0 || es <= 0) continue; let ll = 0; const l0 = Math.log(1 - a), l1 = Math.log(a * d), l2 = Math.log(a * (1 - d));
      for (let i = 0; i < n; i++) { const pb = lpois(buys[i], eb, lfb[i]), ps = lpois(sells[i], es, lfs[i]); ll += lse3(l0 + pb + ps, l1 + pb + lpois(sells[i], es + mu, lfs[i]), l2 + lpois(buys[i], eb + mu, lfb[i]) + ps); }
      if (ll > best.ll) best = { ll, a, d, mu, eb, es };
    }
    if (!fin(best.ll)) return { pin: 0, alpha: 0, delta: 0, mu: 0, eb: mb, es: ms, ll: NaN };
    return { pin: (best.a * best.mu) / (best.a * best.mu + best.eb + best.es), alpha: best.a, delta: best.d, mu: best.mu, eb: best.eb, es: best.es, ll: best.ll };
  };
  /* Almgren–Chriss optimal liquidation: x_k = X·sinh(κ(T−t_k)) / sinh(κT); λ → 0 gives TWAP */
  E.almgrenChriss = (X, N, o) => {
    const p = o || {}, T = p.T || 1, tau = T / N, sig = p.sigma || 0.02, eta = p.eta || 1e-6, lam = p.lambda == null ? 1e-6 : p.lambda, tilde = eta - ((p.gamma || 0) * tau) / 2;
    const kt = lam > 0 ? Math.acosh(1 + (lam * sig * sig * tau * tau) / (2 * Math.max(1e-18, tilde))) / tau : 0, hold = [], trades = [];
    for (let k = 0; k <= N; k++) { const t = k * tau; hold.push(kt > 1e-12 ? (X * Math.sinh(kt * (T - t))) / Math.sinh(kt * T) : X * (1 - t / T)); }
    for (let k = 1; k <= N; k++) trades.push(hold[k - 1] - hold[k]);
    return { kappa: kt, hold, trades, expCost: trades.reduce((s, n) => s + eta * (n / tau) * n, 0), variance: hold.slice(1).reduce((s, x) => s + sig * sig * tau * x * x, 0) };
  };
  /* FFT (radix-2, in place) + dominant cycle; Haar wavelet denoise */
  E.fft = (re0, im0) => {
    let n = 1; while (n < re0.length) n <<= 1; const re = new Float64Array(n), im = new Float64Array(n); re.set(re0); if (im0) im.set(im0);
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const h = len / 2, ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const ar = re[i + k + h] * cr - im[i + k + h] * ci, ai = re[i + k + h] * ci + im[i + k + h] * cr; re[i + k + h] = re[i + k] - ar; im[i + k + h] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
    return { re, im, n };
  };
  E.cycle = (x) => { const m = mean(x), f = E.fft(x.map((v) => v - m)); let bk = 1, bp = 0; for (let k = 1; k < f.n / 2; k++) { const p = f.re[k] * f.re[k] + f.im[k] * f.im[k]; if (p > bp) { bp = p; bk = k; } } return { bin: bk, period: f.n / bk, power: bp, n: f.n }; };
  E.haar = (x, thr) => {
    let n = 1; while (n < x.length) n <<= 1; const a = new Float64Array(n); a.set(x); for (let i = x.length; i < n; i++) a[i] = x[x.length - 1];
    for (let len = n; len > 1; len >>= 1) { const t = new Float64Array(len); for (let i = 0; i < len / 2; i++) { t[i] = (a[2 * i] + a[2 * i + 1]) / Math.SQRT2; t[len / 2 + i] = (a[2 * i] - a[2 * i + 1]) / Math.SQRT2; } a.set(t); }
    if (thr) for (let i = 1; i < n; i++) if (Math.abs(a[i]) < thr) a[i] = 0;
    for (let len = 2; len <= n; len <<= 1) { const t = new Float64Array(len); for (let i = 0; i < len / 2; i++) { t[2 * i] = (a[i] + a[len / 2 + i]) / Math.SQRT2; t[2 * i + 1] = (a[i] - a[len / 2 + i]) / Math.SQRT2; } a.set(t); }
    return Array.from(a.subarray(0, x.length));
  };
  /* adaptive Kalman (local level; Q tracks the recent innovation variance) */
  E.kalman = (z, o) => {
    const p = o || {}; let x = z[0], P = 1, Q = p.q || 1e-3; const R = p.r || 1e-1, out = [], ad = p.adaptive !== false, innov = [];
    for (const v of z) { P += Q; const K = P / (P + R), e = v - x; x += K * e; P *= 1 - K; out.push(x); if (ad) { innov.push(e * e); if (innov.length > 20) innov.shift(); Q = clamp(mean(innov) * 0.05, 1e-6, R * 10); } }
    return out;
  };
  /* spoof-elasticity half-life: wall size decay fitted log-linearly → ln 2 / k */
  E.spoofHalfLife = (t, size) => { const pts = t.map((x, i) => [x, size[i]]).filter((q) => q[1] > 0); if (pts.length < 2) return { k: 0, halfLife: Infinity, r2: 0 }; const xs = pts.map((q) => q[0]), ys = pts.map((q) => Math.log(q[1])), mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } const k = -sxy / (sxx || 1); return { k, halfLife: k > 0 ? Math.LN2 / k : Infinity, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 }; };
  /* optimal order type: expected cost (bps) of Limit (adverse non-fill) vs IOC (half-spread + impact) vs TWAP (half impact + timing risk) */
  E.orderType = (o) => {
    const s = o.spreadBps || 5, vol = o.volBps || 50, u = clamp(o.urgency == null ? 0.5 : o.urgency, 0, 1), part = o.sizePctAdv || 0.1, impact = ((10 * vol) / 100) * Math.sqrt(Math.max(0, part));
    const c = { Limit: -s / 2 + u * vol * 0.6 * (1 - Math.exp(-part * 4)) + u * vol * 0.25 + impact * Math.min(1, part), IOC: s / 2 + impact, TWAP: impact * 0.5 + vol * 0.35 * u * Math.sqrt(1 + part) };
    return { best: Object.keys(c).reduce((a, b) => (c[b] < c[a] ? b : a)), cost: c };
  };
  /* stealth IOC shadow bracket: hidden stop / TP at ATR multiples, fired as IOC on touch, never resting on the book */
  E.shadowBracket = (entry, side, atr, o) => { const p = o || {}, k = p.k || 1.5, rr = p.rr || 2, d = side === 'short' ? -1 : 1, stop = entry - d * k * atr, tp = entry + d * k * atr * rr; return { stop, tp, rr, riskPct: (Math.abs(entry - stop) / entry) * 100, type: 'IOC-on-touch' }; };
  /* draw-pattern → bot compiler: points (bar index, price) → least-squares line → breakout rule */
  E.drawToBot = (pts, o) => {
    const p = o || {}; if (!pts || pts.length < 2) return null; const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const slope = sxy / (sxx || 1), icpt = my - slope * mx, nowI = p.nowIndex == null ? Math.max(...xs) : p.nowIndex, lvl = icpt + slope * nowI, last = p.lastPrice, side = last == null ? (slope >= 0 ? 'long' : 'short') : last >= lvl ? 'long' : 'short';
    return { slope, intercept: icpt, levelNow: lvl, rule: { if: ['close', side === 'long' ? 'crosses_above' : 'crosses_below', +lvl.toFixed(8)], then: side === 'long' ? 'buy' : 'sell' }, kind: Math.abs(slope) < Math.abs(my) * 1e-4 ? 'horizontal' : slope > 0 ? 'rising' : 'falling' };
  };
  /* L2 book imbalance (top n levels, $ weighted) */
  E.bookImb = (bids, asks, n) => { const k = n || 10, b = bids.slice(0, k).reduce((s, x) => s + x[1] * x[0], 0), a = asks.slice(0, k).reduce((s, x) => s + x[1] * x[0], 0); return { imb: (b - a) / (b + a || 1), bidUsd: b, askUsd: a }; };
  /* ticks → OHLC bars */
  E.ohlc = (t, px, sz, bucketMs) => { const out = []; let cur = null; for (let i = 0; i < t.length; i++) { const k = Math.floor(t[i] / bucketMs) * bucketMs; if (!cur || cur.t !== k) { cur = { t: k, o: px[i], h: px[i], l: px[i], c: px[i], v: 0 }; out.push(cur); } cur.h = Math.max(cur.h, px[i]); cur.l = Math.min(cur.l, px[i]); cur.c = px[i]; cur.v += sz ? sz[i] : 1; } return out; };

  /* — On-Chain, Options & Futures — */
  /* Sybil / wash-trading score 0–100: low counterparty entropy + round trips (A→B then B→A) */
  E.washScore = (trades) => {
    if (!trades || !trades.length) return { score: 0, entropy: 0, entropyNorm: 1, roundTrip: 0, wallets: 0 }; const cnt = new Map(), pair = new Set(); let rt = 0;
    for (const t of trades) { const k = t.from < t.to ? t.from + '|' + t.to : t.to + '|' + t.from; cnt.set(k, (cnt.get(k) || 0) + 1); if (pair.has(t.to + '>' + t.from)) rt++; pair.add(t.from + '>' + t.to); }
    const n = trades.length; let H = 0; for (const c of cnt.values()) { const p = c / n; H -= p * Math.log2(p); } const He = clamp(H / Math.log2(Math.max(2, n)), 0, 1), rr = clamp(rt / n, 0, 1);
    return { score: Math.round(clamp((1 - He) * 60 + rr * 40, 0, 100)), entropy: H, entropyNorm: He, roundTrip: rr, wallets: new Set(trades.flatMap((t) => [t.from, t.to])).size };
  };
  /* MEV sandwich predictor: attacker edge ≈ min(size·tolerance, size² / liquidity) − 2 gas → logistic probability */
  E.mevSandwich = (o) => { const sz = o.sizeUsd || 0, liq = Math.max(1, o.liqUsd || 1), tol = o.slipTol == null ? 0.01 : o.slipTol, gas = o.gasUsd == null ? 5 : o.gasUsd, prof = Math.min(sz * tol, (sz * sz) / liq) - 2 * gas; return { profitUsd: prof, prob: 1 / (1 + Math.exp(-prof / Math.max(5, gas * 2))), safeTol: Math.max(0.001, (2 * gas) / Math.max(1, sz)) }; };
  /* smart-money half-life (AR(1) decay of a wallet's daily P&L edge) + 30d leaderboard */
  E.smartMoney = (wallets) => (wallets || []).map((w) => { const p = w.pnl || [], last = p.slice(-30), sr = sd(last) ? (mean(last) / sd(last)) * Math.sqrt(365) : 0; let ac = 0; if (p.length >= 3) { const m = mean(p); let n = 0, d = 0; for (let i = 1; i < p.length; i++) n += (p[i] - m) * (p[i - 1] - m); for (const x of p) d += (x - m) ** 2; ac = d ? n / d : 0; } return { id: w.id, pnl30: sum(last), sharpe: sr, ac1: ac, halfLife: ac > 0 && ac < 1 ? -Math.LN2 / Math.log(ac) : ac >= 1 ? Infinity : 0 }; }).sort((a, b) => b.pnl30 - a.pnl30);
  /* Black–Scholes + greeks (q = 0); N(x) via erf (Abramowitz–Stegun 7.1.26) */
  const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a); return s * y; };
  const ncdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  const npdf = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
  V.ncdf = ncdf;
  E.bsCall = (S, K, T, r, s) => { if (T <= 0) return Math.max(0, S - K); const d1 = (Math.log(S / K) + (r + (s * s) / 2) * T) / (s * Math.sqrt(T)), d2 = d1 - s * Math.sqrt(T); return S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2); };
  E.greeks = (S, K, T, r, s) => { const sq = Math.sqrt(T), d1 = (Math.log(S / K) + (r + (s * s) / 2) * T) / (s * sq), d2 = d1 - s * sq; return { delta: ncdf(d1), gamma: npdf(d1) / (S * s * sq), vega: S * npdf(d1) * sq, vanna: (-npdf(d1) * d2) / s, charm: -npdf(d1) * ((2 * r * T - d2 * s * sq) / (2 * T * s * sq)) }; };
  /* Breeden–Litzenberger risk-neutral density: q(K) = e^{rT} ∂²C/∂K² (central differences) */
  E.breedenLitzenberger = (K, C, r, T) => { const out = []; for (let i = 1; i < K.length - 1; i++) { const h = (K[i + 1] - K[i - 1]) / 2; out.push({ K: K[i], q: Math.max(0, (Math.exp(r * T) * (C[i + 1] - 2 * C[i] + C[i - 1])) / (h * h)) }); } const h = K.length > 2 ? (K[2] - K[0]) / 2 : 1, mass = out.reduce((s, x) => s + x.q * h, 0), m1 = out.reduce((s, x) => s + x.q * x.K * h, 0); return { density: out, mass, mean: mass ? m1 / mass : NaN }; };
  /* gamma–vanna–charm vector (dealer exposure, OI-weighted; puts negative) */
  E.gvc = (S, chain, r) => { let G = 0, Va = 0, Ch = 0; for (const o of chain) { const g = E.greeks(S, o.K, Math.max(1 / 365, o.T), r || 0, o.iv || 0.5), sgn = o.type === 'put' ? -1 : 1, oi = o.oi || 0; G += sgn * g.gamma * oi * S * S * 0.01; Va += sgn * g.vanna * oi; Ch += sgn * g.charm * oi; } return { gamma: G, vanna: Va, charm: Ch, norm: Math.hypot(G, Va, Ch) }; };
  /* max pain + 0DTE–7DTE pin risk */
  E.maxPain = (K, callOI, putOI) => { let best = K[0], low = Infinity; const pay = K.map((s) => { let p = 0; for (let i = 0; i < K.length; i++) p += callOI[i] * Math.max(0, s - K[i]) + putOI[i] * Math.max(0, K[i] - s); if (p < low) { low = p; best = s; } return p; }); return { strike: best, payout: low, curve: pay }; };
  E.pinRisk = (S, mp, dte, iv) => { const s = (iv || 0.5) * Math.sqrt(Math.max(0.5, dte) / 365) * S, z = Math.abs(S - mp) / Math.max(1e-9, s); return { z, pinProb: 2 * (1 - ncdf(z)), drift: (mp - S) / Math.max(0.5, dte) }; };
  E.ivSurface = (S, Ks, Ts, base) => Ts.map((T) => Ks.map((K) => { const m = Math.log(K / S); return Math.max(0.05, (base || 0.5) * (1 + (0.6 * m * m) / Math.sqrt(Math.max(0.05, T)) - 0.15 * m) * (1 + 0.1 / Math.sqrt(T * 12 + 1))); }));
  /* queue-reactive Hawkes: λ(t) = μ + Σ α·e^{−β(t − t_i)}; branching n = α / β; exact log-likelihood */
  E.hawkes = (times, mu, a, b, at) => { const T = at == null ? times[times.length - 1] || 0 : at; let A = 0, ll = 0, prev = null; for (const t of times) { if (prev != null) A = Math.exp(-b * (t - prev)) * (1 + A); ll += Math.log(mu + a * A); prev = t; } const lam = mu + (prev == null ? 0 : a * Math.exp(-b * (T - prev)) * (1 + A)), comp = mu * T + (a / b) * times.reduce((s, t) => s + (1 - Math.exp(-b * (T - t))), 0); return { intensity: lam, branching: a / b, stable: a / b < 1, ll: ll - comp }; };
  /* cross-exchange latency impulse: lag of max cross-correlation (positive = A leads B) */
  E.latencyImpulse = (A, B, maxLag) => { const L = maxLag || 10, n = Math.min(A.length, B.length), ma = mean(A.slice(0, n)), mb = mean(B.slice(0, n)); let best = 0, bc = -Infinity; for (let lag = -L; lag <= L; lag++) { let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const j = i + lag; if (j < 0 || j >= n) continue; const x = A[i] - ma, y = B[j] - mb; s += x * y; sa += x * x; sb += y * y; } const c = s / (Math.sqrt(sa * sb) || 1); if (c > bc) { bc = c; best = lag; } } return { lag: best, corr: bc }; };
  /* liquidation heatmap: entries × leverage → liq price bins */
  E.liqHeatmap = (pos, bins, lo, hi) => { const n = bins || 30, w = (hi - lo) / n, h = new Array(n).fill(0); for (const p of pos || []) { const lp = p.side === 'short' ? p.entry * (1 + 1 / p.lev) : p.entry * (1 - 1 / p.lev), k = Math.floor((lp - lo) / w); if (k >= 0 && k < n) h[k] += p.usd || 1; } return { lo, hi, bins: h }; };
  /* Bellman–Ford multi-hop arb: −log(rate) edges, a negative cycle = arbitrage */
  E.bellmanFord = (nodes, edges) => {
    const n = nodes.length, idx = new Map(nodes.map((x, i) => [x, i])), dist = new Array(n).fill(0), pred = new Array(n).fill(-1), E2 = edges.map((e) => [idx.get(e[0]), idx.get(e[1]), -Math.log(e[2]), e[2]]);
    let x = -1; for (let i = 0; i < n; i++) { x = -1; for (const [u, v, w] of E2) if (dist[u] + w < dist[v] - 1e-12) { dist[v] = dist[u] + w; pred[v] = u; x = v; } }
    if (x < 0) return { arb: false, cycle: [], profit: 0 }; for (let i = 0; i < n; i++) x = pred[x];
    const cyc = [x]; for (let v = pred[x]; v !== x && cyc.length <= n; v = pred[v]) cyc.push(v); cyc.push(x); cyc.reverse();
    let prod = 1; for (let i = 0; i + 1 < cyc.length; i++) { const e = E2.find((q) => q[0] === cyc[i] && q[1] === cyc[i + 1]); prod *= e ? e[3] : 1; }
    return { arb: prod > 1, cycle: cyc.map((i) => nodes[i]), profit: prod - 1 };
  };

  /* — Screener, Pulse, Derivs, Quant Lab, Bot Fleet, Copilot & Journal — */
  /* symmetric eigen-decomposition (cyclic Jacobi), eigenvalues descending */
  E.eig = (A0) => { const n = A0.length, A = A0.map((r) => r.slice()), Q = A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0))); for (let sw = 0; sw < 80; sw++) { let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; if (off < 1e-22) break; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c; for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; } for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; } for (let k = 0; k < n; k++) { const vkp = Q[k][p], vkq = Q[k][q]; Q[k][p] = c * vkp - s * vkq; Q[k][q] = s * vkp + c * vkq; } } } const ord = A.map((r, i) => [r[i], i]).sort((a, b) => b[0] - a[0]); return { values: ord.map((o) => o[0]), vectors: ord.map((o) => Q.map((r) => r[o[1]])) }; };
  E.corr = (R) => { const z = R.map((r) => { const m = mean(r), s = sd(r) || 1; return r.map((x) => (x - m) / s); }), T = R[0].length; return z.map((a, i) => z.map((b, j) => { if (i === j) return 1; let s = 0; for (let t = 0; t < T; t++) s += a[t] * b[t]; return clamp(s / (T - 1), -1, 1); })); };
  /* Marchenko–Pastur RMT filter: λ± = (1 ± √(N/T))², noise eigenvalues replaced by their mean, unit diagonal restored */
  E.marchenkoPastur = (R) => {
    const N = R.length, T = R[0].length, q = N / T, lp = (1 + Math.sqrt(q)) ** 2, lm = (1 - Math.sqrt(q)) ** 2, C = E.corr(R), ev2 = E.eig(C), noise = ev2.values.filter((v) => v <= lp), avg = noise.length ? mean(noise) : 0;
    const lam = ev2.values.map((v) => (v > lp ? v : avg)), M = C.map((r, i) => r.map((_, j) => lam.reduce((s, l, k) => s + l * ev2.vectors[k][i] * ev2.vectors[k][j], 0))), dg = M.map((r, i) => Math.sqrt(Math.abs(r[i])) || 1);
    return { lambdaPlus: lp, lambdaMinus: lm, eigen: ev2.values, signal: ev2.values.filter((v) => v > lp).length, cleaned: M.map((r, i) => r.map((v, j) => (i === j ? 1 : v / (dg[i] * dg[j])))) };
  };
  /* transfer entropy X → Y (quantile-binned, lag 1, bits) */
  E.transferEntropy = (x, y, bins) => {
    const b = bins || 3, dz = (a) => { const s = Float64Array.from(a).sort(), cut = []; for (let k = 1; k < b; k++) cut.push(s[Math.floor((k * s.length) / b)]); return a.map((v) => { let k = 0; while (k < cut.length && v >= cut[k]) k++; return k; }); }, X = dz(x), Y = dz(y), n = Math.min(X.length, Y.length), c3 = new Map(), c2a = new Map(), c2b = new Map(), c1 = new Map(); let N = 0;
    const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (let t = 1; t < n; t++) { inc(c3, Y[t] + ',' + Y[t - 1] + ',' + X[t - 1]); inc(c2a, Y[t - 1] + ',' + X[t - 1]); inc(c2b, Y[t] + ',' + Y[t - 1]); inc(c1, '' + Y[t - 1]); N++; }
    let te = 0; for (const [k, c] of c3) { const [yt, y1, x1] = k.split(','); te += (c / N) * Math.log2((c * c1.get(y1)) / (c2a.get(y1 + ',' + x1) * c2b.get(yt + ',' + y1))); } return Math.max(0, te);
  };
  /* tail copulas: Kendall τ → Clayton θ = 2τ/(1−τ), λL = 2^{−1/θ}; Gumbel θ = 1/(1−τ), λU = 2 − 2^{1/θ} */
  E.kendallTau = (x, y) => { let c = 0, d = 0; const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = Math.sign(x[i] - x[j]) * Math.sign(y[i] - y[j]); if (s > 0) c++; else if (s < 0) d++; } return (c - d) / ((n * (n - 1)) / 2 || 1); };
  E.copula = (x, y) => { const tau = clamp(E.kendallTau(x, y), -0.99, 0.99), ct = tau > 0 ? (2 * tau) / (1 - tau) : 0, gt = tau > 0 ? 1 / (1 - tau) : 1; return { tau, clayton: { theta: ct, lowerTail: ct > 0 ? Math.pow(2, -1 / ct) : 0 }, gumbel: { theta: gt, upperTail: 2 - Math.pow(2, 1 / gt) } }; };
  /* BOCPD (Adams & MacKay 2007): Gaussian likelihood, unknown mean with Normal prior, known variance, constant hazard */
  E.bocpd = (x, o) => {
    const p = o || {}, H = p.hazard || 1 / 100, s2 = p.var || sd(x.slice(0, Math.min(20, x.length))) ** 2 || 1, m0 = p.mu0 == null ? x[0] : p.mu0, v0 = p.var0 || s2 * 10; let R = [1], mu = [m0], vr = [v0]; const map = [], cp = [];
    for (let t = 0; t < x.length; t++) { const pr = mu.map((m, i) => { const s = vr[i] + s2; return Math.exp(-((x[t] - m) ** 2) / (2 * s)) / Math.sqrt(2 * Math.PI * s); }), gr = R.map((r, i) => r * pr[i] * (1 - H)), c = R.reduce((s, r, i) => s + r * pr[i] * H, 0), nr = [c, ...gr], z = sum(nr) || 1; R = nr.map((v) => v / z);
      mu = [m0, ...mu.map((m, i) => (m * s2 + x[t] * vr[i]) / (vr[i] + s2))]; vr = [v0, ...vr.map((v) => (v * s2) / (v + s2))]; if (R.length > 300) { R = R.slice(0, 300); mu = mu.slice(0, 300); vr = vr.slice(0, 300); }
      let k = 0; for (let i = 1; i < R.length; i++) if (R[i] > R[k]) k = i; map.push(k); cp.push(R[0]); }
    const changes = []; for (let t = 1; t < map.length; t++) if (map[t] < map[t - 1] - 3) changes.push(t - map[t]); return { runLength: map, cpProb: cp, changes: [...new Set(changes)] };
  };
  /* catalyst vol cone: realized-vol percentiles per window + implied move from a straddle */
  E.volCone = (ret, windows, straddle, px) => { const W = windows || [5, 10, 20, 60], ann = Math.sqrt(252); return { cone: W.filter((w) => ret.length > w).map((w) => { const v = []; for (let i = w; i <= ret.length; i++) v.push(sd(ret.slice(i - w, i)) * ann); return { w, p10: quant(v, 0.1), p50: quant(v, 0.5), p90: quant(v, 0.9), now: v[v.length - 1] }; }), impliedMove: straddle && px ? straddle / px : null }; };
  /* symbolic genetic alpha (seeded GP over a tiny grammar) scored by annualised Sharpe */
  const PRIMS = ['ret1', 'ret5', 'mom20', 'z20', 'vol20', 'rsi14'];
  const feat = (c) => { const n = c.length, F = {}, r = (k) => c.map((v, i) => (i >= k ? v / c[i - k] - 1 : 0)); F.ret1 = r(1); F.ret5 = r(5); F.mom20 = r(20); F.z20 = []; F.vol20 = []; F.rsi14 = []; for (let i = 0; i < n; i++) { const w = c.slice(Math.max(0, i - 19), i + 1), m = mean(w), s = sd(w) || 1; F.z20.push((c[i] - m) / s); F.vol20.push(sd(F.ret1.slice(Math.max(0, i - 19), i + 1))); let g = 0, l = 0; for (let j = Math.max(1, i - 13); j <= i; j++) { const d = c[j] - c[j - 1]; if (d > 0) g += d; else l -= d; } F.rsi14.push(l + g ? g / (g + l) - 0.5 : 0); } return F; };
  const OPS2 = [['+', (a, b) => a + b], ['-', (a, b) => a - b], ['*', (a, b) => a * b]], OPS1 = [['neg', (a) => -a], ['sgn', (a) => Math.sign(a)]];
  const grow = (r, d) => { if (d <= 0 || r() < 0.3) return { p: PRIMS[Math.floor(r() * PRIMS.length)] }; if (r() < 0.25) return { u: Math.floor(r() * OPS1.length), a: grow(r, d - 1) }; return { o: Math.floor(r() * OPS2.length), a: grow(r, d - 1), b: grow(r, d - 1) }; };
  const evalT = (t, F, i) => (t.p ? F[t.p][i] : t.u != null ? OPS1[t.u][1](evalT(t.a, F, i)) : OPS2[t.o][1](evalT(t.a, F, i), evalT(t.b, F, i)));
  const strT = (t) => (t.p ? t.p : t.u != null ? OPS1[t.u][0] + '(' + strT(t.a) + ')' : '(' + strT(t.a) + ' ' + OPS2[t.o][0] + ' ' + strT(t.b) + ')');
  const depthT = (t) => (t.p ? 1 : 1 + Math.max(depthT(t.a), t.b ? depthT(t.b) : 0));
  const sharpe = (x) => (sd(x) ? (mean(x) / sd(x)) * Math.sqrt(252) : 0);
  E.geneticAlpha = (close, o) => {
    const p = o || {}, r = V.rng(p.seed || 11), F = feat(close), n = close.length, pop = p.pop || 40, gens = p.gens || 6;
    const score = (t) => { const pn = []; for (let i = 21; i < n - 1; i++) pn.push(Math.sign(evalT(t, F, i)) * (close[i + 1] / close[i] - 1)); return sharpe(pn); };
    let P = Array.from({ length: pop }, () => { const t = grow(r, 3); return { t, s: score(t) }; }), trials = pop;
    for (let g = 0; g < gens; g++) { P.sort((a, b) => b.s - a.s); const elite = P.slice(0, Math.max(2, pop >> 2)), kids = []; while (kids.length < pop - elite.length) { const a = elite[Math.floor(r() * elite.length)].t, b = elite[Math.floor(r() * elite.length)].t; let t = r() < 0.5 ? { o: Math.floor(r() * 3), a, b } : r() < 0.5 ? { u: Math.floor(r() * 2), a } : grow(r, 3); if (depthT(t) > 6) t = grow(r, 3); kids.push({ t, s: score(t) }); trials++; } P = elite.concat(kids); }
    P.sort((a, b) => b.s - a.s); return { best: strT(P[0].t), sharpe: P[0].s, trials, top: P.slice(0, 5).map((x) => ({ expr: strT(x.t), sharpe: x.s })) };
  };
  /* deflated Sharpe (Bailey & López de Prado 2014): expected max SR over N trials, then the probabilistic SR against it */
  const ninv = (pr) => { let lo = -10, hi = 10; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (ncdf(m) < pr) lo = m; else hi = m; } return (lo + hi) / 2; };
  V.ninv = ninv;
  E.deflatedSharpe = (sr, nTrials, T, skew, kurt, srVar) => { const g = 0.5772156649, N = Math.max(1, nTrials), v = srVar == null ? 1 / Math.max(2, T) : srVar, sr0 = N > 1 ? Math.sqrt(v) * ((1 - g) * ninv(1 - 1 / N) + g * ninv(1 - 1 / (N * Math.E))) : 0, k = kurt == null ? 3 : kurt, s = skew || 0, den = Math.sqrt(Math.max(1e-12, 1 - s * sr + ((k - 1) / 4) * sr * sr)); return { sr0, dsr: ncdf(((sr - sr0) * Math.sqrt(Math.max(1, T - 1))) / den) }; };
  /* combinatorial purged CV: C(N, k) splits, φ = k/N · C(N, k) backtest paths, embargo drops the group after each test group */
  E.cpcv = (N, k, nObs, embargo) => { const obs = nObs || N * 10, sz = Math.floor(obs / N), groups = [], splits = []; for (let g = 0; g < N; g++) groups.push([g * sz, g === N - 1 ? obs : (g + 1) * sz]); const comb = (s, c) => { if (c.length === k) { splits.push(c.slice()); return; } for (let i = s; i < N; i++) { c.push(i); comb(i + 1, c); c.pop(); } }; comb(0, []); return { splits: splits.map((t) => ({ test: t, train: groups.map((_, i) => i).filter((i) => !t.includes(i) && !(embargo && t.includes(i - 1))) })), nSplits: splits.length, paths: Math.round((k / N) * splits.length), groups }; };
  /* inverse portfolio stress: smallest uniform shock s with loss(s) ≥ target (bisection) */
  E.inverseStress = (pos, target) => { const loss = (s) => (pos || []).reduce((t, p) => t + Math.max(0, (p.beta == null ? 1 : p.beta) * s * (p.value || 0) * (p.short ? -1 : 1)), 0), maxL = loss(1); if (maxL < target) return { shock: null, maxLoss: maxL }; let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (loss(m) >= target) hi = m; else lo = m; } return { shock: -hi, maxLoss: maxL, loss: loss(hi) }; };
  /* Thompson-sampling bandit (Beta–Bernoulli; Marsaglia–Tsang gamma sampler) */
  const gam = (r, a) => { if (a < 1) return gam(r, a + 1) * Math.pow(r(), 1 / a); const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = V.normal(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
  E.beta = (r, a, b) => { const x = gam(r, a), y = gam(r, b); return x / (x + y); };
  E.thompson = (arms, seed) => { const r = typeof seed === 'function' ? seed : V.rng(seed || 3); let bi = 0, bv = -1; const draws = arms.map((a, i) => { const v = E.beta(r, 1 + (a.wins || 0), 1 + (a.losses || 0)); if (v > bv) { bv = v; bi = i; } return v; }); return { pick: bi, draws }; };
  /* counterfactual "shadow twin": actual P&L vs the same trades had the written rules been followed */
  E.shadowTwin = (trades, rule) => { const R = rule || {}; let act = 0, twin = 0; const rows = (trades || []).map((t) => { const a = t.pnl || 0; let w = a; if (R.stopPct && t.mae != null && t.mae <= -R.stopPct) w = -R.stopPct * (t.size || 1); if (R.maxSize && t.size > R.maxSize) w *= R.maxSize / t.size; if (R.skipAfterLosses && t.afterLosses >= R.skipAfterLosses) w = 0; act += a; twin += w; return { id: t.id, actual: a, twin: w, delta: w - a }; }); return { actual: act, twin, delta: twin - act, rows }; };
  /* multi-rule IF-THEN automator (declarative conditions; no eval) */
  const CMP = { '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b, crosses_above: (a, b, p) => p != null && p <= b && a > b, crosses_below: (a, b, p) => p != null && p >= b && a < b };
  E.ifThen = (rules, ctx, prev) => { const fired = []; for (const r of rules || []) { const conds = Array.isArray(r.if[0]) ? r.if : [r.if], test = (c) => { const f = Object.prototype.hasOwnProperty.call(CMP, c[1]) ? CMP[c[1]] : null, rhs = typeof c[2] === 'string' && Object.prototype.hasOwnProperty.call(ctx, c[2]) ? ctx[c[2]] : c[2]; return !!f && f(ctx[c[0]], rhs, prev ? prev[c[0]] : null); }; if (r.any ? conds.some(test) : conds.every(test)) fired.push(r.then); } return fired; };
  /* Bayesian 3-agent co-pilot (Bull · Bear · Risk): prior × Π likelihoods, normalised */
  E.bayes3 = (prior, evidence) => { let p = (prior || [1 / 3, 1 / 3, 1 / 3]).slice(); for (const lk of evidence || []) { p = p.map((x, i) => x * Math.max(1e-9, lk[i])); const z = sum(p); p = p.map((x) => x / z); } const k = p.indexOf(Math.max(...p)); return { bull: p[0], bear: p[1], risk: p[2], lead: ['bull', 'bear', 'risk'][k] }; };
  /* journal RAG: TF-IDF cosine retrieval */
  const toks = (s) => String(s || '').toLowerCase().match(/[a-z0-9$#.%-]{2,}/g) || [];
  E.rag = (docs, q, k) => { const D = docs.map((d) => toks(d && d.text != null ? d.text : d)), df = new Map(); for (const t of D) for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1); const N = D.length, vec = (t) => { const m = new Map(); for (const w of t) m.set(w, (m.get(w) || 0) + 1); for (const [w, c] of m) m.set(w, c * Math.log(1 + N / (1 + (df.get(w) || 0)))); return m; }, qv = vec(toks(q)), nrm = (m) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0)) || 1; return D.map((t, i) => { const v = vec(t); let dot = 0; for (const [w, x] of qv) dot += x * (v.get(w) || 0); return { i, score: dot / (nrm(v) * nrm(qv)) }; }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k || 3); };
  /* MFE / MAE missed-alpha attribution */
  E.mfeMae = (t, bars) => { const d = t.side === 'short' ? -1 : 1, hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l)), mfe = d > 0 ? (hi / t.entry - 1) * 100 : (1 - lo / t.entry) * 100, mae = d > 0 ? (lo / t.entry - 1) * 100 : (1 - hi / t.entry) * 100, real = d * (t.exit / t.entry - 1) * 100; return { mfe, mae, realized: real, missed: mfe - real, efficiency: mfe > 0 ? real / mfe : 0 }; };
  /* risk helpers: Kelly, historical VaR / CVaR */
  E.kelly = (p, b) => clamp(p - (1 - p) / Math.max(1e-9, b), -1, 1);
  E.varCvar = (ret, a) => { const q = quant(ret, 1 - (a || 0.95)), tail = ret.filter((x) => x <= q); return { var: -q, cvar: tail.length ? -mean(tail) : -q }; };

  /* ══ 7. quant panels ══ */
  /* Merton jump-diffusion cone: seeded paths, P10 … P90 bands, +EV, Kelly f* (jump-adjusted variance), 95 % VaR / CVaR */
  E.merton = (S0, o) => {
    const p = o || {}, mu = p.mu == null ? 0.05 : p.mu, sig = p.sigma == null ? 0.6 : p.sigma, lam = p.lambda == null ? 3 : p.lambda, mJ = p.muJ == null ? -0.04 : p.muJ, sJ = p.sigJ == null ? 0.08 : p.sigJ, T = p.T || 30 / 365, steps = p.steps || 60, N = p.paths || 100, r = V.rng(p.seed || 42), dt = T / steps, k = Math.exp(mJ + (sJ * sJ) / 2) - 1;
    const paths = []; for (let j = 0; j < N; j++) { const P = new Float64Array(steps + 1); P[0] = S0; let s = S0; for (let i = 1; i <= steps; i++) { const nj = poisson(r, lam * dt); let J = 0; for (let q = 0; q < nj; q++) J += mJ + sJ * V.normal(r); s *= Math.exp((mu - lam * k - (sig * sig) / 2) * dt + sig * Math.sqrt(dt) * V.normal(r) + J); P[i] = s; } paths.push(P); }
    const qs = [0.1, 0.25, 0.5, 0.75, 0.9], bands = qs.map(() => new Float64Array(steps + 1)); for (let i = 0; i <= steps; i++) { const col = paths.map((P) => P[i]); qs.forEach((q, b) => { bands[b][i] = quant(col, q); }); }
    const term = paths.map((P) => P[steps] / S0 - 1), totVar = sig * sig + lam * (mJ * mJ + sJ * sJ), ev2 = mean(term), vc = E.varCvar(term, 0.95);
    return { paths, bands: { p10: bands[0], p25: bands[1], p50: bands[2], p75: bands[3], p90: bands[4] }, ev: ev2, positive: ev2 > 0, kelly: clamp((mu - (p.rf || 0)) / totVar, -1, 1), var95: vc.var, cvar95: vc.cvar, steps, T };
  };
  /* Lorenz / Rössler RK4 */
  const rk4 = (f, s, dt) => { const a = f(s), b = f(s.map((v, i) => v + (a[i] * dt) / 2)), c = f(s.map((v, i) => v + (b[i] * dt) / 2)), d = f(s.map((v, i) => v + c[i] * dt)); return s.map((v, i) => v + (dt / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i])); };
  const LOR = (sg, rh, bt) => (s) => [sg * (s[1] - s[0]), s[0] * (rh - s[2]) - s[1], s[0] * s[1] - bt * s[2]];
  E.lorenz = (n, o) => { const p = o || {}, f = LOR(p.sigma || 10, p.rho || 28, p.beta || 8 / 3), dt = p.dt || 0.01, out = new Float64Array(n * 3); let s = p.s0 || [1, 1, 1]; for (let i = 0; i < n; i++) { s = rk4(f, s, dt); out[i * 3] = s[0]; out[i * 3 + 1] = s[1]; out[i * 3 + 2] = s[2]; } return out; };
  E.rossler = (n, o) => { const p = o || {}, a = p.a || 0.2, b = p.b || 0.2, c = p.c || 5.7, f = (s) => [-s[1] - s[2], s[0] + a * s[1], b + s[2] * (s[0] - c)], dt = p.dt || 0.03, out = new Float64Array(n * 3); let s = [1, 1, 0]; for (let i = 0; i < n; i++) { s = rk4(f, s, dt); out[i * 3] = s[0]; out[i * 3 + 1] = s[1]; out[i * 3 + 2] = s[2]; } return out; };
  /* largest Lyapunov exponent of the Lorenz flow (Benettin renormalisation); theory ≈ 0.906 */
  E.lyapunov = (o) => { const p = o || {}, f = LOR(10, 28, 8 / 3), dt = 0.01, d0 = 1e-8, steps = p.steps || 20000; let a = [1, 1, 1]; for (let i = 0; i < 1000; i++) a = rk4(f, a, dt); let b = [a[0] + d0, a[1], a[2]], s = 0; for (let i = 0; i < steps; i++) { a = rk4(f, a, dt); b = rk4(f, b, dt); const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); s += Math.log(d / d0); b = a.map((v, k) => v + ((b[k] - v) * d0) / d); } return s / (steps * dt); };
  /* Lyapunov estimate from a series (Rosenstein, embedding 3): slope of mean log divergence; > 0 = chaotic regime */
  E.lyapSeries = (x) => { const n = x.length - 2; if (n < 30) return 0; const Y = []; for (let i = 0; i < n; i++) Y.push([x[i], x[i + 1], x[i + 2]]); const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]), nn = Y.map((y, i) => { let bj = -1, bd = Infinity; for (let j = 0; j < n; j++) { if (Math.abs(i - j) < 10) continue; const d = dist(y, Y[j]); if (d < bd && d > 0) { bd = d; bj = j; } } return bj; }), div = []; for (let k = 1; k <= 8; k++) { const l = []; for (let i = 0; i + k < n; i++) { const j = nn[i]; if (j < 0 || j + k >= n) continue; const d = dist(Y[i + k], Y[j + k]); if (d > 0) l.push(Math.log(d)); } div.push(l.length ? mean(l) : 0); } const mk = 4.5, md = mean(div); let a = 0, b = 0; for (let i = 0; i < div.length; i++) { a += (i + 1 - mk) * (div[i] - md); b += (i + 1 - mk) ** 2; } return a / b; };
  /* Hurst exponent (rescaled range over dyadic windows) */
  E.hurst = (x) => { const n = x.length; if (n < 32) return 0.5; const pts = []; for (let w = 8; w <= n / 2; w *= 2) { const rs = []; for (let s = 0; s + w <= n; s += w) { const seg = x.slice(s, s + w), m = mean(seg); let c = 0, mn = 0, mx = 0; for (const v of seg) { c += v - m; mn = Math.min(mn, c); mx = Math.max(mx, c); } const S = sd(seg); if (S > 0) rs.push((mx - mn) / S); } if (rs.length) pts.push([Math.log(w), Math.log(mean(rs))]); } if (pts.length < 2) return 0.5; const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1])); let a = 0, b = 0; for (const [u, v] of pts) { a += (u - mx) * (v - my); b += (u - mx) ** 2; } return a / (b || 1); };
  /* normalised permutation entropy (order 3): 0 = deterministic, 1 = random */
  E.permEntropy = (x, m) => { const d = m || 3, cnt = new Map(); let n = 0; for (let i = 0; i + d <= x.length; i++) { const k = x.slice(i, i + d).map((v, j) => [v, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((q) => q[1]).join(''); cnt.set(k, (cnt.get(k) || 0) + 1); n++; } let H = 0; for (const c of cnt.values()) { const p = c / n; H -= p * Math.log(p); } let f = 1; for (let i = 2; i <= d; i++) f *= i; return n ? H / Math.log(f) : 0; };
  /* eigen-risk sonar: covariance spectrum, factor shares, portfolio σ and −3σ loss */
  E.eigenRisk = (R, w) => { const k = R.length, T = R[0].length, m = R.map(mean), C = R.map((a, i) => R.map((b, j) => { let s = 0; for (let t = 0; t < T; t++) s += (a[t] - m[i]) * (b[t] - m[j]); return s / (T - 1); })), ev2 = E.eig(C), W = w || new Array(k).fill(1 / k); let pv = 0; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) pv += W[i] * W[j] * C[i][j]; const tot = sum(ev2.values.map((v) => Math.max(0, v))) || 1, sg = Math.sqrt(Math.max(0, pv)); return { eigen: ev2.values, share: ev2.values.map((v) => Math.max(0, v) / tot), top: ev2.vectors[0], sigma: sg, loss3s: 3 * sg }; };
  /* L-system + turtle → segments [x0, y0, x1, y1, depth]; the lightning core */
  E.lsystem = (axiom, rules, iters) => { let s = axiom; for (let i = 0; i < iters; i++) { let t = ''; for (const ch of s) t += Object.prototype.hasOwnProperty.call(rules, ch) ? rules[ch] : ch; s = t; if (s.length > 20000) break; } return s; };
  E.turtle = (s, ang, len) => { const segs = [], st = []; let x = 0, y = 0, a = -Math.PI / 2; for (const ch of s) { if (ch === 'F') { const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len; segs.push(x, y, nx, ny, st.length); x = nx; y = ny; } else if (ch === '+') a += ang; else if (ch === '-') a -= ang; else if (ch === '[') st.push([x, y, a]); else if (ch === ']') [x, y, a] = st.pop() || [0, 0, -Math.PI / 2]; } return Float64Array.from(segs); };
  /* Hopf fibration: each base point of S² lifts to a great circle of S³, stereographically projected to R³ (fibres are linked circles) */
  E.hopf = (nBase, nPts) => { const out = []; for (let b = 0; b < nBase; b++) { const th = Math.acos(1 - (2 * (b + 0.5)) / nBase), ph = Math.PI * (1 + Math.sqrt(5)) * b, fib = []; for (let k = 0; k < nPts; k++) { const t = (k / nPts) * 2 * Math.PI, a = Math.cos(th / 2), s = Math.sin(th / 2), x1 = a * Math.cos(t), x2 = a * Math.sin(t), x3 = s * Math.cos(t + ph), x4 = s * Math.sin(t + ph), d = 1 - x4 + 1e-9; fib.push([x1 / d, x2 / d, x3 / d]); } out.push({ th, ph, fib }); } return out; };
  /* Clifford torus point (u, v) ∈ S³, stereographic to R³ */
  E.clifford = (u, v) => { const r = Math.SQRT1_2, x4 = r * Math.sin(v), d = 1 - x4 + 1e-9; return [(r * Math.cos(u)) / d, (r * Math.sin(u)) / d, (r * Math.cos(v)) / d]; };
  /* ══ 8. panel renderers: pure (canvas 2D context + state snapshot), so the Working Bots canvases render in the 3D Spatial worker
        through OffscreenCanvas (main-thread cost = one small postMessage per frame) or on the main thread as a fallback ══ */
  const RGBc = { gold: '245,200,75', up: '47,208,138', dn: '255,90,95', ink: '216,207,182', mut: '154,145,122' };
  const f2r = (v, d) => (fin(v) ? v.toFixed(d == null ? 2 : d) : '–');
  const proj3 = (yaw, pitch, W, H, zoom) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), S = Math.min(W, H) * 0.36 * (zoom || 1); return (x, y, z) => { const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, k = 3 / (3 + z2); return [W / 2 + x1 * S * k, H * 0.54 - y1 * S * k, z2, k]; }; };
  V.proj3 = proj3;
  const R = V.R = {};
  R.KINDS = ['core', 'attr', 'cone', 'sonar', 'fire', 'lat'];
  /* 4D core: Clifford torus rotating in 4D + Hopf fibres + Kerr ring with frame-dragging spirals + L-system lightning per squad fire */
  R.core = (g, s, memo) => {
    const { W, H, d, t } = s, cx = W / 2, cy = H / 2, Rr = Math.min(W, H) * 0.3; if (!memo.ls) { memo.ls = E.turtle(E.lsystem('F', { F: 'F[+F]F[-F]F' }, 3), 0.42, 1); memo.hopf = E.hopf(10, 64); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    const a = t * 0.35, b = t * 0.22, r2 = Math.SQRT1_2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), tor = new Path2D();
    for (let i = 0; i < 18; i++) { const u = (i / 18) * 6.2832, cu = r2 * Math.cos(u), su = r2 * Math.sin(u); for (let j = 0; j <= 24; j++) { const v = (j / 24) * 6.2832, x3 = r2 * Math.cos(v), x4 = r2 * Math.sin(v), q0 = cu * ca - x4 * sa, q1 = su * cb - x3 * sb, q2 = su * sb + x3 * cb, q3 = cu * sa + x4 * ca, k = 1 / (1.35 - q3), px = cx + q0 * k * Rr, py = cy + q1 * k * Rr * 0.9 + q2 * k * Rr * 0.25; if (j) tor.lineTo(px, py); else tor.moveTo(px, py); } }
    g.strokeStyle = `rgba(${RGBc.gold},.22)`; g.lineWidth = 0.8 * d; g.stroke(tor);
    const fg = new Path2D(), fu = new Path2D(), ca7 = Math.cos(a * 0.7), sa7 = Math.sin(a * 0.7);
    memo.hopf.forEach((f, i) => { const P2 = i % 3 === 0 ? fu : fg; f.fib.forEach((p, j) => { const x = p[0] * ca7 - p[2] * sa7, z = p[0] * sa7 + p[2] * ca7, k = 2.2 / (2.2 + z), qx = cx + x * Rr * 0.55 * k, qy = cy + p[1] * Rr * 0.55 * k; if (j) P2.lineTo(qx, qy); else P2.moveTo(qx, qy); }); P2.closePath(); });
    const pulse = (0.42 + 0.15 * Math.sin(t * 2)).toFixed(3); g.lineWidth = 1.1 * d; g.strokeStyle = `rgba(${RGBc.gold},${pulse})`; g.stroke(fg); g.strokeStyle = `rgba(${RGBc.up},${pulse})`; g.stroke(fu);
    const kr = Rr * 0.32; for (let k = 0; k < 3; k++) { g.strokeStyle = `rgba(${RGBc.gold},${0.25 + k * 0.25})`; g.lineWidth = (3 - k) * d; g.beginPath(); g.ellipse(cx, cy, kr * (1 + k * 0.04), kr * 0.28, 0, 0, 6.2832); g.stroke(); }
    const spi = new Path2D(); for (let q = 0; q < 4; q++) for (let j = 0; j <= 40; j++) { const u = j / 40, an = q * 1.57 + t * 1.8 + u * 5, rr = kr * (2.4 - 1.4 * u), x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr * 0.3; if (j) spi.lineTo(x, y); else spi.moveTo(x, y); } g.strokeStyle = `rgba(${RGBc.gold},.18)`; g.lineWidth = d; g.stroke(spi);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy, kr * 0.9, kr * 0.2, 0, 0, 6.2832); g.fill(); g.globalCompositeOperation = 'lighter';
    const LS = memo.ls; for (const f of s.fx || []) { const an = (f.k / 6) * 6.2832, c1 = Math.cos(an), s1 = Math.sin(an), sc = Rr * 0.075, col = f.k === 3 ? RGBc.dn : f.k === 2 ? RGBc.up : RGBc.gold; g.strokeStyle = `rgba(${col},${(1 - f.age).toFixed(3)})`; g.lineWidth = (1.6 - f.age) * d; g.beginPath(); for (let i = 0; i < LS.length; i += 5) { const j1 = Math.sin(i * 12.9898 + f.seed) * 0.12, x0 = LS[i] + j1, y0 = LS[i + 1], x1 = LS[i + 2] + j1, y1 = LS[i + 3]; g.moveTo(cx + (x0 * c1 - y0 * s1) * sc, cy + (x0 * s1 + y0 * c1) * sc); g.lineTo(cx + (x1 * c1 - y1 * s1) * sc, cy + (x1 * s1 + y1 * c1) * sc); } g.stroke(); }
    g.globalCompositeOperation = 'source-over'; g.textAlign = 'center'; g.font = `800 ${10 * d}px Inter, system-ui, sans-serif`; g.fillStyle = V.PAL.gold; g.fillText('4D CORE · CLIFFORD TORUS · HOPF FIBRATION · KERR RING · L-SYSTEM', cx, H - 22 * d); g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = V.PAL.mut; g.fillText(`${s.mode} · ${s.active} active · ${s.real} real / ${s.demo} demo events${s.off ? ' · rendered off-thread' : ''}`, cx, H - 9 * d);
    if (s.mode === 'STANDBY') { g.fillStyle = `rgba(${RGBc.gold},.75)`; g.font = `800 ${12 * d}px Inter, system-ui, sans-serif`; g.fillText('STANDBY · no bot running', cx, 18 * d); }
  };
  /* Lorenz + Rössler attractors (data: { lz, rs } Float64Array xyz triples, sent once) */
  R.attr = (g, s, memo) => {
    const { W, H, d, t } = s, D = s.data; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    if (!D || !D.lz) { g.fillStyle = V.PAL.mut; g.font = `600 ${10 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left'; g.fillText('computing in the Quant + Spatial lanes…', 10 * d, 20 * d); return; }
    const P = proj3(t * 0.3, 0.35, W, H, 1), dr = (arr, sc, off, col) => { g.strokeStyle = col; g.lineWidth = 0.8 * d; g.beginPath(); for (let i = 0; i < arr.length; i += 3) { const p = P(arr[i] * sc[0] + off[0], arr[i + 2] * sc[2] + off[2], arr[i + 1] * sc[1] + off[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke(); };
    g.globalCompositeOperation = 'lighter'; dr(D.lz, [0.03, 0.03, 0.03], [-0.45, 0, -0.8], `rgba(${RGBc.gold},.55)`); dr(D.rs, [0.07, 0.07, 0.04], [0.5, 0, -0.5], `rgba(${RGBc.up},.5)`); g.globalCompositeOperation = 'source-over';
  };
  /* Merton cone (data: { bands, paths, steps } sent per run; s.hover = {x,y} in 0…1) */
  R.cone = (g, s, memo) => {
    const { W, H, d } = s, M = s.data; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H); if (!M || !M.bands) return;
    const B = M.bands, n = M.steps + 1, lo = Math.min(...B.p10) * 0.995, hi = Math.max(...B.p90) * 1.005; g.font = `600 ${9 * d}px ui-monospace, Menlo, monospace`; const gut = g.measureText(f2r(hi, hi < 10 ? 4 : 2)).width + 8 * d, xs = (i) => gut + (i / (n - 1)) * (W - gut - 10 * d), ys = (v) => H - 16 * d - ((v - lo) / (hi - lo || 1)) * (H - 28 * d);
    if (memo.p2 && memo.M === M && memo.W === W && memo.H === H) { /* cached */ } else { const pp = new Path2D(); for (const P of M.paths) for (let i = 0; i < n; i++) { const y = ys(P[i]); if (i) pp.lineTo(xs(i), y); else pp.moveTo(xs(i), y); } memo.p2 = pp; memo.M = M; memo.W = W; memo.H = H; }
    g.strokeStyle = `rgba(${RGBc.gold},.07)`; g.lineWidth = d * 0.7; g.stroke(memo.p2);
    const band = (a, b, al) => { g.fillStyle = `rgba(${RGBc.gold},${al})`; g.beginPath(); for (let i = 0; i < n; i++) g.lineTo(xs(i), ys(a[i])); for (let i = n - 1; i >= 0; i--) g.lineTo(xs(i), ys(b[i])); g.closePath(); g.fill(); }; band(B.p10, B.p90, 0.12); band(B.p25, B.p75, 0.18);
    g.strokeStyle = V.PAL.gold; g.lineWidth = 1.6 * d; g.beginPath(); for (let i = 0; i < n; i++) { if (i) g.lineTo(xs(i), ys(B.p50[i])); else g.moveTo(xs(i), ys(B.p50[i])); } g.stroke();
    g.fillStyle = V.PAL.mut; g.textAlign = 'right'; for (const v of [lo, (lo + hi) / 2, hi]) g.fillText(f2r(v, v < 10 ? 4 : 2), gut - 4 * d, ys(v) + 3 * d);
    if (s.hover) { const i = clamp(Math.round(((s.hover.x * W - gut) / (W - gut - 10 * d)) * (n - 1)), 0, n - 1), x = xs(i), dx = x > W * 0.6 ? -6 * d : 6 * d; g.strokeStyle = `rgba(${RGBc.ink},.6)`; g.lineWidth = d; g.beginPath(); g.moveTo(x, 6 * d); g.lineTo(x, H - 14 * d); g.stroke(); g.textAlign = x > W * 0.6 ? 'right' : 'left'; g.font = `700 ${10 * d}px ui-monospace, Menlo, monospace`; g.fillStyle = V.PAL.ink; g.fillText(`step ${i}`, x + dx, 16 * d); g.fillStyle = V.PAL.up; g.fillText(`P90 ${f2r(B.p90[i], 4)}`, x + dx, 29 * d); g.fillStyle = V.PAL.gold; g.fillText(`P50 ${f2r(B.p50[i], 4)}`, x + dx, 42 * d); g.fillStyle = V.PAL.dn; g.fillText(`P10 ${f2r(B.p10[i], 4)}`, x + dx, 55 * d); }
  };
  /* eigen-risk sonar (s.eig: { syms, top, loss3s } | null) */
  R.sonar = (g, s) => {
    const { W, H, d, t } = s, cx = W * 0.42, cy = H / 2, Rr = Math.min(W * 0.4, H * 0.44), sw = (t * 1.6) % 6.2832, e = s.eig; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = V.PAL.obs; g.fillRect(0, 0, W, H);
    g.strokeStyle = `rgba(${RGBc.up},.18)`; g.lineWidth = d; const rings = new Path2D(); for (let k = 1; k <= 4; k++) { rings.moveTo(cx + (Rr * k) / 4, cy); rings.arc(cx, cy, (Rr * k) / 4, 0, 6.2832); } g.stroke(rings);
    if (g.createConicGradient) { const gr = g.createConicGradient(sw - 0.9, cx, cy); gr.addColorStop(0, `rgba(${RGBc.up},0)`); gr.addColorStop(0.14, `rgba(${RGBc.up},.35)`); gr.addColorStop(0.145, `rgba(${RGBc.up},0)`); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Rr, 0, 6.2832); g.fill(); }
    g.strokeStyle = `rgba(${RGBc.up},.9)`; g.lineWidth = 1.5 * d; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sw) * Rr, cy + Math.sin(sw) * Rr); g.stroke();
    if (e && e.syms) e.syms.forEach((sy, i) => { const an = (i / e.syms.length) * 6.2832, rr = Rr * clamp(Math.abs(e.top[i] || 0) * 1.4, 0.12, 1), x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr, age = ((sw - an + 12.566) % 6.2832) / 6.2832, br = Math.max(0.25, 1 - age); g.fillStyle = `rgba(${(e.top[i] || 0) >= 0 ? RGBc.gold : RGBc.dn},${br.toFixed(3)})`; g.beginPath(); g.arc(x, y, 3.5 * d, 0, 6.2832); g.fill(); g.fillStyle = `rgba(${RGBc.ink},${br.toFixed(3)})`; g.font = `600 ${9 * d}px Inter, system-ui, sans-serif`; g.textAlign = 'left'; g.fillText(String(sy).replace(/^oc:[^:]+:/, '').slice(0, 9), x + 5 * d, y + 3 * d); });
    const gx = W * 0.86, gy0 = H * 0.12, gy1 = H * 0.88, lvl = e ? clamp(e.loss3s / 0.1, 0, 1) : 0; g.fillStyle = 'rgba(255,90,95,.12)'; g.fillRect(gx - 6 * d, gy0, 12 * d, gy1 - gy0); g.fillStyle = V.PAL.dn; g.fillRect(gx - 6 * d, gy1 - (gy1 - gy0) * lvl, 12 * d, (gy1 - gy0) * lvl); g.fillStyle = V.PAL.ink; g.font = `700 ${9 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.fillText('−3σ', gx, gy0 - 4 * d);
  };
  /* sub-ms firing matrix (s.v / s.f: Float32Array rows × cols cell value 0…1 and flash, s.names) */
  R.fire = (g, s) => {
    const { W, H, d } = s, rows = s.rows || 6, cols = s.cols || 30, lw = 86 * d, cw = (W - lw - 4 * d) / cols, ch = (H - 6 * d) / rows; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.font = `700 ${9 * d}px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (let r = 0; r < rows; r++) { g.fillStyle = V.PAL.ink; g.fillText(s.names[r], 0, 3 * d + ch * r + ch / 2); const col = r === 3 ? RGBc.dn : r === 2 ? RGBc.up : RGBc.gold; for (let a = 0; a < cols; a++) { const v = s.v[r * cols + a], x = lw + (cols - 1 - a) * cw, y = 3 * d + ch * r; g.fillStyle = `rgba(${col},${(0.05 + v * 0.7).toFixed(3)})`; g.fillRect(x + 1, y + 1, cw - 2, ch - 2); } }
    g.globalCompositeOperation = 'lighter'; for (let r = 0; r < rows; r++) { const col = r === 3 ? RGBc.dn : r === 2 ? RGBc.up : RGBc.gold; for (let a = 0; a < cols; a++) { const f = s.f[r * cols + a]; if (f > 0.02) { g.fillStyle = `rgba(${col},${Math.min(1, f).toFixed(3)})`; g.fillRect(lw + (cols - 1 - a) * cw, 3 * d + ch * r, cw, ch); } } } g.globalCompositeOperation = 'source-over'; g.textBaseline = 'alphabetic';
  };
  /* events / s stacked bars + worker latency histogram (s.b: [[gold, up, dn] …], s.mx, s.n, s.hi: bucket counts) */
  R.lat = (g, s) => {
    const { W, H, d } = s, half = W * 0.55, bw = half / s.n; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    s.b.forEach((b, i) => { let y = H - 14 * d; ['gold', 'up', 'dn'].forEach((k, j) => { const h = (b[j] / s.mx) * (H - 24 * d); g.fillStyle = `rgba(${RGBc[k]},.85)`; g.fillRect(i * bw + 1, y - h, bw - 2, h); y -= h; }); });
    const hm = Math.max(1, ...s.hi), x0 = half + 14 * d, bw2 = (W - x0) / s.hi.length; g.fillStyle = `rgba(${RGBc.gold},.75)`; s.hi.forEach((v, i) => { const h = (v / hm) * (H - 24 * d); g.fillRect(x0 + i * bw2 + 1, H - 14 * d - h, bw2 - 2, h); });
    g.fillStyle = V.PAL.mut; g.font = `600 ${8 * d}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; [0.1, 1, 16, 128].forEach((b) => { const i = V.LAT_BUCKETS.indexOf(b); g.fillText(b + 'ms', x0 + i * bw2 + bw2 / 2, H - 3 * d); }); g.textAlign = 'left'; g.fillText('squad events / s', 2 * d, H - 3 * d);
  };
  /* SMA-crossover Sharpe surface over (fast, slow) — the Quant Lab 3D Sharpe Surface */
  E.sharpeGrid = (close, fasts, slows) => { const n = close.length, cs = [0]; for (let i = 0; i < n; i++) cs.push(cs[i] + close[i]); const sma = (i, w) => (cs[i + 1] - cs[i + 1 - w]) / w; return fasts.map((f) => slows.map((s) => { if (f >= s) return 0; const pn = []; for (let i = s; i < n - 1; i++) pn.push((sma(i, f) > sma(i, s) ? 1 : -1) * (close[i + 1] / close[i] - 1)); return sharpe(pn); })); };
  /* book-level functions reachable from the spatial lane */
  E.shock = V.shock; E.synthBook = V.synthBook; E.stressPositions = V.stressPositions;
  /* engine catalogue: 30 named engines → implementation + home workspace (feature-coded ones: sonar / voice / recorder) */
  V.ENGINES = [
    ['Easley-O\'Hara Pin-Score', 'pin', 'markets'], ['Almgren-Chriss Slicer', 'almgrenChriss', 'markets'], ['Wavelet / FFT Cycle', 'cycle', 'markets'], ['Adaptive Kalman Filter', 'kalman', 'markets'], ['Spoof-Elasticity Half-Life', 'spoofHalfLife', 'markets'],
    ['Optimal Order-Type Selector', 'orderType', 'markets'], ['Stealth IOC Shadow-Bracket', 'shadowBracket', 'markets'], ['WebAudio Sonar', 'sonar', 'markets'], ['Draw-Pattern-to-Bot Compiler', 'drawToBot', 'markets'], ['Voice HUD (Shift+V)', 'voice', 'markets'], ['60 s Flight Recorder (Shift+R)', 'recorder', 'markets'],
    ['Sybil Wash-Trading Entropy', 'washScore', 'whales'], ['MEV Sandwich Predictor', 'mevSandwich', 'whales'], ['Smart-Money Half-Life & 30d Board', 'smartMoney', 'whales'], ['Breeden-Litzenberger RND', 'breedenLitzenberger', 'opts'], ['Gamma-Vanna-Charm Vector', 'gvc', 'opts'], ['0DTE-7DTE Pin-Risk & Max-Pain Drift', 'pinRisk', 'opts'], ['Queue-Reactive Hawkes DOM', 'hawkes', 'futs'], ['Cross-Exchange Latency Impulse', 'latencyImpulse', 'futs'],
    ['Marchenko-Pastur RMT Filter', 'marchenkoPastur', 'heat'], ['Transfer Entropy Causality', 'transferEntropy', 'heat'], ['Clayton/Gumbel Tail Copula', 'copula', 'pulse'], ['BOCPD Regime Detector', 'bocpd', 'pulse'], ['Catalyst Vol Cone', 'volCone', 'pulse'], ['Bellman-Ford Arb + Liq Heatmap', 'bellmanFord', 'desk'],
    ['Symbolic Genetic Alpha (DSR + CPCV)', 'geneticAlpha', 'lab'], ['Inverse Portfolio Stress-Tester', 'inverseStress', 'lab'], ['Thompson-Sampling Bandit', 'thompson', 'fleet'], ['Counterfactual Shadow Twin', 'shadowTwin', 'journal'], ['Multi-Rule IF-THEN Automator', 'ifThen', 'fleet'], ['Bayesian 3-Agent Co-Pilot + RAG', 'bayes3', 'ai'], ['MFE/MAE Missed-Alpha', 'mfeMae', 'journal'],
  ];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V175;
