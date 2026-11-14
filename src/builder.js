/* ExTerm no-code Strategy Builder + Community library.
   Strategies are JSON specs (see stratspec.js): validated, interpreted, never eval'd. Saved locally,
   shareable as .json files, exportable as Pine Script v5. */
const Builder = (() => {
  const B = { lb: {}, busy: false, draft: null, out: '' };
  const SP = NT.Spec, LS = 'nt.specs';
  if (Array.isArray(NT.STRAT_CATS)) for (const c of ['My strategies', 'Community']) if (!NT.STRAT_CATS.includes(c)) NT.STRAT_CATS.push(c); // so custom strategies show in every strategy menu
  const COMMUNITY = typeof COMMUNITY_SPECS !== 'undefined' && Array.isArray(COMMUNITY_SPECS) ? COMMUNITY_SPECS : [];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const blank = () => ({ v: 1, name: 'My strategy', desc: '', entry: { all: [{ a: { k: 'rsi', n: 14 }, op: '<', b: { k: 'const', v: 30 } }] }, exit: { any: [{ a: { k: 'rsi', n: 14 }, op: '>', b: { k: 'const', v: 65 } }] }, risk: { sl: 5 } });

  /* ---- persistence ---- */
  B.saved = () => { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a.slice(0, 60) : []; } catch (e) { return []; } };
  const persist = (list) => { try { localStorage.setItem(LS, JSON.stringify(list.slice(0, 60))); return true; } catch (e) { return false; } };
  B.loadAll = () => {
    let n = 0;
    for (const sp of COMMUNITY) { try { SP.register(Object.assign({}, sp)); n++; } catch (e) { console.warn('community strategy skipped', e.message); } }
    for (const sp of B.saved()) { try { SP.register(sp); n++; } catch (e) { console.warn('saved strategy skipped', e.message); } }
    return n;
  };
  B.save = (raw) => {
    const v = SP.validate(raw); if (!v.ok) throw new Error(v.errors[0]);
    const id = SP.idOf(v.spec);
    if (COMMUNITY.some((c) => SP.idOf(SP.validate(c).spec) === id) && !raw.author) throw new Error('That name is used by a community strategy. Pick another name.');
    const list = B.saved().filter((s) => SP.idOf(SP.validate(s).spec) !== id); list.unshift(v.spec);
    if (!persist(list)) throw new Error("Couldn't save: browser storage is full or blocked.");
    SP.register(v.spec); return id;
  };
  B.remove = (id) => { persist(B.saved().filter((s) => SP.idOf(SP.validate(s).spec) !== id)); SP.unregister(id); if (B.isCommunity(id)) { const c = COMMUNITY.find((x) => SP.idOf(SP.validate(x).spec) === id); if (c) SP.register(Object.assign({}, c)); } };
  B.isCommunity = (id) => COMMUNITY.some((c) => { try { return SP.idOf(SP.validate(c).spec) === id; } catch (e) { return false; } });
  B.importJSON = (text) => {
    if (typeof text !== 'string' || text.length > 40000) throw new Error('File is too large to be a strategy.');
    let raw; try { raw = JSON.parse(text); } catch (e) { throw new Error("That isn't valid JSON."); }
    const v = SP.validate(raw); if (!v.ok) throw new Error('Not a valid ExTerm strategy: ' + v.errors.slice(0, 3).join('; '));
    return v.spec;
  };

  /* ---- editor ---- */
  const opOptions = (cur, allowConst) => Object.entries(SP.OPS).filter(([k]) => allowConst || k !== 'const').map(([k, d]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(d.l)}</option>`).join('');
  const cmpOptions = (cur) => Object.entries(SP.CMP).map(([k, l]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const operandUI = (o, side, gi, ci) => {
    const d = SP.OPS[o.k] || {};
    const extra = d.v ? `<input class="in num bd-v" type="number" step="any" value="${esc(o.v)}" data-f="${side}.v" aria-label="Number">` : d.n ? `<input class="in num bd-n" type="number" min="${d.n[1]}" max="${d.n[2]}" step="1" value="${esc(o.n != null ? o.n : d.n[0])}" data-f="${side}.n" aria-label="Period" title="Period">` : '';
    return `<span class="bd-op"><select class="in" data-f="${side}.k" aria-label="${side === 'a' ? 'Left' : 'Right'} value">${opOptions(o.k, side === 'b')}</select>${extra}</span>`;
  };
  const groupUI = (g, gi, title) => {
    const mode = g.all ? 'all' : 'any', list = g[mode] || [];
    return `<div class="bd-group" data-g="${gi}"><div class="bd-gh"><b>${title}</b><span class="note">when</span><div class="seg sm bd-mode"><button type="button" data-mode="all" class="${mode === 'all' ? 'on' : ''}">ALL</button><button type="button" data-mode="any" class="${mode === 'any' ? 'on' : ''}">ANY</button></div><span class="note">of these are true</span></div>
      ${list.map((c, ci) => `<div class="bd-cond" data-c="${ci}">${operandUI(c.a, 'a', gi, ci)}<select class="in bd-cmp" data-f="op" aria-label="Comparison">${cmpOptions(c.op)}</select>${operandUI(c.b, 'b', gi, ci)}<button type="button" class="ghost bd-del" title="Remove condition" aria-label="Remove condition">✕</button></div>`).join('') || '<div class="note bd-empty">No conditions yet.</div>'}
      <button type="button" class="btn sm bd-add">＋ Add condition</button></div>`;
  };
  B.render = () => {
    const host = $('#builder'); if (!host) return;
    if (!B.draft) B.draft = clone(SP.TEMPLATES[0]);
    const d = B.draft, v = SP.validate(d), r = d.risk || {};
    const mine = B.saved(), comm = COMMUNITY.map((c) => SP.validate(c).spec);
    const row = (sp, kind) => { const id = SP.idOf(sp), lb = B.lb[id]; return `<div class="bd-item" data-id="${esc(id)}"><div class="bd-it"><b>${esc(sp.name)}</b>${sp.author ? ` <span class="note">by ${esc(sp.author)}</span>` : ''}<div class="note">${esc(SP.describe(sp))}</div></div>
      <div class="bd-lb">${lb ? (lb.err ? `<span class="tag dn" title="${esc(lb.err)}">error</span>` : `<span class="grade g-${esc(lb.grade || '?').toLowerCase()}" title="Validation grade">${esc(lb.grade || '…')}</span><span class="num ${cls(lb.ret)}">${NT.fmtPct(lb.ret, 1)}</span><span class="note">${lb.trades} trades</span>`) : ''}</div>
      <div class="bd-ia"><button type="button" class="btn sm" data-act="load">Edit</button><button type="button" class="btn sm" data-act="use">Use</button>${kind === 'mine' ? '<button type="button" class="ghost" data-act="del" title="Delete" aria-label="Delete strategy">✕</button>' : ''}</div></div>`; };
    host.innerHTML = `<h3>✎ Strategy builder <span class="sp"></span><span class="note">no code · validated · exports Pine Script v5</span></h3>
    <div class="bd-grid"><form class="pb bd-edit" id="bdForm" autocomplete="off">
      <div class="bd-top"><label class="f">Name<input class="in" id="bdName" maxlength="48" value="${esc(d.name)}"></label><label class="f">Start from<select class="in" id="bdTpl"><option value="">Template…</option>${SP.TEMPLATES.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}<option value="blank">Blank strategy</option></select></label></div>
      <label class="f">Description<input class="in" id="bdDesc" maxlength="300" value="${esc(d.desc || '')}" placeholder="What is this strategy trying to catch?"></label>
      ${groupUI(d.entry, 'entry', '🟢 Buy')}${groupUI(d.exit, 'exit', '🔴 Sell')}
      <div class="bd-risk"><b>🛡 Risk</b><label class="f">Stop loss %<input class="in num" id="bdSl" type="number" step="0.1" min="0" value="${esc(r.sl || '')}" placeholder="off"></label><label class="f">Take profit %<input class="in num" id="bdTp" type="number" step="0.1" min="0" value="${esc(r.tp || '')}" placeholder="off"></label><label class="f">Trailing stop %<input class="in num" id="bdTr" type="number" step="0.1" min="0" value="${esc(r.trail || '')}" placeholder="off"></label></div>
      <div class="bd-preview ${v.ok ? '' : 'bad'}" id="bdPrev">${v.ok ? '📝 ' + esc(SP.describe(v.spec)) : '⚠ ' + esc(v.errors.slice(0, 3).join(' · '))}</div>
      <div class="bd-actions"><button type="submit" class="btn pri" ${v.ok ? '' : 'disabled'}>💾 Save to my strategies</button><button type="button" class="btn" id="bdTest" ${v.ok ? '' : 'disabled'}>▶ Backtest on ${esc(baseOf(ST.sel))}</button><button type="button" class="btn" id="bdVal" ${v.ok ? '' : 'disabled'}>🧪 Validate</button>
        <button type="button" class="btn" id="bdPine" ${v.ok ? '' : 'disabled'}>⤴ Export Pine Script v5</button><button type="button" class="btn" id="bdJson" ${v.ok ? '' : 'disabled'}>⤓ Share JSON</button><label class="btn" for="bdFile" tabindex="0">⤒ Import JSON</label><input type="file" id="bdFile" accept=".json,application/json" hidden></div>
      <div id="bdOut" class="bd-out">${B.out}</div></form>
      <div class="pb bd-lib"><div class="bd-lh"><b>My strategies</b><span class="note">${mine.length}</span></div>${mine.length ? mine.map((s) => row(s, 'mine')).join('') : '<div class="note">Strategies you save appear here and in every strategy menu.</div>'}
        <div class="bd-lh"><b>Community library</b><span class="note">${comm.length}</span><span class="sp"></span><button type="button" class="btn sm" id="bdRank" ${B.busy ? 'disabled' : ''}>${B.busy ? 'Ranking…' : '🏆 Rank on ' + esc(baseOf(ST.sel))}</button></div>
        ${comm.length ? comm.map((s) => row(s, 'comm')).join('') : '<div class="note">No community strategies bundled yet.</div>'}
        <div class="note" style="margin-top:8px">Share yours: export the JSON and open a pull request adding it to <span class="mono">community/strategies/</span> on GitHub. Every file is checked automatically.</div></div></div>`;
    bind(host);
  };

  const readForm = () => {
    const d = B.draft; d.name = $('#bdName').value; d.desc = $('#bdDesc').value;
    const rv = (id) => { const x = $(id).value.trim(); return x === '' ? undefined : +x; };
    d.risk = {}; const sl = rv('#bdSl'), tp = rv('#bdTp'), tr = rv('#bdTr'); if (sl) d.risk.sl = sl; if (tp) d.risk.tp = tp; if (tr) d.risk.trail = tr;
  };
  const refreshPreview = () => {
    readForm(); const v = SP.validate(B.draft), p = $('#bdPrev'); if (!p) return;
    p.className = 'bd-preview ' + (v.ok ? '' : 'bad'); p.textContent = v.ok ? '📝 ' + SP.describe(v.spec) : '⚠ ' + v.errors.slice(0, 3).join(' · ');
    $$('#bdForm .bd-actions button').forEach((b) => { if (b.type === 'submit' || ['bdTest', 'bdVal', 'bdPine', 'bdJson'].includes(b.id)) b.disabled = !v.ok; });
  };
  const ctx = async () => { const tf = ST.tf && NT.TF[ST.tf] ? ST.tf : '1h', c = await History.get(ST.sel, NT.TF[tf], 5000); return { tf, c, o: { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: NT.TF[tf] } }; };
  const setOut = (h) => { B.out = h; const o = $('#bdOut'); if (o) o.innerHTML = h; };

  function bind(host) {
    const f = $('#bdForm');
    f.addEventListener('input', (e) => {
      const el = e.target, cond = el.closest('.bd-cond'), grp = el.closest('.bd-group');
      if (cond && grp && el.dataset.f) {
        const g = B.draft[grp.dataset.g], list = g.all || g.any, c = list[+cond.dataset.c], f2 = el.dataset.f;
        if (f2 === 'op') c.op = el.value;
        else { const [side, prop] = f2.split('.'); if (prop === 'k') { const d = SP.OPS[el.value]; c[side] = d.v ? { k: 'const', v: 0 } : d.n ? { k: el.value, n: d.n[0] } : { k: el.value }; B.render(); return; } c[side][prop] = el.value === '' ? '' : +el.value; }
      }
      refreshPreview();
    });
    f.addEventListener('change', (e) => { if (e.target.closest('.bd-cond') && e.target.tagName === 'SELECT' && e.target.dataset.f && e.target.dataset.f.endsWith('.k')) return; });
    f.addEventListener('click', (e) => {
      const grp = e.target.closest('.bd-group'); if (!grp) return;
      const g = B.draft[grp.dataset.g];
      if (e.target.closest('.bd-mode button')) { readForm(); const m = e.target.closest('button').dataset.mode, list = g.all || g.any || []; B.draft[grp.dataset.g] = { [m]: list }; B.render(); }
      else if (e.target.closest('.bd-add')) { readForm(); const list = g.all || g.any; if (list.length >= 8) return toast('Up to 8 conditions per group.', 'amb'); list.push({ a: { k: 'price' }, op: '>', b: { k: 'ema', n: 50 } }); B.render(); }
      else if (e.target.closest('.bd-del')) { readForm(); const list = g.all || g.any; list.splice(+e.target.closest('.bd-cond').dataset.c, 1); B.render(); }
    });
    $('#bdTpl').onchange = (e) => { const v = e.target.value; if (!v) return; B.draft = v === 'blank' ? blank() : clone(SP.TEMPLATES[+v]); B.out = ''; B.render(); };
    f.onsubmit = (e) => { e.preventDefault(); readForm(); try { const id = B.save(B.draft); toast(`Saved <b>${esc(B.draft.name)}</b>. It's now in every strategy menu.`, 'up'); if (typeof renderSetup === 'function') renderSetup(); B.render(); return id; } catch (err) { toast(esc(err.message), 'dn', 7000); } };
    $('#bdTest').onclick = async () => {
      readForm(); const v = SP.validate(B.draft); if (!v.ok) return;
      setOut('<div class="note shimmer">Backtesting…</div>');
      try {
        const tmpId = SP.register(Object.assign({}, v.spec, { name: v.spec.name })); const { tf, c, o } = await ctx();
        if (c.length < 100) throw new Error('Not enough history for ' + baseOf(ST.sel) + ' ' + tf);
        const r = await BTW.run({ type: 'bt', strat: tmpId, params: {}, candles: c, o });
        const s = r.res.stats, bh = (c[c.length - 1].c / c[0].c - 1) * 100;
        setOut(`<div class="bd-stats"><div><span class="note">Return</span><b class="${cls(s.ret)}">${NT.fmtPct(s.ret, 1)}</b></div><div><span class="note">Buy &amp; hold</span><b class="${cls(bh)}">${NT.fmtPct(bh, 1)}</b></div><div><span class="note">Max drawdown</span><b class="dn">-${s.maxDD.toFixed(1)}%</b></div><div><span class="note">Win rate</span><b>${s.winRate != null ? s.winRate.toFixed(0) + '%' : '–'}</b></div><div><span class="note">Trades</span><b>${s.closed}</b></div></div><div class="note">${esc(baseOf(ST.sel))} ${esc(tf)} · ${NT.fmtQty(c.length)} candles · fees and slippage included. Past results don't guarantee future ones.</div>`);
      } catch (err) { setOut(`<div class="note dn">${esc(err.message)}</div>`); }
    };
    $('#bdVal').onclick = async () => {
      readForm(); const v = SP.validate(B.draft); if (!v.ok) return;
      setOut('<div class="note shimmer">Running the 17-test validation lab…</div>');
      try {
        const id = SP.register(v.spec), { tf, c, o } = await ctx();
        if (c.length < 300) throw new Error('Validation needs at least 300 candles of history.');
        const r = await BTW.run({ type: 'validate', strat: id, params: {}, candles: c, o }, (p) => setOut(progBar((p.prog / p.total) * 100, `🧪 ${esc(p.phase)} (${p.prog}/${p.total})`)));
        setOut(`<div class="bd-val"><span class="grade big g-${esc(r.v.grade).toLowerCase()}">${esc(r.v.grade)}</span><div><b>${esc(r.v.verdict)}</b><div class="note">${r.v.checks.filter((x) => x.status === 'pass').length}/${r.v.checks.length} tests passed on ${esc(baseOf(ST.sel))} ${esc(tf)}.</div></div></div>`);
      } catch (err) { setOut(`<div class="note dn">${esc(err.message)}</div>`); }
    };
    $('#bdPine').onclick = () => {
      readForm(); const v = SP.validate(B.draft); if (!v.ok) return;
      const code = SP.toPine(v.spec);
      setOut(`<div class="bd-code"><div class="row"><b>Pine Script v5</b><span class="sp"></span><button type="button" class="btn sm" id="bdCopy">Copy</button><button type="button" class="btn sm" id="bdDl">Download .pine</button></div><pre class="mono">${esc(code)}</pre><div class="note">Paste into any Pine Script v5 compatible editor. Results can differ slightly from ExTerm's engine. ExTerm is not affiliated with any charting platform.</div></div>`);
      $('#bdCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Copied Pine Script', 'up'); } catch (e) { toast('Copy blocked: select the code and copy it manually.', 'amb'); } };
      $('#bdDl').onclick = () => download(SP.idOf(v.spec) + '.pine', code);
    };
    $('#bdJson').onclick = () => { readForm(); const v = SP.validate(B.draft); if (!v.ok) return; download(SP.idOf(v.spec).replace(/^cs_/, '') + '.json', JSON.stringify(v.spec, null, 2), 'application/json'); toast('Strategy JSON downloaded. Share it or open a pull request to the community library.', 'up'); };
    $('#bdFile').onchange = async (e) => {
      const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
      if (file.size > 40000) return toast('That file is too large to be a strategy.', 'dn');
      try { B.draft = B.importJSON(await file.text()); B.out = '<div class="note up">Imported. Review the rules, then save.</div>'; B.render(); } catch (err) { toast(esc(err.message), 'dn', 8000); }
    };
    host.querySelectorAll('.bd-item [data-act]').forEach((b) => b.onclick = () => {
      const id = b.closest('.bd-item').dataset.id, sp = SP.get(id); if (!sp) return;
      if (b.dataset.act === 'load') { B.draft = clone(sp); if (B.isCommunity(id)) { delete B.draft.author; B.draft.name = (sp.name + ' (my copy)').slice(0, 48); } B.out = ''; B.render(); $('#bdName').focus(); }
      else if (b.dataset.act === 'use') { const tf = ST.tf && NT.TF[ST.tf] ? ST.tf : '1h'; Object.assign(ST.setup, { strat: id, sym: ST.sel, tf, paramsFor: null, paramsOverride: null }); renderSetup(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast(`Loaded <b>${esc(sp.name)}</b> into the backtester and bot setup.`, 'up'); }
      else if (b.dataset.act === 'del') { B.remove(id); if (ST.setup && ST.setup.strat === id && !NT.strategies[id]) { ST.setup.strat = 'pro_ensemble'; ST.setup.paramsFor = null; } toast('Deleted.', 'acc'); B.render(); if (typeof renderSetup === 'function') renderSetup(); saveState(); }
    });
    $('#bdRank').onclick = B.rank;
  }

  /* community leaderboard: backtest + validation grade of every community strategy on the selected market */
  B.rank = async () => {
    if (B.busy) return; B.busy = true; B.render();
    try {
      const { c, o } = await ctx(); if (c.length < 300) throw new Error('Not enough history to rank on this market.');
      for (const sp of COMMUNITY) {
        const v = SP.validate(sp); if (!v.ok) continue; const id = SP.idOf(v.spec);
        try { const bt = await BTW.run({ type: 'bt', strat: id, params: {}, candles: c, o }); const va = await BTW.run({ type: 'validate', strat: id, params: {}, candles: c, o }); B.lb[id] = { ret: bt.res.stats.ret, trades: bt.res.stats.closed, grade: va.v.grade, score: va.v.score }; }
        catch (e) { B.lb[id] = { err: e.message }; }
        B.render();
      }
      COMMUNITY.sort((a, b) => ((B.lb[SP.idOf(SP.validate(b).spec)] || {}).score || -1) - ((B.lb[SP.idOf(SP.validate(a).spec)] || {}).score || -1));
    } catch (e) { toast(esc(e.message), 'dn'); }
    B.busy = false; B.render();
  };
  return B;
})();
Builder.loadAll();
