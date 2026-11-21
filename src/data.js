/* ExTerm data layer — providers (Coinbase / Kraken / Demo), live feed, candle stores, external sources */
const J = {
  proxy: false,
  token() { const m = document.querySelector('meta[name="nt-token"]'); return m ? m.content : ''; }, // per-launch secret injected by the local server
  async detectProxy() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try { const r = await fetch('/proxy/ping', { cache: 'no-store', headers: { 'X-ExTerm': J.token() } }); J.proxy = r.ok && (await r.text()).trim() === 'exterm-proxy'; } catch (e) { J.proxy = false; }
    return J.proxy;
  },
  async _do(url, init, timeout, asText) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeout);
    if (url.startsWith('/proxy') || url.startsWith('/hook') || url.startsWith('/api/') || url.startsWith('/ollama/')) init = Object.assign({}, init, { headers: Object.assign({ 'X-ExTerm': J.token() }, (init && init.headers) || {}) });
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, init));
      if (asText && r.ok) return await r.text();
      if (!r.ok) { let t = ''; try { t = await r.text(); try { const j = JSON.parse(t); t = (j.error && (j.error.message || j.error)) || j.message || t; } catch (x) { } t = String(t).replace(/<urlopen error |>$/g, '').slice(0, 90); } catch (e) { } const er = new Error('HTTP ' + r.status + (t ? ' ' + t : '')); er.http = true; throw er; }
      return await r.json();
    } catch (e) { if (e.name === 'AbortError') { const er = new Error('timeout'); er.http = true; throw er; } throw e; }
    finally { clearTimeout(to); }
  },
  async req(url, init, timeout, asText, viaProxy) {
    const isLocal = url.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url);
    if (viaProxy && J.proxy && !isLocal) return J._do('/proxy?u=' + encodeURIComponent(url), init, timeout, asText);
    if (!J.proxy && !isLocal && J.relayFirst(url)) { try { return await J.relay(url, init, timeout, asText); } catch (e) { /* try direct below */ } }
    try { return await J._do(url, init, timeout, asText); }
    catch (e) {
      // network/CORS failure -> retry through the bundled local proxy if available
      if (!e.http && J.proxy && !isLocal) { try { return await J._do('/proxy?u=' + encodeURIComponent(url), init, timeout, asText); } catch (e2) { throw new Error(e2.message || String(e2)); } }
      // no local server -> try a public CORS relay for read-only public data
      if (!e.http && !J.proxy && !isLocal && J.relayable(url, init)) { try { return await J.relay(url, init, timeout, asText); } catch (e3) { /* fall through */ } }
      throw new Error(e.message === 'Failed to fetch' ? 'Failed to fetch (network or CORS blocked)' : (e.message || String(e)));
    }
  },
  /* public CORS relays: used only when ExTerm runs without its local server, only for public, key-less data */
  RELAYS: [
    { id: 'corsproxy.io', u: (x) => 'https://corsproxy.io/?url=' + encodeURIComponent(x), post: true },
    { id: 'allorigins', u: (x) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(x) },
    { id: 'codetabs', u: (x) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(x) },
  ],
  relayCool: {}, relayUsed: '',
  relayFirst(url) { if (J.noRelay) return false; return /finance\.yahoo\.com|sec\.gov|dataviz\.cnn\.io/.test(url); }, // these never allow browser CORS, so skip the doomed direct attempt
  relayable(url, init) {
    if (J.noRelay) return false; const h = (init && init.headers) || {}; if (Object.keys(h).some((k) => /auth|key|sign|secret|apca|mbx|bapi|contact/i.test(k))) return false; // never send keys through third parties
    let host = ''; try { host = new URL(url).hostname; } catch (e) { return false; }
    return /(^|\.)(finance\.yahoo\.com|sec\.gov|dataviz\.cnn\.io|dexscreener\.com|geckoterminal\.com|coingecko\.com|cryptocompare\.com|alternative\.me|mainnet-beta\.solana\.com|publicnode\.com|drpc\.org|stocktwits\.com|reddit\.com)$/.test(host);
  },
  async relay(url, init, timeout, asText) {
    const post = init && init.method === 'POST', now = Date.now();
    const list = J.RELAYS.filter((r) => (!post || r.post) && !(J.relayCool[r.id] > now)).sort((a, b) => (b.id === J.relayUsed) - (a.id === J.relayUsed));
    let last = null;
    for (const r of list) {
      try {
        const hd = Object.assign({}, (init && init.headers) || {}); delete hd['X-Contact'];
        const out = await J._do(r.u(url), Object.assign({}, init, { headers: hd }), Math.max(timeout, 15000), asText);
        J.relayUsed = r.id; return out;
      } catch (e) { last = e; if (!e.http || /HTTP (403|429|5\d\d)|timeout/.test(e.message)) J.relayCool[r.id] = Date.now() + 60000; }
    }
    throw last || new Error('no relay available');
  },
  get(url, o = {}) { const L = J.limitFor(url); if (L) return J.limited(url, o, L); return J.req(url, { headers: o.headers }, o.timeout || 9000, false, o.proxy); },
  /* v14: client-side pacing for public APIs with tight free limits (DexScreener: ~60/min on profile + boost lists,
     ~300/min elsewhere). Identical requests in flight share one call; a 429 starts a short shared cool-down for that
     host and comes back as a readable error (e.rate) instead of the raw API message. GeckoTerminal has its own
     limiter in dex.js. */
  LIMITS: { 'api.dexscreener.com': [{ rx: /\/(token-profiles|token-boosts|community-takeovers|ads)\//, rpm: 50 }, { rx: /./, rpm: 240 }] },
  _bk: {}, _inf: new Map(), _cool: {},
  limitFor(url) { let u; try { u = new URL(url); } catch (e) { return null; } const rules = J.LIMITS[u.hostname]; if (!rules) return null; const i = rules.findIndex((r) => r.rx.test(u.pathname)); return i < 0 ? null : { host: u.hostname, key: u.hostname + '#' + i, rpm: rules[i].rpm }; },
  async take(L) {
    const b = J._bk[L.key] || (J._bk[L.key] = { t: Math.min(5, L.rpm / 10), last: Date.now() }), cap = Math.max(2, Math.min(10, L.rpm / 10)), rate = L.rpm / 60000;
    for (let k = 0; k < 50; k++) { const now = Date.now(); b.t = Math.min(cap, b.t + (now - b.last) * rate); b.last = now; if (b.t >= 1) { b.t -= 1; return; } await sleep(Math.ceil((1 - b.t) / rate) + 20); }
  },
  coolLeft(host) { return Math.max(0, (J._cool[host] || 0) - Date.now()); },
  rateError(host, left) { const e = new Error(`${host.replace(/^api\./, '')} free limit reached: pausing ${Math.ceil(left / 1000)}s`); e.rate = true; e.http = true; e.retryIn = left; return e; },
  limited(url, o, L) {
    const key = url + '|' + (o.proxy ? 1 : 0);
    if (J._inf.has(key)) return J._inf.get(key);
    const job = (async () => {
      const left = J.coolLeft(L.host);
      if (left > 5000) throw J.rateError(L.host, left);
      if (left) await sleep(left + 100);
      await J.take(L);
      try { const v = await J.req(url, { headers: o.headers }, o.timeout || 9000, false, o.proxy); J._cool[L.host + '#n'] = 0; return v; }
      catch (e) {
        if (/\b429\b|rate.?limit|too many requests/i.test(String(e.message))) { const n = (J._cool[L.host + '#n'] || 0) + 1; J._cool[L.host + '#n'] = n; J._cool[L.host] = Date.now() + Math.min(120000, 15000 * n); throw J.rateError(L.host, J.coolLeft(L.host)); }
        throw e;
      }
    })();
    J._inf.set(key, job); const done = () => J._inf.delete(key); job.then(done, done);
    return job;
  },
  text(url, o = {}) { return J.req(url, { headers: o.headers }, o.timeout || 12000, true, o.proxy); },
  post(url, body, o = {}) { return J.req(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, o.headers || {}), body: JSON.stringify(body) }, o.timeout || 12000, false, o.proxy); },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } }
  }));
  return out;
}

