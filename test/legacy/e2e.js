const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|WebSocket|net::/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://localhost:8765')) r.continue(); else r.abort(); });
  await page.goto('http://localhost:8765/');
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  const log = (...a) => console.log(...a);
  log('provider:', await page.evaluate(() => Providers.active.id), '| proxy:', await page.evaluate(() => J.proxy), '| banner:', (await page.textContent('#banner')).slice(0, 80));
  await page.waitForTimeout(3500);
  log('price:', await page.textContent('#qPrice'), '| candles:', await page.evaluate(() => getStore(ST.sel, ST.tf).candles.length), '| src:', await page.textContent('#srcText'));
  await page.screenshot({ path: 'test/s_markets.png' });
  // manual trade
  await page.fill('#tkUsd', '2500'); await page.fill('#tkSl', '3'); await page.click('#tkGo');
  await page.waitForTimeout(300);
  log('after buy: cash', await page.evaluate(() => ACC.cash.toFixed(2)), 'pos', await page.evaluate(() => JSON.stringify(Object.keys(ACC.pos))), 'sl', await page.evaluate(() => ACC.pos[ST.sel] && ACC.pos[ST.sel].sl.toFixed(2)));
  // indicators
  for (const k of ['rsi', 'macd', 'bb', 'fc']) await page.click(`#indBtns button[data-k="${k}"]`);
  await page.click('#tfBtns button[data-v="1h"]'); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test/s_markets_ind.png' });
  // symbol switch
  await page.fill('#symInput', 'sol'); await page.press('#symInput', 'Enter'); await page.waitForTimeout(800);
  log('selected:', await page.evaluate(() => ST.sel));
  // heat map
  await page.click('nav button[data-tab="heat"]'); await page.waitForTimeout(1500);
  log('heat tiles:', await page.$$eval('.tile', (t) => t.length), '| note:', (await page.textContent('#heatNote')).slice(0, 70));
  await page.screenshot({ path: 'test/s_heat.png' });
  // bots
  await page.click('nav button[data-tab="bots"]'); await page.click('#suPack'); await page.waitForTimeout(500);
  await page.click('#btRun'); await page.waitForTimeout(2500);
  log('bots:', await page.evaluate(() => ST.bots.length), '| bt stats:', (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 160));
  await page.click('#btOpt'); await page.waitForTimeout(4000);
  log('optimizer rows:', await page.$$eval('[data-apply]', (b) => b.length));
  await page.screenshot({ path: 'test/s_bots.png', fullPage: false });
  // AI
  await page.click('nav button[data-tab="ai"]');
  for (const q of ['analyze eth', 'buy $1000 of BTC', 'sell half my btc', 'start a grid bot on sol 1m', 'backtest donchian on eth 4h', 'alert me when btc goes above 1000000', 'what are the whales doing', 'top movers', 'portfolio', 'tell me a joke']) {
    await page.fill('#chatIn', q); await page.press('#chatIn', 'Enter');
    await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); await page.waitForTimeout(150);
    const last = await page.evaluate(() => ST.chat[ST.chat.length - 1].text);
    log(' AI>', q, '=>', last.replace(/\s+/g, ' ').slice(0, 130));
  }
  await page.screenshot({ path: 'test/s_ai.png' });
  // whales
  await page.click('nav button[data-tab="whales"]'); await page.fill('#wAddr', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'); await page.click('#wAdd'); await page.waitForTimeout(6500);
  log('whale events:', await page.evaluate(() => Whale.events.length), '| rows:', await page.$$eval('#whFeed tr', (r) => r.length), '| watched:', await page.evaluate(() => Whale.watch.length));
  await page.screenshot({ path: 'test/s_whales.png' });
  // lab
  await page.click('nav button[data-tab="lab"]'); await page.click('#scrRun'); await page.waitForFunction(() => !scr.busy, null, { timeout: 30000 }); await page.waitForTimeout(300);
  log('screener rows:', await page.$$eval('#labBody tbody tr', (r) => r.length));
  await page.screenshot({ path: 'test/s_lab.png' });
  for (const s of ['news', 'corr', 'forecast', 'alerts', 'fng']) { await page.click(`#labNav button[data-v="${s}"]`); await page.waitForTimeout(1500); log(' lab', s, '=>', (await page.textContent('#labBody')).replace(/\s+/g, ' ').slice(0, 90)); }
  await page.click(`#labNav button[data-v="corr"]`); await page.waitForTimeout(1500); await page.screenshot({ path: 'test/s_corr.png' });
  // portfolio + settings
  await page.click('nav button[data-tab="port"]'); await page.waitForTimeout(500);
  log('portfolio:', (await page.textContent('#pfStats')).replace(/\s+/g, ' ').slice(0, 150));
  await page.screenshot({ path: 'test/s_port.png' });
  await page.click('nav button[data-tab="set"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/s_set.png' });
  // palette
  await page.keyboard.press('Control+k'); await page.keyboard.type('doge'); await page.waitForTimeout(200);
  log('palette items:', await page.$$eval('#palList .it', (r) => r.map((x) => x.textContent).slice(0, 4).join(' | ')));
  await page.keyboard.press('Escape');
  // persistence
  await page.evaluate(() => saveState()); await page.reload();
  await page.waitForFunction(() => window.__novaterm_ready === true, null, { timeout: 60000 });
  log('after reload: bots', await page.evaluate(() => ST.bots.length), 'trades', await page.evaluate(() => ACC.trades.length), 'chat', await page.evaluate(() => ST.chat.length));
  // wait for live bots to process closed 1m bars
  log('waiting 75s for 1m bars to close…');
  await page.click('nav button[data-tab="bots"]');
  await page.waitForTimeout(75000);
  log('bot status:', JSON.stringify(await page.evaluate(() => ST.bots.map((b) => [b.name, b.lastBar ? 'bar ok' : 'no bar', b.account.trades.length, b._rt && b._rt.err]))));
  await page.screenshot({ path: 'test/s_bots_live.png' });
  log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
