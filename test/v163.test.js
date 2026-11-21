// ExTerm v16.3 core unit tests: active-tick sub-minute bars, mandatory stop-loss, $ risk sizer + R:R badges, break-even,
// scaled take-profit, chart precision maths, TIF + hotkeys, the eight core risk guards, settings; static wiring / CSP / privacy.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const V = require('../src/v163core.js'), V161 = require('../src/v161core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 0. active-tick sub-minute bars: replay the v157.js store wrapper against a tiny in-memory store
const store = (sec) => ({ sec, candles: [{ t: 1000, o: 10, h: 10, l: 10, c: 10, v: 1 }] });
const tick = (s, p, q, ts) => {
  const c = s.candles, last = c[c.length - 1], k = V.subStep(last, s.sec, ts, V.tickChanged(last, p, q));
  if (k === 'merge') { last.c = p; last.h = Math.max(last.h, p); last.l = Math.min(last.l, p); last.v += q || 0; }
  else if (k === 'append') c.push(V.nextBar(last, s.sec, ts, { c: p, v: q || 0 }));
  return k;
};
for (const sec of [1, 5, 10, 15]) {
  const s = store(sec); let skips = 0;
  for (let i = 1; i <= 120; i++) if (tick(s, 10, 0, 1000 + i) === 'skip') skips++; // two minutes of quiet polls (on-chain / closed stock)
  ok(`${sec}s: 120 s of quiet ticks (price = prev close, Δvol 0) append no flat bars`, s.candles.length === 1 && skips > 0, s.candles.length);
  tick(s, 10.2, 0, 1200);
  ok(`${sec}s: a real price change appends exactly one bar, opening at the prior close`, s.candles.length === 2 && s.candles[1].o === 10 && s.candles[1].c === 10.2 && s.candles[1].t === Math.floor(1200 / sec) * sec);
  tick(s, 10.2, 3, 1200 + sec);
  ok(`${sec}s: volume at an unchanged price still advances the bar`, s.candles.length === 3 && s.candles[2].v === 3);
  ok(`${sec}s: no bar in the store is a flat filler`, s.candles.slice(1).every((b) => !V.quiet(b)));
}
ok('active-tick: same-bucket ticks merge, late ticks are dropped, 1m+ stores pass through',
  V.subStep({ t: 100, c: 1 }, 5, 102, false) === 'merge' && V.subStep({ t: 100, c: 1 }, 5, 90, true) === 'old' && V.subStep({ t: 60, c: 1 }, 60, 200, false) === 'pass');
ok('active-tick: an aggregated quiet second (h = l = c = prev close, v 0) is not a change',
  !V.aggChanged({ c: 5 }, { c: 5, h: 5, l: 5, v: 0 }) && V.aggChanged({ c: 5 }, { c: 5, h: 5.1, l: 5, v: 0 }) && V.aggChanged({ c: 5 }, { c: 5, h: 5, l: 5, v: 2 }));
{ const r = V.activeOnly([{ t: 1, o: 1, h: 2, l: 1, c: 2, v: 1 }, { t: 2, o: 2, h: 2, l: 2, c: 2, v: 0 }, { t: 3, o: 2, h: 2, l: 2, c: 2, v: 0 }, { t: 4, o: 2, h: 3, l: 2, c: 3, v: 1 }]);
  ok('seeding: rolled-up flat quiet bars are dropped and the chain stays gapless', r.length === 2 && r[1].t === 4 && r[1].o === 2); }

// 1. mandatory stop-loss
ok('SL: a long without a stop is blocked', !V.checkSL({ action: 'buy', price: 100 }, true).ok);
ok('SL: long stop above / at entry blocked, below passes', !V.checkSL({ action: 'buy', price: 100, sl: 101 }, true).ok && !V.checkSL({ action: 'buy', price: 100, sl: 100 }, true).ok && V.checkSL({ action: 'buy', price: 100, sl: 98 }, true).ok);
ok('SL: short stop must sit above entry', !V.checkSL({ action: 'buy', side: 'short', price: 100, sl: 99 }, true).ok && V.checkSL({ action: 'buy', side: 'short', price: 100, sl: 102 }, true).ok);
ok('SL: closes, reduce-only and CANCEL_ALL_AND_FLATTEN are never blocked', V.checkSL({ action: 'sell', price: 100 }, true).ok && V.checkSL({ action: 'buy', reduce: true }, true).ok && V.checkSL({ action: 'CANCEL_ALL_AND_FLATTEN' }, true).ok);
ok('SL: the explicit toggle override lets an unprotected open through', V.checkSL({ action: 'buy', price: 100 }, false).ok);
ok('SL: ON by default', V.DEFAULTS().requireSL === true && V.load(null).requireSL === true && V.load('{"requireSL":"no"}').requireSL === true);
ok('router schema: V161.validate honours the override and short direction', !V161.validate({ action: 'buy', symbol: 'BTC', usd: 50, price: 100 }, { maxNotional: 1e4 }).ok
  && V161.validate({ action: 'buy', symbol: 'BTC', usd: 50, price: 100 }, { maxNotional: 1e4 }, { sl: false }).ok
  && V161.validate({ action: 'buy', side: 'short', symbol: 'BTC', usd: 50, price: 100, sl: 103 }, { maxNotional: 1e4 }).ok
  && !V161.validate({ action: 'buy', side: 'short', symbol: 'BTC', usd: 50, price: 100, sl: 97 }, { maxNotional: 1e4 }).ok);

