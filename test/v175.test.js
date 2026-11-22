// ExTerm v17.5 unit + static tests: worker mesh (8 lanes, allow-list, Float64Array protocol, worker kernel in a VM), universal
// any-stock / coin / CA classification, truthful Working Bots squad (0 demo events while real bots run), ≤ 3 default 3D layers,
// ≥ 150 Shock Lab scenarios + book-walk shock, deterministic accuracy of the 30+ quant engines against closed forms / known
// values, quant panels (Merton cone, Lorenz λ₁, Hurst, eigen-risk), plus static checks: exact pre-v17.0 palette lock in every
// v17.5 file, build order + WORKER175_SRC, strict CSP, search in every tool, 2D | 3D pills, hotkeys, frame budget, serve.py
// lanes, version, license, privacy.
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = require('../src/v175core.js'), E = V.E, { mean, sd } = V.util;
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i !== undefined ? ' - ' + JSON.stringify(i) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r = V.rng(5), N = () => V.normal(r);

/* ── mesh ── */
ok('version 17.5 + exact pre-v17.0 palette (Obsidian #07080B / #0D1117, Bullion Gold #F5C84B)', V.VERSION === '17.5' && V.PAL.obs === '#07080B' && V.PAL.panel === '#0D1117' && V.PAL.gold === '#F5C84B' && V.PAL.up === '#2fd08a' && V.PAL.dn === '#ff5a5f' && Object.isFrozen(V.PAL));
ok('mesh: 8 dedicated browser lanes (Feed/L2 · 3D Spatial · On-Chain · Options · Screener · Quant Lab · Bot Squad · Copilot)', V.LANES.length === 8 && V.LANES.map((l) => l[0]).join() === 'feed,spatial,chain,options,screener,quant,bots,copilot');
ok('mesh: 4 server lanes (Ingest · Forensics · Heavy Quant · Copilot/Bot Execution)', V.SERVER_LANES.length === 4 && V.SERVER_LANES.map((l) => l[0]).join() === 'ingest,forensics,quant,exec');
const allOps = [].concat(...V.LANES.map((l) => l[2]));
ok('mesh: every lane op is implemented and allowed on its own lane only', allOps.every((o) => typeof E[o] === 'function' && V.allowed(V.route(o), o)) && new Set(allOps).size === allOps.length, allOps.filter((o) => typeof E[o] !== 'function'));
ok('mesh: allow-list rejects cross-lane ops, unknown ops and prototype keys', !V.allowed('feed', 'merton') && !V.allowed('quant', 'eval') && !V.allowed('quant', 'constructor') && !V.allowed('quant', '__proto__') && !V.allowed('nope', 'pin'));
const pk = V.pack([1.5, -2, 3e9]); ok('mesh: Float64Array series pack / unpack round trip', pk instanceof Float64Array && pk[0] === 3 && V.unpack(pk).join() === '1.5,-2,3000000000');
ok('mesh: matrix pack / unpack round trip', JSON.stringify(V.unpackM(V.packM([[1, 2, 3], [4, 5, 6]]))) === '[[1,2,3],[4,5,6]]');
const te = new V.Tele(8); for (let i = 1; i <= 10; i++) te.add(i); const ts = te.stats();
ok('mesh: per-lane latency ring (fixed size, avg / p50 / p99, job count)', ts.jobs === 10 && te.vals().length === 8 && near(ts.avg, 6.5, 1e-9) && ts.p99 > 9.8 && ts.p50 === 6.5);
ok('mesh: latency histogram buckets', V.histo([0.05, 0.3, 0.9, 5, 500]).join() === '1,0,1,1,0,0,1,0,0,0,0,1');
/* worker kernel executed in a VM exactly as a Worker would run WORKER175_SRC */
const wsrc = src('src/v175core.js') + '\n' + src('src/v175work.js'), posted = [], ctx = { self: { postMessage: (m, tr) => posted.push({ m, tr: tr || [] }) }, performance, Float64Array, Float32Array, ArrayBuffer, Math, Object, Array, Number, String, Map, Set, Error, JSON, isFinite };
vm.createContext(ctx); vm.runInContext(wsrc, ctx); const send = (m) => ctx.self.onmessage({ data: m });
send({ init: 'quant' }); send({ id: 1, fn: 'hurst', args: [V.pack(Array.from({ length: 256 }, N))] }); send({ id: 2, fn: 'pin', args: [[1], [1]] }); send({ id: 3, fn: 'merton', args: [100, { paths: 10, steps: 5, seed: 1 }] });
ok('worker kernel: lane init, Float64Array args, numeric result', posted[0].m.ready === 'quant' && posted[1].m.id === 1 && posted[1].m.ok && posted[1].m.out > 0 && posted[1].m.out < 1 && posted[1].m.ms >= 0, posted[1] && posted[1].m);
ok('worker kernel: op from another lane is refused on this lane', posted[2].m.ok === false && /not allowed on lane quant/.test(posted[2].m.err));
ok('worker kernel: typed-array results are transferred back (zero copy)', posted[3].m.ok && posted[3].tr.length >= 10 && posted[3].tr.every((b) => Object.prototype.toString.call(b) === '[object ArrayBuffer]'), posted[3].tr.length);

/* ── any stock / coin / CA ── */
const k = (q) => { const c = V.classify(q); return c.kind + ':' + c.q; };
ok('search: US stocks (AAPL, $TSLA, BRK.B)', k('AAPL') === 'stock:AAPL' && k('$tsla') === 'stock:TSLA' && k('brk.b') === 'stock:BRK.B');
ok('search: crypto pairs and bare coins (btc, SOL-USD, eth/usdt, PEPE)', k('btc') === 'crypto:BTC-USD' && k('SOL-USD') === 'crypto:SOL-USD' && k('eth/usdt') === 'crypto:ETH-USDT' && k('PEPE') === 'crypto:PEPE-USD');
ok('search: perps (BTC-PERP, ETHPERP)', k('BTC-PERP') === 'perp:BTC-PERP' && k('ethperp') === 'perp:ETH-PERP');
ok('search: meme-coin contract addresses (EVM 0x… lower-cased, Solana base58)', k('0x' + 'AbC1'.repeat(10)) === 'evm-ca:0x' + 'abc1'.repeat(10) && k('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263') === 'sol-ca:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' && V.classify('  ').kind === 'empty');

