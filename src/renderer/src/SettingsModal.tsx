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

function BrowseRootsField({
  roots,
  onChange
}: {
  roots: string[]
  onChange: (roots: string[]) => void
}): React.JSX.Element {
  const handleAdd = async (): Promise<void> => {
    const p = await window.api.selectFolder()
    if (p && !roots.includes(p)) onChange([...roots, p])
  }

  const handleRemove = (root: string): void => {
    onChange(roots.filter((r) => r !== root))
  }

  return (
    <div className="field">
      <label>Remote file browser — folders it&apos;s allowed to look inside</label>
      {roots.length === 0 && <div className="muted" style={{ marginBottom: 6 }}>No folders configured.</div>}
      {roots.map((root) => (
        <div className="row" key={root} style={{ marginBottom: 6 }}>
          <input type="text" value={root} readOnly />
          <button type="button" onClick={() => handleRemove(root)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAdd}>
        Add folder…
      </button>
    </div>
  )
}

function RemoteServerField({
  port,
  onPortChange
}: {
  port: string
  onPortChange: (port: string) => void
}): React.JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [portError, setPortError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getRemoteServerStatus().then((status) => {
      setEnabled(status.enabled)
      setUrl(status.url)
    })
  }, [])

  const handleToggle = async (checked: boolean): Promise<void> => {
    setBusy(true)
    const status = await window.api.setRemoteServerEnabled(checked)
    setEnabled(status.enabled)
    setUrl(status.url)
    setBusy(false)
  }

  const handlePortBlur = async (): Promise<void> => {
    const n = Number(port.trim())
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setPortError('Enter a port number between 1 and 65535.')
      return
    }
    setPortError(null)
    await window.api.setSettings({ remoteServerPort: n })
    // Restart on the new port immediately if the server is already running.
    if (enabled) await handleToggle(true)
  }

  return (
    <div className="field checkbox-field">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        Enable remote web viewer (view &amp; control from another device on your network)
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Port
          <input
            type="text"
            value={port}
            onChange={(e) => onPortChange(e.target.value)}
            onBlur={handlePortBlur}
            style={{ maxWidth: 90 }}
          />
        </label>
      </div>
      {portError && <div className="status status-fail">{portError}</div>}
      {enabled && url && (
        <div className="status status-ok" style={{ marginTop: 6 }}>
          Open {url} on another device. Anyone on your network can reach it — no password.
        </div>
      )}
    </div>
  )
}

export default function SettingsModal({ settings, onClose, onSave }: Props): React.JSX.Element {
  const [ffmpegPath, setFfmpegPath] = useState(settings.ffmpegPath)
  const [ffprobePath, setFfprobePath] = useState(settings.ffprobePath)
  const [defaultCrf, setDefaultCrf] = useState(String(settings.defaultCrf))
  const [defaultResolution, setDefaultResolution] = useState(settings.defaultResolution)
  const [remoteBrowseRoots, setRemoteBrowseRoots] = useState(settings.remoteBrowseRoots)
  const [remoteServerPort, setRemoteServerPort] = useState(String(settings.remoteServerPort))

  const handleSave = (): void => {
    const crfNum = Number(defaultCrf)
    const portNum = Number(remoteServerPort.trim())
    const validPort = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535
    onSave({
      ...settings,
      ffmpegPath: ffmpegPath.trim(),
      ffprobePath: ffprobePath.trim(),
      defaultCrf: Number.isFinite(crfNum) ? crfNum : settings.defaultCrf,
      defaultResolution,
      remoteBrowseRoots,
      remoteServerPort: validPort ? portNum : settings.remoteServerPort
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

        <BrowseRootsField roots={remoteBrowseRoots} onChange={setRemoteBrowseRoots} />

        <RemoteServerField port={remoteServerPort} onPortChange={setRemoteServerPort} />

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
