import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings, type Settings } from './settings'
import { autoDetectBinaries, checkBinary } from './binaries'
import { probeVideo, ProbeError } from './probe'
import { startConversion, cancelConversion, isConverting } from './convert'
import {
  buildFfmpegPlan,
  buildFfmpegCommandArgs,
  FfmpegPlanError,
  type ConvertOptions
} from '../shared/ffmpegPlan'
import { startStatsPolling } from './systemStats'
import {
  startRemoteServer,
  stopRemoteServer,
  isRunning as isRemoteServerRunning,
  getUrl as remoteServerUrl,
  updateTaskSnapshot,
  removeTaskSnapshot,
  onRemoteCommand,
  broadcastStats
} from './remoteServer'
import type { RemoteTaskSnapshot } from '../shared/remoteTypes'

const isMac = process.platform === 'darwin'
const REMOTE_SERVER_PORT = 47856

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: !isMac,
    ...(isMac ? {} : { icon }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => {
    const settings = loadSettings()

    if (!settings.ffmpegPath || !settings.ffprobePath) {
      const detected = await autoDetectBinaries()
      settings.ffmpegPath ||= detected.ffmpegPath
      settings.ffprobePath ||= detected.ffprobePath
      saveSettings(settings)
    }

    return settings
  })

  ipcMain.handle('settings:set', async (_e, partial: Partial<Settings>) => {
    const current = loadSettings()
    const next = { ...current, ...partial }
    saveSettings(next)
    return next
  })

  ipcMain.handle('binaries:check', async (_e, binPath: string) => checkBinary(binPath))

  const openDialogFor = (
    e: Electron.IpcMainInvokeEvent,
    options: Electron.OpenDialogOptions
  ): Promise<Electron.OpenDialogReturnValue> => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)
  }

  const saveDialogFor = (
    e: Electron.IpcMainInvokeEvent,
    options: Electron.SaveDialogOptions
  ): Promise<Electron.SaveDialogReturnValue> => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
  }

  ipcMain.handle('binaries:pick', async (e, kind: 'ffmpeg' | 'ffprobe') => {
    const result = await openDialogFor(e, {
      title: `Select ${kind}${isMac ? '' : '.exe'}`,
      properties: ['openFile'],
      filters: isMac ? undefined : [{ name: 'Executable', extensions: ['exe'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFolder', async (e) => {
    const result = await openDialogFor(e, {
      title: 'Select folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectInput', async (e) => {
    const result = await openDialogFor(e, {
      title: 'Select input video',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video',
          extensions: ['mkv', 'mp4', 'mov', 'avi', 'webm', 'm4v', 'ts', 'wmv', 'flv']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectOutput', async (e, defaultPath: string) => {
    const result = await saveDialogFor(e, {
      title: 'Save converted video as',
      defaultPath,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('dialog:confirmOverwrite', async (e, outputPath: string) => {
    if (!existsSync(outputPath)) return true

    const parent = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Cancel', 'Overwrite'],
      defaultId: 0,
      cancelId: 0,
      message: 'File already exists',
      detail: `${outputPath}\n\nDo you want to overwrite it?`
    }
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
    return result.response === 1
  })

  ipcMain.handle('probe:run', async (_e, ffprobePath: string, inputPath: string) => {
    try {
      return { ok: true as const, data: await probeVideo(ffprobePath, inputPath) }
    } catch (err) {
      const message = err instanceof ProbeError ? err.message : (err as Error).message
      return { ok: false as const, error: message }
    }
  })

  ipcMain.handle(
    'plan:build',
    (_e, probe: Parameters<typeof buildFfmpegPlan>[0], opts: ConvertOptions) => {
      try {
        return { ok: true as const, data: buildFfmpegPlan(probe, opts) }
      } catch (err) {
        const message = err instanceof FfmpegPlanError ? err.message : (err as Error).message
        return { ok: false as const, error: message }
      }
    }
  )

  ipcMain.handle(
    'convert:start',
    (
      e,
      params: {
        taskId: string
        ffmpegPath: string
        inputPath: string
        outputPath: string
        plan: Parameters<typeof buildFfmpegCommandArgs>[2]
        durationSec: number | null
      }
    ) => {
      if (isConverting(params.taskId)) {
        return { ok: false as const, error: 'A conversion is already running.' }
      }
      // Bare command names (e.g. "ffmpeg") are resolved via PATH by the OS; only
      // reject when an absolute path was given and it clearly doesn't exist.
      if (path.isAbsolute(params.ffmpegPath) && !existsSync(params.ffmpegPath)) {
        return { ok: false as const, error: `ffmpeg not found at: ${params.ffmpegPath}` }
      }

      mkdirSync(path.dirname(params.outputPath), { recursive: true })

      const args = buildFfmpegCommandArgs(params.inputPath, params.outputPath, params.plan)
      const sender = e.sender
      const taskId = params.taskId

      startConversion(taskId, params.ffmpegPath, args, params.durationSec, {
        onLog: (line) => sender.send('convert:log', { taskId, line }),
        onProgress: (progress) => sender.send('convert:progress', { taskId, progress }),
        onDone: (result) => {
          let outputSizeBytes: number | undefined
          if (result.success) {
            try {
              outputSizeBytes = statSync(params.outputPath).size
            } catch {
              // non-fatal — just omit the size
            }
          }
          sender.send('convert:done', { taskId, result: { ...result, outputSizeBytes } })
        }
      })

      return { ok: true as const, args }
    }
  )

  ipcMain.handle('convert:cancel', (_e, taskId: string) => {
    cancelConversion(taskId)
    return true
  })

  ipcMain.handle('shell:showInFolder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('server:setEnabled', async (_e, enabled: boolean) => {
    if (enabled) {
      const { url } = await startRemoteServer(REMOTE_SERVER_PORT)
      return { enabled: true, url }
    }
    stopRemoteServer()
    return { enabled: false, url: null }
  })

  ipcMain.handle('server:getStatus', () => ({
    enabled: isRemoteServerRunning(),
    url: remoteServerUrl()
  }))

  ipcMain.on('server:pushState', (_e, snapshot: RemoteTaskSnapshot) => {
    updateTaskSnapshot(snapshot)
  })

  ipcMain.on('server:removeState', (_e, taskId: string) => {
    removeTaskSnapshot(taskId)
  })
}

app.whenReady().then(() => {
  // In dev, the app has no bundled .icns yet — brand the Dock icon manually.
  if (isMac && !app.isPackaged) app.dock?.setIcon(icon)

  createMenu()
  registerIpc()
  createWindow()

  onRemoteCommand((cmd) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('server:command', cmd)
    }
  })

  startStatsPolling((stats) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('system:stats', stats)
    }
    broadcastStats(stats)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopRemoteServer()
  if (!isMac) app.quit()
})
