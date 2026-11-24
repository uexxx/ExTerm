/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.9 pure core (no DOM): the 19-lane mesh map, Lane 9 / 10 candle routing + acceptance, recommendation tiers and
   criteria badges (Lane 16), the PIN format, the Live Bot strip formatter, and the order → firewall → ledger request shapes.
   Two-signal palette: Bullion Gold #F5C84B (live / pass) and Crimson #EF4444 (alert / fail) on Obsidian #050608–#0A0D12. */
const V179 = (() => {
  const V = {};
  V.GOLD = '#F5C84B'; V.RED = '#EF4444'; V.VER = '17.9';
  /* ══ 1. the mesh ══ */
  V.MESH = [
    [1, 'Market / WS Ingest'], [2, 'On-Chain DAG Forensics'], [3, 'Heavy Quant / Shock Math'], [4, 'Copilot / Bot Execution'],
    [5, 'Crypto / On-Chain PnL'], [6, 'Stocks / SEC Form 4'], [7, 'Crypto + DEX Tape'], [8, 'US Stocks Tape / L2'],
    [9, 'Crypto + DEX 1s–1M OHLCV'], [10, 'US Equities 1m–1M OHLCV'], [11, 'Equities & 0DTE Gamma'], [12, 'Crypto Perps Squeeze'], [13, 'On-Chain Rug Shield v2'],
    [14, 'Transfer Entropy + 6-Bot Consensus'], [15, '1,000-Path Monte Carlo'], [16, 'MTF Confluence + Journal'], [17, 'Order Router & Shadow Brackets'], [18, 'Risk Firewall & PIN Arming'], [19, 'Fill Accuracy & SHA-256 Audit'],
  ];
  V.BUDGET = { 9: 20, 10: 20, 11: 10, 12: 10, 13: 10, 14: 10, 15: 10, 16: 10, 17: 5, 18: 5, 19: 5 }; // warm-response budgets, ms
  V.BOTS = ['HUNTER-α', 'MUTATOR-EVO', 'HEDGER-ARB', 'RISK-GUARD', 'SNIPER-EXEC', 'SCALPER-EXIT'];
  /* ══ 2. candles (Lanes 9 / 10) ══ */
  V.TFS = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
  V.SEC = { '1s': 1, '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
  V.tfOf = (sec) => { for (const k of V.TFS) if (V.SEC[k] === sec) return k; return null; };
  V.isStock = (sym) => !!sym && !/^oc:/.test(sym) && !/-(USD|USDT|USDC|EUR)$/.test(sym);
  V.candleLane = (sym, sec) => (V.isStock(sym) ? (sec >= 60 ? 10 : null) : 9);
  V.toCandles = (rows) => (rows || []).filter((r) => Array.isArray(r) && r.length >= 6 && r[1] > 0 && r[4] > 0).map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] || 0 }));
  /* only real, warm, deep-enough lane data replaces the existing loader (offline samples never touch the chart) */
  V.accept = (j, n) => !!j && !j.sample && !j.warming && !j.unsupported && Array.isArray(j.rows) && j.rows.length >= Math.max(20, Math.floor(Math.min(n || 300, 250) * 0.8));
  /* ══ 3. recommendations (Lane 16) ══ */
  V.TIERS = ['S-TIER', 'A', 'B+', 'WATCHLIST'];
  V.tierOf = (score, allPassed) => (allPassed && score >= 92 ? 'S-TIER' : score >= 80 ? 'A' : score >= 62 ? 'B+' : 'WATCHLIST');
  V.BADGE = { passed: '✓', pending: '…', failed: '✕' };
  V.badgeCls = (s) => (s === 'passed' ? 'ok' : s === 'failed' ? 'bad' : 'wait');
  V.tierCls = (t) => ({ 'S-TIER': 's', A: 'a', 'B+': 'b', WATCHLIST: 'w' }[t] || 'w');
  V.summary = (r) => r.passed + ' passed · ' + r.pending + ' pending' + (r.criteria ? ' · ' + (r.criteria.length - r.passed - r.pending) + ' failed' : '');
  /* ══ 4. execution (Lanes 17–19) ══ */
  V.pinOk = (p) => /^\d{4,12}$/.test(String(p || ''));
  V.isFlattenKey = (e) => !!e && e.key === 'Escape' && !!e.shiftKey;
  V.checkReq = (o) => ({ sym: o.sym, usd: +o.usd || 0, px: +o.px || 0, atr: +o.atr || 0, equity: +o.equity || 10000, winp: o.winp == null ? 0.5 : +o.winp, payoff: o.payoff == null ? 2 : +o.payoff, slipPct: o.slipPct == null ? undefined : +o.slipPct, feedAgeSec: +o.feedAgeSec || 0, lossTimes: o.lossTimes || [], positions: o.positions || [] });
  V.gate = (mode, verdict) => (verdict === 'BLOCK' ? (mode === 'LIVE' ? 'block' : 'warn') : 'go'); // LIVE orders that fail the firewall are blocked; PAPER orders get the report
  V.money = (v) => { const a = Math.abs(v || 0), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'K' : s + '$' + a.toFixed(0); };
  V.strip = (t) => {
    const f = (x, d) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toFixed(d));
    return [['MODE', t.mode || 'PAPER'], ['ROUTE', t.best ? t.best + ' · ' + f(t.routeMs, 1) + 'ms' : '–'], ['FIREWALL', (t.allow || 0) + '✓ ' + (t.block || 0) + '✕'], ['FILL', f(t.avgBps, 2) + ' bps'], ['LEDGER', (t.ledgerN || 0) + (t.ledgerOk === false ? ' ✕ BROKEN' : ' ✓')], ['BRACKETS', String(t.brackets || 0)], ['FEED', t.lock ? 'DEAD · LOCK' : 'LIVE']];
  };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V179;
