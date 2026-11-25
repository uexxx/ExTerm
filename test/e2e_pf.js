const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const ev = (f) => page.evaluate(f), sleep = (ms) => page.waitForTimeout(ms);
  await sleep(2500);
  // manual buy via ticket
  await page.fill('#tkAmt', '2500').catch(() => {}); const bb = await page.$('#tkGo, #tkSubmit, button:has-text("Buy BTC")'); if (bb) await bb.click(); await sleep(400);
  // copilot buys
  await page.click('nav button[data-tab="ai"]');
  for (const q of ['buy $1500 of ETH', 'buy $800 of SOL']) { await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); }
  // bot with history of trades + copy-bot on
  await ev(() => { ST.copy.on = true; ST.copy.minSol = 0; });
  await ev(() => { const b = ST.bots.length ? null : null; });
  await page.click('nav button[data-tab="bots"]'); const lp = await page.$('#botPack, button:has-text("Launch")'); if (lp) await lp.click(); await sleep(300);
  // simulate a few closed trades in a bot + manual sell to populate analytics
  await ev(() => { const now = Date.now(); ACC.sell('SOL-USD', px('SOL-USD') * 1.04, null, now, { reason: 'test take-profit', src: 'manual' });
    if (ST.bots[0]) { const a = ST.bots[0].account, s = ST.bots[0].sym, p = px(s); for (let i = 0; i < 6; i++) { a.buy(s, p * (1 - i * 0.003), 1500, now - (8 - i) * 864e5 / 2); a.sell(s, p * (1 + (i % 3 === 0 ? -0.02 : 0.025)), null, now - (8 - i) * 864e5 / 2 + 3 * 36e5, { reason: i % 3 ? 'signal exit' : 'stop-loss' }); } } });
  await sleep(9000);
  console.log('badge:', await ev(() => !$('#pfBadge').hidden && $('#pfBadge').textContent));
  await page.click('nav button[data-tab="port"]'); await sleep(300); await ev(() => { if (typeof V182UI !== 'undefined') V182UI.Pf.legacy(true); }); await sleep(1200);
  console.log('stats:', (await page.textContent('#pfStats')).replace(/\s+/g, ' ').slice(0, 330));
  console.log('accounts:', await ev(() => [...document.querySelectorAll('#pfAccts tr.acc-row')].map((r) => r.querySelector('b').textContent + ' ' + r.children[3].textContent + ' tr=' + r.children[6].textContent).join(' | ')));
  console.log('positions:', await ev(() => document.querySelectorAll('#pfHold tbody tr').length), '| journal:', (await page.textContent('#pfTradeSum')));
  console.log('who in journal:', await ev(() => [...new Set([...document.querySelectorAll('#pfTrades .pill')].map((x) => x.textContent))].join(', ')));
  await page.screenshot({ path: 'test/pf_top.png' });
  await ev(() => document.querySelector('#pfByAsset').scrollIntoView()); await sleep(300); await page.screenshot({ path: 'test/pf_bottom.png' });
  await page.selectOption('#pfAcct', 'k:copilot'); await sleep(300); console.log('copilot filter:', await page.textContent('#pfTradeSum'));
  await page.selectOption('#pfAcct', 'all'); await page.click('#pfSide button[data-v="win"]'); await sleep(300); console.log('winners:', await page.textContent('#pfTradeSum'));
  await page.fill('#pfQ', 'ETH'); await sleep(300); console.log('search ETH:', await page.textContent('#pfTradeSum'), '| focus kept:', await ev(() => document.activeElement.id));
  await page.fill('#pfQ', ''); await page.click('#pfSide button[data-v="all"]');
  const n0 = await ev(() => document.querySelectorAll('#pfHold tbody tr').length); const cb = await page.$('#pfHold [data-close]'); if (cb) { await cb.click(); await sleep(500); } console.log('close:', n0, '→', await ev(() => document.querySelectorAll('#pfHold tbody tr').length));
  await page.click('#pfAccts tr.acc-row:nth-child(2)').catch(() => {}); await sleep(300); console.log('row filter:', await ev(() => pf.acct), await page.textContent('#pfTradeSum'));
  await page.click('#pfScope button[data-v="all"]'); await sleep(300); await ev(() => setMode('stocks')); await sleep(800); await page.click('#pfScope button[data-v="mode"]'); await sleep(400); console.log('stocks scope:', await page.textContent('#pfScopeNote'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await browser.close();
})();
