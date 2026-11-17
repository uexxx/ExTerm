# ExTerm local server for Windows - no Python needed (uses built-in PowerShell + .NET).
# Serves exterm.html and a small allow-listed proxy so stock data, SEC filings and wallet history work live.
param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -AssemblyName System.Net.Http
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }
$allow = @('api.exchange.coinbase.com', 'api.coinbase.com', 'api.kraken.com', 'api.coingecko.com', 'api.alternative.me', 'min-api.cryptocompare.com', 'ethereum-rpc.publicnode.com', 'eth.llamarpc.com', '1rpc.io', 'cloudflare-eth.com', 'blockchain.info', 'mempool.space', 'router.huggingface.co', 'openrouter.ai', 'api.openai.com', 'query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'api.mainnet-beta.solana.com', 'solana-rpc.publicnode.com', 'solana.drpc.org', 'solana.api.onfinality.io', 'api.dexscreener.com', 'api.geckoterminal.com', 'api.binance.com', 'testnet.binance.vision', 'api.bybit.com', 'api-testnet.bybit.com', 'api.alpaca.markets', 'paper-api.alpaca.markets', 'data.alpaca.markets', 'api.x.com', 'api.twitter.com', 'api.stocktwits.com', 'www.reddit.com', 'data.solanatracker.io', 'api.helius.xyz', 'www.sec.gov', 'data.sec.gov', 'efts.sec.gov', 'feeds.finance.yahoo.com', 'production.dataviz.cnn.io')
# v16.1 webhook gateway: loopback (never this launcher's port) or an allow-listed private-LAN https host:port (EXTERM_HOOK_ALLOW)
$hookAllow = @('127.0.0.1', 'localhost', '::1')
$hookSuffix = @(([string]$env:EXTERM_HOOK_ALLOW -split '[\s,]+') | Where-Object { $_ -match '^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{1,5}$' })
$suffix = @('.helius-rpc.com', '.quiknode.pro', '.alchemy.com', '.ankr.com', '.chainstack.com', '.syndica.io', '.shyft.to', '.extrnode.com')
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$handler.AllowAutoRedirect = $false  # security: redirects are re-validated against the allow-list below
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.MaxResponseContentBufferSize = 25MB
$rngb = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rngb)
$token = [Convert]::ToBase64String($rngb).TrimEnd('=').Replace('+','-').Replace('/','_')  # fresh per launch
$rl = [hashtable]::Synchronized(@{ t = [DateTime]::UtcNow; tok = 60.0 })

$listener = $null
for ($p = $Port; $p -lt $Port + 30; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host 'Could not open a local port (8765-8794).'; exit 1 }
$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  ExTerm is running at $url" -ForegroundColor Green
Write-Host "  (PowerShell server - keep this window open while you use the app, close it to stop)"
Write-Host ""