/* reconnecting WebSocket. v15: optional keepalive (o.ping msg every o.pingMs), stale watchdog (o.staleMs() > 0: reconnect when a
   subscribed socket goes quiet that long), jittered backoff, instant reconnect when the network comes back */
class Sock {
  constructor(url, o) { this.url = url; this.o = o; this.ws = null; this.tries = 0; this.closed = false; this.state = 'idle'; this.t = 0; this.rt = 0; this.dog = 0; }
  set(s) { this.state = s; if (this.o.onState) this.o.onState(s, this); }
  open() {
    if (this.closed) return;
    clearTimeout(this.rt); this.rt = 0; this.drop();
    try { this.ws = new WebSocket(this.url); } catch (e) { this.set('error'); this.retry(); return; }
    const ws = this.ws; this.set('connecting');
    ws.onopen = () => { this.tries = 0; this.t = Date.now(); this.set('live'); this.watch(); if (this.o.onOpen) this.o.onOpen(this); };
    ws.onmessage = (e) => { if (ws !== this.ws) return; this.t = Date.now(); let m; try { m = JSON.parse(e.data); } catch (x) { return; } try { this.o.onMsg(m, this); } catch (x) { console.warn('ws handler', x); } };
    ws.onerror = () => { if (ws === this.ws) this.set('error'); };
    ws.onclose = () => { if (ws !== this.ws) return; clearInterval(this.dog); if (this.closed) return; this.set('closed'); this.retry(); };
    if (!Sock.net) { Sock.net = new Set(); addEventListener('online', () => Sock.net.forEach((s) => { if (s.state !== 'live' && s.state !== 'connecting') { s.tries = 0; s.open(); } })); }
    Sock.net.add(this);
  }
  watch() {
    clearInterval(this.dog); let lastPing = Date.now();
    this.dog = setInterval(() => {
      if (this.closed || !this.ws || this.ws.readyState !== 1) return;
      const quiet = Date.now() - this.t, stale = this.o.staleMs ? this.o.staleMs() : 0;
      if (stale && quiet > stale) { clearInterval(this.dog); this.drop(); this.set('closed'); this.retry(); return; } // half-open TCP can delay onclose for minutes
      if (this.o.ping && Date.now() - lastPing >= (this.o.pingMs || 30000)) { lastPing = Date.now(); this.send(typeof this.o.ping === 'function' ? this.o.ping() : this.o.ping); }
    }, 5000);
  }
  drop() { const w = this.ws; this.ws = null; if (!w) return; w.onopen = w.onmessage = w.onerror = w.onclose = null; try { w.close(); } catch (e) { } }
  retry() { if (this.closed || this.rt) return; const d = Math.min(30000, 1000 * Math.pow(2, this.tries++)) * (0.75 + Math.random() * 0.5); this.rt = setTimeout(() => { this.rt = 0; this.open(); }, d); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
  close() { this.closed = true; clearInterval(this.dog); clearTimeout(this.rt); if (Sock.net) Sock.net.delete(this); this.drop(); }
}

const FALLBACK_BASES = 'BTC ETH SOL XRP ADA DOGE AVAX LINK DOT LTC BCH UNI ATOM XLM NEAR AAVE ARB OP APT SUI HBAR ICP INJ FIL ETC ALGO MKR RENDER FET GRT CRV SHIB PEPE POL TIA SEI LDO ENA TAO WIF BONK JUP STX IMX SAND MANA COMP SNX'.split(' ');

/* ───────────── Coinbase ───────────── */
const CB = {
  id: 'coinbase', name: 'Coinbase',
  REST: 'https://api.exchange.coinbase.com',
  AT: 'https://api.coinbase.com/api/v3/brokerage/market',
  async products() {
    try {
      const r = await J.get(CB.REST + '/products');
      return r.filter((p) => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled).map((p) => ({ id: p.id, base: p.base_currency }));
    } catch (e) {
      const r = await J.get(CB.AT + '/products?product_type=SPOT&limit=600');
      return (r.products || []).filter((p) => p.quote_currency_id === 'USD' && p.status === 'online' && !p.trading_disabled).map((p) => ({ id: p.product_id, base: p.base_currency_id }));
    }
  },
  async page(sym, g, start, end) {
    const iso = (t) => new Date(t * 1000).toISOString();
    try {
      const r = await J.get(`${CB.REST}/products/${sym}/candles?granularity=${g}&start=${iso(start)}&end=${iso(end)}`);
      return r.map((k) => ({ t: k[0], l: k[1], h: k[2], o: k[3], c: k[4], v: k[5] })).sort((a, b) => a.t - b.t);
    } catch (e) {
      const gm = { 60: 'ONE_MINUTE', 300: 'FIVE_MINUTE', 900: 'FIFTEEN_MINUTE', 3600: 'ONE_HOUR', 86400: 'ONE_DAY' }[g];
      const r = await J.get(`${CB.AT}/products/${sym}/candles?start=${start}&end=${end}&granularity=${gm}`);
      return (r.candles || []).map((k) => ({ t: +k.start, o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +k.volume })).sort((a, b) => a.t - b.t);
    }
  },
  async candles(sym, tf, n = 300) {
    const src = tf === 14400 ? 3600 : tf, factor = tf === 14400 ? 4 : 1, need = n * factor;
    const pages = Math.ceil(need / 300);
    let end = Math.floor(Date.now() / 1000), all = [];
    for (let p = 0; p < pages; p++) {
      const cnt = Math.min(300, need - p * 300), start = end - cnt * src;
      const rows = await CB.page(sym, src, start, end);
      all = rows.concat(all); end = start;
    }
    const m = new Map(); for (const k of all) m.set(k.t, k);
    let out = [...m.values()].sort((a, b) => a.t - b.t);
    if (factor > 1) out = NT.aggregate(out, tf);
    return out.slice(-n);
  },
  async ticker(sym) { const r = await J.get(`${CB.REST}/products/${sym}/ticker`); return { price: +r.price, bid: +r.bid, ask: +r.ask }; },
  async book(sym) {
    const r = await J.get(`${CB.REST}/products/${sym}/book?level=2`);
    return { bids: r.bids.slice(0, 12).map((x) => [+x[0], +x[1]]), asks: r.asks.slice(0, 12).map((x) => [+x[0], +x[1]]) };
  },
  async tickers(bases) { // fallback for the heat map: 24h stats per product
    const rows = await pool(bases.slice(0, 40), 5, async (b) => { const s = await J.get(`${CB.REST}/products/${b}-USD/stats`); return { sym: b, price: +s.last, open: +s.open, vol: +s.volume * +s.last }; });
    return rows.filter((r) => r && r.price > 0 && r.open > 0).map((r) => ({ sym: r.sym, name: r.sym, price: r.price, mcap: null, vol: r.vol, ch24h: (r.price / r.open - 1) * 100 }));
  },
  stream(h) {
    const subs = new Set(); let mode = 'at', sock = null, stopped = false, dog = null;
    const url = () => mode === 'at' ? 'wss://advanced-trade-ws.coinbase.com' : 'wss://ws-feed.exchange.coinbase.com';
    const msgs = (ids) => mode === 'at'
      ? [{ type: 'subscribe', product_ids: ids, channel: 'ticker' }, { type: 'subscribe', product_ids: ids, channel: 'market_trades' }]
      : [{ type: 'subscribe', product_ids: ids, channels: ['ticker', 'matches'] }];
    function onMsg(m) {
      if (m.channel === 'ticker' || m.channel === 'ticker_batch') {
        for (const ev of m.events || []) for (const t of ev.tickers || []) {
          const p = +t.price; if (!(p > 0)) continue;
          const chg = t.price_percent_chg_24h != null ? +t.price_percent_chg_24h : null;
          h.tick(t.product_id, p, { open24: chg != null && isFinite(chg) ? p / (1 + chg / 100) : null, bid: +t.best_bid || null, ask: +t.best_ask || null, vol24: +t.volume_24h || null, high24: +t.high_24h || null, low24: +t.low_24h || null });
        }
      } else if (m.channel === 'market_trades') {
        for (const ev of m.events || []) for (const t of ev.trades || []) h.trade(t.product_id, +t.price, +t.size, String(t.side || '').toLowerCase(), Date.parse(t.time) / 1000 || Date.now() / 1000);
      } else if (m.type === 'ticker' && m.price) {
        h.tick(m.product_id, +m.price, { open24: +m.open_24h || null, bid: +m.best_bid || null, ask: +m.best_ask || null, vol24: +m.volume_24h || null, high24: +m.high_24h || null, low24: +m.low_24h || null });
      } else if ((m.type === 'match' || m.type === 'last_match') && m.price) {
        h.trade(m.product_id, +m.price, +m.size, m.side === 'buy' ? 'sell' : 'buy', Date.parse(m.time) / 1000 || Date.now() / 1000); // exchange feed reports the maker side
      }
    }
    function open() {
      if (stopped) return;
      sock = new Sock(url(), { onOpen: (s) => { if (subs.size) msgs([...subs]).forEach((x) => s.send(x)); }, onMsg, onState: (s) => h.state(s, mode), staleMs: () => (subs.size ? 30000 : 0) });
      sock.open();
    }
    open();
    dog = setInterval(() => { // if the primary endpoint stays silent, try the legacy exchange feed once
      if (stopped || !subs.size) return;
      if (mode === 'at' && sock && sock.state === 'live' && Date.now() - (sock.t || 0) > 15000) { mode = 'ex'; sock.close(); open(); }
    }, 5000);
    return {
      sub(ids) { ids.forEach((i) => subs.add(i)); if (sock && sock.state === 'live') msgs(ids).forEach((x) => sock.send(x)); },
      close() { stopped = true; clearInterval(dog); if (sock) sock.close(); },
    };
  },
};

/* ───────────── Kraken ───────────── */
const KR = {
  id: 'kraken', name: 'Kraken', REST: 'https://api.kraken.com/0/public',
  pairs: null, // id -> {alt, key}
  async ensure() {
    if (KR.pairs) return KR.pairs;
    const r = await J.get(KR.REST + '/AssetPairs');
    if (r.error && r.error.length) throw new Error(r.error[0]);
    const pairs = {};
    for (const [key, p] of Object.entries(r.result)) {
      if (!p.wsname || !p.wsname.endsWith('/USD') || key.endsWith('.d') || p.status === 'cancel_only') continue;
      let base = p.wsname.split('/')[0]; base = base === 'XBT' ? 'BTC' : base === 'XDG' ? 'DOGE' : base;
      pairs[base + '-USD'] = { alt: p.altname, key, base };
    }
    KR.pairs = pairs; return pairs;
  },
  async products() { const p = await KR.ensure(); return Object.entries(p).map(([id, v]) => ({ id, base: v.base })); },
  async candles(sym, tf, n = 300) {
    const p = (await KR.ensure())[sym]; if (!p) throw new Error('unknown pair ' + sym);
    const r = await J.get(`${KR.REST}/OHLC?pair=${p.alt}&interval=${tf / 60}`);
    if (r.error && r.error.length) throw new Error(r.error[0]);
    const rows = r.result[Object.keys(r.result).find((k) => k !== 'last')];
    return rows.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[6] })).slice(-n);
  },
  async ticker(sym) { const p = (await KR.ensure())[sym]; const r = await J.get(`${KR.REST}/Ticker?pair=${p.alt}`); const t = r.result[Object.keys(r.result)[0]]; return { price: +t.c[0], bid: +t.b[0], ask: +t.a[0] }; },
  async book(sym) {
    const p = (await KR.ensure())[sym]; const r = await J.get(`${KR.REST}/Depth?pair=${p.alt}&count=12`); const d = r.result[Object.keys(r.result)[0]];
    return { bids: d.bids.map((x) => [+x[0], +x[1]]), asks: d.asks.map((x) => [+x[0], +x[1]]) };
  },
  async tickers() {
    const pairs = await KR.ensure(), byKey = {}; for (const v of Object.values(pairs)) byKey[v.key] = v.base;
    const r = await J.get(KR.REST + '/Ticker');
    const out = [];
    for (const [k, t] of Object.entries(r.result)) {
      const base = byKey[k]; if (!base) continue;
      const price = +t.c[0], open = +t.o; if (!(price > 0) || !(open > 0)) continue;
      out.push({ sym: base, name: base, price, mcap: null, vol: +t.v[1] * +t.p[1], ch24h: (price / open - 1) * 100 });
    }
    return out;
  },
  stream(h) {
    const subs = new Set(); let sock = null, stopped = false;
    const conv = (id) => id.replace('-', '/');
    const msgs = (ids) => [{ method: 'subscribe', params: { channel: 'ticker', symbol: ids.map(conv), event_trigger: 'trades' } }, { method: 'subscribe', params: { channel: 'trade', symbol: ids.map(conv) } }];
    sock = new Sock('wss://ws.kraken.com/v2', {
      onOpen: (s) => { if (subs.size) msgs([...subs]).forEach((x) => s.send(x)); },
      onState: (s) => h.state(s, 'kraken'), staleMs: () => (subs.size ? 30000 : 0), ping: { method: 'ping' }, pingMs: 30000,
      onMsg: (m) => {
        if (m.channel === 'ticker' && m.data) {
          for (const d of m.data) {
            const p = +d.last; if (!(p > 0)) continue;
            h.tick(d.symbol.replace('/', '-'), p, { open24: d.change != null ? p - d.change : null, bid: +d.bid || null, ask: +d.ask || null, vol24: +d.volume || null, high24: +d.high || null, low24: +d.low || null });
          }
        } else if (m.channel === 'trade' && m.data) {
          for (const d of m.data) h.trade(d.symbol.replace('/', '-'), +d.price, +d.qty, d.side, Date.parse(d.timestamp) / 1000 || Date.now() / 1000);
        }
      },
    });
    sock.open();
    return {
      sub(ids) { ids.forEach((i) => subs.add(i)); if (sock && sock.state === 'live') msgs(ids).forEach((x) => sock.send(x)); },
      close() { stopped = true; sock.close(); },
    };
  },
};

