<template>
  <div class="dashboard">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="selectedGroup" placeholder="全部分组" clearable class="group-select">
          <el-option label="全部分组" :value="null" />
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          >
            <span class="group-color" :style="{ background: group.color }"></span>
            {{ group.name }}
            <span class="group-count">({{ group.server_count }})</span>
          </el-option>
        </el-select>

        <el-input
          v-model="searchKeyword"
          placeholder="搜索服务器名称或IP..."
          clearable
          class="search-input"
          :prefix-icon="Search"
        />

        <el-radio-group v-model="statusFilter" class="status-filter">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="online">在线</el-radio-button>
          <el-radio-button label="warning">警告</el-radio-button>
          <el-radio-button label="error">异常</el-radio-button>
          <el-radio-button label="offline">离线</el-radio-button>
        </el-radio-group>
      </div>

      <div class="toolbar-right">
        <el-button type="primary" @click="showScanDialog = true">
          <el-icon><Search /></el-icon>
          扫描网段
        </el-button>
        <el-button type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加服务器
        </el-button>
      </div>
    </div>

    <!-- 服务器网格 -->
    <div class="server-grid" v-loading="loading">
      <TransitionGroup name="server-list">
        <div
          v-for="server in filteredServers"
          :key="server.id"
          class="server-card tech-card"
          :class="[`status-${server.status}`]"
          @click="goToDetail(server.id)"
        >
          <!-- 状态指示条 -->
          <div class="status-bar" :class="server.status"></div>

          <!-- 卡片头部 -->
          <div class="card-header">
            <div class="server-icon">
              <el-icon :size="36"><Monitor /></el-icon>
            </div>
            <div class="server-info">
              <h3 class="server-name">{{ server.name }}</h3>
              <span class="server-ip">{{ server.ip }}</span>
            </div>
            <div class="status-badge" :class="server.status">
              <span class="status-indicator" :class="server.status"></span>
              {{ statusText(server.status) }}
            </div>
          </div>

          <!-- 指标数据 -->
          <div class="metrics" v-if="server.status === 'online' || server.status === 'warning'">
            <div class="metric-item">
              <div class="metric-header">
                <span class="metric-label">CPU</span>
                <span class="metric-value tech-number">{{ formatMetric(server.metrics?.cpuUsage) }}%</span>
              </div>
              <div class="tech-progress">
                <div
                  class="progress-bar"
                  :class="getProgressClass(server.metrics?.cpuUsage || 0)"
                  :style="{ width: `${server.metrics?.cpuUsage || 0}%` }"
                ></div>
              </div>
            </div>

            <div class="metric-item">
              <div class="metric-header">
                <span class="metric-label">内存</span>
                <span class="metric-value tech-number">{{ formatMetric(server.metrics?.memoryUsage) }}%</span>
              </div>
              <div class="tech-progress">
                <div
                  class="progress-bar"
                  :class="getProgressClass(server.metrics?.memoryUsage || 0)"
                  :style="{ width: `${server.metrics?.memoryUsage || 0}%` }"
                ></div>
              </div>
            </div>

            <div class="metric-item" v-if="server.metrics?.diskUsage">
              <div class="metric-header">
                <span class="metric-label">磁盘</span>
                <span class="metric-value tech-number">{{ formatMetric(server.metrics?.diskUsage) }}%</span>
              </div>
              <div class="tech-progress">
                <div
                  class="progress-bar"
                  :class="getProgressClass(server.metrics?.diskUsage || 0)"
                  :style="{ width: `${server.metrics?.diskUsage || 0}%` }"
                ></div>
              </div>
            </div>
          </div>

          <!-- 离线/异常状态 -->
          <div class="offline-info" v-else>
            <el-icon :size="32" class="offline-icon"><WarningFilled /></el-icon>
            <span>{{ server.status === 'error' ? '连接异常' : '服务器离线' }}</span>
          </div>

          <!-- 快捷操作 -->
          <div class="card-actions" @click.stop>
            <el-tooltip content="SSH终端">
              <el-button circle size="small" @click="goToTerminal(server.id)" :disabled="server.status === 'offline' || server.status === 'error'">
                <el-icon><Monitor /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="文件管理">
              <el-button circle size="small" @click="goToFiles(server.id)" :disabled="server.status === 'offline' || server.status === 'error'">
                <el-icon><FolderOpened /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="更多操作">
              <el-dropdown trigger="click" @command="(cmd: string) => handleServerAction(cmd, server)">
                <el-button circle size="small">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">
                      <el-icon><Edit /></el-icon>编辑
                    </el-dropdown-item>
                    <el-dropdown-item command="reboot" :disabled="server.status === 'offline'">
                      <el-icon><RefreshRight /></el-icon>重启
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      <el-icon><Delete /></el-icon>删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </el-tooltip>
          </div>
        </div>
      </TransitionGroup>

      <!-- 空状态 -->
      <div v-if="filteredServers.length === 0 && !loading" class="empty-state">
        <el-icon :size="64"><Box /></el-icon>
        <p>暂无服务器</p>
        <el-button type="primary" @click="showAddDialog = true">添加服务器</el-button>
      </div>
    </div>

    <!-- 添加服务器对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingServer ? '编辑服务器' : '添加服务器'"
      width="500px"
      class="tech-dialog"
    >
      <el-form ref="serverFormRef" :model="serverForm" :rules="serverRules" label-width="100px">
        <el-form-item label="服务器名称" prop="name">
          <el-input v-model="serverForm.name" placeholder="请输入服务器名称" />
        </el-form-item>
        <el-form-item label="IP地址" prop="ip">
          <el-input v-model="serverForm.ip" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item label="SSH端口" prop="sshPort">
          <el-input-number v-model="serverForm.sshPort" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名" prop="sshUser">
          <el-input v-model="serverForm.sshUser" placeholder="root" />
        </el-form-item>
        <el-form-item label="认证方式" prop="sshAuthType">
          <el-radio-group v-model="serverForm.sshAuthType">
            <el-radio label="password">密码</el-radio>
            <el-radio label="key">密钥</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="serverForm.sshAuthType === 'password' ? '密码' : '私钥'" prop="sshCredential">
          <el-input
            v-model="serverForm.sshCredential"
            :type="serverForm.sshAuthType === 'password' ? 'password' : 'textarea'"
            :rows="4"
            :placeholder="serverForm.sshAuthType === 'password' ? '请输入密码' : '请粘贴私钥内容'"
            show-password
          />
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="serverForm.groupId" placeholder="选择分组" clearable>
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="serverForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="submitServerForm" :loading="submitting">
          {{ editingServer ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 扫描网段对话框 -->
    <el-dialog v-model="showScanDialog" title="扫描网段" width="600px" class="tech-dialog">
      <el-form :model="scanForm" label-width="80px">
        <el-form-item label="网段">
          <el-input v-model="scanForm.subnet" placeholder="192.168.1.0/24" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input v-model="scanForm.ports" placeholder="22" />
        </el-form-item>
      </el-form>

      <div v-if="scanResults.length > 0" class="scan-results">
        <h4>发现 {{ scanResults.length }} 台设备</h4>
        <el-table :data="scanResults" size="small">
          <el-table-column prop="ip" label="IP地址" />
          <el-table-column prop="hostname" label="主机名" />
          <el-table-column prop="sshAvailable" label="SSH">
            <template #default="{ row }">
              <el-tag :type="row.sshAvailable ? 'success' : 'info'" size="small">
                {{ row.sshAvailable ? '可用' : '不可用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                :disabled="!row.sshAvailable"
                @click="addFromScan(row)"
              >
                添加
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="showScanDialog = false">关闭</el-button>
        <el-button type="primary" @click="startScan" :loading="scanning">
          {{ scanning ? '扫描中...' : '开始扫描' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus'
import { Search, Plus, Monitor, FolderOpened, MoreFilled, Edit, Delete, RefreshRight, WarningFilled, Box } from '@element-plus/icons-vue'
import { useServersStore } from '@/stores/servers'
import { serverApi } from '@/api'
import type { Server } from '@/types'

const router = useRouter()
const serversStore = useServersStore()

const loading = computed(() => serversStore.loading)
const servers = computed(() => serversStore.serverList)
const groups = computed(() => serversStore.groups)

const selectedGroup = ref<number | null>(null)
const searchKeyword = ref('')
const statusFilter = ref('')

const filteredServers = computed(() => {
  let result = servers.value

  if (selectedGroup.value) {
    result = result.filter(s => s.group_id === selectedGroup.value)
  }

  if (statusFilter.value) {
    result = result.filter(s => s.status === statusFilter.value)
  }

  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(s =>
      s.name.toLowerCase().includes(keyword) ||
      s.ip.includes(keyword) ||
      s.hostname?.toLowerCase().includes(keyword)
    )
  }

  return result
})

function statusText(status: string) {
  const map: Record<string, string> = {
    online: '正常',
    warning: '警告',
    error: '异常',
    offline: '离线'
  }
  return map[status] || '未知'
}

function getProgressClass(value: number) {
  if (value >= 90) return 'high'
  if (value >= 70) return 'medium'
  return 'low'
}

function formatMetric(value: any): string {
  if (value === null || value === undefined) return '0.0'
  const num = Number(value)
  return isNaN(num) ? '0.0' : num.toFixed(1)
}

function goToDetail(id: number) {
  router.push(`/server/${id}`)
}

function goToTerminal(id: number) {
  router.push(`/terminal/${id}`)
}

function goToFiles(id: number) {
  router.push(`/files/${id}`)
}

// 服务器表单
const showAddDialog = ref(false)
const editingServer = ref<Server | null>(null)
const serverFormRef = ref<FormInstance>()
const submitting = ref(false)

const serverForm = reactive({
  name: '',
  ip: '',
  sshPort: 22,
  sshUser: 'root',
  sshAuthType: 'password' as 'password' | 'key',
  sshCredential: '',
  groupId: null as number | null,
  notes: ''
})

const serverRules = {
  name: [{ required: true, message: '请输入服务器名称', trigger: 'blur' }],
  ip: [{ required: true, message: '请输入IP地址', trigger: 'blur' }],
  sshUser: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  sshCredential: [{ required: true, message: '请输入密码或私钥', trigger: 'blur' }]
}

async function submitServerForm() {
  const valid = await serverFormRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (editingServer.value) {
      await serversStore.updateServer(editingServer.value.id, serverForm)
      ElMessage.success('更新成功')
    } else {
      await serversStore.addServer(serverForm)
      ElMessage.success('添加成功')
    }
    showAddDialog.value = false
    resetServerForm()
  } catch (e) {
    // 错误已在API层处理
  } finally {
    submitting.value = false
  }
}

function resetServerForm() {
  editingServer.value = null
  serverForm.name = ''
  serverForm.ip = ''
  serverForm.sshPort = 22
  serverForm.sshUser = 'root'
  serverForm.sshAuthType = 'password'
  serverForm.sshCredential = ''
  serverForm.groupId = null
  serverForm.notes = ''
}

function handleServerAction(command: string, server: Server) {
  switch (command) {
    case 'edit':
      editingServer.value = server
      serverForm.name = server.name
      serverForm.ip = server.ip
      serverForm.sshPort = server.ssh_port
      serverForm.sshUser = server.ssh_user
      serverForm.sshAuthType = server.ssh_auth_type
      serverForm.sshCredential = ''
      serverForm.groupId = server.group_id || null
      serverForm.notes = server.notes || ''
      showAddDialog.value = true
      break
    case 'reboot':
      ElMessageBox.confirm('确定要重启该服务器吗？', '确认重启', {
        type: 'warning'
      }).then(async () => {
        try {
          await serverApi.reboot(server.id)
          ElMessage.success('重启命令已发送')
        } catch (e) {
          // 错误已处理
        }
      }).catch(() => {})
      break
    case 'delete':
      ElMessageBox.confirm('确定要删除该服务器吗？', '确认删除', {
        type: 'warning'
      }).then(async () => {
        await serversStore.deleteServer(server.id)
        ElMessage.success('删除成功')
      }).catch(() => {})
      break
  }
}

// 扫描功能
const showScanDialog = ref(false)
const scanning = ref(false)
const scanResults = ref<any[]>([])

const scanForm = reactive({
  subnet: '192.168.1.0/24',
  ports: '22'
})

async function startScan() {
  scanning.value = true
  scanResults.value = []
  try {
    const ports = scanForm.ports.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p))
    const res: any = await serverApi.scan(scanForm.subnet, ports)
    scanResults.value = res.data.found || []
    if (scanResults.value.length === 0) {
      ElMessage.info('未发现可用设备')
    }
  } catch (e) {
    // 错误已处理
  } finally {
    scanning.value = false
  }
}

function addFromScan(result: any) {
  serverForm.ip = result.ip
  serverForm.name = result.hostname || result.ip
  showScanDialog.value = false
  showAddDialog.value = true
}
</script>

<style lang="scss" scoped>
.dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.toolbar-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.group-select {
  width: 160px;
}

.group-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 8px;
}

.group-count {
  color: #8b95a5;
  margin-left: 4px;
}

.search-input {
  width: 240px;
}

.status-filter {
  :deep(.el-radio-button__inner) {
    background: var(--bg-darker);
    border-color: var(--border-color);
    color: #8b95a5;

    &:hover {
      color: var(--tech-primary);
    }
  }

  :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
    background: var(--tech-primary);
    border-color: var(--tech-primary);
    color: #fff;
    box-shadow: none;
  }
}

