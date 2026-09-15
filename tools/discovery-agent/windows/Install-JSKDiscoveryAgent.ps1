#Requires -Version 5.1
param(
    [string]$PayloadDir = "",
    [switch]$NoElevate
)

$ErrorActionPreference = "Stop"
$ProductName = "JSK Discovery Agent"
$Publisher = "JSK URJA"
$DesiredRoot = Join-Path ${env:ProgramFiles} "JSK URJA\Discovery Agent"
$FallbackRoot = Join-Path $env:LOCALAPPDATA "JSK URJA\Discovery Agent"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $PayloadDir) {
    $PayloadDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (Test-Path (Join-Path $PayloadDir "payload")) {
        $PayloadDir = Join-Path $PayloadDir "payload"
    }
}

if (-not (Test-Path (Join-Path $PayloadDir "src\index.js"))) {
    throw "Discovery Agent payload not found next to the installer."
}

$InstallRoot = $DesiredRoot
if (-not (Test-Admin)) {
    if (-not $NoElevate) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "powershell.exe"
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -PayloadDir `"$PayloadDir`" -NoElevate"
        $psi.Verb = "runas"
        try {
            [Diagnostics.Process]::Start($psi) | Out-Null
            exit 0
        } catch {
            $InstallRoot = $FallbackRoot
        }
    } else {
        $InstallRoot = $FallbackRoot
    }
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item -Path (Join-Path $PayloadDir "*") -Destination $InstallRoot -Recurse -Force

$launcher = Join-Path $InstallRoot "windows\staff-launcher.cmd"
if (-not (Test-Path $launcher)) {
    $launcher = Join-Path $InstallRoot "staff-launcher.cmd"
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "$ProductName.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath = $launcher
$sc.WorkingDirectory = $InstallRoot
$sc.WindowStyle = 7
$sc.Description = $ProductName
$sc.Save()

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name $ProductName -Value "`"$launcher`""

$classes = "HKCU:\Software\Classes\jskdiscovery"
New-Item -Path $classes -Force | Out-Null
Set-ItemProperty -Path $classes -Name "(default)" -Value "URL:JSK Discovery Agent"
New-ItemProperty -Path $classes -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$classes\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$classes\shell\open\command" -Name "(default)" -Value "`"$launcher`""

$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) $Publisher
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
$menuLnk = Join-Path $startMenu "$ProductName.lnk"
$msc = $shell.CreateShortcut($menuLnk)
$msc.TargetPath = $launcher
$msc.WorkingDirectory = $InstallRoot
$msc.WindowStyle = 7
$msc.Save()

Start-Process -FilePath $launcher -WindowStyle Minimized
Write-Host "$ProductName installed. Open CRM and click Connect This PC."
