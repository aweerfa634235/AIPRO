@echo off
cd /d "%~dp0"
set GIT="C:\Program Files\Git\bin\git.exe"

%GIT% add .
%GIT% -c user.email="aipro@aipro.com" -c user.name="AIPRO" commit -m "update"
%GIT% push origin main

echo.
echo Done! Railway will update in ~30 seconds.
pause
