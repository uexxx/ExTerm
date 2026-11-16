/* Backtest worker: runs NT.backtest / optimize / leaderboard off the UI thread */
self.onmessage = (e) => {
  const m = e.data, post = (x) => self.postMessage(Object.assign({ id: m.id }, x));
  const slim = (r, keepEq) => ({ exposure: r.exposure, filtered: r.filtered, short: !!r.short, from: r.from || 0, stats: r.stats, eq: keepEq ? r.eq : null, bh: keepEq ? r.bh : null, t: keepEq ? r.t : null, trades: keepEq ? r.trades : null, acct: { fees: r.acct.fees, cash: r.acct.cash, pos: r.acct.pos, realized: r.acct.realized } });
  try {
    if (Array.isArray(m.specs) && NT.Spec) for (const sp of m.specs.slice(0, 80)) { try { NT.Spec.register(sp); } catch (err) { /* invalid spec: skip */ } }
    if (m.type === 'bt') {
      const st = NT.strategies[m.strat], r = NT.backtest(m.candles, st, m.params, m.o);
      let opt = null;
      if (m.optimize && st.opt && Object.keys(st.opt).length) {
        let combos = [{}];
        for (const k of Object.keys(st.opt)) { const nx = []; for (const c of combos) for (const v of st.opt[k]) nx.push(Object.assign({}, c, { [k]: v })); combos = nx; }
        combos = combos.slice(0, 120); const res = [];
        combos.forEach((cb, i) => {
          const params = Object.assign({}, m.params, cb);
          if (params.fast != null && params.slow != null && params.fast >= params.slow) return;
          const x = NT.backtest(m.candles, st, params, m.o); res.push({ params, ret: x.stats.ret, maxDD: x.stats.maxDD, sharpe: x.stats.sharpe, trades: x.stats.closed, score: x.stats.ret / (1 + x.stats.maxDD / 10) });
          if (i % 5 === 4) post({ prog: i + 1, total: combos.length, phase: 'optimizing' });
        });
        opt = res.sort((a, b) => b.score - a.score).slice(0, 10);
      }
      post({ done: true, res: slim(r, true), opt });
    } else if (m.type === 'validate') {
      const v = NT.validate(m.candles, NT.strategies[m.strat], m.params, m.o, (k, tot, label) => post({ prog: k, total: tot, phase: label }));
      post({ done: true, v });
    } else if (m.type === 'all') {
      const ids = Object.keys(NT.strategies).filter((k) => !NT.strategies[k].liveOnly), rows = [];
      ids.forEach((id, k) => {
        const st = NT.strategies[id];
        try { const r = NT.backtest(m.candles, st, NT.defaultParams(id), m.o); rows.push({ id, name: st.name, cat: st.cat, ret: r.stats.ret, dd: r.stats.maxDD, trades: r.stats.closed, win: r.stats.winRate, pf: r.stats.profitFactor, sharpe: r.stats.sharpe }); }
        catch (err) { rows.push({ id, name: st.name, cat: st.cat, err: err.message }); }
        post({ prog: k + 1, total: ids.length, phase: st.name });
      });
      post({ done: true, rows });
    } else if (m.type === 'quant' && typeof P5 !== 'undefined') { // v15.6: walk-forward + Monte Carlo off the UI thread
      const st = NT.strategies[m.strat]; if (!st) throw new Error('unknown strategy');
      const wf = P5.walkForward(m.candles, st, m.grid, m.wfo);
      const bt = NT.backtest(m.candles, st, NT.defaultParams(m.strat), m.o);
      const rets = bt.trades.filter((t) => t.side === 'sell' && Number.isFinite(t.pnl)).map((t) => t.pnl / Math.max(1, (t.cost || t.usd || (t.price * t.qty) || 10000)));
      post({ done: true, wf, mc: P5.monteCarlo(rets, 1000, 7), n: rets.length });
    } else if (typeof V153 !== 'undefined' && (m.type === 'evolve' || m.type === 'synth' || m.type === 'crisis')) { // v15.3 Quant Lab Pro engines
      const st = NT.strategies[m.strat], pg = (k, tot, label) => post({ prog: k, total: tot, phase: label });
      if (!st) throw new Error('unknown strategy');
      if (m.type === 'evolve') post({ done: true, ev: V153.evolve(m.candles, st, m.params, m.o, pg) });
      else if (m.type === 'synth') post({ done: true, syn: V153.synthTest(m.candles, st, m.params, m.o, pg) });
      else post({ done: true, crises: Object.keys(V153.CRISES).map((k) => V153.crisisTest(m.candles, st, m.params, k, m.o)) });
    }
  } catch (err) { post({ done: true, error: err.message || String(err) }); }
};
