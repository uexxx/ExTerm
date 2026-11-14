// v13.1 end-to-end: GeckoTerminal rate limits (429) and saving the terminal to this computer, in a real browser.
// Starts its own launcher (port 8777, temporary data folder, state saving on). Third-party APIs are mocked; GeckoTerminal
// answers 429 whenever the test switches the limit on, exactly as the free tier does.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
const PORT = 8777, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nt131-'));
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const addr = (seed) => { let s = seed * 7919 + 13, o = ''; for (let i = 0; i < 44; i++) { s = (s * 16807) % 2147483647; o += A[s % 58]; } return o; };
const NEW = Array.from({ length: 10 }, (_, i) => ({ pool: addr(100 + i), mint: addr(200 + i), sym: 'TOK' + i, liq: 20000 + i * 5000 }));
const gtPool = (p) => ({ id: 'solana_' + p.pool, type: 'pool', attributes: { address: p.pool, name: p.sym + ' / SOL', base_token_price_usd: '0.001', reserve_in_usd: String(p.liq), market_cap_usd: String(p.liq * 5), volume_usd: { h24: '50000', h1: '4000', m5: '300' }, price_change_percentage: { m5: '1', h1: '3', h6: '5', h24: '9' }, transactions: { m5: { buys: 5, sells: 2 }, h1: { buys: 50, sells: 30 }, h24: { buys: 500, sells: 300 } }, pool_created_at: new Date(Date.now() - 600000).toISOString() }, relationships: { base_token: { data: { id: 'solana_' + p.mint } }, quote_token: { data: { id: 'solana_SOL' } }, dex: { data: { id: 'pumpswap' } } } });
const inc = (L) => L.map((p) => ({ id: 'solana_' + p.mint, type: 'token', attributes: { address: p.mint, symbol: p.sym, name: p.sym + ' coin' } })).concat([{ id: 'solana_SOL', type: 'token', attributes: { symbol: 'SOL' } }]);
const dsPair = (p) => ({ chainId: 'solana', pairAddress: p.pool, dexId: 'pumpswap', priceUsd: '0.001', baseToken: { address: p.mint, symbol: p.sym + 'DS', name: p.sym }, quoteToken: { symbol: 'SOL' }, liquidity: { usd: p.liq }, volume: { h24: 1000 }, priceChange: { h24: 2 }, txns: {}, pairCreatedAt: Date.now() - 300000 });
const RL = { on: false, gt: 0, gt429: 0, ds: true };
const RL_BODY = { status: { error_code: 429, error_message: "You've exceeded the Rate Limit. Please visit https://www.coingecko.com/en/api/pricing to subscribe to our API plans for higher rate limits." } };
function mock(target) {
  let u; try { u = new URL(target); } catch (e) { return null; }
  const P = u.pathname;
  if (u.hostname === 'api.geckoterminal.com') {
    RL.gt++; if (RL.on) { RL.gt429++; return { status: 429, body: RL_BODY }; }
    if (/\/new_pools$/.test(P)) { const pg = +u.searchParams.get('page') || 1, L = pg === 1 ? NEW.slice(0, 6) : NEW.slice(6); return { body: { data: L.map(gtPool), included: inc(L) } }; }
    if (/\/trending_pools$/.test(P)) return { body: { data: NEW.slice(0, 4).map(gtPool), included: inc(NEW.slice(0, 4)) } };
    return { body: { data: [] } };
  }
  if (u.hostname === 'api.dexscreener.com') {
    if (!RL.ds) return { status: 500, body: { error: 'down' } };
    if (P === '/token-profiles/latest/v1') return { body: NEW.slice(0, 3).map((p) => ({ chainId: 'solana', tokenAddress: p.mint })).concat([{ chainId: 'ethereum', tokenAddress: '0x' + 'a'.repeat(40) }]) };
    if (/^\/tokens\/v1\/solana\//.test(P)) { const ids = P.split('/').pop().split(','); return { body: NEW.filter((p) => ids.includes(p.mint)).map(dsPair) }; }
    if (/\/latest\/dex\/pairs\//.test(P)) { const ids = P.split('/').pop().split(','); return { body: { pairs: NEW.filter((p) => ids.includes(p.pool)).map(dsPair) } }; }
    return { body: { pairs: [] } };
  }
  return null;
}
(async () => {
  const srv = spawn(process.platform === 'win32' ? 'python' : 'python3', ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await new Promise((r) => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  const open = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }); // a new context = empty browser storage (like a new port or browser)
    if (seed) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, seed);
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    await page.route('**/*', async (r) => {
      const url = r.request().url(); let target = url;
      if (url.startsWith(BASE + '/proxy?')) target = new URL(url).searchParams.get('u') || '';
      else if (url.startsWith(BASE)) return r.continue();
      const m = mock(target);
      if (m) return r.fulfill({ status: m.status || 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(m.body) });
      return r.abort();
    });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => window.__exterm_v13 === true && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    return { ctx, page, ev: (f, a) => page.evaluate(f, a) };
  };
  const disk = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8')); } catch (e) { return null; } };
  const waitDisk = async (pred, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = disk(); if (d && pred(d)) return d; await new Promise((r) => setTimeout(r, 250)); } return disk(); };

  /* ───────── 1. GeckoTerminal 429 ───────── */
  let { ctx, page, ev } = await open();
  const reset = () => ev(() => { OC._gtCache.clear(); OC._cool = 0; localStorage.removeItem('nt.gtCool'); OC.rpm = OC.rpmMax; OC.lists = {}; });
  await reset();
  RL.on = true; RL.gt429 = 0;
  let r = await ev(async () => { try { const s = await OC.discoverPage('new', 'solana', 1); return { n: s.length, labels: s.map((x) => OC.label(x)) }; } catch (e) { return { err: e.message }; } });
  ok('new pairs fall back to DexScreener when GeckoTerminal says 429', r.n === 3 && r.labels.every((l) => /DS/.test(l)), JSON.stringify(r));
  ok('the 429 started a shared cool-down', await ev(() => OC.gtCoolLeft() > 20000 && +localStorage.getItem('nt.gtCool') > Date.now()));
  ok('the request rate slowed down after the 429', await ev(() => OC.rpm < OC.rpmMax && OC.rateHits >= 1));
  RL.ds = false;
  r = await ev(async () => { try { await OC._gt('/networks/solana/trending_pools?x=1'); return { ok: 1 }; } catch (e) { return { err: e.message, rate: e.rate, retryIn: e.retryIn }; } });
  ok('rate-limit errors are short and readable (no raw API text)', r.rate === true && /free limit/.test(r.err) && !/exceeded the Rate Limit|coingecko\.com/.test(r.err) && r.retryIn > 0, JSON.stringify(r));
  let before = RL.gt;
  await ev(async () => { try { await OC._gt('/networks/solana/new_pools?y=2'); } catch (e) { /* expected */ } });
  ok('during a long cool-down no request is sent at all', RL.gt === before, RL.gt - before);
  // cached data is served during a cool-down
  RL.on = false; RL.ds = true; await reset();
  await ev(() => OC._gt('/networks/solana/trending_pools?include=base_token,quote_token,dex&page=1&duration=24h'));
  RL.on = true;
  r = await ev(async () => { OC._cool = Date.now() + 60000; const c = OC._gtCache.get('/networks/solana/trending_pools?include=base_token,quote_token,dex&page=1&duration=24h'); c.ts = 0; try { const v = await OC._gt('/networks/solana/trending_pools?include=base_token,quote_token,dex&page=1&duration=24h'); return { n: v.data.length }; } catch (e) { return { err: e.message }; } });
  ok('expired cache is still shown while rate-limited', r.n === 4, JSON.stringify(r));
  r = await ev(async () => { OC.lists['trending:solana'] = { syms: ['oc:solana:' + 'X'.repeat(40)], ts: 0 }; OC._gtCache.clear(); try { const s = await OC.discover('trending', 'solana', true); return { n: s.length, sim: OC.sim }; } catch (e) { return { err: e.message }; } });
  ok('discovery keeps the last real list instead of switching to simulated data', r.n === 1 && r.sim === false, JSON.stringify(r));
  // de-duplication + caching
  RL.on = false; await reset(); before = RL.gt;
  r = await ev(async () => { const p = '/networks/solana/new_pools?include=base_token,quote_token,dex&page=1'; const a = await Promise.all([OC._gt(p), OC._gt(p), OC._gt(p)]); await OC._gt(p); return a.every((x) => x && x.data && x.data.length === 6); });
  ok('identical requests share one network call and then the cache', r && RL.gt - before === 1, RL.gt - before);
  // a short cool-down is waited out and retried automatically
  await reset(); before = RL.gt;
  r = await ev(async () => { OC._cool = Date.now() + 1200; const t0 = Date.now(); const v = await OC._gt('/networks/solana/new_pools?z=3'); return { waited: Date.now() - t0, ok: !!v }; });
  ok('short cool-downs are waited out, then the request goes through', r.ok && r.waited >= 1000 && RL.gt - before === 1, JSON.stringify(r));

  // Radar UI keeps its rows and explains the pause
  await reset();
  await ev(() => { showTab('heat'); ST.heat.asset = 'onchain'; ST.heat.ocKind = 'new'; ST.radar = { view: 'list', sort: 'new', minLiq: 0, socials: false }; renderHeat(true); });
  await page.waitForFunction(() => Radar.rows.length >= 6, null, { timeout: 15000 }).catch(() => {});
  const n0 = await ev(() => Radar.rows.length);
  ok('radar loads new pairs', n0 >= 6, n0);
  RL.on = true; RL.ds = false;
  await ev(async () => { OC._gtCache.clear(); await Radar.refresh(true); renderOcHeat(false); Radar.key = ''; Radar.render(); });
  r = await ev(() => ({ n: Radar.rows.length, note: (document.querySelector('#rdNote') || {}).textContent || '', body: document.querySelector('#rdBody').textContent }));
  ok('radar keeps the last list when rate-limited', r.n === n0 && !/unavailable|HTTP 429/.test(r.body), JSON.stringify(r).slice(0, 200));
  ok('radar note says it is paused and when it resumes', /paused by GeckoTerminal's free limit/.test(r.note) && /resumes in \d+s/.test(r.note), r.note);
  ok('radar does not hammer the API while paused', await ev(async () => { const t = Radar.ts; await Radar.refresh(false); return Radar.ts === t && Radar.retryAt > Date.now(); }));
  await ev(async () => { Radar.rows = []; Radar.key = ''; Radar.render(); });
  r = await ev(() => document.querySelector('#rdBody').textContent);
  ok('empty radar shows a friendly rate-limit message', /free limit/.test(r) && /Retrying automatically/.test(r) && !/HTTP 429|exceeded/.test(r), r);
  ok('data status explains the pause', await ev(() => { showTab('set'); renderSettings(); const t = (document.querySelector('#v13Data') || {}).textContent || ''; return /free limit hit/.test(t); }));
  RL.on = false; RL.ds = true; await reset();

  /* ───────── 2. saving to this computer ───────── */
  ok('disk sync is on when opened through the launcher', await ev(() => DiskSync.on && DiskSync.synced));
  await ev(() => {
    ST.settings.tz = 'Asia/Tokyo'; ST.settings.stKey = 'SECRET-ST-123'; ST.ai.key = 'sk-SECRET-AI'; saveState();
    localStorage.setItem('nt.e2eDirect', 'kept');
    Journal.record({ id: 'e2e1', sym: 'BTC-USD', side: 'buy', price: 100, usd: 50, qty: 0.5, ts: Date.now() - 5000, reason: 'test' }, null);
    Journal.record({ id: 'e2e2', sym: 'ETH-USD', side: 'sell', price: 10, usd: 20, qty: 2, pnl: 3, ts: Date.now(), reason: 'test' }, null);
    Journal.update('j_e2e1', { notes: '=HYPERLINK("http://x")', tags: ['plan'], mood: 'calm' });
  });
  await ev(() => DiskSync.push());
  let d = await waitDisk((x) => x.keys && x.keys['nt.e2eDirect'] && (x.journal || []).some((e) => e.id === 'j_e2e1' && e.notes));
  const main = d && d.keys && JSON.parse(d.keys['novaterm.v1'] || '{}');
  ok('settings are saved to this computer', main && main.settings && main.settings.tz === 'Asia/Tokyo', d && Object.keys(d.keys || {}));
  ok('direct storage writes are saved too', d && d.keys['nt.e2eDirect'] === 'kept');
  ok('journal entries and notes are saved', d && d.journal.length >= 2 && d.journal.some((e) => e.id === 'j_e2e1' && e.mood === 'calm'));
  ok('chart snapshots stay in the browser', d && d.journal.every((e) => !('snap' in e)));
  ok('no API key reached the disk', !/SECRET/.test(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8')));
  ok('state file is private (0600)', process.platform === 'win32' || (fs.statSync(path.join(DATA, 'state.json')).mode & 0o777) === 0o600);
  // CSV export of the full log
  await ev(() => { showTab('set'); renderSettings(); });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#v13JnDl').catch(() => null)]);
  const csv = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
  ok('full journal log downloads as CSV', /^ts,sym,side/.test(csv) && csv.split('\n').length >= 3, csv.slice(0, 120));
  ok('CSV cells cannot run spreadsheet formulas', csv.includes(`"'=HYPERLINK`) && !/,"=HYPERLINK/.test(csv));
  // tamper the saved journal with markup: it must render as text after a restore
  await ev(() => fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ExTerm': J.token() }, body: JSON.stringify({ journal: [{ id: 'j_evil', ts: Date.now() - 1000, sym: '<img src=x onerror="window.__pwn=1">', side: 'buy', price: 1, usd: 1, qty: 1, notes: '<script>window.__pwn=2</script><img src=x onerror="window.__pwn=3">', tags: ['plan', '<b>'], mood: '<i>' }] }) }));
  await ctx.close();

  // a brand-new browser profile (empty storage) gets everything back
  ({ ctx, page, ev } = await open());
  await page.waitForFunction(() => DiskSync.synced, null, { timeout: 10000 }).catch(() => {});
  r = await ev(() => ({ restored: DiskSync.restored, tz: ST.settings.tz, st: ST.settings.stKey, direct: localStorage.getItem('nt.e2eDirect') }));
  ok('a new browser restores settings from this computer', r.restored && r.tz === 'Asia/Tokyo' && r.direct === 'kept', JSON.stringify(r));
  ok('API keys are not restored (they were never saved)', !r.st);
  await page.waitForFunction(() => Journal.entries.some((e) => e.id === 'j_e2e1'), null, { timeout: 8000 }).catch(() => {});
  r = await ev(() => { const e = Journal.entries.find((x) => x.id === 'j_e2e1'); return e ? { notes: e.notes, mood: e.mood, n: Journal.entries.length } : null; });
  ok('the journal comes back with notes', r && r.notes.startsWith('=HYPERLINK') && r.mood === 'calm' && r.n >= 3, JSON.stringify(r));
  ok('restore is announced', await ev(() => /Restored your terminal/.test(document.querySelector('#toasts').textContent)));
  await ev(() => { showTab('journal'); Journal.render(); });
  await page.waitForTimeout(400);
  r = await ev(() => ({ pwn: window.__pwn, imgs: [...document.querySelectorAll('.jn-card img')].filter((i) => !/^data:image\/jpeg/.test(i.src)).length, evil: Journal.entries.find((x) => x.id === 'j_evil') }));
  ok('markup in a tampered saved journal is shown as text', r.pwn === undefined && r.imgs === 0, JSON.stringify(r).slice(0, 200));
  ok('tampered tags and mood are dropped', r.evil && r.evil.tags.join() === 'plan' && r.evil.mood === '');
  // changes made here flow back to disk; deletes propagate
  await ev(() => { ST.settings.tz = 'Europe/London'; saveState(); Journal.remove('j_evil'); });
  d = await waitDisk((x) => !x.journal.some((e) => e.id === 'j_evil') && JSON.parse(x.keys['novaterm.v1']).settings.tz === 'Europe/London');
  ok('edits in the new browser are saved back', d && JSON.parse(d.keys['novaterm.v1']).settings.tz === 'Europe/London');
  ok('deleting a journal entry deletes it on disk', d && !d.journal.some((e) => e.id === 'j_evil') && d.journal.some((e) => e.id === 'j_e2e1'));
  // an older browser copy does not overwrite newer disk data
  await ctx.close();
  const oldMain = JSON.parse(d.keys['novaterm.v1']); oldMain.settings.tz = 'Pacific/Auckland';
  ({ ctx, page, ev } = await open({ 'novaterm.v1': JSON.stringify(oldMain), 'nt.savedAt': '1' })); // a stale copy left in this browser
  r = await ev(() => ST.settings.tz);
  ok('the newest copy wins (disk newer than this browser)', r === 'Europe/London', r);
  await ctx.close();
  const newMain = Object.assign({}, oldMain, { settings: Object.assign({}, oldMain.settings, { tz: 'America/Chicago' }) });
  ({ ctx, page, ev } = await open({ 'novaterm.v1': JSON.stringify(newMain), 'nt.savedAt': String(Date.now() + 60000) })); // newer than the disk copy
  r = await ev(() => ST.settings.tz);
  ok('the newest copy wins (this browser newer than disk)', r === 'America/Chicago', r);
  d = await waitDisk((x) => JSON.parse(x.keys['novaterm.v1']).settings.tz === 'America/Chicago');
  ok('…and it becomes the saved copy', d && JSON.parse(d.keys['novaterm.v1']).settings.tz === 'America/Chicago');
  // Reset everything clears the disk copy too
  await ev(async () => { localStorage.removeItem(LS_KEY); await DiskSync.forgetMain(); });
  d = disk();
  ok('"Reset everything" also resets the copy on this computer', d && !d.keys['novaterm.v1'] && d.journal.length >= 2, d && Object.keys(d.keys));
  await ctx.close();
  ({ ctx, page, ev } = await open());
  ok('after a reset the terminal opens with defaults', await ev(() => !['Europe/London', 'America/Chicago'].includes(ST.settings.tz)));
  await ctx.close();

  // opened as a plain file (no launcher): no saving, no errors
  const fctx = await b.newContext(); const fp = await fctx.newPage(); const ferr = [];
  fp.on('pageerror', (e) => ferr.push(e.message)); await fp.route('**/*', (rt) => (rt.request().url().startsWith('file:') ? rt.continue() : rt.abort()));
  await fp.goto('file://' + path.join(__dirname, '..', 'dist', 'exterm.html'));
  await fp.waitForFunction(() => window.__exterm_v13 === true, null, { timeout: 60000 }).catch(() => {});
  r = await fp.evaluate(() => ({ on: DiskSync.on, avail: DiskSync.available(), st: DiskSync.status() }));
  ok('opened as a file: saving to disk is off and explained', !r.on && !r.avail && /launcher/.test(r.st) && !ferr.some((e) => /DiskSync|api\/state/.test(e)), JSON.stringify(r) + ferr.join('|'));
  await fctx.close();

  ok('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(res.join('\n'));
  const n = res.filter((x) => x.startsWith('PASS')).length; console.log(`${n}/${res.length} passed`);
  process.exit(n === res.length ? 0 : 1);
})();
