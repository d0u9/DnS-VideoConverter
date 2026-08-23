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
  // Compute rx/tx rate ourselves from cumulative byte counters rather than
  // trusting systeminformation's own rx_sec/tx_sec — on Windows those come
  // from WMI counters that have been unreliable (often 0) across adapters,
  // whereas cumulative rx_bytes/tx_bytes are basic and far more consistently
  // populated everywhere.
  let lastSample: { time: number; rxBytes: number; txBytes: number } | null = null

  const tick = async (): Promise<void> => {
    try {
      const iface = getIface()
      const [load, nets0] = await Promise.all([si.currentLoad(), si.networkStats(iface || '*')])
      if (stopped) return

      // A configured interface that no longer exists (renamed/unplugged)
      // would otherwise silently report 0/0 forever — fall back to all.
      const nets = iface && nets0.length === 0 ? await si.networkStats('*') : nets0

      const rxBytes = nets.reduce((sum, n) => sum + (n.rx_bytes ?? 0), 0)
      const txBytes = nets.reduce((sum, n) => sum + (n.tx_bytes ?? 0), 0)
      const now = Date.now()

      let netRxBps = 0
      let netTxBps = 0
      if (lastSample && rxBytes >= lastSample.rxBytes && txBytes >= lastSample.txBytes) {
        const dtSec = (now - lastSample.time) / 1000
        if (dtSec > 0) {
          netRxBps = (rxBytes - lastSample.rxBytes) / dtSec
          netTxBps = (txBytes - lastSample.txBytes) / dtSec
        }
      }
      lastSample = { time: now, rxBytes, txBytes }

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
