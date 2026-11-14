// v14 unit tests: data-quality check, risk of ruin, multi-timeframe trend, P&L calendar, version compare, welcome-back
// summary, keyboard map, and the HTTP client's per-host pacing / de-duplication / 429 cool-down (data.js in a sandbox).
const V14 = require('../src/v14core.js');
const vm = require('vm'), fs = require('fs'), path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 240)));
const bars = (n, step = 3600, t0 = 1700000000) => Array.from({ length: n }, (_, i) => { const c = 100 + Math.sin(i / 7) * 5 + i * 0.05; return { t: t0 + i * step, o: c - 0.2, h: c + 0.5, l: c - 0.6, c, v: 10 + (i % 5) }; });

/* ── data quality ── */
{
  const clean = V14.dataQuality(bars(500), 3600);
  ok('clean data grades A with no issues', clean.grade === 'A' && !clean.issues.length && clean.n === 500, JSON.stringify(clean));
  const g = bars(300); g.splice(100, 24); const q = V14.dataQuality(g, 3600);
  ok('a 24-bar hole is one gap with 24 missing bars', q.gaps === 1 && q.missingBars === 24 && q.maxGapBars === 24, JSON.stringify(q));
  const d = bars(200); d.splice(50, 0, Object.assign({}, d[50])); const dq = V14.dataQuality(d, 3600);
  ok('duplicate timestamps are caught', dq.dupes === 1 && dq.grade !== 'A');
  const u = bars(200); [u[80], u[81]] = [u[81], u[80]]; ok('out-of-order bars are caught', V14.dataQuality(u, 3600).unordered === 1);
  const b = bars(200); b[10].h = b[10].c - 5; b[11].c = 0; b[12].o = NaN; const bq = V14.dataQuality(b, 3600);
  ok('impossible prices are counted', bq.badBars === 3 && bq.issues.some((x) => /impossible/.test(x.text)));
  const f = bars(200); for (let i = 60; i < 90; i++) f[i] = { t: f[i].t, o: 50, h: 50, l: 50, c: 50, v: 0 }; f[59].c = 50;
  ok('a frozen feed (no movement for 20+ bars) is flagged', V14.dataQuality(f, 3600).flatRun >= 20);
  const z = bars(100).map((c) => Object.assign(c, { v: 0 })); ok('mostly zero volume is flagged', V14.dataQuality(z, 3600).issues.some((x) => /volume/.test(x.text)));
  ok('empty / invalid input grades F without throwing', V14.dataQuality([], 60).grade === 'F' && V14.dataQuality(null, 60).grade === 'F');
  const many = bars(300); many.splice(10, 2); many.splice(50, 0, Object.assign({}, many[50])); [many[90], many[91]] = [many[91], many[90]];
  ok('several serious problems grade F', V14.dataQuality(many, 3600).grade === 'F');
}

/* ── risk of ruin ── */
{
  ok('fewer than 5 trades gives no estimate', V14.riskOfRuin([0.01, 0.02]).ruinPct === null);
  const safe = Array.from({ length: 40 }, (_, i) => (i % 3 ? 0.02 : -0.01));
  const r1 = V14.riskOfRuin(safe, { ddLimit: 50, sims: 2000 });
  ok('a steady winner has ~0% risk of ruin', r1.ruinPct < 1 && r1.sims === 2000, JSON.stringify(r1));
  const bad = Array.from({ length: 40 }, (_, i) => (i % 3 ? -0.08 : 0.06));
  const r2 = V14.riskOfRuin(bad, { ddLimit: 50, sims: 2000 });
  ok('a big loser has a very high risk of ruin', r2.ruinPct > 90, JSON.stringify(r2));
  ok('seeded: same input gives the same answer', JSON.stringify(V14.riskOfRuin(safe, { seed: 3 })) === JSON.stringify(V14.riskOfRuin(safe, { seed: 3 })));
  const mid = Array.from({ length: 40 }, (_, i) => (i % 2 ? 0.05 : -0.045)), r3 = V14.riskOfRuin(mid, { ddLimit: 30 }), r4 = V14.riskOfRuin(mid, { ddLimit: 60 });
  ok('a tighter drawdown limit is hit more often', r3.ruinPct > r4.ruinPct, r3.ruinPct + ' vs ' + r4.ruinPct);
  ok('drawdown percentiles are ordered', r3.p95DD >= r3.medianDD && r3.medianDD > 0);
  ok('junk returns are ignored and -100% is capped', V14.riskOfRuin([0.1, NaN, 'x', -5, 0.1, 0.1, 0.1, 0.1]).n === 6);
  ok('sims are clamped to a safe range', V14.riskOfRuin(safe, { sims: 1e9 }).sims === 20000 && V14.riskOfRuin(safe, { sims: 3 }).sims === 100);
}

