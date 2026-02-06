export interface User {
  id: number
  username: string
  role: 'admin' | 'operator' | 'viewer'
  email?: string
  lastLogin?: string
}

export interface Server {
  id: number
  name: string
  ip: string
  ssh_port: number
  ssh_user: string
  ssh_auth_type: 'password' | 'key'
  group_id?: number
  group_name?: string
  status: 'online' | 'offline' | 'warning' | 'error'
  os_info?: string
  hostname?: string
  uptime?: number
  last_seen?: string
  tags?: string[]
  notes?: string
  created_at: string
  updated_at: string
  metrics?: ServerMetrics
}

export interface ServerMetrics {
  cpuUsage?: number
  cpuCores?: number
  loadAvg?: number[]
  memoryUsage?: number
  memoryTotal?: number
  memoryUsed?: number
  memoryAvailable?: number
  diskUsage?: DiskInfo[]
  gpuUsage?: GpuInfo[]
  topProcesses?: ProcessInfo[]
  networkIo?: NetworkInfo
  pingLatency?: number
  sshStatus?: number
}

export interface DiskInfo {
  mount: string
  total: number
  used: number
  percent: number
}

export interface GpuInfo {
  index: number
  name: string
  usage: number
  memoryUsed: number
  memoryTotal: number
  temperature: number
}

export interface ProcessInfo {
  pid: number
  name: string
  user: string
  cpu: number
  memory: number
}

export interface NetworkInfo {
  rxBytes: number
  txBytes: number
  rxRate: number
  txRate: number
}

export interface Group {
  id: number
  name: string
  color: string
  description?: string
  server_count: number
}

export interface ServerStatus {
  serverId: number
  timestamp: string
  cpu: {
    usage: number
    cores: number
    loadAvg: number[]
  }
  memory: {
    usage: number
    total: number
    used: number
    available: number
  }
  disk: DiskInfo[]
  gpu: GpuInfo[]
  topProcesses: ProcessInfo[]
  network: NetworkInfo
  connection: {
    ping: boolean
    pingLatency: number | null
    ssh: boolean
  }
}

export interface FileInfo {
  name: string
  type: 'file' | 'directory' | 'link'
  size: number
  permissions: string
  owner: number
  group: number
  modifiedAt: string
}

export interface ApiResponse<T = any> {
  code: number
  message: string
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  code: number
  message: string
  data: {
    list: T[]
    total: number
    page: number
    pageSize: number
  }
}