/* ───────────── Binance (spot, USDT pairs shown as -USD) ─────────────
   Not in the auto order: api.binance.com refuses US visitors. Pick it in Settings → Source. */
const BN = {
  id: 'binance', name: 'Binance', REST: 'https://api.binance.com/api/v3', native: [60, 180, 300, 900, 1800, 3600, 7200, 14400, 86400],
  IV: { 60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 7200: '2h', 14400: '4h', 86400: '1d' },
  pair: (sym) => String(sym).replace(/-USD$/, '') + 'USDT',
  unpair: (s) => String(s).replace(/USDT$/, '') + '-USD',
  async products() { const r = await J.get(BN.REST + '/ticker/price'); return (r || []).filter((x) => /^[A-Z0-9]{2,15}USDT$/.test(x.symbol) && +x.price > 0).map((x) => ({ id: BN.unpair(x.symbol), base: x.symbol.slice(0, -4) })); },
  async candles(sym, tf, n = 300) {
    const iv = BN.IV[tf]; if (!iv) throw new Error('Binance has no ' + tf + 's candles');
    let end = 0, all = [];
    while (all.length < n) { // 1000 per call, walking back in time (5,000 candles = 5 calls)
      const lim = Math.min(1000, n - all.length), r = await J.get(`${BN.REST}/klines?symbol=${BN.pair(sym)}&interval=${iv}&limit=${lim}${end ? '&endTime=' + end : ''}`);
      if (!Array.isArray(r) || !r.length) break;
      all = r.map((k) => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })).concat(all);
      if (r.length < lim) break; end = r[0][0] - 1;
    }
    return all.slice(-n);
  },
  async ticker(sym) { const r = await J.get(`${BN.REST}/ticker/24hr?symbol=${BN.pair(sym)}`); return { price: +r.lastPrice, bid: +r.bidPrice, ask: +r.askPrice }; },
  async book(sym) { const r = await J.get(`${BN.REST}/depth?symbol=${BN.pair(sym)}&limit=12`); return { bids: r.bids.map((x) => [+x[0], +x[1]]), asks: r.asks.map((x) => [+x[0], +x[1]]) }; },
  async tickers() {
    const r = await J.get(BN.REST + '/ticker/24hr');
    return (r || []).filter((t) => /USDT$/.test(t.symbol) && +t.lastPrice > 0 && +t.openPrice > 0).map((t) => { const b = t.symbol.slice(0, -4); return { sym: b, name: b, price: +t.lastPrice, mcap: null, vol: +t.quoteVolume, ch24h: +t.priceChangePercent }; });
  },
  stream(h) {
    const subs = new Set(); let sock = null, id = 1;
    const msg = (ids) => ({ method: 'SUBSCRIBE', params: ids.flatMap((i) => [BN.pair(i).toLowerCase() + '@trade', BN.pair(i).toLowerCase() + '@ticker']), id: id++ });
    sock = new Sock('wss://stream.binance.com:9443/ws', {
      onOpen: (s) => { if (subs.size) s.send(msg([...subs])); },
      onState: (s) => h.state(s, 'binance'), staleMs: () => (subs.size ? 30000 : 0), // the server pings; browsers answer automatically
      onMsg: (m) => {
        if (!m || !/^[A-Z0-9]{2,15}USDT$/.test(m.s)) return; // external data: only well-formed pair names reach the app
        if (m.e === 'trade') h.trade(BN.unpair(m.s), +m.p, +m.q, m.m ? 'sell' : 'buy', (+m.T || Date.now()) / 1000); // m = buyer is maker -> a sell hit the bid
        else if (m.e === '24hrTicker' && +m.c > 0) h.tick(BN.unpair(m.s), +m.c, { open24: +m.o || null, bid: +m.b || null, ask: +m.a || null, vol24: +m.v || null, high24: +m.h || null, low24: +m.l || null });
      },
    });
    sock.open();
    return {
      sub(ids) { const nw = ids.filter((i) => !subs.has(i)); nw.forEach((i) => subs.add(i)); if (nw.length && sock.state === 'live') sock.send(msg(nw)); },
      close() { sock.close(); },
    };
  },
};

