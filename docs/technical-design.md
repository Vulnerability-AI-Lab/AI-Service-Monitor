# Linux服务器群监测响应系统 - 技术设计文档

## 1. 系统架构设计

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            用户浏览器 (Chrome/Firefox/Edge)                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Vue3 + Element Plus + xterm.js + ECharts                           │   │
│  │  ├── 服务器总览页面 (Dashboard)                                      │   │
│  │  ├── 服务器详情页面 (ServerDetail)                                   │   │
│  │  ├── SSH终端页面 (Terminal)                                         │   │
│  │  └── 文件管理页面 (FileManager)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                    │ HTTP/HTTPS          │ WebSocket (wss://)
                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Windows 工作站 - 后端服务                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Node.js + Express                                │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │  │
│  │  │ REST API    │ │ WebSocket   │ │ SSH Service │ │ SFTP Service│    │  │
│  │  │ Controller  │ │ Server      │ │ (ssh2)      │ │ (ssh2-sftp) │    │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │  │
│  │  │ Scanner     │ │ Monitor     │ │ Alert       │ │ Auth        │    │  │
│  │  │ Service     │ │ Service     │ │ Service     │ │ Service     │    │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         SQLite / PostgreSQL                           │  │
│  │  servers | metrics | users | operation_logs | alerts | groups        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                    │ SSH (Port 22)       │ Agent (Port 9100)
                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Linux 服务器集群                                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐               │
│  │  Server 1       │ │  Server 2       │ │  Server N       │               │
│  │  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │               │
│  │  │  Agent    │  │ │  │  Agent    │  │ │  │  Agent    │  │               │
│  │  │  (Python) │  │ │  │  (Python) │  │ │  │  (Python) │  │               │
│  │  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │               │
│  │  - CPU/GPU监控  │ │  - CPU/GPU监控  │ │  - CPU/GPU监控  │               │
│  │  - 内存/磁盘    │ │  - 内存/磁盘    │ │  - 内存/磁盘    │               │
│  │  - 进程信息     │ │  - 进程信息     │ │  - 进程信息     │               │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据流向图                                      │
└─────────────────────────────────────────────────────────────────────────────┘

1. 状态采集流 (实时)
   Agent ──(HTTP POST)──> 后端 ──(WebSocket)──> 前端

2. SSH命令流 (双向实时)
   前端 <──(WebSocket)──> 后端 <──(SSH2)──> Linux服务器

3. 文件传输流
   前端 ──(HTTP Upload)──> 后端 ──(SFTP)──> Linux服务器
   前端 <──(HTTP Download)── 后端 <──(SFTP)── Linux服务器

4. 配置管理流
   前端 ──(REST API)──> 后端 ──(Database)──> SQLite/PostgreSQL
```

### 1.3 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Windows 工作站部署                            │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Nginx (可选，用于HTTPS和负载均衡)                       │   │
│   │  监听: 80/443                                            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Node.js 后端服务                                        │   │
│   │  监听: 3000 (HTTP API)                                   │   │
│   │  监听: 3001 (WebSocket)                                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  SQLite 数据库                                           │   │
│   │  文件: ./data/server-monitor.db                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术选型

### 2.1 前端技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|----------|
| Vue.js | 3.4+ | 前端框架 | 响应式、组件化、生态完善 |
| TypeScript | 5.0+ | 开发语言 | 类型安全、IDE支持好 |
| Element Plus | 2.5+ | UI组件库 | 企业级、组件丰富 |
| Vue Router | 4.x | 路由管理 | Vue官方路由 |
| Pinia | 2.x | 状态管理 | 轻量、TypeScript友好 |
| xterm.js | 5.x | 终端模拟 | 功能完整、性能好 |
| ECharts | 5.x | 图表库 | 功能强大、定制性强 |
| Axios | 1.x | HTTP客户端 | 拦截器、取消请求 |
| Vite | 5.x | 构建工具 | 快速、HMR |

### 2.2 后端技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|----------|
| Node.js | 20 LTS | 运行环境 | 高并发、生态丰富 |
| TypeScript | 5.0+ | 开发语言 | 类型安全 |
| Express | 4.x | Web框架 | 成熟稳定、中间件丰富 |
| ws | 8.x | WebSocket | 性能好、轻量 |
| ssh2 | 1.x | SSH客户端 | Node.js最成熟的SSH库 |
| node-pty | 1.x | 伪终端 | SSH终端支持 |
| better-sqlite3 | 9.x | SQLite驱动 | 同步API、性能好 |
| bcrypt | 5.x | 密码加密 | 安全的密码哈希 |
| jsonwebtoken | 9.x | JWT认证 | 无状态认证 |
| node-cron | 3.x | 定时任务 | 轻量级调度器 |

### 2.3 Agent技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|----------|
| Python | 3.9+ | 运行环境 | Linux预装、库丰富 |
| psutil | 5.x | 系统监控 | 跨平台、功能全面 |
| GPUtil | 1.x | GPU监控 | NVIDIA GPU支持 |
| Flask | 3.x | HTTP服务 | 轻量、简单 |
| requests | 2.x | HTTP客户端 | 简单易用 |

### 2.4 数据库选型

| 场景 | 推荐 | 说明 |
|------|------|------|
| 单机部署 (<50台服务器) | SQLite | 零配置、轻量 |
| 集群部署 (>50台服务器) | PostgreSQL | 性能好、功能完整 |

---

## 3. 数据库设计

### 3.1 ER图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │   groups    │       │   servers   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ username    │       │ name        │◄──────│ group_id(FK)│
│ password    │       │ color       │       │ name        │
│ role        │       │ description │       │ ip          │
│ email       │       │ created_at  │       │ ssh_port    │
│ created_at  │       └─────────────┘       │ ssh_user    │
│ updated_at  │                             │ ssh_auth    │
└─────────────┘                             │ ssh_cred    │
      │                                     │ status      │
      │                                     │ created_at  │
      │                                     │ updated_at  │
      │                                     └─────────────┘
      │                                           │
      │         ┌─────────────────────────────────┤
      │         │                                 │
      ▼         ▼                                 ▼
┌─────────────────────┐                 ┌─────────────────────┐
│  operation_logs     │                 │      metrics        │
├─────────────────────┤                 ├─────────────────────┤
│ id (PK)             │                 │ id (PK)             │
│ user_id (FK)        │                 │ server_id (FK)      │
│ server_id (FK)      │                 │ cpu_usage           │
│ action              │                 │ cpu_cores           │
│ detail              │                 │ memory_usage        │
│ ip_address          │                 │ memory_total        │
│ result              │                 │ disk_usage          │
│ created_at          │                 │ gpu_usage           │
└─────────────────────┘                 │ gpu_memory          │
                                        │ top_processes       │
                                        │ network_io          │
                                        │ timestamp           │
                                        └─────────────────────┘

┌─────────────────────┐                 ┌─────────────────────┐
│   alert_rules       │                 │      alerts         │
├─────────────────────┤                 ├─────────────────────┤
│ id (PK)             │                 │ id (PK)             │
│ name                │                 │ rule_id (FK)        │
│ metric_type         │                 │ server_id (FK)      │
│ operator            │                 │ message             │
│ threshold           │                 │ value               │
│ duration            │                 │ status              │
│ severity            │                 │ created_at          │
│ enabled             │                 │ resolved_at         │
│ created_at          │                 └─────────────────────┘
└─────────────────────┘
```

### 3.2 表结构定义

#### 3.2.1 用户表 (users)
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,           -- bcrypt哈希
    role ENUM('admin', 'operator', 'viewer') DEFAULT 'viewer',
    email VARCHAR(100),
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 默认管理员账号
INSERT INTO users (username, password, role)
VALUES ('admin', '$2b$10$...', 'admin');
```

#### 3.2.2 服务器分组表 (groups)
```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#409EFF',       -- 十六进制颜色
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 默认分组
INSERT INTO groups (name, color, description) VALUES
('生产环境', '#F56C6C', '生产服务器'),
('测试环境', '#E6A23C', '测试服务器'),
('开发环境', '#67C23A', '开发服务器');
```

#### 3.2.3 服务器表 (servers)
```sql
CREATE TABLE servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    ip VARCHAR(45) NOT NULL UNIQUE,           -- 支持IPv6
    ssh_port INTEGER DEFAULT 22,
    ssh_user VARCHAR(50) NOT NULL,
    ssh_auth_type ENUM('password', 'key') DEFAULT 'password',
    ssh_credential TEXT NOT NULL,             -- AES加密存储
    group_id INTEGER REFERENCES groups(id),
    status ENUM('online', 'offline', 'warning', 'error') DEFAULT 'offline',
    os_info VARCHAR(100),                     -- 操作系统信息
    hostname VARCHAR(100),                    -- 主机名
    uptime INTEGER,                           -- 运行时间(秒)
    last_seen DATETIME,                       -- 最后在线时间
    tags TEXT,                                -- JSON数组，自定义标签
    notes TEXT,                               -- 备注
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_servers_status ON servers(status);
CREATE INDEX idx_servers_group ON servers(group_id);
```

#### 3.2.4 监控数据表 (metrics)
```sql
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,

    -- CPU
    cpu_usage REAL,                           -- CPU使用率 (0-100)
    cpu_cores INTEGER,                        -- CPU核心数
    load_avg_1 REAL,                          -- 1分钟负载
    load_avg_5 REAL,                          -- 5分钟负载
    load_avg_15 REAL,                         -- 15分钟负载

    -- 内存
    memory_usage REAL,                        -- 内存使用率 (0-100)
    memory_total BIGINT,                      -- 总内存 (bytes)
    memory_used BIGINT,                       -- 已用内存 (bytes)
    memory_available BIGINT,                  -- 可用内存 (bytes)
    swap_usage REAL,                          -- Swap使用率

    -- 磁盘
    disk_usage TEXT,                          -- JSON: [{mount, total, used, percent}]

    -- GPU
    gpu_count INTEGER DEFAULT 0,              -- GPU数量
    gpu_usage TEXT,                           -- JSON: [{index, name, usage, memory, temp}]

    -- 网络
    network_io TEXT,                          -- JSON: [{interface, rx_bytes, tx_bytes}]

    -- 进程
    top_processes TEXT,                       -- JSON: [{pid, name, user, cpu, memory}]

    -- 连接状态
    ping_latency REAL,                        -- Ping延迟 (ms)，NULL表示不通
    ssh_status BOOLEAN DEFAULT FALSE,         -- SSH是否可连接

    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_server ON metrics(server_id);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_server_time ON metrics(server_id, timestamp);

-- 分区策略 (PostgreSQL)
-- CREATE TABLE metrics_2024_01 PARTITION OF metrics
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

#### 3.2.5 操作日志表 (operation_logs)
```sql
CREATE TABLE operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    server_id INTEGER REFERENCES servers(id),
    action VARCHAR(50) NOT NULL,              -- login, reboot, ssh, sftp, command
    detail TEXT,                              -- 操作详情
    ip_address VARCHAR(45),                   -- 操作者IP
    user_agent TEXT,                          -- 浏览器信息
    result ENUM('success', 'fail') DEFAULT 'success',
    error_message TEXT,                       -- 失败原因
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_user ON operation_logs(user_id);
CREATE INDEX idx_logs_server ON operation_logs(server_id);
CREATE INDEX idx_logs_time ON operation_logs(created_at);
```

#### 3.2.6 告警规则表 (alert_rules)
```sql
CREATE TABLE alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,         -- cpu, memory, disk, gpu, ping
    operator ENUM('>', '<', '>=', '<=', '==') DEFAULT '>',
    threshold REAL NOT NULL,                  -- 阈值
    duration INTEGER DEFAULT 60,              -- 持续时间(秒)
    severity ENUM('info', 'warning', 'critical') DEFAULT 'warning',
    enabled BOOLEAN DEFAULT TRUE,
    notify_channels TEXT,                     -- JSON: ['web', 'email', 'wechat']
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 默认告警规则
INSERT INTO alert_rules (name, metric_type, operator, threshold, severity) VALUES
('CPU高负载', 'cpu', '>', 80, 'warning'),
('CPU严重过载', 'cpu', '>', 95, 'critical'),
('内存不足', 'memory', '>', 80, 'warning'),
('内存严重不足', 'memory', '>', 95, 'critical'),
('磁盘空间不足', 'disk', '>', 80, 'warning'),
('磁盘空间严重不足', 'disk', '>', 95, 'critical'),
('服务器离线', 'ping', '==', 0, 'critical');
```

#### 3.2.7 告警记录表 (alerts)
```sql
CREATE TABLE alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER REFERENCES alert_rules(id),
    server_id INTEGER REFERENCES servers(id),
    message TEXT NOT NULL,
    value REAL,                               -- 触发时的值
    status ENUM('active', 'resolved', 'acknowledged') DEFAULT 'active',
    acknowledged_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_server ON alerts(server_id);
```

### 3.3 数据清理策略

```sql
-- 定时清理脚本 (每天执行)

-- 删除7天前的详细监控数据
DELETE FROM metrics WHERE timestamp < datetime('now', '-7 days');

-- 保留汇总数据 (可选实现小时/天级别汇总表)
-- 操作日志永久保留
-- 已解决的告警保留30天
DELETE FROM alerts
WHERE status = 'resolved'
AND resolved_at < datetime('now', '-30 days');
```

---

## 4. API接口设计

### 4.1 API规范

#### 基本约定
- 基础路径: `/api/v1`
- 认证方式: Bearer Token (JWT)
- 内容类型: `application/json`
- 字符编码: UTF-8

#### 响应格式
```typescript
// 成功响应
{
  "code": 0,
  "message": "success",
  "data": { ... }
}

// 分页响应
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}

// 错误响应
{
  "code": 40001,
  "message": "Invalid parameter",
  "error": "ip format is invalid"
}
```

#### 错误码定义
| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 40001 | 参数错误 |
| 40101 | 未认证 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 40901 | 资源冲突 |
| 50001 | 服务器错误 |
| 50201 | SSH连接失败 |
| 50202 | 命令执行失败 |

### 4.2 认证接口

#### 用户登录
```
POST /api/v1/auth/login

Request:
{
  "username": "admin",
  "password": "password123"
}

Response:
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400,
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

#### 刷新Token
```
POST /api/v1/auth/refresh
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  }
}
```

#### 修改密码
```
PUT /api/v1/auth/password
Authorization: Bearer <token>