// 2. sizer + badges
{ const r = V.sizeByRisk(150, 100, 99, {}); ok('sizer: $150 risk over a $1 stop = 150 units', r && near(r.qty, 150) && near(r.risk, 150) && r.side === 'long'); }
{ const r = V.sizeByRisk(100, 64000, 63000, { step: 0.0001 }); ok('sizer: lot step floors the quantity and never exceeds the risk', r && near(r.qty, 0.1) && r.risk <= 100); }
{ const r = V.sizeByRisk(100, 100, 98, { feePct: 0.001 }); ok('sizer: round-trip fees are part of the risk per unit', r && near(r.per, 2.2) && r.risk <= 100 + 1e-9); }
{ const r = V.sizeByRisk(1000, 10, 9, { maxUsd: 500 }); ok('sizer: capped by available cash', r && r.capped && r.usd <= 500); }
ok('sizer: bad input returns null', V.sizeByRisk(0, 100, 99) === null && V.sizeByRisk(10, 100, 100) === null && V.sizeByRisk(10, 0, 1) === null);
ok('badge: target "+$420 (+2.8R)"', V.badge(100, 99, 102.8, 150, 'long').text === '+$420 (+2.8R)', V.badge(100, 99, 102.8, 150, 'long').text);
ok('badge: stop "-$150 (-1.0R)"', V.badge(100, 99, 99, 150, 'long').text === '-$150 (-1.0R)', V.badge(100, 99, 99, 150, 'long').text);
ok('badge: short P&L is mirrored', V.badge(100, 101, 97, 10, 'short').text === '+$30.00 (+3.0R)', V.badge(100, 101, 97, 10, 'short').text);

// 3. BE + splitter
ok('BE: long break-even covers round-trip fees, short mirrored', near(V.breakEven(100, 'long', 0.001), 100.2) && near(V.breakEven(100, 'short', 0.001), 99.8));
{ const s = V.splitTP(1, 100, 106, null, 'long');
  ok('splitter: TP1 50% / TP2 30% / TP3 20% at 1/3, 2/3 and the full target', s && s.map((x) => x.pct).join() === '50,30,20' && near(s[0].qty, 0.5) && near(s[1].qty, 0.3) && near(s[2].qty, 0.2) && near(s[0].price, 102) && near(s[1].price, 104) && near(s[2].price, 106)); }
{ const s = V.splitTP(0.0007, 100, 103, null, 'long', 0.0001); ok('splitter: lot step keeps every unit (remainder lands on TP3)', s && near(s.reduce((a, x) => a + x.qty, 0), 0.0007, 1e-12)); }
ok('splitter: a target on the wrong side is refused', V.splitTP(1, 100, 99, null, 'long') === null && V.splitTP(1, 100, 101, null, 'short') === null);
ok('auto-BE: fires once TP1 trades, never loosens a tighter stop', near(V.autoBE({ entry: 100, side: 'long', sl: 97 }, 102, 102, 0), 100) && V.autoBE({ entry: 100, side: 'long', sl: 97 }, 101.9, 102, 0) === null && V.autoBE({ entry: 100, side: 'long', sl: 100.5 }, 103, 102, 0) === null);

// 4. chart maths
{ const a = []; V.pushSpread(a, 1, 99.9, 100.1); V.pushSpread(a, 1, 99.8, 100.2); V.pushSpread(a, 2, 0, 1); V.pushSpread(a, 3, 101, 100);
  ok('tunnel: one sample per second, bad / crossed quotes ignored', a.length === 1 && a[0].bid === 99.8); }
