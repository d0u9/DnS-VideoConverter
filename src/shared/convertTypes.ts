export interface ConvertProgress {
  percent: number | null
  outTimeSec: number | null
  speed: string | null
  fps: string | null
}

export interface ConvertDoneResult {
  success: boolean
  code: number | null
  error?: string
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
