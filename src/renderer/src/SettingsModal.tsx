import { useEffect, useState } from 'react'
import type { Settings } from '@shared/settings'

interface Props {
  settings: Settings
  onClose: () => void
  onSave: (next: Settings) => void
}

function BinaryField({
  label,
  value,
  onChange,
  onBrowse
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBrowse: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<'unknown' | 'checking' | 'ok' | 'fail'>('unknown')

  useEffect(() => {
    let cancelled = false
    setStatus('checking')
    const t = setTimeout(async () => {
      const ok = await window.api.checkBinary(value)
      if (!cancelled) setStatus(value.trim() ? (ok ? 'ok' : 'fail') : 'unknown')
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value])

  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <input
          type="text"
          value={value}
          placeholder={label === 'ffmpeg path' ? 'ffmpeg (or full path)' : 'ffprobe (or full path)'}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" onClick={onBrowse}>
          Browse…
        </button>
      </div>
      <div className={`status status-${status}`}>
        {status === 'checking' && 'Checking…'}
        {status === 'ok' && '✓ Found'}
        {status === 'fail' && '✗ Not runnable'}
        {status === 'unknown' && ' '}
      </div>
    </div>
  )
}

export default function SettingsModal({ settings, onClose, onSave }: Props): React.JSX.Element {
  const [ffmpegPath, setFfmpegPath] = useState(settings.ffmpegPath)
  const [ffprobePath, setFfprobePath] = useState(settings.ffprobePath)
  const [defaultCrf, setDefaultCrf] = useState(String(settings.defaultCrf))
  const [defaultResolution, setDefaultResolution] = useState(settings.defaultResolution)

  const handleSave = (): void => {
    const crfNum = Number(defaultCrf)
    onSave({
      ...settings,
      ffmpegPath: ffmpegPath.trim(),
      ffprobePath: ffprobePath.trim(),
      defaultCrf: Number.isFinite(crfNum) ? crfNum : settings.defaultCrf,
      defaultResolution
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <BinaryField
          label="ffmpeg path"
          value={ffmpegPath}
          onChange={setFfmpegPath}
          onBrowse={async () => {
            const p = await window.api.pickBinary('ffmpeg')
            if (p) setFfmpegPath(p)
          }}
        />

        <BinaryField
          label="ffprobe path"
          value={ffprobePath}
          onChange={setFfprobePath}
          onBrowse={async () => {
            const p = await window.api.pickBinary('ffprobe')
            if (p) setFfprobePath(p)
          }}
        />

        <div className="field">
          <label>Default CRF</label>
          <input
            type="text"
            value={defaultCrf}
            onChange={(e) => setDefaultCrf(e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>

        <div className="field">
          <label>Default resolution</label>
          <select value={defaultResolution} onChange={(e) => setDefaultResolution(e.target.value)}>
            <option value="original">Original</option>
            <option value="360p">360p</option>
            <option value="480p">480p</option>
            <option value="576p">576p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
            <option value="4k">4K (2160p)</option>
            <option value="8k">8K (4320p)</option>
          </select>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
