# QSerial Offline Environment Setup Script
# Run this on the offline machine

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "QSerial Offline Environment Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Paths - now using project directory
$ProjectDir = "D:\QPrj\QSerial"
$PnpmStore = "$ProjectDir\.pnpm-store"
$OfflinePackage = "$ProjectDir\offline-package"

Write-Host "Using offline package from: $OfflinePackage" -ForegroundColor Yellow
Write-Host "Pnpm store location: $PnpmStore" -ForegroundColor Yellow
Write-Host ""

# Check offline package
if (-not (Test-Path $OfflinePackage)) {
    Write-Host "ERROR: Offline package not found at $OfflinePackage" -ForegroundColor Red
    exit 1
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js not found. Please install Node.js 20.x LTS" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Check pnpm
$pnpmVersion = pnpm --version 2>$null
if (-not $pnpmVersion) {
    Write-Host "ERROR: pnpm not found. Please install: npm install -g pnpm" -ForegroundColor Red
    exit 1
}
Write-Host "  pnpm: $pnpmVersion" -ForegroundColor Green

# Setup pnpm store
Write-Host ""
Write-Host "Setting up pnpm store..." -ForegroundColor Yellow

# Create pnpm store directory
New-Item -ItemType Directory -Force -Path "$PnpmStore\v3" | Out-Null

# Copy pnpm store
Write-Host "Copying pnpm store (about 2.8GB, please wait)..." -ForegroundColor Yellow
robocopy "$OfflinePackage\pnpm-store\v3" "$PnpmStore\v3" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
Write-Host "  pnpm store copied" -ForegroundColor Green

# Configure pnpm
pnpm config set store-dir $PnpmStore | Out-Null
pnpm config set registry "https://registry.npmmirror.com" | Out-Null
Write-Host "  pnpm configured" -ForegroundColor Green

# Copy node_modules
Write-Host ""
Write-Host "Copying node_modules..." -ForegroundColor Yellow

$CopyPaths = @(
    @{ From = "$OfflinePackage\project\node_modules"; To = "$ProjectDir\node_modules" },
    @{ From = "$OfflinePackage\project\packages\main\node_modules"; To = "$ProjectDir\packages\main\node_modules" },
    @{ From = "$OfflinePackage\project\packages\renderer\node_modules"; To = "$ProjectDir\packages\renderer\node_modules" },
    @{ From = "$OfflinePackage\project\packages\shared\node_modules"; To = "$ProjectDir\packages\shared\node_modules" }
)

foreach ($item in $CopyPaths) {
    if (Test-Path $item.From) {
        $dir = Split-Path $item.To -Parent
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        robocopy $item.From $item.To /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
    }
}
Write-Host "  node_modules copied" -ForegroundColor Green

# Install dependencies (offline mode)
Write-Host ""
Write-Host "Installing dependencies (offline mode)..." -ForegroundColor Yellow
Set-Location $ProjectDir
pnpm install --offline

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project directory: $ProjectDir" -ForegroundColor Yellow
Write-Host "Pnpm store: $PnpmStore" -ForegroundColor Yellow
Write-Host ""
Write-Host "You can now build the project:" -ForegroundColor Cyan
Write-Host "  pnpm run build" -ForegroundColor White
Write-Host "  pnpm run package:win" -ForegroundColor White
Write-Host ""
Write-Host "Or use the one-click build script:" -ForegroundColor Cyan
Write-Host "  .\build-offline.bat" -ForegroundColor White
Write-Host ""

Start-Sleep -Seconds 3
