// ExTerm v16.6 unit tests: typed-array tape ring (2,000 prints, Float64Array + Uint32Array), classification bits (whale / block /
// sweep / unusual), bitmask filter speed (< 1 ms over 2,000 prints) and correctness, < 0.2 ms per-frame core cost, strict
// market isolation (stocks · crypto · on-chain), pressure strip maths, 8 sub-tabs + aggregations, hover-pause, chart pins,
// AI Bridge tape export, static wiring, CSP, XSS, privacy.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 260)));
const fs = require('fs'), path = require('path');
const V = require('../src/v166core.js'), B = V.BIT;
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, ['serve.py', 'build.py'].includes(f) ? f : 'src/' + f), 'utf8');
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const { performance } = require('perf_hooks');

// 1. ring layout + overwrite
const r = new V.Ring();
ok('ring: 2,000 slots as Float64Array(ts, price, size, totalUsd) + Uint32Array(sideMask, venueId)', r.cap === 2000 && r.f instanceof Float64Array && r.f.length === 8000 && r.u instanceof Uint32Array && r.u.length === 4000);
for (let i = 0; i < 2500; i++) V.push(r, 1e12 + i * 5000, 100 + (i % 7), 1, 0, i % 2 ? 'sell' : 'buy', 1);
let sum = 0; for (let s = r.n - r.size; s < r.n; s++) sum += V.usd(r, s);
ok('ring: 2,500 pushes keep the newest 2,000, oldest overwritten, rolling USD sum exact', r.n === 2500 && r.size === 2000 && !r.has(499) && r.has(500) && V.ts(r, 2499) === 1e12 + 2499 * 5000 && Math.abs(r.sum - sum) < 1e-6);
ok('ring: invalid prints are dropped (no price / no timestamp)', V.push(r, 1e12, 0, 1, 0, 'buy', 1) === -1 && V.push(r, NaN, 1, 1, 0, 'buy', 1) === -1 && r.n === 2500);

// 2. classification
const c = new V.Ring(); const T0 = 1.7e12;
const s1 = V.push(c, T0, 10, 3000, 0, 'buy', 1), s2 = V.push(c, T0 + 10, 10, 15000, 0, 'sell', 2);
ok('classify: $30K print is Whale (gold), $150K is Block + Whale, side bits set', (V.mask(c, s1) & (B.WHALE | B.BUY)) === (B.WHALE | B.BUY) && !(V.mask(c, s1) & B.BLOCK) && (V.mask(c, s2) & (B.BLOCK | B.WHALE | B.SELL)) === (B.BLOCK | B.WHALE | B.SELL) && V.cls(V.mask(c, s1)) === 'gold' && V.type(V.mask(c, s2)) === 'Block Sell');
const sw = new V.Ring(), a1 = V.push(sw, T0, 100, 1, 0, 'buy', 1), a2 = V.push(sw, T0 + 200, 100.1, 1, 0, 'buy', 1), a3 = V.push(sw, T0 + 400, 100.2, 1, 0, 'buy', 1), a4 = V.push(sw, T0 + 3000, 100.3, 1, 0, 'buy', 1);
ok('classify: 3 buys ≤ 1 s apart lifting the offer → all three tagged Sweep (amber); a 2.6 s gap breaks it', [a1, a2, a3].every((s) => V.mask(sw, s) & B.SWEEP) && !(V.mask(sw, a4) & B.SWEEP) && V.cls(V.mask(sw, a2)) === 'amb' && V.type(V.mask(sw, a3)) === 'Sweep Buy');
const nw = new V.Ring(); V.push(nw, T0, 100, 1, 0, 'buy', 1); V.push(nw, T0 + 100, 99, 1, 0, 'buy', 1); const b3 = V.push(nw, T0 + 200, 98, 1, 0, 'buy', 1);
ok('classify: buys that walk the price down are not a sweep', !(V.mask(nw, b3) & B.SWEEP));
const un = new V.Ring(); for (let i = 0; i < 25; i++) V.push(un, T0 + i * 5000, 10, 10, 0, i % 2 ? 'buy' : 'sell', 1); const u1 = V.push(un, T0 + 2e5, 10, 31, 0, 'buy', 1), u2 = V.push(un, T0 + 3e5, 10, 25, 0, 'buy', 1);
ok('classify: Unusual = > 3× the buffer average print (needs 20+ prints)', (V.mask(un, u1) & B.UNUSUAL) && !(V.mask(un, u2) & B.UNUSUAL) && !(V.mask(c, s1) & B.UNUSUAL));
ok('classify: explicit USD wins (DEX swaps), size derived when missing', (() => { const x = new V.Ring(), s = V.push(x, T0, 2, 0, 50000, 'buy', 1); return V.usd(x, s) === 50000 && V.qty(x, s) === 25000 && (V.mask(x, s) & B.WHALE); })());

