import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useServersStore } from './servers'
import type { ServerStatus } from '@/types'

export const useWebSocketStore = defineStore('websocket', () => {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const authenticated = ref(false)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const reconnectDelay = 3000

  const sshCallbacks = new Map<string, {
    onData: (data: string) => void
    onClose: () => void
    onError: (message: string) => void
  }>()

  function connect() {
    const token = localStorage.getItem('token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const wsPort = 8001 // WebSocket端口

    ws.value = new WebSocket(`${protocol}//${host}:${wsPort}`)

    ws.value.onopen = () => {
      console.log('WebSocket connected')
      connected.value = true
      reconnectAttempts.value = 0

      // 发送认证
      send({ type: 'auth', payload: { token } })
    }

    ws.value.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        handleMessage(message)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.value.onclose = () => {
      console.log('WebSocket disconnected')
      connected.value = false
      authenticated.value = false

      // 尝试重连
      if (reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++
        setTimeout(connect, reconnectDelay)
      }
    }

    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  function disconnect() {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    connected.value = false
    authenticated.value = false
  }

  function send(data: any) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(data))
    }
  }

  function handleMessage(message: any) {
    const { type, payload } = message
    const serversStore = useServersStore()

    switch (type) {
      case 'auth_success':
        authenticated.value = true
        // 订阅所有服务器状态
        send({ type: 'subscribe', payload: { channel: 'status', serverIds: [] } })
        break

      case 'auth_error':
        console.error('WebSocket auth error:', payload.message)
        authenticated.value = false
        break

      case 'status_update':
        serversStore.updateServerStatus(payload as ServerStatus)
        break

      case 'ssh_connected':
        // SSH连接成功，回调由组件处理
        break

      case 'ssh_output':
        const dataCallback = sshCallbacks.get(payload.sessionId)
        if (dataCallback) {
          dataCallback.onData(payload.data)
        }
        break

      case 'ssh_close':
        const closeCallback = sshCallbacks.get(payload.sessionId)
        if (closeCallback) {
          closeCallback.onClose()
          sshCallbacks.delete(payload.sessionId)
        }
        break

      case 'ssh_error':
        const errorCallback = sshCallbacks.get(payload.sessionId)
        if (errorCallback) {
          errorCallback.onError(payload.message)
        }
        break

      case 'pong':
        // 心跳响应
        break

      default:
        console.log('Unknown message type:', type)
    }
  }

  // SSH相关方法
  function connectSSH(
    serverId: number,
    cols: number,
    rows: number,
    callbacks: {
      onConnected: (sessionId: string) => void
      onData: (data: string) => void
      onClose: () => void
      onError: (message: string) => void
    }
  ) {
    return new Promise<string>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(event.data)
        if (message.type === 'ssh_connected' && message.payload.serverId === serverId) {
          const sessionId = message.payload.sessionId
          sshCallbacks.set(sessionId, {
            onData: callbacks.onData,
            onClose: callbacks.onClose,
            onError: callbacks.onError
          })
          callbacks.onConnected(sessionId)
          ws.value?.removeEventListener('message', handler)
          resolve(sessionId)
        } else if (message.type === 'ssh_error') {
          ws.value?.removeEventListener('message', handler)
          reject(new Error(message.payload.message))
        }
      }

      ws.value?.addEventListener('message', handler)
      send({ type: 'ssh_connect', payload: { serverId, cols, rows } })

      // 超时处理
      setTimeout(() => {
        ws.value?.removeEventListener('message', handler)
        reject(new Error('连接超时'))
      }, 15000)
    })
  }

  function sendSSHInput(sessionId: string, data: string) {
    send({ type: 'ssh_input', payload: { sessionId, data } })
  }

  function resizeSSH(sessionId: string, cols: number, rows: number) {
    send({ type: 'ssh_resize', payload: { sessionId, cols, rows } })
  }

  function closeSSH(sessionId: string) {
    send({ type: 'ssh_close', payload: { sessionId } })
    sshCallbacks.delete(sessionId)
  }

  // 心跳
  setInterval(() => {
    if (connected.value) {
      send({ type: 'ping' })
    }
  }, 30000)

  return {
    ws,
    connected,
    authenticated,
    connect,
    disconnect,
    send,
    connectSSH,
    sendSSHInput,
    resizeSSH,
    closeSSH
  }
})
