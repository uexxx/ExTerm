// ExTerm v16.0 core unit tests: six original adapter slots, SSRF guard (loopback + TLS-only private-LAN allowlist), HMAC-SHA256
// envelopes (receiver verification, tamper / stale / replay rejection), the four live gates, arm / kill transitions, state
// sanitising (fresh install = PAPER, inconsistent saved state never loads as live), circuit breakers; static CSP / privacy checks.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const V = require('../src/v160core.js');
(async () => {
  // ── slots
  ok('slots: exactly six original adapter slots with loopback defaults', V.SLOTS.length === 6 && V.SLOTS.every((s, i) => s.id === i + 1 && V.checkUrl(s.url).ok && V.checkUrl(s.url).kind === 'loopback'));
  ok('slots: names are the ExTerm originals', ['Local Python / Node Script Runner', 'Standard JSON Webhook Relay', 'Low-Latency Socket / IPC Bridge', 'Perp DEX Local Wallet Signer', 'Equities / Futures Local Gateway', 'Graduated Shadow-to-Live Mirror'].every((n, i) => V.SLOTS[i].name === n));
  ok('slots: slot 3 is a WebSocket bridge, the rest HTTP', V.SLOTS.filter((s) => s.tx === 'ws').map((s) => s.id).join() === '3' && V.checkUrl(V.SLOTS[2].url).ws === true);

  // ── SSRF guard
  const good = ['http://127.0.0.1:8765/signal', 'http://localhost:9000/', 'ws://127.0.0.1:8767/exec', 'http://[::1]:8080/', 'http://2130706433:80/'];
  const bad = ['http://example.com/hook', 'http://127.0.0.1.nip.io/', 'http://localhost.evil.com/', 'http://10.0.0.5:8080/', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'javascript:alert(1)', 'http://user:pw@127.0.0.1:1/', 'ftp://127.0.0.1/', 'http://0.0.0.0:8765/', '', null, 'http://8.8.8.8:443/'];
  ok('ssrf: loopback endpoints pass (incl. normalised numeric forms)', good.every((u) => V.checkUrl(u).ok), good.filter((u) => !V.checkUrl(u).ok));
  ok('ssrf: public hosts, look-alike names, metadata IPs, credentials and other schemes are refused', bad.every((u) => !V.checkUrl(u).ok), bad.filter((u) => V.checkUrl(u).ok));
  ok('ssrf: a private-LAN host passes only when its exact host:port is allow-listed, and only over TLS', V.checkUrl('https://192.168.1.20:8443/x', '192.168.1.20:8443').ok && !V.checkUrl('https://192.168.1.20:8444/x', '192.168.1.20:8443').ok && !V.checkUrl('http://192.168.1.20:8443/x', '192.168.1.20:8443').ok && V.checkUrl('wss://10.1.2.3:9443', ['10.1.2.3:9443']).ws);
  ok('ssrf: the allowlist drops public IPs, hostnames and junk', V.parseAllow('8.8.8.8:443, evil.com:80, 192.168.0.9:70000, 172.16.4.4:9000 ,10.0.0.1:1').join() === '172.16.4.4:9000,10.0.0.1:1');

  // ── HMAC envelopes
  const sec = V.rand(32), slot = V.SLOTS[0];
  ok('crypto: secrets are 32 random bytes (64 hex), never repeating', /^[0-9a-f]{64}$/.test(sec) && sec !== V.rand(32));
  ok('crypto: HMAC-SHA256 matches the RFC 4231 test case 2', (await V.hmac(Buffer.from('Jefe').toString('hex'), 'what do ya want for nothing?')) === '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  const now = 1_800_000_000_000, w1 = await V.envelope(slot, 'signal', { action: 'buy', symbol: 'BTC', usd: 100 }, sec, 'sessA', 1, 'live', now);
  const v1 = await V.verify(w1, sec, null, now + 500);
  ok('envelope: receiver verifies signature and reads the signal', v1.ok && v1.p.body.symbol === 'BTC' && v1.p.slot === 1 && v1.p.adapter === 'runner' && v1.p.mode === 'live' && v1.p.app === 'ExTerm', JSON.stringify(v1));
  const tampered = JSON.parse(w1); tampered.payload = tampered.payload.replace('"usd":100', '"usd":100000');
  ok('envelope: a tampered payload is rejected', !(await V.verify(JSON.stringify(tampered), sec, null, now)).ok);
  ok('envelope: a different secret is rejected', !(await V.verify(w1, V.rand(32), null, now)).ok);
  ok('envelope: stale envelopes (> 30 s) are rejected', (await V.verify(w1, sec, null, now + 31000)).why === 'stale');
  ok('envelope: replays (same session, seq not rising) are rejected', (await V.verify(w1, sec, { session: 'sessA', seq: 1 }, now)).why === 'replay' && (await V.verify(w1, sec, { session: 'sessB', seq: 9 }, now)).ok);
  ok('envelope: wire format is a JSON string payload + sha256= signature', (() => { const w = JSON.parse(w1); return typeof w.payload === 'string' && /^sha256=[0-9a-f]{64}$/.test(w.sig); })());

  // ── state + gates
  const fresh = V.load(null);
  ok('state: a fresh install is PAPER on all six slots, disabled, no caps, no disclosure', fresh.mode === 'paper' && fresh.slots.length === 6 && fresh.slots.every((s) => s.mode === 'paper' && !s.enabled) && !fresh.ack && !V.capsOk(fresh.caps));
  const T = 1_800_000_000_000, st = V.defaults();
  const g0 = V.gates(st, '', T); ok('gates: all four closed on a fresh install', g0.length === 4 && g0.every((g) => !g.ok));
  st.slots[0].enabled = true; st.slots[0].secret = sec; st.slots[0].hb = { ok: true, ms: 3, t: T - 1000 };
  ok('gate 1: a fresh heartbeat on an enabled slot opens it', V.gates(st, '', T)[0].ok);
  ok('gate 1: a stale heartbeat (> 2 min) or a disabled slot does not', !V.gates(st, '', T + V.HB_TTL + 1)[0].ok && !V.gates(Object.assign({}, st, { slots: st.slots.map((s) => Object.assign({}, s, { enabled: false })) }), '', T)[0].ok);
  st.caps = { maxLoss: 500, riskPct: 1, maxPos: 3 };
  ok('gate 2: all three circuit breakers must be valid', V.gates(st, '', T)[1].ok && !V.capsOk({ maxLoss: 500, riskPct: 1, maxPos: '' }) && !V.capsOk({ maxLoss: 0, riskPct: 1, maxPos: 3 }) && !V.capsOk({ maxLoss: 500, riskPct: 150, maxPos: 3 }) && !V.capsOk({ maxLoss: 500, riskPct: 1, maxPos: 2.5 }));
  st.ack = true; ok('gate 3: the disclosure checkbox opens it', V.gates(st, '', T)[2].ok);
  ok('gate 4: only the exact phrase ARM LIVE BOT opens it', V.gates(st, 'ARM LIVE BOT', T)[3].ok && ['arm live bot', 'ARM LIVE BOT ', ' ARM LIVE BOT', 'ARM  LIVE BOT', 'ARM LIVE'].every((p) => !V.gates(st, p, T)[3].ok));
  ok('arm: refused while any single gate is closed', [{ ack: false }, { caps: { maxLoss: '', riskPct: 1, maxPos: 3 } }].every((x) => V.arm(Object.assign({}, st, x), 'ARM LIVE BOT', T) === null) && V.arm(st, 'ARM LIVE', T) === null && V.arm(st, 'ARM LIVE BOT', T + V.HB_TTL + 5) === null);
  const armed = V.arm(st, 'ARM LIVE BOT', T, 10000);
  ok('arm: with all four gates, only healthy slots go LIVE', armed && armed.mode === 'live' && armed.slots[0].mode === 'live' && armed.slots.slice(1).every((s) => s.mode === 'paper') && V.liveSlots(armed).length === 1 && armed.day.eq0 === 10000);
  ok('arm: does not mutate the previous state', st.mode === 'paper' && st.slots[0].mode === 'paper');
  const reloaded = V.load(JSON.stringify(armed));
  ok('reload: a consistent armed state reloads as LIVE (the UI then shows the briefing)', reloaded.mode === 'live' && V.liveSlots(reloaded).length === 1);
  ok('reload: inconsistent saved state (no disclosure / no caps / no secret / public URL) always loads as PAPER', [{ ack: false }, { caps: {} }, { slots: armed.slots.map((s) => Object.assign({}, s, { secret: 'x' })) }, { slots: armed.slots.map((s) => Object.assign({}, s, { url: 'http://evil.com/' })) }].every((x) => { const l = V.load(JSON.stringify(Object.assign({}, armed, x))); return l.mode === 'paper' && l.slots.every((s) => s.mode === 'paper'); }));
  ok('reload: garbage never throws and gives PAPER', ['{', '[]', '"live"', 42, { mode: 'live' }].every((x) => V.load(x).mode === 'paper'));
  const killed = V.kill(armed);
  ok('kill-switch: PAPER on all six slots, disclosure must be re-accepted, gates closed again', killed.mode === 'paper' && killed.slots.every((s) => s.mode === 'paper') && !killed.ack && !V.canArm(killed, 'ARM LIVE BOT', T) && armed.mode === 'live');

  // ── circuit breakers
  const caps = { maxLoss: 500, riskPct: 2, maxPos: 3 };
  ok('guard: a trade within every cap passes', V.guard({ side: 'buy', riskUsd: 150 }, caps, { dayLoss: 100, open: 1, equity: 10000 }).ok);
  ok('guard: daily-loss cap blocks new risk', !V.guard({ side: 'buy', riskUsd: 10 }, caps, { dayLoss: 500, open: 0, equity: 10000 }).ok);
  ok('guard: concurrent-position cap blocks new risk', !V.guard({ side: 'buy', riskUsd: 10 }, caps, { dayLoss: 0, open: 3, equity: 10000 }).ok);
  ok('guard: per-trade risk cap blocks oversized trades', /risk/.test(V.guard({ side: 'buy', riskUsd: 201 }, caps, { dayLoss: 0, open: 0, equity: 10000 }).why || ''));
  ok('guard: closing trades always pass (they only reduce exposure)', V.guard({ side: 'sell', riskUsd: 1e9 }, caps, { dayLoss: 1e9, open: 99, equity: 1 }).ok);
  ok('schema: each slot documents wire, payload and reply; the sample receiver verifies with compare_digest on 127.0.0.1', V.SLOTS.every((s) => { const j = JSON.parse(V.schema(s)); return j.wire && j.payload.slot === s.id && j.reply; }) && /compare_digest/.test(V.sampleReceiver(V.SLOTS[0], '')) && /"127\.0\.0\.1", 8765/.test(V.sampleReceiver(V.SLOTS[0], '')));

  // ── build + static
  const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const B = rd('build.py'), HTML = rd('src/index.html');
  ok('build: v160core.js + v160.js bundled after v157.js and before boot.js', /"v157\.js", "v160core\.js", "v160\.js", "boot\.js"/.test(B));
  ok('csp: default-src none kept; connect-src permits plain http / ws only on loopback', /default-src 'none'/.test(HTML) && /ws:\/\/127\.0\.0\.1:\*/.test(HTML) && !/connect-src[^;]*\shttp:\s/.test(HTML) && !/connect-src[^;]*\sws:\s/.test(HTML));
  const SRC = ['src/v160core.js', 'src/v160.js'].map((x) => [x, rd(x)]);
  ok('static: no inline handlers, eval, new Function or non-loopback URLs in v16.0 modules', SRC.every(([, x]) => !/\son[a-z]+\s*=\s*["'`]/i.test(x.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\beval\(|new Function\(|import\s*\(/.test(x) && !/(https?|wss?):\/\/(?!127\.0\.0\.1|localhost|github\.com\/uexxx)[a-z0-9]/i.test(x)));
  ok('static: requests refuse redirects, cookies and referrers', /redirect: 'error'/.test(SRC[1][1]) && /credentials: 'omit'/.test(SRC[1][1]) && /referrerPolicy: 'no-referrer'/.test(SRC[1][1]));
  ok('static: Ctrl+Shift+K is captured before the Ctrl+K palette', /addEventListener\('keydown', onKey, true\)/.test(SRC[1][1]) && /stopImmediatePropagation/.test(SRC[1][1]));
  const BANNED = new RegExp(['op' + 'en[- ]?so' + 'urce', 'so' + 'lana', '\\bS' + 'OL\\b', 'C:\\\\\\\\Users', '/home/', '@gm' + 'ail', 'rob' + 'lo', '3com' + 'mas', 'crypto' + 'hopper', 'pine' + 'connector', 'traders' + 'post', 'hummin' + 'gbot', 'free' + 'qtrade'].join('|'), 'i');
  ok('static: no banned terms, third-party bot brands, personal paths or private emails in v16.0 modules', SRC.every(([, x]) => !BANNED.test(x)), SRC.filter(([, x]) => BANNED.test(x)).map(([n]) => n));
  ok('static: v160.js interpolates user / slot strings through esc()', !/\$\{(s\.url|d\.name|d\.note|b\.name|x\.msg|U\.st\.allow)\}/.test(SRC[1][1]));

  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
})().catch((e) => { console.log(res.join('\n')); console.log('CRASH', e && e.stack); process.exit(1); });
