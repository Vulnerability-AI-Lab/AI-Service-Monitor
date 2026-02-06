<template>
  <div class="app-container" :class="{ 'dark': true }">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  // 检查登录状态
  authStore.checkAuth()
})
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  background: var(--bg-dark);
}
</style>