/* ── truthful Working Bots squad ── */
ok('squad: exactly HUNTER-α · SNIPER-EXEC · SCALPER-EXIT · RISK-GUARD · MUTATOR-EVO · HEDGER-ARB', V.SQUAD.map((s) => s[1]).join() === 'HUNTER-α,SNIPER-EXEC,SCALPER-EXIT,RISK-GUARD,MUTATOR-EVO,HEDGER-ARB');
const so = (e) => V.squadOf(e);
ok('squad: real bus events map 1:1 to members', so({ type: 'scan', src: 'fleet' }) === 0 && so({ type: 'fill', src: 'fleet' }) === 1 && so({ type: 'win', src: 'fleet' }) === 2 && so({ type: 'block', node: 'Risk' }) === 3 && so({ type: 'flatten', node: 'Risk' }) === 3 && so({ type: 'bot', node: 'Bots', text: 'evolution: fast 9' }) === 4 && so({ type: 'hedge', src: 'fleet' }) === 5 && so({ type: 'bot', node: 'Bots', text: 'fleet BUY 0.1' }) === 1);
ok('squad: non-bot events (ticks, UI, AI) never fire a bot', so({ type: 'tick', node: 'Data' }) === null && so({ type: 'ui', node: 'Chart', text: '3D chart on' }) === null && so({ type: 'ai', node: 'Copilot' }) === null);
const Sq = new V.Squad(); ok('squad: STANDBY by default, zero fires', Sq.m.every((_, i) => Sq.status(i) === 'STANDBY') && Sq.kpis().mode === 'STANDBY' && Sq.kpis().fires === 0);
ok('squad: demo events are dropped unless "Explore Live Demo" is on', Sq.feed({ type: 'fill', src: 'demo', node: 'Bots' }) === -1 && Sq.kpis().fires === 0 && Sq.dropped === 1);
Sq.demoOn = true; Sq.feed({ type: 'fill', src: 'demo', node: 'Bots', text: 'DEMO · fill' }, 1000);
ok('squad: demo on + no real bot → labelled DEMO fires', Sq.demoEvents === 1 && Sq.status(1, 1500) === 'DEMO' && Sq.kpis(1500).mode === 'DEMO' && Sq.m[1].real === 0);
Sq.setReal(2); const before = Sq.demoEvents; for (let i = 0; i < 20; i++) Sq.feed({ type: 'fill', src: 'demo', node: 'Bots' }, 2000);
ok('squad: 0 demo signals while real bots run (even with the demo switch on)', Sq.demoEvents === before && Sq.kpis(2000).mode === 'LIVE BOTS' && Sq.status(3, 2000) === 'ARMED');
Sq.feed({ type: 'gate', node: 'Risk', src: 'fleet', text: 'firewall pass', lat: 0.4 }, 3000);
ok('squad: real event → ACTIVE member, real count, latency p99', Sq.status(3, 3500) === 'ACTIVE' && Sq.realEvents === 1 && near(Sq.kpis(3500).p99, 0.4, 1e-9) && Sq.status(3, 30000) === 'ARMED');

/* ── 3D layers ── */
const Ld = V.layerDefaults();
ok('3D layers: exactly 3 on by default (OB Prisms + VPVR / POC + Whale Beacons)', V.layersOn(Ld).join() === 'ob,vpvr,whale');
ok('3D layers: drawer holds L2 Terrain, CVD Pillars, GEX Towers, Liq Pools, FVG Tunnels, AVWAP Canyon, R:R Hologram, 6-TF Strata, 4D Replay', ['L2 Terrain', 'CVD Pillars', 'GEX Towers', 'Liq Pools', 'FVG Tunnels', 'AVWAP Canyon', '3D R:R Hologram Box', '6-TF Stacked Strata', '4D Replay Scrub'].every((n) => V.LAYERS.some((l) => l[1] === n && !l[2])) && V.LAYERS.length === 12);
ok('3D layers: saved presets merge booleans only (junk ignored)', JSON.stringify(V.layerState({ ob: false, gex: true, evil: true, vpvr: 'yes' })) === JSON.stringify(Object.assign(V.layerDefaults(), { ob: false, gex: true })));
const vbars = Array.from({ length: 50 }, (_, i) => (i % 10 === 4 ? { l: 104.2, h: 104.4, o: 104.2, c: 104.4, v: 1000 } : { l: 100 + (i % 10), h: 101 + (i % 10), o: 100, c: 101, v: 10 }));
const vp = V.vpvr(vbars, 10); ok('VPVR: POC sits in the heaviest bin (centre 104.5), 70 % value area brackets it', near(vp.poc, 104.5, 1e-9) && vp.val <= vp.poc && vp.vah >= vp.poc, { poc: vp.poc, val: vp.val, vah: vp.vah });
ok('whale beacons: volume z-score ≥ 2.5 flagged with side', V.whales(Array.from({ length: 40 }, (_, i) => ({ o: 1, c: i === 30 ? 2 : 1, v: i === 30 ? 500 : 10 + (i % 3) }))).map((w) => w.i + w.side).join() === '30buy');

