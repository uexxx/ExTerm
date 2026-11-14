/* ExTerm v13: background bots (paper bots that keep running in the launcher after this tab is closed), the basket
   backtest (one strategy on many coins at once) and the market-regime breakdown under every backtest. */

/* ───────────── background bots ───────────── */
const BgBotsUI = (() => {
  const B = { list: [], err: '', busy: false, timer: 0 };
  const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  B.on = () => !!(typeof Launcher !== 'undefined' && Launcher.caps && Launcher.caps.bots);
  // only no-code strategies can run in the launcher (it interprets the JSON rules; it can't run page code)
  B.choices = () => {
    const out = [];
    for (const [id, st] of Object.entries(NT.strategies)) if (st.spec) out.push({ id, name: st.name, spec: st.spec });
    for (const t of NT.Spec.TEMPLATES) { const v = NT.Spec.validate(t); if (v.ok) out.push({ id: 'tpl:' + v.spec.name, name: '📄 ' + v.spec.name + (v.spec.dir === 'short' ? ' (short)' : '') + ' · template', spec: v.spec }); }
    return out;
  };
  B.refresh = async (quiet) => {
    if (!B.on()) return;
    try { const r = await J.get('/api/bots', { timeout: 6000 }); B.list = Array.isArray(r.bots) ? r.bots : []; B.err = r.error || ''; B.ingest(); }
    catch (e) { B.err = e.message; }
    if (!quiet && curTab === 'bots') B.render();
  };
  // trades the launcher made while you were away go into the journal (once each) and get a summary toast
  B.ingest = () => {
    const seen = new Set(ST.bgSeen || []), fresh = [];
    for (const b of B.list) for (const t of b.trades || []) if (t && t.id && !seen.has(t.id)) { seen.add(t.id); fresh.push(Object.assign({ sym: b.sym }, t, { botName: b.name })); }
    if (!fresh.length) return 0;
    for (const t of fresh) {
      try { Journal.record({ id: 'bg_' + String(t.id).replace(/[^a-f0-9]/gi, ''), sym: String(t.sym || ''), side: t.side === 'sell' ? 'sell' : 'buy', price: +t.price || 0, usd: +t.usd || 0, qty: +t.qty || 0, pnl: t.pnl == null ? null : +t.pnl, pnlPct: t.pnlPct == null ? null : +t.pnlPct, ts: +t.ts || Date.now(), reason: String(t.reason || '') + (t.short ? ' (short)' : ''), src: 'background bot: ' + String(t.botName || '') }, null); } catch (e) { /* journal must never break this */ }
    }
    if (ST.bgSeen && ST.bgSeen.length) {
      const pnl = fresh.reduce((s, t) => s + (+t.pnl || 0), 0);
      toast(`☁ Background bots made <b>${fresh.length}</b> paper trade${fresh.length > 1 ? 's' : ''} while you were away${fresh.some((t) => t.pnl != null) ? ` · closed P&L <b class="${pnl >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(pnl)}</b>` : ''}. They're in your journal.`, 'acc', 9000);
    }
    ST.bgSeen = [...seen].slice(-3000); saveState(); return fresh.length;
  };
  const S = () => ST.bgForm || (ST.bgForm = { strat: '', sym: '', tf: '15m', capital: 1000, loss: 5, notify: true });
  B.render = () => {
    const host = $('#bgBots'); if (!host) return;
    if (!B.on()) {
      host.innerHTML = `<h3>☁ Background bots</h3><div class="pb note">Paper bots that <b>keep trading after you close this tab</b>, with trades waiting in your journal when you come back. They run inside the launcher, so start ExTerm with <code>start-exterm</code> (.bat / .command / .sh) to use them.</div>`;
      return;
    }
    if (typeof holdBots !== 'undefined' && Date.now() < holdBots && host.querySelector('[data-bga]')) return; // a "Sure?" button is armed: don't reset it
    const f = S(), ch = B.choices(); if (!f.strat || !ch.some((c) => c.id === f.strat)) f.strat = ch[0] ? ch[0].id : '';
    if (!f.sym) f.sym = baseOf(ST.setup.sym || ST.sel);
    const row = (b) => {
      const p = b.pos, eq = b.equity != null ? b.equity : b.cash, pnl = eq - b.capital, last = (b.trades || []).slice(-1)[0];
      return `<tr data-bg="${esc(b.id)}"><td><b>${esc(b.name)}</b><div class="note">${esc(baseOf(b.sym))} · ${esc(b.tf)}${b.spec && b.spec.dir === 'short' ? ' · short' : ''}${b.notify ? ' · 🔔' : ''}</div></td>
        <td><span class="tag ${!b.active ? '' : /error/.test(b.status) ? 'dn' : /limit/.test(b.status) ? 'amb' : 'up'}">${b.active ? esc(b.status || 'running') : 'paused'}</span>${last ? `<div class="note">last: ${esc(last.side === 'buy' ? (last.short ? 'short' : 'buy') : (last.short ? 'cover' : 'sell'))} @ ${NT.fmtPrice(last.price)} · ${esc(fmtStamp(last.ts))}</div>` : ''}</td>
        <td class="r num">${p ? `${esc(p.side)} @ ${NT.fmtPrice(p.entry)}` : '–'}</td>
        <td class="r num ${pnl >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(eq, 0)}<div class="note">${NT.fmtPct((pnl / b.capital) * 100)}</div></td>
        <td class="r num">${(b.trades || []).length}</td>
        <td class="r"><button class="btn sm" data-bga="toggle">${b.active ? 'Pause' : 'Resume'}</button> <button class="btn sm" data-bga="close" ${p ? '' : 'disabled'}>Close position</button> <button class="btn sm ghost" data-bga="del">Delete</button></td></tr>`;
    };
    host.innerHTML = `<h3>☁ Background bots <span class="sp"></span><span class="note">keep paper trading when this tab is closed · ${B.list.length}/10</span></h3><div class="pb">
      <form id="bgForm2" class="bg-form" autocomplete="off">
        <label class="f">No-code strategy<select class="in" id="bgStrat">${ch.map((c) => `<option value="${esc(c.id)}" ${c.id === f.strat ? 'selected' : ''}>${esc(c.name)}</option>`).join('') || '<option value="">Build one in the strategy builder first</option>'}</select></label>
        <label class="f">Market<input class="in mono" id="bgSym" value="${esc(f.sym)}" placeholder="BTC, SPY or an on-chain token" spellcheck="false"></label>
        <label class="f">Timeframe<select class="in" id="bgTf">${TFS.map((t) => `<option ${t === f.tf ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Paper capital $<input class="in num" id="bgCap" type="number" min="10" step="10" value="${esc(f.capital)}"></label>
        <label class="f" title="Stops opening new trades for the rest of the UTC day once the bot is down this much">Daily loss limit %<input class="in num" id="bgLoss" type="number" min="0" max="100" step="0.5" value="${esc(f.loss)}"></label>
        <label class="chk" style="align-self:end"><input type="checkbox" id="bgNotify" ${f.notify ? 'checked' : ''}> Message me each trade (Telegram / Discord)</label>
        <button class="btn pri" type="submit" style="align-self:end" ${ch.length ? '' : 'disabled'}>Start background bot</button>
      </form>
      <div class="note" id="bgMsg2">Runs your no-code rules on the latest 300 closed candles each time a candle closes. Built-in strategies run only while this tab is open. Paper only: nothing here can place a real order.${B.err ? ` <span class="dn">Launcher says: ${esc(B.err)}</span>` : ''}</div>
      ${B.list.length ? `<table class="bg-table"><thead><tr><th>Bot</th><th>Status</th><th class="r">Position</th><th class="r">Equity</th><th class="r">Trades</th><th></th></tr></thead><tbody>${B.list.map(row).join('')}</tbody></table>` : ''}
    </div>`;
    const msg = (t, c) => { const m = $('#bgMsg2'); if (m) { m.textContent = t; m.className = 'note ' + (c || ''); } };
    $('#bgForm2').onsubmit = async (e) => {
      e.preventDefault(); if (B.busy) return;
      const c = ch.find((x) => x.id === $('#bgStrat').value); if (!c) return msg('Pick a no-code strategy', 'amb');
      const sym = normSym($('#bgSym').value.trim()); if (!sym) return msg('Unknown market “' + $('#bgSym').value + '”', 'amb');
      Object.assign(f, { strat: c.id, sym: $('#bgSym').value.trim(), tf: $('#bgTf').value, capital: +$('#bgCap').value || 1000, loss: +$('#bgLoss').value || 0, notify: $('#bgNotify').checked }); saveState();
      B.busy = true; msg('Starting…');
      try {
        await J.post('/api/bots', { id: 'bg' + NT.uid().replace(/[^A-Za-z0-9]/g, '').slice(0, 20), name: `${c.spec.name.slice(0, 30)} · ${baseOf(sym)} ${f.tf}`, sym, tf: f.tf, spec: c.spec, capital: f.capital, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, maxDailyLoss: f.loss, notify: f.notify, active: true }, { timeout: 8000 });
        toast(`☁ Background bot started on <b>${esc(baseOf(sym))} ${esc(f.tf)}</b>. It keeps running while the launcher window is open.`, 'up', 7000);
        await B.refresh();
      } catch (err) { msg('⚠ ' + err.message.replace(/^HTTP \d+ /, ''), 'dn'); }
      B.busy = false;
    };
    host.querySelectorAll('[data-bga]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('tr').dataset.bg, b = B.list.find((x) => x.id === id), a = btn.dataset.bga; if (!b) return;
        const go = async () => {
          try {
            if (a === 'toggle') await J.post('/api/bots', Object.assign({}, b, { active: !b.active }), { timeout: 8000 });
            else if (a === 'close') await J.post('/api/bots/close', { id }, { timeout: 8000 });
            else if (a === 'del') { if (b.pos) await J.post('/api/bots/close', { id }, { timeout: 8000 }); await J.post('/api/bots/delete', { id }, { timeout: 8000 }); }
            await B.refresh();
          } catch (err) { toast('Background bot: ' + esc(err.message), 'dn'); }
        };
        if (a === 'del' || a === 'close') confirmClick(btn, go); else go();
      };
    });
  };
  B.start = () => { if (!B.on()) return; B.refresh(true); clearInterval(B.timer); B.timer = setInterval(() => { if (!document.hidden) B.refresh(curTab !== 'bots'); }, 20000); };
  return B;
})();

/* ───────────── market regimes (used under each backtest and by the basket test) ───────────── */
const Regime = (() => {
  const R = {};
  // up-trend / down-trend / choppy for every bar, from ADX(14) and the 20-bar slope of the 50 EMA (no look-ahead)
  R.classify = (c) => {
    const adx = NT.ind.adx ? NT.ind.adx(c, 14).adx : c.map(() => NaN), e = NT.ind.ema(c.map((x) => x.c), 50);
    return c.map((_, i) => { if (i < 20 || !isFinite(adx[i]) || !isFinite(e[i]) || !isFinite(e[i - 20])) return null; if (adx[i] < 20) return 'chop'; return e[i] > e[i - 20] ? 'up' : 'down'; });
  };
  R.NAMES = { up: '📈 Up-trend', down: '📉 Down-trend', chop: '〰 Choppy / ranging' };
  // P&L of every closed trade, grouped by the regime when it was opened
  R.breakdown = (trades, candles) => {
    const reg = R.classify(candles), idx = new Map(candles.map((c, i) => [c.t, i])), out = { up: { n: 0, w: 0, pnl: 0, bars: 0 }, down: { n: 0, w: 0, pnl: 0, bars: 0 }, chop: { n: 0, w: 0, pnl: 0, bars: 0 } };
    for (const r of reg) if (r) out[r].bars++;
    let open = null, lastEntry = null;
    const near = (ts) => { const s = ts > 1e12 ? Math.floor(ts / 1000) : ts; if (idx.has(s)) return idx.get(s); let lo = 0, hi = candles.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (candles[m].t <= s) lo = m; else hi = m - 1; } return lo; };
    for (const t of trades || []) {
      if (t.side === 'buy') { if (open == null) open = near(t.ts); }
      else if (t.side === 'sell' && t.pnl != null) { const e = open != null ? open : lastEntry != null ? lastEntry : near(t.ts), r = reg[e]; if (r) { out[r].n++; if (t.pnl > 0) out[r].w++; out[r].pnl += t.pnl; } lastEntry = e; open = null; } // partial sells keep the original entry's regime
    }
    return out;
  };
  R.html = (trades, candles) => {
    const b = R.breakdown(trades, candles), tot = b.up.bars + b.down.bars + b.chop.bars || 1;
    const rows = ['up', 'down', 'chop'].map((k) => { const x = b[k]; return `<tr><td>${R.NAMES[k]}</td><td class="r num">${((x.bars / tot) * 100).toFixed(0)}%</td><td class="r num">${x.n}</td><td class="r num">${x.n ? ((x.w / x.n) * 100).toFixed(0) + '%' : '–'}</td><td class="r num ${x.pnl >= 0 ? 'up' : 'dn'}">${x.n ? NT.fmtUSD(x.pnl, 0) : '–'}</td></tr>`; }).join('');
    const best = ['up', 'down', 'chop'].filter((k) => b[k].n >= 3).sort((p, q) => b[q].pnl - b[p].pnl);
    const verdict = !best.length ? 'Not enough trades to judge regimes yet.' : b[best[best.length - 1]].pnl < 0 && b[best[0]].pnl > 0 ? `Makes money in <b>${R.NAMES[best[0]]}</b> markets and loses in <b>${R.NAMES[best[best.length - 1]]}</b> ones: consider a filter or only running it when the market looks like the first.` : b[best[0]].pnl > 0 ? `Held up in every regime with enough trades. A good sign, but check it on more coins (basket test).` : `Lost money in every regime with enough trades.`;
    return `<div class="sec">Results by market regime <span class="note" style="text-transform:none;letter-spacing:0">regime at entry · ADX(14) + 50 EMA slope</span></div><table class="regime"><thead><tr><th>Regime</th><th class="r">Time in it</th><th class="r">Trades</th><th class="r">Win rate</th><th class="r">P&amp;L</th></tr></thead><tbody>${rows}</tbody></table><div class="note">${verdict}</div>`;
  };
  return R;
})();

/* ───────────── basket backtest: one strategy, many coins ───────────── */
const Basket = (() => {
  const K = { busy: false, last: null };
  K.symsFor = () => { const w = (ST.watch || []).slice(0, 12); return w.length ? w : ['BTC-USD', 'ETH-USD', 'SOL-USD']; };
  K.render = () => {
    const host = $('#basket'); if (!host) return;
    const S = ST.setup, st = NT.strategies[S.strat], f = ST.basket || (ST.basket = { syms: '' });
    const syms = f.syms || K.symsFor().map(baseOf).join(', ');
    host.innerHTML = `<h3>🧺 Basket test <span class="sp"></span><span class="note">does it work on more than one coin?</span></h3><div class="pb">
      <div class="note">Runs <b>${esc(st ? st.name : S.strat)}</b> on ${esc(S.tf)} candles (${esc(String(S.bars).startsWith('r:') ? 'same date range' : NT.fmtQty(+S.bars) + ' candles')}) for every market below, with the same settings, fees and slippage. A strategy that only works on one coin is usually luck.</div>
      <div class="row" style="gap:8px;margin:8px 0"><input class="in mono" id="bkSyms" style="flex:1;min-width:220px" value="${esc(syms)}" spellcheck="false" aria-label="Markets to test"><button class="btn" id="bkWatch">Use my watchlist</button><button class="btn pri" id="bkRun">Run basket test</button></div>
      <div id="bkOut">${K.last ? K.table(K.last) : ''}</div></div>`;
    $('#bkWatch').onclick = () => { f.syms = K.symsFor().map(baseOf).join(', '); saveState(); K.render(); };
    $('#bkRun').onclick = () => { f.syms = $('#bkSyms').value; saveState(); K.run(); };
  };
  K.run = async () => {
    if (K.busy) return; const out = $('#bkOut'), S = Object.assign({}, readSetup()), st = NT.strategies[S.strat];
    if (!st || st.liveOnly) { out.innerHTML = '<div class="empty">This strategy can’t be backtested on candles.</div>'; return; }
    const syms = [...new Set(String((ST.basket || {}).syms || '').split(/[\s,]+/).map((x) => normSym(x)).filter(Boolean))].slice(0, 12);
    if (syms.length < 2) { out.innerHTML = '<div class="empty">Add at least 2 markets (comma separated).</div>'; return; }
    K.busy = true; const rows = [];
    try {
      for (let k = 0; k < syms.length; k++) {
        const sym = syms[k], s2 = Object.assign({}, S, { sym });
        try {
          const candles = await loadHistory(sym, s2, out); if (candles.length < 60) throw new Error('only ' + candles.length + ' candles');
          const o = btOpts(s2), fromT = windowFrom(s2); if (fromT) o.fromT = fromT;
          out.innerHTML = progBar(((k + 0.5) / syms.length) * 100, `Testing ${esc(baseOf(sym))} (${k + 1}/${syms.length})…`);
          const r = (await BTW.run({ type: 'bt', strat: S.strat, params: S.params, candles, o })).res, cw = fromT ? candles.filter((c) => c.t >= fromT) : candles;
          rows.push({ sym, ret: r.stats.ret, bh: (cw[cw.length - 1].c / cw[0].c - 1) * 100, dd: r.stats.maxDD, trades: r.stats.closed, win: r.stats.winRate, eq: r.eq });
        } catch (e) { rows.push({ sym, err: e.message }); }
      }
      K.last = { rows, strat: st.name, tf: S.tf, ts: Date.now() }; out.innerHTML = K.table(K.last);
    } finally { K.busy = false; }
  };
  K.summary = (rows) => {
    const ok = rows.filter((r) => !r.err), rets = ok.map((r) => r.ret).sort((a, b) => a - b), med = rets.length ? rets[Math.floor((rets.length - 1) / 2)] : 0;
    const prof = ok.filter((r) => r.ret > 0).length, beat = ok.filter((r) => r.ret > r.bh).length;
    // equal-weight portfolio of every market's equity curve
    const n = Math.min(...ok.map((r) => r.eq.length)), port = [];
    if (ok.length && isFinite(n)) for (let i = 0; i < n; i++) port.push(ok.reduce((s, r) => s + r.eq[r.eq.length - n + i] / r.eq[r.eq.length - n], 0) / ok.length);
    return { n: ok.length, med, prof, beat, port, portRet: port.length ? (port[port.length - 1] - 1) * 100 : 0 };
  };
  K.table = (L) => {
    const s = K.summary(L.rows), grade = !s.n ? '–' : s.prof / s.n >= 0.7 && s.med > 0 ? 'Robust' : s.prof / s.n >= 0.5 ? 'Mixed' : 'Fragile';
    return `<div class="stats" style="margin:6px 0"><div class="stat"><span class="k">Verdict</span><span class="v ${grade === 'Robust' ? 'up' : grade === 'Fragile' ? 'dn' : 'amb'}">${grade}</span><span class="s">${s.prof}/${s.n} markets profitable</span></div>
      <div class="stat"><span class="k">Median return</span><span class="v ${s.med >= 0 ? 'up' : 'dn'}">${NT.fmtPct(s.med)}</span><span class="s">across markets</span></div>
      <div class="stat"><span class="k">Beat buy &amp; hold</span><span class="v">${s.beat}/${s.n}</span><span class="s">markets</span></div>
      <div class="stat"><span class="k">Equal-weight basket</span><span class="v ${s.portRet >= 0 ? 'up' : 'dn'}">${NT.fmtPct(s.portRet)}</span><span class="s">all markets together</span></div></div>
      <table class="bk-table"><thead><tr><th>Market</th><th class="r">Return</th><th class="r">Buy &amp; hold</th><th class="r">Max DD</th><th class="r">Trades</th><th class="r">Win rate</th></tr></thead><tbody>
      ${L.rows.map((r) => r.err ? `<tr><td>${esc(baseOf(r.sym))}</td><td colspan="5" class="note">couldn't test: ${esc(r.err)}</td></tr>` : `<tr><td>${esc(baseOf(r.sym))}</td><td class="r num ${r.ret >= 0 ? 'up' : 'dn'}">${NT.fmtPct(r.ret)}</td><td class="r num">${NT.fmtPct(r.bh)}</td><td class="r num dn">-${r.dd.toFixed(1)}%</td><td class="r num">${r.trades}</td><td class="r num">${r.win == null ? '–' : r.win.toFixed(0) + '%'}</td></tr>`).join('')}</tbody></table>
      <div class="note">${esc(L.strat)} · ${esc(L.tf)} · tested ${esc(fmtClock(L.ts))}. Past results on a few coins don't guarantee anything; "Robust" just means it wasn't a one-coin fluke.</div>`;
  };
  return K;
})();
