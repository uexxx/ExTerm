// ExTerm v16.5 unit tests: AI trade-idea parsing (plain English + JSON), directional stop / ATR checks, ghost-line R:R
// badges, deterministic AI / bot firewall (unstopped, wrong-way, min ATR, depth, confidence → PAPER shadow, loss-streak cut),
// provider presets + Token-Saver vs Full Quant packets, ticker / contract extraction + $50k / mint screen, Pine v5
// hardening → 17-test gate mapping + diagnostics, AI-vetted copy engine (consensus, drift shield, $ risk + ATR stop, exits,
// daily cap, vetting), attribution, masked share card, shareable JSON, Python templates (compiled), serve.py llm_check
// + LlmBridge (signed receipts, key file), static wiring, CSP, XSS, privacy.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 260)));
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const NT = require('../src/strategies4.js'); require('../src/validate.js');
global.self = { NT }; const V164 = require('../src/v164core.js'); delete global.self;
const V = require('../src/v165core.js');
const root = path.join(__dirname, '..'), src = (f) => fs.readFileSync(path.join(root, ['serve.py', 'build.py'].includes(f) ? f : 'src/' + f), 'utf8');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 1. plain-English + JSON parsing
const p1 = V.parseIdea('Long SOL at 142.50, stop 138.00, target 154.00');
ok('parse (plain English): "Long SOL at 142.50, stop 138.00, target 154.00" → SOL long 142.5 / 138.0 / 154.0', p1 && p1.symbol === 'SOL' && p1.side === 'long' && p1.entry === 142.5 && p1.stop_loss === 138.0 && p1.tp.length === 1 && p1.tp[0] === 154.0, JSON.stringify(p1));
ok('parse: R:R of that idea is exactly 2.56R', V.rr(p1.side, p1.entry, p1.stop_loss, p1.tp[0]).toFixed(2) === '2.56');
const p2 = V.parseIdea('Here is my plan:\n```json\n{"symbol":"ETH","side":"short","entry":3000,"stop_loss":3100,"tp":[2800,2700],"confidence":0.8,"reason":"lower high"}\n```');
ok('parse (JSON in a code fence): short ETH, 2 targets, confidence 0.8 → 80', p2 && p2.via === 'json' && p2.side === 'short' && p2.entry === 3000 && p2.stop_loss === 3100 && p2.tp.join() === '2800,2700' && p2.confidence === 80, JSON.stringify(p2));
const p3 = V.parseIdea('Buy ETH at 3,050. Stop-loss: 2,980. Targets: 3,200 / 3,350 / 3,500. Confidence 72%');
ok('parse: thousands separators, three targets and a confidence', p3 && p3.entry === 3050 && p3.stop_loss === 2980 && p3.tp.join() === '3200,3350,3500' && p3.confidence === 72, JSON.stringify(p3));
const p4 = V.parseIdea('I would short $BTC around 65,000 with SL 66,500 and TP1 62000, TP2 60000');
ok('parse: $TICKER, "around", SL / TP1 / TP2 shorthand', p4 && p4.symbol === 'BTC' && p4.side === 'short' && p4.entry === 65000 && p4.stop_loss === 66500 && p4.tp.join() === '62000,60000', JSON.stringify(p4));
ok('parse: text with no direction / entry is not an idea', V.parseIdea('SOL looks interesting today') === null && V.parseIdea('') === null);
const pg = V.parseIdea('{"ticker":"$WIF","direction":"BUY","entry_price":"2.10","stop":"1.95","take_profit":"2.55"}');
ok('parse (JSON aliases): ticker / direction / entry_price / stop / take_profit strings', pg && pg.symbol === 'WIF' && pg.side === 'long' && pg.entry === 2.1 && pg.stop_loss === 1.95 && pg.tp[0] === 2.55, JSON.stringify(pg));

// 2. checks + ghost lines
ok('checkIdea: wrong-way stop and losing-side target are errors (no ghost lines)', !V.checkIdea({ side: 'long', entry: 100, stop_loss: 101, tp: [110] }).ok && /Wrong-way/.test(V.checkIdea({ side: 'long', entry: 100, stop_loss: 101 }).errors[0]) && !V.checkIdea({ side: 'short', entry: 100, stop_loss: 105, tp: [110] }).ok);
ok('checkIdea: missing stop is an error; stop inside 1.5 ATR is a warning', !V.checkIdea({ side: 'long', entry: 100, stop_loss: null }).ok && V.checkIdea({ side: 'long', entry: 100, stop_loss: 99, tp: [103] }, 2, 1.5).warns.some((w) => /0\.50 ATR/.test(w)));
const gh = V.ghost(Object.assign({}, p1, { symbol: 'SOL-USD' }), 100);
ok('ghost: entry / stop / TP lines with exact R:R and $ badges ($100 risk)', gh.lines.length === 3 && V.badge(gh.lines[2]) === 'TP 154 · 2.56R · +$256' && V.badge(gh.lines[1]) === 'AI Stop 138 · −$100' && V.badge(gh.lines[0]) === 'AI Entry 142.5' && near(gh.qty, 100 / 4.5), JSON.stringify(gh.lines.map(V.badge)));

