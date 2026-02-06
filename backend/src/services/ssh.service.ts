import { Client, ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';
import { ServerModel } from '../models/server.model';
import { decrypt } from '../utils/crypto';

export interface SSHSession {
  id: string;
  serverId: number;
  client: Client;
  channel?: ClientChannel;
  cols: number;
  rows: number;
}

class SSHService extends EventEmitter {
  private sessions: Map<string, SSHSession> = new Map();

  async connect(serverId: number, cols: number = 80, rows: number = 24): Promise<string> {
    const server = ServerModel.findById(serverId);
    if (!server) {
      throw new Error('服务器不存在');
    }

    const sessionId = this.generateSessionId();
    const client = new Client();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('连接超时'));
      }, 15000);

      client.on('ready', () => {
        clearTimeout(timeout);
        client.shell({ cols, rows, term: 'xterm-256color' }, (err, channel) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SSHSession = {
            id: sessionId,
            serverId,
            client,
            channel,
            cols,
            rows
          };

          this.sessions.set(sessionId, session);

          channel.on('data', (data: Buffer) => {
            this.emit('data', sessionId, data.toString('utf8'));
          });

          channel.on('close', () => {
            this.closeSession(sessionId);
          });

          channel.stderr.on('data', (data: Buffer) => {
            this.emit('data', sessionId, data.toString('utf8'));
          });

          resolve(sessionId);
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        this.emit('error', sessionId, err.message);
        reject(err);
      });

      client.on('close', () => {
        this.closeSession(sessionId);
      });

      const connectConfig: any = {
        host: server.ip,
        port: server.ssh_port,
        username: server.ssh_user,
        readyTimeout: 10000,
        keepaliveInterval: 30000
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

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session?.channel) {
      session.channel.write(data);
      return true;
    }
    return false;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (session?.channel) {
      session.channel.setWindow(rows, cols, 0, 0);
      session.cols = cols;
      session.rows = rows;
      return true;
    }
    return false;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.channel?.close();
        session.client.end();
      } catch (e) {
        // ignore
      }
      this.sessions.delete(sessionId);
      this.emit('close', sessionId);
    }
  }

  getSession(sessionId: string): SSHSession | undefined {
    return this.sessions.get(sessionId);
  }

  async executeCommand(serverId: number, command: string, timeout: number = 30000): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const server = ServerModel.findById(serverId);
    if (!server) {
      throw new Error('服务器不存在');
    }

    const client = new Client();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        client.end();
        reject(new Error('命令执行超时'));
      }, timeout);

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            client.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let exitCode = 0;

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on('close', (code: number) => {
            clearTimeout(timeoutId);
            exitCode = code || 0;
            client.end();
            resolve({ stdout, stderr, exitCode });
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      const connectConfig: any = {
        host: server.ip,
        port: server.ssh_port,
        username: server.ssh_user,
        readyTimeout: 10000
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

  private generateSessionId(): string {
    return `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const sshService = new SSHService();
