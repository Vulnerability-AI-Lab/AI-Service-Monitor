#!/usr/bin/env python3
"""CPU指标采集器"""

import psutil
from typing import Dict, Any


class CPUCollector:
    """CPU数据采集器"""

    def collect(self) -> Dict[str, Any]:
        """采集CPU指标"""
        # CPU使用率（等待1秒获取准确值）
        cpu_percent = psutil.cpu_percent(interval=1)

        # CPU核心数
        cpu_count_physical = psutil.cpu_count(logical=False) or 1
        cpu_count_logical = psutil.cpu_count(logical=True) or 1

        # 负载均值（仅Linux/Unix）
        try:
            load_avg = list(psutil.getloadavg())
        except (AttributeError, OSError):
            load_avg = [0.0, 0.0, 0.0]

        # 每核心使用率
        per_cpu = psutil.cpu_percent(interval=0, percpu=True)

        # CPU频率
        freq = self._get_frequency()

        # CPU时间分布
        times = self._get_times()

        return {
            'usage': round(cpu_percent, 1),
            'cores_physical': cpu_count_physical,
            'cores_logical': cpu_count_logical,
            'load_avg': [round(x, 2) for x in load_avg],
            'per_cpu': [round(x, 1) for x in per_cpu],
            'frequency': freq,
            'times': times
        }

    def _get_frequency(self) -> Dict[str, float]:
        """获取CPU频率"""
        try:
            freq = psutil.cpu_freq()
            if freq:
                return {
                    'current': round(freq.current, 0),
                    'min': round(freq.min, 0) if freq.min else 0,
                    'max': round(freq.max, 0) if freq.max else 0
                }
        except Exception:
            pass
        return {'current': 0, 'min': 0, 'max': 0}

    def _get_times(self) -> Dict[str, float]:
        """获取CPU时间分布百分比"""
        try:
            times = psutil.cpu_times_percent(interval=0)
            return {
                'user': round(times.user, 1),
                'system': round(times.system, 1),
                'idle': round(times.idle, 1),
                'iowait': round(getattr(times, 'iowait', 0), 1)
            }
        except Exception:
            return {'user': 0, 'system': 0, 'idle': 100, 'iowait': 0}
