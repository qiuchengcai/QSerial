# QSerial Offline Package Preparation Script
# Run this on the internet-connected machine

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "QSerial Offline Package Preparation" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Paths
$SourcePnpmStore = "D:\.pnpm-store\v3"
$SourceProject = "D:\QPrj\QSerial"
$TargetDir = "D:\QPrj\QSerial\offline-package"

Write-Host "Creating offline package at: $TargetDir" -ForegroundColor Yellow
Write-Host ""

# Check source directories
if (-not (Test-Path $SourcePnpmStore)) {
    Write-Host "ERROR: pnpm store not found at $SourcePnpmStore" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$SourceProject\node_modules")) {
    Write-Host "ERROR: node_modules not found. Please run 'pnpm install' first" -ForegroundColor Red
    exit 1
}

# Create target directories
Write-Host "[1/4] Creating target directories..." -NoNewline
New-Item -ItemType Directory -Force -Path "$TargetDir\pnpm-store" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\project" | Out-Null
Write-Host " DONE" -ForegroundColor Green

# Copy pnpm store
Write-Host "[2/4] Copying pnpm store..." -NoNewline
robocopy $SourcePnpmStore "$TargetDir\pnpm-store\v3" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
Write-Host " DONE" -ForegroundColor Green

# Copy node_modules
Write-Host "[3/4] Copying node_modules..." -NoNewline
robocopy "$SourceProject\node_modules" "$TargetDir\project\node_modules" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
robocopy "$SourceProject\packages\main\node_modules" "$TargetDir\project\packages\main\node_modules" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
robocopy "$SourceProject\packages\renderer\node_modules" "$TargetDir\project\packages\renderer\node_modules" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
robocopy "$SourceProject\packages\shared\node_modules" "$TargetDir\project\packages\shared\node_modules" /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
Write-Host " DONE" -ForegroundColor Green

# Copy project files (excluding certain directories)
Write-Host "[4/4] Copying project files..." -NoNewline
$ExcludeDirs = @('node_modules', '.git', 'dist', 'release', 'release-final', 'offline-package', '.pnpm-store')
Get-ChildItem $SourceProject -Exclude $ExcludeDirs | ForEach-Object {
    $dest = "$TargetDir\project\$($_.Name)"
    if ($_.PSIsContainer) {
        robocopy $_.FullName $dest /E /MT:8 /NFL /NDL /NJH /NJS | Out-Null
    } else {
        Copy-Item $_.FullName $dest -Force
    }
}
Write-Host " DONE" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Offline package created successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output directory: $TargetDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Directory structure:" -ForegroundColor Cyan
Write-Host "  $TargetDir\"
Write-Host "  ├── pnpm-store\v3\    # pnpm global store"
Write-Host "  └── project\          # project files with node_modules"
Write-Host ""
Write-Host "Copy this entire directory to the offline machine" -ForegroundColor Yellow
Write-Host "and run build-offline.bat to build the project" -ForegroundColor Yellow
Write-Host ""

# Calculate size
$size = (Get-ChildItem $TargetDir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$sizeGB = [math]::Round($size / 1GB, 2)
Write-Host "Package size: $sizeGB GB" -ForegroundColor Cyan
Write-Host ""

Write-Host "Press any key to exit..."
Start-Sleep -Seconds 5
