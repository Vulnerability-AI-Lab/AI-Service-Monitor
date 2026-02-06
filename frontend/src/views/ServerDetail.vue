<template>
  <div class="server-detail" v-loading="loading">
    <!-- 顶部导航 -->
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="$router.push('/')">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="server-title">
          <h1>{{ server?.name }}</h1>
          <span class="server-ip">{{ server?.ip }}</span>
        </div>
        <div class="status-badge" :class="server?.status">
          <span class="status-indicator" :class="server?.status"></span>
          {{ statusText }}
        </div>
      </div>
      <div class="header-actions">
        <el-button @click="$router.push(`/terminal/${serverId}`)">
          <el-icon><Monitor /></el-icon>
          SSH终端
        </el-button>
        <el-button @click="$router.push(`/files/${serverId}`)">
          <el-icon><FolderOpened /></el-icon>
          文件管理
        </el-button>
        <el-button type="danger" @click="handleReboot">
          <el-icon><RefreshRight /></el-icon>
          重启
        </el-button>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="info-section tech-card">
      <div class="section-header">
        <el-icon><InfoFilled /></el-icon>
        <span>基本信息</span>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">主机名</span>
          <span class="value">{{ server?.hostname || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="label">操作系统</span>
          <span class="value">{{ server?.os_info || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="label">运行时间</span>
          <span class="value">{{ formatUptime(server?.uptime) }}</span>
        </div>
        <div class="info-item">
          <span class="label">最后更新</span>
          <span class="value">{{ formatTime(server?.last_seen) }}</span>
        </div>
        <div class="info-item">
          <span class="label">Ping延迟</span>
          <span class="value tech-number">{{ metrics?.pingLatency?.toFixed(1) || '-' }} ms</span>
        </div>
        <div class="info-item">
          <span class="label">SSH状态</span>
          <span class="value">
            <el-tag :type="metrics?.sshStatus ? 'success' : 'danger'" size="small">
              {{ metrics?.sshStatus ? '正常' : '异常' }}
            </el-tag>
          </span>
        </div>
      </div>
    </div>

    <!-- 监控仪表盘 -->
    <div class="metrics-dashboard">
      <!-- CPU -->
      <div class="metric-card tech-card">
        <div class="card-title">
          <el-icon><Cpu /></el-icon>
          CPU
        </div>
        <div class="gauge-container">
          <div class="gauge-chart" ref="cpuGaugeRef"></div>
        </div>
        <div class="metric-details">
          <div class="detail-item">
            <span class="label">核心数</span>
            <span class="value">{{ metrics?.cpuCores || '-' }}</span>
          </div>
          <div class="detail-item">
            <span class="label">负载 (1/5/15)</span>
            <span class="value">{{ formatLoadAvg(metrics?.loadAvg) }}</span>
          </div>
        </div>
      </div>

      <!-- 内存 -->
      <div class="metric-card tech-card">
        <div class="card-title">
          <el-icon><Coin /></el-icon>
          内存
        </div>
        <div class="gauge-container">
          <div class="gauge-chart" ref="memGaugeRef"></div>
        </div>
        <div class="metric-details">
          <div class="detail-item">
            <span class="label">已用</span>
            <span class="value">{{ formatBytes(metrics?.memoryUsed) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">总计</span>
            <span class="value">{{ formatBytes(metrics?.memoryTotal) }}</span>
          </div>
        </div>
      </div>

      <!-- 磁盘 -->
      <div class="metric-card tech-card">
        <div class="card-title">
          <el-icon><Memo /></el-icon>
          磁盘
        </div>
        <div class="disk-list">
          <div v-for="disk in metrics?.diskUsage" :key="disk.mount" class="disk-item">
            <div class="disk-header">
              <span class="mount">{{ disk.mount }}</span>
              <span class="usage tech-number">{{ disk.percent?.toFixed(1) }}%</span>
            </div>
            <div class="tech-progress">
              <div
                class="progress-bar"
                :class="getProgressClass(disk.percent)"
                :style="{ width: `${disk.percent}%` }"
              ></div>
            </div>
            <div class="disk-size">
              {{ formatBytes(disk.used) }} / {{ formatBytes(disk.total) }}
            </div>
          </div>
        </div>
      </div>

      <!-- GPU (如果有) -->
      <div v-if="metrics?.gpuUsage?.length" class="metric-card tech-card">
        <div class="card-title">
          <el-icon><VideoCamera /></el-icon>
          GPU
        </div>
        <div class="gpu-list">
          <div v-for="gpu in metrics?.gpuUsage" :key="gpu.index" class="gpu-item">
            <div class="gpu-header">
              <span class="gpu-name">{{ gpu.name }}</span>
              <span class="gpu-temp">{{ gpu.temperature }}°C</span>
            </div>
            <div class="gpu-metrics">
              <div class="gpu-metric">
                <span class="label">使用率</span>
                <div class="tech-progress">
                  <div
                    class="progress-bar"
                    :class="getProgressClass(gpu.usage)"
                    :style="{ width: `${gpu.usage}%` }"
                  ></div>
                </div>
                <span class="value tech-number">{{ gpu.usage }}%</span>
              </div>
              <div class="gpu-metric">
                <span class="label">显存</span>
                <div class="tech-progress">
                  <div
                    class="progress-bar"
                    :class="getProgressClass((gpu.memoryUsed / gpu.memoryTotal) * 100)"
                    :style="{ width: `${(gpu.memoryUsed / gpu.memoryTotal) * 100}%` }"
                  ></div>
                </div>
                <span class="value">{{ gpu.memoryUsed }}MB / {{ gpu.memoryTotal }}MB</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史趋势图 -->
    <div class="chart-section tech-card">
      <div class="section-header">
        <el-icon><TrendCharts /></el-icon>
        <span>历史趋势</span>
        <el-radio-group v-model="chartHours" size="small" @change="loadHistory">
          <el-radio-button :label="1">1小时</el-radio-button>
          <el-radio-button :label="6">6小时</el-radio-button>
          <el-radio-button :label="24">24小时</el-radio-button>
        </el-radio-group>
      </div>
      <div class="trend-chart" ref="trendChartRef"></div>
    </div>

    <!-- Top进程 -->
    <div class="process-section tech-card">
      <div class="section-header">
        <el-icon><List /></el-icon>
        <span>Top 5 进程 (按CPU占用)</span>
      </div>
      <el-table :data="metrics?.topProcesses || []" size="small" class="process-table">
        <el-table-column prop="pid" label="PID" width="80" />
        <el-table-column prop="name" label="进程名" />
        <el-table-column prop="user" label="用户" width="100" />
        <el-table-column prop="cpu" label="CPU%" width="100">
          <template #default="{ row }">
            <span class="tech-number">{{ row.cpu?.toFixed(1) }}%</span>
          </template>
        </el-table-column>
        <el-table-column prop="memory" label="内存%" width="100">
          <template #default="{ row }">
            <span>{{ row.memory?.toFixed(1) }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { serverApi } from '@/api'
import { useServersStore } from '@/stores/servers'
import type { Server, ServerMetrics } from '@/types'

const route = useRoute()
const router = useRouter()
const serversStore = useServersStore()

const serverId = computed(() => Number(route.params.id))
const server = computed(() => serversStore.servers.get(serverId.value))
const metrics = computed(() => server.value?.metrics)
const loading = ref(false)

const statusText = computed(() => {
  const map: Record<string, string> = {
    online: '正常运行',
    warning: '资源告警',
    error: '连接异常',
    offline: '离线'
  }
  return map[server.value?.status || ''] || '未知'
})

// 图表相关
const cpuGaugeRef = ref<HTMLElement>()
const memGaugeRef = ref<HTMLElement>()
const trendChartRef = ref<HTMLElement>()
let cpuGauge: echarts.ECharts | null = null
let memGauge: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null

const chartHours = ref(1)
const historyData = ref<any[]>([])

function getProgressClass(value: number) {
  if (value >= 90) return 'high'
  if (value >= 70) return 'medium'
  return 'low'
}

function formatUptime(seconds?: number) {
  if (!seconds) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${mins}分钟`
  return `${mins}分钟`
}

function formatTime(time?: string) {
  if (!time) return '-'
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

function formatBytes(bytes?: number) {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}

function formatLoadAvg(loadAvg?: number[]) {
  if (!loadAvg || loadAvg.length < 3) return '-'
  return loadAvg.map(v => v?.toFixed(2) || '0').join(' / ')
}

function initGauges() {
  // CPU仪表盘
  if (cpuGaugeRef.value) {
    cpuGauge = echarts.init(cpuGaugeRef.value)
    cpuGauge.setOption(getGaugeOption('CPU', metrics.value?.cpuUsage || 0))
  }

  // 内存仪表盘
  if (memGaugeRef.value) {
    memGauge = echarts.init(memGaugeRef.value)
    memGauge.setOption(getGaugeOption('内存', metrics.value?.memoryUsage || 0))
  }
}

function getGaugeOption(name: string, value: number) {
  const color = value >= 90 ? '#ff4757' : value >= 70 ? '#ffaa00' : '#00ff88'
  return {
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      radius: '90%',
      itemStyle: {
        color: color,
        shadowBlur: 10,
        shadowColor: color
      },
      progress: {
        show: true,
        width: 12,
        roundCap: true
      },
      pointer: { show: false },
      axisLine: {
        lineStyle: {
          width: 12,
          color: [[1, 'rgba(255,255,255,0.1)']]
        }
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: {
        offsetCenter: [0, '30%'],
        fontSize: 14,
        color: '#8b95a5'
      },
      detail: {
        offsetCenter: [0, '-10%'],
        fontSize: 32,
        fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace',
        color: color,
        formatter: '{value}%'
      },
      data: [{ value: value.toFixed(1), name: name }]
    }]
  }
}

function initTrendChart() {
  if (!trendChartRef.value) return

  trendChart = echarts.init(trendChartRef.value)
  updateTrendChart()
}

function updateTrendChart() {
  if (!trendChart) return

  const times = historyData.value.map(d => dayjs(d.timestamp).format('HH:mm'))
  const cpuData = historyData.value.map(d => d.cpu)
  const memData = historyData.value.map(d => d.memory)

  trendChart.setOption({
    backgroundColor: 'transparent',
    grid: {
      top: 40,
      right: 20,
      bottom: 30,
      left: 50
    },
    legend: {
      data: ['CPU', '内存'],
      textStyle: { color: '#8b95a5' },
      top: 10
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13, 20, 33, 0.9)',
      borderColor: '#1a2744',
      textStyle: { color: '#e0e6ed' }
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#1a2744' } },
      axisLabel: { color: '#8b95a5' }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8b95a5', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1a2744', type: 'dashed' } }
    },
    series: [
      {
        name: 'CPU',
        type: 'line',
        data: cpuData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00d4ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0)' }
          ])
        }
      },
      {
        name: '内存',
        type: 'line',
        data: memData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00ff88', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 255, 136, 0.3)' },
            { offset: 1, color: 'rgba(0, 255, 136, 0)' }
          ])
        }
      }
    ]
  })
}

async function loadHistory() {
  try {
    const res: any = await serverApi.getMetrics(serverId.value, chartHours.value)
    historyData.value = res.data.metrics || []
    updateTrendChart()
  } catch (e) {
    console.error('Failed to load history:', e)
  }
}

async function handleReboot() {
  await ElMessageBox.confirm('确定要重启该服务器吗？', '确认重启', { type: 'warning' })
  try {
    await serverApi.reboot(serverId.value)
    ElMessage.success('重启命令已发送')
  } catch (e) {
    // 错误已处理
  }
}

// 监听metrics变化更新仪表盘
watch(metrics, (newMetrics) => {
  if (newMetrics) {
    cpuGauge?.setOption(getGaugeOption('CPU', newMetrics.cpuUsage || 0))
    memGauge?.setOption(getGaugeOption('内存', newMetrics.memoryUsage || 0))
  }
}, { deep: true })

let refreshInterval: number | null = null

async function fetchServerDetail() {
  try {
    const res: any = await serverApi.get(serverId.value)
    if (res.data) {
      serversStore.servers.set(serverId.value, res.data)
    }
  } catch (e) {
    console.error('Failed to fetch server detail:', e)
  }
}

onMounted(async () => {
  // 始终获取最新的服务器详情
  loading.value = true
  await fetchServerDetail()
  loading.value = false

  setTimeout(() => {
    initGauges()
    initTrendChart()
    loadHistory()
  }, 100)

  window.addEventListener('resize', () => {
    cpuGauge?.resize()
    memGauge?.resize()
    trendChart?.resize()
  })

  // 每 10 秒刷新一次数据（作为 WebSocket 的备份）
  refreshInterval = window.setInterval(fetchServerDetail, 10000)
})

onUnmounted(() => {
  cpuGauge?.dispose()
  memGauge?.dispose()
  trendChart?.dispose()
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style lang="scss" scoped>
.server-detail {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.server-title {
  h1 {
    font-size: 20px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }

  .server-ip {
    font-family: var(--font-mono);
    font-size: 14px;
    color: #8b95a5;
  }
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.05);

  &.online { color: var(--status-online); }
  &.warning { color: var(--status-warning); }
  &.error { color: var(--status-error); }
  &.offline { color: var(--status-offline); }
}

.header-actions {
  display: flex;
  gap: 12px;
}

.info-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 500;
  color: var(--tech-primary);

  .el-radio-group {
    margin-left: auto;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .label {
    font-size: 12px;
    color: #8b95a5;
  }

  .value {
    font-size: 14px;
    color: #e0e6ed;
  }
}

.metrics-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.metric-card {
  .card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 500;
    color: var(--tech-primary);
    margin-bottom: 16px;
  }
}

.gauge-container {
  height: 180px;
  margin-bottom: 16px;
}

.gauge-chart {
  width: 100%;
  height: 100%;
}

.metric-details {
  display: flex;
  justify-content: space-around;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.detail-item {
  text-align: center;

  .label {
    display: block;
    font-size: 12px;
    color: #8b95a5;
    margin-bottom: 4px;
  }

  .value {
    font-size: 14px;
    color: #e0e6ed;
  }
}

.disk-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.disk-item {
  .disk-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;

    .mount {
      font-size: 13px;
      color: #e0e6ed;
    }
  }

  .disk-size {
    font-size: 12px;
    color: #8b95a5;
    margin-top: 4px;
  }
}

.gpu-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gpu-item {
  .gpu-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;

    .gpu-name {
      font-size: 13px;
      color: #e0e6ed;
    }

    .gpu-temp {
      font-family: var(--font-mono);
      color: var(--status-warning);
    }
  }
}

.gpu-metric {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;

  .label {
    width: 50px;
    font-size: 12px;
    color: #8b95a5;
  }

  .tech-progress {
    flex: 1;
  }

  .value {
    width: 100px;
    text-align: right;
    font-size: 12px;
    color: #e0e6ed;
  }
}

.chart-section {
  margin-bottom: 24px;
}

.trend-chart {
  height: 300px;
}

.process-section {
  .process-table {
    --el-table-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
  }
}
</style>