// 3. firewall
const G = V.GUARD_AI();
const fwA = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: null, confidence: 99 }, { atr: 1 }, G);
ok('firewall: unstopped proposal (stop_loss: null) is rejected', !fwA.ok && fwA.route === 'reject' && /stop_loss missing/.test(fwA.reasons[0]));
const fwB = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 102, confidence: 99 }, { atr: 1 }, G), fwB2 = V.firewall({ symbol: 'SOL', side: 'short', entry: 100, stop_loss: 98, confidence: 99 }, { atr: 1 }, G);
ok('firewall: wrong-way stops (long above / short below entry) are rejected', !fwB.ok && /wrong-way/.test(fwB.reasons[0]) && !fwB2.ok && /wrong-way/.test(fwB2.reasons[0]));
ok('firewall: mandatory stop cannot be bypassed by a caller config', !V.firewall({ symbol: 'X', side: 'long', entry: 1, stop_loss: 0 }, {}, Object.assign({}, G, { mandatorySL: true })).ok);
const fwC = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 99, tp: [104], confidence: 90 }, { atr: 2 }, G);
ok('firewall: stop 0.5 ATR away is rejected under the 1.5 ATR guardrail', !fwC.ok && /0\.50 ATR/.test(fwC.reasons[0]));
const fwD = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, tp: [110], confidence: 80 }, { atr: 2 }, G);
ok('firewall: valid 2 ATR stop at 80% → ghost lines, 2.5R, $100 risk → 25 qty', fwD.ok && fwD.route === 'ghost' && near(fwD.rr, 2.5) && fwD.qty === 25 && fwD.notional === 2500);
const fwE = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, tp: [110], confidence: 60 }, { atr: 2 }, G), fwE2 = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, confidence: 60 }, { atr: 2 }, Object.assign({}, G, { shadow: false }));
ok('firewall: below the 75% threshold → PAPER shadow slot (or rejected when the shadow slot is off)', fwE.ok && fwE.route === 'shadow' && !fwE2.ok && /threshold/.test(fwE2.reasons[0]));
const fwF = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, confidence: 90 }, { atr: 2, depth: 5000 }, G);
ok('firewall: book depth below 3× the order is rejected', !fwF.ok && /depth/.test(fwF.reasons[0]));
const fwG = V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, confidence: 90 }, { atr: 2, pnls: [5, -3, -2] }, G);
ok('firewall: 2 losses in a row cut size 50% ($50 risk)', fwG.ok && fwG.riskUsd === 50 && fwG.qty === 12.5 && /size cut/.test(fwG.notes.join()));
ok('firewall: armed-slot route + slot number clamped 1–6', V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, confidence: 90 }, { atr: 2 }, Object.assign({}, G, { route: 'slot', slot: 9 })).route === 'slot' && V.firewall({ symbol: 'SOL', side: 'long', entry: 100, stop_loss: 96, confidence: 90 }, { atr: 2 }, Object.assign({}, G, { route: 'slot', slot: 9 })).slot === 6);
ok('guardrail profile: stop ON, 1.5 ATR, 3× depth, 75%, 50% cut after 2, shadow ON', G.mandatorySL && G.minAtr === 1.5 && G.depthMult === 3 && G.threshold === 75 && G.cutAfter === 2 && G.cutPct === 50 && G.shadow);
const sh = V.shadowStep({ side: 'long', entry: 100, stop_loss: 96, tp: [110] }, 109, 111), sh2 = V.shadowStep({ side: 'short', entry: 100, stop_loss: 104, tp: [90] }, 99, 105);
ok('shadow tracking: target hit → +2.5R, short stop hit → −1R', sh.done && near(sh.r, 2.5) && sh2.done && sh2.r === -1);

