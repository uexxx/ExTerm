/* ExTerm v15.1 core: pure logic for the Candle X brand mark (one geometry → inline SVG, data-URI favicon and canvas),
   % risk position sizing, killzone / session countdown, benchmark ghost line, cross-asset correlation, chart event pins,
   whale / smart-money markers, setup JSON share + import (validated), prop-challenge evaluation of a backtest equity curve,
   regime-locked strategy switching, workspace presets and the hotkey list. No DOM here: unit-tested in Node. */
const V151 = (() => {
  const V = {};
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);

  /* ══ 1. Candle X mark (viewBox 0 0 64 64) ══
     Brushed-gold ring, 8 candlesticks in an X around a rounded gold diamond. Quadrants: top-left white, bottom-left gold,
     top-right champagne, bottom-right silver-white. Each candle: centre (x, y), body height h, wick w above + below. */
  V.COL = { ring0: '#B8943A', ring1: '#D4AF37', diamond: '#E5C158', tl: '#F8FAFC', bl: '#C99A32', tr: '#F3D06B', br: '#CBD5E1' };
  V.CANDLES = (() => {
    const out = [], q = [['tl', -1, -1], ['tr', 1, -1], ['bl', -1, 1], ['br', 1, 1]];
    for (const [k, dx, dy] of q) for (const [d, h, w] of [[9.5, 9, 3.2], [18, 7, 2.8]]) out.push({ k, x: +(32 + dx * d * 0.7071).toFixed(2), y: +(32 + dy * d * 0.7071).toFixed(2), h, w, col: V.COL[k] });
    return out;
  })();
  const sid = (id) => String(id || 'cx').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'cx';
  V.markSvg = (size = 32, id = 'cx') => {
    const p = sid(id), s = Math.max(8, Math.min(1024, +size || 32));
    const cs = V.CANDLES.map((c) => `<line x1="${c.x}" y1="${(c.y - c.h / 2 - c.w).toFixed(2)}" x2="${c.x}" y2="${(c.y + c.h / 2 + c.w).toFixed(2)}" stroke="${c.col}" stroke-width="1.1" stroke-linecap="round"/><rect x="${(c.x - 1.9).toFixed(2)}" y="${(c.y - c.h / 2).toFixed(2)}" width="3.8" height="${c.h}" rx="0.9" fill="${c.col}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="${p}R" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${V.COL.ring1}"/><stop offset=".45" stop-color="#F5E6A8"/><stop offset=".7" stop-color="${V.COL.ring0}"/><stop offset="1" stop-color="${V.COL.ring1}"/></linearGradient></defs><circle cx="32" cy="32" r="29.5" fill="#0B0B0D"/><circle cx="32" cy="32" r="29.5" fill="none" stroke="url(#${p}R)" stroke-width="2.6"/><circle cx="32" cy="32" r="26.6" fill="none" stroke="${V.COL.ring0}" stroke-opacity=".35" stroke-width=".6"/>${cs}<rect x="29.2" y="29.2" width="5.6" height="5.6" rx="1.3" transform="rotate(45 32 32)" fill="${V.COL.diamond}"/></svg>`;
  };
  V.markDataUri = (size = 64) => 'data:image/svg+xml,' + encodeURIComponent(V.markSvg(size, 'fv'));
  /* the same mark on a 2D canvas (PNG cards): x, y = top-left, s = size in px */
  V.drawMark = (g, x, y, s) => {
    const k = s / 64; g.save(); g.translate(x, y); g.scale(k, k);
    g.fillStyle = '#0B0B0D'; g.beginPath(); g.arc(32, 32, 29.5, 0, Math.PI * 2); g.fill();
    const gr = g.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, V.COL.ring1); gr.addColorStop(0.45, '#F5E6A8'); gr.addColorStop(0.7, V.COL.ring0); gr.addColorStop(1, V.COL.ring1);
    g.strokeStyle = gr; g.lineWidth = 2.6; g.beginPath(); g.arc(32, 32, 29.5, 0, Math.PI * 2); g.stroke();
    for (const c of V.CANDLES) { g.strokeStyle = c.col; g.fillStyle = c.col; g.lineWidth = 1.1; g.beginPath(); g.moveTo(c.x, c.y - c.h / 2 - c.w); g.lineTo(c.x, c.y + c.h / 2 + c.w); g.stroke(); g.fillRect(c.x - 1.9, c.y - c.h / 2, 3.8, c.h); }
    g.translate(32, 32); g.rotate(Math.PI / 4); g.fillStyle = V.COL.diamond; g.fillRect(-2.8, -2.8, 5.6, 5.6);
    g.restore();
  };
  /* EXTERM wordmark + caption on canvas: EX gold gradient, TERM silver gradient, gold "CRYPTO · STOCKS · DEX" */
  V.drawWordmark = (g, x, y, px) => {
    g.save(); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.font = `900 ${px}px Inter, system-ui, sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = Math.round(px * 0.08) + 'px';
    const wEx = g.measureText('EX').width, wT = g.measureText('TERM').width;
    const gg = g.createLinearGradient(x, y - px, x, y); gg.addColorStop(0, '#F5E6A8'); gg.addColorStop(0.5, V.COL.ring1); gg.addColorStop(1, V.COL.ring0);
    g.fillStyle = gg; g.fillText('EX', x, y);
    const sg = g.createLinearGradient(x, y - px, x, y); sg.addColorStop(0, '#FFFFFF'); sg.addColorStop(0.6, V.COL.br); sg.addColorStop(1, '#94A3B8');
    g.fillStyle = sg; g.fillText('TERM', x + wEx, y);
    g.font = `700 ${Math.round(px * 0.3)}px Inter, system-ui, sans-serif`; if ('letterSpacing' in g) g.letterSpacing = Math.round(px * 0.09) + 'px';
    g.fillStyle = V.COL.ring1; g.fillText('CRYPTO · STOCKS · DEX', x + 2, y + Math.round(px * 0.48));
    g.restore(); return wEx + wT;
  };

  /* ══ 2. % risk position size: risk riskPct of equity between entry and stop ══ */
  V.posSize = (o) => {
    const eq = +o.equity, r = +o.riskPct, e = +o.entry, sl = +o.sl;
    if (!(eq > 0) || !(r > 0) || !(e > 0) || !(sl > 0) || e === sl) return null;
    const riskUsd = eq * Math.min(r, 100) / 100, perUnit = Math.abs(e - sl), qty = riskUsd / perUnit;
    const cap = o.maxUsd > 0 ? Math.min(o.maxUsd, eq) : eq, usd = Math.min(qty * e, cap);
    return { usd: Math.round(usd * 100) / 100, qty: usd / e, riskUsd: Math.round((usd / e) * perUnit * 100) / 100, stopPct: (perUnit / e) * 100, capped: qty * e > cap };
  };

  /* ══ 3. killzones / sessions (New York time) ══ */
  V.SESSIONS = [
    { id: 'asia', name: 'Asia', s: 20 * 60, e: 24 * 60, days: [0, 1, 2, 3, 4] }, // Sun–Thu evenings ET
    { id: 'london', name: 'London', s: 2 * 60, e: 5 * 60, days: [1, 2, 3, 4, 5] },
    { id: 'ny', name: 'NY Open', s: 9 * 60 + 30, e: 11 * 60, days: [1, 2, 3, 4, 5] },
    { id: 'power', name: 'Power Hour', s: 15 * 60, e: 16 * 60, days: [1, 2, 3, 4, 5] },
  ];
  /* nowSec: unix seconds; nyOff: New York UTC offset in seconds (-14400 EDT / -18000 EST).
     The look-ahead reuses today's offset: a countdown that crosses a DST switch is off by one hour until the day of the switch. */
  V.session = (nowSec, nyOff) => {
    const lt = nowSec + (fin(nyOff) ? nyOff : -18000), day0 = Math.floor(lt / 86400), m = Math.floor((lt - day0 * 86400) / 60), sec = lt - day0 * 86400;
    const dow = (d) => ((d + 4) % 7 + 7) % 7; // 1970-01-01 was a Thursday
    for (const S of V.SESSIONS) if (S.days.includes(dow(day0)) && m >= S.s && m < S.e) return { active: S.name, id: S.id, left: S.e * 60 - sec, next: null, inSec: 0 };
    for (let k = 0; k < 8; k++) {
      let best = null;
      for (const S of V.SESSIONS) { if (!S.days.includes(dow(day0 + k))) continue; const st = k * 86400 + S.s * 60 - sec; if (st > 0 && (!best || st < best.inSec)) best = { next: S.name, id: S.id, inSec: st }; }
      if (best) return { active: null, left: 0, next: best.next, id: best.id, inSec: best.inSec };
    }
    return { active: null, left: 0, next: null, id: null, inSec: 0 };
  };
  V.fmtDur = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`; };

  /* ══ 4. benchmark ghost line: bench closes rescaled so they start at the main chart's first visible close ══ */
  V.ghost = (main, bench, start, end) => {
    const out = []; if (!Array.isArray(main) || !Array.isArray(bench) || !bench.length) return out;
    const b = bench; let j = 0, base = null, anchor = null; // candle stores are already time-sorted
    for (let i = Math.max(0, start); i < Math.min(main.length, end); i++) {
      const t = main[i].t; while (j + 1 < b.length && b[j + 1].t <= t) j++;
      if (b[j].t > t || !(b[j].c > 0)) { out.push(null); continue; }
      if (base == null) { base = b[j].c; anchor = main[i].c; }
      out.push(anchor * (b[j].c / base));
    }
    return out;
  };

  /* ══ 5. cross-asset correlation of daily log returns, aligned by date ══ */
  V.pearson = (x, y) => { const n = Math.min(x.length, y.length); if (n < 10) return null; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += x[i]; mb += y[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (x[i] - ma) * (y[i] - mb); saa += (x[i] - ma) ** 2; sbb += (y[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : null; };
  V.corrMatrix = (series) => {
    const keys = Object.keys(series || {}), day = (t) => Math.floor(t / 86400), maps = {};
    for (const k of keys) { const m = new Map(); for (const c of series[k] || []) if (c && c.c > 0 && fin(c.t)) m.set(day(c.t), c.c); maps[k] = m; }
    const M = keys.map((a) => keys.map((b) => {
      if (a === b) return 1;
      const days = [...maps[a].keys()].filter((d) => maps[b].has(d)).sort((p, q) => p - q), ra = [], rb = [];
      for (let i = 1; i < days.length; i++) { ra.push(Math.log(maps[a].get(days[i]) / maps[a].get(days[i - 1]))); rb.push(Math.log(maps[b].get(days[i]) / maps[b].get(days[i - 1]))); }
      return V.pearson(ra, rb);
    }));
    return { keys, M };
  };

  /* ══ 6. event pins: CRITICAL World Monitor headlines (MACRO) + bot exits with their autopsy reason (BOT) ══ */
  V.pins = (o) => {
    const out = [], t0 = +o.t0 || 0, t1 = +o.t1 || Infinity;
    for (const i of o.intel || []) if (i && i.sev === 'CRITICAL' && i.ts >= t0 && i.ts <= t1) out.push({ kind: 'MACRO', t: i.ts, label: String(i.title || '').slice(0, 160), sub: String(i.source || '').slice(0, 60) });
    for (const c of o.closed || []) {
      if (!c || c.sym !== o.sym || !/bot|grok|bg/i.test(String(c.src || ''))) continue;
      const tx = (+c.ts || 0) / 1000; if (!(tx >= t0 && tx <= t1)) continue;
      const why = (o.why ? o.why(c) : []).join(' · ');
      out.push({ kind: 'BOT', t: tx, price: c.exit && c.exit.price > 0 ? +c.exit.price : null, win: !!c.win, label: `${c.win ? 'Win' : 'Loss'} ${fin(c.pct) ? (c.pct >= 0 ? '+' : '') + c.pct.toFixed(2) + '%' : ''}`.trim(), sub: why.slice(0, 160) });
      const ot = (+c.openTs || 0) / 1000; if (ot >= t0 && ot <= t1) out.push({ kind: 'BOT', t: ot, price: c.entry && c.entry.price > 0 ? +c.entry.price : null, entry: true, label: 'Bot entry', sub: String((c.entry && c.entry.reason) || c.src || '').slice(0, 120) });
    }
    return out.sort((a, b) => a.t - b.t).slice(-300);
  };
  /* nearest pin to pixel x (within tol px) */
  V.pinAt = (pins, xOf, x, tol = 6) => { let best = null, bd = tol; for (const p of pins || []) { const d = Math.abs(xOf(p.t) - x); if (d <= bd) { bd = d; best = p; } } return best; };

  /* ══ 7. whale / smart-money markers ══ */
  V.whaleMark = (sym, price, size, side, ts, x, thrUsd) => {
    const usd = x && x.usd > 0 ? +x.usd : (+price || 0) * (+size || 0);
    if (!(usd >= thrUsd) || !(price > 0) || !(ts > 0)) return null;
    return { sym, t: +ts, p: +price, usd, side: side === 'sell' ? 'sell' : 'buy', who: x && x.who ? String(x.who).slice(0, 40) : '', kind: x && x.smart ? 'smart' : 'whale' }; // smart = a tracked wallet, never just any address
  };
  V.pushCapped = (arr, m, cap = 300) => { arr.push(m); if (arr.length > cap) arr.splice(0, arr.length - cap); return arr; };

  /* ══ 8. setup JSON share / import (everything re-validated: imported text is untrusted) ══ */
  const SYM_RX = /^[A-Za-z0-9:._^=\-]{1,100}$/;
  V.setupOut = (o) => JSON.stringify({ v: 1, app: 'ExTerm', sym: o.sym, tf: o.tf, side: 'buy', entry: o.entry, sl: o.sl || null, tp: o.tp || null, riskPct: o.riskPct || null, note: String(o.note || '').slice(0, 200) });
  V.setupIn = (txt, tfOk) => {
    let j; try { j = JSON.parse(String(txt || '').slice(0, 4000)); } catch (e) { return { ok: false, error: 'Not valid JSON' }; }
    if (!j || typeof j !== 'object' || j.app !== 'ExTerm' || j.v !== 1) return { ok: false, error: 'Not an ExTerm setup' };
    if (typeof j.sym !== 'string' || !SYM_RX.test(j.sym)) return { ok: false, error: 'Bad symbol' };
    const num = (v) => (fin(+v) && +v > 0 && +v < 1e12 ? +v : null), entry = num(j.entry), sl = num(j.sl), tp = num(j.tp);
    if (!entry) return { ok: false, error: 'Missing entry price' };
    if (sl && sl >= entry) return { ok: false, error: 'Stop must be below entry (long setups)' };
    if (tp && tp <= entry) return { ok: false, error: 'Target must be above entry (long setups)' };
    const tf = typeof j.tf === 'string' && (!tfOk || tfOk(j.tf)) ? j.tf : null;
    const rp = num(j.riskPct);
    return { ok: true, setup: { sym: j.sym, tf, entry, sl, tp, riskPct: rp && rp <= 10 ? rp : null, note: String(j.note || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) } };
  };

  /* ══ 9. strategy → prop challenge: grade a backtest equity curve against the challenge rules ══
     rules: {target %, dailyDD %, maxDD % (trailing from peak), bpd bars per day} */
  V.propEval = (eq, rules, cash0) => {
    const R = Object.assign({ target: null, dailyDD: null, maxDD: null, bpd: 24 }, rules || {}), c0 = +cash0 || (eq && eq[0]) || 0;
    if (!Array.isArray(eq) || eq.length < 2 || !(c0 > 0)) return { ok: false, error: 'Not enough bars' };
    let peak = c0, maxDD = 0, worstDay = 0, dayStart = c0, fail = null, passAt = null;
    for (let i = 0; i < eq.length; i++) {
      const v = eq[i] * (c0 / eq[0]); if (i % Math.max(1, R.bpd) === 0) dayStart = i ? eq[i - 1] * (c0 / eq[0]) : c0;
      peak = Math.max(peak, v); const dd = (1 - v / peak) * 100, dl = (1 - v / dayStart) * 100; maxDD = Math.max(maxDD, dd); worstDay = Math.max(worstDay, dl);
      if (!fail && R.dailyDD != null && dl > R.dailyDD) fail = { i, why: `daily loss ${dl.toFixed(2)}% > ${R.dailyDD}%` };
      if (!fail && R.maxDD != null && dd > R.maxDD) fail = { i, why: `drawdown ${dd.toFixed(2)}% > ${R.maxDD}%` };
      if (!fail && passAt == null && R.target != null && (v / c0 - 1) * 100 >= R.target) passAt = i;
      if (fail || passAt != null) break;
    }
    const end = fail ? fail.i : passAt != null ? passAt : eq.length - 1, ret = (eq[end] * (c0 / eq[0]) / c0 - 1) * 100; // the evaluation stops at the pass / fail bar
    const passed = !fail && (R.target != null ? passAt != null : true);
    return { ok: true, passed, fail: fail ? fail.why : null, failBar: fail ? fail.i : null, passBar: passAt, ret, maxDD, worstDay };
  };

  /* ══ 10. regime lock: switch only when the running strategy is not one of the current regime's picks ══ */
  V.regimeSwitch = (reg, cur) => {
    if (!reg || !Array.isArray(reg.picks) || !reg.picks.length || reg.regime === 'unknown') return { switch: false, why: 'no regime read' };
    if (cur && reg.picks.includes(cur)) return { switch: false, why: `${cur} already fits ${reg.regime}` };
    return { switch: true, to: reg.picks[0], why: `${reg.regime}: ${reg.picks[0]}` };
  };

  /* ══ 11. workspace presets (one click: tab, mode, timeframe, overlays, workspace grid) ══ */
  V.PRESETS = {
    scalper: { name: 'Scalper', icon: '⚡', mode: 'crypto', tab: 'markets', tf: '5s', ov: { pd: true, fib: false, vp: true }, whales: true, ghost: 'BTC-USD', grid: 4, cells: [['BTC-USD', '1m'], ['ETH-USD', '1m'], ['SOL-USD', '1m'], ['BTC-USD', '5m']] },
    trench: { name: 'Solana Trench', icon: '🪖', mode: 'onchain', tab: 'heat', tf: '15s', ov: { pd: false, fib: false, vp: false }, whales: true, ghost: 'SOL-USD', grid: 2, cells: [['SOL-USD', '1m'], ['SOL-USD', '15m']] },
    quant: { name: 'Quant Lab', icon: '🧪', mode: 'crypto', tab: 'desk', sec: 'quant', tf: '1h', ov: { pd: true, fib: true, vp: true }, whales: false, ghost: null, grid: 4, cells: [['BTC-USD', '1h'], ['ETH-USD', '1h'], ['SOL-USD', '4h'], ['BTC-USD', '1d']] },
    macro: { name: 'Macro War Room', icon: '🌐', mode: 'stocks', tab: 'world', tf: '1h', ov: { pd: true, fib: false, vp: false }, whales: false, ghost: 'SPY', grid: 4, cells: [['SPY', '1h'], ['QQQ', '1h'], ['GLD', '1d'], ['TLT', '1d']] },
  };
  V.PRESET_KEYS = ['scalper', 'trench', 'quant', 'macro'];

  /* ══ 12. hotkeys (shown by "?") ══ */
  V.HOTKEYS = [['?', 'This cheat sheet'], ['Ctrl+K', 'Command palette'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo (drawings and Entry/SL/TP drags)'], ['1 – 9', 'Switch timeframe (1 = 1s, 2 = 5s, 3 = 15s …)'],
    ['Alt+1 … Alt+4', 'Workspace preset: Scalper · Solana Trench · Quant Lab · Macro War Room'], ['Alt+A', 'Auto-Setup the open chart'], ['Alt+G', 'Benchmark ghost line on / off'], ['Alt+M', 'Next market (crypto → stocks → on-chain)'],
    ['B / S', 'Buy / sell ticket'], ['R', 'Bar replay'], ['J', 'Journal trades on the chart'], ['F', 'Fit the chart'], ['/', 'Search a symbol'], ['Esc', 'Close / cancel']];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V151;
