// Bounded local PoC: malicious third-party token metadata must never execute script. No external network (all non-localhost requests aborted).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage(); let pwned = [];
  await page.exposeFunction('__pwn', (w) => pwned.push(w));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const m = 'EvilMint1111111111111111111111111111111pump';
    Sol.tokens[m] = { sym: 'EVIL', name: 'evil', url: '"><img src=x onerror="window.__pwn(\'token-url\')">', img: 'javascript:window.__pwn(1)', price: 1, ts: Date.now() };
    const host = document.createElement('div'); document.body.appendChild(host);
    host.innerHTML = tokLink(m) + tradeCard({ id: 'x1', side: 'buy', mint: m, wallet: Sol.wallets[0].addr, name: 'w', ts: Date.now(), sig: '"><img src=x onerror="window.__pwn(\'sig\')">', sol: 1 });
    // news link with executable scheme
    const a = document.createElement('div'); a.innerHTML = `<a id="newsA" href="${esc('javascript:window.__pwn(\'news\')')}">n</a>`; document.body.appendChild(a);
    return { links: [...host.querySelectorAll('a')].map((x) => x.getAttribute('href')).slice(0, 3), imgs: host.querySelectorAll('img').length };
  });
  await page.waitForTimeout(500);
  const safeNews = await page.evaluate(() => typeof safeUrl === 'function' ? safeUrl('javascript:alert(1)') : 'NO safeUrl()');
  console.log('rendered hrefs:', JSON.stringify(r.links), '| <img> injected:', r.imgs, '| safeUrl(javascript:) =', safeNews);
  console.log('SCRIPT EXECUTIONS:', pwned.length ? pwned : 'none');
  await browser.close(); process.exit(pwned.length ? 1 : 0);
})();
