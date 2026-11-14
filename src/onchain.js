/* ExTerm on-chain module — whale transfers (BTC mempool + Ethereum blocks), exchange flow, watched "insider" wallets */
const Whale = (() => {
  const W = {
    events: [], seen: new Set(), st: { btc: 'idle', eth: 'idle' }, err: { btc: null, eth: null },
    thr: { btc: 50, eth: 250, usd: 1000000 }, watch: [], sim: false, lastBlock: null, listeners: [], stopped: true, blockNo: null,
  };
  // Community-labelled public addresses (lower-case). Labels can be incomplete or outdated — treat as hints.
  const LABELS = {
    '0x28c6c06298d514db089934071355e5743bf21d60': { n: 'Binance 14', ex: true },
    '0xf977814e90da44bfa03b6295a0616a897441acec': { n: 'Binance 8', ex: true },
    '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { n: 'Coinbase 1', ex: true },
    '0x503828976d22510aad0201ac7ec88293211d23da': { n: 'Coinbase 2', ex: true },
    '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': { n: 'Kraken', ex: true },
    '0x876eabf441b2ee5b5b0554fd502a8e0600950cfa': { n: 'Bitfinex', ex: true },
    '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { n: 'OKX', ex: true },
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { n: 'vitalik.eth', ex: false },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { n: 'WETH contract', ex: false },
  };
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const TOKENS = {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { s: 'USDT', d: 6, stable: true },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { s: 'USDC', d: 6, stable: true },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { s: 'DAI', d: 18, stable: true },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { s: 'WBTC', d: 8, stable: false },
  };
  const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'];
  let rpcI = 0, btcSock = null, timers = [], btcPollN = 0, ethT = null;

  const label = (a) => (a && LABELS[String(a).toLowerCase()]) || null;
  const priceOf = (asset) => {
    const L = typeof Feed !== 'undefined' ? Feed.live : {};
    const k = asset === 'WBTC' ? 'BTC-USD' : asset + '-USD';
    return L[k] && L[k].price ? L[k].price : null;
  };
  const watchSet = () => new Set(W.watch.map((w) => w.addr.toLowerCase()));
  W.isEth = (a) => /^0x[a-fA-F0-9]{40}$/.test(a);
  W.isBtc = (a) => /^(bc1[a-z0-9]{20,70}|[13][a-km-zA-HJ-NP-Z1-9]{25,40})$/.test(a);

  function emit(ev) {
    const key = ev.chain + ':' + ev.hash + ':' + ev.asset + ':' + ev.from + ':' + ev.to + ':' + (ev.amount || 0);
    if (W.seen.has(key)) return;
    W.seen.add(key); if (W.seen.size > 3000) W.seen = new Set([...W.seen].slice(-1500));
    ev.id = NT.uid(); ev.ts = ev.ts || Date.now();
    const fl = label(ev.from), tl = label(ev.to);
    ev.fromLabel = fl ? fl.n : null; ev.toLabel = tl ? tl.n : null;
    const fe = fl && fl.ex, te = tl && tl.ex;
    ev.dir = fe && !te ? 'outflow' : !fe && te ? 'inflow' : fe && te ? 'xfer' : 'wallet';
    W.events.unshift(ev); if (W.events.length > 500) W.events.pop();
    W.listeners.forEach((f) => { try { f(ev); } catch (e) { console.warn(e); } });
  }

  /* ── Bitcoin: unconfirmed tx stream (blockchain.com) with REST fallback ── */
  function handleBtcTx(x) {
    if (!x || !x.out || !x.inputs) return;
    const ins = x.inputs.map((i) => i.prev_out && i.prev_out.addr).filter(Boolean), inSet = new Set(ins);
    const outs = x.out.filter((o) => o.addr);
    let moved = 0; const real = [];
    for (const o of outs) if (!inSet.has(o.addr)) { moved += o.value || 0; real.push(o); }
    const total = outs.reduce((s, o) => s + (o.value || 0), 0);
    if (!moved) moved = total;
    const btc = moved / 1e8, ws = watchSet();
    const touched = [...ins, ...outs.map((o) => o.addr)].find((a) => ws.has(a.toLowerCase()));
    const whale = btc >= W.thr.btc;
    if (!whale && !touched) return;
    const px = priceOf('BTC');
    const top = (real.length ? real : outs).slice().sort((a, b) => b.value - a.value)[0];
    emit({ chain: 'BTC', kind: 'transfer', asset: 'BTC', amount: btc, usd: px ? btc * px : null, from: ins[0] || '?', fromN: ins.length, to: top ? top.addr : '?', toN: outs.length, hash: x.hash, whale, watched: !!touched, ts: (x.time || 0) * 1000 || Date.now() });
  }
  function btcStart() {
    btcSock = new Sock('wss://ws.blockchain.info/inv', {
      onOpen: (s) => s.send({ op: 'unconfirmed_sub' }),
      onState: (s) => { W.st.btc = s === 'live' ? 'live' : s === 'connecting' ? 'connecting' : 'error'; if (s === 'live') { W.err.btc = null; btcPollN = 0; } if (s === 'error') W.err.btc = 'WebSocket blocked or unreachable'; },
      onMsg: (m) => { if (m.op === 'utx') handleBtcTx(m.x); },
    });
    btcSock.open();
    timers.push(setInterval(async () => { // REST fallback when the socket can't connect
      if (W.stopped || W.sim || (btcSock && btcSock.state === 'live')) return;
      if (btcSock && btcSock.tries < 2) return;
      try {
        const r = await J.get('https://blockchain.info/unconfirmed-transactions?format=json&cors=true');
        (r.txs || []).forEach(handleBtcTx); W.st.btc = 'polling'; W.err.btc = null;
      } catch (e) { W.st.btc = 'error'; W.err.btc = e.message; }
    }, 20000));
  }

  /* ── Ethereum: scan new blocks over public JSON-RPC ── */
  async function rpc(method, params) {
    let last;
    for (let k = 0; k < RPCS.length; k++) {
      const i = (rpcI + k) % RPCS.length;
      try {
        const r = await J.post(RPCS[i], { jsonrpc: '2.0', id: 1, method, params }, { timeout: 10000 });
        if (r.error) throw new Error(r.error.message || 'rpc error');
        rpcI = i; return r.result;
      } catch (e) { last = e; }
    }
    throw last;
  }
  W.rpc = rpc;
  const hexEth = (h) => Number(BigInt(h) / 1000000000000n) / 1e6;
  async function scanBlock(n) {
    const hex = '0x' + n.toString(16), ws = watchSet();
    const blk = await rpc('eth_getBlockByNumber', [hex, true]);
    if (!blk) return;
    const ethPx = priceOf('ETH');
    for (const tx of blk.transactions || []) {
      const f = (tx.from || '').toLowerCase(), t = (tx.to || '').toLowerCase();
      const touched = ws.has(f) || ws.has(t);
      if (tx.value === '0x0' && !touched) continue;
      const eth = tx.value === '0x0' ? 0 : hexEth(tx.value);
      const whale = eth >= W.thr.eth;
      if (!whale && !touched) continue;
      emit({ chain: 'ETH', kind: eth > 0 ? 'transfer' : 'contract', asset: 'ETH', amount: eth, usd: ethPx ? eth * ethPx : null, from: tx.from, to: tx.to || '(contract creation)', hash: tx.hash, whale, watched: touched, block: n });
    }
    try {
      const logs = await rpc('eth_getLogs', [{ fromBlock: hex, toBlock: hex, address: Object.keys(TOKENS), topics: [TRANSFER] }]);
      for (const lg of logs || []) {
        const tk = TOKENS[String(lg.address).toLowerCase()]; if (!tk || !lg.topics || lg.topics.length < 3) continue;
        const from = '0x' + lg.topics[1].slice(26), to = '0x' + lg.topics[2].slice(26);
        const sc = BigInt(Math.max(0, tk.d - 6)), amt = Number(BigInt(lg.data) / (10n ** sc)) / Math.pow(10, Math.min(tk.d, 6));
        const px = tk.stable ? 1 : priceOf(tk.s);
        const usd = px ? amt * px : null, touched = ws.has(from) || ws.has(to);
        const whale = usd != null && usd >= W.thr.usd;
        if (!whale && !touched) continue;
        emit({ chain: 'ETH', kind: tk.stable ? 'stable' : 'token', asset: tk.s, amount: amt, usd, from, to, hash: lg.transactionHash, whale, watched: touched, block: n });
      }
    } catch (e) { /* logs are best-effort */ }
  }
  async function ethPoll() {
    if (W.stopped) return;
    try {
      const bn = parseInt(await rpc('eth_blockNumber', []), 16); W.blockNo = bn;
      if (W.lastBlock == null) W.lastBlock = bn - 1;
      if (bn - W.lastBlock > 3) W.lastBlock = bn - 3;
      for (let b = W.lastBlock + 1; b <= bn; b++) await scanBlock(b);
      W.lastBlock = bn; W.st.eth = 'live'; W.err.eth = null;
    } catch (e) { W.st.eth = 'error'; W.err.eth = e.message; }
    clearTimeout(ethT); ethT = setTimeout(ethPoll, 6000);
  }

  /* ── watched wallets ── */
  W.addWatch = (addr, name) => {
    addr = String(addr || '').trim();
    const chain = W.isEth(addr) ? 'ETH' : W.isBtc(addr) ? 'BTC' : null;
    if (!chain) return { ok: false, err: 'Not a valid Ethereum (0x…) or Bitcoin address' };
    if (W.watch.some((w) => w.addr.toLowerCase() === addr.toLowerCase())) return { ok: false, err: 'Already watching that address' };
    const w = { addr, name: name || (label(addr) && label(addr).n) || '', chain, bal: null, recent: [], ts: 0 };
    W.watch.push(w); W.refreshWallet(w); return { ok: true, w };
  };
  W.removeWatch = (addr) => { W.watch = W.watch.filter((w) => w.addr !== addr); };
  W.refreshWallet = async (w) => {
    try {
      if (w.chain === 'ETH') {
        const [b, n] = await Promise.all([rpc('eth_getBalance', [w.addr, 'latest']), rpc('eth_getTransactionCount', [w.addr, 'latest'])]);
        w.bal = hexEth(b); w.nonce = parseInt(n, 16);
      } else {
        const a = await J.get('https://mempool.space/api/address/' + w.addr);
        const cs = a.chain_stats, ms = a.mempool_stats;
        w.bal = (cs.funded_txo_sum - cs.spent_txo_sum + ms.funded_txo_sum - ms.spent_txo_sum) / 1e8; w.nonce = cs.tx_count;
        const txs = await J.get('https://mempool.space/api/address/' + w.addr + '/txs');
        w.recent = txs.slice(0, 6).map((t) => {
          const out = t.vout.filter((o) => o.scriptpubkey_address === w.addr).reduce((s, o) => s + o.value, 0);
          const inn = t.vin.filter((i) => i.prevout && i.prevout.scriptpubkey_address === w.addr).reduce((s, i) => s + i.prevout.value, 0);
          return { hash: t.txid, delta: (out - inn) / 1e8, ts: (t.status && t.status.block_time ? t.status.block_time : Date.now() / 1000) * 1000 };
        });
      }
      w.ts = Date.now(); w.err = null;
    } catch (e) { w.err = e.message; }
  };

  /* ── flow metrics ── */
  W.flow = (minutes) => {
    const cut = Date.now() - minutes * 60000; const f = { ethIn: 0, ethOut: 0, stIn: 0, stOut: 0, n: 0, btc: 0 };
    for (const e of W.events) {
      if (e.ts < cut) break; if (!e.whale || e.usd == null) continue; f.n++;
      if (e.chain === 'BTC') f.btc += e.usd;
      else if (e.kind === 'transfer' && e.dir === 'inflow') f.ethIn += e.usd;
      else if (e.kind === 'transfer' && e.dir === 'outflow') f.ethOut += e.usd;
      else if (e.kind === 'stable' && e.dir === 'inflow') f.stIn += e.usd;
      else if (e.kind === 'stable' && e.dir === 'outflow') f.stOut += e.usd;
    }
    f.ethNet = f.ethOut - f.ethIn; f.stNet = f.stIn - f.stOut; return f;
  };
  W.forSym = (sym, minutes) => { const f = W.flow(minutes); return { net: sym === 'ETH-USD' ? f.ethNet : f.stNet, f }; };

  /* ── demo simulation (only when the app runs on simulated market data) ── */
  function simTick() {
    if (!W.sim || W.stopped) return;
    const ex = ['0x28c6c06298d514db089934071355e5743bf21d60', '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', '0x2910543af39aba0cd09dbb2d50200b3e800a63d2'];
    const rnd = () => '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const r = Math.random(), toEx = Math.random() > 0.5, a = ex[Math.floor(Math.random() * 3)], b = rnd();
    if (r < 0.4) { const amt = 250 + Math.random() * 3000, px = priceOf('ETH') || 3300; emit({ chain: 'ETH', kind: 'transfer', asset: 'ETH', amount: amt, usd: amt * px, from: toEx ? b : a, to: toEx ? a : b, hash: 'sim' + NT.uid(), whale: true, watched: false, sim: true }); }
    else if (r < 0.75) { const amt = 1e6 + Math.random() * 3e7; emit({ chain: 'ETH', kind: 'stable', asset: Math.random() > 0.5 ? 'USDT' : 'USDC', amount: amt, usd: amt, from: toEx ? b : a, to: toEx ? a : b, hash: 'sim' + NT.uid(), whale: true, watched: false, sim: true }); }
    else { const amt = 50 + Math.random() * 900, px = priceOf('BTC') || 97000; emit({ chain: 'BTC', kind: 'transfer', asset: 'BTC', amount: amt, usd: amt * px, from: 'bc1q' + rnd().slice(2, 36), fromN: 1, to: 'bc1q' + rnd().slice(2, 36), toN: 2, hash: 'sim' + NT.uid(), whale: true, watched: false, sim: true }); }
  }

  W.start = (opts = {}) => {
    W.stop(); W.stopped = false; W.sim = !!opts.sim;
    if (W.sim) { W.st.btc = 'sim'; W.st.eth = 'sim'; timers.push(setInterval(simTick, 5000)); setTimeout(simTick, 800); setTimeout(simTick, 1800); }
    else { btcStart(); ethPoll(); }
    timers.push(setInterval(() => W.watch.forEach((w) => W.refreshWallet(w)), 90000));
    W.watch.forEach((w) => W.refreshWallet(w));
  };
  W.stop = () => { W.stopped = true; clearTimeout(ethT); timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers = []; if (btcSock) { btcSock.close(); btcSock = null; } };
  W.label = label;
  return W;
})();
