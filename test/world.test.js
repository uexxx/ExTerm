// ExTerm v15 World tab unit tests: severity / text filtering and counts over P3.cleanIntel output.
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (c || !i ? '' : ' - ' + String(i).slice(0, 240)));
const W = require('../src/world.js');
const items = [
  { id: '1', title: 'Fed holds rates', source: 'Reuters', sev: 'MACRO', cat: 'economy', loc: 'US', link: '', ts: 1 },
  { id: '2', title: 'Strait closed to tankers', source: 'AP', sev: 'CRITICAL', cat: 'conflict', loc: 'Hormuz', link: '', ts: 2 },
  { id: '3', title: 'Oil jumps 4%', source: 'Bloomberg', sev: 'HIGH', cat: 'markets', loc: '', link: '', ts: 3 },
  { id: '4', title: 'Local festival', source: 'Wire', sev: 'INFO', cat: '', loc: 'Paris', link: '', ts: 4 },
];
ok('ALL returns every item', W.filter(items, 'ALL', '').length === 4);
ok('severity filter', W.filter(items, 'CRITICAL', '').map((i) => i.id).join() === '2');
ok('unknown severity falls back to ALL', W.filter(items, '<script>', '').length === 4);
ok('text filter searches title, source, loc and category (case-insensitive)', W.filter(items, 'ALL', 'HORMUZ').map((i) => i.id).join() === '2' && W.filter(items, 'ALL', 'reuters').length === 1 && W.filter(items, 'ALL', 'markets').length === 1);
ok('severity + text combine', W.filter(items, 'HIGH', 'fed').length === 0 && W.filter(items, 'MACRO', 'fed').length === 1);
ok('non-array input is safe', W.filter(null, 'ALL', '').length === 0 && W.filter(undefined).length === 0);
const c = W.counts(items);
ok('counts per severity', c.ALL === 4 && c.CRITICAL === 1 && c.HIGH === 1 && c.MACRO === 1 && c.INFO === 1, JSON.stringify(c));
ok('counts on empty', W.counts(null).ALL === 0);
console.log(res.join('\n'));
const f = res.filter((r) => r.startsWith('FAIL'));
console.log(`${res.length - f.length}/${res.length} passed`);
process.exit(f.length ? 1 : 0);
