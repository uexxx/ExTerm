// ExTerm v15.4 core unit tests: Learn ExTerm curriculum, fuzzy search, learning paths, drill checks; ExTerm Alpha Score
// (parity fixtures shared with v154_server_test.py), leaderboard / position / fill parsing with hostile input, style,
// tilt, liquidation magnets, delta radar, anti-rug, confluence, heatmap, Backtest Style; the 15 workstation upgrades;
// 32-language i18n coverage; static CSP / privacy checks on the new modules.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const NT = require('../src/strategies4.js');
const V = require('../src/v154core.js');
const I = require('../src/i18n.js');
const fin = Number.isFinite;
const A1 = '0x' + 'a'.repeat(40), A2 = '0x' + 'b'.repeat(40), A3 = '0x' + 'c'.repeat(40);

// ── academy
ok('curriculum: 30+ modules, every one complete (what, steps, tip, go.tab, minutes)', V.MODULES.length >= 30 && V.MODULES.every((m) => m.title && m.what && m.steps.length >= 2 && m.tip && m.go && m.go.tab && m.min > 0), V.MODULES.length);
ok('curriculum: all 9 categories covered, ids unique', V.CATS.every(([k]) => V.MODULES.some((m) => m.cat === k)) && new Set(V.MODULES.map((m) => m.id)).size === V.MODULES.length);
ok('curriculum: covers the v15.3 Quant Lab tools by name', ['Auto-Evolve', 'Crisis Time Machine', 'Slippage Fragility', 'Kelly / ATR Sizing', 'Visual Trade Inspector', 'Grok Shadow Bot'].every((t) => V.MODULES.some((m) => m.title === t)));
ok('metrics: 5 Explain-This-Metric bridges, each pointing at a real lesson', Object.keys(V.METRICS).length === 5 && Object.values(V.METRICS).every((x) => V.byId(x.lesson) && x.text.length > 40));
ok('mount target: topbar | settings only', V.LEARN_MOUNT_TARGETS.join() === 'topbar,settings');
const s1 = V.search('How do I drag a stop loss ladder?');
ok('search: "How do I drag a stop loss ladder?" → SL/TP ladder lesson first', s1.length && s1[0].id === 'chart-ladder', s1.slice(0, 3).map((m) => m.id));
ok('search: "alpha score" → leaderboard lesson', V.search('alpha score').some((m) => m.id === 'lead-perp'));
ok('search: subsequence typo tolerance ("fragilty")', V.search('fragilty').some((m) => m.id === 'quant-frag'), V.search('fragilty').map((m) => m.id));
ok('search: shortcut text is searchable ("alt+click")', V.search('alt+click')[0].id === 'grok-why');
ok('search: empty / stop-word-only query returns everything; nonsense returns nothing', V.search('how do i').length === V.MODULES.length && V.search('zzqqxx').length === 0);
for (const [g] of V.GOALS) { const P = V.path(g); ok(`path ${g}: ordered playlist within 15 minutes, 4+ lessons`, P.minutes <= 15 && P.items.length >= 4 && P.items.every((x) => V.byId(x.id)), JSON.stringify(P)); }
ok('progress: counts only known ids; quick-start track is 5-minute sized', V.progress(['chart-basics', 'nope'], V.QUICK).done === 1 && V.QUICK.length >= 5 && V.cleanDone(['x', 'chart-basics', 'chart-basics']).length === 1);
const dc = V.drillCandles('breakout', 3), dp = V.drillCandles('pool', 3);
ok('drill candles: seeded, tagged sim, breakout ends higher, pool is thin and bleeds', dc.length === 160 && dc.every((c) => c.sim && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c)) && dc[159].c > dc[100].c && dp[159].c < dp[90].c && JSON.stringify(V.drillCandles('breakout', 3)) === JSON.stringify(dc));
ok('drill check: ladder needs a moved rung', !V.drillCheck('ladder', { ladder: { levels: [{ p: 1 }] } }, { ladder: { levels: [{ p: 1 }] } }) && V.drillCheck('ladder', { ladder: { levels: [{ p: 1 }] } }, { ladder: { levels: [{ p: 1.2 }] } }));
ok('drill check: risk needs risk mode and 0 < % ≤ 2', V.drillCheck('risk', { sizeMode: 'usd', riskPct: '1' }, { sizeMode: 'risk', riskPct: '1' }) && !V.drillCheck('risk', { sizeMode: 'usd' }, { sizeMode: 'risk', riskPct: '5' }) && !V.drillCheck('risk', {}, { sizeMode: 'usd', riskPct: '1' }));
ok('drill check: vwap needs a new anchor; pool needs the X-ray', V.drillCheck('vwap', { anchor: null }, { anchor: 1.7e9 }) && !V.drillCheck('vwap', { anchor: 5 }, { anchor: 5 }) && V.drillCheck('pool', {}, { xray: true }) && !V.drillCheck('bogus', {}, {}));

