/* ExTerm v13 on-chain: token card (socials and links, buy/sell pressure, pool stats, automatic safety check, one-tap
   paper buy/sell), the Launch Radar (a live list and bubble map of brand-new pairs) and launch forensics (creator,
   snipers and bundled buys in a token's first blocks). All data is public and treated as untrusted. */

/* ───────────── token info: socials, description, holders ───────────── */
const TokenInfo = (() => {
  const T = { cache: {}, busy: {} };
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩<>"'`&]/g, '').trim().slice(0, n);
  const hx = (h, base) => { h = String(h == null ? '' : h).trim().replace(/^@/, ''); return /^[A-Za-z0-9_.]{2,64}$/.test(h) ? base + h : null; }; // reject (never repair) odd handles
  T.get = async (sym) => {
    const p = OC.parse(sym), m = OC.meta[sym] || {}; if (!p || p.chain === 'sim' || !m.ca) return null;
    const key = p.chain + ':' + m.ca, hit = T.cache[key]; if (hit && Date.now() - hit.ts < 600000) return hit;
    if (T.busy[key]) return T.busy[key];
    T.busy[key] = (async () => {
      const out = { ts: Date.now(), desc: '', holders: null, top10: null, gtScore: null };
      try {
        const r = await OC._gt(`/networks/${p.chain}/tokens/${m.ca}/info`, 10000), a = (r && r.data && r.data.attributes) || {};
        out.desc = clean(a.description, 600);
        const links = [];
        for (const w of (Array.isArray(a.websites) ? a.websites : []).slice(0, 3)) links.push({ url: w });
        const soc = [];
        const tw = hx(a.twitter_handle, 'https://x.com/'); if (tw) soc.push({ type: 'twitter', url: tw });
        const tg = hx(a.telegram_handle, 'https://t.me/'); if (tg) soc.push({ type: 'telegram', url: tg });
        if (a.discord_url) soc.push({ type: 'discord', url: a.discord_url });
        OC.setSocial(sym, links, soc);
        if (a.holders) { out.holders = +a.holders.count || null; const d = a.holders.distribution_percentage || {}; out.top10 = d.top_10 != null ? +d.top_10 : null; }
        out.gtScore = a.gt_score != null ? +a.gt_score : null;
      } catch (e) { out.err = e.message; }
      T.cache[key] = out; return out;
    })();
    try { return await T.busy[key]; } finally { delete T.busy[key]; }
  };
  return T;
})();