/* ── multi-timeframe trend ── */
{
  const up = Array.from({ length: 120 }, (_, i) => ({ c: 100 * Math.pow(1.004, i) + Math.sin(i) * 0.1 }));
  const dn = Array.from({ length: 120 }, (_, i) => ({ c: 100 * Math.pow(0.996, i) + Math.sin(i) * 0.1 }));
  const fl = Array.from({ length: 120 }, (_, i) => ({ c: 100 + Math.sin(i / 2) * 0.05 }));
  ok('rising series reads up', V14.mtfTrend(up).dir === 'up', JSON.stringify(V14.mtfTrend(up)));
  ok('falling series reads down', V14.mtfTrend(dn).dir === 'down');
  ok('sideways series reads flat', V14.mtfTrend(fl).dir === 'flat', JSON.stringify(V14.mtfTrend(fl)));
  ok('too little history is n/a', V14.mtfTrend(up.slice(0, 30)).dir === 'n/a');
  ok('summary wording', V14.mtfSummary([{ dir: 'up' }, { dir: 'up' }]) === 'All timeframes up' && V14.mtfSummary([{ dir: 'up' }, { dir: 'down' }]) === 'Mixed: no clear trend' && V14.mtfSummary([{ dir: 'down' }, { dir: 'down' }, { dir: 'up' }]) === 'Mostly down');
  ok('RSI of a straight rise is 100', V14.mtfTrend(Array.from({ length: 80 }, (_, i) => ({ c: 100 + i }))).rsi === 100);
}

/* ── P&L calendar ── */
{
  const dk = (ts) => new Date(ts).toISOString().slice(0, 10), T = (d, h = 12) => Date.UTC(2026, 10, d, h);
  const E = [{ side: 'sell', pnl: 50, ts: T(3) }, { side: 'sell', pnl: -20, ts: T(3, 15) }, { side: 'sell', pnl: -40, ts: T(9) }, { side: 'buy', pnl: null, ts: T(9) }, { side: 'sell', pnl: 99, ts: Date.UTC(2026, 9, 31) }, { side: 'sell', pnl: 'x', ts: T(4) }, null];
  const C = V14.calendar(E, 2026, 10, dk);
  ok('a month has the right number of days', C.days.length === 30 && C.days[0].key === '2026-11-01');
  ok('same-day trades are summed', C.days[2].pnl === 30 && C.days[2].n === 2 && C.days[2].w === 1);
  ok('buys, junk and other months are ignored', C.n === 3 && Math.abs(C.total - -10) < 1e-9);
  ok('best / worst / green / red days', C.best.key === '2026-11-03' && C.worst.key === '2026-11-09' && C.green === 1 && C.red === 1);
  ok('week starts on the right weekday (1 Nov 2026 is a Sunday)', C.startDow === 0);
  ok('February in a leap year has 29 days', V14.calendar([], 2028, 1, dk).days.length === 29);
}

/* ── version compare ── */
ok('13.10 is newer than 13.9', V14.newer('13.10', '13.9'));
ok('v14.0 equals 14', !V14.newer('v14.0', '14') && !V14.newer('14', 'v14.0'));
ok('older is not newer', !V14.newer('13.1', '14.0'));
ok('junk versions are never newer', !V14.newer('<script>', '1.0') && !V14.newer('99.0.0.0.0', '1.0') && !V14.newer(null, '1'));

