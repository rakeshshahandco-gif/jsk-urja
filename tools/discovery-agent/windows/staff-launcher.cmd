@echo off
setlocal EnableExtensions
rem Staff launcher. No CMD window stays open for the user.
rem Bundled Node is used when present. System Node is a developer fallback only.

set "ROOT=%~dp0"
if exist "%ROOT%runtime\node.exe" (
  set "NODE_EXE=%ROOT%runtime\node.exe"
) else if exist "%ROOT%..\runtime\node.exe" (
  set "NODE_EXE=%ROOT%..\runtime\node.exe"
) else (
  set "NODE_EXE="
  for /f "delims=" %%I in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  exit /b 1
)

if exist "%ROOT%src\index.js" (
  set "AGENT_JS=%ROOT%src\index.js"
) else if exist "%ROOT%..\src\index.js" (
  set "AGENT_JS=%ROOT%..\src\index.js"
  set "ROOT=%ROOT%..\"
) else (
  exit /b 1
)

set "JSK_DISCOVERY_AGENT_INSTALLED=1"
if defined LOCALAPPDATA (
  if exist "%LOCALAPPDATA%\JSK URJA\Discovery Agent\profiles" (
    set "DISCOVERY_AGENT_PROFILE_DIR=%LOCALAPPDATA%\JSK URJA\Discovery Agent\profiles"
  ) else (
    set "DISCOVERY_AGENT_PROFILE_DIR=%LOCALAPPDATA%\JSK URJA\Extraction Agent\profiles"
  )
)
set "DISCOVERY_AGENT_VERSION=1.1.1"
set "JSK_EXTRACTION_AGENT_VERSION=1.1.1"

cd /d "%ROOT%"
start "" /MIN "%NODE_EXE%" "%AGENT_JS%" staff
exit /b 0