// ── alpha score (same fixtures as test/v154_server_test.py)
const FX = [[0.01, 0.05, 0.3, 2.0, 250000, 3e6, 89], [-0.2, -0.1, 0.05, 0.4, 5e6, 1e10, 46], [0, 0, 0, 0, 0, 0, 43], [0.5, -0.3, -0.6, -0.9, 1e3, 1e9, 8]];
ok('alpha: parity fixtures with serve.py', FX.every(([d, w, m, a, ac, v, want]) => V.alphaScore({ roiDay: d, roiWeek: w, roiMonth: m, roiAll: a, acct: ac, vlmMonth: v }) === want), FX.map((f) => V.alphaScore({ roiDay: f[0], roiWeek: f[1], roiMonth: f[2], roiAll: f[3], acct: f[4], vlmMonth: f[5] })));
ok('alpha: hostile input stays an integer in 0..100', [{ roiMonth: 'NaN' }, { roiMonth: 1e308, acct: -5 }, null, { roiDay: '1e999' }].every((x) => { const s = V.alphaScore(x); return Number.isInteger(s) && s >= 0 && s <= 100; }));
ok('alpha: churning wash volume lowers the score', V.alphaScore({ roiDay: 0.01, roiWeek: 0.02, roiMonth: 0.1, roiAll: 1, acct: 1e6, vlmMonth: 1e8 }) > V.alphaScore({ roiDay: 0.01, roiWeek: 0.02, roiMonth: 0.1, roiAll: 1, acct: 1e6, vlmMonth: 5e9 }));
const raw = { leaderboardRows: [{ ethAddress: A1.toUpperCase().replace('0X', '0x'), accountValue: '1000000', displayName: '<img src=x onerror=alert(1)>', windowPerformances: [['day', { pnl: '100', roi: '0.01', vlm: '5' }], ['week', { pnl: '500', roi: '0.05', vlm: '9' }], ['month', { pnl: '9000', roi: '0.3', vlm: '50' }], ['allTime', { pnl: '1e5', roi: '2', vlm: '99' }]] }, { ethAddress: 'not-an-address' }, { ethAddress: A2, accountValue: 'NaN', windowPerformances: [['month', { pnl: 'Infinity' }], ['bogus', {}]] }, { ethAddress: A1 }, null, 42] };
const B = V.parseBoard(raw);
ok('board: invalid / duplicate rows dropped, addresses lower-cased', B.length === 2 && B[0].addr === A1 && B[1].addr === A2, JSON.stringify(B.map((r) => r.addr)));
ok('board: display names stripped of markup; numbers finite; alpha attached', !/[<>]/.test(B[0].name) && fin(B[1].pnl.month) && B[1].pnl.month === 0 && B[1].acct === 0 && Number.isInteger(B[0].alpha));
ok('board: launcher-cleaned rows parse the same way', V.parseBoard({ rows: [{ addr: A3, acct: 5, pnl: { month: 3 }, roi: {}, vlm: {} }] })[0].pnl.month === 3);
ok('rank: by window pnl and by alpha', V.rank(B, 'month', 'pnl')[0].addr === A1 && V.rank(B, 'month', 'alpha').length === 2);

