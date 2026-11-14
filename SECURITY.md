# Security policy

## Reporting a vulnerability
Please report privately, not in a public issue: **Security tab → Report a vulnerability** on this repository.
(Maintainer: turn this on under **Settings → Code security → Private vulnerability reporting**.)

Include:
- the affected file and version (see `dist/SHA256SUMS.txt`),
- steps to reproduce on a local copy (please don't test against other people's machines or third-party APIs),
- what an attacker gains.

You'll get a reply within 7 days. Fixes ship in a new release with updated checksums, and reporters are credited unless they prefer not to be.

## Verify your download
Every release ships `dist/SHA256SUMS.txt`. Check your files match before running them:

| System | Command (run inside the `dist` folder) |
|---|---|
| Windows (PowerShell) | `Get-FileHash exterm.html -Algorithm SHA256` then compare with the line in `SHA256SUMS.txt` |
| macOS | `shasum -a 256 -c SHA256SUMS.txt` |
| Linux | `sha256sum -c SHA256SUMS.txt` |

Also compare `SHA256SUMS.txt` itself with the checksums printed in the GitHub release notes.

## Scope and design
- Paper trading only: nothing signs or sends real orders.
- API keys are never stored in plain text: this-session-only by default, or encrypted with your passphrase (AES-256-GCM).
- Strict CSP (single hashed script), locked-down local launcher (per-launch token, Host/Origin checks, allow-list with redirect re-validation, rate and size limits).
- Shared strategy files are data, not code: strict schema, interpreted, validated in CI.
- Background alerts: notification secrets stay on your computer (`~/.exterm/alerts.json`, owner-only), are never sent back to the page, and messages go only to Telegram's or Discord's official endpoints. No redirects are followed.
- The local-AI bridge talks only to Ollama on `127.0.0.1:11434`, on three fixed routes.

The latest audit is in [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md) and [`security-findings.json`](security-findings.json).
