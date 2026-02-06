import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

export interface ScanResult {
  ip: string;
  hostname?: string;
  sshAvailable: boolean;
  latency?: number;
}

class ScannerService {
  async scanSubnet(
    subnet: string,
    ports: number[] = [22],
    timeout: number = 3000
  ): Promise<ScanResult[]> {
    // 解析CIDR
    const [baseIp, maskStr] = subnet.split('/');
    const mask = parseInt(maskStr) || 24;

    if (mask < 16 || mask > 30) {
      throw new Error('子网掩码必须在16-30之间');
    }

    const ips = this.generateIpRange(baseIp, mask);
    const results: ScanResult[] = [];

    // 并行扫描，限制并发数
    const batchSize = 50;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ip => this.scanHost(ip, ports, timeout))
      );
      results.push(...batchResults.filter(r => r !== null) as ScanResult[]);
    }

    return results;
  }

  private async scanHost(
    ip: string,
    ports: number[],
    timeout: number
  ): Promise<ScanResult | null> {
    // 先Ping检测
    const pingResult = await this.ping(ip, timeout);
    if (!pingResult.success) {
      return null;
    }

    // 检测SSH端口
    let sshAvailable = false;
    for (const port of ports) {
      if (await this.checkPort(ip, port, timeout)) {
        sshAvailable = true;
        break;
      }
    }

    // 尝试获取主机名
    let hostname: string | undefined;
    try {
      hostname = await this.resolveHostname(ip);
    } catch {
      // 忽略
    }

    return {
      ip,
      hostname,
      sshAvailable,
      latency: pingResult.latency
    };
  }

  private async ping(ip: string, timeout: number): Promise<{ success: boolean; latency?: number }> {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `ping -n 1 -w ${timeout} ${ip}`
        : `ping -c 1 -W ${Math.ceil(timeout / 1000)} ${ip}`;

      const { stdout } = await execAsync(cmd, { timeout: timeout + 1000 });

      let latencyMatch;
      if (isWindows) {
        latencyMatch = stdout.match(/[=<](\d+)ms/);
      } else {
        latencyMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i);
      }

      return {
        success: true,
        latency: latencyMatch ? parseFloat(latencyMatch[1]) : undefined
      };
    } catch {
      return { success: false };
    }
  }

  private checkPort(ip: string, port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, ip);
    });
  }

  private async resolveHostname(ip: string): Promise<string | undefined> {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `nslookup ${ip}`
        : `host ${ip}`;

      const { stdout } = await execAsync(cmd, { timeout: 5000 });

      if (isWindows) {
        const match = stdout.match(/名称:\s+(\S+)/);
        return match ? match[1] : undefined;
      } else {
        const match = stdout.match(/pointer\s+(\S+)/);
        return match ? match[1].replace(/\.$/, '') : undefined;
      }
    } catch {
      return undefined;
    }
  }

  private generateIpRange(baseIp: string, mask: number): string[] {
    const parts = baseIp.split('.').map(Number);
    const baseNum = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];

    const hostBits = 32 - mask;
    const numHosts = Math.pow(2, hostBits);

    // 网络地址
    const networkAddr = baseNum & (0xFFFFFFFF << hostBits);

    const ips: string[] = [];
    // 跳过网络地址和广播地址
    for (let i = 1; i < numHosts - 1; i++) {
      const ipNum = networkAddr + i;
      const ip = [
        (ipNum >> 24) & 0xFF,
        (ipNum >> 16) & 0xFF,
        (ipNum >> 8) & 0xFF,
        ipNum & 0xFF
      ].join('.');
      ips.push(ip);
    }

    return ips;
  }

  async testConnection(ip: string, port: number, username: string, password: string): Promise<{
    ping: { success: boolean; latency?: number };
    ssh: { success: boolean; message?: string };
  }> {
    const pingResult = await this.ping(ip, 3000);

    let sshResult = { success: false, message: '未测试' };

    if (pingResult.success) {
      const { Client } = require('ssh2');
      const client = new Client();

      sshResult = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          client.end();
          resolve({ success: false, message: '连接超时' });
        }, 10000);

        client.on('ready', () => {
          clearTimeout(timeout);
          client.end();
          resolve({ success: true, message: '连接成功' });
        });

        client.on('error', (err: Error) => {
          clearTimeout(timeout);
          resolve({ success: false, message: err.message });
        });

        client.connect({
          host: ip,
          port,
          username,
          password,
          readyTimeout: 10000
        });
      });
    }

    return { ping: pingResult, ssh: sshResult };
  }
}

export const scannerService = new ScannerService();
