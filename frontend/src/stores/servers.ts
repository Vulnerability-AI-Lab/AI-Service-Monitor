import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { serverApi, groupApi } from '@/api'
import type { Server, Group, ServerStatus } from '@/types'

export const useServersStore = defineStore('servers', () => {
  const servers = ref<Map<number, Server>>(new Map())
  const groups = ref<Group[]>([])
  const overview = ref<{
    total: number
    online: number
    offline: number
    warning: number
    error: number
  }>({ total: 0, online: 0, offline: 0, warning: 0, error: 0 })
  const loading = ref(false)
  const currentServerId = ref<number | null>(null)

  const serverList = computed(() => Array.from(servers.value.values()))

  const currentServer = computed(() =>
    currentServerId.value ? servers.value.get(currentServerId.value) : null
  )

  const serversByGroup = computed(() => {
    const grouped = new Map<number, Server[]>()
    grouped.set(0, []) // 未分组

    for (const group of groups.value) {
      grouped.set(group.id, [])
    }

    for (const server of servers.value.values()) {
      const groupId = server.group_id || 0
      if (!grouped.has(groupId)) {
        grouped.set(groupId, [])
      }
      grouped.get(groupId)!.push(server)
    }

    return grouped
  })

  async function fetchOverview() {
    try {
      const res: any = await serverApi.getOverview()
      overview.value = {
        total: res.data.total,
        online: res.data.online,
        offline: res.data.offline,
        warning: res.data.warning,
        error: res.data.error
      }
    } catch (e) {
      console.error('Failed to fetch overview:', e)
    }
  }

  async function fetchServers() {
    loading.value = true
    try {
      const res: any = await serverApi.list({ pageSize: 1000 })
      servers.value.clear()
      for (const server of res.data.list) {
        servers.value.set(server.id, server)
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchGroups() {
    try {
      const res: any = await groupApi.list()
      groups.value = res.data
    } catch (e) {
      console.error('Failed to fetch groups:', e)
    }
  }

  async function addServer(data: any) {
    const res: any = await serverApi.create(data)
    servers.value.set(res.data.id, res.data)
    return res.data
  }

  async function updateServer(id: number, data: any) {
    const res: any = await serverApi.update(id, data)
    servers.value.set(id, res.data)
    return res.data
  }

  async function deleteServer(id: number) {
    await serverApi.delete(id)
    servers.value.delete(id)
  }

  function updateServerStatus(status: ServerStatus) {
    const server = servers.value.get(status.serverId)
    if (server) {
      // 更新指标
      server.metrics = {
        cpuUsage: status.cpu.usage,
        cpuCores: status.cpu.cores,
        loadAvg: status.cpu.loadAvg,
        memoryUsage: status.memory.usage,
        memoryTotal: status.memory.total,
        memoryUsed: status.memory.used,
        memoryAvailable: status.memory.available,
        diskUsage: status.disk,
        gpuUsage: status.gpu,
        topProcesses: status.topProcesses,
        networkIo: status.network,
        pingLatency: status.connection.pingLatency ?? undefined,
        sshStatus: status.connection.ssh ? 1 : 0
      }

      // 更新状态：收到数据就说明在线，根据负载判断是否警告
      if ((status.cpu.usage > 80) || (status.memory.usage > 80)) {
        server.status = 'warning'
      } else {
        server.status = 'online'
      }

      server.last_seen = status.timestamp
      servers.value.set(status.serverId, { ...server })
    }
  }

  return {
    servers,
    groups,
    overview,
    loading,
    currentServerId,
    serverList,
    currentServer,
    serversByGroup,
    fetchOverview,
    fetchServers,
    fetchGroups,
    addServer,
    updateServer,
    deleteServer,
    updateServerStatus
  }
})