Request:
{
  "oldPassword": "old123",
  "newPassword": "new456"
}
```

### 4.3 服务器管理接口

#### 获取服务器列表
```
GET /api/v1/servers?page=1&pageSize=20&group=1&status=online&keyword=web

Query Parameters:
- page: 页码 (默认1)
- pageSize: 每页数量 (默认20)
- group: 分组ID (可选)
- status: 状态筛选 (可选)
- keyword: 搜索关键词 (可选)

Response:
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "name": "Web Server 1",
        "ip": "192.168.1.100",
        "sshPort": 22,
        "sshUser": "root",
        "groupId": 1,
        "groupName": "生产环境",
        "status": "online",
        "osInfo": "Ubuntu 22.04 LTS",
        "hostname": "web-server-1",
        "lastSeen": "2024-01-15T10:30:00Z",
        "metrics": {
          "cpuUsage": 45.2,
          "memoryUsage": 62.5,
          "diskUsage": 35.0
        }
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

#### 添加服务器
```
POST /api/v1/servers
Authorization: Bearer <token>

Request:
{
  "name": "Web Server 1",
  "ip": "192.168.1.100",
  "sshPort": 22,
  "sshUser": "root",
  "sshAuthType": "password",
  "sshCredential": "password123",
  "groupId": 1,
  "tags": ["web", "nginx"],
  "notes": "主Web服务器"
}

Response:
{
  "code": 0,
  "data": {
    "id": 1,
    "name": "Web Server 1",
    ...
  }
}
```

