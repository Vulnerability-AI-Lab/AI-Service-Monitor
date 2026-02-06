import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { success, error, ErrorCodes } from '../utils/response';
import config from '../config';
import { AuthRequest } from '../middleware/auth.middleware';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        error(res, ErrorCodes.INVALID_PARAM, '用户名和密码不能为空');
        return;
      }

      const user = UserModel.findByUsername(username);
      if (!user) {
        error(res, ErrorCodes.UNAUTHORIZED, '用户名或密码错误');
        return;
      }

      const isValid = bcrypt.compareSync(password, user.password);
      if (!isValid) {
        error(res, ErrorCodes.UNAUTHORIZED, '用户名或密码错误');
        return;
      }

      // 更新最后登录时间
      UserModel.updateLastLogin(user.id);

      // 生成JWT
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      success(res, {
        token,
        expiresIn: config.jwt.expiresIn,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      error(res, ErrorCodes.SERVER_ERROR, '登录失败');
    }
  }

  static async refresh(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = UserModel.findById(req.userId!);
      if (!user) {
        error(res, ErrorCodes.UNAUTHORIZED, '用户不存在');
        return;
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      success(res, {
        token,
        expiresIn: config.jwt.expiresIn
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '刷新令牌失败');
    }
  }

  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        error(res, ErrorCodes.INVALID_PARAM, '旧密码和新密码不能为空');
        return;
      }

      if (newPassword.length < 6) {
        error(res, ErrorCodes.INVALID_PARAM, '新密码长度不能少于6位');
        return;
      }

      const user = UserModel.findById(req.userId!);
      if (!user) {
        error(res, ErrorCodes.NOT_FOUND, '用户不存在');
        return;
      }

      const isValid = bcrypt.compareSync(oldPassword, user.password);
      if (!isValid) {
        error(res, ErrorCodes.UNAUTHORIZED, '旧密码错误');
        return;
      }

      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      UserModel.updatePassword(user.id, hashedPassword);

      success(res, null, '密码修改成功');
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '修改密码失败');
    }
  }

  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = UserModel.findById(req.userId!);
      if (!user) {
        error(res, ErrorCodes.NOT_FOUND, '用户不存在');
        return;
      }

      success(res, {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        lastLogin: user.last_login
      });
    } catch (err) {
      error(res, ErrorCodes.SERVER_ERROR, '获取用户信息失败');
    }
  }
}
