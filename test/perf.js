const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-gpu-rasterization'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') ? r.continue() : r.abort()));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 }); await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); });
  const out = {};
  for (const t of ['markets', 'whales', 'port', 'heat', 'bots', 'lab']) {
    await page.click(`nav button[data-tab="${t}"]`);
    await page.evaluate(() => { window.__lt = []; window.__fr = []; let last = performance.now(); const f = (ts) => { window.__fr.push(ts - last); last = ts; if (window.__fr.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.waitForTimeout(6000);
    out[t] = await page.evaluate(() => { const fr = window.__fr.slice(5).sort((a, b) => a - b); return { longTasks: window.__lt.length, longMs: Math.round(window.__lt.reduce((a, b) => a + b, 0)), p95frame: +(fr[Math.floor(fr.length * 0.95)] || 0).toFixed(1), fps: Math.round(1000 / (fr.reduce((a, b) => a + b, 0) / fr.length)) }; });
  }
  const m = await page.evaluate(() => ({ heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, nodes: document.getElementsByTagName('*').length }));
  console.log(JSON.stringify(out)); console.log(JSON.stringify(m), 'errors:', errs.length ? errs.slice(0, 3) : 'none');
  await browser.close();
})();
