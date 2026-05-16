@echo off
title QSerial Dev
cd /d "%~dp0"

echo.
echo ==========================================
echo   QSerial Dev Mode
echo ==========================================
echo.

REM check bash
where bash >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git Bash not found.
    echo Install: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo Starting dev environment...
echo.

bash "%~dp0dev.sh"
set ERR=%errorlevel%

if %ERR% neq 0 (
    echo.
    echo Dev exited with code %ERR%
    echo.
    pause
)
