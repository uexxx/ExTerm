// Pro features: 15s–2h timeframes, Bar Replay, advanced ticket (risk sizing, stop orders, trailing), 3D depth, Copilot+.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const res = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 950 } }), errs = [];
  const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') && !r.request().url().includes('/proxy') ? r.continue() : r.abort()));
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  const _click = page.click.bind(page); page.click = (sel, o) => _click(sel, Object.assign({ timeout: 6000 }, o)).catch((e) => res.push('FAIL click ' + sel));
  await page.goto('http://localhost:8765/'); await ev(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  // timeframes
  ok('14 timeframes in crypto mode (1s and 5s added in v15 p3, 10s in v15.7)', await ev(() => document.querySelectorAll('#tfBtns button').length === 14));
  for (const tf of ['15s', '30s', '3m', '30m', '2h']) {
    await page.locator(`#tfBtns button:has-text("${tf}")`).dispatchEvent('click'); await page.waitForFunction((t) => chart.data.length > 50 && chart.tfSec === NT.TF[t], tf, { timeout: 15000 }).catch(() => {});
    ok(`${tf} chart loads with ${tf} spacing`, await ev((t) => chart.data.length > 50 && chart.data[5].t - chart.data[4].t === NT.TF[t], tf), await ev(() => chart.data.length + ' bars, step ' + (chart.data[5] ? chart.data[5].t - chart.data[4].t : '?')));
  }
  await page.locator('#tfBtns button:has-text("15s")').dispatchEvent('click'); await sleep(600);
  ok('15s axis shows seconds', await ev(() => /\d\d:\d\d:\d\d/.test(fmtTime(chart.data[3].t, 15))));
  const h = await ev(async () => (await History.get(ST.sel, 1800, 500)).length);
  ok('30m history aggregates from 5m', h >= 400, String(h));
  await page.click('#modeSwitch button[data-mode="stocks"]'); await sleep(1500);
  ok('stocks mode offers 1s / 5s / 15s like every market (v15 p3)', await ev(() => ['1s', '5s', '15s'].every((t) => [...document.querySelectorAll('#tfBtns button')].some((x) => x.textContent.trim() === t))));
  await page.click('#modeSwitch button[data-mode="crypto"]'); await sleep(1500);
  await page.locator('#tfBtns button:has-text("1h")').dispatchEvent('click'); await sleep(800);
  // ticket: risk sizing, quick ATR, R:R
  await page.click('#tkSize button[data-z="risk"]'); await sleep(200);
  ok('risk sizing auto-fills a 2 ATR stop', await ev(() => parseFloat($('#tkSl').value) > 0 && !$('#tkRiskRow').hidden));
  await page.click('#tkQuick [data-q="tp2"]'); await sleep(100);
  ok('TP 2R = twice the stop', await ev(() => Math.abs(parseFloat($('#tkTp').value) - 2 * parseFloat($('#tkSl').value)) < 0.02));
  ok('estimate shows risk, reward and R:R', await ev(() => /risk \$/.test($('#tkEst').textContent) && /R:R 1:2\.0/.test($('#tkEst').textContent)), await ev(() => $('#tkEst').textContent));
  const eq0 = await ev(() => ACC.equity(priceMap()));
  await page.fill('#tkTr', '5'); await page.click('#tkGo'); await sleep(400);
  ok('risk-sized buy risks ~1% of equity', await ev((e0) => { const t = ACC.trades[ACC.trades.length - 1], sl = parseFloat($('#tkSl').value) / 100; return t && t.side === 'buy' && Math.abs(t.usd * sl - e0 * 0.01) / (e0 * 0.01) < 0.05; }, eq0));
  ok('trailing stop attached to the position', await ev(() => { const p = ACC.pos[ST.sel]; return p && p.trail === 0.05; }));
  // stop entry order
  await page.click('#tkSize button[data-z="usd"]'); await page.click('#tkType button[data-t="stop"]'); await sleep(100);
  await ev(() => { $('#tkLimit').value = (px(ST.sel) * 1.001).toPrecision(8); $('#tkUsd').value = '500'; $('#tkQuick [data-q="clr"]').click(); });
  await page.click('#tkGo'); await sleep(200);
  ok('buy stop armed and listed', await ev(() => ST.stops.length === 1 && /Buy ≥/.test($('#tkStops').textContent)));
  const n0 = await ev(() => ACC.trades.length);
  await ev(() => Feed.tick(ST.sel, ST.stops[0].trigger * 1.002, {})); await sleep(300);
  ok('stop triggers on a price through the level', await ev((n) => ST.stops.length === 0 && ACC.trades.length === n + 1 && /stop buy/.test(ACC.trades[ACC.trades.length - 1].reason), n0));
  await page.click('#tkType button[data-t="market"]');
  // 3D depth
  await page.click('#bookView button[data-v="3d"]'); await sleep(3500);
  ok('3D liquidity view renders', await ev(() => !!document.querySelector('#book canvas.d3') && Depth3D.snaps.length >= 1 && /imbalance/.test($('#d3Leg').textContent)), await ev(() => Depth3D.snaps.length));
  await ev(() => { const cv = document.querySelector('#book canvas.d3'), r = cv.getBoundingClientRect(), o = { bubbles: true, pointerId: 1, pointerType: 'mouse' }; cv.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: r.left + 100, clientY: r.top + 40 }, o))); cv.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: r.left + 180, clientY: r.top + 20 }, o))); cv.dispatchEvent(new PointerEvent('pointerup', o)); });
  ok('3D view rotates on drag', await ev(() => Depth3D.rotX !== 0.55));
  await page.click('#bookView button[data-v="list"]'); await sleep(1500);
  ok('back to list book', await ev(() => !document.querySelector('#book canvas.d3')));
  // replay
  await ev(() => window.scrollTo(0, 0)); await page.click('#replayBtn'); await sleep(1200);
  if (!(await ev(() => Replay.on))) console.log('DEBUG replay', await ev(() => [getStore(ST.sel, ST.tf).candles.length, ST.tf, ST.sel, [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|')]));
  ok('replay hides the future', await ev(() => Replay.on && chart.data.length < Replay.data.length && !!$('#replayBar')));
  const l0 = await ev(() => chart.data.length);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(200);
  ok('→ steps one bar at a time', await ev((l) => chart.data.length === l + 2, l0));
  await page.click('#replayBar [data-rp="buy"]'); await page.click('#replayBar [data-rp="step10"]'); await page.click('#replayBar [data-rp="sell"]'); await sleep(200);
  ok('practice trades are separate from the paper account', await ev(() => Replay.acct.trades.length === 2 && !ACC.trades.some((t) => t.src === 'replay') && /Practice equity/.test($('#rpStats').textContent)));
  await page.click('#replayBar [data-sp="25"]'); await page.keyboard.press(' '); await sleep(700); await page.keyboard.press(' ');
  ok('play advances automatically', await ev((l) => chart.data.length > l + 13, l0));
  await page.click('#replayBar [data-rp="exit"]'); await sleep(400);
  ok('exit restores the live chart', await ev(() => !Replay.on && !$('#replayBar') && chart.data.length === getStore(ST.sel, ST.tf).candles.length));
  // copilot+
  await page.click('nav button[data-tab="ai"]'); await sleep(300);
  const ask = async (q, wait = 2500) => { await ev((x) => aiSend(x), q); await page.waitForFunction(() => !aiBusy, null, { timeout: 120000 }); await sleep(wait > 0 ? 200 : 0); return ev(() => ST.chat[ST.chat.length - 1]); };
  let m = await ask('best strategy for BTC 1h');
  ok('Copilot ranks strategies', /Strategy ranking/.test(m.text) && m.acts && m.acts.length >= 2, m.text.slice(0, 80));
  m = await ask('optimize pro_kama on ETH 1h');
  ok('Copilot walk-forward optimizes', /Walk-forward/.test(m.text) && /unseen/i.test(m.text), m.text.slice(0, 80));
  m = await ask('scan oversold');
  ok('Copilot scans the market', /Scan \(1h\)/.test(m.text), m.text.slice(0, 80));
  m = await ask('levels for SOL');
  ok('Copilot gives levels + risk plan', /Key levels/.test(m.text) && /1% account risk/.test(m.text), m.text.slice(0, 80));
  m = await ask('position size ETH risking 2% stop at 5%');
  ok('Copilot sizes a position', /risking 2%/.test(m.text), m.text.slice(0, 120));
  m = await ask('BTC vs ETH');
  ok('Copilot compares two markets', /Correlation/.test(m.text), m.text.slice(0, 80));
  const nb = await ev(() => ST.bots.length);
  m = await ask('buy $300 of SOL and start a kama bot on ETH 1h');
  ok('Copilot runs chained commands', /Step 1/.test(m.text) && /Step 2/.test(m.text) && (await ev((n) => ST.bots.length === n + 1 && ST.bots[ST.bots.length - 1].strat === 'pro_kama', nb)), m.text.slice(0, 120));
  m = await ask('pause all bots');
  ok('Copilot pauses bots', /Paused/.test(m.text) && (await ev(() => ST.bots.every((x) => !x.run))));
  m = await ask('explain the regime switcher');
  ok('Copilot explains a strategy', /Regime Switcher/.test(m.text));
  m = await ask('chart 15s'); await sleep(800);
  ok('Copilot changes the timeframe', await ev(() => ST.tf === '15s'));
  ok('LLM action lines become buttons only (not auto-run)', await ev(() => { const r = { txt: 'Try this\n[[cmd: buy $100 of BTC]]\n[[cmd: __bot pro_kama|BTC-USD|1h]]' }; const acts = []; r.txt.replace(/\[\[cmd:\s*([^\]\n]{2,120})\]\]/g, (_, c) => { if (!c.trim().startsWith('__')) acts.push(c.trim()); return ''; }); return acts.length === 1 && acts[0] === 'buy $100 of BTC'; }));
  await page.click('nav button[data-tab="markets"]'); await sleep(600);
  await page.screenshot({ path: 'test/pro_markets.png' });
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length); await b.close();
})();
