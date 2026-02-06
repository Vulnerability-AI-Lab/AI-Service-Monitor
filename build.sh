#!/bin/bash

# Linux服务器群监测响应系统 - 构建脚本 (生产版本)

set -e

echo "=========================================="
echo "  构建生产版本"
echo "=========================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到Node.js，请先安装Node.js 18+"
    exit 1
fi

# 构建前端
echo "[1/3] 构建前端..."
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "[信息] 安装前端依赖..."
    npm install
fi

# 跳过类型检查直接构建（避免vue-tsc兼容性问题）
npx vite build

# 由于vite配置可能有路径问题，手动复制
if [ -d "dist" ] && [ -d "dist/assets" ]; then
    echo "[信息] 复制前端文件到 backend/public..."
    rm -rf "$SCRIPT_DIR/backend/public/"*
    cp -r dist/* "$SCRIPT_DIR/backend/public/"
fi

echo "[完成] 前端已构建到 backend/public 目录"
echo ""

# 构建后端
echo "[2/3] 构建后端..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "node_modules" ]; then
    echo "[信息] 安装后端依赖..."
    npm install
fi

npm run build

echo "[完成] 后端已构建到 backend/dist 目录"
echo ""

# 创建.env
echo "[3/3] 检查配置文件..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[信息] 已创建 .env 配置文件，请根据需要修改"
fi

# 检查数据目录
if [ ! -d "data" ]; then
    mkdir -p data
fi

echo ""
echo "=========================================="
echo "  构建完成！"
echo "=========================================="
echo ""
echo "启动生产服务:"
echo "  cd backend"
echo "  npm start"
echo ""
echo "或使用PM2 (推荐):"
echo "  pm2 start dist/index.js --name server-monitor"
echo ""
echo "或使用systemd服务:"
echo "  sudo cp server-monitor.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable server-monitor"
echo "  sudo systemctl start server-monitor"
echo ""
