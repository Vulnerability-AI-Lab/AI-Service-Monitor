#!/usr/bin/env python3
"""
Linux Server Monitor Agent
服务器监控代理主程序
"""

import os
import sys
import time
import signal
import logging
import platform
import socket
from typing import Dict, Any, Optional

# 添加src目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from collectors import (
    CPUCollector,
    MemoryCollector,
    DiskCollector,
    GPUCollector,
    NetworkCollector,
    ProcessCollector
)

try:
    import requests
except ImportError:
    print("请安装 requests 库: pip install requests")
    sys.exit(1)


class MonitorAgent:
    """监控代理主类"""

    def __init__(self, config: Config):
        self.config = config
        self.running = False
        self.logger = self._setup_logger()

        # 初始化采集器
        self.collectors = {
            'cpu': CPUCollector(),
            'memory': MemoryCollector(),
            'disk': DiskCollector(config.disk_mounts),
            'gpu': GPUCollector(config.enable_gpu),
            'network': NetworkCollector(config.network_interface),
            'process': ProcessCollector(top_n=5)
        }

        # 系统信息（启动时采集一次）
        self.system_info = self._collect_system_info()

        self.logger.info(f"Agent initialized: {config.agent_id}")
        self.logger.info(f"Server URL: {config.server_url}")

    def _setup_logger(self) -> logging.Logger:
        """配置日志"""
        logger = logging.getLogger('agent')
        logger.setLevel(getattr(logging, self.config.log_level.upper(), logging.INFO))

        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        ))
        logger.addHandler(handler)

        return logger

    def _collect_system_info(self) -> Dict[str, Any]:
        """采集系统基本信息"""
        info = {
            'hostname': socket.gethostname(),
            'platform': platform.system(),
            'platform_release': platform.release(),
            'platform_version': platform.version(),
            'architecture': platform.machine(),
            'processor': platform.processor(),
            'python_version': platform.python_version()
        }

        # 尝试获取Linux发行版信息
        try:
            if os.path.exists('/etc/os-release'):
                with open('/etc/os-release', 'r') as f:
                    for line in f:
                        if line.startswith('PRETTY_NAME='):
                            info['os_name'] = line.split('=')[1].strip().strip('"')
                            break
        except Exception:
            info['os_name'] = f"{platform.system()} {platform.release()}"

        return info

    def collect_all(self) -> Dict[str, Any]:
        """采集所有监控数据"""
        data = {
            'agent_id': self.config.agent_id,
            'timestamp': time.time(),
            'system': self.system_info
        }

        # 采集各项指标
        for name, collector in self.collectors.items():
            try:
                result = collector.collect()
                if result is not None:
                    data[name] = result
            except Exception as e:
                self.logger.error(f"Failed to collect {name}: {e}")
                data[name] = None

        return data

    def report(self, data: Dict[str, Any]) -> bool:
        """上报数据到服务器"""
        try:
            headers = {
                'Content-Type': 'application/json'
            }

            if self.config.api_key:
                headers['Authorization'] = f'Bearer {self.config.api_key}'

            response = requests.post(
                f"{self.config.server_url}/api/v1/agent/report",
                json=data,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                return True
            else:
                self.logger.warning(f"Report failed: {response.status_code} - {response.text}")
                return False

        except requests.exceptions.Timeout:
            self.logger.warning("Report timeout")
            return False
        except requests.exceptions.ConnectionError:
            self.logger.warning("Connection error")
            return False
        except Exception as e:
            self.logger.error(f"Report error: {e}")
            return False

    def run(self):
        """运行主循环"""
        self.running = True
        self.logger.info("Agent started")

        # 设置信号处理
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

        while self.running:
            try:
                # 采集数据
                start_time = time.time()
                data = self.collect_all()
                collect_duration = time.time() - start_time

                self.logger.debug(f"Data collected in {collect_duration:.2f}s")

                # 上报数据
                success = self.report(data)
                if success:
                    self.logger.debug("Data reported successfully")

            except Exception as e:
                self.logger.error(f"Error in main loop: {e}")

            # 等待下一次采集
            time.sleep(self.config.collect_interval)

        self.logger.info("Agent stopped")

    def stop(self):
        """停止代理"""
        self.running = False

    def _signal_handler(self, signum, frame):
        """信号处理"""
        self.logger.info(f"Received signal {signum}, stopping...")
        self.stop()


def main():
    """主入口"""
    # 加载配置
    config_path = None
    if len(sys.argv) > 1:
        config_path = sys.argv[1]

    config = Config.load(config_path)

    # 创建并运行代理
    agent = MonitorAgent(config)

    try:
        agent.run()
    except KeyboardInterrupt:
        agent.stop()


if __name__ == '__main__':
    main()
