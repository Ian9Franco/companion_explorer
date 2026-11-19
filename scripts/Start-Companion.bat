@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Companion.ps1"
exit /b %ERRORLEVEL%