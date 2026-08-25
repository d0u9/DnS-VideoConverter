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

export function isFinished(t: RemoteTaskSnapshot): boolean {
  return t.status === 'done' || (t.status === 'error' && !!t.resultText)
}

function TaskCard({ task: t, isSelected, onSelect }: {
  task: RemoteTaskSnapshot
  isSelected: boolean
  onSelect: (taskId: string) => void
  sendCmd: (cmd: RemoteCommand) => void
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
  sendCmd: (cmd: RemoteCommand) => void
  onClose: (taskId: string) => void
}): React.JSX.Element {
  const [crf, setCrf] = useState(t.crf)
  const [customRes, setCustomRes] = useState(t.customRes)
  const [resolution, setResolution] = useState(t.resolution)
  const [forceReencode, setForceReencode] = useState(t.forceReencode)
  const [commandPending, setCommandPending] = useState(false)
  const crfFocused = useRef(false)
  const customResFocused = useRef(false)

  useEffect(() => { if (!crfFocused.current) setCrf(t.crf) }, [t.crf])
  useEffect(() => { if (!customResFocused.current) setCustomRes(t.customRes) }, [t.customRes])
  useEffect(() => setResolution(t.resolution), [t.resolution])
  useEffect(() => setForceReencode(t.forceReencode), [t.forceReencode])
  useEffect(() => {
    if (t.converting || t.needsOverwriteConfirm || t.status === 'error' || !t.canConvert) setCommandPending(false)
  }, [t.canConvert, t.converting, t.needsOverwriteConfirm, t.status])

  const commit = (options: Omit<Extract<RemoteCommand, { type: 'setOptions' }>, 'type' | 'taskId'>): void => {
    sendCmd({ type: 'setOptions', taskId: t.taskId, ...options })
  }
  const progressText = t.progressText || (t.progressPercent != null ? `${t.progressPercent.toFixed(1)}%` : 'Starting…')
  const startCommand = (confirmOverwrite = false): void => {
    setCommandPending(true)
    sendCmd({ type: 'convert', taskId: t.taskId, confirmOverwrite, crf, resolution, customRes, forceReencode })
  }

  return (
    <section className="task-details">
      <div className="details-tabs"><span className="active">Details</span>{t.status === 'error' && t.logTail.length > 0 && <span>Error log</span>}</div>
      <div className="details-content">
        <div className="details-summary"><h2>{t.title}</h2>{t.detected && <div className="meta">{t.detected}</div>}{t.outputPath && <div className="meta">Output: {t.outputPath}</div>}{t.planSummary && <div className="meta">{t.planSummary}</div>}{t.resultText && <div className={'result ' + (t.resultSuccess ? 'success' : 'failure')}>{t.resultText}</div>}</div>
        <div className="actions details-actions">
          {t.converting ? <button className="danger" onClick={() => sendCmd({ type: 'cancel', taskId: t.taskId })}>Cancel</button> : t.needsOverwriteConfirm ? <button className="danger" disabled={commandPending} onClick={() => startCommand(true)}>{commandPending ? 'Starting…' : 'Overwrite & Convert'}</button> : <button className="primary" disabled={!t.canConvert || commandPending} onClick={() => startCommand()}>{commandPending ? 'Starting…' : isFinished(t) ? 'Convert again' : 'Convert'}</button>}
          <button onClick={() => { if (confirm(`Close "${t.title}"? This cannot be undone.`)) onClose(t.taskId) }}>Remove</button>
        </div>
        <div className="opts">
          <label>CRF<input type="text" value={crf} onChange={(e) => setCrf(e.target.value)} onFocus={() => { crfFocused.current = true }} onBlur={() => { crfFocused.current = false; commit({ crf }) }} /></label>
          <label>Resolution<select value={resolution} onChange={(e) => { setResolution(e.target.value); commit({ resolution: e.target.value }) }}>{RESOLUTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {resolution === 'custom' && <label>Custom<input type="text" value={customRes} placeholder="1920x1080" onChange={(e) => setCustomRes(e.target.value)} onFocus={() => { customResFocused.current = true }} onBlur={() => { customResFocused.current = false; commit({ customRes }) }} /></label>}
          {t.isHevc && <label className="checkbox-opt"><input type="checkbox" checked={forceReencode} onChange={(e) => { setForceReencode(e.target.checked); commit({ forceReencode: e.target.checked }) }} />Force re-encode</label>}
        </div>
        {t.converting && <><div className="progress-track"><div className="progress-fill" style={{ width: `${t.progressPercent || 0}%` }} /></div><div className="meta">{progressText}</div></>}
        {t.needsOverwriteConfirm && <div className="overwrite-warn">Output file already exists — converting will overwrite it.</div>}
        {t.status === 'error' && t.logTail.length > 0 && <div className="log error-log">{t.logTail.join('\n')}</div>}
      </div>
    </section>
  )
}

export const TaskDetails = memo(TaskDetailsInner)
export default memo(TaskCard)
