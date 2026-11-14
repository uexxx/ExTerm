/* ExTerm Copilot+ — power commands layered on top of the base copilot (app_c.js).
   Everything stays local and paper-only. Commands an LLM suggests become buttons the user clicks, never auto-run. */
const Pilot = (() => {
  const P = {};
  const TFRX = /\b(1s|5s|15s|30s|1m|3m|5m|15m|30m|1h|2h|4h|1d)\b/i;
  const tfIn = (q, d) => { const m = TFRX.exec(q); return m ? m[1].toLowerCase() : d; };
  const bases = () => new Set([...Providers.bases, ...STOCK_SET]);
  const symIn = (q) => { const i = NT.parseIntent(q, bases()); const s = symFor(i.sym); return s && (isStock(s) || isOnchain(s) || Providers.ids.has(s)) ? s : null; };
  const lbl = (s) => baseOf(s);
  const stratIn = (q) => {
    const lq = ' ' + q.toLowerCase() + ' ';
    const id = Object.keys(NT.strategies).find((k) => lq.includes(' ' + k.toLowerCase() + ' '));
    if (id) return id;
    const hit = STRAT_PHRASES.find(([p]) => lq.includes(p)); return hit ? hit[1] : null;
  };
  const score = (x) => (x.closed >= 3 ? x.ret / Math.max(5, x.maxDD) : -99);
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));
  const tbl = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  const bt = (c, id, params) => NT.backtest(c, NT.strategies[id], params || NT.defaultParams(id), { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: c.length > 1 ? c[1].t - c[0].t : 3600 }).stats;

  /* ---- rank every strategy on one market, with an out-of-sample check ---- */
  P.rank = async (sym, tf) => {
    const c = await History.get(sym, NT.TF[tf], 3000); if (c.length < 250) return { txt: `Not enough ${tf} history for ${lbl(sym)} (${c.length} candles). Try a higher timeframe.` };
    const cut = Math.floor(c.length * 0.7), test = c.slice(cut - 250), out = [];
    const ids = Object.keys(NT.strategies).filter((k) => !NT.strategies[k].liveOnly);
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      try { const all = bt(c, id), oos = bt(test, id); out.push({ id, all, oos, s: score(all) + 0.5 * score(oos) }); } catch (e) { /* skip a strategy that errors on this data */ }
      if (k % 6 === 5) await yieldUI();
    }
    const bh = (c[c.length - 1].c / c[0].c - 1) * 100, top = out.filter((x) => x.all.closed >= 3).sort((a, b) => b.s - a.s).slice(0, 6);
    if (!top.length) return { txt: `None of the strategies traded enough on ${lbl(sym)} ${tf} to rank them.` };
    const best = top[0];
    return {
      txt: `**Strategy ranking for ${lbl(sym)} ${tf}** (${NT.fmtQty(c.length)} candles, fees + slippage included, ${ids.length} strategies tested). Ranked by return per unit of drawdown, with extra weight on the **last 30%** of the data that acts as an out-of-sample check.\n\n` +
        tbl(['#', 'Strategy', 'Return', 'Max DD', 'Win %', 'Trades', 'Recent 30%'], top.map((x, i) => [i + 1, NT.strategies[x.id].name, NT.fmtPct(x.all.ret, 1), '-' + x.all.maxDD.toFixed(1) + '%', x.all.winRate != null ? x.all.winRate.toFixed(0) : '–', x.all.closed, NT.fmtPct(x.oos.ret, 1)])) +
        `\n\nBuy & hold over the same period: ${NT.fmtPct(bh, 1)}. Past results don't guarantee future ones, so run the 🧪 Validation lab before trusting a winner.`,
      acts: [{ l: `Start ${NT.strategies[best.id].name.replace('★ ', '')} bot`, c: `start a ${best.id} bot on ${lbl(sym)} ${tf}` }, { l: 'Optimize it', c: `optimize ${best.id} on ${lbl(sym)} ${tf}` }, { l: 'Backtest in tab', c: `__setup ${best.id}|${sym}|${tf}` }],
    };
  };

  /* ---- walk-forward optimizer: tune on the first 70%, prove it on the last 30% ---- */
  P.optimize = async (id, sym, tf) => {
    const S = NT.strategies[id]; if (!S || S.liveOnly) return { txt: 'Pick a backtestable strategy, e.g. `optimize pro_kama on BTC 4h`.' };
    const c = await History.get(sym, NT.TF[tf], 3000); if (c.length < 300) return { txt: `Not enough ${tf} history for ${lbl(sym)}.` };
    const grid = S.opt || {}, keys = Object.keys(grid); let combos = [{}];
    for (const k of keys) combos = combos.flatMap((o) => grid[k].map((v) => Object.assign({}, o, { [k]: v })));
    combos = combos.slice(0, 81); if (!keys.length) return { txt: `${S.name} has no tunable grid; its defaults are already the published settings.` };
    const cut = Math.floor(c.length * 0.7), train = c.slice(0, cut), test = c.slice(Math.max(0, cut - 250)), def = NT.defaultParams(id);
    let best = null;
    for (let k = 0; k < combos.length; k++) { const p = Object.assign({}, def, combos[k]); try { const r = bt(train, id, p), sc = score(r); if (!best || sc > best.sc) best = { p, r, sc }; } catch (e) { /* skip */ } if (k % 8 === 7) await yieldUI(); }
    if (!best) return { txt: 'Optimization failed on this data.' };
    const oos = bt(test, id, best.p), dOos = bt(test, id, def), changed = keys.filter((k) => best.p[k] !== def[k]).map((k) => `${k}=${best.p[k]}`);
    const held = oos.ret >= dOos.ret;
    return {
      txt: `**Walk-forward optimization: ${S.name} on ${lbl(sym)} ${tf}**\nTried ${combos.length} parameter sets on the first 70% of ${NT.fmtQty(c.length)} candles, then checked the winner on the unseen last 30%.\n\n` +
        tbl(['', 'Params', 'Train return', 'Unseen return', 'Unseen DD', 'Unseen trades'], [['Optimized', changed.join(', ') || 'defaults', NT.fmtPct(best.r.ret, 1), NT.fmtPct(oos.ret, 1), '-' + oos.maxDD.toFixed(1) + '%', oos.closed], ['Defaults', '–', NT.fmtPct(bt(train, id, def).ret, 1), NT.fmtPct(dOos.ret, 1), '-' + dOos.maxDD.toFixed(1) + '%', dOos.closed]]) +
        `\n\n${held ? '✅ The tuned settings also did better on data they never saw, a good sign they aren’t just curve-fitted.' : '⚠️ The tuned settings did worse on unseen data than the defaults, which is a classic sign of over-fitting. Stick with the defaults.'}`,
      acts: held ? [{ l: 'Use these settings', c: `__setup ${id}|${sym}|${tf}|${JSON.stringify(best.p)}` }, { l: 'Start bot with them', c: `__bot ${id}|${sym}|${tf}|${JSON.stringify(best.p)}` }] : [{ l: 'Backtest defaults', c: `__setup ${id}|${sym}|${tf}` }],
    };
  };

  /* ---- market scanner over the current mode's universe ---- */
  P.scan = async (kind, tf) => {
    let uni = ST.watch.slice();
    if (ST.mode === 'crypto') uni = uni.concat(heat.items.filter((x) => !NT.STABLES.has(x.sym) && !NT.WRAPPED.has(x.sym)).slice(0, 20).map((x) => x.sym + '-USD').filter((s) => Providers.ids.has(s)));
    if (ST.mode === 'stocks') uni = uni.concat(['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD', 'AVGO', 'JPM']);
    if (ST.mode === 'onchain') uni = uni.concat(((OC.lists['trending:' + OC.chain] || {}).syms || []).slice(0, 10));
    uni = [...new Set(uni)].slice(0, ST.mode === 'onchain' ? 14 : 24);
    const res = [];
    for (const s of uni) {
      try {
        const c = await candlesFor(s, tf, 220), cl = c.map((k) => k.c), n = cl.length; if (n < 60) continue;
        const rsi = NT.ind.rsi(cl, 14)[n - 1], s50 = NT.ind.sma(cl, 50)[n - 1], s200 = NT.ind.sma(cl, 200)[n - 1], dc = NT.ind.donchian(c, 20), atr = NT.ind.atr(c, 14)[n - 1];
        const r2 = NT.ind.rsi(cl, 2)[n - 1], brk = cl[n - 1] > dc.hi[n - 1], ch = (cl[n - 1] / cl[Math.max(0, n - 25)] - 1) * 100;
        res.push({ s, rsi, r2, up: cl[n - 1] > s50 && (!isFinite(s200) || cl[n - 1] > s200), brk, ch, vol: (atr / cl[n - 1]) * 100 });
      } catch (e) { /* skip */ }
    }
    const F = {
      oversold: [(x) => x.rsi < 32 || (x.up && x.r2 < 10), (a, b) => a.rsi - b.rsi, 'oversold (RSI 14 < 32, or RSI 2 < 10 in an uptrend)'],
      overbought: [(x) => x.rsi > 70, (a, b) => b.rsi - a.rsi, 'overbought (RSI 14 > 70)'],
      breakout: [(x) => x.brk, (a, b) => b.ch - a.ch, 'breaking above their 20-bar high'],
      trend: [(x) => x.up && x.rsi > 50 && x.rsi < 72, (a, b) => b.ch - a.ch, 'in healthy uptrends (above the 50/200 average, RSI 50–72)'],
      all: [() => true, (a, b) => b.ch - a.ch, 'sorted by recent change'],
    }[kind] || null;
    const hits = res.filter(F[0]).sort(F[1]).slice(0, 10);
    if (!res.length) return { txt: 'The scanner could not load data right now.' };
    return {
      txt: `**Scan (${tf}): ${hits.length} of ${res.length} markets ${F[2]}**\n\n` + (hits.length ? tbl(['Market', 'Price', 'Change*', 'RSI 14', 'Trend', 'Volatility'], hits.map((x) => [lbl(x.s), NT.fmtPrice(px(x.s) || 0), NT.fmtPct(x.ch, 1), x.rsi.toFixed(0), x.up ? '▲ up' : '▼ down', x.vol.toFixed(2) + '%'])) + `\n\n*Change over the last 24 ${tf} bars.` : 'Nothing matches right now.'),
      acts: hits.slice(0, 3).map((x) => ({ l: 'Analyze ' + lbl(x.s), c: 'analyze ' + lbl(x.s) })),
    };
  };

  /* ---- key levels + a ready-made risk plan ---- */
  P.levels = async (sym, tf) => {
    const c = await candlesFor(sym, tf, 400), n = c.length; if (n < 60) return { txt: 'Not enough data for levels.' };
    const last = c[n - 1].c, atr = NT.ind.atr(c, 14)[n - 1], sw = NT.ind.swings(c, 5), highs = new Set(), lows = new Set();
    for (let i = 0; i < n; i++) { if (isFinite(sw.shVal[i])) highs.add(sw.shVal[i]); if (isFinite(sw.slVal[i])) lows.add(sw.slVal[i]); }
    const res = [...highs].filter((v) => v > last).sort((a, b) => a - b).slice(0, 3), sup = [...lows].filter((v) => v < last).sort((a, b) => b - a).slice(0, 3);
    const pv = NT.ind.dailyPivots(c), stop = Math.max(sup[0] ? sup[0] - 0.25 * atr : 0, last - 2 * atr), risk = last - stop, t1 = last + 2 * risk;
    const eq = ACC.equity(priceMap()), qty = (eq * 0.01) / Math.max(1e-12, risk);
    return {
      txt: `**Key levels: ${lbl(sym)} ${tf}** · price ${NT.fmtPrice(last)} · ATR ${NT.fmtPrice(atr)}\n- Resistance (swing highs): ${res.map(NT.fmtPrice).join(' · ') || 'none above (price discovery)'}\n- Support (swing lows): ${sup.map(NT.fmtPrice).join(' · ') || 'none below'}\n- Daily pivots: S1 ${NT.fmtPrice(pv.S1[n - 1])} · P ${NT.fmtPrice(pv.P[n - 1])} · R1 ${NT.fmtPrice(pv.R1[n - 1])}\n\n**Example long plan (1% account risk):** stop ${NT.fmtPrice(stop)} (${((risk / last) * 100).toFixed(2)}% away), first target ${NT.fmtPrice(t1)} (2R). Size: ${NT.fmtQty(qty)} ${lbl(sym)} ≈ ${NT.fmtUSD(qty * last)}. A plan, not advice.`,
      acts: [{ l: 'Buy that size', c: `buy $${Math.round(Math.min(qty * last, ACC.cash))} of ${lbl(sym)}` }, { l: 'Open chart', c: 'open ' + lbl(sym) }],
    };
  };

  /* ---- position sizing from risk % and stop ---- */
  P.size = (q, sym) => {
    const p = px(sym); if (!p) return { txt: 'No live price yet for that market.' };
    const rp = /(\d+(?:\.\d+)?)\s*%\s*(?:risk|of (?:my )?(?:account|equity))|risk(?:ing)?\s*(\d+(?:\.\d+)?)\s*%/i.exec(q), riskPct = rp ? +(rp[1] || rp[2]) : 1;
    const sp = /stop(?:\s*(?:loss)?\s*(?:at|@|of)?)\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(%)?/i.exec(q);
    let stop = null; if (sp) { const v = +sp[1].replace(/,/g, ''); stop = sp[2] ? p * (1 - v / 100) : v; }
    if (!stop || stop >= p) { const c = (getStore(sym, ST.tf).candles || []); const a = c.length > 20 ? NT.ind.atr(c, 14)[c.length - 1] : p * 0.02; stop = p - 2 * a; }
    const eq = ACC.equity(priceMap()), riskUsd = (eq * riskPct) / 100, qty = riskUsd / (p - stop), usd = Math.min(qty * p, ACC.cash);
    return { txt: `**Position size for ${lbl(sym)}**: risking ${riskPct}% of ${NT.fmtUSD(eq)} = **${NT.fmtUSD(riskUsd)}** with a stop at ${NT.fmtPrice(stop)} (${(((p - stop) / p) * 100).toFixed(2)}% below ${NT.fmtPrice(p)}).\n→ Buy **${NT.fmtQty(qty)} ${lbl(sym)}** ≈ ${NT.fmtUSD(qty * p)}${qty * p > ACC.cash ? ` (capped at your ${NT.fmtUSD(ACC.cash)} cash)` : ''}.`, acts: [{ l: `Buy ${NT.fmtUSD(usd, 0)}`, c: `buy $${Math.round(usd)} of ${lbl(sym)}` }] };
  };

  /* ---- compare two markets ---- */
  P.compare = async (a, b, tf) => {
    const [ca, cb] = await Promise.all([candlesFor(a, tf, 500), candlesFor(b, tf, 500)]);
    const st = (c) => { const r = c.slice(1).map((k, i) => Math.log(k.c / c[i].c)), m = r.reduce((x, y) => x + y, 0) / r.length, sd = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / r.length); let pk = c[0].c, dd = 0; for (const k of c) { pk = Math.max(pk, k.c); dd = Math.max(dd, 1 - k.c / pk); } return { ret: (c[c.length - 1].c / c[0].c - 1) * 100, vol: sd * 100, sh: sd ? m / sd : 0, dd: dd * 100, r }; };
    const A = st(ca), B = st(cb), n = Math.min(A.r.length, B.r.length), ra = A.r.slice(-n), rb = B.r.slice(-n), ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
    let cv = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { cv += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2; }
    const corr = cv / Math.sqrt(va * vb || 1);
    return { txt: `**${lbl(a)} vs ${lbl(b)}** (${Math.min(ca.length, cb.length)} × ${tf} bars)\n\n` + tbl(['', lbl(a), lbl(b)], [['Return', NT.fmtPct(A.ret, 1), NT.fmtPct(B.ret, 1)], ['Volatility / bar', A.vol.toFixed(2) + '%', B.vol.toFixed(2) + '%'], ['Max drawdown', '-' + A.dd.toFixed(1) + '%', '-' + B.dd.toFixed(1) + '%'], ['Return / risk', A.sh.toFixed(3), B.sh.toFixed(3)]]) + `\n\nCorrelation: **${corr.toFixed(2)}** (${Math.abs(corr) > 0.7 ? 'they move together, little diversification' : Math.abs(corr) > 0.4 ? 'moderately linked' : 'fairly independent, good for diversification'}).`, acts: [{ l: 'Open ' + lbl(a), c: 'open ' + lbl(a) }, { l: 'Open ' + lbl(b), c: 'open ' + lbl(b) }] };
  };

  /* ---- internal commands from Copilot buttons ---- */
  function internal(q) {
    const m = /^__(setup|bot) ([a-z0-9_]+)\|([^|]{1,100})\|([0-9a-z]{2,3})(?:\|(\{.{0,600}\}))?$/i.exec(q); if (!m) return null;
    const [, kind, id, sym, tf, pj] = m; if (!NT.strategies[id] || !NT.TF[tf] || !(isStock(sym) || isOnchain(sym) || Providers.ids.has(sym))) return { txt: 'That action is no longer valid.' };
    let params = null; if (pj) { try { const o = JSON.parse(pj), d = NT.defaultParams(id); params = {}; for (const k of Object.keys(d)) params[k] = Number.isFinite(+o[k]) ? +o[k] : d[k]; } catch (e) { params = null; } }
    if (kind === 'setup') { Object.assign(ST.setup, { strat: id, sym, tf, paramsFor: null, paramsOverride: params }); showTab('bots'); renderSetup(); return { txt: `Loaded **${NT.strategies[id].name}** on ${lbl(sym)} ${tf} into Bots & Backtest${params ? ' with the tuned settings' : ''}. Press **Run backtest** to see the full report.` }; }
    const b = createBot({ strat: id, sym, tf, capital: 10000, posPct: 100, sl: '', tp: '', trail: '', params: params || {} });
    return b ? { txt: `🤖 Started **${b.name}** with the tuned settings.`, acts: [{ l: 'Open bot controls', c: '__tab bots' }] } : { txt: 'Could not start that bot.' };
  }

  /* ---- main router ---- */
  const VERB = '(?:buy|sell|start|create|backtest|optimi[sz]e|scan|analy[sz]e|open|alert|switch|set|pause|resume|close|rank|compare|show)';
  P.handle = async (q, base, depth = 0) => {
    q = String(q).trim();
    if (q.startsWith('__')) { const r = internal(q); if (r) return r; }
    if (depth === 0) {
      const parts = q.split(new RegExp(`\\s*(?:;|\\band then\\b|\\bthen\\b|,?\\s+and\\s+(?=${VERB}\\b))\\s*`, 'i')).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1 && parts.length <= 5) {
        const outs = [], acts = [];
        for (const p of parts) { const r = await P.handle(p, base, 1); outs.push(r.txt); if (r.acts) acts.push(...r.acts); }
        return { txt: outs.map((t, i) => `**Step ${i + 1}.** ${t}`).join('\n\n'), acts: acts.slice(0, 4) };
      }
    }
    const lq = q.toLowerCase(), sym = symIn(q) || ST.sel;
    if (/\b(pause|stop|halt)\s+(all\s+)?(the\s+|my\s+)?bots?\b/.test(lq) && !/everything/.test(lq)) { ST.bots.forEach((b) => { b.run = false; }); saveState(); return { txt: `⏸ Paused ${ST.bots.length} bot(s). Open positions are kept; say \`close all bot positions\` to flatten them.`, acts: [{ l: 'Resume bots', c: 'resume all bots' }] }; }
    if (/\b(resume|restart|unpause)\s+(all\s+)?(the\s+|my\s+)?bots?\b/.test(lq)) { ST.bots.forEach((b) => { b.run = true; b.lastBar = 0; }); saveState(); return { txt: `▶ ${ST.bots.length} bot(s) running again.` }; }
    if (/\bclose\s+(all\s+)?(the\s+|my\s+)?bot\s*positions?\b/.test(lq)) { let n = 0; ST.bots.forEach((b) => { if (closeBotPos(b, 'closed by Copilot')) n++; }); saveState(); return { txt: `Closed ${n} bot position(s) at market (paper).` }; }
    if (/\b(stop everything|kill switch|panic)\b/.test(lq)) { let n = 0; ST.bots.forEach((b) => { b.run = false; if (closeBotPos(b, 'STOP EVERYTHING (Copilot)')) n++; }); ST.pending = []; for (const o of ACC.orders.slice()) ACC.cancel(o.id); saveState(); return { txt: `⏹ Everything stopped: bots paused, ${n} bot position(s) closed, pending signals and limit orders cancelled.` }; }
    if (/\b(switch|go|change)\s+to\s+(crypto|stocks?|on-?chain|dex|memecoins?)\b/.test(lq)) { const m = /crypto/.test(lq) ? 'crypto' : /stock/.test(lq) ? 'stocks' : 'onchain'; setMode(m); return { txt: `Switched to **${{ crypto: '◆ Crypto', stocks: '▲ Stocks', onchain: '⬡ On-chain' }[m]}** mode.` }; }
    if (/\b(timeframe|time frame|tf|chart)\b/.test(lq) && TFRX.test(lq) && !/\b(backtest|bot|optimi[sz]e|best|scan|levels?|buy|sell)\b/.test(lq)) { const t = tfIn(lq); ST.tf = t; ensureSym(ST.sel); chartRefresh(true); renderMode && renderMode(); saveState(); showTab('markets'); return { txt: `Chart set to **${t}**.` }; }
    if (/\b(best|top|rank|ranking|compare)\b.*\bstrateg/.test(lq) || /\bwhich strateg/.test(lq)) return P.rank(sym, tfIn(lq, isStock(sym) ? '1h' : '4h'));
    if (/\boptimi[sz]e\b|\btune\b/.test(lq)) return P.optimize(stratIn(q) || 'pro_ensemble', sym, tfIn(lq, '4h'));
    if (/\b(scan|screen|scanner)\b|\bwhat'?s (oversold|overbought|breaking out|trending)\b/.test(lq)) { const k = /oversold|dip/.test(lq) ? 'oversold' : /overbought/.test(lq) ? 'overbought' : /break/.test(lq) ? 'breakout' : /trend|strong/.test(lq) ? 'trend' : 'all'; return P.scan(k, tfIn(lq, '1h')); }
    if (/\b(levels?|support|resistance|stop.?loss for|where (should|to) (i )?(put|set) (a |my )?stop)\b/.test(lq)) return P.levels(sym, tfIn(lq, '1h'));
    if (/\b(position size|how much .*(buy|risk)|risk(ing)? \d|size (my|a) (position|trade))\b/.test(lq)) return P.size(q, sym);
    { const m = /\b(?:compare\s+)?([a-z0-9$.]{2,12})\s+(?:vs\.?|versus|against|and)\s+([a-z0-9$.]{2,12})\b/i.exec(q); if (m && /\b(vs|versus|against|compare)\b/i.test(q)) { const a = symFor(NT.parseIntent(m[1], bases()).sym || m[1].toUpperCase().replace('$', '')), b = symFor(NT.parseIntent(m[2], bases()).sym || m[2].toUpperCase().replace('$', '')); if (a && b && a !== b) return P.compare(a, b, tfIn(lq, '1d')); } }
    if (/\b(explain|what is|what's|describe)\b/.test(lq) && stratIn(q)) { const id = stratIn(q), S = NT.strategies[id]; return { txt: `**${S.name}** (${S.cat})\n${S.desc}\n\nSettings: ${S.params.map((p) => `${p.label} ${p.def}`).join(' · ') || 'none'}`, acts: [{ l: 'Rank on ' + lbl(sym), c: `best strategy for ${lbl(sym)}` }, { l: 'Backtest it', c: `backtest ${id} on ${lbl(sym)} 1h` }] }; }
    const r = await base(q);
    if (r && typeof r.txt === 'string' && llmOn()) { // turn LLM-suggested commands into buttons (user clicks to run)
      const acts = r.acts ? r.acts.slice() : [];
      r.txt = r.txt.replace(/\[\[cmd:\s*([^\]\n]{2,120})\]\]/g, (_, c) => { const cmd = c.trim(); if (!cmd.startsWith('__') && acts.length < 4) acts.push({ l: '▶ ' + cmd.slice(0, 40), c: cmd }); return ''; }).trim();
      r.acts = acts.length ? acts : r.acts;
    }
    return r;
  };
  return P;
})();
{ const baseHandle = aiHandle; aiHandle = (q) => Pilot.handle(q, baseHandle); }
