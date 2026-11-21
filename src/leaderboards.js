/* ExTerm v15.4 On-Chain Perp & Smart-Money Leaderboards (zero top-bar additions). Crypto → Social gains a Feed | Perp
   Leaderboard switch; On-chain → Wallet Tracker gains a collapsed Smart-Money Leaderboard. Data: public, permissionless
   Hyperliquid mainnet reads through the launcher (/api/hl/*: allow-listed, 30 s RAM cache, schema-validated); ranked by
   the ExTerm Alpha Score. Per trader: live positions, Chart Setup (entry + liquidation on the chart), Shadow Mirror
   (position deltas → Grok dry-run shadow log, zero custody), + Track Wallet, Backtest Style (→ Quant Lab + 17-test
   gate), delta / exit badges, tilted-whale + liquidation-magnet flags, style tags × World Macro Shield, consensus heatmap
   strip on the chart, CONFLUENCE + TOP TRADER pins, Anti-Rug filter. Every external string goes through esc(). */
const LeaderUI = (() => {
  const U = { board: null, err: '', det: new Map(), prev: new Map(), conf: [], setup: null, loading: false, open: new Set(), win: 'month', by: 'alpha', page: 25 };
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const cfg = () => { const c = ST.v154 && typeof ST.v154 === 'object' ? ST.v154 : (ST.v154 = {}); c.tracked = (Array.isArray(c.tracked) ? c.tracked : []).filter((w) => w && V154.isAddr(w.addr)).map((w) => ({ addr: w.addr.toLowerCase(), label: String(w.label || '').replace(/[<>&"'`]/g, '').slice(0, 24) })).slice(0, 40); c.mirror = (Array.isArray(c.mirror) ? c.mirror : []).filter(V154.isAddr).slice(0, 5); c.antiRug = c.antiRug !== false; c.heat = !!c.heat; return c; };
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  const usd = (x) => (typeof NT !== 'undefined' ? NT.fmtUSD(x, Math.abs(x) >= 1e4 ? 0 : 2) : '$' + Math.round(x));
  const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const cls = (x) => (x >= 0 ? 'up' : 'dn');
  const symOf = (coin) => String(coin).toUpperCase() + '-USD';
  const refs = () => { const out = []; for (const c of ['BTC', 'ETH', 'HYPE', 'XRP', 'DOGE', 'AVAX']) { let p = null; try { p = typeof px === 'function' ? px(symOf(c)) : null; } catch (e) { /* no price */ } if (p > 0) out.push(c + ':' + (+p).toPrecision(8)); } return out.join(','); };
  const macro = () => { const I = typeof Grok !== 'undefined' && Grok.intel ? Grok.intel.items || [] : [], now = Date.now() / 1000, fresh = I.filter((x) => x && (!x.ts || now - x.ts < 3600)); return fresh.some((x) => x.sev === 'CRITICAL') ? 'Risk-Off' : fresh.some((x) => x.sev === 'MACRO' || x.sev === 'HIGH') ? 'Event-Driven' : 'Calm'; };

  /* ══ data ══ */
  U.load = async (force) => {
    if (U.loading || (!force && U.board && Date.now() - U.board.at < 30000)) return U.board; U.loading = true;
    try { const j = await J.get('/api/hl/leaderboard', { timeout: 30000 }); U.board = { rows: V154.parseBoard(j), sample: !!j.sample, stale: !!j.stale, at: Date.now() }; U.err = ''; }
    catch (e) { U.err = String(e.message || e).slice(0, 140); } finally { U.loading = false; }
    return U.board;
  };
  U.trader = async (addr) => {
    const hit = U.det.get(addr); if (hit && Date.now() - hit.at < 30000) return hit;
    const j = await J.get(`/api/hl/trader?addr=${encodeURIComponent(addr)}&types=clearinghouseState,userFills,frontendOpenOrders&ref=${encodeURIComponent(refs())}`, { timeout: 20000 });
    const st = V154.positions(j.clearinghouseState), fills = V154.fills(j.userFills), orders = Array.isArray(j.frontendOpenOrders) ? j.frontendOpenOrders : [], stats = V154.fillStats(fills);
    const prev = U.det.get(addr), d = { addr, at: Date.now(), acct: st.acct, positions: st.list, orders, fills, stats, tag: V154.styleTag(stats, fills), tilt: V154.tilt(fills), magnets: V154.liqMagnets(st.list), badges: prev ? V154.delta(prev.positions, st.list, prev.orders, orders) : (hit && hit.badges) || [] };
    if (prev) d.badgeAt = d.badges.length ? Date.now() : prev.badgeAt; if (prev && !d.badges.length && prev.badges && Date.now() - (prev.badgeAt || 0) < 15 * 60000) d.badges = prev.badges;
    U.det.set(addr, d); if (prev && cfg().mirror.includes(addr)) mirror(addr, prev.positions, st.list); return d;
  };
  const pool = async (addrs, n = 4) => { const q = addrs.slice(); await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const a = q.shift(); try { await U.trader(a); } catch (e) { /* one trader failing never blocks the board */ } } })); };
  U.top = () => { if (!U.board) return []; const rows = V154.rank(U.board.rows, U.win, U.by, 200), c = cfg(); return c.antiRug ? rows.filter((r) => !U.rug(r).flag) : rows; };
  U.rug = (r) => { const d = U.det.get(r.addr), peers = {}; for (const [a, x] of U.det) peers[a] = x.fills; return V154.antiRug(r, d ? d.fills : [], peers); };
  U.enrich = async () => {
    const top = V154.rank((U.board && U.board.rows) || [], U.win, U.by, 25).map((r) => r.addr), tracked = cfg().tracked.map((w) => w.addr); await pool([...new Set(top.concat(tracked))]);
    const ent = []; for (const a of top) { const d = U.det.get(a); if (!d) continue; for (const f of d.fills) if (/^Open/.test(f.dir)) ent.push({ addr: a, coin: f.coin, side: /Long/.test(f.dir) ? 'Long' : 'Short', t: f.t / 1000 }); }
    const now = Date.now() / 1000, fresh = V154.confluence(ent, 900).filter((c) => now - c.t < 6 * 3600);
    for (const c of fresh) if (!U.conf.some((x) => x.key === c.key && Math.abs(x.t - c.t) < 900)) { if (U.conf.length) toast(`🎯 CONFLUENCE · ${c.wallets.length} top wallets ${c.side} ${esc(c.coin)} within 15 min`, 'acc', 7000); }
    U.conf = fresh; if (typeof chart !== 'undefined' && chart) chart.invalidate();
  };
  /* Shadow Mirror: position deltas → dry-run shadow fills (never a real order, never custody) */
  const mirror = (addr, prev, cur) => {
    if (typeof V152 === 'undefined' || typeof V152UI === 'undefined') return; const P = new Map(prev.map((p) => [p.coin, p]));
    for (const c of cur) { const p = P.get(c.coin), d = c.szi - (p ? p.szi : 0); if (Math.abs(d) * c.mark < 10) continue; const f = V152.shadowFill({ side: d > 0 ? 'buy' : 'sell', usd: Math.min(1000, Math.abs(d) * c.mark), sym: symOf(c.coin), bot: '🪞 Mirror ' + short(addr) }, { price: c.mark, ts: Date.now() }, 5); if (f) { V151.pushCapped(V152UI.shadow, f, 200); toast(`🪞 Shadow Mirror ${esc(f.side)} ${esc(c.coin)} (dry-run, no balance touched)`); } }
    for (const p of prev) if (!cur.some((c) => c.coin === p.coin)) { const f = V152.shadowFill({ side: p.szi > 0 ? 'sell' : 'buy', usd: Math.min(1000, p.ntl), sym: symOf(p.coin), bot: '🪞 Mirror ' + short(addr) }, { price: p.mark, ts: Date.now() }, 5); if (f) V151.pushCapped(V152UI.shadow, f, 200); }
    if (V152UI.renderGrokCard) V152UI.renderGrokCard();
  };

  /* ══ actions ══ */
  const A = {};
  A.setup = (addr, coin) => { const d = U.det.get(addr), p = d && d.positions.find((x) => x.coin === coin); if (!p) return; const sym = symOf(coin); showTab('markets'); if (ST.mode !== 'crypto') setMode('crypto', sym); else if (ST.sel !== sym) selectSym(sym); U.setup = { sym, entry: p.entry, liq: p.liq, side: p.side, who: short(addr) }; setTimeout(() => chart && chart.invalidate(), 300); toast(`📐 Chart Setup: ${esc(short(addr))} ${esc(p.side)} ${esc(coin)} entry and liquidation plotted`); };
  A.mirror = (addr) => { const c = cfg(); c.mirror = c.mirror.includes(addr) ? c.mirror.filter((x) => x !== addr) : c.mirror.concat([addr]).slice(-5); saveState(); toast(c.mirror.includes(addr) ? `🪞 Shadow Mirror on for ${esc(short(addr))}: position changes log as dry-run fills in the Grok tab` : 'Shadow Mirror off', 'acc'); renderPerp(); };
  A.track = (addr) => { const c = cfg(); if (c.tracked.some((w) => w.addr === addr)) c.tracked = c.tracked.filter((w) => w.addr !== addr); else c.tracked.push({ addr, label: '' }); saveState(); toast(c.tracked.some((w) => w.addr === addr) ? '+ Tracking ' + esc(short(addr)) + ' in the Smart-Money Leaderboard' : 'Stopped tracking', 'acc'); renderPerp(); renderSmart(); };
  A.backtest = async (addr) => {
    let d = U.det.get(addr); try { d = d || (await U.trader(addr)); } catch (e) { toast('Could not load this trader\'s fills: ' + esc(e.message), 'dn'); return; }
    const spec = V154.styleSpec(d.stats, d.tag, 3600), sym = symOf(spec.coin); showTab('markets'); if (ST.mode !== 'crypto') setMode('crypto', sym); else selectSym(sym);
    const c = ST.v153 && typeof ST.v153 === 'object' ? ST.v153 : (ST.v153 = {}); c.strat = spec.strat; c.tf = spec.tf; saveState();
    if (typeof V153UI !== 'undefined') { V153UI.params = null; V153UI.filters = spec.filters; V153UI.grade = null; }
    showTab('lab'); try { labSec = 'q153'; for (const x of document.querySelectorAll('#labNav button')) x.classList.toggle('on', x.dataset.v === 'q153'); await renderLab(); } catch (e) { /* lab optional */ }
    toast(`🧪 Backtest Style · ${esc(short(addr))}: ${esc(d.tag)}, ~${esc(Math.round(spec.hold))} min holds, ${esc(spec.perDay)} entries/day on ${esc(spec.coin)} → ${esc(spec.strat)} with a ${esc(spec.filters.timeStop)}-bar time stop`, 'acc', 8000);
    if (typeof V153UI !== 'undefined') { await V153UI.A.base(); const det = $('#q153Root details[data-sec="promote"]'); if (det && !det.open) { det.open = true; await new Promise((r) => setTimeout(r, 120)); } if (V153UI.base && $('#q153PrOut')) await V153UI.A.validate(); }
  };
  U.A = A;

  /* ══ Social → Perp Leaderboard ══ */
  const posTable = (d) => (d.positions.length ? `<table class="v152-t lb-pos"><tr><th>Asset</th><th>Side</th><th>Leverage</th><th>Entry</th><th>Unrealized PnL</th><th>Liquidation</th><th></th></tr>${d.positions.map((p) => `<tr><td>${esc(p.coin)}</td><td class="${p.side === 'Long' ? 'up' : 'dn'}">${esc(p.side)}</td><td>${esc(p.lev ? p.lev + '×' : '–')}</td><td class="mono">${esc(NT.fmtPrice(p.entry))}</td><td class="${cls(p.upnl)}">${esc(usd(p.upnl))}</td><td class="mono">${esc(p.liq ? NT.fmtPrice(p.liq) : '–')}</td><td><button type="button" class="btn xs" data-lb="setup" data-a="${esc(d.addr)}" data-c="${esc(p.coin)}">📐 Chart Setup</button></td></tr>`).join('')}</table>` : '<div class="note">No open positions.</div>');
  const flags = (r, d) => { const out = []; if (d) { if (d.tilt.tilt) out.push(`<span class="tag dn" title="${esc(d.tilt.why)}">Tilted whale</span>`); if (d.magnets.length) out.push(`<span class="tag amb" title="Within 2.5% of liquidation">Liq magnet ${esc(d.magnets[0].coin)} ${esc(d.magnets[0].dist)}%</span>`); for (const b of d.badges.slice(0, 3)) out.push(`<span class="tag ${b.kind === 'exit' || b.kind === 'trim' ? 'dn' : b.kind === 'sl' ? 'amb' : 'up'}">${esc(b.coin)} ${esc(b.badge)}</span>`); } const rg = U.rug(r); if (rg.flag) out.push(`<span class="tag dn" title="${esc(rg.why.join(', '))}">Copy-trap</span>`); return out.join(' '); };
  const renderPerp = () => {
    const host = $('#lbPerp'); if (!host || host.hidden) return; const c = cfg(), B = U.board, W = U.win, rows = U.top().slice(0, U.page), mac = macro();
    host.innerHTML = `<div class="panel"><div class="ph">🏆 <span data-i18n="lb.perp">${esc(T('lb.perp'))}</span> ${B && B.sample ? '<span class="tag amb">SAMPLE · offline</span>' : B ? '<span class="tag up">LIVE · on-chain</span>' : ''}${B && B.stale ? '<span class="tag amb">cached</span>' : ''}<span class="sp"></span>
      <div class="seg" id="lbWin">${V154.WINDOWS.map(([k, l]) => `<button type="button" data-win="${k}" class="${W === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="seg" id="lbBy"><button type="button" data-by="alpha" class="${U.by === 'alpha' ? 'on' : ''}">Alpha</button><button type="button" data-by="pnl" class="${U.by === 'pnl' ? 'on' : ''}">PnL</button><button type="button" data-by="roi" class="${U.by === 'roi' ? 'on' : ''}">ROI</button></div>
      <label class="chk"><input type="checkbox" data-lbc="antiRug" ${c.antiRug ? 'checked' : ''}> <span data-i18n="lb.antirug">${esc(T('lb.antirug'))}</span></label><label class="chk"><input type="checkbox" data-lbc="heat" ${c.heat ? 'checked' : ''}> <span data-i18n="lb.heat">${esc(T('lb.heat'))}</span></label><button type="button" class="btn sm" data-lb="refresh">↻</button></div>
      <div class="pb"><div class="note">World Macro Shield regime: <b>${esc(mac)}</b> · public Hyperliquid mainnet data · ranked by the <span class="lb-alpha-h">ExTerm Alpha Score</span> · nothing here can place an order${U.conf.length ? ` · <span class="up">🎯 ${esc(U.conf.length)} CONFLUENCE signal(s)</span>` : ''}</div>
      ${U.err && !B ? `<div class="note dn">Leaderboard unavailable: ${esc(U.err)}</div>` : !B ? '<div class="note shimmer">Loading the on-chain leaderboard…</div>' : `<div class="q153-scroll"><table class="v152-t lb-t"><tr><th>#</th><th>Trader</th><th>Alpha</th><th>PnL ${esc((V154.WINDOWS.find((w) => w[0] === W) || [])[1])}</th><th>ROI</th><th>Account</th><th>Style</th><th>Signals</th><th></th></tr>
      ${rows.map((r, i) => { const d = U.det.get(r.addr), open = U.open.has(r.addr), tag = d ? d.tag : '…'; return `<tr class="lb-row"><td>${i + 1}</td><td class="mono" title="${esc(r.addr)}">${esc(r.name || short(r.addr))}</td><td><b class="${r.alpha >= 70 ? 'up' : r.alpha >= 45 ? '' : 'dn'}">${esc(r.alpha)}</b></td><td class="${cls(r.pnl[W])}">${esc(usd(r.pnl[W]))}</td><td class="${cls(r.roi[W])}">${esc(pct(r.roi[W]))}</td><td>${esc(usd(r.acct))}</td><td><span class="tag">${esc(tag)}</span>${(tag === 'News Sniper' || tag === 'Scalper') && mac === 'Risk-Off' ? ' <span class="tag amb" title="Fast styles misfire in risk-off tape">⚠ macro</span>' : ''}</td><td>${flags(r, d)}</td><td><button type="button" class="btn xs" data-lb="expand" data-a="${esc(r.addr)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button></td></tr>${open ? `<tr class="lb-x"><td colspan="9">${d ? posTable(d) + `<div class="note">Win rate ${esc(d.stats.winRate == null ? '–' : Math.round(d.stats.winRate * 100) + '%')} · realised ${esc(usd(d.stats.realized))} · median hold ${esc(d.stats.avgHoldMin == null ? '–' : d.stats.avgHoldMin + ' min')} · ${esc(d.stats.opensPerDay)} entries/day · favours ${esc(d.stats.favored.join(', ') || '–')}</div>` : '<div class="note shimmer">Loading positions…</div>'}
        <div class="row v151-row"><button type="button" class="btn sm ${c.mirror.includes(r.addr) ? 'pri' : ''}" data-lb="mirror" data-a="${esc(r.addr)}">🪞 ${esc(T('lb.mirror'))}${c.mirror.includes(r.addr) ? ' ✓' : ''}</button><button type="button" class="btn sm" data-lb="track" data-a="${esc(r.addr)}">${c.tracked.some((w) => w.addr === r.addr) ? '✓ Tracked' : '+ ' + esc(T('lb.track'))}</button><button type="button" class="btn sm pri" data-lb="backtest" data-a="${esc(r.addr)}">🧪 ${esc(T('lb.backtest'))}</button></div></td></tr>` : ''}`; }).join('')}</table></div>
      ${U.top().length > U.page ? '<button type="button" class="btn sm" data-lb="more">Show 25 more</button>' : ''}`}</div></div>`;
  };
  U.showPerp = (on) => {
    const host = $('#lbPerp'), feed = $('#tab-social .soterm'), hero = $('#soHero'); if (!host) return; host.hidden = !on; if (feed) feed.hidden = on; if (hero) hero.hidden = on;
    for (const b of document.querySelectorAll('#lbSeg button')) { const sel = (b.id === 'lbPerpBtn') === on; b.classList.toggle('on', sel); b.setAttribute('aria-selected', sel); }
    if (on) { renderPerp(); U.load().then(() => { renderPerp(); return U.enrich(); }).then(renderPerp).catch(() => renderPerp()); }
  };
  const mountSocial = () => {
    const tab = $('#tab-social'); if (!tab || $('#lbSeg')) return; const seg = document.createElement('div'); seg.className = 'seg lb-seg'; seg.id = 'lbSeg'; seg.setAttribute('role', 'tablist');
    seg.innerHTML = `<button type="button" id="lbFeedBtn" class="on" role="tab" aria-selected="true">📣 <span data-i18n="lb.feed">${esc(T('lb.feed'))}</span></button><button type="button" id="lbPerpBtn" role="tab" aria-selected="false">🏆 <span data-i18n="lb.perp">${esc(T('lb.perp'))}</span></button>`;
    const host = document.createElement('div'); host.id = 'lbPerp'; host.hidden = true; tab.prepend(host); tab.prepend(seg);
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) U.showPerp(b.id === 'lbPerpBtn'); });
    const act = async (e) => {
      const w = e.target.closest('[data-win]'); if (w) { U.win = w.dataset.win; renderPerp(); U.enrich().then(renderPerp); return; } const by = e.target.closest('[data-by]'); if (by) { U.by = by.dataset.by; renderPerp(); return; }
      const b = e.target.closest('[data-lb]'); if (!b) return; const a = b.dataset.lb, addr = b.dataset.a;
      if (a === 'expand') { if (U.open.has(addr)) U.open.delete(addr); else { U.open.add(addr); U.trader(addr).then(renderPerp, (er) => toast('Trader: ' + esc(er.message), 'dn')); } renderPerp(); }
      else if (a === 'refresh') { await U.load(true); renderPerp(); await U.enrich(); renderPerp(); } else if (a === 'more') { U.page += 25; renderPerp(); }
      else if (A[a]) A[a](addr, b.dataset.c);
    };
    host.addEventListener('click', act); tab.addEventListener('click', (e) => { if (e.target.closest('#lbSmart')) act(e); });
    host.addEventListener('change', (e) => { const k = e.target.dataset.lbc; if (!k) return; cfg()[k] = e.target.checked; saveState(); if (typeof chart !== 'undefined' && chart) chart.invalidate(); renderPerp(); });
  };

  /* ══ On-chain → Wallet Tracker → Smart-Money Leaderboard ══ */
  const renderSmart = () => {
    const d0 = $('#lbSmart'); if (!d0) return; d0.hidden = ST.mode !== 'onchain'; const body = d0.querySelector('.pb'); if (!d0.open || !body) return; const c = cfg();
    const pub = U.board ? V154.rank(U.board.rows, 'month', 'alpha', 25) : [], seen = new Set(), rows = [];
    for (const w of c.tracked) { const r = (U.board && U.board.rows.find((x) => x.addr === w.addr)) || { addr: w.addr, name: w.label, alpha: null, acct: 0 }; rows.push(Object.assign({ mine: true }, r)); seen.add(w.addr); }
    for (const r of pub) if (!seen.has(r.addr)) rows.push(r);
    const list = rows.map((r) => ({ r, d: U.det.get(r.addr) })).filter(({ r }) => !c.antiRug || r.mine || !U.rug(r).flag).sort((a, b) => ((b.r.alpha || 0) - (a.r.alpha || 0)) || ((b.d && b.d.stats.winRate) || 0) - ((a.d && a.d.stats.winRate) || 0));
    body.innerHTML = `<div class="note"><span data-i18n="lb.smart">${esc(T('lb.smart'))}</span>: public top-25 + your saved wallets · win rate and realised PnL from on-chain fills · <span class="lb-alpha-h">ExTerm Alpha Score</span>${U.board && U.board.sample ? ' · <span class="tag amb">SAMPLE · offline</span>' : ''}</div>
      ${U.conf.length ? `<div class="lb-conf">${U.conf.slice(-4).map((x) => `<span class="tag up">🎯 CONFLUENCE ${esc(x.side)} ${esc(x.coin)} · ${esc(x.wallets.length)} top wallets · ${esc(new Date(x.t * 1000).toISOString().slice(11, 16))} UTC</span>`).join(' ')}</div>` : ''}
      <div class="row v151-row"><input class="in" id="lbAddr" placeholder="0x… public wallet" aria-label="Wallet address" spellcheck="false"><button type="button" class="btn sm pri" id="lbAddBtn">+ ${esc(T('lb.track'))}</button></div>
      <div class="q153-scroll"><table class="v152-t"><tr><th>Wallet</th><th>Win rate</th><th>Realised PnL</th><th>Alpha</th><th>Style</th><th>Radar</th><th></th></tr>${list.map(({ r, d }) => `<tr><td class="mono">${r.mine ? '★ ' : ''}${esc(r.name || short(r.addr))}</td><td>${esc(d && d.stats.winRate != null ? Math.round(d.stats.winRate * 100) + '%' : '–')}</td><td class="${d ? cls(d.stats.realized) : ''}">${esc(d ? usd(d.stats.realized) : '–')}</td><td><b>${esc(r.alpha == null ? '–' : r.alpha)}</b></td><td>${esc(d ? d.tag : '…')}</td><td>${d ? flags(r, d) : ''}</td><td><button type="button" class="btn xs" data-lb="backtest" data-a="${esc(r.addr)}">🧪</button> <button type="button" class="btn xs" data-lb="track" data-a="${esc(r.addr)}">${r.mine ? '✕' : '+'}</button></td></tr>`).join('')}</table></div>`;
    const add = body.querySelector('#lbAddBtn'); if (add) add.addEventListener('click', () => { const v = body.querySelector('#lbAddr').value.trim(); if (!V154.isAddr(v)) { toast('Enter a 0x… public wallet address (40 hex characters)', 'amb'); return; } A.track(v.toLowerCase()); U.trader(v.toLowerCase()).then(renderSmart).catch(() => { /* shown as – */ }); });
  };
  const mountSmart = () => { const tab = $('#tab-whales'); if (!tab || $('#lbSmart')) return; const d = document.createElement('details'); d.id = 'lbSmart'; d.className = 'panel lb-smart'; d.innerHTML = `<summary>🧠 <span data-i18n="lb.smart">${esc(T('lb.smart'))}</span> <span class="note">win rate · realised PnL · Alpha Score · CONFLUENCE</span></summary><div class="pb"></div>`; tab.prepend(d);
    d.addEventListener('toggle', () => { if (d.open) { renderSmart(); U.load().then(() => { renderSmart(); return U.enrich(); }).then(renderSmart).catch(renderSmart); } }); d.hidden = ST.mode !== 'onchain'; };

  /* ══ chart overlay: Chart Setup lines, liquidation magnets, TOP TRADER pins, consensus heatmap strip ══ */
  U.overlay = (g, L, ch) => {
    if (typeof chart === 'undefined' || ch !== chart || !L.py || !L.D || !L.D.length) return; const coin = baseOf(ST.sel).toUpperCase(), top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, right = L.W - L.Rm;
    const hline = (p, col, lab, dash) => { const y = L.py(p); if (!(y > top && y < bot)) return; g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = 0.85; g.setLineDash(dash || [6, 4]); g.beginPath(); g.moveTo(L.Lm, y); g.lineTo(right, y); g.stroke(); g.setLineDash([]); g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(lab, L.Lm + 6, y - 3); };
    g.save();
    if (U.setup && U.setup.sym === ST.sel) { hline(U.setup.entry, U.setup.side === 'Long' ? L.col.up : L.col.dn, `${U.setup.who} ${U.setup.side} entry`); if (U.setup.liq > 0) hline(U.setup.liq, '#CBD5E1', `${U.setup.who} liquidation`, [2, 3]); }
    const books = []; for (const [, d] of U.det) { books.push(d); for (const m of d.magnets) if (m.coin === coin) hline(m.liq, '#CBD5E1', `LIQ MAGNET ${m.dist}% · sweep target`, [3, 3]); }
    for (const c of U.conf) if (c.coin === coin) { const x = ch.tToX(c.t); if (x >= L.Lm && x <= right) { g.globalAlpha = 0.95; g.fillStyle = c.side === 'Long' ? L.col.up : L.col.dn; g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`TOP TRADER ×${c.wallets.length}`, x, top + 12); g.beginPath(); g.moveTo(x - 4, top + 16); g.lineTo(x + 4, top + 16); g.lineTo(x, top + 22); g.fill(); } }
    if (cfg().heat && books.length) {
      const vis = L.D.slice(Math.max(0, L.start), L.end); if (vis.length) { const lo = Math.min(...vis.map((c) => c.l)), hi = Math.max(...vis.map((c) => c.h)), B = V154.heatmap(books, coin, lo, hi, 48);
        if (B) { const x = right - 16; for (const b of B) { if (!b.w) continue; const y1 = L.py(b.p1), y2 = L.py(b.p0), k = b.liq >= Math.max(b.long, b.short, b.tp) ? '#CBD5E1' : b.tp >= Math.max(b.long, b.short) ? L.col.amb : b.long >= b.short ? L.col.up : L.col.dn; g.fillStyle = k; g.globalAlpha = 0.25 + 0.6 * b.w; g.fillRect(x, y1, 12, Math.max(1, y2 - y1 - 0.5)); } g.globalAlpha = 0.7; g.fillStyle = L.col.fg; g.font = '700 8px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('TOP-25', right - 2, top + 10); } }
    }
    g.restore();
  };
  U.start = () => {
    mountSocial(); mountSmart();
    if (typeof setMode === 'function') { const _sm = setMode; setMode = function () { const r = _sm.apply(this, arguments); try { const s = $('#lbSmart'); if (s) s.hidden = ST.mode !== 'onchain'; } catch (e) { /* tab optional */ } return r; }; }
    setInterval(() => { if (typeof chart !== 'undefined' && chart && !chart.overlays.includes(U.overlay)) { chart.overlays.push(U.overlay); chart.invalidate(); } const s = $('#lbSmart'); if (s) s.hidden = ST.mode !== 'onchain'; }, 1000);
    setInterval(() => { const vis = ($('#lbPerp') && !$('#lbPerp').hidden) || ($('#lbSmart') && $('#lbSmart').open) || cfg().mirror.length || cfg().heat; if (!vis || document.hidden) return; U.load().then(() => U.enrich()).then(() => { renderPerp(); renderSmart(); }).catch(() => { /* next tick */ }); }, 60000);
  };
  U.renderPerp = renderPerp; U.renderSmart = renderSmart; U.cfg = cfg;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b154b = boot; boot = async function () { await _b154b.apply(this, arguments); try { LeaderUI.start(); } catch (e) { console.warn('leaderboards init', e); } }; }
