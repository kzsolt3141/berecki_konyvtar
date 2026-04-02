@echo off
setlocal

REM Run from this script's directory (project root).
pushd "%~dp0"

echo [1/4] Switching to main branch...
git checkout main
if errorlevel 1 goto :fail

echo [2/4] Pulling latest from origin/main...
git pull origin main
if errorlevel 1 goto :fail

echo [3/4] Installing/updating dependencies...
call npm install
if errorlevel 1 goto :fail

echo [4/4] Starting the project...
call npm start
if errorlevel 1 goto :fail

goto :eof

:fail
echo.
echo Script failed with exit code %errorlevel%.
pause
exit /b %errorlevel%
