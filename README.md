# Linux服务器群监测响应系统

一个现代化的Linux服务器集群监控与管理系统，提供实时状态监控、远程操作、文件管理等功能。

![Dashboard Preview](docs/images/dashboard.png)

## 功能特性

### 服务器管理
- 一键扫描网段，自动发现服务器
- 手动添加/编辑/删除服务器
- 服务器分组管理
- 批量操作支持

### 实时监控
- CPU使用率和负载
- 内存使用情况
- 磁盘空间监控
- GPU状态监控（NVIDIA）
- 网络流量统计
- Top进程监控
- Ping/SSH连接状态

### 远程操作
- Web SSH终端
- SFTP文件管理
- 远程命令执行
- 服务器重启

### 界面特点
- 科技感深色主题
- 实时数据更新
- 响应式设计
- 流畅的动画效果

## 技术栈

### 前端
- Vue 3 + TypeScript
- Element Plus
- ECharts
- xterm.js
- Pinia

### 后端
- Node.js + TypeScript
- Express
- WebSocket
- ssh2
- SQLite

### Agent
- Python 3.9+
- psutil
- GPUtil

## 快速开始

### 环境要求
- Node.js 18+
- Python 3.9+ (Agent)

---

### Windows 工作站部署

适用于在 Windows 系统上运行监控服务端。

#### 开发模式

1. **安装依赖**
```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

2. **配置环境**
```bash
cd backend
copy .env.example .env
# 编辑 .env 文件，设置必要的配置
```

3. **启动开发模式**
```bash
# 方式1：使用启动脚本
双击 start.bat

# 方式2：手动启动
cd backend
npm run dev
```

4. **访问系统**
- 打开浏览器访问: http://localhost:8000
- 默认账号: admin / admin123

#### 构建生产版本

```bash
# 使用构建脚本
双击 build.bat

# 或手动构建
cd frontend
npm run build

cd ../backend
npm run build
npm start
```

---

### Linux 工作站部署

适用于在 Linux 系统上运行监控服务端（如 Ubuntu、CentOS、Debian 等）。

#### 方式1：一键安装（推荐）

```bash
# 赋予执行权限
chmod +x install-linux.sh

# 运行安装脚本（需要root权限）
sudo ./install-linux.sh
```

安装完成后，服务将安装到 `/opt/server-monitor` 目录。

#### 方式2：手动安装

1. **安装 Node.js 18+**
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

2. **安装依赖**
```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

3. **配置环境**
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件
nano .env
```

4. **启动开发模式**
```bash
# 使用启动脚本
chmod +x start.sh
./start.sh

# 或手动启动
cd backend
npm run dev
```

#### 构建生产版本

```bash
# 使用构建脚本
chmod +x build.sh
./build.sh

