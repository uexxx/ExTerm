/* ExTerm key vault: API keys are never stored in plain text.
   Default: keys live in sessionStorage only (gone when the browser closes).
   Optional: keys are saved encrypted with a passphrase you choose (WebCrypto PBKDF2-SHA256, 600k rounds → AES-256-GCM).
   The derived key stays in memory for this tab only; the passphrase itself is never stored. */
const KeyVault = (() => {
  const V = { key: null, LS: 'novaterm.vault', ITER: 600000, timer: 0 };
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  V.supported = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  V.exists = () => { try { const j = JSON.parse(localStorage.getItem(V.LS) || 'null'); return !!(j && j.ct && j.salt && j.iv); } catch (e) { return false; } };
  V.unlocked = () => !!V.key;
  async function derive(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function write(secrets) {
    const rec = JSON.parse(localStorage.getItem(V.LS) || 'null'); if (!rec || !V.key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, V.key, te.encode(JSON.stringify(secrets || {}))));
    localStorage.setItem(V.LS, JSON.stringify({ v: 1, iter: rec.iter, salt: rec.salt, iv: b64(iv), ct: b64(ct) }));
  }
  /** create (or re-key) the vault with a new passphrase */
  V.create = async (pass, secrets) => {
    if (!V.supported()) throw new Error('This browser context has no WebCrypto (open ExTerm with the launcher)');
    if (String(pass).length < 8) throw new Error('Use a passphrase of at least 8 characters');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    V.key = await derive(pass, salt, V.ITER);
    localStorage.setItem(V.LS, JSON.stringify({ v: 1, iter: V.ITER, salt: b64(salt), iv: '', ct: 'x' }));
    await write(secrets);
  };
  /** unlock with the passphrase → the saved secrets object (throws on a wrong passphrase) */
  V.unlock = async (pass) => {
    const rec = JSON.parse(localStorage.getItem(V.LS) || 'null'); if (!rec) throw new Error('No saved keys');
    const k = await derive(pass, unb64(rec.salt), rec.iter || V.ITER);
    let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, k, unb64(rec.ct)); } catch (e) { throw new Error('Wrong passphrase'); }
    V.key = k; return JSON.parse(td.decode(pt));
  };
  /** re-encrypt after a settings change (debounced); no-op while locked */
  V.saveLater = (secrets) => { if (!V.key) return; clearTimeout(V.timer); V.timer = setTimeout(() => { write(secrets).catch((e) => console.warn('vault save', e)); }, 300); };
  V.clear = () => { V.key = null; try { localStorage.removeItem(V.LS); } catch (e) { /* storage blocked */ } };
  V.lock = () => { V.key = null; };
  return V;
})();
