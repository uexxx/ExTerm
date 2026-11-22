/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.5 UI. Maths in V165 (v165core.js); this file only wires it into the existing app:
   · AI Bridge tab (3 cards): Copy Live Context for Any AI · Paste & Verify AI Output · Live 127.0.0.1 AI & Bot Firewall
   · chart: dashed AI ghost lines with R:R and $ axis badges (pinned ▲/▼ when off screen), 1-click staging, Share Setup Card
   · receipts: polls the launcher's /api/llm-signal queue, runs the deterministic firewall, routes to ghost lines, the PAPER
     shadow slot or an armed slot (paper fill; the v16.0–16.4 four-gate cockpit still decides anything live)
   · Whales tab: AI-Vetted Copy Engine (consensus, drift shield, $ risk + ATR stop, exit modes, per-leader cap, AI vetting)
   · Signed Receipt Ledger: Human vs. AI / Bot attribution + Share Setup Card button
   Strict CSP: listeners attached here, every dynamic string through esc(). */
const V165UI = (() => {
  const KEY = 'exterm.v165.cfg';
  const U = { cfg: null, ghosts: {}, drawn: null, receipts: [], seq: -1, counts: { accepted: 0, rejected: 0 }, shadow: [], slip: [], vets: {}, fills: [], copyLog: [], copyDone: new Set(), copyPos: {}, leaderPnl: [],
    key: null, lastCopy: '', lastClip: '', clipDenied: false, pine: { src: '', changes: [] }, lastVal: null, lastIdea: null, card: null, cardTexts: [], polling: false, stats: { ghosts: 0, rejected: 0, shadow: 0, routed: 0, copies: 0, blocks: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const DEF = () => ({ provider: 'grok', preset: 'chart', mode: 'saver', tpl: 'grok', autoClip: false, guard: V165.GUARD_DEF(), copy: V165.COPY_DEF() });
  const load = () => {
    let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; } const d = DEF();
    if (o && typeof o === 'object') {
      if (V165.PROVIDER_IDS.includes(o.provider)) d.provider = o.provider; if (V165.PRESETS.some((p) => p[0] === o.preset)) d.preset = o.preset; if (o.mode === 'full' || o.mode === 'saver') d.mode = o.mode; if (V165.TEMPLATES[o.tpl]) d.tpl = o.tpl; d.autoClip = o.autoClip === true;
      for (const [src, dst] of [[o.guard, d.guard], [o.copy, d.copy]]) if (src && typeof src === 'object') for (const k of Object.keys(dst)) if (k !== 'muted' && typeof src[k] === typeof dst[k]) dst[k] = src[k];
      if (o.copy && o.copy.muted && typeof o.copy.muted === 'object') for (const [a, v] of Object.entries(o.copy.muted)) if (/^\w{20,80}$/.test(a) && Number.isInteger(v)) d.copy.muted[a] = v;
    }
    d.guard.mandatorySL = true; // never switchable: the launcher rejects unstopped proposals anyway
    U.cfg = d;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U.cfg)); } catch (e) { /* session only */ } };
  const fp = (v) => (v > 0 ? (v < 0.01 ? NT.fmtTiny(v) : NT.fmtPrice(v)) : '–');
  const svg = (d, c) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${c || 'v165-ic'}">${d}</svg>`;
  const IC = {
    bridge: '<path d="M3 15c3-6 15-6 18 0M3 15h18M7 15v4M17 15v4M12 9.5V19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    ctx: '<rect x="4" y="4" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h5M8 11h5M8 14h3M18 8v12H8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    paste: '<path d="M8 4h8v3H8zM6 6H5v14h14V6h-1M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    share: '<circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke="currentColor" stroke-width="1.6"/>',
    copy: '<path d="M4 17l5-5 4 3 7-8M15 7h5v5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const copyText = (txt, what) => { U.lastCopy = txt; try { navigator.clipboard.writeText(txt).then(() => toast(esc(what) + ' copied', 'acc'), () => toast(esc(what) + ' ready below (clipboard blocked: select and copy it)', 'amb')); } catch (e) { toast(esc(what) + ' ready below (clipboard blocked)', 'amb'); } };
  const led = (kind, o) => { try { if (typeof V160UI !== 'undefined' && V160UI.led) V160UI.led(kind, o); } catch (e) { /* ledger optional */ } };

  /* ══ data helpers ══ */
  const storeBars = (sym, tf, n) => { try { const s = getStore(sym, tf); if (s.candles.length < (n || 60) && s.load && !s.loading) s.load(Math.max(200, n || 60)); return s.candles.slice(-600); } catch (e) { return []; } };
  const barsOf = (sym) => (typeof chart !== 'undefined' && chart && sym === ST.sel && chart.data && chart.data.length >= 30 ? chart.data.slice(-600) : storeBars(sym, sym === ST.sel ? ST.tf : '1h', 120));
  const bookOf = (sym) => (typeof V163UI !== 'undefined' && V163UI.books && V163UI.books[sym]) || (typeof P5UI !== 'undefined' && P5UI.book && P5UI.book.sym === sym ? P5UI.book : null);
  const depthOf = (sym, p0) => { const b = bookOf(sym); if (!b || !Array.isArray(b.bids) || !Array.isArray(b.asks) || !(p0 > 0)) return 0; let d = 0; for (const l of b.bids.concat(b.asks)) if (Math.abs(+l[0] / p0 - 1) <= 0.02) d += +l[0] * (+l[1] || 0); return d; };
  const atrOf = (sym) => V165.atr(barsOf(sym).filter((x) => x && x.c > 0), 14);
  const modeOf = (s) => (/^oc:/.test(s) ? 'onchain' : /-(USD|USDT|USDC)$/i.test(s) ? 'crypto' : 'stocks');
  const symOfCoin = (c) => String(c || '').toUpperCase() + '-USD';
  const resolve = (raw) => {
    const s = String(raw || '').trim(); if (!s) return null; if (/^oc:/i.test(s)) return 'oc:' + s.slice(3); if (/-(USD|USDT|USDC)$/i.test(s)) return s.toUpperCase();
    try { const c = resolveSym(s.replace(/[/](USDT?|USDC)$/i, ''), 'crypto'); if (c) return c; } catch (e) { /* not crypto */ }
    try { const k = resolveSym(s, 'stocks'); if (k) return k; } catch (e) { /* not a stock */ }
    return /^[A-Z]{2,6}$/i.test(s) ? s.toUpperCase() + '-USD' : null;
  };
  const openSym = (sym) => { showTab('markets'); const m = modeOf(sym); if (ST.mode !== m && typeof setMode === 'function') setMode(m, sym); else if (ST.sel !== sym) selectSym(sym); };

  /* ══ context packets ══ */
  const ctxChart = () => {
    const sym = ST.sel, bars = barsOf(sym), now = Date.now(), tr = {};
    for (const tf of ['1m', '5m', '1h', '4h']) tr[tf] = V165.trend(tf === ST.tf ? bars : storeBars(sym, tf, 60));
    let avwap = null, avKind = 'session'; const a = typeof V164UI !== 'undefined' && V164UI.av ? V164UI.av[sym] : null;
    if (a && bars.length) { const i = bars.findIndex((b) => b.t >= a.t); if (i >= 0) { const av = V164.avwap(bars, i); avwap = av[av.length - 1]; avKind = a.kind || 'anchor'; } }
    if (!(avwap > 0)) avwap = V165.vwap(bars.slice(-96));
    const tape = typeof V164UI !== 'undefined' ? V164UI.tape : [], t10 = V164.tapeDelta(tape, now, 10), t60 = V164.tapeDelta(tape, now, 60);
    return { sym: baseOf(sym), tf: ST.tf, trend: tr, stats: V165.chartStats(bars) || {}, avwap, avKind, t10: t10.ratio == null ? null : t10.delta, t60: t60.ratio == null ? null : t60.delta, walls: V165.walls(bookOf(sym), 3) };
  };
  const ctxChain = () => {
    const sym = ST.sel, oc = /^oc:/.test(sym) && typeof OC !== 'undefined', st = oc ? OC.stats[sym] || {} : {}, me = oc ? OC.meta[sym] || {} : {}, p0 = oc && OC.parse ? OC.parse(sym) : null;
    return { sym: oc ? (me.s || baseOf(sym)) : baseOf(sym) + ' (not an on-chain token: open one from the DEX tab for full due diligence)', chain: p0 ? p0.chain : '', addr: me.addr || (p0 ? p0.pool : ''), price: px(sym), liq: st.liq, fdv: st.fdv || st.mcap, v5m: st.vol5m, v1h: st.vol1h, v24: st.vol24, holders: st.holders, top10: me.top10, mint: me.mintOff == null ? null : !me.mintOff, lpLocked: me.lpLocked == null ? null : !!me.lpLocked, struct4h: V165.trend(storeBars(sym, '4h', 60)) };
  };
  const ctxWatch = () => (ST.watch || []).slice(0, 5).map((s) => { const b = storeBars(s, '1h', 60); return { sym: baseOf(s), last: px(s), chg: chg24(s), trend: V165.trend(b), rsi: V165.rsi(b.map((x) => x.c), 14), atr: V165.atr(b, 14) }; });
  const ctxOpt = () => {
    const sym = ST.sel, liqs = []; try { if (typeof LeaderUI !== 'undefined' && LeaderUI.det) for (const d of LeaderUI.det.values()) for (const m of d.magnets || []) if (symOfCoin(m.coin) === sym) liqs.push({ p: m.px || m.price || m.liq, side: m.side, usd: m.ntl || m.usd }); } catch (e) { /* leaderboards optional */ }
    const ch = typeof P5UI !== 'undefined' && P5UI.chain && P5UI.chain.sym === sym ? P5UI.chain : null;
    return { sym: baseOf(sym), price: px(sym), iv: ch && ch.atmIv, skew: ch && ch.skew, maxPain: ch && ch.maxPain, pin: ch && ch.pin, liqs: liqs.filter((l) => l.p > 0).sort((a, b) => (b.usd || 0) - (a.usd || 0)) };
  };
  const attrRows = () => {
    const rows = []; try { for (const t of ACC.trades || []) if (t.side === 'sell' && Number.isFinite(t.pnl)) rows.push({ src: t.src, pnl: t.pnl }); for (const b of ST.bots || []) for (const t of (b.account && b.account.trades) || []) if (t.side === 'sell' && Number.isFinite(t.pnl)) rows.push({ src: 'quant', pnl: t.pnl }); } catch (e) { /* no account yet */ }
    return rows.concat(U.slip);
  };
  const ctxPost = () => { const L = typeof V160UI !== 'undefined' ? V160UI.ledger || [] : [], F = typeof V163C !== 'undefined' ? V163C.fills : []; let leaks = []; try { leaks = V164.leaks(L, F).findings || []; } catch (e) { leaks = []; } return { receipts: L.length, blocked: typeof V160UI !== 'undefined' && V160UI.stats ? V160UI.stats.blocked : 0, rejected: U.counts.rejected, attr: V165.attribution(attrRows()), leaks }; };
  const packet = (k) => {
    const m = U.cfg.mode, body = k === 'pkChart' ? V165.packetChart(ctxChart(), m) : k === 'pkChain' ? V165.packetOnchain(ctxChain(), m) : k === 'pkWatch' ? V165.packetWatch(ctxWatch(), m) : k === 'pkOpt' ? V165.packetOptions(ctxOpt(), m) : V165.packetPost(ctxPost(), m);
    return V165.wrap(U.cfg.provider, k === 'pkChain' && U.cfg.preset === 'chart' ? 'rug' : k === 'pkPost' && U.cfg.preset === 'chart' ? 'leak' : U.cfg.preset, body, m);
  };

  /* ══ ghost lines ══ */
  const setGhost = (idea, source, switchChart) => {
    const sym = resolve(idea.symbol); if (!sym) return { ok: false, errors: ['Unknown symbol “' + idea.symbol + '”'] };
    const chk = V165.checkIdea(idea, atrOf(sym), U.cfg.guard.minAtr); if (!chk.ok) return chk;
    const g = V165.ghost(Object.assign({}, idea, { symbol: sym }), U.cfg.guard.riskUsd); g.source = source || 'AI'; g.at = Date.now(); g.idea = Object.assign({}, idea, { symbol: sym }); g.check = chk;
    U.ghosts[sym] = g; U.stats.ghosts++; U.lastIdea = g.idea;
    if (switchChart) openSym(sym); if (typeof chart !== 'undefined' && chart) chart.invalidate();
    return Object.assign({}, chk, { sym, ghost: g });
  };
  const overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L || !L.py) return; const G = U.ghosts[ST.sel]; if (!G) { U.drawn = null; return; }
    const top = L.y0 + 4, bot = L.y0 + L.mainH - (L.volH || 0) - 6, x0 = L.Lm, xr = L.W - L.Rm, col = { entry: '#D4AF37', sl: '#f43f5e', tp: '#2fd08a' }, badges = [];
    g.save(); g.lineWidth = 1.4;
    for (const l of G.lines) {
      const y0 = L.py(l.p); if (!Number.isFinite(y0)) continue; const off = y0 < top ? 'up' : y0 > bot ? 'dn' : '', y = Math.max(top, Math.min(bot, y0));
      if (!off) { g.setLineDash([7, 5]); g.strokeStyle = col[l.k]; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(x0, y); g.lineTo(xr, y); g.stroke(); }
      const txt = (off === 'up' ? '▲ ' : off === 'dn' ? '▼ ' : '') + V165.badge(l); badges.push(txt);
      g.setLineDash([]); g.globalAlpha = 1; g.font = '600 10px ui-monospace, Menlo, Consolas, monospace'; const w = g.measureText(txt).width + 10, bx = Math.max(x0 + 2, xr - w - 4);
      g.fillStyle = 'rgba(10,10,12,.88)'; g.fillRect(bx, y - 8, w, 16); g.strokeStyle = col[l.k]; g.lineWidth = 1; g.strokeRect(bx + 0.5, y - 7.5, w - 1, 15); g.fillStyle = col[l.k]; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, bx + 5, y); g.textBaseline = 'alphabetic'; g.lineWidth = 1.4;
    }
    g.setLineDash([]); g.globalAlpha = 0.85; g.fillStyle = '#D4AF37'; g.font = '600 10px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`AI ghost · ${G.source} · ${G.side.toUpperCase()}`, x0 + 6, bot - 4); g.restore();
    U.drawn = { sym: ST.sel, n: badges.length, badges, at: Date.now() };
  };
  const stage = () => {
    const G = U.ghosts[ST.sel] || (U.lastIdea && U.ghosts[U.lastIdea.symbol]); if (!G) { toast('Paste an AI trade idea first', 'amb'); return false; }
    if (G.side !== 'long') { toast('The paper ticket stages longs; this short stays as ghost lines (route shorts through your own bot on 127.0.0.1).', 'amb', 7000); return false; }
    if (typeof ChartTrade === 'undefined') return false; const e = G.idea; openSym(G.sym);
    ChartTrade.draft = { sym: G.sym, entry: e.entry, sl: e.stop_loss, tp: (e.tp || [])[0] || e.entry + 2 * (e.entry - e.stop_loss), usd: Math.max(1, +(G.qty * e.entry).toFixed(2)) }; ChartTrade.changed(false);
    toast(`Staged on the chart: ${esc(baseOf(G.sym))} entry ${esc(fp(e.entry))}, stop ${esc(fp(e.stop_loss))}, $${esc(G.risk)} risk. Nothing is placed until you confirm.`, 'acc', 7000); return true;
  };

  /* ══ firewall receipts (launcher queue) ══ */
  const rcRow = (o) => { U.receipts.unshift(Object.assign({ t: Date.now() }, o)); if (U.receipts.length > 60) U.receipts.length = 60; };
  const lossPnls = () => (ACC.trades || []).filter((t) => t.side === 'sell' && Number.isFinite(t.pnl) && /^ai/.test(t.src || '')).map((t) => t.pnl);
  const handle = (rc, history) => {
    const P = rc.proposal || {}, src = P.source || 'bot', base = { id: rc.id, sig: String(rc.sig || '').slice(0, 16), src };
    if (rc.status === 'rejected') { U.counts.rejected++; U.stats.rejected++; rcRow(Object.assign(base, { sym: P.symbol || P.wallet || '?', side: P.side || '', status: 'rejected', why: (rc.reasons || []).join('; ') })); if (!history) led('ai-bridge', { status: 'rejected', key: rc.id, sig: rc.sig, detail: `${src}: ${P.symbol || '?'} ${(rc.reasons || []).join('; ')}` }); return; }
    U.counts.accepted++;
    if (P.kind === 'wallet_vet') { U.vets[P.wallet] = { approve: !!P.approve, confidence: +P.confidence || 0, src, at: Date.now() }; rcRow(Object.assign(base, { sym: P.wallet.slice(0, 6) + '…' + P.wallet.slice(-4), side: 'vet', status: P.approve ? 'approved' : 'vetoed', why: `${P.confidence}% · ${P.reason || ''}` })); if (!history) led('ai-bridge', { status: 'vet', key: rc.id, sig: rc.sig, detail: `${src} wallet vet ${P.wallet.slice(0, 10)}…: ${P.approve ? 'approve' : 'veto'} ${P.confidence}%` }); return; }
    if (history) { rcRow(Object.assign(base, { sym: P.symbol, side: P.side, status: 'history', why: 'received before this page opened (not re-routed)' })); return; }
    const sym = resolve(P.symbol), px0 = sym ? px(sym) : null, fw = V165.firewall(Object.assign({}, P, { symbol: sym || P.symbol }), { atr: sym ? atrOf(sym) : null, depth: sym ? depthOf(sym, px0 || P.entry) : 0, pnls: lossPnls() }, U.cfg.guard);
    const rr = fw.rr != null ? fw.rr.toFixed(2) + 'R' : '–';
    if (!sym || !fw.ok) { U.stats.rejected++; U.counts.rejected++; const why = !sym ? 'unknown symbol' : fw.reasons.join('; '); rcRow(Object.assign(base, { sym: P.symbol, side: P.side, status: 'rejected', why, rr })); led('ai-bridge', { status: 'rejected', key: rc.id, sig: rc.sig, detail: `${src}: ${P.symbol} ${why}` }); return; }
    if (fw.route === 'shadow') { U.stats.shadow++; U.shadow.unshift(Object.assign({}, fw.idea, { symbol: sym, src, ts: Date.now(), done: false })); if (U.shadow.length > 100) U.shadow.length = 100; rcRow(Object.assign(base, { sym, side: P.side, status: 'shadow', why: (fw.notes || []).join('; '), rr })); led('ai-bridge', { status: 'paper-shadow', key: rc.id, sig: rc.sig, detail: `${src}: ${baseOf(sym)} ${P.side} conf ${P.confidence || 0}% → PAPER shadow slot` }); return; }
    const gr = setGhost(fw.idea, 'AI Bridge · ' + src, false); if (!gr.ok) { rcRow(Object.assign(base, { sym, side: P.side, status: 'rejected', why: (gr.errors || []).join('; ') })); return; }
    if (fw.route === 'slot') {
      if (P.side === 'long' && px0 > 0) { const t = ACC.buy(sym, px0, Math.min(fw.notional, ACC.cash), Date.now(), { src: 'ai-bridge', slPx: fw.idea.stop_loss, tpPx: (fw.idea.tp || [])[0], reason: 'AI Bridge · ' + src }); if (t) { U.stats.routed++; U.slip.push({ src: 'ai-bridge', bps: V165.slipBps('long', P.entry, t.price) }); try { saveState(); } catch (e) { /* state */ } } }
      rcRow(Object.assign(base, { sym, side: P.side, status: 'slot ' + fw.slot, why: P.side === 'long' ? `paper fill, $${fw.riskUsd.toFixed(0)} risk${(fw.notes || []).length ? ' · ' + fw.notes.join('; ') : ''}` : 'short: ghost lines only (paper ticket is long-only)', rr }));
      led('ai-bridge', { status: 'routed', slot: fw.slot, key: rc.id, sig: rc.sig, detail: `${src}: ${baseOf(sym)} ${P.side} → Slot ${fw.slot} · $${fw.riskUsd.toFixed(0)} risk · ${rr}` }); return;
    }
    rcRow(Object.assign(base, { sym, side: P.side, status: 'ghost', why: `ghost lines · $${fw.riskUsd.toFixed(0)} risk${(fw.notes || []).length ? ' · ' + fw.notes.join('; ') : ''}`, rr }));
    led('ai-bridge', { status: 'ghost', key: rc.id, sig: rc.sig, detail: `${src}: ${baseOf(sym)} ${P.side} entry ${P.entry} stop ${P.stop_loss} · ${rr}` });
    if (ST.sel !== sym) toast(`AI Bridge: ${esc(src)} ghost lines ready on ${esc(baseOf(sym))} (${esc(rr)})`, 'acc');
  };
  const poll = async () => {
    if (U.polling || typeof J === 'undefined' || !J.proxy) return; U.polling = true;
    try { const r = await J.get('/api/llm-signal?since=' + Math.max(0, U.seq), { timeout: 3000 }); if (r && Array.isArray(r.items)) { const first = U.seq < 0; for (const rc of r.items) if (rc && rc.seq > U.seq) handle(rc, first); U.seq = Math.max(U.seq, +r.seq || 0); if (curTab === 'bridge') paintRc(); } }
    catch (e) { /* launcher off or older */ } finally { U.polling = false; }
  };
  const shadowStep = () => { for (let i = 0; i < U.shadow.length; i++) { const s = U.shadow[i]; if (s.done) continue; const p = px(s.symbol); if (p > 0) U.shadow[i] = V165.shadowStep(s, p, p); } };

  /* ══ AI Bridge tab ══ */
  const pills = (list, attr, cur) => list.map(([k, l]) => `<button type="button" class="v165-pill${k === cur ? ' on' : ''}" data-${attr}="${esc(k)}" aria-pressed="${k === cur}">${esc(l)}</button>`).join('');
  const tabHTML = () => `<div class="v165-banner" role="note">${svg(IC.bridge, 'v165-ic lg')}<div><b>Works With Any AI or Bot:</b> Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Python/Node Bots<div class="note">Zero custody: your exchange keys and funds stay outside both the AI and ExTerm. Every idea passes the same deterministic firewall.</div></div></div>
    <div class="v165-grid">
    <section class="panel v165-card" id="v165C1" aria-labelledby="v165H1"><div class="v165-h">${svg(IC.ctx)}<h3 id="v165H1">Copy Live Context for Any AI</h3></div><p class="note">1-click hallucination-free market grounding: real numbers from your chart, book and ledger.</p>
      <div class="v165-pills" role="group" aria-label="AI provider" id="v165Prov"></div>
      <div class="v165-pills sm" role="group" aria-label="Quick prompt presets" id="v165Pre"></div>
      <div class="seg v165-mode" role="group" aria-label="Packet size" id="v165Mode"></div>
      <div class="v165-acts">${[['pkChart', 'Copy Chart + Order-Book Packet'], ['pkChain', 'Copy On-Chain Due-Diligence Packet'], ['pkWatch', 'Copy Multi-Symbol Watchlist Comparison Packet'], ['pkOpt', 'Copy Options IV / Whale Liquidation Packet'], ['pkPost', 'Copy Session Post-Mortem Packet']].map(([k, l]) => `<button type="button" class="btn sm" data-v165a="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="note" id="v165Tok" role="status" aria-live="polite"></div><pre class="v161-pre mono v165-pre" id="v165Pk" tabindex="0" aria-label="Context packet preview"></pre></section>
    <section class="panel v165-card" id="v165C2" aria-labelledby="v165H2"><div class="v165-h">${svg(IC.paste)}<h3 id="v165H2">Paste &amp; Verify AI Output</h3></div><p class="note">Zero-code paste-back loop: any AI's answer becomes checked ghost lines, a screened watchlist or a hardened script.</p>
      <label class="note" for="v165Idea">AI trade idea (plain English or JSON)</label><textarea class="in" id="v165Idea" rows="3" placeholder="Long SOL at 142.50, stop 138.00, target 154.00"></textarea>
      <div class="v165-row"><button type="button" class="btn sm pri" data-v165a="idea">Paste AI Trade Idea → Instant Chart Ghost Lines</button><button type="button" class="btn sm" data-v165a="clip">Read clipboard</button><label class="v165-sw"><input type="checkbox" id="v165Auto"> Auto-Watch Clipboard for AI Trade Ideas</label></div>
      <div id="v165IdeaOut" class="v165-out" role="status" aria-live="polite"></div>
      <label class="note" for="v165Tk">AI Ticker / Contract Paste-Box ($TICKER, Solana or EVM addresses)</label><textarea class="in" id="v165Tk" rows="2" placeholder="Paste any AI or X-search answer: $WIF, $JUP, 0x…"></textarea>
      <div class="v165-row"><button type="button" class="btn sm" data-v165a="tickers">Screen &amp; Add Survivors to Watchlist</button><span class="note">drops &lt; $50k liquidity and active mint authority</span></div><div id="v165TkOut" class="v165-out" role="status" aria-live="polite"></div>
      <label class="note" for="v165Pine">Pine Script v5 from any AI</label><textarea class="in mono" id="v165Pine" rows="4" placeholder="//@version=5 …"></textarea>
      <div class="v165-row"><button type="button" class="btn sm" data-v165a="harden">Paste &amp; Harden AI Pine Script v5</button><button type="button" class="btn sm pri" data-v165a="pval">1-Click 17-Test Quant Validation</button><button type="button" class="btn sm" data-v165a="pdiag">Copy Failure Diagnostics for AI</button><button type="button" class="btn sm" data-v165a="sjson">Copy Shareable Strategy / Watchlist JSON</button></div>
      <div id="v165PineChk" class="v164-chk"></div><div id="v165PineOut" class="v165-out" role="status" aria-live="polite"></div><pre class="v161-pre mono v165-pre" id="v165PineSrc" tabindex="0" aria-label="Hardened Pine source" hidden></pre></section>
    <section class="panel v165-card" id="v165C3" aria-labelledby="v165H3"><div class="v165-h">${svg(IC.shield)}<h3 id="v165H3">Live 127.0.0.1 AI &amp; Bot Firewall</h3></div><p class="note">Grok · OpenAI · Anthropic · Ollama · CCXT · Freqtrade · Alpaca · Interactive Brokers bots POST proposals here; ExTerm decides.</p>
      <div class="v165-ep"><code id="v165Ep">POST http://127.0.0.1:${esc(location.port || 8765)}/llm-signal</code><span class="note">header X-ExTerm-Bridge: <span id="v165Key" class="mono">••••••••</span></span><button type="button" class="btn xs" data-v165a="keyCopy">Copy bridge key</button></div>
      <div class="v165-row"><button type="button" class="btn sm pri" data-v165a="guard">Apply AI Live Guardrail Profile</button><button type="button" class="btn sm" data-v165a="share">${svg(IC.share)} Share Setup Card</button></div>
      <div class="v165-guard" id="v165Guard"></div>
      <h4>Receipts</h4><div class="v165-tw"><table class="v165-t" id="v165Rc"><thead><tr><th>Time</th><th>Source</th><th>Idea</th><th>Status</th><th>R:R</th><th>Detail</th><th>Sig</th></tr></thead><tbody></tbody></table></div>
      <h4>Human vs. AI / Bot Execution Attribution</h4><div id="v165Attr"></div>
      <h4>Local Python starter templates</h4><div class="seg" role="group" aria-label="Template" id="v165Tpls"></div><pre class="v161-pre mono v165-pre" id="v165Tpl" tabindex="0" aria-label="Python template"></pre><button type="button" class="btn xs" data-v165a="tplCopy">Copy template</button></section>
    </div>`;
  let tab = null;
  const mountTab = () => {
    if (tab && tab.isConnected) return tab; const main = $1('main'), nav = $1('#nav'); if (!main || !nav) return null;
    if (!$1('#nav button[data-tab="bridge"]')) {
      const nb = document.createElement('button'); nb.type = 'button'; nb.dataset.tab = 'bridge'; nb.id = 'v165Nav'; nb.innerHTML = `<span class="ni">${svg(IC.bridge, 'v165-ni')}</span>AI Bridge`;
      const g = $1('#nav button[data-tab="grok"]'); if (g) { g.after(nb); if (g.style.order) nb.style.order = String((parseInt(g.style.order, 10) || 0) + 1); if (g.dataset.g) nb.dataset.g = g.dataset.g; } else nav.appendChild(nb);
      nb.addEventListener('click', () => showTab('bridge'));
    }
    tab = document.createElement('section'); tab.id = 'tab-bridge'; tab.className = 'tab v165-tab'; tab.innerHTML = tabHTML(); main.appendChild(tab);
    tab.addEventListener('click', onClick); tab.addEventListener('change', onChange); tab.addEventListener('input', onInput);
    TABS.bridge = { show: () => paint(), render: () => {} };
    paint(); return tab;
  };
  const guardHTML = () => { const G = U.cfg.guard, n = (k, l, step, min, max) => `<label><span>${esc(l)}</span><input class="in mono" type="number" data-v165g="${k}" value="${esc(G[k])}" step="${step}" min="${min}" max="${max}"></label>`;
    return `<div class="v165-gl"><span class="v165-lock" title="Always on">Mandatory Stop-Loss ON</span>${n('minAtr', 'Min stop (× ATR)', 0.1, 0, 10)}${n('depthMult', 'Liquidity depth ≥ × order', 0.5, 0, 50)}${n('cutAfter', 'Size cut after N losses', 1, 0, 20)}${n('cutPct', 'Size cut %', 5, 0, 90)}${n('riskUsd', '$ risk per idea', 10, 1, 1e6)}</div>
      <label class="v165-thr"><span>AI Confidence Threshold <b id="v165ThrV">${esc(G.threshold)}%</b></span><input type="range" min="0" max="100" step="1" id="v165Thr" value="${esc(G.threshold)}" aria-label="AI confidence threshold"></label>
      <div class="v165-row"><label class="v165-sw"><input type="checkbox" data-v165g="shadow"${G.shadow ? ' checked' : ''}> AI Shadow Slot (PAPER mode first)</label><div class="seg" role="group" aria-label="High-confidence route">${[['ghost', 'Ghost lines'], ['slot', 'Armed slot']].map(([k, l]) => `<button type="button" data-v165r="${k}" class="${G.route === k ? 'on' : ''}">${l}</button>`).join('')}</div><label class="v165-sl"><span>Slot</span><select class="in" data-v165g="slot">${[1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}"${G.slot === i ? ' selected' : ''}>Slot ${i}</option>`).join('')}</select></label></div>`; };
  const attrHTML = () => { const A = V165.attribution(attrRows()), row = (k, l) => { const a = A[k]; return `<tr data-v165attr="${k}"><td>${esc(l)}</td><td class="mono">${esc(a.n)}</td><td class="mono">${esc(a.n ? a.win.toFixed(1) + '%' : '–')}</td><td class="mono">${esc(a.n ? (a.pf == null ? '∞' : a.pf.toFixed(2)) : '–')}</td><td class="mono">${esc(a.bpsN ? a.bps.toFixed(1) : '–')}</td></tr>`; };
    return `<table class="v165-t v165-attr"><thead><tr><th>Source</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Slippage bps</th></tr></thead><tbody>${row('manual', 'Manual')}${row('quant', 'Quant')}${row('ai', 'AI Bridge')}${row('copy', 'Copy (AI-vetted)')}</tbody></table>`; };
  const paintRc = () => { const tb = $1('#v165Rc tbody'); if (!tb) return; tb.innerHTML = U.receipts.length ? U.receipts.slice(0, 25).map((r) => `<tr class="v165-st-${esc(String(r.status).split(' ')[0])}" data-v165rc="${esc(r.id)}"><td class="mono">${esc(new Date(r.t).toLocaleTimeString())}</td><td>${esc(r.src)}</td><td class="mono">${esc(baseOf(String(r.sym || '')))} ${esc(r.side || '')}</td><td><b>${esc(r.status)}</b></td><td class="mono">${esc(r.rr || '–')}</td><td>${esc(r.why || '')}</td><td class="mono">${esc(r.sig || '')}</td></tr>`).join('') : '<tr><td colspan="7" class="note">No proposals yet. Run a starter template or POST JSON to the endpoint above.</td></tr>'; const at = $1('#v165Attr'); if (at) at.innerHTML = attrHTML(); };
  const paint = () => {
    if (!tab) return; const c = U.cfg;
    $1('#v165Prov', tab).innerHTML = pills(V165.PROVIDERS, 'v165p', c.provider); $1('#v165Pre', tab).innerHTML = pills(V165.PRESETS, 'v165q', c.preset);
    $1('#v165Mode', tab).innerHTML = [['saver', 'Token-Saver (~120 tokens)'], ['full', 'Full Quant']].map(([k, l]) => `<button type="button" data-v165m="${k}" class="${c.mode === k ? 'on' : ''}" aria-pressed="${c.mode === k}">${l}</button>`).join('');
    $1('#v165Tpls', tab).innerHTML = V165.TEMPLATE_NAMES.map(([k, l]) => `<button type="button" data-v165t="${k}" class="${c.tpl === k ? 'on' : ''}">${esc(l)}</button>`).join('');
    const tp = $1('#v165Tpl', tab), src = V165.TEMPLATES[c.tpl].replace('http://127.0.0.1:8765', 'http://127.0.0.1:' + (location.port || 8765)); if (tp.textContent !== src) tp.textContent = src;
    $1('#v165Auto', tab).checked = c.autoClip; $1('#v165Guard', tab).innerHTML = guardHTML(); paintRc(); keyLoad();
  };
  const keyLoad = async () => { if (U.key || typeof J === 'undefined' || !J.proxy) return; try { const r = await J.get('/api/llm-signal/key', { timeout: 3000 }); if (r && r.key) { U.key = r.key; const k = $1('#v165Key'); if (k) k.textContent = r.key.slice(0, 4) + '••••' + r.key.slice(-2); } } catch (e) { /* launcher off */ } };
  const ideaOut = (h) => { const o = $1('#v165IdeaOut'); if (o) o.innerHTML = h; };
  const runIdea = (text, source) => {
    const idea = V165.parseIdea(text); if (!idea) { ideaOut('<p class="dn">No trade idea found. It needs a direction, a symbol and an entry, e.g. “Long SOL at 142.50, stop 138.00, target 154.00”, or JSON with symbol / side / entry / stop_loss / tp.</p>'); return null; }
    const r = setGhost(idea, source || V165.providerName(U.cfg.provider), true);
    if (!r.ok) { ideaOut(`<p class="dn"><b>Not plotted.</b> ${r.errors.map((e) => esc(e)).join(' ')}</p>`); return r; }
    const g = r.ghost; ideaOut(`<p><b>${esc(baseOf(r.sym))} ${esc(idea.side.toUpperCase())}</b> · entry <b class="mono">${esc(fp(idea.entry))}</b> · stop <b class="mono">${esc(fp(idea.stop_loss))}</b>${(idea.tp || []).map((t, i) => ` · TP${i + 1} <b class="mono">${esc(fp(t))}</b> (${r.rr[i] != null ? esc(r.rr[i].toFixed(2)) + 'R' : '–'})`).join('')}${r.atrs != null ? ` · stop ${esc(r.atrs.toFixed(2))} ATR` : ''}</p>${r.warns.map((w) => `<p class="warn note">⚠ ${esc(w)}</p>`).join('')}<p class="note">Dashed ghost lines are on the chart with $ badges for a $${esc(g.risk)} risk. Nothing is placed.</p><div class="v165-row"><button type="button" class="btn sm pri" data-v165a="stage">Stage on ticket</button><button type="button" class="btn sm" data-v165a="share">Share Setup Card</button><button type="button" class="btn sm" data-v165a="clear">Clear ghost lines</button></div>`);
    return r;
  };
  const tkOut = (h) => { const o = $1('#v165TkOut'); if (o) o.innerHTML = h; };
  U.tokenInfo = async (it) => {
    if (it.kind === 'ticker') { const s = resolve(it.id); return s && px(s) > 0 ? { sym: s } : null; }
    if (typeof Safety === 'undefined' || !Safety.scan) return null;
    const r = await Safety.scan(it.id, it.kind === 'evm' ? 'eth' : 'solana').catch(() => null); if (!r) return null;
    const pair = r.pair || r.dex || {}, liq = +((pair.liquidity && pair.liquidity.usd) || r.liq || 0), mint = r.mint ? !!r.mint.mintAuthority : (r.checks || []).some((c) => c.id === 'mint' && c.status === 'fail');
    const pool = pair.pairAddress, chain = pair.chainId === 'ethereum' ? 'eth' : pair.chainId; return { liq, mint, sym: pool && chain ? `oc:${chain}:${pool}` : null };
  };
  const runTickers = async () => {
    const ex = V165.extract(($1('#v165Tk') || {}).value), items = ex.tickers.map((id) => ({ id, kind: 'ticker' })).concat(ex.solana.map((id) => ({ id, kind: 'solana' })), ex.evm.map((id) => ({ id, kind: 'evm' })));
    if (!items.length) { tkOut('<p class="note">No $TICKER or contract address found.</p>'); return null; }
    tkOut(`<p class="note shimmer">Screening ${esc(items.length)} item${items.length > 1 ? 's' : ''}…</p>`); const info = {};
    await Promise.all(items.map(async (it) => { try { info[it.id] = await U.tokenInfo(it); } catch (e) { info[it.id] = null; } }));
    const r = V165.screen(items, info), added = [];
    for (const o of r.ok) if (o.sym && !ST.watch.includes(o.sym) && modeOf(o.sym) === ST.mode) { ST.watch.push(o.sym); added.push(o.sym); }
    if (added.length) { try { renderWatch(); saveState(); Feed.subscribe(added); } catch (e) { /* watchlist */ } }
    const other = r.ok.filter((o) => !added.includes(o.sym));
    tkOut(`<p><b>${esc(r.ok.length)} survivor${r.ok.length === 1 ? '' : 's'}</b>${added.length ? ` · added to this watchlist: ${added.map((s) => esc(baseOf(s))).join(', ')}` : ''}${other.length ? ` · other market or already listed: ${other.map((o) => esc(baseOf(o.sym))).join(', ')}` : ''}</p>${r.bad.length ? `<ul class="v164-ul">${r.bad.map((b) => `<li class="warn"><span class="mono">${esc(b.id.length > 14 ? b.id.slice(0, 6) + '…' + b.id.slice(-4) : b.id)}</span>: ${esc(b.why)}</li>`).join('')}</ul>` : ''}`);
    return Object.assign(r, { added });
  };
  const pineOut = (h) => { const o = $1('#v165PineOut'); if (o) o.innerHTML = h; };
  const paintPineChk = (src) => { const ck = V165.pineCheck(src), c = $1('#v165PineChk'); if (c) c.innerHTML = ck.rows.map((r) => `<span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${esc(r.k)}</span>`).join('') + (ck.repaint ? '<span class="bad">✗ look-ahead</span>' : '<span class="ok">✓ no repaint</span>'); return ck; };
  const harden = () => {
    const raw = ($1('#v165Pine') || {}).value || ''; if (!raw.trim()) { pineOut('<p class="note">Paste a Pine Script v5 strategy from any AI first.</p>'); return null; }
    const h = V165.hardenPine(raw, { risk: U.cfg.guard.riskUsd }); U.pine = h; const pre = $1('#v165PineSrc'); if (pre) { pre.hidden = false; pre.textContent = h.src; } const ck = paintPineChk(h.src);
    pineOut(`<p><b>Hardened</b> · ${esc(h.changes.length)} fix${h.changes.length === 1 ? '' : 'es'} applied${ck.ok ? ' · all 6 safety rules pass' : ''}.</p><ul class="v164-ul">${h.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul><button type="button" class="btn xs" data-v165a="pcopy">Copy hardened script</button>`); return h;
  };
  const validatePine = async () => {
    const h = U.pine.src ? U.pine : harden(); if (!h || !h.src) return null; const t = V165.pineToText(h.src), r = V164.nlToSpec(t.text);
    if (!r.ok || !t.rules) { pineOut('<p class="dn">Could not map this script\'s entry rules to the backtester (supported: RSI, EMA/SMA cross or above, VWAP, N-bar breakout, volume, MACD). Copy the diagnostics and ask your AI to use those building blocks.</p>'); U.lastVal = { name: 'unmapped script', checks: [], grade: 'n/a', sym: baseOf(ST.sel), tf: ST.tf }; return null; }
    const v = NT.Spec.validate(r.spec); if (!v.ok) { pineOut(`<p class="dn">${esc(v.errors[0])}</p>`); return null; }
    const spec = Object.assign({}, v.spec, { name: 'AI Pine: ' + t.text.slice(0, 40) }); let id; try { id = NT.Spec.register(spec); } catch (e) { pineOut(`<p class="dn">${esc(e.message)}</p>`); return null; }
    const tf = ST.tf && NT.TF[ST.tf] ? ST.tf : '1h'; pineOut(`<p class="note shimmer">Running the 17-test validation gate on ${esc(baseOf(ST.sel))} ${esc(tf)} (rules: ${esc(t.text)})…</p>`);
    try {
      const c = await History.get(ST.sel, NT.TF[tf], 3000); if (!c || c.length < 300) throw new Error('Validation needs at least 300 candles of history.');
      const res = await BTW.run({ type: 'validate', strat: id, params: {}, candles: c, o: { cash: 10000, fee: ST.settings.fee / 100, slip: ST.settings.slip / 100, tfSec: NT.TF[tf] } }), val = res.v || res, checks = val.checks || [], passed = checks.filter((x) => x.status === 'pass').length;
      U.lastVal = { name: spec.name, spec, checks, grade: val.grade, sym: baseOf(ST.sel), tf, passed, total: checks.length || 17, ts: Date.now() };
      const bad = checks.filter((x) => x.status !== 'pass');
      pineOut(`<div class="v164-grade"><span class="grade big g-${esc(String(val.grade).toLowerCase())}">${esc(val.grade)}</span><div><b>${esc(spec.name)}</b><div class="note">${esc(passed)}/${esc(checks.length)} gates passed · ${esc(val.verdict || '')}</div></div></div>${bad.length ? `<ul class="v164-ul">${bad.slice(0, 8).map((x) => `<li class="${x.status === 'fail' ? 'bad' : 'warn'}"><b>${esc(x.name)}</b>: ${esc(x.value)}</li>`).join('')}</ul>` : ''}`);
      return U.lastVal;
    } catch (e) { pineOut(`<p class="dn">${esc(e.message || e)}</p>`); return null; }
  };
  const shareJson = () => { const V = U.lastVal; const txt = V165.shareJSON(V && V.spec ? { spec: V.spec, passed: V.passed, total: V.total, grade: V.grade, ts: V.ts } : { watchlist: ST.watch, passed: 0, total: 17 }); copyText(txt, V && V.spec ? 'Shareable strategy JSON' : 'Shareable watchlist JSON'); return txt; };

  /* ══ Share Setup Card (Obsidian & Gold, balances and personal data masked) ══ */
  const setupNow = () => {
    const G = U.ghosts[ST.sel]; if (G) return { sym: ST.sel, tf: ST.tf, side: G.side, entry: G.idea.entry, sl: G.idea.stop_loss, tp: G.idea.tp, source: G.source };
    const p = ACC.pos[ST.sel]; if (p && p.qty > 0) return { sym: ST.sel, tf: ST.tf, side: 'long', entry: p.cost / p.qty, sl: p.sl, tp: p.tp ? [p.tp] : [], source: 'Manual' };
    const d = typeof ChartTrade !== 'undefined' && ChartTrade.draft && ChartTrade.draft.sym === ST.sel ? ChartTrade.draft : null; if (d) return { sym: ST.sel, tf: ST.tf, side: 'long', entry: d.entry, sl: d.sl, tp: d.tp ? [d.tp] : [], source: 'Manual draft' };
    return { sym: ST.sel, tf: ST.tf, side: 'long', entry: px(ST.sel), sl: null, tp: [], source: 'Chart' };
  };
  U.shareCard = (setup, noDownload) => {
    const S = setup || setupNow(), m = V165.cardModel(S), W = 1200, H = 675, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), texts = [];
    const T = (s, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(s, x, y); texts.push(String(s)); };
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b0b0f'); bg.addColorStop(1, '#16130a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#D4AF37'; g.lineWidth = 3; g.strokeRect(18, 18, W - 36, H - 36);
    T('ExTerm', 56, 92, '800 48px Inter, system-ui, sans-serif', '#D4AF37'); T('Setup Card', 56, 128, '600 20px Inter, system-ui, sans-serif', '#c9c3ad');
    T(`${m.sym}  ·  ${m.tf}  ·  ${m.side}`, W - 56, 92, '700 34px Inter, system-ui, sans-serif', '#f3efe2', 'right'); T(`R:R ${m.rr != null ? m.rr.toFixed(2) : '–'}  ·  ${m.source}`, W - 56, 128, '600 20px Inter, system-ui, sans-serif', '#D4AF37', 'right');
    const bars = barsOf(S.sym || ST.sel).slice(-120).filter((b) => b && b.c > 0), lv = [m.entry, m.sl].concat(m.tp).filter((x) => x > 0);
    const x0 = 56, x1 = W - 300, y0 = 170, y1 = H - 90, all = bars.map((b) => b.c).concat(lv), lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1, py = (p) => y1 - ((p - lo) / ((hi - lo) || 1)) * (y1 - y0);
    if (bars.length > 1) { g.strokeStyle = '#e8e2cc'; g.lineWidth = 2; g.beginPath(); bars.forEach((b, i) => { const x = x0 + (i / (bars.length - 1)) * (x1 - x0); if (i) g.lineTo(x, py(b.c)); else g.moveTo(x, py(b.c)); }); g.stroke(); }
    const line = (p, c, l) => { if (!(p > 0)) return; g.setLineDash([10, 7]); g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, py(p)); g.lineTo(x1, py(p)); g.stroke(); g.setLineDash([]); T(`${l} ${p}`, x1 + 16, py(p) + 7, '700 20px ui-monospace, Menlo, Consolas, monospace', c); };
    line(m.entry, '#D4AF37', 'Entry'); line(m.sl, '#f43f5e', 'Stop'); m.tp.forEach((t, i) => line(t, '#2fd08a', 'TP' + (i + 1)));
    T(m.masked, 56, H - 44, '500 16px Inter, system-ui, sans-serif', '#8f8a78'); T('Paper-first · zero custody · ExTerm', W - 56, H - 44, '500 16px Inter, system-ui, sans-serif', '#8f8a78', 'right');
    const url = cv.toDataURL('image/png'); U.card = { url, model: m }; U.cardTexts = texts;
    if (!noDownload) { try { const a = document.createElement('a'); a.href = url; a.download = `exterm-setup-${m.sym.replace(/[^\w-]/g, '')}-${m.tf}.png`; document.body.appendChild(a); a.click(); a.remove(); toast('⬇ Share Setup Card saved (balances and personal data masked)', 'acc'); } catch (e) { toast('Downloads are blocked here', 'amb'); } }
    return { url, model: m, texts };
  };

  /* ══ events ══ */
  const onClick = async (e) => {
    const p = e.target.closest('[data-v165p]'); if (p) { U.cfg.provider = p.dataset.v165p; save(); paint(); return; }
    const q = e.target.closest('[data-v165q]'); if (q) { U.cfg.preset = q.dataset.v165q; save(); paint(); return; }
    const m = e.target.closest('[data-v165m]'); if (m) { U.cfg.mode = m.dataset.v165m; save(); paint(); return; }
    const t = e.target.closest('[data-v165t]'); if (t) { U.cfg.tpl = t.dataset.v165t; save(); paint(); return; }
    const r = e.target.closest('[data-v165r]'); if (r) { U.cfg.guard.route = r.dataset.v165r; save(); paint(); return; }
    const b = e.target.closest('[data-v165a]'); if (!b) return; const k = b.dataset.v165a;
    if (/^pk/.test(k)) { const txt = packet(k), pre = $1('#v165Pk'); if (pre) pre.textContent = txt; const tk = $1('#v165Tok'); if (tk) tk.textContent = `≈ ${V165.estTokens(txt)} tokens · ${V165.providerName(U.cfg.provider)} · ${U.cfg.mode === 'full' ? 'Full Quant' : 'Token-Saver'}`; copyText(txt, b.textContent.replace(/^Copy /, '')); return; }
    if (k === 'idea') { runIdea(($1('#v165Idea') || {}).value); return; }
    if (k === 'clip') { try { const txt = await navigator.clipboard.readText(); $1('#v165Idea').value = txt.slice(0, 20000); runIdea(txt); } catch (x) { toast('Clipboard read was blocked: paste into the box instead', 'amb'); } return; }
    if (k === 'stage') { stage(); return; }
    if (k === 'clear') { delete U.ghosts[ST.sel]; if (U.lastIdea) delete U.ghosts[U.lastIdea.symbol]; if (typeof chart !== 'undefined' && chart) chart.invalidate(); ideaOut(''); return; }
    if (k === 'tickers') { await runTickers(); return; }
    if (k === 'harden') { harden(); return; }
    if (k === 'pcopy') { copyText(U.pine.src, 'Hardened Pine Script v5'); return; }
    if (k === 'pval') { await validatePine(); return; }
    if (k === 'pdiag') { const txt = V165.diagnostics(Object.assign({}, U.lastVal || { name: 'not validated yet' }, { pine: V165.pineCheck(U.pine.src || ($1('#v165Pine') || {}).value) })); copyText(txt, 'Failure diagnostics'); pineOut(`<pre class="v161-pre mono v165-pre">${esc(txt)}</pre>`); return; }
    if (k === 'sjson') { shareJson(); return; }
    if (k === 'guard') { U.cfg.guard = Object.assign(U.cfg.guard, V165.GUARD_AI(), { riskUsd: U.cfg.guard.riskUsd }); save(); paint(); toast('AI Live Guardrail Profile applied: mandatory stop, ≥ 1.5 ATR, ≥ 3× depth, 75% confidence, 50% size cut after 2 losses, AI Shadow Slot on', 'acc', 7000); return; }
    if (k === 'share') { U.shareCard(); return; }
    if (k === 'keyCopy') { await keyLoad(); if (U.key) copyText(U.key, 'Bridge key'); else toast('Start ExTerm with the launcher to get a bridge key', 'amb'); return; }
    if (k === 'tplCopy') copyText(($1('#v165Tpl') || {}).textContent || '', 'Python template');
  };
  const onChange = (e) => {
    const x = e.target; if (x.id === 'v165Auto') { U.cfg.autoClip = x.checked; U.clipDenied = false; save(); toast(x.checked ? 'Auto-Watch Clipboard on: copied AI trade ideas become ghost lines while ExTerm has focus' : 'Auto-Watch Clipboard off'); return; }
    const k = x.dataset && x.dataset.v165g; if (!k) return; const G = U.cfg.guard;
    if (k === 'shadow') G.shadow = x.checked; else if (k === 'slot') G.slot = Math.max(1, Math.min(6, +x.value | 0)); else { const v = parseFloat(x.value); if (Number.isFinite(v) && v >= 0) G[k] = v; }
    save();
  };
  const onInput = (e) => { if (e.target.id === 'v165Thr') { U.cfg.guard.threshold = Math.max(0, Math.min(100, +e.target.value | 0)); const v = $1('#v165ThrV'); if (v) v.textContent = U.cfg.guard.threshold + '%'; save(); } };
  const clipWatch = async () => {
    if (!U.cfg.autoClip || U.clipDenied || document.hidden || !document.hasFocus() || !navigator.clipboard || !navigator.clipboard.readText) return;
    try { const t = await navigator.clipboard.readText(); if (!t || t === U.lastClip || t === U.lastCopy) return; U.lastClip = t; if (V165.parseIdea(t)) { const box = $1('#v165Idea'); if (box) box.value = t.slice(0, 20000); runIdea(t, 'Clipboard'); } }
    catch (x) { U.clipDenied = true; toast('Clipboard watching needs clipboard permission: allow it or paste manually', 'amb'); }
  };

  /* ══ AI-Vetted Copy Engine (Whales tab) ══ */
  let cp = null;
  const copyHTML = () => { const C = U.cfg.copy, n = (k, l, step) => `<label><span>${esc(l)}</span><input class="in mono" type="number" data-v165c="${k}" value="${esc(C[k])}" step="${step}" min="0"></label>`;
    return `<summary>${svg(IC.copy)} <b>AI-Vetted Copy Engine</b> <span class="note">zero custody · consensus · drift shield · $ risk + ATR stop · paper-first</span></summary><div class="v165-copy">
      <div class="v165-row"><label class="v165-sw"><input type="checkbox" data-v165c="on"${C.on ? ' checked' : ''}> Engine on</label><label class="v165-sw"><input type="checkbox" data-v165c="vet"${C.vet ? ' checked' : ''}> AI Wallet &amp; Trade Vetting Gate (≥ ${esc(C.vetMin)}% via 127.0.0.1/llm-signal)</label><label class="v165-sw"><input type="checkbox" data-v165c="shadow"${C.shadow ? ' checked' : ''}> Copy Shadow Mode (PAPER log only)</label></div>
      <div class="v165-row"><span class="note">Multi-Wallet Consensus window</span><div class="seg" role="group" aria-label="Consensus window">${V165.WINDOWS.map(([s, l]) => `<button type="button" data-v165cw="${s}" class="${C.win === s ? 'on' : ''}">${l}</button>`).join('')}</div>${n('minWallets', 'Min wallets', 1)}</div>
      <div class="v165-gl">${n('riskUsd', '$ risk per copy', 10)}${n('minAtr', 'Min stop (× ATR)', 0.1)}${n('maxDrift', 'Max entry drift %', 0.1)}${n('driftAtr', 'Max drift (× ATR)', 0.1)}${n('dayCap', 'Per-leader daily loss cap $', 10)}</div>
      <div class="v165-row"><span class="note">Exit mode</span><div class="seg" role="group" aria-label="Exit mode">${V165.EXITS.map(([k, l]) => `<button type="button" data-v165cx="${k}" class="${C.exit === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>
      <div class="v165-row"><select class="in" id="v165Lead" aria-label="Leader wallet"></select><button type="button" class="btn sm" data-v165ca="packet">Copy Wallet Profile Packet for AI</button></div>
      <div class="v165-tw"><table class="v165-t" id="v165CopyLog"><thead><tr><th>Time</th><th>Market</th><th>Wallets</th><th>Decision</th><th>Detail</th></tr></thead><tbody></tbody></table></div></div>`; };
  const mountCopy = () => {
    const t = $1('#tab-whales'); if (!t) return null; if (cp && cp.isConnected) return cp;
    cp = document.createElement('details'); cp.id = 'v165Copy'; cp.className = 'panel v165-cp'; cp.innerHTML = copyHTML(); t.insertBefore(cp, t.firstChild);
    cp.addEventListener('click', onCopyClick); cp.addEventListener('change', onCopyChange); paintCopy(); return cp;
  };
  const leaders = () => { const out = []; try { if (typeof LeaderUI !== 'undefined' && LeaderUI.det) for (const [a, d] of LeaderUI.det) out.push({ addr: a, d }); } catch (e) { /* none */ } return out.slice(0, 40); };
  const paintCopy = () => {
    if (!cp) return; const sel = $1('#v165Lead', cp); if (sel) { const L = leaders(), cur = sel.value; const h = L.length ? L.map((x) => `<option value="${esc(x.addr)}">${esc(x.addr.slice(0, 6) + '…' + x.addr.slice(-4))}${x.d.tag ? ' · ' + esc(x.d.tag) : ''}</option>`).join('') : '<option value="">Open the Perp Leaderboard to load wallets</option>'; if (sel._h !== h) { sel._h = h; sel.innerHTML = h; if (cur) sel.value = cur; } }
    const tb = $1('#v165CopyLog tbody', cp); if (tb) tb.innerHTML = U.copyLog.length ? U.copyLog.slice(0, 20).map((r) => `<tr class="v165-st-${esc(r.act)}"><td class="mono">${esc(new Date(r.t).toLocaleTimeString())}</td><td class="mono">${esc(baseOf(r.sym))} ${esc(r.side)}</td><td class="mono">${esc(r.n)}</td><td><b>${esc(r.act)}</b></td><td>${esc(r.why)}</td></tr>`).join('') : '<tr><td colspan="5" class="note">Waiting for 2+ tracked wallets to enter the same market and direction inside the window.</td></tr>';
  };
  const onCopyClick = (e) => {
    const C = U.cfg.copy, w = e.target.closest('[data-v165cw]'); if (w) { C.win = +w.dataset.v165cw; save(); cp.innerHTML = copyHTML(); cp.open = true; paintCopy(); return; }
    const x = e.target.closest('[data-v165cx]'); if (x) { C.exit = x.dataset.v165cx; save(); cp.innerHTML = copyHTML(); cp.open = true; paintCopy(); return; }
    const a = e.target.closest('[data-v165ca]'); if (a && a.dataset.v165ca === 'packet') { const addr = ($1('#v165Lead', cp) || {}).value, d = addr && typeof LeaderUI !== 'undefined' && LeaderUI.det ? LeaderUI.det.get(addr) : null; if (!d) { toast('Load a leaderboard wallet first', 'amb'); return; } copyText(V165.walletPacket({ short: addr.slice(0, 6) + '…' + addr.slice(-4), tag: d.tag, stats: { win: d.stats && d.stats.winRate, n: d.stats && d.stats.n }, positions: (d.positions || []).map((p) => ({ coin: p.coin, side: p.side, ntl: p.ntl })), flags: [d.tilt && d.tilt.flag ? 'tilted' : ''].filter(Boolean) }, U.cfg.mode).replace('<address>', addr), 'Wallet profile packet'); }
  };
  const onCopyChange = (e) => { const x = e.target, k = x.dataset && x.dataset.v165c; if (!k) return; const C = U.cfg.copy; if (x.type === 'checkbox') C[k] = x.checked; else { const v = parseFloat(x.value); if (Number.isFinite(v) && v >= 0) C[k] = k === 'minWallets' ? Math.max(2, Math.round(v)) : v; } save(); };
  const copyLog = (o) => { U.copyLog.unshift(Object.assign({ t: Date.now() }, o)); if (U.copyLog.length > 50) U.copyLog.length = 50; paintCopy(); };
  /* leader fills: { addr, sym, side: long|short, price, ts (unix s), exit? } from the leaderboard poller (or tests) */
  U.leaderFill = (f) => { if (!f || !f.addr || !f.sym || !(f.price > 0)) return false; const k = f.addr + '|' + f.sym + '|' + f.side + '|' + f.ts + '|' + (f.exit ? 'x' : 'o'); if (U.fills.some((x) => x.k === k)) return false; U.fills.push(Object.assign({ k }, f)); if (U.fills.length > 400) U.fills.splice(0, U.fills.length - 300); return true; };
  const harvest = () => { for (const { addr, d } of leaders()) for (const f of d.fills || []) { const open = /^Open/.test(f.dir), close = /^Close/.test(f.dir); if (!open && !close) continue; U.leaderFill({ addr, sym: symOfCoin(f.coin), side: /Long/.test(f.dir) ? 'long' : 'short', price: +f.px || +f.price, ts: (f.t || 0) / 1000, exit: close }); } };
  U.copyEval = (nowS) => {
    const C = U.cfg.copy; if (!C.on) return []; const now = nowS || Date.now() / 1000, out = [], groups = new Map();
    for (const f of U.fills) if (!f.exit && now - f.ts <= C.win) groups.set(f.sym + '|' + f.side, f);
    for (const f of groups.values()) {
      const p = px(f.sym), dec = V165.copyDecide({ fills: U.fills.filter((x) => !x.exit), sym: f.sym, side: f.side, price: p, atr: atrOf(f.sym), now, cfg: C, vets: U.vets }); if (dec.act === 'wait') continue;
      const key = f.sym + '|' + f.side + '|' + dec.cons.wallets.slice().sort().join(','); if (U.copyDone.has(key)) continue; U.copyDone.add(key); out.push(dec);
      const base = { sym: f.sym, side: f.side, n: dec.cons.n };
      if (dec.act === 'block') { U.stats.blocks++; copyLog(Object.assign(base, { act: 'blocked', why: dec.why })); led('copy', { status: 'blocked', detail: `Copy ${baseOf(f.sym)} ${f.side} (${dec.cons.n} wallets): ${dec.why}` }); toast('🛡 ' + esc(dec.why), 'amb', 7000); continue; }
      const pl = dec.plan, plan = `$${pl.risk.toFixed(0)} risk · qty ${pl.qty.toPrecision(4)} · stop ${pl.stop} · TP1 ${pl.tp[0]} / TP2 ${pl.tp[1]} / TP3 ${pl.tp[2]}`, vetd = C.vet ? 'AI-vetted' : 'unvetted';
      if (dec.act === 'shadow' || f.side !== 'long') { U.stats.shadow++; U.shadow.unshift({ symbol: f.sym, side: f.side, entry: pl.entry, stop_loss: pl.stop, tp: pl.tp, src: 'copy', ts: Date.now(), done: false }); copyLog(Object.assign(base, { act: 'shadow', why: plan + (f.side !== 'long' && dec.act !== 'shadow' ? ' (short: paper shadow, ticket is long-only)' : '') })); led('copy', { status: 'paper-shadow', detail: `Copy ${baseOf(f.sym)} ${f.side} · ${dec.cons.n} wallets · ${plan} · attribution Copy (${vetd})` }); continue; }
      const t = ACC.buy(f.sym, p, Math.min(pl.usd, ACC.cash), Date.now(), { src: 'copy', slPx: pl.stop, tpPx: pl.tp[0], reason: `copy consensus (${dec.cons.n} wallets)` });
      if (!t) { copyLog(Object.assign(base, { act: 'blocked', why: 'paper account could not fill (cash)' })); continue; }
      U.stats.copies++; U.copyPos[f.sym] = { leaders: dec.cons.wallets, plan: pl, exit: C.exit, ts: now, side: f.side }; U.slip.push({ src: 'copy', bps: V165.slipBps('long', dec.cons.leaderPx, t.price) }); try { saveState(); } catch (x) { /* state */ }
      copyLog(Object.assign(base, { act: 'copied', why: plan })); led('copy', { status: 'filled', detail: `Copy BUY ${baseOf(f.sym)} · ${dec.cons.n} wallets · ${plan} · drift ${dec.drift.pct.toFixed(2)}% · attribution Copy (${vetd})` }); toast(`🪞 Copy consensus: ${esc(baseOf(f.sym))} long, ${esc(plan)}`, 'acc', 7000);
    }
    return out;
  };
  const copyExits = () => {
    const C = U.cfg.copy, now = Date.now() / 1000, day = Math.floor(now / 86400);
    for (const [sym, P] of Object.entries(U.copyPos)) {
      if (ACC.qty(sym) > 0) { const left = U.fills.some((f) => f.exit && f.sym === sym && P.leaders.includes(f.addr) && f.ts >= P.ts); if (left && V165.exitNow(P.exit, true, false)) { const p = px(sym); if (p > 0) ACC.sell(sym, p, null, Date.now(), { src: 'copy', reason: 'mirror leader exit' }); } continue; }
      const last = [...(ACC.trades || [])].reverse().find((t) => t.sym === sym && t.side === 'sell'); delete U.copyPos[sym]; if (!last || !Number.isFinite(last.pnl)) continue;
      for (const a of P.leaders) { U.leaderPnl.push({ leader: a, pnl: last.pnl / P.leaders.length, ts: now }); if (V165.dayPnl(U.leaderPnl, a, now) <= -C.dayCap) { C.muted[a] = day; save(); led('copy', { status: 'muted', detail: `Leader ${a.slice(0, 8)}… auto-muted for today: daily copy loss cap $${C.dayCap} hit` }); toast(`Leader ${esc(a.slice(0, 8))}… auto-muted for today (loss cap)`, 'amb'); } }
    }
  };

  /* ══ ledger attribution + share buttons ══ */
  const ledgerExtras = () => {
    const wrap = $1('.v161-ledwrap'); if (!wrap) return; let box = $1('#v165LedAttr');
    if (!box) { box = document.createElement('div'); box.id = 'v165LedAttr'; box.className = 'v165-led'; wrap.after(box); box.addEventListener('click', (e) => { if (e.target.closest('[data-v165l="share"]')) U.shareCard(); }); }
    const h = `<div class="v165-row"><b>Human vs. AI / Bot Execution Attribution</b><span class="sp"></span><button type="button" class="btn xs" data-v165l="share">${svg(IC.share)} Share Setup Card</button></div>${attrHTML()}`; if (box._h !== h) { box._h = h; box.innerHTML = h; }
  };
  const toolbar = () => { const tb = $1('#tab-markets .toolbar'); if (!tb || $1('#v165ShareBtn')) return; const b = document.createElement('button'); b.type = 'button'; b.id = 'v165ShareBtn'; b.className = 'btn xs ghost v165-share'; b.title = 'Share Setup Card (PNG, balances masked)'; b.setAttribute('aria-label', 'Share Setup Card'); b.innerHTML = svg(IC.share); b.addEventListener('click', () => U.shareCard()); tb.appendChild(b); };
  const attach = () => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(overlay)) chart.overlays.push(overlay); };

  let n = 0;
  const tick = () => {
    try {
      mountTab(); attach(); toolbar(); n++;
      if (n % 2 === 0) poll(); if (n % 4 === 0) { shadowStep(); clipWatch(); copyExits(); if ($1('.v161-ledwrap')) ledgerExtras(); }
      if (typeof curTab !== 'undefined' && curTab === 'whales') { mountCopy(); if (n % 6 === 0) paintCopy(); }
      if (n % 30 === 0) { harvest(); U.copyEval(); }
    } catch (e) { console.warn('v165', e); }
  };
  U.start = () => { load(); tick(); setInterval(tick, 500); };
  Object.assign(U, { setGhost, runIdea, runTickers, harden, validatePine, shareJson, packet, overlay, stage, handle, poll, mountTab, mountCopy, paint, tick, ctxChart, resolve, ledgerExtras });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b165 = boot; boot = async function () { await _b165.apply(this, arguments); try { V165UI.start(); } catch (e) { console.warn('v165 init', e); } }; }
