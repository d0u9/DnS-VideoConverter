import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ConvertOptions, FfmpegPlan, ProbeResult } from '@shared/ffmpegPlan'
import type { Settings } from '@shared/settings'
import type { ConvertDoneEvent, ConvertLogEvent, ConvertProgressEvent } from '@shared/convertTypes'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', partial),

  checkBinary: (binPath: string): Promise<boolean> => ipcRenderer.invoke('binaries:check', binPath),
  pickBinary: (kind: 'ffmpeg' | 'ffprobe'): Promise<string | null> =>
    ipcRenderer.invoke('binaries:pick', kind),

  selectInputFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectInput'),
  selectOutputFile: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectOutput', defaultPath),
  confirmOverwrite: (outputPath: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirmOverwrite', outputPath),

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

  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
