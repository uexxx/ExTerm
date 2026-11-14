/* Copyright (c) 2026 ExTerm Labs (@exterm.labs) · Licensed under GNU AGPL-3.0 · https://github.com/uexxx/ExTerm */
/* start the app only after every module above is defined */
boot().catch((e) => { console.error(e); const b = $('#banner'); b.hidden = false; b.textContent = 'Startup error: ' + e.message; });
