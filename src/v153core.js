/* ExTerm v15.3 core: the institutional Quant Lab engines. Auto-Evolve (genetic parameter + filter search ranked by
   out-of-sample Sharpe + Calmar, walk-forward and 17-test gated), liquidity stress + fragility break-point, regime
   attribution + calibrated crisis replays, trade-level feature importance + kill-switch filters, position-sizing
   comparison + prop-firm pass odds, block-bootstrap synthetic paths with adversarial noise, trade inspector maths and the
   shadow-bot package. No DOM, no eval, seeded randomness: unit-tested in Node and run inside the backtest Web Worker. */
const V153 = (() => {
  const N = typeof NT !== 'undefined' ? NT : require('./core.js');
  const V = {}, fin = Number.isFinite, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
  const r2 = (x, k = 2) => (fin(x) ? Math.round(x * 10 ** k) / 10 ** k : x);
  V.rng = (seed = 7) => { let s = seed >>> 0 || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const gauss = (rnd) => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  V.maxDD = (eq) => { let pk = -Infinity, dd = 0; for (const v of eq) { if (v > pk) pk = v; if (pk > 0) dd = Math.max(dd, 1 - v / pk); } return dd; };
  V.curve = (rets, size) => { let e = 1; const eq = [1]; rets.forEach((r, i) => { const f = typeof size === 'function' ? size(i, e, eq) : size == null ? 1 : size; e *= 1 + f * r; eq.push(e); }); return eq; };
  /* round trips from an Account trade list (partial exits keep their share of the cost basis) */
  V.pairs = (trades) => {
    const out = []; let open = null;
    for (const t of trades || []) {
      if (t.side === 'buy') { if (!open) open = { ts: t.ts, cost: 0, qty: 0 }; open.cost += t.usd; open.qty += t.qty; }
      else if (t.side === 'sell' && open && t.pnl != null && open.qty > 0) {
        const basis = open.cost * Math.min(1, t.qty / open.qty);
        out.push({ entryT: open.ts, exitT: t.ts, entry: open.cost / open.qty, exit: t.price, usd: basis, pnl: t.pnl, ret: t.pnlPct || 0 });
        open.cost -= basis; open.qty -= t.qty; if (open.qty <= 1e-12) open = null;
      }
    }
    return out;
  };
  const idxMap = (c) => { const m = new Map(); c.forEach((b, i) => m.set(b.t, i)); return m; };
  const atrPct = (c) => { const a = N.ind.atr(c, 14); return c.map((b, i) => (fin(a[i]) && b.c > 0 ? a[i] / b.c : null)); };

  /* ══ 1. Auto-Evolve: genetic mutation of parameters + robustness filters ══ */
  V.FILTERS = { trendEma: [0, 50, 100, 200], atrStop: [0, 1.5, 2, 3], cooldown: [0, 3, 6], timeStop: [0, 24, 48] };
  V.mutable = (strat) => ((strat && strat.params) || []).filter((d) => d && typeof d.k === 'string' && fin(d.min) && fin(d.max) && d.max > d.min && fin(d.def));
  const okParams = (p) => !(p.fast != null && p.slow != null && p.fast >= p.slow);
  V.mutate = (g, defs, rnd, rate = 0.35) => {
    for (let tries = 0; tries < 8; tries++) {
      const p = Object.assign({}, g.p), f = Object.assign({}, g.f); let changed = false;
      for (const d of defs) if (rnd() < rate) { const step = d.step > 0 ? d.step : (d.max - d.min) / 50, v = (fin(p[d.k]) ? p[d.k] : d.def) + (rnd() * 2 - 1) * (d.max - d.min) * 0.15; p[d.k] = +clamp(Math.round(v / step) * step, d.min, d.max).toFixed(6); changed = true; }
      for (const k of Object.keys(V.FILTERS)) if (rnd() < rate / 2) { const o = V.FILTERS[k]; f[k] = o[Math.floor(rnd() * o.length)]; changed = true; }
      if (changed && okParams(p)) return { p, f };
    }
    return null;
  };
  V.cross = (a, b, rnd) => { const p = {}, f = {}; for (const k of Object.keys(a.p)) p[k] = rnd() < 0.5 ? a.p[k] : b.p[k]; for (const k of Object.keys(V.FILTERS)) f[k] = rnd() < 0.5 ? a.f[k] : b.f[k]; return okParams(p) ? { p, f } : null; };
  const filtO = (f) => { const o = {}; for (const k of Object.keys(V.FILTERS)) if (f && f[k]) o[k] = f[k]; return o; };
  V.filtO = filtO;
  /* fitness on the last 50% (never optimised on directly) + a 2-fold walk-forward gate: both later windows must be profitable */
  V.fitness = (c, strat, g, o = {}) => {
    const n = c.length, i50 = Math.floor(n * 0.5), i75 = Math.floor(n * 0.75), tfSec = o.tfSec || 3600, bpy = (365 * 86400) / tfSec;
    const base = Object.assign({ cash: 10000, fee: o.fee != null ? o.fee : 0.001, slip: o.slip != null ? o.slip : 0.0005, tfSec }, filtO(g.f));
    const oos = N.backtest(c, strat, g.p, Object.assign({}, base, { fromT: c[i50].t })), w1 = N.backtest(c.slice(0, i75), strat, g.p, Object.assign({}, base, { fromT: c[i50].t }));
    const e = oos.eq, e0 = e[0] || 1, eN = e[e.length - 1] || e0, w1Ret = w1.eq.length ? w1.eq[w1.eq.length - 1] / (w1.eq[0] || 1) - 1 : 0;
    const w2i = e.length - (n - i75), w2Ret = w2i > 0 ? eN / (e[w2i - 1] || 1) - 1 : 0, years = Math.max(1e-9, e.length / bpy), dd = V.maxDD(e);
    const ann = Math.pow(Math.max(1e-9, eN / e0), 1 / years) - 1, calmar = clamp(dd > 1e-6 ? ann / dd : ann > 0 ? 10 : 0, -50, 50), sharpe = oos.stats.sharpe || 0;
    const wfPass = w1Ret > 0 && w2Ret > 0 && oos.stats.closed >= 3;
    return { sharpe: r2(sharpe), calmar: r2(calmar), oosRet: r2((eN / e0 - 1) * 100), maxDD: r2(dd * 100), trades: oos.stats.closed, wf: [r2(w1Ret * 100), r2(w2Ret * 100)], wfPass, score: wfPass ? r2(sharpe + calmar, 4) : -Infinity };
  };
  V.evolve = (c, strat, baseParams, o = {}, onProg) => {
    const defs = V.mutable(strat), rnd = V.rng(o.seed || 11), gens = clamp(o.gens | 0 || 6, 1, 30), pop = clamp(o.pop | 0 || 14, 4, 60), elite = Math.max(2, Math.round(pop / 4));
    const key = (g) => JSON.stringify([g.p, filtO(g.f)]), seen = new Map(), rej = { wf: 0, val: 0 }, hist = [];
    const evalG = (g) => { const k = key(g); if (!seen.has(k)) { let fit; try { fit = V.fitness(c, strat, g, o); } catch (e) { fit = { score: -Infinity, wfPass: false, err: String(e.message || e) }; } if (!fit.wfPass) rej.wf++; seen.set(k, Object.assign({ p: g.p, f: filtO(g.f) }, fit)); } return seen.get(k); };
    const base = evalG({ p: Object.assign({}, baseParams), f: {} });
    let cur = [base], guard0 = 0; while (cur.length < pop && guard0++ < pop * 4) { const m = V.mutate(base, defs, rnd, 0.6); if (m) cur.push(evalG(m)); }
    for (let gN = 1; gN <= gens; gN++) {
      const ranked = cur.filter((x) => x.score > -Infinity).sort((a, b) => b.score - a.score), top = ranked.slice(0, elite), parents = top.length ? top : [base];
      hist.push({ gen: gN, best: ranked.length ? r2(ranked[0].score) : null, alive: ranked.length, of: cur.length });
      if (onProg) onProg(gN, gens, 'generation ' + gN);
      if (gN === gens) break;
      const next = parents.slice(); let guard = 0;
      while (next.length < pop && guard++ < pop * 6) { const a = parents[Math.floor(rnd() * parents.length)], b = parents[Math.floor(rnd() * parents.length)], ch = a !== b && rnd() < 0.4 ? V.cross(a, b, rnd) : V.mutate(a, defs, rnd); if (ch) next.push(evalG(ch)); }
      cur = next;
    }
    const alive = [...seen.values()].filter((x) => x.score > -Infinity).sort((a, b) => b.score - a.score), survivors = [];
    for (const s of alive) {
      if (survivors.length >= (o.keep || 3)) break;
      if (survivors.some((x) => x.score === s.score && x.trades === s.trades && JSON.stringify(x.f) === JSON.stringify(s.f))) continue; // same behaviour, different dead parameter
      if (typeof N.validate === 'function' && o.validate !== false) {
        let v = null; try { v = N.validate(c, strat, s.p, Object.assign({ tfSec: o.tfSec || 3600 }, filtO(s.f))); } catch (e) { v = null; }
        if (!v || 'DF'.includes(v.grade)) { rej.val++; continue; }
        s.grade = v.grade; s.vscore = v.score;
      }
      survivors.push(s);
    }
    return { base, survivors, gens: hist, rejected: rej, evaluated: seen.size, mutable: defs.map((d) => d.k) };
  };

  /* ══ 2. liquidity stress + fragility break-point ══ */
  /* cost per round trip at friction multiplier m: spread (widens with ATR% vs its median) + square-root market impact;
     orders larger than cap × bar dollar volume fill partially. The break-point is the m where compounded return hits 0. */
  V.stressRows = (c, pairs, o = {}) => {
    const im = idxMap(c), ap = atrPct(c), med = q(ap.filter(fin), 0.5) || 0.01, usd = o.usd || 10000, cap = o.cap || 0.1;
    return pairs.map((p) => { const i = im.get(p.entryT), k = i == null ? -1 : Math.max(0, i - 1), b = c[k] || {}, a = fin(ap[k]) ? ap[k] : med, dv = (b.v || 0) * (b.c || 0);
      return { ret: p.ret, volF: clamp(a / med, 0.5, 5), atr: a, part: dv > 0 ? Math.min(1, usd / dv) : 0, fill: dv > 0 ? Math.min(1, (cap * dv) / usd) : 1 }; });
  };
  V.stressRet = (rows, m, o = {}) => { const hs = (o.spreadBps != null ? o.spreadBps : 5) / 2e4; let e = 1; for (const r of rows) { const cost = 2 * m * (hs * r.volF + 0.5 * r.atr * Math.sqrt(r.part)); e *= 1 + r.fill * (r.ret - cost); } return e - 1; };
  V.fragility = (rows, o = {}) => {
    if (!rows || !rows.length) return null; const f = (m) => V.stressRet(rows, m, o), MAX = 200, base = f(0);
    let bp; if (base <= 0) bp = 0; else if (f(MAX) > 0) bp = Infinity; else { let lo = 0, hi = MAX; for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; } bp = r2((lo + hi) / 2); }
    const sb = o.spreadBps != null ? o.spreadBps : 5;
    return { base: r2(base * 100), at1: r2(f(1) * 100), breakPoint: bp, spreadAtBreakBps: fin(bp) ? r2(bp * sb, 1) : bp, partial: rows.filter((r) => r.fill < 1).length,
      curve: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 35].map((m) => [m, r2(f(m) * 100)]), verdict: bp === 0 ? 'Already unprofitable after costs' : bp === Infinity ? 'Survives 200× friction' : bp < 2 ? 'Fragile: flips on normal spread widening' : bp < 5 ? 'Moderate: survives a typical volatility spike' : 'Robust to liquidity stress' };
  };

  /* ══ 3. regime attribution + calibrated crisis replays ══ */
  V.REGIMES = { bull: 'Bull Trend', bear: 'Bear Trend', chop: 'Low-Vol Chop', panic: 'High-Vol Panic' };
  V.regimes = (c, look = 50) => {
    const ap = atrPct(c), r = c.map((b, i) => (i >= look ? b.c / c[i - look].c - 1 : null)), th = 0.5 * sd(r.filter(fin)), hv = q(ap.filter(fin), 0.8);
    return c.map((b, i) => (r[i] == null ? null : fin(ap[i]) && ap[i] >= hv && r[i] < 0 ? 'panic' : r[i] > th ? 'bull' : r[i] < -th ? 'bear' : 'chop'));
  };
  V.attribute = (c, eq, from = 0) => {
    const reg = V.regimes(c), acc = {}; for (const k of Object.keys(V.REGIMES)) acc[k] = { bars: 0, pnl: 0, rets: [], bh: [] };
    for (let k = 1; k < eq.length; k++) { const i = from + k, g = reg[i]; if (!g || !c[i] || !c[i - 1] || !(eq[k - 1] > 0)) continue; const R = acc[g]; R.bars++; R.pnl += eq[k] - eq[k - 1]; R.rets.push(eq[k] / eq[k - 1] - 1); R.bh.push(c[i].c / c[i - 1].c - 1); }
    const out = {}; for (const [k, R] of Object.entries(acc)) { const ce = V.curve(R.rets), cb = V.curve(R.bh); out[k] = { label: V.REGIMES[k], bars: R.bars, pnl: r2(R.pnl), ret: r2((ce[ce.length - 1] - 1) * 100), maxDD: r2(V.maxDD(ce) * 100), bhRet: r2((cb[cb.length - 1] - 1) * 100) }; }
    return out;
  };
  /* seg: [fraction of the window, move over that segment, volatility multiplier] */
  V.CRISES = {
    flush2020: { name: '2020 Liquidity Flush', when: 'Feb 19 – Mar 23 2020', days: 33, seg: [[0.8, -0.5, 4], [0.2, 0.25, 3]] },
    delev2022: { name: '2022 Crypto Deleveraging', when: 'May 5 – Jun 18 2022', days: 45, seg: [[0.3, -0.25, 2.2], [0.15, 0.1, 2], [0.4, -0.4, 3], [0.15, 0.12, 2]] },
    fomc2022: { name: 'FOMC Rate-Shock Windows', when: 'Jun – Nov 2022 decisions', days: 20, seg: [[0.2, 0.03, 1], [0.05, -0.08, 4], [0.2, 0.04, 2], [0.2, 0.02, 1], [0.05, -0.07, 4], [0.3, 0.03, 1.5]] },
  };
  V.crisisPath = (c, key, o = {}) => {
    if (!own(V.CRISES, key) || !c || c.length < 60) return null; const C = V.CRISES[key];
    const tf = o.tfSec || 3600, bars = clamp(Math.round((C.days * 86400) / tf), 30, 900), rnd = V.rng(o.seed || 5), lr = [];
    for (let i = 1; i < c.length; i++) if (c[i - 1].c > 0 && c[i].c > 0) lr.push(Math.log(c[i].c / c[i - 1].c));
    const mu = mean(lr), out = []; let pc = c[c.length - 1].c, t = c[c.length - 1].t;
    for (const [frac, move, vx] of C.seg) {
      const n = Math.max(2, Math.round(bars * frac)), draws = []; for (let k = 0; k < n; k++) draws.push((lr[Math.floor(rnd() * lr.length)] - mu) * vx);
      const drift = (Math.log(1 + move) - draws.reduce((s, x) => s + x, 0)) / n;
      for (const d of draws) { const o0 = pc, cl = pc * Math.exp(d + drift), w = Math.abs(d) * 0.6 + 0.001 * vx; t += tf; out.push({ t, o: o0, h: Math.max(o0, cl) * (1 + w * rnd()), l: Math.min(o0, cl) * (1 - w * rnd()), c: cl, v: (c[Math.floor(rnd() * c.length)].v || 1) * vx }); pc = cl; }
    }
    return out;
  };
  V.crisisTest = (c, strat, params, key, o = {}) => {
    const path = V.crisisPath(c, key, o); if (!path) return null; const warm = c.slice(-300), all = warm.concat(path);
    const r = N.backtest(all, strat, params, Object.assign({ cash: 10000, fee: 0.001, slip: 0.0005, tfSec: o.tfSec || 3600 }, filtO(o.filters), { fromT: path[0].t }));
    const bh = path[path.length - 1].c / warm[warm.length - 1].c - 1, bhDD = V.maxDD([warm[warm.length - 1].c].concat(path.map((b) => b.c)));
    return { key, name: V.CRISES[key].name, when: V.CRISES[key].when, bars: path.length, ret: r2(r.stats.ret), maxDD: r2(r.stats.maxDD), trades: r.stats.closed, bhRet: r2(bh * 100), bhDD: r2(bhDD * 100), eq: r.eq, attr: V.attribute(all, r.eq, r.from) };
  };

  /* ══ 4. trade-level feature importance + kill-switch filters ══ */
  V.FEATS = { hour: 'Session (UTC hour)', rvol: 'Relative volume', atrp: 'ATR percentile', rsi: 'RSI 14', vwap: 'VWAP distance %' };
  V.SESS = (h) => (h < 7 ? 'Asia' : h < 13 ? 'London' : h < 20 ? 'New York' : 'Late');
  V.featureRows = (c, pairs) => {
    const im = idxMap(c), a = N.ind.atr(c, 14), rsi = N.ind.rsi(c.map((b) => b.c), 14), ap = atrPct(c);
    return pairs.map((p, n) => {
      const i0 = im.get(p.entryT); if (i0 == null) return null; const i = Math.max(0, i0 - 1), b = c[i];
      let vs = 0, vn = 0, pv = 0, vv = 0; for (let k = Math.max(0, i - 20); k < i; k++) { vs += c[k].v || 0; vn++; } for (let k = Math.max(0, i - 23); k <= i; k++) { pv += ((c[k].h + c[k].l + c[k].c) / 3) * (c[k].v || 0); vv += c[k].v || 0; }
      const win = a.slice(Math.max(0, i - 100), i + 1).filter(fin), vw = vv > 0 ? pv / vv : b.c;
      return { n, ret: p.ret, win: p.pnl > 0, entryT: p.entryT, exitT: p.exitT, atr: fin(ap[i]) ? ap[i] : null,
        f: { hour: new Date(b.t * 1000).getUTCHours(), rvol: vn && vs > 0 ? r2((b.v || 0) / (vs / vn), 3) : null, atrp: fin(a[i]) && win.length ? r2(win.filter((x) => x <= a[i]).length / win.length, 3) : null, rsi: fin(rsi[i]) ? r2(rsi[i], 1) : null, vwap: r2(((b.c - vw) / vw) * 100, 3) } };
    }).filter(Boolean);
  };
  const auc = (w, l) => { if (!w.length || !l.length) return 0.5; let s = 0; for (const x of w) for (const y of l) s += x > y ? 1 : x === y ? 0.5 : 0; return s / (w.length * l.length); };
  const total = (rows) => V.curve(rows.map((r) => r.ret)).pop() - 1;
  V.keep = (row, rule) => { const v = row.f[rule.k]; if (rule.k === 'hour') return V.SESS(v) !== rule.v; if (v == null) return true; return rule.op === '<' ? !(v < rule.v) : !(v > rule.v); };
  V.applyRules = (rows, rules) => rows.filter((r) => (rules || []).every((u) => V.keep(r, u)));
  V.importance = (rows) => {
    if (!rows || rows.length < 8) return [];
    const res = [], minKeep = Math.ceil(rows.length * 0.4), t0 = total(rows);
    const sess = {}; for (const r of rows) { const s = V.SESS(r.f.hour); (sess[s] = sess[s] || []).push(r); }
    const ss = Object.entries(sess).filter(([, a]) => a.length >= 3).map(([s, a]) => [s, a.filter((x) => x.win).length / a.length]);
    if (ss.length >= 2) { ss.sort((x, y) => x[1] - y[1]); const [worst, wr] = ss[0], best = ss[ss.length - 1][1], rule = { k: 'hour', op: 'not', v: worst }, kept = V.applyRules(rows, [rule]);
      if (kept.length >= minKeep) res.push({ k: 'hour', label: V.FEATS.hour, importance: r2(best - wr, 3), rule, desc: `Skip ${worst} session entries (win rate ${Math.round(wr * 100)}%)`, gain: r2((total(kept) - t0) * 100), keep: kept.length }); }
    for (const k of ['rvol', 'atrp', 'rsi', 'vwap']) {
      const xs = rows.filter((r) => r.f[k] != null); if (xs.length < 8) continue;
      const imp = Math.abs(auc(xs.filter((r) => r.win).map((r) => r.f[k]), xs.filter((r) => !r.win).map((r) => r.f[k])) - 0.5) * 2; let bestR = null;
      for (const p of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) { const v = q(xs.map((r) => r.f[k]), p); for (const op of ['<', '>']) { const rule = { k, op, v }, kept = V.applyRules(rows, [rule]); if (kept.length < minKeep || kept.length === rows.length) continue; const g = total(kept) - t0; if (!bestR || g > bestR.g) bestR = { rule, g, kept: kept.length }; } }
      if (bestR) res.push({ k, label: V.FEATS[k], importance: r2(imp, 3), rule: bestR.rule, desc: `Skip entries with ${V.FEATS[k]} ${bestR.rule.op} ${r2(bestR.rule.v, 2)}`, gain: r2(bestR.g * 100), keep: bestR.kept });
    }
    return res.sort((a, b) => b.importance - a.importance || b.gain - a.gain).slice(0, 3);
  };

  /* ══ 5. dynamic position sizing + prop-firm pass probability ══ */
  V.SIZERS = { fixed: 'Fixed Fractional (1% risk)', halfKelly: 'Half-Kelly', volTarget: 'Volatility-Targeted (ATR)', eqCurve: 'Equity-Curve Trading' };
  V.sizer = (kind, rows) => {
    const rets = rows.map((r) => r.ret), m = mean(rets), v = sd(rets) ** 2, medA = q(rows.map((r) => r.atr).filter(fin), 0.5) || 0.02, kelly = v > 0 ? clamp(m / v / 2, 0, 1) : 0;
    const fixed = (r) => clamp(0.01 / Math.max(1e-4, 2 * (fin(r.atr) ? r.atr : medA)), 0, 1); // 1% of equity lost if a 2×ATR stop is hit
    if (kind === 'halfKelly') return () => kelly;
    if (kind === 'volTarget') return (r) => clamp((0.5 * medA) / Math.max(1e-4, fin(r.atr) ? r.atr : medA), 0, 1);
    if (kind === 'eqCurve') return (r, eqs) => { const n = eqs.length, ma = mean(eqs.slice(Math.max(0, n - 20))); return fixed(r) * (n >= 20 && eqs[n - 1] < ma ? 0.5 : 1); };
    return fixed;
  };
  V.sizing = (rows) => Object.keys(V.SIZERS).map((k) => { const f = V.sizer(k, rows), eq = V.curve(rows.map((r) => r.ret), (i, e, eqs) => f(rows[i], eqs)); return { k, name: V.SIZERS[k], eq, ret: r2((eq[eq.length - 1] - 1) * 100), maxDD: r2(V.maxDD(eq) * 100) }; });
  /* typical evaluation rules (daily loss + trailing drawdown from the high-water mark); check your firm's exact numbers */
  V.PROP = { '50k': { size: 50000, target: 3000, daily: 1100, trail: 2000 }, '100k': { size: 100000, target: 6000, daily: 2200, trail: 3000 } };
  V.propOdds = (rows, kind, acct, o = {}) => {
    if (!own(V.PROP, acct) || !rows || rows.length < 5) return null; const R = V.PROP[acct], f = V.sizer(kind, rows), rnd = V.rng(o.seed || 3), runs = o.runs || 2000, days = o.days || 30;
    const nDays = new Set(rows.map((r) => Math.floor(r.entryT / 86400))).size || 1, tpd = clamp(Math.round(rows.length / nDays), 1, 10); let pass = 0, daily = 0, trail = 0;
    for (let k = 0; k < runs; k++) {
      let e = R.size, pk = R.size, out = null; const eqs = [1];
      for (let d = 0; d < days && !out; d++) { const d0 = e; for (let j = 0; j < tpd && !out; j++) { const r = rows[Math.floor(rnd() * rows.length)]; e += e * f(r, eqs) * r.ret; eqs.push(e / R.size); pk = Math.max(pk, e); if (d0 - e >= R.daily) out = 'daily'; else if (pk - e >= R.trail) out = 'trail'; else if (e - R.size >= R.target) out = 'pass'; } }
      if (out === 'pass') pass++; else if (out === 'daily') daily++; else if (out === 'trail') trail++;
    }
    return { acct, kind, runs, tradesPerDay: tpd, pass: r2((pass / runs) * 100, 1), daily: r2((daily / runs) * 100, 1), trail: r2((trail / runs) * 100, 1), timeout: r2(((runs - pass - daily - trail) / runs) * 100, 1) };
  };

  /* ══ 6. synthetic paths: stationary block bootstrap (keeps fat tails + volatility clustering, shuffles dates) ══ */
  V.synthPath = (c, rnd, o = {}) => {
    const n = c.length, block = Math.max(2, o.block || 24), noise = clamp(+o.noise || 0, 0, 2), out = []; if (n < 3) return [];
    const rs = []; for (let i = 1; i < n; i++) rs.push(c[i].c / c[i - 1].c - 1); const s = sd(rs);
    let pc = c[0].c, j = 1 + Math.floor(rnd() * (n - 1));
    out.push(Object.assign({}, c[0]));
    for (let i = 1; i < n; i++) {
      if (rnd() < 1 / block || j >= n) j = 1 + Math.floor(rnd() * (n - 1));
      const b = c[j], p0 = c[j - 1].c; let k = 1;
      if (noise) { const z = gauss(rnd), ch = (gauss(rnd) ** 2 + gauss(rnd) ** 2 + gauss(rnd) ** 2) / 3; k = Math.max(0.5, 1 + (noise * s * z) / Math.sqrt(ch || 1e-9)); } // Student-t(3) shock: fat-tailed adversarial noise
      const sc = (pc / p0) * k; out.push({ t: c[i].t, o: b.o * sc, h: b.h * sc, l: b.l * sc, c: b.c * sc, v: b.v }); pc = b.c * sc; j++;
    }
    return out;
  };
  V.pathStats = (c) => { const r = []; for (let i = 1; i < c.length; i++) r.push(Math.log(c[i].c / c[i - 1].c)); const m = mean(r), v = mean(r.map((x) => (x - m) ** 2)), k = v > 0 ? mean(r.map((x) => (x - m) ** 4)) / (v * v) - 3 : 0, a = r.map((x) => Math.abs(x)), am = mean(a); let num = 0, den = 0; for (let i = 0; i < a.length; i++) { den += (a[i] - am) ** 2; if (i) num += (a[i] - am) * (a[i - 1] - am); } return { vol: Math.sqrt(v), kurt: k, clust: den > 0 ? num / den : 0 }; };
  V.synthTest = (c, strat, params, o = {}, onProg) => {
    const n = clamp(o.paths | 0 || 200, 10, 5000), rnd = V.rng(o.seed || 9), bo = Object.assign({ cash: 10000, fee: 0.001, slip: 0.0005, tfSec: o.tfSec || 3600 }, filtO(o.filters));
    const real = N.backtest(c, strat, params, bo).stats.ret, rets = [], dds = [], st = []; let pos = 0, beat = 0;
    for (let k = 0; k < n; k++) { const p = V.synthPath(c, rnd, o), r = N.backtest(p, strat, params, bo).stats; rets.push(r.ret); dds.push(r.maxDD); if (r.ret > 0) pos++; if (r.ret >= real) beat++; if (k < 20) st.push(V.pathStats(p)); if (onProg && k % 20 === 19) onProg(k + 1, n, 'synthetic path ' + (k + 1)); }
    const sr = V.pathStats(c), avg = (key) => mean(st.map((x) => x[key])), prof = pos / n;
    return { paths: n, real: r2(real), p5: r2(q(rets, 0.05)), p50: r2(q(rets, 0.5)), p95: r2(q(rets, 0.95)), ddP50: r2(q(dds, 0.5)), profitable: r2(prof * 100, 1), beatReal: r2((beat / n) * 100, 1), hist: rets.map((x) => r2(x, 1)),
      physics: { real: { vol: r2(sr.vol, 5), kurt: r2(sr.kurt), clust: r2(sr.clust, 3) }, synth: { vol: r2(avg('vol'), 5), kurt: r2(avg('kurt')), clust: r2(avg('clust'), 3) } },
      verdict: prof >= 0.6 ? 'Edge survives on synthetic market physics' : prof >= 0.4 ? 'Mixed: part of the edge depends on the exact historical sequence' : 'Likely memorised history: the edge vanishes on reshuffled paths' };
  };

  /* ══ 7. trade-by-trade inspector ══ */
  V.nearestTrade = (pairs, t) => { if (!pairs || !pairs.length || !fin(t)) return -1; let best = -1, bd = Infinity; pairs.forEach((p, i) => { const d = t >= p.entryT && t <= p.exitT ? 0 : Math.min(Math.abs(t - p.entryT), Math.abs(t - p.exitT)); if (d < bd) { bd = d; best = i; } }); return best; };
  V.inspect = (c, p, pad = 20) => {
    if (!p) return null; const im = idxMap(c), i0 = im.get(p.entryT), i1 = im.get(p.exitT); if (i0 == null || i1 == null || i1 < i0) return null;
    let hi = -Infinity, lo = Infinity; for (let i = i0; i <= i1; i++) { hi = Math.max(hi, c[i].h); lo = Math.min(lo, c[i].l); }
    const a = Math.max(0, i0 - pad), b = Math.min(c.length, i1 + pad + 1), fr = V.featureRows(c, [p])[0];
    return { a, bars: c.slice(a, b), entryAt: i0 - a, exitAt: i1 - a, entry: p.entry, exit: p.exit, ret: r2(p.ret * 100), mfe: r2((hi / p.entry - 1) * 100), mae: r2((lo / p.entry - 1) * 100), held: i1 - i0, feat: fr ? fr.f : {} };
  };

  /* ══ 8. promote to the Grok shadow bot: a whitelisted, size-capped package (never touches balances) ══ */
  const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  V.shadowPackage = (x) => {
    if (!x || typeof x.id !== 'string' || !own(N.strategies, x.id)) return null; const S = N.strategies[x.id], p = {};
    for (const d of S.params || []) { const v = x.params && own(x.params, d.k) ? +x.params[d.k] : d.def; if (!fin(v)) return null; p[d.k] = clamp(v, fin(d.min) ? d.min : v, fin(d.max) ? d.max : v); }
    const f = {}; for (const k of Object.keys(V.FILTERS)) { const v = x.filters ? +x.filters[k] : 0; if (v && V.FILTERS[k].includes(v)) f[k] = v; }
    const sym = String(x.sym || ''); if (!/^[A-Za-z0-9:._\-/]{1,60}$/.test(sym)) return null;
    return { v: 1, kind: 'v153-shadow', id: x.id, name: String(S.name || x.id).slice(0, 60), params: p, filters: f, sym, tf: TFS.includes(x.tf) ? x.tf : '1h', grade: /^[A-F]$/.test(x.grade || '') ? x.grade : null,
      risk: { usd: clamp(+x.usd || 1000, 10, 1e6), maxDailyLoss: clamp(+x.maxDailyLoss || 3, 0.5, 20), maxOpen: 1 }, ts: fin(x.ts) ? x.ts : Date.now() };
  };
  /* desired position at the last closed bar, from a fresh backtest of the packaged strategy */
  V.shadowWant = (c, pkg, tfSec) => { if (!pkg || !c || c.length < 60 || !own(N.strategies, pkg.id)) return null; const r = N.backtest(c.slice(-400), N.strategies[pkg.id], pkg.params, Object.assign({ cash: 10000, tfSec: tfSec || 3600 }, filtO(pkg.filters))); return !!(r.acct.pos && r.acct.pos.X && r.acct.pos.X.qty > 0); };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V153;