#### 更新服务器
```
PUT /api/v1/servers/:id
Authorization: Bearer <token>

Request:
{
  "name": "Web Server 1 - Updated",
  "groupId": 2,
  "notes": "更新备注"
}
```

#### 删除服务器
```
DELETE /api/v1/servers/:id
Authorization: Bearer <token>

Query Parameters:
- keepHistory: 是否保留历史数据 (默认false)
```

#### 批量删除服务器
```
DELETE /api/v1/servers
Authorization: Bearer <token>

Request:
{
  "ids": [1, 2, 3],
  "keepHistory": false
}
```

#### 测试服务器连接
```
POST /api/v1/servers/:id/test
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "data": {
    "ping": {
      "success": true,
      "latency": 12.5
    },
    "ssh": {
      "success": true,
      "message": "Connected successfully"
    }
  }
}
```

#### 扫描网段
```
POST /api/v1/servers/scan
Authorization: Bearer <token>

Request:
{
  "subnet": "192.168.1.0/24",
  "ports": [22],
  "timeout": 3000
}

Response:
{
  "code": 0,
  "data": {
    "found": [
      {
        "ip": "192.168.1.100",
        "hostname": "server1",
        "sshAvailable": true
      },
      {
        "ip": "192.168.1.101",
        "hostname": "server2",
        "sshAvailable": true
      }
    ],
    "scanned": 254,
    "duration": 15.2
  }
}
```

### 4.4 监控数据接口

#### 获取服务器实时状态
```
GET /api/v1/servers/:id/status
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "data": {
    "serverId": 1,
    "timestamp": "2024-01-15T10:30:00Z",
    "cpu": {
      "usage": 45.2,
      "cores": 8,
      "loadAvg": [1.5, 1.2, 0.9]
    },
    "memory": {
      "usage": 62.5,
      "total": 17179869184,
      "used": 10737418240,
      "available": 6442450944
    },
    "disk": [
      {
        "mount": "/",
        "total": 107374182400,
        "used": 42949672960,
        "percent": 40.0
      }
    ],
    "gpu": [
      {
        "index": 0,
        "name": "NVIDIA RTX 3090",
        "usage": 78.5,
        "memoryUsed": 8192,
        "memoryTotal": 24576,
        "temperature": 65
      }
    ],
    "network": {
      "interfaces": [
        {
          "name": "eth0",
          "rxBytes": 1073741824,
          "txBytes": 536870912,
          "rxRate": 1048576,
          "txRate": 524288
        }
      ]
    },
    "topProcesses": [
      {
        "pid": 1234,
        "name": "python",
        "user": "root",
        "cpu": 25.3,
        "memory": 12.5,
        "runtime": "2:30:45"
      }
    ],
    "connection": {
      "ping": true,
      "pingLatency": 12.5,
      "ssh": true
    }
  }
}
```

#### 获取历史监控数据
```
GET /api/v1/servers/:id/metrics
Authorization: Bearer <token>

Query Parameters:
- metric: 指标类型 (cpu/memory/disk/gpu/network)
- start: 开始时间 (ISO8601)
- end: 结束时间 (ISO8601)
- interval: 数据间隔 (1m/5m/1h/1d)

Response:
{
  "code": 0,
  "data": {
    "metric": "cpu",
    "interval": "5m",
    "points": [
      {"timestamp": "2024-01-15T10:00:00Z", "value": 45.2},
      {"timestamp": "2024-01-15T10:05:00Z", "value": 48.1},
      ...
    ]
  }
}
```

### 4.5 远程操作接口

#### Ping服务器
```
POST /api/v1/servers/:id/ping
Authorization: Bearer <token>

Request:
{
  "count": 4,
  "timeout": 3000
}

Response:
{
  "code": 0,
  "data": {
    "results": [
      {"seq": 1, "latency": 12.5},
      {"seq": 2, "latency": 11.8},
      {"seq": 3, "latency": 13.2},
      {"seq": 4, "latency": 12.1}
    ],
    "statistics": {
      "sent": 4,
      "received": 4,
      "lost": 0,
      "lossPercent": 0,
      "minLatency": 11.8,
      "maxLatency": 13.2,
      "avgLatency": 12.4
    }
  }
}
```

#### 重启服务器
```
POST /api/v1/servers/:id/reboot
Authorization: Bearer <token>

Request:
{
  "delay": 0,           // 延迟秒数，0为立即重启
  "force": false        // 是否强制重启
}

Response:
{
  "code": 0,
  "message": "Reboot command sent successfully"
}
```

#### 执行命令
```
POST /api/v1/servers/:id/command
Authorization: Bearer <token>

Request:
{
  "command": "df -h",
  "timeout": 30000
}

Response:
{
  "code": 0,
  "data": {
    "stdout": "Filesystem      Size  Used Avail Use% Mounted on\n...",
    "stderr": "",
    "exitCode": 0,
    "duration": 125
  }
}
```

#### 批量执行命令
```
POST /api/v1/servers/batch/command
Authorization: Bearer <token>

Request:
{
  "serverIds": [1, 2, 3],
  "command": "uptime",
  "timeout": 30000,
  "parallel": true
}

Response:
{
  "code": 0,
  "data": {
    "results": [
      {"serverId": 1, "success": true, "stdout": "...", "exitCode": 0},
      {"serverId": 2, "success": true, "stdout": "...", "exitCode": 0},
      {"serverId": 3, "success": false, "error": "Connection timeout"}
    ]
  }
}
```

### 4.6 文件管理接口

#### 列出目录
```
GET /api/v1/servers/:id/files?path=/home/user
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "data": {
    "path": "/home/user",
    "files": [
      {
        "name": "documents",
        "type": "directory",
        "size": 4096,
        "permissions": "drwxr-xr-x",
        "owner": "user",
        "group": "user",
        "modifiedAt": "2024-01-15T10:30:00Z"
      },
      {
        "name": "config.json",
        "type": "file",
        "size": 2560,
        "permissions": "-rw-r--r--",
        "owner": "user",
        "group": "user",
        "modifiedAt": "2024-01-14T08:20:00Z"
      }
    ]
  }
}
```

#### 上传文件
```
POST /api/v1/servers/:id/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- file: 文件内容
- path: 目标路径 (如 /home/user/)
- overwrite: 是否覆盖 (默认false)

Response:
{
  "code": 0,
  "data": {
    "name": "uploaded.txt",
    "path": "/home/user/uploaded.txt",
    "size": 1024
  }
}
```

#### 下载文件
```
GET /api/v1/servers/:id/files/download?path=/home/user/file.txt
Authorization: Bearer <token>

Response: 文件二进制流
Content-Disposition: attachment; filename="file.txt"
```

#### 删除文件/目录
```
DELETE /api/v1/servers/:id/files?path=/home/user/old.txt
Authorization: Bearer <token>

Query Parameters:
- recursive: 是否递归删除目录 (默认false)
```

