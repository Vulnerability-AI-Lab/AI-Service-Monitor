#!/bin/bash

# 打包项目（排除 node_modules 等大文件）

echo "=========================================="
echo "  打包项目（排除 node_modules）"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FOLDER_NAME=$(basename "$SCRIPT_DIR")
OUTPUT="$HOME/Desktop/${FOLDER_NAME}.tar.gz"

# 如果桌面不存在，输出到当前目录的上级
if [ ! -d "$HOME/Desktop" ]; then
    OUTPUT="$(dirname "$SCRIPT_DIR")/${FOLDER_NAME}.tar.gz"
fi

echo "[信息] 打包中..."

cd "$(dirname "$SCRIPT_DIR")"

tar --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.db' \
    --exclude='*.pyc' \
    --exclude='.env' \
    -czvf "$OUTPUT" "$FOLDER_NAME"

echo ""
echo "=========================================="
echo "  打包完成！"
echo "=========================================="
echo ""
echo "输出文件: $OUTPUT"
echo ""
echo "排除的内容:"
echo "  - node_modules (依赖包)"
echo "  - dist (构建输出)"
echo "  - .git (版本控制)"
echo "  - __pycache__ (Python缓存)"
echo "  - *.db (数据库文件)"
echo "  - .env (环境配置)"
echo ""
echo "部署时需要重新运行:"
echo "  npm install (在 backend 和 frontend 目录)"
echo ""
