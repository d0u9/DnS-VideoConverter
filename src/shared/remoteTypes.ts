export interface RemoteTaskSnapshot {
  taskId: string
  title: string
  status: 'idle' | 'probing' | 'ready' | 'converting' | 'done' | 'error'
  progressPercent: number | null
  progressText: string | null
  inputPath: string | null
  outputPath: string
  crf: string
  resolution: string
  customRes: string
  forceReencode: boolean
  isHevc: boolean
  detected: string | null
  planSummary: string | null
  /** Exact arguments passed to ffmpeg, excluding the executable path. */
  ffmpegArgs: string[]
  resultText: string | null
  resultSuccess: boolean | null
  logTail: string[]
  canConvert: boolean
  converting: boolean
  needsOverwriteConfirm: boolean
}

export interface RemoteTaskOptions {
  crf: string
  resolution: string
  customRes: string
  forceReencode: boolean
}

export type RemoteServerMessage =
  | { type: 'hello'; appVersion: string }
  | { type: 'snapshot'; tasks: RemoteTaskSnapshot[] }
  | { type: 'update'; task: RemoteTaskSnapshot }
  | { type: 'remove'; taskId: string }
  | { type: 'stats'; cpuPercent: number; netRxBps: number; netTxBps: number }

export type RemoteCommand =
  | {
      type: 'convert'
      taskId: string
      confirmOverwrite?: boolean
      /** Current remote editor values, carried atomically with Convert. */
      crf?: string
      resolution?: string
      customRes?: string
      forceReencode?: boolean
    }
  | { type: 'cancel'; taskId: string }
  | { type: 'closeTask'; taskId: string }
  /** taskId set + that task is still empty -> fill it in place; otherwise create a new tab. */
  | ({ type: 'newTask'; inputPath: string; taskId?: string; startImmediately?: boolean } & RemoteTaskOptions)
  | {
      type: 'setOptions'
      taskId: string
      crf?: string
      resolution?: string
      customRes?: string
      forceReencode?: boolean
    }

export interface BrowseEntry {
  name: string
  path: string
  isDir: boolean
}

export interface BrowseResponse {
  path: string | null
  parent: string | null
  entries: BrowseEntry[]
}
