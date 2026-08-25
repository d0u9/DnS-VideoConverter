import { useEffect, useRef, useState } from 'react'
import type { ConvertOptions, FfmpegPlan, ProbeResult } from '@shared/ffmpegPlan'
import type { Settings } from '@shared/settings'
import type { ConvertDoneResult, ConvertProgress } from '@shared/convertTypes'
import { defaultOutputPath, formatBitrate, formatBytes, formatDuration } from './format'
import type { RemoteTaskOptions } from '@shared/remoteTypes'

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
  /** 0-100 while converting; null otherwise or before ffmpeg reports the first progress line. */
  progress: number | null
}

interface Props {
  taskId: string
  settings: Settings
  onMeta: (meta: TaskMeta) => void
  initialInputPath?: string
  initialOptions?: RemoteTaskOptions
  initialAutoStart?: boolean
}

export default function TaskPanel({
  taskId,
  settings,
  onMeta,
  initialInputPath,
  initialOptions,
  initialAutoStart
}: Props): React.JSX.Element {
  const [inputPath, setInputPath] = useState<string | null>(initialInputPath ?? null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeStatus, setProbeStatus] = useState<'idle' | 'probing' | 'error'>('idle')
  const [probeError, setProbeError] = useState<string | null>(null)

  const [crf, setCrf] = useState(() => initialOptions?.crf ?? String(settings.defaultCrf))
  const [resolution, setResolution] = useState(() => initialOptions?.resolution ?? settings.defaultResolution)
  const [customRes, setCustomRes] = useState(() => initialOptions?.customRes ?? '1920x1080')
  const [forceReencode, setForceReencode] = useState(() => initialOptions?.forceReencode ?? false)
  const [outputPath, setOutputPath] = useState('')

  const [plan, setPlan] = useState<FfmpegPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  const [converting, setConverting] = useState(false)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [needsOverwriteConfirm, setNeedsOverwriteConfirm] = useState(false)
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [doneResult, setDoneResult] = useState<ConvertDoneResult | null>(null)

  const [dragOver, setDragOver] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const autoStartRef = useRef(initialAutoStart === true)

  const title = inputPath ? (inputPath.split(/[/\\]/).pop() ?? inputPath) : 'New Task'
  const configurationError = probe && !settings.ffmpegPath ? 'ffmpeg is not configured or could not be found.' : null
  const taskError = probeStatus === 'error' ? probeError : planError || configurationError
  const status: TaskStatus = converting
    ? 'converting'
    : probeStatus === 'probing'
      ? 'probing'
      : taskError
        ? 'error'
        : doneResult
          ? doneResult.success
            ? 'done'
            : 'error'
          : probe
            ? 'ready'
            : 'idle'

  const progressText =
    converting && progress
      ? `${progress.percent !== null ? progress.percent.toFixed(1) + '%' : '…'} · ${formatDuration(
          progress.outTimeSec
        )} / ${formatDuration(probe?.durationSec ?? null)}${
          progress.speed ? ` · ${progress.speed}` : ''
        }${progress.fps ? ` · ${progress.fps} fps` : ''} · ${formatBytes(progress.outputSizeBytes ?? 0)}`
      : converting
        ? 'Starting…'
        : null

  // Report a short status summary up to the tab bar, and mirror full state to
  // the main process for the remote web viewer.
  useEffect(() => {
    const progressPercent = converting ? (progress?.percent ?? null) : null
    onMeta({ title, status, progress: progressPercent })

    window.api.pushTaskState({
      taskId,
      title,
      status,
      progressPercent,
      progressText,
      inputPath,
      outputPath,
      crf,
      resolution,
      customRes,
      forceReencode,
      isHevc: probe?.videoCodec === 'hevc',
      detected: probe
        ? `${probe.videoCodec || 'unknown'} · ${probe.pixFmt || 'unknown'} · ${probe.width}×${probe.height} · ${formatDuration(probe.durationSec)} · ${
            probe.hasAudio
              ? `${probe.audioCodec ?? 'unknown'} ${probe.audioChannels ?? '?'}ch ${formatBitrate(probe.audioBitrate)}`
              : 'no audio'
          } · ${formatBytes(probe.fileSizeBytes)}`
        : null,
      planSummary: plan
        ? `Output ${plan.outputWidth}×${plan.outputHeight} (${plan.needsScale ? 'resized' : 'unchanged'}) · Video: ${
            plan.willCopyVideo ? 'copy (HEVC)' : 'encode x265'
          } · Audio: ${plan.willCopyAudio ? 'copy (AAC)' : 'encode AAC'}`
        : null,
      resultText: taskError
        ? probeStatus === 'error'
          ? `Probe failed — ${taskError}`
          : `Configuration failed — ${taskError}`
        : doneResult
        ? doneResult.success
          ? `Succeeded — ${sizeChangeText(probe?.fileSizeBytes, doneResult.outputSizeBytes)}`
          : (doneResult.error ?? 'Failed')
        : null,
      resultSuccess: taskError ? false : doneResult ? doneResult.success : null,
      // Live ffmpeg output is intentionally kept on the desktop. The remote
      // UI only needs diagnostic context after a failed run.
      logTail:
        taskError
          ? [`${probeStatus === 'error' ? 'ffprobe' : 'configuration'} failed: ${taskError}`]
          : doneResult && !doneResult.success
            ? logLines.length > 0
              ? logLines.slice(-150)
              : [doneResult.error ?? 'ffmpeg failed without producing diagnostic output.']
            : [],
      canConvert,
      converting,
      needsOverwriteConfirm
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    taskId,
    title,
    status,
    converting,
    progress,
    progressText,
    probe,
    probeError,
    probeStatus,
    plan,
    planError,
    configurationError,
    doneResult,
    inputPath,
    outputPath,
    crf,
    resolution,
    customRes,
    forceReencode,
    logLines,
    needsOverwriteConfirm
  ])

  // Remove this task from the remote viewer when its tab is closed.
  useEffect(() => {
    return () => {
      window.api.removeTaskState(taskId)
    }
  }, [taskId])

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
    setNeedsOverwriteConfirm(false)

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
    if (p) {
      setOutputPath(p)
      setNeedsOverwriteConfirm(false)
    }
  }

  const handleConvert = async (
    remoteOpts?: {
      remote?: boolean
      confirmOverwrite?: boolean
      crf?: string
      resolution?: string
      customRes?: string
      forceReencode?: boolean
    }
  ): Promise<void> => {
    // Lock synchronously, before the first await. Plan building and overwrite
    // checks leave a window in which a second click/command used to start the
    // same task again and report a misleading "already running" error.
    if (startingRef.current || convertingRef.current) return
    startingRef.current = true
    setStarting(true)
    try {
    if (!probe || !inputPath || !outputPath.trim()) return

    // Rebuild the plan from the current CRF/resolution right now, rather than
    // trusting the `plan` state — that's recomputed asynchronously after each
    // edit, so a click right after typing could otherwise still see the plan
    // from before the edit.
    const effectiveCrf = remoteOpts?.crf ?? crf
    const effectiveResolution = remoteOpts?.resolution ?? resolution
    const effectiveCustomRes = remoteOpts?.customRes ?? customRes
    const effectiveForceReencode = remoteOpts?.forceReencode ?? forceReencode
    if (remoteOpts?.remote) {
      // Persist the exact atomic parameter snapshot used for this run so both
      // desktop and remote Details show the running job's real configuration.
      setCrf(effectiveCrf)
      setResolution(effectiveResolution)
      setCustomRes(effectiveCustomRes)
      setForceReencode(effectiveForceReencode)
    }
    if (!CRF_RE.test(effectiveCrf.trim())) {
      setPlan(null)
      setPlanError(`Invalid CRF value: ${effectiveCrf}`)
      return
    }
    const resValue = effectiveResolution === 'custom' ? effectiveCustomRes.trim() : effectiveResolution
    const opts: ConvertOptions = { crf: Number(effectiveCrf), resolution: resValue, forceReencode: effectiveForceReencode }

    const planRes = await window.api.buildPlan(probe, opts)
    if (!planRes.ok) {
      setPlan(null)
      setPlanError(planRes.error)
      return
    }
    const freshPlan = planRes.data
    setPlan(freshPlan)
    setPlanError(null)

    const trimmedOutput = outputPath.trim()
    if (remoteOpts?.remote) {
      // Remote commands can't drive the native OS confirm dialog — it pops
      // up on the desktop machine, invisible to whoever is on the web page.
      // Surface the need-to-confirm in the snapshot instead, and only
      // proceed once the remote page re-sends the command with confirmOverwrite.
      if (!remoteOpts.confirmOverwrite) {
        const exists = await window.api.checkFileExists(trimmedOutput)
        if (exists) {
          setNeedsOverwriteConfirm(true)
          return
        }
      }
      setNeedsOverwriteConfirm(false)
    } else {
      const proceed = await window.api.confirmOverwrite(trimmedOutput)
      if (!proceed) return
    }

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
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  const handleCancel = async (): Promise<void> => {
    await window.api.cancelConvert(taskId)
  }

  // Let the remote web viewer trigger the same actions as the local buttons.
  // Refs avoid re-subscribing (and missing events) every render while still
  // always calling the latest handleConvert/handleCancel closure.
  const handleConvertRef = useRef(handleConvert)
  handleConvertRef.current = handleConvert
  const handleCancelRef = useRef(handleCancel)
  handleCancelRef.current = handleCancel

  const convertingRef = useRef(converting)
  convertingRef.current = converting

  useEffect(() => {
    return window.api.onServerCommand((cmd) => {
      if (cmd.type === 'convert' && cmd.taskId === taskId) {
        handleConvertRef.current({
          remote: true,
          confirmOverwrite: cmd.confirmOverwrite,
          crf: cmd.crf,
          resolution: cmd.resolution,
          customRes: cmd.customRes,
          forceReencode: cmd.forceReencode
        })
      }
      else if (cmd.type === 'cancel' && cmd.taskId === taskId) handleCancelRef.current()
      else if (cmd.type === 'newTask' && cmd.taskId === taskId && !convertingRef.current) {
        // Invalidate the previous file's derived state in the same React batch
        // as the replacement, so auto-start can never observe an old plan.
        setProbe(null)
        setPlan(null)
        setDoneResult(null)
        setProgress(null)
        setLogLines([])
        setNeedsOverwriteConfirm(false)
        setCrf(cmd.crf)
        setResolution(cmd.resolution)
        setCustomRes(cmd.customRes)
        setForceReencode(cmd.forceReencode)
        autoStartRef.current = cmd.startImmediately === true
        setInputPath(cmd.inputPath)
      } else if (cmd.type === 'setOptions' && cmd.taskId === taskId) {
        if (cmd.crf !== undefined) setCrf(cmd.crf)
        if (cmd.resolution !== undefined) setResolution(cmd.resolution)
        if (cmd.customRes !== undefined) setCustomRes(cmd.customRes)
        if (cmd.forceReencode !== undefined) setForceReencode(cmd.forceReencode)
      }
    })
  }, [taskId])

  const canConvert = Boolean(
    settings.ffmpegPath && probe && plan && !planError && outputPath.trim() && !converting
  )

  // Remote add/replace is a single "configure and run" operation. Wait until
  // probing and asynchronous plan construction are both complete, then start
  // exactly once. Existing outputs still use the remote overwrite prompt.
  useEffect(() => {
    if (!autoStartRef.current || !canConvert || !probe || !plan || !outputPath.trim()) return
    autoStartRef.current = false
    handleConvertRef.current({ remote: true })
  }, [canConvert, outputPath, plan, probe])

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
              <input
                type="text"
                value={outputPath}
                onChange={(e) => {
                  setOutputPath(e.target.value)
                  setNeedsOverwriteConfirm(false)
                }}
              />
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
            <button
              type="button"
              className="primary"
              disabled={!canConvert || starting}
              onClick={() => handleConvert()}
            >
              {starting ? 'Starting…' : doneResult ? 'Convert again' : 'Convert'}
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
            <div className="progress-text">{progressText}</div>
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
