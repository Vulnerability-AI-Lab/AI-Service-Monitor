@echo off
chcp 65001 >nul
title 前端开发服务器

echo ==========================================
echo   前端开发服务器
echo ==========================================
echo.

:: 进入前端目录
cd /d "%~dp0frontend"

:: 检查依赖
if not exist "node_modules" (
    echo [信息] 安装前端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 安装依赖失败
        pause
        exit /b 1
    )
)

echo.
echo [信息] 启动前端开发服务器...
echo [信息] 访问地址: http://localhost:5173
echo.

:: 启动开发服务器
call npm run dev