#### 创建目录
```
POST /api/v1/servers/:id/files/mkdir
Authorization: Bearer <token>

Request:
{
  "path": "/home/user/new_folder"
}
```

#### 重命名/移动
```
PUT /api/v1/servers/:id/files/rename
Authorization: Bearer <token>

Request:
{
  "oldPath": "/home/user/old_name.txt",
  "newPath": "/home/user/new_name.txt"
}
```

### 4.7 分组管理接口

#### 获取分组列表
```
GET /api/v1/groups
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "生产环境",
      "color": "#F56C6C",
      "description": "生产服务器",
      "serverCount": 15
    }
  ]
}
```

#### 创建/更新/删除分组
```
POST   /api/v1/groups
PUT    /api/v1/groups/:id
DELETE /api/v1/groups/:id
```

### 4.8 告警接口

#### 获取告警列表
```
GET /api/v1/alerts?status=active&severity=critical&page=1
Authorization: Bearer <token>
```

#### 确认告警
```
PUT /api/v1/alerts/:id/acknowledge
Authorization: Bearer <token>
```

#### 告警规则CRUD
```
GET    /api/v1/alert-rules
POST   /api/v1/alert-rules
PUT    /api/v1/alert-rules/:id
DELETE /api/v1/alert-rules/:id
```

---

## 5. WebSocket接口设计

### 5.1 连接建立

```javascript
// 客户端连接
const ws = new WebSocket('wss://server:3001/ws');
ws.onopen = () => {
  // 发送认证
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'Bearer xxx'
  }));
};
```

### 5.2 消息格式

```typescript
// 客户端发送
interface ClientMessage {
  type: 'auth' | 'subscribe' | 'unsubscribe' | 'ssh_input' | 'ssh_resize';
  payload: any;
}

// 服务端发送
interface ServerMessage {
  type: 'auth_success' | 'auth_error' | 'status_update' | 'alert' |
        'ssh_output' | 'ssh_error' | 'ssh_close';
  payload: any;
}
```

### 5.3 状态订阅

```javascript
// 订阅服务器状态
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: {
    channel: 'status',
    serverIds: [1, 2, 3]  // 空数组表示订阅所有
  }
}));

// 接收状态更新
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'status_update') {
    // msg.payload = { serverId, metrics: {...} }
    updateServerStatus(msg.payload);
  }
};
```

### 5.4 SSH终端

```javascript
// 建立SSH连接
ws.send(JSON.stringify({
  type: 'ssh_connect',
  payload: {
    serverId: 1,
    cols: 80,
    rows: 24
  }
}));

// 发送输入
ws.send(JSON.stringify({
  type: 'ssh_input',
  payload: {
    sessionId: 'xxx',
    data: 'ls -la\r'
  }
}));

// 调整终端大小
ws.send(JSON.stringify({
  type: 'ssh_resize',
  payload: {
    sessionId: 'xxx',
    cols: 120,
    rows: 40
  }
}));

// 接收输出
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'ssh_output') {
    terminal.write(msg.payload.data);
  }
};
```

---

## 6. 前端组件设计

### 6.1 目录结构

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── api/                    # API请求
│   │   ├── auth.ts
│   │   ├── servers.ts
│   │   ├── metrics.ts
│   │   └── index.ts
│   ├── assets/                 # 静态资源
│   │   ├── images/
│   │   └── styles/
│   │       ├── variables.scss
│   │       └── global.scss
│   ├── components/             # 通用组件
│   │   ├── common/
│   │   │   ├── AppHeader.vue
│   │   │   ├── AppSidebar.vue
│   │   │   └── LoadingSpinner.vue
│   │   ├── charts/
│   │   │   ├── GaugeChart.vue      # 仪表盘图表
│   │   │   ├── LineChart.vue       # 折线图
│   │   │   └── PieChart.vue        # 饼图
│   │   ├── server/
│   │   │   ├── ServerCard.vue      # 服务器卡片
│   │   │   ├── ServerStatus.vue    # 状态指示器
│   │   │   ├── ProcessList.vue     # 进程列表
│   │   │   └── MetricsPanel.vue    # 监控面板
│   │   ├── terminal/
│   │   │   ├── SshTerminal.vue     # SSH终端
│   │   │   └── TerminalTabs.vue    # 终端标签页
│   │   └── file-manager/
│   │       ├── FileExplorer.vue    # 文件浏览器
│   │       ├── FileUploader.vue    # 文件上传
│   │       └── FileContextMenu.vue # 右键菜单
│   ├── composables/            # 组合式函数
│   │   ├── useWebSocket.ts
│   │   ├── useServerStatus.ts
│   │   └── useNotification.ts
│   ├── layouts/                # 布局组件
│   │   ├── DefaultLayout.vue
│   │   └── FullscreenLayout.vue
│   ├── router/                 # 路由配置
│   │   └── index.ts
│   ├── stores/                 # Pinia状态管理
│   │   ├── auth.ts
│   │   ├── servers.ts
│   │   ├── metrics.ts
│   │   └── websocket.ts
│   ├── types/                  # TypeScript类型
│   │   ├── server.ts
│   │   ├── metrics.ts
│   │   └── api.ts
│   ├── utils/                  # 工具函数
│   │   ├── format.ts
│   │   ├── crypto.ts
│   │   └── validators.ts
│   ├── views/                  # 页面组件
│   │   ├── Login.vue
│   │   ├── Dashboard.vue       # 服务器总览
│   │   ├── ServerDetail.vue    # 服务器详情
│   │   ├── Terminal.vue        # SSH终端页面
│   │   ├── FileManager.vue     # 文件管理页面
│   │   ├── Settings.vue        # 系统设置
│   │   └── Alerts.vue          # 告警管理
│   ├── App.vue
│   └── main.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 6.2 核心组件设计

#### ServerCard.vue (服务器卡片)
```vue
<template>
  <div
    class="server-card"
    :class="statusClass"
    @click="$emit('click', server)"
  >
    <div class="server-icon">
      <el-icon :size="40"><Monitor /></el-icon>
    </div>
    <div class="server-info">
      <h3 class="server-name">{{ server.name }}</h3>
      <span class="server-ip">{{ server.ip }}</span>
    </div>
    <div class="server-status">
      <span class="status-dot" :class="statusClass"></span>
      <span class="status-text">{{ statusText }}</span>
    </div>
    <div class="server-metrics" v-if="server.status === 'online'">
      <div class="metric">
        <span class="label">CPU</span>
        <el-progress
          :percentage="server.metrics?.cpuUsage || 0"
          :stroke-width="6"
          :color="getProgressColor(server.metrics?.cpuUsage)"
        />
      </div>
      <div class="metric">
        <span class="label">内存</span>
        <el-progress
          :percentage="server.metrics?.memoryUsage || 0"
          :stroke-width="6"
          :color="getProgressColor(server.metrics?.memoryUsage)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Server } from '@/types/server';

const props = defineProps<{
  server: Server;
}>();

const statusClass = computed(() => `status-${props.server.status}`);

const statusText = computed(() => {
  const map = {
    online: '正常',
    offline: '离线',
    warning: '警告',
    error: '异常'
  };
  return map[props.server.status] || '未知';
});

const getProgressColor = (value: number) => {
  if (value >= 90) return '#F56C6C';
  if (value >= 70) return '#E6A23C';
  return '#67C23A';
};
</script>
```

