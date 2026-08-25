import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** Returns false when the socket was not usable, so the command was not sent. */
  sendCmd: (cmd: RemoteCommand) => boolean
}

// The desktop sends a heartbeat every 5s (plus stats twice as often). Going
// this long without a single byte means the connection is gone even though the
// browser still reports it as OPEN — a half-open socket after sleep or a
// network change swallows everything sent through it, which is what makes
// buttons look dead.
const STALE_AFTER_MS = 15000
const LIVENESS_CHECK_MS = 4000

export function useRemoteConnection(): RemoteConnection {
  const [state, setState] = useState<RemoteState>({
    connected: false,
    appVersion: null,
    tasks: {},
    order: [],
    stats: null
  })

  const wsRef = useRef<WebSocket | null>(null)
  const lastMessageRef = useRef(Date.now())
  // Lets sendCmd and the visibility handler force a fresh connection without
  // re-subscribing the whole effect.
  const reconnectRef = useRef<() => void>(() => {})

  useEffect(() => {
    let stopped = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect(): void {
      if (stopped) return
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const previous = wsRef.current
      if (previous && previous.readyState !== WebSocket.CLOSED) {
        // Drop the old socket silently: its onclose must not schedule a second
        // reconnect on top of the one we are making right now — but the page
        // must still read as offline until the replacement is up.
        previous.onclose = null
        previous.onmessage = null
        previous.onerror = null
        previous.close()
        setState((s) => (s.connected ? { ...s, connected: false } : s))
      }
      lastMessageRef.current = Date.now()
      const proto = location.protocol === 'https:' ? 'wss://' : 'ws://'
      const ws = new WebSocket(proto + location.host + '/ws')
      wsRef.current = ws

      ws.onopen = () => {
        lastMessageRef.current = Date.now()
        setState((s) => ({ ...s, connected: true }))
      }

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }))
        if (!stopped) reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (ev) => {
        lastMessageRef.current = Date.now()
        const msg = JSON.parse(ev.data) as RemoteServerMessage
        if (msg.type === 'heartbeat') return
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

    reconnectRef.current = connect
    connect()

    const isStale = (): boolean => Date.now() - lastMessageRef.current > STALE_AFTER_MS

    const liveness = setInterval(() => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN && isStale()) connect()
    }, LIVENESS_CHECK_MS)

    // Waking a phone or laptop resumes timers late; check straight away rather
    // than waiting up to a full interval before noticing the socket is dead.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && isStale()) connect()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearInterval(liveness)
      document.removeEventListener('visibilitychange', onVisible)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])

  const sendCmd = useCallback((cmd: RemoteCommand): boolean => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Don't drop the click on the floor — show the page as disconnected and
      // start reconnecting so the user knows why nothing happened.
      setState((s) => (s.connected ? { ...s, connected: false } : s))
      reconnectRef.current()
      return false
    }
    ws.send(JSON.stringify(cmd))
    return true
  }, [])

  return { state, sendCmd }
}
