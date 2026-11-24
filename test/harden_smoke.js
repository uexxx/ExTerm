// Hardened build smoke test: dist/exterm.min.html (esbuild-minified, CSP-pinned) boots offline from file://,
// every main tab including the Pro Desk opens, and there are no CSP violations, page errors or inline handlers.
// Run after `python build.py --harden`. Third-party network is blocked.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const res = [], errs = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' — ' + String(i).slice(0, 300)));
(async () => {
  const f = path.join(__dirname, '..', 'dist', 'exterm.min.html');
  if (!fs.existsSync(f)) { console.log('FAIL dist/exterm.min.html missing: run python build.py --harden'); process.exit(1); }
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file:///' + f.replace(/\\/g, '/'));
  ok('minified build boots', await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }).then(() => true, () => false));
  ok('CSP is pinned to a script hash with default-src none', await page.evaluate(() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content; return /default-src 'none'/.test(m) && /script-src 'sha256-/.test(m) && !/unsafe-inline'[^;]*script|script-src[^;]*unsafe-eval/.test(m); }));
  for (const t of ['markets', 'heat', 'bots', 'port', 'ai', 'grok', 'desk', 'lab', 'set']) {
    const has = await page.$(`#nav button[data-tab="${t}"]`); if (!has) { ok(`tab ${t} exists`, false); continue; }
    await page.evaluate((x) => document.querySelector(`#nav button[data-tab="${x}"]`).click(), t); await page.waitForTimeout(400); // v17.7 hides the legacy nav (the 4-tab rail replaces it); its buttons stay wired
    ok(`tab ${t} opens`, await page.evaluate((x) => document.getElementById('tab-' + x).classList.contains('on'), t));
  }
  if (await page.$('#x177Rail')) for (const [k, t] of [['botradar', 'botradar'], ['brain', 'brain'], ['livebot', 'fleet'], ['copilot', 'markets']]) { // v17.7: the 4 rail tabs
    await page.click(`#x177Rail [data-x177t="${k}"]`); await page.waitForTimeout(500);
    ok(`rail tab ${k} opens`, await page.evaluate((x) => document.getElementById('tab-' + x).classList.contains('on'), t));
  }
  ok('Pro Desk renders its sections', await page.evaluate(() => document.querySelectorAll('#p5Nav button').length === 9));
  ok('watchlist sidebar toggles', await page.evaluate(() => { document.getElementById('btnSide').click(); return !document.getElementById('p4Side').hidden; }));
  const r = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length);
  ok('no inline on* handlers', r === 0, r);
  ok('no CSP violations, page errors or dialogs', errs.length === 0, errs.slice(0, 4).join(' || '));
  await b.close();
  console.log(res.join('\n')); const fails = res.filter((x) => x.startsWith('FAIL')); console.log(`${res.length - fails.length}/${res.length} passed`); process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log(res.join('\n')); console.log('CRASH', e.message); process.exit(1); });
