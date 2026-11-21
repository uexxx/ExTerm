/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v15.5 core (pure, Node-testable): Bot Net Profit hero maths, "What Changed?" run diff, Ctrl+K feature index +
   fuzzy search, Simple | Pro workspace groups, smart context defaults per asset class, Favorite-4 quick bar, debounce. */
const V155 = (() => {
  const V = {};
  const num = (x) => (Number.isFinite(+x) ? +x : 0);

  /* ══ Bot Net Profit hero card: every $ figure from one backtest result ══
     res = NT.backtest(...) output ({ eq, trades, acct: { fees } }); slip = slippage fraction the run used.
     Gross profit / loss are closed-trade P&L as the trade log shows it (fees already inside); costs are reported separately. */
  V.hero = (res, capital, slip = 0) => {
    const cap = num(capital) > 0 ? num(capital) : 10000, eq = (res && res.eq) || [], tr = (res && res.trades) || [];
    const end = eq.length ? num(eq[eq.length - 1]) : cap, closed = tr.filter((t) => t.pnl != null && Number.isFinite(t.pnl));
    const wins = closed.filter((t) => t.pnl > 0), losses = closed.filter((t) => t.pnl < 0);
    const grossP = wins.reduce((a, t) => a + t.pnl, 0), grossL = losses.reduce((a, t) => a + t.pnl, 0);
    const fees = tr.reduce((a, t) => a + num(t.fee), 0) || num(res && res.acct && res.acct.fees);
    const s = num(slip) > 0 && num(slip) < 0.5 ? num(slip) : 0;
    const slipUsd = s ? tr.reduce((a, t) => a + num(t.qty) * num(t.price) * (s / ((t.side === 'buy') !== !!t.short ? 1 + s : 1 - s)), 0) : 0; // fill price was pushed up (long buy, short cover) or down
    const net = end - cap;
    return { start: cap, end, net, netPct: (net / cap) * 100, grossP, grossL, fees, slip: slipUsd, costs: fees + slipUsd, closed: closed.length, wins: wins.length, losses: losses.length,
      avgWin: wins.length ? grossP / wins.length : 0, avgLoss: losses.length ? grossL / losses.length : 0, expectancy: closed.length ? (grossP + grossL) / closed.length : 0 };
  };
  /* capital what-if: with size = % of equity every fill, fee and P&L is linear in starting cash (only the $1 minimum-order guard breaks it) */
  V.scale = (res, k) => {
    if (!res || !(k > 0) || k === 1) return res; const m = (v) => (v == null || !Number.isFinite(v) ? v : v * k);
    return Object.assign({}, res, { eq: (res.eq || []).map(m), bh: res.bh ? res.bh.map(m) : res.bh, trades: (res.trades || []).map((t) => Object.assign({}, t, { qty: m(t.qty), usd: m(t.usd), fee: m(t.fee), pnl: m(t.pnl) })), acct: Object.assign({}, res.acct, { fees: m((res.acct && res.acct.fees) || 0) }) });
  };
  V.resample = (p, n) => (!p || !p.length || !(n > 0) ? [] : Array.from({ length: n }, (_, i) => p[Math.round((i / Math.max(1, n - 1)) * (p.length - 1))]));
  /* "What Changed?": exact dollar delta between two runs and the previous curve resampled onto the new length */
  V.diff = (prev, cur) => {
    if (!prev || !cur || !prev.eq || !prev.eq.length || !cur.eq || !cur.eq.length) return null;
    const ghost = V.resample(prev.eq, cur.eq.length);
    const delta = num(cur.end) - num(prev.end);
    return { delta, ghost, better: delta > 0, same: Math.abs(delta) < 0.005 };
  };
  V.usd = (v, sign = false) => { const x = num(v), s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (x < 0 ? '−$' : sign && x > 0 ? '+$' : '$') + s; };
  V.pct = (v, sign = true) => { const x = num(v); return (x < 0 ? '−' : sign && x > 0 ? '+' : '') + Math.abs(x).toFixed(2) + '%'; };

  /* ══ Simple | Pro workspaces ══ */
  V.SIMPLE_TABS = ['markets', 'set'];
  V.GROUPS = [['trade', 'v155.g.trade', ['markets', 'heat', 'port', 'workspace', 'desk']], ['intel', 'v155.g.intel', ['whales', 'social', 'ai', 'world', 'grok']], ['quant', 'v155.g.quant', ['bots', 'lab', 'challenge', 'journal']], ['acad', 'v155.g.acad', ['set']]];
  V.groupOf = (tab) => (V.GROUPS.find(([, , t]) => t.includes(tab)) || ['trade'])[0];
  V.mode = (m) => (m === 'simple' ? 'simple' : 'pro');

  /* ══ smart context defaults: tools worth a highlight per asset class (keys are Overlays / AI Lens entries) ══ */
  V.CONTEXT = { crypto: ['ghost', 'sess', 'heat'], stocks: ['gamma', 'gap', 'sess'], onchain: ['safety', 'xray'] };
  V.context = (mode) => V.CONTEXT[mode] || V.CONTEXT.crypto;

  /* ══ Favorite 4: star/unstar, never more than four, only known ids ══ */
  V.FAV_MAX = 4;
  V.toggleFav = (list, id, known) => { const L = (Array.isArray(list) ? list : []).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i && (!known || known.includes(x))); if (L.includes(id)) return L.filter((x) => x !== id); if (known && !known.includes(id)) return L.slice(0, V.FAV_MAX); return L.concat([id]).slice(-V.FAV_MAX); };

  /* ══ Ctrl+K: one searchable index over tabs, tools, indicators, strategies, lessons, symbols ══
     entries: { id, l (label), k (keywords), g (group label), alt (translated label) } — matching folds accents/case,
     scores exact > prefix > word-prefix > substring > subsequence (typo-tolerant), and searches every alias. */
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const subseq = (q, s) => { let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length; };
  V.score = (q, e) => {
    const s = fold(q).trim(); if (!s) return 1; let best = 0;
    for (const h of [e.l, e.alt, e.k, [e.l, e.alt, e.k].join(' ')].filter(Boolean).map(fold)) { // last: all fields, so multi-word queries can span label + keywords
      if (h === s) best = Math.max(best, 100); else if (h.startsWith(s)) best = Math.max(best, 80);
      else if (h.split(/[\s/·|&,()–-]+/).some((w) => w && w.startsWith(s))) best = Math.max(best, 60);
      else if (h.includes(s)) best = Math.max(best, 40);
      else if (s.length >= 3 && s.split(/\s+/).every((w) => h.includes(w))) best = Math.max(best, 35);
      else if (s.length >= 4 && subseq(s.replace(/\s+/g, ''), h.replace(/\s+/g, ''))) best = Math.max(best, 15);
    }
    return best;
  };
  V.search = (q, entries, max = 40) => { if (!fold(q).trim()) return entries.slice(0, max); return entries.map((e, i) => ({ e, i, s: V.score(q, e) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, max).map((x) => x.e); };

  /* ══ smoothing helpers ══ */
  V.debounce = (fn, ms = 40) => { let t = null; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V155;
