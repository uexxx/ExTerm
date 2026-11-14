/* ExTerm Pro: stop-entry orders, 3D liquidity depth, replay wiring. */

/* ---------- stop orders (breakout entries / protective sells) ---------- */
const StopOrders = {
  onTick(sym, price) {
    const list = ST.stops; if (!list || !list.length || !(price > 0)) return;
    let hit = false;
    for (const o of list.slice()) {
      if (o.sym !== sym) continue;
      if (!((o.side === 'buy' && price >= o.trigger) || (o.side === 'sell' && price <= o.trigger))) continue;
      ST.stops = ST.stops.filter((x) => x.id !== o.id); hit = true;
      const now = Date.now();
      const t = o.side === 'buy' ? (ACC.cash >= 1 ? ACC.buy(sym, price, Math.min(o.usd, ACC.cash), now, Object.assign({ reason: `stop buy triggered at ${NT.fmtPrice(o.trigger)}`, src: 'manual' }, o.meta || {})) : null)
        : ACC.qty(sym) ? ACC.sell(sym, price, Math.min(ACC.qty(sym), o.usd / price), now, { reason: `stop sell triggered at ${NT.fmtPrice(o.trigger)}`, src: 'manual' }) : null;
      if (t) tradeToast(t, 'Stop order'); else toast(`Stop order on ${esc(baseOf(sym))} triggered but couldn't fill`, 'amb');
    }
    if (hit) { saveState(); if (curTab === 'markets') { renderTicketMeta(); renderPosStrip(); chartRefresh(true); } }
  },
};
Feed.tickL.push((sym, price) => StopOrders.onTick(sym, price));

/* ---------- 3D liquidity depth: the last ~24 order-book snapshots stacked into a landscape ---------- */
const Depth3D = (() => {
  const D = { on: false, snaps: [], sym: null, rotX: 0.55, rotY: 0.3, range: 0.012 };
  D.push = (sym, bk) => {
    if (D.sym !== sym) { D.sym = sym; D.snaps = []; }
    const mid = (bk.asks[0][0] + bk.bids[0][0]) / 2; if (!(mid > 0)) return;
    D.snaps.push({ mid, bids: bk.bids.slice(0, 50).map((x) => [+x[0], +x[1]]), asks: bk.asks.slice(0, 50).map((x) => [+x[0], +x[1]]), ts: Date.now() });
    if (D.snaps.length > 24) D.snaps.shift();
  };
  function curve(levels, mid, side, W) { // cumulative depth sampled across the price window
    const N = 40, out = new Array(N).fill(0); let cum = 0, k = 0;
    const lv = levels.slice().sort((a, b) => (side === 'bid' ? b[0] - a[0] : a[0] - b[0]));
    for (let i = 0; i < N; i++) {
      const edge = side === 'bid' ? mid * (1 - (D.range * (i + 1)) / N) : mid * (1 + (D.range * (i + 1)) / N);
      while (k < lv.length && (side === 'bid' ? lv[k][0] >= edge : lv[k][0] <= edge)) { cum += lv[k][0] * lv[k][1]; k++; }
      out[i] = cum;
    }
    return out;
  }
  D.render = () => {
    const host = $('#book'); if (!host) return;
    let cv = host.querySelector('canvas.d3'); if (!cv) { host.innerHTML = '<canvas class="d3" title="Drag to rotate · each layer is an older snapshot"></canvas><div class="d3-legend note" id="d3Leg"></div>'; cv = host.querySelector('canvas.d3'); bindDrag(cv); }
    const W = host.clientWidth || 300, H = 250, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!D.snaps.length) { g.fillStyle = cssv('--mut', '#888'); g.fillText('Collecting order-book snapshots…', 12, 20); return; }
    const S = D.snaps, last = S[S.length - 1], mid = last.mid, curves = S.map((s) => ({ b: curve(s.bids, mid, 'bid'), a: curve(s.asks, mid, 'ask') }));
    const mx = Math.max(1, ...curves.map((c) => Math.max(c.b[c.b.length - 1], c.a[c.a.length - 1])));
    const up = cssv('--up', '#22c55e'), dn = cssv('--dn', '#ef4444'), N = 40, baseY = H - 34, half = (W - 70) / 2, cx = W / 2 - 18, depthX = 46 * D.rotX + 10, depthY = 70 * D.rotY + 18;
    for (let li = 0; li < curves.length; li++) {
      const z = (curves.length - 1 - li) / Math.max(1, curves.length - 1), ox = cx + depthX * z, oy = baseY - depthY * z, a = 0.12 + 0.88 * (1 - z) ** 1.6, c = curves[li];
      const hY = (v) => (v / mx) * (H * 0.62) * (1 - 0.35 * z);
      for (const [arr, col, dir] of [[c.b, up, -1], [c.a, dn, 1]]) {
        g.beginPath(); g.moveTo(ox, oy);
        for (let i = 0; i < N; i++) g.lineTo(ox + dir * ((i + 1) / N) * half * (1 - 0.25 * z), oy - hY(arr[i]));
        g.lineTo(ox + dir * half * (1 - 0.25 * z), oy); g.closePath();
        g.globalAlpha = a * 0.55; g.fillStyle = col; g.fill(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = li === curves.length - 1 ? 1.8 : 0.8; g.stroke();
      }
    }
    g.globalAlpha = 1; g.strokeStyle = cssv('--line', '#333'); g.beginPath(); g.moveTo(cx, baseY + 4); g.lineTo(cx + depthX, baseY - depthY); g.stroke();
    g.fillStyle = cssv('--mut', '#999'); g.font = '10px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText(NT.fmtPrice(mid), cx, baseY + 16); g.textAlign = 'left'; g.fillText('−' + (D.range * 100).toFixed(1) + '%', 4, baseY + 16); g.textAlign = 'right'; g.fillText('+' + (D.range * 100).toFixed(1) + '%', W - 40, baseY + 16);
    const bT = curves[curves.length - 1].b[N - 1], aT = curves[curves.length - 1].a[N - 1], imb = (bT - aT) / Math.max(1, bT + aT);
    $('#d3Leg').innerHTML = `<span class="up">Bids $${NT.fmtCompact(bT)}</span> · <span class="dn">Asks $${NT.fmtCompact(aT)}</span> within ±${(D.range * 100).toFixed(1)}% · imbalance <b class="${imb > 0 ? 'up' : 'dn'}">${imb > 0 ? '+' : ''}${(imb * 100).toFixed(0)}%</b> · ${S.length} snapshots · drag to rotate, scroll to zoom`;
  };
  function bindDrag(cv) {
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, rx: D.rotX, ry: D.rotY }; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* synthetic or lost pointer */ } });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; D.rotX = NT.clamp(drag.rx + (e.clientX - drag.x) / 120, -1.2, 1.6); D.rotY = NT.clamp(drag.ry - (e.clientY - drag.y) / 120, 0, 1.5); D.render(); });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); D.range = NT.clamp(D.range * (e.deltaY > 0 ? 1.15 : 0.87), 0.002, 0.08); D.render(); }, { passive: false });
  }
  return D;
})();

