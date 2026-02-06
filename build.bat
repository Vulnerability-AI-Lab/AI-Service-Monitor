@echo off
chcp 65001 >nul
title 构建生产版本

echo ==========================================
echo   构建生产版本
echo ==========================================
echo.

:: 构建前端
echo [1/3] 构建前端...
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [信息] 安装前端依赖...
    call npm install
)

call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)

echo [完成] 前端已构建到 backend/public 目录
echo.

:: 构建后端
echo [2/3] 构建后端...
cd /d "%~dp0backend"

if not exist "node_modules" (
    echo [信息] 安装后端依赖...
    call npm install
)

call npm run build
if %errorlevel% neq 0 (
    echo [错误] 后端构建失败
    pause
    exit /b 1
)

echo [完成] 后端已构建到 backend/dist 目录
echo.

:: 创建.env
echo [3/3] 检查配置文件...
if not exist ".env" (
    copy .env.example .env >nul
    echo [信息] 已创建 .env 配置文件，请根据需要修改
)

echo.
echo ==========================================
echo   构建完成！
echo ==========================================
echo.
echo 启动生产服务:
echo   cd backend
echo   npm start
echo.
echo 或使用PM2:
echo   pm2 start dist/index.js --name server-monitor
echo.
pause
