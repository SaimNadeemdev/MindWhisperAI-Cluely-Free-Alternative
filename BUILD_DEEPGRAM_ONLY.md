# MindWhisper AI - Deepgram-Only Build Guide

This guide explains how to build a **Deepgram-only** version of MindWhisper AI that excludes Whisper and PyTorch dependencies, resulting in a much smaller installer.

## 🎯 Benefits of Deepgram-Only Build

- **Smaller installer**: ~500MB instead of ~3.5GB
- **Faster build time**: No large ML model downloads
- **Faster installation**: Users get up and running quickly
- **Cloud-based transcription**: High-quality real-time transcription
- **No local GPU requirements**: Works on any machine

## 🚀 Quick Start

### Option 1: Automated Build (Recommended)
```bash
# Clean existing packages and build Deepgram-only installer
npm run dist:deepgram
```

### Option 2: Manual Steps
```bash
# 1. Clean existing Whisper/PyTorch packages
cleanup_whisper_pytorch.bat

# 2. Build with Deepgram-only Python environment
npm run dist:deepgram
```

## 📦 What Gets Included/Excluded

### ✅ Included (Deepgram-Only)
- **Deepgram SDK** - Real-time cloud transcription
- **PyAudioWPatch** - System audio capture (WASAPI)
- **NumPy & SciPy** - Basic audio processing
- **NoiseReduce** - Audio enhancement
- **Core utilities** - JSON, HTTP, WebSocket support

### ❌ Excluded (Saves ~3GB)
- **OpenAI Whisper** - Local transcription models
- **faster-whisper** - Optimized local transcription
- **PyTorch** - Deep learning framework
- **Transformers** - Hugging Face models
- **TensorFlow** - Alternative ML framework
- **Librosa** - Advanced audio processing
- **Large ML models** - All local AI models

## 🛠️ Build Scripts

### New Build Commands

| Command | Description |
|---------|-------------|
| `npm run dist:deepgram` | Build Deepgram-only installer |
| `npm run dist` | Build full installer (with Whisper) |
| `npm run dist:quick` | Quick build (no Python setup) |

### Supporting Scripts

| Script | Purpose |
|--------|---------|
| `setup-portable-python-deepgram-only.js` | Install only Deepgram dependencies |
| `cleanup_whisper_pytorch.bat` | Remove Whisper/PyTorch from current env |
| `uninstall_whisper_pytorch.py` | Advanced uninstall with options |

## 🔧 Configuration Changes

### package.json Updates
```json
{
  "scripts": {
    "dist:deepgram": "node setup-portable-python-deepgram-only.js && npm run app:build"
  }
}
```

### Python Environment
- **Portable Python 3.11.9** - Embedded distribution
- **Minimal dependencies** - Only what's needed for Deepgram
- **No CUDA support** - CPU-only for smaller size

## 🎮 User Experience

### What Users Get
- **Deepgram transcription** - High-quality cloud transcription
- **All other features** - Chat, screenshots, AI analysis
- **Faster startup** - No large model loading
- **Smaller download** - Quick installation

### What Users Don't Get
- **Local Whisper transcription** - Requires internet for transcription
- **Offline transcription** - Must have internet connection
- **Local AI models** - All AI processing is cloud-based

## 🔍 Verification

After building, verify the installer:

1. **Check installer size**: Should be ~500MB instead of ~3.5GB
2. **Test Deepgram**: Verify transcription works with API key
3. **Confirm exclusions**: Whisper options should be unavailable
4. **Test other features**: Chat, screenshots, etc. should work

## 🚨 Troubleshooting

### Build Issues

**Problem**: Build fails with Python errors
```bash
# Solution: Clean and retry
cleanup_whisper_pytorch.bat
npm run dist:deepgram
```

**Problem**: Installer still large
```bash
# Solution: Verify Python environment
dir python-portable\Lib\site-packages
# Should NOT contain torch, whisper, transformers folders
```

### Runtime Issues

**Problem**: "Whisper not available" errors
- **Expected**: This is normal for Deepgram-only builds
- **Solution**: Use Deepgram transcription instead

**Problem**: Transcription not working
- **Check**: Deepgram API key is configured
- **Check**: Internet connection is available

## 📊 Size Comparison

| Build Type | Installer Size | Python Env Size | Total |
|------------|----------------|-----------------|-------|
| **Full Build** | ~3.5GB | ~2.8GB | ~6.3GB |
| **Deepgram-Only** | ~500MB | ~300MB | ~800MB |
| **Savings** | **~3GB** | **~2.5GB** | **~5.5GB** |

## 🔄 Switching Between Builds

### To Deepgram-Only
```bash
npm run dist:deepgram
```

### Back to Full Build
```bash
npm run dist
```

The build system automatically handles the Python environment setup for each type.

## 📝 Notes

- **API Key Required**: Users need a Deepgram API key
- **Internet Required**: No offline transcription capability
- **Quality**: Deepgram often provides better transcription than local models
- **Speed**: Real-time transcription with low latency
- **Cost**: Pay-per-use pricing from Deepgram

## 🎉 Recommended Workflow

For most users, the Deepgram-only build is recommended because:

1. **Smaller download** - Users get started faster
2. **Better quality** - Deepgram transcription is excellent
3. **No hardware requirements** - Works on any machine
4. **Always up-to-date** - Cloud models are continuously improved
5. **Easier maintenance** - No local model management

Use the full build only if users specifically need offline transcription capabilities.