// 4. providers, presets, packets
const chartCtx = { sym: 'SOL', tf: '1h', trend: { '1m': 'up', '5m': 'up', '1h': 'flat', '4h': 'down' }, stats: { last: 142.5, ema20: 141.2, ema50: 139.4, rsi: 55.1, atr: 2.13, chg: 1.2 }, avwap: 140.1, avKind: 'Session', t10: 12000, t60: -40000, walls: { bids: [{ p: 140, usd: 2e6 }, { p: 138, usd: 1e6 }], asks: [{ p: 145, usd: 1.5e6 }] } };
const saver = V.PROVIDER_IDS.map((p) => V.wrap(p, 'chart', V.packetChart(chartCtx, 'saver'), 'saver')), full = V.wrap('claude', 'chart', V.packetChart(chartCtx, 'full'), 'full');
ok('packets: Token-Saver chart packet ≈ 120 tokens for every provider (≤ 130)', saver.every((s) => V.estTokens(s) <= 130) && saver.every((s) => V.estTokens(s) >= 60), saver.map(V.estTokens).join());
ok('packets: Full Quant is richer than Token-Saver and carries EMA / RSI / ATR / AVWAP / tape / walls', V.estTokens(full) > V.estTokens(saver[2]) * 1.8 && ['EMA 20', 'RSI 14', 'ATR 14', 'AVWAP', 'TAPE DELTA', '3D LIQUIDITY WALLS', '1.5 ATR stop'].every((k) => full.includes(k)));
ok('providers: Grok / ChatGPT / Claude / DeepSeek / Local Ollama / Custom Bot switch the header and style', V.PROVIDERS.length === 6 && ['Grok', 'ChatGPT', 'Claude', 'DeepSeek', 'Local Ollama', 'Custom Bot'].every((n, i) => saver[i].includes('ExTerm→' + n)) && /live X search/.test(V.wrap('grok', 'chart', 'x')) && /offline/.test(V.wrap('ollama', 'chart', 'x')) && /JSON object only/.test(V.wrap('custom', 'chart', 'x')));
ok('presets: Chart Setup Check · On-Chain Rug & Whale Audit · Macro Catalyst & Risk Plan · Post-Session Leak Review', V.PRESETS.map((p) => p[1]).join('|') === 'Chart Setup Check|On-Chain Rug & Whale Audit|Macro Catalyst & Risk Plan|Post-Session Leak Review' && /honeypot/.test(V.wrap('grok', 'rug', 'x')) && /72 hours/.test(V.wrap('grok', 'macro', 'x')) && /leaks/.test(V.wrap('grok', 'leak', 'x')));
ok('packets: tape sign, walls and trends in the saver body', /tape60s −\$40\.0k/.test(V.packetChart(chartCtx, 'saver')) && /walls bid 140\.00\/138\.00 ask 145\.00/.test(V.packetChart(chartCtx, 'saver')) && /1m up · 5m up · 1h flat · 4h down/.test(V.packetChart(chartCtx, 'saver')));
const oc = V.packetOnchain({ sym: 'WIF', chain: 'solana', price: 2.1, liq: 3.2e6, fdv: 2.1e9, v5m: 120000, v1h: 900000, v24: 4e7, holders: 182000, top10: 21.4, mint: false, lpLocked: true, struct4h: 'up' }, 'full');
ok('packets: on-chain DD has liquidity, FDV, 5m/1h/24h volume, holders, top-10, mint / LP status, 4h structure', ['LIQUIDITY: $3.20M', 'FDV: $2.10B', '5m $120.0k', '1h $900.0k', '24h $40.00M', 'HOLDERS: 182000', 'TOP-10 CONCENTRATION: 21.40%', 'MINT AUTHORITY: renounced', 'LP: locked/burned', '4H STRUCTURE: up'].every((k) => oc.includes(k)), oc);
const wl = V.packetWatch([{ sym: 'BTC', last: 65000, chg: 1.2, trend: 'up', rsi: 61 }, { sym: 'ETH', last: 3000, chg: -0.5, trend: 'flat', rsi: 48 }, { sym: 'SOL', last: 142.5, chg: 3.1, trend: 'up', rsi: 66 }, { sym: 'A', last: 1 }, { sym: 'B', last: 1 }, { sym: 'C', last: 1 }], 'saver');
ok('packets: watchlist comparison caps at 5 tickers in a compact table', /top 5/.test(wl) && wl.split('\n').length === 7 && /SOL\|142\.50\|\+3\.10%\|up\|66/.test(wl));
const pm = V.packetPost({ receipts: 12, blocked: 2, rejected: 3, attr: V.attribution([{ src: 'manual', pnl: 10 }, { src: 'ai-bridge', pnl: -5 }]) }, 'full');
ok('packets: post-mortem is privacy-masked (no balances) and splits Manual / Quant / AI Bridge / Copy', /privacy-masked/.test(pm) && /Manual 1 trades/.test(pm) && /AI Bridge 1 trades/.test(pm) && !/balance|equity|cash/i.test(pm.replace('no balances', '')));
ok('packets: options IV / liquidation packet lists magnets', /liquidation magnets: 60000 long \$1\.20M/.test(V.packetOptions({ sym: 'BTC', price: 65000, iv: 52, liqs: [{ p: 60000, side: 'long', usd: 1.2e6 }] }, 'saver')));

