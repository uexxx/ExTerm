/* ExTerm v15 phase 3 core: pure logic for the Grok tab (tool registry, local quant fallback, regime, auto-workflows,
   journal autopsies), the 3-agent Copilot desk, the behavioral leak detector and World Monitor intel.
   No DOM and no network here: everything is unit-tested in Node (test/v15p3.test.js). */
const P3 = (() => {
  const N = typeof NT !== 'undefined' ? NT : require('./core.js');
  const P = {}, fin = Number.isFinite;
  const last = (a) => a[a.length - 1];
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const clampN = (v, lo, hi, d) => { const x = +v; return fin(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); // 'constructor' / '__proto__' are not timeframes or strategies
  const STR = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, n);

  /* ── World Monitor intel (trust boundary: launcher JSON → plain, capped values) ── */
  const SEV = ['CRITICAL', 'HIGH', 'MACRO', 'INFO'];
  P.SEV = SEV;
  P.cleanIntel = (r) => {
    const items = Array.isArray(r && r.items) ? r.items : [];
    return items.slice(0, 200).map((x) => (x && typeof x === 'object' ? {
      id: STR(x.id, 32), title: STR(x.title, 300), source: STR(x.source, 60), sev: SEV.includes(x.sev) ? x.sev : 'INFO', cat: STR(x.cat, 40), loc: STR(x.loc, 60),
      link: /^https?:\/\/[^\s"'<>]+$/.test(String(x.link || '')) ? String(x.link).slice(0, 600) : '', ts: fin(+x.ts) && +x.ts > 0 && +x.ts <= Date.now() / 1000 + 300 ? +x.ts : 0, // a future-dated headline is never 'fresh'
    } : null)).filter((x) => x && x.title.length >= 4);
  };
  /* the shield's read on the tape: CRITICAL in the last hour → defend; HIGH / MACRO cluster → caution */
  P.shield = (items, nowSec) => {
    const now = nowSec || Date.now() / 1000, recent = (s, sec) => items.filter((i) => i.sev === s && i.ts > 0 && now - i.ts <= sec);
    const crit = recent('CRITICAL', 3600), high = recent('HIGH', 7200), macro = recent('MACRO', 14400);
    const level = crit.length ? 'CRITICAL' : high.length >= 3 || macro.length >= 4 ? 'ELEVATED' : 'CALM';
    return { level, crit, high, macro, advice: level === 'CRITICAL' ? 'Pause new entries and tighten stops until the spike passes.' : level === 'ELEVATED' ? 'Trade smaller and keep stops on every position.' : 'No macro shock on the wire.' };
  };

  /* ── regime: trend / range / high-volatility from ADX, EMA slope and ATR% (last bar only uses data up to that bar) ── */
  P.regime = (c) => {
    const n = c.length; if (n < 60) return { regime: 'unknown', note: 'needs 60+ bars', adx: null, atrPct: null, slope: null, picks: [] };
    const cl = c.map((k) => k.c), I = N.ind, adx = I.adx ? last(I.adx(c, 14).adx) : NaN, atr = last(I.atr(c, 14)), e50 = I.ema(cl, 50);
    const slope = (e50[n - 1] / e50[n - 11] - 1) * 100, atrPct = (atr / cl[n - 1]) * 100;
    const atrs = I.atr(c, 14).slice(-200).filter(fin), base = med(atrs) / cl[n - 1] * 100;
    // Kaufman efficiency ratio over 100 bars: net move / path length. Chop (a sideways sine) has strong ADX legs but a low ER.
    const k0 = Math.max(0, n - 101); let path = 0; for (let i = k0 + 1; i < n; i++) path += Math.abs(cl[i] - cl[i - 1]);
    const er = path > 0 ? Math.abs(cl[n - 1] - cl[k0]) / path : 0;
    let regime = 'range';
    if (base > 0 && atrPct > base * 1.8) regime = 'high-vol';
    else if (er >= 0.2 && fin(adx) && adx >= 22 && slope > 0) regime = 'trend-up';
    else if (er >= 0.2 && fin(adx) && adx >= 22 && slope < 0) regime = 'trend-down';
    const picks = { 'trend-up': ['q4_cr_trendpb', 'q4_cr_donchadx', 'q4_qs_dualma', 'q4_eq_macdadx'], 'trend-down': ['q4_cr_perpshort', 'q4_cr_fadeshort', 'q4_qs_stochshort'], range: ['q4_qs_bbrange', 'q4_eq_bbrev', 'q4_cr_rsi2', 'q4_qs_rsi2'], 'high-vol': ['q4_cr_bbvol', 'q4_qs_volbrk', 'q4_dx_snap'] }[regime];
    return { regime, adx: fin(adx) ? adx : null, atrPct, slope, er, picks: picks.filter((id) => N.strategies[id]) };
  };

  /* ── behavioral leak & mistake detector: the last `lim` closed journal trades (Journal.closed shape) ── */
  P.leaks = (closed, lim = 10) => {
    const T = closed.slice().sort((a, b) => a.ts - b.ts).slice(-lim), out = [], add = (id, sev, title, detail, n) => out.push({ id, sev, title, detail, n });
    if (T.length < 3) return { n: T.length, leaks: [], score: 100, note: 'Need at least 3 closed trades in the journal.' };
    const wins = T.filter((t) => t.win), losses = T.filter((t) => !t.win);
    let rev = 0; for (let i = 1; i < T.length; i++) { const p = T[i - 1], o = T[i].openTs || T[i].ts; if (!p.win && o - p.ts >= 0 && o - p.ts < 15 * 60000) rev++; }
    if (rev) add('revenge', rev >= 2 ? 'high' : 'med', 'Revenge trading', `${rev} trade${rev > 1 ? 's' : ''} opened within 15 min of a loss.`, rev);
    const naked = T.filter((t) => !t.stop).length;
    if (naked >= Math.max(2, T.length * 0.3)) add('nostop', naked >= T.length * 0.6 ? 'high' : 'med', 'Trading without a stop', `${naked} of ${T.length} trades had no stop-loss or trailing stop.`, naked);
    const sizes = T.map((t) => +t.usd || 0).filter((x) => x > 0), m = med(sizes), big = T.filter((t) => m > 0 && t.usd > 2 * m);
    if (big.length) add('oversize', big.some((t) => !t.win) ? 'high' : 'low', 'Position size spikes', `${big.length} trade${big.length > 1 ? 's were' : ' was'} more than 2× your median size (${Math.round(m)} USD).`, big.length);
    const aw = avg(wins.map((t) => t.pnl)), al = Math.abs(avg(losses.map((t) => t.pnl)));
    if (wins.length && losses.length && al > 1.5 * aw) add('lossaversion', 'high', 'Losses bigger than wins', `Average loss ${al.toFixed(0)} vs average win ${aw.toFixed(0)}: you let losers run.`, losses.length);
    const hw = avg(wins.map((t) => +t.held || 0).filter((x) => x > 0)), hl = avg(losses.map((t) => +t.held || 0).filter((x) => x > 0));
    if (hw > 0 && hl > 0 && hw * 2 < hl) add('cutwinners', 'med', 'Cutting winners early', 'Winners are held less than half as long as losers.', wins.length);
    const days = {}; for (const t of T) { const d = new Date(t.openTs || t.ts).toDateString(); days[d] = (days[d] || 0) + 1; }
    const busy = Object.values(days).filter((x) => x > 5).length;
    if (busy) add('overtrade', 'med', 'Overtrading', `More than 5 trades on ${busy} day${busy > 1 ? 's' : ''}.`, busy);
    const moody = T.filter((t) => /fomo|revenge|tired/i.test(String(t.mood || '')) || (t.tags || []).some((g) => /fomo/i.test(g)));
    if (moody.length) add('tilt', moody.filter((t) => !t.win).length > moody.length / 2 ? 'high' : 'low', 'Emotional entries', `${moody.length} trade${moody.length > 1 ? 's' : ''} tagged FOMO / revenge / tired.`, moody.length);
    let streak = 0, worst = 0; for (const t of T) { streak = t.win ? 0 : streak + 1; worst = Math.max(worst, streak); }
    if (worst >= 4) add('streak', 'med', 'Losing streak', `${worst} losses in a row: consider a cool-off rule.`, worst);
    const pen = { high: 25, med: 12, low: 5 }, score = Math.max(0, 100 - out.reduce((s, l) => s + pen[l.sev], 0));
    return { n: T.length, leaks: out, score, winRate: (wins.length / T.length) * 100 };
  };

  /* ── post-trade autopsy: why each closed trade won or lost, plus the lesson ── */
  P.autopsy = (closed, lim = 10) => closed.slice().sort((a, b) => b.ts - a.ts).slice(0, lim).map((t) => {
    const why = [], r = String((t.exit && t.exit.reason) || '').toLowerCase();
    if (/take-profit|target/.test(r)) why.push('hit the planned target');
    else if (/stop|trail/.test(r)) why.push(t.win ? 'trailing stop locked the gain' : 'stopped out at the planned risk');
    else if (/shield|macro/.test(r)) why.push('closed by the macro shield');
    else why.push(r ? 'exit: ' + r.slice(0, 60) : 'manual exit');
    if (!t.stop) why.push('no stop was set');
    if (/fomo|revenge/i.test(String(t.mood || ''))) why.push('entered on ' + t.mood);
    const held = +t.held || 0;
    if (held > 0 && held < 60000) why.push('held under a minute (scalp)');
    const lesson = t.win ? (t.stop ? 'Repeatable: planned entry with defined risk.' : 'Won without a stop: luck, not process.') : !t.stop ? 'Always set the stop before the entry.' : /stop/.test(r) ? 'Loss was within plan: no change needed unless the setup itself is weak.' : 'Decide the exit before entering.';
    return { sym: t.sym, win: !!t.win, pnl: +t.pnl || 0, pct: +t.pct || 0, held, src: t.src || '', why, lesson, grade: t.win && t.stop ? 'A' : t.win ? 'C' : t.stop ? 'B' : 'F' };
  });

  /* ── 3-agent quant desk: technical / order-flow, intelligence, chief risk officer ── */
  P.desk = (ctx) => {
    const c = ctx.candles || [], n = c.length, I = N.ind;
    if (n < 60) return { ok: false, note: 'needs at least 60 candles' };
    const cl = c.map((k) => k.c), px = ctx.price > 0 ? ctx.price : cl[n - 1];
    const e20 = last(I.ema(cl, 20)), e50 = last(I.ema(cl, 50)), rsi = last(I.rsi(cl, 14)), atr = last(I.atr(c, 14)), mh = I.macd(cl).hist;
    let upV = 0, dnV = 0; for (const k of c.slice(-20)) { if (k.c >= k.o) upV += k.v || 0; else dnV += k.v || 0; }
    const delta = upV + dnV > 0 ? (upV - dnV) / (upV + dnV) : 0;
    const sw = I.swings ? I.swings(c, 5) : null, hs = [], ls = [];
    if (sw) for (let i = 0; i < n; i++) { if (fin(sw.shVal[i]) && sw.shVal[i] > px) hs.push(sw.shVal[i]); if (fin(sw.slVal[i]) && sw.slVal[i] < px) ls.push(sw.slVal[i]); }
    const res = [...new Set(hs)].sort((a, b) => a - b).slice(0, 3), sup = [...new Set(ls)].sort((a, b) => b - a).slice(0, 3);
    let ts = 0; const tp = [];
    if (px > e50) { ts++; tp.push('price above EMA 50'); } else { ts--; tp.push('price below EMA 50'); }
    if (e20 > e50) ts += 0.5; else ts -= 0.5;
    if (rsi > 70) { ts -= 0.5; tp.push(`RSI ${rsi.toFixed(0)} overbought`); } else if (rsi < 30) { ts += 0.5; tp.push(`RSI ${rsi.toFixed(0)} oversold`); } else tp.push(`RSI ${rsi.toFixed(0)}`);
    if (mh[n - 1] > 0 && mh[n - 2] <= 0) { ts += 0.5; tp.push('MACD turned up'); } else if (mh[n - 1] < 0 && mh[n - 2] >= 0) { ts -= 0.5; tp.push('MACD turned down'); }
    tp.push(`order-flow delta (20 bars) ${(delta * 100).toFixed(0)}%`); ts += delta;
    const tech = { id: 'tech', name: 'Technical / Order-Flow Analyst', score: ts, stance: ts >= 1 ? 'bullish' : ts <= -1 ? 'bearish' : 'neutral', points: tp };
    // intelligence: on-chain / insider / macro context the caller collected (all optional)
    let is = 0; const ip = [], x = ctx.intel || {};
    if (fin(x.whaleNet) && Math.abs(x.whaleNet) > 0) { is += x.whaleNet > 0 ? 0.5 : -0.5; ip.push(`whale flow ${x.whaleNet > 0 ? 'accumulating' : 'distributing'}`); }
    if (x.pool) { const b = +x.pool.buys24 || 0, s = +x.pool.sells24 || 0; if (b + s > 0) { const r = b / (b + s); is += r > 0.55 ? 0.5 : r < 0.45 ? -0.5 : 0; ip.push(`DEX buys ${(r * 100).toFixed(0)}% of 24h swaps`); } if (+x.pool.liq > 0 && +x.pool.liq < 50000) { is -= 1; ip.push('thin pool liquidity'); } if ((x.pool.flags || []).length) { is -= 0.5; ip.push('risk flags: ' + x.pool.flags.slice(0, 2).join(', ')); } }
    if (+x.insiderBuys > 0) { is += 0.5; ip.push(`${x.insiderBuys} insider cluster buy${x.insiderBuys > 1 ? 's' : ''}`); }
    if (x.shield === 'CRITICAL') { is -= 2; ip.push('World Monitor CRITICAL headline in the last hour'); } else if (x.shield === 'ELEVATED') { is -= 0.5; ip.push('elevated macro newsflow'); } else ip.push('macro wire calm');
    const intel = { id: 'intel', name: 'On-Chain / Insider / Macro Intelligence', score: is, stance: is >= 0.5 ? 'supportive' : is <= -1 ? 'hostile' : 'neutral', points: ip };
    // chief risk officer: sizes 1% risk off an ATR / swing stop, vetoes on shocks and behavioral leaks
    const side = ts + is >= 0 ? 'buy' : 'sell', stop = side === 'buy' ? Math.max(sup[0] ? sup[0] - 0.25 * atr : 0, px - 2 * atr) : Math.min(res[0] ? res[0] + 0.25 * atr : Infinity, px + 2 * atr);
    const risk = Math.abs(px - stop), tgt = side === 'buy' ? px + 2 * risk : px - 2 * risk, eq = ctx.equity > 0 ? ctx.equity : 10000;
    const lk = ctx.leaks || { leaks: [] }, severe = lk.leaks.filter((l) => l.sev === 'high').length;
    let verdict = 'GO', rp = 1; const rpts = [];
    if (x.shield === 'CRITICAL') { verdict = 'NO-TRADE'; rpts.push('veto: CRITICAL macro headline'); }
    else if (Math.abs(ts + is) < 0.75) { verdict = 'NO-TRADE'; rpts.push('veto: agents disagree / no edge'); }
    else if (severe || x.shield === 'ELEVATED') { verdict = 'REDUCE'; rp = 0.5; rpts.push(severe ? `half size: ${severe} serious behavioral leak${severe > 1 ? 's' : ''}` : 'half size: elevated newsflow'); }
    if (side === 'sell' && !ctx.canShort) { verdict = verdict === 'GO' || verdict === 'REDUCE' ? 'NO-TRADE' : verdict; rpts.push('bearish read: stand aside (paper account is long-only here)'); }
    const usd = risk > 0 ? Math.min(eq, ((eq * rp) / 100 / risk) * px) : 0;
    rpts.push(`risk ${rp}% of equity, stop ${(risk / px * 100).toFixed(2)}% away, 2R target`);
    const cro = { id: 'cro', name: 'Chief Risk Officer', score: verdict === 'GO' ? 1 : verdict === 'REDUCE' ? 0 : -1, stance: verdict, points: rpts };
    return { ok: true, agents: [tech, intel, cro], plan: { side, entry: px, sl: stop, tp: tgt, rr: 2, usd: verdict === 'NO-TRADE' ? 0 : usd, verdict }, levels: { sup, res }, atr };
  };

  /* ── auto-workflow: a visual pipeline (data → regime → strategy → validation → risk → shield → bot → alerts) ── */
  P.workflow = (o) => {
    const reg = (o.regime && o.regime.regime) || 'unknown', strat = own(N.strategies, o.strat) ? o.strat : ((o.regime && o.regime.picks) || [])[0] || 'q4_qs_dualma';
    const S = N.strategies[strat], tf = o.tf || '1h', bgOk = ['1m', '5m', '15m', '1h', '4h', '1d'].includes(tf) && !!(S && S.spec);
    const nodes = [
      { id: 'data', kind: 'data', label: `${o.sym || '?'} · ${tf} candles`, detail: tf.endsWith('s') ? 'sub-minute bars from live ticks' : 'exchange history' },
      { id: 'regime', kind: 'regime', label: 'Regime: ' + reg, detail: o.regime && o.regime.adx != null ? `ADX ${o.regime.adx.toFixed(0)} · ATR ${o.regime.atrPct.toFixed(2)}%` : '' },
      { id: 'strategy', kind: 'strategy', label: S ? S.name.replace(/^★ /, '') : strat, detail: S ? S.cat : '', strat },
      { id: 'validate', kind: 'validate', label: '17-test Validation Lab', detail: 'must grade C or better' },
      { id: 'risk', kind: 'risk', label: `Risk: ${clampN(o.riskPct, 0.1, 5, 1)}% / trade`, detail: `daily loss stop ${clampN(o.dailyLoss, 1, 50, 5)}%` },
      { id: 'shield', kind: 'shield', label: 'Macro Shield', detail: o.autoPause ? 'auto-pause on CRITICAL' : 'warn only' },
      { id: 'bot', kind: 'bot', label: bgOk ? '24/7 launcher bot' : 'in-tab paper bot', detail: bgOk ? 'keeps running with the tab closed' : 'sub-minute / code strategies run in the tab' },
      { id: 'alert', kind: 'alert', label: 'Mobile alerts', detail: 'Discord / Telegram on every trade' },
    ];
    return { id: 'wf_' + (o.sym || 'x').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) + '_' + tf + '_' + strat.replace(/[^a-z0-9_]/gi, ''), sym: o.sym, tf, strat, bg: bgOk, nodes, edges: nodes.slice(1).map((nd, i) => [nodes[i].id, nd.id]), created: o.now || 0 };
  };

  /* ── Grok tool registry: OpenAI-style function schemas + strict argument checks (the model's output is untrusted) ── */
  const TF_OK = (t) => own(N.TF, t);
  P.TOOLS = {
    run_backtest: { safe: true, d: 'Backtest one strategy on a market and timeframe (fees + slippage included).', p: { strategy: 'string', symbol: 'string', timeframe: 'string' } },
    run_validation: { safe: true, d: 'Run the 17-test Validation Lab on a strategy / market / timeframe and return the grade.', p: { strategy: 'string', symbol: 'string', timeframe: 'string' } },
    tune_parameters: { safe: true, d: 'Walk-forward optimize a strategy (train 70%, prove on unseen 30%).', p: { strategy: 'string', symbol: 'string', timeframe: 'string' } },
    detect_regime: { safe: true, d: 'Classify the market regime (trend-up, trend-down, range, high-vol) and suggest strategies.', p: { symbol: 'string', timeframe: 'string' } },
    generate_workflow: { safe: true, d: 'Build an auto-workflow pipeline for a market.', p: { symbol: 'string', timeframe: 'string', strategy: 'string?' } },
    journal_autopsy: { safe: true, d: 'Post-trade autopsy of the last journal trades plus behavioral leaks.', p: {} },
    macro_intel: { safe: true, d: 'Read the World Monitor global intel feed and the macro shield level.', p: {} },
    list_bots: { safe: true, d: 'List the 24/7 launcher background bots.', p: {} },
    start_bot: { safe: false, d: 'Start a 24/7 launcher background paper bot (needs user confirmation).', p: { strategy: 'string', symbol: 'string', timeframe: 'string', capital: 'number?' } },
    pause_bots: { safe: false, d: 'Pause (or resume) all launcher background bots (needs user confirmation).', p: { resume: 'boolean?' } },
    switch_regime: { safe: false, d: 'Swap a background bot to the strategy that fits the current regime (needs user confirmation).', p: { symbol: 'string', timeframe: 'string' } },
  };
  P.schemas = () => Object.entries(P.TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: { type: 'object', properties: Object.fromEntries(Object.entries(t.p).map(([k, ty]) => [k, { type: ty.replace('?', '') }])), required: Object.entries(t.p).filter(([, ty]) => !ty.endsWith('?')).map(([k]) => k) } } }));
  /* returns { ok, name, args, safe } or { ok:false, error } — symbols / strategies are resolved by the caller */
  P.checkTool = (name, raw) => {
    const T = Object.prototype.hasOwnProperty.call(P.TOOLS, name) ? P.TOOLS[name] : null; if (!T) return { ok: false, error: 'unknown tool ' + STR(name, 40) };
    let a = raw; if (typeof a === 'string') { try { a = a.length > 4000 ? null : JSON.parse(a || '{}'); } catch (e) { a = null; } }
    if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, error: 'arguments must be a JSON object' };
    const out = {};
    for (const [k, ty] of Object.entries(T.p)) {
      const opt = ty.endsWith('?'), t = ty.replace('?', ''), v = a[k];
      if (v == null || v === '') { if (!opt) return { ok: false, error: 'missing ' + k }; continue; }
      if (t === 'string') { const s = STR(v, 100); if (k === 'timeframe' && !TF_OK(s)) return { ok: false, error: 'bad timeframe ' + s }; if (k === 'strategy' && !(own(N.strategies, s) && !N.strategies[s].liveOnly)) return { ok: false, error: 'unknown strategy ' + s }; if (k === 'symbol' && !/^[A-Za-z0-9.^=\-:_]{1,100}$/.test(s)) return { ok: false, error: 'bad symbol' }; out[k] = s; }
      else if (t === 'number') { const x = +v; if (!fin(x) || x < 10 || x > 1e9) return { ok: false, error: k + ' out of range' }; out[k] = x; }
      else if (t === 'boolean') out[k] = v === true || v === 'true';
    }
    return { ok: true, name, args: out, safe: T.safe };
  };

  /* ── zero-key local quant: a plain-English request → one tool call (same registry as the Grok model) ── */
  P.local = (q, d) => {
    const lq = ' ' + String(q || '').toLowerCase() + ' ', tf = (/\b(1s|5s|15s|30s|1m|3m|5m|15m|30m|1h|2h|4h|1d)\b/.exec(lq) || [])[1] || d.tf || '1h';
    const sym = d.sym, strat = Object.keys(N.strategies).find((k) => lq.includes(' ' + k.toLowerCase() + ' ')) || d.strat || null;
    const base = { symbol: sym, timeframe: tf };
    if (/\b(autopsy|post-?mortem|journal|leaks?|mistakes?|why did i (lose|win))\b/.test(lq)) return { name: 'journal_autopsy', args: {} };
    if (/\b(macro|news|intel|world ?monitor|headlines?|shield)\b/.test(lq)) return { name: 'macro_intel', args: {} };
    if (/\b(workflow|pipeline|automate|auto-?workflow)\b/.test(lq)) return { name: 'generate_workflow', args: Object.assign({}, base, strat ? { strategy: strat } : {}) };
    if (/\b(switch|swap|rotate)\b.*\b(regime|strateg)/.test(lq)) return { name: 'switch_regime', args: base };
    if (/\bregime|trend or range|market state\b/.test(lq)) return { name: 'detect_regime', args: base };
    if (/\b(pause|stop|halt)\b.*\bbots?\b/.test(lq)) return { name: 'pause_bots', args: { resume: false } };
    if (/\b(resume|unpause|restart)\b.*\bbots?\b/.test(lq)) return { name: 'pause_bots', args: { resume: true } };
    if (/\b(list|show|status)\b.*\bbots?\b/.test(lq)) return { name: 'list_bots', args: {} };
    if (/\b(start|launch|run|deploy)\b.*\bbot\b/.test(lq)) return strat ? { name: 'start_bot', args: Object.assign({ strategy: strat }, base) } : { name: 'detect_regime', args: base };
    if (/\b(tune|optimi[sz]e|parameters?)\b/.test(lq)) return { name: 'tune_parameters', args: Object.assign({ strategy: strat || 'q4_qs_dualma' }, base) };
    if (/\b(validat|17|robust|lab)\w*/.test(lq)) return { name: 'run_validation', args: Object.assign({ strategy: strat || 'q4_qs_dualma' }, base) };
    if (/\bbacktest\b/.test(lq)) return { name: 'run_backtest', args: Object.assign({ strategy: strat || 'q4_qs_dualma' }, base) };
    return { name: 'detect_regime', args: base };
  };

  /* ── Copilot ↔ Grok bridge payload: what crosses between the two desks (no UI merge, just data) ── */
  P.bridge = (o) => ({ v: 1, from: o.from === 'grok' ? 'grok' : 'copilot', sym: STR(o.sym, 100), tf: TF_OK(o.tf) ? o.tf : '1h', side: o.side === 'sell' ? 'sell' : 'buy', entry: +o.entry > 0 ? +o.entry : null, sl: +o.sl > 0 ? +o.sl : null, tp: +o.tp > 0 ? +o.tp : null, strat: own(N.strategies, o.strat) ? o.strat : null, note: STR(o.note, 200), ts: +o.ts || 0 });

  return P;
})();
if (typeof module === 'object' && module.exports) module.exports = P3;
