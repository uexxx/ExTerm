/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.4 UI. Maths in V164 (v164core.js); this file only wires it into the existing app:
   · chart: multi-exchange trade-stream failover, 500 ms DEX swap tape (launcher), ⚓ AVWAP toolbar tool (click / session /
     swing anchors), live tape-delta + book micro-imbalance strip, backtest trade replay markers, young-token viewport fit
   · DEX tab Discovery: Scanner | Tiles | Bubbles | Buy Pressure on one strictly mode-isolated dataset (Crypto / Stocks /
     On-chain follow the top market pills), unified pills, GMGN-style filter drawer + presets, Top Movers rail, 3D orbit
     jump, keyboard navigation and `/` search, Export Filtered Basket → Quant Lab portfolio backtest
   · AI tab: Quant & Execution Copilot (chart reader, natural language → safe strategy + Pine v5, 17-test validation,
     pre-trade stop auditor, ledger leak detector, Pine template library, one-click action pills)
   · Lab tab: Strategy Studio Pro (drag-and-drop node builder, depth & slippage, portfolio ≤ 10, stress replay,
     walk-forward decay, standalone bot export, replay on chart) + bot tools (shadow drift, regime auto-switcher,
     multi-slot router). Strict CSP: listeners attached here, every dynamic string through esc(). */