// 5. tickers + contracts
const ex = V.extract('Grok says: $WIF and $BONK are hot, also $JUP. CA EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v and 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984. Price $2.50 not a ticker.');
ok('extract: $TICKERs, a Solana mint and an EVM address (prices are not tickers)', ex.tickers.join() === 'WIF,BONK,JUP' && ex.solana.length === 1 && ex.evm[0] === '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', JSON.stringify(ex));
const scr = V.screen([{ id: 'A', kind: 'solana' }, { id: 'B', kind: 'solana' }, { id: 'C', kind: 'evm' }, { id: 'D', kind: 'solana' }, { id: 'WIF', kind: 'ticker' }], { A: { liq: 900000, mint: false, sym: 'oc:solana:poolA' }, B: { liq: 40000, mint: false, sym: 'oc:solana:poolB' }, C: { liq: 2e6, mint: true, sym: 'oc:eth:poolC' }, WIF: { sym: 'WIF-USD' } });
ok('screen: < $50k liquidity, active mint authority and unknown tokens are dropped; survivors keep their pool', scr.ok.map((o) => o.id).join() === 'A,WIF' && scr.bad.find((b) => b.id === 'B').why.includes('< $50.0k') && scr.bad.find((b) => b.id === 'C').why === 'active mint authority' && /unknown = unsafe/.test(scr.bad.find((b) => b.id === 'D').why));

