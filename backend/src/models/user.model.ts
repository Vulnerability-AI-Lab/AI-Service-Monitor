import db from '../database';

export interface User {
  id: number;
  username: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
  email?: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

export class UserModel {
  static findByUsername(username: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  }

  static findById(id: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  }

  static findAll(): User[] {
    return db.prepare('SELECT id, username, role, email, last_login, created_at FROM users').all() as User[];
  }

  static create(user: Partial<User>): number {
    const result = db.prepare(`
      INSERT INTO users (username, password, role, email)
      VALUES (?, ?, ?, ?)
    `).run(user.username, user.password, user.role || 'viewer', user.email || null);
    return result.lastInsertRowid as number;
  }

  static updateLastLogin(id: number): void {
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  static updatePassword(id: number, password: string): void {
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(password, id);
  }

  static delete(id: number): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
}