/* ── Shock Lab ── */
const SC = V.scenarios(), cats = {}; for (const s of SC) cats[s.cat] = (cats[s.cat] || 0) + 1;
ok('Shock Lab: ≥ 150 scenarios, 6 categories, ≥ 25 each', SC.length >= 150 && Object.keys(cats).length === 6 && Object.values(cats).every((n) => n >= 25), cats);
ok('Shock Lab: unique ids / names, parameters in range, deterministic', new Set(SC.map((s) => s.id)).size === SC.length && new Set(SC.map((s) => s.name)).size === SC.length && SC.every((s) => s.orderUsd > 0 && s.depthPct > 0 && s.depthPct <= 1 && s.volMult >= 1 && s.spoofPct >= 0 && s.spoofPct < 1) && JSON.stringify(V.scenarios()) === JSON.stringify(SC));
const bk = V.synthBook(100, {});
ok('model book: bids below / asks above mid, monotone, spread = 4 bps', bk.bids.every((b, i) => b[0] < 100 && (!i || b[0] < bk.bids[i - 1][0])) && bk.asks.every((a, i) => a[0] > 100 && (!i || a[0] > bk.asks[i - 1][0])) && near(((bk.asks[0][0] - bk.bids[0][0]) / 100) * 1e4, 4, 1e-9));
const s0 = V.shock(bk, { orderUsd: 1e5 }), s1 = V.shock(bk, { orderUsd: 1e5, depthPct: 0.2 }), s2 = V.shock(bk, { orderUsd: 1e5, depthPct: 0.2, spoofPct: 0.6 }), s3 = V.shock(bk, { orderUsd: 1e5, depthPct: 0.2, spoofPct: 0.6, volMult: 3 });
ok('shock: thinner book → more slippage; spoof pull → more; vol ×3 → more (monotone)', s0.slipBps < s1.slipBps && s1.slipBps < s2.slipBps && s2.slipBps < s3.slipBps && s3.levels > s0.levels, [s0.slipBps, s1.slipBps, s2.slipBps, s3.slipBps]);
ok('shock: dollars conserved (filled + unfilled = order), avg fill below mid on a sell', near(s3.filledUsd + s3.unfilledUsd, 1e5, 1e-6) && s3.avg < 100 && V.shock(bk, { orderUsd: 1e5, side: 'buy' }).avg > 100);
ok('shock: an order larger than the book leaves an unfilled remainder', V.shock(bk, { orderUsd: 1e9, depthPct: 0.1 }).unfilledUsd > 0);
const st = V.stressPositions([{ sym: 'L', qty: 10, px: 100 }, { sym: 'S', qty: -10, px: 100 }, { sym: 'X', qty: 1, px: 100, lev: 20 }], { gapPct: -0.08, volMult: 3, depthPct: 0.25, spoofPct: 0.2 }, bk);
ok('stress test: longs lose and shorts gain on a crash gap; 20× leverage liquidates', st.rows[0].pnl < 0 && st.rows[1].pnl > 0 && st.rows[2].liquidated && st.liquidations === 1 && near(st.total, st.rows.reduce((s, x) => s + x.pnl, 0), 1e-9));

/* ── engines: Chart & Execution ── */
const nb = [], ns = [], ib = [], is = []; for (let i = 0; i < 30; i++) { nb.push(40 + Math.round(N() * 6)); ns.push(40 + Math.round(N() * 6)); const news = i % 3 === 0, good = i % 6 === 0; ib.push(40 + (news && good ? 60 : 0) + Math.round(N() * 6)); is.push(40 + (news && !good ? 60 : 0) + Math.round(N() * 6)); }
const p0 = E.pin(nb, ns), p1 = E.pin(ib, is);
ok('Easley-O\'Hara PIN: no information events → PIN ≈ 0', p0.pin < 0.08, p0.pin);
ok('Easley-O\'Hara PIN: α = 1/3, μ = 60, ε = 40 → recovers PIN ≈ 0.20 (true αμ/(αμ+2ε))', near(p1.pin, 0.2, 0.06) && near(p1.alpha, 1 / 3, 0.12), p1);
const ac = E.almgrenChriss(1e5, 10, { lambda: 1e-5, sigma: 0.3, eta: 1e-4 }), tw = E.almgrenChriss(1e5, 10, { lambda: 0 }), ag = E.almgrenChriss(1e5, 10, { lambda: 1e-2, sigma: 0.3, eta: 1e-4 });
ok('Almgren-Chriss: slices sum to X, λ = 0 is exact TWAP, risk aversion front-loads', near(ac.trades.reduce((a, b) => a + b, 0), 1e5, 1e-6) && tw.trades.every((t) => near(t, 1e4, 1e-6)) && ag.trades[0] > ac.trades[0] && ag.trades[0] > ag.trades[9]);
ok('Almgren-Chriss: holdings x_k = X sinh(κ(T−t)) / sinh(κT)', near(ac.hold[5], (1e5 * Math.sinh(ac.kappa * 0.5)) / Math.sinh(ac.kappa), 1e-6));
ok('FFT: 256 samples of a period-32 sine → dominant cycle 32 bars', E.cycle(Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 32))).period === 32);
const imp = E.fft([1, 0, 0, 0, 0, 0, 0, 0]); ok('FFT: impulse → flat unit spectrum', [...imp.re].every((v) => near(v, 1, 1e-12)) && [...imp.im].every((v) => near(v, 0, 1e-12)));
const hx = Array.from({ length: 64 }, (_, i) => Math.sin(i / 5) + i * 0.01); ok('Haar wavelet: perfect reconstruction without threshold', E.haar(hx).every((v, i) => near(v, hx[i], 1e-9)));
const hn = hx.map((v) => v + N() * 0.3), hd = E.haar(hn, 0.4), err = (a) => mean(a.map((v, i) => (v - hx[i]) ** 2)); ok('Haar wavelet: thresholding denoises', err(hd) < err(hn), [err(hd), err(hn)]);
const kz = Array.from({ length: 200 }, (_, i) => (i < 100 ? 10 : 12) + N() * 0.5), kf = E.kalman(kz); ok('adaptive Kalman: tracks a level shift and smooths noise', near(kf[199], 12, 0.3) && near(kf[95], 10, 0.3) && sd(kf.slice(150).map((v) => v - 12)) < sd(kz.slice(150).map((v) => v - 12)));
ok('spoof-elasticity half-life: a wall halving every snapshot → t½ = 1, R² = 1', near(E.spoofHalfLife([0, 1, 2, 3, 4], [100, 50, 25, 12.5, 6.25]).halfLife, 1, 1e-12) && near(E.spoofHalfLife([0, 1, 2], [8, 4, 2]).r2, 1, 1e-12));
ok('order-type selector: patient small → Limit, urgent tiny → IOC, huge patient → TWAP', E.orderType({ spreadBps: 2, urgency: 0.1, volBps: 40, sizePctAdv: 0.01 }).best === 'Limit' && E.orderType({ spreadBps: 2, urgency: 1, volBps: 200, sizePctAdv: 0.001 }).best === 'IOC' && E.orderType({ spreadBps: 2, urgency: 0.05, volBps: 100, sizePctAdv: 4 }).best === 'TWAP');
const sb = E.shadowBracket(100, 'long', 2, { k: 1.5, rr: 2 }), ss = E.shadowBracket(100, 'short', 2, { k: 1.5, rr: 2 }); ok('shadow bracket: stop / TP at 1.5 ATR and 2R, mirrored for shorts', sb.stop === 97 && sb.tp === 106 && ss.stop === 103 && ss.tp === 94 && sb.type === 'IOC-on-touch');
const dtb = E.drawToBot([[0, 100], [10, 110], [20, 120]], { lastPrice: 131, nowIndex: 30 }); ok('draw-pattern → bot: least-squares trendline compiles to a crosses_above / buy rule', near(dtb.slope, 1, 1e-12) && near(dtb.levelNow, 130, 1e-9) && dtb.rule.if[1] === 'crosses_above' && dtb.rule.then === 'buy' && dtb.kind === 'rising');
ok('L2 imbalance: $-weighted top levels', near(E.bookImb([[100, 3]], [[101, 1]], 10).imb, (300 - 101) / 401, 1e-12));
ok('ticks → OHLCV', JSON.stringify(E.ohlc([0, 400, 1000, 1500], [10, 12, 11, 9], [1, 2, 3, 4], 1000)) === JSON.stringify([{ t: 0, o: 10, h: 12, l: 10, c: 12, v: 3 }, { t: 1000, o: 11, h: 11, l: 9, c: 9, v: 7 }]));