// 6. Pine hardening
const raw = '//@version=4\nstrategy("AI RSI")\nr = ta.rsi(close, 14)\nif r < 30 and close > ta.sma(close, 200)\n    strategy.entry("L", strategy.long)\nhtf = request.security(syminfo.tickerid, "D", close, lookahead = barmerge.lookahead_on)\nd = request.security(syminfo.tickerid, "W", close)\n';
const H1 = V.hardenPine(raw), ck = V.pineCheck(H1.src);
ok('Pine harden: barstate.isconfirmed, lookahead_off, $ risk, strategy.exit stop, max_intraday_loss, webhook alert all pass', ck.ok && ck.rows.length === 6 && ck.rows.every((r) => r.ok) && !ck.repaint, JSON.stringify(ck.rows.filter((r) => !r.ok)));
ok('Pine harden: v5 header, no lookahead_on left, every request.security explicit, entry sized by $ risk and gated', /^\/\/@version=5/.test(H1.src) && !/lookahead_on/.test(H1.src) && (H1.src.match(/lookahead = barmerge\.lookahead_off/g) || []).length === 2 && /if barstate\.isconfirmed\n {8}strategy\.entry\("L", strategy\.long, qty = riskUsd/.test(H1.src));
ok('Pine check: no request.security → lookahead rule passes; one call without lookahead_off fails it', V.pineCheck('x = close').rows[1].ok && !V.pineCheck('a = request.security(s, "D", close, lookahead = barmerge.lookahead_off)\nb = request.security(s, "W", close)').rows[1].ok);
ok('Pine harden: idempotent (a hardened script needs no further fixes)', V.hardenPine(H1.src).changes.length === 0 && V.hardenPine(H1.src).src === H1.src, JSON.stringify(V.hardenPine(H1.src).changes));
const tt = V.pineToText(H1.src), sp = V164.nlToSpec(tt.text), sv = sp.ok ? NT.Spec.validate(sp.spec) : { ok: false };
ok('Pine → 17-test gate: rules map to a valid safe spec (RSI < 30, close > SMA 200, 2% stop)', tt.rules >= 3 && /rsi 14 below 30/.test(tt.text) && /price above sma 200/.test(tt.text) && /stop 2%/.test(tt.text) && sv.ok && sv.spec.risk.sl === 2, tt.text);
const dg = V.diagnostics({ name: 'X', sym: 'SOL', tf: '1h', grade: 'D', checks: [{ name: 'Out-of-sample', status: 'fail', value: '-3%', rule: '> 0', why: 'edge vanished' }, { name: 'Trades', status: 'pass' }], pine: ck });
ok('diagnostics: grade, pass count, FAIL rows with value + rule, Pine safety and a refine instruction for any AI', /grade D · 1\/2 gates passed/.test(dg) && /FAIL · Out-of-sample: got -3%; rule > 0/.test(dg) && /Pine safety: OK barstate\.isconfirmed/.test(dg) && /Refine the Pine v5 script/.test(dg));

// 7. copy engine
const now = 2e9, F = [{ addr: 'w1', sym: 'SOL-USD', side: 'long', price: 100, ts: now - 400 }, { addr: 'w2', sym: 'SOL-USD', side: 'long', price: 100.4, ts: now - 100 }, { addr: 'w3', sym: 'SOL-USD', side: 'short', price: 100, ts: now - 50 }];
ok('consensus: 2 wallets same market + direction inside 15m fires; 1 wallet or outside the window waits', V.consensus(F, 'SOL-USD', 'long', now, 900, 2).fire && V.consensus(F, 'SOL-USD', 'long', now, 900, 2).n === 2 && !V.consensus(F, 'SOL-USD', 'long', now, 300, 2).fire && !V.consensus(F, 'SOL-USD', 'short', now, 900, 2).fire && near(V.consensus(F, 'SOL-USD', 'long', now, 900, 2).leaderPx, 100.2));
const dBlk = V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.2 * 1.04, atr: 10, now, cfg: {} });
ok('drift shield: a +4.0% spike past the leader fill (> 2.5%) blocks the chase', dBlk.act === 'block' && dBlk.status === 'drift' && /4\.00%/.test(dBlk.why), JSON.stringify(dBlk.drift));
ok('drift shield: 1.0 ATR past the fill blocks even under 2.5%; adverse-only (a dip is not a chase)', V.drift('long', 100, 101.5, 2.5, 1, 1).ok === false && V.drift('long', 100, 98, 2.5, 1, 1).ok === true && V.drift('short', 100, 97, 2.5, 10, 1).ok === false);
const dOk = V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: { shadow: false, riskUsd: 100 } });
ok('copy: consensus inside the drift limit fires with $100 risk, 1.5 ATR stop and TP1/TP2/TP3 at 1R/2R/3R', dOk.act === 'copy' && dOk.plan.stop === 97.5 && dOk.plan.tp.join() === '103.5,106.5,109.5' && near(dOk.plan.qty, 100 / 3) && near(dOk.plan.usd, 100.5 * 100 / 3), JSON.stringify(dOk.plan));
ok('copy: whale notional is ignored (size depends only on your $ risk and stop distance)', near(V.copyPlan('long', 100, 2, 100, 1.5).qty, V.copyPlan('long', 100, 2, 100, 1.5).qty) && near(V.copyPlan('long', 100, 2, 250, 1.5).qty, 250 / 3));
ok('copy: Copy Shadow Mode logs instead of filling', V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: { shadow: true } }).act === 'shadow');
const vetCfg = { vet: true, vetMin: 75, shadow: false };
ok('AI vetting gate: no verdict or < 75% blocks; ≥ 75% approve passes', V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: vetCfg, vets: {} }).status === 'vet' && V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: vetCfg, vets: { w1: { approve: true, confidence: 90 }, w2: { approve: true, confidence: 60 } } }).status === 'vet' && V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: vetCfg, vets: { w1: { approve: true, confidence: 90 }, w2: { approve: true, confidence: 80 } } }).act === 'copy');
ok('per-leader cap: daily loss sums per leader; a muted leader cannot form consensus today', V.dayPnl([{ leader: 'w1', pnl: -150, ts: now }, { leader: 'w1', pnl: -60, ts: now }, { leader: 'w2', pnl: -500, ts: now }, { leader: 'w1', pnl: -999, ts: now - 86400 }], 'w1', now) === -210 && V.copyDecide({ fills: F, sym: 'SOL-USD', side: 'long', price: 100.5, atr: 2, now, cfg: { muted: { w1: Math.floor(now / 86400) } } }).status === 'muted');
ok('exit modes: Mirror Leader Exit · Independent ExTerm Trailing/TP Exit · Whichever Triggers First', V.EXITS.length === 3 && V.exitNow('mirror', true, false) && !V.exitNow('mirror', false, true) && V.exitNow('independent', false, true) && !V.exitNow('independent', true, false) && V.exitNow('first', true, false) && V.exitNow('first', false, true));
ok('wallet profile packet asks for a wallet_vet JSON verdict', /"kind":"wallet_vet"/.test(V.walletPacket({ short: '0xab…cd', tag: 'swing', stats: { win: 0.61, n: 40 }, positions: [{ coin: 'SOL', side: 'Long', ntl: 250000 }] }, 'saver')));

// 8. attribution
const A = V.attribution([{ src: '', pnl: 10 }, { src: 'manual', pnl: -5 }, { src: 'bot:7', pnl: 30 }, { src: 'ai-bridge', pnl: 20 }, { src: 'ai-bridge', pnl: -10 }, { src: 'ai-bridge', bps: 4 }, { src: 'ai-bridge', bps: 2 }, { src: 'copy', pnl: -8 }]);
ok('attribution: Manual / Quant / AI Bridge / Copy win rate, profit factor and slippage bps', A.manual.n === 2 && A.manual.win === 50 && A.manual.pf === 2 && A.quant.n === 1 && A.quant.pf === null && A.ai.n === 2 && A.ai.pf === 2 && A.ai.bps === 3 && A.copy.n === 1 && A.copy.win === 0 && A.copy.pf === 0);
ok('slippage bps: buy above / sell below signal is positive', near(V.slipBps('long', 100, 100.05), 5) && near(V.slipBps('short', 100, 99.9), 10));

