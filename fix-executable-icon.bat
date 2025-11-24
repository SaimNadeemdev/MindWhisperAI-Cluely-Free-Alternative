@echo off
echo Fixing MindWhisper AI Executable Icon
echo ====================================

echo.
echo Locating MindWhisper AI executable...

:: Find the executable in release directory
set "EXE_PATH="
if exist "release\win-unpacked\MindWhisper AI.exe" (
    set "EXE_PATH=release\win-unpacked\MindWhisper AI.exe"
) else if exist "release\win-ia32-unpacked\MindWhisper AI.exe" (
    set "EXE_PATH=release\win-ia32-unpacked\MindWhisper AI.exe"
) else (
    echo Error: MindWhisper AI executable not found in release directory!
    echo Please run 'npm run dist' first to build the application.
    pause
    exit /b 1
)

echo Found executable: %EXE_PATH%

:: Check if icon file exists
if not exist "build\icons\win\icon.ico" (
    echo Error: Icon file not found at build\icons\win\icon.ico
    echo Please run 'npm run build:icon' first.
    pause
    exit /b 1
)

echo Found icon file: build\icons\win\icon.ico

echo.
echo Attempting to embed icon into executable...

:: Method 1: Try using rcedit (if available)
echo Trying rcedit...
npx rcedit "%EXE_PATH%" --set-icon "build\icons\win\icon.ico" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Successfully embedded icon using rcedit!
    goto :success
)

:: Method 2: Try using ResourceHacker (if available)
echo Trying ResourceHacker...
ResourceHacker.exe -open "%EXE_PATH%" -save "%EXE_PATH%" -action addoverwrite -res "build\icons\win\icon.ico" -mask ICONGROUP,1, 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Successfully embedded icon using ResourceHacker!
    goto :success
)

:: Method 3: Install rcedit and try again
echo Installing rcedit...
npm install rcedit --save-dev
if %ERRORLEVEL% EQU 0 (
    echo Trying rcedit again after installation...
    npx rcedit "%EXE_PATH%" --set-icon "build\icons\win\icon.ico"
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Successfully embedded icon using rcedit!
        goto :success
    )
)

echo ❌ Could not embed icon automatically.
echo.
echo Manual solutions:
echo 1. Install ResourceHacker: https://www.angusj.com/resourcehacker/
echo 2. Or rebuild the entire app: npm run dist
echo 3. The new build process should embed the icon properly
goto :end

:success
echo.
echo 🎉 Icon embedding completed successfully!
echo.
echo The executable should now show your custom MindWhisper AI icon.
echo You can verify this by:
echo 1. Looking at the file in Windows Explorer
echo 2. Installing the app and checking the Start Menu
echo.

:end
pause
