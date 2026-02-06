import db from '../database';

export interface Metrics {
  id: number;
  server_id: number;
  cpu_usage?: number;
  cpu_cores?: number;
  load_avg_1?: number;
  load_avg_5?: number;
  load_avg_15?: number;
  memory_usage?: number;
  memory_total?: number;
  memory_used?: number;
  memory_available?: number;
  swap_usage?: number;
  disk_usage?: string;
  gpu_count?: number;
  gpu_usage?: string;
  network_io?: string;
  top_processes?: string;
  ping_latency?: number | null;
  ssh_status?: number;
  timestamp: string;
}

export class MetricsModel {
  static insert(metrics: Partial<Metrics>): number {
    const result = db.prepare(`
      INSERT INTO metrics (
        server_id, cpu_usage, cpu_cores, load_avg_1, load_avg_5, load_avg_15,
        memory_usage, memory_total, memory_used, memory_available, swap_usage,
        disk_usage, gpu_count, gpu_usage, network_io, top_processes,
        ping_latency, ssh_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.server_id,
      metrics.cpu_usage,
      metrics.cpu_cores,
      metrics.load_avg_1,
      metrics.load_avg_5,
      metrics.load_avg_15,
      metrics.memory_usage,
      metrics.memory_total,
      metrics.memory_used,
      metrics.memory_available,
      metrics.swap_usage,
      metrics.disk_usage,
      metrics.gpu_count,
      metrics.gpu_usage,
      metrics.network_io,
      metrics.top_processes,
      metrics.ping_latency,
      metrics.ssh_status
    );
    return result.lastInsertRowid as number;
  }

  static getLatest(serverId: number): Metrics | undefined {
    return db.prepare(`
      SELECT * FROM metrics
      WHERE server_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(serverId) as Metrics | undefined;
  }

  static getHistory(serverId: number, hours: number = 24): Metrics[] {
    return db.prepare(`
      SELECT * FROM metrics
      WHERE server_id = ? AND timestamp >= datetime('now', '-' || ? || ' hours')
      ORDER BY timestamp ASC
    `).all(serverId, hours) as Metrics[];
  }

  static getHistoryByTimeRange(serverId: number, start: string, end: string): Metrics[] {
    return db.prepare(`
      SELECT * FROM metrics
      WHERE server_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(serverId, start, end) as Metrics[];
  }

  static cleanOld(days: number): void {
    db.prepare(`
      DELETE FROM metrics WHERE timestamp < datetime('now', '-' || ? || ' days')
    `).run(days);
  }

  static getLatestForAllServers(): Map<number, Metrics> {
    const results = db.prepare(`
      SELECT m.* FROM metrics m
      INNER JOIN (
        SELECT server_id, MAX(timestamp) as max_ts
        FROM metrics
        GROUP BY server_id
      ) latest ON m.server_id = latest.server_id AND m.timestamp = latest.max_ts
    `).all() as Metrics[];

    const map = new Map<number, Metrics>();
    for (const m of results) {
      map.set(m.server_id, m);
    }
    return map;
  }
}
