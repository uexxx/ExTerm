/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.0 UI: six local external bot bridges + the four-gate live safety lock.
   · Grok tab → Execution Bridge panel (six adapter slots, heartbeat latency, per-slot HMAC secret, receiver schema);
     Settings tab → status card that opens it
   · PAPER on every fresh install: paper fills are logged as "simulated" and nothing leaves the page
   · Live External Execution stays disabled until all four gates pass; config is frozen while live
   · boot / reload with live armed → Live External Bot Connected briefing; signals are held until acknowledged
   · LIVE BOT ARMED top-bar pill; Ctrl+Shift+K disarms instantly and reverts all six slots to PAPER
   Strict CSP: no inline handlers, every dynamic string through esc(), requests only to V160.checkUrl endpoints,
   redirects refused, no cookies, no referrer. Logic in V160 (v160core.js). */
const V160UI = (() => {
  const KEY = 'exterm.v160.bridge';
  const U = { st: null, session: '', seq: 0, briefed: true, phrase: '', fails: {}, log: [], stats: { sent: 0, blocked: 0, sim: 0, kills: 0 } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const def = (id) => V160.SLOTS.find((s) => s.id === id);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U.st)); } catch (e) { /* private window: state lives for this session */ } };
  const load = () => {
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    U.st = V160.load(raw); for (const s of U.st.slots) if (!s.secret) s.secret = V160.rand(32); save();
  };
  const equity = (acct) => { try { return (acct || ACC).equity(priceMap()); } catch (e) { return 0; } };
  const today = () => new Date().toISOString().slice(0, 10);
  const dayLoss = () => { const e = equity(); if (!U.st.day || U.st.day.d !== today()) { U.st.day = { d: today(), eq0: e }; save(); } return Math.max(0, U.st.day.eq0 - e); };
  const live = () => U.st.mode === 'live';
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; };
  const note = (kind, msg) => { U.log.unshift({ t: Date.now(), kind, msg }); if (U.log.length > 12) U.log.length = 12; paintLog(); };

  /* ══ transport: signed envelope → loopback (or allow-listed LAN over TLS) only ══ */
  const wsSend = (url, wire) => new Promise((res, rej) => {
    let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
    const end = () => { try { ws.close(); } catch (e) { /* closed */ } };
    const tm = setTimeout(() => { end(); rej(new Error('no reply in 4 s')); }, 4000);
    ws.onopen = () => ws.send(wire);
    ws.onmessage = (m) => { clearTimeout(tm); let j = {}; try { j = JSON.parse(m.data); } catch (e) { j = {}; } end(); res(j); };
    ws.onerror = () => { clearTimeout(tm); rej(new Error('socket refused')); };
  });
  const send = async (s, kind, body) => {
    const chk = V160.checkUrl(s.url, U.st.allow); if (!chk.ok) throw new Error(chk.why);
    const wire = await V160.envelope(def(s.id), kind, body, s.secret, U.session, ++U.seq, U.st.mode);
    const t0 = performance.now(); let reply;
    if (chk.ws) reply = await wsSend(chk.href, wire);
    else {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
      try {
        const r = await fetch(chk.href, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'content-type': 'text/plain' }, body: wire, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status); reply = await r.json().catch(() => ({}));
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'no reply in 4 s' : String(e.message || e)); } finally { clearTimeout(tm); }
    }
    if (reply && reply.ok === false) throw new Error('receiver rejected the envelope');
    return Math.max(1, Math.round(performance.now() - t0));
  };
  const heartbeat = async (s) => {
    try { const ms = await send(s, 'heartbeat', { ping: 1 }); s.hb = { ok: true, ms, t: Date.now(), why: '' }; U.fails[s.id] = 0; }
    catch (e) { s.hb = { ok: false, ms: 0, t: Date.now(), why: String(e.message || e).slice(0, 120) }; U.fails[s.id] = (U.fails[s.id] || 0) + 1; if (s.mode === 'live' && U.fails[s.id] >= V160.HB_FAILS) kill('heartbeat lost on Slot ' + s.id); }
    save(); paint(); return s.hb;
  };

  /* ══ routing: every paper fill passes through here (manual → slots 1–5, the promoted bot → slot 6) ══ */
  const route = (t, acct) => {
    if (!t || t.src === 'backtest' || typeof ACC === 'undefined') return;
    const bot = acct === ACC ? null : (ST.bots || []).find((b) => b.account === acct); if (acct !== ACC && !bot) return;
    if (bot && String(bot.id) !== U.st.promote) return;
    const p = acct.pos && acct.pos[t.sym], n = (v) => (Number.isFinite(v) && v ? +v.toPrecision(10) : null);
    const body = { action: t.side, symbol: baseOf(t.sym), usd: +(+t.usd || 0).toFixed(2), price: n(t.price), qty: n(t.qty), sl: p ? n(p.sl) : null, tp: p ? n(p.tp) : null, source: bot ? 'bot:' + bot.id : 'manual' };
    const targets = U.st.slots.filter((s) => s.enabled && (bot ? s.id === 6 : s.id !== 6)); if (!targets.length) return;
    const what = `${body.action.toUpperCase()} ${body.symbol} $${body.usd}`;
    if (!live()) { U.stats.sim++; note('sim', `PAPER · ${what} simulated on ${targets.length} slot${targets.length > 1 ? 's' : ''}, nothing sent`); return; }
    if (!U.briefed) { U.stats.blocked++; note('block', `HELD · ${what}: acknowledge the live briefing first`); return; }
    const open = Object.keys(acct.pos || {}).filter((k) => k !== t.sym && acct.pos[k].qty > 0).length;
    const riskUsd = body.sl && t.price ? (t.usd * Math.abs(t.price - body.sl)) / t.price : +t.usd;
    const g = V160.guard({ side: t.side, riskUsd }, U.st.caps, { dayLoss: dayLoss(), open, equity: equity(acct) });
    if (!g.ok) { U.stats.blocked++; note('block', `BLOCKED · ${what}: ${g.why}`); toast('⛔ Circuit breaker: ' + esc(g.why), 'dn'); return; }
    for (const s of targets.filter((x) => x.mode === 'live')) send(s, 'signal', body).then((ms) => { U.stats.sent++; note('sent', `LIVE · ${what} → Slot ${s.id} (${ms} ms)`); }, (e) => note('err', `FAILED · ${what} → Slot ${s.id}: ${e.message}`));
  };
  const wireTrades = () => {
    if (typeof NT === 'undefined' || (NT.onTrade && NT.onTrade._v160)) return;
    const o = NT.onTrade; NT.onTrade = function (t, a) { if (o) o.apply(this, arguments); try { route(t, a); } catch (e) { console.warn('v160 route', e); } }; NT.onTrade._v160 = true;
  };

  /* ══ arm / kill ══ */
  const arm = () => {
    const n = V160.arm(U.st, U.phrase, Date.now(), equity()); if (!n) { toast('All four gates must pass before live routing can be armed', 'amb'); return; }
    U.st = n; U.phrase = ''; U.briefed = true; save(); render(); const ls = V160.liveSlots(U.st);
    note('arm', `ARMED · live routing on ${ls.map((s) => 'Slot ' + s.id).join(', ')}`); toast('🔴 Live external routing armed. Ctrl+Shift+K disarms instantly.', 'dn');
  };
  const kill = (why) => {
    const was = live(), armed = V160.liveSlots(U.st);
    U.st = V160.kill(U.st); U.phrase = ''; U.briefed = true; U.stats.kills++; save(); closeBrief(); render();
    note('kill', `PAPER · ${why || 'disarmed'}; all six slots reverted to PAPER`);
    if (was) { toast('🛑 Live routing disarmed (' + esc(why || 'kill-switch') + '). All six slots are PAPER.', 'acc'); for (const s of armed) send(s, 'disarm', { reason: why || 'kill-switch' }).catch(() => { /* receiver gone: local state is already PAPER */ }); }
  };

  /* ══ boot briefing ══ */
  const closeBrief = () => { const m = $1('#v160Brief'); if (m) m.remove(); };
  const brief = () => {
    closeBrief(); if (!live()) return; U.briefed = false;
    const c = U.st.caps, rows = V160.liveSlots(U.st).map((s) => `<tr><th>Slot ${s.id}</th><td>${esc(def(s.id).name)}</td><td class="mono">${esc(s.url)}</td><td data-v160b="${s.id}">${s.hb && s.hb.ok ? esc(s.hb.ms + ' ms') : 'checking…'}</td></tr>`).join('');
    const m = document.createElement('div'); m.id = 'v160Brief'; m.className = 'v160-ov'; m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'v160BriefT');
    m.innerHTML = `<div class="v160-modal"><div class="v160-mh"><span class="v160-dot"></span><h2 id="v160BriefT">Live External Bot Connected</h2></div>
      <p>ExTerm started with <b>live external routing armed</b>. Signals are held until you choose below.</p>
      <table class="v160-kv"><tbody>${rows}</tbody></table>
      <div class="v160-caps"><span>Max Daily Loss <b>$${esc((+c.maxLoss).toLocaleString('en-US'))}</b></span><span>Max Trade Risk <b>${esc(+c.riskPct)}%</b></span><span>Max Concurrent Positions <b>${esc(+c.maxPos)}</b></span></div>
      <p class="v160-legal">Nothing in ExTerm is investment advice. You alone decide, and are solely responsible for, every order your own local bot places with your own accounts. ExTerm holds no funds and no keys and runs no servers.</p>
      <div class="v160-acts"><button type="button" class="btn pri" data-v160="briefAck">Acknowledge &amp; Continue Live</button><button type="button" class="btn v160-danger" data-v160="revert">Disconnect &amp; Revert to Paper</button></div>
      <p class="note">Ctrl+Shift+K disarms live routing at any time.</p></div>`;
    document.body.appendChild(m); m.addEventListener('click', onClick);
    const b = $1('[data-v160="briefAck"]', m); if (b) b.focus();
    for (const s of V160.liveSlots(U.st)) heartbeat(s).then((hb) => { const td = $1(`#v160Brief [data-v160b="${s.id}"]`); if (td) td.textContent = hb.ok ? hb.ms + ' ms' : 'no heartbeat: ' + hb.why; });
  };

  /* ══ views ══ */
  const slotCard = (s) => {
    const d = def(s.id);
    return `<div class="v160-slot" data-slot="${s.id}"><div class="v160-sh"><span class="v160-n">Slot ${s.id}</span><b>${esc(d.name)}</b><span class="sp"></span><span class="v160-mode" data-v160mode="${s.id}">PAPER</span></div>
      <p class="note">${esc(d.note)}</p>
      <label class="v160-url"><span>${d.tx === 'ws' ? 'WebSocket' : 'HTTP'} endpoint</span><input class="v160-cfg mono" data-v160f="url" data-id="${s.id}" value="${esc(s.url)}" spellcheck="false" autocomplete="off" aria-label="Slot ${s.id} endpoint"></label>
      <div class="v160-err" data-v160err="${s.id}"></div>
      <div class="v160-row"><label class="v160-chk"><input type="checkbox" class="v160-cfg" data-v160f="en" data-id="${s.id}"${s.enabled ? ' checked' : ''}> Enabled</label>
        <button type="button" class="btn xs" data-v160="hb" data-id="${s.id}">Heartbeat</button><span class="v160-hb" data-v160hb="${s.id}">–</span></div>
      <div class="v160-row v160-sec"><span>HMAC secret</span><code data-v160sec="${s.id}">${esc(s.secret.slice(0, 8))}…</code><button type="button" class="btn xs" data-v160="copy" data-id="${s.id}">Copy</button><button type="button" class="btn xs v160-cfg" data-v160="regen" data-id="${s.id}">New</button></div>
      ${s.id === 6 ? `<label class="v160-url"><span>Promoted bot (Quant Lab / Shadow)</span><select class="v160-cfg" data-v160f="promote"><option value="">None</option>${(typeof ST !== 'undefined' && ST.bots || []).map((b) => `<option value="${esc(b.id)}"${String(b.id) === U.st.promote ? ' selected' : ''}>${esc(b.name || b.id)}</option>`).join('')}</select></label>` : ''}
      <details class="v160-schema"><summary>Receiver schema &amp; sample</summary><pre>${esc(V160.schema(d))}</pre><pre>${esc(V160.sampleReceiver(d, ''))}</pre>${d.tx === 'ws' ? '<p class="note">For this socket slot, run the same signature, freshness and sequence checks in any WebSocket server and reply with one JSON frame.</p>' : ''}</details></div>`;
  };
  const panelHTML = () => {
    const c = U.st.caps;
    return `<div class="ph"><span>⚡ Execution Bridge · 6 Local Bot Adapters</span><span class="sp"></span><span class="v160-badge" data-v160m>PAPER / SIMULATION</span></div>
    <div class="pb">
      <p class="note">Signals go only to processes you run on <b>127.0.0.1 / localhost</b> (or a private-LAN host:port you allow-list over TLS), signed with HMAC-SHA256 and a per-session nonce. No central servers, no telemetry, no custody. Every fresh install starts in PAPER.</p>
      <div class="v160-grid">${U.st.slots.map(slotCard).join('')}</div>
      <label class="v160-url v160-allow"><span>Allow-listed LAN endpoints (optional, https / wss only)</span><input class="v160-cfg mono" data-v160f="allow" value="${esc(U.st.allow)}" placeholder="192.168.1.20:8443" spellcheck="false" autocomplete="off"></label>
      <div class="v160-lock" id="v160Lock"><h3>🔒 4-Gate Live Safety Lock</h3>
        <ol class="v160-gates" id="v160Gates"></ol>
        <div class="v160-capsin">
          <label><span>Max Daily Loss $</span><input type="number" min="1" step="1" class="v160-cfg" data-v160f="maxLoss" value="${esc(c.maxLoss)}" inputmode="decimal"></label>
          <label><span>Max Risk Per Trade %</span><input type="number" min="0.01" max="100" step="0.1" class="v160-cfg" data-v160f="riskPct" value="${esc(c.riskPct)}" inputmode="decimal"></label>
          <label><span>Max Concurrent Positions</span><input type="number" min="1" max="100" step="1" class="v160-cfg" data-v160f="maxPos" value="${esc(c.maxPos)}" inputmode="numeric"></label>
        </div>
        <label class="v160-chk v160-ack"><input type="checkbox" class="v160-cfg" data-v160f="ack"${U.st.ack ? ' checked' : ''}> I understand ExTerm gives no investment advice and that I am solely responsible for every order my own local bot sends to my own accounts.</label>
        <label class="v160-url"><span>Type <b>${esc(V160.PHRASE)}</b> to confirm</span><input class="v160-cfg mono" data-v160f="phrase" value="" spellcheck="false" autocomplete="off" aria-label="Confirmation phrase"></label>
        <div class="v160-row"><button type="button" class="btn pri" data-v160="arm" disabled>Enable Live External Execution</button><button type="button" class="btn v160-danger" data-v160="revert">Disconnect &amp; Revert to Paper</button><span class="note">Ctrl+Shift+K = emergency kill-switch</span></div>
      </div>
      <h3>Signal log</h3><ul class="v160-log" id="v160Log"></ul>
    </div>`;
  };
  let panel = null, card = null;
  const render = () => { if (panel) { panel.innerHTML = panelHTML(); paintLog(); } paint(); };
  const paintLog = () => { const l = panel && $1('#v160Log', panel); if (l) l.innerHTML = U.log.length ? U.log.map((x) => `<li class="k-${esc(x.kind)}"><time>${esc(new Date(x.t).toLocaleTimeString())}</time> ${esc(x.msg)}</li>`).join('') : '<li class="note">No signals yet. Paper fills appear here as simulated routes.</li>'; };
  const paint = () => {
    const L = live(), now = Date.now();
    const pill = $1('#v160Pill'); if (pill) pill.hidden = !L;
    document.body.classList.toggle('v160-live', L);
    if (card) { const en = U.st.slots.filter((s) => s.enabled).length; card.querySelector('[data-v160c]').textContent = (L ? 'LIVE BOT ARMED' : 'PAPER / SIMULATION') + ` · ${en} of 6 slots enabled`; card.classList.toggle('is-live', L); }
    if (!panel) return;
    for (const b of panel.querySelectorAll('[data-v160m]')) { b.textContent = L ? 'LIVE BOT ARMED' : 'PAPER / SIMULATION'; b.classList.toggle('is-live', L); }
    for (const s of U.st.slots) {
      const m = $1(`[data-v160mode="${s.id}"]`, panel); if (m) { m.textContent = s.mode === 'live' ? 'LIVE' : 'PAPER'; m.classList.toggle('is-live', s.mode === 'live'); }
      const h = $1(`[data-v160hb="${s.id}"]`, panel); if (h) { h.className = 'v160-hb' + (s.hb ? (V160.healthy(s, now) ? ' ok' : s.hb.ok ? '' : ' bad') : ''); h.textContent = !s.hb ? 'not checked' : s.hb.ok ? `${s.hb.ms} ms · ${ago(s.hb.t)}` : 'no heartbeat: ' + s.hb.why; }
      const e = $1(`[data-v160err="${s.id}"]`, panel), chk = V160.checkUrl(s.url, U.st.allow); if (e) e.textContent = chk.ok ? '' : chk.why;
    }
    const gs = V160.gates(U.st, U.phrase, now), gl = $1('#v160Gates', panel);
    if (gl) gl.innerHTML = gs.map((g) => `<li class="${g.ok || L ? 'ok' : ''}"><i>${g.ok || L ? '✓' : '✕'}</i><span>Gate ${g.id}: ${esc(g.label)}</span></li>`).join('');
    const ab = $1('[data-v160="arm"]', panel); if (ab) { ab.disabled = L || !gs.every((g) => g.ok); ab.textContent = L ? 'Live External Execution: ARMED' : 'Enable Live External Execution'; }
    for (const x of panel.querySelectorAll('.v160-cfg')) x.disabled = L;
    const ph = $1('[data-v160f="phrase"]', panel); if (ph && document.activeElement !== ph) ph.value = U.phrase;
    const ak = $1('[data-v160f="ack"]', panel); if (ak) ak.checked = U.st.ack;
  };

  /* ══ events (delegated; no inline handlers) ══ */
  function onClick(ev) {
    const b = ev.target.closest('[data-v160]'); if (!b) return; const a = b.dataset.v160, s = b.dataset.id ? U.st.slots.find((x) => x.id === +b.dataset.id) : null;
    if (a === 'hb' && s) { const h = panel && $1(`[data-v160hb="${s.id}"]`, panel); if (h) h.textContent = 'checking…'; heartbeat(s); }
    else if (a === 'copy' && s) { try { navigator.clipboard.writeText(s.secret).then(() => toast('Slot ' + s.id + ' secret copied: paste it into your local receiver', 'acc'), () => toast('Clipboard blocked: select the secret manually', 'amb')); } catch (e) { toast('Clipboard unavailable', 'amb'); } }
    else if (a === 'regen' && s && !live()) { s.secret = V160.rand(32); s.hb = null; save(); render(); toast('New secret for Slot ' + s.id + ': update your receiver', 'acc'); }
    else if (a === 'arm') arm();
    else if (a === 'revert') kill('disconnected by you');
    else if (a === 'briefAck') { U.briefed = true; closeBrief(); note('arm', 'ACKNOWLEDGED · live briefing accepted, routing resumed'); paint(); }
    else if (a === 'open') openPanel();
  }
  const onField = (ev) => {
    const f = ev.target.closest('[data-v160f]'); if (!f || (live() && f.dataset.v160f !== 'phrase')) return; const k = f.dataset.v160f, s = f.dataset.id ? U.st.slots.find((x) => x.id === +f.dataset.id) : null;
    if (k === 'url' && s) { s.url = f.value.trim().slice(0, 300); s.hb = null; }
    else if (k === 'en' && s) { s.enabled = f.checked; if (!s.enabled) s.hb = null; }
    else if (k === 'allow') U.st.allow = f.value.slice(0, 400);
    else if (k === 'promote') U.st.promote = f.value;
    else if (k === 'ack') U.st.ack = f.checked;
    else if (k === 'phrase') U.phrase = f.value;
    else if (k === 'maxLoss' || k === 'riskPct' || k === 'maxPos') U.st.caps[k] = f.value === '' ? '' : +f.value;
    if (k !== 'phrase') save(); paint();
  };
  const openPanel = () => { if (typeof showTab === 'function') showTab('grok'); mount(); if (panel) panel.scrollIntoView({ block: 'start' }); };
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'K' || e.key === 'k' || e.code === 'KeyK')) { e.preventDefault(); e.stopImmediatePropagation(); kill('Ctrl+Shift+K emergency kill-switch'); }
  };

  /* ══ mounting (re-attached if a host re-renders) ══ */
  const mount = () => {
    const g = $1('#tab-grok');
    if (g) { if (!panel) { panel = document.createElement('section'); panel.id = 'v160Bridge'; panel.className = 'panel v160'; panel.addEventListener('click', onClick); panel.addEventListener('input', onField); panel.addEventListener('change', onField); render(); } if (panel.parentNode !== g) g.insertBefore(panel, g.firstChild); }
    const st = $1('#tab-set');
    if (st) { if (!card) { card = document.createElement('div'); card.id = 'v160Set'; card.className = 'panel v160-setcard'; card.innerHTML = '<div class="ph"><span>⚡ Local Bot Execution Bridges</span></div><div class="pb"><span data-v160c></span><button type="button" class="btn sm" data-v160="open">Open Execution Bridge</button></div>'; card.addEventListener('click', onClick); } if (card.parentNode !== st) st.insertBefore(card, st.firstChild); }
    const top = $1('#top'), src = $1('#srcPill');
    if (top && !$1('#v160Pill')) { const p = document.createElement('button'); p.type = 'button'; p.id = 'v160Pill'; p.className = 'pill v160-pill'; p.hidden = true; p.title = 'Live external routing is armed. Click to review, Ctrl+Shift+K to disarm.'; p.innerHTML = '<i class="dot"></i>LIVE BOT ARMED'; p.addEventListener('click', openPanel); if (src && src.parentNode) src.parentNode.insertBefore(p, src); else top.appendChild(p); }
    paint();
  };
  U.start = () => {
    U.session = V160.rand(16); load(); document.body.classList.add('v160');
    window.addEventListener('keydown', onKey, true);
    wireTrades(); mount(); if (live()) brief();
    setInterval(() => { wireTrades(); mount(); }, 5000);
    setInterval(() => { for (const s of V160.liveSlots(U.st)) heartbeat(s); }, 15000);
  };
  Object.assign(U, { arm, kill, brief, heartbeat, route, mount, openPanel });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b160 = boot; boot = async function () { await _b160.apply(this, arguments); try { V160UI.start(); } catch (e) { console.warn('v160 init', e); } }; }
