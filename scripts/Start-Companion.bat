@echo off
setlocal
title Companion Explorer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Companion.ps1"
if errorlevel 1 (
  echo.
  pause
)
exit /b %ERRORLEVEL%