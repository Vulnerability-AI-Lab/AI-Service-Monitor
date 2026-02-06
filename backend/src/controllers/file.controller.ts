import { Request, Response } from 'express';
import { ServerModel } from '../models/server.model';
import { sftpService } from '../services/sftp.service';
import { success, error, ErrorCodes } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class FileController {
  static async listDirectory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { path = '/' } = req.query;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const files = await sftpService.listDirectory(Number(id), String(path));

      success(res, {
        path,
        files
      });
    } catch (err) {
      console.error('List directory error:', err);
      error(res, ErrorCodes.SSH_ERROR, '获取目录列表失败: ' + (err as Error).message);
    }
  }

  static async download(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { path } = req.query;

      if (!path) {
        error(res, ErrorCodes.INVALID_PARAM, '文件路径不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const data = await sftpService.downloadFile(Number(id), String(path));

      const filename = String(path).split('/').pop() || 'download';
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(data);
    } catch (err) {
      console.error('Download error:', err);
      error(res, ErrorCodes.SSH_ERROR, '下载文件失败: ' + (err as Error).message);
    }
  }

  static async upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { path } = req.body;

      if (!req.file) {
        error(res, ErrorCodes.INVALID_PARAM, '请选择要上传的文件');
        return;
      }

      if (!path) {
        error(res, ErrorCodes.INVALID_PARAM, '目标路径不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const remotePath = path.endsWith('/')
        ? `${path}${req.file.originalname}`
        : path;

      await sftpService.uploadFile(Number(id), remotePath, req.file.buffer);

      success(res, {
        name: req.file.originalname,
        path: remotePath,
        size: req.file.size
      }, '上传成功');
    } catch (err) {
      console.error('Upload error:', err);
      error(res, ErrorCodes.SSH_ERROR, '上传文件失败: ' + (err as Error).message);
    }
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { path, recursive = false } = req.query;

      if (!path) {
        error(res, ErrorCodes.INVALID_PARAM, '文件路径不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      // 获取文件信息判断是文件还是目录
      try {
        const stat = await sftpService.stat(Number(id), String(path));
        if (stat.type === 'directory') {
          if (recursive === 'true') {
            // 递归删除需要使用SSH命令
            const { sshService } = require('../services/ssh.service');
            await sshService.executeCommand(Number(id), `rm -rf "${path}"`, 30000);
          } else {
            await sftpService.deleteDirectory(Number(id), String(path));
          }
        } else {
          await sftpService.deleteFile(Number(id), String(path));
        }
      } catch (e) {
        // 如果获取stat失败，尝试作为文件删除
        await sftpService.deleteFile(Number(id), String(path));
      }

      success(res, null, '删除成功');
    } catch (err) {
      console.error('Delete error:', err);
      error(res, ErrorCodes.SSH_ERROR, '删除失败: ' + (err as Error).message);
    }
  }

  static async createDirectory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { path } = req.body;

      if (!path) {
        error(res, ErrorCodes.INVALID_PARAM, '目录路径不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      await sftpService.createDirectory(Number(id), path);

      success(res, { path }, '创建成功');
    } catch (err) {
      console.error('Create directory error:', err);
      error(res, ErrorCodes.SSH_ERROR, '创建目录失败: ' + (err as Error).message);
    }
  }

  static async rename(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { oldPath, newPath } = req.body;

      if (!oldPath || !newPath) {
        error(res, ErrorCodes.INVALID_PARAM, '路径不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      await sftpService.rename(Number(id), oldPath, newPath);

      success(res, { oldPath, newPath }, '重命名成功');
    } catch (err) {
      console.error('Rename error:', err);
      error(res, ErrorCodes.SSH_ERROR, '重命名失败: ' + (err as Error).message);
    }
  }
}
