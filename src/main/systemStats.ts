import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import si from 'systeminformation'
import type { NetworkInterfaceInfo, SystemStats } from '@shared/systemStats'

export type { SystemStats, NetworkInterfaceInfo }

const execAsync = promisify(exec)

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

interface AdapterBytes {
  name: string
  rxBytes: number
  txBytes: number
}

// systeminformation's Windows networkStats() reads WMI perf counters
// (Win32_PerfRawData_Tcpip_NetworkInterface), which on some machines report
// 0 for every adapter regardless of real traffic (a known Windows perf-
// counter corruption issue) and normalize adapter names by stripping
// spaces, so they don't even match the names from networkInterfaces().
// Get-NetAdapterStatistics reads NDIS counters directly instead, which are
// far more reliably populated, and its Name field matches the adapter
// friendly names networkInterfaces() reports (e.g. "Ethernet 3").
async function getWindowsAdapterBytes(): Promise<AdapterBytes[]> {
  const { stdout } = await execAsync(
    'powershell -NoProfile -NonInteractive -Command "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress"',
    { timeout: 5000, windowsHide: true }
  )
  const trimmed = stdout.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((a) => ({
    name: String(a.Name),
    rxBytes: Number(a.ReceivedBytes) || 0,
    txBytes: Number(a.SentBytes) || 0
  }))
}

export async function debugNetworkStats(): Promise<string> {
  const [interfaces, statsAll, statsDefault, osInfo, windowsAdapterBytes] = await Promise.all([
    si.networkInterfaces().catch((e: Error) => ({ error: e.message })),
    si.networkStats('*').catch((e: Error) => ({ error: e.message })),
    si.networkStats().catch((e: Error) => ({ error: e.message })),
    si.osInfo().catch((e: Error) => ({ error: e.message })),
    process.platform === 'win32'
      ? getWindowsAdapterBytes().catch((e: Error) => ({ error: e.message }))
      : Promise.resolve('n/a — not Windows')
  ])
  return JSON.stringify({ osInfo, interfaces, statsAll, statsDefault, windowsAdapterBytes }, null, 2)
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

  const getBytes = async (iface: string): Promise<{ rxBytes: number; txBytes: number }> => {
    if (process.platform === 'win32') {
      const adapters = await getWindowsAdapterBytes()
      const filtered = iface ? adapters.filter((a) => a.name === iface) : adapters
      const list = iface && filtered.length === 0 ? adapters : filtered
      return {
        rxBytes: list.reduce((sum, a) => sum + a.rxBytes, 0),
        txBytes: list.reduce((sum, a) => sum + a.txBytes, 0)
      }
    }

    const nets0 = await si.networkStats(iface || '*')
    // A configured interface that no longer exists (renamed/unplugged)
    // would otherwise silently report 0/0 forever — fall back to all.
    const nets = iface && nets0.length === 0 ? await si.networkStats('*') : nets0
    return {
      rxBytes: nets.reduce((sum, n) => sum + (n.rx_bytes ?? 0), 0),
      txBytes: nets.reduce((sum, n) => sum + (n.tx_bytes ?? 0), 0)
    }
  }

  const tick = async (): Promise<void> => {
    try {
      const iface = getIface()
      const [load, { rxBytes, txBytes }] = await Promise.all([si.currentLoad(), getBytes(iface)])
      if (stopped) return

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
