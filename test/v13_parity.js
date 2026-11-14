// Launcher parity: the Python no-code interpreter (serve.py) must produce exactly the same entry/exit signals as the
// page (stratspec.js) on the same candles, for every indicator, every comparison and higher-timeframe operands.
const NT = require('../src/stratspec.js'), SP = NT.Spec, { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let s = 42; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const candles = []; let p = 100;
for (let i = 0; i < 700; i++) { const o = p, c = Math.max(1, o * (1 + (r() - 0.49) * 0.03)); candles.push({ t: 1700000000 + i * 3600, o, h: Math.max(o, c) * (1 + r() * 0.01), l: Math.min(o, c) * (1 - r() * 0.01), c, v: 500 + r() * 2000 }); p = c; }
const K = Object.keys(SP.OPS).filter((k) => k !== 'const'), C = Object.keys(SP.CMP), TF = [1, 1, 1, 2, 4, 6];
const opnd = () => { const k = K[Math.floor(r() * K.length)], d = SP.OPS[k], o = { k }; if (d.n) o.n = Math.max(d.n[1], Math.min(d.n[2], Math.round(d.n[0] * (0.5 + r())))); const tf = TF[Math.floor(r() * TF.length)]; if (tf > 1) o.tf = tf; return o; };
const rhs = (a) => (r() < 0.4 ? { k: 'const', v: a.k === 'rsi' || a.k === 'stochK' || a.k === 'adx' ? Math.round(20 + r() * 60) : +(r() * 2 - 1).toFixed(3) } : opnd());
const specs = [];
for (const k of K) specs.push({ v: 1, name: 'only ' + k, entry: { all: [{ a: { k }, op: '>', b: { k: 'sma', n: 20 } }] }, exit: { any: [{ a: { k }, op: 'crossBelow', b: { k: 'ema', n: 10 } }] }, risk: { sl: 5 } });
for (let i = 0; i < 120; i++) { const mk = () => { const a = opnd(); return { a, op: C[Math.floor(r() * C.length)], b: rhs(a) }; }; specs.push({ v: 1, name: 'random ' + i, dir: r() < 0.3 ? 'short' : 'long', entry: { [r() < 0.5 ? 'all' : 'any']: [mk(), mk()].slice(0, 1 + Math.floor(r() * 2)) }, exit: { any: [mk()] }, risk: { tp: 10 } }); }
const valid = specs.map((x) => SP.validate(x)).filter((v) => v.ok).map((v) => v.spec);
const js = valid.map((sp) => SP.signals(sp, candles));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntpar-')), f = path.join(dir, 'in.json');
fs.writeFileSync(f, JSON.stringify({ candles, specs: valid }));
const py = `
import json, sys; sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, '..'))})
import serve
import os
d = json.load(open(os.environ['NTPAR'])); out = []
for sp in d["specs"]:
    v = serve.spec_validate(sp); e, x = serve.spec_signals(v, d["candles"]); out.append({"entry": e, "exit": x})
print(json.dumps(out))`;
const res = JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py], { maxBuffer: 64 * 1024 * 1024, env: Object.assign({}, process.env, { NTPAR: f }) }).toString());
let bad = 0, sig = 0;
valid.forEach((sp, i) => { for (const k of ['entry', 'exit']) for (let j = 0; j < candles.length; j++) { if (js[i][k][j]) sig++; if (js[i][k][j] !== res[i][k][j]) { if (bad < 5) console.log(`FAIL ${sp.name} ${k} bar ${j}: page=${js[i][k][j]} launcher=${res[i][k][j]}`); bad++; } } });
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `FAIL ${bad} mismatches` : `${valid.length}/${valid.length} strategies identical in page and launcher (${sig} signals compared over ${candles.length} candles)`);
process.exit(bad ? 1 : 0);
