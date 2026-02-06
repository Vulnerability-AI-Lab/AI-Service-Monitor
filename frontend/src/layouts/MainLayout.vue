<template>
  <div class="main-layout">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <el-icon :size="28" class="logo-icon"><Monitor /></el-icon>
          <span class="logo-text">服务器监控中心</span>
        </div>
      </div>

      <div class="header-center">
        <div class="status-overview">
          <div class="status-item">
            <span class="status-label">总计</span>
            <span class="status-value tech-number">{{ overview.total }}</span>
          </div>
          <div class="status-item online">
            <span class="status-indicator online"></span>
            <span class="status-label">在线</span>
            <span class="status-value">{{ overview.online }}</span>
          </div>
          <div class="status-item warning">
            <span class="status-indicator warning"></span>
            <span class="status-label">警告</span>
            <span class="status-value">{{ overview.warning }}</span>
          </div>
          <div class="status-item error">
            <span class="status-indicator error"></span>
            <span class="status-label">异常</span>
            <span class="status-value">{{ overview.error }}</span>
          </div>
          <div class="status-item offline">
            <span class="status-indicator offline"></span>
            <span class="status-label">离线</span>
            <span class="status-value">{{ overview.offline }}</span>
          </div>
        </div>
      </div>

      <div class="header-right">
        <span class="connection-status" :class="{ connected: wsConnected }">
          <el-icon><Connection /></el-icon>
          {{ wsConnected ? '已连接' : '未连接' }}
        </span>

        <el-dropdown @command="handleUserCommand">
          <div class="user-info">
            <el-avatar :size="32" class="avatar">
              {{ user?.username?.[0]?.toUpperCase() }}
            </el-avatar>
            <span class="username">{{ user?.username }}</span>
            <el-icon><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>个人信息
              </el-dropdown-item>
              <el-dropdown-item command="logout" divided>
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="main-content grid-bg">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { useWebSocketStore } from '@/stores/websocket'

const router = useRouter()
const authStore = useAuthStore()
const serversStore = useServersStore()
const wsStore = useWebSocketStore()

const user = computed(() => authStore.user)
const overview = computed(() => serversStore.overview)
const wsConnected = computed(() => wsStore.connected && wsStore.authenticated)

function handleUserCommand(command: string) {
  if (command === 'logout') {
    authStore.logout()
  }
}

onMounted(async () => {
  // 加载数据
  await Promise.all([
    serversStore.fetchOverview(),
    serversStore.fetchServers(),
    serversStore.fetchGroups()
  ])

  // 连接WebSocket
  wsStore.connect()

  // 定时刷新概览
  const intervalId = setInterval(() => {
    serversStore.fetchOverview()
  }, 10000)

  onUnmounted(() => {
    clearInterval(intervalId)
    wsStore.disconnect()
  })
})
</script>

<style lang="scss" scoped>
.main-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-dark);
}

.header {
  height: 60px;
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-darker) 100%);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--tech-primary), transparent);
    opacity: 0.5;
  }
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;

  .logo-icon {
    color: var(--tech-primary);
    filter: drop-shadow(0 0 10px var(--tech-primary));
  }

  .logo-text {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 2px;
  }
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.status-overview {
  display: flex;
  gap: 32px;

  .status-item {
    display: flex;
    align-items: center;
    gap: 8px;

    .status-label {
      color: #8b95a5;
      font-size: 13px;
    }

    .status-value {
      font-family: var(--font-mono);
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }

    &.online .status-value { color: var(--status-online); }
    &.warning .status-value { color: var(--status-warning); }
    &.error .status-value { color: var(--status-error); }
    &.offline .status-value { color: var(--status-offline); }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--status-offline);

  &.connected {
    color: var(--status-online);
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.3s;

  &:hover {
    background: var(--bg-card-hover);
  }

  .avatar {
    background: var(--gradient-primary);
  }

  .username {
    color: #e0e6ed;
    font-size: 14px;
  }
}

.main-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
