@echo off
chcp 65001 >nul
title ArcDream Hub · 弧梦数字中枢
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 Node.js，请先安装 Node 22+： https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo   ArcDream Hub 弧梦数字中枢
echo   正在启动本地服务 http://127.0.0.1:8799 ...
echo.
start "" "http://127.0.0.1:8799/"
node "%~dp0server.mjs"
pause
