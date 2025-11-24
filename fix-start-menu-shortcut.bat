@echo off
echo Fixing MindWhisper AI Start Menu Shortcut Icon
echo ==============================================

echo.
echo Locating MindWhisper AI installation...

:: Find the installation directory
set "INSTALL_DIR="
if exist "C:\Program Files\MindWhisper AI\MindWhisper AI.exe" (
    set "INSTALL_DIR=C:\Program Files\MindWhisper AI"
) else if exist "C:\Program Files (x86)\MindWhisper AI\MindWhisper AI.exe" (
    set "INSTALL_DIR=C:\Program Files (x86)\MindWhisper AI"
) else if exist "%LOCALAPPDATA%\Programs\MindWhisper AI\MindWhisper AI.exe" (
    set "INSTALL_DIR=%LOCALAPPDATA%\Programs\MindWhisper AI"
) else (
    echo Error: MindWhisper AI installation not found!
    echo Please ensure the app is installed before running this script.
    pause
    exit /b 1
)

echo Found installation at: %INSTALL_DIR%

echo.
echo Removing old Start Menu shortcuts...
del /f /q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MindWhisper AI\*.lnk" 2>nul
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\MindWhisper AI\*.lnk" 2>nul

echo.
echo Creating new Start Menu shortcut with proper icon...
mkdir "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MindWhisper AI" 2>nul

:: Create shortcut using PowerShell for better icon handling
powershell -Command ^
"$WshShell = New-Object -comObject WScript.Shell; ^
$Shortcut = $WshShell.CreateShortcut('C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MindWhisper AI\MindWhisper AI.lnk'); ^
$Shortcut.TargetPath = '%INSTALL_DIR%\MindWhisper AI.exe'; ^
$Shortcut.WorkingDirectory = '%INSTALL_DIR%'; ^
$Shortcut.IconLocation = '%INSTALL_DIR%\MindWhisper AI.exe,0'; ^
$Shortcut.Description = 'MindWhisper AI - Stealth AI Assistant'; ^
$Shortcut.Save()"

echo.
echo Creating Desktop shortcut with proper icon...
powershell -Command ^
"$WshShell = New-Object -comObject WScript.Shell; ^
$Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\MindWhisper AI.lnk'); ^
$Shortcut.TargetPath = '%INSTALL_DIR%\MindWhisper AI.exe'; ^
$Shortcut.WorkingDirectory = '%INSTALL_DIR%'; ^
$Shortcut.IconLocation = '%INSTALL_DIR%\MindWhisper AI.exe,0'; ^
$Shortcut.Description = 'MindWhisper AI - Stealth AI Assistant'; ^
$Shortcut.Save()"

echo.
echo Refreshing icon cache...
ie4uinit.exe -show

echo.
echo Refreshing desktop...
rundll32.exe user32.dll,UpdatePerUserSystemParameters

echo.
echo ✅ Start Menu and Desktop shortcuts have been recreated!
echo ✅ The shortcuts should now show the correct MindWhisper AI icon.
echo.
echo Please check:
echo 1. Start Menu: Search for "MindWhisper AI"
echo 2. Desktop: Look for the desktop shortcut
echo.
pause
