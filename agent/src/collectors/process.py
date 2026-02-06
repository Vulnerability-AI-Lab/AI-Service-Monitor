#!/usr/bin/env python3
"""进程指标采集器"""

import psutil
from typing import Dict, Any, List


class ProcessCollector:
    """进程数据采集器"""

    def __init__(self, top_n: int = 5):
        """
        初始化进程采集器

        Args:
            top_n: 返回CPU占用最高的前N个进程
        """
        self.top_n = top_n

    def collect(self) -> List[Dict[str, Any]]:
        """采集Top N进程信息（按CPU占用排序）"""
        processes = []

        for proc in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_percent', 'create_time']):
            try:
                info = proc.info
                processes.append({
                    'pid': info['pid'],
                    'name': info['name'] or 'unknown',
                    'user': info['username'] or 'unknown',
                    'cpu': round(info['cpu_percent'] or 0, 1),
                    'memory': round(info['memory_percent'] or 0, 1)
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        # 按CPU占用排序，取前N个
        processes.sort(key=lambda x: x['cpu'], reverse=True)
        return processes[:self.top_n]

    def get_summary(self) -> Dict[str, Any]:
        """获取进程汇总信息"""
        total = 0
        running = 0
        sleeping = 0
        stopped = 0
        zombie = 0

        for proc in psutil.process_iter(['status']):
            try:
                total += 1
                status = proc.info['status']
                if status == psutil.STATUS_RUNNING:
                    running += 1
                elif status == psutil.STATUS_SLEEPING:
                    sleeping += 1
                elif status == psutil.STATUS_STOPPED:
                    stopped += 1
                elif status == psutil.STATUS_ZOMBIE:
                    zombie += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return {
            'total': total,
            'running': running,
            'sleeping': sleeping,
            'stopped': stopped,
            'zombie': zombie
        }
