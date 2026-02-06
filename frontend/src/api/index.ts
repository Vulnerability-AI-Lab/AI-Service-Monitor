import axios, { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  response => response.data,
  (error: AxiosError<any>) => {
    if (error.response) {
      const { status, data } = error.response

      if (status === 401) {
        localStorage.removeItem('token')
        router.push('/login')
        ElMessage.error('登录已过期，请重新登录')
      } else if (status === 403) {
        ElMessage.error('权限不足')
      } else {
        ElMessage.error(data?.message || '请求失败')
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接')
    }
    return Promise.reject(error)
  }
)

// 认证API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),

  refresh: () => api.post('/auth/refresh'),

  changePassword: (oldPassword: string, newPassword: string) =>
    api.put('/auth/password', { oldPassword, newPassword }),

  getProfile: () => api.get('/auth/profile')
}

// 服务器API
export const serverApi = {
  getOverview: () => api.get('/overview'),

  list: (params?: { page?: number; pageSize?: number; group?: number; status?: string; keyword?: string }) =>
    api.get('/servers', { params }),

  get: (id: number) => api.get(`/servers/${id}`),

  create: (data: any) => api.post('/servers', data),

  update: (id: number, data: any) => api.put(`/servers/${id}`, data),

  delete: (id: number) => api.delete(`/servers/${id}`),

  batchDelete: (ids: number[]) => api.delete('/servers/batch', { data: { ids } }),

  scan: (subnet: string, ports?: number[], timeout?: number) =>
    api.post('/servers/scan', { subnet, ports, timeout }),

  test: (id: number) => api.post(`/servers/${id}/test`),

  getStatus: (id: number) => api.get(`/servers/${id}/status`),

  getMetrics: (id: number, hours?: number) =>
    api.get(`/servers/${id}/metrics`, { params: { hours } }),

  reboot: (id: number, delay?: number, force?: boolean) =>
    api.post(`/servers/${id}/reboot`, { delay, force }),

  executeCommand: (id: number, command: string, timeout?: number) =>
    api.post(`/servers/${id}/command`, { command, timeout })
}

// 文件API
export const fileApi = {
  listDirectory: (serverId: number, path: string) =>
    api.get(`/servers/${serverId}/files`, { params: { path } }),

  download: (serverId: number, path: string) =>
    api.get(`/servers/${serverId}/files/download`, {
      params: { path },
      responseType: 'blob'
    }),

  upload: (serverId: number, path: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return api.post(`/servers/${serverId}/files/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  delete: (serverId: number, path: string, recursive?: boolean) =>
    api.delete(`/servers/${serverId}/files`, { params: { path, recursive } }),

  createDirectory: (serverId: number, path: string) =>
    api.post(`/servers/${serverId}/files/mkdir`, { path }),

  rename: (serverId: number, oldPath: string, newPath: string) =>
    api.put(`/servers/${serverId}/files/rename`, { oldPath, newPath })
}

// 分组API
export const groupApi = {
  list: () => api.get('/groups'),

  create: (data: { name: string; color?: string; description?: string }) =>
    api.post('/groups', data),

  update: (id: number, data: { name?: string; color?: string; description?: string }) =>
    api.put(`/groups/${id}`, data),

  delete: (id: number) => api.delete(`/groups/${id}`)
}

export default api
