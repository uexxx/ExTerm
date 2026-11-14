/* ExTerm v15 phase 5 UI: the 🏛 Pro Desk tab (DOM ladder click-to-trade + CVD + footprint, Yahoo options chain with
   max pain / GEX / paper options, synthetic ratio charts + synced grid + BroadcastChannel pop-out windows, correlation
   guard + isolated paper sub-wallets + regime, whale tape + wallet profiler + PNG flex cards, MTF matrix + chart
   overlays (auto-fibs, PDH/PDL, VPVR/POC, FOMC / Form 4 markers, extended-hours shading), walk-forward + Monte Carlo +
   Pine v5 importer, arbitrage scanner + funding/OI + liquidation heat map, offline replay packs + encrypted .exterm
   backups) and Ctrl+K palette commands. Pure logic is in v15p5core.js (P5).
   Security: external strings → esc(); no inline handlers (strict CSP); no eval; BroadcastChannel input is validated by
   P5.bcMsg; backups are AES-GCM with a PBKDF2 key and restore only ExTerm's own storage keys. */
const P5UI = (() => {
  const U = { sec: 'dom', book: null, bookTs: 0, chain: null, chainErr: '', arb: {}, arbTs: 0, deriv: {}, mtf: null, mtfKey: '', packs: [], blocks: [], wid: Math.random().toString(36).slice(2, 10), lastRender: 0 };
  const SECS = [['dom', '📊 DOM & Footprint'], ['opt', '🧾 Options'], ['ratio', '➗ Ratio & Grid'], ['risk', '🛡 Risk & Wallets'], ['tape', '🐋 Tape & Profiler'], ['intel', '🧭 Chart Intel'], ['quant', '🧪 Quant Lab'], ['deriv', '⚖ Derivs & Arb'], ['replay', '💾 Replay & Backup']];
  const cfg = () => {
    const c = ST.p5 && typeof ST.p5 === 'object' ? ST.p5 : (ST.p5 = {});
    if (!SECS.some(([k]) => k === c.sec)) c.sec = 'dom';
    c.ov = Object.assign({ fib: false, pd: false, vp: false, ev: false, ext: true, mtf: false }, c.ov || {});
    c.guard = Object.assign({ on: false, max: 0.85 }, c.guard || {}); /* opt-in: never silently block existing habits */ c.guard.max = Math.min(0.99, Math.max(0.5, +c.guard.max || 0.85));
    if (!Array.isArray(c.opts)) c.opts = []; c.opts = c.opts.filter((p) => p && p.qty > 0 && p.strike > 0); for (const p of c.opts) if (!p.id) p.id = NT.uid();
    c.optQty = Math.min(100, Math.max(1, Math.floor(+c.optQty) || 1)); if (!(c.optCash >= 0)) c.optCash = 10000;
    if (!Array.isArray(c.subs)) c.subs = [];
    for (const s of c.subs) if (s.acct && !(s.acct instanceof NT.Account)) s.acct = NT.Account.from(s.acct);
    c.whale = Math.max(1000, +c.whale || 100000); c.usd = Math.max(10, +c.usd || 500);
    c.ratio = Object.assign({ a: 'SOL-USD', b: 'ETH-USD' }, c.ratio || {}); c.link = !!c.link;
    if (typeof c.acct !== 'string') c.acct = 'main';
    return c;
  };
  const sel = () => ST.sel;
  const nowS = () => Date.now() / 1000;
  const acctOf = () => { const c = cfg(); if (c.acct === 'main') return { name: 'Main paper account', a: ACC }; const s = c.subs.find((x) => x.id === c.acct); return s ? { name: s.name, a: s.acct } : (c.acct = 'main', { name: 'Main paper account', a: ACC }); };
  const fmtP = (p) => (p == null || !isFinite(p) ? '–' : isOnchain(sel()) ? NT.fmtTiny(p) : NT.fmtPrice(p));
  const tickFor = (p) => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(p, 1e-9) * 0.0002))); return [1, 2, 5, 10].map((k) => k * e).find((x) => x >= p * 0.0001) || e; };

  /* ── tab + section shell ── */
  const mount = () => {
    if ($('#tab-desk')) return;
    const nb = document.createElement('button'); nb.dataset.tab = 'desk'; nb.innerHTML = '<span class="ni">🏛</span>Pro Desk';
    const g = $('#nav button[data-tab="grok"]'); if (g) g.after(nb); else { const n = $('#nav'); if (n) n.appendChild(nb); }
    nb.addEventListener('click', () => showTab('desk'));
    const s = document.createElement('section'); s.id = 'tab-desk'; s.className = 'tab';
    s.innerHTML = `<div class="p5-nav seg" id="p5Nav" role="tablist">${SECS.map(([k, l]) => `<button type="button" data-v="${k}">${l}</button>`).join('')}</div><div id="p5Body" class="p5-body"></div>`;
    const m = $('main'); if (m) m.appendChild(s);
    s.querySelector('#p5Nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; cfg().sec = b.dataset.v; saveState(); render(true); });
    s.querySelector('#p5Body').addEventListener('click', onClick);
    s.querySelector('#p5Body').addEventListener('change', onChange);
    TABS.desk = { show: () => render(true), render: () => render(false) };
  };
  const render = (force) => {
    const body = $('#p5Body'); if (!body || curTab !== 'desk') return;
    if (!force && Date.now() - U.lastRender < 900) return; U.lastRender = Date.now();
    const c = cfg(); $$('#p5Nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.sec));
    if (!force && body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; // never clobber typing
    const html = (R[c.sec] || R.dom)();
    if (body._h !== html) { body._h = html; body.innerHTML = html; }
    const after = AFTER[c.sec]; if (after) after();
  };
  const panel = (title, inner, cls = '') => `<div class="panel p5-p ${cls}"><div class="ph">${title}</div><div class="pb">${inner}</div></div>`;
  const R = {}, AFTER = {};

  /* ══ 1. DOM ladder, CVD, footprint ══ */
  const pollBook = async () => {
    const s = sel(); if (isOnchain(s) || isStock(s) || Date.now() - U.bookTs < 1500 || U.bookBusy) return;
    U.bookBusy = true; try { U.book = Object.assign(await Providers.active.book(s), { sym: s }); U.bookErr = ''; } catch (e) { U.bookErr = e.message; } U.bookBusy = false; U.bookTs = Date.now();
  };
  R.dom = () => {
    const s = sel(), A = acctOf(), c = cfg(), bk = U.book && U.book.sym === s ? U.book : null;
    if (!bk) pollBook();
    const p = px(s), tick = tickFor(p || 1), L = bk ? P5.ladder(bk, tick, 22) : { rows: [] }, ords = (A.a.orders || []).filter((o) => o.sym === s), stops = (ST.stops || []).filter((o) => o.sym === s);
    const mark = (pp) => { const o = ords.filter((x) => Math.abs(x.price - pp) < tick / 2), st2 = stops.filter((x) => Math.abs(x.trigger - pp) < tick / 2); return o.map((x) => `<span class="tag ${x.side === 'buy' ? 'up' : 'dn'}">L ${x.side === 'buy' ? 'buy' : 'sell'}</span>`).join('') + st2.map((x) => `<span class="tag amb">STP ${x.side === 'buy' ? 'buy' : 'sell'}</span>`).join(''); };
    const ladder = isStock(s) || isOnchain(s) ? `<div class="empty">${isOnchain(s) ? 'DEX pools are AMMs: there is no order book to ladder.' : 'Stock order books are not available from free feeds.'} Pick a crypto market (e.g. BTC, SOL, DOGE).</div>`
      : !L.rows.length ? `<div class="empty">${U.bookErr ? 'Order book unavailable: ' + esc(U.bookErr) : 'Loading the order book…'}</div>`
      : `<table class="p5-lad"><thead><tr><th>Buy (bid)</th><th>Price</th><th>Sell (ask)</th><th></th></tr></thead><tbody>${L.rows.map((r) => `<tr class="${r.p <= L.bb && r.p + tick > L.bb ? 'bb' : ''}${r.p >= L.ba && r.p - tick < L.ba ? ' ba' : ''}"><td><button type="button" class="p5-lb" data-lad="buy" data-p="${r.p}" title="Buy ${esc(NT.fmtUSD(c.usd))} at ${esc(fmtP(r.p))}"><i style="width:${(r.bw * 100).toFixed(0)}%"></i><span>${r.bid ? esc(NT.fmtQty(r.bid)) : ''}</span></button></td><td class="mono">${esc(fmtP(r.p))}</td><td><button type="button" class="p5-la" data-lad="sell" data-p="${r.p}" title="Sell at ${esc(fmtP(r.p))}"><i style="width:${(r.aw * 100).toFixed(0)}%"></i><span>${r.ask ? esc(NT.fmtQty(r.ask)) : ''}</span></button></td><td>${mark(r.p)}</td></tr>`).join('')}</tbody></table>`;
    const tr = (typeof TFX !== 'undefined' && TFX.ring.get(s)) || [], last = tr.length ? Math.floor(tr[tr.length - 1].t / 60) * 60 : 0;
    const fps = [3, 2, 1, 0].map((k) => ({ t: last - k * 60, f: P5.footprint(tr, last - k * 60, 60, tickFor(p || 1) * 5) }));
    const fpHtml = tr.length < 10 ? '<div class="empty">Footprint builds from live exchange trades: keep this market open for a minute.</div>' : `<div class="p5-fp">${fps.map(({ t, f }) => `<div class="p5-fpc"><div class="note">${esc(fmtClock(t * 1000))} · Δ <b class="${f.delta >= 0 ? 'up' : 'dn'}">${esc(NT.fmtQty(f.delta))}</b></div>${f.rows.slice(0, 14).map((r) => `<div class="p5-fpr ${r.p === f.poc ? 'poc' : ''}"><span class="${r.imb === 'sell' ? 'dn b' : ''}">${esc(NT.fmtQty(r.bid))}</span><span class="mono">${esc(fmtP(r.p))}</span><span class="${r.imb === 'buy' ? 'up b' : ''}">${esc(NT.fmtQty(r.ask))}</span></div>`).join('') || '<div class="note">no trades</div>'}</div>`).join('')}</div>`;
    return `<div class="p5-grid2">${panel(`DOM ladder · ${esc(baseOf(s))} <span class="sp"></span><span class="note">click a bid to buy · an ask to sell · resting side = limit, through the market = stop</span>`,
      `<div class="row p5-tools"><label class="note">Size $ <input class="in" id="p5Usd" type="number" min="10" step="10" value="${c.usd}" style="width:90px"></label>${acctSel()}<span class="note">${esc(A.name)}: ${esc(NT.fmtUSD(A.a.cash))} cash · ${esc(NT.fmtQty(A.a.qty ? A.a.qty(s) : 0))} held</span></div>${ladder}`)}
      <div>${panel('Cumulative volume delta (1m bars, tick rule)', '<canvas id="p5Cvd" class="p5-cv"></canvas><div class="note" id="p5CvdN"></div>')}${panel('Footprint · bid × ask per level (last 4 minutes)', fpHtml)}</div></div>`;
  };
  AFTER.dom = () => {
    const s = sel(), st = typeof Stores !== 'undefined' && (Stores.get(s + '|1m') || Stores.get(s + '|' + ST.tf)), cvd = st ? P5.cvd((TFX.ring.get(s) || []), st.candles.slice(-120), st.sec) : [];
    const cv = $('#p5Cvd'); if (cv) drawLines(cv, [{ values: cvd.map((x) => x.cvd), color: '#38bdf8', label: 'CVD' }], { empty: 'CVD builds from live trades' });
    const n = $('#p5CvdN'); if (n && cvd.length) { const l = cvd[cvd.length - 1]; n.textContent = `Session CVD ${NT.fmtQty(l.cvd)} · last bar Δ ${NT.fmtQty(l.delta)}`; }
  };
  const acctSel = () => { const c = cfg(); return `<select class="in" id="p5Acct" aria-label="Account">${[['main', 'Main paper account']].concat(c.subs.map((x) => [x.id, '🗂 ' + x.name])).map(([v, l]) => `<option value="${esc(v)}" ${c.acct === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; };
  const ladderClick = (side, price) => {
    const s = sel(), A = acctOf().a, c = cfg(), bk = U.book; if (!bk) return;
    const L = P5.ladder(bk, tickFor(px(s) || 1), 22), o = P5.ladderOrder(price, side, L.bb, L.ba); if (!o) return;
    const now = Date.now();
    if (side === 'sell' && !(A.qty(s) > 0)) return toast(`No ${esc(baseOf(s))} to sell in ${esc(acctOf().name)}`, 'amb');
    if (side === 'buy' && A.cash < Math.min(c.usd, 10)) return toast('Not enough paper cash', 'amb');
    if (side === 'buy' && !guardOk(s)) return;
    if (o.type === 'limit') { const size = side === 'buy' ? Math.min(c.usd, A.cash) : Math.min(A.qty(s), c.usd / price); A.placeLimit(s, side, price, size, now, { src: 'manual', reason: 'DOM ladder limit' }); toast(`📊 ${side === 'buy' ? 'Buy' : 'Sell'} limit ${esc(baseOf(s))} @ ${esc(fmtP(price))}`, 'acc'); }
    else { if (A !== ACC) return toast('Stop orders run on the main account only', 'amb'); (ST.stops || (ST.stops = [])).push({ id: NT.uid(), sym: s, side, trigger: price, usd: c.usd, ts: now }); toast(`📊 Stop ${side} ${esc(baseOf(s))} @ ${esc(fmtP(price))}`, 'acc'); }
    Feed.subscribe([s]); saveState(); render(true);
  };
  /* sub-wallet limit orders fill on live ticks like the main account's */
  if (typeof Feed !== 'undefined' && Array.isArray(Feed.tickL)) Feed.tickL.push((sym, price) => { const c = ST.p5; if (!c || !Array.isArray(c.subs)) return; const now = Date.now(); for (const s of c.subs) if (s.acct && s.acct.orders && s.acct.orders.length) for (const f of s.acct.matchOrders(sym, price, price, now)) tradeToast(f, s.name); });

  /* ══ 2. options ══ */
  const optSym = () => (isStock(sel()) ? sel() : cfg().optSym || 'SPY');
  const loadChain = async (exp) => {
    const s = optSym(); U.chainErr = ''; U.chainBusy = true; render(true);
    try { const j = await J.get(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(s)}${exp ? '?date=' + (+exp | 0) : ''}`, { timeout: 9000 }); const ch = P5.parseYahoo(j); if (!ch || !ch.calls.length) throw new Error('empty chain'); U.chain = Object.assign(ch, { sym: s, sim: false }); }
    catch (e) { U.chainErr = String(e.message || e).slice(0, 120); U.chain = modelChain(s); }
    U.chainBusy = false; render(true);
  };
  /* Yahoo now often demands a cookie "crumb": then a clearly labelled Black-Scholes model chain is shown instead */
  const modelChain = (s) => {
    const spot = px(s) || (typeof STOCK_INFO !== 'undefined' && STOCK_INFO[s] ? STOCK_INFO[s].demo : 100); if (!(spot > 0)) return null;
    const exp = Math.floor(nowS() / 86400 + 30) * 86400 + 72000, T = 30 / 365, step = tickFor(spot) * 50 || 1, k0 = Math.round(spot / step) * step, legs = [];
    for (let i = -10; i <= 10; i++) legs.push(k0 + i * step);
    const leg = (k, type) => { const iv = 0.3 + Math.abs(k / spot - 1) * 0.6, m = P5.bs(spot, k, T, 0.04, iv, type).price, oi = Math.round(4000 * Math.exp(-((k / spot - 1) ** 2) * 60)); return { strike: k, bid: +(m * 0.97).toFixed(2), ask: +(m * 1.03).toFixed(2), last: +m.toFixed(2), oi, vol: 0, iv, contract: '' }; };
    return { sym: s, spot, exps: [exp], exp, calls: legs.filter((k) => k > 0).map((k) => leg(k, 'call')), puts: legs.filter((k) => k > 0).map((k) => leg(k, 'put')), sim: true };
  };
  const optMid = (pos) => { const ch = U.chain; if (ch && ch.sym === pos.sym && ch.exp === pos.exp) { const l = (pos.type === 'call' ? ch.calls : ch.puts).find((x) => x.strike === pos.strike); if (l && l.bid + l.ask > 0) return (l.bid + l.ask) / 2; } const S = px(pos.sym) || (ch && ch.sym === pos.sym ? ch.spot : 0); return P5.bs(S, pos.strike, Math.max(0, (pos.exp - nowS()) / 31557600), 0.04, 0.35, pos.type).price; };
  R.opt = () => {
    const c = cfg(), ch = U.chain && U.chain.sym === optSym() ? U.chain : null;
    const tried = U.chainTried && U.chainTried[optSym()];
    if (!ch && !U.chainBusy && !(tried && Date.now() - tried < 60000)) { (U.chainTried = U.chainTried || {})[optSym()] = Date.now(); setTimeout(() => loadChain(), 0); }
    if (!ch) return panel(`Options · ${esc(optSym())}`, `<div class="empty">${U.chainBusy ? 'Loading the options chain…' : 'No options chain for ' + esc(optSym()) + (U.chainErr ? ': ' + esc(U.chainErr) : '') + ' <button type="button" class="btn xs" data-p5="optretry">Retry</button>'}</div>`);
    const T = Math.max(1 / 365, (ch.exp - nowS()) / 31557600), mp = P5.maxPain(ch), gx = P5.gex(ch, ch.spot, T), near = (a) => a.filter((x) => Math.abs(x.strike / ch.spot - 1) < 0.12).slice(0, 24);
    const calls = new Map(near(ch.calls).map((x) => [x.strike, x])), puts = new Map(near(ch.puts).map((x) => [x.strike, x])), ks = [...new Set([...calls.keys(), ...puts.keys()])].sort((a, b) => a - b);
    const gmax = Math.max(1, ...gx.rows.map((r) => Math.abs(r.g)));
    const kp = [['Spot', NT.fmtPrice(ch.spot)], ['Max pain', mp ? NT.fmtPrice(mp) : '–'], ['Net GEX / 1%', '$' + NT.fmtCompact(gx.total)], ['Call wall', gx.callWall ? NT.fmtPrice(gx.callWall) : '–'], ['Put wall', gx.putWall ? NT.fmtPrice(gx.putWall) : '–'], ['Gamma flip', gx.flip ? NT.fmtPrice(gx.flip) : '–']];
    const pos = c.opts.map((p, i) => { const m = P5.optMark(p, optMid); return `<tr><td>${esc(p.sym)} ${esc(p.type)} ${esc(NT.fmtPrice(p.strike))}</td><td>${esc(new Date(p.exp * 1000).toISOString().slice(0, 10))}</td><td>${esc(String(+p.qty))}</td><td>${esc(p.prem.toFixed(2))}</td><td>${esc(m.mark.toFixed(2))}</td><td class="${m.pnl >= 0 ? 'up' : 'dn'}">${esc(NT.fmtUSD(m.pnl))}</td><td><button type="button" class="btn xs" data-optclose="${esc(p.id)}">Close</button></td></tr>`; }).join('');
    return `<div class="p5-grid2">${panel(`Options chain · ${esc(ch.sym)} ${ch.sim ? '<span class="tag amb">MODEL (Yahoo unavailable)</span>' : '<span class="tag up">Yahoo</span>'}<span class="sp"></span><select class="in" id="p5Exp">${ch.exps.map((e) => `<option value="${e}" ${e === ch.exp ? 'selected' : ''}>${esc(new Date(e * 1000).toISOString().slice(0, 10))}</option>`).join('')}</select>`,
      `${ch.sim ? `<div class="note">Yahoo did not return a chain (${esc(U.chainErr)}). Prices below come from a Black-Scholes model with a volatility smile; use them for practice only.</div>` : ''}<div class="p5-kpis">${kp.map(([k, v]) => `<div><span class="k">${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
       <div class="scroll"><table class="p5-chain"><thead><tr><th>Call bid/ask</th><th>OI</th><th>Strike</th><th>OI</th><th>Put bid/ask</th></tr></thead><tbody>${ks.map((k) => { const cl = calls.get(k), pu = puts.get(k); return `<tr class="${Math.abs(k - ch.spot) < (ks[1] - ks[0] || 1) / 2 ? 'atm' : ''}${k === mp ? ' mp' : ''}"><td>${cl ? `<button type="button" class="btn xs" data-optbuy="call" data-k="${k}">${esc(cl.bid.toFixed(2))} / ${esc(cl.ask.toFixed(2))}</button>` : ''}</td><td>${cl ? esc(NT.fmtCompact(cl.oi)) : ''}</td><td class="mono"><b>${esc(NT.fmtPrice(k))}</b>${k === mp ? ' <span class="tag acc">max pain</span>' : ''}</td><td>${pu ? esc(NT.fmtCompact(pu.oi)) : ''}</td><td>${pu ? `<button type="button" class="btn xs" data-optbuy="put" data-k="${k}">${esc(pu.bid.toFixed(2))} / ${esc(pu.ask.toFixed(2))}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`)}
      <div>${panel('Gamma exposure by strike', `<div class="p5-gex">${gx.rows.filter((r) => Math.abs(r.strike / ch.spot - 1) < 0.12).map((r) => `<div class="p5-gr"><span class="mono">${esc(NT.fmtPrice(r.strike))}</span><div class="p5-gb"><i class="${r.g >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(r.g) / gmax * 50).toFixed(1)}%"></i></div></div>`).join('')}</div>`)}
      ${panel(`Paper options · ${esc(NT.fmtUSD(c.optCash))} options cash`, `<div class="note">Buy a contract with the chain buttons (fills at the ask, 100 shares each). Isolated from your spot account.</div><label class="note">Contracts <input class="in" id="p5OptQty" type="number" min="1" max="100" value="${esc(String(c.optQty))}" style="width:70px"></label>${pos ? `<table class="p5-tbl"><thead><tr><th>Contract</th><th>Expiry</th><th>Qty</th><th>Paid</th><th>Mark</th><th>P&amp;L</th><th></th></tr></thead><tbody>${pos}</tbody></table>` : '<div class="empty">No option positions.</div>'}`)}</div></div>`;
  };

  /* ══ 3. ratio charts, synced grid, pop-outs ══ */
  U.ratioData = {};
  const loadRatio = async (a, b, key) => {
    if (U.ratioData[key] && Date.now() - U.ratioData[key].ts < 60000) return;
    U.ratioData[key] = { ts: Date.now(), c: null };
    try { const sec = Math.max(300, NT.TF[ST.tf] || 3600), [x, y] = await Promise.all([History.get(a, sec, 300), History.get(b, sec, 300)]); U.ratioData[key] = { ts: Date.now(), c: P5.ratio(x, y) }; } catch (e) { U.ratioData[key] = { ts: Date.now(), c: [], err: e.message }; }
    if (curTab === 'desk' && cfg().sec === 'ratio') render(true);
  };
  const GRID = [['SOL-USD', 'ETH-USD'], ['NVDA', 'AMD'], ['BTC-USD', 'GLD'], ['ETH-USD', 'BTC-USD']];
  R.ratio = () => {
    const c = cfg(), main = c.ratio.a + '/' + c.ratio.b;
    for (const [a, b] of [[c.ratio.a, c.ratio.b]].concat(GRID)) loadRatio(a, b, a + '/' + b);
    const cell = (a, b, big) => { const d = U.ratioData[a + '/' + b], last = d && d.c && d.c.length ? d.c[d.c.length - 1].c : null; return `<div class="p5-rc ${big ? 'big' : ''}"><div class="note"><b>${esc(baseOf(a))}/${esc(baseOf(b) === 'GLD' ? 'GOLD (GLD)' : baseOf(b))}</b> ${last ? esc(last.toPrecision(5)) : ''} ${d && d.err ? '· ' + esc(d.err) : ''}</div><canvas class="p5-rcv" data-ratio="${esc(a + '/' + b)}"></canvas></div>`; };
    return `${panel(`Synthetic ratio chart <span class="sp"></span><input class="in" id="p5Ra" value="${esc(c.ratio.a)}" style="width:110px" aria-label="Numerator"> / <input class="in" id="p5Rb" value="${esc(c.ratio.b)}" style="width:110px" aria-label="Denominator"><button type="button" class="btn sm" data-p5="ratio">Plot</button>`, cell(c.ratio.a, c.ratio.b, true))}
      ${panel(`Synchronized multi-chart grid <span class="sp"></span><span class="note">crosshair is shared across the grid and every linked pop-out</span>`, `<div class="p5-rgrid">${GRID.map(([a, b]) => cell(a, b)).join('')}</div>`)}
      ${panel('Multi-monitor pop-out windows', `<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-p5="pop">⧉ Pop out ${esc(baseOf(sel()))} chart</button><label class="chk"><input type="checkbox" id="p5Link" ${c.link ? 'checked' : ''}> Link windows (symbol + crosshair follow the main window)</label><span class="note" id="p5Peers">${U.peers ? U.peers.size : 0} linked window(s)</span></div><div class="note">Pop-outs talk over a same-origin BroadcastChannel; messages are validated and only carry a symbol, timeframe or crosshair time.</div>`)}`;
  };
  AFTER.ratio = () => { for (const cv of $$('#p5Body canvas[data-ratio]')) { const d = U.ratioData[cv.dataset.ratio]; drawLines(cv, [{ values: d && d.c ? d.c.map((k) => k.c) : [], color: '#a78bfa', label: cv.dataset.ratio }], { empty: d && d.c && !d.c.length ? 'No overlapping data' : 'Loading…' }); drawCross(cv, d); } };
  const drawCross = (cv, d) => { if (!U.crossT || !d || !d.c || d.c.length < 2) return; const i = d.c.findIndex((k) => k.t >= U.crossT); if (i < 0) return; const g = cv.getContext('2d'), W = cv.clientWidth, H = cv.clientHeight, x = 4 + (i / (d.c.length - 1)) * (W - 8); g.strokeStyle = 'rgba(250,204,21,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); };
  /* BroadcastChannel: symbol + crosshair sync between the main window and pop-outs */
  const bc = () => { if (U.bc !== undefined) return U.bc; try { U.bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('exterm-sync') : null; } catch (e) { U.bc = null; } if (U.bc) { U.peers = new Set(); U.bc.onmessage = (e) => onBc(e.data); post({ k: 'hello' }); } return U.bc; };
  const post = (m) => { const b = bc(); if (b) try { b.postMessage(Object.assign({ v: 1, from: U.wid }, m)); } catch (e) { /* closed */ } };
  const onBc = (raw) => {
    const m = P5.bcMsg(raw); if (!m || m.from === U.wid) return;
    if (U.peers.size > 32) U.peers.clear();
    if (m.k === 'hello') { U.peers.add(m.from); if (!raw.ack) post({ k: 'hello', ack: 1 }); } // answer once so both sides know each other
    else if (m.k === 'bye') U.peers.delete(m.from); else U.peers.add(m.from);
    const linked = cfg().link || document.body.classList.contains('popout');
    const known = (s) => (typeof normSym === 'function' ? normSym(s) === s : true) && (isStock(s) || isOnchain(s) || Providers.ids.has(s));
    if (m.k === 'sym' && linked && m.sym !== ST.sel && known(m.sym)) { U.applying = true; try { openSym(m.sym); if (m.tf && m.tf !== ST.tf) { ST.tf = m.tf; chartRefresh(true); } } finally { U.applying = false; } }
    if (m.k === 'cross' && linked) { U.crossT = m.t; if (cfg().sec === 'ratio' && curTab === 'desk') AFTER.ratio(); }
    const pe = $('#p5Peers'); if (pe) pe.textContent = U.peers.size + ' linked window(s)';
  };
  const popout = () => { bc(); cfg().link = true; saveState(); const w = window.open(location.href.split('#')[0] + '#popout=' + encodeURIComponent(sel()), '_blank', 'popup,width=960,height=640'); if (!w) toast('Pop-ups are blocked for this page', 'amb'); else post({ k: 'sym', sym: sel(), tf: ST.tf }); };
  if (typeof selectSym === 'function') { const _sel = selectSym; selectSym = function (s) { const r = _sel.apply(this, arguments); if (!U.applying && (cfg().link || document.body.classList.contains('popout'))) post({ k: 'sym', sym: ST.sel, tf: ST.tf }); return r; }; }

  /* ══ 4. risk: correlation guard, sub-wallets, regime ══ */
  const retsCache = new Map();
  const retsOf = (s) => { const st = typeof Stores !== 'undefined' && (Stores.get(s + '|1h') || Stores.get(s + '|15m') || Stores.get(s + '|' + ST.tf)), arr = st ? st.candles : null, c = retsCache.get(s); if (c && c.arr === arr && Date.now() - c.ts < 60000) return c.r; /* a reloaded / replaced history invalidates the cache */ const r = arr && arr.length > 31 ? P5.rets(arr.slice(-201, -1)) : null; /* closed bars only: the forming bar is noise */ retsCache.set(s, { ts: Date.now(), r, arr }); return r; };
  const heldSyms = () => { const s = new Set(Object.keys(ACC.pos || {}).filter((k) => ACC.pos[k] && ACC.pos[k].qty > 0)); for (const b of ST.bots || []) if (b.account && b.account.pos && b.account.pos[b.sym]) s.add(b.sym); for (const w of cfg().subs) for (const k of Object.keys((w.acct && w.acct.pos) || {})) s.add(k); return [...s]; };
  const guardCheck = (sym) => { const g = cfg().guard; if (!g.on) return { ok: true }; const r = retsOf(sym); if (!r) return { ok: true }; return P5.corrGuard({ sym, rets: r }, heldSyms().map((s) => ({ sym: s, rets: retsOf(s) || [] })), g.max); };
  const guardOk = (sym) => { const r = guardCheck(sym); if (r.ok) return true; U.blocks.unshift({ ts: Date.now(), sym, with: r.worst.sym, r: r.worst.r }); U.blocks = U.blocks.slice(0, 20); toast(`🛡 Correlation guard: ${esc(baseOf(sym))} moves ${(r.worst.r * 100).toFixed(0)}% with ${esc(baseOf(r.worst.sym))} you already hold. Entry blocked.`, 'amb'); return false; };
  /* bot + manual entries on the main account / bot accounts / sub-wallets pass the guard (backtests, replays and challenges do not) */
  if (NT.Account && NT.Account.prototype && !NT.Account.prototype._p5) {
    const _buy = NT.Account.prototype.buy;
    NT.Account.prototype.buy = function (sym, price, usd, ts, meta = {}) {
      const live = this === ACC || (ST.bots || []).some((b) => b.account === this) || ((ST.p5 && ST.p5.subs) || []).some((w) => w.acct === this);
      if (live && !U.inMatch && !(meta && (meta.src === 'backtest' || meta.guard === false)) && !this.pos[sym] && typeof cfg === 'function' && !guardCheck(sym).ok) { const g = guardCheck(sym); const k = sym + '|' + g.worst.sym; if (U._lastBlock !== k || Date.now() - (U._lastBlockT || 0) > 30000) { U._lastBlock = k; U._lastBlockT = Date.now(); guardOk(sym); } return null; }
      return _buy.apply(this, arguments);
    };
    const _mo = NT.Account.prototype.matchOrders; NT.Account.prototype.matchOrders = function () { U.inMatch = true; try { return _mo.apply(this, arguments); } finally { U.inMatch = false; } }; // resting limits were checked when placed
    NT.Account.prototype._p5 = true;
  }
  R.risk = () => {
    const c = cfg(), held = heldSyms(), reg = (() => { const st = typeof Stores !== 'undefined' && (Stores.get(sel() + '|' + ST.tf)); return st && st.candles.length >= 60 && typeof P3 !== 'undefined' ? P3.regime(st.candles) : null; })();
    const mat = held.slice(0, 8), cells = mat.map((a) => `<tr><th>${esc(baseOf(a))}</th>${mat.map((b) => { const r = a === b ? 1 : P5.corr(retsOf(a) || [], retsOf(b) || []); return `<td class="p5-cc" style="background:${r == null ? 'transparent' : r > 0 ? `rgba(244,63,94,${(r * 0.6).toFixed(2)})` : `rgba(34,197,94,${(-r * 0.6).toFixed(2)})`}">${r == null ? '–' : r.toFixed(2)}</td>`; }).join('')}</tr>`).join('');
    return `<div class="p5-grid2">${panel('Cross-bot portfolio correlation guard', `<div class="row" style="gap:10px;flex-wrap:wrap"><label class="chk"><input type="checkbox" id="p5Guard" ${c.guard.on ? 'checked' : ''}> Block new entries that are too correlated with what is already held</label><label class="note">max ρ <input class="in" id="p5GuardMax" type="number" min="0.5" max="0.99" step="0.01" value="${esc(String(c.guard.max))}" style="width:70px"></label></div>
       ${mat.length > 1 ? `<table class="p5-corr"><thead><tr><th></th>${mat.map((s) => `<th>${esc(baseOf(s))}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>` : '<div class="note">Hold two or more markets (manual, bots or sub-wallets) to see their correlation matrix.</div>'}
       <div class="p5-st">Recent blocks</div>${U.blocks.map((b) => `<div class="note">${esc(fmtClock(b.ts))} · ${esc(baseOf(b.sym))} blocked (ρ ${b.r.toFixed(2)} with ${esc(baseOf(b.with))})</div>`).join('') || '<div class="note">None.</div>'}`)}
      <div>${panel('Isolated paper sub-wallets', `<div class="row" style="gap:6px;flex-wrap:wrap"><input class="in" id="p5SwName" placeholder="Name, e.g. Scalps" maxlength="24" style="width:140px"><input class="in" id="p5SwUsd" type="number" min="10" placeholder="$ from main" style="width:110px"><button type="button" class="btn sm" data-p5="swnew">Create</button></div>
         ${c.subs.length ? `<table class="p5-tbl"><thead><tr><th>Wallet</th><th>Allocated</th><th>Equity</th><th>Positions</th><th></th></tr></thead><tbody>${c.subs.map((w) => { const eq = w.acct.equity(Object.fromEntries(Object.keys(w.acct.pos).map((k) => [k, px(k)]))); return `<tr><td>${esc(w.name)}</td><td>${esc(NT.fmtUSD(w.alloc))}</td><td class="${eq >= w.alloc ? 'up' : 'dn'}">${esc(NT.fmtUSD(eq))}</td><td>${Object.keys(w.acct.pos).map((k) => esc(baseOf(k))).join(', ') || '–'}</td><td><button type="button" class="btn xs" data-swuse="${esc(w.id)}">Trade</button> <button type="button" class="btn xs" data-swclose="${esc(w.id)}">Close</button></td></tr>`; }).join('')}</tbody></table>` : '<div class="note">Carve paper cash into separate wallets so one strategy can never spend another’s money. Trade them from the DOM ladder.</div>'}`)}
      ${panel(`Market regime · ${esc(baseOf(sel()))} ${esc(ST.tf)}`, reg ? `<div class="p5-kpis"><div><span class="k">Regime</span><b>${esc(String(reg.regime))}</b></div><div><span class="k">ADX</span><b>${reg.adx == null ? '–' : esc(reg.adx.toFixed(1))}</b></div><div><span class="k">ATR %</span><b>${reg.atrPct == null ? '–' : esc(reg.atrPct.toFixed(2))}</b></div></div><div class="note">${esc(reg.note || '')}</div>` : '<div class="note">Open a chart with 60+ bars to classify the regime.</div>')}</div></div>`;
  };

  /* ══ 5. whale tape, wallet profiler, flex cards ══ */
  R.tape = () => {
    const c = cfg(), s = sel(), wh = P5.whales((typeof TFX !== 'undefined' && TFX.ring.get(s)) || [], c.whale, 40);
    const ws = (typeof Sol !== 'undefined' && Sol.wallets) || [], wa = c.prof && ws.find((w) => w.addr === c.prof) ? c.prof : ws[0] && ws[0].addr;
    const tr = wa && typeof Sol !== 'undefined' ? Sol.trades.filter((t) => t.wallet === wa).map((t) => ({ ts: t.ts / 1000, side: t.side, token: t.mint, qty: t.amt, usd: t.usd })) : [];
    const pf = P5.profile(tr), sym = (m) => { const t = typeof Sol !== 'undefined' && Sol.tokens ? Sol.tokens[m] : null; return t && t.symbol ? t.symbol : String(m || '').slice(0, 6) + '…'; };
    return `<div class="p5-grid2">${panel(`Time &amp; Sales whale tape · ${esc(baseOf(s))} <span class="sp"></span><label class="note">min $ <input class="in" id="p5Whale" type="number" min="1000" step="1000" value="${c.whale}" style="width:100px"></label>`,
      wh.length ? `<div class="p5-tape">${wh.map((x) => `<div class="p5-tr ${x.side === 'buy' ? 'up' : x.side === 'sell' ? 'dn' : ''}"><span class="mono">${esc(fmtClock(x.t * 1000))}</span><b>${x.side === 'buy' ? '▲ BUY' : x.side === 'sell' ? '▼ SELL' : '·'}</b><span class="mono">${esc(fmtP(x.p))}</span><span>${esc(NT.fmtQty(x.q))}</span><b>${esc('$' + NT.fmtCompact(x.usd))}</b></div>`).join('')}</div>` : '<div class="empty">No prints above the threshold in the live trade buffer yet.</div>')}
      <div>${panel('Smart-money wallet profiler', ws.length ? `<select class="in" id="p5Prof">${ws.slice(0, 80).map((w) => `<option value="${esc(w.addr)}" ${w.addr === wa ? 'selected' : ''}>${esc((w.emoji || '') + ' ' + w.name)}</option>`).join('')}</select>
         <div class="p5-kpis"><div><span class="k">Style</span><b>${esc(pf.style)}</b></div><div><span class="k">Round trips</span><b>${pf.trips}</b></div><div><span class="k">Win rate</span><b>${pf.winRate == null ? '–' : (pf.winRate * 100).toFixed(0) + '%'}</b></div><div><span class="k">Realized</span><b class="${pf.realized >= 0 ? 'up' : 'dn'}">${esc(NT.fmtUSD(pf.realized))}</b></div><div><span class="k">Avg hold</span><b>${pf.holdMin == null ? '–' : pf.holdMin < 120 ? pf.holdMin.toFixed(0) + 'm' : (pf.holdMin / 60).toFixed(1) + 'h'}</b></div><div><span class="k">Volume</span><b>$${esc(NT.fmtCompact(pf.volume))}</b></div></div>
         <div class="note">Best tokens: ${pf.best.map((b) => `${esc(sym(b.token))} <span class="${b.pnl >= 0 ? 'up' : 'dn'}">${esc(NT.fmtUSD(b.pnl))}</span>`).join(' · ') || '–'} · from ${tr.length} decoded trades</div>` : '<div class="note">Add wallets in the Wallet Tracker to profile them.</div>')}
      ${panel('Viral PNG flex card', `<div class="note">A 1080×1080 card of your paper equity, return and best trade, watermarked @exterm.labs.</div><button type="button" class="btn sm" data-p5="flex">📸 Download flex card</button>`)}</div></div>`;
  };
  U.flexCanvas = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1080; const g = cv.getContext('2d');
    const eq = ACC.equity(Object.fromEntries(Object.keys(ACC.pos).map((k) => [k, px(k)]))) + U.subEquity(), base = ACC.cash0 || 10000, ret = (eq / base - 1) * 100;
    const best = (ACC.trades || []).filter((t) => t.side === 'sell' && t.pnl > 0).sort((a, b) => b.pnl - a.pnl)[0];
    const gr = g.createLinearGradient(0, 0, 1080, 1080); gr.addColorStop(0, '#120f2b'); gr.addColorStop(1, '#05060e'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1080);
    if (typeof V151 !== 'undefined') { V151.drawMark(g, 80, 70, 110); V151.drawWordmark(g, 210, 140, 62); } else { g.fillStyle = '#D4AF37'; g.font = '800 64px Inter, system-ui, sans-serif'; g.fillText('EXTERM', 80, 150); }
    g.fillStyle = '#cbd5e1'; g.font = '500 40px Inter, system-ui, sans-serif'; g.fillText('Paper trading results', 80, 240);
    g.fillStyle = ret >= 0 ? '#22c55e' : '#f43f5e'; g.font = '900 180px Inter, system-ui, sans-serif'; g.fillText((ret >= 0 ? '+' : '') + ret.toFixed(1) + '%', 80, 470);
    g.fillStyle = '#e2e8f0'; g.font = '600 48px Inter, system-ui, sans-serif'; g.fillText('Equity ' + NT.fmtUSD(eq), 80, 580);
    if (best) g.fillText('Best trade ' + String(baseOf(best.sym)).slice(0, 12) + ' ' + NT.fmtUSD(best.pnl), 80, 660);
    g.fillStyle = '#64748b'; g.font = '500 34px Inter, system-ui, sans-serif'; g.fillText(new Date().toISOString().slice(0, 10) + ' · paper money, not financial advice', 80, 960);
    g.save(); g.globalAlpha = 0.85; g.fillStyle = '#D4AF37'; g.font = '800 46px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('@exterm.labs', 1000, 1030); if (typeof V151 !== 'undefined') V151.drawMark(g, 600, 990, 52); g.restore();
    return cv;
  };
  const flex = () => { const cv = U.flexCanvas(); cv.toBlob((b) => { if (!b || !download('exterm-flex-' + new Date().toISOString().slice(0, 10) + '.png', b, 'image/png')) toast('Downloads are blocked here', 'amb'); else toast('📸 Flex card saved', 'up'); }, 'image/png'); };

  /* ══ 6. chart intelligence: MTF matrix + overlays on the main chart ══ */
  const loadMtf = async () => {
    const s = sel(), key = s; if (U.mtfBusy || (U.mtfKey === key && Date.now() - U.mtfTs < 60000)) return;
    U.mtfBusy = true; const out = {};
    for (const tf of ['15m', '1h', '4h', '1d']) { try { out[tf] = await History.get(s, NT.TF[tf], 200); } catch (e) { out[tf] = []; } }
    U.mtf = P5.mtf(out); U.mtfKey = key; U.mtfTs = Date.now(); U.mtfBusy = false; if (curTab === 'desk') render(true); if (chart) chart.invalidate && chart.invalidate();
  };
  R.intel = () => {
    const c = cfg(), m = U.mtfKey === sel() ? U.mtf : null; loadMtf();
    const st = typeof Stores !== 'undefined' && Stores.get(sel() + '|' + ST.tf), cs = st ? st.candles : [];
    const fib = P5.autoFib(cs), pd = P5.prevDay(cs, isStock(sel()) ? P5.nyOffset(nowS()) : 0), vp = P5.vpvr(cs.slice(-300), 40);
    const tog = (k, l) => `<label class="chk"><input type="checkbox" data-ov="${k}" ${c.ov[k] ? 'checked' : ''}> ${l}</label>`;
    return `<div class="p5-grid2">${panel(`Multi-timeframe trend matrix · ${esc(baseOf(sel()))}`, m ? `<div class="p5-mtf">${m.rows.map((r) => `<div class="p5-mc ${r.dir > 0 ? 'up' : r.dir < 0 ? 'dn' : ''}"><span class="k">${esc(r.tf)}</span><b>${r.dir > 0 ? '▲ Up' : r.dir < 0 ? '▼ Down' : '◆ Flat'}</b></div>`).join('')}<div class="p5-mc"><span class="k">Bias</span><b>${esc(m.bias)} (${m.score > 0 ? '+' : ''}${m.score})</b></div></div>` : '<div class="empty">Loading 15m / 1h / 4h / 1d…</div>')}
      ${panel('Chart overlays (drawn on the Markets chart)', `<div class="p5-ovs">${tog('mtf', 'MTF HUD')}${tog('fib', 'Auto-Fibs')}${tog('pd', 'PDH / PDL / PDC')}${tog('vp', 'Volume profile (VPVR · POC · VA)')}${tog('ev', 'FOMC / Form 4 markers')}${tog('ext', 'Extended-hours shading (stocks)')}</div>
        <div class="p5-kpis"><div><span class="k">Fib swing</span><b>${fib ? esc(fmtP(fib.lo)) + ' → ' + esc(fmtP(fib.hi)) : '–'}</b></div><div><span class="k">PDH / PDL</span><b>${pd ? esc(fmtP(pd.pdh)) + ' / ' + esc(fmtP(pd.pdl)) : '–'}</b></div><div><span class="k">POC</span><b>${vp ? esc(fmtP(vp.poc)) : '–'}</b></div><div><span class="k">Value area</span><b>${vp ? esc(fmtP(vp.val)) + ' – ' + esc(fmtP(vp.vah)) : '–'}</b></div></div>
        <div class="note">Events: ${P5.FOMC_2026.length} scheduled FOMC decisions (2026) plus Form 4 insider filings for the open stock when the insider tracker has them.</div>`)}</div>`;
  };
  const evFor = (s) => P5.events({ form4: isStock(s) && typeof SEC !== 'undefined' ? (SEC.trades || []).filter((t) => t.ticker === s).slice(0, 30).map((t) => ({ t: (Date.parse(t.date || t.filed || '') || t.ts || 0) / 1000, l: 'Form 4: ' + String(t.insider || t.owner || '').slice(0, 24) + ' ' + String(t.code || t.type || '') })) : [] });
  const ovCache = { key: '', v: null };
  const overlays = (ch, g) => {
    const c = ST.p5 && ST.p5.ov; if (!c || !ch.L || !ch.L.py || !ch.data || ch.data.length < 20 || ch !== chart) return;
    const L = ch.L, D = ch.data, W = L.W, top = L.Tm || 28, bot = top + L.mainH, x0 = L.Lm, x1 = W - L.Rm, s = ST.sel;
    const key = s + '|' + ST.tf + '|' + D.length + '|' + D[D.length - 1].t + '|' + JSON.stringify(c);
    if (ovCache.key !== key) { const cs = D.slice(-300); ovCache.key = key; ovCache.v = { fib: c.fib ? P5.autoFib(D) : null, pd: c.pd ? P5.prevDay(D, isStock(s) ? P5.nyOffset(D[D.length - 1].t) : 0) : null, vp: c.vp ? P5.vpvr(cs, 48) : null, ev: c.ev ? evFor(s) : null }; }
    const v = ovCache.v; g.save(); try { g.beginPath(); g.rect(x0, top, x1 - x0, bot - top); g.clip();
    const hl = (p, col, label, dash) => { const y = L.py(p); if (!(y >= top && y <= bot)) return; g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = 1; g.beginPath(); g.moveTo(x0, Math.round(y) + 0.5); g.lineTo(x1, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = '600 10px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(label, x0 + 4, y - 3); };
    if (c.ext && isStock(s) && (NT.TF[ST.tf] || 3600) < 86400) { g.fillStyle = 'rgba(148,163,200,.07)'; for (let i = L.start; i < L.end; i++) { const ss = P5.session(D[i].t); if (ss === 'pre' || ss === 'post') g.fillRect(L.kx(i) - L.bw / 2, top, L.bw + 0.5, bot - top); } }
    if (v.vp) { const mx = Math.max(1e-12, ...v.vp.bins.map((b) => b.v)), w = (x1 - x0) * 0.22; for (const b of v.vp.bins) { const y0 = L.py(b.p1), y1 = L.py(b.p0), inVA = b.p0 >= v.vp.val - 1e-12 && b.p1 <= v.vp.vah + 1e-12; g.fillStyle = inVA ? 'rgba(56,189,248,.22)' : 'rgba(148,163,200,.14)'; g.fillRect(x1 - (b.v / mx) * w, Math.min(y0, y1), (b.v / mx) * w, Math.max(1, Math.abs(y1 - y0) - 1)); } hl(v.vp.poc, '#f59e0b', 'POC', [2, 2]); hl(v.vp.vah, 'rgba(56,189,248,.8)', 'VAH', [4, 4]); hl(v.vp.val, 'rgba(56,189,248,.8)', 'VAL', [4, 4]); }
    if (v.fib) for (const l of v.fib.levels) hl(l.p, l.r === 0.618 ? '#facc15' : 'rgba(167,139,250,.75)', 'Fib ' + l.r, [6, 3]);
    if (v.pd) { hl(v.pd.pdh, '#22c55e', 'PDH', [8, 4]); hl(v.pd.pdl, '#f43f5e', 'PDL', [8, 4]); hl(v.pd.pdc, 'rgba(226,232,240,.6)', 'PDC', [2, 4]); }
    if (v.ev) { const t0 = D[L.start].t, t1 = D[L.end - 1].t; for (const e of v.ev) if (e.t >= t0 && e.t <= t1) { const x = ch.tToX(e.t); g.strokeStyle = e.k === 'fomc' ? 'rgba(250,204,21,.7)' : 'rgba(56,189,248,.7)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); g.setLineDash([]); g.fillStyle = g.strokeStyle; g.font = '700 10px Inter, system-ui, sans-serif'; g.fillText(e.k === 'fomc' ? 'FOMC' : e.k === 'f4' ? 'F4' : 'ER', x + 3, bot - 6); } }
    } finally { g.restore(); }
    if (c.mtf && U.mtf && U.mtfKey === s) { g.save(); g.font = '700 11px Inter, system-ui, sans-serif'; let x = x0 + 8; for (const r of U.mtf.rows) { const t = r.tf + (r.dir > 0 ? ' ▲' : r.dir < 0 ? ' ▼' : ' ◆'), w = g.measureText(t).width + 12; g.fillStyle = r.dir > 0 ? 'rgba(34,197,94,.85)' : r.dir < 0 ? 'rgba(244,63,94,.85)' : 'rgba(100,116,139,.85)'; g.fillRect(x, top + 6, w, 18); g.fillStyle = '#fff'; g.fillText(t, x + 6, top + 19); x += w + 4; } g.restore(); } else if (c.mtf) loadMtf();
  };
  if (typeof CandleChart === 'function' && !CandleChart.prototype._p5) {
    const _dd = CandleChart.prototype.drawDyn;
    CandleChart.prototype.drawDyn = function (g, S) { const r = _dd.apply(this, arguments); try { overlays(this, g); } catch (e) { /* an overlay must never break the chart */ } return r; };
    CandleChart.prototype._p5 = true;
  }

  /* ══ 7. quant lab ══ */
  const gridFor = (id) => { const d = NT.defaultParams(id), keys = Object.keys(d).filter((k) => typeof d[k] === 'number' && d[k] > 1).slice(0, 2), out = [d]; for (const k of keys) for (const m of [0.7, 1.3]) out.push(Object.assign({}, d, { [k]: Math.max(2, Math.round(d[k] * m)) })); return out; };
  R.quant = () => {
    const c = cfg(), ids = Object.keys(NT.strategies), id = ids.includes(c.qs) ? c.qs : ids[0], r = U.quant && U.quant.id === id && U.quant.sym === sel() ? U.quant : null;
    return `<div class="p5-grid2">${panel(`Walk-forward optimisation &amp; Monte Carlo · ${esc(baseOf(sel()))} ${esc(ST.tf)}`, `<div class="row" style="gap:6px;flex-wrap:wrap"><select class="in" id="p5Qs" style="max-width:260px">${ids.map((k) => `<option value="${esc(k)}" ${k === id ? 'selected' : ''}>${esc(NT.strategies[k].name)}</option>`).join('')}</select><button type="button" class="btn sm" data-p5="wfo"${U.qBusy ? ' disabled' : ''}>${U.qBusy ? 'Running…' : 'Run walk-forward + Monte Carlo'}</button></div>
       ${r ? (r.err ? `<div class="note">${esc(r.err)}</div>` : `<table class="p5-tbl"><thead><tr><th>Fold</th><th>Best params (in-sample)</th><th>IS return</th><th>OOS return</th></tr></thead><tbody>${r.wf.folds.map((f) => `<tr><td>${f.fold}</td><td class="mono">${esc(JSON.stringify(f.params).slice(0, 60))}</td><td>${esc(NT.fmtPct(f.isRet * 100))}</td><td class="${f.oosRet >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(f.oosRet * 100))}</td></tr>`).join('')}</tbody></table>
         <div class="p5-kpis"><div><span class="k">OOS total</span><b class="${r.wf.oosTotal >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(r.wf.oosTotal * 100))}</b></div><div><span class="k">WF efficiency</span><b>${r.wf.efficiency == null ? '–' : esc(r.wf.efficiency.toFixed(2))}</b></div><div><span class="k">Verdict</span><b class="${r.wf.robust ? 'up' : 'dn'}">${r.wf.robust ? 'robust' : 'fragile'}</b></div></div>
         ${r.mc ? `<div class="p5-st">Monte Carlo · ${r.mc.runs} reshuffles of ${r.n} trades</div><div class="p5-kpis"><div><span class="k">5th pct</span><b>${esc(NT.fmtPct(r.mc.p5 * 100))}</b></div><div><span class="k">Median</span><b>${esc(NT.fmtPct(r.mc.p50 * 100))}</b></div><div><span class="k">95th pct</span><b>${esc(NT.fmtPct(r.mc.p95 * 100))}</b></div><div><span class="k">Median DD</span><b>${esc(NT.fmtPct(-r.mc.ddP50 * 100))}</b></div><div><span class="k">95% DD</span><b>${esc(NT.fmtPct(-r.mc.ddP95 * 100))}</b></div><div><span class="k">P(loss)</span><b>${esc((r.mc.lossProb * 100).toFixed(0))}%</b></div></div>` : '<div class="note">Too few trades for Monte Carlo.</div>'}`) : '<div class="note">Splits the history into 4 folds, picks the best parameters on each 70 % in-sample window and scores them on the unseen 30 %. Monte Carlo then reshuffles the full backtest’s trades 1,000 times.</div>'}`)}
      ${panel('Import Pine Script v5 compatible', `<textarea class="in mono" id="p5Pine" rows="12" spellcheck="false" placeholder="//@version=5&#10;strategy(&quot;My strategy&quot;)&#10;fast = ta.ema(close, 9)&#10;slow = ta.ema(close, 21)&#10;if ta.crossover(fast, slow)&#10;    strategy.entry(&quot;L&quot;, strategy.long)&#10;if ta.crossunder(fast, slow)&#10;    strategy.close(&quot;L&quot;)">${esc(c.pine || '')}</textarea><div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn sm" data-p5="pine">Import as no-code strategy</button></div><div id="p5PineOut">${U.pineOut || '<div class="note">Reads inputs, ta.ema / sma / rsi / atr / macd / bb / highest / lowest / vwap, crossovers, comparisons with and / or, strategy.entry / close and % stops. It never runs the script: it translates it to ExTerm’s safe strategy format.</div>'}</div>`)}</div>`;
  };
  const runQuant = async () => {
    const c = cfg(), id = c.qs && NT.strategies[c.qs] ? c.qs : Object.keys(NT.strategies)[0], s = sel(), sec = NT.TF[ST.tf] || 3600;
    U.qBusy = true; render(true); await new Promise((r) => setTimeout(r, 30));
    try {
      let cs = (Stores.get(s + '|' + ST.tf) || { candles: [] }).candles.slice(); if (cs.length < 800) { try { const h = await History.get(s, sec, 1500); if (h.length > cs.length) cs = h; } catch (e) { /* use the chart */ } }
      if (cs.length < 300) throw new Error('Need 300+ bars for walk-forward (pick a lower timeframe or wait for history)');
      const wf = P5.walkForward(cs, NT.strategies[id], gridFor(id), { folds: 4, tfSec: sec, fee: ST.settings.fee / 100 });
      const bt = NT.backtest(cs, NT.strategies[id], NT.defaultParams(id), { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: sec });
      const rets = bt.trades.filter((t) => t.side === 'sell' && Number.isFinite(t.pnl)).map((t) => t.pnl / Math.max(1, (t.cost || t.usd || (t.price * t.qty) || 10000)));
      U.quant = { id, sym: s, wf, mc: P5.monteCarlo(rets, 1000, 7), n: rets.length };
    } catch (e) { U.quant = { id, sym: s, err: e.message }; }
    U.qBusy = false; render(true);
  };
  const importPine = () => {
    const src = ($('#p5Pine') || {}).value || ''; cfg().pine = src.slice(0, 20000); saveState();
    const r = P5.pineImport(src);
    if (r.ok) { let id = null; try { id = typeof Builder !== 'undefined' && Builder.save ? Builder.save(Object.assign({}, r.spec, { author: 'Pine import' })) : NT.Spec.register(r.spec); } catch (e) { U.pineOut = `<div class="note dn">${esc(e.message)}</div>`; return render(true); } /* saved like a builder strategy: survives reloads */ U.pineOut = `<div class="note up">✓ Imported “${esc(r.spec.name)}”${id ? ' as ' + esc(String(id)) : ''}: ${esc(NT.Spec.describe ? NT.Spec.describe(r.spec) : '')}</div>`; if (typeof toast === 'function') toast(`🧪 Pine strategy “${esc(r.spec.name)}” added to your strategies`, 'up'); }
    else U.pineOut = `<div class="note dn">Could not import:</div><ul class="note">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
    if (r.unsupported.length) U.pineOut += `<div class="note">Skipped (not supported): ${r.unsupported.map((x) => `<code>${esc(x)}</code>`).join(' · ')}</div>`;
    render(true);
  };

  /* ══ 8. arbitrage, funding / OI, liquidation heat map ══ */
  const ARB = ['BTC', 'ETH', 'SOL', 'DOGE'], KR = { BTC: 'XBTUSD', ETH: 'ETHUSD', SOL: 'SOLUSD', DOGE: 'XDGUSD' };
  const loadArb = async () => {
    if (U.arbBusy || Date.now() - U.arbTs < 15000) return; U.arbBusy = true;
    await Promise.all(ARB.map(async (b) => {
      const q = {}, n = (x) => { const v = +x; return Number.isFinite(v) && v > 0 ? v : null; };
      await Promise.all([
        J.get(`https://api.exchange.coinbase.com/products/${b}-USD/ticker`, { timeout: 6000 }).then((j) => { if (n(j.bid) && n(j.ask)) q.Coinbase = { bid: n(j.bid), ask: n(j.ask) }; }).catch(() => {}),
        J.get(`https://api.kraken.com/0/public/Ticker?pair=${KR[b]}`, { timeout: 6000 }).then((j) => { const r = j && j.result && Object.values(j.result)[0]; if (r && n(r.b[0]) && n(r.a[0])) q.Kraken = { bid: n(r.b[0]), ask: n(r.a[0]) }; }).catch(() => {}),
        J.get(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${b}USDT`, { timeout: 6000 }).then((j) => { if (n(j.bidPrice) && n(j.askPrice)) q['Binance (USDT)'] = { bid: n(j.bidPrice), ask: n(j.askPrice) }; }).catch(() => {}),
      ]);
      U.arb[b] = { q, r: P5.arb(q, 10), ts: Date.now() };
    }));
    for (const b of ARB) { try { U.deriv[b] = await Deriv.get(b + '-USD'); } catch (e) { U.deriv[b] = null; } }
    U.arbTs = Date.now(); U.arbBusy = false; if (curTab === 'desk' && cfg().sec === 'deriv') render(true);
  };
  R.deriv = () => {
    loadArb(); const s = sel(), p = px(s);
    const rows = ARB.map((b) => { const a = U.arb[b]; if (!a) return `<tr><td>${b}</td><td colspan="5" class="note">loading…</td></tr>`; const r = a.r; return `<tr><td><b>${b}</b></td><td>${Object.entries(a.q).map(([k, v]) => `${esc(k)} ${esc(NT.fmtPrice(v.bid))}/${esc(NT.fmtPrice(v.ask))}`).join('<br>') || '<span class="note">no venues reachable</span>'}</td><td>${r ? esc(r.buy) : '–'}</td><td>${r ? esc(r.sell) : '–'}</td><td>${r ? esc(r.grossBps.toFixed(1)) + ' bps' : '–'}</td><td class="${r && r.ok ? 'up' : 'dn'}">${r ? esc(r.netBps.toFixed(1)) + ' bps' + (r.ok ? ' ✓' : '') : '–'}</td></tr>`; }).join('');
    const der = ARB.map((b) => { const v = U.deriv[b]; return `<tr><td><b>${b}</b></td><td class="${v && v.funding8h > 0.03 ? 'dn' : v && v.funding8h < 0 ? 'up' : ''}">${v && v.funding8h != null ? esc(v.funding8h.toFixed(4)) + '%' : '–'}</td><td>${v && v.oiUsd ? '$' + esc(NT.fmtCompact(v.oiUsd)) : '–'}</td><td>${v && v.ls != null ? esc(v.ls.toFixed(2)) : '–'}</td><td class="note">${v ? esc(Deriv.read(v)) : '<span class="note">unavailable</span>'}</td></tr>`; }).join('');
    return `<div class="p5-grid2">${panel('Multi-exchange arbitrage scanner (taker fees 10 bps per side)', `<table class="p5-tbl"><thead><tr><th>Coin</th><th>Bid / ask by venue</th><th>Buy on</th><th>Sell on</th><th>Gross</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table><div class="note">Binance quotes USDT, the others USD: a few bps of the gap can be the USDT basis, not free money.</div>`)}
      <div>${panel('Perpetual funding &amp; open interest', `<table class="p5-tbl"><thead><tr><th>Coin</th><th>Funding / 8h</th><th>Open interest</th><th>Long/short</th><th>Reading</th></tr></thead><tbody>${der}</tbody></table>`)}
      ${panel(`Liquidation heat map · ${esc(baseOf(s))} (estimated)`, isStock(s) || isOnchain(s) ? '<div class="note">Liquidation levels apply to leveraged crypto perps: open a crypto market.</div>' : `<canvas id="p5Liq" class="p5-cv tall" aria-label="Liquidation heat map"></canvas><div class="note">Where 5×–100× longs (below) and shorts (above) opened over the last 48 hours would be liquidated, weighted by volume. Brighter = more liquidation fuel. Current price ${esc(fmtP(p))}.</div>`)}</div></div>`;
  };
  AFTER.deriv = () => {
    const cv = $('#p5Liq'); if (!cv) return; const s = sel(), st = typeof Stores !== 'undefined' && (Stores.get(s + '|1h') || Stores.get(s + '|' + ST.tf)), p = px(s); if (!st || !(p > 0)) return;
    const ent = st.candles.slice(-48).map((k) => ({ p: k.c, w: k.v || 1 })), heat = P5.liqHeat(P5.liqBands(ent), p * 0.85, p * 1.15, 60);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 400, H = cv.clientHeight || 260; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const bh = H / heat.length; heat.forEach((h, i) => { const y = H - (i + 1) * bh, side = h.p < p; g.fillStyle = side ? `rgba(244,63,94,${(0.08 + h.k * 0.85).toFixed(2)})` : `rgba(34,197,94,${(0.08 + h.k * 0.85).toFixed(2)})`; g.fillRect(60, y, (W - 70) * (0.15 + h.k * 0.85), bh - 0.5); if (i % 6 === 0) { g.fillStyle = '#94a3b8'; g.font = '10px ui-monospace, monospace'; g.fillText(NT.fmtPrice(h.p), 2, y + bh); } });
    const yp = H - ((p - p * 0.85) / (p * 0.3)) * H; g.strokeStyle = '#facc15'; g.lineWidth = 2; g.beginPath(); g.moveTo(56, yp); g.lineTo(W, yp); g.stroke();
  };

  /* ══ 9. offline replay packs + encrypted backups ══ */
  const idb = () => U.idb || (U.idb = new Promise((res, rej) => { try { const r = indexedDB.open('exterm-p5', 1); r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = async (mode, f) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('packs', mode), r = f(t.objectStore('packs')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('storage aborted (full?)')); }); };
  U.listPacks = async () => { try { U.packs = (await tx('readonly', (s) => s.getAll())) || []; } catch (e) { U.packs = []; } if (curTab === 'desk' && cfg().sec === 'replay') render(true); return U.packs; };
  U.savePack = async () => {
    if ((U.packs || []).length >= 50) return toast('50 offline packs saved: delete one first', 'amb');
    const st = Stores.get(ST.sel + '|' + ST.tf); if (!st || st.candles.length < 80) return toast('Need 80+ bars on the chart to save an offline replay', 'amb');
    const pk = Object.assign(P5.packSession(ST.sel, ST.tf, st.candles), { id: ST.sel + '|' + ST.tf + '|' + Date.now() });
    try { await tx('readwrite', (s) => s.put(pk)); toast(`💾 Saved ${st.candles.length} ${esc(ST.tf)} bars of ${esc(baseOf(ST.sel))} for offline replay`, 'up'); } catch (e) { toast('Could not save: ' + esc(e.message), 'amb'); }
    return U.listPacks();
  };
  U.playPack = async (id) => {
    const pk = (U.packs || []).find((x) => x.id === id), u = pk && P5.unpackSession(pk); if (!u) return toast('That replay pack is damaged', 'amb');
    const st = getStore(u.sym, u.tf); st.merge(u.candles); st.loaded = true;
    openSym(u.sym); if (ST.tf !== u.tf) { ST.tf = u.tf; chartRefresh(true); }
    setTimeout(() => { if (typeof Replay !== 'undefined') Replay.enter(); }, 400);
  };
  const ownKey = (k) => typeof k === 'string' && (k === LS_KEY || /^(nt\.|novaterm)/.test(k)) && k !== 'nt.gtCool'; // DiskSync's ownership rule
  U.backup = async () => {
    const pass = ($('#p5Pass') || {}).value || '';
    try { const keys = typeof SafeStore !== 'undefined' ? SafeStore.payload() : {}; const txt = await P5.encrypt({ exterm: 15, ts: Date.now(), keys }, pass); if (!download('exterm-backup-' + new Date().toISOString().slice(0, 10) + '.exterm', txt, 'application/octet-stream')) throw new Error('Downloads are blocked here'); U.bkMsg = '✓ Encrypted backup downloaded. Keep the passphrase safe: it cannot be recovered.'; }
    catch (e) { U.bkMsg = '✗ ' + e.message; }
    const p = $('#p5Pass'); if (p) p.value = ''; render(true);
  };
  U.restore = async () => {
    const f = ($('#p5File') || {}).files, pass = ($('#p5Pass2') || {}).value || ''; if (!f || !f[0]) { U.bkMsg = '✗ Choose an .exterm file first'; return render(true); }
    if (f[0].size > 50e6) { U.bkMsg = '✗ File too large'; return render(true); }
    try { const obj = await P5.decrypt(await f[0].text(), pass), keys = P5.restoreKeys(obj, ownKey); if (!Object.keys(keys).length) throw new Error('The backup holds no ExTerm data'); U.pendingRestore = keys; U.bkMsg = `✓ Decrypted ${Object.keys(keys).length} storage entries from ${(() => { const d = new Date(+obj.ts || 0); return isNaN(d) ? 'an unknown date' : d.toISOString().slice(0, 16).replace('T', ' '); })()}. Press “Restore now” to replace this browser’s data and reload.`; }
    catch (e) { U.bkMsg = '✗ ' + e.message; }
    const p = $('#p5Pass2'); if (p) p.value = ''; render(true);
  };
  const applyRestore = () => {
    const k = U.pendingRestore; if (!k) return;
    const old = {}; for (let i = 0; i < localStorage.length; i++) { const a = localStorage.key(i); if (ownKey(a)) old[a] = localStorage.getItem(a); }
    try { for (const a of Object.keys(old)) if (!(a in k)) localStorage.removeItem(a); for (const [a, b] of Object.entries(k)) localStorage.setItem(a, b); localStorage.setItem('nt.savedAt', String(Date.now())); /* a full replace, newer than the launcher's disk mirror */ }
    catch (e) { try { for (let i = localStorage.length - 1; i >= 0; i--) { const a = localStorage.key(i); if (ownKey(a)) localStorage.removeItem(a); } for (const [a, b] of Object.entries(old)) localStorage.setItem(a, b); } catch (x) { /* best effort */ } U.bkMsg = '✗ Storage is full, nothing was changed: ' + e.message; return render(true); }
    // until the reload, nothing (unload savers, DiskSync, timers) may write ExTerm's keys over the restored data
    const _si = Storage.prototype.setItem; Storage.prototype.setItem = function (a, b) { if (this === localStorage && ownKey(a)) return; return _si.call(this, a, b); };
    location.reload(); };
  R.replay = () => {
    if (!U.packsLoaded) { U.packsLoaded = true; U.listPacks(); }
    return `<div class="p5-grid2">${panel('Offline replay mode', `<div class="note">Save the current chart’s candles in this browser (IndexedDB). Later, even with no internet, replay them bar by bar with the Bar Replay trainer.</div><button type="button" class="btn sm" data-p5="savepack">💾 Save ${esc(baseOf(sel()))} ${esc(ST.tf)} for offline replay</button>
       ${(U.packs || []).length ? `<table class="p5-tbl"><thead><tr><th>Market</th><th>Bars</th><th>Saved</th><th></th></tr></thead><tbody>${U.packs.slice().sort((a, b) => b.ts - a.ts).map((p) => `<tr><td>${esc(baseOf(p.sym))} ${esc(p.tf)}</td><td>${(p.c || []).length}</td><td>${esc(new Date(p.ts).toISOString().slice(0, 16).replace('T', ' '))}</td><td><button type="button" class="btn xs" data-pkplay="${esc(p.id)}">⏪ Replay</button> <button type="button" class="btn xs" data-pkdel="${esc(p.id)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="note">No saved sessions yet.</div>'}`)}
      ${panel('Encrypted full-state backup (.exterm)', `<div class="note">Everything ExTerm stores in this browser (watchlists, bots, paper accounts, journal, settings) encrypted with AES-256-GCM. The key comes from your passphrase (PBKDF2-SHA256, ${P5.KDF_ITER.toLocaleString()} rounds) and never leaves this page.</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin:6px 0"><input class="in" id="p5Pass" type="password" autocomplete="new-password" placeholder="Passphrase (8+ characters)" style="width:220px"><button type="button" class="btn sm" data-p5="backup">🔐 Download encrypted backup</button></div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><input class="in" id="p5File" type="file" accept=".exterm,application/json"><input class="in" id="p5Pass2" type="password" autocomplete="off" placeholder="Passphrase" style="width:160px"><button type="button" class="btn sm" data-p5="restore">Decrypt</button>${U.pendingRestore ? '<button type="button" class="btn sm amb" data-p5="applyrestore">Restore now &amp; reload</button>' : ''}</div>
        <div class="note" id="p5BkMsg">${esc(U.bkMsg || '')}</div>`)}</div>`;
  };

  /* ── events ── */
  function onClick(e) {
    const t = e.target.closest('button,[data-ov]'); if (!t) return; const d = t.dataset, c = cfg();
    if (d.lad) return ladderClick(d.lad, +d.p);
    if (d.optbuy) { const ch = U.chain, k = +d.k, leg = ch && (d.optbuy === 'call' ? ch.calls : ch.puts).find((x) => x.strike === k); if (!leg) return; const prem = leg.ask > 0 ? leg.ask : leg.last; const r = P5.optOrder({ sym: ch.sym, type: d.optbuy, strike: k, exp: ch.exp, qty: c.optQty || 1, prem }, c.optCash); if (!r.ok) return toast(esc(r.err), 'amb'); c.optCash -= r.cost; c.opts.push(Object.assign(r.pos, { id: NT.uid() })); saveState(); toast(`🧾 Bought ${esc(String(r.pos.qty))} ${esc(ch.sym)} ${esc(NT.fmtPrice(k))} ${d.optbuy}${r.pos.qty > 1 ? 's' : ''} @ ${esc(prem.toFixed(2))}${ch.sim ? ' (model price)' : ''}`, 'up'); return render(true); }
    if (d.optclose != null) { const i = c.opts.findIndex((x) => x.id === d.optclose), p = c.opts[i]; if (!p) return; const m = P5.optMark(p, optMid); c.optCash += m.value; c.opts.splice(i, 1); saveState(); toast(`🧾 Closed ${esc(p.sym)} ${p.type}: ${esc(NT.fmtUSD(m.pnl))}`, m.pnl >= 0 ? 'up' : 'amb'); return render(true); }
    if (d.swuse) { c.acct = d.swuse; c.sec = 'dom'; saveState(); return render(true); }
    if (d.swclose) { const i = c.subs.findIndex((w) => w.id === d.swclose); if (i < 0) return; const w = c.subs[i]; if (Object.keys(w.acct.pos).length) return toast('Close the sub-wallet’s positions first', 'amb'); ACC.cash += P5.subClose(w.acct).refund; c.subs.splice(i, 1); if (c.acct === w.id) c.acct = 'main'; saveState(); return render(true); }
    if (d.pkplay) return U.playPack(d.pkplay);
    if (d.pkdel) return tx('readwrite', (s) => s.delete(d.pkdel)).then(U.listPacks);
    const a = d.p5;
    if (a === 'ratio') { c.ratio = { a: normSym($('#p5Ra').value), b: normSym($('#p5Rb').value) }; saveState(); return render(true); }
    if (a === 'optretry') { if (U.chainTried) delete U.chainTried[optSym()]; return loadChain(); }
    if (a === 'pop') return popout();
    if (a === 'flex') return flex();
    if (a === 'swnew') { const r = P5.subCreate(c.subs, $('#p5SwName').value, +$('#p5SwUsd').value, ACC.cash); if (!r.ok) return toast(esc(r.err), 'amb'); ACC.cash -= r.wallet.alloc; r.wallet.acct = new NT.Account({ cash: r.wallet.alloc, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100 }); c.subs.push(r.wallet); saveState(); toast(`🗂 Sub-wallet “${esc(r.wallet.name)}” funded with ${esc(NT.fmtUSD(r.wallet.alloc))}`, 'up'); return render(true); }
    if (a === 'wfo') return runQuant();
    if (a === 'pine') return importPine();
    if (a === 'savepack') return U.savePack();
    if (a === 'backup') return U.backup();
    if (a === 'restore') return U.restore();
    if (a === 'applyrestore') return applyRestore();
  }
  function onChange(e) {
    const t = e.target, c = cfg();
    if (t.dataset.ov) { c.ov[t.dataset.ov] = t.checked; saveState(); if (typeof chart !== 'undefined' && chart && chart.invalidate) chart.invalidate(); return; }
    if (t.id === 'p5Usd') c.usd = Math.max(10, +t.value || 500);
    else if (t.id === 'p5Acct') c.acct = t.value;
    else if (t.id === 'p5Exp') loadChain(+t.value);
    else if (t.id === 'p5OptQty') c.optQty = Math.min(100, Math.max(1, Math.floor(+t.value) || 1));
    else if (t.id === 'p5Link') { c.link = t.checked; if (c.link) bc(); }
    else if (t.id === 'p5Guard') c.guard.on = t.checked;
    else if (t.id === 'p5GuardMax') c.guard.max = Math.min(0.99, Math.max(0.5, +t.value || 0.85));
    else if (t.id === 'p5Whale') c.whale = Math.max(1000, +t.value || 100000);
    else if (t.id === 'p5Prof') c.prof = t.value;
    else if (t.id === 'p5Qs') c.qs = t.value;
    else return;
    saveState(); render(true);
  }

  /* ── Ctrl+K palette: Pro Desk commands ── */
  if (typeof palRender === 'function') {
    const _pr = palRender;
    palRender = function () {
      _pr.apply(this, arguments);
      const q = ($('#palIn').value || '').trim().toLowerCase(), go = (sec) => () => { cfg().sec = sec; saveState(); showTab('desk'); };
      const cmds = [['DOM ladder · click-to-trade', 'dom ladder depth order book click trade cvd footprint', go('dom')], ['Options chain · max pain · GEX', 'options chain max pain gex gamma calls puts', go('opt')], ['Ratio chart · multi-chart grid', 'ratio synthetic sol/eth nvda/amd grid sync', go('ratio')], ['Pop out chart to a new window', 'pop out popout window monitor broadcast', popout], ['Correlation guard · sub-wallets · regime', 'risk correlation guard sub wallet regime', go('risk')], ['Whale tape · wallet profiler', 'whale tape time sales profiler smart money', go('tape')], ['Download PNG flex card', 'flex card png share image', flex], ['MTF matrix · chart overlays', 'mtf multi timeframe fib pdh pdl vpvr poc fomc earnings form 4 extended hours', go('intel')], ['Walk-forward · Monte Carlo · Pine import', 'walk forward monte carlo pine script import quant', go('quant')], ['Arbitrage · funding / OI · liquidations', 'arbitrage arb funding open interest liquidation heat', go('deriv')], ['Offline replay · encrypted backup', 'offline replay backup encrypted exterm restore', go('replay')]];
      for (const [l, k, f] of cmds) if (!q || l.toLowerCase().includes(q) || k.includes(q)) palItems.push({ l: '🏛 ' + l, r: 'pro desk', f });
      $('#palList').innerHTML = palItems.map((x, i) => `<div class="it ${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${esc(x.l)}</span><span class="note">${esc(x.r)}</span></div>`).join('');
    };
  }

  U.subEquity = () => { let x = 0; for (const w of (ST.p5 && ST.p5.subs) || []) if (w.acct && w.acct.equity) x += w.acct.equity(Object.fromEntries(Object.keys(w.acct.pos || {}).map((k) => [k, px(k)]))); return x; };
  if (typeof renderHeader === 'function') { const _rh = renderHeader; renderHeader = function () { const r = _rh.apply(this, arguments); const x = U.subEquity(); if (x > 0) { const eq = ACC.equity(priceMap()) + x, pnl = eq - ACC.cash0; FX3.tween($('#eqVal'), eq, (v) => NT.fmtUSD(v)); const e = $('#eqPnl'); e.textContent = NT.fmtPct((pnl / ACC.cash0) * 100); e.className = 'chg ' + cls(pnl); } return r; }; } // carved-out paper cash is still yours
  U.start = () => {
    mount();
    if (/^#popout=/.test(location.hash)) { document.body.classList.add('popout'); bc(); let s = ''; try { s = decodeURIComponent(location.hash.slice(8)); } catch (e) { /* malformed link */ } if (/^[A-Za-z0-9:._^\-]{1,100}$/.test(s)) setTimeout(() => { try { U.applying = true; openSym(s); } finally { U.applying = false; } }, 1500); }
    if ((ST.p5 && ST.p5.link)) bc();
    window.addEventListener('beforeunload', () => post({ k: 'bye' }));
    // share the crosshair time with linked windows (throttled)
    document.addEventListener('mousemove', () => { if (!(cfg().link || document.body.classList.contains('popout')) || typeof chart === 'undefined' || !chart || !chart.mouse || !chart.L || !chart.L.D) return; const pt = chart.toTP(chart.mouse.x, chart.mouse.y); if (!pt || Date.now() - (U._xT || 0) < 80) return; U._xT = Date.now(); post({ k: 'cross', t: pt.t }); }, { passive: true });
    setInterval(() => { if (curTab === 'desk' && !document.hidden) { if (cfg().sec === 'dom') { pollBook(); render(false); } } }, 1000);
  };
  U.cfg = cfg; U.R = R; U.overlays = overlays; U.guardCheck = guardCheck; U.post = post; U.onBc = onBc; U.loadChain = loadChain;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined') P5UI.start();
