import { useEffect, useRef, useState } from 'react'
import type { RemoteCommand, RemoteServerMessage, RemoteTaskSnapshot } from '@shared/remoteTypes'
import type { SystemStats } from '@shared/systemStats'

export interface RemoteState {
  connected: boolean
  appVersion: string | null
  tasks: Record<string, RemoteTaskSnapshot>
  order: string[]
  stats: SystemStats | null
}

export interface RemoteConnection {
  state: RemoteState
  sendCmd: (cmd: RemoteCommand) => void
}

export function useRemoteConnection(): RemoteConnection {
  const [state, setState] = useState<RemoteState>({
    connected: false,
    appVersion: null,
    tasks: {},
    order: [],
    stats: null
  })

  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let stopped = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect(): void {
      if (stopped) return
      const proto = location.protocol === 'https:' ? 'wss://' : 'ws://'
      const ws = new WebSocket(proto + location.host + '/ws')
      wsRef.current = ws

      ws.onopen = () => setState((s) => ({ ...s, connected: true }))

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }))
        if (!stopped) reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as RemoteServerMessage
        if (msg.type === 'hello') {
          setState((s) => ({ ...s, appVersion: msg.appVersion }))
        } else if (msg.type === 'snapshot') {
          const tasks: Record<string, RemoteTaskSnapshot> = {}
          const order: string[] = []
          for (const t of msg.tasks) {
            tasks[t.taskId] = t
            order.push(t.taskId)
          }
          setState((s) => ({ ...s, tasks, order }))
        } else if (msg.type === 'update') {
          setState((s) => {
            const exists = msg.task.taskId in s.tasks
            return {
              ...s,
              tasks: { ...s.tasks, [msg.task.taskId]: msg.task },
              order: exists ? s.order : [...s.order, msg.task.taskId]
            }
          })
        } else if (msg.type === 'remove') {
          setState((s) => {
            const tasks = { ...s.tasks }
            delete tasks[msg.taskId]
            return { ...s, tasks, order: s.order.filter((id) => id !== msg.taskId) }
          })
        } else if (msg.type === 'stats') {
          setState((s) => ({
            ...s,
            stats: { cpuPercent: msg.cpuPercent, netRxBps: msg.netRxBps, netTxBps: msg.netTxBps }
          }))
        }
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])

  const sendCmd = (cmd: RemoteCommand): void => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd))
  }

  return { state, sendCmd }
}
