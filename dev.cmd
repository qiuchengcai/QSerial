@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   QSerial 开发模式一键启动
echo ==========================================
echo.

set "ROOT=%CD%"
set "NODE=node"
set "TSC_LIB=node_modules\.pnpm\typescript@5.9.3\node_modules\typescript\lib\tsc.js"
set "VITE_JS=node_modules\.pnpm\vite@5.4.21_@types+node@20.19.40\node_modules\vite\bin\vite.js"
set "ESBUILD_BIN=%ROOT%\node_modules\.pnpm\esbuild@0.21.5\node_modules\@esbuild\win32-x64\esbuild.exe"
set "ELECTRON_BIN=%ROOT%\node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe"

echo [1/3] 编译 shared 包...
%NODE% "%TSC_LIB%" -p packages\shared\tsconfig.json --skipLibCheck
if %errorlevel% neq 0 (
    echo 编译失败!
    exit /b %errorlevel%
)
echo   ✓ shared 完成

echo [2/3] 编译 main 包...
%NODE% "%TSC_LIB%" -p packages\main\tsconfig.json --skipLibCheck
if %errorlevel% neq 0 (
    echo 编译失败!
    exit /b %errorlevel%
)
echo   ✓ main 完成

echo [3/3] 启动 Vite HMR + Electron...
echo.
echo   ┌──────────────────────────────────────┐
echo   │  Vite 开发服务器: http://localhost:5173  │
echo   │  UI 修改自动热更新，无需重新编译        │
echo   │  关闭 Electron 窗口即可停止             │
echo   └──────────────────────────────────────┘
echo.

REM 在新窗口启动 Vite
set ESBUILD_BINARY_PATH=%ESBUILD_BIN%
start "QSerial-Vite" cmd /c "cd /d "%ROOT%\packages\renderer" && "%NODE%" "%ROOT%\%VITE_JS%" --host --strictPort"

REM 等 Vite 启动
timeout /t 5 /nobreak >nul

REM 启动 Electron
set NODE_ENV=development
"%ELECTRON_BIN%" packages\main\dist\index.js
