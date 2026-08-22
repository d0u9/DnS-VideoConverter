import { useEffect, useRef, useState } from 'react'
import type { ConvertOptions, FfmpegPlan, ProbeResult } from '@shared/ffmpegPlan'
import type { Settings } from '@shared/settings'
import type { ConvertDoneResult, ConvertProgress } from '@shared/convertTypes'
import { defaultOutputPath, formatBitrate, formatBytes, formatDuration } from './format'

interface CommandRow {
  flag: string | null
  value: string
}

function pairArgs(args: string[]): CommandRow[] {
  const rows: CommandRow[] = []
  for (let i = 0; i < args.length; i += 2) {
    rows.push({ flag: args[i], value: args[i + 1] ?? '' })
  }
  return rows
}

function sizeChangeText(beforeBytes: number | undefined, afterBytes: number | undefined): string {
  const before = formatBytes(beforeBytes)
  const after = formatBytes(afterBytes)
  if (!beforeBytes || afterBytes === undefined || beforeBytes <= 0) {
    return `${before} → ${after}`
  }
  const sign = afterBytes <= beforeBytes ? '−' : '+'
  const pct = Math.abs(Math.round((1 - afterBytes / beforeBytes) * 100))
  return `${before} → ${after} (${sign}${pct}%)`
}

const RESOLUTION_OPTIONS = [
  ['original', 'Original'],
  ['360p', '360p'],
  ['480p', '480p'],
  ['576p', '576p'],
  ['720p', '720p'],
  ['1080p', '1080p'],
  ['1440p', '1440p'],
  ['4k', '4K (2160p)'],
  ['8k', '8K (4320p)'],
  ['custom', 'Custom…']
] as const

const CRF_RE = /^\d+(\.\d+)?$/

export type TaskStatus = 'idle' | 'probing' | 'ready' | 'converting' | 'done' | 'error'

export interface TaskMeta {
  title: string
  status: TaskStatus
}

interface Props {
  taskId: string
  settings: Settings
  onMeta: (meta: TaskMeta) => void
}

