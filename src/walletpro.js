/* ExTerm v13 wallet tracker upgrades: wallet score v2, copy-backtest ("would copying this wallet have made money?"),
   linked-wallet detection (same funder / always trading together), weighted smart-money clusters with an automatic
   safety check, wallet-buy messages to Telegram / Discord, automatic history for new wallets, and new ways to
   discover wallets from live data (active traders on trending tokens, earliest buyers of a token). */
const WalletPro = (() => {
  const P = { funder: {}, links: [], groups: [], alerted: {}, discBusy: false, histQ: [], lastCopy: {}, copyBusy: {} };
  const cfg = () => ST.wpro || (ST.wpro = { push: false, minUsd: 500, minGrade: 'C', clusterMin: 2.5, clusterWin: 60, safeMin: 'C' });
  const GR = ['A', 'B', 'C', 'D', 'F'], gradeOK = (g, min) => g && g !== '?' && GR.indexOf(g) <= GR.indexOf(min);

  /* ── score v2: recency-weighted, shrunk toward 50% until there are enough trades ── */
  P.score = (w) => {
    const now = Date.now(), per = {};
    for (const t of Sol.trades) {
      if (t.wallet !== w.addr || !t.mint || t.usd == null) continue;
      const x = per[t.mint] || (per[t.mint] = { buyUsd: 0, sellUsd: 0, buyAmt: 0, sellAmt: 0, first: Infinity, firstSell: Infinity, last: 0 });
      if (t.side === 'buy') { x.buyUsd += t.usd; x.buyAmt += t.amt || 0; x.first = Math.min(x.first, t.ts); }
      else if (t.side === 'sell') { x.sellUsd += t.usd; x.sellAmt += t.amt || 0; x.firstSell = Math.min(x.firstSell, t.ts); }
      x.last = Math.max(x.last, t.ts);
    }
    let wW = 0, nW = 0, gain = 0, loss = 0, n = 0; const holds = [];
    for (const x of Object.values(per)) {
      if (!x.buyAmt || !x.sellAmt) continue;
      const avg = x.buyUsd / x.buyAmt, pnl = x.sellUsd - Math.min(x.sellAmt, x.buyAmt) * avg, wt = Math.pow(0.5, (now - x.last) / (14 * 864e5));
      n++; nW += wt; if (pnl > 0) { wW += wt; gain += pnl; } else loss -= pnl;
      if (isFinite(x.first) && isFinite(x.firstSell) && x.firstSell > x.first) holds.push(x.firstSell - x.first);
    }
    const wr = (wW + 5) / (nW + 10), pf = loss ? gain / loss : gain ? 3 : 1; // +5/+10: a Bayesian prior of 50% worth 10 trades
    const sc = Math.round(Math.max(0, Math.min(100, 100 * (0.6 * wr + 0.4 * Math.min(1, pf / 3)))));
    holds.sort((a, b) => a - b); const med = holds.length ? holds[Math.floor(holds.length / 2)] : null;
    const style = med == null ? '' : med < 10 * 60e3 ? 'scalper (minutes)' : med < 6 * 36e5 ? 'day trader (hours)' : 'swing (days)';
    const grade = n < 5 ? '?' : sc >= 75 ? 'A' : sc >= 62 ? 'B' : sc >= 50 ? 'C' : sc >= 38 ? 'D' : 'F';
    return { n, score: sc, grade, wr: wr * 100, pf, gain, loss, medHold: med, style };
  };
  P.weight = (addr) => { const w = Sol.byAddr(addr); if (!w) return 0.5; const s = P.score(w); return { A: 1.5, B: 1.1, C: 0.8, D: 0.4, F: 0.15, '?': 0.5 }[s.grade]; };

  /* ── linked wallets ── */
  // (1) co-trading: two tracked wallets that bought the same token within 3 seconds at least twice
  P.coTrading = () => {
    const buys = Sol.trades.filter((t) => t.side === 'buy' && t.mint).sort((a, b) => a.ts - b.ts), cnt = new Map();
    for (let i = 0; i < buys.length; i++) for (let j = i + 1; j < buys.length && buys[j].ts - buys[i].ts <= 3000; j++) {
      const a = buys[i], b = buys[j]; if (a.mint !== b.mint || a.wallet === b.wallet) continue;
      const k = [a.wallet, b.wallet].sort().join('|'); cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    return [...cnt.entries()].filter(([, c]) => c >= 2).map(([k, c]) => ({ a: k.split('|')[0], b: k.split('|')[1], n: c, why: `bought the same token within 3s, ${c} times` }));
  };
  // (2) same funder: the wallet that sent each wallet its first SOL (read from its oldest transaction; cached)
  P.findFunder = async (addr) => {
    if (P.funder[addr] !== undefined) return P.funder[addr];
    let before = null, oldest = null;
    for (let page = 0; page < 3; page++) {
      const r = await Sol.rpc('getSignaturesForAddress', [addr, Object.assign({ limit: 1000 }, before ? { before } : {})]);
      if (!Array.isArray(r) || !r.length) break; oldest = r[r.length - 1].signature; before = oldest; if (r.length < 1000) break;
    }
    let funder = null;
    if (oldest) {
      const tx = await Sol.rpc('getTransaction', [oldest, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
      const ins = [].concat((tx && tx.transaction && tx.transaction.message && tx.transaction.message.instructions) || [], ...(((tx && tx.meta && tx.meta.innerInstructions) || []).map((x) => x.instructions || [])));
      for (const i of ins) { const pi = i && i.parsed; if (pi && pi.type === 'transfer' && pi.info && pi.info.destination === addr && pi.info.source) { funder = pi.info.source; break; } }
    }
    P.funder[addr] = funder; return funder;
  };
  P.groupsFrom = (links, funders) => { // union-find over co-trading links + shared funders
    const par = new Map(), f = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; }, add = (x) => { if (!par.has(x)) par.set(x, x); };
    const why = new Map();
    for (const l of links) { add(l.a); add(l.b); par.set(f(l.a), f(l.b)); why.set(l.a, l.why); why.set(l.b, l.why); }
    const byF = {}; for (const [a, fu] of Object.entries(funders)) if (fu) (byF[fu] = byF[fu] || []).push(a);
    for (const [fu, list] of Object.entries(byF)) if (list.length >= 2) { list.forEach(add); for (const a of list.slice(1)) par.set(f(a), f(list[0])); list.forEach((a) => why.set(a, 'same funder ' + Sol.short(fu))); }
    const g = {}; for (const x of par.keys()) (g[f(x)] = g[f(x)] || []).push(x);
    return Object.values(g).filter((x) => x.length >= 2).map((m) => ({ members: m, why: [...new Set(m.map((a) => why.get(a)))].join(' · ') }));
  };
  P.recalcLinks = () => { P.links = P.coTrading(); P.groups = P.groupsFrom(P.links, P.funder); return P.groups; };
  P.groupOf = (addr) => P.groups.findIndex((g) => g.members.includes(addr));

  /* ── weighted clusters: several GOOD, UNRELATED wallets buying the same token ── */
  P.clusters = () => {
    const c = cfg(), hot = Sol.hot(c.clusterWin);
    return hot.map((x) => {
      const seen = new Set(); let wsum = 0;
      for (const a of x.buyers.keys()) { const g = P.groupOf(a), key = g >= 0 ? 'g' + g : a; if (seen.has(key)) continue; seen.add(key); wsum += P.weight(a); } // linked wallets count once
      return Object.assign(x, { weight: wsum, independent: seen.size });
    }).filter((x) => x.independent >= 2).sort((a, b) => b.weight - a.weight);
  };
  P.checkClusters = async () => {
    const c = cfg();
    for (const x of P.clusters()) {
      if (x.weight < c.clusterMin || P.alerted[x.mint] > Date.now() - 3 * 36e5) continue;
      P.alerted[x.mint] = Date.now();
      const tok = Sol.tokens[x.mint] || {}; let saf = null;
      try { saf = typeof Safety !== 'undefined' ? await Safety.scan(x.mint, 'solana') : null; } catch (e) { /* unknown */ }
      const ok = !saf || gradeOK(saf.grade, c.safeMin);
      const msg = `🧠 Smart-money cluster: ${x.independent} independent wallets (weight ${x.weight.toFixed(1)}) bought ${tok.sym || Sol.short(x.mint)} in ${c.clusterWin}m${saf ? ' · safety ' + saf.grade : ''}`;
      toast(esc(msg) + (ok ? '' : ' · <b class="dn">failed your safety minimum</b>'), ok ? 'acc' : 'amb', 9000);
      if (c.push && ok) P.push(msg);
    }
  };

  /* ── messages to Telegram / Discord through the launcher ── */
  P.push = async (text) => { if (!J.proxy || !(Launcher.caps && Launcher.caps.alerts)) return false; try { const r = await J.post('/api/notify', { text: String(text).slice(0, 800) }, { timeout: 8000 }); return !!r.ok; } catch (e) { return false; } };
  P.onTrade = (ev) => {
    const c = cfg(); if (!c.push || ev.hist || ev.side !== 'buy' || !ev.alerts || (ev.usd || 0) < c.minUsd) return;
    const w = Sol.byAddr(ev.wallet); if (!w) return; const s = P.score(w); if (s.grade !== '?' && !gradeOK(s.grade, c.minGrade)) return;
    const tok = Sol.tokens[ev.mint] || {};
    P.push(`👛 ${w.name || Sol.short(w.addr)} (${s.grade}) bought ${NT.fmtUSD(ev.usd, 0)} of ${tok.sym || Sol.short(ev.mint)}${ev.dex ? ' on ' + ev.dex : ''}`);
  };

  /* ── copy-backtest ── */
  // Replays the wallet's recent round trips as if you copied each buy and sell `delay` seconds late with a fixed size.
  // Uses 1-minute candles of the token's main pool when available; otherwise an estimated delay cost (clearly marked).
  P.poolFor = async (mint) => { const r = await OC._gt(`/networks/solana/tokens/${mint}/pools?page=1`, 10000); const d = r && r.data && r.data[0]; return d && d.attributes && d.attributes.address ? d.attributes.address : null; };
  P.candles = async (pool) => { const r = await OC._gt(`/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=1000&currency=usd`, 12000); return ((r && r.data && r.data.attributes && r.data.attributes.ohlcv_list) || []).map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })).sort((a, b) => a.t - b.t); };
  P.priceAt = (cs, tsMs) => { const s = Math.floor(tsMs / 1000); if (!cs || !cs.length || s < cs[0].t || s > cs[cs.length - 1].t + 60) return null; let lo = 0, hi = cs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cs[m].t <= s) lo = m; else hi = m - 1; } const k = cs[lo], f = Math.min(1, (s - k.t) / 60); return k.o + (k.c - k.o) * f; };
  P.copySim = (trips, o) => { // pure: trips = [{mint, buyTs, buyPx, sellTs?, sellPx?, cs?}] -> results
    const rows = []; let pnl = 0, own = 0, wins = 0, est = 0;
    for (const t of trips) {
      const cost = o.size, est1 = (px) => px * (1 + o.delayCost * o.delay), eIn = P.priceAt(t.cs, t.buyTs + o.delay * 1000), inPx = eIn || est1(t.buyPx);
      const exitTs = t.sellTs ? t.sellTs + o.delay * 1000 : null, eOut = exitTs ? P.priceAt(t.cs, exitTs) : null;
      const outPx = t.sellTs ? eOut || t.sellPx * (1 - o.delayCost * o.delay) : t.nowPx || null;
      if (!(inPx > 0) || !(outPx > 0)) continue;
      const r = (outPx / inPx) * (1 - o.fee) * (1 - o.fee) - 1, p = cost * r, wr = t.sellPx && t.buyPx ? t.sellPx / t.buyPx - 1 : t.nowPx && t.buyPx ? t.nowPx / t.buyPx - 1 : 0;
      if (!eIn || (t.sellTs && !eOut)) est++;
      pnl += p; own += cost * wr; if (p > 0) wins++;
      rows.push({ mint: t.mint, sym: t.sym, inPx, outPx, ret: r * 100, own: wr * 100, pnl: p, open: !t.sellTs, estimated: !eIn || (t.sellTs && !eOut) });
    }
    return { rows, pnl, own, wins, n: rows.length, est, retPct: rows.length ? (pnl / (rows.length * o.size)) * 100 : 0 };
  };
  P.trips = (w) => { // first buy → first sell after it, per token
    const evs = Sol.trades.filter((t) => t.wallet === w.addr && t.mint && t.px > 0).sort((a, b) => a.ts - b.ts), by = {};
    for (const e of evs) { const x = by[e.mint] || (by[e.mint] = { mint: e.mint, sym: (Sol.tokens[e.mint] || {}).sym || Sol.short(e.mint) }); if (e.side === 'buy' && !x.buyTs) { x.buyTs = e.ts; x.buyPx = e.px; } else if (e.side === 'sell' && x.buyTs && !x.sellTs) { x.sellTs = e.ts; x.sellPx = e.px; } }
    return Object.values(by).filter((x) => x.buyTs).map((x) => Object.assign(x, { nowPx: Sol.priceOf(x.mint) })).sort((a, b) => b.buyTs - a.buyTs).slice(0, 12);
  };
  P.copyBacktest = async (w, o, prog) => {
    if (!w.recent.length || w.recent.length < 5) { prog && prog('Loading this wallet’s history…'); await Sol.history(w, 60); }
    const trips = P.trips(w); if (!trips.length) throw new Error('no buys found for this wallet yet. Load its history first');
    let k = 0;
    for (const t of trips) { k++; prog && prog(`Loading 1-minute prices for ${esc(t.sym)} (${k}/${trips.length})…`); try { const pool = await P.poolFor(t.mint); if (pool) t.cs = await P.candles(pool); } catch (e) { t.cs = null; } }
    return P.copySim(trips, o);
  };

  /* ── discovery from live data ── */
  // Wallets buying across today's trending Solana pools (GeckoTerminal trade feeds; no key needed)
  P.discoverTrending = async (prog) => {
    const pools = (await OC.discoverPage('trending', 'solana', 1)).slice(0, 8), agg = new Map();
    let i = 0;
    for (const s of pools) {
      i++; const p = OC.parse(s), m = OC.meta[s] || {}; prog && prog(`Reading trades on ${esc(m.s || '?')} (${i}/${pools.length})…`);
      try {
        const r = await OC._gt(`/networks/solana/pools/${p.pool}/trades`, 12000);
        for (const t of (r && r.data) || []) {
          const a = t.attributes || {}, who = a.tx_from_address; if (!Sol.isAddr(who)) continue;
          const x = agg.get(who) || { addr: who, toks: new Set(), buyUsd: 0, sellUsd: 0, n: 0 };
          if (a.kind === 'buy') { x.buyUsd += +a.volume_in_usd || 0; x.toks.add(m.s || p.pool); } else x.sellUsd += +a.volume_in_usd || 0;
          x.n++; agg.set(who, x);
        }
      } catch (e) { /* skip that pool */ }
    }
    return [...agg.values()].map((x) => ({ addr: x.addr, name: '', tokens: [...x.toks], buyUsd: x.buyUsd, sellUsd: x.sellUsd, n: x.n, bot: x.n > 40 })).filter((x) => x.tokens.length >= 2 && x.buyUsd >= 200).sort((a, b) => b.tokens.length - a.tokens.length || b.buyUsd - a.buyUsd).slice(0, 60);
  };

  /* ── automatic history for newly added wallets (gentle: one every 3 s) ── */
  P.wrapAdd = () => {
    const load = Sol.load;
    Sol.load = function (list, replace) {
      const before = new Set(Sol.wallets.map((w) => w.addr)), r = load.apply(this, arguments);
      for (const w of Sol.wallets) if (!before.has(w.addr) && !Sol.sim) P.histQ.push(w.addr);
      return r;
    };
    setInterval(async () => { const a = P.histQ.shift(); if (!a) return; const w = Sol.byAddr(a); if (w && !w.histAt) { try { await Sol.history(w, 25); } catch (e) { /* the drawer can retry */ } } }, 3000);
  };

  /* ── UI ── */
  P.panel = () => {
    const c = cfg(), cl = P.clusters().slice(0, 6), groups = P.groups;
    return `<div class="ph">🧠 Smart money <span class="sp"></span><button class="btn sm" id="wpLinks" title="Find wallets funded by the same address (reads each wallet's first transaction)">Find linked</button></div><div class="pb">
      <div class="sec" style="margin-top:0">Weighted clusters (${c.clusterWin}m)</div>
      ${cl.length ? cl.map((x) => { const tok = Sol.tokens[x.mint] || {}; return `<div class="row wp-cl" style="justify-content:space-between"><span><b>${esc(tok.sym || Sol.short(x.mint))}</b> <span class="note">${x.independent} independent wallet${x.independent > 1 ? 's' : ''}</span></span><span class="tag ${x.weight >= c.clusterMin ? 'up' : ''}" title="Sum of wallet-grade weights; linked wallets count once">⚖ ${x.weight.toFixed(1)}</span></div>`; }).join('') : '<div class="note">No tokens bought by 2+ independent tracked wallets yet.</div>'}
      <div class="sec">Linked wallets</div>
      ${groups.length ? groups.slice(0, 5).map((g) => `<div class="note">🔗 ${g.members.map((a) => esc((Sol.byAddr(a) || {}).name || Sol.short(a))).join(', ')} <span class="mut">(${esc(g.why)})</span></div>`).join('') : '<div class="note">None found. Linked wallets (same owner) are counted once in clusters.</div>'}
      <div class="sec">Send to Telegram / Discord</div>
      <label class="chk"><input type="checkbox" id="wpPush" ${c.push ? 'checked' : ''} ${J.proxy ? '' : 'disabled'}> Message me tracked-wallet buys and clusters</label>
      <div class="row" style="gap:6px;margin-top:4px"><label class="f" style="flex:1">Min buy $<input class="in num" id="wpMin" type="number" min="0" step="50" value="${esc(c.minUsd)}"></label><label class="f">Min grade<select class="in" id="wpGrade">${GR.slice(0, 4).map((g) => `<option ${g === c.minGrade ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label class="f">Cluster ≥<input class="in num" id="wpCl" type="number" min="1" step="0.5" value="${esc(c.clusterMin)}" style="width:64px"></label></div>
      <div class="note">${J.proxy ? 'Uses the Telegram / Discord settings from Background alerts. Only wallets with 🔔 on are sent.' : 'Needs the launcher.'}</div></div>`;
  };
  P.bindPanel = (host) => {
    const c = cfg(), sv = () => saveState();
    const pu = host.querySelector('#wpPush'); if (pu) pu.onchange = () => { c.push = pu.checked; sv(); };
    const mi = host.querySelector('#wpMin'); if (mi) mi.onchange = () => { c.minUsd = Math.max(0, +mi.value || 0); sv(); };
    const gr = host.querySelector('#wpGrade'); if (gr) gr.onchange = () => { c.minGrade = gr.value; sv(); };
    const cl = host.querySelector('#wpCl'); if (cl) cl.onchange = () => { c.clusterMin = Math.max(1, +cl.value || 2.5); sv(); };
    const lk = host.querySelector('#wpLinks'); if (lk) lk.onclick = async () => {
      if (Sol.sim) return toast('Linked-wallet checks need live Solana data', 'amb');
      lk.disabled = true; const list = Sol.wallets.slice(0, 30); let k = 0;
      for (const w of list) { k++; lk.textContent = `Checking ${k}/${list.length}…`; try { await P.findFunder(w.addr); } catch (e) { P.funder[w.addr] = null; } await new Promise((r) => setTimeout(r, Sol.custom ? 50 : 300)); }
      P.recalcLinks(); lk.disabled = false; lk.textContent = 'Find linked'; P.renderPanel(); toast(`Checked ${list.length} wallets: ${P.groups.length} linked group${P.groups.length === 1 ? '' : 's'} found`, 'acc');
    };
  };
  P.renderPanel = () => { const host = $('#wpPanel'); if (!host) return; P.recalcLinks(); host.innerHTML = P.panel(); P.bindPanel(host); };
  P.drawerHtml = (w) => {
    const s = P.score(w), o = ST.copyBt || (ST.copyBt = { delay: 10, size: 100, fee: 1 });
    return `<div class="sec">Score v2</div><div class="row" style="gap:10px;align-items:center"><span class="safe-pill g-${s.grade === '?' ? 'u' : s.grade.toLowerCase()}" style="font-size:20px">${s.grade}</span>
      <div class="note">${s.n < 5 ? `Only ${s.n} closed trade${s.n === 1 ? '' : 's'} decoded: needs 5+ for a grade.` : `${s.score}/100 · adjusted win rate ${s.wr.toFixed(0)}% · profit factor ${s.pf.toFixed(2)}`}${s.style ? ' · ' + esc(s.style) : ''}<br><span class="mut">Recent trades count more (14-day half-life) and small samples are pulled toward 50%.</span></div></div>
      <div class="sec">Copy-backtest</div><div class="note">Would copying this wallet have made money? Replays its last 12 tokens as if you copied each buy and sell late.</div>
      <div class="row" style="gap:6px;margin:6px 0"><label class="f">Delay (s)<input class="in num" id="cbDelay" type="number" min="0" max="600" value="${esc(o.delay)}" style="width:70px"></label><label class="f">$ per trade<input class="in num" id="cbSize" type="number" min="1" value="${esc(o.size)}" style="width:80px"></label><label class="f">Fees % per side<input class="in num" id="cbFee" type="number" min="0" max="10" step="0.1" value="${esc(o.fee)}" style="width:70px"></label><button class="btn sm pri" id="cbRun" style="align-self:end">Run</button></div>
      <div id="cbOut">${P.copyBusy[w.addr] ? `<div class="note">${P.copyBusy[w.addr]}</div>` : P.lastCopy[w.addr] || ''}</div>`;
  };
  P.bindDrawer = (w) => {
    const b = $('#cbRun'); if (!b) return;
    b.onclick = async () => {
      const o = ST.copyBt; o.delay = Math.max(0, Math.min(600, +$('#cbDelay').value || 0)); o.size = Math.max(1, +$('#cbSize').value || 100); o.fee = Math.max(0, Math.min(10, +$('#cbFee').value || 0)); saveState();
      const show = (h) => { const out = $('#cbOut'); if (out && tr.drawer === w.addr) out.innerHTML = h; }; b.disabled = true; // the drawer re-renders: results are kept per wallet
      try {
        const r = await P.copyBacktest(w, { delay: o.delay, size: o.size, fee: o.fee / 100, delayCost: 0.0015 }, (t) => { P.copyBusy[w.addr] = t; show(`<div class="note">${t}</div>`); });
        P.lastCopy[w.addr] = P.copyHtml(r, o);
      } catch (e) { P.lastCopy[w.addr] = `<div class="note dn">${esc(e.message)}</div>`; }
      delete P.copyBusy[w.addr]; show(P.lastCopy[w.addr]); const bb = $('#cbRun'); if (bb) bb.disabled = false;
    };
  };
  P.copyHtml = (r, o) => !r.n ? '<div class="note">No complete trades with prices to replay.</div>' : `<div class="stats" style="margin:4px 0"><div class="stat"><span class="k">You (copying)</span><span class="v ${r.pnl >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(r.pnl)}</span><span class="s">${NT.fmtPct(r.retPct)} per trade avg</span></div><div class="stat"><span class="k">The wallet</span><span class="v ${r.own >= 0 ? 'up' : 'dn'}">${NT.fmtUSD(r.own)}</span><span class="s">same size, no delay or fees</span></div><div class="stat"><span class="k">Win rate</span><span class="v">${((r.wins / r.n) * 100).toFixed(0)}%</span><span class="s">${r.wins}/${r.n} trades</span></div></div>
    <table class="cb-table"><thead><tr><th>Token</th><th class="r">You</th><th class="r">Wallet</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td>${esc(x.sym || '')}${x.open ? ' <span class="tag">open</span>' : ''}${x.estimated ? ' <span class="tag amb" title="No 1-minute candles covered this moment, so the delay cost was estimated">est.</span>' : ''}</td><td class="r num ${x.ret >= 0 ? 'up' : 'dn'}">${NT.fmtPct(x.ret, 1)}</td><td class="r num ${x.own >= 0 ? 'up' : 'dn'}">${NT.fmtPct(x.own, 1)}</td></tr>`).join('')}</tbody></table>
    <div class="note">${o.delay}s delay, ${o.fee}% fees each side${r.est ? `, ${r.est} trade${r.est > 1 ? 's' : ''} estimated` : ''}. ${r.pnl < r.own * 0.5 ? 'Copying late gives away most of this wallet’s edge: they are probably too fast to follow.' : r.pnl > 0 ? 'Copying would have kept a good part of the edge on these trades.' : 'Copying would have lost money on these trades.'}</div>`;
  return P;
})();