/* ───────────── token card (Markets › side column, on-chain mode) ───────────── */
const TokenCard = (() => {
  const C = { scanning: {} };
  const ICON = { Website: '🌐', X: '𝕏', Telegram: '✈️', Discord: '💬', TikTok: '🎵', Instagram: '📸', YouTube: '▶️', Reddit: '👽', GitHub: '🐙', Medium: '📝', Facebook: 'ⓕ', Farcaster: '🟪' };
  const big = (v) => (v == null ? '–' : '$' + NT.fmtCompact(v));
  const bar = (b, s, label) => { const t = (b || 0) + (s || 0), p = t ? (b / t) * 100 : 50; return `<div class="tc-bs"><span class="k">${label}</span><div class="tc-bar" title="${b || 0} buys · ${s || 0} sells"><i style="width:${p.toFixed(1)}%"></i></div><span class="num"><b class="up">${b == null ? '–' : NT.fmtCompact(b)}</b> / <b class="dn">${s == null ? '–' : NT.fmtCompact(s)}</b></span></div>`; };
  C.render = async () => {
    const host = $('#tokenCard'); if (!host) return;
    const s = ST.sel, on = ST.mode === 'onchain' && isOnchain(s); host.hidden = !on; if (!on) return;
    const st = OC.stats[s] || {}, m = OC.meta[s] || {}, pa = OC.parse(s) || {}, info = TokenInfo.cache[(pa.chain || '') + ':' + (m.ca || '')], soc = (OC.social[s] || {}).links || [];
    const sim = OC.sim || pa.chain === 'sim', saf = typeof Safety !== 'undefined' && m.ca ? Safety.cache[pa.chain + ':' + m.ca] : null, have = ACC.qty(s), price = px(s) || st.price;
    const liqRatio = st.liq && (st.mcap || st.fdv) ? (st.liq / (st.mcap || st.fdv)) * 100 : null;
    const ageH = st.created ? (Date.now() - st.created) / 36e5 : null;
    host.innerHTML = `<h3>🪙 ${esc(m.s || 'Token')} <span class="mut" style="font-weight:500">${esc(m.n || '')}</span><span class="sp"></span>${m.dex ? `<span class="tag">${esc(m.dex)}</span>` : ''}</h3><div class="pb tc">
      <div class="tc-soc">${soc.length ? soc.map((l) => `<a class="tc-link" href="${safeUrl(l.u, '#', true)}" target="_blank" rel="noopener noreferrer nofollow" title="${esc(l.u)}">${ICON[l.t] || '🔗'} ${esc(l.t)}</a>`).join('') : `<span class="note">${sim ? 'Simulated token.' : info ? '⚠ No website or socials listed. Most rugs have none: be extra careful.' : 'Looking up socials…'}</span>`}${OC.links(s).map(([t, u]) => `<a class="tc-link ghost" href="${safeUrl(u, '#', true)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`).join('')}</div>
      ${info && info.desc ? `<div class="tc-desc note">${esc(info.desc.slice(0, 220))}${info.desc.length > 220 ? '…' : ''}</div>` : ''}
      <div class="sec">Buy / sell pressure</div>
      ${bar(st.buys5m, st.sells5m, '5m')}${bar(st.buys1h, st.sells1h, '1h')}${bar(st.buys24, st.sells24, '24h')}
      ${st.buyers1h != null ? `<div class="note">1h: <b class="up">${st.buyers1h}</b> buyers vs <b class="dn">${st.sellers1h}</b> sellers</div>` : ''}
      <div class="sec">Pool stats</div>
      <div class="tc-grid">
        <div><span class="k">Price</span><b>${price ? NT.fmtPrice(price) : '–'}</b><span class="${cls(st.ch1h)}">${st.ch1h == null ? '' : NT.fmtPct(st.ch1h) + ' 1h'}</span></div>
        <div><span class="k">Market cap</span><b>${big(st.mcap || st.fdv)}</b><span class="note">FDV ${big(st.fdv)}</span></div>
        <div><span class="k">Liquidity</span><b>${big(st.liq)}</b><span class="${liqRatio != null && liqRatio < 3 ? 'dn' : 'note'}">${liqRatio == null ? '' : liqRatio.toFixed(1) + '% of mcap'}</span></div>
        <div><span class="k">Volume</span><b>${big(st.vol24)}</b><span class="note">1h ${big(st.vol1h)}${st.vol5m != null ? ' · 5m ' + big(st.vol5m) : ''}</span></div>
        <div><span class="k">Age</span><b>${ageH == null ? '–' : ageH < 1 ? Math.round(ageH * 60) + 'm' : ageH < 48 ? ageH.toFixed(1) + 'h' : Math.round(ageH / 24) + 'd'}</b><span class="note">${ageH != null && ageH < 24 ? 'brand new' : ''}</span></div>
        <div><span class="k">Holders</span><b>${info && info.holders ? NT.fmtCompact(info.holders) : '–'}</b><span class="${info && info.top10 > 40 ? 'dn' : 'note'}">${info && info.top10 != null ? 'top 10 hold ' + info.top10.toFixed(0) + '%' : ''}</span></div>
      </div>
      <div class="sec">Safety</div>
      <div class="tc-safe">${saf ? `<span class="safe-pill ${'g-' + String(saf.grade).toLowerCase().replace('?', 'u')}">${esc(saf.grade)}</span><div class="note">${saf.checks.filter((c) => c.status === 'fail' || c.status === 'warn').slice(0, 3).map((c) => `<div class="${c.status === 'fail' ? 'dn' : 'amb'}">${c.status === 'fail' ? '✕' : '!'} ${esc(c.label)}</div>`).join('') || '<div class="up">✓ No red flags in the checks</div>'}</div>` : `<span class="note">${sim ? 'Not available for simulated tokens.' : m.ca ? 'Scanning…' : 'No token address yet.'}</span>`}
        ${m.ca && !sim ? `<button class="btn sm" data-safety="${esc(m.ca)}" data-chain="${esc(pa.chain)}">Full report</button>` : ''}</div>
      ${pa.chain === 'solana' && m.ca ? `<button class="btn sm ghost" id="tcForensic" style="margin-top:6px;width:100%">🔬 Check launch for snipers &amp; bundles</button><div id="tcForOut"></div>` : ''}
      <div class="sec">Quick paper trade</div>
      <div class="tc-quick"><button class="btn sm buy" data-qb="25">Buy $25</button><button class="btn sm buy" data-qb="100">$100</button><button class="btn sm buy" data-qb="250">$250</button><button class="btn sm sell" data-qs="0.5" ${have ? '' : 'disabled'}>Sell ½</button><button class="btn sm sell" data-qs="1" ${have ? '' : 'disabled'}>Sell all</button></div>
      <div class="note">${have ? `You hold ${NT.fmtQty(have)} ${esc(m.s || '')} (${NT.fmtUSD(have * (price || 0))})` : 'Paper money only. DEX fees and slippage are charged like the order ticket.'}</div>
    </div>`;
    host.querySelectorAll('[data-qb]').forEach((b) => { b.onclick = () => { const usd = +b.dataset.qb, p = px(s); if (!(p > 0)) return toast('No price yet', 'amb'); if (ACC.cash < usd) return toast('Not enough paper cash', 'dn'); const t = ACC.buy(s, p, usd, Date.now(), { reason: 'quick buy (token card)', src: 'manual' }); if (t) { tradeToast(t, 'Paper account'); renderPosStrip(); saveState(); C.render(); } }; });
    host.querySelectorAll('[data-qs]').forEach((b) => { b.onclick = () => { const q = ACC.qty(s), p = px(s); if (!q || !(p > 0)) return; const t = ACC.sell(s, p, q * +b.dataset.qs, Date.now(), { reason: 'quick sell (token card)', src: 'manual' }); if (t) { tradeToast(t, 'Paper account'); renderPosStrip(); saveState(); C.render(); } }; });
    const fb = $('#tcForensic'); if (fb) fb.onclick = () => Forensics.run(m.ca, $('#tcForOut'), fb);
    // background lookups, at most once per token per visit
    if (!sim && m.ca && !info) TokenInfo.get(s).then(() => { if (ST.sel === s) C.render(); });
    if (!sim && m.ca && !saf && !C.scanning[m.ca] && typeof Safety !== 'undefined') { C.scanning[m.ca] = 1; Safety.scan(m.ca, pa.chain).then(() => { if (ST.sel === s) C.render(); }).catch(() => { /* card says scanning; the full report button still works */ }); }
  };
  return C;
})();

/* ───────────── launch forensics: creator, snipers, bundled buys ───────────── */
const Forensics = (() => {
  const F = { cache: {} };
  const MINT_RX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  // Walk back to the token's very first transactions (only practical for young tokens: capped at 4 pages of 1,000)
  F.earliest = async (mint, n = 25) => {
    let before = null, all = [];
    for (let page = 0; page < 4; page++) {
      const r = await Sol.rpc('getSignaturesForAddress', [mint, Object.assign({ limit: 1000 }, before ? { before } : {})]);
      if (!Array.isArray(r) || !r.length) break;
      all = all.concat(r); before = r[r.length - 1].signature;
      if (r.length < 1000) return { sigs: all.slice(-n).reverse(), complete: true, total: all.length };
    }
    return { sigs: all.slice(-n).reverse(), complete: false, total: all.length };
  };
  F.analyse = (txs, mint) => {
    // txs: parsed transactions in time order. Returns creator, first slot and per-buyer token amounts.
    const buyers = new Map(); let creator = null, slot0 = null, supply = null;
    for (const tx of txs) {
      if (!tx || !tx.meta || tx.meta.err) continue;
      const keys = (tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys) || [], payer = keys[0] && (keys[0].pubkey || keys[0]);
      if (slot0 == null) { slot0 = tx.slot; creator = typeof payer === 'string' ? payer : null; }
      const pre = new Map(), post = new Map();
      for (const b of tx.meta.preTokenBalances || []) if (b.mint === mint) pre.set(b.owner, +b.uiTokenAmount.uiAmount || 0);
      for (const b of tx.meta.postTokenBalances || []) if (b.mint === mint) { post.set(b.owner, +b.uiTokenAmount.uiAmount || 0); }
      for (const [own, amt] of post) {
        const d = amt - (pre.get(own) || 0);
        if (d > 0 && own && own !== creator && MINT_RX.test(own)) { const x = buyers.get(own) || { owner: own, amt: 0, slot: tx.slot, sig: tx.transaction.signatures[0] }; x.amt += d; buyers.set(own, x); }
      }
    }
    const list = [...buyers.values()].sort((a, b) => a.slot - b.slot);
    const snipers = list.filter((b) => slot0 != null && b.slot - slot0 <= 2), sameSlot = list.filter((b) => b.slot === slot0);
    return { creator, slot0, buyers: list, snipers, bundle: sameSlot.length >= 3 ? sameSlot : [], supply };
  };
  F.run = async (mint, out, btn) => {
    if (!MINT_RX.test(mint || '') || !out) return;
    if (F.cache[mint]) { out.innerHTML = F.html(F.cache[mint]); F.bind(out, F.cache[mint]); return; }
    btn.disabled = true; out.innerHTML = '<div class="note">Reading the token’s first transactions from Solana…</div>';
    try {
      const e = await F.earliest(mint, 25);
      if (!e.complete) { out.innerHTML = `<div class="note">This token already has more than ${NT.fmtQty(e.total)} transactions, so its launch blocks are too far back to read from a public node. Forensics works best on tokens under a few hours old.</div>`; return; }
      const txs = [];
      for (const s of e.sigs) { try { txs.push(await Sol.rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }])); } catch (er) { /* skip unreadable */ } await new Promise((r) => setTimeout(r, Sol.custom ? 60 : 250)); }
      let supply = null; try { const r = await Sol.rpc('getTokenSupply', [mint]); supply = r && r.value ? +r.value.uiAmount : null; } catch (er) { /* optional */ }
      const a = F.analyse(txs, mint); a.supply = supply; a.mint = mint; F.cache[mint] = a;
      out.innerHTML = F.html(a); F.bind(out, a);
    } catch (er) { out.innerHTML = `<div class="note dn">Couldn't read the launch: ${esc(er.message)}</div>`; }
    finally { btn.disabled = false; }
  };
  F.pct = (amt, sup) => (sup ? (amt / sup) * 100 : null);
  F.html = (a) => {
    const sn = a.snipers.reduce((s, b) => s + b.amt, 0), bu = a.bundle.reduce((s, b) => s + b.amt, 0), sp = F.pct(sn, a.supply), bp = F.pct(bu, a.supply);
    const risk = (a.bundle.length && bp != null && bp > 5) || (sp != null && sp > 15) ? 'dn' : (sp != null && sp > 5) || a.bundle.length ? 'amb' : 'up';
    return `<div class="forensic"><div class="row" style="justify-content:space-between"><b>Launch check</b><span class="tag ${risk}">${risk === 'dn' ? 'High risk' : risk === 'amb' ? 'Caution' : 'Looks organic'}</span></div>
      <div class="note">Creator: ${a.creator ? `<span class="mono">${esc(Sol.short(a.creator))}</span>` : 'unknown'}</div>
      <div class="note">Snipers (first 3 blocks): <b>${a.snipers.length}</b> wallet${a.snipers.length === 1 ? '' : 's'}${sp != null ? ` holding <b>${sp.toFixed(1)}%</b> of supply` : ''}</div>
      <div class="note">Bundled buys (same block as launch): <b class="${a.bundle.length ? 'dn' : ''}">${a.bundle.length ? a.bundle.length + ' wallets' + (bp != null ? ' · ' + bp.toFixed(1) + '% of supply' : '') : 'none found'}</b></div>
      ${a.buyers.length ? `<button class="btn sm" data-ftrack="1" style="margin-top:4px">Track the ${Math.min(10, a.buyers.length)} earliest buyers</button>` : ''}
      <div class="note" style="margin-top:4px">Reads the first 25 transactions. Snipers and bundles often dump on later buyers; it's a warning sign, not proof.</div></div>`;
  };
  F.bind = (out, a) => {
    const b = out.querySelector('[data-ftrack]'); if (!b) return;
    b.onclick = () => { const r = Sol.load(a.buyers.slice(0, 10).map((x, i) => ({ trackedWalletAddress: x.owner, name: `🎯 early #${i + 1} ${Sol.short(a.mint)}`, emoji: '🎯', alertsOn: false }))); toast(`Added ${r.added} early buyer${r.added === 1 ? '' : 's'} to the wallet tracker`, 'up'); saveState(); };
  };
  return F;
})();

