import db from '../database';

export interface Group {
  id: number;
  name: string;
  color: string;
  description?: string;
  sort_order: number;
  created_at: string;
}

export interface GroupWithCount extends Group {
  server_count: number;
}

export class GroupModel {
  static findAll(): GroupWithCount[] {
    return db.prepare(`
      SELECT g.*, COUNT(s.id) as server_count
      FROM groups g
      LEFT JOIN servers s ON g.id = s.group_id
      GROUP BY g.id
      ORDER BY g.sort_order, g.id
    `).all() as GroupWithCount[];
  }

  static findById(id: number): Group | undefined {
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Group | undefined;
  }

  static create(group: Partial<Group>): number {
    const result = db.prepare(`
      INSERT INTO groups (name, color, description, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(
      group.name,
      group.color || '#409EFF',
      group.description || null,
      group.sort_order || 0
    );
    return result.lastInsertRowid as number;
  }

  static update(id: number, group: Partial<Group>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (group.name !== undefined) { fields.push('name = ?'); values.push(group.name); }
    if (group.color !== undefined) { fields.push('color = ?'); values.push(group.color); }
    if (group.description !== undefined) { fields.push('description = ?'); values.push(group.description); }
    if (group.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(group.sort_order); }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  static delete(id: number): void {
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }
}