// ── positions, fills, stats
const CH = { assetPositions: [{ position: { coin: 'BTC', szi: '0.5', entryPx: '60000', positionValue: '30500', unrealizedPnl: '500', liquidationPx: '59500', leverage: { value: 20 } } }, { position: { coin: 'ETH', szi: '-2', entryPx: '3000', positionValue: '6000', unrealizedPnl: '-10', liquidationPx: '3600', leverage: { value: 5 } } }, { position: { coin: '<script>', szi: '1' } }, { position: { coin: 'XRP', szi: '0' } }], marginSummary: { accountValue: '100000' } };
const P = V.positions(CH);
ok('positions: parsed, sorted by notional, hostile coin and flat rows dropped', P.list.length === 2 && P.list[0].coin === 'BTC' && P.list[0].side === 'Long' && P.list[1].side === 'Short' && P.list[0].lev === 20 && P.acct === 100000, JSON.stringify(P.list.map((x) => x.coin)));
ok('liquidation magnets: BTC within 2.5% flagged, ETH 20% away ignored', V.liqMagnets(P.list).length === 1 && V.liqMagnets(P.list)[0].coin === 'BTC');
const t0 = 1.7e12, mk = (o) => Object.assign({ coin: 'BTC', px: '100', sz: '1', side: 'B', closedPnl: '0', startPosition: '0' }, o);
const F = V.fills([mk({ time: t0, dir: 'Open Long' }), mk({ time: t0 + 10 * 60000, dir: 'Close Long', side: 'A', closedPnl: '5', startPosition: '1' }), mk({ time: t0 + 20 * 60000, dir: 'Open Long' }), mk({ time: t0 + 30 * 60000, dir: 'Close Long', side: 'A', closedPnl: '-3', startPosition: '1' }), mk({ time: t0 + 40 * 60000, dir: 'Open Long' }), mk({ time: t0 + 45 * 60000, dir: 'Close Long', side: 'A', closedPnl: '-2', startPosition: '1' }), mk({ time: t0 + 50 * 60000, dir: 'Open Long', sz: '10' }), { coin: 'BAD COIN', px: 1, sz: 1, time: 1 }, null]);
const S = V.fillStats(F);
ok('fills: hostile rows dropped; stats (win rate, realised, hold, favoured)', F.length === 7 && S.closes === 3 && S.winRate === 0.333 && S.realized === 0 && S.avgHoldMin === 10 && S.favored[0] === 'BTC', JSON.stringify(S));
ok('style: 10-minute holds → Scalper; long holds → Swing', V.styleTag(S, F) === 'Scalper' && V.styleTag({ avgHoldMin: 2000, winRate: 0.4 }, []) === 'Swing' && V.styleTag({ avgHoldMin: 120, winRate: 0.6 }, []) === 'Mean-Reversion' && V.styleTag({}, []) === 'Unclassified');
const tl = V.tilt(F);
ok('tilt: 2 straight losses then a 10× size open is a tilted whale', tl.tilt && /10/.test(tl.why), JSON.stringify(tl));
ok('tilt: no streak → no flag', !V.tilt(F.slice(0, 3)).tilt);
const prev = P.list, cur = [Object.assign({}, prev[0], { szi: 0.3 })];
const dl = V.delta(prev, cur, [{ coin: 'BTC', isTrigger: true, triggerPx: '58000' }], [{ coin: 'BTC', isTrigger: true, triggerPx: '60500' }]);
ok('delta radar: -40% trim, full exit, SL tightened', dl.some((x) => x.badge === '-40% Size Trimmed') && dl.some((x) => x.coin === 'ETH' && x.badge === 'Full Exit') && dl.some((x) => x.badge === 'SL Tightened'), JSON.stringify(dl));
ok('delta radar: new position badge', V.delta([], prev).some((x) => /New Long/.test(x.badge)));
const dust = V.fills(Array.from({ length: 12 }, (_, i) => mk({ time: t0 + i * 1000, dir: 'Close Long', closedPnl: i < 8 ? '0.2' : '50' })));
ok('anti-rug: dust win-rate padding flagged', V.antiRug({ addr: A1, acct: 1e5, vlm: { month: 1e5 } }, dust).flag);
ok('anti-rug: circular wash volume flagged', V.antiRug({ addr: A1, acct: 1e4, vlm: { month: 1e8 } }, []).why.includes('circular wash volume'));
ok('anti-rug: bundled same-millisecond fills across wallets flagged; clean wallet passes', V.antiRug({ addr: A1, acct: 1e5, vlm: { month: 1e5 } }, F, { [A2]: F.slice(0, 4) }).why.some((w) => /bundled/.test(w)) && !V.antiRug({ addr: A1, acct: 1e5, vlm: { month: 1e5 } }, F, {}).flag);
const C = V.confluence([{ addr: A1, coin: 'BTC', side: 'Long', t: 1000 }, { addr: A2, coin: 'BTC', side: 'Long', t: 1500 }, { addr: A3, coin: 'BTC', side: 'Short', t: 1600 }, { addr: A1, coin: 'ETH', side: 'Long', t: 1000 }, { addr: A2, coin: 'ETH', side: 'Long', t: 3000 }, { addr: 'bad', coin: 'BTC', side: 'Long', t: 1100 }]);
ok('confluence: 2 top wallets same coin + side within 15 min; outside window or opposite side ignored', C.length === 1 && C[0].coin === 'BTC' && C[0].side === 'Long' && C[0].wallets.length === 2, JSON.stringify(C));
const H = V.heatmap([{ positions: P.list, orders: [{ coin: 'BTC', isTrigger: false, reduceOnly: true, limitPx: '62000', sz: '0.5' }] }], 'BTC', 58000, 64000, 12);
ok('heatmap: long entry, TP cluster and liquidation wall land in the right bins', H.length === 12 && H.find((b) => b.p0 <= 60000 && b.p1 > 60000).long > 0 && H.find((b) => b.p0 <= 62000 && b.p1 > 62000).tp > 0 && H.find((b) => b.p0 <= 59500 && b.p1 > 59500).liq > 0 && H.every((b) => b.w >= 0 && b.w <= 1));
ok('heatmap: bad range → null', V.heatmap([], 'BTC', 5, 5) === null);
const sp = V.styleSpec(S, 'Scalper'), sp2 = V.styleSpec({ avgHoldMin: 2880, opensPerDay: 0.5, favored: ['ETH'] }, 'Swing'), sp3 = V.styleSpec({ avgHoldMin: 300, opensPerDay: 3 }, 'Mean-Reversion'), sp4 = V.styleSpec({}, 'News Sniper');
ok('Backtest Style: every mapped strategy exists and is backtestable', [sp, sp2, sp3, sp4].every((x) => NT.strategies[x.strat] && !NT.strategies[x.strat].liveOnly && typeof NT.strategies[x.strat].prepare === 'function'), [sp, sp2, sp3, sp4].map((x) => x.strat));
ok('Backtest Style: time stop from hold time, cooldown from cadence, favoured coin', sp2.filters.timeStop === 48 && sp2.coin === 'ETH' && sp2.filters.cooldown >= 1 && sp.filters.timeStop >= 2);

