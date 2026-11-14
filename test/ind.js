const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await b.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [], res = [];
  page.on('pageerror', (e) => errs.push(e.message)); const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  const ev = (f) => page.evaluate(f), sleep = (ms) => page.waitForTimeout(ms);
  ok('picker button shows 137 available', /137/.test(await page.textContent('[data-ipopen]')));
  await page.click('[data-ipopen]'); await page.waitForSelector('#indPop.on'); ok('picker lists all indicators', await ev(() => document.querySelectorAll('#ipList .ip-row').length) >= 130, await ev(() => document.querySelectorAll('#ipList .ip-row').length) + ' rows');
  for (const q of ['hull', 'ichimoku', 'aroon oscillator', 'money flow', 'connors', 'macd', 'zigzag']) { await page.fill('#ipQ', q); await sleep(120); await page.click('#ipList .ip-row'); await sleep(150); }
  ok('add 7 indicators (overlays + panes + built-ins)', await ev(() => ST.ind.extra.length === 5 && ST.ind.ichi && ST.ind.macd), await ev(() => ST.ind.extra.map((e) => e.id).join(',')));
  await page.fill('#ipQ', 'hull'); await sleep(120); await page.click('#ipList [data-ipgear="hma"]'); await sleep(150); await page.fill('#ipList [data-ipp="hma|len"]', '55'); await sleep(600);
  ok('edit indicator setting (HMA 55)', await ev(() => ST.ind.extra.find((e) => e.id === 'hma').p.len === 55));
  await page.keyboard.press('Escape'); await sleep(300); await page.screenshot({ path: 'test/ind_chart.png' });
  ok('chips show active indicators', await ev(() => document.querySelectorAll('#indBtns .ichip[data-ikey]').length) >= 8);
  await page.click('#indBtns [data-iprm="x:zigzag"]'); await sleep(200); ok('remove one via chip ✕', await ev(() => !ST.ind.extra.some((e) => e.id === 'zigzag')));
  ok('chart computed every active library indicator', await ev(() => chart.indicators().extra.length === ST.ind.extra.length));
  // stress: turn on 25 random library indicators at once
  await ev(() => { ST.ind.extra = IND.list.slice(0, 25).map((d) => ({ id: d.id, p: {} })); chart.o.extra = ST.ind.extra; chartRefresh(true); }); await sleep(800);
  ok('25 indicators at once render without errors', errs.length === 0 && await ev(() => chart.indicators().extra.length === 25));
  await ev(() => location.reload()); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); ok('active indicators persist after reload', await ev(() => ST.ind.extra.length === 25));
  await page.click('[data-ipclear]'); await sleep(300); ok('clear all', await ev(() => ST.ind.extra.length === 0 && !ST.ind.macd));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length); await b.close();
})();
