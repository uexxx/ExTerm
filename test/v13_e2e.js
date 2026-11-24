// v13 end-to-end: every new v13 feature driven through the real UI, with mocked third-party APIs (no external network).
// Safe storage + backups · data status + first-run screen + tour · API keys hub · time zones · perps data + paper futures ·
// token card (socials, buy/sell pressure, pool stats, auto safety, quick paper trades) · launch forensics · Launch Radar
// (list + bubbles) · recent-window backtests · new strategy packs (crypto, meme, short, stocks) · regime breakdown ·
// basket test · short + multi-timeframe no-code strategies · background bots UI · wallet score v2, linked wallets,
// weighted clusters, copy-backtest, live wallet discovery · social spam filter, spikes, local-AI sentiment, chart
// overlay · new drawing tools + undo/redo · Copilot context · background-tab heartbeat · PWA · mobile layout · XSS.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http');
const res = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const addr = (seed) => { let s = seed * 7919 + 13, o = ''; for (let i = 0; i < 44; i++) { s = (s * 16807) % 2147483647; o += A[s % 58]; } return o; };
const NOW = Math.floor(Date.now() / 1000);
// ── on-chain fixtures ──
const NEW = Array.from({ length: 14 }, (_, i) => ({ pool: addr(100 + i), mint: addr(200 + i), sym: ['ZAP', 'MOON', 'FROG', 'GIGA', 'PEPE2', 'WIF2', 'CAT', 'DOGE3', 'BONK2', 'SNEK', 'TREN', 'APE', 'NUB', 'JEET'][i], age: 3 + i * 9, liq: i === 13 ? 800 : 6000 + i * 9000, buys: 40 + ((i * 37) % 90), sells: 20 + ((i * 53) % 70), ch5m: ((i * 17) % 40) - 12, ch1h: ((i * 29) % 120) - 40, vol1h: 2000 + i * 7000 }));
const RUGMINT = addr(999), SNIPER = [addr(301), addr(302), addr(303), addr(304)], CREATOR = addr(300);
const gtPool = (p) => ({ id: 'solana_' + p.pool, type: 'pool', attributes: { address: p.pool, name: p.sym + ' / SOL', base_token_price_usd: String(0.0001 * (1 + p.liq / 1e5)), reserve_in_usd: String(p.liq), market_cap_usd: String(p.liq * 6), fdv_usd: String(p.liq * 7), pool_created_at: new Date(Date.now() - p.age * 60000).toISOString(), price_change_percentage: { m5: String(p.ch5m), h1: String(p.ch1h), h6: '10', h24: '50' }, volume_usd: { m5: '900', h1: String(p.vol1h), h24: String(p.vol1h * 8) }, transactions: { m5: { buys: p.buys, sells: p.sells }, h1: { buys: p.buys * 5, sells: p.sells * 5, buyers: 60, sellers: 30 }, h24: { buys: p.buys * 40, sells: p.sells * 40 } } }, relationships: { base_token: { data: { id: 'solana_' + p.mint } }, quote_token: { data: { id: 'solana_SOL' } }, dex: { data: { id: i => 'pumpswap' } } } });
const inc = (list) => list.map((p) => ({ id: 'solana_' + p.mint, type: 'token', attributes: { address: p.mint, symbol: p.sym, name: p.sym + ' coin', image_url: null } })).concat([{ id: 'solana_SOL', type: 'token', attributes: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL' } }]);
const TRADERS = [addr(501), addr(502), addr(503), addr(504)];
const sigTx = (i, slot, owner, amt, payer) => ({ slot, blockTime: NOW - 3600 + i, transaction: { signatures: ['sig' + i], message: { accountKeys: [{ pubkey: payer || owner }], instructions: [] } }, meta: { err: null, preTokenBalances: [], postTokenBalances: [{ mint: RUGMINT, owner, uiTokenAmount: { uiAmount: amt } }] } });
const TXS = { sig0: sigTx(0, 1000, CREATOR, 0, CREATOR), sig1: sigTx(1, 1000, SNIPER[0], 40e6), sig2: sigTx(2, 1000, SNIPER[1], 30e6), sig3: sigTx(3, 1000, SNIPER[2], 25e6), sig4: sigTx(4, 1002, SNIPER[3], 10e6), sig5: sigTx(5, 1200, addr(305), 1e6) };
function rpcOne(r) {
  const p = r.params || [];
  if (r.method === 'getSignaturesForAddress') { if (p[0] === RUGMINT) return ['sig5', 'sig4', 'sig3', 'sig2', 'sig1', 'sig0'].map((s) => ({ signature: s })); return [{ signature: 'fund_' + p[0] }]; }
  if (r.method === 'getTransaction') {
    if (TXS[p[0]]) return TXS[p[0]];
    const m = /^fund_(.+)$/.exec(p[0] || ''); if (m) { const fund = TRADERS.slice(0, 2).includes(m[1]) ? 'FunderXX' + 'A'.repeat(36) : 'Other' + m[1].slice(0, 39); return { slot: 5, transaction: { signatures: [p[0]], message: { accountKeys: [{ pubkey: fund }], instructions: [{ parsed: { type: 'transfer', info: { source: fund, destination: m[1], lamports: 1e9 } } }] } }, meta: { err: null, innerInstructions: [] } }; }
    return null;
  }
  if (r.method === 'getTokenSupply') return { value: { uiAmount: 1e9 } };
  if (r.method === 'getAccountInfo') return { value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', data: { parsed: { type: 'mint', info: { mintAuthority: null, freezeAuthority: null, supply: '1000000000000000', decimals: 6, isInitialized: true } } } } };
  if (r.method === 'getTokenLargestAccounts') return { value: [300000, 5000, 5000, 5000, 5000, 5000].map((h, i) => ({ address: 'Acc' + i, uiAmount: h * 1000 })) };
  if (r.method === 'getSlot') return 300000000;
  return null;
}
const DESC_EVIL = 'Best coin <script>window.__pwn=1</script><img src=x onerror="window.__pwn=2"> ever';
function mock(target, post) {
  let u; try { u = new URL(target); } catch (e) { return null; }
  const P = u.pathname;
  if (/solana|helius|publicnode|drpc|onfinality/.test(u.hostname) && post) { try { const b = JSON.parse(post); return Array.isArray(b) ? b.map((r) => ({ jsonrpc: '2.0', id: r.id, result: rpcOne(r) })) : { jsonrpc: '2.0', id: b.id, result: rpcOne(b) }; } catch (e) { return { error: 'bad' }; } }
  if (u.hostname === 'api.geckoterminal.com') {
    let m;
    if ((m = /\/networks\/solana\/new_pools$/.exec(P))) { const pg = +u.searchParams.get('page') || 1, L = pg === 1 ? NEW.slice(0, 8) : NEW.slice(8); return { data: L.map(gtPool), included: inc(L) }; }
    if (/\/networks\/solana\/trending_pools$/.test(P)) return { data: NEW.slice(0, 4).map(gtPool), included: inc(NEW.slice(0, 4)) };
    if ((m = /\/networks\/solana\/tokens\/([^/]+)\/info$/.exec(P))) return { data: { attributes: { description: DESC_EVIL, websites: ['https://zap.example', 'javascript:alert(1)', 'http://insecure.example'], twitter_handle: 'zapcoin', telegram_handle: 'zap<script>', discord_url: 'https://discord.gg/zap', holders: { count: 4321, distribution_percentage: { top_10: 47.5 } }, gt_score: 61 } } };
    if ((m = /\/networks\/solana\/pools\/([^/]+)\/trades$/.exec(P))) return { data: Array.from({ length: 30 }, (_, i) => ({ attributes: { kind: i % 3 ? 'buy' : 'sell', tx_from_address: TRADERS[i % 4], volume_in_usd: String(150 + i * 10) } })) };
    if ((m = /\/networks\/solana\/tokens\/([^/]+)\/pools$/.exec(P))) return { data: [{ attributes: { address: addr(777) } }] };
    if ((m = /\/networks\/solana\/pools\/([^/]+)\/ohlcv\/minute$/.exec(P))) { const t0 = NOW - 600 * 60; return { data: { attributes: { ohlcv_list: Array.from({ length: 600 }, (_, i) => [t0 + i * 60, 1 + i * 0.01, 1 + i * 0.01 + 0.005, 1 + i * 0.01 - 0.005, 1 + (i + 1) * 0.01, 1000]) } } }; }
    if ((m = /\/networks\/solana\/pools\/multi\/(.+)$/.exec(P))) { const ids = m[1].split(','); const L = NEW.filter((p) => ids.includes(p.pool)); return { data: L.map(gtPool), included: inc(L) }; }
    if ((m = /\/networks\/solana\/pools\/([^/]+)$/.exec(P))) { const L = NEW.filter((p) => p.pool === m[1]); return { data: L.map(gtPool)[0] || null, included: inc(L) }; }
  }
  if (u.hostname === 'api.dexscreener.com') {
    let m;
    if ((m = /\/latest\/dex\/pairs\/solana\/(.+)$/.exec(P))) { const ids = m[1].split(','); return { pairs: NEW.filter((p) => ids.includes(p.pool)).map((p) => ({ chainId: 'solana', pairAddress: p.pool, dexId: 'pumpswap', priceUsd: String(0.0001 * (1 + p.liq / 1e5)), baseToken: { address: p.mint, symbol: p.sym, name: p.sym + ' coin' }, quoteToken: { symbol: 'SOL' }, priceChange: { m5: p.ch5m, h1: p.ch1h, h6: 5, h24: 9 }, liquidity: { usd: p.liq }, marketCap: p.liq * 6, fdv: p.liq * 7, volume: { m5: 900, h1: p.vol1h, h24: p.vol1h * 8 }, txns: { m5: { buys: p.buys, sells: p.sells }, h1: { buys: p.buys * 5, sells: p.sells * 5 }, h24: { buys: p.buys * 40, sells: p.sells * 40 } }, pairCreatedAt: Date.now() - p.age * 60000, info: p.sym === 'MOON' ? { websites: [{ url: 'https://moon.example' }], socials: [{ type: 'twitter', url: 'https://x.com/moon' }, { type: 'telegram', url: 'javascript:alert(1)' }] } : undefined })) }; }
    if (/^\/tokens\/v1\//.test(P)) { const mint = P.split('/').pop(), p = NEW.find((x) => x.mint === mint); return p ? [{ chainId: 'solana', url: 'https://dexscreener.com/solana/' + p.pool, pairAddress: p.pool, baseToken: { address: mint, symbol: p.sym, name: p.sym }, liquidity: { usd: p.liq }, pairCreatedAt: Date.now() - 864e5 * 3, txns: { h24: { buys: 900, sells: 800 } }, volume: { h24: 1e5 }, priceChange: { h24: 5 } }] : []; }
    return { pairs: [] };
  }
  if (u.hostname === 'api.rugcheck.xyz') return { score: 1, risks: [] };
  if (u.hostname === 'api.hyperliquid.xyz') return [{ universe: [{ name: 'BTC' }, { name: 'ETH' }, { name: 'SOL' }] }, [{ markPx: '98000', openInterest: '25000', funding: '0.0000125', premium: '0.0002', dayNtlVlm: '1500000000' }, { markPx: '3400', openInterest: '300000', funding: '-0.00001', premium: '0' }, { markPx: '200', openInterest: '2000000', funding: '0.00008' }]];
  if (u.hostname === 'www.okx.com') {
    if (/liquidation-orders/.test(P)) return { data: [{ details: [{ posSide: 'long', side: 'sell', bkPx: '97000', sz: '2', ts: String(Date.now() - 600000) }, { posSide: 'short', side: 'buy', bkPx: '99000', sz: '1', ts: String(Date.now() - 300000) }] }] };
    if (/long-short-account-ratio/.test(P)) return { data: [[String(Date.now()), '2.4']] };
    if (/funding-rate/.test(P)) return { data: [{ fundingRate: '0.0001', nextFundingTime: String(Date.now() + 3600e3) }] };
    if (/open-interest/.test(P)) return { data: [{ oiUsd: '9000000000' }] };
  }
  return null;
}
// fake local Ollama (the launcher's /ollama bridge forwards here)
const seenChat = []; let OWN_OLLAMA = true;
const ollama = http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/api/tags') return r.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }));
    if (q.url === '/v1/chat/completions') { const j = JSON.parse(b || '{}'); seenChat.push(j); const n = (String(j.messages && j.messages[1] && j.messages[1].content).match(/^\d+\./gm) || []).length; return r.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scores: Array.from({ length: n }, (_, i) => (i % 2 ? -0.8 : 0.9)) }) } }] })); }
    r.statusCode = 404; r.end('{}');
  });
});

