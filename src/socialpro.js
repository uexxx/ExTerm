/* ExTerm v13 Social Pulse upgrades: spam / bot filtering, spike detection against each ticker's own normal level,
   optional sentiment from your local AI, spike alerts (in-app and Telegram / Discord), and social volume drawn under
   the price chart. */
const SocialPro = (() => {
  const P = { alerted: {}, aiBusy: false, aiDone: 0 };
  const cfg = () => { const s = ST.social || (ST.social = {}); if (s.hideSpam == null) s.hideSpam = true; if (s.spikeZ == null) s.spikeZ = 3; return s; };
  const SHILL = /\b(airdrop|presale|pre-sale|giveaway|whitelist|dm me|join (my|our) (vip|group)|guaranteed|100x gem|send (me )?\d|free (sol|crypto|money)|claim now|stealth launch)\b/i;
  const norm = (t) => String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

  /* ── spam / bot scoring: reasons are shown on the post ── */
  P.flag = (posts) => {
    const now = Date.now(), byText = new Map(), byAuthor = new Map();
    for (const p of posts) {
      if (now - p.ts > 6 * 3600e3) continue;
      const k = norm(p.text); if (k.length >= 25) { const s = byText.get(k) || new Set(); s.add(p.author || p.handle || p.id); byText.set(k, s); }
      const a = (p.src || '') + ':' + (p.handle || p.author || ''); if (p.handle || p.author) byAuthor.set(a, (byAuthor.get(a) || 0) + (now - p.ts < 3600e3 ? 1 : 0));
    }
    for (const p of posts) {
      const why = [], k = norm(p.text);
      if (k.length >= 25 && (byText.get(k) || new Set()).size >= 3) why.push('same text posted by ' + byText.get(k).size + ' accounts');
      if ((p.tags || []).length >= 6) why.push(p.tags.length + ' cashtags');
      if (SHILL.test(p.text || '')) why.push('shill words');
      const a = (p.src || '') + ':' + (p.handle || p.author || ''); if ((byAuthor.get(a) || 0) > 10) why.push('posting 10+ times an hour');
      const em = (String(p.text || '').match(/\p{Extended_Pictographic}/gu) || []).length; if (em >= 12) why.push('emoji spam');
      p.spam = why.length ? why : null;
    }
    return posts;
  };
  P.visible = (posts) => (cfg().hideSpam ? posts.filter((p) => !p.spam) : posts);

  /* ── spikes: mentions this hour vs the same ticker's previous hours (z-score) ── */
  P.spikes = (market) => {
    const now = Date.now(), H = 24, cnt = new Map();
    for (const p of P.visible(Social.posts)) {
      if (p.market !== market) continue; const h = Math.floor((now - p.ts) / 3600e3); if (h >= H) continue;
      const keys = (p.tags || []).concat((p.cas || []).map((c) => 'CA:' + c)).concat(p.src === 'dex' && p.ca ? ['CA:' + p.ca] : []);
      for (const k of new Set(keys)) { const a = cnt.get(k) || new Array(H).fill(0); a[h]++; cnt.set(k, a); }
    }
    const out = [];
    for (const [k, a] of cnt) {
      const cur = a[0], prev = a.slice(1), mean = prev.reduce((s, v) => s + v, 0) / prev.length, sd = Math.sqrt(prev.reduce((s, v) => s + (v - mean) ** 2, 0) / prev.length);
      const z = (cur - mean) / Math.max(1, sd); // at least 1 so a ticker going from 0 to 2 posts isn't a "spike"
      if (cur >= 3) out.push({ k, cur, mean, z, series: a.slice().reverse() });
    }
    return out.sort((x, y) => y.z - x.z);
  };
  P.checkSpikes = (market) => {
    const z = cfg().spikeZ;
    for (const s of P.spikes(market).filter((x) => x.z >= z + 1).slice(0, 3)) {
      if (P.alerted[s.k] > Date.now() - 2 * 3600e3) continue; P.alerted[s.k] = Date.now();
      const name = s.k.startsWith('CA:') ? soCaName(s.k) : '$' + s.k, msg = `📣 Social spike: ${name} has ${s.cur} mentions this hour vs ~${s.mean.toFixed(1)} normally (${s.z.toFixed(1)}σ)`;
      toast(esc(msg), 'acc', 8000);
      if (cfg().pushSpikes && typeof WalletPro !== 'undefined') WalletPro.push(msg);
    }
  };

  /* ── sentiment from your local AI (Ollama through the launcher). Optional; falls back to the word list. ── */
  P.aiSentiment = async () => {
    if (P.aiBusy || !cfg().aiSent || !(Launcher.caps && Launcher.caps.ollama) || !Launcher.models || !Launcher.models.length) return 0;
    const todo = Social.posts.filter((p) => !p.aiSent && !p.spam && p.text && p.text.length > 12).slice(0, 20); if (!todo.length) return 0;
    P.aiBusy = true;
    try {
      const list = todo.map((p, i) => `${i + 1}. ${String(p.text).replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
      const r = await J.post('/ollama/v1/chat/completions', { model: ST.ai.preset === 'ollamab' && ST.ai.model ? ST.ai.model : Launcher.models[0], stream: false, temperature: 0, response_format: { type: 'json_object' }, // the bridge's existing OpenAI-compatible route
        messages: [{ role: 'system', content: 'You rate trading sentiment. For each numbered social-media post, give a number from -1 (very bearish) to 1 (very bullish), 0 if neutral or unrelated. Understand crypto slang and sarcasm ("ngmi", "rug", "send it", "wagmi"). Reply ONLY with JSON: {"scores":[n1,n2,...]} in the same order.' }, { role: 'user', content: list }] }, { timeout: 60000 });
      const txt = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content; let sc = null; try { sc = JSON.parse(txt).scores; } catch (e) { sc = null; }
      if (!Array.isArray(sc)) return 0;
      todo.forEach((p, i) => { const v = +sc[i]; p.aiSent = true; if (Number.isFinite(v)) { const s = Math.max(-1, Math.min(1, v)); p.sent = { score: s, label: s > 0.15 ? 'bullish' : s < -0.15 ? 'bearish' : 'neutral', ai: true }; } });
      P.aiDone += todo.length; return todo.length;
    } catch (e) { return 0; } finally { P.aiBusy = false; }
  };

  /* ── social volume under the price chart ── */
  P.keyFor = (sym) => { if (isOnchain(sym)) { const m = OC.meta[sym] || {}; return { tag: (m.s || '').toUpperCase(), ca: m.ca || '' }; } return { tag: baseOf(sym).toUpperCase(), ca: '' }; };
  P.overlay = (g, L, ch) => {
    if (!ST.settings.socialVol || !L.D || !L.D.length) return;
    const k = P.keyFor(ST.sel); if (!k.tag && !k.ca) return;
    const D = L.D, n = D.length, bars = new Array(n).fill(0), t0 = D[0].t * 1000, step = n > 1 ? (D[1].t - D[0].t) * 1000 : 60000;
    for (const p of P.visible(Social.posts)) {
      if (!((p.tags || []).includes(k.tag) || (k.ca && ((p.cas || []).includes(k.ca) || p.ca === k.ca)))) continue;
      const i = Math.floor((p.ts - t0) / step); if (i >= 0 && i < n) bars[i]++;
    }
    let mx = 0; for (let i = L.start; i < L.end; i++) mx = Math.max(mx, bars[i]); if (!mx) return;
    const h = L.mainH * 0.08, base = L.y0 + 4 + h;
    for (let i = L.start; i < L.end; i++) { if (!bars[i]) continue; const v = (bars[i] / mx) * h; g.fillStyle = 'rgba(56,189,248,.55)'; g.fillRect(L.kx(i) - L.bw * 0.3, base - v, Math.max(1, L.bw * 0.6), v); }
    g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = L.col.txt; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('💬 social mentions', L.Lm + 4, L.y0 + 4);
  };

  /* ── UI: Social tab side panel ── */
  P.panel = (market) => {
    const c = cfg(), sp = P.spikes(market).slice(0, 8), spam = Social.posts.filter((p) => p.market === market && p.spam).length;
    const spark = (a) => { const mx = Math.max(1, ...a); return `<svg class="spk" viewBox="0 0 48 14" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.4" points="${a.map((v, i) => `${(i / (a.length - 1)) * 48},${14 - (v / mx) * 13}`).join(' ')}"/></svg>`; };
    return `<div class="ph">⚡ Spikes <span class="sp"></span><span class="note">vs each ticker's normal</span></div><div class="pb">
      ${sp.length ? sp.map((s) => `<div class="row sp-row ${s.z >= c.spikeZ ? 'hot' : ''}" data-sotag="${esc(s.k)}" style="justify-content:space-between;cursor:pointer"><b>${esc(s.k.startsWith('CA:') ? soCaName(s.k) : '$' + s.k)}</b>${spark(s.series)}<span class="tag ${s.z >= c.spikeZ ? 'up' : ''}" title="${s.cur} mentions this hour vs ${s.mean.toFixed(1)} on average">${s.z.toFixed(1)}σ</span></div>`).join('') : '<div class="note">Spikes appear once there are a few hours of posts.</div>'}
      <div class="sec">Filters</div>
      <label class="chk"><input type="checkbox" id="spHide" ${c.hideSpam ? 'checked' : ''}> Hide spam and bot posts <span class="note">(${spam} hidden)</span></label>
      <label class="chk"><input type="checkbox" id="spAI" ${c.aiSent ? 'checked' : ''} ${Launcher.caps && Launcher.caps.ollama ? '' : 'disabled'}> Rate sentiment with my local AI ${Launcher.caps && Launcher.caps.ollama ? `<span class="note">(${P.aiDone} rated)</span>` : '<span class="note">(needs Ollama + the launcher)</span>'}</label>
      <label class="chk"><input type="checkbox" id="spVol" ${ST.settings.socialVol ? 'checked' : ''}> Show social volume under the price chart</label>
      <label class="chk"><input type="checkbox" id="spPush" ${c.pushSpikes ? 'checked' : ''} ${J.proxy ? '' : 'disabled'}> Message me big spikes (Telegram / Discord)</label>
    </div>`;
  };
  P.bind = (host) => {
    const c = cfg();
    host.querySelector('#spHide').onchange = (e) => { c.hideSpam = e.target.checked; saveState(); renderSocial(true); };
    const ai = host.querySelector('#spAI'); if (ai) ai.onchange = (e) => { c.aiSent = e.target.checked; saveState(); if (c.aiSent) P.aiSentiment().then(() => renderSocial(true)); };
    host.querySelector('#spVol').onchange = (e) => { ST.settings.socialVol = e.target.checked; saveState(); if (typeof chart !== 'undefined' && chart) chart.invalidate(); };
    const pu = host.querySelector('#spPush'); if (pu) pu.onchange = (e) => { c.pushSpikes = e.target.checked; saveState(); };
    host.querySelectorAll('[data-sotag]').forEach((r) => { r.onclick = () => { so.tag = so.tag === r.dataset.sotag ? '' : r.dataset.sotag; renderSocial(true); }; });
  };
  return P;
})();
