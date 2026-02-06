#!/usr/bin/env python3
"""GPU指标采集器 (NVIDIA)"""

import subprocess
from typing import Dict, Any, List, Optional


class GPUCollector:
    """GPU数据采集器（仅支持NVIDIA GPU）"""

    def __init__(self, enabled: bool = True):
        """
        初始化GPU采集器

        Args:
            enabled: 是否启用GPU采集
        """
        self.enabled = enabled
        self._available = None

    def is_available(self) -> bool:
        """检查nvidia-smi是否可用"""
        if self._available is not None:
            return self._available

        try:
            result = subprocess.run(
                ['nvidia-smi', '--version'],
                capture_output=True,
                timeout=5
            )
            self._available = result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            self._available = False

        return self._available

    def collect(self) -> Optional[List[Dict[str, Any]]]:
        """采集GPU指标"""
        if not self.enabled or not self.is_available():
            return None

        try:
            result = subprocess.run(
                [
                    'nvidia-smi',
                    '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit',
                    '--format=csv,noheader,nounits'
                ],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                return None

            gpus = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue

                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    gpu = {
                        'index': int(parts[0]),
                        'name': parts[1],
                        'usage': float(parts[2]) if parts[2] != '[N/A]' else 0,
                        'memory_used': int(parts[3]) if parts[3] != '[N/A]' else 0,
                        'memory_total': int(parts[4]) if parts[4] != '[N/A]' else 0,
                        'temperature': int(parts[5]) if parts[5] != '[N/A]' else 0
                    }

                    # 可选字段：功耗
                    if len(parts) >= 8:
                        try:
                            gpu['power_draw'] = float(parts[6]) if parts[6] != '[N/A]' else None
                            gpu['power_limit'] = float(parts[7]) if parts[7] != '[N/A]' else None
                        except (ValueError, IndexError):
                            pass

                    gpus.append(gpu)

            return gpus if gpus else None

        except (subprocess.SubprocessError, FileNotFoundError, ValueError):
            return None

    def get_processes(self) -> Optional[List[Dict[str, Any]]]:
        """获取GPU上运行的进程"""
        if not self.enabled or not self.is_available():
            return None

        try:
            result = subprocess.run(
                [
                    'nvidia-smi',
                    '--query-compute-apps=pid,process_name,gpu_uuid,used_memory',
                    '--format=csv,noheader,nounits'
                ],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                return None

            processes = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue

                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 4:
                    processes.append({
                        'pid': int(parts[0]),
                        'name': parts[1],
                        'gpu_uuid': parts[2],
                        'memory_used': int(parts[3]) if parts[3] != '[N/A]' else 0
                    })

            return processes if processes else None

        except (subprocess.SubprocessError, FileNotFoundError, ValueError):
            return None
