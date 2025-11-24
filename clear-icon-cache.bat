@echo off
echo Clearing Windows Icon Cache for MindWhisper AI
echo ===============================================

echo.
echo Step 1: Clearing icon cache database...
ie4uinit.exe -show

echo.
echo Step 2: Clearing thumbnail cache...
del /f /s /q "%localappdata%\Microsoft\Windows\Explorer\thumbcache_*.db" 2>nul
del /f /s /q "%localappdata%\Microsoft\Windows\Explorer\iconcache_*.db" 2>nul

echo.
echo Step 3: Refreshing Start Menu shortcuts...
echo Checking Start Menu shortcut: C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MindWhisper AI
dir "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MindWhisper AI" 2>nul

echo.
echo Step 4: Refreshing desktop (gentle refresh)...
rundll32.exe user32.dll,UpdatePerUserSystemParameters

echo.
echo Icon cache cleared successfully!
echo Note: If the Start Menu shortcut still shows wrong icon,
echo please reinstall the app to recreate shortcuts properly.
echo.
pause
