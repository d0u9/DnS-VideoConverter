import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from '@shared/format'
import { useRemoteConnection } from './useRemoteConnection'
import TaskCard, { TaskDetails } from './TaskCard'
import FileTree from './FileTree'
import type { RemoteTaskOptions } from '@shared/remoteTypes'

type Filter = 'all' | 'processing' | 'finished' | 'error'

export default function App(): React.JSX.Element {
  const { state, sendCmd } = useRemoteConnection()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [detailsHeight, setDetailsHeight] = useState(360)
  const selectNextCreatedTask = useRef(false)
  const previousOrder = useRef(state.order)
  const resizingDetails = useRef(false)

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

  const visibleIds = useMemo(
    () =>
      state.order.filter((id) => {
        const t = state.tasks[id]
        if (!t) return false
        if (filter === 'processing') return t.status === 'converting'
        if (filter === 'finished') return t.status === 'done'
        if (filter === 'error') return t.status === 'error'
        return true
      }),
    [filter, state.order, state.tasks]
  )

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
    (taskId: string): void => sendCmd({ type: 'closeTask', taskId }),
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
      if (!resizingDetails.current) return
      setDetailsHeight(Math.max(140, Math.min(window.innerHeight - 170, window.innerHeight - e.clientY)))
    }
    const onUp = (): void => { resizingDetails.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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

        <div className="task-grid">
          <div className="task-grid-head"><span>Name</span><span>Status</span><span>Conversion plan</span><span>Progress</span></div>
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
