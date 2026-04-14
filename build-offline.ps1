# QSerial 一键编译脚本（支持离线/内网环境）
# 使用方法: powershell -ExecutionPolicy Bypass -File .\build-offline.ps1

try {
    $ErrorActionPreference = "Stop"

    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "QSerial 一键编译脚本" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""

    # 获取脚本所在目录
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if ($ScriptDir) {
        Set-Location $ScriptDir
    }

    Write-Host "当前目录: $(Get-Location)" -ForegroundColor Gray
    Write-Host ""

    # 检查是否在项目根目录
    if (-not (Test-Path "package.json")) {
        Write-Host "ERROR: 请在项目根目录运行此脚本" -ForegroundColor Red
        Write-Host "当前目录未找到 package.json" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }

    # 检测是否为离线环境
    $IsOffline = Test-Path "offline-package"
    Write-Host "环境检测: $(if ($IsOffline) { '离线模式' } else { '在线模式' })" -ForegroundColor Yellow
    Write-Host ""

    if ($IsOffline) {
        # 离线模式
        $PnpmStore = "D:\.pnpm-store"
        $OfflinePackage = Join-Path (Get-Location) "offline-package"

        if (-not (Test-Path $PnpmStore)) {
            Write-Host "首次运行，配置离线环境..." -ForegroundColor Yellow
            Write-Host ""

            # 创建目录
            New-Item -ItemType Directory -Path $PnpmStore -Force | Out-Null
            New-Item -ItemType Directory -Path "$PnpmStore\v3" -Force | Out-Null

            # 复制 pnpm 存储
            Write-Host "正在复制 pnpm 存储（约 2.8GB，请耐心等待）..." -ForegroundColor Yellow
            try {
                Copy-Item -Path "$OfflinePackage\pnpm-store\v3\*" -Destination "$PnpmStore\v3" -Recurse -Force
                Write-Host "pnpm 存储复制完成" -ForegroundColor Green
            } catch {
                Write-Host "WARNING: 复制 pnpm 存储时出错: $_" -ForegroundColor Yellow
            }

            # 配置 pnpm
            Write-Host "配置 pnpm..." -ForegroundColor Yellow
            & pnpm config set store-dir $PnpmStore 2>&1 | Out-Null
            & pnpm config set registry "https://registry.npmmirror.com" 2>&1 | Out-Null

            # 复制 node_modules
            Write-Host "正在复制 node_modules..." -ForegroundColor Yellow
            $CopyPaths = @(
                @{ From = "$OfflinePackage\project\node_modules"; To = "node_modules" },
                @{ From = "$OfflinePackage\project\packages\main\node_modules"; To = "packages\main\node_modules" },
                @{ From = "$OfflinePackage\project\packages\renderer\node_modules"; To = "packages\renderer\node_modules" },
                @{ From = "$OfflinePackage\project\packages\shared\node_modules"; To = "packages\shared\node_modules" }
            )

            foreach ($item in $CopyPaths) {
                if (Test-Path $item.From) {
                    $dir = Split-Path $item.To -Parent
                    if ($dir -and -not (Test-Path $dir)) {
                        New-Item -ItemType Directory -Path $dir -Force | Out-Null
                    }
                    Copy-Item -Path $item.From -Destination $item.To -Recurse -Force
                }
            }

            Write-Host "离线环境配置完成!" -ForegroundColor Green
            Write-Host ""
        }

        # 离线安装依赖
        Write-Host "安装依赖（离线模式）..." -ForegroundColor Yellow
        & pnpm install --offline
    } else {
        # 在线模式
        Write-Host "安装依赖（在线模式）..." -ForegroundColor Yellow
        & pnpm install
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 依赖安装失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }

    Write-Host "依赖安装完成!" -ForegroundColor Green
    Write-Host ""

    # 构建项目
    Write-Host "构建项目..." -ForegroundColor Yellow
    & pnpm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 构建失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }

    Write-Host "构建完成!" -ForegroundColor Green
    Write-Host ""

    # 打包应用
    Write-Host "打包 Windows 应用..." -ForegroundColor Yellow
    & pnpm run package:win

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 打包失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "编译完成!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""

    # 显示输出
    if (Test-Path "release") {
        $ExeFiles = Get-ChildItem -Path "release\*.exe" -Recurse -ErrorAction SilentlyContinue
        if ($ExeFiles) {
            Write-Host "生成的安装包:" -ForegroundColor Cyan
            foreach ($exe in $ExeFiles) {
                Write-Host "  - $($exe.FullName)" -ForegroundColor Cyan
            }
        }
    }

    Write-Host ""
    Read-Host "按回车键退出"

} catch {
    Write-Host ""
    Write-Host "发生错误:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Read-Host "按回车键退出"
    exit 1
}
