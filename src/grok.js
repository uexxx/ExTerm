/* ExTerm v15 phase 3: the Grok tab (Grok Bot & Workflow Engine) and the 3-agent Copilot desk.
   Grok (xAI direct or via OpenRouter, key in the AES-256 vault) drives a fixed tool registry (P3.TOOLS); without a key
   the zero-key local quant engine (P3.local) runs the same tools, so every panel works out of the box.
   Read-only tools run straight away; anything that changes bots asks you first. Paper trading only.
   All external text (model output, World Monitor headlines, journal notes) is escaped before it reaches the DOM. */
const Grok = (() => {
  const G = { log: [], busy: false, intel: null, intelErr: '', intelT: 0, wf: null, out: '', outTitle: '', pending: [], libCat: '', seenCrit: new Set() };
  const PRESETS = { local: { l: 'Local quant engine (no key)', base: '', model: '' }, xai: { l: 'Grok · xAI', base: 'https://api.x.ai/v1', model: 'grok-4' }, openrouter: { l: 'Grok · OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'x-ai/grok-4' } };
  const BG_TF = ['1m', '5m', '15m', '1h', '4h', '1d'];
  const cfg = () => ST.grok || (ST.grok = { preset: 'local', model: '', key: '', inbox: [], wfs: [] });
  const hooks = () => ST.hooks || (ST.hooks = { discord: '', tgToken: '', tgChat: '' });
  const keyOf = (c) => (c.preset === 'openrouter' ? c.orKey : c.key) || ''; // one key per provider: an xAI key never goes to OpenRouter
  const live = () => cfg().preset !== 'local' && !!keyOf(cfg()) && !!PRESETS[cfg().preset];
  const L = () => typeof Launcher !== 'undefined' && Launcher.caps ? Launcher.caps : {};
  const fee = () => ({ cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 });
  const tbl = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.map((x) => String(x).replace(/\|/g, '/')).join(' | ')} |`).join('\n');
  const symOf = (s) => {
    s = String(s || '').trim(); if (!s) return ST.sel;
    if (/^oc:/.test(s) || /-USD$/i.test(s)) return /^oc:/.test(s) ? s : s.toUpperCase();
    const r = typeof symFor === 'function' ? symFor(s.toUpperCase().replace(/^\$/, '')) : s.toUpperCase();
    return r && (isStock(r) || isOnchain(r) || (Providers.ids && Providers.ids.has(r))) ? r : null;
  };
  const candles = async (sym, tf) => History.get(sym, NT.TF[tf], NT.TF[tf] < 60 ? 2000 : 3000);
  const sname = (id) => (NT.strategies[id] ? NT.strategies[id].name.replace(/^[★✎] /, '') : id);

  /* ───────────── tools (same registry for Grok and the local engine) ───────────── */
  const T = {};
  T.run_backtest = async (a) => {
    const sym = symOf(a.symbol), S = NT.strategies[a.strategy]; if (!sym) return { txt: 'Unknown market ' + a.symbol };
    const c = await candles(sym, a.timeframe); if (c.length < 60) return { txt: `Only ${c.length} ${a.timeframe} candles for ${baseOf(sym)}.` };
    const r = NT.backtest(c, S, NT.defaultParams(a.strategy), Object.assign(fee(), { tfSec: NT.TF[a.timeframe] })).stats;
    const bh = (c[c.length - 1].c / c[0].c - 1) * 100;
    return { txt: `**Backtest · ${sname(a.strategy)} · ${baseOf(sym)} ${a.timeframe}** (${NT.fmtQty(c.length)} candles, fees + slippage)\n` + tbl(['Return', 'Max DD', 'Win %', 'Trades', 'Profit factor', 'Buy & hold'], [[NT.fmtPct(r.ret, 1), '-' + r.maxDD.toFixed(1) + '%', r.winRate != null ? r.winRate.toFixed(0) + '%' : '–', r.closed, r.profitFactor == null ? '–' : r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2), NT.fmtPct(bh, 1)]]), data: { ret: +r.ret.toFixed(2), maxDD: +r.maxDD.toFixed(2), winRate: r.winRate, trades: r.closed, pf: r.profitFactor, buyHold: +bh.toFixed(2) } };
  };
  T.run_validation = async (a) => {
    const sym = symOf(a.symbol), S = NT.strategies[a.strategy]; if (!sym) return { txt: 'Unknown market ' + a.symbol };
    const c = await candles(sym, a.timeframe); if (c.length < 300) return { txt: `The Validation Lab needs 300+ candles; ${baseOf(sym)} ${a.timeframe} has ${c.length}. Try a higher timeframe.` };
    await new Promise((r) => setTimeout(r, 0));
    const v = NT.validate(c, S, NT.defaultParams(a.strategy), Object.assign(fee(), { tfSec: NT.TF[a.timeframe] }));
    const ic = { pass: '✅', warn: '⚠️', fail: '❌' };
    return { txt: `**${v.checks.length}-test Validation Lab · ${sname(a.strategy)} · ${baseOf(sym)} ${a.timeframe}: grade ${v.grade} (${v.score}/100)**\n${v.verdict}\n\n` + tbl(['', 'Test', 'Result'], v.checks.map((k) => [ic[k.status] || '', k.name, k.value])), data: { grade: v.grade, score: v.score, verdict: v.verdict, failed: v.checks.filter((k) => k.status === 'fail').map((k) => k.name) } };
  };
  /* spec strategies have no code parameters: tune their risk block (stop / target / trail) walk-forward instead */
  T.tune_parameters = async (a) => {
    const sym = symOf(a.symbol), S = NT.strategies[a.strategy]; if (!sym) return { txt: 'Unknown market ' + a.symbol };
    if (!S.spec) { const r = await Pilot.optimize(a.strategy, sym, a.timeframe); return { txt: r.txt, data: { note: 'walk-forward optimizer' } }; }
    const c = await candles(sym, a.timeframe); if (c.length < 300) return { txt: `Not enough ${a.timeframe} history to tune (${c.length} candles).` };
    const cut = Math.floor(c.length * 0.7), train = c.slice(0, cut), test = c.slice(Math.max(0, cut - 250)), base = S.spec.risk, out = [];
    const keys = Object.keys(base).length ? Object.keys(base) : ['sl'], mult = [0.5, 1, 1.5, 2];
    const run = (cs, risk) => { const st = NT.Spec.compile(Object.assign({}, S.spec, { risk })); return NT.backtest(cs, st, {}, Object.assign(fee(), { tfSec: NT.TF[a.timeframe] })).stats; };
    const sc = (r) => (r.closed >= 3 ? r.ret / Math.max(3, r.maxDD) : -99);
    for (const m1 of mult) for (const m2 of keys.length > 1 ? mult : [1]) {
      const risk = {}; keys.forEach((k, i) => { const b = base[k] || 2; risk[k] = Math.max(0.1, +(b * (i === 0 ? m1 : m2)).toFixed(2)); });
      try { out.push({ risk, tr: run(train, risk) }); } catch (e) { /* skip */ }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!out.length) return { txt: 'Tuning failed on this data.' };
    const best = out.sort((x, y) => sc(y.tr) - sc(x.tr))[0], oos = run(test, best.risk), dOos = run(test, base), held = oos.ret >= dOos.ret;
    const rk = (r) => Object.entries(r).map(([k, v]) => `${k} ${v}%`).join(', ') || 'none';
    return { txt: `**Risk tuning · ${sname(a.strategy)} · ${baseOf(sym)} ${a.timeframe}**\nTried ${out.length} stop / target sets on the first 70%, checked on the unseen 30%.\n` + tbl(['', 'Risk', 'Unseen return', 'Unseen DD', 'Trades'], [['Tuned', rk(best.risk), NT.fmtPct(oos.ret, 1), '-' + oos.maxDD.toFixed(1) + '%', oos.closed], ['Default', rk(base), NT.fmtPct(dOos.ret, 1), '-' + dOos.maxDD.toFixed(1) + '%', dOos.closed]]) + `\n${held ? '✅ Tuned risk also held up on unseen data.' : '⚠️ Defaults did better on unseen data: keep them (tuning would be curve-fitting).'}`, data: { best: best.risk, unseenRet: +oos.ret.toFixed(2), defaultUnseenRet: +dOos.ret.toFixed(2), held } };
  };
  T.detect_regime = async (a) => {
    const sym = symOf(a.symbol); if (!sym) return { txt: 'Unknown market ' + a.symbol };
    const c = await candlesFor(sym, a.timeframe, 300), r = P3.regime(c);
    const nm = { 'trend-up': '📈 trending up', 'trend-down': '📉 trending down', range: '〰 ranging', 'high-vol': '⚡ high volatility', unknown: '? unknown' }[r.regime];
    return { txt: `**Regime · ${baseOf(sym)} ${a.timeframe}: ${nm}**${r.adx != null ? ` (ADX ${r.adx.toFixed(0)}, ATR ${r.atrPct.toFixed(2)}%, EMA-50 slope ${r.slope.toFixed(2)}%)` : ''}\nStrategies that fit: ${r.picks.map(sname).join(' · ') || '–'}`, data: r, regime: r };
  };
  T.generate_workflow = async (a) => {
    const sym = symOf(a.symbol); if (!sym) return { txt: 'Unknown market ' + a.symbol };
    let reg = null; try { reg = P3.regime(await candlesFor(sym, a.timeframe, 300)); } catch (e) { /* workflow still builds */ }
    const intel = G.intel ? P3.shield(G.intel.items) : null;
    G.wf = P3.workflow({ sym, tf: a.timeframe, strat: a.strategy, regime: reg, autoPause: !!(G.intel && G.intel.cfg && G.intel.cfg.autoPause), riskPct: 1, dailyLoss: 5, now: Date.now() });
    const w = cfg(); w.wfs = [G.wf].concat((w.wfs || []).filter((x) => x.id !== G.wf.id)).slice(0, 8); saveState();
    return { txt: `**Auto-workflow built for ${baseOf(sym)} ${a.timeframe}**: ${G.wf.nodes.map((n) => n.label).join(' → ')}${intel && intel.level !== 'CALM' ? `\n⚠️ Macro shield is ${intel.level}: ${intel.advice}` : ''}`, data: { id: G.wf.id, strategy: G.wf.strat, bg: G.wf.bg } };
  };
  T.journal_autopsy = async () => {
    if (Journal.initP) { try { await Journal.initP; } catch (e) { /* journal may be empty */ } }
    const C = Journal.closed(Journal.entries || []), A = P3.autopsy(C, 10), K = P3.leaks(C, 10);
    if (!A.length) return { txt: 'No closed trades in the journal yet: trade a little on paper and come back.', data: { trades: 0 } };
    return { txt: `**Post-trade autopsy (last ${A.length})** · discipline score **${K.score}/100**\n` + tbl(['Grade', 'Market', 'P&L', 'Why', 'Lesson'], A.map((t) => [t.grade, baseOf(t.sym), NT.fmtUSD(t.pnl), t.why.join('; '), t.lesson])) + (K.leaks.length ? '\n\n**Behavioral leaks**\n' + K.leaks.map((l) => `- ${l.sev === 'high' ? '🔴' : l.sev === 'med' ? '🟠' : '🟡'} **${l.title}**: ${l.detail}`).join('\n') : '\n\nNo behavioral leaks in the last 10 trades. 👏'), data: { score: K.score, leaks: K.leaks.map((l) => l.id), grades: A.map((t) => t.grade).join('') } };
  };
  T.macro_intel = async () => {
    await G.loadIntel(true); if (!G.intel) return { txt: G.intelErr || 'World Monitor feed needs the ExTerm launcher (serve.py).', data: { level: 'unknown' } };
    const s = P3.shield(G.intel.items), top = G.intel.items.filter((i) => i.sev !== 'INFO').slice(0, 6);
    return { txt: `**Macro Shield: ${s.level}** · ${s.advice}\n` + (top.length ? top.map((i) => `- [${i.sev}] ${i.title} (${i.source})`).join('\n') : 'No CRITICAL / HIGH / MACRO headlines right now.'), data: { level: s.level, critical: s.crit.length, high: s.high.length, macro: s.macro.length, top: top.slice(0, 4).map((i) => i.sev + ': ' + i.title.slice(0, 120)) } };
  };
  T.list_bots = async () => {
    if (L().bots) await BgBotsUI.refresh(true);
    const bg = (BgBotsUI.list || []).map((b) => [b.name, baseOf(b.sym), b.tf, b.active ? 'running' : 'paused', NT.fmtUSD((b.equity || b.cash) - b.capital), b.status || '']);
    const tab = (ST.bots || []).map((b) => [b.name, baseOf(b.sym), b.tf, b.run ? 'running (tab)' : 'paused (tab)', NT.fmtUSD(botStats(b).pnl), '']);
    const rows = bg.concat(tab); if (!rows.length) return { txt: 'No bots yet. Ask me to "start a bot" or build an auto-workflow.', data: { bots: 0 } };
    return { txt: '**Bots**\n' + tbl(['Name', 'Market', 'TF', 'State', 'P&L', 'Status'], rows), data: { launcher: bg.length, tab: tab.length } };
  };
  T.start_bot = async (a) => {
    const sym = symOf(a.symbol), S = NT.strategies[a.strategy]; if (!sym) return { txt: 'Unknown market ' + a.symbol };
    const cap = a.capital || 1000, name = `${sname(a.strategy).slice(0, 28)} · ${baseOf(sym)} ${a.timeframe}`;
    if (S.spec && BG_TF.includes(a.timeframe) && L().bots) {
      await J.post('/api/bots', { id: 'gk' + NT.uid().replace(/[^A-Za-z0-9]/g, '').slice(0, 20), name, sym, tf: a.timeframe, spec: S.spec, capital: cap, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, maxDailyLoss: 5, notify: cfg().notifyBots !== false, active: true }, { timeout: 8000 });
      await BgBotsUI.refresh(true);
      return { txt: `☁ 24/7 launcher bot started: **${name}** with ${NT.fmtUSD(cap, 0)} (keeps running with the tab closed, 5% daily loss stop).`, data: { started: 'launcher' } };
    }
    const b = createBot({ strat: a.strategy, sym, tf: a.timeframe, capital: cap, posPct: 100, name, sl: '', tp: '', trail: '', params: {} });
    return { txt: b ? `🤖 In-tab paper bot started: **${name}**${S.spec ? '' : ' (code strategies run in the tab)'}${BG_TF.includes(a.timeframe) ? '' : ' (sub-minute bots run in the tab)'}.` : 'Could not start that bot.', data: { started: b ? 'tab' : 'none' } };
  };
  T.pause_bots = async (a) => {
    const on = !!a.resume; let n = 0;
    if (L().bots) { await BgBotsUI.refresh(true); if (on) { try { await J.post('/api/bots/shield', { clear: true }, { timeout: 8000 }); } catch (e) { /* older launcher */ } } for (const b of BgBotsUI.list || []) { if (b.active !== on) { try { await J.post('/api/bots', Object.assign({}, b, { active: on }), { timeout: 8000 }); n++; } catch (e) { /* keep going */ } } } await BgBotsUI.refresh(true); }
    (ST.bots || []).forEach((b) => { if (b.run !== on) { b.run = on; if (on) b.lastBar = 0; n++; } }); saveState();
    return { txt: `${on ? '▶ Resumed' : '⏸ Paused'} ${n} bot(s). ${on ? '' : 'Open positions keep their stops.'}`, data: { changed: n } };
  };
  T.switch_regime = async (a) => {
    const sym = symOf(a.symbol); if (!sym) return { txt: 'Unknown market ' + a.symbol };
    const r = P3.regime(await candlesFor(sym, a.timeframe, 300)), id = r.picks[0]; if (!id) return { txt: 'No regime pick for this market right now.' };
    const cur = (BgBotsUI.list || []).find((b) => b.sym === sym && b.tf === a.timeframe);
    if (cur && L().bots) {
      if (cur.pos) return { txt: `**${cur.name}** has an open position: close it first, then switch to ${sname(id)} (${r.regime}).` };
      await J.post('/api/bots', Object.assign({}, cur, { spec: NT.strategies[id].spec, name: `${sname(id).slice(0, 28)} · ${baseOf(sym)} ${a.timeframe}` }), { timeout: 8000 }); await BgBotsUI.refresh(true);
      return { txt: `🔁 Regime is **${r.regime}**: switched ${baseOf(sym)} ${a.timeframe} bot to **${sname(id)}**.`, data: { regime: r.regime, strategy: id } };
    }
    return T.start_bot({ strategy: id, symbol: sym, timeframe: a.timeframe });
  };
  G.tools = T;

  /* ───────────── run one tool call (checked), with confirmation for anything that changes bots ───────────── */
  G.call = async (name, args, viaModel) => {
    const chk = P3.checkTool(name, args); if (!chk.ok) return { txt: '⚠️ ' + chk.error, data: { error: chk.error } };
    if (!chk.safe && viaModel) { const id = NT.uid(), sig = name + JSON.stringify(chk.args); if (!G.pending.some((p) => p.name + JSON.stringify(p.args) === sig)) G.pending.push({ id, name, args: chk.args }); G.pending = G.pending.slice(-10); return { txt: `⏳ **${name.replace(/_/g, ' ')}** is waiting for your OK below.`, data: { queued: true, note: 'the user must confirm this action' } }; }
    try { return await T[name](chk.args); } catch (e) { return { txt: '⚠️ ' + name + ': ' + (e.message || e), data: { error: String(e.message || e).slice(0, 200) } }; }
  };
  const say = (role, text, extra) => { G.log.push(Object.assign({ role, text: String(text).slice(0, 12000), ts: Date.now() }, extra || {})); G.log = G.log.slice(-40); };

  /* ───────────── Grok model loop: tool calls run locally, results go back to the model (max 4 rounds) ───────────── */
  async function grokLLM(q) {
    const c = cfg(), p = PRESETS[c.preset], model = (c.model || p.model).replace(/[^A-Za-z0-9_.:\/-]/g, '').slice(0, 80);
    const headers = { Authorization: 'Bearer ' + keyOf(c) }; if (c.preset === 'openrouter') { headers['HTTP-Referer'] = 'https://exterm.local'; headers['X-Title'] = 'ExTerm Grok'; }
    const sys = `You are Grok inside ExTerm's Grok Bot & Workflow Engine, a PAPER-trading terminal (no real money). Use the tools to answer: run backtests, the 17-test Validation Lab, parameter tuning, regime detection, auto-workflows, journal autopsies and macro intel before giving an opinion. Strategy ids: ${NT.PACK4.join(', ')} (and others). Selected market ${ST.sel}, timeframe ${ST.tf}. Be concise, use short markdown bullets, never promise profits.`;
    const msgs = [{ role: 'system', content: sys }].concat(G.log.filter((m) => m.role === 'user' || m.role === 'grok').slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 2000) }))).concat([{ role: 'user', content: q }]);
    for (let round = 0; round < 4; round++) {
      const r = await J.post(p.base + '/chat/completions', { model, messages: msgs, tools: P3.schemas(), tool_choice: 'auto', temperature: 0.2, max_tokens: 900 }, { headers, timeout: 90000 });
      const m = r && r.choices && r.choices[0] && r.choices[0].message; if (!m) throw new Error('empty response');
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls.slice(0, 4) : [];
      if (!calls.length) return String(m.content || '(no answer)');
      msgs.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
      for (const tc of calls) {
        const fn = tc && tc.function ? tc.function : {}, res = await G.call(String(fn.name || ''), fn.arguments || '{}', true);
        say('tool', res.txt, { tool: String(fn.name || '').slice(0, 40) });
        msgs.push({ role: 'tool', tool_call_id: String(tc.id || '').slice(0, 80), content: JSON.stringify(res.data || { text: res.txt.slice(0, 1500) }).slice(0, 3000) });
      }
      render();
    }
    return 'Stopped after 4 tool rounds.';
  }
  G.ask = async (q) => {
    q = String(q || '').trim().slice(0, 1000); if (!q || G.busy) return;
    G.busy = true; say('user', q); render();
    try {
      if (live()) say('grok', await grokLLM(q));
      else { const it = NT.parseIntent(q, new Set([...Providers.bases, ...STOCK_SET])), named = it.sym ? symOf(it.sym) : null, tc = P3.local(q, { sym: named || ST.sel, tf: ST.tf }), res = await G.call(tc.name, tc.args, true); say('tool', res.txt, { tool: tc.name }); say('grok', `Local quant engine ran **${tc.name.replace(/_/g, ' ')}**. Add a Grok key (xAI or OpenRouter) above for free-form reasoning on top.`); }
    } catch (e) { say('grok', '⚠️ Grok call failed: ' + String(e.message || e).slice(0, 160) + '. The local quant engine still works: switch the engine to "Local".'); }
    G.busy = false; render();
  };
  G.confirm = async (id, ok) => {
    const p = G.pending.find((x) => x.id === id); G.pending = G.pending.filter((x) => x.id !== id); if (!p) return;
    if (!ok) { say('grok', `Skipped **${p.name.replace(/_/g, ' ')}**.`); return render(); }
    const res = await G.call(p.name, p.args, false); say('tool', res.txt, { tool: p.name }); render();
  };

  /* ───────────── World Monitor intel (from the launcher's RAM cache) ───────────── */
  G.loadIntel = async (force) => {
    if (!force && G.intel && Date.now() - G.intelT < 60000) return G.intel;
    if (!L().intel) { G.intelErr = J.proxy ? 'This launcher has no World Monitor feed (started with --no-intel or --offline).' : 'Start ExTerm with the launcher (serve.py) for the World Monitor feed.'; return null; }
    try {
      const r = await J.get('/api/intel', { timeout: 6000 });
      G.intel = { items: P3.cleanIntel(r), cfg: r && r.cfg && typeof r.cfg === 'object' ? { notify: !!r.cfg.notify, autoPause: !!r.cfg.autoPause, tighten: !!r.cfg.tighten } : {}, err: String((r && r.error) || '').slice(0, 120), ts: +r.ts || 0 };
      G.intelT = Date.now(); G.intelErr = '';
      G.warn();
    } catch (e) { G.intelErr = e.message; }
    return G.intel;
  };
  /* warn Copilot (once per headline) when a fresh CRITICAL shows up */
  G.warn = () => {
    const s = P3.shield(G.intel.items);
    for (const it of s.crit) {
      const seen = cfg().seen || (cfg().seen = []); if (G.seenCrit.has(it.id) || seen.includes(it.id)) continue; G.seenCrit.add(it.id); cfg().seen = seen.concat(it.id).slice(-200); saveState();
      toast(`🚨 <b>World Monitor CRITICAL</b>: ${esc(it.title.slice(0, 140))}`, 'dn', 10000);
      if (typeof addMsg === 'function') addMsg('assistant', `🚨 **Macro Shield: CRITICAL headline** (World Monitor): ${it.title.slice(0, 200)}\nConsider pausing new entries and tightening stops until it settles.`, [{ l: '⚡ Open Grok Macro Shield', c: '__tab grok' }, { l: 'Pause all bots', c: 'pause all bots' }]);
    }
  };
  const badge = (sev) => `<span class="gk-badge ${esc(String(sev).toLowerCase())}">${esc(sev)}</span>`;
  const intelRows = (items, n) => items.slice(0, n).map((i) => `<div class="gk-intel">${badge(i.sev)}<div><div class="t">${i.link ? `<a href="${safeUrl(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</div><div class="note">${esc(i.source)}${i.loc ? ' · ' + esc(i.loc) : ''}${i.ts ? ' · ' + esc(fmtStamp(i.ts * 1000)) : ''}</div></div></div>`).join('');
  G.newsStrip = (host) => {
    if (!host) return; const box = document.createElement('div'); box.className = 'panel gk-strip'; host.insertBefore(box, host.children[1] || null);
    const draw = () => { const it = G.intel ? G.intel.items.filter((i) => i.sev !== 'INFO') : []; box.innerHTML = `<div class="ph">🌐 Global Intel &amp; Macro Shield <span class="note">World Monitor</span><span class="sp"></span><button type="button" class="btn sm" data-gkn="open">Open in Grok</button></div>${G.intel ? (it.length ? intelRows(it, 5) : '<div class="note">No CRITICAL / HIGH / MACRO headlines right now.</div>') : `<div class="note">${esc(G.intelErr || 'Loading…')}</div>`}`; };
    box.addEventListener('click', (e) => { if (e.target.closest('[data-gkn="open"]')) showTab('grok'); });
    draw(); G.loadIntel().then(draw);
  };

  /* ───────────── Copilot ↔ Grok bridge ───────────── */
  G.receive = (o) => { const b = P3.bridge(Object.assign({}, o, { ts: Date.now() })); const c = cfg(); c.inbox = [b].concat(c.inbox || []).slice(0, 20); saveState(); toast(`⚡ Setup for <b>${esc(baseOf(b.sym))}</b> sent to the Grok tab`, 'acc'); };
  G.toCopilot = (b) => {
    const p = P3.bridge(Object.assign({}, b, { from: 'grok' }));
    addMsg('assistant', `⚡ **From Grok**: ${baseOf(p.sym)} ${p.tf}${p.strat ? ' · ' + sname(p.strat) : ''}${p.entry ? ` · ${p.side} @ ${NT.fmtPrice(p.entry)}` : ''}${p.sl ? ' · SL ' + NT.fmtPrice(p.sl) : ''}${p.tp ? ' · TP ' + NT.fmtPrice(p.tp) : ''}${p.note ? '\n' + p.note : ''}`, [{ l: '🧠 Run 3-agent desk', c: 'desk ' + baseOf(p.sym) + ' ' + p.tf }].concat(p.strat ? [{ l: 'Backtest it', c: `backtest ${p.strat} on ${baseOf(p.sym)} ${p.tf}` }] : []));
    toast('Sent to the AI Copilot', 'acc');
  };

  /* ───────────── mobile alerts: webhooks live in the vault, the launcher dispatches ───────────── */
  /* quiet = after a vault unlock: only refill a launcher that has no channel at all (it restarted with a fresh data folder),
     never override its on/off switch. A click on Save pushes and switches alerts on. */
  G.pushHooks = async (quiet) => {
    const h = hooks(); if (!L().alerts || !(h.discord || h.tgToken || h.tgChat)) return false;
    try {
      let enabled = true;
      if (quiet) { const cur = await J.get('/api/alerts', { timeout: 6000 }); if (cur && (cur.telegram || cur.discord)) return false; enabled = !(cur && cur.enabled === false); }
      await J.post('/api/alerts/config', { enabled, tgToken: h.tgToken || '', tgChat: h.tgChat || '', discord: h.discord || '' }, { timeout: 6000 }); if (!quiet) toast('Alert channels synced to the launcher ✓', 'up'); return true;
    }
    catch (e) { if (!quiet) toast('Alert channels: ' + esc(e.message.replace(/^HTTP \d+ /, '')), 'dn'); return false; }
  };

  /* ───────────── rendering ───────────── */
  const sec = (id, title, body, wide) => `<div class="panel gk-p${wide ? ' wide' : ''}" id="${id}"><div class="ph">${title}</div>${body}</div>`;
  function wfHtml(w) {
    if (!w) return '<div class="note">Pick a market and press <b>Generate Auto-Workflow</b>.</div>';
    return `<div class="wf" role="list">${w.nodes.map((n, i) => `${i ? '<span class="wf-arrow" aria-hidden="true">→</span>' : ''}<div class="wf-node k-${esc(n.kind)}" role="listitem"><b>${esc(n.label)}</b><span class="note">${esc(n.detail || '')}</span></div>`).join('')}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button type="button" class="btn sm pri" data-gk="wfdeploy">🚀 Deploy (asks first)</button><button type="button" class="btn sm" data-gk="wfval">🧪 Validate first</button><button type="button" class="btn sm" data-gk="wfcop">↗ Send to Copilot</button></div>`;
  }
  function libHtml() {
    const cats = NT.PACK4_CATS || [], cat = G.libCat || cats[0];
    return `<div class="seg" role="tablist">${cats.map((c) => `<button type="button" data-gkcat="${esc(c)}" class="${c === cat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
      <div class="gk-lib">${NT.PACK4.filter((id) => NT.strategies[id].cat === cat).map((id) => { const S = NT.strategies[id]; return `<div class="gk-strat"><div><b>${esc(sname(id))}</b> <span class="note">${esc(S.tfHint || '')}</span><div class="note">${esc(S.desc)}</div></div><div class="row" style="gap:4px"><button type="button" class="btn xs" data-gks="bt" data-id="${esc(id)}">Backtest</button><button type="button" class="btn xs" data-gks="val" data-id="${esc(id)}">17 tests</button><button type="button" class="btn xs" data-gks="pine" data-id="${esc(id)}">Export Pine Script v5</button></div></div>`; }).join('')}</div>`;
  }
  function render() {
    const host = $('#gkHost'); if (!host || curTab !== 'grok') return;
    const c = cfg(), h = hooks(), I = G.intel, sh = I ? P3.shield(I.items) : null, ic = (I && I.cfg) || {};
    const engine = live() ? `${PRESETS[c.preset].l} · ${esc(c.model || PRESETS[c.preset].model)}` : 'Local quant engine (zero-key)';
    const logH = G.log.length ? G.log.map((m) => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}${m.role === 'tool' ? ' gk-tool' : ''}">${m.role === 'tool' ? `<div class="note">🛠 ${esc(m.tool || 'tool')}</div>` : ''}${md(m.text)}</div>`).join('') : `<div class="msg a">${md('Ask me to **backtest**, **validate** (17 tests), **tune**, detect the **regime**, build an **auto-workflow**, run a **journal autopsy**, read **macro intel**, or **start / pause bots**. Example: `validate q4_cr_donchadx on BTC 4h`.')}</div>`;
    const pend = G.pending.map((p) => `<div class="gk-pend"><span>Grok wants to <b>${esc(p.name.replace(/_/g, ' '))}</b> <code>${esc(JSON.stringify(p.args).slice(0, 160))}</code></span><button type="button" class="btn xs pri" data-gkok="${esc(p.id)}">Allow</button><button type="button" class="btn xs" data-gkno="${esc(p.id)}">Skip</button></div>`).join('');
    const inbox = (c.inbox || []).map((b, i) => `<div class="gk-in"><span><b>${esc(baseOf(b.sym))}</b> ${esc(b.tf)} · ${esc(b.side)}${b.entry ? ' @ ' + esc(NT.fmtPrice(b.entry)) : ''}${b.sl ? ' · SL ' + esc(NT.fmtPrice(b.sl)) : ''}${b.tp ? ' · TP ' + esc(NT.fmtPrice(b.tp)) : ''}<span class="note"> ${esc(b.note)}</span></span><span class="row" style="gap:4px"><button type="button" class="btn xs" data-gkb="wf" data-i="${i}">Workflow</button><button type="button" class="btn xs" data-gkb="val" data-i="${i}">17 tests</button><button type="button" class="btn xs" data-gkb="del" data-i="${i}">✕</button></span></div>`).join('') || '<div class="note">Empty. In the AI Copilot, a desk report’s <b>Send Setup to Grok Tab</b> button lands here.</div>';
    const bots = (BgBotsUI.list || []).map((b) => `<div class="gk-in"><span><b>${esc(b.name)}</b> <span class="note">${esc(b.status || '')}</span></span><span class="row" style="gap:4px"><span class="${cls((b.equity || b.cash) - b.capital)}">${esc(NT.fmtUSD((b.equity || b.cash) - b.capital))}</span><button type="button" class="btn xs" data-gkbot="toggle" data-id="${esc(b.id)}">${b.active ? 'Pause' : 'Resume'}</button></span></div>`).join('') || `<div class="note">${L().bots ? 'No 24/7 bots yet.' : 'Start ExTerm with the launcher (serve.py) to run bots 24/7.'}</div>`;
    host.innerHTML = `<div class="gk-head panel"><div><h2 style="margin:0">⚡ Grok Bot &amp; Workflow Engine</h2><div class="note">Engine: <b>${engine}</b> · separate from the AI Copilot · paper trading only</div></div>
      <div class="row gk-cfg"><select class="in sm" id="gkPreset" aria-label="Grok engine">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}"${k === c.preset ? ' selected' : ''}>${esc(p.l)}</option>`).join('')}</select>
      <input class="in sm mono" id="gkModel" placeholder="${esc((PRESETS[c.preset] || PRESETS.local).model || 'model')}" value="${esc(c.model || '')}" aria-label="Model"${c.preset === 'local' ? ' hidden' : ''}>
      <input class="in sm mono" id="gkKey" type="password" autocomplete="off" placeholder="${keyOf(c) ? '•••• saved (vault)' : 'API key (stored in the AES-256 vault)'}" aria-label="Grok API key"${c.preset === 'local' ? ' hidden' : ''}><button type="button" class="btn sm" data-gk="savecfg">Save</button></div></div>
      <div class="gk-grid">
      ${sec('gkConsole', '🧠 Grok console <span class="note">tool-calling</span>', `<div class="gk-log" id="gkLog" aria-live="polite">${logH}${G.busy ? '<div class="msg a"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}</div>${pend}<form class="row" id="gkForm" style="gap:6px;margin-top:8px"><input class="in" id="gkIn" maxlength="1000" placeholder="e.g. tune q4_qs_ema513 on ETH 5s · what regime is BTC in? · autopsy my journal" aria-label="Ask Grok"><button class="btn pri" type="submit"${G.busy ? ' disabled' : ''}>Run</button></form>`, true)}
      ${sec('gkWf', '🔀 Auto-Workflow', `<div class="row" style="gap:6px;flex-wrap:wrap"><input class="in sm" id="gkWfSym" value="${esc(baseOf(ST.sel))}" aria-label="Market"><select class="in sm" id="gkWfTf" aria-label="Timeframe">${TF_ALL.map((t) => `<option${t === (ST.tf || '1h') ? ' selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="btn sm pri" data-gk="wfgen">✨ Generate Auto-Workflow</button></div><div id="gkWfOut" style="margin-top:8px">${wfHtml(G.wf)}</div>`, true)}
      ${sec('gkShield', `🌐 Global Intel &amp; Macro Shield ${sh ? badge(sh.level === 'CALM' ? 'INFO' : sh.level === 'ELEVATED' ? 'HIGH' : 'CRITICAL').replace('>INFO<', '>CALM<').replace('>HIGH<', '>ELEVATED<') : ''}`, `${sh ? `<div class="note">${esc(sh.advice)} · ${I.items.length} headlines</div>` : ''}<div class="row" style="gap:10px;flex-wrap:wrap;margin:6px 0"><label class="note"><input type="checkbox" data-gkic="notify"${ic.notify ? ' checked' : ''}${I ? '' : ' disabled'}> push CRITICAL to phone</label><label class="note"><input type="checkbox" data-gkic="autoPause"${ic.autoPause ? ' checked' : ''}${I ? '' : ' disabled'}> auto-pause bots on CRITICAL</label><label class="note"><input type="checkbox" data-gkic="tighten"${ic.tighten ? ' checked' : ''}${I ? '' : ' disabled'}> tighten bot stops to 1%</label><button type="button" class="btn xs" data-gk="shieldnow"${L().bots ? '' : ' disabled'}>Shield bots now</button><button type="button" class="btn xs" data-gk="intelref">↻</button></div><div class="gk-feed">${I ? intelRows(I.items.filter((i) => i.sev !== 'INFO').concat(I.items.filter((i) => i.sev === 'INFO')), 25) || '<div class="note">Feed is empty right now.</div>' : `<div class="note">${esc(G.intelErr || 'Loading World Monitor…')}</div>`}</div>`)}
      ${sec('gkBots', '☁ 24/7 bots', `${bots}<div class="row" style="gap:6px;margin-top:8px"><button type="button" class="btn xs" data-gkq="list bots">Refresh</button><button type="button" class="btn xs" data-gkq="pause all bots">Pause all</button><button type="button" class="btn xs" data-gkq="resume all bots">Resume all</button><button type="button" class="btn xs" data-gkq="switch strategy for the regime">Regime switch</button></div>`)}
      ${sec('gkBridge', '🔗 Copilot Bridge', `${inbox}<div class="row" style="gap:6px;margin-top:8px"><button type="button" class="btn xs" data-gk="sendwf"${G.wf ? '' : ' disabled'}>Send current workflow to Copilot</button><button type="button" class="btn xs" data-gk="opencop">Open AI Copilot</button></div>`)}
      ${sec('gkAuto', '🩺 Journal autopsy &amp; leaks', `<div class="note">Win/loss post-mortems and the behavioral leak detector over your last 10 closed trades.</div><div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn sm" data-gkq="autopsy my journal">Run autopsy</button><button type="button" class="btn sm" data-gkq="what regime is ${esc(baseOf(ST.sel))} in ${esc(ST.tf)}">Detect regime</button></div>`)}
      ${sec('gkAlerts', '📱 Mobile alerts <span class="note">Discord · Telegram</span>', `<div class="note">Webhooks are kept in the AES-256 vault (Settings → remember keys) and synced to the launcher, which pushes Grok bot trades, chart <b>+</b> price alerts and World Monitor CRITICAL headlines.</div>
        <input class="in sm mono" id="gkDc" type="password" autocomplete="off" placeholder="${h.discord ? '•••• Discord webhook saved' : 'https://discord.com/api/webhooks/…'}" aria-label="Discord webhook">
        <div class="row" style="gap:6px"><input class="in sm mono" id="gkTg" type="password" autocomplete="off" placeholder="${h.tgToken ? '•••• bot token saved' : 'Telegram bot token'}" aria-label="Telegram bot token"><input class="in sm mono" id="gkTc" placeholder="${esc(h.tgChat || 'chat id')}" aria-label="Telegram chat id"></div>
        <div class="row" style="gap:10px;flex-wrap:wrap"><label class="note"><input type="checkbox" data-gkn2="bots"${c.notifyBots !== false ? ' checked' : ''}> bot trades</label><label class="note"><input type="checkbox" data-gkn2="chart"${ST.settings.bgAlerts ? ' checked' : ''}${L().alerts ? '' : ' disabled'}> chart + alerts</label></div>
        <div class="row" style="gap:6px"><button type="button" class="btn sm pri" data-gk="savehooks"${L().alerts ? '' : ' disabled'}>Save &amp; sync</button><button type="button" class="btn sm" data-gk="testhooks"${L().alerts ? '' : ' disabled'}>Send test</button><span class="note" id="gkHookMsg"></span></div>`)}
      ${sec('gkLib', '📚 Strategy library <span class="note">40 new · backtest · 17 tests · Pine Script v5</span>', libHtml(), true)}
      ${G.out ? sec('gkOut', esc(G.outTitle || 'Result'), G.out, true) : ''}
      </div>`;
    const log = $('#gkLog'); if (log) log.scrollTop = log.scrollHeight;
  }
  G.render = render;
  const show = (title, html) => { G.outTitle = title; G.out = html; render(); const o = $('#gkOut'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const runShown = async (name, args) => { show('Working…', '<div class="empty shimmer">Running ' + esc(name.replace(/_/g, ' ')) + '…</div>'); const r = await G.call(name, args, false); show(name.replace(/_/g, ' '), md(r.txt)); return r; };

  /* ───────────── events: one delegated listener, no inline handlers ───────────── */
  async function onClick(e) {
    const t = e.target.closest('button,[data-gkcat]'); if (!t) return;
    const d = t.dataset, c = cfg();
    if (d.gkok || d.gkno) return G.confirm(d.gkok || d.gkno, !!d.gkok);
    if (d.gkq) return G.ask(d.gkq);
    if (d.gkcat) { G.libCat = d.gkcat; return render(); }
    if (d.gks) {
      const id = d.id; if (!NT.strategies[id]) return;
      const tf = NT.strategies[id].tfHint || '1h', sym = ST.sel;
      if (d.gks === 'pine') { const code = NT.Spec.toPine(NT.strategies[id].spec); show('Pine Script v5 · ' + sname(id), `<div class="bd-code"><div class="row"><span class="sp"></span><button type="button" class="btn sm" data-gk="pinecopy">Copy</button><button type="button" class="btn sm" data-gk="pinedl" data-id="${esc(id)}">Download .pine</button></div><pre class="mono" id="gkPine">${esc(code)}</pre></div>`); return; }
      return runShown(d.gks === 'bt' ? 'run_backtest' : 'run_validation', { strategy: id, symbol: sym, timeframe: tf });
    }
    if (d.gkb) {
      const i = +d.i, b = (c.inbox || [])[i]; if (!b) return;
      if (d.gkb === 'del') { c.inbox.splice(i, 1); saveState(); return render(); }
      if (d.gkb === 'wf') { await G.call('generate_workflow', Object.assign({ symbol: b.sym, timeframe: b.tf }, b.strat ? { strategy: b.strat } : {}), false); return render(); }
      return runShown('run_validation', { strategy: b.strat || (G.wf && G.wf.strat) || 'q4_qs_dualma', symbol: b.sym, timeframe: b.tf });
    }
    if (d.gkbot) { const b = (BgBotsUI.list || []).find((x) => x.id === d.id); if (!b) return; try { await J.post('/api/bots', Object.assign({}, b, { active: !b.active }), { timeout: 8000 }); await BgBotsUI.refresh(true); } catch (err) { toast('Bot: ' + esc(err.message), 'dn'); } return render(); }
    switch (d.gk) {
      case 'savecfg': {
        const p = $('#gkPreset').value; c.preset = PRESETS[p] ? p : 'local'; c.model = ($('#gkModel').value || '').replace(/[^A-Za-z0-9_.:\/-]/g, '').slice(0, 80);
        const k = ($('#gkKey').value || '').trim(); if (k) { if (c.preset === 'openrouter') c.orKey = k.slice(0, 200); else if (c.preset === 'xai') c.key = k.slice(0, 200); }
        saveState(); toast(live() ? 'Grok connected. The key is kept in the vault when “remember keys” is on, otherwise only for this session.' : 'Using the local quant engine', 'up'); return render();
      }
      case 'wfgen': { const sym = symOf($('#gkWfSym').value) || ST.sel; await G.call('generate_workflow', { symbol: sym, timeframe: $('#gkWfTf').value }, false); return render(); }
      case 'wfdeploy': if (G.wf) { G.pending.push({ id: NT.uid(), name: 'start_bot', args: { strategy: G.wf.strat, symbol: G.wf.sym, timeframe: G.wf.tf, capital: 1000 } }); render(); const f = $('#gkConsole'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth' }); } return;
      case 'wfval': if (G.wf) runShown('run_validation', { strategy: G.wf.strat, symbol: G.wf.sym, timeframe: G.wf.tf }); return;
      case 'wfcop': case 'sendwf': if (G.wf) G.toCopilot({ sym: G.wf.sym, tf: G.wf.tf, strat: G.wf.strat, note: 'Auto-workflow: ' + G.wf.nodes.map((n) => n.label).join(' → ') }); return;
      case 'opencop': return showTab('ai');
      case 'intelref': await G.loadIntel(true); return render();
      case 'shieldnow': try { const r = await J.post('/api/bots/shield', { pause: true, tighten: !!(G.intel && G.intel.cfg && G.intel.cfg.tighten) }, { timeout: 8000 }); toast(`🛡 Shielded ${+r.bots || 0} background bot(s) for 60 minutes`, 'acc'); await BgBotsUI.refresh(true); } catch (err) { toast('Shield: ' + esc(err.message), 'dn'); } return render();
      case 'savehooks': {
        const h = hooks(), dc = $('#gkDc').value.trim(), tg = $('#gkTg').value.trim(), tc = $('#gkTc').value.trim();
        if (dc && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,100}$/.test(dc)) return toast('That is not a Discord webhook URL', 'amb');
        if (tg && !/^\d{5,12}:[A-Za-z0-9_-]{30,50}$/.test(tg)) return toast('Telegram bot token doesn’t look right', 'amb');
        if (dc) h.discord = dc; if (tg) h.tgToken = tg; if (tc) h.tgChat = tc.slice(0, 40);
        saveState(); await G.pushHooks(); return render();
      }
      case 'testhooks': { const m = $('#gkHookMsg'); try { const r = await J.post('/api/alerts/test', {}, { timeout: 8000 }); if (m) m.textContent = r.ok ? 'Sent to ' + r.sent.join(' + ') + ' ✓' : 'Nothing configured yet'; } catch (err) { if (m) m.textContent = '⚠ ' + err.message; } return; }
      case 'pinecopy': { const p = $('#gkPine'); try { await navigator.clipboard.writeText(p ? p.textContent : ''); toast('Copied Pine Script', 'up'); } catch (err) { toast('Copy blocked: select the code and copy it manually.', 'amb'); } return; }
      case 'pinedl': { const id = d.id; if (NT.strategies[id]) download(id + '.pine', NT.Spec.toPine(NT.strategies[id].spec)); return; }
    }
  }
  async function onChange(e) {
    const t = e.target, d = t.dataset || {};
    if (t.id === 'gkPreset') { cfg().preset = PRESETS[t.value] ? t.value : 'local'; saveState(); return render(); }
    if (d.gkic) { try { const body = Object.assign({}, (G.intel && G.intel.cfg) || {}, { [d.gkic]: t.checked }); await J.post('/api/intel/config', body, { timeout: 6000 }); await G.loadIntel(true); } catch (err) { toast('Intel settings: ' + esc(err.message), 'dn'); } return render(); }
    if (d.gkn2 === 'bots') { cfg().notifyBots = t.checked; saveState(); return; }
    if (d.gkn2 === 'chart') { ST.settings.bgAlerts = t.checked; saveState(); if (t.checked) await Launcher.sync(true); else { try { await J.post('/api/alerts', { alerts: [] }); } catch (x) { /* ignore */ } Launcher.lastSync = ''; } }
  }
  G.mount = () => {
    const host = $('#gkHost'); if (!host || host._gk) return; host._gk = true;
    host.addEventListener('click', (e) => { onClick(e).catch((err) => toast('Grok: ' + esc(err.message || err), 'dn')); });
    host.addEventListener('change', (e) => { onChange(e).catch((err) => toast('Grok: ' + esc(err.message || err), 'dn')); });
    host.addEventListener('submit', (e) => { if (e.target.id === 'gkForm') { e.preventDefault(); const i = $('#gkIn'); const q = i.value; i.value = ''; G.ask(q); } });
  };
  G.start = () => {
    G.mount();
    setInterval(() => { if (!document.hidden && L().intel) G.loadIntel(true).then(() => { if (curTab === 'grok') render(); }); }, 180000);
    setTimeout(() => G.loadIntel(true), 4000);
    // after the vault unlocks, the webhooks it holds go back to the launcher (it may have restarted)
    if (typeof applySecrets === 'function') { const _a = applySecrets; applySecrets = function (sec) { const r = _a.apply(this, arguments); setTimeout(() => G.pushHooks(true), 500); return r; }; }
  };
  return G;
})();

/* ───────────── 3-agent AI Quant Copilot desk (inside the AI Copilot; Grok stays a separate tab) ───────────── */
const Desk = (() => {
  const D = {};
  const ctxIntel = (sym) => {
    const x = {};
    try { const f = Whale.forSym(sym, 60); if (f && Math.abs(f.net) > 5e6) x.whaleNet = f.net; } catch (e) { /* no flow data */ }
    if (isOnchain(sym) && typeof OC !== 'undefined') { const s = OC.stats[sym] || {}; x.pool = { liq: s.liq, buys24: s.buys24, sells24: s.sells24, flags: (OC.flags(sym) || []).map((f) => f[1]) }; }
    if (isStock(sym) && typeof SEC !== 'undefined') { try { x.insiderBuys = SEC.clusters(30).filter((c) => c.ticker === sym && c.insiders.size >= 2).length; } catch (e) { /* no filings */ } }
    if (Grok.intel) x.shield = P3.shield(Grok.intel.items).level;
    return x;
  };
  const leaks = () => P3.leaks(Journal.closed(Journal.entries || []), 10);
  D.run = async (sym, tf) => {
    await Grok.loadIntel();
    const c = await candlesFor(sym, tf, 300), p = px(sym) || c[c.length - 1].c;
    const R = P3.desk({ candles: c, price: p, intel: ctxIntel(sym), equity: ACC.equity(priceMap()), leaks: leaks(), canShort: false });
    if (!R.ok) return { txt: 'The desk needs at least 60 candles: try a higher timeframe.' };
    const reg = P3.regime(c), strat = reg.picks[0] || 'q4_qs_dualma', b = baseOf(sym), pl = R.plan, ic = { bullish: '🟢', bearish: '🔴', neutral: '⚪', supportive: '🟢', hostile: '🔴', GO: '✅', REDUCE: '🟠', 'NO-TRADE': '⛔' };
    const txt = `**3-Agent Quant Desk · ${b} ${tf}** · ${NT.fmtPrice(p)} · regime ${reg.regime}\n` + R.agents.map((a) => `\n**${ic[a.stance] || ''} ${a.name}: ${a.stance}**\n${a.points.map((x) => '- ' + x).join('\n')}`).join('\n') +
      `\n\n**Plan (${pl.verdict})**: ${pl.side} ${NT.fmtPrice(pl.entry)} · stop ${NT.fmtPrice(pl.sl)} · target ${NT.fmtPrice(pl.tp)} (2R)${pl.usd > 0 ? ` · size ${NT.fmtUSD(pl.usd, 0)}` : ''}\nSupport ${R.levels.sup.map(NT.fmtPrice).join(' · ') || '–'} · resistance ${R.levels.res.map(NT.fmtPrice).join(' · ') || '–'}\nPaper trading only, not financial advice.`;
    const lv = [pl.sl, pl.tp].concat(R.levels.sup.slice(0, 2), R.levels.res.slice(0, 2)).filter((v) => v > 0).map((v) => +v.toPrecision(8));
    const acts = [{ l: '📍 Plot Levels on Chart', c: `__p3 plot|${sym}|${tf}|${lv.join(',')}` }, { l: '🧪 Run 17-Test Backtest', c: `__p3 val|${strat}|${sym}|${tf}` }];
    if (pl.verdict !== 'NO-TRADE' && pl.side === 'buy') acts.push({ l: '🛒 Place Paper Order with SL/TP', c: `__p3 order|${sym}|${Math.round(pl.usd)}|${+pl.sl.toPrecision(8)}|${+pl.tp.toPrecision(8)}` });
    acts.push({ l: '⚡ Send Setup to Grok Tab', c: `__p3 grok|${sym}|${tf}|${pl.side}|${+pl.entry.toPrecision(8)}|${+pl.sl.toPrecision(8)}|${+pl.tp.toPrecision(8)}|${strat}` });
    return { txt, acts, plan: pl, regime: reg.regime, levels: R.levels };
  };
  D.leakReport = () => {
    const K = leaks(); if (K.n < 3) return { txt: K.note || 'Not enough closed trades yet.' };
    return { txt: `**Behavioral Leak & Mistake Detector** · last ${K.n} trades · discipline **${K.score}/100** · win rate ${K.winRate.toFixed(0)}%\n` + (K.leaks.length ? K.leaks.map((l) => `- ${l.sev === 'high' ? '🔴' : l.sev === 'med' ? '🟠' : '🟡'} **${l.title}**: ${l.detail}`).join('\n') : 'No leaks found. Keep doing what you are doing.'), acts: [{ l: '🩺 Full autopsy in Grok', c: '__tab grok' }] };
  };
  /* internal action cards: every field is re-validated here (buttons carry text, never code) */
  D.internal = (q) => {
    const has = (o, x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(o, x), parts = q.slice(5).split('|'), k = parts[0], ok = (s) => s && (isStock(s) || isOnchain(s) || Providers.ids.has(s)), num = (v) => { const x = +v; return Number.isFinite(x) && x > 0 ? x : null; };
    if (k === 'plot') {
      const [, sym, tf, l] = parts; if (!ok(sym)) return { txt: 'That action is no longer valid.' };
      const lv = String(l || '').split(',').map(num).filter(Boolean).slice(0, 8);
      showTab('markets'); if (ST.sel !== sym) selectSym(sym); if (has(NT.TF, tf) && ST.tf !== tf) { const tb = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === tf); if (tb) tb.click(); }
      setTimeout(() => { if (!chart) return; for (const p of lv) chart.addDrawing({ type: 'h', p }); ST.draw = ST.draw || {}; ST.draw[ST.sel] = chart.drawings.slice(); saveState(); chart.invalidate(); }, 300);
      return { txt: `📍 Plotted ${lv.length} level${lv.length === 1 ? '' : 's'} on the ${baseOf(sym)} chart (Ctrl+Z removes them).` };
    }
    if (k === 'val') { const [, id, sym, tf] = parts; if (!has(NT.strategies, id) || !ok(sym) || !has(NT.TF, tf)) return { txt: 'That action is no longer valid.' }; return Grok.call('run_validation', { strategy: id, symbol: sym, timeframe: tf }, false); }
    if (k === 'order') {
      const [, sym, u, s, t] = parts, usd = num(u), sl = num(s), tp = num(t), p = px(sym); if (!ok(sym) || !usd || !p) return { txt: 'That action is no longer valid (no live price).' };
      if (!(sl < p && tp > p)) return { txt: 'Price moved through the plan’s stop or target: run the desk again.' };
      const tr = ACC.buy(sym, p, Math.min(usd, ACC.cash), Date.now(), { reason: 'Copilot desk plan', src: 'copilot', slPx: sl, tpPx: tp });
      if (!tr) return { txt: 'Order not filled (check cash).' };
      tradeToast(tr, 'Copilot'); Feed.subscribe([sym]); saveState();
      return { txt: `🛒 Paper buy filled: ${NT.fmtUSD(tr.usd || usd)} of ${baseOf(sym)} @ ${NT.fmtPrice(tr.price)} · SL ${NT.fmtPrice(sl)} · TP ${NT.fmtPrice(tp)}.` };
    }
    if (k === 'grok') { const [, sym, tf, side, e, s, t, strat] = parts; if (!ok(sym)) return { txt: 'That action is no longer valid.' }; Grok.receive({ sym, tf, side, entry: e, sl: s, tp: t, strat, note: '3-agent desk plan', from: 'copilot' }); return { txt: '⚡ Setup sent to the Grok tab’s Copilot Bridge.', acts: [{ l: 'Open Grok tab', c: '__tab grok' }] }; }
    return null;
  };
  D.handle = async (q, base) => {
    const s = String(q || '').trim(), lq = s.toLowerCase();
    if (s.startsWith('__p3 ')) { const r = await D.internal(s); if (r) return r; }
    if (/^(show )?(me )?(my )?(behaviou?ral )?leaks?\b|\bshow my (behaviou?ral )?leaks\b|\bbehaviou?ral leaks?\b|\bleak detector\b/.test(lq)) return D.leakReport();
    if (/^(run (the )?)?((3|three)-?agent |quant )?desk\b|\b(3|three)-?agent desk\b|\bquant desk\b/.test(lq)) {
      const i = NT.parseIntent(s, new Set([...Providers.bases, ...STOCK_SET])), sym = symFor(i.sym) || ST.sel, tf = (/\b(1s|5s|15s|30s|1m|3m|5m|15m|30m|1h|2h|4h|1d)\b/.exec(lq) || [])[1] || (ST.tf && NT.TF[ST.tf] >= 60 ? ST.tf : '1h');
      if (!(isStock(sym) || isOnchain(sym) || Providers.ids.has(sym))) return { txt: `I can't find ${i.sym || 'that market'}.` };
      return D.run(sym, tf);
    }
    const r = await base(q);
    if (r && /^\*\*[^*]+\*\* — /.test(r.txt || '') && /Technical bias/.test(r.txt || '')) { const m = /^\*\*([^*]+)\*\*/.exec(r.txt); r.acts = (r.acts || []).slice(0, 3).concat([{ l: '🧠 3-agent desk', c: 'desk ' + baseOf(m[1]) }]); }
    return r;
  };
  return D;
})();
{ const prevHandle = aiHandle; aiHandle = (q) => Desk.handle(q, prevHandle); }
if (typeof window !== 'undefined' && typeof document !== 'undefined') Grok.start();
if (typeof TABS !== 'undefined') TABS.grok = { show: () => { Grok.mount(); Grok.render(); if (typeof BgBotsUI !== 'undefined' && BgBotsUI.on()) BgBotsUI.refresh(true).then(() => Grok.render()); Grok.loadIntel().then(() => Grok.render()); }, render: () => {} };
