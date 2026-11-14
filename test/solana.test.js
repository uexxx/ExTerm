// unit tests for the Solana swap decoder + stock routing helpers (loads browser files into a sandbox)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, performance, Date, Math, JSON, Promise, Number, String, Object, Array, Set, Map, Error, BigInt, location: { protocol: 'file:' }, fetch: async () => { throw new Error('offline'); } };
ctx.self = ctx; vm.createContext(ctx);
for (const f of ['core.js', 'data.js', 'stocks.js', 'solana.js']) vm.runInContext(fs.readFileSync(__dirname + '/../src/' + f, 'utf8'), ctx, { filename: f });
const { Sol } = vm.runInContext('({ Sol, isStock, STOCK_SET })', ctx), r = vm.runInContext('({ isStock, STOCK_SET, Sol })', ctx);
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const W = '4fxpWbsubzCYqHvQFtAGETa4zqm1PZeqq8TVUCUnhmeJ', MINT = 'Ey2zpSAJ5gVLfYDD5WjccbksJD3E9jPFMPaJ8wxvpump', POOL = 'PooL1111111111111111111111111111111111111111';
const tb = (mint, owner, amt, dec = 6) => ({ mint, owner, uiTokenAmount: { uiAmountString: String(amt), decimals: dec } });
const tx = (o) => ({ blockTime: 1762500000, transaction: { message: { accountKeys: [{ pubkey: W }, { pubkey: POOL }, { pubkey: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' }] } }, meta: Object.assign({ err: null, fee: 5000, preBalances: [10e9, 0, 1], postBalances: [10e9, 0, 1], preTokenBalances: [], postTokenBalances: [] }, o) });
const w = { addr: W, name: 'Big Whale', emoji: '🐳', alerts: true };
Sol.solPx = 200;
console.log('solana decoder');
t('pump.fun buy: SOL out, token in', () => {
  const e = Sol.parse(tx({ preBalances: [10e9, 0, 1], postBalances: [7.5e9 - 5000, 0, 1], postTokenBalances: [tb(MINT, W, 1500000)] }), w, 'sigA');
  assert.strictEqual(e.side, 'buy'); assert.strictEqual(e.mint, MINT); assert(Math.abs(e.sol - 2.5) < 1e-9, e.sol); assert(Math.abs(e.usd - 500) < 1e-6); assert.strictEqual(e.dex, 'pump.fun'); assert(Math.abs(e.amt - 1500000) < 1e-6);
});
t('sell: token out, SOL in (fee added back)', () => {
  const e = Sol.parse(tx({ preBalances: [1e9, 0, 1], postBalances: [4e9 - 5000, 0, 1], preTokenBalances: [tb(MINT, W, 900)], postTokenBalances: [tb(MINT, W, 0)] }), w, 'sigB');
  assert.strictEqual(e.side, 'sell'); assert(Math.abs(e.sol - 3) < 1e-9);
});
t('WSOL-routed buy counts as SOL', () => {
  const WSOL = Sol.WSOL;
  const e = Sol.parse(tx({ preTokenBalances: [tb(WSOL, W, 5, 9)], postTokenBalances: [tb(WSOL, W, 1, 9), tb(MINT, W, 42)] , postBalances: [10e9 - 5000, 0, 1] }), w, 'sigC');
  assert.strictEqual(e.side, 'buy'); assert(Math.abs(e.sol - 4) < 1e-9, e.sol);
});
t('USDC-quoted buy uses USD amount', () => {
  const e = Sol.parse(tx({ preTokenBalances: [tb('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', W, 1000)], postTokenBalances: [tb('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', W, 250), tb(MINT, W, 10)], postBalances: [10e9 - 5000, 0, 1] }), w, 'sigD');
  assert.strictEqual(e.side, 'buy'); assert(Math.abs(e.usd - 750) < 1e-9);
});
t('other owners balances ignored; token airdrop = recv', () => {
  const e = Sol.parse(tx({ postTokenBalances: [tb(MINT, POOL, 99999), tb(MINT, W, 5)], postBalances: [10e9 - 5000, 0, 1] }), w, 'sigE');
  assert.strictEqual(e.side, 'recv');
});
t('big SOL transfer detected, dust ignored, failed tx ignored', () => {
  assert.strictEqual(Sol.parse(tx({ postBalances: [30e9 - 5000, 0, 1] }), w, 's').side, 'sol_in');
  assert.strictEqual(Sol.parse(tx({ postBalances: [10e9 - 5000 - 1000, 0, 1] }), w, 's'), null);
  assert.strictEqual(Sol.parse(tx({ err: { InstructionError: [] }, postTokenBalances: [tb(MINT, W, 1)] }), w, 's'), null);
});
t('load/import the user list format, dedupe, export round-trip', () => {
  const list = JSON.parse(fs.readFileSync(__dirname + '/../src/wallets.json', 'utf8'));
  const res = Sol.load(list, true); assert.strictEqual(res.added, list.length); assert.strictEqual(Sol.wallets.length, list.length);
  const again = Sol.load(list.slice(0, 5)); assert.strictEqual(again.added, 0); assert.strictEqual(again.updated, 5);
  assert.strictEqual(Sol.load([{ trackedWalletAddress: 'not-an-address' }]).skipped, 1);
  const exp = Sol.exportList(); assert.deepStrictEqual(Object.keys(exp[0]), ['trackedWalletAddress', 'name', 'emoji', 'alertsOn']);
  assert.strictEqual(exp.filter((x) => x.alertsOn).length, list.filter((x) => x.alertsOn).length);
});
t('hot tokens cluster by distinct buyers', () => {
  Sol.trades = []; Sol.ids = new Set();
  const [a, b, c] = Sol.wallets;
  const ev = (wl, side, mint, sol) => Sol.emit({ id: Math.random() + '', ts: Date.now(), wallet: wl.addr, name: wl.name, emoji: wl.emoji, alerts: wl.alerts, side, mint, sol, usd: sol * 200 }, false);
  ev(a, 'buy', 'MINTX', 1); ev(b, 'buy', 'MINTX', 2); ev(a, 'buy', 'MINTX', 1); ev(c, 'buy', 'MINTY', 9); ev(c, 'sell', 'MINTX', 1);
  const h = Sol.hot(60); assert.strictEqual(h[0].mint, 'MINTX'); assert.strictEqual(h[0].buyers.size, 2); assert.strictEqual(h[0].sellers.size, 1); assert(Math.abs(h[0].sol - 4) < 1e-9);
});
console.log('stocks routing');
t('isStock / universe', () => { assert(r.isStock('AAPL') && r.isStock('BRK-B') && !r.isStock('BTC-USD')); assert(r.STOCK_SET.has('NVDA') && r.STOCK_SET.size > 70); });
console.log(`\n${n} passed`);
