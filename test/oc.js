// On-chain mode end-to-end test with mocked GeckoTerminal + DexScreener (no real network)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const NOW = () => Math.floor(Date.now() / 1000);
const addr = (i, p = 'Pool') => (p + i + 'x'.repeat(40)).slice(0, 44).replace(/x/g, (c, k) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(k * 7 + i) % 55]);
const POOLS = Array.from({ length: 10 }, (_, i) => ({ a: addr(i), tok: addr(i, 'Tok'), s: ['FROGZ', 'MOONX', 'BONKY', 'CATWIF', 'GIGA', 'PNUTZ', 'SLERFY', 'POPCO', 'MEWZ', 'RETRD'][i], px: [0.0123, 0.00042, 0.0000271, 1.94, 0.071, 0.0038, 2.31, 0.000913, 0.0071, 0.33][i] }));
const NEWP = Array.from({ length: 6 }, (_, i) => ({ a: addr(i, 'New'), tok: addr(i, 'Ntk'), s: 'NEW' + i, px: 0.0001 * (i + 1) }));
const gtPool = (p, net = 'solana') => ({ id: net + '_' + p.a, type: 'pool', attributes: { name: p.s + ' / SOL', address: p.a, base_token_price_usd: String(p.px), reserve_in_usd: '845000', market_cap_usd: '5400000', fdv_usd: '6100000', pool_created_at: new Date(Date.now() - 5 * 864e5).toISOString(), price_change_percentage: { m5: '0.8', h1: '-2.1', h6: '7.5', h24: '23.4' }, transactions: { h1: { buys: 120, sells: 80 }, h24: { buys: 3100, sells: 2100, buyers: 900, sellers: 700 } }, volume_usd: { h1: '90000', h24: '2300000' } }, relationships: { base_token: { data: { id: net + '_' + p.tok } }, quote_token: { data: { id: net + '_So11111111111111111111111111111111111111112' } }, dex: { data: { id: 'raydium' } } } });
const inc = (list, net = 'solana') => list.map((p) => ({ id: net + '_' + p.tok, type: 'token', attributes: { address: p.tok, name: p.s + ' Token', symbol: p.s, image_url: null } })).concat([{ id: net + '_So11111111111111111111111111111111111111112', type: 'token', attributes: { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' } }]);
function ohlcv(px, unitSec, before, limit) {
  const end = Math.floor((before || NOW()) / unitSec) * unitSec - (before ? unitSec : 0), list = [], first = NOW() - 4000 * unitSec; let p = px;
  for (let i = 0; i < limit; i++) { const t = end - i * unitSec; if (t < first) break; const o = p * (1 + Math.sin(t / 5000) * 0.004 + (Math.random() - 0.5) * 0.01); list.push([t, o, Math.max(o, p) * 1.004, Math.min(o, p) * 0.996, p, 1000 + Math.random() * 5000]); p = o; }
  return { data: { attributes: { ohlcv_list: list } } };
}
const dsPair = (p, chain = 'solana') => ({ chainId: chain, dexId: 'raydium', pairAddress: p.a, baseToken: { address: p.tok, name: p.n || p.s + ' Token', symbol: p.s }, quoteToken: { symbol: 'SOL' }, priceUsd: String(p.px * (1 + (Math.random() - 0.5) * 0.002)), priceChange: { m5: 0.5, h1: 1.2, h6: -3, h24: 12.5 }, liquidity: { usd: 500000 }, fdv: 3e6, marketCap: 2.5e6, volume: { h24: 1.2e6, h1: 4e4 }, txns: { h24: { buys: 2000, sells: 1500 }, h1: { buys: 50, sells: 40 } }, pairCreatedAt: Date.now() - 864e5 * 3 });
const EVIL = { a: addr(77, 'Evl'), tok: addr(77, 'Etk'), s: '<img src=x onerror=window.__pwn=1>', n: '"><script>window.__pwn=2</script>', px: 0.5 };
const SEARCHP = { a: addr(50, 'Srch'), tok: addr(50, 'Stk'), s: 'FROGKING', px: 0.0042 };
const UNIT = { minute: 60, hour: 3600, day: 86400 };
let gtCalls = 0, dsCalls = 0;
function mock(target) {
  const u = new URL(target), q = u.searchParams, path = u.pathname;
  if (u.hostname === 'api.geckoterminal.com') {
    gtCalls++;
    let m;
    if ((m = /\/networks\/([a-z]+)\/trending_pools$/.exec(path))) return { data: POOLS.map((p) => gtPool(p, m[1])), included: inc(POOLS, m[1]) };
    if ((m = /\/networks\/([a-z]+)\/new_pools$/.exec(path))) return { data: NEWP.map((p) => gtPool(p, m[1])), included: inc(NEWP, m[1]) };
    if ((m = /\/pools\/([A-Za-z0-9]+)\/ohlcv\/(minute|hour|day)$/.exec(path))) { const p = POOLS.concat(NEWP, [SEARCHP]).find((x) => x.a === m[1]) || { px: 1 }; return ohlcv(p.px, UNIT[m[2]] * (+q.get('aggregate') || 1), +q.get('before_timestamp') || 0, +q.get('limit') || 100); }
    if ((m = /\/pools\/([A-Za-z0-9]+)\/trades$/.exec(path))) { const p = POOLS.concat(NEWP, [SEARCHP]).find((x) => x.a === m[1]) || { px: 1 }; return { data: Array.from({ length: 8 }, (_, i) => ({ attributes: { kind: i % 3 ? 'buy' : 'sell', block_timestamp: new Date(Date.now() - i * 4000).toISOString(), price_to_in_usd: String(p.px), price_from_in_usd: String(p.px), to_token_amount: '15000', from_token_amount: '15000', volume_in_usd: String(100 + i * 50), tx_hash: 'tx' + m[1].slice(0, 6) + i + Math.floor(Date.now() / 12000), tx_from_address: addr(i, 'Wal') } })) }; }
    if ((m = /\/pools\/([A-Za-z0-9]+)$/.exec(path))) { const p = POOLS.find((x) => x.a === m[1]); return p ? { data: gtPool(p) } : { data: null }; }
    return { data: [] };
  }
  if (u.hostname === 'api.dexscreener.com') {
    dsCalls++;
    if (path === '/latest/dex/search') return { pairs: [dsPair(SEARCHP), dsPair(EVIL), dsPair({ a: 'TRXpair000000000000000000', tok: 'T' + 'x'.repeat(30), s: 'TRONY', px: 1 }, 'tron')] };
    const m = /\/latest\/dex\/pairs\/([a-z]+)\/(.+)$/.exec(path);
    if (m) { const want = m[2].split(','); return { pairs: POOLS.concat(NEWP, [SEARCHP, EVIL]).filter((p) => want.includes(p.a)).map((p) => dsPair(p, m[1])) }; }
    return { pairs: [] };
  }
  return null;
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const res = [], ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  async function newPage(dexUp) {
    const page = await b.newPage({ viewport: { width: 1600, height: 950 } }), errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    await page.route('**/*', (r) => {
      const url = r.request().url(); let target = url;
      if (url.startsWith('http://localhost:8765/proxy')) target = new URL(url).searchParams.get('u') || '';
      else if (url.startsWith('http://localhost:8765')) return r.continue();
      let host = ''; try { host = new URL(target).hostname; } catch (e) { return r.abort(); }
      if (/geckoterminal|dexscreener/.test(host)) { if (!dexUp) return r.abort(); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(mock(target)) }); }
      return r.abort();
    });
    return { page, errs };
  }
  const { page, errs } = await newPage(true);
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  await page.goto('http://localhost:8765/'); await ev(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  await ev(() => { OC.rpm = 6000; });
  ok('three-way market switch rendered', await ev(() => document.querySelectorAll('#modeSwitch button').length === 3));
  await page.click('#modeSwitch button[data-mode="onchain"]');
  await page.waitForFunction(() => ST.mode === 'onchain' && ST.watch.length > 0 && chart.data.length > 50, null, { timeout: 30000 }).catch(() => {});
  ok('On-chain mode loads trending pools into the watchlist', await ev(() => ST.mode === 'onchain' && ST.watch.length === 10 && ST.watch.every((s) => OC.is(s))), await ev(() => ST.mode + ' ' + ST.watch.length));
  ok('chart shows DEX candles', await ev(() => chart.data.length > 50 && OC.is(ST.sel)), await ev(() => chart.data.length));
  ok('body + thumb in on-chain style', await ev(() => document.body.classList.contains('mode-onchain') && getComputedStyle(document.querySelector('#modeSwitch .thumb')).transform !== 'none'));
  ok('watchlist shows token tickers, not addresses', await ev(() => document.querySelector('#watchList .wl-row b').textContent === 'FROGZ'));
  ok('quote header shows token / quote · chain', await ev(() => /FROGZ \/ SOL · Solana/.test(document.querySelector('#qSym').textContent)), await ev(() => document.querySelector('#qSym').textContent));
  await sleep(2500);
  ok('pool stats replace the order book', await ev(() => $('#bookTitle').textContent === 'Pool stats' && /Liquidity/.test($('#book').textContent) && /buys/.test($('#book').textContent) && /sells/.test($('#book').textContent)), await ev(() => $('#book').textContent.slice(0, 160)));
  ok('risk flags shown', await ev(() => { Object.assign(OC.stats[ST.sel], { liq: 12000, created: Date.now() - 36e5, buys24: 900, sells24: 100 }); renderPoolStats(ST.sel); const t = $('#book').textContent; return /Thin liquidity/.test(t) && /under 24h/.test(t) && /Buy-heavy/.test(t); }));
  ok('DexScreener / GeckoTerminal links are https', await ev(() => [...document.querySelectorAll('#book a')].length >= 2 && [...document.querySelectorAll('#book a')].every((a) => a.href.startsWith('https://') && a.rel.includes('noopener'))));
  ok('live price from DEX poll', await ev(() => Feed.live[ST.sel] && Feed.live[ST.sel].price > 0 && Feed.live[ST.sel].open24 > 0));
  ok('swap tape fills with on-chain swaps', await ev(() => $('#tapeTitle').textContent === 'On-chain swaps' && document.querySelectorAll('#tape .t').length >= 5), await ev(() => $('#tape').textContent.slice(0, 80)));
  ok('header source shows DEX live', await ev(() => /DEX/.test($('#srcText').textContent)), await ev(() => $('#srcText').textContent));
  // timeframe change re-fetches
  await page.click('#tfBtns button:has-text("1h")'); await sleep(1500);
  ok('timeframe switch (1h) loads hourly candles', await ev(() => chart.data.length > 50 && chart.data[1].t - chart.data[0].t === 3600), await ev(() => chart.data.length > 1 ? chart.data[1].t - chart.data[0].t : 0));
  // picker: on-chain search, chain filter, sanitizer
  await page.click('#symInput'); await sleep(300);
  ok('picker opens on the On-chain tab with trending pools', await ev(() => SymPick.st && SymPick.st.tab === 'onchain' && document.querySelectorAll('#spList .sp-row').length >= 10));
  await page.fill('#spQ', 'frog'); await sleep(1200);
  const rows = await ev(() => [...document.querySelectorAll('#spList .sp-row')].map((r) => r.dataset.pick));
  ok('DEX search finds a token by name', rows.some((s) => s.includes('Srch')), rows.length + ' rows');
  ok('unsupported chains are filtered out', !rows.some((s) => /tron|TRX/.test(s)));
  ok('malicious token names are neutralised', await ev(() => !document.querySelector('#spList img[src="x"]') && !document.querySelector('#spList script') && !window.__pwn));
  await page.click('#spList .sp-row[data-pick*="Srch"]'); await sleep(1500);
  ok('picking a search hit opens its chart', await ev(() => /Srch/.test(ST.sel) && baseOf(ST.sel) === 'FROGKING' && chart.data.length > 50));
  // heat map
  await page.click('nav button[data-tab="heat"]'); await sleep(1200);
  ok('heat map shows trending DEX pools', await ev(() => document.querySelectorAll('#heatHost .tile[data-oc]').length === 10 && /On-chain/.test($('#heatAssetTag').textContent)));
  await page.click('#heatSize button:has-text("New pairs")'); await sleep(1200);
  ok('heat map: new pairs view', await ev(() => document.querySelectorAll('#heatHost .tile[data-oc]').length === 6));
  await page.click('#heatPeriod button:has-text("1h")'); await sleep(300);
  ok('heat map: period switch recolours', await ev(() => /1h/.test($('#heatStats').textContent)));
  await page.click('#heatHost .tile[data-oc]'); await sleep(1500);
  ok('clicking a tile opens that token', await ev(() => curTab === 'markets' && /New/.test(ST.sel)));
  // history paging + backtest
  const n = await ev(async () => (await History.get(ST.watch[0], 300, 2500)).length);
  ok('history pages back through GeckoTerminal (2,500 bars)', n >= 2400, String(n));
  await page.click('nav button[data-tab="bots"]'); await sleep(500);
  await ev(() => { ST.setup.sym = ST.watch[1]; ST.setup.strat = 'rsi'; ST.setup.tf = '15m'; renderSetup(); });
  ok('bot setup keeps the case-sensitive pool address', await ev(() => ST.setup.sym === ST.watch[1] && $('#suSym').value === ST.watch[1]));
  await page.click('#suBt'); await page.waitForFunction(() => !btBusy, null, { timeout: 60000 }); await sleep(500);
  ok('backtest runs on an on-chain token', await ev(() => /trades|Return|return/i.test($('#btOut') ? $('#btOut').textContent : document.querySelector('#tab-bots').textContent)));
  await page.click('#suPack'); await sleep(1500);
  ok('launch pack starts 4 bots on watchlist tokens', await ev(() => ST.bots.filter((x) => OC.is(x.sym)).length === 4 && ST.bots.every((x) => x.run)));
  await sleep(1500);
  ok('on-chain bots are not stopped as "unavailable"', await ev(() => ST.bots.every((x) => x.run && !(x._rt && x._rt.err))), await ev(() => ST.bots.map((x) => x._rt && x._rt.err).filter(Boolean).join(';')));
  // paper trade + portfolio scope
  await ev(() => ACC.buy(ST.watch[2], px(ST.watch[2]), 1000, Date.now(), { reason: 'test', src: 'manual' }));
  await page.click('nav button[data-tab="port"]'); await sleep(900);
  ok('portfolio scope label + holding', await ev(() => /On-chain only/.test($('#pfScope').textContent) && /BONKY/.test(document.querySelector('#tab-port').textContent)));
  // lab screener
  await page.click('nav button[data-tab="lab"]'); await sleep(600);
  await ev(() => { lab.sec = 'screener'; renderLab(); }); await sleep(300);
  await page.click('#scrUni button:has-text("On-chain")').catch(() => {}); await page.waitForFunction(() => !scr.busy && scr.rows.length > 0, null, { timeout: 60000 }).catch(() => {});
  ok('Lab screener scans on-chain tokens', await ev(() => scr.rows.length >= 8 && scr.rows.every((r) => OC.is(r.s))), await ev(() => scr.rows.length));
  // tracker + social follow crypto behaviour
  await page.click('nav button[data-tab="whales"]'); await sleep(600);
  ok('tracker tab shows the wallet tracker in on-chain mode', await ev(() => $('#navTrack').textContent === 'Wallet Tracker' && whView !== 'insider'));
  // mode round-trip and Alt+M cycle
  await page.click('#modeSwitch button[data-mode="crypto"]'); await sleep(1200);
  ok('back to crypto restores the crypto watchlist', await ev(() => ST.mode === 'crypto' && ST.watch.includes('BTC-USD')));
  await page.click('#modeSwitch button[data-mode="onchain"]'); await sleep(1200);
  ok('on-chain watchlist is kept between switches', await ev(() => ST.mode === 'onchain' && ST.watch.length >= 10 && OC.is(ST.sel)));
  await page.keyboard.press('Alt+m'); await sleep(900);
  ok('Alt+M cycles On-chain → Crypto', await ev(() => ST.mode === 'crypto'));
  await page.click('#modeSwitch button[data-mode="onchain"]'); await sleep(900);
  await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); await sleep(2500);
  ok('reload remembers on-chain mode with readable names', await ev(() => ST.mode === 'onchain' && OC.is(ST.sel) && !/…/.test(document.querySelector('#watchList .wl-row b').textContent)), await ev(() => ST.mode + ' ' + (document.querySelector('#watchList .wl-row b') || {}).textContent));
  // input hardening
  ok('symbol validator rejects junk', await ev(() => !OC.is('oc:solana:<script>') && !OC.is('oc:solana:abc') && !OC.is('oc:x:' + 'a'.repeat(44)) && OC.register('oc:solana:"><b>', {}) === null));
  ok('registry strips markup from names', await ev(() => { const s = OC.register('oc:solana:' + 'Z'.repeat(40), { s: '<b>HI</b>', n: 'a"b' }); return OC.meta[s].s === 'bHI/b' && OC.meta[s].n === 'ab'; }));
  await page.screenshot({ path: 'test/oc_markets.png' }); await page.click('nav button[data-tab="heat"]'); await sleep(1200); await page.screenshot({ path: 'test/oc_heat.png' }); await page.click('nav button[data-tab="markets"]'); await sleep(600);
  ok('no page errors (live mock)', errs.length === 0, errs.slice(0, 3).join(' | '));
  // offline: DEX APIs unreachable -> simulated tokens, clearly labelled
  const o = await newPage(false);
  await o.page.goto('http://localhost:8765/'); await o.page.evaluate(() => localStorage.clear()); await o.page.reload();
  await o.page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  await o.page.click('#modeSwitch button[data-mode="onchain"]');
  await o.page.waitForFunction(() => ST.mode === 'onchain' && chart.data.length > 50, null, { timeout: 40000 }).catch(() => {});
  ok('offline: falls back to simulated tokens', await o.page.evaluate(() => ST.mode === 'onchain' && OC.sim && ST.watch.every((s) => s.startsWith('oc:sim:')) && chart.data.length > 50));
  await o.page.waitForTimeout(3500);
  ok('offline: clearly labelled simulated', await o.page.evaluate(() => /simulated/i.test($('#srcText').textContent) && /Simulated/i.test($('#book').textContent)));
  ok('no page errors (offline)', o.errs.length === 0, o.errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length, ' gt calls', gtCalls, ' ds calls', dsCalls); await b.close();
})();
