import { memo, useEffect, useRef, useState } from 'react'
import type { RemoteCommand, RemoteTaskSnapshot } from '@shared/remoteTypes'

const RESOLUTIONS: [string, string][] = [
  ['original', 'Original'], ['360p', '360p'], ['480p', '480p'], ['576p', '576p'],
  ['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K (2160p)'],
  ['8k', '8K (4320p)'], ['custom', 'Custom…']
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle', probing: 'Probing…', ready: 'Ready', converting: 'Converting', done: 'Done', error: 'Error'
}

const VALUELESS_ARGS = new Set(['-y', '-nostats'])

function formatArgs(args: string[]): Array<{ flag: string | null; value: string }> {
  const rows: Array<{ flag: string | null; value: string }> = []
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (token.startsWith('-')) {
      if (VALUELESS_ARGS.has(token)) rows.push({ flag: token, value: '' })
      else rows.push({ flag: token, value: args[++i] ?? '' })
    } else {
      rows.push({ flag: null, value: token })
    }
  }
  return rows
}

export function isFinished(t: RemoteTaskSnapshot): boolean {
  return t.status === 'done' || (t.status === 'error' && !!t.resultText)
}

function TaskCard({ task: t, isSelected, onSelect }: {
  task: RemoteTaskSnapshot
  isSelected: boolean
  onSelect: (taskId: string) => void
  sendCmd: (cmd: RemoteCommand) => boolean
}): React.JSX.Element {
  const pct = t.progressPercent == null ? '' : `${t.progressPercent.toFixed(1)}%`
  return (
    <button type="button" className={'task-row' + (isSelected ? ' selected' : '')} onClick={() => onSelect(t.taskId)}>
      <span className="task-name" title={t.title}>{t.title}</span>
      <span><span className={'status-dot ' + t.status} />{STATUS_LABEL[t.status] || t.status}</span>
      <span className="plan-cell" title={t.planSummary ?? ''}>{t.planSummary || '—'}</span>
      <span className="task-progress-cell"><span className="mini-progress"><span style={{ width: `${t.progressPercent ?? (t.status === 'done' ? 100 : 0)}%` }} /></span>{pct || (t.status === 'done' ? '100%' : '—')}</span>
    </button>
  )
}

