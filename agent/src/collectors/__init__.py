"""数据采集器模块"""

from .cpu import CPUCollector
from .memory import MemoryCollector
from .disk import DiskCollector
from .gpu import GPUCollector
from .network import NetworkCollector
from .process import ProcessCollector

__all__ = [
    'CPUCollector',
    'MemoryCollector',
    'DiskCollector',
    'GPUCollector',
    'NetworkCollector',
    'ProcessCollector'
]