ok('tunnel: draws on 1s – 1m only', V.tunnelOn(1) && V.tunnelOn(60) && !V.tunnelOn(300));
ok('snap: nearest of high / low / VWAP within tolerance, else unchanged', V.snap(100.04, [100.1, 100.05, 99], 0.02) === 100.05 && V.snap(100, [101], 0.5) === 100);
ok('vwap: volume-weighted typical price, falls back to the mean', near(V.vwap([{ h: 2, l: 0, c: 1, v: 1 }, { h: 5, l: 3, c: 4, v: 3 }]), 3.25) && near(V.vwap([{ h: 2, l: 0, c: 1 }, { h: 4, l: 2, c: 3 }]), 2));
ok('ghost: preview bracket from ticket %', (() => { const g = V.ghost(100, 0.02, 0.05, 'long'); return near(g.sl, 98) && near(g.tp, 105); })());
{ const a = V.trailPlan(100, 101, 0.02, 0.02, 0, 'long'), b = V.trailPlan(100, 110, 0.02, 0.02, 0.01, 'long');
  ok('trail: inactive below the activation price', a && !a.active && near(a.act, 102));
  ok('trail: active stop steps in 1% of entry and shows the next step', b && b.active && near(b.stop, 107) && b.next > 110, JSON.stringify(b)); }
{ const s = V.slippage(100.05, 100, 'buy', 0.01), t = V.slippage(99.9, 100, 'sell', 0.01);
  ok('slippage: adverse buy fill in bps and ticks', near(s.bps, 5) && near(s.ticks, 5) && s.text === '+5.0 bps');
  ok('slippage: adverse sell fill is positive too', near(t.bps, 10) && near(t.ticks, 10)); }

// 5. TIF + hotkeys
ok('TIF: Post-Only refuses a crossing buy, accepts a resting one', !V.tifCheck('POST', 'buy', 100.2, 100, 100.1).ok && V.tifCheck('POST', 'buy', 99.9, 100, 100.1).ok);
ok('TIF: IOC cancels a non-marketable remainder', V.tifCheck('IOC', 'buy', 99, 100, 100.1).cancelRest === true && V.tifCheck('IOC', 'buy', 101, 100, 100.1).cancelRest === false);
ok('TIF: GTC rests', V.tifCheck('GTC', 'sell', 101, 100, 100.1).ok && !V.tifCheck('GTC', 'sell', 101, 100, 100.1).cancelRest);
ok('hotkeys: Shift+B / Shift+S / Shift+X', V.hotkey({ shiftKey: true, key: 'B' }) === 'buy' && V.hotkey({ shiftKey: true, key: 's' }) === 'sell' && V.hotkey({ shiftKey: true, key: 'X' }) === 'cancel');
ok('hotkeys: ignored in inputs, with Ctrl / Alt / Meta, without Shift or on key repeat', V.hotkey({ shiftKey: true, key: 'B' }, true) === null && V.hotkey({ shiftKey: true, ctrlKey: true, key: 'B' }) === null && V.hotkey({ key: 'b' }) === null && V.hotkey({ shiftKey: true, key: 'B', repeat: true }) === null && V.hotkey({ shiftKey: true, key: 'Q' }) === null);

// 6. guards
const book = { bids: [[99.95, 10], [99.9, 20], [90, 1e6]], asks: [[100.05, 10], [100.1, 20], [110, 1e6]] };
ok('depth: $3,002 of asks within 0.5% covers a $1,000 order at 3×', V.depthCheck(book, 'buy', 1000, 3).ok && near(V.depthCheck(book, 'buy', 1000, 3).depth, 100.05 * 10 + 100.1 * 20));
ok('depth: a $1,100 order needs $3,300 → blocked; far levels outside the band do not count', !V.depthCheck(book, 'buy', 1100, 3).ok);
ok('depth: unknown book passes, flagged unknown', V.depthCheck(null, 'buy', 1e9, 3).ok && V.depthCheck(null, 'buy', 1, 3).known === false);
ok('stale: 4s crypto ok, 6s blocked; 15s stock ok; 60s on-chain ok; no timestamp blocked', V.staleQuote(4000, 'crypto').ok && !V.staleQuote(6000, 'crypto').ok && V.staleQuote(15000, 'stock').ok && V.staleQuote(60000, 'onchain').ok && !V.staleQuote(NaN, 'crypto').ok);
{ const now = 1e10, ts = Array.from({ length: 20 }, (_, i) => now - i * 60000); ok('rate: 20 in the last hour blocks at max 20, older ones expire, 0 = off', !V.rateLimit(ts, now, 20).ok && V.rateLimit(ts, now + 3600000, 20).ok && V.rateLimit(ts, now, 0).ok); }
ok('exposure: $24k open + $2k blocks a $25k cap; 0 = off', !V.exposure([{ usd: 20000 }, { usd: 4000 }], 2000, 25000).ok && V.exposure([{ usd: 20000 }], 5000, 25000).ok && V.exposure([{ usd: 1e9 }], 1, 0).ok);
ok('throttle: 2 losses in a row → 50% size; a win resets', V.throttle([{ pnl: 5, ts: 1 }, { pnl: -1, ts: 2 }, { pnl: -2, ts: 3 }]).scale === 0.5 && V.throttle([{ pnl: -1, ts: 1 }, { pnl: -2, ts: 2 }, { pnl: 3, ts: 3 }]).scale === 1 && V.throttle([{ pnl: -1, ts: 1 }]).scale === 1);
{ const a = Array.from({ length: 61 }, (_, i) => 100 * Math.exp(0.01 * Math.sin(i) + i * 0.001)), b = a.map((x) => x * 2.5), c = Array.from({ length: 61 }, (_, i) => 100 * Math.exp(0.01 * Math.cos(i * 2.7)));
  ok('corr: r > 0.85 with an open position blocks, unrelated passes, short history passes', !V.corrGuard(a, { ETH: b }, 0.85).ok && V.corrGuard(a, { SOL: c }, 0.85).ok && V.corrGuard(a.slice(0, 5), { ETH: b }, 0.85).ok); }
