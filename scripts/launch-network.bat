@echo off
:: QSerial 网络磁盘启动器
:: 解决从网络路径（UNC 或映射驱动器）运行时的 SxS 配置错误
:: 原理：将程序复制到本地临时目录后启动，绕过 Windows 对网络路径的 SxS/DLL 加载限制

setlocal enabledelayedexpansion

:: 获取当前批处理文件所在目录
set "APP_DIR=%~dp0"
:: 去掉末尾反斜杠
set "APP_DIR=%APP_DIR:~0,-1%"

:: 检查是否在本地磁盘（C:-Y:）上运行
set "DRIVE_LETTER=%APP_DIR:~0,1%"
set "IS_LOCAL=0"
for %%L in (C D E F G H I J K L M N O P Q R S T U V W X Y) do (
    if /i "!DRIVE_LETTER!"=="%%L" set "IS_LOCAL=1"
)

if "!IS_LOCAL!"=="1" (
    :: 本地磁盘，直接启动
    start "" "%APP_DIR%\QSerial.exe" --no-sandbox
    goto :eof
)

:: 网络路径（UNC 或映射驱动器 Z: 等），需要复制到本地运行
echo 检测到网络磁盘路径，正在准备本地运行环境...

:: 创建本地临时目录
set "LOCAL_DIR=%TEMP%\QSerial"
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

:: 复制所有文件到本地（使用 /d 只复制较新的文件，加快速度）
echo 正在复制文件到本地，请稍候...
xcopy "%APP_DIR%\*" "%LOCAL_DIR%\" /e /d /y /q >nul 2>&1

if not exist "%LOCAL_DIR%\QSerial.exe" (
    echo 错误：文件复制失败
    pause
    goto :eof
)

echo 启动 QSerial...
start "" "%LOCAL_DIR%\QSerial.exe" --no-sandbox

endlocal