function TaskDetailsInner({ task: t, sendCmd, onClose }: {
  task: RemoteTaskSnapshot
  sendCmd: (cmd: RemoteCommand) => boolean
  onClose: (taskId: string) => void
}): React.JSX.Element {
  const [crf, setCrf] = useState(t.crf)
  const [customRes, setCustomRes] = useState(t.customRes)
  const [resolution, setResolution] = useState(t.resolution)
  const [forceReencode, setForceReencode] = useState(t.forceReencode)
  const [commandPending, setCommandPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const crfFocused = useRef(false)
  const customResFocused = useRef(false)

  useEffect(() => { if (!crfFocused.current) setCrf(t.crf) }, [t.crf])
  useEffect(() => { if (!customResFocused.current) setCustomRes(t.customRes) }, [t.customRes])
  useEffect(() => setResolution(t.resolution), [t.resolution])
  useEffect(() => setForceReencode(t.forceReencode), [t.forceReencode])
  useEffect(() => {
    if (t.converting || t.needsOverwriteConfirm || t.status === 'error' || !t.canConvert) setCommandPending(false)
  }, [t.canConvert, t.converting, t.needsOverwriteConfirm, t.status])
  // Drop the local pending flag once the desktop confirms it heard us or the
  // run ended — and after a short grace period even if neither happens, so a
  // command that never landed can be retried instead of leaving the button
  // disabled forever.
  useEffect(() => {
    if (!cancelPending) return undefined
    if (!t.converting || t.cancelling) {
      setCancelPending(false)
      return undefined
    }
    const timer = setTimeout(() => setCancelPending(false), 4000)
    return () => clearTimeout(timer)
  }, [cancelPending, t.cancelling, t.converting])

  const commit = (options: Omit<Extract<RemoteCommand, { type: 'setOptions' }>, 'type' | 'taskId'>): void => {
    if (t.converting) return
    sendCmd({ type: 'setOptions', taskId: t.taskId, ...options })
  }
  const progressText = t.progressText || (t.progressPercent != null ? `${t.progressPercent.toFixed(1)}%` : 'Starting…')
  const startCommand = (confirmOverwrite = false): void => {
    setCommandPending(true)
    sendCmd({ type: 'convert', taskId: t.taskId, confirmOverwrite, crf, resolution, customRes, forceReencode })
  }
  const cancelCommand = (): void => {
    // Only show "Cancelling…" if the command actually went out; a failed send
    // flips the page to Disconnected, which is the honest explanation.
    if (sendCmd({ type: 'cancel', taskId: t.taskId })) setCancelPending(true)
  }
  const cancelling = t.cancelling || cancelPending
  const argumentRows = formatArgs(t.ffmpegArgs)

  return (
    <section className="task-details">
      <div className="details-tabs"><span className="active">Details</span>{t.status === 'error' && t.logTail.length > 0 && <span>Error log</span>}</div>
      <div className="details-toolbar">
        <div className="actions details-actions">
          {t.converting ? <button className="danger" disabled={cancelling} onClick={cancelCommand}>{cancelling ? 'Cancelling…' : 'Cancel'}</button> : t.needsOverwriteConfirm ? <button className="danger" disabled={commandPending} onClick={() => startCommand(true)}>{commandPending ? 'Starting…' : 'Overwrite & Convert'}</button> : <button className="primary" disabled={!t.canConvert || commandPending} onClick={() => startCommand()}>{commandPending ? 'Starting…' : isFinished(t) ? 'Convert again' : 'Convert'}</button>}
          <button onClick={() => { if (confirm(`Close "${t.title}"? This cannot be undone.`)) onClose(t.taskId) }}>Remove</button>
        </div>
      </div>
      <div className="details-content">
        <div className="detail-workspace">
          <section className="details-summary" aria-labelledby="task-detail-title">
          <div className="details-title-row">
            <div>
              <div className="section-eyebrow">Selected media</div>
              <h2 id="task-detail-title">{t.title}</h2>
            </div>
            <span className={'detail-status ' + t.status}><span className={'status-dot ' + t.status} />{STATUS_LABEL[t.status] || t.status}</span>
          </div>
          {(t.detected || t.outputPath || t.planSummary) && (
            <dl className="media-facts">
              {t.detected && <div className="media-fact"><dt>Source</dt><dd>{t.detected}</dd></div>}
              {t.outputPath && <div className="media-fact output-file"><dt>Output file</dt><dd title={t.outputPath}>{t.outputPath}</dd></div>}
              {t.planSummary && <div className="media-fact"><dt>Encoding plan</dt><dd>{t.planSummary}</dd></div>}
            </dl>
          )}
          {t.resultText && <div className={'result ' + (t.resultSuccess ? 'success' : 'failure')}>{t.resultText}</div>}
          </section>
          <fieldset className={'opts conversion-options' + (t.converting ? ' locked' : '')}>
            <legend>Conversion settings</legend>
            <label className="option-field"><span>CRF</span><input disabled={t.converting} type="text" inputMode="decimal" value={crf} onChange={(e) => setCrf(e.target.value)} onFocus={() => { crfFocused.current = true }} onBlur={() => { crfFocused.current = false; commit({ crf }) }} /><small>Lower values preserve more detail</small></label>
            <label className="option-field resolution-field"><span>Resolution</span><select disabled={t.converting} value={resolution} onChange={(e) => { setResolution(e.target.value); commit({ resolution: e.target.value }) }}>{RESOLUTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Maximum output frame size</small></label>
            {resolution === 'custom' && <label className="option-field"><span>Custom size</span><input className="custom-resolution" disabled={t.converting} type="text" value={customRes} placeholder="1920x1080" onChange={(e) => setCustomRes(e.target.value)} onFocus={() => { customResFocused.current = true }} onBlur={() => { customResFocused.current = false; commit({ customRes }) }} /><small>Width × height</small></label>}
            {t.isHevc && <label className="checkbox-opt"><input disabled={t.converting} type="checkbox" checked={forceReencode} onChange={(e) => { setForceReencode(e.target.checked); commit({ forceReencode: e.target.checked }) }} /><span><strong>Force re-encode</strong><small>Encode again even when the source is HEVC</small></span></label>}
          </fieldset>
        </div>
        {t.converting && <div className="conversion-progress"><div className="progress-heading"><span>Conversion progress</span><strong>{t.progressPercent != null ? `${t.progressPercent.toFixed(1)}%` : 'Starting…'}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${t.progressPercent || 0}%` }} /></div><div className="progress-description">{progressText}</div></div>}
        {argumentRows.length > 0 && (
          <details className="ffmpeg-args">
            <summary><span>FFmpeg arguments</span><span className="argument-count">{t.ffmpegArgs.length} args</span></summary>
            <div className="ffmpeg-arg-list">
              <div className="ffmpeg-executable">ffmpeg</div>
              {argumentRows.map((row, index) => (
                <div className="ffmpeg-arg-row" key={`${index}-${row.flag ?? 'output'}`}>
                  <code className="ffmpeg-flag">{row.flag ?? 'output'}</code>
                  <code className="ffmpeg-value">{row.value || '—'}</code>
                </div>
              ))}
            </div>
          </details>
        )}
        {t.needsOverwriteConfirm && <div className="overwrite-warn">Output file already exists — converting will overwrite it.</div>}
        {t.status === 'error' && t.logTail.length > 0 && <div className="log error-log">{t.logTail.join('\n')}</div>}
      </div>
    </section>
  )
}

export const TaskDetails = memo(TaskDetailsInner)
export default memo(TaskCard)
