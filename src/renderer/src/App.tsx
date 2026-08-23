import { useEffect, useRef, useState } from 'react'
import type { Settings } from '@shared/settings'
import type { SystemStats } from '@shared/systemStats'
import SettingsModal from './SettingsModal'
import TaskPanel, { type TaskMeta } from './TaskPanel'
import { formatBytes } from './format'

interface Tab {
  id: string
  meta: TaskMeta
}

function newTaskId(): string {
  return crypto.randomUUID()
}

const STATUS_ICON: Record<TaskMeta['status'], string> = {
  idle: '',
  probing: '⋯',
  ready: '',
  converting: '●',
  done: '✓',
  error: '✗'
}

export default function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [tabs, setTabs] = useState<Tab[]>([
    { id: newTaskId(), meta: { title: 'New Task', status: 'idle', progress: null } }
  ])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const [stats, setStats] = useState<SystemStats | null>(null)
  // Initial input path per tab, keyed by tab id. Only read once, when a
  // TaskPanel first mounts — kept out of React state so it doesn't need to
  // survive re-renders as a dependency.
  const initialInputPaths = useRef(new Map<string, string>())

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  useEffect(() => window.api.onSystemStats(setStats), [])

  const updateMeta = (id: string, meta: TaskMeta): void => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, meta } : t)))
  }

  const handleAddTab = (): void => {
    const id = newTaskId()
    setTabs((prev) => [...prev, { id, meta: { title: 'New Task', status: 'idle', progress: null } }])
    setActiveTabId(id)
  }

  const handleCloseTab = (id: string): void => {
    if (tabs.length <= 1) return

    const closing = tabs.find((t) => t.id === id)
    if (closing?.meta.status === 'converting') {
      window.api.cancelConvert(id)
    }

    initialInputPaths.current.delete(id)

    const remaining = tabs.filter((t) => t.id !== id)
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id)
      const fallback = remaining[Math.max(0, idx - 1)] ?? remaining[0]
      setActiveTabId(fallback.id)
    }
    setTabs(remaining)
  }

  // Remote clients can act on the tab list too: creating a brand-new tab from
  // a file they picked via the server-side file browser, or closing one. When
  // a newTask command targets an existing (still empty) tab instead, TaskPanel's
  // own per-task listener handles it. A ref keeps this a one-time subscription
  // while still calling the latest handleCloseTab (which closes over tabs/activeTabId).
  const handleCloseTabRef = useRef(handleCloseTab)
  handleCloseTabRef.current = handleCloseTab

  useEffect(() => {
    return window.api.onServerCommand((cmd) => {
      if (cmd.type === 'newTask' && !cmd.taskId) {
        const id = newTaskId()
        initialInputPaths.current.set(id, cmd.inputPath)
        setTabs((prev) => [...prev, { id, meta: { title: 'New Task', status: 'idle', progress: null } }])
        setActiveTabId(id)
      } else if (cmd.type === 'closeTask') {
        handleCloseTabRef.current(cmd.taskId)
      }
    })
  }, [])

  if (!settings) {
    return (
      <div className="app">
        <div className="loading-screen">Loading…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>DnS Video Converter</h1>
        {stats && (
          <div className="system-stats" title="System CPU and network usage">
            <span>CPU {stats.cpuPercent.toFixed(0)}%</span>
            <span>
              ↓{formatBytes(stats.netRxBps)}/s ↑{formatBytes(stats.netTxBps)}/s
            </span>
          </div>
        )}
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙ Settings
        </button>
      </header>

      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab tab-status-${tab.meta.status} ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {STATUS_ICON[tab.meta.status] && (
              <span className={`tab-status tab-status-${tab.meta.status}`}>
                {STATUS_ICON[tab.meta.status]}
              </span>
            )}
            <span className="tab-title" title={tab.meta.title}>
              {tab.meta.title}
            </span>
            {tab.meta.status === 'converting' && (
              <div
                className="tab-progress"
                style={{ width: `${tab.meta.progress ?? 4}%` }}
              />
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseTab(tab.id)
                }}
                title="Close tab"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" className="tab-add" onClick={handleAddTab} title="New task">
          +
        </button>
      </div>

      <div className="tab-panels">
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === activeTabId ? '' : 'tab-panel-hidden'}>
            <TaskPanel
              taskId={tab.id}
              settings={settings}
              onMeta={(meta) => updateMeta(tab.id, meta)}
              initialInputPath={initialInputPaths.current.get(tab.id)}
            />
          </div>
        ))}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (next) => {
            const saved = await window.api.setSettings(next)
            setSettings(saved)
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}
