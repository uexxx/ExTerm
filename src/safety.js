/* ExTerm Token Safety scanner — rug-pull checks for any Solana token (plus market checks on other chains).
   Data: Solana JSON-RPC (mint + largest holders), DexScreener (liquidity, age, flow), RugCheck summary (optional).
   Everything fetched is treated as untrusted: numbers are coerced, text is stripped and escaped before display.
   The grade is a heuristic screen, never a guarantee and never advice. */
const Safety = (() => {
  const S = { cache: {}, busy: {}, last: null };
  const MINT_RX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM_RX = /^0x[0-9a-fA-F]{40}$/;
  const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
  const DANGER_EXT = { permanentDelegate: 'Permanent delegate: the creator can move or burn tokens out of any wallet', transferHook: 'Transfer hook: a custom program runs on every transfer and can block sells', nonTransferable: 'Non-transferable: the token cannot be sent or sold', defaultAccountState: 'Default frozen accounts: new holders start frozen' };
  const num = (v) => { const n = +v; return Number.isFinite(n) ? n : null; };
  const clean = (s, n = 140) => (s == null ? '' : String(s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩<>"'`&]/g, '').trim().slice(0, n));
  S.isMint = (s) => typeof s === 'string' && MINT_RX.test(s);
  S.isEvm = (s) => typeof s === 'string' && EVM_RX.test(s);

  /* ---- grading: pure function, unit-tested ---- */
  // checks: [{id, label, status:'pass'|'warn'|'fail'|'unknown', pts (penalty), crit?, why}]
  S.grade = (checks) => {
    let score = 100, crit = false, known = 0;
    for (const c of checks) { if (c.status !== 'unknown') known++; if (c.status === 'fail' || c.status === 'warn') score -= c.pts || 0; if (c.status === 'fail' && c.crit) crit = true; }
    score = Math.max(0, Math.min(100, score));
    let g = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    if (crit && 'ABC'.includes(g)) g = 'D'; // a critical failure caps the grade, however clean the rest looks
    if (known < 3) g = '?';                 // not enough data to grade honestly
    return { score, grade: g, crit, known };
  };

  /* ---- individual checks: pure, take already-fetched data ---- */
  S.checkMint = (info) => {
    if (!info) return [{ id: 'mint', label: 'Mint authority', status: 'unknown', why: "Couldn't read the token's mint account." }, { id: 'freeze', label: 'Freeze authority', status: 'unknown', why: "Couldn't read the token's mint account." }];
    const out = [];
    out.push(info.mintAuthority ? { id: 'mint', label: 'Mint authority', status: 'fail', pts: 35, crit: true, why: 'The creator can still print unlimited new tokens and dilute every holder.' } : { id: 'mint', label: 'Mint authority', status: 'pass', why: 'Renounced: no one can create more tokens.' });
    out.push(info.freezeAuthority ? { id: 'freeze', label: 'Freeze authority', status: 'fail', pts: 30, crit: true, why: 'The creator can freeze your wallet so you can never sell.' } : { id: 'freeze', label: 'Freeze authority', status: 'pass', why: 'Renounced: no one can freeze holders.' });
    if (info.program === TOKEN_2022) {
      const bad = (info.extensions || []).map((e) => clean(e && e.extension, 40)).filter((e) => DANGER_EXT[e]);
      const fee = (info.extensions || []).find((e) => e && e.extension === 'transferFeeConfig');
      const bps = fee ? num(fee.state && fee.state.newerTransferFee && fee.state.newerTransferFee.transferFeeBasisPoints) : null;
      if (bad.length) out.push({ id: 'ext', label: 'Token-2022 extensions', status: 'fail', pts: 30, crit: true, why: bad.map((e) => DANGER_EXT[e]).join('. ') + '.' });
      else if (bps && bps > 0) out.push({ id: 'ext', label: 'Transfer tax', status: bps > 500 ? 'fail' : 'warn', pts: bps > 500 ? 25 : 8, why: `Every transfer pays a ${(bps / 100).toFixed(2)}% fee to the creator.` });
      else out.push({ id: 'ext', label: 'Token-2022 extensions', status: 'pass', why: 'No dangerous extensions found.' });
    }
    return out;
  };
  S.checkHolders = (largest, supply) => {
    if (!largest || !largest.length || !(supply > 0)) return [{ id: 'holders', label: 'Holder concentration', status: 'unknown', why: "Couldn't read the largest holders." }];
    const amt = largest.map((a) => num(a.uiAmount) || 0).sort((a, b) => b - a);
    const top1 = (amt[0] / supply) * 100, top10 = (amt.slice(0, 10).reduce((s, x) => s + x, 0) / supply) * 100;
    const ex = (amt.slice(1, 11).reduce((s, x) => s + x, 0) / supply) * 100; // top 10 after the biggest, which is often the pool or bonding curve
    const st = ex > 50 ? 'fail' : ex > 30 ? 'warn' : 'pass';
    return [{ id: 'holders', label: 'Holder concentration', status: st, pts: st === 'fail' ? 20 : st === 'warn' ? 10 : 0, top1, top10, why: `Largest holder ${top1.toFixed(1)}% (often the liquidity pool). The next 10 wallets hold ${ex.toFixed(1)}%${st === 'pass' ? ', reasonably spread out.' : ': a few wallets could crash the price by selling.'}` }];
  };
  S.checkMarket = (pair) => {
    if (!pair) return [{ id: 'liq', label: 'Liquidity', status: 'unknown', why: 'No trading pair found on DexScreener.' }];
    const out = [], liq = num(pair.liquidity && pair.liquidity.usd), created = num(pair.pairCreatedAt), vol = num(pair.volume && pair.volume.h24);
    const b = num(pair.txns && pair.txns.h24 && pair.txns.h24.buys) || 0, s = num(pair.txns && pair.txns.h24 && pair.txns.h24.sells) || 0;
    out.push(liq == null ? { id: 'liq', label: 'Liquidity', status: 'unknown', why: 'Liquidity not reported.' } : liq < 10000 ? { id: 'liq', label: 'Liquidity', status: 'fail', pts: 25, liq, why: `Only $${Math.round(liq).toLocaleString()} in the pool: even small sells move the price a lot.` } : liq < 50000 ? { id: 'liq', label: 'Liquidity', status: 'warn', pts: 10, liq, why: `$${Math.round(liq).toLocaleString()} in the pool: thin, expect big slippage.` } : { id: 'liq', label: 'Liquidity', status: 'pass', liq, why: `$${Math.round(liq).toLocaleString()} in the pool.` });
    if (created) { const h = (Date.now() - created) / 36e5; out.push(h < 24 ? { id: 'age', label: 'Pair age', status: 'warn', pts: 10, why: `Created ${h < 1 ? Math.round(h * 60) + ' minutes' : h.toFixed(1) + ' hours'} ago. Most rugs happen in the first day.` } : { id: 'age', label: 'Pair age', status: 'pass', why: `Trading for ${h < 48 ? h.toFixed(0) + ' hours' : Math.round(h / 24) + ' days'}.` }); }
    if (b + s >= 20) out.push(s === 0 ? { id: 'sells', label: 'Can people sell?', status: 'fail', pts: 30, crit: true, why: `${b} buys and zero sells in 24h: a classic honeypot sign.` } : s / (b + s) < 0.08 ? { id: 'sells', label: 'Can people sell?', status: 'warn', pts: 12, why: `Only ${s} sells against ${b} buys in 24h. Selling may be restricted.` } : { id: 'sells', label: 'Can people sell?', status: 'pass', why: `${b.toLocaleString()} buys and ${s.toLocaleString()} sells in 24h.` });
    if (liq && vol && vol / liq > 40) out.push({ id: 'wash', label: 'Volume vs liquidity', status: 'warn', pts: 8, why: `24h volume is ${(vol / liq).toFixed(0)}× the pool size: possible wash trading or bots.` });
    return out;
  };
  S.checkRugcheck = (rc) => {
    if (!rc || !Array.isArray(rc.risks)) return [{ id: 'rc', label: 'RugCheck report', status: 'unknown', why: 'RugCheck.xyz report unavailable.' }];
    const risks = rc.risks.slice(0, 12).map((r) => ({ name: clean(r && r.name, 60), level: clean(r && r.level, 10).toLowerCase(), d: clean(r && r.description, 140) })).filter((r) => r.name);
    const lp = risks.find((r) => /lp|liquidity/i.test(r.name) && /unlock|not locked|burn/i.test(r.name));
    const danger = risks.filter((r) => r.level === 'danger').length;
    const out = [];
    out.push(lp ? { id: 'lp', label: 'Liquidity locked?', status: 'fail', pts: 20, why: lp.name + (lp.d ? ': ' + lp.d : '') + '. The creator could pull the liquidity.' } : { id: 'lp', label: 'Liquidity locked?', status: 'pass', why: 'RugCheck reports no unlocked-liquidity risk.' });
    out.push(danger ? { id: 'rc', label: 'RugCheck risks', status: 'warn', pts: Math.min(30, danger * 10), why: risks.filter((r) => r.level === 'danger').map((r) => r.name).join(', ') } : { id: 'rc', label: 'RugCheck risks', status: risks.length ? 'pass' : 'pass', why: risks.length ? 'Only minor notes: ' + risks.map((r) => r.name).join(', ') : 'No risks reported.' });
    return out;
  };

  /* ---- fetching (every source optional, failures become "unknown") ---- */
  async function rpc(m, p) { if (typeof Sol === 'undefined' || !Sol.rpc) throw new Error('no RPC'); return Sol.rpc(m, p, true); }
  async function mintInfo(mint) {
    const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    const v = r && r.value; if (!v || !v.data || !v.data.parsed || v.data.parsed.type !== 'mint') return null;
    const i = v.data.parsed.info || {};
    return { program: clean(v.owner, 60), mintAuthority: i.mintAuthority ? clean(i.mintAuthority, 60) : null, freezeAuthority: i.freezeAuthority ? clean(i.freezeAuthority, 60) : null, supply: num(i.supply), decimals: num(i.decimals), extensions: Array.isArray(i.extensions) ? i.extensions.slice(0, 20) : [] };
  }
  async function largest(mint) { const r = await rpc('getTokenLargestAccounts', [mint]); return (r && Array.isArray(r.value) ? r.value : []).slice(0, 20); }
  async function dexPair(chain, addr) {
    const r = await J.get('https://api.dexscreener.com/tokens/v1/' + chain + '/' + addr, { timeout: 12000 });
    const list = (Array.isArray(r) ? r : (r && r.pairs) || []).filter((p) => p && p.baseToken && String(p.baseToken.address) === addr);
    return list.sort((a, b) => (num(b.liquidity && b.liquidity.usd) || 0) - (num(a.liquidity && a.liquidity.usd) || 0))[0] || null;
  }
  async function rugcheck(mint) { return J.get('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report/summary', { timeout: 12000 }); }
  const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: e && e.message }));

  S.scan = async (addr, chain = 'solana', force) => {
    addr = String(addr || '').trim();
    const sol = chain === 'solana';
    if (sol ? !S.isMint(addr) : !(S.isEvm(addr) || S.isMint(addr))) throw new Error(sol ? "That isn't a valid Solana token address." : "That isn't a valid token address.");
    const key = chain + ':' + addr, hit = S.cache[key];
    if (hit && !force && Date.now() - hit.ts < 120000) return hit;
    if (S.busy[key]) return S.busy[key];
    const dsChain = { solana: 'solana', eth: 'ethereum', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' }[chain] || chain;
    const job = (async () => {
      const [mi, lg, dp, rc] = await Promise.all([sol ? settle(mintInfo(addr)) : Promise.resolve({ ok: false }), sol ? settle(largest(addr)) : Promise.resolve({ ok: false }), settle(dexPair(dsChain, addr)), sol ? settle(rugcheck(addr)) : Promise.resolve({ ok: false })]);
      const info = mi.ok ? mi.v : null, pair = dp.ok ? dp.v : null;
      const supply = info && info.supply != null && info.decimals != null ? info.supply / Math.pow(10, info.decimals) : null;
      const checks = [].concat(sol ? S.checkMint(info) : [], sol ? S.checkHolders(lg.ok ? lg.v : null, supply) : [], S.checkMarket(pair), sol ? S.checkRugcheck(rc.ok ? rc.v : null) : []);
      const g = S.grade(checks);
      const res = { addr, chain, ts: Date.now(), checks, ...g, symbol: pair ? clean(pair.baseToken.symbol, 16) : '', name: pair ? clean(pair.baseToken.name, 48) : '', pairUrl: pair && /^https:\/\/dexscreener\.com\//.test(pair.url || '') ? pair.url : '', evmNote: !sol };
      S.cache[key] = res; S.last = res; return res;
    })();
    S.busy[key] = job;
    try { return await job; } finally { delete S.busy[key]; }
  };

  /* ---- rendering ---- */
  const ICON = { pass: '✓', warn: '!', fail: '✕', unknown: '?' };
  const GCLS = { A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', F: 'g-f', '?': 'g-u' };
  S.card = (r) => {
    const links = [r.pairUrl ? ['DexScreener', r.pairUrl] : null, r.chain === 'solana' ? ['RugCheck', 'https://rugcheck.xyz/tokens/' + r.addr] : null, r.chain === 'solana' ? ['Solscan', 'https://solscan.io/token/' + r.addr] : null].filter(Boolean);
    return `<div class="safe-card"><div class="safe-head"><div class="safe-grade ${GCLS[r.grade]}" style="--pct:${r.grade === '?' ? 0 : r.score}"><b>${esc(r.grade)}</b><span>${r.grade === '?' ? 'no data' : r.score + '/100'}</span></div>
      <div class="safe-meta"><div class="safe-title">${esc(r.symbol || 'Token')}${r.name ? ` <span class="mut">${esc(r.name)}</span>` : ''}</div><div class="note mono" style="word-break:break-all">${esc(r.addr)}</div>
      <div class="note">${r.crit ? '<span class="tag dn">Critical risk found</span> ' : ''}${r.evmNote ? 'Contract checks (mint, freeze, holders) are Solana-only; market checks below. ' : ''}Checked ${fmtClock(r.ts)}</div></div></div>
      <ul class="safe-list">${r.checks.map((c) => `<li class="safe-${c.status}" data-check="${esc(c.id)}"><i>${ICON[c.status]}</i><div><b>${esc(c.label)}</b><span>${esc(c.why || '')}</span></div></li>`).join('')}</ul>
      ${links.length ? `<div class="note">${links.map(([t, u]) => `<a href="${safeUrl(u, '#', true)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`).join(' · ')}</div>` : ''}
      <div class="note" style="margin-top:6px">A quick automated screen from public data. A good grade is not a guarantee and nothing here is financial advice.</div></div>`;
  };
  S.renderLab = (body) => {
    const cur = isOnchain(ST.sel) && OC.meta[ST.sel] && OC.meta[ST.sel].ca ? OC.meta[ST.sel].ca : '';
    const curChain = isOnchain(ST.sel) ? (OC.parse(ST.sel) || {}).chain : 'solana';
    body.innerHTML = `<div class="panel"><div class="ph">🛡️ Token safety scanner<span class="sp"></span><span class="note">mint · freeze · holders · liquidity · honeypot · RugCheck</span></div>
      <form class="safe-form" id="safeForm"><select class="in" id="safeChain" aria-label="Chain">${Object.entries(OC.CHAINS).map(([k, v]) => `<option value="${k}" ${k === (curChain || 'solana') ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select>
      <input class="in mono" id="safeAddr" placeholder="Paste a token contract address" autocomplete="off" spellcheck="false" value="${esc(cur)}" aria-label="Token address"><button class="btn pri" id="safeGo" type="submit">Scan</button></form>
      <div id="safeOut">${S.last ? S.card(S.last) : '<div class="empty">Paste any token address to check it for common rug-pull traps before you trade it.</div>'}</div></div>`;
    $('#safeForm').onsubmit = async (e) => {
      e.preventDefault(); const a = $('#safeAddr').value.trim(), ch = $('#safeChain').value, out = $('#safeOut'), b = $('#safeGo');
      b.disabled = true; b.textContent = 'Scanning…'; out.innerHTML = '<div class="empty shimmer">Reading the chain…</div>';
      try { const r = await S.scan(a, ch, true); if (labSec === 'safety') out.innerHTML = S.card(r); }
      catch (err) { out.innerHTML = `<div class="empty dn">${esc(err.message)}</div>`; }
      finally { b.disabled = false; b.textContent = 'Scan'; }
    };
  };
  // compact badge for the on-chain pool panel
  S.poolBadge = (sym) => {
    const m = OC.meta[sym] || {}, p = OC.parse(sym) || {};
    if (!m.ca || p.chain === 'sim') return '';
    const r = S.cache[p.chain + ':' + m.ca];
    return `<button class="btn sm safe-badge ${r ? GCLS[r.grade] : ''}" data-safety="${esc(m.ca)}" data-chain="${esc(p.chain)}" title="Run the token safety scanner">🛡️ ${r ? 'Safety ' + esc(r.grade) : 'Check safety'}</button>`;
  };
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-safety]'); if (!b) return;
    e.preventDefault(); const ca = b.dataset.safety, ch = b.dataset.chain || 'solana';
    labSec = 'safety'; showTab('lab'); $$('#labNav button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'safety'));
    renderLab().then(() => { const i = $('#safeAddr'), c = $('#safeChain'); if (i) { i.value = ca; if (c) c.value = ch; $('#safeForm').requestSubmit(); } });
  });
  /* Copilot: "is <ca> safe", "rug check <ca>", "safety BONK" */
  S.copilot = async (q) => {
    const lq = q.toLowerCase();
    if (!/\b(safe|safety|rug|rugcheck|honeypot|scam)\b/.test(lq)) return null;
    let ca = (q.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/) || [])[0] || (q.match(/0x[0-9a-fA-F]{40}/) || [])[0], chain = 'solana';
    if (!ca && isOnchain(ST.sel) && OC.meta[ST.sel]) { ca = OC.meta[ST.sel].ca; chain = (OC.parse(ST.sel) || {}).chain || 'solana'; }
    if (ca && S.isEvm(ca)) chain = isOnchain(ST.sel) ? (OC.parse(ST.sel) || {}).chain || 'eth' : 'eth';
    if (!ca) return { txt: 'Paste the token\'s contract address, e.g. `is 7DSi…pump safe`, or open the token in ⬡ On-chain mode and ask again.' };
    try {
      const r = await S.scan(ca, chain);
      const bad = r.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
      return { txt: `**Safety grade ${r.grade}${r.grade !== '?' ? ` (${r.score}/100)` : ''}** for ${r.symbol || 'this token'}.\n\n` + (bad.length ? bad.map((c) => `- ${c.status === 'fail' ? '✕' : '!'} **${c.label}**: ${c.why}`).join('\n') : '- No red flags in the checks I can run.') + '\n\nAutomated screen only, not a guarantee.', acts: [{ l: 'Open full report', c: '__safety ' + chain + '|' + ca }] };
    } catch (e) { return { txt: '⚠️ ' + e.message }; }
  };
  return S;
})();
if (typeof module === 'object' && module.exports) module.exports = Safety;
