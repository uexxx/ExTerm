// ExTerm v15 World tab browser end-to-end: nav placement next to Grok, hostile World Monitor headlines are escaped,
// severity / text filters, Macro Shield level, jump to Grok, strict CSP / no inline handlers, phone width.
// Third-party APIs are blocked: the app runs on simulated prices through the --offline launcher.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const res = []; const errs = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', String(e && e.message).split('\n').slice(0, 6).join(' | ')); process.exit(1); });
const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8797, BASE = 'http://localhost:' + PORT, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ntworld-'));
(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const srv = spawn(py, ['serve.py', String(PORT), '--no-browser', '--no-bots', '--no-alerts', '--no-update-check', '--offline'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { EXTERM_DATA: DATA }), stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* tmp */ } });
  await sleep(1800);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 920 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errs.push('CSP ' + m.text()); });
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof WorldTab === 'object' && typeof Grok === 'object' && typeof chart !== 'undefined' && chart && chart.data.length > 50, null, { timeout: 60000 });
    const ev = (f, a) => page.evaluate(f, a);

    ok('World button sits in the main nav, right before Grok', await ev(() => { const w = $('#nav button[data-tab="world"]'); return !!w && w.nextElementSibling === $('#nav button[data-tab="grok"]') && /World/.test(w.textContent); }));
    await page.click('#nav button[data-tab="world"]');
    ok('clicking it opens the World tab', await ev(() => curTab === 'world' && $('#tab-world').classList.contains('on')));
    ok('offline launcher: shows why there is no feed instead of hanging', await page.waitForFunction(() => /World Monitor|launcher/i.test($('#wdShield').textContent), null, { timeout: 10000 }).then(() => true, () => false));

    await ev(() => {
      const now = Date.now() / 1000;
      Grok.intel = { items: P3.cleanIntel({ items: [
        { id: 'a', title: '<img src=x onerror="window.__x=1">Strait closed', source: '<b>wire</b>', sev: 'CRITICAL', link: 'javascript:window.__x=2', ts: now - 60 },
        { id: 'b', title: 'Fed holds rates steady', source: 'Reuters', sev: 'MACRO', loc: 'US', link: 'https://example.com/fed', ts: now - 300 },
        { id: 'c', title: 'Oil jumps on supply fears', source: 'AP', sev: 'HIGH', ts: now - 600 },
        { id: 'd', title: 'Quiet day in the markets', source: 'Wire', sev: 'INFO', ts: now - 900 },
      ] }), cfg: {}, err: '', ts: now };
      WorldTab.render();
    });
    ok('all four headlines render', await ev(() => $$('#wdBody .gk-intel').length === 4));
    ok('hostile headline is escaped: no injected element, no javascript: link, nothing executed', await ev(() => !$('#wdBody img') && !$('#wdBody b') && ![...$$('#wdBody a')].some((a) => /^javascript:/i.test(a.getAttribute('href'))) && window.__x === undefined && /<img/.test($('#wdBody').textContent)));
    ok('external link opens safely', await ev(() => { const a = $('#wdBody a[href^="https://example.com"]'); return !!a && a.target === '_blank' && /noopener/.test(a.rel); }));
    ok('Macro Shield reads CRITICAL with severity counts', await ev(() => /CRITICAL/.test($('#wdShield').textContent) && $('#wdSev button[data-v="CRITICAL"] .n').textContent === '1' && $('#wdSev button[data-v="ALL"] .n').textContent === '4'));
    await page.click('#wdSev button[data-v="HIGH"]');
    ok('severity filter narrows to HIGH', await ev(() => $$('#wdBody .gk-intel').length === 1 && /Oil jumps/.test($('#wdBody').textContent) && $('#wdSev button[data-v="HIGH"]').classList.contains('on')));
    await page.click('#wdSev button[data-v="ALL"]');
    await page.fill('#wdQ', 'reuters');
    ok('text filter matches the source', await ev(() => $$('#wdBody .gk-intel').length === 1 && /Fed holds/.test($('#wdBody').textContent)));
    await page.fill('#wdQ', 'zzzz-nothing');
    ok('empty filter result says so', await ev(() => /No headlines match/.test($('#wdBody').textContent)));
    await page.fill('#wdQ', '');
    await page.click('[data-wd="grok"]');
    ok('Shield controls button opens the Grok tab', await ev(() => curTab === 'grok'));
    ok('no inline event handlers in the World tab', await ev(() => ![...$('#tab-world').querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)))));
    const csp = await ev(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
    ok('strict CSP: default-src none, SHA-256 script hash, no unsafe-inline script', /default-src 'none'/.test(csp) && /script-src[^;]*'sha256-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 200));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#nav button[data-tab="world"]').catch(() => ev(() => showTab('world')));
    ok('phone width: World tab has no horizontal page scroll', await ev(() => curTab === 'world' && document.documentElement.scrollWidth <= innerWidth + 1), await ev(() => document.documentElement.scrollWidth + ' > ' + innerWidth));
    ok('no page errors, dialogs or CSP violations', errs.length === 0, errs.slice(0, 4).join(' || '));
  } finally { await b.close(); }
  console.log(res.join('\n'));
  const fails = res.filter((r) => r.startsWith('FAIL'));
  console.log(`${res.length - fails.length}/${res.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
