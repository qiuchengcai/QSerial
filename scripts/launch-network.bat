@echo off
:: QSerial 网络磁盘启动器
:: 解决从 UNC 网络路径（如 \\server\share\）运行时的 SxS 配置错误
:: 原理：将网络路径映射为本地驱动器号后启动，绕过 Windows 对 UNC 路径的 DLL 加载限制

setlocal enabledelayedexpansion

:: 获取当前批处理文件所在目录（自动兼容 UNC 和本地路径）
set "APP_DIR=%~dp0"

:: 检查是否在 UNC 路径下运行
echo %APP_DIR% | findstr /B "\\\\" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    :: 本地路径，直接启动
    start "" "%APP_DIR%QSerial.exe" --no-sandbox
    goto :eof
)

:: UNC 路径，需要映射为驱动器号
:: 查找可用的驱动器号
set "DRIVE="
for %%D in (Z Y X W V U T S R Q P O N M L K J I H G F E) do (
    if not exist %%D:\ (
        if "!DRIVE!"=="" set "DRIVE=%%D"
    )
)

if "!DRIVE!"=="" (
    echo 错误：找不到可用的驱动器号
    pause
    goto :eof
)

:: 映射网络路径到驱动器号
echo 正在映射网络路径到驱动器 !DRIVE!: ...
net use !DRIVE!: "%APP_DIR%" >nul 2>&1

if %ERRORLEVEL% neq 0 (
    :: 映射失败，尝试直接用 pushd（会自动映射 UNC 路径）
    pushd "%APP_DIR%"
    if %ERRORLEVEL% neq 0 (
        echo 错误：无法映射网络路径
        echo 请将程序复制到本地磁盘后运行
        pause
        goto :eof
    )
    :: pushd 成功，使用自动映射的驱动器号
    start "" "%CD%\QSerial.exe" --no-sandbox
    popd
) else (
    :: net use 成功，使用映射的驱动器号启动
    start "" "!DRIVE!:\QSerial.exe" --no-sandbox
    :: 等待 3 秒后释放映射（给进程足够时间启动）
    ping -n 4 127.0.0.1 >nul 2>&1
    net use !DRIVE!: /delete /yes >nul 2>&1
)

endlocal