/* ───────────── Demo (simulated — used only when no exchange is reachable, or when selected) ───────────── */
const DEMO_COINS = [['BTC', 'Bitcoin', 97000, 1.92e12], ['ETH', 'Ethereum', 3350, 4.04e11], ['XRP', 'XRP', 2.4, 1.38e11], ['SOL', 'Solana', 205, 9.9e10], ['DOGE', 'Dogecoin', 0.33, 4.8e10], ['ADA', 'Cardano', 0.95, 3.4e10], ['AVAX', 'Avalanche', 41, 1.6e10], ['LINK', 'Chainlink', 23, 1.45e10], ['DOT', 'Polkadot', 7.4, 1.1e10], ['LTC', 'Litecoin', 108, 8.1e9], ['BCH', 'Bitcoin Cash', 470, 9.3e9], ['UNI', 'Uniswap', 13.5, 8.1e9], ['NEAR', 'NEAR Protocol', 5.6, 6.6e9], ['ATOM', 'Cosmos', 6.4, 2.5e9], ['XLM', 'Stellar', 0.41, 1.2e10], ['AAVE', 'Aave', 340, 5.1e9], ['SUI', 'Sui', 4.4, 1.4e10], ['HBAR', 'Hedera', 0.28, 1.1e10], ['ARB', 'Arbitrum', 0.72, 2.9e9], ['OP', 'Optimism', 1.7, 2.1e9], ['APT', 'Aptos', 8.9, 4.4e9], ['FIL', 'Filecoin', 4.3, 2.6e9], ['INJ', 'Injective', 22, 2.1e9], ['ETC', 'Ethereum Classic', 28, 4.2e9], ['SHIB', 'Shiba Inu', 0.000022, 1.3e10], ['PEPE', 'Pepe', 0.000019, 8e9], ['ALGO', 'Algorand', 0.38, 3.2e9], ['MKR', 'Maker', 1500, 1.4e9], ['TIA', 'Celestia', 5.2, 1.3e9], ['RENDER', 'Render', 6.8, 3.5e9]];
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function simCandles(sym, last, tf, n, vm) {
  let price = last || 100; const vol = (0.0009 * Math.sqrt(tf / 60) + 0.0005) * (vm || 1), now = Math.floor(Date.now() / 1000), out = [];
  const bt = Math.floor(now / tf) * tf;
  for (let i = 0; i < n; i++) {
    const t = bt - i * tf, r = prng(hash(sym) ^ Math.imul(t, 2654435761)), r2 = prng((hash(sym) + t) >>> 0);
    const ret = (r() - 0.5) * 2 * vol * 1.7 + Math.sin(t / (tf * 400) + hash(sym)) * vol * 0.04;
    const c = price, o = c / (1 + ret), h = Math.max(o, c) * (1 + r2() * vol * 0.6), l = Math.min(o, c) * (1 - r2() * vol * 0.6);
    out.push({ t, o, h, l, c, v: 20 + r2() * 80 }); price = o;
  }
  return out.reverse();
}
const Demo = {
  id: 'demo', name: 'Demo (simulated)', px: {}, o24: {},
  init() { for (const [b, , p] of DEMO_COINS) { if (!Demo.px[b + '-USD']) { const r = prng(hash(b) ^ Math.floor(Date.now() / 3.6e6)); Demo.px[b + '-USD'] = p * (1 + (r() - 0.5) * 0.04); Demo.o24[b + '-USD'] = Demo.px[b + '-USD'] * (1 + (r() - 0.5) * 0.06); } } },
  async products() { Demo.init(); return DEMO_COINS.map(([b]) => ({ id: b + '-USD', base: b })); },
  async candles(sym, tf, n = 300) { Demo.init(); if (n <= 12) return []; return simCandles(sym, Demo.px[sym] || 100, tf, n, 1); },
  async ticker(sym) { Demo.init(); return { price: Demo.px[sym], bid: Demo.px[sym] * 0.9998, ask: Demo.px[sym] * 1.0002 }; },
  async book(sym) {
    Demo.init(); const p = Demo.px[sym] || 100, r = prng(Math.floor(Date.now() / 2000) + hash(sym)), bids = [], asks = [];
    for (let i = 0; i < 12; i++) { bids.push([p * (1 - 0.0002 * (i + 1)), r() * 3 + 0.2]); asks.push([p * (1 + 0.0002 * (i + 1)), r() * 3 + 0.2]); }
    return { bids, asks };
  },
  async tickers() { Demo.init(); return DEMO_COINS.map(([b, n, , m]) => ({ sym: b, name: n, price: Demo.px[b + '-USD'], mcap: m, vol: m * 0.04, ch24h: (Demo.px[b + '-USD'] / Demo.o24[b + '-USD'] - 1) * 100 })); },
  async markets() {
    Demo.init();
    return DEMO_COINS.map(([b, n, , m], i) => { const r = prng(hash(b)); const ch24 = (Demo.px[b + '-USD'] / Demo.o24[b + '-USD'] - 1) * 100; return { sym: b, name: n, price: Demo.px[b + '-USD'], mcap: m, vol: m * (0.02 + r() * 0.05), ch1h: (r() - 0.5) * 2, ch24h: ch24, ch7d: (r() - 0.45) * 16, rank: i + 1 }; });
  },
  stream(h) {
    const subs = new Set(); h.state('live', 'demo');
    const iv = setInterval(() => {
      for (const s of subs) {
        const r = Math.random(), p = Demo.px[s]; if (!p) continue;
        const np = p * (1 + (Math.random() - 0.5) * 0.0016 + Math.sin(Date.now() / 60000 + hash(s)) * 0.00008);
        Demo.px[s] = np; h.tick(s, np, { open24: Demo.o24[s], bid: np * 0.9998, ask: np * 1.0002 });
        if (r < 0.7) h.trade(s, np, Math.random() * (np > 1000 ? 0.4 : np > 10 ? 8 : 4000), Math.random() > 0.5 ? 'buy' : 'sell', Date.now() / 1000);
      }
    }, 1000);
    return { sub(ids) { Demo.init(); ids.forEach((i) => subs.add(i)); }, close() { clearInterval(iv); } };
  },
};

