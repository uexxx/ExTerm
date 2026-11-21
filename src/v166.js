/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.6 UI: Live Transactions drawer. Maths + storage in V166 (v166core.js); this file only wires it in:
   · ingest: every Feed.trade print (exchange WebSockets incl. the v16.4 Coinbase / Kraken / Binance failover, DEX swaps with
     makers, the launcher's 500 ms swap tape, any configured stock trade stream) + stock last-sale tape from the launcher's
     Yahoo proxy (1-minute volume prints; LAST SESSION TAPE when the market is closed; SIM prints in demo mode)
   · drawer: pressure strip, 8 sub-tabs, bitmask chips + min USD, 22 pooled rows over a virtual scroller, painted from one
     requestAnimationFrame loop only while the drawer is open (filter + paint are measured: U.perf)
   · hover auto-pause (gold Paused pill) + manual Pause / Live, click a print → gold pin on the chart, Copy Tape for AI
   Strict CSP: listeners attached here, rows written with textContent, tables through esc(). */
const V166UI = (() => {
  const KEY = 'exterm.v166.cfg', RH = 18, POOL = 22, B = V166.BIT;
  const U = { E: V166.engine(), open: true, tab:'trades', chips: [], minUsd: 0, manual: false, hover: false, idx: new Uint32Array(V166.CAP), cnt: 0, sym: '', dirty: true, pins: {}, drawnPins: 0,
    lastCopy: '', perf: { last: 0, max: 0, avg: 0, frames: 0 }, stock: { sym: '', seen: new Map(), session: '', last: 0, busy: false, prevC: 0 }, raf: 0, stripAt: 0, altAt: 0, rows: [] };
  const $1 = (s, r) => (r || document).querySelector(s);
  const paused = () => U.manual || U.hover;
  const load = () => {
    let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return;
    if (V166.TABS.some((t) => t[0] === o.tab)) U.tab = o.tab; if (Array.isArray(o.chips)) U.chips = o.chips.filter((c) => V166.CHIPS.some((x) => x[0] === c && c !== 'all'));
    if (Number.isFinite(o.minUsd) && o.minUsd >= 0) U.minUsd = o.minUsd; U.open = o.tape !== 'hidden'; // default-open: only an explicit [▾ Hide Tape] keeps it collapsed
    if (o.tracked && typeof o.tracked === 'object') for (const mk of V166.MARKETS) for (const n of Array.isArray(o.tracked[mk]) ? o.tracked[mk].slice(0, 200) : []) if (typeof n === 'string' && n) U.E.m[mk].trackedNames.add(n.slice(0, 64));
  };
  const save = () => { try { const tracked = {}; for (const mk of V166.MARKETS) tracked[mk] = [...U.E.m[mk].trackedNames]; localStorage.setItem(KEY, JSON.stringify({ tab: U.tab, chips: U.chips, minUsd: U.minUsd, tape: U.open ? 'open' : 'hidden', tracked })); } catch (e) { /* session only */ } };
  const fp = (v) => (v > 0 ? (v < 0.01 ? NT.fmtTiny(v) : NT.fmtPrice(v)) : '–');
  const fq = (v) => (v >= 1e6 ? NT.fmtCompact(v) : v >= 100 ? Math.round(v).toLocaleString('en-US') : +v.toPrecision(4) + '');
  const short = (s) => (/^(0x)?[0-9a-zA-Z]{30,}$/.test(s) ? s.slice(0, 6) + '…' + s.slice(-4) : s);

  /* ══ ingest ══ */
  const venueOf = (sym, x) => {
    if (x && x.who) return String(x.who);
    const mk = V166.marketOf(sym);
    if (mk === 'onchain') return (x && (x.dex || x.src)) || 'DEX pool';
    if (mk === 'crypto') { const f = typeof V164UI !== 'undefined' && V164UI.ex && V164UI.ex.ws && V164UI.ex.sym === sym ? V164UI.ex.name : ''; if (f) return f[0].toUpperCase() + f.slice(1); const a = typeof Providers !== 'undefined' && Providers.active; return (a && (a.name || a.id)) || 'Exchange'; }
    const s = typeof Stocks !== 'undefined' && Stocks.active; return (s && (s.name || s.id)) || 'Stock feed';
  };
  const ingest = (sym, price, size, side, ts, x, extra) => {
    const now = Date.now(), ms = Math.min(ts > 1e12 ? ts : ts * 1000, now) || now, usd = x && x.usd > 0 ? x.usd : 0;
    const seq = U.E.ingest(sym, ms, +price, +size || 0, usd, side, venueOf(sym, x), extra);
    if (seq >= 0 && sym === U.sym) U.dirty = true;
    return seq;
  };

  /* stock last-sale tape through the launcher's Yahoo proxy: 1-minute bars → volume prints (new volume only) */
  const stockPoll = async () => {
    const sym = typeof ST !== 'undefined' ? ST.sel : '', S = U.stock;
    if (!sym || V166.marketOf(sym) !== 'stocks' || S.busy || typeof YF === 'undefined' || typeof Stocks === 'undefined') return;
    if (Stocks.active === StockDemo) { S.session = 'sim'; return; }
    if (S.sym !== sym) { S.sym = sym; S.seen = new Map(); S.session = ''; S.prevC = 0; }
    S.busy = true;
    try {
      const { meta, rows } = await YF.chart(sym, '1m', '1d'); if (S.sym !== sym) return;
      const q = typeof yMeta === 'function' ? yMeta(sym, meta) : {}; S.session = q.open === false ? 'last' : 'live'; const venue = q.exch || 'Consolidated';
      if (boostLive()) { S.last = Date.now(); return; } // the boost stream already prints every trade
      const lastT = rows.length ? rows[rows.length - 1].t : 0;
      for (const r of rows) {
        if (!(r.v > 0) || !(r.c > 0)) continue; const prev = S.seen.get(r.t) || 0; if (r.v <= prev) continue; S.seen.set(r.t, r.v);
        const side = r.c >= (S.prevC || r.o) ? 'buy' : 'sell'; S.prevC = r.c;
        ingest(sym, r.c, r.v - prev, side, prev && r.t === lastT && S.session === 'live' ? Date.now() : (r.t + 59) * 1000, { who: venue }, B.AGG);
      }
      S.last = Date.now();
    } catch (e) { /* offline or older launcher: the demo / Feed.trade paths still fill the tape */ } finally { S.busy = false; }
  };
  /* optional stock boost: the user's own Finnhub token or Alpaca key (sessionStorage only, like the key vault's default) */
  const BK = 'exterm.v166.boost', boost = { ws: null, sym: '', live: 0, prev: {} };
  const bkeys = () => { try { const o = JSON.parse(sessionStorage.getItem(BK) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const boostStop = () => { if (boost.ws) { try { boost.ws.close(); } catch (e) { /* closed */ } } boost.ws = null; boost.sym = ''; };
  const boostSync = () => {
    const sym = ST.sel, k = bkeys(), kind = k.finnhub ? 'finnhub' : k.alpacaKey && k.alpacaSecret ? 'alpaca' : '';
    if (!kind || V166.marketOf(sym) !== 'stocks') { if (boost.ws) boostStop(); return; } if (boost.ws && boost.sym === sym) return; boostStop();
    let ws; try { ws = new WebSocket(V166.BOOST_URL[kind](k.finnhub)); } catch (e) { return; } boost.ws = ws; boost.sym = sym;
    ws.onopen = () => { try { if (kind === 'finnhub') ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })); else { ws.send(JSON.stringify({ action: 'auth', key: k.alpacaKey, secret: k.alpacaSecret })); ws.send(JSON.stringify({ action: 'subscribe', trades: [sym] })); } } catch (e) { /* closed */ } };
    ws.onmessage = (m) => { if (boost.ws !== ws) return; for (const t of (kind === 'finnhub' ? V166.parseFinnhub : V166.parseAlpaca)(m.data)) { if (t.sym !== sym) continue; boost.live = Date.now(); ingest(sym, t.price, t.size, V166.tickSide(t.price, boost.prev[sym]), t.ts, { who: t.venue }); boost.prev[sym] = t.price; } };
    ws.onerror = ws.onclose = () => { if (boost.ws === ws) { boost.ws = null; boost.sym = ''; } };
  };
  const boostLive = () => Date.now() - boost.live < 15000;
  const onStockTick = (sym, price) => {
    if (V166.marketOf(sym) !== 'stocks' || typeof Stocks === 'undefined' || Stocks.active !== StockDemo) return;
    U.stock.session = 'sim'; const pv = U.stock.lastPx && U.stock.lastPx[sym]; (U.stock.lastPx || (U.stock.lastPx = {}))[sym] = price;
    ingest(sym, price, Math.round(20 + Math.random() * 400), pv && price < pv ? 'sell' : 'buy', Date.now(), { who: 'SIM' }); // shortcut: demo sizes are random, live stocks use real volume
  };

  /* ══ drawer DOM ══ */
  const html = () => `<div class="v166-strip" role="status" aria-live="off">
      <span class="v166-k">Buy <b class="up" id="v166Buy">–</b></span><span class="v166-bar" aria-hidden="true"><i class="b" id="v166BarB"></i><i class="s" id="v166BarS"></i></span><span class="v166-k">Sell <b class="dn" id="v166Sell">–</b></span>
      <span class="v166-k">Net Whale/Block ($25K+) <b id="v166Whale">–</b></span><span class="v166-k">Avg Print <b id="v166Avg">–</b></span>
      <span class="v166-sess" id="v166Sess"></span><span class="sp"></span>
      <span class="v166-pill" id="v166Pill" hidden>Paused</span>
      <button type="button" class="btn xs" data-v166a="pause" id="v166Pause">Pause</button>
      <button type="button" class="btn xs ghost" data-v166a="boost" id="v166BoostBtn" title="Optional: your own Finnhub token or Alpaca key for every stock trade">Stock boost</button>
      <button type="button" class="btn xs pri" data-v166a="copy">Copy Tape for AI</button>
      <button type="button" class="btn xs v166-tog" data-v166a="close" aria-label="Hide the Live Transactions tape">▾ Hide Tape</button></div>
    <div class="v166-row v166-boost" id="v166Boost" hidden><b>Stock boost</b><input class="in" type="password" autocomplete="off" id="v166Fh" placeholder="Finnhub token"><span class="note">or</span><input class="in" type="password" autocomplete="off" id="v166Ak" placeholder="Alpaca key ID"><input class="in" type="password" autocomplete="off" id="v166As" placeholder="Alpaca secret"><button type="button" class="btn xs" data-v166a="bsave">Save for this session</button><button type="button" class="btn xs ghost" data-v166a="bclear">Clear</button><span class="note">Keys stay in this tab (sessionStorage), never on disk.</span></div>
    <div class="v166-nav"><div class="v166-tabs" role="tablist">${V166.TABS.map((t) => `<button type="button" role="tab" data-v166t="${t[0]}">${esc(t[1])}</button>`).join('')}</div>
    <div class="v166-chips">${V166.CHIPS.map((c) => `<button type="button" class="v166-chip" data-v166f="${c[0]}">${esc(c[1])}</button>`).join('')}<label class="v166-min">Min $ <input type="number" min="0" step="1000" id="v166Min" class="in" inputmode="numeric"></label><span class="note" id="v166Cnt"></span></div></div>
    <div class="v166-list" id="v166List"><div class="v166-head"><span>Age</span><span>Type</span><span>Price</span><span id="v166QtyH">Amount</span><span>Total USD</span><span>Venue / Maker</span><span>Signal Tags</span></div>
      <div class="v166-body" id="v166Body" tabindex="0" aria-label="Live prints (hover to pause)"><div class="v166-sp" id="v166Sp"></div></div></div>
    <div class="v166-alt" id="v166Alt" hidden></div>`;
  const mount = () => {
    const tb = $1('#tab-markets .toolbar');
    if (tb && !$1('#v166Btn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'v166Btn'; b.className = 'btn sm v166-btn v166-tog'; b.title = 'Live Transactions tape (Stocks · Crypto · On-Chain / DEX)'; b.textContent = '▾ Hide Tape'; b.addEventListener('click', () => toggle()); const rp = $1('#replayBtn', tb); if (rp) rp.after(b); else tb.appendChild(b); }
    if ($1('#v166Tape')) return;
    // in-flow below <main> (body is a flex column): the chart shrinks to make room instead of being covered
    const d = document.createElement('section'); d.id = 'v166Tape'; d.className = 'v166-drawer'; d.hidden = true; d.setAttribute('aria-label', 'Live Transactions'); d.innerHTML = html();
    const mn = $1('body > main'); if (mn) mn.after(d); else document.body.appendChild(d);
    mountDock(d);
    const body = $1('#v166Body', d);
    for (let i = 0; i < POOL; i++) { const r = document.createElement('div'); r.className = 'v166-r'; r.hidden = true; for (let j = 0; j < 7; j++) r.appendChild(document.createElement('span')); r._seq = -1; body.appendChild(r); U.rows.push(r); }
    body.addEventListener('mouseenter', () => { U.hover = true; pausePaint(); });
    body.addEventListener('mouseleave', () => { U.hover = false; pausePaint(); if (!paused()) { body.scrollTop = 0; U.dirty = true; } });
    body.addEventListener('scroll', () => paint(), { passive: true });
    body.addEventListener('click', (e) => { const r = e.target.closest('.v166-r'); if (r && r._seq >= 0) pin(r._seq); });
    d.addEventListener('click', (e) => {
      const a = e.target.closest('[data-v166a]'), t = e.target.closest('[data-v166t]'), f = e.target.closest('[data-v166f]'), tr = e.target.closest('[data-v166track]');
      if (a) { const k = a.dataset.v166a; if (k === 'pause') { U.manual = !U.manual; pausePaint(); if (!paused()) U.dirty = true; } else if (k === 'copy') copyTape(); else if (k === 'close') toggle(false); else if (k === 'boost') { const f = $1('#v166Boost'); f.hidden = !f.hidden; } else if (k === 'bsave' || k === 'bclear') { const v = (id) => ($1(id).value || '').trim().slice(0, 200), o = k === 'bsave' ? { finnhub: v('#v166Fh'), alpacaKey: v('#v166Ak'), alpacaSecret: v('#v166As') } : {}; try { if (o.finnhub || o.alpacaKey) sessionStorage.setItem(BK, JSON.stringify(o)); else sessionStorage.removeItem(BK); } catch (x) { /* storage blocked */ } for (const id of ['#v166Fh', '#v166Ak', '#v166As']) $1(id).value = ''; $1('#v166Boost').hidden = true; boostStop(); boostSync(); toast(o.finnhub || o.alpacaKey ? 'Stock boost saved for this session' : 'Stock boost cleared', 'acc'); } else if (k === 'addtrack') { const i = $1('#v166TrackIn'); if (i && i.value.trim()) { track(i.value.trim(), true); i.value = ''; } } }
      if (t) setTab(t.dataset.v166t);
      if (f) setChip(f.dataset.v166f);
      if (tr) track(tr.dataset.v166track, tr.dataset.on !== '1');
    });
    $1('#v166Min', d).addEventListener('input', (e) => { const v = +e.target.value; U.minUsd = Number.isFinite(v) && v > 0 ? v : 0; U.dirty = true; refilter(true); save(); });
    paintChrome();
  };
  const toggle = (on) => { U.open = on == null ? !U.open : !!on; save(); show(); };
  const show = () => {
    const d = $1('#v166Tape'); if (!d) return; const vis = U.open && typeof curTab !== 'undefined' && curTab === 'markets'; if (d.hidden === vis) d.hidden = !vis;
    const lbl = U.open ? '▾ Hide Tape' : '▴ Live Tape';
    for (const b of [$1('#v166Btn'), $1('#v166DTape')]) if (b) { b.classList.toggle('on', U.open); b.setAttribute('aria-pressed', String(U.open)); if (b.textContent !== lbl) b.textContent = lbl; }
    const wb = $1('#v166DWhale'); if (wb) wb.classList.toggle('on', U.open && U.tab === 'trades' && U.chips.includes('whale'));
    if (vis && !U.raf) { U.dirty = true; U.raf = requestAnimationFrame(frame); }
  };

  /* ══ bottom telemetry dock: position + cash, quick-dock chips, live market pills (all tabs) ══ */
  const TELE = [['BTC-USD', 'BTC'], ['ETH-USD', 'ETH'], ['SOL-USD', 'SOL'], ['SPY', 'SPY']];
  const mountDock = (after) => {
    if ($1('#v166Dock')) return;
    const k = document.createElement('footer'); k.id = 'v166Dock'; k.className = 'v166-dock'; k.setAttribute('aria-label', 'Position and market telemetry');
    k.innerHTML = `<div class="v166-dl"><div class="v166-dpos" id="v166DPos"></div><span class="v166-dsep" aria-hidden="true"></span>
      <button type="button" class="v166-dc v166-tog" data-v166d="tape" id="v166DTape">▾ Hide Tape</button><button type="button" class="v166-dc" data-v166d="whale" id="v166DWhale">Whales ($25K+)</button><button type="button" class="v166-dc" data-v166d="tracker">Tracker</button><button type="button" class="v166-dc" data-v166d="positions">Positions</button><button type="button" class="v166-dc" data-v166d="depth">3D Depth</button><button type="button" class="v166-dc" data-v166d="ai">AI Bridge</button></div>
      <div class="v166-dr" role="status" aria-live="off">${TELE.map((t) => `<span class="v166-tp" data-v166s="${t[0]}"><i>${t[1]}</i><b>–</b><em></em></span>`).join('')}<span class="v166-tp v166-flow" id="v166DFlow"><i>Flow</i><b>–</b><em></em></span></div>`;
    after.after(k);
    const ps = $1('#posStrip'); if (ps) $1('#v166DPos', k).appendChild(ps); // renderPosStrip keeps writing into it
    k.addEventListener('click', (e) => { const b = e.target.closest('[data-v166d]'); if (b) dock(b.dataset.v166d); });
  };
  const dock = (k) => {
    if (k === 'ai') { if (typeof showTab === 'function') showTab('bridge'); return; }
    const was = typeof curTab !== 'undefined' && curTab === 'markets'; if (!was && typeof showTab === 'function') showTab('markets');
    if (k === 'tape') { toggle(was ? null : true); return; }
    if (k === 'depth') { const b = $1('#bookView button[data-v="3d"]'); if (b) b.click(); return; }
    U.open = true;
    if (k === 'whale') { U.tab = 'trades'; U.chips = U.chips.includes('whale') && was ? U.chips.filter((c) => c !== 'whale') : [...new Set(U.chips.concat('whale'))]; save(); paintChrome(); refilter(true); }
    else setTab(k === 'tracker' ? 'tracking' : 'positions');
    show();
  };
  const tele = () => {
    const k = $1('#v166Dock'); if (!k) return; const set = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
    for (const el of k.querySelectorAll('[data-v166s]')) {
      const s = el.dataset.v166s; let p = 0, c = null; try { p = px(s) || 0; c = chg24(s); } catch (e) { /* feed not ready */ }
      set(el.children[1], p ? NT.fmtPrice(p) : '–'); set(el.children[2], c == null || !Number.isFinite(c) ? '' : NT.fmtPct(c, 1)); el.children[2].className = c > 0 ? 'up' : c < 0 ? 'dn' : '';
    }
    const f = $1('#v166DFlow'), sym = U.sym || (typeof ST !== 'undefined' ? ST.sel : ''), r = sym ? U.E.ring(sym) : null, P = r ? V166.pressure(r) : null, net = P ? P.buy - P.sell : 0;
    if (f) { set(f.children[0], (sym ? baseOf(sym) : '') + ' Δ'); set(f.children[1], P ? (net > 0 ? '+' : '') + V166.money(net) : '–'); set(f.children[2], P ? P.buyPct.toFixed(0) + '% buy' : ''); f.children[1].className = net > 0 ? 'up' : net < 0 ? 'dn' : ''; }
  };
  const setTab = (k) => { if (!V166.TABS.some((t) => t[0] === k)) return; U.tab = k; save(); paintChrome(); U.altAt = 0; U.dirty = true; };
  const setChip = (k) => { if (k === 'all') U.chips = []; else U.chips = U.chips.includes(k) ? U.chips.filter((c) => c !== k) : U.chips.concat(k); save(); paintChrome(); refilter(true); };
  const track = (name, on) => { const sym = U.sym || ST.sel; U.E.track(sym, String(name).slice(0, 64), on); save(); U.altAt = 0; refilter(true); paint(true); toast((on ? 'Tracking ' : 'Stopped tracking ') + esc(short(name)), 'acc'); };
  const paintChrome = () => {
    const d = $1('#v166Tape'); if (!d) return;
    for (const b of d.querySelectorAll('[data-v166t]')) { const on = b.dataset.v166t === U.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    for (const b of d.querySelectorAll('[data-v166f]')) { const on = b.dataset.v166f === 'all' ? !U.chips.length : U.chips.includes(b.dataset.v166f); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const mi = $1('#v166Min', d); if (mi && document.activeElement !== mi) mi.value = U.minUsd ? String(U.minUsd) : '';
    $1('#v166List', d).hidden = U.tab !== 'trades'; $1('#v166Alt', d).hidden = U.tab === 'trades'; $1('.v166-chips', d).hidden = U.tab !== 'trades' && U.tab !== 'tracking';
  };
  const pausePaint = () => { const p = paused(), pill = $1('#v166Pill'), bt = $1('#v166Pause'); if (pill) pill.hidden = !p; if (bt) { bt.textContent = U.manual ? 'Live' : 'Pause'; bt.classList.toggle('on', U.manual); } };

  /* ══ render: one rAF loop while the drawer is visible; filter only when new prints arrive and not paused ══ */
  const refilter = (force) => {
    const r = U.E.ring(U.sym); if (!r) { U.cnt = 0; } else if (force || !paused()) U.cnt = V166.filter(r, V166.chipMask(U.chips), U.minUsd, U.idx, U.E.mk(U.sym).tracked);
    const sp = $1('#v166Sp'); if (sp) sp.style.height = U.cnt * RH + 'px'; const c = $1('#v166Cnt'); if (c) c.textContent = U.cnt + ' / ' + (r ? r.size : 0) + ' prints';
    paint(false);
  };
  // pooled rows are keyed by print sequence: a print already on screen only moves (transform); only new prints write text
  const place = (row, k, r, now) => { const y = k * RH; if (row._y !== y) { row._y = y; row.style.transform = 'translateY(' + y + 'px)'; } if (row.hidden) row.hidden = false; const age = V166.age(V166.ts(r, row._seq), now); if (row._age !== age) { row._age = age; row.children[0].textContent = age; } };
  const fill = (row, r, seq, tracked) => {
    let m = V166.mask(r, seq); const vid = V166.venue(r, seq); if (tracked.has(vid)) m |= B.TRACKED; const c = row.children, nm = U.E.name(U.sym, vid), k = V166.cls(m);
    c[1].textContent = V166.type(m); c[1].className = k; c[2].textContent = fp(V166.price(r, seq)); c[3].textContent = fq(V166.qty(r, seq)); c[4].textContent = V166.money(V166.usd(r, seq)); c[5].textContent = short(nm) || '–'; c[5].title = nm; c[6].textContent = V166.tags(m); row.className = 'v166-r ' + k;
    row._seq = seq; row._age = null;
  };
  const paint = (force) => {
    const body = $1('#v166Body'); if (!body) return; const r = U.E.ring(U.sym), now = Date.now(), first = Math.floor(body.scrollTop / RH), tracked = U.E.mk(U.sym || 'x').tracked, want = new Map(), free = [];
    if (r) for (let k = first; k < Math.min(U.cnt, first + POOL); k++) if (r.has(U.idx[k])) want.set(U.idx[k], k);
    for (const row of U.rows) { if (!force && row._seq >= 0 && want.has(row._seq)) { place(row, want.get(row._seq), r, now); want.delete(row._seq); } else free.push(row); }
    for (const [seq, k] of want) { const row = free.pop(); fill(row, r, seq, tracked); place(row, k, r, now); }
    for (const row of free) { if (!row.hidden) row.hidden = true; row._seq = -1; }
  };
  const strip = () => {
    const r = U.E.ring(U.sym), P = r ? V166.pressure(r) : null, set = (id, t) => { const e = $1(id); if (e && e.textContent !== t) e.textContent = t; };
    set('#v166Buy', P ? P.buyPct.toFixed(1) + '% · ' + V166.money(P.buy) : '–'); set('#v166Sell', P ? P.sellPct.toFixed(1) + '% · ' + V166.money(P.sell) : '–');
    set('#v166Whale', P ? V166.money(P.whaleNet) : '–'); set('#v166Avg', P ? V166.money(P.avg) : '–'); const w = $1('#v166Whale'); if (w) w.className = P && P.whaleNet < 0 ? 'dn' : P && P.whaleNet > 0 ? 'up' : '';
    const bb = $1('#v166BarB'), bs = $1('#v166BarS'); if (bb && P) { bb.style.width = P.buyPct.toFixed(1) + '%'; bs.style.width = P.sellPct.toFixed(1) + '%'; }
    const mk = V166.marketOf(U.sym || 'x'), S = U.stock, sess = mk === 'stocks' ? (boostLive() ? 'LIVE TAPE · ' + (bkeys().finnhub ? 'Finnhub' : 'Alpaca') : S.session === 'last' ? 'LAST SESSION TAPE' : S.session === 'sim' || (typeof Stocks !== 'undefined' && typeof StockDemo !== 'undefined' && Stocks.active === StockDemo) ? 'SIM TAPE (demo)' : S.session === 'live' ? 'LIVE TAPE · last-sale' : 'STOCK TAPE') : mk === 'crypto' ? 'LIVE 24/7 · ' + venueOf(U.sym) : 'DEX SWAPS · makers';
    set('#v166Sess', sess); const se = $1('#v166Sess'); if (se) se.classList.toggle('last', S.session === 'last' && mk === 'stocks'); set('#v166QtyH', mk === 'stocks' ? 'Shares' : 'Amount'); const bb2 = $1('#v166BoostBtn'); if (bb2) bb2.hidden = mk !== 'stocks';
  };
  const frame = () => {
    U.raf = 0; const d = $1('#v166Tape'); if (!d || d.hidden) return;
    const t0 = performance.now(), sym = ST.sel;
    if (sym !== U.sym) { U.sym = sym; U.E.keep = sym; U.dirty = true; U.manual = false; pausePaint(); const b = $1('#v166Body'); if (b) b.scrollTop = 0; U.altAt = 0; U.stripAt = 0; U.filtAt = 0; }
    const q4 = t0 - U.stripAt > 250; // strip + ages at 4 Hz; the list re-filters at most 30×/s (the chart keeps its own 240 Hz loop)
    if (U.tab === 'trades') { if (U.dirty && !paused() && t0 - (U.filtAt || 0) >= 33) { U.dirty = false; U.filtAt = t0; refilter(false); } else if (q4) paint(false); }
    else if (t0 - U.altAt > 1000 && !paused()) { U.altAt = t0; alt(); }
    if (q4) { U.stripAt = t0; strip(); }
    const dt = performance.now() - t0, P = U.perf; P.last = dt; P.max = Math.max(P.max, dt); P.frames++; P.avg += (dt - P.avg) / Math.min(P.frames, 240);
    U.raf = requestAnimationFrame(frame);
  };

  /* ══ sub-tabs other than Trades ══ */
  const tbl = (head, rows, empty) => `<table class="v166-t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="note">${esc(empty)}</td></tr>`}</tbody></table>`;
  const trk = (nm, on) => `<button type="button" class="btn xs ghost" data-v166track="${esc(nm)}" data-on="${on ? 1 : 0}">${on ? 'Untrack' : 'Track'}</button>`;
  const altHTML = () => {
    const sym = U.sym, r = U.E.ring(sym), mk = V166.marketOf(sym || 'x'), A = r ? V166.agg(r) : [], nm = (id) => U.E.name(sym, id), by = mk === 'onchain' ? 'maker wallet' : 'venue', now = Date.now();
    const row = (a, cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}<td>${trk(nm(a.id), U.E.isTracked(sym, nm(a.id)))}</td></tr>`;
    if (U.tab === 'positions') {
      const rows = []; try { const p = ACC.pos[sym]; if (p && p.qty) { const avg = ACC.avg(sym), m = px(sym); rows.push(`<tr><td>Paper account</td><td>${esc(fq(p.qty))}</td><td>${esc(fp(avg))}</td><td>${esc(fp(m))}</td><td class="${m >= avg ? 'up' : 'dn'}">${esc(V166.money((m - avg) * p.qty))}</td></tr>`); } for (const b of ST.bots || []) { const q = b.account && b.account.pos && b.account.pos[sym]; if (q && q.qty) { const avg = b.account.avg ? b.account.avg(sym) : q.avg || 0, m = px(sym); rows.push(`<tr><td>Bot · ${esc(b.name || b.id)}</td><td>${esc(fq(q.qty))}</td><td>${esc(fp(avg))}</td><td>${esc(fp(m))}</td><td class="${m >= avg ? 'up' : 'dn'}">${esc(V166.money((m - avg) * q.qty))}</td></tr>`); } } } catch (e) { /* no account yet */ }
      return tbl(['Account', 'Qty', 'Avg', 'Mark', 'Unrealised'], rows, 'No open position in ' + baseOf(sym) + '.');
    }
    if (U.tab === 'orders') {
      const rows = []; try { for (const o of ACC.orders || []) if (o.sym === sym) rows.push(`<tr><td>Limit</td><td class="${o.side === 'buy' ? 'up' : 'dn'}">${esc(o.side)}</td><td>${esc(fp(o.price))}</td><td>${esc(fq(o.size || 0))}</td><td>Paper</td></tr>`); for (const p of ST.pending || []) if (p.sym === sym) rows.push(`<tr><td>Pending signal</td><td>${esc(p.side || '')}</td><td>${esc(fp(p.price || 0))}</td><td>–</td><td>${esc(p.src || 'bot')}</td></tr>`); } catch (e) { /* none */ }
      return tbl(['Kind', 'Side', 'Price', 'Size', 'Route'], rows, 'No working orders for ' + baseOf(sym) + '.');
    }
    if (U.tab === 'holders') return `<p class="note">Net buyers in the last ${r ? r.size : 0} prints, by ${by}${mk === 'stocks' ? ' (institutional 13F data is not free: this is session flow)' : ''}.</p>` + tbl(['Holder (' + by + ')', 'Net $', 'Bought', 'Sold', 'Prints', ''], V166.holders(A).map((a) => row(a, [short(nm(a.id)) || '–', V166.money(a.net), V166.money(a.buy), V166.money(a.sell), a.n])), 'No net buyers yet.');
    if (U.tab === 'top') return tbl(['Trader / fund (' + by + ')', 'Gross $', 'Net $', 'Buys', 'Sells', ''], V166.top(A).map((a) => row(a, [short(nm(a.id)) || '–', V166.money(a.gross), V166.money(a.net), a.nb, a.ns])), 'No prints yet.');
    if (U.tab === 'early') return `<p class="note">First ${by}s to trade ${esc(baseOf(sym))} in this buffer${mk === 'stocks' ? ' (regular session bars; pre-market is not in the free feed)' : ''}.</p>` + tbl(['First seen', 'Who', 'First price', 'Net $', 'Prints', ''], V166.early(A).map((a) => row(a, [V166.age(a.first, now) + ' ago', short(nm(a.id)) || '–', fp(a.firstPx), V166.money(a.net), a.n])), 'No prints yet.');
    if (U.tab === 'dca') return `<p class="note">One-sided ${by}s with ≥ 3 steady-size prints (size varies ≤ 25%).</p>` + tbl(['Who', 'Side', 'Prints', 'Avg print', 'Total $', 'Size var', ''], V166.dca(A).map((a) => row(a, [short(nm(a.id)) || '–', a.side, a.n, V166.money(a.avg), V166.money(a.gross), (a.cv * 100).toFixed(0) + '%'])), 'No DCA pattern yet.');
    // tracking: tracked names in this market + their recent prints
    const M = U.E.mk(sym || 'x'), out = new Uint32Array(V166.CAP), n = r ? V166.filter(r, B.TRACKED | V166.chipMask(U.chips), U.minUsd, out, M.tracked) : 0, prints = [];
    for (let i = 0; i < Math.min(n, 50); i++) { const q = out[i], m = V166.mask(r, q) | B.TRACKED; prints.push(`<tr><td>${esc(V166.age(V166.ts(r, q), now))}</td><td class="${V166.cls(m)}">${esc(V166.type(m))}</td><td>${esc(fp(V166.price(r, q)))}</td><td>${esc(V166.money(V166.usd(r, q)))}</td><td>${esc(short(nm(V166.venue(r, q))))}</td></tr>`); }
    return `<div class="v166-row"><input class="in" id="v166TrackIn" placeholder="Wallet / maker / venue to track" maxlength="64"><button type="button" class="btn xs" data-v166a="addtrack">Track</button><span class="note">${[...M.trackedNames].map((t) => esc(short(t))).join(' · ') || 'Nothing tracked in ' + esc(mk) + ' yet'}</span></div>` + tbl(['Age', 'Type', 'Price', 'Total USD', 'Who'], prints, 'No prints from tracked wallets / venues yet.');
  };
  const alt = () => { const el = $1('#v166Alt'); if (!el || (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) return; const h = altHTML(); if (el._h !== h) { el._h = h; el.innerHTML = h; } };

  /* ══ chart pins + AI export ══ */
  const pin = (seq) => {
    const r = U.E.ring(U.sym); if (!r || !r.has(seq)) return; const m = V166.mask(r, seq), p = { t: V166.ts(r, seq) / 1000, price: V166.price(r, seq), usd: V166.usd(r, seq), type: V166.type(m) };
    const L = U.pins[U.sym] || (U.pins[U.sym] = []); L.push(p); if (L.length > 20) L.shift(); if (typeof chart !== 'undefined' && chart) chart.invalidate();
    toast(`Pinned ${esc(p.type)} ${esc(V166.money(p.usd))} @ ${esc(fp(p.price))} on the chart`, 'acc'); return p;
  };
  const overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L || !L.py) return; const P = U.pins[ST.sel]; U.drawnPins = 0; if (!P || !P.length) return;
    const top = L.y0 + 4, bot = L.y0 + L.mainH - (L.volH || 0) - 6, x0 = L.Lm, xr = L.W - L.Rm; g.save();
    for (const p of P) {
      let x = ch.tToX(p.t); const y = L.py(p.price); if (!Number.isFinite(y) || y < top || y > bot) continue; if (!Number.isFinite(x)) x = xr - 8; x = Math.max(x0 + 6, Math.min(xr - 6, x));
      g.fillStyle = '#D4AF37'; g.strokeStyle = '#0a0a0c'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill(); g.stroke();
      g.font = '600 9px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(V166.money(p.usd), Math.min(x + 9, xr - 44), y); U.drawnPins++;
    }
    g.textBaseline = 'alphabetic'; g.restore();
  };
  const copyTape = () => {
    const txt = V166.aiTape(U.E, U.sym || ST.sel, Date.now(), 10); U.lastCopy = txt;
    if (typeof V165UI !== 'undefined') { V165UI.lastCopy = txt; const pk = $1('#v165Pk'); if (pk) pk.textContent = txt; } // lands in the AI Bridge preview too
    try { navigator.clipboard.writeText(txt).then(() => toast('Tape copied for AI (top whale / block prints)', 'acc'), () => toast('Tape ready in the AI Bridge preview (clipboard blocked)', 'amb')); } catch (e) { toast('Tape ready in the AI Bridge preview (clipboard blocked)', 'amb'); }
    return txt;
  };

  let n = 0;
  const tick = () => {
    try {
      mount(); show(); tele(); n++;
      if (typeof chart !== 'undefined' && chart && !chart.overlays.includes(overlay)) chart.overlays.push(overlay);
      if (n % 30 === 1 || (U.stock.sym !== ST.sel && V166.marketOf(ST.sel) === 'stocks')) stockPoll(); // 15 s
      boostSync(); // cheap no-op unless a stock boost key is set, the launcher's stock poll cadence
    } catch (e) { console.warn('v166', e); }
  };
  U.start = () => {
    load(); if (typeof Feed !== 'undefined' && !Feed._v166) { Feed._v166 = true; Feed.tradeL.push((sym, p, q, side, ts, x) => { try { ingest(sym, p, q, side, ts, x); } catch (e) { /* never break the feed */ } }); Feed.tickL.push((sym, p) => { try { onStockTick(sym, p); } catch (e) { /* demo only */ } }); }
    tick(); setInterval(tick, 500);
  };
  Object.assign(U, { boost, boostSync, ingest, refilter, paint, strip, frame, pin, overlay, copyTape, setTab, setChip, track, toggle, dock, tele, stockPoll, altHTML, paused });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b166 = boot; boot = async function () { await _b166.apply(this, arguments); try { V166UI.start(); } catch (e) { console.warn('v166 init', e); } }; }
