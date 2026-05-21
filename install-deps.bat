@echo off
cd /d "%~dp0"
echo Installing npm packages...
call npm.cmd install
echo.
echo Installing Chromium for Playwright...
call npx.cmd playwright install chromium
echo.
echo Done. Double-click run-step1-create.bat to test Odoo order creation.
pause