/* ───────────── provider manager ───────────── */
const Providers = {
  map: { coinbase: CB, kraken: KR, binance: BN, demo: Demo }, active: null, probe: {}, bases: [], ids: new Set(), productsFromApi: false,
  async pick(mode) {
    Providers.probe = {};
    if (mode && mode !== 'auto') { Providers.active = Providers.map[mode]; return Providers.active; }
    for (const p of [CB, KR]) {
      try {
        const t0 = performance.now();
        const c = await Promise.race([p.candles('BTC-USD', 3600, 5), sleep(8000).then(() => { throw new Error('timeout'); })]);
        if (c && c.length) { Providers.probe[p.id] = { ok: true, ms: Math.round(performance.now() - t0) }; Providers.active = p; return p; }
        throw new Error('no data');
      } catch (e) { Providers.probe[p.id] = { ok: false, err: e.message }; }
    }
    Providers.active = Demo; return Demo;
  },
  async loadProducts() {
    try { const list = await Providers.active.products(); if (!list.length) throw new Error('empty'); Providers.list = list; Providers.productsFromApi = true; }
    catch (e) { Providers.list = FALLBACK_BASES.map((b) => ({ id: b + '-USD', base: b })); Providers.productsFromApi = false; }
    Providers.ids = new Set(Providers.list.map((p) => p.id));
    Providers.bases = new Set(Providers.list.map((p) => p.base));
    return Providers.list;
  },
};

/* ───────────── candle stores ───────────── */
const Stores = new Map(), StoresBySym = new Map();
/* ───────────── timeframes beyond what each API serves ─────────────
   1s / 5s / 15s / 30s: built from real recent trades (Coinbase REST + the trades this tab already saw on the WebSocket for
   crypto, the pool's swaps for DEX tokens, the launcher's RAM tick buffer for stocks), then extended live tick by tick.
   3m / 30m / 2h: aggregated from 1m / 5m / 1h candles. */
