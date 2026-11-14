/* ExTerm strategy specs — no-code strategies described as JSON, interpreted (never eval'd).
   Shared by the page and the backtest worker. A spec is validated against a strict schema before use, so a
   strategy file from the community library can't run code, call the network or touch the page. */
(function (NT) {
  'use strict';
  const I = NT.ind, fin = Number.isFinite;
  const SP = {};
  // operand catalog: k -> { label, needs n?, range, pane ('price' | 'osc' | 'vol'), series(c, n) }
  const cl = (c) => c.map((x) => x.c);
  // max/min of the n bars BEFORE bar i (monotonic deque: O(n) even on 200k candles; never includes bar i, so no look-ahead)
  const prior = (a, n, isMax) => {
    const o = new Array(a.length).fill(NaN), dq = []; let head = 0;
    for (let i = 0; i < a.length; i++) {
      while (head < dq.length && dq[head] < i - n) head++;
      if (i >= n) o[i] = a[dq[head]];
      while (dq.length > head && (isMax ? a[dq[dq.length - 1]] <= a[i] : a[dq[dq.length - 1]] >= a[i])) dq.pop();
      dq.push(i);
    }
    return o;
  };
  const OPS = {
    price: { l: 'Close price', pane: 'price', f: (c) => cl(c) },
    open: { l: 'Open', pane: 'price', f: (c) => c.map((x) => x.o) },
    high: { l: 'High', pane: 'price', f: (c) => c.map((x) => x.h) },
    low: { l: 'Low', pane: 'price', f: (c) => c.map((x) => x.l) },
    volume: { l: 'Volume', pane: 'vol', f: (c) => c.map((x) => x.v) },
    volSma: { l: 'Volume average', n: [20, 2, 400], pane: 'vol', f: (c, n) => I.sma(c.map((x) => x.v), n) },
    ema: { l: 'EMA', n: [20, 2, 400], pane: 'price', f: (c, n) => I.ema(cl(c), n) },
    sma: { l: 'SMA', n: [50, 2, 400], pane: 'price', f: (c, n) => I.sma(cl(c), n) },
    rsi: { l: 'RSI', n: [14, 2, 100], pane: 'osc', f: (c, n) => I.rsi(cl(c), n) },
    macd: { l: 'MACD line', pane: 'osc', f: (c) => I.macd(cl(c)).macd },
    macdSignal: { l: 'MACD signal', pane: 'osc', f: (c) => I.macd(cl(c)).signal },
    macdHist: { l: 'MACD histogram', pane: 'osc', f: (c) => I.macd(cl(c)).hist },
    bbUpper: { l: 'Bollinger upper', n: [20, 5, 200], pane: 'price', f: (c, n) => I.bb(cl(c), n, 2).up },
    bbMid: { l: 'Bollinger middle', n: [20, 5, 200], pane: 'price', f: (c, n) => I.bb(cl(c), n, 2).mid },
    bbLower: { l: 'Bollinger lower', n: [20, 5, 200], pane: 'price', f: (c, n) => I.bb(cl(c), n, 2).lo },
    atr: { l: 'ATR', n: [14, 2, 100], pane: 'osc', f: (c, n) => I.atr(c, n) },
    adx: { l: 'ADX', n: [14, 2, 100], pane: 'osc', f: (c, n) => (I.adx ? I.adx(c, n).adx : c.map(() => NaN)) },
    stochK: { l: 'Stochastic %K', n: [14, 2, 100], pane: 'osc', f: (c, n) => (I.stoch ? I.stoch(c, n).k : c.map(() => NaN)) },
    vwap: { l: 'VWAP', pane: 'price', f: (c) => I.vwap(c) },
    highest: { l: 'Highest high (N bars ago, excl. this bar)', n: [20, 2, 400], pane: 'price', f: (c, n) => prior(c.map((x) => x.h), n, true) },
    lowest: { l: 'Lowest low (N bars ago, excl. this bar)', n: [20, 2, 400], pane: 'price', f: (c, n) => prior(c.map((x) => x.l), n, false) },
    change: { l: '% change over N bars', n: [10, 1, 400], pane: 'osc', f: (c, n) => c.map((x, i) => (i >= n && c[i - n].c ? (x.c / c[i - n].c - 1) * 100 : NaN)) },
    const: { l: 'Number', pane: 'any', v: true },
  };
  // higher-timeframe operands (v13): o.tf = how many current bars make one higher-timeframe bar (×1 = this chart).
  // Values come only from the LAST COMPLETED higher-timeframe bar, so there is never any look-ahead.
  const TFX = [1, 2, 3, 4, 6, 8, 12, 24];
  SP.TFX = TFX;
  const barSec = (c) => { let m = Infinity; for (let i = 1; i < Math.min(c.length, 60); i++) { const d = c[i].t - c[i - 1].t; if (d > 0 && d < m) m = d; } return isFinite(m) ? m : 3600; };
  const resample = (c, k) => {
    const sec = barSec(c) * k, groups = [], idx = new Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const g = Math.floor(c[i].t / sec), last = groups[groups.length - 1], x = c[i];
      if (!last || last.g !== g) groups.push({ g, t: g * sec, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v || 0, end: i });
      else { last.h = Math.max(last.h, x.h); last.l = Math.min(last.l, x.l); last.c = x.c; last.v += x.v || 0; last.end = i; }
      idx[i] = groups.length - 1;
    }
    return { htf: groups, idx };
  };
  const series = (c, o) => {
    const d = OPS[o.k];
    if (!(o.tf > 1)) return d.f(c, o.n);
    const { htf, idx } = resample(c, o.tf), hs = d.f(htf, o.n), out = new Array(c.length).fill(NaN);
    for (let i = 0; i < c.length; i++) {
      const g = idx[i], done = htf[g].end === i ? g : g - 1; // the HTF bar is complete only on its last LTF bar
      out[i] = done >= 0 ? hs[done] : NaN;
    }
    return out;
  };
  SP._series = series; SP._resample = resample;
  const CMP = { '>': 'is above', '<': 'is below', '>=': 'is at or above', '<=': 'is at or below', crossAbove: 'crosses above', crossBelow: 'crosses below' };
  SP.OPS = OPS; SP.CMP = CMP;
  const MAX_CONDS = 8;

  const txt = (s, n) => (s == null ? '' : String(s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩<>"'`&\\]/g, '').trim().slice(0, n));
  const slug = (s) => txt(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'strategy';

  /* ---- strict validation: returns { ok, spec (normalised copy), errors[] } ---- */
  SP.validate = (raw) => {
    const errors = [], err = (m) => { if (errors.length < 20) errors.push(m); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Not a strategy object'] };
    if (JSON.stringify(raw).length > 20000) return { ok: false, errors: ['Strategy file is too large'] };
    const allowedTop = new Set(['v', 'name', 'desc', 'author', 'entry', 'exit', 'risk', 'tags', 'dir']);
    for (const k of Object.keys(raw)) if (!allowedTop.has(k)) err(`Unknown field "${txt(k, 30)}"`);
    if (raw.v !== 1) err('Field "v" must be 1');
    if (raw.dir != null && raw.dir !== 'long' && raw.dir !== 'short') err('Field "dir" must be "long" or "short"');
    const name = txt(raw.name, 48); if (name.length < 2) err('Give the strategy a name (2–48 characters)');
    const operand = (o, where) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) { err(where + ': missing value'); return null; }
      for (const k of Object.keys(o)) if (!['k', 'n', 'v', 'tf'].includes(k)) err(`${where}: unknown field "${txt(k, 20)}"`);
      let tf = 1; if (o.tf != null && o.tf !== 1) { tf = +o.tf; if (!TFX.includes(tf)) { err(`${where}: higher timeframe must be one of ×${TFX.join(', ×')}`); tf = 1; } }
      const d = OPS[o.k]; if (!d || !Object.prototype.hasOwnProperty.call(OPS, o.k)) { err(`${where}: unknown indicator "${txt(o.k, 20)}"`); return null; }
      if (d.v) { const v = +o.v; if (!fin(v) || Math.abs(v) > 1e12) { err(where + ': number is not valid'); return null; } return { k: 'const', v }; }
      if (d.n) { const n = o.n == null ? d.n[0] : +o.n; if (!Number.isInteger(n) || n < d.n[1] || n > d.n[2]) { err(`${where}: ${d.l} period must be a whole number from ${d.n[1]} to ${d.n[2]}`); return null; } return tf > 1 ? { k: o.k, n, tf } : { k: o.k, n }; }
      return tf > 1 ? { k: o.k, tf } : { k: o.k };
    };
    const group = (g, where, need) => {
      if (!g || typeof g !== 'object') { if (need) err(where + ': add at least one condition'); return null; }
      const mode = Array.isArray(g.all) ? 'all' : Array.isArray(g.any) ? 'any' : null;
      if (!mode) { err(where + ': use "all" or "any"'); return null; }
      const list = g[mode];
      if (!list.length && need) err(where + ': add at least one condition');
      if (list.length > MAX_CONDS) err(`${where}: at most ${MAX_CONDS} conditions`);
      const out = [];
      list.slice(0, MAX_CONDS).forEach((c, i) => {
        const w = `${where} condition ${i + 1}`;
        if (!c || typeof c !== 'object') return err(w + ': invalid');
        if (!Object.prototype.hasOwnProperty.call(CMP, c.op)) return err(`${w}: unknown comparison "${txt(c.op, 12)}"`);
        const a = operand(c.a, w + ' (left)'), b = operand(c.b, w + ' (right)');
        if (a && a.k === 'const') return err(w + ': the left side must be an indicator, not a number');
        if (a && b) out.push({ a, op: c.op, b });
      });
      return { [mode]: out };
    };
    const entry = group(raw.entry, 'Entry', true), exit = group(raw.exit, 'Exit', false);
    const r = raw.risk || {}, risk = {};
    for (const [k, lo, hi] of [['sl', 0.1, 50], ['tp', 0.1, 500], ['trail', 0.1, 50]]) {
      if (r[k] == null || r[k] === '') continue; const v = +r[k];
      if (!fin(v) || v < lo || v > hi) err(`Risk: ${k === 'sl' ? 'stop loss' : k === 'tp' ? 'take profit' : 'trailing stop'} must be between ${lo}% and ${hi}%`); else risk[k] = +v.toFixed(2);
    }
    if (exit && !(exit.all || exit.any || []).length && !risk.sl && !risk.tp && !risk.trail) err('Add an exit condition or a stop / take-profit, otherwise trades never close');
    const tags = Array.isArray(raw.tags) ? raw.tags.slice(0, 6).map((t) => txt(t, 20)).filter(Boolean) : [];
    const spec = { v: 1, name, desc: txt(raw.desc, 300), author: txt(raw.author, 40), entry, exit: exit || { any: [] }, risk, tags };
    if (raw.dir === 'short') spec.dir = 'short';
    return { ok: !errors.length, spec, errors };
  };

  SP.idOf = (spec) => 'cs_' + slug(spec.name);

  /* ---- compile a validated spec into a backtest-engine strategy ---- */
  const key = (o) => (o.k === 'const' ? 'c' + o.v : o.k + (o.n || '') + (o.tf > 1 ? '@' + o.tf : ''));
  SP.compile = (spec) => {
    const conds = [].concat(spec.entry.all || spec.entry.any || [], spec.exit.all || spec.exit.any || []);
    const evalGroup = (g, i, Sx) => {
      const mode = g.all ? 'all' : 'any', list = g[mode] || []; if (!list.length) return false;
      const one = (c) => {
        const A = Sx[key(c.a)], B = c.b.k === 'const' ? null : Sx[key(c.b)];
        const a0 = A[i], b0 = B ? B[i] : c.b.v; if (!fin(a0) || !fin(b0)) return false;
        if (c.op === '>') return a0 > b0; if (c.op === '<') return a0 < b0; if (c.op === '>=') return a0 >= b0; if (c.op === '<=') return a0 <= b0;
        if (i < 1) return false; const a1 = A[i - 1], b1 = B ? B[i - 1] : c.b.v; if (!fin(a1) || !fin(b1)) return false;
        return c.op === 'crossAbove' ? a1 <= b1 && a0 > b0 : a1 >= b1 && a0 < b0;
      };
      return mode === 'all' ? list.every(one) : list.some(one);
    };
    const risk = {}; if (spec.risk.sl) risk.slPct = spec.risk.sl / 100; if (spec.risk.tp) risk.tpPct = spec.risk.tp / 100; if (spec.risk.trail) risk.trailPct = spec.risk.trail / 100;
    return {
      name: '✎ ' + spec.name + (spec.dir === 'short' ? ' (short)' : ''), cat: spec.author ? 'Community' : 'My strategies', custom: true, spec, short: spec.dir === 'short',
      desc: spec.desc || SP.describe(spec),
      params: [],
      prepare: (c) => { const Sx = {}; for (const cd of conds) for (const o of [cd.a, cd.b]) { if (o.k === 'const') continue; const k = key(o); if (!Sx[k]) Sx[k] = series(c, o); } return Sx; },
      onBar: (i, Sx, c, ctx) => {
        const sh = spec.dir === 'short';
        if (!ctx.pos && evalGroup(spec.entry, i, Sx)) return [Object.assign({ side: 'buy', frac: 1, reason: spec.name + (sh ? ': short entry rules met' : ': entry rules met') }, risk)];
        if (ctx.pos && evalGroup(spec.exit, i, Sx)) return [{ side: 'sell', frac: 1, reason: spec.name + (sh ? ': cover rules met' : ': exit rules met') }];
        return null;
      },
    };
  };
  // entry / exit booleans per bar (used by the launcher parity test and the builder preview)
  SP.signals = (spec, c) => {
    const st = SP.compile(spec), Sx = st.prepare(c), en = [], ex = [];
    for (let i = 0; i < c.length; i++) { en.push(!!st.onBar(i, Sx, c, { pos: null })); ex.push(!!st.onBar(i, Sx, c, { pos: {} })); }
    return { entry: en, exit: ex };
  };
  // backtest options implied by the spec's risk block (merged by callers)
  SP.btOpts = (spec) => ({ short: spec.dir === 'short', slPct: spec.risk.sl ? spec.risk.sl / 100 : undefined, tpPct: spec.risk.tp ? spec.risk.tp / 100 : undefined, trailPct: spec.risk.trail ? spec.risk.trail / 100 : undefined });

  const opText = (o) => (o.k === 'const' ? String(o.v) : OPS[o.k].l.replace(/ \(.*\)$/, '') + (o.n ? ' ' + o.n : '') + (o.tf > 1 ? ` (×${o.tf} timeframe)` : ''));
  SP.describe = (spec) => {
    const g = (x) => { const m = x.all ? 'all' : 'any', l = x[m] || []; return l.length ? l.map((c) => `${opText(c.a)} ${CMP[c.op]} ${opText(c.b)}`).join(m === 'all' ? ' AND ' : ' OR ') : ''; };
    const r = spec.risk, rk = [r.sl ? `stop ${r.sl}%` : '', r.tp ? `target ${r.tp}%` : '', r.trail ? `trailing ${r.trail}%` : ''].filter(Boolean).join(', ');
    const sh = spec.dir === 'short';
    return `${sh ? 'Short' : 'Buy'} when ${g(spec.entry)}.` + (g(spec.exit) ? ` ${sh ? 'Cover' : 'Sell'} when ${g(spec.exit)}.` : '') + (rk ? ` Risk: ${rk}.` : '');
  };

  /* ---- registry (page + worker) ---- */
  const reg = {};
  SP.register = (raw) => {
    const v = SP.validate(raw); if (!v.ok) throw new Error(v.errors[0]);
    const id = SP.idOf(v.spec); NT.strategies[id] = SP.compile(v.spec); reg[id] = v.spec; return id;
  };
  SP.unregister = (id) => { if (reg[id]) { delete reg[id]; delete NT.strategies[id]; } };
  SP.list = () => Object.values(reg);
  SP.get = (id) => reg[id] || null;

  /* ---- Pine Script v5 export ---- */
  SP.toPine = (spec) => {
    const vars = {}, decl = [];
    const pv = (o) => {
      if (o.k === 'const') return String(o.v);
      const k = key(o); if (vars[k]) return vars[k];
      if (o.tf > 1) { // higher timeframe: last completed HTF bar, no repainting
        const inner = pv(Object.assign({}, o, { tf: 1 })), nm = (o.k + (o.n || '') + '_x' + o.tf).replace(/[^A-Za-z0-9_]/g, '');
        decl.push(`${nm} = request.security(syminfo.tickerid, timeframe.from_seconds(timeframe.in_seconds() * ${o.tf}), ${inner}[1], lookahead=barmerge.lookahead_on)`);
        vars[k] = nm; return nm;
      }
      const n = o.n, name = (o.k + (n || '')).replace(/[^A-Za-z0-9_]/g, '');
      const expr = {
        price: 'close', open: 'open', high: 'high', low: 'low', volume: 'volume', volSma: `ta.sma(volume, ${n})`, ema: `ta.ema(close, ${n})`, sma: `ta.sma(close, ${n})`, rsi: `ta.rsi(close, ${n})`,
        macd: '_macd', macdSignal: '_sig', macdHist: '_hist', bbUpper: `ta.sma(close, ${n}) + 2 * ta.stdev(close, ${n})`, bbMid: `ta.sma(close, ${n})`, bbLower: `ta.sma(close, ${n}) - 2 * ta.stdev(close, ${n})`,
        atr: `ta.atr(${n})`, adx: `_adx${n}`, stochK: `ta.sma(ta.stoch(close, high, low, ${n}), 3)`, vwap: 'ta.vwap(hlc3)', highest: `ta.highest(high, ${n})[1]`, lowest: `ta.lowest(low, ${n})[1]`, change: `(close / close[${n}] - 1) * 100`,
      }[o.k];
      if (/^_macd|^_sig|^_hist/.test(expr) && !vars.__macd) { vars.__macd = 1; decl.push('[_macd, _sig, _hist] = ta.macd(close, 12, 26, 9)'); }
      if (o.k === 'adx' && !vars['__adx' + n]) { vars['__adx' + n] = 1; decl.push(`[_dip${n}, _dim${n}, _adx${n}] = ta.dmi(${n}, ${n})`); }
      if (['price', 'open', 'high', 'low', 'volume', 'macd', 'macdSignal', 'macdHist', 'adx'].includes(o.k)) { vars[k] = expr; return expr; }
      vars[k] = name; decl.push(`${name} = ${expr}`); return name;
    };
    const cond = (c) => { const a = pv(c.a), b = pv(c.b); return c.op === 'crossAbove' ? `ta.crossover(${a}, ${b})` : c.op === 'crossBelow' ? `ta.crossunder(${a}, ${b})` : `${a} ${c.op} ${b}`; };
    const grp = (g) => { const m = g.all ? 'all' : 'any', l = g[m] || []; return l.length ? l.map(cond).join(m === 'all' ? ' and ' : ' or ') : 'false'; };
    const e = grp(spec.entry), x = grp(spec.exit), r = spec.risk, title = spec.name.replace(/"/g, ''), sh = spec.dir === 'short';
    const lines = [
      '//@version=5',
      `// Exported from ExTerm's strategy builder. ${SP.describe(spec).replace(/\n/g, ' ')}`,
      `strategy("${title}", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100, commission_type=strategy.commission.percent, commission_value=0.1)`,
      ...decl,
      `entryCond = ${e}`,
      `exitCond = ${x}`,
      'if entryCond and strategy.position_size == 0',
      sh ? '    strategy.entry("Short", strategy.short)' : '    strategy.entry("Long", strategy.long)',
      sh ? 'if exitCond and strategy.position_size < 0' : 'if exitCond and strategy.position_size > 0',
      sh ? '    strategy.close("Short")' : '    strategy.close("Long")',
    ];
    if (r.sl || r.tp || r.trail) {
      const p = [];
      if (r.sl) p.push(`stop=strategy.position_avg_price * (1 ${sh ? '+' : '-'} ${r.sl / 100})`);
      if (r.tp) p.push(`limit=strategy.position_avg_price * (1 ${sh ? '-' : '+'} ${r.tp / 100})`);
      if (r.trail) p.push(`trail_points=close * ${r.trail / 100} / syminfo.mintick, trail_offset=0`);
      lines.push(sh ? 'if strategy.position_size < 0' : 'if strategy.position_size > 0', `    strategy.exit("Risk", "${sh ? 'Short' : 'Long'}", ${p.join(', ')})`);
    }
    return lines.join('\n') + '\n';
  };

  /* ---- starter templates ---- */
  SP.TEMPLATES = [
    { v: 1, name: 'RSI dip in an uptrend', desc: 'Buys oversold dips while price is above the 200 SMA.', entry: { all: [{ a: { k: 'rsi', n: 14 }, op: '<', b: { k: 'const', v: 30 } }, { a: { k: 'price' }, op: '>', b: { k: 'sma', n: 200 } }] }, exit: { any: [{ a: { k: 'rsi', n: 14 }, op: '>', b: { k: 'const', v: 60 } }] }, risk: { sl: 5 } },
    { v: 1, name: 'EMA cross with volume', desc: 'Fast EMA crosses the slow EMA on above-average volume.', entry: { all: [{ a: { k: 'ema', n: 12 }, op: 'crossAbove', b: { k: 'ema', n: 26 } }, { a: { k: 'volume' }, op: '>', b: { k: 'volSma', n: 20 } }] }, exit: { any: [{ a: { k: 'ema', n: 12 }, op: 'crossBelow', b: { k: 'ema', n: 26 } }] }, risk: { trail: 6 } },
    { v: 1, name: '20-bar breakout', desc: 'Buys a close above the prior 20-bar high, exits below the 10-bar low.', entry: { all: [{ a: { k: 'price' }, op: '>', b: { k: 'highest', n: 20 } }] }, exit: { any: [{ a: { k: 'price' }, op: '<', b: { k: 'lowest', n: 10 } }] }, risk: { sl: 8 } },
    { v: 1, name: 'Trend pullback (4× timeframe filter)', desc: 'Higher-timeframe trend up (EMA 50 on a 4× timeframe), then buys an RSI dip on this chart.', entry: { all: [{ a: { k: 'price', tf: 4 }, op: '>', b: { k: 'ema', n: 50, tf: 4 } }, { a: { k: 'rsi', n: 14 }, op: 'crossAbove', b: { k: 'const', v: 40 } }] }, exit: { any: [{ a: { k: 'price', tf: 4 }, op: '<', b: { k: 'ema', n: 50, tf: 4 } }, { a: { k: 'rsi', n: 14 }, op: '>', b: { k: 'const', v: 75 } }] }, risk: { sl: 4, trail: 6 } },
    { v: 1, name: 'Breakdown short', dir: 'short', desc: 'Shorts a close below the prior 20-bar low while price is under the 200 SMA. Covers above the 10-bar high.', entry: { all: [{ a: { k: 'price' }, op: '<', b: { k: 'lowest', n: 20 } }, { a: { k: 'price' }, op: '<', b: { k: 'sma', n: 200 } }] }, exit: { any: [{ a: { k: 'price' }, op: '>', b: { k: 'highest', n: 10 } }] }, risk: { sl: 6 } },
  ];

  NT.Spec = SP;
})(typeof module === 'object' && module.exports ? require('./strategies2.js') : self.NT);
if (typeof module === 'object' && module.exports) module.exports = require('./core.js');
