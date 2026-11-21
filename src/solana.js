/* ExTerm Solana wallet tracker — terminal-style tracking of Solana wallets.
   Live: websocket logsSubscribe for alert wallets + batched polling of every wallet. Decodes swaps on pump.fun, PumpSwap, Raydium,
   Jupiter, Meteora and Orca from public RPC data. Token info/prices from DexScreener. Holdings via getTokenAccountsByOwner. */
const Sol = (() => {
  const S = {
    wallets: [], trades: [], ids: new Set(), tokens: {}, listeners: [], stopped: true, sim: false, custom: '', speed: 'normal',
    st: 'idle', err: null, stats: { req: 0, err: 0, checks: 0, tx: 0, t0: Date.now() }, rpcUsed: '', solPx: null, watchMints: null,
    ws: { st: 'off', subs: 0, want: 0, err: null }, noBatch: false, DEXS: 'https://api.dexscreener.com', queueLen: 0,
  };
  const WSOL = 'So11111111111111111111111111111111111111112', USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const TOKEN_PROGS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  const DEX = {
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun', 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap', '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM', 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM', 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj': 'LaunchLab',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca', 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora', 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG': 'Meteora',
    'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN': 'Meteora DBC', 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
  };
  const PUBLIC = ['https://api.mainnet-beta.solana.com', 'https://solana.drpc.org', 'https://solana.api.onfinality.io/public', 'https://solana-rpc.publicnode.com']; // v17.1: publicnode last (shared rate limits, frequent SSLError)
  const PUBLIC_WS = 'wss://solana-rpc.publicnode.com';
  let rpcI = 0, loopT = null, balT = null, tokT = null, simT = null, txT = null, busyPoll = false, cool = {}, tokQ = new Set(), txQ = [], txBusy = 0, sock = null, subMap = {}, seenSig = new Set(), reqId = 1;
  S.WSOL = WSOL; S.health = {}; S.firstN = 3; S.queueTokens = (ms) => { for (const m of ms || []) tokQ.add(m); };
  // security: third-party token metadata is attacker-controlled (anyone can mint a token with any name/link)
  S.clean = (v, n) => (v == null ? v : String(v).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/g, '').slice(0, n || 48));
  S.okUrl = (u, re) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && (!re || re.test(x.href)) ? x.href : null; } catch (e) { return null; } }; S.endpointsInfo = () => endpoints().map((u) => ({ u: u.replace(/\?.*$/, '').replace(/^https:\/\//, ''), cool: cool[u] && Date.now() < cool[u] ? Math.ceil((cool[u] - Date.now()) / 1000) : 0, fails: S.health[u] || 0, used: S.rpcUsed === u.replace(/\?.*$/, '') }));
  S.isAddr = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || ''));
  S.short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '?');
  const endpoints = () => (S.custom ? [S.custom] : PUBLIC);
  const allCool = () => endpoints().every((u) => cool[u] && Date.now() < cool[u]);
  const isRate = (m) => /429|rate|too many|limit/i.test(m || '');

  // token bucket: public nodes reject bursts (and the browser reports those rejections as "Failed to fetch"); pace requests instead
  const bucket = { t: 0, tok: 8 };
  async function take(cost) {
    const rate = S.custom ? 25 : 3.5, cap = S.custom ? 50 : 8; // requests per second / burst
    for (;;) { const now = Date.now(); bucket.tok = Math.min(cap, bucket.tok + ((now - bucket.t) / 1000) * rate); bucket.t = now; if (bucket.tok >= Math.min(cost, cap)) { bucket.tok -= Math.min(cost, cap); return; } await new Promise((r) => setTimeout(r, Math.ceil(((Math.min(cost, cap) - bucket.tok) / rate) * 1000) + 20)); }
  }
  async function post(body, timeout, force) {
    await take(Array.isArray(body) ? body.length : 1);
    const eps = endpoints(); let last = null;
    // if every endpoint is cooling down, wait for the soonest one (max 8 s) instead of failing: a single private RPC must never freeze the tracker
    if (!force) { const soon = Math.min(...eps.map((u) => (cool[u] && cool[u] > Date.now() ? cool[u] : 0))); if (soon > Date.now() && eps.every((u) => cool[u] && cool[u] > Date.now())) await new Promise((r) => setTimeout(r, Math.min(8000, soon - Date.now()))); }
    for (let k = 0; k < eps.length; k++) {
      const i = (rpcI + k) % eps.length, url = eps[i];
      if (!force && cool[url] && Date.now() < cool[url]) { last = new Error('RPC rate limit, cooling down'); continue; }
      try {
        S.stats.req += Array.isArray(body) ? body.length : 1;
        const r = await J.post(url, body, { timeout: timeout || 20000, proxy: J.proxy && !/^https?:\/\/(localhost|127\.)/.test(url) });
        if (!Array.isArray(body) && r && r.error) { const e = new Error(r.error.message || 'rpc error'); e.rpc = true; if (isRate(e.message)) { cool[url] = Date.now() + 10000; last = e; continue; } throw e; }
        rpcI = i; S.rpcUsed = url.replace(/\?.*$/, ''); S.health[url] = 0; return r;
      } catch (e) {
        if (e.rpc) throw e; S.stats.err++;
        // public nodes answer rate-limits without CORS headers, which the browser reports as "Failed to fetch": treat both as a cooldown and rotate
        if (/timeout/i.test(e.message)) cool[url] = Date.now() + 2500; // slow answer: brief pause, no escalation
        else if (/HTTP (429|403|5\d\d)|Failed to fetch|CORS/i.test(e.message)) { S.health[url] = (S.health[url] || 0) + 1; cool[url] = Date.now() + Math.min(eps.length > 1 ? 60000 : 8000, 8000 * S.health[url]); } // a single (private) endpoint never cools for more than 8 s
        last = e;
      }
    }
    if (last && /Failed to fetch|CORS/i.test(last.message)) last = new Error('public Solana nodes are rate-limiting this browser; retrying automatically' + (J.proxy ? '' : ' (launch with start-exterm.bat to avoid this)'));
    throw last || new Error('no RPC endpoint');
  }
  async function rpc(method, params, force) { const r = await post({ jsonrpc: '2.0', id: reqId++, method, params }, null, force); return r.result; }
  // JSON-RPC batch; falls back to sequential calls if the endpoint doesn't support batching
  async function batch(calls) {
    if (!calls.length) return [];
    if (!S.noBatch) {
      try {
        const body = calls.map((c, k) => ({ jsonrpc: '2.0', id: k + 1, method: c[0], params: c[1] }));
        const r = await post(body, 30000);
        if (!Array.isArray(r)) throw new Error((r && r.error && r.error.message) || 'batch unsupported');
        const out = new Array(calls.length).fill(null);
        for (const x of r) { if (x && x.id >= 1 && x.id <= calls.length) out[x.id - 1] = x.error ? { error: x.error.message || 'error' } : { result: x.result }; }
        if (r.some((x) => x && x.error && isRate(x.error.message))) { cool[endpoints()[rpcI]] = Date.now() + 8000; }
        return out;
      } catch (e) {
        if (/batch|not supported|unsupported|invalid request|HTTP 4/i.test(e.message) && !isRate(e.message)) S.noBatch = true; else throw e;
      }
    }
    const out = [];
    for (const c of calls) { try { out.push({ result: await rpc(c[0], c[1]) }); } catch (e) { out.push({ error: e.message }); if (isRate(e.message)) break; } }
    while (out.length < calls.length) out.push({ error: 'skipped (rate limit)' });
    return out;
  }
  S.rpc = rpc; S.batch = batch; S.endpointsList = () => endpoints();

  /* ── wallet list ── */
  const mk = (o) => ({ addr: o.trackedWalletAddress || o.addr, name: o.name || '', emoji: o.emoji || '👛', alerts: !!(o.alertsOn != null ? o.alertsOn : o.alerts), lastSig: o.lastSig || null, lastTs: o.lastTs || null, lastCheck: 0, bal: null, buys: o.buys || 0, sells: o.sells || 0, err: null, recent: [], holdings: null, busy: false, ext: o.ext || null });
  S.byAddr = (a) => S.wallets.find((w) => w.addr === a);
  S.load = (list, replace) => {
    const cur = new Map(S.wallets.map((w) => [w.addr, w])), out = replace ? [] : S.wallets.slice(), seen = new Set(out.map((w) => w.addr));
    let added = 0, updated = 0, skipped = 0;
    for (const o of list || []) {
      const a = String(o.trackedWalletAddress || o.addr || '').trim();
      if (!S.isAddr(a)) { skipped++; continue; }
      if (seen.has(a) && !replace) { const w = cur.get(a); if (o.name) w.name = o.name; if (o.emoji) w.emoji = o.emoji; if (o.alertsOn != null) w.alerts = !!o.alertsOn; updated++; continue; }
      if (seen.has(a)) { skipped++; continue; }
      const w = cur.get(a) ? Object.assign(cur.get(a), { name: o.name || cur.get(a).name, emoji: o.emoji || cur.get(a).emoji, alerts: !!(o.alertsOn != null ? o.alertsOn : o.alerts) }) : mk(Object.assign({}, o, { addr: a }));
      out.push(w); seen.add(a); added++;
    }
    S.wallets = out; if (!S.stopped && !S.sim) wsSync(); return { added, updated, skipped };
  };
  S.add = (addr, name, emoji, alerts) => { const r = S.load([{ trackedWalletAddress: addr, name, emoji, alertsOn: !!alerts }]); return r.added ? { ok: true } : { ok: false, err: S.isAddr(addr) ? 'Already tracking that wallet' : 'Not a valid Solana address' }; };
  S.remove = (addr) => { S.wallets = S.wallets.filter((w) => w.addr !== addr); wsSync(); };
  S.setAlert = (addr, on) => { const w = S.byAddr(addr); if (w) { w.alerts = on; wsSync(); } };
  S.exportList = () => S.wallets.map((w) => ({ trackedWalletAddress: w.addr, name: w.name, emoji: w.emoji, alertsOn: w.alerts }));
  S.persist = () => S.wallets.map((w) => ({ addr: w.addr, name: w.name, emoji: w.emoji, alerts: w.alerts, lastSig: w.lastSig, lastTs: w.lastTs, buys: w.buys, sells: w.sells, ext: w.ext && !w.ext.err ? w.ext : undefined }));
  S.restoreTrades = (arr) => { for (const t of arr || []) if (!S.ids.has(t.id)) { S.ids.add(t.id); S.trades.push(Object.assign(t, { hist: true })); const w = S.byAddr(t.wallet); if (w && w.recent.length < 15) w.recent.push(t); } S.trades.sort((a, b) => b.ts - a.ts); };

  /* ── transaction decoding ── */
  function parse(tx, w, sig) {
    if (!tx || !tx.meta || tx.meta.err || !tx.transaction) return null;
    const keys = (tx.transaction.message.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
    const i = keys.indexOf(w.addr);
    let sol = 0;
    if (i >= 0) { sol = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9; if (i === 0) sol += (tx.meta.fee || 0) / 1e9; }
    const tok = {};
    const add = (arr, sgn) => { for (const b of arr || []) { if (b.owner !== w.addr) continue; const u = b.uiTokenAmount || {}; const amt = Number(u.uiAmountString != null ? u.uiAmountString : u.uiAmount || 0); tok[b.mint] = (tok[b.mint] || 0) + sgn * amt; } };
    add(tx.meta.preTokenBalances, -1); add(tx.meta.postTokenBalances, 1);
    if (tok[WSOL]) sol += tok[WSOL]; delete tok[WSOL];
    const stable = (tok[USDC] || 0) + (tok[USDT] || 0); delete tok[USDC]; delete tok[USDT];
    let mint = null, amt = 0;
    for (const [m, d] of Object.entries(tok)) if (d !== 0 && (mint === null || Math.abs(d) > Math.abs(amt))) { mint = m; amt = d; }
    let dex = null; for (const k of keys) if (DEX[k]) { dex = DEX[k]; if (dex !== 'Jupiter') break; }
    const px = S.solPx || 0, ts = (tx.blockTime || Date.now() / 1000) * 1000;
    let side = null, q = 0, usd = null;
    if (mint && amt > 0 && (sol < -0.0005 || stable < 0)) { side = 'buy'; q = Math.max(0, -sol); usd = stable < 0 ? -stable : px ? -sol * px : null; }
    else if (mint && amt < 0 && (sol > 0.0005 || stable > 0)) { side = 'sell'; q = Math.max(0, sol); usd = stable > 0 ? stable : px ? sol * px : null; }
    else if (mint) side = amt > 0 ? 'recv' : 'send';
    else if (Math.abs(sol) >= 0.5) { side = sol > 0 ? 'sol_in' : 'sol_out'; q = Math.abs(sol); usd = px ? q * px : null; }
    if (!side) return null;
    return { id: sig + ':' + (mint || 'sol'), sig, ts, wallet: w.addr, name: w.name, emoji: w.emoji, alerts: w.alerts, side, mint, amt: Math.abs(amt), sol: q, usd, px: usd && amt ? usd / Math.abs(amt) : null, dex };
  }
  S.parse = parse;

  function emit(ev, hist) {
    if (S.ids.has(ev.id)) return;
    S.ids.add(ev.id); ev.hist = !!hist;
    S.trades.unshift(ev); if (S.trades.length > 1 && S.trades[1].ts > ev.ts) S.trades.sort((a, b) => b.ts - a.ts);
    if (S.trades.length > 3000) { for (const t of S.trades.splice(3000)) S.ids.delete(t.id); }
    const w = S.byAddr(ev.wallet);
    if (w) { if (!hist) { if (ev.side === 'buy') w.buys++; else if (ev.side === 'sell') w.sells++; } w.recent.unshift(ev); w.recent.sort((a, b) => b.ts - a.ts); w.recent = w.recent.slice(0, 25); if (!w.lastTs || ev.ts > w.lastTs) w.lastTs = ev.ts; }
    if (ev.mint) tokQ.add(ev.mint);
    S.listeners.forEach((f) => { try { f(ev); } catch (e) { console.warn(e); } });
  }
  S.emit = emit;

  /* ── transaction queue (fed by websocket + polling) ── */
  function queueTx(w, sig, blockTime) { if (seenSig.has(sig)) return; seenSig.add(sig); if (seenSig.size > 20000) seenSig = new Set([...seenSig].slice(-10000)); txQ.push({ w, sig, bt: blockTime }); S.queueLen = txQ.length; }
  async function drainTx() {
    if (S.stopped || S.sim || !txQ.length || allCool()) return;
    const lim = S.custom ? 4 : 1; if (txBusy >= lim) return;
    const n = S.noBatch ? 1 : S.custom ? 10 : 4, job = txQ.splice(0, n); S.queueLen = txQ.length; txBusy++;
    try {
      const res = await batch(job.map((j) => ['getTransaction', [j.sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]]));
      res.forEach((r, k) => {
        const j = job[k];
        if (!r || r.error || !r.result) { if (r && r.error && isRate(r.error)) { txQ.unshift(j); } else if (!r || !r.result) { j.tries = (j.tries || 0) + 1; if (j.tries < 3) txQ.push(j); } return; }
        S.stats.tx++; const ev = parse(r.result, j.w, j.sig); if (ev) emit(ev, Date.now() - ev.ts > 15 * 60000 || j.hist);
      });
    } catch (e) { txQ.unshift(...job); S.err = e.message; }
    finally { txBusy--; S.queueLen = txQ.length; }
  }

  /* ── batched polling ── */
  S.interval = (w) => { const base = S.speed === 'fast' ? 6 : S.speed === 'slow' ? 45 : 15, f = S.custom ? 1 : 3; return (w.alerts ? base : base * 4) * f * 1000 * (w.alerts && S.ws.st === 'live' && S.ws.subs ? 2 : 1); };
  async function poll() {
    if (S.stopped || S.sim || busyPoll || allCool()) return;
    const now = Date.now();
    const due = S.wallets.filter((w) => now - w.lastCheck >= S.interval(w)).sort((a, b) => (a.lastCheck - S.interval(a)) - (b.lastCheck - S.interval(b)) || (b.alerts - a.alerts));
    if (!due.length) return;
    const n = S.noBatch ? (S.custom ? 4 : 2) : (S.custom ? 40 : 5), grp = due.slice(0, n);
    busyPoll = true;
    try {
      const res = await batch(grp.map((w) => ['getSignaturesForAddress', [w.addr, w.lastSig ? { limit: 15, until: w.lastSig, commitment: 'confirmed' } : { limit: S.firstN, commitment: 'confirmed' }]]));
      let rateHit = false;
      res.forEach((r, k) => {
        const w = grp[k];
        if (!r || r.error) { w.err = r ? r.error : 'no response'; if (r && isRate(r.error)) rateHit = true; else w.lastCheck = Date.now(); return; }
        w.lastCheck = Date.now(); w.err = null; S.stats.checks++;
        const sigs = r.result || []; w.quiet = !sigs.length && !w.lastSig; if (!sigs.length) return;
        const first = !w.lastSig;
        w.lastSig = sigs[0].signature; w.lastTs = Math.max(w.lastTs || 0, (sigs[0].blockTime || Date.now() / 1000) * 1000);
        if (!first) { for (const s of sigs.slice(0, 8).reverse()) if (!s.err) queueTx(w, s.signature, s.blockTime); }
        else for (const s of sigs.slice(0, S.firstN).reverse()) if (!s.err) { queueTx(w, s.signature, s.blockTime); txQ[txQ.length - 1].hist = true; } // backfill: show what they bought recently
      });
      S.st = rateHit ? 'throttled' : 'live'; S.err = rateHit ? 'RPC rate limit, slowing down' : null;
    } catch (e) { S.err = e.message; S.st = isRate(e.message) ? 'throttled' : 'error'; }
    busyPoll = false;
  }

  /* ── websocket (instant updates for alert wallets) ── */
  function wsUrl() { if (S.custom) return S.custom.replace(/^http/i, 'ws'); return PUBLIC_WS; }
  function wsSync() {
    if (S.stopped || S.sim || typeof WebSocket === 'undefined') return;
    const want = S.wallets.filter((w) => w.alerts).slice(0, S.custom ? 300 : 80);
    S.ws.want = want.length;
    if (!want.length) { if (sock) { sock.close(); sock = null; } S.ws.st = 'off'; return; }
    if (!sock || sock.url !== wsUrl()) {
      if (sock) sock.close(); subMap = {}; S.ws.subs = 0;
      sock = new Sock(wsUrl(), {
        onState: (s) => { S.ws.st = s; if (s !== 'live') { S.ws.subs = 0; subMap = {}; } },
        ping: { jsonrpc: '2.0', id: 1, method: 'ping' }, pingMs: 50000, // keepalive: Helius / public RPCs drop sockets idle ~60s+; the error reply (id 1) is ignored
        onOpen: () => { S.ws.err = null; subMap = {}; pendingSub = {}; S.ws.subs = 0; subscribeAll(); },
        onMsg: (m) => {
          if (m.id && m.id >= 100000 && pendingSub[m.id]) { const a = pendingSub[m.id]; delete pendingSub[m.id]; if (m.result != null) { subMap[m.result] = a; S.ws.subs++; } else if (m.error) S.ws.err = m.error.message; return; }
          if (m.method === 'logsNotification' && m.params) {
            const a = subMap[m.params.subscription], v = m.params.result && m.params.result.value, w = a && S.byAddr(a);
            if (w && v && v.signature && !v.err) { queueTx(w, v.signature, null); w.lastTs = Date.now(); }
          }
        },
      });
      sock.open();
    } else if (sock.state === 'live') subscribeAll();
  }
  let pendingSub = {}, subId = 100000;
  function subscribeAll() {
    if (!sock || sock.state !== 'live') return;
    const have = new Set(Object.values(subMap).concat(Object.values(pendingSub)));
    const want = S.wallets.filter((w) => w.alerts).slice(0, S.custom ? 300 : 80);
    for (const w of want) if (!have.has(w.addr)) { const id = subId++; pendingSub[id] = w.addr; sock.send({ jsonrpc: '2.0', id, method: 'logsSubscribe', params: [{ mentions: [w.addr] }, { commitment: 'confirmed' }] }); }
  }
  S.wsSync = wsSync;

  /* ── history, balances, holdings ── */
  S.history = async (w, n = 15) => {
    const sigs = await rpc('getSignaturesForAddress', [w.addr, { limit: n, commitment: 'confirmed' }]);
    if (sigs.length && !w.lastSig) { w.lastSig = sigs[0].signature; w.lastTs = (sigs[0].blockTime || 0) * 1000; }
    const ok = sigs.filter((s) => !s.err); let got = 0;
    for (let k = 0; k < ok.length; k += 5) {
      const res = await batch(ok.slice(k, k + 5).map((s) => ['getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]]));
      res.forEach((r, j) => { if (r && r.result) { seenSig.add(ok[k + j].signature); const ev = parse(r.result, w, ok[k + j].signature); if (ev) { emit(ev, true); got++; } } });
    }
    return got;
  };
  async function balances() {
    if (S.stopped || S.sim || !S.wallets.length) return;
    for (let i = 0; i < S.wallets.length; i += 100) {
      const ch = S.wallets.slice(i, i + 100);
      try { const r = await rpc('getMultipleAccounts', [ch.map((w) => w.addr), { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]); (r.value || []).forEach((a, k) => { ch[k].bal = a ? a.lamports / 1e9 : 0; }); } catch (e) { /* retry next round */ }
    }
  }
  S.balances = balances;
  S.loadHoldings = async (w) => {
    if (S.sim) { w.holdings = (S._simToks || []).slice(0, 5).map((m) => ({ mint: m, amt: Math.random() * 1e6 })); return w.holdings; }
    const res = await batch(TOKEN_PROGS.map((pid) => ['getTokenAccountsByOwner', [w.addr, { programId: pid }, { encoding: 'jsonParsed', commitment: 'confirmed' }]]));
    const h = {};
    for (const r of res) for (const a of (r && r.result && r.result.value) || []) {
      const info = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info; if (!info) continue;
      const amt = Number(info.tokenAmount.uiAmountString != null ? info.tokenAmount.uiAmountString : info.tokenAmount.uiAmount || 0);
      if (amt > 0 && info.mint !== WSOL) h[info.mint] = (h[info.mint] || 0) + amt;
    }
    w.holdings = Object.entries(h).map(([mint, amt]) => ({ mint, amt }));
    w.holdings.slice(0, 60).forEach((x) => tokQ.add(x.mint));
    await tokens();
    return w.holdings;
  };
  // realised/unrealised PnL per token from the trades this app has decoded for the wallet
  S.walletStats = (w) => {
    const per = {};
    for (const t of S.trades) {
      if (t.wallet !== w.addr || !t.mint || (t.side !== 'buy' && t.side !== 'sell') || t.usd == null) continue;
      const x = per[t.mint] || (per[t.mint] = { mint: t.mint, buyUsd: 0, sellUsd: 0, buyAmt: 0, sellAmt: 0, n: 0, last: 0 });
      if (t.side === 'buy') { x.buyUsd += t.usd; x.buyAmt += t.amt || 0; } else { x.sellUsd += t.usd; x.sellAmt += t.amt || 0; }
      x.n++; x.last = Math.max(x.last, t.ts);
    }
    let realized = 0, wins = 0, closed = 0, vol = 0;
    const rows = Object.values(per).map((x) => {
      const avg = x.buyAmt ? x.buyUsd / x.buyAmt : null, rp = avg != null && x.sellAmt ? x.sellUsd - Math.min(x.sellAmt, x.buyAmt) * avg : 0;
      const left = Math.max(0, x.buyAmt - x.sellAmt), px = S.priceOf(x.mint), un = avg != null && left && px ? left * (px - avg) : null;
      if (x.sellAmt && x.buyAmt) { closed++; if (rp > 0) wins++; realized += rp; }
      vol += x.buyUsd + x.sellUsd;
      return Object.assign(x, { avg, realized: rp, left, unreal: un });
    }).sort((a, b) => b.last - a.last);
    return { rows, realized, winRate: closed ? (wins / closed) * 100 : null, closed, vol };
  };

  /* ── token info (DexScreener) ── */
  async function dexFetch(ch) {
    try { const r = await J.get(`${S.DEXS}/tokens/v1/solana/${ch.join(',')}`, { timeout: 10000 }); if (Array.isArray(r)) return r; } catch (e) { /* fall back */ }
    const r = await J.get(`${S.DEXS}/latest/dex/tokens/${ch.join(',')}`, { timeout: 10000 }); return r.pairs || [];
  }
  async function tokens() {
    if (S.stopped && !S._force) return;
    const now = Date.now(), want = new Set(tokQ); tokQ.clear();
    if (S.watchMints) for (const m of S.watchMints()) want.add(m);
    if (!S.solPx) want.add(WSOL);
    const list = [...want].filter((m) => { const t = S.tokens[m]; return !t || (!t.sim && now - t.ts > 15000); }).slice(0, 90);
    for (let i = 0; i < list.length; i += 30) {
      const ch = list.slice(i, i + 30);
      try {
        const pairs = await dexFetch(ch), best = {};
        for (const p of pairs) {
          if ((p.chainId && p.chainId !== 'solana') || !p.baseToken) continue; const m = p.baseToken.address; if (!ch.includes(m)) continue;
          if (!best[m] || ((p.liquidity && p.liquidity.usd) || 0) > ((best[m].liquidity && best[m].liquidity.usd) || 0)) best[m] = p;
        }
        for (const m of ch) {
          const p = best[m];
          S.tokens[m] = p ? { sym: S.clean(p.baseToken.symbol, 16), name: S.clean(p.baseToken.name, 48), price: +p.priceUsd || null, mcap: p.marketCap || p.fdv || null, liq: p.liquidity ? p.liquidity.usd : null, ch24: p.priceChange ? p.priceChange.h24 : null, ch1h: p.priceChange ? p.priceChange.h1 : null, vol24: p.volume ? p.volume.h24 : null, url: S.okUrl(p.url, /^https:\/\/(www\.)?dexscreener\.com\//), img: S.okUrl(p.info && p.info.imageUrl, /^https:\/\//), created: p.pairCreatedAt || null, ts: now } : Object.assign(S.tokens[m] || { sym: null }, { ts: now });
          if (m === WSOL && p && !S.solPx) S.solPx = +p.priceUsd;
        }
      } catch (e) { for (const m of ch) if (!S.tokens[m]) S.tokens[m] = { sym: null, ts: now - 5000 }; }
    }
  }
  S.refreshTokens = tokens;
  S.priceOf = (m) => (S.tokens[m] && S.tokens[m].price) || null;
  S.tokName = (m) => (S.tokens[m] && S.tokens[m].sym) || S.short(m);

  /* ── clusters: tokens bought by several tracked wallets ── */
  S.hot = (min) => {
    const cut = Date.now() - min * 60000, g = {};
    for (const t of S.trades) {
      if (t.ts < cut) break; if (!t.mint || (t.side !== 'buy' && t.side !== 'sell')) continue;
      const x = g[t.mint] || (g[t.mint] = { mint: t.mint, buyers: new Map(), sellers: new Set(), sol: 0, usd: 0, sellUsd: 0, n: 0, first: t.ts, last: t.ts });
      if (t.side === 'buy') { x.buyers.set(t.wallet, (t.emoji || '') + ' ' + (t.name || S.short(t.wallet))); x.sol += t.sol || 0; x.usd += t.usd || 0; x.n++; }
      else { x.sellers.add(t.wallet); x.sellUsd += t.usd || 0; }
      x.first = Math.min(x.first, t.ts); x.last = Math.max(x.last, t.ts);
    }
    return Object.values(g).filter((x) => x.buyers.size).sort((a, b) => b.buyers.size - a.buyers.size || b.usd - a.usd);
  };
  S.activePerMin = () => { const el = (Date.now() - S.stats.t0) / 60000; return el > 0.2 ? S.stats.checks / el : 0; };
  S.scanned = () => S.wallets.filter((w) => w.lastCheck).length;

  /* ── simulation (only when no live data is reachable) ── */
  const SIMN = ['GRIFT', 'WAGMI', 'BONKER', 'CHAD', 'MOODY', 'PEPU', 'TRENCH', 'SNEK', 'DOGWIF', 'APE', 'GIGA', 'NUB', 'JEET', 'FROGE'];
  const rndAddr = () => Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
  function simTick() {
    if (!S.sim || S.stopped || !S.wallets.length) return;
    if (!S._simToks) S._simToks = SIMN.map((n) => { const m = rndAddr(); const price = Math.pow(10, -2 - Math.random() * 4); S.tokens[m] = { sym: n, name: n + ' (simulated)', price, mcap: price * 1e9, liq: 2e4 + Math.random() * 2e6, ch24: (Math.random() - 0.4) * 300, ch1h: (Math.random() - 0.45) * 40, url: '', ts: Date.now() + 1e12, sim: true }; return m; });
    for (const m of S._simToks) { const t = S.tokens[m], f = 1 + (Math.random() - 0.47) * 0.08; t.price *= f; t.mcap *= f; }
    const toks = S._simToks, mint = Math.random() < 0.45 ? toks[0] : Math.random() < 0.5 ? toks[1] : toks[Math.floor(Math.random() * toks.length)];
    const w = S.wallets[Math.floor(Math.random() * S.wallets.length)], buy = Math.random() < 0.62, sol = +(0.2 + Math.random() * Math.random() * 25).toFixed(3), usd = sol * (S.solPx || 180), t = S.tokens[mint];
    emit({ id: 'sim' + NT.uid(), sig: 'sim', ts: Date.now(), wallet: w.addr, name: w.name, emoji: w.emoji, alerts: w.alerts, side: buy ? 'buy' : 'sell', mint, amt: usd / t.price, sol, usd, px: t.price, dex: ['pump.fun', 'PumpSwap', 'Raydium', 'Jupiter', 'Meteora'][Math.floor(Math.random() * 5)], sim: true }, false);
    w.lastCheck = Date.now();
  }

  S.start = (o = {}) => {
    S.stop(); S.stopped = false; S.sim = !!o.sim; S.stats = { req: 0, err: 0, checks: 0, tx: 0, t0: Date.now() }; S.noBatch = false; cool = {};
    if (S.sim) { S.st = 'sim'; S.ws.st = 'off'; S.wallets.forEach((w) => { if (w.bal == null) w.bal = +(Math.random() * Math.random() * 900).toFixed(2); }); simT = setInterval(simTick, 2200); setTimeout(simTick, 600); }
    else { S.st = 'connecting'; loopT = setInterval(poll, 1200); txT = setInterval(drainTx, 400); balT = setInterval(balances, 120000); setTimeout(balances, 2500); setTimeout(poll, 300); wsSync(); }
    tokT = setInterval(tokens, 4000);
  };
  S.stop = () => { S.stopped = true; [loopT, balT, tokT, simT, txT].forEach((t) => clearInterval(t)); if (sock) { sock.close(); sock = null; } S.ws.st = 'off'; S.ws.subs = 0; };
  S.test = async () => { const t0 = performance.now(); const slot = await rpc('getSlot', []); return { slot, ms: Math.round(performance.now() - t0), url: S.rpcUsed }; };
  return S;
})();

/* ───────────── extra history sources, wallet scoring & top-trader discovery ───────────── */
(() => {
  const S = Sol, WSOL = S.WSOL, ST_BASE = 'https://data.solanatracker.io';
  S.keys = { st: '', helius: '' };
  S.heliusKey = () => S.keys.helius || ((/helius-rpc\.com\/?\?api-key=([\w-]+)/i.exec(S.custom || '') || [])[1] || '');
  S.archival = () => !!S.custom; // paid/free provider RPCs (Helius, QuickNode, Triton…) keep full history; public nodes keep ~2 days
  S.source = () => (S.keys.st ? 'Solana Tracker' : S.heliusKey() ? 'Helius' : S.custom ? 'your RPC' : 'public RPC (≈2-day window)');
  const stGet = (path) => J.get(ST_BASE + path, { headers: { 'x-api-key': S.keys.st }, timeout: 20000 });
  S.stGet = stGet;

  // Helius Enhanced Transactions → app trade events
  S.parseHelius = (tx, w) => {
    if (!tx || tx.transactionError) return null;
    let sol = 0; const tok = {};
    for (const t of tx.nativeTransfers || []) { if (t.toUserAccount === w.addr) sol += t.amount / 1e9; if (t.fromUserAccount === w.addr) sol -= t.amount / 1e9; }
    for (const t of tx.tokenTransfers || []) { const a = +t.tokenAmount || 0; if (t.toUserAccount === w.addr) tok[t.mint] = (tok[t.mint] || 0) + a; if (t.fromUserAccount === w.addr) tok[t.mint] = (tok[t.mint] || 0) - a; }
    if (tok[WSOL]) sol += tok[WSOL]; delete tok[WSOL];
    let mint = null, amt = 0; for (const [m, d] of Object.entries(tok)) if (d !== 0 && (mint === null || Math.abs(d) > Math.abs(amt))) { mint = m; amt = d; }
    const px = S.solPx || 0; let side = null, q = 0;
    if (mint && amt > 0 && sol < -0.0005) { side = 'buy'; q = -sol; } else if (mint && amt < 0 && sol > 0.0005) { side = 'sell'; q = sol; } else if (mint) side = amt > 0 ? 'recv' : 'send'; else if (Math.abs(sol) >= 0.5) { side = sol > 0 ? 'sol_in' : 'sol_out'; q = Math.abs(sol); }
    if (!side) return null;
    const usd = q && px ? q * px : null;
    return { id: tx.signature + ':' + (mint || 'sol'), sig: tx.signature, ts: (tx.timestamp || Date.now() / 1000) * 1000, wallet: w.addr, name: w.name, emoji: w.emoji, alerts: w.alerts, side, mint, amt: Math.abs(amt), sol: q, usd, px: usd && amt ? usd / Math.abs(amt) : null, dex: tx.source && tx.source !== 'UNKNOWN' ? String(tx.source).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null };
  };
  // Solana Tracker /wallet/{w}/trades → app trade events
  S.parseST = (t, w) => {
    const f = t.from || {}, to = t.to || {}, fa = f.address || (f.token && f.token.address), ta = to.address || (to.token && to.token.address);
    const note = (x) => { const a = x.address || (x.token && x.token.address); if (a && a !== WSOL && x.token && (!S.tokens[a] || !S.tokens[a].sym)) S.tokens[a] = Object.assign(S.tokens[a] || {}, { sym: S.clean(x.token.symbol, 16), name: S.clean(x.token.name, 48), img: S.okUrl(x.token.image, /^https:\/\//), ts: 0 }); };
    note(f); note(to);
    let side, mint, amt, sol;
    if (fa === WSOL || (f.token && /^w?sol$/i.test(f.token.symbol))) { side = 'buy'; mint = ta; amt = +to.amount || 0; sol = +f.amount || 0; }
    else if (ta === WSOL || (to.token && /^w?sol$/i.test(to.token.symbol))) { side = 'sell'; mint = fa; amt = +f.amount || 0; sol = +to.amount || 0; }
    else return null;
    const usd = t.volume && (t.volume.usd != null ? +t.volume.usd : null), ts = t.time > 1e12 ? t.time : (t.time || Date.now() / 1000) * 1000;
    return { id: (t.tx || t.signature || ts) + ':' + mint, sig: t.tx || t.signature || '', ts, wallet: w.addr, name: w.name, emoji: w.emoji, alerts: w.alerts, side, mint, amt, sol, usd, px: usd && amt ? usd / amt : null, dex: t.program || t.source || null };
  };
  /** Troubleshooter: runs every step the tracker needs and reports what fails and why. */
  S.diagnose = async (onStep) => {
    const out = [], step = async (name, fn, hint) => { const t0 = performance.now(); let r; try { const v = await fn(); r = { name, ok: true, ms: Math.round(performance.now() - t0), info: v }; } catch (e) { r = { name, ok: false, ms: Math.round(performance.now() - t0), info: e.message, hint }; } out.push(r); if (onStep) onStep(out); return r; };
    const proto = location.protocol;
    await step('Page served by ExTerm launcher', async () => { if (proto === 'file:') throw new Error('opened as a file (file://)'); if (!J.proxy) throw new Error('no local proxy found'); return 'local server + proxy OK'; }, 'Close this tab and double-click start-exterm.bat; it serves the app on http://localhost and routes Solana requests server-side, which avoids browser blocks.');
    for (const u of S.endpointsList()) await step('RPC reachable: ' + u.replace(/\?.*$/, '').replace(/^https:\/\//, ''), async () => { const r = await J.post(u, { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] }, { timeout: 12000, proxy: J.proxy && !/^https?:\/\/(localhost|127\.)/.test(u) }); if (r.error) throw new Error(r.error.message); return 'slot ' + r.result; }, 'This node refused or rate-limited you. ExTerm rotates to the next one automatically; a free Helius key gives you a private, unthrottled node.');
    const w = S.wallets[0];
    let sig = null;
    if (w) await step('Read wallet activity (' + (w.name || S.short(w.addr)) + ')', async () => { const r = await S.rpc('getSignaturesForAddress', [w.addr, { limit: 3 }], true); if (!r || !r.length) throw new Error('no signatures returned'); sig = r[0].signature; return r.length + ' recent transactions, latest ' + new Date((r[0].blockTime || 0) * 1000).toLocaleString(); }, 'Signature lookups are the most rate-limited call on public nodes. Use the launcher, or add a free Helius key in Settings.');
    if (sig) await step('Decode a transaction', async () => { const r = await S.rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }], true); if (!r) throw new Error('node returned no transaction (history window too short)'); const ev = S.parse(r, w, sig); return ev ? `${ev.side} ${ev.mint ? S.short(ev.mint) : 'SOL'} ${ev.sol ? ev.sol.toFixed(3) + ' SOL' : ''}` : 'decoded (not a swap)'; }, 'Some public nodes keep only recent history; Helius or Solana Tracker keep everything.');
    await step('Token prices (DexScreener)', async () => { const r = await J.get(S.DEXS + '/tokens/v1/solana/' + S.WSOL, { timeout: 10000 }); const p = Array.isArray(r) ? r[0] : null; if (!p) throw new Error('empty response'); return 'SOL $' + (+p.priceUsd).toFixed(2); }, 'DexScreener is unreachable from this network; trades still show, just without token names and prices.');
    if (S.keys.st) await step('Solana Tracker key', async () => { await S.stGet('/wallet/' + (w ? w.addr : S.WSOL) + '/trades'); return 'key works'; }, 'Check the key in Settings.');
    return out;
  };
  const rpcHistory = S.history;
  S.history = async (w, n = 25) => {
    let got = 0;
    if (S.keys.st) {
      const r = await stGet(`/wallet/${w.addr}/trades`);
      for (const t of (r.trades || []).slice(0, Math.max(n, 50))) { const ev = S.parseST(t, w); if (ev) { S.emit(ev, true); got++; } }
      w.histSrc = 'Solana Tracker'; w.histAt = Date.now(); return got;
    }
    const hk = S.heliusKey();
    if (hk) {
      const r = await J.get(`https://mainnet.helius-rpc.com/v0/addresses/${w.addr}/transactions?api-key=${hk}&limit=${Math.min(100, Math.max(n, 25))}`, { timeout: 25000 });
      for (const tx of r || []) { const ev = S.parseHelius(tx, w); if (ev) { S.emit(ev, true); got++; } }
      w.histSrc = 'Helius'; w.histAt = Date.now(); return got;
    }
    got = await rpcHistory(w, n); w.histSrc = S.custom ? 'RPC' : 'public RPC'; w.histAt = Date.now(); return got;
  };
  // wallet-level PnL / win rate (Solana Tracker) — falls back to stats from decoded trades
  S.score = async (w) => {
    if (S.keys.st) {
      const r = await stGet(`/v2/pnl/wallets/${w.addr}`);
      const sm = r.summary || {}, an = r.analysis || {}, pnl = sm.pnl || {}, cnt = sm.counts || {};
      w.ext = { winRate: an.winRate != null ? +an.winRate : sm.winRate != null ? +sm.winRate : null, pnl: pnl.total != null ? +pnl.total : null, realized: pnl.realized != null ? +pnl.realized : null, tokens: cnt.tokensTraded != null ? +cnt.tokensTraded : null, trades: cnt.trades != null ? +cnt.trades : (cnt.buys || 0) + (cnt.sells || 0) || null, src: 'Solana Tracker', at: Date.now() };
      return w.ext;
    }
    if (!w.recent.length) await S.history(w, 40);
    const s = S.walletStats(w); w.ext = { winRate: s.winRate, pnl: s.realized, tokens: s.rows.length, trades: s.rows.reduce((a, r) => a + r.n, 0), src: 'decoded swaps', at: Date.now() };
    return w.ext;
  };
  // top traders: live from Solana Tracker's KOL leaderboard (with a key) or the bundled Kolscan snapshot
  S.discover = async (period = '7d', sort = 'realized', snapshot) => {
    if (!S.keys.st || snapshot) return { src: 'Kolscan leaderboard snapshot (7 Nov 2026)', live: false, rows: (typeof TOP_WALLETS !== 'undefined' ? TOP_WALLETS : []).map((x, i) => ({ addr: x.addr, name: x.name, pnlSol: x.pnl, w: x.w, l: x.l, winRate: x.w + x.l ? (x.w / (x.w + x.l)) * 100 : null, trades: x.w + x.l, rank: i + 1 })) };
    const r = await stGet(`/v2/pnl/leaderboard/kols/period?period=${encodeURIComponent(period)}&sort=${encodeURIComponent(sort)}&direction=desc&limit=100`);
    const rows = (r.traders || r.data || []).map((t, i) => {
      const id = t.identity || {}, p = t.pnl || t.period || {}, wr = t.winRate != null ? t.winRate : t.win_percentage != null ? t.win_percentage : p.winRate;
      return { addr: t.wallet || t.address || t.owner || id.wallet, name: id.name || t.name || '', twitter: id.twitter || '', pnlUsd: p.realized != null ? +p.realized : t.realized != null ? +t.realized : null, winRate: wr != null ? (+wr <= 1 ? +wr * 100 : +wr) : null, trades: t.trades != null ? +t.trades : (t.counts && t.counts.trades) || null, tokens: t.tokens != null ? +t.tokens : null, rank: i + 1 };
    }).filter((x) => S.isAddr(x.addr));
    return { src: `Solana Tracker KOL leaderboard · ${period}`, live: true, rows };
  };
})();