$worker = {
  param($ctx, $root, $allow, $suffix, $client, $token, $rl, $port, $hookAllow, $hookSuffix)
  function RateOk([double]$cost) { [System.Threading.Monitor]::Enter($rl.SyncRoot); try { $now = [DateTime]::UtcNow; $rl.tok = [Math]::Min(60.0, $rl.tok + ($now - $rl.t).TotalSeconds * 30.0); $rl.t = $now; if ($rl.tok -lt $cost) { return $false }; $rl.tok -= $cost; return $true } finally { [System.Threading.Monitor]::Exit($rl.SyncRoot) } }
  $req = $ctx.Request; $res = $ctx.Response
  function Send($code, [byte[]]$bytes, $ctype) { $res.StatusCode = $code; $res.ContentType = $ctype; $res.Headers['Cache-Control'] = 'no-store'; foreach ($kv in @(@('X-Content-Type-Options','nosniff'), @('X-Frame-Options','DENY'), @('Referrer-Policy','no-referrer'), @('Cross-Origin-Opener-Policy','same-origin'), @('Cross-Origin-Resource-Policy','same-origin'))) { $res.Headers[$kv[0]] = $kv[1] }; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length) }
  function SendText($code, $text, $ctype) { Send $code ([Text.Encoding]::UTF8.GetBytes($text)) $ctype }
  try {
    $path = $req.Url.AbsolutePath
    # security: only same-machine pages may use this server (blocks DNS rebinding and drive-by websites)
    $hh = ($req.UserHostName -replace ':\d+$', '').Trim('[', ']').ToLower()
    if (@('localhost', '127.0.0.1', '::1') -notcontains $hh) { SendText 421 'misdirected request' 'text/plain'; return }
    $org = $req.Headers['Origin']
    if ($org) { $ou = $null; if (-not [Uri]::TryCreate($org, [UriKind]::Absolute, [ref]$ou) -or @('localhost', '127.0.0.1', '::1') -notcontains $ou.Host.ToLower() -or $ou.Port -ne $port -or $ou.Scheme -ne 'http') { SendText 403 '{"error":"cross-origin request blocked"}' 'application/json'; return } }
    if (($path.StartsWith('/proxy') -or $path -eq '/hook') -and $req.Headers['X-ExTerm'] -cne $token) { SendText 403 '{"error":"missing or wrong session token"}' 'application/json'; return }
    if (($path -eq '/proxy' -or $path -eq '/hook') -and -not (RateOk 1)) { SendText 429 '{"error":"local rate limit"}' 'application/json'; return }
    if ($path -eq '/hook') {
      $hu = $null; if (-not [Uri]::TryCreate($req.QueryString['u'], [UriKind]::Absolute, [ref]$hu) -or ($hu.Scheme -ne 'https' -and $hu.Scheme -ne 'http') -or $hu.UserInfo) { SendText 403 '{"error":"bad webhook url"}' 'application/json'; return }
      $hh2 = $hu.Host.ToLower().Trim('[', ']'); $hok = ($hookAllow -contains $hh2) -and ($hu.Port -ne $port); if (-not $hok -and $hu.Scheme -eq 'https') { $hok = $hookSuffix -contains ($hh2 + ':' + $hu.Port) }
      if (-not $hok -or $req.HttpMethod -ne 'POST') { SendText 403 '{"error":"webhook target must be 127.0.0.1 / localhost or an allow-listed private-LAN https host:port"}' 'application/json'; return }
      if ($req.ContentLength64 -gt 65536) { SendText 413 '{"error":"signal too large"}' 'application/json'; return }
      $ms2 = New-Object IO.MemoryStream; $buf2 = New-Object byte[] 8192; $tot2 = 0; while (($rd2 = $req.InputStream.Read($buf2, 0, $buf2.Length)) -gt 0) { $tot2 += $rd2; if ($tot2 -gt 65536) { SendText 413 '{"error":"signal too large"}' 'application/json'; return }; $ms2.Write($buf2, 0, $rd2) }  # cap applies to chunked bodies too
      $hm = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $hu); [void]$hm.Headers.TryAddWithoutValidation('User-Agent', 'ExTerm-Signal/1.0')
      $hm.Content = New-Object System.Net.Http.ByteArrayContent(, $ms2.ToArray()); $hct = $req.ContentType; if (-not $hct) { $hct = 'application/json' }; $hm.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse(($hct -split ';')[0].Trim())
      try { $hr = $client.SendAsync($hm).GetAwaiter().GetResult(); if ([int]$hr.StatusCode -ge 300 -and [int]$hr.StatusCode -lt 400) { SendText 403 '{"error":"webhook redirect blocked"}' 'application/json'; return }; Send ([int]$hr.StatusCode) ($hr.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()) 'text/plain' } catch { SendText 502 ('{"error":' + (ConvertTo-Json ([string]$_.Exception.GetBaseException().Message)) + '}') 'application/json' }
      return
    }
    if ($path -eq '/proxy/ping') { SendText 200 'exterm-proxy' 'text/plain'; return }
    if ($path -eq '/proxy') {
      $target = $req.QueryString['u']
      $uri = $null
      if (-not [Uri]::TryCreate($target, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') { SendText 403 '{"error":"host not allowed"}' 'application/json'; return }
      $h = $uri.Host.ToLower(); $ok = $allow -contains $h
      if (-not $ok) { foreach ($s in $suffix) { if ($h.EndsWith($s)) { $ok = $true } } }
      if (-not $ok) { SendText 403 '{"error":"host not allowed"}' 'application/json'; return }
      $method = if ($req.HttpMethod -eq 'POST') { [System.Net.Http.HttpMethod]::Post } else { [System.Net.Http.HttpMethod]::Get }
      $msg = New-Object System.Net.Http.HttpRequestMessage($method, $uri)
      $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      if ($h.EndsWith('sec.gov')) { $c = $req.Headers['X-Contact']; if (-not $c) { $c = 'exterm-user@example.com' }; $ua = "ExTerm personal research tool $c" }
      [void]$msg.Headers.TryAddWithoutValidation('User-Agent', $ua)
      [void]$msg.Headers.TryAddWithoutValidation('Accept', 'application/json, text/xml, */*')
      if ($h.EndsWith('cnn.io')) { [void]$msg.Headers.TryAddWithoutValidation('Referer', 'https://edition.cnn.com/'); [void]$msg.Headers.TryAddWithoutValidation('Origin', 'https://edition.cnn.com') }
      foreach ($k in @('Authorization', 'HTTP-Referer', 'X-Title', 'x-api-key', 'X-MBX-APIKEY', 'API-Key', 'API-Sign', 'X-BAPI-API-KEY', 'X-BAPI-SIGN', 'X-BAPI-TIMESTAMP', 'X-BAPI-RECV-WINDOW', 'APCA-API-KEY-ID', 'APCA-API-SECRET-KEY')) { $v = $req.Headers[$k]; if ($v) { [void]$msg.Headers.TryAddWithoutValidation($k, $v) } }
      if ($req.HttpMethod -eq 'POST') {
        if ($req.ContentLength64 -gt 1MB) { SendText 413 '{"error":"request too large"}' 'application/json'; return }
        $ms = New-Object IO.MemoryStream; $buf = New-Object byte[] 65536; $tot = 0; while (($rd = $req.InputStream.Read($buf, 0, $buf.Length)) -gt 0) { $tot += $rd; if ($tot -gt 1MB) { SendText 413 '{"error":"request too large"}' 'application/json'; return }; $ms.Write($buf, 0, $rd) }  # cap applies to chunked bodies too
        $msg.Content = New-Object System.Net.Http.ByteArrayContent(, $ms.ToArray())
        $ct = $req.ContentType; if (-not $ct) { $ct = 'application/json' }
        $msg.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse(($ct -split ';')[0].Trim())
      }
      try {
        $r = $client.SendAsync($msg).GetAwaiter().GetResult()
        $hops = 0
        while ([int]$r.StatusCode -ge 300 -and [int]$r.StatusCode -lt 400 -and $r.Headers.Location -and $hops -lt 3) {
          $loc = $r.Headers.Location; if (-not $loc.IsAbsoluteUri) { $loc = New-Object Uri($uri, $loc) }
          $lh = $loc.Host.ToLower(); $lok = $allow -contains $lh; if (-not $lok) { foreach ($s2 in $suffix) { if ($lh.EndsWith($s2)) { $lok = $true } } }
          if ($loc.Scheme -ne 'https' -or -not $lok) { SendText 403 '{"error":"redirect to a non-allow-listed host blocked"}' 'application/json'; return }
          $m2 = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $loc); [void]$m2.Headers.TryAddWithoutValidation('User-Agent', $ua)
          $r = $client.SendAsync($m2).GetAwaiter().GetResult(); $hops++
        }
        $bytes = $r.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $cth = $r.Content.Headers.ContentType; $ctype = if ($cth) { $cth.ToString() } else { 'application/json' }
        Send ([int]$r.StatusCode) $bytes $ctype
      } catch { SendText 502 ('{"error":' + (ConvertTo-Json ([string]$_.Exception.GetBaseException().Message)) + '}') 'application/json' }
      return
    }
    if ($path -eq '/' -or $path -eq '/index.html' -or $path -eq '/exterm.html') {
      $page = [IO.File]::ReadAllText((Join-Path $root 'exterm.html')); $page = $page.Replace('<meta name="referrer"', '<meta name="nt-token" content="' + $token + '">' + "`n" + '<meta name="referrer"')
      Send 200 ([Text.Encoding]::UTF8.GetBytes($page)) 'text/html; charset=utf-8'; return
    }
    SendText 404 'not found' 'text/plain'
  } catch { try { SendText 500 ('error: ' + $_.Exception.Message) 'text/plain' } catch {} }
  finally { try { $res.Close() } catch {} }
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 24); $pool.Open()
$jobs = New-Object System.Collections.ArrayList

