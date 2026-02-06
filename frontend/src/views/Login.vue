<template>
  <div class="login-page">
    <!-- 动态背景 -->
    <div class="bg-animation">
      <div class="grid-lines"></div>
      <div class="particles" v-for="i in 50" :key="i" :style="particleStyle(i)"></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-container">
      <div class="login-card tech-card">
        <div class="card-header">
          <el-icon :size="48" class="logo-icon"><Monitor /></el-icon>
          <h1 class="title">服务器监控中心</h1>
          <p class="subtitle">Server Monitor Control Center</p>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="用户名"
              size="large"
              :prefix-icon="User"
              class="tech-input"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              class="tech-input"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              <span v-if="!loading">登 录</span>
              <span v-else>登录中...</span>
            </el-button>
          </el-form-item>
        </el-form>

        <div class="login-footer">
          <span class="hint">默认账号: admin / admin123</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, FormInstance } from 'element-plus'
import { User, Lock, Monitor } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  const success = await authStore.login(form.username, form.password)
  loading.value = false

  if (success) {
    ElMessage.success('登录成功')
    router.push('/')
  } else {
    ElMessage.error('用户名或密码错误')
  }
}

function particleStyle(i: number) {
  return {
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 5}s`,
    animationDuration: `${3 + Math.random() * 4}s`
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-darker);
  position: relative;
  overflow: hidden;
}

.bg-animation {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    animation: gridMove 20s linear infinite;
  }

  .particles {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--tech-primary);
    border-radius: 50%;
    opacity: 0;
    animation: particleFloat 5s ease-in-out infinite;
  }
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(60px, 60px); }
}

@keyframes particleFloat {
  0%, 100% {
    opacity: 0;
    transform: translateY(0) scale(0);
  }
  50% {
    opacity: 0.8;
    transform: translateY(-100px) scale(1);
  }
}

.login-container {
  z-index: 1;
}

.login-card {
  width: 420px;
  padding: 48px 40px;
  background: rgba(13, 20, 33, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.5),
    0 0 80px rgba(0, 212, 255, 0.1);

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--gradient-primary);
  }
}

.card-header {
  text-align: center;
  margin-bottom: 40px;

  .logo-icon {
    color: var(--tech-primary);
    margin-bottom: 16px;
    filter: drop-shadow(0 0 20px var(--tech-primary));
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .title {
    font-size: 24px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 8px;
    letter-spacing: 2px;
  }

  .subtitle {
    font-size: 12px;
    color: #6c7a89;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
}

@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 20px var(--tech-primary)); }
  50% { filter: drop-shadow(0 0 30px var(--tech-primary-light)); }
}

.login-form {
  :deep(.el-form-item) {
    margin-bottom: 24px;
  }

  :deep(.el-input__wrapper) {
    background: var(--bg-darker) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px;
    height: 48px;
    transition: all 0.3s ease;

    &:hover, &.is-focus {
      border-color: var(--tech-primary) !important;
      box-shadow: 0 0 15px rgba(0, 212, 255, 0.2) !important;
    }
  }

  :deep(.el-input__inner) {
    color: #e0e6ed;
    font-size: 15px;

    &::placeholder {
      color: #6c7a89;
    }
  }

  :deep(.el-input__prefix) {
    color: var(--tech-primary);
  }
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 4px;
  background: var(--gradient-primary);
  border: none;
  border-radius: 8px;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 212, 255, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
}

.login-footer {
  text-align: center;
  margin-top: 24px;

  .hint {
    font-size: 12px;
    color: #6c7a89;
  }
}
</style>