const TFX = {
  BASE: { 180: 60, 1800: 300, 7200: 3600, 604800: 86400, 2592000: 86400 }, // shortcut: 1M = 30-day buckets, not calendar months; upgrade if month-aligned bars are needed
  RING: 5000, ring: new Map(), tcache: new Map(), // 5,000 trades per symbol: minutes of 1s bars on majors, bounded RAM
  subOK: () => true,
  /* every live WebSocket trade is kept (per symbol, last RING) so switching to 1s / 5s draws at once from RAM */
  note(sym, p, q, ts) { if (!(p > 0) || !(ts > 0)) return; let a = TFX.ring.get(sym); if (!a) TFX.ring.set(sym, (a = [])); a.push({ t: ts, p, q: q || 0 }); if (a.length > TFX.RING * 1.25) a.splice(0, a.length - TFX.RING); },
  // Coinbase pages trades newest-first: the cut-off is the newest REST trade, not the last element (else live trades count twice)
  merged(rest, sym) { const own = TFX.ring.get(sym) || [], t0 = rest.reduce((m, x) => (x.t > m ? x.t : m), 0); return rest.concat(own.filter((x) => x.t > t0)); },
  /* stocks have no public sub-minute history: the launcher keeps every 2 s quote in RAM; without it, seed one bar from the last quote */
  async stockSub(sym, tf, n) {
    let ticks = [];
    if (J.proxy) { try { const r = await J.get('/api/ticks?sym=' + encodeURIComponent(sym), { timeout: 4000 }); ticks = (Array.isArray(r && r.ticks) ? r.ticks : []).filter((x) => Array.isArray(x) && x[0] > 0 && x[1] > 0 && isFinite(x[1])).map((x) => ({ t: +x[0], p: +x[1], q: 0 })); } catch (e) { /* older launcher */ } }
    ticks = TFX.merged(ticks, sym);
    let rows = ticks.length ? TFX.fromTrades(ticks, tf) : [];
    if (!rows.length) {
      let p = Feed.live[sym] && Feed.live[sym].price;
      if (!(p > 0)) { try { const c = await providerFor(sym).candles(sym, 60, 2); p = c.length ? c[c.length - 1].c : 0; } catch (e) { /* no quote yet */ } }
      if (!(p > 0)) throw new Error('No quote for ' + sym + ' yet: sub-minute bars start with the next tick');
      rows = [{ t: Math.floor(Date.now() / 1000 / tf) * tf, o: p, h: p, l: p, c: p, v: 0 }];
    }
    const now = Math.floor(Date.now() / 1000 / tf) * tf, last = rows[rows.length - 1]; // keep time continuous up to now so live ticks land on the right bar
    for (let t = Math.max(last.t + tf, now - n * tf); t <= now && rows.length < 20000; t += tf) rows.push({ t, o: last.c, h: last.c, l: last.c, c: last.c, v: 0 });
    return rows.slice(-n);
  },
  /* v16.2: stocks / DEX tokens rarely have enough sub-minute trades to fill the pane, so the visible window is
     back-populated from 1m OHLCV (V162.seedSub) and bridged to the live price; real tick bars replace seeded ones */
  async seedHist(sym, tf, n, rows) {
    rows = rows || []; if (typeof V162 === 'undefined') { if (rows.length) return rows; throw new Error('No sub-minute data for ' + sym + ' yet'); }
    if (rows.filter((r) => !(r.v === 0 && r.h === r.l && r.o === r.c)).length >= n * 0.9) return rows;
    let m1 = []; try { m1 = await History.get(sym, 60, Math.min(History.MAX, Math.ceil((n * tf) / 60) + 5)); } catch (e) { /* no 1m history: seed from spot */ }
    const lv = Feed.live[sym] && Feed.live[sym].price, spot = lv > 0 ? lv : (typeof px === 'function' && px(sym)) || (rows.length ? rows[rows.length - 1].c : 0) || (m1.length ? m1[m1.length - 1].c : 0);
    if (!(spot > 0)) { if (rows.length) return rows; throw new Error('No quote for ' + sym + ' yet: sub-minute bars start with the next tick'); }
    const closed = isStock(sym) && typeof StockFeed !== 'undefined' && StockFeed.session[sym] === false;
    return V162.seedSub(m1, tf, n, spot, Date.now() / 1000, rows, closed);
  },
  async tradesCB(sym, pages = 4) {
    const out = []; let after = '';
    for (let i = 0; i < pages; i++) {
      const r = await J.get(`${CB.REST}/products/${encodeURIComponent(sym)}/trades?limit=1000${after ? '&after=' + after : ''}`, { timeout: 9000 });
      if (!Array.isArray(r) || !r.length) break;
      for (const t of r) { const ts = Date.parse(t.time) / 1000; if (ts > 0 && +t.price > 0) out.push({ t: ts, p: +t.price, q: +t.size || 0 }); }
      after = Math.min(...r.map((t) => +t.trade_id)); if (!isFinite(after) || r.length < 1000) break;
    }
    return out;
  },
  fromTrades(trades, tf) {
    const by = new Map();
    for (const x of trades.sort((a, b) => a.t - b.t)) {
      const b = Math.floor(x.t / tf) * tf, k = by.get(b);
      if (!k) by.set(b, { t: b, o: x.p, h: x.p, l: x.p, c: x.p, v: x.q }); else { k.h = Math.max(k.h, x.p); k.l = Math.min(k.l, x.p); k.c = x.p; k.v += x.q; }
    }
    const rows = [...by.values()].sort((a, b) => a.t - b.t), out = [];
    for (const k of rows) { // fill quiet buckets with flat candles so time stays continuous
      const prev = out[out.length - 1];
      if (prev) for (let t = prev.t + tf; t < k.t && out.length < 20000; t += tf) out.push({ t, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0 });
      const pc = out.length ? out[out.length - 1].c : null; // v15p4: open = prior close, so consecutive sub-minute bars always touch
      if (pc != null) { k.o = pc; if (pc > k.h) k.h = pc; if (pc < k.l) k.l = pc; }
      out.push(k);
    }
    return out;
  },
  async candles(sym, tf, n) {
    const P = providerFor(sym);
    if (tf < 60) {
      if (isStock(sym)) { if (typeof Stocks !== 'undefined' && Stocks.active === StockDemo) return simCandles(sym, (StockDemo.init(sym), StockDemo.px[sym]), tf, n, 0.55); return TFX.seedHist(sym, tf, n, await TFX.stockSub(sym, tf, n).catch(() => [])); }
      if (isOnchain(sym)) { if (OC.parse(sym).chain === 'sim') return OC.candles(sym, tf, n); let tr = []; try { tr = TFX.fromTrades((await OC.trades(sym, { noWait: true })).map((x) => ({ t: x.ts, p: x.p, q: x.q })), tf).slice(-n); } catch (e) { /* no swaps yet */ } return TFX.seedHist(sym, tf, n, tr); }
      if (P === Demo || P.id === 'demo') return P.candles(sym, tf, n);
      try {
        // one REST pull per symbol per 20 s, shared by 1s / 5s / 15s / 30s (Coinbase rate limits), merged with the live WebSocket trades
        const ck = TFX.tcache.get(sym); let rest = ck && Date.now() - ck.ts < 20000 ? ck.rows : null;
        if (!rest) { try { rest = await TFX.tradesCB(sym, n > 200 ? 6 : 4); TFX.tcache.set(sym, { rows: rest, ts: Date.now() }); } catch (e) { rest = []; } }
        const r = TFX.fromTrades(TFX.merged(rest.slice(), sym), tf); if (r.length) return r.slice(-n);
      } catch (e) { /* try the active provider */ }
      return NT.aggregate(await P.candles(sym, 60, Math.ceil(n / (60 / tf)) + 2), 60).slice(-n); // last resort: 1m bars, labelled by the store
    }
    const b = TFX.BASE[tf];
    if (b && !(P.native && P.native.includes(tf))) return NT.aggregate(await P.candles(sym, b, n * (tf / b) + tf / b), tf).slice(-n);
    return P.candles(sym, tf, n);
  },
};

const CANDLE_CAP = 5000; // v15: deep history kept per chart; live ticks only touch the active bar
class CandleStore {
  constructor(sym, tf) { this.sym = sym; this.tf = tf; this.sec = NT.TF[tf]; this.candles = []; this.loaded = false; this.loading = null; this.version = 0; this.err = null; this.deep = false; }
  load(n = 300) {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try { const c = await TFX.candles(this.sym, this.sec, n); this.merge(c); this.loaded = true; this.err = null; }
      catch (e) { this.err = e.message || String(e); }
      finally { this.loading = null; this.version++; }
    })();
    return this.loading;
  }
  /* once per store: after the fast first page, pull CANDLE_CAP candles in the background (paginating exchanges only:
     Yahoo and GeckoTerminal return what one call allows, and GeckoTerminal's 30/min limit is shared with the rest of the app) */
  backfill(n = CANDLE_CAP) {
    if (this.deep || this.loading || !this.loaded || this.candles.length >= n || isStock(this.sym) || isOnchain(this.sym) || this.sec < 60) return null;
    this.deep = true; // set once, kept on failure: a rate-limited backfill is not retried on every symbol switch
    const want = this.sec === 14400 ? Math.min(n, 1250) : n; // Coinbase builds 4h from 1h: 1,250 bars = 5,000 source candles
    return (async () => { try { this.merge(await TFX.candles(this.sym, this.sec, want)); } catch (e) { /* keep the first page */ } })();
  }
  merge(c) {
    if (!c || !c.length) return;
    const m = new Map(this.candles.map((k) => [k.t, k])), live = this.candles[this.candles.length - 1];
    for (const k of c) {
      if (live && k.t === live.t) { m.set(k.t, Object.assign({}, k, { h: Math.max(k.h, live.h), l: Math.min(k.l, live.l), c: live.c, v: Math.max(k.v, live.v) })); continue; } // live ticks already moved this bar
      m.set(k.t, k);
    }
    this.candles = [...m.values()].sort((a, b) => a.t - b.t);
    if (this.sec < 60) for (let i = 1; i < this.candles.length; i++) { const p = this.candles[i - 1].c, k = this.candles[i]; if (k.o !== p) this.candles[i] = Object.assign({}, k, { o: p, h: Math.max(k.h, p), l: Math.min(k.l, p) }); } // v15p4: every source (sim, stock ticks, trades) stays gap-free
    if (this.candles.length > CANDLE_CAP) this.candles = this.candles.slice(-CANDLE_CAP);
    this.version++;
  }
  applyTick(price, size, ts) {
    const c = this.candles; if (!c.length || !(price > 0)) return;
    const b = Math.floor(ts / this.sec) * this.sec, last = c[c.length - 1];
    if (b > last.t) {
      /* v16.4 zero-volume re-anchoring: a forming sub-minute bar that saw no trade and no price change is moved to the new
         bucket in place (no "Vol 0.00" flat bar is left behind, and quiet buckets are never back-filled with flat bars) */
      if (this.sec < 60 && c.length > 1 && !(last.v > 0) && last.o === last.h && last.h === last.l && last.l === last.c) { last.t = b; last.c = price; if (price > last.h) last.h = price; if (price < last.l) last.l = price; last.v += size || 0; this.version++; return; }
      const o = this.sec < 60 ? last.c : price; c.push({ t: b, o, h: Math.max(o, price), l: Math.min(o, price), c: price, v: size || 0 }); if (c.length > CANDLE_CAP) c.splice(0, c.length - CANDLE_CAP); } // sub-minute: open at the prior close
    else if (b === last.t) { last.c = price; if (price > last.h) last.h = price; if (price < last.l) last.l = price; last.v += size || 0; }
    else return;
    this.version++;
  }
  /* one second of trades already folded by the TickSynth worker: {t, o, h, l, c, v}; a second never spans two bars */
  applyAgg(a) {
    const c = this.candles; if (!c.length || !(a.c > 0)) return;
    const b = Math.floor(a.t / this.sec) * this.sec, last = c[c.length - 1];
    if (b > last.t) {
      if (this.sec < 60 && c.length > 1 && !(last.v > 0) && last.o === last.h && last.h === last.l && last.l === last.c) { last.t = b; last.c = a.c; if (a.h > last.h) last.h = a.h; if (a.l < last.l) last.l = a.l; last.v += a.v || 0; this.version++; return; } // v16.4 re-anchor (see applyTick)
      const o = this.sec < 60 ? last.c : a.o; c.push({ t: b, o, h: Math.max(o, a.h), l: Math.min(o, a.l), c: a.c, v: a.v }); if (c.length > CANDLE_CAP) c.splice(0, c.length - CANDLE_CAP); } // sub-minute: open at the prior close
    else if (b === last.t) { last.c = a.c; if (a.h > last.h) last.h = a.h; if (a.l < last.l) last.l = a.l; last.v += a.v; }
    else return;
    this.version++;
  }
}
function getStore(sym, tf) {
  const k = sym + '|' + tf; let s = Stores.get(k);
  if (!s) { s = new CandleStore(sym, tf); Stores.set(k, s); if (!StoresBySym.has(sym)) StoresBySym.set(sym, new Set()); StoresBySym.get(sym).add(s); }
  return s;
}

