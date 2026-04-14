@echo off
chcp 65001 >nul
title QSerial Build Debug
cd /d "%~dp0"

echo ==========================================
echo QSerial Debug Build Script
echo ==========================================
echo.
echo Current Directory: %CD%
echo.

:: Check node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    echo Please install Node.js 20.x LTS first
    pause
    exit /b 1
)
echo [OK] Node.js installed
node --version

:: Check pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found
    echo Please install: npm install -g pnpm
    pause
    exit /b 1
)
echo [OK] pnpm installed
pnpm --version

echo.
echo Checking package.json...
if not exist "package.json" (
    echo [ERROR] package.json not found
    pause
    exit /b 1
)
echo [OK] package.json exists

echo.
echo Checking offline package...
if exist "offline-package" (
    echo [OK] Offline package found, will use offline mode
    dir /b offline-package
) else (
    echo [INFO] Offline package not found, will use online mode
)

echo.
echo ==========================================
echo Environment check complete, ready to build
echo ==========================================
echo.
pause

:: Run simple build script
call build-simple.bat