const V164UI = (() => {
  const KEY = 'exterm.v164.cfg';
  const U = { cfg: null, rows: [], view: [], sel: 0, sort: { k: 'v24', d: -1 }, tape: [], tapeBy: {}, lastPrim: {}, lastOc: {}, inj: false,
    ex: { ws: null, name: '', sym: '', failed: [], at: 0 }, swaps: { sym: '', since: 0, seen: new Set(), busy: false }, av: {}, pick: false, markers: { sym: '', list: [] },
    nodes: [], studioOut: '', copOut: '', last: { spec: null }, stats: { failovers: 0, swaps: 0, renders: 0, switches: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const DEF = () => ({ view: 'scanner', pill: 'all', filter: V164.FILTER_DEF(), bub: 'mcap', routes: {}, regimeMap: { trend: '', range: '', volatile: '' }, autoSwitch: false, failover: true, swapPoll: true, tapeStrip: true, depth: 250000, rtab: 'depth' });
  const load = () => { let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; } const d = DEF(); if (o && typeof o === 'object') { for (const k of ['view', 'pill', 'bub', 'rtab']) if (typeof o[k] === 'string' && o[k].length < 40) d[k] = o[k]; for (const k of ['autoSwitch', 'failover', 'swapPoll', 'tapeStrip']) if (typeof o[k] === 'boolean') d[k] = o[k]; if (o.filter && typeof o.filter === 'object') for (const k of Object.keys(d.filter)) if (k !== 'q' && (typeof o.filter[k] === typeof d.filter[k])) d.filter[k] = o.filter[k]; if (o.routes && typeof o.routes === 'object') for (const [k, v] of Object.entries(o.routes)) if (/^[\w-]{1,60}$/.test(k) && +v >= 1 && +v <= 6) d.routes[k] = +v; if (o.regimeMap && typeof o.regimeMap === 'object') for (const k of ['trend', 'range', 'volatile']) if (typeof o.regimeMap[k] === 'string' && o.regimeMap[k].length < 60) d.regimeMap[k] = o.regimeMap[k]; if (+o.depth > 0) d.depth = +o.depth; } U.cfg = d; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U.cfg)); } catch (e) { /* session only */ } };
  const mode = () => (typeof ST !== 'undefined' && V164.MODES.includes(ST.mode) ? ST.mode : 'crypto');
  const px0 = (s) => (typeof px === 'function' ? px(s) : 0) || 0;
  const fp = (v) => (v > 0 ? (v < 0.01 ? NT.fmtTiny(v) : NT.fmtPrice(v)) : '–');
  const pct = (v) => (Number.isFinite(v) ? NT.fmtPct(v, Math.abs(v) < 10 ? 2 : 1) : '–');
  const usd = (v) => (Number.isFinite(v) && v !== 0 ? (v < 0 ? '−' : '') + '$' + NT.fmtCompact(Math.abs(v)) : '–');
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="v164-ic">${d}</svg>`;

  /* ══ live tape: per-symbol aggressive buy / sell $ (feeds Buy Pressure for crypto / stocks and the chart strip) ══ */
  const onTrade = (sym, price, size, side, ts) => {
    const ms = ts > 1e12 ? ts : ts * 1000, now = Date.now();
    if (!U.inj) { U.lastPrim[sym] = now; if (/^oc:/.test(sym)) U.lastOc[sym] = now; }
    if (sym === ST.sel) { U.tape.push({ price, size, side, ms: now }); if (U.tape.length > 4000) U.tape.splice(0, U.tape.length - 3000); }
    const a = U.tapeBy[sym] || (U.tapeBy[sym] = []); a.push({ usd: price * (size || 0), side, ms: Math.min(ms, now) }); if (a.length > 3000) a.splice(0, a.length - 2000);
  };
  const tapeWin = (sym, sec) => { const a = U.tapeBy[sym]; if (!a) return null; const now = Date.now(); let b = 0, s = 0; for (let i = a.length - 1; i >= 0 && now - a[i].ms <= sec * 1000; i--) { if (a[i].side === 'sell') s += a[i].usd; else b += a[i].usd; } return b + s > 0 ? { b, s, v: b + s } : null; };

  /* ══ 3. multi-exchange trade-stream failover (primary stalls > 1,500 ms → next public stream) ══ */
  const exStop = () => { const e = U.ex; if (e.ws) { try { e.ws.close(); } catch (x) { /* closed */ } } e.ws = null; e.name = ''; e.sym = ''; };
  const exStart = (sym, name) => {
    exStop(); const sub = V164.exSub(name, sym); if (!sub) return; let ws; try { ws = new WebSocket(V164.EX_URL[name]); } catch (x) { U.ex.failed.push(name); return; }
    U.ex.ws = ws; U.ex.name = name; U.ex.sym = sym; U.ex.at = Date.now(); U.stats.failovers++;
    ws.onopen = () => { try { ws.send(sub); } catch (x) { /* closed */ } };
    ws.onmessage = (m) => { if (U.ex.ws !== ws) return; for (const t of V164.exParse(name, m.data)) { U.inj = true; try { Feed.trade(sym, t.price, t.size, t.side, t.ts); Feed.tick(sym, t.price); } finally { U.inj = false; } } };
    ws.onerror = () => { if (U.ex.ws === ws) { U.ex.failed.push(name); exStop(); } };
    ws.onclose = () => { if (U.ex.ws === ws) exStop(); };
  };
  const primaryName = () => { const a = typeof Providers !== 'undefined' && Providers.active; const id = String((a && (a.id || a.name)) || '').toLowerCase(); return V164.EX.find((x) => id.includes(x)) || ''; };
  const failover = () => {
    const sym = ST.sel, live = typeof Providers !== 'undefined' && Providers.active && typeof Demo !== 'undefined' && Providers.active !== Demo && Feed.state === 'live';
    if (!U.cfg.failover || !live || V164.modeOf(sym) !== 'crypto' || (navigator.onLine === false)) { if (U.ex.ws) exStop(); paintFeed(''); return; }
    const now = Date.now(), stalled = V164.stalled(U.lastPrim[sym], now);
    if (!stalled) { if (U.ex.ws) exStop(); U.ex.failed = []; paintFeed(primaryName()); return; }
    if (U.ex.ws && U.ex.sym === sym) { paintFeed(U.ex.name, true); return; }
    if (now - U.ex.at < 10000) return; const nx = V164.nextEx(primaryName(), U.ex.failed); if (nx) { exStart(sym, nx); paintFeed(nx, true); }
  };
  const paintFeed = (name, fo) => {
    const tb = $1('#tab-markets .toolbar'); if (!tb) return; let p = $1('#v164Feed'); if (!p) { p = document.createElement('span'); p.id = 'v164Feed'; p.className = 'tag v164-feed'; p.setAttribute('role', 'status'); const m = $1('#mkMode', tb); if (m) m.before(p); else tb.appendChild(p); }
    const t = name ? (fo ? 'Failover · ' : 'Stream · ') + name[0].toUpperCase() + name.slice(1) : ''; p.hidden = !t; if (p.textContent !== t) p.textContent = t; p.classList.toggle('fo', !!fo);
  };

  /* ══ 4. 500 ms DEX swap tape from the launcher (de-duplicated by transaction hash) ══ */
  const swapPoll = async () => {
    const sym = ST.sel, S = U.swaps; if (!U.cfg.swapPoll || S.busy || typeof J === 'undefined' || !J.proxy || !/^oc:/.test(sym) || /^oc:sim:/.test(sym)) return;
    if (S.sym !== sym) { S.sym = sym; S.since = Date.now() / 1000 - 120; S.seen = new Set(); }
    S.busy = true;
    try {
      const r = await J.get('/api/swaps?sym=' + encodeURIComponent(sym) + '&since=' + S.since.toFixed(3), { timeout: 3000 }); if (S.sym !== sym || !r || !Array.isArray(r.trades)) return;
      const fresh = V164.dedupe(S.seen, r.trades.filter((t) => t && t.price > 0 && Number.isFinite(t.ts)));
      const own = Date.now() - (U.lastOc[sym] || 0) < 3000; // the regular on-chain trade feed is live: keep the dedupe set, do not double count
      for (const t of fresh) { S.since = Math.max(S.since, t.ts); if (own) continue; U.inj = true; try { Feed.trade(sym, t.price, t.usd > 0 ? t.usd / t.price : 0, t.side, t.ts); } finally { U.inj = false; } U.stats.swaps++; }
    } catch (e) { /* older launcher or offline */ } finally { S.busy = false; }
  };

  /* ══ 5. ⚓ AVWAP tool + tape-delta strip + replay markers (one chart overlay) ══ */
  const avMenu = () => {
    let m = $1('#v164AvMenu'); if (m) { m.remove(); return; } const b = $1('#v164AvBtn'); if (!b) return;
    m = document.createElement('div'); m.id = 'v164AvMenu'; m.className = 'v164-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = [['pick', 'Click a candle to anchor'], ['session', 'Session open'], ['swingL', 'Last swing low'], ['swingH', 'Last swing high'], ['off', 'Remove anchored VWAP']].map(([k, l]) => `<button type="button" role="menuitem" data-av="${k}">${esc(l)}</button>`).join('');
    m.addEventListener('click', (e) => { const x = e.target.closest('[data-av]'); if (!x) return; m.remove(); setAnchor(x.dataset.av); });
    const r = b.getBoundingClientRect(); m.style.left = Math.round(r.left) + 'px'; m.style.top = Math.round(r.bottom + 4) + 'px'; document.body.appendChild(m); const f = m.querySelector('button'); if (f) f.focus();
  };
  const sessionStart = (D) => {
    const last = D[D.length - 1]; if (!last) return null;
    if (V164.modeOf(ST.sel) === 'stocks') { for (let i = D.length - 1; i >= 0; i--) { const n = V164core_ny(D[i].t * 1000); if (n.min < 570 || (i < D.length - 1 && D[i + 1].t - D[i].t > 3 * 3600)) return D[Math.min(D.length - 1, i + 1)].t; } return D[0].t; }
    return Math.floor(last.t / 86400) * 86400;
  };
  const V164core_ny = (ms) => (typeof V163 !== 'undefined' ? V163.ny(ms) : { min: 600 });
  const setAnchor = (k) => {
    const D = chart && chart.data; if (!D || !D.length) return;
    if (k === 'off') { delete U.av[ST.sel]; toast('Anchored VWAP removed'); }
    else if (k === 'pick') { U.pick = true; chart.cv.style.cursor = 'crosshair'; toast('Click the candle to anchor VWAP from'); return; }
    else if (k === 'session') { const t = sessionStart(D); if (t != null) { U.av[ST.sel] = { t, kind: 'Session' }; toast('⚓ AVWAP anchored at the session open'); } }
    else { const i = V164.swing(D, 5, k === 'swingL' ? 'low' : 'high'); if (i < 0) { toast('No confirmed swing in view yet', 'amb'); return; } U.av[ST.sel] = { t: D[i].t, kind: k === 'swingL' ? 'Swing low' : 'Swing high' }; toast('⚓ AVWAP anchored at the ' + esc(U.av[ST.sel].kind.toLowerCase())); }
    chart.invalidate();
  };
  const onPick = (e) => {
    if (!U.pick || !chart || !chart.L || !chart.L.D) return; e.stopImmediatePropagation(); e.preventDefault(); U.pick = false; chart.cv.style.cursor = '';
    const r = chart.cv.getBoundingClientRect(), i = chart.idxAtX ? chart.idxAtX(e.clientX - r.left) : chart.L.D.length - 1, b = chart.L.D[Math.max(0, Math.min(chart.L.D.length - 1, i))];
    if (b) { U.av[ST.sel] = { t: b.t, kind: 'Anchor' }; toast('⚓ AVWAP anchored'); chart.invalidate(); }
  };
  const toolbar = () => {
    const rp = $1('#replayBtn'); if (!rp || $1('#v164AvBtn')) return;
    const b = document.createElement('button'); b.id = 'v164AvBtn'; b.type = 'button'; b.className = 'btn sm'; b.title = 'Anchored VWAP: click a candle, session open or the last swing'; b.setAttribute('aria-haspopup', 'menu');
    b.innerHTML = icon('<path d="M12 3v14M7 8h10M5 14c1.5 4 4 6 7 6s5.5-2 7-6" fill="none" stroke="currentColor" stroke-width="1.8"/>') + '<span>AVWAP</span>';
    b.addEventListener('click', avMenu); rp.before(b);
  };
  const overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L || !L.py || !L.D || !L.D.length) return;
    const D = L.D, top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, xr = L.W - L.Rm, ok = (y) => Number.isFinite(y) && y >= top && y <= bot;
    g.save(); g.beginPath(); g.rect(L.Lm, top, L.W - L.Lm - L.Rm, bot - top); g.clip();
    const a = U.av[ST.sel];
    if (a) { const i0 = V164.anchorIdx(D, a.t), av = V164.avwap(D, i0); g.strokeStyle = '#D4AF37'; g.lineWidth = 1.6; g.beginPath(); let st = false; for (let i = Math.max(i0, (L.end || D.length) - (L.bars || D.length)); i < (L.end || D.length); i++) { const x = ch.tToX(D[i].t), y = L.py(av[i]); if (!Number.isFinite(x) || !ok(y)) { st = false; continue; } if (st) g.lineTo(x, y); else { g.moveTo(x, y); st = true; } } g.stroke(); const lv = av[D.length - 1]; if (Number.isFinite(L.py(lv))) { const y = L.py(lv), yy = Math.max(top + 30, Math.min(bot - 4, y - 5)), off = y < top ? ' ▲' : y > bot ? ' ▼' : ''; g.font = '700 10px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#D4AF37'; g.textAlign = 'right'; g.fillText(`AVWAP · ${a.kind} ${fp(lv)}${off}`, xr - 6, yy); } } // off-screen AVWAP: label pinned to the edge with ▲ / ▼
    if (U.markers.sym === ST.sel) for (const m of U.markers.list) { const x = ch.tToX(m.t), y = L.py(m.price); if (!Number.isFinite(x) || !ok(y)) continue; const buy = m.side === 'buy'; g.fillStyle = buy ? '#2fd08a' : m.pnl >= 0 ? '#7dd3fc' : '#f43f5e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y + (buy ? 9 : -9)); g.lineTo(x + 5, y + (buy ? 9 : -9)); g.closePath(); g.fill(); if (!buy) { g.font = '600 9px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillText(m.label, x, y - 12); } }
    g.restore();
    if (U.cfg.tapeStrip) {
      const now = Date.now(), t10 = V164.tapeDelta(U.tape, now, 10), t60 = V164.tapeDelta(U.tape, now, 60), bk = (typeof V163UI !== 'undefined' && V163UI.books && V163UI.books[ST.sel]) || (typeof P5UI !== 'undefined' && P5UI.book && P5UI.book.sym === ST.sel ? P5UI.book : null), im = V164.imbalance(bk, 10);
      const part = (t, l) => (t.ratio == null ? `${l} –` : `${l} ${Math.round(t.ratio * 100)}% buy ${t.delta >= 0 ? '+' : '−'}$${NT.fmtCompact(Math.abs(t.delta))}`);
      const txt = `Tape ${part(t10, '10s')} · ${part(t60, '60s')}${im ? ` · Book ${im.imb >= 0 ? '+' : ''}${im.imb.toFixed(2)}` : ''}`, w = Math.min(L.W - L.Lm - L.Rm - 20, 520), x0 = L.Lm + (L.W - L.Lm - L.Rm - w) / 2, y0 = top + 2;
      g.globalAlpha = 0.85; g.fillStyle = 'rgba(12,12,15,.78)'; g.fillRect(x0, y0, w, 18); const r10 = t10.ratio == null ? 0.5 : t10.ratio; g.fillStyle = '#2fd08a'; g.fillRect(x0, y0 + 15, w * r10, 3); g.fillStyle = '#f43f5e'; g.fillRect(x0 + w * r10, y0 + 15, w * (1 - r10), 3);
      g.globalAlpha = 1; g.fillStyle = '#e8e8ea'; g.font = '600 10px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x0 + w / 2, y0 + 7.5); g.textBaseline = 'alphabetic';
    }
  };
  /* young on-chain tokens: fit the viewport to the bars that exist so every timeframe renders edge-to-edge */
  let fitKey = '';
  const fit = () => {
    if (!chart || !chart.view) return;
    if (!/^oc:/.test(ST.sel)) { if (U.fitPrev) { chart.view.bars = U.fitPrev; U.fitPrev = 0; fitKey = ''; chart.invalidate(); } return; } // leaving the young token restores the user's zoom
    const k = ST.sel + '|' + ST.tf + '|' + chart.data.length; if (k === fitKey) return; fitKey = k;
    const n = chart.data.length, cur = U.fitPrev || chart.view.bars || 120, want = V164.fitBars(n, cur, 12);
    if (n > 1 && want < cur) { if (!U.fitPrev) U.fitPrev = chart.view.bars || 120; chart.view.bars = want; chart.invalidate(); } else if (U.fitPrev) { chart.view.bars = U.fitPrev; U.fitPrev = 0; chart.invalidate(); }
  };
  /* full-depth on-chain timeframes GeckoTerminal does not serve natively (30m, 12h, 1w, 1M): fetch the finer unit, aggregate */
  const ocWire = () => {
    if (typeof OC === 'undefined' || !OC.history || OC.history._v164) return; const h0 = OC.history, c0 = OC.candles;
    const wrap = (f) => async function (sym, tf, n, onProg) { const p = V164.ocPlan(tf); if (p && p.k > 1) { const raw = await f.call(this, sym, p.fetchSec, Math.min(V164.OC_LIMIT * 4, (n || 300) * p.k), onProg); return V164.aggregate(raw, tf).slice(-(n || 300)); } return f.call(this, sym, tf, n, onProg); };
    OC.history = wrap(h0); OC.history._v164 = true; if (c0) OC.candles = wrap(c0);
  };

  /* ══ 6–14. DEX tab Discovery ══ */
  const CHAIN_OF = (c) => ({ solana: 'solana', base: 'base', eth: 'eth', ethereum: 'eth', bsc: 'bsc', arbitrum: 'arbitrum' }[String(c || '').toLowerCase()] || String(c || '').toLowerCase());
  const tier = (m) => (!(m > 0) ? 'Unranked' : m >= 5e10 ? 'Mega cap' : m >= 5e9 ? 'Large cap' : m >= 5e8 ? 'Mid cap' : 'Small cap');
  const spark = (id) => { try { const s = (typeof Stores !== 'undefined' && (Stores.get(id + '|1h') || Stores.get(id + '|15m'))); return s && s.candles && s.candles.length > 4 ? s.candles.slice(-24).map((k) => k.c) : null; } catch (e) { return null; } };
  const buildRows = () => {
    const m = mode(), out = [];
    if (m === 'crypto' && typeof heat !== 'undefined') for (const i of heat.items || []) {
      if (!(i.price > 0) || (NT.STABLES && NT.STABLES.has(i.sym)) || (NT.WRAPPED && NT.WRAPPED.has(i.sym))) continue; const id = i.sym + '-USD', L = Feed.live[id] || {}, w5 = tapeWin(id, 300), w15 = tapeWin(id, 900), w1 = tapeWin(id, 3600);
      out.push({ id, mode: 'crypto', sym: i.sym, name: i.name, group: tier(i.mcap), price: L.price || i.price, ch: L.price && L.open24 ? (L.price / L.open24 - 1) * 100 : i.ch24h, ch1h: i.ch1h, mcap: i.mcap, v24: i.vol, v1h: null, liq: null, rvol: null, range: Number.isFinite(i.ch1h) ? Math.abs(i.ch1h) : null, spread: V164.spread(L.bid, L.ask), b5: w5 && w5.b, s5: w5 && w5.s, v5: w5 && w5.v, b15: w15 && w15.b, s15: w15 && w15.s, b1h: w1 && w1.b, s1h: w1 && w1.s, spark: spark(id) });
    }
    if (m === 'stocks' && typeof STOCKS !== 'undefined') for (const [s, n, sec, sh] of STOCKS) {
      const q = (typeof sheat !== 'undefined' && sheat.q[s]) || {}, L = Feed.live[s] || {}, p = L.price || q.price, prev = L.open24 || q.prev; if (!(p > 0)) continue;
      out.push({ id: s, mode: 'stocks', sym: s, name: n, group: sec, price: p, ch: prev ? (p / prev - 1) * 100 : q.ch, mcap: sh * p, v24: q.vol ? q.vol * p : null, v1h: null, liq: null, rvol: null, range: null, spread: V164.spread(L.bid, L.ask), spark: spark(s) });
    }
    if (m === 'onchain' && typeof OC !== 'undefined') for (const s of Object.keys(OC.stats || {})) {
      if (!/^oc:/.test(s)) continue; const st = OC.stats[s] || {}, me = OC.meta[s] || {}, p0 = OC.parse(s); if (!p0 || (p0.chain === 'sim') !== !!OC.sim) continue; const L = Feed.live[s] || {};
      const chn = CHAIN_OF(p0.chain), b24 = st.buys24, s24 = st.sells24;
      out.push({ id: s, mode: 'onchain', sym: me.s || OC.label(s), name: me.n, chain: chn, dex: V164.dexKey(me.dex), group: V164.CHAIN_LABEL[chn] || chn, price: L.price || st.price, ch: st.ch24, ch5m: st.ch5m, ch1h: st.ch1h, liq: st.liq, mcap: st.mcap || st.fdv, v5: st.vol5m, v1h: st.vol1h, v24: st.vol24, rvol: V164.rvol(st.vol1h, st.vol24), range: Number.isFinite(st.ch1h) ? Math.abs(st.ch1h) : null, created: st.created, holders: st.holders != null ? +st.holders : null, bsPct: b24 + s24 > 0 ? (b24 / (b24 + s24)) * 100 : null, b5: st.buys5m, s5: st.sells5m, b15: st.buys15m, s15: st.sells15m, b1h: st.buys1h, s1h: st.sells1h, b24, s24, mintOff: me.mintOff, lpLocked: me.lpLocked, top10: me.top10, smartIn: me.smartIn, spark: spark(s) });
    }
    return V164.isolate(out, m);
  };
  const filtered = () => {
    const R = V164.pill(V164.applyFilter(U.rows, U.cfg.filter), U.cfg.pill), k = U.sort.k, d = U.sort.d;
    if (k === 'sym' || k === 'group') return [...R].sort((a, b) => String(a[k] || '').localeCompare(String(b[k] || '')) * (d < 0 ? -1 : 1));
    const val = (r) => (Number.isFinite(r[k]) ? r[k] : null);
    return [...R].sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return d < 0 ? y - x : x - y; }); // missing values always last
  };
  const ensureData = () => {
    const m = mode(); if (typeof ST === 'undefined' || !ST.heat) return;
    if (ST.heat.asset !== m) { ST.heat.asset = m; try { if (typeof buildHeatControls === 'function') buildHeatControls(); loadHeat(false); } catch (e) { /* heat tab not built */ } } // strict isolation: the legacy heat views follow the market pill too
  };
  const VIEWS = [['scanner', 'Scanner'], ['tiles', 'Tiles'], ['bubbles', 'Bubbles'], ['pressure', 'Buy Pressure']];
  const dexHTML = () => `<div class="v164-dh">${icon('<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.8"/>')}<h3>Discovery</h3><span class="v164-mode" id="v164Mode" role="status"></span>
      <div class="seg" id="v164Views" role="tablist" aria-label="Discovery view">${VIEWS.map(([k, l]) => `<button type="button" role="tab" data-v164v="${k}" aria-selected="false">${esc(l)}</button>`).join('')}</div>
      <span class="sp"></span><input class="in v164-q" id="v164Q" placeholder="Search ( / )" aria-label="Quick search" autocomplete="off">
      <select class="in" id="v164Preset" aria-label="Filter preset"><option value="">Presets…</option>${Object.entries(V164.PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}</select>
      <button type="button" class="btn sm" data-v164a="filters" id="v164FBtn" aria-expanded="false">Filters</button>
      <button type="button" class="btn sm" data-v164a="basket" title="Export the filtered basket (max 10) to the Quant Lab portfolio backtest">Export basket → Quant Lab</button>
      <button type="button" class="btn sm" data-v164a="orbit" title="Open the 3D Multi-Asset Correlation Orbit">3D Orbit</button></div>
    <div class="v164-pills" id="v164Pills" role="group" aria-label="Group filter"></div>
    <div class="v164-filter" id="v164Filter" hidden></div>
    <div class="v164-body"><div class="v164-main" id="v164Main" tabindex="0" aria-label="Discovery results"></div><aside class="v164-rail" id="v164Rail" aria-label="Top movers and volume anomalies"></aside></div>
    <div class="v164-tip" id="v164Tip" hidden></div>`;
  let dex = null;
  const mountDex = () => {
    const tab = $1('#tab-heat'); if (!tab) return null; const col = tab.firstElementChild; if (!col) return null;
    if (dex && dex.isConnected) return dex;
    dex = document.createElement('section'); dex.id = 'v164Dex'; dex.className = 'panel v164-dex'; dex.innerHTML = dexHTML(); col.insertBefore(dex, col.firstChild);
    dex.addEventListener('click', onDexClick); dex.addEventListener('input', onDexInput); dex.addEventListener('change', onDexInput);
    dex.addEventListener('mousemove', onTipMove); dex.addEventListener('mouseleave', () => { const t = $1('#v164Tip'); if (t) t.hidden = true; });
    $1('#v164Main', dex).addEventListener('keydown', onDexKey);
    return dex;
  };
  const openChart = (id, bracket) => {
    const m = V164.modeOf(id); if (!m) return; if (ST.mode !== m && typeof setMode === 'function') setMode(m); selectSym(id); showTab('markets');
    if (bracket && typeof ChartTrade !== 'undefined') { const p = px0(id) || (U.rows.find((r) => r.id === id) || {}).price; if (p > 0) { const usdV = parseFloat(($1('#tkUsd') || {}).value) || 100; ChartTrade.draft = { sym: id, entry: p, sl: p * 0.98, tp: p * 1.04, usd: usdV }; ChartTrade.changed(false); toast(`Bracket drafted on ${esc(baseOf(id))}: drag Entry / SL / TP, then place`, 'acc'); } }
  };
  const pin = (id) => { if (!ST.watch.includes(id)) { ST.watch.push(id); try { renderWatch(); saveState(); Feed.subscribe([id]); } catch (e) { /* watchlist */ } toast('Pinned ' + esc(baseOf(id)) + ' to the watchlist', 'acc'); } else toast(esc(baseOf(id)) + ' is already on the watchlist'); };
  const onDexClick = (e) => {
    const v = e.target.closest('[data-v164v]'); if (v) { U.cfg.view = v.dataset.v164v; save(); paintDex(true); return; }
    const p = e.target.closest('[data-v164p]'); if (p) { U.cfg.pill = p.dataset.v164p; save(); paintDex(true); return; }
    const s = e.target.closest('[data-v164s]'); if (s) { const k = s.dataset.v164s; U.sort = { k, d: U.sort.k === k ? -U.sort.d : -1 }; paintDex(true); return; }
    const pn = e.target.closest('[data-v164pin]'); if (pn) { e.stopPropagation(); pin(pn.dataset.v164pin); return; }
    const a = e.target.closest('[data-v164a]');
    if (a) { const k = a.dataset.v164a;
      if (k === 'filters') { const f = $1('#v164Filter'); f.hidden = !f.hidden; a.setAttribute('aria-expanded', String(!f.hidden)); if (!f.hidden) paintFilter(); return; }
      if (k === 'basket') { exportBasket(); return; }
      if (k === 'orbit') { showTab($1('#tab-world') ? 'world' : 'ai'); setTimeout(() => { const o = $1('#v157Corr'); if (o) o.scrollIntoView({ block: 'center' }); }, 600); return; }
      if (k === 'fapply') { readFilter(); $1('#v164Filter').hidden = true; paintDex(true); return; }
      if (k === 'freset') { U.cfg.filter = V164.FILTER_DEF(); save(); paintFilter(); paintDex(true); return; }
      if (k === 'chain' || k === 'dex') { U.cfg.filter[k] = a.dataset.val; save(); paintFilter(); if (k === 'chain' && a.dataset.val !== 'all' && typeof OC !== 'undefined' && OC.discover) OC.discover('trending', a.dataset.val === 'eth' ? 'eth' : a.dataset.val, false).then(() => { U.rows = buildRows(); paintDex(true); }, () => {}); paintDex(true); return; }
      return; }
    const r = e.target.closest('[data-v164id]'); if (r) openChart(r.dataset.v164id, e.shiftKey);
  };
  const onDexInput = (e) => {
    const t = e.target;
    if (t.id === 'v164Q') { U.cfg.filter.q = t.value.slice(0, 40); paintDex(true); return; }
    if (t.id === 'v164Preset' && t.value) { const P = V164.PRESETS[t.value]; U.cfg.filter = Object.assign(V164.FILTER_DEF(), P.f, { q: U.cfg.filter.q }); save(); paintFilter(); paintDex(true); toast('Preset: ' + esc(P.label), 'acc'); t.value = ''; return; }
    if (t.dataset.v164bub) { U.cfg.bub = t.dataset.v164bub; save(); paintDex(true); }
  };
  const onDexKey = (e) => {
    const n = U.view.length; if (!n) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); U.sel = (U.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; paintSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = U.view[U.sel]; if (r) openChart(r.id, e.shiftKey); }
    else if (e.key.toLowerCase() === 'p') { const r = U.view[U.sel]; if (r) pin(r.id); }
  };
  const paintSel = () => { for (const x of document.querySelectorAll('#v164Main [data-v164id]')) x.classList.toggle('sel', x.dataset.v164id === (U.view[U.sel] || {}).id); const s = $1('#v164Main .sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); };
  const FIELDS = [['liq', 'Liquidity $', 'liqMin', 'liqMax'], ['mcap', 'Market cap / FDV $', 'mcapMin', 'mcapMax'], ['v5', '5m volume $ (min)', 'v5Min', null], ['v1h', '1h volume $ (min)', 'v1hMin', null], ['v24', '24h volume $', 'v24Min', 'v24Max'], ['age', 'Token age (m / h / d)', 'ageMin', 'ageMax'], ['hold', 'Holders (min)', 'holdMin', null], ['bs', 'Buy / sell tx ratio %', 'bsMin', 'bsMax']];
  const paintFilter = () => {
    const f = $1('#v164Filter'); if (!f) return; const F = U.cfg.filter, oc = mode() === 'onchain';
    const pills = (k, list, lab) => `<div class="v164-fp" role="group" aria-label="${k}">${list.map((x) => `<button type="button" class="${F[k] === x ? 'on' : ''}" data-v164a="${k}" data-val="${x}" aria-pressed="${F[k] === x}">${esc(lab[x])}</button>`).join('')}</div>`;
    const inp = (key, ph) => (key ? `<input class="in mono" data-v164f="${key}" value="${esc(F[key])}" placeholder="${ph}" inputmode="decimal" aria-label="${key}">` : '<span></span>');
    const tg = (k, l) => `<label class="v160-chk"><input type="checkbox" data-v164f="${k}"${F[k] ? ' checked' : ''}${oc ? '' : ' disabled'}> ${l}</label>`;
    f.innerHTML = `${oc ? pills('chain', V164.CHAINS, V164.CHAIN_LABEL) + pills('dex', V164.DEXES, V164.DEX_LABEL) : `<p class="note">${esc(mode() === 'stocks' ? 'US equities' : 'Crypto pairs')}: liquidity, market-cap and volume ranges apply; chain, DEX and token-safety filters are on-chain only.</p>`}
      <div class="v164-fg">${FIELDS.filter(([k]) => oc || ['liq', 'mcap', 'v24'].includes(k)).map(([k, l, a, b]) => `<label><span>${esc(l)}</span><div class="v164-mm">${inp(a, 'min')}${inp(b, 'max')}</div></label>`).join('')}</div>
      <div class="v164-tg">${tg('noMint', 'No mint authority')}${tg('lpLocked', 'LP burned / locked')}${tg('top10', 'Top-10 holders &lt; 25%')}${tg('smart', 'Whale / smart-money inflow &gt; $10k')}</div>
      ${oc ? '<p class="note">Safety toggles are strict: a token without scanned safety data never passes them (scan it under Lab → Token safety).</p>' : ''}
      <div class="v164-fa"><button type="button" class="btn sm pri" data-v164a="fapply">Apply</button><button type="button" class="btn sm" data-v164a="freset">Reset</button></div>`;
  };
  const readFilter = () => { const F = U.cfg.filter; for (const el of document.querySelectorAll('#v164Filter [data-v164f]')) { const k = el.dataset.v164f; if (el.type === 'checkbox') F[k] = el.checked; else F[k] = String(el.value).trim().slice(0, 20); } save(); };
  const exportBasket = () => {
    const b = V164.basket(U.view, mode(), 10); if (!b.n) { toast('Nothing in the filtered view to export', 'amb'); return; }
    U.basket = b; U.cfg.rtab = 'portfolio'; save(); showTab('lab'); setTimeout(() => { const st = mountStudio(); if (st) { st.open = true; paintStudio(); st.scrollIntoView({ block: 'start' }); } }, 300);
    toast(`Basket of ${esc(b.n)} ${esc(b.mode)} symbols sent to the Quant Lab portfolio backtest`, 'acc');
  };
  const sparkSVG = (xs, w, h) => { if (!xs || xs.length < 3) return ''; const lo = Math.min(...xs), hi = Math.max(...xs), s = hi - lo || 1; const pts = xs.map((v, i) => `${((i / (xs.length - 1)) * w).toFixed(1)},${(h - 1 - ((v - lo) / s) * (h - 2)).toFixed(1)}`).join(' '); return `<svg class="v164-sp" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${xs[xs.length - 1] >= xs[0] ? '#2fd08a' : '#f43f5e'}" stroke-width="1.3"/></svg>`; };
  const heatBg = (ch) => { if (!Number.isFinite(ch)) return 'rgba(255,255,255,.05)'; const k = Math.min(1, Math.abs(ch) / 8); return ch >= 0 ? `rgba(47,208,138,${(0.12 + 0.55 * k).toFixed(2)})` : `rgba(244,63,94,${(0.12 + 0.55 * k).toFixed(2)})`; };
  const renderScanner = (host, R) => {
    const oc = mode() === 'onchain', cols = [['sym', 'Symbol'], oc ? ['group', 'Chain / DEX'] : ['group', mode() === 'stocks' ? 'Sector' : 'Tier'], ['price', 'Price'], ...(oc ? [['ch5m', '5m'], ['ch1h', '1h']] : [['ch1h', '1h']]), ['ch', '24h'], ['liq', oc ? 'Liquidity' : 'Spread'], ['mcap', 'Mkt cap'], ['v24', '24h vol'], ...(oc ? [['created', 'Age'], ['bsPct', 'B/S %'], ['rvol', 'RVOL']] : [])];
    const now = Date.now(), cell = (r, k) => { if (k === 'sym') return `<b>${esc(r.sym)}</b>${r.name ? ` <span class="note">${esc(String(r.name).slice(0, 18))}</span>` : ''}`; if (k === 'group') return esc(oc ? `${r.group}${r.dex && r.dex !== 'other' ? ' · ' + (V164.DEX_LABEL[r.dex] || r.dex) : ''}` : r.group); if (k === 'price') return esc(fp(r.price)); if (/^ch/.test(k)) return `<span class="${r[k] >= 0 ? 'up' : 'dn'}">${esc(pct(r[k]))}</span>`; if (k === 'liq') return oc ? esc(usd(r.liq)) : r.spread != null ? esc(r.spread.toFixed(1) + ' bps') : '–'; if (k === 'created') return r.created ? esc(V163 ? V163.countdown(now - r.created).replace(/ \d+s$/, '') : '') : '–'; if (k === 'bsPct') return Number.isFinite(r.bsPct) ? esc(r.bsPct.toFixed(0) + '%') : '–'; if (k === 'rvol') return Number.isFinite(r.rvol) ? `<span class="${r.rvol >= 3 ? 'v164-hot' : ''}">${esc(r.rvol.toFixed(1))}×</span>` : '–'; return esc(usd(r[k])); };
    host.innerHTML = `<table class="v164-t"><thead><tr>${cols.map(([k, l]) => `<th><button type="button" data-v164s="${k}" aria-sort="${U.sort.k === k ? (U.sort.d < 0 ? 'descending' : 'ascending') : 'none'}">${esc(l)}</button></th>`).join('')}<th></th></tr></thead><tbody>${R.slice(0, 200).map((r) => `<tr data-v164id="${esc(r.id)}" tabindex="-1">${cols.map(([k]) => `<td>${cell(r, k)}</td>`).join('')}<td><button type="button" class="btn xs" data-v164pin="${esc(r.id)}" aria-label="Pin ${esc(r.sym)} to the watchlist">Pin</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="note">No ${esc(mode())} markets match these filters.</td></tr>`}</tbody></table>`;
  };
  const renderTiles = (host, R) => {
    const W = host.clientWidth || 900, H = 440, items = R.slice(0, 80).map((r) => ({ value: Math.max(1, Math.sqrt(r.mcap || r.v24 || r.liq || 1)), d: r })); host.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'v164-tiles'; wrap.style.height = H + 'px'; host.appendChild(wrap);
    for (const t of (typeof NT.treemap === 'function' ? NT.treemap(items, 0, 0, W, H) : [])) {
      const r = t.item.d, el = document.createElement('div'), m = Math.min(t.w, t.h); el.className = 'v164-tile'; el.dataset.v164id = r.id; el.style.cssText = `left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;background:${heatBg(r.ch)}`;
      el.innerHTML = m > 30 ? `<b>${esc(r.sym)}</b><span>${esc(pct(r.ch))}</span>${m > 70 ? `${Number.isFinite(r.rvol) && r.rvol >= 1.5 ? `<i class="v164-badge">RVOL ${esc(r.rvol.toFixed(1))}×</i>` : ''}${r.spread != null ? `<i class="v164-sbadge">${esc(r.spread.toFixed(1))} bps</i>` : ''}${t.w > 110 ? sparkSVG(r.spark, Math.min(96, t.w - 16), 18) : ''}` : ''}` : '';
      el.title = `${r.sym} ${pct(r.ch)} · click: chart · Shift+click: bracket order`; wrap.appendChild(el);
    }
  };
  let bubCv = null, bubPts = [];
  const renderBubbles = (host, R) => {
    // v17.1: fill ~85% of the viewport (DPR-aware), redraw when the host is resized
    host._x171R = R; const top = Math.max(0, host.getBoundingClientRect().top), W = host.clientWidth || 900, H = Math.max(420, Math.round(Math.min(innerHeight * 0.85, innerHeight - top - 12))), k = U.cfg.bub, ks = Math.sqrt((W * H) / (900 * 440));
    if (typeof ResizeObserver !== 'undefined' && host._x171w === undefined) { host._x171w = W; new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - host._x171w) > 24 && bubCv && bubCv.isConnected && U.cfg.view === 'bubbles') { host._x171w = w; renderBubbles(host, host._x171R); } }).observe(host); }
    host.innerHTML = `<div class="v164-fp" role="group" aria-label="Bubble size">${V164.BUB.map((x) => `<button type="button" data-v164bub="${x}" class="${x === k ? 'on' : ''}" aria-pressed="${x === k}">${esc(V164.BUB_LABEL[x])}</button>`).join('')}</div>`;
    bubCv = document.createElement('canvas'); bubCv.className = 'v164-bub'; bubCv.width = W * (devicePixelRatio || 1); bubCv.height = H * (devicePixelRatio || 1); bubCv.style.width = W + 'px'; bubCv.style.height = H + 'px'; bubCv.setAttribute('role', 'img'); bubCv.setAttribute('aria-label', `${R.length} ${mode()} markets sized by ${V164.BUB_LABEL[k]}`); host.appendChild(bubCv);
    const L = R.slice(0, 90), mx = Math.max(1e-9, ...L.map((r) => V164.bubbleMetric(r, k))), C = V164.clusters(L, W, H);
    bubPts = L.map((r, i) => { const c = C.get(r.group) || { x: W / 2, y: H / 2 }, a = i * 2.39996; return { r, x: c.x + Math.cos(a) * (8 + i), y: c.y + Math.sin(a) * (8 + i), rad: (8 + 34 * Math.sqrt(V164.bubbleMetric(r, k) / mx)) * ks, cx: c.x, cy: c.y }; });
    for (let it = 0; it < 90; it++) { for (const p of bubPts) { p.x += (p.cx - p.x) * 0.02; p.y += (p.cy - p.y) * 0.02; } for (let i = 0; i < bubPts.length; i++) for (let j = i + 1; j < bubPts.length; j++) { const a = bubPts[i], b = bubPts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, mn = a.rad + b.rad + 2; if (d < mn) { const s = (mn - d) / 2 / d; a.x -= dx * s; a.y -= dy * s; b.x += dx * s; b.y += dy * s; } } for (const p of bubPts) { p.x = Math.max(p.rad, Math.min(W - p.rad, p.x)); p.y = Math.max(p.rad, Math.min(H - p.rad, p.y)); } }
    const g = bubCv.getContext('2d'); g.scale(devicePixelRatio || 1, devicePixelRatio || 1);
    g.font = '600 10px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(212,175,55,.6)'; for (const [name, c] of C) g.fillText(name, c.x, Math.max(12, c.y - 70));
    for (const p of bubPts) { const col = V164.bubbleColor(p.r, k); g.beginPath(); g.arc(p.x, p.y, p.rad, 0, Math.PI * 2); g.fillStyle = col >= 0 ? `rgba(47,208,138,${(0.18 + 0.5 * col).toFixed(2)})` : `rgba(244,63,94,${(0.18 + 0.5 * -col).toFixed(2)})`; g.fill(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.stroke(); if (p.rad > 13) { const ch = [p.r.ch24, p.r.ch, p.r.chg, p.r.change].find(Number.isFinite); P4.drawLabel(g, p.r.sym, p.x, p.y - (ch != null && p.rad > 20 ? 6 : 0), p.rad, '#F8FAFC', 'ui-sans-serif, system-ui, sans-serif'); if (ch != null && p.rad > 20) { g.font = '700 11px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = ch >= 0 ? '#5EF0B0' : '#FF8A96'; g.fillText((ch >= 0 ? '+' : '') + ch.toFixed(1) + '%', p.x, p.y + 10); } } }
    bubCv.addEventListener('click', (e) => { const h = hitBub(e); if (h) openChart(h.r.id, e.shiftKey); });
  };
  const hitBub = (e) => { if (!bubCv) return null; const b = bubCv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return bubPts.find((p) => Math.hypot(p.x - x, p.y - y) <= p.rad) || null; };
  const onTipMove = (e) => {
    const t = $1('#v164Tip'); if (!t) return; const h = e.target === bubCv ? hitBub(e) : null; if (!h) { t.hidden = true; return; } const r = h.r;
    t.innerHTML = `<b>${esc(r.sym)}</b> <span class="${r.ch >= 0 ? 'up' : 'dn'}">${esc(pct(r.ch))}</span><div class="note">${esc(fp(r.price))} · ${r.liq ? 'liquidity ' + esc(usd(r.liq)) : r.spread != null ? 'spread ' + esc(r.spread.toFixed(1)) + ' bps' : esc(r.group)}${Number.isFinite(r.rvol) ? ' · RVOL ' + esc(r.rvol.toFixed(1)) + '×' : ''}</div>${sparkSVG(r.spark, 140, 26)}<div class="note">click: chart · Shift+click: bracket</div>`;
    const b = dex.getBoundingClientRect(); t.hidden = false; const c = P4.clampTip(e.clientX - b.left + 14, e.clientY - b.top + 14, t.offsetWidth, t.offsetHeight, b.width, b.height); t.style.left = c.x + 'px'; t.style.top = c.y + 'px';
  };
  const renderPressure = (host, R) => {
    const rows = R.map((r) => ({ r, p: V164.pressure(r) })).filter((x) => x.p.h1 || x.p.m5 || x.p.h24).sort((a, b) => ((b.p.h1 || b.p.h24 || b.p.m5).ratio - (a.p.h1 || a.p.h24 || a.p.m5).ratio)).slice(0, 60);
    const bar = (w, l) => (w ? `<div class="v164-pb" title="${esc(l)}: ${esc(w.pct.toFixed(0))}% buyers"><i style="width:${w.pct.toFixed(1)}%"></i><span>${esc(l)} ${esc(w.pct.toFixed(0))}%</span></div>` : `<div class="v164-pb off"><span>${esc(l)} –</span></div>`);
    host.innerHTML = rows.length ? `<div class="v164-press">${rows.map(({ r, p }) => { const d = (p.h1 && p.h1.delta) != null ? p.h1.delta : p.m5 && p.m5.delta; return `<div class="v164-prow" data-v164id="${esc(r.id)}" tabindex="-1"><b>${esc(r.sym)}</b>${bar(p.m5, '5m')}${bar(p.m15, '15m')}${bar(p.h1, '1h')}<span class="mono ${d >= 0 ? 'up' : 'dn'}">${Number.isFinite(d) ? esc((d >= 0 ? '+' : '−') + '$' + NT.fmtCompact(Math.abs(d))) : '–'}</span></div>`; }).join('')}</div><p class="note">Taker buy share of ${mode() === 'onchain' ? 'swap counts' : 'live tape $ volume'} per window; net aggressive $ delta = volume × (2 × buy share − 1).</p>` : `<p class="note">No buyer / seller flow yet for these ${esc(mode())} markets${mode() === 'onchain' ? '' : ': it builds from the live tape of the subscribed symbols'}.</p>`;
  };
  const paintRail = (R) => {
    const rail = $1('#v164Rail'); if (!rail) return; const M = V164.movers(R, 6);
    const li = (r, v) => `<li data-v164id="${esc(r.id)}"><b>${esc(r.sym)}</b><span class="mono">${v}</span><button type="button" class="btn xs" data-v164pin="${esc(r.id)}" aria-label="Pin ${esc(r.sym)}">Pin</button></li>`;
    rail.innerHTML = `<h4>Top Gainers</h4><ul>${M.gainers.map((r) => li(r, `<span class="up">${esc(pct(r.ch))}</span>`)).join('') || '<li class="note">–</li>'}</ul><h4>Top Losers</h4><ul>${M.losers.map((r) => li(r, `<span class="dn">${esc(pct(r.ch))}</span>`)).join('') || '<li class="note">–</li>'}</ul><h4>&gt; 3× Volume Surges</h4><ul>${M.surges.map((r) => li(r, `<span class="v164-hot">${esc(r.rvol.toFixed(1))}×</span>`)).join('') || '<li class="note">none right now</li>'}</ul>`;
  };
  let dexKey = '';
  const paintDex = (force) => {
    const d = mountDex(); if (!d || curTab !== 'heat') return; ensureData();
    U.rows = buildRows(); const R = filtered(), m = mode(), k = [m, U.cfg.view, U.cfg.pill, U.cfg.bub, JSON.stringify(U.cfg.filter), U.sort.k, U.sort.d, R.length, R.slice(0, 40).map((r) => r.id + (r.price || 0).toPrecision(6)).join()].join('|');
    U.view = R; if (!force && k === dexKey) return; dexKey = k; U.stats.renders++;
    $1('#v164Mode').textContent = `${m === 'onchain' ? 'On-chain DEX tokens only' : m === 'stocks' ? 'US equities only' : 'Crypto pairs only'} · ${R.length} of ${U.rows.length}`;
    for (const b of d.querySelectorAll('[data-v164v]')) { const on = b.dataset.v164v === U.cfg.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    const pills = [['all', 'All'], ['movers', 'Top Movers'], ['surges', 'Volume Surges'], ...V164.groups(U.rows).map((g) => [g, g])];
    if (!pills.some(([x]) => x === U.cfg.pill)) U.cfg.pill = 'all';
    $1('#v164Pills').innerHTML = pills.map(([x, l]) => `<button type="button" data-v164p="${esc(x)}" class="${U.cfg.pill === x ? 'on' : ''}" aria-pressed="${U.cfg.pill === x}">${esc(l)}</button>`).join('');
    const fc = V164.filterCount(U.cfg.filter), fb = $1('#v164FBtn'); fb.textContent = fc ? `Filters (${fc})` : 'Filters';
    const q = $1('#v164Q'); if (q && document.activeElement !== q && q.value !== U.cfg.filter.q) q.value = U.cfg.filter.q;
    const host = $1('#v164Main'), v = U.cfg.view; if (v === 'tiles') renderTiles(host, R); else if (v === 'bubbles') renderBubbles(host, R); else if (v === 'pressure') renderPressure(host, R); else renderScanner(host, R);
    paintRail(R); U.sel = Math.min(U.sel, Math.max(0, R.length - 1)); paintSel();
  };
  const onSlash = (e) => { if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typeof curTab === 'undefined' || curTab !== 'heat') return; const a = document.activeElement; if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) return; const q = $1('#v164Q'); if (q) { e.preventDefault(); e.stopImmediatePropagation(); q.focus(); q.select(); } }; // DEX tab only: `/` searches Discovery

  /* ══ 16. Copilot ══ */
  /* the chart drops its series while Markets is hidden, so the Copilot reads the candle store of the active symbol instead */
  const chartBars = () => { if (typeof chart !== 'undefined' && chart && chart.data && chart.data.length >= 30) return chart.data.slice(-600); try { const s = getStore(ST.sel, ST.tf); if (s.candles.length < 30 && s.load && !s.loading) s.load(400); return s.candles.slice(-600); } catch (e) { return []; } };
  const COP_ACTS = [['analyze', 'Analyze Active Chart'], ['preview', 'Preview Lines on Chart'], ['stop15', 'Set Stop to 1.5 ATR'], ['validate', 'Run 17-Test Validation'], ['pine', 'Copy Pine Script v5'], ['audit', 'Audit Pre-Trade Setup'], ['leaks', 'Scan Ledger for Leaks']];
  const copHTML = () => `<div class="v164-dh">${icon('<path d="M12 3l2.2 5.2L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.6"/>')}<h3>Quant &amp; Execution Copilot</h3><span class="note">zero API key · reads your chart, ticket and ledger locally</span></div>
    <div class="v164-acts" role="group" aria-label="Copilot actions">${COP_ACTS.map(([k, l]) => `<button type="button" class="btn sm v164-pill" data-v164c="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="v164-nl"><label class="note" for="v164Nl">Describe a strategy in plain words</label><textarea class="in" id="v164Nl" rows="2" placeholder="buy when RSI 14 is below 30 and price is above the SMA 200, stop 3%, target 6%"></textarea><button type="button" class="btn sm pri" data-v164c="nl">Generate safe strategy + Pine v5</button></div>
    <div id="v164CopOut" class="v164-out" role="status" aria-live="polite"></div>
    <details class="v164-lib"><summary>Safe Pine Script v5 template library</summary><div class="row"><select class="in" id="v164PineSel" aria-label="Template">${V164.PINE_LIB.map((k) => `<option value="${k}">${esc(V164.PINE_NAME[k])}</option>`).join('')}</select><button type="button" class="btn sm" data-v164c="tcopy">Copy template</button></div><div id="v164PineChk" class="v164-chk"></div><pre class="v161-pre mono v164-code" id="v164PineSrc" tabindex="0" aria-label="Pine template source"></pre></details>`;
  let cop = null;
  const mountCop = () => { const t = $1('#tab-ai'); if (!t) return null; if (cop && cop.isConnected) return cop; cop = document.createElement('section'); cop.id = 'v164Cop'; cop.className = 'panel v164-cop'; cop.innerHTML = copHTML(); t.insertBefore(cop, t.firstChild); cop.addEventListener('click', onCop); cop.addEventListener('change', (e) => { if (e.target.id === 'v164PineSel') paintPine(); }); paintPine(); return cop; };
  const paintPine = () => { const s = $1('#v164PineSel'), src = V164.pine(s ? s.value : 'orb'), ck = V164.pineCheck(src); const p = $1('#v164PineSrc'); if (p && p.textContent !== src) p.textContent = src; const c = $1('#v164PineChk'); if (c) c.innerHTML = ck.rows.map((r) => `<span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${esc(r.k)}</span>`).join('') + (ck.repaint ? '<span class="bad">✗ look-ahead</span>' : '<span class="ok">✓ no repaint</span>'); };
  const out = (h) => { U.copOut = h; const o = $1('#v164CopOut'); if (o) o.innerHTML = h; };
  const copy = (txt, what) => { try { navigator.clipboard.writeText(txt).then(() => toast(esc(what) + ' copied', 'acc'), () => toast('Copy blocked: select the text manually', 'amb')); } catch (e) { toast('Copy blocked: select the text manually', 'amb'); } };
  const ticketCtx = () => { const p = px0(ST.sel), slp = parseFloat(($1('#tkSl') || {}).value) || 0, tpp = parseFloat(($1('#tkTp') || {}).value) || 0, lim = typeof tkType !== 'undefined' && tkType !== 'market' ? parseFloat(($1('#tkLimit') || {}).value) || p : p; return { entry: lim, sl: slp > 0 ? lim * (1 - slp / 100) : 0, tp: tpp > 0 ? lim * (1 + tpp / 100) : 0, side: 'long' }; };
  const validate = async (spec, label) => {
    let id; try { id = NT.Spec.register(spec); } catch (e) { out(`<p class="dn">${esc(e.message)}</p>`); return null; }
    const tf = ST.tf && NT.TF[ST.tf] ? ST.tf : '1h'; out(`<p class="note shimmer">Running the 17-test validation lab on ${esc(baseOf(ST.sel))} ${esc(tf)}…</p>`);
    try {
      const c = await History.get(ST.sel, NT.TF[tf], 3000); if (!c || c.length < 300) throw new Error('Validation needs at least 300 candles of history.');
      const r = await BTW.run({ type: 'validate', strat: id, params: {}, candles: c, o: { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: NT.TF[tf] } });
      const v = r.v || r; out(`<div class="v164-grade"><span class="grade big g-${esc(String(v.grade).toLowerCase())}">${esc(v.grade)}</span><div><b>${esc(label || spec.name)}</b><div class="note">${esc(v.verdict || '')} · ${(v.checks || []).filter((x) => x.status === 'pass').length}/${(v.checks || []).length} tests passed on ${esc(baseOf(ST.sel))} ${esc(tf)}.</div></div></div>${U.last.spec === spec ? '<div class="v164-acts"><button type="button" class="btn sm" data-v164c="pine">Copy Pine Script v5</button><button type="button" class="btn sm" data-v164c="studio">Open in Strategy Studio</button></div>' : ''}`);
      return v;
    } catch (e) { out(`<p class="dn">${esc(e.message || e)}</p>`); return null; }
  };
  const onCop = async (e) => {
    const b = e.target.closest('[data-v164c]'); if (!b) return; const k = b.dataset.v164c;
    if (k === 'analyze') { const r = V164.readChart(chartBars()); if (!r) { out('<p class="note">Open a chart with at least 30 candles first.</p>'); return; } U.read = r; out(`<p><b>${esc(baseOf(ST.sel))} ${esc(ST.tf)}</b>: ${esc(r.summary)}</p><ul class="v164-ul"><li>Regime: <b>${esc(r.regime)}</b> · EMA 20 ${esc(fp(r.ema20))} / EMA 50 ${esc(fp(r.ema50))}</li>${r.eqHighs.length ? `<li>Resting liquidity above (equal highs): ${r.eqHighs.map((x) => esc(fp(x))).join(', ')}</li>` : ''}${r.eqLows.length ? `<li>Resting liquidity below (equal lows): ${r.eqLows.map((x) => esc(fp(x))).join(', ')}</li>` : ''}<li>1.5 ATR stop distance: ${r.atr ? esc(fp(r.atr * 1.5)) : '–'}</li></ul><p class="note">Structure and levels only: not financial advice.</p>`); return; }
    if (k === 'preview') { const r = U.read || V164.readChart(chartBars()); if (!r || !r.atr || typeof ChartTrade === 'undefined') { out('<p class="note">Analyze a chart first.</p>'); return; } const e0 = r.last, sl = e0 - 1.5 * r.atr, tp = e0 + 3 * r.atr; ChartTrade.draft = { sym: ST.sel, entry: e0, sl, tp, usd: parseFloat(($1('#tkUsd') || {}).value) || 100 }; ChartTrade.changed(false); showTab('markets'); toast('Preview lines on the chart: 1.5 ATR stop, 2R target. Drag to adjust, nothing is placed yet.', 'acc'); return; }
    if (k === 'stop15') { const r = V164.readChart(chartBars()); if (!r || !r.atr) { out('<p class="note">Need at least 30 candles to measure ATR.</p>'); return; } const t = ticketCtx(), slp = ((1.5 * r.atr) / (t.entry || r.last)) * 100; const el = $1('#tkSl'); if (el) { el.value = slp.toFixed(2); el.dispatchEvent(new Event('input', { bubbles: true })); } const p = ACC.pos[ST.sel]; if (p && typeof ChartTrade !== 'undefined') { ChartTrade.set('pos:' + ST.sel, 'sl', p.cost / p.qty - 1.5 * r.atr); ChartTrade.changed(); } out(`<p>Stop set to <b>1.5 ATR</b> (${esc(slp.toFixed(2))}% · ${esc(fp(1.5 * r.atr))})${p ? ' on the ticket and the open position' : ' on the ticket'}.</p>`); return; }
    if (k === 'validate') { const s = U.last.spec || (NT.PACK5 && NT.strategies[NT.PACK5[0]] && NT.strategies[NT.PACK5[0]].spec); if (s) await validate(s); return; }
    if (k === 'pine') { const s = U.last.spec; copy(s ? NT.Spec.toPine(s) : V164.pine($1('#v164PineSel').value), 'Pine Script v5'); return; }
    if (k === 'tcopy') { copy(V164.pine($1('#v164PineSel').value), 'Pine template'); return; }
    if (k === 'audit') { const t = ticketCtx(), r = V164.readChart(chartBars()); let corr = null, corrSym = ''; try { for (const s of Object.keys(ACC.pos)) if (s !== ST.sel) { const a = getStore(s, ST.tf).candles.slice(-61).map((x) => x.c), b2 = chartBars().slice(-61).map((x) => x.c), rr = V163.pearson(V163.returns(a), V163.returns(b2)); if (rr != null && (corr == null || rr > corr)) { corr = rr; corrSym = baseOf(s); } } } catch (x) { /* no open positions */ } const A = V164.audit(Object.assign(t, { atr: r && r.atr, corr, corrSym })); out(`<p><b>Pre-trade audit · ${esc(baseOf(ST.sel))}</b> ${A.ok ? '<span class="up">no blockers</span>' : '<span class="dn">blocked</span>'}</p><ul class="v164-ul">${A.rows.map((x) => `<li class="${esc(x.lvl)}"><b>${esc(x.k)}</b>: ${esc(x.why)}</li>`).join('')}</ul>${A.stop15 ? `<button type="button" class="btn sm" data-v164c="stop15">Set Stop to 1.5 ATR</button>` : ''}`); return; }
    if (k === 'leaks') { const L = typeof V160UI !== 'undefined' ? V160UI.ledger : [], F = typeof V163C !== 'undefined' ? V163C.fills : [], r = V164.leaks(L, F); out(r.clean ? `<p class="up">No leaks found in ${esc(L.length)} receipt rows.</p>` : `<p><b>Session leak report</b> (${esc(L.length)} receipts)</p><ul class="v164-ul">${r.findings.map((x) => `<li class="warn"><b>${esc(x.k)} × ${esc(x.n)}</b>: ${esc(x.why)}</li>`).join('')}</ul>`); return; }
    if (k === 'nl') { const r = V164.nlToSpec(($1('#v164Nl') || {}).value); if (!r.ok) { out(`<p class="dn">${esc(r.why)}</p>`); return; } const v = NT.Spec.validate(r.spec); if (!v.ok) { out(`<p class="dn">${esc(v.errors[0])}</p>`); return; } U.last.spec = v.spec; const pine = NT.Spec.toPine(v.spec); out(`<p><b>${esc(v.spec.name)}</b></p><p class="note">${esc(NT.Spec.describe(v.spec))}</p>${r.notes.map((n) => `<p class="note">• ${esc(n)}</p>`).join('')}<div class="v164-acts"><button type="button" class="btn sm pri" data-v164c="validate">Run 17-Test Validation</button><button type="button" class="btn sm" data-v164c="pine">Copy Pine Script v5</button><button type="button" class="btn sm" data-v164c="studio">Open in Strategy Studio</button></div><pre class="v161-pre mono v164-code">${esc(pine)}</pre>`); return; }
    if (k === 'studio') { U.studioSpec = U.last.spec; showTab('lab'); setTimeout(() => { const st = mountStudio(); if (st) { st.open = true; paintStudio(); st.scrollIntoView({ block: 'start' }); } }, 300); }
  };

  /* ══ 17. Strategy Studio Pro (Lab) ══ */
  const CHIPS = [
    ['RSI 14 < 30', { a: { k: 'rsi', n: 14 }, op: '<', b: { k: 'const', v: 30 } }], ['RSI 14 > 70', { a: { k: 'rsi', n: 14 }, op: '>', b: { k: 'const', v: 70 } }], ['Close > EMA 50', { a: { k: 'price' }, op: '>', b: { k: 'ema', n: 50 } }],
    ['Close ↗ EMA 20', { a: { k: 'price' }, op: 'crossAbove', b: { k: 'ema', n: 20 } }], ['Close ↘ EMA 20', { a: { k: 'price' }, op: 'crossBelow', b: { k: 'ema', n: 20 } }], ['Close > VWAP', { a: { k: 'price' }, op: '>', b: { k: 'vwap' } }],
    ['Close ↘ VWAP', { a: { k: 'price' }, op: 'crossBelow', b: { k: 'vwap' } }], ['Volume > avg 20', { a: { k: 'volume' }, op: '>', b: { k: 'volSma', n: 20 } }], ['MACD ↗ signal', { a: { k: 'macd' }, op: 'crossAbove', b: { k: 'macdSignal' } }],
    ['Close < BB lower', { a: { k: 'price' }, op: '<', b: { k: 'bbLower', n: 20 } }], ['Close > BB middle', { a: { k: 'price' }, op: '>', b: { k: 'bbMid', n: 20 } }], ['Breaks 20-bar high', { a: { k: 'price' }, op: '>', b: { k: 'highest', n: 20 } }],
    ['Below 10-bar low', { a: { k: 'price' }, op: '<', b: { k: 'lowest', n: 10 } }], ['ADX 14 > 25', { a: { k: 'adx', n: 14 }, op: '>', b: { k: 'const', v: 25 } }],
  ];
  const RT = [['depth', 'Depth & Slippage'], ['portfolio', 'Portfolio (≤ 10)'], ['stress', 'Stress Replay'], ['decay', 'Walk-Forward Decay'], ['bots', 'Bots: drift · regime · router']];
  let studio = null;
  const studioHTML = () => `<summary><b>Strategy Studio Pro</b> <span class="note">node builder · 17-test gate · depth slippage · portfolio · stress · walk-forward decay · bot export · replay</span></summary>
    <div class="v164-studio"><div class="v164-nb"><div class="v164-palette" id="v164Pal" aria-label="Condition palette">${CHIPS.map(([l], i) => `<button type="button" class="v164-chip" draggable="true" data-chip="${i}" title="Drag into Entry or Exit (or click to add to Entry)">${esc(l)}</button>`).join('')}</div>
      <div class="v164-zones">${['entry', 'exit'].map((z) => `<div class="v164-zone" data-zone="${z}" aria-label="${z} conditions"><div class="v164-zh"><b>${z === 'entry' ? 'Entry' : 'Exit'}</b><div class="seg sm">${['all', 'any'].map((j) => `<button type="button" data-join="${z}:${j}">${j.toUpperCase()}</button>`).join('')}</div></div><div class="v164-zl" id="v164Z_${z}"></div></div>`).join('')}
      <div class="v164-risk"><label><span>Stop %</span><input class="in mono" id="v164Sl" value="2" inputmode="decimal"></label><label><span>Target %</span><input class="in mono" id="v164Tp" value="4" inputmode="decimal"></label><label><span>Trail %</span><input class="in mono" id="v164Tr" value="" inputmode="decimal"></label></div></div></div>
      <div class="v164-src row"><label class="note" for="v164Strat">Research strategy</label><select class="in" id="v164Strat"></select>
        <button type="button" class="btn sm pri" data-v164x="validate">Run 17-Test Validation</button><button type="button" class="btn sm" data-v164x="bt">Backtest</button><button type="button" class="btn sm" data-v164x="replay">Replay trades on chart</button>
        <button type="button" class="btn sm" data-v164x="pine">Export Pine v5</button><button type="button" class="btn sm" data-v164x="py">Export Python bot</button><button type="button" class="btn sm" data-v164x="node">Export Node bot</button></div>
      <div class="seg v164-rt" role="tablist" aria-label="Research">${RT.map(([k, l]) => `<button type="button" role="tab" data-v164r="${k}">${esc(l)}</button>`).join('')}</div>
      <div id="v164Res" class="v164-out" role="status" aria-live="polite"></div></div>`;
  const mountStudio = () => {
    const t = $1('#tab-lab'); if (!t) return null; if (studio && studio.isConnected) return studio;
    studio = document.createElement('details'); studio.id = 'v164Studio'; studio.className = 'panel v164-stu'; studio.innerHTML = studioHTML(); const nav = $1('#labNav', t); if (nav) nav.after(studio); else t.insertBefore(studio, t.firstChild);
    studio.addEventListener('toggle', () => { if (studio.open) paintStudio(); });
    studio.addEventListener('click', onStudio); studio.addEventListener('change', (e) => { if (e.target.id === 'v164Strat') paintStudio(); else if (e.target.dataset.route) { U.cfg.routes[e.target.dataset.route] = +e.target.value; save(); } else if (e.target.dataset.regime) { U.cfg.regimeMap[e.target.dataset.regime] = e.target.value; save(); } else if (e.target.id === 'v164Auto') { U.cfg.autoSwitch = e.target.checked; save(); } });
    studio.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-chip]'); if (c && e.dataTransfer) { e.dataTransfer.setData('text/plain', 'chip:' + c.dataset.chip); e.dataTransfer.effectAllowed = 'copy'; } });
    studio.addEventListener('dragover', (e) => { if (e.target.closest('[data-zone]')) { e.preventDefault(); e.target.closest('[data-zone]').classList.add('over'); } });
    studio.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-zone]'); if (z) z.classList.remove('over'); });
    studio.addEventListener('drop', (e) => { const z = e.target.closest('[data-zone]'); if (!z) return; e.preventDefault(); z.classList.remove('over'); const d = e.dataTransfer && e.dataTransfer.getData('text/plain'); const m = /^chip:(\d+)$/.exec(d || ''); if (m) addNode(z.dataset.zone, +m[1]); });
    return studio;
  };
  const join = { entry: 'all', exit: 'any' };
  const addNode = (zone, i) => { if (!CHIPS[i]) return; U.nodes.push({ id: Math.random().toString(36).slice(2, 9), type: 'cond', parent: zone, label: CHIPS[i][0], ...CHIPS[i][1] }); U.studioSpec = null; paintNodes(); };
  const paintNodes = () => { for (const z of ['entry', 'exit']) { const el = $1('#v164Z_' + z); if (el) el.innerHTML = U.nodes.filter((n) => n.parent === z).map((n) => `<button type="button" class="v164-node" data-node="${n.id}" title="Remove">${esc(n.label)} ✕</button>`).join('') || '<span class="note">drop conditions here</span>'; } for (const b of document.querySelectorAll('#v164Studio [data-join]')) { const [z, j] = b.dataset.join.split(':'); b.classList.toggle('on', join[z] === j); } };
  const nodeSpec = () => { const sl = parseFloat(($1('#v164Sl') || {}).value) || 2, tp = parseFloat(($1('#v164Tp') || {}).value) || 0, tr = parseFloat(($1('#v164Tr') || {}).value) || 0, risk = { sl }; if (tp > 0) risk.tp = tp; if (tr > 0) risk.trail = tr; return V164.nodesToSpec('Node: ' + U.nodes.filter((n) => n.parent === 'entry').map((n) => n.label).join(' + ').slice(0, 48), [{ type: 'entry', join: join.entry }, { type: 'exit', join: join.exit }, { type: 'risk', risk }, ...U.nodes]); };
  const curStrat = () => {
    const sel = $1('#v164Strat'), v = sel ? sel.value : '';
    if (v === '__nodes') { if (!U.nodes.some((n) => n.parent === 'entry') || !U.nodes.some((n) => n.parent === 'exit')) return { err: 'Drag at least one Entry and one Exit condition into the node builder.' }; const s = nodeSpec(), ok = NT.Spec.validate(s); if (!ok.ok) return { err: ok.errors[0] }; return { spec: ok.spec, id: NT.Spec.register(ok.spec) }; }
    if (v === '__copilot' && U.studioSpec) return { spec: U.studioSpec, id: NT.Spec.register(U.studioSpec) };
    const st = NT.strategies[v]; return st ? { id: v, spec: st.spec || (NT.Spec.list().find((x) => NT.Spec.idOf(x) === v) || null), short: !!st.short } : { err: 'Pick a strategy' };
  };
  const res = (h) => { U.studioOut = h; const o = $1('#v164Res'); if (o) o.innerHTML = h; };
  const tfNow = () => (ST.tf && NT.TF[ST.tf] ? ST.tf : '1h');
  const btOn = (id, c, extra) => { const st = NT.strategies[id]; return NT.backtest(c, st, NT.defaultParams ? NT.defaultParams(id) : {}, Object.assign({ cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, short: !!st.short }, extra || {})); };
  const statRow = (l, s) => `<tr><td>${esc(l)}</td><td class="${s.ret >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(s.ret, 2))}</td><td>${esc(NT.fmtPct(-Math.abs(s.maxDD), 2))}</td><td>${esc((+s.sharpe || 0).toFixed(2))}</td><td>${esc(s.trades)}</td></tr>`;
  const onStudio = async (e) => {
    const nd = e.target.closest('[data-node]'); if (nd) { U.nodes = U.nodes.filter((n) => n.id !== nd.dataset.node); paintNodes(); return; }
    const ch = e.target.closest('[data-chip]'); if (ch && e.type === 'click') { addNode('entry', +ch.dataset.chip); const s = $1('#v164Strat'); if (s) s.value = '__nodes'; return; }
    const jn = e.target.closest('[data-join]'); if (jn) { const [z, j] = jn.dataset.join.split(':'); join[z] = j; paintNodes(); return; }
    const rt = e.target.closest('[data-v164r]'); if (rt) { U.cfg.rtab = rt.dataset.v164r; save(); paintStudio(); return; }
    const x = e.target.closest('[data-v164x]'); if (!x) return; const k = x.dataset.v164x, S = curStrat(); if (S.err) { res(`<p class="dn">${esc(S.err)}</p>`); return; }
    const tf = tfNow();
    if (k === 'validate') { const v = await validateIn(S); if (v) res(`<div class="v164-grade"><span class="grade big g-${esc(String(v.grade).toLowerCase())}">${esc(v.grade)}</span><div><b>${esc(NT.strategies[S.id].name)}</b><div class="note">${esc(v.verdict || '')} · ${(v.checks || []).filter((y) => y.status === 'pass').length}/${(v.checks || []).length} tests passed on ${esc(baseOf(ST.sel))} ${esc(tf)}.</div></div></div>`); return; }
    if (k === 'pine') { if (!S.spec) { res('<p class="note">This built-in strategy is code, not a spec: Pine export is for spec strategies (pack 4 / 5, builder, Copilot, node builder).</p>'); return; } copy(NT.Spec.toPine(S.spec), 'Pine Script v5'); return; }
    if (k === 'py' || k === 'node') { if (!S.spec) { res('<p class="note">Bot export needs a spec strategy.</p>'); return; } const b = V164.exportBot(S.spec, k === 'node' ? 'node' : 'py'); if (!b.ok) { res(`<p class="dn">${esc(b.why)}</p>`); return; } const u = URL.createObjectURL(new Blob([b.code], { type: 'text/plain' })), a = document.createElement('a'); a.href = u; a.download = b.file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); res(`<p>Standalone ${k === 'node' ? 'Node' : 'Python'} bot exported (<code>${esc(b.file)}</code>): it reads OHLCV bars from a JSON file, prints paper signals and carries a ${esc((S.spec.risk || {}).sl || 2)}% stop on every entry.</p><pre class="v161-pre mono v164-code">${esc(b.code)}</pre>`); return; }
    res('<p class="note shimmer">Loading history…</p>');
    let c; try { c = await History.get(ST.sel, NT.TF[tf], 3000); } catch (er) { res(`<p class="dn">${esc(er.message || er)}</p>`); return; } if (!c || c.length < 120) { res('<p class="dn">Need at least 120 candles of history.</p>'); return; }
    const r = btOn(S.id, c);
    if (k === 'bt' || k === 'replay') { U.lastBt = { sym: ST.sel, r }; if (k === 'replay') { U.markers = { sym: ST.sel, list: V164.markers(r.trades) }; showTab('markets'); if (chart) chart.invalidate(); toast(`Replaying ${esc(r.trades.length)} backtest trades on the chart`, 'acc'); } res(`<table class="v164-t sm"><thead><tr><th>Run</th><th>Return</th><th>Max DD</th><th>Sharpe</th><th>Trades</th></tr></thead><tbody>${statRow(baseOf(ST.sel) + ' ' + tf, r.stats)}</tbody></table>`); return; }
  };
  const validateIn = async (S) => { const tf = tfNow(); res(`<p class="note shimmer">Running the 17-test validation lab…</p>`); try { const c = await History.get(ST.sel, NT.TF[tf], 3000); if (!c || c.length < 300) throw new Error('Validation needs at least 300 candles of history.'); const r = await BTW.run({ type: 'validate', strat: S.id, params: NT.defaultParams ? NT.defaultParams(S.id) : {}, candles: c, o: { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: NT.TF[tf], short: !!S.short } }); return r.v || r; } catch (e) { res(`<p class="dn">${esc(e.message || e)}</p>`); return null; } };
  const research = async () => {
    const k = U.cfg.rtab, S = curStrat(), tf = tfNow(), o = $1('#v164Res'); if (!o) return;
    if (k === 'bots') { paintBots(); return; }
    if (S.err) { res(`<p class="note">${esc(S.err)}</p>`); return; }
    if (k === 'portfolio') {
      const syms = (U.basket && U.basket.symbols && U.basket.symbols.length ? U.basket.symbols : [ST.sel, ...(ST.watch || []).filter((s) => V164.modeOf(s) === V164.modeOf(ST.sel) && s !== ST.sel)]).slice(0, 10);
      res(`<p class="note shimmer">Backtesting ${esc(syms.length)} symbols…</p>`); const curves = [], rows = [];
      for (const s of syms) { try { const c = await History.get(s, NT.TF[tf], 1500); if (!c || c.length < 120) continue; const r = btOn(S.id, c); curves.push({ sym: baseOf(s), eq: r.eq }); rows.push(statRow(baseOf(s), r.stats)); } catch (e) { /* skip symbol */ } }
      const P = V164.portfolio(curves); if (!P) { res('<p class="dn">Not enough history across the basket.</p>'); return; }
      res(`<p><b>Equal-weight portfolio · ${esc(P.syms.length)} symbols · ${esc(tf)}</b>${U.basket ? ` <span class="note">basket from the DEX tab (${esc(U.basket.mode)})</span>` : ''}</p><table class="v164-t sm"><thead><tr><th>Symbol</th><th>Return</th><th>Max DD</th><th>Sharpe</th><th>Trades</th></tr></thead><tbody>${rows.join('')}<tr class="tot">${statRow('Portfolio', { ret: P.ret, maxDD: P.maxDD, sharpe: P.sharpe, trades: '' }).replace(/^<tr>|<\/tr>$/g, '')}</tr></tbody></table><p class="note">Average pairwise correlation r = ${esc(P.avgCorr.toFixed(2))}${P.avgCorr > 0.7 ? ': mostly one bet, diversification is thin' : ''}.</p><div class="v164-corr">${P.corr.map((row, i) => `<div>${row.map((v, j) => `<i title="${esc(P.syms[i])} × ${esc(P.syms[j])}: ${esc(v.toFixed(2))}" style="background:rgba(${v >= 0 ? '212,175,55' : '125,211,252'},${Math.abs(v).toFixed(2)})"></i>`).join('')}</div>`).join('')}</div>`); return;
    }
    res('<p class="note shimmer">Loading history…</p>'); let c; try { c = await History.get(ST.sel, NT.TF[tf], 3000); } catch (e) { res(`<p class="dn">${esc(e.message || e)}</p>`); return; } if (!c || c.length < 160) { res('<p class="dn">Need at least 160 candles.</p>'); return; }
    if (k === 'depth') { const r = btOn(S.id, c), book = (typeof V163UI !== 'undefined' && V163UI.books && V163UI.books[ST.sel]) || null, depth = book ? Math.max(1, V164.imbalance(book, 20) ? V164.imbalance(book, 20).bid + V164.imbalance(book, 20).ask : U.cfg.depth) : U.cfg.depth, adj = V164.slipAdjust(r.trades, depth, 25), adjRet = r.stats.ret - (adj.cost / 10000) * 100;
      res(`<p><b>Order-book depth & dynamic slippage</b> · depth used ${esc(usd(depth))}${book ? ' (live book)' : ' (default: no live book)'}</p><table class="v164-t sm"><thead><tr><th>Model</th><th>Return</th><th>Avg impact</th><th>Impact cost</th></tr></thead><tbody><tr><td>Fixed slippage</td><td class="${r.stats.ret >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(r.stats.ret, 2))}</td><td>–</td><td>–</td></tr><tr><td>+ square-root market impact</td><td class="${adjRet >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(adjRet, 2))}</td><td>${esc(adj.avgBps.toFixed(1))} bps</td><td>${esc(usd(adj.cost))}</td></tr></tbody></table><p class="note">Impact = 25 bps × √(order $ / depth $) per fill, on top of fees and fixed slippage.</p>`); return; }
    if (k === 'stress') { const base = btOn(S.id, c).stats, rows = [statRow('Base history', base)]; for (const [sk, sl] of Object.entries(V164.STRESS)) rows.push(statRow(sl, btOn(S.id, V164.stress(c, sk)).stats)); res(`<p><b>Event-window & macro stress replay</b> · ${esc(baseOf(ST.sel))} ${esc(tf)}</p><table class="v164-t sm"><thead><tr><th>Scenario</th><th>Return</th><th>Max DD</th><th>Sharpe</th><th>Trades</th></tr></thead><tbody>${rows.join('')}</tbody></table>`); return; }
    if (k === 'decay') { const D = V164.decay((cc) => btOn(S.id, cc).stats, c, 5); if (!D) { res('<p class="dn">Need more history for 5 walk-forward folds.</p>'); return; } res(`<p><b>Walk-forward rolling out-of-sample decay</b> · ${esc(D.oosPositive)}/5 out-of-sample windows profitable${D.avgDecay != null ? ` · average Sharpe decay ${esc((D.avgDecay * 100).toFixed(0))}%` : ''}</p><table class="v164-t sm"><thead><tr><th>Fold</th><th>In-sample</th><th>Out-of-sample</th><th>IS Sharpe</th><th>OOS Sharpe</th><th>Decay</th></tr></thead><tbody>${D.rows.map((r) => `<tr><td>${esc(r.fold)}</td><td class="${r.inRet >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(r.inRet, 1))}</td><td class="${r.outRet >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(r.outRet, 1))}</td><td>${esc((+r.inSharpe || 0).toFixed(2))}</td><td>${esc((+r.outSharpe || 0).toFixed(2))}</td><td>${r.decay == null ? '–' : esc((r.decay * 100).toFixed(0) + '%')}</td></tr>`).join('')}</tbody></table>`); }
  };
  const paintBots = () => {
    const paper = ((typeof ACC !== 'undefined' && ACC.trades) || []).slice(-300).map((t) => ({ sym: baseOf(t.sym).toUpperCase(), side: t.side, price: t.price, ts: +t.ts })), live = ((typeof V163C !== 'undefined' && V163C.fills) || []).map((f) => ({ sym: f.sym, side: f.side, price: f.price, ts: f.ts }));
    const d = V164.drift(paper, live), reg = V164.regime((chart && chart.data) || []), opts = (sel) => `<option value="">(no switch)</option>` + (NT.PACK5 || []).concat(NT.PACK4 || []).slice(0, 60).map((id) => `<option value="${esc(id)}"${sel === id ? ' selected' : ''}>${esc(NT.strategies[id].name)}</option>`).join('');
    const bots = (typeof ST !== 'undefined' && ST.bots) || [];
    res(`<h4>Live Bot Dry-Run Shadow Drift Monitor</h4>${d ? `<p class="${d.alert ? 'dn' : 'up'}">${esc(d.n)} matched fills · paper vs bot ${esc(d.bps.toFixed(1))} bps average (worst ${esc(d.worst.toFixed(1))} bps) · ${esc(Math.round(d.lagMs))} ms lag${d.alert ? ' · drift above 15 bps: check the bot\'s order type and venue' : ''}</p>` : '<p class="note">No bot fills to compare yet: they arrive through the v16.3 ACK + fill sync while armed.</p>'}
      <h4>Regime-Aware Bot Auto-Switcher</h4><p>Current regime on ${esc(baseOf(ST.sel))} ${esc(ST.tf)}: <b>${esc(reg)}</b></p><div class="v164-reg">${['trend', 'range', 'volatile'].map((r) => `<label><span>${esc(r)}</span><select class="in" data-regime="${r}">${opts(U.cfg.regimeMap[r])}</select></label>`).join('')}</div><label class="v160-chk"><input type="checkbox" id="v164Auto"${U.cfg.autoSwitch ? ' checked' : ''}> Auto-switch running bots (only while flat) every 30 s</label>
      <h4>Multi-Slot Strategy Router (Slots 1–6)</h4>${bots.length ? `<table class="v164-t sm"><thead><tr><th>Bot</th><th>Strategy</th><th>Live slot</th></tr></thead><tbody>${bots.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc((NT.strategies[b.strat] || {}).name || b.strat)}</td><td><select class="in" data-route="${esc(b.strat)}">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${V164.route(U.cfg.routes, b.strat, 6) === n ? ' selected' : ''}>Slot ${n}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table><p class="note">The promoted bot's signals go to its strategy's slot (default Slot 6, the shadow-to-live mirror). Manual orders keep Slots 1–5.</p>` : '<p class="note">No bots yet: create one under Bots &amp; Backtest.</p>'}`);
  };
  const paintStudio = () => {
    const s = mountStudio(); if (!s) return; const sel = $1('#v164Strat'), prev = sel.value;
    if (!sel.options.length || sel._n !== Object.keys(NT.strategies).length) { sel._n = Object.keys(NT.strategies).length; sel.innerHTML = `<option value="__nodes">Node builder (drag & drop)</option>${U.studioSpec ? '<option value="__copilot">Copilot strategy</option>' : ''}<optgroup label="Structural (v16.4)">${(NT.PACK5 || []).map((id) => `<option value="${esc(id)}">${esc(NT.strategies[id].name)}</option>`).join('')}</optgroup><optgroup label="Pro pack">${(NT.PACK4 || []).map((id) => `<option value="${esc(id)}">${esc(NT.strategies[id].name)}</option>`).join('')}</optgroup>`; sel.value = prev || (U.studioSpec ? '__copilot' : (NT.PACK5 || [])[0] || '__nodes'); }
    for (const b of s.querySelectorAll('[data-v164r]')) { const on = b.dataset.v164r === U.cfg.rtab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    paintNodes(); if (s.open) research();
  };
  const autoSwitch = () => {
    if (!U.cfg.autoSwitch || typeof ST === 'undefined') return;
    for (const b of ST.bots || []) { if (!b.run || (b.account && b.account.pos && b.account.pos[b.sym] && b.account.pos[b.sym].qty > 0)) continue; let c = []; try { c = getStore(b.sym, b.tf).candles; } catch (e) { c = []; } const want = V164.pickBot(V164.regime(c), U.cfg.regimeMap); if (want && NT.strategies[want] && b.strat !== want) { b.strat = want; b.params = NT.defaultParams ? NT.defaultParams(want) : {}; b.state = {}; U.stats.switches++; toast(`Regime switch: ${esc(b.name)} → ${esc(NT.strategies[want].name)}`, 'acc'); try { if (typeof V160UI !== 'undefined') V160UI.led('regime', { status: 'switched', detail: `${b.name}: ${want}` }); saveState(); } catch (x) { /* ledger optional */ } } }
  };

  const attach = () => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(overlay)) chart.overlays.push(overlay); if (chart.cv && !chart.cv._v164) { chart.cv._v164 = true; chart.cv.addEventListener('pointerdown', onPick, true); } };
  const wire = () => {
    if (typeof Feed !== 'undefined' && !Feed._v164) { Feed._v164 = true; Feed.tradeL.push(onTrade); }
    if (typeof V160UI !== 'undefined' && V160UI.st && !V160UI.slotFor) V160UI.slotFor = (bot) => V164.route(U.cfg.routes, bot && bot.strat, 6);
    ocWire();
  };
  let n = 0;
  const tick = () => {
    try {
      wire(); attach(); toolbar(); fit(); failover(); n++;
      if (typeof curTab !== 'undefined') { if (curTab === 'heat' && n % 2 === 0) paintDex(false); if (curTab === 'ai') mountCop(); if (curTab === 'lab') { const s = mountStudio(); if (s && !s._p) { s._p = true; paintStudio(); } } }
      if (n % 60 === 0) autoSwitch();
      if (U.cfg.tapeStrip && chart && curTab === 'markets' && n % 2 === 0) chart.invalidate();
    } catch (e) { console.warn('v164', e); }
  };
  U.start = () => {
    load(); if (typeof NT !== 'undefined' && !NT.PACK5) V164.register(NT);
    tick(); setInterval(tick, 500); setInterval(swapPoll, 500);
    document.addEventListener('keydown', onSlash, true); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $1('#v164AvMenu'); if (m) m.remove(); } });
    document.addEventListener('click', (e) => { const m = $1('#v164AvMenu'); if (m && !e.target.closest('#v164AvMenu, #v164AvBtn')) m.remove(); });
  };
  Object.assign(U, { buildRows, filtered, paintDex, mountDex, exportBasket, openChart, setAnchor, overlay, failover, exStart, exStop, swapPoll, mountCop, onCop, validate, mountStudio, paintStudio, research, curStrat, autoSwitch, addNode, nodeSpec, tick, onTrade });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b164 = boot; boot = async function () { await _b164.apply(this, arguments); try { V164UI.start(); } catch (e) { console.warn('v164 init', e); } }; }
