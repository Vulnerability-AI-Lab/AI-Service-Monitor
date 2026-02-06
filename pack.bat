@echo off
chcp 65001 >nul 2>&1
title Pack Project

echo ==========================================
echo   Pack Project (exclude node_modules)
echo ==========================================
echo.

cd /d "%~dp0"

set "OUTPUT=%USERPROFILE%\Desktop\AotoBuShu.zip"

echo [INFO] Cleaning temp files...
if exist "%TEMP%\pack_temp" rd /s /q "%TEMP%\pack_temp" 2>nul

echo [INFO] Creating temp directory...
mkdir "%TEMP%\pack_temp\AotoBuShu" 2>nul

echo [INFO] Creating exclude list...
(
echo node_modules
echo dist
echo .db
echo .env
echo __pycache__
echo .pyc
echo .git
) > "%TEMP%\exclude.txt"

echo [INFO] Copying files...

echo   - Root files...
copy "*.bat" "%TEMP%\pack_temp\AotoBuShu\" >nul 2>&1
copy "*.sh" "%TEMP%\pack_temp\AotoBuShu\" >nul 2>&1
copy "*.md" "%TEMP%\pack_temp\AotoBuShu\" >nul 2>&1
copy "*.service" "%TEMP%\pack_temp\AotoBuShu\" >nul 2>&1
copy ".gitignore" "%TEMP%\pack_temp\AotoBuShu\" >nul 2>&1

echo   - backend...
xcopy "backend" "%TEMP%\pack_temp\AotoBuShu\backend\" /E /I /Q /EXCLUDE:%TEMP%\exclude.txt >nul 2>&1

echo   - frontend...
xcopy "frontend" "%TEMP%\pack_temp\AotoBuShu\frontend\" /E /I /Q /EXCLUDE:%TEMP%\exclude.txt >nul 2>&1

echo   - agent...
xcopy "agent" "%TEMP%\pack_temp\AotoBuShu\agent\" /E /I /Q /EXCLUDE:%TEMP%\exclude.txt >nul 2>&1

if exist "docs" (
    echo   - docs...
    xcopy "docs" "%TEMP%\pack_temp\AotoBuShu\docs\" /E /I /Q >nul 2>&1
)

echo.
echo [INFO] Compressing...

if exist "%OUTPUT%" del "%OUTPUT%" >nul 2>&1

powershell -Command "Compress-Archive -Path '%TEMP%\pack_temp\AotoBuShu' -DestinationPath '%OUTPUT%' -Force"

if %errorlevel% neq 0 (
    echo [ERROR] Compress failed!
    goto cleanup
)

echo.
echo ==========================================
echo   Done!
echo ==========================================
echo.
echo Output: %OUTPUT%
echo.

:cleanup
echo [INFO] Cleaning up...
if exist "%TEMP%\pack_temp" rd /s /q "%TEMP%\pack_temp" 2>nul
if exist "%TEMP%\exclude.txt" del "%TEMP%\exclude.txt" 2>nul

echo.
pause
