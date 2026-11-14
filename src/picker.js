/* ExTerm universal symbol picker — any crypto pair or stock/ETF, in either mode */
const SymPick = {
  el: null, st: null,
  cryptoName(base) {
    if (!SymPick._cn) { SymPick._cn = {}; try { for (const r of DEMO_COINS) SymPick._cn[r[0]] = r[1]; } catch (e) { } for (const [k, v] of Object.entries(NT.NAMES || {})) if (k.length > 4 && !SymPick._cn[v]) SymPick._cn[v] = k.replace(/\b\w/g, (c) => c.toUpperCase()); }
    return SymPick._cn[base] || '';
  },
  universe() {
    const seen = new Set(), out = [];
    const push = (o) => { if (!seen.has(o.sym)) { seen.add(o.sym); out.push(o); } };
    for (const p of Providers.list || []) push({ sym: p.id, t: p.base, name: SymPick.cryptoName(p.base), kind: 'crypto', cat: 'Crypto' });
    for (const s of Object.values(STOCK_INFO)) push({ sym: s.sym, t: s.sym, name: s.name, kind: s.sector === 'ETF' ? 'etf' : 'stock', cat: s.sector });
    if (typeof OC !== 'undefined') for (const s of Object.keys(OC.meta)) push(SymPick.ocRow(s));
    return out;
  },
  ocRow(s) {
    const m = OC.meta[s] || {}, p = OC.parse(s) || {}, st = OC.stats[s] || {};
    const liq = st.liq ? ' · liq $' + (st.liq >= 1e6 ? (st.liq / 1e6).toFixed(1) + 'M' : Math.round(st.liq / 1e3) + 'K') : '';
    return { sym: s, t: OC.label(s), name: (m.n || 'DEX token') + ' · ' + (OC.CHAINS[p.chain] ? OC.CHAINS[p.chain][0] : p.chain === 'sim' ? 'simulated' : p.chain) + liq, kind: 'onchain', cat: 'On-chain' };
  },
  label(sym) { if (isOnchain(sym)) { const r = SymPick.ocRow(sym); return { t: r.t, name: r.name, kind: 'onchain' }; } const st = isStock(sym), t = baseOf(sym); return { t, name: st ? (STOCK_INFO[sym] ? STOCK_INFO[sym].name : 'Stock') : SymPick.cryptoName(t) || 'Crypto', kind: st ? (STOCK_INFO[sym] && STOCK_INFO[sym].sector === 'ETF' ? 'etf' : 'stock') : 'crypto' }; },
  badge(sym, size) {
    const t = baseOf(sym), h = hash(t), st = isStock(sym), oc = isOnchain(sym);
    if (oc) return `<span class="sbadge" style="${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px;` : ''}background:linear-gradient(135deg,hsl(${150 + (h % 30)} 85% 42%),hsl(${265 + (h % 30)} 80% 50%))">${esc(t.slice(0, t.length > 4 ? 3 : 4))}</span>`;
    const c1 = st ? `hsl(${140 + (h % 60)} 55% 42%)` : `hsl(${250 + (h % 70)} 65% 55%)`, c2 = st ? `hsl(${170 + (h % 40)} 60% 28%)` : `hsl(${(h >> 6) % 360} 70% 38%)`;
    return `<span class="sbadge" style="${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px;` : ''}background:linear-gradient(135deg,${c1},${c2})">${esc(t.slice(0, t.length > 4 ? 3 : 4))}</span>`;
  },
  /** HTML for a picker field. A hidden input #id carries the value so existing form code keeps working. */
  field(id, sym, opt = {}) {
    const L = SymPick.label(sym), p = typeof px === 'function' ? px(sym) : null;
    return `<input type="hidden" id="${id}" value="${esc(sym)}"><button type="button" class="symfield ${opt.compact ? 'compact' : ''}" data-symfield="${id}" title="Pick any crypto or stock">${SymPick.badge(sym, opt.compact ? 22 : 28)}<span class="sf-t"><b>${esc(L.t)}</b><small>${esc(L.name)}</small></span>${p ? `<span class="sf-p mono">${NT.fmtPrice(p)}</span>` : ''}<span class="sf-k ${L.kind}">${L.kind === 'crypto' ? '◆' : '▲'}</span><span class="sf-c">⌄</span></button>`;
  },
  /** wire every [data-symfield] inside root; onPick(sym, id) fires after the hidden input is updated */
  bind(root, onPick) {
    (root || document).querySelectorAll('[data-symfield]').forEach((b) => {
      b.onclick = (e) => { e.preventDefault(); const id = b.dataset.symfield, inp = document.getElementById(id); SymPick.open(b, inp ? inp.value : '', (s) => { if (inp) inp.value = s; const tmp = document.createElement('div'); tmp.innerHTML = SymPick.field(id, s, { compact: b.classList.contains('compact') }); const nb = tmp.querySelector('button'); b.replaceWith(nb); SymPick.bind(nb.parentNode, onPick); if (onPick) onPick(s, id); }); };
    });
  },
  ensure() {
    if (SymPick.el) return SymPick.el;
    const d = document.createElement('div'); d.id = 'symPop'; d.className = 'sympop';
    d.innerHTML = `<div class="sp-in"><span>⌕</span><input id="spQ" placeholder="Search any coin, stock or ETF… (type a ticker)" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div><div class="seg sp-tabs" id="spTabs"></div><div class="sp-list" id="spList"></div><div class="sp-foot note">↑↓ to move · Enter to pick · works in both Crypto and Stocks mode</div>`;
    document.body.appendChild(d); SymPick.el = d;
    const q = d.querySelector('#spQ');
    q.oninput = () => { SymPick.st.q = q.value; SymPick.st.i = 0; SymPick.render(); };
    q.onkeydown = (e) => {
      const S = SymPick.st; if (!S) return;
      if (e.key === 'ArrowDown') { S.i = Math.min(S.rows.length - 1, S.i + 1); SymPick.render(true); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { S.i = Math.max(0, S.i - 1); SymPick.render(true); e.preventDefault(); }
      else if (e.key === 'Enter') { const r = S.rows[S.i]; if (r) SymPick.pick(r.sym); e.preventDefault(); }
      else if (e.key === 'Escape') SymPick.close();
    };
    d.querySelector('#spList').onclick = (e) => { const r = e.target.closest('[data-pick]'); if (r) SymPick.pick(r.dataset.pick); };
    document.addEventListener('mousedown', (e) => { if (SymPick.st && !d.contains(e.target) && !e.target.closest('[data-symfield]') && e.target.id !== 'symInput') SymPick.close(); });
    window.addEventListener('resize', () => SymPick.close());
    return d;
  },
  open(anchor, cur, onPick, opt = {}) {
    const d = SymPick.ensure();
    SymPick.st = { cur, onPick, q: opt.q || '', tab: opt.tab || (ST.mode === 'onchain' ? 'onchain' : 'all'), i: 0, rows: [], oc: {} };
    segBtns(d.querySelector('#spTabs'), [{ v: 'all', l: 'All' }, { v: 'crypto', l: '◆ Crypto' }, { v: 'stock', l: '▲ Stocks' }, { v: 'etf', l: 'ETFs' }, { v: 'onchain', l: '⬡ On-chain' }, { v: 'watch', l: '★ Watchlists' }, { v: 'recent', l: 'Recent' }], SymPick.st.tab, (v) => { SymPick.st.tab = v; SymPick.st.i = 0; SymPick.render(); });
    const r = anchor.getBoundingClientRect(), W = Math.min(440, window.innerWidth - 20);
    d.style.width = W + 'px'; d.style.left = Math.max(10, Math.min(window.innerWidth - W - 10, r.left)) + 'px';
    const below = window.innerHeight - r.bottom > 380; d.style.top = below ? r.bottom + 6 + 'px' : ''; d.style.bottom = below ? '' : window.innerHeight - r.top + 6 + 'px';
    d.classList.add('on'); const q = d.querySelector('#spQ'); q.value = SymPick.st.q; SymPick.render(); setTimeout(() => q.focus(), 10);
  },
  close() { if (SymPick.el) SymPick.el.classList.remove('on'); SymPick.st = null; },
  pick(sym) { const S = SymPick.st; if (!S) return; const R = (ST.recentSyms = [sym].concat((ST.recentSyms || []).filter((x) => x !== sym)).slice(0, 12)); void R; SymPick.close(); try { S.onPick(sym); } finally { if (typeof saveState === 'function') saveState(); } },
  render(keepScroll) {
    const S = SymPick.st; if (!S) return;
    const q = S.q.trim().toUpperCase().replace(/^\$/, ''), all = SymPick.universe(), watch = new Set((ST.mk ? ST.mk.crypto.watch.concat(ST.mk.stocks.watch, (ST.mk.onchain && ST.mk.onchain.watch) || [], ST.watch) : ST.watch) || []), rec = ST.recentSyms || [];
    let rows = S.tab === 'watch' ? all.filter((x) => watch.has(x.sym)) : S.tab === 'recent' ? rec.map((s) => all.find((x) => x.sym === s) || { sym: s, t: baseOf(s), name: '', kind: isOnchain(s) ? 'onchain' : isStock(s) ? 'stock' : 'crypto', cat: '' }) : S.tab === 'all' ? all : all.filter((x) => x.kind === S.tab);
    if (q) {
      const sc = (x) => (x.t === q ? 0 : x.t.startsWith(q) ? 1 : x.name.toUpperCase().startsWith(q) ? 2 : x.t.includes(q) ? 3 : x.name.toUpperCase().includes(q) ? 4 : 9);
      rows = rows.map((x) => [sc(x), x]).filter((a) => a[0] < 9).sort((a, b) => a[0] - b[0] || a[1].t.length - b[1].t.length).map((a) => a[1]);
      // free-typed ticker: offer it even if it's not in the built-in lists
      if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(q) && !rows.some((x) => x.t === q)) {
        const cr = Providers.ids && (Providers.ids.has(q + '-USD') ? q + '-USD' : null);
        if (cr) rows.unshift({ sym: cr, t: q, name: SymPick.cryptoName(q) || 'Crypto pair', kind: 'crypto', cat: 'Crypto' });
        else if (S.tab !== 'crypto' && S.tab !== 'onchain') rows.push({ sym: q, t: q, name: 'Use any US ticker “' + q + '”', kind: 'stock', cat: 'Stock' });
      }
    } else if (S.tab === 'all') {
      const top = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'XRP-USD', 'DOGE-USD', 'MSFT', 'COIN', 'MSTR'];
      const pri = new Map(rec.concat(top).map((s, k) => [s, k]));
      rows = rows.slice().sort((a, b) => (pri.has(a.sym) ? pri.get(a.sym) : 999) - (pri.has(b.sym) ? pri.get(b.sym) : 999));
    }
    if (S.tab === 'onchain' || (S.tab === 'all' && q.length >= 2 && ST.mode === 'onchain')) {
      // live DEX search (name, ticker or contract address) — debounced; trending pools when the box is empty
      const key = q ? 'q:' + S.q.trim() : 'trending';
      const cached = S.oc[key];
      if (cached && cached.rows) { const have = new Set(rows.map((x) => x.sym)); const extra = cached.rows.filter((s) => !have.has(s)).map((s) => SymPick.ocRow(s)); rows = q ? rows.filter((x) => x.kind === 'onchain' || S.tab === 'all').concat(extra) : cached.rows.map((s) => SymPick.ocRow(s)); }
      else if (!cached) {
        S.oc[key] = { busy: true }; const st0 = S;
        clearTimeout(SymPick._ocT);
        SymPick._ocT = setTimeout(() => {
          (q ? OC.search(S.q.trim()) : OC.discover('trending')).then((r) => { st0.oc[key] = { rows: r }; }).catch((e) => { st0.oc[key] = { rows: [], err: e.message }; }).finally(() => { if (SymPick.st === st0) SymPick.render(true); });
        }, q ? 350 : 0);
      }
      S.ocNote = cached && cached.busy !== true ? (cached.err ? 'DEX search failed: ' + cached.err : '') : 'Searching DEX pools…';
    } else S.ocNote = '';
    S.rows = rows.slice(0, 120); S.i = Math.min(S.i, Math.max(0, S.rows.length - 1));
    const list = SymPick.el.querySelector('#spList'), sc0 = list.scrollTop;
    list.innerHTML = (S.ocNote ? `<div class="note" style="padding:6px 10px">${esc(S.ocNote)}</div>` : '') + (S.rows.length ? S.rows.map((x, k) => { const os = x.kind === 'onchain' && OC.stats[x.sym], p = px(x.sym) || (os ? os.price : null), c0 = chg24(x.sym), c = c0 != null ? c0 : os ? os.ch24 : null; return `<div class="sp-row ${k === S.i ? 'on' : ''} ${x.sym === S.cur ? 'cur' : ''}" data-pick="${esc(x.sym)}">${SymPick.badge(x.sym, 30)}<div class="sp-n"><b>${esc(x.t)}</b><small>${esc(x.name || '')}</small></div><span class="sp-cat ${x.kind}">${esc(x.kind === 'crypto' ? 'crypto' : x.cat || x.kind)}</span><div class="sp-px mono">${p ? NT.fmtPrice(p) : ''}${c != null ? `<small class="${cls(c)}">${NT.fmtPct(c, 2)}</small>` : ''}</div></div>`; }).join('') : (S.tab === 'onchain' ? `<div class="empty">${S.ocNote ? '' : 'No DEX pools found. Try a token name, ticker or contract address.'}</div>` : `<div class="empty">No match. Type a ticker like <b>PLTR</b> or <b>PEPE</b>.</div>`));
    if (keepScroll) { list.scrollTop = sc0; const on = list.querySelector('.sp-row.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
  },
};
/** open a symbol on the Markets tab, switching Crypto/Stocks mode automatically if needed */
function openSym(sym) {
  showTab('markets');
  const m = modeOf(sym); if (m !== ST.mode) setMode(m, sym); else selectSym(sym);
}