ok('thin hours: Saturday crypto and pre-market stock are thin, Tuesday 10:00 ET stock is not', V.thinHours(Date.UTC(2026, 10, 21, 15, 0), 'crypto') && V.thinHours(Date.UTC(2026, 10, 17, 13, 0), 'stock') && !V.thinHours(Date.UTC(2026, 10, 17, 15, 0), 'stock') && !V.thinHours(Date.UTC(2026, 10, 17, 15, 0), 'crypto'));
ok('thin hours: spread cap 50% tighter', V.spreadCap(0.5, true) === 0.25 && V.spreadCap(0.5, false) === 0.5);
ok('idle: default Off (24/7), presets 15 / 30 / 60 m', V.DEFAULTS().idleMin === 0 && V.IDLE.join() === '0,15,30,60' && !V.idleDue(0, 1e12, 0) && V.idleDue(0, 15 * 60000, 15) && !V.idleDue(0, 15 * 60000 - 1, 15) && V.load({ idleMin: 45 }).idleMin === 0);

// preflight chain
const now = Date.UTC(2026, 10, 17, 15, 0), base = { action: 'buy', symbol: 'BTC', usd: 1000, price: 100, sl: 98 };
const ctx = (o) => Object.assign({ now, kind: 'crypto', quoteAge: 1000, sentTimes: [], positions: [], book, closes: [], corrNew: [], corrOpen: {}, spread: { bid: 99.99, ask: 100.01 }, maxSpreadPct: 0.5 }, o || {});
ok('preflight: a clean order passes at full size', (() => { const r = V.preflight(base, ctx(), {}); return r.ok && r.scale === 1; })());
ok('preflight: missing stop blocks first (status sl)', V.preflight(Object.assign({}, base, { sl: null }), ctx(), {}).status === 'sl');
ok('preflight: stale / rate / exposure / depth each block with their status', V.preflight(base, ctx({ quoteAge: 9000 }), {}).status === 'stale' && V.preflight(base, ctx({ sentTimes: Array(20).fill(now - 1000) }), {}).status === 'rate'
  && V.preflight(base, ctx({ positions: [{ usd: 24500 }] }), {}).status === 'exposure' && V.preflight(Object.assign({}, base, { usd: 2000 }), ctx(), {}).status === 'depth');
ok('preflight: thin weekend spread above the halved cap blocks', V.preflight(base, ctx({ now: Date.UTC(2026, 10, 21, 15, 0), spread: { bid: 99.8, ask: 100.1 } }), {}).status === 'thin');
ok('preflight: drawdown throttle halves size after 2 losses', V.preflight(base, ctx({ closes: [{ pnl: -1, ts: 1 }, { pnl: -1, ts: 2 }] }), {}).scale === 0.5);
ok('preflight: closes are never blocked, even with every guard tripped', V.preflight({ action: 'sell', symbol: 'BTC', usd: 1e9 }, ctx({ quoteAge: NaN, sentTimes: Array(99).fill(now), positions: [{ usd: 1e12 }] }), {}).ok);
ok('preflight: guards can be switched off explicitly', V.preflight(Object.assign({}, base, { usd: 2000, sl: null }), ctx({ quoteAge: 9e9 }), { requireSL: false, staleOn: false, depthOn: false }).ok);
ok('settings: junk falls back to safe defaults', (() => { const d = V.load('{"depthX":-4,"maxPerHour":"x","expCap":-1,"corrMax":2,"tif":"FOK","riskUsd":0}'); return d.depthX === 3 && d.maxPerHour === 20 && d.expCap === 25000 && d.corrMax === 0.85 && d.tif === 'GTC' && d.riskUsd === 100; })());

