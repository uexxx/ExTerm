/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.5 core (pure, no DOM, Node-testable):
   · AI Bridge: provider presets (Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Bot), quick-prompt presets,
     Token-Saver vs Full Quant context packets (chart + order book, on-chain due diligence, watchlist comparison,
     options IV / liquidations, session post-mortem), token estimate
   · paste-back loop: plain-English or JSON trade-idea parser, directional stop + ATR validation, R:R maths, ghost lines,
     $TICKER / Solana / EVM contract extraction + liquidity / mint-authority screen
   · Pine Script v5 hardening (confirmed bars, no look-ahead, $ risk sizing, mandatory strategy.exit stop,
     max_intraday_loss, webhook alert), Pine → plain-English rules for the 17-test gate, failure diagnostics for any AI
   · deterministic AI / bot firewall for 127.0.0.1/llm-signal proposals (mandatory stop, min ATR stop, depth multiple,
     confidence threshold → PAPER shadow slot, size cut after a loss streak), guardrail profile, attribution stats
   · AI-vetted zero-custody copy engine: multi-wallet consensus, anti-front-run drift shield, personal $ risk + ATR
     stop override with TP1/TP2/TP3, exit modes, per-leader daily loss cap + auto-mute, AI vetting gate
   · share card model (balances and personal data masked), shareable strategy / watchlist JSON, local Python templates */
