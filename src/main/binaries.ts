import { spawn } from 'node:child_process'

function tryRun(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, ['-version'])
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

const MAC_CANDIDATES = ['/opt/homebrew/bin', '/usr/local/bin']

async function findCandidate(name: 'ffmpeg' | 'ffprobe'): Promise<string> {
  const bare = process.platform === 'win32' ? `${name}.exe` : name
  if (await tryRun(bare)) return bare

  if (process.platform === 'darwin') {
    for (const dir of MAC_CANDIDATES) {
      const full = `${dir}/${name}`
      if (await tryRun(full)) return full
    }
  }

  return ''
}

export async function autoDetectBinaries(): Promise<{ ffmpegPath: string; ffprobePath: string }> {
  const [ffmpegPath, ffprobePath] = await Promise.all([
    findCandidate('ffmpeg'),
    findCandidate('ffprobe')
  ])
  return { ffmpegPath, ffprobePath }
}

export async function checkBinary(binPath: string): Promise<boolean> {
  if (!binPath.trim()) return false
  return tryRun(binPath)
}
