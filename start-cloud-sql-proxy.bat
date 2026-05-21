@echo off
setlocal

rem ── Cloud SQL Auth Proxy (run this before pgAdmin / DB queries) ─────────────
rem 1. Put cloud-sql-proxy.exe in the "tools" folder next to this script, OR
rem    set PROXY_DIR below to the folder that already contains the .exe
rem 2. Ensure platraw-key.json exists at GOOGLE_APPLICATION_CREDENTIALS path

set "GOOGLE_APPLICATION_CREDENTIALS=C:\Users\Ahmed Sobhy\Downloads\platraw-key.json"
set "CLOUD_SQL_INSTANCE=platraw:europe-west1:xlabs-platraw-db-postgres-testing"
set "PROXY_HOST=127.0.0.1"
set "PROXY_PORT=5433"

rem Folder containing cloud-sql-proxy.exe
set "PROXY_DIR=%~dp0tools"
if not exist "%PROXY_DIR%\cloud-sql-proxy.exe" set "PROXY_DIR=%~dp0"
if not exist "%PROXY_DIR%\cloud-sql-proxy.exe" set "PROXY_DIR=C:\Users\Ahmed Sobhy\Downloads"

cd /d "%PROXY_DIR%"

if not exist "cloud-sql-proxy.exe" (
  echo.
  echo ERROR: cloud-sql-proxy.exe not found in:
  echo   %PROXY_DIR%
  echo.
  echo Download from https://cloud.google.com/sql/docs/postgres/sql-proxy
  echo and place it in: %~dp0tools\
  echo.
  pause
  exit /b 1
)

if not exist "%GOOGLE_APPLICATION_CREDENTIALS%" (
  echo.
  echo ERROR: Service account key not found:
  echo   %GOOGLE_APPLICATION_CREDENTIALS%
  echo.
  pause
  exit /b 1
)

echo.
echo GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%
echo Instance: %CLOUD_SQL_INSTANCE%
echo Listening: %PROXY_HOST%:%PROXY_PORT%
echo.
echo Keep this window open while using pgAdmin.
echo pgAdmin: Host=%PROXY_HOST% Port=%PROXY_PORT% User=admin Database=dbstaging
echo.

set "GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%"
cloud-sql-proxy.exe %CLOUD_SQL_INSTANCE% --address %PROXY_HOST% --port %PROXY_PORT%

pause
