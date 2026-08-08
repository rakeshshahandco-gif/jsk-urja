/**
 * Provision: sync localhost-tested CRM changes → jsk/development (Render deploy branch).
 *
 * Usage (from repo root, PowerShell):
 *   powershell -ExecutionPolicy Bypass -File scripts/provision-localhost-to-render.ps1
 *   powershell -ExecutionPolicy Bypass -File scripts/provision-localhost-to-render.ps1 -Message "release: ..."
 *
 * Optional env:
 *   RENDER_DEPLOY_HOOK = Render "Deploy Hook" URL for jsk-urja-backend (triggers deploy)
 *
 * Never stages: .env*, whatsapp-auth, temp smoke scripts, debug JSON.
 */
#Requires -Version 5.1
param(
    [string]$Message = 'release: sync localhost-tested changes to development for Render',
    [switch]$SkipBuild,
    [switch]$SkipPush,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

Write-Host "REPO=$Root"
Write-Host "BRANCH=$(git rev-parse --abbrev-ref HEAD)"
Write-Host "HEAD=$(git rev-parse --short HEAD)"

if (-not $SkipBuild) {
    Write-Host 'Building frontend dist for Render committed-bundle path...'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed: $LASTEXITCODE" }
}

$paths = @(
    'backend/src',
    'src',
    'scripts/render-deploy-build.cjs',
    'render.yaml',
    'dist'
)

Write-Host 'Staging product paths (excluding secrets / WhatsApp auth / temp scripts)...'
git add -- @paths

# Unstage anything dangerous that slipped in
$staged = git diff --cached --name-only
$blocked = $staged | Where-Object {
    $_ -match '(^|/)\.env' -or
    $_ -match 'whatsapp-auth' -or
    $_ -match '_tmp_|_browserSmoke|_debugLogin|_impactFocus|browser-smoke-result|debug_ledger'
}
foreach ($b in $blocked) {
    Write-Host "UNSTAGE blocked: $b"
    git restore --staged -- $b
}

$staged = @(git diff --cached --name-only)
if ($staged.Count -eq 0) {
    Write-Host 'Nothing staged — working tree product files already match HEAD (or only blocked files changed).'
} else {
    Write-Host "STAGED_COUNT=$($staged.Count)"
    $staged | Where-Object { $_ -notmatch '^dist/' } | ForEach-Object { Write-Host "  $_" }
    Write-Host "  (+ dist assets: $((@($staged | Where-Object { $_ -match '^dist/' })).Count))"

    if ($DryRun) {
        Write-Host 'DryRun: not committing.'
        exit 0
    }

    $env:GIT_AUTHOR_NAME = if ($env:GIT_AUTHOR_NAME) { $env:GIT_AUTHOR_NAME } else { 'rakeshshahandco-gif' }
    $env:GIT_AUTHOR_EMAIL = if ($env:GIT_AUTHOR_EMAIL) { $env:GIT_AUTHOR_EMAIL } else { 'rakeshshahandco@gmail.com' }
    $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
    $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL

    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw "git commit failed: $LASTEXITCODE" }
}

if (-not $SkipPush -and -not $DryRun) {
    Write-Host 'Pushing HEAD to jsk/development (Render primary branch)...'
    git push jsk HEAD:development
    if ($LASTEXITCODE -ne 0) { throw "git push development failed: $LASTEXITCODE" }
    git push jsk HEAD:production-ma-release 2>$null
    Write-Host "PUSHED_SHA=$(git rev-parse HEAD)"
}

$hook = $env:RENDER_DEPLOY_HOOK
if ($hook -and -not $DryRun) {
    Write-Host 'Triggering Render deploy hook...'
    try {
        Invoke-WebRequest -Uri $hook -Method POST -UseBasicParsing -TimeoutSec 60 | Out-Null
        Write-Host 'RENDER_DEPLOY_HOOK: triggered'
    } catch {
        Write-Host "RENDER_DEPLOY_HOOK failed: $($_.Exception.Message)"
    }
} else {
    Write-Host ''
    Write-Host 'NEXT: Render Dashboard → jsk-urja-backend → Manual Deploy (branch: development)'
    Write-Host '  OR set env RENDER_DEPLOY_HOOK to the service Deploy Hook URL and re-run.'
    Write-Host 'Verify: https://jsk-urja-backend.onrender.com/tasks/list'
    Write-Host 'Verify bundle: page source should reference latest dist/assets/index-*.js from this commit.'
}

Write-Host 'DONE'
