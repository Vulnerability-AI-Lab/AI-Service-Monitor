#!/bin/bash
# ============================================
# Linux Server Monitor Agent 安装脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
INSTALL_DIR="/opt/server-monitor-agent"
SERVICE_NAME="server-monitor-agent"
PYTHON_MIN_VERSION="3.9"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[$1/5]${NC} $2"
}

# 横幅
print_banner() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Linux Server Monitor Agent Installer ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 检查root权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用root权限运行此脚本"
        echo "  sudo ./install.sh"
        exit 1
    fi
}

# 检查Python版本
check_python() {
    log_step 1 "检查Python环境..."

    # 查找python3
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        log_error "未找到Python，请先安装Python 3.9+"
        exit 1
    fi

    # 检查版本
    PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    log_info "Python版本: $PYTHON_VERSION"

    # 版本比较
    if [ "$(printf '%s\n' "$PYTHON_MIN_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$PYTHON_MIN_VERSION" ]; then
        log_error "需要Python $PYTHON_MIN_VERSION 或更高版本"
        exit 1
    fi

    # 检查pip
    if ! $PYTHON_CMD -m pip --version &> /dev/null; then
        log_warn "pip未安装，正在安装..."
        $PYTHON_CMD -m ensurepip --upgrade || {
            log_error "安装pip失败"
            exit 1
        }
    fi

    log_info "Python环境检查通过"
}

# 安装Agent
install_agent() {
    log_step 2 "安装Agent文件..."

    # 创建目录
    mkdir -p $INSTALL_DIR
    mkdir -p $INSTALL_DIR/src
    mkdir -p $INSTALL_DIR/src/collectors
    mkdir -p $INSTALL_DIR/logs

    # 获取脚本所在目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # 复制文件
    cp -r "$SCRIPT_DIR/src/"* $INSTALL_DIR/src/
    cp "$SCRIPT_DIR/requirements.txt" $INSTALL_DIR/

    # 设置权限
    chmod +x $INSTALL_DIR/src/main.py

    log_info "文件已安装到 $INSTALL_DIR"
}

# 安装依赖
install_dependencies() {
    log_step 3 "安装Python依赖..."

    cd $INSTALL_DIR
    $PYTHON_CMD -m pip install -r requirements.txt -q

    log_info "依赖安装完成"
}

# 配置Agent
configure_agent() {
    log_step 4 "配置Agent..."

    CONFIG_FILE="$INSTALL_DIR/config.yaml"

    if [ -f "$CONFIG_FILE" ]; then
        log_warn "配置文件已存在，跳过配置"
        return
    fi

    echo ""
    read -p "请输入监控服务器地址 (如 http://192.168.1.10:3000): " SERVER_URL
    read -p "请输入Agent ID (留空自动生成): " AGENT_ID

    # 自动生成Agent ID
    if [ -z "$AGENT_ID" ]; then
        HOSTNAME=$(hostname)
        MACHINE_ID=$(cat /etc/machine-id 2>/dev/null | head -c 8 || echo "$(hostname)")
        AGENT_ID="${HOSTNAME}-${MACHINE_ID}"
    fi

    # 创建配置文件
    cat > $CONFIG_FILE << EOF
# Linux Server Monitor Agent 配置文件
# 自动生成于: $(date)

# 监控服务器地址
server_url: "$SERVER_URL"

# Agent唯一标识
agent_id: "$AGENT_ID"

# 数据采集间隔（秒）
collect_interval: 5

# API密钥（可选）
api_key: ""

# 日志级别
log_level: "INFO"

# 是否启用GPU监控
enable_gpu: true

# 采集的磁盘挂载点（留空则采集所有）
disk_mounts: []

# 网络接口名称（留空则自动检测）
network_interface: ""
EOF

    log_info "配置文件已创建: $CONFIG_FILE"
    log_info "Agent ID: $AGENT_ID"
}

# 安装系统服务
install_service() {
    log_step 5 "安装系统服务..."

    # 创建systemd服务文件
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Linux Server Monitor Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$PYTHON_CMD $INSTALL_DIR/src/main.py
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/agent.log
StandardError=append:$INSTALL_DIR/logs/agent.log

[Install]
WantedBy=multi-user.target
EOF

    # 重载systemd
    systemctl daemon-reload

    # 启用服务
    systemctl enable $SERVICE_NAME

    # 启动服务
    systemctl start $SERVICE_NAME

    log_info "服务已安装并启动"
}

# 打印完成信息
print_success() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  安装完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "  安装目录: $INSTALL_DIR"
    echo "  配置文件: $INSTALL_DIR/config.yaml"
    echo "  日志文件: $INSTALL_DIR/logs/agent.log"
    echo ""
    echo "  常用命令:"
    echo "    查看状态: systemctl status $SERVICE_NAME"
    echo "    查看日志: journalctl -u $SERVICE_NAME -f"
    echo "    重启服务: systemctl restart $SERVICE_NAME"
    echo "    停止服务: systemctl stop $SERVICE_NAME"
    echo ""
    echo -e "${GREEN}========================================${NC}"
}

# 主函数
main() {
    print_banner
    check_root
    check_python
    install_agent
    install_dependencies
    configure_agent
    install_service
    print_success
}

# 运行
main