// 3. bitmask filter: correctness + speed over 2,000 prints
const big = new V.Ring(); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 2000; i++) V.push(big, T0 + i * 700, 100 + rnd() * 2, rnd() < 0.05 ? 3000 * rnd() : 50 * rnd(), 0, rnd() < 0.5 ? 'buy' : 'sell', 1 + (i % 9));
const out = new Uint32Array(2000), cnt = (m, mu, tr) => V.filter(big, m, mu, out, tr);
let wb = 0, ws = 0, all = 0, mu25 = 0; for (let s = 0; s < 2000; s++) { const m = V.mask(big, s); all++; if ((m & B.WHALE) && (m & B.BUY)) wb++; if ((m & B.WHALE) && (m & B.SELL)) ws++; if (V.usd(big, s) >= 25000) mu25++; }
ok('filter: All = 2,000, newest first', cnt(0, 0) === 2000 && out[0] === 1999 && out[1999] === 0);
ok('filter: Buys + Sells OR together (= All); Whales + Buys AND together (= whale buys only)', cnt(B.BUY | B.SELL, 0) === all && cnt(B.WHALE | B.BUY, 0) === wb && cnt(B.WHALE | B.SELL, 0) === ws && wb + ws === cnt(B.WHALE, 0) && wb > 0 && ws > 0);
ok('filter: min-USD input = Whales chip at $25K; Blocks ⊂ Whales', cnt(0, 25000) === mu25 && cnt(B.WHALE, 0) === mu25 && cnt(B.BLOCK, 0) <= mu25);
const trk = new Set([3]); const nt = cnt(B.TRACKED, 0, trk); let want = 0; for (let s = 0; s < 2000; s++) if (V.venue(big, s) === 3) want++;
ok('filter: Tracked chip follows the tracked venue / maker set live (no re-ingest)', nt === want && nt > 0 && cnt(B.TRACKED, 0, new Set()) === 0);
const masks = [0, B.WHALE, B.BLOCK, B.SWEEP, B.BUY, B.SELL, B.UNUSUAL, B.TRACKED, B.WHALE | B.BUY], times = [];
for (let k = 0; k < 400; k++) { const m = masks[k % masks.length], t0 = performance.now(); cnt(m, k % 3 ? 0 : 1000, trk); times.push(performance.now() - t0); }
ok('speed: bitmask filter over 2,000 prints < 1 ms (median of 400 runs across all chips)', med(times) < 1, med(times).toFixed(4) + ' ms');
const ft = []; for (let k = 0; k < 300; k++) { const t0 = performance.now(); V.push(big, T0 + 2e6 + k, 101, 1, 0, 'buy', 2); cnt(B.WHALE, 0); V.pressure(big); ft.push(performance.now() - t0); }
ok('speed: per-frame core (ingest + filter + pressure strip) < 0.2 ms median', med(ft) < 0.2, med(ft).toFixed(4) + ' ms');

