@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title OpenGrokBot

rem Always run from this checkout, including when opened from Explorer or a shortcut.
pushd "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot open the project directory.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 goto :missing_node
call node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto :missing_node

where pnpm >nul 2>&1
if errorlevel 1 goto :missing_pnpm

echo OpenGrokBot - keep this window open while using the app.
echo After startup, open the sign-in URL printed by the gateway.
echo.

rem CALL returns control here when pnpm itself is a Windows .cmd shim.
set "STEP=Dependency installation"
echo [1/3] Installing dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 goto :failed

set "STEP=Project build"
echo [2/3] Building the project...
call pnpm build
if errorlevel 1 goto :failed

set "STEP=Gateway startup"
echo [3/3] Starting OpenGrokBot. Press Ctrl+C to stop.
call pnpm start
if errorlevel 1 goto :failed

popd
exit /b 0

:missing_node
echo [ERROR] Node.js 22 or newer is required. Install it and reopen this launcher.
set "EXIT_CODE=1"
goto :finish_error

:missing_pnpm
echo [ERROR] pnpm is required. Install it with: npm install -g pnpm@10.33.2
echo Then reopen this launcher.
set "EXIT_CODE=1"
goto :finish_error

:failed
set "EXIT_CODE=%errorlevel%"
echo.
echo [ERROR] %STEP% failed with exit code %EXIT_CODE%. See the output above.

:finish_error
echo Press any key to close this window...
pause >nul
popd
exit /b %EXIT_CODE%