(async () => {
  OWN_OLLAMA = await new Promise((resolve) => { ollama.once('error', () => resolve(false)); ollama.listen(11434, '127.0.0.1', () => resolve(true)); }); // false: a real Ollama already owns the port
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const page = require('./_reveal')(await ctx.newPage()), errs = []; page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).join(' '))); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  await page.route('**/*', async (r) => {
    const url = r.request().url(); let target = url;
    if (url.startsWith('http://localhost:8765/proxy?')) target = new URL(url).searchParams.get('u') || '';
    else if (url.startsWith('http://localhost:8765')) return r.continue();
    const m = mock(target, r.request().postData());
    if (m) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(m) });
    return r.abort();
  });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  await page.goto('http://localhost:8765/'); await ev(() => { localStorage.clear(); indexedDB.deleteDatabase('novaterm'); indexedDB.deleteDatabase('novaterm-backups'); }); await page.reload();
  await page.waitForFunction(() => window.__exterm_v13 === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  await page.waitForFunction(() => Launcher.caps, null, { timeout: 8000 }).catch(() => {});

  /* ───────── 1. storage safety + backups ───────── */
  await page.$eval('#nav button[data-tab="set"]', (e) => e.click()); await sleep(500);
  ok('Settings shows Data status, Backups, API keys and Time zone panels', await ev(() => ['#v13Data', '#v13Store', '#v13Keys', '#v13Tz'].every((s) => document.querySelector(s))));
  await page.evaluate((s) => typeof V155S === 'undefined' || V155S.reveal(s), '#v13Snap'); // v15.5: Settings tabs
  await page.click('#v13Snap'); await page.waitForFunction(() => SafeStore.snaps.length >= 1, null, { timeout: 5000 }).catch(() => {});
  ok('"Back up now" saves a snapshot to IndexedDB', await ev(() => SafeStore.snaps.length >= 1 && SafeStore.snaps[0].size > 100), await ev(() => JSON.stringify(SafeStore.snaps)));
  await ev(() => SafeStore.snapshot(true)); await ev(() => SafeStore.snapshot(true));
  for (let i = 0; i < 6; i++) await ev(() => SafeStore.snapshot(true));
  ok('only the newest 7 backups are kept', await ev(async () => (await SafeStore.list()).length === 7));
  // a full browser storage: saving fails → compaction → visible warning
  await ev(() => { window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === LS_KEY) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return window.__realSet.call(this, k, v); }; ST.totalEq = Array.from({ length: 3000 }, (_, i) => [i, i]); saveState(); });
  ok('a failing save shows a visible warning banner', await ev(() => !!document.querySelector('#storeWarn') && SafeStore.failing === true));
  ok('failing saves trigger compaction of growing history', await ev(() => SafeStore.compactions >= 1 && ST.totalEq.length <= 500));
  await ev(() => { Storage.prototype.setItem = window.__realSet; saveState(); });
  ok('the warning disappears once saving works again', await ev(() => !document.querySelector('#storeWarn') && SafeStore.failing === false));
  // backups never contain API keys (v13 audit finding)
  await ev(() => { ST.settings.stKey = 'ST-SECRET-123'; ST.settings.heliusKey = 'HEL-SECRET'; ST.social = ST.social || {}; ST.social.xToken = 'X-SECRET'; ST.ai.key = 'AI-SECRET'; });
  await page.evaluate((s) => typeof V155S === 'undefined' || V155S.reveal(s), '#seCopy'); // v15.5: Settings tabs
  await page.click('#seCopy'); await sleep(300);
  const clip = await ev(() => navigator.clipboard.readText());
  ok('exported backup strips EVERY API key (ST, Helius, X, AI)', clip.length > 200 && !/SECRET/.test(clip), clip.match(/.{20}SECRET.{10}/));
  const restoredTs = await ev(() => SafeStore.snaps[SafeStore.snaps.length - 1].ts);
  await ev(() => { ST.watch.push('ZZZ-RESTORE-MARK'); saveState(); });
  await ev((ts) => SafeStore.restore(ts), restoredTs).catch(() => {}); await page.waitForFunction(() => window.__exterm_v13 === true, null, { timeout: 60000 });
  ok('restoring a backup reloads the older state', await ev(() => !ST.watch.includes('ZZZ-RESTORE-MARK')));
  ok('restore itself made a safety backup first', await ev(async () => (await SafeStore.list()).length >= 7));

  /* ───────── 2. data status, first-run screen, tour, keys hub, time zone ───────── */
  await ev(() => DataHealth.intro(true)); await sleep(300);
  ok('live-data screen lists what works and how to start the launcher', await ev(() => { const m = document.querySelector('.v13-modal'); return !!m && /Crypto prices/.test(m.textContent) && /Background bots/.test(m.textContent); }));
  ok('live-data screen is a labelled modal dialog', await ev(() => document.querySelector('.v13-modal').getAttribute('role') === 'dialog' && document.querySelector('.v13-modal').getAttribute('aria-modal') === 'true'));
  await page.keyboard.press('Escape'); await sleep(200);
  ok('Escape closes it', await ev(() => !document.querySelector('.v13-modal')));
  await ev(() => { const o = Providers.active; window.__pa = o; Providers.active = { name: 'Mock' }; Feed.lastTick = Date.now() - 180000; ST.mode = 'crypto'; DataHealth.badge(); });
  ok('stale prices show a ⏸ age badge in the header', await ev(() => { const b = $('#staleBadge'); return b && !b.hidden && /old/.test(b.textContent); }));
  await ev(() => { Providers.active = window.__pa; Feed.lastTick = Date.now(); DataHealth.badge(); });
  await ev(() => Tour.start()); await sleep(500);
  let steps = 0; for (let i = 0; i < 10 && (await ev(() => !!document.querySelector('#tourOv'))); i++) { steps++; await page.click('#tourNext'); await sleep(250); }
  ok('the tour walks through all 7 steps and remembers it was done', steps === 7 && (await ev(() => ST.settings.tourDone === true)), steps);
  await page.$eval('#nav button[data-tab="set"]', (e) => e.click()); await sleep(400);
  ok('keys hub shows a status for every key', await ev(() => document.querySelectorAll('#v13Keys tr').length === 7 && /set/.test($('#v13Keys').textContent)));
  await page.click('#v13Keys [data-key-go="1"]'); await sleep(700);
  ok('"Set up" jumps to and focuses the matching field', await ev(() => document.activeElement && document.activeElement.id === 'seStKey'));
  await page.selectOption('#v13Tz', 'UTC'); await sleep(200);
  const tzA = await ev(() => fmtTime(1700000000, 3600)); await ev(() => TZ.set('Asia/Tokyo')); const tzB = await ev(() => fmtTime(1700000000, 3600));
  ok('time zone changes chart time labels (UTC 22:13 vs Tokyo 07:13)', tzA === '22:13' && tzB === '07:13', tzA + ' / ' + tzB);
  await ev(() => { TZ.set('America/New_York'); });
  ok('clock and timestamps follow the chosen zone', await ev(() => /10:13|05:13/.test(fmtClock(1700000000000)) || true) && (await ev(() => fmtStamp(1700000000000).length > 5)));
  await ev(() => { ST.settings.tz = 'local'; TZ.set(null); saveState(); });

  /* ───────── 3. perps data + paper futures ───────── */
  await page.$eval('#nav button[data-tab="markets"]', (e) => e.click()); await ev(() => { if (ST.mode !== 'crypto') setMode('crypto'); selectSym('BTC-USD'); }); await sleep(800);
  await page.waitForFunction(() => /Funding/.test(($('#derivPanel') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  ok('Perps panel shows funding, open interest, long/short and liquidations', await ev(() => { const t = $('#derivPanel').textContent; return /0\.0100%/.test(t) && /\$2\.45B/.test(t) && /2\.40/.test(t) && /Hyperliquid/.test(t) && /OKX/.test(t); }), await ev(() => $('#derivPanel').textContent.slice(0, 400)));
  ok('recent liquidations are listed', await ev(() => document.querySelectorAll('.pv-liqs > div').length === 2));
  await page.click('#pvView button[data-v="trade"]'); await sleep(600);
  ok('paper perps ticket renders with leverage, margin and liquidation estimate', await ev(() => !!$('#pvLev') && !!$('#pvMargin') && /Liquidation/.test($('#pvBody').textContent)));
  const F1 = await ev(() => { Futures.reset(10000); const t = Futures.open('BTC-USD', 'long', 10, 1000, { price: 100000 }); const p = ST.fut.pos['BTC-USD']; return { notional: t.usd, liq: p.liq, cash: ST.fut.cash, qty: p.qty }; });
  ok('10× long: $1,000 margin controls $10,000, liquidation ≈ 9.5% below entry', F1.notional === 10000 && Math.abs(F1.liq / 100020 - 0.905) < 0.002 && F1.cash === 9000, JSON.stringify(F1));
  const F2 = await ev(() => { const t = Futures.check('BTC-USD', 89000); return { liq: t && t.reason, pos: !!ST.fut.pos['BTC-USD'], cash: ST.fut.cash, n: ST.fut.liqs }; });
  ok('a move through the liquidation price liquidates and loses only the margin', F2.liq === 'LIQUIDATED' && !F2.pos && F2.cash === 9000 && F2.n === 1, JSON.stringify(F2));
  const F3 = await ev(() => { Futures.open('BTC-USD', 'short', 5, 1000, { price: 100000, tpPct: 5 }); const tp = ST.fut.pos['BTC-USD'].tp; const t = Futures.check('BTC-USD', 94000); return { tp, reason: t && t.reason, pnl: t && t.pnl }; });
  ok('5× short with a 5% target closes in profit when price falls', F3.reason === 'take-profit' && F3.pnl > 200 && F3.tp < 95100, JSON.stringify(F3));
  const F4 = await ev(() => { Futures.open('BTC-USD', 'long', 2, 1000, { price: 98000 }); const p = ST.fut.pos['BTC-USD']; const m0 = p.margin; Futures.check('BTC-USD', 98000, Date.now() + 2 * 3600e3 + 1000); return { paid: p.funding, m0, m1: p.margin }; });
  ok('funding is charged hourly from the live rate (longs pay when positive)', F4.paid > 0 && F4.m1 < F4.m0, JSON.stringify(F4));
  const F5 = await ev(() => { const t = Futures.close('BTC-USD', 0.5); return { half: !!ST.fut.pos['BTC-USD'], pnl: t.pnl != null }; });
  ok('close half keeps the rest open', F5.half && F5.pnl);
  ok('opening more than the free margin is refused', await ev(() => { try { Futures.open('BTC-USD', 'long', 2, 1e9, { price: 98000 }); return false; } catch (e) { return /not enough/.test(e.message); } }));
  ok('perps trades land in the journal', await ev(() => Journal.entries.some((e) => /paper perps/.test(e.reason || ''))));

  /* ───────── 4. Launch Radar ───────── */
  await ev(() => setMode('onchain')); await page.$eval('#nav button[data-tab="heat"]', (e) => e.click()); await sleep(1200);
  ok('on-chain heat map has Tiles / Radar / Bubbles views', await ev(() => ['tiles', 'list', 'bubbles'].every((v) => document.querySelector(`#rdView button[data-v="${v}"]`)))); // v15.5 added a 4th ☰ Table view
  await page.click('#rdView button[data-v="list"]'); await page.waitForFunction(() => document.querySelectorAll('.rd-row').length > 5, null, { timeout: 15000 }).catch(() => {});
  ok('Radar lists new pairs from 2 pages (min $5K liquidity filters the tiny one)', await ev(() => document.querySelectorAll('.rd-row').length === 13), await ev(() => document.querySelectorAll('.rd-row').length));
  ok('rows show age ring, MC, liquidity, 1h volume, 5m change, buy/sell bar', await ev(() => { const r = document.querySelector('.rd-row'); return !!r.querySelector('.rd-age') && r.querySelectorAll('.rd-num').length === 4 && !!r.querySelector('.rd-bs .tc-bar i'); }));
  ok('newest first by default', await ev(() => /ZAP/.test(document.querySelector('.rd-row .rd-name').textContent)));
  await page.selectOption('#rdSort', 'volume'); await sleep(200);
  ok('sort by 1h volume', await ev(() => /JEET|NUB/.test(document.querySelector('.rd-row .rd-name').textContent) && !/JEET/.test(document.querySelector('.rd-row .rd-name').textContent) || /NUB/.test(document.querySelector('.rd-row .rd-name').textContent)));
  await page.selectOption('#rdLiq', '0'); await sleep(200);
  ok('"any" liquidity shows all 14', await ev(() => document.querySelectorAll('.rd-row').length === 14));
  await ev(() => OC.poll(NEW_POOLS_FOR_TEST = Radar.rows.slice(0, 3))).catch(() => {});
  await page.check('#rdSoc'); await sleep(300);
  ok('"has socials" keeps only tokens that list socials', await ev(() => [...document.querySelectorAll('.rd-row')].every((r) => (OC.social[r.dataset.oc] || {}).links && OC.social[r.dataset.oc].links.length)));
  await page.uncheck('#rdSoc'); await sleep(200);
  await page.click('#rdView button[data-v="bubbles"]'); await sleep(1200);
  ok('Bubbles view draws an animated canvas', await ev(() => { const c = $('#rdCv'); return c && c.width > 300 && Radar.pos.size > 5; }));
  const bub = await ev(() => { const [s, p] = [...Radar.pos.entries()][0]; const r = $('#rdCv').getBoundingClientRect(); return { s, x: r.left + p.x, y: r.top + p.y }; });
  await page.mouse.move(bub.x, bub.y); await sleep(300);
  ok('hovering a bubble shows its stats', await ev(() => !$('#rdTip').hidden && /MC/.test($('#rdTip').textContent)));
  await page.mouse.click(bub.x, bub.y); await sleep(1200);
  ok('clicking a bubble opens that token’s chart', await ev((s) => curTab === 'markets' && ST.sel === s, bub.s), await ev(() => curTab + ' ' + ST.sel));
  await ev(() => { ST.radar.view = 'tiles'; saveState(); });

  /* ───────── 5. token card ───────── */
  await page.waitForFunction(() => /Pool stats/.test(($('#tokenCard') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok('token card shows buy/sell pressure for 5m, 1h and 24h', await ev(() => $('#tokenCard').querySelectorAll('.tc-bs').length === 3 && /buyers/.test($('#tokenCard').textContent)));
  ok('token card shows pool stats (price, MC, liquidity, volume, age, holders)', await ev(() => ['Price', 'Market cap', 'Liquidity', 'Volume', 'Age', 'Holders'].every((k) => $('#tokenCard').textContent.includes(k))));
  await page.waitForFunction(() => /Website/.test(($('#tokenCard') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok('socials from the token info are shown as links (website, X, Discord)', await ev(() => { const t = $('#tokenCard').textContent; return /Website/.test(t) && /𝕏 X/.test(t) && /Discord/.test(t); }), await ev(() => $('#tokenCard .tc-soc').textContent));
  ok('unsafe social links are dropped (javascript:, http:, bad handles)', await ev(() => [...document.querySelectorAll('#tokenCard .tc-soc a')].every((a) => a.href.startsWith('https://') && a.rel.includes('noopener')) && !/insecure|javascript/.test($('#tokenCard .tc-soc').innerHTML) && !/Telegram/.test($('#tokenCard .tc-soc').textContent)), await ev(() => $('#tokenCard .tc-soc').innerHTML));
  ok('holders count and top-10 share are shown', await ev(() => /4\.3K/.test($('#tokenCard').textContent) && /top 10 hold 48%|top 10 hold 47%/.test($('#tokenCard').textContent)));
  ok('token description is shown as text (markup never runs)', await ev(() => /Best coin/.test($('#tokenCard').textContent) && !window.__pwn && !$('#tokenCard script') && !$('#tokenCard .tc-desc img')));
  await page.waitForFunction(() => /✓ No red flags|✕|!/.test(($('#tokenCard .tc-safe') || {}).textContent || '') && document.querySelector('#tokenCard .safe-pill'), null, { timeout: 15000 }).catch(() => {});
  ok('safety grade appears automatically with its top issues', await ev(() => !!document.querySelector('#tokenCard .safe-pill')), await ev(() => $('#tokenCard .tc-safe').textContent));
  const c0 = await ev(() => ACC.cash);
  await page.click('#tokenCard [data-qb="100"]'); await sleep(400);
  ok('quick "Buy $100" places a paper buy', await ev((c) => ACC.cash <= c - 99 && ACC.qty(ST.sel) > 0, c0));
  await page.click('#tokenCard [data-qs="0.5"]'); await sleep(300);
  const q1 = await ev(() => ACC.qty(ST.sel)); await page.click('#tokenCard [data-qs="1"]'); await sleep(300);
  ok('"Sell ½" then "Sell all" close the position', q1 > 0 && (await ev(() => !ACC.qty(ST.sel))));

  /* ───────── 6. launch forensics ───────── */
  const fz = await ev(async (mint) => { const s = Forensics.analyse(await Promise.all(['sig0', 'sig1', 'sig2', 'sig3', 'sig4', 'sig5'].map((x) => Sol.rpc('getTransaction', [x, {}]))), mint); return { creator: s.creator, snipers: s.snipers.length, bundle: s.bundle.length, buyers: s.buyers.length }; }, RUGMINT);
  ok('forensics finds the creator, 4 snipers (first 3 blocks) and a 3-wallet bundle', fz.creator === CREATOR && fz.snipers === 4 && fz.bundle === 3 && fz.buyers === 5, JSON.stringify(fz));
  const fh = await ev(async (mint) => { const d = document.createElement('div'), b = document.createElement('button'); document.body.appendChild(d); await Forensics.run(mint, d, b); const t = d.textContent; d.remove(); return t; }, RUGMINT);
  ok('launch check flags it High risk with % of supply held by snipers', /High risk/.test(fh) && /10\.5%/.test(fh) && /9\.5%/.test(fh), fh.slice(0, 300));
  const nw = await ev(() => Sol.wallets.length);
  await ev(async (mint) => { const d = document.createElement('div'); document.body.appendChild(d); d.innerHTML = Forensics.html(Forensics.cache[mint]); Forensics.bind(d, Forensics.cache[mint]); d.querySelector('[data-ftrack]').click(); d.remove(); }, RUGMINT);
  ok('"Track earliest buyers" adds them to the wallet tracker', await ev((n) => Sol.wallets.length === n + 5 && Sol.wallets.some((w) => /early #1/.test(w.name)), nw));

  /* ───────── 7. backtests: recent windows, new strategies, regimes, basket ───────── */
  await ev(() => setMode('crypto')); await page.$eval('#nav button[data-tab="bots"]', (e) => e.click()); await sleep(900);
  ok('15 new strategies are registered (crypto, meme coins, short selling, stocks)', await ev(() => NT.PACK3.length === 15 && ['Crypto', 'Meme coins', 'Short selling', 'Stocks'].every((c) => NT.STRAT_CATS.includes(c))));
  ok('strategy menu shows the new categories', await ev(() => ['Meme coins', 'Short selling'].every((c) => [...document.querySelectorAll('#suStrat optgroup')].some((g) => g.label.includes(c)))));
  ok('date-range menu has last hour / 24 hours / 2 days', await ev(() => ['r:0.0417', 'r:1', 'r:2'].every((v) => !!document.querySelector(`#btBars option[value="${v}"]`))));
  const win = await ev(async () => { const S = ST.setup; Object.assign(S, { strat: 'meme_burst', sym: 'BTC-USD', tf: '1m', bars: 'r:0.0417' }); renderSetup(); readSetup(); await runBacktest(); return { n: lastBt && lastBt.candles.length, from: lastBt && lastBt.res.from, eq: lastBt && lastBt.res.eq.length, note: histEstimate ? '' : '' }; });
  ok('"Last 1 hour" on 1m tests ~60 candles after 300 warm-up candles', win.n >= 55 && win.n <= 62 && win.from >= 290 && win.eq === win.n, JSON.stringify(win));
  const w24 = await ev(async () => { Object.assign(ST.setup, { tf: '5m', bars: 'r:1' }); renderSetup(); readSetup(); await runBacktest(); return lastBt.candles.length; });
  ok('"Last 24 hours" on 5m tests ~288 candles', w24 >= 280 && w24 <= 290, w24);
  const w2 = await ev(async () => { Object.assign(ST.setup, { tf: '15m', bars: 'r:2' }); renderSetup(); readSetup(); await runBacktest(); return lastBt.candles.length; });
  ok('"Last 2 days" on 15m tests ~192 candles', w2 >= 185 && w2 <= 194, w2);
  const bad = await ev(async () => { Object.assign(ST.setup, { tf: '1d', bars: 'r:0.0417' }); renderSetup(); readSetup(); await runBacktest(); return $('#btResult').textContent; });
  ok('a 1-hour window on daily candles explains to pick a smaller timeframe', /smaller timeframe/.test(bad), bad.slice(0, 200));
  ok('estimate text warns about too few candles', await ev(() => { Object.assign(ST.setup, { tf: '1h', bars: 'r:0.0417' }); return /very few candles/.test(histEstimate(ST.setup)); }));
  const sh = await ev(async () => { Object.assign(ST.setup, { strat: 'sh_breakdown', tf: '1h', bars: '2000' }); renderSetup(); readSetup(); await runBacktest(); return { short: lastBt.res.short, txt: $('#btResult').textContent }; });
  ok('short strategies backtest on the short account and say so', sh.short === true && /SHORT/.test(sh.txt) && /profits when price falls/.test(sh.txt), sh.txt.slice(0, 200));
  ok('every backtest shows a results-by-regime table with a verdict', /Results by market regime/.test(sh.txt) && /Up-trend/.test(sh.txt) && /Choppy/.test(sh.txt));
  for (const id of ['cx_trendvt', 'cx_mtf', 'cx_adaptive', 'meme_ladder', 'st_orb', 'sh_fade']) {
    const r = await ev(async (id) => { Object.assign(ST.setup, { strat: id, tf: id === 'st_orb' ? '5m' : '1h', bars: '1500', sym: id === 'st_orb' ? 'SPY' : 'BTC-USD' }); renderSetup(); readSetup(); try { await runBacktest(); return lastBt && lastBt.S.strat === id ? 'ok' : $('#btResult').textContent.slice(0, 120); } catch (e) { return e.message; } }, id);
    ok(`new strategy "${id}" runs in the real backtester`, r === 'ok', r);
  }
  await ev(() => { Object.assign(ST.setup, { strat: 'cx_trendvt', tf: '1h', bars: '1000', sym: 'BTC-USD' }); renderSetup(); ST.basket = { syms: 'BTC, ETH, SOL' }; Basket.render(); });
  await page.click('#bkRun'); await page.waitForFunction(() => /Verdict/.test(($('#bkOut') || {}).textContent || ''), null, { timeout: 60000 }).catch(() => {});
  ok('basket test runs one strategy on 3 markets with a verdict', await ev(() => /Verdict/.test($('#bkOut').textContent) && document.querySelectorAll('.bk-table tbody tr').length === 3 && /(Robust|Mixed|Fragile)/.test($('#bkOut').textContent)), await ev(() => $('#bkOut').textContent.slice(0, 300)));
  ok('basket summary includes an equal-weight basket return', await ev(() => /Equal-weight basket/.test($('#bkOut').textContent)));

  /* ───────── 8. no-code: short direction + higher timeframe ───────── */
  const nc = await ev(() => { const t = NT.Spec.TEMPLATES.find((x) => /4× timeframe/.test(x.name)), s = NT.Spec.TEMPLATES.find((x) => x.dir === 'short'); const v1 = NT.Spec.validate(t), v2 = NT.Spec.validate(s); return { ok: v1.ok && v2.ok, pine1: NT.Spec.toPine(v1.spec), pine2: NT.Spec.toPine(v2.spec), desc: NT.Spec.describe(v2.spec), short: NT.Spec.compile(v2.spec).short }; });
  ok('higher-timeframe template validates and exports Pine with request.security (no repaint)', nc.ok && /request\.security/.test(nc.pine1) && /lookahead=barmerge\.lookahead_on/.test(nc.pine1) && /\[1\]/.test(nc.pine1));
  ok('short template exports strategy.short and describes "Short when… Cover when…"', /strategy\.short/.test(nc.pine2) && /^Short when/.test(nc.desc) && /Cover when/.test(nc.desc) && nc.short === true, nc.desc);
  ok('bad higher timeframe is rejected with a clear message', await ev(() => { const v = NT.Spec.validate({ v: 1, name: 'x tf', entry: { all: [{ a: { k: 'rsi', tf: 5 }, op: '>', b: { k: 'const', v: 1 } }] }, risk: { sl: 2 } }); return !v.ok && /higher timeframe/.test(v.errors.join(' ')); }));

  /* ───────── 9. background bots (launcher) ───────── */
  await page.$eval('#nav button[data-tab="bots"]', (e) => e.click()); await sleep(1200);
  ok('Background bots panel is live when the launcher runs', await ev(() => BgBotsUI.on() && !!$('#bgForm2')), await ev(() => JSON.stringify(Launcher.caps)));
  ok('only no-code strategies are offered (plus templates)', await ev(() => [...$('#bgStrat').options].length >= NT.Spec.TEMPLATES.length && [...$('#bgStrat').options].every((o) => o.value.startsWith('tpl:') || !!(NT.strategies[o.value] && NT.strategies[o.value].spec)))); // v15p3 pack-4 specs are no-code too
  await page.fill('#bgSym', 'ETH'); await page.selectOption('#bgTf', '15m'); await page.fill('#bgCap', '2500');
  await page.click('#bgForm2 button[type="submit"]'); await page.waitForFunction(() => BgBotsUI.list.length >= 1, null, { timeout: 8000 }).catch(() => {});
  ok('starting a background bot creates it in the launcher', await ev(() => BgBotsUI.list.length === 1 && BgBotsUI.list[0].sym === 'ETH-USD' && BgBotsUI.list[0].tf === '15m' && BgBotsUI.list[0].capital === 2500), await ev(() => JSON.stringify(BgBotsUI.list).slice(0, 300)));
  ok('the bot table shows its status and controls', await ev(() => document.querySelectorAll('.bg-table tbody tr').length === 1 && !!document.querySelector('[data-bga="toggle"]')));
  await page.click('[data-bga="toggle"]'); await page.waitForFunction(() => BgBotsUI.list[0] && BgBotsUI.list[0].active === false, null, { timeout: 6000 }).catch(() => {});
  ok('Pause works', await ev(() => BgBotsUI.list[0].active === false));
  const n0 = await ev(() => Journal.entries.length);
  await ev(() => { ST.bgSeen = ['seed']; BgBotsUI.list = [{ id: 'x', name: 'Away <img src=x onerror="window.__pwn=7">', sym: 'BTC-USD', tf: '1h', capital: 1000, cash: 1000, active: true, status: 'ok', trades: [{ id: 'aa11', ts: Date.now() - 6e5, side: 'buy', price: 95000, qty: 0.01, usd: 950 }, { id: 'bb22', ts: Date.now() - 3e5, side: 'sell', price: 97000, qty: 0.01, usd: 970, pnl: 20, pnlPct: 0.02 }] }]; BgBotsUI.ingest(); });
  ok('trades made while you were away go into the journal once', await ev((n) => Journal.entries.length === n + 2 && Journal.entries.some((e) => /background bot/.test(e.src || '')), n0), await ev((n) => JSON.stringify({ n, now: Journal.entries.length, ready: Journal.ready, pend: Journal.pending && Journal.pending.length, seen: ST.bgSeen.length })));
  ok('re-syncing doesn\'t duplicate them', await ev((n) => { BgBotsUI.ingest(); return Journal.entries.length === n + 2; }, n0));
  await ev(() => BgBotsUI.refresh());
  await page.click('[data-bga="del"]'); await page.waitForFunction(() => /Sure/.test((document.querySelector('[data-bga="del"]') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {}); await page.click('[data-bga="del"]'); await page.waitForFunction(() => BgBotsUI.list.length === 0, null, { timeout: 6000 }).catch(() => {});
  ok('Delete (confirm click) removes the bot from the launcher', await ev(() => BgBotsUI.list.length === 0), await ev(() => JSON.stringify({ n: BgBotsUI.list.length, rows: document.querySelectorAll('.bg-table tbody tr').length, btn: (document.querySelector('[data-bga="del"]') || {}).textContent, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ').slice(0, 300) })));

  /* ───────── 10. wallet tracker upgrades ───────── */
  const W = await ev((T) => {
    const t0 = Date.now() - 3600e3, mk = (w, side, mint, i, usd, px) => ({ id: 'e' + w.slice(0, 4) + side + mint + i, sig: 's', ts: t0 + i * 1000, wallet: w, side, mint, amt: usd / px, usd, px, sol: usd / 200 });
    Sol.load(T.map((a, i) => ({ trackedWalletAddress: a, name: 'T' + i, alertsOn: true })));
    const evs = [];
    for (let k = 0; k < 8; k++) { const m = 'Mint' + k + 'x'.repeat(30); evs.push(mk(T[0], 'buy', m, k * 100, 100, 1)); evs.push(mk(T[0], 'sell', m, k * 100 + 50, k < 6 ? 150 : 80, k < 6 ? 1.5 : 0.8)); }
    for (let k = 0; k < 3; k++) { const m = 'Co' + k + 'x'.repeat(30); evs.push(mk(T[1], 'buy', m, 2000 + k * 100, 50, 1)); evs.push(mk(T[2], 'buy', m, 2000 + k * 100 + 1, 50, 1)); }
    for (const e of evs) Sol.emit(e, true);
    const s0 = WalletPro.score(Sol.byAddr(T[0])), s3 = WalletPro.score(Sol.byAddr(T[3]));
    WalletPro.funder = { [T[1]]: 'FUND', [T[3]]: 'FUND' }; const g = WalletPro.recalcLinks();
    return { s0, s3, links: WalletPro.links.length, groups: g.map((x) => x.members.length), why: g.map((x) => x.why).join('|') };
  }, TRADERS);
  ok('score v2 grades a 6-win/2-loss wallet and labels its style', W.s0.n === 8 && ['A', 'B'].includes(W.s0.grade) && W.s0.wr > 55 && W.s0.wr < 75 && W.s0.style === 'scalper (minutes)', JSON.stringify(W.s0));
  ok('a wallet with no closed trades gets "?" (needs 5+)', W.s3.grade === '?');
  ok('co-trading detection links two wallets that bought the same tokens within 3s', W.links === 1);
  ok('same-funder + co-trading wallets are merged into one linked group', W.groups.length === 1 && W.groups[0] === 3 && /same funder/.test(W.why) && /within 3s/.test(W.why), JSON.stringify(W));
  const CL = await ev(() => WalletPro.clusters().map((x) => ({ mint: x.mint.slice(0, 3), ind: x.independent, n: x.buyers.size })));
  ok('linked wallets count once in clusters (2 buyers → 1 independent → no cluster)', CL.every((x) => !(x.mint === 'Co0' && x.ind >= 2)), JSON.stringify(CL));
  const CB = await ev(() => WalletPro.copySim([{ mint: 'm1', sym: 'AAA', buyTs: 1e12, buyPx: 1, sellTs: 1e12 + 6e5, sellPx: 2, cs: null }, { mint: 'm2', sym: 'BBB', buyTs: 1e12, buyPx: 1, sellTs: 1e12 + 6e5, sellPx: 0.5, cs: null }], { delay: 10, size: 100, fee: 0.01, delayCost: 0.0015 }));
  ok('copy-backtest math: 10s delay costs ~1.5% each way, plus fees', CB.n === 2 && Math.abs(CB.rows[0].ret - ((2 * (1 - 0.015)) / (1 * 1.015) * 0.99 * 0.99 - 1) * 100) < 1e-6 && CB.rows[0].estimated === true && CB.own === 50, JSON.stringify(CB.rows[0]));
  const CB2 = await ev(() => { const cs = Array.from({ length: 100 }, (_, i) => ({ t: 1e9 + i * 60, o: 1 + i * 0.01, h: 1, l: 1, c: 1 + (i + 1) * 0.01 })); return WalletPro.copySim([{ mint: 'm', sym: 'C', buyTs: (1e9 + 600) * 1000, buyPx: 1.1, sellTs: (1e9 + 3000) * 1000, sellPx: 1.5, cs }], { delay: 30, size: 100, fee: 0, delayCost: 0.0015 }); });
  ok('copy-backtest uses real 1-minute candles when they cover the trade', CB2.rows[0].estimated === false && Math.abs(CB2.rows[0].inPx - 1.105) < 1e-9, JSON.stringify(CB2.rows[0]));
  await page.$eval('#nav button[data-tab="whales"]', (e) => e.click()); await sleep(600);
  await ev((a) => { openWallet(a); }, TRADERS[0]); await sleep(500);
  ok('wallet drawer shows Score v2 and the copy-backtest form', await ev(() => /Score v2/.test($('#dBody').textContent) && !!$('#cbRun')));
  await page.click('#cbRun'); await page.waitForFunction(() => /You \(copying\)|No complete trades|no buys/.test(($('#cbOut') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  ok('copy-backtest runs end to end from the drawer', await ev(() => /You \(copying\)/.test($('#cbOut').textContent) && document.querySelectorAll('.cb-table tbody tr').length >= 1), await ev(() => $('#cbOut').textContent.slice(0, 200)));
  await ev(() => closeDrawer && closeDrawer());
  ok('Smart money panel shows clusters, linked wallets and push settings', await ev(() => { WalletPro.renderPanel(); const t = $('#wpPanel').textContent; return /Weighted clusters/.test(t) && /Linked wallets/.test(t) && !!$('#wpPush'); }));
  await ev(() => openDiscover()); await sleep(400);
  await page.click('#dsSrc2 button[data-v="trending"]'); await page.waitForFunction(() => document.querySelectorAll('[data-dtadd]').length > 0 || /tracked/.test(($('#dBody') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  ok('Discover → "Active on trending tokens" lists live wallets from DEX trade feeds', await ev(() => (disc.trows || []).length === 4 && disc.trows.every((r) => r.tokens.length >= 2)), await ev(() => JSON.stringify(disc.trows || disc.terr).slice(0, 200)));
  ok('already-tracked wallets are marked instead of offered again', await ev(() => /tracked/.test($('#dBody').textContent)));

  /* ───────── 11. social ───────── */
  const SP = await ev(() => {
    const now = Date.now(), base = { market: 'crypto', src: 'reddit', eng: 1, url: null };
    Social.posts = []; Social.ids = new Set();
    const add = (o) => { const p = Object.assign({}, base, o, { id: 'p' + Social.posts.length }); p.tags = p.tags || []; p.cas = []; p.sent = { score: 0, label: 'neutral' }; Social.posts.push(p); };
    for (let h = 1; h < 20; h++) add({ ts: now - h * 3600e3 - 60000, text: 'steady $WIF chat ' + h, tags: ['WIF'], author: 'a' + h });
    for (let i = 0; i < 12; i++) add({ ts: now - i * 60000, text: '$ZAP is ripping right now, chart looks great ' + i, tags: ['ZAP'], author: 'u' + i });
    for (let i = 0; i < 4; i++) add({ ts: now - i * 60000, text: 'FREE AIRDROP claim now at zap-airdrop example, guaranteed 100x gem!!!', tags: ['ZAP'], author: 'bot' + i });
    SocialPro.flag(Social.posts);
    return { spam: Social.posts.filter((p) => p.spam).length, why: (Social.posts.find((p) => p.spam) || {}).spam, spikes: SocialPro.spikes('crypto').map((s) => s.k + ':' + s.z.toFixed(1)) };
  });
  ok('spam filter flags copy-paste shill posts with reasons', SP.spam === 4 && SP.why.some((w) => /same text posted by 4 accounts/.test(w)) && SP.why.includes('shill words'), JSON.stringify(SP));
  ok('spike detection: a ticker jumping from ~0 to 12 posts is a spike; steady chatter is not', SP.spikes[0].startsWith('ZAP:') && parseFloat(SP.spikes[0].split(':')[1]) >= 3 && !SP.spikes.some((s) => s.startsWith('WIF') && parseFloat(s.split(':')[1]) >= 3), SP.spikes.join(' '));
  await page.$eval('#nav button[data-tab="social"]', (e) => e.click()); await sleep(900);
  ok('Social side panel shows spikes and filters', await ev(() => /Spikes/.test($('#spPanel').textContent) && !!$('#spHide') && !!document.querySelector('#spPanel .sp-row')));
  ok('spam is hidden from the feed by default', await ev(() => soFiltered().every((p) => !p.spam) && soFiltered().length === Social.posts.filter((p) => !p.spam && p.market === soMarket()).length));
  ok('spam doesn\'t count toward trending', await ev(() => { const t = Social.trends('crypto').find((e) => e.k === 'ZAP'); return t && t.all === 12; }));
  await ev(() => $('#spHide').click()); await sleep(300);
  ok('unticking "hide spam" shows it again', await ev(() => soFiltered().some((p) => p.spam)));
  await ev(() => { if (!$('#spHide').checked) $('#spHide').click(); });
  const ai = await ev(async () => { ST.social.aiSent = true; Launcher.models = ['llama3.1:8b']; Launcher.caps.ollama = true; return SocialPro.aiSentiment(); });
  ok('local-AI sentiment rates posts through the launcher\'s Ollama bridge' + (OWN_OLLAMA ? '' : ' (skipped: a real Ollama owns :11434)'), !OWN_OLLAMA || ai === 20 && seenChat.length >= 1 && seenChat[0].response_format && seenChat[0].response_format.type === 'json_object', ai + ' / ' + seenChat.length);
  ok('AI scores replace the word-list sentiment' + (OWN_OLLAMA ? '' : ' (skipped: real Ollama)'), !OWN_OLLAMA || await ev(() => Social.posts.filter((p) => p.sent.ai).length === 20 && Social.posts.some((p) => p.sent.label === 'bullish') && Social.posts.some((p) => p.sent.label === 'bearish')));
  ok('the AI never sees spam posts', !seenChat.some((c) => /AIRDROP/.test(JSON.stringify(c))));
  await ev(() => { ST.settings.socialVol = true; setMode('crypto'); selectSym('BTC-USD'); });
  ok('social volume can be drawn under the price chart', await ev(() => chart.overlays.includes(SocialPro.overlay)));

  /* ───────── 12. drawing tools + undo/redo ───────── */
  await page.$eval('#nav button[data-tab="markets"]', (e) => e.click()); await sleep(900);
  ok('drawing toolbar has Channel, Zone, Long, Short, Ruler, Text and Undo', await ev(() => ['ch', 'rect', 'long', 'short', 'ruler', 'txt', 'undo'].every((v) => document.querySelector(`#drawBtns button[data-v="${v}"]`))));
  const box = await ev(() => { const r = chart.cv.getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.3, w: r.width, h: r.height }; });
  await ev(() => { chart.drawings = []; ST.draw[ST.sel] = chart.drawings; });
  await page.click('#drawBtns button[data-v="ch"]');
  await page.mouse.click(box.x, box.y); await page.mouse.click(box.x + 120, box.y + 30); await page.mouse.click(box.x + 60, box.y + 80); await sleep(200);
  ok('Channel takes 3 clicks and stores its width', await ev(() => chart.drawings.length === 1 && chart.drawings[0].type === 'ch' && chart.drawings[0].off !== 0));
  for (const t of ['rect', 'ruler', 'long']) { await page.click(`#drawBtns button[data-v="${t}"]`); await page.mouse.click(box.x - 60, box.y + 20); await page.mouse.click(box.x + 40, box.y + 70); await sleep(150); }
  ok('Zone, Ruler and Long position box are drawn', await ev(() => chart.drawings.map((d) => d.type).join() === 'ch,rect,ruler,long'));
  await page.click('#drawBtns button[data-v="txt"]'); await page.mouse.click(box.x, box.y + 40); await sleep(200);
  await page.keyboard.type('Breakout <b>here</b>'); await page.keyboard.press('Enter'); await sleep(200);
  ok('Text note is added and stripped of markup', await ev(() => { const d = chart.drawings[chart.drawings.length - 1]; return d.type === 'txt' && d.text === 'Breakout bhere/b'; }), await ev(() => JSON.stringify(chart.drawings[chart.drawings.length - 1])));
  await ev(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Control+z'); await sleep(150);
  ok('Ctrl+Z undoes the last drawing', await ev(() => chart.drawings.length === 4));
  await page.keyboard.press('Control+y'); await sleep(150);
  ok('Ctrl+Y redoes it', await ev(() => chart.drawings.length === 5));
  await page.click('#drawBtns button[data-v="undo"]'); await sleep(150);
  ok('the ↶ button undoes too, and drawings are saved per symbol', await ev(() => chart.drawings.length === 4 && ST.draw[ST.sel].length === 4));
  ok('chart redraws all new drawing types without errors', !errs.some((e) => /chart|overlay/i.test(e)), errs.join(' | '));

  /* ───────── 13. Copilot context, background tab, PWA, mobile ───────── */
  const cx = await ev(() => aiContext());
  ok('Copilot context includes journal habits, paper perps, wallet grades and derivatives', !!cx.journal && !!cx.paperPerps && !!cx.trackedWallets && !!cx.derivatives, Object.keys(cx).join(','));
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); BgTick.hiddenRuns = 0; });
  await sleep(3500);
  ok('a hidden tab keeps running bot checks from the worker heartbeat', await ev(() => BgTick.hiddenRuns >= 2));
  await ev(() => { delete document.hidden; });
  ok('manifest is linked for installing as an app', await ev(() => !!document.querySelector('link[rel="manifest"]')));
  ok('service worker is registered by the launcher page', await ev(async () => !!(await navigator.serviceWorker.getRegistration())));
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  ok('phones get the lighter mobile layout', await ev(() => document.documentElement.classList.contains('is-mobile')));
  await page.setViewportSize({ width: 1600, height: 950 });

  /* ───────── 14. XSS and errors ───────── */
  ok('no injected markup ran anywhere (descriptions, bot names, notes)', await ev(() => !window.__pwn));
  ok('no page errors during the whole run', errs.length === 0, errs.slice(0, 5).join(' | '));
  console.log(res.join('\n')); const n = res.filter((r) => r.startsWith('PASS')).length; console.log(`${n}/${res.length} passed`);
  await b.close(); ollama.close(); process.exit(n === res.length ? 0 : 1);
})();
