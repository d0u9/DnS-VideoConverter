// Pure logic mirroring the original `get_ffmpeg_args` bash function.
// No I/O here — probing and process spawning happen in the main process.

export interface ProbeResult {
  videoCodec: string
  pixFmt: string
  width: number
  height: number
  durationSec: number | null
  hasAudio: boolean
  audioCodec: string | null
  audioChannels: number | null
  audioBitrate: number | null
}

export interface ConvertOptions {
  crf: number
  /** "original" | "360p" | ... | "4k" | "8k" | "hd" | "fhd" | "qhd" | "uhd" | "WIDTHxHEIGHT" */
  resolution: string
}

export interface FfmpegPlan {
  videoArgs: string[]
  audioArgs: string[]
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  needsScale: boolean
  isUpscale: boolean
  willCopyVideo: boolean
  willCopyAudio: boolean
  warnings: string[]
}

const PRESETS: Record<string, { w: number; h: number }> = {
  '360p': { w: 640, h: 360 },
  '480p': { w: 854, h: 480 },
  '576p': { w: 1024, h: 576 },
  '720p': { w: 1280, h: 720 },
  hd: { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
  fhd: { w: 1920, h: 1080 },
  '1440p': { w: 2560, h: 1440 },
  qhd: { w: 2560, h: 1440 },
  '2160p': { w: 3840, h: 2160 },
  '4k': { w: 3840, h: 2160 },
  uhd: { w: 3840, h: 2160 },
  '4320p': { w: 7680, h: 4320 },
  '8k': { w: 7680, h: 4320 }
}

const ORIGINAL_KEYS = new Set(['original', 'source', 'same', 'keep'])
const CUSTOM_RE = /^(\d+)x(\d+)$/

export class FfmpegPlanError extends Error {}

export function validateCrf(raw: string): number {
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) {
    throw new FfmpegPlanError(`Invalid CRF value: ${raw}`)
  }
  return Number(raw)
}

export function buildFfmpegPlan(probe: ProbeResult, opts: ConvertOptions): FfmpegPlan {
  const warnings: string[] = []
  const sourceWidth = probe.width
  const sourceHeight = probe.height

  const resolutionKey = opts.resolution.trim().toLowerCase()

  let outputWidth = sourceWidth
  let outputHeight = sourceHeight
  let isPreset = false
  let boxW = 0
  let boxH = 0
  let isOriginal = false

  if (ORIGINAL_KEYS.has(resolutionKey)) {
    isOriginal = true
  } else if (PRESETS[resolutionKey]) {
    isPreset = true
    boxW = PRESETS[resolutionKey].w
    boxH = PRESETS[resolutionKey].h
  } else {
    const m = CUSTOM_RE.exec(resolutionKey)
    if (!m) {
      throw new FfmpegPlanError(
        `Unsupported resolution: ${opts.resolution}. Use original, 720p, 1080p, 1440p, 4k, 8k, or WIDTHxHEIGHT.`
      )
    }
    boxW = Number(m[1])
    boxH = Number(m[2])
    if (boxW < 2 || boxH < 2) {
      throw new FfmpegPlanError(`Invalid resolution: ${opts.resolution}`)
    }
  }

  // Presets follow source orientation: portrait source rotates a landscape preset box.
  if (isPreset && sourceHeight > sourceWidth) {
    const tmp = boxW
    boxW = boxH
    boxH = tmp
  }

  if (!isOriginal) {
    if (sourceWidth * boxH >= sourceHeight * boxW) {
      // Source is relatively wider — width is the limiting dimension.
      outputWidth = boxW
      outputHeight = Math.floor((sourceHeight * boxW) / sourceWidth)
    } else {
      // Source is relatively taller — height is the limiting dimension.
      outputHeight = boxH
      outputWidth = Math.floor((sourceWidth * boxH) / sourceHeight)
    }

    if (outputWidth % 2 !== 0) outputWidth--
    if (outputHeight % 2 !== 0) outputHeight--

    if (outputWidth < 16 || outputHeight < 16) {
      throw new FfmpegPlanError(
        `Calculated output resolution is invalid: ${outputWidth}x${outputHeight}`
      )
    }
  }

  const needsScale = outputWidth !== sourceWidth || outputHeight !== sourceHeight
  const isUpscale = outputWidth > sourceWidth || outputHeight > sourceHeight

  if (isUpscale) {
    warnings.push(
      `Selected resolution is higher than the source. Source: ${sourceWidth}x${sourceHeight}, Output: ${outputWidth}x${outputHeight}`
    )
  }

  // Video args — HEVC can be stream-copied only when resolution is unchanged.
  let videoArgs: string[]
  let willCopyVideo = false

  if (probe.videoCodec === 'hevc' && !needsScale) {
    willCopyVideo = true
    videoArgs = ['-c:v', 'copy', '-tag:v', 'hvc1']
  } else {
    videoArgs = ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(opts.crf), '-tag:v', 'hvc1']

    if (needsScale) {
      videoArgs.push('-vf', `scale=${outputWidth}:${outputHeight}`)
    }

    if (/10le$|12le$/.test(probe.pixFmt)) {
      videoArgs.push('-pix_fmt', 'yuv420p10le')
    } else {
      videoArgs.push('-pix_fmt', 'yuv420p')
    }
  }

  // Audio args.
  let audioArgs: string[]
  let willCopyAudio = false

  if (probe.audioCodec === 'aac') {
    willCopyAudio = true
    audioArgs = ['-c:a', 'copy']
  } else if (probe.audioChannels !== null && probe.audioChannels > 2) {
    audioArgs = ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '384k']
  } else if (probe.audioBitrate !== null && probe.audioBitrate <= 192000) {
    audioArgs = ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k']
  } else {
    audioArgs = ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '256k']
  }

  return {
    videoArgs,
    audioArgs,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    needsScale,
    isUpscale,
    willCopyVideo,
    willCopyAudio,
    warnings
  }
}

export function buildFfmpegCommandArgs(
  inputPath: string,
  outputPath: string,
  plan: FfmpegPlan
): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...plan.videoArgs,
    ...plan.audioArgs,
    '-movflags',
    '+faststart',
    outputPath
  ]
}