/* subtle 3D + light effects: card tilt, panel spotlight, button ripple. Off for reduced-motion users. */
const FX = {
  init() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const TILT = '.stat,.rk,.bot,.gradebig,.symfield:not(.compact),.wcard .wav';
    let raf = 0, last = null;
    document.addEventListener('pointermove', (e) => {
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; const ev = last, t = ev.target.closest ? ev.target : null; if (!t || document.body.classList.contains('fx-off')) return;
        const p = t.closest('.panel'); if (p) { const r = p.getBoundingClientRect(); p.style.setProperty('--mx', ev.clientX - r.left + 'px'); p.style.setProperty('--my', ev.clientY - r.top + 'px'); }
        const c = document.body.classList.contains('fx-subtle') ? null : t.closest(TILT);
        if (FX.cur && FX.cur !== c) { FX.cur.style.transform = ''; FX.cur.classList.remove('tilting'); FX.cur = null; }
        if (c) { const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5, k = r.width > 300 ? 2 : 5; c.classList.add('tilt', 'tilting'); c.style.transform = `perspective(700px) rotateX(${(-y * k).toFixed(2)}deg) rotateY(${(x * k).toFixed(2)}deg) translateZ(0) translateY(-1px)`; FX.cur = c; }
      });
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (FX.cur) { FX.cur.style.transform = ''; FX.cur.classList.remove('tilting'); FX.cur = null; } });
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest && e.target.closest('.btn'); if (!b) return;
      const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), d = document.createElement('span');
      d.className = 'rip'; d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`; b.appendChild(d); setTimeout(() => d.remove(), 600);
    }, { passive: true });
  },
};

/* CSP-friendly global handlers (replace inline onclick/onerror attributes) */
document.addEventListener('click', (e) => {
  const g = e.target.closest && e.target.closest('[data-goto]'); if (g && !g.closest('#pfAccts')) { e.preventDefault(); showTab(g.dataset.goto); return; }
  const d = e.target.closest && e.target.closest('[data-dismiss]'); if (d) { e.preventDefault(); const p = d.closest('.banner') || d.parentNode; p.hidden = true; }
});
document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset && t.dataset.rm) t.remove(); }, true);
