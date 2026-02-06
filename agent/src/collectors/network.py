#!/usr/bin/env python3
"""网络指标采集器"""

import psutil
from typing import Dict, Any, List, Optional


class NetworkCollector:
    """网络数据采集器"""

    def __init__(self, interface: Optional[str] = None):
        """
        初始化网络采集器

        Args:
            interface: 指定网络接口名称，为空则自动选择
        """
        self.interface = interface
        self._last_io = None
        self._last_time = None

    def collect(self) -> Dict[str, Any]:
        """采集网络指标"""
        # 获取网络IO统计
        io_counters = psutil.net_io_counters(pernic=True)

        # 确定要监控的接口
        iface = self._get_interface(io_counters)

        if iface and iface in io_counters:
            io = io_counters[iface]
            return {
                'interface': iface,
                'bytes_sent': io.bytes_sent,
                'bytes_recv': io.bytes_recv,
                'packets_sent': io.packets_sent,
                'packets_recv': io.packets_recv,
                'errin': io.errin,
                'errout': io.errout,
                'dropin': io.dropin,
                'dropout': io.dropout
            }

        # 返回汇总数据
        total = psutil.net_io_counters()
        return {
            'interface': 'total',
            'bytes_sent': total.bytes_sent,
            'bytes_recv': total.bytes_recv,
            'packets_sent': total.packets_sent,
            'packets_recv': total.packets_recv,
            'errin': total.errin,
            'errout': total.errout,
            'dropin': total.dropin,
            'dropout': total.dropout
        }

    def _get_interface(self, io_counters: Dict) -> Optional[str]:
        """获取要监控的网络接口"""
        if self.interface:
            return self.interface

        # 优先选择常见的物理网络接口
        preferred = ['eth0', 'ens33', 'ens160', 'enp0s3', 'em1', 'bond0']

        for iface in preferred:
            if iface in io_counters:
                return iface

        # 查找第一个非回环、非虚拟的接口
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()

        for iface in io_counters:
            if iface == 'lo':
                continue
            if iface.startswith(('docker', 'veth', 'br-', 'virbr')):
                continue
            if iface in stats and stats[iface].isup:
                return iface

        return None

    def get_connections(self) -> Dict[str, int]:
        """获取网络连接统计"""
        try:
            connections = psutil.net_connections()
            status_count = {}

            for conn in connections:
                status = conn.status
                status_count[status] = status_count.get(status, 0) + 1

            return status_count
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            return {}

    def get_interfaces(self) -> List[Dict[str, Any]]:
        """获取所有网络接口信息"""
        interfaces = []
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()

        for iface, addr_list in addrs.items():
            if iface == 'lo':
                continue

            info = {
                'name': iface,
                'is_up': stats[iface].isup if iface in stats else False,
                'speed': stats[iface].speed if iface in stats else 0,
                'addresses': []
            }

            for addr in addr_list:
                if addr.family.name == 'AF_INET':
                    info['addresses'].append({
                        'type': 'ipv4',
                        'address': addr.address,
                        'netmask': addr.netmask
                    })
                elif addr.family.name == 'AF_INET6':
                    info['addresses'].append({
                        'type': 'ipv6',
                        'address': addr.address
                    })

            interfaces.append(info)

        return interfaces
