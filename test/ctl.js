const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await b.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [], res = [];
  page.on('pageerror', (e) => errs.push(e.message)); const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  await page.click('nav button[data-tab="bots"]'); await page.click('#suPack'); await sleep(600);
  const fire = (side) => ev((sd) => { const bb = ST.bots[0], st = NT.strategies[bb.strat], orig = st.onBar; st.onBar = () => [{ side: sd, frac: 1, reason: 'test signal' }]; const c = getStore(bb.sym, bb.tf).candles.slice(0, -1); try { runBotBar(bb, c.length > 20 ? c : getStore('BTC-USD', '15m').candles); } finally { st.onBar = orig; } }, side);
  await page.click(`.bot[data-id="${await ev(() => ST.bots[0].id)}"] button[data-act="manual"]`); await sleep(200); ok('bot switched to manual approval', await ev(() => ST.bots[0].manual === true));
  await ev(() => getStore(ST.bots[0].sym, ST.bots[0].tf).load(300)); await sleep(1500);
  await fire('buy'); await sleep(300); ok('manual bot queues its signal instead of trading', await ev(() => ST.pending.length === 1 && !ST.bots[0].account.pos[ST.bots[0].sym]));
  ok('control center lists the pending signal', await ev(() => document.querySelectorAll('#botCtl [data-pfill]').length === 1));
  await page.click('#botCtl [data-pfill]'); await sleep(300); ok('fill at market executes the bot trade', await ev(() => !!ST.bots[0].account.pos[ST.bots[0].sym] && ST.pending.length === 0));
  await fire('sell'); await sleep(300); const qid = await ev(() => ST.pending[0].id); const want = await ev(() => +(px(ST.bots[0].sym) * 1.01).toFixed(4));
  await page.fill(`#botCtl [data-ppx="${qid}"]`, String(want)); await page.click(`#botCtl [data-pfillpx="${qid}"]`); await sleep(300);
  ok('fill at my own price', await ev((w) => { const t = ST.bots[0].account.trades.slice(-1)[0]; return t.side === 'sell' && Math.abs(t.price - w * (1 - ST.bots[0].account.slip)) / w < 0.002; }, want));
  await fire('buy'); await sleep(200); await page.click('#botCtl [data-prej]'); await sleep(200); ok('reject a signal', await ev(() => ST.pending.length === 0 && !ST.bots[0].account.pos[ST.bots[0].sym]));
  await page.click(`.bot[data-id="${await ev(() => ST.bots[0].id)}"] button[data-act="manual"]`); await sleep(100); await fire('buy'); await sleep(300);
  ok('auto mode trades immediately again', await ev(() => !!ST.bots[0].account.pos[ST.bots[0].sym]));
  await page.click(`.bot[data-id="${await ev(() => ST.bots[0].id)}"] button[data-act="close"]`); await sleep(300); ok('close one bot position', await ev(() => !ST.bots[0].account.pos[ST.bots[0].sym]));
  // limit orders: fill now + cancel
  await ev(() => { ACC.limit ? 0 : 0; ACC.orders.push({ id: 'o1', sym: 'BTC-USD', side: 'buy', price: px('BTC-USD') * 0.9, size: 1000, meta: {} }, { id: 'o2', sym: 'ETH-USD', side: 'buy', price: px('ETH-USD') * 0.9, size: 500, meta: {} }); renderBotCtl(); });
  await page.click('#botCtl [data-ofill="o1"]'); await sleep(300); ok('limit order: fill now at market', await ev(() => !!ACC.pos['BTC-USD'] && !ACC.orders.some((o) => o.id === 'o1')));
  await page.click('#botCtl [data-ocancel="o2"]'); await sleep(200); ok('limit order: cancel', await ev(() => !ACC.orders.some((o) => o.id === 'o2')));
  // pause/resume all, kill switch
  await page.click('#botCtl [data-ctl="pauseall"]'); await sleep(200); ok('pause all bots', await ev(() => ST.bots.every((x) => !x.run)));
  await page.click('#botCtl [data-ctl="resumeall"]'); await sleep(200); ok('resume all bots', await ev(() => ST.bots.every((x) => x.run)));
  await ev(() => { for (const bb of ST.bots.slice(0, 3)) bb.account.buy(bb.sym, px(bb.sym) || 100, 500, Date.now(), { reason: 't' }); ACC.orders.push({ id: 'o3', sym: 'SOL-USD', side: 'buy', price: 1, size: 100, meta: {} }); ST.bots[1].manual = true; ST.pending.push({ id: 'p9', ts: Date.now(), botId: ST.bots[1].id, bot: 'x', sym: ST.bots[1].sym, side: 'buy', sig: { side: 'buy', frac: 1 }, ref: 1 }); renderBotCtl(); });
  await page.click('#botCtl [data-ctl="kill"]'); await sleep(200); await page.click('#botCtl [data-ctl="kill"]'); await page.waitForFunction(() => ST.bots.every((x) => !x.run && !x.account.pos[x.sym]) && !ST.pending.length && !ACC.orders.length, null, { timeout: 8000 }).catch(() => {}); // wait for the outcome, not a fixed delay (slow under load)
  ok('STOP EVERYTHING: bots paused, positions closed, pending + limits cancelled', await ev(() => ST.bots.every((x) => !x.run && !x.account.pos[x.sym]) && !ST.pending.length && !ACC.orders.length));
  // portfolio close all
  await ev(() => { ACC.buy('ETH-USD', px('ETH-USD'), 800, Date.now(), { reason: 't' }); }); await page.click('nav button[data-tab="port"]'); await sleep(300); await ev(() => { if (typeof V182UI !== 'undefined') V182UI.Pf.legacy(true); }); await sleep(500);
  await page.click('#pfHoldNote [data-pfcloseall]'); await page.waitForFunction(() => /Sure/.test((document.querySelector('#pfHoldNote [data-pfcloseall]') || {}).textContent || ''), null, { timeout: 3000 }).catch(() => {}); await page.click('#pfHoldNote [data-pfcloseall]').catch(() => {}); await page.waitForFunction(() => Object.keys(ACC.pos).length === 0, null, { timeout: 3000 }).catch(() => {});
  ok('portfolio: close all positions', await ev(() => Object.keys(ACC.pos).length === 0));
  // copilot stays on chat
  await page.click('nav button[data-tab="ai"]'); await page.fill('#chatIn', 'how are my bots doing?'); await page.press('#chatIn', 'Enter'); await page.waitForFunction(() => !aiBusy, null, { timeout: 30000 }); await sleep(200);
  ok('copilot answers without leaving the chat', await ev(() => curTab === 'ai' && /bot/i.test(ST.chat[ST.chat.length - 1].text)));
  await page.click('nav button[data-tab="bots"]'); await sleep(400); await page.screenshot({ path: 'test/ctl.png' });
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length); await b.close();
})();
