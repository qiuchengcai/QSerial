@echo off
chcp 65001 >nul
echo ==========================================
echo QSerial 内网环境配置脚本
echo ==========================================
echo.

set OFFLINE_PACKAGE=D:\QPrj\QSerial\offline-package
set PNPM_STORE=D:\.pnpm-store
set PROJECT_DIR=D:\QPrj\QSerial

echo 从离线包目录: %OFFLINE_PACKAGE%
echo.

:: 检查离线包是否存在
if not exist "%OFFLINE_PACKAGE%" (
    echo ✗ 错误: 找不到离线包目录 %OFFLINE_PACKAGE%
    echo 请确保已将离线包复制到 D:\QSerial-Offline-Package
    pause
    exit /b 1
)

:: 创建目录
echo [1/5] 创建必要目录...
if not exist "%PNPM_STORE%" mkdir "%PNPM_STORE%"
if not exist "%PROJECT_DIR%" mkdir "%PROJECT_DIR%"
echo ✓ 目录创建完成

:: 复制 pnpm 存储
echo [2/5] 复制 pnpm 存储...
if exist "%OFFLINE_PACKAGE%\pnpm-store\v3" (
    xcopy /E /I /H /Y "%OFFLINE_PACKAGE%\pnpm-store\v3" "%PNPM_STORE%\v3"
    echo ✓ pnpm 存储复制完成
) else (
    echo ✗ 错误: 离线包中缺少 pnpm-store
    pause
    exit /b 1
)

:: 复制项目
echo [3/5] 复制项目文件...
if exist "%OFFLINE_PACKAGE%\project" (
    xcopy /E /I /H /Y "%OFFLINE_PACKAGE%\project" "%PROJECT_DIR%"
    echo ✓ 项目复制完成
) else (
    echo ✗ 错误: 离线包中缺少 project 目录
    pause
    exit /b 1
)

:: 配置 pnpm
echo [4/5] 配置 pnpm...
call pnpm config set store-dir "%PNPM_STORE%\v3"
call pnpm config set offline true
echo ✓ pnpm 配置完成

:: 验证安装
echo [5/5] 验证离线安装...
cd /d "%PROJECT_DIR%"
call pnpm install --offline
if %errorlevel% neq 0 (
    echo ✗ 错误: 离线安装失败
    pause
    exit /b 1
)
echo ✓ 离线安装验证通过

echo.
echo ==========================================
echo 内网环境配置完成！
echo ==========================================
echo.
echo 项目位置: %PROJECT_DIR%
echo.
echo 可用命令:
echo   pnpm run dev      - 启动开发模式
echo   pnpm run build    - 构建项目
echo   pnpm run package:win - 打包 Windows 应用
echo.
pause