// 4. market isolation
const E = V.engine();
E.ingest('BTC-USD', T0, 65000, 1, 0, 'buy', 'Coinbase'); E.ingest('AAPL', T0, 190, 100, 0, 'sell', 'NasdaqGS'); E.ingest('oc:solana:Pool111', T0, 2, 0, 30000, 'buy', 'MakerWallet111111111111111111111111');
E.ingest('ETH-USD', T0, 3000, 2, 0, 'sell', 'Coinbase'); E.ingest('BTC', T0, 1, 1, 0, 'buy', 'X');
ok('isolation: stocks, crypto and on-chain keep separate ring maps', E.m.crypto.rings.has('BTC-USD') && E.m.crypto.rings.has('ETH-USD') && !E.m.crypto.rings.has('AAPL') && E.m.stocks.rings.has('AAPL') && E.m.stocks.rings.has('BTC') && E.m.onchain.rings.has('oc:solana:Pool111') && E.m.stocks.rings.size === 2 && E.m.onchain.rings.size === 1);
ok('isolation: venue / maker tables are per market (Coinbase not in stocks or DEX)', E.m.crypto.ids.has('Coinbase') && !E.m.stocks.ids.has('Coinbase') && !E.m.onchain.ids.has('Coinbase') && E.name('AAPL', V.venue(E.ring('AAPL'), 0)) === 'NasdaqGS');
E.track('BTC-USD', 'Coinbase', true);
ok('isolation: tracking a crypto venue never tags stocks or DEX prints', E.m.crypto.tracked.size === 1 && E.m.stocks.tracked.size === 0 && E.m.onchain.tracked.size === 0 && V.filter(E.ring('AAPL'), B.TRACKED, 0, out, E.mk('AAPL').tracked) === 0 && V.filter(E.ring('ETH-USD'), B.TRACKED, 0, out, E.mk('ETH-USD').tracked) === 1);
const pre = E.ring('AAPL').n; for (let i = 0; i < 50; i++) E.ingest('BTC-USD', T0 + i, 65000, 1, 0, 'buy', 'Kraken');
ok('isolation: crypto flood leaves the stock ring untouched', E.ring('AAPL').n === pre && E.ring('BTC-USD').n === 51);
E.keep = 'BTC-USD'; for (let i = 0; i < V.MAX_SYMS + 5; i++) E.ingest('S' + i + '-USD', T0, 1, 1, 0, 'buy', 'X');
ok('engine: at most ' + V.MAX_SYMS + ' rings per market (least-recent evicted, the on-screen symbol never), other markets unaffected', E.m.crypto.rings.size === V.MAX_SYMS && E.m.crypto.rings.has('BTC-USD') && E.ring('BTC-USD').n === 51 && E.m.stocks.rings.size === 2 && E.m.onchain.rings.size === 1);
ok('marketOf: oc: → onchain, -USD/USDT/USDC → crypto, else stocks', V.marketOf('oc:eth:0xabc') === 'onchain' && V.marketOf('SOL-USDT') === 'crypto' && V.marketOf('MSFT') === 'stocks');

// 5. pressure strip
const pr = new V.Ring(); V.push(pr, T0, 10, 3000, 0, 'buy', 1); V.push(pr, T0 + 5000, 10, 1000, 0, 'sell', 1); V.push(pr, T0 + 9000, 10, 100, 0, 'buy', 1);
const P = V.pressure(pr);
ok('pressure: buy 31K (75.6%) vs sell 10K, net whale/block +$30K, avg print $13.67K', P.buy === 31000 && P.sell === 10000 && Math.abs(P.buyPct - 75.6097) < 1e-3 && P.whaleNet === 30000 && Math.abs(P.avg - 41000 / 3) < 1e-9 && P.n === 3);
ok('pressure: since-window counts only recent prints', V.pressure(pr, T0 + 4000).n === 2 && V.pressure(new V.Ring()).buyPct === 50);

// 6. tabs + aggregations
ok('sub-tabs: Trades · Positions · Holders / Institutions · Top Traders / Funds · Pre / Early · Tracking · DCA · Orders', V.TABS.map((t) => t[1]).join('|') === 'Trades|Positions|Holders / Institutions|Top Traders / Funds|Pre / Early|Tracking|DCA|Orders');
ok('chips: All · Whales ($25K+) · Blocks ($100K+) · Sweeps · Buys · Sells · Unusual (>3x) · Tracked', V.CHIPS.map((t) => t[1]).join('|') === 'All|Whales ($25K+)|Blocks ($100K+)|Sweeps|Buys|Sells|Unusual (>3x)|Tracked' && V.chipMask(['whale', 'buy']) === (B.WHALE | B.BUY) && V.chipMask([]) === 0);
const ag = new V.Ring();
V.push(ag, T0, 10, 100, 0, 'buy', 1); V.push(ag, T0 + 2e4, 10, 105, 0, 'buy', 1); V.push(ag, T0 + 4e4, 10, 95, 0, 'buy', 1); // maker 1: steady DCA buyer, $3K
V.push(ag, T0 + 1e4, 10, 5000, 0, 'buy', 2); V.push(ag, T0 + 3e4, 10, 4000, 0, 'sell', 2); // maker 2: big gross, net +$10K
V.push(ag, T0 + 5e4, 10, 10, 0, 'sell', 3); V.push(ag, T0 + 6e4, 10, 900, 0, 'sell', 3); V.push(ag, T0 + 7e4, 10, 50, 0, 'sell', 3); // maker 3: uneven seller
const A = V.agg(ag), id = (L) => L.map((a) => a.id).join();
ok('holders: net buyers by maker, largest first (sellers excluded)', id(V.holders(A)) === '2,1' && V.holders(A)[0].net === 10000);
ok('top traders / funds: by gross $', id(V.top(A)) === '2,3,1');
ok('pre / early: by first print time', id(V.early(A)) === '1,2,3' && V.early(A)[0].firstPx === 10);
ok('DCA: one-sided, ≥ 3 prints, size variation ≤ 25% (uneven seller excluded)', id(V.dca(A)) === '1' && V.dca(A)[0].side === 'buy' && V.dca(A)[0].cv < 0.05);

