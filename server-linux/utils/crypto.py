#!/usr/bin/env python3
"""
加密工具
"""

import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from config import Config


def _get_fernet():
    """获取Fernet实例"""
    # 使用配置的密钥生成Fernet密钥
    salt = b'server-monitor-salt'
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(Config.ENCRYPTION_KEY.encode()))
    return Fernet(key)


def encrypt(text: str) -> str:
    """加密文本"""
    f = _get_fernet()
    return f.encrypt(text.encode()).decode()


def decrypt(encrypted_text: str) -> str:
    """解密文本"""
    f = _get_fernet()
    return f.decrypt(encrypted_text.encode()).decode()
