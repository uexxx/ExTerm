// API-key storage: never plain text, session-only by default, optional passphrase vault (PBKDF2 → AES-256-GCM).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const res = []; process.on('unhandledRejection', (e) => { console.log(res.join('\n')); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }), page = await ctx.newPage(), errs = [];
  const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://localhost:8765') && !r.request().url().includes('/proxy') ? r.continue() : r.abort()));
  const ev = (f, a) => page.evaluate(f, a), sleep = (ms) => page.waitForTimeout(ms);
  const ready = () => page.waitForFunction(() => window.__exterm_ready === true, null, { timeout: 60000 });
  const KEY = 'sk-test-SECRET-1234567890', LS = 'novaterm.v1';
  await page.goto('http://localhost:8765/'); await ready();
  const lsKey = await ev(() => LS_KEY);
  // 1) legacy plain-text keys from an older version get moved out of localStorage
  await page.goto('http://localhost:8765/__nothing__'); // same origin, app not running, so nothing overwrites storage
  await ev(([k, key]) => { const o = JSON.parse(localStorage.getItem(k) || '{}'); o.ai = Object.assign(o.ai || {}, { key }); o.settings = Object.assign(o.settings || {}, { rememberKeys: true }); localStorage.setItem(k, JSON.stringify(o)); sessionStorage.clear(); }, [lsKey, KEY]);
  await page.goto('http://localhost:8765/'); await ready(); await sleep(2200);
  ok('legacy key still works this session', await ev((key) => ST.ai.key === key, KEY));
  ok('legacy key removed from localStorage', await ev(([k, key]) => !localStorage.getItem(k).includes(key), [lsKey, KEY]));
  ok('user is told what happened', await ev(() => [...document.querySelectorAll('.toast')].some((t) => /plain-text storage/.test(t.textContent))));
  // 2) default: session only
  ok('default is session-only', await ev(() => ST.settings.rememberKeys === false));
  ok('key lives in sessionStorage only', await ev(([k, key]) => sessionStorage.getItem(k + '.secrets').includes(key) && !Object.keys(localStorage).some((x) => (localStorage.getItem(x) || '').includes(key)), [lsKey, KEY]));
  // 3) encrypted vault
  await page.click('nav button[data-tab="set"]'); await sleep(400);
  await page.selectOption('#seKeyMode', 'vault'); await page.fill('#seVaultPw', 'correct horse'); await page.fill('#seVaultPw2', 'different!'); await page.click('#sePrivSave'); await sleep(400);
  ok('mismatched passphrases are refused', await ev(() => !KeyVault.exists()));
  await page.fill('#seVaultPw', 'short'); await page.fill('#seVaultPw2', 'short'); await page.click('#sePrivSave'); await sleep(400);
  ok('short passphrase refused', await ev(() => !KeyVault.exists()));
  await page.fill('#seVaultPw', 'correct horse'); await page.fill('#seVaultPw2', 'correct horse'); await page.click('#sePrivSave'); await page.waitForFunction(() => KeyVault.exists() && ST.settings.rememberKeys, null, { timeout: 15000 }).catch(() => {}); await sleep(800);
  ok('vault created and mode saved', await ev(() => KeyVault.exists() && KeyVault.unlocked() && ST.settings.rememberKeys === true));
  ok('vault holds ciphertext only (no plain key anywhere in localStorage)', await ev((key) => !Object.keys(localStorage).some((x) => (localStorage.getItem(x) || '').includes(key)) && JSON.parse(localStorage.getItem('novaterm.vault')).ct.length > 20, KEY));
  // key changed later is re-encrypted
  await ev(() => { ST.settings.stKey = 'st-NEWKEY-777'; saveState(); }); await sleep(900);
  // 4) "restart": session cleared, reload → unlock prompt
  await page.goto('http://localhost:8765/__nothing__'); await ev(() => sessionStorage.clear()); await page.goto('http://localhost:8765/'); await ready(); await sleep(800);
  ok('keys are not loaded before unlocking', await ev(() => !ST.ai.key && !!document.querySelector('#vaultModal')));
  await page.fill('#vaultPw', 'wrong passphrase'); await page.click('#vaultGo'); await page.waitForFunction(() => /Wrong passphrase/.test(document.querySelector('#vaultErr').textContent), null, { timeout: 15000 }).catch(() => {});
  ok('wrong passphrase rejected', await ev(() => /Wrong passphrase/.test($('#vaultErr').textContent) && !ST.ai.key));
  await page.fill('#vaultPw', 'correct horse'); await page.click('#vaultGo'); await page.waitForFunction(() => !document.querySelector('#vaultModal'), null, { timeout: 15000 }).catch(() => {});
  ok('right passphrase restores every key', await ev((key) => ST.ai.key === key && ST.settings.stKey === 'st-NEWKEY-777' && Sol.keys.st === 'st-NEWKEY-777', KEY));
  // 5) back to session-only removes the vault; forget wipes everything
  await page.click('nav button[data-tab="set"]'); await sleep(300);
  await page.selectOption('#seKeyMode', 'session'); await page.click('#sePrivSave'); await sleep(400);
  ok('switching to session-only deletes the vault', await ev(() => !KeyVault.exists() && ST.settings.rememberKeys === false));
  await page.click('#seForget'); await page.click('#seForget'); await sleep(400);
  ok('Forget all API keys wipes them', await ev((key) => !ST.ai.key && !(sessionStorage.getItem(LS_KEY + '.secrets') || '').includes(key), KEY));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(res.join('\n')); console.log(res.filter((r) => r.startsWith('PASS')).length + '/' + res.length); await b.close();
})();
