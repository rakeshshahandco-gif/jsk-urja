#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentRoot = Resolve-Path (Join-Path $here "..")
$cache = Join-Path $here "cache"
$payload = Join-Path $here "payload"
$dist = Join-Path $here "dist"
New-Item -ItemType Directory -Force -Path $cache, $payload, $dist | Out-Null

Write-Host "Preparing JSK Extraction Agent staff payload..."

if (Test-Path $payload) {
    Get-ChildItem $payload -Force | Remove-Item -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $payload | Out-Null

Copy-Item (Join-Path $agentRoot "package.json") $payload
Copy-Item (Join-Path $agentRoot "package-lock.json") $payload -ErrorAction SilentlyContinue
Copy-Item (Join-Path $agentRoot "src") (Join-Path $payload "src") -Recurse
Get-ChildItem (Join-Path $payload "src") -Recurse -File | Where-Object {
    $_.Name -like "_tmp*" -or $_.Name -like "*_tmp_*" -or $_.Name -like "_tmp_fb_*"
} | ForEach-Object {
    Write-Host ("Excluding harness: " + $_.FullName)
    Remove-Item $_.FullName -Force
}
$fbDirect = Join-Path $payload "src\sources\facebookDirectAgent.js"
$indexJs = Join-Path $payload "src\index.js"
$crmJs = Join-Path $payload "src\crmClient.js"
if (-not (Test-Path $fbDirect)) { throw "payload missing src/sources/facebookDirectAgent.js" }
if (-not (Select-String -Path $indexJs -Pattern "pollFacebookDirect" -Quiet)) { throw "payload index.js missing Facebook Direct poller" }
if (-not (Select-String -Path $crmJs -Pattern "pollFacebookDirect" -Quiet)) { throw "payload crmClient.js missing GET /jobs/poll" }
New-Item -ItemType Directory -Force -Path (Join-Path $payload "windows") | Out-Null
Copy-Item (Join-Path $here "staff-launcher.cmd") (Join-Path $payload "windows\staff-launcher.cmd")
Copy-Item (Join-Path $here "Install-JSKDiscoveryAgent.ps1") (Join-Path $payload "windows\Install-JSKDiscoveryAgent.ps1")

Push-Location $payload
try {
    npm install --omit=dev --no-audit --no-fund
} finally {
    Pop-Location
}

$nodeVersion = "v20.18.1"
$nodeZip = Join-Path $cache "node-$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
    Write-Host "Downloading portable Node $nodeVersion (not committed)..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}
$nodeExtract = Join-Path $cache "node-$nodeVersion-win-x64"
if (-not (Test-Path (Join-Path $nodeExtract "node.exe"))) {
    Expand-Archive -Path $nodeZip -DestinationPath $cache -Force
}
$runtime = Join-Path $payload "runtime"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Copy-Item (Join-Path $nodeExtract "node.exe") (Join-Path $runtime "node.exe") -Force

# Do not copy Playwright browsers. Staff PCs use installed Chrome/Edge.
Set-Content -Path (Join-Path $payload "README-STAFF.txt") -Value @"
JSK Discovery Agent
Install once, then open CRM and click Connect This PC.
Google Chrome or Microsoft Edge must already be installed.
Do not edit .env files. Do not copy tokens.
"@

$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$setupPath = Join-Path $dist "JSK-Extraction-Agent-Setup.exe"
if ($iscc) {
    Write-Host "Compiling Setup.exe with Inno Setup..."
    & $iscc (Join-Path $here "JSK-Discovery-Agent-Setup.iss")
} else {
    Write-Host "Inno Setup not found. Building folder installer + zip."
    $stage = Join-Path $dist "JSK-Discovery-Agent"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    Copy-Item $payload $stage -Recurse
    Copy-Item (Join-Path $here "Install-JSKDiscoveryAgent.ps1") (Join-Path $stage "Install-JSKDiscoveryAgent.ps1")
    $zip = Join-Path $dist "JSK-Discovery-Agent-Staff.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $stage -DestinationPath $zip
    $cmd = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-JSKDiscoveryAgent.ps1"
"@
    Set-Content -Path (Join-Path $stage "Install.cmd") -Value $cmd
    # Lightweight Setup.exe wrapper: cmd that extracts is not an EXE.
    # Copy Install.cmd as the staff entry until Inno Setup is available.
    Copy-Item (Join-Path $stage "Install.cmd") (Join-Path $dist "Install-JSK-Discovery-Agent.cmd")
}

Get-ChildItem $dist | ForEach-Object { Write-Host ("Built: " + $_.FullName) }
Write-Host "Staff payload uses bundled Node + system Chrome. Manual .env remains a developer fallback."
