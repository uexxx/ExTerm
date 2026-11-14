@echo off
setlocal EnableExtensions
title ExTerm - one-click upload to GitHub
cd /d "%~dp0"
set "REPO=https://github.com/uexxx/novaterm-pioneering-trading-terminals.git"

echo.
echo   ExTerm - one-click upload to GitHub
echo   =====================================
echo   Copies everything in this folder into your GitHub repo and pushes it.
echo   Files that are already in the repo but not in this folder are left alone.
echo.

if not exist "README.md" goto wrongfolder
if not exist "src\index.html" goto wrongfolder

rem ---- Git (installed automatically if missing) ----
where git >nul 2>nul
if not errorlevel 1 goto havegit
echo   Git isn't installed. Installing it now (one time only)...
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Couldn't install Git automatically. Install it from https://git-scm.com/download/win
  echo   then double-click this file again.
  goto fail
)
:havegit

rem ---- which repo ----
echo   Repo: %REPO%
set "ANS="
set /p "ANS=  Press Enter to use it, or paste a different repo URL: "
if not "%ANS%"=="" set "REPO=%ANS%"

set "WORK=%TEMP%\exterm-upload-%RANDOM%%RANDOM%"
echo.
echo   Downloading your repo. The first time, a GitHub sign-in window opens: sign in and come back here.
git clone --depth 1 "%REPO%" "%WORK%"
if errorlevel 1 (
  echo.
  echo   Couldn't open the repo. Check the URL and that you signed in to the right GitHub account.
  goto fail
)

echo   Copying the ExTerm files...
robocopy "%~dp0." "%WORK%" /E /XD .git __pycache__ node_modules /XF *.zip *.pyc /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo   Copying failed.
  goto fail
)

cd /d "%WORK%"
git config user.name >nul 2>nul || git config user.name "ExTerm uploader"
git config user.email >nul 2>nul || git config user.email "exterm-uploader@users.noreply.github.com"
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo   Nothing to upload: your repo already has these exact files.
  goto done
)
git commit -q -m "ExTerm v14: saved to your computer, rate-limit fixes, P&L calendar, strategy compare, risk of ruin, shortcuts"
echo   Uploading...
git push
if errorlevel 1 (
  echo.
  echo   The upload was refused. Make sure the GitHub account you signed in with can push to this repo.
  goto fail
)
echo.
echo   Done! Your repo is updated, pictures included. Opening it in your browser...

:done
cd /d "%~dp0"
rmdir /s /q "%WORK%" >nul 2>nul
start "" "%REPO:.git=%"
echo.
pause
exit /b 0

:wrongfolder
echo   Put this file inside the unzipped "exterm" folder (next to README.md) and double-click it there.
:fail
cd /d "%~dp0"
if defined WORK rmdir /s /q "%WORK%" >nul 2>nul
echo.
pause
exit /b 1
