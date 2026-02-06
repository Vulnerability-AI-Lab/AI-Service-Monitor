#!/usr/bin/env python3
"""内存指标采集器"""

import psutil
from typing import Dict, Any


class MemoryCollector:
    """内存数据采集器"""

    def collect(self) -> Dict[str, Any]:
        """采集内存指标"""
        # 物理内存
        mem = psutil.virtual_memory()

        # Swap内存
        swap = psutil.swap_memory()

        return {
            'total': mem.total,
            'available': mem.available,
            'used': mem.used,
            'free': mem.free,
            'percent': round(mem.percent, 1),
            'buffers': getattr(mem, 'buffers', 0),
            'cached': getattr(mem, 'cached', 0),
            'swap': {
                'total': swap.total,
                'used': swap.used,
                'free': swap.free,
                'percent': round(swap.percent, 1)
            }
        }
