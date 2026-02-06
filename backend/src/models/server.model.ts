import db from '../database';

export interface Server {
  id: number;
  name: string;
  ip: string;
  ssh_port: number;
  ssh_user: string;
  ssh_auth_type: 'password' | 'key';
  ssh_credential: string;
  group_id?: number;
  status: 'online' | 'offline' | 'warning' | 'error';
  os_info?: string;
  hostname?: string;
  uptime?: number;
  last_seen?: string;
  tags?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerWithMetrics extends Server {
  group_name?: string;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
}

export class ServerModel {
  static findAll(): Server[] {
    return db.prepare(`
      SELECT s.*, g.name as group_name
      FROM servers s
      LEFT JOIN groups g ON s.group_id = g.id
      ORDER BY s.id
    `).all() as Server[];
  }

  static findById(id: number): Server | undefined {
    return db.prepare(`
      SELECT s.*, g.name as group_name
      FROM servers s
      LEFT JOIN groups g ON s.group_id = g.id
      WHERE s.id = ?
    `).get(id) as Server | undefined;
  }

  static findByIp(ip: string): Server | undefined {
    return db.prepare('SELECT * FROM servers WHERE ip = ?').get(ip) as Server | undefined;
  }

  static create(server: Partial<Server>): number {
    const result = db.prepare(`
      INSERT INTO servers (name, ip, ssh_port, ssh_user, ssh_auth_type, ssh_credential, group_id, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      server.name,
      server.ip,
      server.ssh_port || 22,
      server.ssh_user,
      server.ssh_auth_type || 'password',
      server.ssh_credential,
      server.group_id || null,
      server.tags || null,
      server.notes || null
    );
    return result.lastInsertRowid as number;
  }

  static update(id: number, server: Partial<Server>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (server.name !== undefined) { fields.push('name = ?'); values.push(server.name); }
    if (server.ip !== undefined) { fields.push('ip = ?'); values.push(server.ip); }
    if (server.ssh_port !== undefined) { fields.push('ssh_port = ?'); values.push(server.ssh_port); }
    if (server.ssh_user !== undefined) { fields.push('ssh_user = ?'); values.push(server.ssh_user); }
    if (server.ssh_auth_type !== undefined) { fields.push('ssh_auth_type = ?'); values.push(server.ssh_auth_type); }
    if (server.ssh_credential !== undefined) { fields.push('ssh_credential = ?'); values.push(server.ssh_credential); }
    if (server.group_id !== undefined) { fields.push('group_id = ?'); values.push(server.group_id); }
    if (server.tags !== undefined) { fields.push('tags = ?'); values.push(server.tags); }
    if (server.notes !== undefined) { fields.push('notes = ?'); values.push(server.notes); }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      db.prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  static updateStatus(id: number, status: Server['status'], osInfo?: string, hostname?: string): void {
    db.prepare(`
      UPDATE servers
      SET status = ?, os_info = COALESCE(?, os_info), hostname = COALESCE(?, hostname),
          last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, osInfo, hostname, id);
  }

  static delete(id: number): void {
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  }

  static batchDelete(ids: number[]): void {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM servers WHERE id IN (${placeholders})`).run(...ids);
  }

  static getStatusCounts(): { online: number; offline: number; warning: number; error: number } {
    const result = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM servers
    `).get() as any;
    return {
      online: result.online || 0,
      offline: result.offline || 0,
      warning: result.warning || 0,
      error: result.error || 0
    };
  }
}