// 7. AI Bridge export + display helpers
const E2 = V.engine(); E2.ingest('SOL-USD', T0, 150, 1000, 0, 'buy', 'Coinbase'); E2.ingest('SOL-USD', T0 + 1000, 151, 10, 0, 'sell', 'Kraken'); E2.ingest('SOL-USD', T0 + 2000, 149, 300, 0, 'sell', 'Binance');
const tx = V.aiTape(E2, 'SOL-USD', T0 + 62000, 10);
ok('Copy Tape for AI: header, flow line, whale / block table with venues, task line', /^\[ExTerm Tape\] SOL-USD · crypto · last 3 prints/.test(tx) && /net whale\/block \(\$25K\+\) \$105\.3K/.test(tx) && /TOP RECENT WHALE \/ BLOCK PRINTS \(2 of 2\)/.test(tx) && /1m ago \| Whale Sell \| px 149 \| qty 300 \| \$44\.7K \| Binance/.test(tx) && /Block Buy \| px 150 .*Coinbase \| BLOCK/.test(tx) && !/Kraken/.test(tx) && /accumulating or distributing/.test(tx), tx);
ok('Copy Tape for AI: empty symbol says so', /no prints yet/.test(V.aiTape(E2, 'AAPL', T0, 10)));
ok('display: age, money, tags', V.age(T0 - 5000, T0) === '5s' && V.age(T0 - 7.2e6, T0) === '2h' && V.money(-1234567) === '−$1.23M' && V.tags(B.BLOCK | B.WHALE | B.SWEEP | B.UNUSUAL | B.TRACKED) === 'BLOCK · SWEEP · >3x · TRACKED');

// 7b. optional stock boost (user's own key) parsers
const fh = V.parseFinnhub('{"type":"trade","data":[{"s":"AAPL","p":190.5,"v":300,"t":1763450000000,"c":["1"]},{"s":"AAPL","p":0,"v":1,"t":1}]}'), al = V.parseAlpaca('[{"T":"success","msg":"authenticated"},{"T":"t","S":"AAPL","p":190.4,"s":120,"t":"2026-11-18T15:00:00Z","x":"V"}]');
ok('stock boost: Finnhub + Alpaca trade messages parse to prints (bad / control frames ignored), tick-rule side', fh.length === 1 && fh[0].price === 190.5 && fh[0].size === 300 && fh[0].ts === 1763450000000 && fh[0].venue === 'Finnhub' && al.length === 1 && al[0].ts === Date.parse('2026-11-18T15:00:00Z') && al[0].venue === 'Alpaca · V' && V.parseFinnhub('{"type":"ping"}').length === 0 && V.parseAlpaca('nope').length === 0 && V.tickSide(10, 11) === 'sell' && V.tickSide(11, 10) === 'buy' && V.tickSide(10, 0) === 'buy');

