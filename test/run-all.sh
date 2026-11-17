#!/usr/bin/env bash
# Runs every maintained ExTerm test suite. Needs Python 3, Node 18+, Playwright and Google Chrome.
# Starts the launcher (port 8765) and the mock Solana/DEX/SEC server (port 8899) itself; no external network is used.
set -u
cd "$(dirname "$0")/.."
python3 build.py >/dev/null || exit 1
DATA=$(mktemp -d)
EXTERM_DATA="$DATA" python3 serve.py 8765 --no-browser --no-state >/dev/null 2>&1 & SRV=$!
python3 test/mock_server.py src/wallets.json >/dev/null 2>&1 & MOCK=$!
trap 'kill $SRV $MOCK 2>/dev/null; rm -rf "$DATA"' EXIT
sleep 2
fail=0
run() { local name=$1; shift; local out; out=$("$@" 2>&1); local code=$?; local sum; sum=$(echo "$out" | grep -E '^[0-9]+/[0-9]+|passed|strategies pass|strategy files valid' | tail -1)
  if [ $code -ne 0 ] || echo "$out" | grep -qE '^(FAIL|CRASH)|E2E FAIL|EXECUTIONS: [^n]'; then echo "✗ $name  $sum"; echo "$out" | grep -E '^(FAIL|CRASH)' | head -5; fail=1; else echo "✓ $name  $sum"; fi; }
echo "── unit"
for t in core strategies validate robust bigdata solana v12 v13 v14 v15 v15p2 v15p3 v15p4 v15p5 world v151 v152 v153 v154 v155 v156 v157 v160 v161 v162; do run "$t.test.js" node test/$t.test.js; done
run "community strategies" node tools/validate-strategies.js
run "launcher ↔ page strategy parity" node test/v13_parity.js
echo "── launcher"
run "redirect protection" python3 test/redirect_e2e.py
run "v12 launcher (alerts + Ollama bridge)" python3 test/v12_server_test.py
run "v13 launcher (background bots, notify, PWA)" python3 test/v13_server_test.py
run "v13.1 launcher (saved state)" python3 test/v131_server_test.py
run "v14 launcher (update check)" python3 test/v14_server_test.py
run "v15 launcher (price feed, data migration)" python3 test/v15_server_test.py
run "v15 phase 2 launcher (system doctor)" python3 test/v15p2_server_test.py
run "v15 phase 3 launcher (World Monitor, macro shield, tick buffer)" python3 test/v15p3_server_test.py
run "v15.2 launcher (health, integrity, alert cards)" python3 test/v152_server_test.py
run "v15.4 launcher (on-chain leaderboard proxy)" python3 test/v154_server_test.py
run "v16.1 launcher (localhost-only webhook gateway)" python3 test/v161_server_test.py
echo "── browser end-to-end"
for t in fulltest deep_a deep_b pro oc vault sec_xss smoke smoke2 ctl ind draw e2e5 e2e_pf e2e_quick perf v12_e2e v13_e2e v131_e2e v14_e2e v15p2_e2e v15p3_e2e v15p4_e2e v15p5_e2e world_e2e v151_e2e v152_e2e v153_e2e v154_e2e v155_e2e v155s_e2e v156_e2e v157_e2e v160_e2e v161_e2e v162_e2e; do run "$t.js" node test/$t.js; done
[ -f dist/exterm.min.html ] && run "harden_smoke.js" node test/harden_smoke.js
[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $fail
