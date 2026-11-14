/* Indicator picker: search 130+ indicators, toggle one or many, edit their settings; active ones show as chips above the chart */
const IndPick = (() => {
  const P = { el: null, q: '', cat: 'all', open: null };
  const active = () => { const b = IND.BUILTIN.filter(([k]) => ST.ind[k] && k !== 'trades').map(([k, n]) => ({ key: 'b:' + k, n, b: k })); const x = (ST.ind.extra || []).map((e) => { const d = IND.byId[e.id]; return d ? { key: 'x:' + e.id, n: d.name, x: e } : null; }).filter(Boolean); return b.concat(x); };
  const isOn = (row) => (row.b ? !!ST.ind[row.b] : (ST.ind.extra || []).some((e) => e.id === row.id));
  const apply = () => { chart.o.extra = ST.ind.extra; chartRefresh(true); saveState(); P.chips(); if (P.el && P.el.classList.contains('on')) P.render(); };
  P.toggle = (row) => { if (row.b) ST.ind[row.b] = !ST.ind[row.b]; else { const i = ST.ind.extra.findIndex((e) => e.id === row.id); if (i >= 0) ST.ind.extra.splice(i, 1); else ST.ind.extra.push({ id: row.id, p: {} }); } apply(); };
  P.chips = () => {
    const host = $('#indBtns'); if (!host) return; const a = active();
    host.innerHTML = `<button class="fxbtn" data-ipopen="1" title="Add indicators">ƒx Indicators <b>${a.length}</b><span class="mut"> / ${IND.count()}</span></button>` + a.map((r) => `<span class="ichip" data-ikey="${esc(r.key)}"><span data-ipedit="${esc(r.key)}">${esc(r.n)}${r.x && Object.keys(r.x.p || {}).length ? ' <span class="mut">(' + esc(Object.values(r.x.p).join(', ')) + ')</span>' : ''}</span><button data-iprm="${esc(r.key)}" title="Remove">✕</button></span>`).join('') + (a.length ? '<button class="ichip clr" data-ipclear="1">Clear all</button>' : '');
  };
  P.onBar = (e) => {
    const rm = e.target.closest('[data-iprm]'); if (rm) { const k = rm.dataset.iprm; if (k.startsWith('b:')) ST.ind[k.slice(2)] = false; else ST.ind.extra = ST.ind.extra.filter((x) => 'x:' + x.id !== k); apply(); return; }
    if (e.target.closest('[data-ipclear]')) { IND.BUILTIN.forEach(([k]) => { if (k !== 'vol' && k !== 'trades') ST.ind[k] = false; }); ST.ind.extra = []; apply(); return; }
    const ed = e.target.closest('[data-ipedit]'); if (ed) { P.cat = 'active'; P.open = ed.dataset.ipedit.slice(2); P.show(ed); return; }
    if (e.target.closest('[data-ipopen]')) P.show(e.target.closest('[data-ipopen]'));
  };
  P.rows = () => IND.BUILTIN.filter(([k]) => k !== 'trades').map(([k, n, cat, pane]) => ({ b: k, id: k, n, cat, pane, builtin: true })).concat(IND.list.map((d) => ({ id: d.id, n: d.name, cat: d.cat, pane: d.pane, def: d })));
  P.ensure = () => {
    if (P.el) return P.el; const d = document.createElement('div'); d.id = 'indPop'; d.className = 'sympop indpop';
    d.innerHTML = `<div class="sp-in"><span>ƒx</span><input id="ipQ" placeholder="Search ${IND.count()} indicators… (e.g. RSI, VWAP, Ichimoku, Hull)" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div><div class="seg sp-tabs" id="ipCats"></div><div class="sp-list" id="ipList"></div><div class="sp-foot note">Click to add or remove · ⚙ to change settings · overlays draw on price, panes stack below</div>`;
    document.body.appendChild(d); P.el = d;
    d.querySelector('#ipQ').oninput = (e) => { P.q = e.target.value; P.render(); };
    d.querySelector('#ipQ').onkeydown = (e) => { if (e.key === 'Escape') P.hide(); };
    d.querySelector('#ipList').onclick = (e) => {
      const g = e.target.closest('[data-ipgear]'); if (g) { P.open = P.open === g.dataset.ipgear ? null : g.dataset.ipgear; P.render(); return; }
      if (e.target.closest('.ip-params')) return;
      const r = e.target.closest('[data-iprow]'); if (r) { const row = P.rows().find((x) => x.id === r.dataset.iprow); if (row) P.toggle(row); }
    };
    d.querySelector('#ipList').oninput = (e) => { const i = e.target.closest('[data-ipp]'); if (!i) return; const [id, k] = i.dataset.ipp.split('|'); const ex = ST.ind.extra.find((x) => x.id === id); const v = parseFloat(i.value); if (!ex || !Number.isFinite(v)) return; ex.p = Object.assign({}, ex.p, { [k]: v }); clearTimeout(P.t); P.t = setTimeout(() => { chart.o.extra = ST.ind.extra; chartRefresh(true); saveState(); P.chips(); }, 250); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P.el.classList.contains('on')) P.hide(); });
    document.addEventListener('mousedown', (e) => { if (P.el.classList.contains('on') && !P.el.contains(e.target) && !e.target.closest('#indBtns')) P.hide(); });
    return d;
  };
  P.show = (anchor) => {
    const d = P.ensure(), r = anchor.getBoundingClientRect(), W = Math.min(520, innerWidth - 20);
    segBtns(d.querySelector('#ipCats'), [{ v: 'all', l: 'All' }, { v: 'active', l: '✓ Active' }].concat(IND.CATS.map((c) => ({ v: c, l: c }))), P.cat, (v) => { P.cat = v; P.render(); });
    d.style.width = W + 'px'; d.style.left = Math.max(10, Math.min(innerWidth - W - 10, r.left)) + 'px'; d.style.top = r.bottom + 6 + 'px'; d.style.bottom = '';
    d.classList.add('on'); P.render(); setTimeout(() => d.querySelector('#ipQ').focus(), 10);
  };
  P.hide = () => { if (P.el) P.el.classList.remove('on'); P.open = null; };
  P.render = () => {
    const q = P.q.trim().toLowerCase();
    let rows = P.rows().filter((r) => (P.cat === 'all' || (P.cat === 'active' ? isOn(r) : r.cat === P.cat)) && (!q || r.n.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q)));
    rows.sort((a, b) => isOn(b) - isOn(a));
    P.el.querySelector('#ipList').innerHTML = rows.length ? rows.map((r) => { const on = isOn(r), ex = !r.builtin && (ST.ind.extra || []).find((x) => x.id === r.id), params = r.def ? Object.entries(Object.assign({}, r.def.p, ex ? ex.p : {})) : [];
      return `<div class="ip-row ${on ? 'on' : ''}" data-iprow="${esc(r.id)}"><span class="ip-ck">${on ? '✓' : ''}</span><div class="sp-n"><b>${esc(r.n)}</b><small>${esc(r.cat)}</small></div><span class="sp-cat ${r.pane === 'over' ? 'crypto' : 'stock'}">${r.pane === 'over' ? 'overlay' : 'pane'}</span>${on && params.length ? `<button class="btn xs" data-ipgear="${esc(r.id)}">⚙</button>` : '<span></span>'}</div>${on && P.open === r.id && params.length ? `<div class="ip-params">${params.map(([k, v]) => `<label>${esc(k)}<input class="in mono" data-ipp="${esc(r.id)}|${esc(k)}" value="${esc(v)}" inputmode="decimal"></label>`).join('')}</div>` : ''}`; }).join('') : '<div class="empty">No indicator matches.</div>';
  };
  return P;
})();
