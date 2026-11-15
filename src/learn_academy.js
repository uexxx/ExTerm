/* ExTerm v15.4 Learn ExTerm Academy. One translated "Learn ExTerm" button beside Settings in the top functions bar opens
   an Obsidian & Gold overlay: fuzzy "How do I…" search, goal-based 15-minute learning paths, a 5-Minute Quick-Start
   track with a mastery bar, and every tab / subcategory as lesson cards (What It Does · Step-by-Step · Pro Tip / Risk
   Guardrail · Shortcut · Try It Live → with a gold spotlight ring · Start Drill sandbox verified live). Advanced panels
   gain a subtle "?" / Alt+hover Explain-This-Metric popover. Move the button into Settings → Documentation & Academy by
   changing LEARN_MOUNT_TARGET only. Strict CSP: listeners in JS, every dynamic string through esc(). Logic: V154. */
const LEARN_MOUNT_TARGET = 'topbar'; // 'topbar' | 'settings'
const LearnUI = (() => {
  const U = { drill: null, target: null };
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const cfg = () => { const c = ST.v154 && typeof ST.v154 === 'object' ? ST.v154 : (ST.v154 = {}); c.done = V154.cleanDone(c.done); c.badges = V154.cleanDone(c.badges); if (!V154.PATHS[c.goal]) c.goal = 'perps'; return c; };
  const catName = (k) => (V154.CATS.find((c) => c[0] === k) || [k, k])[1];
  const bar = (p, label) => `<div class="lx-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="${esc(label)}"><i style="width:${p.pct}%"></i></div><span class="note">${esc(p.done)} / ${esc(p.total)} ${esc(T('learn.modules'))}</span>`;
  const card = (m) => { const done = cfg().done.includes(m.id), badge = cfg().badges.includes(m.id);
    return `<article class="lx-card${done ? ' done' : ''}" data-mod="${esc(m.id)}"><header><b>${esc(m.title)}</b>${badge ? '<span class="lx-badge" title="Drill badge">🏅</span>' : ''}${done ? '<span class="lx-ok">✓</span>' : ''}<span class="note">${esc(m.min)} min</span></header>
      <h5>${esc(T('learn.what'))}</h5><p>${esc(m.what)}</p><h5>${esc(T('learn.steps'))}</h5><ol>${m.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <h5>${esc(T('learn.tip'))}</h5><p class="lx-tip">${esc(m.tip)}</p>${m.key ? `<h5>${esc(T('learn.key'))}</h5><p><kbd>${esc(m.key)}</kbd></p>` : ''}
      <div class="row lx-acts"><button type="button" class="btn sm pri" data-lx="try" data-id="${esc(m.id)}">${esc(T('learn.try'))} →</button>${m.drill ? `<button type="button" class="btn sm" data-lx="drill" data-id="${esc(m.id)}">🎯 ${esc(T('learn.drill'))}</button>` : ''}<button type="button" class="btn sm ghost" data-lx="done" data-id="${esc(m.id)}">${done ? '↺' : '✓'}</button></div></article>`; };
  const list = (mods) => (mods.length ? `<div class="lx-grid">${mods.map(card).join('')}</div>` : `<div class="note">–</div>`);

  /* ══ overlay ══ */
  const paint = (ov) => {
    const c = cfg(), q = ov.querySelector('#lxQ').value, quick = V154.progress(c.done, V154.QUICK), all = V154.progress(c.done), P = V154.path(c.goal), body = ov.querySelector('#lxBody');
    ov.querySelector('#lxStats').innerHTML = `<div><b>${esc(T('learn.quick'))}</b>${bar(quick, T('learn.quick'))}</div><div><b>${esc(T('learn.mastery'))}</b>${bar(all, T('learn.mastery'))}</div>`;
    for (const b of ov.querySelectorAll('[data-goal]')) { b.classList.toggle('on', b.dataset.goal === c.goal); b.setAttribute('aria-pressed', b.dataset.goal === c.goal); }
    if (q.trim()) { const hits = V154.search(q); body.innerHTML = `<div class="note">${esc(hits.length)} · “${esc(q.slice(0, 60))}”</div>${list(hits)}`; return; }
    body.innerHTML = `<section class="lx-path"><h4>🧭 ${esc(T('learn.path'))} · ${esc((V154.GOALS.find((g) => g[0] === c.goal) || [])[1])} · ${esc(P.minutes)} min</h4><ol class="lx-play">${P.items.map((it, i) => { const m = V154.byId(it.id); return `<li class="${c.done.includes(it.id) ? 'done' : ''}"><span class="n">${i + 1}</span><b>${esc(m.title)}</b><span class="note">${esc(it.min)} min${it.drill ? ' · 🎯' : ''}</span><button type="button" class="btn xs" data-lx="open" data-id="${esc(it.id)}">${esc(T('learn.open'))}</button>${it.drill ? `<button type="button" class="btn xs pri" data-lx="drill" data-id="${esc(it.id)}">${esc(T('learn.drill'))}</button>` : ''}</li>`; }).join('')}</ol></section>
      <section><h4>⚡ ${esc(T('learn.quick'))}</h4>${list(V154.QUICK.map(V154.byId))}</section>
      ${V154.CATS.map(([k, n, ic]) => { const mods = V154.MODULES.filter((m) => m.cat === k), p = V154.progress(c.done, mods.map((m) => m.id)); return `<details class="lx-cat" data-cat="${k}"><summary><span aria-hidden="true">${ic}</span> ${esc(n)} <span class="note">${esc(p.done)}/${esc(p.total)}</span></summary><div data-catbody="${k}"></div></details>`; }).join('')}`;
  };
  U.open = (id) => {
    let ov = $('#learnOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'learnOv'; ov.className = 'lx-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'lxTitle');
      ov.innerHTML = `<div class="lx-wrap"><header class="lx-hero"><span class="lx-mark" aria-hidden="true">🎓</span><div><h2 id="lxTitle" data-i18n="learn.hero">${esc(T('learn.hero'))}</h2><div class="note" data-i18n="learn.sub">${esc(T('learn.sub'))}</div></div><button type="button" class="x" data-lx="close" aria-label="Close">×</button></header>
        <div class="lx-goals" role="group" aria-label="${esc(T('learn.path'))}">${V154.GOALS.map(([k, n]) => `<button type="button" class="pill" data-goal="${k}">${esc(n)}</button>`).join('')}</div>
        <input class="in lx-q" id="lxQ" type="search" autocomplete="off" spellcheck="false" data-i18n-ph="learn.search" placeholder="${esc(T('learn.search'))}" aria-label="${esc(T('learn.search'))}">
        <div class="lx-stats" id="lxStats"></div><div class="lx-body" id="lxBody"></div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => {
        if (e.target === ov) return U.close(); const g = e.target.closest('[data-goal]'); if (g) { cfg().goal = g.dataset.goal; saveState(); paint(ov); return; }
        const b = e.target.closest('[data-lx]'); if (!b) return; const a = b.dataset.lx, m = V154.byId(b.dataset.id);
        if (a === 'close') U.close(); else if (a === 'try' && m) U.tryLive(m); else if (a === 'drill' && m) U.startDrill(m); else if (a === 'open' && m) { ov.querySelector('#lxQ').value = m.title; paint(ov); }
        else if (a === 'done' && m) { const c = cfg(); c.done = c.done.includes(m.id) ? c.done.filter((x) => x !== m.id) : c.done.concat([m.id]); saveState(); paint(ov); }
      });
      ov.querySelector('#lxQ').addEventListener('input', () => paint(ov));
      ov.addEventListener('toggle', (e) => { const d = e.target; if (d.matches && d.matches('details.lx-cat') && d.open) { const k = d.dataset.cat, host = d.querySelector('[data-catbody]'); if (host && !host.innerHTML) host.innerHTML = list(V154.MODULES.filter((m) => m.cat === k)); } }, true);
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); U.close(); } });
    }
    ov.hidden = false; ov.dir = typeof I18N !== 'undefined' && I18N.isRtl(I18N.cur()) ? 'rtl' : 'ltr'; if (typeof I18N !== 'undefined') I18N.apply();
    const q = ov.querySelector('#lxQ'); if (id) { const m = V154.byId(id); q.value = m ? m.title : ''; } paint(ov); setTimeout(() => q.focus(), 30); return ov;
  };
  U.close = () => { const ov = $('#learnOv'); if (ov) ov.hidden = true; };

  /* ══ Try It Live: navigate to the exact tab / lab section and pulse a gold ring around the control ══ */
  U.spot = (sel) => { const el = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null || x.getClientRects().length); if (!el) return null; for (const o of document.querySelectorAll('.lx-spot')) o.classList.remove('lx-spot'); el.classList.add('lx-spot'); try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* old browser */ } setTimeout(() => el.classList.remove('lx-spot'), 4200); return el; };
  U.tryLive = (m) => {
    U.close(); const g = m.go || {}; if (g.mode && ST.mode !== g.mode && typeof setMode === 'function') setMode(g.mode); if (typeof showTab === 'function') showTab(g.tab || 'markets');
    if (g.lab && typeof renderLab === 'function') { try { labSec = g.lab; for (const x of document.querySelectorAll('#labNav button')) x.classList.toggle('on', x.dataset.v === g.lab); renderLab(); } catch (e) { /* lab optional */ } }
    if (m.cat === 'lead' && typeof LeaderUI !== 'undefined') { if (g.tab === 'social') LeaderUI.showPerp(true); }
    if (g.sel && g.sel.includes('v154Up') && typeof V154UpUI !== 'undefined') V154UpUI.open();
    let tries = 0; const go = () => { if (!U.spot(g.sel || 'main') && tries++ < 8) setTimeout(go, 250); }; setTimeout(go, 200);
    const c = cfg(); if (!c.done.includes(m.id)) { c.done.push(m.id); saveState(); }
  };

  /* ══ Start Drill: a seeded sandbox scenario on the chart; the action is verified live before the badge is awarded ══ */
  const snap = () => { const L = typeof V152UI !== 'undefined' && V152UI.ladder ? V152UI.ladder.L : null, z = $('#tkSize button.on');
    return { ladder: L ? { levels: L.levels.map((x) => ({ p: x.p })), moved: !!(U.drill && U.drill.moved) } : null, anchor: ST.v152 ? ST.v152.anchor : null, riskPct: $('#tkRisk') ? $('#tkRisk').value : null, sizeMode: z ? z.dataset.z : null, xray: !!(U.drill && U.drill.xray) }; };
  const DRILL = { ladder: ['breakout', 'Volatile breakout: drag any TP rung of the ladder to a new level.'], vwap: ['breakout', 'Volatile breakout: anchor VWAP on the breakout candle.'], risk: ['breakout', 'Size the trade by risk: switch the ticket to "Size by risk" and set Risk % between 0.25 and 2.'], pool: ['pool', 'Thin DEX pool: open the Holder Cluster X-Ray and read the coordinated share.'] };
  U.startDrill = (m) => {
    U.close(); if (U.drill) U.endDrill(false); if (typeof Replay !== 'undefined' && Replay.on) Replay.exit(); if (typeof showTab === 'function') showTab('markets');
    const [kind, msg] = DRILL[m.drill] || DRILL.ladder, D = V154.drillCandles(kind, 11);
    U.drill = { id: m.id, kind: m.drill, D, ts: Date.now() };
    try { chart.set(D, 60, [], null, ''); } catch (e) { /* chart not ready */ }
    if (m.drill === 'ladder' && typeof V152UI !== 'undefined') { const last = D[D.length - 1].c, lo = Math.min(...D.slice(-40).map((c) => c.l)), L = V152.tpLadder(last, Math.max(lo, last * 0.994), V152UI.cfg().splits); V152UI.ladder = { sym: ST.sel, L, qty0: 0 }; }
    U.drill.before = snap(); if (m.drill === 'vwap' && typeof V152UI !== 'undefined') V152UI.A.pickAv();
    let b = $('#learnDrill'); if (!b) { b = document.createElement('div'); b.id = 'learnDrill'; b.className = 'lx-drill'; b.setAttribute('role', 'status'); document.body.appendChild(b); b.addEventListener('click', (e) => { const a = e.target.closest('[data-dr]'); if (!a) return; if (a.dataset.dr === 'exit') U.endDrill(false); else if (a.dataset.dr === 'xray') { U.drill.xray = true; if (typeof V154UpUI !== 'undefined') V154UpUI.open('dex'); } }); }
    b.innerHTML = `<b>🎯 ${esc(T('learn.drill'))}: ${esc(m.title)}</b><span>${esc(msg)}</span><span class="tag">SANDBOX · simulated data</span>${m.drill === 'pool' ? '<button type="button" class="btn xs pri" data-dr="xray">Open X-Ray</button>' : ''}<button type="button" class="btn xs" data-dr="exit">Exit</button>`; b.hidden = false;
    if (typeof chart !== 'undefined' && chart) chart.invalidate();
    clearInterval(U.poll); U.poll = setInterval(U.checkDrill, 500);
  };
  U.checkDrill = () => { const d = U.drill; if (!d) return false; if (d.kind === 'ladder' && typeof V152UI !== 'undefined' && V152UI.ladder && d.before.ladder) d.moved = V152UI.ladder.L.levels.some((x, i) => Math.abs(x.p - d.before.ladder.levels[i].p) > 1e-9); if (V154.drillCheck(d.kind, d.before, snap())) { U.endDrill(true); return true; } return false; };
  U.endDrill = (won) => {
    const d = U.drill; clearInterval(U.poll); U.drill = null; const b = $('#learnDrill'); if (b) b.hidden = true; if (!d) return;
    if (d.kind === 'ladder' && typeof V152UI !== 'undefined') V152UI.ladder = null;
    if (won) { const c = cfg(); if (!c.badges.includes(d.id)) c.badges.push(d.id); if (!c.done.includes(d.id)) c.done.push(d.id); saveState(); toast('🏅 ' + esc(T('learn.badge')) + ': ' + esc((V154.byId(d.id) || {}).title || d.id), 'up', 5000); }
    if (typeof chartRefresh === 'function') chartRefresh(true);
  };

  /* ══ Explain This Metric: "?" buttons on advanced panels + Alt+hover anywhere on a tagged element ══ */
  const TARGETS = [['#q153Root details[data-sec="frag"] > summary', 'fragility'], ['.lb-alpha-h', 'alpha'], ['#v154Up [data-learn="charm"]', 'charm'], ['#v152Drawer input[data-c="gamma"]', 'gamma'], ['#v152Drawer input[data-c="cvdDiv"]', 'cvd'], ['#v154Up [data-learn="cvd"]', 'cvd'], ['#v154Up [data-learn="gamma"]', 'gamma']];
  U.decorate = () => { for (const [sel, k] of TARGETS) for (const el of document.querySelectorAll(sel)) { const host = el.tagName === 'INPUT' ? el.parentElement : el; if (!host || host.querySelector(':scope > .lx-q-btn')) continue; host.dataset.learn = k; const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-q-btn'; b.dataset.metric = k; b.textContent = '?'; b.setAttribute('aria-label', T('learn.explain') + ': ' + V154.METRICS[k].title); host.appendChild(b); } };
  U.explain = (k, at) => {
    const M = V154.METRICS[k]; if (!M) return null; let p = $('#lxPop'); if (!p) { p = document.createElement('div'); p.id = 'lxPop'; p.className = 'lx-pop'; p.setAttribute('role', 'tooltip'); document.body.appendChild(p); p.addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) { p.hidden = true; U.open(b.dataset.lesson); } }); }
    p.innerHTML = `<b>${esc(M.title)}</b><p>${esc(M.text)}</p><button type="button" class="btn xs pri" data-lesson="${esc(M.lesson)}">${esc(T('learn.full'))} →</button>`; p.hidden = false;
    const r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : { left: 40, bottom: 80 }; p.style.left = Math.max(8, Math.min(innerWidth - 300, r.left)) + 'px'; p.style.top = Math.min(innerHeight - 160, r.bottom + 6) + 'px'; return p;
  };

  /* ══ mounting: one constant decides top bar vs Settings → Documentation & Academy ══ */
  U.mount = (target = LEARN_MOUNT_TARGET) => {
    if (!V154.LEARN_MOUNT_TARGETS.includes(target)) target = 'topbar'; U.target = target;
    for (const x of document.querySelectorAll('#btnLearn, #learnSet')) x.remove();
    if (target === 'topbar') { const set = $('#nav button[data-tab="set"]'); if (!set) return; const b = document.createElement('button'); b.type = 'button'; b.id = 'btnLearn'; b.className = 'learn-btn'; b.innerHTML = `<span class="ni" aria-hidden="true">🎓</span><span data-i18n="learn.btn">${esc(T('learn.btn'))}</span>`; set.after(b); b.addEventListener('click', () => U.open()); }
    else U.mountSettings();
  };
  U.mountSettings = () => { if (U.target !== 'settings') return; const host = $('#setBody'); if (!host || $('#learnSet')) return; const d = document.createElement('div'); d.id = 'learnSet'; d.className = 'panel lx-set'; d.innerHTML = `<h3>📚 ${esc(T('learn.docs'))}</h3><div class="pb"><button type="button" class="btn pri" data-i18n="learn.btn">${esc(T('learn.btn'))}</button></div>`; host.prepend(d); d.querySelector('button').addEventListener('click', () => U.open()); };
  U.start = () => {
    U.mount(LEARN_MOUNT_TARGET);
    if (typeof chartRefresh === 'function') { const _cr = chartRefresh; chartRefresh = function () { if (U.drill) return; return _cr.apply(this, arguments); }; } // the sandbox owns the chart until the drill ends
    document.addEventListener('click', (e) => { const q = e.target.closest && e.target.closest('.lx-q-btn'); if (q) { e.preventDefault(); e.stopPropagation(); U.explain(q.dataset.metric, q); return; } const p = $('#lxPop'); if (p && !p.hidden && !e.target.closest('#lxPop')) p.hidden = true; }, true);
    document.addEventListener('mouseover', (e) => { if (!e.altKey) return; const h = e.target.closest && e.target.closest('[data-learn]'); if (h && V154.METRICS[h.dataset.learn]) U.explain(h.dataset.learn, h); });
    setInterval(() => { U.decorate(); U.mountSettings(); }, 1200);
    if (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS)) V14.SHORTCUTS.push(['🎓 Learn ExTerm', 'Interactive academy: search, learning paths, drills']);
  };
  U.cfg = cfg;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b154l = boot; boot = async function () { await _b154l.apply(this, arguments); try { LearnUI.start(); } catch (e) { console.warn('learn init', e); } }; }
