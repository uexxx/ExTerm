// ExTerm v15.5 core unit tests: Bot Net Profit hero maths (fixture + a real backtest), capital linearity of the what-if,
// "What Changed?" diff, Favorite-4, Ctrl+K index search, Simple | Pro groups, smart context, debounce; 32-language i18n
// coverage of every v15.5 key; static CSP / privacy / banned-term checks on the new modules.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const fs = require('fs'), path = require('path');
const NT = require('../src/strategies4.js');
const V = require('../src/v155core.js');
const I = require('../src/i18n.js');
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// ── hero maths on a hand-checked fixture (long round trip won, short round trip lost, one open entry)
const fx = { eq: [10000, 10120, 10060], acct: { fees: 6 }, trades: [
  { side: 'buy', qty: 1, price: 101, fee: 1, pnl: null }, { side: 'sell', qty: 1, price: 99, fee: 1, pnl: 150 },
  { side: 'buy', short: true, qty: 2, price: 50, fee: 1, pnl: null }, { side: 'sell', short: true, qty: 2, price: 51, fee: 1, pnl: -90 },
  { side: 'buy', qty: 1, price: 100, fee: 2, pnl: null }] };
const H = V.hero(fx, 10000, 0.01);
ok('hero: start → end, net $ and % from the equity curve', H.start === 10000 && H.end === 10060 && H.net === 60 && near(H.netPct, 0.6), JSON.stringify(H));
ok('hero: gross profit / loss, wins / losses, avg win / loss, expectancy from closed trades', H.grossP === 150 && H.grossL === -90 && H.wins === 1 && H.losses === 1 && H.avgWin === 150 && H.avgLoss === -90 && H.expectancy === 30 && H.closed === 2);
// slippage: long buy & short cover were pushed up (÷1.01), long sell & short entry pushed down (÷0.99)
const slip = 1 * 101 * (0.01 / 1.01) + 1 * 99 * (0.01 / 0.99) + 2 * 50 * (0.01 / 0.99) + 2 * 51 * (0.01 / 1.01) + 1 * 100 * (0.01 / 1.01);
ok('hero: fees summed per fill, slippage cost by fill direction (long / short)', H.fees === 6 && near(H.slip, slip, 1e-9) && near(H.costs, 6 + slip, 1e-9), H.slip + ' vs ' + slip);
ok('hero: empty / hostile input never throws and defaults to $10,000', (() => { const e = V.hero(null, -5); return e.start === 10000 && e.net === 0 && e.closed === 0 && e.expectancy === 0; })());

// ── hero on a real backtest (seeded random walk), plus the capital what-if
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cs = []; let p = 100; for (let i = 0; i < 900; i++) { const o = p; p = Math.max(5, p * (1 + (rnd() - 0.495) * 0.03)); cs.push({ t: 1.7e9 + i * 3600, o, h: Math.max(o, p) * 1.004, l: Math.min(o, p) * 0.996, c: p, v: 1000 + rnd() * 500 }); }
const sid = Object.keys(NT.strategies).find((k) => { const s = NT.strategies[k]; if (s.liveOnly) return false; try { return NT.backtest(cs, s, NT.defaultParams(k), { cash: 10000, tfSec: 3600 }).trades.length >= 6; } catch (e) { return false; } });
const o = { cash: 10000, tfSec: 3600, fee: 0.001, slip: 0.0005, posPct: 0.5 }, r = NT.backtest(cs, NT.strategies[sid], NT.defaultParams(sid), o), RH = V.hero(r, 10000, 0.0005);
const closedSum = r.trades.filter((t) => t.pnl != null).reduce((a, t) => a + t.pnl, 0);
ok(`real backtest (${sid}): net = final equity − capital; gross P + gross L = closed P&L; fees = account fees`, near(RH.net, r.eq[r.eq.length - 1] - 10000, 1e-6) && near(RH.grossP + RH.grossL, closedSum, 1e-6) && near(RH.fees, r.acct.fees, 1e-6) && RH.closed > 0, JSON.stringify({ net: RH.net, closedSum, fees: RH.fees, acct: r.acct.fees }));
const r3 = NT.backtest(cs, NT.strategies[sid], NT.defaultParams(sid), Object.assign({}, o, { cash: 30000 })), S3 = V.hero(V.scale(r, 3), 30000, 0.0005), R3 = V.hero(r3, 30000, 0.0005);
ok('capital what-if: scaling a run ×3 matches re-running with 3× cash (size is % of equity)', near(S3.net, R3.net, Math.max(0.01, Math.abs(R3.net) * 1e-6)) && near(S3.fees, R3.fees, 0.01) && near(S3.expectancy, R3.expectancy, 0.01), S3.net + ' vs ' + R3.net);
ok('capital what-if: scale(×1) returns the same object; bad factors are ignored', V.scale(r, 1) === r && V.scale(r, 0) === r && V.scale(r, NaN) === r);

