#!/usr/bin/env python3
"""
配置管理模块
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 基础路径
BASE_DIR = Path(__file__).parent


class Config:
    """配置类"""

    # 服务配置
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

    # 数据库
    DATABASE_PATH = os.getenv('DATABASE_PATH', str(BASE_DIR / 'data' / 'server-monitor.db'))

    # JWT配置
    JWT_SECRET = os.getenv('JWT_SECRET', SECRET_KEY)
    JWT_EXPIRES_IN = int(os.getenv('JWT_EXPIRES_IN', 86400))  # 24小时

    # 加密密钥（用于SSH凭证加密）
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef')

    # 监控配置
    MONITOR_INTERVAL = int(os.getenv('MONITOR_INTERVAL', 5))  # 秒
    METRICS_RETENTION_DAYS = int(os.getenv('METRICS_RETENTION_DAYS', 7))

    # 前端静态文件路径
    STATIC_FOLDER = os.getenv('STATIC_FOLDER', str(BASE_DIR / 'public'))

    @classmethod
    def init_dirs(cls):
        """初始化目录"""
        Path(cls.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(cls.STATIC_FOLDER).mkdir(parents=True, exist_ok=True)