const V165 = (() => {
  const V = {};
  const fin = Number.isFinite;
  const num = (v) => { if (v == null || v === '' || typeof v === 'boolean') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, '')); return fin(n) ? n : null; };
  const r2 = (x, d = 2) => (fin(x) ? +x.toFixed(d) : null);
  const sig = (x) => (fin(x) ? +x.toPrecision(8) : null);
  const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

  /* ══ 1. providers + presets ══ */
  V.PROVIDERS = [['grok', 'Grok'], ['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['deepseek', 'DeepSeek'], ['ollama', 'Local Ollama'], ['custom', 'Custom Bot']];
  V.PROVIDER_IDS = V.PROVIDERS.map((p) => p[0]);
  V.providerName = (id) => (V.PROVIDERS.find((p) => p[0] === id) || V.PROVIDERS[0])[1];
  const STYLE = {
    grok: 'Use your live X search for catalysts, but ground every price level in the packet below.',
    chatgpt: 'Reason step by step, then answer with the JSON block only at the end.',
    claude: 'Think carefully about risk first; be explicit about what would invalidate the idea.',
    deepseek: 'Be concise and quantitative; show the arithmetic for the stop and target.',
    ollama: 'You run offline: use only the numbers in this packet, never invent prices.',
    custom: 'Machine-readable mode: reply with the JSON object only.',
  };
  V.PRESETS = [['chart', 'Chart Setup Check'], ['rug', 'On-Chain Rug & Whale Audit'], ['macro', 'Macro Catalyst & Risk Plan'], ['leak', 'Post-Session Leak Review']];
  const ASK = {
    chart: 'Check this chart setup. Is there a valid long or short with a stop beyond 1.5 ATR and at least 1.5R to the first target?',
    rug: 'Audit this token for rug, honeypot and whale-concentration risk. List red flags first, then a verdict: avoid / watch / tradeable.',
    macro: 'List the macro catalysts that could move this market in the next 72 hours and give a risk plan (size, stop, no-trade windows).',
    leak: 'Review this session post-mortem. Find my top 3 execution leaks and give one concrete rule to fix each.',
  };
  V.JSON_SPEC = 'If you propose a trade, end with JSON: {"symbol":"SOL","side":"long","entry":0,"stop_loss":0,"tp":[0],"confidence":0-100,"reason":"..."}. stop_loss is mandatory.';
  V.estTokens = (s) => Math.ceil(String(s || '').length / 4);
  const ASK_SHORT = { chart: 'Valid long/short? Stop ≥1.5 ATR, ≥1.5R.', rug: 'Rug/whale red flags, then avoid/watch/tradeable.', macro: '72h catalysts + risk plan.', leak: 'Top 3 leaks, 1 fix each.' };
  V.wrap = (provider, preset, body, mode) => {
    const p = V.PROVIDER_IDS.includes(provider) ? provider : 'grok', k = ASK[preset] ? preset : 'chart';
    if (mode === 'saver') return `[ExTerm→${V.providerName(p)}] ${ASK_SHORT[k]} Reply JSON {symbol,side,entry,stop_loss,tp,confidence}; stop_loss required.\n${body}`;
    return `[ExTerm ${V.providerName(p)} packet · ${(V.PRESETS.find((x) => x[0] === k) || V.PRESETS[0])[1]}]\n${ASK[k]}\n${STYLE[p]}\n${V.JSON_SPEC}\n---\n${body}`;
  };

  /* ══ 2. indicators for packets ══ */
  V.ema = (xs, n) => { const k = 2 / (n + 1); let e = null; const out = []; for (const x of xs) { e = e == null ? x : x * k + e * (1 - k); out.push(e); } return out; };
  V.rsi = (cl, n = 14) => { if (!cl || cl.length < n + 1) return null; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; } g /= n; l /= n; for (let i = n + 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
  V.atr = (b, n = 14) => { if (!b || b.length < n + 1) return null; let s = 0; for (let i = b.length - n; i < b.length; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); return s / n; };
  V.trend = (bars) => { const b = (bars || []).filter((x) => x && x.c > 0); if (b.length < 55) return 'n/a'; const cl = b.map((x) => x.c), e20 = V.ema(cl, 20), e50 = V.ema(cl, 50), n = cl.length - 1; const up = e20[n] > e50[n] && cl[n] > e20[n], dn = e20[n] < e50[n] && cl[n] < e20[n]; return up ? 'up' : dn ? 'down' : 'flat'; };
  V.vwap = (bars) => { let pv = 0, vv = 0; for (const b of bars || []) { const v = b.v > 0 ? b.v : 0; pv += ((b.h + b.l + b.c) / 3) * v; vv += v; } return vv > 0 ? pv / vv : null; };
  V.walls = (book, n = 3) => { if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return null; const top = (a) => a.filter((l) => +l[0] > 0 && +l[1] > 0).map((l) => ({ p: +l[0], usd: +l[0] * +l[1] })).sort((x, y) => y.usd - x.usd).slice(0, n); return { bids: top(book.bids), asks: top(book.asks) }; };
  V.chartStats = (bars) => {
    const b = (bars || []).filter((x) => x && x.c > 0); if (b.length < 20) return null; const cl = b.map((x) => x.c), n = cl.length - 1;
    const e20 = V.ema(cl, 20)[n], e50 = cl.length >= 50 ? V.ema(cl, 50)[n] : null;
    return { last: cl[n], ema20: e20, ema50: e50, rsi: V.rsi(cl, 14), atr: V.atr(b, 14), chg: cl.length > 1 ? (cl[n] / cl[0] - 1) * 100 : 0 };
  };

  /* ══ 3. context packets (Token-Saver ≈ 120 tokens vs Full Quant) ══ */
  const f = (x) => (x == null || !fin(+x) ? '–' : Math.abs(x) >= 1000 ? (+x).toFixed(0) : Math.abs(x) >= 1 ? (+x).toFixed(2) : (+x).toPrecision(4));
  const usd = (x) => { if (x == null || !fin(+x)) return '–'; const a = Math.abs(x); return (x < 0 ? '−' : '') + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a.toFixed(0)); };
  const pc = (x) => (x == null || !fin(+x) ? '–' : (x >= 0 ? '+' : '') + (+x).toFixed(2) + '%');
  V.packetChart = (c, mode) => {
    const x = c || {}, tr = x.trend || {}, st = x.stats || {}, w = x.walls;
    const tl = ['1m', '5m', '1h', '4h'].map((k) => `${k} ${tr[k] || 'n/a'}`).join(' · ');
    const avd = x.avwap > 0 && st.last > 0 ? ((st.last / x.avwap - 1) * 100) : null;
    if (mode !== 'full') return [`${x.sym || '?'} ${x.tf || ''} px ${f(st.last)}`, `trend ${tl}`, `EMA20 ${f(st.ema20)} EMA50 ${f(st.ema50)} RSI ${f(st.rsi)} ATR ${f(st.atr)}`, `AVWAP ${pc(avd)} · tape10s ${usd(x.t10)} · tape60s ${usd(x.t60)}`, w ? `walls bid ${w.bids.map((l) => f(l.p)).join('/') || '–'} ask ${w.asks.map((l) => f(l.p)).join('/') || '–'}` : 'walls –'].join('\n');
    return [`SYMBOL: ${x.sym || '?'} · TIMEFRAME: ${x.tf || ''} · LAST: ${f(st.last)} · CHANGE (window): ${pc(st.chg)}`, `TREND (EMA20 vs EMA50 + close): ${tl}`,
      `EMA 20: ${f(st.ema20)} · EMA 50: ${f(st.ema50)} · RSI 14: ${f(st.rsi)} · ATR 14: ${f(st.atr)} (1.5 ATR stop = ${f(st.atr * 1.5)})`,
      `AVWAP: ${f(x.avwap)} (${x.avKind || 'session'} anchor, distance ${pc(avd)})`, `TAPE DELTA: 10s ${usd(x.t10)} · 60s ${usd(x.t60)} (positive = aggressive buyers)`,
      `3D LIQUIDITY WALLS: bids ${w ? w.bids.map((l) => `${f(l.p)} (${usd(l.usd)})`).join(', ') || 'none' : 'no book'} · asks ${w ? w.asks.map((l) => `${f(l.p)} (${usd(l.usd)})`).join(', ') || 'none' : 'no book'}`,
      `RULES: never place a trade without a stop-loss; stop must be ≥ 1.5 ATR away; size by $ risk, not notional.`].join('\n');
  };
  V.packetOnchain = (t, mode) => {
    const x = t || {}, mint = x.mint == null ? 'unknown' : x.mint ? 'ACTIVE (can print supply)' : 'renounced', lp = x.lpLocked == null ? 'unknown' : x.lpLocked ? 'locked/burned' : 'UNLOCKED';
    if (mode !== 'full') return [`${x.sym || '?'} ${x.chain || ''} px ${f(x.price)}`, `liq ${usd(x.liq)} fdv ${usd(x.fdv)} vol5m ${usd(x.v5m)} 1h ${usd(x.v1h)} 24h ${usd(x.v24)}`, `holders ${x.holders || '–'} top10 ${x.top10 != null ? f(x.top10) + '%' : '–'} mint ${x.mint == null ? '?' : x.mint ? 'ON' : 'off'} LP ${x.lpLocked == null ? '?' : x.lpLocked ? 'locked' : 'open'} 4h ${x.struct4h || 'n/a'}`].join('\n');
    return [`TOKEN: ${x.sym || '?'} on ${x.chain || '?'} · contract ${x.addr || '–'} · price ${f(x.price)}`, `LIQUIDITY: ${usd(x.liq)} · FDV: ${usd(x.fdv)} · liq/FDV ${x.liq > 0 && x.fdv > 0 ? f((x.liq / x.fdv) * 100) + '%' : '–'}`,
      `VOLUME: 5m ${usd(x.v5m)} · 1h ${usd(x.v1h)} · 24h ${usd(x.v24)}`, `HOLDERS: ${x.holders || '–'} · TOP-10 CONCENTRATION: ${x.top10 != null ? f(x.top10) + '%' : '–'}`, `MINT AUTHORITY: ${mint} · LP: ${lp}`, `4H STRUCTURE: ${x.struct4h || 'n/a'}`,
      'RULES: flag active mint authority, unlocked LP, top-10 > 30% or liquidity < $50k as unsafe.'].join('\n');
  };
  V.packetWatch = (rows, mode) => {
    const R = (rows || []).filter((r) => r && r.sym).slice(0, 5); if (!R.length) return 'WATCHLIST: empty';
    const head = mode === 'full' ? 'SYMBOL | LAST | 24H | TREND 1H | RSI | ATR%' : 'sym|px|24h|trend|rsi';
    return ['WATCHLIST COMPARISON (top ' + R.length + ')', head].concat(R.map((r) => mode === 'full' ? `${r.sym} | ${f(r.last)} | ${pc(r.chg)} | ${r.trend || 'n/a'} | ${f(r.rsi)} | ${r.atr > 0 && r.last > 0 ? f((r.atr / r.last) * 100) + '%' : '–'}` : `${r.sym}|${f(r.last)}|${pc(r.chg)}|${r.trend || '-'}|${r.rsi != null ? Math.round(r.rsi) : '-'}`)).join('\n');
  };
  V.packetOptions = (o, mode) => {
    const x = o || {}, L = (x.liqs || []).slice(0, mode === 'full' ? 6 : 3);
    return [`${mode === 'full' ? 'OPTIONS IV / WHALE LIQUIDATIONS' : 'IV/liq'} · ${x.sym || '?'} px ${f(x.price)}`, `ATM IV ${x.iv != null ? f(x.iv) + '%' : 'n/a'} · skew ${x.skew != null ? f(x.skew) : 'n/a'} · max-pain ${f(x.maxPain)} · pin ${f(x.pin)}`,
      `liquidation magnets: ${L.length ? L.map((l) => `${f(l.p)} ${l.side || ''} ${usd(l.usd)}`).join(', ') : 'none tracked'}`].join('\n');
  };
  V.packetPost = (s, mode) => {
    const x = s || {}, A = x.attr || {};
    const row = (k, l) => { const a = A[k]; return a && a.n ? `${l} ${a.n} trades · win ${f(a.win)}% · PF ${a.pf == null ? '∞' : f(a.pf)} · slip ${f(a.bps)} bps` : `${l} 0 trades`; };
    const lines = [`SESSION POST-MORTEM (privacy-masked: no balances, no account ids, no keys)`, `receipts ${x.receipts || 0} · blocked ${x.blocked || 0} · rejected AI proposals ${x.rejected || 0}`, row('manual', 'Manual'), row('quant', 'Quant'), row('ai', 'AI Bridge'), row('copy', 'Copy')];
    if (mode === 'full') lines.push(`leaks: ${(x.leaks || []).map((l) => `${l.k} ×${l.n}`).join(', ') || 'none found'}`, 'ASK: rank my leaks by $ impact and give one rule per leak.');
    return lines.join('\n');
  };

  /* ══ 4. paste-back: plain English or JSON → trade idea ══ */
  const SIDE = { long: 'long', buy: 'long', bull: 'long', bullish: 'long', short: 'short', sell: 'short', bear: 'short', bearish: 'short' };
  const NOT_SYM = new Set(['AT', 'THE', 'AND', 'STOP', 'LOSS', 'TARGET', 'TP', 'SL', 'ENTRY', 'BUY', 'SELL', 'LONG', 'SHORT', 'IF', 'ON', 'WITH', 'NEAR', 'AROUND', 'FROM', 'TO', 'USD', 'PRICE', 'LIMIT', 'MARKET', 'A', 'AN']);
  const pick = (o, ks) => { for (const k of ks) if (o[k] != null) return o[k]; return null; };
  const jsonBlock = (t) => { const s = String(t); const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s); const cand = fence ? fence[1] : s; const i = cand.indexOf('{'), j = cand.lastIndexOf('}'); if (i < 0 || j <= i) return null; try { const o = JSON.parse(cand.slice(i, j + 1)); return o && typeof o === 'object' ? (Array.isArray(o) ? o[0] : o) : null; } catch (e) { return null; } };
  V.normIdea = (o) => {
    if (!o || typeof o !== 'object') return null;
    const sideRaw = String(pick(o, ['side', 'direction', 'action', 'bias']) || '').toLowerCase().trim(), side = SIDE[sideRaw] || null;
    let tp = pick(o, ['tp', 'take_profit', 'takeProfit', 'target', 'targets', 'tps']); tp = (Array.isArray(tp) ? tp : tp == null ? [] : [tp]).map(num).filter((x) => x > 0).slice(0, 3);
    let conf = num(pick(o, ['confidence', 'conf', 'probability'])); if (conf != null && conf > 0 && conf <= 1) conf *= 100;
    const sym = String(pick(o, ['symbol', 'ticker', 'asset', 'pair', 'sym']) || '').replace(/^\$/, '').trim().slice(0, 140);
    const sl = pick(o, ['stop_loss', 'stopLoss', 'stop', 'sl', 'invalidation']);
    return { symbol: sym, side, entry: num(pick(o, ['entry', 'entry_price', 'entryPrice', 'price', 'limit'])), stop_loss: sl == null ? null : num(sl), tp, confidence: conf == null ? null : Math.max(0, Math.min(100, conf)), reason: clip(pick(o, ['reason', 'rationale', 'thesis', 'why']) || '', 300), source: clip(pick(o, ['source', 'provider', 'model', 'bot']) || '', 40) };
  };
  V.parseIdea = (text) => {
    const t = String(text || '').slice(0, 20000); if (!t.trim()) return null;
    const j = jsonBlock(t); if (j) { const n = V.normIdea(j); if (n && n.side && n.symbol) return Object.assign(n, { via: 'json' }); }
    const s = t.replace(/\*\*|__/g, ' ').replace(/[–—]/g, '-');
    const NUM = '\\$?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d+)?)';
    let side = null, sym = '', m;
    if ((m = /\b(long|short|buy|sell)\b\s+(?:the\s+)?\$?([A-Za-z][A-Za-z0-9]{1,11}(?:[-/](?:USDT?|USDC|USD))?)\b/i.exec(s)) && !NOT_SYM.has(m[2].toUpperCase())) { side = SIDE[m[1].toLowerCase()]; sym = m[2]; }
    if (!sym && (m = /\$([A-Za-z][A-Za-z0-9]{1,11})\b/.exec(s))) sym = m[1];
    if (!side && (m = /\b(long|short|buy|sell|bullish|bearish)\b/i.exec(s))) side = SIDE[m[1].toLowerCase()];
    const grab = (rx) => { const x = rx.exec(s); return x ? num(x[1]) : null; };
    const entry = grab(new RegExp('(?:\\bentry(?:\\s*price)?|\\benter|\\b(?:long|short|buy|sell)\\b[^\\n,.;]{0,24}?\\b(?:at|@|near|around)|\\b(?:at|@))\\s*[:=]?\\s*' + NUM, 'i'));
    const stop = grab(new RegExp('\\b(?:stop(?:[-\\s]*loss)?|sl|invalidation)\\b\\s*(?:at|@|:|=|of|below|above)?\\s*' + NUM, 'i'));
    const tpm = new RegExp('\\b(?:targets?|tp\\d?|take[-\\s]*profit)\\b\\s*(?:at|@|:|=|of)?\\s*' + NUM + '((?:\\s*(?:,|/|and|then|&)\\s*(?:tp\\d\\s*[:=]?\\s*)?\\$?\\s*\\d+(?:,\\d{3})*(?:\\.\\d+)?)*)', 'i').exec(s);
    let tp = []; if (tpm) { tp = [num(tpm[1])].concat([...String(tpm[2] || '').replace(/tp\d\s*[:=]?/gi, ' ').matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)].map((x) => num(x[0])).filter((x) => x != null)); }
    if (!tp.length || tp.length < 3) { const more = s.match(/\btp\s*([123])\s*[:=@]?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/gi); if (more) for (const x of more) { const v = num(x.replace(/^tp\s*[123]\s*[:=@]?/i, '')); if (v > 0 && !tp.includes(v)) tp.push(v); } }
    tp = tp.filter((x) => x > 0).slice(0, 3);
    let conf = grab(/\bconfidence\b\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i); if (conf != null && conf <= 1) conf *= 100;
    if (!side || !sym || !(entry > 0)) return null;
    return { symbol: sym.toUpperCase(), side, entry, stop_loss: stop, tp, confidence: conf, reason: clip(s.trim(), 300), source: '', via: 'text' };
  };
  V.rr = (side, entry, sl, tp) => { const risk = Math.abs(entry - sl); if (!(risk > 0) || !(tp > 0)) return null; const rew = side === 'short' ? entry - tp : tp - entry; return rew > 0 ? rew / risk : null; };
  /* directional stop + ATR distance check for a pasted idea (ghost lines are drawn only for a directional stop) */
  V.checkIdea = (idea, atr, minAtr = 1.5) => {
    const I = idea || {}, out = { ok: false, errors: [], warns: [], rr: [], atrs: null }, d = I.side === 'short' ? -1 : 1;
    if (!I.side) out.errors.push('No direction (long / short) found.');
    if (!(I.entry > 0)) out.errors.push('No entry price found.');
    if (!(I.stop_loss > 0)) out.errors.push('No stop-loss: every ExTerm idea needs one.');
    else if (I.entry > 0 && (I.stop_loss - I.entry) * d >= 0) out.errors.push(d > 0 ? 'Wrong-way stop: a long stop must sit below entry.' : 'Wrong-way stop: a short stop must sit above entry.');
    for (const t of I.tp || []) if (I.entry > 0 && (t - I.entry) * d <= 0) out.errors.push(`Target ${t} is on the losing side of entry.`);
    if (out.errors.length) return out;
    const risk = Math.abs(I.entry - I.stop_loss); if (atr > 0) { out.atrs = risk / atr; if (out.atrs < minAtr) out.warns.push(`Stop is ${out.atrs.toFixed(2)} ATR away (< ${minAtr} ATR): likely inside normal noise.`); }
    out.rr = (I.tp || []).map((t) => V.rr(I.side, I.entry, I.stop_loss, t));
    if (!(I.tp || []).length) out.warns.push('No target: R:R badge shows risk only.');
    out.ok = true; return out;
  };
  V.ghost = (idea, riskUsd) => {
    const I = idea, R = riskUsd > 0 ? riskUsd : 100, lines = [{ k: 'entry', label: 'AI Entry', p: I.entry }, { k: 'sl', label: 'AI Stop', p: I.stop_loss, usd: -R }];
    (I.tp || []).forEach((t, i) => { const rr = V.rr(I.side, I.entry, I.stop_loss, t); lines.push({ k: 'tp', label: (I.tp.length > 1 ? 'TP' + (i + 1) : 'TP'), p: t, rr: rr == null ? null : r2(rr), usd: rr == null ? null : r2(rr * R) }); });
    return { sym: I.symbol, side: I.side, lines, qty: I.entry > 0 && I.stop_loss > 0 ? R / Math.abs(I.entry - I.stop_loss) : 0, risk: R };
  };
  V.badge = (l) => l.k === 'entry' ? `${l.label} ${sig(l.p)}` : l.k === 'sl' ? `${l.label} ${sig(l.p)} · −$${Math.abs(l.usd).toFixed(0)}` : `${l.label} ${sig(l.p)}${l.rr != null ? ' · ' + l.rr.toFixed(2) + 'R' : ''}${l.usd != null ? ' · +$' + l.usd.toFixed(0) : ''}`;

  /* ══ 5. $TICKER + contract extraction and safety screen ══ */
  const B58 = '[1-9A-HJ-NP-Za-km-z]';
  V.extract = (text) => {
    const s = String(text || '').slice(0, 50000), tick = new Set(), sol = new Set(), evm = new Set(); let m;
    const rt = /(?:^|[^A-Za-z0-9_$])\$([A-Za-z][A-Za-z0-9]{1,9})\b/g; while ((m = rt.exec(s))) { const u = m[1].toUpperCase(); if (!/^\d/.test(u)) tick.add(u); }
    const re = /\b0x[a-fA-F0-9]{40}\b/g; while ((m = re.exec(s))) evm.add(m[0].toLowerCase());
    const rs = new RegExp('(?:^|[^A-Za-z0-9])(' + B58 + '{32,44})(?![A-Za-z0-9])', 'g'); while ((m = rs.exec(s))) { const a = m[1]; if (/[a-z]/.test(a) && /[A-Z]/.test(a) && /\d/.test(a)) sol.add(a); }
    return { tickers: [...tick].slice(0, 20), solana: [...sol].slice(0, 10), evm: [...evm].slice(0, 10) };
  };
  V.MIN_LIQ = 50000;
  V.screen = (items, info, minLiq = V.MIN_LIQ) => {
    const ok = [], bad = [];
    for (const it of items || []) {
      const i = (info || {})[it.id] || null;
      if (it.kind === 'ticker') { if (i && i.sym) ok.push({ id: it.id, sym: i.sym, kind: it.kind }); else bad.push({ id: it.id, why: 'no liquid market found' }); continue; }
      if (!i) { bad.push({ id: it.id, why: 'safety data unavailable (unknown = unsafe)' }); continue; }
      if (i.mint) { bad.push({ id: it.id, why: 'active mint authority' }); continue; }
      if (!(i.liq >= minLiq)) { bad.push({ id: it.id, why: `liquidity ${usd(i.liq)} < ${usd(minLiq)}` }); continue; }
      if (!i.sym) { bad.push({ id: it.id, why: 'no tradable pool' }); continue; }
      ok.push({ id: it.id, sym: i.sym, kind: it.kind, liq: i.liq });
    }
    return { ok, bad };
  };

  /* ══ 6. Pine Script v5 hardening + diagnostics ══ */
  V.PINE_RULES = [['barstate.isconfirmed', /barstate\.isconfirmed/], ['lookahead_off', /lookahead\s*=\s*barmerge\.lookahead_off/], ['$ risk sizing', /riskUsd/], ['strategy.exit stop-loss', /strategy\.exit\([^)]*stop\s*=/], ['max_intraday_loss', /strategy\.risk\.max_intraday_loss\(/], ['127.0.0.1 webhook JSON', /alert_message|alert\(/]];
  /* lookahead rule: every request.security call says lookahead_off (a script with no higher-timeframe call cannot look ahead) */
  const secOk = (s) => { const calls = s.match(/request\.security\([^\n]*/g) || []; return calls.every((c) => /lookahead\s*=\s*barmerge\.lookahead_off/.test(c)); };
  V.pineCheck = (src) => { const s = String(src || ''); const rows = V.PINE_RULES.map(([k, rx]) => ({ k, ok: k === 'lookahead_off' ? secOk(s) : rx.test(s) })); return { ok: rows.every((r) => r.ok) && !/lookahead_on/.test(s), rows, repaint: /lookahead\s*=\s*barmerge\.lookahead_on/.test(s) }; };
  V.hardenPine = (src, opt) => {
    const O = Object.assign({ risk: 100, stopPct: 2, maxLoss: 300 }, opt || {}), changes = [];
    let s = String(src || '').replace(/\r\n?/g, '\n').slice(0, 60000); if (!s.trim()) return { src: '', changes: ['empty script'] };
    if (!/^\s*\/\/\s*@version\s*=\s*5/m.test(s)) { s = s.replace(/^\s*\/\/\s*@version\s*=\s*\d+\s*\n?/m, ''); s = '//@version=5\n' + s; changes.push('set //@version=5'); }
    if (/lookahead\s*=\s*barmerge\.lookahead_on/.test(s)) { s = s.replace(/lookahead\s*=\s*barmerge\.lookahead_on/g, 'lookahead = barmerge.lookahead_off'); changes.push('lookahead_on → lookahead_off (no future data)'); }
    s = s.replace(/request\.security\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (m0, inner) => (/lookahead\s*=/.test(inner) ? m0 : (changes.push('request.security: explicit lookahead_off'), `request.security(${inner}, lookahead = barmerge.lookahead_off)`)));
    const L = s.split('\n'); let decl = L.findIndex((l) => /^\s*strategy\s*\(/.test(l));
    if (decl < 0) { const vi = L.findIndex((l) => /@version/.test(l)); L.splice(vi + 1, 0, 'strategy("AI strategy (ExTerm hardened)", overlay = true, process_orders_on_close = true, initial_capital = 10000, commission_type = strategy.commission.percent, commission_value = 0.1, slippage = 2)'); decl = vi + 1; changes.push('added strategy() declaration with fees + slippage'); }
    let end = decl; let depth = 0; for (let i = decl; i < L.length; i++) { for (const ch of L[i]) { if (ch === '(') depth++; else if (ch === ')') depth--; } end = i; if (depth <= 0) break; }
    const add = []; let joined = L.join('\n');
    if (!/riskUsd/.test(joined)) { add.push(`riskUsd = input.float(${O.risk}, "Risk per trade ($)", minval = 1)`); changes.push('$ risk input (riskUsd)'); }
    if (!/stopPct/.test(joined)) add.push(`stopPct = input.float(${O.stopPct}, "Stop-loss %", minval = 0.1)`);
    if (!/strategy\.risk\.max_intraday_loss\(/.test(joined)) { add.push(`strategy.risk.max_intraday_loss(${O.maxLoss}, strategy.cash)`); changes.push('strategy.risk.max_intraday_loss'); }
    if (add.length) L.splice(end + 1, 0, ...add);
    for (let i = 0; i < L.length; i++) {
      const m = /^(\s*)(strategy\.entry\s*\((.*))$/.exec(L[i]); if (!m) continue;
      let line = m[2]; if (!/qty\s*=/.test(line) && /\)\s*$/.test(line)) { line = line.replace(/\)\s*$/, ', qty = riskUsd / (close * stopPct / 100))'); changes.push('entry sized by $ risk'); }
      const prev = (L[i - 1] || ''); if (/barstate\.isconfirmed/.test(prev) || /barstate\.isconfirmed/.test(line)) { L[i] = m[1] + line; continue; }
      L[i] = `${m[1]}if barstate.isconfirmed\n${m[1]}    ${line}`; changes.push('entry gated on barstate.isconfirmed');
    }
    s = L.join('\n'); joined = s;
    if (!/strategy\.exit\([^)]*stop\s*=/.test(joined)) { s += '\n// ExTerm mandatory stop-loss\nif strategy.position_size > 0\n    strategy.exit("ExTerm SL", stop = strategy.position_avg_price * (1 - stopPct / 100))\nif strategy.position_size < 0\n    strategy.exit("ExTerm SL short", stop = strategy.position_avg_price * (1 + stopPct / 100))'; changes.push('mandatory strategy.exit stop-loss'); }
    if (!/alert_message|alert\(/.test(s)) { s += '\n// 127.0.0.1 webhook JSON (route through ExTerm, never straight to an exchange)\nif barstate.isconfirmed and strategy.position_size != strategy.position_size[1]\n    alert(\'{"source":"pine","symbol":"\' + syminfo.ticker + \'","side":"\' + (strategy.position_size > 0 ? "long" : strategy.position_size < 0 ? "short" : "flat") + \'","entry":\' + str.tostring(close) + \',"stop_loss":\' + str.tostring(strategy.position_size > 0 ? close * (1 - stopPct / 100) : close * (1 + stopPct / 100)) + \'}\', alert.freq_once_per_bar_close)'; changes.push('webhook alert JSON'); }
    return { src: s, changes: [...new Set(changes)] };
  };
  /* Pine → plain-English rules (fed to the v16.4 natural-language → safe spec translator, then the 17-test gate) */
  V.pineToText = (src) => {
    const s = String(src || ''), parts = [], ent = (s.match(/strategy\.entry\s*\(\s*"[^"]*"\s*,\s*strategy\.(long|short)/) || [])[1] || 'long';
    const vars = {}; for (const m of s.matchAll(/^\s*(\w+)\s*=\s*(ta\.\w+\([^\n]*\))\s*$/gm)) vars[m[1]] = m[2];
    const x = s.replace(/\b(\w+)\b/g, (w) => (vars[w] ? vars[w] : w));
    let m;
    if ((m = /ta\.rsi\(\s*close\s*,\s*(\d+)\s*\)\s*<\s*(\d+)/.exec(x))) parts.push(`rsi ${m[1]} below ${m[2]}`);
    if ((m = /ta\.rsi\(\s*close\s*,\s*(\d+)\s*\)\s*>\s*(\d+)/.exec(x))) parts.push(`rsi ${m[1]} above ${m[2]}`);
    if ((m = /ta\.crossover\(\s*close\s*,\s*ta\.(ema|sma)\(\s*close\s*,\s*(\d+)\s*\)\s*\)/.exec(x))) parts.push(`price crosses above ${m[1]} ${m[2]}`);
    if ((m = /close\s*>\s*ta\.(ema|sma)\(\s*close\s*,\s*(\d+)\s*\)/.exec(x))) parts.push(`price above ${m[1]} ${m[2]}`);
    if ((m = /ta\.crossunder\(\s*close\s*,\s*ta\.(ema|sma)\(\s*close\s*,\s*(\d+)\s*\)\s*\)/.exec(x))) parts.push(`price crosses below ${m[1]} ${m[2]}`);
    if (/close\s*>\s*ta\.vwap/.test(x)) parts.push('price above vwap');
    if ((m = /ta\.highest\(\s*high\s*,\s*(\d+)\s*\)/.exec(x)) && /close\s*>|crossover\(\s*close/.test(x)) parts.push(`breakout of ${m[1]} bar high`);
    if (/volume\s*>\s*ta\.sma\(\s*volume/.test(x)) parts.push('volume above average');
    if (/ta\.crossover\(\s*macdLine\s*,\s*signalLine|ta\.crossover\(\s*macd/.test(x)) parts.push('macd crosses above signal');
    const sp = /stopPct\s*=\s*input\.float\(\s*(\d+(?:\.\d+)?)/.exec(s) || /\(1\s*-\s*(\d*\.\d+)\s*\)/.exec(s), tp = /(?:tpPct|targetPct|takePct)\s*=\s*input\.float\(\s*(\d+(?:\.\d+)?)/.exec(s);
    if (sp) parts.push(`stop ${+sp[1] < 1 && /\(1\s*-/.test(sp[0]) ? +(sp[1] * 100).toFixed(2) : sp[1]}%`); if (tp) parts.push(`target ${tp[1]}%`);
    return { text: (ent === 'short' ? 'short when ' : 'buy when ') + parts.join(' and '), rules: parts.length };
  };
  V.diagnostics = (r) => {
    const x = r || {}, checks = x.checks || [], fails = checks.filter((c) => c.status !== 'pass'), pc0 = x.pine || null;
    const lines = [`[ExTerm 17-test validation · ${x.name || 'strategy'} · ${x.sym || ''} ${x.tf || ''}]`, `grade ${x.grade || '?'} · ${checks.filter((c) => c.status === 'pass').length}/${checks.length || 17} gates passed`];
    if (pc0) lines.push('Pine safety: ' + pc0.rows.map((q) => `${q.ok ? 'OK' : 'MISSING'} ${q.k}`).join(' · '));
    for (const c of fails) lines.push(`${c.status === 'fail' ? 'FAIL' : 'WARN'} · ${c.name}: got ${c.value != null ? c.value : '–'}; rule ${c.rule || '–'}${c.why ? ' (' + String(c.why).slice(0, 140) + ')' : ''}`);
    lines.push('Refine the Pine v5 script to fix the failures above. Keep barstate.isconfirmed, lookahead_off, $ risk sizing, strategy.exit stop and max_intraday_loss. Do not curve-fit: change logic, not magic numbers.');
    return lines.join('\n');
  };

  /* ══ 7. deterministic AI / bot firewall ══ */
  V.GUARD_DEF = () => ({ mandatorySL: true, minAtr: 1.0, depthMult: 0, threshold: 60, cutAfter: 0, cutPct: 50, shadow: false, route: 'ghost', slot: 1, riskUsd: 100 });
  V.GUARD_AI = () => ({ mandatorySL: true, minAtr: 1.5, depthMult: 3, threshold: 75, cutAfter: 2, cutPct: 50, shadow: true, route: 'ghost', slot: 1, riskUsd: 100 });
  V.lossStreak = (pnls) => { let n = 0; for (let i = (pnls || []).length - 1; i >= 0; i--) { if (pnls[i] < 0) n++; else break; } return n; };
  V.firewall = (p, ctx, g) => {
    const G = Object.assign(V.GUARD_DEF(), g || {}), C = ctx || {}, I = V.normIdea(p) || {}, why = [], d = I.side === 'short' ? -1 : 1;
    if (!I.symbol || !/^[A-Za-z0-9:$._/-]{1,140}$/.test(I.symbol)) why.push('bad or missing symbol');
    if (!I.side) why.push('side must be long / short / buy / sell');
    if (!(I.entry > 0)) why.push('entry price missing');
    if (!(I.stop_loss > 0)) { if (G.mandatorySL) why.push('stop_loss missing (Mandatory Stop-Loss is ON)'); }
    else if (I.entry > 0 && (I.stop_loss - I.entry) * d >= 0) why.push(d > 0 ? 'wrong-way stop: long stop_loss must be below entry' : 'wrong-way stop: short stop_loss must be above entry');
    for (const t of I.tp || []) if (I.entry > 0 && (t - I.entry) * d <= 0) why.push('take-profit on the losing side of entry');
    if (why.length) return { ok: false, route: 'reject', reasons: why, idea: I };
    const risk = I.stop_loss > 0 ? Math.abs(I.entry - I.stop_loss) : 0, atrs = C.atr > 0 && risk > 0 ? risk / C.atr : null;
    if (G.minAtr > 0 && atrs != null && atrs < G.minAtr) return { ok: false, route: 'reject', reasons: [`stop ${atrs.toFixed(2)} ATR away < min ${G.minAtr} ATR`], idea: I, atrs };
    let riskUsd = G.riskUsd > 0 ? G.riskUsd : 100; const notes = [];
    const streak = V.lossStreak(C.pnls); if (G.cutAfter > 0 && streak >= G.cutAfter) { riskUsd *= 1 - G.cutPct / 100; notes.push(`${streak} losses in a row: size cut ${G.cutPct}%`); }
    const qty = risk > 0 ? riskUsd / risk : 0, notional = qty * I.entry;
    if (G.depthMult > 0 && C.depth > 0 && C.depth < G.depthMult * notional) return { ok: false, route: 'reject', reasons: [`book depth ${usd(C.depth)} < ${G.depthMult}× order ${usd(notional)}`], idea: I, atrs };
    if (G.depthMult > 0 && !(C.depth > 0)) notes.push('depth unknown: not checked');
    const conf = I.confidence == null ? 0 : I.confidence, rr = (I.tp || []).length ? V.rr(I.side, I.entry, I.stop_loss, I.tp[0]) : null;
    const low = conf < G.threshold, route = low ? (G.shadow ? 'shadow' : 'reject') : (G.route === 'slot' ? 'slot' : 'ghost');
    if (low) notes.push(`confidence ${conf}% < ${G.threshold}% threshold${G.shadow ? ': PAPER shadow slot' : ''}`);
    return { ok: route !== 'reject', route, reasons: low && !G.shadow ? [`confidence ${conf}% < ${G.threshold}% threshold`] : [], notes, idea: I, atrs, riskUsd, qty, notional, rr, slot: Math.max(1, Math.min(6, G.slot | 0 || 1)) };
  };
  /* shadow tracking: has a PAPER shadow idea hit its stop or first target? */
  V.shadowStep = (s, lo, hi) => {
    if (!s || s.done) return s; const d = s.side === 'short' ? -1 : 1, tp = (s.tp || [])[0];
    const hitSl = d > 0 ? lo <= s.stop_loss : hi >= s.stop_loss, hitTp = tp > 0 && (d > 0 ? hi >= tp : lo <= tp);
    if (hitSl) return Object.assign({}, s, { done: true, r: -1, outcome: 'stop' }); if (hitTp) return Object.assign({}, s, { done: true, r: V.rr(s.side, s.entry, s.stop_loss, tp), outcome: 'target' });
    return s;
  };

  /* ══ 8. attribution (Manual vs Quant vs AI Bridge vs Copy) ══ */
  V.srcClass = (src) => { const s = String(src || ''); if (/^ai/.test(s)) return 'ai'; if (/^copy/.test(s)) return 'copy'; if (/^bot:|^quant|^bot$/.test(s)) return 'quant'; return 'manual'; };
  V.attribution = (rows) => {
    const out = {}; for (const k of ['manual', 'quant', 'ai', 'copy']) out[k] = { n: 0, wins: 0, gw: 0, gl: 0, bpsN: 0, bpsS: 0 };
    for (const r of rows || []) { if (!r) continue; const o = out[V.srcClass(r.src)]; if (fin(r.pnl)) { o.n++; if (r.pnl > 0) { o.wins++; o.gw += r.pnl; } else o.gl -= r.pnl; } if (fin(r.bps)) { o.bpsN++; o.bpsS += r.bps; } }
    for (const k in out) { const o = out[k]; o.win = o.n ? (o.wins / o.n) * 100 : 0; o.pf = o.gl > 0 ? o.gw / o.gl : o.gw > 0 ? null : 0; o.bps = o.bpsN ? o.bpsS / o.bpsN : 0; }
    return out;
  };
  V.slipBps = (side, signal, fill) => (signal > 0 && fill > 0 ? ((side === 'short' || side === 'sell' ? signal - fill : fill - signal) / signal) * 1e4 : null);

  /* ══ 9. AI-vetted zero-custody copy engine ══ */
  V.COPY_DEF = () => ({ on: true, vet: false, vetMin: 75, win: 900, minWallets: 2, riskUsd: 100, minAtr: 1.5, stopPct: 0, maxDrift: 2.5, driftAtr: 1.0, shadow: true, exit: 'first', dayCap: 200, muted: {} });
  V.WINDOWS = [[300, '5m'], [900, '15m'], [3600, '1h']];
  V.consensus = (fills, sym, side, now, win, min) => {
    const W = win > 0 ? win : 900, M = Math.max(2, min | 0 || 2), F = (fills || []).filter((x) => x && x.sym === sym && x.side === side && fin(x.ts) && now - x.ts <= W && x.ts <= now + 5 && x.price > 0);
    const by = new Map(); for (const x of F) if (!by.has(x.addr) || by.get(x.addr).ts < x.ts) by.set(x.addr, x);
    const L = [...by.values()]; if (L.length < M) return { fire: false, wallets: L.map((x) => x.addr), n: L.length };
    const px = L.reduce((s, x) => s + x.price, 0) / L.length, last = L.reduce((a, x) => (x.ts > a.ts ? x : a), L[0]);
    return { fire: true, wallets: L.map((x) => x.addr), n: L.length, leaderPx: px, lastPx: last.price, ts: last.ts };
  };
  V.drift = (side, leaderPx, price, maxPct, atr, atrMult) => {
    if (!(leaderPx > 0) || !(price > 0)) return { ok: false, why: 'no leader fill or live price' };
    const d = side === 'short' ? -1 : 1, mv = ((price - leaderPx) / leaderPx) * 100 * d, atrs = atr > 0 ? ((price - leaderPx) * d) / atr : null;
    if (mv > maxPct) return { ok: false, pct: mv, atrs, why: `price already moved ${mv.toFixed(2)}% past the leader fill (max ${maxPct}%)` };
    if (atrMult > 0 && atrs != null && atrs > atrMult) return { ok: false, pct: mv, atrs, why: `price already ${atrs.toFixed(2)} ATR past the leader fill (max ${atrMult} ATR)` };
    return { ok: true, pct: mv, atrs };
  };
  V.copyPlan = (side, entry, atr, riskUsd, minAtr, stopPct) => {
    if (!(entry > 0)) return null; const d = side === 'short' ? -1 : 1, distA = atr > 0 ? (minAtr || 1.5) * atr : 0, distP = stopPct > 0 ? entry * stopPct / 100 : 0, dist = Math.max(distA, distP, entry * 0.002);
    const stop = entry - d * dist, qty = (riskUsd > 0 ? riskUsd : 100) / dist;
    return { side, entry, stop: sig(stop), tp: [1, 2, 3].map((k) => sig(entry + d * k * dist)), qty, usd: qty * entry, risk: riskUsd > 0 ? riskUsd : 100, dist };
  };
  V.dayPnl = (rows, addr, now) => { const day = Math.floor(now / 86400); return (rows || []).filter((r) => r && r.leader === addr && fin(r.pnl) && Math.floor(r.ts / 86400) === day).reduce((s, r) => s + r.pnl, 0); };
  V.vetOk = (cfg, vet) => { if (!cfg || !cfg.vet) return { ok: true }; if (!vet) return { ok: false, why: 'AI vetting gate is ON: no AI approval for this wallet yet' }; if (!vet.approve) return { ok: false, why: 'AI vetting rejected this wallet' }; return vet.confidence >= (cfg.vetMin || 75) ? { ok: true } : { ok: false, why: `AI confidence ${vet.confidence}% < ${cfg.vetMin || 75}%` }; };
  V.copyDecide = (o) => {
    const c = Object.assign(V.COPY_DEF(), o.cfg || {}), now = o.now, cons = V.consensus(o.fills, o.sym, o.side, now, c.win, c.minWallets);
    if (!cons.fire) return { act: 'wait', why: `${cons.n}/${Math.max(2, c.minWallets)} wallets within ${c.win / 60}m`, cons };
    const muted = cons.wallets.filter((a) => c.muted && c.muted[a] === Math.floor(now / 86400)); if (muted.length && cons.n - muted.length < Math.max(2, c.minWallets)) return { act: 'block', status: 'muted', why: 'leader muted for today (daily loss cap)', cons };
    for (const a of cons.wallets) { const v = V.vetOk(c, (o.vets || {})[a]); if (!v.ok) return { act: 'block', status: 'vet', why: v.why, cons }; }
    const dr = V.drift(o.side, cons.leaderPx, o.price, c.maxDrift, o.atr, c.driftAtr); if (!dr.ok) return { act: 'block', status: 'drift', why: 'Anti-Front-Run Drift Shield: ' + dr.why, cons, drift: dr };
    const plan = V.copyPlan(o.side, o.price, o.atr, c.riskUsd, c.minAtr, c.stopPct);
    return { act: c.shadow ? 'shadow' : 'copy', cons, drift: dr, plan, exit: c.exit };
  };
  V.EXITS = [['mirror', 'Mirror Leader Exit'], ['independent', 'Independent ExTerm Trailing/TP Exit'], ['first', 'Whichever Triggers First']];
  V.exitNow = (mode, leaderExited, ownHit) => (mode === 'mirror' ? !!leaderExited : mode === 'independent' ? !!ownHit : !!(leaderExited || ownHit));
  V.walletPacket = (w, mode) => {
    const x = w || {}, s = x.stats || {};
    const lines = [`[ExTerm wallet profile · ${x.short || 'wallet'}]`, `style ${x.tag || 'n/a'} · alpha ${x.alpha != null ? f(x.alpha) : 'n/a'} · win ${s.win != null ? f(s.win * (s.win <= 1 ? 100 : 1)) + '%' : 'n/a'} · trades ${s.n || 0} · avg hold ${s.hold || 'n/a'}`, `open positions: ${(x.positions || []).slice(0, mode === 'full' ? 8 : 3).map((p) => `${p.coin} ${p.side} ${usd(p.ntl)}`).join(', ') || 'none'}`];
    if (mode === 'full') lines.push(`flags: ${(x.flags || []).join(', ') || 'none'}`);
    lines.push('Reply JSON only: {"kind":"wallet_vet","wallet":"<address>","approve":true|false,"confidence":0-100,"reason":"..."}');
    return lines.join('\n');
  };

  /* ══ 10. share card (masked) + shareable JSON ══ */
  const PRIVATE = /balance|equity|cash|account|acct|email|user(name)?|wallet|addr|key|secret|token|qty|size|usd|pnl\$|name/i;
  V.cardModel = (s) => {
    const x = s || {}, m = { brand: 'ExTerm', sym: clip(String(x.sym || '').replace(/^oc:[^:]+:/, ''), 24), tf: clip(x.tf || '', 6), side: x.side === 'short' ? 'SHORT' : 'LONG', source: clip(x.source || 'Manual', 28), entry: sig(+x.entry), sl: sig(+x.sl), tp: (x.tp || []).map((t) => sig(+t)).filter((t) => t > 0).slice(0, 3), rr: x.rr != null ? r2(+x.rr) : V.rr(x.side, +x.entry, +x.sl, (x.tp || [])[0]) != null ? r2(V.rr(x.side, +x.entry, +x.sl, (x.tp || [])[0])) : null, masked: 'Balances & personal data masked' };
    m.lines = [`${m.sym} · ${m.tf} · ${m.side}`, `R:R ${m.rr != null ? m.rr.toFixed(2) : '–'} · ${m.source}`, `Entry ${m.entry ?? '–'}`, `Stop ${m.sl ?? '–'}`].concat(m.tp.map((t, i) => `TP${i + 1} ${t}`)).concat([m.masked]);
    return m;
  };
  V.cardLeaks = (texts, secrets) => (texts || []).filter((t) => (secrets || []).some((sx) => sx && String(t).includes(String(sx))));
  V.PRIVATE_RX = PRIVATE;
  V.shareJSON = (o) => {
    const x = o || {}, passed = x.passed | 0, total = x.total | 0 || 17;
    const out = { exterm: '16.5', kind: x.spec ? 'strategy' : 'watchlist', label: `Validated in ExTerm (${passed}/${total} Gates Passed)`, grade: x.grade || null, created: x.ts ? new Date(x.ts).toISOString().slice(0, 10) : null };
    if (x.spec) out.spec = x.spec; if (x.watchlist) out.watchlist = (x.watchlist || []).filter((s) => typeof s === 'string' && s.length < 140).slice(0, 50);
    return JSON.stringify(out, null, 2);
  };

  /* ══ 11. ~45-line local Python starter templates (keys + funds stay with you; ExTerm only sees a proposal) ══ */
  const POST = `def post_to_exterm(idea):
    """Send one proposal to ExTerm's 127.0.0.1 firewall. It never reaches an exchange from here."""
    req = urllib.request.Request(EXTERM + "/llm-signal", data=json.dumps(idea).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-ExTerm-Bridge": BRIDGE_KEY})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:  # 422 = rejected by the firewall (no stop, wrong-way stop, ...)
        return json.loads(e.read() or b"{}")
`;
  const HEAD = (title, extra) => `#!/usr/bin/env python3
# ${title} -> ExTerm AI Bridge (127.0.0.1). Standard library only. Your exchange keys and funds never touch the AI or ExTerm.
import json, os, pathlib, re, sys, urllib.error, urllib.request
EXTERM = os.environ.get("EXTERM_URL", "http://127.0.0.1:8765")
KEYFILE = pathlib.Path.home() / ".exterm" / "bridge.key"
BRIDGE_KEY = os.environ.get("EXTERM_BRIDGE_KEY") or (KEYFILE.read_text().strip() if KEYFILE.exists() else "")
${extra}
PROMPT = """You are a disciplined trading assistant. Use ONLY the ExTerm context below.
Reply with one JSON object: {"symbol","side":"long|short","entry","stop_loss","tp":[...],"confidence":0-100,"reason"}.
stop_loss is mandatory and must sit on the losing side of entry, at least 1.5 ATR away.
"""
`;
  const TAIL = (fn) => `
${POST}
def main():
    context = sys.stdin.read() if not sys.stdin.isatty() else input("Paste an ExTerm context packet, then Enter: ")
    text = ${fn}(PROMPT + "\\n" + context)
    m = re.search(r"\\{.*\\}", text, re.S)
    if not m:
        sys.exit("The model returned no JSON proposal: nothing sent.")
    idea = json.loads(m.group(0))
    idea["source"] = SOURCE
    print(json.dumps(post_to_exterm(idea), indent=2))

if __name__ == "__main__":
    main()
`;
  V.TEMPLATES = {
    grok: HEAD('Grok (xAI)', 'XAI_KEY = os.environ.get("XAI_API_KEY", "")\nMODEL = os.environ.get("XAI_MODEL", "grok-4")\nSOURCE = "grok"') + `
def ask_model(prompt):
    body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.2}
    req = urllib.request.Request("https://api.x.ai/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + XAI_KEY})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]
` + TAIL('ask_model'),
    cloud: HEAD('ChatGPT / Claude / DeepSeek', 'PROVIDER = os.environ.get("AI_PROVIDER", "openai")  # openai | anthropic | deepseek\nAPI_KEY = os.environ.get("AI_API_KEY", "")\nMODEL = os.environ.get("AI_MODEL", {"openai": "gpt-5", "anthropic": "claude-sonnet-5-5", "deepseek": "deepseek-chat"}.get(PROVIDER, "gpt-5"))\nSOURCE = PROVIDER') + `
def ask_model(prompt):
    if PROVIDER == "anthropic":
        url, hdr = "https://api.anthropic.com/v1/messages", {"x-api-key": API_KEY, "anthropic-version": "2023-06-01"}
        body = {"model": MODEL, "max_tokens": 800, "messages": [{"role": "user", "content": prompt}]}
    else:
        base = "https://api.deepseek.com" if PROVIDER == "deepseek" else "https://api.openai.com/v1"
        url, hdr = base + "/chat/completions", {"Authorization": "Bearer " + API_KEY}
        body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}]}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers=dict(hdr, **{"Content-Type": "application/json"}))
    with urllib.request.urlopen(req, timeout=90) as r:
        j = json.loads(r.read())
    return j["content"][0]["text"] if PROVIDER == "anthropic" else j["choices"][0]["message"]["content"]
` + TAIL('ask_model'),
    ollama: HEAD('100% offline local Ollama', 'OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")\nMODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")\nSOURCE = "ollama"') + `
def ask_model(prompt):
    body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}], "format": "json", "stream": False}
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:  # no internet needed: model + ExTerm both on this computer
        return json.loads(r.read())["message"]["content"]
` + TAIL('ask_model'),
  };
  V.TEMPLATE_NAMES = [['grok', 'Grok xAI'], ['cloud', 'ChatGPT / Claude / DeepSeek'], ['ollama', '100% Offline Local Ollama']];

  V.HIGHLIGHTS = [
    'AI Bridge tab: one-click context packets for Grok, ChatGPT, Claude, DeepSeek, Local Ollama or any custom bot (Token-Saver ≈ 120 tokens or Full Quant)',
    'Paste any AI trade idea (plain English or JSON): directional stop + ATR check, dashed ghost lines with live R:R and $ badges on the chart',
    'AI ticker / contract paste-box with a $50k liquidity and mint-authority screen, Pine v5 hardening + 17-test gate + failure diagnostics for any AI',
    '127.0.0.1/llm-signal firewall for local AIs and bots: mandatory stop, min 1.5 ATR, depth check, confidence threshold → PAPER shadow slot, loss-streak size cut',
    'AI-vetted zero-custody copy-trading (consensus, drift shield, $ risk + ATR stop, TP1–TP3, exit modes), Human vs. AI attribution and a masked Share Setup Card',
    'Still here from v16.4 / v16.3: DEX Discovery, anchored VWAP, the Floating Live Execution HUD, two-way ACK + fill sync with IBKR / Alpaca / CCXT / Freqtrade bridges, Require Stop-Loss ON and Two-Key Arming',
  ];
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V165;
