import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import config from '../config';
import { sshService } from '../services/ssh.service';
import { monitorService, ServerStatus } from '../services/monitor.service';

interface WSClient {
  ws: WebSocket;
  userId?: number;
  role?: string;
  authenticated: boolean;
  subscriptions: Set<string>;
  sshSessions: Set<string>;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WSClient> = new Map();

  start(port: number): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      const client: WSClient = {
        ws,
        authenticated: false,
        subscriptions: new Set(),
        sshSessions: new Set()
      };
      this.clients.set(ws, client);

      console.log('WebSocket client connected');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      ws.on('close', () => {
        // 关闭所有SSH会话
        for (const sessionId of client.sshSessions) {
          sshService.closeSession(sessionId);
        }
        this.clients.delete(ws);
        console.log('WebSocket client disconnected');
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });

      // 发送欢迎消息，提示认证
      this.send(ws, {
        type: 'welcome',
        payload: { message: '请发送认证令牌' }
      });
    });

    // 监听服务器状态更新
    monitorService.on('status_update', (status: ServerStatus) => {
      this.broadcastStatus(status);
    });

    // 监听SSH事件
    sshService.on('data', (sessionId: string, data: string) => {
      this.sendSSHData(sessionId, data);
    });

    sshService.on('close', (sessionId: string) => {
      this.sendSSHClose(sessionId);
    });

    sshService.on('error', (sessionId: string, message: string) => {
      this.sendSSHError(sessionId, message);
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  private handleMessage(client: WSClient, message: any): void {
    const { type, payload } = message;

    switch (type) {
      case 'auth':
        this.handleAuth(client, payload);
        break;
      case 'subscribe':
        this.handleSubscribe(client, payload);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, payload);
        break;
      case 'ssh_connect':
        this.handleSSHConnect(client, payload);
        break;
      case 'ssh_input':
        this.handleSSHInput(client, payload);
        break;
      case 'ssh_resize':
        this.handleSSHResize(client, payload);
        break;
      case 'ssh_close':
        this.handleSSHClose(client, payload);
        break;
      case 'ping':
        this.send(client.ws, { type: 'pong' });
        break;
      default:
        console.warn('Unknown message type:', type);
    }
  }

  private handleAuth(client: WSClient, payload: any): void {
    const { token } = payload;

    if (!token) {
      this.send(client.ws, {
        type: 'auth_error',
        payload: { message: '令牌不能为空' }
      });
      return;
    }

    try {
      const tokenStr = token.startsWith('Bearer ') ? token.substring(7) : token;
      const decoded = jwt.verify(tokenStr, config.jwt.secret) as { userId: number; role: string };

      client.userId = decoded.userId;
      client.role = decoded.role;
      client.authenticated = true;

      this.send(client.ws, {
        type: 'auth_success',
        payload: { userId: decoded.userId, role: decoded.role }
      });
    } catch (err) {
      this.send(client.ws, {
        type: 'auth_error',
        payload: { message: '认证失败' }
      });
    }
  }

  private handleSubscribe(client: WSClient, payload: any): void {
    if (!client.authenticated) {
      this.send(client.ws, {
        type: 'error',
        payload: { message: '请先认证' }
      });
      return;
    }

    const { channel, serverIds } = payload;
    if (channel === 'status') {
      if (Array.isArray(serverIds) && serverIds.length > 0) {
        serverIds.forEach((id: number) => client.subscriptions.add(`status:${id}`));
      } else {
        client.subscriptions.add('status:all');
      }
      this.send(client.ws, {
        type: 'subscribed',
        payload: { channel }
      });
    }
  }

  private handleUnsubscribe(client: WSClient, payload: any): void {
    const { channel, serverIds } = payload;
    if (channel === 'status') {
      if (Array.isArray(serverIds) && serverIds.length > 0) {
        serverIds.forEach((id: number) => client.subscriptions.delete(`status:${id}`));
      } else {
        client.subscriptions.delete('status:all');
      }
    }
  }

  private async handleSSHConnect(client: WSClient, payload: any): Promise<void> {
    if (!client.authenticated) {
      this.send(client.ws, {
        type: 'ssh_error',
        payload: { message: '请先认证' }
      });
      return;
    }

    if (client.role === 'viewer') {
      this.send(client.ws, {
        type: 'ssh_error',
        payload: { message: '权限不足' }
      });
      return;
    }

    const { serverId, cols = 80, rows = 24 } = payload;

    try {
      const sessionId = await sshService.connect(serverId, cols, rows);
      client.sshSessions.add(sessionId);

      this.send(client.ws, {
        type: 'ssh_connected',
        payload: { sessionId, serverId }
      });
    } catch (err) {
      this.send(client.ws, {
        type: 'ssh_error',
        payload: { message: (err as Error).message }
      });
    }
  }

  private handleSSHInput(client: WSClient, payload: any): void {
    const { sessionId, data } = payload;
    if (client.sshSessions.has(sessionId)) {
      sshService.write(sessionId, data);
    }
  }

  private handleSSHResize(client: WSClient, payload: any): void {
    const { sessionId, cols, rows } = payload;
    if (client.sshSessions.has(sessionId)) {
      sshService.resize(sessionId, cols, rows);
    }
  }

  private handleSSHClose(client: WSClient, payload: any): void {
    const { sessionId } = payload;
    if (client.sshSessions.has(sessionId)) {
      sshService.closeSession(sessionId);
      client.sshSessions.delete(sessionId);
    }
  }

  private broadcastStatus(status: ServerStatus): void {
    for (const [ws, client] of this.clients) {
      if (!client.authenticated) continue;

      const subscribedToAll = client.subscriptions.has('status:all');
      const subscribedToServer = client.subscriptions.has(`status:${status.serverId}`);

      if (subscribedToAll || subscribedToServer) {
        this.send(ws, {
          type: 'status_update',
          payload: status
        });
      }
    }
  }

  private sendSSHData(sessionId: string, data: string): void {
    for (const [ws, client] of this.clients) {
      if (client.sshSessions.has(sessionId)) {
        this.send(ws, {
          type: 'ssh_output',
          payload: { sessionId, data }
        });
        break;
      }
    }
  }

  private sendSSHClose(sessionId: string): void {
    for (const [ws, client] of this.clients) {
      if (client.sshSessions.has(sessionId)) {
        client.sshSessions.delete(sessionId);
        this.send(ws, {
          type: 'ssh_close',
          payload: { sessionId }
        });
        break;
      }
    }
  }

  private sendSSHError(sessionId: string, message: string): void {
    for (const [ws, client] of this.clients) {
      if (client.sshSessions.has(sessionId)) {
        this.send(ws, {
          type: 'ssh_error',
          payload: { sessionId, message }
        });
        break;
      }
    }
  }

  private send(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export const wsManager = new WebSocketManager();
