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

:: Kill any running processes
echo Cleaning up previous processes...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM QSerial.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Clean release directory
echo Cleaning release directory...
if exist "release" (
    rmdir /S /Q "release" 2>nul
)

echo.

:: Check package.json
if not exist "package.json" (
    echo [ERROR] package.json not found
    echo Please run this script in project root directory
    pause
    exit /b 1
)

:: Set pnpm store to project directory
set PNPM_STORE=%CD%\.pnpm-store

:: Configure pnpm
echo Configuring pnpm...
call pnpm config set store-dir "%PNPM_STORE%" >nul 2>&1
call pnpm config set registry "https://registry.npmmirror.com" >nul 2>&1
echo   Store: %PNPM_STORE%
echo.

:: Install dependencies (offline mode)
echo Installing dependencies - offline mode...
call pnpm install --offline
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo Dependencies installed!
echo.

:: Build project
echo Building project...
call pnpm run build
if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo Build complete!
echo.

:: Package app
echo Packaging Windows app...
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

:: Show output
echo Generated files:
if exist "release" (
    for /r "release" %%f in (*.exe) do (
        echo   - %%f
    )
) else (
    echo   No release directory found
)

echo.
pause
