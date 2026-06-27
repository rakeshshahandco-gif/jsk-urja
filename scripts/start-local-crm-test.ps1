# JSK CRM LOCAL TEST - run: .\scripts\start-local-crm-test.ps1
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^192\.168\.' } | Select-Object -First 1).IPAddress
Write-Host "PC browser: http://localhost:4000"
Write-Host "Phone (Wi-Fi): http://${LanIp}:4000"
Write-Host "LAN IP: $LanIp"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$ProjectRoot\backend'; npm run dev"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$ProjectRoot'; npm run dev"
Write-Host "Started backend + frontend in new windows. Wait 30s then open localhost:4000"
