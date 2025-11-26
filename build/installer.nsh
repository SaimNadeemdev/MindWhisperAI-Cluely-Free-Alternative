; Custom NSIS installer script for MindWhisper AI
; This script installs portable Python and all required dependencies

!macro customInstall
  DetailPrint "Installing MindWhisper AI dependencies..."
  
  ; Create Python directory
  CreateDirectory "$INSTDIR\python-portable"
  
  ; Install Python dependencies using the bundled portable Python
  DetailPrint "Setting up Python environment..."
  nsExec::ExecToLog '"$INSTDIR\python-portable\python.exe" -m pip install --upgrade pip'
  
  DetailPrint "Installing Whisper dependencies..."
  nsExec::ExecToLog '"$INSTDIR\python-portable\python.exe" -m pip install openai-whisper faster-whisper torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu'
  
  DetailPrint "Installing audio processing dependencies..."
  nsExec::ExecToLog '"$INSTDIR\python-portable\python.exe" -m pip install pyaudiowpatch scipy numpy noisereduce librosa soundfile'
  
  DetailPrint "Installing Deepgram dependencies..."
  nsExec::ExecToLog '"$INSTDIR\python-portable\python.exe" -m pip install deepgram-sdk websockets'
  
  ; Refresh icon cache gently (no forced restart)
  DetailPrint "Refreshing icon cache..."
  nsExec::ExecToLog 'ie4uinit.exe -show'
  
  ; Create Start Menu shortcut with proper icon
  DetailPrint "Creating Start Menu shortcut with custom icon..."
  CreateDirectory "$SMPROGRAMS\MindWhisper AI"
  CreateShortCut "$SMPROGRAMS\MindWhisper AI\MindWhisper AI.lnk" "$INSTDIR\MindWhisper AI.exe" "" "$INSTDIR\MindWhisper AI.exe" 0
  
  ; Create Desktop shortcut with proper icon
  DetailPrint "Creating Desktop shortcut with custom icon..."
  CreateShortCut "$DESKTOP\MindWhisper AI.lnk" "$INSTDIR\MindWhisper AI.exe" "" "$INSTDIR\MindWhisper AI.exe" 0
  
  DetailPrint "Installation complete!"
!macroend

!macro customUnInstall
  DetailPrint "Removing MindWhisper AI..."
  RMDir /r "$INSTDIR\python-portable"
  
  ; Clear Windows icon cache after uninstall
  DetailPrint "Clearing icon cache..."
  nsExec::ExecToLog 'ie4uinit.exe -show'
  
  ; Remove Start Menu shortcuts with proper cleanup
  Delete "$SMPROGRAMS\MindWhisper AI\MindWhisper AI.lnk"
  RMDir "$SMPROGRAMS\MindWhisper AI"
!macroend
