@echo off
REM Quick cleanup script for Whisper and PyTorch packages
REM Run this before building the Deepgram-only installer

echo ========================================
echo MindWhisper AI - Quick Package Cleanup
echo ========================================
echo.
echo This will remove Whisper and PyTorch packages from your current environment
echo to ensure they don't get included in the installer.
echo.

echo 🗑️ Removing Whisper packages...
pip uninstall openai-whisper -y >nul 2>&1
pip uninstall whisper -y >nul 2>&1
pip uninstall faster-whisper -y >nul 2>&1
pip uninstall ctranslate2 -y >nul 2>&1

echo 🗑️ Removing PyTorch packages...
pip uninstall torch -y >nul 2>&1
pip uninstall torchvision -y >nul 2>&1
pip uninstall torchaudio -y >nul 2>&1

echo 🗑️ Removing optional ML packages...
pip uninstall transformers -y >nul 2>&1
pip uninstall tensorflow -y >nul 2>&1
pip uninstall librosa -y >nul 2>&1
pip uninstall soundfile -y >nul 2>&1

echo 🧹 Cleaning pip cache...
pip cache purge >nul 2>&1

echo.
echo ✅ Cleanup complete!
echo.
echo 📋 Next steps:
echo 1. Run: npm run dist:deepgram
echo 2. Your installer will be much smaller and Deepgram-only
echo.

pause
