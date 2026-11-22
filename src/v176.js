/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.6 UI: the top-level Alpha Radar tab (maths + renderers in V176, v176core.js). Listeners only, text through
   textContent, strict CSP, exact pre-v17.0 palette (Obsidian #07080B / #0D1117 · Bullion Gold #F5C84B).
   · universe    every live quote the terminal already streams (crypto, perps, stocks) + on-chain pools (OC) + pinned tickers / CAs,
                 2 s price rings per symbol (the history the engines need; grades shrink toward neutral until it fills)
   · scan        V176.scan in the Screener worker lane every 4 s while the tab is open and not paused
   · dome        3D quantum-constellation radar, rendered off-thread (3D Spatial lane) through the v17.5 panel path, drag / zoom / tap
   · dossiers    6-box cards + plain-English 6-bot consensus + 1-click handoff (Chart + 3D · 3D Shock Test · R:R Ruler · Bot Rule) */
const V176UI = (() => {
  const U = { mounted: false, res: null, pins: new Set(), rings: new Map(), mk: 'all', gr: 'all', paused: false, sel: null, cam: { yaw: 0, pitch: 0.52, zoom: 1 }, scans: 0, at: 0, sAt: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const T = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const fin = Number.isFinite, f2 = (v, d) => (fin(v) ? v.toFixed(d == null ? 2 : d) : '–');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const live = () => (typeof Feed !== 'undefined' && Feed.live ? Feed.live : {});
  const ocS = () => (typeof OC !== 'undefined' && OC.stats ? OC.stats : {});
  const isStk = (s) => (typeof STOCK_SET !== 'undefined' && STOCK_SET.has(s)) || (typeof isStock === 'function' && isStock(s));
  const pxOf = (s) => { try { if (typeof px === 'function') { const p = px(s); if (p > 0) return p; } } catch (e) { /* not ready */ } const o = ocS()[s]; return o && o.price > 0 ? o.price : 0; };
  const label = (s) => (/^oc:/.test(s) && typeof OC !== 'undefined' ? OC.label(s) : String(s).replace(/-USD$/, ''));
  const STABLE = /^(USDT|USDC|DAI|PYUSD|USDE|FDUSD|TUSD|USDS|USD1|EURC|GUSD)-USD$/;
  const SEED_C = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD', 'LINK-USD', 'SUI-USD', 'LTC-USD', 'PEPE-USD', 'NEAR-USD'];
  const SEED_S = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'AMD', 'PLTR', 'COIN', 'GOOGL'];
  const MKTS = [['all', 'All Consensus'], ['stock', 'Stocks'], ['crypto', 'Crypto & Perps'], ['dex', 'On-Chain Meme Coins']];
  const GRADES = [['all', 'All'], ['S', 'S-Tier 92+'], ['A+', 'A+ 85+'], ['A', 'A 78+'], ['B+', 'B+ 70+']];
  const UI5 = () => (typeof V175UI !== 'undefined' ? V175UI : null);

  /* ══ universe + 2 s price rings ══ */
  let seeded = false;
  const seed = () => { if (seeded) return; seeded = true; try { if (typeof Feed !== 'undefined' && Feed.subscribe) Feed.subscribe(SEED_C.concat(SEED_S)); } catch (e) { /* feed not ready */ } try { if (typeof OC !== 'undefined' && OC.discover) OC.discover('trending').catch(() => null); } catch (e) { /* on-chain offline */ } };
  const universe = () => {
    const L = live(), out = [], add = (s, m) => { if (!out.some((a) => a.sym === s)) out.push({ sym: s, m }); };
    for (const s of U.pins) add(s, /^oc:/.test(s) ? 'dex' : /-PERP$/.test(s) ? 'perp' : isStk(s) ? 'stock' : 'crypto');
    const cr = [], st = []; for (const k of Object.keys(L)) { if (!(L[k] && L[k].price > 0)) continue; if (isStk(k)) st.push(k); else if (/-PERP$/.test(k)) cr.push([k, 'perp']); else if (/-USD$/.test(k) && !STABLE.test(k)) cr.push([k, 'crypto']); }
    cr.slice(0, 26).forEach(([k, m]) => add(k, m)); st.slice(0, 18).forEach((k) => add(k, 'stock'));
    Object.keys(ocS()).filter((k) => ocS()[k] && ocS()[k].price > 0).slice(0, 12).forEach((k) => add(k, 'dex'));
    return out;
  };
  const sample = () => { if (Date.now() - U.sAt < 1900) return; U.sAt = Date.now(); for (const a of universe()) { const p = pxOf(a.sym); if (!(p > 0)) continue; const r = U.rings.get(a.sym) || []; r.push(p); if (r.length > 120) r.shift(); U.rings.set(a.sym, r); } };
  const asset = (u) => {
    const s = u.sym, L = live()[s] || {}, O = ocS()[s] || {}, p = pxOf(s); if (!(p > 0)) return null;
    const chg = u.m === 'dex' ? (fin(+O.ch24) ? +O.ch24 : null) : typeof chg24 === 'function' ? chg24(s) : L.open24 > 0 ? (p / L.open24 - 1) * 100 : null;
    return { sym: s, l: label(s), m: u.m, px: p, chg24: fin(chg) ? chg : 0, hi24: L.high24 || 0, lo24: L.low24 || 0, advUsd: u.m === 'dex' ? +O.vol24 || 0 : (L.vol24 || 0) * p, bid: L.bid || 0, ask: L.ask || 0, liq: +O.liq || 0, mcap: +O.mcap || 0, buys: +O.buys24 || 0, sells: +O.sells24 || 0, ageH: O.created ? (Date.now() - O.created) / 36e5 : null, funding: null, series: (U.rings.get(s) || []).slice(), sim: /^oc:sim:/.test(s) };
  };

  /* ══ scan (Screener lane) ══ */
  let busy = false;
  const scan = async (force) => {
    if (busy || (!force && (U.paused || Date.now() - U.at < 4000))) return; U.at = Date.now(); busy = true;
    try { const A = universe().map(asset).filter(Boolean), M = UI5() && UI5().mesh, r = M ? await M.run('alphaScan', A, { teTop: 6 }) : V176.scan(A, { teTop: 6 }); const sim = new Set(A.filter((a) => a.sim).map((a) => a.sym)); r.picks.forEach((p) => { p.sim = sim.has(p.sym); }); U.res = r; U.scans++; U.dome = null; paint(); }
    catch (e) { const st = $1('#x176Status'); if (st) st.textContent = 'scan waiting: ' + String(e.message || e).slice(0, 80); }
    finally { busy = false; }
  };
  const view = () => { const P = (U.res && U.res.picks) || [], min = V176.MIN_GRADE[U.gr] || 0; return P.filter((p) => (U.mk === 'all' || (U.mk === 'crypto' ? p.m === 'crypto' || p.m === 'perp' : p.m === U.mk)) && p.score >= min); };

  /* ══ handoffs ══ */
  const select = (s) => { if (typeof modeOf === 'function' && typeof ST !== 'undefined' && modeOf(s) !== ST.mode && typeof setMode === 'function') setMode(modeOf(s), s); else if (typeof selectSym === 'function') selectSym(s); };
  const ACT = {
    chart(p) { select(p.sym); showTab('markets'); setTimeout(() => { try { V171UI.chart3d.toggle(true); } catch (e) { /* chart not ready */ } }, 350); T('Chart + 3D: ' + p.l, 'acc'); },
    shock(p) { select(p.sym); showTab('lab'); setTimeout(() => { try { UI5().shock.run(); } catch (e) { /* lab not mounted */ } }, 700); T('3D Shock Test queued for ' + p.l, 'acc'); },
    rr(p) { select(p.sym); showTab('markets'); setTimeout(() => { const V = typeof V17App !== 'undefined' ? V17App : null; if (!V) return; const C = typeof chart !== 'undefined' && chart ? chart.data : [], lastT = C.length ? C[C.length - 1].t : Date.now() / 1000; V.rulerOn = true; V.ruler = { a: { t: lastT, p: p.entry }, b: { t: lastT, p: p.stop }, done: true }; try { V.Layer.dirty(); } catch (e) { /* layer */ } }, 400); T(`R:R Ruler loaded for ${p.l}: entry ${f2(p.entry, p.entry < 1 ? 6 : 2)} · stop ${f2(p.stop, p.stop < 1 ? 6 : 2)}`, 'acc'); },
    bot(p) { const V = typeof V17App !== 'undefined' ? V17App : null; if (!V || !V.queue) { T('Bot Fleet not ready', 'amb'); return; } V.queue.push({ side: p.side === 'long' ? 'buy' : 'sell', sym: p.sym, usd: Math.max(10, Math.min(1000, p.safe || 1000)), px: p.px, ref: p.px, why: `Alpha Radar ${p.g} ${f2(p.score, 1)} · ${p.pro}/6 bots` }); showTab('fleet'); setTimeout(() => { try { V.Fleet.paintQ(); } catch (e) { /* fleet */ } }, 60); T('Bot rule queued behind the Co-Pilot firewall: approve it in Bot Fleet', 'amb'); },
  };
  U.act = ACT;

  /* ══ DOM ══ */
  const mount = () => {
    const main = $1('main'), nav = $1('#nav'); if (!main || !nav || $1('#tab-radar')) return !!$1('#tab-radar');
    const nb = el('button', null); nb.type = 'button'; nb.dataset.tab = 'radar'; nb.id = 'x176Nav'; nb.append(el('span', 'ni', '◎'), document.createTextNode('Alpha Radar')); nb.addEventListener('click', () => showTab('radar'));
    const ref = nav.querySelector('button[data-tab="lab"]') || nav.querySelector('button[data-tab="bots"]'); if (ref) ref.after(nb); else nav.appendChild(nb);
    const s = el('section', 'tab x17-tab x176-radar'); s.id = 'tab-radar'; s.setAttribute('aria-label', 'Alpha Radar');
    const hd = el('header', 'x176-hd'); hd.append(el('h2', null, 'ALPHA RADAR'), el('p', 'note', 'Every live stock, coin, perp and on-chain pool graded by the ExTerm engines + a 6-bot consensus debate (HUNTER-α · MUTATOR-EVO · HEDGER-ARB · RISK-GUARD · SNIPER-EXEC · SCALPER-EXIT). Research, not advice.'));
    const ctl = el('div', 'x176-ctl'), mk = el('div', 'x176-seg'); mk.setAttribute('role', 'tablist'); mk.setAttribute('aria-label', 'Market');
    for (const [k, l] of MKTS) { const b = el('button', 'x176-mk', l + ' (0)'); b.type = 'button'; b.dataset.x176m = k; b.setAttribute('role', 'tab'); b.dataset.l = l; mk.appendChild(b); }
    const gp = el('div', 'x176-seg x176-gp'); gp.setAttribute('aria-label', 'Minimum grade'); for (const [k, l] of GRADES) { const b = el('button', 'x176-g', l); b.type = 'button'; b.dataset.x176g = k; b.dataset.l = l; gp.appendChild(b); }
    const pz = el('button', 'btn sm x176-pause', 'Pause'); pz.type = 'button'; pz.id = 'x176Pause'; pz.setAttribute('aria-pressed', 'false');
    const fm = el('form', 'x176-pin'); fm.setAttribute('role', 'search'); const inp = el('input'); inp.type = 'search'; inp.placeholder = 'Pin / Lookup Any Ticker or Meme Coin CA…'; inp.setAttribute('aria-label', 'Pin or look up any ticker or meme coin contract address'); inp.maxLength = 64; inp.autocomplete = 'off'; const go = el('button', 'btn xs pri', 'Pin'); go.type = 'submit'; fm.append(inp, go);
    ctl.append(mk, gp, pz, fm);
    const body = el('div', 'x176-body'), dw = el('div', 'x176-domew'), cv = el('canvas', 'x176-dome'); cv.id = 'x176Dome'; cv.setAttribute('aria-label', 'Alpha Radar 3D quantum constellation: 4 market quadrants, sweeping beam, opportunity orbs (higher and nearer the centre = better grade), transfer-entropy arcs; drag to orbit, wheel to zoom, tap an orb'); dw.append(cv, el('p', 'note mono x176-status', 'warming up: collecting live quotes…')); $1('.x176-status', dw).id = 'x176Status';
    const list = el('div', 'x176-list'); list.id = 'x176List'; list.setAttribute('aria-live', 'polite'); body.append(dw, list);
    s.append(hd, ctl, body); main.appendChild(s);
    TABS.radar = { show: () => { seed(); scan(true); paint(); }, render: () => {} };
    s.addEventListener('click', (e) => {
      const m = e.target.closest('[data-x176m]'); if (m) { U.mk = m.dataset.x176m; U.dome = null; paint(); return; }
      const g = e.target.closest('[data-x176g]'); if (g) { U.gr = g.dataset.x176g; U.dome = null; paint(); return; }
      if (e.target.closest('#x176Pause')) { U.paused = !U.paused; paint(); if (!U.paused) scan(true); return; }
      const a = e.target.closest('[data-x176a]'); if (a) { const p = ((U.res && U.res.picks) || []).find((x) => x.sym === a.closest('[data-sym]').dataset.sym); if (p && ACT[a.dataset.x176a]) ACT[a.dataset.x176a](p); return; }
      const c = e.target.closest('.x176-card'); if (c) { U.sel = c.dataset.sym; paintSel(); }
    });
    fm.addEventListener('submit', async (e) => { e.preventDefault(); const q = inp.value.trim(); if (!q) return; const s2 = await lookup(q); if (!s2) { T('Nothing found for that ticker / CA', 'amb'); return; } U.pins.add(s2); U.sel = s2; inp.value = ''; try { if (typeof Feed !== 'undefined') Feed.subscribe([s2]); } catch (er) { /* feed */ } U.sAt = 0; sample(); scan(true); T('Pinned ' + label(s2) + ' to the Alpha Radar', 'acc'); });
    const P5 = UI5(); if (P5 && P5.panel) { P5.panel(cv, 'radar', domeState, 240); P5.orbit(cv, U.cam, tap); }
    return true;
  };
  /* resolve any ticker / coin / perp / CA (same rules as the v17.5 search bars) */
  const lookup = async (q) => { const c = V175.classify(q); try { if (c.kind === 'evm-ca' || c.kind === 'sol-ca' || c.kind === 'name') { if (typeof OC === 'undefined') return null; const h = await OC.search(c.q); return h && h[0] ? h[0] : null; } if (c.kind === 'stock') return c.q; if (c.kind === 'perp') return c.q.replace(/-PERP$/, '-USD'); if (c.kind === 'crypto') return (typeof resolveSym === 'function' && resolveSym(c.q, 'crypto')) || c.q; } catch (e) { return null; } return null; };
  const domeState = () => { if (!U.dome) { const v = view().slice(0, 40), all = (U.res && U.res.picks) || [], idx = new Map(v.map((p, i) => [p.sym, i])), arcs = ((U.res && U.res.arcs) || []).map(([i, j, w]) => [idx.get((all[i] || {}).sym), idx.get((all[j] || {}).sym), w]).filter((a) => a[0] != null && a[1] != null); U.dome = { orbs: v.map((p) => ({ sym: p.sym, l: p.l, m: p.m, score: p.score, g: p.g, a: p.a })), arcs }; } return { data: U.dome, sel: U.sel, yaw: U.cam.yaw, pitch: U.cam.pitch, zoom: U.cam.zoom, paused: U.paused }; };
  /* tap → nearest orb using the renderer's own projection (V176.radarCam + radarPos) */
  const tap = (e) => { const cv = $1('#x176Dome'), b = cv.getBoundingClientRect(), d = Math.max(1, Math.min(3, devicePixelRatio || 1)), s = { W: b.width * d, H: b.height * d, t: performance.now() / 1000, yaw: U.cam.yaw, pitch: U.cam.pitch, zoom: U.cam.zoom }, P = V176.radarCam(s), x = (e.clientX - b.left) * d, y = (e.clientY - b.top) * d; let best = null, bd = 30 * d; for (const o of (U.dome && U.dome.orbs) || []) { const q = V176.radarPos(o), p = P(q[0], q[1], q[2]), dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = o; } } if (best) { U.sel = best.sym; paintSel(true); } };
  const paintSel = (scroll) => { for (const c of $$1('#x176List .x176-card')) c.classList.toggle('sel', c.dataset.sym === U.sel); if (scroll) { const c = $1('#x176List .x176-card.sel'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  const card = (p) => {
    const c = el('article', 'x176-card' + (p.sym === U.sel ? ' sel' : '')); c.dataset.sym = p.sym; c.tabIndex = 0;
    const h = el('div', 'x176-ch'); h.append(el('b', 'x176-sym', p.l), el('span', 'x176-mkc', p.m === 'dex' ? 'ON-CHAIN' + (p.sim ? ' · SIMULATED' : '') : p.m.toUpperCase()), el('span', 'x176-side ' + (p.side === 'long' ? 'up' : 'dn'), p.side.toUpperCase()), el('span', 'x176-gr x176-g' + p.g.replace('+', 'p'), p.g + ' ' + f2(p.score, 1))); c.appendChild(h);
    const dos = el('div', 'x176-dos'); for (const [k, v] of p.dossier) { const b = el('div', 'x176-box'); b.append(el('span', null, k), el('b', null, v)); dos.appendChild(b); } c.appendChild(dos);
    const vt = el('div', 'x176-votes'); for (const [b, x, why] of p.votes) { const v = el('span', 'x176-vote ' + (x > 0.15 ? 'up' : x < -0.15 ? 'dn' : ''), (x > 0.15 ? '▲ ' : x < -0.15 ? '▼ ' : '• ') + b); v.title = why; vt.appendChild(v); } c.appendChild(vt);
    c.appendChild(el('p', 'x176-sum', p.summary + ' ' + p.applied + ' engines applied · ' + p.n + ' live samples.'));
    const ac = el('div', 'x176-acts'); for (const [k, l] of [['chart', 'Chart + 3D'], ['shock', '3D Shock Test'], ['rr', 'Load R:R Ruler'], ['bot', 'Deploy Bot Rule']]) { const b = el('button', 'btn xs', l); b.type = 'button'; b.dataset.x176a = k; ac.appendChild(b); } c.appendChild(ac);
    return c;
  };
  const paint = () => {
    const s = $1('#tab-radar'); if (!s) return; const P = (U.res && U.res.picks) || [], C = V176.counts(P);
    for (const b of $$1('[data-x176m]', s)) { const k = b.dataset.x176m, n = k === 'all' ? C.all : C[k]; b.textContent = b.dataset.l + ' (' + n + ')'; const on = U.mk === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    const inMk = P.filter((p) => U.mk === 'all' || (U.mk === 'crypto' ? p.m === 'crypto' || p.m === 'perp' : p.m === U.mk)), CG = V176.counts(inMk);
    for (const b of $$1('[data-x176g]', s)) { const k = b.dataset.x176g; b.textContent = b.dataset.l + (k === 'all' ? '' : ' (' + CG[k] + ')'); b.classList.toggle('on', U.gr === k); b.setAttribute('aria-pressed', String(U.gr === k)); }
    const pz = $1('#x176Pause'); pz.textContent = U.paused ? 'Resume' : 'Pause'; pz.classList.toggle('on', U.paused); pz.setAttribute('aria-pressed', String(U.paused));
    const v = view(), list = $1('#x176List'); list.textContent = ''; if (!v.length) list.appendChild(el('p', 'note x176-none', P.length ? 'No picks at this grade in this market right now: lower the grade filter.' : 'Collecting live quotes: the first scan lands within a few seconds.')); for (const p of v.slice(0, 30)) list.appendChild(card(p));
    const st = $1('#x176Status'); if (st) { const warm = P.filter((p) => p.n < 32).length; st.textContent = `${P.length} graded · scan #${U.scans} in the Screener lane${U.paused ? ' · PAUSED' : ''}${warm ? ' · ' + warm + ' warming up (grades shrink toward neutral until 60 live samples)' : ''}`; }
  };
  U.paint = paint; U.scan = scan; U.view = view; U.universe = universe;

  /* ══ On-Chain Token Desk (On-Chain tab): chain pills · CA resolver + DexScreener hydration · Rug Shield v2 · MEV + TWAP · handoffs ══ */
  const OCD = U.desk = { chain: 'all', sym: null, rug: null, busy: false, list: [] };
  const DCH = [['all', 'All Chains'], ['solana', 'Solana'], ['base', 'Base'], ['eth', 'Ethereum'], ['arbitrum', 'Arbitrum']];
  const usdF = (v) => (!fin(v) ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'k' : '$' + v.toFixed(v < 10 ? 2 : 0));
  const pxF = (v) => (!fin(v) ? '–' : v >= 1 ? v.toFixed(4) : v.toPrecision(4));
  const chainOf = (s) => { const p = typeof OC !== 'undefined' && OC.parse(s); return p ? p.chain : ''; };
  const deskTokens = () => { const S = ocS(), sim = typeof OC !== 'undefined' && OC.sim; return Object.keys(S).filter((s) => /^oc:/.test(s) && S[s] && S[s].price > 0 && (chainOf(s) === 'sim') === !!sim && (OCD.chain === 'all' || chainOf(s) === OCD.chain || (sim && chainOf(s) === 'sim'))).sort((a, b) => (S[b].vol24 || 0) - (S[a].vol24 || 0)).slice(0, 40); };
  const loadChain = async (c) => { OCD.chain = c; paintDesk(); if (typeof OC === 'undefined' || !OC.universe) return; OCD.busy = true; paintDesk(); try { await OC.universe(c === 'all' ? OC.chain || 'solana' : c, 'trending'); } catch (e) { /* rate-limited: keep what is loaded */ } finally { OCD.busy = false; } /* All Chains = every pool already loaded + the default chain (one merge, not 4: GeckoTerminal allows ~30 calls / min) */ const L = deskTokens(); if (!OCD.sym || !L.includes(OCD.sym)) OCD.sym = L[0] || null; OCD.rug = null; paintDesk(); };
  const pick = (s) => { OCD.sym = s; OCD.rug = null; paintDesk(); scanRug(); };
  const resolveCA = async (q) => {
    const st = $1('#x176DkSt'); const c = V175.classify(q); if (!c.q) return null; if (st) st.textContent = 'resolving ' + q.slice(0, 16) + '… (DexScreener)';
    let hits = []; try { hits = typeof OC !== 'undefined' ? await OC.search(c.q) : []; } catch (e) { if (st) st.textContent = 'lookup failed: ' + String(e.message || e).slice(0, 60); return null; }
    const s = (hits || [])[0]; if (!s) { if (st) st.textContent = 'no DEX pair found for “' + q.slice(0, 24) + '”'; return null; }
    try { await OC.refreshPool(s); } catch (e) { /* DexScreener stats are already registered */ } // GeckoTerminal pool hydration (age, tx windows)
    const p = OC.parse(s); if (p && p.chain !== 'sim' && OCD.chain !== 'all' && OCD.chain !== p.chain) OCD.chain = p.chain;
    pick(s); const st2 = $1('#x176DkSt'); if (st2) st2.textContent = 'resolved ' + label(s) + ' · ' + (OC.title ? OC.title(s) : s); return s;
  };
  const scanRug = async () => { const s = OCD.sym; if (!s || typeof OC === 'undefined') return; const box = $1('#x176DkRug'); if (box) box.dataset.state = 'scanning'; let tr = []; try { tr = await OC.trades(s); } catch (e) { tr = []; } /* waits out a GeckoTerminal cool-down instead of scoring an empty window */ if (OCD.sym !== s) return; OCD.rug = V176.rug2(tr, ocS()[s] || {}, OC.meta[s] || {}, Date.now() / 1000); OCD.rug.trades = tr.length; paintDesk(); };
  const copyCA = async (s) => { const m = (typeof OC !== 'undefined' && OC.meta[s]) || {}, ca = m.ca || (OC.parse(s) || {}).pool || ''; if (!ca) { T('No contract address for this pool', 'amb'); return false; } let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(ca); ok = true; } } catch (e) { ok = false; } if (!ok) { const ta = el('textarea'); ta.value = ca; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); } OCD.copied = ok ? ca : null; T(ok ? 'Copied CA ' + ca.slice(0, 6) + '…' + ca.slice(-4) : 'Clipboard blocked: CA is ' + ca, ok ? 'acc' : 'amb'); return ok; };
  const DACT = {
    chart(s) { select(s); showTab('markets'); T('Loaded ' + label(s) + ' on the main chart', 'acc'); },
    shock(s) { select(s); showTab('lab'); setTimeout(() => { try { UI5().shock.run(); } catch (e) { /* lab not mounted */ } }, 700); T('3D Shock Lab: stress-testing ' + label(s), 'acc'); },
    copy(s) { copyCA(s); },
  };
  OCD.act = DACT; OCD.load = loadChain; OCD.resolve = resolveCA; OCD.scan = scanRug;
  const mountDesk = () => {
    const tab = $1('#tab-whales'); if (!tab || $1('#x176Desk')) return !!$1('#x176Desk');
    const d = el('section', 'x176-desk'); d.id = 'x176Desk'; d.setAttribute('aria-label', 'On-Chain Token Desk');
    const hd = el('div', 'x176-dkh'); hd.append(el('b', null, 'ON-CHAIN TOKEN DESK'), el('span', 'note', 'pick a pool or paste any CA · Rug Shield v2 · MEV + TWAP · paper-only, nothing here signs a transaction'));
    const ch = el('div', 'x176-seg'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', 'Chain'); for (const [k, l] of DCH) { const b = el('button', null, l); b.type = 'button'; b.dataset.x176c = k; ch.appendChild(b); }
    const fm = el('form', 'x176-pin x176-ca'); const inp = el('input'); inp.type = 'search'; inp.id = 'x176DkQ'; inp.placeholder = 'Search / paste meme coin CA…'; inp.setAttribute('aria-label', 'Search a token or paste a contract address'); inp.maxLength = 90; inp.autocomplete = 'off'; const go = el('button', 'btn xs pri', 'Resolve'); go.type = 'submit'; fm.append(inp, go);
    const top = el('div', 'x176-ctl'); top.append(ch, fm);
    const toks = el('div', 'x176-toks'); toks.id = 'x176DkToks'; toks.setAttribute('role', 'listbox'); toks.setAttribute('aria-label', 'Pools');
    const grid = el('div', 'x176-dkg');
    const info = el('div', 'x176-box x176-dki'); info.id = 'x176DkInfo';
    const rug = el('div', 'x176-box x176-dkr'); rug.id = 'x176DkRug'; const rb = el('button', 'btn xs', 'Re-scan'); rb.type = 'button'; rb.dataset.x176d = 'rescan';
    const mev = el('div', 'x176-box x176-dkm'); mev.id = 'x176DkMev'; const mi = (id, l, v) => { const lab = el('label', null, l); const i = el('input', 'mono'); i.id = id; i.value = v; i.inputMode = 'decimal'; i.setAttribute('aria-label', l); lab.appendChild(i); return lab; };
    const mrow = el('div', 'x176-mevin'); mrow.append(mi('x176MvUsd', 'Size $', '1000'), mi('x176MvFee', 'Priority fee $', '0.05'), mi('x176MvN', 'TWAP slices', '6')); const mo = el('dl', 'x175-dl'); mo.id = 'x176MvOut'; mev.append(el('span', null, 'MEV PRIORITY-FEE SANDWICH PREDICTOR & TWAP SLICER'), mrow, mo);
    grid.append(info, rug, mev);
    const acts = el('div', 'x176-acts'); for (const [k, l] of [['chart', 'Load on Main Chart'], ['shock', '3D Shock Lab'], ['copy', 'Copy CA']]) { const b = el('button', 'btn sm', l); b.type = 'button'; b.dataset.x176da = k; acts.appendChild(b); }
    d.append(hd, top, toks, grid, acts, el('p', 'note mono x176-status', '')); $1('.x176-status', d).id = 'x176DkSt';
    rug.append(el('span', null, 'RUG SHIELD v2'), el('div', 'x176-rugl'), rb);
    const anchor = $1(':scope > .x175-edge', tab) || $1(':scope > .x171-search', tab); if (anchor) anchor.after(d); else tab.prepend(d);
    d.addEventListener('click', (e) => {
      const c = e.target.closest('[data-x176c]'); if (c) { loadChain(c.dataset.x176c); return; }
      const t = e.target.closest('[data-x176t]'); if (t) { pick(t.dataset.x176t); return; }
      const a = e.target.closest('[data-x176da]'); if (a) { if (!OCD.sym) { T('Pick a pool or resolve a CA first', 'amb'); return; } DACT[a.dataset.x176da](OCD.sym); return; }
      if (e.target.closest('[data-x176d="rescan"]')) scanRug();
    });
    d.addEventListener('input', (e) => { if (/^x176Mv/.test(e.target.id || '')) paintMev(); });
    fm.addEventListener('submit', (e) => { e.preventDefault(); const q = inp.value.trim(); if (q) resolveCA(q); });
    return true;
  };
  const paintMev = () => { const o = $1('#x176MvOut'); if (!o) return; const st = (OCD.sym && ocS()[OCD.sym]) || {}, num = (id, d) => { const v = parseFloat(($1('#' + id) || {}).value); return fin(v) && v >= 0 ? v : d; }, sz = num('x176MvUsd', 1000), fee = num('x176MvFee', 0.05), n = num('x176MvN', 6); o.textContent = ''; if (!(st.liq > 0)) { o.append(el('dt', null, 'pool liquidity'), el('dd', null, 'unknown: pick a pool')); return; } const r = V176.twap(sz, st.liq, n, fee); for (const [k, v] of [['one clip impact', f2(r.oneImpact * 100, 2) + '% · ≈ ' + usdF(r.oneCost)], ['sandwich odds (one clip)', f2(r.mevOne * 100, 0) + '%'], ['TWAP ' + r.n + ' × ' + usdF(r.slice), f2(r.sliceImpact * 100, 3) + '% each · ≈ ' + usdF(r.twapCost)], ['sandwich odds (per slice)', f2(r.mevSlice * 100, 0) + '%'], ['saved vs one clip', usdF(r.saved)], ['safe slippage tolerance', f2(r.safeTol * 100, 2) + '%']]) o.append(el('dt', null, k), el('dd', null, v)); };
  const paintDesk = () => {
    const d = $1('#x176Desk'); if (!d) return; for (const b of $$1('[data-x176c]', d)) { const on = b.dataset.x176c === OCD.chain; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const L = deskTokens(), tk = $1('#x176DkToks'); OCD.list = L; if (OCD.sym && !ocS()[OCD.sym]) OCD.sym = null; if (!OCD.sym && L.length) OCD.sym = L[0];
    const key = L.join() + '|' + OCD.sym; if (tk._k !== key) { tk._k = key; tk.textContent = ''; if (!L.length) tk.appendChild(el('span', 'note', OCD.busy ? 'loading pools…' : 'no pools loaded for this chain yet')); for (const s of L.slice(0, 24)) { const st = ocS()[s], b = el('button', 'x176-tok' + (s === OCD.sym ? ' on' : '')); b.type = 'button'; b.dataset.x176t = s; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(s === OCD.sym)); b.append(el('b', null, label(s)), el('span', fin(st.ch24) ? (st.ch24 >= 0 ? 'up' : 'dn') : '', fin(st.ch24) ? (st.ch24 >= 0 ? '+' : '') + st.ch24.toFixed(1) + '%' : '–')); tk.appendChild(b); } }
    const s = OCD.sym, st = (s && ocS()[s]) || {}, me = (s && typeof OC !== 'undefined' && OC.meta[s]) || {}, inf = $1('#x176DkInfo'); inf.textContent = '';
    inf.append(el('span', null, s ? (me.n || label(s)) + ' · ' + (chainOf(s) === 'sim' ? 'simulated' : (((typeof OC !== 'undefined' && OC.CHAINS[chainOf(s)]) || [])[0] || chainOf(s))) : 'NO POOL SELECTED'));
    const dl = el('dl', 'x175-dl'); for (const [k, v] of [['price', pxF(st.price)], ['5m / 1h / 6h / 24h', [st.ch5m, st.ch1h, st.ch6h, st.ch24].map((x) => (fin(x) ? (x >= 0 ? '+' : '') + x.toFixed(1) + '%' : '–')).join(' · ')], ['liquidity', usdF(st.liq)], ['24h volume', usdF(st.vol24)], ['mcap / FDV', usdF(st.mcap || st.fdv)], ['CA', me.ca ? me.ca.slice(0, 6) + '…' + me.ca.slice(-4) : '–']]) dl.append(el('dt', null, k), el('dd', null, v)); inf.appendChild(dl);
    const rl = $1('#x176DkRug .x176-rugl'); rl.textContent = ''; const R = OCD.rug;
    if (!R) rl.appendChild(el('p', 'note', s ? 'scanning recent swaps…' : 'pick a pool')); else { const sc = el('b', 'x176-rugsc ' + (R.score == null ? '' : R.score >= 75 ? 'up' : R.score >= 50 ? 'gold' : 'dn'), R.score == null ? 'score n/a' : R.score + '/100 (' + R.measured + '/4 measured · ' + R.trades + ' swaps)'); rl.appendChild(sc); for (const [n, stt, txt] of R.checks) { const r = el('div', 'x176-rug ' + stt); r.append(el('span', null, n), el('i', null, stt.toUpperCase()), el('em', null, txt)); rl.appendChild(r); } }
    $1('#x176DkRug').dataset.state = R ? 'done' : 'idle';
    paintMev(); const stt = $1('#x176DkSt'); if (stt && !/^resolving|^resolved|^no DEX|^lookup/.test(stt.textContent)) stt.textContent = `${L.length} pools · ${OCD.chain === 'all' ? 'all chains' : OCD.chain}${OCD.busy ? ' · loading…' : ''}${typeof OC !== 'undefined' && OC.sim ? ' · DEX APIs unreachable: simulated pools' : ''}`;
  };
  U.paintDesk = paintDesk;

  /* ══ boot ══ */
  /* the nav is ordered with inline CSS order by older modules: sit right after Lab (same order value, later in the DOM) */
  const navOrder = () => { const nb = $1('#x176Nav'), lab = $1('#nav button[data-tab="lab"]'); if (nb && lab && nb.style.order !== lab.style.order) nb.style.order = lab.style.order || getComputedStyle(lab).order; };
  const tick = () => { try { navOrder(); if (mountDesk() && typeof curTab !== 'undefined' && curTab === 'whales' && !document.hidden) { if (!OCD.started) { OCD.started = true; loadChain('all'); } paintDesk(); } if (mount() && typeof curTab !== 'undefined' && curTab === 'radar' && !document.hidden) { seed(); sample(); scan(); } else if (U.rings.size) sample(); } catch (e) { console.warn('v176', e); } };
  /* phones (< 820 px) hide the nav: the dock's "More" sheet gets an Alpha Radar chip next to the 14 workspaces */
  const moreChip = () => { const g = $1('#x17Sheet:not([hidden]) .x17-mreach'); if (!g || $1('#x176More', g)) return; const b = el('button', 'btn sm', '◎ Alpha Radar'); b.type = 'button'; b.id = 'x176More'; b.addEventListener('click', () => { const s = $1('#x17Sheet'); if (s) s.hidden = true; showTab('radar'); }); g.appendChild(b); };
  U.start = () => { if (U.mounted) return; U.mounted = true; tick(); setInterval(() => { tick(); moreChip(); }, 1000); document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-x17d]')) setTimeout(moreChip, 0); }, true); };
  U.tick = tick;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b176 = boot; boot = async function () { await _b176.apply(this, arguments); try { V176UI.start(); } catch (e) { console.warn('v176 init', e); } }; }