// 8. static wiring: UI behaviour that the browser E2E exercises end to end
const ui = src('v166.js'), core = src('v166core.js'), Bd = src('build.py'), css = src('style.css'), S = src('serve.py');
ok('build: v166core.js after v165core.js, v166.js after v165.js, right before boot.js', /"v165core\.js", "v166core\.js", (?:"v170core\.js", )?"v160\.js"/.test(Bd) && /"v165\.js", "v166\.js", (?:"v170\.js", )?"boot\.js"/.test(Bd));
ok('UI: 22 pooled row nodes over a virtual scroller, written with textContent, painted from requestAnimationFrame', /POOL = 22/.test(ui) && /requestAnimationFrame\(frame\)/.test(ui) && /textContent = V166\.type\(m\)/.test(ui) && /keyed by print sequence/.test(ui) && /translateY\('/.test(ui) && !/innerHTML = [^;]*V166\.type/.test(ui));
ok('UI: hover over the table auto-pauses (gold "Paused" pill) + manual Pause / Live toggle', /addEventListener\('mouseenter', \(\) => \{ U\.hover = true/.test(ui) && /addEventListener\('mouseleave', \(\) => \{ U\.hover = false/.test(ui) && /id="v166Pill" hidden>Paused</.test(ui) && /U\.manual \? 'Live' : 'Pause'/.test(ui) && /\.v166-pill\{background:#D4AF37/.test(css));
ok('UI: paused view keeps its snapshot (no re-filter on new prints while paused)', /U\.dirty && !paused\(\) && t0/.test(ui) && /force \|\| !paused\(\)/.test(ui));
ok('UI: clicking a print drops a gold marker on the active chart overlay', /r\._seq >= 0\) pin\(r\._seq\)/.test(ui) && /chart\.overlays\.push\(overlay\)/.test(ui) && /fillStyle = '#D4AF37'/.test(ui) && /ch\.tToX\(p\.t\)/.test(ui));
ok('UI: Copy Tape for AI hands the text to the AI Bridge (V165UI.lastCopy + preview)', /V165UI\.lastCopy = txt/.test(ui) && /#v165Pk/.test(ui) && /V166\.aiTape\(/.test(ui));
ok('UI: ingest from every Feed.trade print + stock last-sale tape via the launcher proxy, LAST SESSION TAPE when closed', /Feed\.tradeL\.push\(/.test(ui) && /YF\.chart\(sym, '1m', '1d'\)/.test(ui) && /'LAST SESSION TAPE'/.test(ui) && /q\.open === false \? 'last'/.test(ui) && /V164UI\.ex/.test(ui));
ok('UI: pressure strip + 8 tabs + 8 chips + min USD input', ['v166Buy', 'v166Sell', 'v166Whale', 'v166Avg', 'v166Min', 'data-v166t', 'data-v166f', 'Copy Tape for AI'].every((k) => ui.includes(k)));
ok('UI: stock boost keys live in sessionStorage only and a live boost replaces the 1-minute prints (no double count)', /sessionStorage\.setItem\(BK/.test(ui) && !/localStorage\.setItem\(BK/.test(ui) && /if \(boostLive\(\)\) \{ S\.last = Date\.now\(\); return; \}/.test(ui) && /type="password" autocomplete="off"/.test(ui));
ok('CSP: no inline handlers or eval in v16.6', !/\son[a-z]+=["']/i.test(ui + core) && !/\beval\(|new Function/.test(ui + core));
ok('XSS: table cells and toasts with dynamic text go through esc()', !/<td[^>]*>\$\{(?!esc\(|trk\()/.test(ui) && !/toast\(`[^`]*\$\{(?!esc\()[^`]*`/.test(ui) && /data-v166track="\$\{esc\(nm\)\}"/.test(ui));
ok('CSS: drawer, strip, chips, rows with RTL + narrow-screen rules', ['.v166-drawer', '.v166-strip', '.v166-chip.on', '.v166-r', '.v166-sess.last', 'html[dir="rtl"] .v166-strip', '@media (max-width:760px){.v166-drawer'].every((k) => css.includes(k)));
ok('privacy: no personal paths, emails, usernames or legacy product name in v16.6 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term', 'op' + 'en[- ]?so' + 'urce'].join('|'), 'i').test(ui + core));
ok('version 16.6: serve.py, footer, briefing (keeps v16.5 / v16.4 / v16.3 essentials)', /VERSION = "(16\.6|1[7-9]\.\d+)"/.test(S) && /ExTerm v(16\.6|1[7-9]\.\d+) · Official Release/.test(src('index.html')) && /V166\.HIGHLIGHTS/.test(src('v162.js')) && V.HIGHLIGHTS.length === 6 && ['AI Bridge tab', 'llm-signal', 'Discovery', 'HUD', 'Freqtrade', 'Two-Key Arming'].every((k) => V.HIGHLIGHTS.join().includes(k)));
ok('default-open tape: open unless the user explicitly hid it, 230px in-flow drawer, gold Hide / Live Tape toggle', /open: true, tab:/.test(ui) && /U\.open = o\.tape !== 'hidden'/.test(ui) && /tape: U\.open \? 'open' : 'hidden'/.test(ui) && /'▾ Hide Tape' : '▴ Live Tape'/.test(ui) && /mn\.after\(d\)/.test(ui) && /\.v166-drawer\{position:relative;flex:none;height:230px/.test(css) && /\.v166-tog\{[^}]*#F5C84B/.test(css));
ok('bottom telemetry dock: posStrip moved in, 6 quick-dock chips, BTC / ETH / SOL / SPY pills + flow delta, obsidian + gold', /\$1\('#v166DPos', k\)\.appendChild\(ps\)/.test(ui) && ['tape', 'whale', 'tracker', 'positions', 'depth', 'ai'].every((k) => ui.includes(`data-v166d="${k}"`)) && /\['BTC-USD', 'BTC'\], \['ETH-USD', 'ETH'\], \['SOL-USD', 'SOL'\], \['SPY', 'SPY'\]/.test(ui) && /id="v166DFlow"/.test(ui) && /\.v166-dock\{[^}]*#07080B/.test(css) && /mount\(\); show\(\); tele\(\);/.test(ui));

const fails = res.filter((x) => x.startsWith('FAIL'));
console.log(res.join('\n')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