export default function TaskPanel({ taskId, settings, onMeta }: Props): React.JSX.Element {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeStatus, setProbeStatus] = useState<'idle' | 'probing' | 'error'>('idle')
  const [probeError, setProbeError] = useState<string | null>(null)

  const [crf, setCrf] = useState(() => String(settings.defaultCrf))
  const [resolution, setResolution] = useState(() => settings.defaultResolution)
  const [customRes, setCustomRes] = useState('1920x1080')
  const [forceReencode, setForceReencode] = useState(false)
  const [outputPath, setOutputPath] = useState('')

  const [plan, setPlan] = useState<FfmpegPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  const [converting, setConverting] = useState(false)
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [doneResult, setDoneResult] = useState<ConvertDoneResult | null>(null)

  const [dragOver, setDragOver] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Report a short status summary up to the tab bar.
  useEffect(() => {
    const title = inputPath ? (inputPath.split(/[/\\]/).pop() ?? inputPath) : 'New Task'
    const status: TaskStatus = converting
      ? 'converting'
      : probeStatus === 'probing'
        ? 'probing'
        : probeStatus === 'error'
          ? 'error'
          : doneResult
            ? doneResult.success
              ? 'done'
              : 'error'
            : probe
              ? 'ready'
              : 'idle'
    onMeta({ title, status })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputPath, probeStatus, converting, doneResult, probe])

  // Subscribe to conversion events for this task only.
  useEffect(() => {
    const offLog = window.api.onConvertLog((e) => {
      if (e.taskId !== taskId) return
      setLogLines((prev) =>
        prev.length > 4000 ? [...prev.slice(-3000), e.line] : [...prev, e.line]
      )
    })
    const offProgress = window.api.onConvertProgress((e) => {
      if (e.taskId !== taskId) return
      setProgress(e.progress)
    })
    const offDone = window.api.onConvertDone((e) => {
      if (e.taskId !== taskId) return
      setConverting(false)
      setDoneResult(e.result)
    })
    return () => {
      offLog()
      offProgress()
      offDone()
    }
  }, [taskId])

  // Auto-scroll log to bottom.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  // Probe whenever a new input file is chosen.
  useEffect(() => {
    if (!inputPath) return
    let cancelled = false

    setProbeStatus('probing')
    setProbeError(null)
    setProbe(null)
    setPlan(null)
    setDoneResult(null)
    setLogLines([])
    setProgress(null)

    const ffprobePath = settings.ffprobePath || 'ffprobe'

    window.api.probe(ffprobePath, inputPath).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setProbe(res.data)
        setProbeStatus('idle')
        setOutputPath(defaultOutputPath(inputPath))
      } else {
        setProbeStatus('error')
        setProbeError(res.error)
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputPath])

  // Rebuild the ffmpeg plan whenever probe results or options change.
  useEffect(() => {
    if (!probe) {
      setPlan(null)
      setPlanError(null)
      return
    }

    if (!CRF_RE.test(crf.trim())) {
      setPlan(null)
      setPlanError(`Invalid CRF value: ${crf}`)
      return
    }

    const resValue = resolution === 'custom' ? customRes.trim() : resolution
    const opts: ConvertOptions = { crf: Number(crf), resolution: resValue, forceReencode }

    let cancelled = false
    window.api.buildPlan(probe, opts).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setPlan(res.data)
        setPlanError(null)
      } else {
        setPlan(null)
        setPlanError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [probe, crf, resolution, customRes, forceReencode])

  const handleBrowseInput = async (): Promise<void> => {
    const p = await window.api.selectInputFile()
    if (p) setInputPath(p)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = window.api.getPathForFile(file)
    if (path) setInputPath(path)
  }

  const handleBrowseOutput = async (): Promise<void> => {
    const p = await window.api.selectOutputFile(outputPath)
    if (p) setOutputPath(p)
  }

  const handleConvert = async (): Promise<void> => {
    if (!probe || !inputPath || !outputPath.trim()) return

    // Rebuild the plan from the current CRF/resolution right now, rather than
    // trusting the `plan` state — that's recomputed asynchronously after each
    // edit, so a click right after typing could otherwise still see the plan
    // from before the edit.
    if (!CRF_RE.test(crf.trim())) {
      setPlan(null)
      setPlanError(`Invalid CRF value: ${crf}`)
      return
    }
    const resValue = resolution === 'custom' ? customRes.trim() : resolution
    const opts: ConvertOptions = { crf: Number(crf), resolution: resValue, forceReencode }

    const planRes = await window.api.buildPlan(probe, opts)
    if (!planRes.ok) {
      setPlan(null)
      setPlanError(planRes.error)
      return
    }
    const freshPlan = planRes.data
    setPlan(freshPlan)
    setPlanError(null)

    const proceed = await window.api.confirmOverwrite(outputPath.trim())
    if (!proceed) return

    setConverting(true)
    setLogLines([])
    setProgress(null)
    setDoneResult(null)

    const res = await window.api.startConvert({
      taskId,
      ffmpegPath: settings.ffmpegPath || 'ffmpeg',
      inputPath,
      outputPath: outputPath.trim(),
      plan: freshPlan,
      durationSec: probe.durationSec
    })

    if (!res.ok) {
      setConverting(false)
      setDoneResult({ success: false, code: null, error: res.error })
    }
  }

  const handleCancel = async (): Promise<void> => {
    await window.api.cancelConvert(taskId)
  }

  const canConvert = Boolean(
    settings.ffmpegPath && probe && plan && !planError && outputPath.trim() && !converting
  )

  const commandRows: CommandRow[] =
    inputPath && plan
      ? [
          { flag: '-i', value: inputPath },
          { flag: '-map', value: '0:v:0' },
          { flag: '-map', value: '0:a:0?' },
          ...pairArgs(plan.videoArgs),
          ...pairArgs(plan.audioArgs),
          { flag: '-movflags', value: '+faststart' },
          { flag: null, value: outputPath || '<output>' }
        ]
      : []

  return (
    <div className="layout">
      <aside className="sidebar">
        <section
          className={`dropzone ${dragOver ? 'dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={handleBrowseInput}
        >
          {inputPath ? (
            <div className="dropzone-file">
              <div className="filename">{inputPath.split(/[/\\]/).pop()}</div>
              <div className="filepath" title={inputPath}>
                {inputPath}
              </div>
            </div>
          ) : (
            <div className="dropzone-empty">
              <div>Drop a video file here</div>
              <div className="muted">or click to browse</div>
            </div>
          )}
        </section>

        {probeStatus === 'probing' && <div className="status-line">Probing…</div>}
        {probeStatus === 'error' && <div className="status-line error">Probe failed: {probeError}</div>}

        {probe && (
          <section className="card">
            <h3>Detected</h3>
            <dl>
              <dt>Video</dt>
              <dd>
                {probe.videoCodec || 'unknown'} · {probe.pixFmt || 'unknown'}
              </dd>
              <dt>Resolution</dt>
              <dd>
                {probe.width}×{probe.height}
              </dd>
              <dt>Duration</dt>
              <dd>{formatDuration(probe.durationSec)}</dd>
              <dt>Audio</dt>
              <dd>
                {probe.hasAudio
                  ? `${probe.audioCodec ?? 'unknown'} · ${probe.audioChannels ?? '?'} ch · ${formatBitrate(
                      probe.audioBitrate
                    )}`
                  : 'none'}
              </dd>
              <dt>File size</dt>
              <dd>{formatBytes(probe.fileSizeBytes)}</dd>
            </dl>
          </section>
        )}

        <section className="card">
          <h3>Options</h3>

          <div className="field">
            <label>CRF (x265 quality)</label>
            <input
              type="text"
              value={crf}
              onChange={(e) => setCrf(e.target.value)}
              style={{ maxWidth: 100 }}
            />
          </div>

          <div className="field">
            <label>Resolution</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {RESOLUTION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {resolution === 'custom' && (
            <div className="field">
              <label>Custom max size (WxH)</label>
              <input
                type="text"
                value={customRes}
                onChange={(e) => setCustomRes(e.target.value)}
                placeholder="1920x1080"
              />
            </div>
          )}

          {probe?.videoCodec === 'hevc' && (
            <div className="field checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={forceReencode}
                  onChange={(e) => setForceReencode(e.target.checked)}
                />
                Force re-encode (source is already HEVC — normally stream-copied)
              </label>
            </div>
          )}

          <div className="field">
            <label>Output file</label>
            <div className="row">
              <input type="text" value={outputPath} onChange={(e) => setOutputPath(e.target.value)} />
              <button type="button" onClick={handleBrowseOutput}>
                Browse…
              </button>
            </div>
          </div>

          {planError && <div className="status-line error">{planError}</div>}

          {plan?.warnings.map((w) => (
            <div key={w} className="status-line warning">
              ⚠ {w}
            </div>
          ))}

          {plan && (
            <div className="plan-summary">
              <div>
                Output size: {plan.outputWidth}×{plan.outputHeight}{' '}
                {plan.needsScale ? '(resized)' : '(unchanged)'}
              </div>
              <div>Video: {plan.willCopyVideo ? 'stream copy (HEVC)' : 'encode with libx265'}</div>
              <div>Audio: {plan.willCopyAudio ? 'stream copy (AAC)' : 'encode to AAC'}</div>
            </div>
          )}
        </section>
      </aside>

      <main className="main">
        {commandRows.length > 0 && (
          <section className="command-preview">
            <button type="button" className="command-toggle" onClick={() => setCommandOpen((o) => !o)}>
              <span className={`chevron ${commandOpen ? 'open' : ''}`}>▸</span>
              ffmpeg command ({commandRows.length} args)
            </button>
            {commandOpen && (
              <div className="command-rows">
                {commandRows.map((row, i) => (
                  <div className="command-row" key={i}>
                    {row.flag && <span className="command-flag">{row.flag}</span>}
                    <span className="command-value">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!converting && doneResult && (
          <div className={`result-banner ${doneResult.success ? 'success' : 'failure'}`}>
            <span className="result-icon">{doneResult.success ? '✓' : '✗'}</span>
            <div className="result-text">
              <div className="result-title">
                {doneResult.success ? 'Conversion succeeded' : 'Conversion failed'}
              </div>
              <div className="result-detail">
                {doneResult.success
                  ? sizeChangeText(probe?.fileSizeBytes, doneResult.outputSizeBytes)
                  : (doneResult.error ?? 'Unknown error')}
              </div>
            </div>
          </div>
        )}

        <section className="convert-bar">
          {!converting ? (
            <button type="button" className="primary" disabled={!canConvert} onClick={handleConvert}>
              Convert
            </button>
          ) : (
            <button type="button" className="danger" onClick={handleCancel}>
              Cancel
            </button>
          )}

          <div className="progress-wrap">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress?.percent ?? (converting ? 0 : 0)}%` }}
              />
            </div>
            <div className="progress-text">
              {converting && progress
                ? `${progress.percent !== null ? progress.percent.toFixed(1) + '%' : '…'} · ${formatDuration(
                    progress.outTimeSec
                  )} / ${formatDuration(probe?.durationSec ?? null)}${
                    progress.speed ? ` · ${progress.speed}` : ''
                  }${progress.fps ? ` · ${progress.fps} fps` : ''}`
                : converting
                  ? 'Starting…'
                  : ''}
            </div>
          </div>

          {doneResult?.success && (
            <button type="button" onClick={() => window.api.showInFolder(outputPath)}>
              Reveal
            </button>
          )}
        </section>

        <section className="log-view" ref={logRef}>
          {logLines.length === 0 ? (
            <div className="muted">Log output will appear here during conversion.</div>
          ) : (
            logLines.map((line, i) => <div key={i}>{line}</div>)
          )}
        </section>
      </main>
    </div>
  )
}
