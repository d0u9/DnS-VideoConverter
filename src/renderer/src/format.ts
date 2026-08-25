export { formatDuration, formatBytes, formatBitrate } from '@shared/format'

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

/** Default output path: <input folder>/dns-output-<crf>/<input basename>.mp4 */
export function defaultOutputPath(inputPath: string, crf: string | number): string {
  const crfSuffix = String(crf).trim().replace(/[^0-9.]+/g, '_') || 'unknown'
  const outDir = joinPath(dirname(inputPath), `dns-output-${crfSuffix}`)
  return joinPath(outDir, `${basenameNoExt(inputPath)}.mp4`)
}

export function quoteArg(arg: string): string {
  if (/^[\w./:\\-]+$/.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}
