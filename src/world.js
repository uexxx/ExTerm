/* ExTerm v15: top-level 🌐 World tab. Full World Monitor feed (global breaking news + macro) with the Macro Shield read,
   severity / text filters, and a jump to the Grok tab where the shield's bot controls live. Reads the launcher's RAM cache
   through Grok.loadIntel (same source, same sanitizer P3.cleanIntel), so nothing new is fetched from the internet here. */
const WorldTab = (() => {
  const W = { sev: 'ALL', q: '', timer: 0 };
  const SEVS = ['ALL', 'CRITICAL', 'HIGH', 'MACRO', 'INFO'];
  /* pure: items already passed P3.cleanIntel */
  W.filter = (items, sev, q) => {
    const s = SEVS.includes(sev) ? sev : 'ALL', k = String(q || '').trim().toLowerCase().slice(0, 80);
    return (Array.isArray(items) ? items : []).filter((i) => (s === 'ALL' || i.sev === s) && (!k || (i.title + ' ' + i.source + ' ' + i.loc + ' ' + i.cat).toLowerCase().includes(k)));
  };
  W.counts = (items) => { const c = { ALL: 0, CRITICAL: 0, HIGH: 0, MACRO: 0, INFO: 0 }; for (const i of items || []) { c.ALL++; if (c[i.sev] != null) c[i.sev]++; } return c; };
  if (typeof document === 'undefined') return W; // node unit tests

  const row = (i) => `<div class="gk-intel"><span class="gk-badge ${esc(i.sev.toLowerCase())}">${esc(i.sev)}</span><div><div class="t">${i.link ? `<a href="${safeUrl(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</div><div class="note">${esc(i.source)}${i.cat ? ' · ' + esc(i.cat) : ''}${i.loc ? ' · ' + esc(i.loc) : ''}${i.ts ? ' · ' + esc(fmtStamp(i.ts * 1000)) : ''}</div></div></div>`;
  const render = () => {
    const body = $('#wdBody'); if (!body || curTab !== 'world') return;
    const I = Grok.intel, items = I ? I.items : [], sh = I ? P3.shield(items) : null, c = W.counts(items), list = W.filter(items, W.sev, W.q);
    $$('#wdSev button').forEach((b) => { b.classList.toggle('on', b.dataset.v === W.sev); const n = b.querySelector('.n'); if (n) n.textContent = c[b.dataset.v] || 0; });
    const lvl = sh ? sh.level : '', cl = lvl === 'CRITICAL' ? 'critical' : lvl === 'ELEVATED' ? 'high' : 'info';
    $('#wdShield').innerHTML = sh ? `<span class="gk-badge ${cl}">${esc(lvl)}</span><span>${esc(sh.advice)}</span><span class="note">${sh.crit.length} critical (1h) · ${sh.high.length} high (2h) · ${sh.macro.length} macro (4h)${I.ts ? ' · updated ' + esc(fmtStamp(I.ts * 1000)) : ''}</span>` : `<span class="note">${esc(Grok.intelErr || 'Loading World Monitor…')}</span>`;
    body.innerHTML = !I ? '' : list.length ? list.slice(0, 150).map(row).join('') : '<div class="empty">No headlines match this filter.</div>';
  };
  const load = (force) => Grok.loadIntel(force).then(render, render);
  const mount = () => {
    if ($('#tab-world')) return;
    const nb = document.createElement('button'); nb.dataset.tab = 'world'; nb.innerHTML = '<span class="ni">🌐</span>World';
    const g = $('#nav button[data-tab="grok"]'); if (g) g.before(nb); else { const n = $('#nav'); if (n) n.appendChild(nb); }
    const s = document.createElement('section'); s.id = 'tab-world'; s.className = 'tab';
    s.innerHTML = `<div class="panel wd-p"><div class="ph">🌐 World Monitor · global breaking news &amp; macro shield<span class="sp"></span><button type="button" class="btn sm" data-wd="refresh">↻ Refresh</button><button type="button" class="btn sm pri" data-wd="grok">⚡ Shield controls in Grok</button></div>
      <div class="pb"><div class="wd-shield" id="wdShield"></div>
      <div class="row wd-tools"><div class="seg" id="wdSev" role="tablist">${SEVS.map((v) => `<button type="button" data-v="${v}">${v === 'ALL' ? 'All' : v[0] + v.slice(1).toLowerCase()} <span class="n">0</span></button>`).join('')}</div><input class="in" id="wdQ" type="search" maxlength="80" placeholder="Filter: fed, oil, china…" aria-label="Filter headlines"></div>
      <div id="wdBody" class="wd-body"></div></div></div>`;
    const m = $('main'); if (m) m.appendChild(s);
    s.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v && b.closest('#wdSev')) { W.sev = b.dataset.v; render(); }
      else if (b.dataset.wd === 'refresh') load(true);
      else if (b.dataset.wd === 'grok') showTab('grok');
    });
    s.querySelector('#wdQ').addEventListener('input', (e) => { W.q = e.target.value; render(); });
    TABS.world = { show: () => { render(); load(false); clearInterval(W.timer); W.timer = setInterval(() => { if (curTab !== 'world') { clearInterval(W.timer); W.timer = 0; } else if (!document.hidden) load(false); }, 60000); }, render };
  };
  W.render = render; W.mount = mount;
  mount();
  return W;
})();
if (typeof module === 'object' && module.exports) module.exports = WorldTab;
