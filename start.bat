@echo off
title AIPRO Launcher
color 0D

echo.
echo  ============================================
echo         AIPRO - Starting Services...
echo  ============================================
echo.

cd /d "%~dp0"

echo  Closing old processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Closing old node processes...
taskkill /F /IM node.exe >nul 2>&1

timeout /t 1 /nobreak >nul

echo  [1/2] Starting AIPRO Web Server...
start "AIPRO Server" cmd /k "title AIPRO Server && color 0A && cd /d "%~dp0" && node server.js"

timeout /t 3 /nobreak >nul

echo  [2/2] Starting AIPRO Discord Bot...
start "AIPRO Bot" cmd /k "title AIPRO Discord Bot && color 0B && cd /d "%~dp0" && node bot.js"

timeout /t 1 /nobreak >nul

echo.
echo  ============================================
echo   AIPRO is running!
echo   Website: http://localhost:3000
echo  ============================================
echo.

start http://localhost:3000

timeout /t 3 /nobreak >nul
exit