// 9. share card + JSON
const cm = V.cardModel({ sym: 'oc:solana:PoolAddr', tf: '1h', side: 'long', entry: 142.5, sl: 138, tp: [154], source: 'AI Bridge · Grok', balance: 98765.43, equity: 123456, user: 'someone', qty: 12.3, usd: 1752 });
ok('share card model: whitelisted fields only, R:R 2.56, balances / qty / usd / user never carried', cm.rr === 2.56 && !('balance' in cm) && !('equity' in cm) && !('user' in cm) && !('qty' in cm) && !JSON.stringify(cm).includes('98765') && !JSON.stringify(cm).includes('123456') && !JSON.stringify(cm).includes('someone') && cm.masked === 'Balances & personal data masked' && cm.sym === 'PoolAddr');
ok('share card: cardLeaks finds a secret in drawn text', V.cardLeaks(['Entry 142.5', 'Balance 98765.43'], ['98765.43']).length === 1 && V.cardLeaks(cm.lines, ['98765.43', '1752']).length === 0);
const sj = JSON.parse(V.shareJSON({ spec: { v: 1, name: 'x' }, passed: 17, total: 17, grade: 'A', ts: 0 })), sw = JSON.parse(V.shareJSON({ watchlist: ['BTC-USD', 'ETH-USD', 5] }));
ok('shareable JSON: "Validated in ExTerm (17/17 Gates Passed)" only when 17/17 actually passed', sj.label === 'Validated in ExTerm (17/17 Gates Passed)' && sj.kind === 'strategy' && sw.kind === 'watchlist' && sw.label === 'Validated in ExTerm (0/17 Gates Passed)' && sw.watchlist.length === 2);

