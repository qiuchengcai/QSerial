@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   QSerial 开发模式一键启动
echo ==========================================
echo.

REM 检查 node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 node，请安装 Node.js
    pause
    exit /b 1
)

echo [1/3] 编译 shared 包...
node "node_modules\.pnpm\typescript@5.9.3\node_modules\typescript\lib\tsc.js" -p packages\shared\tsconfig.json --skipLibCheck
if %errorlevel% neq 0 (
    echo 编译失败!
    pause
    exit /b 1
)
echo   ✓ shared 完成

echo [2/3] 编译 main 包...
node "node_modules\.pnpm\typescript@5.9.3\node_modules\typescript\lib\tsc.js" -p packages\main\tsconfig.json --skipLibCheck
if %errorlevel% neq 0 (
    echo 编译失败!
    pause
    exit /b 1
)
echo   ✓ main 完成

echo [3/3] 启动 Vite + Electron...
echo.
echo   Vite: http://localhost:5173
echo   保存 UI 代码即热更新，关窗即停
echo.

REM 后台启动 Vite
set ESBUILD_BINARY_PATH=%~dp0node_modules\.pnpm\esbuild@0.21.5\node_modules\@esbuild\win32-x64\esbuild.exe
start "QSerial-Vite" /min cmd /c "cd /d "%~dp0packages\renderer" && node "%~dp0node_modules\.pnpm\vite@5.4.21_@types+node@20.19.40\node_modules\vite\bin\vite.js" --host --strictPort"

REM 等 Vite 启动
echo   等待 Vite 启动...
timeout /t 5 /nobreak >nul

REM 检查 Vite 是否成功启动
curl -s -o NUL http://localhost:5173 >nul 2>&1
if %errorlevel% neq 0 (
    echo   警告: Vite 可能未就绪，继续尝试启动 Electron...
)

REM 启动 Electron
set NODE_ENV=development
"%~dp0node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe" "%~dp0packages\main\dist\index.js"
