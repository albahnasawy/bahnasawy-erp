@echo off
chcp 65001 > nul
cd /d "%~dp0"
title نظام البهنساوي المحاسبي وإدارة المخازن

if not exist "dist\index.html" (
  echo جاري تجهيز ملفات الواجهة لأول مرة...
  call npm run build
)

echo جاري تشغيل خادم البرنامج على المنفذ 4850...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4850/api/health' -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
  start /min "Al-Bahnasawy ERP Server" cmd /c "npm start"
)

echo في انتظار جاهزية النظام...
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4850/api/health' -TimeoutSec 1; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"

where msedge >nul 2>nul
if %errorlevel% equ 0 (
  start "" msedge --app=http://127.0.0.1:4850
) else (
  start "" http://127.0.0.1:4850
)