/* ── engines: On-Chain, Options & Futures ── */
ok('Sybil wash entropy: ping-pong pair ≥ 90, 50 distinct wallets ≤ 5', E.washScore(Array.from({ length: 50 }, (_, i) => (i % 2 ? { from: 'A', to: 'B' } : { from: 'B', to: 'A' }))).score >= 90 && E.washScore(Array.from({ length: 50 }, (_, i) => ({ from: 'w' + i, to: 'x' + i * 7 }))).score <= 5);
const mv = (s, l) => E.mevSandwich({ sizeUsd: s, liqUsd: l, slipTol: 0.01, gasUsd: 2 }).prob; ok('MEV sandwich: risk rises with size, falls with pool depth', mv(100, 1e5) < mv(1e4, 1e5) && mv(1e4, 1e5) > mv(1e4, 1e8));
const smw = E.smartMoney([{ id: 'a', pnl: Array.from({ length: 40 }, (_, i) => Math.pow(0.5, i) * 100) }, { id: 'b', pnl: Array(40).fill(1) }]); ok('smart money: 30d board sorted by P&L; geometric decay → positive AR(1) and a short half-life', smw[0].id === 'b' && smw[1].ac1 > 0.3 && smw[1].halfLife > 0 && smw[1].halfLife < 3, smw[1]);
ok('Black-Scholes call (S=K=100, T=1, r=5%, σ=20%) = 10.4506', near(E.bsCall(100, 100, 1, 0.05, 0.2), 10.4506, 2e-4));
const g = E.greeks(100, 105, 0.3, 0.01, 0.4), h = 1e-3, cfd = (S) => E.bsCall(S, 105, 0.3, 0.01, 0.4), dfd = (s) => (E.bsCall(100 + h, 105, 0.3, 0.01, s) - E.bsCall(100 - h, 105, 0.3, 0.01, s)) / (2 * h);
ok('greeks: Γ and vanna match finite differences', near(g.gamma, (cfd(100 + h) - 2 * cfd(100) + cfd(100 - h)) / (h * h), 1e-4) && near(g.vanna, (dfd(0.4 + 1e-4) - dfd(0.4 - 1e-4)) / 2e-4, 2e-3), g);
const KK = [], CC = []; for (let x = 20; x <= 260; x += 1) { KK.push(x); CC.push(E.bsCall(100, x, 0.5, 0.02, 0.3)); } const bl = E.breedenLitzenberger(KK, CC, 0.02, 0.5);
ok('Breeden-Litzenberger: e^{rT}∂²C/∂K² integrates to 1, mean = forward S·e^{rT}', near(bl.mass, 1, 0.01) && near(bl.mean, 100 * Math.exp(0.01), 0.5), { mass: bl.mass, mean: bl.mean });
ok('gamma-vanna-charm: calls → positive dealer gamma, puts → negative', E.gvc(100, [{ K: 100, T: 7 / 365, iv: 0.5, oi: 100, type: 'call' }]).gamma > 0 && E.gvc(100, [{ K: 100, T: 7 / 365, iv: 0.5, oi: 100, type: 'put' }]).gamma < 0);
ok('max pain: strike minimising total payout', E.maxPain([90, 95, 100, 105, 110], [10, 20, 50, 80, 40], [60, 70, 40, 10, 5]).strike === 100);
ok('pin risk: at max pain → pin prob 1; 3σ away → < 1 %', near(E.pinRisk(100, 100, 2, 0.5).pinProb, 1, 1e-6) && E.pinRisk(100, 100 + 3 * 0.5 * Math.sqrt(2 / 365) * 100, 2, 0.5).pinProb < 0.01);
const hk = E.hawkes([1, 2, 3], 0.5, 0.8, 1.2, 3); ok('Hawkes: λ(t) = μ + Σαe^{−β(t−tᵢ)}, branching α/β, stable', near(hk.intensity, 0.5 + 0.8 * (1 + Math.exp(-1.2) + Math.exp(-2.4)), 1e-12) && near(hk.branching, 2 / 3, 1e-12) && hk.stable && Number.isFinite(hk.ll));
const LA = Array.from({ length: 200 }, N), LB = LA.map((_, i) => (i >= 3 ? LA[i - 3] : 0) + N() * 0.1); ok('latency impulse: B lags A by 3 → lag 3, ρ > 0.95', E.latencyImpulse(LA, LB, 10).lag === 3 && E.latencyImpulse(LA, LB, 10).corr > 0.95);
ok('liquidation heatmap: 10× long @100 liquidates in the $90 bin', E.liqHeatmap([{ entry: 100, lev: 10, side: 'long', usd: 5 }], 20, 80, 120).bins[5] === 5);
const bf = E.bellmanFord(['USD', 'EUR', 'GBP'], [['USD', 'EUR', 0.9], ['EUR', 'GBP', 0.9], ['GBP', 'USD', 1.3]]); ok('Bellman-Ford: triangular arb 0.9·0.9·1.3 = +5.3 %', bf.arb && near(bf.profit, 0.053, 1e-9) && bf.cycle.length === 4 && bf.cycle[0] === bf.cycle[3], bf);
ok('Bellman-Ford: losing cycle → no arb', !E.bellmanFord(['A', 'B'], [['A', 'B', 0.5], ['B', 'A', 1.9]]).arb);

