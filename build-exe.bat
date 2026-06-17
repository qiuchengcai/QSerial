@echo off
chcp 65001 >nul
title QSerial - One-Click EXE Build
echo ============================================
echo   QSerial One-Click EXE Build
echo ============================================
echo.
echo Running full packaging pipeline...
echo.
cd /d D:\QPrj\QSerial
call pnpm run package:win
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Build failed!
    pause
    exit /b 1
)
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
