/* ExTerm app — part E: Social Pulse tab (memecoins + stocks chatter) */
const so = { src: 'all', sent: 'all', q: '', tag: '', lastRender: 0, timer: null, seen: new Set() };
const SO_SRC = { x: ['𝕏', 'X'], dex: ['◈', 'DexScreener'], stocktwits: ['ST', 'StockTwits'], reddit: ['◉', 'Reddit'] };
function soMarket() { return ST.mode === 'stocks' ? 'stocks' : 'crypto'; }
function soText(t) { return esc(t).replace(/\$([A-Za-z][A-Za-z0-9]{0,9})\b/g, (m, a) => `<a href="#" class="ctag" data-sotag="${esc(a.toUpperCase())}">$${esc(a)}</a>`).replace(/(https?:\/\/[^\s<]+)/g, (u) => { const s = safeUrl(u.replace(/&amp;/g, '&'), ''); return s ? `<a href="${s}" target="_blank" rel="noopener noreferrer">${u.length > 40 ? u.slice(0, 38) + '…' : u}</a>` : u; }); }
function soCard(p) {
  const isNew = !so.seen.has(p.id); so.seen.add(p.id);
  const S2 = SO_SRC[p.src] || ['•', p.src], sc = p.sent.score, sl = sc > 0.15 ? ['bull', 'Bullish'] : sc < -0.15 ? ['bear', 'Bearish'] : ['neu', 'Neutral'];
  const tok = p.ca && Sol.tokens[p.ca];
  return `<div class="spost ${isNew ? 'new' : ''}"><div class="sp-h"><span class="sbadge2 s-${p.src}" title="${esc(S2[1])}">${esc(S2[0])}</span>${p.img && safeUrl(p.img, '', true) ? `<img class="sp-ic" src="${safeUrl(p.img, '', true)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-rm="1">` : ''}<b>${esc(p.author || S2[1])}</b>${p.handle ? `<span class="mut">@${esc(p.handle)}</span>` : ''}${p.verified ? '<span class="vf" title="verified">✔</span>' : ''}${p.kind === 'boost' ? '<span class="tag amb">⚡ boosted</span>' : p.kind === 'profile' ? '<span class="tag acc">new profile</span>' : ''}<span class="sp"></span><span class="mut">${ago(p.ts)}</span></div>
    <div class="sp-b">${soText(p.text)}</div>
    <div class="sp-f"><span class="pill2 ${sl[0]}">${sl[1]}</span>${p.eng ? `<span class="mut">♥ ${NT.fmtCompact(p.eng)}</span>` : ''}${p.followers ? `<span class="mut">${NT.fmtCompact(p.followers)} followers</span>` : ''}${p.tags.slice(0, 5).map((t) => `<a href="#" class="ctag" data-sotag="${esc(t)}">$${esc(t)}</a>`).join('')}${(p.ca ? [p.ca] : p.cas).slice(0, 2).map((c) => `<span class="ca" title="${esc(c)}">CA ${esc(c.slice(0, 4) + '…' + c.slice(-4))}${tok ? ' · ' + esc(tok.sym || '') : ''}<button class="btn xs" data-socopy="${esc(c)}">copy</button><a class="btn xs" href="${safeUrl('https://dexscreener.com/' + encodeURIComponent(p.chain || 'solana') + '/' + encodeURIComponent(c))}" target="_blank" rel="noopener noreferrer">chart</a></span>`).join('')}<span class="sp"></span>${p.xurl ? `<a href="${safeUrl(p.xurl)}" target="_blank" rel="noopener noreferrer">𝕏 profile ↗</a>` : ''}${p.url ? `<a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">open ↗</a>` : ''}</div></div>`;
}
function soFiltered() {
  const mk = soMarket(), q = so.q.toLowerCase();
  return Social.posts.filter((p) => p.market === mk && (so.src === 'all' || p.src === so.src) && (so.sent === 'all' || (so.sent === 'bull' ? p.sent.score > 0.15 : p.sent.score < -0.15)) && (!so.tag || p.tags.includes(so.tag) || p.cas.includes(so.tag.replace(/^CA:/, '')) || 'CA:' + p.ca === so.tag) && (!q || p.text.toLowerCase().includes(q) || (p.author || '').toLowerCase().includes(q) || (p.handle || '').toLowerCase().includes(q)));
}
function renderSocial(force) {
  if (curTab !== 'social') return; if (!force && Date.now() - so.lastRender < 1500) return; so.lastRender = Date.now();
  const mk = soMarket(), posts = Social.posts.filter((p) => p.market === mk), now = Date.now(), h1 = posts.filter((p) => now - p.ts < 3600e3);
  const bull = h1.filter((p) => p.sent.score > 0.15).length, bear = h1.filter((p) => p.sent.score < -0.15).length, tr2 = Social.trends(mk), top = tr2[0];
  const kpi = (k, v, s, c = '') => `<div class="rk"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`;
  $('#soHero').innerHTML = `<div class="rhead"><div class="rpulse ${Social.busy ? 'warn' : 'ok'}"><i></i><i></i><b>${mk === 'crypto' ? '🐸' : '📣'}</b></div><div><div class="rtitle">${mk === 'crypto' ? 'Memecoin Social Pulse' : 'Stock Social Pulse'}</div><div class="note">${posts.length} posts · ${Object.values(Social.src).filter((s) => s.ok).length} live sources · ${Social.lastRun ? 'updated ' + ago(Social.lastRun) + ' ago' : 'loading…'}</div></div></div>`
    + kpi('Posts · 1h', h1.length, `${posts.length} in the last 48h`) + `<div class="rk"><span class="k">Bulls vs bears · 1h</span><span class="v">${bull}<span class="mut" style="font-size:13px"> / ${bear}</span></span><span class="rbar"><i style="width:${bull + bear ? ((bull / (bull + bear)) * 100).toFixed(0) : 50}%"></i></span></div>`
    + kpi('Hottest', top ? esc(top.k.startsWith('CA:') ? soCaName(top.k) : '$' + top.k) : '–', top ? `${top.now} mentions · 1h${top.vel > 1.5 ? ' · 🚀 ' + top.vel.toFixed(1) + '×' : ''}` : 'waiting for posts')
    + kpi('Fastest riser', (() => { const r = tr2.filter((e) => e.now >= 2).sort((a, b) => b.vel - a.vel)[0]; return r ? esc(r.k.startsWith('CA:') ? soCaName(r.k) : '$' + r.k) : '–'; })(), 'mention velocity vs last hour')
    + kpi('Mood', (() => { const a = h1.length ? h1.reduce((s, p) => s + p.sent.score, 0) / h1.length : 0; return a > 0.1 ? 'Greedy' : a < -0.1 ? 'Fearful' : 'Neutral'; })(), 'average post sentiment', '');
  // trends
  $('#soTrends').innerHTML = tr2.length ? tr2.map((e, i) => { const sp = Math.max(-1, Math.min(1, e.avgSent)); return `<div class="trend ${so.tag === e.k ? 'on' : ''}" data-sotag="${esc(e.k)}"><span class="rk2">${i + 1}</span><div style="min-width:0"><b>${esc(e.k.startsWith('CA:') ? soCaName(e.k) : '$' + e.k)}</b><div class="note">${[...e.srcs].map((s) => (SO_SRC[s] || [s])[0]).join(' ')} · ${e.all} total</div></div><div class="r"><b class="mono">${e.now}</b><div class="note ${e.vel > 1.3 ? 'up' : e.vel && e.vel < 0.7 ? 'dn' : ''}">${e.vel > 1.3 ? '▲' : e.vel && e.vel < 0.7 ? '▼' : '•'} ${e.vel ? e.vel.toFixed(1) + '×' : 'new'}</div></div><span class="sbar"><i style="left:50%;width:${Math.abs(sp) * 50}%;${sp < 0 ? 'transform:translateX(-100%);background:var(--dn)' : ''}"></i></span></div>`; }).join('') : '<div class="empty">Cashtags and contract addresses people are talking about will rank here.</div>';
  // feed
  const F = soFiltered(); $('#soCount').textContent = F.length + ' posts' + (so.tag ? ' · ' + (so.tag.startsWith('CA:') ? soCaName(so.tag) : '$' + so.tag) : '');
  const key = F.length + ':' + (F[0] && F[0].id) + ':' + so.src + so.sent + so.q + so.tag;
  if (force || key !== so.key) { so.key = key; $('#soFeed').innerHTML = F.length ? F.slice(0, 150).map(soCard).join('') : `<div class="empty">${Social.busy ? 'Loading posts…' : 'No posts match. Clear the filters, or add an X token for real tweets.'}</div>`; }
  // sources
  const want = mk === 'crypto' ? ['dex', 'reddit', 'x'] : ['stocktwits', 'reddit', 'x'];
  $('#soSrcs').innerHTML = want.map((k) => { const s = Social.src[k] || {}; return `<div class="ep"><i class="dot ${s.ok ? 'ok' : s.ok === false ? 'bad' : 'warn'}"></i><b>${esc((SO_SRC[k] || [k, k])[1])}</b><span class="sp"></span><span class="note">${esc(s.info || 'waiting')}</span></div>`; }).join('') + `<div class="note" style="margin-top:8px;line-height:1.5">X has no free API and blocks scraping, so real tweets need your own X API bearer token (developer.x.com) plus the launcher. Everything else here works with no key.</div>`;
  const xs = $('#soX'); if (xs && !xs.contains(document.activeElement)) xs.innerHTML = `<label class="f">X API bearer token<input class="in mono" id="soXTok" type="password" value="${esc((ST.social && ST.social.xToken) || '')}" placeholder="AAAA… (optional)"></label><label class="f" style="margin-top:6px">X search query<input class="in" id="soXQ" value="${esc((ST.social && ST.social.q) || '')}" placeholder="${mk === 'crypto' ? 'e.g. pump.fun OR $BONK -is:retweet' : 'e.g. $NVDA OR $TSLA lang:en'}"></label><div class="row" style="margin-top:6px"><button class="btn sm pri" id="soXSave">Save &amp; refresh</button></div>`;
}
function soCaName(k) { const c = k.replace(/^CA:/, ''), t = Sol.tokens[c]; return t && t.sym ? t.sym + ' (' + c.slice(0, 4) + '…)' : c.slice(0, 4) + '…' + c.slice(-4); }
async function soRefresh() { const mk = soMarket(); await Social.run(mk, { q: ST.social && ST.social.q, sym: mk === 'stocks' && so.tag && !so.tag.startsWith('CA:') ? so.tag : null }); const cas = new Set(); for (const p of Social.posts) { if (p.market === 'crypto') { (p.ca ? [p.ca] : p.cas).forEach((c) => { if (!Sol.tokens[c] && Sol.isAddr(c)) cas.add(c); }); } } if (cas.size && Sol.queueTokens) Sol.queueTokens([...cas].slice(0, 30)); renderSocial(true); }
function initSocial() {
  segBtns($('#soSrc'), [{ v: 'all', l: 'All sources' }, { v: 'x', l: '𝕏 X' }, { v: 'dex', l: '◈ DexScreener' }, { v: 'stocktwits', l: 'StockTwits' }, { v: 'reddit', l: 'Reddit' }], so.src, (v) => { so.src = v; renderSocial(true); });
  segBtns($('#soSent'), [{ v: 'all', l: 'All' }, { v: 'bull', l: '🟢 Bullish' }, { v: 'bear', l: '🔴 Bearish' }], so.sent, (v) => { so.sent = v; renderSocial(true); });
  $('#soQ').oninput = (e) => { so.q = e.target.value; renderSocial(true); };
  $('#soRef').onclick = () => soRefresh();
  $('#tab-social').addEventListener('click', (e) => {
    const t = e.target.closest('[data-sotag]'); if (t) { e.preventDefault(); so.tag = so.tag === t.dataset.sotag ? '' : t.dataset.sotag; renderSocial(true); if (soMarket() === 'stocks' && so.tag && !so.tag.startsWith('CA:')) soRefresh(); return; }
    const c = e.target.closest('[data-socopy]'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.socopy).then(() => toast('Contract address copied', 'acc', 1500)).catch(() => toast('Copy blocked by the browser', 'amb')); return; }
    if (e.target.id === 'soXSave') { ST.social = ST.social || {}; ST.social.xToken = $('#soXTok').value.trim(); ST.social.q = $('#soXQ').value.trim(); saveState(); toast('X settings saved', 'acc'); soRefresh(); }
    if (e.target.id === 'soClearTag') { so.tag = ''; renderSocial(true); }
  });
}
TABS.social = {
  show() { renderSocial(true); if (!Social.lastRun || Date.now() - Social.lastRun > 45000 || Social.market !== soMarket()) soRefresh(); clearInterval(so.timer); so.timer = setInterval(() => { if (curTab === 'social' && !document.hidden) soRefresh(); else clearInterval(so.timer); }, 45000); },
  render() { renderSocial(); },
};