.toolbar-right {
  display: flex;
  gap: 12px;
}

.server-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  align-content: start;
}

.server-card {
  padding: 0;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-4px);

    .card-actions {
      opacity: 1;
    }
  }

  &.status-online { --card-status-color: var(--status-online); }
  &.status-warning { --card-status-color: var(--status-warning); }
  &.status-error { --card-status-color: var(--status-error); }
  &.status-offline { --card-status-color: var(--status-offline); }
}

.status-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;

  &.online { background: var(--status-online); box-shadow: 0 0 10px var(--status-online); }
  &.warning { background: var(--status-warning); box-shadow: 0 0 10px var(--status-warning); }
  &.error { background: var(--status-error); box-shadow: 0 0 10px var(--status-error); }
  &.offline { background: var(--status-offline); }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.server-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-darker);
  border-radius: 10px;
  color: var(--card-status-color);
}

.server-info {
  flex: 1;

  .server-name {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }

  .server-ip {
    font-family: var(--font-mono);
    font-size: 13px;
    color: #8b95a5;
  }
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.05);

  &.online { color: var(--status-online); }
  &.warning { color: var(--status-warning); }
  &.error { color: var(--status-error); }
  &.offline { color: var(--status-offline); }
}

.metrics {
  padding: 16px 20px;
}

.metric-item {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.metric-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;

  .metric-label {
    font-size: 12px;
    color: #8b95a5;
  }

  .metric-value {
    font-size: 14px;
  }
}

.offline-info {
  padding: 32px 20px;
  text-align: center;
  color: #8b95a5;

  .offline-icon {
    margin-bottom: 8px;
    opacity: 0.5;
  }
}

.card-actions {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.3s;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #8b95a5;

  .el-icon {
    margin-bottom: 16px;
    opacity: 0.3;
  }

  p {
    margin-bottom: 16px;
  }
}

.scan-results {
  margin-top: 20px;

  h4 {
    margin-bottom: 12px;
    color: var(--tech-primary);
  }
}

// 列表动画
.server-list-enter-active,
.server-list-leave-active {
  transition: all 0.3s ease;
}

.server-list-enter-from,
.server-list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