function initPro() {
  const bv = $('#bookView');
  if (bv) bv.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; Depth3D.on = b.dataset.v === '3d'; $$('#bookView button').forEach((x) => x.classList.toggle('on', x === b)); if (Depth3D.on) Depth3D.render(); else { $('#book').innerHTML = '<div class="empty">loading…</div>'; bookTimer = 0; } refreshBook(); };
  const rb = $('#replayBtn'); if (rb) rb.onclick = () => (Replay.on ? Replay.exit() : Replay.enter());
  renderStops();
}

/* ---------- 3D transitions on every switch: tabs, market modes, symbols, timeframes, views, heat tiles ---------- */
const Swap = {
  play(el, cls, ms = 650) { if (!el || document.body.classList.contains('fx-off')) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t' + cls]); el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms); },
  stagger(root, sel, prop = '--d', max = 14) { if (!root) return; root.querySelectorAll(sel).forEach((x, i) => x.style.setProperty(prop, Math.min(i, max))); },
};
{
  const _showTab = showTab;
  showTab = function (name) { const r = _showTab.apply(this, arguments); Swap.stagger(document.querySelector('.tab.on'), '.panel'); return r; };
  const _setMode = setMode;
  setMode = function (m) { const before = ST.mode, r = _setMode.apply(this, arguments); if (ST.mode !== before) { Swap.play(document.querySelector('main'), 'fx-mode', 650); setTimeout(() => { const wl = $('#watchList'); Swap.stagger(wl, '.wl-row', '--i', 20); Swap.play(wl, 'fx-mode', 1200); }, 30); } return r; };
  const _selectSym = selectSym;
  selectSym = function (sym) { const before = ST.sel, r = _selectSym.apply(this, arguments); if (ST.sel !== before) Swap.play($('#chartHost'), 'fx-sym', 500); return r; };
  document.addEventListener('click', (e) => {
    if (e.target.closest('#tfBtns button,#ctBtns button')) Swap.play($('#chartHost'), 'fx-tf', 400);
    if (e.target.closest('#bookView button')) Swap.play($('#book'), 'fx-view', 550);
  });
  const _renderHeat = renderHeat;
  renderHeat = function (relayout) {
    const host = $('#heatHost'), before = host ? host.querySelectorAll('.tile').length : 0, firstTile = host && host.querySelector('.tile');
    const r = _renderHeat.apply(this, arguments);
    const after = host ? host.querySelector('.tile') : null;
    if (host && after && after !== firstTile && !document.body.classList.contains('fx-off')) { host.querySelectorAll('.tile').forEach((t, i) => { t.style.setProperty('--i', Math.min(i, 60)); t.classList.add('fx-in'); }); setTimeout(() => host.querySelectorAll('.tile.fx-in').forEach((t) => t.classList.remove('fx-in')), 1400); }
    return r;
  };
}
