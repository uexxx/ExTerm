/* ExTerm themes + 3D interaction layer.
   Several colour themes (the previous palette stays available as "Classic"), an optional colour-blind-friendly
   up/down pair, and pointer-driven 3D tilt on cards when 3D effects are set to Full. */
const Themes = (() => {
  const T = {};
  T.LIST = [
    { id: 'obsidian', name: 'Obsidian & Gold', desc: 'The @exterm.labs look: obsidian black, brushed gold and silver.', sw: ['#070707', '#D4AF37', '#CBD5E1', '#2fd08a'] },
    { id: 'nova', name: 'Nova', desc: 'Deep space with violet-to-pink neon. The new default.', sw: ['#05060e', '#8b5cf6', '#ec4899', '#19e3a1'] },
    { id: 'cyber', name: 'Cyber Lime', desc: 'Terminal black with acid lime and cyan.', sw: ['#050705', '#b8ff3c', '#22d3ee', '#3dffa0'] },
    { id: 'gold', name: 'Gold Rush', desc: 'Obsidian with molten gold, exchange-style.', sw: ['#0a0805', '#f7b928', '#ff7a1a', '#21d07a'] },
    { id: 'arctic', name: 'Arctic', desc: 'Calm slate and ice blue for long sessions.', sw: ['#061019', '#38bdf8', '#2dd4bf', '#34d399'] },
    { id: 'synth', name: 'Synthwave', desc: 'Retro sunset neon: magenta into orange.', sw: ['#0f0619', '#ff2bd6', '#ff9a3d', '#2cf5c3'] },
    { id: 'carbon', name: 'Carbon', desc: 'Minimal graphite, colour only where it matters.', sw: ['#0a0a0b', '#e5e7eb', '#a1a1aa', '#22c55e'] },
    { id: 'classic', name: 'Classic', desc: 'The previous ExTerm colours, with per-market accents.', sw: ['#060912', '#7b61ff', '#22d3ee', '#0ecb81'] },
  ];
  const IDS = new Set(T.LIST.map((t) => t.id));
  const LEGACY = { midnight: 'nova', aurora: 'synth', ocean: 'arctic' }; // older theme names map onto the new set
  T.cur = () => { const t = (typeof ST !== 'undefined' && ST && ST.theme) || 'nova'; return IDS.has(t) ? t : LEGACY[t] || 'nova'; };
  T.apply = (id) => {
    const t = IDS.has(id) ? id : T.cur();
    if (typeof ST !== 'undefined' && ST) { ST.theme = t; }
    document.body.dataset.theme = t;
    document.body.classList.toggle('cb', !!(typeof ST !== 'undefined' && ST && ST.settings && ST.settings.cbColors));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = T.LIST.find((x) => x.id === t).sw[0];
  };
  T.set = (id) => {
    if (!IDS.has(id)) return;
    document.body.classList.add('theme-swap'); T.apply(id); saveState();
    if (typeof chart !== 'undefined' && chart) chartRefresh(true);
    if (typeof WS !== 'undefined') WS.charts.forEach((c) => c.invalidate());
    setTimeout(() => document.body.classList.remove('theme-swap'), 700);
    T.syncPicker();
  };
  const sw = (t) => `<span class="th-sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
  T.pickerHTML = () => `<div class="panel" id="themePanel"><h3>🎨 Theme <span class="sp"></span><label class="chk"><input type="checkbox" id="thCb" ${ST.settings.cbColors ? 'checked' : ''}> Colour-blind friendly up/down (blue / orange)</label></h3>
    <div class="pb th-grid">${T.LIST.map((t) => `<button type="button" class="th-card ${t.id === T.cur() ? 'on' : ''}" data-theme-pick="${t.id}" aria-pressed="${t.id === T.cur()}" style="--t0:${t.sw[0]};--t1:${t.sw[1]};--t2:${t.sw[2]};--t3:${t.sw[3]}">
      <span class="th-prev"><i class="a"></i><i class="b"></i><i class="c"></i><svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,24 14,20 26,22 40,12 54,15 68,7 82,10 100,3" fill="none" stroke="${t.sw[3]}" stroke-width="2.4"/></svg></span>
      <b>${esc(t.name)}</b><span class="note">${esc(t.desc)}</span>${sw(t)}</button>`).join('')}</div></div>`;
  T.mountPicker = () => {
    const host = $('#setBody'); if (!host || $('#themePanel')) return;
    const d = document.createElement('div'); d.innerHTML = T.pickerHTML(); host.prepend(d.firstChild);
    $('#thCb').onchange = (e) => { ST.settings.cbColors = e.target.checked; T.apply(T.cur()); saveState(); if (typeof chart !== 'undefined' && chart) chartRefresh(true); };
  };
  T.syncPicker = () => $$('[data-theme-pick]').forEach((b) => { const on = b.dataset.themePick === T.cur(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  // quick popover from the header 🎨 button
  T.popover = (anchor) => {
    let p = $('#thPop'); if (p) { p.remove(); return; }
    p = document.createElement('div'); p.id = 'thPop'; p.className = 'th-pop'; p.setAttribute('role', 'menu');
    p.innerHTML = `<div class="note" style="padding:4px 6px 8px">Theme</div>` + T.LIST.map((t) => `<button type="button" role="menuitemradio" aria-checked="${t.id === T.cur()}" data-theme-pick="${t.id}" class="${t.id === T.cur() ? 'on' : ''}">${sw(t)}<span>${esc(t.name)}</span></button>`).join('') + `<button type="button" class="th-more" data-th-more>All themes & options…</button>`;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); p.style.top = Math.round(r.bottom + 8) + 'px'; p.style.right = Math.round(innerWidth - r.right) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!p.contains(e.target) && e.target !== anchor) { p.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  };
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-theme-pick]'); if (b) { T.set(b.dataset.themePick); const p = $('#thPop'); if (p && p.contains(b)) setTimeout(() => p.remove(), 160); return; }
    if (e.target.closest && e.target.closest('[data-th-more]')) { const p = $('#thPop'); if (p) p.remove(); showTab('set'); }
  });

  /* ---- 3D tilt: cards lean toward the pointer with a moving highlight (only with 3D effects on Full) ---- */
  const TILT = '.stat, .kpi, .th-card, .tile, .bd-item, .safe-list li, .ch-kpi, .ins-bad, .ins-good, .ins-warn';
  let cur = null, raf = 0, last = null;
  const allowed = () => !document.body.classList.contains('fx-off') && !document.body.classList.contains('fx-subtle') && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reset = (el) => { if (!el) return; el.classList.remove('tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx'); el.style.removeProperty('--my'); };
  const frame = () => {
    raf = 0; if (!last) return;
    const el = last.target.closest && last.target.closest(TILT);
    if (el !== cur) { reset(cur); cur = el; }
    if (!cur || !allowed() || cur.querySelector('input, textarea, select, canvas, button')) { reset(cur); return; } // never tilt anything you type into or click precisely (v13: buttons too)
    const r = cur.getBoundingClientRect(); if (r.width > 900 || r.height > 700) { reset(cur); return; } // big panels stay flat: tilting them hurts readability
    const x = (last.clientX - r.left) / r.width, y = (last.clientY - r.top) / r.height, k = r.width < 260 ? 7 : r.width < 480 ? 4.5 : 2.6;
    cur.classList.add('tilting'); cur.style.setProperty('--ry', ((x - 0.5) * k).toFixed(2) + 'deg'); cur.style.setProperty('--rx', ((0.5 - y) * k).toFixed(2) + 'deg');
    cur.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); cur.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; last = e; if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
    document.addEventListener('pointerleave', () => { reset(cur); cur = null; }, { passive: true });
  }
  return T;
})();
applyTheme = function () { Themes.apply(Themes.cur()); };