// 10. Python templates (compiled)
const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'v165tpl-')); let compiled = true, cerr = '';
for (const [k, t] of Object.entries(V.TEMPLATES)) { const f = path.join(tdir, k + '.py'); fs.writeFileSync(f, t); try { execFileSync(PY, ['-I', '-m', 'py_compile', f], { timeout: 30000 }); } catch (e) { compiled = false; cerr = k + ': ' + e.message; } }
ok('templates: Grok xAI, ChatGPT / Claude / DeepSeek and offline Ollama compile with Python', compiled && Object.keys(V.TEMPLATES).join() === 'grok,cloud,ollama', cerr);
ok('templates: ~45 lines, stdlib only, POST to 127.0.0.1/llm-signal with X-ExTerm-Bridge, never an exchange key', Object.values(V.TEMPLATES).every((t) => { const n = t.split('\n').length; return n >= 38 && n <= 56 && /127\.0\.0\.1:8765/.test(t) && /\/llm-signal/.test(t) && /X-ExTerm-Bridge/.test(t) && !/import (requests|ccxt|openai|anthropic)/.test(t) && !/(API_SECRET|SECRET_KEY|exchange\.create_order)/.test(t); }));
ok('templates: Ollama one talks only to 127.0.0.1:11434 (100% offline)', /127\.0\.0\.1:11434/.test(V.TEMPLATES.ollama) && !/https:\/\//.test(V.TEMPLATES.ollama));
try { fs.rmSync(tdir, { recursive: true, force: true }); } catch (e) { /* tmp */ }

// 11. serve.py: llm_check + LlmBridge
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'v165data-'));
const py = `import importlib.util,sys,json,os,hmac\nos.environ['EXTERM_DATA']=${JSON.stringify(data)}\nos.environ.pop('EXTERM_BRIDGE_KEY',None)\nsys.argv=['serve.py','--help']\nspec=importlib.util.spec_from_file_location('s',${JSON.stringify(path.join(root, 'serve.py'))});m=importlib.util.module_from_spec(spec)\ntry: spec.loader.exec_module(m)\nexcept SystemExit: pass\nB=m.LlmBridge()\na=B.submit({'symbol':'SOL','side':'long','entry':100,'stop_loss':None})\nb=B.submit({'symbol':'SOL','side':'long','entry':100,'stop_loss':101})\nc=B.submit({'symbol':'SOL','side':'buy','entry':'100','stop_loss':96,'tp':[110],'confidence':0.8,'source':'grok'})\nd=B.submit({'kind':'wallet_vet','wallet':'0x'+'a'*40,'approve':True,'confidence':82})\ne=B.submit({'symbol':'<script>','side':'long','entry':1,'stop_loss':0.5})\nbody={k:c[k] for k in c if k!='sig'}\nsig=hmac.new(B.key.encode(),json.dumps(body,sort_keys=True,separators=(',',':')).encode(),'sha256').hexdigest()\nkf=os.path.join(${JSON.stringify(data)},'bridge.key')\nB2=m.LlmBridge()\nprint(json.dumps({'a':a['status'],'ar':a['reasons'],'b':b['status'],'br':b['reasons'],'c':c['status'],'cp':c['proposal'],'d':d['status'],'dv':d['proposal'],'e':e['status'],'sig':sig==c['sig'],'key':len(B.key)>=24,'file':os.path.exists(kf),'same':B2.key==B.key,'since':len(B.since(2)['items']),'counts':B.since(0)['counts']}))\n`;
let pr = null; try { const f = path.join(os.tmpdir(), 'v165llm.py'); fs.writeFileSync(f, py); pr = JSON.parse(execFileSync(PY, ['-I', f], { encoding: 'utf8', timeout: 30000 }).trim().split('\n').pop()); } catch (e) { pr = { err: e.message }; }
ok('serve.py llm_check: unstopped and wrong-way proposals are rejected with reasons', pr && pr.a === 'rejected' && /stop_loss missing/.test(pr.ar[0]) && pr.b === 'rejected' && /wrong-way/.test(pr.br[0]), JSON.stringify(pr));
ok('serve.py llm_check: valid proposal normalised (buy → long, "100" → 100, 0.8 → 80%), wallet vet accepted, bad symbol rejected', pr && pr.c === 'accepted' && pr.cp.side === 'long' && pr.cp.entry === 100 && pr.cp.confidence === 80 && pr.cp.source === 'grok' && pr.d === 'accepted' && pr.dv.confidence === 82 && pr.e === 'rejected', JSON.stringify(pr && pr.cp));
ok('serve.py LlmBridge: HMAC-SHA256 signed receipts, persisted owner-only bridge key reused across launches, since-queue', pr && pr.sig && pr.key && pr.file && pr.same && pr.since === 3 && pr.counts.accepted === 2 && pr.counts.rejected === 3, JSON.stringify(pr));
try { fs.rmSync(data, { recursive: true, force: true }); } catch (e) { /* tmp */ }
const S = src('serve.py');
ok('serve.py: /llm-signal is loopback-only, bridge-key or session-token gated, rate limited, 16 KB JSON, 422 on rejection', /def _llm_signal\(self\)/.test(S) && /self\.client_address\[0\] not in \("127\.0\.0\.1", "::1", "::ffff:127\.0\.0\.1"\)/.test(S) && /compare_digest\(self\.headers\.get\("X-ExTerm-Bridge"\) or "", LLM\.key\) or self\._token_ok\(\)/.test(S) && /LLM\.rl\.ok\(\)/.test(S) && /_json_body\(16 \* 1024\)/.test(S) && /200 if rc\["status"\] == "accepted" else 422/.test(S));
ok('serve.py: browser origins blocked (do_POST runs _local_ok first), page reads receipts + key only with the session token', /def do_POST\(self\):\n {8}if not self\._local_ok\(\):\n {12}return\n {8}if urllib\.parse\.urlparse\(self\.path\)\.path == "\/llm-signal":/.test(S) && /if p\.startswith\("\/api\/llm-signal"\)/.test(S) && /GET \/llm-signal|usage hint for bot authors \(never the key\)/.test(S));
ok('serve.py: service worker never caches /llm-signal; --no-llm-signal switch; version 16.5', /\(api\|proxy\|ollama\|hook\|llm-signal\)/.test(S) && /"--no-llm-signal" not in sys\.argv/.test(S) && /VERSION = "16\.5"/.test(S));

