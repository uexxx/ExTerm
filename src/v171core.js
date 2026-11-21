/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v17.1 core (pure: no DOM, no network; runs on the page and in Node tests):
   · Ring          fixed-capacity ring buffer (LRU pruning for 24/7 sessions: memory never grows)
   · Ledger        one reactive ledger for positions, resting orders, NET BE, partial TPs and trailing high-water marks,
                   evaluated on every tick whatever tab is open; JSON round-trip for IndexedDB
   · amm / l2Walk  real price impact before a fill: Uniswap-v2 x*y=k pools (DEX) or walking L2 depth (CEX / stocks / futures)
   · StaleGuard    all providers failing for > 5 s → STALE (bots + live execution hard-locked until fresh ticks resume)
   · rpcOrder      provider failover order with publicnode last, per-host cooldown skip
   · toMs / fromMs drawings anchored to (epoch ms, price) so they survive timeframe and venue switches
   · Copilot       LLM route (Ollama / Grok / Claude / DeepSeek / OpenAI), action-pill parsing, deterministic local analyst
   · optStats      Put/Call OI, max pain, IV rank and 25Δ-style skew from any option chain
   · tiny          sub-penny subscript notation ($0.0₅2115) */
const V171 = (() => {
  const V = {};
  const fin = Number.isFinite;

  /* ══ 1. ring buffer ══ */
  V.Ring = class {
    constructor(cap) { this.cap = Math.max(1, cap | 0); this.a = new Array(this.cap); this.i = 0; this.n = 0; }
    push(x) { this.a[this.i] = x; this.i = (this.i + 1) % this.cap; if (this.n < this.cap) this.n++; return x; }
    toArray() { const o = []; for (let k = 0; k < this.n; k++) o.push(this.a[(this.i - this.n + k + this.cap) % this.cap]); return o; }
    last() { return this.n ? this.a[(this.i - 1 + this.cap) % this.cap] : undefined; }
    get size() { return this.n; }
    clear() { this.a = new Array(this.cap); this.i = 0; this.n = 0; }
  };

  /* ══ 2. price impact ══ */
  /* constant-product pool: side 'buy' spends `amount` quote for base, 'sell' spends `amount` base for quote */
  V.amm = (rBase, rQuote, side, amount, feeBps) => {
    if (!(rBase > 0) || !(rQuote > 0) || !(amount > 0)) return null;
    const f = 1 - (feeBps == null ? 30 : feeBps) / 1e4, k = rBase * rQuote, spot = rQuote / rBase;
    if (side === 'buy') { const out = rBase - k / (rQuote + amount * f), avg = amount / out; return { out, avg, spot, impactPct: (avg / spot - 1) * 100 }; }
    const out = rQuote - k / (rBase + amount * f), avg = out / amount; return { out, avg, spot, impactPct: (1 - avg / spot) * 100 };
  };
  /* walk book levels [[px, qty], …] best first; usd = notional to fill */
  V.l2Walk = (levels, usd) => {
    if (!levels || !levels.length || !(usd > 0)) return null;
    let left = usd, qty = 0, cost = 0; const best = levels[0][0];
    for (const [p, q] of levels) { if (!(p > 0) || !(q > 0)) continue; const take = Math.min(left, p * q); qty += take / p; cost += take; left -= take; if (left <= 1e-9) break; }
    if (!(qty > 0)) return null; const avg = cost / qty;
    return { avg, best, filledUsd: cost, partial: left > 1e-6, impactPct: Math.abs(avg / best - 1) * 100 };
  };
  /* geometric synthetic book when no live L2: depth (USD per side within ±2%) from volume, spread in bps */
  V.synthBook = (mid, side, spreadBps, depthUsd, n) => {
    const N = n || 40, out = [], s = (spreadBps || 5) / 2e4, per = (depthUsd || 1e6) / N;
    for (let i = 0; i < N; i++) { const p = side === 'buy' ? mid * (1 + s + (0.02 * i) / N) : mid * (1 - s - (0.02 * i) / N); out.push([p, (per * (1 + i * 0.05)) / p]); }
    return out;
  };
  /* one entry point for every Paper / Bot fill */
  V.estimateFill = ({ px, usd, side, liqUsd, book, spreadBps, depthUsd, feeBps }) => {
    if (!(px > 0) || !(usd > 0)) return null; side = side === 'sell' ? 'sell' : 'buy';
    if (liqUsd > 0) { const rq = liqUsd / 2, rb = rq / px, r = side === 'buy' ? V.amm(rb, rq, 'buy', usd, feeBps) : V.amm(rb, rq, 'sell', usd / px, feeBps); return r && { avg: r.avg, impactPct: r.impactPct, model: 'AMM x·y=k', fillable: true }; }
    const lv = book && book.length ? book : V.synthBook(px, side, spreadBps, depthUsd), r = V.l2Walk(lv, usd);
    return r && { avg: r.avg, impactPct: r.impactPct + (book && book.length ? 0 : 0), model: book && book.length ? 'L2 depth' : 'L2 est.', fillable: !r.partial };
  };

  /* ══ 3. reactive ledger ══ */
  let seq = 0; const uid = (p) => p + Date.now().toString(36) + (++seq).toString(36);
  V.Ledger = class {
    constructor(opt) { const o = opt || {}; this.fee = o.fee == null ? 0.001 : o.fee; this.pos = {}; this.orders = {}; this.events = new V.Ring(o.cap || 512); this.closed = new V.Ring(o.closedCap || 500); this.ver = 0; }
    open(p) { const id = p.id || uid('p'), x = { id, sym: p.sym, dir: p.dir < 0 ? -1 : 1, qty: +p.qty, avg: +p.avg, fees: +(p.fees || +p.qty * +p.avg * this.fee), sl: p.sl || null, tps: (p.tps || []).map((t) => ({ px: +t.px, frac: +t.frac, hit: !!t.hit })), trail: p.trail ? { pct: +p.trail.pct, hwm: +(p.trail.hwm || p.avg) } : null, t0: p.t0 || Date.now(), src: p.src || 'paper' }; this.pos[id] = x; this.ver++; this.emit({ k: 'open', id, sym: x.sym }); return x; }
    order(o) { const id = o.id || uid('o'), x = { id, sym: o.sym, side: o.side === 'sell' ? 'sell' : 'buy', type: o.type === 'stop' ? 'stop' : 'limit', px: +o.px, qty: +o.qty, t0: o.t0 || Date.now() }; this.orders[id] = x; this.ver++; return x; }
    cancel(id) { const had = !!this.orders[id]; delete this.orders[id]; if (had) this.ver++; return had; }
    emit(e) { e.t = e.t || Date.now(); this.events.push(e); }
    netBE(id) { const p = this.pos[id]; if (!p || !(p.qty > 0)) return null; const f = this.fee, paid = p.fees / p.qty; return p.dir > 0 ? (p.avg + paid) / (1 - f) : (p.avg - paid) / (1 + f); }
    upnl(id, px) { const p = this.pos[id]; return p ? (px - p.avg) * p.qty * p.dir - p.fees - px * p.qty * this.fee : 0; }
    reduce(id, qty, px, now, why) {
      const p = this.pos[id]; if (!p) return null; const q = Math.min(p.qty, qty), fee = q * px * this.fee, share = p.fees * (q / p.qty), pnl = (px - p.avg) * q * p.dir - fee - share;
      p.qty -= q; p.fees -= share; const r = { id, sym: p.sym, qty: q, px, pnl, why, t: now || Date.now() }; this.closed.push(r); this.emit({ k: 'fill', id, sym: p.sym, why, pnl });
      if (p.qty <= 1e-12) delete this.pos[id]; this.ver++; return r;
    }
    /* evaluate stops, partial TPs, trailing high-water marks and resting orders against one tick */
    onTick(sym, px, now) {
      if (!(px > 0)) return []; const out = [];
      for (const id of Object.keys(this.pos)) {
        const p = this.pos[id]; if (p.sym !== sym) continue;
        if (p.trail && p.trail.pct > 0) { const better = p.dir > 0 ? px > p.trail.hwm : px < p.trail.hwm; if (better) { p.trail.hwm = px; const ns = p.dir > 0 ? px * (1 - p.trail.pct / 100) : px * (1 + p.trail.pct / 100); if (p.sl == null || (p.dir > 0 ? ns > p.sl : ns < p.sl)) { p.sl = ns; this.ver++; out.push({ k: 'trail', id, sl: ns }); } } }
        for (const t of p.tps) if (!t.hit && (p.dir > 0 ? px >= t.px : px <= t.px)) { t.hit = true; const r = this.reduce(id, p.qty * Math.min(1, t.frac), px, now, 'TP'); if (r) out.push(Object.assign({ k: 'tp' }, r)); if (!this.pos[id]) break; }
        if (this.pos[id] && p.sl != null && (p.dir > 0 ? px <= p.sl : px >= p.sl)) { const r = this.reduce(id, p.qty, px, now, 'SL'); if (r) out.push(Object.assign({ k: 'sl' }, r)); }
      }
      for (const id of Object.keys(this.orders)) {
        const o = this.orders[id]; if (o.sym !== sym) continue;
        const hit = o.type === 'limit' ? (o.side === 'buy' ? px <= o.px : px >= o.px) : (o.side === 'buy' ? px >= o.px : px <= o.px);
        if (hit) { delete this.orders[id]; const p = this.open({ sym, dir: o.side === 'buy' ? 1 : -1, qty: o.qty, avg: px, t0: now }); out.push({ k: 'order', id, pos: p.id }); }
      }
      return out;
    }
    /* Shift+Esc: close every position at its mark, cancel every resting order */
    flattenAll(pxOf, now) {
      const done = []; for (const id of Object.keys(this.pos)) { const p = this.pos[id], px = pxOf(p.sym) || p.avg; const r = this.reduce(id, p.qty, px, now, 'FLATTEN'); if (r) done.push(r); }
      const n = Object.keys(this.orders).length; this.orders = {}; if (n) this.ver++; this.emit({ k: 'flatten', n: done.length, cancelled: n }); return { closed: done, cancelled: n, pnl: done.reduce((s, r) => s + r.pnl, 0) };
    }
    list(sym) { return Object.values(this.pos).filter((p) => !sym || p.sym === sym); }
    toJSON() { return { v: 1, fee: this.fee, pos: this.pos, orders: this.orders, closed: this.closed.toArray().slice(-200) }; }
    static from(j, opt) { const L = new V.Ledger(opt); if (j && j.v === 1) { L.fee = fin(j.fee) ? j.fee : L.fee; for (const p of Object.values(j.pos || {})) if (p && p.sym && p.qty > 0 && p.avg > 0) L.pos[p.id] = p; for (const o of Object.values(j.orders || {})) if (o && o.sym && o.px > 0) L.orders[o.id] = o; for (const c of j.closed || []) L.closed.push(c); } return L; }
  };

  /* ══ 4. stale feed guard ══ */
  V.STALE_MS = 5000;
  V.StaleGuard = class {
    constructor(ms) { this.ms = ms || V.STALE_MS; this.lastOk = 0; this.lastFail = 0; this.why = ''; }
    ok(now) { this.lastOk = now || Date.now(); }
    fail(now, why) { this.lastFail = now || Date.now(); if (why) this.why = String(why).slice(0, 60); }
    state(now) { now = now || Date.now(); const age = this.lastOk ? now - this.lastOk : 0, stale = this.lastFail > this.lastOk && (this.lastOk ? age > this.ms : now - this.lastFail > this.ms); return { stale, ageS: stale ? Math.round((this.lastOk ? age : now - this.lastFail) / 1000) : 0, why: this.why }; }
  };
  /* failover order: skip hosts in cooldown, publicnode always last (it rate-limits shared traffic hardest) */
  V.rpcOrder = (urls, cool, now) => { now = now || Date.now(); const host = (u) => { try { return new URL(u).hostname; } catch (e) { return u; } }; const live = urls.filter((u) => !(cool && cool[host(u)] > now)); const pick = live.length ? live : urls.slice(); return pick.filter((u) => !/publicnode\.com/.test(u)).concat(pick.filter((u) => /publicnode\.com/.test(u))); };
  V.FAILOVER = ['DexScreener', 'Jupiter', 'Coinbase', 'Kraken', 'Binance'];
  V.isRateOrTls = (msg) => /HTTP 429|rate|SSL|TLS|certificate|ERR_SSL|Failed to fetch|timeout|HTTP 5\d\d/i.test(String(msg || ''));

  /* ══ 5. drawings in (epoch ms, price) ══ */
  V.toMs = (t) => (!fin(+t) || +t <= 0 ? NaN : +t < 1e11 ? Math.round(+t * 1000) : Math.round(+t));
  V.unitOf = (t) => (+t < 1e11 ? 's' : 'ms');
  V.fromMs = (ms, unit) => (unit === 's' ? ms / 1000 : ms);
  V.KEYS = [['t', 'ms'], ['t1', 'ms1'], ['t2', 'ms2'], ['t3', 'ms3']];
  /* stamp ms anchors once; later re-project the chart-unit times from the anchors (idempotent) */
  V.anchor = (d) => { for (const [k, m] of V.KEYS) if (d[k] != null && d[m] == null) { const v = V.toMs(d[k]); if (fin(v)) d[m] = v; } return d; };
  V.project = (d, unit) => { let ch = false; for (const [k, m] of V.KEYS) if (d[m] != null) { const v = V.fromMs(d[m], unit); if (d[k] !== v) { d[k] = v; ch = true; } } return ch; };

  /* ══ 6. sub-penny notation ══ */
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  V.tiny = (p, dollar) => {
    if (!fin(p) || p <= 0) return '–'; const pre = dollar ? '$' : '';
    if (p >= 0.001) return pre + (p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(p >= 100 ? 2 : 3) : p.toPrecision(4));
    const z = Math.ceil(-Math.log10(p) - 1e-12) - 1, sig = Math.round(p * Math.pow(10, z + 4)).toString().slice(0, 4).replace(/(\d)0+$/, '$1');
    return pre + '0.0' + String(z).split('').map((d) => SUB[+d]).join('') + sig;
  };
  /* chain monogram avatar: always a glyph, never a blank square */
  V.monogram = (sym, chain) => { const s = String(sym || '?').replace(/^oc:\w+:/, '').replace(/[^A-Za-z0-9]/g, ''), c = String(chain || '').toLowerCase(); let h = 0; for (const ch of s + c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return { txt: (s.slice(0, 2) || '?').toUpperCase(), hue: h % 360, chain: { solana: 'SOL', eth: 'ETH', base: 'BASE', bsc: 'BSC', arbitrum: 'ARB' }[c] || (c ? c.slice(0, 4).toUpperCase() : '') }; };

  /* ══ 7. Copilot LLM engine ══ */
  V.LLM = {
    ollama: { l: 'Local Ollama ($0)', base: '/ollama/v1', model: 'llama3.1', kind: 'openai' },
    ollamad: { l: 'Ollama direct (127.0.0.1:11434)', base: 'http://127.0.0.1:11434/v1', model: 'llama3.1', kind: 'openai' },
    grok: { l: 'Grok (xAI)', base: 'https://api.x.ai/v1', model: 'grok-4', kind: 'openai', key: true },
    claude: { l: 'Claude (Anthropic)', base: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5', kind: 'anthropic', key: true },
    deepseek: { l: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', kind: 'openai', key: true },
    openai: { l: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', kind: 'openai', key: true },
  };
  /* guess the provider from a pasted key */
  V.keyKind = (k) => { k = String(k || '').trim(); return /^sk-ant-/.test(k) ? 'claude' : /^xai-/.test(k) ? 'grok' : /^sk-(proj-)?[A-Za-z0-9_-]{20,}$/.test(k) ? (k.length < 40 ? 'deepseek' : 'openai') : null; };
  /* request shape for a route (pure: the page does the fetch). Anthropic = native Messages API, OpenAI-compatible otherwise. */
  V.llmRequest = (route, key, system, msgs) => {
    const p = V.LLM[route.id] || route, base = String(route.base || p.base).replace(/\/$/, ''), model = route.model || p.model;
    if ((route.kind || p.kind) === 'anthropic') return { url: base + '/messages', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01' }, body: { model, max_tokens: 16000, system, messages: msgs, fallbacks: 'default' } };
    const h = { 'Content-Type': 'application/json' }; if (key) h.Authorization = 'Bearer ' + key;
    return { url: base + '/chat/completions', headers: h, body: { model, messages: [{ role: 'system', content: system }].concat(msgs), temperature: 0.4, max_tokens: 1200 } };
  };
  V.llmText = (j) => { if (!j) return ''; if (Array.isArray(j.content)) { if (j.stop_reason === 'refusal') return '(the model declined this request)'; return j.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); } const c = j.choices && j.choices[0]; return (c && c.message && c.message.content) || (j.message && j.message.content) || ''; };
  /* 1-click action pills from a model / analyst reply: levels to plot, an entry/stop for the R:R ruler, a lab run, a bot rule */
  V.parseActions = (text) => {
    const t = String(text || ''), num = (s) => +String(s).replace(/[,$\s]/g, ''), acts = [], lv = [];
    const rx = /\b(support|resistance|pivot|target|tp\d?|take[- ]profit|entry|stop(?:[- ]loss)?|sl|invalidation|level)s?\b[^\d$\n]{0,24}\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/gi;
    let m; const seen = new Set();
    while ((m = rx.exec(t))) { const k = m[1].toLowerCase(), v = num(m[2]); if (!(v > 0) || seen.has(k + v)) continue; seen.add(k + v); lv.push({ kind: /stop|sl|invalid/.test(k) ? 'stop' : /entry/.test(k) ? 'entry' : /target|tp|take/.test(k) ? 'target' : /resist/.test(k) ? 'resistance' : /support/.test(k) ? 'support' : 'level', px: v }); }
    if (lv.length) acts.push({ kind: 'plot', label: `Plot ${lv.length} level${lv.length > 1 ? 's' : ''}`, levels: lv });
    const en = lv.find((x) => x.kind === 'entry'), st = lv.find((x) => x.kind === 'stop');
    if (en && st) acts.push({ kind: 'ruler', label: 'Load in R:R Ruler', entry: en.px, stop: st.px });
    const strat = /\b(ema|sma|rsi|macd|bollinger|supertrend|vwap|donchian|breakout|mean[- ]reversion|grid)\b/i.exec(t);
    if (strat) { acts.push({ kind: 'lab', label: 'Run in Quant Lab', strat: strat[1].toLowerCase() }); acts.push({ kind: 'bot', label: 'Queue Bot Rule Behind Firewall', rule: strat[1].toLowerCase() + (en ? ' entry ' + en.px : '') + (st ? ' stop ' + st.px : '') }); }
    for (const c of t.matchAll(/\[\[cmd:\s*([^\]]{1,120})\]\]/g)) acts.push({ kind: 'cmd', label: c[1].trim(), cmd: c[1].trim() });
    return acts.slice(0, 6);
  };
  /* deterministic local analyst: always answers from the live context, never "I can't right now" */
  V.analyst = (q, c) => {
    c = c || {}; const C = c.candles || [], s = c.sym || 'this symbol', n = C.length, f = (x) => (fin(x) ? (x < 0.001 ? V.tiny(x) : +x.toPrecision(x >= 1000 ? 7 : 5)) : '–');
    if (n < 20) return `**${s}**: not enough candles on the chart yet to read structure (have ${n}). Load more history (zoom out or pick a higher timeframe) and ask again.\n\nYou asked: “${String(q).slice(0, 140)}”`;
    const cl = C.map((k) => k.c), last = cl[n - 1], ema = (p) => { const a = 2 / (p + 1); let e = cl[0]; for (const x of cl) e = x * a + e * (1 - a); return e; }, e20 = ema(20), e50 = ema(50);
    let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; } const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    let tr = 0; for (let i = n - 14; i < n; i++) tr += Math.max(C[i].h - C[i].l, Math.abs(C[i].h - C[i - 1].c), Math.abs(C[i].l - C[i - 1].c)); const atr = tr / 14;
    const w = C.slice(-Math.min(60, n)), hi = Math.max(...w.map((k) => k.h)), lo = Math.min(...w.map((k) => k.l)), up = last > e20 && e20 > e50, dn = last < e20 && e20 < e50;
    const bias = up ? 'Bullish (price > EMA20 > EMA50)' : dn ? 'Bearish (price < EMA20 < EMA50)' : 'Range / mixed';
    const entry = up ? Math.max(lo, last - atr * 0.5) : dn ? Math.min(hi, last + atr * 0.5) : last, stop = up ? entry - atr * 1.5 : dn ? entry + atr * 1.5 : last - atr * 1.5, t1 = up || !dn ? entry + Math.abs(entry - stop) * 2 : entry - Math.abs(entry - stop) * 2;
    const extra = [];
    if (fin(c.cvd)) extra.push(`- CVD (aggregated tape): ${c.cvd >= 0 ? '+' : '-'}$${Math.abs(c.cvd).toFixed(0)} — ${c.cvd >= 0 ? 'buyers' : 'sellers'} in control of the prints`);
    if (c.gex) extra.push(`- GEX: flip ${f(c.gex.flip)} · call wall ${f(c.gex.callWall)} · put wall ${f(c.gex.putWall)} · ${c.gex.regime || ''}`);
    if (c.rug) extra.push(`- Rug Shield: ${c.rug}`);
    if (c.ledger) extra.push(`- Your ledger: ${c.ledger}`);
    if (c.journal) extra.push(`- Journal: ${c.journal}`);
    return `**${s}** · local analyst (no model connected, deterministic from the chart)\nBias: **${bias}** · RSI14 ${rsi.toFixed(0)} · ATR ${f(atr)}\n- Resistance ${f(hi)} · Support ${f(lo)} (last ${w.length} bars)\n- Entry ${f(entry)} · Stop ${f(stop)} · Target ${f(t1)} (2R)\n${extra.join('\n')}${extra.length ? '\n' : ''}You asked: “${String(q).slice(0, 140)}”. Connect Ollama ($0, local) or paste an API key for open-ended answers. Not financial advice.`;
  };

  /* ══ 8. option-chain stats (live chain or model chain) ══ */
  V.optStats = (rows, spot, ivHist) => {
    const R = (rows || []).filter((r) => r.strike > 0 && r.oi >= 0); if (!R.length || !(spot > 0)) return null;
    const call = R.filter((r) => r.type === 'C').reduce((s, r) => s + r.oi, 0), put = R.filter((r) => r.type === 'P').reduce((s, r) => s + r.oi, 0);
    const ks = [...new Set(R.map((r) => r.strike))].sort((a, b) => a - b); let best = null, bestPain = Infinity;
    for (const K of ks) { let pain = 0; for (const r of R) pain += r.oi * (r.type === 'C' ? Math.max(0, K - r.strike) : Math.max(0, r.strike - K)); if (pain < bestPain) { bestPain = pain; best = K; } }
    const near = (type, k) => { const want = spot * k; return R.filter((r) => r.type === type).reduce((m, r) => (!m || Math.abs(r.strike - want) < Math.abs(m.strike - want) ? r : m), null); };
    const atm = near('C', 1), p25 = near('P', 0.9), c25 = near('C', 1.1), iv = atm && atm.iv ? atm.iv : null, H = (ivHist || []).filter(fin);
    const rank = iv != null && H.length >= 2 ? ((iv - Math.min(...H)) / ((Math.max(...H) - Math.min(...H)) || 1)) * 100 : null;
    return { pcr: call ? put / call : null, callOi: call, putOi: put, maxPain: best, atmIv: iv, ivRank: rank, skew: p25 && c25 && p25.iv && c25.iv ? p25.iv - c25.iv : null };
  };
  /* cross-DEX table for a token: pools → best/worst price, spread bps, $1K / $10K AMM impact per pool */
  V.dexArb = (pools) => {
    const P = (pools || []).filter((p) => p.price > 0 && p.liq > 0); if (!P.length) return null;
    const rows = P.map((p) => ({ dex: p.dex, chain: p.chain, price: p.price, liq: p.liq, i1k: V.estimateFill({ px: p.price, usd: 1000, side: 'buy', liqUsd: p.liq }).impactPct, i10k: V.estimateFill({ px: p.price, usd: 10000, side: 'buy', liqUsd: p.liq }).impactPct })).sort((a, b) => a.price - b.price);
    const lo = rows[0], hi = rows[rows.length - 1];
    return { rows, buy: lo.dex, sell: hi.dex, spreadBps: (hi.price / lo.price - 1) * 1e4, netBps: (hi.price / lo.price - 1) * 1e4 - (lo.i1k + hi.i1k) * 100 - 60 };
  };

  V.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V171;