/* ── engines: Screener, Pulse, Derivs, Quant Lab, Fleet, Copilot, Journal ── */
const eg = E.eig([[2, 1], [1, 2]]); ok('Jacobi eigen: [[2,1],[1,2]] → 3, 1 with orthonormal vectors', near(eg.values[0], 3, 1e-12) && near(eg.values[1], 1, 1e-12) && near(eg.vectors[0][0] * eg.vectors[1][0] + eg.vectors[0][1] * eg.vectors[1][1], 0, 1e-12));
const Rn = Array.from({ length: 10 }, () => Array.from({ length: 400 }, N)), mp = E.marchenkoPastur(Rn);
ok('Marchenko-Pastur: λ± = (1 ± √(N/T))²; pure noise → 0 signal eigenvalues; cleaned matrix has unit diagonal', near(mp.lambdaPlus, (1 + Math.sqrt(10 / 400)) ** 2, 1e-12) && mp.signal === 0 && mp.cleaned.every((row, i) => row[i] === 1));
const F = Array.from({ length: 400 }, N), Rf = Array.from({ length: 10 }, () => F.map((f) => f + N() * 0.7)); ok('Marchenko-Pastur: a common factor survives the filter (≥ 1 signal eigenvalue)', E.marchenkoPastur(Rf).signal >= 1);
const tx = Array.from({ length: 1000 }, N), ty = tx.map((_, i) => (i ? tx[i - 1] : 0) + N() * 0.3); ok('transfer entropy: X drives Y → TE(X→Y) ≫ TE(Y→X)', E.transferEntropy(tx, ty) > 0.5 && E.transferEntropy(ty, tx) < 0.05);
const cp = E.copula(tx.slice(0, 200), tx.slice(0, 200).map((v) => v + N() * 0.5)); ok('copulas: Kendall τ, Clayton θ = 2τ/(1−τ), λL = 2^(−1/θ), Gumbel λU = 2 − 2^(1/θ)', E.kendallTau([1, 2, 3], [2, 4, 9]) === 1 && near(cp.clayton.theta, (2 * cp.tau) / (1 - cp.tau), 1e-12) && near(cp.clayton.lowerTail, Math.pow(2, -1 / cp.clayton.theta), 1e-12) && near(cp.gumbel.upperTail, 2 - Math.pow(2, 1 - cp.tau), 1e-12));
const bx = Array.from({ length: 200 }, (_, i) => (i < 120 ? 0 : 3) + N()), bo = E.bocpd(bx, { hazard: 1 / 100, var: 1 }); ok('BOCPD: detects the mean shift at t = 120 (± 6)', bo.changes.some((c) => Math.abs(c - 120) <= 6) && bo.runLength[199] >= 60 && bo.runLength[199] <= 90, bo.changes);
const vc = E.volCone(Array.from({ length: 300 }, () => N() * 0.01), [5, 20, 60]); ok('vol cone: P10 ≤ P50 ≤ P90 per window, ≈ 16 % annualised for 1 % daily', vc.cone.length === 3 && vc.cone.every((c) => c.p10 <= c.p50 && c.p50 <= c.p90) && near(vc.cone[2].p50, 0.01 * Math.sqrt(252), 0.04));
const cl = [100]; for (let i = 1; i < 300; i++) cl.push(cl[i - 1] * (1 + N() * 0.01 + 0.0005 * Math.sin(i / 7)));
const ga1 = E.geneticAlpha(cl, { seed: 4 }), ga2 = E.geneticAlpha(cl, { seed: 4 }); ok('symbolic genetic alpha: seeded / reproducible, 40 + 6×30 = 220 trials scored', ga1.best === ga2.best && ga1.sharpe === ga2.sharpe && ga1.trials === 220 && ga1.top.length === 5 && ga1.top[0].sharpe >= ga1.top[4].sharpe, ga1.trials);
const d1 = E.deflatedSharpe(0.126, 1, 252), d100 = E.deflatedSharpe(0.126, 100, 252), d1k = E.deflatedSharpe(0.126, 1000, 252); ok('deflated Sharpe: more trials → higher SR₀ hurdle, lower DSR; N = 1 → SR₀ = 0', d1.sr0 === 0 && d100.sr0 < d1k.sr0 && d1.dsr > d100.dsr && d100.dsr > d1k.dsr && d1.dsr > 0.95, [d1.dsr, d100.dsr, d1k.dsr]);
const cv = E.cpcv(6, 2, 600, 1); ok('CPCV: C(6,2) = 15 splits, φ = 5 backtest paths, embargo drops the group after each test group', cv.nSplits === 15 && cv.paths === 5 && cv.splits.every((s) => s.test.length === 2) && cv.splits[0].train.join() === '3,4,5' && E.cpcv(6, 2, 600).splits[0].train.join() === '2,3,4,5', cv.splits[0]);
ok('inverse stress: bisection finds the −10 % move that costs $20k', near(E.inverseStress([{ value: 1e5 }, { value: 5e4, beta: 2 }], 2e4).shock, -0.1, 1e-9) && E.inverseStress([{ value: 10 }], 1e6).shock === null);
const arms = [{ wins: 5, losses: 20 }, { wins: 30, losses: 10 }, { wins: 10, losses: 10 }], tsr = V.rng(9), cnt = [0, 0, 0]; for (let i = 0; i < 300; i++) cnt[E.thompson(arms, tsr).pick]++; ok('Thompson sampling: the best arm wins ≥ 85 % of draws', cnt[1] >= 255, cnt);
const twn = E.shadowTwin([{ id: 1, pnl: -500, size: 10000, mae: -0.05 }, { id: 2, pnl: 300, size: 10000, mae: -0.01 }], { stopPct: 0.02 }); ok('shadow twin: a 2 % stop caps the −$500 trade at −$200 (+$300 vs actual)', twn.rows[0].twin === -200 && twn.actual === -200 && twn.twin === 100 && twn.delta === 300, twn);
const ruleSet = [{ if: ['ch', '>', 3], then: 'A' }, { if: [['ch', '<', -3], ['bots', '>', 0]], then: 'B' }, { any: true, if: [['x', '==', 1], ['y', '==', 1]], then: 'C' }, { if: ['px', 'crosses_above', 100], then: 'D' }, { if: ['ch', 'constructor', 1], then: 'EVIL' }];
ok('IF-THEN automator: AND / OR / crosses, unknown operators never fire (no eval)', E.ifThen(ruleSet, { ch: -4, bots: 1, x: 0, y: 1, px: 101 }, { px: 99 }).join() === 'B,C,D' && E.ifThen(ruleSet, { ch: 5, bots: 0, x: 0, y: 0, px: 101 }, { px: 102 }).join() === 'A');
const by = E.bayes3(null, [[0.8, 0.1, 0.1], [0.7, 0.2, 0.1]]); ok('Bayesian 3-agent co-pilot: posterior ∝ prior × likelihoods, sums to 1', near(by.bull + by.bear + by.risk, 1, 1e-12) && by.lead === 'bull' && near(by.bull, 0.56 / 0.59, 1e-12));
const rg = E.rag(['bought SOL breakout stopped out', 'AAPL earnings gap fade worked', 'SOL funding flip squeeze'], 'SOL squeeze', 2); ok('journal RAG: TF-IDF cosine ranks the matching note first', rg[0].i === 2 && rg.length === 2 && rg[0].score > rg[1].score);
const mm = E.mfeMae({ side: 'long', entry: 100, exit: 103 }, [{ h: 108, l: 98 }, { h: 105, l: 99 }]); ok('MFE / MAE: +8 % / −2 %, realised 3 %, missed 5 %, efficiency 0.375', near(mm.mfe, 8, 1e-9) && near(mm.mae, -2, 1e-9) && near(mm.missed, 5, 1e-9) && near(mm.efficiency, 0.375, 1e-9));
ok('Kelly f* = p − (1−p)/b; historical CVaR ≥ VaR', near(E.kelly(0.55, 1), 0.1, 1e-12) && (() => { const v = E.varCvar(Array.from({ length: 2000 }, N), 0.95); return v.cvar >= v.var && near(v.var, 1.645, 0.2); })());

