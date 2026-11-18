// ExTerm v16.1 core unit tests: idempotency_key + 3 s TTL, ephemeral per-session signing key, anti-replay nonce cache,
// schema validator + Max Single-Order Notional firewall, spread circuit breaker, consecutive-loss cooldown, receipt ledger
// CSV / JSON export, discipline tags + attribution, measure maths, menu edge flipping; static CSP / privacy checks.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const V0 = require('../src/v160core.js'), V = require('../src/v161core.js');
(async () => {
  // ── 1. idempotency key + TTL
  const sec = V0.rand(32), slot = V0.SLOTS[0], now = 1_800_000_000_000;
  const w = await V0.envelope(slot, 'signal', { action: 'buy', symbol: 'BTC', usd: 100, sl: 1 }, sec, 'sessA', 1, 'live', now), p = JSON.parse(JSON.parse(w).payload);
  ok('idempotency: every packet carries a UUID v4 idempotency_key', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.idempotency_key), p.idempotency_key);
  ok('idempotency: keys never repeat across 2,000 packets', new Set(Array.from({ length: 2000 }, () => V0.uuid())).size === 2000);
  ok('ttl: expires_at_ms = ts + 3000 ms', p.expires_at_ms === now + 3000 && V0.TTL_MS === 3000);
  ok('ttl: accepted inside the window, rejected as "expired" after 3 s', (await V0.verify(w, sec, null, now + 2999)).ok && (await V0.verify(w, sec, null, now + 3001)).why === 'expired');
  // ── 2. ephemeral session key + anti-replay cache
  ok('session key: derived HMAC-SHA256(slot secret, "ExTerm-session-v2|" + session), different per session', (await V0.sessionKey(sec, 'a')) !== (await V0.sessionKey(sec, 'b')) && /^[0-9a-f]{64}$/.test(await V0.sessionKey(sec, 'a')) && p.kdf === 'session-v2');
  const wb = JSON.parse(w); const raw = 'sha256=' + (await V0.hmac(sec, wb.payload));
  ok('session key: a packet signed with the raw slot secret is rejected (only the session key verifies)', !(await V0.verify(JSON.stringify({ payload: wb.payload, sig: raw }), sec, null, now)).ok);
  const w2 = await V0.envelope(slot, 'signal', { action: 'buy' }, sec, 'sessB', 1, 'live', now);
  ok('session key: rotating the session yields a different signature for the same body', JSON.parse(w2).sig !== JSON.parse(await V0.envelope(slot, 'signal', { action: 'buy' }, sec, 'sessC', 1, 'live', now, JSON.parse(JSON.parse(w2).payload).idempotency_key)).sig);
  const NC = new V0.NonceCache(3, 60000);
  ok('anti-replay: first delivery accepted, the captured copy rejected as "replay"', (await V0.verify(w, sec, null, now, NC)).ok && (await V0.verify(w, sec, null, now + 10, NC)).why === 'replay');
  ok('anti-replay: rejection works even when seq tracking is reset (new receiver state)', (await V0.verify(w, sec, { session: 'zz', seq: 0 }, now + 20, NC)).why === 'replay');
  NC.add('a', now); NC.add('b', now); NC.add('c', now); NC.add('d', now);
  ok('anti-replay: rolling cache is bounded (oldest evicted) and time-limited', NC.size === 3 && !NC.has('a', now) && NC.has('d', now) && !NC.has('d', now + 60001));
  ok('v16.0 contract kept: tamper / wrong secret / stale still rejected', !(await V0.verify(JSON.stringify({ payload: wb.payload.replace('"usd":100', '"usd":900'), sig: wb.sig }), sec, null, now)).ok && !(await V0.verify(w, V0.rand(32), null, now)).ok && (await V0.verify(w, sec, null, now + 31000)).why === 'stale');
  ok('schema doc + sample receiver describe TTL, idempotency, session key and ack', /expires_at_ms/.test(V0.schema(slot)) && /idempotency_key/.test(V0.schema(slot)) && /ExTerm-session-v2/.test(V0.sampleReceiver(slot, '')) && /"ack"/.test(V0.sampleReceiver(slot, '')) && /compare_digest/.test(V0.sampleReceiver(slot, '')));

  // ── 3. schema validator + fat-finger firewall
  const F = V.FS_DEFAULTS(), good = { action: 'buy', symbol: 'BTC', usd: 250, price: 64000, qty: 0.0039, sl: 62000, tp: 68000, source: 'manual' };
  ok('firewall: a well-formed buy under the cap passes', V.validate(good, F).ok);
  const bad = [[{ usd: NaN }, 'finite'], [{ price: Infinity }, 'finite'], [{ sl: null }, 'stop-loss'], [{ symbol: 'BTC<script>' }, 'symbol'], [{ symbol: '' }, 'symbol'], [{ usd: 0 }, 'above $0'], [{ usd: -5 }, 'negative'], [{ usd: 10001 }, 'Notional'], [{ sl: 65000 }, 'below the entry'], [{ action: 'nuke' }, 'unknown action'], [{ qty: '1' }, 'finite']];
  const miss = bad.filter(([o, why]) => { const r = V.validate(Object.assign({}, good, o), F); return r.ok || !r.why.includes(why); });
  ok('firewall: NaN / Infinity, missing or inverted stop, bad symbol, zero / negative size, unknown action and over-cap notional are blocked', !miss.length, JSON.stringify(miss));
  ok('firewall: closes (sell) are never blocked by the cap or the stop rule', V.validate({ action: 'sell', symbol: 'BTC', usd: 50000, price: 64000, qty: 0.8 }, F).ok && V.validate({ action: 'CANCEL_ALL_AND_FLATTEN' }, F).ok);
  ok('firewall: non-object payloads are refused', !V.validate(null, F).ok && !V.validate([good], F).ok);
  ok('settings: invalid fail-safe values fall back to safe defaults', JSON.stringify(V.loadFs('{"maxNotional":"x","maxSpreadPct":-1,"lossN":0,"cooldown":"9y"}')) === JSON.stringify(V.FS_DEFAULTS()) && V.loadFs({ maxNotional: 500, cooldown: '24h' }).maxNotional === 500);

  // ── 4. spread circuit breaker
  ok('spread: (ask−bid)/mid in %', Math.abs(V.spreadPct(99.5, 100.5) - 1) < 1e-9 && V.spreadPct(0, 1) === null && V.spreadPct(2, 1) === null);
  ok('spread: holds above the ceiling, passes at / below, unknown spread passes but is flagged', !V.spreadGuard(99, 101, 0.5).ok && V.spreadGuard(99.9, 100.1, 0.5).ok && V.spreadGuard(undefined, undefined, 0.5).ok && V.spreadGuard(undefined, undefined, 0.5).known === false);

  // ── 5. consecutive-loss cooldown
  const T0 = now, L = (i, pnl) => ({ ts: T0 + i * 1000, pnl });
  const f3 = Object.assign(V.FS_DEFAULTS(), { lossN: 3, cooldown: '15m' });
  ok('cooldown: 2 losses do not lock', !V.cooldown(f3, [L(1, -5), L(2, -5)], T0 + 5000).locked);
  const c3 = V.cooldown(f3, [L(0, 9), L(1, -5), L(2, -5), L(3, -5)], T0 + 5000);
  ok('cooldown: 3 consecutive losses lock live routing for 15m from the last loss', c3.locked && c3.tripped && c3.until === T0 + 3000 + 900000);
  ok('cooldown: a win breaks the streak', !V.cooldown(f3, [L(1, -5), L(2, -5), L(3, 1), L(4, -5)], T0 + 5000).locked);
  const after = V.cooldown(c3.fs, [L(1, -5), L(2, -5), L(3, -5)], T0 + 3000 + 900001);
  ok('cooldown: unlocks when the window passes and the old streak no longer counts', !after.locked && after.fs.lockUntil === 0 && !V.cooldown(after.fs, [L(1, -5), L(2, -5), L(3, -5)], T0 + 3000 + 900100).locked);
  ok('cooldown: 1h and 24h windows', V.COOLDOWNS['1h'] === 3600000 && V.COOLDOWNS['24h'] === 86400000);

  // ── 7. receipt ledger
  const rows = [V.ledgerRow('signal', { ts: now, slot: 1, status: 'sent', key: p.idempotency_key, sig: V.sigHex(w), detail: '=HYPERLINK("x")' }), V.ledgerRow('kill', { ts: now + 1, status: 'paper', detail: 'Ctrl+Shift+K' })];
  ok('ledger: rows carry ts, kind, slot, idempotency_key and the 64-hex HMAC signature', rows[0].idempotency_key === p.idempotency_key && /^[0-9a-f]{64}$/.test(rows[0].sig) && rows[1].slot === null);
  const csv = V.toCSV(rows);
  ok('ledger CSV: header + rows, ISO timestamps, spreadsheet formulas neutralised', csv.startsWith('ts,iso,kind,slot,status,idempotency_key,sig,detail') && csv.includes(new Date(now).toISOString()) && csv.includes(`"'=HYPERLINK(""x"")"`) && csv.split('\r\n').length === 4);
  ok('ledger JSON: parses back with every row', JSON.parse(V.toJSON(rows)).rows.length === 2);

  // ── 8. discipline tags + attribution
  const plan = { entry: 100, sl0: 98, tp0: 110, usd: 1000, eq: 10000, wider: false };
  ok('tags: Followed Plan when stop kept, risk ≤ cap and exit by target', V.tagTrade(plan, { price: 110, reason: 'take-profit' }).join() === 'Followed Plan');
  ok('tags: Moved Stop Wider', V.tagTrade(Object.assign({}, plan, { wider: true }), { price: 97, reason: 'stop-loss' }).includes('Moved Stop Wider'));
  ok('tags: Over-Size Risk (no stop, or risk above the cap)', V.tagTrade(Object.assign({}, plan, { sl0: null }), { price: 110, reason: 'take-profit' }).includes('Over-Size Risk') && V.tagTrade(Object.assign({}, plan, { usd: 9000, sl0: 90 }), { price: 110, reason: 'take-profit' }).includes('Over-Size Risk'));
  ok('tags: Early Exit (manual close below half the planned reward), not for stops / partial TP', V.tagTrade(plan, { price: 103, reason: 'market sell' }).includes('Early Exit') && !V.tagTrade(plan, { price: 103, reason: 'partial take-profit (50%)' }).includes('Early Exit') && !V.tagTrade(plan, { price: 107, reason: 'market sell' }).includes('Early Exit'));
  const A = V.attribution([{ pnl: 100, tags: ['Followed Plan'] }, { pnl: 50, tags: ['Followed Plan'] }, { pnl: -80, tags: ['Moved Stop Wider'] }, { pnl: 20, tags: ['Early Exit', 'Over-Size Risk'] }]);
  ok('attribution: exact net $ for disciplined trades vs rule violations, per tag', A.disciplined === 150 && A.violations === -60 && A.nDisciplined === 2 && A.nViolations === 2 && A.byTag['Moved Stop Wider'].usd === -80 && A.byTag['Over-Size Risk'].n === 1);

  // ── measure + menu
  const D = Array.from({ length: 50 }, (_, i) => ({ t: 1000 + i * 60, o: 100, h: 101, l: 99, c: 100, v: 10 }));
  const m = V.measure(D, 10, 30, 100, 105, 60);
  ok('measure: Δ$, %, bars, elapsed time and cumulative volume', m.dp === 5 && Math.abs(m.pct - 5) < 1e-9 && m.bars === 20 && m.secs === 1200 && m.vol === 210 && m.up === true);
  ok('measure: down move flagged (crimson) and reversed drags give the same span', V.measure(D, 30, 10, 105, 100, 60).up === false && V.measure(D, 30, 10, 105, 100, 60).vol === 210);
  ok('measure: duration format', V161fmt());
  function V161fmt() { return V.fmtDur(45) === '45s' && V.fmtDur(1200) === '20m' && V.fmtDur(5400) === '1h 30m' && V.fmtDur(90000) === '1d 1h'; }
  const mp = V.menuPos(1400, 850, 280, 400, 1440, 900);
  ok('context menu: flips left and up at the viewport edge, stays put elsewhere', mp.flipX && mp.flipY && mp.x === 1120 && mp.y === 450 && !V.menuPos(100, 100, 280, 400, 1440, 900).flipX);

  // ── static: CSP / privacy / branding
  const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
  const ui = src('v161.js') + src('v160.js'), core = src('v161core.js');
  ok('static: no inline handlers, eval or document.write in v16.1 modules', !/\son[a-z]+\s*=\s*["'`]/i.test(ui.replace(/ws\.on(open|message|error)\s*=/g, '')) && !/\beval\(|new Function|document\.write/.test(ui + core));
  ok('static: v16.1 modules are in the build order before boot.js', /"v160core\.js", "v161core\.js", ("v162core\.js", )?("v163core\.js", )?("v164core\.js", )?"v160\.js", "v161\.js", ("v162\.js", )?("v163\.js", )?("v164\.js", )?"boot\.js"/.test(fs.readFileSync(path.join(root, 'build.py'), 'utf8')));
  ok('static: no personal paths or e-mail addresses', !/[A-Za-z]:\\Users\\|\/home\/[a-z]|[A-Za-z0-9._%+-]+@(?!exterm)[A-Za-z0-9.-]+\.[a-z]{2,}/.test(ui + core));
  ok('static: the measure overlay canvas is pointer-transparent', /canvas\.v161-ov\{[^}]*pointer-events:none/.test(src('style.css')));
  const sp = fs.readFileSync(path.join(root, 'serve.py'), 'utf8');
  ok('static: serve.py / serve.ps1 webhook gateway has no third-party domain allowlist left (loopback + EXTERM_HOOK_ALLOW only)', !/^HOOK_(ALLOW|SUFFIX)\s*=/m.test(sp) && /def hook_target_ok/.test(sp) && /hookAllow = @\('127\.0\.0\.1', 'localhost', '::1'\)/.test(fs.readFileSync(path.join(root, 'serve.ps1'), 'utf8')) && !/\.(io|com|net|org|cloud)'/.test((fs.readFileSync(path.join(root, 'serve.ps1'), 'utf8').match(/hookAllow = [^\n]*/) || [''])[0]));

  console.log(res.join('\n'));
  const fl = res.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${res.length - fl}/${res.length} passed`);
  if (fl) process.exitCode = 1;
})();
