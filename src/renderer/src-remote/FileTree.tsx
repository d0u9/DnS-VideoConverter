import { memo, useEffect, useRef, useState } from 'react'
import type { BrowseEntry, RemoteTaskOptions } from '@shared/remoteTypes'

const RESOLUTIONS = [
  ['original', 'Original'], ['360p', '360p'], ['480p', '480p'], ['576p', '576p'],
  ['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K (2160p)'],
  ['8k', '8K (4320p)'], ['custom', 'Custom…']
] as const

async function browse(path?: string): Promise<{ entries: BrowseEntry[]; error?: string }> {
  const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse'
  const res = await fetch(url)
  const data = await res.json()
  return { entries: data.entries || [], error: data.error }
}

interface TreeNodeProps {
  entries: BrowseEntry[]
  depth: number
  expanded: Record<string, boolean>
  treeCache: Record<string, BrowseEntry[]>
  onToggle: (path: string) => void
  onFile: (path: string) => void
  onRename: (entry: BrowseEntry) => void
}

function TreeNodes({ entries, depth, expanded, treeCache, onToggle, onFile, onRename }: TreeNodeProps): React.JSX.Element {
  return (
    <>
      {entries.map((e) => {
        const pad = depth * 16 + 8
        if (e.isDir) {
          const isOpen = !!expanded[e.path]
          return (
            <div key={e.path}>
              <div
                className="tree-row"
                style={{ paddingLeft: pad }}
                onClick={() => onToggle(e.path)}
              >
                <span className="arrow">{isOpen ? '▾' : '▸'}</span>
                <span className="icon">📁</span>
                <span className="name">{e.name}</span>
              </div>
              {isOpen && treeCache[e.path] && (
                <TreeNodes
                  entries={treeCache[e.path]}
                  depth={depth + 1}
                  expanded={expanded}
                  treeCache={treeCache}
                  onToggle={onToggle}
                  onFile={onFile}
                  onRename={onRename}
                />
              )}
            </div>
          )
        }
        return (
          <div key={e.path} className="tree-row" style={{ paddingLeft: pad }} onClick={() => onFile(e.path)}>
            <span className="arrow" />
            <span className="icon">🎬</span>
            <span className="name">{e.name}</span>
            <button className="tree-rename" title="Rename" onClick={(event) => { event.stopPropagation(); onRename(e) }}>✎</button>
          </div>
        )
      })}
    </>
  )
}

export interface PendingFile {
  path: string
}

