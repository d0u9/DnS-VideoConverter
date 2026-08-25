import { spawn } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'

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

function candidateDirectories(): string[] {
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const platformDirs =
    process.platform === 'darwin'
      ? [
          '/opt/homebrew/bin',
          '/opt/homebrew/opt/ffmpeg/bin',
          '/usr/local/bin',
          '/usr/local/opt/ffmpeg/bin',
          '/opt/local/bin', // MacPorts
          '/opt/pkg/bin', // pkgsrc
          '/usr/bin'
        ]
      : process.platform === 'win32'
        ? [
            join(process.env.ProgramData ?? 'C:\\ProgramData', 'chocolatey', 'bin'),
            join(homedir(), 'scoop', 'apps', 'ffmpeg', 'current', 'bin'),
            join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links')
          ]
        : ['/usr/local/bin', '/usr/bin', '/snap/bin', join(homedir(), '.local', 'bin')]

  return [...new Set([...platformDirs, ...fromPath])]
}

async function findCandidate(name: 'ffmpeg' | 'ffprobe'): Promise<string> {
  const bare = process.platform === 'win32' ? `${name}.exe` : name
  if (await tryRun(bare)) return bare

  for (const dir of candidateDirectories()) {
    const full = join(dir, bare)
    if (await tryRun(full)) return full
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
