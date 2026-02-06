import { Request, Response } from 'express';
import { ServerModel } from '../models/server.model';
import { MetricsModel } from '../models/metrics.model';
import { success, error, ErrorCodes } from '../utils/response';
import { monitorService } from '../services/monitor.service';

/**
 * Agent 上报的数据格式（与 Python agent 发送的格式一致）
 */
interface AgentReportData {
  agent_id: string;
  timestamp: number;
  system: {
    hostname: string;
    os_name?: string;
    platform?: string;
    platform_release?: string;
    platform_version?: string;
    architecture?: string;
    processor?: string;
    python_version?: string;
  };
  cpu: {
    usage: number;
    cores_physical: number;
    cores_logical: number;
    load_avg: number[];
    per_cpu?: number[];
    frequency?: {
      current: number;
      min: number;
      max: number;
    };
    times?: {
      user: number;
      system: number;
      idle: number;
      iowait: number;
    };
  };
  memory: {
    total: number;
    available: number;
    used: number;
    free: number;
    percent: number;  // Agent 使用 percent 而不是 usage
    buffers?: number;
    cached?: number;
    swap?: {
      total: number;
      used: number;
      free: number;
      percent: number;
    };
  };
  disk: Array<{
    device: string;
    mount: string;
    fstype: string;
    total: number;
    used: number;
    free: number;
    percent: number;
  }>;
  gpu?: Array<{
    index: number;
    name: string;
    usage: number;
    memory_used: number;
    memory_total: number;
    temperature: number;
  }> | null;
  network?: {
    rx_bytes: number;
    tx_bytes: number;
    rx_rate: number;
    tx_rate: number;
  } | null;
  process: Array<{
    pid: number;
    name: string;
    user: string;
    cpu: number;
    memory: number;
  }>;
}

export class AgentController {
  /**
   * 接收 Agent 上报的监控数据
   */
  static async report(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body as AgentReportData;

      if (!data.agent_id) {
        error(res, ErrorCodes.INVALID_PARAM, 'agent_id 不能为空');
        return;
      }

      // 通过 agent_id 或 hostname 或 IP 查找服务器
      const hostname = data.system?.hostname;
      const servers = ServerModel.findAll();

      let server = servers.find(s =>
        s.hostname === hostname ||
        s.name === hostname ||
        s.ip === hostname ||
        s.name?.toLowerCase() === hostname?.toLowerCase()
      );

      // 如果找不到，尝试通过 agent_id 的前缀匹配
      if (!server && data.agent_id) {
        const agentHostname = data.agent_id.split('-')[0];
        server = servers.find(s =>
          s.hostname === agentHostname ||
          s.name === agentHostname ||
          s.name?.toLowerCase() === agentHostname?.toLowerCase()
        );
      }

      if (!server) {
        // 只在找不到服务器时输出日志
        console.warn('Agent report: server not found for', hostname || data.agent_id);
        error(res, ErrorCodes.NOT_FOUND, `未找到匹配的服务器: ${hostname || data.agent_id}`);
        return;
      }

      // 标记为 Agent 模式，跳过 SSH 监控
      monitorService.markAsAgentServer(server.id);

      // 提取数据（适配 Agent 的数据格式）
      const cpuUsage = data.cpu?.usage || 0;
      const memoryUsage = data.memory?.percent || 0;  // Agent 使用 percent
      const cpuCores = data.cpu?.cores_logical || data.cpu?.cores_physical || 0;
      const loadAvg = data.cpu?.load_avg || [0, 0, 0];

      // 更新服务器状态
      const newStatus = cpuUsage > 80 || memoryUsage > 80 ? 'warning' : 'online';
      ServerModel.updateStatus(
        server.id,
        newStatus,
        data.system?.os_name,
        data.system?.hostname
      );

      // 转换磁盘数据格式
      const diskData = (data.disk || []).map(d => ({
        mount: d.mount,
        total: d.total,
        used: d.used,
        percent: d.percent
      }));

      // 转换 GPU 数据格式
      const gpuData = (data.gpu || []).map(g => ({
        index: g.index,
        name: g.name,
        usage: g.usage,
        memoryUsed: g.memory_used,
        memoryTotal: g.memory_total,
        temperature: g.temperature
      }));

      // 转换网络数据格式
      const networkData = data.network ? {
        rxBytes: data.network.rx_bytes || 0,
        txBytes: data.network.tx_bytes || 0,
        rxRate: data.network.rx_rate || 0,
        txRate: data.network.tx_rate || 0
      } : { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 };

      // 保存指标数据
      const metrics = {
        server_id: server.id,
        cpu_usage: cpuUsage,
        cpu_cores: cpuCores,
        load_avg_1: loadAvg[0] || 0,
        load_avg_5: loadAvg[1] || 0,
        load_avg_15: loadAvg[2] || 0,
        memory_usage: memoryUsage,
        memory_total: data.memory?.total || 0,
        memory_used: data.memory?.used || 0,
        memory_available: data.memory?.available || 0,
        disk_usage: JSON.stringify(diskData),
        gpu_count: gpuData.length,
        gpu_usage: JSON.stringify(gpuData),
        network_io: JSON.stringify(networkData),
        top_processes: JSON.stringify(data.process || []),
        ping_latency: null,
        ssh_status: 1
      };

      MetricsModel.insert(metrics);

      // 通过 WebSocket 广播状态更新
      const statusUpdate = {
        serverId: server.id,
        cpu: {
          usage: cpuUsage,
          cores: cpuCores,
          loadAvg: loadAvg
        },
        memory: {
          usage: memoryUsage,
          total: data.memory?.total || 0,
          used: data.memory?.used || 0,
          available: data.memory?.available || 0
        },
        disk: diskData,
        gpu: gpuData,
        network: networkData,
        topProcesses: data.process || [],
        connection: {
          ping: true,
          pingLatency: null,
          ssh: true
        },
        osInfo: data.system?.os_name,
        hostname: data.system?.hostname,
        timestamp: new Date().toISOString()
      };

      monitorService.emit('status_update', statusUpdate);

      success(res, { received: true, server_id: server.id }, '数据上报成功');
    } catch (err) {
      console.error('Agent report error:', err);
      error(res, ErrorCodes.SERVER_ERROR, '处理上报数据失败: ' + (err as Error).message);
    }
  }

  /**
   * Agent 注册接口
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { agent_id, hostname, ip } = req.body;

      if (!agent_id || !hostname) {
        error(res, ErrorCodes.INVALID_PARAM, 'agent_id 和 hostname 不能为空');
        return;
      }

      // 检查是否已存在
      const existing = ServerModel.findAll().find(s =>
        s.hostname === hostname || s.ip === ip || s.name === hostname
      );

      if (existing) {
        success(res, { server_id: existing.id, status: 'exists' }, '服务器已存在');
        return;
      }

      // 自动创建服务器记录
      const serverId = ServerModel.create({
        name: hostname,
        ip: ip || '0.0.0.0',
        ssh_port: 22,
        ssh_user: 'agent',
        ssh_auth_type: 'password',
        ssh_credential: '',
        hostname: hostname
      });

      success(res, { server_id: serverId, status: 'created' }, '服务器注册成功');
    } catch (err) {
      console.error('Agent register error:', err);
      error(res, ErrorCodes.SERVER_ERROR, '注册失败');
    }
  }

  /**
   * 心跳接口
   */
  static async heartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { agent_id } = req.body;

      if (!agent_id) {
        error(res, ErrorCodes.INVALID_PARAM, 'agent_id 不能为空');
        return;
      }

      success(res, { timestamp: Date.now() }, 'pong');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '心跳失败');
    }
  }
}