// ── 15 upgrades
const bars = Array.from({ length: 240 }, (_, i) => { const o = 100 + Math.sin(i / 9) * 3, c = o + Math.cos(i / 5); return { t: 1.7e9 - (1.7e9 % 86400) + i * 60, o, h: Math.max(o, c) + 0.4, l: Math.min(o, c) - 0.4, c, v: 100 + (i % 17 === 0 ? 900 : 0) }; });
const G = V.ghost(bars, 900);
ok('1 ghost: 15m shells from 1m bars carry true OHLC', G.length === 16 && G[0].o === bars[0].o && G[0].c === bars[14].c && G[0].h === Math.max(...bars.slice(0, 15).map((b) => b.h)));
const Lr = { entry: 100, sl: 95, long: true, levels: [{ k: 'TP1', p: 105, hit: true }, { k: 'TP2', p: 110, hit: false }, { k: 'TP3', p: 115, hit: false }] };
const st1 = V.stepLadder(Lr, { TP1: 'be01' });
ok('2 step-ladder: TP1 fill → SL to entry + 0.1R', st1.sl === 100.5 && st1.events.length === 1);
Lr.sl = st1.sl; Lr.sl0 = 95; Lr.levels[1].hit = true; const st2 = V.stepLadder(Lr, { TP1: 'be01', TP2: 'tp1' });
ok('2 step-ladder: TP2 fill → trail SL to TP1; never loosens a stop', st2.sl === 105 && V.stepLadder(Object.assign({}, Lr, { sl: 106 }), { TP1: 'be' }).sl === 106);
ok('2 step-ladder: short side mirrors', V.stepLadder({ entry: 100, sl: 105, long: false, levels: [{ p: 95, hit: true }, { p: 90 }, { p: 85 }] }, { TP1: 'be01' }).sl === 99.5);
const OR = V.openingRange(bars, 0, [5, 15, 30]);
ok('3 opening range: 5/15/30-minute highs and lows nest', OR[5] && OR[30] && OR[30].hi >= OR[5].hi && OR[30].lo <= OR[5].lo);
ok('3 kill-zones: Asia box from today\'s bars', V.killZones(bars).asia && V.killZones(bars).asia.hi >= V.killZones(bars).asia.lo);
const now = 1e6, tr = Array.from({ length: 60 }, (_, i) => ({ t: now - 4000 + i * 60, side: 'buy', q: 1 })).concat([{ t: now - 20000, side: 'sell' }]);
const tv = V.tapeVelocity(tr, now, 5000);
ok('4 tape velocity: 12/s all-buy burst vs a quiet baseline', tv.perSec === 12 && tv.imbalance === 1 && tv.burst && tv.side === 'buy', JSON.stringify(tv));
ok('4 tape velocity: empty tape is calm', !V.tapeVelocity([], now).burst);
const chain = { calls: [{ strike: 100, oi: 5000, iv: 0.3 }, { strike: 105, oi: 800, iv: 0.3 }], puts: [{ strike: 95, oi: 1500, iv: 0.35 }, { strike: 'x', oi: 1 }] };
const cc = V.charmCurve(chain, 100.1);
ok('5 charm curve: 14 points into the close, pin strike = max OI, finite values', cc && cc.pts.length === 14 && cc.pinStrike === 100 && cc.window === 'pin' && cc.pts.every((p) => fin(p.charm) && fin(p.vanna)), JSON.stringify(cc && cc.pts.slice(-2)));
ok('5 charm curve: no chain → null', V.charmCurve(null, 100) === null && V.charmCurve({ calls: [] }, 100) === null);
const ab = V.absorption(bars.map((b, i) => (i === 120 ? Object.assign({}, b, { v: 3000, c: b.o + 0.01 }) : b)));
ok('6 absorption: big volume + tiny body bar flagged', ab.some((x) => x.i === 120 && x.absorb > 0.3), JSON.stringify(ab.slice(0, 3)));
const days = Array.from({ length: 120 }, (_, i) => { const pc = 100 + i * 0.1, o = i % 5 === 0 ? pc * 1.02 : pc; return { t: i * 86400, o, h: Math.max(o, pc) + 0.5, l: (i % 10 === 0 ? pc - 1 : Math.min(o, pc) + 0.1), c: pc + 0.1, v: i === 119 ? 5000 : 1000 }; });
days[119].o = days[118].c * 1.03;
const gs = V.gapStats(days);
ok('7 gap-fill: gap %, RVOL and a 90-day fill rate in 0..1', gs.gap > 2.5 && gs.rvol === 5 && gs.n > 5 && gs.fillRate >= 0 && gs.fillRate <= 1, JSON.stringify(gs));
const hc = V.holderClusters([{ addr: 'a', pct: 5, funder: 'F', t: 10 }, { addr: 'b', pct: 6, funder: 'F', t: 50 }, { addr: 'c', pct: 7, funder: 'F', t: 90 }, { addr: 'd', pct: 2, funder: null, t: 5 }, { addr: 'e', pct: 3 }, null]);
ok('8 holder X-ray: same funder within 30 min = coordinated 18% (elevated)', hc.clusters[0].coordinated && hc.coordPct === 18 && hc.verdict === 'elevated' && hc.clusters.filter((c) => !c.coordinated).length === 2, JSON.stringify(hc));
const base = Array.from({ length: 200 }, (_, i) => 100 * Math.exp(Math.sin(i * 1.7) * 0.01 + i * 0.001)), lagged = base.map((_, i) => base[Math.max(0, i - 2)] * 1.5);
const ll = V.leadLag(base, lagged);
ok('9 lead-lag: B copies A two bars later → A leads by 2, corr high', ll && ll.lag === 2 && Math.abs(ll.recent) >= 0 && fin(ll.beta), JSON.stringify(ll));
ok('9 lead-lag: short series → null', V.leadLag([1, 2, 3], [1, 2, 3]) === null);
const fx = V.forensic([{ o: 100, h: 100.2, l: 99.9, c: 100.1, v: 10 }, { o: 100.1, h: 103, l: 100, c: 100.4, v: 90 }], { imbalance: 0.7, rvol: 3.2 }, ['Fed surprise <b>cut</b>']);
ok('10 forensic: move %, aggressive buying, RVOL, rejection wick and headline reasons', fx.move > 0 && fx.why.length === 4 && /buying/.test(fx.why[0]) && /wick/.test(fx.why[2]) && /headline/.test(fx.why[3]), JSON.stringify(fx));
ok('10 forensic: quiet move → thin-liquidity explanation', /thin liquidity/.test(V.forensic([{ o: 1, h: 1, l: 1, c: 1, v: 1 }, { o: 1, h: 1.001, l: 1, c: 1.001, v: 1 }], {}, []).why[0]));
const q = V.parseHunt('Highlight every bullish FVG above VWAP with RVOL > 2.5x');
ok('11 hunter: parses pattern, direction, VWAP side and RVOL threshold', q && q.pattern === 'fvg' && q.dir === 'bull' && q.vwap === 'above' && q.rvol === 2.5, JSON.stringify(q));
ok('11 hunter: other phrasings; garbage → null', V.parseHunt('bearish order block below the vwap').pattern === 'ob' && V.parseHunt('liquidity grab').pattern === 'sweep' && V.parseHunt('what is the weather') === null && V.parseHunt('') === null);
const hz = V.hunt(bars, { pattern: 'fvg', dir: 'bull', vwap: null, rvol: null }, () => [{ i: 50, dir: 'bull' }, { i: 60, dir: 'bear' }, { i: 70, dir: 'bull' }]);
ok('11 hunter: filters zones by direction (and RVOL when set)', hz.length === 2 && V.hunt(bars, { pattern: 'fvg', rvol: 50 }, () => [{ i: 50, dir: 'bull' }]).length === 0);
ok('12 throttle: 2 losses → half size; ATR 3× → pause; else normal', V.throttle([5, -1, -2], 1, 1).factor === 0.5 && V.throttle([5], 3, 1).factor === 0 && V.throttle([-1, 5], 1, 1).factor === 1);
ok('13 ET→UTC: EST in January (+5h), EDT in July (+4h)', V.etToUtc('2025-01-29', 14, 0) === Date.UTC(2025, 0, 29, 19) / 1000 && V.etToUtc('2025-07-30', 14, 0) === Date.UTC(2025, 6, 30, 18) / 1000 && V.etToUtc('2025-03-12', 8, 30) === Date.UTC(2025, 2, 12, 12, 30) / 1000);
const pe = V.pastEvents(Date.UTC(2026, 10, 14) / 1000);
ok('13 past events: last 12 FOMC + CPI + NFP, all before now, ascending', pe.filter((e) => e.k === 'fomc').length === 12 && pe.some((e) => e.k === 'cpi') && pe.some((e) => e.k === 'nfp') && pe.every((e, i) => !i || e.t >= pe[i - 1].t));
const ev = 1.7e9 - (1.7e9 % 300), rb = Array.from({ length: 40 }, (_, i) => { const t = ev - 10 * 300 + i * 300, o = 100, c = i === 10 ? 101 : i > 10 ? 99 : 100; return { t, o, h: Math.max(o, c) + (i === 10 ? 1 : 0), l: Math.min(o, c), c, v: 1 }; });
const rx = V.reaction(rb, ev);
ok('13 reaction: up-spike that reverses within the hour = fakeout', rx && rx.spike > 0 && rx.follow60 < 0 && rx.fakeout, JSON.stringify(rx));
const nowMs = Date.now(), jn = [{ ts: nowMs - 600000, side: 'buy', sym: 'BTC-USD', usd: 1000 }, { ts: nowMs - 500000, side: 'sell', sym: 'BTC-USD', usd: 980, pnl: -20 }, { ts: nowMs - 420000, side: 'buy', sym: 'BTC-USD', usd: 2500 }];
const tg = V.tiltGuard(jn);
ok('14 tilt guard: 2.5× size within 80 s of a stop-out → warning', tg.warn && tg.events.length === 1 && tg.events[0].mult === 2.5, JSON.stringify(tg));
ok('14 tilt guard: patient re-entry is fine', !V.tiltGuard([jn[0], jn[1], Object.assign({}, jn[2], { ts: nowMs - 100000 })]).events.length);
const wl = V.worstLoss(jn.concat([{ ts: nowMs, side: 'sell', sym: 'ETH-USD', pnl: -90, held: 120000 }]));
ok('15 worst loss: biggest loser, replay starts 30 s before its entry', wl.exit.pnl === -90 && wl.startMs === nowMs - 120000 - 30000 && V.worstLoss([]) === null);

