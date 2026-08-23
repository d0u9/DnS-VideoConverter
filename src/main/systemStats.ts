import si from 'systeminformation'
import type { NetworkInterfaceInfo, SystemStats } from '@shared/systemStats'

export type { SystemStats, NetworkInterfaceInfo }

export async function listNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> {
  const nets = await si.networkInterfaces()
  const list = Array.isArray(nets) ? nets : [nets]
  return list.map((n) => ({
    iface: n.iface,
    ip4: n.ip4 ?? '',
    ip6: n.ip6 ?? '',
    operstate: n.operstate ?? ''
  }))
}

export function startStatsPolling(
  onStats: (stats: SystemStats) => void,
  getIface: () => string,
  intervalMs = 1500
): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  const tick = async (): Promise<void> => {
    try {
      const iface = getIface()
      const [load, nets] = await Promise.all([si.currentLoad(), si.networkStats(iface || '*')])
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
