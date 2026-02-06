<template>
  <div class="terminal-page">
    <!-- 顶部工具栏 -->
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <el-button text @click="$router.push(`/server/${serverId}`)">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="terminal-title">
          <el-icon><Monitor /></el-icon>
          SSH终端 - {{ server?.name }} ({{ server?.ip }})
        </span>
      </div>
      <div class="toolbar-right">
        <span class="connection-status" :class="{ connected: isConnected }">
          <el-icon><Connection /></el-icon>
          {{ isConnected ? '已连接' : '未连接' }}
        </span>
        <el-button size="small" @click="reconnect" :disabled="isConnected">
          <el-icon><Refresh /></el-icon>
          重新连接
        </el-button>
        <el-button size="small" @click="clearTerminal">
          <el-icon><Delete /></el-icon>
          清屏
        </el-button>
        <el-button size="small" @click="toggleFullscreen">
          <el-icon><FullScreen /></el-icon>
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </el-button>
      </div>
    </div>

    <!-- 终端容器 -->
    <div class="terminal-container" ref="terminalContainer">
      <div class="terminal-wrapper" ref="terminalWrapper"></div>
      <div v-if="!isConnected" class="terminal-overlay">
        <div class="connecting-spinner" v-if="connecting">
          <div class="tech-loading"></div>
          <p>正在连接...</p>
        </div>
        <div class="connect-error" v-else-if="error">
          <el-icon :size="48"><WarningFilled /></el-icon>
          <p>{{ error }}</p>
          <el-button type="primary" @click="connect">重新连接</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useServersStore } from '@/stores/servers'
import { useWebSocketStore } from '@/stores/websocket'

const route = useRoute()
const serversStore = useServersStore()
const wsStore = useWebSocketStore()

const serverId = computed(() => Number(route.params.id))
const server = computed(() => serversStore.servers.get(serverId.value))

const terminalContainer = ref<HTMLElement>()
const terminalWrapper = ref<HTMLElement>()

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let sessionId: string | null = null

const isConnected = ref(false)
const connecting = ref(false)
const error = ref('')
const isFullscreen = ref(false)

function initTerminal() {
  if (!terminalWrapper.value) return

  terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 14,
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    theme: {
      background: '#0a0e17',
      foreground: '#e0e6ed',
      cursor: '#00d4ff',
      cursorAccent: '#0a0e17',
      selectionBackground: 'rgba(0, 212, 255, 0.3)',
      black: '#1a2744',
      red: '#ff4757',
      green: '#00ff88',
      yellow: '#ffaa00',
      blue: '#00d4ff',
      magenta: '#ff6b9d',
      cyan: '#00d4ff',
      white: '#e0e6ed',
      brightBlack: '#6c7a89',
      brightRed: '#ff6b81',
      brightGreen: '#7bed9f',
      brightYellow: '#ffc048',
      brightBlue: '#70a1ff',
      brightMagenta: '#ff85a1',
      brightCyan: '#70d4ff',
      brightWhite: '#ffffff'
    },
    scrollback: 10000,
    allowProposedApi: true
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())

  terminal.open(terminalWrapper.value)

  nextTick(() => {
    fitAddon?.fit()
  })

  // 监听输入
  terminal.onData((data) => {
    if (isConnected.value && sessionId) {
      wsStore.sendSSHInput(sessionId, data)
    }
  })

  // 监听resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
    if (isConnected.value && sessionId && terminal) {
      wsStore.resizeSSH(sessionId, terminal.cols, terminal.rows)
    }
  })
  resizeObserver.observe(terminalWrapper.value)

  return () => {
    resizeObserver.disconnect()
  }
}

async function connect() {
  if (!terminal) return

  connecting.value = true
  error.value = ''

  try {
    sessionId = await wsStore.connectSSH(
      serverId.value,
      terminal.cols,
      terminal.rows,
      {
        onConnected: (id) => {
          sessionId = id
          isConnected.value = true
          connecting.value = false
          terminal?.focus()
        },
        onData: (data) => {
          terminal?.write(data)
        },
        onClose: () => {
          isConnected.value = false
          terminal?.write('\r\n\x1b[33m连接已关闭\x1b[0m\r\n')
        },
        onError: (message) => {
          error.value = message
          terminal?.write(`\r\n\x1b[31m错误: ${message}\x1b[0m\r\n`)
        }
      }
    )
  } catch (e) {
    connecting.value = false
    error.value = (e as Error).message
  }
}

function reconnect() {
  if (sessionId) {
    wsStore.closeSSH(sessionId)
    sessionId = null
  }
  isConnected.value = false
  error.value = ''
  connect()
}

function clearTerminal() {
  terminal?.clear()
}

function toggleFullscreen() {
  if (!terminalContainer.value) return

  if (!isFullscreen.value) {
    terminalContainer.value.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

onMounted(async () => {
  // 确保服务器数据已加载
  if (!server.value) {
    await serversStore.fetchServers()
  }

  // 初始化终端
  const cleanup = initTerminal()

  // 监听全屏变化
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
    nextTick(() => {
      fitAddon?.fit()
    })
  })

  // 确保WebSocket已连接
  if (!wsStore.connected) {
    wsStore.connect()
  }

  // 等待WebSocket认证完成
  const checkAuth = setInterval(() => {
    if (wsStore.authenticated) {
      clearInterval(checkAuth)
      connect()
    }
  }, 100)

  // 3秒后如果还没认证成功，显示错误
  setTimeout(() => {
    if (!wsStore.authenticated) {
      clearInterval(checkAuth)
      error.value = 'WebSocket连接失败'
      connecting.value = false
    }
  }, 3000)

  onUnmounted(() => {
    cleanup?.()
    if (sessionId) {
      wsStore.closeSSH(sessionId)
    }
    terminal?.dispose()
  })
})
</script>

<style lang="scss" scoped>
.terminal-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-darker);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.terminal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.terminal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--tech-primary);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--status-error);
  padding: 4px 12px;
  background: rgba(255, 71, 87, 0.1);
  border-radius: 12px;

  &.connected {
    color: var(--status-online);
    background: rgba(0, 255, 136, 0.1);
  }
}

.terminal-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.terminal-wrapper {
  width: 100%;
  height: 100%;
  padding: 12px;

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 4px;
    }
  }
}

.terminal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 23, 0.9);
  z-index: 10;
}

.connecting-spinner {
  text-align: center;

  p {
    margin-top: 16px;
    color: var(--tech-primary);
  }
}

.connect-error {
  text-align: center;
  color: #8b95a5;

  .el-icon {
    color: var(--status-error);
    margin-bottom: 16px;
  }

  p {
    margin-bottom: 16px;
    color: var(--status-error);
  }
}
</style>
