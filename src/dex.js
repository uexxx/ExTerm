/* ExTerm On-chain mode — DEX tokens & pools.
   Candles, trades, trending & new pools: GeckoTerminal public API (no key, ~30 req/min).
   Search by name / contract address and live prices: DexScreener public API (no key).
   Symbols look like  oc:<network>:<poolAddress>  e.g. oc:solana:8sLb…  — the pool is what trades, so it is the symbol. */
const OC = (() => {
  const GT = 'https://api.geckoterminal.com/api/v2', DS = 'https://api.dexscreener.com';
  const O = {
    id: 'onchain', name: 'GeckoTerminal · DexScreener', meta: {}, stats: {}, lists: {}, sim: false, err: null,
    subs: new Set(), timer: null, tradeT: null, seenTx: new Set(), lastTrades: {}, chain: 'solana', ts: 0, polled: 0,
  };
  // GeckoTerminal network id -> [label, DexScreener chainId, explorer]
  const CHAINS = {
    solana: ['Solana', 'solana', 'https://solscan.io/account/'],
    eth: ['Ethereum', 'ethereum', 'https://etherscan.io/address/'],
    base: ['Base', 'base', 'https://basescan.org/address/'],
    bsc: ['BNB Chain', 'bsc', 'https://bscscan.com/address/'],
    arbitrum: ['Arbitrum', 'arbitrum', 'https://arbiscan.io/address/'],
  };
  const DS2GT = Object.fromEntries(Object.entries(CHAINS).map(([g, v]) => [v[1], g]));
  O.CHAINS = CHAINS;
  const RX = /^oc:([a-z0-9_-]{2,20}):([A-Za-z0-9]{6,90})$/;
  const txt = (s, n) => (s == null ? '' : String(s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩<>"'`&]/g, '').trim().slice(0, n));
  const img = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } };
  const num = (v) => { const n = +v; return isFinite(n) ? n : null; };

  O.is = (s) => typeof s === 'string' && RX.test(s);
  O.make = (chain, pool) => { const s = 'oc:' + chain + ':' + pool; return RX.test(s) ? s : null; };
  O.parse = (s) => { const m = RX.exec(s || ''); return m ? { chain: m[1], pool: m[2] } : null; };
  O.label = (s) => { const m = O.meta[s]; if (m && m.s) return m.s; const p = O.parse(s); return p ? p.pool.slice(0, 4) + '…' + p.pool.slice(-4) : String(s); };
  O.title = (s) => { const m = O.meta[s], p = O.parse(s); return (m && m.s ? m.s + (m.q ? ' / ' + m.q : '') : O.label(s)) + (p && CHAINS[p.chain] ? ' · ' + CHAINS[p.chain][0] : p && p.chain === 'sim' ? ' · simulated' : ''); };
  O.links = (s) => {
    const p = O.parse(s), m = O.meta[s] || {}; if (!p || p.chain === 'sim') return [];
    const c = CHAINS[p.chain]; if (!c) return [];
    return [['DexScreener', 'https://dexscreener.com/' + c[1] + '/' + p.pool], ['GeckoTerminal', 'https://www.geckoterminal.com/' + p.chain + '/pools/' + p.pool], m.ca ? ['Explorer', c[2] + m.ca] : null].filter(Boolean);
  };

  /* ---------- token registry (survives reloads so watchlist names stay readable) ---------- */
  const LS = 'nt.ocmeta';
  try { const j = JSON.parse(localStorage.getItem(LS) || '{}'); for (const [k, v] of Object.entries(j)) if (RX.test(k) && v && typeof v === 'object') O.meta[k] = { s: txt(v.s, 16), n: txt(v.n, 48), q: txt(v.q, 10), ca: /^[A-Za-z0-9]{20,90}$/.test(v.ca || '') ? v.ca : '', img: img(v.img), dex: txt(v.dex, 24) }; } catch (e) { /* storage unavailable */ }
  let saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { const keys = Object.keys(O.meta).slice(-400), o = {}; for (const k of keys) o[k] = O.meta[k]; localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* quota */ } }, 400); };
  O.register = (sym, m, st) => {
    if (!RX.test(sym)) return null;
    const cur = O.meta[sym] || {};
    O.meta[sym] = {
      s: txt(m.s, 16) || cur.s || '', n: txt(m.n, 48) || cur.n || '', q: txt(m.q, 10) || cur.q || '',
      ca: /^[A-Za-z0-9]{20,90}$/.test(m.ca || '') ? m.ca : cur.ca || '', img: img(m.img) || cur.img || '', dex: txt(m.dex, 24) || cur.dex || '',
    };
    if (st) O.stats[sym] = Object.assign(O.stats[sym] || {}, st, { ts: Date.now() });
    persist(); return sym;
  };

  /* ---------- GeckoTerminal politeness (v13.1) ----------
     The free API allows about 30 calls a minute per IP, shared by every open ExTerm tab. So:
     · a token bucket that starts below the limit and slows itself down after any 429,
     · a response cache + de-duplication of identical in-flight requests (the radar, heat map, token card and charts
       often ask for the same thing),
     · a shared cool-down after a 429 (all tabs, via localStorage) and one automatic retry after it,
     · a short, readable error instead of the raw API message. */
  const bucket = { t: 3, last: Date.now() }; const CAP = 3; O.rpm = 20; O.rpmMax = 20;
  const cache = new Map(), inflight = new Map(), COOL_KEY = 'nt.gtCool';
  const ttlFor = (p) => (/\/info$|\/tokens\/[^/]+\/pools/.test(p) ? 600e3 : /new_pools|trending_pools/.test(p) ? 45e3 : /\/ohlcv\//.test(p) ? 20e3 : 15e3);
  const coolUntil = () => { let v = O._cool || 0; try { v = Math.max(v, +localStorage.getItem(COOL_KEY) || 0); } catch (e) { /* storage blocked */ } return v; };
  const setCool = (ms) => { O._cool = Date.now() + ms; try { localStorage.setItem(COOL_KEY, String(O._cool)); } catch (e) { /* storage blocked */ } };
  O.gtCoolLeft = () => Math.max(0, coolUntil() - Date.now());
  setInterval(() => { if (O.rpm < O.rpmMax && !O.gtCoolLeft()) O.rpm = Math.min(O.rpmMax, O.rpm + 2); }, 60000); // recover slowly
  const rateErr = (left) => { const e = new Error(`GeckoTerminal's free limit was reached, so new data pauses for ${Math.ceil(left / 1000)}s (showing the last data meanwhile)`); e.rate = true; e.retryIn = left; return e; };
  async function take() {
    for (;;) {
      const now = Date.now(), RATE = O.rpm / 60000; bucket.t = Math.min(CAP, bucket.t + (now - bucket.last) * RATE); bucket.last = now;
      if (bucket.t >= 1) { bucket.t -= 1; return; }
      await sleep(Math.ceil((1 - bucket.t) / RATE) + 30);
    }
  }
  async function gt(path, timeout, o = {}) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.ts < (o.ttl || ttlFor(path))) return hit.v;
    if (inflight.has(path)) return inflight.get(path);
    const job = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const left = O.gtCoolLeft();
        if (left) { if (attempt || left > 20000 || o.noWait) { if (hit) return hit.v; throw rateErr(left); } await sleep(left + 250); } // short cool-downs: wait it out
        await take();
        try { const v = await J.get(GT + path, { timeout: timeout || 12000 }); cache.set(path, { v, ts: Date.now() }); if (cache.size > 300) cache.delete(cache.keys().next().value); return v; }
        catch (e) {
          if (!/HTTP 429|rate limit/i.test(String(e.message))) throw e;
          O.rpm = Math.max(6, Math.floor(O.rpm * 0.6)); setCool(attempt ? 90000 : 30000); O.rateHits = (O.rateHits || 0) + 1;
          if (attempt) { if (hit) return hit.v; throw rateErr(O.gtCoolLeft()); }
        }
      }
      if (hit) return hit.v;
      throw rateErr(O.gtCoolLeft());
    })();
    inflight.set(path, job);
    try { return await job; } finally { inflight.delete(path); }
  }
  O._gt = gt; O._gtCache = cache;

  /* ---------- parsing ---------- */
  function fromGtPools(r, chain) {
    const inc = {}; for (const x of (r && r.included) || []) inc[x.id] = x.attributes || {};
    const out = [];
    for (const d of (r && r.data) || []) {
      const a = d.attributes || {}, rel = d.relationships || {};
      const net = chain || String(d.id || '').split('_')[0];
      const sym = O.make(net, a.address); if (!sym) continue;
      const bt = inc[(rel.base_token && rel.base_token.data && rel.base_token.data.id) || ''] || {};
      const qt = inc[(rel.quote_token && rel.quote_token.data && rel.quote_token.data.id) || ''] || {};
      const nm = String(a.name || ''), parts = nm.split(' / ');
      const pc = a.price_change_percentage || {}, tx = a.transactions || {}, vu = a.volume_usd || {};
      const st = {
        price: num(a.base_token_price_usd), ch5m: num(pc.m5), ch1h: num(pc.h1), ch6h: num(pc.h6), ch24: num(pc.h24),
        liq: num(a.reserve_in_usd), mcap: num(a.market_cap_usd), fdv: num(a.fdv_usd), vol24: num(vu.h24), vol1h: num(vu.h1),
        buys24: tx.h24 ? +tx.h24.buys || 0 : null, sells24: tx.h24 ? +tx.h24.sells || 0 : null, buyers24: tx.h24 ? +tx.h24.buyers || 0 : null, sellers24: tx.h24 ? +tx.h24.sellers || 0 : null,
        buys1h: tx.h1 ? +tx.h1.buys || 0 : null, sells1h: tx.h1 ? +tx.h1.sells || 0 : null,
        buys15m: tx.m15 ? +tx.m15.buys || 0 : null, sells15m: tx.m15 ? +tx.m15.sells || 0 : null, buys6h: tx.h6 ? +tx.h6.buys || 0 : null, sells6h: tx.h6 ? +tx.h6.sells || 0 : null,
        buys5m: tx.m5 ? +tx.m5.buys || 0 : null, sells5m: tx.m5 ? +tx.m5.sells || 0 : null, buyers1h: tx.h1 ? +tx.h1.buyers || 0 : null, sellers1h: tx.h1 ? +tx.h1.sellers || 0 : null, vol5m: num(vu.m5),
        created: a.pool_created_at ? Date.parse(a.pool_created_at) || null : null,
      };
      O.register(sym, { s: bt.symbol || parts[0], n: bt.name || parts[0], q: qt.symbol || (parts[1] || '').split(' ')[0], ca: bt.address, img: bt.image_url, dex: rel.dex && rel.dex.data && rel.dex.data.id }, st);
      out.push(sym);
    }
    return out;
  }
  function fromDsPairs(pairs) {
    const out = [];
    for (const p of pairs || []) {
      const chain = DS2GT[p.chainId]; if (!chain) continue;
      const sym = O.make(chain, p.pairAddress); if (!sym) continue;
      const pc = p.priceChange || {}, tx = p.txns || {}, vol = p.volume || {};
      const st = {
        price: num(p.priceUsd), ch5m: num(pc.m5), ch1h: num(pc.h1), ch6h: num(pc.h6), ch24: num(pc.h24),
        liq: p.liquidity ? num(p.liquidity.usd) : null, mcap: num(p.marketCap), fdv: num(p.fdv), vol24: num(vol.h24), vol1h: num(vol.h1),
        buys24: tx.h24 ? +tx.h24.buys || 0 : null, sells24: tx.h24 ? +tx.h24.sells || 0 : null, buys1h: tx.h1 ? +tx.h1.buys || 0 : null, sells1h: tx.h1 ? +tx.h1.sells || 0 : null,
        buys5m: tx.m5 ? +tx.m5.buys || 0 : null, sells5m: tx.m5 ? +tx.m5.sells || 0 : null, vol5m: num(vol.m5), buys6h: tx.h6 ? +tx.h6.buys || 0 : null, sells6h: tx.h6 ? +tx.h6.sells || 0 : null,
        created: num(p.pairCreatedAt),
      };
      if (p.info) O.setSocial(sym, p.info.websites, p.info.socials);
      O.register(sym, { s: p.baseToken && p.baseToken.symbol, n: p.baseToken && p.baseToken.name, q: p.quoteToken && p.quoteToken.symbol, ca: p.baseToken && p.baseToken.address, img: p.info && p.info.imageUrl, dex: p.dexId }, st);
      out.push(sym);
    }
    return out;
  }
  O._fromGtPools = fromGtPools; O._fromDsPairs = fromDsPairs;
  // a page of trending / new pools (v13 launch radar wants more than the first 20)
  O.discoverPage = async (kind, chain, page) => {
    if (!CHAINS[chain]) chain = 'solana'; page = Math.max(1, Math.min(5, page | 0));
    const path = kind === 'new' ? `/networks/${chain}/new_pools?include=base_token,quote_token,dex&page=${page}` : `/networks/${chain}/trending_pools?include=base_token,quote_token,dex&page=${page}&duration=24h`;
    try { return fromGtPools(await gt(path), chain); }
    catch (e) { if (kind === 'new' && page === 1) { const syms = await O.dsNew(chain).catch(() => []); if (syms.length) return syms; } throw e; }
  };
  // DexScreener fallback for brand-new tokens (separate, higher rate limit): latest token profiles → their pairs
  O.dsNew = async (chain) => {
    const dsc = (CHAINS[chain] || [])[1]; if (!dsc) return [];
    const prof = await J.get(`${DS}/token-profiles/latest/v1`, { timeout: 10000 });
    const addrs = [...new Set((Array.isArray(prof) ? prof : []).filter((x) => x && x.chainId === dsc && /^[A-Za-z0-9]{20,90}$/.test(x.tokenAddress || '')).map((x) => x.tokenAddress))].slice(0, 30);
    if (!addrs.length) return [];
    const r = await J.get(`${DS}/tokens/v1/${dsc}/${addrs.join(',')}`, { timeout: 12000 });
    const best = new Map(); for (const p of Array.isArray(r) ? r : []) { const a = p && p.baseToken && p.baseToken.address; if (a && (!best.has(a) || ((p.liquidity || {}).usd || 0) > ((best.get(a).liquidity || {}).usd || 0))) best.set(a, p); }
    const syms = fromDsPairs([...best.values()]); O.dsNewTs = Date.now(); return syms;
  };
  /* ---------- token socials / websites (from DexScreener pair info + GeckoTerminal token info) ---------- */
  O.social = {};
  const SOC_TYPES = { twitter: 'X', x: 'X', telegram: 'Telegram', discord: 'Discord', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit', github: 'GitHub', medium: 'Medium', facebook: 'Facebook', warpcast: 'Farcaster' };
  const httpsUrl = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && x.href.length < 300 ? x.href : null; } catch (e) { return null; } };
  O.setSocial = (sym, websites, socials) => {
    const out = [], seen = new Set();
    for (const w of (Array.isArray(websites) ? websites : []).slice(0, 4)) { const u = httpsUrl(w && (w.url || w)); if (u && !seen.has(u)) { seen.add(u); out.push({ t: 'Website', u }); } }
    for (const x of (Array.isArray(socials) ? socials : []).slice(0, 8)) { const ty = String((x && (x.type || x.platform)) || '').toLowerCase(), u = httpsUrl(x && (x.url || x.handle)); if (u && !seen.has(u) && SOC_TYPES[ty]) { seen.add(u); out.push({ t: SOC_TYPES[ty], u }); } }
    if (out.length || !O.social[sym]) O.social[sym] = Object.assign(O.social[sym] || {}, { links: out.slice(0, 10), ts: Date.now() });
    return O.social[sym];
  };

  /* ---------- simulated fallback (no network / opened without the launcher) ---------- */
  const SIM = [['ZAPCAT', 'Zap Cat', 0.0123], ['MOONBEAN', 'Moon Bean', 0.00042], ['GIGAFROG', 'Giga Frog', 0.0000271], ['LUMA', 'Luma', 0.94], ['QUBIT', 'Qubit', 0.071], ['HODLR', 'Hodlr', 0.0038], ['NEBULA', 'Nebula', 2.31], ['WAGMI', 'Wagmi Dog', 0.000913]];
  O.simPx = {};
  function simList() {
    return SIM.map(([s, n, p], i) => {
      const sym = 'oc:sim:' + s + 'SIM' + i; O.simPx[sym] = O.simPx[sym] || p;
      const r = prng(hash(s) ^ Math.floor(Date.now() / 3.6e6));
      O.register(sym, { s, n: n + ' (simulated)', q: 'USDC', dex: 'simulated' }, { price: O.simPx[sym], ch24: (r() - 0.45) * 60, ch1h: (r() - 0.5) * 12, ch5m: (r() - 0.5) * 3, liq: 40000 + r() * 900000, mcap: 2e5 + r() * 4e7, vol24: 5e4 + r() * 3e6, buys24: 200 + Math.round(r() * 4000), sells24: 150 + Math.round(r() * 3500), created: Date.now() - r() * 30 * 864e5 });
      return sym;
    });
  }
  O.goSim = (why) => { if (!O.sim) { O.sim = true; O.err = why || 'unreachable'; console.warn('On-chain data simulated:', O.err); } return simList(); };

  /* ---------- discovery ---------- */
  O.discover = async (kind = 'trending', chain = O.chain, force) => {
    if (!CHAINS[chain]) chain = 'solana'; if (kind !== 'new') kind = 'trending'; // persisted settings are untrusted input
    const k = kind + ':' + chain, c = O.lists[k];
    if (!force && c && Date.now() - c.ts < 90000) return c.syms;
    if (O.sim && !force) return simList();
    try {
      const path = kind === 'new' ? `/networks/${chain}/new_pools?include=base_token,quote_token,dex&page=1` : `/networks/${chain}/trending_pools?include=base_token,quote_token,dex&page=1&duration=24h`;
      const syms = fromGtPools(await gt(path), chain);
      if (!syms.length) throw new Error('empty list');
      O.lists[k] = { syms, ts: Date.now() }; O.sim = false; O.err = null; O.ts = Date.now();
      return syms;
    } catch (e) {
      if (kind === 'new') { try { const syms = await O.dsNew(chain); if (syms.length) { O.lists[k] = { syms, ts: Date.now() }; O.sim = false; return syms; } } catch (e2) { /* next fallback */ } }
      if (e.rate && c && c.syms.length) return c.syms; // rate limited: keep showing the last real list, never switch to simulated data
      // DexScreener fallback for discovery: search the chain's wrapped native token pairs, most liquid first
      try {
        const q = { solana: 'SOL', eth: 'WETH', base: 'WETH', bsc: 'WBNB', arbitrum: 'WETH' }[chain] || 'SOL';
        const r = await J.get(`${DS}/latest/dex/search?q=${q}`, { timeout: 10000 });
        const syms = fromDsPairs((r.pairs || []).filter((p) => DS2GT[p.chainId] === chain)).slice(0, 20);
        if (syms.length) { O.lists[k] = { syms, ts: Date.now() }; O.sim = false; return syms; }
      } catch (e2) { /* fall through */ }
      const sims = O.goSim(e.message); O.lists[k] = { syms: sims, ts: Date.now() }; return sims;
    }
  };
  O.search = async (q) => {
    q = String(q || '').trim().replace(/^\$/, ''); if (q.length < 2) return [];
    if (!/^[\w .\-]{2,64}$/.test(q)) return [];
    try {
      const r = await J.get(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`, { timeout: 10000 });
      const pairs = (r.pairs || []).filter((p) => DS2GT[p.chainId]).sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      return fromDsPairs(pairs.slice(0, 25));
    } catch (e) {
      if (O.sim) { const u = q.toUpperCase(); return simList().filter((s) => O.meta[s].s.includes(u)); }
      throw e;
    }
  };
  O.refreshPool = async (sym) => {
    const p = O.parse(sym); if (!p || p.chain === 'sim') return;
    try { fromGtPools({ data: [(await gt(`/networks/${p.chain}/pools/${p.pool}?include=base_token,quote_token,dex`)).data], included: [] }, p.chain); } catch (e) { /* stats stay as they were */ }
  };

  /* ---------- candles ---------- */
  const TFMAP = { 60: ['minute', 1], 300: ['minute', 5], 900: ['minute', 15], 3600: ['hour', 1], 14400: ['hour', 4], 86400: ['day', 1] };
  async function ohlcvPage(p, tf, before, limit) {
    const [unit, agg] = TFMAP[tf] || TFMAP[3600];
    const r = await gt(`/networks/${p.chain}/pools/${p.pool}/ohlcv/${unit}?aggregate=${agg}&limit=${Math.min(1000, limit)}&currency=usd${before ? '&before_timestamp=' + before : ''}`);
    const list = (r && r.data && r.data.attributes && r.data.attributes.ohlcv_list) || [];
    return list.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] || 0 })).filter((k) => k.t > 0 && k.c > 0);
  }
  function simRows(sym, tf, n) { if (!O.simPx[sym]) { const m = O.meta[sym]; O.simPx[sym] = (O.stats[sym] && O.stats[sym].price) || (m ? 0.01 : 1); } return simCandles(sym, O.simPx[sym], tf, n, 3.2); }
  O.candles = async (sym, tf, n = 300) => {
    const p = O.parse(sym); if (!p) throw new Error('not an on-chain symbol');
    if (p.chain === 'sim') { if (n <= 12) return []; return simRows(sym, tf, n); }
    const rows = await ohlcvPage(p, tf, 0, Math.max(n, 2));
    return rows.sort((a, b) => a.t - b.t).slice(-n);
  };
  O.history = async (sym, tf, n, onProg) => {
    const p = O.parse(sym); if (!p) throw new Error('not an on-chain symbol');
    if (p.chain === 'sim') return simRows(sym, tf, n);
    const pages = Math.min(12, Math.ceil(n / 1000)), m = new Map(); let before = 0;
    for (let i = 0; i < pages; i++) {
      const rows = await History.withRetry(() => ohlcvPage(p, tf, before, Math.min(1000, n - m.size)));
      if (!rows.length) break;
      for (const k of rows) m.set(k.t, k);
      before = Math.min(...rows.map((k) => k.t));
      if (onProg) onProg(i + 1, pages, m.size);
      if (rows.length < 900 || m.size >= n) break; // reached the pool's first trade
    }
    return [...m.values()].sort((a, b) => a.t - b.t).slice(-n);
  };
  O.ticker = async (sym) => { const st = O.stats[sym]; if (st && st.price) return { price: st.price }; await O.poll([sym]); const s2 = O.stats[sym]; if (!s2 || !s2.price) throw new Error('no price'); return { price: s2.price }; };
  O.book = async () => { throw new Error('DEX pools are AMMs: no order book (see Pool stats)'); };

  /* ---------- live prices: DexScreener batch (30 pairs per call), GeckoTerminal fallback ---------- */
  O.subscribe = (syms) => { let n = 0; for (const s of syms) if (O.is(s) && !O.subs.has(s)) { O.subs.add(s); n++; } if (!O.timer) O.timer = setInterval(() => O.poll(), 9000); if (n) setTimeout(() => O.poll(), 60); };
  let busy = false;
  O.poll = async (only) => {
    if (busy && !only) return; if (!only) busy = true;
    try {
      const list = only || [...O.subs], by = {};
      for (const s of list) { const p = O.parse(s); if (p) (by[p.chain] = by[p.chain] || []).push(p.pool); }
      for (const [chain, pools] of Object.entries(by)) {
        if (chain === 'sim') { for (const pl of pools) simTick('oc:sim:' + pl); continue; }
        const c = CHAINS[chain]; if (!c) continue;
        for (let i = 0; i < pools.length; i += 30) {
          const batch = pools.slice(i, i + 30);
          let got = [];
          try { const r = await J.get(`${DS}/latest/dex/pairs/${c[1]}/${batch.join(',')}`, { timeout: 9000 }); got = fromDsPairs(r.pairs || (r.pair ? [r.pair] : [])); }
          catch (e) { if (batch.length <= 3) for (const pl of batch) await O.refreshPool('oc:' + chain + ':' + pl); }
          for (const pl of batch) emitTick('oc:' + chain + ':' + pl);
          if (got.length) { O.sim = false; O.err = null; }
        }
      }
      O.polled = Date.now();
    } catch (e) { console.warn('on-chain poll', e); }
    if (!only) busy = false;
  };
  function emitTick(sym) {
    const st = O.stats[sym]; if (!st || !st.price || typeof Feed === 'undefined') return;
    const L = Feed.live[sym];
    if (L && L.price === st.price && Date.now() - (L.ts || 0) < 60000) { L.ts = Date.now(); return; }
    Feed.tick(sym, st.price, { open24: st.ch24 != null ? st.price / (1 + st.ch24 / 100) : undefined, vol24: st.vol24 || undefined });
  }
  function simTick(sym) {
    const st = O.stats[sym] || (simList(), O.stats[sym]); if (!st) return;
    const p = (O.simPx[sym] || st.price) * (1 + (Math.random() - 0.48) * 0.006); O.simPx[sym] = p; st.price = p; emitTick(sym);
  }

  /* ---------- live trades for the selected pool (tape) ---------- */
  O.trades = async (sym) => {
    const p = O.parse(sym); if (!p) return [];
    if (p.chain === 'sim') {
      const px0 = O.simPx[sym] || 1, now = Date.now() / 1000;
      return Array.from({ length: 6 }, (_, i) => ({ side: Math.random() > 0.47 ? 'buy' : 'sell', p: px0 * (1 + (Math.random() - 0.5) * 0.004), q: Math.round(1e3 + Math.random() * 9e5) / (px0 > 1 ? 1000 : 1), usd: 20 + Math.random() * 4000, ts: now - i * 3, tx: 'sim' + Math.random().toString(36).slice(2), who: '' }));
    }
    const r = await gt(`/networks/${p.chain}/pools/${p.pool}/trades`);
    return ((r && r.data) || []).map((d) => {
      const a = d.attributes || {}, buy = a.kind === 'buy';
      return { side: buy ? 'buy' : 'sell', p: +(buy ? a.price_to_in_usd : a.price_from_in_usd) || 0, q: +(buy ? a.to_token_amount : a.from_token_amount) || 0, usd: +a.volume_in_usd || 0, ts: Date.parse(a.block_timestamp) / 1000 || Date.now() / 1000, tx: txt(a.tx_hash, 100), who: /^[A-Za-z0-9]{20,64}$/.test(a.tx_from_address || '') ? a.tx_from_address : '' };
    }).filter((t) => t.p > 0).sort((a, b) => a.ts - b.ts);
  };
  O.watchTrades = (sym) => {
    clearTimeout(O.tradeT); O.tradeSym = sym; if (!O.is(sym)) return;
    const run = async () => {
      if (O.tradeSym !== sym) return;
      if (typeof curTab === 'undefined' || curTab === 'markets') {
        try {
          const list = await O.trades(sym); if (O.tradeSym !== sym) return;
          O.lastTrades[sym] = list.slice(-60);
          for (const t of list) { if (O.seenTx.has(t.tx)) continue; O.seenTx.add(t.tx); for (const f of Feed.tradeL) { try { f(sym, t.p, t.q, t.side, t.ts, t); } catch (e) { console.warn(e); } } }
          if (O.seenTx.size > 4000) O.seenTx = new Set([...O.seenTx].slice(-2000));
        } catch (e) { O.tradeErr = e.message; }
      }
      O.tradeT = setTimeout(run, O.sim || O.parse(sym).chain === 'sim' ? 3000 : 12000);
    };
    run();
  };

  /* ---------- quick heuristics shown next to pool stats (not advice) ---------- */
  O.flags = (sym) => {
    const st = O.stats[sym] || {}, f = [];
    if (st.liq != null && st.liq < 50000) f.push(['dn', 'Thin liquidity']); else if (st.liq != null && st.liq > 1e6) f.push(['up', 'Deep liquidity']);
    if (st.created && Date.now() - st.created < 864e5) f.push(['amb', 'Pair under 24h old']);
    const b = st.buys24, s = st.sells24; if (b != null && s != null && b + s > 50) { const r = b / (b + s); if (r > 0.62) f.push(['up', 'Buy-heavy flow']); else if (r < 0.38) f.push(['dn', 'Sell-heavy flow']); }
    if (st.fdv && st.mcap && st.fdv > st.mcap * 3) f.push(['amb', 'Large locked/unissued supply']);
    if (st.vol24 && st.liq && st.vol24 > st.liq * 15) f.push(['amb', 'Volume ≫ liquidity']);
    return f;
  };
  return O;
})();
if (typeof module === 'object') module.exports = { OC };
