@echo off
chcp 65001 >nul
title QSerial - EXE Packaging

echo ============================================
echo   QSerial One-Click EXE Build
echo ============================================
echo.

REM Step 1: Build
echo [1/3] Building project...
call pnpm run build
if %errorlevel% neq 0 (
    echo [FAIL] Build failed!
    pause
    exit /b 1
)
echo [OK] Build complete.
echo.

REM Step 2: Package
echo [2/3] Packaging with electron-builder...
call npx electron-builder --win nsis portable -c electron-builder.config.cjs
if %errorlevel% neq 0 (
    echo [FAIL] Packaging failed!
    pause
    exit /b 1
)
echo [OK] Packaging complete.
echo.

REM Step 3: Set Icon
echo [3/3] Embedding product icon...
call node scripts/set-icon.cjs release/win-unpacked/QSerial.exe build/icon.ico
call node scripts/ensure-icons.cjs

echo.
echo ============================================
echo   Build Complete!
echo ============================================
echo.
echo Output files:
dir /b release\*.exe 2>nul
echo.
echo   Portable : release\QSerial-*-x64-win-portable.exe
echo   Installer: release\QSerial Setup *.exe
echo.
pause
