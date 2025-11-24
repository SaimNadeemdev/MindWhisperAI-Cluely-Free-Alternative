@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================
rem   MindWhisper AI - Advanced Windows Build Orchestrator
rem ============================================================

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul 2>&1

rem Defaults
set "MODE=deepgram"
set "ARCH=auto"
set "CLEAN=0"
set "SKIPINSTALL=0"
set "VERBOSE=0"
set "DEBUGFLAG=0"
set "HASARGS=0"
set "INTERNET=1"
set "SKIP_PY_SETUP=0"

rem ------------------------
rem Parse CLI arguments
rem ------------------------
:parse_args
if "%~1"=="" goto args_done
set "ARG=%~1"
set "HASARGS=1"
if /I "%ARG%"=="/quick"      set "MODE=quick"& shift & goto parse_args
if /I "%ARG%"=="/deepgram"   set "MODE=deepgram"& shift & goto parse_args
if /I "%ARG%"=="/full"       set "MODE=full"& shift & goto parse_args
if /I "%ARG:~0,6%"=="/arch:" set "ARCH=%ARG:~6%"& shift & goto parse_args
if /I "%ARG%"=="/clean"      set "CLEAN=1"& shift & goto parse_args
if /I "%ARG%"=="/skipinstall" set "SKIPINSTALL=1"& shift & goto parse_args
if /I "%ARG%"=="/verbose"    set "VERBOSE=1"& shift & goto parse_args
if /I "%ARG%"=="/debug"      set "DEBUGFLAG=1"& set "VERBOSE=1"& shift & goto parse_args
if /I "%ARG%"=="/help"       goto :usage
echo [WARN] Unknown option: %ARG%
goto :usage
:args_done

rem ------------------------
rem Interactive menu (no args provided)
rem ------------------------
if %HASARGS%==0 (
  call :menu
)

