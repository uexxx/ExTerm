/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* ExTerm v16.0 / v16.1 UI: six local external bot bridges, the four-gate live safety lock and the eight fail-safe engines.
   · Grok tab → Execution Bridge panel (six adapter slots, heartbeat latency, per-slot HMAC secret, receiver schema,
     Test Signal Payload dry-run); Settings tab → status card that opens it
   · PAPER on every fresh install: paper fills are logged as "simulated" and nothing leaves the page
   · Live External Execution stays disabled until all four gates pass; config is frozen while live
   · boot / reload with live armed → Live External Bot Connected briefing; signals are held until acknowledged
   · v16.1: idempotency_key + 3 s TTL on every packet, ephemeral per-session signing key (rotated on boot and on arm),
     sender-side nonce cache, schema + Max Single-Order Notional firewall, spread circuit breaker, consecutive-loss
     cooldown, Dead-Man's Switch watchdog, Flatten All & Disarm (CANCEL_ALL_AND_FLATTEN broadcast) and the signed
     receipt ledger with JSON / CSV export
   · LIVE BOT ARMED top-bar pill; Ctrl+Shift+K flattens + disarms instantly and reverts all six slots to PAPER
   Strict CSP: no inline handlers, every dynamic string through esc(), requests only to V160.checkUrl endpoints,
   redirects refused, no cookies, no referrer. Logic in V160 (v160core.js) and V161 (v161core.js). */
