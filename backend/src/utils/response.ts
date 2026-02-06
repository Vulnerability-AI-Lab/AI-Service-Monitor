import { Response } from 'express';

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  error?: string;
}

export function success<T>(res: Response, data?: T, message: string = 'success'): Response {
  return res.json({
    code: 0,
    message,
    data
  });
}

export function error(res: Response, code: number, message: string, errorDetail?: string): Response {
  const statusCode = Math.floor(code / 100);
  return res.status(statusCode).json({
    code,
    message,
    error: errorDetail
  });
}

export function paginate<T>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number
): Response {
  return res.json({
    code: 0,
    message: 'success',
    data: {
      list,
      total,
      page,
      pageSize
    }
  });
}

// 错误码定义
export const ErrorCodes = {
  INVALID_PARAM: 40001,
  UNAUTHORIZED: 40101,
  FORBIDDEN: 40301,
  NOT_FOUND: 40401,
  CONFLICT: 40901,
  SERVER_ERROR: 50001,
  SSH_ERROR: 50201,
  COMMAND_ERROR: 50202
};
