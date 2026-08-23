export interface ConvertProgress {
  percent: number | null
  outTimeSec: number | null
  speed: string | null
  fps: string | null
  outputSizeBytes: number | null
}

export interface ConvertDoneResult {
  success: boolean
  code: number | null
  error?: string
  outputSizeBytes?: number
}

export interface ConvertLogEvent {
  taskId: string
  line: string
}

export interface ConvertProgressEvent {
  taskId: string
  progress: ConvertProgress
}

export interface ConvertDoneEvent {
  taskId: string
  result: ConvertDoneResult
}
