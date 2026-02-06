#!/bin/bash

# Linux服务器群监测响应系统 - Linux工作站一键安装脚本

set -e

echo "=========================================="
echo "  Linux服务器监控系统 - 安装脚本"
echo "=========================================="
echo ""

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "[错误] 请使用root权限运行此脚本"
    echo "使用方法: sudo ./install-linux.sh"
    exit 1
fi

# 安装目录
INSTALL_DIR="/opt/server-monitor"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查并安装Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            echo "[信息] Node.js $(node -v) 已安装"
            return 0
        fi
    fi

    echo "[信息] 安装Node.js 18..."

    # 检测系统类型
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        # CentOS/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs
    else
        echo "[错误] 不支持的Linux发行版，请手动安装Node.js 18+"
        exit 1
    fi

    echo "[完成] Node.js $(node -v) 安装成功"
}

# 安装PM2
install_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo "[信息] 安装PM2..."
        npm install -g pm2
        echo "[完成] PM2 安装成功"
    else
        echo "[信息] PM2 已安装"
    fi
}

# 主安装流程
main() {
    echo "[1/6] 检查并安装Node.js..."
    install_nodejs
    echo ""

    echo "[2/6] 安装PM2..."
    install_pm2
    echo ""

    echo "[3/6] 创建安装目录..."
    mkdir -p "$INSTALL_DIR"

    # 复制文件
    echo "[信息] 复制文件到 $INSTALL_DIR..."
    cp -r "$SCRIPT_DIR/backend" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/frontend" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/start.sh" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/build.sh" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/start.sh" "$INSTALL_DIR/build.sh"
    echo ""

    echo "[4/6] 安装依赖..."
    cd "$INSTALL_DIR/backend"
    npm install --production=false

    cd "$INSTALL_DIR/frontend"
    npm install
    echo ""

    echo "[5/6] 构建项目..."
    cd "$INSTALL_DIR"
    ./build.sh
    echo ""

    echo "[6/6] 配置systemd服务..."
    cp "$SCRIPT_DIR/server-monitor.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable server-monitor
    echo ""

    # 创建配置文件
    cd "$INSTALL_DIR/backend"
    if [ ! -f ".env" ]; then
        cp .env.example .env
        echo "[提示] 请编辑 $INSTALL_DIR/backend/.env 配置文件"
    fi

    echo ""
    echo "=========================================="
    echo "  安装完成！"
    echo "=========================================="
    echo ""
    echo "启动服务:"
    echo "  sudo systemctl start server-monitor"
    echo ""
    echo "查看状态:"
    echo "  sudo systemctl status server-monitor"
    echo ""
    echo "查看日志:"
    echo "  sudo journalctl -u server-monitor -f"
    echo ""
    echo "或使用PM2管理:"
    echo "  cd $INSTALL_DIR/backend"
    echo "  pm2 start dist/index.js --name server-monitor"
    echo "  pm2 save"
    echo "  pm2 startup"
    echo ""
    echo "访问地址: http://$(hostname -I | awk '{print $1}'):8000"
    echo "默认账号: admin / admin123"
    echo ""
}

main "$@"
