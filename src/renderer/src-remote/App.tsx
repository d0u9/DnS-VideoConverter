import { useMemo, useState } from 'react'
import { formatBytes } from '@shared/format'
import { useRemoteConnection } from './useRemoteConnection'
import TaskCard, { isFinished } from './TaskCard'
import FileTree from './FileTree'

type Filter = 'all' | 'processing' | 'finished'

export default function App(): React.JSX.Element {
  const { state, sendCmd } = useRemoteConnection()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)

  const counts = useMemo(() => {
    const all = state.order.length
    let processing = 0
    let finished = 0
    for (const id of state.order) {
      const t = state.tasks[id]
      if (!t) continue
      if (t.status === 'converting') processing++
      if (isFinished(t)) finished++
    }
    return { all, processing, finished }
  }, [state.order, state.tasks])

  const visibleIds = state.order.filter((id) => {
    const t = state.tasks[id]
    if (!t) return false
    if (filter === 'processing') return t.status === 'converting'
    if (filter === 'finished') return isFinished(t)
    return true
  })

  const selectedTask = selectedTaskId ? state.tasks[selectedTaskId] : null
  const targetTaskId = selectedTask && !selectedTask.inputPath ? selectedTaskId : null
  const targetTaskTitle = targetTaskId ? (state.tasks[targetTaskId]?.title ?? null) : null

  const handleLoadFile = (path: string, taskId: string | null): void => {
    if (taskId) sendCmd({ type: 'newTask', inputPath: path, taskId })
    else sendCmd({ type: 'newTask', inputPath: path })
  }

  return (
    <div className="app-body">
      <FileTree
        targetTaskId={targetTaskId}
        targetTaskTitle={targetTaskTitle}
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
            Click a task to select it, then click a file on the left — you&apos;ll be asked to confirm before it&apos;s
            loaded in.
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
          </div>
        </div>

        <div className="main-scroll">
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
                onSelect={() => setSelectedTaskId(id)}
                onClose={() => sendCmd({ type: 'closeTask', taskId: id })}
                sendCmd={sendCmd}
              />
            )
          })}
        </div>
      </main>
    </div>
  )
}