/* ───────────── Launch Radar: brand-new pairs as a live list or a bubble map ───────────── */
const Radar = (() => {
  const R = { rows: [], seen: new Map(), ts: 0, busy: false, hover: null, anim: 0, pos: new Map(), scanQ: [] };
  const opt = () => ST.radar || (ST.radar = { view: 'tiles', sort: 'new', minLiq: 5000, socials: false });
  R.refresh = async (force) => {
    // 45 s between scans (GeckoTerminal's free tier is ~30 calls/min shared by every panel); after a rate limit, wait out the cool-down
    if (R.busy || (!force && Date.now() - R.ts < 45000) || (!force && R.retryAt && Date.now() < R.retryAt)) return;
    R.busy = true;
    try {
      const chain = (ST.heat && ST.heat.ocChain) || 'solana', a = await OC.discoverPage('new', chain, 1);
      // page 2 only when there is spare budget, every other scan; never let it cost the first page
      const b = (R.loads || 0) % 2 === 0 && !OC.gtCoolLeft() && OC.rpm >= OC.rpmMax ? await OC.discoverPage('new', chain, 2).catch(() => []) : R.rows.filter((s) => !a.includes(s)).slice(0, 20);
      const now = Date.now(); R.rows = [...new Set(a.concat(b))]; R.err = ''; R.rate = false; R.retryAt = 0;
      for (const s of R.rows) if (!R.seen.has(s)) R.seen.set(s, now);
      R.ts = now; R.loads = (R.loads || 0) + 1; OC.sim = false;
      // queue automatic safety scans for the newest Solana tokens (slowly: the scanner makes several requests each)
      for (const s of R.rows.slice(0, 12)) { const m = OC.meta[s] || {}, p = OC.parse(s) || {}; if (p.chain === 'solana' && m.ca && !Safety.cache['solana:' + m.ca] && !R.scanQ.includes(m.ca)) R.scanQ.push(m.ca); }
    } catch (e) { R.err = e.message; R.rate = !!e.rate; R.retryAt = e.rate ? Date.now() + (e.retryIn || 30000) + 500 : Date.now() + 20000; } // rows are kept: the last list stays on screen
    R.busy = false;
  };
  R.note = () => (R.err && R.rows.length ? (R.rate ? `⏸ paused by GeckoTerminal's free limit, showing the list from ${fmtClock(R.ts)} · resumes ${R.retryAt ? 'in ' + Math.max(1, Math.ceil((R.retryAt - Date.now()) / 1000)) + 's' : 'soon'}` : 'last update failed, showing ' + fmtClock(R.ts)) : R.ts ? 'updated ' + fmtClock(R.ts) : '');
  R.pump = setInterval(() => { const ca = R.scanQ.shift(); if (ca && typeof Safety !== 'undefined' && curTab === 'heat') Safety.scan(ca, 'solana').then(() => { if (opt().view === 'list') R.render(); }).catch(() => {}); }, 4000);
  R.score = (s) => { const st = OC.stats[s] || {}, b = st.buys5m || 0, x = st.sells5m || 0, bp = b + x ? b / (b + x) : 0.5, turn = st.liq ? (st.vol1h || 0) / st.liq : 0; return (bp - 0.5) * 2 + Math.max(-1, Math.min(1, (st.ch5m || 0) / 20)) + Math.min(2, turn); };
  R.filtered = () => {
    const o = opt();
    let rows = R.rows.filter((s) => { const st = OC.stats[s] || {}; return (st.liq || 0) >= o.minLiq && (!o.socials || ((OC.social[s] || {}).links || []).length); });
    const k = { new: (s) => -(OC.stats[s].created || 0), momentum: (s) => -R.score(s), volume: (s) => -(OC.stats[s].vol1h || 0), buys: (s) => { const st = OC.stats[s]; const t = (st.buys5m || 0) + (st.sells5m || 0); return t ? -(st.buys5m / t) : 0; } }[o.sort] || ((s) => 0);
    return rows.sort((a, b) => k(a) - k(b));
  };
  const age = (ms) => { const m = (Date.now() - ms) / 60000; return m < 60 ? Math.max(0, Math.round(m)) + 'm' : m < 2880 ? (m / 60).toFixed(1) + 'h' : Math.round(m / 1440) + 'd'; };
  R.toolbar = () => {
    const o = opt();
    return `<div class="radar-bar"><div class="seg" id="rdView">${[['tiles', '▦ Tiles'], ['list', '🚀 Radar'], ['bubbles', '🫧 Bubbles']].map(([v, l]) => `<button data-v="${v}" class="${o.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${o.view !== 'tiles' ? `<select class="in" id="rdSort" aria-label="Sort">${[['new', 'Newest first'], ['momentum', 'Momentum'], ['volume', '1h volume'], ['buys', 'Buy pressure (5m)']].map(([v, l]) => `<option value="${v}" ${o.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="note" style="display:flex;gap:4px;align-items:center">Min liquidity <select class="in" id="rdLiq">${[0, 1000, 5000, 20000, 100000].map((v) => `<option value="${v}" ${o.minLiq === v ? 'selected' : ''}>${v ? '$' + NT.fmtCompact(v) : 'any'}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="rdSoc" ${o.socials ? 'checked' : ''}> has socials</label><span class="note" id="rdNote">${esc(R.note())}</span>` : ''}</div>`;
  };
  R.bindBar = (host) => {
    const o = opt();
    const v = host.querySelector('#rdView'); if (v) v.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; o.view = b.dataset.v; saveState(); b.blur(); host._h = ''; R.key = ''; renderHeat(); };
    const so = host.querySelector('#rdSort'); if (so) so.onchange = () => { o.sort = so.value; saveState(); R.render(); };
    const lq = host.querySelector('#rdLiq'); if (lq) lq.onchange = () => { o.minLiq = +lq.value; saveState(); R.render(); };
    const sc = host.querySelector('#rdSoc'); if (sc) sc.onchange = () => { o.socials = sc.checked; saveState(); R.render(); };
  };
  R.render = () => {
    const host = $('#rdBody'); if (!host) return;
    const o = opt(), rows = R.filtered(), now = Date.now();
    if (!R.rows.length) { host.innerHTML = `<div class="empty">${R.busy ? 'Scanning for new pairs…' : R.rate ? esc(R.err) + '. Retrying automatically.' : R.err ? 'New pairs unavailable: ' + esc(R.err) + (J.proxy ? '' : '. Start the launcher if your browser blocks GeckoTerminal.') : 'Loading…'}</div>`; return; }
    const key = o.view === 'bubbles' ? 'b|' + rows.join(',') : o.view + '|' + rows.map((s) => s + ':' + ((OC.stats[s] || {}).ts || 0) + ':' + (((OC.meta[s] || {}).ca && Safety.cache['solana:' + OC.meta[s].ca] || {}).grade || '')).join(',');
    if (key === R.key && host.firstElementChild) return; // nothing changed: keep the DOM (hover, focus, animations)
    R.key = key;
    if (o.view === 'bubbles') return R.bubbles(host, rows);
    host.innerHTML = `<div class="radar-list">${rows.map((s) => {
      const st = OC.stats[s] || {}, m = OC.meta[s] || {}, p = OC.parse(s) || {}, saf = m.ca ? Safety.cache[p.chain + ':' + m.ca] : null, soc = (OC.social[s] || {}).links || [];
      const b = st.buys5m || 0, x = st.sells5m || 0, bp = b + x ? (b / (b + x)) * 100 : 50, fresh = R.loads > 1 && now - (R.seen.get(s) || 0) < 30000, sc = R.score(s);
      const mins = st.created ? (now - st.created) / 60000 : 999, ring = Math.max(0.04, 1 - Math.min(1, mins / 360));
      return `<div class="rd-row ${fresh ? 'fresh' : ''}" data-oc="${esc(s)}" tabindex="0" role="button" aria-label="Open ${esc(m.s || '')} chart">
        <div class="rd-age" style="--p:${ring.toFixed(3)}"><b>${st.created ? age(st.created) : '?'}</b></div>
        <div class="rd-name">${m.img && ST.settings.ocLogos !== false ? `<img src="${safeUrl(m.img, '', true)}" alt="" class="oc-logo" referrerpolicy="no-referrer" loading="lazy">` : ''}<div><b>${esc(m.s || '?')}</b>${fresh ? ' <span class="tag acc">NEW</span>' : ''}${/pump/i.test(m.dex || '') ? ' <span class="tag amb" title="Launched on pump.fun">pump</span>' : ''}<div class="note">${esc((m.n || '').slice(0, 26))}</div></div></div>
        <div class="rd-num"><span class="k">MC</span>${st.mcap || st.fdv ? '$' + NT.fmtCompact(st.mcap || st.fdv) : '–'}</div>
        <div class="rd-num"><span class="k">Liq</span>${st.liq ? '$' + NT.fmtCompact(st.liq) : '–'}</div>
        <div class="rd-num"><span class="k">Vol 1h</span>${st.vol1h ? '$' + NT.fmtCompact(st.vol1h) : '–'}</div>
        <div class="rd-num ${cls(st.ch5m)}"><span class="k">5m</span>${st.ch5m == null ? '–' : NT.fmtPct(st.ch5m, 0)}</div>
        <div class="rd-bs" title="${b} buys / ${x} sells in 5 minutes"><div class="tc-bar"><i style="width:${bp.toFixed(0)}%"></i></div><span class="note">${b}/${x} 5m</span></div>
        <div class="rd-soc">${soc.slice(0, 3).map((l) => `<span title="${esc(l.t)}">${{ Website: '🌐', X: '𝕏', Telegram: '✈️', Discord: '💬' }[l.t] || '🔗'}</span>`).join('') || '<span class="note" title="No socials listed">—</span>'}</div>
        <div class="rd-safe">${saf ? `<span class="safe-pill g-${String(saf.grade).toLowerCase().replace('?', 'u')}" title="Safety grade">${esc(saf.grade)}</span>` : p.chain === 'solana' ? '<span class="note" title="Queued for a safety scan">…</span>' : ''}</div>
        <div class="rd-mo ${sc > 0.8 ? 'up' : sc < -0.3 ? 'dn' : ''}" title="Momentum: buy pressure + 5m change + volume vs liquidity">${sc > 1.5 ? '🔥' : sc > 0.8 ? '↗' : sc < -0.3 ? '↘' : '·'}</div>
      </div>`;
    }).join('') || '<div class="empty">No new pairs match these filters.</div>'}</div>`;
  };
  /* bubble map: x = age (newest right), y = 5-minute buy pressure, size = 1h volume, colour = 1h change */
  R.bubbles = (host, rows) => {
    host.innerHTML = '<div class="rd-bub"><canvas id="rdCv" aria-label="Bubble map of new pairs"></canvas><div class="rd-tip" id="rdTip" hidden></div><div class="rd-axis note"><span>← older</span><span>buy pressure ↑</span><span>newer →</span></div></div>';
    const cv = $('#rdCv'), wrap = cv.parentElement, dpr = window.devicePixelRatio || 1, W = wrap.clientWidth || 900, Hh = Math.max(420, Math.min(680, window.innerHeight - 300));
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const now = Date.now(), vmax = Math.max(1, ...rows.map((s) => OC.stats[s].vol1h || 0));
    const nodes = rows.slice(0, 60).map((s) => {
      const st = OC.stats[s] || {}, mins = st.created ? Math.max(1, (now - st.created) / 60000) : 720, b = st.buys5m || 0, x = st.sells5m || 0, bp = b + x ? b / (b + x) : 0.5;
      const tx = 40 + (1 - Math.min(1, Math.log(mins) / Math.log(1440))) * (W - 80), ty = 30 + (1 - bp) * (Hh - 70), r = 8 + Math.sqrt((st.vol1h || 0) / vmax) * 42;
      const prev = R.pos.get(s) || { x: tx, y: ty };
      return { s, tx, ty, x: prev.x, y: prev.y, r, ch: st.ch1h || 0, m: OC.meta[s] || {}, st, bp };
    });
    const col = (ch) => { const k = Math.max(-1, Math.min(1, ch / 30)); return k >= 0 ? `rgba(${Math.round(34 + (1 - k) * 90)},${Math.round(197 + (1 - k) * 20)},${Math.round(94 + (1 - k) * 80)},.85)` : `rgba(239,${Math.round(68 + (1 + k) * 120)},${Math.round(68 + (1 + k) * 120)},.85)`; };
    const draw = (t) => {
      if (!document.body.contains(cv)) { cancelAnimationFrame(R.anim); return; }
      ctx.clearRect(0, 0, W, Hh);
      ctx.strokeStyle = 'rgba(148,163,200,.12)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(0, 30 + (Hh - 70) / 2); ctx.lineTo(W, 30 + (Hh - 70) / 2); ctx.stroke(); ctx.setLineDash([]);
      for (const n of nodes) { n.x += (n.tx - n.x) * 0.06; n.y += (n.ty - n.y) * 0.06; } // ease toward the target…
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { // …and push overlapping bubbles apart
        const a = nodes[i], b2 = nodes[j], dx = b2.x - a.x, dy = b2.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b2.r + 3;
        if (d < min) { const k = ((min - d) / d) * 0.5; a.x -= dx * k; a.y -= dy * k; b2.x += dx * k; b2.y += dy * k; }
      }
      for (const n of nodes) { // keep inside the canvas, then a gentle float
        n.x = Math.max(n.r + 2, Math.min(W - n.r - 2, n.x)); n.y = Math.max(n.r + 2, Math.min(Hh - n.r - 22, n.y));
        const fx = n.x + Math.sin(t / 900 + n.r) * 1.5, fy = n.y + Math.cos(t / 1100 + n.r) * 1.5; n.fx = fx; n.fy = fy; R.pos.set(n.s, { x: n.x, y: n.y });
        const g = ctx.createRadialGradient(fx - n.r / 3, fy - n.r / 3, 1, fx, fy, n.r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(0.35, col(n.ch)); g.addColorStop(1, col(n.ch).replace('.85', '.55'));
        ctx.beginPath(); ctx.arc(fx, fy, n.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        if (R.hover === n.s) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        if (n.r > 16) { ctx.fillStyle = 'rgba(10,12,20,.9)'; ctx.font = `700 ${Math.min(14, n.r / 2.4)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n.m.s || '?').slice(0, 8), fx, fy); }
      }
      R.anim = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(R.anim); R.anim = requestAnimationFrame(draw);
    const hit = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return nodes.slice().reverse().find((n) => Math.hypot(n.fx - x, n.fy - y) <= n.r); };
    cv.onmousemove = (e) => {
      const n = hit(e), tip = $('#rdTip'); R.hover = n ? n.s : null; cv.style.cursor = n ? 'pointer' : 'default';
      if (!n) { tip.hidden = true; return; }
      tip.hidden = false; tip.style.left = Math.min(W - 230, n.fx + n.r + 8) + 'px'; tip.style.top = Math.max(0, n.fy - 40) + 'px';
      tip.innerHTML = `<b>${esc(n.m.s || '?')}</b> <span class="note">${esc((n.m.n || '').slice(0, 24))}</span><div>MC ${n.st.mcap || n.st.fdv ? '$' + NT.fmtCompact(n.st.mcap || n.st.fdv) : '–'} · Liq ${n.st.liq ? '$' + NT.fmtCompact(n.st.liq) : '–'}</div><div>1h <span class="${cls(n.ch)}">${NT.fmtPct(n.ch)}</span> · vol $${NT.fmtCompact(n.st.vol1h || 0)}</div><div>${(n.bp * 100).toFixed(0)}% buys (5m) · ${n.st.created ? age(n.st.created) + ' old' : ''}</div>`;
    };
    cv.onmouseleave = () => { R.hover = null; const tip = $('#rdTip'); if (tip) tip.hidden = true; };
    cv.onclick = (e) => { const n = hit(e); if (n) openSym(n.s); };
  };
  return R;
})();
