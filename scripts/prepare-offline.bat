@echo off
chcp 65001 >nul
echo ==========================================
echo QSerial 离线开发环境准备脚本
echo ==========================================
echo.

set SOURCE_PNPM_STORE=D:\.pnpm-store\v3
set SOURCE_PROJECT=D:\QPrj\QSerial
set TARGET_DIR=D:\QPrj\QSerial\offline-package

echo 准备创建离线包到: %TARGET_DIR%
echo.

:: 创建目标目录
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if not exist "%TARGET_DIR%\pnpm-store" mkdir "%TARGET_DIR%\pnpm-store"
if not exist "%TARGET_DIR%\project" mkdir "%TARGET_DIR%\project"

:: 复制 pnpm 存储
echo [1/4] 复制 pnpm 存储目录...
if exist "%SOURCE_PNPM_STORE%" (
    xcopy /E /I /H /Y "%SOURCE_PNPM_STORE%" "%TARGET_DIR%\pnpm-store\v3"
    echo ✓ pnpm 存储复制完成
) else (
    echo ✗ 错误: 找不到 pnpm 存储目录 %SOURCE_PNPM_STORE%
    exit /b 1
)

:: 复制项目 node_modules
echo [2/4] 复制项目 node_modules...
if exist "%SOURCE_PROJECT%\node_modules" (
    xcopy /E /I /H /Y "%SOURCE_PROJECT%\node_modules" "%TARGET_DIR%\project\node_modules"
    echo ✓ node_modules 复制完成
) else (
    echo ✗ 错误: 找不到 node_modules，请先运行 pnpm install
    exit /b 1
)

:: 复制项目文件（排除 node_modules 和 .git）
echo [3/4] 复制项目源码...
xcopy /E /I /H /Y /EXCLUDE:%~dp0exclude.txt "%SOURCE_PROJECT%" "%TARGET_DIR%\project\"
echo ✓ 项目源码复制完成

:: 复制文档
echo [4/4] 复制离线配置文档...
copy "%SOURCE_PROJECT%\docs\OFFLINE_SETUP.md" "%TARGET_DIR%\README.md"
echo ✓ 文档复制完成

echo.
echo ==========================================
echo 离线包准备完成！
echo ==========================================
echo.
echo 输出目录: %TARGET_DIR%
echo.
echo 请将此目录完整复制到内网机器，然后按照 README.md 配置
echo.
pause
