const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [], pwn = [];
  page.on('pageerror', (e) => errs.push(e.message)); await page.exposeFunction('__pwn', (w) => pwn.push(w));
  const X = '<img src=x onerror="window.__pwn(\'social\')">';
  const J = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('token-profiles/latest')) return J(r, [{ chainId: 'solana', tokenAddress: 'Moon1111111111111111111111111111111111pump', url: 'javascript:window.__pwn("dexurl")', icon: 'https://cdn.example/i.png', description: 'To the moon $MOON ' + X, links: [{ type: 'twitter', url: 'https://x.com/moontoken' }] }]);
    if (u.includes('token-boosts/latest')) return J(r, [{ chainId: 'solana', tokenAddress: 'Boost111111111111111111111111111111111pump', url: 'https://dexscreener.com/solana/boost', totalAmount: 500, description: 'boosted $BOOST' }]);
    if (u.includes('reddit.com')) return J(r, { data: { children: [{ data: { id: 'a1', title: 'Is $MOON the next 100x? ' + X, selftext: 'bullish moon pump', author: 'degen', created_utc: Date.now() / 1000 - 60, score: 50, num_comments: 9, permalink: '/r/x/1' } }, { data: { id: 'a2', title: '$MOON rug? careful', selftext: 'bearish crash dump', author: 'b', created_utc: Date.now() / 1000 - 120, score: 3, num_comments: 1, permalink: '/r/x/2' } }] } });
    if (u.includes('stocktwits.com')) return J(r, { messages: [{ id: 9, body: '$NVDA breaking out ' + X, created_at: new Date().toISOString(), user: { username: 'trader1', name: 'T1', followers: 1200 }, entities: { sentiment: { basic: 'Bullish' } }, symbols: [{ symbol: 'NVDA' }], likes: { total: 4 } }] });
    return (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const ev = (f) => page.evaluate(f), sleep = (ms) => page.waitForTimeout(ms);
  // drawing tools
  await page.click('#drawBtns button[data-v="t"]'); const box = await (await page.$('#chartHost canvas')).boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3); await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.2);
  await page.click('#drawBtns button[data-v="fib"]'); await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45); await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.15);
  await page.click('#drawBtns button[data-v="h"]'); await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
  console.log('drawings saved:', await ev(() => (ST.draw[ST.sel] || []).map((d) => d.type).join(',')));
  await page.screenshot({ path: 'test/s2_draw.png' });
  // social crypto
  await page.click('nav button[data-tab="social"]'); await page.waitForFunction(() => Social.lastRun > 0, null, { timeout: 20000 }); await sleep(500);
  console.log('social crypto posts:', await ev(() => document.querySelectorAll('#soFeed .spost').length), '| trends:', await ev(() => [...document.querySelectorAll('#soTrends .trend b')].map((b) => b.textContent).slice(0, 4).join(' ')), '| sources:', await ev(() => JSON.stringify(Object.fromEntries(Object.entries(Social.src).map(([k, v]) => [k, v.ok])))));
  await page.screenshot({ path: 'test/s2_social.png' });
  // tracker + spotlight with mock RPC
  await page.click('nav button[data-tab="whales"]');
  await ev(() => { Sol.stop(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; }); Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(11000);
  console.log('trades decoded:', await ev(() => Sol.trades.length), '| spotlight:', (await page.textContent('#trSpot')).replace(/\s+/g, ' ').slice(0, 150));
  await page.click('#trDiag'); await page.waitForFunction(() => !tr.diagBusy, null, { timeout: 20000 }); console.log('diagnostics:', await ev(() => (tr.diag || []).map((d) => (d.ok ? '✓' : '✕') + d.name.slice(0, 22)).join(' | ')));
  await page.click('#wTable .wcard'); await sleep(2500); console.log('drawer:', (await page.textContent('#drawer')).replace(/\s+/g, ' ').slice(0, 160));
  await ev(() => closeDrawer()); await page.screenshot({ path: 'test/s2_tracker.png' });
  // stocks: social + insider spotlight
  await ev(() => setMode('stocks')); await sleep(600); await page.click('nav button[data-tab="social"]'); await sleep(2500);
  console.log('social stocks posts:', await ev(() => document.querySelectorAll('#soFeed .spost').length));
  await page.click('nav button[data-tab="whales"]'); await sleep(600); console.log('insider spotlight:', (await page.textContent('#inSpot')).replace(/\s+/g, ' ').slice(0, 120));
  // lab new sections
  await page.click('nav button[data-tab="lab"]'); await page.click('#labNav button[data-v="season"]'); await sleep(2500); console.log('season:', await ev(() => ($('#seDowT') || {}).textContent));
  await page.click('#labNav button[data-v="risk"]'); await sleep(500); console.log('risk:', (await page.textContent('#rkOut')).replace(/\s+/g, ' ').slice(0, 110));
  console.log('XSS EXECUTIONS:', pwn.length ? pwn : 'none', '| ERRORS:', errs.length ? errs.slice(0, 6) : 'none'); await browser.close();
})();
