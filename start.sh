#!/bin/bash

# Linux服务器群监测响应系统 - 启动脚本 (开发模式)

set -e

echo "=========================================="
echo "  Linux服务器群监测响应系统 启动脚本"
echo "=========================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到Node.js，请先安装Node.js 18+"
    echo "安装方法:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  CentOS/RHEL:   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - && sudo yum install -y nodejs"
    exit 1
fi

# 显示Node.js版本
echo "[信息] Node.js版本:"
node --version
echo ""

# 进入后端目录
cd "$SCRIPT_DIR/backend"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "[信息] 安装后端依赖..."
    npm install
fi

# 检查.env文件
if [ ! -f ".env" ]; then
    echo "[信息] 创建配置文件..."
    cp .env.example .env
    echo "[提示] 请编辑 backend/.env 配置文件"
fi

# 检查数据目录
if [ ! -d "data" ]; then
    mkdir -p data
fi

echo ""
echo "[信息] 启动后端服务..."
echo "[信息] HTTP服务: http://localhost:8000"
echo "[信息] WebSocket: ws://localhost:8001"
echo ""
echo "[提示] 按 Ctrl+C 停止服务"
echo "=========================================="
echo ""

# 启动服务
npm run dev
