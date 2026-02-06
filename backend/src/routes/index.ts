import { Router } from 'express';
import multer from 'multer';
import { AuthController } from '../controllers/auth.controller';
import { ServerController } from '../controllers/server.controller';
import { FileController } from '../controllers/file.controller';
import { AgentController } from '../controllers/agent.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// 认证路由
router.post('/auth/login', AuthController.login);
router.post('/auth/refresh', authenticate, AuthController.refresh);
router.put('/auth/password', authenticate, AuthController.changePassword);
router.get('/auth/profile', authenticate, AuthController.getProfile);

// 服务器概览
router.get('/overview', authenticate, ServerController.getOverview);

// 服务器管理
router.get('/servers', authenticate, ServerController.list);
router.post('/servers', authenticate, requireRole('admin', 'operator'), ServerController.create);
router.post('/servers/scan', authenticate, requireRole('admin'), ServerController.scan);
router.delete('/servers/batch', authenticate, requireRole('admin'), ServerController.batchDelete);
router.get('/servers/:id', authenticate, ServerController.get);
router.put('/servers/:id', authenticate, requireRole('admin', 'operator'), ServerController.update);
router.delete('/servers/:id', authenticate, requireRole('admin'), ServerController.delete);
router.post('/servers/:id/test', authenticate, ServerController.test);

// 服务器状态和监控
router.get('/servers/:id/status', authenticate, ServerController.getStatus);
router.get('/servers/:id/metrics', authenticate, ServerController.getMetrics);

// 服务器操作
router.post('/servers/:id/reboot', authenticate, requireRole('admin'), ServerController.reboot);
router.post('/servers/:id/command', authenticate, requireRole('admin', 'operator'), ServerController.executeCommand);

// 文件管理
router.get('/servers/:id/files', authenticate, requireRole('admin', 'operator'), FileController.listDirectory);
router.get('/servers/:id/files/download', authenticate, requireRole('admin', 'operator'), FileController.download);
router.post('/servers/:id/files/upload', authenticate, requireRole('admin', 'operator'), upload.single('file'), FileController.upload);
router.delete('/servers/:id/files', authenticate, requireRole('admin', 'operator'), FileController.delete);
router.post('/servers/:id/files/mkdir', authenticate, requireRole('admin', 'operator'), FileController.createDirectory);
router.put('/servers/:id/files/rename', authenticate, requireRole('admin', 'operator'), FileController.rename);

// 分组管理
router.get('/groups', authenticate, ServerController.getGroups);
router.post('/groups', authenticate, requireRole('admin'), ServerController.createGroup);
router.put('/groups/:id', authenticate, requireRole('admin'), ServerController.updateGroup);
router.delete('/groups/:id', authenticate, requireRole('admin'), ServerController.deleteGroup);

// Agent 接口（不需要用户认证，使用 API Key）
router.post('/agent/report', AgentController.report);
router.post('/agent/register', AgentController.register);
router.post('/agent/heartbeat', AgentController.heartbeat);

export default router;