function FileTree({
  onLoadFile,
  width,
  onWidthChange
}: {
  onLoadFile: (path: string, options: RemoteTaskOptions, startImmediately: boolean) => void
  width: number
  onWidthChange: (w: number) => void
}): React.JSX.Element {
  const [rootEntries, setRootEntries] = useState<BrowseEntry[] | null>(null)
  const [treeCache, setTreeCache] = useState<Record<string, BrowseEntry[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState(false)
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [renameEntry, setRenameEntry] = useState<BrowseEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [crf, setCrf] = useState('24')
  const [resolution, setResolution] = useState('original')
  const [customRes, setCustomRes] = useState('1920x1080')
  const [forceReencode, setForceReencode] = useState(false)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    browse()
      .then(({ entries }) => setRootEntries(entries))
      .catch(() => setLoadError(true))
  }, [])

  const handleToggle = (path: string): void => {
    if (expanded[path]) {
      setExpanded((e) => ({ ...e, [path]: false }))
      return
    }
    if (treeCache[path]) {
      setExpanded((e) => ({ ...e, [path]: true }))
      return
    }
    browse(path).then(({ entries, error }) => {
      if (error) {
        alert(error)
        return
      }
      setTreeCache((c) => ({ ...c, [path]: entries }))
      setExpanded((e) => ({ ...e, [path]: true }))
    })
  }

  const handleFile = (path: string): void => {
    setPendingFile({ path })
  }

  const beginRename = (entry: BrowseEntry): void => {
    setRenameEntry(entry)
    setRenameValue(entry.name)
    setRenameError(null)
  }

  const handleRename = async (): Promise<void> => {
    if (!renameEntry || renaming) return
    setRenaming(true)
    setRenameError(null)
    try {
      const response = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: renameEntry.path, newName: renameValue })
      })
      const data = await response.json() as { entry?: BrowseEntry; error?: string }
      if (!response.ok || !data.entry) {
        setRenameError(data.error ?? 'Rename failed.')
        return
      }
      const replaceEntry = (entries: BrowseEntry[]): BrowseEntry[] =>
        entries.map((entry) => entry.path === renameEntry.path ? data.entry! : entry)
          .sort((a, b) => a.name.localeCompare(b.name))
      setRootEntries((entries) => entries ? replaceEntry(entries) : entries)
      setTreeCache((cache) => Object.fromEntries(Object.entries(cache).map(([key, entries]) => [key, replaceEntry(entries)])))
      setRenameEntry(null)
    } catch {
      setRenameError('Could not contact the desktop app.')
    } finally {
      setRenaming(false)
    }
  }

  const handleRefresh = (): void => {
    setSpinning(false)
    // restart the animation on repeated clicks
    requestAnimationFrame(() => setSpinning(true))
    const expandedPaths = Object.keys(expanded).filter((p) => expanded[p])
    setTreeCache({})
    browse()
      .then(async ({ entries }) => {
        setRootEntries(entries)
        const next: Record<string, BrowseEntry[]> = {}
        const stillExpanded: Record<string, boolean> = {}
        await Promise.all(
          expandedPaths.map(async (p) => {
            const res = await browse(p)
            if (res.error) return
            next[p] = res.entries
            stillExpanded[p] = true
          })
        )
        setTreeCache(next)
        setExpanded(stillExpanded)
      })
      .catch(() => setLoadError(true))
  }

  const handleConfirmLoad = (startImmediately: boolean): void => {
    if (!pendingFile) return
    onLoadFile(pendingFile.path, { crf, resolution, customRes, forceReencode }, startImmediately)
    setPendingFile(null)
  }

  const dragging = useRef(false)
  const handleResizeStart = (e: React.MouseEvent): void => {
    dragging.current = true
    e.preventDefault()
  }
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      onWidthChange(Math.max(160, Math.min(500, e.clientX)))
    }
    const onUp = (): void => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onWidthChange])

  const fileName = pendingFile?.path.split(/[\\/]/).pop()

  return (
    <>
      <aside className="tree-sidebar" style={{ width }}>
        <div className="tree-sidebar-head">
          <span>Files</span>
          <button
            type="button"
            className={'tree-refresh' + (spinning ? ' spinning' : '')}
            title="Refresh"
            onClick={handleRefresh}
            onAnimationEnd={() => setSpinning(false)}
          >
            ⟳
          </button>
        </div>
        <div className="tree-container">
          {loadError && <div className="tree-empty">Could not load folders.</div>}
          {!loadError && rootEntries && rootEntries.length === 0 && (
            <div className="tree-empty">No folders configured. Add some in Settings on the desktop app.</div>
          )}
          {!loadError && rootEntries && rootEntries.length > 0 && (
            <TreeNodes
              entries={rootEntries}
              depth={0}
              expanded={expanded}
              treeCache={treeCache}
              onToggle={handleToggle}
              onFile={handleFile}
              onRename={beginRename}
            />
          )}
        </div>
      </aside>
      <div className="resize-handle" onMouseDown={handleResizeStart} />
      {pendingFile && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingFile(null) }}>
          <div className="add-task-modal" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
            <div className="modal-head">
              <h2 id="add-task-title">Add task</h2>
              <button className="modal-close" onClick={() => setPendingFile(null)} aria-label="Close">×</button>
            </div>
            <div className="selected-file"><span>Video</span><strong title={pendingFile.path}>{fileName}</strong><small>{pendingFile.path}</small></div>
            <div className="modal-fields">
              <label>CRF<input autoFocus type="text" value={crf} onChange={(e) => setCrf(e.target.value)} /></label>
              <label>Resolution<select value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {resolution === 'custom' && <label>Custom max size<input type="text" value={customRes} onChange={(e) => setCustomRes(e.target.value)} placeholder="1920x1080" /></label>}
              <label className="modal-checkbox"><input type="checkbox" checked={forceReencode} onChange={(e) => setForceReencode(e.target.checked)} />Force video re-encode</label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setPendingFile(null)}>Cancel</button>
              <button disabled={!crf.trim() || (resolution === 'custom' && !customRes.trim())} onClick={() => handleConfirmLoad(false)}>Add</button>
              <button className="primary" disabled={!crf.trim() || (resolution === 'custom' && !customRes.trim())} onClick={() => handleConfirmLoad(true)}>Add &amp; Convert</button>
            </div>
          </div>
        </div>
      )}
      {renameEntry && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !renaming) setRenameEntry(null) }}>
          <div className="rename-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <div className="modal-head"><h2 id="rename-title">Rename video</h2><button className="modal-close" disabled={renaming} onClick={() => setRenameEntry(null)} aria-label="Close">×</button></div>
            <div className="rename-body">
              <label>File name<input autoFocus type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void handleRename() }} /></label>
              {renameError && <div className="rename-error">{renameError}</div>}
            </div>
            <div className="modal-actions"><button disabled={renaming} onClick={() => setRenameEntry(null)}>Cancel</button><button className="primary" disabled={renaming || !renameValue.trim()} onClick={() => void handleRename()}>{renaming ? 'Renaming…' : 'Rename'}</button></div>
          </div>
        </div>
      )}
    </>
  )
}

export default memo(FileTree)
