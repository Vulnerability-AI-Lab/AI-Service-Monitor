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

# ----------------------------------------------------------
# 读取 ports.json — 统一端口配置
# ----------------------------------------------------------
PORTS_FILE="$SCRIPT_DIR/ports.json"
if [ -f "$PORTS_FILE" ] && command -v python3 &>/dev/null; then
    HTTP_PORT=$(python3 -c "import json; c=json.load(open('$PORTS_FILE')); print(c['backend']['http'])")
    WS_PORT=$(python3   -c "import json; c=json.load(open('$PORTS_FILE')); print(c['backend']['websocket'])")
    DEV_PORT=$(python3  -c "import json; c=json.load(open('$PORTS_FILE')); print(c['frontend_dev']['port'])")
    echo "[端口] 从 ports.json 加载: HTTP=$HTTP_PORT  WS=$WS_PORT  前端开发=$DEV_PORT"
else
    # 回退到默认值
    HTTP_PORT=8000
    WS_PORT=8001
    DEV_PORT=5173
    echo "[端口] 未找到 ports.json 或 python3，使用默认端口: HTTP=$HTTP_PORT  WS=$WS_PORT"
fi

# ----------------------------------------------------------
# 检查 Node.js
# ----------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到Node.js，请先安装Node.js 18+"
    echo "安装方法:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  CentOS/RHEL:   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - && sudo yum install -y nodejs"
    exit 1
fi

echo "[信息] Node.js版本: $(node --version)"
echo ""

# ----------------------------------------------------------
# 进入后端目录，同步端口到 .env
# ----------------------------------------------------------
cd "$SCRIPT_DIR/backend"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "[信息] 安装后端依赖..."
    npm install
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "[信息] 创建配置文件..."
    cp .env.example .env
fi

# 将 ports.json 中的端口写入 .env（覆盖 PORT / WS_PORT）
_set_env() {
    local key=$1 val=$2 file=".env"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
}
_set_env PORT    "$HTTP_PORT"
_set_env WS_PORT "$WS_PORT"

# ----------------------------------------------------------
# 同步 vite.config.ts 中的代理目标端口
# ----------------------------------------------------------
VITE_CFG="$SCRIPT_DIR/frontend/vite.config.ts"
if [ -f "$VITE_CFG" ]; then
    sed -i "s|target: 'http://localhost:[0-9]\+'|target: 'http://localhost:${HTTP_PORT}'|g" "$VITE_CFG"
fi

# 检查数据目录
if [ ! -d "data" ]; then
    mkdir -p data
fi

echo ""
echo "[信息] 启动后端服务..."
echo "[信息] HTTP服务:    http://localhost:${HTTP_PORT}"
echo "[信息] WebSocket:   ws://localhost:${WS_PORT}"
echo "[信息] 前端开发:    http://localhost:${DEV_PORT}  (cd frontend && npm run dev)"
echo ""
echo "[提示] 修改端口只需编辑 ports.json 后重新运行此脚本"
echo "[提示] 按 Ctrl+C 停止服务"
echo "=========================================="
echo ""

# 启动服务
npm run dev
