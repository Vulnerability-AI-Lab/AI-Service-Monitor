import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './database';
import routes from './routes';
import config from './config';
import { wsManager } from './websocket';
import { monitorService } from './services/monitor.service';
import { MetricsModel } from './models/metrics.model';
import cron from 'node-cron';

// 初始化数据库
initDatabase();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../public')));

// API路由
app.use('/api/v1', routes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 前端路由回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    code: 50001,
    message: '服务器内部错误',
    error: config.nodeEnv === 'development' ? err.message : undefined
  });
});

// 启动HTTP服务
app.listen(config.port, () => {
  console.log(`HTTP server running on port ${config.port}`);
});

// 启动WebSocket服务
wsManager.start(config.wsPort);

// 启动监控服务
monitorService.start();

// 定时清理旧数据
cron.schedule('0 2 * * *', () => {
  console.log('Cleaning old metrics data...');
  MetricsModel.cleanOld(config.monitor.retentionDays);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  monitorService.stop();
  wsManager.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  monitorService.stop();
  wsManager.stop();
  process.exit(0);
});
