const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); (u.startsWith('http://localhost:8765') || u.startsWith('http://localhost:8899')) ? r.continue() : r.abort(); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => { localStorage.clear(); }); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 90000 });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  const pick = async (sel, q) => { await page.click(sel); await page.waitForSelector('#symPop.on'); await page.fill('#spQ', q); await sleep(150); await page.press('#spQ', 'Enter'); await sleep(400); };
  await sleep(1500);
  console.log('wallets:', await ev(() => Sol.wallets.length), 'set:', await ev(() => ST.walletSet));
  // header picker cross-market
  await page.click('#symInput'); await page.waitForSelector('#symPop.on'); await sleep(200); await page.screenshot({ path: 'test/v5_picker.png' });
  await page.fill('#spQ', 'AAPL'); await sleep(150); await page.press('#spQ', 'Enter'); await sleep(800);
  console.log('header pick AAPL → mode', await ev(() => ST.mode), 'sel', await ev(() => ST.sel));
  await page.click('#symInput'); await page.fill('#spQ', 'sol'); await sleep(150); await page.press('#spQ', 'Enter'); await sleep(800);
  console.log('header pick sol → mode', await ev(() => ST.mode), 'sel', await ev(() => ST.sel));
  // bots: stock in crypto mode
  await page.click('nav button[data-tab="bots"]'); await sleep(300);
  await pick('[data-symfield="suSym"]', 'NVDA'); console.log('setup sym:', await ev(() => ST.setup.sym), '| mode:', await ev(() => ST.mode), '| bt header:', (await page.textContent('#btForm')).replace(/\s+/g, ' ').slice(0, 60));
  await page.selectOption('#suStrat', 'pro_rsi2'); await sleep(200); await page.selectOption('#btBars', '5000').catch(() => {});
  await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 90000 }); console.log('NVDA pro_rsi2:', (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 170));
  await pick('[data-symfield="btSymPick"]', 'DOGE'); console.log('bt header pick DOGE → setup', await ev(() => ST.setup.sym));
  await page.click('#btRun'); await page.waitForFunction(() => !btBusy, null, { timeout: 90000 }); console.log('DOGE pro_rsi2:', (await page.textContent('#btResult')).replace(/\s+/g, ' ').slice(0, 120));
  await pick('[data-symfield="suSym"]', 'TSLA'); await page.click('#suCreate'); await sleep(500); console.log('bots:', await ev(() => ST.bots.map((b) => b.sym).join(',')), '| listed:', await ev(() => document.querySelectorAll('#botList .bot').length));
  console.log('strategy optgroup first in Mean Reversion:', await ev(() => [...document.querySelectorAll('#suStrat optgroup')].map((g) => g.label.split(' (')[0] + ':' + g.querySelector('option').textContent).slice(0, 9).join(' | ')));
  await page.screenshot({ path: 'test/v5_bots.png' });
  // lab
  await page.click('nav button[data-tab="lab"]'); await sleep(400);
  await page.click('#scrUni button[data-v="mixed"]'); await page.waitForFunction(() => !scr.busy && scr.rows.length, null, { timeout: 60000 }); console.log('screener mixed:', await ev(() => scr.rows.map((r) => baseOf(r.s)).join(',')));
  await page.screenshot({ path: 'test/v5_lab_screener.png' });
  await page.click('#labNav button[data-v="corr"]'); await sleep(300); await page.click('#corrPre button[data-v="mixed"]'); await sleep(3500); console.log('corr cols:', await ev(() => [...document.querySelectorAll('table.corr thead th')].map((t) => t.textContent).join(',')));
  await page.screenshot({ path: 'test/v5_lab_corr.png' });
  await page.click('#labNav button[data-v="forecast"]'); await sleep(800); await pick('[data-symfield="fcSym"]', 'TSLA'); await sleep(1500); console.log('forecast:', (await page.textContent('#labBody')).replace(/\s+/g, ' ').slice(0, 140));
  await page.click('#fcTf button[data-v="4h"]'); await sleep(1500); await page.screenshot({ path: 'test/v5_lab_forecast.png' });
  await page.click('#labNav button[data-v="fng"]'); await sleep(800); await page.click('#fgMkt button[data-v="stocks"]').catch(() => {}); await sleep(800); console.log('fng:', (await page.textContent('#labBody')).replace(/\s+/g, ' ').slice(0, 100));
  await page.click('#labNav button[data-v="alerts"]'); await sleep(400); await pick('[data-symfield="alSym"]', 'MSFT'); console.log('alert px prefill:', await ev(() => $('#alPx').value), 'sym', await ev(() => $('#alSym').value));
  // wallet tracker with mock RPC
  await page.click('nav button[data-tab="whales"]'); await sleep(400);
  await ev(() => { Sol.stop(); Sol.trades = []; Sol.ids = new Set(); Sol.custom = 'http://localhost:8899'; Sol.DEXS = 'http://localhost:8899'; Sol.speed = 'fast'; Sol.solPx = 200; Sol.wallets.forEach((w) => { w.lastSig = null; w.lastCheck = 0; w.recent = []; w.buys = w.sells = 0; }); Sol.start({ sim: false }); tr.dirty = tr.wdirty = true; }); await sleep(14000);
  console.log('radar:', (await page.textContent('#trHero')).replace(/\s+/g, ' ').slice(0, 260));
  console.log('net:', (await page.textContent('#trNet')).replace(/\s+/g, ' ').slice(0, 120));
  console.log('cards:', await ev(() => document.querySelectorAll('#wTable .wcard').length), 'first:', await ev(() => [...document.querySelectorAll('#wTable .wcard')].slice(0, 4).map((c) => c.querySelector('.nm').textContent + ' [' + c.querySelector('.sub').textContent + ']').join(' | ')));
  await page.screenshot({ path: 'test/v5_tracker.png' });
  await page.click('#wTier button[data-v="whale"]'); await sleep(300); console.log('whales:', await ev(() => document.querySelectorAll('#wTable .wcard').length));
  await page.click('#wTier button[data-v="all"]');
  await page.hover('#trHero .rk'); await sleep(300); console.log('tilt on hover:', await ev(() => !!document.querySelector('.tilting')));
  console.log('ERRORS:', errs.length ? errs.slice(0, 8) : 'none'); await browser.close();
})();