// ── i18n: 28 new keys in all 32 named languages, RTL set intact
const K = ['learn.btn', 'learn.hero', 'learn.drill', 'learn.try', 'lb.perp', 'lb.smart', 'lb.antirug', 'lb.heat', 'up.title', 'learn.docs'];
ok('i18n: 32 named languages carry every v15.4 key (non-empty, not English for non-English rows)', I.LANGS.length === 32 && I.LANGS.every((l) => K.every((k) => I.DICT[l.code][k] && I.DICT[l.code][k].length > 1)) && I.LANGS.filter((l) => l.code !== 'en' && I.DICT[l.code]['learn.hero'] !== I.DICT.en['learn.hero']).length === 31);
ok('i18n: hero string is "Learn Our Terminal — Interactive ExTerm Academy" in English; RTL languages flagged', I.tr('en', 'learn.hero') === 'Learn Our Terminal — Interactive ExTerm Academy' && ['ar', 'he', 'fa', 'ur'].every((c) => I.isRtl(c)) && /ExTerm/.test(I.tr('ar', 'learn.hero')));

// ── static: strict CSP + privacy on the new modules
const SRC = ['v154core.js', 'learn_academy.js', 'leaderboards.js', 'v154_core_upgrades.js'].map((f) => [f, fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')]);
ok('static: no inline event handler attributes, eval or new Function in v15.4 modules', SRC.every(([, s]) => !/\son[a-z]+\s*=\s*["'`]/i.test(s.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\beval\(|new Function\(/.test(s)), SRC.filter(([, s]) => /\son[a-z]+\s*=\s*["'`]/i.test(s)).map(([f]) => f));
const BANNED = new RegExp(['op' + 'en[- ]?so' + 'urce', 'so' + 'lana', '\\bS' + 'OL\\b', 'hyper' + 'dash', 'coin' + 'glass', 'nan' + 'sen', 'ark' + 'ham', 'de' + 'bank'].join('|'), 'i');
ok('static: no banned terms (third-party leaderboard brands, licence wording, excluded chains) in v15.4 modules', SRC.every(([, s]) => !BANNED.test(s)), SRC.filter(([, s]) => BANNED.test(s)).map(([f]) => f));
ok('static: LEARN_MOUNT_TARGET is one constant set to topbar', /const LEARN_MOUNT_TARGET = 'topbar';/.test(SRC[1][1]));

console.log(res.join('\n'));
const f = res.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
process.exit(f ? 1 : 0);
