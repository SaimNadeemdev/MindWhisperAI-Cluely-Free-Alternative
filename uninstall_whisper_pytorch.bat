@echo off
REM Whisper and PyTorch Uninstall Script for MindWhisper AI
REM This batch script removes Whisper and PyTorch packages on Windows

echo ========================================
echo MindWhisper AI - Package Uninstaller
echo ========================================
echo.
echo This will remove Whisper and PyTorch packages to optimize for Deepgram-only usage.
echo Your app will continue to work perfectly with Deepgram transcription.
echo.

pause

echo.
echo 🗑️ Uninstalling Whisper packages...
echo ========================================

REM Uninstall OpenAI Whisper
pip uninstall openai-whisper -y
pip uninstall whisper -y

REM Uninstall Faster Whisper
pip uninstall faster-whisper -y
pip uninstall ctranslate2 -y

REM Uninstall Whisper variants
pip uninstall whisper-timestamped -y
pip uninstall stable-ts -y
pip uninstall whisperx -y
pip uninstall insanely-fast-whisper -y

echo.
echo 🗑️ Uninstalling PyTorch packages...
echo ========================================

REM Uninstall PyTorch core
pip uninstall torch -y
pip uninstall torchvision -y
pip uninstall torchaudio -y
pip uninstall pytorch -y

REM Uninstall PyTorch ecosystem
pip uninstall torchtext -y
pip uninstall torchdata -y
pip uninstall pytorch-lightning -y
pip uninstall lightning -y
pip uninstall pytorch-ignite -y
pip uninstall ignite -y

echo.
echo 🧹 Cleaning pip cache...
echo ========================================
pip cache purge

echo.
echo ========================================
echo ✅ UNINSTALLATION COMPLETE!
echo ========================================
echo.
echo Your MindWhisper AI is now optimized for Deepgram-only usage.
echo All Deepgram transcription features will continue to work perfectly.
echo.
echo 🚀 Please restart your MindWhisper AI application.
echo.

pause
