#!/usr/bin/env python3
"""
数据库模型
"""

import json
from datetime import datetime
from peewee import *
from config import Config

# 确保目录存在
Config.init_dirs()

# 创建数据库连接
db = SqliteDatabase(Config.DATABASE_PATH)


class BaseModel(Model):
    """基础模型"""
    class Meta:
        database = db


class User(BaseModel):
    """用户表"""
    id = AutoField()
    username = CharField(max_length=50, unique=True)
    password = CharField(max_length=255)
    role = CharField(max_length=20, default='viewer')  # admin, operator, viewer
    email = CharField(max_length=100, null=True)
    last_login = DateTimeField(null=True)
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)


class Group(BaseModel):
    """服务器分组表"""
    id = AutoField()
    name = CharField(max_length=50, unique=True)
    color = CharField(max_length=7, default='#409EFF')
    description = TextField(null=True)
    sort_order = IntegerField(default=0)
    created_at = DateTimeField(default=datetime.now)


class Server(BaseModel):
    """服务器表"""
    id = AutoField()
    name = CharField(max_length=100)
    ip = CharField(max_length=45, unique=True)
    ssh_port = IntegerField(default=22)
    ssh_user = CharField(max_length=50)
    ssh_auth_type = CharField(max_length=20, default='password')
    ssh_credential = TextField()  # 加密存储
    group = ForeignKeyField(Group, backref='servers', null=True, on_delete='SET NULL')
    status = CharField(max_length=20, default='offline')  # online, offline, warning, error
    os_info = CharField(max_length=100, null=True)
    hostname = CharField(max_length=100, null=True)
    uptime = IntegerField(null=True)
    last_seen = DateTimeField(null=True)
    tags = TextField(null=True)  # JSON数组
    notes = TextField(null=True)
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)

    def to_dict(self, include_credential=False):
        """转换为字典"""
        data = {
            'id': self.id,
            'name': self.name,
            'ip': self.ip,
            'ssh_port': self.ssh_port,
            'ssh_user': self.ssh_user,
            'ssh_auth_type': self.ssh_auth_type,
            'group_id': self.group.id if self.group else None,
            'group_name': self.group.name if self.group else None,
            'status': self.status,
            'os_info': self.os_info,
            'hostname': self.hostname,
            'uptime': self.uptime,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'tags': json.loads(self.tags) if self.tags else [],
            'notes': self.notes,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        if include_credential:
            data['ssh_credential'] = self.ssh_credential
        return data


class Metrics(BaseModel):
    """监控数据表"""
    id = AutoField()
    server = ForeignKeyField(Server, backref='metrics', on_delete='CASCADE')
    cpu_usage = FloatField(null=True)
    cpu_cores = IntegerField(null=True)
    load_avg_1 = FloatField(null=True)
    load_avg_5 = FloatField(null=True)
    load_avg_15 = FloatField(null=True)
    memory_usage = FloatField(null=True)
    memory_total = BigIntegerField(null=True)
    memory_used = BigIntegerField(null=True)
    memory_available = BigIntegerField(null=True)
    swap_usage = FloatField(null=True)
    disk_usage = TextField(null=True)  # JSON
    gpu_count = IntegerField(default=0)
    gpu_usage = TextField(null=True)  # JSON
    network_io = TextField(null=True)  # JSON
    top_processes = TextField(null=True)  # JSON
    ping_latency = FloatField(null=True)
    ssh_status = BooleanField(default=False)
    timestamp = DateTimeField(default=datetime.now)


class OperationLog(BaseModel):
    """操作日志表"""
    id = AutoField()
    user = ForeignKeyField(User, backref='logs', null=True, on_delete='SET NULL')
    server = ForeignKeyField(Server, backref='logs', null=True, on_delete='SET NULL')
    action = CharField(max_length=50)
    detail = TextField(null=True)
    ip_address = CharField(max_length=45, null=True)
    result = CharField(max_length=20, default='success')
    error_message = TextField(null=True)
    created_at = DateTimeField(default=datetime.now)


class AlertRule(BaseModel):
    """告警规则表"""
    id = AutoField()
    name = CharField(max_length=100)
    metric_type = CharField(max_length=50)
    operator = CharField(max_length=10, default='>')
    threshold = FloatField()
    duration = IntegerField(default=60)
    severity = CharField(max_length=20, default='warning')
    enabled = BooleanField(default=True)
    notify_channels = TextField(null=True)  # JSON
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)


class Alert(BaseModel):
    """告警记录表"""
    id = AutoField()
    rule = ForeignKeyField(AlertRule, backref='alerts', null=True, on_delete='SET NULL')
    server = ForeignKeyField(Server, backref='alerts', null=True, on_delete='SET NULL')
    message = TextField()
    value = FloatField(null=True)
    status = CharField(max_length=20, default='active')  # active, resolved, acknowledged
    acknowledged_by = ForeignKeyField(User, null=True, on_delete='SET NULL')
    created_at = DateTimeField(default=datetime.now)
    resolved_at = DateTimeField(null=True)


def init_database():
    """初始化数据库"""
    db.connect()
    db.create_tables([User, Group, Server, Metrics, OperationLog, AlertRule, Alert])

    # 创建默认管理员
    import bcrypt
    if not User.select().where(User.username == 'admin').exists():
        hashed = bcrypt.hashpw('admin123'.encode(), bcrypt.gensalt())
        User.create(username='admin', password=hashed.decode(), role='admin')
        print("默认管理员已创建: admin / admin123")

    # 创建默认分组
    if not Group.select().exists():
        Group.create(name='生产环境', color='#F56C6C', description='生产服务器')
        Group.create(name='测试环境', color='#E6A23C', description='测试服务器')
        Group.create(name='开发环境', color='#67C23A', description='开发服务器')
        print("默认分组已创建")

    # 创建默认告警规则
    if not AlertRule.select().exists():
        AlertRule.create(name='CPU高负载', metric_type='cpu', operator='>', threshold=80, severity='warning')
        AlertRule.create(name='CPU严重过载', metric_type='cpu', operator='>', threshold=95, severity='critical')
        AlertRule.create(name='内存不足', metric_type='memory', operator='>', threshold=80, severity='warning')
        AlertRule.create(name='内存严重不足', metric_type='memory', operator='>', threshold=95, severity='critical')
        AlertRule.create(name='磁盘空间不足', metric_type='disk', operator='>', threshold=80, severity='warning')
        print("默认告警规则已创建")

    db.close()
    print("数据库初始化完成")
