/* ExTerm v15.2 core: pure logic behind the 44 workstation upgrades. Charting (bar timer, TP ladder, price-action labels,
   magnet snap, future event markers), order flow (walls, CVD divergence, anchored VWAP, session profiles, zero gamma,
   unusual options, multi-leg payoff), markets (swap memory, scanner formulas, DEX safety, wallet confluence, net inflow,
   sparklines, DEX fee simulator), quant (composer → Pine v5, portfolio backtest, sensitivity grid, weak-gate fixes, prop
   rulebooks, blind drill, MFE/MAE, battles), copilot (NL rule compiler, range stats, devil's advocate grade, impact tags,
   alert cards, brief, shadow fills) and platform (signed share codes, ring-buffer trim, theme tokens, safe calculator,
   SHA256SUMS + CSP checks). No DOM and no eval here: unit-tested in Node. */
const V152 = (() => {
  const V = {};
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  const STR = (s, n) => String(s == null ? '' : s).slice(0, n);
  const r2 = (x, k = 2) => Math.round(x * 10 ** k) / 10 ** k;
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  V.pearson = (a, b) => { const n = Math.min(a.length, b.length); if (n < 3) return null; const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n)); let x = 0, ya = 0, yb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; x += da * db; ya += da * da; yb += db * db; } return ya && yb ? x / Math.sqrt(ya * yb) : null; };

  /* ══ PHASE 1 · charting ══ */
  /* 1. time left in the current bar */
  V.barTimer = (nowMs, tfSec) => {
    if (!(tfSec > 0) || !fin(nowMs)) return null;
    const p = tfSec * 1000, left = p - (((nowMs % p) + p) % p);
    const label = left >= 60000 ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : tfSec <= 15 ? (left / 1000).toFixed(1) + 's' : Math.ceil(left / 1000) + 's';
    return { left, frac: 1 - left / p, label };
  };
  /* 2. sync groups: messages between windows, accepted only for the same group and a known kind */
  V.GROUPS = ['A', 'B', 'C'];
  const SYM_RX = /^[A-Za-z0-9:._^=\-]{1,100}$/, TF_RX = /^(1s|5s|15s|1m|5m|15m|1h|4h|1d|1w)$/;
  V.syncAccept = (m, group, opt = {}) => {
    if (!m || typeof m !== 'object' || m.k !== 'v152sync' || !V.GROUPS.includes(m.g) || m.g !== group) return null;
    if (m.kind === 'cross' && opt.cross !== false && fin(m.v)) return { kind: 'cross', v: m.v };
    if (m.kind === 'tf' && opt.tf !== false && typeof m.v === 'string' && TF_RX.test(m.v)) return { kind: 'tf', v: m.v };
    if (m.kind === 'sym' && opt.sym !== false && typeof m.v === 'string' && SYM_RX.test(m.v)) return { kind: 'sym', v: m.v };
    return null;
  };
  /* 3. partial take-profit ladder: TPn at rs[n] × risk, splits in % of the position; after TP1 the stop moves to entry */
  V.tpLadder = (entry, sl, splits = [50, 30, 20], rs = [1, 2, 3]) => {
    if (!(entry > 0) || !(sl > 0) || entry === sl) return null;
    const long = sl < entry, risk = Math.abs(entry - sl), tot = splits.reduce((s, x) => s + Math.max(0, +x || 0), 0) || 1;
    return { entry, sl, long, be: false, levels: rs.slice(0, 3).map((r, i) => ({ k: 'TP' + (i + 1), p: long ? entry + risk * r : entry - risk * r, pct: r2((Math.max(0, +splits[i] || 0) / tot) * 100, 1), hit: false })) };
  };
  V.tpStep = (L, price) => {
    if (!L || !(price > 0)) return { closePct: 0, events: [] };
    const ev = []; let closePct = 0;
    if (L.long ? price <= L.sl : price >= L.sl) { const left = L.levels.filter((x) => !x.hit).reduce((s, x) => s + x.pct, 0); if (left > 0) { L.levels.forEach((x) => (x.hit = true)); ev.push(L.be ? 'stopped at break-even' : 'stopped out'); return { closePct: r2(left, 1), events: ev, done: true }; } }
    for (const x of L.levels) if (!x.hit && (L.long ? price >= x.p : price <= x.p)) { x.hit = true; closePct += x.pct; ev.push(x.k + ' hit'); if (x.k === 'TP1' && !L.be) { L.be = true; L.sl = L.entry; ev.push('stop → break-even'); } }
    return { closePct: r2(closePct, 1), events: ev, done: L.levels.every((x) => x.hit) };
  };
  /* 4. price-action labels: fair value gaps, engulfing bars, order blocks, liquidity sweeps */
  V.fvg = (D, from = 2, to = D.length) => { const out = []; for (let i = Math.max(2, from); i < Math.min(to, D.length); i++) { const a = D[i - 2], c = D[i]; if (a.h < c.l) out.push({ i, dir: 'bull', top: c.l, bot: a.h, kind: 'FVG' }); else if (a.l > c.h) out.push({ i, dir: 'bear', top: a.l, bot: c.h, kind: 'FVG' }); } return out; };
  V.engulf = (D, from = 1, to = D.length) => {
    const out = [];
    for (let i = Math.max(1, from); i < Math.min(to, D.length); i++) {
      const p = D[i - 1], c = D[i], pb = Math.abs(p.c - p.o), cb = Math.abs(c.c - c.o); if (!(cb > pb) || pb === 0) continue;
      if (p.c < p.o && c.c > c.o && c.o <= p.c && c.c >= p.o) out.push({ i, dir: 'bull', kind: 'ENG', p: c.l });
      else if (p.c > p.o && c.c < c.o && c.o >= p.c && c.c <= p.o) out.push({ i, dir: 'bear', kind: 'ENG', p: c.h });
    }
    return out;
  };
  V.orderBlocks = (D, from = 21, to = D.length, k = 2) => {
    const out = [];
    for (let i = Math.max(21, from); i < Math.min(to, D.length); i++) {
      const avg = mean(D.slice(i - 20, i).map((x) => Math.abs(x.c - x.o))), c = D[i], b = Math.abs(c.c - c.o); if (!(avg > 0) || b < k * avg) continue;
      const up = c.c > c.o; for (let j = i - 1; j >= Math.max(0, i - 5); j--) { const o = D[j]; if (up ? o.c < o.o : o.c > o.o) { out.push({ i: j, dir: up ? 'bull' : 'bear', top: o.h, bot: o.l, kind: 'OB' }); break; } }
    }
    return out;
  };
  V.sweeps = (D, from = 20, to = D.length, look = 20) => {
    const out = [];
    for (let i = Math.max(look, from); i < Math.min(to, D.length); i++) {
      let hh = -Infinity, ll = Infinity; for (let j = i - look; j < i; j++) { hh = Math.max(hh, D[j].h); ll = Math.min(ll, D[j].l); }
      const c = D[i]; if (c.h > hh && c.c < hh) out.push({ i, dir: 'bear', kind: 'SWEEP', p: c.h }); else if (c.l < ll && c.c > ll) out.push({ i, dir: 'bull', kind: 'SWEEP', p: c.l });
    }
    return out;
  };
  V.patterns = (D, from, to, on = {}) => [].concat(on.fvg ? V.fvg(D, from, to) : [], on.eng ? V.engulf(D, from, to) : [], on.ob ? V.orderBlocks(D, from, to) : [], on.sweep ? V.sweeps(D, from, to) : []).slice(-120);
  /* 5. magnet: snap a price to the nearest OHLC of a candle (within tol, if given) */
  V.snap = (price, c, tol) => {
    if (!c || !fin(price)) return price; let best = price, bd = Infinity;
    for (const v of [c.o, c.h, c.l, c.c]) { const d = Math.abs(v - price); if (fin(v) && d < bd) { bd = d; best = v; } }
    return tol == null || bd <= tol ? best : price;
  };
  /* 6. upcoming events (scheduled, earnings, user-added) inside a horizon */
  V.futureEvents = (nowSec, list, horizonSec = 14 * 86400) => (list || []).filter((e) => e && fin(+e.t) && e.t >= nowSec && e.t <= nowSec + horizonSec).map((e) => ({ t: +e.t, k: STR(e.k || 'ev', 8), l: STR(e.l || 'Event', 60), inSec: e.t - nowSec })).sort((a, b) => a.t - b.t).slice(0, 20);
  V.parseEvent = (s) => { const m = /^\s*([A-Za-z][\w &/.-]{0,30}?)\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?\s*$/.exec(String(s || '')); if (!m) return null; const t = Date.parse(`${m[2]}T${m[3] || '12'}:${m[4] || '30'}:00Z`) / 1000; return fin(t) ? { t, k: /cpi/i.test(m[1]) ? 'cpi' : /fomc|fed/i.test(m[1]) ? 'fomc' : /earn/i.test(m[1]) ? 'earn' : 'ev', l: m[1].trim() } : null; };

  /* ══ PHASE 2 · order flow, options ══ */
  /* 9. DOM walls: absorption (traded into but still there / refilled = iceberg) vs spoof (pulled without trading) */
  const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  V.wallsOf = (book, k = 4) => { const out = []; for (const side of ['bids', 'asks']) { const lv = (book && book[side]) || [], m = med(lv.map((x) => +x[1])); if (!(m > 0)) continue; for (const [p, q] of lv) if (+q >= k * m) out.push({ side, p: +p, q: +q }); } return out; };
  V.wallEvents = (prev, cur, traded = {}, k = 4) => {
    const now = new Map(); for (const side of ['bids', 'asks']) for (const [p, q] of (cur && cur[side]) || []) now.set(side + ':' + +p, +q);
    return V.wallsOf(prev, k).map((w) => {
      const q2 = now.get(w.side + ':' + w.p), hit = +traded[w.p] || 0;
      if (q2 == null || q2 < 0.25 * w.q) return hit < 0.3 * w.q ? Object.assign(w, { ev: 'spoof', note: 'pulled without trading' }) : Object.assign(w, { ev: 'broken', note: 'eaten through' });
      if (hit >= 0.5 * w.q && q2 >= 0.8 * w.q) return Object.assign(w, { ev: 'iceberg', note: 'refilled after ' + r2(hit, 2) + ' traded' });
      if (hit >= 0.2 * w.q) return Object.assign(w, { ev: 'absorb', note: 'absorbing market orders' });
      return Object.assign(w, { ev: 'rest', note: 'resting' });
    }).filter((w) => w.ev !== 'rest');
  };
  /* 10. CVD (candle-estimated delta) + divergence at swing highs / lows */
  V.cvd = (D) => { let s = 0; return D.map((c) => { const rng = c.h - c.l; s += rng > 0 ? ((c.c - c.o) / rng) * (c.v || 0) : 0; return s; }); };
  V.cvdDiv = (D, look = 3) => {
    const cv = V.cvd(D), piv = (i, hi) => { for (let j = i - look; j <= i + look; j++) if (j !== i && (hi ? D[j].h >= D[i].h : D[j].l <= D[i].l)) return false; return true; };
    const H = [], L = [], out = [];
    for (let i = look; i < D.length - look; i++) { if (piv(i, true)) H.push(i); if (piv(i, false)) L.push(i); }
    for (let k = 1; k < H.length; k++) { const a = H[k - 1], b = H[k]; if (D[b].h > D[a].h && cv[b] < cv[a]) out.push({ i: b, dir: 'bear', p: D[b].h, from: a }); }
    for (let k = 1; k < L.length; k++) { const a = L[k - 1], b = L[k]; if (D[b].l < D[a].l && cv[b] > cv[a]) out.push({ i: b, dir: 'bull', p: D[b].l, from: a }); }
    return out.sort((x, y) => x.i - y.i);
  };
  /* 11. anchored VWAP with ±1σ / ±2σ volume-weighted bands */
  V.avwap = (D, i0) => {
    const out = []; let pv = 0, v = 0, pv2 = 0;
    for (let i = Math.max(0, i0 | 0); i < D.length; i++) {
      const c = D[i], tp = (c.h + c.l + c.c) / 3, w = c.v > 0 ? c.v : 1; pv += tp * w; v += w; pv2 += tp * tp * w;
      const m = pv / v, s = Math.sqrt(Math.max(0, pv2 / v - m * m)); out.push({ i, t: c.t, vw: m, u1: m + s, d1: m - s, u2: m + 2 * s, d2: m - 2 * s });
    }
    return out;
  };
  /* 12. session volume profiles (UTC hours) */
  V.SESS = { asia: [0, 7], london: [7, 13], ny: [13, 21] };
  V.sessionOf = (t) => { const h = Math.floor((((t % 86400) + 86400) % 86400) / 3600); return h >= 13 && h < 21 ? 'ny' : h >= 7 && h < 13 ? 'london' : h < 7 ? 'asia' : null; };
  V.profile = (D, keep = () => true, bins = 24) => {
    const S = D.filter(keep); if (!S.length) return null;
    const lo = Math.min(...S.map((c) => c.l)), hi = Math.max(...S.map((c) => c.h)), w = (hi - lo) / bins || 1, B = Array.from({ length: bins }, (_, k) => ({ p0: lo + k * w, p1: lo + (k + 1) * w, v: 0 }));
    for (const c of S) { const tp = (c.h + c.l + c.c) / 3; B[Math.min(bins - 1, Math.max(0, Math.floor((tp - lo) / w)))].v += c.v || 0; }
    const poc = B.reduce((a, b) => (b.v > a.v ? b : a), B[0]); return { bins: B, poc: (poc.p0 + poc.p1) / 2, lo, hi };
  };
  V.sessionProfiles = (D, bins = 24) => ({ asia: V.profile(D, (c) => V.sessionOf(c.t) === 'asia', bins), london: V.profile(D, (c) => V.sessionOf(c.t) === 'london', bins), ny: V.profile(D, (c) => V.sessionOf(c.t) === 'ny', bins) });
  /* 13. zero-gamma level: the spot price where total dealer GEX crosses zero (gexFn = P5.gex) */
  V.zeroGamma = (chain, spot, T, gexFn, span = 0.15, steps = 60) => {
    if (!(spot > 0) || typeof gexFn !== 'function') return null; let prev = null;
    for (let k = 0; k <= steps; k++) {
      const S = spot * (1 - span + (2 * span * k) / steps), g = gexFn(chain, S, T).total;
      if (prev && Math.sign(prev.g) !== Math.sign(g) && prev.g !== 0) return r2(prev.S + ((S - prev.S) * -prev.g) / (g - prev.g), 4);
      prev = { S, g };
    }
    return null;
  };
  /* 14. unusual options activity from the chain: vol/OI, block premium, sweep-like short-dated OTM bursts */
  V.unusual = (chain, spot, o = {}) => {
    const out = [], minPrem = o.minPrem || 250000;
    for (const [type, rows] of [['call', chain.calls || []], ['put', chain.puts || []]]) for (const r of rows) {
      const vol = +r.vol || 0, oi = +r.oi || 0, prem = vol * (+r.last || +r.mid || 0) * 100, tags = [];
      if (vol > oi && vol >= 100) tags.push('UNUSUAL'); if (prem >= minPrem * 4) tags.push('BLOCK');
      if (vol >= 3 * Math.max(1, oi) && spot > 0 && (type === 'call' ? r.strike > spot : r.strike < spot)) tags.push('SWEEP-LIKE');
      if (tags.length && prem >= minPrem) out.push({ type, strike: r.strike, vol, oi, prem: Math.round(prem), tags });
    }
    return out.sort((a, b) => b.prem - a.prem).slice(0, 40);
  };
  /* 15. multi-leg payoff (legs: {type: call|put|stock, strike, qty ±, prem, iv}) at expiry and today, breakevens, theta curve */
  V.legsPreset = (kind, S, w = 0.05, prem = (k, t) => 0) => {
    const k = (m) => Math.round(S * (1 + m) * 100) / 100, L = (type, m, qty) => ({ type, strike: k(m), qty, prem: prem(k(m), type), iv: 0.5 });
    return ({ bullcall: [L('call', 0, 1), L('call', w, -1)], bearput: [L('put', 0, 1), L('put', -w, -1)], straddle: [L('call', 0, 1), L('put', 0, 1)], strangle: [L('call', w, 1), L('put', -w, 1)], condor: [L('put', -2 * w, 1), L('put', -w, -1), L('call', w, -1), L('call', 2 * w, 1)] })[kind] || [];
  };
  const legVal = (g, S, T, bs) => (g.type === 'stock' ? S : T <= 0 || !bs ? Math.max(0, g.type === 'call' ? S - g.strike : g.strike - S) : bs(S, g.strike, T, 0.04, g.iv || 0.5, g.type).price);
  V.payoff = (legs, S0, o = {}) => {
    const span = o.span || 0.25, n = o.n || 80, T = o.T || 0, bs = o.bs, pts = [];
    for (let k = 0; k <= n; k++) { const S = S0 * (1 - span + (2 * span * k) / n); let e = 0, t = 0; for (const g of legs) { const m = g.type === 'stock' ? 1 : 100; e += (legVal(g, S, 0, bs) - g.prem) * g.qty * m; t += (legVal(g, S, T, bs) - g.prem) * g.qty * m; } pts.push({ S: r2(S, 4), exp: r2(e), now: r2(t) }); }
    const be = []; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; if (Math.sign(a.exp) !== Math.sign(b.exp) && a.exp !== 0) be.push(r2(a.S + ((b.S - a.S) * -a.exp) / (b.exp - a.exp), 2)); }
    return { pts, be, maxP: Math.max(...pts.map((p) => p.exp)), maxL: Math.min(...pts.map((p) => p.exp)) };
  };
  V.thetaCurve = (legs, S, T, bs, steps = 10) => Array.from({ length: steps + 1 }, (_, k) => { const t = T * (1 - k / steps); let v = 0; for (const g of legs) v += (legVal(g, S, t, bs) - g.prem) * g.qty * (g.type === 'stock' ? 1 : 100); return { days: r2(t * 365, 1), pnl: r2(v) }; });

  /* ══ PHASE 3 · markets ══ */
  /* 16. per-market memory for the universal swap */
  V.memo = (store, mode, s) => { if (!['crypto', 'stocks', 'onchain'].includes(mode) || !s) return store; store[mode] = { tf: TF_RX.test(s.tf) ? s.tf : '1h', preset: STR(s.preset || '', 20), risk: Math.min(10, Math.max(0.1, +s.risk || 1)), ind: s.ind && typeof s.ind === 'object' ? Object.fromEntries(Object.entries(s.ind).filter(([k, v]) => /^[a-z0-9]{1,12}$/i.test(k) && typeof v === 'boolean').slice(0, 40)) : {} }; return store; };
  V.recall = (store, mode) => (store && store[mode] && TF_RX.test(store[mode].tf) ? store[mode] : null);
  /* 17. scanner formula: IDENT op NUMBER|IDENT joined by AND / OR, with parentheses. Parsed, never eval'd. */
  V.FIELDS = ['RVOL', 'PRICE', 'VWAP', 'CHG', 'VOL', 'RSI', 'MCAP', 'LIQ', 'EMA20', 'EMA50', 'ATR', 'SPREAD'];
  V.parseFormula = (src) => {
    const s = String(src || '').slice(0, 300), toks = []; const rx = /\s*(>=|<=|==|!=|>|<|\(|\)|AND\b|OR\b|-?\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9]*)/iy; let m, pos = 0;
    while (pos < s.length) { rx.lastIndex = pos; m = rx.exec(s); if (!m || !m[1]) { if (/^\s*$/.test(s.slice(pos))) break; return { error: 'Unexpected "' + s.slice(pos).trim().slice(0, 12) + '"' }; } toks.push(m[1]); pos = rx.lastIndex; }
    let i = 0; const peek = () => toks[i], up = (t) => (t || '').toUpperCase();
    const atom = () => { const t = toks[i++]; if (t == null) throw new Error('Formula ends early'); if (/^-?\d/.test(t)) return { n: +t }; if (!V.FIELDS.includes(up(t))) throw new Error('Unknown field ' + t.slice(0, 12) + ' (use ' + V.FIELDS.join(', ') + ')'); return { f: up(t) }; };
    const cmp = () => { if (peek() === '(') { i++; const e = or(); if (toks[i++] !== ')') throw new Error('Missing )'); return e; } const a = atom(), op = toks[i++]; if (!['>', '<', '>=', '<=', '==', '!='].includes(op)) throw new Error('Expected a comparison after ' + (a.f || a.n)); return { op, a, b: atom() }; };
    const and = () => { let l = cmp(); while (up(peek()) === 'AND') { i++; l = { and: [l, cmp()] }; } return l; };
    const or = () => { let l = and(); while (up(peek()) === 'OR') { i++; l = { or: [l, and()] }; } return l; };
    try { if (!toks.length) return { error: 'Empty formula' }; const ast = or(); if (i < toks.length) return { error: 'Unexpected "' + toks[i] + '"' }; return { ast }; } catch (e) { return { error: e.message }; }
  };
  V.evalFormula = (ast, row) => {
    const val = (x) => (x.n != null ? x.n : +row[x.f.toLowerCase()]);
    if (ast.and) return V.evalFormula(ast.and[0], row) && V.evalFormula(ast.and[1], row);
    if (ast.or) return V.evalFormula(ast.or[0], row) || V.evalFormula(ast.or[1], row);
    const a = val(ast.a), b = val(ast.b); if (!fin(a) || !fin(b)) return false;
    return { '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b, '==': a === b, '!=': a !== b }[ast.op];
  };
  /* 18. DEX pair safety strip */
  V.dexSafety = (x = {}) => {
    const b = [
      { k: 'mint', ok: x.mintAuth === null || x.mintAuth === false, unk: x.mintAuth === undefined, label: 'Mint authority' },
      { k: 'freeze', ok: x.freezeAuth === null || x.freezeAuth === false, unk: x.freezeAuth === undefined, label: 'Freeze authority' },
      { k: 'top10', ok: fin(x.top10) && x.top10 <= 30, unk: !fin(x.top10), label: 'Top-10 holders' + (fin(x.top10) ? ' ' + r2(x.top10, 1) + '%' : '') },
      { k: 'lp', ok: fin(x.lpLocked) && x.lpLocked >= 80, unk: !fin(x.lpLocked), label: 'LP locked' + (fin(x.lpLocked) ? ' ' + r2(x.lpLocked, 0) + '%' : '') },
    ];
    const known = b.filter((y) => !y.unk), score = known.length ? Math.round((known.filter((y) => y.ok).length / known.length) * 100) : null;
    return { badges: b, score, verdict: score == null ? 'unknown' : score >= 75 ? 'safer' : score >= 50 ? 'caution' : 'danger' };
  };
  /* 19. smart-money leaderboard + confluence (2+ high-win-rate wallets buying the same token within the window) */
  V.leaderboard = (ws) => (ws || []).filter((w) => w && fin(w.winRate) && fin(w.trades)).map((w) => Object.assign({}, w, { score: r2(w.winRate * Math.log10(1 + w.trades) * 100, 1) })).sort((a, b) => b.score - a.score);
  V.confluence = (buys, o = {}) => {
    const win = o.window || 300, min = o.min || 2, minWin = o.minWin != null ? o.minWin : 0.55, by = new Map(), out = [];
    for (const b of (buys || []).filter((x) => x && x.side === 'buy' && fin(x.t) && (x.winRate == null || x.winRate >= minWin)).sort((a, b) => a.t - b.t)) {
      const L = by.get(b.sym) || []; L.push(b); while (L.length && b.t - L[0].t > win) L.shift(); by.set(b.sym, L);
      const who = [...new Set(L.map((x) => x.who))]; if (who.length >= min && !out.some((y) => y.sym === b.sym && b.t - y.t < win)) out.push({ sym: b.sym, t: b.t, wallets: who.slice(0, 8), usd: Math.round(L.reduce((s, x) => s + (+x.usd || 0), 0)) });
    }
    return out;
  };
  /* 20. net dollar inflow per symbol over a window */
  V.netFlow = (trades, nowSec, win) => { const m = {}; for (const t of trades || []) { if (!t || !(nowSec - t.t <= win) || t.t > nowSec + 1) continue; const u = (+t.usd || +t.p * +t.q || 0) * (t.side === 'sell' ? -1 : 1); m[t.sym] = (m[t.sym] || 0) + u; } return m; };
  /* 21. sparkline polyline + relative strength vs a benchmark (% points over the same window) */
  V.spark = (vals, w = 60, h = 16) => { const v = (vals || []).filter(fin); if (v.length < 2) return ''; const lo = Math.min(...v), hi = Math.max(...v), d = hi - lo || 1; return v.map((x, i) => `${r2((i / (v.length - 1)) * w, 1)},${r2(h - ((x - lo) / d) * h, 1)}`).join(' '); };
  V.relStrength = (a, b) => { const ch = (v) => (v && v.length > 1 && v[0] > 0 ? (v[v.length - 1] / v[0] - 1) * 100 : null), x = ch(a), y = ch(b); return x == null || y == null ? null : r2(x - y, 2); };
  /* 22. paper DEX: priority-fee + slippage presets and a constant-product price-impact estimate */
  V.FEES = { normal: { prio: 0.00001, slip: 0.5, ms: 1800 }, fast: { prio: 0.0001, slip: 1, ms: 900 }, turbo: { prio: 0.001, slip: 2.5, ms: 450 } };
  V.dexSim = (usd, liqUsd, preset = 'normal') => {
    const P = V.FEES[preset] || V.FEES.normal; if (!(usd > 0) || !(liqUsd > 0)) return null;
    const pool = liqUsd / 2, impact = (usd / (pool + usd)) * 100;
    return { preset, impactPct: r2(impact, 3), slipPct: P.slip, feeSol: P.prio, landingMs: P.ms, fails: impact > P.slip, minOutPct: r2(100 - P.slip, 2) };
  };

  /* ══ PHASE 4 · quant lab ══ */
  /* 23. no-code composer → JSON / Pine Script v5 */
  V.SERIES = { close: 'close', open: 'open', high: 'high', low: 'low', volume: 'volume', rsi14: 'ta.rsi(close, 14)', ema20: 'ta.ema(close, 20)', ema50: 'ta.ema(close, 50)', ema200: 'ta.ema(close, 200)', sma20: 'ta.sma(close, 20)', vwap: 'ta.vwap(hlc3)', atr14: 'ta.atr(14)', macd: 'ta.macd(close, 12, 26, 9)[0]', macdsig: 'ta.macd(close, 12, 26, 9)[1]' };
  const OPS = ['>', '<', '>=', '<=', 'crosses above', 'crosses below'];
  V.isSeries = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(V.SERIES, k); // never 'constructor' / '__proto__'
  V.validRules = (r) => {
    if (!r || typeof r !== 'object') return 'Not a rule set';
    for (const side of ['entry', 'exit']) { const g = r[side]; if (!g || !['AND', 'OR'].includes(g.logic) || !Array.isArray(g.conds) || !g.conds.length || g.conds.length > 8) return side + ': needs 1–8 conditions joined by AND / OR'; for (const c of g.conds) { if (!c || !V.isSeries(c.a) || !OPS.includes(c.op) || !(V.isSeries(c.b) || fin(c.b))) return side + ': bad condition'; } }
    if (r.sl != null && !(r.sl > 0 && r.sl < 50)) return 'Stop must be 0–50 %'; if (r.tp != null && !(r.tp > 0 && r.tp < 500)) return 'Target must be 0–500 %';
    return null;
  };
  /* rebuild a rule set from validated fields only (imported codes carry nothing else) */
  V.cleanRules = (r) => { if (V.validRules(r)) return null; const g = (x) => ({ logic: x.logic, conds: x.conds.map((c) => ({ a: c.a, op: c.op, b: V.isSeries(c.b) ? c.b : +c.b })) }); return { entry: g(r.entry), exit: g(r.exit), sl: r.sl == null ? null : +r.sl, tp: r.tp == null ? null : +r.tp }; };
  const pineCond = (c) => { const a = V.SERIES[c.a], b = V.isSeries(c.b) ? V.SERIES[c.b] : String(+c.b); return c.op === 'crosses above' ? `ta.crossover(${a}, ${b})` : c.op === 'crosses below' ? `ta.crossunder(${a}, ${b})` : `${a} ${c.op} ${b}`; };
  V.toPine = (r, name = 'ExTerm strategy') => {
    const e = V.validRules(r); if (e) return { error: e };
    const nm = STR(name, 60).replace(/["\\\n\r]/g, ''), j = (g) => g.conds.map(pineCond).join(g.logic === 'AND' ? ' and ' : ' or ');
    return { pine: `//@version=5\nstrategy("${nm}", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=100)\nlongEntry = ${j(r.entry)}\nlongExit = ${j(r.exit)}\nif longEntry\n    strategy.entry("Long", strategy.long)\nif longExit\n    strategy.close("Long")\n${r.sl || r.tp ? `strategy.exit("Risk", "Long"${r.sl ? `, stop=strategy.position_avg_price * ${r2(1 - r.sl / 100, 4)}` : ''}${r.tp ? `, limit=strategy.position_avg_price * ${r2(1 + r.tp / 100, 4)}` : ''})\n` : ''}` };
  };
  /* evaluate a rule set on candles → boolean arrays (shared by the composer preview and the NL compiler) */
  const ema = (v, n) => { const k = 2 / (n + 1), o = []; let e = null; for (const x of v) { e = e == null ? x : x * k + e * (1 - k); o.push(e); } return o; };
  const rsi = (v, n = 14) => { const o = [null]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1]; if (i <= n) { g += Math.max(0, d); l += Math.max(0, -d); o.push(i === n ? 100 - 100 / (1 + (l ? g / l : 99)) : null); if (i === n) { g /= n; l /= n; } continue; } g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; o.push(100 - 100 / (1 + (l ? g / l : 99))); } return o; };
  V.seriesOf = (D, key) => {
    const c = D.map((x) => x.c);
    switch (key) {
      case 'close': return c; case 'open': return D.map((x) => x.o); case 'high': return D.map((x) => x.h); case 'low': return D.map((x) => x.l); case 'volume': return D.map((x) => x.v || 0);
      case 'rsi14': return rsi(c, 14); case 'ema20': return ema(c, 20); case 'ema50': return ema(c, 50); case 'ema200': return ema(c, 200);
      case 'sma20': return c.map((_, i) => (i >= 19 ? mean(c.slice(i - 19, i + 1)) : null));
      case 'vwap': { let pv = 0, v = 0; return D.map((x) => { pv += ((x.h + x.l + x.c) / 3) * (x.v || 1); v += x.v || 1; return pv / v; }); }
      case 'atr14': { const tr = D.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - D[i - 1].c), Math.abs(x.l - D[i - 1].c)) : x.h - x.l)); return ema(tr, 14); }
      case 'macd': case 'macdsig': { const e26 = ema(c, 26), m = ema(c, 12).map((x, i) => x - e26[i]); return key === 'macd' ? m : ema(m, 9); }
      default: return c.map(() => null);
    }
  };
  V.signals = (D, g) => {
    const cache = {}, S = (k) => (cache[k] = cache[k] || V.seriesOf(D, k)), out = new Array(D.length).fill(false);
    for (let i = 1; i < D.length; i++) {
      const res = g.conds.map((c) => { const a = S(c.a), b = V.isSeries(c.b) ? S(c.b) : null, bv = (j) => (b ? b[j] : +c.b); if (a[i] == null || bv(i) == null || a[i - 1] == null || bv(i - 1) == null) return false; return c.op === 'crosses above' ? a[i - 1] <= bv(i - 1) && a[i] > bv(i) : c.op === 'crosses below' ? a[i - 1] >= bv(i - 1) && a[i] < bv(i) : { '>': a[i] > bv(i), '<': a[i] < bv(i), '>=': a[i] >= bv(i), '<=': a[i] <= bv(i) }[c.op]; });
      out[i] = g.logic === 'AND' ? res.every(Boolean) : res.some(Boolean);
    }
    return out;
  };
  /* tiny long-only simulator for composed rules: next-bar-open fills, % stop / target, fee per side */
  V.simRules = (D, r, fee = 0.001) => {
    const en = V.signals(D, r.entry), ex = V.signals(D, r.exit), eq = [1], trades = []; let pos = null, e = 1;
    for (let i = 1; i < D.length; i++) {
      const c = D[i];
      if (pos) {
        const sl = r.sl ? pos.p * (1 - r.sl / 100) : null, tp = r.tp ? pos.p * (1 + r.tp / 100) : null; let out = null;
        if (sl && c.l <= sl) out = Math.min(c.o, sl); else if (tp && c.h >= tp) out = Math.max(c.o, tp); else if (ex[i - 1]) out = c.o;
        if (out != null) { const ret = (out / pos.p) * (1 - fee) ** 2 - 1; e *= 1 + ret; trades.push({ i0: pos.i, i1: i, ret }); pos = null; }
      } else if (en[i - 1]) pos = { p: c.o, i };
      eq.push(pos ? e * (c.c / pos.p) * (1 - fee) : e);
    }
    return { eq, trades };
  };
  V.stats = (eq, bpy = 8760) => {
    const r = []; for (let i = 1; i < eq.length; i++) if (eq[i - 1] > 0) r.push(eq[i] / eq[i - 1] - 1);
    let pk = eq[0] || 1, dd = 0; for (const v of eq) { pk = Math.max(pk, v); dd = Math.max(dd, 1 - v / pk); }
    const s = sd(r); return { ret: r2((eq[eq.length - 1] / eq[0] - 1) * 100), maxDD: r2(dd * 100), sharpe: s > 0 ? r2((mean(r) / s) * Math.sqrt(bpy)) : 0 };
  };
  /* 24. portfolio: equal-weight basket of equity curves, combined stats + return correlation */
  V.portfolio = (curves, bpy) => {
    const keys = Object.keys(curves || {}).filter((k) => Array.isArray(curves[k]) && curves[k].length > 2); if (!keys.length) return null;
    const n = Math.min(...keys.map((k) => curves[k].length)), norm = keys.map((k) => { const c = curves[k].slice(-n); return c.map((v) => v / c[0]); });
    const eq = Array.from({ length: n }, (_, i) => mean(norm.map((c) => c[i]))), rets = norm.map((c) => c.slice(1).map((v, i) => v / c[i] - 1));
    return Object.assign(V.stats(eq, bpy), { keys, eq, each: keys.map((k, j) => Object.assign({ k }, V.stats(norm[j], bpy))), corr: rets.map((a) => rets.map((b) => (a === b ? 1 : V.pearson(a, b)))) });
  };
  /* 25. sensitivity grid + plateau score (share of profitable cells, best-neighbourhood vs best cell) */
  V.grid = (xs, ys, fn) => ys.map((y) => xs.map((x) => { try { const v = fn(x, y); return fin(v) ? v : null; } catch (e) { return null; } }));
  V.plateau = (M) => {
    const cells = M.flat().filter(fin); if (!cells.length) return null; let bi = 0, bj = 0, bv = -Infinity;
    M.forEach((row, i) => row.forEach((v, j) => { if (fin(v) && v > bv) { bv = v; bi = i; bj = j; } }));
    const nb = []; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const v = (M[bi + di] || [])[bj + dj]; if ((di || dj) && fin(v)) nb.push(v); }
    const pos = cells.filter((v) => v > 0).length / cells.length, keep = bv > 0 && nb.length ? mean(nb) / bv : 0;
    return { best: bv, at: [bi, bj], profitable: r2(pos * 100, 0), neighbour: r2(keep * 100, 0), verdict: pos >= 0.6 && keep >= 0.5 ? 'robust plateau' : pos >= 0.4 ? 'mixed' : 'fragile / overfit' };
  };
  /* 26. weak-gate fixes: failed 17-test checks → backtest enhancer options */
  V.FIXES = { dd: { atrStop: 2 }, cost: { cooldown: 6 }, lag: { timeStop: 48 }, regime: { trendEma: 200 }, oos: { trendEma: 200, atrTrail: 3 }, wf: { trendEma: 200, atrTrail: 3 }, time: { trendEma: 100 }, outlier: { atrTrail: 2.5 }, mc: { atrStop: 2 }, bench: { trendEma: 200 }, profit: { atrStop: 2, trendEma: 100 } };
  V.fixGate = (checks, o = {}) => {
    const o2 = Object.assign({}, o), applied = [];
    for (const c of checks || []) if (c && c.status === 'fail' && V.FIXES[c.id]) for (const [k, v] of Object.entries(V.FIXES[c.id])) if (o2[k] == null) { o2[k] = v; applied.push(k + '=' + v + ' (' + c.id + ')'); }
    return { o: o2, applied };
  };
  /* 27. prop-firm rulebooks (approximate public rules for a 50K account; verify with the firm) */
  V.PROP = {
    apex: { name: 'Apex 50K', target: 6, dailyDD: null, maxDD: 5, trail: true },
    topstep: { name: 'Topstep 50K', target: 6, dailyDD: 2, maxDD: 4, trail: true },
    ftmo: { name: 'FTMO 100K', target: 10, dailyDD: 5, maxDD: 10, trail: false },
    custom: { name: 'Custom', target: 8, dailyDD: 4, maxDD: 8, trail: true },
  };
  V.ruleOk = (r) => r && [r.target, r.maxDD].every((x) => fin(+x) && +x > 0 && +x <= 100) && (r.dailyDD == null || (fin(+r.dailyDD) && +r.dailyDD > 0 && +r.dailyDD <= 100));
  V.propRun = (eq, R, bpd = 24) => {
    if (!Array.isArray(eq) || eq.length < 2 || !V.ruleOk(R)) return { ok: false, error: 'Need an equity curve and valid rules' };
    const c0 = eq[0]; let pk = c0, day0 = c0, maxDD = 0, worst = 0;
    for (let i = 1; i < eq.length; i++) {
      const v = eq[i]; if (i % bpd === 0) day0 = eq[i - 1]; pk = Math.max(pk, v);
      const dd = (1 - v / (R.trail ? pk : c0)) * 100, dl = (1 - v / day0) * 100; maxDD = Math.max(maxDD, dd); worst = Math.max(worst, dl);
      if (R.dailyDD != null && dl > R.dailyDD) return { ok: true, passed: false, i, fail: `daily loss ${r2(dl)}% > ${R.dailyDD}%`, maxDD: r2(maxDD), worstDay: r2(worst), ret: r2((v / c0 - 1) * 100) };
      if (dd > R.maxDD) return { ok: true, passed: false, i, fail: `${R.trail ? 'trailing' : 'max'} drawdown ${r2(dd)}% > ${R.maxDD}%`, maxDD: r2(maxDD), worstDay: r2(worst), ret: r2((v / c0 - 1) * 100) };
      if ((v / c0 - 1) * 100 >= R.target) return { ok: true, passed: true, i, maxDD: r2(maxDD), worstDay: r2(worst), ret: r2((v / c0 - 1) * 100) };
    }
    return { ok: true, passed: false, i: eq.length - 1, fail: 'target not reached', maxDD: r2(maxDD), worstDay: r2(worst), ret: r2((eq[eq.length - 1] / c0 - 1) * 100) };
  };
  /* 28. blind drill: prices rebased to 100 and dates moved to a neutral epoch, so the ticker / date can't be guessed */
  V.BLIND_T0 = 946857600; // 2000-01-03
  V.blind = (D) => { if (!D || !D.length) return []; const k = 100 / D[0].c, t0 = D[0].t; return D.map((c) => ({ t: V.BLIND_T0 + (c.t - t0), o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k, v: c.v })); };
  V.REPLAY_KEYS = { Digit1: 1, Digit2: 2, Digit5: 5, Digit0: 10 };
  /* 29. MFE / MAE of a closed trade against the candles it lived through, plus auto-tags */
  V.excursion = (tr, D) => {
    if (!tr || !(tr.entry > 0) || !(tr.exit > 0) || !D || !D.length) return null; const long = tr.side !== 'short';
    const S = D.filter((c) => c.t >= tr.t0 && c.t <= tr.t1); if (!S.length) return null;
    const hi = Math.max(...S.map((c) => c.h)), lo = Math.min(...S.map((c) => c.l)), ret = ((tr.exit / tr.entry - 1) * 100) * (long ? 1 : -1);
    const mfe = (long ? hi / tr.entry - 1 : 1 - lo / tr.entry) * 100, mae = (long ? 1 - lo / tr.entry : hi / tr.entry - 1) * 100;
    return { mfe: r2(mfe), mae: r2(mae), ret: r2(ret), eff: mfe > 0 ? r2(Math.max(0, ret) / mfe * 100, 0) : 0 };
  };
  V.autoTag = (tr, x) => {
    const t = [], held = (tr.t1 - tr.t0) / 60;
    if (held < 15) t.push('scalp'); else if (held > 1440) t.push('swing');
    if (x) { if (x.ret > 0 && x.mfe > 2 * x.ret) t.push('left-money'); if (x.ret < 0 && x.mae > 0 && Math.abs(x.ret) >= 0.9 * x.mae) t.push('max-pain-exit'); if (x.ret < 0 && x.mfe > 1) t.push('was-green'); if (x.eff >= 80) t.push('clean-exit'); }
    if (tr.stop === false) t.push('no-stop'); return t;
  };
  /* 30. strategy battle: rank up to 4 on identical data by return / drawdown */
  V.battle = (rows) => (rows || []).slice(0, 4).filter((r) => r && Array.isArray(r.eq) && r.eq.length > 1).map((r) => { const s = V.stats(r.eq); return Object.assign({ name: STR(r.name, 40), eq: r.eq }, s, { score: r2(s.ret / Math.max(1, s.maxDD), 3) }); }).sort((a, b) => b.score - a.score).map((r, i) => Object.assign(r, { rank: i + 1 }));

  /* ══ PHASE 5 · Grok, copilot, World ══ */
  /* 31. plain-English rules → workflow JSON (the composer's rule format, so it backtests the same way) */
  const IND = [[/rsi(?:\s*\(?\s*14\s*\)?)?/, 'rsi14'], [/ema\s*\(?\s*200\s*\)?|200\s*ema/, 'ema200'], [/ema\s*\(?\s*50\s*\)?|50\s*ema/, 'ema50'], [/ema\s*\(?\s*20\s*\)?|20\s*ema|\bema\b/, 'ema20'], [/sma\s*\(?\s*20\s*\)?|20\s*sma/, 'sma20'], [/vwap/, 'vwap'], [/macd signal/, 'macdsig'], [/macd/, 'macd'], [/price|close/, 'close'], [/volume/, 'volume']];
  const indOf = (s) => { for (const [rx, k] of IND) if (rx.test(s)) return k; return null; };
  const condOf = (txt) => {
    const s = txt.trim().toLowerCase(); let m;
    const OPW = [[/crosses above|crosses over|crossover/, 'crosses above'], [/crosses below|crosses under|crossunder/, 'crosses below'], [/>=|at least/, '>='], [/<=|at most/, '<='], [/\babove\b|>|over|greater than/, '>'], [/\bbelow\b|<|under|less than/, '<']];
    for (const [rx, op] of OPW) { if ((m = rx.exec(s))) { const L = s.slice(0, m.index), R = s.slice(m.index + m[0].length), a = indOf(L), num = /-?\d+(?:\.\d+)?/.exec(R), b = a === 'rsi14' && num ? +num[0] : indOf(R) || (num ? +num[0] : null); if (a && b != null && a !== b) return { a, op, b }; } }
    return null;
  };
  V.nlCompile = (text) => {
    const s = String(text || '').slice(0, 600).replace(/\s+/g, ' ').trim(), lc = s.toLowerCase(); if (s.length < 8) return { ok: false, error: 'Describe a rule, e.g. "buy ETH when RSI below 30 and price above EMA 200, sell when RSI above 70, stop 2%, target 6%"' };
    const grab = (rx) => { const m = rx.exec(lc); return m ? m[1] : ''; };
    const entryTxt = grab(/(?:buy|long|enter)[^,;.]*?\bwhen\b(.+?)(?:[,;.]\s*(?:and\s+)?(?:sell|exit|close)|[,;.]\s*(?:stop|sl|take|target|tp)|$)/), exitTxt = grab(/(?:sell|exit|close)[^,;.]*?\bwhen\b(.+?)(?:[,;.]|$)/);
    const split = (t) => { const logic = /\bor\b/.test(t) && !/\band\b/.test(t) ? 'OR' : 'AND'; return { logic, conds: t.split(logic === 'OR' ? /\bor\b/ : /\band\b/).map(condOf).filter(Boolean).slice(0, 8) }; };
    const entry = split(entryTxt), exit = exitTxt ? split(exitTxt) : { logic: 'AND', conds: [] };
    if (!entry.conds.length) return { ok: false, error: 'No entry condition understood. Try "buy when RSI below 30".' };
    if (!exit.conds.length) exit.conds.push(entry.conds[0].a === 'rsi14' ? { a: 'rsi14', op: '>', b: 70 } : { a: 'close', op: 'crosses below', b: 'ema20' });
    const sym = /\b(?:buy|long|trade)\s+([a-z]{2,6}(?:-usd)?)\b/.exec(lc), tf = /\b(1m|5m|15m|1h|4h|1d)\b/.exec(lc), sl = /(?:stop(?:\s*loss)?|sl)\s*(?:at|of)?\s*(\d+(?:\.\d+)?)\s*%/.exec(lc), tp = /(?:take\s*profit|target|tp)\s*(?:at|of)?\s*(\d+(?:\.\d+)?)\s*%/.exec(lc);
    const rules = { entry, exit, sl: sl ? +sl[1] : null, tp: tp ? +tp[1] : null }, err = V.validRules(rules); if (err) return { ok: false, error: err };
    const SKIP = new Set(['when', 'the', 'if', 'at', 'on']), su = sym && !SKIP.has(sym[1]) ? sym[1].toUpperCase() : null;
    return { ok: true, workflow: { v: 1, kind: 'exterm-workflow', name: STR(s, 60), sym: su, tf: tf ? tf[1] : '1h', rules } };
  };
  /* 32. stats for a selected candle range (fed to the 3-agent copilot) */
  V.rangeStats = (D, i0, i1) => {
    const a = Math.max(0, Math.min(i0, i1)), b = Math.min(D.length - 1, Math.max(i0, i1)); if (!(b > a)) return null;
    const S = D.slice(a, b + 1), cv = V.cvd(S), hi = Math.max(...S.map((c) => c.h)), lo = Math.min(...S.map((c) => c.l));
    return { bars: S.length, t0: S[0].t, t1: S[S.length - 1].t, ret: r2((S[S.length - 1].c / S[0].o - 1) * 100), hi, lo, rangePct: r2((hi / lo - 1) * 100), vol: Math.round(S.reduce((s, c) => s + (c.v || 0), 0)), cvd: r2(cv[cv.length - 1], 2), up: S.filter((c) => c.c >= c.o).length };
  };
  V.rangePrompt = (sym, tf, st) => `Analyze this ${STR(tf, 4)} candle range on ${STR(sym, 30)}: ${st.bars} bars, return ${st.ret}%, range ${st.rangePct}% (high ${st.hi}, low ${st.lo}), ${st.up}/${st.bars} up bars, estimated CVD ${st.cvd} (${st.cvd >= 0 ? 'net buying' : 'net selling'}). What does the price action and order flow say, and what are the risks?`;
  /* 33. devil's advocate: grade a manual order A–F before it is sent */
  V.critique = (o) => {
    let s = 100; const n = [], hit = (pts, why) => { s -= pts; n.push(why); };
    if (!(o.sl > 0)) hit(30, 'No stop loss: one bad candle decides this trade.');
    else { const rr = o.tp > 0 ? Math.abs(o.tp - o.entry) / Math.abs(o.entry - o.sl) : null; if (rr == null) hit(8, 'No target: decide the exit before the entry.'); else if (rr < 1.5) hit(15, `Reward:risk is only ${r2(rr, 2)}.`); }
    if (o.riskPct > 2) hit(Math.min(25, (o.riskPct - 2) * 8), `Risking ${r2(o.riskPct, 2)}% of equity (most pros cap at 1–2%).`);
    if (o.trendUp === false && o.side === 'buy') hit(12, 'Buying below the 200 EMA: you are fighting the trend.');
    if (o.trendUp === true && o.side === 'sell') hit(12, 'Selling above the 200 EMA: you are fighting the trend.');
    if (o.side === 'buy' && o.rsi > 75) hit(10, `RSI ${Math.round(o.rsi)}: chasing an overbought move.`); if (o.side === 'sell' && o.rsi < 25) hit(10, `RSI ${Math.round(o.rsi)}: selling into an oversold move.`);
    if (o.eventSoon) hit(12, 'A high-impact event is close: spreads and gaps can blow through stops.');
    if (o.openPositions >= 5) hit(8, `${o.openPositions} positions already open.`);
    if (o.lossStreak >= 3) hit(10, `${o.lossStreak} losses in a row: possible revenge trade.`);
    s = Math.max(0, Math.round(s)); return { score: s, grade: s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F', notes: n.length ? n : ['No red flags found. Size it right and follow the plan.'] };
  };
  /* 34. World Monitor headline → asset-impact tags with a tradeable symbol */
  V.IMPACT = [[/oil|opec|crude|brent|refiner|strait of hormuz|pipeline/i, 'OIL/XLE', 'XLE'], [/nvidia|semiconductor|chip|tsmc|export control|ai model|gpu/i, 'NVDA/SMH', 'NVDA'], [/bitcoin|crypto|stablecoin|\bsec\b.*crypto|etf flow|dollar index|\bdxy\b/i, 'BTC/DXY', 'BTC-USD'], [/gold|safe haven|bullion/i, 'GOLD/GLD', 'GLD'], [/fed|fomc|rate (?:cut|hike)|treasur|yield|inflation|\bcpi\b/i, 'RATES/TLT', 'TLT'], [/china|beijing|tariff|yuan/i, 'CHINA/FXI', 'FXI'], [/missile|war|military|defen[cs]e|nato|drone strike/i, 'DEFENSE/ITA', 'ITA'], [/bank|credit|default|liquidity crisis/i, 'BANKS/XLF', 'XLF']];
  V.impactTags = (text) => { const s = String(text || '').slice(0, 2000), out = []; for (const [rx, tag, sym] of V.IMPACT) if (rx.test(s)) out.push({ tag, sym }); return out.slice(0, 4); };
  /* 35. alert card text (Discord / Telegram): setup + R:R */
  V.alertCard = (o) => {
    const rr = o.entry > 0 && o.sl > 0 && o.tp > 0 && o.entry !== o.sl ? r2(Math.abs(o.tp - o.entry) / Math.abs(o.entry - o.sl), 2) : null;
    const lines = [`🔔 ${STR(o.side || 'setup', 8).toUpperCase()} ${STR(o.sym, 30)} · ${STR(o.tf || '', 4)}`, o.setup ? STR(o.setup, 120) : null, o.entry > 0 ? `Entry ${o.entry}` : null, o.sl > 0 ? `Stop ${o.sl}` : null, o.tp > 0 ? `Target ${o.tp}` : null, rr != null ? `R:R ${rr}` : null, 'Paper trading · not financial advice'].filter(Boolean);
    return { rr, text: lines.join('\n') };
  };
  /* 36. telemetry helpers */
  V.fmtUptime = (s) => { s = Math.max(0, Math.floor(+s || 0)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  V.pctl = (a, p) => { const s = (a || []).filter(fin).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
  /* 37. pre-market levels (previous UTC day high / low / close + overnight range since 00:00 UTC) and EOD recap */
  V.levels = (D, nowSec) => {
    const d0 = Math.floor(nowSec / 86400) * 86400, prev = D.filter((c) => c.t >= d0 - 86400 && c.t < d0), today = D.filter((c) => c.t >= d0 && c.t <= nowSec);
    if (!prev.length) return null;
    return { pdh: Math.max(...prev.map((c) => c.h)), pdl: Math.min(...prev.map((c) => c.l)), pdc: prev[prev.length - 1].c, onh: today.length ? Math.max(...today.map((c) => c.h)) : null, onl: today.length ? Math.min(...today.map((c) => c.l)) : null };
  };
  V.recap = (closed) => { const C = closed || [], w = C.filter((x) => x.pnl > 0), pnl = C.reduce((s, x) => s + (+x.pnl || 0), 0); return { n: C.length, wins: w.length, pnl: r2(pnl), wr: C.length ? r2((w.length / C.length) * 100, 0) : null, best: C.length ? C.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null, worst: C.length ? C.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null }; };
  /* 38. shadow mode: a hypothetical fill against a live tick (never touches balances) */
  V.shadowFill = (o, tick, slipBps = 5) => { if (!o || !tick || !(tick.price > 0) || !['buy', 'sell'].includes(o.side) || !(o.usd > 0)) return null; const k = (slipBps / 1e4) * (o.side === 'buy' ? 1 : -1), price = tick.price * (1 + k); return { ts: tick.ts || Date.now(), sym: STR(o.sym, 100), side: o.side, usd: o.usd, mid: tick.price, price, slipUsd: r2(Math.abs(price - tick.price) * (o.usd / tick.price), 4), bot: STR(o.bot || '', 40) }; };
  V.shadowStats = (log) => { const L = log || []; return { n: L.length, slipUsd: r2(L.reduce((s, x) => s + (x.slipUsd || 0), 0), 2), buys: L.filter((x) => x.side === 'buy').length, sells: L.filter((x) => x.side === 'sell').length }; };

  /* ══ PHASE 6 · platform ══ */
  /* 39. signed share codes: EXT1.<payload>.<ECDSA P-256 signature>, the signer's public key travels in the payload */
  const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4); const bin = typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary'); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  const enc = (s) => new TextEncoder().encode(s), dec = (b) => new TextDecoder().decode(b);
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
  V.newKey = (subtle, extractable = true) => subtle.generateKey(ALG, extractable, ['sign', 'verify']); // the public half is always exportable
  V.fingerprint = async (subtle, jwk) => { const h = new Uint8Array(await subtle.digest('SHA-256', enc(jwk.x + '.' + jwk.y))); return [...h.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join(':'); };
  V.signCode = async (subtle, kp, kind, data) => {
    if (!['workspace', 'strategy'].includes(kind)) throw new Error('bad kind');
    const jwk = await subtle.exportKey('jwk', kp.publicKey), body = enc(JSON.stringify({ v: 1, app: 'ExTerm', kind, data, pub: { x: jwk.x, y: jwk.y }, ts: Math.floor(Date.now() / 1000) }));
    if (body.length > 24000) throw new Error('Too large to share');
    const sig = new Uint8Array(await subtle.sign(SIG, kp.privateKey, body)); return 'EXT1.' + b64u(body) + '.' + b64u(sig);
  };
  V.verifyCode = async (subtle, code) => {
    const m = /^EXT1\.([A-Za-z0-9_-]{10,40000})\.([A-Za-z0-9_-]{40,200})$/.exec(String(code || '').trim()); if (!m) return { ok: false, error: 'Not an .exterm share code' };
    let body, j; try { body = unb64u(m[1]); j = JSON.parse(dec(body)); } catch (e) { return { ok: false, error: 'Corrupted code' }; }
    if (!j || j.v !== 1 || j.app !== 'ExTerm' || !['workspace', 'strategy'].includes(j.kind) || !j.pub || typeof j.pub.x !== 'string' || typeof j.pub.y !== 'string') return { ok: false, error: 'Not an ExTerm share code' };
    try { const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: j.pub.x, y: j.pub.y, ext: true }, ALG, false, ['verify']); if (!(await subtle.verify(SIG, key, unb64u(m[2]), body))) return { ok: false, error: 'Signature does not match: the code was altered' }; } catch (e) { return { ok: false, error: 'Bad signature key' }; }
    return { ok: true, kind: j.kind, data: j.data, ts: j.ts, signer: await V.fingerprint(subtle, j.pub) };
  };
  /* workspace payload whitelist (theme, timeframe, indicator toggles, theme tokens, language) */
  V.cleanWorkspace = (d) => {
    if (!d || typeof d !== 'object') return null; const o = {};
    if (typeof d.theme === 'string' && /^[a-z]{2,12}$/.test(d.theme)) o.theme = d.theme; if (typeof d.tf === 'string' && TF_RX.test(d.tf)) o.tf = d.tf;
    if (typeof d.lang === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(d.lang)) o.lang = d.lang;
    if (d.ind && typeof d.ind === 'object') o.ind = Object.fromEntries(Object.entries(d.ind).filter(([k, v]) => /^[a-z0-9]{1,12}$/i.test(k) && typeof v === 'boolean').slice(0, 40));
    if (d.tokens && typeof d.tokens === 'object') o.tokens = V.cleanTokens(d.tokens);
    return o;
  };
  /* 40. memory governor: keep the newest max bars (returns how many were trimmed) + frame pacing */
  V.trim = (arr, max) => { if (!Array.isArray(arr) || !(max > 0) || arr.length <= max) return 0; const n = arr.length - max; arr.splice(0, n); return n; };
  V.pace = (lastMs, nowMs, hz = 240) => nowMs - lastMs >= 1000 / hz - 0.5;
  /* 41. theme tokens: only known CSS variables, only #rgb / #rrggbb colours */
  V.TOKENS = [['--acc', 'Accent'], ['--up', 'Up / buy'], ['--dn', 'Down / sell'], ['--bg', 'Background'], ['--panel-solid', 'Panel'], ['--text', 'Text']];
  V.cleanTokens = (t) => Object.fromEntries(Object.entries(t || {}).filter(([k, v]) => V.TOKENS.some((x) => x[0] === k) && typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)));
  /* 42. palette calculator: + - * / % ^ and parentheses, recursive descent (no eval) */
  V.isCalc = (s) => /^[\d\s.+\-*/%^()]+$/.test(String(s || '')) && /\d\s*[+\-*/%^]\s*[\d(.]/.test(String(s));
  V.calc = (src) => {
    const s = String(src || '').replace(/\s+/g, ''); if (!s || s.length > 120 || !/^[\d.+\-*/%^()]+$/.test(s)) return null; let i = 0;
    const num = () => { const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return +m[0]; };
    const prim = () => { if (s[i] === '(') { i++; const v = add(); if (s[i++] !== ')') throw 0; return v; } if (s[i] === '-') { i++; return -prim(); } if (s[i] === '+') { i++; return prim(); } return num(); };
    const pow = () => { const b = prim(); if (s[i] === '^') { i++; return b ** pow(); } return b; };
    const mul = () => { let v = pow(); while ('*/%'.includes(s[i]) && s[i]) { const o = s[i++], r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
    const add = () => { let v = mul(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = mul(); v = o === '+' ? v + r : v - r; } return v; };
    try { const v = add(); return i === s.length && fin(v) ? v : null; } catch (e) { return null; }
  };
  /* 44. build integrity: SHA256SUMS parser + CSP check */
  V.parseSums = (txt) => { const m = {}; for (const ln of String(txt || '').split(/\r?\n/)) { const x = /^([0-9a-f]{64})\s+\*?([\w.\/-]{1,80})$/.exec(ln.trim()); if (x) m[x[2].replace(/^dist\//, '')] = x[1]; } return m; };
  V.cspOk = (csp) => { const c = String(csp || ''); return /(^|;)\s*default-src 'none'/.test(c) && /script-src 'sha256-[A-Za-z0-9+/=]{40,}'/.test(c) && !/script-src[^;]*'unsafe-(inline|eval)'/.test(c); };

  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V152;
