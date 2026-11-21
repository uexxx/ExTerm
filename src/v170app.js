/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.0 Pro UI, PHASES 2 + 3 (maths in V17P, v170pro.js). Zero clutter on the chart canvas: every surface is
   one click away on the one-line Reach strip under the nav; chart additions are thin overlays painted from a cached
   offscreen layer that only repaints when its dirty flag is set.
   · Reach strip           17 one-click chips (Stocks … Briefing) + 🎙 voice
   · Quant Lab Edge-Coach  inside the Lab tab: MFE/MAE, 4h shadows, heatmap, overfitting score, prop sim, R:R heatmap with
                           1-click Apply to Chart, Kelly sizer, slippage re-sim, CSV import, Pine v5 linter, tear sheet,
                           Send Leaks to AI Coach, sanitized .exterm.json playbooks
   · 2-layer canvas        offscreen static layer (levels, walls, blocks, NET BE, ruler) + dirty-flag scheduler + spatial hash
   · Bot Fleet tab         no-bot gate + demo, 3 modes, 5-step arming wizard, 240 Hz Float32Array torus (0 fps when hidden),
                           self-improving loop, co-pilot approval queue, guarded dispatch to your own 127.0.0.1 bot
   · Briefing modal        once per new day + header pill: morning levels (1-click plot all), movers, events, 7-day history
   · Options / Futures / Pulse / 3D tabs, GEX walls, DOM spoof ladder, 6-TF confluence pill, 2×2 sync, R:R ruler,
     NET BE line, smart trailing stops, voice commands, Bull/Bear/Risk debate
   Strict CSP: listeners only, text through esc() / textContent. */
