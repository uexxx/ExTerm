/* ExTerm v15.3 UI: Quant Lab Pro inside the Lab tab. Progressive disclosure: the Lab nav gains one 🧬 pill; the panel
   shows a strategy picker, one backtest and a clickable equity curve; the eight institutional tools sit in collapsed
   accordions rendered only when opened. Heavy runs (Auto-Evolve, synthetic paths, crisis replays, validation) go to the
   backtest Web Worker. Promoted strategies tick in the Grok tab's dry-run shadow mode (balances are never touched).
   Security: every dynamic string reaches the DOM through esc(), listeners are attached in JS (strict CSP, no inline
   handlers), shadow packages are re-validated on load. Pure maths lives in v153core.js (V153). */
const V153UI = (() => {
  const U = { base: null, ev: null, rules: [], imp: [], params: null, filters: null, grade: null, acct: '50k' };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const cfg = () => { const c = ST.v153 && typeof ST.v153 === 'object' ? ST.v153 : (ST.v153 = {}); if (!['1h', '4h', '1d'].includes(c.tf)) c.tf = '1h'; if (!Array.isArray(c.shadow)) c.shadow = []; return c; };
  const strats = () => Object.entries(NT.strategies).filter(([, S]) => S && !S.liveOnly && typeof S.prepare === 'function').map(([id, S]) => [id, String(S.name || id).replace(/^★ /, '')]).sort((a, b) => a[1].localeCompare(b[1]));
  const curStrat = () => { const c = cfg(); if (typeof c.strat !== 'string' || !own(NT.strategies, c.strat) || NT.strategies[c.strat].liveOnly) c.strat = own(NT.strategies, 'donchian') ? 'donchian' : strats()[0][0]; return c.strat; };
  const sel = () => (!ST.sel || (typeof isOnchain === 'function' && isOnchain(ST.sel)) ? 'BTC-USD' : ST.sel);
  const pct = (x) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+' : '') + (+x).toFixed(1) + '%');
  const cls = (x) => (x >= 0 ? 'up' : 'dn');
  const kpis = (rows) => `<div class="v151-kpis">${rows.map(([k, v, c]) => `<div><span class="k">${esc(k)}</span><b class="${c || ''}">${esc(v)}</b></div>`).join('')}</div>`;
  const note = (t, c = '') => `<div class="note ${c}">${esc(t)}</div>`;
  const fee = () => ({ fee: ((ST.settings && ST.settings.fee) || 0.1) / 100, slip: ((ST.settings && ST.settings.slip) || 0.05) / 100 });
  const pdiff = (id, p) => { const d = NT.defaultParams(id); return Object.entries(p || {}).filter(([k, v]) => d[k] !== v).map(([k, v]) => `${k}=${v}`).join(', ') || 'defaults'; };
  const fdesc = (f) => Object.entries(f || {}).filter(([, v]) => v).map(([k, v]) => ({ trendEma: `EMA${v} trend`, atrStop: `${v}×ATR stop`, cooldown: `${v}-bar cooldown`, timeStop: `${v}-bar time stop` }[k] || '')).filter(Boolean).join(', ') || 'none';
  const line = (series, o = {}) => {
    const w = o.w || 600, h = o.h || 140, all = series.flatMap((s) => s.filter(isFinite)); if (!all.length) return '';
    const lo = Math.min(...all), hi = Math.max(...all), d = hi - lo || 1, cols = o.cols || ['var(--acc)', 'var(--up)', '#38bdf8', 'var(--amber)', 'var(--dn)'];
    const X = (i, n) => ((i / Math.max(1, n - 1)) * w).toFixed(1), Y = (v) => (h - ((v - lo) / d) * (h - 8) - 4).toFixed(1);
    const pts = (o.marks || []).map((m) => `<circle cx="${X(m.i, series[0].length)}" cy="${Y(series[0][m.i])}" r="6" fill="${m.c}" stroke="var(--bg)" stroke-width="2" data-pt="${m.i}" tabindex="0" role="button" aria-label="${esc(m.l)}"><title>${esc(m.l)}</title></circle>`).join('');
    return `<svg class="v152-svg ${o.cls || ''}" ${o.id ? `id="${o.id}"` : ''} viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" ${o.label ? `role="img" aria-label="${esc(o.label)}"` : 'aria-hidden="true"'}>${series.map((s, k) => `<polyline fill="none" stroke="${cols[k % cols.length]}" stroke-width="1.7" vector-effect="non-scaling-stroke" points="${s.map((v, i) => `${X(i, s.length)},${Y(v)}`).join(' ')}"/>`).join('')}${pts}</svg>`;
  };
  const prog = (el) => (d) => { if (el && d && d.total) el.innerHTML = `<div class="prog"><i style="width:${Math.round((d.prog / d.total) * 100)}%"></i></div>${note(d.phase || 'Working…')}`; };
  /* worker first; main-thread fallback when workers are unavailable */
  const work = (msg, el) => {
    if (el) el.innerHTML = note('Running in a background Web Worker…', 'shimmer');
    const w = typeof BTW !== 'undefined' ? BTW.get() : null; if (w) return BTW.run(msg, prog(el));
    return new Promise((res, rej) => setTimeout(() => { try { const S = NT.strategies[msg.strat];
      res(msg.type === 'evolve' ? { ev: V153.evolve(msg.candles, S, msg.params, msg.o) } : msg.type === 'synth' ? { syn: V153.synthTest(msg.candles, S, msg.params, msg.o) } : msg.type === 'crisis' ? { crises: Object.keys(V153.CRISES).map((k) => V153.crisisTest(msg.candles, S, msg.params, k, msg.o)) } : { v: NT.validate(msg.candles, S, msg.params, msg.o) });
    } catch (e) { rej(e); } }, 20));
  };

  /* ══ baseline backtest + clickable equity curve (feature 7 entry point) ══ */
  const A = {}, R = {};
  const need = async () => { const b = U.base; if (b && b.id === curStrat() && b.sym === sel() && b.tf === cfg().tf) return b; await A.base(); return U.base; };
  A.base = async () => {
    const c = cfg(), id = curStrat(), out = $('#q153Base'), sym = sel(), sec = NT.TF[c.tf]; if (out) out.innerHTML = note('Loading ' + baseOf(sym) + ' ' + c.tf + ' history…', 'shimmer');
    let cs = []; try { cs = await History.get(sym, sec, 1000); } catch (e) { /* offline */ }
    if (!cs || cs.length < 300) { U.base = null; if (out) out.innerHTML = note(`Need 300+ ${c.tf} candles for ${baseOf(sym)} (have ${cs ? cs.length : 0}). Try another market or timeframe.`, 'dn'); return; }
    const p = U.params || NT.defaultParams(id), f = U.filters || {}, r = NT.backtest(cs, NT.strategies[id], p, Object.assign({ cash: 10000, tfSec: sec }, fee(), V153.filtO(f)));
    const pairs = V153.pairs(r.trades);
    U.base = { id, sym, tf: c.tf, sec, cs, p, f, r, pairs, rows: V153.featureRows(cs, pairs), grade: U.grade };
    U.rules = []; U.imp = []; renderBase(); refreshOpen();
  };
  const ddMarks = (eq) => { let pk = 0, best = 0, pi = 0, ti = 0; for (let i = 0; i < eq.length; i++) { if (eq[i] > eq[pk]) pk = i; const d = eq[pk] ? 1 - eq[i] / eq[pk] : 0; if (d > best) { best = d; pi = pk; ti = i; } } let top = 0; eq.forEach((v, i) => { if (v > eq[top]) top = i; }); return [{ i: pi, c: 'var(--amber)', l: 'Peak before the deepest drawdown: inspect this trade' }, { i: ti, c: 'var(--dn)', l: `Drawdown dip (−${(best * 100).toFixed(1)}%): inspect this trade` }, { i: top, c: 'var(--up)', l: 'Equity high: inspect this trade' }].filter((m, k, a) => a.findIndex((x) => x.i === m.i) === k); };
  const renderBase = () => {
    const b = U.base, out = $('#q153Base'); if (!out || !b) return; const s = b.r.stats;
    out.innerHTML = kpis([['Return', pct(s.ret), cls(s.ret)], ['Max DD', '-' + s.maxDD.toFixed(1) + '%'], ['Sharpe', s.sharpe.toFixed(2)], ['Trades', s.closed], ['Params', pdiff(b.id, b.p)], ['Filters', fdesc(b.f)], ['Grade', b.grade || 'not validated', b.grade ? 'up' : '']])
      + line([b.r.eq, b.r.bh], { id: 'q153Curve', cls: 'q153-curve', marks: ddMarks(b.r.eq), label: 'Equity curve (strategy vs buy & hold). Click any point to inspect the nearest trade.' })
      + note(`Equity vs buy & hold on ${baseOf(b.sym)} ${b.tf}. Click any point, the drawdown dip or a peak to open that trade on its candles.`);
  };
  const curveAt = (e) => { const b = U.base; if (!b) return; const mk = e.target.closest('[data-pt]'), svg = e.target.closest('svg'); let i; if (mk) i = +mk.dataset.pt; else { const r = svg.getBoundingClientRect(); i = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (b.r.eq.length - 1)); } i = Math.max(0, Math.min(b.r.t.length - 1, i)); const k = V153.nearestTrade(b.pairs, b.r.t[i]); if (k < 0) { toast('No closed trades to inspect yet', 'amb'); return; } openTrade(k); };

  /* ══ 7. trade inspector ══ */
  const candles = (ins) => {
    const B = ins.bars, w = 600, h = 220, n = B.length, lo = Math.min(...B.map((x) => x.l)), hi = Math.max(...B.map((x) => x.h)), d = hi - lo || 1, bw = w / n, Y = (v) => (h - ((v - lo) / d) * (h - 24) - 12).toFixed(1), X = (i) => (i * bw + bw / 2).toFixed(1);
    const body = B.map((x, i) => { const up = x.c >= x.o, col = up ? 'var(--up)' : 'var(--dn)'; return `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(x.h)}" y2="${Y(x.l)}" stroke="${col}"/><rect x="${(i * bw + bw * 0.15).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" y="${Math.min(Y(x.o), Y(x.c))}" height="${Math.max(1, Math.abs(Y(x.o) - Y(x.c))).toFixed(1)}" fill="${col}"/>`; }).join('');
    const pin = (i, p, col, lab, dn) => `<line x1="${X(i)}" x2="${X(i)}" y1="0" y2="${h}" stroke="${col}" stroke-dasharray="3 3"/><line x1="0" x2="${w}" y1="${Y(p)}" y2="${Y(p)}" stroke="${col}" stroke-width=".6" stroke-dasharray="2 4"/><text x="${X(i)}" y="${dn ? h - 2 : 10}" fill="${col}" font-size="11" text-anchor="middle">${esc(lab)}</text>`;
    return `<svg class="q153-cnd" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Candles around the trade with entry and exit pins">${body}${pin(ins.entryAt, ins.entry, 'var(--up)', '▲ entry')}${pin(ins.exitAt, ins.exit, 'var(--dn)', '▼ exit', true)}</svg>`;
  };
  const openTrade = (k) => {
    const b = U.base; if (!b) return; const p = b.pairs[k], ins = V153.inspect(b.cs, p); if (!ins) { toast('Trade is outside the loaded history', 'amb'); return; }
    const f = ins.feat || {}, ov = p2modal(`🔍 Trade ${k + 1} of ${b.pairs.length} · ${baseOf(b.sym)} ${b.tf}`, candles(ins) + kpis([['Return', pct(ins.ret), cls(ins.ret)], ['MFE', pct(ins.mfe), 'up'], ['MAE', pct(ins.mae), 'dn'], ['Held', ins.held + ' bars'], ['Entry', NT.fmtPrice(ins.entry)], ['Exit', NT.fmtPrice(ins.exit)]])
      + `<div class="note">Indicator snapshot at the signal bar: RSI ${esc(f.rsi == null ? '–' : f.rsi)} · RVOL ${esc(f.rvol == null ? '–' : f.rvol + '×')} · ATR percentile ${esc(f.atrp == null ? '–' : Math.round(f.atrp * 100) + '%')} · VWAP distance ${esc(f.vwap == null ? '–' : f.vwap + '%')} · ${esc(V153.SESS(f.hour || 0))} session (${esc(f.hour)}:00 UTC)</div>
      <div class="row v151-row"><button type="button" class="btn sm" data-tr="${k - 1}" ${k ? '' : 'disabled'}>◀ Previous</button><button type="button" class="btn sm" data-tr="${k + 1}" ${k + 1 < b.pairs.length ? '' : 'disabled'}>Next ▶</button><button type="button" class="btn sm pri" data-jump="${esc(p.entryT)}">Jump to this candle on the chart</button></div>`, 'q153Insp');
    ov.addEventListener('click', (e) => { const t = e.target.closest('[data-tr]'); if (t && !t.disabled) { openTrade(+t.dataset.tr); return; } const j = e.target.closest('[data-jump]'); if (j) { ov.remove(); jump(+j.dataset.jump); } });
  };
  const jump = (t) => {
    const b = U.base; if (!b) return; showTab('markets'); const m = modeOf(b.sym); if (m !== ST.mode) setMode(m, b.sym); else if (ST.sel !== b.sym) selectSym(b.sym);
    const go = (tries) => { const D = typeof chart !== 'undefined' && chart ? chart.data || [] : [], i = D.findIndex((x) => x.t >= t); if (i >= 0 && Math.abs(D[i].t - t) <= (chart.tfSec || b.sec)) { chart.view = { bars: chart.view.bars, off: Math.max(0, D.length - 1 - i - Math.floor(chart.view.bars / 3)) }; chart.invalidate(); toast('Jumped to the trade entry candle'); } else if (tries > 0) setTimeout(() => go(tries - 1), 600); else toast(`Switch the chart to ${esc(b.tf)} to see this candle`, 'amb'); };
    setTimeout(() => go(4), 400);
  };
  R.inspect = () => { const b = U.base; if (!b || !b.pairs.length) return note('Run a backtest with closed trades first.'); return note('Click the equity curve above, or pick a trade:') + `<div class="q153-scroll q153-trades"><table class="v152-t"><tr><th>#</th><th>Entry</th><th>Return</th><th></th></tr>${b.pairs.slice(-60).map((p, j) => { const k = b.pairs.length - Math.min(60, b.pairs.length) + j; return `<tr><td>${k + 1}</td><td class="mono">${esc(new Date(p.entryT * 1000).toISOString().slice(0, 16).replace('T', ' '))}</td><td class="${cls(p.ret)}">${esc(pct(p.ret * 100))}</td><td><button type="button" class="btn xs" data-q="trade" data-k="${k}">Inspect</button></td></tr>`; }).join('')}</table></div>`; };
  A.trade = (el) => openTrade(+el.dataset.k);

  /* ══ 1. Auto-Evolve ══ */
  R.evolve = () => `<div class="v151-row"><label class="note">Generations <select class="in xs" id="q153Gen">${[4, 6, 10].map((v) => `<option ${v === 6 ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="note">Population <select class="in xs" id="q153Pop">${[10, 14, 24].map((v) => `<option ${v === 14 ? 'selected' : ''}>${v}</option>`).join('')}</select></label><button type="button" class="btn sm pri" data-q="evolve">🧬 Auto-Evolve</button></div><div id="q153EvOut">${U.ev ? '' : note('Mutates parameters and robustness filters (trend EMA, ATR stop, cooldown, time stop) across generations in a background Web Worker. Survivors are ranked by out-of-sample Sharpe + Calmar on the newest 50% of history; any mutation that loses money in either walk-forward window, or grades D/F in the 17-test Validation Lab, is rejected.')}</div>`;
  A.evolve = async () => {
    const b = await need(), out = $('#q153EvOut'); if (!b || !out) return;
    try { const r = await work({ type: 'evolve', strat: b.id, candles: b.cs, params: NT.defaultParams(b.id), o: Object.assign({ gens: +$('#q153Gen').value || 6, pop: +$('#q153Pop').value || 14, tfSec: b.sec }, fee()) }, out); U.ev = Object.assign(r.ev, { id: b.id, sym: b.sym, tf: b.tf }); renderEv(); }
    catch (e) { out.innerHTML = note('Auto-Evolve failed: ' + (e.message || e), 'dn'); }
  };
  const renderEv = () => {
    const E = U.ev, out = $('#q153EvOut'); if (!E || !out) return; const row = (s, lab, k) => `<tr><td>${esc(lab)}</td><td class="mono">${esc(pdiff(E.id, s.p))}</td><td>${esc(fdesc(s.f))}</td><td>${s.wfPass ? esc(s.sharpe) : '–'}</td><td>${s.wfPass ? esc(s.calmar) : '–'}</td><td class="${cls(s.oosRet)}">${esc(pct(s.oosRet))}</td><td>${esc(s.maxDD == null ? '–' : '-' + s.maxDD + '%')}</td><td class="${s.wfPass ? 'up' : 'dn'}">${s.wf ? esc(s.wf.map(pct).join(' / ')) : '–'}</td><td>${esc(s.grade || (s.wfPass ? '–' : 'rejected'))}</td><td>${k == null ? '' : `<button type="button" class="btn xs" data-q="use" data-k="${k}">Use</button> <button type="button" class="btn xs pri" data-q="promoteEv" data-k="${k}">👻 ${esc(T('q153.promote'))}</button>`}</td></tr>`;
    out.innerHTML = kpis([['Evaluated', E.evaluated], ['Survivors', E.survivors.length, E.survivors.length ? 'up' : 'dn'], ['Rejected · walk-forward', E.rejected.wf], ['Rejected · 17-test lab', E.rejected.val], ['Best score by generation', E.gens.map((g) => (g.best == null ? '×' : g.best.toFixed(1))).join(' → ')]])
      + `<div class="q153-scroll"><table class="v152-t"><tr><th></th><th>Parameters</th><th>Filters</th><th>OOS Sharpe</th><th>Calmar</th><th>OOS return</th><th>Max DD</th><th>Walk-forward</th><th>Grade</th><th></th></tr>${row(E.base, 'Baseline')}${E.survivors.map((s, k) => row(s, '#' + (k + 1), k)).join('')}</table></div>`
      + (E.survivors.length ? '' : note('No mutation survived the walk-forward and 17-test gates on this market. That is the honest answer: the strategy shows no robust edge here.', 'dn'));
  };
  A.use = (el) => { const s = U.ev && U.ev.survivors[+el.dataset.k]; if (!s) return; U.params = s.p; U.filters = s.f; U.grade = s.grade; A.base(); toast(`Using survivor #${+el.dataset.k + 1} (grade ${esc(s.grade)}) across the Quant Lab`); };

  /* ══ 2. fragility break-point ══ */
  R.frag = () => `<div class="v151-row"><label class="note">Order size $ <input class="in xs" id="q153Usd" type="number" min="100" step="100" value="10000"></label><label class="note">Max bar participation % <input class="in xs" id="q153Cap" type="number" min="1" max="100" value="10"></label><label class="note">Base spread bps <input class="in xs" id="q153Bps" type="number" min="0.5" max="200" step="0.5" value="5"></label><button type="button" class="btn sm pri" data-q="frag">💧 Stress liquidity</button></div><div id="q153FrOut">${note('Widens the bid-ask spread with each trade\'s ATR regime, adds square-root market impact for your size versus bar dollar volume, and fills partially above the participation cap. The meter shows the friction multiplier where the strategy flips unprofitable.')}</div>`;
  A.frag = async () => {
    const b = await need(), out = $('#q153FrOut'); if (!b || !out) return; if (!b.pairs.length) { out.innerHTML = note('No closed trades to stress.', 'dn'); return; }
    const num = (id, d, lo, hi) => Math.min(hi, Math.max(lo, +($('#' + id) || {}).value || d)), sb = num('q153Bps', 5, 0.5, 200);
    const fr = V153.fragility(V153.stressRows(b.cs, b.pairs, { usd: num('q153Usd', 10000, 100, 1e9), cap: num('q153Cap', 10, 1, 100) / 100 }), { spreadBps: sb }), bp = fr.breakPoint, pos = bp === Infinity ? 100 : Math.min(100, (bp / 20) * 100);
    out.innerHTML = `<div class="q153-meter" role="meter" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${esc(Math.min(20, bp === Infinity ? 20 : bp))}" aria-label="Fragility break-point"><i style="left:${pos.toFixed(1)}%"></i></div><div class="q153-scale"><span>0×</span><span>2×</span><span>5×</span><span>10×</span><span>20×+</span></div>`
      + kpis([['Fragility Break-Point', bp === Infinity ? '> 200×' : bp + '×', bp >= 5 ? 'up' : bp >= 2 ? '' : 'dn'], ['Spread at break', bp === Infinity ? '–' : fr.spreadAtBreakBps + ' bps'], ['Return · no extra friction', pct(fr.base), cls(fr.base)], ['Return · 1× stress', pct(fr.at1), cls(fr.at1)], ['Partial fills', fr.partial + ' / ' + b.pairs.length]])
      + note('Verdict: ' + fr.verdict, bp >= 5 ? 'up' : bp >= 2 ? '' : 'dn') + `<table class="v152-t"><tr><th>Friction ×</th>${fr.curve.map(([m]) => `<th>${esc(m)}</th>`).join('')}</tr><tr><td>Return</td>${fr.curve.map(([, r]) => `<td class="${cls(r)}">${esc(pct(r))}</td>`).join('')}</tr></table>`;
  };

  /* ══ 3. crisis time machine + regime attribution ══ */
  const attrTable = (at) => `<table class="v152-t"><tr><th>Regime</th><th>Bars</th><th>Strategy</th><th>Max DD</th><th>Buy &amp; hold</th><th>PnL $</th></tr>${Object.values(at).map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.bars)}</td><td class="${cls(x.ret)}">${esc(pct(x.ret))}</td><td>${esc('-' + x.maxDD + '%')}</td><td class="${cls(x.bhRet)}">${esc(pct(x.bhRet))}</td><td class="${cls(x.pnl)}">${esc(NT.fmtUSD(x.pnl, 0))}</td></tr>`).join('')}</table>`;
  R.crisis = () => `<div class="v151-row">${Object.values(V153.CRISES).map((x) => `<span class="v152-tk"><b>${esc(x.name)}</b> <span class="note">${esc(x.when)}</span></span>`).join('')}<button type="button" class="btn sm pri" data-q="crisis">⏳ Replay all crises</button></div><div id="q153CrOut">${U.base ? '<b>Regime attribution on real history</b>' + attrTable(V153.attribute(U.base.cs, U.base.r.eq, U.base.r.from)) : note('Run a backtest first.')}</div>`;
  A.crisis = async () => {
    const b = await need(), out = $('#q153CrOut'); if (!b || !out) return;
    try { const r = await work({ type: 'crisis', strat: b.id, candles: b.cs, params: b.p, o: { tfSec: b.sec, filters: b.f } }, out); const C = (r.crises || []).filter(Boolean);
      out.innerHTML = `<div class="q153-scroll"><table class="v152-t"><tr><th>Crisis replay</th><th>Window</th><th>Strategy</th><th>Max DD</th><th>Buy &amp; hold</th><th>B&amp;H DD</th><th>Trades</th></tr>${C.map((x) => `<tr><td>${esc(x.name)}</td><td class="note">${esc(x.when)}</td><td class="${cls(x.ret)}">${esc(pct(x.ret))}</td><td>${esc('-' + x.maxDD.toFixed(1) + '%')}</td><td class="${cls(x.bhRet)}">${esc(pct(x.bhRet))}</td><td>${esc('-' + x.bhDD + '%')}</td><td>${esc(x.trades)}</td></tr>`).join('')}</table></div>`
        + line(C.map((x) => x.eq), { h: 110, label: 'Equity through each crisis replay' }) + note('Calibrated replays: each crisis\' depth, duration and volatility are rebuilt from this market\'s own returns (works offline, no historical tape needed). Lines: ' + C.map((x) => x.name).join(' · '))
        + '<b>Regime attribution on real history</b>' + attrTable(V153.attribute(b.cs, b.r.eq, b.r.from));
    } catch (e) { out.innerHTML = note('Crisis replay failed: ' + (e.message || e), 'dn'); }
  };

  /* ══ 4. feature importance + kill-switch filters ══ */
  R.kill = () => `<div class="v151-row"><button type="button" class="btn sm pri" data-q="kill">🎯 Find the top 3 trade drivers</button></div><div id="q153KillOut">${note('Scores every trade\'s entry (session, RVOL, ATR percentile, RSI, VWAP distance) and ranks what separates winners from losers. Toggle a kill-switch filter to recalculate the equity curve instantly.')}</div>`;
  A.kill = async () => { const b = await need(), out = $('#q153KillOut'); if (!b || !out) return; U.imp = V153.importance(b.rows); U.rules = []; renderKill(); };
  const renderKill = () => {
    const b = U.base, out = $('#q153KillOut'); if (!b || !out) return; if (!U.imp.length) { out.innerHTML = note(`Need 8+ trades with clear drivers (have ${b.rows.length}).`, 'dn'); return; }
    const kept = V153.applyRules(b.rows, U.rules), e0 = V153.curve(b.rows.map((r) => r.ret)), e1 = V153.curve(kept.map((r) => r.ret)), wr = (a) => (a.length ? Math.round((a.filter((r) => r.win).length / a.length) * 100) + '%' : '–');
    out.innerHTML = U.imp.map((x, i) => `<label class="chk q153-drv"><input type="checkbox" data-rule="${i}" ${U.rules.includes(x.rule) ? 'checked' : ''}> <b>${esc(x.label)}</b> · importance ${esc(Math.round(x.importance * 100))}% · ${esc(x.desc)} <span class="${cls(x.gain)}">(${esc(pct(x.gain))} alone)</span></label>`).join('')
      + kpis([['Trades kept', kept.length + ' / ' + b.rows.length], ['Return before', pct((e0[e0.length - 1] - 1) * 100), cls(e0[e0.length - 1] - 1)], ['Return after', pct((e1[e1.length - 1] - 1) * 100), cls(e1[e1.length - 1] - 1)], ['Win rate', wr(b.rows) + ' → ' + wr(kept)], ['Max DD', '-' + (V153.maxDD(e0) * 100).toFixed(1) + '% → -' + (V153.maxDD(e1) * 100).toFixed(1) + '%']])
      + line([e0, e1], { h: 110, label: 'Trade-by-trade equity before (accent) and after (green) the kill-switch filters' }) + note('Filters are found in-sample: confirm them with Auto-Evolve or the Validation Lab before trusting them.');
  };

  /* ══ 5. dynamic sizing + prop-firm odds ══ */
  R.sizing = () => `<div class="v151-row"><div class="seg" id="q153Acct">${Object.keys(V153.PROP).map((k) => `<button type="button" data-acct="${k}" class="${U.acct === k ? 'on' : ''}">$${esc(k)}</button>`).join('')}</div><button type="button" class="btn sm pri" data-q="sizing">⚖ Compare sizing &amp; prop odds</button></div><div id="q153SzOut">${note('Replays the same trade list under four sizing models, then runs 2,000 seeded Monte Carlo evaluations per model against a typical $50k / $100k prop-firm rulebook (profit target, daily loss limit, trailing drawdown, 30 trading days).')}</div>`;
  A.sizing = async () => {
    const b = await need(), out = $('#q153SzOut'); if (!b || !out) return; const rows = U.rules.length ? V153.applyRules(b.rows, U.rules) : b.rows; if (rows.length < 5) { out.innerHTML = note('Need 5+ closed trades.', 'dn'); return; }
    const sz = V153.sizing(rows), R0 = V153.PROP[U.acct], odds = Object.keys(V153.SIZERS).map((k) => V153.propOdds(rows, k, U.acct));
    out.innerHTML = `<div class="q153-scroll"><table class="v152-t"><tr><th>Sizing model</th><th>Return</th><th>Max DD</th><th>Pass $${esc(U.acct)}</th><th>Daily-loss breach</th><th>Trailing-DD breach</th><th>Out of time</th></tr>${sz.map((x, i) => `<tr><td>${esc(x.name)}</td><td class="${cls(x.ret)}">${esc(pct(x.ret))}</td><td>${esc('-' + x.maxDD + '%')}</td><td class="${odds[i].pass >= 50 ? 'up' : 'dn'}"><b>${esc(odds[i].pass)}%</b></td><td>${esc(odds[i].daily)}%</td><td>${esc(odds[i].trail)}%</td><td>${esc(odds[i].timeout)}%</td></tr>`).join('')}</table></div>`
      + line(sz.map((x) => x.eq), { h: 110, label: 'Equity per sizing model' }) + note(`Rules: target ${NT.fmtUSD(R0.target, 0)}, daily loss ${NT.fmtUSD(R0.daily, 0)}, trailing drawdown ${NT.fmtUSD(R0.trail, 0)} on ${NT.fmtUSD(R0.size, 0)}; ~${odds[0].tradesPerDay} trades/day${U.rules.length ? '; kill-switch filters applied' : ''}. Typical evaluation rules: check your firm's exact numbers.`);
  };

  /* ══ 6. synthetic paths ══ */
  R.synth = () => `<div class="v151-row"><label class="note">Paths <select class="in xs" id="q153Paths">${[200, 500, 1000, 2000].map((v) => `<option ${v === 500 ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="note">Adversarial noise <select class="in xs" id="q153Noise">${[[0, 'off'], [0.25, 'light'], [0.5, 'medium'], [1, 'heavy']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><button type="button" class="btn sm pri" data-q="synth">🌀 Generate &amp; test</button></div><div id="q153SyOut">${note('Stationary block bootstrap: real volatility clusters and fat tails are kept inside each block while the order of history is reshuffled, so the strategy has to prove its edge on market physics instead of memorised dates.')}</div>`;
  A.synth = async () => {
    const b = await need(), out = $('#q153SyOut'); if (!b || !out) return;
    try { const r = await work({ type: 'synth', strat: b.id, candles: b.cs.slice(-800), params: b.p, o: { paths: +$('#q153Paths').value || 500, noise: +$('#q153Noise').value || 0, tfSec: b.sec, filters: b.f } }, out), s = r.syn;
      const H = s.hist, lo = Math.min(...H, s.real), hi = Math.max(...H, s.real), nb = 24, bins = new Array(nb).fill(0); for (const x of H) bins[Math.min(nb - 1, Math.floor(((x - lo) / (hi - lo || 1)) * nb))]++; const mx = Math.max(...bins), rx = ((s.real - lo) / (hi - lo || 1)) * 600;
      out.innerHTML = kpis([['Real history', pct(s.real), cls(s.real)], ['Synthetic median', pct(s.p50), cls(s.p50)], ['5th – 95th pct', pct(s.p5) + ' … ' + pct(s.p95)], ['Profitable paths', s.profitable + '%', s.profitable >= 60 ? 'up' : s.profitable >= 40 ? '' : 'dn'], ['Paths ≥ real', s.beatReal + '%'], ['Median max DD', '-' + s.ddP50 + '%']])
        + `<svg class="v152-svg" viewBox="0 0 600 110" preserveAspectRatio="none" role="img" aria-label="Histogram of synthetic-path returns; the line marks real history">${bins.map((v, i) => `<rect x="${(i * 600) / nb + 1}" width="${600 / nb - 2}" y="${110 - (v / (mx || 1)) * 100}" height="${(v / (mx || 1)) * 100}" fill="var(--acc)" opacity=".75"/>`).join('')}<line x1="${rx.toFixed(1)}" x2="${rx.toFixed(1)}" y1="0" y2="110" stroke="var(--amber)" stroke-width="2"/></svg>`
        + `<table class="v152-t"><tr><th>Market physics</th><th>Volatility / bar</th><th>Excess kurtosis (fat tails)</th><th>Vol clustering</th></tr><tr><td>Real</td><td>${esc(s.physics.real.vol)}</td><td>${esc(s.physics.real.kurt)}</td><td>${esc(s.physics.real.clust)}</td></tr><tr><td>Synthetic (avg)</td><td>${esc(s.physics.synth.vol)}</td><td>${esc(s.physics.synth.kurt)}</td><td>${esc(s.physics.synth.clust)}</td></tr></table>`
        + note('Verdict: ' + s.verdict + ` (${s.paths} paths)`, s.profitable >= 60 ? 'up' : s.profitable >= 40 ? '' : 'dn');
    } catch (e) { out.innerHTML = note('Synthetic test failed: ' + (e.message || e), 'dn'); }
  };

  /* ══ 8. promote to the Grok shadow bot ══ */
  R.promote = () => { const b = U.base, c = cfg(), ok = b && /^[ABC]$/.test(b.grade || '');
    return (b ? kpis([['Strategy', NT.strategies[b.id].name || b.id], ['Market', baseOf(b.sym) + ' ' + b.tf], ['Params', pdiff(b.id, b.p)], ['Filters', fdesc(b.f)], ['Validation', b.grade ? 'grade ' + b.grade : 'not validated yet', ok ? 'up' : 'dn']]) : note('Run a backtest first.'))
      + `<div class="v151-row"><label class="note">$ per shadow trade <input class="in xs" id="q153SUsd" type="number" min="10" max="1000000" value="1000"></label><label class="note">Max daily loss % <input class="in xs" id="q153SDl" type="number" min="0.5" max="20" step="0.5" value="3"></label><button type="button" class="btn sm" data-q="validate" ${b ? '' : 'disabled'}>Run 17-test validation</button><button type="button" class="btn sm pri" data-q="promote" ${ok ? '' : 'disabled'} title="${ok ? '' : 'Validate first: only grade A–C strategies can be promoted'}">👻 ${esc(T('q153.promote'))}</button></div><div id="q153PrOut"></div>`
      + (c.shadow.length ? `<b>Active shadow bots</b>${shadowList()}` : note('Promoted strategies run in the Grok tab\'s dry-run shadow mode on live ticks: hypothetical fills only, zero capital at risk.'));
  };
  A.validate = async () => { const b = await need(), out = $('#q153PrOut'); if (!b || !out) return; try { const r = await work({ type: 'validate', strat: b.id, candles: b.cs, params: b.p, o: Object.assign({ tfSec: b.sec }, V153.filtO(b.f)) }, out); b.grade = U.grade = r.v.grade; refreshOpen(); renderBase(); toast(`17-test Validation Lab: grade ${esc(r.v.grade)} (${esc(r.v.score)}/100)`, /^[ABC]$/.test(r.v.grade) ? 'up' : 'amb'); } catch (e) { out.innerHTML = note('Validation failed: ' + (e.message || e), 'dn'); } };
  const promote = (s) => {
    const c = cfg(), pkg = V153.shadowPackage({ id: s.id, params: s.p, filters: s.f, sym: s.sym, tf: s.tf, grade: s.grade, usd: +($('#q153SUsd') || {}).value || 1000, maxDailyLoss: +($('#q153SDl') || {}).value || 3 });
    if (!pkg || !/^[ABC]$/.test(pkg.grade || '')) { toast('Only validated strategies (grade A–C) can be promoted', 'amb'); return; }
    pkg.inPos = false; pkg.fills = 0; pkg.pnl = 0; c.shadow = [pkg].concat(c.shadow.filter((x) => !(x.id === pkg.id && x.sym === pkg.sym && x.tf === pkg.tf))).slice(0, 5); saveState();
    toast(`👻 ${esc(pkg.name)} on ${esc(baseOf(pkg.sym))} ${esc(pkg.tf)} promoted to the Grok shadow bot: live forward ticks, zero capital at risk`, 'up', 7000); refreshOpen(); mountGrok(); setTimeout(shadowTick, 300);
  };
  A.promote = () => { const b = U.base; if (b) promote({ id: b.id, p: b.p, f: b.f, sym: b.sym, tf: b.tf, grade: b.grade }); };
  A.promoteEv = (el) => { const E = U.ev, s = E && E.survivors[+el.dataset.k]; if (s) promote({ id: E.id, p: s.p, f: s.f, sym: E.sym, tf: E.tf, grade: s.grade }); };
  A.unshadow = (el) => { const c = cfg(); c.shadow.splice(+el.dataset.k, 1); saveState(); refreshOpen(); renderGrok(); };
  const shadowList = () => `<table class="v152-t"><tr><th>Bot</th><th>Market</th><th>Grade</th><th>Position</th><th>Fills</th><th>Realised</th><th></th></tr>${cfg().shadow.map((k, i) => `<tr><td>${esc(k.name)}</td><td>${esc(baseOf(k.sym) + ' ' + k.tf)}</td><td>${esc(k.grade)}</td><td>${k.inPos ? '<span class="up">long (shadow)</span>' : 'flat'}</td><td>${esc(k.fills || 0)}</td><td class="${cls(k.pnl || 0)}">${esc(NT.fmtUSD(k.pnl || 0, 2))}</td><td><button type="button" class="btn xs" data-q="unshadow" data-k="${i}">Remove</button></td></tr>`).join('')}</table>`;
  /* live forward ticks: on each new closed bar, re-run the packaged strategy and log a hypothetical fill on a state change */
  const shadowTick = async () => {
    const c = cfg(); if (!c.shadow.length || document.hidden) return; let changed = false;
    for (const k of c.shadow.slice()) {
      let cs = []; try { cs = await History.get(k.sym, NT.TF[k.tf], 400); } catch (e) { continue; }
      if (!cs || cs.length < 120) continue; const last = cs[cs.length - 1]; if (k.lastT === last.t) continue; k.lastT = last.t; changed = true;
      const want = V153.shadowWant(cs, k, NT.TF[k.tf]); if (want == null || want === !!k.inPos) continue;
      const f = V152.shadowFill({ side: want ? 'buy' : 'sell', usd: k.risk.usd, sym: k.sym, bot: '🧬 ' + k.name }, { price: last.c, ts: Date.now() }, 5); if (!f) continue;
      if (want) k.entry = f.price; else if (k.entry > 0) k.pnl = (k.pnl || 0) + k.risk.usd * (f.price / k.entry - 1);
      k.inPos = want; k.fills = (k.fills || 0) + 1; if (typeof V151 !== 'undefined' && V152UI && V152UI.shadow) V151.pushCapped(V152UI.shadow, f, 200);
      if (V152UI && V152UI.renderGrokCard) V152UI.renderGrokCard();
      toast(`👻 Shadow ${esc(f.side)} ${esc(baseOf(k.sym))} @ ${esc(NT.fmtPrice(f.price))} · ${esc(k.name)} (no balance touched)`);
    }
    if (changed) { saveState(); renderGrok(); }
  };
  const mountGrok = () => { const host = $('#tab-grok'); if (!host || $('#q153Grok')) return; const d = document.createElement('details'); d.className = 'panel v152-grok'; d.id = 'q153Grok'; d.open = true; const anchor = $('#v152Nl'); if (anchor) anchor.after(d); else host.prepend(d); d.addEventListener('click', (e) => { const b = e.target.closest('[data-q="unshadow"]'); if (b) A.unshadow(b); }); renderGrok(); };
  const renderGrok = () => { const d = $('#q153Grok'); if (!d) return; const n = cfg().shadow.length; d.hidden = !n; d.innerHTML = `<summary>👻 ${esc(T('q153.promote'))} · ${n} promoted from the Quant Lab</summary><div class="pb">${n ? shadowList() : ''}${note('Each bot re-runs its exact strategy ID, evolved parameters and filters on every new closed bar and logs hypothetical fills here and in the dry-run log. Balances are never touched.')}</div>`; };

  /* ══ Lab tab panel ══ */
  const SECS = [['evolve', 'q153.evolve', '🧬', 'genetic search · Web Worker'], ['frag', 'q153.fragility', '💧', 'slippage, spread & partial fills'], ['crisis', 'q153.crisis', '⏳', '2020 · 2022 · FOMC + regimes'], ['kill', 'q153.kill', '🎯', 'top-3 trade drivers'], ['sizing', 'q153.sizing', '⚖', 'Kelly · ATR · equity-curve · $50k / $100k'], ['synth', 'q153.synth', '🌀', 'block bootstrap + adversarial noise'], ['inspect', 'q153.inspect', '🔍', 'click the curve → candle'], ['promote', 'q153.promote', '👻', 'dry-run on live ticks']];
  const fill = (det) => { const k = det.dataset.sec, body = det.querySelector('[data-body]'); if (!body || !R[k]) return; body.innerHTML = R[k](); if (k === 'evolve') renderEv(); if (k === 'kill' && U.imp.length) renderKill(); };
  const refreshOpen = () => { for (const det of document.querySelectorAll('#q153Root details[open]')) fill(det); };
  const render = (body) => {
    const c = cfg(), id = curStrat(), L = strats();
    body.innerHTML = `<div class="panel q153" id="q153Root"><div class="pb">
      <div class="v151-row"><b><span aria-hidden="true">🧬</span> <span data-i18n="lab.q153">${esc(T('lab.q153'))}</span></b><span class="note">${esc(L.length)} backtestable strategies (built-in + your No-Code specs) · ${esc(baseOf(sel()))}</span></div>
      <div class="v151-row"><select class="in" id="q153Strat" aria-label="Strategy">${L.map(([k, n]) => `<option value="${esc(k)}" ${k === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><div class="seg" id="q153Tf">${['1h', '4h', '1d'].map((t) => `<button type="button" data-tf="${t}" class="${c.tf === t ? 'on' : ''}">${t}</button>`).join('')}</div><button type="button" class="btn sm pri" data-q="base">Run backtest</button></div>
      <div id="q153Base">${note('Pick a strategy and run a backtest. The eight institutional tools below open on demand.')}</div>
      ${SECS.map(([k, key, ic, hint]) => `<details class="q153-sec" data-sec="${k}"><summary><span aria-hidden="true">${ic}</span> <span data-i18n="${key}">${esc(T(key))}</span> <span class="note">${esc(hint)}</span></summary><div class="pb" data-body="${k}"></div></details>`).join('')}
    </div></div>`;
    const root = $('#q153Root');
    root.addEventListener('click', (e) => {
      if (e.target.closest('#q153Curve')) { curveAt(e); return; }
      const t = e.target.closest('[data-tf]'); if (t) { cfg().tf = t.dataset.tf; saveState(); for (const x of root.querySelectorAll('[data-tf]')) x.classList.toggle('on', x === t); U.params = U.filters = U.grade = null; A.base(); return; }
      const a = e.target.closest('[data-acct]'); if (a) { U.acct = a.dataset.acct; for (const x of root.querySelectorAll('[data-acct]')) x.classList.toggle('on', x === a); A.sizing(); return; }
      const b = e.target.closest('[data-q]'); if (b && !b.disabled && A[b.dataset.q]) A[b.dataset.q](b);
    });
    root.addEventListener('keydown', (e) => { const p = e.target.closest && e.target.closest('[data-pt]'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); curveAt({ target: p }); } });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'q153Strat') { cfg().strat = e.target.value; saveState(); U.params = U.filters = U.grade = null; U.ev = null; A.base(); return; }
      if (e.target.dataset.rule != null) { const x = U.imp[+e.target.dataset.rule]; if (x) U.rules = e.target.checked ? U.rules.concat([x.rule]) : U.rules.filter((r) => r !== x.rule); renderKill(); }
    });
    root.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('details.q153-sec') && e.target.open) fill(e.target); }, true);
    if (U.base && U.base.id === id && U.base.sym === sel() && U.base.tf === c.tf) renderBase();
  };
  const mountLab = () => { const nav = $('#labNav'); if (!nav || nav.querySelector('[data-v="q153"]')) return; const b = document.createElement('button'); b.type = 'button'; b.dataset.v = 'q153'; b.innerHTML = `<span aria-hidden="true">🧬</span> <span data-i18n="lab.q153">${esc(T('lab.q153'))}</span>`; if (labSec === 'q153') { for (const x of nav.querySelectorAll('button')) x.classList.remove('on'); b.classList.add('on'); } nav.prepend(b); };
  U.start = () => {
    const c = cfg(); c.shadow = c.shadow.map((p) => { const q = p && V153.shadowPackage(Object.assign({}, p, { usd: p.risk && p.risk.usd, maxDailyLoss: p.risk && p.risk.maxDailyLoss })); if (q) { q.inPos = !!p.inPos; q.fills = +p.fills || 0; q.pnl = isFinite(+p.pnl) ? +p.pnl : 0; q.entry = +p.entry || 0; } return q; }).filter(Boolean).slice(0, 5);
    if (typeof initLab === 'function') { const _il = initLab; initLab = function () { const r = _il.apply(this, arguments); try { mountLab(); } catch (e) { /* nav optional */ } return r; }; }
    if (typeof renderLab === 'function') { const _rl = renderLab; renderLab = async function () { if (labSec === 'q153') return render($('#labBody')); return _rl.apply(this, arguments); }; }
    if (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS)) V14.SHORTCUTS.push(['Lab → 🧬', 'Quant Lab Pro: Auto-Evolve, fragility, crises, kill-switch, sizing, synthetic paths, inspector, shadow bots']);
    setInterval(() => { mountGrok(); shadowTick(); }, 30000); setTimeout(() => { mountGrok(); shadowTick(); }, 4000);
  };
  U.A = A; U.R = R; U.cfg = cfg; U.openTrade = openTrade; U.shadowTick = shadowTick; U.mountGrok = mountGrok;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b153 = boot; boot = async function () { await _b153.apply(this, arguments); try { V153UI.start(); } catch (e) { console.warn('v153 init', e); } }; }
