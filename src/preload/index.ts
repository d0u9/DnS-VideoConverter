import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ConvertOptions, FfmpegPlan, ProbeResult } from '@shared/ffmpegPlan'
import type { Settings } from '@shared/settings'
import type { ConvertDoneEvent, ConvertLogEvent, ConvertProgressEvent } from '@shared/convertTypes'
import type { NetworkInterfaceInfo, SystemStats } from '@shared/systemStats'
import type { RemoteCommand, RemoteTaskSnapshot } from '@shared/remoteTypes'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', partial),

  checkBinary: (binPath: string): Promise<boolean> => ipcRenderer.invoke('binaries:check', binPath),
  pickBinary: (kind: 'ffmpeg' | 'ffprobe'): Promise<string | null> =>
    ipcRenderer.invoke('binaries:pick', kind),

  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  selectInputFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectInput'),
  selectOutputFile: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectOutput', defaultPath),
  confirmOverwrite: (outputPath: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirmOverwrite', outputPath),
  checkFileExists: (path: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', path),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  listNetworkInterfaces: (): Promise<NetworkInterfaceInfo[]> =>
    ipcRenderer.invoke('stats:listNetworkInterfaces'),
  debugNetworkStats: (): Promise<string> => ipcRenderer.invoke('stats:debugNetworkStats'),

  probe: (
    ffprobePath: string,
    inputPath: string
  ): Promise<{ ok: true; data: ProbeResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('probe:run', ffprobePath, inputPath),

  buildPlan: (
    probe: ProbeResult,
    opts: ConvertOptions
  ): Promise<{ ok: true; data: FfmpegPlan } | { ok: false; error: string }> =>
    ipcRenderer.invoke('plan:build', probe, opts),

  startConvert: (params: {
    taskId: string
    ffmpegPath: string
    inputPath: string
    outputPath: string
    plan: FfmpegPlan
    durationSec: number | null
  }): Promise<{ ok: true; args: string[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('convert:start', params),

  cancelConvert: (taskId: string): Promise<boolean> => ipcRenderer.invoke('convert:cancel', taskId),

  onConvertLog: (cb: (event: ConvertLogEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: ConvertLogEvent): void => cb(event)
    ipcRenderer.on('convert:log', listener)
    return () => ipcRenderer.removeListener('convert:log', listener)
  },

  onConvertProgress: (cb: (event: ConvertProgressEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: ConvertProgressEvent): void => cb(event)
    ipcRenderer.on('convert:progress', listener)
    return () => ipcRenderer.removeListener('convert:progress', listener)
  },

  onConvertDone: (cb: (event: ConvertDoneEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: ConvertDoneEvent): void => cb(event)
    ipcRenderer.on('convert:done', listener)
    return () => ipcRenderer.removeListener('convert:done', listener)
  },

  showInFolder: (filePath: string): void => {
    ipcRenderer.invoke('shell:showInFolder', filePath)
  },

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  onSystemStats: (cb: (stats: SystemStats) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, stats: SystemStats): void => cb(stats)
    ipcRenderer.on('system:stats', listener)
    return () => ipcRenderer.removeListener('system:stats', listener)
  },

  setRemoteServerEnabled: (enabled: boolean): Promise<{ enabled: boolean; url: string | null }> =>
    ipcRenderer.invoke('server:setEnabled', enabled),

  getRemoteServerStatus: (): Promise<{ enabled: boolean; url: string | null }> =>
    ipcRenderer.invoke('server:getStatus'),

  pushTaskState: (snapshot: RemoteTaskSnapshot): void => {
    ipcRenderer.send('server:pushState', snapshot)
  },

  removeTaskState: (taskId: string): void => {
    ipcRenderer.send('server:removeState', taskId)
  },

  onServerCommand: (cb: (cmd: RemoteCommand) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, cmd: RemoteCommand): void => cb(cmd)
    ipcRenderer.on('server:command', listener)
    return () => ipcRenderer.removeListener('server:command', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
