/* ExTerm v14 UI: welcome-back summary, P&L calendar, journal trades on the chart, multi-timeframe trend strip,
   strategy compare, risk of ruin + data-quality report on backtests, update checker, keyboard shortcuts.
   Pure logic lives in v14core.js (V14). Everything here is additive: each feature fails quietly on its own. */
const V14UI = (() => {
  const U = {};
  const LV = 'nt.lastVisit';
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') || (document.activeElement && document.activeElement.isContentEditable);
  const dayKey = (ts) => { try { return new Date(ts).toLocaleDateString('en-CA', tzOpt({})); } catch (e) { return new Date(ts).toISOString().slice(0, 10); } };
  U.dayKey = dayKey;
  const modal = (title, html, id) => {
    const old = document.getElementById(id); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 'v13-modal'; ov.id = id; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
    ov.innerHTML = `<div class="v13-card"><h3>${esc(title)}</h3>${html}<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn sm pri" data-close>Close</button></div></div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', k); }; const k = (e) => { if (e.key === 'Escape') close(); };
    ov.onclick = (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); }; document.addEventListener('keydown', k);
    document.body.appendChild(ov); setTimeout(() => { const b = ov.querySelector('[data-close]'); if (b) b.focus(); }, 20); return ov;
  };

  /* ── 1. welcome back ── */
  U.snapshot = () => {
    const px0 = {}; for (const s of (ST.watch || []).slice(0, 12)) { const p = px(s); if (p > 0) px0[s] = p; }
    let eq = null; try { eq = ACC.equity(priceMap()); } catch (e) { /* account not ready */ }
    return { ts: Date.now(), px: px0, eq, jn: typeof Journal !== 'undefined' && Journal.ready ? Journal.entries.length : null };
  };
  U.saveVisit = () => { try { const s = U.snapshot(); if (Object.keys(s.px).length) localStorage.setItem(LV, JSON.stringify(s)); } catch (e) { /* storage full */ } };
  U.welcome = async () => {
    let last = null; try { last = JSON.parse(localStorage.getItem(LV) || 'null'); } catch (e) { last = null; }
    if (!last || typeof last !== 'object') return null;
    for (let i = 0; i < 20 && !Object.keys(U.snapshot().px).length; i++) await sleep(1000); // wait for the first prices
    if (typeof Journal !== 'undefined') { try { await (Journal.initP || Journal.init()); } catch (e) { /* no journal */ } }
    const a = V14.away(last, U.snapshot()); if (!a) return null;
    const mv = a.movers.map((m) => `<span class="v14-mv"><b>${esc(baseOf(m.sym))}</b> <span class="${m.ch >= 0 ? 'up' : 'dn'}">${NT.fmtPct(m.ch)}</span></span>`).join('');
    const box = document.createElement('div'); box.className = 'v14-welcome'; box.id = 'v14Welcome'; box.setAttribute('role', 'status');
    box.innerHTML = `<button class="x" aria-label="Close" title="Close">×</button><b>👋 Welcome back</b><span class="note">You were away ${esc(V14.fmtAway(a.awayMs))}</span>
      ${mv ? `<div class="v14-mvs">${mv}</div>` : ''}<div class="note">${a.eqCh != null ? `Paper equity <b class="${cls(a.eqCh)}">${a.eqCh >= 0 ? '+' : ''}${NT.fmtUSD(a.eqCh)}</b>` : ''}${a.newTrades ? ` · ${a.newTrades} new trade${a.newTrades > 1 ? 's' : ''} in your journal` : ''}</div>`;
    box.querySelector('.x').onclick = () => box.remove(); document.body.appendChild(box); setTimeout(() => { if (box.isConnected) box.classList.add('fade'); }, 14000); setTimeout(() => box.remove(), 15000);
    return a;
  };

  /* ── 2. P&L calendar in the journal ── */
  U.cal = null;
  U.calHtml = () => {
    const now = new Date(), st = U.cal || (U.cal = { y: +dayKey(Date.now()).slice(0, 4), m: +dayKey(Date.now()).slice(5, 7) - 1 });
    const C = V14.calendar(Journal.entries, st.y, st.m, dayKey), mx = Math.max(1, ...C.days.map((d) => Math.abs(d.pnl)));
    const name = new Date(Date.UTC(st.y, st.m, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), today = dayKey(now.getTime());
    const cells = Array.from({ length: C.startDow }, () => '<span class="cal-e"></span>').concat(C.days.map((d) => {
      const a = d.n ? 0.18 + 0.7 * Math.min(1, Math.abs(d.pnl) / mx) : 0, col = d.pnl > 0 ? `rgba(34,197,94,${a.toFixed(2)})` : d.pnl < 0 ? `rgba(244,63,94,${a.toFixed(2)})` : '';
      return `<button type="button" class="cal-d${d.key === today ? ' today' : ''}${Journal.filt.day === d.key ? ' on' : ''}" data-day="${d.key}" style="${col ? 'background:' + col : ''}" title="${d.key}: ${d.n ? `${d.n} closed trade${d.n > 1 ? 's' : ''}, ${NT.fmtUSD(d.pnl)}` : 'no closed trades'}"><i>${d.d}</i>${d.n ? `<em>${Math.abs(d.pnl) >= 1000 ? (d.pnl < 0 ? '-' : '') + '$' + NT.fmtCompact(Math.abs(d.pnl)) : NT.fmtUSD(d.pnl).replace('.00', '')}</em>` : ''}</button>`;
    })).join('');
    return `<div class="panel jn-cal" id="jnCal"><h3>📅 P&amp;L calendar <span class="sp"></span><button type="button" class="btn sm" data-cal="-1" aria-label="Previous month">‹</button><span class="cal-m">${esc(name)}</span><button type="button" class="btn sm" data-cal="1" aria-label="Next month">›</button></h3>
      <div class="pb"><div class="cal-g">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="cal-h">${d}</span>`).join('')}${cells}</div>
      <div class="note" style="margin-top:6px">Month: <b class="${cls(C.total)}">${NT.fmtUSD(C.total)}</b> · ${C.n} closed trade${C.n === 1 ? '' : 's'} · ${C.green} green / ${C.red} red day${C.red === 1 ? '' : 's'}${C.best && C.best.pnl > 0 ? ` · best ${C.best.key.slice(5)} ${NT.fmtUSD(C.best.pnl)}` : ''}${Journal.filt.day ? ` · <button type="button" class="chip" data-calclr>Showing ${esc(Journal.filt.day)} ×</button>` : ''}</div></div></div>`;
  };
  U.wrapJournal = () => {
    if (typeof Journal === 'undefined' || Journal._v14) return; Journal._v14 = true;
    const _r = Journal.render;
    Journal.render = function () {
      const r = _r.apply(this, arguments);
      try {
        const host = $('#jnHost'); if (!host || !Journal.ready) return r;
        const grid = host.querySelector('.jn-grid'); if (!grid || host.querySelector('#jnCal')) return r;
        grid.insertAdjacentHTML('beforebegin', U.calHtml());
        const cal = host.querySelector('#jnCal');
        cal.onclick = (e) => {
          const nav = e.target.closest('[data-cal]'), d = e.target.closest('[data-day]'), clr = e.target.closest('[data-calclr]');
          if (nav) { const st = U.cal; st.m += +nav.dataset.cal; if (st.m < 0) { st.m = 11; st.y--; } else if (st.m > 11) { st.m = 0; st.y++; } }
          else if (d) { Journal.filt.day = Journal.filt.day === d.dataset.day ? '' : d.dataset.day; if (Journal.filt.day) Journal.filt.period = 'all'; }
          else if (clr) Journal.filt.day = '';
          else return;
          Journal.render();
        };
      } catch (e) { console.warn('calendar', e); }
      return r;
    };
  };

  /* ── 3. journal trades on the chart ── */
  U.overlay = (g, L, ch) => {
    if (!ST.settings.jnMarks || typeof Journal === 'undefined' || !Journal.ready || !L.D || L.D.length < 2 || !L.py) return;
    const D = L.D, t0 = D[Math.max(0, L.start | 0)].t * 1000, t1 = D[Math.min(D.length - 1, (L.end | 0) - 1)].t * 1000 + (D[1].t - D[0].t) * 1000;
    const list = Journal.entries.filter((e) => e.sym === ST.sel && e.ts >= t0 && e.ts <= t1 && e.price > 0).slice(0, 200);
    g.save(); g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (const e of list) {
      const x = ch.tToX(e.ts / 1000), y = L.py(e.price); if (!Number.isFinite(x) || !Number.isFinite(y) || x < L.Lm || x > L.W - L.Rm) continue;
      const buy = e.side === 'buy', c = buy ? '#22c55e' : '#EF4444', d = buy ? 1 : -1, yy = y + d * 9;
      g.fillStyle = c; g.strokeStyle = '#0b0d1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + d * 2); g.lineTo(x - 6, yy + d * 6); g.lineTo(x + 6, yy + d * 6); g.closePath(); g.fill(); g.stroke();
      if (!buy && e.pnl != null) { const s = (e.pnl >= 0 ? '+' : '') + NT.fmtUSD(e.pnl); g.fillStyle = e.pnl >= 0 ? '#22c55e' : '#EF4444'; g.fillText(s, x, yy - d * 2 + 14 * (d < 0 ? -1 : 1) + (d < 0 ? 0 : 6)); }
    }
    g.restore();
  };
  U.toggleMarks = (on) => { ST.settings.jnMarks = on == null ? !ST.settings.jnMarks : !!on; saveState(); if (typeof chart !== 'undefined' && chart) chart.invalidate(); toast(ST.settings.jnMarks ? '📓 Your journal trades are shown on the chart' : 'Journal trades hidden from the chart', 'acc', 2500); };

  /* ── 4. multi-timeframe trend strip ── */
  U.MTF = ['15m', '1h', '4h', '1d']; U.mtfCache = new Map(); U.mtfKey = '';
  U.mtfRefresh = async (force) => {
    const host = $('#mtfStrip'); if (!host) return;
    const sym = ST.sel, key = sym + '|' + ST.mode;
    if (!force && key === U.mtfKey) return; U.mtfKey = key;
    if (isOnchain(sym)) { host.innerHTML = '<span class="note" title="DEX pools only have recent trades, not long candle history">MTF n/a</span>'; return; }
    host.innerHTML = '<span class="note">MTF…</span>';
    const rows = [];
    for (const tf of U.MTF) {
      if (!NT.TF[tf] || (ST.mode === 'stocks' && NT.TF[tf] < 60)) continue;
      const ck = sym + '|' + tf, hit = U.mtfCache.get(ck);
      let r = hit && Date.now() - hit.ts < 120000 ? hit.r : null;
      if (!r) { try { const cs = await TFX.candles(sym, NT.TF[tf], 120); r = V14.mtfTrend(cs.slice(0, -1)); } catch (e) { r = { dir: 'n/a', note: e.message }; } U.mtfCache.set(ck, { r, ts: Date.now() }); }
      if (U.mtfKey !== key) return; // symbol changed meanwhile
      rows.push(Object.assign({ tf }, r));
    }
    const ic = { up: '▲', down: '▼', flat: '▬', 'n/a': '·' };
    host.innerHTML = `<span class="mtf-l" title="${esc(V14.mtfSummary(rows))}: EMA20 vs EMA50, its slope and RSI(14) on closed candles">MTF</span>` + rows.map((r) => `<span class="mtf-c ${r.dir === 'up' ? 'up' : r.dir === 'down' ? 'dn' : ''}" title="${esc(r.tf)}: ${esc(r.dir)}${r.rsi != null ? ' · RSI ' + r.rsi.toFixed(0) : ''}${r.note ? ' · ' + esc(r.note) : ''}">${esc(r.tf)} ${ic[r.dir] || '·'}</span>`).join('');
    host.dataset.summary = V14.mtfSummary(rows);
  };

  /* ── 5 + 6 + 7. backtest add-ons: data quality, risk of ruin, strategy compare ── */
  U.btExtra = (res, S, candles) => {
    const tf = NT.TF[S.tf] || 3600, q = V14.dataQuality(candles, tf), o = btOpts(S), pp = (o.posPct != null ? o.posPct : 1);
    const rets = (res.trades || []).filter((t) => t.side === 'sell' && t.pnlPct != null).map((t) => t.pnlPct * pp), rr = V14.riskOfRuin(rets, { ddLimit: 50, sims: 2000, horizon: 100 });
    const gcol = { A: 'up', B: 'up', C: 'amb', D: 'dn', F: 'dn' }[q.grade];
    return `<div class="pb v14-bt" id="v14Bt"><div class="v14-row">
      <div class="v14-box"><h4>🧹 Data quality <span class="tag ${gcol}">${q.grade}</span></h4>${q.issues.length ? `<ul class="v14-iss">${q.issues.map((x) => `<li class="${x.sev}">${esc(x.text)}</li>`).join('')}</ul>` : `<div class="note">${NT.fmtQty(q.n)} candles, no gaps, duplicates or bad prices.</div>`}</div>
      <div class="v14-box"><h4>🎲 Risk of ruin</h4>${rr.ruinPct == null ? '<div class="note">Needs at least 5 closed trades.</div>' : `<div class="v14-big ${rr.ruinPct >= 20 ? 'dn' : rr.ruinPct >= 5 ? 'amb' : 'up'}">${rr.ruinPct < 0.1 ? '<0.1' : rr.ruinPct > 99.9 ? '>99.9' : rr.ruinPct.toFixed(1)}%</div><div class="note">chance of a ${rr.ddLimit}% drawdown within the next ${rr.horizon} trades, from ${NT.fmtQty(rr.sims)} reshuffles of this strategy's ${rr.n} trades. Typical worst drawdown ${rr.medianDD.toFixed(0)}%, bad case (95th pct) ${rr.p95DD.toFixed(0)}%.</div>`}</div>
      <div class="v14-box v14-cmp"><h4>⚖️ Compare strategies</h4><div class="note">Same coin, timeframe, window and settings.</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><select class="in" id="v14C1" aria-label="Strategy to compare">${stratOptions('')}</select><select class="in" id="v14C2" aria-label="Second strategy to compare"><option value="">(none)</option>${stratOptions('')}</select><button type="button" class="btn sm pri" id="v14Cmp">Compare</button></div>
        <div id="v14CmpOut"></div></div></div></div>`;
  };
  U.compare = async () => {
    const out = $('#v14CmpOut'); if (!out || !lastBt) return;
    const ids = [$('#v14C1').value, $('#v14C2').value].filter((id, i, a) => id && NT.strategies[id] && !NT.strategies[id].liveOnly && id !== lastBt.S.strat && a.indexOf(id) === i);
    if (!ids.length) { out.innerHTML = '<div class="note">Pick a different strategy than the one you just tested.</div>'; return; }
    out.innerHTML = '<div class="note shimmer">Running…</div>';
    const o = Object.assign({}, btOpts(lastBt.S)); delete o.fromT;
    const rows = [{ id: lastBt.S.strat, name: NT.strategies[lastBt.S.strat].name + ' (yours)', res: lastBt.res }];
    try { for (const id of ids) { const r = await BTW.run({ type: 'bt', strat: id, params: NT.defaultParams(id), candles: lastBt.candles, o }); rows.push({ id, name: NT.strategies[id].name, res: r.res }); } }
    catch (e) { out.innerHTML = `<div class="note dn">Compare failed: ${esc(e.message)}</div>`; return; }
    U.lastCompare = rows;
    const COL = ['#F5C84B', '#f59e0b', '#FFE08A'], f = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));
    out.innerHTML = `<canvas id="v14CmpCv" width="560" height="170" style="width:100%;height:170px;margin-top:8px" role="img" aria-label="Equity curves of the compared strategies"></canvas>
      <div class="v14-tw"><table class="tbl v14-ct"><thead><tr><th>Strategy</th><th>Return</th><th>Max DD</th><th>Sharpe</th><th>Trades</th><th>Win %</th></tr></thead><tbody>${rows.map((r, i) => { const s = r.res.stats; return `<tr><td><span class="dot" style="background:${COL[i]}"></span>${esc(r.name)}</td><td class="${cls(s.ret)}">${f(s.ret)}%</td><td>${f(s.maxDD)}%</td><td>${f(s.sharpe, 2)}</td><td>${s.closed}</td><td>${f(s.winRate, 0)}</td></tr>`; }).join('')}</tbody></table></div>`;
    const cv = $('#v14CmpCv'), dpr = window.devicePixelRatio || 1; cv.width = Math.max(300, Math.round(cv.clientWidth * dpr)); cv.height = Math.round(170 * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr); const W = cv.width / dpr, H = cv.height / dpr; // drawn at the real size, so text stays sharp
    const series = rows.map((r) => { const e = r.res.eq || []; return e.length ? e.map((v) => (v / e[0] - 1) * 100) : []; });
    const all = series.flat().filter(Number.isFinite), lo = Math.min(0, ...all), hi = Math.max(0, ...all), y = (v) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 28);
    g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke();
    series.forEach((s, i) => { if (s.length < 2) return; g.strokeStyle = COL[i]; g.lineWidth = 1.6; g.beginPath(); s.forEach((v, k) => { const X = (k / (s.length - 1)) * W; k ? g.lineTo(X, y(v)) : g.moveTo(X, y(v)); }); g.stroke(); });
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '11px Inter, sans-serif'; g.fillText(hi.toFixed(0) + '%', 4, 12); g.fillText(lo.toFixed(0) + '%', 4, H - 2);
  };

  /* ── 8. update checker (asks the launcher, which asks GitHub; nothing is downloaded or installed) ── */
  U.checkUpdate = async () => {
    if (!J.proxy || !(Launcher.caps && Launcher.caps.update)) return null;
    let r; try { r = await J.get('/api/update', { timeout: 15000 }); } catch (e) { return null; }
    if (!r || !r.newer || !r.latest || !/^https:\/\/github\.com\//.test(r.url || '')) return r || null;
    if ((ST.settings.updSkip || '') === r.latest) return r;
    const b = document.createElement('div'); b.className = 'banner v14-upd'; b.id = 'v14Upd'; b.setAttribute('role', 'status');
    b.innerHTML = `🚀 <b>ExTerm ${esc(r.latest)} is out</b> (you have ${esc(r.current)}).${r.notes ? ` <span class="note">${esc(r.notes.slice(0, 140))}${r.notes.length > 140 ? '…' : ''}</span>` : ''} <a class="btn sm pri" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">What's new</a> <button class="btn sm" data-skip>Not now</button>`;
    b.querySelector('[data-skip]').onclick = () => { ST.settings.updSkip = r.latest; saveState(); b.remove(); };
    const ref = $('#banner'); if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref); return r;
  };

  /* ── 9 + 10. keyboard shortcuts + cheat sheet ── */
  U.help = () => modal('Keyboard shortcuts', `<table class="tbl v14-keys">${V14.SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table><div class="note">Shortcuts work on the Markets tab when you're not typing in a box.</div>`, 'v14Keys');
  U.onKey = (e) => {
    if (e.defaultPrevented || typing() || document.querySelector('.v13-modal, #tourOv')) return;
    const a = V14.keyAction(e); if (!a) return;
    if (a.a === 'help') { e.preventDefault(); U.help(); return; }
    if (typeof curTab === 'undefined' || curTab !== 'markets') return;
    if (typeof Replay !== 'undefined' && Replay.on && a.a !== 'journal' && a.a !== 'replay') return; // bar replay has its own keys (B / S trade the replay)
    e.preventDefault();
    if (a.a === 'tf') { const b = $$('#tfBtns button')[a.i]; if (b) b.click(); }
    else if (a.a === 'buy' || a.a === 'sell') { const b = $(`#ticket .tabs button[data-side="${a.a}"]`); if (b) b.click(); const i = $('#tkUsd'); if (i && !i.closest('[hidden]')) { i.focus(); i.select(); } }
    else if (a.a === 'replay') { const b = $('#replayBtn'); if (b) b.click(); }
    else if (a.a === 'journal') U.toggleMarks();
    else if (a.a === 'fit') { if (typeof chart !== 'undefined' && chart) { chart.view = { bars: 110, off: 0 }; chart.invalidate(); } }
  };

  U.init = () => {
    U.wrapJournal();
    if (typeof chart !== 'undefined' && chart && !chart.overlays.includes(U.overlay)) chart.overlays.push(U.overlay);
    const mk = $('#mkMode'); if (mk && !$('#mtfStrip')) mk.insertAdjacentHTML('beforebegin', '<span class="mtf" id="mtfStrip" aria-label="Trend on several timeframes"></span>');
    const hint = $('#chartHint'); if (hint && !/\?/.test(hint.textContent)) hint.textContent += ' · ? = shortcuts';
    document.addEventListener('keydown', U.onKey);
    U.mtfRefresh(true); setInterval(() => { if (curTab === 'markets' && !document.hidden) U.mtfRefresh(false); }, 3000);
    const _rb = renderBtResult;
    renderBtResult = function (res, S, sym, candles) {
      const r = _rb.apply(this, arguments);
      try { const host = $('#btResult'); if (host && candles && candles.length > 30 && !$('#v14Bt')) { host.insertAdjacentHTML('beforeend', U.btExtra(res, S, candles)); const b = $('#v14Cmp'); if (b) b.onclick = U.compare; } } catch (e) { console.warn('v14 bt', e); }
      return r;
    };
    U.welcome().catch(() => {}).finally(() => { U.saveVisit(); setInterval(U.saveVisit, 60000); addEventListener('pagehide', U.saveVisit); });
    setTimeout(() => U.checkUpdate().catch(() => {}), 4000);
    window.__exterm_v14 = true;
  };
  return U;
})();
// wire up after the v13 boot wrapper (ST, chart, journal and launcher are ready by then)
{ const _b14 = boot; boot = async function () { await _b14.apply(this, arguments); try { V14UI.init(); } catch (e) { console.warn('v14 init', e); } }; }