/* ── welcome back ── */
{
  const last = { ts: 1e12, px: { 'BTC-USD': 100, 'ETH-USD': 50, 'X': 0, 'Y': 10 }, eq: 1000, jn: 5 };
  const a = V14.away(last, { ts: 1e12 + 3 * 3600e3, px: { 'BTC-USD': 110, 'ETH-USD': 49, 'Y': 10 }, eq: 1100, jn: 9 });
  ok('away summary: time, biggest movers first, equity and new trades', a && a.awayMs === 3 * 3600e3 && a.movers[0].sym === 'BTC-USD' && Math.abs(a.movers[0].ch - 10) < 1e-9 && a.movers.length === 3 && a.eqCh === 100 && a.newTrades === 4, JSON.stringify(a));
  ok('a short absence shows nothing', V14.away(last, { ts: 1e12 + 60000, px: {} }) === null);
  ok('missing snapshot shows nothing', V14.away(null, { ts: 1 }) === null && V14.away({ ts: 'x' }, { ts: 1e13 }) === null);
  ok('away formatting', V14.fmtAway(45 * 60000) === '45m' && V14.fmtAway(185 * 60000) === '3h 5m' && V14.fmtAway(5 * 864e5) === '5 days');
}

/* ── keyboard map ── */
ok('number keys pick timeframes', JSON.stringify(V14.keyAction({ key: '3' })) === '{"a":"tf","i":2}');
ok('letters map to actions, case-insensitive', V14.keyAction({ key: 'B' }).a === 'buy' && V14.keyAction({ key: 's' }).a === 'sell' && V14.keyAction({ key: '?' }).a === 'help');
ok('modifier combos and other keys are ignored', V14.keyAction({ key: 'b', ctrlKey: true }) === null && V14.keyAction({ key: '0' }) === null && V14.keyAction({ key: 'x' }) === null);
ok('every shortcut has a description', V14.SHORTCUTS.length >= 10 && V14.SHORTCUTS.every(([k, d]) => k && d));

/* ── HTTP client pacing (data.js in a sandbox with a fake fetch and a fake clock) ── */
(async () => {
  let now = 1e12, calls = [], mode = 'ok';
  const sb = { console, URL, AbortController, setTimeout: (f, ms) => { now += ms; return setTimeout(f, 0); }, clearTimeout: () => {}, Date: { now: () => now },
    document: { querySelector: () => null }, location: { protocol: 'https:' }, localStorage: { getItem: () => null, setItem: () => {} }, sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (url) => { calls.push(url); if (mode === '429') return { ok: false, status: 429, text: async () => '{"error":"rate limit exceeded"}' }; return { ok: true, status: 200, json: async () => ({ url }), text: async () => '' }; } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8').split('\nconst CB = {')[0] + '\nthis.J = J; this.sleep = sleep;', sb);
  const J = sb.J; J.proxy = true; J.relayFirst = () => false;
  ok('DexScreener list endpoints get the strict budget', J.limitFor('https://api.dexscreener.com/token-profiles/latest/v1').rpm === 50 && J.limitFor('https://api.dexscreener.com/latest/dex/pairs/solana/x').rpm === 240);
  ok('other hosts are not paced here', J.limitFor('https://api.geckoterminal.com/api/v2/x') === null && J.limitFor('not a url') === null);
  const u = 'https://api.dexscreener.com/latest/dex/pairs/solana/abc';
  const [a, b, c] = await Promise.all([J.get(u), J.get(u), J.get(u)]);
  ok('identical requests in flight share one call', calls.length === 1 && a.url === b.url && b === c, calls.length);
  calls = []; for (let i = 0; i < 40; i++) await J.get('https://api.dexscreener.com/token-profiles/latest/v1?i=' + i);
  ok('a burst on a 50/min endpoint is spread out (not sent at once)', calls.length === 40 && now - 1e12 > 25000, (now - 1e12) + 'ms');
  mode = '429'; let err = null; try { await J.get(u + '?z=1'); } catch (e) { err = e; }
  ok('a 429 becomes a short readable rate error', err && err.rate === true && /free limit reached/.test(err.message) && !/rate limit exceeded/.test(err.message), err && err.message);
  calls = []; let err2 = null; try { await J.get(u + '?z=2'); } catch (e) { err2 = e; }
  ok('during the cool-down nothing is sent', err2 && err2.rate && calls.length === 0, calls.length);
  mode = 'ok'; now += 20000; const r = await J.get(u + '?z=3');
  ok('after the cool-down requests go through again', r && r.url.endsWith('z=3') && J._cool['api.dexscreener.com#n'] === 0);
  console.log(res.join('\n')); const n = res.filter((x) => x.startsWith('PASS')).length; console.log(`${n}/${res.length} passed`); process.exit(n === res.length ? 0 : 1);
})().catch((e) => { console.log(res.join('\n')); console.log('CRASH', e.message); process.exit(1); });
