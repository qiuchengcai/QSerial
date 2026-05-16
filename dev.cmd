@echo off
cd /d "%~dp0"

where bash >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git Bash not found. Please install Git for Windows.
    echo        https://git-scm.com/download/win
    pause
    exit /b 1
)

bash "%~dp0dev.sh"
