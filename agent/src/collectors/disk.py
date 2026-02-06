#!/usr/bin/env python3
"""磁盘指标采集器"""

import psutil
from typing import Dict, Any, List, Optional


class DiskCollector:
    """磁盘数据采集器"""

    def __init__(self, mounts: Optional[List[str]] = None):
        """
        初始化磁盘采集器

        Args:
            mounts: 要监控的挂载点列表，为空则监控所有
        """
        self.mounts = mounts or []

    def collect(self) -> List[Dict[str, Any]]:
        """采集磁盘指标"""
        disks = []

        partitions = psutil.disk_partitions(all=False)

        for partition in partitions:
            # 过滤挂载点
            if self.mounts and partition.mountpoint not in self.mounts:
                continue

            # 跳过一些特殊文件系统
            if partition.fstype in ('squashfs', 'tmpfs', 'devtmpfs'):
                continue

            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    'device': partition.device,
                    'mount': partition.mountpoint,
                    'fstype': partition.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': round(usage.percent, 1)
                })
            except (PermissionError, OSError):
                # 某些挂载点可能无法访问
                continue

        return disks

    def get_io_counters(self) -> Dict[str, Any]:
        """获取磁盘IO统计"""
        try:
            io = psutil.disk_io_counters()
            if io:
                return {
                    'read_bytes': io.read_bytes,
                    'write_bytes': io.write_bytes,
                    'read_count': io.read_count,
                    'write_count': io.write_count,
                    'read_time': io.read_time,
                    'write_time': io.write_time
                }
        except Exception:
            pass
        return {}
