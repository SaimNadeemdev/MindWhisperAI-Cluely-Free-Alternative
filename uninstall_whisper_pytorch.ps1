# Whisper and PyTorch Uninstall Script for MindWhisper AI
# PowerShell version with better error handling and progress indication

param(
    [switch]$WhatIf,
    [switch]$IncludeOptional,
    [switch]$Force
)

# Define package lists
$WhisperPackages = @(
    "openai-whisper",
    "whisper", 
    "faster-whisper",
    "ctranslate2",
    "whisper-timestamped",
    "stable-ts",
    "whisperx",
    "insanely-fast-whisper"
)

$PyTorchPackages = @(
    "torch",
    "torchvision",
    "torchaudio", 
    "pytorch",
    "torchtext",
    "torchdata",
    "pytorch-lightning",
    "lightning",
    "pytorch-ignite",
    "ignite"
)

$OptionalMLPackages = @(
    "transformers",
    "tokenizers", 
    "datasets",
    "accelerate",
    "safetensors",
    "tensorflow",
    "tensorflow-gpu",
    "keras",
    "librosa",
    "soundfile",
    "opencv-python",
    "scikit-learn"
)

function Write-Header {
    param([string]$Title)
    Write-Host "`n" -NoNewline
    Write-Host "=" * 50 -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Yellow
    Write-Host "=" * 50 -ForegroundColor Cyan
}

function Get-InstalledPackages {
    Write-Host "🔍 Checking installed packages..." -ForegroundColor Blue
    
    try {
        $result = & python -m pip list --format=json 2>$null | ConvertFrom-Json
        return $result | ForEach-Object { $_.name.ToLower() }
    }
    catch {
        Write-Host "❌ Failed to get package list: $_" -ForegroundColor Red
        return @()
    }
}

function Uninstall-PackageList {
    param(
        [string[]]$Packages,
        [string]$Category,
        [string[]]$InstalledPackages
    )
    
    $ToUninstall = $Packages | Where-Object { $InstalledPackages -contains $_.ToLower() }
    
    if ($ToUninstall.Count -eq 0) {
        Write-Host "✅ No $Category packages found to uninstall" -ForegroundColor Green
        return 0
    }
    
    Write-Host "`n📦 Found $Category packages to uninstall:" -ForegroundColor Yellow
    $ToUninstall | ForEach-Object { Write-Host "   - $_" -ForegroundColor White }
    
    if ($WhatIf) {
        Write-Host "🔍 WHAT-IF: Would uninstall $($ToUninstall.Count) $Category packages" -ForegroundColor Magenta
        return 0
    }
    
    if (-not $Force) {
        $response = Read-Host "`nUninstall $($ToUninstall.Count) $Category packages? (y/N)"
        if ($response -notmatch '^y(es)?$') {
            Write-Host "⏭️ Skipping $Category packages" -ForegroundColor Yellow
            return 0
        }
    }
    
    Write-Host "`n🗑️ Uninstalling $Category packages..." -ForegroundColor Red
    
    $FailedCount = 0
    $Progress = 0
    
    foreach ($Package in $ToUninstall) {
        $Progress++
        $PercentComplete = ($Progress / $ToUninstall.Count) * 100
        
        Write-Progress -Activity "Uninstalling $Category packages" -Status "Removing $Package" -PercentComplete $PercentComplete
        Write-Host "   Removing $Package..." -NoNewline -ForegroundColor White
        
        try {
            $result = & python -m pip uninstall $Package -y 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host " ✅" -ForegroundColor Green
            } else {
                Write-Host " ❌" -ForegroundColor Red
                Write-Host "      Error: $result" -ForegroundColor Red
                $FailedCount++
            }
        }
        catch {
            Write-Host " ❌" -ForegroundColor Red
            Write-Host "      Exception: $_" -ForegroundColor Red
            $FailedCount++
        }
    }
    
    Write-Progress -Activity "Uninstalling $Category packages" -Completed
    
    $Successful = $ToUninstall.Count - $FailedCount
    Write-Host "`n📊 $Category Results: $Successful/$($ToUninstall.Count) packages removed" -ForegroundColor $(if ($FailedCount -eq 0) { "Green" } else { "Yellow" })
    
    return $FailedCount
}

function Clear-PipCache {
    if ($WhatIf) {
        Write-Host "🔍 WHAT-IF: Would clear pip cache" -ForegroundColor Magenta
        return
    }
    
    Write-Host "`n🧹 Cleaning pip cache..." -ForegroundColor Blue
    
    try {
        & python -m pip cache purge 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Pip cache cleaned" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to clean pip cache" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Exception cleaning pip cache: $_" -ForegroundColor Red
    }
}

