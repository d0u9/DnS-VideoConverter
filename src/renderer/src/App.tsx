import { useEffect, useState } from 'react'
import type { Settings } from '@shared/settings'
import SettingsModal from './SettingsModal'
import TaskPanel, { type TaskMeta } from './TaskPanel'

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

  const [tabs, setTabs] = useState<Tab[]>([{ id: newTaskId(), meta: { title: 'New Task', status: 'idle' } }])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  const updateMeta = (id: string, meta: TaskMeta): void => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, meta } : t)))
  }

  const handleAddTab = (): void => {
    const id = newTaskId()
    setTabs((prev) => [...prev, { id, meta: { title: 'New Task', status: 'idle' } }])
    setActiveTabId(id)
  }

  const handleCloseTab = (id: string): void => {
    if (tabs.length <= 1) return

    const closing = tabs.find((t) => t.id === id)
    if (closing?.meta.status === 'converting') {
      window.api.cancelConvert(id)
    }

    const remaining = tabs.filter((t) => t.id !== id)
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id)
      const fallback = remaining[Math.max(0, idx - 1)] ?? remaining[0]
      setActiveTabId(fallback.id)
    }
    setTabs(remaining)
  }

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
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙ Settings
        </button>
      </header>

      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
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