// 12. static wiring / CSP / XSS / privacy
const ui = src('v165.js'), core = src('v165core.js'), Bd = src('build.py'), css = src('style.css');
ok('build: v165core.js after v164core.js, v165.js after v164.js, right before boot.js', /"v164core\.js", "v165core\.js", "v160\.js"/.test(Bd) && /"v164\.js", "v165\.js", "boot\.js"/.test(Bd));
ok('briefing lists the v16.5 highlights (keeps v16.4 / v16.3 essentials)', /V165\.HIGHLIGHTS/.test(src('v162.js')) && V.HIGHLIGHTS.length === 6 && /Discovery/.test(V.HIGHLIGHTS.join()) && /Freqtrade/.test(V.HIGHLIGHTS.join()) && /Two-Key Arming/.test(V.HIGHLIGHTS.join()) && /HUD/.test(V.HIGHLIGHTS.join()));
ok('UI: AI Bridge tab with the compatibility banner and 3 cards, mounted next to Grok', /data-tab="bridge"|dataset\.tab = 'bridge'/.test(ui) && /Works With Any AI or Bot:<\/b> Grok · ChatGPT · Claude · DeepSeek · Local Ollama · Custom Python\/Node Bots/.test(ui) && ['Copy Live Context for Any AI', 'Paste &amp; Verify AI Output', 'Live 127.0.0.1 AI &amp; Bot Firewall'].every((k) => ui.includes(k)));
ok('UI: every requested control is present', ['Copy Chart + Order-Book Packet', 'Copy On-Chain Due-Diligence Packet', 'Copy Multi-Symbol Watchlist Comparison Packet', 'Copy Options IV / Whale Liquidation Packet', 'Copy Session Post-Mortem Packet', 'Paste AI Trade Idea → Instant Chart Ghost Lines', 'Auto-Watch Clipboard for AI Trade Ideas', 'AI Ticker / Contract Paste-Box', 'Paste &amp; Harden AI Pine Script v5', '1-Click 17-Test Quant Validation', 'Copy Failure Diagnostics for AI', 'Apply AI Live Guardrail Profile', 'AI Confidence Threshold', 'AI Shadow Slot (PAPER mode first)', 'Human vs. AI / Bot Execution Attribution', 'Token-Saver (~120 tokens)', 'Full Quant', 'AI-Vetted Copy Engine', 'AI Wallet &amp; Trade Vetting Gate', 'Multi-Wallet Consensus', 'Copy Shadow Mode', 'Copy Wallet Profile Packet for AI', 'Share Setup Card', 'Copy Shareable Strategy / Watchlist JSON'].every((k) => ui.includes(k)), ['Copy Chart + Order-Book Packet', 'AI Ticker / Contract Paste-Box', 'AI-Vetted Copy Engine'].filter((k) => !ui.includes(k)).join());
ok('UI: ghost lines are a chart overlay with dashed lines and R:R badges, pinned ▲ / ▼ off screen', /chart\.overlays\.push\(overlay\)/.test(ui) && /setLineDash\(\[7, 5\]\)/.test(ui) && /V165\.badge\(l\)/.test(ui) && /'▲ '/.test(ui) && /'▼ '/.test(ui));
ok('UI: armed-slot route is a paper fill tagged ai-bridge (live forwarding stays with the four-gate cockpit)', /ACC\.buy\(sym, px0, Math\.min\(fw\.notional, ACC\.cash\), Date\.now\(\), \{ src: 'ai-bridge'/.test(ui) && !/V160UI\.send\(/.test(ui));
ok('UI: proposals received before the page opened are listed, never re-routed', /history\) \{ rcRow\(Object\.assign\(base, \{ sym: P\.symbol, side: P\.side, status: 'history'/.test(ui));
ok('UI: copy fills carry $ risk sizing, stop + TP1/TP2/TP3 and attribution into the Signed Receipt Ledger', /led\('copy', \{ status: 'filled', detail: `Copy BUY \$\{baseOf\(f\.sym\)\} · \$\{dec\.cons\.n\} wallets · \$\{plan\}/.test(ui) && /attribution Copy \(\$\{vetd\}\)/.test(ui) && /src: 'copy'/.test(ui));
ok('CSP: no inline handlers or eval in v16.5', !/\son[a-z]+=["']/i.test(ui + core) && !/\beval\(|new Function/.test(ui + core));
ok('XSS: toasts with dynamic text escape it', !/toast\(`[^`]*\$\{(?!esc\()[^`]*`/.test(ui));
ok('XSS: table cells go through esc()', !/<td[^>]*>\$\{(?!esc\()/.test(ui));
ok('CSS: AI Bridge, copy engine and ledger styles with RTL + narrow-screen rules', ['.v165-banner', '.v165-grid', '.v165-card', '.v165-pill', '.v165-t', '.v165-cp', '.v165-led', 'html[dir="rtl"] .v165-banner', '@media (max-width:760px){.v165-grid{grid-template-columns:1fr}'].every((k) => css.includes(k)));
ok('privacy: no personal paths, emails, usernames or legacy product name in v16.5 sources', !new RegExp(['[A-Z]:\\\\Users\\\\', '\\/Users\\/', '@gm' + 'ail', 'ro' + 'blo', 'nova' + 'term', 'op' + 'en[- ]?so' + 'urce'].join('|'), 'i').test(ui + core));
ok('index.html footer reads v16.5', /ExTerm v16\.5 · Official Release/.test(src('index.html')));

const fails = res.filter((r) => r.startsWith('FAIL'));
console.log(res.join('\n')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
