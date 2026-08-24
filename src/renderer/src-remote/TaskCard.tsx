import { useEffect, useRef, useState } from 'react'
import type { RemoteCommand, RemoteTaskSnapshot } from '@shared/remoteTypes'

const RESOLUTIONS: [string, string][] = [
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
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  probing: 'Probing…',
  ready: 'Ready',
  converting: 'Converting',
  done: 'Done',
  error: 'Error'
}

export function isFinished(t: RemoteTaskSnapshot): boolean {
  return t.status === 'done' || (t.status === 'error' && !!t.resultText)
}

interface OptFields {
  crf: string
  resolution: string
  customRes: string
  forceReencode: boolean
}

export default function TaskCard({
  task: t,
  isSelected,
  onSelect,
  onClose,
  sendCmd
}: {
  task: RemoteTaskSnapshot
  isSelected: boolean
  onSelect: () => void
  onClose: () => void
  sendCmd: (cmd: RemoteCommand) => void
}): React.JSX.Element {
  // Expanded by default while still being configured (so CRF etc. are
  // reachable) or while something needs the user's attention; collapsed
  // once conversion is underway to save space, but with a compact
  // progress/cancel summary still visible. Always overridable by hand —
  // once the user picks, that choice sticks regardless of status changes.
  const defaultExpanded =
    !t.converting &&
    (t.needsOverwriteConfirm || t.status === 'idle' || t.status === 'ready' || t.status === 'probing' || isSelected)
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null)
  const isCollapsed = collapsedOverride !== null ? collapsedOverride : !defaultExpanded

  const [logOpen, setLogOpen] = useState(false)

  // Local editable copies of the server's option fields. Only resynced from
  // the server when the field isn't actively focused, so an in-flight edit
  // (or a background update for a DIFFERENT task) never clobbers what the
  // user is mid-typing — the exact bug the old hand-rolled version had.
  const [crf, setCrf] = useState(t.crf)
  const [customRes, setCustomRes] = useState(t.customRes)
  const [resolution, setResolution] = useState(t.resolution)
  const [forceReencode, setForceReencode] = useState(t.forceReencode)
  const crfFocused = useRef(false)
  const customResFocused = useRef(false)

  useEffect(() => {
    if (!crfFocused.current) setCrf(t.crf)
  }, [t.crf])
  useEffect(() => {
    if (!customResFocused.current) setCustomRes(t.customRes)
  }, [t.customRes])
  useEffect(() => setResolution(t.resolution), [t.resolution])
  useEffect(() => setForceReencode(t.forceReencode), [t.forceReencode])

  const commit = (overrides: Partial<OptFields> = {}): void => {
    sendCmd({
      type: 'setOptions',
      taskId: t.taskId,
      crf: overrides.crf ?? crf,
      resolution: overrides.resolution ?? resolution,
      customRes: overrides.customRes ?? customRes,
      forceReencode: overrides.forceReencode ?? forceReencode
    })
  }

  const pct = t.progressPercent != null ? t.progressPercent.toFixed(1) + '%' : t.converting ? '…' : ''
  const progressText = t.progressText || pct
  const convertDisabled = !t.canConvert || t.converting

  const optionsBody = (
    <div className="opts" onClick={(e) => e.stopPropagation()}>
      <label>
        CRF
        <input
          type="text"
          value={crf}
          onChange={(e) => setCrf(e.target.value)}
          onFocus={() => {
            crfFocused.current = true
          }}
          onBlur={() => {
            crfFocused.current = false
            commit({ crf })
          }}
        />
      </label>
      <label>
        Resolution
        <select
          value={resolution}
          onChange={(e) => {
            setResolution(e.target.value)
            commit({ resolution: e.target.value })
          }}
        >
          {RESOLUTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {resolution === 'custom' && (
        <label>
          Custom
          <input
            type="text"
            value={customRes}
            placeholder="1920x1080"
            onChange={(e) => setCustomRes(e.target.value)}
            onFocus={() => {
              customResFocused.current = true
            }}
            onBlur={() => {
              customResFocused.current = false
              commit({ customRes })
            }}
          />
        </label>
      )}
      {t.isHevc && (
        <label className="checkbox-opt">
          <input
            type="checkbox"
            checked={forceReencode}
            onChange={(e) => {
              setForceReencode(e.target.checked)
              commit({ forceReencode: e.target.checked })
            }}
          />
          Force re-encode
        </label>
      )}
    </div>
  )

  return (
    <div
      className={'task' + (isSelected ? ' selected' : '')}
      onClick={onSelect}
    >
      <div className="task-head">
        <button
          type="button"
          className="task-toggle"
          onClick={(e) => {
            e.stopPropagation()
            setCollapsedOverride(!isCollapsed)
          }}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
        <div className="task-title">{t.title}</div>
        {t.isHevc && t.forceReencode && (
          <span className="badge force" title="Re-encoding instead of stream-copying the already-HEVC source">
            Force
          </span>
        )}
        <span className={'badge ' + t.status}>{STATUS_LABEL[t.status] || t.status}</span>
        <button
          type="button"
          className="task-close"
          title="Close task"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Close "${t.title}"? This cannot be undone.`)) onClose()
          }}
        >
          ×
        </button>
      </div>

      {isCollapsed && t.converting && (
        <div className="collapsed-summary" onClick={(e) => e.stopPropagation()}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: (t.progressPercent || 0) + '%' }} />
          </div>
          <div className="collapsed-summary-row">
            <span className="meta-inline">{progressText}</span>
            <button
              type="button"
              className="danger small"
              onClick={() => sendCmd({ type: 'cancel', taskId: t.taskId })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="task-body">
          {t.detected && <div className="meta">{t.detected}</div>}
          {t.outputPath && <div className="meta">→ {t.outputPath}</div>}
          {t.planSummary && <div className="meta">{t.planSummary}</div>}
          {optionsBody}

          {t.converting && (
            <>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: (t.progressPercent || 0) + '%' }} />
              </div>
              <div className="meta">{progressText}</div>
            </>
          )}

          {t.resultText && (
            <div className={'result ' + (t.resultSuccess ? 'success' : 'failure')}>{t.resultText}</div>
          )}

          {t.needsOverwriteConfirm && (
            <div className="overwrite-warn">Output file already exists — converting will overwrite it.</div>
          )}

          <div className="actions" onClick={(e) => e.stopPropagation()}>
            {t.converting ? (
              <button className="danger" onClick={() => sendCmd({ type: 'cancel', taskId: t.taskId })}>
                Cancel
              </button>
            ) : t.needsOverwriteConfirm ? (
              <button
                className="danger"
                onClick={() => sendCmd({ type: 'convert', taskId: t.taskId, confirmOverwrite: true })}
              >
                Overwrite &amp; Convert
              </button>
            ) : (
              <button
                className="primary"
                disabled={convertDisabled}
                onClick={() => sendCmd({ type: 'convert', taskId: t.taskId })}
              >
                Convert
              </button>
            )}
          </div>

          {t.logTail.length > 0 && (
            <details open={logOpen} onToggle={(e) => setLogOpen(e.currentTarget.open)} onClick={(e) => e.stopPropagation()}>
              <summary>Log ({t.logTail.length} lines)</summary>
              <div className="log">{t.logTail.join('\n')}</div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
