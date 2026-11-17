/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.1 core (pure, Node-testable): bot fail-safe engines and chart maths.
   · outbound schema validator + Max Single-Order Notional fat-finger firewall
   · spread circuit breaker (Execution Shield) · consecutive-loss cooldown (Tilt & Drawdown Guard)
   · signed receipt ledger rows + CSV / JSON export (no spreadsheet formulas)
   · post-trade discipline tags + net $ attribution · range measure maths · context-menu edge flipping
   Envelope signing, idempotency keys, TTL and the anti-replay cache live in V160 (v160core.js). */
const V161 = (() => {
  const V = {};
  const fin = Number.isFinite;
  V.COOLDOWNS = { '15m': 900000, '1h': 3600000, '24h': 86400000 };
  V.FS_DEFAULTS = () => ({ maxNotional: 10000, maxSpreadPct: 0.5, lossN: 3, cooldown: '1h', lockUntil: 0, streakFrom: 0 });
  /* load + sanitise fail-safe settings: anything invalid falls back to the conservative default */
  V.loadFs = (raw) => {
    const d = V.FS_DEFAULTS(); let o = null; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return d;
    const n = (v, lo, hi, def) => (v !== '' && v !== null && v !== undefined && fin(+v) && +v >= lo && +v <= hi ? +v : def);
    return { maxNotional: n(o.maxNotional, 1, 1e9, d.maxNotional), maxSpreadPct: n(o.maxSpreadPct, 0.001, 50, d.maxSpreadPct), lossN: Math.round(n(o.lossN, 1, 50, d.lossN)),
      cooldown: Object.prototype.hasOwnProperty.call(V.COOLDOWNS, o.cooldown) ? o.cooldown : d.cooldown, lockUntil: n(o.lockUntil, 0, 9e15, 0), streakFrom: n(o.streakFrom, 0, 9e15, 0) };
  };

  /* ── 3. schema validator + fat-finger firewall. Opening orders (buy) need a stop-loss and must fit under the notional cap;
        closes (sell) only need a well-formed packet, because blocking an exit would add risk instead of removing it. ── */
  V.SYM_RX = /^[A-Z0-9][A-Z0-9._:\/-]{0,23}$/;
  V.ACTIONS = ['buy', 'sell', 'CANCEL_ALL_AND_FLATTEN'];
  V.validate = (b, fs) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, why: 'payload is not an object' };
    if (!V.ACTIONS.includes(b.action)) return { ok: false, why: 'unknown action' };
    if (b.action === 'CANCEL_ALL_AND_FLATTEN') return { ok: true };
    for (const k of ['usd', 'price', 'qty', 'sl', 'tp']) { const v = b[k]; if (v == null) continue; if (typeof v !== 'number' || !fin(v)) return { ok: false, why: `${k} is not a finite number` }; if (v < 0) return { ok: false, why: `${k} is negative` }; }
    if (typeof b.symbol !== 'string' || !V.SYM_RX.test(b.symbol)) return { ok: false, why: 'invalid symbol' };
    if (!(b.usd > 0)) return { ok: false, why: 'order size must be above $0' };
    if (b.price != null && !(b.price > 0)) return { ok: false, why: 'price must be above 0' };
    if (b.action === 'buy') {
      if (!(b.sl > 0)) return { ok: false, why: 'missing stop-loss' };
      if (b.price > 0 && b.sl >= b.price) return { ok: false, why: 'stop-loss is not below the entry price' };
      const cap = fs && +fs.maxNotional; if (!(cap > 0)) return { ok: false, why: 'Max Single-Order Notional cap not set' };
      if (b.usd > cap) return { ok: false, why: `notional $${b.usd.toFixed(2)} is above the $${cap.toFixed(2)} Max Single-Order Notional cap` };
    }
    return { ok: true };
  };

  /* ── 4. spread circuit breaker: hold when (ask − bid) / mid × 100 is above the ceiling; unknown spread = pass + noted ── */
  V.spreadPct = (bid, ask) => (fin(bid) && fin(ask) && bid > 0 && ask >= bid ? ((ask - bid) / ((ask + bid) / 2)) * 100 : null);
  V.spreadGuard = (bid, ask, maxPct) => { const pct = V.spreadPct(bid, ask); if (pct == null) return { ok: true, known: false, pct: null }; return { ok: pct <= +maxPct, known: true, pct }; };

  /* ── 5. consecutive-loss cooldown: count the trailing run of losing closes since `streakFrom`; N in a row locks
        live routing for the configured window, measured from the last loss. When the window has passed the streak resets. ── */
  V.lossStreak = (closes, since) => { let n = 0, last = 0; const xs = (closes || []).filter((c) => c && fin(c.pnl) && fin(c.ts) && c.ts > (since || 0)).sort((a, b) => a.ts - b.ts); for (let i = xs.length - 1; i >= 0; i--) { if (xs[i].pnl < 0) { n++; if (!last) last = xs[i].ts; } else break; } return { n, last }; };
  V.cooldown = (fs, closes, now) => {
    const f = Object.assign({}, fs), dur = V.COOLDOWNS[f.cooldown] || V.COOLDOWNS['1h'];
    if (f.lockUntil && now < f.lockUntil) return { locked: true, until: f.lockUntil, streak: V.lossStreak(closes, f.streakFrom).n, fs: f, tripped: false };
    if (f.lockUntil && now >= f.lockUntil) { f.streakFrom = f.lockUntil; f.lockUntil = 0; }
    const s = V.lossStreak(closes, f.streakFrom);
    if (s.n >= f.lossN) { const until = s.last + dur; if (now < until) { f.lockUntil = until; return { locked: true, until, streak: s.n, fs: f, tripped: true }; } f.streakFrom = s.last; return { locked: false, until: 0, streak: 0, fs: f, tripped: false }; }
    return { locked: false, until: 0, streak: s.n, fs: f, tripped: false };
  };

  /* ── 7. signed receipt ledger ── */
  V.LEDGER_MAX = 1000;
  V.ledgerRow = (kind, o) => ({ ts: fin(o && o.ts) ? o.ts : Date.now(), kind: String(kind), slot: o && o.slot != null ? +o.slot : null, status: String((o && o.status) || ''), idempotency_key: String((o && o.key) || ''), sig: String((o && o.sig) || ''), detail: String((o && o.detail) || '').slice(0, 240) });
  V.LEDGER_COLS = ['ts', 'iso', 'kind', 'slot', 'status', 'idempotency_key', 'sig', 'detail'];
  const cell = (c) => { let v = String(c == null ? '' : c); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  V.toCSV = (rows) => [V.LEDGER_COLS.join(',')].concat((rows || []).map((r) => V.LEDGER_COLS.map((k) => cell(k === 'iso' ? new Date(r.ts).toISOString() : r[k])).join(','))).join('\r\n') + '\r\n';
  V.toJSON = (rows) => JSON.stringify({ app: 'ExTerm', ledger: 'signed-signal-receipts', v: 1, rows: rows || [] }, null, 2);
  V.sigHex = (wire) => { try { const s = JSON.parse(wire).sig; return /^sha256=[0-9a-f]{64}$/.test(s) ? s.slice(7) : ''; } catch (e) { return ''; } };

  /* ── 8. discipline tags for a closed (sell) trade against the plan recorded at entry ── */
  V.TAGS = ['Followed Plan', 'Moved Stop Wider', 'Over-Size Risk', 'Early Exit'];
  V.tagTrade = (plan, close, opt) => {
    const o = Object.assign({ maxRiskPct: 2 }, opt || {}), tags = [];
    if (!plan || !close) return ['Followed Plan'];
    if (plan.wider) tags.push('Moved Stop Wider');
    const riskUsd = plan.sl0 > 0 && plan.entry > 0 ? (plan.usd * Math.max(0, plan.entry - plan.sl0)) / plan.entry : Infinity;
    const riskPct = plan.eq > 0 ? (riskUsd / plan.eq) * 100 : Infinity;
    if (!(riskPct <= o.maxRiskPct)) tags.push('Over-Size Risk');
    const manual = !/stop|take-profit|trailing|partial/i.test(String(close.reason || ''));
    if (manual && plan.tp0 > plan.entry && close.price > plan.entry && close.price < plan.entry + 0.5 * (plan.tp0 - plan.entry)) tags.push('Early Exit');
    return tags.length ? tags : ['Followed Plan'];
  };
  V.attribution = (rows) => {
    const by = {}; for (const t of V.TAGS) by[t] = { n: 0, usd: 0 };
    let plan = 0, viol = 0, nP = 0, nV = 0;
    for (const r of rows || []) { if (!r || !fin(r.pnl)) continue; const tg = Array.isArray(r.tags) && r.tags.length ? r.tags : ['Followed Plan']; for (const t of tg) if (by[t]) { by[t].n++; by[t].usd += r.pnl; } if (tg.includes('Followed Plan')) { plan += r.pnl; nP++; } else { viol += r.pnl; nV++; } }
    const r2 = (x) => Math.round(x * 100) / 100; for (const t of V.TAGS) by[t].usd = r2(by[t].usd);
    return { disciplined: r2(plan), violations: r2(viol), nDisciplined: nP, nViolations: nV, byTag: by };
  };

  /* ── measure dragger: Δ$, %, bar count, elapsed time, cumulative volume between two (index, price) points ── */
  V.measure = (D, i0, i1, p0, p1, tfSec) => {
    if (!Array.isArray(D) || !D.length || !fin(p0) || !fin(p1) || !(p0 > 0)) return null;
    const a = Math.max(0, Math.min(i0, i1)), b = Math.min(D.length - 1, Math.max(i0, i1)); let vol = 0; for (let i = a; i <= b; i++) vol += +D[i].v || 0;
    const bars = Math.abs(i1 - i0), step = fin(tfSec) && tfSec > 0 ? tfSec : (D.length > 1 ? D[1].t - D[0].t : 60);
    return { dp: p1 - p0, pct: ((p1 - p0) / p0) * 100, bars, secs: bars * step, vol, up: p1 >= p0 };
  };
  V.fmtDur = (s) => { s = Math.max(0, Math.round(s)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : ''); if (s < 86400) return Math.floor(s / 3600) + 'h' + (Math.floor((s % 3600) / 60) ? ' ' + Math.floor((s % 3600) / 60) + 'm' : ''); return Math.floor(s / 86400) + 'd' + (Math.floor((s % 86400) / 3600) ? ' ' + Math.floor((s % 86400) / 3600) + 'h' : ''); };
  /* context menu placement: open at the cursor, flip left / up when it would leave the viewport */
  V.menuPos = (x, y, w, h, vw, vh, pad = 6) => ({ x: Math.max(pad, x + w + pad > vw ? x - w : x), y: Math.max(pad, y + h + pad > vh ? y - h : y), flipX: x + w + pad > vw, flipY: y + h + pad > vh });
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V161;