#### SshTerminal.vue (SSH终端)
```vue
<template>
  <div class="ssh-terminal" ref="terminalContainer">
    <div class="terminal-toolbar">
      <span class="connection-status" :class="{ connected: isConnected }">
        {{ isConnected ? '已连接' : '未连接' }}
      </span>
      <el-button-group>
        <el-button size="small" @click="reconnect">重连</el-button>
        <el-button size="small" @click="clear">清屏</el-button>
        <el-button size="small" @click="toggleFullscreen">全屏</el-button>
      </el-button-group>
    </div>
    <div class="terminal-wrapper" ref="terminalWrapper"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useWebSocket } from '@/composables/useWebSocket';

const props = defineProps<{
  serverId: number;
}>();

const terminalWrapper = ref<HTMLElement>();
const terminal = ref<Terminal>();
const fitAddon = ref<FitAddon>();
const isConnected = ref(false);
const sessionId = ref<string>();

const { send, subscribe, unsubscribe } = useWebSocket();

onMounted(() => {
  // 初始化终端
  terminal.value = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4'
    }
  });

  fitAddon.value = new FitAddon();
  terminal.value.loadAddon(fitAddon.value);
  terminal.value.loadAddon(new WebLinksAddon());

  terminal.value.open(terminalWrapper.value!);
  fitAddon.value.fit();

  // 监听输入
  terminal.value.onData((data) => {
    if (isConnected.value && sessionId.value) {
      send({
        type: 'ssh_input',
        payload: { sessionId: sessionId.value, data }
      });
    }
  });

  // 监听终端大小变化
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.value?.fit();
    if (isConnected.value && sessionId.value) {
      send({
        type: 'ssh_resize',
        payload: {
          sessionId: sessionId.value,
          cols: terminal.value!.cols,
          rows: terminal.value!.rows
        }
      });
    }
  });
  resizeObserver.observe(terminalWrapper.value!);

  // 订阅SSH输出
  subscribe('ssh_output', handleOutput);
  subscribe('ssh_error', handleError);
  subscribe('ssh_close', handleClose);

  // 建立连接
  connect();
});

const connect = () => {
  send({
    type: 'ssh_connect',
    payload: {
      serverId: props.serverId,
      cols: terminal.value!.cols,
      rows: terminal.value!.rows
    }
  });
};

const handleOutput = (data: { sessionId: string; data: string }) => {
  if (!sessionId.value) {
    sessionId.value = data.sessionId;
    isConnected.value = true;
  }
  terminal.value?.write(data.data);
};

const handleError = (data: { message: string }) => {
  terminal.value?.write(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
};

const handleClose = () => {
  isConnected.value = false;
  terminal.value?.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
};

onUnmounted(() => {
  unsubscribe('ssh_output', handleOutput);
  unsubscribe('ssh_error', handleError);
  unsubscribe('ssh_close', handleClose);
  terminal.value?.dispose();
});
</script>
```

### 6.3 状态管理设计

#### stores/servers.ts
```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Server, ServerMetrics } from '@/types/server';
import * as serverApi from '@/api/servers';

export const useServersStore = defineStore('servers', () => {
  // 状态
  const servers = ref<Map<number, Server>>(new Map());
  const loading = ref(false);
  const currentServerId = ref<number | null>(null);

  // 计算属性
  const serverList = computed(() => Array.from(servers.value.values()));

  const currentServer = computed(() =>
    currentServerId.value ? servers.value.get(currentServerId.value) : null
  );

  const serversByGroup = computed(() => {
    const grouped = new Map<number, Server[]>();
    for (const server of servers.value.values()) {
      const groupId = server.groupId || 0;
      if (!grouped.has(groupId)) {
        grouped.set(groupId, []);
      }
      grouped.get(groupId)!.push(server);
    }
    return grouped;
  });

  const statusCounts = computed(() => {
    const counts = { online: 0, offline: 0, warning: 0, error: 0 };
    for (const server of servers.value.values()) {
      counts[server.status]++;
    }
    return counts;
  });

  // 方法
  async function fetchServers() {
    loading.value = true;
    try {
      const response = await serverApi.getServers();
      servers.value.clear();
      for (const server of response.data.list) {
        servers.value.set(server.id, server);
      }
    } finally {
      loading.value = false;
    }
  }

  async function addServer(data: Partial<Server>) {
    const response = await serverApi.addServer(data);
    servers.value.set(response.data.id, response.data);
    return response.data;
  }

  async function deleteServer(id: number) {
    await serverApi.deleteServer(id);
    servers.value.delete(id);
  }

  function updateServerMetrics(serverId: number, metrics: ServerMetrics) {
    const server = servers.value.get(serverId);
    if (server) {
      server.metrics = metrics;
      server.lastSeen = new Date().toISOString();

      // 更新状态
      if (metrics.pingLatency === null) {
        server.status = 'error';
      } else if (metrics.cpuUsage > 80 || metrics.memoryUsage > 80) {
        server.status = 'warning';
      } else {
        server.status = 'online';
      }
    }
  }

  return {
    servers,
    loading,
    currentServerId,
    serverList,
    currentServer,
    serversByGroup,
    statusCounts,
    fetchServers,
    addServer,
    deleteServer,
    updateServerMetrics
  };
});
```

---

## 7. 后端模块设计

### 7.1 目录结构

```
backend/
├── src/
│   ├── config/                 # 配置文件
│   │   ├── index.ts
│   │   ├── database.ts
│   │   └── constants.ts
│   ├── controllers/            # 控制器
│   │   ├── auth.controller.ts
│   │   ├── server.controller.ts
│   │   ├── metrics.controller.ts
│   │   ├── file.controller.ts
│   │   └── alert.controller.ts
│   ├── middleware/             # 中间件
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── logger.middleware.ts
│   │   └── validator.middleware.ts
│   ├── models/                 # 数据模型
│   │   ├── user.model.ts
│   │   ├── server.model.ts
│   │   ├── metrics.model.ts
│   │   └── alert.model.ts
│   ├── routes/                 # 路由定义
│   │   ├── index.ts
│   │   ├── auth.routes.ts
│   │   ├── server.routes.ts
│   │   └── file.routes.ts
│   ├── services/               # 业务服务
│   │   ├── auth.service.ts
│   │   ├── server.service.ts
│   │   ├── monitor.service.ts
│   │   ├── ssh.service.ts
│   │   ├── sftp.service.ts
│   │   ├── scanner.service.ts
│   │   └── alert.service.ts
│   ├── websocket/              # WebSocket处理
│   │   ├── index.ts
│   │   ├── handlers/
│   │   │   ├── status.handler.ts
│   │   │   ├── ssh.handler.ts
│   │   │   └── alert.handler.ts
│   │   └── sessions.ts
│   ├── utils/                  # 工具函数
│   │   ├── crypto.ts
│   │   ├── logger.ts
│   │   ├── response.ts
│   │   └── validators.ts
│   ├── types/                  # TypeScript类型
│   │   └── index.ts
│   ├── app.ts                  # Express应用
│   └── index.ts                # 入口文件
├── tests/                      # 测试文件
├── package.json
└── tsconfig.json
```

### 7.2 核心服务实现

