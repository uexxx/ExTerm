@echo off
setlocal EnableExtensions
title ExTerm
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
echo.
echo  ExTerm - checking what's needed...
call :check_winget
call :ensure_chrome
call :ensure_python
echo.
echo  Starting ExTerm with LIVE data. Keep this window open while you use the app.
echo.
if defined PY (
  "%PY%" serve.py
) else (
  echo  Using the built-in Windows PowerShell server instead - no install needed.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
)
echo.
pause
exit /b

:has_chrome
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && exit /b 0
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && exit /b 0
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" exit /b 0
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" exit /b 0
exit /b 1

:ensure_chrome
call :has_chrome && (
  echo   [ok] Google Chrome found
  exit /b 0
)
if not defined HAVE_WINGET (
  echo   [--] Chrome not found - ExTerm will open in your default browser instead.
  exit /b 0
)
echo   [..] Google Chrome not found - downloading and installing it now, one time only...
winget install -e --id Google.Chrome --silent --accept-source-agreements --accept-package-agreements
call :has_chrome && (
  echo   [ok] Google Chrome installed
  exit /b 0
)
echo   [--] Chrome didn't install - ExTerm will open in your default browser instead.
exit /b 0

REM ---------------- helpers ----------------
:check_winget
set "HAVE_WINGET="
where winget >nul 2>nul && set "HAVE_WINGET=1"
exit /b 0

:find_python
set "PY="
for /f "delims=" %%P in ('py -3 -c "import sys;sys.version_info>=(3,10) and print(sys.executable)" 2^>nul') do set "PY=%%P"
if defined PY exit /b 0
for /f "delims=" %%P in ('python -c "import sys;sys.version_info>=(3,10) and print(sys.executable)" 2^>nul') do set "PY=%%P"
if defined PY exit /b 0
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
  if exist "%%D\python.exe" for /f "delims=" %%P in ('""%%D\python.exe" -c "import sys;sys.version_info>=(3,10) and print(sys.executable)"" 2^>nul') do set "PY=%%P"
)
exit /b 0

:ensure_python
call :find_python
if defined PY (
  echo   [ok] Python found
  exit /b 0
)
if not defined HAVE_WINGET (
  echo   [!!] Python 3.10+ is missing and winget isn't available to install it.
  echo        Install Python from https://www.python.org/downloads/ and tick "Add to PATH".
  exit /b 1
)
echo   [..] Python not found - downloading and installing it now. This takes a minute, one time only.
winget install -e --id Python.Python.3.12 --scope user --silent --accept-source-agreements --accept-package-agreements
call :find_python
if defined PY (
  echo   [ok] Python installed
  exit /b 0
)
echo   [!!] Python was installed, but this window can't see it yet.
echo        Close this window and double-click start-exterm.bat again - or just keep going: ExTerm works without it.
exit /b 1