function Show-SpaceEstimate {
    param([string[]]$InstalledPackages)
    
    Write-Host "`n💾 Estimating space usage..." -ForegroundColor Blue
    
    # Rough size estimates in MB
    $SizeEstimates = @{
        "torch" = 2000
        "torchvision" = 500
        "torchaudio" = 300
        "transformers" = 200
        "tensorflow" = 1500
        "opencv-python" = 150
        "librosa" = 100
        "whisper" = 50
        "faster-whisper" = 30
        "ctranslate2" = 100
    }
    
    $TotalSize = 0
    $PackagesFound = @()
    
    $AllTargetPackages = $WhisperPackages + $PyTorchPackages
    if ($IncludeOptional) {
        $AllTargetPackages += $OptionalMLPackages
    }
    
    foreach ($Package in $AllTargetPackages) {
        if ($InstalledPackages -contains $Package.ToLower()) {
            $Size = $SizeEstimates[$Package.ToLower()]
            if (-not $Size) { $Size = 10 }  # Default 10MB
            $TotalSize += $Size
            $PackagesFound += "$Package (~${Size}MB)"
        }
    }
    
    if ($PackagesFound.Count -gt 0) {
        Write-Host "📦 Packages that will be removed:" -ForegroundColor Yellow
        $PackagesFound | ForEach-Object { Write-Host "   - $_" -ForegroundColor White }
        $TotalGB = [math]::Round($TotalSize / 1024, 1)
        Write-Host "`n💾 Estimated space to be freed: ~${TotalSize}MB (${TotalGB}GB)" -ForegroundColor Green
    } else {
        Write-Host "✅ No target packages found installed" -ForegroundColor Green
    }
}

# Main execution
Write-Header "MindWhisper AI - Whisper & PyTorch Uninstaller"

if ($WhatIf) {
    Write-Host "🔍 WHAT-IF MODE - No packages will be actually removed" -ForegroundColor Magenta
}

# Check Python availability
try {
    $PythonVersion = & python --version 2>&1
    Write-Host "🐍 Using: $PythonVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ Python not found. Please ensure Python is installed and in PATH." -ForegroundColor Red
    exit 1
}

# Get installed packages
$InstalledPackages = Get-InstalledPackages

if ($InstalledPackages.Count -eq 0) {
    Write-Host "❌ Could not retrieve package list. Exiting." -ForegroundColor Red
    exit 1
}

# Show space estimate
Show-SpaceEstimate -InstalledPackages $InstalledPackages

if (-not $WhatIf -and -not $Force) {
    $response = Read-Host "`nProceed with uninstallation? (y/N)"
    if ($response -notmatch '^y(es)?$') {
        Write-Host "❌ Uninstallation cancelled" -ForegroundColor Red
        exit 0
    }
}

$TotalFailures = 0

# Uninstall packages
$TotalFailures += Uninstall-PackageList -Packages $WhisperPackages -Category "Whisper" -InstalledPackages $InstalledPackages
$TotalFailures += Uninstall-PackageList -Packages $PyTorchPackages -Category "PyTorch" -InstalledPackages $InstalledPackages

if ($IncludeOptional) {
    $TotalFailures += Uninstall-PackageList -Packages $OptionalMLPackages -Category "Optional ML" -InstalledPackages $InstalledPackages
}

# Clean up
Clear-PipCache

# Final summary
Write-Header "UNINSTALLATION COMPLETE"

if ($WhatIf) {
    Write-Host "🔍 What-if analysis complete. Use -Force to actually uninstall packages." -ForegroundColor Magenta
} elseif ($TotalFailures -eq 0) {
    Write-Host "✅ All packages removed successfully!" -ForegroundColor Green
    Write-Host "🔧 Your MindWhisper AI is now optimized for Deepgram-only usage" -ForegroundColor Green
    Write-Host "`n📝 Note: You can still use all Deepgram transcription features" -ForegroundColor Blue
    Write-Host "   The app will work exactly the same with Deepgram transcription" -ForegroundColor Blue
} else {
    Write-Host "⚠️ $TotalFailures packages failed to uninstall" -ForegroundColor Yellow
    Write-Host "   You may need to remove them manually or run as administrator" -ForegroundColor Yellow
}

Write-Host "`n🚀 Restart your MindWhisper AI application to see the changes" -ForegroundColor Cyan
