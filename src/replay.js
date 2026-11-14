/* ExTerm Bar Replay — rewind the chart and trade history bar by bar, like a flight simulator for trading.
   Uses a separate practice account so replay trades never touch the real paper account. */
const Replay = (() => {
  const R = { on: false, idx: 0, data: [], sec: 60, timer: null, speed: 2, acct: null, sym: null, tf: null, start: 0 };
  const SYM = 'REPLAY';
  const bar = () => R.data[R.idx];
  function newAcct() { R.acct = new NT.Account({ cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 }); }
  R.markers = () => R.acct.trades.map((t) => ({ t: t.ts / 1000, side: t.side, price: t.price, src: 'replay' }));
  R.draw = () => { chart.set(R.data.slice(0, R.idx + 1), R.sec, R.markers(), null, ''); renderBar(); };
  function step(n = 1) {
    for (let k = 0; k < n && R.idx < R.data.length - 1; k++) {
      R.idx++; const b = bar();
      R.acct.matchOrders(SYM, b.l, b.h, b.t * 1000);
      R.acct.checkExits(SYM, b.l, b.h, b.t * 1000, { open: b.o });
    }
    if (R.idx >= R.data.length - 1) pause();
    R.draw();
  }
  function play() { if (R.timer) return; R.timer = setInterval(() => step(1), Math.max(40, 1000 / R.speed)); renderBar(); }
  function pause() { clearInterval(R.timer); R.timer = null; renderBar(); }
  R.toggle = () => (R.timer ? pause() : play());
  R.enter = async () => {
    const st = getStore(ST.sel, ST.tf); let data = st.candles.slice();
    if (data.length < 600) { try { const h = await History.get(ST.sel, st.sec, 1500); if (h.length > data.length) data = h.slice(); } catch (e) { /* use what the chart has */ } }
    if (data.length < 80) return toast('Not enough history for a replay on this timeframe (need 80+ bars)', 'amb');
    R.data = data; R.sec = st.sec; R.sym = ST.sel; R.tf = ST.tf; R.start = R.idx = Math.floor(R.data.length * 0.6); newAcct();
    R.on = true; document.body.classList.add('replaying'); mountBar(); R.draw();
    toast('⏪ Bar Replay: the future is hidden. Press Space to play, → to step, B/S to trade.', 'acc');
  };
  R.exit = () => { pause(); R.on = false; document.body.classList.remove('replaying'); const el = $('#replayBar'); if (el) el.remove(); chartRefresh(true); };
  R.jump = (i) => { pause(); i = Math.max(60, Math.min(R.data.length - 1, i | 0)); if (i < R.idx) newAcct(); R.idx = i; R.start = Math.min(R.start, i); R.draw(); };
  R.trade = (side, frac = 1) => {
    if (!R.on) return; const b = bar(), ts = b.t * 1000;
    if (side === 'buy') { const usd = R.acct.cash * frac; if (usd < 1) return toast('No practice cash left', 'amb'); const sl = parseFloat(($('#rpSl') || {}).value) / 100 || 0, tp = parseFloat(($('#rpTp') || {}).value) / 100 || 0; R.acct.buy(SYM, b.c, usd, ts, { reason: 'replay buy', src: 'replay', slPct: sl, tpPct: tp }); }
    else { if (!R.acct.qty(SYM)) return toast('No practice position to sell', 'amb'); R.acct.sell(SYM, b.c, null, ts, { reason: 'replay sell', src: 'replay' }); }
    R.draw();
  };
  function stats() {
    const b = bar(), eq = R.acct.equity({ [SYM]: b.c }), sells = R.acct.trades.filter((t) => t.side === 'sell'), wins = sells.filter((t) => (t.pnl || 0) > 0).length;
    const bh = (b.c / R.data[R.start].c - 1) * 100;
    return { eq, pnl: eq - 10000, pct: (eq / 10000 - 1) * 100, n: sells.length, wr: sells.length ? (wins / sells.length) * 100 : null, bh, pos: R.acct.qty(SYM) };
  }
  function mountBar() {
    const host = $('#chartHost'); let el = $('#replayBar'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'replayBar'; el.className = 'replaybar';
    el.innerHTML = `<div class="rp-row"><b class="rp-title">⏪ Replay</b>
      <button class="btn sm" data-rp="play" title="Play / pause (Space)">▶</button><button class="btn sm" data-rp="step" title="Next bar (→)">⏭</button><button class="btn sm" data-rp="step10" title="Skip 10 bars">+10</button>
      <div class="seg" id="rpSpeed">${[1, 2, 5, 10, 25].map((s) => `<button data-sp="${s}" class="${s === R.speed ? 'on' : ''}">${s}×</button>`).join('')}</div>
      <input type="range" id="rpPos" min="60" max="${R.data.length - 1}" value="${R.idx}" title="Move the replay point (moving back resets practice trades)">
      <span class="sp"></span>
      <label class="note">SL% <input class="in mono" id="rpSl" style="width:46px" placeholder="off"></label><label class="note">TP% <input class="in mono" id="rpTp" style="width:46px" placeholder="off"></label>
      <button class="btn sm buy" data-rp="buy" title="Buy with all practice cash (B)">Buy</button><button class="btn sm sell" data-rp="sell" title="Sell the practice position (S)">Sell</button>
      <button class="btn sm" data-rp="exit" title="Back to live">✕ Exit</button></div>
      <div class="rp-row rp-stats" id="rpStats"></div>`;
    host.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest('[data-rp],[data-sp]'); if (!b) return;
      if (b.dataset.sp) { R.speed = +b.dataset.sp; $$('#rpSpeed button').forEach((x) => x.classList.toggle('on', x === b)); if (R.timer) { pause(); play(); } return; }
      ({ play: R.toggle, step: () => step(1), step10: () => step(10), buy: () => R.trade('buy'), sell: () => R.trade('sell'), exit: R.exit })[b.dataset.rp]();
    };
    $('#rpPos').oninput = (e) => R.jump(+e.target.value);
  }
  function renderBar() {
    const el = $('#replayBar'); if (!el || !R.on) return; const s = stats(), b = bar();
    const pb = el.querySelector('[data-rp="play"]'); if (pb) pb.textContent = R.timer ? '⏸' : '▶';
    const pos = $('#rpPos'); if (pos && document.activeElement !== pos) pos.value = R.idx;
    $('#rpStats').innerHTML = `<span>${esc(baseOf(R.sym))} ${esc(R.tf)} · <b class="mono">${fmtTime(b.t, R.sec, true)}</b> · bar ${R.idx - R.start + 1} of replay · ${R.data.length - 1 - R.idx} hidden</span>
      <span>Practice equity <b class="mono ${cls(s.pnl)}">${NT.fmtUSD(s.eq)} (${NT.fmtPct(s.pct)})</b></span><span>Buy &amp; hold <b class="mono ${cls(s.bh)}">${NT.fmtPct(s.bh)}</b></span>
      <span>${s.n} trades${s.wr != null ? ` · ${s.wr.toFixed(0)}% wins` : ''}</span>${s.pos ? `<span class="tag up">in position</span>` : ''}`;
  }
  document.addEventListener('keydown', (e) => {
    if (!R.on || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === ' ') { e.preventDefault(); R.toggle(); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 10 : 1); } else if (e.key === 'b' || e.key === 'B') R.trade('buy'); else if (e.key === 's' || e.key === 'S') R.trade('sell'); else if (e.key === 'Escape') R.exit();
  });
  return R;
})();
