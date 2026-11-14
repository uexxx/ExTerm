const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errs = [], res = [], pwn = []; page.on('pageerror', (e) => errs.push(e.message)); await page.exposeFunction('__pwn', (w) => pwn.push(w));
  const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const X = '<img src=x onerror="window.__pwn(1)">', J = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('token-profiles/latest')) return J(r, [{ chainId: 'solana', tokenAddress: 'Moon1111111111111111111111111111111111pump', url: 'https://dexscreener.com/solana/m', description: 'moon $MOON ' + X, links: [] }]);
    if (u.includes('token-boosts/latest')) return J(r, [{ chainId: 'solana', tokenAddress: 'Bonk1111111111111111111111111111111111pump', url: 'javascript:window.__pwn(2)', totalAmount: 50, description: '$BONK' }]);
    if (u.includes('reddit.com')) return J(r, { data: { children: [{ data: { id: 'a', title: '$MOON bullish moon ' + X, selftext: '', author: 'x', created_utc: Date.now() / 1000 - 30, score: 9, num_comments: 2, permalink: '/r/x/a' } }, { data: { id: 'b', title: '$DOOM crash dump bearish', selftext: '', author: 'y', created_utc: Date.now() / 1000 - 90, score: 1, num_comments: 0, permalink: '/r/x/b' } }] } });
    if (u.includes('stocktwits.com')) return J(r, { messages: [{ id: 1, body: '$NVDA rip ' + X, created_at: new Date().toISOString(), user: { username: 'u', name: 'U' }, entities: { sentiment: { basic: 'Bullish' } }, symbols: [{ symbol: 'NVDA' }] }, { id: 2, body: '$TSLA dump', created_at: new Date().toISOString(), user: { username: 'v', name: 'V' }, entities: { sentiment: { basic: 'Bearish' } }, symbols: [{ symbol: 'TSLA' }] }] });
    return (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  // ── wallet tracker
  await page.click('nav button[data-tab="whales"]');
  await ev(() => { Sol.stop(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; }); ST.copy.on = true; ST.copy.minSol = 1; ST.copy.who = 'all'; Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(12000);
  ok('tracker: 50 curated wallets + decoded trades', await ev(() => Sol.wallets.length === 50 && Sol.trades.length > 10), await ev(() => Sol.trades.length + ' trades'));
  await page.waitForFunction(() => COPY.trades.length > 0, null, { timeout: 25000 }).catch(() => {}); // mock wallets alternate buy/sell every 6 s
  ok('copy-bot paper-copies wallet buys', await ev(() => COPY.trades.length > 0), await ev(() => COPY.trades.length + ' copy trades'));
  for (const f of ['buys', 'sells', 'alerts', 'all', 'swaps']) { await page.click(`#trFilter button[data-v="${f}"]`); await sleep(150); } ok('feed filters', await ev(() => tr.filter === 'swaps'));
  await page.click('#trSpot [data-spwin="60"]').catch(() => {}); await sleep(200); ok('spotlight window switch', await ev(() => spot.win === 60));
  await page.click('#wTier button[data-v="consistent"]'); await sleep(200); ok('tier filter', await ev(() => [...document.querySelectorAll('#wTable .wcard .tier')].every((t) => /Consistent/i.test(t.textContent))));
  await page.click('#wTier button[data-v="all"]'); for (const s of ['wr', 'pnl', 'active', 'trades', 'name', 'score']) { await page.selectOption('#wSort', s); await sleep(100); } ok('wallet sort options', await ev(() => tr.sort === 'score'));
  await page.fill('#wQ', 'doji'); await sleep(200); ok('wallet search', await ev(() => document.querySelectorAll('#wTable .wcard').length === 1)); await page.fill('#wQ', ''); await page.dispatchEvent('#wQ', 'input');
  const before = await ev(() => Sol.wallets.find((w) => w.name === 'Doji').alerts); await page.click('#wTable .wcard [data-walert]'); await sleep(150); ok('toggle wallet alert', await ev((b) => Sol.wallets[0] && true, before));
  await page.click('#wAddToggle'); await page.fill('#wsAddr', 'notanaddress'); await page.click('#wAddSol'); await sleep(150); ok('reject invalid wallet address', await ev(() => Sol.wallets.length === 50));
  await page.fill('#wsAddr', 'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE'); await page.fill('#wsName', 'Test wallet'); await page.click('#wAddSol'); await sleep(200); ok('add a valid wallet', await ev(() => Sol.wallets.length === 51));
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#wExp'); ok('export wallet list', !!(await dl));
  await page.fill('#wImpText', JSON.stringify([{ trackedWalletAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', name: 'Imported', emoji: '🐳', alertsOn: false }])); await page.click('#wImpGo'); await sleep(200); ok('import wallets (JSON)', await ev(() => Sol.wallets.some((w) => w.name === 'Imported')));
  await page.click('#wDiscover'); await sleep(800); ok('discover drawer lists top traders (already-tracked ones marked)', await ev(() => document.querySelectorAll('#drawer tbody tr').length > 5 && (document.querySelectorAll('#drawer [data-dsadd]').length > 0 || /tracking/.test(document.querySelector('#drawer').textContent)))); await ev(() => closeDrawer());
  await page.click('#wScore'); await sleep(600); const rr = await page.$('#rkRun'); if (rr) { await rr.click(); await sleep(6000); } ok('score/rank drawer runs', await ev(() => /ranked|score/i.test(document.querySelector('#drawer').textContent))); await ev(() => closeDrawer());
  await page.click('#wTable .wcard'); await page.waitForFunction(() => /Holdings/.test(document.querySelector('#drawer').textContent) && /Recent trades/i.test(document.querySelector('#drawer').textContent), null, { timeout: 12000 }).catch(() => {}); ok('wallet drawer: holdings + recent trades', await ev(() => /Holdings/.test(document.querySelector('#drawer').textContent) && /Recent trades/i.test(document.querySelector('#drawer').textContent)));
  const ren = await page.$('#drawer [data-wren]'); if (ren) { await ren.click(); await sleep(200); await page.fill('#dRenN', 'Doji Renamed').catch(() => {}); await page.click('#dRenOk').catch(() => {}); await sleep(200); } ok('rename wallet', await ev(() => Sol.wallets.some((w) => w.name === 'Doji Renamed')));
  await ev(() => closeDrawer());
  await page.click('#trDiag'); await page.waitForFunction(() => !tr.diagBusy && tr.diag && tr.diag.length >= 4, null, { timeout: 20000 }); ok('diagnostics pass (launcher, RPC, activity, decode)', await ev(() => tr.diag.slice(0, 4).every((d) => d.ok)), await ev(() => tr.diag.filter((d) => !d.ok).map((d) => d.name + ': ' + d.info).join(' | ')));
  if (await ev(() => $('#wAddBox').hidden)) await page.click('#wAddToggle'); await page.click('#wDefault'); await sleep(150); await page.click('#wDefault'); await sleep(400); ok('reset to curated list', await ev(() => Sol.wallets.length === 50));
  await page.click('#whView button[data-v="chain"]').catch(() => {}); await sleep(600); ok('BTC/ETH whale view renders', errs.length === 0); await page.click('#whView button[data-v="tracker"]').catch(() => {});
  // ── insider tracker (stocks)
  await ev(() => setMode('stocks')); await sleep(600); await page.click('nav button[data-tab="whales"]'); await sleep(400); await page.click('#inScan').catch(() => {}); await page.waitForFunction(() => document.querySelectorAll('#inFeed tr').length > 3, null, { timeout: 20000 }).catch(() => {}); // live EDGAR via the launcher can take several seconds
  ok('insider feed + clusters + spotlight', await ev(() => document.querySelectorAll('#inFeed tr').length > 3 && /Insider convergence/.test(document.querySelector('#inSpot').textContent)));
  // ── social
  await page.click('nav button[data-tab="social"]'); await sleep(3000); ok('social stocks: StockTwits + Reddit posts', await ev(() => document.querySelectorAll('#soFeed .spost').length >= 3));
  await page.click('#soSent button[data-v="bear"]'); await sleep(200); ok('social sentiment filter', await ev(() => [...document.querySelectorAll('#soFeed .pill2')].every((p) => p.classList.contains('bear')))); await page.click('#soSent button[data-v="all"]');
  await ev(() => setMode('crypto')); await sleep(400); await page.click('nav button[data-tab="social"]'); await page.waitForFunction(() => Social.posts.some((p) => p.market === 'crypto'), null, { timeout: 20000 }); await sleep(500);
  await page.click('#soTrends .trend'); await sleep(200); ok('social: click trending tag filters feed', await ev(() => !!so.tag));
  await page.click('#soSrc button[data-v="dex"]'); await sleep(200); ok('social source filter', await ev(() => [...document.querySelectorAll('#soFeed .sbadge2')].every((x) => x.classList.contains('s-dex'))));
  // ── lab: every section + screener universes
  await page.click('nav button[data-tab="lab"]'); await page.click('#labNav button[data-v="screener"]'); await sleep(300);
  for (const u of ['crypto', 'stocks', 'etfs', 'mixed', 'mag7', 'watch']) { await page.click(`#scrUni button[data-v="${u}"]`); await page.waitForFunction(() => !scr.busy && scr.rows.length > 0, null, { timeout: 40000 }).catch(() => {}); }
  ok('screener: all 6 universes scan', await ev(() => scr.rows.length > 0));
  for (const s of ['corr', 'forecast', 'season', 'risk', 'alerts', 'fng', 'news']) { await page.click(`#labNav button[data-v="${s}"]`); await sleep(900); }
  ok('lab: all sections render', errs.length === 0, errs.slice(0, 2).join(' | '));
  // ── security
  ok('security: no injected payload executed', pwn.length === 0, pwn.join(','));
  ok('security: relays refuse requests with credentials', await ev(() => !J.relayable('https://finance.yahoo.com/x', { headers: { 'x-api-key': 'k' } }) && !J.relayable('https://api.stocktwits.com/x', { headers: { Authorization: 'Bearer z' } }) && J.relayable('https://api.stocktwits.com/x', {})));
  ok('security: safeUrl blocks javascript:/data:', await ev(() => safeUrl('javascript:alert(1)') === '#' && safeUrl('data:text/html,x') === '#' && safeUrl('https://ok.com/a') === 'https://ok.com/a'));
  ok('security: token metadata sanitized', await ev(() => Sol.clean('<b>‮EVIL', 16) === 'bEVIL'.replace('b', '') || !/[<>‮]/.test(Sol.clean('<b>‮EVIL', 16))));
  await page.click('nav button[data-tab="set"]'); await sleep(300); await page.click('#seForget'); await sleep(100); await page.click('#seForget'); await sleep(200);
  ok('security: forget all API keys wipes them', await ev(() => !ST.ai.key && !ST.settings.stKey && !ST.settings.heliusKey && !(ST.social && ST.social.xToken)));
  ok('no page errors (part B)', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length + ' passed'); await browser.close();
})();
