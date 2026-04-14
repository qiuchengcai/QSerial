@echo off
chcp 65001 >nul
title QSerial Build
cd /d "%~dp0"

echo ==========================================
echo QSerial Build Script
echo ==========================================
echo.
echo Current Directory: %CD%
echo.

:: Check package.json
if not exist "package.json" (
    echo [ERROR] package.json not found
    echo Please run this script in project root directory
    pause
    exit /b 1
)

echo [1/4] Checking environment...
if exist "offline-package" (
    echo        Offline Mode
) else (
    echo        Online Mode
)

echo.
echo [2/4] Installing dependencies...
if exist "offline-package" (
    call pnpm install --offline
) else (
    call pnpm install
)

if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [3/4] Building project...
call pnpm run build

if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [4/4] Packaging app...
call pnpm run package:win

if errorlevel 1 (
    echo [ERROR] Package failed
    pause
    exit /b 1
)

echo.
echo ==========================================
echo Build Complete!
echo ==========================================
echo.

if exist "release" (
    echo Generated files:
    dir /s /b release\*.exe 2>nul
)

echo.
pause
