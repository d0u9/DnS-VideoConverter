import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry } from '@shared/remoteTypes'

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
}

function TreeNodes({ entries, depth, expanded, treeCache, onToggle, onFile }: TreeNodeProps): React.JSX.Element {
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
          </div>
        )
      })}
    </>
  )
}

export interface PendingFile {
  path: string
  taskId: string | null
}

export default function FileTree({
  targetTaskId,
  targetTaskTitle,
  onLoadFile,
  width,
  onWidthChange
}: {
  targetTaskId: string | null
  targetTaskTitle: string | null
  onLoadFile: (path: string, taskId: string | null) => void
  width: number
  onWidthChange: (w: number) => void
}): React.JSX.Element {
  const [rootEntries, setRootEntries] = useState<BrowseEntry[] | null>(null)
  const [treeCache, setTreeCache] = useState<Record<string, BrowseEntry[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState(false)
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
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
    setPendingFile({ path, taskId: targetTaskId })
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

  const handleConfirmLoad = (): void => {
    if (!pendingFile) return
    onLoadFile(pendingFile.path, pendingFile.taskId)
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
            />
          )}
        </div>
        {pendingFile && (
          <div className="confirm-bar">
            <div className="msg">
              Load <strong>{fileName}</strong> into{' '}
              {targetTaskId ? `"${targetTaskTitle}"` : 'a new task'}?
            </div>
            <div className="btn-row">
              <button className="primary" onClick={handleConfirmLoad}>
                Load
              </button>
              <button onClick={() => setPendingFile(null)}>Cancel</button>
            </div>
          </div>
        )}
      </aside>
      <div className="resize-handle" onMouseDown={handleResizeStart} />
    </>
  )
}
