import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ConvertDoneResult, ConvertProgress } from '@shared/convertTypes'

export type { ConvertProgress }

export interface ConvertHandlers {
  onLog: (line: string) => void
  onProgress: (progress: ConvertProgress) => void
  onDone: (result: ConvertDoneResult) => void
}

interface Job {
  child: ChildProcessWithoutNullStreams
  killTimer: NodeJS.Timeout | null
}

// Keyed by taskId so each browser tab can run its own conversion concurrently.
const jobs = new Map<string, Job>()

export function isConverting(taskId: string): boolean {
  return jobs.has(taskId)
}

export function startConversion(
  taskId: string,
  ffmpegPath: string,
  args: string[],
  durationSec: number | null,
  handlers: ConvertHandlers
): void {
  if (jobs.has(taskId)) {
    handlers.onDone({ success: false, code: null, error: 'A conversion is already running.' })
    return
  }

  const fullArgs = ['-y', '-progress', 'pipe:1', '-nostats', ...args]

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(ffmpegPath, fullArgs)
  } catch (err) {
    handlers.onDone({
      success: false,
      code: null,
      error: `Failed to launch ffmpeg: ${(err as Error).message}`
    })
    return
  }

  const job: Job = { child, killTimer: null }
  jobs.set(taskId, job)

  let stderrTail = ''
  let progressBuf: Record<string, string> = {}
  let stdoutRemainder = ''

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutRemainder += chunk.toString()
    const lines = stdoutRemainder.split('\n')
    stdoutRemainder = lines.pop() ?? ''

    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      progressBuf[key] = value

      if (key === 'progress') {
        const outTimeUs = Number(progressBuf['out_time_us'])
        const outTimeSec = Number.isFinite(outTimeUs) ? outTimeUs / 1_000_000 : null
        const percent =
          durationSec && outTimeSec !== null
            ? Math.max(0, Math.min(100, (outTimeSec / durationSec) * 100))
            : null

        handlers.onProgress({
          percent,
          outTimeSec,
          speed: progressBuf['speed'] ?? null,
          fps: progressBuf['fps'] ?? null
        })

        progressBuf = {}
      }
    }
  })

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stderrTail = (stderrTail + text).slice(-4000)
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length > 0) handlers.onLog(line)
    }
  })

  child.on('error', (err) => {
    jobs.delete(taskId)
    handlers.onDone({ success: false, code: null, error: `ffmpeg error: ${err.message}` })
  })

  child.on('exit', (code) => {
    jobs.delete(taskId)
    if (job.killTimer) clearTimeout(job.killTimer)
    handlers.onDone({
      success: code === 0,
      code,
      error: code === 0 ? undefined : stderrTail.trim() || `ffmpeg exited with code ${code}`
    })
  })
}

export function cancelConversion(taskId: string): void {
  const job = jobs.get(taskId)
  if (!job) return

  try {
    job.child.stdin.write('q\n')
  } catch {
    // ignore — fall through to hard kill below
  }

  job.killTimer = setTimeout(() => {
    job.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL')
  }, 3000)
}
