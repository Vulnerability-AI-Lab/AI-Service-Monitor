import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  wsPort: parseInt(process.env.WS_PORT || '8001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    path: process.env.DATABASE_PATH || './data/server-monitor.db'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '86400', 10)
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  },

  monitor: {
    interval: parseInt(process.env.MONITOR_INTERVAL || '60000', 10),  // SSH 监控间隔改为 60 秒
    retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '7', 10)
  }
};

export default config;
