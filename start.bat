@echo off
chcp 65001 >nul
title Linux服务器监控系统

echo ==========================================
echo   Linux服务器群监测响应系统 启动脚本
echo ==========================================
echo.

:: 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到Node.js，请先安装Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 显示Node.js版本
echo [信息] Node.js版本:
node --version
echo.

:: 进入后端目录
cd /d "%~dp0backend"

:: 检查依赖
if not exist "node_modules" (
    echo [信息] 安装后端依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 安装依赖失败
        pause
        exit /b 1
    )
)

:: 检查.env文件
if not exist ".env" (
    echo [信息] 创建配置文件...
    copy .env.example .env >nul
)

:: 检查数据目录
if not exist "data" (
    mkdir data
)

echo.
echo [信息] 启动后端服务...
echo [信息] HTTP服务: http://localhost:8000
echo [信息] WebSocket: ws://localhost:8001
echo.
echo [提示] 按 Ctrl+C 停止服务
echo ==========================================
echo.

:: 启动服务
call npm run dev
