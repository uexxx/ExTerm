/* ExTerm Social Pulse — live social chatter for memecoins and stocks.
   Sources: X (official API v2, needs your bearer token + the launcher), DexScreener token profiles & boosts (memecoins, no key),
   StockTwits (stocks, no key), Reddit (r/wallstreetbets, r/CryptoMoonShots …, no key). Direct scraping of x.com is not possible
   from a browser (login wall, CORS) and breaks X's terms, so X data comes only from the official API. */
const Social = (() => {
  const S = { posts: [], ids: new Set(), src: {}, busy: false, lastRun: 0, listeners: [] };
  const CA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, TAG_RE = /\$([A-Za-z][A-Za-z0-9]{0,9})\b/g;
  const clean = (s, n = 600) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);
  const okUrl = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } };
  const SUBS = { crypto: ['CryptoMoonShots', 'SatoshiStreetBets', 'solana', 'memecoins'], stocks: ['wallstreetbets', 'stocks', 'pennystocks', 'options'] };
  function mk(o) {
    const text = clean(o.text), tags = [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1].toUpperCase()))].filter((t) => !/^\d/.test(t)).slice(0, 8);
    const cas = o.market === 'crypto' ? [...new Set((text.match(CA_RE) || []).filter((c) => /pump$|[a-z]/.test(c) && c.length >= 32))].slice(0, 3) : [];
    const sent = o.sent || (NT.sentiment ? NT.sentiment(text) : { score: 0, label: 'neutral' });
    return Object.assign({ eng: 0, url: null, img: null, author: '', handle: '' }, o, { text, tags: o.tags ? o.tags.concat(tags.filter((t) => !o.tags.includes(t))) : tags, cas, sent, author: clean(o.author, 60), handle: clean(o.handle, 40), url: okUrl(o.url), img: okUrl(o.img) });
  }
  function add(p) { if (S.ids.has(p.id)) return false; S.ids.add(p.id); S.posts.push(p); return true; }
  const status = (k, ok, info) => { S.src[k] = { ok, info: String(info || '').slice(0, 120), at: Date.now() }; };

  /* ── X / Twitter (official API v2) ── */
  async function x(market, query) {
    const tok = (ST.social && ST.social.xToken) || '';
    if (!tok) { status('x', null, 'add an X API bearer token in Settings to stream real tweets'); return 0; }
    if (!J.proxy) { status('x', false, 'X blocks browsers: launch with start-exterm.bat'); return 0; }
    const q = query || (market === 'crypto' ? '(memecoin OR pump.fun OR $SOL OR "CA:") lang:en -is:retweet' : '($SPY OR $NVDA OR $TSLA OR $AAPL OR earnings) lang:en -is:retweet');
    const u = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=50&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,name,verified,public_metrics`;
    const r = await J.get(u, { headers: { Authorization: 'Bearer ' + tok }, timeout: 15000, proxy: true });
    const users = new Map(((r.includes && r.includes.users) || []).map((u2) => [u2.id, u2])); let n = 0;
    for (const t of r.data || []) { const us = users.get(t.author_id) || {}, pm = t.public_metrics || {}; if (add(mk({ id: 'x:' + t.id, src: 'x', market, text: t.text, author: us.name, handle: us.username, verified: !!us.verified, followers: us.public_metrics ? us.public_metrics.followers_count : null, ts: Date.parse(t.created_at) || Date.now(), eng: (pm.like_count || 0) + 2 * (pm.retweet_count || 0) + (pm.reply_count || 0), url: `https://x.com/${encodeURIComponent(us.username || 'i')}/status/${encodeURIComponent(t.id)}` }))) n++; }
    status('x', true, `${n} new tweets`); return n;
  }
  /* ── DexScreener: newly profiled & boosted tokens, with their X links ── */
  async function dex() {
    const [prof, boost] = await Promise.all([J.get('https://api.dexscreener.com/token-profiles/latest/v1', { timeout: 12000 }).catch(() => []), J.get('https://api.dexscreener.com/token-boosts/latest/v1', { timeout: 12000 }).catch(() => [])]);
    let n = 0; const now = Date.now();
    const handle = (arr, kind) => {
      for (const p of (Array.isArray(arr) ? arr : []).slice(0, 60)) {
        if (!p || !p.tokenAddress) continue;
        const tw = (p.links || []).find((l) => /twitter|x\.com/i.test((l.type || '') + (l.url || '')));
        const id = `dex:${kind}:${p.chainId}:${p.tokenAddress}:${p.totalAmount || ''}`;
        if (add(mk({ id, src: 'dex', market: 'crypto', kind, chain: clean(p.chainId, 12), ca: clean(p.tokenAddress, 64), text: clean(p.description || (kind === 'boost' ? 'Boosted on DexScreener' : 'New token profile'), 400), author: (p.chainId || '').toUpperCase() + ' token', handle: tw ? (String(tw.url).split('/').filter(Boolean).pop() || '') : '', ts: now, eng: kind === 'boost' ? (+p.totalAmount || +p.amount || 0) : 0, url: okUrl(p.url), xurl: tw ? okUrl(tw.url) : null, img: p.icon, tags: [] }))) n++;
      }
    };
    handle(prof, 'profile'); handle(boost, 'boost');
    status('dex', (Array.isArray(prof) && prof.length) || (Array.isArray(boost) && boost.length) ? true : false, n + ' new tokens'); return n;
  }
  /* ── StockTwits (stocks): trending stream + per-symbol stream ── */
  async function stocktwits(sym) {
    const u = sym ? `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(sym)}.json` : 'https://api.stocktwits.com/api/2/streams/trending.json';
    const r = await J.get(u, { timeout: 12000 }); let n = 0;
    for (const m of r.messages || []) {
      const bb = m.entities && m.entities.sentiment && m.entities.sentiment.basic, sent = bb ? { score: bb === 'Bullish' ? 0.6 : -0.6, label: bb === 'Bullish' ? 'positive' : 'negative' } : null;
      if (add(mk({ id: 'st:' + m.id, src: 'stocktwits', market: 'stocks', text: m.body, author: m.user && m.user.name, handle: m.user && m.user.username, followers: m.user && m.user.followers, ts: Date.parse(m.created_at) || Date.now(), eng: (m.likes && m.likes.total) || 0, url: `https://stocktwits.com/${encodeURIComponent((m.user && m.user.username) || 'x')}/message/${encodeURIComponent(m.id)}`, sent, tags: (m.symbols || []).map((s2) => String(s2.symbol || '').toUpperCase()).filter(Boolean).slice(0, 6) }))) n++;
    }
    status('stocktwits', true, n + ' new messages'); return n;
  }
  /* ── Reddit ── */
  async function reddit(market) {
    let n = 0, ok = false;
    for (const sub of SUBS[market]) {
      try {
        const r = await J.get(`https://www.reddit.com/r/${sub}/new.json?limit=30&raw_json=1`, { timeout: 12000 }); ok = true;
        for (const c of (r.data && r.data.children) || []) { const d = c.data || {}; if (add(mk({ id: 'rd:' + d.id, src: 'reddit', market, sub, text: (d.title || '') + (d.selftext ? ' — ' + d.selftext : ''), author: 'u/' + (d.author || ''), handle: 'r/' + sub, ts: (d.created_utc || 0) * 1000, eng: (d.score || 0) + (d.num_comments || 0), url: d.permalink ? 'https://www.reddit.com' + d.permalink : null }))) n++; }
      } catch (e) { /* try next sub */ }
    }
    status('reddit', ok, ok ? n + ' new posts' : 'Reddit blocked this request (try the launcher)'); return n;
  }

  S.run = async (market, opt = {}) => {
    if (S.busy) return; S.busy = true; S.market = market;
    const jobs = market === 'crypto' ? [['dex', () => dex()], ['reddit', () => reddit('crypto')], ['x', () => x('crypto', opt.q)]] : [['stocktwits', () => stocktwits(opt.sym)], ['reddit', () => reddit('stocks')], ['x', () => x('stocks', opt.q)]];
    await Promise.all(jobs.map(([k, f]) => f().catch((e) => status(k, false, e.message))));
    const cut = Date.now() - 48 * 3600e3; S.posts = S.posts.filter((p) => p.ts > cut).sort((a, b) => b.ts - a.ts).slice(0, 1500); S.ids = new Set(S.posts.map((p) => p.id));
    S.busy = false; S.lastRun = Date.now(); S.listeners.forEach((f) => { try { f(); } catch (e) { } });
  };
  /** cashtag / token leaderboard with velocity (last hour vs the hour before) and sentiment */
  S.trends = (market, win = 3600e3) => {
    const now = Date.now(), m = new Map();
    for (const p of S.posts) {
      if (p.market !== market) continue;
      const keys = p.tags.concat(p.cas.map((c) => 'CA:' + c)).concat(p.src === 'dex' && p.ca ? ['CA:' + p.ca] : []);
      for (const k of keys) { const e = m.get(k) || { k, now: 0, prev: 0, all: 0, sent: 0, eng: 0, srcs: new Set(), last: 0 }; e.all++; e.sent += p.sent.score; e.eng += p.eng || 0; e.srcs.add(p.src); e.last = Math.max(e.last, p.ts); if (now - p.ts < win) e.now++; else if (now - p.ts < 2 * win) e.prev++; m.set(k, e); }
    }
    return [...m.values()].map((e) => Object.assign(e, { vel: e.prev ? e.now / e.prev : e.now ? e.now * 2 : 0, avgSent: e.sent / e.all })).sort((a, b) => b.now - a.now || b.all - a.all).slice(0, 40);
  };
  return S;
})();
