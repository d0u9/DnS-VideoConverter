export interface SystemStats {
  cpuPercent: number
  netRxBps: number
  netTxBps: number
}

export interface NetworkInterfaceInfo {
  iface: string
  ip4: string
  ip6: string
  operstate: string
}
