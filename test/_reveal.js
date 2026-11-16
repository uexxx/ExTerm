// v15.5 split Settings into 4 tabs (General · Chart · Execution · Security): a control in a closed tab is hidden, and the
// Settings view is built lazily on first open. Older suites act on Settings ids directly, so before every action reveal
// the tab holding the target (at action time, when the view exists). No-op for anything outside Settings.
module.exports = (page) => {
  for (const m of ['click', 'fill', 'check', 'uncheck', 'selectOption', 'dispatchEvent', 'setInputFiles', 'type', 'press', 'hover', 'focus']) {
    const f = page[m].bind(page);
    page[m] = async (sel, ...a) => {
      if (typeof sel === 'string') await page.evaluate((s) => { try { const e = document.querySelector(s); if (e && e.closest('#setBody') && typeof V155S !== 'undefined' && V155S.reveal) V155S.reveal(s); } catch (err) { /* not a CSS selector */ } }, sel).catch(() => {});
      return f(sel, ...a);
    };
  }
  return page;
};
