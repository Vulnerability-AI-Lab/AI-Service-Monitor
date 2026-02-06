import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api'
import type { User } from '@/types'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isOperator = computed(() => ['admin', 'operator'].includes(user.value?.role || ''))

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res: any = await authApi.login(username, password)
      token.value = res.data.token
      user.value = res.data.user
      localStorage.setItem('token', res.data.token)
      return true
    } catch {
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    router.push('/login')
  }

  async function checkAuth() {
    if (!token.value) return

    try {
      const res: any = await authApi.getProfile()
      user.value = res.data
    } catch {
      logout()
    }
  }

  async function refreshToken() {
    try {
      const res: any = await authApi.refresh()
      token.value = res.data.token
      localStorage.setItem('token', res.data.token)
    } catch {
      logout()
    }
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    isAdmin,
    isOperator,
    login,
    logout,
    checkAuth,
    refreshToken
  }
})