#### services/ssh.service.ts
```typescript
import { Client, ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';
import { ServerModel } from '@/models/server.model';
import { decrypt } from '@/utils/crypto';
import { logger } from '@/utils/logger';

export interface SSHSession {
  id: string;
  serverId: number;
  client: Client;
  channel?: ClientChannel;
  cols: number;
  rows: number;
}

export class SSHService extends EventEmitter {
  private sessions: Map<string, SSHSession> = new Map();

  async connect(
    serverId: number,
    cols: number,
    rows: number
  ): Promise<string> {
    const server = await ServerModel.findById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const sessionId = this.generateSessionId();
    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.shell({ cols, rows }, (err, channel) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SSHSession = {
            id: sessionId,
            serverId,
            client,
            channel,
            cols,
            rows
          };

          this.sessions.set(sessionId, session);

          channel.on('data', (data: Buffer) => {
            this.emit('data', sessionId, data.toString());
          });

          channel.on('close', () => {
            this.closeSession(sessionId);
          });

          channel.stderr.on('data', (data: Buffer) => {
            this.emit('data', sessionId, data.toString());
          });

          resolve(sessionId);
        });
      });

      client.on('error', (err) => {
        logger.error(`SSH connection error for server ${serverId}:`, err);
        this.emit('error', sessionId, err.message);
        reject(err);
      });

      // 连接配置
      const connectConfig: any = {
        host: server.ip,
        port: server.sshPort,
        username: server.sshUser,
        readyTimeout: 10000,
        keepaliveInterval: 30000
      };

      if (server.sshAuthType === 'password') {
        connectConfig.password = decrypt(server.sshCredential);
      } else {
        connectConfig.privateKey = decrypt(server.sshCredential);
      }

      client.connect(connectConfig);
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.channel) {
      session.channel.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session?.channel) {
      session.channel.setWindow(rows, cols, 0, 0);
      session.cols = cols;
      session.rows = rows;
    }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.channel?.close();
      session.client.end();
      this.sessions.delete(sessionId);
      this.emit('close', sessionId);
    }
  }

  private generateSessionId(): string {
    return `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const sshService = new SSHService();
```

#### services/monitor.service.ts
```typescript
import { EventEmitter } from 'events';
import { ServerModel } from '@/models/server.model';
import { MetricsModel } from '@/models/metrics.model';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'ssh2';
import { decrypt } from '@/utils/crypto';
import { logger } from '@/utils/logger';

const execAsync = promisify(exec);

export interface ServerStatus {
  serverId: number;
  cpu: {
    usage: number;
    cores: number;
    loadAvg: number[];
  };
  memory: {
    usage: number;
    total: number;
    used: number;
    available: number;
  };
  disk: Array<{
    mount: string;
    total: number;
    used: number;
    percent: number;
  }>;
  gpu: Array<{
    index: number;
    name: string;
    usage: number;
    memoryUsed: number;
    memoryTotal: number;
    temperature: number;
  }>;
  topProcesses: Array<{
    pid: number;
    name: string;
    user: string;
    cpu: number;
    memory: number;
  }>;
  connection: {
    ping: boolean;
    pingLatency: number | null;
    ssh: boolean;
  };
  timestamp: string;
}

export class MonitorService extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private collectInterval = 5000; // 5秒采集一次

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.collectAllServers();
    }, this.collectInterval);

    // 立即执行一次
    this.collectAllServers();

    logger.info('Monitor service started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Monitor service stopped');
    }
  }

  async collectAllServers(): Promise<void> {
    const servers = await ServerModel.findAll();

    const promises = servers.map(server =>
      this.collectServerStatus(server.id).catch(err => {
        logger.error(`Failed to collect status for server ${server.id}:`, err);
        return null;
      })
    );

    const results = await Promise.all(promises);

    for (const status of results) {
      if (status) {
        // 保存到数据库
        await MetricsModel.insert(status);
        // 发送实时更新
        this.emit('status_update', status);
      }
    }
  }

  async collectServerStatus(serverId: number): Promise<ServerStatus | null> {
    const server = await ServerModel.findById(serverId);
    if (!server) return null;

    const status: ServerStatus = {
      serverId,
      cpu: { usage: 0, cores: 0, loadAvg: [0, 0, 0] },
      memory: { usage: 0, total: 0, used: 0, available: 0 },
      disk: [],
      gpu: [],
      topProcesses: [],
      connection: { ping: false, pingLatency: null, ssh: false },
      timestamp: new Date().toISOString()
    };

    // 1. Ping测试
    try {
      const pingResult = await this.ping(server.ip);
      status.connection.ping = pingResult.success;
      status.connection.pingLatency = pingResult.latency;
    } catch {
      status.connection.ping = false;
    }

    // 如果Ping不通，直接返回
    if (!status.connection.ping) {
      await ServerModel.updateStatus(serverId, 'error');
      return status;
    }

    // 2. SSH获取详细信息
    try {
      const sshData = await this.collectViaSSH(server);
      Object.assign(status, sshData);
      status.connection.ssh = true;

      // 更新服务器状态
      const newStatus = status.cpu.usage > 80 || status.memory.usage > 80
        ? 'warning' : 'online';
      await ServerModel.updateStatus(serverId, newStatus);
    } catch (err) {
      logger.error(`SSH collection failed for ${server.ip}:`, err);
      status.connection.ssh = false;
      await ServerModel.updateStatus(serverId, 'error');
    }

    return status;
  }

  private async ping(ip: string): Promise<{ success: boolean; latency: number | null }> {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `ping -n 1 -w 3000 ${ip}`
        : `ping -c 1 -W 3 ${ip}`;

      const { stdout } = await execAsync(cmd);

      // 解析延迟
      const latencyMatch = isWindows
        ? stdout.match(/时间[=<](\d+)ms/)
        : stdout.match(/time=(\d+\.?\d*)\s*ms/);

      const latency = latencyMatch ? parseFloat(latencyMatch[1]) : null;

      return { success: true, latency };
    } catch {
      return { success: false, latency: null };
    }
  }

  private async collectViaSSH(server: any): Promise<Partial<ServerStatus>> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const result: Partial<ServerStatus> = {};

      client.on('ready', async () => {
        try {
          // 收集各项指标
          const [cpuInfo, memInfo, diskInfo, gpuInfo, processes] = await Promise.all([
            this.execCommand(client, this.getCPUCommand()),
            this.execCommand(client, this.getMemoryCommand()),
            this.execCommand(client, this.getDiskCommand()),
            this.execCommand(client, this.getGPUCommand()),
            this.execCommand(client, this.getTopProcessesCommand())
          ]);

          result.cpu = this.parseCPUInfo(cpuInfo);
          result.memory = this.parseMemoryInfo(memInfo);
          result.disk = this.parseDiskInfo(diskInfo);
          result.gpu = this.parseGPUInfo(gpuInfo);
          result.topProcesses = this.parseProcesses(processes);

          client.end();
          resolve(result);
        } catch (err) {
          client.end();
          reject(err);
        }
      });

      client.on('error', reject);

      const config: any = {
        host: server.ip,
        port: server.sshPort,
        username: server.sshUser,
        readyTimeout: 10000
      };

      if (server.sshAuthType === 'password') {
        config.password = decrypt(server.sshCredential);
      } else {
        config.privateKey = decrypt(server.sshCredential);
      }

      client.connect(config);
    });
  }

  private execCommand(client: Client, cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      client.exec(cmd, (err, stream) => {
        if (err) return reject(err);

        let output = '';
        stream.on('data', (data: Buffer) => output += data.toString());
        stream.stderr.on('data', () => {}); // 忽略错误输出
        stream.on('close', () => resolve(output));
      });
    });
  }

  private getCPUCommand(): string {
    return `
      echo "CPU_USAGE:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')"
      echo "CPU_CORES:$(nproc)"
      echo "LOAD_AVG:$(cat /proc/loadavg | awk '{print $1,$2,$3}')"
    `;
  }

  private getMemoryCommand(): string {
    return `free -b | grep Mem | awk '{print "TOTAL:"$2,"USED:"$3,"AVAILABLE:"$7}'`;
  }

  private getDiskCommand(): string {
    return `df -B1 | grep -E '^/dev' | awk '{print $6":"$2":"$3":"$5}'`;
  }

  private getGPUCommand(): string {
    return `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || echo "NO_GPU"`;
  }

  private getTopProcessesCommand(): string {
    return `ps aux --sort=-%cpu | head -6 | tail -5 | awk '{print $2":"$11":"$1":"$3":"$4}'`;
  }

  // 解析函数...
  private parseCPUInfo(output: string) { /* ... */ }
  private parseMemoryInfo(output: string) { /* ... */ }
  private parseDiskInfo(output: string) { /* ... */ }
  private parseGPUInfo(output: string) { /* ... */ }
  private parseProcesses(output: string) { /* ... */ }
}

