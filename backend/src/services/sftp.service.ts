import { Client, SFTPWrapper } from 'ssh2';
import { ServerModel } from '../models/server.model';
import { decrypt } from '../utils/crypto';
import { Readable, Writable } from 'stream';

export interface FileInfo {
  name: string;
  type: 'file' | 'directory' | 'link';
  size: number;
  permissions: string;
  owner: number;
  group: number;
  modifiedAt: Date;
}

class SFTPService {
  async listDirectory(serverId: number, remotePath: string): Promise<FileInfo[]> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        client.end();
        if (err) {
          reject(err);
          return;
        }

        const files: FileInfo[] = list.map(item => ({
          name: item.filename,
          type: this.getFileType(item.attrs.mode),
          size: item.attrs.size,
          permissions: this.modeToPermissions(item.attrs.mode),
          owner: item.attrs.uid,
          group: item.attrs.gid,
          modifiedAt: new Date(item.attrs.mtime * 1000)
        }));

        // 排序：目录在前，文件在后，按名称排序
        files.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(files);
      });
    });
  }

  async downloadFile(serverId: number, remotePath: string): Promise<Buffer> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const readStream = sftp.createReadStream(remotePath);

      readStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      readStream.on('end', () => {
        client.end();
        resolve(Buffer.concat(chunks));
      });

      readStream.on('error', (err: Error) => {
        client.end();
        reject(err);
      });
    });
  }

  async uploadFile(serverId: number, remotePath: string, data: Buffer): Promise<void> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      const writeStream = sftp.createWriteStream(remotePath);

      writeStream.on('close', () => {
        client.end();
        resolve();
      });

      writeStream.on('error', (err: Error) => {
        client.end();
        reject(err);
      });

      writeStream.end(data);
    });
  }

  async deleteFile(serverId: number, remotePath: string): Promise<void> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteDirectory(serverId: number, remotePath: string): Promise<void> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async createDirectory(serverId: number, remotePath: string): Promise<void> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rename(serverId: number, oldPath: string, newPath: string): Promise<void> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async stat(serverId: number, remotePath: string): Promise<FileInfo> {
    const { sftp, client } = await this.connect(serverId);

    return new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        client.end();
        if (err) {
          reject(err);
          return;
        }

        resolve({
          name: remotePath.split('/').pop() || '',
          type: this.getFileType(stats.mode),
          size: stats.size,
          permissions: this.modeToPermissions(stats.mode),
          owner: stats.uid,
          group: stats.gid,
          modifiedAt: new Date(stats.mtime * 1000)
        });
      });
    });
  }

  private async connect(serverId: number): Promise<{ sftp: SFTPWrapper; client: Client }> {
    const server = ServerModel.findById(serverId);
    if (!server) {
      throw new Error('服务器不存在');
    }

    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          resolve({ sftp, client });
        });
      });

      client.on('error', reject);

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

  private getFileType(mode: number): 'file' | 'directory' | 'link' {
    const S_IFMT = 0o170000;
    const S_IFDIR = 0o040000;
    const S_IFLNK = 0o120000;

    const type = mode & S_IFMT;
    if (type === S_IFDIR) return 'directory';
    if (type === S_IFLNK) return 'link';
    return 'file';
  }

  private modeToPermissions(mode: number): string {
    const perms = mode & 0o777;
    const chars = ['r', 'w', 'x'];
    let result = '';

    // 文件类型
    const S_IFMT = 0o170000;
    const S_IFDIR = 0o040000;
    const S_IFLNK = 0o120000;
    const type = mode & S_IFMT;
    if (type === S_IFDIR) result = 'd';
    else if (type === S_IFLNK) result = 'l';
    else result = '-';

    // 权限位
    for (let i = 2; i >= 0; i--) {
      const shift = i * 3;
      for (let j = 0; j < 3; j++) {
        const bit = (perms >> (shift + (2 - j))) & 1;
        result += bit ? chars[j] : '-';
      }
    }

    return result;
  }
}

export const sftpService = new SFTPService();
