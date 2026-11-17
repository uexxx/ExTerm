/* ExTerm v15.1 UI: one-click Auto-Setup (scanner rows, bubble nodes, Launch Radar rows), MACRO / BOT event pins and
   whale / smart-money markers on the chart, benchmark ghost line, % risk sizing pill on the Entry/SL bracket, killzone
   countdown, workspace presets, Trader Tools (correlation matrix, strategy → prop challenge runner, regime lock, setup
   JSON share/import, Share Setup + Daily Recap PNGs), watchlist alert badges with WebAudio chimes and the ? cheat sheet.
   Pure logic lives in v151core.js (V151).
   Security: every external string reaches the DOM through esc() or textContent; no inline handlers (strict CSP);
   imported setups are re-validated by V151.setupIn; webhook pushes are opt-in and go through the launcher only. */
const V151UI = (() => {
  const U = { whales: new Map(), badges: new Map(), pins: [], pinKey: '', lastChime: 0, lastPush: new Map(), ac: null, corr: null, prop: null };
  const cfg = () => {
    const c = ST.v151 && typeof ST.v151 === 'object' ? ST.v151 : (ST.v151 = {});
    c.risk = Math.min(10, Math.max(0.1, +c.risk || 1));
    c.whaleUsd = Math.max(1000, +c.whaleUsd || 250000); c.dexUsd = Math.max(100, +c.dexUsd || 2500);
    for (const k of ['pins', 'whales']) c[k] = c[k] !== false;
    for (const k of ['mute', 'push', 'lock']) c[k] = !!c[k];
    if (c.ghost != null && !(typeof c.ghost === 'string' && /^[A-Za-z0-9:._^=\-]{1,100}$/.test(c.ghost))) c.ghost = null;
    return c;
  };
  const symOK = (s) => typeof s === 'string' && s.length < 120 && (isStock(s) || isOnchain(s) || (typeof Providers !== 'undefined' && Providers.ids && Providers.ids.has(s)));
  const fp = (p) => (p == null || !isFinite(p) ? '–' : p < 0.01 ? NT.fmtTiny(p) : NT.fmtPrice(p));
  const eqNow = () => { try { return ACC.equity(priceMap()); } catch (e) { return ACC.cash || 0; } };
  const setTf = (tf) => { if (!NT.TF[tf] || ST.tf === tf) return; const b = [...$$('#tfBtns button')].find((x) => x.textContent.trim() === tf); if (b) b.click(); };
  /* run f once cond() holds (setMode / selectSym can be async), polling for up to 5 s */
  const when = (cond, f, late) => { const t0 = Date.now(); const tick = () => { if (cond()) return f(); if (Date.now() - t0 > 5000) return late && late(); setTimeout(tick, 100); }; tick(); };
  const openSym = (sym) => { showTab('markets'); const m = modeOf(sym); if (m !== ST.mode) setMode(m, sym); else if (ST.sel !== sym) selectSym(sym); };

  /* ══ Auto-Setup: chart + Auto-Fibs + PDH/PDL + preview Entry/SL/TP + 3-agent risk summary ══ */
  U.autoSetup = async (sym) => {
    if (!symOK(sym)) { toast('Auto-Setup: unknown market', 'amb'); return null; }
    if (U.busy) return null; U.busy = true;
    try {
      openSym(sym); Feed.subscribe([sym]);
      if (typeof P5UI !== 'undefined') { const o = P5UI.cfg().ov; o.fib = true; o.pd = true; }
      saveState(); toast('⚙ Auto-Setup ' + esc(baseOf(sym)) + '…');
      let tf = ST.tf, R = null;
      try { R = await Desk.run(sym, tf); } catch (e) { R = { txt: '' }; }
      if (!R.plan && tf !== '1h') { tf = '1h'; try { R = await Desk.run(sym, tf); } catch (e) { R = { txt: 'The desk could not load candles: ' + e.message }; } }
      const pl = R.plan; let sz = null;
      if (pl && pl.side === 'buy' && pl.entry > 0 && pl.sl > 0 && pl.sl < pl.entry && ST.sel === sym) {
        sz = V151.posSize({ equity: eqNow(), riskPct: cfg().risk, entry: pl.entry, sl: pl.sl });
        ChartTrade.draft = { sym, usd: sz ? sz.usd : 1000, entry: pl.entry, sl: pl.sl, tp: pl.tp > pl.entry ? pl.tp : null };
        ChartTrade.hist.clear(); ChartTrade.changed(false);
      }
      if (typeof chart !== 'undefined' && chart) chart.invalidate();
      const head = pl ? `<div class="v151-kpis"><div><span class="k">Verdict</span><b>${esc(pl.verdict)}</b></div><div><span class="k">Entry</span><b>${esc(fp(pl.entry))}</b></div><div><span class="k">Stop</span><b class="dn">${esc(fp(pl.sl))}</b></div><div><span class="k">Target</span><b class="up">${esc(fp(pl.tp))}</b></div><div><span class="k">${esc(cfg().risk)}% risk size</span><b>${sz ? esc(NT.fmtUSD(sz.usd, 0)) : '–'}</b></div></div>` : '';
      p2modal('⚙ Auto-Setup · ' + baseOf(sym), `${head}<div class="v151-sum">${md(R.txt || 'No setup.')}</div><div class="note">Auto-Fibs and PDH / PDL are on. ${ChartTrade.draft && ChartTrade.draft.sym === sym ? 'Preview Entry / SL / TP lines are on the chart: drag them, then place or discard.' : 'No long setup right now, so no preview lines were placed.'} Paper trading only.</div>`, 'v151Setup');
      return R;
    } finally { U.busy = false; }
  };

  /* ══ chart overlays: ghost line, MACRO / BOT pins, whale + smart-money markers ══ */
  const ghostOverlay = (g, L, ch) => {
    const gs = cfg().ghost; if (!gs || gs === ST.sel || !L.D || L.end - L.start < 2) return;
    const st = getStore(gs, ST.tf); if (!st.loaded) { if (!st.loading && Date.now() - (st._v151t || 0) > 20000) { st._v151t = Date.now(); st.load(400); Feed.subscribe([gs]); } return; }
    const v = V151.ghost(L.D, st.candles, L.start, L.end), top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4;
    g.save(); g.beginPath(); g.rect(L.Lm, top, L.W - L.Rm - L.Lm, bot - top); g.clip();
    g.strokeStyle = L.col.fg; g.globalAlpha = 0.55; g.lineWidth = 1.4; g.setLineDash([5, 4]); g.beginPath(); let on = false, lx = 0, ly = 0;
    v.forEach((p, k) => { if (p == null) { on = false; return; } const x = L.kx(L.start + k), y = L.py(p); if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y); lx = x; ly = y; });
    g.stroke(); g.setLineDash([]); g.globalAlpha = 0.9; g.font = '600 10px Inter, system-ui, sans-serif'; g.fillStyle = L.col.fg; g.textAlign = 'right'; g.textBaseline = 'bottom';
    if (on) g.fillText(baseOf(gs) + ' ghost', lx - 4, ly - 3);
    g.restore();
  };
  const pinOverlay = (g, L, ch) => {
    if (!cfg().pins || !L.D || L.end - L.start < 2) { U.pins = []; return; }
    const D = L.D, t0 = D[L.start].t, t1 = D[L.end - 1].t + (ch.tfSec || 60), I = typeof Grok !== 'undefined' && Grok.intel ? Grok.intel : null, J0 = typeof Journal !== 'undefined' && Array.isArray(Journal.entries) ? Journal.entries : [];
    const key = ST.sel + '|' + t0 + '|' + t1 + '|' + (I ? I.ts + ':' + I.items.length : 0) + '|' + J0.length;
    if (U.pinKey !== key) { U.pinKey = key; U.pins = V151.pins({ intel: I ? I.items : [], closed: J0.length ? Journal.closed(J0) : [], sym: ST.sel, t0, t1, why: (c) => (P3.autopsy([c], 1)[0] || { why: [] }).why }); }
    if (!U.pins.length) return;
    const top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4;
    g.save(); g.font = '700 9px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    for (const p of U.pins) {
      const x = Math.round(ch.tToX(p.t)) + 0.5; if (!(x >= L.Lm && x <= L.W - L.Rm)) continue;
      const c = p.kind === 'MACRO' ? L.col.amb : p.win === false ? L.col.dn : p.entry ? L.col.acc : L.col.up;
      g.strokeStyle = c; g.globalAlpha = 0.5; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, top + 14); g.lineTo(x, bot); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      const w = p.kind === 'MACRO' ? 38 : 26; g.fillStyle = c; g.fillRect(x - w / 2, top + 2, w, 12); g.fillStyle = L.col.pan; g.fillText(p.kind, x, top + 8);
      if (p.price > 0) { const y = L.py(p.price); if (y >= top && y <= bot) { g.fillStyle = c; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); } }
    }
    g.restore();
  };
  const whaleOverlay = (g, L, ch) => {
    if (!cfg().whales || !(ch.tfSec > 0 && ch.tfSec < 60) || !L.D || L.end - L.start < 2) return;
    const list = U.whales.get(ST.sel); if (!list || !list.length) return;
    const D = L.D, tf = ch.tfSec, t0 = D[L.start].t, t1 = D[L.end - 1].t + tf, top = L.y0, bot = L.y0 + L.mainH - (L.volH || 0) - 4, now = Date.now() / 1000;
    g.save(); g.beginPath(); g.rect(L.Lm, top, L.W - L.Rm - L.Lm, bot - top); g.clip();
    for (const m of list) {
      if (m.t < t0 || m.t > t1) continue;
      const p = m.p, x = ch.tToX(Math.floor(m.t / tf) * tf); if (!(p > 0)) continue;
      const y = L.py(p), r = Math.max(3, Math.min(11, 2 + Math.log10(Math.max(10, m.usd)) * 1.3)), fresh = now - m.t < 6;
      const c = m.kind === 'smart' ? '#E5C158' : m.side === 'buy' ? L.col.up : L.col.dn;
      g.globalAlpha = fresh ? 0.95 : 0.6; g.strokeStyle = c; g.lineWidth = fresh ? 2.4 : 1.4; g.beginPath(); g.arc(x, y, r + (fresh ? 3 : 0), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = fresh ? 0.45 : 0.2; g.fillStyle = c; g.fill();
      if (m.kind === 'smart' || fresh) { g.globalAlpha = 1; g.fillStyle = L.col.fg; g.font = '700 9px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(m.kind === 'smart' ? 'SM ' + m.who.slice(0, 12) : '🐋 ' + NT.fmtCompact(m.usd), x, y - r - 4); }
    }
    g.restore();
  };
  U.overlay = (g, L, ch) => { if (typeof chart === 'undefined' || ch !== chart || !L.py) return; for (const f of [ghostOverlay, whaleOverlay, pinOverlay]) { try { f(g, L, ch); } catch (e) { /* an overlay must never break the chart */ } } };

  /* pin hover tooltips */
  const pinHover = (e) => {
    const tip = $('#tip'); if (!tip || typeof chart === 'undefined' || !chart || !chart.L || !U.pins.length) return;
    const r = chart.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, L = chart.L;
    const p = y >= L.y0 && y <= L.y0 + L.mainH ? V151.pinAt(U.pins, (t) => chart.tToX(t), x, 6) : null;
    if (!p) { if (tip.dataset.v151) { tip.style.display = 'none'; delete tip.dataset.v151; } return; }
    tip.dataset.v151 = '1'; tip.innerHTML = `<b>${esc(p.kind === 'MACRO' ? '🌐 MACRO · CRITICAL' : p.entry ? '🤖 BOT entry' : '🤖 BOT exit · ' + p.label)}</b><br>${esc(p.kind === 'MACRO' ? p.label : p.sub || p.label)}${p.kind === 'MACRO' && p.sub ? '<br><span class="mut">' + esc(p.sub) + '</span>' : ''}<br><span class="mut">${esc(fmtStamp(p.t * 1000))}</span>`;
    tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - 260, e.clientX + 14) + 'px'; tip.style.top = Math.min(innerHeight - 120, e.clientY + 14) + 'px';
  };

  /* ══ whale tape + smart-money wallets → markers, badges, opt-in webhook push ══ */
  const onWhale = (m) => {
    V151.pushCapped(U.whales.get(m.sym) || (U.whales.set(m.sym, []), U.whales.get(m.sym)), m, 300);
    U.badge(m.sym, m.kind === 'smart' ? 'smart' : 'whale', `${m.kind === 'smart' ? '👛 ' + m.who : '🐋'} ${m.side} ${NT.fmtUSD(m.usd, 0)}`);
    const c = cfg(), last = U.lastPush.get(m.sym) || 0;
    if (c.push && m.kind === 'whale' && Date.now() - last > 60000 && typeof WalletPro !== 'undefined') { U.lastPush.set(m.sym, Date.now()); WalletPro.push(`🐋 Whale ${m.side} ${NT.fmtUSD(m.usd, 0)} of ${baseOf(m.sym)} @ ${fp(m.p)} · ExTerm`); }
    if (m.sym === ST.sel && typeof chart !== 'undefined' && chart) chart.invalidate();
  };
  const onTrade = (sym, p, q, side, ts, x) => {
    const c = ST.v151 || cfg(); if (!c.whales) return; // cfg() normalises on load / change; the hot path only reads
    const w = x && x.who && typeof Sol !== 'undefined' && Sol.byAddr ? Sol.byAddr(x.who) : null;
    const m = V151.whaleMark(sym, p, q, side, ts, w ? Object.assign({}, x, { smart: true, who: w.name || Sol.short(w.addr) }) : x && { usd: x.usd }, isOnchain(sym) ? c.dexUsd : c.whaleUsd); if (m) onWhale(m);
  };
  const onSol = (ev) => {
    if (!cfg().whales || !ev || ev.hist || !ev.mint || (ev.side !== 'buy' && ev.side !== 'sell') || typeof OC === 'undefined') return;
    const syms = new Set((ST.watch || []).concat(ST.sel)); const who = String(ev.name || (typeof Sol !== 'undefined' ? Sol.short(ev.wallet) : '') || 'wallet');
    if (!(+ev.usd >= cfg().dexUsd)) return;
    for (const s of syms) if (isOnchain(s) && OC.meta[s] && OC.meta[s].ca === ev.mint && px(s) > 0) onWhale({ sym: s, t: (+ev.ts || Date.now()) / 1000, p: px(s) || null, usd: +ev.usd || 0, side: ev.side, who: who.slice(0, 40), kind: 'smart' });
  };

  /* ══ watchlist badges + chimes ══ */
  U.badge = (sym, kind, text) => {
    const was = U.badges.get(sym), fresh = !was || Date.now() - was.ts > 90000;
    U.badges.set(sym, { kind, text: String(text).slice(0, 80), ts: Date.now() });
    if (fresh && (ST.watch || []).includes(sym)) { U.chime(kind); U.decorateWatch(); }
  };
  U.chime = (kind) => {
    if (cfg().mute || Date.now() - U.lastChime < 20000) return; U.lastChime = Date.now();
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const A = U.ac || (U.ac = new AC()); if (A.state === 'suspended') A.resume().catch(() => {});
      const t = A.currentTime, base = kind === 'whale' ? 660 : kind === 'smart' ? 784 : 880;
      [[base, 0], [base * 1.5, 0.1]].forEach(([f, d]) => { const o = A.createOscillator(), gn = A.createGain(); o.type = 'sine'; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t + d); gn.gain.exponentialRampToValueAtTime(0.07, t + d + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4); o.connect(gn); gn.connect(A.destination); o.start(t + d); o.stop(t + d + 0.45); });
    } catch (e) { /* audio blocked */ }
  };
  U.decorateWatch = () => {
    const now = Date.now();
    for (const row of $$('#watchList .wl-row')) {
      const b = U.badges.get(row.dataset.s), live = b && now - b.ts < 90000;
      row.classList.toggle('v151-glow', !!live); row.classList.toggle('v151-whale', !!live && b.kind === 'whale'); row.classList.toggle('v151-smart', !!live && b.kind === 'smart'); row.classList.toggle('v151-signal', !!live && b.kind === 'signal');
      let el = row.querySelector('.v151-bdg');
      if (live) { if (!el) { el = document.createElement('span'); el.className = 'v151-bdg'; const n = row.firstElementChild; if (n) n.appendChild(el); } el.textContent = b.kind === 'whale' ? '🐋' : b.kind === 'smart' ? '👛' : '⚡'; el.title = b.text; }
      else if (el) el.remove();
    }
  };

  /* ══ % risk sizing pill on the Entry / SL bracket ══ */
  const riskPill = (b) => {
    const el = ChartTrade.boxEl; if (!el || el.hidden || !b) return;
    let r = el.querySelector('.v151-risk');
    const now = Date.now(), k = b.kind + '|' + b.entry + '|' + b.sl + '|' + cfg().risk; // runs every chart frame: recompute only when the bracket changes or once a second
    if (r && el._v151k === k && now - (el._v151t || 0) < 1000) return; el._v151k = k; el._v151t = now;
    const sz = b.sl > 0 && b.entry > 0 ? V151.posSize({ equity: eqNow(), riskPct: cfg().risk, entry: b.entry, sl: b.sl }) : null;
    if (!r) {
      r = document.createElement('div'); r.className = 'v151-risk';
      r.innerHTML = `<label>Risk <input class="in mono xs" data-v151risk inputmode="decimal" aria-label="Risk percent of equity">%</label><span class="v151-rs"></span><button type="button" class="btn xs pri" data-v151="apply">Apply Size</button>`;
      el.appendChild(r);
    }
    const inp = r.querySelector('[data-v151risk]'); if (document.activeElement !== inp) inp.value = String(cfg().risk);
    const t = sz ? `= ${NT.fmtUSD(sz.riskUsd)} at risk → ${NT.fmtUSD(sz.usd, 0)}${sz.capped ? ' (capped at equity)' : ''}` : 'set a stop to size by risk';
    const rs = r.querySelector('.v151-rs'); if (rs.textContent !== t) rs.textContent = t;
    const ap = r.querySelector('[data-v151="apply"]'); ap.disabled = !sz || b.kind !== 'draft'; ap.title = b.kind === 'draft' ? 'Set the draft size to this risk' : 'Sizing applies to drafts (before you place the order)';
    if (!el._v151) {
      el._v151 = true;
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-v151="apply"]')) return;
        const d = ChartTrade.draft, cur = ChartTrade.b; if (!d || !cur || cur.kind !== 'draft') return;
        const s2 = V151.posSize({ equity: eqNow(), riskPct: cfg().risk, entry: d.entry, sl: d.sl }); if (!s2) return;
        d.usd = s2.usd; const i = el.querySelector('[data-ctin="usd"]'); if (i) i.value = String(s2.usd);
        ChartTrade.changed(false); toast(`Size set to ${NT.fmtUSD(s2.usd, 0)} (${cfg().risk}% risk)`, 'up');
      });
      el.addEventListener('change', (e) => { if (!e.target.matches('[data-v151risk]')) return; const v = +e.target.value; if (v > 0) { ST.v151.risk = v; cfg(); saveState(); } riskPill(ChartTrade.b); });
    }
  };

  /* ══ killzone pill ══ */
  const kz = () => {
    const el = $('#kzText'), pill = $('#kzPill'); if (!el || !pill) return;
    const now = Date.now() / 1000, s = V151.session(now, typeof P5 !== 'undefined' ? P5.nyOffset(now) : -18000);
    const t = s.active ? `${s.active} · ${V151.fmtDur(s.left)} left` : s.next ? `${s.next} in ${V151.fmtDur(s.inSec)}` : 'Weekend';
    if (el.textContent !== t) el.textContent = t;
    pill.classList.toggle('on', !!s.active); pill.dataset.kz = s.id || '';
  };

  /* ══ workspace presets ══ */
  U.preset = (k) => {
    const P = V151.PRESETS[k]; if (!P) return;
    const c = cfg(); c.whales = P.whales; c.ghost = P.ghost; saveState();
    if (typeof P5UI !== 'undefined') { const o = P5UI.cfg(); Object.assign(o.ov, P.ov); if (P.sec) o.sec = P.sec; }
    if (typeof WS !== 'undefined' && WS.applyPreset) WS.applyPreset(P.name, P.grid, P.cells);
    if (ST.mode !== P.mode) setMode(P.mode);
    when(() => ST.mode === P.mode, () => { setTf(P.tf); showTab(P.tab); if (typeof chart !== 'undefined' && chart) chart.invalidate(); });
    ST.v151.preset = k; saveState(); syncPresets();
    toast(`${P.icon} ${P.name} workspace`, 'up');
  };
  const syncPresets = () => $$('#v151Presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === (ST.v151 && ST.v151.preset)));

  /* ══ PNG exports ══ */
  const save = (cv, name, msg) => cv.toBlob((b) => { if (!b || !download(name, b, 'image/png')) toast('Downloads are blocked here', 'amb'); else toast(msg, 'up'); }, 'image/png');
  U.shareCanvas = () => {
    if (typeof chart === 'undefined' || !chart || !chart.cv || !chart.cv.width) return null;
    const src = chart.cv, dpr = window.devicePixelRatio || 1, head = Math.round(64 * dpr), foot = Math.round(34 * dpr);
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height + head + foot; const g = cv.getContext('2d');
    g.fillStyle = cssv('--bg', '#0b0b0d'); g.fillRect(0, 0, cv.width, cv.height);
    g.save(); g.scale(dpr, dpr); V151.drawMark(g, 12, 8, 48); V151.drawWordmark(g, 70, 36, 24);
    const d = ChartTrade.draft && ChartTrade.draft.sym === ST.sel ? ChartTrade.draft : null, W = cv.width / dpr;
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = cssv('--text', '#f1f5f9'); g.font = '800 18px Inter, system-ui, sans-serif';
    g.fillText(`${baseOf(ST.sel)} · ${ST.tf} · ${fp(px(ST.sel))}`, W - 14, 22);
    g.font = '600 12px Inter, system-ui, sans-serif'; g.fillStyle = cssv('--mut', '#94a3b8');
    g.fillText(d ? `Entry ${fp(d.entry)} · SL ${d.sl ? fp(d.sl) : '–'} · TP ${d.tp ? fp(d.tp) : '–'}` : new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', W - 14, 44);
    g.restore();
    g.drawImage(src, 0, head);
    g.save(); g.scale(dpr, dpr); const y = (head + src.height) / dpr + 17; g.font = '500 11px Inter, system-ui, sans-serif'; g.fillStyle = cssv('--mut', '#94a3b8'); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Paper trading setup · not financial advice', 12, y);
    g.font = '800 14px Inter, system-ui, sans-serif'; g.fillStyle = '#D4AF37'; g.textAlign = 'right'; g.fillText('@exterm.labs', W - 12, y); g.restore();
    return cv;
  };
  U.shareSetup = () => { const cv = U.shareCanvas(); if (!cv) return toast('Open a chart first', 'amb'); save(cv, `exterm-setup-${baseOf(ST.sel).replace(/[^A-Za-z0-9]/g, '')}-${new Date().toISOString().slice(0, 10)}.png`, '📸 Setup snapshot saved'); };
  U.recapStats = () => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const C = typeof Journal !== 'undefined' && Array.isArray(Journal.entries) ? Journal.closed(Journal.entries).filter((c) => c.ts >= d0.getTime()) : [];
    const pnl = C.reduce((s, c) => s + (+c.pnl || 0), 0), wins = C.filter((c) => c.win).length, best = C.slice().sort((a, b) => b.pnl - a.pnl)[0], worst = C.slice().sort((a, b) => a.pnl - b.pnl)[0];
    return { n: C.length, wins, pnl, wr: C.length ? (wins / C.length) * 100 : null, best, worst, eq: eqNow(), date: d0.toISOString().slice(0, 10) };
  };
  U.recapCanvas = () => {
    const S = U.recapStats(), cv = document.createElement('canvas'); cv.width = cv.height = 1080; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1080, 1080); bg.addColorStop(0, '#16130c'); bg.addColorStop(1, '#0a0a0b'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
    g.strokeStyle = 'rgba(212,175,55,.35)'; g.lineWidth = 3; g.strokeRect(30, 30, 1020, 1020);
    V151.drawMark(g, 80, 80, 120); V151.drawWordmark(g, 220, 160, 66);
    g.fillStyle = '#e2e8f0'; g.font = '600 44px Inter, system-ui, sans-serif'; g.fillText('Daily Recap · ' + S.date, 80, 290);
    g.fillStyle = S.pnl >= 0 ? '#22c55e' : '#f43f5e'; g.font = '900 150px Inter, system-ui, sans-serif'; g.fillText((S.pnl >= 0 ? '+' : '−') + NT.fmtUSD(Math.abs(S.pnl), 0), 80, 470);
    const box = (x, y, l, v, c) => { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, y, 440, 150); g.fillStyle = '#94a3b8'; g.font = '600 30px Inter, system-ui'; g.fillText(l, x + 26, y + 50); g.fillStyle = c || '#f8fafc'; g.font = '800 58px Inter, system-ui'; g.fillText(v, x + 26, y + 120); };
    box(80, 540, 'Trades closed', String(S.n)); box(560, 540, 'Win rate', S.wr == null ? '–' : Math.round(S.wr) + '%');
    box(80, 720, 'Best', S.best ? String(baseOf(S.best.sym)).slice(0, 8) + ' ' + NT.fmtUSD(S.best.pnl, 0) : '–', '#22c55e'); box(560, 720, 'Equity', NT.fmtUSD(S.eq, 0), '#F3D06B');
    g.fillStyle = '#64748b'; g.font = '500 30px Inter, system-ui, sans-serif'; g.fillText('Paper money · not financial advice', 80, 960);
    g.fillStyle = '#D4AF37'; g.font = '800 44px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('@exterm.labs', 1000, 1020);
    return cv;
  };
  U.recap = () => save(U.recapCanvas(), `exterm-recap-${new Date().toISOString().slice(0, 10)}.png`, '📓 Daily recap saved');

  /* ══ setup JSON share / import ══ */
  U.setupText = () => { const b = ChartTrade.cur ? ChartTrade.cur() : null; if (!b || !(b.entry > 0)) return null; return V151.setupOut({ sym: b.sym, tf: ST.tf, entry: b.entry, sl: b.sl, tp: b.tp, riskPct: cfg().risk }); };
  U.importSetup = (txt) => {
    const r = V151.setupIn(txt, (tf) => !!NT.TF[tf]); if (!r.ok) return r;
    const s = r.setup; if (!symOK(s.sym)) return { ok: false, error: 'That market is not available here' };
    openSym(s.sym); if (s.tf) setTf(s.tf); if (s.riskPct) { ST.v151.risk = s.riskPct; cfg(); }
    const sz = s.sl ? V151.posSize({ equity: eqNow(), riskPct: cfg().risk, entry: s.entry, sl: s.sl }) : null;
    when(() => ST.sel === s.sym, () => { ChartTrade.draft = { sym: s.sym, usd: sz ? sz.usd : 1000, entry: s.entry, sl: s.sl, tp: s.tp }; ChartTrade.hist.clear(); ChartTrade.changed(false); }, () => toast('The setup market did not open in time: try again', 'amb'));
    saveState(); return r;
  };

  /* ══ correlation matrix ══ */
  U.CORR = [['BTC', 'BTC-USD'], ['SOL', 'SOL-USD'], ['SPY', 'SPY'], ['NVDA', 'NVDA'], ['DXY', 'UUP'], ['GOLD', 'GLD']];
  U.loadCorr = async () => {
    const series = {};
    await Promise.all(U.CORR.map(async ([k, s]) => { try { series[k] = await History.get(s, 86400, 120); } catch (e) { series[k] = []; } }));
    U.corr = Object.assign(V151.corrMatrix(series), { ts: Date.now(), n: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.length])) });
    renderTools();
  };
  const corrHtml = () => {
    if (!U.corr) return '<div class="note">Daily returns, last ~120 sessions. DXY uses UUP and GOLD uses GLD as tradeable proxies.</div><button type="button" class="btn sm" data-v151="corr">Load matrix</button>';
    const { keys, M } = U.corr, cell = (v) => v == null ? '<td class="v151-na">–</td>' : `<td style="--c:${Math.round(Math.abs(v) * 70)}%" class="${v >= 0 ? 'pos' : 'neg'}">${esc(v.toFixed(2))}</td>`;
    return `<table class="v151-corr"><tr><th></th>${keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr>${keys.map((a, i) => `<tr><th>${esc(a)}</th>${M[i].map(cell).join('')}</tr>`).join('')}</table><div class="note">Pearson correlation of daily log returns · DXY = UUP, GOLD = GLD · <a href="#" data-v151="corr">refresh</a></div>`;
  };

  /* ══ strategy → prop challenge runner ══ */
  const stratList = () => Object.entries(NT.strategies).filter(([, S]) => S && !S.liveOnly && typeof S.prepare === 'function').map(([id, S]) => [id, String(S.name || id).replace(/^★ /, '')]).sort((a, b) => a[1].localeCompare(b[1]));
  U.runProp = async (id, mode, swan) => {
    const S = NT.strategies[id], M = Challenge.MODES[mode]; if (!S || !M || !['prop50', 'prop100', 'swan'].includes(mode)) return { ok: false, error: 'Pick a strategy and a challenge' };
    let c, fromT = 0, cash0 = M.cash0 || 10000;
    if (mode === 'swan') { const k = Challenge.SWANS[swan] ? swan : 'covid'; c = Challenge.swanCandles(k, Challenge.rng(Challenge.seed('v151' + k))); fromT = c[Math.min(c.length - 1, Challenge.SWANS[k].show || 60)].t; }
    else { const sym = isOnchain(ST.sel) ? 'BTC-USD' : ST.sel; c = await History.get(sym, 3600, 540); if (c.length < 300) return { ok: false, error: 'Not enough 1h history for ' + baseOf(sym) }; fromT = c[c.length - (M.play || 240)].t; }
    const bt = NT.backtest(c, S, NT.defaultParams(id), { cash: cash0, fromT });
    const ev = V151.propEval(bt.eq, M.rules, cash0), bh = bt.bh && bt.bh.length ? (bt.bh[bt.bh.length - 1] / bt.bh[0] - 1) * 100 : null;
    const passed = ev.ok && (mode === 'swan' ? ev.passed && (ev.ret > 0 || (bh != null && ev.ret > bh)) : ev.passed);
    return Object.assign({ id, name: String(S.name || id).replace(/^★ /, ''), mode, modeName: M.name, trades: bt.trades.filter((t) => t.side === 'sell').length, bh }, ev, { passed });
  };
  const propHtml = () => {
    const p = U.prop, list = stratList(), cur = (ST.v151 && ST.v151.propStrat) || (list[0] || [])[0];
    const res = !p ? '' : p.error ? `<div class="note dn">${esc(p.error)}</div>` : `<div class="v151-kpis"><div><span class="k">Result</span><b class="${p.passed ? 'up' : 'dn'}">${p.passed ? 'PASSED' : 'FAILED'}</b></div><div><span class="k">Return</span><b class="${p.ret >= 0 ? 'up' : 'dn'}">${esc(NT.fmtPct(p.ret, 2))}</b></div><div><span class="k">Max DD</span><b>${esc(p.maxDD.toFixed(2))}%</b></div><div><span class="k">Worst day</span><b>${esc(p.worstDay.toFixed(2))}%</b></div><div><span class="k">Trades</span><b>${esc(String(p.trades))}</b></div></div><div class="note">${esc(p.name)} · ${esc(p.modeName)}${p.fail ? ' · broke rule: ' + esc(p.fail) : ''}${p.bh != null ? ' · buy & hold ' + esc(NT.fmtPct(p.bh, 1)) : ''}</div>`;
    return `<div class="row v151-row"><select class="in" id="v151Strat" aria-label="Strategy">${list.map(([id, n]) => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select class="in" id="v151Mode" aria-label="Challenge"><option value="prop50">Prop $50K</option><option value="prop100">Prop $100K</option><option value="swan">Black Swan</option></select>
      <select class="in" id="v151Swan" aria-label="Black swan event">${Object.entries(Challenge.SWANS).map(([k, v]) => `<option value="${esc(k)}">${esc(v.l)}</option>`).join('')}</select>
      <button type="button" class="btn sm pri" data-v151="prop">Run</button></div><div class="note">${list.length} backtestable strategies · Prop rules: +8% target, 4% daily loss, 8% trailing drawdown on the last 240 × 1h bars of the open market · Black Swan: survive a 20% drawdown.</div><div id="v151PropOut">${res}</div>`;
  };

  /* ══ regime lock: Market Regime Detector → in-tab bots (opt-in, never with an open position) ══ */
  U.regimeTick = async () => {
    if (!cfg().lock) return [];
    const out = [];
    for (const b of ST.bots || []) {
      if (!b.run || b.manual || (b.account && b.account.pos && b.account.pos[b.sym])) continue;
      try {
        const reg = P3.regime(await candlesFor(b.sym, b.tf, 300)), d = V151.regimeSwitch(reg, b.strat);
        if (!d.switch || !NT.strategies[d.to]) continue;
        b.prevStrat = { strat: b.strat, params: b.params }; // kept so the switch can be undone by hand
        b.strat = d.to; b.params = NT.defaultParams(d.to); b.state = {}; b._rt = {}; out.push({ bot: b.name, to: d.to, regime: reg.regime });
        toast(`🔁 Regime ${esc(reg.regime)}: ${esc(b.name)} → ${esc(String(NT.strategies[d.to].name).replace(/^★ /, ''))}`, 'up');
      } catch (e) { /* no candles yet */ }
    }
    if (out.length) saveState();
    return out;
  };

  /* ══ Trader Tools modal ══ */
  const tog = (k, l) => `<label class="chk"><input type="checkbox" data-v151c="${k}" ${cfg()[k] ? 'checked' : ''}> ${l}</label>`;
  const toolsHtml = () => {
    const c = cfg(), gh = ['', 'BTC-USD', 'SPY', 'SOL-USD'];
    return `<div class="v151-tools">
      <section><h4>Workspace presets</h4><div class="seg v151-pre">${V151.PRESET_KEYS.map((k) => `<button type="button" data-preset="${k}">${V151.PRESETS[k].icon} ${esc(V151.PRESETS[k].name)}</button>`).join('')}</div></section>
      <section><h4>Chart & alerts</h4><div class="v151-opts">${tog('pins', 'MACRO / BOT event pins')}${tog('whales', 'Whale & smart-money markers (1s–30s)')}${tog('push', 'Send whale alerts to Discord / Telegram')}${tog('mute', 'Mute alert chimes')}${tog('lock', 'Regime lock: auto-switch idle in-tab bots')}</div>
        <div class="row v151-row"><span class="note">Benchmark ghost</span><div class="seg">${gh.map((s) => `<button type="button" data-ghost="${esc(s)}" class="${(c.ghost || '') === s ? 'on' : ''}">${s ? esc(baseOf(s)) : 'Off'}</button>`).join('')}</div>
        <label class="note">Whale ≥ $<input class="in mono xs" id="v151Wu" value="${esc(String(c.whaleUsd))}" inputmode="numeric" aria-label="Whale threshold USD"></label><label class="note">DEX ≥ $<input class="in mono xs" id="v151Du" value="${esc(String(c.dexUsd))}" inputmode="numeric" aria-label="DEX whale threshold USD"></label></div></section>
      <section><h4>Share</h4><div class="row v151-row"><button type="button" class="btn sm" data-v151="autosetup">⚙ Auto-Setup this chart</button><button type="button" class="btn sm" data-v151="share">📸 Share Setup PNG</button><button type="button" class="btn sm" data-v151="recap">📓 Daily Recap PNG</button><button type="button" class="btn sm" data-v151="copy">⧉ Copy Setup JSON</button></div>
        <textarea class="in mono" id="v151Json" rows="3" spellcheck="false" placeholder='Paste an ExTerm setup JSON, e.g. {"v":1,"app":"ExTerm","sym":"ETH-USD",...}'></textarea><div class="row v151-row"><button type="button" class="btn sm" data-v151="import">⤓ Import Setup JSON</button><span class="note" id="v151JsonMsg"></span></div></section>
      <section><h4>Cross-asset correlation</h4><div id="v151Corr">${corrHtml()}</div></section>
      <section><h4>Strategy → Prop challenge</h4>${propHtml()}</section></div>`;
  };
  function renderTools() { const host = $('#v151Body'); if (host) { host.innerHTML = toolsHtml(); syncPresets(); } }
  U.tools = () => {
    const ov = p2modal('🧰 Trader Tools', '<div id="v151Body"></div>', 'v151Tools'); renderTools();
    ov.addEventListener('click', onToolsClick); ov.addEventListener('change', onToolsChange);
  };
  async function onToolsClick(e) {
    const pr = e.target.closest('[data-preset]'); if (pr) { U.preset(pr.dataset.preset); return; }
    const gb = e.target.closest('[data-ghost]'); if (gb) { ST.v151.ghost = gb.dataset.ghost || null; cfg(); saveState(); renderTools(); if (chart) chart.invalidate(); return; }
    const a = e.target.closest('[data-v151]'); if (!a) return; const k = a.dataset.v151;
    if (k === 'corr') { e.preventDefault(); $('#v151Corr').innerHTML = '<div class="note">Loading daily history…</div>'; return U.loadCorr(); }
    if (k === 'share') return U.shareSetup();
    if (k === 'recap') return U.recap();
    if (k === 'autosetup') return U.autoSetup(ST.sel);
    if (k === 'copy') { const t = U.setupText(), m = $('#v151JsonMsg'); if (!t) { m.textContent = 'No Entry line on this chart yet: use Auto-Setup or the + button.'; return; } $('#v151Json').value = t; try { await navigator.clipboard.writeText(t); m.textContent = 'Copied ✓'; } catch (x) { m.textContent = 'Copy blocked: the JSON is in the box above.'; } return; }
    if (k === 'import') { const r = U.importSetup($('#v151Json').value); $('#v151JsonMsg').textContent = r.ok ? `Loaded ${baseOf(r.setup.sym)} setup ✓` : r.error; return; }
    if (k === 'prop') {
      const id = $('#v151Strat').value, mode = $('#v151Mode').value, sw = $('#v151Swan').value; ST.v151.propStrat = id; saveState();
      $('#v151PropOut').innerHTML = '<div class="note">Running backtest…</div>';
      try { U.prop = await U.runProp(id, mode, sw); } catch (x) { U.prop = { error: x.message }; }
      const keep = { mode, sw }; renderTools(); $('#v151Mode').value = keep.mode; $('#v151Swan').value = keep.sw;
    }
  }
  function onToolsChange(e) {
    const t = e.target, c = cfg();
    if (t.dataset.v151c) { c[t.dataset.v151c] = t.checked; saveState(); if (t.dataset.v151c === 'lock' && t.checked) U.regimeTick(); if (chart) chart.invalidate(); return; }
    if (t.id === 'v151Wu') { c.whaleUsd = Math.max(1000, +t.value || 250000); saveState(); }
    if (t.id === 'v151Du') { c.dexUsd = Math.max(100, +t.value || 2500); saveState(); }
  }

  /* ══ mount: header pill + tools button, nav presets, Auto-Setup delegation, hotkeys, palette, wrappers ══ */
  const mount = () => {
    if ($('#kzPill')) return;
    const src = $('#srcPill');
    if (src) { const p = document.createElement('div'); p.className = 'pill v151-kz'; p.id = 'kzPill'; p.title = 'Killzones in New York time: Asia 20:00–24:00 · London 02:00–05:00 · NY Open 09:30–11:00 · Power Hour 15:00–16:00'; p.innerHTML = '<i class="dot"></i><span id="kzText">–</span>'; src.before(p); }
    const pal = $('#btnPalette');
    if (pal) { const b = document.createElement('button'); b.id = 'btnTools'; b.className = 'ghost'; b.title = 'Trader Tools: presets, correlation, prop runner, share'; b.textContent = '🧰'; pal.before(b); b.addEventListener('click', () => U.tools()); }
    const sp = $('#nav .navsp');
    if (sp) { const s = document.createElement('div'); s.className = 'seg v151-navpre'; s.id = 'v151Presets'; s.setAttribute('aria-label', 'Workspace presets'); s.innerHTML = V151.PRESET_KEYS.map((k, i) => `<button type="button" data-preset="${k}" title="${esc(V151.PRESETS[k].name)} (Alt+${i + 1})">${V151.PRESETS[k].icon}<span>${esc(V151.PRESETS[k].name)}</span></button>`).join(''); sp.after(s); s.addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (b) U.preset(b.dataset.preset); }); syncPresets(); }
    kz(); setInterval(kz, 1000);
  };
  // Auto-Setup buttons anywhere in the app (capture phase: the row underneath must not also open the chart)
  const onAsClick = (e) => { const b = e.target.closest && e.target.closest('[data-autosetup]'); if (!b) return; e.stopPropagation(); e.preventDefault(); U.autoSetup(b.dataset.autosetup); };
  const onKey = (e) => {
    const t = e.target.closest && e.target.closest('[data-autosetup]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.stopPropagation(); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey || (typeof p2typing === 'function' && p2typing())) return;
    const d = /^Digit([1-4])$/.exec(e.code || ''); if (d) { e.preventDefault(); U.preset(V151.PRESET_KEYS[+d[1] - 1]); return; }
    if (e.code === 'KeyA' && !e.shiftKey) { e.preventDefault(); U.autoSetup(ST.sel); return; } // Shift + Alt + A is v16.3 Two-Key Arming
    if (e.code === 'KeyG') { e.preventDefault(); const c = cfg(); c.ghost = c.ghost ? null : (ST.sel === 'BTC-USD' ? 'SPY' : 'BTC-USD'); saveState(); toast(c.ghost ? `Ghost line: ${baseOf(c.ghost)}` : 'Ghost line off'); if (chart) chart.invalidate(); }
  };

  U.start = () => {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', onAsClick, true); document.addEventListener('keydown', onKey, true);
    if (typeof V14 !== 'undefined' && Array.isArray(V14.SHORTCUTS)) V14.SHORTCUTS.splice(0, V14.SHORTCUTS.length, ...V151.HOTKEYS);
    Feed.tradeL.push(onTrade);
    if (typeof Sol !== 'undefined' && Array.isArray(Sol.listeners)) Sol.listeners.push((ev) => { try { onSol(ev); } catch (e) { /* never break the feed */ } });
    const _ot = NT.onTrade; NT.onTrade = function (t) { const r = _ot ? _ot.apply(this, arguments) : undefined; try { if (t && /bot|grok|bg/i.test(String(t.src || ''))) U.badge(t.sym, 'signal', `⚡ bot ${t.side} ${fp(t.price)}`); } catch (e) { /* badges never break trading */ } return r; };
    if (typeof renderWatch === 'function') { const _rw = renderWatch; renderWatch = function () { const r = _rw.apply(this, arguments); U.decorateWatch(); return r; }; }
    if (typeof ChartTrade !== 'undefined') { const _bx = ChartTrade.box; ChartTrade.box = function (b) { const r = _bx.apply(this, arguments); try { riskPill(b); } catch (e) { /* the bracket box keeps working */ } return r; }; }
    if (typeof palRender === 'function') {
      const _pr = palRender;
      palRender = function () {
        _pr.apply(this, arguments);
        const q = ($('#palIn').value || '').trim().toLowerCase();
        const cmds = [['⚙ Auto-Setup this chart', 'auto setup fib pdh entry stop target copilot risk', () => U.autoSetup(ST.sel)], ['🧰 Trader Tools', 'tools correlation prop runner share recap json ghost', () => U.tools()], ['📸 Share Setup PNG', 'share setup png snapshot screenshot', () => U.shareSetup()], ['📓 Daily Recap PNG', 'daily recap png journal summary card', () => U.recap()], ['⌨ Hotkey cheat sheet', 'hotkeys shortcuts keyboard cheat sheet help ?', () => (typeof V14UI !== 'undefined' && V14UI.help ? V14UI.help() : null)]]
          .concat(V151.PRESET_KEYS.map((k) => [`${V151.PRESETS[k].icon} Workspace: ${V151.PRESETS[k].name}`, 'workspace preset layout ' + V151.PRESETS[k].name.toLowerCase(), () => U.preset(k)]));
        for (const [l, k, f] of cmds) if (!q || l.toLowerCase().includes(q) || k.includes(q)) palItems.push({ l, r: 'v15.1', f });
        $('#palList').innerHTML = palItems.map((x, i) => `<div class="it ${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${esc(x.l)}</span><span class="note">${esc(x.r)}</span></div>`).join('');
      };
    }
    mount();
    // attach the chart overlay + pin tooltips once the Markets chart exists (it is built at boot)
    setInterval(() => { if (typeof chart === 'undefined' || !chart) return; if (!chart.overlays.includes(U.overlay)) { chart.overlays.push(U.overlay); chart.invalidate(); } if (!chart.cv._v151) { chart.cv._v151 = true; chart.cv.addEventListener('mousemove', pinHover); chart.cv.addEventListener('mouseleave', () => { const tip = $('#tip'); if (tip && tip.dataset.v151) { tip.style.display = 'none'; delete tip.dataset.v151; } }); } }, 1000); // re-attaches if the Markets chart is ever rebuilt
    setInterval(() => { if (!document.hidden && typeof Grok !== 'undefined' && cfg().pins) Grok.loadIntel().then(() => { if (chart) chart.invalidate(); }, () => {}); }, 180000);
    setInterval(() => { U.regimeTick(); }, 300000);
    setInterval(() => { if (U.badges.size) U.decorateWatch(); }, 15000);
  };
  U.cfg = cfg;
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined') V151UI.start();