export const monitorService = new MonitorService();
```

---

## 8. Agent设计

### 8.1 Agent目录结构

```
agent/
├── src/
│   ├── collectors/             # 数据采集器
│   │   ├── __init__.py
│   │   ├── cpu.py
│   │   ├── memory.py
│   │   ├── disk.py
│   │   ├── gpu.py
│   │   ├── network.py
│   │   └── process.py
│   ├── config.py               # 配置管理
│   ├── main.py                 # 主入口
│   └── reporter.py             # 数据上报
├── requirements.txt
├── install.sh                  # 安装脚本
└── agent.service               # systemd服务文件
```

### 8.2 Agent实现

#### agent/src/main.py
```python
#!/usr/bin/env python3
"""
Linux Server Monitor Agent
数据采集并上报到监控服务器
"""

import time
import logging
import threading
from typing import Dict, Any

from collectors.cpu import CPUCollector
from collectors.memory import MemoryCollector
from collectors.disk import DiskCollector
from collectors.gpu import GPUCollector
from collectors.network import NetworkCollector
from collectors.process import ProcessCollector
from reporter import Reporter
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('agent')


class MonitorAgent:
    def __init__(self, config: Config):
        self.config = config
        self.running = False

        # 初始化采集器
        self.collectors = {
            'cpu': CPUCollector(),
            'memory': MemoryCollector(),
            'disk': DiskCollector(),
            'gpu': GPUCollector(),
            'network': NetworkCollector(),
            'process': ProcessCollector()
        }

        # 初始化上报器
        self.reporter = Reporter(
            server_url=config.server_url,
            api_key=config.api_key,
            agent_id=config.agent_id
        )

    def collect_all(self) -> Dict[str, Any]:
        """采集所有指标"""
        data = {
            'agent_id': self.config.agent_id,
            'timestamp': time.time()
        }

        for name, collector in self.collectors.items():
            try:
                data[name] = collector.collect()
            except Exception as e:
                logger.error(f"Failed to collect {name}: {e}")
                data[name] = None

        return data

    def run(self):
        """主循环"""
        self.running = True
        logger.info(f"Agent started, reporting to {self.config.server_url}")

        while self.running:
            try:
                # 采集数据
                data = self.collect_all()

                # 上报数据
                success = self.reporter.report(data)
                if success:
                    logger.debug("Data reported successfully")
                else:
                    logger.warning("Failed to report data")

            except Exception as e:
                logger.error(f"Error in main loop: {e}")

            # 等待下一次采集
            time.sleep(self.config.collect_interval)

    def stop(self):
        """停止Agent"""
        self.running = False
        logger.info("Agent stopping...")


def main():
    config = Config.load()
    agent = MonitorAgent(config)

    try:
        agent.run()
    except KeyboardInterrupt:
        agent.stop()


if __name__ == '__main__':
    main()
```

#### agent/src/collectors/cpu.py
```python
"""CPU指标采集器"""

import psutil
from typing import Dict, Any


class CPUCollector:
    def collect(self) -> Dict[str, Any]:
        """采集CPU指标"""
        return {
            'usage': psutil.cpu_percent(interval=1),
            'cores': psutil.cpu_count(),
            'cores_logical': psutil.cpu_count(logical=True),
            'load_avg': list(psutil.getloadavg()),
            'per_cpu': psutil.cpu_percent(interval=0, percpu=True),
            'freq': self._get_freq(),
            'times': self._get_times()
        }

    def _get_freq(self) -> Dict[str, float]:
        freq = psutil.cpu_freq()
        if freq:
            return {
                'current': freq.current,
                'min': freq.min,
                'max': freq.max
            }
        return {}

    def _get_times(self) -> Dict[str, float]:
        times = psutil.cpu_times_percent()
        return {
            'user': times.user,
            'system': times.system,
            'idle': times.idle,
            'iowait': getattr(times, 'iowait', 0)
        }
```

#### agent/src/collectors/gpu.py
```python
"""GPU指标采集器 (NVIDIA)"""

import subprocess
from typing import Dict, Any, List, Optional


