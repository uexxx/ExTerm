// ExTerm v15 phase 4 browser end-to-end: gap-free 1s / 5s / 15s candles (history + live ticks), dense bubble heat maps
// on crypto / stocks / on-chain with the six buy-pressure windows, the Launch Radar's age brackets, pressure bars and
// "⚡ Send to Grok Tab", the scanner + unified watchlist sidebar with live sparklines, the responsive layouts
// (half-screen, tablet, phone bottom sheet) and strict CSP / no inline handlers / escaping of hostile pool names.
// Third-party APIs are blocked: the app runs on simulated prices through the launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | '), 'ERRS', errs.slice(0, 5).join(' || ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8784, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt15p4-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 920 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
  await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__exterm_p2 === true && typeof P4UI !== 'undefined' && typeof chart !== 'undefined' && chart && chart.data.length > 50 && px(ST.sel) > 0, null, { timeout: 60000 });
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { throw new Error(e.message.split('\n')[0] + ' IN ' + String(f).slice(0, 160)); });
  const waitFor = (f, a, t = 20000) => page.waitForFunction(f, a, { timeout: t }).then(() => true, () => false);

  ok('phase 4 boots: P4 core, P4UI and the sidebar button', await ev(() => typeof P4 === 'object' && typeof P4UI === 'object' && !!$('#btnSide') && !!$('#p4Side')));

  /* ── gap-free sub-minute candles ── */
  await ev(() => { showTab('markets'); selectSym('DOGE-USD'); }); await sleep(400);
  const gaps = () => ev(() => { const d = chart.data.slice(-200); let g = 0; for (let i = 1; i < d.length; i++) if (d[i].o !== d[i - 1].c) g++; return [g, d.length]; });
  for (const tf of ['1s', '5s', '15s']) {
    await page.locator(`#tfBtns button:text-is("${tf}")`).dispatchEvent('click');
    await waitFor((s) => chart.data.length > 30 && chart.data[chart.data.length - 1].t - chart.data[chart.data.length - 2].t === s, { '1s': 1, '5s': 5, '15s': 15 }[tf], 15000);
    const [g, n] = await gaps();
    ok(`DOGE ${tf}: every bar opens at the prior close`, n > 30 && g === 0, `${g} gaps in ${n} bars`);
  }
  await page.locator('#tfBtns button:text-is("1s")').dispatchEvent('click'); await sleep(3500);
  const [g2, n2] = await gaps();
  ok('1s: still gap-free after live ticks open new bars', n2 > 30 && g2 === 0, `${g2} gaps in ${n2}`);
  ok('flat ticks render as ≥2 px bodies (bodyRect contract)', await ev(() => { const r = NT.bodyRect(200, 200, 33.3, 6); return r.h >= 2 && Number.isInteger(r.y); }));
  await ev(() => { setMode('stocks'); }); await sleep(500);
  await page.locator('#tfBtns button:text-is("5s")').dispatchEvent('click');
  ok('NVDA/SPY stocks: 5s bars are gap-free too', await waitFor(() => chart.data.length >= 2 && chart.data.slice(-50).every((k, i, a) => !i || k.o === a[i - 1].c), null, 15000));
  await ev(() => { setMode('crypto'); ST.tf = '15m'; selectSym('BTC-USD'); chartRefresh(true); }); await sleep(500);

  /* ── crypto bubble heat map ── */
  await page.click('nav button[data-tab="heat"]');
  ok('heat map shows the buy-pressure window bar with 1m…24h', await waitFor(() => $$('#p4Win button').map((x) => x.textContent).join(',') === '1m,5m,15m,1h,4h,24h', null, 15000));
  await page.click('#p4View button[data-v="bubbles"]');
  ok('crypto bubbles render on canvas and hide the tiles', await waitFor(() => !!$('#p4Bub canvas') && $('#heatHost').hidden && P4UI.heatBub() && P4UI.heatBub().nodes.length > 10, null, 20000), await ev(() => [heat.items.length, !!$('#p4Bub canvas')]));
  const n1 = await ev(() => P4UI.heatBub().nodes.length);
  await page.click('#p4Den button[data-v="3"]'); await sleep(600);
  ok('density 3× packs more (smaller) bubbles', await ev((k) => { const n = P4UI.heatBub().nodes; return n.length >= k && Math.max(...n.map((x) => x.r)) < 60; }, n1));
  await page.click('#p4Win button[data-v="5m"]'); await sleep(400);
  ok('window switch persists and keeps the map', await ev(() => ST.p4.win === '5m' && $('#p4Win button.on').dataset.v === '5m' && !!$('#p4Bub canvas')));
  await sleep(1300);
  const fps = await ev(() => P4UI.fps);
  ok('animation loop runs on every display frame (uncapped rAF)', fps >= 30, fps + ' fps');
  ok('fps readout is shown', await ev(() => /fps/.test($('#p4Fps').textContent)));
  const pt = await ev(() => { const n = P4UI.heatBub().nodes.slice().sort((a, b) => b.r - a.r)[0], r = $('#p4Bub canvas').getBoundingClientRect(); return { x: r.left + (n.fx || n.x), y: r.top + (n.fy || n.y), id: n.id }; });
  await page.mouse.move(pt.x, pt.y); await sleep(150);
  ok('hover tooltip shows pressure for the bubble', await ev(() => !$('#p4Bub .p4-tip').hidden && /buy pressure \(5m/.test($('#p4Bub .p4-tip').textContent)));
  await page.mouse.click(pt.x, pt.y);
  ok('clicking a bubble opens its chart', await waitFor((id) => curTab === 'markets' && ST.sel === id, pt.id, 8000), pt.id);

  /* ── stock bubbles ── */
  await ev(() => { setMode('stocks'); showTab('heat'); }); await sleep(800);
  ok('stock heat map has bubbles + pressure windows too', await waitFor(() => !!$('#p4Bub canvas') && P4UI.heatBub().asset === 'stocks' && P4UI.heatBub().nodes.some((n) => n.id === 'NVDA') && $$('#p4Win button').length === 6, null, 20000));

  /* ── on-chain: Launch Radar brackets, pressure bars, Send to Grok, hostile names ── */
  await ev(() => { setMode('onchain'); showTab('heat'); }); await sleep(800);
  await ev(() => {
    const now = Date.now(), mk = (i, ageMin, name) => { const s = OC.make('solana', 'P4pool' + i + 'xxxxxxxxxxxxxxxxxxxxxxxxxx'); OC.register(s, { s: name, n: name + ' token', q: 'SOL', dex: 'raydium' }, { price: 0.001 * (i + 1), liq: 50000, mcap: 200000, vol1h: 10000 * (i + 1), ch1h: i * 3 - 6, buys5m: 10 + i, sells5m: 5, buys15m: 30, sells15m: 10, buys1h: 80, sells1h: 20 + i * 10, buys6h: 300, sells6h: 200, buys24: 900, sells24: 800, created: now - ageMin * 60000, ts: now }); return s; };
    window.__p4rows = [mk(0, 12, 'NEWB'), mk(1, 150, 'RUNR'), mk(2, 600, 'ESTB'), mk(3, 3000, 'OLDT'), mk(4, 30, 'EVIL')];
    // bypass the registry's own sanitiser so the radar's escaping is what is under test
    Object.assign(OC.meta[window.__p4rows[4]], { s: '<img src=x onerror="window.__x=1">', n: '"><svg onload="window.__x=2">' });
    Radar.rows = window.__p4rows.slice(); Radar.ts = Date.now(); Radar.err = ''; Radar.busy = false; Radar.refresh = async () => {};
    ST.radar = Object.assign(ST.radar || {}, { view: 'list', minLiq: 0, socials: false, sort: 'new' }); Radar.key = ''; renderHeat(true);
  });
  ok('radar list is grouped into the four live age brackets', await waitFor(() => $$('#rdBody .p4-brk').map((x) => x.querySelector('b').textContent).join('|') === 'New Launches <1h|1h–6h Runners|6h–24h Established|24h+ Trending', null, 10000), await ev(() => ($('#rdBody') || {}).textContent && $('#rdBody').textContent.slice(0, 200)));
  ok('tokens land in the right bracket', await ev(() => { const g = {}; let cur = ''; for (const el of $('#rdBody .radar-list').children) { if (el.classList.contains('p4-brk')) cur = el.dataset.b; else if (el.dataset.oc) (g[cur] = g[cur] || []).push(OC.meta[el.dataset.oc].s); } return (g.new || []).length === 2 && g.run[0] === 'RUNR' && g.est[0] === 'ESTB' && g.trend[0] === 'OLDT'; }));
  ok('live buy/sell pressure bars follow the selected window (1h)', await ev(() => { $('#p4Win button[data-v="1h"]').click(); return true; }) && await waitFor(() => { const r = $$('#rdBody .rd-row').find((x) => OC.meta[x.dataset.oc].s === 'NEWB'); return r && /80% buys · 1h/.test(r.textContent) && r.querySelector('.rd-bs .tc-bar i').style.width === '80%'; }, null, 8000));
  await page.click('#p4Win button[data-v="4h"]'); await sleep(300);
  ok('4h reads the 6h counts and says it is the nearest window', await ev(() => $$('#rdBody .rd-row').some((x) => /60% buys · 6h≈/.test(x.textContent))));
  ok('hostile pool names render as text', await ev(() => !$('#rdBody img[src="x"]') && window.__x === undefined && /<img src=x/.test($('#rdBody').textContent)));
  const inbox0 = await ev(() => (ST.grok.inbox || []).length);
  await page.click('#rdBody .rd-row:has-text("RUNR") [data-p4grok]');
  ok('⚡ Grok sends the setup to the Grok tab without opening the chart', await waitFor((n) => (ST.grok.inbox || []).length === n + 1 && OC.meta[ST.grok.inbox[0].sym].s === 'RUNR' && curTab === 'heat', inbox0, 8000));
  ok('…with pressure, window and bracket in the note', await ev(() => /% buys \(6h≈\)/.test(ST.grok.inbox[0].note) && /1h–6h Runners/.test(ST.grok.inbox[0].note) && ST.grok.inbox[0].entry > 0));
  await page.click('#rdBody .rd-row:has-text("ESTB") .rd-name');
  ok('clicking the row still opens the chart', await waitFor(() => curTab === 'markets' && OC.meta[ST.sel] && OC.meta[ST.sel].s === 'ESTB', null, 8000));
  await ev(() => { showTab('heat'); ST.radar.view = 'bubbles'; Radar.key = ''; renderHeat(true); }); await sleep(800);
  ok('radar bubbles use the dense engine with DEX pressure', await waitFor(() => !!$('#rdBody .p4-bub canvas') && P4UI.rdBub() && P4UI.rdBub().nodes.length === 5, null, 10000));
  await ev(() => { ST.radar.view = 'list'; setMode('crypto'); });

  /* ── sidebar: unified watchlist + scanner ── */
  await ev(() => { showTab('markets'); ST.mk.stocks.watch = ['NVDA', 'SPY']; ST.mk.onchain.watch = [window.__p4rows[0]]; });
  await page.click('#btnMore'); await page.click('#btnSide');
  ok('sidebar opens with every watchlist (crypto + stocks + on-chain)', await waitFor(() => !$('#p4Side').hidden && $$('#p4Side .p4-wr').length === P4.unifiedWatch(ST.mk).length && $$('#p4Side .p4-wr').some((r) => r.dataset.sym === 'NVDA') && $$('#p4Side .p4-wr').some((r) => /^oc:/.test(r.dataset.sym)), null, 8000));
  ok('desktop: the sidebar docks beside the page', await ev(() => document.body.classList.contains('lay-full') && getComputedStyle($('main')).paddingRight === '300px'));
  await sleep(1600);
  ok('sub-second sparklines draw (pixels on the BTC canvas)', await ev(() => { const c = $('#p4Side [data-sp="BTC-USD"]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 20; }));
  ok('sampler keeps ≥4 points per second', await ev(() => { const a = P4UI.samples.get('BTC-USD') || []; return a.length >= 5 && a[a.length - 1].t - a[0].t < a.length * 0.35; }));
  await page.click('#p4Tabs button[data-v="scan"]');
  ok('scanner lists gainers, RVOL > 3× spikes and strategy signal matches', await waitFor(() => $$('#p4Side .p4-st').map((x) => x.textContent).join('|') === '🚀 Top gainers (24h)|🔊 Volume spikes · RVOL > 3×|🎯 Strategy signal matches' && $$('#p4Side .p4-sr').length > 0, null, 15000));
  await page.click('#p4Tabs button[data-v="watch"]');
  await page.click('#p4Side .p4-wr[data-sym="SPY"]');
  ok('clicking a watchlist row opens that market (switching mode)', await waitFor(() => ST.mode === 'stocks' && ST.sel === 'SPY', null, 8000));

  /* ── responsive layouts ── */
  await page.setViewportSize({ width: 1100, height: 800 }); await sleep(400);
  ok('half-screen width: lay-half, sidebar overlays instead of squeezing the page', await ev(() => document.body.classList.contains('lay-half') && getComputedStyle($('main')).paddingRight !== '300px'));
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  ok('phone: lay-phone and the sidebar becomes a bottom-sheet drawer', await ev(() => document.body.classList.contains('lay-phone') && (() => { const r = $('#p4Side').getBoundingClientRect(); return r.left === 0 && r.width >= 380 && r.top > 150; })() && getComputedStyle($('#p4Side .p4-grip')).display === 'flex'));
  ok('phone: no horizontal page scroll with the drawer open', await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await ev(() => document.documentElement.scrollWidth));
  await page.click('#p4SideX');
  ok('drawer closes and the choice is saved', await ev(() => $('#p4Side').hidden && ST.p4.side === false));
  await ev(() => { setMode('onchain'); showTab('heat'); ST.radar.view = 'list'; Radar.key = ''; renderHeat(true); }); await sleep(500);
  ok('phone: Launch Radar rows fit the screen', await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({ width: 1500, height: 920 });

  /* ── strict CSP hygiene ── */
  const r = await ev(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).map((e) => e.tagName + '.' + e.className).slice(0, 5));
  ok('no inline on* event handlers anywhere in the DOM', r.length === 0, JSON.stringify(r));
  ok('no CSP violations, page errors or dialogs', errs.length === 0, errs.slice(0, 4).join(' || '));

  await b.close();
  console.log(res.join('\n'));
  const fails = res.filter((x) => x.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
