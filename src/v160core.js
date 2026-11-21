/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* ExTerm v16.0 core (pure, Node-testable): six local external bot adapter slots, the loopback / private-LAN endpoint
   check (SSRF guard), HMAC-SHA256 signed envelopes with a per-session nonce + sequence number, the four live-unlock gates,
   hard circuit breakers and the kill-switch state transition. Every fresh install starts in PAPER. Nothing here talks to
   the network; the UI (v160.js) sends signed envelopes only to endpoints that pass V160.checkUrl. */
const V160 = (() => {
  const V = {};
  V.PHRASE = 'ARM LIVE BOT';
  V.HB_TTL = 120000;   // a heartbeat older than 2 minutes no longer satisfies Gate 1
  V.HB_FAILS = 3;      // consecutive failed heartbeats on an armed slot → automatic revert to PAPER
  V.MAX_SKEW = 30000;  // receivers should drop envelopes older than this (documented in the schema)
  V.SLOTS = [
    { id: 1, key: 'runner', name: 'Local Python / Node Script Runner', tx: 'http', url: 'http://127.0.0.1:8765/signal', note: 'Your own Python or Node script listening on 127.0.0.1 (HTTP).' },
    { id: 2, key: 'webhook', name: 'Standard JSON Webhook Relay', tx: 'http', url: 'http://127.0.0.1:8766/hook', note: 'A local /hook JSON relay that forwards signals to your own tooling.' },
    { id: 3, key: 'socket', name: 'Low-Latency Socket / IPC Bridge', tx: 'ws', url: 'ws://127.0.0.1:8767/exec', note: 'A local WebSocket execution bridge (one frame per signal, one reply per frame).' },
    { id: 4, key: 'signer', name: 'Perp DEX Local Wallet Signer', tx: 'http', url: 'http://127.0.0.1:8768/sign', note: 'A signer process you host; keys stay in that process, never in ExTerm.' },
    { id: 5, key: 'gateway', name: 'Equities / Futures Local Gateway', tx: 'http', url: 'http://127.0.0.1:8769/order', note: 'A broker gateway you run locally; ExTerm only sends signed intents.' },
    { id: 6, key: 'mirror', name: 'Graduated Shadow-to-Live Mirror', tx: 'http', url: 'http://127.0.0.1:8770/mirror', note: 'Mirrors fills of one promoted Quant Lab / Shadow bot; manual orders never go here.' },
  ];
  const fin = Number.isFinite;
  const LOOP = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const DEF_PORT = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' };
  V.privIP = (h) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); if (!m || m.slice(1).some((x) => +x > 255)) return false; const a = +m[1], b = +m[2]; return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168); };
  /* user allowlist: comma / space separated "a.b.c.d:port" entries; only private LAN addresses are ever accepted */
  V.parseAllow = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(x) && V.privIP(x.split(':')[0]) && +x.split(':')[1] > 0 && +x.split(':')[1] < 65536);
  /* SSRF guard: loopback always; a private LAN host only when its exact host:port is allow-listed. No credentials, no other schemes. */
  V.checkUrl = (raw, allow) => {
    let u; try { u = new URL(String(raw == null ? '' : raw).trim()); } catch (e) { return { ok: false, why: 'Not a valid URL' }; }
    if (!DEF_PORT[u.protocol]) return { ok: false, why: 'Only http://, https://, ws:// or wss:// endpoints' };
    if (u.username || u.password) return { ok: false, why: 'Credentials inside the URL are not allowed' };
    const h = u.hostname.toLowerCase();
    if (LOOP.has(h)) return { ok: true, kind: 'loopback', href: u.href, ws: u.protocol === 'ws:' || u.protocol === 'wss:' };
    const hp = h + ':' + (u.port || DEF_PORT[u.protocol]);
    if (V.privIP(h) && V.parseAllow(Array.isArray(allow) ? allow.join(',') : allow).includes(hp)) {
      if (u.protocol === 'http:' || u.protocol === 'ws:') return { ok: false, why: 'Allow-listed LAN endpoints must use https:// or wss://' }; // the page CSP only permits plain http/ws on loopback
      return { ok: true, kind: 'lan', href: u.href, ws: u.protocol === 'wss:' };
    }
    return { ok: false, why: 'Only 127.0.0.1 / localhost, or a private-LAN host:port you allow-listed' };
  };

  /* ── crypto: HMAC-SHA256 over the exact payload string (WebCrypto in the browser and in Node ≥ 18) ── */
  const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle) || null;
  V.hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  V.unhex = (h) => { const s = String(h || ''); if (!/^([0-9a-f]{2})+$/i.test(s)) throw new Error('bad hex'); const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; };
  V.rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return V.hex(a); };
  V.hmac = async (secretHex, msg) => {
    const s = subtle(); if (!s) throw new Error('WebCrypto unavailable');
    const k = await s.importKey('raw', V.unhex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return V.hex(await s.sign('HMAC', k, new TextEncoder().encode(msg)));
  };
  /* v16.1: every packet carries a unique idempotency_key and expires_at_ms (TTL_MS after ts), and is signed with an
     ephemeral per-session key = HMAC-SHA256(slot secret, "ExTerm-session-v2|" + session). A fresh session nonce is drawn
     on every boot and on every arm, so the signing key rotates without re-pairing the receiver. */
  V.TTL_MS = 3000;
  V.KDF = 'session-v2';
  V.uuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = V.hex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  V.sessionKey = (secret, session) => V.hmac(secret, 'ExTerm-session-v2|' + String(session));
  /* wire format (a "simple" text/plain POST, so no CORS preflight): {"payload":"<json string>","sig":"sha256=<hex>"} */
  V.envelope = async (slot, kind, body, secret, session, seq, mode, now, key) => {
    const ts = now == null ? Date.now() : now;
    const payload = JSON.stringify({ v: 2, app: 'ExTerm', kind, slot: slot.id, adapter: slot.key, mode, ts, expires_at_ms: ts + V.TTL_MS, idempotency_key: key || V.uuid(), kdf: V.KDF, session, seq, body: body || {} });
    return JSON.stringify({ payload, sig: 'sha256=' + (await V.hmac(await V.sessionKey(secret, session), payload)) });
  };
  /* receiver-side verification (also what the tests use): signature, freshness, TTL, idempotency nonce, rising seq per session.
     `nonces` (optional) is a V.NonceCache: a key that was already accepted is rejected as a replay. */
  V.verify = async (wire, secret, last, now, nonces) => {
    let w, p; try { w = JSON.parse(wire); p = JSON.parse(w.payload); } catch (e) { return { ok: false, why: 'malformed' }; }
    if (!p || typeof p !== 'object') return { ok: false, why: 'malformed' };
    const want = 'sha256=' + (await V.hmac(p.kdf === V.KDF ? await V.sessionKey(secret, p.session) : secret, w.payload));
    if (typeof w.sig !== 'string' || w.sig.length !== want.length) return { ok: false, why: 'bad signature' };
    let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ w.sig.charCodeAt(i); if (d) return { ok: false, why: 'bad signature' };
    const t = now == null ? Date.now() : now;
    if (Math.abs(t - p.ts) > V.MAX_SKEW) return { ok: false, why: 'stale' };
    if (p.expires_at_ms != null && !(t <= +p.expires_at_ms)) return { ok: false, why: 'expired' };
    if (nonces && p.idempotency_key != null) { if (nonces.has(p.idempotency_key, t)) return { ok: false, why: 'replay' }; }
    if (last && last.session === p.session && !(p.seq > last.seq)) return { ok: false, why: 'replay' };
    if (nonces && p.idempotency_key != null) nonces.add(p.idempotency_key, t);
    return { ok: true, p };
  };
  /* rolling anti-replay cache: remembers keys for `ttl` ms (default 10 min), at most `max` entries (oldest evicted first) */
  V.NonceCache = class {
    constructor(max = 5000, ttl = 600000) { this.max = max; this.ttl = ttl; this.m = new Map(); }
    prune(now) { for (const [k, t] of this.m) { if (now - t <= this.ttl && this.m.size <= this.max) break; this.m.delete(k); } }
    has(k, now = Date.now()) { this.prune(now); return this.m.has(String(k)); }
    add(k, now = Date.now()) { this.m.delete(String(k)); this.m.set(String(k), now); this.prune(now); return this; }
    get size() { return this.m.size; }
  };

  /* ── state ── */
  V.defaults = () => ({ v: 1, mode: 'paper', armedAt: 0, ack: false, allow: '', promote: '', caps: { maxLoss: '', riskPct: '', maxPos: '' }, day: null,
    slots: V.SLOTS.map((s) => ({ id: s.id, enabled: false, url: s.url, secret: '', mode: 'paper', hb: null })) });
  V.capsOk = (c) => { c = c || {}; const L = +c.maxLoss, R = +c.riskPct, P = +c.maxPos; return c.maxLoss !== '' && c.riskPct !== '' && c.maxPos !== '' && fin(L) && L > 0 && L <= 1e9 && fin(R) && R > 0 && R <= 100 && Number.isInteger(P) && P >= 1 && P <= 100; };
  /* load + sanitise persisted state: anything inconsistent falls back to PAPER (never the other way round) */
  V.load = (raw) => {
    const d = V.defaults(); let o = null; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return d;
    const st = Object.assign(d, { ack: o.ack === true, allow: String(o.allow || '').slice(0, 400), promote: String(o.promote || '').slice(0, 80), armedAt: +o.armedAt || 0, day: o.day && typeof o.day === 'object' ? { d: String(o.day.d || ''), eq0: +o.day.eq0 || 0 } : null });
    if (o.caps && typeof o.caps === 'object') for (const k of ['maxLoss', 'riskPct', 'maxPos']) st.caps[k] = o.caps[k] === '' || o.caps[k] == null ? '' : +o.caps[k];
    if (Array.isArray(o.slots)) for (const s of st.slots) { const x = o.slots.find((y) => y && y.id === s.id); if (!x) continue; s.enabled = x.enabled === true; if (typeof x.url === 'string') s.url = x.url.slice(0, 300); if (/^[0-9a-f]{64}$/.test(x.secret || '')) s.secret = x.secret; s.mode = x.mode === 'live' ? 'live' : 'paper'; s.hb = x.hb && typeof x.hb === 'object' ? { ok: x.hb.ok === true, ms: +x.hb.ms || 0, t: +x.hb.t || 0, why: String(x.hb.why || '').slice(0, 120) } : null; }
    const liveSlots = st.slots.filter((s) => s.mode === 'live' && s.enabled && V.checkUrl(s.url, st.allow).ok && s.secret);
    if (o.mode === 'live' && st.armedAt && st.ack && V.capsOk(st.caps) && liveSlots.length) st.mode = 'live';
    else { st.mode = 'paper'; st.armedAt = 0; for (const s of st.slots) s.mode = 'paper'; }
    return st;
  };
  V.healthy = (s, now) => !!(s && s.enabled && s.hb && s.hb.ok && now - s.hb.t < V.HB_TTL);
  /* the four gates; Live External Execution stays disabled until every one is true */
  V.gates = (st, phrase, now) => [
    { id: 1, ok: st.slots.some((s) => V.healthy(s, now)), label: 'Active local adapter heartbeat (127.0.0.1)' },
    { id: 2, ok: V.capsOk(st.caps), label: 'Hard circuit breakers set (Max Daily Loss $, Max Risk / Trade %, Max Concurrent Positions)' },
    { id: 3, ok: st.ack === true, label: 'Non-advisory & sole-responsibility disclosure accepted' },
    { id: 4, ok: phrase === V.PHRASE, label: 'Typed the exact phrase ' + V.PHRASE },
  ];
  V.canArm = (st, phrase, now) => V.gates(st, phrase, now).every((g) => g.ok);
  /* arm: only healthy enabled slots go live; returns a new state or null when a gate fails */
  V.arm = (st, phrase, now, eq0) => {
    if (!V.canArm(st, phrase, now)) return null;
    const n = JSON.parse(JSON.stringify(st)); n.mode = 'live'; n.armedAt = now; n.day = { d: new Date(now).toISOString().slice(0, 10), eq0: fin(eq0) ? eq0 : 0 };
    for (const s of n.slots) s.mode = V.healthy(s, now) ? 'live' : 'paper';
    return n;
  };
  /* kill-switch / disconnect: back to PAPER on all six slots, disclosure must be re-accepted */
  V.kill = (st) => { const n = JSON.parse(JSON.stringify(st)); n.mode = 'paper'; n.armedAt = 0; n.ack = false; for (const s of n.slots) s.mode = 'paper'; return n; };
  V.liveSlots = (st) => (st.mode === 'live' ? st.slots.filter((s) => s.mode === 'live') : []);
  /* circuit breakers for an opening order; closes always pass (they only reduce exposure) */
  V.guard = (o, caps, ctx) => {
    if (o.side === 'sell' || o.reduce) return { ok: true };
    if (!V.capsOk(caps)) return { ok: false, why: 'circuit breakers not set' };
    if (ctx.dayLoss >= +caps.maxLoss) return { ok: false, why: `daily loss $${ctx.dayLoss.toFixed(2)} reached the $${(+caps.maxLoss).toFixed(2)} cap` };
    if (ctx.open >= +caps.maxPos) return { ok: false, why: `${ctx.open} open positions (cap ${+caps.maxPos})` };
    const risk = ctx.equity > 0 ? (o.riskUsd / ctx.equity) * 100 : Infinity;
    if (!(risk <= +caps.riskPct)) return { ok: false, why: `risk ${fin(risk) ? risk.toFixed(2) : '∞'}% of equity is above the ${+caps.riskPct}% cap` };
    return { ok: true, risk };
  };
  /* sample receiver contract shown in the UI next to each slot */
  V.schema = (slot) => JSON.stringify({ transport: slot.tx === 'ws' ? 'WebSocket text frame, reply with one JSON frame' : 'HTTP POST, Content-Type text/plain, reply 2xx JSON + Access-Control-Allow-Origin', wire: { payload: '<JSON string below>', sig: 'sha256=<hex HMAC-SHA256(session key, payload)>, session key = HMAC-SHA256(slot secret, "ExTerm-session-v2|" + session)' }, payload: { v: 2, app: 'ExTerm', kind: 'heartbeat | signal | dryrun | flatten | disarm', slot: slot.id, adapter: slot.key, mode: 'paper | live', ts: 'epoch ms (drop if older than 30 s)', expires_at_ms: 'ts + 3000 (drop after this)', idempotency_key: 'UUID v4 (drop any key you already saw)', kdf: 'session-v2', session: 'per-session nonce (rotates every boot and every arm)', seq: 'rises by 1 per envelope (drop repeats)', body: { action: 'buy | sell | CANCEL_ALL_AND_FLATTEN', symbol: 'BTC', usd: 250, price: 64000, qty: 0.0039, sl: 62000, tp: 68000, source: 'manual | bot:<id>', dry_run: 'true on Test Signal Payload (never execute)' } }, reply: { ok: true, ack: '<idempotency_key>' } }, null, 2);
  V.sampleReceiver = (slot, secret) => {
    const u = new URL(slot.tx === 'ws' ? slot.url.replace(/^ws/, 'http') : slot.url);
    return `# exterm_receiver.py: minimal local receiver for slot ${slot.id} (Python stdlib, HTTP)\nimport hmac, hashlib, json, time\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\nSECRET = bytes.fromhex("${secret || '<copy the slot secret>'}")\nlast, seen = {}, {}\ndef skey(session): return hmac.new(SECRET, ("ExTerm-session-v2|" + session).encode(), hashlib.sha256).hexdigest().encode()\nclass H(BaseHTTPRequestHandler):\n    def do_POST(self):\n        w = json.loads(self.rfile.read(int(self.headers["Content-Length"])))\n        p = json.loads(w["payload"]); now = time.time() * 1000\n        key = bytes.fromhex(skey(p["session"]).decode())\n        good = hmac.compare_digest(w["sig"], "sha256=" + hmac.new(key, w["payload"].encode(), hashlib.sha256).hexdigest())\n        good = good and abs(now - p["ts"]) < 30000 and now <= p["expires_at_ms"] and p["idempotency_key"] not in seen and p["seq"] > last.get(p["session"], 0)\n        if good:\n            last[p["session"]] = p["seq"]; seen[p["idempotency_key"]] = now  # act on p["body"] here (paper first; never when body.dry_run)\n        self.send_response(200 if good else 401); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()\n        self.wfile.write(json.dumps({"ok": good, "ack": p["idempotency_key"] if good else None}).encode())\nHTTPServer(("127.0.0.1", ${+u.port || 80}), H).serve_forever()\n`;
  };
  return V;
})();
if (typeof module === 'object' && module.exports) module.exports = V160;
