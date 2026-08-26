import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatBytes } from '@shared/format'
import { useRemoteConnection } from './useRemoteConnection'
import TaskCard, { TaskDetails } from './TaskCard'
import FileTree from './FileTree'
import type { RemoteTaskOptions } from '@shared/remoteTypes'

type Filter = 'all' | 'processing' | 'finished' | 'error'
type SortKey = 'name' | 'status' | 'plan' | 'progress'
type SortDirection = 'asc' | 'desc'

const COLUMN_MIN_WIDTHS = [160, 90, 180, 110]
const COLUMN_LABELS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'plan', label: 'Conversion plan' },
  { key: 'progress', label: 'Progress' }
]

export default function App(): React.JSX.Element {
  const { state, sendCmd } = useRemoteConnection()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [detailsHeight, setDetailsHeight] = useState(360)
  const [columnWidths, setColumnWidths] = useState([320, 120, 420, 150])
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' })
  const selectNextCreatedTask = useRef(false)
  const previousOrder = useRef(state.order)
  const resizingDetails = useRef(false)
  const resizingColumn = useRef<{ index: number; startX: number; startWidth: number } | null>(null)

  const counts = useMemo(() => {
    const all = state.order.length
    let processing = 0
    let finished = 0
    let error = 0
    for (const id of state.order) {
      const t = state.tasks[id]
      if (!t) continue
      if (t.status === 'converting') processing++
      if (t.status === 'done') finished++
      if (t.status === 'error') error++
    }
    return { all, processing, finished, error }
  }, [state.order, state.tasks])

  const visibleIds = useMemo(() => {
    const ids = state.order.filter((id) => {
        const t = state.tasks[id]
        if (!t) return false
        if (filter === 'processing') return t.status === 'converting'
        if (filter === 'finished') return t.status === 'done'
        if (filter === 'error') return t.status === 'error'
        return true
      })
    const direction = sort.direction === 'asc' ? 1 : -1
    return ids.sort((a, b) => {
      const left = state.tasks[a]
      const right = state.tasks[b]
      if (!left || !right) return 0
      let comparison = 0
      if (sort.key === 'name') comparison = left.title.localeCompare(right.title, undefined, { numeric: true })
      else if (sort.key === 'status') comparison = left.status.localeCompare(right.status)
      else if (sort.key === 'plan') comparison = (left.planSummary ?? '').localeCompare(right.planSummary ?? '')
      else comparison = (left.progressPercent ?? (left.status === 'done' ? 100 : -1)) - (right.progressPercent ?? (right.status === 'done' ? 100 : -1))
      return comparison === 0 ? state.order.indexOf(a) - state.order.indexOf(b) : comparison * direction
    })
  }, [filter, sort, state.order, state.tasks])

  const selectedTask = selectedTaskId ? state.tasks[selectedTaskId] : null
  const handleLoadFile = useCallback((path: string, options: RemoteTaskOptions, startImmediately: boolean): void => {
    // File-tree additions always create a new task. Existing tasks are edited
    // and re-run from Details, avoiding accidental replacement of a selection.
    selectNextCreatedTask.current = true
    sendCmd({ type: 'newTask', inputPath: path, startImmediately, ...options })
  }, [sendCmd])
  const handleSelectTask = useCallback((taskId: string): void => {
    setSelectedTaskId(taskId)
  }, [])
  const handleCloseTask = useCallback(
    (taskId: string): void => {
      sendCmd({ type: 'closeTask', taskId })
    },
    [sendCmd]
  )

  useEffect(() => {
    const oldIds = new Set(previousOrder.current)
    if (selectNextCreatedTask.current) {
      const createdId = state.order.find((id) => !oldIds.has(id))
      if (createdId) {
        setSelectedTaskId(createdId)
        selectNextCreatedTask.current = false
      }
    } else if (!selectedTaskId && state.order.length > 0) {
      setSelectedTaskId(state.order[state.order.length - 1])
    }
    previousOrder.current = state.order
  }, [selectedTaskId, state.order])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const column = resizingColumn.current
      if (column) {
        const width = Math.max(COLUMN_MIN_WIDTHS[column.index], column.startWidth + e.clientX - column.startX)
        setColumnWidths((current) => current.map((value, index) => index === column.index ? width : value))
      }
      if (!resizingDetails.current) return
      setDetailsHeight(Math.max(140, Math.min(window.innerHeight - 170, window.innerHeight - e.clientY)))
    }
    const onUp = (): void => {
      resizingDetails.current = false
      resizingColumn.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const toggleSort = (key: SortKey): void => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
  }

  const taskGridStyle = {
    '--task-columns': columnWidths.map((width) => `${width}px`).join(' '),
    // Three 12px column gaps plus 24px horizontal row padding.
    '--task-grid-width': `${columnWidths.reduce((sum, width) => sum + width, 0) + 60}px`
  } as CSSProperties

  return (
    <div className="app-body">
      <FileTree
        onLoadFile={handleLoadFile}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      <main className="main-col">
        <div className="main-header">
          <div className="top-row">
            <div>
              <h1>
                DnS Video Converter — Remote
                {state.appVersion && <span className="app-version">v{state.appVersion}</span>}
              </h1>
              <div className={'conn' + (state.connected ? '' : ' offline')}>
                {state.connected ? 'Connected' : 'Disconnected — retrying…'}
              </div>
            </div>
            {state.stats && (
              <div className="stats">
                <span>CPU {state.stats.cpuPercent.toFixed(0)}%</span>
                <span>
                  ↓{formatBytes(state.stats.netRxBps)}/s ↑{formatBytes(state.stats.netTxBps)}/s
                </span>
              </div>
            )}
          </div>
          <div className="hint">
            Choose a video from the file tree, configure it, then add and start the task.
          </div>
          <div className="filters">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              All ({counts.all})
            </button>
            <button className={filter === 'processing' ? 'active' : ''} onClick={() => setFilter('processing')}>
              Processing ({counts.processing})
            </button>
            <button className={filter === 'finished' ? 'active' : ''} onClick={() => setFilter('finished')}>
              Finished ({counts.finished})
            </button>
            <button className={filter === 'error' ? 'active error-filter' : 'error-filter'} onClick={() => setFilter('error')}>
              Error ({counts.error})
            </button>
          </div>
        </div>

        <div className="task-grid" style={taskGridStyle}>
          <div className="task-grid-head">
            {COLUMN_LABELS.map((column, index) => (
              <div className="column-head" key={column.key} aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => toggleSort(column.key)}>
                  {column.label}<span className="sort-arrow">{sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}</span>
                </button>
                <span
                  className="column-resizer"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    resizingColumn.current = { index, startX: e.clientX, startWidth: columnWidths[index] }
                  }}
                />
              </div>
            ))}
          </div>
          <div className="task-grid-body">
          {state.order.length === 0 && <div className="empty">No tasks yet.</div>}
          {state.order.length > 0 && visibleIds.length === 0 && <div className="empty">No {filter} tasks.</div>}
          {visibleIds.map((id) => {
            const t = state.tasks[id]
            if (!t) return null
            return (
              <TaskCard
                key={id}
                task={t}
                isSelected={id === selectedTaskId}
                onSelect={handleSelectTask}
                sendCmd={sendCmd}
              />
            )
          })}
          </div>
        </div>
        <div className="details-pane" style={{ height: detailsHeight }}>
          <div className="details-resize" title="Drag to resize details" onMouseDown={(e) => { resizingDetails.current = true; e.preventDefault() }} />
          {selectedTask ? (
            <TaskDetails task={selectedTask} sendCmd={sendCmd} onClose={handleCloseTask} />
          ) : (
            <div className="details-empty">Select a task to view details, or choose a file to create a new task.</div>
          )}
        </div>
      </main>
    </div>
  )
}
