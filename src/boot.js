/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
/* start the app only after every module above is defined */
boot().catch((e) => { console.error(e); const b = $('#banner'); b.hidden = false; b.textContent = 'Startup error: ' + e.message; });
