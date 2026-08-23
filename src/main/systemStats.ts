import si from 'systeminformation'
import type { SystemStats } from '@shared/systemStats'

export type { SystemStats }

export function startStatsPolling(
  onStats: (stats: SystemStats) => void,
  intervalMs = 1500
): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  const tick = async (): Promise<void> => {
    try {
      const [load, nets] = await Promise.all([si.currentLoad(), si.networkStats('*')])
      if (stopped) return

      const netRxBps = nets.reduce((sum, n) => sum + (n.rx_sec ?? 0), 0)
      const netTxBps = nets.reduce((sum, n) => sum + (n.tx_sec ?? 0), 0)

      onStats({ cpuPercent: load.currentLoad, netRxBps, netTxBps })
    } catch {
      // transient — skip this tick
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
  }

  tick()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
