#!/usr/bin/env python3
"""配置管理模块"""

import os
import socket
import hashlib
import yaml
from typing import Optional, List
from dataclasses import dataclass, field


@dataclass
class Config:
    """Agent配置类"""
    server_url: str = "http://localhost:8000"
    agent_id: str = ""
    collect_interval: int = 5
    api_key: str = ""
    log_level: str = "INFO"
    enable_gpu: bool = True
    disk_mounts: List[str] = field(default_factory=list)
    network_interface: str = ""

    @classmethod
    def load(cls, config_path: str = None) -> 'Config':
        """从配置文件加载配置"""
        if config_path is None:
            # 默认配置文件路径
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'config.yaml')

        config = cls()

        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}

            config.server_url = data.get('server_url', config.server_url)
            config.agent_id = data.get('agent_id', config.agent_id)
            config.collect_interval = data.get('collect_interval', config.collect_interval)
            config.api_key = data.get('api_key', config.api_key)
            config.log_level = data.get('log_level', config.log_level)
            config.enable_gpu = data.get('enable_gpu', config.enable_gpu)
            config.disk_mounts = data.get('disk_mounts', config.disk_mounts)
            config.network_interface = data.get('network_interface', config.network_interface)

        # 如果没有设置agent_id，自动生成
        if not config.agent_id:
            config.agent_id = cls._generate_agent_id()

        return config

    @staticmethod
    def _generate_agent_id() -> str:
        """生成唯一的Agent ID"""
        hostname = socket.gethostname()

        # 尝试读取machine-id
        machine_id = ""
        for path in ['/etc/machine-id', '/var/lib/dbus/machine-id']:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    machine_id = f.read().strip()[:8]
                break

        if not machine_id:
            # 使用MAC地址作为备选
            import uuid
            machine_id = hex(uuid.getnode())[-8:]

        return f"{hostname}-{machine_id}"

    def save(self, config_path: str = None) -> None:
        """保存配置到文件"""
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'config.yaml')

        data = {
            'server_url': self.server_url,
            'agent_id': self.agent_id,
            'collect_interval': self.collect_interval,
            'api_key': self.api_key,
            'log_level': self.log_level,
            'enable_gpu': self.enable_gpu,
            'disk_mounts': self.disk_mounts,
            'network_interface': self.network_interface
        }

        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