rem Timestamp for logs
for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "[DateTime]::Now.ToString('yyyyMMdd-HHmmss')"`) do set "STAMP=%%t"
set "LOGDIR=%SCRIPT_DIR%build-logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set "LOGFILE=%LOGDIR%\build-%STAMP%.log"

if %VERBOSE%==1 (
  set "DEBUG=electron-builder"
  set "npm_config_loglevel=verbose"
) else (
  set "npm_config_loglevel=warn"
)

set "NODE_OPTIONS=--max_old_space_size=4096"

echo Beginning build at %DATE% %TIME% > "%LOGFILE%"
echo Mode: %MODE%, Arch: %ARCH%, Clean: %CLEAN%, SkipInstall: %SKIPINSTALL%>>"%LOGFILE%"

rem ------------------------
rem Sanity checks
rem ------------------------
where node >nul 2>&1 || (echo [ERR] Node.js not found. Install Node LTS and try again. & exit /b 1)
where npm  >nul 2>&1 || (echo [ERR] npm not found on PATH. & exit /b 1)

for /f "tokens=*" %%v in ('node -v') do set "NODEV=%%v"
for /f "tokens=*" %%v in ('npm -v') do set "NPMV=%%v"
echo Node: %NODEV%  NPM: %NPMV%
echo Node: %NODEV%  NPM: %NPMV%>>"%LOGFILE%"

if not exist "%SCRIPT_DIR%package.json" (
  echo [ERR] package.json not found in %CD%. Please run this script from the MindWhisperAI folder.
  popd >nul 2>&1
  exit /b 1
)

rem ------------------------
rem Internet connectivity check (ping python.org)
rem ------------------------
ping -n 1 www.python.org >nul 2>&1
if errorlevel 1 (
  set "INTERNET=0"
  echo [WARN] No internet connectivity detected (DNS or network issue).
  echo         Some steps (npm install, Python download, pip installs) require internet.
  echo.
  if exist "%SCRIPT_DIR%node_modules" (
    echo Detected node_modules locally.
  ) else (
    echo [WARN] node_modules folder not found. Building offline will likely fail unless dependencies are preinstalled.
  )
  if exist "%SCRIPT_DIR%python-portable\python.exe" (
    echo Detected existing portable Python at python-portable\python.exe
    set "SKIP_PY_SETUP=1"
  ) else (
    echo [WARN] python-portable not found. Checking previous build outputs for a portable Python...
    if exist "%SCRIPT_DIR%release\win-unpacked\resources\python-portable\python.exe" (
      echo Found portable Python in release\win-unpacked\resources. Copying to project root...
      xcopy /E /I /Y "%SCRIPT_DIR%release\win-unpacked\resources\python-portable" "%SCRIPT_DIR%python-portable" >nul 2>&1
      if exist "%SCRIPT_DIR%python-portable\python.exe" (
        echo Copied portable Python successfully.
        set "SKIP_PY_SETUP=1"
      ) else (
        echo [WARN] Auto-copy failed. You can manually copy the folder to MindWhisperAI\python-portable.
      )
    ) else (
      echo [WARN] No previous portable Python found under release\win-unpacked\resources.
      echo        Full/Deepgram setup will fail offline unless pre-seeded.
    )
  )
  choice /C YN /N /M "Proceed in OFFLINE mode with best-effort? [Y/N]: "
  if errorlevel 2 (
    echo Aborting due to no internet.
    popd >nul 2>&1
    exit /b 1
  )
)

rem ------------------------
rem Optional clean
rem ------------------------
if %CLEAN%==1 (
  echo Cleaning old build artifacts...
  call :run "npm run clean"
  call :run "npm run clean:cache"
  if exist release rd /s /q release
  if exist dist rd /s /q dist
  if exist dist-electron rd /s /q dist-electron
)

rem ------------------------
rem Install dependencies
rem ------------------------
if %SKIPINSTALL%==0 (
  if %INTERNET%==1 (
    if exist package-lock.json (
      call :run "npm ci"
    ) else (
      call :run "npm install"
    )
  ) else (
    echo [OFFLINE] Skipping npm install/ci due to no internet.
  )
)

rem Verify electron-builder is available (fallback to local binary if offline)
call :check_builder

rem ------------------------
rem Build modes
rem ------------------------
if /I "%MODE%"=="quick"     goto do_quick
if /I "%MODE%"=="full"      goto do_full
                              goto do_deepgram

:do_deepgram
echo [Step] Preparing portable Python (Deepgram only)...
if %SKIP_PY_SETUP%==1 (
  echo [OFFLINE] Skipping Python setup (existing python-portable detected)
) else (
  if %INTERNET%==1 (
    call :run "node setup-portable-python-deepgram-only.js"
  ) else (
    echo [ERR] Offline and no existing python-portable. Cannot continue Deepgram setup.
    exit /b 1
  )
)
if /I "%ARCH%"=="auto" (
  call :run "npm run app:build"
) else (
  call :build_stepwise "%ARCH%"
)
goto :done

:do_full
echo [Step] Preparing portable Python (full)...
if %SKIP_PY_SETUP%==1 (
  echo [OFFLINE] Skipping Python setup (existing python-portable detected)
) else (
  if %INTERNET%==1 (
    call :run "npm run setup:python"
  ) else (
    echo [ERR] Offline and no existing python-portable. Cannot continue Full setup.
    exit /b 1
  )
)
if /I "%ARCH%"=="auto" (
  call :run "npm run app:build"
) else (
  call :build_stepwise "%ARCH%"
)
goto :done

:do_quick
echo [Step] Quick build (no portable Python setup)...
if /I "%ARCH%"=="auto" (
  call :run "npm run app:build"
) else (
  call :build_stepwise "%ARCH%"
)
goto :done

:build_stepwise
set "TARGET_ARCH=%~1"
echo [Step] Building frontend and electron (arch=%TARGET_ARCH%)...
call :run "npm run build"
call :run "npm run build:electron"
call :run "npm run build:icon"
call :run "npm run clean:cache"
if /I "%TARGET_ARCH%"=="x64" (
  call :run "npx electron-builder --win --x64"
) else if /I "%TARGET_ARCH%"=="ia32" (
  call :run "npx electron-builder --win --ia32"
) else (
  echo [ERR] Unsupported arch: %TARGET_ARCH%
  exit /b 1
)
call :run "npm run embed:icon"
goto :eof

:check_builder
rem Try local electron-builder first
if exist "%SCRIPT_DIR%node_modules\.bin\electron-builder.cmd" (
  "%SCRIPT_DIR%node_modules\.bin\electron-builder.cmd" -V 1>>"%LOGFILE%" 2>&1
  if not errorlevel 1 goto :eof
)
rem Try npx without install (uses local if present)
call npx --no-install electron-builder -V 1>>"%LOGFILE%" 2>&1
if not errorlevel 1 goto :eof
rem As last resort, try npx (may need internet)
if %INTERNET%==1 (
  call npx electron-builder -V 1>>"%LOGFILE%" 2>&1
  if not errorlevel 1 goto :eof
)
echo [WARN] electron-builder availability check failed. Continuing; build may still succeed if scripts resolve it.
goto :eof

:menu
echo ============================================================
echo   MindWhisper AI - Build Orchestrator (Interactive Mode)
echo ============================================================
echo.
echo Select build mode:
echo   [Q] Quick (no portable Python setup)
echo   [D] Deepgram-only setup then build (default)
echo   [F] Full portable Python setup then build
choice /C QDF /N /M "Choice [Q/D/F]: "
if errorlevel 3 set "MODE=full" & goto arch_select
if errorlevel 2 set "MODE=deepgram" & goto arch_select
if errorlevel 1 set "MODE=quick" & goto arch_select

:arch_select
echo.
echo Select architecture:
echo   [A] Auto (as configured in electron-builder)
echo   [X] x64 only
echo   [I] ia32 only
choice /C AXI /N /M "Choice [A/X/I]: "
if errorlevel 3 set "ARCH=ia32" & goto clean_select
if errorlevel 2 set "ARCH=x64"  & goto clean_select
if errorlevel 1 set "ARCH=auto" & goto clean_select

:clean_select
echo.
choice /C YN /N /M "Clean previous build artifacts? [Y/N]: "
if errorlevel 2 set "CLEAN=0" & goto skip_select
if errorlevel 1 set "CLEAN=1" & goto skip_select

:skip_select
echo.
choice /C YN /N /M "Skip npm install/ci? [Y/N]: "
if errorlevel 2 set "SKIPINSTALL=0" & goto verbose_select
if errorlevel 1 set "SKIPINSTALL=1" & goto verbose_select

:verbose_select
echo.
choice /C YN /N /M "Verbose logging? [Y/N]: "
if errorlevel 2 set "VERBOSE=0" & goto menu_done
if errorlevel 1 set "VERBOSE=1" & goto menu_done

:menu_done
echo.
echo [CONFIG] MODE=%MODE%, ARCH=%ARCH%, CLEAN=%CLEAN%, SKIPINSTALL=%SKIPINSTALL%, VERBOSE=%VERBOSE%
echo.
goto :eof

:run
set "CMD=%~1"
echo === RUN: %CMD%
call %CMD% 1>>"%LOGFILE%" 2>&1
if errorlevel 1 (
  echo [FAIL] %CMD% (see %LOGFILE%)
  echo [FAIL] %CMD%>>"%LOGFILE%"
  popd >nul 2>&1
  exit /b 1
)
goto :eof

:usage
echo.
echo Usage: build-electron.bat [/quick ^| /deepgram ^| /full] [/arch:x64^|ia32] [/clean] [/skipinstall] [/verbose] [/debug]
echo   /quick       Build app with current deps (no portable Python setup)
echo   /deepgram    Setup portable Python (Deepgram-only) then build  [DEFAULT]
echo   /full        Setup full portable Python then build
echo   /arch:x64    Force 64-bit build only (overrides electron-builder config)
echo   /arch:ia32   Force 32-bit build only
echo   /clean       Remove release, dist, dist-electron and caches before build
echo   /skipinstall Skip npm install/ci
echo   /verbose     Verbose logs; also sets DEBUG=electron-builder
echo   /debug       Alias for /verbose
echo.
echo Examples:
echo   build-electron.bat
echo   build-electron.bat /quick /arch:x64 /clean
echo   build-electron.bat /full /skipinstall /verbose
popd >nul 2>&1
exit /b 1

:done
echo.
echo [SUCCESS] Build completed. Artifacts are in the "release" folder.
echo   Log file: %LOGFILE%
popd >nul 2>&1
exit /b 0