const V17App = (() => {
  const U = { mounted: false, layer: null, levels: {}, gexOn: true, liqOn: false, obOn: false, ruler: null, rulerOn: false, dom: [], spoofs: [], torus: { raf: 0, fps: 0, t: 0, frames: 0, last: 0 }, coach: null, queue: [], spent: 0 };
  const $1 = (s, r) => (r || document).querySelector(s), $$1 = (s, r) => [...(r || document).querySelectorAll(s)];
  const E = (s) => (typeof esc === 'function' ? esc(s) : V17P.esc(s));
  const T = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const CFG = 'exterm.v17app';
  const cfg = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem(CFG) || '{}') || {}; } catch (e) { o = {}; } return Object.assign({ mode: 'paper', arm: { armed: false }, netbe: true, trail: 'off', prop: 100000, slip: 10, briefDay: '', briefHist: [], gex: true, liq: false, ob: false, conf: true, botUrl: '', events: [], grid4: false, academy: {}, pb: [] }, o); })();
  const save = () => { try { localStorage.setItem(CFG, JSON.stringify(cfg)); } catch (e) { /* session only */ } };
  U.cfg = cfg; U.save = save;
  const fmt = (v, d) => (Number.isFinite(v) ? (typeof NT !== 'undefined' && NT.fmtPrice && d == null ? NT.fmtPrice(v) : (+v).toFixed(d == null ? 2 : d)) : '–');
  const usd = (v) => (Number.isFinite(v) ? (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '–');
  const pct = (v, d) => (Number.isFinite(v) ? (v * 100).toFixed(d == null ? 1 : d) + '%' : '–');
  const sym = () => (typeof ST !== 'undefined' ? ST.sel : '');
  const candles = () => (typeof chart !== 'undefined' && chart && chart.data ? chart.data : []);
  const tfSec = () => (typeof chart !== 'undefined' && chart ? chart.tfSec || 60 : 60);
  const lastPx = () => { const C = candles(); return C.length ? C[C.length - 1].c : 0; };
  const mission = (k) => { if (!cfg.academy[k]) { cfg.academy[k] = Date.now(); save(); if (typeof V17Mob !== 'undefined' && V17Mob.onMission) V17Mob.onMission(k); } };
  U.mission = mission;
  const nyOff = () => { try { const d = new Date(), s = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false }); const ny = new Date(s); return Math.round((ny - new Date(d.toLocaleString('en-US', { timeZone: 'UTC', hour12: false }))) / 60000); } catch (e) { return -300; } };

  /* ══ 1. Reach strip: 17 surfaces, one click each ══ */
  const REACH_GO = {
    'Stocks': () => { if (typeof setMode === 'function') setMode('stocks'); showTab('markets'); },
    'Crypto': () => { if (typeof setMode === 'function') setMode('crypto'); showTab('markets'); },
    'On-Chain': () => { if (typeof setMode === 'function') setMode('onchain'); showTab('markets'); },
    'Options': () => showTab('opts'), 'Futures': () => showTab('futs'), 'Screener': () => showTab('heat'), 'Pulse': () => showTab('pulse'),
    'Bot Fleet': () => showTab('fleet'), 'Academy': () => showTab('academy'),
    'Live Tape': () => { showTab('markets'); if (typeof V166UI !== 'undefined') V166UI.toggle(true); },
    'Whales $25K+': () => { showTab('markets'); if (typeof V166UI !== 'undefined') { V166UI.toggle(true); V166UI.minUsd = 25000; V166UI.dirty = true; const m = $1('#v166Min'); if (m) m.value = '25000'; try { V166UI.refilter(true); } catch (e) { /* tape not ready */ } } },
    'Tracker': () => showTab('whales'), 'Positions': () => showTab('port'), 'Briefing': () => Brief.open(true),
  };
  const ICON = { 'Stocks': '▲', 'Crypto': '◆', 'On-Chain': '⬡', 'Options': 'Ω', 'Futures': '≋', 'Screener': '⌕', 'Pulse': '◉', '3D': '◈', 'Bot Fleet': '⚙', 'Quant Lab': 'ƒ', 'AI Bridge': '⇄', 'Academy': '🎓', 'Live Tape': '▤', 'Whales $25K+': '🐋', 'Tracker': '⌖', 'Positions': '▣', 'Briefing': '☀' };
  const mountReach = () => {
    const nav = $1('#nav'); if (!nav || $1('#x17Reach')) return;
    const r = document.createElement('div'); r.id = 'x17Reach'; r.className = 'x17-reach'; r.setAttribute('role', 'toolbar'); r.setAttribute('aria-label', 'Reach every workspace in one click');
    r.innerHTML = V17P.REACH.map((n) => `<button type="button" class="x17-rc" data-x17r="${E(n)}"><span aria-hidden="true">${ICON[n] || '·'}</span>${E(n)}</button>`).join('') + '<button type="button" class="x17-rc x17-mic" id="x17Mic" aria-label="Voice command" title="Voice command (V)">🎙</button>';
    nav.after(r);
    r.addEventListener('click', (e) => { const b = e.target.closest('[data-x17r]'); if (b) { const f = REACH_GO[b.dataset.x17r]; if (f) f(); paintReach(); return; } if (e.target.closest('#x17Mic')) Voice.listen(); });
  };
  const ACT = { markets: null, opts: 'Options', futs: 'Futures', heat: 'Screener', pulse: 'Pulse', fleet: 'Bot Fleet', academy: 'Academy', whales: 'Tracker', port: 'Positions' };
  const paintReach = () => {
    const tab = typeof curTab !== 'undefined' ? curTab : 'markets', mode = typeof ST !== 'undefined' ? ST.mode : 'crypto', on = tab === 'markets' ? (mode === 'stocks' ? 'Stocks' : mode === 'onchain' ? 'On-Chain' : 'Crypto') : ACT[tab];
    for (const b of $$1('#x17Reach [data-x17r]')) { const a = b.dataset.x17r === on; if (b.classList.contains('on') !== a) { b.classList.toggle('on', a); b.setAttribute('aria-pressed', String(a)); } }
  };

  /* ══ 2. tab scaffolding ══ */
  const TABDEF = [['fleet', 'Bot Fleet'], ['pulse', 'Pulse'], ['opts', 'Options'], ['futs', 'Futures']]; // v17.1: 3D lives on the main chart toolbar (v171.js)
  const mountTabs = () => {
    const main = $1('main'); if (!main || $1('#tab-fleet')) return;
    for (const [id, name] of TABDEF) { const s = document.createElement('section'); s.id = 'tab-' + id; s.className = 'tab x17-tab'; s.setAttribute('aria-label', name); main.appendChild(s); }
    TABS.fleet = { show: () => Fleet.show(), render: () => {} }; TABS.pulse = { show: () => Pulse.show(), render: () => {} }; TABS.opts = { show: () => Opts.show(), render: () => {} }; TABS.futs = { show: () => Futs.show(), render: () => {} };
    // the torus and 3D scene stop (0 fps) the moment their tab is hidden
    if (typeof showTab === 'function' && !showTab._x17) { const o = showTab; showTab = function (n) { const r = o.apply(this, arguments); try { if (n !== 'fleet') Fleet.stop(); if (n !== 'd3') D3.stop(); const bo = $1('#x17Brief'); if (bo && bo.dataset.auto === '1' && n !== 'markets') bo.remove(); paintReach(); } catch (e) { /* never block navigation */ } return r; }; showTab._x17 = true; } // eslint-disable-line no-func-assign
  };
  const card = (id, title, body, extra) => `<section class="x17-card${extra ? ' ' + extra : ''}" id="${id}"><h3>${title}</h3>${body}</section>`;

  /* ══ 3. 2-layer canvas: offscreen static layer + dirty-flag scheduler + spatial hit-testing ══ */
  const Layer = U.layerApi = (() => {
    const L = { cv: null, g: null, key: '', grid: new V17P.SpatialGrid(24), sched: new V17P.Scheduler(['static', 'live']), hits: 0, builds: 0 };
    const lines = () => {
      const out = [], s = sym(), lv = U.levels[s]; if (lv) for (const [k, v] of Object.entries(lv)) if (Number.isFinite(v)) out.push({ p: v, label: V17P.LEVEL_NAMES[k] || k, col: '#F5C84B', dash: [4, 4] });
      if (cfg.gex && U.gex && U.gex.sym === s) { const G = U.gex.r; if (G.flip) out.push({ p: G.flip, label: 'GEX Flip', col: '#B388FF', dash: [6, 3] }); if (G.callWall) out.push({ p: G.callWall, label: 'Call Wall', col: '#2ECC8F', dash: [2, 3] }); if (G.putWall) out.push({ p: G.putWall, label: 'Put Wall', col: '#EF4444', dash: [2, 3] }); }
      if (cfg.liq && U.liq && U.liq.sym === s) { for (const x of U.liq.r.longs.slice(0, 3)) out.push({ p: x.px, label: 'Long liq ' + usd(x.usd), col: '#FF8A65', dash: [1, 3] }); for (const x of U.liq.r.shorts.slice(0, 3)) out.push({ p: x.px, label: 'Short liq ' + usd(x.usd), col: '#4FC3F7', dash: [1, 3] }); }
      const be = netBE(); if (cfg.netbe && be) out.push({ p: be, label: 'NET BE', col: '#E8E6E1', dash: [] });
      if (U.rrApplied && U.rrApplied.sym === s) { out.push({ p: U.rrApplied.sl, label: 'SL ' + U.rrApplied.slx + '×ATR', col: '#EF4444', dash: [5, 2] }); out.push({ p: U.rrApplied.tp, label: 'TP ' + U.rrApplied.tpx + '×ATR', col: '#2ECC8F', dash: [5, 2] }); }
      return out;
    };
    L.lines = lines;
    const build = (L0, ch) => {
      const W = L0.W, H = L0.H || (ch.cv ? ch.cv.height / (devicePixelRatio || 1) : 400), dpr = Math.max(1, Math.min(3, typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1));
      if (!L.cv) { L.cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'); L.g = L.cv.getContext('2d'); }
      if (L.cv.width !== Math.round(W * dpr) || L.cv.height !== Math.round(H * dpr)) { L.cv.width = Math.round(W * dpr); L.cv.height = Math.round(H * dpr); }
      const g = L.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); L.grid.clear(); L.builds++;
      const top = L0.y0, bot = L0.y0 + L0.mainH - (L0.volH || 0) - 4, x0 = L0.Lm, x1 = W - L0.Rm;
      g.save(); g.beginPath(); g.rect(x0, top, x1 - x0, bot - top); g.clip(); g.font = '600 10px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
      if (cfg.ob && U.obs && U.obs.sym === sym()) for (const b of U.obs.list) { const xa = ch.tToX(b.t), ya = L0.py(b.top), yb = L0.py(b.bot); g.fillStyle = b.side === 'bull' ? 'rgba(46,204,143,.10)' : 'rgba(255,92,108,.10)'; g.fillRect(xa, ya, Math.max(4, (b.mitigated ? ch.tToX(b.mt) : x1) - xa), yb - ya); }
      for (const l of lines()) { const y = L0.py(l.p); if (!(y >= top && y <= bot)) continue; g.strokeStyle = l.col; g.globalAlpha = 0.85; g.lineWidth = 1; g.setLineDash(l.dash); g.beginPath(); g.moveTo(x0, Math.round(y) + 0.5); g.lineTo(x1, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]);
        const tw = g.measureText(l.label).width + 8, lx = x1 - tw - 2; g.globalAlpha = 0.92; g.fillStyle = '#07080B'; g.fillRect(lx, y - 7, tw, 14); g.fillStyle = l.col; g.fillText(l.label, lx + 4, y); L.grid.insert(lx, y - 7, tw, 14, l); }
      g.globalAlpha = 1; g.restore();
    };
    /* overlay: the expensive drawing happens only when the view key changes; otherwise one drawImage */
    L.overlay = (g, L0, ch) => {
      if (typeof chart === 'undefined' || ch !== chart || !L0 || !L0.py || !L0.D || !L0.D.length) return;
      const k = [L0.W, L0.H, L0.hi, L0.lo, L0.end, L0.bars, L0.y0, L0.mainH, sym(), U.ver || 0, cfg.gex, cfg.liq, cfg.ob, cfg.netbe].join('|');
      if (k !== L.key) { L.key = k; L.sched.mark('static'); }
      L.sched.on('static', () => build(L0, ch)).on('live', () => {}); L.sched.tick();
      if (L.cv && L.cv.width) g.drawImage(L.cv, 0, 0, L.cv.width / Math.max(1, Math.min(3, devicePixelRatio || 1)), L.cv.height / Math.max(1, Math.min(3, devicePixelRatio || 1)));
      if (U.rulerOn && U.ruler && U.ruler.a && U.ruler.b) Ruler.draw(g, L0, ch);
    };
    L.dirty = () => { U.ver = (U.ver || 0) + 1; if (typeof chart !== 'undefined' && chart) chart.invalidate(); };
    L.hitTest = (x, y) => { L.hits++; return L.grid.hit(x, y); };
    L.attach = () => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(L.overlay)) chart.overlays.push(L.overlay); if (chart.cv && !chart.cv._x17) { chart.cv._x17 = true; chart.cv.addEventListener('pointermove', (e) => { const r = chart.cv.getBoundingClientRect(), h = L.hitTest(e.clientX - r.left, e.clientY - r.top); chart.cv.title = h ? h.label + ' · ' + fmt(h.p) : ''; Ruler.move(e); }); chart.cv.addEventListener('pointerdown', (e) => Ruler.down(e), true); } };
    return L;
  })();

  /* NET BE line for the open paper position (fees + slippage still to pay on the way out) */
  const netBE = () => { if (typeof ACC === 'undefined') return null; const p = ACC.pos[sym()]; if (!p || !(p.qty > 0)) return null; return V17P.netBE(p.cost / p.qty, p.qty, ACC.fee, ACC.slip, 0, 1); };
  U.netBE = netBE;

  /* R:R ruler: toggle, click entry, click stop, the live price reads in R */
  const Ruler = {
    toggle(on) { U.rulerOn = on == null ? !U.rulerOn : !!on; U.ruler = U.rulerOn ? { a: null, b: null } : null; const b = $1('#x17RulerBtn'); if (b) { b.classList.toggle('on', U.rulerOn); b.setAttribute('aria-pressed', String(U.rulerOn)); } if (U.rulerOn) T('R:R Ruler: click your entry, then your stop'); Layer.dirty(); },
    pt(e) { const r = chart.cv.getBoundingClientRect(); return chart.toTP(e.clientX - r.left, e.clientY - r.top); },
    down(e) { if (!U.rulerOn || typeof chart === 'undefined' || !chart) return; const p = this.pt(e); if (!p) return; e.stopPropagation(); e.preventDefault(); const R = U.ruler; if (!R.a || R.done) { U.ruler = { a: p, b: null }; } else { R.b = p; R.done = true; const m = V17P.rr(R.a.p, R.b.p, lastPx()); if (m) { if (Math.abs((m.t2 - R.a.p) / m.r) >= 2) mission('ruler'); T(`Risk ${fmt(m.r)} · price now ${m.mult >= 0 ? '+' : ''}${m.mult.toFixed(2)}R · 2R target ${fmt(m.t2)}`, 'acc'); } } chart.invalidate(); },
    move(e) { if (!U.rulerOn || !U.ruler || !U.ruler.a || U.ruler.done) return; const p = this.pt(e); if (p) { U.ruler.b = p; chart.invalidate(); } },
    draw(g, L0, ch) { const R = U.ruler, m = V17P.rr(R.a.p, R.b.p, lastPx()); if (!m) return; const x0 = ch.tToX(R.a.t), x1 = L0.W - L0.Rm, y = (p) => L0.py(p); g.save(); g.globalAlpha = 0.16; g.fillStyle = '#EF4444'; g.fillRect(x0, Math.min(y(R.a.p), y(R.b.p)), x1 - x0, Math.abs(y(R.a.p) - y(R.b.p))); g.fillStyle = '#2ECC8F'; g.fillRect(x0, Math.min(y(R.a.p), y(m.t3)), x1 - x0, Math.abs(y(R.a.p) - y(m.t3))); g.globalAlpha = 1; g.font = '600 10px Inter, sans-serif'; g.fillStyle = '#F5C84B';
      for (const [p, l] of [[m.t1, '1R'], [m.t2, '2R'], [m.t3, '3R']]) { g.fillRect(x0, y(p), x1 - x0, 1); g.fillText(l + ' ' + fmt(p), x0 + 4, y(p) - 4); } g.fillText(`${m.mult >= 0 ? '+' : ''}${m.mult.toFixed(2)}R now`, x0 + 4, y(R.a.p) + 12); g.restore(); },
  };
  U.ruler_ = Ruler;

  /* chart toolbar: 2×2 · R:R · trailing (one compact group, outside the canvas) */
  const mountToolbar = () => {
    const tb = $1('#x17Reach'); if (!tb || $1('#x17Tools')) return; // on the Reach strip: the chart toolbar stays one row
    const g = document.createElement('div'); g.className = 'seg x17-tools'; g.id = 'x17Tools'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'v17 chart tools');
    g.innerHTML = `<button type="button" id="x17RulerBtn" aria-pressed="false" title="R:R Ruler: click entry, then stop">R:R</button><button type="button" id="x17GridBtn" aria-pressed="false" title="2×2 multi-chart with synced crosshair">2×2</button><select id="x17Trail" class="in xs" title="Smart trailing stop for the open paper position" aria-label="Smart trailing stop"><option value="off">Trail</option><option value="atr">ATR×3</option><option value="structure">Swing</option><option value="be">BE+1R</option></select>`;
    const mic = $1('#x17Mic', tb); if (mic) mic.before(g); else tb.appendChild(g);
    g.addEventListener('click', (e) => { if (e.target.closest('#x17RulerBtn')) Ruler.toggle(); else if (e.target.closest('#x17GridBtn')) Grid4.toggle(); });
    const tr = $1('#x17Trail'); tr.value = cfg.trail; tr.addEventListener('change', () => { cfg.trail = tr.value; save(); T('Smart trail: ' + (tr.value === 'off' ? 'off' : tr.options[tr.selectedIndex].text)); });
  };
  /* smart trailing stop: only tightens the paper position's stop */
  const trailTick = () => {
    if (cfg.trail === 'off' || typeof ACC === 'undefined') return; const s = sym(), p = ACC.pos[s]; if (!p || !(p.qty > 0)) return;
    const ns = V17P.trail(candles(), { entry: p.cost / p.qty, sl: p.sl, dir: 1, t0: p.t0 > 1e11 ? p.t0 / 1000 : p.t0 }, cfg.trail, 3); if (ns != null) { p.sl = ns; if (typeof saveState === 'function') saveState(); Layer.dirty(); }
  };

  /* 2×2 multi-chart, crosshair synced by time */
  const Grid4 = {
    on: false, charts: [],
    toggle() { this.on = !this.on; cfg.grid4 = this.on; save(); const b = $1('#x17GridBtn'); if (b) { b.classList.toggle('on', this.on); b.setAttribute('aria-pressed', String(this.on)); } this.on ? this.mount() : this.unmount(); },
    syms() { const w = (typeof ST !== 'undefined' && ST.watch) || []; const out = [sym()]; for (const s of w) if (!out.includes(s) && out.length < 4) out.push(s); while (out.length < 4) out.push(out[out.length - 1]); return out; },
    mount() {
      const host = $1('#chartHost'); if (!host || $1('#x17Grid') || typeof CandleChart === 'undefined') return;
      const g = document.createElement('div'); g.id = 'x17Grid'; g.className = 'x17-grid'; host.after(g); host.hidden = true;
      this.charts = this.syms().map((s, i) => { const c = document.createElement('div'); c.className = 'x17-gc'; c.innerHTML = `<span class="x17-gl">${E(typeof baseOf === 'function' ? baseOf(s) : s)}</span>`; g.appendChild(c); const ch = new CandleChart(c); ch.o.vol = false; ch.x17sym = s; ch.onHover = (t) => this.sync(t, i); c.addEventListener('dblclick', () => { this.toggle(); if (typeof selectSym === 'function') selectSym(s); }); return ch; });
      this.feed();
    },
    feed() { for (const ch of this.charts) { const st = typeof getStore === 'function' ? getStore(ch.x17sym, ST.tf) : null; if (!st) continue; if (!st.loaded && !st.loading) st.load(300); ch.set(st.candles.slice(-600), st.sec || tfSec()); } },
    sync(t, from) { this.charts.forEach((ch, i) => { if (i === from || !ch.L || !ch.L.D || !ch.L.D.length) return; ch.mouse = t == null ? null : { x: ch.tToX(t), y: ch.L.y0 + ch.L.mainH / 2 }; ch.invalidate(false); }); },
    unmount() { const g = $1('#x17Grid'); if (g) g.remove(); const h = $1('#chartHost'); if (h) h.hidden = false; this.charts = []; if (typeof chart !== 'undefined' && chart) chart.invalidate(); },
  };
  U.grid4 = Grid4;

  /* ══ 4. Quant Lab Edge-Coach ══ */
  const Coach = {
    src() {
      if (U.csvRun) return U.csvRun;
      if (typeof lastBt !== 'undefined' && lastBt && lastBt.res) return { kind: 'Last backtest', sym: lastBt.sym, strategy: (NT.strategies[lastBt.S.strat] || {}).name || lastBt.S.strat, tf: ST.tf, candles: lastBt.candles, trades: lastBt.res.trades, eq: lastBt.res.eq, stats: lastBt.res.stats, strat: lastBt.S.strat, params: lastBt.S.params };
      if (typeof ACC !== 'undefined' && V17P.roundTrips(ACC.trades.filter((t) => t.sym === sym())).length >= 3) return { kind: 'Paper account', sym: sym(), strategy: 'Manual paper trades', tf: ST.tf, candles: candles(), trades: ACC.trades.filter((t) => t.sym === sym()), eq: ACC.eq.map((x) => (typeof x === 'number' ? x : x.v || x.e || 0)).filter((x) => x > 0), stats: null };
      return null;
    },
    /* demo source: EMA cross on the chart's candles (works offline, so the panel is never empty) */
    demo() { const C = candles(); if (C.length < 120 || typeof NT === 'undefined' || !NT.strategies.smacross) return null; const p = NT.defaultParams('smacross'), r = NT.backtest(C, NT.strategies.smacross, p, { tfSec: tfSec(), fee: 0.001, slip: 0.0005 }); return { kind: 'Demo · EMA Crossover on the chart', sym: sym(), strategy: 'EMA Crossover', tf: ST.tf, candles: C, trades: r.trades, eq: r.eq, stats: r.stats, strat: 'smacross', params: p }; },
    run() {
      const s = this.src() || this.demo(); if (!s) { this.paint(null); return null; }
      const C = (s.candles || []).map((c) => ({ t: V17P.toSec(c.t), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })), rts = V17P.roundTrips(s.trades);
      const ex = rts.map((r) => V17P.excursion(r, C)), sh = rts.map((r) => V17P.shadow(r, C, 14400)), heat = V17P.heatmap(rts), st = V17P.statsOf(s.eq || []);
      let folds = []; if (s.strat && typeof NT !== 'undefined' && NT.strategies[s.strat] && C.length >= 200) { for (const f of V17P.wfFolds(C.length, 4)) { try { const isR = NT.backtest(C.slice(0, f.isTo + 1), NT.strategies[s.strat], s.params, { tfSec: tfSec() }), oos = NT.backtest(C.slice(0, f.oosTo + 1), NT.strategies[s.strat], s.params, { tfSec: tfSec(), fromT: C[f.oosFrom].t }); folds.push({ is: V17P.statsOf(isR.eq), oos: V17P.statsOf(oos.eq) }); } catch (e) { /* fold skipped */ } } }
      const of = V17P.overfit(folds), kel = V17P.kellyOf(rts), slip = V17P.slipCurve(rts), rets = rts.map((r) => r.pnlPct), prop = V17P.propSim(rets, { size: cfg.prop, sims: 1500, seed: 11 });
      const grid = V17P.rrGrid(C, V17P.entriesOf(C, rts).length >= 5 ? V17P.entriesOf(C, rts) : C.map((_, i) => i).filter((i) => i % 12 === 0), V17P.MULTS, 1);
      const leaks = V17P.leaks(rts, { ex, shadow: sh, heat, overfit: of, slip });
      U.coach = { s, C, rts, ex, sh, heat, st: s.stats ? Object.assign(st, { sharpe: s.stats.sharpe != null ? s.stats.sharpe : st.sharpe }) : st, of, kel, slip, prop, grid, leaks, at: Date.now() };
      mission('coach'); if (prop.pass >= 0.5) mission('prop'); this.paint(U.coach); return U.coach;
    },
    html() {
      return `<section class="x17-coach" id="x17Coach" aria-label="Quant Lab Edge-Coach"><div class="x17-ch"><h3>ƒ Quant Lab Edge-Coach</h3><span class="note" id="x17CoachSrc"></span><span class="sp"></span>
        <button type="button" class="btn sm pri" data-x17c="run">Analyze</button><label class="btn sm" title="Import OHLCV CSV (time, open, high, low, close, volume)">CSV<input type="file" accept=".csv,text/csv" id="x17Csv" hidden></label>
        <button type="button" class="btn sm" data-x17c="sheet">Tear Sheet</button><button type="button" class="btn sm" data-x17c="ai">Send Backtest Leaks to AI Coach</button>
        <button type="button" class="btn sm ghost" data-x17c="pbx">Export .exterm.json</button><label class="btn sm ghost">Import<input type="file" accept=".json,application/json" id="x17Pb" hidden></label></div>
        <div id="x17CoachBody" class="x17-cb"><p class="note">Run a backtest (or trade on paper), then Analyze. With nothing to analyze, the coach runs an EMA-crossover demo on the chart.</p></div>
        <details class="x17-pine"><summary>Pine Script v5 inline linter</summary><textarea class="in mono" id="x17Pine" rows="7" spellcheck="false" aria-label="Pine Script source" placeholder="//@version=5&#10;indicator(&quot;My script&quot;, overlay=true)&#10;plot(ta.ema(close, 20))"></textarea><ul class="x17-lint" id="x17Lint" aria-live="polite"></ul></details></section>`;
    },
    mount() {
      const lab = $1('#tab-lab'); if (!lab || $1('#x17Coach')) return; lab.insertAdjacentHTML('afterbegin', this.html()); const c = $1('#x17Coach');
      c.addEventListener('click', (e) => { const b = e.target.closest('[data-x17c]'); if (!b) return; const k = b.dataset.x17c;
        if (k === 'run') this.run(); else if (k === 'sheet') this.sheet(); else if (k === 'ai') this.ai(); else if (k === 'pbx') this.pbExport(); else if (k === 'apply') this.apply(+b.dataset.a, +b.dataset.b); else if (k === 'prop') { cfg.prop = +b.dataset.v; save(); this.run(); } });
      c.addEventListener('input', (e) => { if (e.target.id === 'x17Pine') this.lint(); if (e.target.id === 'x17Slip') { cfg.slip = +e.target.value; save(); this.paintSlip(); } });
      $1('#x17Csv').addEventListener('change', (e) => this.csv(e.target.files && e.target.files[0]));
      $1('#x17Pb').addEventListener('change', (e) => this.pbImport(e.target.files && e.target.files[0]));
    },
    lint() { const t = $1('#x17Pine'), ul = $1('#x17Lint'); if (!t || !ul) return; const iss = t.value.trim() ? V17P.pineLint(t.value) : []; ul.innerHTML = iss.length ? iss.map((i) => `<li class="${i.sev}"><b>L${i.line}</b> ${E(i.msg)}</li>`).join('') : t.value.trim() ? '<li class="ok">✓ No issues found</li>' : ''; return iss; },
    async csv(f) { if (!f) return; const txt = await f.text(), r = V170.parseCSV(txt); if (r.error) { T('CSV: ' + E(r.error), 'dn'); return; } const C = V170.unpack(r.f), id = (typeof lastBt !== 'undefined' && lastBt && lastBt.S && NT.strategies[lastBt.S.strat]) ? lastBt.S.strat : 'smacross', p = NT.defaultParams(id), sec = C.length > 1 ? C[1].t - C[0].t : 86400, res = NT.backtest(C, NT.strategies[id], p, { tfSec: sec }); U.csvRun = { kind: 'CSV · ' + f.name.slice(0, 40), sym: f.name.replace(/\.csv$/i, '').slice(0, 20), strategy: NT.strategies[id].name, tf: sec + 's', candles: C, trades: res.trades, eq: res.eq, stats: res.stats, strat: id, params: p }; T(`Imported ${r.n} candles from ${E(f.name)}`, 'acc'); this.run(); },
    paint(R) {
      const b = $1('#x17CoachBody'), srcEl = $1('#x17CoachSrc'); if (!b) return; if (!R) { b.innerHTML = '<p class="note">Not enough data yet: open a chart with 120+ candles.</p>'; return; }
      if (srcEl) srcEl.textContent = R.s.kind + ' · ' + R.rts.length + ' round trips';
      const ex = R.ex.filter(Boolean), cap = ex.length ? V17P.mean(ex.map((x) => x.capture)) : NaN, eqv = typeof ACC !== 'undefined' ? ACC.equity() : 100000;
      const rows = R.rts.slice(-25).reverse().map((r, k) => { const i = R.rts.length - 1 - k, e = R.ex[i], s = R.sh[i]; return `<tr><td>${E(new Date(r.entryTs * 1000).toISOString().slice(5, 16).replace('T', ' '))}</td><td class="num ${r.pnl >= 0 ? 'up' : 'dn'}">${pct(r.pnlPct, 2)}</td><td class="num up">${e ? pct(e.mfePct, 2) : '–'}</td><td class="num dn">${e ? pct(-e.maePct, 2) : '–'}</td><td class="num">${e ? pct(e.capture, 0) : '–'}</td><td class="num ${s && s.ret > 0 ? 'up' : 'dn'}">${s ? pct(s.ret, 2) + (s.complete ? '' : '*') : '–'}</td><td>${s ? E(s.verdict) : '–'}</td></tr>`; }).join('');
      const H = R.heat.grid, hcell = (c) => { if (!c.n) return '<i class="x17-h0"></i>'; const a = c.rate, col = a >= 0.5 ? `rgba(46,204,143,${0.25 + a * 0.6})` : `rgba(255,92,108,${0.25 + (1 - a) * 0.6})`; return `<i style="background:${col}" title="${c.n} trades · ${Math.round(a * 100)}% win"></i>`; };
      const heat = `<div class="x17-heat" role="img" aria-label="Win rate by entry hour and weekday (UTC)"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="x17-hh">${h % 3 ? '' : h}</span>`).join('')}${H.map((row, d) => `<span class="x17-hd">${V17P.DAYS[d]}</span>${row.map(hcell).join('')}`).join('')}</div>`;
      const G = R.grid, best = G.best, rr = `<div class="x17-rr" style="grid-template-columns:auto repeat(${G.mults.length},1fr)"><span class="x17-rrc">SL\\TP</span>${G.mults.map((m) => `<span class="x17-rrc">${m}×</span>`).join('')}${G.cells.map((row, a) => `<span class="x17-rrc">${G.mults[a]}×</span>${row.map((c, b2) => { const v = c.exp, col = v >= 0 ? `rgba(46,204,143,${Math.min(0.85, 0.15 + v * 0.5)})` : `rgba(255,92,108,${Math.min(0.85, 0.15 - v * 0.5)})`; return `<button type="button" class="x17-rrb${best && c === best ? ' best' : ''}" data-x17c="apply" data-a="${a}" data-b="${b2}" style="background:${col}" title="SL ${c.sl}×ATR · TP ${c.tp}×ATR · win ${Math.round(c.win * 100)}% · ${c.n} entries · 1-click apply to chart">${v >= 0 ? '+' : ''}${v.toFixed(2)}R</button>`; }).join('')}`).join('')}</div>`;
      const P = R.prop, K = R.kel, of = R.of;
      b.innerHTML = `<div class="x17-kpis">${[['Net return', pct(R.st.ret, 2)], ['Max DD', pct(-R.st.dd, 2)], ['Sharpe', fmt(R.st.sharpe, 2)], ['MFE capture', pct(cap, 0)], ['Overfitting', of.score == null ? 'n/a' : of.score + '/100 · ' + of.grade], ['Prop pass ' + usd(cfg.prop), pct(P.pass, 0)]].map(([k, v]) => `<div class="x17-kpi"><span>${E(k)}</span><b>${E(v)}</b></div>`).join('')}</div>
        <div class="x17-cols"><div>${card('x17Ex', 'Per-trade MFE / MAE + 4h Shadow', `<div class="x17-tw"><table class="x17-t"><thead><tr><th>Entry UTC</th><th>P&amp;L</th><th>MFE</th><th>MAE</th><th>Capture</th><th>+4h</th><th>Shadow verdict</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No closed trades</td></tr>'}</tbody></table></div><p class="note">* window still open. Shadow = holding 4 h past the exit.</p>`)}
          ${card('x17Heat', 'Win rate · hour × weekday (UTC)', heat + (R.heat.best ? `<p class="note">Best ${V17P.DAYS[R.heat.best.day]} ${R.heat.best.hour}:00 (${pct(R.heat.best.rate, 0)}) · worst ${V17P.DAYS[R.heat.worst.day]} ${R.heat.worst.hour}:00 (${pct(R.heat.worst.rate, 0)})</p>` : ''))}</div>
          <div>${card('x17RR', '0.5×–3.0× ATR SL / TP heatmap', rr + `<p class="note">${best ? `Best: SL ${best.sl}× / TP ${best.tp}× ATR → ${best.exp >= 0 ? '+' : ''}${best.exp.toFixed(2)}R per trade, ${pct(best.win, 0)} win. Click any cell to apply it to the chart.` : 'Need more entries.'}</p>`)}
          ${card('x17Prop', 'Prop-Firm Challenge simulator', `<div class="seg" role="group" aria-label="Account size">${[50000, 100000, 200000].map((v) => `<button type="button" data-x17c="prop" data-v="${v}" class="${cfg.prop === v ? 'on' : ''}">$${v / 1000}K</button>`).join('')}</div><div class="x17-bar"><i class="up" style="width:${P.pass * 100}%"></i><i class="dn" style="width:${P.failDaily * 100}%"></i><i class="amb" style="width:${P.failDD * 100}%"></i></div><p class="note">Pass ${pct(P.pass, 0)} · daily-loss breach ${pct(P.failDaily, 0)} · max-DD breach ${pct(P.failDD, 0)} · timeout ${pct(P.timeout, 0)}${P.medianDays ? ' · median ' + P.medianDays + ' days to pass' : ''} · ${P.sims} Monte Carlo runs (8% target, 5% daily, 10% max DD, 30 days)</p>`)}
          ${card('x17Kelly', 'Kelly sizer', `<div class="x17-kpis sm">${[['Quarter-Kelly', K.quarter], ['Half-Kelly', K.half], ['Full Kelly', K.full]].map(([k, v]) => `<div class="x17-kpi"><span>${k}</span><b>${pct(v, 1)}</b><em>${usd(v * eqv)}</em></div>`).join('')}</div><p class="note">Edge ${K.edge >= 0 ? '+' : ''}${(K.edge * 100).toFixed(1)}% per unit risked · payoff ${K.b.toFixed(2)}:1. Half- or quarter-Kelly is the sane ceiling.</p>`)}
          ${card('x17Slip', 'Slippage re-sim (0–50 bps)', `<input type="range" min="0" max="50" step="5" id="x17Slip" value="${cfg.slip}" aria-label="Extra slippage in basis points"><div id="x17SlipOut" class="note"></div>`)}
          ${card('x17Leaks', 'Backtest leaks', R.leaks.length ? `<ol class="x17-leaks">${R.leaks.map((l) => `<li class="s${l.sev}">${E(l.msg)}</li>`).join('')}</ol>` : '<p class="note">No major leaks found.</p>')}</div></div>`;
      this.paintSlip();
    },
    paintSlip() { const o = $1('#x17SlipOut'); if (!o || !U.coach) return; const r = V17P.slipResim(U.coach.rts, cfg.slip); o.textContent = `+${cfg.slip} bps per side: P&L ${usd(r.base)} → ${usd(r.pnl)} (${usd(r.delta)})${r.base > 0 && r.pnl <= 0 ? ' · edge gone' : ''}`; },
    apply(a, b) { const R = U.coach; if (!R) return; const c = R.grid.cells[a] && R.grid.cells[a][b]; if (!c) return; const px = lastPx(), A = V17P.atr(candles(), 14), atr = A[A.length - 1]; if (!(px > 0) || !Number.isFinite(atr)) { T('Need a live chart to apply', 'dn'); return; } U.rrApplied = { sym: sym(), sl: px - c.sl * atr, tp: px + c.tp * atr, slx: c.sl, tpx: c.tp }; Layer.dirty(); mission('rrapply'); showTab('markets'); T(`Applied SL ${c.sl}× / TP ${c.tp}× ATR to the chart`, 'acc'); },
    sheet() { const R = U.coach || this.run(); if (!R) return; const html = V17P.tearSheet({ title: 'ExTerm Tear Sheet · ' + R.s.strategy, sym: R.s.sym, tf: R.s.tf, strategy: R.s.strategy, at: Date.now() }, R.st, R.rts, { overfit: R.of.score, halfKelly: R.kel.half, propPass: R.prop.pass }); if (typeof download === 'function') download('exterm-tearsheet-' + String(R.s.sym).replace(/[^\w-]/g, '') + '.html', html, 'text/html'); T('Tear sheet exported', 'acc'); return html; },
    ai() { const R = U.coach || this.run(); if (!R) return; const p = V17P.coachPrompt(R.leaks, R.st, { strategy: R.s.strategy, sym: R.s.sym, tf: R.s.tf }); U.lastPrompt = p; try { if (navigator.clipboard) navigator.clipboard.writeText(p).catch(() => {}); } catch (e) { /* clipboard blocked */ }
      showTab('ai'); setTimeout(() => { const box = $1('#tab-ai textarea, #tab-ai input[type="text"]'); if (box) { box.value = p; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); } }, 60); T('Leaks sent to the AI Coach (also copied)', 'acc'); return p; },
    pbExport() { const R = U.coach; const pb = { name: (R ? R.s.strategy : 'My playbook') + ' · ' + sym(), strategy: R ? R.s.strat : null, params: R ? R.s.params : {}, risk: { slAtr: U.rrApplied ? U.rrApplied.slx : null, tpAtr: U.rrApplied ? U.rrApplied.tpx : null, kelly: R ? R.kel.half : null }, rules: R ? R.leaks.map((l) => 'Fix: ' + l.msg) : [], tf: typeof ST !== 'undefined' ? ST.tf : '' }; const txt = V17P.exportPlaybook(pb, Date.now()); if (typeof download === 'function') download('playbook.exterm.json', txt, 'application/json'); T('Playbook exported (sanitized: no keys, wallets or endpoints)', 'acc'); return txt; },
    async pbImport(f) { if (!f) return; const r = V17P.importPlaybook(await f.text()); if (!r.ok) { T('Import failed: ' + E(r.error), 'dn'); return; } cfg.pb = (cfg.pb || []).filter((x) => x.name !== r.playbook.name).concat(r.playbook).slice(-20); save(); T('Imported playbook “' + E(r.playbook.name) + '”', 'acc'); return r.playbook; },
  };
  U.coachApi = Coach;

  /* ══ 5. Briefing (new-day modal + header pill) ══ */
  const Brief = {
    day: () => new Date().toISOString().slice(0, 10),
    levels() { const C = candles().map((c) => ({ t: V17P.toSec(c.t), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })); const stock = typeof isStock === 'function' && isStock(sym()); return V17P.morningLevels(C, Math.floor(Date.now() / 1000), stock ? nyOff() : 0, stock ? 570 : 0); },
    plot() { const lv = this.levels(); if (!lv) { T('Not enough history on this chart for morning levels', 'dn'); return false; } U.levels[sym()] = lv; Layer.dirty(); mission('levels'); T('Plotted ' + Object.keys(lv).length + ' morning levels on ' + E(sym()), 'acc'); return true; },
    open(force) {
      if (!force && cfg.briefDay === this.day()) return; const old = $1('#x17Brief'); if (old) old.remove();
      const lv = this.levels(), d = this.day(); if (lv) { cfg.briefHist = [{ d, s: sym(), lv }].concat((cfg.briefHist || []).filter((h) => !(h.d === d && h.s === sym()))).slice(0, 7); } cfg.briefDay = d; save();
      const ev = V17P.FOMC.filter((e) => e.date === d), movers = (typeof ST !== 'undefined' ? ST.watch : []).slice(0, 40).map((s) => ({ s, c: typeof chg24 === 'function' ? chg24(s) : null })).filter((x) => Number.isFinite(x.c)).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 6);
      const ov = document.createElement('div'); ov.id = 'x17Brief'; ov.className = 'x17-modal'; ov.dataset.auto = force ? '0' : '1'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'x17BriefT');
      ov.innerHTML = `<div class="x17-mc"><div class="x17-mh"><h2 id="x17BriefT">☀ Morning Briefing · ${E(d)}</h2><button type="button" class="btn sm ghost" data-x17b="x" aria-label="Close">✕</button></div>
        <div class="x17-cols"><div><h4>${E(sym())} levels</h4>${lv ? `<table class="x17-t">${Object.entries(lv).map(([k, v]) => `<tr><td>${E(V17P.LEVEL_NAMES[k] || k)}</td><td class="num">${fmt(v)}</td></tr>`).join('')}</table>` : '<p class="note">Not enough history yet.</p>'}
          <button type="button" class="btn pri" data-x17b="plot">1-Click Plot All Morning Levels</button></div>
          <div><h4>Movers</h4>${movers.length ? `<table class="x17-t">${movers.map((m) => `<tr><td>${E(typeof baseOf === 'function' ? baseOf(m.s) : m.s)}</td><td class="num ${m.c >= 0 ? 'up' : 'dn'}">${(m.c * (Math.abs(m.c) < 1 ? 100 : 1)).toFixed(2)}%</td></tr>`).join('')}</table>` : '<p class="note">Quotes loading…</p>'}
          <h4>Today</h4><p class="note">${ev.length ? ev.map((e) => E(e.kind) + ' decision 14:00 ET').join(' · ') : 'No FOMC decision today.'}${typeof ACC !== 'undefined' ? ' · Paper equity ' + usd(ACC.equity()) : ''}</p>
          <h4>Last 7 days</h4><ol class="x17-hist">${(cfg.briefHist || []).map((h) => `<li><b>${E(h.d)}</b> ${E(h.s)} · PDH ${fmt(h.lv.pdh)} · PDL ${fmt(h.lv.pdl)}</li>`).join('') || '<li class="note">History starts today.</li>'}</ol></div></div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => { const b = e.target.closest('[data-x17b]'); if (e.target === ov || (b && b.dataset.x17b === 'x')) ov.remove(); else if (b && b.dataset.x17b === 'plot') { if (this.plot()) ov.remove(); } });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); }); setTimeout(() => { const f = ov.querySelector('[data-x17b="plot"]'); if (f) f.focus(); }, 20);
    },
    pill() { const top = $1('#top'); if (!top || $1('#x17BriefPill')) return; const p = document.createElement('button'); p.type = 'button'; p.id = 'x17BriefPill'; p.className = 'ghost x17-bpill'; p.textContent = '☀ Briefing'; p.title = 'Reopen the Morning Briefing'; p.addEventListener('click', () => this.open(true)); const sp = $1('#top .spacer'); if (sp) sp.after(p); else top.appendChild(p); },
  };
  U.brief = Brief;

  /* ══ 6. Bot Fleet ══ */
  const Fleet = {
    html() {
      const M = V17P.MODES; return `<div class="x17-wrap"><div class="x17-gate" id="x17Gate" hidden><b>No bot running.</b> <span class="note">Start the demo bot in Paper Sandbox, or connect your own bot in AI Bridge.</span> <button type="button" class="btn sm pri" data-x17f="demo">▶ Run Demo Bot</button></div>
        <div class="x17-cols"><div>${card('x17Modes', 'Mode', `<div class="x17-modes" role="radiogroup" aria-label="Fleet mode">${M.map((m) => `<button type="button" role="radio" class="x17-mode" data-x17f="mode" data-v="${m.id}" aria-checked="false"><b>${E(m.label)}</b><span>${E(m.desc)}</span></button>`).join('')}</div><p class="note" id="x17ArmState"></p>`)}
          ${card('x17Queue', 'Co-Pilot approvals', '<div id="x17Q" class="x17-q"><p class="note">No pending orders.</p></div>')}
          ${card('x17Bots', 'Fleet', '<div id="x17BotList"></div>')}
          ${card('x17Evo', 'Self-Improving loop', `<p class="note">Seeded hill-climb over strategy parameters, scored on out-of-sample Sharpe minus overfitting. Paper only: you approve any change.</p><button type="button" class="btn sm" data-x17f="evolve">Run 20 generations</button><div id="x17EvoOut" class="note"></div>`)}
          ${card('x17Dispatch', 'Your local bot (live modes)', `<label class="x17-f"><span>Signal URL (127.0.0.1 / localhost only)</span><input class="in mono" id="x17BotUrl" placeholder="http://127.0.0.1:9000/signal" value="${E(cfg.botUrl || '')}"></label><p class="note">ExTerm never holds keys or funds. Live signals are HMAC-signed and posted only to your own bot on this machine.</p>`)}</div>
          <div>${card('x17TorusC', 'Neural Strategy Torus', '<canvas id="x17Torus" width="520" height="360" aria-label="Neural strategy torus visual"></canvas><p class="note"><span id="x17Fps">0 fps</span> · paused at 0 fps whenever this tab is hidden</p>')}</div></div></div>`;
    },
    show() { const s = $1('#tab-fleet'); if (!s) return; if (!s.firstChild) { s.innerHTML = this.html(); s.addEventListener('click', (e) => this.click(e)); const u = $1('#x17BotUrl'); u.addEventListener('change', () => { const v = u.value.trim(); if (v && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v)) { T('Only http://127.0.0.1 or http://localhost URLs are allowed', 'dn'); u.value = cfg.botUrl || ''; return; } cfg.botUrl = v; save(); }); } this.paint(); this.start(); },
    bots() { return (typeof ST !== 'undefined' && ST.bots) || []; },
    paint() {
      const g = $1('#x17Gate'); if (g) g.hidden = this.bots().some((b) => b.run) || !!U.demo;
      for (const b of $$1('[data-x17f="mode"]')) { const on = b.dataset.v === cfg.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      const a = $1('#x17ArmState'); if (a) a.textContent = cfg.mode === 'live' ? (cfg.arm.armed ? `ARMED · cap ${usd(cfg.arm.cap)} · max slip ${cfg.arm.slipBps} bps · daily stop ${usd(cfg.arm.dailyLoss)}` : 'Not armed: complete the 5-step wizard') : cfg.mode === 'copilot' ? 'Every order waits for your 1-click approval.' : 'Simulated fills only.';
      const L = $1('#x17BotList'); if (L) { const bs = this.bots(); L.innerHTML = bs.length || U.demo ? `<table class="x17-t"><thead><tr><th>Bot</th><th>Symbol</th><th>Status</th><th>P&amp;L</th></tr></thead><tbody>${bs.map((b) => `<tr><td>${E(b.name)}</td><td>${E(b.sym)}</td><td>${b.run ? '● running' : '○ stopped'}</td><td class="num">${usd(b.account.realized)}</td></tr>`).join('')}${U.demo ? `<tr><td>Demo · EMA cross</td><td>${E(U.demo.sym)}</td><td>● paper</td><td class="num">${usd(U.demo.pnl)}</td></tr>` : ''}</tbody></table>` : '<p class="note">No bots yet.</p>'; }
      this.paintQ();
    },
    paintQ() { const q = $1('#x17Q'); if (!q) return; q.innerHTML = U.queue.length ? U.queue.map((o, i) => `<div class="x17-qr"><b class="${o.side === 'buy' ? 'up' : 'dn'}">${o.side.toUpperCase()}</b> ${usd(o.usd)} ${E(o.sym)} @ ${fmt(o.px)} <span class="note">${E(o.why)}</span><span class="sp"></span><button type="button" class="btn xs pri" data-x17f="ok" data-i="${i}">Approve</button><button type="button" class="btn xs ghost" data-x17f="no" data-i="${i}">Reject</button></div>`).join('') : '<p class="note">No pending orders.</p>'; },
    click(e) {
      const b = e.target.closest('[data-x17f]'); if (!b) return; const k = b.dataset.x17f;
      if (k === 'mode') { const v = b.dataset.v; if (v === 'live' && !cfg.arm.armed) { Wizard.open(); return; } cfg.mode = v; save(); this.paint(); }
      else if (k === 'demo') this.demo(); else if (k === 'evolve') this.evolve();
      else if (k === 'ok' || k === 'no') { const o = U.queue.splice(+b.dataset.i, 1)[0]; if (o && k === 'ok') this.exec(o, true); this.paintQ(); }
    },
    /* demo bot: EMA cross signals on the chart, paper fills; in co-pilot mode they queue for approval */
    demo() { U.demo = { sym: sym(), pnl: 0, acct: typeof NT !== 'undefined' ? new NT.Account({ cash: 100000 }) : null }; mission('paperbot'); this.paint(); T('Demo bot running in Paper Sandbox', 'acc'); this.propose(); },
    propose() { const C = candles(); if (!U.demo || C.length < 60) return; const cl = C.map((c) => c.c), f = V17P.ema(cl, 9), s = V17P.ema(cl, 21), i = cl.length - 1, side = f[i] > s[i] ? 'buy' : 'sell'; const o = { side, sym: sym(), usd: 1000, px: cl[i], ref: cl[i], why: `EMA9 ${side === 'buy' ? '>' : '<'} EMA21` }; if (cfg.mode === 'copilot') { U.queue.push(o); this.paintQ(); } else this.exec(o, false); },
    async exec(o, approved) {
      if (cfg.mode === 'paper' || (cfg.mode === 'copilot' && !cfg.botUrl)) { const a = U.demo && U.demo.acct; if (a) { const t = o.side === 'buy' ? a.buy(o.sym, o.px, o.usd, Date.now(), { src: 'fleet' }) : a.sell(o.sym, o.px, null, Date.now(), { src: 'fleet' }); if (t && t.pnl != null) U.demo.pnl += t.pnl; } this.paint(); return { ok: true, paper: true }; }
      const g = V17P.fleetGuard(o, cfg.mode === 'live' ? cfg.arm : { armed: approved, cap: cfg.arm.cap || o.usd, slipBps: cfg.arm.slipBps || 50, dailyLoss: cfg.arm.dailyLoss || Infinity }, U.spent);
      if (!g.ok) { T('Order blocked: ' + E(g.why), 'dn'); return g; }
      if (!cfg.botUrl) { T('Set your local bot URL first', 'dn'); return { ok: false }; }
      try { const body = JSON.stringify({ v: 1, src: 'exterm-fleet', ts: Date.now(), side: o.side, sym: o.sym, usd: o.usd, ref: o.ref, maxSlipBps: cfg.arm.slipBps }), sig = await this.sign(body); const r = await fetch(cfg.botUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ExTerm-Sig': sig }, body, credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status); U.spent += o.usd; T('Signal sent to your bot', 'acc'); return { ok: true }; } catch (e) { T('Bot unreachable: ' + E(e.message), 'dn'); return { ok: false }; }
    },
    async sign(body) { if (!cfg.arm.secret) { const a = new Uint8Array(16); crypto.getRandomValues(a); cfg.arm.secret = [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); save(); } const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.arm.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)); return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join(''); },
    evolve() {
      const C = candles(), out = $1('#x17EvoOut'); if (C.length < 200 || typeof NT === 'undefined') { if (out) out.textContent = 'Need 200+ candles on the chart.'; return null; }
      const S = NT.strategies.smacross, cut = Math.floor(C.length * 0.6), bounds = { fast: [3, 30, 1], slow: [10, 120, 2] };
      const score = (p) => { if (p.fast >= p.slow) return -9; const a = V17P.statsOf(NT.backtest(C.slice(0, cut), S, p, { tfSec: tfSec() }).eq), b = V17P.statsOf(NT.backtest(C, S, p, { tfSec: tfSec(), fromT: C[cut].t }).eq); return b.sharpe - Math.max(0, a.sharpe - b.sharpe) * 0.5; };
      const r = V17P.evolve(NT.defaultParams('smacross'), bounds, score, 20, Date.now() & 0xffff); mission('evolve');
      if (out) out.textContent = `Best after 20 generations: fast ${r.params.fast} / slow ${r.params.slow} · score ${r.score.toFixed(2)} (started ${r.history[0].toFixed(2)})`; return r;
    },
    /* 240 Hz-capable torus: Float32Array mesh, rotation per frame, rAF cancelled when hidden */
    start() { if (U.torus.raf || document.hidden) return; const cv = $1('#x17Torus'); if (!cv) return; const g = cv.getContext('2d'), mesh = V17P.torus(48, 18, 1, 0.38), P2 = new Float32Array(mesh.length / 3 * 2), Z = new Float32Array(mesh.length / 3);
      const loop = (now) => { if (!cv.isConnected || (typeof curTab !== 'undefined' && curTab !== 'fleet') || document.hidden) { this.stop(); return; }
        const T0 = U.torus; T0.frames++; if (now - T0.last >= 1000) { T0.fps = Math.round((T0.frames * 1000) / (now - T0.last || 1)); T0.frames = 0; T0.last = now; const f = $1('#x17Fps'); if (f) f.textContent = T0.fps + ' fps'; }
        const a = now / 1400, b = now / 2300, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), W = cv.width, H = cv.height, s = Math.min(W, H) * 0.32, perf = U.demo ? Math.tanh(U.demo.pnl / 500) : 0;
        for (let i = 0, j = 0; i < mesh.length; i += 3, j++) { let x = mesh[i], y = mesh[i + 1], z = mesh[i + 2]; const y1 = y * ca - z * sa, z1 = y * sa + z * ca; const x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb; const k = 3 / (3 + z2); P2[j * 2] = W / 2 + x2 * s * k; P2[j * 2 + 1] = H / 2 + y1 * s * k; Z[j] = z2; }
        g.fillStyle = '#07080B'; g.fillRect(0, 0, W, H); for (let j = 0; j < Z.length; j++) { const d = (Z[j] + 1.4) / 2.8; g.fillStyle = perf >= 0 ? `rgba(245,200,75,${0.15 + (1 - d) * 0.8})` : `rgba(255,92,108,${0.15 + (1 - d) * 0.8})`; g.fillRect(P2[j * 2], P2[j * 2 + 1], 2, 2); }
        U.torus.raf = requestAnimationFrame(loop); };
      U.torus.last = performance.now(); U.torus.frames = 0; U.torus.raf = requestAnimationFrame(loop); },
    stop() { if (U.torus.raf) cancelAnimationFrame(U.torus.raf); U.torus.raf = 0; U.torus.fps = 0; const f = $1('#x17Fps'); if (f) f.textContent = '0 fps'; },
  };
  U.fleet = Fleet;

  /* mandatory 5-step arming wizard */
  const Wizard = {
    st: { ack: false, settled: '', cap: '', slipBps: 20, dailyLoss: '', phrase: '' }, step: 0,
    open() { this.step = 0; this.st = { ack: false, settled: '', cap: '', slipBps: 20, dailyLoss: '', phrase: '' }; const old = $1('#x17Wiz'); if (old) old.remove(); const ov = document.createElement('div'); ov.id = 'x17Wiz'; ov.className = 'x17-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'x17WizT'); document.body.appendChild(ov); ov.addEventListener('click', (e) => this.click(e)); ov.addEventListener('input', (e) => this.input(e)); ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); }); this.paint(); },
    body() { const s = this.st; return [
      `<label class="x17-chk"><input type="checkbox" data-w="ack" ${s.ack ? 'checked' : ''}> I understand live orders can lose real money, ExTerm Labs is not my broker, and the bot can act while I am away.</label>`,
      `<label class="x17-f"><span>Settled cash at your broker / exchange ($)</span><input class="in mono" type="number" min="0" data-w="settled" value="${E(s.settled)}"></label><label class="x17-f"><span>Bot cash cap ($) — zero overdraft: never above settled cash</span><input class="in mono" type="number" min="0" data-w="cap" value="${E(s.cap)}"></label>`,
      `<label class="x17-f"><span>Max slippage per order (bps)</span><input class="in mono" type="number" min="1" max="100" data-w="slipBps" value="${E(s.slipBps)}"></label>`,
      `<label class="x17-f"><span>Daily loss kill-switch ($)</span><input class="in mono" type="number" min="0" data-w="dailyLoss" value="${E(s.dailyLoss)}"></label>`,
      `<label class="x17-f"><span>Type <b>${V17P.ARM_PHRASE}</b> to arm</span><input class="in mono" data-w="phrase" autocomplete="off" spellcheck="false" value="${E(s.phrase)}"></label>`][this.step]; },
    paint() { const ov = $1('#x17Wiz'); if (!ov) return; ov.innerHTML = `<div class="x17-mc sm"><div class="x17-mh"><h2 id="x17WizT">Arm Live Unattended · step ${this.step + 1} of 5</h2><button type="button" class="btn sm ghost" data-w="x" aria-label="Close">✕</button></div><ol class="x17-steps">${V17P.ARM_STEPS.map((t, i) => `<li class="${i < this.step ? 'done' : i === this.step ? 'cur' : ''}">${E(t)}</li>`).join('')}</ol><div class="x17-wb">${this.body()}</div><p class="note dn" id="x17WizErr" role="alert"></p><div class="row"><button type="button" class="btn sm ghost" data-w="back" ${this.step ? '' : 'disabled'}>Back</button><span class="sp"></span><button type="button" class="btn sm pri" data-w="next">${this.step === 4 ? 'ARM' : 'Next'}</button></div></div>`; const f = ov.querySelector('[data-w]:not([data-w="x"]):not(button)'); if (f) f.focus(); },
    input(e) { const k = e.target.dataset.w; if (!k || e.target.tagName === 'BUTTON') return; this.st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; },
    click(e) { const b = e.target.closest('button[data-w]'); if (!b) { if (e.target.id === 'x17Wiz') e.target.remove(); return; } const k = b.dataset.w, ov = $1('#x17Wiz');
      if (k === 'x') { ov.remove(); return; } if (k === 'back') { this.step = Math.max(0, this.step - 1); this.paint(); return; }
      const r = V17P.armCheck(this.st, this.step); if (!r.ok) { $1('#x17WizErr').textContent = r.error; return; } if (this.step >= 3) mission('wizard');
      if (this.step < 4) { this.step++; this.paint(); return; }
      cfg.arm = Object.assign({}, cfg.arm, { armed: true, cap: +this.st.cap, settled: +this.st.settled, slipBps: +this.st.slipBps, dailyLoss: +this.st.dailyLoss, lossToday: 0, at: Date.now() }); cfg.mode = 'live'; save(); ov.remove(); Fleet.paint(); T('Live Unattended armed · kill-switch at ' + usd(cfg.arm.dailyLoss), 'amb'); },
  };
  U.wizard = Wizard;

  /* ══ 7. Options tab: GEX walls, multi-leg builder, payoff cone, greeks ══ */
  const Opts = {
    legs: [{ type: 'C', side: 'buy', strike: 0, qty: 1, prem: 0, iv: 0.5 }, { type: 'C', side: 'sell', strike: 0, qty: 1, prem: 0, iv: 0.5 }], days: 30,
    show() { const s = $1('#tab-opts'); if (!s) return; if (!s.firstChild) { s.innerHTML = `<div class="x17-wrap x17-cols"><div>${card('x17Gex', 'Live GEX · Flip / Call Wall / Put Wall', '<div class="row"><button type="button" class="btn sm pri" data-x17o="gex">Refresh GEX</button><label class="x17-chk"><input type="checkbox" id="x17GexOn"> Show on chart</label><span class="note" id="x17GexSrc"></span></div><div id="x17GexOut"></div>')}</div><div>${card('x17Legs', 'Multi-Leg Builder', '<div id="x17LegT"></div><div class="row"><button type="button" class="btn xs" data-x17o="add">+ Leg</button><button type="button" class="btn xs" data-x17o="pv">Bull call spread</button><button type="button" class="btn xs" data-x17o="ic">Iron condor</button><label class="x17-f in-row"><span>Days</span><input class="in xs mono" type="number" min="1" max="730" id="x17Days" value="30"></label></div><canvas id="x17Pay" width="560" height="220" aria-label="Payoff at expiry with 1σ and 2σ cone"></canvas><div id="x17Greeks" class="x17-kpis sm"></div>')}</div></div>`; s.addEventListener('click', (e) => this.click(e)); s.addEventListener('input', (e) => this.input(e)); const g = $1('#x17GexOn'); g.checked = cfg.gex; g.addEventListener('change', () => { cfg.gex = g.checked; save(); Layer.dirty(); }); this.preset('pv'); this.gex(); } this.paint(); },
    async chain() { const s = sym(), m = /^(BTC|ETH|SOL)-/.exec(s), spot = lastPx(); if (m && typeof J !== 'undefined') { try { const r = await V170UI.guard(J.get('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=' + m[1] + '&kind=option', { timeout: 8000 })); if (r && r !== V170.STALE && r.result && r.result.length) { const now = Date.now(), MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }; const rows = r.result.map((x) => { const p = /^\w+-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:d\d+)?)-([CP])$/.exec(x.instrument_name || ''); if (!p) return null; const exp = Date.UTC(2000 + +p[3], MON[p[2]], +p[1], 8); return { strike: +p[4].replace('d', '.'), type: p[5], oi: +x.open_interest || 0, iv: (+x.mark_iv || 50) / 100, T: Math.max(1, exp - now) / (365 * 864e5) }; }).filter((x) => x && x.T < 0.25); if (rows.length) return { rows, src: 'Deribit · live OI (≤ 90 days)', mult: 1, spot: +r.result[0].underlying_price || spot }; } } catch (e) { /* fall back to model */ } } return { rows: V17P.modelChain(spot, 7), src: 'Model chain (no free live chain for this symbol)', mult: 100, spot }; },
    async gex() { const spot = lastPx(); if (!(spot > 0)) return; const c = await this.chain(); const r = V17P.gex(c.rows, c.spot || spot, c.mult); U.gex = { sym: sym(), r, src: c.src, at: Date.now() }; Layer.dirty(); mission('gex'); this.paintGex(); return r; },
    paintGex() { const o = $1('#x17GexOut'), sEl = $1('#x17GexSrc'); if (!o || !U.gex) return; const G = U.gex.r; if (sEl) sEl.textContent = U.gex.src; const mx = Math.max(1, ...G.rows.map((r) => Math.abs(r.net)));
      o.innerHTML = `<div class="x17-kpis sm"><div class="x17-kpi"><span>Flip</span><b>${fmt(G.flip)}</b></div><div class="x17-kpi"><span>Call Wall</span><b class="up">${fmt(G.callWall)}</b></div><div class="x17-kpi"><span>Put Wall</span><b class="dn">${fmt(G.putWall)}</b></div><div class="x17-kpi"><span>Regime</span><b>${E(G.regime || '–')}</b></div></div><div class="x17-gexb">${G.rows.slice(-24).map((r) => `<div><span class="num">${fmt(r.strike)}</span><i class="${r.net >= 0 ? 'up' : 'dn'}" style="width:${(Math.abs(r.net) / mx) * 100}%"></i></div>`).join('')}</div>`; },
    preset(k) { const S = lastPx() || 100, st = S > 1000 ? Math.round(S / 100) * 100 : Math.round(S), w = S > 1000 ? Math.round(S * 0.05 / 100) * 100 || 100 : Math.max(1, Math.round(S * 0.05)); const pr = (K, t) => Math.max(0.01, V17P.bs(S, K, this.days / 365, 0.04, 0.5, t).price);
      this.legs = k === 'ic' ? [{ type: 'P', side: 'buy', strike: st - 2 * w }, { type: 'P', side: 'sell', strike: st - w }, { type: 'C', side: 'sell', strike: st + w }, { type: 'C', side: 'buy', strike: st + 2 * w }] : [{ type: 'C', side: 'buy', strike: st }, { type: 'C', side: 'sell', strike: st + w }];
      for (const l of this.legs) { l.qty = 1; l.iv = 0.5; l.prem = +pr(l.strike, l.type).toFixed(2); } if (this.legs.length >= 2) mission('opts'); this.paint(); },
    click(e) { const b = e.target.closest('[data-x17o]'); if (!b) return; const k = b.dataset.x17o; if (k === 'gex') this.gex(); else if (k === 'add') { this.legs.push({ type: 'P', side: 'buy', strike: Math.round(lastPx() || 100), qty: 1, prem: 1, iv: 0.5 }); this.paint(); } else if (k === 'rm') { this.legs.splice(+b.dataset.i, 1); this.paint(); } else this.preset(k); },
    input(e) { const t = e.target; if (t.id === 'x17Days') { this.days = Math.max(1, +t.value || 30); this.paintPay(); return; } const i = +t.dataset.i, f = t.dataset.f; if (!f || !this.legs[i]) return; this.legs[i][f] = f === 'type' || f === 'side' ? t.value : +t.value; this.paintPay(); },
    paint() { const t = $1('#x17LegT'); if (!t) return; t.innerHTML = `<table class="x17-t"><thead><tr><th>Side</th><th>Type</th><th>Strike</th><th>Qty</th><th>Premium</th><th>IV</th><th></th></tr></thead><tbody>${this.legs.map((l, i) => `<tr><td><select class="in xs" data-i="${i}" data-f="side"><option value="buy" ${l.side === 'buy' ? 'selected' : ''}>Buy</option><option value="sell" ${l.side === 'sell' ? 'selected' : ''}>Sell</option></select></td><td><select class="in xs" data-i="${i}" data-f="type"><option value="C" ${l.type === 'C' ? 'selected' : ''}>Call</option><option value="P" ${l.type === 'P' ? 'selected' : ''}>Put</option></select></td>${['strike', 'qty', 'prem', 'iv'].map((f) => `<td><input class="in xs mono" type="number" step="any" data-i="${i}" data-f="${f}" value="${E(l[f])}"></td>`).join('')}<td><button type="button" class="btn xs ghost" data-x17o="rm" data-i="${i}" aria-label="Remove leg">✕</button></td></tr>`).join('')}</tbody></table>`; this.paintPay(); },
    paintPay() { const cv = $1('#x17Pay'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height, S = lastPx() || 100, iv = V17P.mean(this.legs.map((l) => l.iv || 0.5)) || 0.5, cone = V17P.cone(S, iv, this.days), lo = cone[1].lo * 0.9, hi = cone[1].hi * 1.1, n = 160, vals = [];
      for (let i = 0; i <= n; i++) { const s = lo + ((hi - lo) * i) / n; vals.push([s, V17P.payoff(this.legs, s)]); } const mx = Math.max(1, ...vals.map((v) => Math.abs(v[1]))), X = (s) => ((s - lo) / (hi - lo)) * W, Y = (v) => H / 2 - (v / mx) * (H / 2 - 12);
      g.fillStyle = '#07080B'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(245,200,75,.06)'; g.fillRect(X(cone[1].lo), 0, X(cone[1].hi) - X(cone[1].lo), H); g.fillStyle = 'rgba(245,200,75,.12)'; g.fillRect(X(cone[0].lo), 0, X(cone[0].hi) - X(cone[0].lo), H);
      g.strokeStyle = '#3A3220'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.lineWidth = 2; g.beginPath(); vals.forEach(([s, v], i) => { const x = X(s), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.strokeStyle = '#F5C84B'; g.stroke(); g.lineWidth = 1;
      g.fillStyle = '#E8E6E1'; g.fillRect(X(S), 0, 1, H); g.font = '10px Inter, sans-serif'; g.fillText('spot ' + fmt(S), X(S) + 4, 12); g.fillStyle = '#9A968C'; g.fillText('1σ ' + fmt(cone[0].lo) + ' – ' + fmt(cone[0].hi), 6, H - 6);
      const G = V17P.legGreeks(this.legs, S, this.days / 365, 0.04), be = V17P.breakevens(this.legs, lo, hi), el = $1('#x17Greeks'); if (el) el.innerHTML = [['Δ Delta', G.delta.toFixed(2)], ['Γ Gamma', G.gamma.toFixed(4)], ['Θ Theta/day', usd(G.theta)], ['Vega/1%', usd(G.vega)], ['Breakeven', be.map((x) => fmt(x)).join(' · ') || '–'], ['Max P&L in view', usd(Math.max(...vals.map((v) => v[1])))]].map(([k, v]) => `<div class="x17-kpi"><span>${k}</span><b>${E(v)}</b></div>`).join(''); },
  };
  U.opts = Opts;

  /* ══ 8. Futures tab: RTH/ETH volume profile, tick risk, crypto liquidation clusters ══ */
  const Futs = {
    show() { const s = $1('#tab-futs'); if (!s) return; if (!s.firstChild) { s.innerHTML = `<div class="x17-wrap x17-cols"><div>${card('x17Vp', 'RTH / ETH Volume Profile', '<div class="seg" role="group" aria-label="Session" id="x17VpSeg"><button type="button" data-v="rth" class="on">RTH</button><button type="button" data-v="eth">ETH</button><button type="button" data-v="all">All</button></div><canvas id="x17VpC" width="520" height="260" aria-label="Volume profile"></canvas><div id="x17VpK" class="x17-kpis sm"></div>')}</div><div>${card('x17Tick', 'Tick Risk Calculator', `<div class="x17-form"><label class="x17-f"><span>Contract</span><select class="in" id="x17TkC">${Object.entries(V17P.TICKS).map(([k, v]) => `<option value="${k}">${k} · ${E(v.name)}</option>`).join('')}</select></label><label class="x17-f"><span>Entry</span><input class="in mono" type="number" step="any" id="x17TkE" value="5000"></label><label class="x17-f"><span>Stop</span><input class="in mono" type="number" step="any" id="x17TkS" value="4990"></label><label class="x17-f"><span>$ risk budget</span><input class="in mono" type="number" id="x17TkR" value="500"></label></div><div id="x17TkOut" class="x17-kpis sm"></div>`)}${card('x17Liq', 'Crypto liquidation clusters (estimate)', '<label class="x17-chk"><input type="checkbox" id="x17LiqOn"> Show on chart</label><div id="x17LiqOut"></div>')}</div></div>`;
      $1('#x17VpSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; for (const x of $$1('#x17VpSeg button')) x.classList.toggle('on', x === b); this.vp(b.dataset.v); }); s.addEventListener('input', (e) => { if (/^x17Tk/.test(e.target.id)) this.tick(); }); const l = $1('#x17LiqOn'); l.checked = cfg.liq; l.addEventListener('change', () => { cfg.liq = l.checked; save(); this.liq(); }); }
      this.vp(($1('#x17VpSeg .on') || {}).dataset ? $1('#x17VpSeg .on').dataset.v : 'rth'); this.tick(); this.liq(); },
    vp(sess) { const C = candles().map((c) => ({ t: V17P.toSec(c.t), h: c.h, l: c.l, c: c.c, v: c.v })), r = V17P.volProfile(C, sess, 40, nyOff()) || V17P.volProfile(C, 'all', 40), cv = $1('#x17VpC'); if (!cv || !r) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height, mx = Math.max(...r.bins, 1);
      g.fillStyle = '#07080B'; g.fillRect(0, 0, W, H); r.bins.forEach((v, i) => { const y = H - ((i + 1) / r.bins.length) * H, px = r.lo + (i + 0.5) * r.w; g.fillStyle = Math.abs(px - r.poc) < r.w ? '#F5C84B' : px >= r.val && px <= r.vah ? 'rgba(245,200,75,.45)' : 'rgba(154,150,140,.35)'; g.fillRect(0, y + 1, (v / mx) * (W - 90), H / r.bins.length - 2); });
      const k = $1('#x17VpK'); if (k) k.innerHTML = [['POC', fmt(r.poc)], ['VAH', fmt(r.vah)], ['VAL', fmt(r.val)], ['Bars', String(r.bars)]].map(([a, b]) => `<div class="x17-kpi"><span>${a}</span><b>${b}</b></div>`).join(''); return r; },
    tick() { const o = $1('#x17TkOut'); if (!o) return; const r = V17P.tickRisk($1('#x17TkC').value, +$1('#x17TkE').value, +$1('#x17TkS').value, { riskUsd: +$1('#x17TkR').value }); o.innerHTML = r ? [['Ticks', String(r.ticks)], ['$/contract', usd(r.perContract)], ['Contracts', String(r.contracts)], ['Total risk', usd(r.risk)]].map(([a, b]) => `<div class="x17-kpi"><span>${a}</span><b>${b}</b></div>`).join('') : '<p class="note">Enter a valid entry and stop.</p>'; return r; },
    liq() { const px = lastPx(), o = $1('#x17LiqOut'); if (!(px > 0)) return; const r = V17P.liqClusters(candles(), px); U.liq = { sym: sym(), r }; Layer.dirty(); if (o) o.innerHTML = `<table class="x17-t"><thead><tr><th>Side</th><th>Price</th><th>Est. size</th></tr></thead><tbody>${r.shorts.slice(0, 4).map((x) => `<tr><td class="up">Shorts</td><td class="num">${fmt(x.px)}</td><td class="num">${usd(x.usd)}</td></tr>`).join('')}${r.longs.slice(0, 4).map((x) => `<tr><td class="dn">Longs</td><td class="num">${fmt(x.px)}</td><td class="num">${usd(x.usd)}</td></tr>`).join('')}</tbody></table><p class="note">Model: recent volume opened at 5–100× leverage. An estimate, not exchange data.</p>`; return r; },
  };
  U.futs = Futs;

  /* ══ 9. Pulse tab: 0 extra network calls ══ */
  const Pulse = {
    show() { const s = $1('#tab-pulse'); if (!s) return; if (!s.firstChild) { s.innerHTML = `<div class="x17-wrap x17-cols"><div>${card('x17Mk', 'Market pulse (from data already on screen)', '<div id="x17MkOut"></div>')}${card('x17Ev', 'Last-12 CPI / FOMC reaction backtester', `<p class="note">FOMC dates are built in. Add CPI release dates (YYYY-MM-DD, one per line) to include them.</p><textarea class="in mono" id="x17Cpi" rows="3" placeholder="2026-10-14" aria-label="CPI release dates">${E((cfg.events || []).join('\n'))}</textarea><button type="button" class="btn sm" data-x17p="ev">Backtest on ${E(sym())}</button><div id="x17EvOut"></div>`)}${card('x17Sec', 'Stocks · filings, earnings & 13F', '<button type="button" class="btn sm" data-x17p="sec">Load SEC filings for this stock</button><div id="x17SecOut" class="note">Uses the local launcher proxy (SEC has no CORS).</div>')}</div>
        <div>${card('x17Beta', 'Portfolio Beta Shock', '<input type="range" min="-10" max="10" step="1" value="0" id="x17Shock" aria-label="Benchmark shock percent"><div id="x17BetaOut"></div>')}${card('x17Deb', 'Bull / Bear / Risk AI Debate', '<button type="button" class="btn sm pri" data-x17p="deb">Debate this chart</button><div id="x17DebOut"></div>')}</div></div>`;
        s.addEventListener('click', (e) => { const b = e.target.closest('[data-x17p]'); if (!b) return; const k = b.dataset.x17p; if (k === 'ev') this.events(); else if (k === 'sec') this.sec(); else if (k === 'deb') this.debate(); });
        $1('#x17Shock').addEventListener('input', (e) => this.beta(+e.target.value)); $1('#x17Cpi').addEventListener('change', (e) => { cfg.events = e.target.value.split(/\s+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 40); save(); }); }
      this.market(); this.beta(+(($1('#x17Shock') || {}).value || 0)); },
    market() { const o = $1('#x17MkOut'); if (!o) return; const W = ((typeof ST !== 'undefined' && ST.watch) || []).map((s) => ({ s, c: typeof chg24 === 'function' ? chg24(s) : null })).filter((x) => Number.isFinite(x.c)); const up = W.filter((x) => x.c > 0).length, top = W.slice().sort((a, b) => b.c - a.c);
      o.innerHTML = W.length ? `<div class="x17-kpis sm"><div class="x17-kpi"><span>Breadth</span><b>${up}/${W.length} up</b></div><div class="x17-kpi"><span>Leader</span><b class="up">${E(baseOf(top[0].s))}</b></div><div class="x17-kpi"><span>Laggard</span><b class="dn">${E(baseOf(top[top.length - 1].s))}</b></div></div>` : '<p class="note">Watchlist quotes loading…</p>'; },
    events() { const C = candles().map((c) => ({ t: V17P.toSec(c.t), c: c.c, h: c.h, l: c.l })), ev = V17P.lastEvents(V17P.FOMC.concat((cfg.events || []).map((d) => ({ kind: 'CPI', date: d, utcH: 13 }))), Date.now(), 12), rows = V17P.reaction(C, ev), st = V17P.reactionStats(rows), o = $1('#x17EvOut'); if (!o) return rows;
      o.innerHTML = `<table class="x17-t"><thead><tr><th>Event</th><th>Date</th><th>+1h</th><th>+4h</th><th>+1d</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${E(r.kind)}</td><td>${E(r.date)}</td>${r.moves.map((m) => `<td class="num ${m > 0 ? 'up' : m < 0 ? 'dn' : ''}">${m == null ? '–' : pct(m, 2)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Average · % up</td>${st.map((x) => `<td class="num">${x.n ? pct(x.avg, 2) + ' · ' + pct(x.up, 0) : '–'}</td>`).join('')}</tr></tfoot></table><p class="note">Uses only the candles already loaded on this chart (zoom out or pick 1h for older events).</p>`; return rows; },
    async sec() { const o = $1('#x17SecOut'), s = sym(); if (!o) return; if (!(typeof isStock === 'function' && isStock(s))) { o.textContent = 'Switch to a stock first.'; return; } if (typeof J === 'undefined') return; o.textContent = 'Loading SEC filings…';
      try { const map = await J.get('https://www.sec.gov/files/company_tickers.json', { timeout: 20000, proxy: true }), hit = Object.values(map).find((v) => String(v.ticker).toUpperCase() === s); if (!hit) { o.textContent = 'Ticker not found at the SEC.'; return; } const cik = String(hit.cik_str).padStart(10, '0'), sub = await J.get('https://data.sec.gov/submissions/CIK' + cik + '.json', { timeout: 20000, proxy: true }), R = sub.filings && sub.filings.recent; if (!R) { o.textContent = 'No filings.'; return; }
        const pick = (f) => { const i = R.form.indexOf(f); return i >= 0 ? R.filingDate[i] : null; }, q = pick('10-Q'), k = pick('10-K'), last = [q, k].filter(Boolean).sort().pop(), est = last ? new Date(Date.parse(last) + 91 * 864e5).toISOString().slice(0, 10) : null, f4 = R.form.filter((f, i) => f === '4' && Date.parse(R.filingDate[i]) > Date.now() - 90 * 864e5).length;
        o.innerHTML = `<div class="x17-strip"><span>10-Q <b>${E(q || '–')}</b></span><span>10-K <b>${E(k || '–')}</b></span><span>8-K <b>${E(pick('8-K') || '–')}</b></span><span>Next earnings ≈ <b>${E(est || '–')}</b> <em>(est.)</em></span><span>Form 4 (90d) <b>${f4}</b></span><span>13F holders: <b>quarterly, via EDGAR full-text search</b></span></div>`; } catch (e) { o.textContent = 'SEC unreachable: run serve.py (the launcher proxies SEC).'; } },
    beta(shock) { const o = $1('#x17BetaOut'); if (!o || typeof ACC === 'undefined') return; const bench = (s) => (typeof isStock === 'function' && isStock(s) ? 'SPY' : 'BTC-USD'), hasS = typeof Stores !== 'undefined', pos = Object.entries(ACC.pos).map(([s, p]) => { const st = hasS ? Stores.get(s + '|' + ST.tf) : null, bs = hasS ? Stores.get(bench(s) + '|' + ST.tf) : null, b = st && bs && st.candles.length > 30 && bs.candles.length > 30 && s !== bench(s) ? V17P.beta(V17P.rets(st.candles.slice(-200)), V17P.rets(bs.candles.slice(-200))) : 1; const px = (typeof Feed !== 'undefined' && Feed.live[s] && Feed.live[s].price) || p.cost / p.qty; return { sym: s, value: p.qty * px, beta: b }; });
      const r = V17P.betaShock(pos, shock); if (shock <= -10) mission('beta'); o.innerHTML = `<p><b class="${r.pnl >= 0 ? 'up' : 'dn'}">${usd(r.pnl)}</b> portfolio P&amp;L if the benchmark moves ${shock > 0 ? '+' : ''}${shock}%</p>${r.rows.length ? `<table class="x17-t"><thead><tr><th>Position</th><th>Value</th><th>β</th><th>Shock P&amp;L</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td>${E(x.sym)}</td><td class="num">${usd(x.value)}</td><td class="num">${x.beta.toFixed(2)}</td><td class="num ${x.pnl >= 0 ? 'up' : 'dn'}">${usd(x.pnl)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">No open paper positions.</p>'}`; return r; },
    feats() { const C = candles(), cl = C.map((c) => c.c), i = cl.length - 1, A = V17P.atr(C, 14); const rsi = typeof NT !== 'undefined' && NT.ind && NT.ind.rsi ? NT.ind.rsi(cl, 14)[i] : NaN; const vw = typeof NT !== 'undefined' && NT.ind && NT.ind.rvwap && C.length > 20 ? NT.ind.rvwap(C, 48).vw[i] : NaN;
      return { conf: U.conf ? U.conf.score : null, rsi, vwapDist: vw > 0 ? cl[i] / vw - 1 : NaN, cvd: typeof V170UI !== 'undefined' && V170UI.merger && V170UI.merger.n ? V170UI.merger.cvd(V170.ALL) : NaN, gexRegime: U.gex && U.gex.sym === sym() ? U.gex.r.regime : null, atrPct: cl[i] ? A[A.length - 1] / cl[i] : NaN, spoofs: U.spoofs.length, event: V17P.FOMC.some((e) => e.date === new Date().toISOString().slice(0, 10)) ? 'FOMC today' : null }; },
    debate() { const d = V17P.debate(this.feats()), o = $1('#x17DebOut'); if (!o) return d; const col = (t, a, c) => `<div class="x17-deb ${c}"><h4>${t}</h4><ul>${a.map((x) => `<li>${E(x)}</li>`).join('') || '<li class="note">No arguments</li>'}</ul></div>`; o.innerHTML = `<div class="x17-debs">${col('🐂 Bull', d.bull, 'up')}${col('🐻 Bear', d.bear, 'dn')}${col('🛡 Risk', d.risk, 'amb')}</div><p><b>${E(d.verdict)}</b> <span class="note">Deterministic from on-screen data; send to the AI tab to expand.</span></p>`; return d; },
  };
  U.pulse = Pulse;

  /* ══ 10. 3D tab: volumetric order blocks + L2 wall fusion + replay scrubber ══ */
  const D3 = {
    raf: 0, idx: -1,
    show() { const s = $1('#tab-d3'); if (!s) return; if (!s.firstChild) { s.innerHTML = `<div class="x17-wrap">${card('x17D3', '3D Volumetric Order Blocks · L2 Wall Fusion', '<canvas id="x17D3C" width="1100" height="520" aria-label="3D order blocks and order book walls"></canvas><div class="row"><span class="note">Replay</span><input type="range" id="x17Scrub" min="60" max="100" value="100" aria-label="Replay scrubber" style="flex:1"><span class="note" id="x17ScrubT"></span><label class="x17-chk"><input type="checkbox" id="x17ObOn"> Order blocks on 2D chart</label></div>')}</div>`;
        const sc = $1('#x17Scrub'); sc.addEventListener('input', () => { this.idx = +sc.value; this.draw(); }); const ob = $1('#x17ObOn'); ob.checked = cfg.ob; ob.addEventListener('change', () => { cfg.ob = ob.checked; save(); this.blocks(); Layer.dirty(); }); }
      const C = candles(), sc = $1('#x17Scrub'); if (sc) { sc.max = String(C.length); sc.min = String(Math.min(C.length, 60)); if (this.idx < 0 || this.idx > C.length) { this.idx = C.length; sc.value = sc.max; } } this.blocks(); this.draw(); },
    blocks() { const C = candles(); U.obs = { sym: sym(), list: V17P.orderBlocks(C, 2, 14) }; return U.obs.list; },
    draw() { const cv = $1('#x17D3C'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height, C0 = candles(), n = Math.max(2, Math.min(C0.length, this.idx < 0 ? C0.length : this.idx)), C = C0.slice(Math.max(0, n - 120), n); if (C.length < 2) return;
      const hi = Math.max(...C.map((c) => c.h)), lo = Math.min(...C.map((c) => c.l)), vmax = Math.max(...C.map((c) => c.v || 1)), iso = (i, p, z) => [80 + i * ((W - 260) / C.length) + z * 0.6, H - 70 - ((p - lo) / (hi - lo || 1)) * (H - 160) - z * 0.35];
      g.fillStyle = '#07080B'; g.fillRect(0, 0, W, H);
      const obs = V17P.orderBlocks(C0.slice(0, n), 2, 14).filter((b) => b.t >= C[0].t); for (const b of obs) { const i0 = C.findIndex((c) => c.t >= b.t), hgt = 10 + (b.vol / (vmax * 4)) * 70, [x0, y0] = iso(i0, b.top, 0), [x1, y1] = iso(C.length - 1, b.bot, 0), col = b.side === 'bull' ? [46, 204, 143] : [255, 92, 108];
        g.fillStyle = `rgba(${col},.16)`; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = `rgba(${col},.32)`; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + hgt * 0.6, y0 - hgt * 0.35); g.lineTo(x1 + hgt * 0.6, y0 - hgt * 0.35); g.lineTo(x1, y0); g.closePath(); g.fill(); g.fillStyle = `rgba(${col},.22)`; g.beginPath(); g.moveTo(x1, y0); g.lineTo(x1 + hgt * 0.6, y0 - hgt * 0.35); g.lineTo(x1 + hgt * 0.6, y1 - hgt * 0.35); g.lineTo(x1, y1); g.closePath(); g.fill(); }
      C.forEach((c, i) => { const z = ((c.v || 0) / vmax) * 40, [x, yh] = iso(i, c.h, z), [, yl] = iso(i, c.l, z), [, yo] = iso(i, c.o, z), [, yc] = iso(i, c.c, z), up = c.c >= c.o; g.strokeStyle = up ? '#2ECC8F' : '#EF4444'; g.beginPath(); g.moveTo(x, yh); g.lineTo(x, yl); g.stroke(); g.fillStyle = up ? '#2ECC8F' : '#EF4444'; g.fillRect(x - 2, Math.min(yo, yc), 4, Math.max(1, Math.abs(yc - yo))); });
      const bk = U.dom.length ? U.dom[U.dom.length - 1] : null; if (bk) { const all = (bk.bids || []).concat(bk.asks || []), qm = Math.max(1e-9, ...all.map((x) => x[1])); for (const [side, rows] of [['bid', bk.bids || []], ['ask', bk.asks || []]]) for (const [p, q] of rows.slice(0, 12)) { if (p < lo || p > hi) continue; const [x, y] = iso(C.length, p, 0), w = (q / qm) * 150; g.fillStyle = side === 'bid' ? 'rgba(46,204,143,.55)' : 'rgba(255,92,108,.55)'; g.fillRect(x + 10, y - 2, w, 4); } }
      g.fillStyle = '#F5C84B'; g.font = '600 12px Inter, sans-serif'; g.fillText(`${sym()} · ${obs.length} order blocks · L2 walls ${bk ? 'live' : 'waiting for book'}`, 16, 22); const t = $1('#x17ScrubT'); if (t) t.textContent = new Date(V17P.toSec(C[C.length - 1].t) * 1000).toISOString().slice(0, 16).replace('T', ' '); },
    stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
  };
  U.d3 = D3;

  /* ══ 11. DOM spoof ladder (collapsible, side column) + book capture ══ */
  const Dom = {
    mount() { const side = $1('#tab-markets .side-col'); if (!side || $1('#x17Dom')) return; const d = document.createElement('details'); d.id = 'x17Dom'; d.className = 'panel x17-dom'; d.innerHTML = '<summary><span>DOM Spoof Ladder</span><span class="note" id="x17DomN"></span></summary><div id="x17DomL" class="x17-domL"></div>'; const bk = $1('.panel.book', side); if (bk) bk.after(d); else side.appendChild(d); d.addEventListener('toggle', () => { if (d.open) { mission('dom'); this.paint(); } }); },
    capture() { if (typeof Depth3D === 'undefined' || Depth3D.push._x17) return; const o = Depth3D.push; Depth3D.push = function (s, bk) { try { if (bk && s === ST.sel) { const last = typeof Feed !== 'undefined' && Feed.live[s] ? Feed.live[s].price : null; U.dom.push({ t: Date.now(), bids: (bk.bids || []).slice(0, 20), asks: (bk.asks || []).slice(0, 20), last }); if (U.dom.length > 120) U.dom.shift(); U.spoofs = V17P.spoofs(U.dom, { k: 5, maxMs: 3000 }).slice(-20); Dom.paint(); } } catch (e) { /* ladder optional */ } return o.apply(this, arguments); }; Depth3D.push._x17 = true; },
    paint() { const d = $1('#x17Dom'), n = $1('#x17DomN'); if (n) n.textContent = U.spoofs.length ? U.spoofs.length + ' spoof' + (U.spoofs.length > 1 ? 's' : '') : ''; if (!d || !d.open) return; const bk = U.dom[U.dom.length - 1], L = $1('#x17DomL'); if (!L) return; if (!bk) { L.innerHTML = '<p class="note">Waiting for order book…</p>'; return; }
      const sp = new Set(U.spoofs.map((s) => s.side + s.px)), mx = Math.max(1e-9, ...bk.bids.concat(bk.asks).map((x) => x[1])), row = (side, x) => `<div class="x17-lr ${side}${sp.has(side + x[0]) ? ' spoof' : ''}"><span class="num">${fmt(x[0])}</span><span class="num">${typeof NT !== 'undefined' ? NT.fmtQty(x[1]) : x[1]}</span><i style="width:${(x[1] / mx) * 100}%"></i></div>`;
      L.innerHTML = bk.asks.slice(0, 10).reverse().map((x) => row('ask', x)).join('') + bk.bids.slice(0, 10).map((x) => row('bid', x)).join('') + (U.spoofs.length ? `<p class="note">Recent pulled walls: ${U.spoofs.slice(-3).map((s) => `${s.side} ${fmt(s.px)} (${(s.lifeMs / 1000).toFixed(1)}s)`).join(' · ')}</p>` : ''); },
  };
  U.dom_ = Dom;

  /* ══ 12. 6-TF confluence pill (header, 0 extra calls: uses stores already loaded, else resamples the chart) ══ */
  const Conf = {
    mount() { const q = $1('#top .quote'); if (!q || $1('#x17Conf')) return; const p = document.createElement('span'); p.id = 'x17Conf'; p.className = 'x17-conf'; p.setAttribute('role', 'status'); p.setAttribute('aria-label', '6-timeframe confluence'); q.after(p); },
    calc() { const C = candles().map((c) => ({ t: V17P.toSec(c.t), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })), base = tfSec(), by = {};
      for (const [k, sec] of V17P.TF6) { const st = typeof Stores !== 'undefined' ? Stores.get(sym() + '|' + k) || Stores.get(sym() + '|' + k.toLowerCase()) : null; by[k] = st && st.candles && st.candles.length >= 20 ? st.candles : sec >= base ? V17P.resample(C, sec) : null; }
      U.conf = V17P.confluence(by); return U.conf; },
    paint() { const p = $1('#x17Conf'); if (!p) return; const r = this.calc(), h = r.votes.map((v) => `<i class="${v.bias > 0 ? 'up' : v.bias < 0 ? 'dn' : ''}" title="${v.tf}: ${v.bias > 0 ? 'bull' : v.bias < 0 ? 'bear' : 'neutral'}"></i>`).join('') + `<b>${r.score > 0 ? '+' : ''}${r.score}</b>`; if (p._h !== h) { p._h = h; p.innerHTML = h; p.title = '6-TF confluence (1m · 5m · 15m · 1h · 4h · 1D): ' + r.label; } },
  };
  U.conf_ = Conf;

  /* ══ 13. voice commands (Web Speech API; orders always ask for confirmation, paper only) ══ */
  const Voice = {
    listen() { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { T('Voice commands need Chrome / Edge speech recognition', 'dn'); return; } try { const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.onresult = (e) => this.run(e.results[0][0].transcript); r.onerror = () => T('Voice: did not catch that', 'dn'); r.start(); T('🎙 Listening…'); } catch (e) { T('Voice unavailable', 'dn'); } },
    run(text) { const c = V17P.parseVoice(text); U.lastVoice = c; if (!c) return c; T('🎙 “' + E(text) + '”');
      if (c.kind === 'tab') { if (c.tab === 'brief') Brief.open(true); else showTab(c.tab); } else if (c.kind === 'symbol') { if (typeof openSym === 'function') openSym(/-/.test(c.sym) || (typeof STOCKS !== 'undefined' && STOCKS.some((s) => s[0] === c.sym)) ? c.sym : c.sym + '-USD'); }
      else if (c.kind === 'levels') Brief.plot(); else if (c.kind === 'balances' && typeof V17Mob !== 'undefined') V17Mob.hideBalances(c.hide);
      else if (c.kind === 'tf' && typeof tfList === 'function') { const t = tfList().find((x) => x.toLowerCase() === c.tf.toLowerCase()); if (t) { ST.tf = t; ensureSym(ST.sel); chartRefresh(true); } }
      else if (c.kind === 'order') { U.voiceOrder = c; T(`Voice order staged: ${c.side.toUpperCase()} ${c.usd ? '$' + c.usd : c.qty} ${c.sym || baseOf(sym())}. Confirm it in the ticket (paper only).`, 'amb'); }
      else if (c.kind === 'flatten') T('Say-to-flatten is disabled: use the ticket’s Flatten button', 'amb'); return c; },
  };
  U.voice = Voice;

  /* ══ boot ══ */
  let n = 0;
  const tick = () => { try {
    mountReach(); mountTabs(); Coach.mount(); Brief.pill(); mountToolbar(); Dom.mount(); Dom.capture(); Conf.mount(); Layer.attach();
    if (n % 2 === 0) { paintReach(); if (cfg.conf) Conf.paint(); trailTick(); }
    if (Grid4.on && n % 4 === 0) Grid4.feed();
    // new-day briefing: only on Markets, never stacked on another dialog / briefing / tour, never over a focused field
    if (n >= 6 && n % 2 === 0 && !navigator.webdriver && cfg.briefDay !== Brief.day() && typeof curTab !== 'undefined' && curTab === 'markets' && !document.querySelector('.x17-modal, .v13-modal, #langGate, #walkCard, #tourOv, #p2Brief, #v162Brief, #x17Lock, #x17Sheet:not([hidden])') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) Brief.open(false);
    if (U.demo && n % 20 === 0) Fleet.propose();
    if (typeof curTab !== 'undefined' && curTab === 'pulse' && n % 10 === 0) Pulse.market();
    n++; } catch (e) { console.warn('v17app', e); } };
  U.start = () => { if (U.mounted) return; U.mounted = true; tick(); setInterval(tick, 500);
    document.addEventListener('keydown', (e) => { if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !(document.activeElement || {}).isContentEditable && typeof curTab !== 'undefined' && curTab === 'markets' && e.shiftKey) { e.preventDefault(); Voice.listen(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Fleet.stop(); D3.stop(); } else if (typeof curTab !== 'undefined' && curTab === 'fleet') Fleet.start(); });
    if (cfg.grid4) setTimeout(() => Grid4.toggle(), 1500); };
  Object.assign(U, { coachRun: () => Coach.run(), paintReach, REACH_GO, Brief, Fleet, Wizard, Opts, Futs, Pulse, D3, Dom, Conf, Voice, Layer, Grid4, Coach, Ruler });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b17a = boot; boot = async function () { await _b17a.apply(this, arguments); try { V17App.start(); } catch (e) { console.warn('v17app init', e); } }; }
