export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—'
  const total = Math.max(0, Math.round(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1000)))
  const value = bytes / 1000 ** i
  return `${i === 0 ? value : value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`
}

export function formatBitrate(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps)) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`
  return `${Math.round(bps / 1000)} kbps`
}

export function basenameNoExt(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  const name = parts[parts.length - 1] ?? filePath
  return name.replace(/\.[^/.]+$/, '')
}

export function dirname(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx === -1 ? '' : filePath.slice(0, idx)
}

export function joinPath(dir: string, file: string): string {
  if (!dir) return file
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir.endsWith(sep) ? `${dir}${file}` : `${dir}${sep}${file}`
}

/** Default output path: <input's folder>/dns-output/<input basename>.mp4 */
export function defaultOutputPath(inputPath: string): string {
  const outDir = joinPath(dirname(inputPath), 'dns-output')
  return joinPath(outDir, `${basenameNoExt(inputPath)}.mp4`)
}

export function quoteArg(arg: string): string {
  if (/^[\w./:\\-]+$/.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}
