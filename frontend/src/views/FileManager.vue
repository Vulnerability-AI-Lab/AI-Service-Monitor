<template>
  <div class="file-manager">
    <!-- 顶部工具栏 -->
    <div class="file-toolbar">
      <div class="toolbar-left">
        <el-button text @click="$router.push(`/server/${serverId}`)">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="page-title">
          <el-icon><FolderOpened /></el-icon>
          文件管理 - {{ server?.name }}
        </span>
      </div>
      <div class="toolbar-actions">
        <el-button size="small" @click="goUp" :disabled="currentPath === '/'">
          <el-icon><Top /></el-icon>
          上级目录
        </el-button>
        <el-button size="small" @click="refresh">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" type="primary" @click="showCreateFolderDialog = true">
          <el-icon><FolderAdd /></el-icon>
          新建文件夹
        </el-button>
        <el-upload
          ref="uploadRef"
          action=""
          :http-request="handleUpload"
          :show-file-list="false"
          multiple
        >
          <el-button size="small" type="primary">
            <el-icon><Upload /></el-icon>
            上传文件
          </el-button>
        </el-upload>
      </div>
    </div>

    <!-- 路径导航 -->
    <div class="path-nav">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item @click="navigateTo('/')">
          <el-icon><HomeFilled /></el-icon>
        </el-breadcrumb-item>
        <el-breadcrumb-item
          v-for="(part, index) in pathParts"
          :key="index"
          @click="navigateTo(getPathUpTo(index))"
        >
          {{ part }}
        </el-breadcrumb-item>
      </el-breadcrumb>
      <el-input
        v-model="pathInput"
        placeholder="输入路径..."
        size="small"
        class="path-input"
        @keyup.enter="navigateTo(pathInput)"
      >
        <template #prefix>
          <el-icon><FolderOpened /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 文件列表 -->
    <div class="file-list" v-loading="loading">
      <el-table
        :data="files"
        @row-dblclick="handleRowDblClick"
        @row-contextmenu="handleContextMenu"
        highlight-current-row
        class="file-table"
      >
        <el-table-column width="50">
          <template #default="{ row }">
            <el-icon :size="24" :class="['file-icon', row.type]">
              <Folder v-if="row.type === 'directory'" />
              <Document v-else />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" sortable>
          <template #default="{ row }">
            <span class="file-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="size" label="大小" width="120" sortable>
          <template #default="{ row }">
            {{ row.type === 'directory' ? '-' : formatSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="permissions" label="权限" width="120">
          <template #default="{ row }">
            <code class="permissions">{{ row.permissions }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="modifiedAt" label="修改时间" width="180" sortable>
          <template #default="{ row }">
            {{ formatTime(row.modifiedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.type !== 'directory'"
              type="primary"
              text
              size="small"
              @click.stop="downloadFile(row)"
            >
              <el-icon><Download /></el-icon>
              下载
            </el-button>
            <el-button
              type="primary"
              text
              size="small"
              @click.stop="showRenameDialog(row)"
            >
              <el-icon><Edit /></el-icon>
              重命名
            </el-button>
            <el-button
              type="danger"
              text
              size="small"
              @click.stop="deleteFile(row)"
            >
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态 -->
      <div v-if="files.length === 0 && !loading" class="empty-state">
        <el-icon :size="48"><Folder /></el-icon>
        <p>该目录为空</p>
      </div>
    </div>

    <!-- 新建文件夹对话框 -->
    <el-dialog v-model="showCreateFolderDialog" title="新建文件夹" width="400px">
      <el-input v-model="newFolderName" placeholder="请输入文件夹名称" @keyup.enter="createFolder" />
      <template #footer>
        <el-button @click="showCreateFolderDialog = false">取消</el-button>
        <el-button type="primary" @click="createFolder" :loading="creating">创建</el-button>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog v-model="showRenameDialogFlag" title="重命名" width="400px">
      <el-input v-model="newName" placeholder="请输入新名称" @keyup.enter="renameFile" />
      <template #footer>
        <el-button @click="showRenameDialogFlag = false">取消</el-button>
        <el-button type="primary" @click="renameFile" :loading="renaming">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { useServersStore } from '@/stores/servers'
import { fileApi } from '@/api'
import type { FileInfo } from '@/types'

const route = useRoute()
const serversStore = useServersStore()

const serverId = computed(() => Number(route.params.id))
const server = computed(() => serversStore.servers.get(serverId.value))

const currentPath = ref('/')
const pathInput = ref('/')
const files = ref<FileInfo[]>([])
const loading = ref(false)

const pathParts = computed(() => {
  return currentPath.value.split('/').filter(Boolean)
})

function getPathUpTo(index: number) {
  return '/' + pathParts.value.slice(0, index + 1).join('/')
}

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

async function loadDirectory(path: string) {
  loading.value = true
  try {
    const res: any = await fileApi.listDirectory(serverId.value, path)
    files.value = res.data.files || []
    currentPath.value = path
    pathInput.value = path
  } catch (e) {
    // 错误已处理
  } finally {
    loading.value = false
  }
}

function navigateTo(path: string) {
  loadDirectory(path.startsWith('/') ? path : '/' + path)
}

function goUp() {
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  navigateTo('/' + parts.join('/'))
}

function refresh() {
  loadDirectory(currentPath.value)
}

function handleRowDblClick(row: FileInfo) {
  if (row.type === 'directory') {
    const newPath = currentPath.value === '/'
      ? '/' + row.name
      : currentPath.value + '/' + row.name
    navigateTo(newPath)
  }
}

function handleContextMenu(row: FileInfo, column: any, event: Event) {
  event.preventDefault()
  // 可以添加右键菜单
}

async function downloadFile(file: FileInfo) {
  try {
    const fullPath = currentPath.value === '/'
      ? '/' + file.name
      : currentPath.value + '/' + file.name

    const response = await fileApi.download(serverId.value, fullPath)
    const blob = new Blob([response as any])
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载已开始')
  } catch (e) {
    // 错误已处理
  }
}

async function deleteFile(file: FileInfo) {
  await ElMessageBox.confirm(
    `确定要删除 ${file.name} 吗？${file.type === 'directory' ? '（将删除该目录下所有文件）' : ''}`,
    '确认删除',
    { type: 'warning' }
  )

  try {
    const fullPath = currentPath.value === '/'
      ? '/' + file.name
      : currentPath.value + '/' + file.name

    await fileApi.delete(serverId.value, fullPath, file.type === 'directory')
    ElMessage.success('删除成功')
    refresh()
  } catch (e) {
    // 错误已处理
  }
}

// 新建文件夹
const showCreateFolderDialog = ref(false)
const newFolderName = ref('')
const creating = ref(false)

async function createFolder() {
  if (!newFolderName.value.trim()) {
    ElMessage.warning('请输入文件夹名称')
    return
  }

  creating.value = true
  try {
    const fullPath = currentPath.value === '/'
      ? '/' + newFolderName.value
      : currentPath.value + '/' + newFolderName.value

    await fileApi.createDirectory(serverId.value, fullPath)
    ElMessage.success('创建成功')
    showCreateFolderDialog.value = false
    newFolderName.value = ''
    refresh()
  } catch (e) {
    // 错误已处理
  } finally {
    creating.value = false
  }
}

// 重命名
const showRenameDialogFlag = ref(false)
const renamingFile = ref<FileInfo | null>(null)
const newName = ref('')
const renaming = ref(false)

function showRenameDialog(file: FileInfo) {
  renamingFile.value = file
  newName.value = file.name
  showRenameDialogFlag.value = true
}

async function renameFile() {
  if (!newName.value.trim() || !renamingFile.value) {
    ElMessage.warning('请输入新名称')
    return
  }

  renaming.value = true
  try {
    const oldPath = currentPath.value === '/'
      ? '/' + renamingFile.value.name
      : currentPath.value + '/' + renamingFile.value.name

    const newPath = currentPath.value === '/'
      ? '/' + newName.value
      : currentPath.value + '/' + newName.value

    await fileApi.rename(serverId.value, oldPath, newPath)
    ElMessage.success('重命名成功')
    showRenameDialogFlag.value = false
    refresh()
  } catch (e) {
    // 错误已处理
  } finally {
    renaming.value = false
  }
}

// 上传
async function handleUpload(options: any) {
  const file = options.file

  try {
    await fileApi.upload(serverId.value, currentPath.value + '/', file)
    ElMessage.success(`${file.name} 上传成功`)
    refresh()
  } catch (e) {
    // 错误已处理
  }
}

onMounted(async () => {
  if (!server.value) {
    await serversStore.fetchServers()
  }
  loadDirectory('/')
})
</script>

<style lang="scss" scoped>
.file-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.file-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--tech-primary);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.path-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-darker);
  border-bottom: 1px solid var(--border-color);

  :deep(.el-breadcrumb) {
    .el-breadcrumb__item {
      cursor: pointer;

      &:hover .el-breadcrumb__inner {
        color: var(--tech-primary);
      }
    }

    .el-breadcrumb__inner {
      color: #8b95a5;
      transition: color 0.3s;
    }
  }

  .path-input {
    width: 300px;
  }
}

.file-list {
  flex: 1;
  overflow: auto;
}

.file-table {
  :deep(.el-table__row) {
    cursor: pointer;
  }
}

.file-icon {
  &.directory {
    color: var(--tech-primary);
  }

  &.file {
    color: #8b95a5;
  }
}

.file-name {
  font-size: 14px;
}

.permissions {
  font-family: var(--font-mono);
  font-size: 12px;
  color: #8b95a5;
  background: var(--bg-darker);
  padding: 2px 6px;
  border-radius: 4px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #8b95a5;

  .el-icon {
    margin-bottom: 12px;
    opacity: 0.3;
  }
}
</style>
