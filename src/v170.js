/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.0 UI wiring (maths in V170, v170core.js). Zero-clutter: everything lives on one-line strips or a pill.
   · ST.epoch            bumped on every symbol / market / timeframe switch; V170UI.guard(p) drops late answers
   · L1/L2 candle cache  last 50 symbol·TF rings in RAM (LRU) + IndexedDB, painted before the network answers
   · venue strip         one line inside the Live Tape: All · CB · KRK · BIN · BYB · OKX · DEX (1-click filter), basis %,
                         aggregated funding, cross-venue spread (bps), CVD, provenance pill + 6 px heartbeat dot
   · venue streams       keyless public trades from all five exchanges for the crypto symbol on screen, merged + deduped
                         (Lee-Ready where the venue doesn't report the aggressor); 500 ms → 1 s → 2 s reconnect
   · formula scanner     one input row in Discovery; compound rules + audio/visual breakout chime
   · clipboard sniper    copied contract address / ticker → "Load … on Chart" pill (reads only when already permitted)
   · worker jobs         V170UI.job(): typed-array jobs with zero-copy Transferables, main-thread fallback
   Strict CSP: listeners attached here, text through textContent / esc(). */
const V170UI = (() => {
  const U = { epoch: new V170.Epoch(), key: '', l1: new V170.LRU(50), db: null, dbFail: false, hits: { l1: 0, l2: 0, miss: 0 },
    venue: 'all', merger: new V170.Merger(4096), socks: {}, sym: '', perp: { at: 0, rows: [], mark: 0, sym: '' }, fx: { src: '', f: null, err: '', prev: null, chime: true, at: 0 }, clip: { last: '', shown: '' }, mounted: false };
  const $1 = (s, r) => (r || document).querySelector(s);
  const CFG = 'exterm.v170.cfg';
  try { const o = JSON.parse(localStorage.getItem(CFG) || 'null'); if (o && typeof o === 'object') { if (o.venue === 'all' || V170.VENUES.includes(o.venue)) U.venue = o.venue; if (typeof o.fx === 'string') U.fx.src = o.fx.slice(0, 300); if (o.chime === false) U.fx.chime = false; } } catch (e) { /* defaults */ }
  const save = () => { try { localStorage.setItem(CFG, JSON.stringify({ venue: U.venue, fx: U.fx.src, chime: U.fx.chime })); } catch (e) { /* session only */ } };
  const codeOf = (name) => { const s = String(name || ''); return /coinbase/i.test(s) ? 'CB' : /kraken/i.test(s) ? 'KRK' : /binance/i.test(s) ? 'BIN' : /bybit/i.test(s) ? 'BYB' : /okx/i.test(s) ? 'OKX' : /dex|pool|swap|raydium|uniswap|orca|meteora|pump|aerodrome/i.test(s) ? 'DEX' : ''; };

  /* ══ 1. monotonic request epoch ══ */
  const curKey = () => (typeof ST !== 'undefined' ? ST.mode + '|' + ST.sel + '|' + ST.tf : '');
  const bumpIfChanged = () => { const k = curKey(); if (k !== U.key) { U.key = k; const e = U.epoch.bump(); if (typeof ST !== 'undefined') ST.epoch = e; onSwitch(); } };
  const guard = (p) => U.epoch.guard(p);
  const wireEpoch = () => {
    if (typeof ST === 'undefined' || U.epochWired) return; U.epochWired = true; ST.epoch = U.epoch.get();
    // reassign the shared bindings (works in the plain bundle and inside the hardened build's IIFE alike)
    const wrap = (g) => function () { const r = g.apply(this, arguments); try { bumpIfChanged(); } catch (e) { /* never block a switch */ } return r; };
    if (typeof selectSym === 'function') selectSym = wrap(selectSym); // eslint-disable-line no-func-assign
    if (typeof setMode === 'function') setMode = wrap(setMode); // eslint-disable-line no-func-assign
    if (typeof chartRefresh === 'function') chartRefresh = wrap(chartRefresh); // eslint-disable-line no-func-assign
    U.key = curKey();
  };

  /* ══ 2. L1 (RAM) / L2 (IndexedDB) stale-while-revalidate candle cache ══ */
  const idb = () => new Promise((res) => {
    if (U.db || U.dbFail) return res(U.db);
    try { const rq = indexedDB.open('exterm-v170', 1); rq.onupgradeneeded = () => { try { rq.result.createObjectStore('ohlcv'); } catch (e) { /* exists */ } }; rq.onsuccess = () => { U.db = rq.result; res(U.db); }; rq.onerror = () => { U.dbFail = true; res(null); }; }
    catch (e) { U.dbFail = true; res(null); }
  });
  const l2get = async (k) => { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const r = db.transaction('ohlcv', 'readonly').objectStore('ohlcv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } }); };
  const l2put = async (k, v) => {
    const db = await idb(); if (!db) return;
    try { const tx = db.transaction('ohlcv', 'readwrite'), os = tx.objectStore('ohlcv'); os.put(v, k); const all = os.getAllKeys ? os.getAllKeys() : null; if (all) all.onsuccess = () => { const keys = all.result || []; if (keys.length > 50) { const r2 = db.transaction('ohlcv', 'readwrite').objectStore('ohlcv'); const metas = []; let left = keys.length; for (const kk of keys) { const g = r2.get(kk); g.onsuccess = () => { metas.push([kk, (g.result && g.result.at) || 0]); if (--left === 0) metas.sort((a, b) => a[1] - b[1]).slice(0, metas.length - 50).forEach((m) => { try { db.transaction('ohlcv', 'readwrite').objectStore('ohlcv').delete(m[0]); } catch (e) { /* best effort */ } }); }; } } }; }
    catch (e) { /* quota / private mode */ }
  };
  const remember = (st) => {
    if (!st || !st.candles || st.candles.length < 2) return; const k = st.sym + '|' + st.tf, f = V170.pack(st.candles.slice(-1500)), v = { at: Date.now(), sec: st.sec, f };
    U.l1.set(k, v); l2put(k, { at: v.at, sec: v.sec, f: f.slice() });
  };
  const hydrate = (st) => {
    if (!st || st.candles.length) return false; const k = st.sym + '|' + st.tf, v = U.l1.get(k);
    if (v) { st.candles = V170.unpack(v.f); st.version++; st.v170 = 'L1'; U.hits.l1++; return true; }
    U.hits.miss++;
    l2get(k).then((x) => { if (x && x.f && !st.candles.length) { st.candles = V170.unpack(x.f); st.version++; st.v170 = 'L2'; U.hits.l2++; U.l1.set(k, x); if (typeof chartRefresh === 'function' && typeof ST !== 'undefined' && ST.sel === st.sym && ST.tf === st.tf) chartRefresh(true); } });
    return false;
  };
  const wireCache = () => {
    if (typeof CandleStore === 'undefined' || CandleStore.prototype._v170) return; const P = CandleStore.prototype; P._v170 = true;
    const load = P.load;
    P.load = function () { try { hydrate(this); } catch (e) { /* cache is optional */ } const r = load.apply(this, arguments); Promise.resolve(r).then(() => { try { if (this.loaded) remember(this); } catch (e) { /* cache is optional */ } }); return r; };
  };

  /* ══ 3. worker jobs with zero-copy transfer ══ */
  const local = (m) => {
    if (m.type === 'v170scan') return { idx: V170.scanColumns(m.formula, m.cols, m.data, m.n) };
    if (m.type === 'v170sort') return { idx: V170.sortIndex(m.data, m.k, m.col, m.n, !!m.desc) };
    if (m.type === 'v170csv') return V170.parseCSV(m.text);
    if (m.type === 'v170depth') return { depth: V170.depthBuckets(m.books, m.bucket) };
    throw new Error('job needs the worker');
  };
  const job = (msg, transfer) => {
    const w = typeof BTW !== 'undefined' ? BTW.get() : null;
    if (!w) { try { return Promise.resolve(local(msg)); } catch (e) { return Promise.reject(e); } }
    return new Promise((res, rej) => { const id = ++BTW.id; BTW.cb[id] = { res, rej }; w.postMessage(Object.assign({ id }, msg), transfer || []); });
  };
  /* rows of objects → columnar Float64Array, ready to transfer */
  const columns = (rows, cols) => { const n = rows.length, k = cols.length, d = new Float64Array(n * k); for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) { const v = rows[i][cols[j]]; d[i * k + j] = v == null || v === '' ? NaN : +v; } return d; };

  /* ══ 4. venue streams (crypto symbol on screen) ══ */
  const ADAPT = {
    CB: { ex: 'coinbase' }, KRK: { ex: 'kraken' }, BIN: { ex: 'binance' }, BYB: { ex: 'bybit', v2: true }, OKX: { ex: 'okx', v2: true },
  };
  const want = () => typeof ST !== 'undefined' && typeof V166UI !== 'undefined' && V166UI.open && typeof curTab !== 'undefined' && curTab === 'markets' && /-(USD|USDT|USDC)$/.test(ST.sel || '') && !document.hidden;
  const primary = () => { const f = typeof V164UI !== 'undefined' && V164UI.ex && V164UI.ex.ws && V164UI.ex.sym === ST.sel ? V164UI.ex.name : ''; const a = typeof Providers !== 'undefined' && Providers.active; return codeOf(f || (a && (a.name || a.id))); };
  const open = (code, sym) => {
    const A = ADAPT[code], s = U.socks[code] || (U.socks[code] = { tries: 0, ws: null, timer: 0, ping: 0, state: 'idle', fails: 0, parkedUntil: 0 });
    if (s.parkedUntil > Date.now()) { s.state = 'parked'; return; } // e.g. HTTP 451 geo-block: don't hammer a venue that never answers
    let url, sub, parse;
    if (A.v2) { const X = V170.EX2[A.ex], x = X.sym(sym); if (!x) return; url = X.url; sub = X.sub(x); parse = X.parse; }
    else { if (typeof V164 === 'undefined') return; sub = V164.exSub(A.ex, sym); if (!sub) return; url = V164.EX_URL[A.ex]; parse = (raw) => V164.exParse(A.ex, raw).map((t) => ({ price: t.price, size: t.size, side: t.side, ts: t.ts * 1000 })); }
    let ws; try { ws = new WebSocket(url); } catch (e) { return retry(code); }
    s.ws = ws; s.state = 'connecting'; s.got = false; const ep = U.epoch.get();
    ws.onopen = () => { s.tries = 0; s.state = 'live'; try { ws.send(sub); } catch (e) { /* closed */ } if (A.v2) s.ping = setInterval(() => { try { ws.send(A.ex === 'okx' ? 'ping' : JSON.stringify({ op: 'ping' })); } catch (e) { /* closed */ } }, 15000); };
    ws.onmessage = (ev) => {
      if (ep !== U.epoch.get() || typeof ev.data !== 'string') return;
      s.got = true; s.fails = 0; if (ev.data === 'pong') return;
      const prim = primary(), now = Date.now();
      for (const t of parse(ev.data)) {
        const q = U.merger.push(code, t.ts, t.price, t.size, t.side, t.id, now); if (q < 0) continue;
        if (code !== prim && typeof V166UI !== 'undefined') { const r = U.merger.row(q); try { V166UI.ingest(sym, r.price, r.size, r.mask & 2 ? 'sell' : 'buy', r.ts, { who: V170.VENUE_NAME[code] }); } catch (e) { /* tape optional */ } }
      }
    };
    ws.onclose = () => {
      clearInterval(s.ping); if (s.ws !== ws) return; s.ws = null; s.state = 'down';
      if (!s.got && ++s.fails >= 2) { s.parkedUntil = Date.now() + 600000; s.state = 'parked'; return; } // two dead handshakes: park 10 min
      if (ep === U.epoch.get() && want()) retry(code);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* closing */ } };
  };
  const retry = (code) => { const s = U.socks[code]; if (!s) return; clearTimeout(s.timer); const d = s.tries > 5 ? 30000 : V170.backoff(s.tries); s.tries++; s.state = 'reconnecting'; s.timer = setTimeout(() => { if (want() && !s.ws) open(code, ST.sel); }, d); };
  // parkedUntil survives symbol switches on purpose: a geo-blocked venue stays blocked whatever the symbol
  const closeAll = () => { for (const s of Object.values(U.socks)) { clearTimeout(s.timer); clearInterval(s.ping); const w = s.ws; s.ws = null; s.state = s.parkedUntil > Date.now() ? 'parked' : 'idle'; s.tries = 0; if (w) { try { w.close(); } catch (e) { /* closing */ } } } };
  const syncStreams = () => {
    if (!want()) { if (U.sym) { closeAll(); U.sym = ''; } return; }
    if (U.sym !== ST.sel) { closeAll(); U.sym = ST.sel; U.merger = new V170.Merger(4096); for (const c of Object.keys(ADAPT)) open(c, ST.sel); }
  };
  const onSwitch = () => { syncStreams(); U.perp.at = 0; };

  /* perp side: mark prices + funding from three venues' public REST (30 s, crypto + tape open only) */
  const getJ = async (url) => { const c = new AbortController(), t = setTimeout(() => c.abort(), 8000); try { const r = await fetch(url, { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
  const pollPerp = async () => {
    if (!want() || Date.now() - U.perp.at < 30000) return; U.perp.at = Date.now();
    const m = /^([A-Z0-9]{2,10})-/.exec(ST.sel); if (!m) return; const b = m[1], sym = ST.sel;
    const jobs = [
      getJ('https://api.bybit.com/v5/market/tickers?category=linear&symbol=' + b + 'USDT').then((j) => { const x = j && j.result && j.result.list && j.result.list[0]; return x ? { v: 'BYB', rate: +x.fundingRate, oi: +x.openInterestValue, mark: +x.markPrice } : null; }),
      getJ('https://www.okx.com/api/v5/public/funding-rate?instId=' + b + '-USDT-SWAP').then((j) => { const x = j && j.data && j.data[0]; return x ? { v: 'OKX', rate: +x.fundingRate } : null; }),
      getJ('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + b + 'USDT').then((j) => (j && j.markPrice ? { v: 'BIN', rate: +j.lastFundingRate, mark: +j.markPrice } : null)),
    ];
    const out = (await Promise.allSettled(jobs.map((p) => guard(p)))).map((r) => (r.status === 'fulfilled' && r.value !== V170.STALE ? r.value : null)).filter(Boolean);
    if (sym !== ST.sel) return; const marks = out.map((x) => x.mark).filter((x) => x > 0);
    U.perp.rows = out; U.perp.mark = marks.length ? marks.reduce((s, x) => s + x, 0) / marks.length : 0; U.perp.sym = sym;
  };

  /* ══ 5. venue strip (inside the Live Tape, one line) ══ */
  const stripHTML = () => `<div class="v170-vs" id="v170Vs" role="group" aria-label="Venue filter and cross-venue telemetry">
      <span class="v170-prov" id="v170Prov" title="Stream provenance"><i class="v170-dot" id="v170Dot" aria-hidden="true"></i><b id="v170ProvT">–</b></span>
      <div class="v170-vchips">${['all'].concat(V170.VENUES).map((c) => `<button type="button" class="v170-vc" data-v170v="${c}" aria-pressed="false">${c === 'all' ? 'All Aggregated' : c}</button>`).join('')}</div>
      <span class="sp"></span>
      <span class="v170-k">Basis <b id="v170Basis">–</b></span><span class="v170-k">Funding <b id="v170Fund">–</b></span><span class="v170-k">Spread <b id="v170Spr">–</b></span><span class="v170-k">CVD <b id="v170Cvd">–</b></span></div>`;
  const mountStrip = () => {
    const tape = $1('#v166Tape'); if (!tape || $1('#v170Vs')) return; const s = $1('.v166-strip', tape); if (!s) return;
    s.insertAdjacentHTML('afterend', stripHTML());
    $1('#v170Vs').addEventListener('click', (e) => { const b = e.target.closest('[data-v170v]'); if (!b) return; U.venue = b.dataset.v170v; save(); paintChips(); if (typeof V166UI !== 'undefined') { V166UI.dirty = true; try { V166UI.refilter(true); } catch (x) { /* tape not ready */ } } });
    paintChips();
  };
  const paintChips = () => { for (const b of document.querySelectorAll('[data-v170v]')) { const on = b.dataset.v170v === U.venue; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
  const setT = (id, t, cls) => { const e = $1('#' + id); if (!e) return; if (e.textContent !== t) e.textContent = t; if (cls !== undefined) e.className = cls; };
  const fmtUsd = (v) => (typeof NT !== 'undefined' ? (v < 0 ? '-$' : '+$') + NT.fmtCompact(Math.abs(v)) : (v < 0 ? '-' : '+') + Math.round(Math.abs(v)));
  const paintStrip = () => {
    const vs = $1('#v170Vs'); if (!vs) return; const crypto = typeof ST !== 'undefined' && /-(USD|USDT|USDC)$/.test(ST.sel || ''); if (vs.hidden === crypto) vs.hidden = !crypto; if (!crypto) return;
    const M = U.merger, now = Date.now(), live = M.live(now), lag = M.lagMs(now), last = Math.max(0, ...V170.VENUES.map((_, i) => M.v[i].at));
    setT('v170ProvT', V170.provenance(live, lag)); setT('v170Dot', '', 'v170-dot ' + V170.heartbeat(last ? now - last : NaN));
    const reconnecting = !live.length && Object.values(U.socks).some((s) => s.state === 'reconnecting' || s.state === 'connecting'); const pv = $1('#v170Prov'); if (pv) pv.classList.toggle('rc', reconnecting);
    const px = M.lastPrices(now), spot = Object.values(px).filter((x) => x > 0), spotAvg = spot.length ? spot.reduce((s, x) => s + x, 0) / spot.length : 0;
    const bs = U.perp.sym === ST.sel ? V170.basisPct(spotAvg, U.perp.mark) : null; setT('v170Basis', bs == null ? '–' : (bs >= 0 ? '+' : '') + bs.toFixed(3) + '%', bs == null ? '' : bs >= 0 ? 'up' : 'dn');
    const fr = U.perp.sym === ST.sel ? V170.aggFunding(U.perp.rows) : null; setT('v170Fund', fr == null ? '–' : (fr * 100).toFixed(4) + '%', fr == null ? '' : fr >= 0 ? 'up' : 'dn');
    const sp = V170.spreadBps(px); setT('v170Spr', sp == null ? '–' : sp.toFixed(1) + ' bps');
    const mask = U.venue === 'all' ? V170.ALL : V170.vbit(U.venue), cv = M.cvd(mask); setT('v170Cvd', M.n ? fmtUsd(cv) : '–', M.n ? (cv >= 0 ? 'up' : 'dn') : '');
  };
  /* 1-click venue filter for the tape: post-filters V166.filter by the print's venue name */
  const wireTapeFilter = () => {
    if (typeof V166 === 'undefined' || V166.filter._v170) return; const orig = V166.filter;
    const f = function (r, wantBits, minUsd, out, tracked) {
      const k = orig.apply(this, arguments); if (U.venue === 'all' || typeof V166UI === 'undefined' || typeof ST === 'undefined') return k;
      let j = 0; for (let i = 0; i < k; i++) { const nm = V166UI.E.name(ST.sel, V166.venue(r, out[i])), c = codeOf(nm) || (V166.marketOf(ST.sel) === 'onchain' ? 'DEX' : ''); if (c === U.venue) out[j++] = out[i]; }
      return j;
    };
    f._v170 = true; V166.filter = f;
  };

  /* ══ 6. screener formula scanner + breakout chime (Discovery) ══ */
  const fxHTML = () => `<div class="v170-fx" id="v170Fx"><label class="v170-fxl" for="v170FxIn">ƒ Formula</label><input class="in" id="v170FxIn" autocomplete="off" spellcheck="false" placeholder="RVOL > 3x AND Price > VWAP AND 5m Delta > +$50K" aria-describedby="v170FxMsg">
      <button type="button" class="btn xs pri" data-v170fx="apply">Scan</button><button type="button" class="btn xs ghost" data-v170fx="clear">Clear</button><button type="button" class="btn xs" data-v170fx="chime" aria-pressed="true" id="v170Chime">🔔 Chime</button><span class="note" id="v170FxMsg" role="status"></span></div>`;
  const mountFx = () => {
    const d = $1('#v164Dex'); if (!d || $1('#v170Fx')) return; const h = $1('.v164-dh', d); if (!h) return;
    h.insertAdjacentHTML('afterend', fxHTML()); const inp = $1('#v170FxIn'); inp.value = U.fx.src; setFx(U.fx.src, true);
    $1('#v170Fx').addEventListener('click', (e) => { const b = e.target.closest('[data-v170fx]'); if (!b) return; const k = b.dataset.v170fx; if (k === 'apply') setFx(inp.value); else if (k === 'clear') { inp.value = ''; setFx(''); } else { U.fx.chime = !U.fx.chime; save(); paintFx(); } });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setFx(inp.value); } });
    paintFx();
  };
  const setFx = (src, quiet) => {
    src = String(src || '').trim().slice(0, 300); U.fx.src = src; U.fx.prev = null; save();
    if (!src) { U.fx.f = null; U.fx.err = ''; } else { const r = V170.tryCompile(src); U.fx.f = r.ok ? r.f : null; U.fx.err = r.ok ? '' : r.error; }
    paintFx(); if (!quiet && typeof V164UI !== 'undefined' && V164UI.paintDex) { try { V164UI.paintDex(true); } catch (e) { /* discovery not open */ } }
  };
  const paintFx = () => { const m = $1('#v170FxMsg'), c = $1('#v170Chime'); if (c) { c.setAttribute('aria-pressed', String(U.fx.chime)); c.textContent = U.fx.chime ? '🔔 Chime' : '🔕 Muted'; } if (m) { m.textContent = U.fx.err ? '⚠ ' + U.fx.err : U.fx.f ? (U.fx.n != null ? U.fx.n + ' match' + (U.fx.n === 1 ? '' : 'es') : 'active') : ''; m.classList.toggle('dn', !!U.fx.err); } };
  const enrich = (r) => { const b = +r.b5 || 0, s = +r.s5 || 0; if (r.delta5m == null && r.v5 > 0 && b + s > 0) r.delta5m = r.v5 * (b - s) / (b + s); if (r.ageMin == null && r.created) { const t = typeof r.created === 'number' ? (r.created > 1e12 ? r.created : r.created * 1000) : Date.parse(r.created); if (Number.isFinite(t)) r.ageMin = (Date.now() - t) / 60000; } return r; };
  let actx = null;
  const chime = () => {
    if (!U.fx.chime || Date.now() - U.fx.at < 3000) return; U.fx.at = Date.now();
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime; for (const [f, d] of [[880, 0], [1320, 0.12]]) { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22); o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.25); } } catch (e) { /* audio blocked until a click */ }
  };
  const wireFx = () => {
    if (typeof V164 === 'undefined' || !V164.applyFilter || V164.applyFilter._v170) return; const orig = V164.applyFilter;
    const f = function (rows) {
      const out = orig.apply(this, arguments); if (!U.fx.f) { U.fx.n = null; return out; }
      const hit = out.filter((r) => U.fx.f.fn(enrich(r))); const ids = hit.map((r) => r.id); U.fx.n = hit.length;
      if (U.fx.prev) { const fresh = V170.breakouts(U.fx.prev, ids); if (fresh.length) { chime(); const d = $1('#v164Dex'); if (d) { d.classList.remove('v170-flash'); void d.offsetWidth; d.classList.add('v170-flash'); } if (typeof toast === 'function') toast('Breakout: ' + fresh.slice(0, 3).map((id) => esc(typeof baseOf === 'function' ? baseOf(id) : id)).join(', ') + ' now match your formula', 'acc'); } }
      U.fx.prev = new Set(ids); paintFx(); return hit;
    };
    f._v170 = true; V164.applyFilter = f;
  };

  /* ══ 7. clipboard contract / ticker sniper ══ */
  const pill = () => { let p = $1('#v170Clip'); if (p) return p; p = document.createElement('div'); p.id = 'v170Clip'; p.className = 'v170-clip'; p.hidden = true; p.setAttribute('role', 'status'); p.innerHTML = '<button type="button" class="v170-clipgo" data-v170c="go"></button><button type="button" class="v170-clipx" data-v170c="x" aria-label="Dismiss">✕</button>'; document.body.appendChild(p);
    p.addEventListener('click', (e) => { const b = e.target.closest('[data-v170c]'); if (!b) return; if (b.dataset.v170c === 'go') loadClip(U.clip.hit); p.hidden = true; }); return p; };
  const short = (s) => (s.length > 14 ? s.slice(0, 6) + '…' + s.slice(-4) : s);
  const offer = (text) => {
    const t = String(text || '').trim(); if (!t || t === U.clip.shown) return; const hit = V170.detectClip(t); if (!hit) return;
    if (hit.kind === 'ticker' && typeof ST !== 'undefined' && (ST.sel === hit.value || ST.sel === hit.value + '-USD')) return;
    U.clip.shown = t; U.clip.hit = hit; const p = pill(); $1('.v170-clipgo', p).textContent = 'Load ' + (hit.kind === 'ca' ? short(hit.value) + ' (' + (hit.chain === 'evm' ? 'Base/ETH' : 'Solana') + ')' : hit.value) + ' on Chart — 1-Click'; p.hidden = false;
    clearTimeout(U.clip.t); U.clip.t = setTimeout(() => { p.hidden = true; }, 12000);
  };
  const loadClip = async (hit) => {
    if (!hit) return;
    if (hit.kind === 'ticker') { const v = hit.value, stock = typeof STOCKS !== 'undefined' && STOCKS.some((s) => s[0] === v); const sym = /-USD$/.test(v) ? v : stock ? v : v + '-USD'; if (typeof openSym === 'function') openSym(sym); return; }
    if (typeof OC === 'undefined' || !OC.search) return; if (typeof toast === 'function') toast('Looking up ' + esc(short(hit.value)) + '…');
    try { const r = await guard(OC.search(hit.value)); if (r === V170.STALE) return; const s = (r || [])[0]; const id = typeof s === 'string' ? s : s && (s.id || s.sym); if (id && typeof openSym === 'function') openSym(id); else if (typeof toast === 'function') toast('No DEX pool found for that address', 'dn'); } catch (e) { if (typeof toast === 'function') toast('Lookup failed: ' + esc(e.message || String(e)), 'dn'); }
  };
  const wireClip = () => {
    if (U.clipWired) return; U.clipWired = true;
    document.addEventListener('paste', (e) => { const t = e.target; if (t && (t.closest && t.closest('input,textarea,[contenteditable="true"]'))) return; try { offer((e.clipboardData || {}).getData ? e.clipboardData.getData('text') : ''); } catch (x) { /* no data */ } });
    window.addEventListener('focus', async () => { // read only when the browser already granted clipboard-read: never a surprise permission prompt
      try { if (!navigator.permissions || !navigator.clipboard || !navigator.clipboard.readText) return; const st = await navigator.permissions.query({ name: 'clipboard-read' }); if (st.state !== 'granted') return; offer(await navigator.clipboard.readText()); } catch (e) { /* unsupported */ }
    });
  };

  /* ══ boot ══ */
  let n = 0;
  const tick = () => { try { wireEpoch(); wireCache(); wireTapeFilter(); wireFx(); mountStrip(); mountFx(); bumpIfChanged(); syncStreams(); if (n++ % 2 === 0) pollPerp(); paintStrip(); } catch (e) { console.warn('v170', e); } };
  U.start = () => { wireClip(); tick(); setInterval(tick, 500); document.addEventListener('visibilitychange', () => { if (document.hidden) closeAll(), (U.sym = ''); else tick(); }); };
  Object.assign(U, { guard, job, columns, hydrate, remember, offer, loadClip, setFx, codeOf, syncStreams, paintStrip });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b170 = boot; boot = async function () { await _b170.apply(this, arguments); try { V170UI.start(); } catch (e) { console.warn('v170 init', e); } }; }
