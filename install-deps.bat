@echo off
chcp 65001 >nul
title QSerial Dependency Installer
cd /d "%~dp0"

echo ==========================================
echo QSerial Dependency Installer
echo ==========================================
echo.
echo This script will download all dependencies
echo for offline development.
echo.

:: Check prerequisites
echo Checking prerequisites...

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 20.x first.
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found. Installing pnpm...
    npm install -g pnpm
    if errorlevel 1 (
        echo [ERROR] Failed to install pnpm
        pause
        exit /b 1
    )
)

echo   Node.js: OK
echo   pnpm: OK
echo.

:: Set pnpm store to project directory
set PNPM_STORE=%CD%\.pnpm-store
echo Setting pnpm store to: %PNPM_STORE%

:: Configure pnpm
call pnpm config set store-dir "%PNPM_STORE%" >nul 2>&1
call pnpm config set registry "https://registry.npmmirror.com" >nul 2>&1
echo   Registry: https://registry.npmmirror.com
echo.

:: Clean existing dependencies
echo Cleaning existing dependencies...
if exist "node_modules" (
    rmdir /S /Q "node_modules" 2>nul
)
if exist "packages\main\node_modules" (
    rmdir /S /Q "packages\main\node_modules" 2>nul
)
if exist "packages\renderer\node_modules" (
    rmdir /S /Q "packages\renderer\node_modules" 2>nul
)
if exist "packages\shared\node_modules" (
    rmdir /S /Q "packages\shared\node_modules" 2>nul
)
echo   Cleaned!
echo.

:: Install dependencies
echo Installing dependencies from lockfile...
echo This may take several minutes...
echo.

call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    echo Trying without frozen-lockfile...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] Installation failed
        pause
        exit /b 1
    )
)

echo.
echo Dependencies installed successfully!
echo.

:: Verify installation
echo Verifying installation...
if not exist "node_modules" (
    echo [ERROR] node_modules not found
    pause
    exit /b 1
)
if not exist "packages\main\node_modules" (
    echo [ERROR] packages\main\node_modules not found
    pause
    exit /b 1
)
if not exist "packages\renderer\node_modules" (
    echo [ERROR] packages\renderer\node_modules not found
    pause
    exit /b 1
)
if not exist ".pnpm-store" (
    echo [ERROR] .pnpm-store not found
    pause
    exit /b 1
)

echo   All dependencies installed!
echo.

:: Show statistics
echo ==========================================
echo Installation Complete!
echo ==========================================
echo.

for /f "tokens=*" %%a in ('dir /s /b "node_modules" 2^>nul ^| find /c /v ""') do set "root_modules=%%a"
for /f "tokens=*" %%a in ('dir /s /b "packages\main\node_modules" 2^>nul ^| find /c /v ""') do set "main_modules=%%a"
for /f "tokens=*" %%a in ('dir /s /b "packages\renderer\node_modules" 2^>nul ^| find /c /v ""') do set "renderer_modules=%%a"
for /f "tokens=*" %%a in ('dir /s /b ".pnpm-store" 2^>nul ^| find /c /v ""') do set "store_files=%%a"

echo Installed files:
echo   Root node_modules: %root_modules% files
echo   Main node_modules: %main_modules% files
echo   Renderer node_modules: %renderer_modules% files
echo   Pnpm store: %store_files% files
echo.

:: Calculate sizes
echo Calculating sizes...
for /f "tokens=*" %%a in ('powershell -Command "(Get-ChildItem .pnpm-store -Recurse -ErrorAction SilentlyContinue ^| Measure-Object -Property Length -Sum).Sum / 1GB"') do echo   Pnpm store size: ~%%a GB
echo.

echo You can now copy the entire QSerial folder to your offline machine.
echo.
pause
