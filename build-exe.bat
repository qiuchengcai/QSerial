@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title QSerial - One-Click EXE Build

echo ============================================
echo   QSerial One-Click EXE Build
echo ============================================
echo.

REM ==========================================
REM  Phase 1: Pre-build Checks
REM ==========================================
echo [1/5] Checking environment...

REM 1.1 Kill related processes to avoid file locks
echo   - Closing running QSerial/Electron processes...
taskkill /f /im QSerial.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM 1.2 Clean previous release output
if exist "release\" (
    echo   - Cleaning previous release directory...
    rmdir /s /q "release" 2>nul
    if exist "release\" (
        echo   [WARN] Cannot clean release\, files may be locked.
        echo   Please close all QSerial windows and retry.
        pause
        exit /b 1
    )
)

REM 1.3 Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [FAIL] Node.js not found in PATH!
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   - Node.js: %%v

REM 1.4 Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo   [FAIL] pnpm not found in PATH!
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('pnpm -v') do echo   - pnpm: %%v

REM 1.5 Check working directory
cd /d "%~dp0"
if not exist "package.json" (
    echo   [FAIL] package.json not found - wrong directory?
    echo   Current dir: %cd%
    pause
    exit /b 1
)
echo   - Project root: %cd%

REM 1.6 Check node_modules
if not exist "node_modules\" (
    echo   [WARN] node_modules not found, running pnpm install...
    call pnpm install --frozen-lockfile
    if %errorlevel% neq 0 (
        echo   [FAIL] pnpm install failed!
        pause
        exit /b 1
    )
)
echo   - Dependencies: OK

echo   [OK] Environment check passed.
echo.

REM ==========================================
REM  Phase 2: Git Status Check
REM ==========================================
echo [2/5] Checking git status...
where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git log --oneline -1') do echo   - Last commit: %%v
    git diff --quiet 2>nul
    if %errorlevel% neq 0 (
        echo   [WARN] Uncommitted changes detected - building from dirty state
    ) else (
        echo   - Working tree: clean
    )
) else (
    echo   - Git not found, skipping
)
echo.

REM ==========================================
REM  Phase 3: Build
REM ==========================================
echo [3/5] Building (this may take 3-5 minutes)...
echo.
set BUILD_START=%time%

call pnpm run package:win
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Build failed with exit code %errorlevel%!
    pause
    exit /b 1
)

set BUILD_END=%time%
echo.
echo   Build started: %BUILD_START%
echo   Build ended:   %BUILD_END%

REM ==========================================
REM  Phase 4: Verify Output
REM ==========================================
echo.
echo [4/5] Verifying build output...

set VERIFY_OK=1

REM 4.1 Check release directory exists
if not exist "release\" (
    echo   [FAIL] release\ directory not found!
    set VERIFY_OK=0
    goto :verify_done
)

REM 4.2 Check installer exe
for %%f in ("release\QSerial Setup *.exe") do (
    set INSTALLER=%%f
    set INSTALLER_SIZE=%%~zf
)
if not defined INSTALLER (
    echo   [FAIL] Installer exe not found!
    set VERIFY_OK=0
) else (
    set /a INSTALLER_MB=!INSTALLER_SIZE! / 1048576
    echo   - Installer: !INSTALLER! (!INSTALLER_MB! MB)
)

REM 4.3 Check portable (win-unpacked)
if not exist "release\win-unpacked\QSerial.exe" (
    echo   [FAIL] Portable QSerial.exe not found in win-unpacked!
    set VERIFY_OK=0
) else (
    for %%f in ("release\win-unpacked\QSerial.exe") do (
        set /a PORTABLE_MB=%%~zf / 1048576
        echo   - Portable: release\win-unpacked\QSerial.exe (!PORTABLE_MB! MB)
    )
)

REM 4.4 Check app.asar exists
if not exist "release\win-unpacked\resources\app.asar" (
    echo   [WARN] app.asar not found - build may be incomplete
) else (
    for %%f in ("release\win-unpacked\resources\app.asar") do (
        set /a ASAR_MB=%%~zf / 1048576
        echo   - App bundle: resources\app.asar (!ASAR_MB! MB)
    )
)

REM 4.5 Check minimum file size (should be > 50MB for a valid build)
for %%f in ("release\win-unpacked\QSerial.exe") do (
    if %%~zf LSS 50000000 (
        echo   [WARN] Portable exe is suspiciously small (%%~zf bytes)
    )
)

:verify_done
if !VERIFY_OK! equ 0 (
    echo.
    echo [FAIL] Build verification failed - output incomplete!
    pause
    exit /b 1
)
echo   [OK] All output files verified.
echo.

REM ==========================================
REM  Phase 5: Summary
REM ==========================================
echo [5/5] ============================================
echo   BUILD SUCCESS
echo ============================================
echo.
echo   Output:
dir /b "release\*.exe" 2>nul
echo.
echo   Portable : release\win-unpacked\QSerial.exe
echo   Installer: release\QSerial Setup *.exe
echo.
echo   To test, run: release\win-unpacked\QSerial.exe
echo.

pause
endlocal
