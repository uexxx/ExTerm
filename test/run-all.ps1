# Windows/PowerShell twin of run-all.sh: runs every maintained ExTerm suite.
# Needs Python 3, Node 18+, Playwright + esbuild in C:\opt\npm-tools (npm i --prefix C:\opt\npm-tools playwright esbuild) and Google Chrome.
# Usage: powershell -ExecutionPolicy Bypass -File test\run-all.ps1 [-Only unit|launcher|e2e] [-Filter name]
param([string]$Only = '', [string]$Filter = '')
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $env:CHROME_PATH) { $env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$env:PYTHONIOENCODING = 'utf-8'
python build.py | Out-Null; if ($LASTEXITCODE) { Write-Output 'BUILD FAILED'; exit 1 }
$data = Join-Path $env:TEMP ('exterm-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory $data | Out-Null
$env:EXTERM_DATA = $data
$srv = Start-Process python -ArgumentList 'serve.py', '8765', '--no-browser', '--no-state' -PassThru -WindowStyle Hidden
$mock = Start-Process python -ArgumentList 'test/mock_server.py', 'src/wallets.json' -PassThru -WindowStyle Hidden
Remove-Item Env:EXTERM_DATA
Start-Sleep -Seconds 2
$script:fail = 0
function Run([string]$name, [string]$exe, [string[]]$argv) {
  if ($Filter -and $name -notlike "*$Filter*") { return }
  $out = (& $exe @argv 2>&1 | ForEach-Object { "$_" }) -join "`n"; $code = $LASTEXITCODE
  $sum = ($out -split "`n" | Where-Object { $_ -match '^[0-9]+/[0-9]+|passed|strategies pass|strategy files valid' } | Select-Object -Last 1)
  if ($code -ne 0 -or $out -match '(?m)^(FAIL|CRASH)|E2E FAIL') {
    Write-Output "FAILED $name  $sum (exit $code)"; $fl = @($out -split "`n" | Where-Object { $_ -match '^(FAIL|CRASH)' }); if (-not $fl.Count) { $fl = @($out -split "`n" | Select-Object -Last 8) }; $fl | Select-Object -First 8 | ForEach-Object { Write-Output "    $_" }; $script:fail = 1
  } else { Write-Output "ok     $name  $sum" }
}
try {
  if (-not $Only -or $Only -eq 'unit') {
    Write-Output '-- unit'
    foreach ($t in 'core', 'strategies', 'validate', 'robust', 'bigdata', 'solana', 'v12', 'v13', 'v14', 'v15', 'v15p2', 'v15p3', 'v15p4', 'v15p5', 'world', 'v151', 'v152', 'v153', 'v154', 'v155', 'v156', 'v157', 'v160') { if (Test-Path "test/$t.test.js") { Run "$t.test.js" node @("test/$t.test.js") } }
    Run 'community strategies' node @('tools/validate-strategies.js')
    Run 'launcher/page strategy parity' node @('test/v13_parity.js')
  }
  if (-not $Only -or $Only -eq 'launcher') {
    Write-Output '-- launcher'
    foreach ($t in 'redirect_e2e', 'v12_server_test', 'v13_server_test', 'v131_server_test', 'v14_server_test', 'v15_server_test', 'v15p2_server_test', 'v15p3_server_test', 'v15p4_server_test', 'v15p5_server_test', 'v152_server_test', 'v154_server_test') { if (Test-Path "test/$t.py") { Run "$t.py" python @("test/$t.py") } }
  }
  if (-not $Only -or $Only -eq 'e2e') {
    Write-Output '-- browser end-to-end'
    foreach ($t in 'fulltest', 'deep_a', 'deep_b', 'pro', 'oc', 'vault', 'sec_xss', 'smoke', 'smoke2', 'ctl', 'ind', 'draw', 'e2e5', 'e2e_pf', 'e2e_quick', 'perf', 'v12_e2e', 'v13_e2e', 'v131_e2e', 'v14_e2e', 'v15p2_e2e', 'v15p3_e2e', 'v15p4_e2e', 'v15p5_e2e', 'world_e2e', 'v151_e2e', 'v152_e2e', 'v153_e2e', 'v154_e2e', 'v155_e2e', 'v155s_e2e', 'v156_e2e', 'v157_e2e', 'v160_e2e', 'harden_smoke') { if (Test-Path "test/$t.js") { Run "$t.js" node @("test/$t.js") } }
  }
} finally {
  foreach ($p in $srv, $mock) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
  Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
}
if ($script:fail -eq 0) { Write-Output 'ALL SUITES PASSED'; exit 0 } else { Write-Output 'SOME SUITES FAILED'; exit 1 }