// static wiring / CSP / privacy
const ui = src('v163.js'), core = src('v163core.js'), B = fs.readFileSync(path.join(root, 'build.py'), 'utf8'), v157 = src('v157.js'), v160 = src('v160.js'), css = src('style.css');
ok('build: v163core.js after v162core.js, v163.js after v162.js, both before boot.js', /"v162core\.js", "v163core\.js", (?:"v164core\.js", )?(?:"v165core\.js", )?(?:"v166core\.js", )?(?:"v170core\.js", )?"v160\.js", "v161\.js", "v162\.js", "v163\.js", (?:"v164\.js", )?(?:"v165\.js", )?(?:"v166\.js", )?(?:"v170\.js", )?"boot\.js"/.test(B));
ok('v157: active-tick wrapper installed on CandleStore.applyTick + applyAgg and the ring seed drops flat bars', /activeWire\(\)/.test(v157) && /P\.applyTick = function/.test(v157) && /P\.applyAgg = function/.test(v157) && /V163\.activeOnly\(rows\)/.test(v157));
ok('router: v16.0 runs the v16.3 pre-guards and passes the SL toggle to the schema', /for \(const f of U\.pre\)/.test(v160) && /V161\.validate\(body, U\.fs, \{ sl: U\.requireSL !== false \}\)/.test(v160) && /pre: \[\], requireSL: true/.test(v160));
ok('data status: launcher on → "Live Feed Diagnostics", off → "How to get live data"', /s\.launcher \? 'Live Feed Diagnostics' : 'How to get live data'/.test(src('v13core.js')));
ok('UI: settings, ticket, BE pill, hotkeys, idle and snap are wired', ['v163Safety', 'v163Tk', 'v163-be', 'onKey', 'idleCheck', 'snapMove', 'chart.overlays.push(overlay)', 'b.pre.push(guard)'].every((k) => ui.includes(k)));
ok('UI: NT.onTrade wrapper keeps the v16.0 / v16.1 flags so routing never doubles', /NT\.onTrade\._v160 = true/.test(ui) && /NT\.onTrade\._v161 = true/.test(ui));
ok('CSS: v16.3 styles present', ['.v163-tk', '.v163-be', '.v163-grid', '.v163-warn'].every((k) => css.includes(k)));
ok('CSP: no inline handlers, inline style attributes or eval in v16.3', !/\son[a-z]+=["']/i.test(ui + core) && !/\sstyle=["']/i.test(ui) && !/\beval\(|new Function/.test(ui + core));
ok('XSS: toasts with dynamic text escape it', !/toast\(`[^`]*\$\{(?!esc\(|n\b|n > 1|U\.cfg)[^`]*`/.test(ui));
ok('privacy: no personal paths, emails or usernames in v16.3 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo'].join('|'), 'i').test(ui + core));

// ══ v16.3 closed-loop cockpit (pure) ══
ok('countdown: 42s · 11m 42s · 2h 05m · 3d 04h', V.countdown(42000) === '42s' && V.countdown(702000) === '11m 42s' && V.countdown(7500000) === '2h 05m' && V.countdown(273600000) === '3d 04h' && V.countdown(-5) === '0s');
const H1 = V.hud({ armed: true, slots: [1, 3], ping: 4.4, dayPnl: -120, cap: 500 });
ok('HUD: LIVE ARMED · Slot 1,3 · 4 ms · Day -$120 vs -$500 cap', H1.text === 'LIVE ARMED · Slot 1,3 · 4 ms · Day -$120 vs -$500 cap' && H1.level === 'ok', H1.text + ' ' + H1.level);
ok('HUD: crit at ≥ 80% of the cap, warn without a ping, paper when disarmed', V.hud({ armed: true, slots: [1], ping: 3, dayPnl: -410, cap: 500 }).level === 'crit' && V.hud({ armed: true, slots: [1], ping: 0, dayPnl: 0, cap: 500 }).level === 'warn' && V.hud({ armed: false }).level === 'paper');
const SP = V.spark([100, 110, 99, 105], 168, 44);
ok('sparkline: 44px geometry, drawdown from peak 110 → 99 = 10%', SP.pts.length === 4 && near(SP.dd, 11) && near(SP.ddPct, 10) && SP.pts.every(([x, y]) => x >= 0 && x <= 168 && y >= 0 && y <= 44) && SP.up === true && V.spark([1], 10, 10) === null);
const mon = Date.UTC(2026, 10, 16, 18, 0, 0); // Monday 13:00 New York (EST)
ok('countdown pill: US close in 3h on a Monday 13:00 NY', (() => { const e = V.nextEvent(mon, 'stock'); return e.name === 'US close' && Math.abs(e.left - 3 * 3600000) < 2000; })());
ok('countdown pill: Saturday → next US open on Monday 09:30 NY', (() => { const sat = Date.UTC(2026, 10, 21, 18, 0, 0), e = V.nextEvent(sat, 'stock'); return e.name === 'US open' && V.ny(e.at).wd === 'Mon' && Math.abs(V.ny(e.at).min - 570) < 0.1; })());
ok('countdown pill: crypto → next 8-hourly funding, on-chain → none', (() => { const e = V.nextEvent(Date.UTC(2026, 10, 16, 5, 0, 0), 'crypto'); return e.name === 'Funding' && e.left === 3 * 3600000 && V.nextEvent(mon, 'onchain') === null; })());
ok('Pause New Entries: blocks a live opening order, never an exit', !V.pauseCheck({ action: 'buy' }, true).ok && V.pauseCheck({ action: 'buy' }, true).status === 'paused' && V.pauseCheck({ action: 'sell' }, true).ok && V.pauseCheck({ action: 'buy', reduce: true }, true).ok && V.pauseCheck({ action: 'buy' }, false).ok);
ok('cooldown label inside the Buy button: Cooldown: 11m 42s', V.cooldownLabel(1e6 + 702000, 1e6) === 'Cooldown: 11m 42s' && V.cooldownLabel(5, 10) === null && V.cooldownLabel(0, 10) === null);
const POS = [{ sym: 'A', qty: 2, entry: 100, side: 'long' }, { sym: 'B', qty: 4, entry: 50, side: 'short' }, { sym: 'C', qty: 1, entry: 10, side: 'long' }], PX = { A: 90, B: 40, C: 12 };
ok('drawer: Close 50% halves, Flatten closes all', V.drawerPlan(POS, 'half', PX).map((x) => x.qty).join() === '1,2,0.5' && V.drawerPlan(POS, 'flat', PX).map((x) => x.qty).join() === '2,4,1');
ok('drawer: Close Losing Legs / Close Green Legs respect short P&L', V.drawerPlan(POS, 'losers', PX).map((x) => x.sym).join() === 'A' && V.drawerPlan(POS, 'winners', PX).map((x) => x.sym).join() === 'B,C');
const PY = V.pyramid(2, 100, 0.5, 110);
ok('pyramid ghost: add 50% @ 110 → blended 103.33', near(PY.add, 1) && near(PY.blended, 310 / 3) && near(PY.usd, 110) && V.pyramid(0, 1, 1, 1) === null);
ok('fee & funding drag line: 0.1% fee ×2 + 0.01%/8h × 24h', near(V.carryLine(100, 'long', 0.001, 0.0001, 24), 100 * (1 + 0.002 + 0.0003)) && near(V.carryLine(100, 'short', 0.001, 0, 0), 99.8));
ok('Chase Limit: peg buy → best bid, sell → best ask, 1 tick inside when room', V.chase('buy', 100, 101, 0.01) === 100 && V.chase('sell', 100, 101, 0.01) === 101 && near(V.chase('buy', 100, 101, 0.01, true), 100.01) && near(V.chase('sell', 100, 101, 0.01, true), 100.99) && V.chase('buy', 100, 100.01, 0.01, true) === 100 && V.chase('buy', 0, 1) === null);
ok('liquidation: 10× long ≈ entry × (1 − 0.1 + mmr), short mirrors, spot has none', near(V.liq(100, 10, 'long', 0.005), 90.5) && near(V.liq(100, 10, 'short', 0.005), 109.5) && V.liq(100, 1, 'long') === null);
ok('margin buffer pill: warns under 15%', V.liqBuffer(100, 90.5).warn === true && near(V.liqBuffer(100, 90.5).pct, 9.5) && V.liqBuffer(100, 70).warn === false);
const up = Array.from({ length: 80 }, (_, i) => 100 - i * 0.5).concat(Array.from({ length: 30 }, (_, i) => 60 + i * 3));
ok('readiness dot: ready on a fresh EMA 20/50 cross, idle on short history', (() => { for (let n = 60; n <= up.length; n++) if (V.readiness(up.slice(0, n)) === 'ready') return true; return false; })() && V.readiness([1, 2, 3]) === 'idle' && V.readiness(Array(80).fill(10)) === 'near');
ok('Copy Trade Setup: LONG BTC @ 100 · SL 98 · TP 106 · R:R 3.00 · risk $50.00', V.setupText({ sym: 'btc', side: 'long', entry: 100, sl: 98, tp: 106, risk: 50, tf: '5m' }) === 'LONG BTC @ 100 · SL 98 · TP 106 · R:R 3.00 · risk $50.00 · 5m · ExTerm');
const MC = V.maskCard({ sym: 'ETH-USD', price: 110, qty: 1, usd: 110, pnl: 10, pnlPct: 0.1, held: 125000, reason: 'take-profit' }, 95);
ok('privacy-masked trade card: % + R + held only, no $ size or quantity', MC.result === '+10.00%' && MC.r === '+2.00R' && MC.held === '2m 05s' && MC.title === 'ETH · LONG closed' && !/\$|qty|110/.test(JSON.stringify(MC)));
ok('fill callback: parsed only when ack matches the idempotency key', (() => { const f = V.parseFill({ ack: 'k1', fill: { price: '100.5', qty: 2, ts: 5, order_id: 'ab<x>1' } }, 'k1'); return f && f.price === 100.5 && f.qty === 2 && f.ts === 5 && f.id === 'abx1' && V.parseFill({ ack: 'k2', fill: { price: 1, qty: 1 } }, 'k1') === null && V.parseFill({ ack: 'k1', fill: { price: -1, qty: 1 } }, 'k1') === null && V.parseFill({ ack: 'k1' }, 'k1') === null; })());
ok('fill quality by symbol: avg bps + avg ACK ms', (() => { const m = {}; V.qAdd(m, 'btc', 2, 10); V.qAdd(m, 'BTC', -1, 20); V.qAdd(m, 'ETH', 4, null); const s = V.qSummary(m); return s[0].sym === 'BTC' && s[0].n === 2 && near(s[0].bps, 0.5) && near(s[0].ack, 15) && s[1].ack === null; })());
ok('bot position sync: signed fill quantity for long / short opens and closes', V.signedQty(undefined, 'buy', 2) === 2 && V.signedQty(undefined, 'sell', 2) === -2 && V.signedQty('short', 'buy', 2) === -2 && V.signedQty('short', 'sell', 2) === 2);
ok('heartbeat graph stats: success % and avg latency of answered packets', (() => { const s = V.hbStats([{ ok: true, ms: 4 }, { ok: true, ms: 6 }, { ok: false, ms: 0 }, { ok: true, ms: 8 }]); return s.n === 4 && s.okPct === 75 && s.avgMs === 6 && V.hbStats([]).okPct === null; })());
ok('per-slot allowlist: parse, empty = any, base symbol match', V.allowParse(' btc, eth;NVDA  btc <x>') .join() === 'BTC,ETH,NVDA,X' && V.allowOk('', 'DOGE-USD') && V.allowOk('BTC, ETH', 'eth-usd') && !V.allowOk(['BTC'], 'ETH-USD'));
ok('time-in-trade auto-exit timer', V.timeExitDue(0 + 1, 1 + 30 * 60000, 30) && !V.timeExitDue(1, 1 + 29 * 60000, 30) && !V.timeExitDue(1, 1e12, 0));
ok('conditional trigger: fires once on the cross, not while already beyond', V.trigCross({ op: '>=', level: 100 }, 99, 100) && !V.trigCross({ op: '>=', level: 100 }, 101, 102) && V.trigCross({ op: '<=', level: 50 }, 51, 49) && !V.trigCross({ op: '<=', level: 50 }, 0, 49));
ok('conditional trigger: validator rejects bad rules', V.trigOk({ sym: 'BTC-USD', op: '>=', level: 1, action: 'buy', usd: 5 }) && !V.trigOk({ sym: 'BTC-USD', op: '>', level: 1, action: 'buy', usd: 5 }) && !V.trigOk({ sym: '<x>', op: '>=', level: 1, action: 'sell' }) && !V.trigOk({ sym: 'A', op: '>=', level: 1, action: 'buy', usd: 0 }));
ok('EOD Flat Timer: due in the last N minutes of a weekday session only', V.eodDue(Date.UTC(2026, 10, 16, 20, 55, 0), 10) && !V.eodDue(Date.UTC(2026, 10, 16, 20, 45, 0), 10) && !V.eodDue(Date.UTC(2026, 10, 21, 20, 55, 0), 10) && !V.eodDue(Date.UTC(2026, 10, 16, 20, 55, 0), 0));
ok('Two-Key Arming: Shift + Alt + A turns key 1; Arm within 10 s', V.twoKey({ shiftKey: true, altKey: true, code: 'KeyA' }) && !V.twoKey({ shiftKey: true, code: 'KeyA' }) && !V.twoKey({ shiftKey: true, altKey: true, ctrlKey: true, key: 'A' }) && V.twoKeyOk(1000, 9000) && !V.twoKeyOk(1000, 12001) && !V.twoKeyOk(0, 10));
const SC = V.selfCheck({ slots: 2, hbOk: 2, hbMs: 12, requireSL: true, maxLoss: 500, quoteOk: true, spreadOk: true });
ok('3-Second Live Readiness Self-Check: READY when all 7 pass, NOT READY otherwise', SC.ready && SC.rows.length === 7 && SC.passed === 7 && !V.selfCheck({ slots: 2, hbOk: 1, requireSL: true, maxLoss: 500, quoteOk: true }).ready && !V.selfCheck({ slots: 1, hbOk: 1, requireSL: false, maxLoss: 500, quoteOk: true }).ready && !V.selfCheck({}).ready);
ok('Reset Session Safety Counters: only when disarmed (PAPER)', V.canReset('paper') && !V.canReset('live'));
ok('starter bridges: Interactive Brokers, Alpaca, CCXT, Freqtrade, each ≈ 40 lines, loopback only, verifies signature + replies ack + fill', ['ibkr', 'alpaca', 'ccxt', 'freqtrade'].every((k) => { const t = V.bridge(k), n = t.trim().split('\n').length; return n >= 34 && n <= 52 && /HTTPServer\(\("127\.0\.0\.1"/.test(t) && /compare_digest/.test(t) && /ExTerm-session-v2\|/.test(t) && /"ack": p\["idempotency_key"\]/.test(t) && /out\["fill"\] = execute/.test(t) && /def flatten/.test(t) && /EXTERM_SLOT_SECRET/.test(t); }), ['ibkr', 'alpaca', 'ccxt', 'freqtrade'].map((k) => k + ':' + V.bridge(k).trim().split('\n').length).join());
ok('starter bridges: no hard-coded API keys, secrets read from the environment', ['ibkr', 'alpaca', 'ccxt', 'freqtrade'].every((k) => /os\.environ/.test(V.bridge(k)) && !/sk_live|api_key\s*=\s*"[A-Za-z0-9]{12,}/i.test(V.bridge(k))));
ok('cockpit settings: defaults, clamping and trigger sanitising', (() => { const d = V.cload('{bad'); const c = V.cload({ paused: true, lev: 999, eodMin: 7, titMin: -3, allow: { 1: 'btc eth', 9: 'x' }, triggers: [{ sym: 'BTC-USD', op: '>=', level: 5, action: 'buy', usd: 10 }, { sym: '<x>', op: '>=', level: 5, action: 'buy', usd: 10 }] }); return d.paused === false && d.twoKey === false && c.paused && c.lev === 1 && c.eodMin === 0 && c.titMin === 0 && c.allow[1] === 'BTC, ETH' && !('9' in c.allow) && c.triggers.length === 1 && c.triggers[0].sl === 2; })());
ok('highlights: the briefing lists the v16.3 cockpit', V.HIGHLIGHTS.length >= 6 && V.HIGHLIGHTS.some((x) => /HUD/.test(x)) && V.HIGHLIGHTS.some((x) => /Freqtrade/.test(x)) && V.HIGHLIGHTS.some((x) => /Require Stop-Loss/.test(x)));
ok('static: cockpit wired into the v16.0 router (pre guard, ACK + fill post, heartbeat listener, manual short book)', /b\.pre\.unshift\(guard\)/.test(ui) && /b\.post\.push\(onAck\)/.test(ui) && /b\.hbL\.push\(onHb\)/.test(ui) && /b\.manual\.push\(C\.sh\)/.test(ui) && /for \(const f of U\.post\)/.test(v160) && /for \(const f of U\.hbL\)/.test(v160) && /U\.manual\.includes\(acct\)/.test(v160));
ok('static: Reset Session Safety Counters is disabled while armed and checks canReset', /data-v163a="reset"\$\{L \? ' disabled/.test(ui) && /V163\.canReset\(b\.st\.mode\)/.test(ui));
ok('static: Two-Key Arming intercepts the arm button in the capture phase', /addEventListener\('click', onArmClick, true\)/.test(ui) && /stopImmediatePropagation/.test(ui));
ok('static: briefing shows the v16.3 highlights', /V163\.HIGHLIGHTS/.test(src('v162.js')));
ok('CSS: cockpit styles (HUD, drawer, micro-ticket, dots, RTL mirror)', ['.v163-hud', '.v163-drawer', '.v163-mstrip', '.v163-dot', 'html[dir="rtl"] .v163-hud', 'body.live-bot-armed #tab-markets .tape'].every((k) => css.includes(k)));
(async () => {
  const blob = await V.seal({ a: 1, s: 'x' }, 'correct horse'), o = JSON.parse(blob);
  const back = await V.unseal(blob, 'correct horse'); let wrong = ''; try { await V.unseal(blob, 'wrong passphrase'); } catch (e) { wrong = e.message; }
  let tamper = ''; try { const t = JSON.parse(blob); t.c = t.c.slice(0, -4) + (t.c.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'); await V.unseal(JSON.stringify(t), 'correct horse'); } catch (e) { tamper = e.message; }
  let short = ''; try { await V.seal({}, 'short'); } catch (e) { short = e.message; }
  ok('encrypted snapshot: AES-256-GCM round-trip, wrong passphrase and tampering rejected, plaintext never stored', back.a === 1 && back.s === 'x' && /wrong passphrase/.test(wrong) && /wrong passphrase|tampered/.test(tamper) && /8 characters/.test(short) && o.alg === 'PBKDF2-SHA256-200k/AES-256-GCM' && !blob.includes('"s":"x"') && !/correct horse/.test(blob));
  const fails = res.filter((r) => r.startsWith('FAIL'));
  console.log(res.join('\n')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
})();
