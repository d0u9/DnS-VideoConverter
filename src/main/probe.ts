import { spawn } from 'node:child_process'
import type { ProbeResult } from '../shared/ffmpegPlan'

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  pix_fmt?: string
  width?: number
  height?: number
  channels?: number
  bit_rate?: string
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: { duration?: string; bit_rate?: string }
}

export class ProbeError extends Error {}

export function probeVideo(ffprobePath: string, inputPath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      inputPath
    ]

    const child = spawn(ffprobePath, args)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))

    child.on('error', (err) => {
      reject(new ProbeError(`Failed to launch ffprobe: ${err.message}`))
    })

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new ProbeError(stderr.trim() || `ffprobe exited with code ${code}`))
        return
      }

      let parsed: FfprobeOutput
      try {
        parsed = JSON.parse(stdout)
      } catch {
        reject(new ProbeError('Failed to parse ffprobe output.'))
        return
      }

      const streams = parsed.streams ?? []
      const videoStream = streams.find((s) => s.codec_type === 'video')
      const audioStream = streams.find((s) => s.codec_type === 'audio')

      if (!videoStream || typeof videoStream.width !== 'number' || typeof videoStream.height !== 'number') {
        reject(new ProbeError('Unable to detect video resolution.'))
        return
      }

      const durationRaw = parsed.format?.duration
      const durationSec = durationRaw && /^[\d.]+$/.test(durationRaw) ? Number(durationRaw) : null

      const audioBitrateRaw = audioStream?.bit_rate
      const audioBitrate =
        audioBitrateRaw && /^\d+$/.test(audioBitrateRaw) ? Number(audioBitrateRaw) : null

      resolve({
        videoCodec: videoStream.codec_name ?? '',
        pixFmt: videoStream.pix_fmt ?? '',
        width: videoStream.width,
        height: videoStream.height,
        durationSec,
        hasAudio: Boolean(audioStream),
        audioCodec: audioStream?.codec_name ?? null,
        audioChannels: typeof audioStream?.channels === 'number' ? audioStream.channels : null,
        audioBitrate
      })
    })
  })
}
