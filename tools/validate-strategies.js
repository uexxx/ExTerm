#!/usr/bin/env node
// Checks every community strategy file: valid JSON, passes ExTerm's strict schema, unique id, and
// actually runs in the backtest engine. Used by the GitHub Action on every pull request.
const fs = require('fs'), path = require('path');
const NT = require('../src/stratspec.js'), SP = NT.Spec;
const dir = path.join(__dirname, '..', 'community', 'strategies');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let bad = 0; const ids = new Map();
function market(n, seed) { let s = seed >>> 0, p = 100; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const o = []; for (let i = 0; i < n; i++) { const op = p; p = Math.max(0.01, p * (1 + (r() - 0.48) * 0.04)); o.push({ t: 1.6e9 + i * 3600, o: op, h: Math.max(op, p) * (1 + r() * 0.01), l: Math.min(op, p) * (1 - r() * 0.01), c: p, v: 1000 + r() * 2000 }); } return o; }
const candles = market(2000, 7);
for (const f of files) {
  const fail = (m) => { bad++; console.log('FAIL ' + f + ': ' + m); };
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  if (raw.length > 20000) { fail('file too large'); continue; }
  if (!/^[a-z0-9][a-z0-9-]{1,60}\.json$/.test(f)) { fail('file names must be lower-case-with-dashes.json'); continue; }
  let j; try { j = JSON.parse(raw); } catch (e) { fail('not valid JSON: ' + e.message); continue; }
  const v = SP.validate(j); if (!v.ok) { fail(v.errors.join('; ')); continue; }
  if (!v.spec.author) { fail('add an "author" field'); continue; }
  const id = SP.idOf(v.spec); if (ids.has(id)) { fail('same name as ' + ids.get(id)); continue; } ids.set(id, f);
  try { const st = SP.compile(v.spec), r = NT.backtest(candles, st, {}, { cash: 10000 }); if (!Number.isFinite(r.stats.ret)) throw new Error('non-finite result'); console.log('PASS ' + f + ' (' + r.stats.closed + ' trades on test data)'); }
  catch (e) { fail('crashed in the backtester: ' + e.message); }
}
console.log(`\n${files.length - bad}/${files.length} strategy files valid`);
process.exit(bad ? 1 : 0);
