import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../config';

// 确保数据目录存在
const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.database.path);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 初始化数据库表
export function initDatabase(): void {
  db.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role TEXT CHECK(role IN ('admin', 'operator', 'viewer')) DEFAULT 'viewer',
      email VARCHAR(100),
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 服务器分组表
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#409EFF',
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 服务器表
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      ip VARCHAR(45) NOT NULL UNIQUE,
      ssh_port INTEGER DEFAULT 22,
      ssh_user VARCHAR(50) NOT NULL,
      ssh_auth_type TEXT CHECK(ssh_auth_type IN ('password', 'key')) DEFAULT 'password',
      ssh_credential TEXT NOT NULL,
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      status TEXT CHECK(status IN ('online', 'offline', 'warning', 'error')) DEFAULT 'offline',
      os_info VARCHAR(100),
      hostname VARCHAR(100),
      uptime INTEGER,
      last_seen DATETIME,
      tags TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 监控数据表
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      cpu_usage REAL,
      cpu_cores INTEGER,
      load_avg_1 REAL,
      load_avg_5 REAL,
      load_avg_15 REAL,
      memory_usage REAL,
      memory_total BIGINT,
      memory_used BIGINT,
      memory_available BIGINT,
      swap_usage REAL,
      disk_usage TEXT,
      gpu_count INTEGER DEFAULT 0,
      gpu_usage TEXT,
      network_io TEXT,
      top_processes TEXT,
      ping_latency REAL,
      ssh_status INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 操作日志表
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      server_id INTEGER REFERENCES servers(id),
      action VARCHAR(50) NOT NULL,
      detail TEXT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      result TEXT CHECK(result IN ('success', 'fail')) DEFAULT 'success',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 告警规则表
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      metric_type VARCHAR(50) NOT NULL,
      operator TEXT CHECK(operator IN ('>', '<', '>=', '<=', '==')) DEFAULT '>',
      threshold REAL NOT NULL,
      duration INTEGER DEFAULT 60,
      severity TEXT CHECK(severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
      enabled INTEGER DEFAULT 1,
      notify_channels TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 告警记录表
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER REFERENCES alert_rules(id),
      server_id INTEGER REFERENCES servers(id),
      message TEXT NOT NULL,
      value REAL,
      status TEXT CHECK(status IN ('active', 'resolved', 'acknowledged')) DEFAULT 'active',
      acknowledged_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
    CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(group_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_server ON metrics(server_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_metrics_server_time ON metrics(server_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_server ON operation_logs(server_id);
    CREATE INDEX IF NOT EXISTS idx_logs_time ON operation_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_server ON alerts(server_id);
  `);

  // 插入默认数据
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, role) VALUES (?, ?, ?)
    `).run('admin', hashedPassword, 'admin');
  }

  const groupCount = db.prepare('SELECT COUNT(*) as count FROM groups').get() as { count: number };
  if (groupCount.count === 0) {
    db.prepare(`
      INSERT INTO groups (name, color, description) VALUES
      ('生产环境', '#F56C6C', '生产服务器'),
      ('测试环境', '#E6A23C', '测试服务器'),
      ('开发环境', '#67C23A', '开发服务器')
    `).run();
  }

  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM alert_rules').get() as { count: number };
  if (ruleCount.count === 0) {
    db.prepare(`
      INSERT INTO alert_rules (name, metric_type, operator, threshold, severity) VALUES
      ('CPU高负载', 'cpu', '>', 80, 'warning'),
      ('CPU严重过载', 'cpu', '>', 95, 'critical'),
      ('内存不足', 'memory', '>', 80, 'warning'),
      ('内存严重不足', 'memory', '>', 95, 'critical'),
      ('磁盘空间不足', 'disk', '>', 80, 'warning'),
      ('磁盘空间严重不足', 'disk', '>', 95, 'critical')
    `).run();
  }

  console.log('Database initialized successfully');
}

export default db;
