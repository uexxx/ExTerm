/* ExTerm v14: pure logic for the v14 features (no DOM, unit-tested in node):
   candle data-quality check, risk of ruin (Monte Carlo of closed-trade returns), multi-timeframe trend,
   P&L calendar, version compare, the "welcome back" summary and the keyboard shortcut table. */
const V14 = (() => {
  const P = {};
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);

  /* ── 1. candle data quality: gaps, duplicates, out-of-order bars, bad prices, frozen runs ── */
  P.dataQuality = (candles, tfSec) => {
    const out = { n: 0, gaps: 0, missingBars: 0, maxGapBars: 0, dupes: 0, unordered: 0, badBars: 0, flatRun: 0, zeroVol: 0, issues: [], grade: 'A' };
    if (!Array.isArray(candles) || !candles.length) { out.issues.push({ sev: 'bad', text: 'No candles.' }); out.grade = 'F'; return out; }
    out.n = candles.length;
    const step = tfSec > 0 ? tfSec : (candles.length > 1 ? candles[1].t - candles[0].t : 60);
    let run = 0, maxRun = 0;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i] || {};
      if (![c.o, c.h, c.l, c.c].every((v) => fin(v) && v > 0) || c.h < Math.max(c.o, c.c) - 1e-12 || c.l > Math.min(c.o, c.c) + 1e-12) out.badBars++;
      if (!(c.v > 0)) out.zeroVol++;
      if (i) {
        const p = candles[i - 1] || {}, dt = c.t - p.t;
        if (dt === 0) out.dupes++;
        else if (dt < 0) out.unordered++;
        else if (dt > step * 1.5) { const miss = Math.round(dt / step) - 1; out.gaps++; out.missingBars += miss; if (miss > out.maxGapBars) out.maxGapBars = miss; }
        if (c.o === c.c && c.h === c.l && c.c === p.c) { run++; if (run > maxRun) maxRun = run; } else run = 0;
      }
    }
    out.flatRun = maxRun;
    const pct = (k) => (k / out.n) * 100;
    if (out.unordered) out.issues.push({ sev: 'bad', text: `${out.unordered} bar${out.unordered > 1 ? 's are' : ' is'} out of time order.` });
    if (out.dupes) out.issues.push({ sev: 'bad', text: `${out.dupes} duplicate timestamp${out.dupes > 1 ? 's' : ''}.` });
    if (out.badBars) out.issues.push({ sev: pct(out.badBars) > 1 ? 'bad' : 'warn', text: `${out.badBars} bar${out.badBars > 1 ? 's have' : ' has'} impossible prices (high below close, zero or missing values).` });
    if (out.gaps) out.issues.push({ sev: pct(out.missingBars) > 5 ? 'bad' : 'warn', text: `${out.gaps} gap${out.gaps > 1 ? 's' : ''} in the data, ${out.missingBars} missing bar${out.missingBars > 1 ? 's' : ''} in total (longest: ${out.maxGapBars}). Normal for stocks overnight and on weekends.` });
    if (maxRun >= 20) out.issues.push({ sev: 'warn', text: `Price didn't move for ${maxRun} bars in a row (thin market or a frozen feed).` });
    if (pct(out.zeroVol) > 30) out.issues.push({ sev: 'warn', text: `${pct(out.zeroVol).toFixed(0)}% of bars have no volume: volume-based strategies will mislead.` });
    const bad = out.issues.filter((x) => x.sev === 'bad').length, warn = out.issues.length - bad;
    out.grade = bad >= 2 ? 'F' : bad ? 'D' : warn >= 2 ? 'C' : warn ? 'B' : 'A';
    return out;
  };

  /* ── 2. risk of ruin: resample the strategy's own closed-trade returns (with replacement) many times and count how
     often the account falls ddLimit% below its peak within `horizon` trades. Seeded, so results are repeatable. ── */
  P.riskOfRuin = (rets, o = {}) => {
    const R = (Array.isArray(rets) ? rets : []).filter(fin).map((r) => Math.max(-0.99, r));
    const res = { n: R.length, sims: 0, ruinPct: null, medianDD: null, p95DD: null, ddLimit: o.ddLimit || 50 };
    if (R.length < 5) return res;
    const sims = Math.min(20000, Math.max(100, o.sims | 0 || 2000)), horizon = Math.max(R.length, o.horizon | 0 || 100), lim = res.ddLimit / 100;
    let s = (o.seed | 0) || 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let ruined = 0; const dds = new Float64Array(sims);
    for (let k = 0; k < sims; k++) {
      let eq = 1, peak = 1, mdd = 0;
      for (let i = 0; i < horizon; i++) { eq *= 1 + R[Math.floor(rnd() * R.length)]; if (eq > peak) peak = eq; const dd = 1 - eq / peak; if (dd > mdd) mdd = dd; if (mdd >= lim) break; }
      if (mdd >= lim) ruined++; dds[k] = mdd;
    }
    dds.sort(); res.sims = sims; res.horizon = horizon;
    res.ruinPct = (ruined / sims) * 100; res.medianDD = dds[Math.floor(sims * 0.5)] * 100; res.p95DD = dds[Math.min(sims - 1, Math.floor(sims * 0.95))] * 100;
    return res;
  };

  /* ── 3. multi-timeframe trend: EMA20 vs EMA50 + RSI(14) on closed candles ── */
  const ema = (xs, n) => { const k = 2 / (n + 1); let e = null; const out = []; for (const x of xs) { e = e == null ? x : x * k + e * (1 - k); out.push(e); } return out; };
  const rsi = (xs, n = 14) => {
    if (xs.length <= n) return null; let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (let i = n + 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  };
  P.mtfTrend = (candles) => {
    const cs = (Array.isArray(candles) ? candles : []).map((c) => c && c.c).filter((x) => fin(x) && x > 0);
    if (cs.length < 55) return { dir: 'n/a', note: 'not enough history' };
    const e20 = ema(cs, 20), e50 = ema(cs, 50), i = cs.length - 1, r = rsi(cs, 14);
    const spread = (e20[i] - e50[i]) / e50[i], slope = (e20[i] - e20[i - 5]) / e20[i - 5];
    let score = 0; score += spread > 0.001 ? 1 : spread < -0.001 ? -1 : 0; score += slope > 0.0005 ? 1 : slope < -0.0005 ? -1 : 0; score += r > 55 ? 1 : r < 45 ? -1 : 0;
    return { dir: score >= 2 ? 'up' : score <= -2 ? 'down' : 'flat', score, rsi: r, spreadPct: spread * 100 };
  };
  P.mtfSummary = (rows) => { // rows: [{tf, dir}] → plain-language read
    const ok = rows.filter((r) => r.dir === 'up' || r.dir === 'down' || r.dir === 'flat'); if (!ok.length) return 'Trend unavailable';
    const up = ok.filter((r) => r.dir === 'up').length, dn = ok.filter((r) => r.dir === 'down').length;
    return up === ok.length ? 'All timeframes up' : dn === ok.length ? 'All timeframes down' : up > dn ? 'Mostly up' : dn > up ? 'Mostly down' : 'Mixed: no clear trend';
  };

  /* ── 4. P&L calendar for one month (closed trades only), keyed by the user's local day ── */
  P.calendar = (entries, year, month, dayKey) => {
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), map = new Map();
    for (const e of Array.isArray(entries) ? entries : []) {
      if (!e || e.side !== 'sell' || !fin(e.pnl) || !fin(e.ts)) continue;
      const k = dayKey(e.ts); const m = map.get(k) || { pnl: 0, n: 0, w: 0 }; m.pnl += e.pnl; m.n++; if (e.pnl > 0) m.w++; map.set(k, m);
    }
    const pad = (x) => String(x).padStart(2, '0'), out = { year, month, startDow: new Date(Date.UTC(year, month, 1)).getUTCDay(), days: [], total: 0, n: 0, best: null, worst: null, green: 0, red: 0 };
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${pad(month + 1)}-${pad(d)}`, m = map.get(key) || { pnl: 0, n: 0, w: 0 }, row = { d, key, pnl: m.pnl, n: m.n, w: m.w };
      out.days.push(row); out.total += m.pnl; out.n += m.n;
      if (m.n) { if (m.pnl > 0) out.green++; else if (m.pnl < 0) out.red++; if (!out.best || m.pnl > out.best.pnl) out.best = row; if (!out.worst || m.pnl < out.worst.pnl) out.worst = row; }
    }
    return out;
  };

  /* ── 5. version compare ("13.10" > "13.9"; "v14.0" == "14") ── */
  P.parseVer = (v) => { const m = /^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?$/.exec(String(v || '').trim()); return m ? [+m[1], +(m[2] || 0), +(m[3] || 0)] : null; };
  P.newer = (latest, current) => { const a = P.parseVer(latest), b = P.parseVer(current); if (!a || !b) return false; for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };

  /* ── 6. welcome-back summary from the last visit snapshot ── */
  P.away = (last, now, o = {}) => {
    if (!last || !fin(last.ts) || !fin(now.ts) || now.ts - last.ts < (o.minAway || 30 * 60000)) return null;
    const movers = [];
    for (const [s, p0] of Object.entries(last.px || {})) { const p1 = (now.px || {})[s]; if (fin(p0) && fin(p1) && p0 > 0) movers.push({ sym: s, ch: (p1 / p0 - 1) * 100 }); }
    movers.sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
    return { awayMs: now.ts - last.ts, movers: movers.slice(0, o.top || 4), eqCh: fin(last.eq) && fin(now.eq) ? now.eq - last.eq : null, newTrades: fin(last.jn) && fin(now.jn) ? Math.max(0, now.jn - last.jn) : 0 };
  };
  P.fmtAway = (ms) => { const m = Math.round(ms / 60000); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 48) return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : ''); return Math.round(h / 24) + ' days'; };

  /* ── 7. keyboard shortcuts (Markets tab, when not typing) ── */
  P.SHORTCUTS = [['1 – 9', 'Switch timeframe (1 = shortest)'], ['B', 'Buy ticket (focus the amount)'], ['S', 'Sell ticket'], ['R', 'Bar replay on/off'], ['J', 'Show / hide your journal trades on the chart'],
    ['F', 'Fit the chart (reset zoom)'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo a drawing'], ['Esc', 'Cancel the drawing tool'], ['/', 'Search a symbol'], ['Ctrl+K', 'Command palette'], ['Alt+M', 'Next market (crypto → stocks → on-chain)'], ['?', 'This list']];
  P.keyAction = (e) => {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
    const k = String(e.key || '');
    if (/^[1-9]$/.test(k)) return { a: 'tf', i: +k - 1 };
    return { b: { a: 'buy' }, s: { a: 'sell' }, r: { a: 'replay' }, j: { a: 'journal' }, f: { a: 'fit' }, '?': { a: 'help' } }[k.toLowerCase()] || null;
  };
  return P;
})();
if (typeof module !== 'undefined') module.exports = V14;
