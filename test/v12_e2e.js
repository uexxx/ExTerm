// v12 end-to-end: every new feature, driven through the real UI with mocked third-party APIs (no external network).
// Token safety · strategy builder + community library · workspaces · order flow · trade journal · replay challenges ·
// local AI via the launcher (fake Ollama on 127.0.0.1:11434) · background alerts settings · themes + 3D tilt.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http');
const res = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + i));
const SAFE = 'SafeMint1111111111111111111111111111111pump', RUG = 'RugMint11111111111111111111111111111111pump', EVIL = 'EvilMint1111111111111111111111111111111pump';
const now = Date.now();
const MINTS = {
  [SAFE]: { mintAuthority: null, freezeAuthority: null, supply: '1000000000000', decimals: 6, holders: [300000, ...Array(12).fill(5000)], liq: 450000, age: 40, buys: 900, sells: 800, risks: [] },
  [RUG]: { mintAuthority: 'Creat0r111111111111111111111111111111111', freezeAuthority: 'Creat0r111111111111111111111111111111111', supply: '1000000000000', decimals: 6, holders: [200000, ...Array(10).fill(70000)], liq: 4000, age: 0.1, buys: 300, sells: 0, risks: [{ name: 'LP Unlocked', level: 'danger', description: 'Liquidity can be pulled' }] },
  [EVIL]: { mintAuthority: null, freezeAuthority: null, supply: '1000000000000', decimals: 6, holders: [300000, ...Array(12).fill(5000)], liq: 90000, age: 10, buys: 100, sells: 90, risks: [{ name: '<img src=x onerror="window.__pwn=1">', level: 'danger', description: '<script>window.__pwn=2</script>' }], sym: '<img src=x onerror=window.__pwn=3>', name: '"><script>window.__pwn=4</script>' },
};
function rpc(body) {
  const one = (r) => {
    const m = MINTS[r.params && r.params[0]];
    if (r.method === 'getAccountInfo') return m ? { value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', data: { parsed: { type: 'mint', info: { mintAuthority: m.mintAuthority, freezeAuthority: m.freezeAuthority, supply: m.supply, decimals: m.decimals } } } } } : { value: null };
    if (r.method === 'getTokenLargestAccounts') return { value: m ? m.holders.map((h, i) => ({ address: 'Acc' + i, uiAmount: h })) : [] };
    if (r.method === 'getSlot') return 300000000;
    return null;
  };
  return Array.isArray(body) ? body.map((r) => ({ jsonrpc: '2.0', id: r.id, result: one(r) })) : { jsonrpc: '2.0', id: body.id, result: one(body) };
}
function mock(target, post) {
  let u; try { u = new URL(target); } catch (e) { return null; }
  if (/solana|helius|publicnode|drpc|onfinality/.test(u.hostname) && post) { try { return rpc(JSON.parse(post)); } catch (e) { return { error: 'bad' }; } }
  if (u.hostname === 'api.dexscreener.com' && u.pathname.startsWith('/tokens/v1/')) {
    const mint = u.pathname.split('/').pop(), m = MINTS[mint]; if (!m) return [];
    return [{ chainId: 'solana', url: 'https://dexscreener.com/solana/pool' + mint.slice(0, 6), baseToken: { address: mint, symbol: m.sym || mint.slice(0, 4), name: m.name || 'Mock ' + mint.slice(0, 4) }, liquidity: { usd: m.liq }, pairCreatedAt: now - m.age * 864e5, txns: { h24: { buys: m.buys, sells: m.sells } }, volume: { h24: m.liq * 2 } }];
  }
  if (u.hostname === 'api.rugcheck.xyz') { const mint = u.pathname.split('/')[3], m = MINTS[mint]; return m ? { score: 1, risks: m.risks } : { risks: [] }; }
  return null;
}
// fake local Ollama for the bridge test
const llmSeen = [];
const ollama = http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/api/tags') return r.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }] }));
    if (q.url === '/v1/chat/completions') { const j = JSON.parse(b || '{}'); llmSeen.push(j); return r.end(JSON.stringify({ choices: [{ message: { content: 'Local model says hi <img src=x onerror="window.__pwn=9"> **bold**\n[[cmd: buy $100 of BTC]]' } }] })); }
    r.statusCode = 404; r.end('{}');
  });
});
(async () => {
  const ollamaUp = await new Promise((resolve) => { ollama.once('error', () => resolve(false)); ollama.listen(11434, '127.0.0.1', () => resolve(true)); });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  await page.route('**/*', async (r) => {
    const url = r.request().url(); let target = url;
    if (url.startsWith('http://localhost:8765/proxy?')) target = new URL(url).searchParams.get('u') || '';
    else if (url.startsWith('http://localhost:8765')) return r.continue();
    const m = mock(target, r.request().postData());
    if (m) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(m) });
    return r.abort();
  });
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  await page.goto('http://localhost:8765/'); await ev(() => { localStorage.clear(); indexedDB.deleteDatabase('novaterm'); }); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true && chart && chart.data.length > 50, null, { timeout: 60000 });
  await ev(() => Space3D.set('full'));
  await page.waitForFunction(() => Launcher.caps, null, { timeout: 8000 }).catch(() => {});

  /* ───────── 1. navigation + new tabs ───────── */
  ok('3 new tabs in the nav', await ev(() => ['workspace', 'journal', 'challenge'].every((t) => document.querySelector(`#nav button[data-tab="${t}"]`))));
  ok('default theme is Nova', await ev(() => document.body.dataset.theme === 'nova'));

  /* ───────── 2. token safety scanner ───────── */
  await page.click('#nav button[data-tab="lab"]'); await page.click('#labNav button[data-v="safety"]'); await sleep(300);
  ok('Lab has a Token safety tool', await ev(() => !!document.querySelector('#safeForm')));
  await page.fill('#safeAddr', 'not-an-address'); await page.click('#safeGo'); await sleep(400);
  ok('invalid address is refused with a message', await ev(() => /valid Solana token address/.test($('#safeOut').textContent)));
  await page.fill('#safeAddr', SAFE); await page.click('#safeGo'); await page.waitForFunction(() => document.querySelector('.safe-grade'), null, { timeout: 15000 }).catch(() => {});
  ok('clean token grades A', await ev(() => document.querySelector('.safe-grade b').textContent === 'A'), await ev(() => $('#safeOut').textContent.slice(0, 200)));
  ok('mint + freeze renounced shown as passes', await ev(() => document.querySelector('[data-check="mint"]').className === 'safe-pass' && document.querySelector('[data-check="freeze"]').className === 'safe-pass'));
  ok('report links are https + noopener', await ev(() => [...document.querySelectorAll('.safe-card a')].length >= 2 && [...document.querySelectorAll('.safe-card a')].every((a) => a.href.startsWith('https://') && /noopener/.test(a.rel))));
  await page.fill('#safeAddr', RUG); await page.click('#safeGo'); await page.waitForFunction(() => /Critical/.test($('#safeOut').textContent), null, { timeout: 15000 }).catch(() => {});
  ok('rug token grades F with critical flags', await ev(() => document.querySelector('.safe-grade b').textContent === 'F' && /Critical risk/.test($('#safeOut').textContent)));
  ok('rug checks: mint, freeze, honeypot, LP all fail', await ev(() => ['mint', 'freeze', 'sells', 'lp', 'liq'].every((k) => document.querySelector(`[data-check="${k}"]`).className === 'safe-fail')));
  await page.fill('#safeAddr', EVIL); await page.click('#safeGo'); await sleep(2500);
  ok('malicious token metadata never executes or injects markup', await ev(() => !window.__pwn && !document.querySelector('.safe-card img, .safe-card script')));
  const cp = await ev(async () => (await aiHandle('is ' + 'RugMint11111111111111111111111111111111pump' + ' safe?')).txt);
  ok('Copilot answers "is <token> safe?"', /grade F/.test(cp) && /Mint authority/.test(cp), cp.slice(0, 120));

  /* ───────── 3. strategy builder + community library ───────── */
  await page.click('#nav button[data-tab="bots"]'); await sleep(600);
  ok('builder renders with a valid starter template', await ev(() => !!document.querySelector('#bdForm') && !$('#bdPrev').classList.contains('bad')));
  await page.selectOption('#bdTpl', '1'); await sleep(200);
  ok('template switch loads EMA cross rules', await ev(() => $('#bdName').value === 'EMA cross with volume' && document.querySelectorAll('.bd-cond').length === 3));
  await page.fill('#bdName', 'E2E strategy <b>x</b>');
  await page.click('.bd-group[data-g="entry"] .bd-add'); await sleep(150);
  ok('add condition', await ev(() => document.querySelectorAll('.bd-group[data-g="entry"] .bd-cond').length === 3));
  await page.selectOption('.bd-group[data-g="entry"] .bd-cond[data-c="2"] select[data-f="b.k"]', 'const'); await sleep(150);
  await page.fill('.bd-group[data-g="entry"] .bd-cond[data-c="2"] input[data-f="b.v"]', '0'); await sleep(150);
  await page.click('.bd-group[data-g="entry"] .bd-cond[data-c="2"] .bd-del'); await sleep(150);
  ok('remove condition', await ev(() => document.querySelectorAll('.bd-group[data-g="entry"] .bd-cond').length === 2));
  await page.fill('.bd-group[data-g="entry"] .bd-cond[data-c="0"] input[data-f="a.n"]', '999'); await sleep(150);
  ok('out-of-range period blocks saving with a clear message', await ev(() => $('#bdPrev').classList.contains('bad') && /period/.test($('#bdPrev').textContent) && $('#bdForm button[type="submit"]').disabled));
  await page.fill('.bd-group[data-g="entry"] .bd-cond[data-c="0"] input[data-f="a.n"]', '9'); await sleep(150);
  await page.click('.bd-group[data-g="entry"] .bd-mode button[data-mode="any"]'); await sleep(150);
  ok('ALL/ANY toggle', await ev(() => !!Builder.draft.entry.any && /OR/.test($('#bdPrev').textContent)));
  await page.fill('#bdSl', '4'); await page.dispatchEvent('#bdSl', 'input');
  await page.click('#bdForm button[type="submit"]'); await sleep(400);
  const sid = await ev(() => Object.keys(NT.strategies).find((k) => /^cs_e2e_strategy/.test(k)));
  ok('save registers the strategy everywhere', !!sid && await ev((id) => !!NT.strategies[id] && [...document.querySelectorAll('select option')].some((o) => o.value === id), sid), sid);
  ok('saved name is cleaned of markup', await ev((id) => !/[<>]/.test(NT.strategies[id].name), sid));
  await page.click('#bdTest'); await page.waitForFunction(() => /Return/.test($('#bdOut').textContent) || /dn/.test($('#bdOut').innerHTML), null, { timeout: 30000 }).catch(() => {});
  ok('backtest runs in the worker and shows stats', await ev(() => /Return/.test($('#bdOut').textContent) && /Trades/.test($('#bdOut').textContent)), await ev(() => $('#bdOut').textContent.slice(0, 120)));
  await page.click('#bdVal'); await page.waitForFunction(() => document.querySelector('#bdOut .grade.big') || /dn/.test($('#bdOut').innerHTML), null, { timeout: 60000 }).catch(() => {});
  ok('validation lab grades the custom strategy', await ev(() => /^[A-F]$/.test((document.querySelector('#bdOut .grade.big') || {}).textContent || '')), await ev(() => $('#bdOut').textContent.slice(0, 120)));
  await page.click('#bdPine'); await sleep(200);
  ok('Pine Script export', await ev(() => /\/\/@version=5/.test($('#bdOut pre').textContent) && /strategy\.entry/.test($('#bdOut pre').textContent)));
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#bdJson'); const d = await dl;
  ok('share JSON downloads a file', !!d && /\.json$/.test(d.suggestedFilename()));
  await page.setInputFiles('#bdFile', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ v: 1, name: 'Evil', entry: { all: [{ a: { k: 'constructor' }, op: '>', b: { k: 'const', v: 1 } }] }, exit: { any: [] }, onBar: 'alert(1)' })) }); await sleep(400);
  ok('malicious strategy file rejected', await ev(() => Builder.draft.name !== 'Evil' && [...document.querySelectorAll('.toast')].some((t) => /Not a valid ExTerm strategy/.test(t.textContent))));
  await page.setInputFiles('#bdFile', { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ v: 1, name: 'Imported breakout', entry: { all: [{ a: { k: 'price' }, op: '>', b: { k: 'highest', n: 30 } }] }, exit: { any: [{ a: { k: 'price' }, op: '<', b: { k: 'lowest', n: 15 } }] }, risk: { sl: 6 } })) }); await sleep(400);
  ok('valid strategy file imports into the editor', await ev(() => $('#bdName').value === 'Imported breakout'));
  ok('community library bundled (6)', await ev(() => document.querySelectorAll('.bd-lib .bd-item').length >= 7 && Object.keys(NT.strategies).filter((k) => NT.strategies[k].cat === 'Community').length === 6));
  await page.click('#bdRank'); await page.waitForFunction(() => !Builder.busy, null, { timeout: 120000 }).catch(() => {});
  ok('community leaderboard grades every strategy', await ev(() => Object.keys(Builder.lb).length === 6 && Object.values(Builder.lb).every((x) => x.grade || x.err)), await ev(() => JSON.stringify(Builder.lb).slice(0, 160)));
  await page.click(`.bd-item[data-id="${sid}"] [data-act="use"]`); await sleep(300);
  ok('"Use" loads it into the backtester', await ev((id) => ST.setup.strat === id, sid));
  await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  ok('saved strategies survive a reload', await ev((id) => !!NT.strategies[id] && Builder.saved().length === 1, sid));
  await ev(() => showTab('bots')); await sleep(500); await page.click(`.bd-item[data-id="${sid}"] [data-act="del"]`); await sleep(300);
  ok('delete removes it', await ev((id) => !NT.strategies[id] && Builder.saved().length === 0, sid));

  /* ───────── 4. order flow ───────── */
  await ev(() => showTab('markets')); await sleep(400);
  const ofErr = await ev(() => { const before = []; const ow = console.warn; console.warn = (...a) => before.push(a.join(' ')); ['vp', 'delta', 'liq'].forEach((k) => { ST.ind[k] = true; }); Object.assign(chart.o, ST.ind); chartRefresh(true); chart.draw(); console.warn = ow; return before.filter((x) => /overlay/.test(x)); });
  ok('order-flow overlays draw without errors', ofErr.length === 0, ofErr.join(';'));
  ok('order-flow toggles listed in the indicator picker', await ev(() => ['vp', 'delta', 'liq'].every((k) => IND.BUILTIN.some((b) => b[0] === k))));
  const of2 = await ev(async () => (await aiHandle('show volume profile')).txt); ok('Copilot turns on order-flow layers', /Volume profile/.test(of2));

  /* ───────── 5. workspaces ───────── */
  await page.click('#nav button[data-tab="workspace"]'); await sleep(2500);
  ok('4 synced charts load', await ev(() => document.querySelectorAll('.ws-chart canvas').length === 4 && WS.charts.every((c) => c.data.length > 50)));
  await ev(() => { const c = WS.charts[0], r = c.cv.getBoundingClientRect(); c.cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true })); });
  ok('crosshair syncs across charts', await ev(() => WS.charts.slice(1).every((c) => c.ext && c.ext.t)));
  await page.click('#wsGrid button[data-v="3"]'); await sleep(800);
  ok('layout 1 + 2', await ev(() => document.querySelectorAll('.ws-cell').length === 3 && $('#wsHost').classList.contains('g3')));
  await page.selectOption('.ws-tf[data-i="1"]', '4h'); await sleep(1500);
  ok('per-chart timeframe', await ev(() => WS.charts[1].tfSec === 14400));
  await page.click('#wsSaveAs'); await page.fill('#wkName', 'My <desk>'); await page.click('#wkNameForm button'); await sleep(300);
  ok('save named layout (name cleaned)', await ev(() => Object.keys(WS.state().layouts).includes('My desk')));
  await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); await ev(() => showTab('workspace')); await sleep(1500);
  ok('layout restored after reload', await ev(() => $('#wsLayout').value === 'My desk' && document.querySelectorAll('.ws-cell').length === 3));
  await ev(() => { localStorage.setItem('nt.ws', JSON.stringify({ cur: '<img src=x onerror=window.__pwn=5>', layouts: { '<img src=x onerror=window.__pwn=6>': { grid: 99, cells: [{ sym: 'javascript:alert(1)', tf: '1y' }] } } })); showTab('markets'); });
  await ev(() => { WS.render.call && (window.__wsS = null); }); await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); await ev(() => showTab('workspace')); await sleep(1500);
  ok('tampered workspace storage is sanitised', await ev(() => !window.__pwn && !document.querySelector('#wsBar img') && document.querySelectorAll('.ws-cell').length === 4));

  /* ───────── 6. trade journal ───────── */
  await ev(() => showTab('markets')); await sleep(800);
  await page.fill('#tkUsd', '750').catch(() => {}); await page.click('#tkGo'); await sleep(800);
  await ev(() => { const s = ST.sel; ACC.sell(s, px(s) * 0.97, null, Date.now(), { reason: 'manual close', src: 'manual' }); });
  await sleep(500); await page.click('#nav button[data-tab="journal"]'); await sleep(1200);
  ok('manual trades are journaled automatically', await ev(() => Journal.entries.length >= 2 && document.querySelectorAll('.jn-card').length >= 2));
  ok('entry has a chart snapshot', await ev(() => !!document.querySelector('.jn-card img.jn-snap') && /^data:image\/jpeg;base64,/.test(document.querySelector('.jn-card img.jn-snap').src)));
  await page.fill('.jn-card .jn-notes', 'Chased the breakout <script>window.__pwn=7</script>'); await page.dispatchEvent('.jn-card .jn-notes', 'change');
  await page.click('.jn-card .jn-tag[data-tag="FOMO"]'); await page.selectOption('.jn-card .jn-mood', 'fomo'); await sleep(400);
  await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); await ev(() => showTab('journal')); await sleep(1500);
  ok('notes, tags and mood persist (IndexedDB)', await ev(() => { const e = Journal.entries[0]; return /Chased the breakout/.test(e.notes) && e.tags.includes('FOMO') && e.mood === 'fomo'; }));
  ok('note text is never executed', await ev(() => !window.__pwn && !document.querySelector('.jn-list script')));
  await ev(() => { for (let i = 0; i < 8; i++) { const s = ST.sel, p = px(s); ACC.buy(s, p, 300, Date.now() - (20 - i) * 36e5, { reason: 'test', src: 'manual' }); ACC.sell(s, p * 0.98, null, Date.now() - (19.5 - i) * 36e5, { reason: 'test', src: 'manual' }); } Journal.render(); }); await sleep(800);
  ok('review finds patterns (losing streak)', await ev(() => [...document.querySelectorAll('.jn-ins li')].some((li) => li.dataset.ins === 'streak')));
  const csv = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#jnCsv'); const cf = await csv;
  ok('CSV export', !!cf && /\.csv$/.test(cf.suggestedFilename()));
  await page.fill('#jnQ', 'Chased'); await sleep(700);
  ok('search filters entries', await ev(() => document.querySelectorAll('.jn-card').length === 1));
  await page.click('#jnWipe'); await sleep(200);
  ok('delete-all needs a second click', await ev(() => Journal.entries.length > 0 && /Click again/.test($('#jnWipe').textContent)));
  const jr = await ev(async () => (await aiHandle('review my trades')).txt); ok('Copilot reviews your trades', /last 30 days/.test(jr) && /losses in a row/.test(jr), jr.slice(0, 120));

  await sleep(3800); await page.click('#jnWipe'); await page.click('#jnWipe'); await sleep(600);
  ok('delete-all wipes the journal (IndexedDB too)', await ev(async () => { await Journal.init(); return Journal.entries.length === 0; }));

  /* ───────── 7. replay challenges ───────── */
  await page.click('#nav button[data-tab="challenge"]'); await sleep(300);
  await page.click('#chNew'); await page.waitForFunction(() => Challenge.g && document.querySelector('#chChart canvas'), null, { timeout: 20000 }).catch(() => {});
  const w1 = await ev(() => Challenge.g.c.map((k) => k.c.toFixed(4)).join(','));
  ok('daily challenge starts in blind mode', await ev(() => Challenge.g.meta.daily && Challenge.g.meta.blind && Math.abs(Challenge.g.c[0].c - 100) < 1e-6));
  await page.click('#chNew'); await page.waitForFunction(() => Challenge.g && !Challenge.busy, null, { timeout: 20000 }).catch(() => {}); await sleep(300);
  ok('daily challenge is the same slice every time today', w1 === (await ev(() => Challenge.g.c.map((k) => k.c.toFixed(4)).join(','))));
  await page.keyboard.press('b'); await sleep(100);
  ok('B key buys', await ev(() => Challenge.g.qty > 0 && $('#chBuy').disabled));
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  ok('→ advances one candle', await ev(() => Challenge.g.i === Challenge.SHOW - 1 + 5));
  await page.keyboard.press('s'); await sleep(100);
  ok('S key sells', await ev(() => Challenge.g.qty === 0 && Challenge.g.trades.length === 2));
  await ev(() => { Challenge.g.step(1e6); Challenge.draw(); }); await sleep(800);
  ok('finishing shows the result card', await ev(() => !$('#chEnd').hidden && /You|Buy &/.test($('#chEnd').textContent) && /It was/.test($('#chEnd').textContent)));
  ok('stats recorded (played + daily score)', await ev(() => Challenge.stats().played === 1 && Object.keys(Challenge.stats().daily).length === 1));
  const png = await ev(() => { const r = Challenge.g.result(); return Challenge.card(r, Challenge.stats(), Challenge.g.meta) || ''; });
  ok('share image renders (PNG)', png.startsWith('data:image/png;base64,') && png.length > 20000);
  await page.click('#chMode button[data-v="random"]'); await page.selectOption('#chSym', 'ETH-USD'); await page.selectOption('#chTf', '4h'); await page.click('#chNew'); await page.waitForFunction(() => Challenge.g && !Challenge.busy && Challenge.g.meta.sym === 'ETH-USD', null, { timeout: 20000 }).catch(() => {});
  ok('pick-a-market mode uses real prices and the chosen market', await ev(() => Challenge.g.meta.sym === 'ETH-USD' && !Challenge.g.meta.blind && Challenge.g.meta.tf === '4h'));

  /* ───────── 8. local AI through the launcher ───────── */
  if (ollamaUp) {
    await ev(() => Launcher.detect()); await ev(() => showTab('ai')); await sleep(400);
    ok('local AI banner appears when Ollama runs', await ev(() => /Local AI found/.test($('#laBanner').textContent) && document.querySelectorAll('#laModel option').length === 2));
    await page.selectOption('#laModel', 'mistral:7b'); await page.click('#laUse'); await sleep(300);
    ok('one click switches Copilot to the local model', await ev(() => ST.ai.preset === 'ollamab' && ST.ai.base === '/ollama/v1' && ST.ai.model === 'mistral:7b' && !ST.ai.key));
    await page.fill('#chatIn', 'what do you think of BTC here?'); await page.keyboard.press('Enter'); await page.waitForFunction(() => /Local model says hi/.test($('#chatLog').textContent), null, { timeout: 20000 }).catch(() => {});
    ok('Copilot answers through the bridge', await ev(() => /Local model says hi/.test($('#chatLog').textContent)) && llmSeen.some((j) => j.model === 'mistral:7b'));
    ok('model output is escaped (no injected markup)', await ev(() => !window.__pwn && !document.querySelector('#chatLog img[src="x"]')));
    ok('model-suggested trade is a button, never auto-run', await ev(() => [...document.querySelectorAll('#chatLog button')].some((x) => /buy \$100 of BTC/.test(x.textContent)) && !ACC.trades.some((t) => t.usd > 95 && t.usd < 105 && /BTC/.test(t.sym))));
  } else ok('port 11434 busy: local-AI e2e skipped', true);

  /* ───────── 9. background alerts settings ───────── */
  await page.click('#nav button[data-tab="set"]'); await sleep(600);
  ok('background alerts panel (launcher detected)', await ev(() => !!document.querySelector('#bgPanel')));
  await page.fill('#bgTg', 'not-a-token'); await page.click('#bgForm button[type="submit"]'); await sleep(500);
  ok('bad bot token rejected with a message', await ev(() => /doesn't look right/.test($('#bgMsg').textContent)));
  await page.fill('#bgTg', '123456789:' + 'B'.repeat(35)); await page.fill('#bgChat', '424242'); await page.click('#bgForm button[type="submit"]'); await sleep(900);
  ok('valid details saved and only shown masked', await ev(() => Launcher.bg && Launcher.bg.telegram === true && !/B{20}/.test(document.body.innerHTML)));
  await ev(() => { ST.alerts.push({ id: 'e2eA1', sym: 'BTC-USD', dir: 'above', price: 999999, active: true, created: Date.now() }); saveState(); });
  await page.click('#bgOn'); await sleep(1500);
  const srv = await ev(async () => (await J.get('/api/alerts')).alerts.map((a) => a.id));
  ok('turning it on syncs alerts to the launcher', srv.includes('e2eA1'), srv.join());
  await page.click('#bgClear'); await sleep(800);
  ok('remove saved details clears them', await ev(async () => (await J.get('/api/alerts')).telegram === false));

  /* ───────── 10. themes + 3D ───────── */
  ok('theme picker lists 8 themes incl. Classic and Obsidian & Gold (v15.1)', await ev(() => document.querySelectorAll('#themePanel .th-card').length === 8 && !!document.querySelector('[data-theme-pick="classic"]') && !!document.querySelector('[data-theme-pick="obsidian"]')));
  await page.click('#themePanel [data-theme-pick="synth"]'); await sleep(300);
  ok('picking a theme applies it', await ev(() => document.body.dataset.theme === 'synth' && getComputedStyle(document.body).getPropertyValue('--acc').trim() === '#ff2bd6'));
  await page.click('#thCb'); await sleep(200);
  ok('colour-blind palette toggle', await ev(() => document.body.classList.contains('cb') && getComputedStyle(document.body).getPropertyValue('--up').trim() === '#3b8bff'));
  await page.reload(); await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  ok('theme + colour-blind setting persist', await ev(() => document.body.dataset.theme === 'synth' && document.body.classList.contains('cb')));
  await page.click('#btnMore'); await page.click('#btnTheme'); await page.click('#thPop [data-theme-pick="classic"]'); await sleep(300);
  ok('header popover switches to Classic (old colours, per-market accents)', await ev(() => document.body.dataset.theme === 'classic' && getComputedStyle(document.body).getPropertyValue('--acc').trim() === '#7b61ff'));
  await ev(() => { localStorage.setItem('nt.state', localStorage.getItem('nt.state')); ST.theme = 'evil"><img src=x>'; Themes.apply(ST.theme); });
  ok('unknown theme names fall back safely', await ev(() => document.body.dataset.theme === 'nova'));
  await ev(() => { Space3D.set('full'); showTab('journal'); }); await sleep(900);
  const box = await page.$('.kpi'); const bb = await box.boundingBox(); await page.mouse.move(bb.x + bb.width * 0.85, bb.y + bb.height * 0.2); await sleep(150);
  ok('3D tilt follows the pointer on cards', await ev(() => { const k = document.querySelector('.kpi.tilting'); return !!k && parseFloat(k.style.getPropertyValue('--ry')) > 0; }));
  await ev(() => Space3D.set('off')); await page.mouse.move(bb.x + 5, bb.y + 5); await sleep(150);
  ok('no tilt when 3D effects are off', await ev(() => !document.querySelector('.tilting')));
  await ev(() => Space3D.set('full')); await ev(() => showTab('markets')); await sleep(600);
  const tk = await (await page.$('#ticket')).boundingBox(); await page.mouse.move(tk.x + 30, tk.y + 30); await sleep(150);
  ok('forms never tilt (order ticket stays flat)', await ev(() => !document.querySelector('#ticket.tilting, #ticket .tilting')));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(res.join('\n')); const n = res.filter((r) => r.startsWith('PASS')).length; console.log(`${n}/${res.length}`);
  await b.close(); ollama.close(); process.exit(n === res.length ? 0 : 1);
})();
