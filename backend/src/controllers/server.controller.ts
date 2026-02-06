import { Request, Response } from 'express';
import { ServerModel } from '../models/server.model';
import { MetricsModel } from '../models/metrics.model';
import { GroupModel } from '../models/group.model';
import { encrypt } from '../utils/crypto';
import { success, error, paginate, ErrorCodes } from '../utils/response';
import { scannerService } from '../services/scanner.service';
import { sshService } from '../services/ssh.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class ServerController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, pageSize = 100, group, status, keyword } = req.query;

      let servers = ServerModel.findAll();

      // 过滤
      if (group) {
        servers = servers.filter(s => s.group_id === Number(group));
      }
      if (status) {
        servers = servers.filter(s => s.status === status);
      }
      if (keyword) {
        const kw = String(keyword).toLowerCase();
        servers = servers.filter(s =>
          s.name.toLowerCase().includes(kw) ||
          s.ip.includes(kw) ||
          s.hostname?.toLowerCase().includes(kw)
        );
      }

      // 获取最新指标
      const latestMetrics = MetricsModel.getLatestForAllServers();

      // 添加指标数据
      const serversWithMetrics = servers.map(server => {
        const metrics = latestMetrics.get(server.id);
        return {
          ...server,
          ssh_credential: undefined, // 不返回凭证
          metrics: metrics ? {
            cpuUsage: metrics.cpu_usage || 0,
            cpuCores: metrics.cpu_cores || 0,
            loadAvg: [
              metrics.load_avg_1 || 0,
              metrics.load_avg_5 || 0,
              metrics.load_avg_15 || 0
            ],
            memoryUsage: metrics.memory_usage || 0,
            memoryTotal: metrics.memory_total || 0,
            memoryUsed: metrics.memory_used || 0,
            memoryAvailable: metrics.memory_available || 0,
            diskUsage: metrics.disk_usage ? JSON.parse(metrics.disk_usage) : [],
            gpuUsage: metrics.gpu_usage ? JSON.parse(metrics.gpu_usage) : [],
            topProcesses: metrics.top_processes ? JSON.parse(metrics.top_processes) : [],
            networkIo: metrics.network_io ? JSON.parse(metrics.network_io) : {},
            pingLatency: metrics.ping_latency,
            sshStatus: metrics.ssh_status
          } : null
        };
      });

      // 分页
      const start = (Number(page) - 1) * Number(pageSize);
      const paged = serversWithMetrics.slice(start, start + Number(pageSize));

      paginate(res, paged, serversWithMetrics.length, Number(page), Number(pageSize));
    } catch (err) {
      console.error('List servers error:', err);
      error(res, ErrorCodes.SERVER_ERROR, '获取服务器列表失败');
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const server = ServerModel.findById(Number(id));

      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      // 获取最新指标
      const metrics = MetricsModel.getLatest(server.id);

      success(res, {
        ...server,
        ssh_credential: undefined,
        metrics: metrics ? {
          cpuUsage: metrics.cpu_usage || 0,
          cpuCores: metrics.cpu_cores || 0,
          loadAvg: [
            metrics.load_avg_1 || 0,
            metrics.load_avg_5 || 0,
            metrics.load_avg_15 || 0
          ],
          memoryUsage: metrics.memory_usage || 0,
          memoryTotal: metrics.memory_total || 0,
          memoryUsed: metrics.memory_used || 0,
          memoryAvailable: metrics.memory_available || 0,
          diskUsage: metrics.disk_usage ? JSON.parse(metrics.disk_usage) : [],
          gpuUsage: metrics.gpu_usage ? JSON.parse(metrics.gpu_usage) : [],
          topProcesses: metrics.top_processes ? JSON.parse(metrics.top_processes) : [],
          networkIo: metrics.network_io ? JSON.parse(metrics.network_io) : {},
          pingLatency: metrics.ping_latency,
          sshStatus: metrics.ssh_status
        } : null
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取服务器详情失败');
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, ip, sshPort, sshUser, sshAuthType, sshCredential, groupId, tags, notes } = req.body;

      if (!name || !ip || !sshUser || !sshCredential) {
        error(res, ErrorCodes.INVALID_PARAM, '必填字段不能为空');
        return;
      }

      // 检查IP是否已存在
      const existing = ServerModel.findByIp(ip);
      if (existing) {
        error(res, ErrorCodes.CONFLICT, 'IP地址已存在');
        return;
      }

      // 加密凭证
      const encryptedCredential = encrypt(sshCredential);

      const id = ServerModel.create({
        name,
        ip,
        ssh_port: sshPort || 22,
        ssh_user: sshUser,
        ssh_auth_type: sshAuthType || 'password',
        ssh_credential: encryptedCredential,
        group_id: groupId,
        tags: tags ? JSON.stringify(tags) : null,
        notes
      });

      const server = ServerModel.findById(id);
      success(res, { ...server, ssh_credential: undefined }, '添加成功');
    } catch (err) {
      console.error('Create server error:', err);
      error(res, ErrorCodes.SERVER_ERROR, '添加服务器失败');
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, ip, sshPort, sshUser, sshAuthType, sshCredential, groupId, tags, notes } = req.body;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      // 如果修改了IP，检查是否冲突
      if (ip && ip !== server.ip) {
        const existing = ServerModel.findByIp(ip);
        if (existing) {
          error(res, ErrorCodes.CONFLICT, 'IP地址已存在');
          return;
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (ip) updateData.ip = ip;
      if (sshPort) updateData.ssh_port = sshPort;
      if (sshUser) updateData.ssh_user = sshUser;
      if (sshAuthType) updateData.ssh_auth_type = sshAuthType;
      if (sshCredential) updateData.ssh_credential = encrypt(sshCredential);
      if (groupId !== undefined) updateData.group_id = groupId;
      if (tags) updateData.tags = JSON.stringify(tags);
      if (notes !== undefined) updateData.notes = notes;

      ServerModel.update(Number(id), updateData);

      const updated = ServerModel.findById(Number(id));
      success(res, { ...updated, ssh_credential: undefined }, '更新成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '更新服务器失败');
    }
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      ServerModel.delete(Number(id));
      success(res, null, '删除成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '删除服务器失败');
    }
  }

  static async batchDelete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        error(res, ErrorCodes.INVALID_PARAM, '请提供要删除的服务器ID列表');
        return;
      }

      ServerModel.batchDelete(ids);
      success(res, null, '批量删除成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '批量删除失败');
    }
  }

  static async scan(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { subnet, ports = [22], timeout = 3000 } = req.body;

      if (!subnet) {
        error(res, ErrorCodes.INVALID_PARAM, '请提供要扫描的网段');
        return;
      }

      const results = await scannerService.scanSubnet(subnet, ports, timeout);

      success(res, {
        found: results,
        scanned: results.length > 0 ? 'completed' : 'no results'
      });
    } catch (err) {
      console.error('Scan error:', err);
      error(res, ErrorCodes.SERVER_ERROR, (err as Error).message);
    }
  }

  static async test(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      // 简单的ping和ssh测试
      const { decrypt } = require('../utils/crypto');
      const result = await scannerService.testConnection(
        server.ip,
        server.ssh_port,
        server.ssh_user,
        decrypt(server.ssh_credential)
      );

      success(res, result);
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '测试连接失败');
    }
  }

  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const metrics = MetricsModel.getLatest(server.id);

      if (!metrics) {
        success(res, { serverId: server.id, status: 'no_data' });
        return;
      }

      success(res, {
        serverId: server.id,
        timestamp: metrics.timestamp,
        cpu: {
          usage: metrics.cpu_usage,
          cores: metrics.cpu_cores,
          loadAvg: [metrics.load_avg_1, metrics.load_avg_5, metrics.load_avg_15]
        },
        memory: {
          usage: metrics.memory_usage,
          total: metrics.memory_total,
          used: metrics.memory_used,
          available: metrics.memory_available
        },
        disk: metrics.disk_usage ? JSON.parse(metrics.disk_usage) : [],
        gpu: metrics.gpu_usage ? JSON.parse(metrics.gpu_usage) : [],
        topProcesses: metrics.top_processes ? JSON.parse(metrics.top_processes) : [],
        network: metrics.network_io ? JSON.parse(metrics.network_io) : {},
        connection: {
          ping: metrics.ping_latency !== null,
          pingLatency: metrics.ping_latency,
          ssh: metrics.ssh_status === 1
        }
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取状态失败');
    }
  }

  static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { hours = 24 } = req.query;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const metrics = MetricsModel.getHistory(server.id, Number(hours));

      success(res, {
        serverId: server.id,
        metrics: metrics.map(m => ({
          timestamp: m.timestamp,
          cpu: m.cpu_usage,
          memory: m.memory_usage,
          disk: m.disk_usage ? JSON.parse(m.disk_usage)[0]?.percent : 0,
          network: m.network_io ? JSON.parse(m.network_io) : {}
        }))
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取历史数据失败');
    }
  }

  static async reboot(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { delay = 0, force = false } = req.body;

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const command = force
        ? `sudo reboot -f ${delay > 0 ? `+${Math.ceil(delay / 60)}` : 'now'}`
        : `sudo shutdown -r ${delay > 0 ? `+${Math.ceil(delay / 60)}` : 'now'}`;

      await sshService.executeCommand(server.id, command, 10000);

      success(res, null, '重启命令已发送');
    } catch (err) {
      error(res, ErrorCodes.SSH_ERROR, '发送重启命令失败: ' + (err as Error).message);
    }
  }

  static async executeCommand(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { command, timeout = 30000 } = req.body;

      if (!command) {
        error(res, ErrorCodes.INVALID_PARAM, '命令不能为空');
        return;
      }

      const server = ServerModel.findById(Number(id));
      if (!server) {
        error(res, ErrorCodes.NOT_FOUND, '服务器不存在');
        return;
      }

      const result = await sshService.executeCommand(server.id, command, timeout);

      success(res, result);
    } catch (err) {
      error(res, ErrorCodes.COMMAND_ERROR, '命令执行失败: ' + (err as Error).message);
    }
  }

  static async getGroups(req: Request, res: Response): Promise<void> {
    try {
      const groups = GroupModel.findAll();
      success(res, groups);
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取分组列表失败');
    }
  }

  static async createGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, color, description } = req.body;

      if (!name) {
        error(res, ErrorCodes.INVALID_PARAM, '分组名称不能为空');
        return;
      }

      const id = GroupModel.create({ name, color, description });
      const group = GroupModel.findById(id);

      success(res, group, '创建成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '创建分组失败');
    }
  }

  static async updateGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, color, description } = req.body;

      const group = GroupModel.findById(Number(id));
      if (!group) {
        error(res, ErrorCodes.NOT_FOUND, '分组不存在');
        return;
      }

      GroupModel.update(Number(id), { name, color, description });

      success(res, GroupModel.findById(Number(id)), '更新成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '更新分组失败');
    }
  }

  static async deleteGroup(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const group = GroupModel.findById(Number(id));
      if (!group) {
        error(res, ErrorCodes.NOT_FOUND, '分组不存在');
        return;
      }

      GroupModel.delete(Number(id));
      success(res, null, '删除成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '删除分组失败');
    }
  }

  static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const counts = ServerModel.getStatusCounts();
      const groups = GroupModel.findAll();

      success(res, {
        total: counts.online + counts.offline + counts.warning + counts.error,
        ...counts,
        groups: groups.map(g => ({
          id: g.id,
          name: g.name,
          color: g.color,
          count: g.server_count
        }))
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取概览失败');
    }
  }
}