class GPUCollector:
    def collect(self) -> Optional[List[Dict[str, Any]]]:
        """采集GPU指标"""
        try:
            result = subprocess.run(
                [
                    'nvidia-smi',
                    '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw',
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
                if not line:
                    continue

                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    gpus.append({
                        'index': int(parts[0]),
                        'name': parts[1],
                        'usage': float(parts[2]),
                        'memory_used': int(parts[3]),
                        'memory_total': int(parts[4]),
                        'temperature': int(parts[5]),
                        'power': float(parts[6]) if len(parts) > 6 else None
                    })

            return gpus if gpus else None

        except (subprocess.SubprocessError, FileNotFoundError):
            return None
```

### 8.3 Agent安装脚本

#### agent/install.sh
```bash
#!/bin/bash
# Linux Server Monitor Agent 安装脚本

set -e

INSTALL_DIR="/opt/server-monitor-agent"
SERVICE_NAME="server-monitor-agent"

echo "=========================================="
echo "  Linux Server Monitor Agent Installer"
echo "=========================================="

# 检查root权限
if [ "$EUID" -ne 0 ]; then
    echo "请使用root权限运行此脚本"
    exit 1
fi

# 检查Python版本
python_version=$(python3 --version 2>&1 | awk '{print $2}')
required_version="3.9"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "需要Python 3.9或更高版本，当前版本: $python_version"
    exit 1
fi

echo "[1/5] 创建安装目录..."
mkdir -p $INSTALL_DIR
cp -r . $INSTALL_DIR/

echo "[2/5] 安装依赖..."
cd $INSTALL_DIR
pip3 install -r requirements.txt

echo "[3/5] 配置Agent..."
if [ ! -f "$INSTALL_DIR/config.yaml" ]; then
    read -p "请输入监控服务器地址 (如 http://192.168.1.10:3000): " server_url
    read -p "请输入Agent ID (可留空自动生成): " agent_id

    if [ -z "$agent_id" ]; then
        agent_id=$(hostname)-$(cat /etc/machine-id | head -c 8)
    fi

    cat > $INSTALL_DIR/config.yaml << EOF
server_url: "$server_url"
agent_id: "$agent_id"
collect_interval: 5
api_key: ""
EOF

    echo "配置已保存到 $INSTALL_DIR/config.yaml"
fi

echo "[4/5] 安装系统服务..."
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Linux Server Monitor Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/src/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME

echo "[5/5] 启动服务..."
systemctl start $SERVICE_NAME

echo ""
echo "=========================================="
echo "  安装完成！"
echo "=========================================="
echo "Agent ID: $agent_id"
echo "安装目录: $INSTALL_DIR"
echo "配置文件: $INSTALL_DIR/config.yaml"
echo ""
echo "常用命令:"
echo "  查看状态: systemctl status $SERVICE_NAME"
echo "  查看日志: journalctl -u $SERVICE_NAME -f"
echo "  重启服务: systemctl restart $SERVICE_NAME"
echo "  停止服务: systemctl stop $SERVICE_NAME"
echo "=========================================="
```

---

## 9. 安全设计

### 9.1 认证与授权

```
┌─────────────────────────────────────────────────────────────────┐
│                      安全架构                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   用户请求 ──> JWT验证 ──> 角色检查 ──> 操作权限 ──> 执行       │
│                                                                  │
│   权限矩阵:                                                      │
│   ┌──────────┬──────┬──────────┬────────┐                       │
│   │ 操作     │admin │ operator │ viewer │                       │
│   ├──────────┼──────┼──────────┼────────┤                       │
│   │ 查看状态 │  ✓   │    ✓     │   ✓    │                       │
│   │ SSH连接  │  ✓   │    ✓     │   ✗    │                       │
│   │ 文件管理 │  ✓   │    ✓     │   ✗    │                       │
│   │ 重启服务 │  ✓   │    ✗     │   ✗    │                       │
│   │ 添加服务器│  ✓   │    ✗     │   ✗    │                       │
│   │ 用户管理 │  ✓   │    ✗     │   ✗    │                       │
│   └──────────┴──────┴──────────┴────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 数据加密

```typescript
// utils/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32字节密钥

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### 9.3 安全配置清单

| 项目 | 措施 | 说明 |
|------|------|------|
| HTTPS | 强制启用 | 使用Let's Encrypt或自签名证书 |
| 密码存储 | bcrypt哈希 | cost factor >= 10 |
| SSH凭证 | AES-256-GCM加密 | 数据库中加密存储 |
| JWT | RS256签名 | 有效期24小时 |
| CORS | 白名单域名 | 仅允许指定域名访问 |
| Rate Limiting | 请求限流 | 100次/分钟/IP |
| 输入验证 | 严格校验 | 防止注入攻击 |
| 操作审计 | 日志记录 | 所有敏感操作记录 |

---

## 10. 部署方案

### 10.1 Windows工作站部署

#### 10.1.1 环境准备
```powershell
# 1. 安装Node.js 20 LTS
# 下载地址: https://nodejs.org/

# 2. 验证安装
node --version  # v20.x.x
npm --version   # 10.x.x

# 3. 安装PM2进程管理器
npm install -g pm2
```

#### 10.1.2 后端部署
```powershell
# 1. 克隆项目
git clone <repository_url>
cd server-monitor/backend

# 2. 安装依赖
npm install

# 3. 配置环境变量
copy .env.example .env
# 编辑 .env 文件设置以下变量:
# PORT=3000
# WS_PORT=3001
# JWT_SECRET=<random_string>
# ENCRYPTION_KEY=<32_bytes_hex>
# DATABASE_PATH=./data/server-monitor.db

# 4. 初始化数据库
npm run db:init

# 5. 构建生产版本
npm run build

# 6. 使用PM2启动
pm2 start dist/index.js --name "server-monitor-api"
pm2 save
pm2 startup
```

#### 10.1.3 前端部署
```powershell
# 1. 进入前端目录
cd server-monitor/frontend

# 2. 安装依赖
npm install

# 3. 配置环境变量
copy .env.example .env.production
# 编辑 .env.production:
# VITE_API_URL=http://localhost:3000
# VITE_WS_URL=ws://localhost:3001

# 4. 构建生产版本
npm run build

# 5. 部署静态文件
# 方案A: 使用后端Express托管
copy -r dist/* ../backend/public/

# 方案B: 使用Nginx托管（推荐）
# 将dist目录内容复制到Nginx的html目录
```

#### 10.1.4 Nginx配置（可选）
```nginx
# nginx.conf
server {
    listen 80;
    server_name localhost;

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket代理
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 10.2 Linux服务器Agent部署

```bash
# 1. 下载Agent
wget https://your-server/agent/install.sh

# 2. 执行安装
chmod +x install.sh
sudo ./install.sh

# 3. 配置
sudo vim /opt/server-monitor-agent/config.yaml

# 4. 启动
sudo systemctl start server-monitor-agent
sudo systemctl status server-monitor-agent
```

### 10.3 一键部署脚本

#### deploy.ps1 (Windows)
```powershell
# Windows一键部署脚本
param(
    [string]$Mode = "all"  # all, backend, frontend
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Server Monitor Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

function Deploy-Backend {
    Write-Host "`n[Backend] Starting deployment..." -ForegroundColor Yellow

    Set-Location backend

    Write-Host "Installing dependencies..."
    npm install

    Write-Host "Building..."
    npm run build

    Write-Host "Starting with PM2..."
    pm2 delete server-monitor-api -s
    pm2 start dist/index.js --name "server-monitor-api"
    pm2 save

    Set-Location ..
    Write-Host "[Backend] Deployment completed!" -ForegroundColor Green
}

function Deploy-Frontend {
    Write-Host "`n[Frontend] Starting deployment..." -ForegroundColor Yellow

    Set-Location frontend

    Write-Host "Installing dependencies..."
    npm install

    Write-Host "Building..."
    npm run build

    Write-Host "Copying to backend public folder..."
    Copy-Item -Path "dist\*" -Destination "..\backend\public\" -Recurse -Force

    Set-Location ..
    Write-Host "[Frontend] Deployment completed!" -ForegroundColor Green
}

switch ($Mode) {
    "backend" { Deploy-Backend }
    "frontend" { Deploy-Frontend }
    "all" {
        Deploy-Backend
        Deploy-Frontend
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment Finished!" -ForegroundColor Cyan
Write-Host "  Access: http://localhost:3000" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
```

---

## 11. 开发规范

### 11.1 代码规范

#### TypeScript/JavaScript
- 使用ESLint + Prettier
- 配置文件见 `.eslintrc.js` 和 `.prettierrc`

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    'vue/multi-word-component-names': 'off'
  }
};
```

#### Python (Agent)
- 使用Black + isort + flake8
- 遵循PEP 8规范

### 11.2 Git提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type类型：**
- feat: 新功能
- fix: 修复Bug
- docs: 文档更新
- style: 代码格式
- refactor: 重构
- test: 测试相关
- chore: 构建/工具

**示例：**
```
feat(server): add batch command execution

- Support executing commands on multiple servers
- Add parallel execution option
- Add command template save feature

Closes #123
```

### 11.3 分支策略

```
main          ─────────────────────────────────>
                    │               │
develop      ───────┴───────────────┴──────────>
                    │       │
feature/xxx  ───────┴───────┘
```

---

## 12. 附录

### 12.1 环境变量说明

#### 后端 (.env)
```bash
# 服务配置
PORT=3000
WS_PORT=3001
NODE_ENV=production

# 数据库
DATABASE_PATH=./data/server-monitor.db

# 安全
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_EXPIRES_IN=86400
ENCRYPTION_KEY=your-32-bytes-hex-encryption-key

# 日志
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# 监控配置
MONITOR_INTERVAL=5000
METRICS_RETENTION_DAYS=7
```

#### 前端 (.env.production)
```bash
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
VITE_APP_TITLE=服务器监控中心
```

#### Agent (config.yaml)
```yaml
server_url: "http://192.168.1.10:3000"
agent_id: "server-001"
collect_interval: 5
api_key: ""
log_level: "INFO"
```

### 12.2 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| SSH连接超时 | 网络不通或端口错误 | 检查网络连通性和SSH端口 |
| GPU数据为空 | 未安装nvidia-smi | 安装NVIDIA驱动 |
| WebSocket断开 | 代理超时或网络问题 | 配置代理keepalive |
| 数据库锁定 | SQLite并发写入 | 升级到PostgreSQL |

### 12.3 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-02-05 | 初始版本，技术设计文档 |

---

文档版本: v1.0
创建日期: 2026-02-05
最后更新: 2026-02-05
