/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v18.1 pure core (no DOM): the canonical symbol / contract normalizer shared by every tab → chart handoff, the Lane 9 / 10
   routing, the 1s / 5s / 15s synthesis from 1m OHLCV + the live spot, the instant-hydration cache policy and the cross-lane
   pre-warm picker. Two-signal palette: Bullion Gold #F5C84B (live / pass) and Crimson #EF4444 (alert / fail). */
const V181 = (() => {
  const V = {};
  V.VER = '18.1'; V.GOLD = '#F5C84B'; V.RED = '#EF4444';
  V.WARM_MS = 25; V.COLD_MS = 250; V.HEDGE_MS = 60; V.MAX_AGE = 15 * 60e3; V.REFRESH_AGE = 5e3; V.WARM_TTL = 60e3; V.RETRY_MS = 8e3;
  V.WARM_TFS = ['1m', '5m', '1h', '1d']; // pre-warmed per surfaced symbol (1s / 5s / 15s are synthesized from 1m on the client)

  /* ══ 1. canonical symbols ══ */
  /* any spelling of a chain → its GeckoTerminal network id (the page's oc:<network>:<pool> form) */
  V.CHAIN = {
    eth: 'eth', ethereum: 'eth', ether: 'eth', erc20: 'eth', mainnet: 'eth', sol: 'solana', solana: 'solana', base: 'base',
    arb: 'arbitrum', arbitrum: 'arbitrum', arbitrum_one: 'arbitrum', 'arbitrum-one': 'arbitrum', bsc: 'bsc', bnb: 'bsc', binance: 'bsc',
    polygon: 'polygon_pos', polygon_pos: 'polygon_pos', matic: 'polygon_pos', avax: 'avax', avalanche: 'avax', op: 'optimism', optimism: 'optimism', sim: 'sim',
  };
  /* GeckoTerminal network id → DexScreener chain id */
  V.DS = { eth: 'ethereum', solana: 'solana', base: 'base', arbitrum: 'arbitrum', bsc: 'bsc', polygon_pos: 'polygon', avax: 'avalanche', optimism: 'optimism' };
  /* bare tickers that are crypto, not US equities (BTC → BTC-USD, NVDA stays NVDA) */
  V.CRYPTO = new Set(('BTC ETH SOL XRP DOGE AVAX LINK SUI HYPE ADA DOT LTC BCH TRX TON NEAR ATOM UNI AAVE ARB OP PEPE SHIB BONK WIF ' +
    'POL MATIC FIL ICP ETC XLM HBAR INJ SEI TIA JUP RNDR RENDER FET ONDO ENA WLD IMX MKR LDO CRV GRT ALGO XTZ EOS SAND MANA ' +
    'FLOKI TAO KAS JTO PYTH TRUMP USDC USDT DAI').split(' '));
  const EVM = /^0x[0-9a-fA-F]{40}$/, EVM64 = /^0x[0-9a-fA-F]{64}$/, B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, ADDR = /^[A-Za-z0-9_.-]{3,90}$/;
  const PAIR = /^([A-Z0-9]{2,12})(?:[-/_ ](USD|USDT|USDC|EUR|PERP)|(USDT|USDC|PERP))$/, TICK = /^\^?[A-Z][A-Z0-9.^=-]{0,10}$/;
  const chainOf = (c) => { const k = String(c || '').toLowerCase(); return V.CHAIN[k] || (/^[a-z0-9_-]{2,20}$/.test(k) ? k : null); };
  const addrOf = (a) => (EVM.test(a) || EVM64.test(a) ? a.toLowerCase() : a);
  const oc = (chain, addr, extra) => Object.assign({ sym: 'oc:' + chain + ':' + addr, kind: 'onchain', chain, addr }, extra || {});
  /* text from any tab, URL or paste → { sym, kind: crypto | stock | onchain | ca, chain?, addr?, guess? } or null.
     kind 'ca' = a raw contract with no pool yet: sym is the best guess (0x… → eth, Base58 → solana) until Lane 9 resolves the pool */
  V.norm = (q, isKnownStock) => {
    let s = String(q == null ? '' : q).trim().replace(/^\$/, ''); if (!s || s.length > 200) return null;
    let m = /^https?:\/\/(?:www\.)?(?:dexscreener\.com|geckoterminal\.com)\/([a-z0-9_-]{2,20})\/(?:pools\/)?([A-Za-z0-9]{20,90})/i.exec(s);
    if (m) { const c = chainOf(m[1]); return c ? oc(c, addrOf(m[2])) : null; }
    m = /^oc:([^:\s]{2,20}):([^:\s]{3,90})$/i.exec(s);
    if (m) { const c = chainOf(m[1]); return c && ADDR.test(m[2]) ? oc(c, addrOf(m[2])) : null; }
    if (EVM.test(s) || EVM64.test(s)) return oc('eth', s.toLowerCase(), { kind: 'ca', guess: true });
    if (B58.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s)) return oc('solana', s, { kind: 'ca', guess: true });
    const u = s.toUpperCase(); // a space only ever separates base / quote ("BTC USD"); free text is not a ticker
    m = PAIR.exec(u);
    if (m) { const base = m[1], qt = m[2] || m[3]; return { sym: base + '-' + (qt === 'EUR' ? 'EUR' : 'USD'), kind: 'crypto' }; }
    m = /^([A-Z0-9]{2,12})USD$/.exec(u); if (m && V.CRYPTO.has(m[1])) return { sym: m[1] + '-USD', kind: 'crypto' };
    if (V.CRYPTO.has(u) && !(isKnownStock && isKnownStock(u))) return { sym: u + '-USD', kind: 'crypto' }; // a listed stock keeps its ticker
    if (TICK.test(u)) return { sym: u, kind: 'stock' };
    return null;
  };
  V.canon = (q) => { const n = V.norm(q); return n ? n.sym : q; };
  V.modeOf = (n) => (!n ? null : n.kind === 'stock' ? 'stocks' : n.kind === 'crypto' ? 'crypto' : 'onchain');
  V.isOnchain = (sym) => /^oc:/.test(sym || '');
  V.isStock = (sym) => !!sym && !V.isOnchain(sym) && !/-(USD|USDT|USDC|EUR)$/.test(sym);
  /* Lane 9 = crypto + DEX (1s–1M), Lane 10 = US equities (1m–1M; seconds bars come from the tick feed / synthesis) */
  V.lane = (sym, sec) => (V.isStock(sym) ? (sec >= 60 ? 10 : null) : 9);

  /* ══ 2. 1s / 5s / 15s synthesis from 1m OHLCV + the live spot ══
     Each 1m bar is walked o → l → h → c (up bar) or o → h → l → c (down bar) and cut into 60 / tf pieces, so the pieces of one
     minute aggregate back to exactly its open, high, low, close and volume. The forming minute is bridged from the last close to
     the live spot. Bars are marked syn: 1 and replaced by real tick / trade bars as they arrive. */
  const walk = (b) => (b.c >= b.o ? [b.o, b.l, b.h, b.c] : [b.o, b.h, b.l, b.c]);
  const at = (P, x) => { const f = Math.min(2.999999, Math.max(0, x * 3)), i = Math.floor(f); return P[i] + (P[i + 1] - P[i]) * (f - i); };
  V.splitMinute = (b, tf) => {
    const k = Math.max(1, Math.round(60 / tf)), P = walk(b), out = [];
    for (let i = 0; i < k; i++) {
      const x0 = i / k, x1 = (i + 1) / k, o = i === 0 ? b.o : at(P, x0), c = i === k - 1 ? b.c : at(P, x1); let h = Math.max(o, c), l = Math.min(o, c);
      for (const v of [1 / 3, 2 / 3]) if (v > x0 - 1e-12 && v < x1 + 1e-12) { const p = P[Math.round(v * 3)]; if (p > h) h = p; if (p < l) l = p; }
      out.push({ t: b.t + i * tf, o, h, l, c, v: (b.v || 0) / k, syn: 1 });
    }
    return out;
  };
  V.synthSub = (m1, tf, n, spot, nowSec) => {
    n = n || 300; const now = Math.floor((nowSec || Date.now() / 1000) / tf) * tf, need = Math.ceil((n * tf) / 60) + 2;
    const mins = (m1 || []).filter((b) => b && b.c > 0 && b.o > 0 && b.t < now + tf).slice(-need), rows = [];
    for (const b of mins) for (const r of V.splitMinute(b, tf)) if (r.t <= now) rows.push(r);
    let last = rows.length ? rows[rows.length - 1].c : spot > 0 ? spot : 0; if (!(last > 0)) return [];
    const target = spot > 0 ? spot : last, t0 = rows.length ? rows[rows.length - 1].t + tf : now - (n - 1) * tf, steps = Math.max(1, Math.floor((now - t0) / tf) + 1);
    for (let t = t0, i = 1; t <= now && rows.length < 20000; t += tf, i++) { const c = i >= steps ? target : last + ((target - last) * i) / steps, o = rows.length ? rows[rows.length - 1].c : c; rows.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 0, syn: 1 }); }
    const L = rows[rows.length - 1]; if (spot > 0 && L && L.t === now) { L.c = spot; if (spot > L.h) L.h = spot; if (spot < L.l) L.l = spot; } // the forming bar ends on the live quote
    return rows.slice(-n);
  };
  /* exact OHLCV re-aggregation (test helper + sanity check) */
  V.agg = (rows, sec) => { const m = new Map(); for (const r of rows) { const b = Math.floor(r.t / sec) * sec, k = m.get(b); if (!k) m.set(b, { t: b, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0 }); else { k.h = Math.max(k.h, r.h); k.l = Math.min(k.l, r.l); k.c = r.c; k.v += r.v || 0; } } return [...m.values()].sort((a, b) => a.t - b.t); };

  /* ══ 3. instant-hydration cache policy ══ */
  /* lane answers are cached per sym|sec; offline samples are only ever used for DEX pools (the crypto / stock demo feeds already
     answer instantly offline, and a live launcher never returns samples) */
  V.usable = (e, now, allowSample) => !!e && Array.isArray(e.rows) && e.rows.length >= 2 && now - e.at < V.MAX_AGE && (!e.sample || !!allowSample);
  V.instantOk = (n) => !n || n <= 400; // deep 5,000-bar backfills always go to the paginating loader
  V.lagMs = (opens) => { const a = (opens || []).filter((x) => x >= 0).sort((p, q) => p - q); return a.length ? { n: a.length, p50: a[Math.floor((a.length - 1) / 2)], max: a[a.length - 1] } : { n: 0, p50: null, max: null }; };

  /* ══ 4. cross-lane pre-warm picker ══ */
  /* symbols surfaced by the Bot Radar (Lanes 5 / 7), Alpha Recs / Picks (Lanes 11–16) and the Tracker → canonical, de-duplicated,
     simulated pools and recently warmed symbols skipped, newest first, capped per round */
  V.pickWarm = (list, warmed, now, max) => {
    const out = [], seen = new Set();
    for (const raw of list || []) {
      const n = V.norm(raw); if (!n || n.kind === 'ca' || /^oc:sim:/.test(n.sym) || seen.has(n.sym)) continue; seen.add(n.sym);
      const w = warmed && warmed.get(n.sym); if (w && now - w.at < (w.ok ? V.WARM_TTL : V.RETRY_MS)) continue;
      out.push(n.sym); if (out.length >= (max || 8)) break;
    }
    return out;
  };
  return V;
})();
if (typeof module !== 'undefined') module.exports = V181;