if (-not $NoBrowser) {
  $chrome = $null
  foreach ($k in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')) {
    try { $v = (Get-ItemProperty $k -ErrorAction Stop).'(default)'; if ($v -and (Test-Path $v)) { $chrome = $v; break } } catch {}
  }
  if (-not $chrome) { foreach ($b in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) { if ($b) { $c = Join-Path $b 'Google\Chrome\Application\chrome.exe'; if (Test-Path $c) { $chrome = $c; break } } } }
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $url } else { Write-Host 'Chrome not found - opening your default browser.'; Start-Process $url }
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $ps = [PowerShell]::Create(); $ps.RunspacePool = $pool
    [void]$ps.AddScript($worker).AddArgument($ctx).AddArgument($root).AddArgument($allow).AddArgument($suffix).AddArgument($client).AddArgument($token).AddArgument($rl).AddArgument($Port).AddArgument($hookAllow).AddArgument($hookSuffix)
    [void]$jobs.Add(@{ ps = $ps; h = $ps.BeginInvoke() })
    for ($i = $jobs.Count - 1; $i -ge 0; $i--) { $j = $jobs[$i]; if ($j.h.IsCompleted) { try { $j.ps.EndInvoke($j.h) } catch {}; $j.ps.Dispose(); $jobs.RemoveAt($i) } }
  }
} finally { $listener.Stop(); $pool.Close() }