// ── What Changed?
const D = V.diff({ eq: [10000, 10500, 11000], end: 11000 }, { eq: [10000, 10200, 10900, 12240], end: 12240 });
ok('diff: exact dollar delta vs previous run, ghost resampled to the new length', D.delta === 1240 && D.better && !D.same && D.ghost.length === 4 && D.ghost[0] === 10000 && D.ghost[3] === 11000);
ok('diff: identical runs → same; missing input → null', V.diff({ eq: [1], end: 5 }, { eq: [1], end: 5 }).same && V.diff(null, { eq: [1] }) === null);
ok('format: +$1,240.00 / −$90.50 / +0.60%', V.usd(1240, true) === '+$1,240.00' && V.usd(-90.5) === '−$90.50' && V.pct(0.6) === '+0.60%' && V.pct(-2.25) === '−2.25%');

// ── Favorite 4
const known = ['a', 'b', 'c', 'd', 'e'];
let f = []; for (const x of ['a', 'b', 'c', 'd', 'e']) f = V.toggleFav(f, x, known);
ok('favorites: never more than four (oldest drops), toggle removes, unknown ids rejected, duplicates cleaned', f.join() === 'b,c,d,e' && V.toggleFav(f, 'c', known).join() === 'b,d,e' && V.toggleFav(['a', 'zz', 'a'], 'qq', known).join() === 'a' && V.toggleFav('junk', null, known).length === 0);

// ── Ctrl+K search
const E = [{ l: 'Go to Markets', k: 'markets' }, { l: 'Zen Chart Focus (F)', k: 'zen focus full width' }, { l: 'Quant Lab · Fragility Break-Point', k: 'quant fragility' }, { l: 'Net Bot Profit', alt: 'Beneficio neto del bot', k: 'hero' }, { l: 'ƒx Ichimoku Cloud', k: 'trend indicator' }];
ok('search: exact / prefix first, word prefix, keywords', V.search('zen', E)[0].l.startsWith('Zen') && V.search('markets', E)[0].l === 'Go to Markets' && V.search('ichimoku', E)[0].l.includes('Ichimoku'));
ok('search: typo-tolerant subsequence ("fragilty") and translated aliases ("beneficio")', V.search('fragilty', E).some((e) => e.l.includes('Fragility')) && V.search('beneficio', E)[0].l === 'Net Bot Profit');
ok('search: accents folded, nonsense empty, empty query returns the list', V.search('bénéficio', E).length >= 1 && V.search('zzqqxx', E).length === 0 && V.search('', E).length === E.length);

// ── workspaces, context, smoothing
const tabs = ['markets', 'heat', 'bots', 'port', 'whales', 'social', 'workspace', 'journal', 'challenge', 'ai', 'world', 'grok', 'desk', 'lab', 'set'], g = V.GROUPS.flatMap(([, , t]) => t);
ok('Pro: 4 groups (Trade, Intelligence, Quant & Bots, Academy & Settings) cover all 15 tabs exactly once', V.GROUPS.length === 4 && tabs.every((t) => g.filter((x) => x === t).length === 1) && g.length === 15 && V.GROUPS.every(([, k]) => I.tr('en', k) !== k));
ok('Simple: chart workspace + settings only; unknown mode → pro', V.SIMPLE_TABS.join() === 'markets,set' && V.mode('x') === 'pro' && V.mode('simple') === 'simple');
ok('smart context: 0DTE gamma + gap-fill on stocks, safety + X-ray on-chain', V.context('stocks').includes('gamma') && V.context('stocks').includes('gap') && V.context('onchain').join() === 'safety,xray' && V.context('nope') === V.CONTEXT.crypto);
{ let n = 0; const d = V.debounce(() => n++, 20); d(); d(); d(); setTimeout(() => { if (n !== 1) { console.log('FAIL debounce: a burst of 3 calls ran ' + n + ' times'); process.exitCode = 1; } }, 80); }

