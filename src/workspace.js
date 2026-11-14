/* ExTerm Workspaces: up to four live charts side by side with a shared crosshair, saved as named layouts. */
const WS = (() => {
  const W = { charts: [], timer: 0, hoverT: null, LS: 'nt.ws' };
  const GRIDS = { 1: { l: '1 chart', n: 1 }, 2: { l: '2 side by side', n: 2 }, 3: { l: '1 + 2', n: 3 }, 4: { l: '2 × 2', n: 4 } };
  const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  W.GRIDS = GRIDS;
  const validSym = (s) => typeof s === 'string' && s.length < 120 && (isStock(s) || isOnchain(s) || Providers.ids.has(s));
  const defCells = () => {
    const w = (ST.watch || []).filter(validSym), pick = (i, d) => w[i] || d;
    return [{ sym: ST.sel, tf: '1h' }, { sym: pick(1, 'ETH-USD'), tf: '1h' }, { sym: pick(2, 'SOL-USD'), tf: '1h' }, { sym: pick(3, 'BTC-USD'), tf: '4h' }];
  };
  W.state = () => {
    let s = null; try { s = JSON.parse(localStorage.getItem(W.LS) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || !s.layouts) s = { cur: 'Default', layouts: { Default: { grid: 4, cells: defCells(), sync: true, link: true } } };
    // sanitise everything read back from storage
    const out = { cur: String(s.cur || 'Default').slice(0, 30), layouts: {} };
    for (const [name, L] of Object.entries(s.layouts).slice(0, 8)) {
      if (!L || typeof L !== 'object') continue;
      const cells = (Array.isArray(L.cells) ? L.cells : []).slice(0, 4).map((c, i) => ({ sym: validSym(c && c.sym) ? c.sym : defCells()[i].sym, tf: TFS.includes(c && c.tf) ? c.tf : '1h' }));
      while (cells.length < 4) cells.push(defCells()[cells.length]);
      out.layouts[String(name).replace(/[<>"'`&]/g, '').slice(0, 30) || 'Layout'] = { grid: GRIDS[L.grid] ? +L.grid : 4, cells, sync: L.sync !== false, link: L.link !== false };
    }
    if (!out.layouts[out.cur]) out.cur = Object.keys(out.layouts)[0] || 'Default';
    if (!out.layouts[out.cur]) out.layouts[out.cur] = { grid: 4, cells: defCells(), sync: true, link: true };
    return out;
  };
  let S = null;
  const save = () => { try { localStorage.setItem(W.LS, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } };
  const cur = () => S.layouts[S.cur];

  W.render = () => {
    const host = $('#wsHost'); if (!host) return;
    if (!S) S = W.state();
    const L = cur();
    if (L.link) L.cells[0].sym = ST.sel;
    $('#wsBar').innerHTML = `<div class="seg" id="wsGrid">${Object.entries(GRIDS).map(([k, g]) => `<button type="button" data-g="${k}" class="${+k === L.grid ? 'on' : ''}" title="${esc(g.l)}"><i class="wsg wsg${k}"></i></button>`).join('')}</div>
      <select class="in" id="wsLayout" aria-label="Saved layout">${Object.keys(S.layouts).map((n) => `<option ${n === S.cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <button type="button" class="btn sm" id="wsSaveAs">＋ Save as…</button><button type="button" class="ghost" id="wsDel" title="Delete this layout" ${Object.keys(S.layouts).length < 2 ? 'disabled' : ''}>🗑</button>
      <span class="sp"></span><label class="chk"><input type="checkbox" id="wsSync" ${L.sync ? 'checked' : ''}> Sync crosshair</label><label class="chk"><input type="checkbox" id="wsLink" ${L.link ? 'checked' : ''}> Chart 1 follows Markets</label>
      <form id="wkNameForm" class="wsname" hidden><input class="in" id="wkName" maxlength="30" placeholder="Layout name"><button class="btn sm pri">Save</button></form>`;
    host.className = 'ws-grid g' + L.grid;
    // build / reuse cells
    W.charts.forEach((c) => { c.dead = true; }); W.charts = [];
    host.innerHTML = L.cells.slice(0, GRIDS[L.grid].n).map((c, i) => `<div class="ws-cell" data-i="${i}"><div class="ws-head"><button type="button" class="btn sm ws-sym" data-i="${i}" title="Change symbol">${esc(baseOf(c.sym))} ▾</button><span class="ws-px num" data-i="${i}">–</span>
      <select class="in sm ws-tf" data-i="${i}" aria-label="Timeframe">${TFS.filter((t) => !isStock(c.sym) || NT.TF[t] >= 60).map((t) => `<option ${t === c.tf ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button type="button" class="ghost ws-open" data-i="${i}" title="Open in Markets">↗</button></div><div class="ws-chart" data-i="${i}"></div></div>`).join('');
    $$('.ws-chart', host).forEach((el) => {
      const i = +el.dataset.i, ch = new CandleChart(el); ch.o = Object.assign({}, ch.o, { ema: true, vol: true, trades: false, vp: !!(ST.ind && ST.ind.vp) });
      if (typeof OF !== 'undefined') OF.attach(ch);
      ch.onHover = (t) => { if (!cur().sync) return; W.hoverT = t; for (const o of W.charts) if (o !== ch) { o.ext = t == null ? null : { t }; o.invalidate(false); } };
      ch.idx = i; W.charts.push(ch); load(ch);
    });
    bind(host);
  };
  async function load(ch) {
    const c = cur().cells[ch.idx]; if (!c) return;
    try {
      const d = await History.get(c.sym, NT.TF[c.tf], 500); if (ch.dead) return;
      ch.set(d.slice(-500), NT.TF[c.tf], [], null, d.length ? '' : 'No data');
      const px = $(`.ws-px[data-i="${ch.idx}"]`), last = d[d.length - 1], first = d[Math.max(0, d.length - 25)];
      if (px && last) { const chg = first ? (last.c / first.c - 1) * 100 : 0; px.textContent = NT.fmtPrice(last.c); px.className = 'ws-px num ' + cls(chg); }
    } catch (e) { if (!ch.dead) ch.set([], NT.TF[c.tf], [], null, "Couldn't load " + baseOf(c.sym)); }
  }
  function bind(host) {
    segBtns($('#wsGrid'), Object.keys(GRIDS).map((k) => ({ v: k, l: '' })), cur().grid, (v) => { cur().grid = +v; save(); W.render(); });
    $$('#wsGrid button').forEach((b, k) => { b.innerHTML = `<i class="wsg wsg${k + 1}"></i>`; b.title = GRIDS[k + 1].l; b.setAttribute('aria-label', GRIDS[k + 1].l); });
    $('#wsLayout').onchange = (e) => { S.cur = e.target.value; save(); W.render(); };
    $('#wsSync').onchange = (e) => { cur().sync = e.target.checked; save(); if (!e.target.checked) W.charts.forEach((c) => { c.ext = null; c.invalidate(); }); };
    $('#wsLink').onchange = (e) => { cur().link = e.target.checked; save(); W.render(); };
    $('#wsSaveAs').onclick = () => { const f = $('#wkNameForm'); f.hidden = !f.hidden; if (!f.hidden) $('#wkName').focus(); };
    $('#wkNameForm').onsubmit = (e) => {
      e.preventDefault(); const n = $('#wkName').value.replace(/[<>"'`&]/g, '').trim().slice(0, 30); if (!n) return;
      if (!S.layouts[n] && Object.keys(S.layouts).length >= 8) return toast('Up to 8 saved layouts. Delete one first.', 'amb');
      S.layouts[n] = JSON.parse(JSON.stringify(cur())); S.cur = n; save(); toast(`Saved layout <b>${esc(n)}</b>`, 'up'); W.render();
    };
    $('#wsDel').onclick = () => { if (Object.keys(S.layouts).length < 2) return; delete S.layouts[S.cur]; S.cur = Object.keys(S.layouts)[0]; save(); W.render(); };
    host.onchange = (e) => { const t = e.target.closest('.ws-tf'); if (!t) return; const i = +t.dataset.i; cur().cells[i].tf = t.value; save(); const ch = W.charts.find((c) => c.idx === i); if (ch) load(ch); };
    host.onclick = (e) => {
      const sb = e.target.closest('.ws-sym'), ob = e.target.closest('.ws-open');
      if (sb) { const i = +sb.dataset.i; SymPick.open(sb, cur().cells[i].sym, (v) => { if (!validSym(v)) return; cur().cells[i].sym = v; if (i === 0) cur().link = false; save(); W.render(); }, {}); }
      if (ob) { const s = cur().cells[+ob.dataset.i].sym; ensureSym(s); selectSym(s); showTab('markets'); }
    };
  }
  /* v15.1 one-click presets: store (or overwrite) a named layout and make it current; cells re-validated by W.state on the next load */
  W.applyPreset = (name, grid, cells) => {
    if (!S) S = W.state();
    const n = String(name).replace(/[<>"'`&]/g, '').slice(0, 30) || 'Preset';
    S.layouts[n] = { grid: GRIDS[grid] ? +grid : 4, cells: [0, 1, 2, 3].map((i) => { const c = cells[i] || cells[0]; return { sym: validSym(c[0]) ? c[0] : defCells()[i].sym, tf: TFS.includes(c[1]) ? c[1] : '1h' }; }), sync: true, link: false };
    S.cur = n; save(); return n;
  };
  W.show = () => { W.render(); clearInterval(W.timer); W.timer = setInterval(() => { if (curTab !== 'workspace') { clearInterval(W.timer); return; } W.charts.forEach(load); }, 20000); };
  return W;
})();
TABS.workspace = { show: () => WS.show(), render: () => {} };