/* ───────────── v15 tick synthesis: trades are folded into one OHLCV per symbol per second in a Web Worker, so a burst
   of hundreds of trades costs the page one bar update per symbol per frame. Falls back to the main thread where workers
   can't start (file://, old browsers, Node tests). ───────────── */
const TickSynth = {
  w: null, off: typeof Worker === 'undefined' || typeof Blob === 'undefined', q: [], due: false,
  SRC: 'const g=new Map();let t=0;onmessage=(e)=>{for(const x of e.data){const k=x[0]+"|"+Math.floor(x[3]);let a=g.get(k);if(!a){a={s:x[0],t:Math.floor(x[3]),o:x[1],h:x[1],l:x[1],c:x[1],v:0};g.set(k,a)}if(x[1]>a.h)a.h=x[1];if(x[1]<a.l)a.l=x[1];a.c=x[1];a.v+=x[2]||0}if(!t)t=setTimeout(()=>{t=0;postMessage([...g.values()]);g.clear()},16)}',
  init() {
    try {
      TickSynth.w = new Worker(URL.createObjectURL(new Blob([TickSynth.SRC], { type: 'text/javascript' })));
      TickSynth.w.onmessage = (e) => { for (const a of e.data) { const ss = StoresBySym.get(a.s); if (ss) for (const s of ss) s.applyAgg(a); } };
      TickSynth.w.onerror = () => { TickSynth.off = true; TickSynth.w = null; };
    } catch (e) { TickSynth.off = true; TickSynth.w = null; }
  },
  push(sym, p, q, ts) {
    if (TickSynth.off || !(p > 0) || !isFinite(ts)) return false;
    if (!TickSynth.w) { TickSynth.init(); if (!TickSynth.w) return false; }
    TickSynth.q.push([sym, p, q || 0, ts]);
    if (!TickSynth.due) { TickSynth.due = true; queueMicrotask(() => { TickSynth.due = false; const b = TickSynth.q; TickSynth.q = []; if (TickSynth.w) TickSynth.w.postMessage(b); }); }
    return true;
  },
};
/* exchange-to-screen latency of the live socket (trade timestamp vs now, smoothed), shown in the header pill */
const WSStat = {
  ms: null, at: 0,
  lag(ts) { const d = Date.now() - ts * 1000; if (!(d > -5000 && d < 60000)) return; WSStat.ms = WSStat.ms == null ? Math.max(0, d) : WSStat.ms * 0.9 + Math.max(0, d) * 0.1; WSStat.at = Date.now(); },
  get() { return WSStat.ms != null && Date.now() - WSStat.at < 15000 ? Math.round(WSStat.ms) : null; },
};

/* ───────────── live feed ───────────── */
const Feed = {
  live: {}, subs: new Set(), tickL: [], tradeL: [], stateL: [], stream: null, state: 'idle', mode: '', lastTick: 0, poll: null,
  start() {
    Feed.stop();
    const h = { tick: Feed.tick, trade: Feed.trade, state: (s, m) => { Feed.state = s; Feed.mode = m; Feed.stateL.forEach((f) => f(s, m)); } };
    Feed.stream = Providers.active.stream(h);
    if (Feed.subs.size) Feed.stream.sub([...Feed.subs]);
    Feed.poll = setInterval(Feed.pollFallback, 5000);
  },
  stop() { if (Feed.stream) Feed.stream.close(); Feed.stream = null; clearInterval(Feed.poll); },
  subscribe(syms) {
    const nw = [], st = [];
    for (const s of syms) { if (!s) continue; if (/^oc:/.test(s)) { if (typeof OC !== 'undefined') OC.subscribe([s]); continue; } if (isStock(s)) { st.push(s); continue; } if (!Feed.subs.has(s)) { Feed.subs.add(s); nw.push(s); } }
    if (st.length) StockFeed.subscribe(st);
    if (nw.length && Feed.stream) Feed.stream.sub(nw);
  },
  tick(sym, price, x = {}) {
    const L = Feed.live[sym] || (Feed.live[sym] = {});
    L.price = price; L.ts = Date.now();
    if (x.open24) L.open24 = x.open24;
    if (x.bid) L.bid = x.bid; if (x.ask) L.ask = x.ask; if (x.vol24) L.vol24 = x.vol24; if (x.high24) L.high24 = x.high24; if (x.low24) L.low24 = x.low24;
    Feed.lastTick = Date.now(); if (isStock(sym)) TFX.note(sym, price, 0, x.ts || Date.now() / 1000);
    const ss = StoresBySym.get(sym); if (ss) for (const s of ss) s.applyTick(price, 0, x.ts || Date.now() / 1000);
    for (const f of Feed.tickL) { try { f(sym, price); } catch (e) { console.warn(e); } }
  },
  trade(sym, price, size, side, ts) {
    WSStat.lag(ts); TFX.note(sym, price, size, ts);
    if (!TickSynth.push(sym, price, size, ts)) { const ss = StoresBySym.get(sym); if (ss) for (const s of ss) s.applyTick(price, size, ts); }
    for (const f of Feed.tradeL) { try { f(sym, price, size, side, ts); } catch (e) { console.warn(e); } }
  },
  async pollFallback() {
    if (Providers.active === Demo || !Providers.active) return;
    if (Feed.state === 'live' && Date.now() - Feed.lastTick < 20000) return;
    const list = [...Feed.subs].slice(0, 10);
    await pool(list, 3, async (s) => { const t = await Providers.active.ticker(s); if (t && t.price) Feed.tick(s, t.price, { bid: t.bid, ask: t.ask }); });
  },
};

