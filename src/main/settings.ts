import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Settings } from '@shared/settings'

export type { Settings }

const DEFAULT_SETTINGS: Settings = {
  ffmpegPath: '',
  ffprobePath: '',
  defaultCrf: 20,
  defaultResolution: 'original',
  remoteBrowseRoots: [homedir()],
  remoteServerPort: 47856
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  const file = settingsPath()
  if (!existsSync(file)) {
    return { ...DEFAULT_SETTINGS }
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}
