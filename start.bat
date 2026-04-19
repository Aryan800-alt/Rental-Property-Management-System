@echo off
setlocal enabledelayedexpansion

title FlatFinder - Starting
color 0A
cls

echo.
echo ============================================
echo  FlatFinder ^| Starting Server...
echo ============================================
echo.

:: ── Check Node.js ──
where node >nul 2>&1
if not %errorlevel%==0 (
    color 0C
    echo [ERROR] Node.js is not installed.
    echo Install from: https://nodejs.org
    pause
    exit /b 1
)

:: ── Ensure .env exists ──
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from template...
        copy ".env.example" ".env" >nul
    )
)

:: ── Validate DB placeholder ──
if exist ".env" (
    findstr /C:"your_mysql_password" ".env" >nul 2>&1
    if !errorlevel! == 0 (
        color 0E
        echo [WARN] Default DB password detected in .env
        echo Update DB_PASSWORD before production use.
        echo.
    )
)

:: ── Install dependencies (robust check) ──
if not exist "node_modules" (
    call :INSTALL
) else (
    if not exist "node_modules\express" call :INSTALL
)

goto AFTER_INSTALL

:INSTALL
echo [INFO] Installing dependencies...
call npm install
if not !errorlevel! == 0 (
    color 0C
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
goto :eof

:AFTER_INSTALL

:: ── Free port 3000 safely ──
echo [INFO] Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo [INFO] Terminating PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Start server (no blocking pause) ──
echo [INFO] Starting server...
start "FlatFinder Server" cmd /c "node server.js"

:: ── Wait loop with fallback ──
echo [INFO] Waiting for server...
set tries=0

:WAIT
set /a tries+=1
if !tries! gtr 15 goto READY

timeout /t 1 >nul

powershell -Command ^
"try {Invoke-WebRequest http://localhost:3000/api/ping -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0} catch {exit 1}" >nul 2>&1

if !errorlevel! == 0 goto READY
goto WAIT

:READY
echo.
echo ============================================
echo  Server running: http://localhost:3000
echo ============================================
echo.

start "" "http://localhost:3000"

echo Server running in background.
echo Close server window to stop.
pause >nul

endlocal
exit /b 0