# 或手动构建
cd frontend
npx vite build
cp -r dist/* ../backend/public/

cd ../backend
npm run build
npm start
```

#### 使用 PM2 管理（推荐生产环境）

```bash
# 安装PM2
sudo npm install -g pm2

# 启动服务
cd backend
pm2 start dist/index.js --name server-monitor

# 设置开机自启
pm2 save
pm2 startup
```

#### 使用 systemd 服务

```bash
# 复制服务文件（假设项目在 /opt/server-monitor）
sudo cp server-monitor.service /etc/systemd/system/

# 如果安装路径不同，需要编辑服务文件修改 WorkingDirectory
sudo nano /etc/systemd/system/server-monitor.service

# 重载配置
sudo systemctl daemon-reload

# 启用并启动服务
sudo systemctl enable server-monitor
sudo systemctl start server-monitor

# 查看状态
sudo systemctl status server-monitor

# 查看日志
sudo journalctl -u server-monitor -f
```

---

### Linux 服务器 Agent 部署

在被监控的 Linux 服务器上安装 Agent（不是工作站，是需要被监控的服务器）。

```bash
# 下载并执行安装脚本
chmod +x agent/install.sh
sudo ./agent/install.sh

# 编辑配置，设置工作站地址
sudo nano /opt/server-monitor-agent/config.yaml
# 修改 server_url 为工作站的 IP 地址

# 重启服务使配置生效
sudo systemctl restart server-monitor-agent

# 查看服务状态
systemctl status server-monitor-agent

# 查看日志
journalctl -u server-monitor-agent -f
```

## 目录结构

```
├── backend/                # 后端服务
│   ├── src/
│   │   ├── config/        # 配置
│   │   ├── controllers/   # 控制器
│   │   ├── middleware/    # 中间件
│   │   ├── models/        # 数据模型
│   │   ├── routes/        # 路由
│   │   ├── services/      # 业务服务
│   │   ├── websocket/     # WebSocket处理
│   │   └── utils/         # 工具函数
│   └── public/            # 前端构建输出
├── frontend/              # 前端应用
│   ├── src/
│   │   ├── api/          # API接口
│   │   ├── components/   # 组件
│   │   ├── layouts/      # 布局
│   │   ├── router/       # 路由
│   │   ├── stores/       # 状态管理
│   │   ├── styles/       # 样式
│   │   ├── types/        # 类型定义
│   │   └── views/        # 页面
│   └── public/
├── agent/                 # 服务器Agent
│   ├── src/
│   │   ├── collectors/   # 数据采集器
│   │   ├── config.py     # 配置
│   │   └── main.py       # 主程序
│   └── install.sh        # 安装脚本
├── docs/                  # 文档
│   ├── requirements.md   # 需求文档
│   └── technical-design.md # 技术设计
├── start.bat             # Windows启动脚本
├── start.sh              # Linux启动脚本
├── build.bat             # Windows构建脚本
├── build.sh              # Linux构建脚本
├── install-linux.sh      # Linux一键安装脚本
├── server-monitor.service # systemd服务配置
└── README.md
```

## API 文档

### 认证
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/refresh` - 刷新令牌
- `GET /api/v1/auth/profile` - 获取用户信息

### 服务器管理
- `GET /api/v1/servers` - 获取服务器列表
- `POST /api/v1/servers` - 添加服务器
- `PUT /api/v1/servers/:id` - 更新服务器
- `DELETE /api/v1/servers/:id` - 删除服务器
- `POST /api/v1/servers/scan` - 扫描网段

### 监控数据
- `GET /api/v1/servers/:id/status` - 获取实时状态
- `GET /api/v1/servers/:id/metrics` - 获取历史数据

### 远程操作
- `POST /api/v1/servers/:id/reboot` - 重启服务器
- `POST /api/v1/servers/:id/command` - 执行命令

### 文件管理
- `GET /api/v1/servers/:id/files` - 列出目录
- `GET /api/v1/servers/:id/files/download` - 下载文件
- `POST /api/v1/servers/:id/files/upload` - 上传文件
- `DELETE /api/v1/servers/:id/files` - 删除文件

### Agent 接口
- `POST /api/v1/agent/report` - Agent数据上报
- `POST /api/v1/agent/register` - Agent自动注册
- `POST /api/v1/agent/heartbeat` - Agent心跳

### WebSocket
- `ws://localhost:8001` - 实时数据推送和SSH终端

## 配置说明

### 后端配置 (.env)

```bash
# 服务端口
PORT=8000
WS_PORT=8001

# JWT密钥
JWT_SECRET=your-secret-key

# 加密密钥（64位十六进制）
ENCRYPTION_KEY=your-64-char-hex-key

# 数据库路径
DATABASE_PATH=./data/server-monitor.db

# 监控配置
MONITOR_INTERVAL=5000
METRICS_RETENTION_DAYS=7
```

### Agent配置 (config.yaml)

```yaml
# 监控服务器地址（修改为实际的工作站IP，Windows或Linux均可）
server_url: "http://192.168.1.10:8000"

# Agent ID（留空则自动生成）
agent_id: ""

# 数据采集间隔（秒）
collect_interval: 5

# 日志级别
log_level: "INFO"

# 是否启用GPU监控
enable_gpu: true
```

**注意**: Agent 通过 hostname 匹配服务器，请确保在网页上添加的服务器名称与 Linux 服务器的 `hostname` 一致。

## 安全说明

- 所有SSH凭证使用AES-256-GCM加密存储
- 用户密码使用bcrypt哈希
- 支持JWT认证
- 敏感操作记录审计日志

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