const V160UI = (() => {
  const KEY = 'exterm.v160.bridge', FKEY = 'exterm.v161.fs', LKEY = 'exterm.v161.ledger', HB_EVERY = 15000;
  const U = { st: null, session: '', sessAt: 0, seq: 0, briefed: true, phrase: '', fails: {}, log: [], stats: { sent: 0, blocked: 0, sim: 0, kills: 0 }, fs: null, ledger: [], used: null, lastOk: {}, book: {}, pre: [], requireSL: true, post: [], hbL: [], manual: [] };
  const $1 = (s, r) => (r || document).querySelector(s);
  const def = (id) => V160.SLOTS.find((s) => s.id === id);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(U.st)); } catch (e) { /* private window: state lives for this session */ } };
  const saveFs = () => { try { localStorage.setItem(FKEY, JSON.stringify(U.fs)); } catch (e) { /* session only */ } };
  let ledT = 0; const saveLedger = () => { clearTimeout(ledT); ledT = setTimeout(() => { try { localStorage.setItem(LKEY, JSON.stringify(U.ledger)); } catch (e) { /* full or private */ } }, 400); };
  const load = () => {
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    U.st = V160.load(raw); for (const s of U.st.slots) if (!s.secret) s.secret = V160.rand(32); save();
    let f = null, l = null; try { f = localStorage.getItem(FKEY); l = JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) { l = []; }
    U.fs = V161.loadFs(f); U.ledger = (Array.isArray(l) ? l : []).filter((r) => r && typeof r === 'object').slice(0, V161.LEDGER_MAX).map((r) => V161.ledgerRow(r.kind, { ts: +r.ts, slot: r.slot, status: r.status, key: r.idempotency_key, sig: r.sig, detail: r.detail }));
  };
  const equity = (acct) => { try { return (acct || ACC).equity(priceMap()); } catch (e) { return 0; } };
  const today = () => new Date().toISOString().slice(0, 10);
  const dayLoss = () => { const e = equity(); if (!U.st.day || U.st.day.d !== today()) { U.st.day = { d: today(), eq0: e }; save(); } return Math.max(0, U.st.day.eq0 - e); };
  const live = () => U.st.mode === 'live';
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; };
  const note = (kind, msg) => { U.log.unshift({ t: Date.now(), kind, msg }); if (U.log.length > 12) U.log.length = 12; paintLog(); };
  const led = (kind, o) => { U.ledger.unshift(V161.ledgerRow(kind, o || {})); if (U.ledger.length > V161.LEDGER_MAX) U.ledger.length = V161.LEDGER_MAX; saveLedger(); paintLedger(); };
  /* ephemeral signing key rotation: a fresh session nonce → a fresh derived HMAC key on every receiver */
  const rotate = () => { U.session = V160.rand(16); U.sessAt = Date.now(); U.seq = 0; };

  /* ══ transport: signed envelope → loopback (or allow-listed LAN over TLS) only ══ */
  const wsSend = (url, wire) => new Promise((res, rej) => {
    let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
    const end = () => { try { ws.close(); } catch (e) { /* closed */ } };
    const tm = setTimeout(() => { end(); rej(new Error('no reply in 4 s')); }, 4000);
    ws.onopen = () => ws.send(wire);
    ws.onmessage = (m) => { clearTimeout(tm); let j = {}; try { j = JSON.parse(m.data); } catch (e) { j = {}; } end(); res(j); };
    ws.onerror = () => { clearTimeout(tm); rej(new Error('socket refused')); };
  });
  /* every packet: fresh UUID idempotency_key (never re-used: sender-side nonce cache), expires_at_ms = ts + 3 s,
     signed with the session key; a reply that echoes a different ack key is treated as a failure */
  const send = async (s, kind, body, mode) => {
    const chk = V160.checkUrl(s.url, U.st.allow); if (!chk.ok) throw new Error(chk.why);
    let key = V160.uuid(); while (U.used.has(key)) key = V160.uuid();
    U.used.add(key);
    const wire = await V160.envelope(def(s.id), kind, body, s.secret, U.session, ++U.seq, mode || U.st.mode, undefined, key), sig = V161.sigHex(wire);
    const fail = (e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { key, sig, wire });
    const t0 = performance.now(); let reply;
    try {
      if (chk.ws) reply = await wsSend(chk.href, wire);
      else {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
        try {
          const r = await fetch(chk.href, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'content-type': 'text/plain' }, body: wire, signal: ctl.signal });
          if (!r.ok) throw new Error('HTTP ' + r.status); reply = await r.json().catch(() => ({}));
        } catch (e) { throw new Error(e.name === 'AbortError' ? 'no reply in 4 s' : String(e.message || e)); } finally { clearTimeout(tm); }
      }
    } catch (e) { throw fail(e); }
    if (reply && reply.ok === false) throw fail(new Error('receiver rejected the envelope'));
    if (reply && reply.ack != null && reply.ack !== key) throw fail(new Error('ack does not match the idempotency key'));
    return { ms: Math.max(1, Math.round(performance.now() - t0)), key, sig, wire, acked: !!(reply && reply.ack === key), reply };
  };
  const heartbeat = async (s) => {
    try { const r = await send(s, 'heartbeat', { ping: 1 }); s.hb = { ok: true, ms: r.ms, t: Date.now(), why: '' }; U.fails[s.id] = 0; U.lastOk[s.id] = Date.now(); led('heartbeat', { slot: s.id, status: 'ok', key: r.key, sig: r.sig, detail: r.ms + ' ms' + (r.acked ? ' · acked' : '') }); for (const f of U.hbL) { try { f(s, s.hb); } catch (x) { /* listener */ } } }
    catch (e) {
      s.hb = { ok: false, ms: 0, t: Date.now(), why: String(e.message || e).slice(0, 120) }; U.fails[s.id] = (U.fails[s.id] || 0) + 1;
      led('heartbeat', { slot: s.id, status: 'missed ' + U.fails[s.id], key: e.key, sig: e.sig, detail: s.hb.why }); for (const f of U.hbL) { try { f(s, s.hb); } catch (x) { /* listener */ } }
      if (s.mode === 'live' && U.fails[s.id] >= V160.HB_FAILS) kill(`Dead-Man's Switch: ${V160.HB_FAILS} missed heartbeats on Slot ${s.id}`);
    }
    save(); paint(); return s.hb;
  };

  /* ══ fail-safe inputs ══ */
  const spreadOf = (sym) => {
    const L = typeof Feed !== 'undefined' && Feed.live && Feed.live[sym]; if (L && L.bid > 0 && L.ask > 0) return { bid: +L.bid, ask: +L.ask };
    const b = U.book[sym]; return b && Date.now() - b.t < 120000 ? b : {};
  };
  const closes = () => {
    const out = [], bot = (typeof ST !== 'undefined' && ST.bots || []).find((b) => String(b.id) === U.st.promote);
    for (const a of [typeof ACC !== 'undefined' ? ACC : null, bot && bot.account]) for (const t of (a && a.trades) || []) if (t.side === 'sell' && t.src !== 'backtest' && Number.isFinite(t.pnl)) out.push({ pnl: t.pnl, ts: +t.ts });
    return out;
  };
  const cooldownNow = () => {
    const r = V161.cooldown(U.fs, closes(), Date.now());
    if (JSON.stringify(r.fs) !== JSON.stringify(U.fs)) { U.fs = Object.assign(U.fs, r.fs); saveFs(); }
    if (r.tripped) { led('breaker', { status: 'cooldown', detail: `${r.streak} consecutive losses: live routing paused until ${new Date(r.until).toLocaleTimeString()}` }); note('block', `COOLDOWN · ${r.streak} losses in a row, live routing paused for ${U.fs.cooldown}`); }
    return r;
  };

  /* ══ routing: every paper fill passes through here (manual → slots 1–5, the promoted bot → slot 6) ══ */
  const block = (status, what, why) => { U.stats.blocked++; note('block', `BLOCKED · ${what}: ${why}`); toast('⛔ ' + esc(status === 'guard' ? 'Circuit breaker' : status === 'spread' ? 'Execution Shield' : status === 'cooldown' ? 'Tilt & Drawdown Guard' : 'Signal firewall') + ': ' + esc(why), 'dn'); led('breaker', { status, detail: `${what}: ${why}` }); };
  const route = (t, acct) => {
    if (!t || t.src === 'backtest' || typeof ACC === 'undefined') return;
    const man = acct === ACC || U.manual.includes(acct); // v16.3: the cockpit's reverse (short) book routes like a manual order
    const bot = man ? null : (ST.bots || []).find((b) => b.account === acct); if (!man && !bot) return;
    if (bot && String(bot.id) !== U.st.promote) return;
    const p = acct.pos && acct.pos[t.sym], n = (v) => (v == null || v === 0 ? null : Number.isFinite(v) ? +v.toPrecision(10) : v);
    const usd = Number.isFinite(+t.usd) ? +(+t.usd).toFixed(2) : +t.usd;
    const body = { action: t.side, symbol: baseOf(t.sym), usd, price: n(t.price), qty: n(t.qty), sl: p ? n(p.sl) : null, tp: p ? n(p.tp) : null, source: bot ? 'bot:' + bot.id : 'manual' };
    if (acct.short) body.side = 'short'; // v16.3: a short-side account opens with "buy"; its stop sits above entry
    const targets = U.st.slots.filter((s) => s.enabled && (bot ? s.id === 6 : s.id !== 6)); if (!targets.length) return;
    const what = `${String(body.action).toUpperCase()} ${body.symbol} $${body.usd}`;
    if (!live()) { U.stats.sim++; note('sim', `PAPER · ${what} simulated on ${targets.length} slot${targets.length > 1 ? 's' : ''}, nothing sent`); return; }
    if (!U.briefed) { U.stats.blocked++; note('block', `HELD · ${what}: acknowledge the live briefing first`); led('breaker', { status: 'held', detail: what + ': briefing not acknowledged' }); return; }
    const v = V161.validate(body, U.fs, { sl: U.requireSL !== false }); if (!v.ok) { block('schema', what, v.why); return; }
    /* v16.3 pre-route guards (mandatory stop-loss direction, depth, stale quote, rate, exposure, correlation, thin hours,
       drawdown throttle). A guard may block ({ ok: false }) or scale body.usd / body.qty down; it never touches a close. */
    for (const f of U.pre) { let r; try { r = f(body, t, acct); } catch (e) { r = { ok: false, status: 'guard', why: 'guard error: ' + String(e.message || e).slice(0, 80) }; } if (r && r.ok === false) { block(r.status || 'guard', what, r.why); return; } }
    if (body.action === 'buy') {
      const cd = cooldownNow(); if (cd.locked) { block('cooldown', what, `${cd.streak || U.fs.lossN} consecutive losses, cooldown until ${new Date(cd.until).toLocaleTimeString()}`); return; }
      const sp = spreadOf(t.sym), sg = V161.spreadGuard(sp.bid, sp.ask, U.fs.maxSpreadPct);
      if (!sg.ok) { block('spread', what, `spread ${sg.pct.toFixed(3)}% is above the ${U.fs.maxSpreadPct}% ceiling`); return; }
    }
    const open = Object.keys(acct.pos || {}).filter((k) => k !== t.sym && acct.pos[k].qty > 0).length;
    const riskUsd = body.sl && t.price ? (body.usd * Math.abs(t.price - body.sl)) / t.price : +body.usd;
    const g = V160.guard({ side: t.side, riskUsd }, U.st.caps, { dayLoss: dayLoss(), open, equity: equity(acct) });
    if (!g.ok) { block('guard', what, g.why); return; }
    for (const s of targets.filter((x) => x.mode === 'live')) send(s, 'signal', body).then((r) => { U.stats.sent++; note('sent', `LIVE · ${what} → Slot ${s.id} (${r.ms} ms)`); led('signal', { slot: s.id, status: r.acked ? 'sent · acked' : 'sent', key: r.key, sig: r.sig, detail: what }); for (const f of U.post) { try { f(s, body, r, t); } catch (x) { /* ack + fill listener */ } } }, (e) => { note('err', `FAILED · ${what} → Slot ${s.id}: ${e.message}`); led('signal', { slot: s.id, status: 'failed', key: e.key, sig: e.sig, detail: `${what}: ${e.message}` }); });
  };
  const wireTrades = () => {
    if (typeof NT === 'undefined' || (NT.onTrade && NT.onTrade._v160)) return;
    const o = NT.onTrade; NT.onTrade = function (t, a) { if (o) o.apply(this, arguments); try { route(t, a); } catch (e) { console.warn('v160 route', e); } }; NT.onTrade._v160 = true;
  };

  /* ══ arm / kill ══ */
  const arm = () => {
    const n = V160.arm(U.st, U.phrase, Date.now(), equity()); if (!n) { toast('All four gates must pass before live routing can be armed', 'amb'); return; }
    U.st = n; U.phrase = ''; U.briefed = true; rotate(); const ls = V160.liveSlots(U.st); for (const s of ls) U.lastOk[s.id] = Date.now(); save(); render();
    note('arm', `ARMED · live routing on ${ls.map((s) => 'Slot ' + s.id).join(', ')}`); led('arm', { status: 'live', detail: 'armed on ' + ls.map((s) => 'Slot ' + s.id).join(', ') + '; session signing key rotated' });
    toast('🔴 Live external routing armed. Ctrl+Shift+K flattens and disarms instantly.', 'dn');
  };
  /* kill-switch / Flatten All & Disarm: broadcast a signed CANCEL_ALL_AND_FLATTEN to every armed slot (packets are built
     with mode "live" before the switch flips), then lock all six slots back to PAPER at once */
  const kill = (why) => {
    const was = live(), armed = V160.liveSlots(U.st), reason = why || 'kill-switch';
    if (was) for (const s of armed) send(s, 'flatten', { action: 'CANCEL_ALL_AND_FLATTEN', reason }, 'live').then((r) => led('kill', { slot: s.id, status: r.acked ? 'flatten sent · acked' : 'flatten sent', key: r.key, sig: r.sig, detail: reason }), (e) => led('kill', { slot: s.id, status: 'flatten failed', key: e.key, sig: e.sig, detail: `${reason}: ${e.message}` }));
    U.st = V160.kill(U.st); U.phrase = ''; U.briefed = true; U.stats.kills++; save(); closeBrief(); render();
    note('kill', `PAPER · ${reason}; all six slots reverted to PAPER`); led('kill', { status: 'paper', detail: `${reason}; all six slots locked to PAPER` });
    if (was) toast('🛑 Flatten All &amp; Disarm (' + esc(reason) + '). CANCEL_ALL_AND_FLATTEN sent; all six slots are PAPER.', 'acc');
  };

  /* ══ Test Signal Payload (Dry-Run): shows the exact signed JSON and checks the receiver's acknowledgment; never an order ══ */
  const dryRun = async (s) => {
    const sym = typeof ST !== 'undefined' && ST.sel ? ST.sel : 'BTC-USD', p0 = (typeof px === 'function' && px(sym)) || 100, r6 = (v) => +(+v).toPrecision(8);
    const body = { action: 'buy', symbol: baseOf(sym), usd: 100, price: r6(p0), qty: r6(100 / p0), sl: r6(p0 * 0.98), tp: r6(p0 * 1.04), source: 'manual', dry_run: true };
    const v = V161.validate(body, U.fs); let res, wire = '';
    try { const r = await send(s, 'dryrun', body); wire = r.wire; res = { ok: true, txt: r.acked ? `Acknowledged in ${r.ms} ms: the reply echoed this idempotency_key.` : `Receiver replied OK in ${r.ms} ms (no ack field: add "ack": idempotency_key to your reply).` }; led('dryrun', { slot: s.id, status: r.acked ? 'acked' : 'ok', key: r.key, sig: r.sig, detail: 'dry-run ' + body.symbol }); }
    catch (e) { wire = e.wire || await V160.envelope(def(s.id), 'dryrun', body, s.secret, U.session, U.seq, U.st.mode); res = { ok: false, txt: (e.wire ? 'No acknowledgment: ' : 'Not sent: ') + String(e.message || e) }; led('dryrun', { slot: s.id, status: 'failed', key: e.key, sig: e.sig, detail: String(e.message || e) }); }
    let pretty = wire; try { const w = JSON.parse(wire); pretty = JSON.stringify({ payload: JSON.parse(w.payload), sig: w.sig }, null, 2); } catch (e) { /* raw */ }
    const html = `<p class="note">Slot ${s.id} · ${esc(def(s.id).name)} · <b>dry_run: true</b>, kind <code>dryrun</code>: a receiver must never execute it.</p>
      <div class="v161-dr ${res.ok ? 'ok' : 'bad'}" data-v161dr>${esc(res.txt)}</div><div class="note">Schema &amp; fat-finger firewall: ${v.ok ? 'pass' : esc(v.why)}</div>
      <pre class="v161-pre mono" aria-label="Signed JSON payload">${esc(pretty)}</pre>`;
    if (typeof p2modal === 'function') p2modal('Test Signal Payload (Dry-Run)', html, 'v161Dry');
    return Object.assign({ wire }, res);
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
      <div class="v160-caps"><span>Max Daily Loss <b>$${esc((+c.maxLoss).toLocaleString('en-US'))}</b></span><span>Max Trade Risk <b>${esc(+c.riskPct)}%</b></span><span>Max Concurrent Positions <b>${esc(+c.maxPos)}</b></span><span>Max Single-Order Notional <b>$${esc((+U.fs.maxNotional).toLocaleString('en-US'))}</b></span></div>
      <p class="v160-legal">Nothing in ExTerm is investment advice. You alone decide, and are solely responsible for, every order your own local bot places with your own accounts. ExTerm holds no funds and no keys and runs no servers.</p>
      <div class="v160-acts"><button type="button" class="btn pri" data-v160="briefAck">Acknowledge &amp; Continue Live</button><button type="button" class="btn v160-danger" data-v160="revert">Disconnect &amp; Revert to Paper</button></div>
      <p class="note">Ctrl+Shift+K flattens and disarms live routing at any time.</p></div>`;
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
      <div class="v160-row"><button type="button" class="btn xs v161-dry" data-v160="dry" data-id="${s.id}" title="Sends a signed dry_run packet and checks the receiver's acknowledgment. Never an order.">Test Signal Payload (Dry-Run)</button></div>
      <div class="v160-row v160-sec"><span>HMAC secret</span><code data-v160sec="${s.id}">${esc(s.secret.slice(0, 8))}…</code><button type="button" class="btn xs" data-v160="copy" data-id="${s.id}">Copy</button><button type="button" class="btn xs v160-cfg" data-v160="regen" data-id="${s.id}">New</button></div>
      ${s.id === 6 ? `<label class="v160-url"><span>Promoted bot (Quant Lab / Shadow)</span><select class="v160-cfg" data-v160f="promote"><option value="">None</option>${(typeof ST !== 'undefined' && ST.bots || []).map((b) => `<option value="${esc(b.id)}"${String(b.id) === U.st.promote ? ' selected' : ''}>${esc(b.name || b.id)}</option>`).join('')}</select></label>` : ''}
      <details class="v160-schema"><summary>Receiver schema &amp; sample</summary><pre>${esc(V160.schema(d))}</pre><pre>${esc(V160.sampleReceiver(d, ''))}</pre>${d.tx === 'ws' ? '<p class="note">For this socket slot, run the same signature, TTL, idempotency and sequence checks in any WebSocket server and reply with one JSON frame.</p>' : ''}</details></div>`;
  };
  const fsHTML = () => {
    const f = U.fs, sel = (v) => (f.cooldown === v ? ' selected' : '');
    return `<div class="v161-fs" id="v161Fs"><h3>🛡 8 Fail-Safe Engines</h3>
      <ul class="v161-eng">
        <li><b>Idempotency Shield</b><span>UUID idempotency_key + ${V160.TTL_MS / 1000} s expires_at_ms on every packet</span></li>
        <li><b>Ephemeral Session Key</b><span data-v161="sess"></span></li>
        <li><b>Signal Firewall</b><span>schema check, stop-loss required, Max Single-Order Notional cap</span></li>
        <li><b>Dead-Man's Switch</b><span>${V160.HB_FAILS} missed heartbeats → PAPER</span></li>
        <li><b>Execution Shield</b><span>holds new orders above the spread ceiling</span></li>
        <li><b>Tilt &amp; Drawdown Guard</b><span data-v161="cd"></span></li>
        <li><b>Flatten All &amp; Disarm</b><span>Ctrl+Shift+K · signed CANCEL_ALL_AND_FLATTEN</span></li>
        <li><b>Signed Receipt Ledger</b><span data-v161="lc"></span></li>
      </ul>
      <div class="v160-capsin v161-capsin">
        <label><span>Max Single-Order Notional $</span><input type="number" min="1" step="1" class="v160-cfg" data-v160f="fs.maxNotional" value="${esc(f.maxNotional)}" inputmode="decimal"></label>
        <label><span>Max Spread %</span><input type="number" min="0.001" max="50" step="0.01" class="v160-cfg" data-v160f="fs.maxSpreadPct" value="${esc(f.maxSpreadPct)}" inputmode="decimal"></label>
        <label><span>Consecutive losses</span><input type="number" min="1" max="50" step="1" class="v160-cfg" data-v160f="fs.lossN" value="${esc(f.lossN)}" inputmode="numeric"></label>
        <label><span>Cooldown</span><select class="v160-cfg" data-v160f="fs.cooldown"><option value="15m"${sel('15m')}>15m</option><option value="1h"${sel('1h')}>1h</option><option value="24h"${sel('24h')}>24h</option></select></label>
      </div>
      <div class="v160-row"><button type="button" class="btn v160-danger" data-v160="flatten">Flatten All &amp; Disarm</button><span class="sp"></span><button type="button" class="btn xs" data-v160="ledJson">Export ledger JSON</button><button type="button" class="btn xs" data-v160="ledCsv">Export ledger CSV</button></div>
      <h3>Signed receipt ledger</h3><div class="v161-ledwrap"><table class="v161-led"><thead><tr><th>Time</th><th>Event</th><th>Slot</th><th>Status</th><th>idempotency_key</th><th>HMAC-SHA256</th><th>Detail</th></tr></thead><tbody id="v161Led"></tbody></table></div></div>`;
  };
  const panelHTML = () => {
    const c = U.st.caps;
    return `<div class="ph"><span>⚡ Execution Bridge · 6 Local Bot Adapters</span><span class="sp"></span><span class="v160-badge" data-v160m>PAPER / SIMULATION</span></div>
    <div class="pb">
      <p class="note">Signals go only to processes you run on <b>127.0.0.1 / localhost</b> (or a private-LAN host:port you allow-list over TLS), signed with an ephemeral per-session HMAC-SHA256 key, a unique idempotency_key and a 3 s expiry. No central servers, no telemetry, no custody. Every fresh install starts in PAPER.</p>
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
        <div class="v160-row"><button type="button" class="btn pri" data-v160="arm" disabled>Enable Live External Execution</button><button type="button" class="btn v160-danger" data-v160="revert">Disconnect &amp; Revert to Paper</button><span class="note">Ctrl+Shift+K = Flatten All &amp; Disarm</span></div>
      </div>
      ${fsHTML()}
      <h3>Signal log</h3><ul class="v160-log" id="v160Log"></ul>
    </div>`;
  };
  let panel = null, card = null;
  const render = () => { if (panel) { panel.innerHTML = panelHTML(); paintLog(); paintLedger(); } paint(); };
  const paintLog = () => { const l = panel && $1('#v160Log', panel); if (l) l.innerHTML = U.log.length ? U.log.map((x) => `<li class="k-${esc(x.kind)}"><time>${esc(new Date(x.t).toLocaleTimeString())}</time> ${esc(x.msg)}</li>`).join('') : '<li class="note">No signals yet. Paper fills appear here as simulated routes.</li>'; };
  const paintLedger = () => {
    const tb = panel && $1('#v161Led', panel); if (!tb) return;
    tb.innerHTML = U.ledger.length ? U.ledger.slice(0, 40).map((r) => `<tr class="k-${esc(r.kind)}"><td class="num">${esc(new Date(r.ts).toLocaleTimeString())}</td><td>${esc(r.kind)}</td><td class="num">${r.slot == null ? '–' : esc(r.slot)}</td><td>${esc(r.status)}</td><td class="mono" title="${esc(r.idempotency_key)}">${esc(r.idempotency_key ? r.idempotency_key.slice(0, 8) + '…' : '–')}</td><td class="mono" title="${esc(r.sig)}">${esc(r.sig ? r.sig.slice(0, 10) + '…' : '–')}</td><td>${esc(r.detail)}</td></tr>`).join('') : '<tr><td colspan="7" class="note">No receipts yet: heartbeats, signals, breaker trips and kill-switch events are recorded here.</td></tr>';
    const lc = $1('[data-v161="lc"]', panel); if (lc) lc.textContent = `${U.ledger.length} receipt${U.ledger.length === 1 ? '' : 's'} · JSON / CSV export`;
  };
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
    const ss = $1('[data-v161="sess"]', panel); if (ss) ss.textContent = `rotated ${new Date(U.sessAt).toLocaleTimeString()} · session ${U.session.slice(0, 6)}… · ${U.used.size} nonces cached`;
    const cd = $1('[data-v161="cd"]', panel); if (cd) { const f = U.fs, lk = f.lockUntil && now < f.lockUntil; cd.textContent = lk ? `LOCKED until ${new Date(f.lockUntil).toLocaleTimeString()}` : `${f.lossN} losses in a row → ${f.cooldown} pause`; cd.classList.toggle('dn', !!lk); }
  };

  /* ══ events (delegated; no inline handlers) ══ */
  function onClick(ev) {
    const b = ev.target.closest('[data-v160]'); if (!b) return; const a = b.dataset.v160, s = b.dataset.id ? U.st.slots.find((x) => x.id === +b.dataset.id) : null;
    if (a === 'hb' && s) { const h = panel && $1(`[data-v160hb="${s.id}"]`, panel); if (h) h.textContent = 'checking…'; heartbeat(s); }
    else if (a === 'dry' && s) dryRun(s);
    else if (a === 'copy' && s) { try { navigator.clipboard.writeText(s.secret).then(() => toast('Slot ' + s.id + ' secret copied: paste it into your local receiver', 'acc'), () => toast('Clipboard blocked: select the secret manually', 'amb')); } catch (e) { toast('Clipboard unavailable', 'amb'); } }
    else if (a === 'regen' && s && !live()) { s.secret = V160.rand(32); s.hb = null; save(); render(); toast('New secret for Slot ' + s.id + ': update your receiver', 'acc'); }
    else if (a === 'arm') arm();
    else if (a === 'revert') kill('disconnected by you');
    else if (a === 'flatten') kill('Flatten All & Disarm');
    else if (a === 'ledJson' || a === 'ledCsv') exportLedger(a === 'ledCsv' ? 'csv' : 'json');
    else if (a === 'briefAck') { U.briefed = true; closeBrief(); note('arm', 'ACKNOWLEDGED · live briefing accepted, routing resumed'); led('arm', { status: 'acknowledged', detail: 'boot briefing accepted' }); paint(); }
    else if (a === 'open') openPanel();
  }
  const exportLedger = (fmt) => {
    const name = 'exterm-signal-ledger-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + fmt;
    const txt = fmt === 'csv' ? V161.toCSV(U.ledger) : V161.toJSON(U.ledger);
    const okd = typeof download === 'function' && download(name, txt, fmt === 'csv' ? 'text/csv' : 'application/json');
    toast(okd ? `⬇ ${U.ledger.length} receipts exported (${fmt.toUpperCase()})` : 'Downloads are blocked here', okd ? 'acc' : 'amb'); return txt;
  };
  const onField = (ev) => {
    const f = ev.target.closest('[data-v160f]'); if (!f || (live() && f.dataset.v160f !== 'phrase')) return; const k = f.dataset.v160f, s = f.dataset.id ? U.st.slots.find((x) => x.id === +f.dataset.id) : null;
    if (k.startsWith('fs.')) { U.fs = V161.loadFs(Object.assign({}, U.fs, { [k.slice(3)]: f.value })); saveFs(); paint(); return; }
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
    if (top && !$1('#v160Pill')) { const p = document.createElement('button'); p.type = 'button'; p.id = 'v160Pill'; p.className = 'pill v160-pill'; p.hidden = true; p.title = 'Live external routing is armed. Click to review, Ctrl+Shift+K to flatten and disarm.'; p.innerHTML = '<i class="dot"></i>LIVE BOT ARMED'; p.addEventListener('click', openPanel); if (src && src.parentNode) src.parentNode.insertBefore(p, src); else top.appendChild(p); }
    paint();
  };
  /* best bid / ask from the provider's order book, for the spread circuit breaker (Feed.live bid / ask wins when present) */
  const wrapBook = () => {
    const P = typeof Providers !== 'undefined' && Providers.active; if (!P || typeof P.book !== 'function' || P.book._v161) return;
    const f = P.book; P.book = async function (s) { const bk = await f.apply(this, arguments); try { if (bk && bk.bids && bk.bids[0] && bk.asks && bk.asks[0]) U.book[s] = { bid: +bk.bids[0][0], ask: +bk.asks[0][0], t: Date.now() }; } catch (e) { /* malformed book */ } return bk; }; P.book._v161 = true;
  };
  /* Dead-Man's Switch watchdog: catches a stalled heartbeat loop (throttled timers, hung transport) as well as failures */
  const watchdog = () => {
    if (!live()) return; const now = Date.now(), lim = V160.HB_FAILS * HB_EVERY + 10000;
    for (const s of V160.liveSlots(U.st)) { const t = U.lastOk[s.id] || 0; if (now - t > lim) { kill(`Dead-Man's Switch: no heartbeat from Slot ${s.id} for ${Math.round((now - t) / 1000)} s`); return; } }
  };
  U.start = () => {
    rotate(); U.used = new V160.NonceCache(20000, 24 * 3600000); load(); document.body.classList.add('v160');
    for (const s of V160.liveSlots(U.st)) U.lastOk[s.id] = Date.now(); // grace period from boot; the briefing heartbeats immediately
    window.addEventListener('keydown', onKey, true);
    wireTrades(); wrapBook(); mount(); if (live()) brief();
    setInterval(() => { wireTrades(); wrapBook(); mount(); cooldownNow(); }, 5000);
    setInterval(() => { for (const s of V160.liveSlots(U.st)) heartbeat(s); }, HB_EVERY);
    setInterval(watchdog, 5000);
  };
  Object.assign(U, { arm, kill, brief, heartbeat, route, mount, openPanel, dryRun, exportLedger, watchdog, cooldownNow, spreadOf, send, rotate, dayLoss, live, led });
  return U;
})();
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof boot === 'function') { const _b160 = boot; boot = async function () { await _b160.apply(this, arguments); try { V160UI.start(); } catch (e) { console.warn('v160 init', e); } }; }