/* ── quant panels ── */
const M1 = E.merton(100, { seed: 1 }), M2 = E.merton(100, { seed: 1 }); ok('Merton cone: 100 seeded paths, reproducible, P10 ≤ P25 ≤ P50 ≤ P75 ≤ P90 at every step', M1.paths.length === 100 && M1.bands.p50.every((v, i) => M1.bands.p10[i] <= M1.bands.p25[i] && M1.bands.p25[i] <= v && v <= M1.bands.p75[i] && M1.bands.p75[i] <= M1.bands.p90[i]) && M1.bands.p50[60] === M2.bands.p50[60]);
const M0 = E.merton(100, { seed: 1, lambda: 0, sigma: 0.05, mu: 0.1, T: 1, paths: 400 }); ok('Merton cone: λ = 0 median within 1 % of S₀e^{(μ−σ²/2)T}', near(M0.bands.p50[60], 100 * Math.exp(0.1 - 0.00125), 1.1), M0.bands.p50[60]);
ok('Merton cone: Kelly f* = μ / (σ² + λ(μJ² + σJ²)), CVaR ≥ VaR, +EV flag', near(M1.kelly, 0.05 / (0.36 + 3 * (0.0016 + 0.0064)), 1e-12) && M1.cvar95 >= M1.var95 && M1.positive === M1.ev > 0);
const lz = E.lorenz(4000); ok('Lorenz attractor: bounded butterfly (|x| < 25, 0 < z < 55)', [...Array(4000).keys()].every((i) => Math.abs(lz[i * 3]) < 25 && lz[i * 3 + 2] > 0 && lz[i * 3 + 2] < 55));
const lyap = E.lyapunov(); ok('Lorenz λ₁ (Benettin) ≈ 0.906', near(lyap, 0.906, 0.08), lyap);
ok('Rössler attractor: finite, chaotic band', (() => { const rs = E.rossler(3000); return [...rs].every(Number.isFinite) && Math.max(...rs.filter((_, i) => i % 3 === 0)) > 5; })());
const rw = Array.from({ length: 1024 }, N); let acc = 0; const lev = rw.map((x) => (acc += x)); ok('Hurst: white noise ≈ 0.5, a random-walk level series ≈ 1', E.hurst(rw) > 0.4 && E.hurst(rw) < 0.65 && E.hurst(lev) > 0.85, [E.hurst(rw), E.hurst(lev)]);
ok('permutation entropy: noise ≈ 1, monotone = 0', E.permEntropy(rw) > 0.98 && E.permEntropy(Array.from({ length: 100 }, (_, i) => i)) === 0);
const er = E.eigenRisk(Rf.slice(0, 4)); ok('eigen-risk sonar: factor shares sum to 1, top factor dominates a 1-factor world, −3σ = 3·σ', near(er.share.reduce((a, b) => a + b, 0), 1, 1e-9) && er.share[0] > 0.5 && near(er.loss3s, 3 * er.sigma, 1e-12));
const ls = E.lsystem('F', { F: 'F[+F]F[-F]F' }, 3), tu = E.turtle(ls, 0.4, 1); ok('L-system lightning: F → F[+F]F[-F]F, 3 iterations = 125 F segments', (ls.match(/F/g) || []).length === 125 && tu.length === 125 * 5);
const hf = E.hopf(8, 32); ok('Hopf fibration: 8 fibres × 32 points, finite; Clifford torus points finite', hf.length === 8 && hf.every((f) => f.fib.length === 32 && f.fib.every((p) => p.every(Number.isFinite))) && E.clifford(1, 2).every(Number.isFinite));
const sg = E.sharpeGrid(cl, [5, 10, 50], [20, 40]); ok('Sharpe surface: fast × slow grid, fast ≥ slow = 0', sg.length === 3 && sg[0].length === 2 && sg[2][0] === 0 && sg[2][1] === 0 && Number.isFinite(sg[0][0]));
ok('30+ named edge engines, each backed by an implementation or a coded feature', V.ENGINES.length >= 30 && V.ENGINES.every(([, fn]) => typeof E[fn] === 'function' || ['sonar', 'voice', 'recorder'].includes(fn)), V.ENGINES.length);

