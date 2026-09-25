@echo off
cd /d "%~dp0"
echo ===================================================
echo   ADR Pro (v2) - Build Android APK with Expo EAS
echo ===================================================
echo.
echo [1/4] Installing packages...
if exist node_modules\expo\package.json (
  echo Packages already installed - skipping.
) else (
  call npm install --no-audit --no-fund --legacy-peer-deps --loglevel http
  if errorlevel 1 goto fail
)
call node scripts\sync-shared.js
echo.
echo [2/4] Expo tool (EAS CLI)...
where eas >nul 2>nul
if errorlevel 1 (
  echo Checking internet connection to npm...
  call npm ping
  echo Installing EAS CLI once - you will see download lines below, this is normal.
  call npm install -g eas-cli --no-audit --no-fund --loglevel http
  if errorlevel 1 goto fail
) else (
  echo EAS CLI already installed - skipping.
)
echo.
echo Expo account login (first time only)...
call eas whoami
if errorlevel 1 call eas login
if errorlevel 1 goto fail
echo.
echo [3/4] Link project to your Expo account (first time only - answer Y)...
call eas init
echo.
echo [4/4] Building the APK on Expo servers (10-20 minutes)...
echo      If asked about a Keystore choose: Generate new keystore
call eas build --platform android --profile preview
if errorlevel 1 goto fail
echo.
echo DONE! The APK download link is shown above - open it on the phone.
pause
exit /b 0
:fail
echo.
echo ERROR - copy everything above and send it to Claude.
pause
exit /b 1
