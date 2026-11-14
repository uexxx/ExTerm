const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [], pwn = [], res = [];
  page.on('pageerror', (e) => errs.push(e.message)); await page.exposeFunction('__pwn', (w) => pwn.push(w));
  const ok = (name, cond, info = '') => res.push((cond ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : ''));
  const X = '<img src=x onerror="window.__pwn(\'social\')">', J = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('token-profiles/latest')) return J(r, [{ chainId: 'solana', tokenAddress: 'Moon1111111111111111111111111111111111pump', url: 'javascript:window.__pwn(1)', description: 'moon $MOON ' + X, links: [{ type: 'twitter', url: 'https://x.com/m' }] }]);
    if (u.includes('token-boosts/latest')) return J(r, []);
    if (u.includes('reddit.com')) return J(r, { data: { children: [{ data: { id: 'a1', title: '$MOON 100x ' + X, selftext: 'bullish', author: 'd', created_utc: Date.now() / 1000 - 60, score: 5, num_comments: 1, permalink: '/r/x/1' } }] } });
    if (u.includes('stocktwits.com')) return J(r, { messages: [{ id: 9, body: '$NVDA up ' + X, created_at: new Date().toISOString(), user: { username: 't', name: 'T' }, entities: { sentiment: { basic: 'Bullish' } }, symbols: [{ symbol: 'NVDA' }] }] });
    return (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || ''))); });
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const ev = (f) => page.evaluate(f), sleep = (ms) => page.waitForTimeout(ms);
  ok('proxy detected with session token', await ev(() => J.proxy && J.token().length > 20));
  ok('strict CSP active (hash, no unsafe-inline script)', await ev(() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content; return /script-src 'sha256-/.test(m) && !/script-src[^;]*unsafe-inline/.test(m); }));
  // CSP blocks injected inline handler even if markup gets in
  await ev(() => { const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__pwn(\'csp-test\')">'; document.body.appendChild(d); }); await sleep(300);
  ok('CSP blocks injected inline event handler', !pwn.includes('csp-test'));
  // every tab, both modes
  for (const mode of ['crypto', 'stocks']) { await ev((m) => setMode(m), mode); await sleep(400);
    for (const t of ['markets', 'heat', 'bots', 'port', 'whales', 'social', 'ai', 'lab', 'set']) { await page.click(`nav button[data-tab="${t}"]`); await sleep(350); }
    ok(`all 9 tabs render in ${mode} mode`, errs.length === 0, errs.slice(0, 2).join(' | ')); }
  await ev(() => setMode('crypto')); await page.click('nav button[data-tab="markets"]');
  await page.waitForFunction(() => chart && chart.data.length > 50 && chart.L && chart.L.hi != null, null, { timeout: 30000 });
  ok('nav 3D slider follows active tab', await ev(() => { const b = document.querySelector('.navbar3d'), on = document.querySelector('#nav button.on'); return b && Math.abs(parseFloat(b.style.width) - on.offsetWidth) < 2; }));
  // picker cross-market
  await page.click('#symInput'); await page.fill('#spQ', 'AAPL'); await page.press('#spQ', 'Enter'); await sleep(700); ok('picker: AAPL switches to stocks', await ev(() => ST.mode === 'stocks' && ST.sel === 'AAPL'));
  await page.click('#symInput'); await page.fill('#spQ', 'ETH'); await page.press('#spQ', 'Enter'); await sleep(700); ok('picker: ETH back to crypto', await ev(() => ST.mode === 'crypto' && ST.sel === 'ETH-USD'));
  await page.waitForFunction(() => chart && chart.data.length > 50 && chart.L && chart.L.hi != null, null, { timeout: 30000 });
  // drawing tools
  const box = await (await page.$('#chartHost canvas')).boundingBox();
  await page.click('#drawBtns button[data-v="h"]'); await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
  await page.click('#drawBtns button[data-v="fib"]'); await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45); await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.2);
  ok('chart drawing tools save', await ev(() => (ST.draw['ETH-USD'] || []).length === 2));
  // paper trade + portfolio
  await page.fill('#tkUsd', '1500'); await page.click('#tkGo, button:has-text("Buy ETH")').catch(() => {}); await sleep(400);
  await page.click('nav button[data-tab="port"]'); await sleep(600); ok('portfolio tracks paper trade', await ev(() => pfTrades().length >= 1), await ev(() => pfTrades().length + ' trades'));
  // backtest + validation on a stock from crypto mode
  await page.click('nav button[data-tab="bots"]'); await sleep(300); await page.click('[data-symfield="suSym"]'); await page.fill('#spQ', 'NVDA'); await page.press('#spQ', 'Enter'); await sleep(300);
  await page.selectOption('#suStrat', 'pro_trendpb'); await page.selectOption('#btBars', '5000').catch(() => {});
  await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 60000 }); ok('backtest runs (stock from crypto mode)', /Strategy return/.test(await page.textContent('#btResult')));
  await page.click('#btVal2'); await page.waitForFunction(() => document.querySelector('#btVal .gradebig'), null, { timeout: 120000 }).catch(() => {}); ok('validation lab grades strategy', !!(await page.$('#btVal .gradebig')), (await ev(() => (document.querySelector('#btVal .gradebig') || {}).textContent)) || '');
  // social with hostile payloads
  await page.click('nav button[data-tab="social"]'); await page.waitForFunction(() => Social.lastRun > 0, null, { timeout: 20000 }); await sleep(400);
  ok('social feed loads (crypto)', await ev(() => document.querySelectorAll('#soFeed .spost').length >= 2));
  // wallet tracker
  await page.click('nav button[data-tab="whales"]');
  await ev(() => { Sol.stop(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; }); Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(10000);
  ok('wallet trades decoded on first pass', await ev(() => Sol.trades.length > 10), await ev(() => Sol.trades.length + ' trades'));
  ok('convergence spotlight shows multi-wallet token', await ev(() => /wallets buying/.test(document.querySelector('#trSpot').textContent)));
  await page.click('#trDiag'); await page.waitForFunction(() => !tr.diagBusy && tr.diag && tr.diag.length >= 4, null, { timeout: 20000 });
  ok('diagnostics: launcher, RPC, activity, decode all pass', await ev(() => tr.diag.slice(0, 4).every((d) => d.ok)));
  await page.click('#wTable .wcard'); await sleep(2500); ok('wallet drawer shows holdings + trades', await ev(() => /Holdings/.test(document.querySelector('#drawer').textContent)));
  await ev(() => closeDrawer());
  // stocks insider spotlight + social
  await ev(() => setMode('stocks')); await sleep(500); await page.click('nav button[data-tab="whales"]'); await sleep(500); ok('insider convergence spotlight', await ev(() => /Insider convergence/.test(document.querySelector('#inSpot').textContent)));
  await page.click('nav button[data-tab="social"]'); await sleep(2500); ok('social feed loads (stocks)', await ev(() => document.querySelectorAll('#soFeed .spost').length >= 1));
  // lab
  await page.click('nav button[data-tab="lab"]'); for (const s of ['screener', 'corr', 'forecast', 'season', 'risk', 'alerts', 'fng', 'news']) { await page.click(`#labNav button[data-v="${s}"]`); await sleep(700); }
  ok('all 8 lab sections render', errs.length === 0, errs.slice(0, 2).join(' | '));
  // settings privacy
  await page.click('nav button[data-tab="set"]'); await sleep(300); await page.selectOption('#seKeyMode', 'session'); await page.click('#sePrivSave'); await sleep(200);
  ok('session-only keys keep secrets out of localStorage', await ev(() => { ST.ai.key = 'sk-test-secret'; saveState(); return !localStorage.getItem(LS_KEY).includes('sk-test-secret'); }));
  // equity tween
  ok('equity counter animates smoothly', await ev(() => !!FX3.tw.get(document.getElementById('eqVal'))));
  ok('no XSS payload executed anywhere', pwn.length === 0, pwn.join(','));
  const csp = await ev(() => window.__csp.filter((v) => !/csp-test|^img-src/.test(v)));
  ok('no unexpected CSP violations (app runs under strict policy)', csp.filter((v) => /script/.test(v) && !/inline/.test(v)).length === 0, csp.slice(0, 3).join(' | '));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'test/full_final.png' });
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length + ' passed');
  await browser.close();
})();
