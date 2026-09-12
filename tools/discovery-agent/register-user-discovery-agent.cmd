@echo off
setlocal EnableExtensions
rem Bind this Windows PC to the logged-in CRM user's Discovery Agent token.
rem Does NOT print DISCOVERY_AGENT_TOKEN. Does not overwrite an existing token.
rem Usage: run after creating a token via CRM → Data Extractor → Discovery Agent → Register this PC.

cd /d "%~dp0"

set "ENVFILE=%~dp0.env.local"
if /I "%~1"=="production" set "ENVFILE=%~dp0.env.production.local"

if not exist "%ENVFILE%" (
  echo ERROR: missing %ENVFILE%
  echo Create it with CRM_BASE_URL and DISCOVERY_AGENT_TOKEN first. Token is never printed here.
  exit /b 1
)

for /f "delims=" %%H in ('hostname') do set "HOST=%%H"
if not defined HOST set "HOST=Windows-PC"

findstr /b /c:"DISCOVERY_AGENT_DEVICE_ID=" "%ENVFILE%" >nul
if errorlevel 1 (
  echo DISCOVERY_AGENT_DEVICE_ID=%HOST%>> "%ENVFILE%"
)

findstr /b /c:"DISCOVERY_AGENT_DEVICE_NAME=" "%ENVFILE%" >nul
if errorlevel 1 (
  echo DISCOVERY_AGENT_DEVICE_NAME=%HOST%>> "%ENVFILE%"
)

echo Device identity is set for %HOST%.
echo Start the agent with start-production-discovery-agent.cmd or: node src/index.js listen
echo Token was not printed.
exit /b 0