/* ───────────── external (keyless) sources ───────────── */
const Ext = {
  async markets() {
    const r = await J.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d');
    return r.map((c) => ({ sym: String(c.symbol).toUpperCase(), name: c.name, price: c.current_price, mcap: c.market_cap, vol: c.total_volume, ch1h: c.price_change_percentage_1h_in_currency, ch24h: c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h, ch7d: c.price_change_percentage_7d_in_currency, rank: c.market_cap_rank }));
  },
  async global() {
    const d = (await J.get('https://api.coingecko.com/api/v3/global')).data;
    return { mcap: d.total_market_cap.usd, vol: d.total_volume.usd, btcDom: d.market_cap_percentage.btc, ethDom: d.market_cap_percentage.eth, ch24h: d.market_cap_change_percentage_24h_usd };
  },
  async fng() { const r = await J.get('https://api.alternative.me/fng/?limit=30'); return r.data.map((x) => ({ v: +x.value, label: x.value_classification, t: +x.timestamp })); },
  async news() {
    const r = await J.get('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
    return (r.Data || []).slice(0, 40).map((n) => ({ id: n.id, title: n.title, body: n.body || '', source: (n.source_info && n.source_info.name) || n.source || '', url: n.url, t: n.published_on, cats: String(n.categories || '').split('|') }));
  },
};

/* universal market list: CoinGecko -> exchange 24h stats -> demo */
async function loadMarketList() {
  if (Providers.active === Demo) return { items: await Demo.markets(), src: 'Demo (simulated)', full: true };
  try { return { items: await Ext.markets(), src: 'CoinGecko', full: true }; } catch (e) { /* fall through */ }
  const bases = Providers.list.map((p) => p.base).filter((b) => !NT.STABLES.has(b));
  const pref = FALLBACK_BASES.filter((b) => bases.includes(b));
  const items = Providers.active === CB ? await CB.tickers(pref) : await Providers.active.tickers();
  items.sort((a, b) => (b.vol || 0) - (a.vol || 0));
  return { items: items.slice(0, 100), src: Providers.active.name + ' 24h stats (sized by volume)', full: false };
}

/* ───────────── deep history for backtests (way beyond the live chart's 300 candles) ───────────── */
const History = {
  cache: new Map(), MAX: 200000,
  // Yahoo's per-interval look-back limits (days); crypto via Coinbase has years of 1-minute data
  stockLimitDays: { 60: 29, 300: 59, 900: 59, 3600: 729, 14400: 729, 86400: 1e6 },
  async withRetry(fn, tries = 5) {
    let last; for (let k = 0; k < tries; k++) { try { return await fn(); } catch (e) { last = e; if (!/429|rate|timeout|5\d\d|fetch/i.test(e.message)) throw e; await sleep(600 * (k + 1) + Math.random() * 400); } }
    throw last;
  },
  async coinbase(sym, tf, n, onProg) {
    const src = tf === 14400 ? 3600 : tf, factor = tf === 14400 ? 4 : 1, need = Math.min(History.MAX * factor, n * factor), pages = Math.ceil(need / 300);
    const end = Math.floor(Date.now() / 1000 / src) * src + src, wins = [];
    for (let p = 0; p < pages; p++) { const e = end - p * 300 * src, cnt = Math.min(300, need - p * 300); wins.push([e - cnt * src, e]); }
    let done = 0, got = 0, empty = 0; const all = [];
    await pool(wins, 3, async ([s, e]) => {
      if (empty >= 6) { done++; return; } // walked past the listing date
      const rows = await History.withRetry(() => CB.page(sym, src, s, e - 1));
      if (!rows.length) empty++; else { empty = 0; all.push(...rows); got += rows.length; }
      done++; if (onProg) onProg(done, wins.length, Math.round(got / factor));
    });
    const m = new Map(); for (const k of all) m.set(k.t, k);
    let out = [...m.values()].sort((a, b) => a.t - b.t);
    if (factor > 1) out = NT.aggregate(out, tf);
    return out.slice(-n);
  },
  async yahoo(sym, tf, n, onProg) {
    const now = Math.floor(Date.now() / 1000), iv = { 60: '1m', 300: '5m', 900: '15m', 3600: '60m', 14400: '60m', 86400: '1d' }[tf] || '1d';
    const days = Math.min(History.stockLimitDays[tf] || 365, (n * tf) / 86400 * (tf < 86400 ? 3.6 : 1.5) + 5); // trading hours are ~27% of the day
    let rows = [];
    if (tf === 86400) {
      const p1 = days > 20000 ? 0 : now - Math.ceil(days * 86400);
      rows = (await History.withRetry(() => YF.chartP(sym, '1d', p1, now))).rows; if (onProg) onProg(1, 1, rows.length);
    } else {
      const chunk = tf === 60 ? 7 : days, wins = [];
      for (let e = now; e > now - days * 86400; e -= chunk * 86400) wins.push([Math.max(now - Math.floor(days * 86400), e - chunk * 86400), e]);
      let d = 0;
      for (const [a, b] of wins) { try { rows = rows.concat((await History.withRetry(() => YF.chartP(sym, iv, a, b))).rows); } catch (e) { if (!rows.length && d === 0) throw e; } d++; if (onProg) onProg(d, wins.length, rows.length); }
      const m = new Map(); for (const k of rows) m.set(k.t, k); rows = [...m.values()].sort((a, b) => a.t - b.t);
    }
    if (tf === 14400) rows = NT.aggregate(rows, 14400);
    return rows.slice(-n);
  },
  async get(sym, tf, n, onProg) {
    n = Math.max(60, Math.min(History.MAX, Math.round(n)));
    const k = sym + '|' + tf, c = History.cache.get(k);
    if (c && (c.rows.length >= n || c.full) && Date.now() - c.ts < 10 * 60000) return c.rows.slice(-n);
    let rows, src;
    if (tf < 60) { rows = await TFX.candles(sym, tf, n); src = isOnchain(sym) ? 'recent DEX swaps' : isStock(sym) ? 'launcher quote ticks' : 'recent trades (Coinbase)'; rows.src = src; History.cache.set(k, { rows, ts: Date.now() - 9 * 60000, full: true }); return rows; }
    if (TFX.BASE[tf]) { const b = TFX.BASE[tf], f = tf / b; const base = await History.get(sym, b, Math.min(History.MAX, n * f + f), onProg); rows = NT.aggregate(base, tf).slice(-n); rows.src = (base.src || '') + ' → ' + Object.keys(NT.TF).find((x) => NT.TF[x] === tf); return rows; }
    if (isOnchain(sym)) { rows = await OC.history(sym, tf, n, onProg); src = OC.parse(sym).chain === 'sim' ? 'simulated' : 'GeckoTerminal (DEX trades)'; }
    else if (isStock(sym)) {
      if (Stocks.active === StockDemo) { rows = simCandles(sym, (StockDemo.init(sym), StockDemo.px[sym]), tf, n, 0.55); src = 'simulated'; }
      else { rows = await History.yahoo(sym, tf, n, onProg); src = 'Yahoo Finance'; }
    } else if (Providers.active === Demo) { Demo.init(); rows = simCandles(sym, Demo.px[sym] || 100, tf, n, 1); src = 'simulated'; }
    else {
      try { rows = await History.coinbase(sym, tf, n, onProg); src = 'Coinbase'; }
      catch (e) { rows = await Providers.active.candles(sym, tf, Math.min(n, 720)); src = Providers.active.name + ' (limited history)'; }
    }
    rows.src = src; History.cache.set(k, { rows, ts: Date.now(), full: rows.length < n });
    return rows;
  },
};
