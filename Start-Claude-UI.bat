@echo off
cd /d C:\Users\majaus\Desktop\Majaus\Proyectos\2026\claudecodeui

:: Kill any previous node process on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001.*LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Build
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    goto :eof
)

:: Open browser and start server
start http://localhost:3001
node server/index.js

:: If server crashes, don't close window
pause