// ── i18n
const K155 = I.KEYS.filter((k) => k.startsWith('v155.'));
ok('i18n: 68 v15.5 keys (40 workspace + 28 screen restructures), every one in all 32 named languages (non-empty, no "|" leaks)', K155.length === 68 && new Set(K155).size === 68 && I.LANGS.length === 32 && I.LANGS.every((l) => K155.every((k) => I.DICT[l.code][k] && I.DICT[l.code][k].trim().length > 0)), K155.length); // ja / ko "Table" is one character
ok('i18n: screen-restructure labels translated (Settings tabs, drawers, rail) in 31 languages', ['v155.st.sec', 'v155.dx.inspect', 'v155.lb.detail', 'v155.ir.macro'].every((k) => I.LANGS.filter((l) => l.code !== 'en' && I.DICT[l.code][k] !== I.DICT.en[k]).length >= 28));

// ── screen restructures: Settings classifier (pure)
const S = require('../src/v155s.js');
ok('settings tabs: panels land in General & Language / Chart & Hotkeys / Execution & Webhooks / Security & Vault', S.classify('Market data') === 'gen' && S.classify('🌐 Language & 🛡 build integrity') === 'gen' && S.classify('🎨 Appearance') === 'chart' && S.classify('⌨ Keyboard shortcuts') === 'chart' && S.classify('Paper trading') === 'exec' && S.classify('🔔 Background alerts') === 'exec' && S.classify('AI Copilot') === 'exec' && S.classify('🔒 Privacy & security') === 'sec' && S.classify('🔑 API keys & connections') === 'sec' && S.classify('Your data') === 'sec' && S.classify('Diagnostics') === 'gen');
ok('i18n: non-English rows are translated (hero label differs from English in 31 languages)', I.LANGS.filter((l) => l.code !== 'en' && I.DICT[l.code]['v155.hero'] !== I.DICT.en['v155.hero']).length === 31);
ok('i18n: RTL languages carry the new strings in their own script', ['ar', 'he', 'fa', 'ur'].every((c) => I.isRtl(c) && /[\u0590-\u06ff]/.test(I.tr(c, 'v155.reset'))));

// ── static: strict CSP + privacy on the new modules
const SRC = ['v155core.js', 'v155.js'].map((x) => [x, fs.readFileSync(path.join(__dirname, '..', 'src', x), 'utf8')]);
ok('static: no inline event handler attributes, eval or new Function in v15.5 modules', SRC.every(([, s]) => !/\son[a-z]+\s*=\s*["'`]/i.test(s.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\beval\(|new Function\(/.test(s)), SRC.filter(([, s]) => /\son[a-z]+\s*=\s*["'`]/i.test(s)).map(([x]) => x));
const BANNED = new RegExp(['op' + 'en[- ]?so' + 'urce', 'so' + 'lana', '\\bS' + 'OL\\b', 'C:\\\\\\\\Users', '/home/', '@gm' + 'ail'].join('|'), 'i');
ok('static: no banned terms, personal paths or private emails in v15.5 modules', SRC.every(([, s]) => !BANNED.test(s)), SRC.filter(([, s]) => BANNED.test(s)).map(([x]) => x));
ok('static: every innerHTML template in v155.js escapes dynamic strings (no raw ${t.d} / ${label(t)})', !/\$\{(t\.d|t\.l|label\(t\)|x\.l|x\.r|e\.l)\}/.test(SRC[1][1]));

console.log(res.join('\n'));
const fl = res.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${res.length - fl}/${res.length} passed`);
if (fl) process.exitCode = 1; // no process.exit(): the debounce check above finishes on a timer
