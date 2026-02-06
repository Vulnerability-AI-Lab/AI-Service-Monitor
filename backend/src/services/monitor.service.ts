import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'ssh2';
import { ServerModel, Server } from '../models/server.model';
import { MetricsModel, Metrics } from '../models/metrics.model';
import { decrypt } from '../utils/crypto';
import config from '../config';

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
  network: {
    rxBytes: number;
    txBytes: number;
    rxRate: number;
    txRate: number;
  };
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
  osInfo?: string;
  hostname?: string;
  uptime?: number;
  timestamp: string;
}

class MonitorService extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private lastNetworkStats: Map<number, { rx: number; tx: number; time: number }> = new Map();
  // 记录使用 Agent 模式的服务器及其最后上报时间
  private agentServers: Map<number, number> = new Map();

  /**
   * 标记服务器为 Agent 模式（由 AgentController 调用）
   */
  markAsAgentServer(serverId: number): void {
    this.agentServers.set(serverId, Date.now());
  }

  /**
   * 检查服务器是否使用 Agent 模式（60秒内有上报）
   */
  isAgentServer(serverId: number): boolean {
    const lastReport = this.agentServers.get(serverId);
    if (!lastReport) return false;
    // 如果 60 秒内有 Agent 上报，认为是 Agent 模式（增加容错时间）
    return Date.now() - lastReport < 60000;
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.collectAllServers();
    }, config.monitor.interval);

    // 立即执行一次
    this.collectAllServers();
    console.log('Monitor service started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log('Monitor service stopped');
  }

  async collectAllServers(): Promise<void> {
    const servers = ServerModel.findAll();

    const promises = servers.map(server =>
      this.collectServerStatus(server).catch(err => {
        console.error(`Failed to collect status for server ${server.id}:`, err.message);
        return null;
      })
    );

    const results = await Promise.all(promises);

    for (const status of results) {
      if (status) {
        // 保存到数据库
        this.saveMetrics(status);
        // 发送实时更新
        this.emit('status_update', status);
      }
    }
  }

  async collectServerStatus(server: Server): Promise<ServerStatus | null> {
    // 如果服务器使用 Agent 模式，跳过 SSH 监控
    if (this.isAgentServer(server.id)) {
      // Agent 模式的服务器由 Agent 上报数据，这里不做处理
      return null;
    }

    const status: ServerStatus = {
      serverId: server.id,
      cpu: { usage: 0, cores: 0, loadAvg: [0, 0, 0] },
      memory: { usage: 0, total: 0, used: 0, available: 0 },
      disk: [],
      gpu: [],
      network: { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 },
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

    if (!status.connection.ping) {
      ServerModel.updateStatus(server.id, 'error');
      return status;
    }

    // 2. SSH获取详细信息
    try {
      const sshData = await this.collectViaSSH(server);
      Object.assign(status, sshData);
      status.connection.ssh = true;

      // 计算网络速率
      this.calculateNetworkRate(server.id, status);

      // 更新服务器状态
      const newStatus = status.cpu.usage > 80 || status.memory.usage > 80 ? 'warning' : 'online';
      ServerModel.updateStatus(server.id, newStatus, status.osInfo, status.hostname);
    } catch (err) {
      console.error(`SSH collection failed for ${server.ip}:`, (err as Error).message);
      status.connection.ssh = false;
      ServerModel.updateStatus(server.id, 'error');
    }

    return status;
  }

  private async ping(ip: string): Promise<{ success: boolean; latency: number | null }> {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `ping -n 1 -w 3000 ${ip}`
        : `ping -c 1 -W 3 ${ip}`;

      const { stdout } = await execAsync(cmd, { timeout: 5000 });

      // 解析延迟
      let latencyMatch;
      if (isWindows) {
        latencyMatch = stdout.match(/[=<](\d+)ms/);
      } else {
        latencyMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i);
      }

      const latency = latencyMatch ? parseFloat(latencyMatch[1]) : null;
      return { success: true, latency };
    } catch {
      return { success: false, latency: null };
    }
  }

  private collectViaSSH(server: Server): Promise<Partial<ServerStatus>> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const result: Partial<ServerStatus> = {};

      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 15000);

      client.on('ready', async () => {
        clearTimeout(timeout);
        try {
          // 使用分隔符将所有命令合并为一个，避免多个 exec 调用导致 MaxSessions 问题
          const delimiter = '___CMD_DELIMITER___';
          const commands = [
            // CPU信息
            `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%//'`,
            `nproc`,
            `cat /proc/loadavg | awk '{print $1,$2,$3}'`,
            // 内存信息
            `free -b | grep Mem | awk '{print $2,$3,$7}'`,
            // 磁盘信息
            `df -B1 | grep -E '^/dev' | awk '{print $6":"$2":"$3":"$5}' | head -10`,
            // GPU信息
            `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || echo "NO_GPU"`,
            // Top进程
            `ps aux --sort=-%cpu | head -6 | tail -5 | awk '{printf "%s:%s:%s:%.1f:%.1f\\n",$2,$11,$1,$3,$4}'`,
            // 系统信息
            `cat /etc/os-release 2>/dev/null | grep "PRETTY_NAME" | cut -d'"' -f2 || uname -s`,
            `hostname`,
            `cat /proc/uptime | awk '{print int($1)}'`,
            // 网络信息
            `cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2,$10}'`
          ];

          // 将所有命令合并，每个命令后输出分隔符，用分号连接
          const combinedCommand = commands.map(cmd => `(${cmd}); echo "${delimiter}"`).join('; ');

          // 只执行一次 exec
          console.log(`[SSH] Executing command on ${server.ip}...`);
          const output = await this.execCommand(client, combinedCommand);
          console.log(`[SSH] Command output length for ${server.ip}: ${output.length}`);
          const outputs = output.split(delimiter).map(s => s.trim());
          console.log(`[SSH] Parsed ${outputs.length} sections for ${server.ip}`);

          // 辅助函数：安全获取数组元素
          const safeGet = (arr: string[], index: number): string => arr[index] || '';

          // 解析CPU
          const loadAvgStr = safeGet(outputs, 2);
          const loadAvgParts = loadAvgStr ? loadAvgStr.split(' ').map(Number) : [0, 0, 0];
          result.cpu = {
            usage: parseFloat(safeGet(outputs, 0)) || 0,
            cores: parseInt(safeGet(outputs, 1)) || 1,
            loadAvg: [loadAvgParts[0] || 0, loadAvgParts[1] || 0, loadAvgParts[2] || 0] as [number, number, number]
          };

          // 解析内存
          const memStr = safeGet(outputs, 3);
          const memParts = memStr ? memStr.split(' ').map(Number) : [0, 0, 0];
          const memTotal = memParts[0] || 0;
          const memUsed = memParts[1] || 0;
          const memAvailable = memParts[2] || 0;
          result.memory = {
            total: memTotal,
            used: memUsed,
            available: memAvailable,
            usage: memTotal > 0 ? Math.round((memUsed / memTotal) * 100 * 10) / 10 : 0
          };

          // 解析磁盘
          const diskStr = safeGet(outputs, 4);
          result.disk = diskStr ? diskStr.split('\n').filter(Boolean).map(line => {
            const parts = line.split(':');
            return {
              mount: parts[0] || '/',
              total: parseInt(parts[1]) || 0,
              used: parseInt(parts[2]) || 0,
              percent: parseFloat(parts[3]) || 0
            };
          }) : [];

          // 解析GPU
          const gpuStr = safeGet(outputs, 5);
          if (gpuStr && gpuStr !== 'NO_GPU') {
            result.gpu = gpuStr.split('\n').filter(Boolean).map(line => {
              const parts = line.split(',').map(s => s.trim());
              return {
                index: parseInt(parts[0]) || 0,
                name: parts[1] || 'Unknown',
                usage: parseFloat(parts[2]) || 0,
                memoryUsed: parseInt(parts[3]) || 0,
                memoryTotal: parseInt(parts[4]) || 0,
                temperature: parseInt(parts[5]) || 0
              };
            });
          }

          // 解析进程
          const procStr = safeGet(outputs, 6);
          result.topProcesses = procStr ? procStr.split('\n').filter(Boolean).map(line => {
            const parts = line.split(':');
            return {
              pid: parseInt(parts[0]) || 0,
              name: parts[1] || 'unknown',
              user: parts[2] || 'unknown',
              cpu: parseFloat(parts[3]) || 0,
              memory: parseFloat(parts[4]) || 0
            };
          }) : [];

          // 系统信息
          result.osInfo = safeGet(outputs, 7);
          result.hostname = safeGet(outputs, 8);
          result.uptime = parseInt(safeGet(outputs, 9)) || 0;

          // 网络信息
          const netStr = safeGet(outputs, 10);
          const netParts = netStr ? netStr.split(' ').map(Number) : [0, 0];
          result.network = {
            rxBytes: netParts[0] || 0,
            txBytes: netParts[1] || 0,
            rxRate: 0,
            txRate: 0
          };

          client.end();
          resolve(result);
        } catch (err) {
          client.end();
          reject(err);
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`SSH error for ${server.ip}:`, err.message, 'level:', err.level, 'description:', (err as any).description);
        reject(err);
      });

      client.on('close', () => {
        console.log(`SSH connection closed for ${server.ip}`);
      });

      client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        // 处理键盘交互认证
        console.log(`SSH keyboard-interactive for ${server.ip}`);
        finish([decrypt(server.ssh_credential)]);
      });

      const connectConfig: any = {
        host: server.ip,
        port: server.ssh_port,
        username: server.ssh_user,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        // 尝试多种认证方式
        tryKeyboard: true
      };

      try {
        if (server.ssh_auth_type === 'password') {
          connectConfig.password = decrypt(server.ssh_credential);
        } else {
          connectConfig.privateKey = decrypt(server.ssh_credential);
        }
      } catch (e) {
        reject(new Error('解密凭证失败'));
        return;
      }

      client.connect(connectConfig);
    });
  }

  private execCommand(client: Client, cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const execTimeout = setTimeout(() => {
        reject(new Error('Command execution timeout'));
      }, 30000);

      client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(execTimeout);
          console.error('[SSH] exec error:', err.message);
          return reject(err);
        }

        let output = '';
        let stderr = '';
        stream.on('data', (data: Buffer) => output += data.toString());
        stream.stderr.on('data', (data: Buffer) => stderr += data.toString());
        stream.on('close', (code: number) => {
          clearTimeout(execTimeout);
          if (stderr) {
            console.log('[SSH] stderr:', stderr.substring(0, 200));
          }
          resolve(output);
        });
        stream.on('error', (err: Error) => {
          clearTimeout(execTimeout);
          console.error('[SSH] stream error:', err.message);
          reject(err);
        });
      });
    });
  }

  private calculateNetworkRate(serverId: number, status: ServerStatus): void {
    const now = Date.now();
    const last = this.lastNetworkStats.get(serverId);

    if (last && status.network) {
      const timeDiff = (now - last.time) / 1000; // 秒
      if (timeDiff > 0) {
        status.network.rxRate = Math.round((status.network.rxBytes - last.rx) / timeDiff);
        status.network.txRate = Math.round((status.network.txBytes - last.tx) / timeDiff);
      }
    }

    if (status.network) {
      this.lastNetworkStats.set(serverId, {
        rx: status.network.rxBytes,
        tx: status.network.txBytes,
        time: now
      });
    }
  }

  private saveMetrics(status: ServerStatus): void {
    const metrics: Partial<Metrics> = {
      server_id: status.serverId,
      cpu_usage: status.cpu.usage,
      cpu_cores: status.cpu.cores,
      load_avg_1: status.cpu.loadAvg[0],
      load_avg_5: status.cpu.loadAvg[1],
      load_avg_15: status.cpu.loadAvg[2],
      memory_usage: status.memory.usage,
      memory_total: status.memory.total,
      memory_used: status.memory.used,
      memory_available: status.memory.available,
      disk_usage: JSON.stringify(status.disk),
      gpu_count: status.gpu?.length || 0,
      gpu_usage: JSON.stringify(status.gpu || []),
      network_io: JSON.stringify(status.network),
      top_processes: JSON.stringify(status.topProcesses),
      ping_latency: status.connection.pingLatency,
      ssh_status: status.connection.ssh ? 1 : 0
    };

    MetricsModel.insert(metrics);
  }
}

export const monitorService = new MonitorService();
