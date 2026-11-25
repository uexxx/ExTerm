/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.2 core (pure, no DOM; also bundled into the HUD worker): the page mirror of Lanes 20–26 in serve.py, so every number on
   the cockpit is computed on the main thread in well under 5 ms and the launcher lanes only confirm it.
   · gen        monotonic generation tokens (tfSeq): a late answer for an older timeframe / symbol can never paint
   · guard      3-source rolling-median > 4σ flash-wick filter (same maths as serve.py outlier_clean, Lane 22)
   · px         adaptive decimals: sub-penny tokens, crypto, equities
   · session    US session clock (pre / regular / post / closed, extended_hours) + SHA-256 idempotency key
   · book       Lane 26: PAPER and LIVE books computed separately (a position tagged for the other book is refused), 4 KPIs, correlated
                VaR, 25 % sector cap, per-venue breakdown, Close 50 % / 100 % / Stop → BE plans, CSV / JSON export with formula guard
   · search     Lane 25: alias table + ranked symbol search, starred first
   · evo        Lanes 14 & 21: outcome-attributed evolution step, drift-locked inside the Lane 18 bounds
   · hud        the OffscreenCanvas HUD pass (Shift+Drag ruler, outlier rings, frame-0 SYMBOL · TF watermark) */
const V182 = (() => {
  const V = {};
  V.VERSION = '18.2'; V.GOLD = '#F5C84B'; V.RED = '#EF4444';
  V.UI_MS = 10; V.TF_MS = 5; V.LANE_MS = 5; V.HOVER_MS = 80; V.OPEN_MS = 2; V.TAB_MS = 0.5;
  V.LANES = { 20: 'US Session Router · Macro Throttle · Idempotency', 21: 'Auto-Evolution (Stocks EVO · Crypto/DEX EVO)', 22: '3-Source > 4σ Outlier Guard', 23: 'Serial-Rugger Blacklist', 24: 'Warm-Boot Snapshot', 25: 'Search · Aliasing · Watchlist', 26: 'Portfolio VaR · Sector Cap · PnL' };
  V.KEYS = { '1': 'alpha', '2': 'botradar', '3': 'brain', '4': 'livebot', '5': 'copilot' };

  /* ══ 1. generation tokens ══ */
  V.gen = () => { const g = { n: 0, bump() { return ++g.n; }, live(t) { return t === g.n; } }; return g; };

  /* ══ 2. Lane 22 outlier guard (rows: {t,o,h,l,c,v}) ══ */
  const med = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return !n ? 0 : n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  V.med = med;
  V.outliers = (rows, refs, k, win, floor) => {
    k = k || 4; win = win || 20; floor = floor || 0.0005; const n = rows ? rows.length : 0;
    if (n < 5) return { rows: (rows || []).map((r) => Object.assign({}, r)), fixed: [] };
    const R = (refs || []).slice(0, 2).map((ref) => { const m = new Map(); for (const x of ref || []) if (x && x.c > 0) m.set(x.t, x); return m; });
    const out = rows.map((r) => Object.assign({}, r)), fixed = [];
    const up = rows.map((r) => { const b = Math.max(r.o, r.c); return b > 0 ? Math.max(0, r.h / b - 1) : 0; }), dn = rows.map((r) => { const b = Math.min(r.o, r.c); return b > 0 ? Math.max(0, 1 - r.l / b) : 0; });
    const ref = [], gap = [];
    for (let i = 0; i < n; i++) { const r = rows[i], others = R.map((m) => m.get(r.t)).filter((x) => x && x.c > 0).map((x) => x.c), src = others.length ? [r.c].concat(others) : [rows[Math.max(0, i - 1)].c, r.c, rows[Math.min(n - 1, i + 1)].c], m = med(src); ref.push([m, others.length]); gap.push(r.c > 0 && m > 0 ? Math.log(r.c / m) : 0); }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - win), b = Math.min(n, i + win + 1), rs = (arr) => { const xs = []; for (let j = a; j < b; j++) if (j !== i) xs.push(arr[j]); const m = med(xs); return [m, Math.max(floor, 1.4826 * med(xs.map((x) => Math.abs(x - m))))]; };
      const r = out[i], [m, conf] = ref[i]; let ch = false; const [gm, gs] = rs(gap);
      if (conf >= 1 && Math.abs(gap[i] - gm) > k * gs && m > 0) { r.c = m; r.o = Math.min(Math.max(r.o, r.l), r.h); ch = true; }
      const [um, us] = rs(up), [dm, ds] = rs(dn), hb = Math.max(r.o, r.c), lb = Math.min(r.o, r.c), oth = R.map((mm) => mm.get(r.t)).filter(Boolean);
      const capH = hb * (1 + um + k * us), capL = lb * (1 - dm - k * ds), nbMax = (arr) => { let mx = 0; for (let j = a; j < b; j++) if (j !== i && arr[j] > mx) mx = arr[j]; return mx; };
      /* one source only (no other feed has this bar): clip only a true flash spike, > the 4σ cap AND > 3× the largest neighbouring wick */
      const okH = oth.length ? !oth.some((x) => x.h >= r.h * 0.999) : up[i] > 3 * nbMax(up) + floor, okL = oth.length ? !oth.some((x) => x.l > 0 && x.l <= r.l * 1.001) : dn[i] > 3 * nbMax(dn) + floor;
      if (r.h > capH && okH) { r.h = Math.max(capH, oth.length ? Math.max(...oth.map((x) => x.h)) : 0, hb); ch = true; }
      if (r.l < capL && okL) { r.l = Math.min(capL, oth.length ? Math.min(...oth.map((x) => x.l)) : capL, lb); ch = true; }
      r.h = Math.max(r.h, r.o, r.c); r.l = Math.min(r.l, r.o, r.c);
      if (ch) { r.guard = 1; fixed.push(i); }
    }
    return { rows: out, fixed };
  };
  /* guard only the newest n bars (older bars were guarded when they were new); keeps the array identity-free and cheap */
  V.guardTail = (rows, refs, n) => { n = n || 240; if (!rows || rows.length < 8) return { rows: rows || [], fixed: [] }; const cut = Math.max(0, rows.length - n), g = V.outliers(rows.slice(cut), refs, 4, 20); return { rows: cut ? rows.slice(0, cut).concat(g.rows) : g.rows, fixed: g.fixed.map((i) => i + cut) }; };

  /* ══ 3. adaptive decimals ══ */
  V.dec = (p, kind) => { const a = Math.abs(+p); if (!(a > 0)) return 2; if (kind === 'stock') return a < 1 ? 4 : 2; if (a >= 1000) return 2; if (a >= 1) return a >= 100 ? 2 : 4; const z = Math.floor(-Math.log10(a)); return Math.min(12, z + 4); };
  V.px = (p, kind) => { if (!(+p > 0) && +p !== 0) return '–'; const d = V.dec(p, kind); return (+p).toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }); };
  V.money = (v) => (v < 0 ? '−$' : '$') + Math.abs(+v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  V.pct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+v || 0).toFixed(2) + '%';

  /* ══ 4. US session clock + SHA-256 idempotency ══ */
  const sunN = (y, m, n) => { const d1 = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - d1) % 7) + 7 * (n - 1); };
  V.dst = (ts) => { const y = new Date(ts * 1000).getUTCFullYear(); return ts >= Date.UTC(y, 2, sunN(y, 2, 2), 7) / 1000 && ts < Date.UTC(y, 10, sunN(y, 10, 1), 6) / 1000; };
  V.session = (ts) => {
    ts = ts == null ? Date.now() / 1000 : ts; const off = V.dst(ts) ? -4 : -5, et = new Date((ts + off * 3600) * 1000), mins = et.getUTCHours() * 60 + et.getUTCMinutes(), wd = et.getUTCDay(), wk = wd >= 1 && wd <= 5;
    const s = !wk ? 'closed' : mins >= 240 && mins < 570 ? 'pre' : mins >= 570 && mins < 960 ? 'regular' : mins >= 960 && mins < 1200 ? 'post' : 'closed';
    return { session: s, extended_hours: s === 'pre' || s === 'post', open: s === 'regular', offset: off };
  };
  /* canonical identity string (same as serve.py idem_key): fixed field order, numbers as %.8f, strings as-is */
  V.IDEM = ['sym', 'side', 'usd', 'px', 'src', 'nonce'];
  V.idemStr = (o) => V.IDEM.filter((k) => o[k] != null).map((k) => k + '=' + (typeof o[k] === 'number' ? o[k].toFixed(8) : String(o[k]))).join('|');
  /* SHA-256 (FIPS 180-4), sync, UTF-8 */
  const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  V.sha256 = (str) => {
    const b = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str) : Uint8Array.from(unescape(encodeURIComponent(str)), (c) => c.charCodeAt(0));
    const l = b.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(b); m[l] = 0x80; const bits = l * 8; for (let i = 0; i < 8; i++) m[nb - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 255;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64), ro = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = ro(w[i - 15], 7) ^ ro(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = ro(w[i - 2], 17) ^ ro(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const t1 = (h + (ro(e, 6) ^ ro(e, 11) ^ ro(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0, t2 = ((ro(a, 2) ^ ro(a, 13) ^ ro(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0; }
      H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
  };
  V.idemKey = (o) => V.sha256(V.idemStr(o));

  /* ══ 5. Lane 26: isolated PAPER / LIVE books ══ */
  V.SECTORS = { BTC: 'crypto-L1', ETH: 'crypto-L1', SOL: 'crypto-L1', AVAX: 'crypto-L1', SUI: 'crypto-L1', XRP: 'crypto-pay', DOGE: 'crypto-meme', LINK: 'crypto-infra', HYPE: 'crypto-perp-dex', NVDA: 'semis', AMD: 'semis', AVGO: 'semis', SMCI: 'semis', AAPL: 'megacap-tech', MSFT: 'megacap-tech', GOOGL: 'megacap-tech', META: 'megacap-tech', AMZN: 'megacap-tech', NFLX: 'megacap-tech', TSLA: 'auto-ev', JPM: 'financials', COIN: 'crypto-equity', MSTR: 'crypto-equity', PLTR: 'software', UBER: 'software', XOM: 'energy', SPY: 'index', QQQ: 'index', IWM: 'index' };
  V.SECTOR_CAP = 0.25; V.RHO_IN = 0.6; V.RHO_OUT = 0.3;
  V.sectorOf = (sym) => { const s = String(sym || ''); if (s.startsWith('oc:')) return 'dex-' + (s.split(':').length >= 3 ? s.split(':')[1] : 'chain'); return V.SECTORS[s.split('-')[0].toUpperCase()] || (s.includes('-') ? 'crypto-alt' : 'equity-other'); };
  V.posVal = (p) => { const q = Math.abs(+p.qty || 0), e = +p.entry || 0, m = +p.mark || e, sg = p.side === 'short' ? -1 : 1, st = +p.stop || 0; return { value: q * m, upnl: sg * (m - e) * q, risk: st > 0 ? q * Math.max(0, sg * (m - st)) : q * m, noStop: !(st > 0), sector: V.sectorOf(p.sym), vol: Math.max(0.002, Math.min(0.5, +p.vol || 0.03)) }; };
  const r2 = (x) => Math.round(x * 100) / 100;
  V.kpis = (cash, pos, realizedDay, lev, unreal0) => {
    const vs = pos.map(V.posVal); let gross = 0, upnl = 0, risk = 0, nlv = +cash || 0, ns = 0;
    vs.forEach((v, i) => { gross += v.value; upnl += v.upnl; risk += v.risk; ns += v.noStop ? 1 : 0; nlv += pos[i].side === 'short' ? v.upnl : v.value; });
    return { nlv: r2(nlv), buyingPower: r2(Math.max(0, +cash || 0) * Math.max(1, +lev || 1)), riskToStop: r2(risk), dayPnl: r2((+realizedDay || 0) + upnl - (+unreal0 || 0)), unrealized: r2(upnl), realizedDay: r2(+realizedDay || 0), gross: r2(gross), open: pos.length, noStop: ns };
  };
  V.var95 = (pos, z) => { z = z || 1.65; const xs = pos.map((p) => { const v = V.posVal(p); return [v.value * v.vol * (p.side === 'short' ? -1 : 1), v.sector]; }); let s2 = 0; for (let i = 0; i < xs.length; i++) for (let j = 0; j < xs.length; j++) s2 += xs[i][0] * xs[j][0] * (i === j ? 1 : xs[i][1] === xs[j][1] ? V.RHO_IN : V.RHO_OUT); return r2(z * Math.sqrt(Math.max(0, s2))); };
  V.sectorCaps = (pos, nlv, cap) => { cap = cap || V.SECTOR_CAP; const ex = new Map(); for (const p of pos) { const v = V.posVal(p); ex.set(v.sector, (ex.get(v.sector) || 0) + v.value); } const base = Math.max(1, nlv); return [...ex].sort((a, b) => b[1] - a[1]).map(([k, u]) => ({ sector: k, usd: r2(u), pct: r2((u / base) * 100), breach: u / base > cap })); };
  V.agg = (books) => {
    const out = {};
    for (const mode of ['PAPER', 'LIVE']) {
      const b = (books && books[mode]) || {}, pos = (b.pos || []).slice(0, 500), bad = pos.filter((p) => (p.mode || mode) !== mode);
      if (bad.length) throw new Error('mixed balances refused: ' + bad.length + ' position(s) tagged for the other book in ' + mode);
      const k = V.kpis(b.cash, pos, b.realizedDay, b.lev, b.unreal0), venues = {};
      for (const p of pos) { const v = String(p.venue || 'paper').slice(0, 24); venues[v] = r2((venues[v] || 0) + V.posVal(p).value); }
      out[mode] = Object.assign(k, { var95: V.var95(pos), sectors: V.sectorCaps(pos, k.nlv), venues, wallets: Object.assign({}, b.wallets || {}) });
    }
    return { books: out, isolated: true };
  };
  V.sectorCheck = (pos, nlv, sym, usd) => { const sec = V.sectorOf(sym); let cur = 0; for (const p of pos) { const v = V.posVal(p); if (v.sector === sec) cur += v.value; } const after = cur + Math.max(0, +usd || 0); return { sector: sec, pct: r2((after / Math.max(1, nlv)) * 100), ok: after / Math.max(1, nlv) <= V.SECTOR_CAP }; };
  /* one-click plans on one position (never touches the other book) */
  V.closeQty = (p, frac) => { const q = Math.abs(+p.qty || 0), f = Math.max(0, Math.min(1, +frac || 0)); return f >= 1 ? q : q * f; };
  V.beStop = (p) => { const e = +p.entry || 0, m = +p.mark || e, long = p.side !== 'short'; if (!(e > 0)) return { ok: false, why: 'no entry price' }; if (long ? m <= e : m >= e) return { ok: false, why: 'position is not in profit: a break-even stop would close it at once' }; return { ok: true, stop: e }; };
  /* CSV with spreadsheet formula-injection guard (=, +, -, @, tab, CR lead → quoted with a leading apostrophe) */
  V.csvCell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) s = "'" + s; return /[",\n\r]/.test(s) || s.startsWith("'") ? '"' + s.replace(/"/g, '""') + '"' : s; };
  V.csv = (rows, cols) => [cols.map((c) => V.csvCell(c[1])).join(',')].concat(rows.map((r) => cols.map((c) => V.csvCell(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))).join('\r\n') + '\r\n';

  /* ══ 6. Lane 25: aliases + ranked search ══ */
  V.ALIASES = { bitcoin: 'BTC-USD', xbt: 'BTC-USD', ether: 'ETH-USD', ethereum: 'ETH-USD', solana: 'SOL-USD', ripple: 'XRP-USD', dogecoin: 'DOGE-USD', chainlink: 'LINK-USD', avalanche: 'AVAX-USD', hyperliquid: 'HYPE-USD', nvidia: 'NVDA', apple: 'AAPL', microsoft: 'MSFT', amazon: 'AMZN', google: 'GOOGL', alphabet: 'GOOGL', facebook: 'META', fb: 'META', tesla: 'TSLA', netflix: 'NFLX', palantir: 'PLTR', coinbase: 'COIN', microstrategy: 'MSTR', strategy: 'MSTR', broadcom: 'AVGO', 's&p': 'SPY', sp500: 'SPY', spx: 'SPY', nasdaq: 'QQQ', ndx: 'QQQ', russell: 'IWM' };
  V.NAMES = { 'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', 'SOL-USD': 'Solana', 'XRP-USD': 'XRP', 'DOGE-USD': 'Dogecoin', 'AVAX-USD': 'Avalanche', 'LINK-USD': 'Chainlink', 'SUI-USD': 'Sui', 'HYPE-USD': 'Hyperliquid', SPY: 'S&P 500 ETF', QQQ: 'Nasdaq-100 ETF', IWM: 'Russell 2000 ETF', AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon', META: 'Meta Platforms', GOOGL: 'Alphabet', TSLA: 'Tesla', AMD: 'AMD', AVGO: 'Broadcom', JPM: 'JPMorgan', NFLX: 'Netflix', PLTR: 'Palantir', COIN: 'Coinbase', MSTR: 'Strategy', UBER: 'Uber', XOM: 'Exxon Mobil', SMCI: 'Supermicro' };
  V.search = (q, stars, limit, norm, extra) => {
    const q0 = String(q || '').trim().slice(0, 200), ql = q0.toLowerCase(), S = stars || [], out = new Map(), lim = limit || 12;
    const N = norm || (typeof V181 !== 'undefined' ? V181.norm : null), kindOf = (s) => { const n = N ? N(s) : null; return n ? n.kind : ''; };
    const add = (sym, kind, sc, why) => { if (!sym) return; const cur = out.get(sym), score = sc + (S.includes(sym) ? 50 : 0); if (!cur || cur.score < score) out.set(sym, { sym, kind, name: V.NAMES[sym] || '', score, star: S.includes(sym), why }); };
    if (!ql) { S.slice(0, lim).forEach((s) => add(s, kindOf(s), 100, 'starred')); return [...out.values()].sort((a, b) => b.score - a.score).slice(0, lim); }
    const c = N ? N(q0) : null; if (c && c.kind !== 'stock') add(c.sym, c.kind, 1000, 'canonical');
    if (V.ALIASES[ql]) add(V.ALIASES[ql], kindOf(V.ALIASES[ql]), 900, 'alias');
    const uni = Object.keys(V.NAMES).concat(S.filter((s) => !V.NAMES[s]), (extra || []).filter((s) => !V.NAMES[s]));
    for (const s of uni) { const base = s.split('-')[0].toLowerCase(), nm = (V.NAMES[s] || '').toLowerCase(); if (base === ql) add(s, kindOf(s), 950, 'ticker'); else if (base.startsWith(ql)) add(s, kindOf(s), 700 - base.length, 'ticker prefix'); else if (nm.startsWith(ql)) add(s, kindOf(s), 600 - nm.length, 'name'); else if (nm.includes(ql) || s.toLowerCase().includes(ql)) add(s, kindOf(s), 300, 'contains'); }
    for (const al in V.ALIASES) if (al.startsWith(ql) && al !== ql) add(V.ALIASES[al], kindOf(V.ALIASES[al]), 500, 'alias prefix');
    if (c && c.kind === 'stock' && !out.size) add(c.sym, c.kind, 400, 'ticker');
    return [...out.values()].sort((a, b) => b.score - a.score).slice(0, lim);
  };

  /* ══ 7. Lanes 14 & 21: outcome-attributed evolution (same rules as serve.py evo_step) ══ */
  V.EVO_START = { riskPct: 1.0, atrStop: 1.5, tp1R: 1.0, tp2R: 2.5, minScore: 0.6 };
  V.EVO_BOUNDS = { riskPct: [0.25, 2.0], atrStop: [0.8, 3.0], tp1R: [0.5, 2.0], tp2R: [1.5, 5.0], minScore: [0.45, 0.9] }; V.EVO_DRIFT = 0.1; V.EVO_BATCH = 10;
  V.evoBookOf = (sym, norm) => { const N = norm || (typeof V181 !== 'undefined' ? V181.norm : null), n = N ? N(String(sym || '')) : null; return n && n.kind === 'stock' ? 'stocks' : 'crypto'; };
  V.evoStep = (params, outs) => {
    const n = outs.length; if (!n) return { params: Object.assign({}, params), notes: [] };
    const wins = outs.filter((o) => o.r > 0), losses = outs.filter((o) => o.r <= 0), wr = wins.length / n, exp = outs.reduce((s, o) => s + o.r, 0) / n;
    const stopped = losses.filter((o) => o.exit === 'stop').length / Math.max(1, losses.length), tp2 = wins.filter((o) => o.exit === 'tp2').length / Math.max(1, wins.length);
    const low = outs.filter((o) => (o.score != null ? o.score : 1) < params.minScore + 0.1), lowExp = low.length ? low.reduce((s, o) => s + o.r, 0) / low.length : 0;
    const want = Object.assign({}, params), notes = [];
    if (low.length && lowExp < 0) { want.minScore += 0.05; notes.push('low-score setups lost ' + lowExp.toFixed(2) + 'R on average: minScore up'); } else if (wr > 0.6 && exp > 0.3) { want.minScore -= 0.03; notes.push('win rate ' + Math.round(wr * 100) + '%: minScore down'); }
    if (stopped > 0.6 && wr < 0.45) { want.atrStop += 0.25; notes.push(Math.round(stopped * 100) + '% of losses hit the stop: stop widened'); }
    if (wins.length && tp2 < 0.2) { want.tp2R -= 0.3; notes.push('only ' + Math.round(tp2 * 100) + '% of winners reached TP2: TP2 pulled in'); } else if (wins.length && tp2 > 0.6) { want.tp2R += 0.3; notes.push(Math.round(tp2 * 100) + '% of winners reached TP2: TP2 extended'); }
    want.riskPct *= exp > 0.25 ? 1.1 : exp < 0 ? 0.8 : 1; if (exp < 0) notes.push('expectancy ' + exp.toFixed(2) + 'R: risk per trade cut');
    const out = {}; for (const k in V.EVO_BOUNDS) { const [lo, hi] = V.EVO_BOUNDS[k], cap = (hi - lo) * V.EVO_DRIFT, v = Math.max(params[k] - cap, Math.min(params[k] + cap, want[k])); out[k] = Math.round(Math.max(lo, Math.min(hi, v)) * 1e4) / 1e4; }
    return { params: out, notes };
  };
  V.inBounds = (p) => Object.keys(V.EVO_BOUNDS).every((k) => p[k] >= V.EVO_BOUNDS[k][0] - 1e-9 && p[k] <= V.EVO_BOUNDS[k][1] + 1e-9);

  /* ══ 8. chart HUD pass (runs in the OffscreenCanvas worker; the main thread falls back to the same function) ══
     s = { W, H, d, mark: 'BTC-USD · 1h', seq, ruler: { x0, y0, x1, y1, txt, up }, rings: [[x, y]], box: [x0, y0, x1, y1] } (CSS px) */
  V.ruler = (p1, p2, t1, t2, tf) => { const dp = p2 - p1, pct = p1 > 0 ? (dp / p1) * 100 : 0, bars = tf > 0 ? Math.round(Math.abs(t2 - t1) / tf) : 0, secs = Math.abs(t2 - t1); const dur = secs >= 86400 ? (secs / 86400).toFixed(1) + 'd' : secs >= 3600 ? (secs / 3600).toFixed(1) + 'h' : secs >= 60 ? Math.round(secs / 60) + 'm' : Math.round(secs) + 's'; return { dp, pct, bars, dur, up: dp >= 0, txt: (dp >= 0 ? '+' : '−') + V.px(Math.abs(dp)) + '  (' + V.pct(pct) + ')  ·  ' + bars + ' bars  ·  ' + dur }; };
  V.hud = (g, s) => {
    const d = s.d || 1, W = s.W, H = s.H; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, s.Wd || W * d, s.Hd || H * d); g.setTransform(d, 0, 0, d, 0, 0);
    const GA = (a) => 'rgba(245,200,75,' + a + ')', RA = (a) => 'rgba(239,68,68,' + a + ')', MONO = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';
    if (s.box) { g.save(); g.beginPath(); g.rect(s.box[0], s.box[1], s.box[2] - s.box[0], s.box[3] - s.box[1]); g.clip(); }
    for (const r of s.rings || []) { g.strokeStyle = RA(0.85); g.lineWidth = 1.2; g.beginPath(); g.arc(r[0], r[1], 5, 0, Math.PI * 2); g.stroke(); }
    const R = s.ruler;
    if (R) { const c = R.up ? GA : RA, x = Math.min(R.x0, R.x1), y = Math.min(R.y0, R.y1); g.fillStyle = c(0.1); g.fillRect(x, y, Math.abs(R.x1 - R.x0), Math.abs(R.y1 - R.y0)); g.strokeStyle = c(0.9); g.lineWidth = 1.2; g.setLineDash([4, 3]); g.strokeRect(x + 0.5, y + 0.5, Math.abs(R.x1 - R.x0), Math.abs(R.y1 - R.y0)); g.setLineDash([]);
      g.font = '600 11px ' + MONO; const tw = g.measureText(R.txt).width + 14, tx = Math.min(Math.max(4, R.x1 + 8), W - tw - 4), ty = Math.min(Math.max(4, R.y1 - 22), H - 24); g.fillStyle = 'rgba(10,13,18,0.94)'; g.fillRect(tx, ty, tw, 20); g.strokeStyle = c(0.9); g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 19); g.fillStyle = c(1); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(R.txt, tx + 7, ty + 10); }
    if (s.box) g.restore();
    if (s.mark) { g.font = '600 10.5px ' + MONO; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillStyle = GA(0.55); g.fillText(s.mark, (s.box ? s.box[2] : W) - 6, (s.box ? s.box[1] : 0) + 4); }
  };
  return V;
})();
if (typeof module !== 'undefined') module.exports = V182;
