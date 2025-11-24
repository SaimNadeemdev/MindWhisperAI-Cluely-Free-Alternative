# Python Setup for MindWhisper AI

## Required Python Dependencies

For the installed version of MindWhisper AI to work properly, you need to install Python dependencies on the system Python.

### 1. Install System Python
- Download Python 3.8+ from https://python.org
- Make sure to check "Add Python to PATH" during installation

### 2. Install Required Packages

```bash
# Core dependencies for Whisper transcription
pip install openai-whisper
pip install faster-whisper
pip install torch torchvision torchaudio
pip install pyaudiowpatch
pip install scipy
pip install numpy
pip install noisereduce

# Dependencies for Deepgram transcription
pip install deepgram-sdk
pip install websockets
pip install asyncio

# Additional audio processing
pip install librosa
pip install soundfile
```

### 3. Alternative: Install All at Once

```bash
pip install openai-whisper faster-whisper torch torchvision torchaudio pyaudiowpatch scipy numpy noisereduce deepgram-sdk websockets librosa soundfile
```

## Troubleshooting

### If transcription doesn't work in installed version:

1. **Check Python installation:**
   ```bash
   python --version
   ```

2. **Verify packages are installed:**
   ```bash
   python -c "import whisper; print('Whisper OK')"
   python -c "import pyaudiowpatch; print('Audio OK')"
   python -c "import deepgram; print('Deepgram OK')"
   ```

3. **Check Windows PATH:**
   - Open Command Prompt and type `python`
   - Should open Python interpreter, not give "command not found"

4. **Reinstall Python with PATH:**
   - If Python command not found, reinstall Python
   - Make sure to check "Add Python to PATH"

### Common Issues:

- **"python is not recognized"**: Python not in PATH
- **"No module named 'whisper'"**: Dependencies not installed
- **"Access denied"**: Run Command Prompt as Administrator when installing packages
- **"Microsoft Visual C++ required"**: Install Visual Studio Build Tools

## Why This is Needed

The installed version uses system Python instead of the development virtual environment for better compatibility and user experience. This ensures the app works on any Windows machine without requiring users to set up development environments.