const coreS = src('src/v175core.js'), uiS = src('src/v175.js'), wkS = src('src/v175work.js');
/* panel renderers: run every kind against a recording 2D context (as the 3D Spatial worker does with OffscreenCanvas) */
global.Path2D = class { constructor() { this.n = 0; } moveTo() { this.n++; } lineTo() { this.n++; } arc() { this.n++; } closePath() {} };
const mockCtx = () => { const calls = { n: 0, stroke: 0, fill: 0, text: [] }; const g = new Proxy({}, { get: (t, k) => (k === 'calls' ? calls : k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : k === 'createConicGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'fillText' ? (s) => { calls.text.push(String(s)); calls.n++; } : typeof k === 'string' && /^(fillStyle|strokeStyle|lineWidth|font|textAlign|textBaseline|globalCompositeOperation|globalAlpha)$/.test(k) ? t[k] : (...a) => { calls.n++; if (k === 'stroke') calls.stroke++; if (k === 'fill' || k === 'fillRect') calls.fill++; }), set: (t, k, v) => { t[k] = v; return true; } }); return g; };
const base = { W: 600, H: 300, d: 1, t: 12.5 }, ST2 = { core: Object.assign({ mode: 'STANDBY', active: 0, real: 0, demo: 0, fx: [{ k: 3, age: 0.2, seed: 7 }] }, base), attr: Object.assign({ data: { lz: E.lorenz(500), rs: E.rossler(500) } }, base), cone: Object.assign({ data: (() => { const m = E.merton(100, { paths: 20, steps: 30 }); return { bands: m.bands, paths: m.paths, steps: m.steps }; })(), hover: { x: 0.5, y: 0.5 } }, base), sonar: Object.assign({ eig: { syms: ['BTC', 'ETH'], top: [0.7, -0.7], loss3s: 0.04 } }, base), fire: Object.assign({ v: new Float32Array(180).fill(0.3), f: new Float32Array(180).fill(0.5), rows: 6, cols: 30, names: V.SQUAD.map((q) => q[1]) }, base), lat: Object.assign({ b: [[1, 2, 0], [0, 1, 1]], mx: 3, n: 40, hi: V.histo([0.2, 3, 40]) }, base) };
const rr = V.R.KINDS.map((k) => { const g = mockCtx(), memo = {}; try { V.R[k](g, ST2[k], memo); V.R[k](g, ST2[k], memo); return [k, g.calls.n > 4 && (g.calls.stroke + g.calls.fill) > 0, g.calls.text]; } catch (e) { return [k, false, e.message]; } });
ok('panel renderers (core · attr · cone · sonar · fire · lat) are pure and draw from a state snapshot (worker-safe, no DOM)', V.R.KINDS.length === 6 && rr.every((x) => x[1]) && !/document|window\.|\$1\(/.test(coreS.slice(coreS.indexOf('const R = V.R'), coreS.indexOf('SMA-crossover Sharpe surface'))), rr.filter((x) => !x[1]));
ok('4D core renderer: STANDBY banner when no bot runs; cone renderer shows the hover crosshair P10 / P50 / P90', rr[0][2].some((t) => /STANDBY · no bot running/.test(t)) && ['P90', 'P50', 'P10'].every((p) => rr[2][2].some((t) => t.startsWith(p))));
ok('off-thread rendering: Working Bots canvases transferControlToOffscreen → 3D Spatial worker, per-frame snapshot + one-time big payloads, main-thread fallback', /transferControlToOffscreen\(\)/.test(uiS) && /render: 'frame'/.test(uiS) && /if \(s\.data === P\.sent\) delete s\.data/.test(uiS) && /V175\.R\[kind\]\(g, s, memo\)/.test(uiS) && /m\.render === 'init'/.test(wkS) && /LANE === 'spatial'/.test(wkS) && /V175\.R\.KINDS\.indexOf\(m\.kind\) >= 0/.test(wkS));

/* ── static ── */const ui = src('src/v175.js'), core = src('src/v175core.js'), wk = src('src/v175work.js'), css = src('src/style.css'), bld = src('build.py'), html = src('src/index.html'), py = src('serve.py');
const css175 = css.slice(css.indexOf('/* ═══ v17.5'));
ok('build: v175core + v175 after v173 and before boot; WORKER175_SRC = v175core + v175work', /"v173\.js", "v175core\.js", "v175\.js"\]/.test(bld) && /\+ V172 \+ order\[order\.index\("boot\.js"\):\]/.test(bld) && /\("v175core\.js", "v175work\.js"\)/.test(bld) && /WORKER175_SRC/.test(bld));
const HEX = new Set(['#07080b', '#0d1117', '#f5c84b', '#2fd08a', '#ff5a5f', '#9a917a', '#d8cfb6', '#000']), RGBA = new Set(['245,200,75', '47,208,138', '255,90,95', '216,207,182', '154,145,122', '0,0,0']);
const hexes = (s) => (s.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((x) => x.toLowerCase()), rgbs = (s) => (s.match(/rgba?\((\d+,\d+,\d+)/g) || []).map((x) => x.replace(/rgba?\(/, ''));
const rgbVars = [ui.match(/RGB = \{[^}]+\}/), core.match(/RGBc = \{[^}]+\}/)].map((m) => (m ? m[0] : '')).join(' ').match(/'(\d+,\d+,\d+)'/g).map((x) => x.replace(/'/g, ''));
const badHex = [...hexes(ui), ...hexes(core), ...hexes(css175)].filter((h) => !HEX.has(h));
ok('palette lock: every colour literal in v17.5 JS + CSS is one of the pre-v17.0 Obsidian & Gold tokens', !badHex.length && [...rgbs(css175), ...rgbs(ui), ...rgbs(core), ...rgbVars].every((t) => RGBA.has(t)) && rgbVars.length >= 10, { badHex, badRgb: [...rgbs(css175), ...rgbs(ui), ...rgbs(core)].filter((t) => !RGBA.has(t)) });
ok('palette lock: pre-v17.0 tokens untouched (html #07080B, v16.6 dock #F5C84B, --acc:#D4AF37, theme default obsidian)', /html\{background:#07080B;color-scheme:dark\}/.test(css) && /\.v166-dock\{[^}]*#07080B/.test(css) && /--acc:#D4AF37;--acc2:#CBD5E1/.test(css) && /ST\.theme\) \|\| 'obsidian'/.test(src('src/themes.js')));
ok('palette lock: the < 820 px mobile block for v17.5 adds layout only, no new colours', /@media \(max-width:819px\)\{[\s\S]*\.x175-sqtop/.test(css175) && !/#[0-9a-f]{3,6}|rgba?\(/i.test(css175.slice(css175.indexOf('@media (max-width:819px)'))));
ok('strict CSP kept: worker-src self blob (for the 8 lanes), no unsafe-eval; v17.5 code has no eval / Function / innerHTML / inline handlers', /worker-src 'self' blob:/.test(html) && !/unsafe-eval/.test(html) && !/\beval\(|new Function|\.innerHTML\s*=|onclick=/.test(ui + core + wk));
ok('mesh UI: 8 dedicated Workers from one blob, transfer list for Float64Array, inline fallback, timeout, hibernation state', /new Worker\(this\.url, \{ name: 'exterm-' \+ k \}\)/.test(ui) && /a instanceof Float64Array\)\.map\(\(a\) => a\.buffer\)/.test(ui) && /'INLINE'/.test(ui) && /'HIBERNATE'/.test(ui) && /lane timeout/.test(ui));
ok('mesh UI: serve.py lanes polled from /api/lanes with the session token', /fetch\('\/api\/lanes', \{ headers: \{ 'X-ExTerm': m\.content \} \}\)/.test(ui));
ok('frame budget: one rAF driver, ≤ 0.6 ms of canvas work per frame (target ≤ 1.2 ms), 0 fps for hidden / off-screen canvases, no layout reads in the frame', /BUDGET: 0\.6/.test(ui) && /if \(!it\.vis\) \{ it\.fps = 0; continue; \}/.test(ui) && /new IntersectionObserver/.test(ui) && /new ResizeObserver\(\(es\) => \{ for \(const e of es\) SIZE\.set/.test(ui) && /!document\.hidden && \(it && this\.io \? it\.inView/.test(ui));
const toolsBlk = ui.slice(ui.indexOf('const V171_TOOLS'), ui.indexOf('U.TOOLS ='));
ok('search: "Search any stock, coin, or paste meme coin CA…" + "Use Active Chart Symbol" in every tool + the Briefing', /Search any stock, coin, or paste meme coin CA…/.test(ui) && /Use Active Chart Symbol/.test(ui) && ['markets', 'whales', 'opts', 'futs', 'heat', 'pulse', 'desk', 'lab', 'fleet', 'ai', 'port', 'journal'].every((t) => toolsBlk.includes("'" + t + "'")) && /#x17Brief/.test(ui));
ok('squad UI: STANDBY until a real bot runs or "Explore Live Demo"; demo feeds the squad only, never the global bus', /'Explore Live Demo'/.test(ui) && /src: 'demo'/.test(ui) && !/emit\([^)]*src: 'demo'/.test(ui) && /realBots\(\) > 0\) \{ Squad\.demoOn = false/.test(ui) && /STANDBY · no bot running/.test(core));
ok('squad UI: 4D core (Clifford torus + Hopf fibration + Kerr ring + L-system) + 8 panels', ['CLIFFORD TORUS', 'HOPF FIBRATION', 'KERR RING', 'L-SYSTEM', '3D Lorenz-Rössler Attractor', '100-Path Merton Jump-Diffusion Cone', 'Sweeping Eigen-Risk Sonar', 'Sub-ms Firing Matrix', 'Events/s + p99 Latency', 'Squad KPIs', 'Worker Mesh', '30 Edge Engines'].every((s) => (ui + core).includes(s)));
ok('3D layers UI: drawer + IndexedDB presets (exterm-v175), v17.1 gates OB / L2 on the same state', /indexedDB\.open\('exterm-v175', 1\)/.test(ui) && /'3D Layers'/.test(ui) && /lay\('ob'\)/.test(src('src/v171.js')) && /lay\('l2'\)/.test(src('src/v171.js')) && /this\.geo = \{ g, P, X, Y, C/.test(src('src/v171.js')));
const scBlk = ui.slice(ui.indexOf('const SCENES'), ui.indexOf('const Scenes'));
ok('2D | 3D pills: On-Chain, Options, Futures, Screener, Pulse, Derivs, Quant Lab, Copilot, Portfolio, Ctrl+K carousel (2D stays default)', ['whales', 'opts', 'futs', 'heat', 'pulse', 'desk', 'lab', 'ai', 'port', 'grok'].every((t) => scBlk.includes(' ' + t + ": '")) && /Scenes\.mode\[t\] \|\| '2D'/.test(ui));
ok('Shock Lab UI: 4 sliders (Order Size $, Book Depth %, Vol Multiplier, Spoof Pull %) + Stress-Test My Open Positions & Active Bots', ['Order Size $', 'Book Depth %', 'Vol Multiplier', 'Spoof Pull %', 'Stress-Test My Open Positions & Active Bots'].every((s) => ui.includes(s)));
ok('hotkeys: Voice HUD Shift+V (chart keeps v17.0 voice commands), 60 s Flight Recorder Shift+R', /e\.key === 'V'/.test(ui) && /e\.key === 'R'/.test(ui) && /now - this\.buf\[0\]\.t > 60000/.test(ui) && /speechSynthesis/.test(ui));
ok('serve.py: 4 isolated ProcessPoolExecutor lanes, allow-listed jobs, size caps, /api/lanes + /api/lanes/run, --no-lanes', /class Lanes:/.test(py) && /ProcessPoolExecutor\(max_workers=1\)/.test(py) && /"ingest", "Market \/ WS Ingest"/.test(py) && /def lane_args_ok/.test(py) && /"\/api\/lanes\/run"/.test(py) && /--no-lanes/.test(py));
ok('version 17.5 everywhere it ships (serve.py, package.json, APK build, release packager, About)', /VERSION = "17\.5"/.test(py) && /"version": "17\.5\.0"/.test(src('package.json')) && /"17\.5", "1750"/.test(src('tools/build_apk.py')) && /V = "17\.5"/.test(src('tools/package_release.py')) && /ExTerm v17\.5 · Official Release/.test(html));
ok('license header on every v17.5 file', [ui, core, wk].every((s) => s.startsWith('/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved.')));
ok('privacy: no personal paths, emails or usernames in v17.5 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term'].join('|'), 'i').test(ui + core + wk));

console.log(`\nv17.5: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
